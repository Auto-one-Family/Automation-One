/**
 * ESP Store WebSocket subscription contract (P0-A).
 *
 * useWebSocket with filters.types drops any message type not listed here before
 * dispatching to ws.on() handlers. This list MUST match every ws.on('…') in
 * esp.store initWebSocket (same types, no extras that handlers depend on).
 *
 * When adding a handler in esp.ts, append the type here.
 */
import type { MessageType } from '@/types'

/** Message types registered via ws.on() in esp.store.ts initWebSocket */
export const ESP_STORE_WS_ON_HANDLER_TYPES = [
  'actuator_alert',
  'actuator_command',
  'actuator_command_failed',
  'actuator_config_deleted',
  'actuator_response',
  'actuator_status',
  'config_failed',
  'config_published',
  'config_response',
  'device_approved',
  'device_context_changed',
  'device_discovered',
  'device_rediscovered',
  'device_rejected',
  'device_scope_changed',
  'esp_health',
  'error_event',
  'intent_outcome',
  'intent_outcome_lifecycle',
  'notification',
  'notification_new',
  'notification_updated',
  'notification_unread_count',
  'sensor_config_deleted',
  'sensor_data',
  'sensor_health',
  'sequence_cancelled',
  'sequence_completed',
  'sequence_error',
  'sequence_started',
  'sequence_step',
  'subzone_assignment',
  'system_event',
  'zone_assignment',
] as const satisfies readonly MessageType[]

/** Filter list passed to useWebSocket — identical set to handler types */
export const ESP_STORE_WS_SUBSCRIPTION_TYPES: MessageType[] = [
  ...ESP_STORE_WS_ON_HANDLER_TYPES,
]
