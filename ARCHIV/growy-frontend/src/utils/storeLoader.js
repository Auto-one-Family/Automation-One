// ✅ NEU: Store-Loader mit Dependency-Management
import { errorHandler } from './errorHandler'

// ✅ KORRIGIERT: Store-Dependency-Graph korrigieren
const STORE_DEPENDENCIES = {
  mqtt: [], // Basis-Store, keine Abhängigkeiten
  centralConfig: [], // Keine Abhängigkeit von MQTT (zirkuläre Abhängigkeit vermeiden)
  mindmap: ['centralConfig'], // Abhängig von CentralConfig für Server-IP
  espManagement: ['mqtt'], // Abhängig von MQTT
  sensorRegistry: ['mqtt'], // Abhängig von MQTT
  piIntegration: ['mqtt'], // Abhängig von MQTT
  actuatorLogic: ['mqtt'], // Abhängig von MQTT
  systemCommands: ['mqtt'], // Abhängig von MQTT
  dashboardGenerator: ['centralConfig'], // Nur Abhängigkeit von Config
  databaseLogs: ['mqtt'], // Abhängig von MQTT
  timeRange: [], // Keine Abhängigkeiten
  zoneRegistry: ['centralConfig'], // Nur Abhängigkeit von Config
  logicalAreas: ['mqtt'], // Abhängig von MQTT
  theme: [], // Keine Abhängigkeiten
  counter: [], // Keine Abhängigkeiten
}

// ✅ NEU: Store-Name zu Datei-Name Mapping
const STORE_FILE_MAPPING = {
  mindmap: 'mindmapStore',
  // Weitere Mappings können hier hinzugefügt werden
}

// ✅ NEU: Store-Funktion-Name Mapping
const STORE_FUNCTION_MAPPING = {
  mindmap: 'useMindmapStore',
  timeRange: 'useTimeRangeStore',
  zoneRegistry: 'useZoneRegistryStore',
  counter: 'useCounterStore',
  piIntegration: 'usePiIntegrationStore',
  logicalAreas: 'useLogicalAreasStore',
  dashboardGenerator: 'useDashboardGeneratorStore',
  centralConfig: 'useCentralConfigStore',
  espManagement: 'useEspManagementStore',
  databaseLogs: 'useDatabaseLogsStore',
  sensorRegistry: 'useSensorRegistryStore',
  mqtt: 'useMqttStore',
  theme: 'useThemeStore',
  actuatorLogic: 'useActuatorLogicStore',
  systemCommands: 'useSystemCommandsStore',
  centralDataHub: 'useCentralDataHub',
}

// ✅ NEU: Store-Loader-Klasse
class StoreLoader {
  constructor() {
    this.loadedStores = new Map()
    this.loadingPromises = new Map()
    this.loadOrder = []
  }

  // ✅ NEU: Topologische Sortierung für Store-Loading
  getLoadOrder() {
    const visited = new Set()
    const temp = new Set()
    const order = []

    const visit = (storeName) => {
      if (temp.has(storeName)) {
        throw new Error(`Circular dependency detected: ${storeName}`)
      }
      if (visited.has(storeName)) return

      temp.add(storeName)

      const dependencies = STORE_DEPENDENCIES[storeName] || []
      for (const dep of dependencies) {
        visit(dep)
      }

      temp.delete(storeName)
      visited.add(storeName)
      order.push(storeName)
    }

    for (const storeName of Object.keys(STORE_DEPENDENCIES)) {
      if (!visited.has(storeName)) {
        visit(storeName)
      }
    }

    return order
  }

  // ✅ NEU: Store laden mit Dependency-Check
  async loadStore(storeName) {
    if (this.loadedStores.has(storeName)) {
      return this.loadedStores.get(storeName)
    }

    if (this.loadingPromises.has(storeName)) {
      // ✅ NEU: Zirkuläre Abhängigkeit erkannt - Lazy-Loading verwenden
      console.warn(`Circular dependency detected for ${storeName}, using lazy loading`)
      return this._loadStoreLazy(storeName)
    }

    const loadPromise = this._loadStoreWithDependencies(storeName)
    this.loadingPromises.set(storeName, loadPromise)

    try {
      const store = await loadPromise
      this.loadedStores.set(storeName, store)
      this.loadingPromises.delete(storeName)
      return store
    } catch (error) {
      this.loadingPromises.delete(storeName)
      errorHandler.error(`Failed to load store: ${storeName}`, error)
      throw error
    }
  }

  // ✅ NEU: Lazy-Loading für zirkuläre Abhängigkeiten
  async _loadStoreLazy(storeName) {
    try {
      const fileName = STORE_FILE_MAPPING[storeName] || storeName
      const module = await import(`../stores/${fileName}.js`)
      const functionName =
        STORE_FUNCTION_MAPPING[storeName] || `use${this._capitalizeFirst(storeName)}Store`
      const storeFunction = module[functionName]

      if (!storeFunction) {
        throw new Error(`Store function not found: ${functionName}`)
      }

      return storeFunction
    } catch (error) {
      throw new Error(`Failed to lazy load store ${storeName}: ${error.message}`)
    }
  }

  // ✅ NEU: Store mit Dependencies laden
  async _loadStoreWithDependencies(storeName) {
    const dependencies = STORE_DEPENDENCIES[storeName] || []

    // Dependencies zuerst laden
    for (const dep of dependencies) {
      await this.loadStore(dep)
    }

    // Store selbst laden
    const storeModule = await this._importStore(storeName)
    return storeModule
  }

  // ✅ NEU: Store-Modul importieren
  async _importStore(storeName) {
    try {
      const fileName = STORE_FILE_MAPPING[storeName] || storeName
      const module = await import(`../stores/${fileName}.js`)
      const functionName =
        STORE_FUNCTION_MAPPING[storeName] || `use${this._capitalizeFirst(storeName)}Store`
      const storeFunction = module[functionName]

      if (!storeFunction) {
        throw new Error(`Store function not found: ${functionName}`)
      }

      return storeFunction
    } catch (error) {
      throw new Error(`Failed to import store ${storeName}: ${error.message}`)
    }
  }

  // ✅ NEU: String-Kapitalisierung
  _capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  // ✅ NEU: Alle kritischen Stores preloaden
  async preloadCriticalStores() {
    const criticalStores = ['mqtt', 'centralConfig', 'espManagement']

    for (const storeName of criticalStores) {
      await this.loadStore(storeName)
    }
  }

  // ✅ NEU: Store-Status abrufen
  getStoreStatus() {
    return {
      loaded: Array.from(this.loadedStores.keys()),
      loading: Array.from(this.loadingPromises.keys()),
      total: Object.keys(STORE_DEPENDENCIES).length,
    }
  }

  // ✅ NEU: Store-Reset für Tests
  reset() {
    this.loadedStores.clear()
    this.loadingPromises.clear()
    this.loadOrder = []
  }
}

// ✅ NEU: Singleton-Instanz
export const storeLoader = new StoreLoader()
// ✅ NEU: Convenience-Funktionen
export const preloadCriticalStores = () => storeLoader.preloadCriticalStores()
export const getStoreStatus = () => storeLoader.getStoreStatus()
