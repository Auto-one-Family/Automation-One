// ✅ NEU: Lazy Store Access Pattern - Konsistent mit bestehender Architektur
import axios from 'axios'

class APIService {
  constructor() {
    // ✅ NEU: Lazy Store Access - Keine direkten Store-Imports im Constructor
    this._centralConfig = null
    this.client = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request/Response Interceptors
    this.client.interceptors.request.use(
      (config) => {
        console.log('🚀 API Request:', config.method?.toUpperCase(), config.url)
        return config
      },
      (error) => {
        console.error('❌ API Request Error:', error)
        return Promise.reject(error)
      },
    )

    this.client.interceptors.response.use(
      (response) => {
        console.log('✅ API Response:', response.status, response.config.url)
        return response
      },
      (error) => {
        console.error('❌ API Response Error:', error.response?.status, error.message)
        return Promise.reject(error)
      },
    )
  }

  // ✅ NEU: Lazy Store Access - Konsistent mit bestehender Architektur
  get centralConfig() {
    if (!this._centralConfig) {
      // ✅ KONSISTENT: Fallback für Pre-Initialization - verwendet bestehende Environment Variable Pattern
      return {
        getServerUrl: () => import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198',
        getMqttUrl: () => import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198',
        httpPort: 8443,
        serverIP: import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198',
        kaiserId: import.meta.env.VITE_KAISER_ID || 'raspberry_pi_central',
      }
    }
    return this._centralConfig
  }

  // ✅ NEU: Store-Initialisierung nach Pinia Setup - konsistent mit main.js Pattern
  async initializeStore() {
    if (this._centralConfig) return this._centralConfig

    try {
      // ✅ KONSISTENT: Dynamischer Import - verwendet bestehende Pattern aus mqtt.js
      const { useCentralConfigStore } = await import('@/stores/centralConfig')
      this._centralConfig = useCentralConfigStore()
      console.log('✅ API Service: CentralConfig store initialized')
      return this._centralConfig
    } catch (error) {
      console.warn('⚠️ CentralConfig store not available yet:', error.message)
      return this.centralConfig // Fallback verwenden
    }
  }

  // ✅ KORRIGIERT: Verwende Getter als Properties, nicht als Funktionen
  getBaseUrl() {
    const config = this.centralConfig
    if (config.getServerUrl) {
      return config.getServerUrl
    }
    // Fallback für Pre-Initialization
    return `http://${config.serverIP || import.meta.env.VITE_MQTT_BROKER_URL || '192.168.0.198'}:${config.httpPort || 8443}`
  }

