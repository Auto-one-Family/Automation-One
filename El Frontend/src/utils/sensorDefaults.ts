/**
 * Sensor Type Configuration
 * 
 * Defines default values, units, and metadata for each sensor type.
 * CRITICAL: This fixes the bug where pH sensors showed "°C" instead of "pH".
 */

export interface SensorTypeConfig {
  /** Human-readable label: "Temperatur (DS18B20)" */
  label: string
  /** Correct unit: "°C", "pH", "% RH" */
  unit: string
  /** Minimum valid value */
  min: number
  /** Maximum valid value */
  max: number
  /** Decimal places for display */
  decimals: number
  /** Lucide icon name */
  icon: string
  /** Sensible default value for new sensors */
  defaultValue: number
  /** Tooltip description */
  description?: string
}

/**
 * SENSOR_TYPE_CONFIG
 * 
 * Central configuration for all sensor types.
 * Used by:
 * - MockEspDetailView (sensor creation form)
 * - SensorValueCard (display)
 * - Validation logic
 */
export const SENSOR_TYPE_CONFIG: Record<string, SensorTypeConfig> = {
  'DS18B20': {
    label: 'Temperatur (DS18B20)',
    unit: '°C',
    min: -55,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 20.0,
    description: 'Digitaler Temperatursensor, wasserdicht. Ideal für Flüssigkeiten und Umgebungstemperatur.'
  },
  
  'pH': {
    label: 'pH-Wert',
    unit: 'pH',  // NICHT °C!
    min: 0,
    max: 14,
    decimals: 2,
    icon: 'Droplet',
    defaultValue: 7.0,
    description: 'Säuregrad der Lösung. 0-6 = sauer, 7 = neutral, 8-14 = basisch.'
  },
  
  'EC': {
    label: 'Leitfähigkeit (EC)',
    unit: 'µS/cm',
    min: 0,
    max: 5000,
    decimals: 0,
    icon: 'Zap',
    defaultValue: 1200,
    description: 'Elektrische Leitfähigkeit. Zeigt Nährstoffgehalt der Lösung an.'
  },
  
  'SHT31': {
    label: 'Temperatur (SHT31)',
    unit: '°C',
    min: -40,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'Präziser Temperatur- und Feuchtesensor (I2C).'
  },
  
  'SHT31_humidity': {
    label: 'Luftfeuchtigkeit (SHT31)',
    unit: '% RH',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Droplets',
    defaultValue: 50.0,
    description: 'Relative Luftfeuchtigkeit. Optimal für Pflanzen: 40-70%.'
  },
  
  'BME280': {
    label: 'Temperatur (BME280)',
    unit: '°C',
    min: -40,
    max: 85,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'Temperatur-, Feuchte- und Drucksensor.'
  },
  
  'BME280_humidity': {
    label: 'Luftfeuchtigkeit (BME280)',
    unit: '% RH',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Droplets',
    defaultValue: 50.0,
    description: 'Relative Luftfeuchtigkeit.'
  },
  
  'BME280_pressure': {
    label: 'Luftdruck (BME280)',
    unit: 'hPa',
    min: 300,
    max: 1100,
    decimals: 1,
    icon: 'Gauge',
    defaultValue: 1013.25,
    description: 'Atmosphärischer Luftdruck in Hektopascal.'
  },
  
  'analog': {
    label: 'Analog-Eingang',
    unit: 'raw',
    min: 0,
    max: 4095,
    decimals: 0,
    icon: 'Activity',
    defaultValue: 2048,
    description: 'Rohwert des ADC (12-bit: 0-4095).'
  },
  
  'digital': {
    label: 'Digital-Eingang',
    unit: '',
    min: 0,
    max: 1,
    decimals: 0,
    icon: 'ToggleLeft',
    defaultValue: 0,
    description: 'Digitaler Eingang (0 = LOW, 1 = HIGH).'
  },
  
  'flow': {
    label: 'Durchflusssensor',
    unit: 'L/min',
    min: 0,
    max: 100,
    decimals: 2,
    icon: 'Waves',
    defaultValue: 0,
    description: 'Durchflussrate in Liter pro Minute.'
  },
  
  'level': {
    label: 'Füllstand',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Layers',
    defaultValue: 50,
    description: 'Füllstand des Behälters in Prozent.'
  },
  
  'light': {
    label: 'Lichtsensor',
    unit: 'lux',
    min: 0,
    max: 100000,
    decimals: 0,
    icon: 'Sun',
    defaultValue: 500,
    description: 'Beleuchtungsstärke in Lux.'
  },
  
  'co2': {
    label: 'CO2-Sensor',
    unit: 'ppm',
    min: 400,
    max: 5000,
    decimals: 0,
    icon: 'Cloud',
    defaultValue: 400,
    description: 'CO2-Konzentration in ppm. Normal: 400-1000 ppm.'
  },
}

/**
 * Get the correct unit for a sensor type
 * @param sensorType - The sensor type key (e.g., 'pH', 'DS18B20')
 * @returns The unit string or 'raw' if unknown
 */
export function getSensorUnit(sensorType: string): string {
  return SENSOR_TYPE_CONFIG[sensorType]?.unit ?? 'raw'
}

/**
 * Get the default value for a sensor type
 * @param sensorType - The sensor type key
 * @returns The default value or 0 if unknown
 */
export function getSensorDefault(sensorType: string): number {
  return SENSOR_TYPE_CONFIG[sensorType]?.defaultValue ?? 0
}

/**
 * Get the full configuration for a sensor type
 * @param sensorType - The sensor type key
 * @returns The full config or undefined if unknown
 */
export function getSensorConfig(sensorType: string): SensorTypeConfig | undefined {
  return SENSOR_TYPE_CONFIG[sensorType]
}

/**
 * Get human-readable label for a sensor type
 * @param sensorType - The sensor type key
 * @returns The label or the original type if unknown
 */
export function getSensorLabel(sensorType: string): string {
  return SENSOR_TYPE_CONFIG[sensorType]?.label ?? sensorType
}

/**
 * Validate if a value is within the valid range for a sensor type
 * @param sensorType - The sensor type key
 * @param value - The value to validate
 * @returns true if valid, false otherwise
 */
export function isValidSensorValue(sensorType: string, value: number): boolean {
  const config = SENSOR_TYPE_CONFIG[sensorType]
  if (!config) return true // Unknown types are always valid
  return value >= config.min && value <= config.max
}

/**
 * Get all available sensor types as options for select elements
 * @returns Array of { value, label } objects
 */
export function getSensorTypeOptions(): Array<{ value: string; label: string }> {
  return Object.entries(SENSOR_TYPE_CONFIG).map(([key, config]) => ({
    value: key,
    label: config.label
  }))
}

/**
 * Format a sensor value with its unit
 * @param value - The numeric value
 * @param sensorType - The sensor type key
 * @returns Formatted string like "23.5 °C"
 */
export function formatSensorValueWithUnit(value: number | null, sensorType: string): string {
  if (value === null || value === undefined) return '-'
  
  const config = SENSOR_TYPE_CONFIG[sensorType]
  if (!config) return `${value}`
  
  return `${value.toFixed(config.decimals)} ${config.unit}`
}








