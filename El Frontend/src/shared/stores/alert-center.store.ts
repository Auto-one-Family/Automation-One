/**
 * Alert Center Store (Phase 4B)
 *
 * ISA-18.2 Alert Lifecycle Management.
 * Manages active/acknowledged alerts, stats, and lifecycle actions.
 *
 * Data flow:
 * - Stats: REST API → alertStats
 * - Active alerts: REST API → activeAlerts[]
 * - Lifecycle actions: acknowledge/resolve → REST API → WS update
 * - Real-time: notification-inbox.store handles WS events for list updates
 *
 * Cross-store: Reads from notification-inbox.store for unified view.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  notificationsApi,
  type AlertStatsDTO,
  type AlertStatus,
  type NotificationDTO,
  type NotificationSeverity,
} from '@/api/notifications'
import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'
import { createLogger } from '@/utils/logger'

const logger = createLogger('AlertCenterStore')

/** Polling interval for alert stats (30s) */
const STATS_POLL_INTERVAL_MS = 30_000

export const useAlertCenterStore = defineStore('alert-center', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════════════════════════════════════

  const alertStats = ref<AlertStatsDTO | null>(null)
  const isLoadingStats = ref(false)
  const activeAlerts = ref<NotificationDTO[]>([])
  const isLoadingAlerts = ref(false)
  const statusFilter = ref<AlertStatus>('active')
  const severityFilter = ref<NotificationSeverity | null>(null)
  let statsPollTimer: ReturnType<typeof setInterval> | null = null

  // ═══════════════════════════════════════════════════════════════════════════
  // Computed
  // ═══════════════════════════════════════════════════════════════════════════

  /** Total active + acknowledged alerts (unresolved) */
  const unresolvedCount = computed(() => {
    if (!alertStats.value) return 0
    return alertStats.value.active_count + alertStats.value.acknowledged_count
  })

  /** Active critical alerts */
  const criticalCount = computed(() => alertStats.value?.critical_active ?? 0)

  /** Active warning alerts */
  const warningCount = computed(() => alertStats.value?.warning_active ?? 0)

  /** Is there any active critical alert? */
  const hasCritical = computed(() => criticalCount.value > 0)

  /** Active alerts from inbox store (derived, no extra REST call) */
  const activeAlertsFromInbox = computed(() => {
    const inboxStore = useNotificationInboxStore()
    return inboxStore.notifications.filter(
      (n) => n.status === 'active' || n.status === 'acknowledged',
    )
  })

  /** Mean Time to Acknowledge formatted */
  const mttaFormatted = computed(() => {
    const s = alertStats.value?.mean_time_to_acknowledge_s
    if (s == null) return '–'
    if (s < 60) return `${Math.round(s)}s`
    if (s < 3600) return `${Math.round(s / 60)}m`
    return `${(s / 3600).toFixed(1)}h`
  })

  /** Mean Time to Resolve formatted */
  const mttrFormatted = computed(() => {
    const s = alertStats.value?.mean_time_to_resolve_s
    if (s == null) return '–'
    if (s < 60) return `${Math.round(s)}s`
    if (s < 3600) return `${Math.round(s / 60)}m`
    return `${(s / 3600).toFixed(1)}h`
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch alert statistics from server.
   */
  async function fetchStats(): Promise<void> {
    if (isLoadingStats.value) return
    isLoadingStats.value = true

    try {
      alertStats.value = await notificationsApi.getAlertStats()
      logger.debug(
        `Stats loaded: ${alertStats.value.active_count} active, ` +
          `${alertStats.value.acknowledged_count} acknowledged`,
      )
    } catch (err) {
      logger.error('Failed to fetch alert stats', err)
    } finally {
      isLoadingStats.value = false
    }
  }

  /**
   * Fetch active alerts list from server.
   */
  async function fetchActiveAlerts(): Promise<void> {
    if (isLoadingAlerts.value) return
    isLoadingAlerts.value = true

    try {
      const res = await notificationsApi.getActiveAlerts({
        status: statusFilter.value,
        severity: severityFilter.value ?? undefined,
        page: 1,
        page_size: 100,
      })
      activeAlerts.value = res.data
      logger.debug(`Loaded ${res.data.length} ${statusFilter.value} alerts`)
    } catch (err) {
      logger.error('Failed to fetch active alerts', err)
    } finally {
      isLoadingAlerts.value = false
    }
  }

  /**
   * Acknowledge an alert (active → acknowledged).
   */
  async function acknowledgeAlert(id: string): Promise<boolean> {
    try {
      const updated = await notificationsApi.acknowledgeAlert(id)

      // Update local lists
      _updateAlertInLists(id, updated)

      // Refresh stats
      await fetchStats()

      logger.info(`Alert acknowledged: ${id}`)
      return true
    } catch (err) {
      logger.error(`Failed to acknowledge alert ${id}`, err)
      return false
    }
  }

  /**
   * Resolve an alert (active/acknowledged → resolved).
   */
  async function resolveAlert(id: string): Promise<boolean> {
    try {
      const updated = await notificationsApi.resolveAlert(id)

      // Update local lists
      _updateAlertInLists(id, updated)

      // Remove from active alerts list
      activeAlerts.value = activeAlerts.value.filter((a) => a.id !== id)

      // Refresh stats
      await fetchStats()

      logger.info(`Alert resolved: ${id}`)
      return true
    } catch (err) {
      logger.error(`Failed to resolve alert ${id}`, err)
      return false
    }
  }

  /**
   * Start polling for alert stats.
   */
  function startStatsPolling(): void {
    stopStatsPolling()
    fetchStats()
    statsPollTimer = setInterval(fetchStats, STATS_POLL_INTERVAL_MS)
    logger.debug('Alert stats polling started')
  }

  /**
   * Stop polling for alert stats.
   */
  function stopStatsPolling(): void {
    if (statsPollTimer) {
      clearInterval(statsPollTimer)
      statsPollTimer = null
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Internal
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update an alert in all local lists after API response.
   */
  function _updateAlertInLists(id: string, updated: NotificationDTO): void {
    // Update in active alerts
    const activeIdx = activeAlerts.value.findIndex((a) => a.id === id)
    if (activeIdx >= 0) {
      activeAlerts.value[activeIdx] = updated
    }

    // Update in inbox store
    const inboxStore = useNotificationInboxStore()
    const inboxIdx = inboxStore.notifications.findIndex((n) => n.id === id)
    if (inboxIdx >= 0) {
      inboxStore.notifications[inboxIdx] = updated
    }
  }

  return {
    // State
    alertStats,
    isLoadingStats,
    activeAlerts,
    isLoadingAlerts,
    statusFilter,
    severityFilter,

    // Computed
    unresolvedCount,
    criticalCount,
    warningCount,
    hasCritical,
    activeAlertsFromInbox,
    mttaFormatted,
    mttrFormatted,

    // Actions
    fetchStats,
    fetchActiveAlerts,
    acknowledgeAlert,
    resolveAlert,
    startStatsPolling,
    stopStatsPolling,
  }
})
