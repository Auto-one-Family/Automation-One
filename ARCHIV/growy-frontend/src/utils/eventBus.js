import { errorHandler } from './errorHandler'

// 🆕 NEU: MQTT-spezifische Event-Typen für Store-to-Store Communication
const MQTT_EVENTS = {
  SENSOR_DATA: 'mqtt:sensor_data',
  ACTUATOR_STATUS: 'mqtt:actuator_status',
  ESP_CONFIG: 'mqtt:esp_config',
  ESP_DISCOVERY: 'mqtt:esp_discovery',
  SYSTEM_COMMAND: 'mqtt:system_command',
  GOD_MESSAGE: 'mqtt:god_message',
  HEARTBEAT: 'mqtt:heartbeat',
  STATUS_UPDATE: 'mqtt:status_update',
  ZONE_CHANGES: 'mqtt:zone_changes',
  SUBZONE_MESSAGE: 'mqtt:subzone_message',

  // ✅ NEU: Erweiterte Events für Store-Kommunikation
  ACTUATOR_LOGIC_STATUS: 'mqtt:actuator_logic_status',
  ACTUATOR_LOGIC_COMMAND: 'mqtt:actuator_logic_command',
  CENTRAL_CONFIG_UPDATE: 'mqtt:central_config_update',
  CENTRAL_DATA_HUB_UPDATE: 'mqtt:central_data_hub_update',
  KAISER_STATUS_UPDATE: 'mqtt:kaiser_status_update',
  KAISER_HEALTH_UPDATE: 'mqtt:kaiser_health_update',
  HIERARCHY_UPDATE: 'mqtt:hierarchy_update',
  ESP_TRANSFER: 'mqtt:esp_transfer',
  ESP_OWNERSHIP_UPDATE: 'mqtt:esp_ownership_update',

  // ✅ NEU: Zusätzliche Events für CentralConfig-Migration
  ZONE_VALIDATION: 'mqtt:zone_validation',
  MINDMAP_CONFIG_CHANGE: 'mqtt:mindmap_config_change',
  CONNECTION_TEST: 'mqtt:connection_test',
  AUTO_SELECT_ESP: 'mqtt:auto_select_esp',
  ACTUATOR_LOGIC_UPDATE: 'mqtt:actuator_logic_update',

  // 🆕 NEU: Events für CentralConfig-Migration (4 verbleibende Funktionen)
  CHECK_ID_CONFLICTS: 'mqtt:check_id_conflicts',
  VALIDATE_SELECTED_ESP: 'mqtt:validate_selected_esp',

  // 🆕 NEU: Events für ActuatorLogic-Migration (7 Funktionen)
  ACTUATOR_COMMAND: 'mqtt:actuator_command',
  ACTUATOR_OVERRIDE: 'mqtt:actuator_override',
  ACTUATOR_CLEAR_OVERRIDE: 'mqtt:actuator_clear_override',
  ACTUATOR_LOGIC_CONFIG: 'mqtt:actuator_logic_config',
  CROSS_KAISER_SENSOR_DATA: 'mqtt:cross_kaiser_sensor_data',

  // 🆕 NEU: Events für CentralDataHub-Migration (20 Funktionen)
  SYSTEM_STATUS_UPDATE: 'mqtt:system_status_update',
  DEVICE_DATA_REQUEST: 'mqtt:device_data_request',
  SERVER_CONFIG_UPDATE: 'mqtt:server_config_update',
  CROSS_KAISER_BATCH_UPDATE: 'mqtt:cross_kaiser_batch_update',
  ID_CONFLICT_RESOLUTION: 'mqtt:id_conflict_resolution',
  KAISER_REGISTRATION: 'mqtt:kaiser_registration',
  ESP_TRANSFER_COMMAND: 'mqtt:esp_transfer_command',
  CROSS_KAISER_COMMAND: 'mqtt:cross_kaiser_command',
  DEVICE_UPDATE: 'mqtt:device_update',
  PERFORMANCE_UPDATE: 'mqtt:performance_update',

  // ✅ NEU: Events für die letzten 5 CentralDataHub-Funktionen
  ESP_LIST_REQUEST: 'mqtt:esp_list_request',
  DEVICE_STATUS_REQUEST: 'mqtt:device_status_request',
  SENSOR_VALUE_REQUEST: 'mqtt:sensor_value_request',
  ACTUATOR_STATE_REQUEST: 'mqtt:actuator_state_request',
  SYSTEM_MESSAGE_PROCESS: 'mqtt:system_message_process',

  // 🆕 NEU: Pi Integration Events (9 fehlende Events)
  PI_STATUS_REQUEST: 'mqtt:pi_status_request',
  PI_URL_SET: 'mqtt:pi_url_set',
  PI_HEALTH_CHECK: 'mqtt:pi_health_check',
  PI_INSTALL_LIBRARY: 'mqtt:pi_install_library',
  PI_CONFIGURE_SENSOR: 'mqtt:pi_configure_sensor',
  PI_REMOVE_SENSOR: 'mqtt:pi_remove_sensor',
  PI_I2C_CONFIGURATION: 'mqtt:pi_i2c_configuration',
  PI_SENSOR_STATISTICS: 'mqtt:pi_sensor_statistics',
  PI_CONFIGURE_ACTUATOR: 'mqtt:pi_configure_actuator',

  // 🆕 NEU: Dashboard Generator Events (3 fehlende Events)
  REQUEST_ESP_DEVICES: 'mqtt:request_esp_devices',
  REQUEST_ESP_SENSORS: 'mqtt:request_esp_sensors',
  REQUEST_ESP_SUBZONES: 'mqtt:request_esp_subzones',

  // 🆕 NEU: CentralConfig Events (8 fehlende Events)
  REQUEST_ESP_DATA: 'mqtt:request_esp_data',
  REQUEST_ALL_ESP_IDS: 'mqtt:request_all_esp_ids',
  REQUEST_CONFIG: 'mqtt:request_config',
  GOD_CONFIG_UPDATE: 'mqtt:god_config_update',
  KAISER_CONFIG_UPDATE: 'mqtt:kaiser_config_update',
  SENSORS_CONFIGURED: 'mqtt:sensors_configured',
  ACTUATORS_CONFIGURED: 'mqtt:actuators_configured',
  ESP_SELECTION: 'mqtt:esp_selection',

  // 🆕 NEU: CentralDataHub Events (6 fehlende Events)
  KAISER_ID_REQUEST: 'mqtt:kaiser_id_request',
  SELECTED_ESP_REQUEST: 'mqtt:selected_esp_request',
  ZONE_REQUEST: 'mqtt:zone_request',
  SENSOR_AGGREGATION_REQUEST: 'mqtt:sensor_aggregation_request',
  GOD_COMMUNICATION: 'mqtt:god_communication',
  CONNECTION_REQUEST: 'mqtt:connection_request',

  // ✅ NEU: Kaiser-ID und Hierarchie Events
  KAISER_ID_CHANGED: 'mqtt:kaiser_id_changed',
  ZONE_CHANGED: 'mqtt:zone_changed',
  ESP_KAISER_TRANSFER: 'mqtt:esp_kaiser_transfer',
  ESP_KAISER_ACCEPT: 'mqtt:esp_kaiser_accept',
  CROSS_KAISER_ZONE_CHANGE: 'mqtt:cross_kaiser_zone_change',
  GOD_MODE_ACTIVATION: 'mqtt:god_mode_activation',
  GOD_MODE_ACTIVATED: 'mqtt:god_mode_activated',
  COLLECT_UNCONFIGURED_ESPS: 'mqtt:collect_unconfigured_esps',
  ESP_TRANSFER_STARTED: 'mqtt:esp_transfer_started',
  ESP_TRANSFER_COMPLETED: 'mqtt:esp_transfer_completed',
  ESP_TRANSFER_FAILED: 'mqtt:esp_transfer_failed',

  // 🆕 NEU: Subzone Events (8 fehlende Events)
  SUBZONE_CREATED: 'mqtt:subzone_created',
  SUBZONE_UPDATED: 'mqtt:subzone_updated',
  SUBZONE_DELETED: 'mqtt:subzone_deleted',
  PIN_SUBZONE_ASSIGNED: 'mqtt:pin_subzone_assigned',
  DEVICE_PIN_ASSIGNED: 'mqtt:device_pin_assigned',
  CROSS_ESP_LOGIC_CREATED: 'mqtt:cross_esp_logic_created',
  CROSS_ESP_LOGIC_TRIGGERED: 'mqtt:cross_esp_logic_triggered',
  CROSS_ESP_LOGIC_EXECUTED: 'mqtt:cross_esp_logic_executed',

  // 🆕 NEU: Cross-ESP Logic Events (3 fehlende Events)
  CROSS_ESP_LOGIC_FAILED: 'mqtt:cross_esp_logic_failed',
  CROSS_SUBZONE_SENSOR_UPDATE: 'mqtt:cross_subzone_sensor_update',
  CROSS_SUBZONE_ACTUATOR_COMMAND: 'mqtt:cross_subzone_actuator_command',

  // 🆕 NEU: Subzone Hierarchy Events (3 fehlende Events)
  CROSS_SUBZONE_LOGIC_EVALUATION: 'mqtt:cross_subzone_logic_evaluation',
  SUBZONE_HIERARCHY_UPDATE: 'mqtt:subzone_hierarchy_update',
  CROSS_ZONE_SUBZONE_MAPPING: 'mqtt:cross_zone_subzone_mapping',

  // 🆕 NEU: Subzone Dependency Events (1 fehlendes Event)
  SUBZONE_DEPENDENCY_CHANGE: 'mqtt:subzone_dependency_change',
}

