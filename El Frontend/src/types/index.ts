// =============================================================================
// GPIO Types (Phase 3)
// =============================================================================
export * from './gpio'

// =============================================================================
// WebSocket Event Types (System Monitor)
// =============================================================================
export * from './websocket-events'

// =============================================================================
// Device Metadata Types
// =============================================================================
export type { DeviceMetadata } from './device-metadata'
export {
  parseDeviceMetadata,
  mergeDeviceMetadata,
  getNextMaintenanceDate,
  isMaintenanceOverdue,
} from './device-metadata'

// =============================================================================
// Discovery/Approval Types (Phase: Device Discovery)
// =============================================================================

/**
 * Pending ESP device awaiting approval.
 * Discovered via heartbeat but not yet approved by admin.
 *
 * Time Fields:
 * - discovered_at: When device was FIRST discovered (historical)
 * - last_seen: When device was LAST active (use for "vor X Zeit" display)
 */
export interface PendingESPDevice {
  /** Device ID (e.g., ESP_D0B19C) */
  device_id: string
  /** When device was first discovered (historical) */
  discovered_at: string
  /** When device was last active - use this for "vor X Zeit" display */
  last_seen?: string | null
  /** IP address of the device */
  ip_address?: string | null
  /** Zone ID if pre-assigned */
  zone_id?: string | null
  /** Free heap memory in bytes */
  heap_free?: number | null
  /** WiFi signal strength in dBm */
  wifi_rssi?: number | null
  /** Number of configured sensors */
  sensor_count: number
  /** Number of configured actuators */
  actuator_count: number
  /** Number of heartbeats received while pending */
  heartbeat_count: number
  /** Hardware type (ESP32_WROOM, etc.) */
  hardware_type?: string | null
  /** Time since discovery in a human-readable format */
  time_ago?: string
}

/**
 * Request to approve a pending device.
 */
export interface ESPApprovalRequest {
  /** Optional friendly name for the device */
  name?: string | null
  /** Optional zone ID to assign */
  zone_id?: string | null
  /** Optional zone name (creates zone if not exists) */
  zone_name?: string | null
}

/**
 * Request to reject a pending device.
 */
export interface ESPRejectionRequest {
  /** Reason for rejection (required) */
  reason: string
}

/**
 * Response from approval/rejection endpoints.
 */
export interface ESPApprovalResponse {
  success: boolean
  message: string
  device_id: string
  status: string
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
}

/**
 * Response containing list of pending devices.
 */
export interface PendingDevicesListResponse {
  success: boolean
  devices: PendingESPDevice[]
  count: number
  message: string
}

/**
 * Payload for device_discovered WebSocket event (data field).
 * For the full event wrapper, use DeviceDiscoveredEvent from websocket-events.ts.
 */
export interface DeviceDiscoveredPayload {
  device_id: string
  discovered_at: string
  /** Last activity timestamp (initial = discovered_at) */
  last_seen?: string | null
  ip_address?: string | null
  heap_free?: number | null
  wifi_rssi?: number | null
  sensor_count: number
  actuator_count: number
  hardware_type?: string | null
}

/**
 * Payload for device_approved WebSocket event (data field).
 * For the full event wrapper, use DeviceApprovedEvent from websocket-events.ts.
 */
export interface DeviceApprovedPayload {
  device_id: string
  approved_by: string
  approved_at: string
  status: string
}

/**
 * Payload for device_rejected WebSocket event (data field).
 * For the full event wrapper, use DeviceRejectedEvent from websocket-events.ts.
 */
export interface DeviceRejectedPayload {
  device_id: string
  rejection_reason: string
  rejected_at: string
  cooldown_until: string
}

