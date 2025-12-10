/**
 * MQTT Topic Utilities
 * Zentrale Stelle für Topic-Konstruktion und -Validierung
 */

/**
 * Erstellt die Basis-Topic-Struktur für einen Kaiser
 * @param {string} kaiserId - Die Kaiser-ID
 * @returns {string} Basis-Topic (z.B. "kaiser/raspberry_pi_central")
 */
export function getTopicBase(kaiserId) {
  if (!kaiserId || typeof kaiserId !== 'string') {
    throw new Error('Invalid kaiserId: must be a non-empty string')
  }

  // ✅ NEU: God Pi kann Kaiser-Rolle übernehmen
  if (kaiserId === 'raspberry_pi_central') {
    return `kaiser/${kaiserId}` // Gleiche Struktur wie Kaiser
  }

  return `kaiser/${kaiserId}`
}

/**
 * ✅ NEU: Erstellt die Basis-Topic-Struktur mit CentralConfig Integration
 * @param {Object} centralConfig - CentralConfig Store Instance
 * @returns {string} Basis-Topic basierend auf aktueller Konfiguration
 */
export function getCurrentTopicBase(centralConfig = null) {
  try {
    if (!centralConfig) {
      // Fallback wenn kein CentralConfig Store übergeben wird
      return 'kaiser/default_kaiser'
    }
    const kaiserId = centralConfig?.getCurrentKaiserId || 'default_kaiser'
    return getTopicBase(kaiserId)
  } catch (error) {
    console.warn('Error getting current topic base:', error.message)
    return 'kaiser/default_kaiser'
  }
}

/**
 * Erstellt ein vollständiges Topic für ESP-Kommunikation
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @param {string} suffix - Topic-Suffix (z.B. "actuator/5/command")
 * @returns {string} Vollständiges Topic
 */
export function buildTopic(kaiserId, espId, suffix) {
  if (!espId || typeof espId !== 'string') {
    throw new Error('Invalid espId: must be a non-empty string')
  }
  if (!suffix || typeof suffix !== 'string') {
    throw new Error('Invalid suffix: must be a non-empty string')
  }

  const base = getTopicBase(kaiserId)
  return `${base}/esp/${espId}/${suffix}`
}

/**
 * Erstellt ein Topic für Broadcast-Nachrichten
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} broadcastType - Broadcast-Typ (z.B. "emergency", "system_update")
 * @returns {string} Broadcast-Topic
 */
export function buildBroadcastTopic(kaiserId, broadcastType) {
  if (!broadcastType || typeof broadcastType !== 'string') {
    throw new Error('Invalid broadcastType: must be a non-empty string')
  }

  const base = getTopicBase(kaiserId)
  return `${base}/broadcast/${broadcastType}`
}

/**
 * Erstellt ein Topic für Discovery-Nachrichten
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} discoveryType - Discovery-Typ (z.B. "esp32_nodes")
 * @returns {string} Discovery-Topic
 */
export function buildDiscoveryTopic(kaiserId, discoveryType) {
  if (!discoveryType || typeof discoveryType !== 'string') {
    throw new Error('Invalid discoveryType: must be a non-empty string')
  }

  const base = getTopicBase(kaiserId)
  return `${base}/discovery/${discoveryType}`
}

/**
 * Erstellt ein Topic für Konfigurationsanfragen
 * @param {string} kaiserId - Die Kaiser-ID
 * @returns {string} Config-Request-Topic
 */
export function buildConfigRequestTopic(kaiserId) {
  const base = getTopicBase(kaiserId)
  return `${base}/config/request`
}

/**
 * Validiert ein Topic gegen die erwartete Struktur
 * @param {string} topic - Das zu validierende Topic
 * @param {string} kaiserId - Die erwartete Kaiser-ID
 * @returns {boolean} true wenn gültig
 */
export function validateTopic(topic, kaiserId) {
  if (!topic || typeof topic !== 'string') return false

  const expectedBase = getTopicBase(kaiserId)
  return topic.startsWith(expectedBase)
}

/**
 * Extrahiert ESP-ID aus einem Topic
 * @param {string} topic - Das Topic (z.B. "kaiser/pi/esp/esp32_001/status")
 * @returns {string|null} ESP-ID oder null
 */
export function extractEspIdFromTopic(topic) {
  if (!topic || typeof topic !== 'string') return null

  const parts = topic.split('/')
  if (parts.length >= 4 && parts[0] === 'kaiser' && parts[2] === 'esp') {
    return parts[3]
  }

  return null
}

/**
 * Erstellt alle Standard-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit allen Standard-Topics
 */
