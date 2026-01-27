/**
 * Event Transformer Utilities
 *
 * Transforms raw event data into human-readable German messages
 * and determines event categories for visual styling.
 *
 * KATEGORIE-SYSTEM:
 * - esp-status (Blau):    Heartbeat, Online/Offline, LWT
 * - sensors (Emerald):    Sensor-Messwerte
 * - actuators (Amber):    Aktor-Status, Commands, Alerts
 * - system (Violet):      Config, Auth, Errors, Lifecycle
 */

import type { UnifiedEvent } from '@/types/websocket-events'

// ============================================================================
// Types
// ============================================================================

export type EventCategory = 'esp-status' | 'sensors' | 'actuators' | 'system'

export interface TransformedMessage {
  /** Original event type (z.B. "heartbeat") */
  type: string
  /** German title (z.B. "HEARTBEAT") */
  title: string
  /** German label for display (z.B. "Verbindungsstatus") */
  titleDE: string
  /** One-liner for list (z.B. "Online · 48 KB frei · -53 dBm") */
  summary: string
  /** Multi-line for panel (z.B. "Gerät MOCK_9CB4F42A meldet: Online und betriebsbereit") */
  description: string
  /** Lucide icon name */
  icon: string
  /** Category for color coding */
  category: EventCategory
}

// ============================================================================
// Constants - Translation Maps
// ============================================================================

const SENSOR_NAMES: Record<string, string> = {
  'temperature': 'Temperatur',
  'humidity': 'Luftfeuchte',
  'ec': 'EC-Wert',
  'ph': 'pH-Wert',
  'water_level': 'Wasserstand',
  'light': 'Lichtstärke',
  'soil_moisture': 'Bodenfeuchte',
  'ds18b20': 'Temperatur',
  'sht31': 'Temp./Luftfeuchte',
  'bme280': 'Umweltsensor',
}

const ACTUATOR_NAMES: Record<string, string> = {
  'pump': 'Pumpe',
  'valve': 'Ventil',
  'relay': 'Relais',
  'pwm': 'PWM-Ausgang',
  'light': 'Beleuchtung',
  'fan': 'Lüfter',
  'heater': 'Heizung',
}

const CONFIG_ERROR_MESSAGES: Record<string, string> = {
  'MISSING_FIELD': 'Erforderliches Feld fehlt',
  'INVALID_VALUE': 'Ungültiger Wert',
  'GPIO_CONFLICT': 'GPIO-Konflikt erkannt',
  'SENSOR_NOT_FOUND': 'Sensor nicht gefunden',
  'ACTUATOR_NOT_FOUND': 'Aktor nicht gefunden',
  'VALIDATION_ERROR': 'Validierungsfehler',
  'TIMEOUT': 'Zeitüberschreitung',
}

// ============================================================================
// Category Determination
// ============================================================================

/**
 * Bestimmt die Kategorie eines Events für farbliche Markierung
 */
export function getEventCategory(event: UnifiedEvent): EventCategory {
  const type = event.event_type

  // ESP-Status Events (Blau)
  const espStatusEvents = [
    'esp_health',
    'device_online',
    'device_offline',
    'lwt_received',
    'device_discovered',
    'device_rediscovered',
    'device_approved',
    'device_rejected',
  ]
  if (espStatusEvents.includes(type)) {
    return 'esp-status'
  }

  // Sensor Events (Emerald)
  const sensorEvents = ['sensor_data', 'sensor_health']
  if (sensorEvents.includes(type)) {
    return 'sensors'
  }

  // Actuator Events (Amber)
  const actuatorEvents = ['actuator_status', 'actuator_response', 'actuator_alert', 'actuator_command', 'actuator_command_failed']
  if (actuatorEvents.includes(type)) {
    return 'actuators'
  }

  // System Events (Violet) - alles andere
  return 'system'
}

// ============================================================================
// Uptime Formatting
// ============================================================================

/**
 * Formatiert Uptime in lesbares Format
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} Sek`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} Min`
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return mins > 0 ? `${hours} Std ${mins} Min` : `${hours} Std`
  }
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return hours > 0 ? `${days} Tage ${hours} Std` : `${days} Tage`
}

/**
 * Formatiert Speichergröße
 */
