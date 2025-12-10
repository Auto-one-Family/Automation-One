// ✅ NEU: System Health Utilities für erweiterte Systeminformationen
// Kompatibel mit bestehenden MQTT Store Strukturen

/**
 * CPU-Auslastung Status und Farbe basierend auf ESP Health Data
 * @param {number} cpuUsage - CPU-Auslastung in Prozent
 * @returns {string} Vuetify Farbe
 */
export function getCpuUsageColor(cpuUsage) {
  if (cpuUsage === undefined || cpuUsage === null) return 'grey'
  if (cpuUsage < 50) return 'success'
  if (cpuUsage < 80) return 'warning'
  return 'error'
}

/**
 * CPU-Auslastung Status Text
 * @param {number} cpuUsage - CPU-Auslastung in Prozent
 * @returns {string} Status Text
 */
export function getCpuUsageStatus(cpuUsage) {
  if (cpuUsage === undefined || cpuUsage === null) return 'Unbekannt'
  if (cpuUsage < 30) return 'Optimal'
  if (cpuUsage < 60) return 'Normal'
  if (cpuUsage < 80) return 'Hoch'
  return 'Kritisch'
}

/**
 * CPU-Auslastung Beschreibung für Tooltips
 * @param {number} cpuUsage - CPU-Auslastung in Prozent
 * @returns {string} Beschreibung
 */
export function getCpuUsageDescription(cpuUsage) {
  if (cpuUsage === undefined || cpuUsage === null) return 'CPU-Auslastung nicht verfügbar'
  if (cpuUsage < 30) return 'System läuft optimal'
  if (cpuUsage < 60) return 'Normale Systemauslastung'
  if (cpuUsage < 80) return 'Erhöhte Systemauslastung'
  return 'Kritische Systemauslastung - Überprüfung empfohlen'
}

/**
 * Speicher Status und Farbe basierend auf ESP Health Data
 * @param {number} freeHeap - Freier Speicher in Bytes
 * @returns {string} Vuetify Farbe
 */
export function getMemoryColor(freeHeap) {
  if (freeHeap === undefined || freeHeap === null) return 'grey'
  if (freeHeap > 100000) return 'success'
  if (freeHeap > 50000) return 'warning'
  return 'error'
}

/**
 * Speicher Status Text
 * @param {number} freeHeap - Freier Speicher in Bytes
 * @returns {string} Status Text
 */
export function getMemoryStatus(freeHeap) {
  if (freeHeap === undefined || freeHeap === null) return 'Unbekannt'
  if (freeHeap > 100000) return 'Ausreichend'
  if (freeHeap > 50000) return 'Warnung'
  return 'Kritisch'
}

/**
 * Speicher Beschreibung für Tooltips
 * @param {number} freeHeap - Freier Speicher in Bytes
 * @returns {string} Beschreibung
 */
export function getMemoryDescription(freeHeap) {
  if (freeHeap === undefined || freeHeap === null) return 'Speicherinformation nicht verfügbar'
  if (freeHeap > 100000) return 'Ausreichend freier Speicher'
  if (freeHeap > 50000) return 'Speicher wird knapp'
  return 'Kritisch wenig Speicher - Neustart empfohlen'
}

/**
 * Laufzeit Status und Farbe
 * @param {number} uptime - Laufzeit in Sekunden
 * @returns {string} Vuetify Farbe
 */
export function getUptimeColor(uptime) {
  if (uptime === undefined || uptime === null) return 'grey'
  if (uptime > 86400) return 'success' // > 1 Tag
  if (uptime > 3600) return 'warning' // > 1 Stunde
  return 'info'
}

/**
 * Laufzeit Status Text
 * @param {number} uptime - Laufzeit in Sekunden
 * @returns {string} Status Text
 */
export function getUptimeStatus(uptime) {
  if (uptime === undefined || uptime === null) return 'Unbekannt'
  if (uptime > 86400) return 'Stabil'
  if (uptime > 3600) return 'Läuft'
  return 'Gestartet'
}

/**
 * Laufzeit Beschreibung für Tooltips
 * @param {number} uptime - Laufzeit in Sekunden
 * @returns {string} Beschreibung
 */
export function getUptimeDescription(uptime) {
  if (uptime === undefined || uptime === null) return 'Laufzeitinformation nicht verfügbar'
  if (uptime > 86400) return 'System läuft stabil seit über einem Tag'
  if (uptime > 3600) return 'System läuft seit über einer Stunde'
  return 'System kürzlich gestartet'
}

/**
 * Bytes in lesbares Format konvertieren
 * @param {number} bytes - Bytes
 * @returns {string} Formatierte Bytes
 */
export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Laufzeit in lesbares Format konvertieren
 * @param {number} uptimeSeconds - Laufzeit in Sekunden
 * @returns {string} Formatierte Laufzeit
 */
