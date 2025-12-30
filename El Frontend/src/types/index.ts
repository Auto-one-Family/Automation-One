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

export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'stale'

export interface MockSensor {
  gpio: number
  sensor_type: string
  name: string | null
  subzone_id?: string | null
  raw_value: number
  unit: string
  quality: QualityLevel
  raw_mode: boolean
  last_read: string | null
}

export interface MockActuator {
  gpio: number
  actuator_type: string
  name: string | null
  state: boolean
  pwm_value: number
  emergency_stopped: boolean
  last_command: string | null
}

export interface MockESP {
  esp_id: string
  name: string | null  // Human-readable device name (from DB)
  zone_id: string | null
  zone_name: string | null  // User-friendly zone name (allows spaces)
  master_zone_id: string | null
  subzone_id: string | null
  system_state: MockSystemState
  status: 'online' | 'offline'  // Connection status for consistent display
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
  subzone_id?: string
  raw_value?: number
  unit?: string
  quality?: QualityLevel
  raw_mode?: boolean
}

export interface MockActuatorConfig {
  gpio: number
  actuator_type: string
  name?: string
  state?: boolean
  pwm_value?: number
  min_value?: number
  max_value?: number
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
  // Configuration events
  | 'config_response'
  | 'zone_assignment'
  // System events (future use)
  | 'logic_execution'
  | 'system_event'

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
// Logic Types
// =============================================================================
export interface LogicRule {
  id: string
  name: string
  description: string | null
  enabled: boolean
  priority: number
  conditions: LogicCondition[]
  actions: LogicAction[]
  cooldown_seconds: number
  last_triggered: string | null
  trigger_count: number
  created_at: string
  updated_at: string
}

export interface LogicCondition {
  type: 'sensor' | 'time' | 'compound'
  sensor_gpio?: number
  sensor_esp_id?: string
  operator?: string
  value?: number
  time_start?: string
  time_end?: string
  days?: number[]
  logic?: 'AND' | 'OR'
  conditions?: LogicCondition[]
}

export interface LogicAction {
  type: 'actuator' | 'delay' | 'notification'
  actuator_gpio?: number
  actuator_esp_id?: string
  command?: string
  value?: number
  duration?: number
  delay_seconds?: number
  notification_type?: string
  notification_target?: string
  notification_message?: string
}

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
  metadata: Record<string, unknown> | null
  latest_value?: number | null
  latest_quality?: QualityLevel | null
  latest_timestamp?: string | null
  created_at: string
  updated_at: string
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
  status: 'success' | 'error'
  count: number
  message: string
  error_code?: string
  timestamp: number
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
