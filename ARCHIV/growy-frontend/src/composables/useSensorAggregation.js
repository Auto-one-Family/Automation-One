import { useSensorRegistryStore } from '@/stores/sensorRegistry'

/**
 * Composable für Sensor-Aggregationen
 * Zentrale Logik für Berechnung von Durchschnitt, Min, Max pro Sensor-Typ
 * 🆕 NEU: Zeitfenster-Support für kontextabhängige Aggregationen
 */
export function useSensorAggregation() {
  const sensorRegistry = useSensorRegistryStore()

  /**
   * Berechnet Aggregationen für alle Sensoren eines ESP
   * @param {string} espId - ESP-ID
   * @returns {Array} Array von Aggregation-Objekten
   */
  function getEspAggregations(espId) {
    if (!espId) return []

    const sensors = sensorRegistry.getSensorsByEsp(espId)
    return calculateAggregations(sensors)
  }

  /**
   * 🆕 NEU: Berechnet Aggregationen für einen spezifischen Zeitraum
   * @param {string} espId - ESP-ID
   * @param {number} timeWindowMs - Zeitfenster in Millisekunden
   * @returns {Array} Array von Aggregation-Objekten
   */
  function getEspAggregationsWithTimeWindow(espId, timeWindowMs = 5 * 60 * 1000) {
    if (!espId) return []

    const sensors = sensorRegistry.getSensorsByEsp(espId)
    const now = Date.now()

    // Nur Sensoren im Zeitfenster
    const recentSensors = sensors.filter(
      (sensor) => sensor.lastUpdate && now - sensor.lastUpdate <= timeWindowMs,
    )

    return calculateAggregations(recentSensors)
  }

  /**
   * Berechnet Aggregationen für alle Sensoren einer Zone
   * @param {string} zoneId - Zone-ID
   * @returns {Array} Array von Aggregation-Objekten
   */
  function getZoneAggregations(zoneId) {
    if (!zoneId) return []

    // Zone-Sensoren aus Registry holen
    const zoneSensors = sensorRegistry.getAllSensors.filter(
      (sensor) => sensor.subzoneId && sensor.subzoneId.startsWith(zoneId),
    )

    return calculateAggregations(zoneSensors)
  }

  /**
   * 🆕 NEU: Zeitfenster-Optionen für Aggregationen
   * @returns {Array} Array von Zeitfenster-Optionen
   */
  function getTimeWindowOptions() {
    return [
      { label: 'Letzte 5 Minuten', value: 5 * 60 * 1000 },
      { label: 'Letzte Stunde', value: 60 * 60 * 1000 },
      { label: 'Letzte 24 Stunden', value: 24 * 60 * 60 * 1000 },
      { label: 'Alle verfügbaren Daten', value: null },
    ]
  }

  /**
   * 🆕 NEU: Formatiert Zeitfenster-Label
   * @param {number} timeWindowMs - Zeitfenster in Millisekunden
   * @returns {string} Benutzerfreundliches Label
   */
  function formatTimeWindow(timeWindowMs) {
    if (!timeWindowMs) return 'Alle Daten'

    const minutes = Math.floor(timeWindowMs / (60 * 1000))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} Tag${days > 1 ? 'e' : ''}`
    if (hours > 0) return `${hours} Stunde${hours > 1 ? 'n' : ''}`
    return `${minutes} Minute${minutes > 1 ? 'n' : ''}`
  }

  /**
   * Zentrale Aggregations-Berechnung
   * @param {Array} sensors - Array von Sensor-Objekten
   * @returns {Array} Array von Aggregation-Objekten
   */
  function calculateAggregations(sensors) {
    if (!sensors || sensors.length === 0) return []

    // Nur gültige Sensoren mit numerischen Werten
    const validSensors = sensors.filter(
      (sensor) =>
        sensor.value !== null && sensor.value !== undefined && !isNaN(Number(sensor.value)),
    )

    if (validSensors.length === 0) return []

    // Nach Typ gruppieren
    const grouped = {}
    validSensors.forEach((sensor) => {
      if (!grouped[sensor.type]) {
        grouped[sensor.type] = []
      }
      grouped[sensor.type].push(Number(sensor.value))
    })

    // Aggregationen berechnen
    return Object.entries(grouped).map(([type, values]) => ({
      type,
      label: getSensorTypeLabel(type),
      unit: getSensorUnit(type),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    }))
  }

  /**
   * 🆕 NEU: Warning-basierte Aggregation
   * @param {Array} sensors - Array von Sensor-Objekten
   * @returns {Array} Array von Warning-Aggregation-Objekten
   */
  function calculateWarningAggregations(sensors) {
    if (!sensors || sensors.length === 0) return []

    // Sensoren mit Warnings gruppieren
    const warningSensors = sensors.filter((sensor) => sensor.warnings && sensor.warnings.length > 0)

    if (warningSensors.length === 0) return []

    // Nach Warning-Typ gruppieren
    const grouped = {}
    warningSensors.forEach((sensor) => {
      sensor.warnings.forEach((warning) => {
        if (!grouped[warning]) {
          grouped[warning] = []
        }
        grouped[warning].push(sensor)
      })
    })

    // Warning-Aggregationen berechnen
    return Object.entries(grouped).map(([warning, sensors]) => ({
      warning,
      label: getWarningLabel(warning),
      color: getWarningColor(warning),
      count: sensors.length,
      sensors: sensors.map((s) => ({ espId: s.espId, gpio: s.gpio, type: s.type })),
    }))
  }

  /**
   * 🆕 NEU: Zeitqualität-basierte Aggregation
   * @param {Array} sensors - Array von Sensor-Objekten
   * @returns {Array} Array von Zeitqualität-Aggregation-Objekten
   */
  function calculateTimeQualityAggregations(sensors) {
    if (!sensors || sensors.length === 0) return []

    // Nach Zeitqualität gruppieren
    const grouped = {}
    sensors.forEach((sensor) => {
      const quality = sensor.time_quality || 'unknown'
      if (!grouped[quality]) {
        grouped[quality] = []
      }
      grouped[quality].push(sensor)
    })

    // Zeitqualität-Aggregationen berechnen
    return Object.entries(grouped).map(([quality, sensors]) => ({
      quality,
      label: getTimeQualityLabel(quality),
      color: getTimeQualityColor(quality),
      count: sensors.length,
      percentage: (sensors.length / sensors.length) * 100,
    }))
  }

  /**
   * Sensor-Typ Label
   * @param {string} type - Sensor-Typ
   * @returns {string} Benutzerfreundliches Label
   */
  function getSensorTypeLabel(type) {
    const labels = {
      SENSOR_TEMP_DS18B20: 'Temperatur',
      SENSOR_MOISTURE: 'Feuchtigkeit',
      SENSOR_PH_DFROBOT: 'pH-Wert',
      SENSOR_EC_GENERIC: 'Leitfähigkeit',
      SENSOR_LIGHT: 'Licht',
      SENSOR_PRESSURE: 'Druck',
      SENSOR_CO2: 'CO₂',
      SENSOR_AIR_QUALITY: 'Luftqualität',
      SENSOR_FLOW: 'Durchfluss',
      SENSOR_LEVEL: 'Füllstand',
    }
    return labels[type] || type
  }

  /**
   * Sensor-Typ Einheit
   * @param {string} type - Sensor-Typ
   * @returns {string} Einheit
   */
  function getSensorUnit(type) {
    const units = {
      SENSOR_TEMP_DS18B20: '°C',
      SENSOR_MOISTURE: '%',
      SENSOR_PH_DFROBOT: 'pH',
      SENSOR_EC_GENERIC: 'µS/cm',
      SENSOR_LIGHT: 'lux',
      SENSOR_PRESSURE: 'hPa',
      SENSOR_CO2: 'ppm',
      SENSOR_AIR_QUALITY: 'AQI',
      SENSOR_FLOW: 'L/min',
      SENSOR_LEVEL: 'cm',
    }
    return units[type] || ''
  }

  /**
   * Sensor-Typ Icon
   * @param {string} type - Sensor-Typ
   * @returns {string} Material Design Icon
   */
  function getSensorIcon(type) {
    const icons = {
      SENSOR_TEMP_DS18B20: 'mdi-thermometer',
      SENSOR_MOISTURE: 'mdi-water-percent',
      SENSOR_PH_DFROBOT: 'mdi-test-tube',
      SENSOR_EC_GENERIC: 'mdi-flash',
      SENSOR_LIGHT: 'mdi-white-balance-sunny',
      SENSOR_PRESSURE: 'mdi-gauge',
      SENSOR_CO2: 'mdi-molecule-co2',
      SENSOR_AIR_QUALITY: 'mdi-air-filter',
      SENSOR_FLOW: 'mdi-pump',
      SENSOR_LEVEL: 'mdi-waves',
    }
    return icons[type] || 'mdi-help-circle'
  }

  /**
   * Sensor-Typ Farbe
   * @param {string} type - Sensor-Typ
   * @returns {string} Vuetify Farbe
   */
  function getSensorColor(type) {
    const colors = {
      SENSOR_TEMP_DS18B20: 'orange',
      SENSOR_MOISTURE: 'blue',
      SENSOR_PH_DFROBOT: 'purple',
      SENSOR_EC_GENERIC: 'green',
      SENSOR_LIGHT: 'yellow',
      SENSOR_PRESSURE: 'indigo',
      SENSOR_CO2: 'red',
      SENSOR_AIR_QUALITY: 'teal',
      SENSOR_FLOW: 'cyan',
      SENSOR_LEVEL: 'brown',
    }
    return colors[type] || 'grey'
  }

  /**
   * 🆕 NEU: Warning-Label
   * @param {string} warning - Warning-Typ
   * @returns {string} Benutzerfreundliches Label
   */
  function getWarningLabel(warning) {
    const labels = {
      sensor_disconnected: 'Sensor Disconnected',
      raw_value_out_of_range: 'Raw Value Out of Range',
      processing_failed: 'Processing Failed',
      library_not_loaded: 'Library Not Loaded',
    }
    return labels[warning] || warning
  }

  /**
   * 🆕 NEU: Warning-Farbe
   * @param {string} warning - Warning-Typ
   * @returns {string} Vuetify Farbe
   */
  function getWarningColor(warning) {
    const colors = {
      sensor_disconnected: 'error',
      processing_failed: 'error',
      raw_value_out_of_range: 'warning',
      library_not_loaded: 'info',
    }
    return colors[warning] || 'grey'
  }

  /**
   * 🆕 NEU: Zeitqualität-Label
   * @param {string} quality - Zeitqualität
   * @returns {string} Benutzerfreundliches Label
   */
  function getTimeQualityLabel(quality) {
    const labels = {
      good: 'Good',
      poor: 'Poor',
      unknown: 'Unknown',
    }
    return labels[quality] || quality
  }

  /**
   * 🆕 NEU: Zeitqualität-Farbe
   * @param {string} quality - Zeitqualität
   * @returns {string} Vuetify Farbe
   */
  function getTimeQualityColor(quality) {
    const colors = {
      good: 'success',
      poor: 'warning',
      unknown: 'grey',
    }
    return colors[quality] || 'grey'
  }

  /**
   * Formatiert Aggregations-Wert
   * @param {Object} aggregation - Aggregation-Objekt
   * @returns {string} Formatierter Wert mit Einheit
   */
  function formatAggregationValue(aggregation) {
    if (!aggregation || isNaN(aggregation.avg)) return '—'
    return `${aggregation.avg.toFixed(1)}${aggregation.unit}`
  }

  /**
   * Formatiert Aggregations-Tooltip
   * @param {Object} aggregation - Aggregation-Objekt
   * @returns {string} Tooltip-Text
   */
  function formatAggregationTooltip(aggregation) {
    if (!aggregation) return ''

    return `${aggregation.label}
Min: ${aggregation.min.toFixed(1)}${aggregation.unit}
Max: ${aggregation.max.toFixed(1)}${aggregation.unit}
${aggregation.count} Sensoren`
  }

  return {
    getEspAggregations,
    getEspAggregationsWithTimeWindow, // 🆕 NEU
    getZoneAggregations,
    getTimeWindowOptions, // 🆕 NEU
    formatTimeWindow, // 🆕 NEU
    calculateAggregations,
    calculateWarningAggregations, // 🆕 NEU
    calculateTimeQualityAggregations, // 🆕 NEU
    getSensorTypeLabel,
    getSensorUnit,
    getSensorIcon,
    getSensorColor,
    getWarningLabel, // 🆕 NEU
    getWarningColor, // 🆕 NEU
    getTimeQualityLabel, // 🆕 NEU
    getTimeQualityColor, // 🆕 NEU
    formatAggregationValue,
    formatAggregationTooltip,
  }
}