export function formatUptime(uptimeSeconds) {
  if (uptimeSeconds === undefined || uptimeSeconds === null) return 'Unbekannt'

  const days = Math.floor(uptimeSeconds / 86400)
  const hours = Math.floor((uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}

/**
 * System-Status Beschreibung
 * @param {string} state - System-Status
 * @returns {string} Beschreibung
 */
export function getSystemStateDescription(state) {
  const descriptions = {
    OPERATIONAL: 'System läuft normal',
    WIFI_SETUP: 'WiFi-Konfiguration aktiv',
    MQTT_CONNECTING: 'Verbindung wird hergestellt',
    ERROR: 'Systemfehler erkannt',
    BOOT: 'System startet',
    LIBRARY_DOWNLOADING: 'Bibliotheken werden geladen',
  }
  return descriptions[state] || 'Unbekannter Status'
}

/**
 * Update Status basierend auf letzter Aktualisierung
 * @param {number} lastUpdate - Timestamp der letzten Aktualisierung
 * @returns {string} Status Text
 */
export function getUpdateStatus(lastUpdate) {
  if (!lastUpdate) return 'Nie'

  const now = Date.now()
  const diff = now - lastUpdate

  if (diff < 30000) return 'Aktuell' // < 30 Sekunden
  if (diff < 300000) return 'Verzögert' // < 5 Minuten
  return 'Veraltet'
}

/**
 * Update Status Farbe
 * @param {number} lastUpdate - Timestamp der letzten Aktualisierung
 * @returns {string} Vuetify Farbe
 */
export function getUpdateStatusColor(lastUpdate) {
  if (!lastUpdate) return 'error'

  const now = Date.now()
  const diff = now - lastUpdate

  if (diff < 30000) return 'success' // < 30 Sekunden
  if (diff < 300000) return 'warning' // < 5 Minuten
  return 'error'
}

// ✅ NEU: Pi-spezifische Utilities

/**
 * Pi CPU Status Text
 * @param {number} cpu - CPU-Auslastung in Prozent
 * @returns {string} Status Text
 */
export function getPiCpuStatus(cpu) {
  if (cpu === undefined || cpu === null) return 'Unbekannt'
  if (cpu < 30) return 'Optimal'
  if (cpu < 70) return 'Normal'
  if (cpu < 90) return 'Hoch'
  return 'Kritisch'
}

/**
 * Pi Speicher Status Text
 * @param {number} memory - Speicherauslastung in Prozent
 * @returns {string} Status Text
 */
export function getPiMemoryStatus(memory) {
  if (memory === undefined || memory === null) return 'Unbekannt'
  if (memory < 50) return 'Ausreichend'
  if (memory < 80) return 'Warnung'
  return 'Kritisch'
}

/**
 * Pi Laufzeit Status Text
 * @param {number} uptime - Laufzeit in Sekunden
 * @returns {string} Status Text
 */
export function getPiUptimeStatus(uptime) {
  if (uptime === undefined || uptime === null) return 'Unbekannt'
  if (uptime > 604800) return 'Sehr stabil' // > 1 Woche
  if (uptime > 86400) return 'Stabil' // > 1 Tag
  if (uptime > 3600) return 'Läuft' // > 1 Stunde
  return 'Gestartet'
}

/**
 * Pi Status Beschreibung
 * @param {string} status - Pi Status
 * @returns {string} Beschreibung
 */
export function getPiStatusDescription(status) {
  const descriptions = {
    online: 'Pi ist erreichbar',
    offline: 'Pi ist nicht erreichbar',
    unknown: 'Status unbekannt',
  }
  return descriptions[status] || 'Unbekannter Status'
}

/**
 * Statistik Farbe basierend auf Anzahl
 * @param {number} count - Anzahl
 * @returns {string} Vuetify Farbe
 */
export function getStatColor(count) {
  if (count === undefined || count === null) return 'grey'
  if (count > 10) return 'success'
  if (count > 5) return 'warning'
  return 'info'
}

/**
 * ESP Health Score berechnen basierend auf verfügbaren Daten
 * @param {Object} device - ESP Device Object aus MQTT Store
 * @returns {number} Health Score (0-100)
 */
export function calculateEspHealthScore(device) {
  if (!device) return 0

  let score = 100
  let factors = 0

  // CPU-Auslastung
  if (device.health?.cpuUsagePercent !== undefined) {
    factors++
    if (device.health.cpuUsagePercent > 80) score -= 30
    else if (device.health.cpuUsagePercent > 60) score -= 15
    else if (device.health.cpuUsagePercent > 40) score -= 5
  }

  // Speicher
  if (device.health?.freeHeapCurrent !== undefined) {
    factors++
    if (device.health.freeHeapCurrent < 50000) score -= 25
    else if (device.health.freeHeapCurrent < 100000) score -= 10
  }

  // Laufzeit
  if (device.health?.uptimeSeconds !== undefined) {
    factors++
    if (device.health.uptimeSeconds < 300) score -= 20 // < 5 Minuten
  }

  // Netzwerk
  if (device.network?.wifiConnected === false) {
    factors++
    score -= 40
  }

  if (device.network?.mqttConnected === false) {
    factors++
    score -= 30
  }

  // Safe Mode
  if (device.safeMode === true) {
    factors++
    score -= 20
  }

  // Fehler
  if (device.errors?.totalErrors > 0) {
    factors++
    score -= Math.min(device.errors.totalErrors * 5, 30)
  }

  // Normalisiere Score basierend auf verfügbaren Faktoren
  return factors > 0 ? Math.max(0, Math.round(score / factors)) : 100
}

/**
 * ESP Health Status basierend auf Score
 * @param {number} score - Health Score (0-100)
 * @returns {string} Status
 */
export function getEspHealthStatus(score) {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'fair'
  if (score >= 20) return 'poor'
  return 'critical'
}

/**
 * ESP Health Status Farbe
 * @param {string} status - Health Status
 * @returns {string} Vuetify Farbe
 */
export function getEspHealthColor(status) {
  const colors = {
    excellent: 'success',
    good: 'success',
    fair: 'warning',
    poor: 'warning',
    critical: 'error',
  }
  return colors[status] || 'grey'
}

/**
 * ESP Health Status Icon
 * @param {string} status - Health Status
 * @returns {string} Material Design Icon
 */
export function getEspHealthIcon(status) {
  const icons = {
    excellent: 'mdi-check-circle',
    good: 'mdi-check-circle',
    fair: 'mdi-alert-circle',
    poor: 'mdi-alert',
    critical: 'mdi-alert-octagon',
  }
  return icons[status] || 'mdi-help-circle'
}