// 🆕 NEU: Store-Kommunikation Events für zirkuläre Abhängigkeiten
const STORE_EVENTS = {
  // Store-Initialisierung und Registry
  STORE_INITIALIZE: 'store:initialize',
  STORE_READY: 'store:ready',
  STORE_REGISTER: 'store:register',
  STORE_UNREGISTER: 'store:unregister',

  // Store-Requests und Responses
  STORE_REQUEST: 'store:request',
  STORE_RESPONSE: 'store:response',
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',

  // Cross-Store Events
  CROSS_STORE_UPDATE: 'cross_store:update',
  CROSS_STORE_SYNC: 'cross_store:sync',
  CROSS_STORE_INVALIDATE: 'cross_store:invalidate',

  // Store-Lifecycle Events
  STORE_MOUNTED: 'store:mounted',
  STORE_UNMOUNTED: 'store:unmounted',
  STORE_ERROR: 'store:error',
  STORE_RECOVER: 'store:recover',
}

// ✅ NEU: Event-Prioritäten für Cycle-Prevention
const EVENT_PRIORITIES = {
  EMERGENCY: 100, // Notfall-Events (höchste Priorität)
  CRITICAL: 90, // Kritische System-Events
  HIGH: 80, // Wichtige Business-Logic
  NORMAL: 50, // Standard-Events
  LOW: 20, // Debug/Monitoring Events
  BACKGROUND: 10, // Hintergrund-Events (niedrigste Priorität)
}