export function getStandardEspTopics(kaiserId, espId) {
  return {
    heartbeat: buildTopic(kaiserId, espId, 'heartbeat'),
    status: buildTopic(kaiserId, espId, 'status'),
    config: buildTopic(kaiserId, espId, 'config'),
    emergency: buildTopic(kaiserId, espId, 'emergency'),
    safeMode: buildTopic(kaiserId, espId, 'safe_mode'),
    systemCommand: buildTopic(kaiserId, espId, 'system/command'),
    systemResponse: buildTopic(kaiserId, espId, 'system/response'),
    // ✅ NEU: GPIO Conflict Response Topic
    gpioConflictResponse: buildTopic(kaiserId, espId, 'gpio/conflict/response'),
    zoneConfig: buildTopic(kaiserId, espId, 'zone/config'),
    zoneResponse: buildTopic(kaiserId, espId, 'zone/response'),
    subzoneConfig: buildTopic(kaiserId, espId, 'subzone/config'),
    subzoneResponse: buildTopic(kaiserId, espId, 'subzone/response'),
    healthBroadcast: buildTopic(kaiserId, espId, 'health/broadcast'),
    healthRequest: buildTopic(kaiserId, espId, 'health/request'),
    systemDiagnostics: buildTopic(kaiserId, espId, 'system/diagnostics'),
  }
}

/**
 * Erstellt alle Sensor-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit Sensor-Topics
 */
export function getSensorTopics(kaiserId, espId) {
  return {
    // Standard Sensor-Topics
    sensorData: buildTopic(kaiserId, espId, 'sensor/+/data'),
    sensorConfig: buildTopic(kaiserId, espId, 'sensor/config'),

    // Legacy Topics für Rückwärtskompatibilität
    legacySensorData: buildTopic(kaiserId, espId, 'sensor_data'),

    // Master-Zone Sensor-Topics
    masterZoneSensorData: `${getTopicBase(kaiserId)}/master/+/esp/${espId}/subzone/+/sensor/+/data`,
  }
}

/**
 * Erstellt alle Aktor-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit Aktor-Topics
 */
export function getActuatorTopics(kaiserId, espId) {
  return {
    actuatorStatus: buildTopic(kaiserId, espId, 'actuator/+/status'),
    actuatorCommand: buildTopic(kaiserId, espId, 'actuator/+/command'),
    actuatorAlert: buildTopic(kaiserId, espId, 'actuator/+/alert'),
    actuatorConfig: buildTopic(kaiserId, espId, 'actuator/config'),
  }
}

/**
 * Erstellt alle Pi-Integration-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @param {string} piId - Die Pi-ID (optional, Standard: "default")
 * @returns {Object} Objekt mit Pi-Topics
 */
export function getPiTopics(kaiserId, espId, piId = 'default') {
  return {
    piStatus: buildTopic(kaiserId, espId, `pi/${piId}/status`),
    piResponse: buildTopic(kaiserId, espId, `pi/${piId}/response`),
    piCommand: buildTopic(kaiserId, espId, `pi/${piId}/command`),
    piHealth: buildTopic(kaiserId, espId, `pi/${piId}/health`),
    piSensorStatistics: buildTopic(kaiserId, espId, `pi/${piId}/sensor/+/statistics`),
    piLibraryResponse: buildTopic(kaiserId, espId, `pi/${piId}/library/+/response`),
  }
}

/**
 * Erstellt alle Library-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit Library-Topics
 */
export function getLibraryTopics(kaiserId, espId) {
  return {
    libraryReady: buildTopic(kaiserId, espId, 'library/ready'),
    libraryInstalled: buildTopic(kaiserId, espId, 'library/installed'),
    libraryRequest: buildTopic(kaiserId, espId, 'library/request'),
    libraryError: buildTopic(kaiserId, espId, 'library/error'),
  }
}

/**
 * Erstellt alle Error-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit Error-Topics
 */
export function getErrorTopics(kaiserId, espId) {
  return {
    errorAlert: buildTopic(kaiserId, espId, 'alert/error'),
    errorAcknowledge: buildTopic(kaiserId, espId, 'error/acknowledge'),
  }
}

/**
 * Erstellt alle Emergency-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit Emergency-Topics
 */
export function getEmergencyTopics(kaiserId, espId) {
  return {
    emergency: buildTopic(kaiserId, espId, 'emergency'),
    emergencyStop: buildTopic(kaiserId, espId, 'emergency/stop'),
    emergencyClear: buildTopic(kaiserId, espId, 'emergency/clear'),
    emergencyStatus: buildTopic(kaiserId, espId, 'emergency/status'),
  }
}

/**
 * Erstellt alle System-Diagnostic-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit System-Topics
 */