export function formatMemory(bytes: number): string {
  const kb = Math.round(bytes / 1024)
  return `${kb} KB`
}

/**
 * Formatiert Sensor-Wert je nach Typ
 */
export function formatSensorValue(value: number, sensorType?: string): string {
  if (sensorType === 'temperature' || sensorType === 'ds18b20') {
    return `${value.toFixed(1)} °C`
  }
  if (sensorType === 'humidity') {
    return `${Math.round(value)}%`
  }
  if (sensorType === 'ph') {
    return value.toFixed(2)
  }
  if (sensorType === 'ec') {
    return `${value.toFixed(0)} µS/cm`
  }
  return value.toFixed(1)
}

// ============================================================================
// Message Transformation
// ============================================================================

/**
 * Transformiert ein Event in ein menschenlesbares Format
 */
export function transformEventMessage(event: UnifiedEvent): TransformedMessage {
  const category = getEventCategory(event)
  const data = (event.data || {}) as Record<string, unknown>

  switch (event.event_type) {
    case 'esp_health':
      return transformHeartbeat(event, data)
    case 'sensor_data':
      return transformSensorData(event, data)
    case 'actuator_status':
      return transformActuatorStatus(event, data)
    case 'actuator_response':
      return transformActuatorResponse(event, data)
    case 'actuator_alert':
      return transformActuatorAlert(event, data)
    case 'actuator_command':
      return transformActuatorCommand(event, data)
    case 'actuator_command_failed':
      return transformActuatorCommandFailed(event, data)
    case 'config_published':
      return transformConfigPublished(event, data)
    case 'device_offline':
      return transformDeviceOffline(event, data)
    case 'device_online':
      return transformDeviceOnline(event, data)
    case 'config_response':
      return transformConfigResponse(event, data)
    case 'device_discovered':
      return transformDeviceDiscovered(event, data)
    case 'device_approved':
      return transformDeviceApproved(event, data)
    case 'lwt_received':
      return transformLWT(event, data)
    default:
      return transformDefault(event, category)
  }
}

function transformHeartbeat(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const heapFree = typeof data.heap_free === 'number' ? data.heap_free : 0
  const wifiRssi = typeof data.wifi_rssi === 'number' ? data.wifi_rssi : 0
  const uptime = typeof data.uptime === 'number' ? data.uptime : 0

  const heapKB = Math.round(heapFree / 1024)
  const uptimeStr = formatUptime(uptime)

  return {
    type: 'esp_health',
    title: 'HEARTBEAT',
    titleDE: 'Verbindungsstatus',
    summary: `Online · ${heapKB} KB frei · ${wifiRssi} dBm · ${uptimeStr}`,
    description: `Gerät ${event.esp_id || 'Unbekannt'} meldet: Online und betriebsbereit`,
    icon: 'Radio',
    category: 'esp-status',
  }
}

function transformSensorData(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const sensorType = (data.sensor_type || event.device_type || 'sensor') as string
  const value = typeof data.value === 'number' ? data.value : 0
  const unit = (data.unit || '') as string
  const gpio = event.gpio ?? data.gpio

  const sensorName = SENSOR_NAMES[sensorType.toLowerCase()] || sensorType
  const formattedValue = formatSensorValue(value, sensorType.toLowerCase())

  return {
    type: 'sensor_data',
    title: 'SENSORDATEN',
    titleDE: sensorName,
    summary: `${sensorName}: ${formattedValue}${unit ? ` ${unit}` : ''} · GPIO ${gpio}`,
    description: `Neuer Messwert von ${sensorName}`,
    icon: 'Thermometer',
    category: 'sensors',
  }
}