// ✅ NEU: Event-Prioritäts-Mapping
const EVENT_PRIORITY_MAP = {
  // Emergency Events
  'mqtt:emergency_stop': EVENT_PRIORITIES.EMERGENCY,
  'mqtt:system_critical': EVENT_PRIORITIES.EMERGENCY,
  'mqtt:failsafe': EVENT_PRIORITIES.EMERGENCY,

  // Critical Events
  'mqtt:actuator_status': EVENT_PRIORITIES.CRITICAL,
  'mqtt:system_command': EVENT_PRIORITIES.CRITICAL,
  'mqtt:actuator_logic_status': EVENT_PRIORITIES.CRITICAL,

  // High Priority Events
  'mqtt:sensor_data': EVENT_PRIORITIES.HIGH,
  'mqtt:esp_config': EVENT_PRIORITIES.HIGH,
  'mqtt:central_config_update': EVENT_PRIORITIES.HIGH,
  'mqtt:kaiser_status_update': EVENT_PRIORITIES.HIGH,

  // Normal Priority Events
  'mqtt:heartbeat': EVENT_PRIORITIES.NORMAL,
  'mqtt:status_update': EVENT_PRIORITIES.NORMAL,
  'mqtt:zone_changes': EVENT_PRIORITIES.NORMAL,

  // Low Priority Events
  'mqtt:debug': EVENT_PRIORITIES.LOW,
  'mqtt:performance_update': EVENT_PRIORITIES.LOW,

  // Background Events
  'mqtt:cleanup': EVENT_PRIORITIES.BACKGROUND,
  'mqtt:monitoring': EVENT_PRIORITIES.BACKGROUND,
}

