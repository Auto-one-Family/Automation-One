import { describe, it, expect } from 'vitest'
import {
  ESP_STORE_WS_ON_HANDLER_TYPES,
  ESP_STORE_WS_SUBSCRIPTION_TYPES,
} from '@/stores/esp-websocket-subscription'

describe('esp websocket subscription (P0-A)', () => {
  it('subscription types match handler manifest (same multiset)', () => {
    expect([...ESP_STORE_WS_SUBSCRIPTION_TYPES].sort()).toEqual([...ESP_STORE_WS_ON_HANDLER_TYPES].sort())
  })

  it('has no duplicate subscription types', () => {
    expect(ESP_STORE_WS_SUBSCRIPTION_TYPES.length).toBe(new Set(ESP_STORE_WS_SUBSCRIPTION_TYPES).size)
  })

  it('includes inbox, config-delete and intent types (regression)', () => {
    const critical = [
      'notification_new',
      'notification_updated',
      'notification_unread_count',
      'sensor_config_deleted',
      'actuator_config_deleted',
      'intent_outcome',
      'intent_outcome_lifecycle',
    ] as const
    for (const t of critical) {
      expect(ESP_STORE_WS_SUBSCRIPTION_TYPES).toContain(t)
    }
  })
})
