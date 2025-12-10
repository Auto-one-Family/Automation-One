// 🆕 NEU: Sensor-Frequenz-Validierung für langsame Sensoren
export const sensorValidation = {
  // 🆕 NEU: Sensor-Typen mit erwarteten Messintervallen
  sensorTypes: {
    // Elektrochemische Sensoren (langsam)
    SENSOR_PH: {
      expectedInterval: 3600000, // 1 Stunde
      maxDelay: 7200000, // 2 Stunden
      type: 'slow',
      eventBased: false,
      helpText:
        'pH-Sensoren messen seltener (1-2 Stunden). Elektrochemische Sensoren benötigen Zeit zur Stabilisierung.',
      offlineExplanation:
        'pH-Sensor hat seit 2 Stunden keinen Wert gemeldet. Elektrochemische Sensoren senden seltener.',
    },
    SENSOR_EC: {
      expectedInterval: 3600000, // 1 Stunde
      maxDelay: 7200000, // 2 Stunden
      type: 'slow',
      eventBased: false,
      helpText:
        'EC-Sensoren messen seltener (1-2 Stunden). Elektrochemische Sensoren benötigen Zeit zur Stabilisierung.',
      offlineExplanation:
        'EC-Sensor hat seit 2 Stunden keinen Wert gemeldet. Elektrochemische Sensoren senden seltener.',
    },
    SENSOR_PH_EC: {
      expectedInterval: 3600000, // 1 Stunde
      maxDelay: 7200000, // 2 Stunden
      type: 'slow',
      eventBased: false,
      helpText:
        'pH/EC-Kombisensoren messen seltener (1-2 Stunden). Elektrochemische Sensoren benötigen Zeit zur Stabilisierung.',
      offlineExplanation:
        'pH/EC-Sensor hat seit 2 Stunden keinen Wert gemeldet. Elektrochemische Sensoren senden seltener.',
    },

    // Eventbasierte Sensoren
    SENSOR_MOISTURE_PUMP_TRIGGERED: {
      expectedInterval: 0, // Eventbasiert
      maxDelay: 0, // Eventbasiert
      type: 'event',
      eventBased: true,
      isTriggeredBy: 'ACTUATOR_WATER_PUMP',
      helpText: 'Eventbasierter Sensor. Misst nur wenn Wasserpumpe aktiviert wird.',
      offlineExplanation: 'Eventbasierter Sensor - misst nur bei Pumpenaktivierung.',
    },

    // Standard-Sensoren (schnell)
    SENSOR_TEMP_DS18B20: {
      expectedInterval: 30000, // 30 Sekunden
      maxDelay: 300000, // 5 Minuten
      type: 'fast',
      eventBased: false,
      helpText: 'Temperatursensor misst alle 30 Sekunden. Sollte regelmäßig Werte liefern.',
      offlineExplanation:
        'Temperatursensor hat seit 5 Minuten keinen Wert gemeldet. Prüfen Sie die Verbindung.',
    },
    SENSOR_MOISTURE: {
      expectedInterval: 60000, // 1 Minute
      maxDelay: 300000, // 5 Minuten
      type: 'fast',
      eventBased: false,
      helpText: 'Feuchtigkeitssensor misst alle Minute. Sollte regelmäßig Werte liefern.',
      offlineExplanation:
        'Feuchtigkeitssensor hat seit 5 Minuten keinen Wert gemeldet. Prüfen Sie die Verbindung.',
    },
    SENSOR_LIGHT: {
      expectedInterval: 30000, // 30 Sekunden
      maxDelay: 300000, // 5 Minuten
      type: 'fast',
      eventBased: false,
      helpText: 'Lichtsensor misst alle 30 Sekunden. Sollte regelmäßig Werte liefern.',
      offlineExplanation:
        'Lichtsensor hat seit 5 Minuten keinen Wert gemeldet. Prüfen Sie die Verbindung.',
    },
    SENSOR_HUMIDITY_DHT22: {
      expectedInterval: 30000, // 30 Sekunden
      maxDelay: 300000, // 5 Minuten
      type: 'fast',
      eventBased: false,
      helpText: 'Luftfeuchtigkeitssensor misst alle 30 Sekunden. Sollte regelmäßig Werte liefern.',
      offlineExplanation:
        'Luftfeuchtigkeitssensor hat seit 5 Minuten keinen Wert gemeldet. Prüfen Sie die Verbindung.',
    },
  },

  // 🆕 NEU: Sensor-Status basierend auf Frequenz validieren
  validateSensorStatus(sensor, lastReading) {
    const sensorConfig = this.sensorTypes[sensor.type]

    if (!sensorConfig) {
      // Unbekannter Sensor-Typ - Standard-Validierung
      return this.validateDefaultSensor(lastReading)
    }

    // Eventbasierte Sensoren
    if (sensorConfig.eventBased) {
      return this.validateEventBasedSensor(sensor, lastReading, sensorConfig)
    }

    const now = Date.now()
    const timeSinceLastReading = now - lastReading.timestamp

    if (sensorConfig.type === 'slow') {
      // Langsame Sensoren - weniger strenge Validierung
      return this.validateSlowSensor(timeSinceLastReading, sensorConfig)
    } else {
      // Schnelle Sensoren - Standard-Validierung
      return this.validateFastSensor(timeSinceLastReading, sensorConfig)
    }
  },

  // 🆕 NEU: Eventbasierte Sensoren validieren
  validateEventBasedSensor(sensor, lastReading, config) {
    // Eventbasierte Sensoren haben keine regelmäßigen Updates
    // Prüfe nur, ob der Trigger ausgelöst wurde
    if (config.isTriggeredBy) {
      // Hier könnte die Trigger-Logik implementiert werden
      // Für jetzt: Akzeptiere alle eventbasierten Sensoren als "online"
      return {
        status: 'online',
        health: 'good',
        type: 'event-based',
        triggeredBy: config.isTriggeredBy,
        helpText: config.helpText,
      }
    }

    return { status: 'online', health: 'good', type: 'event-based', helpText: config.helpText }
  },

  // 🆕 NEU: Langsame Sensoren validieren
  validateSlowSensor(timeSinceLastReading, config) {
    if (timeSinceLastReading <= config.expectedInterval) {
      return {
        status: 'online',
        health: 'excellent',
        helpText: config.helpText,
      }
    } else if (timeSinceLastReading <= config.maxDelay) {
      return {
        status: 'online',
        health: 'warning',
        helpText: config.helpText,
      }
    } else {
      return {
        status: 'offline',
        health: 'error',
        helpText: config.offlineExplanation,
      }
    }
  },

  // 🆕 NEU: Schnelle Sensoren validieren
  validateFastSensor(timeSinceLastReading, config) {
    if (timeSinceLastReading <= config.expectedInterval) {
      return {
        status: 'online',
        health: 'excellent',
        helpText: config.helpText,
      }
    } else if (timeSinceLastReading <= config.maxDelay) {
      return {
        status: 'online',
        health: 'warning',
        helpText: config.helpText,
      }
    } else {
      return {
        status: 'offline',
        health: 'error',
        helpText: config.offlineExplanation,
      }
    }
  },

  // 🆕 NEU: Standard-Validierung für unbekannte Sensoren
  validateDefaultSensor(lastReading) {
    const timeSinceLastReading = Date.now() - lastReading.timestamp
    const fiveMinutes = 5 * 60 * 1000

    if (timeSinceLastReading <= fiveMinutes) {
      return {
        status: 'online',
        health: 'excellent',
        helpText: 'Unbekannter Sensortyp - Standard-Validierung aktiv.',
      }
    } else {
      return {
        status: 'offline',
        health: 'error',
        helpText: 'Sensor hat seit 5 Minuten keinen Wert gemeldet. Prüfen Sie die Verbindung.',
      }
    }
  },

  // 🆕 NEU: Aktor-Status validieren (eventgesteuert)
  validateActuatorStatus(actuator, lastActivity) {
    const now = Date.now()
    const timeSinceLastActivity = now - lastActivity.timestamp

    // Eventgesteuerte Aktoren haben keine regelmäßigen Updates
    if (actuator.type.includes('PUMP') || actuator.type.includes('MOTOR')) {
      return {
        status: 'idle',
        health: 'good',
        lastActivity: lastActivity.timestamp,
        message: `Letzter Lauf: ${new Date(lastActivity.timestamp).toLocaleTimeString()}`,
        helpText: 'Eventgesteuerter Aktor - aktiviert nur bei Bedarf.',
      }
    }

    // Standard-Aktoren
    const oneHour = 60 * 60 * 1000
    if (timeSinceLastActivity <= oneHour) {
      return {
        status: 'online',
        health: 'good',
        helpText: 'Aktor ist online und bereit.',
      }
    } else {
      return {
        status: 'idle',
        health: 'warning',
        helpText: 'Aktor war seit einer Stunde nicht aktiv. Prüfen Sie die Konfiguration.',
      }
    }
  },

  // 🆕 NEU: Health-Check-Warnings für langsame Sensoren deaktivieren
  shouldShowHealthWarning(sensor) {
    const sensorConfig = this.sensorTypes[sensor.type]

    if (sensorConfig && (sensorConfig.type === 'slow' || sensorConfig.eventBased)) {
      // Keine Health-Check-Warnings für langsame oder eventbasierte Sensoren
      return false
    }

    return true
  },

  // 🆕 NEU: Sensor-Konfiguration abrufen
  getSensorConfig(sensorType) {
    return this.sensorTypes[sensorType] || null
  },

  // 🆕 NEU: Ist Sensor eventbasiert
  isEventBased(sensorType) {
    const config = this.getSensorConfig(sensorType)
    return config?.eventBased || false
  },

  // 🆕 NEU: Ist Sensor langsam
  isSlowSensor(sensorType) {
    const config = this.getSensorConfig(sensorType)
    return config?.type === 'slow'
  },

  // 🆕 NEU: Hilfetext für Sensor abrufen
  getSensorHelpText(sensorType) {
    const config = this.getSensorConfig(sensorType)
    return config?.helpText || 'Standard-Sensor ohne spezielle Konfiguration.'
  },

  // 🆕 NEU: Offline-Erklärung für Sensor abrufen
  getSensorOfflineExplanation(sensorType) {
    const config = this.getSensorConfig(sensorType)
    return (
      config?.offlineExplanation ||
      'Sensor hat seit längerer Zeit keinen Wert gemeldet. Prüfen Sie die Verbindung.'
    )
  },
}

// 🆕 NEU: Composable für Sensor-Validierung
export const useSensorValidation = () => {
  return {
    validateSensorStatus: sensorValidation.validateSensorStatus.bind(sensorValidation),
    validateActuatorStatus: sensorValidation.validateActuatorStatus.bind(sensorValidation),
    shouldShowHealthWarning: sensorValidation.shouldShowHealthWarning.bind(sensorValidation),
    getSensorConfig: sensorValidation.getSensorConfig.bind(sensorValidation),
    isEventBased: sensorValidation.isEventBased.bind(sensorValidation),
    isSlowSensor: sensorValidation.isSlowSensor.bind(sensorValidation),
    getSensorHelpText: sensorValidation.getSensorHelpText.bind(sensorValidation),
    getSensorOfflineExplanation:
      sensorValidation.getSensorOfflineExplanation.bind(sensorValidation),
  }
}
