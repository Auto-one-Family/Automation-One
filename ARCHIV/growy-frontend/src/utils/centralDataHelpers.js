import { useCentralDataHub } from '@/stores/centralDataHub'

/**
 * Zentrale Helper-Funktionen für CentralDataHub-Integration
 * ✅ KONSOLIDIERT: Einheitliche Store-Zugriffe über CentralDataHub
 */

/**
 * Einheitliche Device-Info-Abfrage über CentralDataHub
 * @param {string} espId - ESP-ID
 * @returns {Object|null} Device-Informationen oder null
 */
export function getDeviceInfo(espId) {
  const centralDataHub = useCentralDataHub()
  return centralDataHub.getDeviceInfo(espId)
}

/**
 * Einheitliche Sensor-Daten-Abfrage über CentralDataHub
 * @param {string} espId - ESP-ID
 * @param {number} gpio - GPIO-Pin
 * @returns {Object|null} Sensor-Daten oder null
 */
export function getSensorData(espId, gpio) {
  const centralDataHub = useCentralDataHub()
  return centralDataHub.getSensorData(espId, gpio)
}

/**
 * Einheitliche Aktor-Daten-Abfrage über CentralDataHub
 * @param {string} espId - ESP-ID
 * @param {number} gpio - GPIO-Pin
 * @returns {Object|null} Aktor-Daten oder null
 */
export function getActuatorData(espId, gpio) {
  const centralDataHub = useCentralDataHub()
  return centralDataHub.getActuatorData(espId, gpio)
}

/**
 * Einheitliche ESP-Device-Optionen über CentralDataHub
 * @returns {Array} Array von ESP-Device-Optionen
 */
export function getEspDeviceOptions() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const options = []

  for (const [espId, device] of mqttStore.espDevices.entries()) {
    const status = device.status || 'offline'
    const friendlyName = device.espFriendlyName || device.espUsername || espId
    const zone = centralDataHub.getZoneForEsp(espId)

    options.push({
      value: espId,
      title: friendlyName,
      subtitle: `${zone} • ${getStatusText(status)}`,
      status: status,
      zone: zone,
      friendlyName: friendlyName,
      lastHeartbeat: device.lastHeartbeat,
      connectionEstablished: device.connectionEstablished,
      boardType: device.board_type || device.boardType,
      chipModel: device.chipModel,
      firmwareVersion: device.firmware_version || device.firmwareVersion,
    })
  }

  // Sortiere nach Status (online zuerst) und dann nach Namen
  return options.sort((a, b) => {
    const statusOrder = { online: 0, configured: 1, discovered: 2, offline: 3 }
    const statusDiff = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3)
    if (statusDiff !== 0) return statusDiff
    return a.title.localeCompare(b.title)
  })
}

/**
 * Einheitliche System-Status-Abfrage über CentralDataHub
 * @returns {Object} System-Status-Informationen
 */
export function getSystemStatus() {
  const centralDataHub = useCentralDataHub()
  return {
    isSafeMode: centralDataHub.isSafeMode,
    connectionQuality: centralDataHub.getConnectionQuality,
    isKaiserMode: centralDataHub.isKaiserMode,
    isMobile: centralDataHub.isMobile,
    isTablet: centralDataHub.isTablet,
    displayMode: centralDataHub.getDisplayMode,
  }
}

/**
 * Einheitliche Konfigurations-Updates über CentralDataHub
 * @param {Object} config - Konfigurations-Objekt
 */
export function updateServerConfig(config) {
  const centralDataHub = useCentralDataHub()
  centralDataHub.updateServerConfig(config)
}

/**
 * Einheitliche Zone-Verwaltung über CentralDataHub
 * @param {string} espId - ESP-ID
 * @param {string} zoneName - Zone-Name
 */
export function setZoneForEsp(espId, zoneName) {
  const centralDataHub = useCentralDataHub()
  centralDataHub.setZoneForEsp(espId, zoneName)
}

/**
 * Einheitliche MQTT-Verbindung über CentralDataHub
 * @returns {Promise} Verbindungs-Ergebnis
 */
export async function connectToMqtt() {
  const centralDataHub = useCentralDataHub()
  return await centralDataHub.connectToMqtt()
}

/**
 * Einheitliche MQTT-Trennung über CentralDataHub
 * @returns {Promise} Trennungs-Ergebnis
 */
export async function disconnectFromMqtt() {
  const centralDataHub = useCentralDataHub()
  return await centralDataHub.disconnectFromMqtt()
}

/**
 * Einheitliche Sensor-Registrierung über CentralDataHub
 * @param {string} espId - ESP-ID
 * @param {number} gpio - GPIO-Pin
 * @param {Object} sensorData - Sensor-Daten
 */
export function registerSensor(espId, gpio, sensorData) {
  const centralDataHub = useCentralDataHub()
  centralDataHub.registerSensor(espId, gpio, sensorData)
}

/**
 * Einheitliche Sensor-Daten-Updates über CentralDataHub
 * @param {string} espId - ESP-ID
 * @param {number} gpio - GPIO-Pin
 * @param {Object} data - Update-Daten
 */
export function updateSensorData(espId, gpio, data) {
  const centralDataHub = useCentralDataHub()
  centralDataHub.updateSensorData(espId, gpio, data)
}

/**
 * Einheitliche Pi-Status-Abfrage über CentralDataHub
 * @returns {Promise} Pi-Status
 */
export async function checkPiStatus() {
  const centralDataHub = useCentralDataHub()
  return await centralDataHub.checkPiStatus()
}

/**
 * Einheitliche System-Neustart über CentralDataHub
 * @param {string} espId - ESP-ID
 * @returns {Promise} Neustart-Ergebnis
 */
export async function restartSystem(espId) {
  const centralDataHub = useCentralDataHub()
  return await centralDataHub.restartSystem(espId)
}

/**
 * Einheitlicher Notfall-Stopp über CentralDataHub
 * @returns {Promise} Notfall-Stopp-Ergebnis
 */
export async function emergencyStopAll() {
  const centralDataHub = useCentralDataHub()
  return await centralDataHub.emergencyStopAll()
}

/**
 * Einheitliche Cache-Bereinigung über CentralDataHub
 */
export function clearCache() {
  const centralDataHub = useCentralDataHub()
  centralDataHub.clearCache()
}

/**
 * Einheitliche UI-Konfiguration über CentralDataHub
 * @param {Object} config - UI-Konfiguration
 */
export function updateUiConfig(config) {
  const centralDataHub = useCentralDataHub()
  centralDataHub.updateUiConfig(config)
}

/**
 * Einheitliche Fehlerbehandlung über CentralDataHub
 * @param {Error} error - Fehler-Objekt
 * @param {string} context - Kontext
 */
export function handleError(error, context = 'unknown') {
  const centralDataHub = useCentralDataHub()
  centralDataHub.handleError(error, context)
}

/**
 * Hilfsfunktion für Status-Text-Konvertierung
 * @param {string} status - Status-Code
 * @returns {string} Benutzerfreundlicher Status-Text
 */
function getStatusText(status) {
  const statusMap = {
    online: 'Online',
    configured: 'Konfiguriert',
    discovered: 'Entdeckt',
    offline: 'Offline',
  }
  return statusMap[status] || 'Unbekannt'
}
