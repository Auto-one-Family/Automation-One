<script setup lang="ts">
/**
 * SystemMonitorView - Live Event Monitor
 *
 * SERVER-CENTRIC ARCHITECTURE:
 * - God-Kaiser Server ist Single Source of Truth
 * - Server liefert bereits menschenverständliche Messages
 * - Server liefert bereits berechnete Severities
 * - Frontend ist "Dumb Display Layer" - zeigt nur an
 *
 * Features:
 * - Live WebSocket Events von God-Kaiser Server
 * - Deutsche Fehlermeldungen VOM SERVER (100+ Mappings)
 * - Filter nach ESP, Level, Zeitraum, Event-Type
 * - URL-Sync für Deep-Linking
 * - Event-Details mit Server-Troubleshooting
 *
 * @see El Servador/god_kaiser_server/src/core/esp32_error_mapping.py - 100+ Error Mappings
 */

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useWebSocket } from '@/composables/useWebSocket'
import { useAuthStore } from '@/stores/auth'
import { useEspStore } from '@/stores/esp'
import { detectCategory } from '@/utils/errorCodeTranslator'
import { auditApi, type AuditStatistics, type StatisticsTimeRange, type DataSource, type UnifiedEventFromAPI } from '@/api/audit'
import type { UnifiedEvent } from '@/types/websocket-events'
import type { WebSocketMessage } from '@/services/websocket'
import { X, CheckCircle } from 'lucide-vue-next'

// Sub-Components
import MonitorTabs, { type TabId } from '@/components/system-monitor/MonitorTabs.vue'
import EventDetailsPanel from '@/components/system-monitor/EventDetailsPanel.vue'

// Tab Content Components
import EventsTab from '@/components/system-monitor/EventsTab.vue'
import ServerLogsTab from '@/components/system-monitor/ServerLogsTab.vue'
import DatabaseTab from '@/components/system-monitor/DatabaseTab.vue'
import MqttTrafficTab from '@/components/system-monitor/MqttTrafficTab.vue'
import CleanupPanel from '@/components/system-monitor/CleanupPanel.vue'

// ============================================================================
// Constants
// ============================================================================

// WICHTIG: Sehr hoher Wert um alle historischen Events anzuzeigen
// Virtual Scrolling in UnifiedEventList.vue kickt ab 200 Events ein für Performance
const MAX_EVENTS = 10000

// All event types we subscribe to (from Server WebSocket broadcasts)
// WICHTIG: Diese Liste muss ALLE event_types aus dem Server enthalten!
// Server-Referenz: El Servador/.../event_aggregator_service.py category_map
const ALL_EVENT_TYPES = [
  // Sensor & Actuator Events
  'sensor_data',
  'sensor_health',
  'actuator_status',
  'actuator_response',
  'actuator_alert',
  'esp_health',

  // Configuration Events
  'config_response',
  'config_published',
  'config_failed',

  // Device Lifecycle Events
  'device_discovered',
  'device_rediscovered',
  'device_approved',
  'device_rejected',
  'device_online',
  'device_offline',
  'lwt_received',

  // System Events
  'zone_assignment',
  'logic_execution',
  'system_event',
  'service_start',
  'service_stop',
  'emergency_stop',

  // Error Events
  'error_event',
  'mqtt_error',
  'validation_error',
  'database_error',

  // Auth Events
  'login_success',
  'login_failed',
  'logout',

  // Notifications
  'notification',
] as const

// German labels for event types (menschenverständlich)
// Note: 'events_restored' is handled separately via dedicated WebSocket handler
// WICHTIG: CSS hat text-transform:uppercase, daher werden diese in Großbuchstaben angezeigt
// Server-Referenz: El Servador/.../event_aggregator_service.py title_map
const EVENT_TYPE_LABELS: Record<string, string> = {
  // Sensor & Actuator Events
  sensor_data: 'Sensordaten',
  sensor_health: 'Sensor-Status',
  actuator_status: 'Aktor-Status',
  actuator_response: 'Aktor-Antwort',
  actuator_alert: 'Aktor-Alarm',
  esp_health: 'Heartbeat',

  // Configuration Events
  config_response: 'Konfiguration empfangen',
  config_published: 'Konfiguration gesendet',
  config_failed: 'Konfigurationsfehler',

  // Device Lifecycle Events
  device_discovered: 'Neues Gerät',
  device_rediscovered: 'Gerät wieder da',
  device_approved: 'Genehmigt',
  device_rejected: 'Abgelehnt',
  device_online: 'Gerät online',
  device_offline: 'Gerät offline',
  lwt_received: 'Verbindungsabbruch',

  // System Events
  zone_assignment: 'Zonen-Zuweisung',
  logic_execution: 'Regel ausgeführt',
  system_event: 'System',
  service_start: 'Server-Start',
  service_stop: 'Server-Stop',
  emergency_stop: 'Notfall-Stopp',

  // Error Events
  error_event: 'Fehler',
  mqtt_error: 'MQTT-Fehler',
  validation_error: 'Validierungsfehler',
  database_error: 'Datenbankfehler',

  // Auth Events
  login_success: 'Anmeldung erfolgreich',
  login_failed: 'Anmeldung fehlgeschlagen',
  logout: 'Abmeldung',

  // Notifications
  notification: 'Benachrichtigung',

  // Special (WebSocket only)
  events_restored: 'Wiederhergestellt',
}

// ============================================================================
// State
// ============================================================================

const route = useRoute()
const authStore = useAuthStore()
const espStore = useEspStore()
const selectedEvent = ref<UnifiedEvent | null>(null)

// Live-Pause State (persisted in localStorage)
const PAUSE_STORAGE_KEY = 'systemMonitor.isPaused'
const isPaused = ref(localStorage.getItem(PAUSE_STORAGE_KEY) === 'true')

// Watch for changes and persist to localStorage
watch(isPaused, (newValue) => {
  localStorage.setItem(PAUSE_STORAGE_KEY, String(newValue))
})

const unifiedEvents = ref<UnifiedEvent[]>([])
const isLoading = ref(false)
const showStats = ref(false)

// Mobile state
const isMobile = ref(false)

// Event Loading State
const eventLoadHours = ref<number | null>(null) // null = load ALL events (default)
const isLoadingMore = ref(false)
const currentLimitPerSource = ref(2000) // Track current limit for incremental "Load More"

// Total available events across all selected sources (from aggregated API)
const totalAvailableEvents = ref(0)

// Pagination State (Cursor-based for Infinite Scroll)
const paginationCursor = ref<string | null>(null)  // oldest_timestamp from last response
const hasMoreEvents = ref(true)  // Whether more events are available

// Data Source Selection (for CLIENT-SIDE filtering only - all sources loaded at mount)
// Default: ALLE Datenquellen für vollständige Event-Sicht
const selectedDataSources = ref<DataSource[]>(['audit_log', 'sensor_data', 'esp_health', 'actuators'])

// Audit Statistics & Admin Features
const statistics = ref<AuditStatistics | null>(null)
const showCleanupPanel = ref(false)

// Statistics Time Range Setting (persisted in localStorage)
const STORAGE_KEY = 'systemMonitor.statisticsTimeRange'
const statisticsTimeRange = ref<StatisticsTimeRange>(
  (localStorage.getItem(STORAGE_KEY) as StatisticsTimeRange) || '24h'
)

// Watch for changes and persist to localStorage
watch(statisticsTimeRange, (newValue) => {
  localStorage.setItem(STORAGE_KEY, newValue)
})

// Time range labels for display
const TIME_RANGE_LABELS: Record<StatisticsTimeRange, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  'all': 'Gesamt',
}

// Time range selector modal
const showTimeRangeSelector = ref(false)

// Filter state
const activeTab = ref<TabId>('events')
const filterEspId = ref<string>('')
const filterLevels = ref<Set<string>>(new Set(['info', 'warning', 'error', 'critical']))
const filterTimeRange = ref<'all' | '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'>('all')

// Custom Date Range for 'custom' timeRange
const customStartDate = ref<string | undefined>(undefined)
const customEndDate = ref<string | undefined>(undefined)

