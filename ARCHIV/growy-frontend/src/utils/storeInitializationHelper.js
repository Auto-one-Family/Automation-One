// ✅ NEU: Helper für sichere Store-Initialisierung ohne zirkuläre Abhängigkeiten

// ✅ KORRIGIERT: Store-Initialisierungsreihenfolge (zirkuläre Abhängigkeiten vermeiden)
const STORE_INIT_ORDER = [
  'centralConfig', // Basis-Konfiguration zuerst (keine Abhängigkeiten)
  'mqtt', // MQTT nach Config (keine Abhängigkeit von Config)
  'espManagement', // ESP Management nach MQTT
  'sensorRegistry', // Sensor Registry nach MQTT
  'piIntegration', // Pi Integration nach MQTT
  'actuatorLogic', // Actuator Logic nach MQTT
  'systemCommands', // System Commands nach MQTT
  'dashboardGenerator', // Dashboard Generator nach Config
  'databaseLogs',
  'timeRange',
  'zoneRegistry', // Nach Config
  'logicalAreas',
  'theme',
  'counter',
]

// ✅ NEU: Store-Validierungsfunktionen
const storeValidators = {
  centralConfig: (store) => {
    return store && typeof store.getCurrentKaiserId === 'function'
  },
  mqtt: (store) => {
    return store && typeof store.getKaiserId === 'function'
  },
  espManagement: (store) => {
    return store && typeof store.getAvailablePins === 'function'
  },
  sensorRegistry: (store) => {
    return store && typeof store.getAllSensors === 'function'
  },
  piIntegration: (store) => {
    return store && typeof store.checkPiStatus === 'function'
  },
  actuatorLogic: (store) => {
    return store && typeof store.logicEngine === 'object'
  },
  systemCommands: (store) => {
    return store && typeof store.sendCommand === 'function'
  },
  dashboardGenerator: (store) => {
    return store && typeof store.getSensorGroupKey === 'function'
  },
  databaseLogs: (store) => {
    return store && typeof store.getLogs === 'function'
  },
  timeRange: (store) => {
    return store && typeof store.getTimeRange === 'function'
  },
  zoneRegistry: (store) => {
    return store && typeof store.registerZoneInstance === 'function'
  },
  logicalAreas: (store) => {
    return store && typeof store.getLogicalAreas === 'function'
  },
  theme: (store) => {
    return store && typeof store.getTheme === 'function'
  },
  counter: (store) => {
    return store && typeof store.getCount === 'function'
  },
}

// ✅ NEU: Sichere Store-Initialisierung
export async function initializeStoresSafely() {
  const initializedStores = new Map()
  const errors = []

  console.log('🔄 Starting safe store initialization...')

  for (const storeName of STORE_INIT_ORDER) {
    try {
      console.log(`🔄 Initializing ${storeName} store...`)

      // Lazy import des Stores
      const storeModule = await import(`../stores/${storeName}.js`)
      const storeFunctionName = `use${storeName.charAt(0).toUpperCase() + storeName.slice(1)}Store`
      const storeFunction = storeModule[storeFunctionName]

      if (!storeFunction) {
        throw new Error(`Store function ${storeFunctionName} not found`)
      }

      // Store initialisieren
      const store = storeFunction()

      // Store validieren
      const validator = storeValidators[storeName]
      if (validator && !validator(store)) {
        console.warn(`⚠️ ${storeName} store validation failed, but continuing...`)
      }

      initializedStores.set(storeName, store)
      console.log(`✅ ${storeName} store initialized successfully`)
    } catch (error) {
      console.error(`❌ Failed to initialize ${storeName} store:`, error.message)
      errors.push({ store: storeName, error: error.message })

      // ✅ NEU: Kritische Stores dürfen nicht fehlschlagen
      if (['centralConfig', 'mqtt'].includes(storeName)) {
        throw new Error(`Critical store ${storeName} failed to initialize: ${error.message}`)
      }
    }
  }

  if (errors.length > 0) {
    console.warn('⚠️ Some stores failed to initialize:', errors)
  }

  console.log('✅ Store initialization completed')
  return { stores: initializedStores, errors }
}

// ✅ NEU: Store-Status prüfen
export function checkStoreStatus(stores) {
  const status = {}

  for (const [storeName, store] of stores.entries()) {
    const validator = storeValidators[storeName]
    status[storeName] = {
      loaded: !!store,
      valid: validator ? validator(store) : true,
    }
  }

  return status
}

// ✅ NEU: Store-Reset für Tests
export function resetStores(stores) {
  if (stores) {
    stores.clear()
  }
}

// ✅ KORRIGIERT: Validierung für MQTT Store
export function validateMqttStore(store) {
  return store && (typeof store.getKaiserId === 'function' || typeof store.getKaiserId === 'string')
}

// ✅ KORRIGIERT: Validierung für CentralConfig Store
export function validateCentralConfigStore(store) {
  return (
    store &&
    (typeof store.getCurrentKaiserId === 'function' || typeof store.getCurrentKaiserId === 'string')
  )
}
