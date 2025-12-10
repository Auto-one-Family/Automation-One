/**
 * Zentrale Tooltip-Definitionen für konsistente Hilfe-Texte
 * Verwendet in allen Komponenten für einheitliche Begriffserklärungen
 */

export const TOOLTIP_DEFINITIONS = {
  GPIO: {
    text: 'General Purpose Input/Output - Digitale Ein-/Ausgänge des ESP32',
    examples: ['GPIO 2: LED-Steuerung', 'GPIO 4: Sensor-Eingang'],
    icon: 'mdi-chip',
  },
  SafeMode: {
    text: 'Sicherheitsmodus - Verhindert unbeabsichtigte Aktor-Steuerung',
    examples: ['Aktoren sind deaktiviert', 'Nur Lesen von Sensoren möglich'],
    icon: 'mdi-shield-check',
  },
  TimeQuality: {
    text: 'Zeitqualität der Sensor-Daten - Beeinflusst Datenverlässlichkeit',
    examples: ['EXCELLENT: < 1s Abweichung', 'GOOD: < 5s Abweichung'],
    icon: 'mdi-clock-outline',
  },
  KaiserMode: {
    text: 'Kaiser Controller - Edge Controller für autonome Operation',
    examples: ['God Pi Integration', 'Autonome Entscheidungen'],
    icon: 'mdi-crown',
  },
  MQTT: {
    text: 'Message Queuing Telemetry Transport - Protokoll für Echtzeit-Datenübertragung',
    examples: ['Sensor-Daten', 'Aktor-Befehle', 'System-Status'],
    icon: 'mdi-wifi',
  },
  Zone: {
    text: 'Logische Gruppierung von ESP-Geräten für bessere Organisation',
    examples: ['Gewächshaus', 'Außenbereich', 'Keller'],
    icon: 'mdi-view-grid',
  },
  Subzone: {
    text: 'Unterbereich einer Zone für detaillierte Geräteorganisation',
    examples: ['Temperatur-Sensoren', 'Bewässerung-Aktoren'],
    icon: 'mdi-view-grid-outline',
  },
  Heartbeat: {
    text: 'Regelmäßige Statusmeldung zur Überwachung der Geräteverbindung',
    examples: ['Alle 30 Sekunden', 'Zeigt Online-Status'],
    icon: 'mdi-heart-pulse',
  },
  CircuitBreaker: {
    text: 'Schutzmechanismus gegen wiederholte fehlgeschlagene Verbindungen',
    examples: ['Verhindert Systemüberlastung', 'Automatische Wiederherstellung'],
    icon: 'mdi-shield-alert',
  },
  PiIntegration: {
    text: 'Raspberry Pi Server Integration für erweiterte Funktionalität',
    examples: ['Bibliothek-Management', 'Erweiterte Sensoren'],
    icon: 'mdi-raspberry-pi',
  },
}

/**
 * Gibt eine Tooltip-Definition für einen Schlüssel zurück
 * @param {string} key - Schlüssel der Definition
 * @returns {Object} Tooltip-Definition oder Standard-Fallback
 */
export function getTooltipDefinition(key) {
  return (
    TOOLTIP_DEFINITIONS[key] || {
      text: 'Keine Definition verfügbar',
      examples: [],
      icon: 'mdi-help-circle',
    }
  )
}

/**
 * Erstellt Tooltip-Props für HelpfulHints-Komponente
 * @param {string} key - Schlüssel der Definition
 * @param {Object} overrides - Überschreibungen für die Standard-Definition
 * @returns {Object} Props für HelpfulHints-Komponente
 */
export function getTooltipProps(key, overrides = {}) {
  const definition = getTooltipDefinition(key)
  return {
    icon: overrides.icon || definition.icon,
    text: overrides.text || definition.text,
    title: overrides.title || definition.title,
    examples: overrides.examples || definition.examples,
    location: overrides.location || 'top',
    size: overrides.size || 'small',
    color: overrides.color || 'grey',
    maxWidth: overrides.maxWidth || 300,
    openDelay: overrides.openDelay || 500,
  }
}

/**
 * Kontext-spezifische Tooltip-Definitionen
 */
export const CONTEXT_TOOLTIPS = {
  // ESP-spezifische Tooltips
  espStatus: {
    online: {
      text: 'ESP-Gerät ist online und kommuniziert',
      icon: 'mdi-wifi',
      color: 'success',
    },
    offline: {
      text: 'ESP-Gerät ist offline oder nicht erreichbar',
      icon: 'mdi-wifi-off',
      color: 'error',
    },
    configured: {
      text: 'ESP-Gerät ist konfiguriert aber möglicherweise offline',
      icon: 'mdi-check-circle',
      color: 'info',
    },
  },

  // Sensor-spezifische Tooltips
  sensorType: {
    temperature: {
      text: 'Temperatursensor - misst Umgebungstemperatur',
      icon: 'mdi-thermometer',
      examples: ['DHT22', 'DS18B20', 'BME280'],
    },
    humidity: {
      text: 'Luftfeuchtigkeitssensor - misst relative Luftfeuchtigkeit',
      icon: 'mdi-water-percent',
      examples: ['DHT22', 'BME280', 'SHT30'],
    },
    light: {
      text: 'Lichtsensor - misst Helligkeit oder UV-Strahlung',
      icon: 'mdi-white-balance-sunny',
      examples: ['LDR', 'BH1750', 'TSL2561'],
    },
    soil: {
      text: 'Bodensensor - misst Bodenfeuchtigkeit oder pH-Wert',
      icon: 'mdi-earth',
      examples: ['Kapazitiv', 'Resistiv', 'pH-Sensor'],
    },
  },

  // Aktor-spezifische Tooltips
  actuatorType: {
    relay: {
      text: 'Relais - schaltet Geräte ein/aus',
      icon: 'mdi-toggle-switch',
      examples: ['Pumpe', 'Ventilator', 'Heizung'],
    },
    pwm: {
      text: 'PWM - steuert Geräte mit variabler Leistung',
      icon: 'mdi-percent',
      examples: ['LED-Dimmer', 'Ventilator-Geschwindigkeit'],
    },
    servo: {
      text: 'Servo - präzise Positionssteuerung',
      icon: 'mdi-rotate-3d-variant',
      examples: ['Ventil', 'Kamera-Position'],
    },
  },
}

/**
 * Gibt kontext-spezifische Tooltip-Definition zurück
 * @param {string} context - Kontext (z.B. 'espStatus', 'sensorType')
 * @param {string} key - Schlüssel innerhalb des Kontexts
 * @returns {Object} Tooltip-Definition oder Standard-Fallback
 */
export function getContextTooltip(context, key) {
  const contextTooltips = CONTEXT_TOOLTIPS[context]
  if (!contextTooltips) {
    return getTooltipDefinition('UNKNOWN')
  }

  return contextTooltips[key] || getTooltipDefinition('UNKNOWN')
}