// Restored events highlighting (from backup restore)
const restoredEventIds = ref<Set<string>>(new Set())

// Server-Logs Zeitfenster (Feature 1.2)
const logsStartTime = ref<string | undefined>()
const logsEndTime = ref<string | undefined>()

// Toast notification state
const toastMessage = ref<string | null>(null)
const toastType = ref<'success' | 'error' | 'info'>('success')

// ============================================================================
// Composables
// ============================================================================

const { on } = useWebSocket({ autoConnect: true })
const wsUnsubscribers: (() => void)[] = []

// ============================================================================
// Computed
// ============================================================================

const filteredEvents = computed(() => {
  let events = unifiedEvents.value

  // ⭐ Filter by selected data sources (KATEGORISCH - ALLE Events filtern!)
  // Anders als severity/esp_id: DataSource-Änderung kann Events AUSSCHLIESSEN
  // die vorher inkludiert waren (z.B. User deselektiert "sensor_data")
  // Daher kein _sourceType Skip - alle Events müssen gegen aktuelle Auswahl geprüft werden
  events = events.filter(e => {
    // Events without dataSource are always shown (legacy/system events)
    if (!e.dataSource) return true
    return selectedDataSources.value.includes(e.dataSource)
  })

  // Filter by tab
  if (activeTab.value === 'mqtt') {
    events = events.filter(e => e.source === 'mqtt' || e.source === 'esp')
  } else if (activeTab.value === 'logs') {
    events = events.filter(e => e.source === 'server')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HYBRID-FILTER (Phase 4): Server-Events skippen, WebSocket-Events filtern
  // Server hat bereits nach severity/esp_ids gefiltert (Phase 3)
  // ═══════════════════════════════════════════════════════════════════════════

  // Filter by ESP ID (KATEGORISCH - ALLE Events filtern!)
  // Anders als ursprünglich angenommen: ESP-ID ist kategorisch, nicht additiv.
  // Wenn User von "Alle ESPs" zu "ESP_A" wechselt, müssen alte Events von
  // anderen ESPs ausgeschlossen werden. Daher KEIN _sourceType Skip.
  if (filterEspId.value) {
    const espFilter = filterEspId.value.toLowerCase()
    events = events.filter(e => {
      return e.esp_id?.toLowerCase().includes(espFilter)
    })
  }

  // Filter by severity level (KATEGORISCH - ALLE Events filtern!)
  // User kann Level ENTFERNEN (z.B. "Info" deaktivieren)
  // Alte Server-Events mit diesem Level müssen dann auch verschwinden
  events = events.filter(e => {
    if (!e.severity) return true  // Events ohne severity immer zeigen
    return filterLevels.value.has(e.severity)
  })

  // Event-Type-Filter ENTFERNT - DataSource-Filter ist ausreichend (Phase 5)

  // Filter by time range
  if (filterTimeRange.value !== 'all') {
    const now = Date.now()

    if (filterTimeRange.value === 'custom' && customStartDate.value && customEndDate.value) {
      // Custom date range: filter between start and end dates
      const startTime = new Date(customStartDate.value).getTime()
      const endTime = new Date(customEndDate.value).setHours(23, 59, 59, 999) // End of day
      events = events.filter(e => {
        const eventTime = new Date(e.timestamp).getTime()
        return eventTime >= startTime && eventTime <= endTime
      })
    } else {
      // Preset time ranges (relative to now)
      const ranges: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      }
      const cutoff = now - (ranges[filterTimeRange.value] || 0)
      events = events.filter(e => new Date(e.timestamp).getTime() > cutoff)
    }
  }

  return events
})

const eventCounts = computed(() => ({
  events: unifiedEvents.value.filter(e => e.severity === 'error' || e.severity === 'critical').length,
  logs: unifiedEvents.value.filter(e => e.source === 'server').length,
  mqtt: unifiedEvents.value.filter(e => e.source === 'mqtt' || e.source === 'esp').length,
}))

const uniqueEspIds = computed(() => {
  const ids = new Set<string>()
  unifiedEvents.value.forEach(e => {
    if (e.esp_id) ids.add(e.esp_id)
  })
  return Array.from(ids).sort()
})

// NOTE: ESP counts were moved to Dashboard - kept for potential future use
// const totalEspCount = computed(() => espStore.deviceCount)
// const onlineEspCount = computed(() => espStore.onlineDevices.length)

// hasMoreEvents is now a ref, updated from pagination.has_more in API response
// See: paginationCursor, hasMoreEvents refs in "Event Loading State" section

// ============================================================================
// Methods - Event Transformation
// ============================================================================

function handleWebSocketMessage(message: WebSocketMessage) {
  if (isPaused.value) return

  // ⭐ CHANGED: Don't filter here - add dataSource and let filteredEvents handle it
  const event = transformToUnifiedEvent(message)
  unifiedEvents.value.unshift(event)

  // WICHTIG: Kein Hard-Limit mehr - Virtual Scrolling handled Performance
  // MAX_EVENTS ist nur noch als Safety-Limit
  if (unifiedEvents.value.length > MAX_EVENTS) {
    console.warn(`[SystemMonitor] Event count exceeds MAX_EVENTS (${MAX_EVENTS}) after WebSocket message`)
    unifiedEvents.value = unifiedEvents.value.slice(0, MAX_EVENTS)
  }
}

/**
 * Handle events_restored WebSocket message from backup restore
 *
 * This is triggered when events are restored from a backup.
 * We reload the historical events and show a toast notification.
 */
async function handleEventsRestored(message: WebSocketMessage) {
  const data = message.data as {
    backup_id: string
    restored_count: number
    event_ids: string[]
    message: string
  }

  console.log('[SystemMonitor] Events restored:', data)

  // Show success toast
  showToast(`✅ ${data.message}`, 'success')

  // Store restored event IDs for highlighting
  data.event_ids.forEach(id => {
    restoredEventIds.value.add(`audit_${id}`)
  })

  // Clear highlight after 10 seconds
  setTimeout(() => {
    data.event_ids.forEach(id => {
      restoredEventIds.value.delete(`audit_${id}`)
    })
  }, 10000)

  // Reload historical events and statistics
  await Promise.all([
    loadHistoricalEvents(),
    loadStatistics(),
  ])
}

/**
 * Show a toast notification
 */
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  toastMessage.value = message
  toastType.value = type

  // Auto-hide after 6 seconds
  setTimeout(() => {
    toastMessage.value = null
  }, 6000)
}

/**
 * Hide the toast notification
 */
function hideToast() {
  toastMessage.value = null
}

function transformToUnifiedEvent(wsMessage: WebSocketMessage): UnifiedEvent {
  const data = wsMessage.data as Record<string, unknown>
  const eventType = wsMessage.type

  // Extract common fields
  const espId = extractEspId(data)
  const gpio = typeof data.gpio === 'number' ? data.gpio : undefined
  const errorCode = extractErrorCode(data)
  const severity = determineSeverity(wsMessage, errorCode)
  const source = determineSource(eventType)
  const message = generateGermanMessage(wsMessage, errorCode)

  // ⭐ NEW: Determine dataSource for client-side filtering
  const dataSource = determineDataSource(eventType)

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(wsMessage.timestamp * 1000).toISOString(),
    event_type: eventType,
    severity,
    source,
    dataSource,
    esp_id: espId,
    zone_id: typeof data.zone_id === 'string' ? data.zone_id : undefined,
    zone_name: typeof data.zone_name === 'string' ? data.zone_name : undefined,
    message,
    error_code: errorCode,
    error_category: errorCode ? detectCategory(errorCode) : undefined,
    gpio,
    device_type: typeof data.sensor_type === 'string' ? data.sensor_type : typeof data.actuator_type === 'string' ? data.actuator_type : undefined,
    data,
    // Phase 4: Tag as WebSocket event (needs client-side filtering)
    _sourceType: 'websocket',
  }
}