function transformActuatorStatus(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const actuatorType = (data.actuator_type || event.device_type || 'actuator') as string
  const state = data.state as boolean
  const value = typeof data.value === 'number' ? data.value : undefined
  const gpio = event.gpio ?? data.gpio

  const actuatorName = ACTUATOR_NAMES[actuatorType.toLowerCase()] || actuatorType
  const stateStr = state ? 'EIN' : 'AUS'
  const valueStr = value !== undefined ? ` (${Math.round(value * 100)}%)` : ''

  return {
    type: 'actuator_status',
    title: 'AKTOR-STATUS',
    titleDE: actuatorName,
    summary: `${actuatorName}: ${stateStr}${valueStr} · GPIO ${gpio}`,
    description: `${actuatorName} ist jetzt ${stateStr.toLowerCase()}`,
    icon: 'Power',
    category: 'actuators',
  }
}

function transformActuatorResponse(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const success = data.success as boolean
  const command = (data.command || 'Befehl') as string
  const gpio = event.gpio ?? data.gpio

  return {
    type: 'actuator_response',
    title: 'AKTOR-ANTWORT',
    titleDE: success ? 'Befehl erfolgreich' : 'Befehl fehlgeschlagen',
    summary: success
      ? `${command} · GPIO ${gpio} · Erfolgreich`
      : `${command} · GPIO ${gpio} · Fehlgeschlagen`,
    description: success
      ? `Aktor-Befehl "${command}" wurde erfolgreich ausgeführt`
      : `Aktor-Befehl "${command}" konnte nicht ausgeführt werden`,
    icon: success ? 'CheckCircle' : 'XCircle',
    category: 'actuators',
  }
}

function transformActuatorAlert(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const alertType = (data.alert_type || 'unknown') as string
  const gpio = event.gpio ?? data.gpio

  const alertMessages: Record<string, string> = {
    'emergency_stop': 'Not-Aus aktiviert',
    'timeout': 'Zeitüberschreitung',
    'runtime_exceeded': 'Laufzeit überschritten',
    'safety_triggered': 'Sicherheitsstopp',
  }

  const alertMessage = alertMessages[alertType] || alertType

  return {
    type: 'actuator_alert',
    title: 'AKTOR-ALARM',
    titleDE: 'Sicherheitswarnung',
    summary: `${alertMessage} · GPIO ${gpio}`,
    description: `Aktor an GPIO ${gpio}: ${alertMessage}`,
    icon: 'AlertTriangle',
    category: 'actuators',
  }
}

function transformDeviceOffline(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const reason = (data.reason || 'timeout') as string
  const espId = event.esp_id || 'Unbekannt'

  const reasonDE = reason === 'lwt'
    ? 'Verbindung unerwartet getrennt'
    : 'Kein Heartbeat empfangen'

  return {
    type: 'device_offline',
    title: 'GERÄT OFFLINE',
    titleDE: 'Verbindung verloren',
    summary: `Offline · ${reasonDE}`,
    description: `Gerät ${espId} ist nicht mehr erreichbar`,
    icon: 'WifiOff',
    category: 'esp-status',
  }
}

function transformDeviceOnline(event: UnifiedEvent, _data: Record<string, unknown>): TransformedMessage {
  const espId = event.esp_id || 'Unbekannt'

  return {
    type: 'device_online',
    title: 'GERÄT ONLINE',
    titleDE: 'Verbindung hergestellt',
    summary: `${espId} wieder verbunden`,
    description: `Gerät ${espId} ist wieder online`,
    icon: 'Wifi',
    category: 'esp-status',
  }
}

function transformConfigResponse(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const status = (data.status || 'unknown') as string
  const configType = (data.type || data.config_type || 'Config') as string
  const errorCode = data.error_code as string | undefined
  const espId = event.esp_id || 'Unbekannt'

  if (status === 'error' || status === 'failed') {
    const errorDE = errorCode
      ? (CONFIG_ERROR_MESSAGES[errorCode] || errorCode)
      : (data.message || 'Unbekannter Fehler') as string

    return {
      type: 'config_response',
      title: 'KONFIGURATION',
      titleDE: 'Konfiguration fehlgeschlagen',
      summary: `Fehlgeschlagen · ${errorDE}`,
      description: `${configType}-Konfiguration für ${espId} konnte nicht angewendet werden`,
      icon: 'AlertCircle',
      category: 'system',
    }
  }

  return {
    type: 'config_response',
    title: 'KONFIGURATION',
    titleDE: 'Konfiguration empfangen',
    summary: `Erfolgreich · ${configType} konfiguriert`,
    description: `${configType}-Konfiguration für ${espId} wurde erfolgreich angewendet`,
    icon: 'CheckCircle',
    category: 'system',
  }
}

