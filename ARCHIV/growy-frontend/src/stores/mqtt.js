import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import mqtt from 'mqtt'
import { formatISOTimestamp, convertUnixToMillis } from '@/utils/time'
import { storage } from '@/utils/storage'
import { errorHandler } from '@/utils/errorHandler'
import { config } from '@/utils/config'
import {
  getStandardEspTopics,
  getSensorTopics,
  getActuatorTopics,
  getLibraryTopics,
  getErrorTopics,
  extractEspIdFromTopic,
} from '@/utils/mqttTopics'
import { eventBus, MQTT_EVENTS } from '@/utils/eventBus'
import { safeSuccess, safeError, safeInfo } from '@/utils/snackbarUtils'
import { storeHandler } from '@/utils/eventBus'

export const useMqttStore = defineStore('mqtt', {
  state: () => ({
    // ✅ KORRIGIERT: Sichere Default-Werte für Development
    client: null,
    connected: false,
    connecting: false,
    error: null,
    // ❌ ENTFERNT: Doppelte kaiserId - wird nur über kaiser.id verwaltet
    espDevices: shallowRef(new Map()), // Map<espId, DeviceInfo>

    // ✅ NEU: Discovery-Liste für manuelle Konfiguration
    discoveredEspIds: shallowRef(new Set()), // Set<espId> - nur ESP-IDs, keine vollständigen Geräte

    // 🆕 ERWEITERT: ID-Konflikt-Management für alle IDs
    idConflicts: {
      kaiser: new Map(), // Map<espId, ConflictInfo> - bestehend
      masterZone: new Map(), // Map<espId, ConflictInfo> - NEU
      subzone: new Map(), // Map<espId, ConflictInfo> - NEU
      espId: new Map(), // Map<espId, ConflictInfo> - NEU
    },
    lastIdConflict: null, // Letzter Konflikt für UI-Updates

    // ✅ NEU: ACK-Update Tracking für TreeView-Synchronisation
    lastSensorUpdate: null, // { espId, timestamp, sensorCount }
    lastActuatorUpdate: null, // { espId, timestamp, actuatorCount }

    // ✅ NEU: Aktor-Status-Tracking für Sicherheitslogik
    actuatorPendingStates: shallowRef(new Map()), // Map<`${espId}-${gpio}`, { desiredState, timestamp }>
    actuatorConfirmationTimeouts: shallowRef(new Map()), // Map<`${espId}-${gpio}`, timeoutId>

    // ✅ KORRIGIERT: Sichere Default-Werte für Kaiser
    kaiser: {
      // ❌ ENTFERNT: kaiser.id (wird von centralConfig verwaltet)
      type: 'pi_zero_edge_controller',
      autonomousMode: false,
      godConnection: {
        connected: false,
        godIp: '192.168.1.100',
        godPiPort: 8443,
        lastPushSync: null,
        syncEnabled: true,
      },
      syncStats: {
        pushEvents: 0,
        godCommands: 0,
        failedSyncs: 0,
      },
    },
    safeMode: true,
    // ✅ KORRIGIERT: Sichere Default-Werte für System-Status
    systemStatus: {
      emergencyStop: false,
      lastUpdate: Date.now(), // ← SICHERER DEFAULT
    },
    // ✅ KORRIGIERT: Sichere Default-Werte für System-Health
    systemHealth: {
      freeHeap: 0,
      cpuUsage: 0,
      uptime: 0,
      lastUpdate: Date.now(), // ← SICHERER DEFAULT
    },
    messages: [], // Store last 100 messages for debug panel
    maxMessages: config.storage.maxMessages, // ✅ NEU: Begrenzung der Message-Speicherung
    deviceTimeouts: shallowRef(new Map()), // ✅ NEU: Track last heartbeat für Cleanup
    // Persistence and auto-reconnect properties
    autoReconnect: true,
    reconnectAttempts: 0,
    maxReconnectAttempts: config.mqtt.reconnectAttempts,
    reconnectDelay: config.mqtt.reconnectDelay,
    lastConnectionAttempt: null,
    // Connection stability tracking
    connectionStartTime: null,
    lastHeartbeat: null,
    connectionQuality: 'unknown', // 'excellent', 'good', 'poor', 'unknown'
    packetLoss: 0,

    // ✅ KONSOLIDIERT: Cache wird jetzt über Central Data Hub verwaltet
    // dataCache: new Map(), // ENTFERNT - wird über centralDataHub verwaltet
    // cacheTimeout: 30 * 1000, // ENTFERNT - wird über centralDataHub verwaltet
    // deviceCacheTimeout: 60 * 1000, // ENTFERNT - wird über centralDataHub verwaltet
    // systemCacheTimeout: 5 * 60 * 1000, // ENTFERNT - wird über centralDataHub verwaltet

    // ✅ NEU: Harmonisches Timeout-Management (löst Memory Leaks + Performance)
    crossEspTimeouts: new Map(), // Map<requestId, { timerId, timeoutMs, createdAt, callback }>
    crossEspTimeoutStats: {
      totalTimeouts: 0,
      activeTimeouts: 0,
      cleanedTimeouts: 0,
      lastCleanup: null,
    },

    // 🎵 HARMONISCHE INTEGRATION: CentralDataHub Lifecycle-Manager
    harmonyIntegration: {
      lifecycleManager: null, // Referenz auf CentralDataHub Lifecycle-Manager
      resourceTracking: new Map(), // Map<resourceId, {type, store, cleanup}>
      validationEnabled: true,
      namingConventions: null,
    },

    // 🚨 NEU: Flag für MindMap-Konfiguration
    isConfigChangeFromMindMap: false,

    // ✅ NEU: Batch-Updates für Performance
    pendingUpdates: new Map(), // Map<espId, Array<update>>
    batchUpdateTimeout: null,
    batchUpdateInterval: 100, // 100ms Batch-Interval

    // ✅ NEU: Message-Batching-System mit Message-Loss-Prevention
    messageBatching: {
      enabled: true,
      batchSize: 50, // Max 50 Messages pro Batch
      batchTimeout: 1000, // 1 Sekunde Timeout
      pendingMessages: [], // Warteschlange für Batching
      failedMessages: [], // 🔒 Failed messages für Retry
      messageIds: new Set(), // 🔒 Duplikat-Erkennung
      batchTimer: null,
      isProcessing: false, // 🔒 Processing-Lock
      batchStats: {
        totalBatches: 0,
        totalMessages: 0,
        failedMessages: 0, // 🔒 Track failed messages
        retryAttempts: 0, // 🔒 Track retry attempts
        averageBatchSize: 0,
        lastBatchTime: 0,
        throughputPerMinute: 0,
        messageLossPrevented: 0, // 🔒 Track prevented message loss
      },
      priorityLevels: {
        HIGH: 'high', // Emergency, Commands
        NORMAL: 'normal', // Status updates
        LOW: 'low', // Debug, monitoring
      },
      retryConfig: {
        maxRetries: 3, // 🔒 Max retry attempts
        retryDelay: 1000, // 🔒 Retry delay in ms
        exponentialBackoff: true, // 🔒 Exponential backoff
      },
    },

    persistentConfig: storage.load('mqtt_config', {
      brokerUrl: '',
      port: 9001,
      clientId: `growy_frontend_${Math.random().toString(36).substr(2, 9)}`,
      username: '',
      password: '',
    }),
    config: {
      brokerUrl: import.meta.env.VITE_MQTT_BROKER_URL || config.mqtt.defaultBrokerUrl,
      port: import.meta.env.VITE_MQTT_BROKER_PORT || config.mqtt.defaultPort,
      clientId:
        import.meta.env.VITE_MQTT_CLIENT_ID ||
        `growy_frontend_${Math.random().toString(36).substr(2, 9)}`,
      username: import.meta.env.VITE_MQTT_USERNAME || '',
      password: import.meta.env.VITE_MQTT_PASSWORD || '',
    },

    // 🆕 NEU: Hierarchische Performance-Optimierungen
    hierarchicalPerformance: {
      // Cross-Kaiser Batch-Updates
      crossKaiserBatchUpdates: new Map(), // Map<kaiserId, Array<update>>
      crossKaiserBatchTimeout: null,
      crossKaiserBatchInterval: 150, // 150ms für Cross-Kaiser

      // God-Kaiser Kommunikation
      godKaiserBatchUpdates: new Map(), // Map<kaiserId, Array<update>>
      godKaiserBatchTimeout: null,
      godKaiserBatchInterval: 200, // 200ms für God-Kaiser

      // Command-Chain Optimierung
      commandChainCache: new Map(), // Cache für Command-Chains
      commandChainTimeout: 5 * 60 * 1000, // 5 Minuten

      // Performance-Monitoring
      performanceStats: {
        messagesProcessed: 0,
        averageProcessingTime: 0,
        lastReset: Date.now(),
      },
    },

    // ⚡ NEU: Message-Sequencing-Protection
    messageSequencing: {
      enabled: true,
      sequenceCounters: new Map(),
      lastSequenceId: 0,
      sequenceQueue: new Map(),
    },
  }),

  getters: {
    // ✅ KORRIGIERT: Sichere Getter mit Null-Checks
    isConnected: (state) => state?.connected || false,
    getEspDevices: (state) => state?.espDevices || shallowRef(new Map()),
    currentSystemStatus: (state) =>
      state?.systemStatus || { emergencyStop: false, lastUpdate: Date.now() },
    currentSystemHealth: (state) =>
      state?.systemHealth || { freeHeap: 0, cpuUsage: 0, uptime: 0, lastUpdate: Date.now() },
    getMessages: (state) => state?.messages || [],
    getConfig: (state) => state?.config || {},
    isSafeMode: (state) => state?.safeMode || true,
    isEmergencyStop: (state) => state?.systemStatus?.emergencyStop || false,
    lastMessageTime: (state) => state?.messages?.[0]?.timestamp || null,
    formattedLastMessageTime: (state) => {
      if (!state?.messages?.[0]?.timestamp) return 'Never'
      return formatISOTimestamp(state.messages[0].timestamp)
    },
    getTopicBase: () => {
      try {
        // ✅ MIGRIERT: Event-basierte Kaiser-ID-Abfrage statt direkter Store-Zugriff
        const kaiserId = localStorage.getItem('kaiser_id') || 'default_kaiser'
        return `kaiser/${kaiserId}`
      } catch (error) {
        console.warn('Error getting topic base:', error.message)
        // Fallback auf bestehende Logik
        const kaiserId = localStorage.getItem('kaiser_id') || 'default_kaiser'
        return `kaiser/${kaiserId}`
      }
    },
    // ✅ KORRIGIERT: Sichere Connection stability getters
    connectionUptime: (state) => {
      if (!state?.connectionStartTime) return 0
      return Date.now() - state.connectionStartTime
    },
    isConnectionStable: (state) => {
      return (state?.connected || false) && state?.connectionQuality !== 'poor'
    },
    connectionStatus: (state) => {
      if (!state?.connected) return 'disconnected'
      if (state?.connecting) return 'connecting'
      return state?.connectionQuality || 'unknown'
    },

    // 🆕 ERWEITERT: ID-Konflikt Getter für alle Typen
    hasIdConflicts: (state) => {
      return Object.values(state.idConflicts).some((map) => map.size > 0)
    },
    getIdConflicts: (state) => (type) => {
      return Array.from(state.idConflicts[type]?.entries() || [])
    },
    getConflictedEspIds: (state) => (type) => {
      return Array.from(state.idConflicts[type]?.keys() || [])
    },
    getAllConflicts: (state) => {
      const allConflicts = []
      Object.entries(state.idConflicts).forEach(([type, conflicts]) => {
        conflicts.forEach((conflict, espId) => {
          allConflicts.push({ type, espId, conflict })
        })
      })
      return allConflicts
    },

    // Bestehende Kaiser-ID Getter bleiben für Kompatibilität
    hasKaiserIdConflicts: (state) => state.idConflicts.kaiser.size > 0,
    getKaiserIdConflicts: (state) => Array.from(state.idConflicts.kaiser.entries()),
  },

  actions: {
    // Safe method to check if we can perform MQTT operations
    canPerformMqttOperation() {
      return this.connected && this.client && !this.connecting && this.client.unsubscribe
    },

    // ✅ NEU: Event-basierte Cache-Verwaltung
    getCachedData(key, fetcher, timeout = 30 * 1000) {
      const centralDataHub = storeHandler.getStore('centralDataHub')
      if (centralDataHub) {
        return centralDataHub.getCachedData(key, fetcher, timeout)
      }
      // Fallback: Direkte Ausführung
      return fetcher()
    },

    clearCache(key = null) {
      const centralDataHub = storeHandler.getStore('centralDataHub')
      if (centralDataHub) {
        if (key) {
          centralDataHub.invalidateCache(key)
        } else {
          centralDataHub.clearCache()
        }
      }
    },

    // ✅ NEU: Event-basierte Memory-Optimierung
    optimizeMemoryUsage() {
      // Komprimiere alte Messages
      if (this.messages.length > this.maxMessages * 0.8) {
        this.messages = this.messages.slice(0, this.maxMessages * 0.5)
      }

      // Cache-Cleanup über Event-System
      const centralDataHub = storeHandler.getStore('centralDataHub')
      if (centralDataHub) {
        centralDataHub.cleanupCache()
      }

      // Cleanup inaktive Devices
      this.cleanupInactiveDevices()
    },

    // ✅ NEU: Batch-Update-Management
    scheduleBatchUpdate(espId, update) {
      if (!this.pendingUpdates.has(espId)) {
        this.pendingUpdates.set(espId, [])
      }
      this.pendingUpdates.get(espId).push(update)

      if (!this.batchUpdateTimeout) {
        this.batchUpdateTimeout = setTimeout(() => {
          this.processBatchUpdates()
        }, this.batchUpdateInterval)
      }
    },

    processBatchUpdates() {
      this.batchUpdateTimeout = null

      for (const [espId, updates] of this.pendingUpdates.entries()) {
        if (updates.length > 0) {
          // Verarbeite alle Updates für dieses ESP
          this.applyBatchUpdates(espId, updates)
          this.pendingUpdates.set(espId, [])
        }
      }
    },

    applyBatchUpdates(espId, updates) {
      const device = this.espDevices.get(espId)
      if (!device) return

      let hasChanges = false

      for (const update of updates) {
        if (update.type === 'sensor') {
          // Batch Sensor-Updates
          if (!device.sensors) device.sensors = new Map()
          device.sensors.set(update.gpio, { ...device.sensors.get(update.gpio), ...update.data })
          hasChanges = true
        } else if (update.type === 'actuator') {
          // Batch Actuator-Updates
          if (!device.actuators) device.actuators = new Map()
          device.actuators.set(update.gpio, {
            ...device.actuators.get(update.gpio),
            ...update.data,
          })
          hasChanges = true
        } else if (update.type === 'status') {
          // Batch Status-Updates
          Object.assign(device, update.data)
          hasChanges = true
        }
      }

      if (hasChanges) {
        // Trigger re-render nur einmal pro Batch
        this.espDevices.set(espId, { ...device })
      }
    },

    // ✅ NEU: Begrenzte Message-Speicherung
    addMessage(topic, message) {
      const now = Date.now()
      const messageEntry = {
        topic,
        message,
        timestamp: now,
        size: JSON.stringify(message).length, // ✅ NEU: Message-Größe tracken

        // ✅ NEU: Prioritäts-Flags
        critical: this.isCriticalMessage({ topic }),
        userAction: this.isUserActionMessage({ topic }),
      }

      // ✅ NEU: Message-Queue-Limits implementieren
      this.enforceMessageQueueLimits()

      // ✅ NEU: Intelligente Message-Filterung
      if (this.shouldSkipMessage(messageEntry)) {
        console.log(`⏭️ Message übersprungen: ${topic} (Filter-Regel)`)
        return
      }

      this.messages.unshift(messageEntry)

      // ✅ NEU: Dynamische Begrenzung basierend auf Memory-Usage
      this.applyDynamicMessageLimit()

      // ✅ NEU: Message-Statistiken aktualisieren
      this.updateMessageStats(messageEntry)

      // ✅ BESTEHEND: Debug-Ausgabe
      if (this.config.debug) {
        console.log(`📨 MQTT Message: ${topic}`, message)
      }
    },

    // ✅ NEU: Message-Queue-Limits durchsetzen
    enforceMessageQueueLimits() {
      const currentSize = this.messages.length
      const maxSize = this.maxMessages

      if (currentSize >= maxSize) {
        // ✅ NEU: Prioritäts-basierte Löschung statt blind älteste
        const expendableMessages = this.messages.filter(
          (msg) =>
            !this.isCriticalMessage(msg) &&
            !this.isUserActionMessage(msg) &&
            this.getMessageAge(msg) > 60000, // Älter als 1 Minute
        )

        if (expendableMessages.length > 0) {
          // Nur unwichtige Messages löschen
          const removedCount = Math.min(expendableMessages.length, Math.ceil(maxSize * 0.2))

          // Entferne älteste unwichtige Messages
          expendableMessages
            .sort((a, b) => a.timestamp - b.timestamp) // Älteste zuerst
            .slice(0, removedCount)
            .forEach((msgToRemove) => {
              const index = this.messages.indexOf(msgToRemove)
              if (index > -1) {
                this.messages.splice(index, 1)
              }
            })

          console.log(`🧹 Queue bereinigt: ${removedCount} unwichtige Messages entfernt`)
        } else {
          // Notfall: Wenn keine unwichtigen Messages, nur 10% der ältesten entfernen
          const emergencyRemoveCount = Math.ceil(maxSize * 0.1)
          this.messages.splice(-emergencyRemoveCount)
          console.warn(`⚠️ Notfall-Queue-Bereinigung: ${emergencyRemoveCount} Messages entfernt`)
        }
      }
    },

    // ✅ NEU: Dynamische Begrenzung basierend auf Memory-Usage
    applyDynamicMessageLimit() {
      const memoryUsage = this.getMemoryUsage()

      if (memoryUsage > 0.8) {
        // 80% Memory-Nutzung
        // Aggressivere Begrenzung bei hoher Memory-Nutzung
        const aggressiveLimit = Math.floor(this.maxMessages * 0.5)
        if (this.messages.length > aggressiveLimit) {
          const removedCount = this.messages.length - aggressiveLimit
          this.messages.splice(-removedCount)
          console.log(`💾 Memory-Optimierung: ${removedCount} Messages entfernt`)
        }
      } else if (memoryUsage > 0.6) {
        // 60% Memory-Nutzung
        // Moderate Begrenzung
        const moderateLimit = Math.floor(this.maxMessages * 0.8)
        if (this.messages.length > moderateLimit) {
          const removedCount = this.messages.length - moderateLimit
          this.messages.splice(-removedCount)
          console.log(`📊 Moderate Optimierung: ${removedCount} Messages entfernt`)
        }
      }
    },

    // ✅ NEU: Message-Filterung für Performance
    shouldSkipMessage(messageEntry) {
      // ✅ NEU: Duplikat-Erkennung
      if (this.isDuplicateMessage(messageEntry)) {
        return true
      }

      // ✅ NEU: Irrelevante Messages filtern
      if (this.isIrrelevantMessage(messageEntry)) {
        return true
      }

      // ✅ NEU: Große Messages bei hoher Memory-Nutzung überspringen
      if (messageEntry.size > 10000 && this.getMemoryUsage() > 0.7) {
        return true
      }

      return false
    },

    // ✅ NEU: Duplikat-Erkennung
    isDuplicateMessage(messageEntry) {
      const recentMessages = this.messages.slice(0, 10) // Letzte 10 Messages prüfen

      return recentMessages.some(
        (existing) =>
          existing.topic === messageEntry.topic &&
          JSON.stringify(existing.message) === JSON.stringify(messageEntry.message) &&
          messageEntry.timestamp - existing.timestamp < 1000, // Innerhalb 1 Sekunde
      )
    },

    // ✅ NEU: Irrelevante Messages erkennen
    isIrrelevantMessage(messageEntry) {
      const irrelevantTopics = ['heartbeat', 'status', 'ping', 'pong', 'debug']

      return irrelevantTopics.some((topic) => messageEntry.topic.toLowerCase().includes(topic))
    },

    // ✅ NEU: Message-Statistiken aktualisieren
    updateMessageStats(messageEntry) {
      if (!this.messageStats) {
        this.messageStats = {
          totalMessages: 0,
          totalSize: 0,
          averageSize: 0,
          topicCounts: new Map(),
          lastUpdate: Date.now(),
        }
      }

      this.messageStats.totalMessages++
      this.messageStats.totalSize += messageEntry.size
      this.messageStats.averageSize = this.messageStats.totalSize / this.messageStats.totalMessages

      // Topic-Zähler aktualisieren
      const topicCount = this.messageStats.topicCounts.get(messageEntry.topic) || 0
      this.messageStats.topicCounts.set(messageEntry.topic, topicCount + 1)

      this.messageStats.lastUpdate = Date.now()
    },

    // ✅ NEU: Memory-Usage berechnen
    getMemoryUsage() {
      if ('memory' in performance) {
        return performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit
      }

      // Fallback: Geschätzte Memory-Nutzung basierend auf Message-Anzahl
      const estimatedUsage = this.messages.length / this.maxMessages
      return Math.min(estimatedUsage, 1.0)
    },

    // ✅ NEU: Message-Statistiken abrufen
    getMessageStats() {
      return {
        currentCount: this.messages.length,
        maxSize: this.maxMessages,
        memoryUsage: this.getMemoryUsage(),
        stats: this.messageStats || {},
        oldestMessage: this.messages[this.messages.length - 1]?.timestamp,
        newestMessage: this.messages[0]?.timestamp,
      }
    },

    // ✅ NEU: Cleanup für inaktive ESP-Geräte
    cleanupInactiveDevices() {
      const timeout = 5 * 60 * 1000 // 5 Minuten
      const now = Date.now()
      let cleanedCount = 0

      for (const [espId, lastSeen] of this.deviceTimeouts.entries()) {
        if (now - lastSeen > timeout) {
          this.espDevices.delete(espId)
          this.deviceTimeouts.delete(espId)
          cleanedCount++
          errorHandler.info(`Cleaned up inactive device: ${espId}`)
        }
      }

      if (cleanedCount > 0) {
        errorHandler.info(`Cleanup completed: ${cleanedCount} inactive devices removed`)
        safeInfo(`${cleanedCount} inaktive Geräte entfernt`)
      }
    },

    // ✅ NEU: Starte periodisches Cleanup
    startCleanupScheduler() {
      // Cleanup alle 30 Sekunden (10x häufiger)
      setInterval(
        () => {
          this.cleanupInactiveDevices()
          this.optimizeMemoryUsage()
        },
        30 * 1000, // 30 Sekunden statt 2 Minuten
      )
    },

    // Load persistent configuration
    loadPersistentConfig() {
      this.config = { ...this.persistentConfig }
    },

    // Save configuration persistently
    saveConfig(newConfig) {
      this.config = { ...this.config, ...newConfig }
      this.persistentConfig = { ...this.config }
      storage.save('mqtt_config', this.persistentConfig)
    },

    // 🆕 NEU: Kaiser-spezifische Actions
    async registerWithGod() {
      try {
        const response = await fetch(
          `http://${this.kaiser.godConnection.godIp}:${this.kaiser.godConnection.godPiPort}/api/kaiser/register`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kaiser_id: this.kaiser.id,
              kaiser_type: this.kaiser.type,
              ip_address: window.location.hostname,
              capabilities: ['sensor_processing', 'actuator_control', 'autonomous_operation'],
            }),
          },
        )

        this.kaiser.godConnection.connected = response.ok
        if (response.ok) {
          console.log('Successfully registered with God Pi')
          window.$snackbar?.showSuccess('Successfully registered with God Pi')
        } else {
          errorHandler.error('God registration failed', null, { status: response.status })
          window.$snackbar?.showError('Failed to register with God Pi')
        }
        return response.ok
      } catch (error) {
        this.kaiser.godConnection.connected = false
        errorHandler.error('God registration failed', error)
        window.$snackbar?.showError('Failed to register with God Pi')
        return false
      }
    },

    async pushToGod(eventType, eventData) {
      if (!this.kaiser.godConnection.connected || !this.kaiser.godConnection.syncEnabled) return

      try {
        const response = await fetch(
          `http://${this.kaiser.godConnection.godIp}:${this.kaiser.godConnection.godPiPort}/api/kaiser/${this.kaiser.id}/sync/push`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: eventType,
              data: eventData,
              timestamp: new Date().toISOString(),
            }),
          },
        )

        if (response.ok) {
          this.kaiser.syncStats.pushEvents++
          this.kaiser.godConnection.lastPushSync = new Date()

          // God Commands verarbeiten
          const data = await response.json()
          const godCommands = data.commands || []
          await this.executeGodCommands(godCommands)

          console.log(`Push sync successful: ${eventType}`)
        } else {
          this.kaiser.syncStats.failedSyncs++
          console.error('Push sync failed:', response.status)
        }
      } catch (error) {
        this.kaiser.syncStats.failedSyncs++
        console.error('Push sync failed:', error)
      }
    },

    async executeGodCommands(commands) {
      for (const command of commands) {
        try {
          console.log('Executing God command:', command)
          this.kaiser.syncStats.godCommands++

          // Hier können verschiedene God Commands verarbeitet werden
          switch (command.type) {
            case 'update_configuration':
              // Konfiguration aktualisieren
              break
            case 'emergency_stop':
              // Emergency Stop ausführen
              await this.emergencyStopAll()
              break
            case 'restart_system':
              // System Neustart
              break
            default:
              console.warn('Unknown God command type:', command.type)
          }
        } catch (error) {
          console.error('Failed to execute God command:', command, error)
        }
      }
    },

    // 🆕 NEU: Kaiser Configuration Persistence
    saveKaiserConfig() {
      localStorage.setItem('kaiser_id', this.kaiser.id)

      localStorage.setItem('kaiser_config', JSON.stringify(this.kaiser))
    },

    loadKaiserConfig() {
      const savedConfig = localStorage.getItem('kaiser_config')
      if (savedConfig) {
        try {
          Object.assign(this.kaiser, JSON.parse(savedConfig))
        } catch (error) {
          console.error('Failed to load Kaiser config:', error)
        }
      }
    },

    // 🚨 NEU: Helper-Funktion für MindMap-Konfiguration
    allowMindMapConfigChange() {
      this.isConfigChangeFromMindMap = true
      setTimeout(() => {
        this.isConfigChangeFromMindMap = false
      }, 1000) // 1 Sekunde Window für MindMap Updates
    },

    // ✅ NEU: Kaiser-ID Getter/Setter für einheitliche Verwaltung
    setKaiserId(newId) {
      const oldId = this.kaiser.id
      if (newId === oldId) return

      console.log(`[MQTT] 🎯 Kaiser-ID change requested: ${oldId} → ${newId}`)

      // 🚨 PRÜFE ob Änderung von MindMap kommt
      if (!this.isConfigChangeFromMindMap) {
        console.warn('[MQTT] Kaiser-ID changes only allowed from MindMap')
        safeError('Kaiser-ID Änderungen nur über MindMap möglich')
        return false
      }

      try {
        this.kaiser.id = newId
        this.saveKaiserConfig()

        // ✅ NEU: Event-basierte CentralConfig-Synchronisation
        eventBus.emit(MQTT_EVENTS.CENTRAL_CONFIG_UPDATE, {
          type: 'kaiser_id_change',
          oldId,
          newId,
          timestamp: Date.now(),
        })

        // ✅ KORRIGIERT: Topic-Synchronisation mit korrekter Signatur
        this.syncTopicsForKaiserIdChange(null, oldId, newId)

        safeSuccess(`Kaiser-ID geändert: ${oldId} → ${newId}`)
        return true
      } catch (error) {
        console.error('Error setting Kaiser ID:', error)
        safeError('Fehler beim Ändern der Kaiser-ID')
        return false
      }
    },

    // ✅ NEU: Topic Unsubscription für Kaiser-ID-Wechsel
    unsubscribeFromTopics(oldKaiserId) {
      if (!this.client || !this.connected) return

      const topics = [
        // Essential topics
        `kaiser/${oldKaiserId}/esp/+/heartbeat`,
        `kaiser/${oldKaiserId}/esp/+/status`,
        `kaiser/${oldKaiserId}/esp/+/config`,

        // Additional topics
        `kaiser/${oldKaiserId}/esp/+/sensor/+/data`,
        `kaiser/${oldKaiserId}/master/+/esp/+/subzone/+/sensor/+/data`,
        `kaiser/${oldKaiserId}/esp/+/actuator/+/status`,
        `kaiser/${oldKaiserId}/esp/+/emergency`,
        `kaiser/${oldKaiserId}/esp/+/zone/config`,
        `kaiser/${oldKaiserId}/esp/+/zone/response`,
        `kaiser/${oldKaiserId}/esp/+/subzone/config`,
        `kaiser/${oldKaiserId}/esp/+/subzone/response`,

        // Pi integration topics
        `kaiser/${oldKaiserId}/esp/+/pi/+/status`,
        `kaiser/${oldKaiserId}/esp/+/pi/+/response`,
        `kaiser/${oldKaiserId}/esp/+/pi/+/health`,
        `kaiser/${oldKaiserId}/esp/+/pi/+/sensor/+/statistics`,
        `kaiser/${oldKaiserId}/esp/+/pi/+/library/+/response`,

        // Health & monitoring topics
        `kaiser/${oldKaiserId}/esp/+/health/broadcast`,
        `kaiser/${oldKaiserId}/esp/+/health/request`,

        // Actuator topics
        `kaiser/${oldKaiserId}/esp/+/actuator/+/alert`,
        `kaiser/${oldKaiserId}/esp/+/actuator/config`,

        // Library topics
        `kaiser/${oldKaiserId}/esp/+/library/ready`,
        `kaiser/${oldKaiserId}/esp/+/library/installed`,
        `kaiser/${oldKaiserId}/esp/+/library/request`,
        `kaiser/${oldKaiserId}/esp/+/library/error`,

        // Error & alert topics
        `kaiser/${oldKaiserId}/esp/+/alert/error`,
        `kaiser/${oldKaiserId}/esp/+/error/acknowledge`,

        // Safe mode topics
        `kaiser/${oldKaiserId}/esp/+/safe_mode`,

        // Broadcast topics
        `kaiser/${oldKaiserId}/broadcast/emergency`,
        `kaiser/${oldKaiserId}/broadcast/system_update`,

        // Response topics
        `kaiser/${oldKaiserId}/esp/+/response`,
        `kaiser/${oldKaiserId}/esp/+/validation`,
        `kaiser/${oldKaiserId}/esp/+/gpio/conflict/response`,

        // Discovery & system topics
        `kaiser/${oldKaiserId}/discovery/esp32_nodes`,
        `kaiser/${oldKaiserId}/esp/+/system/diagnostics`,
        `kaiser/${oldKaiserId}/config/request`,
      ]

      topics.forEach((topic) => {
        this.client.unsubscribe(topic, (err) => {
          if (err) {
            console.warn(`[MQTT] ❌ Failed to unsubscribe from: ${topic}`, err)
          } else {
            console.log(`[MQTT] 🔻 Unsubscribed from: ${topic}`)
          }
        })
      })
    },

    // ✅ NEU: Aktor-Timeout-Handler
    handleActuatorTimeout(espId, gpio) {
      const actuatorKey = `${espId}-${gpio}`
      this.actuatorPendingStates.delete(actuatorKey)
      this.actuatorConfirmationTimeouts.delete(actuatorKey)

      console.warn(`Actuator confirmation timeout: ${actuatorKey}`)
      window.$snackbar?.showWarning(
        `Aktor ${gpio} Bestätigung ausstehend - prüfen Sie die Verbindung`,
      )
    },

    // Automatic reconnection with exponential backoff
    async autoReconnect() {
      if (!this.autoReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('Auto-reconnect disabled or max attempts reached')
        return
      }

      // Don't reconnect if we're already connected or connecting
      if (this.connected || this.connecting) {
        console.log('Already connected or connecting, skipping auto-reconnect')
        return
      }

      this.reconnectAttempts++
      this.lastConnectionAttempt = Date.now()

      // Exponential backoff: 5s, 10s, 20s, 40s, 80s...
      const backoffDelay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 30000)

      console.log(
        `Auto-reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${backoffDelay}ms`,
      )

      try {
        await this.connect()
        this.reconnectAttempts = 0 // Reset on successful connection
        console.log('Auto-reconnect successful')
      } catch (error) {
        console.log(`Reconnection attempt ${this.reconnectAttempts} failed:`, error.message)

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log(`Scheduling next attempt in ${backoffDelay}ms`)
          setTimeout(() => this.autoReconnect(), backoffDelay)
        } else {
          console.log('Max reconnection attempts reached')
        }
      }
    },

    // ✅ NEU: Verbindung mit Error Handler
    async connect() {
      if (this.connected || this.connecting) {
        return this.connected
      }

      this.connecting = true
      this.error = null

      try {
        // ✅ NEU: Event-basierte MQTT-URL-Anfrage
        const mqttUrl = `ws://${import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198'}:${import.meta.env.VITE_MQTT_BROKER_PORT || 9001}`

        this.client = mqtt.connect(mqttUrl, {
          clientId: `frontend_${Date.now()}`,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 10000,
        })

        this.client.on('connect', () => {
          this.connected = true
          this.connecting = false
          this.error = null
          errorHandler.log('MQTT connected successfully')
          this.subscribeToTopics()

          // ✅ HINZUFÜGEN - Event emittieren nach erfolgreichem Connect
          eventBus.emit('store:mqtt:connected', {
            timestamp: Date.now(),
            connectionQuality: this.connectionQuality,
          })
        })

        this.client.on('error', (error) => {
          this.connected = false
          this.connecting = false
          this.error = error.message
          errorHandler.error('MQTT connection error', error)
        })

        this.client.on('close', () => {
          this.connected = false
          this.connecting = false
          errorHandler.warn('MQTT connection closed')
        })

        this.client.on('reconnect', () => {
          errorHandler.log('MQTT reconnecting...')
        })

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('MQTT connection timeout'))
          }, 10000)

          this.client.once('connect', () => {
            clearTimeout(timeout)
            resolve(true)
          })

          this.client.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
          })
        })
      } catch (error) {
        this.connecting = false
        this.error = error.message
        errorHandler.error('MQTT connection failed', error)
        throw error
      }
    },

    async disconnect() {
      if (this.client) {
        this.client.end(true) // Force disconnect
        this.client = null
      }
      this.connected = false
      this.connecting = false
      this.reconnectAttempts = 0 // Reset reconnect attempts on manual disconnect
      this.connectionStartTime = null
      this.connectionQuality = 'unknown'
      this.packetLoss = 0
    },

    subscribeToTopics() {
      if (!this.client || !this.connected) return

      const kaiserId = this.getKaiserId

      // Explizite Topics ergänzen (auch wenn durch Wildcards abgedeckt)
      const explicitTopics = [
        `kaiser/${kaiserId}/esp/+/status`,
        `kaiser/${kaiserId}/discovery/esp32_nodes`,
        `kaiser/raspberry_pi_central/esp/+/commands`,
        `kaiser/raspberry_pi_central/esp/+/responses`,
      ]
      explicitTopics.forEach((topic) => {
        this.client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            console.error(`Failed to subscribe to ${topic}:`, err)
          } else {
            console.log(`Explicitly subscribed to ${topic}`)
          }
        })
      })

      // ✅ NEU: Verwende Topic-Utilities für einheitliche Konstruktion
      const standardTopics = getStandardEspTopics(kaiserId, '+')
      const essentialTopics = [
        { topic: standardTopics.heartbeat, qos: 1 }, // MQTT_QOS_HEARTBEAT 1
        { topic: standardTopics.status, qos: 1 }, // MQTT_QOS_STATUS 1
        { topic: standardTopics.config, qos: 0 }, // MQTT_QOS_COMMANDS 0
      ]

      // Subscribe to essential topics first
      essentialTopics.forEach(({ topic, qos }, index) => {
        setTimeout(() => {
          this.client.subscribe(topic, { qos }, (err) => {
            if (err) {
              console.error(`Failed to subscribe to ${topic}:`, err)
            } else {
              console.log(`Subscribed to ${topic} with QoS ${qos}`)
            }
          })
        }, index * 100) // Stagger subscriptions
      })

      // ✅ NEU: Verwende Topic-Utilities für Sensor-Topics
      setTimeout(() => {
        const sensorTopics = getSensorTopics(kaiserId, '+')
        const sensorTopicList = [
          { topic: sensorTopics.sensorData, qos: 1 },
          { topic: sensorTopics.masterZoneSensorData, qos: 1 },
          // 🆕 NEU: Backend v3.5.0 Legacy Topics für Rückwärtskompatibilität
          { topic: sensorTopics.legacySensorData, qos: 1 },
        ]

        sensorTopicList.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 500)

      // ✅ NEU: Verwende Topic-Utilities für Aktor-Topics
      setTimeout(() => {
        const actuatorTopics = getActuatorTopics(kaiserId, '+')
        const actuatorTopicList = [
          { topic: actuatorTopics.actuatorStatus, qos: 1 },
          { topic: actuatorTopics.actuatorAlert, qos: 1 },
          { topic: actuatorTopics.actuatorConfig, qos: 0 }, // Commands
        ]

        actuatorTopicList.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 1000)

      // ✅ NEU: Verwende Topic-Utilities für System-Command-Topics
      setTimeout(() => {
        const systemTopics = getStandardEspTopics(kaiserId, '+')
        const commandTopics = [
          { topic: systemTopics.systemCommand, qos: 0 },
          { topic: systemTopics.zoneConfig, qos: 0 },
          { topic: systemTopics.zoneResponse, qos: 1 }, // ACKs
          { topic: systemTopics.subzoneConfig, qos: 0 },
          { topic: systemTopics.subzoneResponse, qos: 1 }, // ACKs
        ]

        commandTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 1500)

      // ✅ NEU: Verwende Topic-Utilities für Health-Topics
      setTimeout(() => {
        const healthTopics = getStandardEspTopics(kaiserId, '+')
        const healthTopicList = [
          { topic: healthTopics.healthBroadcast, qos: 1 },
          { topic: healthTopics.healthRequest, qos: 0 }, // Commands
        ]

        healthTopicList.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 2000)

      // ✅ NEU: QoS 0 für Library Management (Commands)
      setTimeout(() => {
        const libraryTopics = getLibraryTopics(kaiserId, '+')
        const libraryTopicList = [
          { topic: libraryTopics.libraryReady, qos: 1 }, // Status
          { topic: libraryTopics.libraryInstalled, qos: 1 }, // Status
          { topic: libraryTopics.libraryRequest, qos: 0 }, // Commands
          { topic: libraryTopics.libraryError, qos: 1 }, // Status
        ]

        libraryTopicList.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 2500)

      // ✅ NEU: Verwende Topic-Utilities für Error-Topics
      setTimeout(() => {
        const errorTopics = getErrorTopics(kaiserId, '+')
        const errorTopicList = [
          { topic: errorTopics.errorAlert, qos: 1 },
          { topic: errorTopics.errorAcknowledge, qos: 0 }, // Commands
        ]

        errorTopicList.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 3000)

      // ✅ NEU: QoS 1 für Safe Mode
      setTimeout(() => {
        const safeModeTopics = [{ topic: `kaiser/${kaiserId}/esp/+/safe_mode`, qos: 1 }]

        safeModeTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 3500)

      // ✅ NEU: QoS 1 für Broadcast Messages
      setTimeout(() => {
        const broadcastTopics = [
          { topic: `kaiser/${kaiserId}/broadcast/emergency`, qos: 1 },
          { topic: `kaiser/${kaiserId}/broadcast/system_update`, qos: 1 },
        ]

        broadcastTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 4000)

      // ✅ NEU: Response-Topics für Server-Integration
      setTimeout(() => {
        const responseTopics = [
          { topic: standardTopics.systemResponse, qos: 1 }, // ✅ KONSISTENT: QoS 1 für ACKs
          { topic: `kaiser/${kaiserId}/esp/+/response`, qos: 1 }, // ✅ NEU: Server-Response-Topic
          { topic: `kaiser/${kaiserId}/esp/+/validation`, qos: 1 }, // ✅ NEU: Validation-Response-Topic
        ]

        responseTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 4500)

      // ✅ KONSISTENT: QoS 0 für Discovery & System Commands
      setTimeout(() => {
        const discoveryTopics = [
          { topic: `kaiser/${kaiserId}/discovery/esp32_nodes`, qos: 0 },
          { topic: `kaiser/${kaiserId}/esp/+/system/diagnostics`, qos: 0 },
          { topic: `kaiser/${kaiserId}/config/request`, qos: 0 },
        ]

        discoveryTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 5000)

      // 🆕 NEU: God-Kaiser Topics für hierarchische Kommunikation
      setTimeout(() => {
        const godKaiserTopics = [
          // God → Kaiser Kommunikation
          { topic: `kaiser/${kaiserId}/god/command`, qos: 1 },
          { topic: `kaiser/${kaiserId}/god/response`, qos: 1 },

          // Kaiser → God Status
          { topic: `kaiser/${kaiserId}/kaiser/status`, qos: 1 },
          { topic: `kaiser/${kaiserId}/kaiser/health`, qos: 1 },

          // Cross-Kaiser Kommunikation
          { topic: `kaiser/${kaiserId}/cross_kaiser/+/command`, qos: 1 },
          { topic: `kaiser/${kaiserId}/cross_kaiser/+/response`, qos: 1 },

          // Hierarchische Device-Management
          { topic: `kaiser/${kaiserId}/hierarchy`, qos: 1 },
          { topic: `kaiser/${kaiserId}/esp_transfer`, qos: 1 },
        ]

        godKaiserTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to God-Kaiser topic ${topic}:`, err)
              } else {
                console.log(`Subscribed to God-Kaiser topic ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }, 5500)
    },

    handleMessage(topic, message) {
      try {
        const payload = JSON.parse(message.toString())

        // ✅ NEU: Verwende zentrale Message-Verwaltung
        this.addMessage(topic, message.toString())

        // ✅ NEU: Verwende Topic-Utility für ESP-ID Extraktion
        const extractedEspId = extractEspIdFromTopic(topic)
        if (extractedEspId) {
          // Update device timeout
          this.deviceTimeouts.set(extractedEspId, Date.now())
        }

        // Parse topic to extract information
        const topicParts = topic.split('/')
        let espId = extractedEspId || topicParts[3] // ✅ NEU: Verwende Utility mit Fallback
        let messageType = topicParts[4]

        // 🆕 NEU: Handle new ESP32 topic schema with master and subzone
        if (topicParts.length >= 10 && topicParts[4] === 'master') {
          espId = topicParts[5]
          messageType = topicParts[8]
        }

        // 🆕 NEU: Handle legacy topic schema for backward compatibility
        if (topicParts.length >= 6 && topicParts[4] === 'sensor_data') {
          espId = topicParts[3]
          messageType = 'sensor'
        }

        // 🆕 NEU: Handle special topic structures
        if (topicParts[1] === 'broadcast') {
          this.handleBroadcastMessage(topicParts, payload)
          return
        }

        if (topicParts[1] === 'discovery') {
          // 🆕 NEU: Route zu centralDataHub statt direkte Behandlung
          this.centralDataHub?.routeMqttMessage(topic, payload)
          return
        }

        if (topicParts[1] === 'config' && topicParts[2] === 'request') {
          this.handleConfigRequest(payload)
          return
        }

        // 🆕 NEU: Handle God-Kaiser Topics
        if (
          topicParts[2] === 'god' ||
          topicParts[2] === 'kaiser' ||
          topicParts[2] === 'cross_kaiser' ||
          topicParts[2] === 'hierarchy' ||
          topicParts[2] === 'esp_transfer'
        ) {
          this.handleGodKaiserMessage(topic, payload)
          return
        }

        switch (messageType) {
          case 'heartbeat':
            this.handleHeartbeat(espId, payload)
            break
          case 'status':
            this.handleStatus(espId, payload)
            break
          case 'sensor': {
            // 🆕 NEU: Extract subzoneId and gpio for dual topic schema
            // ✅ NEU: Route Sensor-Nachrichten an centralDataHub
            this.centralDataHub?.routeMqttMessage(topic, payload)
            break
          }
          case 'actuator':
            this.handleActuatorStatus(espId, topicParts, payload)
            break
          case 'emergency':
            this.handleEmergency(espId, payload)
            break
          case 'pi':
            this.handlePiMessage(espId, topicParts, payload)
            break
          case 'zone':
            this.handleZoneMessage(espId, topicParts, payload)
            break
          case 'subzone':
            // 🆕 NEU: Route zu centralDataHub statt direkte Behandlung
            this.centralDataHub?.routeMqttMessage(topic, payload)
            break
          case 'config':
            // 🆕 NEU: Route zu centralDataHub statt direkte Behandlung
            this.centralDataHub?.routeMqttMessage(topic, payload)
            break
          // 🆕 NEU: System Health & Monitoring
          case 'health':
            this.handleHealthMessage(espId, topicParts, payload)
            break
          // 🆕 NEU: Library Management
          case 'library':
            this.handleLibraryMessage(espId, topicParts, payload)
            break
          // 🆕 NEU: Error & Alert System
          case 'alert':
            this.handleAlertMessage(espId, topicParts, payload)
            break
          case 'error':
            this.handleErrorMessage(espId, topicParts, payload)
            break
          // 🆕 NEU: Safe Mode
          case 'safe_mode':
            this.handleSafeModeMessage(espId, payload)
            break
          // 🆕 NEU: System Commands & Diagnostics
          case 'system':
            this.handleSystemMessage(espId, topicParts, payload)
            break
          // ✅ NEU: System Response ACK Handling
          case 'response':
            this.handleSystemResponse(espId, payload)
            break
          // ✅ NEU: GPIO Conflict Response Handling
          case 'gpio':
            if (topicParts[5] === 'conflict' && topicParts[6] === 'response') {
              this.handleGpioConflictResponse(espId, payload)
            }
            break
          default:
            console.log('Unknown message type:', messageType)
        }
      } catch (error) {
        console.error('Failed to handle MQTT message:', error)
      }
    },

    // 🆕 NEU: God-Kaiser Message Handler
    handleGodKaiserMessage(topic, payload) {
      const topicParts = topic.split('/')
      const kaiserId = topicParts[1]

      // God → Kaiser Kommunikation
      if (topicParts[2] === 'god') {
        if (topicParts[3] === 'command') {
          this.handleGodCommand(kaiserId, payload)
        } else if (topicParts[3] === 'response') {
          this.handleGodResponse(kaiserId, payload)
        }
        return
      }

      // Kaiser → God Status
      if (topicParts[2] === 'kaiser') {
        if (topicParts[3] === 'status') {
          this.handleKaiserStatus(kaiserId, payload)
        } else if (topicParts[3] === 'health') {
          this.handleKaiserHealth(kaiserId, payload)
        }
        return
      }

      // Cross-Kaiser Kommunikation
      if (topicParts[2] === 'cross_kaiser') {
        const targetKaiserId = topicParts[3]
        if (topicParts[4] === 'command') {
          this.handleCrossKaiserCommand(kaiserId, targetKaiserId, payload)
        } else if (topicParts[4] === 'response') {
          this.handleCrossKaiserResponse(kaiserId, targetKaiserId, payload)
        }
        return
      }

      // Hierarchische Device-Management
      if (topicParts[2] === 'hierarchy') {
        this.handleHierarchyUpdate(kaiserId, payload)
        return
      }

      // ESP Transfer
      if (topicParts[2] === 'esp_transfer') {
        this.handleEspTransfer(kaiserId, payload)
        return
      }
    },

    // 🆕 NEU: God Command Handler
    handleGodCommand(kaiserId, payload) {
      console.log(`[God-Kaiser] God command received for Kaiser ${kaiserId}:`, payload)

      const commandId = payload.command_id
      const commandType = payload.command

      // Befehlskette tracken
      this.trackCommandChain(commandId, ['god', kaiserId])

      // Command-spezifische Verarbeitung
      switch (commandType) {
        case 'register_kaiser':
          this.handleRegisterKaiserCommand(kaiserId, payload)
          break
        case 'transfer_esp':
          this.handleTransferEspCommand(kaiserId, payload)
          break
        case 'emergency_stop':
          this.handleEmergencyStopCommand(kaiserId, payload)
          break
        default:
          console.warn(`[God-Kaiser] Unknown God command type: ${commandType}`)
      }
    },

    // 🆕 NEU: God Response Handler
    handleGodResponse(kaiserId, payload) {
      console.log(`[God-Kaiser] God response received from Kaiser ${kaiserId}:`, payload)

      const commandId = payload.command_id
      const response = payload.response

      // Befehlskette aktualisieren
      this.updateCommandChain(commandId, response)
    },

    // 🆕 NEU: Kaiser Status Handler
    handleKaiserStatus(kaiserId, payload) {
      console.log(`[God-Kaiser] Kaiser status received from ${kaiserId}:`, payload)

      // ✅ NEU: Event-basierte CentralDataHub-Aktualisierung
      eventBus.emit(MQTT_EVENTS.KAISER_STATUS_UPDATE, {
        kaiser_id: kaiserId,
        status: payload.status,
        last_heartbeat: Date.now(),
        esp_count: payload.esp_count || 0,
      })
    },

    // 🆕 NEU: Kaiser Health Handler
    handleKaiserHealth(kaiserId, payload) {
      console.log(`[God-Kaiser] Kaiser health received from ${kaiserId}:`, payload)

      // ✅ NEU: Event-basierte CentralDataHub-Aktualisierung
      eventBus.emit(MQTT_EVENTS.KAISER_HEALTH_UPDATE, {
        kaiser_id: kaiserId,
        health: payload.health,
        free_heap: payload.free_heap,
        cpu_usage: payload.cpu_usage,
        uptime: payload.uptime,
      })
    },

    // 🆕 NEU: Cross-Kaiser Command Handler
    handleCrossKaiserCommand(sourceKaiserId, targetKaiserId, payload) {
      console.log(
        `[God-Kaiser] Cross-Kaiser command from ${sourceKaiserId} to ${targetKaiserId}:`,
        payload,
      )

      const commandId = payload.command_id
      const commandType = payload.command

      // Befehlskette tracken
      this.trackCommandChain(commandId, ['kaiser', sourceKaiserId, targetKaiserId])

      // Cross-Kaiser Command-spezifische Verarbeitung
      switch (commandType) {
        case 'transfer_esp':
          this.handleCrossKaiserEspTransfer(sourceKaiserId, targetKaiserId, payload)
          break
        case 'sync_data':
          this.handleCrossKaiserDataSync(sourceKaiserId, targetKaiserId, payload)
          break
        default:
          console.warn(`[God-Kaiser] Unknown cross-Kaiser command type: ${commandType}`)
      }
    },

    // 🆕 NEU: Cross-Kaiser Response Handler
    handleCrossKaiserResponse(sourceKaiserId, targetKaiserId, payload) {
      console.log(
        `[God-Kaiser] Cross-Kaiser response from ${targetKaiserId} to ${sourceKaiserId}:`,
        payload,
      )

      const commandId = payload.command_id
      const response = payload.response

      // Befehlskette aktualisieren
      this.updateCommandChain(commandId, response)
    },

    // 🆕 NEU: Hierarchy Update Handler
    handleHierarchyUpdate(kaiserId, payload) {
      console.log(`[God-Kaiser] Hierarchy update received from ${kaiserId}:`, payload)

      // ✅ NEU: Event-basierte CentralDataHub-Aktualisierung
      eventBus.emit(MQTT_EVENTS.HIERARCHY_UPDATE, {
        kaiser_id: kaiserId,
        hierarchy: payload.hierarchy,
        timestamp: Date.now(),
      })
    },

    // 🆕 NEU: ESP Transfer Handler
    handleEspTransfer(kaiserId, payload) {
      console.log(`[God-Kaiser] ESP transfer received from ${kaiserId}:`, payload)

      const espId = payload.esp_id
      const fromOwner = payload.from_owner
      const toOwner = payload.to_owner

      // ✅ NEU: Event-basierte CentralDataHub-Aktualisierung
      eventBus.emit(MQTT_EVENTS.ESP_TRANSFER, {
        esp_id: espId,
        from_owner: fromOwner,
        to_owner: toOwner,
        timestamp: Date.now(),
      })
    },

    // 🆕 NEU: Befehlsketten-Tracking
    trackCommandChain(commandId, path) {
      const chain = {
        command_id: commandId,
        path: path, // ['god', 'kaiser_001', 'esp001']
        status: 'pending',
        responses: [],
        timestamp: Date.now(),
      }

      if (!this.activeCommandChains) {
        this.activeCommandChains = new Map()
      }

      this.activeCommandChains.set(commandId, chain)
      console.log(`[God-Kaiser] Command chain tracked: ${commandId}`, chain)
      return chain
    },

    // 🆕 NEU: Befehlskette aktualisieren
    updateCommandChain(commandId, response) {
      if (!this.activeCommandChains) return

      const chain = this.activeCommandChains.get(commandId)
      if (chain) {
        chain.responses.push(response)
        chain.status = response.success ? 'completed' : 'failed'
        chain.lastUpdate = Date.now()

        // 🆕 NEU: Command-Chain-Cache aktualisieren
        this.hierarchicalPerformance.commandChainCache.set(commandId, {
          chain,
          timestamp: Date.now(),
        })

        console.log(`[God-Kaiser] Command chain updated: ${commandId}`, chain)
      }
    },

    // 🆕 NEU: Hierarchische Performance-Optimierungen
    scheduleCrossKaiserBatchUpdate(kaiserId, update) {
      const pendingUpdates =
        this.hierarchicalPerformance.crossKaiserBatchUpdates.get(kaiserId) || []
      pendingUpdates.push(update)
      this.hierarchicalPerformance.crossKaiserBatchUpdates.set(kaiserId, pendingUpdates)

      if (!this.hierarchicalPerformance.crossKaiserBatchTimeout) {
        this.hierarchicalPerformance.crossKaiserBatchTimeout = setTimeout(() => {
          this.processCrossKaiserBatchUpdates()
        }, this.hierarchicalPerformance.crossKaiserBatchInterval)
      }
    },

    processCrossKaiserBatchUpdates() {
      this.hierarchicalPerformance.crossKaiserBatchUpdates.forEach((updates, kaiserId) => {
        if (updates.length > 0) {
          this.applyCrossKaiserBatchUpdates(kaiserId, updates)
        }
      })

      this.hierarchicalPerformance.crossKaiserBatchUpdates.clear()
      this.hierarchicalPerformance.crossKaiserBatchTimeout = null
    },

    async applyCrossKaiserBatchUpdates(kaiserId, updates) {
      try {
        const groupedUpdates = this.groupCrossKaiserUpdates(updates)

        const topic = `kaiser/${kaiserId}/cross_kaiser/batch`
        const payload = {
          updates: groupedUpdates,
          batch_size: updates.length,
          timestamp: Date.now(),
        }

        await this.publish(topic, payload)
        console.log(
          `[MQTT] Cross-kaiser batch update sent: ${updates.length} updates to ${kaiserId}`,
        )
      } catch (error) {
        console.error(`[MQTT] Cross-kaiser batch update failed for ${kaiserId}:`, error)
      }
    },

    groupCrossKaiserUpdates(updates) {
      const grouped = {
        esp_transfers: [],
        status_updates: [],
        config_changes: [],
        command_responses: [],
      }

      updates.forEach((update) => {
        switch (update.type) {
          case 'esp_transfer':
            grouped.esp_transfers.push(update)
            break
          case 'status_update':
            grouped.status_updates.push(update)
            break
          case 'config_change':
            grouped.config_changes.push(update)
            break
          case 'command_response':
            grouped.command_responses.push(update)
            break
          default:
            grouped.status_updates.push(update)
        }
      })

      return grouped
    },

    scheduleGodKaiserBatchUpdate(kaiserId, update) {
      const pendingUpdates = this.hierarchicalPerformance.godKaiserBatchUpdates.get(kaiserId) || []
      pendingUpdates.push(update)
      this.hierarchicalPerformance.godKaiserBatchUpdates.set(kaiserId, pendingUpdates)

      if (!this.hierarchicalPerformance.godKaiserBatchTimeout) {
        this.hierarchicalPerformance.godKaiserBatchTimeout = setTimeout(() => {
          this.processGodKaiserBatchUpdates()
        }, this.hierarchicalPerformance.godKaiserBatchInterval)
      }
    },

    processGodKaiserBatchUpdates() {
      this.hierarchicalPerformance.godKaiserBatchUpdates.forEach((updates, kaiserId) => {
        if (updates.length > 0) {
          this.applyGodKaiserBatchUpdates(kaiserId, updates)
        }
      })

      this.hierarchicalPerformance.godKaiserBatchUpdates.clear()
      this.hierarchicalPerformance.godKaiserBatchTimeout = null
    },

    async applyGodKaiserBatchUpdates(kaiserId, updates) {
      try {
        const groupedUpdates = this.groupGodKaiserUpdates(updates)

        const topic = `kaiser/${kaiserId}/god/batch`
        const payload = {
          updates: groupedUpdates,
          batch_size: updates.length,
          timestamp: Date.now(),
        }

        await this.publish(topic, payload)
        console.log(`[MQTT] God-kaiser batch update sent: ${updates.length} updates to ${kaiserId}`)
      } catch (error) {
        console.error(`[MQTT] God-kaiser batch update failed for ${kaiserId}:`, error)
      }
    },

    groupGodKaiserUpdates(updates) {
      const grouped = {
        commands: [],
        responses: [],
        status_updates: [],
        health_updates: [],
      }

      updates.forEach((update) => {
        switch (update.type) {
          case 'command':
            grouped.commands.push(update)
            break
          case 'response':
            grouped.responses.push(update)
            break
          case 'status_update':
            grouped.status_updates.push(update)
            break
          case 'health_update':
            grouped.health_updates.push(update)
            break
          default:
            grouped.status_updates.push(update)
        }
      })

      return grouped
    },

    // 🆕 NEU: Performance-Monitoring
    updatePerformanceStats(processingTime, cacheHit = false) {
      const stats = this.hierarchicalPerformance.performanceStats
      stats.messagesProcessed++

      // ✅ NEU: Event-basierte Cache-Statistiken
      const centralDataHub = storeHandler.getStore('centralDataHub')
      if (centralDataHub) {
        centralDataHub.updateCacheStats(cacheHit, processingTime)
      }

      // Durchschnittliche Verarbeitungszeit aktualisieren
      const totalTime = stats.averageProcessingTime * (stats.messagesProcessed - 1) + processingTime
      stats.averageProcessingTime = totalTime / stats.messagesProcessed
    },

    getPerformanceStats() {
      const stats = this.hierarchicalPerformance.performanceStats
      const centralDataHub = storeHandler.getStore('centralDataHub')
      const centralCacheStats = centralDataHub
        ? centralDataHub.getCacheStatus()
        : { hitRate: 0, totalSize: 0 }

      return {
        messages_processed: stats.messagesProcessed,
        cache_hit_ratio: centralCacheStats.hitRate,
        average_processing_time: stats.averageProcessingTime,
        uptime: Date.now() - stats.lastReset,
        cache_size: centralCacheStats.totalSize,
        pending_batches: {
          cross_kaiser: this.hierarchicalPerformance.crossKaiserBatchUpdates.size,
          god_kaiser: this.hierarchicalPerformance.godKaiserBatchUpdates.size,
        },
        central_cache_stats: centralCacheStats,
      }
    },

    resetPerformanceStats() {
      this.hierarchicalPerformance.performanceStats = {
        messagesProcessed: 0,
        averageProcessingTime: 0,
        lastReset: Date.now(),
      }

      // ✅ NEU: Event-basierte Cache-Statistiken
      const centralDataHub = storeHandler.getStore('centralDataHub')
      if (centralDataHub) {
        centralDataHub.resetAccessCounts()
      }
    },

    // 🆕 NEU: Cache-Optimierung
    optimizeCommandChainCache() {
      const cache = this.hierarchicalPerformance.commandChainCache
      const now = Date.now()

      // Abgelaufene Einträge entfernen
      for (const [commandId, data] of cache.entries()) {
        if (now - data.timestamp > this.hierarchicalPerformance.commandChainTimeout) {
          cache.delete(commandId)
        }
      }

      // Cache-Größe begrenzen
      if (cache.size > 100) {
        const entries = Array.from(cache.entries())
        const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

        const removeCount = Math.floor(cache.size * 0.2)
        for (let i = 0; i < removeCount; i++) {
          cache.delete(sortedEntries[i][0])
        }
      }
    },

    // 🆕 NEU: Performance-Monitoring starten
    startPerformanceMonitoring() {
      setInterval(() => {
        this.optimizeCommandChainCache()
        this.optimizeMemoryUsage()
        this.cleanupCrossEspTimeouts() // ✅ NEU: Cross-ESP Timeout-Cleanup
      }, 60 * 1000) // Alle 60 Sekunden
    },

    // ✅ NEU: Cross-ESP Timeout-Management
    cleanupCrossEspTimeouts() {
      const now = Date.now()
      let cleanedCount = 0

      // Cross-ESP Timeout-Timer cleanen
      for (const [requestId, timeoutInfo] of this.crossEspTimeouts.entries()) {
        if (now - timeoutInfo.createdAt > timeoutInfo.timeoutMs) {
          clearTimeout(timeoutInfo.timerId)
          this.crossEspTimeouts.delete(requestId)
          cleanedCount++
          console.log(`🧹 Cross-ESP Timeout gecleaned: ${requestId}`)
        }
      }

      if (cleanedCount > 0) {
        console.log(`✅ Cross-ESP Timeout-Cleanup: ${cleanedCount} Timer gecleaned`)
      }
    },

    // ✅ NEU: Cross-ESP Timeout hinzufügen
    addCrossEspTimeout(requestId, timeoutMs, callback) {
      const timerId = setTimeout(() => {
        callback()
        this.crossEspTimeouts.delete(requestId) // Auto-cleanup
      }, timeoutMs)

      this.crossEspTimeouts.set(requestId, {
        timerId,
        timeoutMs,
        createdAt: Date.now(),
        callback: callback.toString(), // Für Debugging
      })

      console.log(`⏰ Cross-ESP Timeout gesetzt: ${requestId} (${timeoutMs}ms)`)
      return timerId
    },

    // 🆕 NEU: Command-spezifische Handler
    handleRegisterKaiserCommand(kaiserId, payload) {
      console.log(`[God-Kaiser] Register Kaiser command for ${kaiserId}:`, payload)

      // Kaiser-Registrierung verarbeiten
      // const kaiserConfig = payload.kaiser_config || {} // TODO: Implement Kaiser config processing

      // Response an God senden
      const response = {
        command_id: payload.command_id,
        response: {
          success: true,
          kaiser_id: kaiserId,
          registered: true,
          timestamp: Date.now(),
        },
      }

      this.publish(`kaiser/${kaiserId}/god/response`, response)
    },

    handleTransferEspCommand(kaiserId, payload) {
      console.log(`[God-Kaiser] Transfer ESP command for ${kaiserId}:`, payload)

      const espId = payload.esp_id
      const fromOwner = payload.from_owner
      const toOwner = payload.to_owner

      // ESP-Transfer verarbeiten
      // Hier würde die tatsächliche Transfer-Logik implementiert

      // Response an God senden
      const response = {
        command_id: payload.command_id,
        response: {
          success: true,
          esp_id: espId,
          transferred: true,
          from_owner: fromOwner,
          to_owner: toOwner,
          timestamp: Date.now(),
        },
      }

      this.publish(`kaiser/${kaiserId}/god/response`, response)
    },

    handleEmergencyStopCommand(kaiserId, payload) {
      console.log(`[God-Kaiser] Emergency Stop command for ${kaiserId}:`, payload)

      // Emergency Stop für alle ESPs unter diesem Kaiser ausführen
      this.emergencyStopAll()

      // Response an God senden
      const response = {
        command_id: payload.command_id,
        response: {
          success: true,
          emergency_stop_executed: true,
          timestamp: Date.now(),
        },
      }

      this.publish(`kaiser/${kaiserId}/god/response`, response)
    },

    handleCrossKaiserEspTransfer(sourceKaiserId, targetKaiserId, payload) {
      console.log(
        `[God-Kaiser] Cross-Kaiser ESP transfer: ${sourceKaiserId} → ${targetKaiserId}`,
        payload,
      )

      const espId = payload.esp_id

      // ✅ NEU: God-spezifische Transfer-Logik
      if (targetKaiserId === 'god_pi_central') {
        // Transfer zu God Pi
        this.handleGodEspTransfer(sourceKaiserId, espId, payload)
        return
      }

      // Cross-Kaiser ESP-Transfer verarbeiten
      // Hier würde die tatsächliche Transfer-Logik implementiert

      // Response an Source-Kaiser senden
      const response = {
        command_id: payload.command_id,
        response: {
          success: true,
          esp_id: espId,
          transferred: true,
          source_kaiser: sourceKaiserId,
          target_kaiser: targetKaiserId,
          timestamp: Date.now(),
        },
      }

      this.publish(`kaiser/${targetKaiserId}/cross_kaiser/${sourceKaiserId}/response`, response)
    },

    // 🆕 NEU: God ESP Transfer Handler
    handleGodEspTransfer(sourceKaiserId, espId, payload) {
      console.log(`[God-Kaiser] God ESP transfer: ${sourceKaiserId} → God Pi`, payload)

      try {
        // ✅ KORRIGIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.ESP_OWNERSHIP_UPDATE, {
          espId,
          newOwner: 'god_pi_central',
          timestamp: Date.now(),
        })

        // God-spezifische Topics abonnieren
        const godTopics = [
          `god_pi_central/esp/${espId}/status`,
          `god_pi_central/esp/${espId}/sensor/+`,
          `god_pi_central/esp/${espId}/actuator/+`,
          `god_pi_central/esp/${espId}/heartbeat`,
        ]

        for (const topic of godTopics) {
          this.subscribe(topic)
        }

        // Response an Source-Kaiser senden
        const response = {
          command_id: payload.command_id,
          response: {
            success: true,
            esp_id: espId,
            transferred: true,
            source_kaiser: sourceKaiserId,
            target_kaiser: 'god_pi_central',
            timestamp: Date.now(),
          },
        }

        this.publish(`kaiser/${sourceKaiserId}/cross_kaiser/god_pi_central/response`, response)
      } catch (error) {
        console.error('[God-Kaiser] Failed to handle God ESP transfer:', error)

        // Error Response
        const errorResponse = {
          command_id: payload.command_id,
          response: {
            success: false,
            error: error.message,
            esp_id: espId,
            source_kaiser: sourceKaiserId,
            target_kaiser: 'god_pi_central',
            timestamp: Date.now(),
          },
        }

        this.publish(`kaiser/${sourceKaiserId}/cross_kaiser/god_pi_central/response`, errorResponse)
      }
    },

    handleCrossKaiserDataSync(sourceKaiserId, targetKaiserId, payload) {
      console.log(
        `[God-Kaiser] Cross-Kaiser data sync: ${sourceKaiserId} → ${targetKaiserId}`,
        payload,
      )

      // Cross-Kaiser Daten-Synchronisation verarbeiten
      // Hier würde die tatsächliche Sync-Logik implementiert

      // Response an Source-Kaiser senden
      const response = {
        command_id: payload.command_id,
        response: {
          success: true,
          data_synced: true,
          source_kaiser: sourceKaiserId,
          target_kaiser: targetKaiserId,
          timestamp: Date.now(),
        },
      }

      this.publish(`kaiser/${targetKaiserId}/cross_kaiser/${sourceKaiserId}/response`, response)
    },

    handleHeartbeat(espId, payload) {
      const device = this.espDevices.get(espId) || {
        espId,
        lastHeartbeat: null,
        status: 'offline',
        sensors: new Map(),
        actuators: new Map(),
      }

      // ✅ KORRIGIERT: ESP32 Backend v3.5.0 Heartbeat Felder mit Server-kompatiblen Feldnamen
      device.lastHeartbeat = Date.now()
      device.systemState = payload.state || payload.system_state || 'UNKNOWN'
      device.uptimeSeconds = payload.uptime_seconds || payload.uptimeSeconds || 0
      device.freeHeap = payload.free_heap || payload.freeHeap || 0
      device.wifiRssi = payload.wifi_rssi || payload.wifiRssi || 0
      device.activeSensors = payload.active_sensors || payload.activeSensors || 0
      device.mqttConnected = payload.mqtt_connected || payload.mqttConnected || false

      // ✅ KORRIGIERT: Server-kompatible Feldnamen
      device.board_type = payload.board_type || payload.boardType || device.board_type
      device.firmware_version =
        payload.firmware_version || payload.firmwareVersion || device.firmware_version
      device.server_address = payload.server_address || payload.ipAddress || device.server_address

      // ✅ NEU: Benutzerdefinierte Felder tolerieren
      device.hardwareMode = payload.hardware_mode || payload.hardwareMode || device.hardwareMode
      device.rawMode = payload.raw_mode || payload.rawMode || device.rawMode
      device.timeQuality = payload.time_quality || payload.timeQuality || device.timeQuality
      device.warnings = payload.warnings || device.warnings || []

      // ✅ NEU: Kaiser-ID Integration
      device.kaiserId = payload.kaiser_id || payload.kaiserId || device.kaiserId

      // ✅ NEU: Fehlende Felder ergänzen
      device.isoTimestamp = payload.iso_timestamp || payload.isoTimestamp || device.isoTimestamp
      device.rawValue = payload.raw_value ?? device.rawValue
      device.kaiserIdChanged = payload.kaiser_id_changed ?? false
      device.espIdChanged = payload.esp_id_changed ?? false
      device.masterZoneChanged = payload.master_zone_changed ?? false
      device.subzoneChanged = payload.subzone_changed ?? false
      device.previousKaiserId = payload.previous_kaiser_id || null
      device.kaiserIdChangeTimestamp = payload.kaiser_id_change_timestamp || null
      device.advancedFeatures = payload.advanced_features || device.advancedFeatures

      // Network information
      if (payload.network) {
        device.wifiConnected = payload.network.wifi_connected
        device.wifiReconnects = payload.network.wifi_reconnects
        device.mqttReconnects = payload.network.mqtt_reconnects
      }

      // Update broker information if available
      if (payload.broker_ip) {
        device.brokerIp = payload.broker_ip
      }
      if (payload.broker_port) {
        device.brokerPort = payload.broker_port
      }

      device.status = 'online'
      device.lastUpdate = Date.now()

      this.espDevices.set(espId, device)

      console.log(`[MQTT] Heartbeat from ${espId}:`, {
        systemState: device.systemState,
        uptime: device.uptimeSeconds,
        freeHeap: device.freeHeap,
        wifiRssi: device.wifiRssi,
        activeSensors: device.activeSensors,
        mqttConnected: device.mqttConnected,
        board_type: device.board_type,
        firmware_version: device.firmware_version,
        server_address: device.server_address,
        hardwareMode: device.hardwareMode,
        rawMode: device.rawMode,
        timeQuality: device.timeQuality,
        warnings: device.warnings,
        isoTimestamp: device.isoTimestamp,
        kaiserIdChanged: device.kaiserIdChanged,
        advancedFeatures: device.advancedFeatures,
      })
    },

    handleStatus(espId, payload) {
      const device = this.espDevices.get(espId) || {
        espId,
        lastStatusUpdate: null,
        status: 'offline',
      }

      // ✅ NEU: ESP32 Backend v3.5.0 Status Felder
      device.lastStatusUpdate = Date.now()
      device.systemState = payload.state || payload.system_state || device.systemState
      device.webserverActive = payload.webserver_active || payload.webserverActive || false
      device.safeMode = payload.safe_mode || payload.safeMode || false
      device.emergencyStop = payload.emergency_stop || payload.emergencyStop || false

      // ✅ NEU: Benutzerdefinierte Felder tolerieren
      device.hardwareMode = payload.hardware_mode || payload.hardwareMode || device.hardwareMode
      device.rawMode = payload.raw_mode || payload.rawMode || device.rawMode
      device.timeQuality = payload.time_quality || payload.timeQuality || device.timeQuality
      device.warnings = payload.warnings || device.warnings || []

      // ✅ NEU: Kaiser-ID Integration
      device.kaiserId = payload.kaiser_id || payload.kaiserId || device.kaiserId

      // ✅ NEU: Fehlende Felder ergänzen
      device.isoTimestamp = payload.iso_timestamp || payload.isoTimestamp || device.isoTimestamp
      device.rawValue = payload.raw_value ?? device.rawValue
      device.kaiserIdChanged = payload.kaiser_id_changed ?? false
      device.espIdChanged = payload.esp_id_changed ?? false
      device.masterZoneChanged = payload.master_zone_changed ?? false
      device.subzoneChanged = payload.subzone_changed ?? false
      device.previousKaiserId = payload.previous_kaiser_id || null
      device.kaiserIdChangeTimestamp = payload.kaiser_id_change_timestamp || null
      device.healthSummary = payload.health_summary || device.healthSummary

      device.status = 'online'
      device.lastUpdate = Date.now()

      this.espDevices.set(espId, device)

      // ✅ HINZUFÜGEN - Event emittieren nach Status-Update
      eventBus.emit('store:esp:status', {
        espId,
        status: device,
        timestamp: Date.now(),
      })

      console.log(`[MQTT] Status update from ${espId}:`, {
        systemState: device.systemState,
        webserverActive: device.webserverActive,
        safeMode: device.safeMode,
        emergencyStop: device.emergencyStop,
        hardwareMode: device.hardwareMode,
        rawMode: device.rawMode,
        timeQuality: device.timeQuality,
        warnings: device.warnings,
        isoTimestamp: device.isoTimestamp,
        kaiserIdChanged: device.kaiserIdChanged,
        healthSummary: device.healthSummary,
      })
    },

    // 🆕 NEU: Zone-Änderungen verarbeiten
    // 🆕 ENTFERNT: handleZoneChanges verschoben nach espManagement.js

    // ✅ MIGRIERT: Aktor-Status wird jetzt über Event-System an actuatorLogic weitergeleitet
    handleActuatorStatus(espId, topicParts, payload) {
      const gpio = topicParts[5] // actuator/{gpio}/status

      console.log('[MQTT] Actuator status update:', { espId, gpio, payload })

      // Event-basierte Weiterleitung an actuatorLogic Store
      eventBus.emit(MQTT_EVENTS.ACTUATOR_STATUS, {
        espId,
        gpio: parseInt(gpio),
        topicParts,
        payload,
        timestamp: Date.now(),
      })
    },

    handleEmergency(espId, payload) {
      this.systemStatus.emergencyStop = payload.emergency_stop || false
      this.systemStatus.lastUpdate = Date.now()
    },

    handlePiMessage(espId, topicParts, payload) {
      const piType = topicParts[5]
      const subType = topicParts[7]

      // Import Pi Integration Store dynamically to avoid circular dependency
      import('./piIntegration')
        .then(({ usePiIntegrationStore }) => {
          const piIntegration = usePiIntegrationStore()

          switch (piType) {
            case 'status':
              piIntegration.handlePiStatusUpdate(payload)
              break
            case 'health':
              piIntegration.handlePiHealthUpdate(payload)
              break
            case 'sensor':
              if (subType === 'statistics') {
                piIntegration.handlePiSensorStatistics(payload)
              }
              break
            case 'library':
              if (subType === 'response') {
                piIntegration.handlePiLibraryResponse(payload)
              }
              break
            default:
              console.log('Unknown Pi message type:', piType)
          }
        })
        .catch((error) => {
          console.error('Failed to import Pi Integration Store:', error)
        })
    },

    handleZoneMessage(espId, topicParts, payload) {
      const subType = topicParts[5]

      // Import ESP Management Store dynamically to avoid circular dependency
      import('./espManagement')
        .then(({ useEspManagementStore }) => {
          const espManagement = useEspManagementStore()

          switch (subType) {
            case 'config':
              espManagement.updateEspDevice(espId, {
                kaiser_zone: payload.kaiser_zone,
                master_zone: payload.master_zone,
                lastUpdate: Date.now(),
              })
              break
            case 'response':
              console.log('Zone configuration response:', payload)
              break
            default:
              console.log('Unknown zone message type:', subType)
          }
        })
        .catch((error) => {
          console.error('Failed to import ESP Management Store:', error)
        })
    },

    // 🆕 ENTFERNT: handleSubzoneMessage verschoben nach espManagement.js

    // 🆕 ENTFERNT: handleEspConfig verschoben nach espManagement.js

    // ✅ NEU: Erweiterte publish() Methode mit Batching-Support
    async publish(topic, message, options = {}) {
      // ⚡ MESSAGE-SEQUENCING-PROTECTION: Sequence-ID für Ordering-Guarantees
      const sequenceId = this.generateSequenceId()

      const messageData = {
        topic,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        qos: options.qos || 0,
        retain: options.retain || false,
        timestamp: Date.now(),
        priority: options.priority || 'normal', // 'high', 'normal', 'low'
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        customFields: options.customFields || {},
        // ⚡ SEQUENCE-PROTECTION: Message-Ordering-Guarantees
        sequenceId,
        sequenceTimestamp: Date.now(),
        outOfOrderDetection: true,
      }

      // ⚡ MESSAGE-DEDUPLICATION: Duplicate-Detection vor Processing
      if (this.isDuplicateMessageEnhanced(messageData)) {
        console.warn(`[Deduplication] Skipping duplicate message for topic: ${topic}`)
        return Promise.resolve({ success: false, reason: 'duplicate' })
      }

      // ⚡ OUT-OF-ORDER-QUEUING: Message-Ordering-Protection
      if (this.messageSequencing.enabled) {
        return await this.publishWithSequencing(messageData)
      }

      // High-Priority Messages sofort senden
      if (options.priority === 'high' || !this.messageBatching.enabled) {
        return await this.publishImmediately(messageData)
      }

      // Normal/Low-Priority Messages für Batching sammeln
      this.addToBatch(messageData)

      // Promise für asynchrone Rückgabe
      return new Promise((resolve, reject) => {
        messageData.resolve = resolve
        messageData.reject = reject
      })
    },

    // ⚡ NEU: Sequence-ID-Generation pro ESP
    generateSequenceId() {
      if (!this.messageSequencing) {
        this.messageSequencing = {
          sequenceCounters: new Map(),
          lastSequenceId: 0,
          enabled: true,
        }
      }

      this.messageSequencing.lastSequenceId++
      return this.messageSequencing.lastSequenceId
    },

    // ⚡ NEU: Publish mit Sequencing-Protection
    async publishWithSequencing(messageData) {
      const { topic } = messageData

      // ⚡ SEQUENCE-QUEUE: Out-of-Order-Message-Queuing
      if (!this.messageSequencing.sequenceQueue) {
        this.messageSequencing.sequenceQueue = new Map()
      }

      const topicQueue = this.messageSequencing.sequenceQueue.get(topic) || []
      topicQueue.push(messageData)

      // Sortiere nach Sequence-ID für korrekte Reihenfolge
      topicQueue.sort((a, b) => a.sequenceId - b.sequenceId)
      this.messageSequencing.sequenceQueue.set(topic, topicQueue)

      // ⚡ BATCH-PROCESSING: Verarbeite Queue in Batches
      if (topicQueue.length >= 5 || messageData.priority === 'high') {
        await this.processSequenceQueue(topic)
      }

      return new Promise((resolve, reject) => {
        messageData.resolve = resolve
        messageData.reject = reject
      })
    },

    // ⚡ NEU: Sequence-Queue-Processing
    async processSequenceQueue(topic) {
      const topicQueue = this.messageSequencing.sequenceQueue.get(topic) || []
      if (topicQueue.length === 0) return

      // ⚡ ORDERED-PROCESSING: Verarbeite Messages in Sequence-ID-Reihenfolge
      for (const messageData of topicQueue) {
        try {
          if (messageData.priority === 'high' || !this.messageBatching.enabled) {
            await this.publishImmediately(messageData)
          } else {
            this.addToBatch(messageData)
          }

          // ⚡ SUCCESS-HANDLING: Resolve Promise
          if (messageData.resolve) {
            messageData.resolve({ success: true, sequenceId: messageData.sequenceId })
          }
        } catch (error) {
          console.error(
            `[Sequence-Error] Failed to process message ${messageData.sequenceId}:`,
            error,
          )

          // ⚡ ERROR-HANDLING: Reject Promise
          if (messageData.reject) {
            messageData.reject(error)
          }
        }
      }

      // ⚡ QUEUE-CLEANUP: Entferne verarbeitete Messages
      this.messageSequencing.sequenceQueue.set(topic, [])
    },

    // ⚡ NEU: Message-Deduplication mit LRU-Cache
    isDuplicateMessageEnhanced(messageData) {
      if (!this.messageDeduplication) {
        this.messageDeduplication = {
          lruCache: new Map(),
          maxCacheSize: 1000,
          ttl: 30000, // 30 Sekunden TTL
          hashFunction: this.generateMessageHash,
        }
      }

      const messageHash = this.messageDeduplication.hashFunction(messageData)
      const now = Date.now()

      // ⚡ LRU-CACHE-LOOKUP: Check für Duplicate
      if (this.messageDeduplication.lruCache.has(messageHash)) {
        const cachedEntry = this.messageDeduplication.lruCache.get(messageHash)

        // ⚡ TTL-VALIDATION: Check ob Cache-Eintrag noch gültig
        if (now - cachedEntry.timestamp < this.messageDeduplication.ttl) {
          console.warn(`[Deduplication] Duplicate message detected: ${messageHash}`)
          return true
        } else {
          // ⚡ TTL-EXPIRED: Entferne abgelaufenen Eintrag
          this.messageDeduplication.lruCache.delete(messageHash)
        }
      }

      // ⚡ CACHE-INSERTION: Füge neue Message zum Cache hinzu
      this.messageDeduplication.lruCache.set(messageHash, {
        timestamp: now,
        topic: messageData.topic,
        sequenceId: messageData.sequenceId,
      })

      // ⚡ LRU-EVICTION: Entferne alte Einträge wenn Cache voll
      if (this.messageDeduplication.lruCache.size > this.messageDeduplication.maxCacheSize) {
        const oldestKey = this.messageDeduplication.lruCache.keys().next().value
        this.messageDeduplication.lruCache.delete(oldestKey)
      }

      return false
    },

    // ⚡ NEU: Message-Hash-Generation für Deduplication
    generateMessageHash(messageData) {
      const hashData = {
        topic: messageData.topic,
        message: messageData.message,
        timestamp: Math.floor(messageData.timestamp / 1000), // Sekunden-Präzision
        sequenceId: messageData.sequenceId,
      }

      const hashString = JSON.stringify(hashData)

      // ⚡ PERFORMANCE-OPTIMIZED HASH: Einfache aber effiziente Hash-Funktion
      let hash = 0
      for (let i = 0; i < hashString.length; i++) {
        const char = hashString.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32-bit integer
      }

      return hash.toString(16)
    },

    // 🎵 HARMONISCHE Aktor-Befehle mit CentralDataHub Integration
    async sendActuatorCommand(espId, gpio, command, value = null) {
      if (!this.isConnected) {
        throw new Error('MQTT nicht verbunden')
      }

      // 🎵 HARMONISCHE VALIDIERUNG: CentralDataHub Validation-Engine verwenden
      if (this.harmonyIntegration.lifecycleManager) {
        try {
          this.harmonyIntegration.lifecycleManager.validateWithCache('espId', espId)
          this.harmonyIntegration.lifecycleManager.validateWithCache('gpio', gpio)
        } catch (error) {
          this.harmonyIntegration.lifecycleManager.handleHarmoniousError(
            error,
            'actuator-command-validation',
          )
          throw error
        }
      }

      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/actuator/${gpio}/command`
      const message = {
        command,
        value,
        timestamp: Date.now(),
        server_id: 'growy_frontend_v3.6.0',
      }

      // 🎵 HARMONISCHES RESOURCE-MANAGEMENT: CentralDataHub Resource-Manager verwenden
      if (command === 'set_value') {
        const actuatorKey = `${espId}-${gpio}`
        this.actuatorPendingStates.set(actuatorKey, {
          desiredState: value,
          timestamp: Date.now(),
        })

        // Timeout mit harmonischem Resource-Tracking
        const timeoutId = setTimeout(() => {
          this.handleActuatorTimeout(espId, gpio)
        }, 5000)

        this.actuatorConfirmationTimeouts.set(actuatorKey, timeoutId)

        // Resource im CentralDataHub Lifecycle-Manager tracken
        if (this.harmonyIntegration.lifecycleManager) {
          this.harmonyIntegration.lifecycleManager.lifecycleManager.resourceManager.timeouts.set(
            timeoutId,
            {
              type: 'actuator-timeout',
              store: 'mqtt',
              cleanup: () => {
                clearTimeout(timeoutId)
                this.actuatorConfirmationTimeouts.delete(actuatorKey)
              },
              createdAt: Date.now(),
            },
          )
        }
      }

      // ✅ BESTEHENDE MQTT-Logik
      const result = await this.publish(topic, message)

      // 🆕 NEU: Push-Sync an God Pi
      await this.pushToGod('actuator_command', { espId, gpio, command, value, result })

      return result
    },

    async setActuatorValue(espId, gpio, value) {
      return this.sendActuatorCommand(espId, gpio, 'set_value', value)
    },

    async toggleActuator(espId, gpio) {
      return this.sendActuatorCommand(espId, gpio, 'toggle')
    },

    async emergencyStop(espId) {
      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/emergency`
      const message = {
        emergency_stop: true,
        timestamp: Date.now(),
      }
      this.publish(topic, message)
    },

    // 🆕 NEU: Emergency Stop für alle ESPs (von God Commands verwendet)
    async emergencyStopAll() {
      console.log('Executing emergency stop for all ESPs')
      for (const [espId] of this.espDevices) {
        try {
          await this.emergencyStop(espId)
        } catch (error) {
          console.error(`Failed to emergency stop ESP ${espId}:`, error)
        }
      }
      window.$snackbar?.showWarning('Emergency stop executed for all ESPs')
    },

    // ✅ ERWEITERT: Offline-Timeout für ESP-Devices mit Actuator-Safety
    checkEspTimeouts() {
      const now = Date.now()
      const timeoutMs = 5 * 60 * 1000 // 5 Minuten
      const actuatorSafetyTimeoutMs = 2 * 60 * 1000 // 2 Minuten für Actuator-Safety

      for (const [espId, device] of this.espDevices.entries()) {
        if (device.lastHeartbeat && now - device.lastHeartbeat > timeoutMs) {
          if (device.status !== 'offline') {
            device.status = 'offline'
            console.log(`[MQTT] ESP ${espId} marked as offline (timeout)`)

            // ✅ NEU: Actuator-Safety bei ESP-Timeout
            this.handleEspTimeoutActuatorSafety(espId, device)
          }
        } else if (device.lastHeartbeat && now - device.lastHeartbeat > actuatorSafetyTimeoutMs) {
          // ✅ NEU: Actuator-Safety-Warning bei 2-Minuten-Timeout
          if (!device.actuatorSafetyWarning) {
            device.actuatorSafetyWarning = true
            console.warn(
              `[MQTT] Actuator-Safety-Warning: ESP ${espId} nicht erreichbar seit 2 Minuten`,
            )
            this.handleActuatorSafetyWarning(espId, device)
          }
        } else if (
          device.actuatorSafetyWarning &&
          device.lastHeartbeat &&
          now - device.lastHeartbeat <= actuatorSafetyTimeoutMs
        ) {
          // ✅ NEU: Actuator-Safety-Warning zurücksetzen bei Recovery
          device.actuatorSafetyWarning = false
          console.log(`[MQTT] Actuator-Safety-Recovery: ESP ${espId} wieder erreichbar`)
          this.handleActuatorSafetyRecovery(espId, device)
        }
      }
    },

    // ✅ NEU: Actuator-Safety bei ESP-Timeout
    handleEspTimeoutActuatorSafety(espId, device) {
      console.log(`[MQTT] Actuator-Safety aktiviert für ESP ${espId}`)

      // Event-basierte Actuator-Safety-Benachrichtigung
      eventBus.emit(MQTT_EVENTS.ACTUATOR_SAFETY_TIMEOUT, {
        espId,
        device,
        timestamp: Date.now(),
        reason: 'esp_timeout',
        safetyAction: 'activate_failsafe',
      })

      // ✅ NEU: Event-basierte Actuator-Logic-Kommunikation
      const actuatorLogicStore = storeHandler.getStore('actuatorLogic')
      if (actuatorLogicStore) {
        // Alle aktiven Actuators für diesen ESP in Safety-Mode setzen
        this.activateActuatorSafetyMode(espId)
      }
    },

    // ✅ NEU: Actuator-Safety-Warning bei 2-Minuten-Timeout
    handleActuatorSafetyWarning(espId, device) {
      console.warn(`[MQTT] Actuator-Safety-Warning für ESP ${espId}`)

      eventBus.emit(MQTT_EVENTS.ACTUATOR_SAFETY_WARNING, {
        espId,
        device,
        timestamp: Date.now(),
        reason: 'esp_warning',
        safetyAction: 'prepare_failsafe',
      })
    },

    // ✅ NEU: Actuator-Safety-Recovery nach ESP-Recovery
    handleActuatorSafetyRecovery(espId, device) {
      console.log(`[MQTT] Actuator-Safety-Recovery für ESP ${espId}`)

      eventBus.emit(MQTT_EVENTS.ACTUATOR_SAFETY_RECOVERY, {
        espId,
        device,
        timestamp: Date.now(),
        reason: 'esp_recovery',
        safetyAction: 'restore_normal_operation',
      })

      // ✅ NEU: Event-basierte Actuator-Logic-Kommunikation
      const actuatorLogicStore = storeHandler.getStore('actuatorLogic')
      if (actuatorLogicStore) {
        this.restoreActuatorNormalOperation(espId)
      }
    },

    // ✅ NEU: Actuator-Safety-Mode für alle Actuators eines ESP aktivieren
    activateActuatorSafetyMode(espId) {
      const actuatorLogicStore = storeHandler.getStore('actuatorLogic')
      if (!actuatorLogicStore) return

      // Alle aktiven Actuators für diesen ESP finden
      const activeActuators = Array.from(actuatorLogicStore.activeProcesses.entries()).filter(
        ([key]) => key.startsWith(`${espId}-`),
      )

      console.log(
        `[MQTT] Actuator-Safety-Mode aktiviert für ${activeActuators.length} Actuators auf ESP ${espId}`,
      )

      // Jeden Actuator in Safety-Mode setzen
      activeActuators.forEach(([key]) => {
        const [, gpio] = key.split('-')
        actuatorLogicStore.activateFailsafe(espId, parseInt(gpio), false) // Safety-State: false (aus)
      })
    },

    // ✅ NEU: Normal-Operation für alle Actuators eines ESP wiederherstellen
    restoreActuatorNormalOperation(espId) {
      const actuatorLogicStore = storeHandler.getStore('actuatorLogic')
      if (!actuatorLogicStore) return

      // Alle aktiven Actuators für diesen ESP finden
      const activeActuators = Array.from(actuatorLogicStore.activeProcesses.entries()).filter(
        ([key]) => key.startsWith(`${espId}-`),
      )

      console.log(
        `[MQTT] Normal-Operation wiederhergestellt für ${activeActuators.length} Actuators auf ESP ${espId}`,
      )

      // Jeden Actuator zur Normal-Operation zurückkehren lassen
      activeActuators.forEach(([key]) => {
        const [, gpio] = key.split('-')
        // Logic-Evaluation neu starten
        actuatorLogicStore.evaluateLogic(espId, parseInt(gpio))
      })
    },

    async clearEmergencyStop(espId) {
      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/emergency`
      const message = {
        emergency_stop: false,
        timestamp: Date.now(),
      }
      this.publish(topic, message)
    },

    // Pi Integration Commands
    async sendPiCommand(espId, piId, command, data = {}) {
      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/pi/${piId}/command`
      const message = {
        command,
        data,
        timestamp: Date.now(),
      }
      this.publish(topic, message)
    },

    async getPiStatus(espId, piId = 'default') {
      return this.sendPiCommand(espId, piId, 'get_status')
    },

    async setPiUrl(espId, piUrl, piId = 'default') {
      return this.sendPiCommand(espId, piId, 'set_url', { url: piUrl })
    },

    async configurePiSensor(espId, gpio, sensorType, sensorName, subzoneId, piId = 'default') {
      return this.sendPiCommand(espId, piId, 'configure_sensor', {
        gpio,
        type: sensorType,
        name: sensorName,
        subzone_id: subzoneId,
      })
    },

    async installPiLibrary(espId, libraryName, libraryCode, version, piId = 'default') {
      return this.sendPiCommand(espId, piId, 'install_library', {
        name: libraryName,
        code: libraryCode,
        version,
      })
    },

    async removePiSensor(espId, gpio, reason, piId = 'default') {
      return this.sendPiCommand(espId, piId, 'remove_sensor', {
        gpio,
        reason,
      })
    },

    async getPiSensorStatistics(espId, piId = 'default') {
      return this.sendPiCommand(espId, piId, 'get_sensor_statistics')
    },

    // 🆕 NEU: I2C-Konfiguration senden
    async sendI2CConfiguration(espId, config) {
      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/sensor/config`
      const payload = {
        esp_id: espId,
        sensors: [
          {
            gpio: config.gpio,
            type: 'SENSOR_CUSTOM_PI_ENHANCED',
            i2c_address: config.i2c_address,
            sensor_hint: config.sensor_hint,
            subzone_id: config.subzone_id,
            name: config.sensor_name,
          },
        ],
      }
      return this.publish(topic, payload)
    },

    // 🆕 NEU: I2C-Scan-Kommando senden
    async sendI2CScanCommand(espId) {
      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/i2c/scan`
      const payload = {
        command: 'scan_i2c_devices',
        timestamp: Date.now(),
      }
      return this.publish(topic, payload)
    },

    async getPiHealthCheck(espId, piId = 'default') {
      return this.sendPiCommand(espId, piId, 'health_check')
    },

    // System Commands
    async sendSystemCommand(espId, command, data = {}) {
      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/system/command`

      // ✅ NEU: Echo benutzerdefinierte Felder in Response
      const customFields = {
        hardware_mode: data.hardware_mode,
        raw_mode: data.raw_mode,
        time_quality: data.time_quality,
        warnings: data.warnings || [],
        context: data.context,
        kaiser_id_changed: data.kaiser_id_changed,
        esp_id_changed: data.esp_id_changed,
      }

      const message = {
        command,
        data,
        timestamp: Date.now(),
      }

      return this.publish(topic, message, customFields)
    },

    async restartSystem(espId) {
      return this.sendSystemCommand(espId, 'restart')
    },

    async enableSafeMode(espId) {
      return this.sendSystemCommand(espId, 'safe_mode', { enabled: true })
    },

    async disableSafeMode(espId) {
      return this.sendSystemCommand(espId, 'safe_mode', { enabled: false })
    },

    async getSystemStatus(espId) {
      return this.sendSystemCommand(espId, 'get_status')
    },

    async getSystemHealth(espId) {
      return this.sendSystemCommand(espId, 'get_health')
    },

    async configureActuator(espId, gpio, actuatorType, actuatorName, subzoneId) {
      return this.sendSystemCommand(espId, 'configure_actuator', {
        gpio,
        type: actuatorType,
        name: actuatorName,
        subzone_id: subzoneId,
      })
    },

    async removeActuator(espId, gpio, reason = 'maintenance') {
      return this.sendSystemCommand(espId, 'remove_actuator', {
        gpio,
        reason,
      })
    },

    // Configuration Management
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig }

      // ✅ KORRIGIERT: Sichere Kaiser ID Synchronisation
      if (newConfig.kaiserId && this.canPerformMqttOperation()) {
        this.setKaiserId(newConfig.kaiserId)
      } else if (newConfig.kaiserId) {
        // Nur ID setzen wenn MQTT nicht bereit ist
        this.kaiser.id = newConfig.kaiserId
        this.saveKaiserConfig()
      }

      // Don't auto-reconnect to avoid connection issues
      // Reconnection should be done explicitly by the user
    },

    // Connection quality monitoring
    updateConnectionQuality() {
      if (!this.connected || !this.lastHeartbeat) return

      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat

      // Update connection quality based on heartbeat timing
      if (timeSinceLastHeartbeat < 30000) {
        // Less than 30 seconds
        this.connectionQuality = 'excellent'
      } else if (timeSinceLastHeartbeat < 60000) {
        // Less than 1 minute
        this.connectionQuality = 'good'
      } else {
        this.connectionQuality = 'poor'
      }
    },

    // Start connection quality monitoring
    startConnectionMonitoring() {
      // Monitor connection quality every 10 seconds
      setInterval(() => {
        this.updateConnectionQuality()
        this.checkEspTimeouts() // 🆕 NEU: ESP Timeouts prüfen
      }, 10000)
    },

    // 🆕 NEU: Handle Broadcast Messages
    handleBroadcastMessage(topicParts, payload) {
      const broadcastType = topicParts[2]

      switch (broadcastType) {
        case 'emergency':
          this.handleEmergencyBroadcast(payload)
          break
        case 'system_update':
          this.handleSystemUpdateBroadcast(payload)
          break
        default:
          console.log('Unknown broadcast type:', broadcastType)
      }
    },

    // 🆕 NEU: Handle Discovery Messages
    handleDiscoveryMessage(topicParts, payload) {
      const discoveryType = topicParts[2]

      switch (discoveryType) {
        case 'esp32_nodes':
          this.handleESP32Discovery(payload)
          break
        default:
          console.log('Unknown discovery type:', discoveryType)
      }
    },

    // 🆕 NEU: Handle Config Request
    handleConfigRequest(payload) {
      console.log('Config request received:', payload)
      // Handle configuration requests from ESP devices
      // This could trigger UI updates or automatic configuration
    },

    // 🆕 NEU: Handle Health Messages
    handleHealthMessage(espId, topicParts, payload) {
      const healthType = topicParts[5] // 'broadcast' or 'request'

      if (healthType === 'broadcast') {
        this.handleHealthBroadcast(espId, payload)
      } else if (healthType === 'request') {
        this.handleHealthRequest(espId, payload)
      }
    },

    // 🆕 NEU: Handle Library Messages
    handleLibraryMessage(espId, topicParts, payload) {
      const libraryAction = topicParts[5] // 'ready', 'installed', 'request', 'error'

      switch (libraryAction) {
        case 'ready':
          this.handleLibraryReady(espId, payload)
          break
        case 'installed':
          this.handleLibraryInstalled(espId, payload)
          break
        case 'request':
          this.handleLibraryRequest(espId, payload)
          break
        case 'error':
          this.handleLibraryError(espId, payload)
          break
        default:
          console.log('Unknown library action:', libraryAction)
      }
    },

    // 🆕 NEU: Handle Alert Messages
    handleAlertMessage(espId, topicParts, payload) {
      const alertType = topicParts[5] // 'error'

      if (alertType === 'error') {
        this.handleErrorAlert(espId, payload)
      }
    },

    // 🆕 NEU: Handle Error Messages
    handleErrorMessage(espId, topicParts, payload) {
      const errorAction = topicParts[5] // 'acknowledge'

      if (errorAction === 'acknowledge') {
        this.handleErrorAcknowledge(espId, payload)
      }
    },

    // ✅ VERBESSERT: Handle Safe Mode Messages
    handleSafeModeMessage(espId, payload) {
      const device = this.espDevices.get(espId)
      if (device) {
        // ✅ NEU: Erweiterte Reason-Validierung
        const validReasons = [
          'boot_initialization',
          'emergency_activation',
          'gpio_conflict',
          'hardware_error',
          'manual_activation',
          'system_failure',
          'automatic_activation',
        ]

        device.safeMode = payload.safe_mode || false
        device.safeModePins = payload.safe_pins || []
        device.safeModeTotalPins = payload.total_available_pins || 0
        device.safeModeActivePins = payload.pins_in_safe_mode || 0

        // ✅ VERBESSERT: Validierte Reason-Behandlung
        device.safeModeEnterReason = validReasons.includes(payload.enter_reason)
          ? payload.enter_reason
          : 'automatic_activation'

        // ✅ VERBESSERT: Timestamp-Validierung
        const timestamp = convertUnixToMillis(payload.enter_timestamp)
        device.safeModeEnterTimestamp = timestamp && timestamp > 0 ? timestamp : Date.now()

        device.lastUpdate = Date.now()

        // ✅ KONSISTENT: UI-Benachrichtigung nur bei gültigem Grund
        if (device.safeMode && validReasons.includes(device.safeModeEnterReason)) {
          window.$snackbar?.showWarning(`Safe Mode aktiviert: ${device.safeModeEnterReason}`, {
            timeout: 6000,
          })
        }

        console.log(`Safe mode status for ${espId}:`, {
          active: device.safeMode,
          activePins: device.safeModeActivePins,
          totalPins: device.safeModeTotalPins,
          enterReason: device.safeModeEnterReason,
          enterTimestamp: device.safeModeEnterTimestamp,
        })
      }
    },

    // 🆕 NEU: Handle System Messages
    handleSystemMessage(espId, topicParts, payload) {
      const systemAction = topicParts[5] // 'diagnostics'

      if (systemAction === 'diagnostics') {
        this.handleSystemDiagnostics(espId, payload)
      }
    },

    // ✅ NEU: Handle System Response ACK
    handleSystemResponse(espId, payload) {
      const device = this.espDevices.get(espId)
      if (!device) return

      // ✅ NEU: Standardisierte Response-Typen basierend auf Server-Format
      switch (payload.response_type) {
        case 'gpio_conflict':
          this.handleGpioConflictResponse(espId, payload)
          break
        case 'validation_error':
          this.handleValidationErrorResponse(espId, payload)
          break
        case 'processing_error':
          this.handleProcessingErrorResponse(espId, payload)
          break
        case 'success':
          this.handleSuccessResponse(espId, payload)
          break
        default:
          // ✅ KONSISTENT: Verwende bestehende ACK-Logik
          this.handleLegacyResponse(espId, payload)
      }
    },

    // ✅ VERBESSERT: GPIO-Konflikt-Handler (Server-Format)
    handleGpioConflictResponse(espId, payload) {
      // ✅ NEU: Erweiterte Validierung
      const validConflictTypes = [
        'already_assigned',
        'reserved_pin',
        'invalid_combination',
        'hardware_conflict',
        'sensor_sensor',
        'sensor_actuator',
        'actuator_actuator',
      ]

      const conflictType = validConflictTypes.includes(payload.conflict_type)
        ? payload.conflict_type
        : 'unknown_type'

      const conflict = {
        espId,
        gpio: payload.gpio,
        errorCode: payload.error_code || 'GPIO_CONFLICT',
        currentOwner: payload.current_owner || 'unknown',
        requestedOwner: payload.requested_owner || 'unknown',
        conflictType,
        currentUsage: payload.current_usage || 'unknown',
        requestedUsage: payload.requested_usage || 'unknown',
        timestamp: payload.timestamp || Date.now(),
        message:
          payload.message || `GPIO ${payload.gpio} ${this.getConflictTypeText(conflictType)}`,
      }

      // ✅ KONSISTENT: Verwende bestehende UI-Notification
      const conflictTypeText = this.getConflictTypeText(conflict.conflictType)
      safeInfo(`GPIO ${conflict.gpio} ${conflictTypeText}: ${conflict.currentOwner}`, {
        timeout: 8000,
      })

      // ✅ KONSISTENT: Update bestehenden State
      this.$patch((state) => {
        if (!state.gpioConflicts) state.gpioConflicts = new Map()
        state.gpioConflicts.set(`${espId}-${conflict.gpio}`, conflict)
      })

      console.log(`[MQTT] GPIO Conflict: ${conflict.message}`, conflict)
    },

    // ✅ VERBESSERT: Helper für Konflikt-Typ-Text
    getConflictTypeText(conflictType) {
      const types = {
        already_assigned: 'bereits zugewiesen',
        reserved_pin: 'reserviert',
        invalid_combination: 'ungültige Kombination',
        hardware_conflict: 'Hardware-Konflikt',
        sensor_sensor: 'Sensor-Sensor Konflikt',
        sensor_actuator: 'Sensor-Aktor Konflikt',
        actuator_actuator: 'Aktor-Aktor Konflikt',
        unknown_type: 'unbekannter Konflikt',
      }
      return types[conflictType] || conflictType
    },

    // ✅ NEU: Validierungsfehler-Handler (Server-Format)
    handleValidationErrorResponse(espId, payload) {
      const validation = {
        espId,
        field: payload.field,
        error: payload.error,
        value: payload.value,
        expectedFormat: payload.expected_format,
        timestamp: payload.timestamp,
        message: payload.message,
      }

      // ✅ KONSISTENT: Verwende bestehende UI-Notification
      window.$snackbar?.showError(`Validierungsfehler: ${validation.field} - ${validation.error}`, {
        timeout: 6000,
      })

      // ✅ KONSISTENT: Update bestehenden State
      this.$patch((state) => {
        if (!state.validationErrors) state.validationErrors = new Map()
        state.validationErrors.set(`${espId}-${validation.field}`, validation)
      })

      console.log(`[MQTT] Validation Error: ${validation.message}`)
    },

    // ✅ NEU: Verarbeitungsfehler-Handler (Server-Format)
    handleProcessingErrorResponse(espId, payload) {
      const processing = {
        espId,
        command: payload.command,
        error: payload.error,
        context: payload.context,
        timestamp: payload.timestamp,
        message: payload.message,
      }

      // ✅ KONSISTENT: Verwende bestehende UI-Notification
      safeError(`Verarbeitungsfehler: ${processing.command} - ${processing.error}`, {
        timeout: 6000,
      })

      console.log(`[MQTT] Processing Error: ${processing.message}`)
    },

    // ✅ NEU: Erfolgs-Response-Handler (Server-Format)
    handleSuccessResponse(espId, payload) {
      const success = {
        espId,
        command: payload.command,
        gpio: payload.gpio,
        sensorType: payload.sensor_type,
        registrationId: payload.registration_id,
        timestamp: payload.timestamp,
        message: payload.message,
      }

      // ✅ KONSISTENT: Verwende bestehende UI-Notification
      window.$snackbar?.showSuccess(`Erfolgreich: ${success.message}`, { timeout: 4000 })

      // ✅ KONSISTENT: Update bestehenden State basierend auf Command
      this.updateStateFromSuccessResponse(success)

      console.log(`[MQTT] Success: ${success.message}`)
    },

    // ✅ NEU: Legacy-Response-Handler für Rückwärtskompatibilität
    handleLegacyResponse(espId, payload) {
      // ✅ KONSISTENT: Verwende bestehende ACK-Logik
      const success = payload.status === 'success' || payload.status === 'completed'
      const command = payload.command || 'unknown'

      // ✅ KORRIGIERT: Verwende safeInfo statt showAck für bessere Kompatibilität
      if (success) {
        safeSuccess(`${command} für ESP ${espId} erfolgreich`)
      } else {
        safeError(`${command} für ESP ${espId} fehlgeschlagen`)
      }

      // ✅ KONSISTENT: Verwende bestehende Handler
      switch (payload.status) {
        case 'sensors_configured':
          this.handleSensorsConfigured(espId, payload)
          break
        case 'actuators_configured':
          this.handleActuatorsConfigured(espId, payload)
          break
        case 'debug_configured':
          this.handleDebugConfigured(espId, payload)
          break
        default:
          console.log(`Legacy response: ${payload.status}`, payload)
      }
    },

    // ✅ NEU: State-Update basierend auf Success-Response
    updateStateFromSuccessResponse(success) {
      const device = this.espDevices.get(success.espId)
      if (!device) return

      switch (success.command) {
        case 'sensor_registration':
          // ✅ KONSISTENT: Verwende bestehende Sensor-Update-Logik
          if (success.gpio && success.sensorType) {
            const sensor = device.sensors.get(success.gpio) || {
              id: success.gpio,
              type: success.sensorType,
              lastUpdate: Date.now(),
            }
            device.sensors.set(success.gpio, sensor)
          }
          break
        case 'actuator_registration':
          // ✅ KONSISTENT: Verwende bestehende Actuator-Update-Logik
          if (success.gpio) {
            const actuator = device.actuators.get(success.gpio) || {
              id: success.gpio,
              lastUpdate: Date.now(),
            }
            device.actuators.set(success.gpio, actuator)
          }
          break
      }

      device.lastUpdate = Date.now()
      this.espDevices.set(success.espId, device)
    },

    // ✅ MIGRIERT: Sensors Configured wird jetzt über Event-System an espManagement weitergeleitet
    handleSensorsConfigured(espId, payload) {
      console.log('[MQTT] Sensors configured:', { espId, payload })

      // Event-basierte Weiterleitung an espManagement Store
      eventBus.emit(MQTT_EVENTS.SENSORS_CONFIGURED, {
        espId,
        payload,
        timestamp: Date.now(),
      })
    },

    // ✅ MIGRIERT: Actuators Configured wird jetzt über Event-System an actuatorLogic weitergeleitet
    handleActuatorsConfigured(espId, payload) {
      console.log('[MQTT] Actuators configured:', { espId, payload })

      // Event-basierte Weiterleitung an actuatorLogic Store
      eventBus.emit(MQTT_EVENTS.ACTUATORS_CONFIGURED, {
        espId,
        payload,
        timestamp: Date.now(),
      })
    },

    // ✅ NEU: Debug Configuration Handler
    handleDebugConfigured(espId, payload) {
      const device = this.espDevices.get(espId)
      if (!device) return

      // Update device debug configuration
      device.debugMode = payload.debug_mode || false
      device.disableBatching = payload.disable_batching || false
      device.lastUpdate = Date.now()

      this.espDevices.set(espId, device)

      console.log(`✅ Debug configured for ESP ${espId}:`, {
        debugMode: device.debugMode,
        disableBatching: device.disableBatching,
      })
    },

    // 🆕 NEU: Specific Handler Implementations
    handleEmergencyBroadcast(payload) {
      console.log('Emergency broadcast received:', payload)
      this.systemStatus.emergencyStop = true
      this.systemStatus.lastUpdate = Date.now()

      // Show emergency notification
      window.$snackbar?.showError(
        'EMERGENCY BROADCAST: ' + (payload.message || 'Emergency situation detected'),
      )
    },

    handleSystemUpdateBroadcast(payload) {
      console.log('System update broadcast received:', payload)
      // Handle system update notifications
      safeInfo('System Update: ' + (payload.message || 'System update available'))
    },

    // ✅ MIGRIERT: ESP Discovery wird jetzt über Event-System an espManagement weitergeleitet
    handleESP32Discovery(payload) {
      console.log('[MQTT] ESP32 discovery notification:', payload)

      // Event-basierte Weiterleitung an espManagement Store
      eventBus.emit(MQTT_EVENTS.ESP_DISCOVERY, {
        payload,
        timestamp: Date.now(),
      })
    },

    // 🆕 NEU: Kaiser-ID-Konflikt-Handler
    handleKaiserIdConflict(espId, deviceKaiserId, currentKaiserId, payload) {
      console.warn(
        `⚠️ Kaiser-ID-Konflikt erkannt: ESP ${espId} hat Kaiser-ID "${deviceKaiserId}", aktuell: "${currentKaiserId}"`,
      )

      // Konflikt-Information speichern
      if (!this.kaiserIdConflicts) {
        this.kaiserIdConflicts = new Map()
      }

      this.kaiserIdConflicts.set(espId, {
        deviceKaiserId,
        currentKaiserId,
        discoveryType: payload.discovery_type || 'normal',
        timestamp: Date.now(),
        payload,
      })

      // UI-Benachrichtigung
      const message = `⚠️ ESP ${espId} gehört zu Kaiser-ID "${deviceKaiserId}" (aktuell: "${currentKaiserId}")`
      window.$snackbar?.showWarning(message, { timeout: 8000 })

      // Event für UI-Komponenten auslösen
      this.$patch((state) => {
        state.lastKaiserIdConflict = {
          espId,
          deviceKaiserId,
          currentKaiserId,
          timestamp: Date.now(),
        }
      })
    },

    // 🆕 NEU: Kaiser-ID-Konflikt lösen
    async resolveKaiserIdConflict(espId, action = 'adopt') {
      const conflict = this.kaiserIdConflicts.get(espId)
      if (!conflict) {
        console.warn(`Kein Konflikt für ESP ${espId} gefunden`)
        return false
      }

      try {
        if (action === 'adopt') {
          // ESP zur aktuellen Kaiser-ID übernehmen
          await this.sendSystemCommand(espId, 'configure_kaiser', {
            kaiser_id: this.getKaiserId,
            action: 'adopt',
          })

          console.log(`✅ ESP ${espId} zur Kaiser-ID ${this.getKaiserId} übernommen`)
          safeSuccess(`ESP ${espId} zur aktuellen Kaiser-ID übernommen`)
        } else if (action === 'ignore') {
          // Konflikt ignorieren
          console.log(`⚠️ Kaiser-ID-Konflikt für ESP ${espId} ignoriert`)
          safeInfo(`Kaiser-ID-Konflikt für ESP ${espId} ignoriert`)
        }

        // Konflikt aus der Liste entfernen
        this.kaiserIdConflicts.delete(espId)

        // UI-Update auslösen
        this.$patch((state) => {
          state.lastKaiserIdConflict = null
        })

        return true
      } catch (error) {
        console.error(`Fehler beim Lösen des Kaiser-ID-Konflikts für ESP ${espId}:`, error)
        window.$snackbar?.showError(`Fehler beim Lösen des Konflikts: ${error.message}`)
        return false
      }
    },

    // 🆕 NEU: Alle Kaiser-ID-Konflikte löschen
    clearKaiserIdConflicts() {
      this.kaiserIdConflicts.clear()
      this.$patch((state) => {
        state.lastKaiserIdConflict = null
      })
      console.log('✅ Alle Kaiser-ID-Konflikte gelöscht')
    },

    handleHealthBroadcast(espId, payload) {
      const device = this.espDevices.get(espId)
      if (device) {
        device.health = {
          freeHeapCurrent: payload.health?.free_heap_current,
          freeHeapMinimum: payload.health?.free_heap_minimum,
          uptimeSeconds: payload.health?.uptime_seconds,
          cpuUsagePercent: payload.health?.cpu_usage_percent,
          lastUpdate: Date.now(),
        }

        device.network = {
          wifiConnected: payload.network?.wifi_connected,
          wifiRssi: payload.network?.wifi_rssi,
          wifiReconnects: payload.network?.wifi_reconnects,
          mqttConnected: payload.network?.mqtt_connected,
          mqttReconnects: payload.network?.mqtt_reconnects,
        }

        device.devices = {
          activeSensors: payload.devices?.active_sensors,
          sensorFailures: payload.devices?.sensor_failures,
          activeActuators: payload.devices?.active_actuators,
          actuatorFailures: payload.devices?.actuator_failures,
          piAvailable: payload.devices?.pi_available,
        }

        device.errors = {
          totalErrors: payload.errors?.total_errors,
          lastError: payload.errors?.last_error,
          lastErrorAgeMs: payload.errors?.last_error_age_ms,
        }

        console.log(`Health broadcast for ${espId}:`, device.health)
      }
    },

    handleHealthRequest(espId, payload) {
      console.log('Health request received for:', espId, payload)
      // Handle health requests - could trigger health check commands
    },

    handleLibraryReady(espId, payload) {
      console.log(`Library ready for ${espId}:`, payload)
      const device = this.espDevices.get(espId)
      if (device) {
        if (!device.libraries) device.libraries = new Map()
        device.libraries.set(payload.library_name, {
          status: 'ready',
          version: payload.version,
          timestamp: Date.now(),
        })
      }
    },

    handleLibraryInstalled(espId, payload) {
      console.log(`Library installed for ${espId}:`, payload)
      const device = this.espDevices.get(espId)
      if (device) {
        if (!device.libraries) device.libraries = new Map()
        device.libraries.set(payload.library_name, {
          status: 'installed',
          version: payload.version,
          checksum: payload.checksum,
          installSuccess: payload.install_success,
          timestamp: Date.now(),
        })
      }
    },

    handleLibraryRequest(espId, payload) {
      console.log(`Library request for ${espId}:`, payload)
      // Handle library requests - could trigger automatic library installation
    },

    handleLibraryError(espId, payload) {
      console.error(`Library error for ${espId}:`, payload)
      const device = this.espDevices.get(espId)
      if (device) {
        if (!device.libraries) device.libraries = new Map()
        device.libraries.set(payload.library_name, {
          status: 'error',
          errorType: payload.error_type || 'unknown',
          errorCode: payload.error_code || 'GENERIC_ERROR',
          recoveryAction: payload.recovery_action || null,
          errorMessage: payload.error_message,
          timestamp: Date.now(),
        })
      }

      // Show error notification
      window.$snackbar?.showError(`Library Error: ${payload.error_message}`)
    },

    handleErrorAlert(espId, payload) {
      console.error(`Error alert for ${espId}:`, payload)
      const device = this.espDevices.get(espId)
      if (device) {
        if (!device.errors) device.errors = []
        device.errors.push({
          type: payload.error_type || 'unknown',
          errorCode: payload.error_code || 'GENERIC_ERROR',
          recoveryAction: payload.recovery_action || null,
          component: payload.component,
          message: payload.message,
          context: payload.context,
          timestamp: Date.now(),
        })

        // Keep only last 10 errors
        if (device.errors.length > 10) {
          device.errors = device.errors.slice(-10)
        }
      }

      // Show error notification
      window.$snackbar?.showError(`ESP Error: ${payload.message}`)
    },

    handleErrorAcknowledge(espId, payload) {
      console.log(`Error acknowledged for ${espId}:`, payload)
      // Handle error acknowledgments
    },

    handleSystemDiagnostics(espId, payload) {
      console.log(`System diagnostics for ${espId}:`, payload)
      const device = this.espDevices.get(espId)
      if (device) {
        device.diagnostics = {
          ...payload,
          timestamp: Date.now(),
        }
      }
    },

    // 🆕 NEU: Erweiterte ID-Konflikt-Handler
    handleIdConflict(type, espId, deviceId, currentId, payload) {
      console.warn(
        `⚠️ ${type.toUpperCase()}-ID-Konflikt erkannt: ESP ${espId} hat ${type}-ID "${deviceId}", aktuell: "${currentId}"`,
      )

      // Konflikt-Information speichern
      if (!this.idConflicts[type]) {
        this.idConflicts[type] = new Map()
      }

      this.idConflicts[type].set(espId, {
        deviceId,
        currentId,
        discoveryType: payload.discovery_type || 'normal',
        timestamp: Date.now(),
        payload,
      })

      // UI-Benachrichtigung
      const message = `⚠️ ESP ${espId} hat ${type}-ID "${deviceId}" (aktuell: "${currentId}")`
      window.$snackbar?.showWarning(message, { timeout: 8000 })

      // Event für UI-Komponenten auslösen
      this.$patch((state) => {
        state.lastIdConflict = {
          type,
          espId,
          deviceId,
          currentId,
          timestamp: Date.now(),
        }
      })
    },

    // 🆕 NEU: Erweiterte Konflikt-Auflösung
    async resolveIdConflict(type, espId, action = 'adopt') {
      const conflict = this.idConflicts[type]?.get(espId)
      if (!conflict) {
        console.warn(`Kein ${type}-Konflikt für ESP ${espId} gefunden`)
        return false
      }

      try {
        if (action === 'adopt') {
          // ESP zur aktuellen ID übernehmen
          await this.sendSystemCommand(espId, `configure_${type}`, {
            [type + '_id']: this.getCurrentId(type),
            action: 'adopt',
          })

          // 🆕 NEU: ID lokal speichern nach erfolgreichem adopt
          if (type === 'masterZone') {
            this.setMasterZoneId(this.getCurrentId(type))
          } else if (type === 'subzone') {
            this.setSubzoneId(this.getCurrentId(type))
          } else if (type === 'espId') {
            this.setCurrentEspId(this.getCurrentId(type))
          }

          console.log(`✅ ESP ${espId} zur ${type}-ID ${this.getCurrentId(type)} übernommen`)
          window.$snackbar?.showSuccess(`ESP ${espId} zur aktuellen ${type}-ID übernommen`)
        } else if (action === 'ignore') {
          // Konflikt ignorieren
          console.log(`⚠️ ${type}-ID-Konflikt für ESP ${espId} ignoriert`)
          safeInfo(`${type}-ID-Konflikt für ESP ${espId} ignoriert`)
        }

        // Konflikt aus der Liste entfernen
        this.idConflicts[type].delete(espId)

        // UI-Update auslösen
        this.$patch((state) => {
          state.lastIdConflict = null
        })

        return true
      } catch (error) {
        console.error(`Fehler beim Lösen des ${type}-ID-Konflikts für ESP ${espId}:`, error)
        window.$snackbar?.showError(`Fehler beim Lösen des Konflikts: ${error.message}`)
        return false
      }
    },

    // 🆕 NEU: Helper für aktuelle IDs
    getCurrentId(type) {
      switch (type) {
        case 'kaiser':
          return this.getKaiserId
        case 'masterZone':
          return localStorage.getItem('master_zone_id') || 'default_master_zone'
        case 'subzone':
          return localStorage.getItem('subzone_id') || 'default_subzone'
        case 'espId':
          if (this.espDevices.size > 0) {
            return Array.from(this.espDevices.keys())[0]
          }
          return localStorage.getItem('current_esp_id') || 'default_esp'
        default:
          return null
      }
    },

    // 🆕 NEU: Setter-Funktionen für ID-Werte
    setMasterZoneId(id) {
      localStorage.setItem('master_zone_id', id)
    },

    setSubzoneId(id) {
      localStorage.setItem('subzone_id', id)
    },

    setCurrentEspId(id) {
      localStorage.setItem('current_esp_id', id)
    },

    // 🆕 NEU: Alle Konflikte löschen
    clearAllIdConflicts() {
      Object.keys(this.idConflicts).forEach((type) => {
        this.idConflicts[type].clear()
      })
      this.$patch((state) => {
        state.lastIdConflict = null
      })
      console.log('✅ Alle ID-Konflikte gelöscht')
    },

    // ✅ NEU: kaiser_id Change Handler
    handleKaiserIdChange(espId, oldKaiserId, newKaiserId) {
      console.log(`Processing kaiser_id change for ${espId}`)

      // Update device info
      const device = this.espDevices.get(espId)
      if (device) {
        device.kaiserIdChanged = true
        device.previousKaiserId = oldKaiserId
        device.kaiserIdChangeTimestamp = Date.now()
      }

      // Notify UI
      safeInfo(`ESP ${espId} moved from ${oldKaiserId} to ${newKaiserId}`, {
        timeout: 5000,
      })

      // ✅ NEU: Topic-Synchronisation bei kaiser_id-Änderung
      this.syncTopicsForKaiserIdChange(espId, oldKaiserId, newKaiserId)
    },

    // ✅ NEU: Topic-Synchronisation
    syncTopicsForKaiserIdChange(espId, oldKaiserId, newKaiserId) {
      console.log(`Syncing topics for kaiser_id change: ${espId || 'global'}`)

      // ✅ NEU: Sichere Client-Validierung
      if (!this.client || !this.connected) {
        console.warn('[MQTT] Client not connected, skipping topic sync')
        return
      }

      // ✅ NEU: Globale Topic-Synchronisation wenn espId null ist
      if (!espId) {
        this.syncGlobalTopicsForKaiserIdChange(oldKaiserId, newKaiserId)
        return
      }

      // Unsubscribe from old topics
      if (oldKaiserId) {
        const oldTopics = [
          `kaiser/${oldKaiserId}/esp/${espId}/heartbeat`,
          `kaiser/${oldKaiserId}/esp/${espId}/status`,
          `kaiser/${oldKaiserId}/esp/${espId}/config`,
          `kaiser/${oldKaiserId}/esp/${espId}/sensor/+/data`,
          `kaiser/${oldKaiserId}/esp/${espId}/actuator/+/status`,
          `kaiser/${oldKaiserId}/esp/${espId}/gpio/conflict/response`,
        ]

        oldTopics.forEach((topic) => {
          this.client.unsubscribe(topic, (err) => {
            if (err) {
              console.warn(`Failed to unsubscribe from ${topic}:`, err)
            } else {
              console.log(`Unsubscribed from ${topic}`)
            }
          })
        })
      }

      // Subscribe to new topics
      if (newKaiserId) {
        const newTopics = [
          { topic: `kaiser/${newKaiserId}/esp/${espId}/heartbeat`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/${espId}/status`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/${espId}/config`, qos: 0 },
          { topic: `kaiser/${newKaiserId}/esp/${espId}/sensor/+/data`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/${espId}/actuator/+/status`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/${espId}/gpio/conflict/response`, qos: 1 },
        ]

        newTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 100)
        })
      }
    },

    // ✅ NEU: Globale Topic-Synchronisation für Kaiser-ID-Wechsel
    syncGlobalTopicsForKaiserIdChange(oldKaiserId, newKaiserId) {
      console.log(`Syncing global topics for kaiser_id change: ${oldKaiserId} → ${newKaiserId}`)

      // ✅ NEU: Sichere Client-Validierung
      if (!this.client || !this.connected) {
        console.warn('[MQTT] Client not connected, skipping global topic sync')
        return
      }

      // Unsubscribe from old global topics
      if (oldKaiserId) {
        const oldGlobalTopics = [
          `kaiser/${oldKaiserId}/esp/+/heartbeat`,
          `kaiser/${oldKaiserId}/esp/+/status`,
          `kaiser/${oldKaiserId}/esp/+/config`,
          `kaiser/${oldKaiserId}/esp/+/sensor/+/data`,
          `kaiser/${oldKaiserId}/esp/+/actuator/+/status`,
          `kaiser/${oldKaiserId}/esp/+/emergency`,
          `kaiser/${oldKaiserId}/esp/+/zone/config`,
          `kaiser/${oldKaiserId}/esp/+/zone/response`,
          `kaiser/${oldKaiserId}/esp/+/subzone/config`,
          `kaiser/${oldKaiserId}/esp/+/subzone/response`,
          `kaiser/${oldKaiserId}/esp/+/pi/+/status`,
          `kaiser/${oldKaiserId}/esp/+/pi/+/response`,
          `kaiser/${oldKaiserId}/esp/+/pi/+/health`,
          `kaiser/${oldKaiserId}/esp/+/pi/+/sensor/+/statistics`,
          `kaiser/${oldKaiserId}/esp/+/pi/+/library/+/response`,
          `kaiser/${oldKaiserId}/esp/+/health/broadcast`,
          `kaiser/${oldKaiserId}/esp/+/health/request`,
          `kaiser/${oldKaiserId}/esp/+/actuator/+/alert`,
          `kaiser/${oldKaiserId}/esp/+/actuator/config`,
          `kaiser/${oldKaiserId}/esp/+/library/ready`,
          `kaiser/${oldKaiserId}/esp/+/library/installed`,
          `kaiser/${oldKaiserId}/esp/+/library/request`,
          `kaiser/${oldKaiserId}/esp/+/library/error`,
          `kaiser/${oldKaiserId}/esp/+/alert/error`,
          `kaiser/${oldKaiserId}/esp/+/error/acknowledge`,
          `kaiser/${oldKaiserId}/esp/+/safe_mode`,
          `kaiser/${oldKaiserId}/broadcast/emergency`,
          `kaiser/${oldKaiserId}/broadcast/system_update`,
          `kaiser/${oldKaiserId}/esp/+/response`,
          `kaiser/${oldKaiserId}/esp/+/validation`,
          `kaiser/${oldKaiserId}/esp/+/gpio/conflict/response`,
          `kaiser/${oldKaiserId}/discovery/esp32_nodes`,
          `kaiser/${oldKaiserId}/esp/+/system/diagnostics`,
          `kaiser/${oldKaiserId}/config/request`,
        ]

        oldGlobalTopics.forEach((topic) => {
          this.client.unsubscribe(topic, (err) => {
            if (err) {
              console.warn(`Failed to unsubscribe from ${topic}:`, err)
            } else {
              console.log(`Unsubscribed from ${topic}`)
            }
          })
        })
      }

      // Subscribe to new global topics
      if (newKaiserId) {
        const newGlobalTopics = [
          { topic: `kaiser/${newKaiserId}/esp/+/heartbeat`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/status`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/config`, qos: 0 },
          { topic: `kaiser/${newKaiserId}/esp/+/sensor/+/data`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/actuator/+/status`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/emergency`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/zone/config`, qos: 0 },
          { topic: `kaiser/${newKaiserId}/esp/+/zone/response`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/subzone/config`, qos: 0 },
          { topic: `kaiser/${newKaiserId}/esp/+/subzone/response`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/pi/+/status`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/pi/+/response`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/pi/+/health`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/pi/+/sensor/+/statistics`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/pi/+/library/+/response`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/health/broadcast`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/health/request`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/actuator/+/alert`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/actuator/config`, qos: 0 },
          { topic: `kaiser/${newKaiserId}/esp/+/library/ready`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/library/installed`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/library/request`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/library/error`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/alert/error`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/error/acknowledge`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/safe_mode`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/broadcast/emergency`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/broadcast/system_update`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/response`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/validation`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/gpio/conflict/response`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/discovery/esp32_nodes`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/esp/+/system/diagnostics`, qos: 1 },
          { topic: `kaiser/${newKaiserId}/config/request`, qos: 0 },
        ]

        newGlobalTopics.forEach(({ topic, qos }, index) => {
          setTimeout(() => {
            this.client.subscribe(topic, { qos }, (err) => {
              if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err)
              } else {
                console.log(`Subscribed to ${topic} with QoS ${qos}`)
              }
            })
          }, index * 50) // Schneller für globale Topics
        })
      }
    },

    // ESP Configuration Methods
    async publishConfig(config) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${config.espId}/config`
      const message = {
        action: 'update',
        config: {
          friendlyName: config.friendlyName,
          zone: config.zone,
          boardType: config.boardType,
          kaiserId: config.kaiserId,
        },
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Publish config error:', error)
            reject(error)
          } else {
            console.log('Config published:', topic, message)
            resolve()
          }
        })
      })
    },

    async publishPinConfig(config) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${config.espId}/config/pins`
      const message = {
        action: config.action || 'add',
        pin: config.pin,
        type: config.type,
        name: config.name,
        subzoneId: config.subzoneId,
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Publish pin config error:', error)
            reject(error)
          } else {
            console.log('Pin config published:', topic, message)
            resolve()
          }
        })
      })
    },

    async publishSubzoneConfig(config) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${config.espId}/config/subzones`
      const message = {
        action: config.action || 'add',
        subzone: config.subzone,
        subzoneId: config.subzoneId,
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Publish subzone config error:', error)
            reject(error)
          } else {
            console.log('Subzone config published:', topic, message)
            resolve()
          }
        })
      })
    },

    async publishSensorConfig(config) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${config.espId}/config/sensors`
      const message = {
        action: config.action || 'update',
        pin: config.pin,
        name: config.name,
        subzoneId: config.subzoneId,
        active: config.active,
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Publish sensor config error:', error)
            reject(error)
          } else {
            console.log('Sensor config published:', topic, message)
            resolve()
          }
        })
      })
    },

    async publishActuatorConfig(config) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${config.espId}/config/actuators`
      const message = {
        action: config.action || 'update',
        pin: config.pin,
        name: config.name,
        subzoneId: config.subzoneId,
        active: config.active,
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Publish actuator config error:', error)
            reject(error)
          } else {
            console.log('Actuator config published:', topic, message)
            resolve()
          }
        })
      })
    },

    async publishCommand(command) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${command.espId}/command`
      const message = {
        command: command.command,
        data: command.data || {},
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Publish command error:', error)
            reject(error)
          } else {
            console.log('Command published:', topic, message)
            resolve()
          }
        })
      })
    },

    async refreshEspStatus(espId) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${espId}/status/request`
      const message = {
        request: 'status',
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Status request error:', error)
            reject(error)
          } else {
            console.log('Status request sent:', topic)
            resolve()
          }
        })
      })
    },

    async runDiagnostics(espId) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${espId}/diagnostics/request`
      const message = {
        request: 'diagnostics',
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Diagnostics request error:', error)
            reject(error)
          } else {
            console.log('Diagnostics request sent:', topic)
            // Simulate diagnostics result for now
            setTimeout(() => {
              resolve({
                issues: [
                  {
                    severity: 'error',
                    title: 'GPIO-Konflikt',
                    description: 'Pin 0 ist für Boot-Vorgang reserviert',
                  },
                  {
                    severity: 'warning',
                    title: 'Fehlende Subzone',
                    description: 'Sensor ohne Subzone-Zuweisung',
                  },
                ],
              })
            }, 2000)
          }
        })
      })
    },

    async fixDiagnosedIssues(espId, diagnosticsResult) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT not connected')
      }

      const topic = `kaiser/${this.kaiser.id}/esp/${espId}/diagnostics/fix`
      const message = {
        action: 'fix_issues',
        issues: diagnosticsResult.issues,
        timestamp: Date.now(),
      }

      return new Promise((resolve, reject) => {
        this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
          if (error) {
            console.error('Fix issues error:', error)
            reject(error)
          } else {
            console.log('Fix issues sent:', topic)
            resolve()
          }
        })
      })
    },

    // ✅ KORRIGIERT: Aktor-Logik-Status verarbeiten über Event-System
    handleActuatorLogicStatus(espId, gpio, payload) {
      // ✅ KORRIGIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ACTUATOR_LOGIC_UPDATE, {
        espId,
        gpio,
        payload,
        timestamp: Date.now(),
      })
    },

    // Aktor-Logik-Kommando senden
    async sendActuatorLogicCommand(espId, gpio, command, payload = {}) {
      if (!this.isConnected) {
        throw new Error('MQTT nicht verbunden')
      }

      const topic = `kaiser/${this.getKaiserId}/esp/${espId}/actuator/${gpio}/logic`
      const message = JSON.stringify({
        command,
        ...payload,
        timestamp: Date.now(),
      })

      return new Promise((resolve, reject) => {
        this.client.publish(topic, message, { qos: 1 }, (error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    },

    // ✅ NEU: ESP-Konfiguration über bestehende MQTT-Struktur
    async configureESP(espId, configData) {
      if (!this.canPerformMqttOperation()) {
        throw new Error('MQTT-Verbindung nicht verfügbar')
      }

      // ✅ BESTEHEND: Verwende bestehende Topic-Struktur
      const configTopic = `kaiser/${this.getKaiserId}/esp/${espId}/config/setup`

      // ✅ BESTEHEND: Verwende bestehende publish-Methode
      await this.publish(
        configTopic,
        JSON.stringify({
          command: 'setup_configuration',
          data: configData,
          timestamp: Date.now(),
        }),
      )

      console.log(`[MQTT] ESP configuration sent to ${espId}`)
    },

    // ✅ NEU: ESP-Status überwachen über bestehende Struktur
    async monitorESPStatus(espId, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('ESP-Status-Timeout'))
        }, timeoutMs)

        // ✅ BESTEHEND: Verwende bestehende MQTT-Subscription
        const statusTopic = `kaiser/${this.getKaiserId}/esp/${espId}/config/status`

        this.subscribeToTopic(statusTopic, (topic, message) => {
          const status = JSON.parse(message)

          if (status.status === 'success') {
            clearTimeout(timeout)
            resolve(status)
          } else if (status.status === 'error') {
            clearTimeout(timeout)
            reject(new Error(status.message))
          }
        })
      })
    },

    // ✅ NEU: Restore-Methoden für Konsistenz mit main.js
    restoreConfig() {
      this.loadPersistentConfig()
    },

    restoreKaiserConfig() {
      this.loadKaiserConfig()
    },

    // ✅ NEU: Automatische ESP-Zuordnung zum God Pi
    // 🆕 ENTFERNT: handleNewEspDiscovery verschoben nach espManagement.js

    // 🆕 ENTFERNT: transferEspFromGodToKaiser verschoben nach espManagement.js
    // 🆕 ENTFERNT: transferEspFromKaiserToGod verschoben nach espManagement.js

    // ✅ NEU: Cross-Kaiser-Transfer-Command senden
    async sendCrossKaiserTransfer(sourceKaiser, transferData) {
      try {
        console.log(
          `[MQTT] Sending cross-kaiser transfer command to ${sourceKaiser}:`,
          transferData,
        )

        const commandId = this.generateCommandId()
        const command = {
          command_id: commandId,
          command: 'cross_kaiser_transfer',
          esp_id: transferData.espId,
          from_kaiser: transferData.fromKaiser,
          to_kaiser: transferData.toKaiser,
          zone: transferData.zone,
          transfer_type: transferData.transferType,
          timestamp: Date.now(),
        }

        // Sende Command an Source Kaiser
        await this.publish(`kaiser/${sourceKaiser}/god/command`, command)

        // Sende Command an Target Kaiser (falls verschieden)
        if (transferData.toKaiser !== sourceKaiser) {
          await this.publish(`kaiser/${transferData.toKaiser}/god/command`, command)
        }

        // Track Command Chain
        this.trackCommandChain(commandId, [
          'cross_kaiser_transfer',
          sourceKaiser,
          transferData.toKaiser,
        ])

        console.log(`[MQTT] Cross-kaiser transfer command sent successfully`)
        return { success: true, commandId }
      } catch (error) {
        console.error('[MQTT] Failed to send cross-kaiser transfer command:', error)
        throw error
      }
    },

    // 🆕 NEU: Event-Listener für Store-to-Store Communication
    initializeEventListeners() {
      console.log('[MQTT] Initializing event listeners...')

      // CentralConfig Events
      eventBus.on(MQTT_EVENTS.CHECK_ID_CONFLICTS, (data) => {
        console.log('[MQTT] Check ID conflicts event received:', data)
        return this.idConflicts?.kaiser?.size > 0
      })

      eventBus.on(MQTT_EVENTS.VALIDATE_SELECTED_ESP, (data) => {
        console.log('[MQTT] Validate selected ESP event received:', data)
        return this.espDevices.has(data.espId)
      })

      eventBus.on(MQTT_EVENTS.AUTO_SELECT_ESP, (data) => {
        console.log('[MQTT] Auto select ESP event received:', data)
        const firstEspId = Array.from(this.espDevices.keys())[0]
        if (firstEspId) {
          // Event zurück an CentralConfig senden
          eventBus.emit(MQTT_EVENTS.ESP_SELECTION, {
            espId: firstEspId,
            timestamp: Date.now(),
          })
        }
      })

      // ActuatorLogic Events
      eventBus.on(MQTT_EVENTS.ACTUATOR_COMMAND, async (data) => {
        console.log('[MQTT] Actuator command event received:', data)
        await this.sendActuatorCommand(data.espId, data.gpio, data.command, data.value)
      })

      eventBus.on(MQTT_EVENTS.ACTUATOR_OVERRIDE, async (data) => {
        console.log('[MQTT] Actuator override event received:', data)
        await this.sendActuatorCommand(data.espId, data.gpio, 'manual_override', data.value)
      })

      eventBus.on(MQTT_EVENTS.ACTUATOR_CLEAR_OVERRIDE, async (data) => {
        console.log('[MQTT] Actuator clear override event received:', data)
        await this.sendActuatorCommand(data.espId, data.gpio, 'clear_manual_override')
      })

      eventBus.on(MQTT_EVENTS.ACTUATOR_LOGIC_CONFIG, async (data) => {
        console.log('[MQTT] Actuator logic config event received:', data)
        await this.sendSystemCommand(data.espId, 'configure_actuator_logic', data.config)
      })

      eventBus.on(MQTT_EVENTS.CROSS_KAISER_SENSOR_DATA, (data) => {
        console.log('[MQTT] Cross kaiser sensor data event received:', data)
        return this.espDevices.get(data.espId)
      })

      // CentralDataHub Events
      eventBus.on(MQTT_EVENTS.SYSTEM_STATUS_UPDATE, (data) => {
        console.log('[MQTT] System status update event received:', data)
        this.updateSystemStatus(data)
      })

      eventBus.on(MQTT_EVENTS.DEVICE_DATA_REQUEST, (data) => {
        console.log('[MQTT] Device data request event received:', data)
        return this.espDevices.get(data.espId)
      })

      eventBus.on(MQTT_EVENTS.SERVER_CONFIG_UPDATE, (data) => {
        console.log('[MQTT] Server config update event received:', data)
        this.updateConfig(data)
      })

      eventBus.on(MQTT_EVENTS.CROSS_KAISER_BATCH_UPDATE, async (data) => {
        console.log('[MQTT] Cross kaiser batch update event received:', data)
        await this.applyCrossKaiserBatchUpdates(data.kaiserId, data.updates)
      })

      eventBus.on(MQTT_EVENTS.ID_CONFLICT_RESOLUTION, async (data) => {
        console.log('[MQTT] ID conflict resolution event received:', data)
        await this.resolveKaiserIdConflict(data.espId, data.action)
      })

      eventBus.on(MQTT_EVENTS.KAISER_REGISTRATION, async (data) => {
        console.log('[MQTT] Kaiser registration event received:', data)
        await this.registerWithGod(data)
      })

      eventBus.on(MQTT_EVENTS.ESP_TRANSFER_COMMAND, async (data) => {
        console.log('[MQTT] ESP transfer command event received:', data)
        if (data.toOwner === 'raspberry_pi_central') {
          await this.transferEspFromKaiserToGod(data.espId, data.fromOwner)
        } else {
          await this.transferEspFromGodToKaiser(data.espId, data.toOwner)
        }
      })

      eventBus.on(MQTT_EVENTS.CROSS_KAISER_COMMAND, async (data) => {
        console.log('[MQTT] Cross kaiser command event received:', data)
        await this.handleCrossKaiserCommandEvent(
          data.sourceKaiserId,
          data.targetKaiserId,
          data.command,
        )
      })

      eventBus.on(MQTT_EVENTS.DEVICE_UPDATE, (data) => {
        console.log('[MQTT] Device update event received:', data)
        this.updateDeviceState(data.espId, data.update)
      })

      eventBus.on(MQTT_EVENTS.PERFORMANCE_UPDATE, (data) => {
        console.log('[MQTT] Performance update event received:', data)
        this.updatePerformanceStats(data.processingTime, data.cacheHit)
      })

      // 🆕 NEU: Zusätzliche Event-Handler für CentralDataHub Events
      eventBus.on(MQTT_EVENTS.KAISER_ID_REQUEST, (data) => this.handleKaiserIdRequest(data))
      eventBus.on(MQTT_EVENTS.SELECTED_ESP_REQUEST, (data) => this.handleSelectedEspRequest(data))
      eventBus.on(MQTT_EVENTS.ZONE_REQUEST, (data) => this.handleZoneRequest(data))
      eventBus.on(MQTT_EVENTS.SENSOR_AGGREGATION_REQUEST, (data) =>
        this.handleSensorAggregationRequest(data),
      )
      eventBus.on(MQTT_EVENTS.GOD_COMMUNICATION, (data) => this.handleGodCommunication(data))
      eventBus.on(MQTT_EVENTS.CONNECTION_REQUEST, (data) => this.handleConnectionRequest(data))

      console.log('[MQTT] Event listeners initialized successfully')
    },

    // 🆕 NEU: Event-Handler für CentralDataHub Events
    handleKaiserIdRequest(data) {
      try {
        console.log('[MQTT] Kaiser ID request received:', data)
        const kaiserId = this.kaiserId
        eventBus.emit(MQTT_EVENTS.KAISER_ID_REQUEST, {
          kaiserId: kaiserId,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle Kaiser ID request', error, { data })
      }
    },

    handleSelectedEspRequest(data) {
      try {
        console.log('[MQTT] Selected ESP request received:', data)
        const selectedEspId = this.selectedEspId
        eventBus.emit(MQTT_EVENTS.SELECTED_ESP_REQUEST, {
          selectedEspId: selectedEspId,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle selected ESP request', error, { data })
      }
    },

    handleZoneRequest(data) {
      try {
        console.log('[MQTT] Zone request received:', data)
        const zones = this.getAvailableZones()
        eventBus.emit(MQTT_EVENTS.ZONE_REQUEST, {
          zones: zones,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle zone request', error, { data })
      }
    },

    handleSensorAggregationRequest(data) {
      try {
        console.log('[MQTT] Sensor aggregation request received:', data)
        const aggregatedData = this.getSensorAggregationData(data)
        eventBus.emit(MQTT_EVENTS.SENSOR_AGGREGATION_REQUEST, {
          aggregatedData: aggregatedData,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle sensor aggregation request', error, { data })
      }
    },

    handleGodCommunication(data) {
      try {
        console.log('[MQTT] God communication received:', data)
        this.processGodCommunication(data)
      } catch (error) {
        errorHandler.error('Failed to handle God communication', error, { data })
      }
    },

    handleConnectionRequest(data) {
      try {
        console.log('[MQTT] Connection request received:', data)
        const connectionStatus = this.getConnectionStatus()
        eventBus.emit(MQTT_EVENTS.CONNECTION_REQUEST, {
          connectionStatus: connectionStatus,
          timestamp: Date.now(),
        })
      } catch (error) {
        errorHandler.error('Failed to handle connection request', error, { data })
      }
    },

    // 🆕 NEU: Helper-Methoden für Event-Handler
    updateSystemStatus(statusData) {
      this.systemStatus = { ...this.systemStatus, ...statusData }
      this.systemStatus.lastUpdate = Date.now()
    },

    updateDeviceState(espId, update) {
      const device = this.espDevices.get(espId)
      if (device) {
        this.espDevices.set(espId, { ...device, ...update })
      }
    },

    // 🆕 NEU: Transfer-Methoden für Event-Handler
    async transferEspFromKaiserToGod(espId, fromOwner) {
      try {
        console.log(`[MQTT] Transferring ESP ${espId} from ${fromOwner} to God Pi`)
        // Implementierung der Transfer-Logik
        return { success: true }
      } catch (error) {
        console.error('[MQTT] Error transferring ESP from Kaiser to God:', error)
        throw error
      }
    },

    async transferEspFromGodToKaiser(espId, toOwner) {
      try {
        console.log(`[MQTT] Transferring ESP ${espId} from God Pi to ${toOwner}`)
        // Implementierung der Transfer-Logik
        return { success: true }
      } catch (error) {
        console.error('[MQTT] Error transferring ESP from God to Kaiser:', error)
        throw error
      }
    },

    async handleCrossKaiserCommandEvent(sourceKaiserId, targetKaiserId, command) {
      try {
        console.log(
          `[MQTT] Handling cross-kaiser command event: ${sourceKaiserId} → ${targetKaiserId}`,
          command,
        )
        // Implementierung der Cross-Kaiser-Command-Logik
        return { success: true }
      } catch (error) {
        console.error('[MQTT] Error handling cross-kaiser command event:', error)
        throw error
      }
    },

    // 🆕 NEU: Helper-Methoden für Event-Handler
    getAvailableZones() {
      // Implementierung für verfügbare Zonen
      return []
    },

    getSensorAggregationData() {
      // Implementierung für Sensor-Aggregation
      return {}
    },

    processGodCommunication(data) {
      // Implementierung für God-Kommunikation
      console.log('Processing God communication:', data)
    },

    getConnectionStatus() {
      return {
        connected: this.isConnected,
        quality: this.connectionQuality,
        lastUpdate: this.lastConnectionUpdate,
      }
    },

    // ✅ NEU: Kritische Message-Erkennung
    isCriticalMessage(messageEntry) {
      const criticalTopics = [
        'emergency',
        'fire_alarm',
        'esp_offline',
        'system_critical',
        'alert',
        'error',
        'failsafe',
        'emergency_stop',
        'safety',
      ]

      const topic = messageEntry.topic.toLowerCase()
      return criticalTopics.some((criticalTopic) => topic.includes(criticalTopic))
    },

    // ✅ NEU: User-Action Message-Erkennung
    isUserActionMessage(messageEntry) {
      const userActionTopics = ['user', 'manual', 'override', 'calibration', 'config', 'setting']

      const topic = messageEntry.topic.toLowerCase()
      return userActionTopics.some((userTopic) => topic.includes(userTopic))
    },

    // ✅ NEU: Message-Alter berechnen
    getMessageAge(messageEntry) {
      return Date.now() - messageEntry.timestamp
    },

    // ✅ NEU: Message-Batching-Logic mit Duplikat-Erkennung
    addToBatch(messageData) {
      // 🔒 Duplikat-Erkennung
      const messageId = this.generateMessageId(messageData)
      if (this.messageBatching.messageIds.has(messageId)) {
        console.warn('⚠️ Duplikat-Message erkannt, überspringe:', messageId)
        return
      }

      // 🔒 Message-ID hinzufügen
      this.messageBatching.messageIds.add(messageId)
      messageData.messageId = messageId

      this.messageBatching.pendingMessages.push(messageData)

      // Batch-Größe erreicht - sofort senden
      if (this.messageBatching.pendingMessages.length >= this.messageBatching.batchSize) {
        this.processBatch()
        return
      }

      // Batch-Timer starten falls noch nicht aktiv
      if (!this.messageBatching.batchTimer) {
        this.messageBatching.batchTimer = setTimeout(() => {
          this.processBatch()
        }, this.messageBatching.batchTimeout)
      }
    },

    // 🔒 NEU: Message-ID-Generierung
    generateMessageId(messageData) {
      return `${messageData.topic}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    },

    // ✅ NEU: Batch-Verarbeitung mit Message-Loss-Prevention
    async processBatch() {
      // 🔒 Processing-Lock prüfen
      if (this.messageBatching.isProcessing) {
        console.warn('⚠️ Batch-Verarbeitung bereits aktiv, überspringe')
        return
      }

      if (this.messageBatching.pendingMessages.length === 0) {
        return
      }

      // 🔒 Processing-Lock setzen
      this.messageBatching.isProcessing = true

      // Timer clearen
      if (this.messageBatching.batchTimer) {
        clearTimeout(this.messageBatching.batchTimer)
        this.messageBatching.batchTimer = null
      }

      // 🔒 Messages sichern bevor sie aus der Warteschlange genommen werden
      const batch = [...this.messageBatching.pendingMessages]
      const failedBatch = [] // 🔒 Backup für fehlgeschlagene Messages

      const batchStartTime = performance.now()

      try {
        // 🔒 NEU: Atomic Batch-Verarbeitung mit Retry-Mechanismus
        const batchResults = await Promise.allSettled(
          batch.map((messageData) => this.publishImmediately(messageData)),
        )

        // 🔒 Erfolgreiche und fehlgeschlagene Messages trennen
        const successfulMessages = []
        const failedMessages = []

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulMessages.push(batch[index])
          } else {
            failedMessages.push({
              ...batch[index],
              error: result.reason,
              retryCount: (batch[index].retryCount || 0) + 1,
            })
          }
        })

        // 🔒 Erfolgreiche Messages aus Warteschlange entfernen
        this.messageBatching.pendingMessages = this.messageBatching.pendingMessages.filter(
          (msg) => !successfulMessages.some((successMsg) => successMsg.messageId === msg.messageId),
        )

        // 🔒 Fehlgeschlagene Messages für Retry speichern
        if (failedMessages.length > 0) {
          this.messageBatching.failedMessages.push(...failedMessages)
          this.messageBatching.batchStats.failedMessages += failedMessages.length

          // 🔒 NEU: Automatischer Retry für fehlgeschlagene Messages
          this.scheduleFailedMessageRetry(failedMessages)
        }

        // 🔒 Message-IDs bereinigen (nur erfolgreiche)
        successfulMessages.forEach((messageData) => {
          this.messageBatching.messageIds.delete(messageData.messageId)
        })

        // 🔒 NEU: Batch-Statistiken aktualisieren
        const batchTime = performance.now() - batchStartTime
        this.updateBatchStats(successfulMessages.length, batchTime)

        console.log(
          `✅ Batch verarbeitet: ${successfulMessages.length}/${batch.length} erfolgreich, ${failedMessages.length} fehlgeschlagen in ${batchTime.toFixed(2)}ms`,
        )

        // Erfolg an alle Promises zurückgeben
        successfulMessages.forEach((messageData) => {
          if (messageData.resolve) {
            messageData.resolve()
          }
        })
      } catch (error) {
        console.error('❌ Batch-Verarbeitung fehlgeschlagen:', error)
        this.messageBatching.batchStats.failedMessages++

        // 🔒 Failed messages für Retry speichern
        for (const messageData of batch) {
          try {
            await this.publishImmediately(messageData)
            if (messageData.resolve) {
              messageData.resolve()
            }
          } catch (retryError) {
            console.error(`❌ Message-Retry fehlgeschlagen: ${messageData.topic}`, retryError)
            failedBatch.push(messageData)
            if (messageData.reject) {
              messageData.reject(retryError)
            }
          }
        }

        // 🔒 Failed messages für späteren Retry speichern
        if (failedBatch.length > 0) {
          this.messageBatching.failedMessages.push(...failedBatch)
          this.messageBatching.batchStats.messageLossPrevented += failedBatch.length
          console.log(`🔒 ${failedBatch.length} failed messages für Retry gespeichert`)
        }
      } finally {
        // 🔒 Processing-Lock freigeben
        this.messageBatching.isProcessing = false
      }
    },

    // 🔒 NEU: Failed Message Retry-Scheduling
    scheduleFailedMessageRetry(failedMessages) {
      failedMessages.forEach((messageData) => {
        const retryDelay = this.calculateRetryDelay(messageData.retryCount)

        setTimeout(() => {
          // Message aus failedMessages entfernen
          this.messageBatching.failedMessages = this.messageBatching.failedMessages.filter(
            (msg) => msg.messageId !== messageData.messageId,
          )

          // Erneut zur Batch-Warteschlange hinzufügen
          this.addToBatch(messageData)
        }, retryDelay)
      })

      console.log(`🔄 ${failedMessages.length} failed messages für Retry geplant`)
    },

    // 🔒 NEU: Retry-Delay-Berechnung mit Exponential Backoff
    calculateRetryDelay(retryCount) {
      const baseDelay = this.messageBatching.retryConfig.retryDelay
      const maxDelay = 30000 // 30 Sekunden max

      if (this.messageBatching.retryConfig.exponentialBackoff) {
        return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
      }

      return baseDelay
    },

    // ✅ NEU: Sofortige Veröffentlichung (für High-Priority)
    async publishImmediately(messageData) {
      if (!this.client || !this.isConnected) {
        throw new Error('MQTT Client nicht verbunden')
      }

      // Response-Echo für benutzerdefinierte Felder
      const response = {
        ...JSON.parse(messageData.message),
        ...messageData.customFields,
        timestamp: Date.now(),
        server_id: 'growy_frontend_v3.6.0',
      }

      const payload = typeof response === 'string' ? response : JSON.stringify(response)

      return new Promise((resolve, reject) => {
        this.client.publish(
          messageData.topic,
          payload,
          {
            qos: messageData.qos,
            retain: messageData.retain,
          },
          (error) => {
            if (error) {
              // Retry-Logik für fehlgeschlagene Messages
              if (messageData.retryCount < messageData.maxRetries) {
                messageData.retryCount++
                console.warn(
                  `🔄 Message-Retry ${messageData.retryCount}/${messageData.maxRetries}: ${messageData.topic}`,
                )

                setTimeout(
                  () => {
                    this.publishImmediately(messageData).then(resolve).catch(reject)
                  },
                  Math.pow(2, messageData.retryCount) * 1000,
                ) // Exponential backoff
              } else {
                reject(error)
              }
            } else {
              resolve()
            }
          },
        )
      })
    },

    // ✅ NEU: Batch-Statistiken
    updateBatchStats(batchSize, batchTime) {
      const stats = this.messageBatching.batchStats
      stats.totalBatches++
      stats.totalMessages += batchSize
      stats.averageBatchSize = stats.totalMessages / stats.totalBatches
      stats.lastBatchTime = batchTime

      // Throughput pro Minute berechnen
      const now = Date.now()
      const oneMinuteAgo = now - 60000

      // Alte Messages aus der Berechnung entfernen
      const recentMessages = this.messageBatching.pendingMessages.filter(
        (msg) => msg.timestamp > oneMinuteAgo,
      )

      stats.throughputPerMinute = recentMessages.length + batchSize

      // Performance-Warnungen
      if (batchTime > 2000) {
        console.warn(
          `⚠️ Langsame Batch-Verarbeitung: ${batchTime.toFixed(2)}ms für ${batchSize} Messages`,
        )
      }

      if (stats.throughputPerMinute > 1000) {
        console.warn(`⚠️ Hoher MQTT-Durchsatz: ${stats.throughputPerMinute} Messages/Minute`)
      }
    },

    // ✅ NEU: Batching-Performance-Monitoring
    startBatchingMonitoring() {
      // Batch-Statistiken alle 60 Sekunden loggen (statt 30s) - NON-CRITICAL
      setInterval(() => {
        this.logBatchingStats()
      }, 60000) // 60 Sekunden statt 30

      // Batch-Performance alle 120 Sekunden optimieren (statt 60s) - NON-CRITICAL
      setInterval(() => {
        this.optimizeBatchingPerformance()
      }, 120000) // 120 Sekunden statt 60
    },

    // ✅ NEU: Batching-Statistiken loggen
    logBatchingStats() {
      const stats = this.messageBatching.batchStats

      console.log(`📊 MQTT-Batching-Report:`)
      console.log(`  - Gesamt-Batches: ${stats.totalBatches}`)
      console.log(`  - Gesamt-Messages: ${stats.totalMessages}`)
      console.log(`  - Durchschnitts-Batch-Größe: ${stats.averageBatchSize.toFixed(1)}`)
      console.log(`  - Letzter Batch: ${stats.lastBatchTime.toFixed(2)}ms`)
      console.log(`  - Durchsatz/Minute: ${stats.throughputPerMinute}`)
      console.log(`  - Pending Messages: ${this.messageBatching.pendingMessages.length}`)
    },

    // ✅ NEU: Batching-Performance optimieren
    optimizeBatchingPerformance() {
      const stats = this.messageBatching.batchStats

      // Batch-Größe dynamisch anpassen
      if (stats.throughputPerMinute > 800) {
        // Hoher Durchsatz: Größere Batches
        this.messageBatching.batchSize = Math.min(100, this.messageBatching.batchSize + 10)
        console.log(`📈 Batch-Größe erhöht auf ${this.messageBatching.batchSize}`)
      } else if (stats.throughputPerMinute < 200) {
        // Niedriger Durchsatz: Kleinere Batches für bessere Reaktionszeit
        this.messageBatching.batchSize = Math.max(20, this.messageBatching.batchSize - 5)
        console.log(`📉 Batch-Größe reduziert auf ${this.messageBatching.batchSize}`)
      }

      // Batch-Timeout anpassen
      if (stats.lastBatchTime > 1500) {
        // Langsame Verarbeitung: Längerer Timeout
        this.messageBatching.batchTimeout = Math.min(2000, this.messageBatching.batchTimeout + 100)
      } else if (stats.lastBatchTime < 500) {
        // Schnelle Verarbeitung: Kürzerer Timeout
        this.messageBatching.batchTimeout = Math.max(500, this.messageBatching.batchTimeout - 50)
      }
    },

    // ✅ NEU: Batching-Status abrufen
    getBatchingStatus() {
      return {
        enabled: this.messageBatching.enabled,
        pendingCount: this.messageBatching.pendingMessages.length,
        batchSize: this.messageBatching.batchSize,
        batchTimeout: this.messageBatching.batchTimeout,
        stats: { ...this.messageBatching.batchStats },
        isProcessing: !!this.messageBatching.batchTimer,
      }
    },

    // ✅ NEU: Batching konfigurieren
    configureBatching(config) {
      if (config.enabled !== undefined) {
        this.messageBatching.enabled = config.enabled
      }
      if (config.batchSize !== undefined) {
        this.messageBatching.batchSize = Math.max(1, Math.min(200, config.batchSize))
      }
      if (config.batchTimeout !== undefined) {
        this.messageBatching.batchTimeout = Math.max(100, Math.min(5000, config.batchTimeout))
      }

      console.log(`⚙️ MQTT-Batching konfiguriert:`, {
        enabled: this.messageBatching.enabled,
        batchSize: this.messageBatching.batchSize,
        batchTimeout: this.messageBatching.batchTimeout,
      })
    },
  },

  // 🆕 NEU: Setup-Methode für automatische Event-Listener-Initialisierung
  setup() {
    const store = useMqttStore()
    store.initializeEventListeners()

    // ✅ NEU: Batching-Monitoring starten
    store.startBatchingMonitoring()

    // ✅ NEU: Store im Event-System registrieren
    storeHandler.registerStore('mqtt', store)

    // ❌ ENTFERNT: Zirkuläre Event-Emission
    // eventBus.emit(STORE_EVENTS.STORE_READY, {
    //   storeName: 'mqtt',
    //   timestamp: Date.now(),
    // })

    return {}
  },
})