// 🆕 NEU: Event-Handler für Store-to-Store Communication
const mqttEventRouter = {
  routeSensorData: (data) => eventBus.emit(MQTT_EVENTS.SENSOR_DATA, data),
  routeActuatorStatus: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_STATUS, data),
  routeEspConfig: (data) => eventBus.emit(MQTT_EVENTS.ESP_CONFIG, data),
  routeEspDiscovery: (data) => eventBus.emit(MQTT_EVENTS.ESP_DISCOVERY, data),
  routeSystemCommand: (data) => eventBus.emit(MQTT_EVENTS.SYSTEM_COMMAND, data),
  routeGodMessage: (data) => eventBus.emit(MQTT_EVENTS.GOD_MESSAGE, data),
  routeHeartbeat: (data) => eventBus.emit(MQTT_EVENTS.HEARTBEAT, data),
  routeStatusUpdate: (data) => eventBus.emit(MQTT_EVENTS.STATUS_UPDATE, data),
  routeZoneChanges: (data) => eventBus.emit(MQTT_EVENTS.ZONE_CHANGES, data),
  routeSubzoneMessage: (data) => eventBus.emit(MQTT_EVENTS.SUBZONE_MESSAGE, data),

  // ✅ NEU: Erweiterte Event-Router
  routeActuatorLogicStatus: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_LOGIC_STATUS, data),
  routeActuatorLogicCommand: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_LOGIC_COMMAND, data),
  routeCentralConfigUpdate: (data) => eventBus.emit(MQTT_EVENTS.CENTRAL_CONFIG_UPDATE, data),
  routeCentralDataHubUpdate: (data) => eventBus.emit(MQTT_EVENTS.CENTRAL_DATA_HUB_UPDATE, data),
  routeKaiserStatusUpdate: (data) => eventBus.emit(MQTT_EVENTS.KAISER_STATUS_UPDATE, data),
  routeKaiserHealthUpdate: (data) => eventBus.emit(MQTT_EVENTS.KAISER_HEALTH_UPDATE, data),
  routeHierarchyUpdate: (data) => eventBus.emit(MQTT_EVENTS.HIERARCHY_UPDATE, data),
  routeEspTransfer: (data) => eventBus.emit(MQTT_EVENTS.ESP_TRANSFER, data),
  routeEspOwnershipUpdate: (data) => eventBus.emit(MQTT_EVENTS.ESP_OWNERSHIP_UPDATE, data),

  // ✅ NEU: Zusätzliche Router für CentralConfig-Migration
  routeZoneValidation: (data) => eventBus.emit(MQTT_EVENTS.ZONE_VALIDATION, data),
  routeMindmapConfigChange: (data) => eventBus.emit(MQTT_EVENTS.MINDMAP_CONFIG_CHANGE, data),
  routeConnectionTest: (data) => eventBus.emit(MQTT_EVENTS.CONNECTION_TEST, data),
  routeAutoSelectEsp: (data) => eventBus.emit(MQTT_EVENTS.AUTO_SELECT_ESP, data),
  routeActuatorLogicUpdate: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_LOGIC_UPDATE, data),

  // 🆕 NEU: Router für CentralConfig-Migration
  routeCheckIdConflicts: (data) => eventBus.emit(MQTT_EVENTS.CHECK_ID_CONFLICTS, data),
  routeValidateSelectedEsp: (data) => eventBus.emit(MQTT_EVENTS.VALIDATE_SELECTED_ESP, data),

  // 🆕 NEU: Router für ActuatorLogic-Migration
  routeActuatorCommand: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_COMMAND, data),
  routeActuatorOverride: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_OVERRIDE, data),
  routeActuatorClearOverride: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_CLEAR_OVERRIDE, data),
  routeActuatorLogicConfig: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_LOGIC_CONFIG, data),
  routeCrossKaiserSensorData: (data) => eventBus.emit(MQTT_EVENTS.CROSS_KAISER_SENSOR_DATA, data),

  // 🆕 NEU: Router für CentralDataHub-Migration
  routeSystemStatusUpdate: (data) => eventBus.emit(MQTT_EVENTS.SYSTEM_STATUS_UPDATE, data),
  routeDeviceDataRequest: (data) => eventBus.emit(MQTT_EVENTS.DEVICE_DATA_REQUEST, data),
  routeServerConfigUpdate: (data) => eventBus.emit(MQTT_EVENTS.SERVER_CONFIG_UPDATE, data),
  routeCrossKaiserBatchUpdate: (data) => eventBus.emit(MQTT_EVENTS.CROSS_KAISER_BATCH_UPDATE, data),
  routeIdConflictResolution: (data) => eventBus.emit(MQTT_EVENTS.ID_CONFLICT_RESOLUTION, data),
  routeKaiserRegistration: (data) => eventBus.emit(MQTT_EVENTS.KAISER_REGISTRATION, data),
  routeEspTransferCommand: (data) => eventBus.emit(MQTT_EVENTS.ESP_TRANSFER_COMMAND, data),
  routeCrossKaiserCommand: (data) => eventBus.emit(MQTT_EVENTS.CROSS_KAISER_COMMAND, data),
  routeDeviceUpdate: (data) => eventBus.emit(MQTT_EVENTS.DEVICE_UPDATE, data),
  routePerformanceUpdate: (data) => eventBus.emit(MQTT_EVENTS.PERFORMANCE_UPDATE, data),

  // ✅ NEU: Router für die letzten 5 CentralDataHub-Funktionen
  routeEspListRequest: (data) => eventBus.emit(MQTT_EVENTS.ESP_LIST_REQUEST, data),
  routeDeviceStatusRequest: (data) => eventBus.emit(MQTT_EVENTS.DEVICE_STATUS_REQUEST, data),
  routeSensorValueRequest: (data) => eventBus.emit(MQTT_EVENTS.SENSOR_VALUE_REQUEST, data),
  routeActuatorStateRequest: (data) => eventBus.emit(MQTT_EVENTS.ACTUATOR_STATE_REQUEST, data),
  routeSystemMessageProcess: (data) => eventBus.emit(MQTT_EVENTS.SYSTEM_MESSAGE_PROCESS, data),

  // 🆕 NEU: Pi Integration Router
  routePiStatusRequest: (data) => eventBus.emit(MQTT_EVENTS.PI_STATUS_REQUEST, data),
  routePiUrlSet: (data) => eventBus.emit(MQTT_EVENTS.PI_URL_SET, data),
  routePiHealthCheck: (data) => eventBus.emit(MQTT_EVENTS.PI_HEALTH_CHECK, data),
  routePiInstallLibrary: (data) => eventBus.emit(MQTT_EVENTS.PI_INSTALL_LIBRARY, data),
  routePiConfigureSensor: (data) => eventBus.emit(MQTT_EVENTS.PI_CONFIGURE_SENSOR, data),
  routePiRemoveSensor: (data) => eventBus.emit(MQTT_EVENTS.PI_REMOVE_SENSOR, data),
  routePiI2cConfiguration: (data) => eventBus.emit(MQTT_EVENTS.PI_I2C_CONFIGURATION, data),
  routePiSensorStatistics: (data) => eventBus.emit(MQTT_EVENTS.PI_SENSOR_STATISTICS, data),
  routePiConfigureActuator: (data) => eventBus.emit(MQTT_EVENTS.PI_CONFIGURE_ACTUATOR, data),

  // 🆕 NEU: Dashboard Generator Router
  routeRequestEspDevices: (data) => eventBus.emit(MQTT_EVENTS.REQUEST_ESP_DEVICES, data),
  routeRequestEspSensors: (data) => eventBus.emit(MQTT_EVENTS.REQUEST_ESP_SENSORS, data),
  routeRequestEspSubzones: (data) => eventBus.emit(MQTT_EVENTS.REQUEST_ESP_SUBZONES, data),

  // 🆕 NEU: CentralConfig Router
  routeRequestEspData: (data) => eventBus.emit(MQTT_EVENTS.REQUEST_ESP_DATA, data),
  routeRequestAllEspIds: (data) => eventBus.emit(MQTT_EVENTS.REQUEST_ALL_ESP_IDS, data),
  routeRequestConfig: (data) => eventBus.emit(MQTT_EVENTS.REQUEST_CONFIG, data),
  routeGodConfigUpdate: (data) => eventBus.emit(MQTT_EVENTS.GOD_CONFIG_UPDATE, data),
  routeKaiserConfigUpdate: (data) => eventBus.emit(MQTT_EVENTS.KAISER_CONFIG_UPDATE, data),
  routeSensorsConfigured: (data) => eventBus.emit(MQTT_EVENTS.SENSORS_CONFIGURED, data),
  routeActuatorsConfigured: (data) => eventBus.emit(MQTT_EVENTS.ACTUATORS_CONFIGURED, data),
  routeEspSelection: (data) => eventBus.emit(MQTT_EVENTS.ESP_SELECTION, data),

  // 🆕 NEU: CentralDataHub Router
  routeKaiserIdRequest: (data) => eventBus.emit(MQTT_EVENTS.KAISER_ID_REQUEST, data),
  routeSelectedEspRequest: (data) => eventBus.emit(MQTT_EVENTS.SELECTED_ESP_REQUEST, data),
  routeZoneRequest: (data) => eventBus.emit(MQTT_EVENTS.ZONE_REQUEST, data),
  routeSensorAggregationRequest: (data) =>
    eventBus.emit(MQTT_EVENTS.SENSOR_AGGREGATION_REQUEST, data),
  routeGodCommunication: (data) => eventBus.emit(MQTT_EVENTS.GOD_COMMUNICATION, data),
  routeConnectionRequest: (data) => eventBus.emit(MQTT_EVENTS.CONNECTION_REQUEST, data),
}

