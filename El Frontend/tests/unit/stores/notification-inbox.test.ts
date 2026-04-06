import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { notificationsApiMock } = vi.hoisted(() => ({
  notificationsApiMock: {
    list: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

vi.mock('@/api/notifications', () => ({
  notificationsApi: notificationsApiMock,
}))

import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'

function makeNotification(id: string) {
  return {
    id,
    user_id: 1,
    channel: 'websocket',
    severity: 'warning' as const,
    category: 'system' as const,
    title: `N-${id}`,
    body: null,
    metadata: {},
    source: 'system' as const,
    is_read: false,
    is_archived: false,
    digest_sent: false,
    parent_notification_id: null,
    fingerprint: null,
    created_at: new Date().toISOString(),
    updated_at: null,
    read_at: null,
    status: 'active' as const,
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    correlation_id: null,
  }
}

describe('notification-inbox store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('notification_new fuegt Eintrag oben ein', () => {
    const store = useNotificationInboxStore()
    store.notifications = [makeNotification('old')]
    store.unreadCount = 0

    store.handleWSNotificationNew(makeNotification('new') as unknown as Record<string, unknown>)

    expect(store.notifications[0].id).toBe('new')
    expect(store.unreadCount).toBe(1)
  })

  it('notification_updated aktualisiert Lifecycle-Felder', () => {
    const store = useNotificationInboxStore()
    store.notifications = [makeNotification('n1')]

    store.handleWSNotificationUpdated({
      id: 'n1',
      status: 'acknowledged',
      acknowledged_by: 42,
      acknowledged_at: '2026-04-06T12:00:00Z',
    })

    expect(store.notifications[0].status).toBe('acknowledged')
    expect(store.notifications[0].acknowledged_by).toBe(42)
  })

  it('notification_unread_count setzt server-autoritative Badge-Werte', () => {
    const store = useNotificationInboxStore()
    store.handleWSUnreadCount({ unread_count: 7, highest_severity: 'critical' })
    expect(store.unreadCount).toBe(7)
    expect(store.highestSeverity).toBe('critical')
  })

  it('applyAlertUpdate ist der Inbox-Write-Adapter fuer fremde Stores', () => {
    const store = useNotificationInboxStore()
    store.notifications = [makeNotification('alert-1')]
    const updated = { ...store.notifications[0], status: 'resolved' as const, resolved_at: '2026-04-06T12:01:00Z' }

    const applied = store.applyAlertUpdate(updated)

    expect(applied).toBe(true)
    expect(store.notifications[0].status).toBe('resolved')
  })
})
