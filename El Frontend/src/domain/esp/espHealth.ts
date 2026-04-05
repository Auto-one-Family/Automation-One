/**
 * esp_health payload normalization (P0-C).
 * Server spreads runtime_telemetry keys flat into WebSocket data (event_contract_serializers).
 */

export interface EspHealthViewModel {
  persistenceDegraded: boolean
  persistenceDegradedReason: string | null
  runtimeStateDegraded: boolean
  networkDegraded: boolean
  mqttCircuitBreakerOpen: boolean
  wifiCircuitBreakerOpen: boolean
  /** Telemetry keys not mapped above (debug / forward-compatible) */
  rawTelemetry: Record<string, unknown>
}

/** In ViewModel als booleans/sparse Felder gemappt — nicht doppelt in rawTelemetry */
const MAPPED_TELEMETRY_FLAG_KEYS = new Set([
  'persistence_degraded',
  'persistence_degraded_reason',
  'runtime_state_degraded',
  'network_degraded',
  'mqtt_circuit_breaker_open',
  'wifi_circuit_breaker_open',
])

const STANDARD_TOP_LEVEL_KEYS = new Set([
  'esp_id',
  'device_id',
  'status',
  'timestamp',
  'last_seen',
  'uptime',
  'heap_free',
  'wifi_rssi',
  'sensor_count',
  'actuator_count',
  'name',
  'source',
  'reason',
  'gpio_status',
  'actuator_states_reset',
  'ip_address',
  'connected',
  'system_state',
])

function asBool(v: unknown): boolean {
  return v === true || v === 'true'
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

export function normalizeEspHealthPayload(raw: Record<string, unknown>): EspHealthViewModel {
  const rawTelemetry: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (STANDARD_TOP_LEVEL_KEYS.has(key) || MAPPED_TELEMETRY_FLAG_KEYS.has(key)) continue
    rawTelemetry[key] = value
  }

  return {
    persistenceDegraded: asBool(raw.persistence_degraded),
    persistenceDegradedReason: asStr(raw.persistence_degraded_reason),
    runtimeStateDegraded: asBool(raw.runtime_state_degraded),
    networkDegraded: asBool(raw.network_degraded),
    mqttCircuitBreakerOpen: asBool(raw.mqtt_circuit_breaker_open),
    wifiCircuitBreakerOpen: asBool(raw.wifi_circuit_breaker_open),
    rawTelemetry,
  }
}

export interface EspHealthPresentation {
  severity: 'ok' | 'warning'
  showBadge: boolean
  badgeLabel: string
  tooltipLines: string[]
  recommendedAction: string | null
}

export function espHealthPresentation(
  vm: EspHealthViewModel,
  deviceReportsOnline: boolean,
): EspHealthPresentation {
  const lines: string[] = []
  if (vm.persistenceDegraded) {
    lines.push('Persistenz eingeschränkt')
    if (vm.persistenceDegradedReason) lines.push(vm.persistenceDegradedReason)
  }
  if (vm.runtimeStateDegraded) lines.push('Laufzeitstatus eingeschränkt')
  if (vm.networkDegraded) lines.push('Netzwerk eingeschränkt')
  if (vm.mqttCircuitBreakerOpen) lines.push('MQTT-Circuit-Breaker offen')
  if (vm.wifiCircuitBreakerOpen) lines.push('WiFi-Circuit-Breaker offen')

  const unknownKeys = Object.keys(vm.rawTelemetry).filter(
    k =>
      ![
        'persistence_degraded',
        'persistence_degraded_reason',
        'runtime_state_degraded',
        'network_degraded',
        'mqtt_circuit_breaker_open',
        'wifi_circuit_breaker_open',
        'critical_outcome_drop_count',
        'publish_outbox_drop_count',
        'persistence_drift_count',
        'metrics_schema_version',
        'degraded',
        'degraded_reason',
      ].includes(k),
  )
  if (unknownKeys.length > 0) {
    lines.push(`Weitere Telemetrie: ${unknownKeys.slice(0, 6).join(', ')}${unknownKeys.length > 6 ? '…' : ''}`)
  }

  const hasDegradation =
    vm.persistenceDegraded ||
    vm.runtimeStateDegraded ||
    vm.networkDegraded ||
    vm.mqttCircuitBreakerOpen ||
    vm.wifiCircuitBreakerOpen

  const showBadge = deviceReportsOnline && hasDegradation

  return {
    severity: showBadge ? 'warning' : 'ok',
    showBadge,
    badgeLabel: 'Eingeschränkt',
    tooltipLines: lines.length > 0 ? lines : ['Keine Degradations-Marker gesetzt'],
    recommendedAction: showBadge
      ? 'Logs und MQTT-Verbindung prüfen; bei anhaltenden Meldungen Firmware/Server-Team informieren.'
      : null,
  }
}
