import { useCentralDataHub } from '@/stores/centralDataHub'

/**
 * Einheitlicher UI-Hilfsmodul für ESP-Device-Optionen
 * Wird von allen Komponenten verwendet, um konsistente ESP-Auswahllisten zu generieren
 * ✅ KONSOLIDIERT: Nutzt CentralDataHub für einheitliche Store-Zugriffe
 */

/**
 * Generiert einheitliche ESP-Device-Optionen für UI-Komponenten
 * @returns {Array} Array von ESP-Device-Optionen für v-select Komponenten
 */
export function getEspDeviceOptions() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const options = []

  for (const [espId, device] of mqttStore.espDevices.entries()) {
    const status = device.status || 'offline'
    const friendlyName = device.espFriendlyName || device.espUsername || espId
    const zone = device.espZone || 'Unbekannt'

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
 * Generiert ESP-Device-Optionen mit erweiterten Informationen
 * @returns {Array} Array von ESP-Device-Optionen mit zusätzlichen Metadaten
 */
export function getEspDeviceOptionsExtended() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const options = []

  for (const [espId, device] of mqttStore.espDevices.entries()) {
    const status = device.status || 'offline'
    const friendlyName = device.espFriendlyName || device.espUsername || espId
    const zone = device.espZone || 'Unbekannt'

    options.push({
      value: espId,
      title: friendlyName,
      subtitle: `${zone} • ${getStatusText(status)}`,
      status: status,
      zone: zone,
      friendlyName: friendlyName,
      espUsername: device.espUsername,
      lastHeartbeat: device.lastHeartbeat,
      connectionEstablished: device.connectionEstablished,
      boardType: device.board_type || device.boardType,
      chipModel: device.chipModel,
      firmwareVersion: device.firmware_version || device.firmwareVersion,
      serverAddress: device.server_address || device.serverAddress,
      httpPort: device.httpPort,
      brokerIp: device.brokerIp,
      brokerPort: device.brokerPort,
      freeHeap: device.freeHeap,
      uptime: device.uptime,
      activeSensors: device.activeSensors,
      masterZone: device.masterZone,
      isMaster: device.isMaster,
      state: device.state,
      lastUpdate: device.lastUpdate,
    })
  }

  return options.sort((a, b) => {
    const statusOrder = { online: 0, configured: 1, discovered: 2, offline: 3 }
    const statusDiff = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3)
    if (statusDiff !== 0) return statusDiff
    return a.title.localeCompare(b.title)
  })
}

/**
 * Konvertiert Status-Code in benutzerfreundlichen Text
 * @param {string} status - Status-Code
 * @returns {string} Benutzerfreundlicher Status-Text
 */
export function getStatusText(status) {
  const statusMap = {
    online: 'Online',
    configured: 'Konfiguriert',
    discovered: 'Entdeckt',
    offline: 'Offline',
  }
  return statusMap[status] || 'Unbekannt'
}

/**
 * Konvertiert Status-Code in Vuetify-Farbe
 * @param {string} status - Status-Code
 * @returns {string} Vuetify-Farbe
 */
export function getStatusColor(status) {
  const colorMap = {
    online: 'success',
    configured: 'info',
    discovered: 'warning',
    offline: 'error',
  }
  return colorMap[status] || 'grey'
}

/**
 * Konvertiert Status-Code in Vuetify-Icon
 * @param {string} status - Status-Code
 * @returns {string} Vuetify-Icon
 */
export function getStatusIcon(status) {
  const iconMap = {
    online: 'mdi-wifi',
    configured: 'mdi-check-circle',
    discovered: 'mdi-radar',
    offline: 'mdi-wifi-off',
  }
  return iconMap[status] || 'mdi-help-circle'
}

/**
 * Prüft, ob ein ESP-Device online ist
 * @param {string} espId - ESP-ID
 * @returns {boolean} True wenn online
 */
export function isEspOnline(espId) {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const device = mqttStore.espDevices.get(espId)
  return device?.status === 'online'
}

/**
 * Prüft, ob ein ESP-Device konfiguriert ist
 * @param {string} espId - ESP-ID
 * @returns {boolean} True wenn konfiguriert
 */