// 🆕 NEU: Store-Kommunikation Handler
class StoreCommunicationHandler {
  constructor() {
    this.storeRegistry = new Map() // Map<storeName, storeInstance>
    this.pendingRequests = new Map() // Map<requestId, { resolve, reject, timeout }>
    this.requestCounter = 0
    this.storeDependencies = new Map() // Map<storeName, Set<dependentStore>>
    this.initializationQueue = [] // Queue für Store-Initialisierung
    this.initializationInProgress = false
  }

  // Store registrieren
  registerStore(storeName, storeInstance) {
    this.storeRegistry.set(storeName, storeInstance)
    console.log(`✅ Store registered: ${storeName}`)

    // Event auslösen
    eventBus.emit(STORE_EVENTS.STORE_REGISTER, { storeName, timestamp: Date.now() })

    // Pending Requests für diesen Store abarbeiten
    this.processPendingRequests(storeName)

    return true
  }

  // Store deregistrieren
  unregisterStore(storeName) {
    const wasRegistered = this.storeRegistry.has(storeName)
    this.storeRegistry.delete(storeName)

    if (wasRegistered) {
      console.log(`❌ Store unregistered: ${storeName}`)
      eventBus.emit(STORE_EVENTS.STORE_UNREGISTER, { storeName, timestamp: Date.now() })
    }

    return wasRegistered
  }

  // Store abrufen (synchron)
  getStore(storeName) {
    return this.storeRegistry.get(storeName) || null
  }