/**
 * Event-Type zu DataSource Mapping
 *
 * WICHTIG: Alle 31 Event-Types aus ALL_EVENT_TYPES muessen hier gemappt sein!
 * Ungmappte Events werden vom DataSource-Filter nicht korrekt gefiltert.
 *
 * Mapping-Logik:
 * - sensor_data: Sensor-Messwerte und Health
 * - esp_health: Device-Status (online/offline, LWT, Heartbeat)
 * - actuators: Aktor-Status, Commands, Alerts
 * - audit_log: Alle anderen System-Events (Config, Auth, Errors, etc.)
 */
const EVENT_TYPE_TO_DATASOURCE: Record<string, DataSource> = {
  // === SENSOR_DATA ===
  'sensor_data': 'sensor_data',
  'sensor_health': 'sensor_data',

  // === ESP_HEALTH (Device-Status) ===
  'esp_health': 'esp_health',
  'device_online': 'esp_health',
  'device_offline': 'esp_health',
  'lwt_received': 'esp_health',

  // === ACTUATORS ===
  'actuator_status': 'actuators',
  'actuator_response': 'actuators',
  'actuator_alert': 'actuators',

  // === AUDIT_LOG (System Events) ===
  // Configuration Events
  'config_response': 'audit_log',
  'config_published': 'audit_log',
  'config_failed': 'audit_log',
  // Device Lifecycle (Discovery/Approval)
  'device_discovered': 'audit_log',
  'device_rediscovered': 'audit_log',
  'device_approved': 'audit_log',
  'device_rejected': 'audit_log',
  // System Operations
  'zone_assignment': 'audit_log',
  'logic_execution': 'audit_log',
  'system_event': 'audit_log',
  'service_start': 'audit_log',
  'service_stop': 'audit_log',
  'emergency_stop': 'audit_log',
  // Error Events
  'error_event': 'audit_log',
  'mqtt_error': 'audit_log',
  'validation_error': 'audit_log',
  'database_error': 'audit_log',
  // Auth Events
  'login_success': 'audit_log',
  'login_failed': 'audit_log',
  'logout': 'audit_log',
  // Notifications
  'notification': 'audit_log',
}

// DEV-Mode Validierung: Warnung bei ungmappten Event-Types
if (import.meta.env.DEV) {
  const mappedTypes = new Set(Object.keys(EVENT_TYPE_TO_DATASOURCE))
  const unmappedTypes = ALL_EVENT_TYPES.filter(type => !mappedTypes.has(type))

  if (unmappedTypes.length > 0) {
    console.warn(
      '[SystemMonitor] Unmapped event types detected:',
      unmappedTypes,
      '\nThese events will bypass DataSource filtering!'
    )
  }
}

/**
 * Determine DataSource from event type for client-side filtering
 */
function determineDataSource(eventType: string): UnifiedEvent['dataSource'] {
  return EVENT_TYPE_TO_DATASOURCE[eventType]
}

function extractEspId(data: Record<string, unknown>): string | undefined {
  if (typeof data.esp_id === 'string') return data.esp_id
  if (typeof data.device_id === 'string') return data.device_id
  return undefined
}

function extractErrorCode(data: Record<string, unknown>): number | string | undefined {
  if (typeof data.error_code === 'number' || typeof data.error_code === 'string') {
    return data.error_code
  }
  return undefined
}

/**
 * Bestimmt Severity für Event-Anzeige.
 *
 * SERVER-CENTRIC: Nutzt primär data.severity vom Server.
 * Der Server hat die vollständige Error-Code-Logik (100+ Mappings)
 * und liefert bereits die korrekte Severity.
 *
 * Fallback: Nur wenn Server keine Severity schickt.
 */
function determineSeverity(wsMessage: WebSocketMessage, _errorCode?: number | string): UnifiedEvent['severity'] {
  const data = wsMessage.data as Record<string, unknown>
  const type = wsMessage.type

  // PRIMÄR: Server-Severity verwenden (wenn vorhanden)
  if (data.severity) {
    const serverSeverity = String(data.severity).toLowerCase()
    if (['info', 'warning', 'error', 'critical'].includes(serverSeverity)) {
      return serverSeverity as UnifiedEvent['severity']
    }
  }

  // FALLBACK: Typ-basierte Bestimmung (nur wenn Server keine Severity schickt)

  // Error events ohne Server-Severity
  if (type === 'error_event' || type === 'actuator_alert') {
    return 'error'
  }

  // ESP health status
  if (type === 'esp_health') {
    const status = data.status as string
    if (status === 'offline') return 'error'
    if (status === 'timeout') return 'warning'
    return 'info'
  }

  // Sensor health
  if (type === 'sensor_health') {
    const status = data.status as string
    if (status === 'timeout' || status === 'stale') return 'warning'
    return 'info'
  }

  // Config response
  if (type === 'config_response') {
    const status = data.status as string
    if (status === 'failed') return 'error'
    return 'info'
  }

  // Device rejected
  if (type === 'device_rejected') {
    return 'warning'
  }

  // Actuator response
  if (type === 'actuator_response') {
    const success = data.success as boolean
    if (!success) return 'error'
    return 'info'
  }

  // System event
  if (type === 'system_event') {
    const eventType = data.event_type as string
    if (eventType?.includes('error') || eventType?.includes('fail')) return 'error'
    if (eventType?.includes('warn')) return 'warning'
    return 'info'
  }

  return 'info'
}

function determineSource(eventType: string): UnifiedEvent['source'] {
  const espEvents = ['sensor_data', 'actuator_status', 'actuator_response', 'actuator_alert', 'esp_health', 'config_response', 'zone_assignment', 'sensor_health']
  const mqttEvents = ['sensor_data', 'actuator_status', 'esp_health']
  const logicEvents = ['logic_execution', 'notification']
  const userEvents = ['device_approved', 'device_rejected']

  if (userEvents.includes(eventType)) return 'user'
  if (logicEvents.includes(eventType)) return 'logic'
  if (mqttEvents.includes(eventType)) return 'mqtt'
  if (espEvents.includes(eventType)) return 'esp'
  return 'server'
}

/**
 * Generiert deutsche Nachrichten für Events.
 *
 * SERVER-CENTRIC: Nutzt primär data.message vom Server.
 * Der Server liefert bereits menschenverständliche deutsche Messages.
 *
 * Fallback: Nur für Events ohne Server-Message.
 */
