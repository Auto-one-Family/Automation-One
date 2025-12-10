import { defineStore } from 'pinia'
import { eventBus, MQTT_EVENTS, storeHandler } from '@/utils/eventBus'
import { storage } from '@/utils/storage'
import { errorHandler } from '@/utils/errorHandler'

export const usePiIntegrationStore = defineStore('piIntegration', {
  state: () => ({
    // Pi Server Status
    isPiAvailable: false,
    piUrl: '',
    lastUpdate: null,
    loading: false,
    error: null,

    // Pi-Enhanced Devices
    piEnhancedSensors: new Map(), // Map<`${espId}-${gpio}`, PiSensor>
    piEnhancedActuators: new Map(), // Map<`${espId}-${gpio}`, PiActuator>

    // Library Management
    installedLibraries: new Map(), // Map<libraryName, LibraryInfo>
    libraryCache: new Map(), // Map<libraryName, LibraryData>

    // Pi Health & Statistics
    piHealth: {
      status: 'unknown',
      uptime: 0,
      memory: 0,
      cpu: 0,
      lastUpdate: null,
    },

    // Persistence properties
    persistentPiConfig: storage.load('pi_config', {
      piUrl: '',
      isPiAvailable: false,
      lastUpdate: null,
    }),
    persistentLibraries: storage.load('pi_libraries', new Map()),
    persistentSensors: storage.load('pi_sensors', new Map()),
    persistentActuators: storage.load('pi_actuators', new Map()),
  }),

  getters: {
    getPiUrl: (state) => state.piUrl,
    getPiStatus: (state) => state.isPiAvailable,
    getPiHealth: (state) => state.piHealth,
    getInstalledLibraries: (state) => Array.from(state.installedLibraries.values()),
    getLibraryCache: (state) => state.libraryCache,
    getPiEnhancedSensors: (state) => Array.from(state.piEnhancedSensors.values()),
    getPiEnhancedActuators: (state) => Array.from(state.piEnhancedActuators.values()),
    piStatistics: (state) => ({
      totalLibraries: state.installedLibraries.size,
      totalSensors: state.piEnhancedSensors.size,
      totalActuators: state.piEnhancedActuators.size,
      lastUpdate: state.lastUpdate,
    }),
  },

  actions: {
    // Persistence methods
    persistPiConfig() {
      const config = {
        piUrl: this.piUrl,
        isPiAvailable: this.isPiAvailable,
        lastUpdate: this.lastUpdate,
      }
      storage.save('pi_config', config)
    },

    restorePiConfig() {
      const config = storage.load('pi_config', {
        piUrl: '',
        isPiAvailable: false,
        lastUpdate: null,
      })
      this.piUrl = config.piUrl
      this.isPiAvailable = config.isPiAvailable
      this.lastUpdate = config.lastUpdate
    },

    persistLibraries() {
      const librariesArray = Array.from(this.installedLibraries.entries())
      storage.save('pi_libraries', librariesArray)
    },

    restoreLibraries() {
      const librariesArray = storage.load('pi_libraries', [])
      this.installedLibraries = new Map(librariesArray)
    },

    persistPiSensors() {
      const sensorsArray = Array.from(this.piEnhancedSensors.entries())
      storage.save('pi_sensors', sensorsArray)
    },

    restorePiSensors() {
      const sensorsArray = storage.load('pi_sensors', [])
      this.piEnhancedSensors = new Map(sensorsArray)
    },

    persistPiActuators() {
      const actuatorsArray = Array.from(this.piEnhancedActuators.entries())
      storage.save('pi_actuators', actuatorsArray)
    },

    restorePiActuators() {
      const actuatorsArray = storage.load('pi_actuators', [])
      this.piEnhancedActuators = new Map(actuatorsArray)
    },

    // ✅ NEU: Restore-Methoden für Konsistenz mit main.js
    restoreSensors() {
      this.restorePiSensors()
    },

    restoreActuators() {
      this.restorePiActuators()
    },

    // Pi Server Management
    async checkPiStatus(espId) {
      this.loading = true
      this.error = null

      try {
        // Event für Pi-Status anfordern
        eventBus.emit(MQTT_EVENTS.PI_STATUS_REQUEST, { espId })
        this.lastUpdate = Date.now()
        this.persistPiConfig()
      } catch (error) {
        console.error('Failed to check Pi status:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async setPiUrl(espId, piUrl) {
      this.loading = true
      this.error = null

      try {
        this.piUrl = piUrl
        // Event für Pi-URL-Setzung
        eventBus.emit(MQTT_EVENTS.PI_URL_SET, { espId, piUrl })
        this.lastUpdate = Date.now()
        this.persistPiConfig()
      } catch (error) {
        console.error('Failed to set Pi URL:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async getPiHealthCheck(espId) {
      this.loading = true
      this.error = null

      try {
        // Event für Pi-Health-Check anfordern
        eventBus.emit(MQTT_EVENTS.PI_HEALTH_CHECK, { espId })
        this.lastUpdate = Date.now()
        this.persistPiConfig()
      } catch (error) {
        console.error('Failed to get Pi health check:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // Library Management
    async installLibrary(espId, libraryName, libraryCode, version = '1.0.0') {
      this.loading = true
      this.error = null

      try {
        // Add to installed libraries with pending status
        const libraryInfo = {
          name: libraryName,
          version: version,
          status: 'installing',
          installedAt: Date.now(),
          code: libraryCode,
        }
        this.installedLibraries.set(libraryName, libraryInfo)
        this.persistLibraries()

        // Send installation command via Event-System
        eventBus.emit(MQTT_EVENTS.PI_INSTALL_LIBRARY, {
          espId,
          libraryName,
          libraryCode,
          version,
        })
        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to install library:', error)
        this.error = error.message
        // Remove from installed libraries if installation failed
        this.installedLibraries.delete(libraryName)
        this.persistLibraries()
        throw error
      } finally {
        this.loading = false
      }
    },

    async removeLibrary(libraryName) {
      this.loading = true
      this.error = null

      try {
        this.installedLibraries.delete(libraryName)
        this.libraryCache.delete(libraryName)
        this.persistLibraries()
        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to remove library:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // Pi-Enhanced Sensor Management
    async configurePiSensor(espId, gpio, sensorType, sensorName, subzoneId) {
      this.loading = true
      this.error = null

      try {
        const sensorKey = `${espId}-${gpio}`
        const sensorInfo = {
          espId,
          gpio,
          type: sensorType,
          name: sensorName,
          subzoneId,
          configuredAt: Date.now(),
          status: 'configuring',
        }
        this.piEnhancedSensors.set(sensorKey, sensorInfo)
        this.persistPiSensors()

        // Send configuration command via Event-System
        eventBus.emit(MQTT_EVENTS.PI_CONFIGURE_SENSOR, {
          espId,
          gpio,
          sensorType,
          sensorName,
          subzoneId,
        })
        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to configure Pi sensor:', error)
        this.error = error.message
        // Remove from sensors if configuration failed
        const sensorKey = `${espId}-${gpio}`
        this.piEnhancedSensors.delete(sensorKey)
        this.persistPiSensors()
        throw error
      } finally {
        this.loading = false
      }
    },

    async removePiSensor(espId, gpio, reason = 'maintenance') {
      this.loading = true
      this.error = null

      try {
        const sensorKey = `${espId}-${gpio}`
        this.piEnhancedSensors.delete(sensorKey)
        this.persistPiSensors()

        // Send removal command via Event-System
        eventBus.emit(MQTT_EVENTS.PI_REMOVE_SENSOR, {
          espId,
          gpio,
          reason,
        })
        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to remove Pi sensor:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // 🆕 NEU: I2C Sensor Management
    async configureI2CSensor(espId, gpio, i2cAddress, sensorHint, sensorName, subzoneId) {
      this.loading = true
      this.error = null

      try {
        const sensorKey = `${espId}-${gpio}`
        const sensorInfo = {
          espId,
          gpio,
          type: 'SENSOR_CUSTOM_PI_ENHANCED',
          name: sensorName,
          subzoneId,
          i2cAddress,
          sensorHint,
          configuredAt: Date.now(),
          status: 'configuring',
        }
        this.piEnhancedSensors.set(sensorKey, sensorInfo)
        this.persistPiSensors()

        // Send I2C configuration via Event-System
        eventBus.emit(MQTT_EVENTS.PI_I2C_CONFIGURATION, {
          espId,
          gpio,
          i2c_address: i2cAddress,
          sensor_hint: sensorHint,
          subzone_id: subzoneId,
          sensor_name: sensorName,
        })

        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to configure I2C sensor:', error)
        this.error = error.message
        const sensorKey = `${espId}-${gpio}`
        this.piEnhancedSensors.delete(sensorKey)
        this.persistPiSensors()
        throw error
      } finally {
        this.loading = false
      }
    },

    async getPiSensorStatistics(espId) {
      this.loading = true
      this.error = null

      try {
        // Request sensor statistics via Event-System
        eventBus.emit(MQTT_EVENTS.PI_SENSOR_STATISTICS, { espId })
        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to get Pi sensor statistics:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // Pi-Enhanced Actuator Management
    async configurePiActuator(espId, gpio, actuatorType, actuatorName, subzoneId) {
      this.loading = true
      this.error = null

      try {
        const actuatorKey = `${espId}-${gpio}`
        const actuatorInfo = {
          espId,
          gpio,
          type: actuatorType,
          name: actuatorName,
          subzoneId,
          configuredAt: Date.now(),
          status: 'configuring',
        }
        this.piEnhancedActuators.set(actuatorKey, actuatorInfo)
        this.persistPiActuators()

        // Send actuator configuration via Event-System
        eventBus.emit(MQTT_EVENTS.PI_CONFIGURE_ACTUATOR, {
          espId,
          gpio,
          actuatorType,
          actuatorName,
          subzoneId,
        })
        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to configure Pi actuator:', error)
        this.error = error.message
        // Remove from actuators if configuration failed
        const actuatorKey = `${espId}-${gpio}`
        this.piEnhancedActuators.delete(actuatorKey)
        this.persistPiActuators()
        throw error
      } finally {
        this.loading = false
      }
    },

    // MQTT Message Handlers
    handlePiStatusUpdate(payload) {
      this.isPiAvailable = payload.available || false
      this.piUrl = payload.url || this.piUrl
      this.lastUpdate = Date.now()
      this.persistPiConfig()
    },

    handlePiHealthUpdate(payload) {
      this.piHealth = {
        status: payload.status || 'unknown',
        uptime: payload.uptime || 0,
        memory: payload.memory || 0,
        cpu: payload.cpu || 0,
        lastUpdate: Date.now(),
      }
    },

    handlePiSensorStatisticsResponse(payload) {
      // Update sensor statistics if needed
      if (payload.sensors) {
        payload.sensors.forEach((sensorStat) => {
          const sensorKey = `${sensorStat.esp_id}-${sensorStat.gpio}`
          const sensor = this.piEnhancedSensors.get(sensorKey)
          if (sensor) {
            sensor.statistics = sensorStat.statistics
            sensor.lastUpdate = Date.now()
          }
        })
        this.persistPiSensors()
      }
    },

    handlePiLibraryResponse(payload) {
      const libraryName = payload.library_name
      const library = this.installedLibraries.get(libraryName)

      if (library) {
        if (payload.success) {
          library.status = 'installed'
          library.installedAt = Date.now()
          library.response = payload.response || null
        } else {
          library.status = 'failed'
          library.error = payload.error || 'Installation failed'
        }
        this.persistLibraries()
      }

      // Cache library data
      if (payload.code) {
        this.libraryCache.set(libraryName, {
          code: payload.code,
          version: payload.version || '1.0.0',
          timestamp: Date.now(),
        })
      }
    },

    // Utility methods
    clearError() {
      this.error = null
    },

    getLibraryByName(libraryName) {
      return this.installedLibraries.get(libraryName)
    },

    getSensorByGpio(espId, gpio) {
      const sensorKey = `${espId}-${gpio}`
      return this.piEnhancedSensors.get(sensorKey)
    },

    getActuatorByGpio(espId, gpio) {
      const actuatorKey = `${espId}-${gpio}`
      return this.piEnhancedActuators.get(actuatorKey)
    },

    // 🆕 NEU: Event-Handler für Pi Integration Events
    handlePiStatusRequest(data) {
      try {
        console.log('[PiIntegration] Pi status request received:', data)
        // Response mit aktuellen Pi-Status senden
        eventBus.emit(MQTT_EVENTS.PI_STATUS_REQUEST, {
          espId: data.espId,
          available: this.isPiAvailable,
          url: this.piUrl,
          lastUpdate: this.lastUpdate,
        })
      } catch (error) {
        errorHandler.error('Failed to handle Pi status request', error, { data })
      }
    },

    handlePiUrlSet(data) {
      try {
        console.log('[PiIntegration] Pi URL set request received:', data)
        this.setPiUrl(data.espId, data.piUrl)
      } catch (error) {
        errorHandler.error('Failed to handle Pi URL set request', error, { data })
      }
    },

    handlePiHealthCheck(data) {
      try {
        console.log('[PiIntegration] Pi health check request received:', data)
        this.getPiHealthCheck(data.espId)
      } catch (error) {
        errorHandler.error('Failed to handle Pi health check request', error, { data })
      }
    },

    handlePiInstallLibrary(data) {
      try {
        console.log('[PiIntegration] Pi install library request received:', data)
        this.installLibrary(data.espId, data.libraryName, data.libraryCode, data.version)
      } catch (error) {
        errorHandler.error('Failed to handle Pi install library request', error, { data })
      }
    },

    handlePiConfigureSensor(data) {
      try {
        console.log('[PiIntegration] Pi configure sensor request received:', data)
        this.configurePiSensor(
          data.espId,
          data.gpio,
          data.sensorType,
          data.sensorName,
          data.subzoneId,
        )
      } catch (error) {
        errorHandler.error('Failed to handle Pi configure sensor request', error, { data })
      }
    },

    handlePiRemoveSensor(data) {
      try {
        console.log('[PiIntegration] Pi remove sensor request received:', data)
        this.removePiSensor(data.espId, data.gpio, data.reason)
      } catch (error) {
        errorHandler.error('Failed to handle Pi remove sensor request', error, { data })
      }
    },

    handlePiI2cConfiguration(data) {
      try {
        console.log('[PiIntegration] Pi I2C configuration request received:', data)
        this.configureI2CSensor(
          data.espId,
          data.gpio,
          data.i2cAddress,
          data.sensorHint,
          data.sensorName,
          data.subzoneId,
        )
      } catch (error) {
        errorHandler.error('Failed to handle Pi I2C configuration request', error, { data })
      }
    },

    handlePiSensorStatistics(data) {
      try {
        console.log('[PiIntegration] Pi sensor statistics request received:', data)
        this.getPiSensorStatistics(data.espId)
      } catch (error) {
        errorHandler.error('Failed to handle Pi sensor statistics request', error, { data })
      }
    },

    handlePiConfigureActuator(data) {
      try {
        console.log('[PiIntegration] Pi configure actuator request received:', data)
        this.configurePiActuator(
          data.espId,
          data.gpio,
          data.actuatorType,
          data.actuatorName,
          data.subzoneId,
        )
      } catch (error) {
        errorHandler.error('Failed to handle Pi configure actuator request', error, { data })
      }
    },

    // 🆕 NEU: Event-Listener-Initialisierung
    initializeEventListeners() {
      // Pi Integration Event-Handler registrieren
      eventBus.on(MQTT_EVENTS.PI_STATUS_REQUEST, (data) => this.handlePiStatusRequest(data))
      eventBus.on(MQTT_EVENTS.PI_URL_SET, (data) => this.handlePiUrlSet(data))
      eventBus.on(MQTT_EVENTS.PI_HEALTH_CHECK, (data) => this.handlePiHealthCheck(data))
      eventBus.on(MQTT_EVENTS.PI_INSTALL_LIBRARY, (data) => this.handlePiInstallLibrary(data))
      eventBus.on(MQTT_EVENTS.PI_CONFIGURE_SENSOR, (data) => this.handlePiConfigureSensor(data))
      eventBus.on(MQTT_EVENTS.PI_REMOVE_SENSOR, (data) => this.handlePiRemoveSensor(data))
      eventBus.on(MQTT_EVENTS.PI_I2C_CONFIGURATION, (data) => this.handlePiI2cConfiguration(data))
      eventBus.on(MQTT_EVENTS.PI_SENSOR_STATISTICS, (data) => this.handlePiSensorStatistics(data))
      eventBus.on(MQTT_EVENTS.PI_CONFIGURE_ACTUATOR, (data) => this.handlePiConfigureActuator(data))

      console.log('✅ PiIntegration Event-Listener initialisiert')
    },
  },

  // 🆕 NEU: Store-Initialisierung mit Event-Listenern
  setup() {
    const store = usePiIntegrationStore()
    store.initializeEventListeners()

    // ✅ NEU: Store im Event-System registrieren
    storeHandler.registerStore('piIntegration', store)

    // ❌ ENTFERNT: Zirkuläre Event-Emission
    // eventBus.emit(STORE_EVENTS.STORE_READY, {
    //   storeName: 'piIntegration',
    //   timestamp: Date.now(),
    // })

    return {}
  },
})
