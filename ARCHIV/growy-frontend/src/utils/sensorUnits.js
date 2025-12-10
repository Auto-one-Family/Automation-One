// ✅ NEU: Sensor-Einheiten-Bestimmung basierend auf bestehenden Sensor-Typen
// Konsistent mit der bestehenden Codebase-Struktur

/**
 * Bestimmt die Einheit für einen Sensor-Typ
 * @param {string} sensorType - Der Sensor-Typ (z.B. 'SENSOR_TEMP_DS18B20')
 * @returns {string} - Die entsprechende Einheit
 */
export function determineUnit(sensorType) {
  const unitMap = {
    // Temperatur-Sensoren
    SENSOR_TEMP_DS18B20: '°C',
    SENSOR_TEMP_DHT22: '°C',
    SENSOR_TEMP_BME280: '°C',
    SENSOR_TEMP_SHT31: '°C',

    // Feuchtigkeits-Sensoren
    SENSOR_MOISTURE: '%',
    SENSOR_HUMIDITY_DHT22: '%',
    SENSOR_HUMIDITY_SHT31: '%',
    SENSOR_HUMIDITY_BME280: '%',

    // Druck-Sensoren
    SENSOR_PRESSURE: 'hPa',
    SENSOR_PRESSURE_BME280: 'hPa',

    // pH-Sensoren
    SENSOR_PH_DFROBOT: 'pH',
    SENSOR_PH_GENERIC: 'pH',

    // EC-Sensoren
    SENSOR_EC_GENERIC: 'mS/cm',
    SENSOR_EC_DFROBOT: 'mS/cm',

    // CO2-Sensoren
    SENSOR_CO2: 'ppm',
    SENSOR_CO2_MHZ19: 'ppm',

    // Luftqualität
    SENSOR_AIR_QUALITY: 'ppm',
    SENSOR_AIR_QUALITY_BME680: 'ppm',

    // Licht-Sensoren
    SENSOR_LIGHT: 'lux',
    SENSOR_LIGHT_BH1750: 'lux',

    // Füllstand-Sensoren
    SENSOR_LEVEL: 'cm',
    SENSOR_LEVEL_ULTRASONIC: 'cm',

    // Durchfluss-Sensoren
    SENSOR_FLOW: 'L/min',
    SENSOR_FLOW_YF: 'L/min',

    // Pi-Enhanced Sensoren (können verschiedene Einheiten haben)
    SENSOR_CUSTOM_PI_ENHANCED: '—',

    // Standard-Fallback
    DEFAULT: '—',
  }

  return unitMap[sensorType] || unitMap.DEFAULT
}

/**
 * Bestimmt die Einheit für einen Sensor basierend auf Sensor-Objekt
 * @param {Object} sensor - Sensor-Objekt mit type und unit Eigenschaften
 * @returns {string} - Die entsprechende Einheit
 */
export function determineUnitFromSensor(sensor) {
  // Wenn bereits eine Einheit gesetzt ist, verwende diese
  if (sensor.unit && sensor.unit !== '') {
    return sensor.unit
  }

  // Ansonsten bestimme basierend auf Sensor-Typ
  return determineUnit(sensor.type)
}

/**
 * Formatiert einen Sensor-Wert mit Einheit
 * @param {number} value - Der Sensor-Wert
 * @param {string} unit - Die Einheit
 * @returns {string} - Formatierter Wert mit Einheit
 */
export function formatValueWithUnit(value, unit) {
  if (value === null || value === undefined) {
    return '—'
  }

  if (unit === '—' || !unit) {
    return value.toString()
  }

  return `${value} ${unit}`
}

/**
 * Prüft ob ein Sensor-Typ numerische Werte hat
 * @param {string} sensorType - Der Sensor-Typ
 * @returns {boolean} - true wenn numerisch
 */
export function isNumericSensor(sensorType) {
  const numericTypes = [
    'SENSOR_TEMP_DS18B20',
    'SENSOR_TEMP_DHT22',
    'SENSOR_TEMP_BME280',
    'SENSOR_TEMP_SHT31',
    'SENSOR_MOISTURE',
    'SENSOR_HUMIDITY_DHT22',
    'SENSOR_HUMIDITY_SHT31',
    'SENSOR_HUMIDITY_BME280',
    'SENSOR_PRESSURE',
    'SENSOR_PRESSURE_BME280',
    'SENSOR_PH_DFROBOT',
    'SENSOR_PH_GENERIC',
    'SENSOR_EC_GENERIC',
    'SENSOR_EC_DFROBOT',
    'SENSOR_CO2',
    'SENSOR_CO2_MHZ19',
    'SENSOR_AIR_QUALITY',
    'SENSOR_AIR_QUALITY_BME680',
    'SENSOR_LIGHT',
    'SENSOR_LIGHT_BH1750',
    'SENSOR_LEVEL',
    'SENSOR_LEVEL_ULTRASONIC',
    'SENSOR_FLOW',
    'SENSOR_FLOW_YF',
  ]

  return numericTypes.includes(sensorType)
}