function generateGermanMessage(wsMessage: WebSocketMessage, _errorCode?: number | string): string {
  const data = wsMessage.data as Record<string, unknown>
  const type = wsMessage.type

  // PRIMÄR: Server-Message verwenden (wenn vorhanden)
  // Der Server liefert bereits menschenverständliche deutsche Messages!
  if (data.message && typeof data.message === 'string') {
    const espId = extractEspId(data)
    // Für error_event: ESP-ID anhängen wenn nicht bereits enthalten
    if ((type === 'error_event' || type === 'actuator_alert') && espId && !data.message.includes(espId)) {
      return `${data.message} (${espId})`
    }
    return data.message
  }

  // FALLBACK: Typ-spezifische Messages (nur wenn Server keine Message schickt)
  switch (type) {
    case 'sensor_data': {
      const gpio = data.gpio ?? '?'
      const value = typeof data.value === 'number' ? data.value.toFixed(1) : '?'
      const unit = data.unit || ''
      const sensorType = data.sensor_type || 'Sensor'
      return `${sensorType} GPIO ${gpio}: ${value}${unit}`
    }

    case 'sensor_health': {
      const gpio = data.gpio ?? '?'
      const status = data.status as string
      const statusText = status === 'timeout' ? 'Timeout' : status === 'stale' ? 'Veraltet' : 'OK'
      return `Sensor GPIO ${gpio}: ${statusText}`
    }

    case 'actuator_status': {
      const gpio = data.gpio ?? '?'
      const state = data.state ? 'EIN' : 'AUS'
      const actuatorType = data.actuator_type || 'Aktor'
      return `${actuatorType} GPIO ${gpio}: ${state}`
    }

    case 'actuator_response': {
      const gpio = data.gpio ?? '?'
      const success = data.success as boolean
      const command = data.command || 'Befehl'
      return success ? `Aktor GPIO ${gpio}: ${command} erfolgreich` : `Aktor GPIO ${gpio}: ${command} fehlgeschlagen`
    }

    case 'actuator_alert': {
      const gpio = data.gpio ?? '?'
      const alertType = data.alert_type as string
      const alerts: Record<string, string> = {
        emergency_stop: 'Not-Aus aktiviert',
        timeout: 'Timeout erreicht',
        runtime_exceeded: 'Laufzeit überschritten',
        safety_triggered: 'Sicherheitsstopp',
      }
      return `Aktor GPIO ${gpio}: ${alerts[alertType] || alertType}`
    }

    case 'esp_health': {
      const espId = extractEspId(data) || 'Unbekannt'
      const status = data.status as string
      if (status === 'offline') return `${espId} ist offline`
      if (status === 'timeout') return `${espId} Heartbeat-Timeout`
      const heap = typeof data.heap_free === 'number' ? Math.round(data.heap_free / 1024) : '?'
      const rssi = data.wifi_rssi ?? '?'
      return `${espId} online (${heap}KB frei, RSSI: ${rssi}dBm)`
    }

    case 'config_response': {
      const status = data.status as string
      const espId = extractEspId(data) || 'Unbekannt'
      if (status === 'success') return `${espId}: Konfiguration übernommen`
      const errorMsg = data.message || 'Unbekannter Fehler'
      return `${espId}: Konfiguration fehlgeschlagen - ${errorMsg}`
    }

    case 'device_discovered': {
      const espId = extractEspId(data) || 'Unbekannt'
      const zoneName = data.zone_name || data.zone_id
      return zoneName ? `Neues Gerät ${espId} entdeckt (Zone: ${zoneName})` : `Neues Gerät ${espId} entdeckt`
    }

    case 'device_rediscovered': {
      const espId = extractEspId(data) || 'Unbekannt'
      return `Gerät ${espId} wieder online`
    }

    case 'device_approved': {
      const deviceId = data.device_id || 'Unbekannt'
      const approvedBy = data.approved_by || 'Admin'
      return `Gerät ${deviceId} von ${approvedBy} genehmigt`
    }

    case 'device_rejected': {
      const deviceId = data.device_id || 'Unbekannt'
      const reason = data.rejection_reason || 'Kein Grund angegeben'
      return `Gerät ${deviceId} abgelehnt: ${reason}`
    }

    case 'zone_assignment': {
      const espId = extractEspId(data) || 'Unbekannt'
      const zoneId = data.zone_id || 'Unbekannt'
      const status = data.status as string
      if (status === 'success') return `${espId} Zone ${zoneId} zugewiesen`
      return `${espId} Zonen-Zuweisung fehlgeschlagen`
    }

    case 'logic_execution': {
      const ruleName = data.rule_name || 'Regel'
      const success = data.success as boolean
      const actions = data.actions_executed ?? 0
      if (success) return `Regel "${ruleName}" ausgeführt (${actions} Aktionen)`
      return `Regel "${ruleName}" fehlgeschlagen`
    }

    case 'system_event': {
      return String(data.message || 'System-Ereignis')
    }

    case 'error_event': {
      const msg = data.message || 'Unbekannter Fehler'
      return String(msg)
    }

    case 'notification': {
      const title = data.title || 'Benachrichtigung'
      const msg = data.message || ''
      return `${title}: ${msg}`
    }

    default:
      return `Event: ${type}`
  }
}

// ============================================================================
// Methods - Load Historical Events
// ============================================================================

/**
 * Build server-side filter parameters for API calls
 * Extracted to avoid code duplication between loadHistoricalEvents and handleLoadMore
 */
function buildServerFilterParams(options?: {
  hours?: number | null
  limitPerSource?: number
}) {
  // Severity filter only makes sense when audit_log is included
  const severityForServer = selectedDataSources.value.includes('audit_log')
    ? Array.from(filterLevels.value)
    : undefined

  // ESP-ID filter for server (if set)
  const espIdsForServer = filterEspId.value ? [filterEspId.value] : undefined

  return {
    sources: selectedDataSources.value,
    hours: options?.hours ?? eventLoadHours.value,
    limitPerSource: options?.limitPerSource ?? currentLimitPerSource.value,
    severity: severityForServer,
    espIds: espIdsForServer,
  }
}

/**
 * Load more historical events using cursor-based pagination
 *
 * Uses `before_timestamp` cursor from previous response to load older events.
 * This is the Infinite Scroll implementation.
 */
async function handleLoadMore(): Promise<void> {
  if (isLoadingMore.value || !hasMoreEvents.value) return

  isLoadingMore.value = true
  try {
    console.log(`[SystemMonitor] Load More: cursor=${paginationCursor.value ?? 'initial'}`)

    // Build params with pagination cursor
    const params = buildServerFilterParams()

    // Add pagination cursor if we have one (for subsequent loads)
    const response = await auditApi.getAggregatedEvents({
      ...params,
      beforeTimestamp: paginationCursor.value ?? undefined,
    })

    // Update pagination state from response
    hasMoreEvents.value = response.pagination.has_more
    paginationCursor.value = response.pagination.oldest_timestamp
    totalAvailableEvents.value = response.pagination.total_available

    // Transform and add to events list
    const historicalEvents = response.events.map(transformAggregatedEventToUnified)

    // Merge with existing events, avoiding duplicates
    const existingIds = new Set(unifiedEvents.value.map(e => e.id))
    const newEvents = historicalEvents.filter(e => !existingIds.has(e.id))

    // Add historical events (append to end since we're loading older events)
    unifiedEvents.value = [...unifiedEvents.value, ...newEvents]

    // Sort by timestamp (newest first)
    unifiedEvents.value.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // WICHTIG: Kein Hard-Limit mehr - Virtual Scrolling handled Performance
    if (unifiedEvents.value.length > MAX_EVENTS) {
      console.warn(`[SystemMonitor] Event count exceeds MAX_EVENTS (${MAX_EVENTS}). This should not happen in normal operation.`)
      unifiedEvents.value = unifiedEvents.value.slice(0, MAX_EVENTS)
    }

    console.log(`[SystemMonitor] Loaded ${newEvents.length} more events (total: ${unifiedEvents.value.length}, hasMore: ${hasMoreEvents.value})`)
  } catch (error) {
    console.error('[SystemMonitor] Failed to load more events:', error)
  } finally {
    isLoadingMore.value = false
  }
}

/**
 * Load historical events from Aggregated Events API
 *
 * ⭐ CHANGED: Always loads ALL sources (client-side filtering handles visibility)
 * ⭐ NEW: By default loads ALL events (eventLoadHours=null), not just recent ones
 *
 * Uses the new multi-source aggregator that combines:
 * - audit_log: System events, config responses, errors
 * - sensor_data: Sensor readings from database
 * - esp_health: ESP device status/heartbeats
 * - actuators: Actuator command history
 */