  // Store abrufen (asynchron mit Promise)
  async getStoreAsync(storeName, timeoutMs = 5000) {
    const store = this.getStore(storeName)
    if (store) {
      return store
    }

    // Store nicht verfügbar, Promise-basierten Request erstellen
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId()
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Store request timeout: ${storeName}`))
      }, timeoutMs)

      this.pendingRequests.set(requestId, { resolve, reject, timeout, storeName })

      // Store-Request Event auslösen
      eventBus.emit(STORE_EVENTS.STORE_REQUEST, {
        requestId,
        storeName,
        timestamp: Date.now(),
      })
    })
  }

  // Store-Request beantworten
  handleStoreRequest({ requestId, storeName }) {
    const store = this.getStore(storeName)
    const pendingRequest = this.pendingRequests.get(requestId)

    if (pendingRequest) {
      clearTimeout(pendingRequest.timeout)
      this.pendingRequests.delete(requestId)

      if (store) {
        pendingRequest.resolve(store)
      } else {
        pendingRequest.reject(new Error(`Store not available: ${storeName}`))
      }
    }
  }

  // Pending Requests für einen Store abarbeiten
  processPendingRequests(storeName) {
    for (const [requestId, request] of this.pendingRequests.entries()) {
      if (request.storeName === storeName) {
        this.handleStoreRequest({ requestId, storeName })
      }
    }
  }

  // Request-ID generieren
  generateRequestId() {
    return `store_request_${++this.requestCounter}_${Date.now()}`
  }

  // ✅ NEU: Store automatisch erstellen und registrieren
  async createAndRegisterStore(storeName) {
    try {
      console.log(`🔄 Creating store: ${storeName}`)

      // Store-Modul dynamisch importieren
      const storeModule = await this.loadStoreModule(storeName)

      // Store-Instanz erstellen
      const storeInstance = storeModule()

      // Store registrieren
      this.registerStore(storeName, storeInstance)

      // Setup-Methode aufrufen falls vorhanden
      if (typeof storeInstance.setup === 'function') {
        console.log(`🔄 Running setup for store: ${storeName}`)
        storeInstance.setup()
      }

      console.log(`✅ Store ${storeName} created and registered successfully`)
      return storeInstance
    } catch (error) {
      console.error(`❌ Failed to create store ${storeName}:`, error)
      throw error
    }
  }

  // ✅ NEU: Store-Modul dynamisch laden
  async loadStoreModule(storeName) {
    const storeMap = {
      mqtt: () => import('@/stores/mqtt').then((m) => m.useMqttStore),
      centralDataHub: () => import('@/stores/centralDataHub').then((m) => m.useCentralDataHub),
      centralConfig: () => import('@/stores/centralConfig').then((m) => m.useCentralConfigStore),
      piIntegration: () => import('@/stores/piIntegration').then((m) => m.usePiIntegrationStore),
      dashboardGenerator: () =>
        import('@/stores/dashboardGenerator').then((m) => m.useDashboardGeneratorStore),
      espManagement: () => import('@/stores/espManagement').then((m) => m.useEspManagementStore),
      actuatorLogic: () => import('@/stores/actuatorLogic').then((m) => m.useActuatorLogicStore),
      sensorRegistry: () => import('@/stores/sensorRegistry').then((m) => m.useSensorRegistryStore),
      timeRange: () => import('@/stores/timeRange').then((m) => m.useTimeRangeStore),
      zoneRegistry: () => import('@/stores/zoneRegistry').then((m) => m.useZoneRegistryStore),
      logicalAreas: () => import('@/stores/logicalAreas').then((m) => m.useLogicalAreasStore),
      theme: () => import('@/stores/theme').then((m) => m.useThemeStore),
      counter: () => import('@/stores/counter').then((m) => m.useCounterStore),
      // ✅ NEU: Fehlende Stores hinzufügen
      systemCommands: () => import('@/stores/systemCommands').then((m) => m.useSystemCommandsStore),
      databaseLogs: () => import('@/stores/databaseLogs').then((m) => m.useDatabaseLogsStore),
    }

    const storeLoader = storeMap[storeName]
    if (!storeLoader) {
      console.error(`❌ Unknown store: ${storeName}`)
      console.error(`📋 Available stores:`, Object.keys(storeMap))
      throw new Error(`Unknown store: ${storeName}`)
    }

    return await storeLoader()
  }

  // Store-Initialisierung koordinieren
  async initializeStores(storeNames) {
    if (this.initializationInProgress) {
      console.log('⚠️ Store initialization already in progress')
      return
    }

    this.initializationInProgress = true
    console.log(`🚀 Initializing stores: ${storeNames.join(', ')}`)

    try {
      // ✅ NEU: Stores automatisch erstellen und registrieren
      for (const storeName of storeNames) {
        if (!this.storeRegistry.has(storeName)) {
          console.log(`🔄 Creating and registering store: ${storeName}`)
          await this.createAndRegisterStore(storeName)
        }
      }

      // Initialisierung-Event auslösen
      eventBus.emit(STORE_EVENTS.STORE_INITIALIZE, {
        storeNames,
        timestamp: Date.now(),
      })

      // Auf alle Stores warten
      const initializationPromises = storeNames.map((storeName) =>
        this.waitForStore(storeName, 10000),
      )

      await Promise.all(initializationPromises)
      console.log('✅ All stores initialized successfully')
    } catch (error) {
      console.error('❌ Store initialization failed:', error)
      throw error
    } finally {
      this.initializationInProgress = false
    }
  }

  // Auf Store warten
  async waitForStore(storeName, timeoutMs = 10000) {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      if (this.storeRegistry.has(storeName)) {
        const store = this.storeRegistry.get(storeName)

        // ✅ KORRIGIERT: Einfache Prüfung ob Store existiert
        if (store) {
          console.log(`✅ Store ${storeName} ready and available`)
          return store
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // ✅ NEU: Debug-Informationen für Timeout
    console.error(`❌ Store initialization timeout for ${storeName}`)
    console.error(`📊 Current registry state:`, {
      registeredStores: Array.from(this.storeRegistry.keys()),
      requestedStore: storeName,
      registrySize: this.storeRegistry.size,
    })

    throw new Error(`Store initialization timeout: ${storeName}`)
  }

  // Store-Statistiken abrufen
  getStoreStats() {
    return {
      registeredStores: Array.from(this.storeRegistry.keys()),
      pendingRequests: this.pendingRequests.size,
      totalRequests: this.requestCounter,
      storeCount: this.storeRegistry.size,
    }
  }

  // Store-Registry löschen
  clearRegistry() {
    this.storeRegistry.clear()
    this.pendingRequests.clear()
    this.requestCounter = 0
    console.log('🧹 Store registry cleared')
  }
}

// 🆕 NEU: Globaler Store-Handler
const storeHandler = new StoreCommunicationHandler()

class EventBus {
  constructor() {
    this.listeners = new Map()
    this.onceListeners = new Map()
    this.eventStack = [] // 🔒 Event-Stack für Cycle-Detection
    this.maxEventDepth = 10 // 🔒 Max Event-Tiefe
    this.eventHistory = [] // 🔒 Event-Historie für Debugging
    this.maxHistorySize = 100 // 🔒 Max Historie-Größe
    this.cycleDetectionEnabled = true // 🔒 Cycle-Detection aktiviert
    this.eventStats = {
      totalEvents: 0,
      cyclePrevented: 0,
      priorityEvents: 0,
      averageDepth: 0,
    }
  }

  // ✅ NEU: Event-Priorität ermitteln
  getEventPriority(event) {
    return EVENT_PRIORITY_MAP[event] || EVENT_PRIORITIES.NORMAL
  }

  // ✅ VERBESSERT: Event-Cycle-Detection mit spezifischer Behandlung
  detectEventCycle(event) {
    if (!this.cycleDetectionEnabled) return false

    // Prüfen ob Event bereits im Stack ist
    const cycleIndex = this.eventStack.indexOf(event)
    if (cycleIndex !== -1) {
      const cycle = this.eventStack.slice(cycleIndex)
      console.error('⚠️ Event cycle detected:', cycle.join(' -> ') + ' -> ' + event)
      this.eventStats.cyclePrevented++

      // ✅ NEU: Spezifische Behandlung für store:ready Events
      if (event === 'store:ready') {
        console.warn('🔄 Store ready cycle detected - preventing infinite loop')
        return true
      }

      return true
    }

    // Prüfen ob maximale Tiefe erreicht ist
    if (this.eventStack.length >= this.maxEventDepth) {
      console.error('⚠️ Max event depth reached:', this.maxEventDepth)
      this.eventStats.cyclePrevented++
      return true
    }

    return false
  }

  // ✅ NEU: Event-Historie verwalten
  addToHistory(event, data) {
    this.eventHistory.push({
      event,
      data,
      timestamp: Date.now(),
      depth: this.eventStack.length,
    })

    // Historie begrenzen
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift()
    }
  }

  // ✅ NEU: Event-Statistiken aktualisieren
  updateEventStats() {
    this.eventStats.totalEvents++
    this.eventStats.averageDepth = this.eventStack.length

    if (this.eventStack.length > 0) {
      const currentEvent = this.eventStack[this.eventStack.length - 1]
      const priority = this.getEventPriority(currentEvent)
      if (priority >= EVENT_PRIORITIES.HIGH) {
        this.eventStats.priorityEvents++
      }
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  // ✅ VERBESSERT: Emit mit Cycle-Detection und Priorität
  emit(event, data) {
    // 🔒 Cycle-Detection
    if (this.detectEventCycle(event)) {
      console.warn(`⚠️ Event cycle prevented: ${event}`)
      return false
    }

    // Event zum Stack hinzufügen
    this.eventStack.push(event)

    // Event-Historie und Statistiken aktualisieren
    this.addToHistory(event, data)
    this.updateEventStats()

    try {
      // Event-Priorität ermitteln
      const priority = this.getEventPriority(event)

      // Listeners nach Priorität sortieren
      const listeners = this.listeners.get(event) || []
      const onceListeners = this.onceListeners.get(event) || []

      // Alle Listeners ausführen
      const allListeners = [...listeners, ...onceListeners]

      if (allListeners.length > 0) {
        console.log(
          `📡 Event emitted: ${event} (priority: ${priority}, depth: ${this.eventStack.length})`,
        )

        // Listeners ausführen
        allListeners.forEach((callback) => {
          try {
            callback(data)
          } catch (error) {
            console.error(`❌ Error in event listener for ${event}:`, error)
            errorHandler.handleError(error, { context: 'eventBus', event })
          }
        })

        // Once-Listeners entfernen
        this.onceListeners.delete(event)
      }

      return true
    } finally {
      // Event aus Stack entfernen
      this.eventStack.pop()
    }
  }

  // ✅ NEU: Event-Statistiken abrufen
  getEventStats() {
    return {
      ...this.eventStats,
      currentDepth: this.eventStack.length,
      eventHistory: this.eventHistory.slice(-10), // Letzte 10 Events
    }
  }

  // ✅ NEU: Event-Cycle-Detection konfigurieren
  configureCycleDetection(config) {
    this.cycleDetectionEnabled = config.enabled !== false
    this.maxEventDepth = config.maxDepth || 10
    this.maxHistorySize = config.maxHistory || 100
  }

  // ✅ NEU: Event-Historie löschen
  clearEventHistory() {
    this.eventHistory = []
    this.eventStats = {
      totalEvents: 0,
      cyclePrevented: 0,
      priorityEvents: 0,
      averageDepth: 0,
    }
  }

  off(event, callback) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
      if (listeners.length === 0) {
        this.listeners.delete(event)
      }
    }
  }
}

export const eventBus = new EventBus()

// 🆕 NEU: Store-Event-Handler registrieren (nach eventBus-Erstellung)
eventBus.on(STORE_EVENTS.STORE_REQUEST, storeHandler.handleStoreRequest.bind(storeHandler))

// ✅ KORRIGIERT: Store-Ready Event Handler - Zirkuläre Emission entfernen
eventBus.on(STORE_EVENTS.STORE_READY, (data) => {
  console.log(`✅ Store ready: ${data.storeName}`)
  // ❌ ENTFERNT: Zirkuläre Event-Emission
  // eventBus.emit(STORE_EVENTS.STORE_READY, data)
})

// 🆕 NEU: Validierungsfunktion für Event-System Vollständigkeit
export function validateEventSystem() {
  const validation = {
    totalEvents: Object.keys(MQTT_EVENTS).length,
    totalRouters: Object.keys(mqttEventRouter).length,
    missingRouters: [],
    validationPassed: true,
    errors: [],
  }

  // Prüfe, ob für jedes Event ein Router existiert
  for (const [eventKey] of Object.entries(MQTT_EVENTS)) {
    const routerKey = `route${eventKey.charAt(0).toUpperCase() + eventKey.slice(1).toLowerCase()}`
    if (!mqttEventRouter[routerKey]) {
      validation.missingRouters.push({ event: eventKey, router: routerKey })
      validation.validationPassed = false
      validation.errors.push(`Missing router for event: ${eventKey}`)
    }
  }

  console.log('🔍 Event-System Validation:', validation)
  return validation
}

// 🆕 NEU: Automatische Validierung beim Import
validateEventSystem()

// 🆕 NEU: Export der MQTT-Events, Store-Events und Handler
export { MQTT_EVENTS, STORE_EVENTS, mqttEventRouter, storeHandler }

// 🆕 NEU: Store-Kommunikation Helper-Funktionen
export function useStoreCommunication() {
  const getStore = (storeName) => storeHandler.getStore(storeName)
  const getStoreAsync = (storeName, timeoutMs) => storeHandler.getStoreAsync(storeName, timeoutMs)
  const registerStore = (storeName, storeInstance) =>
    storeHandler.registerStore(storeName, storeInstance)
  const unregisterStore = (storeName) => storeHandler.unregisterStore(storeName)
  const initializeStores = (storeNames) => storeHandler.initializeStores(storeNames)
  const getStoreStats = () => storeHandler.getStoreStats()

  return {
    getStore,
    getStoreAsync,
    registerStore,
    unregisterStore,
    initializeStores,
    getStoreStats,
  }
}
