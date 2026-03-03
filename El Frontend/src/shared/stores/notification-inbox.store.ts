/**
 * Notification Inbox Store
 *
 * Persistent notification inbox with WebSocket real-time updates.
 * SEPARATE from notification.store.ts which handles transient toasts.
 *
 * Data flow:
 * - Initial load: REST API → notifications[] + unreadCount
 * - Real-time: WS notification_new → unshift to list
 * - Real-time: WS notification_updated → update item in list
 * - Real-time: WS notification_unread_count → update badge count
 *
 * Cross-store: esp.store.ts WS-Dispatcher delegates 3 events here.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  notificationsApi,
  type AlertStatus,
  type NotificationDTO,
  type NotificationSeverity,
  type NotificationListFilters,
} from '@/api/notifications'
import { createLogger } from '@/utils/logger'

const logger = createLogger('NotificationInboxStore')

/** Filter tabs in the drawer */
export type InboxFilter = 'all' | 'critical' | 'warning' | 'system'

/** Severity priority for sorting (lower = higher priority, ISA-18.2: 3 levels) */
const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

/** Max items to load per page */
const PAGE_SIZE = 50

export const useNotificationInboxStore = defineStore('notification-inbox', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════════════════════════════════════

  const notifications = ref<NotificationDTO[]>([])
  const unreadCount = ref(0)
  const highestSeverity = ref<NotificationSeverity | null>(null)
  const isDrawerOpen = ref(false)
  const isPreferencesOpen = ref(false)
  const activeFilter = ref<InboxFilter>('all')
  const isLoading = ref(false)
  const hasMore = ref(true)
  const currentPage = ref(1)
  const totalItems = ref(0)

  // ═══════════════════════════════════════════════════════════════════════════
  // Computed
  // ═══════════════════════════════════════════════════════════════════════════

  /** Filtered notifications based on active tab */
  const filteredNotifications = computed(() => {
    if (activeFilter.value === 'all') return notifications.value

    return notifications.value.filter((n) => {
      switch (activeFilter.value) {
        case 'critical':
          return n.severity === 'critical'
        case 'warning':
          return n.severity === 'warning'
        case 'system':
          return n.severity === 'info'
        default:
          return true
      }
    })
  })

  /** Group notifications by date (Heute / Gestern / Älter) */
  const groupedNotifications = computed(() => {
    const groups: { label: string; items: NotificationDTO[] }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const todayItems: NotificationDTO[] = []
    const yesterdayItems: NotificationDTO[] = []
    const olderItems: NotificationDTO[] = []

    for (const n of filteredNotifications.value) {
      const date = n.created_at ? new Date(n.created_at) : new Date(0)
      if (date >= today) {
        todayItems.push(n)
      } else if (date >= yesterday) {
        yesterdayItems.push(n)
      } else {
        olderItems.push(n)
      }
    }

    if (todayItems.length > 0) groups.push({ label: 'Heute', items: todayItems })
    if (yesterdayItems.length > 0) groups.push({ label: 'Gestern', items: yesterdayItems })
    if (olderItems.length > 0) groups.push({ label: 'Älter', items: olderItems })

    return groups
  })

  /** Badge display string */
  const badgeText = computed(() => {
    if (unreadCount.value <= 0) return ''
    if (unreadCount.value > 99) return '99+'
    return String(unreadCount.value)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initial load: Fetch first page of notifications + unread count.
   * Called once on app start.
   */
  async function loadInitial(): Promise<void> {
    if (isLoading.value) return
    isLoading.value = true

    try {
      const [listRes, countRes] = await Promise.all([
        notificationsApi.list({ page: 1, page_size: PAGE_SIZE }),
        notificationsApi.getUnreadCount(),
      ])

      notifications.value = listRes.data
      totalItems.value = listRes.pagination.total_items
      currentPage.value = 1
      hasMore.value = listRes.data.length < listRes.pagination.total_items

      unreadCount.value = countRes.unread_count
      highestSeverity.value = countRes.highest_severity

      logger.info(
        `Loaded ${listRes.data.length} notifications, ${countRes.unread_count} unread`,
      )
    } catch (err) {
      logger.error('Failed to load notifications', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Load next page (lazy loading).
   */
  async function loadMore(): Promise<void> {
    if (isLoading.value || !hasMore.value) return
    isLoading.value = true

    try {
      const nextPage = currentPage.value + 1
      const filters: NotificationListFilters = {
        page: nextPage,
        page_size: PAGE_SIZE,
      }

      const res = await notificationsApi.list(filters)
      notifications.value.push(...res.data)
      currentPage.value = nextPage
      hasMore.value = notifications.value.length < res.pagination.total_items

      logger.debug(`Loaded page ${nextPage}, total items: ${notifications.value.length}`)
    } catch (err) {
      logger.error('Failed to load more notifications', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Mark a single notification as read.
   */
  async function markAsRead(id: string): Promise<void> {
    try {
      await notificationsApi.markRead(id)

      // Optimistic update
      const idx = notifications.value.findIndex((n) => n.id === id)
      if (idx >= 0 && !notifications.value[idx].is_read) {
        notifications.value[idx].is_read = true
        notifications.value[idx].read_at = new Date().toISOString()
        // Count will be updated via WS notification_unread_count
      }
    } catch (err) {
      logger.error(`Failed to mark notification ${id} as read`, err)
    }
  }

  /**
   * Mark all notifications as read.
   */
  async function markAllAsRead(): Promise<void> {
    try {
      await notificationsApi.markAllRead()

      // Optimistic update
      const now = new Date().toISOString()
      for (const n of notifications.value) {
        if (!n.is_read) {
          n.is_read = true
          n.read_at = now
        }
      }
      // Count will be updated via WS notification_unread_count
    } catch (err) {
      logger.error('Failed to mark all as read', err)
    }
  }

  /**
   * Toggle drawer open/closed.
   */
  function toggleDrawer(): void {
    isDrawerOpen.value = !isDrawerOpen.value
  }

  /**
   * Open preferences panel.
   */
  function openPreferences(): void {
    isPreferencesOpen.value = true
  }

  /**
   * Close preferences panel.
   */
  function closePreferences(): void {
    isPreferencesOpen.value = false
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WebSocket Handlers (called from esp.store.ts dispatcher)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle notification_new WS event.
   * Adds new notification at the top of the list.
   */
  function handleWSNotificationNew(data: Record<string, unknown>): void {
    const notification: NotificationDTO = {
      id: data.id as string,
      user_id: data.user_id as number,
      channel: (data.channel as string) || 'websocket',
      severity: data.severity as NotificationSeverity,
      category: data.category as string as NotificationDTO['category'],
      title: data.title as string,
      body: (data.body as string) || null,
      metadata: (data.metadata as Record<string, unknown>) || {},
      source: data.source as string as NotificationDTO['source'],
      is_read: (data.is_read as boolean) || false,
      is_archived: false,
      digest_sent: false,
      parent_notification_id: (data.parent_notification_id as string) || null,
      fingerprint: (data.fingerprint as string) || null,
      created_at: (data.created_at as string) || new Date().toISOString(),
      updated_at: null,
      read_at: null,
      // Phase 4B: Alert lifecycle fields
      status: (data.status as AlertStatus) || 'active',
      acknowledged_at: (data.acknowledged_at as string) || null,
      acknowledged_by: (data.acknowledged_by as number) || null,
      resolved_at: (data.resolved_at as string) || null,
      correlation_id: (data.correlation_id as string) || null,
    }

    // Deduplicate: don't add if already in list
    if (notifications.value.some((n) => n.id === notification.id)) return

    notifications.value.unshift(notification)
    unreadCount.value++
    totalItems.value++

    // Update highest severity
    if (
      !highestSeverity.value ||
      SEVERITY_PRIORITY[notification.severity] <
        SEVERITY_PRIORITY[highestSeverity.value]
    ) {
      highestSeverity.value = notification.severity
    }

    // Browser notification for critical
    if (notification.severity === 'critical') {
      showBrowserNotification(notification)
    }

    logger.debug(`WS notification_new: ${notification.title}`)
  }

  /**
   * Handle notification_updated WS event.
   * Updates existing notification (e.g., after mark-as-read).
   */
  function handleWSNotificationUpdated(data: Record<string, unknown>): void {
    const id = data.id as string
    const idx = notifications.value.findIndex((n) => n.id === id)
    if (idx < 0) return

    if (data.is_read !== undefined) {
      notifications.value[idx].is_read = data.is_read as boolean
    }
    if (data.is_archived !== undefined) {
      notifications.value[idx].is_archived = data.is_archived as boolean
    }
    if (data.read_at !== undefined) {
      notifications.value[idx].read_at = data.read_at as string | null
    }
    // Phase 4B: Alert lifecycle fields
    if (data.status !== undefined) {
      notifications.value[idx].status = data.status as AlertStatus
    }
    if (data.acknowledged_at !== undefined) {
      notifications.value[idx].acknowledged_at = data.acknowledged_at as string | null
    }
    if (data.acknowledged_by !== undefined) {
      notifications.value[idx].acknowledged_by = data.acknowledged_by as number | null
    }
    if (data.resolved_at !== undefined) {
      notifications.value[idx].resolved_at = data.resolved_at as string | null
    }

    logger.debug(`WS notification_updated: ${id}`)
  }

  /**
   * Handle notification_unread_count WS event.
   * Authoritative badge count from server.
   */
  function handleWSUnreadCount(data: Record<string, unknown>): void {
    unreadCount.value = (data.unread_count as number) || 0
    highestSeverity.value = (data.highest_severity as NotificationSeverity) || null

    logger.debug(`WS unread count: ${unreadCount.value}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Browser Notifications
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Show browser push notification for critical alerts.
   * Requests permission on first call.
   */
  function showBrowserNotification(notification: NotificationDTO): void {
    if (!('Notification' in window)) return

    if (Notification.permission === 'granted') {
      new Notification(`[CRITICAL] ${notification.title}`, {
        body: notification.body || '',
        icon: '/favicon.ico',
        tag: notification.id,
      })
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(`[CRITICAL] ${notification.title}`, {
            body: notification.body || '',
            icon: '/favicon.ico',
            tag: notification.id,
          })
        }
      })
    }
  }

  return {
    // State
    notifications,
    unreadCount,
    highestSeverity,
    isDrawerOpen,
    isPreferencesOpen,
    activeFilter,
    isLoading,
    hasMore,

    // Computed
    filteredNotifications,
    groupedNotifications,
    badgeText,

    // Actions
    loadInitial,
    loadMore,
    markAsRead,
    markAllAsRead,
    toggleDrawer,
    openPreferences,
    closePreferences,

    // WS Handlers (for esp.store.ts dispatcher)
    handleWSNotificationNew,
    handleWSNotificationUpdated,
    handleWSUnreadCount,
  }
})