export function isEspConfigured(espId) {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const device = mqttStore.espDevices.get(espId)
  return device?.status === 'configured' || device?.status === 'online'
}

/**
 * Prüft, ob ein ESP-Device entdeckt wurde
 * @param {string} espId - ESP-ID
 * @returns {boolean} True wenn entdeckt
 */
export function isEspDiscovered(espId) {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const device = mqttStore.espDevices.get(espId)
  return (
    device?.status === 'discovered' ||
    device?.status === 'configured' ||
    device?.status === 'online'
  )
}

/**
 * Formatiert den letzten Heartbeat als relative Zeit
 * @param {number} lastHeartbeat - Timestamp des letzten Heartbeats
 * @returns {string} Formatierte relative Zeit
 */
export function formatLastHeartbeat(lastHeartbeat) {
  if (!lastHeartbeat) return 'Nie'

  const now = Date.now()
  const diff = now - lastHeartbeat

  if (diff < 60000) return 'Gerade eben'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return `${Math.floor(diff / 86400000)}d`
}

/**
 * Prüft, ob ein ESP-Device einen gültigen Heartbeat hat (nicht älter als 5 Minuten)
 * @param {string} espId - ESP-ID
 * @returns {boolean} True wenn Heartbeat gültig
 */
export function hasValidHeartbeat(espId) {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const device = mqttStore.espDevices.get(espId)
  if (!device?.lastHeartbeat) return false

  const now = Date.now()
  const diff = now - device.lastHeartbeat
  return diff < 5 * 60 * 1000 // 5 Minuten
}

/**
 * Filtert ESP-Devices nach Status
 * @param {string} status - Status zum Filtern
 * @returns {Array} Gefilterte ESP-Device-Optionen
 */
export function getEspDevicesByStatus(status) {
  return getEspDeviceOptions().filter((option) => option.status === status)
}

/**
 * Filtert ESP-Devices nach Zone
 * @param {string} zone - Zone zum Filtern
 * @returns {Array} Gefilterte ESP-Device-Optionen
 */
export function getEspDevicesByZone(zone) {
  return getEspDeviceOptions().filter((option) => option.zone === zone)
}

/**
 * Gibt die Anzahl der ESP-Devices pro Status zurück
 * @returns {Object} Anzahl pro Status
 */
export function getEspDeviceCounts() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const counts = { online: 0, configured: 0, discovered: 0, offline: 0, total: 0 }

  for (const device of mqttStore.espDevices.values()) {
    const status = device.status || 'offline'
    counts[status] = (counts[status] || 0) + 1
    counts.total += 1
  }

  return counts
}

/**
 * ✅ NEU: Zentrale ESP-Device-Abfrage
 * @param {string} espId - ESP-ID
 * @returns {Object|null} ESP-Device oder null
 */
export function getEspDevice(espId) {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  return mqttStore.espDevices.get(espId) || null
}

/**
 * ✅ NEU: Zentrale ESP-Device-Liste
 * @returns {Array} Array aller ESP-Devices
 */
export function getAllEspDevices() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  return Array.from(mqttStore.espDevices.values())
}

/**
 * ✅ NEU: Zentrale ESP-ID-Liste
 * @returns {Array} Array aller ESP-IDs
 */
export function getAllEspIds() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  return Array.from(mqttStore.espDevices.keys())
}

/**
 * ✅ NEU: Gruppiert ESP-Devices nach Zonen
 * @param {Array} espIds - Array von ESP-IDs zu gruppieren
 * @returns {Object} Gruppierte Devices nach Zonen
 */
