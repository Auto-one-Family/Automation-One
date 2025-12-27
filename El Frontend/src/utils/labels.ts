/**
 * Human-Readable Labels (German)
 * 
 * Central file for all UI text translations and label mappings.
 * Ensures consistent German translations throughout the application.
 */

// =============================================================================
// QUALITY LABELS
// =============================================================================

export const QUALITY_LABELS: Record<string, string> = {
  'excellent': 'Ausgezeichnet',
  'good': 'Gut',
  'fair': 'Akzeptabel',
  'degraded': 'Eingeschränkt',
  'poor': 'Schlecht',
  'bad': 'Sehr schlecht',
  'stale': 'Veraltet',
  'unknown': 'Unbekannt',
}

/**
 * Get quality label with color class
 */
export function getQualityInfo(quality: string): { label: string; colorClass: string } {
  const info: Record<string, { label: string; colorClass: string }> = {
    'excellent': { label: 'Ausgezeichnet', colorClass: 'text-success' },
    'good': { label: 'Gut', colorClass: 'text-success' },
    'fair': { label: 'Akzeptabel', colorClass: 'text-warning' },
    'degraded': { label: 'Eingeschränkt', colorClass: 'text-warning' },
    'poor': { label: 'Schlecht', colorClass: 'text-error' },
    'bad': { label: 'Sehr schlecht', colorClass: 'text-error' },
    'stale': { label: 'Veraltet', colorClass: 'text-muted' },
    'unknown': { label: 'Unbekannt', colorClass: 'text-muted' },
  }
  return info[quality] ?? { label: quality, colorClass: 'text-muted' }
}

// =============================================================================
// SYSTEM STATE LABELS
// =============================================================================

export const STATE_LABELS: Record<string, string> = {
  'OPERATIONAL': 'Betriebsbereit',
  'SAFE_MODE': 'Sicherheitsmodus',
  'ERROR': 'Fehler',
  'INITIALIZING': 'Startet...',
  'OFFLINE': 'Offline',
  'CONNECTED': 'Verbunden',
  'DISCONNECTED': 'Getrennt',
  'UNKNOWN': 'Unbekannt',
}

/**
 * Get system state label with badge variant
 */
export function getStateInfo(state: string): { label: string; variant: string } {
  const info: Record<string, { label: string; variant: string }> = {
    'OPERATIONAL': { label: 'Betriebsbereit', variant: 'success' },
    'SAFE_MODE': { label: 'Sicherheitsmodus', variant: 'warning' },
    'ERROR': { label: 'Fehler', variant: 'danger' },
    'INITIALIZING': { label: 'Startet...', variant: 'info' },
    'OFFLINE': { label: 'Offline', variant: 'gray' },
    'CONNECTED': { label: 'Verbunden', variant: 'success' },
    'DISCONNECTED': { label: 'Getrennt', variant: 'gray' },
  }
  return info[state] ?? { label: state, variant: 'gray' }
}

// =============================================================================
// ACTUATOR TYPE LABELS
// =============================================================================

export const ACTUATOR_TYPE_LABELS: Record<string, string> = {
  'relay': 'Relais',
  'pwm': 'PWM-Ausgang',
  'valve': 'Ventil',
  'pump': 'Pumpe',
  'fan': 'Lüfter (PWM)',
  'heater': 'Heizung',
  'light': 'Beleuchtung',
  'motor': 'Motor',
}

/**
 * Get actuator type label with icon name
 */
export function getActuatorTypeInfo(type: string): { label: string; icon: string } {
  const info: Record<string, { label: string; icon: string }> = {
    'relay': { label: 'Relais', icon: 'ToggleRight' },
    'pwm': { label: 'PWM-Ausgang', icon: 'Activity' },
    'valve': { label: 'Ventil', icon: 'GitBranch' },
    'pump': { label: 'Pumpe', icon: 'Waves' },
    'fan': { label: 'Lüfter (PWM)', icon: 'Fan' },
    'heater': { label: 'Heizung', icon: 'Flame' },
    'light': { label: 'Beleuchtung', icon: 'Lightbulb' },
    'motor': { label: 'Motor', icon: 'Cog' },
  }
  return info[type] ?? { label: type, icon: 'Power' }
}

// =============================================================================
// ACTUATOR STATE LABELS
// =============================================================================

export const ACTUATOR_STATE_LABELS: Record<string, string> = {
  'on': 'Ein',
  'off': 'Aus',
  'true': 'Ein',
  'false': 'Aus',
}

// =============================================================================
// CONNECTION STATUS LABELS
// =============================================================================

export const CONNECTION_LABELS: Record<string, string> = {
  'online': 'Online',
  'offline': 'Offline',
  'connecting': 'Verbinde...',
  'reconnecting': 'Verbinde erneut...',
  'error': 'Verbindungsfehler',
}

// =============================================================================
// DEVICE TYPE LABELS
// =============================================================================

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  'mock': 'Simuliert',
  'real': 'Echtes Gerät',
  'MOCK_ESP32': 'Mock ESP32',
  'ESP32': 'ESP32',
  'ESP32_S2': 'ESP32-S2',
  'ESP32_S3': 'ESP32-S3',
  'ESP32_C3': 'ESP32-C3',
}

// =============================================================================
// GPIO DESCRIPTIONS
// =============================================================================