function transformDeviceDiscovered(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const espId = event.esp_id || data.device_id || 'Unbekannt'
  const zoneName = (data.zone_name || data.zone_id) as string | undefined

  return {
    type: 'device_discovered',
    title: 'NEUES GERÄT',
    titleDE: 'Gerät entdeckt',
    summary: zoneName
      ? `${espId} · Zone: ${zoneName}`
      : `${espId} · Wartet auf Freigabe`,
    description: `Neues Gerät ${espId} wurde erkannt und wartet auf Admin-Freigabe`,
    icon: 'Search',
    category: 'esp-status',
  }
}

function transformDeviceApproved(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const espId = event.esp_id || data.device_id || 'Unbekannt'
  const approvedBy = (data.approved_by || 'Admin') as string

  return {
    type: 'device_approved',
    title: 'GENEHMIGT',
    titleDE: 'Gerät freigegeben',
    summary: `${espId} · von ${approvedBy}`,
    description: `Gerät ${espId} wurde von ${approvedBy} genehmigt`,
    icon: 'CheckCircle',
    category: 'esp-status',
  }
}

function transformLWT(event: UnifiedEvent, _data: Record<string, unknown>): TransformedMessage {
  const espId = event.esp_id || 'Unbekannt'

  return {
    type: 'lwt_received',
    title: 'VERBINDUNGSABBRUCH',
    titleDE: 'Unerwartete Trennung',
    summary: `${espId} · Verbindung unerwartet getrennt`,
    description: `Gerät ${espId} hat die Verbindung unerwartet verloren (Last Will Testament)`,
    icon: 'Unplug',
    category: 'esp-status',
  }
}

function transformActuatorCommand(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const command = (data.command || 'Befehl') as string
  const gpio = event.gpio ?? data.gpio
  const value = data.value as number | undefined
  const issuedBy = (data.issued_by || 'API') as string

  const valueStr = value !== undefined && value !== 1.0 ? ` (${Math.round(value * 100)}%)` : ''

  return {
    type: 'actuator_command',
    title: 'AKTOR-BEFEHL',
    titleDE: 'Befehl gesendet',
    summary: `${command}${valueStr} · GPIO ${gpio} · von ${issuedBy}`,
    description: `Aktor-Befehl "${command}" wurde an GPIO ${gpio} gesendet. Quelle: ${issuedBy}`,
    icon: 'Zap',
    category: 'actuators',
  }
}

function transformActuatorCommandFailed(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const command = (data.command || 'Befehl') as string
  const gpio = event.gpio ?? data.gpio
  const error = (data.error || 'Unbekannter Fehler') as string

  return {
    type: 'actuator_command_failed',
    title: 'AKTOR-BEFEHL FEHLGESCHLAGEN',
    titleDE: 'Befehl fehlgeschlagen',
    summary: `${command} · GPIO ${gpio} · ${error}`,
    description: `Aktor-Befehl "${command}" an GPIO ${gpio} fehlgeschlagen: ${error}`,
    icon: 'XCircle',
    category: 'actuators',
  }
}

function transformConfigPublished(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
  const espId = event.esp_id || (data.esp_id as string) || 'Unbekannt'
  const configKeys = (data.config_keys || []) as string[]

  return {
    type: 'config_published',
    title: 'KONFIGURATION GESENDET',
    titleDE: 'Config gesendet',
    summary: `Config an ${espId} gesendet`,
    description: `Konfiguration an ${espId} gesendet. Keys: ${configKeys.join(', ') || 'keine'}`,
    icon: 'Settings',
    category: 'system',
  }
}

function transformDefault(event: UnifiedEvent, category: EventCategory): TransformedMessage {
  return {
    type: event.event_type,
    title: event.event_type.toUpperCase().replace(/_/g, ' '),
    titleDE: event.event_type,
    summary: event.message || 'Keine Details verfügbar',
    description: event.message || 'System-Ereignis',
    icon: 'Info',
    category,
  }
}