export function groupDevicesByZone(espIds) {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const groupedDevices = {}

  // Standard-Zone für unkonfigurierte Geräte
  const unconfiguredZone = '🕳️ Unkonfiguriert'

  espIds.forEach((espId) => {
    const device = mqttStore.espDevices.get(espId)
    if (!device) return

    // Verwende device.zone oder Fallback auf unkonfiguriert
    const zone = device.zone || unconfiguredZone

    if (!groupedDevices[zone]) {
      groupedDevices[zone] = []
    }

    groupedDevices[zone].push(espId)
  })

  // Sortiere Zonen: Unkonfiguriert immer am Ende
  const sortedZones = Object.keys(groupedDevices).sort((a, b) => {
    if (a === unconfiguredZone) return 1
    if (b === unconfiguredZone) return -1
    return a.localeCompare(b)
  })

  // Erstelle sortiertes Ergebnis
  const result = {}
  sortedZones.forEach((zone) => {
    result[zone] = groupedDevices[zone]
  })

  return result
}

/**
 * ✅ NEU: Gibt alle verfügbaren Zonen zurück
 * @returns {Array} Array aller Zonen-Namen
 */
export function getAllZones() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const zones = new Set()

  for (const device of mqttStore.espDevices.values()) {
    if (device.zone) {
      zones.add(device.zone)
    }
  }

  return Array.from(zones).sort()
}

/**
 * ✅ NEU: Prüft, ob ein ESP-Device kürzlich die Zone gewechselt hat
 * @param {string} espId - ESP-ID
 * @param {string} lastMovedEspId - ID des zuletzt verschobenen Geräts
 * @returns {boolean} True wenn das Gerät kürzlich verschoben wurde
 */
export function isRecentlyMoved(espId, lastMovedEspId) {
  return espId === lastMovedEspId
}

/**
 * ✅ NEU: Normalisiert Zonennamen für konsistente Behandlung
 * @param {string} zoneName - Roher Zonenname
 * @returns {string} Normalisierter Zonenname (trimmed, lowercase)
 */
export function normalizeZoneName(zoneName) {
  if (!zoneName) return ''
  return zoneName.trim().toLowerCase()
}

/**
 * ✅ NEU: Prüft auf doppelte Zonen (case-insensitive)
 * @param {Array} zones - Array von Zonennamen
 * @returns {Array} Array von Duplikaten mit Details
 */
export function findDuplicateZones(zones) {
  const normalized = zones.map(normalizeZoneName)
  const duplicates = []

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      if (normalized[i] === normalized[j] && normalized[i] !== '') {
        duplicates.push({
          original1: zones[i],
          original2: zones[j],
          normalized: normalized[i],
        })
      }
    }
  }

  return duplicates
}

/**
 * ✅ NEU: Validiert Zonennamen
 * @param {string} zoneName - Zonename zu validieren
 * @returns {Object} Validierungsergebnis { isValid: boolean, error: string|null }
 */
export function validateZoneName(zoneName) {
  const normalized = normalizeZoneName(zoneName)

  if (!normalized) {
    return { isValid: false, error: 'Zonename darf nicht leer sein' }
  }

  if (normalized.length < 2) {
    return { isValid: false, error: 'Zonename muss mindestens 2 Zeichen lang sein' }
  }

  if (normalized.length > 50) {
    return { isValid: false, error: 'Zonename darf maximal 50 Zeichen lang sein' }
  }

  // Prüfe auf ungültige Zeichen
  const invalidChars = /[<>:"/\\|?*]/
  if (invalidChars.test(zoneName)) {
    return { isValid: false, error: 'Zonename enthält ungültige Zeichen' }
  }

  // Prüfe auf reservierte Namen
  const reservedNames = ['default', 'null', 'undefined', 'unkonfiguriert', 'unassigned']
  if (reservedNames.includes(normalized)) {
    return { isValid: false, error: 'Zonename ist reserviert' }
  }

  return { isValid: true, error: null }
}

/**
 * ✅ NEU: Exportiert Zone-Mapping als JSON
 * @returns {Object} Mapping von ESP-ID zu Zone
 */
export function exportZoneMapping() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const mapping = {}

  for (const [espId, device] of mqttStore.espDevices.entries()) {
    mapping[espId] = device.zone || '🕳️ Unkonfiguriert'
  }

  return mapping
}

/**
 * ✅ NEU: Importiert Zone-Mapping
 * @param {Object} mapping - Mapping von ESP-ID zu Zone
 * @returns {Object} Ergebnis { success: boolean, errors: Array, imported: number }
 */
