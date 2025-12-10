// ✅ Device Health Utilities - Kompatibel mit bestehenden MQTT Store Strukturen
// Basierend auf systemHealth.js für Konsistenz

/**
 * Health Status Enumeration
 */
export const HealthStatus = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
}

/**
 * Device Health Score berechnen
 * @param {Object} device - Device Object
 * @returns {Object} Health Information
 */
export function evaluateDeviceHealth(device) {
  if (!device) {
    return {
      score: 0,
      status: HealthStatus.UNKNOWN,
      issues: ['Keine Gerätedaten verfügbar'],
    }
  }

  let score = 100
  const issues = []

  // Verbindungsstatus (40 Punkte)
  if (!device.systemState || device.systemState === 'ERROR') {
    score -= 40
    issues.push('Systemfehler')
  } else if (device.systemState === 'BOOT') {
    score -= 20
    issues.push('System startet')
  }

  // WiFi-Verbindung (25 Punkte)
  if (device.network?.wifiConnected === false) {
    score -= 25
    issues.push('WiFi nicht verbunden')
  }

  // MQTT-Verbindung (20 Punkte)
  if (device.network?.mqttConnected === false) {
    score -= 20
    issues.push('MQTT nicht verbunden')
  }

  // Safe Mode (15 Punkte)
  if (device.safeMode === true) {
    score -= 15
    issues.push('Safe Mode aktiv')
  }

  // Health-Daten (optional)
  if (device.health) {
    // CPU-Auslastung
    if (device.health.cpuUsagePercent > 80) {
      score -= 10
      issues.push('Hohe CPU-Auslastung')
    }

    // Speicher
    if (device.health.freeHeapCurrent < 50000) {
      score -= 10
      issues.push('Wenig Speicher')
    }

    // Laufzeit
    if (device.health.uptimeSeconds < 300) {
      score -= 5
      issues.push('Kürzlich gestartet')
    }
  }

  // Fehler
  if (device.errors?.totalErrors > 0) {
    score -= Math.min(device.errors.totalErrors * 5, 20)
    issues.push(`${device.errors.totalErrors} Fehler`)
  }

  const status = getHealthStatus(score)

  return {
    score: Math.max(0, score),
    status,
    issues,
  }
}

/**
 * Health Status basierend auf Score
 * @param {number} score - Health Score (0-100)
 * @returns {string} Status
 */
export function getHealthStatus(score) {
  if (score >= 80) return HealthStatus.EXCELLENT
  if (score >= 60) return HealthStatus.GOOD
  if (score >= 40) return HealthStatus.FAIR
  if (score >= 20) return HealthStatus.POOR
  return HealthStatus.CRITICAL
}

/**
 * Health Status Farbe
 * @param {string|Object} health - Health Status oder Health Object
 * @returns {string} Vuetify Farbe
 */
export function getHealthColor(health) {
  const status = typeof health === 'object' ? health.status : health

  const colors = {
    [HealthStatus.EXCELLENT]: 'success',
    [HealthStatus.GOOD]: 'success',
    [HealthStatus.FAIR]: 'warning',
    [HealthStatus.POOR]: 'warning',
    [HealthStatus.CRITICAL]: 'error',
    [HealthStatus.UNKNOWN]: 'grey',
  }

  return colors[status] || 'grey'
}

/**
 * Health Status Icon
 * @param {string|Object} health - Health Status oder Health Object
 * @returns {string} Material Design Icon
 */
export function getHealthIcon(health) {
  const status = typeof health === 'object' ? health.status : health

  const icons = {
    [HealthStatus.EXCELLENT]: 'mdi-check-circle',
    [HealthStatus.GOOD]: 'mdi-check-circle',
    [HealthStatus.FAIR]: 'mdi-alert-circle',
    [HealthStatus.POOR]: 'mdi-alert',
    [HealthStatus.CRITICAL]: 'mdi-alert-octagon',
    [HealthStatus.UNKNOWN]: 'mdi-help-circle',
  }

  return icons[status] || 'mdi-help-circle'
}

/**
 * Health Status Label
 * @param {string|Object} health - Health Status oder Health Object
 * @returns {string} Benutzerfreundlicher Text
 */
export function getHealthLabel(health) {
  const status = typeof health === 'object' ? health.status : health

  const labels = {
    [HealthStatus.EXCELLENT]: 'Ausgezeichnet',
    [HealthStatus.GOOD]: 'Gut',
    [HealthStatus.FAIR]: 'Befriedigend',
    [HealthStatus.POOR]: 'Schlecht',
    [HealthStatus.CRITICAL]: 'Kritisch',
    [HealthStatus.UNKNOWN]: 'Unbekannt',
  }

  return labels[status] || 'Unbekannt'
}