async function loadHistoricalEvents(): Promise<void> {
  isLoading.value = true

  // Reset pagination state (fresh load, not "load more")
  paginationCursor.value = null
  hasMoreEvents.value = true

  try {
    // Load events from user-selected data sources (persisted via DataSourceSelector)
    // Client-side filtering in filteredEvents handles additional visibility filters
    console.log('[DEBUG] loadHistoricalEvents called with selected sources:', selectedDataSources.value, 'hours:', eventLoadHours.value ?? 'ALL')

    // WICHTIG: Sehr hoher limitPerSource um alle historischen Events zu laden
    // Virtual Scrolling in UnifiedEventList kickt ab 200 Events automatisch ein
    const response = await auditApi.getAggregatedEvents(buildServerFilterParams())

    // Update pagination state from aggregated response
    hasMoreEvents.value = response.pagination.has_more
    paginationCursor.value = response.pagination.oldest_timestamp
    totalAvailableEvents.value = response.pagination.total_available

    console.log('[DEBUG] API response:', {
      eventCount: response.events.length,
      totalLoaded: response.total_loaded,
      totalAvailable: response.total_available,
      sources: response.sources,
      sourceCounts: response.source_counts,  // ← CRITICAL: Wie viele Events pro Quelle?
      firstEvent: response.events[0],
      eventTypes: [...new Set(response.events.map(e => e.source))]
    })

    // ⭐ CRITICAL DEBUG: Zeige Sensor-Events explizit
    const sensorEvents = response.events.filter(e => e.source === 'sensor_data')
    console.log('[DEBUG] Sensor Events in Response:', {
      count: sensorEvents.length,
      first5: sensorEvents.slice(0, 5).map(e => ({
        id: e.id,
        title: e.title,
        message: e.message,
        timestamp: e.timestamp
      }))
    })

    // Transform API events to frontend UnifiedEvent format
    const historicalEvents = response.events.map(transformAggregatedEventToUnified)

    console.log('[DEBUG] After transform:', {
      count: historicalEvents.length,
      firstEvent: historicalEvents[0],
      eventTypes: [...new Set(historicalEvents.map(e => e.event_type))],
      dataSources: [...new Set(historicalEvents.map(e => e.dataSource))],
      sensorEventsCount: historicalEvents.filter(e => e.dataSource === 'sensor_data').length
    })

    // Merge with existing events, avoiding duplicates
    const existingIds = new Set(unifiedEvents.value.map(e => e.id))
    const newEvents = historicalEvents.filter(e => !existingIds.has(e.id))

    console.log('[DEBUG] After duplicate filter:', {
      before: historicalEvents.length,
      after: newEvents.length,
      duplicatesRemoved: historicalEvents.length - newEvents.length,
      existingCount: existingIds.size,
      newSensorEvents: newEvents.filter(e => e.dataSource === 'sensor_data').length
    })

    // Add historical events (they come sorted by timestamp DESC from API)
    unifiedEvents.value = [...unifiedEvents.value, ...newEvents]

    // Sort by timestamp (newest first)
    unifiedEvents.value.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // WICHTIG: Kein Hard-Limit mehr - Virtual Scrolling handled Performance
    // MAX_EVENTS ist nur noch als Safety-Limit für extreme Fälle gedacht
    if (unifiedEvents.value.length > MAX_EVENTS) {
      console.warn(`[SystemMonitor] Event count exceeds MAX_EVENTS (${MAX_EVENTS}). This should not happen in normal operation.`)
      unifiedEvents.value = unifiedEvents.value.slice(0, MAX_EVENTS)
    }

    // ⭐ CRITICAL DEBUG: Finale Filter-Statistiken
    console.log('[DEBUG] Final unifiedEvents:', {
      totalInMemory: unifiedEvents.value.length,
      byDataSource: {
        audit_log: unifiedEvents.value.filter(e => e.dataSource === 'audit_log').length,
        sensor_data: unifiedEvents.value.filter(e => e.dataSource === 'sensor_data').length,
        esp_health: unifiedEvents.value.filter(e => e.dataSource === 'esp_health').length,
        actuators: unifiedEvents.value.filter(e => e.dataSource === 'actuators').length,
        undefined: unifiedEvents.value.filter(e => !e.dataSource).length
      },
      filterSettings: {
        selectedDataSources: selectedDataSources.value,
        filterLevels: Array.from(filterLevels.value),
        filterEspId: filterEspId.value,
        filterTimeRange: filterTimeRange.value
      },
      filteredCount: filteredEvents.value.length
    })

    console.log(`[SystemMonitor] Loaded ${newEvents.length} historical events from ${response.sources.length} source(s)`)
    console.log(`[SystemMonitor] ⚠️ Zeige ${filteredEvents.value.length} von ${unifiedEvents.value.length} Events (${unifiedEvents.value.length - filteredEvents.value.length} durch Filter versteckt)`)
  } catch (error) {
    console.error('[SystemMonitor] Failed to load historical events:', error)
  } finally {
    isLoading.value = false
  }
}

/**
 * Normalisiert einen Timestamp zu UTC ISO-Format.
 * Server sendet manchmal naive Timestamps (ohne 'Z'),
 * die der Browser fälschlich als Lokalzeit interpretiert.
 *
 * @param timestamp - ISO-String vom Server (z.B. "2026-01-26T17:32:02")
 * @returns ISO-String mit UTC-Marker (z.B. "2026-01-26T17:32:02Z")
 */
function normalizeToUTCIso(timestamp: string): string {
  // Prüfe ob bereits Timezone-Info vorhanden (Z, +00:00, -05:00, etc.)
  if (timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.match(/-\d{2}:\d{2}$/)) {
    return timestamp
  }
  // Füge 'Z' hinzu um als UTC zu markieren
  return timestamp + 'Z'
}

/**
 * Transform aggregated API event to frontend UnifiedEvent format
 */
function transformAggregatedEventToUnified(apiEvent: UnifiedEventFromAPI): UnifiedEvent {
  const metadata = apiEvent.metadata || {}

  // Map API source to frontend source
  const sourceMapping: Record<string, UnifiedEvent['source']> = {
    'audit_log': 'server',
    'sensor_data': 'esp',
    'esp_health': 'esp',
    'actuators': 'esp',
  }

  // Map source-specific event types
  let eventType = 'system_event'
  if (apiEvent.source === 'sensor_data') {
    eventType = 'sensor_data'
  } else if (apiEvent.source === 'esp_health') {
    eventType = 'esp_health'
  } else if (apiEvent.source === 'actuators') {
    eventType = 'actuator_status'
  } else if (metadata.event_type) {
    eventType = String(metadata.event_type)
  }

  // ⭐ NEW: Keep original dataSource for client-side filtering
  const dataSource = apiEvent.source as DataSource

  return {
    id: apiEvent.id,
    timestamp: normalizeToUTCIso(apiEvent.timestamp),
    event_type: eventType,
    severity: apiEvent.severity,
    source: sourceMapping[apiEvent.source] || 'server',
    dataSource,
    esp_id: apiEvent.device_id || undefined,
    zone_id: metadata.zone_id as string | undefined,
    zone_name: metadata.zone_name as string | undefined,
    message: apiEvent.message,
    error_code: metadata.error_code as string | number | undefined,
    error_category: metadata.error_code ? detectCategory(metadata.error_code as string | number) : undefined,
    gpio: metadata.gpio as number | undefined,
    device_type: (metadata.sensor_type || metadata.actuator_type) as string | undefined,
    data: metadata,
    // Phase 4: Tag as server-loaded event (already filtered by server, skip client-side filter)
    _sourceType: 'server',
  }
}

// ============================================================================
// Methods - UI Actions
// ============================================================================

function handleTabChange(tabId: TabId) {
  activeTab.value = tabId
}

function handleFilterDevice(espId: string) {
  filterEspId.value = espId
  activeTab.value = 'events'
  selectedEvent.value = null

  // Show toast with filtered event count
  nextTick(() => {
    const count = filteredEvents.value.length
    showToast(`${count} Event${count !== 1 ? 's' : ''} für ${espId} gefunden`, 'info')
  })
}

function handleShowServerLogs(event: UnifiedEvent) {
  const timestamp = new Date(event.timestamp).getTime()
  logsStartTime.value = new Date(timestamp - 30000).toISOString()
  logsEndTime.value = new Date(timestamp + 30000).toISOString()
  activeTab.value = 'logs'
  selectedEvent.value = null
}

/**
 * Handle data source selection change
 *
 * ⭐ CHANGED: No reload needed - just update selection for client-side filtering
 * filteredEvents computed will handle visibility automatically
 */
async function handleDataSourcesChange(sources: DataSource[]): Promise<void> {
  selectedDataSources.value = sources
  // That's it! filteredEvents computed handles the rest via client-side filtering
}

function togglePause() {
  const waspaused = isPaused.value
  isPaused.value = !isPaused.value

  // On resume (Pause → Live): reload historical events to catch up on missed ones
  if (waspaused && !isPaused.value) {
    loadHistoricalEvents()
  }
}

