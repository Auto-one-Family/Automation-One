import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { normalizeSensorPayload, validateSensorPayload } from '@/utils/mqttTopics'

export const useSensorRegistryStore = defineStore('sensorRegistry', {
  state: () => ({
    // Zentrale Sensor-Registry: Map<`${espId}-${gpio}`, SensorInfo>
    sensors: new Map(),

    // Index für schnelle Suche
    sensorsByEsp: new Map(), // Map<espId, Set<gpio>>
    sensorsByType: new Map(), // Map<sensorType, Set<`${espId}-${gpio}`>>

    loading: false,
    error: null,
    lastUpdate: null,

    // ✅ LÖSUNG: Lokaler Cache für Sensor Registry
    dataCache: new Map(), // Lokaler Cache für Sensor-Daten
    cacheTimeout: 30 * 1000, // 30 Sekunden Cache-Timeout
    batchUpdates: new Map(), // Batch-Updates für Performance
    batchTimeout: null,
    batchInterval: 100, // 100ms Batch-Interval

    // ✅ NEU: Memory-Optimierung
    maxSensors: 1000, // Maximale Anzahl Sensoren im Memory
    compressionThreshold: 100, // Komprimierung ab 100 Sensoren
    cleanupInterval: 5 * 60 * 1000, // 5 Minuten Cleanup-Interval

    // Ergänzung: Default-Felder für Sensoren
    defaultSensorFields: {
      algorithm: 'unknown',
      processing_time_ms: 0,
      processed_value: null,
    },
  }),

  getters: {
    // Alle Sensoren
    getAllSensors: (state) => Array.from(state.sensors.values()),

    // Sensoren nach ESP
    getSensorsByEsp: (state) => (espId) => {
      const gpios = state.sensorsByEsp.get(espId) || new Set()
      return Array.from(gpios).map((gpio) => state.sensors.get(`${espId}-${gpio}`))
    },

    // Sensoren nach Typ
    getSensorsByType: (state) => (sensorType) => {
      const keys = state.sensorsByType.get(sensorType) || new Set()
      return Array.from(keys).map((key) => state.sensors.get(key))
    },

    // Sensor nach ESP und GPIO
    getSensor: (state) => (espId, gpio) => {
      return state.sensors.get(`${espId}-${gpio}`)
    },

    // Aktive Sensoren (mit letztem Update < 5 Minuten)
    getActiveSensors: (state) => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      return Array.from(state.sensors.values()).filter(
        (sensor) => sensor.lastUpdate && sensor.lastUpdate > fiveMinutesAgo,
      )
    },

    // Sensor-Statistiken
    getSensorStats: (state) => {
      const stats = {
        total: state.sensors.size,
        byType: {},
        byEsp: {},
        active: 0,
        inactive: 0,
      }

      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

      state.sensors.forEach((sensor) => {
        // Nach Typ
        stats.byType[sensor.type] = (stats.byType[sensor.type] || 0) + 1

        // Nach ESP
        stats.byEsp[sensor.espId] = (stats.byEsp[sensor.espId] || 0) + 1

        // Aktiv/Inaktiv
        if (sensor.lastUpdate && sensor.lastUpdate > fiveMinutesAgo) {
          stats.active++
        } else {
          stats.inactive++
        }
      })

      return stats
    },

    // 🆕 NEU: Warning-Statistiken
    getWarningStats: (state) => {
      const stats = {
        total: 0,
        byType: {},
        byEsp: {},
        byWarningType: {},
      }

      state.sensors.forEach((sensor) => {
        if (sensor.warnings && sensor.warnings.length > 0) {
          stats.total++
          stats.byType[sensor.type] = (stats.byType[sensor.type] || 0) + 1
          stats.byEsp[sensor.espId] = (stats.byEsp[sensor.espId] || 0) + 1

          sensor.warnings.forEach((warning) => {
            stats.byWarningType[warning] = (stats.byWarningType[warning] || 0) + 1
          })
        }
      })

      return stats
    },

    // 🆕 NEU: Zeitqualität-Statistiken
    getTimeQualityStats: (state) => {
      const stats = {
        good: 0,
        poor: 0,
        unknown: 0,
        total: state.sensors.size,
      }

      state.sensors.forEach((sensor) => {
        const quality = sensor.time_quality || 'unknown'
        stats[quality]++
      })

      return stats
    },
  },

  actions: {
    // ✅ NEU: Sensor-Daten-Verarbeitung aus mqtt.js verschoben
    handleSensorData(espId, topicParts, payload, subzoneId = null, gpio = null) {
      try {
        // ✅ NEU: Verwende Payload-Normalisierung
        const normalizedPayload = normalizeSensorPayload(payload)

        // ✅ NEU: Validiere Payload
        const validation = validateSensorPayload(normalizedPayload)
        if (!validation.isValid) {
          console.warn('[SensorRegistry] Invalid sensor payload:', validation.errors)
          return
        }

        // ✅ KONSISTENT: Verwende bestehende GPIO-Extraction
        if (!gpio) {
          if (topicParts.length >= 7 && topicParts[4] === 'sensor') {
            gpio = topicParts[5]
          } else if (normalizedPayload.gpio) {
            gpio = normalizedPayload.gpio
          } else {
            console.warn('[SensorRegistry] Could not extract GPIO from sensor data')
            return
          }
        }

        const sensorId = gpio

        // ✅ KONSISTENT: Verwende normalisierten Payload
        const sensorData = {
          value: Number(normalizedPayload.raw_data),
          unit: normalizedPayload.unit,
          type: normalizedPayload.sensor_type,
          timestamp: normalizedPayload.timestamp,
          iso_timestamp: normalizedPayload.iso_timestamp,
          quality: normalizedPayload.quality,
          subzoneId: subzoneId,

          // ✅ KONSISTENT: Backend v3.5.0 Felder
          raw_value: normalizedPayload.raw_value,
          raw_mode: normalizedPayload.raw_mode,
          hardware_mode: normalizedPayload.hardware_mode,
          warnings: normalizedPayload.warnings,
          time_quality: normalizedPayload.time_quality,
          context: normalizedPayload.context,
          kaiser_id: normalizedPayload.kaiser_id,
          subzone_id: normalizedPayload.subzone_id || subzoneId,

          // ✅ KONSISTENT: I2C-spezifische Felder
          i2cAddress:
            normalizedPayload.sensor_type === 'SENSOR_CUSTOM_PI_ENHANCED'
              ? normalizedPayload.i2c_address
              : null,
          sensorHint:
            normalizedPayload.sensor_type === 'SENSOR_CUSTOM_PI_ENHANCED'
              ? normalizedPayload.sensor_hint
              : null,
          rawData:
            normalizedPayload.sensor_type === 'SENSOR_CUSTOM_PI_ENHANCED'
              ? normalizedPayload.raw_data
              : null,
          dataLength:
            normalizedPayload.sensor_type === 'SENSOR_CUSTOM_PI_ENHANCED'
              ? normalizedPayload.data_length
              : null,
          sensorName:
            normalizedPayload.sensor_type === 'SENSOR_CUSTOM_PI_ENHANCED'
              ? normalizedPayload.sensor_name
              : null,
        }

        // ✅ NEU: Batch-Update für Sensor-Daten
        this.scheduleBatchUpdate(espId, gpio, sensorData)

        // ✅ NEU: Cache für Sensor-Daten aktualisieren
        const cacheKey = `sensor-${espId}-${sensorId}`
        this.dataCache.set(cacheKey, { data: sensorData, timestamp: Date.now() })

        // ✅ KONSISTENT: Sensor Registry aktualisieren (asynchron)
        this.updateSensorRegistry(espId, sensorId, normalizedPayload, subzoneId)

        console.log(`[SensorRegistry] Sensor data queued for ${espId}:${gpio}:`, {
          value: sensorData.value,
          unit: sensorData.unit,
          raw_mode: sensorData.raw_mode,
          hardware_mode: sensorData.hardware_mode,
          time_quality: sensorData.time_quality,
          warnings: sensorData.warnings,
          sensor_name: sensorData.sensorName,
          subzone_id: sensorData.subzone_id,
          context: sensorData.context,
          iso_timestamp: sensorData.iso_timestamp,
        })
      } catch (error) {
        console.error('[SensorRegistry] Error handling sensor data:', error)
      }
    },

    // ✅ NEU: Helper function für Key-Mapping mit Rückwärtskompatibilität
    getCompatibleValue(payload, legacyKey, newKey, defaultValue = null) {
      return payload[legacyKey] !== undefined
        ? payload[legacyKey]
        : payload[newKey] !== undefined
          ? payload[newKey]
          : defaultValue
    },

    // 🆕 NEU: Warning-Handling Helper
    getWarnings(payload) {
      return payload.warnings || payload.warning || []
    },

    // 🆕 NEU: Zeitqualität-Handling Helper
    getTimeQuality(payload) {
      return payload.time_quality || 'unknown'
    },

    // 🆕 NEU: Context-Handling Helper
    getContext(payload) {
      return payload.context || null
    },

    // 🆕 NEU: Sensor Registry Integration
    async updateSensorRegistry(espId, gpio, payload, subzoneId = null) {
      try {
        // Sensor in Registry registrieren/aktualisieren mit Backend v3.5.0 Feldern
        this.updateSensorData(espId, gpio, {
          value: payload.value,
          unit: payload.unit,
          type: payload.type,
          name: payload.name,
          subzoneId: subzoneId,
          // 🆕 NEU: Backend v3.5.0 Felder
          raw_value: payload.raw_value || null,
          raw_mode: payload.raw_mode || false,
          hardware_mode: payload.hardware_mode || false,
          warnings: payload.warnings || [],
          time_quality: payload.time_quality || 'unknown',
          timestamp: payload.timestamp || Date.now(),
          iso_timestamp: payload.iso_timestamp || null,
          context: payload.context || null,
          sensor: payload.sensor || null,
          algorithm: payload.algorithm || this.defaultSensorFields.algorithm,
          processing_time_ms:
            payload.processing_time_ms || this.defaultSensorFields.processing_time_ms,
          processed_value:
            payload.processed_value || payload.value || this.defaultSensorFields.processed_value,
        })
      } catch (error) {
        console.warn('Failed to update sensor registry:', error)
      }
    },

    // ✅ LÖSUNG: Direkter Cache-Zugriff über Event-System
    getCachedData(key, fetcher, timeout = 30 * 1000) {
      // ✅ LÖSUNG: Lokaler Cache für Sensor Registry
      const cached = this.dataCache.get(key)
      if (cached && Date.now() - cached.timestamp < timeout) {
        return cached.data
      }

      const data = fetcher()
      this.dataCache.set(key, { data, timestamp: Date.now() })
      return data
    },

    clearCache(key = null) {
      // ✅ LÖSUNG: Lokaler Cache für Sensor Registry
      if (key) {
        this.dataCache.delete(key)
      } else {
        this.dataCache.clear()
      }
    },

    // ✅ NEU: Batch-Update-Management
    scheduleBatchUpdate(espId, gpio, data) {
      this.batchUpdates.set(`${espId}-${gpio}`, data)

      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => {
          this.processBatchUpdates()
        }, this.batchInterval)
      }
    },

    processBatchUpdates() {
      this.batchTimeout = null

      for (const [key, data] of this.batchUpdates.entries()) {
        const [espId, gpio] = key.split('-')
        this.updateSensorData(espId, parseInt(gpio), data)
        this.batchUpdates.delete(key)
      }
    },

    // ✅ NEU: Memory-Optimierung
    cleanupOldSensors() {
      const now = Date.now()
      const cutoff = now - 24 * 60 * 60 * 1000 // 24 Stunden

      let cleanedCount = 0
      for (const [key, sensor] of this.sensors.entries()) {
        if (sensor.lastUpdate && sensor.lastUpdate < cutoff) {
          this.sensors.delete(key)
          this.removeFromIndices(sensor.espId, sensor.gpio, sensor.type, key)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        console.log(`[SensorRegistry] Cleaned ${cleanedCount} old sensors`)
        this.persistSensors()
      }
    },

    compressSensorData() {
      if (this.sensors.size < this.compressionThreshold) return

      for (const [, sensor] of this.sensors.entries()) {
        // Komprimiere Sensor-Daten für bessere Performance
        if (sensor.rawData && sensor.rawData.length > 100) {
          sensor.rawData = sensor.rawData.substring(0, 100) + '...'
        }

        // Entferne alte Warnings
        if (sensor.warnings && sensor.warnings.length > 10) {
          sensor.warnings = sensor.warnings.slice(-10)
        }
      }
    },

    startCleanupScheduler() {
      setInterval(() => {
        this.cleanupOldSensors()
        this.compressSensorData()
      }, this.cleanupInterval)
    },

    // Sensor registrieren/aktualisieren
    registerSensor(espId, gpio, sensorData) {
      const key = `${espId}-${gpio}`

      const sensor = {
        id: key,
        espId,
        gpio,
        type: sensorData.type,
        name: sensorData.name || `Sensor ${gpio}`,
        unit: sensorData.unit || '',
        value: sensorData.value || null,
        // 🆕 NEU: Backend v3.5.0 Felder
        raw_value: sensorData.raw_value || null,
        raw_mode: sensorData.raw_mode || false,
        hardware_mode: sensorData.hardware_mode || false,
        warnings: sensorData.warnings || [],
        time_quality: sensorData.time_quality || 'unknown',
        timestamp: sensorData.timestamp || Date.now(),
        iso_timestamp: sensorData.iso_timestamp || null,
        context: sensorData.context || null,
        sensor: sensorData.sensor || null,
        algorithm: sensorData.algorithm || this.defaultSensorFields.algorithm,
        processing_time_ms:
          sensorData.processing_time_ms || this.defaultSensorFields.processing_time_ms,
        processed_value: sensorData.processed_value || this.defaultSensorFields.processed_value,
        // Bestehende Felder
        lastUpdate: sensorData.lastUpdate || Date.now(),
        createdAt: sensorData.createdAt || Date.now(),
        description: sensorData.description || '',
        location: sensorData.location || '',
        subzoneId: sensorData.subzoneId || null,
        // I2C-Felder bleiben
        i2cAddress: sensorData.i2cAddress || null,
        sensorHint: sensorData.sensorHint || null,
        rawData: sensorData.rawData || null,
        dataLength: sensorData.dataLength || null,
        quality: sensorData.quality || null,
      }

      // Haupt-Registry aktualisieren
      this.sensors.set(key, sensor)

      // Indizes aktualisieren
      this.updateIndices(espId, gpio, sensor.type, key)

      this.lastUpdate = Date.now()
      this.persistSensors()

      return sensor
    },

    // Sensor-Daten aktualisieren
    updateSensorData(espId, gpio, data) {
      const key = `${espId}-${gpio}`
      let sensor = this.sensors.get(key)

      if (sensor) {
        // Update existing sensor
        sensor.value = Number(data.value)
        sensor.unit = data.unit || sensor.unit
        sensor.type = data.type || sensor.type
        sensor.name = data.name || sensor.name
        sensor.subzoneId = data.subzoneId || sensor.subzoneId
        sensor.lastUpdate = Date.now()

        // 🆕 NEU: Backend v3.5.0 Felder in updateSensorData erweitern
        sensor.raw_value = data.raw_value || sensor.raw_value
        sensor.raw_mode = data.raw_mode !== undefined ? data.raw_mode : sensor.raw_mode
        sensor.hardware_mode =
          data.hardware_mode !== undefined ? data.hardware_mode : sensor.hardware_mode
        sensor.warnings = data.warnings || sensor.warnings || []
        sensor.time_quality = data.time_quality || sensor.time_quality || 'unknown'
        sensor.timestamp = data.timestamp || sensor.timestamp || Date.now()
        sensor.iso_timestamp = data.iso_timestamp || sensor.iso_timestamp
        sensor.context = data.context || sensor.context
        sensor.sensor = data.sensor || sensor.sensor
        sensor.algorithm = data.algorithm || sensor.algorithm || this.defaultSensorFields.algorithm
        sensor.processing_time_ms =
          data.processing_time_ms ||
          sensor.processing_time_ms ||
          this.defaultSensorFields.processing_time_ms
        sensor.processed_value =
          data.processed_value ||
          data.value ||
          sensor.processed_value ||
          this.defaultSensorFields.processed_value

        // 🆕 NEU: I2C-spezifische Felder in updateSensorData erweitern
        if (data.i2cAddress) {
          sensor.i2cAddress = data.i2cAddress
          sensor.sensorHint = data.sensorHint
          sensor.rawData = data.rawData
          sensor.dataLength = data.dataLength
          sensor.quality = data.quality
        }

        this.sensors.set(key, sensor)
        this.lastUpdate = Date.now()
        this.persistSensors()

        return sensor
      } else {
        // Register new sensor
        return this.registerSensor(espId, gpio, {
          type: data.type || 'unknown',
          name: data.name || `Sensor ${gpio}`,
          unit: data.unit || '',
          value: Number(data.value),
          subzoneId: data.subzoneId || null,
          // 🆕 NEU: Backend v3.5.0 Felder
          raw_value: data.raw_value || null,
          raw_mode: data.raw_mode || false,
          hardware_mode: data.hardware_mode || false,
          warnings: data.warnings || [],
          time_quality: data.time_quality || 'unknown',
          timestamp: data.timestamp || Date.now(),
          iso_timestamp: data.iso_timestamp || null,
          context: data.context || null,
          sensor: data.sensor || null,
          lastUpdate: Date.now(),
          algorithm: data.algorithm || this.defaultSensorFields.algorithm,
          processing_time_ms:
            data.processing_time_ms || this.defaultSensorFields.processing_time_ms,
          processed_value: data.processed_value || this.defaultSensorFields.processed_value,
        })
      }
    },

    // Sensor entfernen
    removeSensor(espId, gpio) {
      const key = `${espId}-${gpio}`
      const sensor = this.sensors.get(key)

      if (sensor) {
        // Aus Haupt-Registry entfernen
        this.sensors.delete(key)

        // Aus Indizes entfernen
        this.removeFromIndices(espId, gpio, sensor.type, key)

        this.lastUpdate = Date.now()
        this.persistSensors()

        return true
      }

      return false
    },

    // Alle Sensoren eines ESP entfernen
    removeEspSensors(espId) {
      const gpios = this.sensorsByEsp.get(espId) || new Set()

      gpios.forEach((gpio) => {
        this.removeSensor(espId, gpio)
      })
    },

    // Indizes aktualisieren
    updateIndices(espId, gpio, sensorType, key) {
      // ESP-Index
      if (!this.sensorsByEsp.has(espId)) {
        this.sensorsByEsp.set(espId, new Set())
      }
      this.sensorsByEsp.get(espId).add(gpio)

      // Typ-Index
      if (!this.sensorsByType.has(sensorType)) {
        this.sensorsByType.set(sensorType, new Set())
      }
      this.sensorsByType.get(sensorType).add(key)
    },

    // Aus Indizes entfernen
    removeFromIndices(espId, gpio, sensorType, key) {
      // ESP-Index
      const espGpios = this.sensorsByEsp.get(espId)
      if (espGpios) {
        espGpios.delete(gpio)
        if (espGpios.size === 0) {
          this.sensorsByEsp.delete(espId)
        }
      }

      // Typ-Index
      const typeKeys = this.sensorsByType.get(sensorType)
      if (typeKeys) {
        typeKeys.delete(key)
        if (typeKeys.size === 0) {
          this.sensorsByType.delete(sensorType)
        }
      }
    },

    // Persistierung
    persistSensors() {
      const sensorsArray = Array.from(this.sensors.entries())
      storage.save('sensor_registry', sensorsArray)
    },

    // Wiederherstellung
    restoreSensors() {
      const sensorsArray = storage.load('sensor_registry', [])
      this.sensors = new Map(sensorsArray)

      // Indizes neu aufbauen
      this.rebuildIndices()
    },

    // Indizes neu aufbauen
    rebuildIndices() {
      this.sensorsByEsp.clear()
      this.sensorsByType.clear()

      this.sensors.forEach((sensor, key) => {
        this.updateIndices(sensor.espId, sensor.gpio, sensor.type, key)
      })
    },

    // Registry leeren
    clearRegistry() {
      this.sensors.clear()
      this.sensorsByEsp.clear()
      this.sensorsByType.clear()
      this.lastUpdate = Date.now()
      this.persistSensors()
    },

    // Fehler zurücksetzen
    clearError() {
      this.error = null
    },
  },
})
