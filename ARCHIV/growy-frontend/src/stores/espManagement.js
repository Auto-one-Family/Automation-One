import { defineStore } from 'pinia'
import { useCentralConfigStore } from './centralConfig'
import { storage } from '@/utils/storage'
import { safeSuccess, safeError, safeInfo } from '@/utils/snackbarUtils'
import { eventBus, MQTT_EVENTS, storeHandler } from '@/utils/eventBus'

export const useEspManagementStore = defineStore('espManagement', {
  state: () => ({
    // ✅ BESTEHEND: Board-spezifische Pin-Definitionen
    boardPinConfigs: {
      ESP32_DEVKIT: {
        name: 'ESP32 DevKit (WROOM-32)',
        availablePins: [2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
        i2c: { sda: 21, scl: 22 }, // Standard I2C Pins für DevKit
        inputOnly: [34, 35, 36, 39], // ADC Pins sind nur Input
        reserved: [0, 1, 3, 6, 7, 8, 9, 10, 11], // Boot, UART, SPI, etc.
      },
      ESP32_C3_XIAO: {
        name: 'ESP32-C3 (XIAO)',
        availablePins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21], // ✅ Korrigiert basierend auf xiao_config.h
        i2c: { sda: 4, scl: 5 }, // ✅ Korrigiert basierend auf xiao_config.h (XIAO_I2C_SDA=4, XIAO_I2C_SCL=5)
        inputOnly: [], // XIAO hat keine Input-Only Pins
        reserved: [0], // Boot Pin
      },
    },

    // ✅ BESTEHEND: Verfügbare GPIO Pins (basierend auf Backend) - Default für DevKit
    availablePins: [0, 2, 4, 5, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],

    // ✅ KONSOLIDIERT: ESP Devices werden jetzt über MQTT Store verwaltet
    // espDevices: new Map(), // ENTFERNT - wird über mqttStore.espDevices verwaltet

    // ✅ ENTFERNT: selectedEspId wird jetzt zentral in centralConfig verwaltet
    // selectedEspId: null,

    // ✅ BESTEHEND: Loading & Error States
    loading: false,
    error: null,
    lastUpdate: null,

    // 🆕 NEU: Pending Pin Assignments für Apply/Confirm Workflow
    pendingPinAssignments: new Map(), // Map<espId, Array<PinAssignment>>
    pendingChangesCount: 0,

    // 🆕 NEU: GPIO-Konflikte für Server-Integration
    gpioConflicts: new Map(),

    // ✅ NEU: Pin-zu-Subzone-Mapping mit Cross-ESP-Support
    pinSubzoneMapping: new Map(), // Map<espId, Map<gpio, { subzoneId, deviceType }>>

    // ✅ NEU: Cross-Subzone-Index für Logic-Engine
    crossSubzoneIndex: {
      byDeviceType: {
        sensors: [], // Alle Sensor-Subzones
        actuators: [], // Alle Aktor-Subzones
      },
      byZone: new Map(), // Map<zoneName, Array<subzoneInfo>>
    },

    // ✅ NEU: Lokaler Cache für ESP Management (löst zirkuläre Abhängigkeiten)
    dataCache: new Map(), // Lokaler Cache für ESP-Daten
    cacheTimeout: 30 * 1000, // 30 Sekunden Cache-Timeout

    // Ergänzung: Default-Felder für ESPs
    defaultEspFields: {
      algorithm: 'unknown',
      processing_time_ms: 0,
      processed_value: null,
    },
  }),

  getters: {
    // ✅ EVENT-BASED: ESP Devices werden jetzt über dynamischen Import verwaltet
    getEspDevices: () => new Map(), // Fallback für Getter
    getEspDevice: () => () => null, // Fallback für Getter

    // ✅ ENTFERNT: selectedEspId-Getter werden jetzt über centralConfig verwaltet
    // getSelectedEsp: (state) => useMqttStore().espDevices.get(state.selectedEspId),
    // getSelectedEspId: (state) => state.selectedEspId,
    isLoading: (state) => state.loading,
    getError: (state) => state.error,
    getLastUpdate: (state) => state.lastUpdate,
    getAvailablePins: (state) => state.availablePins,

    // ✅ BESTEHEND: Board-Typ Getter/Setter
    getEspBoardType: () => () => {
      // ✅ EVENT-BASED: Dynamischer Import für ESP Device-Zugriff
      return 'ESP32_DEVKIT' // Fallback
    },

    // ✅ BESTEHEND: Board-spezifische Pin-Getter
    getAvailablePinsForBoard: (state) => (boardType) => {
      return (
        state.boardPinConfigs[boardType]?.availablePins ||
        state.boardPinConfigs.ESP32_DEVKIT.availablePins
      )
    },

    getI2CPinsForBoard: (state) => (boardType) => {
      return state.boardPinConfigs[boardType]?.i2c || state.boardPinConfigs.ESP32_DEVKIT.i2c
    },

    getReservedPinsForBoard: (state) => (boardType) => {
      return (
        state.boardPinConfigs[boardType]?.reserved || state.boardPinConfigs.ESP32_DEVKIT.reserved
      )
    },

    // ✅ BESTEHEND: Board-Typ-Optionen für UI
    getBoardTypeOptions: (state) => {
      return Object.entries(state.boardPinConfigs).map(([value, config]) => ({
        value,
        name: config.name,
      }))
    },

    // ✅ EVENT-BASED: Get available pins for a specific ESP (excluding already assigned pins) - jetzt board-spezifisch
    getAvailablePinsForEsp: () => () => {
      // ✅ EVENT-BASED: Dynamischer Import für ESP Device-Zugriff
      return [] // Fallback - wird in async Methoden implementiert
    },

    // ✅ EVENT-BASED: Get all pin assignments for an ESP
    getPinAssignments: () => () => {
      // ✅ EVENT-BASED: Dynamischer Import für ESP Device-Zugriff
      return [] // Fallback - wird in async Methoden implementiert
    },

    // ✅ EVENT-BASED: Get subzones for an ESP
    getSubzones: () => () => {
      // ✅ EVENT-BASED: Dynamischer Import für ESP Device-Zugriff
      return [] // Fallback - wird in async Methoden implementiert
    },

    // ✅ EVENT-BASED: Get zone information for an ESP
    getZoneInfo: () => () => {
      // ✅ EVENT-BASED: Dynamischer Import für ESP Device-Zugriff
      return null // Fallback - wird in async Methoden implementiert
    },

    // ✅ EVENT-BASED: Get ESP devices list (jetzt über dynamischen Import)
    getEspDevicesList: () => {
      // ✅ EVENT-BASED: Dynamischer Import für ESP Device-Zugriff
      return [] // Fallback - wird in async Methoden implementiert
    },

    // 🆕 NEU: Pending Assignments Getters
    getPendingAssignments: (state) => (espId) => {
      return state.pendingPinAssignments.get(espId) || []
    },

    hasPendingAssignments: (state) => (espId) => {
      const pending = state.pendingPinAssignments.get(espId)
      return pending && pending.length > 0
    },

    getPendingCount: (state) => (espId) => {
      const pending = state.pendingPinAssignments.get(espId)
      return pending ? pending.length : 0
    },

    getTotalPendingCount: (state) => {
      let total = 0
      state.pendingPinAssignments.forEach((assignments) => {
        total += assignments.length
      })
      return total
    },

    // 🆕 NEU: GPIO-Konflikte Getter
    getGpioConflicts: (state) => {
      return Array.from(state.gpioConflicts.values())
    },

    hasGpioConflicts: (state) => (espId) => {
      return state.gpioConflicts.has(espId)
    },

    // ✅ NEU: Lokale Cache-Methoden für ESP Management
    getCachedData:
      (state) =>
      (key, fetcher, timeout = 30 * 1000) => {
        const cached = state.dataCache.get(key)
        if (cached && Date.now() - cached.timestamp < timeout) {
          return cached.data
        }

        const data = fetcher()
        state.dataCache.set(key, { data, timestamp: Date.now() })
        return data
      },

    clearCache:
      (state) =>
      (key = null) => {
        if (key) {
          state.dataCache.delete(key)
        } else {
          state.dataCache.clear()
        }
      },

    storeInCache: (state) => (key, data) => {
      state.dataCache.set(key, { data, timestamp: Date.now() })
    },
  },

  actions: {
    // ✅ BUS-COMPLIANT: Store-Synchronisation
    async syncWithMqttStore() {
      try {
        this.loading = true

        // Event-basierte Synchronisation
        eventBus.emit(MQTT_EVENTS.ESP_MANAGEMENT_SYNC, {
          timestamp: Date.now(),
          source: 'espManagement',
        })

        this.lastUpdate = Date.now()
        this.loading = false
      } catch (error) {
        console.error('Failed to sync with MQTT store:', error)
        this.loading = false
      }
    },

    migrateI2CConfigurations() {
      try {
        const oldConfigs = storage.get('i2c_sensor_configurations') || []
        let migratedCount = 0

        oldConfigs.forEach((config) => {
          const espId = config.espId
          // ✅ EVENT-BASED: Dynamischer Import für ESP Device-Zugriff
          this.getEspDeviceAsync(espId).then((device) => {
            if (device) {
              // Erstelle Pin-Assignment für I2C-Sensor
              const pinAssignment = {
                gpio: config.gpio || 21, // Default I2C SDA
                type: 'SENSOR_CUSTOM_PI_ENHANCED',
                name: config.sensorName || 'Migrated I2C Sensor',
                subzone: config.subzoneId || 'default',
                category: 'sensor',
                i2cAddress: config.i2cAddress || '0x44',
                sensorHint: config.sensorHint || 'SHT31',
              }

              // Füge zur ESP-Konfiguration hinzu
              this.configurePinAssignment(espId, pinAssignment)
              migratedCount++
            }
          })
        })

        // Lösche alte I2C-Konfigurationen
        storage.remove('i2c_sensor_configurations')

        if (migratedCount > 0) {
          window.$snackbar?.showSuccess(`${migratedCount} I2C-Konfigurationen erfolgreich migriert`)
        }

        return migratedCount
      } catch (error) {
        console.error('Failed to migrate I2C configurations:', error)
      }
    },

    async updateEspDevice(espId, deviceData) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const espDevices = mqttStore.espDevices
        const existingDevice = espDevices?.get(espId) || {}
        const updatedDevice = {
          espId,
          subzones: new Map(),
          sensors: new Map(),
          actuators: new Map(),
          status: 'offline',
          lastHeartbeat: null,
          ...existingDevice,
          ...deviceData,
        }

        if (espDevices) {
          espDevices.set(espId, updatedDevice)
        }
        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to update ESP device:', error)
      }
    },

    async setEspBoardType(espId, boardType) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices.get(espId)
        if (device) {
          device.board_type = boardType
          device.boardType = boardType // Backward compatibility
          await this.updateEspDevice(espId, device)
        }
      } catch (error) {
        console.error('Failed to set ESP board type:', error)
      }
    },

    // ✅ EVENT-BASED: Board-spezifische Pin-Validierung
    // Prüft, ob ein Pin für einen bestimmten Gerätetyp auf dem Board verfügbar ist
    async isPinValidForBoard(espId, pin, type) {
      try {
        const device = await this.getEspDeviceAsync(espId)
        if (!device) return false

        const boardType = device.board_type || device.boardType || 'ESP32_DEVKIT'
        const config = this.boardPinConfigs[boardType]
        if (!config) return false

        // I2C-Sensoren benötigen spezielle Pins (SDA)
        if (type === 'SENSOR_CUSTOM_PI_ENHANCED') {
          return pin === config.i2c.sda
        }

        // Reservierte Pins sind nicht verfügbar (Boot, UART, SPI, etc.)
        if (config.reserved.includes(pin)) return false

        // Aktuatoren können nicht auf Input-Only Pins (ADC Pins)
        if (type.startsWith('ACTUATOR_') && config.inputOnly.includes(pin)) return false

        // Pin muss in der verfügbaren Pin-Liste sein
        return config.availablePins.includes(pin)
      } catch (error) {
        console.error('Failed to validate pin for board:', error)
        return false
      }
    },

    // ⚡ NEU: I2C-Address-Collision-Detection mit Real-time Registry
    async isI2CAddressAvailable(espId, i2cAddress) {
      try {
        const device = await this.getEspDeviceAsync(espId)
        if (!device) return false

        // ⚡ I2C-ADDRESS-REGISTRY: Real-time Collision-Detection
        const usedI2CAddresses = new Set()

        // Sammle alle verwendeten I2C-Adressen von diesem ESP
        device.subzones.forEach((subzone) => {
          subzone.sensors.forEach((sensor) => {
            if (sensor.i2c_address && sensor.type === 'SENSOR_CUSTOM_PI_ENHANCED') {
              usedI2CAddresses.add(sensor.i2c_address)
            }
          })
        })

        // ⚡ 8-SENSOR-LIMIT-CHECK: Hardware-Limit Enforcement
        if (usedI2CAddresses.size >= 8 && !usedI2CAddresses.has(i2cAddress)) {
          console.warn(`[I2C] ESP ${espId} hat bereits 8 I2C-Sensoren - Limit erreicht`)
          return false
        }

        // ⚡ ADDRESS-COLLISION-CHECK: Duplicate Address Detection
        if (usedI2CAddresses.has(i2cAddress)) {
          console.warn(
            `[I2C] Address collision detected: ${i2cAddress} already in use on ESP ${espId}`,
          )
          return false
        }

        return true
      } catch (error) {
        console.error('Failed to check I2C address availability:', error)
        return false
      }
    },

    // ⚡ NEU: I2C-Address-Auto-Assignment für neue Sensoren
    async getNextAvailableI2CAddress(espId) {
      try {
        const device = await this.getEspDeviceAsync(espId)
        if (!device) return null

        const usedAddresses = new Set()

        // Sammle alle verwendeten I2C-Adressen
        device.subzones.forEach((subzone) => {
          subzone.sensors.forEach((sensor) => {
            if (sensor.i2c_address && sensor.type === 'SENSOR_CUSTOM_PI_ENHANCED') {
              usedAddresses.add(sensor.i2c_address)
            }
          })
        })

        // ⚡ AUTO-ASSIGNMENT: Finde nächste freie Adresse (0x08-0x77)
        for (let addr = 0x08; addr <= 0x77; addr++) {
          if (!usedAddresses.has(addr)) {
            return addr
          }
        }

        return null // Keine freie Adresse verfügbar
      } catch (error) {
        console.error('Failed to get next available I2C address:', error)
        return null
      }
    },

    // ⚡ NEU: I2C-Bus-Scan-Integration für Hardware-Detection
    async scanI2CDevices(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // ⚡ HARDWARE-SCAN: I2C-Bus-Scan über MQTT
        await mqttStore.sendI2CScanCommand(espId)

        console.log(`[I2C] Scanning I2C devices on ESP ${espId}`)
        return true
      } catch (error) {
        console.error(`[I2C] Failed to scan I2C devices on ESP ${espId}:`, error)
        return false
      }
    },

    // ⚡ NEU: I2C-Sensor-Count für Limit-Enforcement
    async getI2CSensorCount(espId) {
      try {
        const device = await this.getEspDeviceAsync(espId)
        if (!device) return 0

        let i2cCount = 0
        device.subzones.forEach((subzone) => {
          subzone.sensors.forEach((sensor) => {
            if (sensor.type === 'SENSOR_CUSTOM_PI_ENHANCED') {
              i2cCount++
            }
          })
        })

        return i2cCount
      } catch (error) {
        console.error('Failed to get I2C sensor count:', error)
        return 0
      }
    },

    // ✅ NEU: Erweiterte GPIO-Konflikt-Behandlung für Server-Integration
    async handleGpioConflict(espId, gpio, conflictInfo) {
      // ✅ KONSISTENT: Verwende bestehende Pin-Validierung
      const conflictReason = this.getPinConflictReason(espId, gpio, conflictInfo.type)

      if (conflictReason !== 'OK') {
        // ✅ KONSISTENT: UI-Benachrichtigung
        window.$snackbar?.showWarning(`GPIO ${gpio} Konflikt: ${conflictReason}`, { timeout: 8000 })

        // ✅ KONSISTENT: State-Update
        this.$patch((state) => {
          if (!state.gpioConflicts) state.gpioConflicts = new Map()
          state.gpioConflicts.set(`${espId}-${gpio}`, {
            espId,
            gpio,
            reason: conflictReason,
            type: conflictInfo.type,
            timestamp: Date.now(),
          })
        })

        return false
      }

      return true
    },

    // ✅ EVENT-BASED: Server-spezifische GPIO-Konflikt-Auflösung
    async resolveGpioConflict(espId, gpio, action = 'release') {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // ✅ KONSISTENT: Verwende bestehende System-Command-Struktur
        await mqttStore.sendSystemCommand(espId, 'resolve_gpio_conflict', {
          gpio,
          action,
          timestamp: Date.now(),
        })

        // ✅ KONSISTENT: State-Cleanup
        this.$patch((state) => {
          if (state.gpioConflicts) {
            state.gpioConflicts.delete(`${espId}-${gpio}`)
          }
        })

        console.log(`[ESP] GPIO conflict resolved: ${espId}:${gpio} (${action})`)
        return true
      } catch (error) {
        console.error(`[ESP] Failed to resolve GPIO conflict: ${error.message}`)
        return false
      }
    },

    // ✅ EVENT-BASED: Pin-Konflikt-Prüfung
    async getPinConflictReason(espId, pin, type) {
      try {
        const device = await this.getEspDeviceAsync(espId)
        if (!device) return 'Device not found'

        const boardType = device.board_type || device.boardType || 'ESP32_DEVKIT'
        const config = this.boardPinConfigs[boardType]
        if (!config) return 'Board type not supported'

        // I2C-Sensoren benötigen spezielle Pins
        if (type === 'SENSOR_CUSTOM_PI_ENHANCED' && pin !== config.i2c.sda) {
          return `I2C sensors require GPIO ${config.i2c.sda} (SDA)`
        }

        // Reservierte Pins
        if (config.reserved.includes(pin)) {
          return `GPIO ${pin} is reserved for system use`
        }

        // Input-Only Pins für Aktuatoren
        if (type.startsWith('ACTUATOR_') && config.inputOnly.includes(pin)) {
          return `GPIO ${pin} is input-only, cannot be used for actuators`
        }

        // Pin nicht verfügbar
        if (!config.availablePins.includes(pin)) {
          return `GPIO ${pin} is not available on ${config.name}`
        }

        return null // Kein Konflikt
      } catch (error) {
        console.error('Failed to get pin conflict reason:', error)
        return 'Error checking pin conflict'
      }
    },

    // ✅ BESTEHEND: Backend-Fallback-Validierung (für zukünftige Backend-Integration)
    validatePinForBackend(gpio, type) {
      // Einfache Validierung als Fallback-Schutz
      if (gpio < 0 || gpio > 40) {
        return { valid: false, reason: `GPIO ${gpio} is out of valid range (0-40)` }
      }

      // I2C-Sensoren nur auf bekannten I2C-Pins
      if (type === 'SENSOR_CUSTOM_PI_ENHANCED') {
        const validI2CPins = [21, 5] // DevKit SDA, XIAO SDA
        if (!validI2CPins.includes(gpio)) {
          return { valid: false, reason: `I2C sensors require GPIO 21 (DevKit) or GPIO 5 (XIAO)` }
        }
      }

      // Gefährliche Pins vermeiden
      const dangerousPins = [0, 1, 2, 3, 6, 7, 8, 9, 10, 11] // Boot, UART, SPI
      if (dangerousPins.includes(gpio)) {
        return { valid: false, reason: `GPIO ${gpio} is reserved for system use` }
      }

      return { valid: true, reason: null }
    },

    // ✅ ENTFERNT: selectEsp-Action wird jetzt zentral in centralConfig verwaltet
    // selectEsp(espId) {
    //   this.selectedEspId = espId
    //   this.error = null
    // },

    async configureZone(espId, kaiserZone, masterZone) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        if (!mqttStore?.isConnected) {
          throw new Error('MQTT nicht verbunden')
        }

        this.loading = true
        this.error = null

        const topic = `kaiser/${mqttStore.kaiserId}/esp/${espId}/zone/config`
        const config = {
          esp_id: espId,
          kaiser_zone: kaiserZone,
          master_zone: masterZone,
        }

        await mqttStore.publish(topic, config)

        // Update local data
        const device = await this.getEspDeviceAsync(espId)
        if (device) {
          device.kaiserZone = kaiserZone
          device.masterZone = masterZone
          device.lastUpdate = Date.now()
          await this.updateEspDevice(espId, device)
        }

        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to configure zone:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async configureSubzones(espId, subzones) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        if (!mqttStore?.isConnected) {
          throw new Error('MQTT nicht verbunden')
        }

        this.loading = true
        this.error = null

        const topic = `kaiser/${mqttStore.kaiserId}/esp/${espId}/subzone/config`
        const config = {
          esp_id: espId,
          subzones: subzones,
        }

        await mqttStore.publish(topic, config)

        // Update local data
        const device = await this.getEspDeviceAsync(espId)
        if (device) {
          const subzonesMap = new Map()
          subzones.forEach((subzone) => {
            // ✅ ERWEITERT: Cross-ESP-Metadaten hinzufügen
            const enhancedSubzone = {
              ...subzone,
              sensors: new Map(),
              actuators: new Map(),
              // ✅ NEU: Cross-ESP-Metadaten
              crossEspMetadata: {
                involvedInCrossEspLogics: false,
                crossEspLogicIds: [],
                lastCrossEspActivity: null,
              },
              // ✅ NEU: Hierarchie-Metadaten
              hierarchy: {
                parentZone: this.getZoneForEsp(espId),
                siblingSubzones: [],
                childDevices: [],
              },
              metadata: {
                createdAt: subzone.metadata?.createdAt || Date.now(),
                lastModified: Date.now(),
                createdBy: subzone.metadata?.createdBy || 'user',
              },
            }
            subzonesMap.set(subzone.id, enhancedSubzone)
          })
          device.subzones = subzonesMap
          device.lastUpdate = Date.now()
          await this.updateEspDevice(espId, device)

          // ✅ NEU: Cross-Subzone-Index aktualisieren
          subzones.forEach((subzone) => this.updateCrossSubzoneIndex(subzone, espId))
        }

        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to configure subzones:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // ✅ NEU: Subzone-Management-Methoden
    async createSubzone(espId, subzoneConfig) {
      const { id, name, description, gpioRange, deviceTypes } = subzoneConfig

      // Validierung
      if (!this.isPinRangeAvailable(espId, gpioRange)) {
        throw new Error(`GPIO-Range ${gpioRange.start}-${gpioRange.end} nicht verfügbar`)
      }

      const subzone = {
        id,
        name,
        description,
        espId,
        zone: this.getZoneForEsp(espId),
        kaiserId: this.getKaiserId(),
        gpioRange,
        assignedPins: [],
        deviceTypes,
        crossEspMetadata: {
          involvedInCrossEspLogics: false,
          crossEspLogicIds: [],
          lastCrossEspActivity: null,
        },
        hierarchy: {
          parentZone: this.getZoneForEsp(espId),
          siblingSubzones: [],
          childDevices: [],
        },
        metadata: {
          createdAt: Date.now(),
          lastModified: Date.now(),
          createdBy: 'user',
        },
      }

      // Subzone erstellen
      await this.configureSubzones(espId, [subzone])

      // Cross-Subzone-Index aktualisieren
      this.updateCrossSubzoneIndex(subzone, espId)

      // Event auslösen
      eventBus.emit(MQTT_EVENTS.SUBZONE_CREATED, { espId, subzone })

      return subzone
    },

    async assignPinToSubzone(espId, gpio, subzoneId, deviceConfig) {
      // Pin einer Subzone zuordnen
      const subzone = await this.getSubzoneAsync(espId, subzoneId)
      if (!subzone) {
        throw new Error(`Subzone ${subzoneId} nicht gefunden`)
      }

      // Pin-Konfiguration
      const pinAssignment = {
        gpio,
        type: deviceConfig.type,
        name: deviceConfig.name,
        subzone: subzoneId,
        category: deviceConfig.type.startsWith('SENSOR_') ? 'sensor' : 'actuator',
      }

      // Pin zuordnen
      await this.configurePinAssignment(espId, pinAssignment)

      // Subzone-Metadaten aktualisieren
      subzone.assignedPins.push(gpio)
      subzone.hierarchy.childDevices.push(deviceConfig.name)

      // Pin-Subzone-Mapping aktualisieren
      if (!this.pinSubzoneMapping.has(espId)) {
        this.pinSubzoneMapping.set(espId, new Map())
      }
      this.pinSubzoneMapping.get(espId).set(gpio, {
        subzoneId,
        deviceType: deviceConfig.type,
      })

      // Cross-Subzone-Index aktualisieren
      this.updateCrossSubzoneIndex(subzone, espId)

      // Event auslösen
      eventBus.emit(MQTT_EVENTS.PIN_SUBZONE_ASSIGNED, { espId, gpio, subzoneId, deviceConfig })
    },

    getCrossEspSubzones(zoneNames = []) {
      // Subzones über mehrere ESPs in bestimmten Zonen
      const zones =
        zoneNames.length > 0 ? zoneNames : Array.from(this.crossSubzoneIndex.byZone.keys())

      return zones.flatMap(
        (zone) =>
          this.crossSubzoneIndex.byZone.get(zone)?.map((subzoneInfo) => ({
            subzoneId: subzoneInfo.subzoneId,
            zone,
            ...subzoneInfo,
          })) || [],
      )
    },

    // ✅ OPTIMIERT: Cross-Subzone-Index mit Smart-Batching für CPU-Performance
    updateCrossSubzoneIndex(subzone, espId) {
      // ⚡ ENHANCED: Eventually-Consistent Cross-ESP-Index mit Conflict-Resolution
      if (!this.crossEspSubzoneIndex) {
        this.crossEspSubzoneIndex = new Map()
      }

      const zoneKey = subzone.zone || 'default'
      const subzoneKey = `${espId}-${subzone.id}`
      const timestamp = Date.now()

      // ⚡ TIMESTAMP-BASED CONFLICT-RESOLUTION: Last-Writer-Wins Semantik
      const existingEntry = this.crossEspSubzoneIndex.get(subzoneKey)
      if (existingEntry && existingEntry.timestamp > timestamp) {
        console.warn(
          `[Cross-ESP] Ignoring older update for ${subzoneKey} (existing: ${existingEntry.timestamp}, new: ${timestamp})`,
        )
        return // Ignoriere ältere Updates
      }

      // ⚡ ATOMIC UPDATE: Cross-ESP-Index mit Metadata
      this.crossEspSubzoneIndex.set(subzoneKey, {
        espId,
        subzoneId: subzone.id,
        zone: zoneKey,
        name: subzone.name,
        description: subzone.description,
        timestamp,
        lastModified: timestamp,
        crossEspMetadata: {
          involvedInCrossEspLogics: subzone.crossEspMetadata?.involvedInCrossEspLogics || false,
          crossEspLogicIds: subzone.crossEspMetadata?.crossEspLogicIds || [],
          lastCrossEspActivity: subzone.crossEspMetadata?.lastCrossEspActivity || null,
        },
        hierarchy: {
          parentZone: subzone.hierarchy?.parentZone || zoneKey,
          siblingSubzones: subzone.hierarchy?.siblingSubzones || [],
          childDevices: subzone.hierarchy?.childDevices || [],
        },
        consistency: {
          version: 1,
          checksum: this.generateSubzoneChecksum(subzone),
          lastSync: timestamp,
        },
      })

      // ⚡ OPTIMIERT: Event-Drivern Consistency mit Batching für CPU-Performance
      // Statt sofortiger Event-Emission → Batched Event-Emission
      this.scheduleCrossEspIndexEvent({
        espId,
        subzoneId: subzone.id,
        zone: zoneKey,
        timestamp,
        action: existingEntry ? 'updated' : 'created',
      })

      console.log(`[Cross-ESP] Index updated: ${subzoneKey} (${zoneKey})`)
    },

    // ✅ NEU: Smart-Batching für Cross-ESP-Index-Events (NON-CRITICAL)
    scheduleCrossEspIndexEvent(eventData) {
      // Initialisiere Batch-Queue falls nicht vorhanden
      if (!this.crossEspIndexEventBatch) {
        this.crossEspIndexEventBatch = []
        this.crossEspIndexEventTimer = null
      }

      // Füge Event zur Batch-Queue hinzu
      this.crossEspIndexEventBatch.push(eventData)

      // Starte Timer für Batched-Emission (100ms Delay für CPU-Optimierung)
      if (!this.crossEspIndexEventTimer) {
        this.crossEspIndexEventTimer = setTimeout(() => {
          this.emitBatchedCrossEspIndexEvents()
        }, 100) // 100ms Batch-Delay für CPU-Optimierung
      }
    },

    // ✅ NEU: Batched Event-Emission für Cross-ESP-Index (NON-CRITICAL)
    emitBatchedCrossEspIndexEvents() {
      if (!this.crossEspIndexEventBatch || this.crossEspIndexEventBatch.length === 0) {
        return
      }

      // Batch alle Events in einem einzigen Event-Emission
      const batchedEvents = [...this.crossEspIndexEventBatch]
      this.crossEspIndexEventBatch = []
      this.crossEspIndexEventTimer = null

      // Emit batched events für CPU-Optimierung
      eventBus.emit(MQTT_EVENTS.CROSS_ESP_INDEX_BATCH_UPDATED, {
        events: batchedEvents,
        batchSize: batchedEvents.length,
        timestamp: Date.now(),
      })

      console.log(`[Cross-ESP] Batched ${batchedEvents.length} index events for CPU optimization`)
    },

    // ⚡ NEU: Subzone-Checksum für Consistency-Validation
    generateSubzoneChecksum(subzone) {
      const data = JSON.stringify({
        id: subzone.id,
        name: subzone.name,
        description: subzone.description,
        assignedPins: subzone.assignedPins || [],
        deviceTypes: subzone.deviceTypes || [],
        crossEspMetadata: subzone.crossEspMetadata || {},
        hierarchy: subzone.hierarchy || {},
      })

      // Einfache Hash-Funktion für Checksum
      let hash = 0
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32-bit integer
      }

      return hash.toString(16)
    },

    // ⚡ NEU: Subzone-State-Synchronisation über MQTT
    async syncSubzoneState(espId, subzoneId, stateData) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // ⚡ INCREMENTAL STATE-UPDATE: Nur geänderte Felder synchronisieren
        const topic = `kaiser/${mqttStore.getKaiserId}/esp/${espId}/subzone/sync`
        const syncPayload = {
          esp_id: espId,
          subzone_id: subzoneId,
          state: stateData,
          timestamp: Date.now(),
          checksum: this.generateSubzoneChecksum(stateData),
          sync_type: 'incremental',
        }

        await mqttStore.publish(topic, syncPayload)
        console.log(`[Subzone-Sync] State synchronized for ${espId}:${subzoneId}`)

        return true
      } catch (error) {
        console.error(`[Subzone-Sync] Failed to sync state for ${espId}:${subzoneId}:`, error)
        return false
      }
    },

    // ⚡ NEU: Merge-Conflict-Resolution für Subzone-States
    resolveSubzoneStateConflict(localState, remoteState) {
      const timestamp = Date.now()

      // ⚡ MERGE-STRATEGY: Timestamp-basierte Conflict-Resolution
      const mergedState = { ...localState }

      // Priorisiere neuere Änderungen
      Object.keys(remoteState).forEach((key) => {
        if (key === 'timestamp' || key === 'checksum') return // Skip metadata

        const localValue = localState[key]
        const remoteValue = remoteState[key]

        if (remoteValue && (!localValue || remoteState.timestamp > localState.timestamp)) {
          mergedState[key] = remoteValue
        }
      })

      // ⚡ CONFLICT-LOGGING: Track resolved conflicts
      const conflicts = []
      Object.keys(remoteState).forEach((key) => {
        if (key === 'timestamp' || key === 'checksum') return

        if (
          localState[key] &&
          remoteState[key] &&
          JSON.stringify(localState[key]) !== JSON.stringify(remoteState[key])
        ) {
          conflicts.push({
            field: key,
            localValue: localState[key],
            remoteValue: remoteState[key],
            resolution: 'timestamp_based',
            resolvedValue: mergedState[key],
          })
        }
      })

      if (conflicts.length > 0) {
        console.warn(`[Subzone-Conflict] Resolved ${conflicts.length} conflicts:`, conflicts)
      }

      // Update metadata
      mergedState.timestamp = timestamp
      mergedState.checksum = this.generateSubzoneChecksum(mergedState)
      mergedState.lastMerge = timestamp
      mergedState.conflictsResolved = conflicts.length

      return mergedState
    },

    // ✅ NEU: Hilfsmethoden
    getSubzone(espId, subzoneId) {
      const device = this.getEspDevice(espId)
      return device?.subzones?.get(subzoneId)
    },

    getZoneForEsp(espId) {
      const centralConfig = useCentralConfigStore()
      return centralConfig.getZoneForEsp(espId)
    },

    getKaiserId() {
      const centralConfig = useCentralConfigStore()
      return centralConfig.kaiserId
    },

    isPinRangeAvailable(espId, gpioRange) {
      const availablePins = this.getAvailablePinsForEsp(espId)
      const usedPins = this.getUsedPinsForEsp(espId)

      for (let pin = gpioRange.start; pin <= gpioRange.end; pin++) {
        if (!availablePins.includes(pin) || usedPins.includes(pin)) {
          return false
        }
      }
      return true
    },

    getUsedPinsForEsp(espId) {
      const device = this.getEspDevice(espId)
      if (!device) return []

      const usedPins = []
      device.subzones?.forEach((subzone) => {
        subzone.sensors?.forEach((sensor) => usedPins.push(sensor.gpio))
        subzone.actuators?.forEach((actuator) => usedPins.push(actuator.gpio))
      })
      return usedPins
    },

    getAllSubzones() {
      const allSubzones = []
      const devices = this.getEspDevices()

      devices.forEach((device, espId) => {
        device.subzones?.forEach((subzone, subzoneId) => {
          allSubzones.push({
            espId,
            subzoneId,
            ...subzone,
          })
        })
      })

      return allSubzones
    },

    async configurePinAssignment(espId, pinAssignment) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // ⚡ ENHANCED CONNECTION VALIDATION: Robuste State-Check mit Retry-Logic
        if (!mqttStore?.isConnected) {
          // Exponential Backoff Retry für Connection-Issues
          const maxRetries = 3
          const baseDelay = 1000

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.warn(
              `[ESP-Management] MQTT Connection attempt ${attempt}/${maxRetries} for ESP ${espId}`,
            )

            try {
              // Kurze Connection-Check mit Timeout
              await this.withTimeout(mqttStore.connect(), 2000)

              if (mqttStore.isConnected) {
                console.log(`[ESP-Management] MQTT Connection restored on attempt ${attempt}`)
                break
              }
            } catch (error) {
              console.warn(`[ESP-Management] Connection attempt ${attempt} failed:`, error.message)

              if (attempt === maxRetries) {
                throw new Error(`MQTT nicht verbunden nach ${maxRetries} Versuchen`)
              }

              // Exponential Backoff
              const delay = baseDelay * Math.pow(2, attempt - 1)
              await new Promise((resolve) => setTimeout(resolve, delay))
            }
          }
        }

        this.loading = true
        this.error = null

        const { gpio, type, name, subzone, category } = pinAssignment

        // ⚡ ATOMIC OPERATION: Pin-Assignment mit State-Protection
        const device = mqttStore.espDevices?.get(espId)
        if (!device) {
          throw new Error(`ESP ${espId} nicht gefunden`)
        }

        // ⚡ I2C-8-SENSOR-LIMIT-ENFORCEMENT: Real-time Validation
        if (category === 'sensor' && type === 'SENSOR_CUSTOM_PI_ENHANCED') {
          const currentI2CSensors = this.getI2CSensorCount(espId)

          if (currentI2CSensors >= 8) {
            const errorMsg = `ESP ${espId} hat bereits 8 I2C-Sensoren - Hardware-Limit erreicht`
            console.warn(`[I2C-LIMIT] ${errorMsg}`)
            window.$snackbar?.showError(errorMsg)
            throw new Error(errorMsg)
          }

          // ⚡ I2C-ADDRESS-VALIDATION: Collision-Detection
          if (pinAssignment.i2c_address) {
            if (!this.isI2CAddressAvailable(espId, pinAssignment.i2c_address)) {
              const nextAddress = this.getNextAvailableI2CAddress(espId)
              const suggestion = nextAddress
                ? ` (Vorschlag: 0x${nextAddress.toString(16).toUpperCase()})`
                : ''
              const errorMsg = `I2C-Adresse ${pinAssignment.i2c_address} bereits in Verwendung auf ESP ${espId}${suggestion}`
              console.warn(`[I2C-COLLISION] ${errorMsg}`)
              window.$snackbar?.showError(errorMsg)
              throw new Error(errorMsg)
            }
          }
        }

        if (category === 'sensor') {
          await mqttStore.configurePiSensor(espId, gpio, type, name, subzone)
        } else {
          await mqttStore.configureActuator(espId, gpio, type, name, subzone)
        }

        // Update local data
        if (device) {
          const subzoneObj = device.subzones.get(subzone)
          if (subzoneObj) {
            if (category === 'sensor') {
              subzoneObj.sensors.set(gpio, { gpio, type, name })
            } else {
              subzoneObj.actuators.set(gpio, { gpio, type, name })
            }
            this.updateEspDevice(espId, device)
          }
        }

        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to configure pin assignment:', error)
        this.error = error.message

        // ⚡ GRACEFUL DEGRADATION: User-Feedback bei Connection-Problemen
        if (error.message.includes('MQTT nicht verbunden')) {
          window.$snackbar?.showError(
            'Verbindungsproblem - Pin-Konfiguration wird bei Wiederherstellung der Verbindung gespeichert',
          )
        }

        throw error
      } finally {
        this.loading = false
      }
    },

    async removePinAssignment(espId, gpio, reason = 'manual') {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        if (!mqttStore?.isConnected) {
          throw new Error('MQTT nicht verbunden')
        }

        this.loading = true
        this.error = null

        await mqttStore.sendSystemCommand(espId, 'remove_device', {
          gpio,
          reason,
        })

        // Remove from local data
        const device = mqttStore.espDevices?.get(espId)
        if (device) {
          device.subzones.forEach((subzone) => {
            subzone.sensors.delete(gpio)
            subzone.actuators.delete(gpio)
          })
          this.updateEspDevice(espId, device)
        }

        this.lastUpdate = Date.now()
      } catch (error) {
        console.error('Failed to remove pin assignment:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // ✅ ENTFERNT: Persistierung wird jetzt zentral über MQTT Store verwaltet
    // persistEspDevices() {
    //   const devicesData = {}
    //   this.espDevices.forEach((device, espId) => {
    //     devicesData[espId] = {
    //       ...device,
    //       subzones: Array.from(device.subzones.entries()),
    //       sensors: Array.from(device.sensors.entries()),
    //       actuators: Array.from(device.actuators.entries()),
    //     }
    //   })
    //   storage.save('esp_devices', devicesData)
    // },

    // restoreEspDevices() {
    //   const devicesData = storage.load('esp_devices', {})
    //   Object.entries(devicesData).forEach(([espId, device]) => {
    //     // Convert arrays back to Maps
    //     device.subzones = new Map(device.subzones || [])
    //     device.sensors = new Map(device.sensors || [])
    //     device.actuators = new Map(device.actuators || [])
    //     this.espDevices.set(espId, device)
    //   })
    // },

    clearError() {
      this.error = null
    },

    // 🆕 NEU: Pending Assignments Management
    addPendingPinAssignment(espId, assignment, source = 'manual') {
      if (!this.pendingPinAssignments.has(espId)) {
        this.pendingPinAssignments.set(espId, [])
      }

      assignment.pendingId = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      assignment.timestamp = Date.now()
      assignment.source = source // 'manual' oder 'template'
      assignment.templateId = assignment.templateId || null

      this.pendingPinAssignments.get(espId).push(assignment)
      this.updatePendingCount()
      console.log(`Added pending assignment for ESP ${espId}:`, assignment)
    },

    removePendingAssignment(espId, pendingId) {
      const pending = this.pendingPinAssignments.get(espId)
      if (pending) {
        const index = pending.findIndex((assignment) => assignment.pendingId === pendingId)
        if (index !== -1) {
          pending.splice(index, 1)
          this.updatePendingCount()
          console.log(`Removed pending assignment ${pendingId} for ESP ${espId}`)
        }
      }
    },

    clearPendingAssignments(espId) {
      if (espId) {
        this.pendingPinAssignments.delete(espId)
      } else {
        this.pendingPinAssignments.clear()
      }
      this.updatePendingCount()
      console.log(`Cleared pending assignments for ESP ${espId || 'all'}`)
    },

    updatePendingCount() {
      let total = 0
      this.pendingPinAssignments.forEach((assignments) => {
        total += assignments.length
      })
      this.pendingChangesCount = total
    },

    // ✅ BUS-COMPLIANT: Backup & Restore für Rollback
    async exportPinConfig(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (!device) return null

        // Deep clone für sicheres Backup
        return JSON.parse(
          JSON.stringify({
            espId: device.espId,
            subzones: Array.from(device.subzones.entries()),
            sensors: Array.from(device.sensors.entries()),
            actuators: Array.from(device.actuators.entries()),
            kaiserZone: device.kaiserZone,
            masterZone: device.masterZone,
            boardType: device.boardType,
            status: device.status,
            lastUpdate: device.lastUpdate,
          }),
        )
      } catch (error) {
        console.error(`Failed to export pin config for ESP ${espId}:`, error)
      }
    },

    async restorePinConfig(espId, backup) {
      if (!backup) return false

      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const espDevices = mqttStore.espDevices
        const device = {
          espId: backup.espId,
          subzones: new Map(backup.subzones || []),
          sensors: new Map(backup.sensors || []),
          actuators: new Map(backup.actuators || []),
          kaiserZone: backup.kaiserZone,
          masterZone: backup.masterZone,
          boardType: backup.boardType,
          status: backup.status,
          lastUpdate: backup.lastUpdate,
        }

        if (espDevices) {
          espDevices.set(espId, device)
        }
        console.log(`Restored pin config for ESP ${espId}`)
        return true
      } catch (error) {
        console.error(`Failed to restore pin config for ESP ${espId}:`, error)
        return false
      }
    },

    // 🆕 NEU: Apply Pending Changes mit Rollback
    async applyPendingChanges(espId) {
      const pending = this.pendingPinAssignments.get(espId)
      if (!pending || pending.length === 0) {
        console.log(`No pending changes for ESP ${espId}`)
        return { success: true, applied: 0 }
      }

      // Backup erstellen
      const backup = this.exportPinConfig(espId)
      if (!backup) {
        throw new Error(`Failed to create backup for ESP ${espId}`)
      }

      this.loading = true
      this.error = null

      try {
        let appliedCount = 0
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // Prüfe MQTT-Verbindung
        if (!mqttStore?.isConnected) {
          throw new Error('MQTT nicht verbunden - Änderungen können nicht angewendet werden')
        }

        // Apply alle pending assignments
        for (const assignment of pending) {
          try {
            console.log(`Applying pending assignment for ESP ${espId}:`, assignment)

            const { gpio, type, name, subzone, category, i2cAddress, sensorHint } = assignment

            if (category === 'sensor') {
              if (type === 'SENSOR_CUSTOM_PI_ENHANCED') {
                // I2C-Sensor spezielle Behandlung
                const i2cConfig = {
                  gpio,
                  i2c_address: i2cAddress,
                  sensor_hint: sensorHint,
                  subzone_id: subzone,
                  sensor_name: name,
                }
                await mqttStore.sendI2CConfiguration(espId, i2cConfig)
              } else {
                await mqttStore.configurePiSensor(espId, gpio, type, name, subzone)
              }
            } else {
              await mqttStore.configureActuator(espId, gpio, type, name, subzone)
            }

            // Update local data
            const device = mqttStore.espDevices?.get(espId)
            if (device) {
              const subzoneObj = device.subzones.get(subzone)
              if (subzoneObj) {
                if (category === 'sensor') {
                  subzoneObj.sensors.set(gpio, { gpio, type, name })
                } else {
                  subzoneObj.actuators.set(gpio, { gpio, type, name })
                }
                this.updateEspDevice(espId, device)
              }
            }

            appliedCount++
            console.log(`Successfully applied assignment ${appliedCount}/${pending.length}`)
          } catch (error) {
            console.error(
              `Failed to apply assignment ${appliedCount + 1}/${pending.length}:`,
              error,
            )
            throw error // Stoppe bei erstem Fehler
          }
        }

        // Erfolgreich - Cleanup (Persistierung wird zentral über MQTT Store verwaltet)
        this.clearPendingAssignments(espId)
        this.lastUpdate = Date.now()

        console.log(`Successfully applied ${appliedCount} pending changes for ESP ${espId}`)
        window.$snackbar?.showSuccess(`${appliedCount} Änderungen erfolgreich angewendet`)

        return { success: true, applied: appliedCount }
      } catch (error) {
        console.error(`Failed to apply pending changes for ESP ${espId}:`, error)

        // Rollback durchführen
        if (backup) {
          const rollbackSuccess = this.restorePinConfig(espId, backup)
          if (rollbackSuccess) {
            console.log(`Rollback successful for ESP ${espId}`)
            window.$snackbar?.showError(
              `Konfiguration fehlgeschlagen. Alte Konfiguration wiederhergestellt.`,
            )
          } else {
            console.error(`Rollback failed for ESP ${espId}`)
            window.$snackbar?.showError(`Konfiguration fehlgeschlagen. Rollback fehlgeschlagen.`)
          }
        }

        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // ✅ NEU: Sichere Anwendung mit Subzonen-Validierung
    async applyPendingChangesSafe(espId) {
      const pending = this.pendingPinAssignments.get(espId)
      if (!pending || pending.length === 0) {
        console.log(`No pending changes for ESP ${espId}`)
        return { success: true, applied: 0 }
      }

      // Backup erstellen
      const backup = this.exportPinConfig(espId)
      if (!backup) {
        throw new Error(`Failed to create backup for ESP ${espId}`)
      }

      this.loading = true
      this.error = null

      try {
        // ✅ NEU: Prüfe neue Subzonen und konfiguriere sie vorab
        const newSubzones = this.getPendingSubzonesNotInStore(espId)
        if (newSubzones.length > 0) {
          console.log(`Configuring ${newSubzones.length} new subzones before applying changes`)
          await this.configureSubzones(espId, newSubzones)

          // Kurze Pause für ESP-Verarbeitung
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        // ✅ NEU: Prüfe I2C-Sensor-Limit (max. 8 pro ESP)
        const i2cSensors = pending.filter((p) => p.type === 'SENSOR_CUSTOM_PI_ENHANCED')
        if (i2cSensors.length > 8) {
          throw new Error(
            `Maximal 8 I2C-Sensoren pro ESP erlaubt. ${i2cSensors.length} konfiguriert.`,
          )
        }

        // Normale applyPendingChanges fortsetzen
        return await this.applyPendingChanges(espId)
      } catch (error) {
        console.error(`Failed to apply pending changes safely for ESP ${espId}:`, error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // ✅ NEU: Ermittle Subzonen, die noch nicht im Store existieren
    async getPendingSubzonesNotInStore(espId) {
      const pending = this.pendingPinAssignments.get(espId)
      if (!pending) return []

      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        const existingSubzoneIds = device ? Array.from(device.subzones.keys()) : []

        const newSubzoneIds = new Set()
        pending.forEach((assignment) => {
          if (!existingSubzoneIds.includes(assignment.subzone)) {
            newSubzoneIds.add(assignment.subzone)
          }
        })

        // Erstelle Subzone-Objekte für neue Subzonen
        return Array.from(newSubzoneIds).map((subzoneId) => ({
          id: subzoneId,
          name: this.generateSubzoneName(subzoneId),
          description: `Auto-generated subzone for ${subzoneId}`,
        }))
      } catch (error) {
        console.error(`Failed to get pending subzones for ESP ${espId}:`, error)
        return []
      }
    },

    // ✅ NEU: Generiere Subzone-Namen aus ID
    generateSubzoneName(subzoneId) {
      // Konvertiere snake_case zu Title Case
      return subzoneId
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    },

    // ✅ NEU: Prüfe Subzone-Status für TreeView
    async getSubzoneStatus(espId, subzoneId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (!device) return 'unknown'

        const subzone = device.subzones.get(subzoneId)
        if (!subzone) return 'unknown'

        // Prüfe ob Subzone in pending assignments verwendet wird
        const pending = this.pendingPinAssignments.get(espId)
        if (pending && pending.some((p) => p.subzone === subzoneId)) {
          return 'pending'
        }

        return 'active'
      } catch (error) {
        console.error(`Failed to get subzone status for ESP ${espId}:${subzoneId}:`, error)
        return 'unknown'
      }
    },

    // ✅ NEU: Prüfe Sensor-Status für TreeView
    getSensorStatus(espId, gpio) {
      const pending = this.pendingPinAssignments.get(espId)
      if (pending && pending.some((p) => p.gpio === gpio)) {
        return 'pending'
      }
      return 'active'
    },

    // 🆕 NEU: Timeout-Wrapper für MQTT-Operationen
    async withTimeout(promise, timeoutMs = 5000) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      })

      return Promise.race([promise, timeoutPromise])
    },

    // ✅ NEU: Restore-Methode für Konsistenz mit main.js
    restorePinAssignments() {
      // Load any persistent pin assignments
      // Note: Storage functionality is currently commented out in this store
      console.log('ESP Management: restorePinAssignments called (no persistent data to restore)')
    },

    // ✅ NEU: Template-Undo-Funktionalität
    removePendingAssignmentsByTemplate(espId, templateId) {
      const list = this.pendingPinAssignments.get(espId)
      if (!list) return

      const filtered = list.filter((a) => a.templateId !== templateId)
      this.pendingPinAssignments.set(espId, filtered)
      this.updatePendingCount()
      console.log(`Removed pending assignments for template ${templateId} from ESP ${espId}`)
    },

    // ✅ NEU: Subzone CRUD-Funktionalität
    async renameSubzone(espId, subzoneId, newName) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (device?.subzones.has(subzoneId)) {
          device.subzones.get(subzoneId).name = newName
          console.log(`Renamed subzone ${subzoneId} to "${newName}" for ESP ${espId}`)
        }
      } catch (error) {
        console.error(`Failed to rename subzone ${subzoneId} for ESP ${espId}:`, error)
      }
    },

    async removeSubzone(espId, subzoneId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (device?.subzones.has(subzoneId)) {
          const subzone = device.subzones.get(subzoneId)

          // Prüfe, ob Subzone leer ist (keine Sensoren/Aktoren)
          const hasSensors = subzone.sensors && subzone.sensors.size > 0
          const hasActuators = subzone.actuators && subzone.actuators.size > 0

          if (!hasSensors && !hasActuators) {
            device.subzones.delete(subzoneId)
            console.log(`Removed empty subzone ${subzoneId} from ESP ${espId}`)
            return true
          } else {
            console.warn(`Cannot remove subzone ${subzoneId} - contains devices`)
            return false
          }
        }
        return false
      } catch (error) {
        console.error(`Failed to remove subzone ${subzoneId} for ESP ${espId}:`, error)
        return false
      }
    },

    // ✅ NEU: Sofortige Sensor-Synchronisation aus ACK
    async updateSensorsFromAck(espId, configuredSensors) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (!device) return

        configuredSensors.forEach((sensor) => {
          const subzone = device.subzones.get(sensor.subzone_id)
          if (subzone) {
            subzone.sensors.set(sensor.gpio, {
              gpio: sensor.gpio,
              type: sensor.type,
              name: sensor.name,
              subzoneId: sensor.subzone_id,
              lastUpdate: Date.now(),
            })
          }
        })

        device.lastUpdate = Date.now()
        this.updateEspDevice(espId, device)

        console.log(`✅ Sensors updated from ACK for ESP ${espId}:`, configuredSensors)
      } catch (error) {
        console.error(`Failed to update sensors from ACK for ESP ${espId}:`, error)
      }
    },

    // ✅ NEU: Sofortige Aktor-Synchronisation aus ACK
    async updateActuatorsFromAck(espId, configuredActuators) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (!device) return

        configuredActuators.forEach((actuator) => {
          const subzone = device.subzones.get(actuator.subzone_id)
          if (subzone) {
            subzone.actuators.set(actuator.gpio, {
              gpio: actuator.gpio,
              type: actuator.type,
              name: actuator.name,
              subzoneId: actuator.subzone_id,
              lastUpdate: Date.now(),
            })
          }
        })

        device.lastUpdate = Date.now()
        this.updateEspDevice(espId, device)

        console.log(`✅ Actuators updated from ACK for ESP ${espId}:`, configuredActuators)
      } catch (error) {
        console.error(`Failed to update actuators from ACK for ESP ${espId}:`, error)
      }
    },

    // 🆕 NEU: ESP-Funktionen aus mqtt.js verschoben

    // ✅ ERWEITERT: ESP Discovery Handler (migriert von MQTT Store)
    async handleNewEspDiscovery(espId, payload) {
      console.log(`[ESP Management] New ESP discovered: ${espId}`, payload)

      if (!espId) {
        console.warn('[ESP Management] Ignored discovery: missing esp_id')
        return
      }

      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // ESP-ID in Discovery-Liste speichern
        if (!this.discoveredEspIds) {
          this.discoveredEspIds = new Set()
        }
        this.discoveredEspIds.add(espId)

        // Setup-Mode Erkennung
        const isSetupMode = payload.setup_mode || payload.webserver_active || false
        const apSsid = payload.ap_ssid || `ESP_Setup_${espId.slice(-6)}`
        const apIp = payload.ap_ip || '192.168.4.1'

        // ✅ NEU: Default-Konfiguration anwenden
        const centralConfig = useCentralConfigStore()
        const defaultConfig = centralConfig.getDefaultEspConfig()

        // ESP automatisch dem God Pi zuordnen (nicht Kaiser!)
        // Note: centralDataHub functionality moved to event-based system

        // ESP-Device zur lokalen Verwaltung hinzufügen
        const deviceInfo = {
          espId,
          status: isSetupMode ? 'SETUP_MODE' : 'online',
          lastHeartbeat: Date.now(),
          board_type: payload.board_type || defaultConfig.boardType || 'ESP32_DEVKIT',
          boardType: payload.board_type || defaultConfig.boardType || 'ESP32_DEVKIT', // Backward compatibility
          firmware_version: payload.firmware_version || 'unknown',
          firmwareVersion: payload.firmware_version || 'unknown', // Backward compatibility
          setupMode: isSetupMode,
          owner: 'god_pi_central', // Wichtig: God Pi als Owner
          zone: defaultConfig.zone || '🕳️ Unkonfiguriert',
          espFriendlyName: defaultConfig.friendlyName || `ESP_${espId.slice(-6)}`,
          espUsername: defaultConfig.friendlyName || `ESP_${espId.slice(-6)}`,

          // ✅ NEU: Zusätzliche Felder aus MQTT Store
          systemState: isSetupMode ? 'WIFI_SETUP' : 'UNKNOWN',
          webserverActive: isSetupMode,
          connectionEstablished: false,
          safeMode: isSetupMode, // Setup-Mode = Safe Mode
          apSsid,
          apIp,

          // Optionale Felder aus Payload
          espZone: payload.esp_zone || payload.zone || '🕳️ Unkonfiguriert',

          // Hardware-Info
          chipModel: payload.chip_model || null,

          // Network info
          brokerIp: payload.broker_ip || payload.broker || null,
          brokerPort: payload.broker_port || payload.port || 1883,
          httpPort: payload.http_port || payload.http || 8443,
          server_address: payload.server_address || payload.server || null,
          serverAddress: payload.server_address || payload.server || null, // Backward compatibility

          lastUpdate: Date.now(),
        }

        if (mqttStore) {
          mqttStore.espDevices.set(espId, deviceInfo)
          mqttStore.deviceTimeouts.set(espId, Date.now())
        }

        // ✅ NEU: Default-Konfiguration anwenden
        centralConfig.applyDefaultConfigToNewDevice('esp', espId)

        // God-spezifische Topics abonnieren
        const godTopics = [
          `god_pi_central/esp/${espId}/status`,
          `god_pi_central/esp/${espId}/sensor/+`,
          `god_pi_central/esp/${espId}/actuator/+`,
          `god_pi_central/esp/${espId}/heartbeat`,
        ]

        godTopics.forEach((topic) => {
          mqttStore.subscribe(topic)
        })

        // UI-Benachrichtigung
        if (isSetupMode) {
          safeInfo(`Neues ESP-Gerät im Setup-Modus erkannt: ${espId}`, {
            timeout: 8000,
          })
        } else {
          safeInfo(`Neues Feldgerät ${espId} entdeckt und God Pi zugeordnet`)
        }

        console.log(
          `[ESP Management] ESP ${espId} automatically assigned to God Pi with default config`,
        )

        // ✅ NEU: ID-Konflikte prüfen
        this.checkAllIdConflicts(espId, payload)
      } catch (error) {
        console.error(`Failed to handle ESP discovery for ${espId}:`, error)
      }
    },

    // ESP Transfer von God zu Kaiser
    async transferEspFromGodToKaiser(espId, targetKaiserId) {
      console.log(`[ESP Management] Transfer ESP ${espId} from God to Kaiser ${targetKaiserId}`)

      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        // Transfer-Command an God senden
        const transferPayload = {
          command: 'transfer_esp',
          esp_id: espId,
          from_owner: 'god_pi_central',
          to_owner: targetKaiserId,
          command_id: `transfer_${Date.now()}`,
          timestamp: Date.now(),
        }

        // God-spezifisches Topic für Transfer
        mqttStore.publish(`god_pi_central/command`, transferPayload)

        // Lokale Ownership aktualisieren
        // Note: centralDataHub functionality moved to event-based system

        // Device-Info aktualisieren
        const device = mqttStore.espDevices.get(espId)
        if (device) {
          device.owner = targetKaiserId
          mqttStore.espDevices.set(espId, device)
        }

        safeSuccess(`Feldgerät ${espId} zu Kaiser ${targetKaiserId} übertragen`)
        return true
      } catch (error) {
        console.error(`[ESP Management] ESP transfer failed:`, error)
        safeError(`Transfer von ${espId} fehlgeschlagen`)
        return false
      }
    },

    // ESP Transfer von Kaiser zurück zu God
    async transferEspFromKaiserToGod(espId, sourceKaiserId) {
      console.log(`[ESP Management] Transfer ESP ${espId} from Kaiser ${sourceKaiserId} to God`)

      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // Transfer-Command an Source-Kaiser senden
        const transferPayload = {
          command: 'transfer_esp',
          esp_id: espId,
          from_owner: sourceKaiserId,
          to_owner: 'god_pi_central',
          command_id: `transfer_${Date.now()}`,
          timestamp: Date.now(),
        }

        mqttStore.publish(`kaiser/${sourceKaiserId}/god/command`, transferPayload)

        // Lokale Ownership aktualisieren
        // Note: centralDataHub functionality moved to event-based system

        // Device-Info aktualisieren
        const device = mqttStore.espDevices.get(espId)
        if (device) {
          device.owner = 'god_pi_central'
          mqttStore.espDevices.set(espId, device)
        }

        safeSuccess(`Feldgerät ${espId} zu God Pi zurückübertragen`)
        return true
      } catch (error) {
        console.error(`[ESP Management] ESP transfer to God failed:`, error)
        safeError(`Transfer von ${espId} zu God fehlgeschlagen`)
        return false
      }
    },

    // Zone Changes Handler
    handleZoneChanges(espId, zonesPayload) {
      // Kaiser-ID-Änderung
      if (zonesPayload.kaiser_id_changed && zonesPayload.previous_kaiser_id) {
        this.handleIdConflict(
          'kaiser',
          espId,
          zonesPayload.kaiser_id,
          zonesPayload.previous_kaiser_id,
          {
            change_timestamp: zonesPayload.kaiser_id_change_timestamp,
            type: 'status_update',
          },
        )
      }

      // Master-Zone-Änderung
      if (zonesPayload.master_zone_changed && zonesPayload.previous_master_zone_id) {
        this.handleIdConflict(
          'masterZone',
          espId,
          zonesPayload.master_zone_id,
          zonesPayload.previous_master_zone_id,
          {
            change_timestamp: zonesPayload.master_zone_change_timestamp,
            type: 'status_update',
          },
        )
      }

      // Subzone-Änderung
      if (zonesPayload.subzone_changed && zonesPayload.previous_subzone_id) {
        this.handleIdConflict(
          'subzone',
          espId,
          zonesPayload.subzone_id,
          zonesPayload.previous_subzone_id,
          {
            change_timestamp: zonesPayload.subzone_change_timestamp,
            type: 'status_update',
          },
        )
      }

      // ESP-ID-Änderung
      if (zonesPayload.esp_id_changed && zonesPayload.previous_esp_id) {
        this.handleIdConflict('espId', espId, zonesPayload.esp_id, zonesPayload.previous_esp_id, {
          change_timestamp: zonesPayload.esp_id_change_timestamp,
          type: 'status_update',
        })
      }
    },

    // Subzone Message Handler
    handleSubzoneMessage(espId, topicParts, payload) {
      const subType = topicParts[5]

      switch (subType) {
        case 'config': {
          // Update subzones for the ESP
          const device = this.getEspDevice(espId)
          if (device && payload.subzones) {
            const subzones = new Map()
            payload.subzones.forEach((subzone) => {
              subzones.set(subzone.id, subzone)
            })
            device.subzones = subzones
            device.lastUpdate = Date.now()
            this.updateEspDevice(espId, device)
          }
          break
        }
        case 'response':
          console.log('Subzone configuration response:', payload)
          break
        default:
          console.log('Unknown subzone message type:', subType)
      }
    },

    // ESP Config Handler
    async handleEspConfig(espId, payload) {
      // 🆕 NEU: Robustes Error Handling
      if (!espId) {
        console.warn('[ESP Management] Ignored config: missing esp_id')
        return
      }

      // 🆕 NEU: Stale Data Check
      if (payload.timestamp && Date.now() - payload.timestamp > 5 * 60 * 1000) {
        console.warn(
          `[ESP Management] Stale config for ${espId} (${Math.round((Date.now() - payload.timestamp) / 1000)}s old)`,
        )
      }

      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore?.espDevices?.get(espId) || {
          espId,
          lastHeartbeat: null,
          status: 'offline',
          sensors: new Map(),
          actuators: new Map(),
        }

        // ✅ NEU: kaiser_id Change-Tracking
        const oldKaiserId = device.kaiserId
        const newKaiserId = payload.kaiser_id || payload.kaiserId
        let kaiserIdChanged = false

        if (oldKaiserId && oldKaiserId !== newKaiserId) {
          kaiserIdChanged = true
          console.log(`🔄 kaiser_id changed for ${espId}: ${oldKaiserId} → ${newKaiserId}`)

          // ✅ NEU: Handle kaiser_id change
          this.handleKaiserIdChange(espId, oldKaiserId, newKaiserId)
        }

        // ✅ NEU: Rückwärtskompatibilität für ESP Config
        device.kaiserId = newKaiserId
        device.espUsername = payload.esp_username || payload.username || device.espUsername
        device.espFriendlyName =
          payload.esp_friendly_name || payload.friendly || device.espFriendlyName
        device.espZone = payload.esp_zone || payload.zone || device.espZone
        device.espPassword = payload.esp_password || payload.password || device.espPassword
        device.connectionEstablished =
          payload.connection_established !== undefined
            ? payload.connection_established
            : payload.conn !== undefined
              ? payload.conn
              : device.connectionEstablished
        device.brokerIp = payload.broker_ip || payload.broker || device.brokerIp
        device.brokerPort = payload.broker_port || payload.port || device.brokerPort

        // ✅ NEU: HTTP Port und Server Address mit Fallback
        device.httpPort = payload.http_port || payload.http || device.httpPort || 8443
        device.serverAddress =
          payload.server_address ||
          payload.server ||
          payload.broker_ip ||
          payload.broker ||
          device.serverAddress

        // ✅ NEU: Benutzerdefinierte Felder tolerieren (ESP32 Backend v3.5.0)
        device.hardwareMode = payload.hardware_mode || payload.hardwareMode || device.hardwareMode
        device.rawMode = payload.raw_mode || payload.rawMode || device.rawMode
        device.rawValue = payload.raw_value || payload.rawValue || device.rawValue
        device.timeQuality = payload.time_quality || payload.timeQuality || device.timeQuality
        device.warnings = payload.warnings || device.warnings || []
        device.context = payload.context || device.context
        device.kaiserIdChanged = kaiserIdChanged
        device.previousKaiserId = kaiserIdChanged ? oldKaiserId : null
        device.kaiserIdChangeTimestamp = kaiserIdChanged ? Date.now() : null
        device.espIdChanged = payload.esp_id_changed || payload.espIdChanged || false

        // 🆕 NEU: Status-Update bei Config
        if (device.status === 'discovered' && device.connectionEstablished) {
          device.status = 'configured'
          console.log(
            `[ESP Management] Status transition: ${espId} discovered → configured (via config)`,
          )
        }

        device.lastUpdate = Date.now()

        mqttStore.espDevices.set(espId, device)

        // ✅ NEU: Console Log für Debugging
        console.log(`[ESP Management] New config for ${espId}:`, {
          kaiserId: device.kaiserId,
          kaiserIdChanged,
          friendlyName: device.espFriendlyName,
          serverAddress: device.serverAddress,
          httpPort: device.httpPort,
          mqttPort: device.brokerPort,
          connectionEstablished: device.connectionEstablished,
          status: device.status,
          hardwareMode: device.hardwareMode,
          rawMode: device.rawMode,
          timeQuality: device.timeQuality,
          warnings: device.warnings,
        })

        // 🆕 NEU: Push-Sync an God Pi
        mqttStore.pushToGod('esp_registration', { espId, deviceInfo: device })
      } catch (error) {
        console.error(`Failed to handle ESP config for ${espId}:`, error)
      }
    },

    // Helper-Funktionen für ID-Konflikte
    handleIdConflict(type, espId, deviceId, currentId, payload) {
      console.log(`[ESP Management] ID conflict detected: ${type} for ${espId}`, {
        deviceId,
        currentId,
        payload,
      })
      // Implementierung wird später hinzugefügt
    },

    handleKaiserIdChange(espId, oldKaiserId, newKaiserId) {
      console.log(`[ESP Management] Kaiser ID change: ${espId} ${oldKaiserId} → ${newKaiserId}`)
      // Implementierung wird später hinzugefügt
    },

    // ✅ NEU: Event-Listener für migrierte MQTT-Funktionen
    initializeEventListeners() {
      // ESP Discovery Event
      eventBus.on(MQTT_EVENTS.ESP_DISCOVERY, (data) => {
        this.handleNewEspDiscovery(data.payload.esp_id || data.payload.scanner_id, data.payload)
      })

      // Zone Changes Event
      eventBus.on(MQTT_EVENTS.ZONE_CHANGES, (data) => {
        this.handleZoneChanges(data.espId, data.payload)
      })

      // Subzone Message Event
      eventBus.on(MQTT_EVENTS.SUBZONE_MESSAGE, (data) => {
        this.handleSubzoneMessage(data.espId, data.topicParts, data.payload)
      })

      console.log('[ESP Management] Event listeners initialized')
    },

    // ✅ BUS-COMPLIANT: Alle ID-Konflikte prüfen (migriert von MQTT Store)
    async checkAllIdConflicts(espId, payload) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()

        // Kaiser-ID-Konflikt
        const deviceKaiserId = payload.kaiser_id || payload.kaiserId
        const currentKaiserId = mqttStore?.getKaiserId
        if (deviceKaiserId && deviceKaiserId !== currentKaiserId) {
          this.handleIdConflict('kaiser', espId, deviceKaiserId, currentKaiserId, payload)
        }

        // Master-Zone-Konflikt
        const deviceMasterZoneId = payload.master_zone_id || payload.masterZoneId
        const currentMasterZoneId = mqttStore?.getCurrentId('masterZone')
        if (deviceMasterZoneId && deviceMasterZoneId !== currentMasterZoneId) {
          this.handleIdConflict(
            'masterZone',
            espId,
            deviceMasterZoneId,
            currentMasterZoneId,
            payload,
          )
        }

        // Subzone-Konflikt
        const deviceSubzoneId = payload.subzone_id || payload.subzoneId
        const currentSubzoneId = mqttStore?.getCurrentId('subzone')
        if (deviceSubzoneId && deviceSubzoneId !== currentSubzoneId) {
          this.handleIdConflict('subzone', espId, deviceSubzoneId, currentSubzoneId, payload)
        }

        // ESP-ID-Konflikt
        const deviceEspId = payload.esp_id
        const currentEspId = mqttStore?.getCurrentId('espId')
        if (deviceEspId && deviceEspId !== currentEspId) {
          this.handleIdConflict('espId', espId, deviceEspId, currentEspId, payload)
        }
      } catch (error) {
        console.error(`Failed to check ID conflicts for ESP ${espId}:`, error)
      }
    },

    // 🆕 NEU: Async Methoden für event-basierte Kommunikation
    async getEspDevicesAsync() {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        return mqttStore.espDevices || new Map()
      } catch (error) {
        console.warn('Failed to get ESP devices:', error)
        return new Map() // Fallback
      }
    },

    async getEspDeviceAsync(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        return mqttStore.espDevices?.get(espId)
      } catch (error) {
        console.warn('Failed to get ESP device:', error)
        return null // Fallback
      }
    },

    async getAvailablePinsForEspAsync(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (!device) return this.availablePins

        const boardType = device.board_type || device.boardType || 'ESP32_DEVKIT'
        const availablePins = this.boardPinConfigs[boardType]?.availablePins || this.availablePins

        const usedPins = new Set()
        device.subzones?.forEach((subzone) => {
          subzone.sensors?.forEach((sensor) => usedPins.add(sensor.gpio))
          subzone.actuators?.forEach((actuator) => usedPins.add(actuator.gpio))
        })

        return availablePins.filter((pin) => !usedPins.has(pin))
      } catch (error) {
        console.warn('Failed to get available pins for ESP:', error)
        return this.availablePins // Fallback
      }
    },

    async getPinAssignmentsAsync(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (!device) return []

        const assignments = []
        device.subzones?.forEach((subzone) => {
          subzone.sensors?.forEach((sensor) => {
            assignments.push({
              gpio: sensor.gpio,
              type: sensor.type,
              name: sensor.name,
              subzoneId: subzone.id,
              subzone: subzone.name,
              category: 'sensor',
            })
          })
          subzone.actuators?.forEach((actuator) => {
            assignments.push({
              gpio: actuator.gpio,
              type: actuator.type,
              name: actuator.name,
              subzoneId: subzone.id,
              subzone: subzone.name,
              category: 'actuator',
            })
          })
        })

        return assignments.sort((a, b) => a.gpio - b.gpio)
      } catch (error) {
        console.warn('Failed to get pin assignments for ESP:', error)
        return [] // Fallback
      }
    },

    async getSubzonesAsync(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        return device ? Array.from(device.subzones?.values() || []) : []
      } catch (error) {
        console.warn('Failed to get subzones for ESP:', error)
        return [] // Fallback
      }
    },

    async getZoneInfoAsync(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        if (!device) return null

        return {
          kaiserZone: device.kaiserZone || {
            id: 'raspberry_pi_central',
            name: 'Central Control',
          },
          masterZone: device.masterZone || {
            id: 'master_zone_1',
            name: 'Greenhouse Master',
          },
        }
      } catch (error) {
        console.warn('Failed to get zone info for ESP:', error)
        return null // Fallback
      }
    },

    async getEspDevicesListAsync() {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const espDevices = mqttStore.espDevices || new Map()
        return Array.from(espDevices.values()).map((esp) => ({
          title: esp.espFriendlyName || esp.espUsername || `ESP ${esp.espId}`,
          value: esp.espId,
          subtitle: esp.status === 'online' ? 'Online' : 'Offline',
        }))
      } catch (error) {
        console.warn('Failed to get ESP devices list:', error)
        return [] // Fallback
      }
    },

    async getEspBoardTypeAsync(espId) {
      try {
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const device = mqttStore.espDevices?.get(espId)
        return device?.board_type || device?.boardType || 'ESP32_DEVKIT'
      } catch (error) {
        console.warn('Failed to get ESP board type:', error)
        return 'ESP32_DEVKIT' // Fallback
      }
    },
  },

  // ✅ NEU: Store-Initialisierung mit Event-Listenern
  setup() {
    // Event-Listener beim Store-Setup registrieren
    this.initializeEventListeners()

    // ✅ NEU: Store im Event-System registrieren
    storeHandler.registerStore('espManagement', this)

    // ❌ ENTFERNT: Zirkuläre Event-Emission
    // eventBus.emit(STORE_EVENTS.STORE_READY, {
    //   storeName: 'espManagement',
    //   timestamp: Date.now(),
    // })

    return {}
  },
})