// =============================================================================
// Auth Types
// =============================================================================
export interface User {
  id: string
  username: string
  email: string
  full_name: string | null
  role: 'admin' | 'operator' | 'viewer'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LoginRequest {
  username: string
  password: string
  remember_me?: boolean
}

export interface SetupRequest {
  username: string
  email: string
  password: string
  full_name?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface LoginResponse {
  success: boolean
  message: string
  tokens: TokenResponse
  user: User
}

export interface SetupResponse {
  success: boolean
  message: string
  tokens: TokenResponse
  user: User
}

export interface RefreshResponse {
  success: boolean
  message: string
  tokens: TokenResponse
}

export interface AuthStatusResponse {
  setup_required: boolean
  users_exist: boolean
  mqtt_auth_enabled: boolean
  mqtt_tls_enabled: boolean
}

// =============================================================================
// Mock ESP Types
// =============================================================================
export type MockSystemState =
  | 'BOOT'
  | 'WIFI_SETUP'
  | 'WIFI_CONNECTED'
  | 'MQTT_CONNECTING'
  | 'MQTT_CONNECTED'
  | 'AWAITING_USER_CONFIG'
  | 'ZONE_CONFIGURED'
  | 'SENSORS_CONFIGURED'
  | 'OPERATIONAL'
  | 'LIBRARY_DOWNLOADING'
  | 'SAFE_MODE'
  | 'ERROR'

export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'stale' | 'error'

// =============================================================================
// Multi-Value Sensor Types (Phase 6)
// =============================================================================

/**
 * Single value within a multi-value sensor
 */
export interface MultiValueEntry {
  /** Current value */
  value: number
  /** Unit of measurement */
  unit: string
  /** Data quality */
  quality: QualityLevel
  /** Timestamp of last update (Unix ms) */
  timestamp: number
  /** Sensor type for this value */
  sensorType: string
}

/**
 * Type guard for multi-value sensors
 */
export function isMultiValueSensor(sensor: MockSensor): boolean {
  return sensor.is_multi_value === true && sensor.multi_values !== null && sensor.multi_values !== undefined
}

export interface MockSensor {
  /** Sensor config UUID from database (primary identifier for multi-value sensors) */
  config_id?: string
  gpio: number
  sensor_type: string
  name: string | null
  subzone_id?: string | null
  raw_value: number
  processed_value?: number  // Optional - present when Pi-enhanced processing returns data
  unit: string
  quality: QualityLevel
  raw_mode: boolean
  last_read: string | null
  // Phase 2E: Health-Status fields
  operating_mode?: SensorOperatingMode
  timeout_seconds?: number
  is_stale?: boolean
  stale_reason?: 'timeout_exceeded' | 'no_data' | 'sensor_error'
  last_reading_at?: string | null
  // Phase 2F: Schedule configuration
  schedule_config?: { type: string; expression: string } | null
  // Config verification status from ESP32
  config_status?: 'pending' | 'applied' | 'failed' | null
  config_error?: string | null
  config_error_detail?: string | null

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 6: Multi-Value Sensor Fields
  // ═══════════════════════════════════════════════════════════════════════════
  /** Device type if multi-value (e.g., "sht31"), null for single-value */
  device_type?: string | null
  /** All values for multi-value sensors, keyed by sensor_type */
  multi_values?: Record<string, MultiValueEntry> | null
  /** Is this a multi-value sensor? */
  is_multi_value?: boolean

  // ═══════════════════════════════════════════════════════════════════════════
  // Interface / Address Fields (for Orbital display)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Interface type: I2C, ONEWIRE, ANALOG, DIGITAL */
  interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | null
  /** I2C address (0-127) for I2C sensors */
  i2c_address?: number | null

