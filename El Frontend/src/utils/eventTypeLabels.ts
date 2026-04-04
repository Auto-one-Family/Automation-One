/**
 * Canonical labels for event types used in monitor views.
 * Single Source of Truth for short, operator-facing event labels.
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  // Sensor & Actuator
  sensor_data: 'Sensordaten',
  sensor_health: 'Sensor-Status',
  actuator_status: 'Aktor-Status',
  actuator_response: 'Aktor-Antwort',
  actuator_alert: 'Aktor-Alarm',
  actuator_command: 'Aktor-Befehl',
  actuator_command_failed: 'Aktor-Befehl fehlgeschlagen',
  esp_health: 'Heartbeat',

  // Configuration
  config_response: 'Konfiguration empfangen',
  config_published: 'Konfiguration gesendet',
  config_failed: 'Konfigurationsfehler',

  // Device lifecycle
  device_discovered: 'Neues Geraet',
  device_rediscovered: 'Geraet wieder da',
  device_approved: 'Genehmigt',
  device_rejected: 'Abgelehnt',
  device_online: 'Geraet online',
  device_offline: 'Geraet offline',
  lwt_received: 'Verbindungsabbruch',

  // System
  zone_assignment: 'Zonen-Zuweisung',
  logic_execution: 'Regel ausgefuehrt',
  system_event: 'System',
  service_start: 'Server-Start',
  service_stop: 'Server-Stop',
  emergency_stop: 'Notfall-Stopp',

  // Errors
  error_event: 'Fehler',
  mqtt_error: 'MQTT-Fehler',
  validation_error: 'Validierungsfehler',
  database_error: 'Datenbankfehler',

  // Auth
  login_success: 'Anmeldung erfolgreich',
  login_failed: 'Anmeldung fehlgeschlagen',
  logout: 'Abmeldung',

  // Notifications
  notification: 'Benachrichtigung',

  // WebSocket/internal signals
  events_restored: 'Wiederhergestellt',
  contract_mismatch: 'Contract-Mismatch',
  contract_unknown_event: 'Unbekannter Contract-Event',
}

export function getEventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] || eventType
}