const GPIO_DESCRIPTIONS: Record<number, string> = {
  0: 'GPIO0 - Boot-Pin, mit Vorsicht verwenden',
  1: 'GPIO1 - TX0 (UART)',
  2: 'GPIO2 - Onboard LED bei vielen Boards',
  3: 'GPIO3 - RX0 (UART)',
  4: 'GPIO4 - Standard I2C SDA',
  5: 'GPIO5 - Standard I2C SCL',
  12: 'GPIO12 - Boot-Strapping Pin',
  13: 'GPIO13 - Sicher für allgemeine Verwendung',
  14: 'GPIO14 - Sicher für allgemeine Verwendung',
  15: 'GPIO15 - Boot-Strapping Pin',
  16: 'GPIO16 - Sicher für allgemeine Verwendung',
  17: 'GPIO17 - Sicher für allgemeine Verwendung',
  18: 'GPIO18 - Sicher für allgemeine Verwendung',
  19: 'GPIO19 - Sicher für allgemeine Verwendung',
  21: 'GPIO21 - Standard I2C SDA (alternativ)',
  22: 'GPIO22 - Standard I2C SCL (alternativ)',
  23: 'GPIO23 - Sicher für allgemeine Verwendung',
  25: 'GPIO25 - DAC1 verfügbar',
  26: 'GPIO26 - DAC2 verfügbar',
  27: 'GPIO27 - Sicher für allgemeine Verwendung',
  32: 'GPIO32 - ADC1 verfügbar',
  33: 'GPIO33 - ADC1 verfügbar',
  34: 'GPIO34 - Nur Eingang (kein Pull-Up)',
  35: 'GPIO35 - Nur Eingang (kein Pull-Up)',
  36: 'GPIO36 - Nur Eingang (VP)',
  39: 'GPIO39 - Nur Eingang (VN)',
}

/**
 * Get GPIO description/tooltip
 */
export function getGpioDescription(gpio: number): string {
  return GPIO_DESCRIPTIONS[gpio] ?? `GPIO ${gpio}`
}

/**
 * Check if GPIO is safe for general use
 */
export function isGpioSafe(gpio: number): boolean {
  const unsafeGpios = [0, 1, 3, 6, 7, 8, 9, 10, 11, 12, 15]
  return !unsafeGpios.includes(gpio)
}

// =============================================================================
// UNIT EXPLANATIONS
// =============================================================================

export const UNIT_EXPLANATIONS: Record<string, string> = {
  '°C': 'Grad Celsius - Temperatureinheit',
  'pH': 'pH-Wert - Maß für Säure/Base (0-14)',
  '% RH': 'Relative Luftfeuchtigkeit in Prozent',
  'µS/cm': 'Mikrosiemens pro Zentimeter - Elektrische Leitfähigkeit',
  'hPa': 'Hektopascal - Luftdruckeinheit',
  'ppm': 'Parts per Million - Konzentration',
  'lux': 'Lux - Beleuchtungsstärke',
  'L/min': 'Liter pro Minute - Durchflussrate',
  'raw': 'Rohwert ohne Einheit',
}

/**
 * Get explanation for a unit
 */
export function getUnitExplanation(unit: string): string {
  return UNIT_EXPLANATIONS[unit] ?? unit
}

// =============================================================================
// GENERIC HELPER FUNCTIONS
// =============================================================================

/**
 * Get a label from any label map
 * @param value - The key to look up
 * @param labelMap - The label map to search
 * @returns The translated label or the original value
 */
export function getLabel(
  value: string, 
  labelMap: Record<string, string>
): string {
  return labelMap[value] ?? value
}

/**
 * Get quality label
 */
export function getQualityLabel(quality: string): string {
  return QUALITY_LABELS[quality] ?? quality
}

/**
 * Get state label
 */
export function getStateLabel(state: string): string {
  return STATE_LABELS[state] ?? state
}

/**
 * Get actuator type label
 */
export function getActuatorTypeLabel(type: string): string {
  return ACTUATOR_TYPE_LABELS[type] ?? type
}

/**
 * Get connection label
 */
export function getConnectionLabel(status: string): string {
  return CONNECTION_LABELS[status] ?? status
}

/**
 * Get device type label
 */
export function getDeviceTypeLabel(type: string): string {
  return DEVICE_TYPE_LABELS[type] ?? type
}

// =============================================================================
// ACTION LABELS
// =============================================================================

export const ACTION_LABELS: Record<string, string> = {
  'create': 'Erstellen',
  'edit': 'Bearbeiten',
  'delete': 'Löschen',
  'save': 'Speichern',
  'cancel': 'Abbrechen',
  'refresh': 'Aktualisieren',
  'add': 'Hinzufügen',
  'remove': 'Entfernen',
  'view': 'Anzeigen',
  'details': 'Details',
  'back': 'Zurück',
  'next': 'Weiter',
  'submit': 'Absenden',
  'confirm': 'Bestätigen',
  'retry': 'Erneut versuchen',
}

// =============================================================================
// MESSAGE LABELS
// =============================================================================

export const MESSAGE_LABELS: Record<string, string> = {
  'loading': 'Lädt...',
  'saving': 'Speichert...',
  'deleting': 'Löscht...',
  'error': 'Ein Fehler ist aufgetreten',
  'success': 'Erfolgreich',
  'no_data': 'Keine Daten vorhanden',
  'no_results': 'Keine Ergebnisse gefunden',
  'confirm_delete': 'Wirklich löschen?',
}