function handleExport() {
  const data = JSON.stringify(filteredEvents.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `system-monitor-${activeTab.value}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// NOTE: Refresh functionality removed from header - manual refresh via filter changes
// async function handleRefresh() {
//   await loadHistoricalEvents()
// }

function selectEvent(event: UnifiedEvent) {
  selectedEvent.value = event
}

function closeEventDetails() {
  selectedEvent.value = null
}

// NOTE: Stats toggle moved to Cleanup Panel - statistics accessible there
// function toggleStats() {
//   showStats.value = !showStats.value
//   if (showStats.value && !statistics.value) {
//     loadStatistics()
//   }
// }

// ============================================================================
// Methods - Audit Admin Features
// ============================================================================

async function loadStatistics() {
  try {
    statistics.value = await auditApi.getStatistics(statisticsTimeRange.value)
  } catch (err) {
    console.error('[SystemMonitor] Failed to load statistics:', err)
  }
}

/**
 * Change statistics time range and reload
 */
async function changeStatisticsTimeRange(range: StatisticsTimeRange) {
  statisticsTimeRange.value = range
  await loadStatistics()
}

/**
 * Get computed label for error count
 */
const errorStatLabel = computed(() => `Fehler (${TIME_RANGE_LABELS[statisticsTimeRange.value]})`)

/**
 * Handler for cleanup panel success - reload stats
 */
async function handleCleanupSuccess() {
  await Promise.all([
    loadStatistics(),
    loadHistoricalEvents(),
  ])
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('de-DE').format(num)
}

// Mobile detection
function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

function handleResize() {
  checkMobile()
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  // Initialize mobile detection
  checkMobile()
  window.addEventListener('resize', handleResize)

  // Read URL params for deep-linking (esp handled by watcher with immediate: true)
  if (route.query.tab) {
    const tab = String(route.query.tab) as TabId
    if (['events', 'logs', 'database', 'mqtt'].includes(tab)) {
      activeTab.value = tab
    }
  }
  if (route.query.timeRange) {
    const range = String(route.query.timeRange)
    if (['all', '1h', '6h', '24h', '7d', '30d', 'custom'].includes(range)) {
      filterTimeRange.value = range as typeof filterTimeRange.value
    }
  }

  // Subscribe to all event types for live updates
  ALL_EVENT_TYPES.forEach(eventType => {
    wsUnsubscribers.push(on(eventType, handleWebSocketMessage))
  })

  // Subscribe to special system events (like events_restored)
  wsUnsubscribers.push(on('events_restored', handleEventsRestored))

  // Load historical events from Audit Log
  await loadHistoricalEvents()

  // Load statistics for header display (total DB events)
  loadStatistics()

  // Ensure ESP Store has current data for header ESP count
  espStore.fetchAll()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  wsUnsubscribers.forEach(unsub => unsub())
  wsUnsubscribers.length = 0
})

// Watch for URL changes (deep-linking from other views)
// immediate: true ensures this runs on mount, eliminating duplicate init in onMounted
watch(() => route.query.esp, (newEsp) => {
  filterEspId.value = newEsp ? String(newEsp) : ''
}, { immediate: true })

// Watch for server-side filter changes to trigger reload
// These filters are now sent to the server for efficient filtering
// All three affect buildServerFilterParams() - must trigger reload when changed
let filterReloadTimeout: ReturnType<typeof setTimeout> | null = null
watch(
  [selectedDataSources, filterLevels, filterEspId],
  () => {
    // Debounce to avoid multiple rapid API calls
    if (filterReloadTimeout) {
      clearTimeout(filterReloadTimeout)
    }
    filterReloadTimeout = setTimeout(() => {
      // Only reload if we're on the events tab and not already loading
      if (activeTab.value === 'events' && !isLoading.value) {
        console.log('[SystemMonitor] Server-side filters changed, reloading events')
        loadHistoricalEvents()
      }
    }, 300)  // 300ms debounce
  },
  { deep: true }
)

// Logs-Zeitfenster zurücksetzen bei Tab-Wechsel weg von logs
watch(activeTab, (newTab) => {
  if (newTab !== 'logs') {
    logsStartTime.value = undefined
    logsEndTime.value = undefined
  }
})

// Auto-scroll to active tab on mobile
watch(activeTab, (newTab) => {
  if (isMobile.value) {
    nextTick(() => {
      const tabElement = document.querySelector(`[data-tab="${newTab}"]`)
      if (tabElement) {
        tabElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        })
      }
    })
  }
})
</script>

<template>
  <div class="system-monitor">
    <!-- Consolidated Tab Bar (Live Toggle + Tabs + Actions) -->
    <MonitorTabs
      :active-tab="activeTab"
      :event-counts="eventCounts"
      :is-paused="isPaused"
      :is-admin="authStore.isAdmin"
      @update:active-tab="handleTabChange"
      @toggle-pause="togglePause"
      @export="handleExport"
      @open-cleanup-panel="showCleanupPanel = true"
    />

    <!-- Statistics Bar (collapsible) - ENTFERNT: showStats immer false, Stats nun via Cleanup-Panel -->
    <Transition name="slide-down">
      <div v-if="showStats && statistics" class="stats-bar">
        <!-- Gesamt (DB) -->
        <div class="stats-bar__item stats-bar__item--with-tooltip">
          <div class="stats-bar__content">
            <span class="stats-bar__label">Gesamt (DB)</span>
            <span class="stats-bar__value">{{ formatNumber(statistics.total_count) }}</span>
          </div>
          <div class="stats-bar__tooltip">
            Alle Events in der Datenbank gespeichert (inkl. archivierte).
            Im Header sehen Sie nur die geladenen Events.
          </div>
        </div>

        <!-- Fehler mit Zeitraum-Selector -->
        <div
          class="stats-bar__item stats-bar__item--error stats-bar__item--clickable stats-bar__item--with-tooltip"
          @click="showTimeRangeSelector = true"
        >
          <div class="stats-bar__content">
            <span class="stats-bar__label">{{ errorStatLabel }}</span>
            <span class="stats-bar__value">{{ formatNumber(statistics.count_by_severity.error || 0) }}</span>
          </div>
          <div class="stats-bar__tooltip">
            Fehler und kritische Events im gewählten Zeitraum.
            Klicken Sie, um den Zeitraum zu ändern.
          </div>
        </div>

        <!-- Speicher -->
        <div class="stats-bar__item stats-bar__item--with-tooltip">
          <div class="stats-bar__content">
            <span class="stats-bar__label">Speicher</span>
            <span class="stats-bar__value">{{ statistics.storage_estimate_mb }} MB</span>
          </div>
          <div class="stats-bar__tooltip">
            Geschätzter Speicherplatz aller Events in der Datenbank.
          </div>
        </div>

        <!-- Löschbar (statt "Zu bereinigen") -->
        <div class="stats-bar__item stats-bar__item--warning stats-bar__item--with-tooltip">
          <div class="stats-bar__content">
            <span class="stats-bar__label">Löschbar</span>
            <span class="stats-bar__value">{{ formatNumber(statistics.pending_cleanup_count) }}</span>
          </div>
          <div class="stats-bar__tooltip">
            Events die laut Retention-Regeln gelöscht werden können.
            Diese werden beim nächsten Auto-Cleanup entfernt
            (falls aktiviert) oder manuell via Bereinigungspanel.
          </div>
        </div>
      </div>
    </Transition>

    <!-- Content -->
    <main class="monitor-content">
      <!-- Events Tab (with integrated filter controls) -->
      <EventsTab
        v-if="activeTab === 'events'"
        :filtered-events="filteredEvents"
        :total-available-events="totalAvailableEvents"
        :has-more-events="hasMoreEvents"
        :is-loading-more="isLoadingMore"
        :is-paused="isPaused"
        :event-type-labels="EVENT_TYPE_LABELS"
        :restored-event-ids="restoredEventIds"
        :filter-esp-id="filterEspId"
        :filter-levels="filterLevels"
        :filter-time-range="filterTimeRange"
        :unique-esp-ids="uniqueEspIds"
        :custom-start-date="customStartDate"
        :custom-end-date="customEndDate"
        @data-sources-change="handleDataSourcesChange"
        @update:filter-esp-id="filterEspId = $event"
        @update:filter-levels="filterLevels = $event"
        @update:filter-time-range="filterTimeRange = $event"
        @update:custom-start-date="customStartDate = $event"
        @update:custom-end-date="customEndDate = $event"
        @load-more="handleLoadMore"
        @select="selectEvent"
      />

      <!-- Server Logs Tab -->
      <ServerLogsTab
        v-else-if="activeTab === 'logs'"
        :initial-start-time="logsStartTime"
        :initial-end-time="logsEndTime"
      />

      <!-- Database Tab -->
      <DatabaseTab
        v-else-if="activeTab === 'database'"
      />

      <!-- MQTT Traffic Tab - v-show statt v-if damit Messages weiter gesammelt werden -->
      <MqttTrafficTab
        v-show="activeTab === 'mqtt'"
        :esp-id="filterEspId || undefined"
      />
    </main>

    <!-- Event Details Panel -->
    <Transition name="slide-up">
      <EventDetailsPanel
        v-if="selectedEvent"
        :event="selectedEvent"
        :event-type-labels="EVENT_TYPE_LABELS"
        @close="closeEventDetails"
        @filter-device="handleFilterDevice"
        @show-server-logs="handleShowServerLogs"
      />
    </Transition>

    <!-- Cleanup Panel (Consolidated Retention + Backup Management) -->
    <CleanupPanel
      :show="showCleanupPanel"
      @close="showCleanupPanel = false"
      @cleanup-success="handleCleanupSuccess"
      @restore-success="handleCleanupSuccess"
    />

    <!-- Time Range Selector Modal -->
    <Teleport to="body">
      <div v-if="showTimeRangeSelector" class="modal-overlay" @click.self="showTimeRangeSelector = false">
        <div class="modal-content modal-content--compact">
          <div class="modal-header">
            <h3 class="modal-title">Fehler-Zeitraum</h3>
            <button class="modal-close" @click="showTimeRangeSelector = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body">
            <p class="text-sm mb-4" style="color: var(--color-text-secondary)">
              Wählen Sie den Zeitraum für die Fehler-Statistik:
            </p>
            <div class="time-range-buttons">
              <button
                v-for="(label, range) in TIME_RANGE_LABELS"
                :key="range"
                class="time-range-btn"
                :class="{ 'time-range-btn--active': statisticsTimeRange === range }"
                @click="changeStatisticsTimeRange(range as StatisticsTimeRange); showTimeRangeSelector = false"
              >
                {{ label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast Notification -->
    <Teleport to="body">
      <Transition name="toast">
        <div
          v-if="toastMessage"
          class="toast"
          :class="`toast--${toastType}`"
          @click="hideToast"
        >
          <CheckCircle v-if="toastType === 'success'" class="toast__icon" />
          <span class="toast__message">{{ toastMessage }}</span>
          <button class="toast__close" @click.stop="hideToast">
            <X class="w-4 h-4" />
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.system-monitor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;  /* ⭐ KRITISCH: Erlaubt Flexbox-Children korrekte Höhenberechnung */
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* Content */
.monitor-content {
  flex: 1;
  display: flex;  /* ⭐ FIX: Flexbox für Kinder (EventsTab, ServerLogsTab, etc.) */
  flex-direction: column;
  overflow: hidden;
  min-height: 0;  /* ⭐ KRITISCH: Erlaubt Flexbox-Children korrekte Höhenberechnung */
}

/* .monitor-tab-content ENTFERNT - nicht verwendet, könnte Verwirrung stiften */

/* ============================================================================
   Mobile: FAB (Floating Action Button) for Filters - Iridescent
   ============================================================================ */
.filter-fab {
  position: fixed;
  bottom: var(--space-lg);
  right: var(--space-lg);
  z-index: var(--z-fixed);
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--gradient-iridescent);
  box-shadow:
    0 4px 20px rgba(96, 165, 250, 0.4),
    var(--glass-shadow-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.2);
  color: white;
  transition: all var(--transition-slow);
}

/* Animated glow ring */
.filter-fab::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: var(--radius-full);
  background: var(--gradient-iridescent-full);
  opacity: 0;
  z-index: -1;
  transition: opacity var(--transition-base);
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.1); opacity: 0.5; }
}

.filter-fab:hover {
  transform: scale(1.1) translateY(-2px);
  box-shadow:
    0 8px 30px rgba(96, 165, 250, 0.5),
    0 0 40px rgba(96, 165, 250, 0.3);
}

.filter-fab:hover::before {
  opacity: 0.6;
}

.filter-fab:active {
  transform: scale(0.95);
}

/* Active state - Magenta shift */
.filter-fab--active {
  background: linear-gradient(135deg,
    var(--color-iridescent-3) 0%,
    var(--color-iridescent-4) 100%
  );
  box-shadow:
    0 4px 20px rgba(167, 139, 250, 0.4),
    0 0 30px rgba(192, 132, 252, 0.3);
}

.filter-fab--active::before {
  background: linear-gradient(135deg, #f093fb 0%, #c084fc 100%);
}

.filter-fab--active:hover {
  box-shadow:
    0 8px 30px rgba(167, 139, 250, 0.5),
    0 0 50px rgba(192, 132, 252, 0.4);
}

/* Badge */
.filter-fab__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: linear-gradient(135deg, var(--color-error) 0%, #f43f5e 100%);
  color: white;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  min-width: 22px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(248, 113, 113, 0.5);
  border: 2px solid var(--color-bg-primary);
}

/* ============================================================================
   Mobile: Backdrop for Filter Panel - Glassmorphism
   ============================================================================ */
.filter-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 15, 0.7);
  z-index: calc(var(--z-fixed) - 1);
  backdrop-filter: blur(6px);
}

/* ============================================================================
   Transitions - Smooth & Modern
   ============================================================================ */

/* Slide up (for mobile filter panel and details panel) */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--transition-slow);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Slide down (for desktop filter panel and stats bar) */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all var(--transition-slow);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-1rem);
  max-height: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 500px;
}

/* Fade (for backdrop) */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-slow);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ============================================================================
   Mobile Responsive
   ============================================================================ */
@media (max-width: 768px) {
  /* Touch-friendly spacing */
  .monitor-content {
    padding-bottom: 5rem; /* Space for FAB */
  }

  /* Full-width modals on mobile */
  .modal-overlay {
    padding: 0;
  }

  .modal-content {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .modal-content--wide {
    max-width: 100%;
  }
}

/* ============================================================================
   Statistics Bar - Iridescent Cards
   ============================================================================ */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--glass-bg-light);
  border-bottom: 1px solid var(--glass-border);
  backdrop-filter: blur(8px);
}

.stats-bar__item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  transition: all var(--transition-base);
  position: relative;
  overflow: visible; /* Changed from hidden to allow tooltip overflow */
}

/* Tooltip Support */
.stats-bar__item--with-tooltip {
  cursor: help;
}

.stats-bar__tooltip {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  padding: var(--space-sm) var(--space-md);
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 0.75rem;
  line-height: 1.5;
  text-align: center;
  min-width: 220px;
  max-width: 280px;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0.2s;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    0 0 1px rgba(255, 255, 255, 0.1);
  pointer-events: none;
}

.stats-bar__tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: rgba(0, 0, 0, 0.95);
}

.stats-bar__item--with-tooltip:hover .stats-bar__tooltip {
  opacity: 1;
  visibility: visible;
}

/* Iridescent border glow on hover */
.stats-bar__item::before {
  content: '';
  position: absolute;
  inset: -2px;
  background: var(--gradient-iridescent-full);
  border-radius: var(--radius-xl);
  opacity: 0;
  z-index: -1;
  transition: opacity var(--transition-base);
}

.stats-bar__item:hover::before {
  opacity: 0.2;
}

.stats-bar__item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

/* Error Card - Red glow */
.stats-bar__item--error {
  background: linear-gradient(135deg,
    rgba(248, 113, 113, 0.08) 0%,
    rgba(248, 113, 113, 0.03) 100%
  );
  border-color: rgba(248, 113, 113, 0.25);
}

.stats-bar__item--error::before {
  background: linear-gradient(135deg, var(--color-error) 0%, #f43f5e 100%);
}

.stats-bar__item--error:hover {
  box-shadow: 0 0 25px rgba(248, 113, 113, 0.25);
}

.stats-bar__item--error .stats-bar__value {
  color: var(--color-error);
}

/* Warning Card - Amber glow */
.stats-bar__item--warning {
  background: linear-gradient(135deg,
    rgba(251, 191, 36, 0.08) 0%,
    rgba(251, 191, 36, 0.03) 100%
  );
  border-color: rgba(251, 191, 36, 0.25);
}

.stats-bar__item--warning::before {
  background: linear-gradient(135deg, var(--color-warning) 0%, #f59e0b 100%);
}

.stats-bar__item--warning:hover {
  box-shadow: 0 0 25px rgba(251, 191, 36, 0.25);
}

.stats-bar__item--warning .stats-bar__value {
  color: var(--color-warning);
}

/* Clickable Stats Card */
.stats-bar__item--clickable {
  cursor: pointer;
  position: relative;
}

.stats-bar__item--clickable::after {
  content: '▼';
  position: absolute;
  top: var(--space-xs);
  right: var(--space-xs);
  font-size: 0.5rem;
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity var(--transition-base);
}

.stats-bar__item--clickable:hover::after {
  opacity: 1;
}

/* Time Range Buttons - Iridescent */
.time-range-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-sm);
}

.time-range-btn {
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-secondary);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-base);
  text-align: center;
}

.time-range-btn:hover {
  background: var(--color-bg-quaternary);
  border-color: var(--glass-border-hover);
  color: var(--color-text-primary);
  transform: translateY(-2px);
}

.time-range-btn--active {
  background: var(--gradient-iridescent);
  border-color: var(--color-iridescent-1);
  color: white;
  box-shadow: var(--glass-shadow-glow);
}

.time-range-btn--active:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(96, 165, 250, 0.4);
}

/* Stats content layout */
.stats-bar__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.stats-bar__label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stats-bar__value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

@media (max-width: 1024px) {
  .stats-bar {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .stats-bar__value {
    font-size: 1.25rem;
  }
}

@media (max-width: 768px) {
  .stats-bar {
    padding: var(--space-sm) var(--space-md);
    gap: var(--space-sm);
    grid-template-columns: repeat(2, 1fr);
  }

  .stats-bar__item {
    padding: var(--space-sm) var(--space-md);
  }

  .stats-bar__value {
    font-size: 1.125rem;
  }

  .stats-bar__label {
    font-size: 0.6875rem;
  }
}

/* ============================================================================
   Modal Styles - Glassmorphism & Iridescent
   ============================================================================ */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  background-color: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(8px);
}

.modal-content {
  width: 100%;
  max-width: 28rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-2xl);
  box-shadow:
    var(--glass-shadow),
    0 0 40px rgba(96, 165, 250, 0.1);
  overflow: hidden;
}

.modal-content--wide {
  max-width: 42rem;
}

.modal-content--compact {
  max-width: 20rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
  background: linear-gradient(135deg,
    rgba(96, 165, 250, 0.05) 0%,
    transparent 100%
  );
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* Iridescent title effect */
.modal-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 1.5em;
  background: var(--gradient-iridescent);
  border-radius: var(--radius-full);
  margin-right: var(--space-xs);
}

.modal-close {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: all var(--transition-base);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  cursor: pointer;
}

.modal-close:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-quaternary);
  border-color: var(--glass-border-hover);
  transform: rotate(90deg);
}

.modal-body {
  padding: var(--space-xl);
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
  background: linear-gradient(0deg,
    rgba(96, 165, 250, 0.03) 0%,
    transparent 100%
  );
}

/* Form elements in modals - Modern Design */
.label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
}

.input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  font-size: 0.875rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  transition: all var(--transition-base);
}

.input:focus {
  outline: none;
  border-color: var(--color-iridescent-1);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
  background: var(--color-bg-quaternary);
}

.input:hover:not(:focus) {
  border-color: var(--glass-border-hover);
}

/* Utility classes */
.space-y-4 > * + * {
  margin-top: 1rem;
}

.space-y-1 > * + * {
  margin-top: 0.25rem;
}

.grid {
  display: grid;
}

.grid-cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.gap-4 {
  gap: 1rem;
}

.gap-3 {
  gap: 0.75rem;
}

.flex-1 {
  flex: 1;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.mt-2 {
  margin-top: 0.5rem;
}

.mr-1 {
  margin-right: 0.25rem;
}

.mr-2 {
  margin-right: 0.5rem;
}

.p-4 {
  padding: 1rem;
}

.rounded-lg {
  border-radius: 0.5rem;
}

.text-sm {
  font-size: 0.875rem;
}

.font-medium {
  font-weight: 500;
}

.font-bold {
  font-weight: 700;
}

.font-mono {
  font-family: ui-monospace, monospace;
}

.capitalize {
  text-transform: capitalize;
}

.inline-block {
  display: inline-block;
}

.w-4 {
  width: 1rem;
}

.h-4 {
  height: 1rem;
}

.w-5 {
  width: 1.25rem;
}

.h-5 {
  height: 1.25rem;
}

@media (min-width: 640px) {
  .sm\:grid-cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Buttons - Iridescent Design */
.btn-primary,
.btn-secondary,
.btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  border: 1px solid transparent;
  position: relative;
  overflow: hidden;
}

/* Primary - Iridescent Gradient */
.btn-primary {
  background: var(--gradient-iridescent);
  color: white;
  box-shadow: var(--glass-shadow-glow);
}

.btn-primary::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--gradient-iridescent-full);
  opacity: 0;
  transition: opacity var(--transition-base);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(96, 165, 250, 0.4);
}

.btn-primary:hover::before {
  opacity: 0.3;
}

.btn-primary:active {
  transform: translateY(0);
}

/* Secondary */
.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border-color: var(--glass-border);
}

.btn-secondary:hover {
  background: var(--color-bg-quaternary);
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
  transform: translateY(-1px);
}

/* Danger - Red Glow */
.btn-danger {
  background: linear-gradient(135deg,
    rgba(248, 113, 113, 0.9) 0%,
    rgba(244, 63, 94, 0.9) 100%
  );
  color: white;
  border-color: rgba(248, 113, 113, 0.5);
}

.btn-danger:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 25px rgba(248, 113, 113, 0.4);
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-primary:disabled::before {
  display: none;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ============================================================================
   Toast Notification - Success/Error/Info
   ============================================================================ */
.toast {
  position: fixed;
  bottom: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast, 9999);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  box-shadow:
    var(--glass-shadow),
    0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  cursor: pointer;
  max-width: calc(100vw - 2rem);
}

.toast--success {
  border-color: rgba(34, 197, 94, 0.4);
  background: linear-gradient(135deg,
    rgba(34, 197, 94, 0.15) 0%,
    rgba(34, 197, 94, 0.05) 100%
  );
}

.toast--error {
  border-color: rgba(248, 113, 113, 0.4);
  background: linear-gradient(135deg,
    rgba(248, 113, 113, 0.15) 0%,
    rgba(248, 113, 113, 0.05) 100%
  );
}

.toast--info {
  border-color: rgba(96, 165, 250, 0.4);
  background: linear-gradient(135deg,
    rgba(96, 165, 250, 0.15) 0%,
    rgba(96, 165, 250, 0.05) 100%
  );
}

.toast__icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

.toast--success .toast__icon {
  color: #22c55e;
}

.toast--error .toast__icon {
  color: #f87171;
}

.toast--info .toast__icon {
  color: #60a5fa;
}

.toast__message {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.toast__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-base);
  flex-shrink: 0;
}

.toast__close:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

/* Toast Transition */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(100%);
}

@media (max-width: 640px) {
  .toast {
    bottom: 5rem; /* Space for FAB */
    left: var(--space-md);
    right: var(--space-md);
    transform: none;
    max-width: none;
  }

  .toast-enter-from,
  .toast-leave-to {
    transform: translateY(100%);
  }
}
</style>