  // Health & Status
  async getHealth() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/health`)
    return response.data
  }

  async getMQTTStatus() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/mqtt/status`)
    return response.data
  }

  // ESP32 Device Management
  async getESPDevices() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/devices`)
    return response.data
  }

  async getESPZones() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/zones`)
    return response.data
  }

  async getESPDevice(espId) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/device/${espId}`)
    return response.data
  }

  async getESPHealth() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/health`)
    return response.data
  }

  async getESPResponseHistory(espId) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/responses/${espId}`)
    return response.data
  }

  // Safe Mode & GPIO Conflicts
  async getESPSafeMode(espId) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/safe_mode/${espId}`)
    return response.data
  }

  async getSafeModeSummary() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/safe_mode_summary`)
    return response.data
  }

  async getGPIOConflicts(espId = null, limit = 100) {
    const params = { limit }
    if (espId) params.esp_id = espId

    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/gpio_conflicts`, {
      params,
    })
    return response.data
  }

  // Sensor Processing
  async processSensor(sensorData) {
    const response = await this.client.post(`${this.getBaseUrl()}/api/process_sensor`, sensorData)
    return response.data
  }

  async batchProcessSensors(sensorDataArray) {
    const response = await this.client.post(
      `${this.getBaseUrl()}/api/batch_process`,
      sensorDataArray,
    )
    return response.data
  }

  // Library Management
  async installLibrary(libraryData) {
    const response = await this.client.post(`${this.getBaseUrl()}/api/install_library`, libraryData)
    return response.data
  }

  async getLibraryStatus() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/library_status`)
    return response.data
  }

  // Actuator Processing
  async processActuator(actuatorData) {
    const response = await this.client.post(
      `${this.getBaseUrl()}/api/actuator/process`,
      actuatorData,
    )
    return response.data
  }

  // Emergency Handling
  async handleEmergency(emergencyData) {
    const response = await this.client.post(`${this.getBaseUrl()}/api/emergency`, emergencyData)
    return response.data
  }

  async getSafeModeStatus() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/safe_mode/status`)
    return response.data
  }

  // Discovery
  async getESP32Discovery() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/discovery/esp32`)
    return response.data
  }

  // Kaiser Management
  async registerKaiser(kaiserData) {
    const response = await this.client.post(`${this.getBaseUrl()}/api/kaiser/register`, kaiserData)
    return response.data
  }

  async getKaiserStatus() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/kaiser/status`)
    return response.data
  }

  // MQTT Management
  async reconnectMQTT() {
    const response = await this.client.post(`${this.getBaseUrl()}/api/mqtt/reconnect`)
    return response.data
  }

  // ✅ NEU: Database Endpoints für Logs und Protokolle
  async getSensorData(params = {}) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/database/sensor_data`, {
      params,
    })
    return response.data
  }

  async getActuatorStates(params = {}) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/database/actuator_states`, {
      params,
    })
    return response.data
  }

  async getEspDevicesList(params = {}) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/database/esp_devices`, {
      params,
    })
    return response.data
  }

  async getGpioUsage(params = {}) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/database/gpio_usage`, {
      params,
    })
    return response.data
  }

  async getSafeModeHistory(espId, params = {}) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/database/safe_mode_history`, {
      params: { esp_id: espId, ...params },
    })
    return response.data
  }

  async getDatabaseStatistics(params = {}) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/database/statistics`, {
      params,
    })
    return response.data
  }

  // 🆕 NEU: Aggregation-Endpunkte
  async getAggregatedSensorData(params = {}) {
    const response = await this.client.get(
      `${this.getBaseUrl()}/api/database/sensor_data/aggregated`,
      {
        params,
      },
    )
    return response.data
  }

  async getSensorDataStatistics(params = {}) {
    const response = await this.client.get(
      `${this.getBaseUrl()}/api/database/sensor_data/statistics`,
      {
        params,
      },
    )
    return response.data
  }

  // FEHLENDE API-ENDPOINTS (Backend-Synchronisation Pi Server v3.6.0)
  async postESPResponses(data) {
    const response = await this.client.post(`${this.getBaseUrl()}/api/esp/responses`, data)
    return response.data
  }

  async getESPResponses() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/responses`)
    return response.data
  }

  async getCompatibility() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/compatibility`)
    return response.data
  }

  async getESPZoneDevices(kaiserId) {
    const response = await this.client.get(`${this.getBaseUrl()}/api/esp/zones/${kaiserId}/devices`)
    return response.data
  }

  async getGodHierarchy() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/god/hierarchy`)
    return response.data
  }

  async postGodEspTransfer(data) {
    const response = await this.client.post(`${this.getBaseUrl()}/api/god/esp/transfer`, data)
    return response.data
  }

  async postCrossEspActuatorLogic(data) {
    const response = await this.client.post(
      `${this.getBaseUrl()}/api/cross_esp/actuator_logic`,
      data,
    )
    return response.data
  }

  async getCrossEspStatistics() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/cross_esp/statistics`)
    return response.data
  }

  async getCrossEspHealth() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/cross_esp/health`)
    return response.data
  }

  async postLoadTest(data) {
    const response = await this.client.post(`${this.getBaseUrl()}/api/load_test`, data)
    return response.data
  }

  async getLoadTestStatus() {
    const response = await this.client.get(`${this.getBaseUrl()}/api/load_test/status`)
    return response.data
  }
}

export const apiService = new APIService()