export function importZoneMapping(mapping) {
  const centralDataHub = useCentralDataHub()
  const mqttStore = centralDataHub.mqttStore
  const result = { success: true, errors: [], imported: 0 }

  for (const [espId, zoneName] of Object.entries(mapping)) {
    // Validiere ESP-ID
    if (!mqttStore.espDevices.has(espId)) {
      result.errors.push(`ESP ${espId} nicht gefunden`)
      result.success = false
      continue
    }

    // Validiere Zonename
    const validation = validateZoneName(zoneName)
    if (!validation.isValid) {
      result.errors.push(`Ungültiger Zonename für ESP ${espId}: ${validation.error}`)
      result.success = false
      continue
    }

    // Wende Zone an
    const device = mqttStore.espDevices.get(espId)
    device.zone = zoneName
    result.imported++
  }

  return result
}

// ✅ NEU: Sensor-Key-Parsing Utilities für Cross-ESP-Logik
export const parseSensorKey = (sensorKey) => {
  const [espId, gpio] = sensorKey.split('-')
  return { espId, gpio: parseInt(gpio) }
}

export const buildSensorKey = (espId, gpio) => {
  return `${espId}-${gpio}`
}

export const isCrossEspReference = (sensorReference, actuatorEspId) => {
  if (!sensorReference || !sensorReference.espId) return false
  return sensorReference.espId !== actuatorEspId
}

export const getSensorReference = (condition) => {
  // ✅ NEU: Unterstützt sowohl altes (sensorGpio) als auch neues (sensorReference) Format
  if (condition.sensorReference) {
    return condition.sensorReference
  }

  // Fallback für Rückwärtskompatibilität
  if (condition.sensorGpio !== undefined) {
    return { espId: null, gpio: condition.sensorGpio } // espId wird später gesetzt
  }

  return null
}

export const migrateConditionToSensorReference = (condition, actuatorEspId) => {
  if (condition.sensorReference) {
    return condition // Bereits migriert
  }

  if (condition.sensorGpio !== undefined) {
    return {
      ...condition,
      sensorReference: { espId: actuatorEspId, gpio: condition.sensorGpio },
      sensorGpio: undefined, // Entfernen für Rückwärtskompatibilität
    }
  }

  return condition
}

export const findCompatibleSensors = (sourceSensor, targetEspId, sensorRegistry) => {
  if (!sourceSensor) return []

  const targetSensors = sensorRegistry.getSensorsByEsp(targetEspId)

  return targetSensors.filter((targetSensor) => {
    // Gleicher Sensor-Typ
    if (targetSensor.type !== sourceSensor.type) return false

    // Ähnlicher Name (optional)
    if (sourceSensor.name && targetSensor.name) {
      const sourceName = sourceSensor.name.toLowerCase()
      const targetName = targetSensor.name.toLowerCase()
      if (sourceName.includes('temp') && targetName.includes('temp')) return true
      if (sourceName.includes('feucht') && targetName.includes('feucht')) return true
      if (sourceName.includes('licht') && targetName.includes('licht')) return true
    }

    // Gleiche Einheit
    if (sourceSensor.unit && targetSensor.unit) {
      if (sourceSensor.unit === targetSensor.unit) return true
    }

    return false
  })
}

export const suggestSensorMapping = (sourceLogic, targetEspId, sensorRegistry) => {
  const suggestions = []

  if (!sourceLogic.conditions) return suggestions

  sourceLogic.conditions.forEach((condition, index) => {
    const sensorRef = getSensorReference(condition)
    if (!sensorRef || !sensorRef.espId) return

    const sourceSensor = sensorRegistry.getSensor(sensorRef.espId, sensorRef.gpio)
    if (!sourceSensor) return

    const compatibleSensors = findCompatibleSensors(sourceSensor, targetEspId, sensorRegistry)

    if (compatibleSensors.length > 0) {
      suggestions.push({
        conditionIndex: index,
        sourceSensor,
        compatibleSensors,
        recommended: compatibleSensors[0], // Erste Übereinstimmung als Empfehlung
      })
    }
  })

  return suggestions
}