export function getSystemTopics(kaiserId, espId) {
  return {
    systemDiagnostics: buildTopic(kaiserId, espId, 'system/diagnostics'),
    systemHealth: buildTopic(kaiserId, espId, 'system/health'),
    systemStatus: buildTopic(kaiserId, espId, 'system/status'),
    systemCommand: buildTopic(kaiserId, espId, 'system/command'),
    systemResponse: buildTopic(kaiserId, espId, 'system/response'),
  }
}

/**
 * Erstellt alle Zone-Management-Topics für einen ESP
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {Object} Objekt mit Zone-Topics
 */
export function getZoneTopics(kaiserId, espId) {
  return {
    zoneConfig: buildTopic(kaiserId, espId, 'zone/config'),
    zoneResponse: buildTopic(kaiserId, espId, 'zone/response'),
    subzoneConfig: buildTopic(kaiserId, espId, 'subzone/config'),
    subzoneResponse: buildTopic(kaiserId, espId, 'subzone/response'),
  }
}

/**
 * Erstellt alle Discovery-Topics für einen Kaiser
 * @param {string} kaiserId - Die Kaiser-ID
 * @returns {Object} Objekt mit Discovery-Topics
 */
export function getDiscoveryTopics(kaiserId) {
  return {
    esp32Discovery: buildDiscoveryTopic(kaiserId, 'esp32_nodes'),
    kaiserConfig: buildConfigRequestTopic(kaiserId),
  }
}

/**
 * Erstellt alle Broadcast-Topics für einen Kaiser
 * @param {string} kaiserId - Die Kaiser-ID
 * @returns {Object} Objekt mit Broadcast-Topics
 */
export function getBroadcastTopics(kaiserId) {
  return {
    emergency: buildBroadcastTopic(kaiserId, 'emergency'),
    systemUpdate: buildBroadcastTopic(kaiserId, 'system_update'),
  }
}

/**
 * ✅ NEU: Normalisiert Sensor-Payload für Server-Kompatibilität
 * @param {Object} payload - Roher Sensor-Payload
 * @returns {Object} Normalisierter Payload
 */
export function normalizeSensorPayload(payload) {
  // ✅ KONSISTENT: Prüfe auf verschachtelte Struktur (Server-Format)
  if (payload.sensor && typeof payload.sensor === 'object') {
    return {
      esp_id: payload.esp_id,
      gpio: payload.sensor.gpio,
      sensor_type: payload.sensor.sensor_type,
      raw_data: payload.sensor.raw_data,
      timestamp: payload.sensor.timestamp,
      iso_timestamp: payload.sensor.iso_timestamp,
      quality: payload.sensor.quality,
      warnings: payload.sensor.warnings || [],
      context: payload.sensor.context,
      subzone_id: payload.sensor.subzone_id,
      kaiser_id: payload.sensor.kaiser_id,
      // ✅ KONSISTENT: Backend v3.5.0 Felder
      raw_value: payload.sensor.raw_value,
      raw_mode: payload.sensor.raw_mode || false,
      hardware_mode: payload.sensor.hardware_mode || false,
      time_quality: payload.sensor.time_quality || 'unknown',
    }
  }

  // ✅ KONSISTENT: Flache Struktur - direkt verwenden
  return {
    esp_id: payload.esp_id,
    gpio: payload.gpio,
    sensor_type: payload.sensor_type || payload.type,
    raw_data: payload.raw_data || payload.value,
    timestamp: payload.timestamp || Date.now(),
    iso_timestamp: payload.iso_timestamp,
    quality: payload.quality || 'unknown',
    warnings: payload.warnings || [],
    context: payload.context,
    subzone_id: payload.subzone_id,
    kaiser_id: payload.kaiser_id,
    // ✅ KONSISTENT: Backend v3.5.0 Felder
    raw_value: payload.raw_value,
    raw_mode: payload.raw_mode || false,
    hardware_mode: payload.hardware_mode || false,
    time_quality: payload.time_quality || 'unknown',
  }
}

/**
 * ✅ ERWEITERT: Validiert Sensor-Payload gegen Server-Erwartungen
 * @param {Object} payload - Zu validierender Payload
 * @returns {Object} { isValid: boolean, errors: Array }
 */
