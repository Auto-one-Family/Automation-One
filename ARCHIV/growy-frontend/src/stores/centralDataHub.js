import { defineStore } from 'pinia'
import { errorHandler } from '@/utils/errorHandler'
import { eventBus, MQTT_EVENTS, STORE_EVENTS, storeHandler } from '@/utils/eventBus'

export const useCentralDataHub = defineStore('centralDataHub', {
  state: () => ({
    // ✅ BESTEHEND: Zentrale UI-Konfiguration
    uiConfig: {
      showAggregations: false,
      showCharts: true,
      compactMode: false,
      selectedTimeRange: 5 * 60 * 1000, // 5 Minuten
      mobileOptimized: false,
    },

    // ✅ NEU: Vollständige Store-Referenzen
    storeReferences: {
      mqtt: null,
      centralConfig: null,
      espManagement: null,
      sensorRegistry: null,
      piIntegration: null,
      actuatorLogic: null,
      systemCommands: null,
      dashboardGenerator: null,
      databaseLogs: null,
      timeRange: null,
      zoneRegistry: null,
      logicalAreas: null,
      theme: null,
      counter: null,
    },

    // ✅ NEU: Dependency-Tracking für Optimierung
    dependencyTracking: {
      storeDependencies: new Map(), // Map<storeName, Set<dependentStore>>
      circularDependencies: new Set(), // Set<dependencyChain>
      dependencyStats: {
        totalDependencies: 0,
        circularDependencies: 0,
        lastOptimization: null,
      },
    },

    // ✅ ERWEITERN: Caching-Konfiguration mit Cross-Level-Synchronisation
    dataCache: new Map(),
    cacheConfig: {
      // L1 Cache: Häufig genutzte Daten (schnell, klein)
      l1Cache: {
        maxSize: 100,
        ttl: 30000, // 30 Sekunden
        data: new Map(),
        accessCount: new Map(),
        lastAccess: new Map(), // 🔒 NEU: Track last access time
        lastCleanup: Date.now(),
        lastReset: Date.now(), // 🔒 Track last access count reset
      },

      // L2 Cache: Selten genutzte Daten (langsamer, größer)
      l2Cache: {
        maxSize: 1000,
        ttl: 300000, // 5 Minuten
        data: new Map(),
        accessCount: new Map(),
        lastAccess: new Map(), // 🔒 NEU: Track last access time
        lastCleanup: Date.now(),
        lastReset: Date.now(), // 🔒 Track last access count reset
      },

      // Hot Data: Sehr häufig genutzte Daten (permanent bis Update)
      hotCache: {
        maxSize: 50,
        data: new Map(),
        accessCount: new Map(),
        lastAccess: new Map(), // 🔒 NEU: Track last access time
        lastCleanup: Date.now(),
        lastReset: Date.now(), // 🔒 Track last access count reset
      },

      cacheStats: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        averageResponseTime: 0,
        lastOptimization: null,
        crossLevelInvalidations: 0, // 🔒 Track cross-level invalidations
        accessCountResets: 0, // 🔒 Track access count resets
        cacheInconsistencies: 0, // 🔒 Track cache inconsistencies
      },

      performanceThresholds: {
        slowCacheThreshold: 50, // > 50ms = langsam
        memoryThreshold: 0.8, // 80% Memory-Nutzung
        cleanupInterval: 60000, // 60 Sekunden
        accessCountResetInterval: 300000, // 🔒 5 Minuten für Access-Count-Reset
        crossLevelSyncInterval: 30000, // 🔒 30 Sekunden für Cross-Level-Sync
      },
    },

    // 🆕 NEU: Hierarchische Zustandsverwaltung für God-Kaiser-Integration
    hierarchicalState: {
      god: { id: 'god_pi_central', status: 'online' },
      kaisers: new Map(),
      espOwnership: new Map(),
      commandChains: new Map(),
      crossKaiserLogic: new Map(),
    },

    // 🆕 NEU: Hierarchischer Performance-Cache
    hierarchicalCache: new Map(),

    // 🆕 NEU: Performance-Optimierungen für große Netzwerke
    performanceConfig: {
      cacheTimeouts: {
        kaiser_data: 30 * 1000, // 30 Sekunden
        esp_data: 15 * 1000, // 15 Sekunden
        hierarchy_data: 60 * 1000, // 1 Minute
        command_chains: 5 * 60 * 1000, // 5 Minuten
        cross_kaiser: 10 * 1000, // 10 Sekunden
      },
      batchUpdateInterval: 100, // 100ms
      maxCacheSize: 1000, // Max 1000 Cache-Einträge
      memoryThreshold: 0.6, // 60% Memory-Nutzung - früher reagieren
    },

    // 🆕 NEU: Batch-Updates für Cross-Kaiser-Kommunikation
    pendingCrossKaiserUpdates: new Map(),
    crossKaiserBatchTimeout: null,

    // 🆕 NEU: Globales Drag & Drop Event-System
    dragDropState: {
      draggedEspId: null,
      dragOverZone: null,
      isDragging: false,
    },

    // ✅ BESTEHEND: Zentrale Status-Verwaltung
    systemStatus: {
      safeMode: false,
      connectionQuality: 'unknown',
      lastUpdate: null,
      kaiserMode: false,
      emergencyStop: false,
    },

    // ✅ NEU: Initialisierungsstatus
    initializationStatus: {
      initialized: false,
      storesLoaded: false,
      mindmapWebSocketConnected: false,
      error: null,
      lastInitAttempt: null,
    },

    // 🆕 NEU: Einheitliche System-Identität
    systemIdentity: {
      currentKaiserId: null, // Einzige Quelle der Wahrheit
      systemType: 'unknown', // 'god', 'kaiser', 'standard'
      idSource: 'auto', // 'auto', 'manual', 'environment'
      lastSync: null,
      migrationStatus: 'pending', // 'pending', 'completed', 'failed'

      // 🆕 NEU HINZUFÜGEN: Erweiterte Detection & Backend-Integration
      detectionHistory: [], // Array für Detection-Verlauf
      lastDetectionAttempt: null, // Timestamp der letzten Detection
      detectionConfidence: 0.0, // 0.0-1.0 Konfidenz der Detection
      manualOverride: false, // Flag für manuelle Überschreibung
      backendIntegration: {
        apiBaseUrl: null,
        websocketUrl: null,
        currentPort: null,
        connectionHealth: 'unknown', // 'unknown', 'healthy', 'unhealthy', 'error'
      },
    },

    // 🆕 NEU: ID-Management-Cache für Performance
    idCache: new Map(), // Cache für ID-Lookups
    idCacheTimeout: 10 * 1000, // 10 Sekunden

    // ✅ NEU: Harmonischer Lifecycle-Manager für alle System-Probleme
    // 🎯 HARMONISCHE LÖSUNG: Alle 8 Probleme in einem Pattern
    lifecycleManager: {
      // Problem 1+2: Zirkuläre Deps + Event Communication
      eventSystem: {
        initialized: false,
        eventBus: null,
        eventHandlers: new Map(),
        cycleDetection: true,
        maxEventDepth: 10,
      },

      // Problem 3+4: Memory Leaks + Performance
      resourceManager: {
        timeouts: new Map(), // Map<timeoutId, {type, store, cleanup}>
        intervals: new Map(), // Map<intervalId, {type, store, cleanup}>
        memoryThreshold: 0.8, // 80% Memory-Nutzung
        cleanupInterval: 30000, // 30 Sekunden
        lastCleanup: Date.now(),
      },

      // Problem 5+6: Error Handling + Validation
      validationEngine: {
        validators: new Map(), // Map<validationType, validatorFunction>
        errorHandlers: new Map(), // Map<errorType, handlerFunction>
        validationCache: new Map(), // Cache für Validierungsergebnisse
        maxValidationCache: 100,
      },

      // Problem 7+8: Naming Conventions + Rückwärtskompatibilität
      identityManager: {
        namingConventions: {
          kaiser: 'Edge Controller',
          esp: 'Agent',
          god: 'Zentrale Steuerung',
          server: 'Bibliothek',
        },
        idMappings: new Map(), // Map<oldId, newId>
        compatibilityMode: true,
        migrationStatus: 'pending', // 'pending', 'completed', 'failed'
      },
    },

    // ✅ NEU: Harmonische Initialisierung aller System-Komponenten
    async initializeHarmoniousSystem() {
      try {
        console.log('🎵 [Harmony] Starting harmonious system initialization...')

        // Schritt 1: Event-System initialisieren (löst Problem 1+2)
        await this.initializeEventSystem()

        // Schritt 2: Resource-Manager initialisieren (löst Problem 3+4)
        await this.initializeResourceManager()

        // Schritt 3: Validation-Engine initialisieren (löst Problem 5+6)
        await this.initializeValidationEngine()

        // Schritt 4: Identity-Manager initialisieren (löst Problem 7+8)
        await this.initializeIdentityManager()

        // Schritt 5: Stores harmonisch initialisieren
        await this.initializeStoresHarmoniously()

        // ✅ KORRIGIERT: Initialization-Status auf true setzen
        this.initializationStatus.initialized = true
        this.initializationStatus.storesLoaded = true
        this.initializationStatus.lastInitAttempt = Date.now()

        console.log('🎵 [Harmony] Harmonious system initialization completed')
        console.log('🔍 [Harmony] isSystemInitialized:', this.isSystemInitialized)
        console.log('🔍 [Harmony] initializationStatus:', this.initializationStatus)
        return true
      } catch (error) {
        console.error('❌ [Harmony] Harmonious system initialization failed:', error)
        this.handleHarmoniousError(error, 'system-initialization')

        // ✅ KORRIGIERT: Auch bei Fehler basic-Initialization setzen für Navigation
        this.initializationStatus.initialized = true
        this.initializationStatus.error = error.message
        this.initializationStatus.lastInitAttempt = Date.now()

        console.log('🔍 [Harmony] Fallback initialization set for navigation')
        return false
      }
    },

    // ✅ NEU: Event-System-Initialisierung (löst Zirkuläre Deps + Event Communication)
    async initializeEventSystem() {
      try {
        // EventBus importieren und initialisieren
        const { eventBus } = await import('@/utils/eventBus')
        this.lifecycleManager.eventSystem.eventBus = eventBus

        // Event-Handler für alle Stores registrieren
        await this.registerEventHandlers()

        // Cycle-Detection konfigurieren
        eventBus.configureCycleDetection({
          enabled: this.lifecycleManager.eventSystem.cycleDetection,
          maxDepth: this.lifecycleManager.eventSystem.maxEventDepth,
        })

        this.lifecycleManager.eventSystem.initialized = true
        console.log('🎵 [Harmony] Event system initialized')
      } catch (error) {
        throw new Error(`Event system initialization failed: ${error.message}`)
      }
    },

    // ✅ NEU: Resource-Manager-Initialisierung (löst Memory Leaks + Performance)
    async initializeResourceManager() {
      try {
        // Cleanup-Interval starten
        const cleanupInterval = setInterval(() => {
          this.performResourceCleanup()
        }, this.lifecycleManager.resourceManager.cleanupInterval)

        this.lifecycleManager.resourceManager.intervals.set('cleanup', {
          type: 'cleanup',
          store: 'centralDataHub',
          cleanup: () => clearInterval(cleanupInterval),
        })

        // Memory-Monitoring starten
        const memoryInterval = setInterval(() => {
          this.monitorMemoryUsage()
        }, 10000) // Alle 10 Sekunden

        this.lifecycleManager.resourceManager.intervals.set('memory', {
          type: 'memory',
          store: 'centralDataHub',
          cleanup: () => clearInterval(memoryInterval),
        })

        console.log('🎵 [Harmony] Resource manager initialized')
      } catch (error) {
        throw new Error(`Resource manager initialization failed: ${error.message}`)
      }
    },

    // ✅ NEU: Validation-Engine-Initialisierung (löst Error Handling + Validation)
    async initializeValidationEngine() {
      try {
        // Validatoren registrieren
        this.registerValidators()

        // Error-Handler registrieren
        this.registerErrorHandlers()

        console.log('🎵 [Harmony] Validation engine initialized')
      } catch (error) {
        throw new Error(`Validation engine initialization failed: ${error.message}`)
      }
    },

    // ✅ NEU: Identity-Manager-Initialisierung (löst Naming Conventions + Rückwärtskompatibilität)
    async initializeIdentityManager() {
      try {
        // Naming-Conventions laden
        await this.loadNamingConventions()

        // ID-Mappings für Rückwärtskompatibilität laden
        await this.loadIdMappings()

        // Migration-Status prüfen
        await this.checkMigrationStatus()

        console.log('🎵 [Harmony] Identity manager initialized')
      } catch (error) {
        throw new Error(`Identity manager initialization failed: ${error.message}`)
      }
    },

    // ✅ KORRIGIERT: Harmonische Store-Initialisierung ohne zirkuläre Events
    async initializeStoresHarmoniously() {
      try {
        const storeNames = [
          'mqtt',
          'centralConfig',
          'espManagement',
          'sensorRegistry',
          'piIntegration',
          'actuatorLogic',
          'systemCommands',
          'dashboardGenerator',
          'databaseLogs',
          'timeRange',
          'zoneRegistry',
          'logicalAreas',
          'theme',
          'counter',
        ]

        console.log('🚀 [Event-Based] Initializing stores via event system...')

        // ✅ KORRIGIERT: Store-Initialisierung ohne zirkuläre Events
        for (const storeName of storeNames) {
          if (!this.storeReferences[storeName]) {
            console.log(`🔄 Creating and registering store: ${storeName}`)
            const storeInstance = await storeHandler.createAndRegisterStore(storeName)
            this.storeReferences[storeName] = storeInstance
            console.log(`✅ ${storeName} Store loaded via event system`)
          }
        }

        console.log('🎵 [Event-Based] Stores initialized harmoniously via event system')
        console.log('Store references:', Object.keys(this.storeReferences))

        // ✅ NEU: Einmalige Store-Ready-Benachrichtigung
        eventBus.emit(STORE_EVENTS.STORE_INITIALIZE, {
          storeNames,
          timestamp: Date.now(),
          allStoresReady: true,
        })
      } catch (error) {
        throw new Error(`Event-based store initialization failed: ${error.message}`)
      }
    },

    // ✅ NEU: Event-Handler-Registrierung
    async registerEventHandlers() {
      const { MQTT_EVENTS } = await import('@/utils/eventBus')
      const eventBus = this.lifecycleManager.eventSystem.eventBus

      // Event-Handler für alle Stores registrieren
      const eventHandlers = {
        [MQTT_EVENTS.SENSOR_DATA]: this.handleSensorDataEvent.bind(this),
        [MQTT_EVENTS.ACTUATOR_STATUS]: this.handleActuatorStatusEvent.bind(this),
        [MQTT_EVENTS.ESP_CONFIG]: this.handleEspConfigEvent.bind(this),
        [MQTT_EVENTS.SYSTEM_COMMAND]: this.handleSystemCommandEvent.bind(this),
        [MQTT_EVENTS.ERROR]: this.handleErrorEvent.bind(this),
        // ✅ NEU: God-Konfigurations-Events
        [MQTT_EVENTS.GOD_CONFIG_UPDATE]: this.handleGodConfigEvent.bind(this),
        [MQTT_EVENTS.MINDMAP_CONFIG_CHANGE]: this.handleMindmapConfigEvent.bind(this),
      }

      // Handler registrieren
      for (const [event, handler] of Object.entries(eventHandlers)) {
        eventBus.on(event, handler)
        this.lifecycleManager.eventSystem.eventHandlers.set(event, handler)
      }
    },

    // ✅ NEU: Validatoren registrieren
    registerValidators() {
      const validators = {
        espId: (espId) => {
          if (!espId || typeof espId !== 'string') return false
          return /^[a-zA-Z0-9_-]+$/.test(espId)
        },
        kaiserId: (kaiserId) => {
          if (!kaiserId || typeof kaiserId !== 'string') return false
          return /^[a-zA-Z0-9_-]+$/.test(kaiserId)
        },
        godId: (godId) => {
          if (!godId || typeof godId !== 'string') return false
          return /^[a-zA-Z0-9_-]+$/.test(godId)
        },
        gpio: (gpio) => {
          if (typeof gpio !== 'number') return false
          return gpio >= 0 && gpio <= 40
        },
        port: (port) => {
          if (typeof port !== 'number') return false
          return port >= 1 && port <= 65535
        },
      }

      for (const [type, validator] of Object.entries(validators)) {
        this.lifecycleManager.validationEngine.validators.set(type, validator)
      }
    },

    // ✅ NEU: Error-Handler registrieren
    registerErrorHandlers() {
      const errorHandlers = {
        'validation-error': this.handleValidationError.bind(this),
        'memory-error': this.handleMemoryError.bind(this),
        'event-error': this.handleEventError.bind(this),
        'store-error': this.handleStoreError.bind(this),
      }

      for (const [type, handler] of Object.entries(errorHandlers)) {
        this.lifecycleManager.validationEngine.errorHandlers.set(type, handler)
      }
    },

    // ✅ NEU: Resource-Cleanup durchführen
    performResourceCleanup() {
      const now = Date.now()
      const resourceManager = this.lifecycleManager.resourceManager

      // Timeouts bereinigen
      for (const [timeoutId, timeoutInfo] of resourceManager.timeouts.entries()) {
        if (now - timeoutInfo.createdAt > 300000) {
          // 5 Minuten
          clearTimeout(timeoutId)
          resourceManager.timeouts.delete(timeoutId)
        }
      }

      // Cache bereinigen
      this.cleanupCache()

      // Validation-Cache bereinigen
      const validationCache = this.lifecycleManager.validationEngine.validationCache
      if (validationCache.size > this.lifecycleManager.validationEngine.maxValidationCache) {
        const entriesToDelete =
          validationCache.size - this.lifecycleManager.validationEngine.maxValidationCache
        const keysToDelete = Array.from(validationCache.keys()).slice(0, entriesToDelete)
        keysToDelete.forEach((key) => validationCache.delete(key))
      }

      resourceManager.lastCleanup = now
    },

    // ✅ NEU: Memory-Usage überwachen
    monitorMemoryUsage() {
      if (performance.memory) {
        const memoryUsage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit

        if (memoryUsage > this.lifecycleManager.resourceManager.memoryThreshold) {
          console.warn('⚠️ [Harmony] High memory usage detected:', memoryUsage)
          this.performResourceCleanup()
        }
      }
    },

    // ✅ NEU: Harmonische Error-Behandlung
    handleHarmoniousError(error, context) {
      const errorInfo = {
        message: error.message,
        context,
        timestamp: Date.now(),
        stack: error.stack,
      }

      // Error-Handler verwenden
      const errorHandler = this.lifecycleManager.validationEngine.errorHandlers.get('store-error')
      if (errorHandler) {
        errorHandler(errorInfo)
      } else {
        // Fallback auf zentralen Error-Handler
        errorHandler.handleError(error, context)
      }
    },

    // ✅ NEU: Validierung mit Cache
    validateWithCache(type, value) {
      const cacheKey = `${type}:${JSON.stringify(value)}`
      const validationCache = this.lifecycleManager.validationEngine.validationCache

      // Cache prüfen
      if (validationCache.has(cacheKey)) {
        return validationCache.get(cacheKey)
      }

      // Validierung durchführen
      const validator = this.lifecycleManager.validationEngine.validators.get(type)
      if (!validator) {
        throw new Error(`No validator found for type: ${type}`)
      }

      const result = validator(value)

      // Ergebnis cachen
      validationCache.set(cacheKey, result)

      return result
    },

    // ✅ NEU: Einheitliche Namensgebung
    getUnifiedName(type, id) {
      const namingConventions = this.lifecycleManager.identityManager.namingConventions
      const convention = namingConventions[type] || type

      if (id && id !== 'default') {
        return `${convention} ${id}`
      }
      return convention
    },

    // ✅ NEU: Rückwärtskompatible ID-Auflösung
    resolveId(originalId) {
      const idMappings = this.lifecycleManager.identityManager.idMappings

      // Neue ID verwenden falls Mapping existiert
      if (idMappings.has(originalId)) {
        return idMappings.get(originalId)
      }

      // Original-ID verwenden
      return originalId
    },

    // ✅ NEU: Event-Handler-Methoden
    handleSensorDataEvent(data) {
      // Sensor-Daten harmonisch verarbeiten
      this.validateWithCache('espId', data.espId)
      this.validateWithCache('gpio', data.gpio)

      // Event an entsprechende Stores weiterleiten
      this.routeEventToStores('sensorData', data)
    },

    handleActuatorStatusEvent(data) {
      // Aktor-Status harmonisch verarbeiten
      this.validateWithCache('espId', data.espId)
      this.validateWithCache('gpio', data.gpio)

      // Event an entsprechende Stores weiterleiten
      this.routeEventToStores('actuatorStatus', data)
    },

    handleEspConfigEvent(data) {
      // ESP-Konfiguration harmonisch verarbeiten
      this.validateWithCache('espId', data.espId)

      // Event an entsprechende Stores weiterleiten
      this.routeEventToStores('espConfig', data)
    },

    handleSystemCommandEvent(data) {
      // System-Befehle harmonisch verarbeiten
      this.validateWithCache('espId', data.espId)

      // Event an entsprechende Stores weiterleiten
      this.routeEventToStores('systemCommand', data)
    },

    handleErrorEvent(data) {
      // Fehler harmonisch verarbeiten
      this.handleHarmoniousError(new Error(data.message), data.context)
    },

    // ✅ NEU: God-Konfigurations-Event-Handler
    handleGodConfigEvent(data) {
      // God-Konfiguration harmonisch verarbeiten
      this.validateWithCache('godId', data.value)

      // Event an MQTT Store weiterleiten
      this.routeEventToStores('godConfig', data)
    },

    // ✅ NEU: MindMap-Konfigurations-Event-Handler
    handleMindmapConfigEvent(data) {
      // MindMap-Konfiguration harmonisch verarbeiten
      this.routeEventToStores('mindmapConfig', data)
    },

    // ✅ NEU: Event-Routing zu Stores
    routeEventToStores(eventType, data) {
      const stores = this.storeReferences

      switch (eventType) {
        case 'sensorData':
          if (stores.sensorRegistry) {
            stores.sensorRegistry.handleSensorData?.(data)
          }
          break
        case 'actuatorStatus':
          if (stores.actuatorLogic) {
            stores.actuatorLogic.handleActuatorStatus?.(data)
          }
          break
        case 'espConfig':
          if (stores.espManagement) {
            stores.espManagement.handleEspConfig?.(data)
          }
          break
        case 'systemCommand':
          if (stores.systemCommands) {
            stores.systemCommands.handleSystemCommand?.(data)
          }
          break
        // ❌ ENTFERNT: Redundantes God-Config-Event-Routing - MindMap ist der einzige Master
        case 'mindmapConfig':
          if (stores.mqtt) {
            stores.mqtt.handleMindmapConfigChange?.(data)
          }
          break
      }
    },

    // ✅ NEU: Error-Handler-Methoden
    handleValidationError(errorInfo) {
      console.error('❌ [Harmony] Validation error:', errorInfo)
      // Benutzerfreundliche Fehlermeldung anzeigen
      window.$snackbar?.showError(`Validierungsfehler: ${errorInfo.message}`)
    },

    handleMemoryError(errorInfo) {
      console.error('❌ [Harmony] Memory error:', errorInfo)
      // Memory-Cleanup durchführen
      this.performResourceCleanup()
    },

    handleEventError(errorInfo) {
      console.error('❌ [Harmony] Event error:', errorInfo)
      // Event-System neu initialisieren
      this.initializeEventSystem()
    },

    handleStoreError(errorInfo) {
      console.error('❌ [Harmony] Store error:', errorInfo)
      // Store neu laden
      this.initializeStoresHarmoniously()
    },

    // ✅ NEU: Naming-Conventions laden
    async loadNamingConventions() {
      try {
        const storedConventions = localStorage.getItem('naming_conventions')
        if (storedConventions) {
          this.lifecycleManager.identityManager.namingConventions = {
            ...this.lifecycleManager.identityManager.namingConventions,
            ...JSON.parse(storedConventions),
          }
        }
      } catch (error) {
        console.warn('⚠️ [Harmony] Failed to load naming conventions:', error)
      }
    },

    // ✅ NEU: ID-Mappings laden
    async loadIdMappings() {
      try {
        const storedMappings = localStorage.getItem('id_mappings')
        if (storedMappings) {
          const mappings = JSON.parse(storedMappings)
          for (const [oldId, newId] of Object.entries(mappings)) {
            this.lifecycleManager.identityManager.idMappings.set(oldId, newId)
          }
        }
      } catch (error) {
        console.warn('⚠️ [Harmony] Failed to load ID mappings:', error)
      }
    },

    // ✅ NEU: Migration-Status prüfen
    async checkMigrationStatus() {
      try {
        const migrationStatus = localStorage.getItem('migration_status')
        if (migrationStatus) {
          this.lifecycleManager.identityManager.migrationStatus = migrationStatus
        }
      } catch (error) {
        console.warn('⚠️ [Harmony] Failed to check migration status:', error)
      }
    },

    // Race Condition Prevention
    _isUnifyingIdentity: false,
  }),

  // ✅ NEU: Getter-Methoden für Store-Referenzen
  getters: {
    // ✅ KORRIGIERT: Sichere Store-Referenzen mit Fallbacks
    mqttStore: (state) => {
      const store = state.storeReferences?.mqtt
      return store || null
    },
    centralConfig: (state) => {
      const store = state.storeReferences?.centralConfig
      return store || null
    },
    espManagement: (state) => {
      const store = state.storeReferences?.espManagement
      return store || null
    },
    sensorRegistry: (state) => {
      const store = state.storeReferences?.sensorRegistry
      return store || null
    },
    piIntegration: (state) => {
      const store = state.storeReferences?.piIntegration
      return store || null
    },
    actuatorLogic: (state) => {
      const store = state.storeReferences?.actuatorLogic
      return store || null
    },
    systemCommands: (state) => {
      const store = state.storeReferences?.systemCommands
      return store || null
    },
    dashboardGenerator: (state) => {
      const store = state.storeReferences?.dashboardGenerator
      return store || null
    },
    databaseLogs: (state) => {
      const store = state.storeReferences?.databaseLogs
      return store || null
    },
    timeRange: (state) => {
      const store = state.storeReferences?.timeRange
      return store || null
    },
    zoneRegistry: (state) => {
      const store = state.storeReferences?.zoneRegistry
      return store || null
    },
    logicalAreas: (state) => {
      const store = state.storeReferences?.logicalAreas
      return store || null
    },
    theme: (state) => {
      const store = state.storeReferences?.theme
      return store || null
    },
    counter: (state) => {
      const store = state.storeReferences?.counter
      return store || null
    },

    // ✅ KORRIGIERT: Sichere System-Status-Getter
    isSystemInitialized: (state) => {
      const result = state.initializationStatus?.initialized || false
      console.log('🔍 CENTRALDATAHUB DEBUG - isSystemInitialized called')
      console.log(
        '🔍 CENTRALDATAHUB DEBUG - state.initializationStatus:',
        state.initializationStatus,
      )
      console.log('🔍 CENTRALDATAHUB DEBUG - isSystemInitialized result:', result)
      return result
    },
    isKaiserMode: (state) => {
      return state.systemType === 'kaiser' || state.systemType === 'god_kaiser'
    },
    isGodMode: (state) => {
      return state.systemType === 'god' || state.systemType === 'god_kaiser'
    },
    getKaiserId: (state) => {
      return state.kaiserId || 'default_kaiser'
    },

    // ✅ NEU: System-Bereitschafts-Status
    isStoresReady: (state) => {
      return (
        state.storeReferences?.mqtt &&
        state.storeReferences?.centralConfig &&
        state.initializationStatus?.initialized
      )
    },
  },

  actions: {
    // ✅ NEU: Store-Initialisierung mit Retry-Logic
    async initializeStores() {
      try {
        this.initializationStatus.lastInitAttempt = Date.now()

        console.log('🔄 [CentralDataHub] Starting store initialization...')

        // ✅ NEU: Dependency-Tracking initialisieren
        this.initializeDependencyTracking()

        // ✅ NEU: Sichere Store-Initialisierung mit Validierung
        const stores = {}
        const storeNames = [
          'centralConfig', // Basis-Konfiguration zuerst
          'mqtt', // MQTT nach Config
          'espManagement',
          'sensorRegistry',
          'piIntegration',
          'actuatorLogic',
          'systemCommands',
          'dashboardGenerator',
          'databaseLogs',
          'timeRange',
          'zoneRegistry',
          'logicalAreas',
          'theme',
          'counter',
        ]

        // ✅ NEU: Stores einzeln laden mit Error Handling
        for (const storeName of storeNames) {
          try {
            console.log(`🔄 [CentralDataHub] Loading ${storeName} store...`)

            let store = null

            // ✅ NEU: Event-basierte Store-Zugriffe
            store = storeHandler.getStore(storeName)

            if (!store) {
              // Store nicht in Registry, versuche asynchron zu laden
              try {
                store = await storeHandler.getStoreAsync(storeName, 5000)
              } catch (error) {
                console.warn(
                  `⚠️ [CentralDataHub] Failed to get store ${storeName} from registry:`,
                  error.message,
                )
              }
            }

            if (store) {
              stores[storeName] = store
              this.storeReferences[storeName] = store // ✅ NEU: Store-Referenz setzen
              console.log(`✅ [CentralDataHub] ${storeName} store loaded successfully`)
            } else {
              console.warn(`⚠️ [CentralDataHub] ${storeName} store not available`)
            }
          } catch (error) {
            console.warn(`⚠️ [CentralDataHub] Failed to load ${storeName} store:`, error.message)

            // ✅ NEU: Kritische Stores dürfen nicht fehlschlagen
            if (['centralConfig', 'mqtt'].includes(storeName)) {
              throw new Error(`Critical store ${storeName} failed to load: ${error.message}`)
            }
          }
        }

        // ✅ NEU: Validierung der kritischen Stores
        console.log('🔄 [CentralDataHub] Validating critical stores...')

        if (!stores.centralConfig) {
          throw new Error('CentralConfig Store konnte nicht geladen werden')
        }

        if (!stores.mqtt) {
          throw new Error('MQTT Store konnte nicht geladen werden')
        }

        // ✅ NEU: Validierung der kritischen Getter
        const centralKaiserId = stores.centralConfig.getCurrentKaiserId
        if (typeof centralKaiserId !== 'function' && typeof centralKaiserId !== 'string') {
          console.warn('[CentralDataHub] CentralConfig getCurrentKaiserId getter not available')
        }

        const mqttKaiserId = stores.mqtt.getKaiserId
        if (typeof mqttKaiserId !== 'function' && typeof mqttKaiserId !== 'string') {
          console.warn('[CentralDataHub] MQTT getKaiserId getter not available')
        }

        // Speichere Store-Referenzen
        this.storeReferences = stores
        this.initializationStatus.storesLoaded = true

        // ✅ NEU: Dependency-Analyse durchführen
        this.analyzeDependencies()

        // ✅ NEU: Circular-Dependency-Optimierung
        this.optimizeCircularDependencies()

        console.log('✅ [CentralDataHub] All stores loaded successfully')
        errorHandler.log('[CentralDataHub] All stores loaded successfully')
        return true
      } catch (error) {
        this.initializationStatus.error = error.message
        console.error('❌ [CentralDataHub] Store initialization failed:', error)
        errorHandler.error('[CentralDataHub] Store initialization failed:', error)
        return false
      }
    },

    // ✅ NEU: Cache-Management
    clearCache() {
      this.dataCache.clear()
    },

    // ✅ NEU: Dependency-Tracking initialisieren
    initializeDependencyTracking() {
      this.dependencyTracking.storeDependencies.clear()
      this.dependencyTracking.circularDependencies.clear()
      this.dependencyTracking.dependencyStats = {
        totalDependencies: 0,
        circularDependencies: 0,
        lastOptimization: Date.now(),
      }

      console.log('✅ Dependency-Tracking initialisiert')
    },

    // ✅ NEU: Dependency-Analyse durchführen
    analyzeDependencies() {
      const storeNames = Object.keys(this.storeReferences)

      for (const storeName of storeNames) {
        const store = this.storeReferences[storeName]
        if (!store) continue

        // Store-Imports analysieren (basierend auf bekannten Patterns)
        const dependencies = this.detectStoreDependencies(storeName)
        this.dependencyTracking.storeDependencies.set(storeName, dependencies)

        this.dependencyTracking.dependencyStats.totalDependencies += dependencies.size
      }

      console.log(
        `✅ Dependency-Analyse abgeschlossen: ${this.dependencyTracking.dependencyStats.totalDependencies} Dependencies gefunden`,
      )
    },

    // ✅ NEU: Store-Dependencies erkennen
    detectStoreDependencies(storeName) {
      const dependencies = new Set()

      // Bekannte Dependency-Patterns
      const dependencyPatterns = {
        mqtt: ['centralConfig', 'eventBus'],
        actuatorLogic: ['mqtt', 'sensorRegistry', 'systemCommands'],
        espManagement: ['mqtt', 'centralConfig', 'centralDataHub'],
        sensorRegistry: ['mqtt', 'eventBus'],
        centralConfig: ['mqtt', 'eventBus'],
        centralDataHub: ['ALL_STORES'], // Zirkuläre Dependency!
      }

      const patterns = dependencyPatterns[storeName] || []
      patterns.forEach((dep) => dependencies.add(dep))

      return dependencies
    },

    // ✅ NEU: Circular-Dependency-Optimierung
    optimizeCircularDependencies() {
      const circularChains = this.detectCircularDependencies()

      for (const chain of circularChains) {
        this.dependencyTracking.circularDependencies.add(chain)
        this.dependencyTracking.dependencyStats.circularDependencies++

        // ✅ NEU: Event-basierte Kommunikation für zirkuläre Dependencies
        this.setupEventBasedCommunication(chain)
      }

      console.log(`✅ Circular-Dependency-Optimierung: ${circularChains.length} Ketten optimiert`)
    },

    // ✅ NEU: Circular-Dependencies erkennen
    detectCircularDependencies() {
      const circularChains = []
      const visited = new Set()
      const recursionStack = new Set()

      const dfs = (storeName, path = []) => {
        if (recursionStack.has(storeName)) {
          // Circular dependency gefunden
          const cycleStart = path.indexOf(storeName)
          const cycle = path.slice(cycleStart)
          circularChains.push([...cycle, storeName])
          return
        }

        if (visited.has(storeName)) return

        visited.add(storeName)
        recursionStack.add(storeName)

        const dependencies = this.dependencyTracking.storeDependencies.get(storeName) || new Set()
        for (const dep of dependencies) {
          if (dep !== 'ALL_STORES') {
            // centralDataHub überspringen
            dfs(dep, [...path, storeName])
          }
        }

        recursionStack.delete(storeName)
      }

      for (const storeName of this.dependencyTracking.storeDependencies.keys()) {
        if (!visited.has(storeName)) {
          dfs(storeName)
        }
      }

      return circularChains
    },

    // ✅ NEU: Event-basierte Kommunikation für zirkuläre Dependencies
    setupEventBasedCommunication(circularChain) {
      console.log(`🔄 Event-basierte Kommunikation für Chain: ${circularChain.join(' → ')}`)

      // Event-Listener für Store-Kommunikation registrieren
      eventBus.on('STORE_REQUEST', (data) => {
        const { storeName, method, params } = data
        const store = this.storeReferences[storeName]

        if (store && typeof store[method] === 'function') {
          const result = store[method](...params)
          eventBus.emit('STORE_RESPONSE', { requestId: data.requestId, result })
        }
      })
    },

    // ✅ NEU: UI-Konfiguration
    updateUiConfig(config) {
      this.uiConfig = { ...this.uiConfig, ...config }
    },

    toggleAggregations() {
      this.uiConfig.showAggregations = !this.uiConfig.showAggregations
    },

    toggleCompactMode() {
      this.uiConfig.compactMode = !this.uiConfig.compactMode
    },

    // ✅ MIGRIERT: System-Status-Updates - Event-basiert
    updateSystemStatus() {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.SYSTEM_STATUS_UPDATE, {
        timestamp: Date.now(),
      })

      // Fallback für Rückwärtskompatibilität
      const mqttStore = this.getStore('mqtt')

      this.systemStatus = {
        safeMode: this.isSafeMode,
        connectionQuality: mqttStore?.connectionQuality,
        lastUpdate: Date.now(),
        kaiserMode: this.isKaiserMode,
        emergencyStop: mqttStore?.systemStatus?.emergencyStop,
      }
    },

    // ✅ MIGRIERT: Einheitliche ESP-Auswahl - Event-basiert
    selectEsp(espId) {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ESP_SELECTION, {
        espId,
        timestamp: Date.now(),
      })

      // ✅ NEU: Event-basierte Store-Kommunikation
      const centralConfig = storeHandler.getStore('centralConfig')
      if (centralConfig) {
        centralConfig.selectedEspId = espId
      }
    },

    // ✅ MIGRIERT: Performance-optimierte Datenabfrage - Event-basiert
    async getOptimizedDeviceData(espId) {
      const cacheKey = `device-${espId}`

      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.DEVICE_DATA_REQUEST, {
        espId,
        timestamp: Date.now(),
      })

      return this.getCachedData(cacheKey, () => {
        // Fallback für Rückwärtskompatibilität
        const mqttStore = this.getStore('mqtt')
        const device = mqttStore?.espDevices?.get(espId)

        if (!device) return null

        return {
          ...device,
          sensors: this.getSensorAggregations(espId, this.uiConfig.selectedTimeRange),
          zone: this.getZoneForEsp(espId),
          lastUpdate: Date.now(),
        }
      })
    },

    // ✅ NEU: Mobile-Responsive-Helper
    shouldShowDetail(detailType) {
      const mode = this.getDisplayMode
      const detailLevels = {
        compact: ['critical', 'primary'],
        standard: ['critical', 'primary', 'secondary'],
        detailed: ['critical', 'primary', 'secondary', 'tertiary'],
      }
      return detailLevels[mode].includes(detailType)
    },

    // ✅ NEU: Einheitliche Fehlerbehandlung
    handleError(error, context = 'unknown') {
      errorHandler.error(`[${context}] Error:`, error)

      // Zentrale Fehlerbehandlung über GlobalSnackbar
      if (window.$snackbar) {
        window.$snackbar.showError(`Fehler in ${context}: ${error.message}`)
      }
    },

    // 🆕 NEU: System-Typ-Detection
    detectSystemType() {
      try {
        console.log('[CentralDataHub] Detecting system type...')

        const mqttStore = this.getStore('mqtt')
        const centralConfig = this.getStore('centralConfig')

        // System-Typ basierend auf verfügbaren Daten erkennen
        let systemType = 'unknown'
        let currentKaiserId = 'default_kaiser'
        let confidence = 0.0
        let apiPort = 80

        // MQTT Store Analyse
        if (mqttStore) {
          if (mqttStore.kaiser?.id && mqttStore.kaiser.id !== 'default_kaiser') {
            currentKaiserId = mqttStore.kaiser.id
            confidence += 0.3
          }

          // God-Modus erkennen
          if (mqttStore.isGodMode) {
            systemType = 'god'
            confidence += 0.4
          }
        }

        // CentralConfig Analyse
        if (centralConfig) {
          if (centralConfig.kaiserId && centralConfig.kaiserId !== 'default_kaiser') {
            if (currentKaiserId === 'default_kaiser') {
              currentKaiserId = centralConfig.kaiserId
            }
            confidence += 0.3
          }

          // Kaiser-Modus erkennen (entfernt - Legacy-Funktionalität)
        }

        // Standard-Modus als Fallback
        if (systemType === 'unknown' && confidence > 0.3) {
          systemType = 'standard'
        }

        // System-Identität aktualisieren
        this.systemIdentity.systemType = systemType
        this.systemIdentity.currentKaiserId = currentKaiserId
        this.systemIdentity.detectionConfidence = confidence
        this.systemIdentity.lastDetectionAttempt = Date.now()

        const result = {
          systemType,
          currentKaiserId,
          idSource: 'detection',
          confidence,
          apiPort,
        }

        console.log('[CentralDataHub] System detection result:', result)
        return result
      } catch (error) {
        console.error('[CentralDataHub] Detection error:', error)
        return {
          systemType: 'unknown',
          currentKaiserId: 'default_kaiser',
          idSource: 'error',
          confidence: 0.0,
          apiPort: 80,
        }
      }
    },

    // 🆕 NEU: Einheitliche ID-Synchronisation
    unifySystemIdentity() {
      try {
        console.log('[CentralDataHub] Unifying system identity...')

        const unifiedId = this.systemIdentity.currentKaiserId

        // ✅ OPTIMIERT: Race Condition Prevention
        if (this._isUnifyingIdentity) {
          console.warn('[CentralDataHub] Identity unification already in progress')
          return false
        }
        this._isUnifyingIdentity = true

        // ✅ BESTEHEND: MQTT Store synchronisieren
        const mqttStore = this.getStore('mqtt')
        if (mqttStore) {
          const oldId = mqttStore.kaiser.id
          mqttStore.kaiser.id = unifiedId
          localStorage.setItem('kaiser_id', unifiedId)

          if (oldId !== unifiedId) {
            console.log('[CentralDataHub] MQTT Store kaiser ID updated:', oldId, '→', unifiedId)
          }
        }

        // ✅ BESTEHEND: CentralConfig synchronisieren
        const centralConfig = this.getStore('centralConfig')
        if (centralConfig) {
          const oldId = centralConfig.kaiserId
          centralConfig.kaiserId = unifiedId

          if (oldId !== unifiedId) {
            console.log('[CentralDataHub] CentralConfig kaiser ID updated:', oldId, '→', unifiedId)
          }
        }

        this.systemIdentity.lastSync = Date.now()
        this.systemIdentity.migrationStatus = 'completed'

        console.log('[CentralDataHub] System identity unification completed')
        return true
      } catch (error) {
        console.error('[CentralDataHub] Error unifying system identity:', error)
        this.systemIdentity.migrationStatus = 'failed'
        return false
      } finally {
        this._isUnifyingIdentity = false
      }
    },

    // 🆕 NEU: ID-Migration von Legacy-Systemen
    async migrateLegacyIds() {
      try {
        console.log('[CentralDataHub] Starting legacy ID migration...')

        // localStorage Migration
        const localStorageId = localStorage.getItem('kaiser_id')
        if (localStorageId && localStorageId !== 'default_kaiser') {
          console.log('[CentralDataHub] Found localStorage kaiser ID:', localStorageId)
          this.systemIdentity.currentKaiserId = localStorageId
          this.systemIdentity.idSource = 'environment'
        }

        // Environment Variable Migration
        const envKaiserId = import.meta.env.VITE_KAISER_ID
        if (envKaiserId && envKaiserId !== 'default_kaiser') {
          console.log('[CentralDataHub] Found environment kaiser ID:', envKaiserId)
          this.systemIdentity.currentKaiserId = envKaiserId
          this.systemIdentity.idSource = 'environment'
        }

        // System-Typ basierend auf migrierter ID neu erkennen
        this.detectSystemType()

        // Einheitliche ID setzen
        this.unifySystemIdentity()

        console.log('[CentralDataHub] Legacy ID migration completed')
        return true
      } catch (error) {
        console.error('[CentralDataHub] Legacy ID migration error:', error)
        return false
      }
    },

    // 🆕 NEU: Backend-Konnektivität testen
    async testBackendConnection() {
      const apiUrl = this.systemIdentity.backendIntegration.apiBaseUrl

      if (!apiUrl) {
        console.warn('[CentralDataHub] No API URL available for backend test')
        this.systemIdentity.backendIntegration.connectionHealth = 'unknown'
        return false
      }

      try {
        console.log('[CentralDataHub] Testing backend connection:', apiUrl)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(`${apiUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          this.systemIdentity.backendIntegration.connectionHealth = 'healthy'
          console.log('[CentralDataHub] Backend connection healthy:', apiUrl)
          return true
        } else {
          this.systemIdentity.backendIntegration.connectionHealth = 'unhealthy'
          console.warn('[CentralDataHub] Backend unhealthy:', response.status, response.statusText)
          return false
        }
      } catch (error) {
        this.systemIdentity.backendIntegration.connectionHealth = 'error'
        if (error.name === 'AbortError') {
          console.error('[CentralDataHub] Backend connection timeout:', apiUrl)
        } else {
          console.error('[CentralDataHub] Backend connection error:', error.message)
        }
        return false
      }
    },

    // 🆕 NEU: System-Typ manuell erzwingen
    forceSystemType(systemType, kaiserId = null) {
      console.log('[CentralDataHub] Force setting system type:', systemType, kaiserId)

      this.systemIdentity.systemType = systemType
      this.systemIdentity.manualOverride = true
      this.systemIdentity.detectionConfidence = 1.0

      if (kaiserId) {
        this.systemIdentity.currentKaiserId = kaiserId
      }

      this.unifySystemIdentity()
    },

    // 🆕 NEU: System-Detection zurücksetzen
    resetSystemDetection() {
      console.log('[CentralDataHub] Resetting system detection...')

      this.systemIdentity.manualOverride = false
      this.systemIdentity.detectionConfidence = 0.0
      this.detectSystemType()
    },

    // ✅ MIGRIERT: ID-Konflikt-Auflösung - Event-basiert
    async resolveIdConflict(espId, deviceKaiserId, currentKaiserId) {
      try {
        console.log('[CentralDataHub] Resolving ID conflict:', {
          espId,
          deviceKaiserId,
          currentKaiserId,
        })

        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.ID_CONFLICT_RESOLUTION, {
          espId,
          deviceKaiserId,
          currentKaiserId,
          timestamp: Date.now(),
        })

        // God-Modus: Device adoptieren
        if (this.isGodMode) {
          // Fallback für Rückwärtskompatibilität
          const mqttStore = this.mqttStore
          if (mqttStore) {
            await mqttStore.resolveKaiserIdConflict(espId, 'adopt')
          }
          return { action: 'adopt', success: true }
        }

        // Kaiser-Modus: Device zurücksetzen
        if (this.isKaiserMode) {
          // Fallback für Rückwärtskompatibilität
          const mqttStore = this.mqttStore
          if (mqttStore) {
            await mqttStore.resolveKaiserIdConflict(espId, 'reset')
          }
          return { action: 'reset', success: true }
        }
      } catch (error) {
        console.error('[CentralDataHub] Error resolving ID conflict:', error)
        return { action: 'none', success: false, error: error.message }
      }
    },

    // ✅ MIGRIERT: MQTT Store Funktions-Delegation - Event-basiert
    async handleKaiserRegistration(kaiserData) {
      try {
        console.log('[CentralDataHub] Handling Kaiser registration:', kaiserData)

        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.KAISER_REGISTRATION, {
          kaiserData,
          timestamp: Date.now(),
        })

        // Fallback für Rückwärtskompatibilität
        const mqttStore = this.mqttStore
        if (!mqttStore) {
          throw new Error('MQTT Store not available')
        }

        // Delegiert an MQTT Store
        const result = await mqttStore.registerWithGod(kaiserData)

        // System-Identität nach Registration aktualisieren
        this.detectSystemType()
        this.unifySystemIdentity()

        return result
      } catch (error) {
        console.error('[CentralDataHub] Error handling Kaiser registration:', error)
        throw error
      }
    },

    // ✅ MIGRIERT: God-Kommunikation - Event-basiert
    async handleGodCommunication(godMessage) {
      try {
        console.log('[CentralDataHub] Handling God communication:', godMessage)

        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.GOD_COMMUNICATION, {
          godMessage,
          timestamp: Date.now(),
        })

        // Fallback für Rückwärtskompatibilität
        const mqttStore = this.mqttStore
        if (!mqttStore) {
          throw new Error('MQTT Store not available')
        }

        // Delegiert an MQTT Store
        return await mqttStore.pushToGod(godMessage.type, godMessage.data)
      } catch (error) {
        console.error('[CentralDataHub] Error handling God communication:', error)
        throw error
      }
    },

    // ✅ MIGRIERT: System-Nachrichten verarbeiten - Event-basiert
    async processSystemMessage(message) {
      try {
        console.log('[CentralDataHub] Processing system message:', message.type)

        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.SYSTEM_MESSAGE_PROCESS, {
          message,
          timestamp: Date.now(),
        })

        // Fallback für Rückwärtskompatibilität
        // Router: Leitet Messages an richtige Stores weiter
        switch (message.type) {
          case 'sensor_data':
            return this.sensorRegistry?.process?.(message) || null

          case 'system_command':
            return this.systemCommands?.process?.(message) || null

          case 'esp_management':
            return this.espManagement?.process?.(message) || null

          case 'actuator_command':
            return this.actuatorLogic?.process?.(message) || null

          case 'pi_integration':
            return this.piIntegration?.process?.(message) || null

          case 'zone_config':
            return this.zoneRegistry?.process?.(message) || null

          case 'dashboard_update':
            return this.dashboardGenerator?.process?.(message) || null

          default:
            console.warn('[CentralDataHub] Unknown message type:', message.type)
            return null
        }
      } catch (error) {
        console.error('[CentralDataHub] Error processing system message:', error)
        return null
      }
    },

    // ✅ MIGRIERT: ESP-Transfer über centralDataHub koordinieren - Event-basiert
    async transferEsp(espId, fromOwner, toOwner) {
      try {
        console.log('[CentralDataHub] Transferring ESP:', { espId, fromOwner, toOwner })

        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.ESP_TRANSFER_COMMAND, {
          espId,
          fromOwner,
          toOwner,
          timestamp: Date.now(),
        })

        // Fallback für Rückwärtskompatibilität
        const mqttStore = this.mqttStore
        if (!mqttStore) {
          throw new Error('MQTT Store not available')
        }

        let result

        // Transfer-Logik basierend auf System-Typ
        if (toOwner === 'raspberry_pi_central') {
          // ESP von Kaiser zu God transferieren
          result = await mqttStore.transferEspFromKaiserToGod(espId, fromOwner)
        } else {
          // ESP von God zu Kaiser transferieren
          result = await mqttStore.transferEspFromGodToKaiser(espId, toOwner)
        }

        // Ownership in centralDataHub aktualisieren
        this.hierarchicalState.espOwnership.set(espId, toOwner)

        // Cache invalidieren
        this.invalidateHierarchicalCache('esp_ownership')

        return result
      } catch (error) {
        console.error('[CentralDataHub] Error transferring ESP:', error)
        throw error
      }
    },

    // ✅ MIGRIERT: Cross-Kaiser-Kommunikation koordinieren - Event-basiert
    async handleCrossKaiserCommand(sourceKaiserId, targetKaiserId, command) {
      try {
        console.log('[CentralDataHub] Handling cross-Kaiser command:', {
          sourceKaiserId,
          targetKaiserId,
          command,
        })

        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.CROSS_KAISER_COMMAND, {
          sourceKaiserId,
          targetKaiserId,
          command,
          timestamp: Date.now(),
        })

        // Fallback für Rückwärtskompatibilität
        const mqttStore = this.mqttStore
        if (!mqttStore) {
          throw new Error('MQTT Store not available')
        }

        // Delegiert an MQTT Store
        return await mqttStore.handleCrossKaiserCommand(sourceKaiserId, targetKaiserId, command)
      } catch (error) {
        console.error('[CentralDataHub] Error handling cross-Kaiser command:', error)
        throw error
      }
    },

    // 🆕 NEU: System-Health über centralDataHub aggregieren
    async getSystemHealth() {
      try {
        const healthData = {
          centralDataHub: {
            systemType: this.systemIdentity.systemType,
            currentKaiserId: this.systemIdentity.currentKaiserId,
            lastSync: this.systemIdentity.lastSync,
            migrationStatus: this.systemIdentity.migrationStatus,
          },
          mqtt: null,
          centralConfig: null,
          espManagement: null,
          sensorRegistry: null,
        }

        // MQTT Health
        if (this.mqttStore) {
          healthData.mqtt = {
            connected: this.mqttStore.connected,
            connectionQuality: this.mqttStore.connectionQuality,
            espDeviceCount: this.mqttStore.espDevices?.size || 0,
            lastHeartbeat: this.mqttStore.lastHeartbeat,
          }
        }

        // CentralConfig Health
        if (this.centralConfig) {
          healthData.centralConfig = {
            kaiserId: this.centralConfig.kaiserId,
            selectedEspId: this.centralConfig.selectedEspId,
            zoneCount: Object.keys(this.centralConfig.zones?.zoneMapping || {}).length,
          }
        }

        // ESP Management Health
        if (this.espManagement) {
          healthData.espManagement = {
            managedEspCount: this.espManagement.managedEspDevices?.size || 0,
            lastUpdate: this.espManagement.lastUpdate,
          }
        }

        // Sensor Registry Health
        if (this.sensorRegistry) {
          healthData.sensorRegistry = {
            registeredSensors: this.sensorRegistry.registeredSensors?.size || 0,
            lastUpdate: this.sensorRegistry.lastUpdate,
          }
        }

        return healthData
      } catch (error) {
        console.error('[CentralDataHub] Error getting system health:', error)
        return { error: error.message }
      }
    },

    // ✅ KORRIGIERT: Sichere Store-Initialisierung mit ID-Migration
    async initializeSystem() {
      if (this.initializationStatus.initialized) {
        return true
      }

      try {
        console.log('[CentralDataHub] Starting system initialization...')

        // Cache leeren
        this.clearCache()

        // ✅ KORRIGIERT: Store-Referenzen korrekt setzen
        const stores = [
          'mqtt',
          'centralConfig',
          'espManagement',
          'sensorRegistry',
          'piIntegration',
          'actuatorLogic',
          'systemCommands',
          'dashboardGenerator',
          'databaseLogs',
          'timeRange',
          'zoneRegistry',
          'logicalAreas',
          'theme',
          'counter',
        ]

        for (const storeName of stores) {
          try {
            // ✅ NEU: Event-basierte Store-Zugriffe
            const store = storeHandler.getStore(storeName)
            if (store) {
              this.storeReferences[storeName] = store
              console.log(`✅ ${storeName} Store loaded via event system`)
            } else {
              console.warn(`⚠️ ${storeName} Store not available in registry`)
              if (['mqtt', 'centralConfig'].includes(storeName)) {
                throw new Error(`Critical store ${storeName} not available in registry`)
              }
            }
          } catch (error) {
            console.warn(`⚠️ ${storeName} Store load failed:`, error.message)
            if (['mqtt', 'centralConfig'].includes(storeName)) {
              throw new Error(`Critical store ${storeName} failed to load: ${error.message}`)
            }
          }
        }

        // 🆕 NEU: Legacy ID-Migration
        await this.migrateLegacyIds()

        // 🆕 NEU: System-Typ erkennen
        const detectionResult = this.detectSystemType()
        console.log('[CentralDataHub] System detected:', detectionResult)

        // 🆕 NEU: Einheitliche ID setzen
        const unificationResult = this.unifySystemIdentity()
        console.log('[CentralDataHub] IDs unified:', unificationResult)

        // 🆕 NEU: Backend-Konnektivität testen
        const backendHealthy = await this.testBackendConnection()
        console.log('[CentralDataHub] Backend health:', backendHealthy)

        // ✅ BESTEHEND: System-Status aktualisieren
        this.updateSystemStatus()

        // ✅ MIGRIERT: Automatische ESP-Auswahl wenn nötig - Event-basiert
        if (!this.getSelectedEspId) {
          // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
          eventBus.emit(MQTT_EVENTS.AUTO_SELECT_ESP, {
            currentSelectedEspId: this.getSelectedEspId,
            timestamp: Date.now(),
          })

          // Fallback für Rückwärtskompatibilität
          const mqttStore = this.mqttStore
          if (mqttStore && mqttStore.espDevices) {
            const firstEspId = Array.from(mqttStore.espDevices.keys())[0]
            if (firstEspId) {
              this.selectEsp(firstEspId)
            }
          }
        }

        this.initializationStatus.initialized = true
        this.initializationStatus.storesLoaded = true
        errorHandler.log('[CentralDataHub] System initialized successfully')

        console.log('[CentralDataHub] System initialization completed successfully')
        return true
      } catch (error) {
        this.handleError(error, 'system-initialization')
        this.initializationStatus.error = error.message
        console.error('[CentralDataHub] System initialization failed:', error)
        return false
      }
    },

    // ✅ NEU: Einheitliche Store-Zugriffe (robust)
    getStore(storeName) {
      const storeMap = {
        mqtt: this.mqttStore,
        centralConfig: this.centralConfig,
        espManagement: this.espManagement,
        sensorRegistry: this.sensorRegistry,
        piIntegration: this.piIntegration,
        actuatorLogic: this.actuatorLogic,
        systemCommands: this.systemCommands,
        dashboardGenerator: this.dashboardGenerator,
        databaseLogs: this.databaseLogs,
        timeRange: this.timeRange,
        zoneRegistry: this.zoneRegistry,
        logicalAreas: this.logicalAreas,
        theme: this.theme,
        counter: this.counter,
      }

      const store = storeMap[storeName]

      // ✅ NEU: Spezielle Validierung für DashboardGenerator
      if (storeName === 'dashboardGenerator' && store) {
        if (typeof store.getSensorGroupKey !== 'function') {
          errorHandler.warn('[CentralDataHub] DashboardGenerator Store not fully initialized')
          return null
        }
      }

      return store || null
    },

    // ✅ NEU: Einheitliche Datenabfragen
    async getDeviceInfo(espId) {
      return this.getOptimizedDeviceData(espId)
    },

    async getSensorData(espId, gpio) {
      return this.getSensorValue(espId, gpio)
    },

    async getActuatorData(espId, gpio) {
      return this.getActuatorState(espId, gpio)
    },

    // ✅ MIGRIERT: Einheitliche Konfigurations-Updates - Event-basiert
    updateServerConfig(config) {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.SERVER_CONFIG_UPDATE, {
        config,
        timestamp: Date.now(),
      })

      // ✅ NEU: Event-basierte Store-Kommunikation
      const centralConfig = storeHandler.getStore('centralConfig')
      if (centralConfig) {
        if (config.serverIP) centralConfig.setServerIP(config.serverIP)
        if (config.httpPort) centralConfig.setHttpPort(config.httpPort)
        if (config.mqttPortFrontend) centralConfig.setMqttPortFrontend(config.mqttPortFrontend)
        if (config.mqttPortESP32) centralConfig.setMqttPortESP32(config.mqttPortESP32)
        if (config.kaiserId) centralConfig.setKaiserId(config.kaiserId)
      }
    },

    // ✅ MIGRIERT: Einheitliche Zone-Verwaltung - Event-basiert
    setZoneForEsp(espId, zoneName) {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ZONE_CHANGES, {
        espId,
        zoneName,
        action: 'set',
        timestamp: Date.now(),
      })

      // ✅ NEU: Event-basierte Store-Kommunikation
      const centralConfig = storeHandler.getStore('centralConfig')
      if (centralConfig) {
        centralConfig.setZone(espId, zoneName)
      }
    },

    removeZoneFromEsp(espId) {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ZONE_CHANGES, {
        espId,
        action: 'remove',
        timestamp: Date.now(),
      })

      // ✅ NEU: Event-basierte Store-Kommunikation
      const centralConfig = storeHandler.getStore('centralConfig')
      if (centralConfig) {
        centralConfig.removeZone(espId)
      }
    },

    // ✅ NEU: Einheitliche Sensor-Verwaltung
    registerSensor(espId, gpio, sensorData) {
      const sensorRegistry = storeHandler.getStore('sensorRegistry')
      if (sensorRegistry) {
        sensorRegistry.registerSensor(espId, gpio, sensorData)
      }
    },

    updateSensorData(espId, gpio, data) {
      const sensorRegistry = storeHandler.getStore('sensorRegistry')
      if (sensorRegistry) {
        sensorRegistry.updateSensorData(espId, gpio, data)
      }
    },

    // ✅ MIGRIERT: Einheitliche MQTT-Operationen - Event-basiert
    async connectToMqtt() {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.CONNECTION_REQUEST, {
        action: 'connect',
        timestamp: Date.now(),
      })

      // ✅ NEU: Event-basierte Store-Kommunikation
      const mqttStore = storeHandler.getStore('mqtt')
      if (mqttStore) {
        return await mqttStore.connect()
      }
      throw new Error('MQTT Store not available')
    },

    async disconnectFromMqtt() {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.CONNECTION_REQUEST, {
        action: 'disconnect',
        timestamp: Date.now(),
      })

      // ✅ NEU: Event-basierte Store-Kommunikation
      const mqttStore = storeHandler.getStore('mqtt')
      if (mqttStore) {
        return await mqttStore.disconnect()
      }
      throw new Error('MQTT Store not available')
    },

    // ✅ NEU: Einheitliche Pi-Integration
    async checkPiStatus() {
      const piIntegration = storeHandler.getStore('piIntegration')
      if (piIntegration) {
        return await piIntegration.checkPiStatus()
      }
      throw new Error('PiIntegration Store not available')
    },

    // ✅ NEU: Einheitliche System-Befehle
    async restartSystem(espId) {
      const systemCommands = storeHandler.getStore('systemCommands')
      if (systemCommands) {
        return await systemCommands.restartSystem(espId)
      }
      throw new Error('SystemCommands Store not available')
    },

    async emergencyStopAll() {
      const mqttStore = storeHandler.getStore('mqtt')
      if (mqttStore) {
        return await mqttStore.emergencyStopAll()
      }
      throw new Error('MQTT Store not available')
    },

    // 🆕 NEU: MQTT Message Router für Store-to-Store Communication
    routeMqttMessage(topic, payload) {
      const topicParts = topic.split('/')

      try {
        // Route zu entsprechendem Store basierend auf Topic
        if (topic.includes('/sensor/')) {
          // ✅ NEU: ESP-ID aus Topic extrahieren und an sensorRegistry weitergeben
          const espId = this.extractEspIdFromTopic(topicParts)
          if (espId) {
            this.sensorRegistry?.handleSensorData(espId, topicParts, payload)
          }
        } else if (topic.includes('/actuator/')) {
          this.actuatorLogic?.handleActuatorStatus(topicParts, payload)
        } else if (topic.includes('/esp/') && topic.includes('/config')) {
          this.espManagement?.handleEspConfig(topicParts, payload)
        } else if (topic.includes('/esp/discovery')) {
          this.espManagement?.handleNewEspDiscovery(topicParts, payload)
        } else if (topic.includes('/system/')) {
          this.systemCommands?.handleSystemCommand(topicParts, payload)
        } else if (topic.includes('/god/')) {
          this.handleGodMessage(topicParts, payload)
        } else if (topic.includes('/heartbeat')) {
          this.handleHeartbeat(topicParts, payload)
        } else if (topic.includes('/status')) {
          this.handleStatusUpdate(topicParts, payload)
        } else if (topic.includes('/zone/')) {
          this.handleZoneChanges(topicParts, payload)
        } else if (topic.includes('/subzone/')) {
          this.handleSubzoneMessage(topicParts, payload)
        }
      } catch (error) {
        errorHandler.error('[CentralDataHub] MQTT Message Routing failed', error, {
          topic,
          payload,
        })
      }
    },

    // 🆕 NEU: God-Kaiser Message Handler
    handleGodMessage(topicParts, payload) {
      // God-Kaiser Kommunikation wird hier verarbeitet
      // Wird später aus mqtt.js hierher verschoben
      console.log('[CentralDataHub] God message received:', topicParts, payload)
    },

    // 🆕 NEU: Heartbeat Handler
    handleHeartbeat(topicParts, payload) {
      // Heartbeat wird hier verarbeitet
      // Wird später aus mqtt.js hierher verschoben
      console.log('[CentralDataHub] Heartbeat received:', topicParts, payload)
    },

    // 🆕 NEU: Status Update Handler
    handleStatusUpdate(topicParts, payload) {
      // Status Updates werden hier verarbeitet
      // Wird später aus mqtt.js hierher verschoben
      console.log('[CentralDataHub] Status update received:', topicParts, payload)
    },

    // 🆕 NEU: Zone Changes Handler
    handleZoneChanges(topicParts, payload) {
      // Zone Changes werden hier verarbeitet
      // Wird später aus mqtt.js hierher verschoben
      console.log('[CentralDataHub] Zone changes received:', topicParts, payload)
    },

    // 🆕 NEU: Subzone Message Handler
    handleSubzoneMessage(topicParts, payload) {
      // Subzone Messages werden hier verarbeitet
      // Wird später aus mqtt.js hierher verschoben
      console.log('[CentralDataHub] Subzone message received:', topicParts, payload)
    },

    // ✅ NEU: ESP-ID aus Topic extrahieren
    extractEspIdFromTopic(topicParts) {
      // Standard topic structure: kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
      if (topicParts.length >= 4 && topicParts[2] === 'esp') {
        return topicParts[3]
      }
      // New ESP32 topic structure: kaiser/{kaiser_id}/master/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data
      if (topicParts.length >= 6 && topicParts[4] === 'esp') {
        return topicParts[5]
      }
      // Legacy topic structure: kaiser/{kaiser_id}/esp/{esp_id}/sensor_data
      if (topicParts.length >= 4 && topicParts[2] === 'esp') {
        return topicParts[3]
      }
      return null
    },

    // 🆕 NEU: Hierarchische Zustands-Updates für God-Kaiser-Integration
    updateHierarchicalState(updateType, data) {
      try {
        switch (updateType) {
          case 'kaiser_status':
            this.hierarchicalState.kaisers.set(data.kaiser_id, data)
            this.invalidateHierarchicalCache(`kaiser_${data.kaiser_id}`)
            break
          case 'kaiser_health': {
            const kaiserData = this.hierarchicalState.kaisers.get(data.kaiser_id) || {}
            this.hierarchicalState.kaisers.set(data.kaiser_id, { ...kaiserData, health: data })
            this.invalidateHierarchicalCache(`kaiser_${data.kaiser_id}`)
            break
          }
          case 'esp_transfer':
            this.hierarchicalState.espOwnership.set(data.esp_id, data.to_owner)
            this.invalidateHierarchicalCache('esp_ownership')
            break
          case 'command_chain':
            this.hierarchicalState.commandChains.set(data.command_id, data)
            break
          case 'hierarchy_update': {
            const kaiserHierarchy = this.hierarchicalState.kaisers.get(data.kaiser_id) || {}
            this.hierarchicalState.kaisers.set(data.kaiser_id, {
              ...kaiserHierarchy,
              hierarchy: data.hierarchy,
            })
            this.invalidateHierarchicalCache(`kaiser_${data.kaiser_id}`)
            break
          }
          default:
            console.warn(`[CentralDataHub] Unknown hierarchical state update type: ${updateType}`)
        }
      } catch (error) {
        console.error(`[CentralDataHub] Error updating hierarchical state:`, error)
      }
    },

    // 🆕 NEU: Hierarchische Cache-Invalidierung
    invalidateHierarchicalCache(cacheKey) {
      this.hierarchicalCache.delete(cacheKey)
      // BESTEHENDE Cache-Invalidierung nutzen
      this.clearCache(cacheKey)
    },

    // 🆕 NEU: Hierarchische Cache-Strategien
    getHierarchicalCachedData(key, fetcher, timeout = null) {
      const cached = this.hierarchicalCache.get(key)
      const cacheTimeout = timeout || this.performanceConfig.cacheTimeouts.hierarchy_data

      if (cached && Date.now() - cached.timestamp < cacheTimeout) {
        return cached.data
      }

      const data = fetcher()
      this.hierarchicalCache.set(key, {
        data,
        timestamp: Date.now(),
      })

      // Cache-Größe überwachen
      this.monitorCacheSize()

      return data
    },

    // 🆕 NEU: Cache-Größe überwachen
    monitorCacheSize() {
      if (this.hierarchicalCache.size > this.performanceConfig.maxCacheSize) {
        this.cleanupCache()
      }
    },

    // 🆕 NEU: Cache-Cleanup
    cleanupCache() {
      const entries = Array.from(this.hierarchicalCache.entries())
      const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

      // 20% der ältesten Einträge entfernen
      const removeCount = Math.floor(this.hierarchicalCache.size * 0.2)
      for (let i = 0; i < removeCount; i++) {
        this.hierarchicalCache.delete(sortedEntries[i][0])
      }

      console.log(`[CentralDataHub] Cache cleanup: ${removeCount} entries removed`)
    },

    // 🆕 NEU: Memory-Optimierung
    optimizeMemoryUsage() {
      const memoryUsage = this.getMemoryUsage()

      if (memoryUsage > this.performanceConfig.memoryThreshold) {
        console.log(
          `[CentralDataHub] High memory usage (${(memoryUsage * 100).toFixed(1)}%), optimizing...`,
        )

        // Aggressive Cache-Cleanup
        this.hierarchicalCache.clear()
        this.dataCache.clear()

        // Garbage Collection anstoßen
        if (window.gc) {
          window.gc()
        }

        console.log('[CentralDataHub] Memory optimization completed')
      }
    },

    // 🆕 NEU: Memory-Nutzung ermitteln
    getMemoryUsage() {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit
      }
      return 0.5 // Fallback
    },

    // 🆕 NEU: Batch-Updates für Cross-Kaiser-Kommunikation
    scheduleCrossKaiserUpdate(kaiserId, update) {
      const batchKey = `cross_kaiser_${kaiserId}`
      const pendingUpdates = this.pendingCrossKaiserUpdates.get(batchKey) || []

      pendingUpdates.push(update)
      this.pendingCrossKaiserUpdates.set(batchKey, pendingUpdates)

      // Batch-Timeout setzen
      if (!this.crossKaiserBatchTimeout) {
        this.crossKaiserBatchTimeout = setTimeout(() => {
          this.processCrossKaiserBatchUpdates()
        }, this.performanceConfig.batchUpdateInterval)
      }
    },

    // 🆕 NEU: Cross-Kaiser Batch-Updates verarbeiten
    processCrossKaiserBatchUpdates() {
      this.pendingCrossKaiserUpdates.forEach((updates, kaiserId) => {
        if (updates.length > 0) {
          this.applyCrossKaiserBatchUpdates(kaiserId, updates)
        }
      })

      this.pendingCrossKaiserUpdates.clear()
      this.crossKaiserBatchTimeout = null
    },

    // ✅ MIGRIERT: Cross-Kaiser Batch-Updates anwenden - Event-basiert
    async applyCrossKaiserBatchUpdates(kaiserId, updates) {
      try {
        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.CROSS_KAISER_BATCH_UPDATE, {
          kaiserId,
          updates,
          timestamp: Date.now(),
        })

        // Updates gruppieren nach Typ
        const groupedUpdates = this.groupUpdatesByType(updates)

        // Fallback für Rückwärtskompatibilität
        const mqttStore = this.getStore('mqtt')

        const topic = `kaiser/${kaiserId}/batch_update`
        const payload = {
          updates: groupedUpdates,
          batch_size: updates.length,
          timestamp: Date.now(),
        }

        await mqttStore?.publish(topic, payload)

        console.log(
          `[CentralDataHub] Cross-kaiser batch update sent: ${updates.length} updates to ${kaiserId}`,
        )
      } catch (error) {
        console.error(`[CentralDataHub] Cross-kaiser batch update failed for ${kaiserId}:`, error)
      }
    },

    // 🆕 NEU: Updates nach Typ gruppieren
    groupUpdatesByType(updates) {
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

    // 🆕 NEU: Performance-Monitoring
    startPerformanceMonitoring() {
      setInterval(() => {
        this.optimizeMemoryUsage()
        this.monitorCacheSize()
      }, 30 * 1000) // Alle 30 Sekunden
    },

    // 🆕 NEU: Performance-Statistiken
    getPerformanceStats() {
      return {
        cache_size: this.hierarchicalCache.size,
        memory_usage: this.getMemoryUsage(),
        pending_updates: this.pendingCrossKaiserUpdates.size,
        cache_hit_ratio: this.calculateCacheHitRatio(),
        average_response_time: this.calculateAverageResponseTime(),
      }
    },

    // 🆕 NEU: Cache-Hit-Ratio berechnen
    calculateCacheHitRatio() {
      // Implementierung für Cache-Hit-Ratio
      return 0.85 // Placeholder
    },

    // 🆕 NEU: Durchschnittliche Antwortzeit berechnen
    calculateAverageResponseTime() {
      // Implementierung für durchschnittliche Antwortzeit
      return 150 // Placeholder in ms
    },

    // 🆕 NEU: God-Level Daten-Aggregation
    async aggregateGodData() {
      try {
        const allKaiserData = await Promise.all(
          Array.from(this.hierarchicalState.kaisers.keys()).map((kaiserId) =>
            this.getKaiserData(kaiserId),
          ),
        )

        return {
          god: this.hierarchicalState.god,
          kaisers: allKaiserData,
          total_esps: allKaiserData.reduce((sum, kaiser) => sum + (kaiser.esp_count || 0), 0),
          system_health: this.calculateSystemHealth(allKaiserData),
        }
      } catch (error) {
        console.error('[CentralDataHub] Error aggregating God data:', error)
        return {
          god: this.hierarchicalState.god,
          kaisers: [],
          total_esps: 0,
          system_health: 'unknown',
        }
      }
    },

    // 🆕 NEU: Kaiser-Level Daten-Management
    async getKaiserData(kaiserId) {
      return await this.getCachedData(
        `kaiser_${kaiserId}`,
        async () => {
          const kaiserData = this.hierarchicalState.kaisers.get(kaiserId) || {}
          const espDevices = await this.getEspDevicesForKaiser(kaiserId)

          return {
            id: kaiserId,
            esp_count: espDevices.length,
            status: kaiserData.status || 'unknown',
            esp_devices: espDevices,
            last_heartbeat: kaiserData.last_heartbeat || null,
            health: kaiserData.health || null,
            hierarchy: kaiserData.hierarchy || null,
          }
        },
        30 * 1000,
      ) // 30 Sekunden Cache für Kaiser-Daten
    },

    // 🆕 NEU: ESP-Devices für Kaiser abrufen
    async getEspDevicesForKaiser(kaiserId) {
      try {
        const mqttStore = this.getStore('mqtt')
        if (!mqttStore) return []

        // ESPs filtern, die diesem Kaiser gehören
        const espDevices = Array.from(mqttStore.espDevices?.entries() || [])
          .filter(([espId, device]) => {
            const ownership = this.hierarchicalState.espOwnership.get(espId)
            return ownership === kaiserId || (!ownership && device.kaiserId === kaiserId)
          })
          .map(([espId, device]) => ({
            id: espId,
            status: device.status || 'unknown',
            last_heartbeat: device.lastHeartbeat,
            sensor_count: device.sensors?.size || 0,
            actuator_count: device.actuators?.size || 0,
          }))

        return espDevices
      } catch (error) {
        console.error(`[CentralDataHub] Error getting ESP devices for Kaiser ${kaiserId}:`, error)
        return []
      }
    },

    // 🆕 NEU: System-Health berechnen
    calculateSystemHealth(kaiserData) {
      try {
        const onlineKaisers = kaiserData.filter((kaiser) => kaiser.status === 'online').length
        const totalKaisers = kaiserData.length

        if (totalKaisers === 0) return 'unknown'
        if (onlineKaisers === totalKaisers) return 'excellent'
        if (onlineKaisers >= totalKaisers * 0.8) return 'good'
        if (onlineKaisers >= totalKaisers * 0.5) return 'fair'
        return 'poor'
      } catch (error) {
        console.error('[CentralDataHub] Error calculating system health:', error)
        return 'unknown'
      }
    },

    // 🆕 NEU: Cross-Kaiser Daten-Synchronisation
    async syncCrossKaiserData(sourceKaiser, targetKaiser) {
      try {
        const syncData = await this.getKaiserData(sourceKaiser)
        await this.updateKaiserData(targetKaiser, syncData)

        // BESTEHENDE Fehlerbehandlung nutzen
        this.handleError(null, 'CROSS_KAISER_SYNC')

        console.log(
          `[CentralDataHub] Cross-Kaiser sync completed: ${sourceKaiser} → ${targetKaiser}`,
        )
        return { success: true, synced: true }
      } catch (error) {
        // BESTEHENDE Fehlerbehandlung nutzen
        this.handleError(error, 'CROSS_KAISER_SYNC')
        return { success: false, error: error.message }
      }
    },

    // 🆕 NEU: Kaiser-Daten aktualisieren
    async updateKaiserData(kaiserId, data) {
      try {
        this.hierarchicalState.kaisers.set(kaiserId, { ...data })
        this.invalidateHierarchicalCache(`kaiser_${kaiserId}`)
        return { success: true }
      } catch (error) {
        console.error(`[CentralDataHub] Error updating Kaiser data for ${kaiserId}:`, error)
        return { success: false, error: error.message }
      }
    },

    // 🆕 NEU: Hierarchische Device Management
    hierarchicalDeviceManagement: {
      // ESP-Ownership aktualisieren
      updateEspOwnership(espId, newOwner) {
        console.log(`[CentralDataHub] Updating ESP ownership: ${espId} → ${newOwner}`)

        // Ownership in centralConfig aktualisieren
        if (this.centralConfig) {
          this.centralConfig.espOwnership.set(espId, newOwner)
        }

        // MQTT Store Device-Info aktualisieren
        if (this.mqttStore) {
          const device = this.mqttStore.espDevices.get(espId)
          if (device) {
            device.owner = newOwner
            this.mqttStore.espDevices.set(espId, device)
          }
        }

        // Cache invalidieren
        this.clearCache()
      },

      // ESP-Ownership abrufen
      getEspOwner(espId) {
        if (this.centralConfig) {
          return this.centralConfig.espOwnership.get(espId) || 'god_pi_central'
        }
        return 'god_pi_central'
      },

      // ESP-Transfer durchführen
      async transferEsp(espId, fromOwner, toOwner) {
        console.log(`[CentralDataHub] Transferring ESP: ${espId} from ${fromOwner} to ${toOwner}`)

        try {
          // MQTT Transfer durchführen
          const mqttStore = this.getStore('mqtt')
          if (mqttStore) {
            if (toOwner === 'god_pi_central') {
              await mqttStore.transferEspFromKaiserToGod(espId, fromOwner)
            } else {
              await mqttStore.transferEspFromGodToKaiser(espId, toOwner)
            }
          }

          // Ownership aktualisieren
          this.updateEspOwnership(espId, toOwner)

          return { success: true }
        } catch (error) {
          console.error('Failed to transfer ESP:', error)
          return { success: false, error: error.message }
        }
      },
    },

    // 🆕 NEU: Befehlsketten-Management
    async cancelCommandChain(commandId) {
      try {
        const chain = this.hierarchicalState.commandChains.get(commandId)
        if (!chain) {
          throw new Error('Command chain not found')
        }

        // MQTT-Abbruch-Befehl senden
        const mqttStore = this.getStore('mqtt')
        await mqttStore?.publish('command_chain/cancel', {
          command_id: commandId,
          timestamp: Date.now(),
        })

        // Lokalen Status aktualisieren
        chain.status = 'cancelled'
        chain.completed_at = Date.now()
        this.hierarchicalState.commandChains.set(commandId, chain)

        return { success: true }
      } catch (error) {
        console.error('Failed to cancel command chain:', error)
        return { success: false, error: error.message }
      }
    },

    async retryCommandChain(commandId) {
      try {
        const chain = this.hierarchicalState.commandChains.get(commandId)
        if (!chain) {
          throw new Error('Command chain not found')
        }

        // Neue Befehlskette mit gleichen Parametern erstellen
        const newCommandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const newChain = {
          ...chain,
          command_id: newCommandId,
          status: 'pending',
          created_at: Date.now(),
          completed_at: null,
          responses: [],
        }

        // Neue Befehlskette speichern
        this.hierarchicalState.commandChains.set(newCommandId, newChain)

        // MQTT-Befehl erneut senden
        const mqttStore = this.getStore('mqtt')
        const topic = `kaiser/${chain.metadata.target_kaiser}/cross_kaiser/${chain.metadata.source_kaiser}/command`
        const payload = {
          command: 'transfer_esp',
          command_id: newCommandId,
          esp_id: chain.metadata.esp_id,
          source_kaiser: chain.metadata.source_kaiser,
          target_kaiser: chain.metadata.target_kaiser,
          timestamp: Date.now(),
          retry: true,
        }

        await mqttStore?.publish(topic, payload)

        return { success: true, command_id: newCommandId }
      } catch (error) {
        console.error('Failed to retry command chain:', error)
        return { success: false, error: error.message }
      }
    },

    async deleteCommandChain(commandId) {
      try {
        const chain = this.hierarchicalState.commandChains.get(commandId)
        if (!chain) {
          throw new Error('Command chain not found')
        }

        // Nur abgeschlossene oder fehlgeschlagene Ketten löschen
        if (['active', 'pending'].includes(chain.status)) {
          throw new Error('Cannot delete active or pending command chain')
        }

        this.hierarchicalState.commandChains.delete(commandId)
        return { success: true }
      } catch (error) {
        console.error('Failed to delete command chain:', error)
        return { success: false, error: error.message }
      }
    },

    // 🆕 NEU: Hierarchische Daten-Aggregation für UI
    async getHierarchicalOverview() {
      try {
        const godData = await this.aggregateGodData()
        const commandChains = Array.from(this.hierarchicalState.commandChains.values())

        return {
          god: godData.god,
          kaisers: godData.kaisers,
          total_esps: godData.total_esps,
          system_health: godData.system_health,
          active_chains: commandChains.filter((chain) => chain.status === 'active').length,
          pending_chains: commandChains.filter((chain) => chain.status === 'pending').length,
          completed_chains: commandChains.filter((chain) => chain.status === 'completed').length,
          failed_chains: commandChains.filter((chain) => chain.status === 'failed').length,
        }
      } catch (error) {
        console.error('[CentralDataHub] Error getting hierarchical overview:', error)
        return {
          god: this.hierarchicalState.god,
          kaisers: [],
          total_esps: 0,
          system_health: 'unknown',
          active_chains: 0,
          pending_chains: 0,
          completed_chains: 0,
          failed_chains: 0,
        }
      }
    },

    // 🆕 NEU: Kaiser-spezifische Befehlsketten
    async getKaiserCommandChains(kaiserId) {
      try {
        const allChains = Array.from(this.hierarchicalState.commandChains.values())
        return allChains.filter((chain) => {
          return (
            chain.path.some((node) => node.id === kaiserId) ||
            (chain.metadata &&
              (chain.metadata.source_kaiser === kaiserId ||
                chain.metadata.target_kaiser === kaiserId))
          )
        })
      } catch (error) {
        console.error(
          `[CentralDataHub] Error getting command chains for Kaiser ${kaiserId}:`,
          error,
        )
        return []
      }
    },

    // 🆕 NEU: ESP-Transfer-Status verfolgen
    async trackEspTransfer(espId) {
      try {
        const ownership = this.hierarchicalState.espOwnership.get(espId)
        const mqttStore = this.mqttStore

        if (!mqttStore) return { success: false, error: 'MQTT store not available' }

        const device = mqttStore.espDevices.get(espId)
        if (!device) return { success: false, error: 'ESP device not found' }

        return {
          success: true,
          esp_id: espId,
          current_owner: ownership || device.kaiserId || 'unknown',
          status: device.status || 'unknown',
          last_heartbeat: device.lastHeartbeat,
          transfer_history: this.getTransferHistory(espId),
        }
      } catch (error) {
        console.error(`[CentralDataHub] Error tracking ESP transfer for ${espId}:`, error)
        return { success: false, error: error.message }
      }
    },

    // 🆕 NEU: Transfer-Historie abrufen
    getTransferHistory(espId) {
      return this.hierarchicalState.commandChains.get(espId) || []
    },

    // 🆕 NEU: Drag & Drop Event-System
    startDrag(espId) {
      this.dragDropState.draggedEspId = espId
      this.dragDropState.isDragging = true
      console.log(`[CentralDataHub] Started dragging ESP: ${espId}`)
    },

    stopDrag() {
      this.dragDropState.draggedEspId = null
      this.dragDropState.dragOverZone = null
      this.dragDropState.isDragging = false
      console.log('[CentralDataHub] Stopped dragging')
    },

    setDragOverZone(zoneName) {
      this.dragDropState.dragOverZone = zoneName
    },

    clearDragOverZone() {
      this.dragDropState.dragOverZone = null
    },

    getDraggedEspId() {
      return this.dragDropState.draggedEspId
    },

    isDragging() {
      return this.dragDropState.isDragging
    },

    getDragOverZone() {
      return this.dragDropState.dragOverZone
    },

    // ✅ KORRIGIERT: Echte Kaiser-ESP-Zuordnung über Zone-Mapping (auf oberster Ebene)
    getKaiserEspIds(kaiserId) {
      try {
        const mqttStore = this.getStore('mqtt')
        const centralConfig = this.getStore('centralConfig')
        const espIds = []

        // Durchlaufe alle ESP-Devices
        for (const [espId, device] of mqttStore?.espDevices?.entries() || []) {
          // Prüfe Zone-Zuordnung über centralConfig
          const zone = centralConfig?.getZoneForEsp(espId)
          const zoneKaiser = this.getKaiserForZone(zone)

          // Wenn Zone diesem Kaiser zugeordnet ist oder Device direkt diesem Kaiser gehört
          if (zoneKaiser === kaiserId || device.owner === kaiserId) {
            espIds.push(espId)
          }
        }

        console.log(`[CentralDataHub] Found ${espIds.length} ESPs for Kaiser ${kaiserId}:`, espIds)
        return espIds
      } catch (error) {
        console.error(`[CentralDataHub] Error getting ESPs for Kaiser ${kaiserId}:`, error)
        return []
      }
    },

    // ✅ KORRIGIERT: Echte Kaiser-Zone-Zuordnung (auf oberster Ebene)
    getKaiserForZone(zoneName) {
      try {
        // Verwende bestehende hierarchische Struktur
        const zoneKaiserMapping = this.hierarchicalState.zoneKaiserMapping || new Map()

        // Fallback: Standard-Kaiser für alle Zonen
        if (zoneKaiserMapping.has(zoneName)) {
          return zoneKaiserMapping.get(zoneName)
        }

        // Fallback: God Pi als Standard-Kaiser
        return 'god_pi_central'
      } catch (error) {
        console.error(`[CentralDataHub] Error getting Kaiser for zone ${zoneName}:`, error)
        return 'god_pi_central'
      }
    },

    // ✅ NEU: Alle ESPs des God Pi abrufen (auf oberster Ebene)
    getGodEspIds() {
      try {
        const mqttStore = this.getStore('mqtt')
        const espIds = []

        for (const [espId, device] of mqttStore?.espDevices?.entries() || []) {
          if (device.owner === 'god_pi_central') {
            espIds.push(espId)
          }
        }

        return espIds
      } catch (error) {
        console.error('[CentralDataHub] Error getting God ESP IDs:', error)
        return []
      }
    },

    // ✅ NEU: Kaiser-ESP-Count abrufen (auf oberster Ebene)
    getKaiserEspCount(kaiserId) {
      return this.getKaiserEspIds(kaiserId).length
    },

    // ✅ NEU: God-ESP-Count abrufen (auf oberster Ebene)
    getGodEspCount() {
      return this.getGodEspIds().length
    },

    // ✅ NEU: Event-Listener für Event-basierte Kommunikation
    initializeEventListeners() {
      // ✅ NEU: Kaiser-ID-Änderungen
      eventBus.on(MQTT_EVENTS.KAISER_ID_CHANGED, (data) => {
        this.handleKaiserIdChange(data)
      })

      // ✅ NEU: Zonen-Änderungen
      eventBus.on(MQTT_EVENTS.ZONE_CHANGES, (data) => {
        this.handleZoneChange(data)
      })

      // ✅ NEU: ESP-Kaiser-Transfer
      eventBus.on(MQTT_EVENTS.ESP_KAISER_TRANSFER, (data) => {
        this.handleEspKaiserTransfer(data)
      })

      // ✅ NEU: Store-zu-Store Events für zirkuläre Abhängigkeiten
      eventBus.on(MQTT_EVENTS.MINDMAP_CONFIG_CHANGE, (data) => {
        this.routeMindmapConfigChange(data)
      })

      eventBus.on(MQTT_EVENTS.CHECK_ID_CONFLICTS, (data) => {
        this.routeIdConflictCheck(data)
      })

      eventBus.on(MQTT_EVENTS.VALIDATE_SELECTED_ESP, (data) => {
        this.routeEspValidation(data)
      })

      eventBus.on(MQTT_EVENTS.AUTO_SELECT_ESP, (data) => {
        this.routeAutoSelectEsp(data)
      })

      // Bestehende Event-Listener...
      eventBus.on(MQTT_EVENTS.REQUEST_ESP_DATA, this.handleRequestEspData)
      eventBus.on(MQTT_EVENTS.REQUEST_ALL_ESP_IDS, this.handleRequestAllEspIds)
      eventBus.on(MQTT_EVENTS.REQUEST_CONFIG, this.handleRequestConfig)
      // ❌ ENTFERNT: Redundanter God-Config-Event-Listener - MindMap ist der einzige Master
      eventBus.on(MQTT_EVENTS.KAISER_CONFIG_UPDATE, this.handleKaiserConfigUpdate)
      eventBus.on(MQTT_EVENTS.SENSORS_CONFIGURED, this.handleSensorsConfigured)
      eventBus.on(MQTT_EVENTS.ACTUATORS_CONFIGURED, this.handleActuatorsConfigured)
      eventBus.on(MQTT_EVENTS.ESP_SELECTION, this.handleEspSelection)

      // ✅ NEU: Phase C Events für Cross-Kaiser-Management
      eventBus.on(MQTT_EVENTS.ESP_KAISER_ACCEPT, (data) => this.handleEspKaiserAccept(data))
      eventBus.on(MQTT_EVENTS.CROSS_KAISER_ZONE_CHANGE, (data) =>
        this.handleCrossKaiserZoneChange(data),
      )
      eventBus.on(MQTT_EVENTS.GOD_MODE_ACTIVATED, (data) => this.handleGodModeActivation(data))
      eventBus.on(MQTT_EVENTS.COLLECT_UNCONFIGURED_ESPS, (data) =>
        this.handleCollectUnconfiguredEsps(data),
      )
      eventBus.on(MQTT_EVENTS.ESP_TRANSFER_STARTED, (data) => this.handleEspTransferStarted(data))
      eventBus.on(MQTT_EVENTS.ESP_TRANSFER_COMPLETED, (data) =>
        this.handleEspTransferCompleted(data),
      )
      eventBus.on(MQTT_EVENTS.ESP_TRANSFER_FAILED, (data) => this.handleEspTransferFailed(data))

      // ✅ NEU: Phase D Events für Subzone-Management
      eventBus.on(MQTT_EVENTS.SUBZONE_CREATED, (data) => this.handleSubzoneCreated(data))
      eventBus.on(MQTT_EVENTS.SUBZONE_UPDATED, (data) => this.handleSubzoneUpdated(data))
      eventBus.on(MQTT_EVENTS.SUBZONE_DELETED, (data) => this.handleSubzoneDeleted(data))
      eventBus.on(MQTT_EVENTS.PIN_SUBZONE_ASSIGNED, (data) => this.handlePinSubzoneAssigned(data))
      eventBus.on(MQTT_EVENTS.DEVICE_PIN_ASSIGNED, (data) => this.handleDevicePinAssigned(data))

      // ✅ NEU: Phase D Events für Cross-ESP Logic
      eventBus.on(MQTT_EVENTS.CROSS_ESP_LOGIC_CREATED, (data) =>
        this.handleCrossEspLogicCreated(data),
      )
      eventBus.on(MQTT_EVENTS.CROSS_ESP_LOGIC_TRIGGERED, (data) =>
        this.handleCrossEspLogicTriggered(data),
      )
      eventBus.on(MQTT_EVENTS.CROSS_ESP_LOGIC_EXECUTED, (data) =>
        this.handleCrossEspLogicExecuted(data),
      )
      eventBus.on(MQTT_EVENTS.CROSS_ESP_LOGIC_FAILED, (data) =>
        this.handleCrossEspLogicFailed(data),
      )

      // ✅ NEU: Phase D Events für Cross-Subzone Communication
      eventBus.on(MQTT_EVENTS.CROSS_SUBZONE_SENSOR_UPDATE, (data) =>
        this.handleCrossSubzoneSensorUpdate(data),
      )
      eventBus.on(MQTT_EVENTS.CROSS_SUBZONE_ACTUATOR_COMMAND, (data) =>
        this.handleCrossSubzoneActuatorCommand(data),
      )
      eventBus.on(MQTT_EVENTS.CROSS_SUBZONE_LOGIC_EVALUATION, (data) =>
        this.handleCrossSubzoneLogicEvaluation(data),
      )

      // ✅ NEU: Phase D Events für Hierarchie-Management
      eventBus.on(MQTT_EVENTS.SUBZONE_HIERARCHY_UPDATE, (data) =>
        this.handleSubzoneHierarchyUpdate(data),
      )
      eventBus.on(MQTT_EVENTS.CROSS_ZONE_SUBZONE_MAPPING, (data) =>
        this.handleCrossZoneSubzoneMapping(data),
      )
      eventBus.on(MQTT_EVENTS.SUBZONE_DEPENDENCY_CHANGE, (data) =>
        this.handleSubzoneDependencyChange(data),
      )
    },

    // ✅ NEU: Event-Handler für Kaiser-ID-Änderungen
    handleKaiserIdChange({ oldId, newId, fromMindMap }) {
      console.log(`Kaiser ID changed: ${oldId} → ${newId} (from mindmap: ${fromMindMap})`)

      // Update MQTT Topics
      if (this.mqttStore && this.mqttStore.isConnected) {
        this.mqttStore.updateTopicsForKaiserId(newId)
      }

      // Update hierarchical state
      this.updateHierarchicalState('kaiser_id_changed', { oldId, newId })
    },

    // ✅ NEU: Event-Handler für Zonen-Änderungen
    handleZoneChange({ espId, zoneName, action, kaiserId }) {
      console.log(`Zone ${action}: ESP ${espId} → Zone ${zoneName} (Kaiser: ${kaiserId})`)

      // Update ESP-Zone-Mapping
      this.updateHierarchicalState('zone_changed', { espId, zoneName, action })
    },

    // ✅ NEU: Event-Handler für ESP-Kaiser-Transfer
    handleEspKaiserTransfer({ espId, fromKaiser, toKaiser }) {
      console.log(`ESP transfer: ${espId} from ${fromKaiser} to ${toKaiser}`)

      // Update ESP-Ownership
      this.updateHierarchicalState('esp_transfer', { espId, fromKaiser, toKaiser })
    },

    // ✅ NEU: Router-Methoden für Store-zu-Store Kommunikation
    routeMindmapConfigChange(data) {
      console.log('[CentralDataHub] Routing mindmap config change:', data)

      // ✅ NEU: Kaiser-ID-Änderungen über bestehende unifySystemIdentity() leiten
      if (data.type === 'kaiser_id' && data.newId) {
        console.log('[CentralDataHub] Kaiser ID change detected, using unifySystemIdentity')

        // Bestehende Master-Funktion verwenden
        this.systemIdentity.currentKaiserId = data.newId
        this.unifySystemIdentity()
        return
      }

      // ✅ BESTEHEND: Bestehende Logik beibehalten
      if (this.mqttStore && data.action === 'allowConfigChange') {
        this.mqttStore.allowMindMapConfigChange()
      }
    },

    routeIdConflictCheck(data) {
      console.log('[CentralDataHub] Routing ID conflict check:', data)

      if (this.mqttStore && data.type === 'kaiser') {
        const hasConflicts = this.mqttStore.idConflicts?.kaiser?.size > 0
        // Event für Antwort an CentralConfig
        eventBus.emit(MQTT_EVENTS.ID_CONFLICT_RESOLUTION, {
          type: 'kaiser',
          hasConflicts,
          timestamp: Date.now(),
        })
      }
    },

    routeEspValidation(data) {
      console.log('[CentralDataHub] Routing ESP validation:', data)

      if (this.mqttStore && data.selectedEspId) {
        const isValid = this.mqttStore.espDevices.has(data.selectedEspId)
        // Event für Antwort an CentralConfig
        eventBus.emit(MQTT_EVENTS.ESP_VALIDATION_RESULT, {
          selectedEspId: data.selectedEspId,
          isValid,
          timestamp: Date.now(),
        })
      }
    },

    routeAutoSelectEsp(data) {
      console.log('[CentralDataHub] Routing auto select ESP:', data)

      if (this.mqttStore && this.mqttStore.espDevices.size > 0) {
        const firstEspId = Array.from(this.mqttStore.espDevices.keys())[0]
        // Event für Antwort an CentralConfig
        eventBus.emit(MQTT_EVENTS.AUTO_SELECT_ESP_RESULT, {
          selectedEspId: firstEspId,
          timestamp: Date.now(),
        })
      }
    },

    // ✅ NEU: Phase C Event-Handler für Cross-Kaiser-Management
    handleEspKaiserAccept(data) {
      console.log('[CentralDataHub] ESP Kaiser Accept:', data)

      const { espId, targetKaiserId } = data

      // ESP-Transfer koordinieren
      if (this.mqttStore) {
        this.mqttStore.transferEspBetweenKaisers(espId, null, targetKaiserId)
      }

      // CentralConfig über Transfer informieren
      if (this.centralConfig) {
        this.centralConfig.handleEspTransferCompleted(data)
      }
    },

    handleCrossKaiserZoneChange(data) {
      console.log('[CentralDataHub] Cross-Kaiser Zone Change:', data)

      const { espId, zoneName, kaiserId } = data

      // Zone-Mapping aktualisieren
      this.updateHierarchicalState('cross_kaiser_zone_change', data)

      // MQTT Topics aktualisieren
      if (this.mqttStore) {
        this.mqttStore.updateEspZoneTopics(espId, zoneName, kaiserId)
      }
    },

    handleGodModeActivation(data) {
      console.log('[CentralDataHub] God Mode Activated:', data)

      // Hierarchischen Zustand aktualisieren
      this.updateHierarchicalState('god_mode_activated', data)

      // Alle Stores über God Mode informieren
      if (this.mqttStore) {
        this.mqttStore.setGodMode(true)
      }

      if (this.centralConfig) {
        this.centralConfig.setGodMode(true)
      }
    },

    handleCollectUnconfiguredEsps(data) {
      console.log('[CentralDataHub] Collect Unconfigured ESPs:', data)

      const { targetKaiserId } = data

      // Alle unkonfigurierten ESPs finden und transferieren
      if (this.mqttStore) {
        const unconfiguredEsps = this.mqttStore.getUnconfiguredEsps()
        unconfiguredEsps.forEach((espId) => {
          this.mqttStore.transferEspBetweenKaisers(espId, null, targetKaiserId)
        })
      }
    },

    handleEspTransferStarted(data) {
      console.log('[CentralDataHub] ESP Transfer Started:', data)

      // Transfer-Status setzen
      this.updateHierarchicalState('esp_transfer_started', data)

      // UI-Feedback
      if (this.dragDropState) {
        this.dragDropState.isDragging = true
      }
    },

    handleEspTransferCompleted(data) {
      console.log('[CentralDataHub] ESP Transfer Completed:', data)

      // Transfer-Status aktualisieren
      this.updateHierarchicalState('esp_transfer_completed', data)

      // UI-Feedback zurücksetzen
      if (this.dragDropState) {
        this.dragDropState.isDragging = false
        this.dragDropState.draggedEspId = null
      }

      // Cache invalidieren
      this.invalidateHierarchicalCache('esp_ownership')
    },

    handleEspTransferFailed(data) {
      console.log('[CentralDataHub] ESP Transfer Failed:', data)

      // Transfer-Status zurücksetzen
      this.updateHierarchicalState('esp_transfer_failed', data)

      // UI-Feedback zurücksetzen
      if (this.dragDropState) {
        this.dragDropState.isDragging = false
        this.dragDropState.draggedEspId = null
      }

      // Fehlerbehandlung
      this.handleError(new Error(`ESP Transfer failed: ${data.reason}`), 'esp_transfer')
    },

    // ✅ NEU: Phase D Event-Handler für Subzone-Management
    handleSubzoneCreated(data) {
      console.log('[CentralDataHub] Subzone Created:', data)

      const { espId, subzone } = data

      // Subzone-Erstellung koordinieren
      this.updateHierarchicalState('subzone_created', data)

      // Cross-Subzone-Index aktualisieren
      if (this.espManagement) {
        this.espManagement.updateCrossSubzoneIndex(subzone, espId)
      }

      // Cache invalidieren
      this.invalidateHierarchicalCache('subzone_hierarchy')
    },

    handleSubzoneUpdated(data) {
      console.log('[CentralDataHub] Subzone Updated:', data)

      // Subzone-Update koordinieren
      this.updateHierarchicalState('subzone_updated', data)

      // Cache invalidieren
      this.invalidateHierarchicalCache('subzone_hierarchy')
    },

    handleSubzoneDeleted(data) {
      console.log('[CentralDataHub] Subzone Deleted:', data)

      const { subzoneId } = data

      // Subzone-Löschung koordinieren
      this.updateHierarchicalState('subzone_deleted', data)

      // Cross-Subzone-Index aktualisieren
      if (this.espManagement) {
        this.espManagement.removeSubzoneFromAllZones(subzoneId)
      }

      // Cache invalidieren
      this.invalidateHierarchicalCache('subzone_hierarchy')
    },

    handlePinSubzoneAssigned(data) {
      console.log('[CentralDataHub] Pin Subzone Assigned:', data)

      const { espId, subzoneId } = data

      // Pin-Subzone-Zuordnung koordinieren
      this.updateHierarchicalState('pin_subzone_assigned', data)

      // Cross-Subzone-Index aktualisieren
      if (this.espManagement) {
        this.espManagement.updateCrossSubzoneIndex({ id: subzoneId }, espId)
      }

      // Cache invalidieren
      this.invalidateHierarchicalCache('pin_mapping')
    },

    handleDevicePinAssigned(data) {
      console.log('[CentralDataHub] Device Pin Assigned:', data)

      // Device-Pin-Zuordnung koordinieren
      this.updateHierarchicalState('device_pin_assigned', data)

      // Cache invalidieren
      this.invalidateHierarchicalCache('device_mapping')
    },

    // ✅ NEU: Phase D Event-Handler für Cross-ESP Logic
    handleCrossEspLogicCreated(data) {
      console.log('[CentralDataHub] Cross-ESP Logic Created:', data)

      const { logicId, logic } = data

      // Cross-ESP Logic-Erstellung koordinieren
      this.updateHierarchicalState('cross_esp_logic_created', data)

      // Betroffene ESPs benachrichtigen
      if (logic.crossEspMetadata?.involvedEsps) {
        logic.crossEspMetadata.involvedEsps.forEach((espId) => {
          this.updateHierarchicalState('esp_logic_updated', { espId, logicId })
        })
      }

      // Cache invalidieren
      this.invalidateHierarchicalCache('cross_esp_logic')
    },

    handleCrossEspLogicTriggered(data) {
      console.log('[CentralDataHub] Cross-ESP Logic Triggered:', data)

      // Cross-ESP Logic-Trigger koordinieren
      this.updateHierarchicalState('cross_esp_logic_triggered', data)

      // Performance-Monitoring
      this.updatePerformanceStats('cross_esp_logic_trigger', data)
    },

    handleCrossEspLogicExecuted(data) {
      console.log('[CentralDataHub] Cross-ESP Logic Executed:', data)

      const { logicId, triggerResults, conditionResults } = data

      // Cross-ESP Logic-Ausführung koordinieren
      this.updateHierarchicalState('cross_esp_logic_executed', data)

      // Performance-Monitoring
      this.updatePerformanceStats('cross_esp_logic_execute', {
        logicId,
        triggerCount: triggerResults.length,
        conditionCount: conditionResults.length,
      })

      // Cache invalidieren
      this.invalidateHierarchicalCache('cross_esp_logic')
    },

    handleCrossEspLogicFailed(data) {
      console.log('[CentralDataHub] Cross-ESP Logic Failed:', data)

      const { logicId, error } = data

      // Cross-ESP Logic-Fehler koordinieren
      this.updateHierarchicalState('cross_esp_logic_failed', data)

      // Fehlerbehandlung
      this.handleError(new Error(`Cross-ESP Logic failed: ${error}`), 'cross_esp_logic')

      // Performance-Monitoring
      this.updatePerformanceStats('cross_esp_logic_fail', { logicId, error })
    },

    // ✅ NEU: Phase D Event-Handler für Cross-Subzone Communication
    handleCrossSubzoneSensorUpdate(data) {
      console.log('[CentralDataHub] Cross-Subzone Sensor Update:', data)

      // Cross-Subzone Sensor-Update koordinieren
      this.updateHierarchicalState('cross_subzone_sensor_update', data)

      // Cache invalidieren
      this.invalidateHierarchicalCache('sensor_data')
    },

    handleCrossSubzoneActuatorCommand(data) {
      console.log('[CentralDataHub] Cross-Subzone Actuator Command:', data)

      // Cross-Subzone Aktuator-Befehl koordinieren
      this.updateHierarchicalState('cross_subzone_actuator_command', data)

      // Cache invalidieren
      this.invalidateHierarchicalCache('actuator_state')
    },

    handleCrossSubzoneLogicEvaluation(data) {
      console.log('[CentralDataHub] Cross-Subzone Logic Evaluation:', data)

      // Cross-Subzone Logic-Evaluation koordinieren
      this.updateHierarchicalState('cross_subzone_logic_evaluation', data)

      // Performance-Monitoring
      this.updatePerformanceStats('cross_subzone_logic_eval', data)
    },

    // ✅ NEU: Phase D Event-Handler für Hierarchie-Management
    handleSubzoneHierarchyUpdate(data) {
      console.log('[CentralDataHub] Subzone Hierarchy Update:', data)

      const { subzoneId, zoneName, espId, kaiserId } = data

      // Subzone-Hierarchie-Update koordinieren
      this.updateHierarchicalState('subzone_hierarchy_update', data)

      // CentralConfig über Update informieren
      if (this.centralConfig) {
        this.centralConfig.setSubzoneForEsp(espId, subzoneId, zoneName, kaiserId)
      }

      // Cache invalidieren
      this.invalidateHierarchicalCache('subzone_hierarchy')
    },

    handleCrossZoneSubzoneMapping(data) {
      console.log('[CentralDataHub] Cross-Zone Subzone Mapping:', data)

      // Cross-Zone Subzone-Mapping koordinieren
      this.updateHierarchicalState('cross_zone_subzone_mapping', data)

      // Cache invalidieren
      this.invalidateHierarchicalCache('cross_zone_mapping')
    },

    handleSubzoneDependencyChange(data) {
      console.log('[CentralDataHub] Subzone Dependency Change:', data)

      // Subzone-Abhängigkeits-Änderung koordinieren
      this.updateHierarchicalState('subzone_dependency_change', data)

      // Cache invalidieren
      this.invalidateHierarchicalCache('subzone_dependencies')
    },

    // ✅ NEU: Hilfsmethoden für Phase D
    updatePerformanceStats(metric, data) {
      // Performance-Statistiken aktualisieren
      if (!this.performanceStats) {
        this.performanceStats = {}
      }

      if (!this.performanceStats[metric]) {
        this.performanceStats[metric] = {
          count: 0,
          totalTime: 0,
          lastUpdate: Date.now(),
        }
      }

      this.performanceStats[metric].count++
      this.performanceStats[metric].lastUpdate = Date.now()

      if (data.executionTime) {
        this.performanceStats[metric].totalTime += data.executionTime
      }
    },

    // ✅ NEU: Cache-Management-Methoden mit Cross-Level-Synchronisation
    storeInCache(key, data, level = 'auto') {
      const now = Date.now()

      // 🔒 Cross-Level-Invalidation vor dem Speichern
      this.invalidateCache(key)

      // Automatische Level-Bestimmung basierend auf Daten-Typ
      if (level === 'auto') {
        level = this.determineCacheLevel(key, data)
      }

      switch (level) {
        case 'hot':
          this.storeInHotCache(key, data)
          break
        case 'l1':
          this.storeInL1Cache(key, data, now)
          break
        case 'l2':
          this.storeInL2Cache(key, data, now)
          break
        default:
          this.storeInL2Cache(key, data, now) // Fallback
      }

      // 🔒 Cross-Level-Synchronisation
      this.syncCacheLevels(key, level)
    },

    // 🔒 NEU: Cross-Level-Cache-Invalidation
    invalidateCache(key) {
      let invalidated = 0

      // Hot Cache invalidieren
      if (this.cacheConfig.hotCache.data.has(key)) {
        this.cacheConfig.hotCache.data.delete(key)
        this.cacheConfig.hotCache.accessCount.delete(key)
        this.cacheConfig.hotCache.lastAccess.delete(key) // 🔒 NEU: Cleanup lastAccess
        invalidated++
      }

      // L1 Cache invalidieren
      if (this.cacheConfig.l1Cache.data.has(key)) {
        this.cacheConfig.l1Cache.data.delete(key)
        this.cacheConfig.l1Cache.accessCount.delete(key)
        this.cacheConfig.l1Cache.lastAccess.delete(key) // 🔒 NEU: Cleanup lastAccess
        invalidated++
      }

      // L2 Cache invalidieren
      if (this.cacheConfig.l2Cache.data.has(key)) {
        this.cacheConfig.l2Cache.data.delete(key)
        this.cacheConfig.l2Cache.accessCount.delete(key)
        this.cacheConfig.l2Cache.lastAccess.delete(key) // 🔒 NEU: Cleanup lastAccess
        invalidated++
      }

      if (invalidated > 0) {
        this.cacheConfig.cacheStats.crossLevelInvalidations++
        console.log(`🔒 Cache invalidiert: ${key} (${invalidated} levels)`)
      }
    },

    // 🔒 NEU: Cross-Level-Synchronisation
    syncCacheLevels(key, targetLevel) {
      // Prüfen ob Daten in anderen Levels existieren
      const levels = ['hot', 'l1', 'l2']
      const existingLevels = levels.filter((level) => {
        if (level === 'hot') return this.cacheConfig.hotCache.data.has(key)
        if (level === 'l1') return this.cacheConfig.l1Cache.data.has(key)
        if (level === 'l2') return this.cacheConfig.l2Cache.data.has(key)
        return false
      })

      if (existingLevels.length > 1) {
        this.cacheConfig.cacheStats.cacheInconsistencies++
        console.warn(
          `⚠️ Cache-Inkonsistenz erkannt: ${key} in ${existingLevels.join(', ')} (target: ${targetLevel})`,
        )
      }
    },

    // ✅ NEU: Cache-Level-Bestimmung
    determineCacheLevel(key) {
      // Hot Cache: Sehr häufig genutzte Daten
      const hotKeys = ['selectedEspId', 'currentKaiserId', 'systemStatus', 'connectionStatus']
      if (hotKeys.includes(key)) {
        return 'hot'
      }

      // L1 Cache: Häufig genutzte Daten (basierend auf Access-Pattern)
      const l1Keys = ['deviceStatus', 'sensorData', 'actuatorState', 'zoneData']
      if (l1Keys.some((l1Key) => key.includes(l1Key))) {
        return 'l1'
      }

      // L2 Cache: Selten genutzte Daten (Standard)
      return 'l2'
    },

    // 🔒 NEU: Access-Count-Reset für Memory-Leak-Prevention
    resetAccessCounts() {
      const now = Date.now()
      const resetThreshold = 5 * 60 * 1000 // 5 Minuten

      // Hot Cache Access-Counts zurücksetzen
      for (const [key, lastAccess] of this.cacheConfig.hotCache.lastAccess.entries()) {
        if (now - lastAccess > resetThreshold) {
          this.cacheConfig.hotCache.accessCount.set(key, 0)
          this.cacheConfig.cacheStats.accessCountResets++
        }
      }

      // L1 Cache Access-Counts zurücksetzen
      for (const [key, lastAccess] of this.cacheConfig.l1Cache.lastAccess.entries()) {
        if (now - lastAccess > resetThreshold) {
          this.cacheConfig.l1Cache.accessCount.set(key, 0)
          this.cacheConfig.cacheStats.accessCountResets++
        }
      }

      // L2 Cache Access-Counts zurücksetzen
      for (const [key, lastAccess] of this.cacheConfig.l2Cache.lastAccess.entries()) {
        if (now - lastAccess > resetThreshold) {
          this.cacheConfig.l2Cache.accessCount.set(key, 0)
          this.cacheConfig.cacheStats.accessCountResets++
        }
      }

      console.log(
        `🔄 Access-Counts zurückgesetzt: ${this.cacheConfig.cacheStats.accessCountResets} mal`,
      )
    },

    // ✅ NEU: Hot Cache speichern
    storeInHotCache(key, data) {
      const hotCache = this.cacheConfig.hotCache

      // Cache-Größe prüfen
      if (hotCache.data.size >= hotCache.maxSize) {
        this.evictFromHotCache()
      }

      hotCache.data.set(key, data)
      hotCache.accessCount.set(key, 1)
      hotCache.lastAccess.set(key, Date.now()) // 🔒 NEU: Track access time
    },

    // ✅ NEU: L1 Cache speichern
    storeInL1Cache(key, data, timestamp) {
      const l1Cache = this.cacheConfig.l1Cache

      // Cache-Größe prüfen
      if (l1Cache.data.size >= l1Cache.maxSize) {
        this.evictFromL1Cache()
      }

      l1Cache.data.set(key, { data, timestamp })
      l1Cache.accessCount.set(key, 1)
      l1Cache.lastAccess.set(key, Date.now()) // 🔒 NEU: Track access time
    },

    // ✅ NEU: L2 Cache speichern
    storeInL2Cache(key, data, timestamp) {
      const l2Cache = this.cacheConfig.l2Cache

      // Cache-Größe prüfen
      if (l2Cache.data.size >= l2Cache.maxSize) {
        this.evictFromL2Cache()
      }

      l2Cache.data.set(key, { data, timestamp })
      l2Cache.accessCount.set(key, 1)
      l2Cache.lastAccess.set(key, Date.now()) // 🔒 NEU: Track access time
    },

    // ✅ NEU: Cache-Eviction (LRU-Prinzip)
    evictFromHotCache() {
      const hotCache = this.cacheConfig.hotCache
      let leastUsedKey = null
      let minAccessCount = Infinity

      for (const [key, accessCount] of hotCache.accessCount) {
        if (accessCount < minAccessCount) {
          minAccessCount = accessCount
          leastUsedKey = key
        }
      }

      if (leastUsedKey) {
        hotCache.data.delete(leastUsedKey)
        hotCache.accessCount.delete(leastUsedKey)
        hotCache.lastAccess.delete(leastUsedKey) // 🔒 NEU: Cleanup lastAccess
      }
    },

    evictFromL1Cache() {
      const l1Cache = this.cacheConfig.l1Cache
      let leastUsedKey = null
      let minAccessCount = Infinity

      for (const [key, accessCount] of l1Cache.accessCount) {
        if (accessCount < minAccessCount) {
          minAccessCount = accessCount
          leastUsedKey = key
        }
      }

      if (leastUsedKey) {
        l1Cache.data.delete(leastUsedKey)
        l1Cache.accessCount.delete(leastUsedKey)
        l1Cache.lastAccess.delete(leastUsedKey) // 🔒 NEU: Cleanup lastAccess
      }
    },

    evictFromL2Cache() {
      const l2Cache = this.cacheConfig.l2Cache
      let leastUsedKey = null
      let minAccessCount = Infinity

      for (const [key, accessCount] of l2Cache.accessCount) {
        if (accessCount < minAccessCount) {
          minAccessCount = accessCount
          leastUsedKey = key
        }
      }

      if (leastUsedKey) {
        l2Cache.data.delete(leastUsedKey)
        l2Cache.accessCount.delete(leastUsedKey)
        l2Cache.lastAccess.delete(leastUsedKey) // 🔒 NEU: Cleanup lastAccess
      }
    },

    // ✅ NEU: Cache-Statistiken aktualisieren
    updateCacheStats(hit, responseTime) {
      const stats = this.cacheConfig.cacheStats

      if (hit) {
        stats.hits++
      } else {
        stats.misses++
      }

      // Hit-Rate berechnen
      const total = stats.hits + stats.misses
      stats.hitRate = total > 0 ? stats.hits / total : 0

      // Durchschnittliche Antwortzeit
      if (responseTime > 0) {
        const currentAvg = stats.averageResponseTime
        const totalRequests = stats.hits + stats.misses
        stats.averageResponseTime =
          (currentAvg * (totalRequests - 1) + responseTime) / totalRequests
      }

      // Performance-Warnungen
      if (responseTime > this.cacheConfig.performanceThresholds.slowCacheThreshold) {
        console.warn(`🐌 Langsame Cache-Abfrage: ${responseTime.toFixed(2)}ms`)
      }

      if (stats.hitRate < 0.5) {
        console.warn(`⚠️ Niedrige Cache-Hit-Rate: ${(stats.hitRate * 100).toFixed(1)}%`)
      }
    },

    // ✅ NEU: Cache-Performance-Monitoring
    startCacheMonitoring() {
      // Cache-Cleanup alle 60 Sekunden (statt 30s) - NON-CRITICAL
      setInterval(() => {
        this.cleanupExpiredCache()
      }, 60 * 1000) // 60 Sekunden statt 30

      // Cache-Statistiken alle 60 Sekunden loggen (statt 30s) - NON-CRITICAL
      setInterval(() => {
        this.logCacheStats()
      }, 60000) // 60 Sekunden statt 30

      // Cache-Optimierung alle 120 Sekunden (statt 60s) - NON-CRITICAL
      setInterval(() => {
        this.optimizeCachePerformance()
      }, 120 * 1000) // 120 Sekunden statt 60
    },

    // ✅ OPTIMIERT: Abgelaufene Cache-Einträge mit Lazy-Cleanup für CPU-Performance
    cleanupExpiredCache() {
      const now = Date.now()

      // ⚡ OPTIMIERT: Lazy-Cleanup-Strategie für CPU-Performance
      // Statt sofortige Bereinigung → Lazy-Bereinigung bei nächstem Zugriff
      this.scheduleLazyCacheCleanup(now)
    },

    // ✅ NEU: Cache-Statistiken loggen
    logCacheStats() {
      const stats = this.cacheConfig.cacheStats
      const l1Size = this.cacheConfig.l1Cache.data.size
      const l2Size = this.cacheConfig.l2Cache.data.size
      const hotSize = this.cacheConfig.hotCache.data.size

      console.log(`📊 Cache-Performance-Report:`)
      console.log(`  - Hit-Rate: ${(stats.hitRate * 100).toFixed(1)}%`)
      console.log(`  - Durchschnitts-Antwortzeit: ${stats.averageResponseTime.toFixed(2)}ms`)
      console.log(`  - L1 Cache: ${l1Size}/${this.cacheConfig.l1Cache.maxSize}`)
      console.log(`  - L2 Cache: ${l2Size}/${this.cacheConfig.l2Cache.maxSize}`)
      console.log(`  - Hot Cache: ${hotSize}/${this.cacheConfig.hotCache.maxSize}`)
      console.log(`  - Gesamt-Hits: ${stats.hits}, Misses: ${stats.misses}`)
    },

    // ✅ NEU: Cache-Performance optimieren
    optimizeCachePerformance() {
      const stats = this.cacheConfig.cacheStats

      // Cache-Größen dynamisch anpassen
      if (stats.hitRate > 0.8) {
        // Hohe Hit-Rate: Cache vergrößern
        this.cacheConfig.l1Cache.maxSize = Math.min(200, this.cacheConfig.l1Cache.maxSize + 20)
        this.cacheConfig.l2Cache.maxSize = Math.min(2000, this.cacheConfig.l2Cache.maxSize + 100)
        console.log(
          `📈 Cache vergrößert: L1=${this.cacheConfig.l1Cache.maxSize}, L2=${this.cacheConfig.l2Cache.maxSize}`,
        )
      } else if (stats.hitRate < 0.3) {
        // Niedrige Hit-Rate: Cache verkleinern
        this.cacheConfig.l1Cache.maxSize = Math.max(50, this.cacheConfig.l1Cache.maxSize - 10)
        this.cacheConfig.l2Cache.maxSize = Math.max(500, this.cacheConfig.l2Cache.maxSize - 50)
        console.log(
          `📉 Cache verkleinert: L1=${this.cacheConfig.l1Cache.maxSize}, L2=${this.cacheConfig.l2Cache.maxSize}`,
        )
      }

      // TTL dynamisch anpassen
      if (stats.averageResponseTime > 100) {
        // Langsame Antwortzeiten: TTL verlängern
        this.cacheConfig.l1Cache.ttl = Math.min(60000, this.cacheConfig.l1Cache.ttl + 5000)
        this.cacheConfig.l2Cache.ttl = Math.min(600000, this.cacheConfig.l2Cache.ttl + 30000)
      } else if (stats.averageResponseTime < 20) {
        // Schnelle Antwortzeiten: TTL verkürzen
        this.cacheConfig.l1Cache.ttl = Math.max(15000, this.cacheConfig.l1Cache.ttl - 2000)
        this.cacheConfig.l2Cache.ttl = Math.max(180000, this.cacheConfig.l2Cache.ttl - 15000)
      }

      this.cacheConfig.cacheStats.lastOptimization = Date.now()
    },

    // ✅ NEU: Cache-Status abrufen
    getCacheStatus() {
      return {
        l1Cache: {
          size: this.cacheConfig.l1Cache.data.size,
          maxSize: this.cacheConfig.l1Cache.maxSize,
          ttl: this.cacheConfig.l1Cache.ttl,
          lastCleanup: this.cacheConfig.l1Cache.lastCleanup,
        },
        l2Cache: {
          size: this.cacheConfig.l2Cache.data.size,
          maxSize: this.cacheConfig.l2Cache.maxSize,
          ttl: this.cacheConfig.l2Cache.ttl,
          lastCleanup: this.cacheConfig.l2Cache.lastCleanup,
        },
        hotCache: {
          size: this.cacheConfig.hotCache.data.size,
          maxSize: this.cacheConfig.hotCache.maxSize,
          lastCleanup: this.cacheConfig.hotCache.lastCleanup,
        },
        stats: { ...this.cacheConfig.cacheStats },
      }
    },

    // ✅ NEU: Cache konfigurieren
    configureCache(config) {
      if (config.l1Cache) {
        Object.assign(this.cacheConfig.l1Cache, config.l1Cache)
      }
      if (config.l2Cache) {
        Object.assign(this.cacheConfig.l2Cache, config.l2Cache)
      }
      if (config.hotCache) {
        Object.assign(this.cacheConfig.hotCache, config.hotCache)
      }
      if (config.performanceThresholds) {
        Object.assign(this.cacheConfig.performanceThresholds, config.performanceThresholds)
      }

      console.log(`⚙️ Cache konfiguriert:`, {
        l1Size: this.cacheConfig.l1Cache.maxSize,
        l2Size: this.cacheConfig.l2Cache.maxSize,
        hotSize: this.cacheConfig.hotCache.maxSize,
        l1Ttl: this.cacheConfig.l1Cache.ttl,
        l2Ttl: this.cacheConfig.l2Cache.ttl,
      })
    },

    // ✅ NEU: Lazy-Cache-Cleanup für CPU-Optimierung (NON-CRITICAL)
    scheduleLazyCacheCleanup(now) {
      // Initialisiere Lazy-Cleanup-Queue falls nicht vorhanden
      if (!this.lazyCacheCleanupQueue) {
        this.lazyCacheCleanupQueue = new Map()
        this.lazyCacheCleanupTimer = null
      }

      // Sammle abgelaufene Einträge für Lazy-Cleanup
      let expiredCount = 0

      // L1 Cache - Lazy-Cleanup
      for (const [key, entry] of this.cacheConfig.l1Cache.data) {
        if (now - entry.timestamp > this.cacheConfig.l1Cache.ttl) {
          this.lazyCacheCleanupQueue.set(`l1-${key}`, { level: 'l1', key, entry })
          expiredCount++
        }
      }

      // L2 Cache - Lazy-Cleanup
      for (const [key, entry] of this.cacheConfig.l2Cache.data) {
        if (now - entry.timestamp > this.cacheConfig.l2Cache.ttl) {
          this.lazyCacheCleanupQueue.set(`l2-${key}`, { level: 'l2', key, entry })
          expiredCount++
        }
      }

      // Starte Lazy-Cleanup-Timer (200ms Delay für CPU-Optimierung)
      if (expiredCount > 0 && !this.lazyCacheCleanupTimer) {
        this.lazyCacheCleanupTimer = setTimeout(() => {
          this.executeLazyCacheCleanup()
        }, 200) // 200ms Lazy-Cleanup-Delay für CPU-Optimierung
      }

      // Cleanup-Zeitstempel aktualisieren
      this.cacheConfig.l1Cache.lastCleanup = now
      this.cacheConfig.l2Cache.lastCleanup = now
    },

    // ✅ NEU: Lazy-Cache-Cleanup-Execution für CPU-Optimierung (NON-CRITICAL)
    executeLazyCacheCleanup() {
      if (!this.lazyCacheCleanupQueue || this.lazyCacheCleanupQueue.size === 0) {
        return
      }

      let cleanedCount = 0

      // Batch-Cleanup aller abgelaufenen Einträge
      for (const [, cleanupInfo] of this.lazyCacheCleanupQueue) {
        const { level, key } = cleanupInfo

        if (level === 'l1') {
          this.cacheConfig.l1Cache.data.delete(key)
          this.cacheConfig.l1Cache.accessCount.delete(key)
          cleanedCount++
        } else if (level === 'l2') {
          this.cacheConfig.l2Cache.data.delete(key)
          this.cacheConfig.l2Cache.accessCount.delete(key)
          cleanedCount++
        }
      }

      // Cleanup-Queue leeren
      this.lazyCacheCleanupQueue.clear()
      this.lazyCacheCleanupTimer = null

      console.log(
        `[Cache] Lazy-cleanup completed: ${cleanedCount} expired entries removed for CPU optimization`,
      )
    },

    // ✅ HINZUFÜGEN - Event-basierte Store-Kommunikation
    emitStoreEvent(eventType, data) {
      eventBus.emit(`store:${eventType}`, data)
    },

    registerStoreEventHandler(eventType, handler) {
      eventBus.on(`store:${eventType}`, handler)
    },

    // ✅ HINZUFÜGEN - Zirkuläre Abhängigkeiten auflösen
    initializeEventBasedCommunication() {
      // MQTT Store Events
      this.registerStoreEventHandler('mqtt:connected', (data) => {
        // ✅ BESTEHENDE UPDATE-LOGIK VERWENDEN
        this.updateConnectionStatus?.(data)
      })

      // Actuator Logic Events
      this.registerStoreEventHandler('actuator:status', (data) => {
        // ✅ BESTEHENDE UPDATE-LOGIK VERWENDEN
        this.updateActuatorStatus?.(data)
      })

      // ESP Management Events
      this.registerStoreEventHandler('esp:config', (data) => {
        // ✅ BESTEHENDE UPDATE-LOGIK VERWENDEN
        this.updateEspConfiguration?.(data)
      })
    },
  },

  // ✅ NEU: Store-Initialisierung mit Event-Listenern
  setup() {
    // Event-Listener beim Store-Setup registrieren
    this.initializeEventListeners()

    // ✅ NEU: Cache-Monitoring starten
    this.startCacheMonitoring()

    // ✅ NEU: Store im Event-System registrieren
    storeHandler.registerStore('centralDataHub', this)

    // ❌ ENTFERNT: Zirkuläre Event-Emission
    // eventBus.emit(STORE_EVENTS.STORE_READY, {
    //   storeName: 'centralDataHub',
    //   timestamp: Date.now(),
    // })

    return {}
  },
})