/**
 * Formatiert einen numerischen Sensor-Wert mit Dezimalstellen
 * @param {number} value - Der Sensor-Wert
 * @param {string} sensorType - Der Sensor-Typ
 * @returns {string} - Formatierter Wert
 */
export function formatNumericValue(value, sensorType) {
  if (value === null || value === undefined) {
    return '—'
  }

  // Bestimme Dezimalstellen basierend auf Sensor-Typ
  let decimals = 1

  if (sensorType.includes('TEMP')) {
    decimals = 1 // Temperatur: 1 Dezimalstelle
  } else if (sensorType.includes('MOISTURE') || sensorType.includes('HUMIDITY')) {
    decimals = 1 // Feuchtigkeit: 1 Dezimalstelle
  } else if (sensorType.includes('PH')) {
    decimals = 2 // pH: 2 Dezimalstellen
  } else if (sensorType.includes('EC')) {
    decimals = 2 // EC: 2 Dezimalstellen
  } else if (sensorType.includes('LIGHT')) {
    decimals = 0 // Licht: ganze Zahlen
  } else if (sensorType.includes('CO2') || sensorType.includes('AIR_QUALITY')) {
    decimals = 0 // CO2/Luftqualität: ganze Zahlen
  } else if (sensorType.includes('PRESSURE')) {
    decimals = 1 // Druck: 1 Dezimalstelle
  } else if (sensorType.includes('LEVEL')) {
    decimals = 1 // Füllstand: 1 Dezimalstelle
  } else if (sensorType.includes('FLOW')) {
    decimals = 2 // Durchfluss: 2 Dezimalstellen
  }

  return Number(value).toFixed(decimals)
}

// 🆕 NEU: Semantische Gruppierung für DatabaseLogsCard
export const SENSOR_GROUPS = {
  environment: {
    name: 'Umweltdaten',
    icon: 'mdi-weather-partly-cloudy',
    types: [
      'SENSOR_TEMP_DS18B20',
      'SENSOR_TEMP_DHT22',
      'SENSOR_TEMP_BME280',
      'SENSOR_TEMP_SHT31',
      'SENSOR_AIR_QUALITY',
      'SENSOR_AIR_QUALITY_BME680',
      'SENSOR_CO2',
      'SENSOR_CO2_MHZ19',
      'SENSOR_LIGHT',
      'SENSOR_LIGHT_BH1750',
    ],
  },
  water: {
    name: 'Wasserdaten',
    icon: 'mdi-water',
    types: [
      'SENSOR_MOISTURE',
      'SENSOR_HUMIDITY_DHT22',
      'SENSOR_HUMIDITY_SHT31',
      'SENSOR_HUMIDITY_BME280',
      'SENSOR_PH_DFROBOT',
      'SENSOR_PH_GENERIC',
      'SENSOR_EC_GENERIC',
      'SENSOR_EC_DFROBOT',
      'SENSOR_FLOW',
      'SENSOR_FLOW_YF',
    ],
  },
  system: {
    name: 'Systemdaten',
    icon: 'mdi-cog',
    types: [
      'SENSOR_PRESSURE',
      'SENSOR_PRESSURE_BME280',
      'SENSOR_LEVEL',
      'SENSOR_LEVEL_ULTRASONIC',
      'SENSOR_CUSTOM_PI_ENHANCED',
    ],
  },
}

/**
 * Bestimmt die semantische Gruppe für einen Sensor-Typ
 * @param {string} sensorType - Der Sensor-Typ
 * @returns {Object} - Gruppe mit key, name und icon
 */
export function getSensorGroup(sensorType) {
  for (const [groupKey, group] of Object.entries(SENSOR_GROUPS)) {
    if (group.types.includes(sensorType)) {
      return { key: groupKey, ...group }
    }
  }
  return { key: 'other', name: 'Sonstige', icon: 'mdi-help-circle' }
}

/**
 * Erstellt Optionen für Sensor-Gruppen-Filter
 * @returns {Array} - Array von Gruppen-Optionen
 */
export function getSensorGroupOptions() {
  return Object.entries(SENSOR_GROUPS).map(([key, group]) => ({
    label: group.name,
    value: key,
    icon: group.icon,
  }))
}