export function validateSensorPayload(payload) {
  const errors = []

  // ✅ KONSISTENT: Basis-Validierung
  if (!payload.esp_id) errors.push('esp_id is required')
  if (!payload.gpio && !payload.sensor?.gpio) errors.push('gpio is required')
  if (!payload.sensor_type && !payload.type && !payload.sensor?.sensor_type) {
    errors.push('sensor_type is required')
  }

  // ✅ ERWEITERT: Server-spezifische Validierung
  const validSensorTypes = [
    'temperature',
    'humidity',
    'ph',
    'ec',
    'moisture',
    'pressure',
    'co2',
    'light',
    'flow',
    'SENSOR_CUSTOM_PI_ENHANCED',
    // ✅ KONSISTENT: Frontend Sensor-Typen
    'SENSOR_TEMP_DS18B20',
    'SENSOR_MOISTURE',
    'SENSOR_FLOW',
    'SENSOR_PH_DFROBOT',
    'SENSOR_EC_GENERIC',
    'SENSOR_PRESSURE',
    'SENSOR_CO2',
    'SENSOR_AIR_QUALITY',
  ]

  const sensorType = payload.sensor_type || payload.type || payload.sensor?.sensor_type
  if (sensorType && !validSensorTypes.includes(sensorType)) {
    errors.push(`Invalid sensor_type: ${sensorType}`)
  }

  // ✅ NEU: Backend v3.5.0 Feld-Validierung
  if (payload.raw_mode !== undefined && typeof payload.raw_mode !== 'boolean') {
    errors.push('raw_mode must be boolean')
  }

  if (payload.hardware_mode !== undefined && typeof payload.hardware_mode !== 'boolean') {
    errors.push('hardware_mode must be boolean')
  }

  if (payload.time_quality && !['good', 'poor', 'unknown'].includes(payload.time_quality)) {
    errors.push('time_quality must be one of: good, poor, unknown')
  }

  // ✅ NEU: Datentyp-Validierung
  if (payload.raw_data !== undefined && typeof payload.raw_data !== 'number') {
    errors.push('raw_data must be a number')
  }

  if (payload.raw_value !== undefined && typeof payload.raw_value !== 'number') {
    errors.push('raw_value must be a number')
  }

  if (payload.timestamp !== undefined && typeof payload.timestamp !== 'number') {
    errors.push('timestamp must be a number')
  }

  // ✅ NEU: Array-Validierung
  if (payload.warnings && !Array.isArray(payload.warnings)) {
    errors.push('warnings must be an array')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// ✅ LÖSUNG: Parameter-basierte Topics für Publishes
/**
 * Erstellt ein Sensor-Topic für spezifische GPIO
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @param {number} gpio - Die GPIO-Nummer
 * @returns {string} Sensor-Topic für Publishes
 */
export function buildSensorTopic(kaiserId, espId, gpio) {
  return `kaiser/${kaiserId}/esp/${espId}/sensor/${gpio}/data`
}

/**
 * Erstellt ein Aktor-Topic für spezifische GPIO
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @param {number} gpio - Die GPIO-Nummer
 * @returns {string} Aktor-Topic für Publishes
 */
export function buildActuatorTopic(kaiserId, espId, gpio) {
  return `kaiser/${kaiserId}/esp/${espId}/actuator/${gpio}/status`
}

// ✅ LÖSUNG: Wildcard-Topics für Subscribes
/**
 * Erstellt ein Sensor-Wildcard-Topic für Subscribes
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {string} Sensor-Wildcard-Topic für Subscribes
 */
export function buildSensorWildcardTopic(kaiserId, espId) {
  return `kaiser/${kaiserId}/esp/${espId}/sensor/+/data`
}

/**
 * Erstellt ein Aktor-Wildcard-Topic für Subscribes
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} espId - Die ESP-ID
 * @returns {string} Aktor-Wildcard-Topic für Subscribes
 */
export function buildActuatorWildcardTopic(kaiserId, espId) {
  return `kaiser/${kaiserId}/esp/${espId}/actuator/+/status`
}

/**
 * Erstellt ein Master-Zone-Topic für Cross-Kaiser-Kommunikation
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} masterZoneId - Die Master-Zone-ID
 * @param {string} espId - Die ESP-ID
 * @param {string} subzoneId - Die Subzone-ID
 * @param {number} gpio - Die GPIO-Nummer
 * @returns {string} Master-Zone-Topic
 */
export function buildMasterZoneTopic(kaiserId, masterZoneId, espId, subzoneId, gpio) {
  return `kaiser/${kaiserId}/master/${masterZoneId}/esp/${espId}/subzone/${subzoneId}/sensor/${gpio}/data`
}

/**
 * Erstellt ein Master-Zone-Wildcard-Topic für Subscribes
 * @param {string} kaiserId - Die Kaiser-ID
 * @param {string} masterZoneId - Die Master-Zone-ID
 * @param {string} espId - Die ESP-ID
 * @param {string} subzoneId - Die Subzone-ID
 * @returns {string} Master-Zone-Wildcard-Topic
 */
export function buildMasterZoneWildcardTopic(kaiserId, masterZoneId, espId, subzoneId) {
  return `kaiser/${kaiserId}/master/${masterZoneId}/esp/${espId}/subzone/${subzoneId}/sensor/+/data`
}
