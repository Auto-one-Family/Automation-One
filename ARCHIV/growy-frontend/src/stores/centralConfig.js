import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { validateZoneName } from '@/utils/espHelpers'
import { errorHandler } from '@/utils/errorHandler'
import { isValidPort } from '@/utils/networkHelpers'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'
import { generateGodId, generateKaiserId, generateGodKaiserId } from '@/utils/deviceIdGenerator'
import { eventBus, MQTT_EVENTS, storeHandler } from '@/utils/eventBus'
import { validateGodName } from '@/utils/validation'

// ✅ NEU: Event-Bus Debouncing für God-Config-Updates
let godConfigEventTimeout = null

function emitDebouncedGodConfigUpdate(data) {
  if (godConfigEventTimeout) {
    clearTimeout(godConfigEventTimeout)
  }

  godConfigEventTimeout = setTimeout(() => {
    eventBus.emit(MQTT_EVENTS.GOD_CONFIG_UPDATE, {
      ...data,
      timestamp: Date.now(),
      debounced: true,
    })
    godConfigEventTimeout = null
  }, 100) // 100ms debounce
}

export const useCentralConfigStore = defineStore('centralConfig', {
  state: () => ({
    // User-configurable values (KEEP)
    // Kaiser-Daten wurden in Remote-Kaiser-Store ausgelagert

    // ✅ NEU: God Pi ID Management (MASTER-Variable)
    godName: 'God Pi', // God Pi Name (Standard-Wert)
    godNameManuallySet: false, // Flag für manuelle God Pi Namen-Änderung
    godId: null, // God Pi ID (wird automatisch aus godName generiert)
    godIdManuallySet: false, // Flag für manuelle God Pi ID-Änderung

    // ✅ NEU: God als Kaiser
    godAsKaiser: true, // God fungiert als Kaiser

    // ✅ NEU: Pi0-Server-Konfiguration für Kaiser
    // Kaiser-Netzwerk-Konfiguration wurde in Remote-Kaiser-Store ausgelagert

    serverIP: import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198',
    httpPort: 8443,
    mqttPortFrontend: 9001, // WebSocket für Frontend
    mqttPortESP32: 1883, // Native MQTT für ESP32

    // ✅ NEU: Strukturierte Port-Definitionen mit Erklärungen
    portDefinitions: {
      http: {
        title: 'HTTP API-Port',
        description: 'REST-API für Konfiguration, Geräteverwaltung und Datenabfragen.',
        useCase: 'Geräte-Konfiguration, Zonenverwaltung, Historische Daten',
        protocol: 'HTTP/HTTPS',
        direction: 'Bidirektional',
        example: 'Frontend konfiguriert Agent → POST an 192.168.0.91:8443/api/config',
        icon: 'mdi-api',
        color: 'info',
        standardPort: 8443,
      },
      mqttESP32: {
        title: 'Agent MQTT-Port',
        description:
          'Agenten senden Sensor-Daten direkt an den Server. Verwendet das native MQTT-Protokoll über TCP.',
        useCase: 'Temperatur, Feuchtigkeit, pH-Wert und andere Sensordaten von Agenten',
        protocol: 'MQTT über TCP',
        direction: 'Agenten → Server',
        example: 'Agent misst 23.5°C → sendet an 192.168.0.91:1883',
        icon: 'mdi-devices',
        color: 'primary',
        standardPort: 1883,
      },
      mqttFrontend: {
        title: 'Dashboard MQTT-Port',
        description:
          'Dashboard empfängt Live-Daten für Anzeige. Verwendet MQTT über WebSocket für Browser-Kompatibilität.',
        useCase: 'Live-Dashboard, Echtzeit-Graphen, Status-Updates',
        protocol: 'MQTT über WebSocket',
        direction: 'Server → Dashboard',
        example: 'Dashboard zeigt 23.5°C → empfängt von 192.168.0.91:9001',
        icon: 'mdi-monitor',
        color: 'success',
        standardPort: 9001,
      },
    },

    // ✅ NEU: Port-Status-Tracking
    portStatus: {
      http: { status: 'standard', lastTest: null },
      mqttESP32: { status: 'standard', lastTest: null },
      mqttFrontend: { status: 'standard', lastTest: null },
    },

    // ✅ NEU: Zentrale selectedEspId-Verwaltung mit Persistence
    selectedEspId: storage.load('selected_esp_id', null),

    // ✅ NEU: Zonenverwaltung mit Persistence und Cross-Kaiser-Support
    zones: storage.load('central_zones', {
      available: [], // Verfügbare Zonen (global)
      defaultZone: '🕳️ Unkonfiguriert',
      zoneMapping: {}, // { [espId]: { zone, originalKaiser, currentKaiser } }
      crossKaiserZones: {}, // { [zoneName]: [{ espId, kaiserId }] }
      lastUpdate: null,

      // ✅ NEU: Subzone-Hierarchie
      subzoneHierarchy: {}, // { zoneName: { espId: [subzoneIds] } }

      // ✅ NEU: Cross-Zone Subzone-Mapping
      crossZoneSubzones: {
        allSubzones: new Map(), // subzoneId → { espId, zone, kaiserId }
        byDeviceType: {
          sensors: [], // Alle Sensor-Subzones
          actuators: [], // Alle Aktor-Subzones
        },
        byLogicComplexity: {
          low: [], // Einfache Logiken (1 ESP, 1 Subzone)
          medium: [], // Mittlere Logiken (2-3 ESPs, 2-3 Subzones)
          high: [], // Komplexe Logiken (4+ ESPs, 4+ Subzones)
        },
      },
    }),

    // ✅ NEU: Default-Konfigurationen für neue Geräte
    defaultConfigs: storage.load('default_configs', {
      kaiser: {
        name: 'Neuer Kaiser',
        kaiserId: 'kaiser_new',
        pi0ServerIp: '192.168.1.100',
        pi0ServerPort: 8443,
        godConnectionIp: '192.168.1.200',
        godConnectionPort: 8443,
      },
      esp: {
        friendlyName: 'Neuer ESP',
        board_type: 'ESP32_DEVKIT',
        zone: '🕳️ Unkonfiguriert',
        sensors: [],
        actuators: [],
      },
    }),

    // Status/flags (KEEP)
    lastConnectionTest: null,
    connectionQuality: 'unknown',
    migratedFromEnvironment: false,
    useNewConfig: true,
    fallbackToOldConfig: true,

    // ✅ NEU: Hierarchische Datenbank-Struktur
    kaiserRegistry: new Map(), // Map<kaiserId, KaiserRegistryEntry>
    espOwnership: new Map(), // Map<espId, owner>
    commandChains: new Map(), // Map<commandId, CommandChain>

    // 🆕 NEU: Übernommene Kaiser-IDs durch God (Frontend-Logik)
    adoptedKaiserIds: [], // Array<string>

    // ✅ NEU: Hierarchische Konfiguration
    hierarchicalConfig: {
      godMode: false,
      kaiserMode: false,
      crossKaiserLogic: new Map(),
      espTransferHistory: [],
    },

    // ✅ NEU: Mindmap-Integration
    kaiserIdFromMindMap: null, // NEU: Von Mindmap gesetzte ID
    isGodMode: false, // NEU: Flag für God Pi Modus
    isInternalUpdate: false, // ✅ NEU: Flag für interne Updates
  }),

  getters: {
    // ✅ NEU: Port-Status Getter
    getPortStatus: (state) => ({
      http: state.portStatus.http.status,
      mqttESP32: state.portStatus.mqttESP32.status,
      mqttFrontend: state.portStatus.mqttFrontend.status,
    }),

    // ✅ NEU: Port-Erklärungen für UI
    getPortExplanations: (state) => state.portDefinitions,

    // ✅ NEU: Port-Empfehlungen
    getPortRecommendations: () => ({
      http: {
        recommended: 8443,
        reason: 'Standard HTTP-Port für APIs',
        alternatives: [3000, 5000, 8000],
      },
      mqttESP32: {
        recommended: 1883,
        reason: 'Standard MQTT-Port für Agenten',
        alternatives: [8883], // MQTT über SSL
      },
      mqttFrontend: {
        recommended: 9001,
        reason: 'Standard WebSocket MQTT-Port für Browser',
        alternatives: [9002, 9003],
      },
    }),

    // ✅ NEU: Zonen-Getter
    getAvailableZones: (state) => state.zones.available,
    getDefaultZone: (state) => state.zones.defaultZone,
    getZoneMapping: (state) => state.zones.zoneMapping,

    // ✅ NEU: Zone für spezifisches ESP-Device
    getZoneForEsp: (state) => (espId) => {
      return state.zones.zoneMapping[espId] || state.zones.defaultZone
    },

    // Race Condition Prevention
    _isUpdatingKaiserId: false,

    // ✅ NEU: Getter für aktuelle IDs
    getCurrentGodId: (state) => {
      return state.godId || `god_${state.godName?.toLowerCase().replace(/\s+/g, '_') || 'default'}`
    },

    // ✅ NEU: Zentrale Kaiser-ID-Verwaltung mit Prioritäten
    getKaiserId: (state) => {
      // PRIORITÄT 1: Mindmap hat Vorrang
      if (state.kaiserIdFromMindMap) {
        return state.kaiserIdFromMindMap
      }
      // PRIORITÄT 2: Manuell gesetzte ID
      if (state.kaiserIdManuallySet && state.kaiserId !== 'raspberry_pi_central') {
        return state.kaiserId
      }
      // PRIORITÄT 3: LocalStorage (für Rückwärtskompatibilität)
      const storedId = localStorage.getItem('kaiser_id')
      if (storedId && storedId !== 'default_kaiser') {
        return storedId
      }
      // PRIORITÄT 4: Fallback
      return state.kaiserId
    },

    // ✅ NEU: God Pi Erkennung
    isGodPi: (state) => {
      return state.isGodMode || state.kaiserId === 'god_central'
    },

    // ✅ NEU: Alle ESP-IDs für eine Zone
    getEspIdsForZone: (state) => (zoneName) => {
      const espIds = []
      for (const [espId, zone] of Object.entries(state.zones.zoneMapping)) {
        if (zone === zoneName) {
          espIds.push(espId)
        }
      }
      return espIds
    },

    // ✅ NEU: Subzonen für eine Zone (für Kompatibilität)
    getSubzonesForZone: () => () => {
      // Fallback: Da Subzonen noch nicht implementiert sind, geben wir ein leeres Array zurück
      // Dies verhindert Fehler in Komponenten, die diesen Getter verwenden
      return []
    },

    // ✅ NEU: Zentrale ESP-Getter
    getSelectedEspId: (state) => state.selectedEspId,
    getSelectedEsp: (state) => {
      // Event-basierte Kommunikation statt direkter Store-Aufruf
      if (!state.selectedEspId) return null

      // Event für ESP-Daten anfordern
      eventBus.emit(MQTT_EVENTS.REQUEST_ESP_DATA, { espId: state.selectedEspId })
      return null // Wird über Event-System aktualisiert
    },

    // ✅ NEU: Alle ESP-IDs über Event-System
    getAllEspIds: () => {
      // Event für alle ESP-IDs anfordern
      eventBus.emit(MQTT_EVENTS.REQUEST_ALL_ESP_IDS)
      return [] // Wird über Event-System aktualisiert
    },

    // ✅ KORRIGIERT: Verschiedene URLs für verschiedene Zwecke
    httpUrl: (state) => `http://${state.serverIP}:${state.httpPort}`,
    mqttUrlFrontend: (state) => `ws://${state.serverIP}:${state.mqttPortFrontend}`,
    mqttUrlESP32: (state) => `mqtt://${state.serverIP}:${state.mqttPortESP32}`,

    // ✅ NEU: Fehlende Getter hinzugefügt
    getPiUrl: (state) => `http://${state.serverIP}:${state.httpPort}`,
    getServerUrl: (state) => `http://${state.serverIP}:${state.httpPort}`,

    // ✅ KORRIGIERT: Zentrale URL-Konstruktion mit Fallbacks (Backward Compatibility)
    getServerUrlWithFallback:
      (state) =>
      (espId = null) => {
        if (state.serverIP && state.httpPort) {
          return `http://${state.serverIP}:${state.httpPort}`
        }

        // Fallback zu bestehender Konfiguration
        if (state.fallbackToOldConfig) {
          // Event für Device-Daten anfordern
          if (espId) {
            eventBus.emit(MQTT_EVENTS.REQUEST_ESP_DATA, { espId })
          }

          // Fallback zu Environment Variables
          const brokerUrl = import.meta.env.VITE_MQTT_BROKER_URL || '192.168.1.100'
          return `http://${brokerUrl}:8443`
        }

        return 'http://192.168.1.100:8443'
      },

    getMqttUrl: (state) => {
      if (state.serverIP && state.mqttPortFrontend) {
        return `ws://${state.serverIP}:${state.mqttPortFrontend}`
      }

      // Fallback zu bestehender Konfiguration
      if (state.fallbackToOldConfig) {
        // Event für MQTT-Konfiguration anfordern
        eventBus.emit(MQTT_EVENTS.REQUEST_CONFIG)

        // Fallback zu Environment Variables
        const brokerUrl = import.meta.env.VITE_MQTT_BROKER_URL || '192.168.1.100'
        const port = import.meta.env.VITE_MQTT_BROKER_PORT || 9001
        return `ws://${brokerUrl}:${port}`
      }

      return 'ws://192.168.1.100:9001'
    },

    // ✅ KORRIGIERT: System-Typ-Erkennung als Property
    getSystemType: (state) => {
      if (state.kaiserId === 'raspberry_pi_central') {
        return 'GOD_PI_STANDARD'
      }
      return 'KAISER_EDGE_CONTROLLER'
    },

    // ✅ NEU: God-ID (automatisch generiert)
    getGodId: (state) => {
      if (state.godIdManuallySet && state.godId) {
        return state.godId
      }
      return generateGodId(state.godName)
    },

    // ✅ NEU: God-Kaiser-ID (God-ID = Kaiser-ID für God)
    getGodKaiserId: (state) => {
      if (state.godAsKaiser) {
        return generateGodKaiserId(state.godName)
      }
      return null
    },

    // ✅ NEU: Ist God der aktuelle Kaiser?
    isGodKaiser: (state) => {
      return state.godAsKaiser
    },

    // ✅ KORRIGIERT: Aktuelle Kaiser-ID für MQTT als Property
    getCurrentKaiserId: (state) => {
      try {
        // Priorität 1: God als Kaiser
        if (state.godAsKaiser) {
          return generateGodKaiserId(state.godName)
        }

        // Priorität 2: Manuell gesetzte Kaiser-ID
        if (state.kaiserIdManuallySet && state.kaiserId) {
          return state.kaiserId
        }

        // Automatisch generiert aus Kaiser-Namen
        if (state.kaiserIdGenerationEnabled && state.kaiserName) {
          return generateKaiserId(state.kaiserName)
        }

        // Fallback
        return state.kaiserId || 'dev_kaiser_fallback'
      } catch (error) {
        console.warn('Error getting Kaiser ID:', error.message)
        return 'dev_kaiser_fallback'
      }
    },

    // ✅ KORRIGIERT: Kaiser-ID-Status als Property
    getKaiserIdStatus: (state) => {
      return {
        isManuallySet: state.kaiserIdManuallySet,
        isAutoGenerated: !state.kaiserIdManuallySet && state.kaiserIdGenerationEnabled,
        currentId: state.kaiserId,
        systemType:
          state.kaiserId === 'raspberry_pi_central' ? 'GOD_PI_STANDARD' : 'KAISER_EDGE_CONTROLLER',
      }
    },

    // ESP32-Konfiguration für Übertragung an Geräte
    esp32Config: (state) => ({
      pi_server_ip: state.serverIP,
      pi_http_port: state.httpPort,
      mqtt_broker_ip: state.serverIP,
      mqtt_broker_port: state.mqttPortESP32, // ← 1883 für ESP32!
      kaiser_id: state.getCurrentKaiserId, // Verwendet den korrekten Getter
    }),

    // Connection Status
    isConnected: (state) => {
      return state.lastConnectionTest?.success || false
    },

    connectionStatus: (state) => {
      if (!state.lastConnectionTest) return 'unknown'
      if (state.lastConnectionTest.success) return 'connected'
      return 'failed'
    },

    // 🆕 NEU: Alle bekannten Kaiser-IDs (für Multi-Select, Anzeige etc.)
    getAllKaiserIds: (state) => Array.from(state.kaiserRegistry.keys()),
    // 🆕 NEU: Alle Registry-Objekte (z.B. für Status pro Kaiser)
    getKaiserRegistryEntries: (state) => Array.from(state.kaiserRegistry.values()),
    // 🆕 NEU: Übernommene Kaiser-IDs durch God
    getAdoptedKaiserIds: (state) => state.adoptedKaiserIds,
  },

  actions: {
    // ✅ NEU: Port-spezifische Setter mit Validierung
    setHttpPort(port) {
      const portNum = parseInt(port)
      if (this.validatePort(portNum)) {
        this.httpPort = portNum
        this.portStatus.http.status = portNum === 8443 ? 'standard' : 'custom'
        this.generateUrls()
        this.saveToStorage()
        this.syncWithMqttStore() // ✅ NEU: Automatische Synchronisation
        return { success: true }
      }
      return { success: false, error: 'Ungültiger Port (1-65535)' }
    },

    setMqttEsp32Port(port) {
      const portNum = parseInt(port)
      if (this.validatePort(portNum)) {
        this.mqttPortESP32 = portNum
        this.portStatus.mqttESP32.status = portNum === 1883 ? 'standard' : 'custom'
        this.generateUrls()
        this.saveToStorage()
        this.syncWithMqttStore() // ✅ NEU: Automatische Synchronisation
        return { success: true }
      }
      return { success: false, error: 'Ungültiger Port (1-65535)' }
    },

    setMqttFrontendPort(port) {
      const portNum = parseInt(port)
      if (this.validatePort(portNum)) {
        this.mqttPortFrontend = portNum
        this.portStatus.mqttFrontend.status = portNum === 9001 ? 'standard' : 'custom'
        this.generateUrls()
        this.saveToStorage()
        this.syncWithMqttStore() // ✅ NEU: Automatische Synchronisation
        return { success: true }
      }
      return { success: false, error: 'Ungültiger Port (1-65535)' }
    },

    // ✅ NEU: Port-Validierung
    validatePort(port) {
      return isValidPort(port)
    },

    // ✅ NEU: Port-Konflikt-Prüfung
    validatePorts() {
      const errors = []
      const ports = [this.httpPort, this.mqttPortESP32, this.mqttPortFrontend]

      const uniquePorts = new Set(ports)
      if (uniquePorts.size !== 3) {
        errors.push('Alle Ports müssen unterschiedlich sein')
      }

      return errors
    },

    // ✅ NEU: Automatische MQTT Store Synchronisation
    syncWithMqttStore() {
      try {
        // Basis-Konfiguration aktualisieren via Event-System
        eventBus.emit(MQTT_EVENTS.CENTRAL_CONFIG_UPDATE, {
          brokerUrl: this.serverIP,
          port: this.mqttPortFrontend,
        })

        // Strukturiertes God Config Update
        const godConfig = {
          name: this.godName,
          id: this.getGodId,
          kaiserId: this.getGodKaiserId,
          godAsKaiser: this.godAsKaiser,
        }

        // Send God config update via Event-System (debounced)
        emitDebouncedGodConfigUpdate(godConfig)

        // ✅ KORRIGIERT: Vereinfachte Kaiser-Konfiguration
        const kaiserConfig = {
          id: this.getCurrentKaiserId(),
        }

        // Send Kaiser config update via Event-System
        eventBus.emit(MQTT_EVENTS.KAISER_CONFIG_UPDATE, kaiserConfig)

        console.log('[CentralConfig] God config synced:', godConfig)
        return true
      } catch (error) {
        console.error('[CentralConfig] Failed to sync with MQTT Store:', error)
        return false
      }
    },

    // ✅ NEU: Zone für ESP-Device setzen mit Cross-Kaiser-Support
    setZoneForEsp(espId, zoneName, kaiserId = null) {
      // Validiere Zonename
      const validation = validateZoneName(zoneName)
      if (!validation.isValid) {
        throw new Error(`Ungültiger Zonename: ${validation.error}`)
      }

      const targetKaiserId = kaiserId || this.kaiserId

      // Cross-Kaiser-Zone-Mapping aktualisieren
      this.zones.zoneMapping[espId] = {
        zone: zoneName,
        originalKaiser: this.getOriginalKaiserForEsp(espId),
        currentKaiser: targetKaiserId,
      }

      // Cross-Kaiser-Zonen-Index aktualisieren
      if (!this.zones.crossKaiserZones[zoneName]) {
        this.zones.crossKaiserZones[zoneName] = []
      }

      // ESP zu Zone hinzufügen (remove from old zones first)
      this.removeEspFromAllZones(espId)
      this.zones.crossKaiserZones[zoneName].push({
        espId,
        kaiserId: targetKaiserId,
      })

      this.zones.lastUpdate = Date.now()

      // Event für Zone-Änderung
      eventBus.emit(MQTT_EVENTS.CROSS_KAISER_ZONE_CHANGE, {
        espId,
        zoneName,
        kaiserId: targetKaiserId,
      })

      // Persistiere Änderungen
      this.saveZonesToStorage()

      console.info(
        `[ZoneChange] ESP ${espId} zu Zone "${zoneName}" (Kaiser: ${targetKaiserId}) verschoben`,
      )
    },

    // ✅ NEU: Rückwärtskompatible setZone-Methode
    setZone(espId, zoneName) {
      this.setZoneForEsp(espId, zoneName)
    },

    // ✅ NEU: Hilfsmethoden für Cross-Kaiser-Zone-Management
    getOriginalKaiserForEsp(espId) {
      const mapping = this.zones.zoneMapping[espId]
      if (mapping && typeof mapping === 'object') {
        return mapping.originalKaiser || this.kaiserId
      }
      return this.kaiserId
    },

    removeEspFromAllZones(espId) {
      // ESP aus allen Cross-Kaiser-Zonen entfernen
      Object.keys(this.zones.crossKaiserZones).forEach((zoneName) => {
        this.zones.crossKaiserZones[zoneName] = this.zones.crossKaiserZones[zoneName].filter(
          (entry) => entry.espId !== espId,
        )
      })
    },

    getEspsInCrossKaiserZone(zoneName) {
      return this.zones.crossKaiserZones[zoneName] || []
    },

    getKaisersInZone(zoneName) {
      const esps = this.getEspsInCrossKaiserZone(zoneName)
      const kaiserIds = new Set(esps.map((esp) => esp.kaiserId))
      return Array.from(kaiserIds)
    },

    // ✅ NEU: Zone für ESP-Device entfernen
    removeZone(espId) {
      if (this.zones.zoneMapping[espId]) {
        const oldZone = this.zones.zoneMapping[espId]
        delete this.zones.zoneMapping[espId]
        this.zones.lastUpdate = Date.now()

        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.ZONE_CHANGES, {
          espId,
          zoneName: this.zones.defaultZone,
          oldZone,
          action: 'remove',
        })

        // Persistiere Änderungen
        this.saveZonesToStorage()

        console.info(`[ZoneChange] ESP ${espId} aus Zone "${oldZone}" entfernt`)
      }
    },

    // ✅ NEU: Erweiterte Zone-Verschiebung mit Event-System
    async moveEspToZone(espId, newZone, oldZone = null) {
      try {
        // 1. Validiere Zonename
        const validation = validateZoneName(newZone)
        if (!validation.isValid) {
          throw new Error(`Ungültiger Zonename: ${validation.error}`)
        }

        // 2. Speichere Zone-Mapping
        this.zones.zoneMapping[espId] = newZone
        this.zones.lastUpdate = Date.now()

        // 3. Send zone change via Event-System
        eventBus.emit(MQTT_EVENTS.ZONE_CHANGES, {
          espId,
          zoneName: newZone,
          oldZone,
          action: 'move',
        })

        // 4. Send system command via Event-System
        eventBus.emit(MQTT_EVENTS.SYSTEM_COMMAND, {
          espId,
          command: 'update_zone',
          payload: {
            zone: newZone,
            old_zone: oldZone,
            timestamp: Date.now(),
          },
        })

        // 5. Persistiere Änderungen
        this.saveZonesToStorage()

        console.info(`[ZoneChange] ESP ${espId} von "${oldZone}" zu "${newZone}" verschoben`)

        return { success: true, espId, oldZone, newZone }
      } catch (error) {
        console.error('[ZoneChange] Fehler beim Verschieben:', error)
        throw error
      }
    },

    // ✅ NEU: Zone komplett löschen
    async deleteZone(zoneName) {
      const espIdsInZone = this.getEspIdsForZone(zoneName)

      if (espIdsInZone.length === 0) {
        throw new Error(`Zone "${zoneName}" ist bereits leer`)
      }

      try {
        // Verschiebe alle ESPs in unkonfigurierte Zone
        for (const espId of espIdsInZone) {
          await this.moveEspToZone(espId, this.zones.defaultZone, zoneName)
        }

        // Aktualisiere verfügbare Zonen
        this.updateAvailableZones()

        safeSuccess(`Zone "${zoneName}" gelöscht - ${espIdsInZone.length} ESPs verschoben`)

        return { success: true, deletedZone: zoneName, movedEspCount: espIdsInZone.length }
      } catch (error) {
        console.error('[ZoneDelete] Fehler beim Löschen der Zone:', error)
        throw error
      }
    },

    // ✅ NEU: Zentrale Geräteverwaltung
    getAllDevices() {
      const devices = {
        god: {
          id: 'god-server',
          friendlyName: 'God Server',
          type: 'Dummy God Server',
          status: 'offline',
          lastUpdate: null,
        },
        kaiser: {
          id: 'kaiser-server',
          friendlyName: 'Kaiser Pi',
          type: 'Pi Server',
          status: 'online', // Will be updated via events
          lastUpdate: Date.now(),
        },
        esp: this.getAllEspIds().map((espId) => {
          return {
            id: espId,
            friendlyName: espId, // Will be updated via events
            type: 'ESP32',
            status: 'offline', // Will be updated via events
            lastUpdate: null, // Will be updated via events
            zone: this.zones.zoneMapping[espId] || this.zones.defaultZone,
          }
        }),
      }

      return devices
    },

    // ✅ NEU: Einheitliche ID-Generierung
    generateDeviceId(friendlyName) {
      return friendlyName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Umlaute entfernen
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_') // Sonderzeichen zu _
        .replace(/_+/g, '_') // Mehrfache _ zu einem
        .replace(/^_|_$/g, '') // Anfang/Ende _ entfernen
    },

    // ✅ NEU: Verfügbare Zonen aktualisieren
    updateAvailableZones() {
      const zones = new Set()

      // Sammle alle verwendeten Zonen aus Zone-Mapping
      for (const zone of Object.values(this.zones.zoneMapping)) {
        if (zone) {
          zones.add(zone)
        }
      }

      // Füge Standard-Zone hinzu
      zones.add(this.zones.defaultZone)

      this.zones.available = Array.from(zones).sort()
      this.saveZonesToStorage()
    },

    // ✅ NEU: State-Recovery nach Initialisierung
    async initializeState() {
      try {
        // Lade persistierte Daten
        this.loadZonesFromStorage()

        // Stelle ESP-Auswahl wieder her (wird via Events aktualisiert)
        if (this.selectedEspId) {
          // ESP availability will be checked via events
          console.log(`Selected ESP ID: ${this.selectedEspId}`)
        }

        console.log('✅ CentralConfig State erfolgreich wiederhergestellt')
      } catch (error) {
        errorHandler.error('Fehler beim State-Recovery', error)
      }
    },

    // ✅ NEU: Zonen aus Storage laden
    loadZonesFromStorage() {
      try {
        const savedZones = storage.load('central_zones', {
          available: [],
          defaultZone: '🕳️ Unkonfiguriert',
          zoneMapping: {},
          lastUpdate: null,
        })

        this.zones = { ...this.zones, ...savedZones }

        // Synchronisiere mit MQTT Store
        this.syncZonesWithMqttStore()

        console.info('[Zones] Zonenkonfiguration aus Storage geladen')
      } catch (error) {
        console.error('[Zones] Fehler beim Laden der Zonenkonfiguration:', error)
      }
    },

    // ✅ NEU: Zonen in Storage speichern
    saveZonesToStorage() {
      try {
        storage.save('central_zones', {
          available: this.zones.available,
          defaultZone: this.zones.defaultZone,
          zoneMapping: this.zones.zoneMapping,
          lastUpdate: this.zones.lastUpdate,
        })
      } catch (error) {
        console.error('[Zones] Fehler beim Speichern der Zonenkonfiguration:', error)
      }
    },

    // ✅ NEU: Zonen mit Event-System synchronisieren
    syncZonesWithMqttStore() {
      // Send zone mappings via Event-System
      for (const [espId, zone] of Object.entries(this.zones.zoneMapping)) {
        eventBus.emit(MQTT_EVENTS.ZONE_CHANGES, {
          espId,
          zoneName: zone,
          action: 'sync',
        })
      }

      // Aktualisiere verfügbare Zonen
      this.updateAvailableZones()
    },

    // ✅ NEU: Zonenkonfiguration zurücksetzen
    resetZones() {
      this.zones = {
        available: [this.zones.defaultZone],
        defaultZone: '🕳️ Unkonfiguriert',
        zoneMapping: {},
        lastUpdate: Date.now(),
      }
      this.saveZonesToStorage()
      console.info('[Zones] Zonenkonfiguration zurückgesetzt')
    },

    // 🆕 NEU: Automatische Zone-Erstellung
    async createZoneIfNotExists(zoneName) {
      if (!this.zones.available.includes(zoneName)) {
        this.zones.available.push(zoneName)
        this.zones.lastUpdate = Date.now()
        this.saveZonesToStorage()

        console.info(`[ZoneManagement] Neue Zone "${zoneName}" automatisch erstellt`)
      }
    },

    // 🆕 NEU: Zone-Statistiken
    getZoneStatistics() {
      const stats = {
        totalZones: this.zones.available.length,
        configuredZones: 0,
        unconfiguredDevices: 0,
        zoneDistribution: {},
      }

      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      // Die ESP-Device-Daten werden über Events vom MQTT-Store bereitgestellt
      // Diese Funktion wird über Events mit aktuellen Daten aktualisiert

      // Fallback: Verwende Zone-Mapping für Basis-Statistiken
      for (const [, zone] of Object.entries(this.zones.zoneMapping)) {
        if (zone === this.zones.defaultZone || zone === '🕳️ Unkonfiguriert') {
          stats.unconfiguredDevices++
        } else {
          stats.configuredZones++
          stats.zoneDistribution[zone] = (stats.zoneDistribution[zone] || 0) + 1
        }
      }

      return stats
    },

    // 🆕 NEU: Zone-Validierung mit Warnungen
    validateZoneAssignment(espId, zoneName) {
      const warnings = []

      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      // Die ESP-Device-Daten werden über Events vom MQTT-Store bereitgestellt
      // Diese Validierung wird über Events mit aktuellen Daten durchgeführt

      // Fallback: Verwende Zone-Mapping für Basis-Validierung
      const existingDevices = this.getEspIdsForZone(zoneName)

      existingDevices.forEach((existingEspId) => {
        if (existingEspId !== espId) {
          // ✅ MIGRIERT: Event-basierte Validierung
          eventBus.emit(MQTT_EVENTS.ZONE_VALIDATION, {
            espId,
            zoneName,
            existingEspId,
            action: 'validate_duplicate',
          })

          warnings.push(`Gerätename existiert bereits in Zone "${zoneName}"`)
        }
      })

      return {
        isValid: warnings.length === 0,
        warnings,
      }
    },

    // 🆕 NEU: Zone-Icon-Management
    getZoneIcon(zoneName) {
      const zoneIcons = {
        Gewächshaus: 'mdi-greenhouse',
        Hochbeet: 'mdi-flower',
        Außensensor: 'mdi-weather-sunny',
        Innenraum: 'mdi-home',
        Keller: 'mdi-basement',
        Dachboden: 'mdi-attic',
        Garten: 'mdi-garden',
        Terrarium: 'mdi-fish',
        Aquarium: 'mdi-fishbowl',
        '🕳️ Unkonfiguriert': 'mdi-alert-circle-outline',
      }

      return zoneIcons[zoneName] || 'mdi-map-marker'
    },

    // 🆕 NEU: Zone-Farbe-Management
    getZoneColor(zoneName) {
      const zoneColors = {
        Gewächshaus: 'success',
        Hochbeet: 'success',
        Garten: 'success',
        Außensensor: 'info',
        Innenraum: 'primary',
        Keller: 'grey',
        Dachboden: 'grey',
        Terrarium: 'warning',
        Aquarium: 'info',
        '🕳️ Unkonfiguriert': 'grey',
      }

      return zoneColors[zoneName] || 'primary'
    },

    // 🆕 NEU: Zone-Beschreibung
    getZoneDescription(zoneName) {
      const zoneDescriptions = {
        Gewächshaus: 'Kontrollierte Umgebung für Pflanzenzucht',
        Hochbeet: 'Erhöhtes Beet für optimale Pflanzenentwicklung',
        Garten: 'Außenbereich für Pflanzen und Sensoren',
        Außensensor: 'Wetter- und Umgebungssensoren',
        Innenraum: 'Raumklima und Innenraum-Sensoren',
        Keller: 'Untergeschoss für Lagerung und Sensoren',
        Dachboden: 'Obergeschoss für Temperatur- und Feuchtigkeitssensoren',
        Terrarium: 'Tierhaltung und spezielle Umgebungsbedingungen',
        Aquarium: 'Wasserqualität und Fischhaltung',
        '🕳️ Unkonfiguriert': 'Geräte ohne Zonen-Zuordnung',
      }

      return zoneDescriptions[zoneName] || `Zone "${zoneName}"`
    },

    // 🆕 NEU: Zone-Export für Backup
    exportZoneConfiguration() {
      return {
        version: '1.0',
        timestamp: Date.now(),
        zones: {
          available: this.zones.available,
          defaultZone: this.zones.defaultZone,
          zoneMapping: this.zones.zoneMapping,
          lastUpdate: this.zones.lastUpdate,
        },
        statistics: this.getZoneStatistics(),
      }
    },

    // 🆕 NEU: Zone-Import für Restore
    async importZoneConfiguration(config) {
      try {
        if (config.version !== '1.0') {
          throw new Error('Unterstützte Konfigurationsversion: 1.0')
        }

        this.zones = config.zones
        this.saveZonesToStorage()
        this.syncZonesWithMqttStore()

        console.info('[ZoneImport] Zonenkonfiguration erfolgreich importiert')
        safeSuccess('Zonenkonfiguration erfolgreich importiert')

        return { success: true }
      } catch (error) {
        console.error('[ZoneImport] Fehler beim Importieren:', error)
        safeError('Fehler beim Importieren der Zonenkonfiguration')
        throw error
      }
    },

    // Migration von Environment Variables (einmalig)
    migrateFromEnvironment() {
      if (this.migratedFromEnvironment) return

      // Migriere Kaiser ID
      if (!this.kaiserId && import.meta.env.VITE_KAISER_ID) {
        this.kaiserId = import.meta.env.VITE_KAISER_ID
      }

      // Migriere Server IP
      if (!this.serverIP && import.meta.env.VITE_MQTT_BROKER_URL) {
        this.serverIP = import.meta.env.VITE_MQTT_BROKER_URL
      }

      // Migriere Ports
      if (import.meta.env.VITE_MQTT_BROKER_PORT) {
        this.mqttPortFrontend = parseInt(import.meta.env.VITE_MQTT_BROKER_PORT) || 9001
      }

      this.migratedFromEnvironment = true
      this.generateUrls()
      this.saveToStorage()
    },

    // Kaiser-ID-Funktionen wurden in Remote-Kaiser-Store ausgelagert

    // Kaiser-ID-Funktionen wurden in Remote-Kaiser-Store ausgelagert

    // Kaiser-bezogene Funktionen wurden in Remote-Kaiser-Store ausgelagert

    // ✅ KORRIGIERT: God-Name setzen mit Validation und Debug-Logging
    setGodName(godName, fromMindMap = false, source = 'unknown', isInternalUpdate = false) {
      const timestamp = new Date().toISOString()
      console.log(`🔴 [${timestamp}] setGodName called:`)
      console.log(`🔴 [${timestamp}] - Name: "${godName}"`)
      console.log(`🔴 [${timestamp}] - Source: ${source}`)
      console.log(`🔴 [${timestamp}] - fromMindMap: ${fromMindMap}`)
      console.log(`🔴 [${timestamp}] - Current godName: "${this.godName}"`)
      console.log(`🔴 [${timestamp}] - Stack trace:`, new Error().stack)

      // Validierung hinzufügen
      const validation = validateGodName(godName)
      if (!validation.valid) {
        console.error(`🔴 [${timestamp}] God name validation failed: ${validation.error}`)
        return false
      }

      // ✅ NEU: Race-Condition-Schutz nur bei externen Aufrufen
      if (!isInternalUpdate && this.isInternalUpdate) {
        console.log(`🚫 [${timestamp}] Blocked recursive setGodName from ${source}`)
        return false
      }

      if (!isInternalUpdate) {
        this.isInternalUpdate = true
      }

      try {
        console.log('🔵 [DEBUG] setGodName called with:', godName, 'fromMindMap:', fromMindMap)

        if (!fromMindMap) {
          console.warn('[CentralConfig] God name changes should come from MindMap')
        }

        // ✅ KORRIGIERT: Korrekte Behandlung von leeren Namen
        this.godName = godName || '' // Leere Namen als leeren String speichern
        this.godNameManuallySet = true

        // Automatisch God-ID generieren mit Konsistenz-Prüfung
        if (godName && godName.trim()) {
          const expectedGodId = generateGodId(godName)

          // Intelligente Konsistenz-Prüfung: Update wenn inkonsistent
          const shouldUpdateGodId =
            !this.godIdManuallySet || // Nicht manuell gesetzt
            !this.godId || // Leer/null
            this.godId !== expectedGodId // Inkonsistent zum Namen

          if (shouldUpdateGodId) {
            this.godId = expectedGodId
            this.godIdManuallySet = false // Reset Flag für zukünftige Updates
            console.log('[CentralConfig] Auto-generated/corrected God ID:', expectedGodId)
          }
        } else {
          // ✅ KORRIGIERT: Reset bei leerem Namen (auch wenn manuell gesetzt)
          this.godId = null
          this.godIdManuallySet = false // Reset Flag für leere Namen
          console.log('[CentralConfig] Reset God ID (empty name)')
        }

        // God-Kaiser-ID wird jetzt nur über Getter verwaltet
        // Keine direkte Setzung mehr nötig - wird dynamisch aus godName generiert

        // Sofort-Speicherung entfernt - wird nur noch über saveToStorage() verwaltet

        // ✅ KORREKT: Lokalen Store speichern
        this.saveToStorage()

        // ✅ KORREKT: Event über CentralDataHub emittieren (debounced)
        emitDebouncedGodConfigUpdate({
          type: 'god_name',
          value: this.godName,
          fromMindMap,
          source,
        })

        // Event enthält bereits fromMindMap Flag - kein separates MindMap-Event nötig

        console.log(`🔵 [${timestamp}] setGodName completed. New godName: "${this.godName}"`)
        return true
      } finally {
        if (!isInternalUpdate) {
          this.isInternalUpdate = false
        }
      }
    },

    // ✅ NEU: God-ID manuell setzen
    setGodId(id, manuallySet = true) {
      this.godId = id
      this.godIdManuallySet = manuallySet

      this.generateUrls()

      // ✅ KORREKT: Lokalen Store speichern
      this.saveToStorage()

      // ✅ KORREKT: Event über CentralDataHub emittieren (debounced)
      emitDebouncedGodConfigUpdate({
        type: 'god_id',
        value: id,
        manuallySet,
      })
    },

    // ✅ NEU: God als Kaiser aktivieren/deaktivieren
    setGodAsKaiser(enabled, fromMindMap = false) {
      // ✅ NEU: Race-Condition-Schutz
      if (this.isInternalUpdate) {
        console.log(`🚫 Blocked recursive setGodAsKaiser`)
        return false
      }

      this.isInternalUpdate = true

      try {
        console.log('[CentralConfig] Setting God as Kaiser:', enabled, 'fromMindMap:', fromMindMap)

        if (!fromMindMap) {
          console.warn('[CentralConfig] God as Kaiser changes should come from MindMap')
        }

        this.godAsKaiser = enabled
        // God-Kaiser-ID wird jetzt nur über Getter verwaltet

        // ✅ KORREKT: Lokalen Store speichern
        this.saveToStorage()

        // ✅ KORREKT: Event über CentralDataHub emittieren (debounced)
        emitDebouncedGodConfigUpdate({
          type: 'god_as_kaiser',
          value: enabled,
          fromMindMap,
        })

        // Event enthält bereits fromMindMap Flag - kein separates MindMap-Event nötig
      } finally {
        this.isInternalUpdate = false
      }
    },

    // ✅ NEU: Default-Konfigurationen verwalten
    setDefaultKaiserConfig(config) {
      this.defaultConfigs.kaiser = { ...this.defaultConfigs.kaiser, ...config }
      storage.save('default_configs', this.defaultConfigs)
    },

    setDefaultEspConfig(config) {
      this.defaultConfigs.esp = { ...this.defaultConfigs.esp, ...config }
      storage.save('default_configs', this.defaultConfigs)
    },

    getDefaultKaiserConfig() {
      return this.defaultConfigs.kaiser
    },

    getDefaultEspConfig() {
      return this.defaultConfigs.esp
    },

    // ✅ NEU: Neue Geräte mit Default-Konfiguration initialisieren
    applyDefaultConfigToNewDevice(deviceType, deviceId) {
      if (deviceType === 'kaiser') {
        const config = this.getDefaultKaiserConfig()
        // Hier würde die Kaiser-Konfiguration angewendet werden
        console.log(`[CentralConfig] Applying default config to new Kaiser: ${deviceId}`, config)
      } else if (deviceType === 'esp') {
        const config = this.getDefaultEspConfig()
        // Hier würde die ESP-Konfiguration angewendet werden
        console.log(`[CentralConfig] Applying default config to new ESP: ${deviceId}`, config)
      }
    },

    // ✅ NEU: Kaiser ID aus Kaiser-Namen generieren (NEU)
    // Kaiser-bezogene Funktionen wurden in Remote-Kaiser-Store ausgelagert

    // ✅ NEU: Migration von bestehenden Konfigurationen
    migrateFromLegacyConfig() {
      // ✅ KORRIGIERT: Nur migrieren wenn Werte nicht bereits gesetzt sind
      // Wenn nur godName gesetzt ist, generiere God Pi ID
      if (this.godName && !this.godId && !this.godIdManuallySet) {
        const generatedId = generateGodId(this.godName)
        this.setGodId(generatedId, false)
      }

      // Kaiser-Daten werden jetzt im Remote-Kaiser-Store verwaltet
    },

    /**
     * Erzwingt Konsistenz zwischen Namen und IDs
     * Name ist IMMER Master, ID passt sich an
     * ✅ KORRIGIERT: Nur bei manuell nicht gesetzten IDs
     */
    enforceNameToIdConsistency() {
      console.log('[CentralConfig] Enforcing name-to-ID consistency...')

      // ✅ GOD: Name → ID Konsistenz (nur wenn nicht manuell gesetzt)
      if (this.godName && this.godName.trim()) {
        const expectedGodId = generateGodId(this.godName)
        if (!this.godIdManuallySet && this.godId !== expectedGodId) {
          this.godId = expectedGodId
          console.log(`[CentralConfig] Corrected God ID: ${this.godId}`)
        }

        // God-Kaiser-ID wird jetzt nur über Getter verwaltet - keine Konsistenz-Prüfung nötig
      }

      // Kaiser-Daten werden jetzt im Remote-Kaiser-Store verwaltet

      // ✅ God soll IMMER Kaiser sein (für ESP-Anmeldung)
      if (!this.godAsKaiser) {
        this.godAsKaiser = true
        console.log('[CentralConfig] Enforced God as Kaiser mode')
      }
    },

    /**
     * Räumt alte localStorage-Keys auf
     */
    cleanupLegacyStorage() {
      const legacyKeys = ['god_pi_ip'] // Kaiser-Keys werden im Remote-Kaiser-Store verwaltet
      legacyKeys.forEach((key) => {
        if (localStorage.getItem(key)) {
          console.log(`[CentralConfig] Cleaning up legacy key: ${key}`)
          localStorage.removeItem(key)
        }
      })

      // ✅ NEU: Legacy God-Values KOMPLETT ENTFERNEN
      this.removeLegacyGodValues()
    },

    /**
     * Entfernt komplett überflüssige Legacy-God-Werte
     */
    removeLegacyGodValues() {
      let needsUpdate = false

      // godPiKaiserId komplett entfernen
      if (this.godPiKaiserId !== undefined) {
        console.log(`[CentralConfig] Removing obsolete godPiKaiserId: ${this.godPiKaiserId}`)
        delete this.godPiKaiserId
        needsUpdate = true
      }

      // godPiKaiserMode komplett entfernen
      if (this.godPiKaiserMode !== undefined) {
        console.log(`[CentralConfig] Removing obsolete godPiKaiserMode: ${this.godPiKaiserMode}`)
        delete this.godPiKaiserMode
        needsUpdate = true
      }

      if (needsUpdate) {
        console.log('[CentralConfig] Obsolete legacy God values removed')
        this.saveToStorage()
      }
    },

    // Server IP setzen
    setServerIP(ip) {
      this.serverIP = ip
      this.generateUrls()
      this.saveToStorage()
    },

    // Kaiser-Netzwerk-Konfigurationsfunktionen wurden in Remote-Kaiser-Store ausgelagert

    // ✅ NEU: Backward Compatibility - Alte Methoden rufen neue auf
    setMqttPortFrontend(port) {
      return this.setMqttFrontendPort(port)
    },

    setMqttPortESP32(port) {
      return this.setMqttEsp32Port(port)
    },

    // URLs generieren
    generateUrls() {
      // URLs werden jetzt über getters berechnet, kein state update nötig
      if (this.serverIP) {
        // Automatisch MQTT Store aktualisieren (wenn aktiviert)
        if (this.useNewConfig) {
          this.updateMqttStore()
        }
      }
    },

    // MQTT Store aktualisieren
    updateMqttStore() {
      try {
        // ✅ KORRIGIERT: Sichere Konfigurationsaktualisierung via Event-System
        const configUpdate = {
          brokerUrl: this.serverIP,
          port: this.mqttPortFrontend,
          // Kaiser-ID wird jetzt im Remote-Kaiser-Store verwaltet
        }

        // Send configuration update via Event-System
        eventBus.emit(MQTT_EVENTS.CENTRAL_CONFIG_UPDATE, configUpdate)
      } catch (error) {
        console.warn('Failed to update MQTT store:', error)
        // ✅ NEU: Fallback-Mechanismus
        this.handleMqttStoreUpdateError(error)
      }
    },

    // ✅ NEU: Error Handler für MQTT Store Updates
    handleMqttStoreUpdateError(error) {
      console.error('MQTT Store update failed:', error)

      // Versuche später erneut
      setTimeout(() => {
        try {
          this.updateMqttStore()
        } catch (retryError) {
          console.warn('MQTT Store update retry failed:', retryError.message)
        }
      }, 2000)
    },

    // Umfassender Connection Test
    async testAllConnections() {
      const results = {
        http: false,
        mqttFrontend: false,
        mqttESP32: false,
        timestamp: Date.now(),
      }

      // HTTP API Test
      try {
        const httpResponse = await fetch(`${this.httpUrl}/api/health`, { timeout: 5000 })
        results.http = httpResponse.ok
      } catch {
        console.warn('HTTP test failed')
      }

      // MQTT Frontend Test (WebSocket)
      try {
        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.CONNECTION_TEST, {
          type: 'frontend',
          timestamp: Date.now(),
        })

        // Die Verbindung wird über Events getestet
        results.mqttFrontend = true // Wird über Events aktualisiert
      } catch {
        console.warn('MQTT Frontend test failed')
      }

      // MQTT ESP32 Test (simuliert über Pi Server)
      try {
        const response = await fetch(`${this.httpUrl}/api/compatibility`, { timeout: 3000 })
        if (response.ok) {
          const data = await response.json()
          results.mqttESP32 = data.mqtt_available || false
        }
      } catch {
        console.warn('MQTT ESP32 test failed')
      }

      const overall = results.http && results.mqttFrontend

      this.lastConnectionTest = {
        success: overall,
        results,
        timestamp: Date.now(),
      }

      this.saveToStorage()

      return this.lastConnectionTest
    },

    // Connection Test (Backward Compatibility)
    async testConnection() {
      return this.testAllConnections()
    },

    // Server im Netzwerk suchen
    async scanForServers() {
      if (!this.serverIP) {
        throw new Error('Keine Basis-IP für Scan verfügbar')
      }

      const network = this.serverIP.split('.').slice(0, 3).join('.')

      // Scanne common IPs
      const commonIPs = [
        `${network}.100`,
        `${network}.101`,
        `${network}.50`,
        `${network}.200`,
        `${network}.1`,
      ]

      const scanPromises = commonIPs.map(async (ip) => {
        try {
          const response = await fetch(`http://${ip}:${this.httpPort}/api/health`, {
            timeout: 2000,
          })
          if (response.ok) {
            return { ip, name: 'Raspberry Pi Server', reachable: true }
          }
        } catch {
          // IP nicht erreichbar
        }
        return null
      })

      const results = await Promise.all(scanPromises)
      return results.filter((server) => server !== null)
    },

    // ESP32-Konfiguration für Geräte-Setup
    getESP32Configuration() {
      return {
        pi_server_ip: this.serverIP,
        pi_http_port: this.httpPort,
        mqtt_broker_ip: this.serverIP,
        mqtt_broker_port: this.mqttPortESP32, // ← Korrekt: 1883
        // Kaiser-ID wird jetzt im Remote-Kaiser-Store verwaltet
      }
    },

    // Konfiguration speichern
    async saveConfiguration() {
      this.generateUrls()
      this.saveToStorage()

      // Aktiviere neue Konfiguration
      this.useNewConfig = true

      // Update MQTT Store
      this.updateMqttStore()

      return { success: true }
    },

    // ✅ NEU: Storage-Funktionen erweitert
    saveToStorage() {
      const timestamp = new Date().toISOString()
      console.log(`🟡 [${timestamp}] SAVE called - godName: "${this.godName}"`)

      try {
        const configData = {
          // ❌ ENTFERNT: systemName: this.systemName, // REDUNDANT - wird durch godName ersetzt
          // Kaiser-Daten werden jetzt im Remote-Kaiser-Store verwaltet
          // ✅ NEU: God Pi ID Management (MASTER)
          godName: this.godName,
          godNameManuallySet: this.godNameManuallySet,
          godId: this.godId,
          godIdManuallySet: this.godIdManuallySet,
          godAsKaiser: this.godAsKaiser,
          // Bestehende Felder
          serverIP: this.serverIP,
          httpPort: this.httpPort,
          mqttPortFrontend: this.mqttPortFrontend,
          mqttPortESP32: this.mqttPortESP32,
          selectedEspId: this.selectedEspId,
          zones: this.zones,
          lastConnectionTest: this.lastConnectionTest,
          connectionQuality: this.connectionQuality,
          migratedFromEnvironment: this.migratedFromEnvironment,
          useNewConfig: this.useNewConfig,
          fallbackToOldConfig: this.fallbackToOldConfig,
        }

        console.log(`🟡 [${timestamp}] Saving config:`, configData)

        storage.save('central_config', configData)

        // PRÜFEN: Was ist WIRKLICH im localStorage?
        const verification = localStorage.getItem('central_config')
        console.log(`🟡 [${timestamp}] Verification - localStorage contains:`, verification)

        console.log('✅ CentralConfig erfolgreich gespeichert')
      } catch (error) {
        console.error(`🔴 [${timestamp}] SAVE ERROR:`, error)
        errorHandler.error('Fehler beim Speichern der CentralConfig', error)
      }
    },

    loadFromStorage() {
      const timestamp = new Date().toISOString()
      console.log(`🟢 [${timestamp}] LOADING from localStorage`)

      try {
        const stored = localStorage.getItem('central_config')
        console.log(`🟢 [${timestamp}] Raw localStorage:`, stored)

        const configData = storage.load('central_config', {})
        console.log(`🟢 [${timestamp}] Parsed config:`, configData)

        // Kaiser-Daten werden jetzt im Remote-Kaiser-Store verwaltet
        // ✅ NEU: God Pi ID Management laden
        this.godId = configData.godId || null
        this.godIdManuallySet = configData.godIdManuallySet || false
        this.godAsKaiser = configData.godAsKaiser || true

        // ✅ CLEAN CODE: Direkte Store-Zuweisung statt redundanter Function-Calls
        if (configData.godName) {
          this.godName = configData.godName
          this.godNameManuallySet = true
        }

        // ✅ CLEAN CODE: Migration von systemName zu godName - direkte Zuweisung
        if (configData.systemName && !configData.godName) {
          this.godName = configData.systemName
          this.godNameManuallySet = true
          console.log('[Migration] systemName migrated to godName:', configData.systemName)
        }

        // Bestehende Felder laden
        // ❌ ENTFERNT: this.systemName = configData.systemName || 'Gewächshaus System'
        // Kaiser-ID wird jetzt im Remote-Kaiser-Store verwaltet
        this.serverIP =
          configData.serverIP || import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198'
        this.httpPort = configData.httpPort || 8443
        this.mqttPortFrontend = configData.mqttPortFrontend || 9001
        this.mqttPortESP32 = configData.mqttPortESP32 || 1883
        this.selectedEspId = configData.selectedEspId || null
        this.zones = configData.zones || {
          available: [],
          defaultZone: '🕳️ Unkonfiguriert',
          zoneMapping: {},
          lastUpdate: null,
        }
        this.lastConnectionTest = configData.lastConnectionTest || null
        this.connectionQuality = configData.connectionQuality || 'unknown'
        this.migratedFromEnvironment = configData.migratedFromEnvironment || false
        this.useNewConfig = configData.useNewConfig !== false
        this.fallbackToOldConfig = configData.fallbackToOldConfig !== false

        // ✅ NEU: Name-zu-ID-Konsistenz-Prüfung und -Korrektur
        this.enforceNameToIdConsistency()

        // ✅ NEU: Migration von bestehenden Konfigurationen
        this.migrateFromLegacyConfig()

        // ✅ NEU: Legacy localStorage aufräumen
        this.cleanupLegacyStorage()

        // ✅ MIGRIERT: Stelle ESP-Auswahl wieder her - Event-basiert
        if (this.selectedEspId) {
          // ✅ MIGRIERT: Event-basierte Validierung statt direkter Store-Zugriff
          eventBus.emit(MQTT_EVENTS.VALIDATE_SELECTED_ESP, {
            espId: this.selectedEspId,
            timestamp: Date.now(),
          })

          // ✅ MIGRIERT: Event-basierte Validierung statt direkter Store-Zugriff
          eventBus.emit(MQTT_EVENTS.VALIDATE_SELECTED_ESP, {
            selectedEspId: this.selectedEspId,
            timestamp: Date.now(),
          })
          // Die Validierung wird über Events vom MQTT-Store bereitgestellt
        }

        console.log('✅ CentralConfig State erfolgreich wiederhergestellt')
      } catch (error) {
        console.error(`🔴 [${timestamp}] LOADING ERROR:`, error)
        errorHandler.error('Fehler beim State-Recovery', error)
      }
    },

    // Reset Konfiguration
    resetConfiguration() {
      // ✅ CLEAN CODE: Direkte Store-Zuweisung statt redundanter Function-Calls
      this.godName = 'God Pi'
      this.godId = generateGodId('God Pi')
      this.godNameManuallySet = true
      this.godIdManuallySet = false

      // Kaiser-ID wird jetzt im Remote-Kaiser-Store verwaltet
      this.serverIP = import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198'
      this.httpPort = 8443
      this.mqttPortFrontend = 9001
      this.mqttPortESP32 = 1883
      this.useNewConfig = true
      this.migratedFromEnvironment = false
      this.lastConnectionTest = null

      this.generateUrls()
      this.saveToStorage()
    },

    // ✅ NEU: Zentrale selectedEspId-Actions
    setSelectedEspId(espId) {
      this.selectedEspId = espId
      this.saveToStorage()
      console.log(`[CentralConfig] Selected ESP changed to: ${espId}`)
    },

    clearSelectedEspId() {
      this.selectedEspId = null
      this.saveToStorage()
      console.log('[CentralConfig] Selected ESP cleared')
    },

    // ✅ NEU: Automatische ESP-Auswahl beim ersten verfügbaren ESP
    autoSelectFirstEsp() {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.AUTO_SELECT_ESP, {
        currentSelectedEspId: this.selectedEspId,
        timestamp: Date.now(),
      })

      // Die ESP-Auswahl wird über Events vom MQTT-Store bereitgestellt
      // Diese Funktion wird über Events mit der ersten verfügbaren ESP-ID aktualisiert

      return this.selectedEspId
    },

    // ✅ NEU: Hierarchische Datenbank-Methoden
    async registerKaiser(kaiserId, kaiserConfig) {
      const registryEntry = {
        kaiser_id: kaiserId,
        config: kaiserConfig,
        registered_at: Date.now(),
        status: 'active',
        esp_count: 0,
      }

      this.kaiserRegistry.set(kaiserId, registryEntry)
      await this.saveKaiserRegistry()

      return { success: true, kaiser_id: kaiserId }
    },

    async updateEspOwnership(espId, newOwner) {
      this.espOwnership.set(espId, newOwner)

      // Transfer-Historie aktualisieren
      this.hierarchicalConfig.espTransferHistory.push({
        esp_id: espId,
        new_owner: newOwner,
        timestamp: Date.now(),
      })

      await this.saveEspOwnership()
      return { success: true, esp_id: espId, owner: newOwner }
    },

    async trackCommandChain(commandId, path, status = 'pending') {
      const chain = {
        command_id: commandId,
        path: path,
        status: status,
        created_at: Date.now(),
        responses: [],
      }

      this.commandChains.set(commandId, chain)
      await this.saveCommandChains()

      return chain
    },

    // ✅ NEU: Persistenz-Methoden für hierarchische Daten
    async saveKaiserRegistry() {
      try {
        const registryData = Array.from(this.kaiserRegistry.entries())
        storage.save('kaiser_registry', registryData)
        console.log('✅ Kaiser Registry gespeichert')
      } catch (error) {
        errorHandler.error('Fehler beim Speichern der Kaiser Registry', error)
      }
    },

    async saveEspOwnership() {
      try {
        const ownershipData = Array.from(this.espOwnership.entries())
        storage.save('esp_ownership', ownershipData)
        console.log('✅ ESP Ownership gespeichert')
      } catch (error) {
        errorHandler.error('Fehler beim Speichern der ESP Ownership', error)
      }
    },

    async saveCommandChains() {
      try {
        const chainData = Array.from(this.commandChains.entries())
        storage.save('command_chains', chainData)
        console.log('✅ Command Chains gespeichert')
      } catch (error) {
        errorHandler.error('Fehler beim Speichern der Command Chains', error)
      }
    },

    // ✅ NEU: Wiederherstellungs-Methoden
    async loadKaiserRegistry() {
      try {
        const registryData = storage.load('kaiser_registry', [])
        this.kaiserRegistry = new Map(registryData)
        console.log('✅ Kaiser Registry wiederhergestellt')
      } catch (error) {
        errorHandler.error('Fehler beim Laden der Kaiser Registry', error)
      }
    },

    async loadEspOwnership() {
      try {
        const ownershipData = storage.load('esp_ownership', [])
        this.espOwnership = new Map(ownershipData)
        console.log('✅ ESP Ownership wiederhergestellt')
      } catch (error) {
        errorHandler.error('Fehler beim Laden der ESP Ownership', error)
      }
    },

    async loadCommandChains() {
      try {
        const chainData = storage.load('command_chains', [])
        this.commandChains = new Map(chainData)
        console.log('✅ Command Chains wiederhergestellt')
      } catch (error) {
        errorHandler.error('Fehler beim Laden der Command Chains', error)
      }
    },

    // 🆕 NEU: Kaiser-Übernahme durch God (fügt Kaiser-ID zu adoptedKaiserIds hinzu)
    adoptKaiserId(kaiserId) {
      if (!this.adoptedKaiserIds.includes(kaiserId)) {
        this.adoptedKaiserIds.push(kaiserId)
      }
    },
    // 🆕 NEU: Kaiser-Freigabe durch God (entfernt Kaiser-ID aus adoptedKaiserIds)
    releaseKaiserId(kaiserId) {
      this.adoptedKaiserIds = this.adoptedKaiserIds.filter((id) => id !== kaiserId)
    },

    // 🎨 NEU: Kaiser-Farb-System für Multi-Kaiser Visualisierung
    getKaiserColor(kaiserId) {
      const kaiserColors = {
        raspberry_pi_central: 'amber', // God Pi (Gold/Amber)
        kaiser_haus: 'blue', // Haus Controller
        kaiser_garten: 'green', // Garten Controller
        kaiser_keller: 'purple', // Keller Controller
        kaiser_garage: 'orange', // Garage Controller
        kaiser_werkstatt: 'red', // Werkstatt Controller
      }
      return kaiserColors[kaiserId] || 'grey'
    },

    getKaiserDisplayName(kaiserId) {
      const kaiserNames = {
        raspberry_pi_central: 'God Pi',
        kaiser_haus: 'Haus Controller',
        kaiser_garten: 'Garten Controller',
        kaiser_keller: 'Keller Controller',
        kaiser_garage: 'Garage Controller',
        kaiser_werkstatt: 'Werkstatt Controller',
      }
      return kaiserNames[kaiserId] || kaiserId
    },

    // ESP-zu-Kaiser Zuordnung ermitteln
    getKaiserForEsp(espId) {
      // Prüfe erst die explizite Kaiser-Zuordnung
      const kaiserId = this.espDevices[espId]?.kaiserId
      if (kaiserId) return kaiserId

      // Fallback: Remote Kaiser als Standard
      return 'remote_kaiser'
    },

    // ESPs in einer Zone ermitteln
    getEspsInZone(zoneName) {
      const espsInZone = []
      for (const [espId, espData] of Object.entries(this.espDevices)) {
        if (espData.zone === zoneName) {
          espsInZone.push(espId)
        }
      }
      return espsInZone
    },

    // ✅ NEU: Event-Listener für Event-basierte Kommunikation
    initializeEventListeners() {
      // Kaiser-Events werden jetzt im Remote-Kaiser-Store verwaltet

      // Listener für Config-Update
      eventBus.on(MQTT_EVENTS.CONFIG_UPDATE, (newConfig) => {
        if (newConfig && typeof this.updateConfig === 'function') {
          this.updateConfig(newConfig)
        }
      })

      // 🆕 NEU: Zusätzliche Event-Handler für CentralConfig Events
      eventBus.on(MQTT_EVENTS.REQUEST_ESP_DATA, (data) => this.handleRequestEspData(data))
      eventBus.on(MQTT_EVENTS.REQUEST_ALL_ESP_IDS, (data) => this.handleRequestAllEspIds(data))
      eventBus.on(MQTT_EVENTS.REQUEST_CONFIG, (data) => this.handleRequestConfig(data))
      // ❌ ENTFERNT: Redundanter God-Config-Event-Listener - MindMap ist der einzige Master
      // Kaiser-Events werden jetzt im Remote-Kaiser-Store verwaltet
      eventBus.on(MQTT_EVENTS.SENSORS_CONFIGURED, (data) => this.handleSensorsConfigured(data))
      eventBus.on(MQTT_EVENTS.ACTUATORS_CONFIGURED, (data) => this.handleActuatorsConfigured(data))
      eventBus.on(MQTT_EVENTS.ESP_SELECTION, (data) => this.handleEspSelection(data))

      // ✅ NEU: Antwort-Events für Store-zu-Store Kommunikation
      // Kaiser-ID-Konflikte werden jetzt im Remote-Kaiser-Store verwaltet
      eventBus.on(MQTT_EVENTS.ESP_VALIDATION_RESULT, (data) => this.handleEspValidationResult(data))
      eventBus.on(MQTT_EVENTS.AUTO_SELECT_ESP_RESULT, (data) =>
        this.handleAutoSelectEspResult(data),
      )

      console.log('✅ CentralConfig Event-Listener initialisiert')
    },

    // 🆕 NEU: Event-Handler für CentralConfig Events
    handleRequestEspData(data) {
      try {
        console.log('[CentralConfig] Request ESP data received:', data)
        const espData = this.getEspData(data.espId)
        eventBus.emit(MQTT_EVENTS.REQUEST_ESP_DATA, {
          espId: data.espId,
          data: espData,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle request ESP data', error, { data })
      }
    },

    handleRequestAllEspIds(data) {
      try {
        console.log('[CentralConfig] Request all ESP IDs received:', data)
        const espIds = Object.keys(this.espDevices)
        eventBus.emit(MQTT_EVENTS.REQUEST_ALL_ESP_IDS, {
          espIds: espIds,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle request all ESP IDs', error, { data })
      }
    },

    handleRequestConfig(data) {
      try {
        console.log('[CentralConfig] Request config received:', data)
        const config = this.getCurrentConfig()
        eventBus.emit(MQTT_EVENTS.REQUEST_CONFIG, {
          config: config,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle request config', error, { data })
      }
    },

    // ❌ ENTFERNT: Redundanter God-Config-Event-Handler - MindMap ist der einzige Master

    handleKaiserConfigUpdate(data) {
      try {
        console.log('[CentralConfig] Kaiser config update received:', data)
        // Kaiser-Konfiguration wird jetzt im Remote-Kaiser-Store verwaltet
        console.log('Kaiser config update redirected to Remote-Kaiser-Store:', data)
      } catch (error) {
        errorHandler.error('Failed to handle Kaiser config update', error, { data })
      }
    },

    handleSensorsConfigured(data) {
      try {
        console.log('[CentralConfig] Sensors configured received:', data)
        this.updateSensorsConfiguration(data)
      } catch (error) {
        errorHandler.error('Failed to handle sensors configured', error, { data })
      }
    },

    handleActuatorsConfigured(data) {
      try {
        console.log('[CentralConfig] Actuators configured received:', data)
        this.updateActuatorsConfiguration(data)
      } catch (error) {
        errorHandler.error('Failed to handle actuators configured', error, { data })
      }
    },

    handleEspSelection(data) {
      try {
        console.log('[CentralConfig] ESP selection received:', data)
        this.setSelectedEspId(data.espId)
      } catch (error) {
        errorHandler.error('Failed to handle ESP selection', error, { data })
      }
    },

    // ✅ NEU: Antwort-Handler für Store-zu-Store Kommunikation
    // Kaiser-ID-Konflikte werden jetzt im Remote-Kaiser-Store verwaltet

    handleEspValidationResult(data) {
      try {
        console.log('[CentralConfig] ESP validation result received:', data)
        if (!data.isValid && data.selectedEspId === this.selectedEspId) {
          this.selectedEspId = null // Reset wenn ESP nicht mehr verfügbar
          console.log('Selected ESP is no longer valid, resetting selection')
        }
      } catch (error) {
        errorHandler.error('Failed to handle ESP validation result', error, { data })
      }
    },

    handleAutoSelectEspResult(data) {
      try {
        console.log('[CentralConfig] Auto select ESP result received:', data)
        if (data.selectedEspId && !this.selectedEspId) {
          this.setSelectedEspId(data.selectedEspId)
          console.log(`Auto-selected ESP: ${data.selectedEspId}`)
        }
      } catch (error) {
        errorHandler.error('Failed to handle auto select ESP result', error, { data })
      }
    },

    // 🆕 NEU: Helper-Methoden für Event-Handler
    getEspData(espId) {
      return this.espDevices[espId] || null
    },

    getCurrentConfig() {
      return {
        // Kaiser-ID wird jetzt im Remote-Kaiser-Store verwaltet
        godName: this.godName,
        godId: this.godId,
        zones: this.zones,
        espDevices: this.espDevices,
      }
    },

    // ❌ ENTFERNT: Redundante updateGodConfig Funktion - MindMap ist der einzige Master

    updateKaiserConfig(config) {
      // Kaiser-Konfiguration wird jetzt im Remote-Kaiser-Store verwaltet
      console.log('Kaiser config update redirected to Remote-Kaiser-Store:', config)
    },

    updateSensorsConfiguration(data) {
      // Implementierung für Sensor-Konfiguration Update
      console.log('Sensors configuration updated:', data)
    },

    updateActuatorsConfiguration(data) {
      // Implementierung für Aktuator-Konfiguration Update
      console.log('Actuators configuration updated:', data)
    },

    // ✅ NEU: Subzone-Management-Methoden
    setSubzoneForEsp(espId, subzoneId, zoneName, kaiserId = null) {
      const targetKaiserId = kaiserId || 'remote_kaiser' // Kaiser-ID wird jetzt im Remote-Kaiser-Store verwaltet

      // Subzone-Hierarchie aktualisieren
      if (!this.zones.subzoneHierarchy[zoneName]) {
        this.zones.subzoneHierarchy[zoneName] = {}
      }

      if (!this.zones.subzoneHierarchy[zoneName][espId]) {
        this.zones.subzoneHierarchy[zoneName][espId] = []
      }

      // Subzone hinzufügen (remove from old zones first)
      this.removeSubzoneFromAllZones(subzoneId)
      this.zones.subzoneHierarchy[zoneName][espId].push(subzoneId)

      // Cross-Zone-Subzone-Index aktualisieren
      this.zones.crossZoneSubzones.allSubzones.set(subzoneId, {
        espId,
        zone: zoneName,
        kaiserId: targetKaiserId,
      })

      // Event für Subzone-Änderung
      eventBus.emit(MQTT_EVENTS.SUBZONE_HIERARCHY_UPDATE, {
        subzoneId,
        zoneName,
        espId,
        kaiserId: targetKaiserId,
      })
    },

    getSubzonesInZone(zoneName) {
      // Alle Subzones in einer Zone
      const zoneHierarchy = this.zones.subzoneHierarchy[zoneName]
      if (!zoneHierarchy) return []

      return Object.entries(zoneHierarchy).flatMap(([espId, subzones]) =>
        subzones.map((subzoneId) => ({
          subzoneId,
          espId,
          zone: zoneName,
          kaiserId: 'remote_kaiser', // Kaiser-ID wird jetzt im Remote-Kaiser-Store verwaltet
        })),
      )
    },

    getCrossZoneSubzones() {
      // Alle Subzones über Zonen hinweg
      return Array.from(this.zones.crossZoneSubzones.allSubzones.entries()).map(
        ([subzoneId, data]) => ({
          subzoneId,
          ...data,
        }),
      )
    },

    removeSubzoneFromAllZones(subzoneId) {
      // Subzone aus allen Zonen entfernen
      Object.keys(this.zones.subzoneHierarchy).forEach((zoneName) => {
        Object.keys(this.zones.subzoneHierarchy[zoneName]).forEach((espId) => {
          const subzones = this.zones.subzoneHierarchy[zoneName][espId]
          const index = subzones.indexOf(subzoneId)
          if (index > -1) {
            subzones.splice(index, 1)
          }
        })
      })

      // Aus Cross-Zone-Index entfernen
      this.zones.crossZoneSubzones.allSubzones.delete(subzoneId)
    },

    getSubzonesByDeviceType(deviceType) {
      // Alle Subzones eines bestimmten Device-Typs
      return this.zones.crossZoneSubzones.byDeviceType[deviceType] || []
    },

    getSubzonesByLogicComplexity(complexity) {
      // Alle Subzones einer bestimmten Logic-Komplexität
      return this.zones.crossZoneSubzones.byLogicComplexity[complexity] || []
    },

    updateSubzoneDeviceType(subzoneId, deviceType) {
      // Device-Type für Subzone aktualisieren
      const subzoneInfo = this.zones.crossZoneSubzones.allSubzones.get(subzoneId)
      if (subzoneInfo) {
        subzoneInfo.deviceType = deviceType

        // By Device Type Index aktualisieren
        if (deviceType === 'sensor' || deviceType.includes('SENSOR')) {
          this.zones.crossZoneSubzones.byDeviceType.sensors.push(subzoneInfo)
        } else if (deviceType === 'actuator' || deviceType.includes('ACTUATOR')) {
          this.zones.crossZoneSubzones.byDeviceType.actuators.push(subzoneInfo)
        }
      }
    },

    updateSubzoneLogicComplexity(subzoneId, complexity) {
      // Logic-Komplexität für Subzone aktualisieren
      const subzoneInfo = this.zones.crossZoneSubzones.allSubzones.get(subzoneId)
      if (subzoneInfo) {
        subzoneInfo.logicComplexity = complexity

        // By Logic Complexity Index aktualisieren
        if (['low', 'medium', 'high'].includes(complexity)) {
          this.zones.crossZoneSubzones.byLogicComplexity[complexity].push(subzoneInfo)
        }
      }
    },
  },

  // ✅ NEU: Store-Initialisierung mit Event-Listenern
  setup() {
    // Event-Listener beim Store-Setup registrieren
    this.initializeEventListeners()

    // ✅ NEU: Store im Event-System registrieren
    storeHandler.registerStore('centralConfig', this)

    // ❌ ENTFERNT: Zirkuläre Event-Emission
    // eventBus.emit(STORE_EVENTS.STORE_READY, {
    //   storeName: 'centralConfig',
    //   timestamp: Date.now(),
    // })

    return {}
  },
})