  // ═══════════════════════════════════════════════════════════════════════════
  // Device Scope Fields (T13-R3 WP4)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Device scope: zone_local, multi_zone, mobile */
  device_scope?: DeviceScope | null
  /** Assigned zones for multi_zone/mobile devices */
  assigned_zones?: string[] | null
}

export interface MockActuator {
  gpio: number
  actuator_type: string
  name: string | null
  state: boolean
  pwm_value: number
  emergency_stopped: boolean
  last_command_at: string | null
  subzone_id?: string | null
  // Config verification status from ESP32
  config_status?: 'pending' | 'applied' | 'failed' | null
  config_error?: string | null
  config_error_detail?: string | null
  // Device Scope Fields (T13-R3 WP4)
  /** Device scope: zone_local, multi_zone, mobile */
  device_scope?: DeviceScope | null
  /** Assigned zones for multi_zone/mobile devices */
  assigned_zones?: string[] | null
}

/** Lightweight zone context summary inherited from ZoneContext */
export interface ZoneContextSummary {
  zone_id: string
  zone_name?: string | null
  variety?: string | null
  substrate?: string | null
  growth_phase?: string | null
  plant_count?: number | null
  plant_age_days?: number | null
  days_to_harvest?: number | null
  responsible_person?: string | null
}

export interface MockESP {
  esp_id: string
  name: string | null  // Human-readable device name (from DB)
  zone_id: string | null
  zone_name: string | null  // User-friendly zone name (allows spaces)
  master_zone_id: string | null
  subzone_id: string | null
  system_state: MockSystemState
  status: 'online' | 'offline' | 'error' | 'unknown' | 'pending_approval' | 'approved' | 'rejected'  // Device lifecycle + connection status
  sensors: MockSensor[]
  actuators: MockActuator[]
  auto_heartbeat: boolean
  heap_free: number
  wifi_rssi: number
  uptime: number
  last_heartbeat: string | null
  created_at: string
  connected: boolean
  hardware_type: string
  zone_context?: ZoneContextSummary | null
}

export interface MockESPCreate {
  esp_id: string
  zone_id?: string  // Technical zone ID (auto-generated from zone_name if not provided)
  zone_name?: string  // User-friendly zone name (allows spaces, e.g., "Zelt 1")
  master_zone_id?: string
  subzone_id?: string
  sensors?: MockSensorConfig[]
  actuators?: MockActuatorConfig[]
  auto_heartbeat?: boolean
  heartbeat_interval_seconds?: number
}

export interface MockSensorConfig {
  gpio: number
  sensor_type: string
  name?: string
  /** Subzone ID (optional); null = "Keine Subzone" */
  subzone_id?: string | null
  raw_value?: number
  unit?: string
  quality?: QualityLevel
  raw_mode?: boolean
  // =========================================================================
  // Phase 6: OneWire Support (DS18B20)
  // =========================================================================
  /** OneWire ROM address for DS18B20 sensors (16 hex chars) */
  onewire_address?: string
  /** Interface type for sensor (I2C, ONEWIRE, ANALOG, DIGITAL) */
  interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL'
}

export interface MockActuatorConfig {
  gpio: number
  actuator_type: string
  name?: string
  state?: boolean
  pwm_value?: number
  min_value?: number
  max_value?: number
  /** Subzone ID (optional); sent as top-level in ActuatorConfigCreate */
  subzone_id?: string | null
  // Phase 7: Actuator Sidebar fields
  aux_gpio?: number | null      // 255 = nicht verwendet (für Ventile: Direction-Pin)
  inverted_logic?: boolean      // LOW = ON (für Pumpen, Ventile, Relais)
  max_runtime_seconds?: number  // RuntimeProtection (für Pumpen)
  cooldown_seconds?: number     // RuntimeProtection (für Pumpen)
}

// =============================================================================
// WebSocket Message Types
// =============================================================================
/**
 * All WebSocket message types from server broadcasts.
 * 
 * Server-side origins (handler → message_type):
 * - sensor_handler.py       → sensor_data
 * - actuator_handler.py     → actuator_status
 * - actuator_response.py    → actuator_response
 * - actuator_alert.py       → actuator_alert
 * - config_handler.py       → config_response
 * - zone_ack_handler.py     → zone_assignment
 * - heartbeat_handler.py    → esp_health
 */
export type MessageType =
  // Core sensor/actuator events
  | 'sensor_data'
  | 'actuator_status'
  | 'actuator_response'
  | 'actuator_alert'
  // Device health & status
  | 'esp_health'
  | 'sensor_health'  // Phase 2E: Sensor timeout events
  // Configuration events
  | 'config_response'
  | 'zone_assignment'
  // Discovery/Approval events (Phase: Device Discovery)
  | 'device_discovered'
  | 'device_approved'
  | 'device_rejected'
  | 'device_rediscovered'
  // Actuator command lifecycle
  | 'actuator_command'
  | 'actuator_command_failed'
  // Config publish lifecycle
  | 'config_published'
  | 'config_failed'
  // Sequence events (automation)
  | 'sequence_started'
  | 'sequence_step'
  | 'sequence_completed'
  | 'sequence_error'
  | 'sequence_cancelled'
  // Sensor/actuator config lifecycle
  | 'sensor_config_deleted'
  | 'actuator_config_deleted'
  // Device scope & context events (T13-R2)
  | 'device_scope_changed'
  | 'device_context_changed'
  // Subzone assignment (dispatched in esp.store)
  | 'subzone_assignment'
  // System events
  | 'logic_execution'
  | 'system_event'
  | 'notification'
  | 'error_event'

export interface MqttMessage {
  id: string
  timestamp: string
  type: MessageType
  topic: string
  payload: Record<string, unknown>
  esp_id?: string
}

export interface WebSocketFilters {
  types: MessageType[]
  esp_ids: string[]
  topicPattern: string
}

// =============================================================================
// Offline Reason Types (LWT & Heartbeat Timeout)
// =============================================================================

/**
 * Grund für Offline-Status eines ESP-Geräts.
 *
 * - 'lwt': Verbindung unerwartet verloren (Power-Loss, Crash, Netzwerkfehler)
 * - 'heartbeat_timeout': Keine Antwort seit 5 Minuten
 * - 'shutdown': Gerät wurde absichtlich heruntergefahren (Future)
 * - 'unknown': Unbekannter Grund (Legacy-Daten)
 */
export type OfflineReason = 'lwt' | 'heartbeat_timeout' | 'shutdown' | 'unknown'

/**
 * Quelle der Status-Änderung.
 *
 * - 'lwt': Last-Will-Testament vom MQTT Broker
 * - 'heartbeat': Regulärer Heartbeat
 * - 'heartbeat_timeout': Timeout-Check im Server
 * - 'api': Manueller Status-Update via API
 */
export type StatusSource = 'lwt' | 'heartbeat' | 'heartbeat_timeout' | 'api'

/**
 * Offline-Informationen für ein ESP-Gerät.
 * Wird im ESP Store gespeichert wenn status = 'offline'.
 */
export interface OfflineInfo {
  /** Grund für Offline-Status */
  reason: OfflineReason
  /** Quelle der Status-Änderung */
  source: StatusSource
  /** Zeitstempel wann offline ging (Unix timestamp) */
  timestamp: number
  /** Menschenlesbarer Text für UI */
  displayText: string
}

/**
 * WebSocket esp_health Event Payload.
 * Erweitert um source und reason Felder.
 */
export interface EspHealthEvent {
  esp_id: string
  status: 'online' | 'offline'
  heap_free?: number
  wifi_rssi?: number
  uptime?: number
  sensor_count?: number
  actuator_count?: number
  timestamp?: number
  /** Nur bei status='offline': Quelle der Offline-Erkennung */
  source?: StatusSource
  /** Nur bei status='offline': Grund für Offline */
  reason?: string
  /** Nur bei heartbeat_timeout: Timeout-Dauer in Sekunden */
  timeout_seconds?: number
}

/**
 * WebSocket sensor_health Event Payload (Phase 2E).
 * Wird vom Server bei Sensor-Timeout-Überschreitung gesendet.
 */
export interface SensorHealthEvent {
  esp_id: string
  gpio: number
  sensor_type: string
  sensor_name: string | null
  is_stale: boolean
  stale_reason: 'timeout_exceeded' | 'no_data' | 'sensor_error'
  last_reading_at: string | null
  timeout_seconds: number
  seconds_overdue: number
  operating_mode: SensorOperatingMode
  config_source: 'instance' | 'type_default' | 'system_default'
  timestamp: number
}

// =============================================================================
// API Response Types
// =============================================================================
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface CommandResponse {
  success: boolean
  esp_id: string
  command: string
  result?: Record<string, unknown>
  error?: string
}

// =============================================================================
// Logic Types (re-exported from logic.ts for detailed types)
// =============================================================================
export type {
  LogicRule,
  LogicCondition,
  SensorCondition,
  TimeCondition,
  CompoundCondition,
  LogicAction,
  ActuatorAction,
  NotificationAction,
  DelayAction,
  LogicConnection,
  LogicRulesResponse,
  ExecutionHistoryResponse,
  ExecutionHistoryItem,
} from './logic'

export { generateRuleDescription, extractConnections, formatConditionShort } from './logic'

// Legacy LogicExecution (kept for backward compatibility)
export interface LogicExecution {
  id: string
  rule_id: string
  rule_name: string
  triggered_at: string
  conditions_met: boolean
  actions_executed: number
  execution_time_ms: number
  error: string | null
}

// =============================================================================
// Sensor Operating Modes (Phase 2B)
// =============================================================================

/**
 * Operating Mode für Sensor-Messverhalten.
 *
 * - continuous: Automatische Messungen im Intervall
 * - on_demand: Nur manuelle Messungen (User-triggered)
 * - scheduled: Messungen zu definierten Zeiten
 * - paused: Temporär deaktiviert
 */
export type SensorOperatingMode = 'continuous' | 'on_demand' | 'scheduled' | 'paused'

// =============================================================================
// Sensor & Actuator Config Types (Real ESPs)
// =============================================================================

export interface SensorConfigCreate {
  esp_id: string
  gpio: number
  sensor_type: string
  name?: string | null
  enabled?: boolean
  interval_ms?: number
  processing_mode?: 'pi_enhanced' | 'local' | 'raw'
  calibration?: Record<string, unknown> | null
  threshold_min?: number | null
  threshold_max?: number | null
  warning_min?: number | null
  warning_max?: number | null
  metadata?: Record<string, unknown> | null
  // =========================================================================
  // MULTI-VALUE SENSOR SUPPORT (I2C/OneWire)
  // =========================================================================
  /** Interface type: I2C, ONEWIRE, ANALOG, DIGITAL (auto-inferred if not provided) */
  interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL'
  /** I2C address (0-127) - required for I2C sensors */
  i2c_address?: number | null
  /** OneWire device ROM address - optional, server auto-generates if not provided */
  onewire_address?: string | null
  /** List of value types this sensor provides (for multi-value sensors) */
  provides_values?: string[] | null
  // =========================================================================
  // OPERATING MODE FIELDS (Phase 2B)
  // =========================================================================
  /** Betriebsmodus: continuous, on_demand, scheduled, paused */
  operating_mode?: SensorOperatingMode
  /** Timeout in Sekunden für Stale-Erkennung (0 = kein Timeout) */
  timeout_seconds?: number
  /** Ob Timeout-Warnungen aktiviert sind */
  timeout_warning_enabled?: boolean
  /** Schedule-Konfiguration für scheduled-Modus */
  schedule_config?: Record<string, unknown> | null
  /** Subzone ID to assign this sensor to. Null/empty = remove from all subzones */
  subzone_id?: string | null
  /** Device scope: zone_local, multi_zone, mobile (T13-R2) */
  device_scope?: DeviceScope
  /** Zones this sensor is assigned to for multi_zone scope (T13-R2) */
  assigned_zones?: string[] | null
}

export interface SensorConfigResponse {
  id: string
  esp_id: string
  esp_device_id?: string
  gpio: number
  sensor_type: string
  name: string
  enabled: boolean
  interval_ms: number
  processing_mode: string
  calibration: Record<string, unknown> | null
  threshold_min: number | null
  threshold_max: number | null
  warning_min: number | null
  warning_max: number | null
  /** I2C address (0-127) - backend returns as int */
  i2c_address?: number | null
  metadata: Record<string, unknown> | null
  // Config status from ESP32 verification (Phase 2: write-after-verification)
  config_status?: 'pending' | 'applied' | 'failed' | null
  config_error?: string | null
  config_error_detail?: string | null
  /** Subzone ID this sensor belongs to (if any) */
  subzone_id?: string | null
  /** Operating mode: continuous, on_demand, scheduled, paused */
  operating_mode?: SensorOperatingMode | null
  /** Timeout for stale detection in seconds (0 = disabled) */
  timeout_seconds?: number | null
  /** Schedule config for scheduled mode: { type: 'cron', expression: string } */
  schedule_config?: { type: string; expression: string } | Record<string, unknown> | null
  /** Device scope: zone_local, multi_zone, mobile (T13-R2) */
  device_scope: DeviceScope | null
  /** Zones this sensor is assigned to for multi_zone scope (T13-R2) */
  assigned_zones: string[] | null
  latest_value?: number | null
  latest_quality?: QualityLevel | null
  latest_timestamp?: string | null
  created_at: string
  updated_at: string
}

// =============================================================================
// Sensor History Types (Phase 3 - Server History Endpoint)
// =============================================================================

/**
 * Single sensor reading from history.
 * Matches server schema: SensorReading (schemas/sensor.py:268-308)
 */
export interface SensorReading {
  timestamp: string
  raw_value: number
  processed_value: number | null
  unit: string | null
  quality: QualityLevel
}

/**
 * Query parameters for sensor data history.
 * Matches server endpoint: GET /v1/sensors/data
 */
export interface SensorDataQuery {
  esp_id?: string
  gpio?: number
  sensor_type?: string
  start_time?: string  // ISO datetime
  end_time?: string    // ISO datetime
  quality?: QualityLevel
  limit?: number       // 1-1000, default 100
}

/**
 * Response from sensor data query.
 * Matches server schema: SensorDataResponse (schemas/sensor.py:362-405)
 */
export interface SensorDataResponse {
  success: boolean
  esp_id: string | null
  gpio: number | null
  sensor_type: string | null
  readings: SensorReading[]
  count: number
  aggregation: string | null
  time_range: {
    start: string
    end: string
  } | null
}

/**
 * Statistical summary for sensor data.
 * Matches server schema: SensorStats (schemas/sensor.py:424-454)
 */
export interface SensorStats {
  min_value: number | null
  max_value: number | null
  avg_value: number | null
  std_dev: number | null
  reading_count: number
  quality_distribution: Record<QualityLevel, number>
}

/**
 * Response from sensor statistics query.
 * Matches server schema: SensorStatsResponse (schemas/sensor.py:457-466)
 */
export interface SensorStatsResponse {
  success: boolean
  esp_id: string
  gpio: number
  sensor_type: string
  stats: SensorStats
  time_range: {
    start: string
    end: string
  }
}

// =============================================================================
// Drag & Drop Types (Phase 4 - Multi-Sensor Chart)
// =============================================================================

/**
 * Drag data for sensor satellite.
 * Used by SensorSatellite → AnalysisDropZone
 */
export interface SensorDragData {
  type: 'sensor'
  espId: string
  gpio: number
  sensorType: string
  name: string
  unit: string
}

/**
 * Drag data for actuator satellite.
 * Used by ActuatorSatellite → AnalysisDropZone
 */
export interface ActuatorDragData {
  type: 'actuator'
  espId: string
  gpio: number
  actuatorType: string
  name: string
}

/**
 * Union type for all drag data.
 */
export type DragData = SensorDragData | ActuatorDragData

/**
 * Selected sensor for Multi-Sensor Chart.
 */
export interface ChartSensor {
  id: string  // Unique ID: `${espId}_${gpio}_${sensorType}` (includes sensorType for multi-value sensors like SHT31)
  espId: string
  gpio: number
  sensorType: string
  name: string
  unit: string
  color: string  // Chart line color
}

export interface ActuatorConfigCreate {
  esp_id: string
  gpio: number
  actuator_type: string
  name?: string | null
  enabled?: boolean
  max_runtime_seconds?: number | null
  cooldown_seconds?: number | null
  pwm_frequency?: number | null
  servo_min_pulse?: number | null
  servo_max_pulse?: number | null
  metadata?: Record<string, unknown> | null
  /** Subzone ID to assign this actuator to. Null/empty = remove from all subzones */
  subzone_id?: string | null
  /** Device scope: zone_local, multi_zone, mobile (T13-R2) */
  device_scope?: DeviceScope
  /** Zones this actuator is assigned to for multi_zone scope (T13-R2) */
  assigned_zones?: string[] | null
}

export interface ActuatorConfigResponse {
  id: string
  esp_id: string
  esp_device_id?: string
  gpio: number
  actuator_type: string
  name: string
  enabled: boolean
  max_runtime_seconds: number | null
  cooldown_seconds: number | null
  pwm_frequency: number | null
  servo_min_pulse: number | null
  servo_max_pulse: number | null
  metadata: Record<string, unknown> | null
  subzone_id?: string | null
  // Config status from ESP32 verification (Phase 2: write-after-verification)
  config_status?: 'pending' | 'applied' | 'failed' | null
  config_error?: string | null
  config_error_detail?: string | null
  /** Device scope: zone_local, multi_zone, mobile (T13-R2) */
  device_scope: DeviceScope | null
  /** Zones this actuator is assigned to for multi_zone scope (T13-R2) */
  assigned_zones: string[] | null
  current_value?: number | null
  is_active?: boolean
  last_command_at?: string | null
  created_at: string
  updated_at: string
}

// =============================================================================
// Config Response Types (WebSocket Events)
// =============================================================================

export interface ConfigResponse {
  esp_id: string
  config_type: 'sensor' | 'actuator'
  status: 'success' | 'partial_success' | 'error'
  count: number
  message: string
  error_code?: string
  timestamp: number
}

/**
 * Phase 4: Individual configuration failure from ESP32.
 */
export interface ConfigFailure {
  type: 'sensor' | 'actuator'
  gpio: number
  error_code: number
  error: string
  detail: string | null
}

/**
 * Phase 4: Extended config response with failures array and partial_success status.
 */
export interface ConfigResponseExtended extends ConfigResponse {
  status: 'success' | 'partial_success' | 'error'
  failed_count?: number
  failures?: ConfigFailure[]
  error_description?: string
  failed_item?: Record<string, unknown>  // Legacy backward compatibility
}

// =============================================================================
// Zone Entity Types (T13-R1 Backend)
// =============================================================================

export type ZoneStatus = 'active' | 'archived' | 'deleted'

export interface ZoneEntity {
  id: string
  zone_id: string
  name: string
  description: string | null
  status: ZoneStatus
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface ZoneEntityCreate {
  zone_id: string
  name: string
  description?: string | null
}

export interface ZoneEntityUpdate {
  name?: string | null
  description?: string | null
}

export interface ZoneEntityListResponse {
  zones: ZoneEntity[]
  total: number
}

// =============================================================================
// Device Scope Types (T13-R2 Backend)
// =============================================================================

export type DeviceScope = 'zone_local' | 'multi_zone' | 'mobile'

export interface DeviceContextSet {
  active_zone_id: string | null
  active_subzone_id?: string | null
  context_source?: 'manual' | 'sequence' | 'mqtt'
}

export interface DeviceContextResponse {
  success: boolean
  config_type: 'sensor' | 'actuator'
  config_id: string
  active_zone_id: string | null
  active_subzone_id: string | null
  context_source: string
  context_since: string | null
}

// =============================================================================
// Zone Assignment Types
// =============================================================================

/**
 * Zone assignment request to assign ESP to a zone.
 */
export interface ZoneAssignRequest {
  zone_id: string
  master_zone_id?: string
  zone_name?: string
  /** Strategy for subzone handling during zone transfer (T13-R2) */
  subzone_strategy?: 'transfer' | 'copy' | 'reset'
}

/**
 * Zone assignment response from server.
 */
export interface ZoneAssignResponse {
  success: boolean
  message: string
  device_id: string
  zone_id: string
  master_zone_id?: string
  zone_name?: string
  mqtt_topic: string
  mqtt_sent: boolean
}

/**
 * Zone removal response from server.
 */
export interface ZoneRemoveResponse {
  success: boolean
  message: string
  device_id: string
  mqtt_topic: string
  mqtt_sent: boolean
}

/**
 * Zone info for display.
 */
export interface ZoneInfo {
  zone_id: string | null
  master_zone_id: string | null
  zone_name: string | null
  is_zone_master: boolean
  kaiser_id: string | null
}

/**
 * Zone list entry from GET /v1/zone/zones.
 * Includes empty zones (from ZoneContext table, 0 devices).
 */
export interface ZoneListEntry {
  zone_id: string
  zone_name: string | null
  device_count: number
  sensor_count: number
  actuator_count: number
}

/**
 * Response from GET /v1/zone/zones.
 */
export interface ZoneListResponse {
  zones: ZoneListEntry[]
  total: number
}

/**
 * Zone update from WebSocket (ESP ACK confirmation).
 */
export interface ZoneUpdate {
  esp_id: string
  status: 'zone_assigned' | 'error'
  zone_id: string
  master_zone_id?: string
  timestamp: number
  message?: string
}

// =============================================================================
// Subzone Management Types (Phase 9)
// =============================================================================

/**
 * Subzone information for display.
 */
export interface SubzoneInfo {
  subzone_id: string
  subzone_name: string | null
  parent_zone_id: string
  assigned_gpios: number[]
  safe_mode_active: boolean
  sensor_count: number
  actuator_count: number
  custom_data: Record<string, unknown>
  created_at?: string
}

/**
 * Subzone assignment request.
 */
export interface SubzoneAssignRequest {
  subzone_id: string
  subzone_name?: string
  parent_zone_id?: string
  assigned_gpios: number[]
  safe_mode_active?: boolean
}

/**
 * Subzone assignment response from server.
 */
export interface SubzoneAssignResponse {
  success: boolean
  message: string
  device_id: string
  subzone_id: string
  assigned_gpios: number[]
  mqtt_topic: string
  mqtt_sent: boolean
}

/**
 * Subzone removal response from server.
 */
export interface SubzoneRemoveResponse {
  success: boolean
  message: string
  device_id: string
  subzone_id: string
  mqtt_topic: string
  mqtt_sent: boolean
}

/**
 * Subzone list response from server.
 */
export interface SubzoneListResponse {
  success: boolean
  message: string
  device_id: string
  zone_id: string | null
  subzones: SubzoneInfo[]
  total_count: number
}

/**
 * Subzone update from WebSocket (ESP ACK confirmation).
 */
export interface SubzoneUpdate {
  device_id: string
  subzone_id: string
  status: 'subzone_assigned' | 'subzone_removed' | 'error'
  timestamp: number
  error_code?: number
  message?: string
}

/**
 * Safe-mode control request.
 */
export interface SafeModeRequest {
  reason?: string
}

/**
 * Safe-mode control response.
 */
export interface SafeModeResponse {
  success: boolean
  message: string
  device_id: string
  subzone_id: string
  safe_mode_active: boolean
  mqtt_sent: boolean
}
