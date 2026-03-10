/**
 * Sensor Type Configuration
 *
 * Defines default values, units, and metadata for each sensor type.
 * CRITICAL: This fixes the bug where pH sensors showed "°C" instead of "pH".
 */

import type { SensorOperatingMode } from '@/types'

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
  /** Category for grouping in sidebar: 'temperature', 'water', 'soil', 'air', 'light', 'other' */
  category: SensorCategoryId
  // =========================================================================
  // OPERATING MODE RECOMMENDATIONS (Phase 2B)
  // =========================================================================
  /** Empfohlener Betriebsmodus für diesen Sensor-Typ */
  recommendedMode?: SensorOperatingMode
  /** Empfohlener Timeout in Sekunden (0 = kein Timeout) */
  recommendedTimeout?: number
  /** Ob dieser Sensor-Typ On-Demand-Messungen unterstuetzt */
  supportsOnDemand?: boolean
  /** Default read interval in seconds (for AddSensorModal type-aware defaults) */
  defaultIntervalSeconds?: number
  // =========================================================================
  // ONEWIRE SUPPORT (Phase 6 - DS18B20)
  // =========================================================================
  /** Requires OneWire address scanning before configuration */
  requiresAddressScanning?: boolean
  /** Multiple sensors can share the same GPIO pin (OneWire bus) */
  supportsMultipleOnSamePin?: boolean
  /** Recommended GPIO pins for this sensor type */
  recommendedGpios?: number[]
}

/**
 * Sensor Category IDs for grouping
 */
export type SensorCategoryId = 'temperature' | 'water' | 'soil' | 'air' | 'light' | 'other'

/**
 * Category Configuration
 */
export interface SensorCategory {
  name: string
  icon: string
  order: number
}

/**
 * SENSOR_CATEGORIES
 *
 * Categories for grouping sensor types in the sidebar.
 * Used by SensorSidebar.vue for collapsible sections.
 */
export const SENSOR_CATEGORIES: Record<SensorCategoryId, SensorCategory> = {
  temperature: { name: 'Temperatur', icon: 'Thermometer', order: 1 },
  water: { name: 'Wasser', icon: 'Droplet', order: 2 },
  soil: { name: 'Boden', icon: 'Leaf', order: 3 },
  air: { name: 'Luft', icon: 'Wind', order: 4 },
  light: { name: 'Licht', icon: 'Sun', order: 5 },
  other: { name: 'Sonstige', icon: 'Settings', order: 6 }
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
    label: 'Temperatur',
    unit: '°C',
    min: -55,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 20.0,
    description: 'Digitaler Temperatursensor, wasserdicht. Ideal für Flüssigkeiten und Umgebungstemperatur.',
    category: 'temperature',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 30,
    // OneWire (Phase 6)
    requiresAddressScanning: true,
    supportsMultipleOnSamePin: true,
    recommendedGpios: [4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
  },

  // Lowercase variant for consistency (ESP32 may send lowercase)
  'ds18b20': {
    label: 'Temperatur',
    unit: '°C',
    min: -55,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 20.0,
    description: 'Digitaler Temperatursensor, wasserdicht. Ideal für Flüssigkeiten und Umgebungstemperatur.',
    category: 'temperature',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 30,
    requiresAddressScanning: true,
    supportsMultipleOnSamePin: true,
    recommendedGpios: [4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
  },
  
  'pH': {
    label: 'pH-Wert',
    unit: 'pH',  // NICHT °C!
    min: 0,
    max: 14,
    decimals: 2,
    icon: 'Droplet',
    defaultValue: 7.0,
    description: 'Säuregrad der Lösung. 0-6 = sauer, 7 = neutral, 8-14 = basisch.',
    category: 'water',
    // Operating Mode (Phase 2B)
    recommendedMode: 'on_demand',
    recommendedTimeout: 0,
    supportsOnDemand: true,
  },
  
  'EC': {
    label: 'Leitfähigkeit',
    unit: 'µS/cm',
    min: 0,
    max: 5000,
    decimals: 0,
    icon: 'Zap',
    defaultValue: 1200,
    description: 'Elektrische Leitfähigkeit. Zeigt Nährstoffgehalt der Lösung an.',
    category: 'water',
    // Operating Mode (Phase 2B)
    recommendedMode: 'on_demand',
    recommendedTimeout: 0,
    supportsOnDemand: true,
  },
  
  // SHT31 base/alias keys: Backward compat when API/DB sends "SHT31". Add-Dropdown shows only "sht31" (getSensorTypeOptions).
  'SHT31': {
    label: 'SHT31',
    unit: '°C',
    min: -40,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'Präziser Temperatur- und Feuchtesensor (I2C). Multi-Value-Sensor: Temperatur + Luftfeuchtigkeit.',
    category: 'temperature',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 30,
  },

  // Lowercase variants for consistency
  'sht31': {
    label: 'SHT31',
    unit: '°C',
    min: -40,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'Präziser Temperatur- und Feuchtesensor (I2C). Multi-Value-Sensor: Temperatur + Luftfeuchtigkeit.',
    category: 'temperature',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 30,
  },

  'sht31_temp': {
    label: 'Temperatur',
    unit: '°C',
    min: -40,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'SHT31 Temperaturwert. RAW-Konversion: -45 + (175 × raw / 65535)',
    category: 'temperature',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 30,
  },

  'sht31_humidity': {
    label: 'Luftfeuchte',
    unit: '%RH',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Droplets',
    defaultValue: 50.0,
    description: 'SHT31 Luftfeuchtigkeit. RAW-Konversion: 100 × raw / 65535',
    category: 'air',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 30,
  },

  // Alias for DB/API sending "SHT31_humidity"; value-type sht31_humidity is canonical.
  'SHT31_humidity': {
    label: 'Luftfeuchte',
    unit: '%RH',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Droplets',
    defaultValue: 50.0,
    description: 'Relative Luftfeuchtigkeit. Optimal für Pflanzen: 40-70%.',
    category: 'air',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
  },

  'BME280': {
    label: 'Temperatur',
    unit: '°C',
    min: -40,
    max: 85,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'Temperatur-, Feuchte- und Drucksensor.',
    category: 'temperature',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
  },

  'BME280_humidity': {
    label: 'Luftfeuchte',
    unit: '%RH',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Droplets',
    defaultValue: 50.0,
    description: 'Relative Luftfeuchtigkeit.',
    category: 'air',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
  },

  'BME280_pressure': {
    label: 'Luftdruck',
    unit: 'hPa',
    min: 300,
    max: 1100,
    decimals: 1,
    icon: 'Gauge',
    defaultValue: 1013.25,
    description: 'Atmosphärischer Luftdruck in Hektopascal.',
    category: 'air',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 300,
    supportsOnDemand: false,
  },

  // Lowercase variants (API/Firmware send lowercase sensor_type)
  // Phase C: Bosch BME280/BMP280 Datasheet — Operating range -40…+85 °C, 0…100 %RH, 300…1100 hPa
  'bmp280_temp': {
    label: 'BMP280 Temperatur',
    unit: '°C',
    min: -40,
    max: 85,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'BMP280 Temperatur. Bosch Datasheet: -40…+85 °C.',
    category: 'temperature',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
  },

  'bmp280_pressure': {
    label: 'BMP280 Druck',
    unit: 'hPa',
    min: 300,
    max: 1100,
    decimals: 1,
    icon: 'Gauge',
    defaultValue: 1013.25,
    description: 'BMP280 Luftdruck. Bosch Datasheet: 300…1100 hPa.',
    category: 'air',
    recommendedMode: 'continuous',
    recommendedTimeout: 300,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
  },

  'bme280_temp': {
    label: 'BME280 Temperatur',
    unit: '°C',
    min: -40,
    max: 85,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'BME280 Temperatur. Bosch Datasheet: -40…+85 °C.',
    category: 'temperature',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
  },

  'bme280_humidity': {
    label: 'BME280 Feuchte',
    unit: '%RH',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Droplets',
    defaultValue: 50.0,
    description: 'BME280 relative Luftfeuchtigkeit. Bosch Datasheet: 0…100 %RH.',
    category: 'air',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
  },

  'bme280_pressure': {
    label: 'BME280 Druck',
    unit: 'hPa',
    min: 300,
    max: 1100,
    decimals: 1,
    icon: 'Gauge',
    defaultValue: 1013.25,
    description: 'BME280 Luftdruck. Bosch Datasheet: 300…1100 hPa.',
    category: 'air',
    recommendedMode: 'continuous',
    recommendedTimeout: 300,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
  },

  'analog': {
    label: 'Analog-Eingang',
    unit: 'raw',
    min: 0,
    max: 4095,
    decimals: 0,
    icon: 'Activity',
    defaultValue: 2048,
    description: 'Rohwert des ADC (12-bit: 0-4095).',
    category: 'other',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: true,
  },

  'digital': {
    label: 'Digital-Eingang',
    unit: '',
    min: 0,
    max: 1,
    decimals: 0,
    icon: 'ToggleLeft',
    defaultValue: 0,
    description: 'Digitaler Eingang (0 = LOW, 1 = HIGH).',
    category: 'other',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 60,
    supportsOnDemand: false,
  },

  'flow': {
    label: 'Durchfluss',
    unit: 'L/min',
    min: 0,
    max: 100,
    decimals: 2,
    icon: 'Waves',
    defaultValue: 0,
    description: 'Durchflussrate in Liter pro Minute.',
    category: 'water',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 60,
    supportsOnDemand: false,
  },

  'level': {
    label: 'Füllstand',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Layers',
    defaultValue: 50,
    description: 'Füllstand des Behälters in Prozent.',
    category: 'water',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 300,
    supportsOnDemand: false,
  },

  'light': {
    label: 'Licht',
    unit: 'lux',
    min: 0,
    max: 100000,
    decimals: 0,
    icon: 'Sun',
    defaultValue: 500,
    description: 'Beleuchtungsstärke in Lux.',
    category: 'light',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
  },

  'co2': {
    label: 'CO2',
    unit: 'ppm',
    min: 400,
    max: 5000,
    decimals: 0,
    icon: 'Cloud',
    defaultValue: 400,
    description: 'CO2-Konzentration in ppm. Normal: 400-1000 ppm.',
    category: 'air',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
  },

  'moisture': {
    label: 'Bodenfeuchte',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 0,
    icon: 'Droplets',
    defaultValue: 50,
    description: 'Bodenfeuchtigkeit in Prozent. Kapazitiver oder resistiver Sensor.',
    category: 'soil',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 300,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
    recommendedGpios: [32, 33, 34, 35, 36, 39],
  },

  'soil_moisture': {
    label: 'Bodenfeuchte',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 0,
    icon: 'Droplets',
    defaultValue: 50,
    description: 'Bodenfeuchtigkeit in Prozent. Kapazitiver oder resistiver Sensor.',
    category: 'soil',
    // Operating Mode (Phase 2B)
    recommendedMode: 'continuous',
    recommendedTimeout: 300,
    supportsOnDemand: false,
    defaultIntervalSeconds: 60,
    recommendedGpios: [32, 33, 34, 35, 36, 39],
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
 * Get all available sensor types as options for select elements (Add-Sensor dropdown).
 * Returns a DEVICE list: one option per multi-value device (canonical key, e.g. "sht31"),
 * plus all single-value sensor types. Value-types (sht31_temp, sht31_humidity) and
 * duplicate base keys (SHT31, SHT31_humidity) are excluded so the dropdown does not show 5 SHT31 variants.
 * Duplicates like DS18B20/ds18b20 are deduplicated (lowercase preferred as canonical).
 * @returns Array of { value, label } objects
 */
export function getSensorTypeOptions(): Array<{ value: string; label: string }> {
  const valueTypeSet = new Set(
    Object.values(MULTI_VALUE_DEVICES).flatMap((d) => d.sensorTypes)
  )
  const deviceKeySet = new Set(
    Object.keys(MULTI_VALUE_DEVICES).map((k) => k.toLowerCase())
  )

  const deviceOptions = Object.entries(MULTI_VALUE_DEVICES).map(([deviceType, cfg]) => ({
    value: deviceType,
    label: cfg.label ?? getMultiValueDeviceFallbackLabel(deviceType)
  }))

  const singleValueEntries = Object.entries(SENSOR_TYPE_CONFIG)
    .filter(([key]) => {
      if (valueTypeSet.has(key)) return false
      if (valueTypeSet.has(key.toLowerCase())) return false // e.g. SHT31_humidity → sht31_humidity
      if (deviceKeySet.has(key.toLowerCase())) return false // SHT31, sht31 → already in deviceOptions
      if (getDeviceTypeFromSensorType(key) !== null) return false
      return true
    })
    .sort((a, b) => {
      const aLower = a[0].toLowerCase()
      const bLower = b[0].toLowerCase()
      if (aLower !== bLower) return aLower.localeCompare(bLower)
      // Same normalized key: prefer lowercase variant (e.g. ds18b20 before DS18B20)
      return (a[0] === aLower ? 0 : 1) - (b[0] === bLower ? 0 : 1)
    })

  const addedLowercase = new Set<string>()
  const singleValueOptions = singleValueEntries
    .filter(([key]) => {
      const lower = key.toLowerCase()
      if (addedLowercase.has(lower)) return false
      addedLowercase.add(lower)
      return true
    })
    .map(([key, config]) => ({ value: key, label: config.label }))

  return [...deviceOptions, ...singleValueOptions]
}

/** Fallback label for multi-value devices when label is missing */
function getMultiValueDeviceFallbackLabel(deviceType: string): string {
  const fallbacks: Record<string, string> = {
    sht31: 'SHT31 (Temp + Humidity)',
    bmp280: 'BMP280 (Druck + Temp)',
    bme280: 'BME280 (Druck + Temp + Feuchte)'
  }
  return fallbacks[deviceType.toLowerCase()] ?? deviceType
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

/**
 * Get the default read interval for a sensor type
 * @returns Interval in seconds, or 30 as fallback
 */
export function getDefaultInterval(sensorType: string): number {
  return SENSOR_TYPE_CONFIG[sensorType]?.defaultIntervalSeconds ?? 30
}

/**
 * Build a human-readable summary for sensor-type-aware defaults.
 *
 * @example
 * getSensorTypeAwareSummary('SHT31')
 * // "SHT31 auf I2C 0x44, misst Temperatur + Luftfeuchtigkeit alle 30s"
 */
export function getSensorTypeAwareSummary(sensorType: string): string | null {
  const config = SENSOR_TYPE_CONFIG[sensorType]
  if (!config) return null

  const iface = inferInterfaceType(sensorType)
  const interval = config.defaultIntervalSeconds ?? 30

  // Check if multi-value device
  const deviceType = getDeviceTypeFromSensorType(sensorType)
  const mvDevice = deviceType ? MULTI_VALUE_DEVICES[deviceType] : null

  const parts: string[] = [config.label || sensorType]

  if (iface === 'I2C' && mvDevice?.i2cAddress) {
    parts.push(`auf I2C ${mvDevice.i2cAddress}`)
  } else if (iface === 'ONEWIRE') {
    parts.push('auf OneWire-Bus')
  }

  if (mvDevice) {
    const valueNames = mvDevice.values.map(v => v.label)
    parts.push(`misst ${valueNames.join(' + ')}`)
  } else {
    parts.push(`misst ${config.unit}`)
  }

  parts.push(`alle ${interval}s`)

  return parts.join(', ')
}

// ════════════════════════════════════════════════════════════════════════════
// MULTI-VALUE DEVICE REGISTRY (Phase 6)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for a single value within a multi-value device
 */
export interface MultiValueConfig {
  /** Value key (e.g., "temp", "humidity") */
  key: string
  /** Full sensor_type string (e.g., "sht31_temp") */
  sensorType: string
  /** Display label */
  label: string
  /** Unit of measurement */
  unit: string
  /** Display order (lower = first) */
  order: number
  /** Icon for this specific value (optional) */
  icon?: string
}

/**
 * Configuration for a multi-value device
 */
export interface MultiValueDeviceConfig {
  /** Device type identifier (e.g., "sht31") */
  deviceType: string
  /** Human-readable device name */
  label: string
  /** All sensor_types this device produces */
  sensorTypes: string[]
  /** Detailed config for each value */
  values: MultiValueConfig[]
  /** Primary icon for the device */
  icon: string
  /** Interface type */
  interface: 'i2c' | 'onewire' | 'analog' | 'digital'
  /** Typical I2C address (if applicable) */
  i2cAddress?: string
}

/**
 * Registry of all known multi-value devices
 *
 * ⚠️ KRITISCH: sensor_type Strings müssen EXAKT mit ESP32-Code übereinstimmen!
 * Quelle: El Trabajante/src/models/sensor_registry.cpp (lines 88-140)
 */
export const MULTI_VALUE_DEVICES: Record<string, MultiValueDeviceConfig> = {
  sht31: {
    deviceType: 'sht31',
    label: 'SHT31 (Temp + Humidity)',
    sensorTypes: ['sht31_temp', 'sht31_humidity'],
    values: [
      { key: 'temp', sensorType: 'sht31_temp', label: 'Temperatur', unit: '°C', order: 1, icon: 'Thermometer' },
      { key: 'humidity', sensorType: 'sht31_humidity', label: 'Luftfeuchte', unit: '%RH', order: 2, icon: 'Droplets' }
    ],
    icon: 'Thermometer',
    interface: 'i2c',
    i2cAddress: '0x44'
  },

  bmp280: {
    deviceType: 'bmp280',
    label: 'BMP280 (Pressure + Temp)',
    sensorTypes: ['bmp280_pressure', 'bmp280_temp'],
    values: [
      { key: 'pressure', sensorType: 'bmp280_pressure', label: 'Luftdruck', unit: 'hPa', order: 1, icon: 'Gauge' },
      { key: 'temp', sensorType: 'bmp280_temp', label: 'Temperatur', unit: '°C', order: 2, icon: 'Thermometer' }
    ],
    icon: 'Gauge',
    interface: 'i2c',
    i2cAddress: '0x76'
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MULTI-VALUE HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Maps base sensor types (from DB/Server) to their device type
 *
 * Problem: DB speichert "SHT31", aber Registry erwartet "sht31_temp"/"sht31_humidity"
 * Lösung: Diese Map erlaubt das Erkennen von Base-Types
 */
const BASE_TYPE_TO_DEVICE: Record<string, string> = {
  // SHT31 variants
  'sht31': 'sht31',
  'SHT31': 'sht31',
  'sht31_temp': 'sht31',
  'sht31_humidity': 'sht31',
  // BMP280 variants
  'bmp280': 'bmp280',
  'BMP280': 'bmp280',
  'bmp280_temp': 'bmp280',
  'bmp280_pressure': 'bmp280',
  // BME280 (same as BMP280 with humidity)
  'bme280': 'bme280',
  'BME280': 'bme280',
  'bme280_temp': 'bme280',
  'bme280_humidity': 'bme280',
  'bme280_pressure': 'bme280',
}

/**
 * Extended MULTI_VALUE_DEVICES with BME280 support
 */
const BME280_CONFIG: MultiValueDeviceConfig = {
  deviceType: 'bme280',
  label: 'BME280 (Temp + Humidity + Pressure)',
  sensorTypes: ['bme280_temp', 'bme280_humidity', 'bme280_pressure', 'BME280'],
  values: [
    { key: 'temp', sensorType: 'bme280_temp', label: 'Temperatur', unit: '°C', order: 1, icon: 'Thermometer' },
    { key: 'humidity', sensorType: 'bme280_humidity', label: 'Luftfeuchte', unit: '%RH', order: 2, icon: 'Droplets' },
    { key: 'pressure', sensorType: 'bme280_pressure', label: 'Druck', unit: 'hPa', order: 3, icon: 'Gauge' }
  ],
  icon: 'Thermometer',
  interface: 'i2c',
  i2cAddress: '0x76'
}

// Add BME280 to registry
MULTI_VALUE_DEVICES['bme280'] = BME280_CONFIG

/**
 * Check if a sensor_type belongs to a multi-value device
 * Now also checks base types like "SHT31" or "BME280"
 */
export function isMultiValueSensorType(sensorType: string): boolean {
  // Direct check in base type map
  if (BASE_TYPE_TO_DEVICE[sensorType]) return true

  // Check in device configs
  return Object.values(MULTI_VALUE_DEVICES).some(
    device => device.sensorTypes.includes(sensorType)
  )
}

/**
 * Get device type from sensor_type
 *
 * Extended to recognize base types like "SHT31", "BME280"
 *
 * @example
 * getDeviceTypeFromSensorType('sht31_temp') // 'sht31'
 * getDeviceTypeFromSensorType('SHT31') // 'sht31' (NEW!)
 * getDeviceTypeFromSensorType('BME280') // 'bme280' (NEW!)
 * getDeviceTypeFromSensorType('ds18b20') // null (single-value)
 */
export function getDeviceTypeFromSensorType(sensorType: string): string | null {
  // First check base type map (handles uppercase variants)
  if (BASE_TYPE_TO_DEVICE[sensorType]) {
    return BASE_TYPE_TO_DEVICE[sensorType]
  }

  // Then check device configs
  for (const [deviceType, config] of Object.entries(MULTI_VALUE_DEVICES)) {
    if (config.sensorTypes.includes(sensorType)) {
      return deviceType
    }
  }
  return null
}

/**
 * Get all sensor_types for a device type
 *
 * @example
 * getSensorTypesForDevice('sht31') // ['sht31_temp', 'sht31_humidity']
 */
export function getSensorTypesForDevice(deviceType: string): string[] {
  return MULTI_VALUE_DEVICES[deviceType]?.sensorTypes ?? []
}

/**
 * Get device config by device type
 */
export function getMultiValueDeviceConfig(deviceType: string): MultiValueDeviceConfig | null {
  return MULTI_VALUE_DEVICES[deviceType] ?? null
}

/**
 * Get device config by any of its sensor_types
 */
export function getMultiValueDeviceConfigBySensorType(sensorType: string): MultiValueDeviceConfig | null {
  const deviceType = getDeviceTypeFromSensorType(sensorType)
  return deviceType ? MULTI_VALUE_DEVICES[deviceType] : null
}

/**
 * Get value config for a specific sensor_type within a multi-value device
 */
export function getValueConfigForSensorType(sensorType: string): MultiValueConfig | null {
  const deviceConfig = getMultiValueDeviceConfigBySensorType(sensorType)
  if (!deviceConfig) return null

  return deviceConfig.values.find(v => v.sensorType === sensorType) ?? null
}

// =============================================================================
// DISPLAY NAME (Multi-Value Disambiguation)
// =============================================================================

/**
 * Get display name for a sensor, differentiating multi-value siblings.
 *
 * Multi-value sensors (SHT31, BMP280, BME280) create multiple sensor_configs
 * with the same sensor_name (e.g. both "Temp&Hum"). This function appends
 * the sub-type label to disambiguate.
 *
 * Fallback chain:
 * 1. name + sub-type suffix (for multi-value sub-types): "Temp&Hum (Temperatur)"
 * 2. name as-is (for single-value sensors): "Substrat"
 * 3. SENSOR_TYPE_CONFIG label (when no name set): "Temperatur"
 *
 * @example
 * getSensorDisplayName({ sensor_type: 'sht31_temp', name: 'Temp&Hum' })
 * // => "Temp&Hum (Temperatur)"
 *
 * getSensorDisplayName({ sensor_type: 'sht31_humidity', name: 'Temp&Hum' })
 * // => "Temp&Hum (Luftfeuchte)"
 *
 * getSensorDisplayName({ sensor_type: 'ds18b20', name: 'Substrat' })
 * // => "Substrat"
 *
 * getSensorDisplayName({ sensor_type: 'sht31_temp', name: null })
 * // => "Temperatur"
 */
export function getSensorDisplayName(sensor: { sensor_type: string; name?: string | null }): string {
  const typeConfig = SENSOR_TYPE_CONFIG[sensor.sensor_type]
  const typeLabel = typeConfig?.label ?? sensor.sensor_type

  // No name set → type label
  if (!sensor.name) {
    return typeLabel
  }

  // Multi-value sub-type → append sub-type label for disambiguation
  const valueConfig = getValueConfigForSensorType(sensor.sensor_type)
  if (valueConfig) {
    return `${sensor.name} (${valueConfig.label})`
  }

  // Single-value sensor → name as-is
  return sensor.name
}

// =============================================================================
// INTERFACE TYPE INFERENCE
// =============================================================================

export type InterfaceType = 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL'

/**
 * Infer interface type from sensor_type.
 *
 * Matches server-side logic in sensors.py:_infer_interface_type
 *
 * Rules:
 * - sht31*, bmp280*, bme280*, bh1750*, veml7700* → I2C
 * - ds18b20* → ONEWIRE
 * - Everything else → ANALOG (default)
 *
 * @example
 * inferInterfaceType('ds18b20') // 'ONEWIRE'
 * inferInterfaceType('sht31_temp') // 'I2C'
 * inferInterfaceType('ph') // 'ANALOG'
 */
export function inferInterfaceType(sensorType: string): InterfaceType {
  const lower = sensorType.toLowerCase()

  // I2C sensors
  if (
    lower.includes('sht31') ||
    lower.includes('bmp280') ||
    lower.includes('bme280') ||
    lower.includes('bh1750') ||
    lower.includes('veml7700')
  ) {
    return 'I2C'
  }

  // OneWire sensors
  if (lower.includes('ds18b20')) {
    return 'ONEWIRE'
  }

  // Default to ANALOG
  return 'ANALOG'
}

/**
 * Get default I2C address for a sensor type (if applicable).
 *
 * @example
 * getDefaultI2CAddress('sht31_temp') // 0x44 (68 decimal)
 * getDefaultI2CAddress('ds18b20') // null (not I2C)
 */
export function getDefaultI2CAddress(sensorType: string): number | null {
  const deviceConfig = getMultiValueDeviceConfigBySensorType(sensorType)

  if (deviceConfig?.interface === 'i2c' && deviceConfig.i2cAddress) {
    // Convert hex string "0x44" to number
    return parseInt(deviceConfig.i2cAddress, 16)
  }

  return null
}

/**
 * Known I2C addresses for sensor types.
 * Used by AddSensorModal to show an address dropdown for I2C sensors.
 */
const I2C_ADDRESS_REGISTRY: Record<string, Array<{ value: number; hex: string; label: string }>> = {
  sht31: [
    { value: 0x44, hex: '0x44', label: '0x44 (Standard)' },
    { value: 0x45, hex: '0x45', label: '0x45 (ADDR HIGH)' },
  ],
  bmp280: [
    { value: 0x76, hex: '0x76', label: '0x76 (SDO LOW)' },
    { value: 0x77, hex: '0x77', label: '0x77 (SDO HIGH)' },
  ],
  bme280: [
    { value: 0x76, hex: '0x76', label: '0x76 (SDO LOW)' },
    { value: 0x77, hex: '0x77', label: '0x77 (SDO HIGH)' },
  ],
  bh1750: [
    { value: 0x23, hex: '0x23', label: '0x23 (ADDR LOW)' },
    { value: 0x5C, hex: '0x5C', label: '0x5C (ADDR HIGH)' },
  ],
  veml7700: [
    { value: 0x10, hex: '0x10', label: '0x10 (Standard)' },
  ],
}

/**
 * Get I2C address options for a sensor type.
 *
 * @example
 * getI2CAddressOptions('sht31_temp') // [{value: 0x44, hex: '0x44', label: '0x44 (Standard)'}, ...]
 * getI2CAddressOptions('ds18b20') // [] (not I2C)
 */
export function getI2CAddressOptions(sensorType: string): Array<{ value: number; hex: string; label: string }> {
  const lower = sensorType.toLowerCase()

  for (const [key, options] of Object.entries(I2C_ADDRESS_REGISTRY)) {
    if (lower.includes(key)) {
      return options
    }
  }

  return []
}

// ════════════════════════════════════════════════════════════════════════════
// SENSOR GROUPING & ZONE AGGREGATION (Dashboard Helpers)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Minimal sensor shape from props.device.sensors (unknown[])
 */
export interface RawSensor {
  sensor_type: string
  raw_value: number | null
  name: string
  unit?: string
  gpio?: number
  quality?: string
}

/**
 * Grouped sensor output for DeviceMiniCard display
 */
export interface GroupedSensor {
  baseType: string
  label: string
  values: {
    type: string
    label: string
    value: number | null
    unit: string
    icon: string
    quality: 'normal' | 'warning' | 'stale' | 'unknown'
  }[]
}

/**
 * Determine value quality for display coloring.
 *
 * - normal: within plausible range
 * - warning: outside plausible range
 * - stale: value is 0 for a sensor that should never be 0 (e.g., humidity)
 * - unknown: null/missing value
 */
function assessValueQuality(
  value: number | null,
  sensorType: string,
): 'normal' | 'warning' | 'stale' | 'unknown' {
  if (value === null || value === undefined) return 'unknown'

  const config = SENSOR_TYPE_CONFIG[sensorType]
  if (!config) return 'normal'

  // Value outside plausible range
  if (value < config.min || value > config.max) return 'warning'

  // Value is 0 for sensors that should never be 0
  if (value === 0) {
    const lower = sensorType.toLowerCase()
    if (lower.includes('humid') || lower.includes('pressure')) return 'stale'
  }

  return 'normal'
}

/**
 * Format a raw sensor_type as a readable display name.
 * "sht31_temp" → "Sht31 Temp", "ds18b20" → "Ds18b20"
 */
export function formatSensorType(sensorType: string): string {
  return sensorType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Groups sensors of a device by their base type.
 *
 * Multi-value sensors (SHT31, BME280) are resolved into individual value rows.
 * Single-value sensors (DS18B20, pH) become a group with one value.
 *
 * @example
 * Input:  [{sensor_type: 'sht31_temp', raw_value: 22}, {sensor_type: 'sht31_humidity', raw_value: 45}]
 * Output: [{baseType: 'sht31', label: 'SHT31', values: [{type: 'sht31_temp', label: 'Temperatur', ...}, ...]}]
 */
export function groupSensorsByBaseType(sensors: RawSensor[]): GroupedSensor[] {
  if (!sensors || sensors.length === 0) return []

  const groups = new Map<string, GroupedSensor>()

  for (const sensor of sensors) {
    const sType = sensor.sensor_type || ''
    if (!sType) continue

    // Check if this sensor belongs to a multi-value device
    const deviceType = getDeviceTypeFromSensorType(sType)
    const mvDevice = deviceType ? MULTI_VALUE_DEVICES[deviceType] : null

    if (mvDevice) {
      // Multi-value: group under device type
      if (!groups.has(deviceType!)) {
        groups.set(deviceType!, {
          baseType: deviceType!,
          label: mvDevice.label.split(' (')[0], // "SHT31" from "SHT31 (Temp + Humidity)"
          values: [],
        })
      }
      const group = groups.get(deviceType!)!

      // Find the specific value config for this sensor_type
      const valueConfig = mvDevice.values.find(v => v.sensorType === sType)

      // Check if this is a base type (e.g., "SHT31" instead of "sht31_temp")
      // If so, we need to expand it to all value types
      const isBaseType = sType.toLowerCase() === deviceType
        || sType.toUpperCase() === deviceType?.toUpperCase()
      const isAlreadyValueType = mvDevice.values.some(v => v.sensorType === sType)

      if (isBaseType && !isAlreadyValueType) {
        // This is a base type like "SHT31" — expand to all value types
        // but only if no individual value types exist yet
        const hasIndividualValues = sensors.some(s =>
          s.sensor_type !== sType && mvDevice.values.some(v => v.sensorType === s.sensor_type)
        )
        if (!hasIndividualValues) {
          // Show the base type as a single entry with its primary value config
          const primaryConfig = mvDevice.values[0]
          group.values.push({
            type: sType,
            label: (sensor.name && sensor.name.trim().length > 0) ? sensor.name : (primaryConfig?.label || getSensorLabel(sType)),
            value: sensor.raw_value,
            unit: primaryConfig?.unit || sensor.unit || getSensorUnit(sType),
            icon: primaryConfig?.icon || SENSOR_TYPE_CONFIG[sType]?.icon || 'Activity',
            quality: assessValueQuality(sensor.raw_value, sType),
          })
        }
        // If individual values exist, skip the base type entry
      } else if (valueConfig) {
        // Already-resolved value type — avoid duplicates
        const exists = group.values.some(v => v.type === sType)
        if (!exists) {
          group.values.push({
            type: sType,
            label: (sensor.name && sensor.name.trim().length > 0) ? sensor.name : valueConfig.label,
            value: sensor.raw_value,
            unit: valueConfig.unit,
            icon: valueConfig.icon || mvDevice.icon,
            quality: assessValueQuality(sensor.raw_value, sType),
          })
        }
      } else {
        // Unknown value type within the device — fallback
        const config = SENSOR_TYPE_CONFIG[sType]
        group.values.push({
          type: sType,
          label: (sensor.name && sensor.name.trim().length > 0) ? sensor.name : (config?.label || sType),
          value: sensor.raw_value,
          unit: config?.unit || sensor.unit || '',
          icon: config?.icon || 'Activity',
          quality: assessValueQuality(sensor.raw_value, sType),
        })
      }
    } else {
      // Single-value sensor (DS18B20, pH, etc.)
      // Use unique key per sensor to avoid collisions (e.g., 2x DS18B20)
      const uniqueKey = `${sType}_${sensor.gpio ?? sensors.indexOf(sensor)}`
      const config = SENSOR_TYPE_CONFIG[sType]
      const sensorName = (sensor.name && sensor.name.trim().length > 0) ? sensor.name : (config?.label || formatSensorType(sType))
      groups.set(uniqueKey, {
        baseType: sType,
        label: config?.label || formatSensorType(sType),
        values: [{
          type: sType,
          label: sensorName,
          value: sensor.raw_value,
          unit: config?.unit || sensor.unit || '',
          icon: config?.icon || 'Activity',
          quality: assessValueQuality(sensor.raw_value, sType),
        }],
      })
    }
  }

  // Sort multi-value groups by order
  for (const group of groups.values()) {
    if (group.values.length > 1) {
      const deviceType = getDeviceTypeFromSensorType(group.values[0]?.type || '')
      const mvDevice = deviceType ? MULTI_VALUE_DEVICES[deviceType] : null
      if (mvDevice) {
        group.values.sort((a, b) => {
          const orderA = mvDevice.values.find(v => v.sensorType === a.type)?.order ?? 99
          const orderB = mvDevice.values.find(v => v.sensorType === b.type)?.order ?? 99
          return orderA - orderB
        })
      }
    }
  }

  return Array.from(groups.values())
}

/**
 * Abstract sensor category for zone aggregation (device-independent)
 */
type AggCategory = 'temperature' | 'humidity' | 'pressure' | 'light' | 'co2' | 'moisture' | 'ph' | 'ec' | 'flow' | 'other'

/**
 * Map a sensor_type to an abstract category for aggregation
 */
function getSensorAggCategory(sensorType: string): AggCategory {
  const lower = sensorType.toLowerCase()
  if (lower.includes('temp') || lower === 'ds18b20') return 'temperature'
  if (lower.includes('humid')) return 'humidity'
  if (lower.includes('pressure')) return 'pressure'
  if (lower.includes('light') || lower.includes('lux')) return 'light'
  if (lower.includes('co2')) return 'co2'
  if (lower.includes('moisture') || lower.includes('soil')) return 'moisture'
  if (lower === 'ph') return 'ph'
  if (lower === 'ec') return 'ec'
  if (lower.includes('flow')) return 'flow'

  // Fallback: multi-value base types (e.g. "sht31", "bme280") that don't match
  // string-based checks above. Use SENSOR_TYPE_CONFIG category to determine mapping.
  const config = SENSOR_TYPE_CONFIG[sensorType] || SENSOR_TYPE_CONFIG[lower]
  if (config) {
    const categoryToAgg: Partial<Record<SensorCategoryId, AggCategory>> = {
      temperature: 'temperature',
      air: 'humidity',
      soil: 'moisture',
      light: 'light',
      water: 'other',
      other: 'other',
    }
    return categoryToAgg[config.category] ?? 'other'
  }

  return 'other'
}

/** Priority for category display order (lower = first) */
const CATEGORY_PRIORITY: Record<AggCategory, number> = {
  temperature: 1,
  humidity: 2,
  pressure: 3,
  moisture: 4,
  light: 5,
  co2: 6,
  ph: 7,
  ec: 8,
  flow: 9,
  other: 99,
}

/** Category display labels */
const CATEGORY_LABELS: Record<AggCategory, string> = {
  temperature: 'Temperatur',
  humidity: 'Luftfeuchte',
  pressure: 'Luftdruck',
  moisture: 'Bodenfeuchte',
  light: 'Licht',
  co2: 'CO2',
  ph: 'pH',
  ec: 'Leitfähigkeit',
  flow: 'Durchfluss',
  other: 'Sonstige',
}

/** Category default units */
const CATEGORY_UNITS: Record<AggCategory, string> = {
  temperature: '°C',
  humidity: '%RH',
  pressure: 'hPa',
  moisture: '%',
  light: 'lux',
  co2: 'ppm',
  ph: 'pH',
  ec: 'µS/cm',
  flow: 'L/min',
  other: '',
}

/**
 * Zone-level sensor aggregation result
 */
export interface ZoneAggregation {
  sensorTypes: {
    type: AggCategory
    label: string
    avg: number
    min: number
    max: number
    count: number
    unit: string
  }[]
  /** Number of categories truncated (beyond the visible 3) */
  extraTypeCount: number
  deviceCount: number
  onlineCount: number
}

/**
 * Aggregates sensor data across all devices in a zone.
 *
 * Groups by abstract sensor category (all temperature sensors together,
 * regardless of whether SHT31, DS18B20, or BME280).
 *
 * Returns max 3 sensor types, sorted by priority (temperature > humidity > rest).
 */
export function aggregateZoneSensors(devices: any[]): ZoneAggregation {
  const deviceCount = devices.length
  const onlineCount = devices.filter(d =>
    d.status === 'online' || d.connected === true
  ).length

  if (deviceCount === 0) {
    return { sensorTypes: [], extraTypeCount: 0, deviceCount: 0, onlineCount: 0 }
  }

  // Collect all sensor values grouped by category
  const categoryValues = new Map<AggCategory, number[]>()

  for (const device of devices) {
    const sensors = (device.sensors as RawSensor[] | undefined) || []
    const grouped = groupSensorsByBaseType(sensors)

    for (const group of grouped) {
      for (const val of group.values) {
        if (val.value === null || val.value === undefined) continue
        if (val.quality === 'stale') continue // Skip stale data
        if (val.value === 0 && val.quality === 'unknown') continue // Skip DB init value (no live data yet)

        const category = getSensorAggCategory(val.type)
        if (category === 'other') continue // Skip uncategorized

        if (!categoryValues.has(category)) {
          categoryValues.set(category, [])
        }
        categoryValues.get(category)!.push(val.value)
      }
    }
  }

  // Build aggregation per category
  const sensorTypes: ZoneAggregation['sensorTypes'] = []

  for (const [category, values] of categoryValues) {
    if (values.length === 0) continue

    const sum = values.reduce((a, b) => a + b, 0)
    sensorTypes.push({
      type: category,
      label: CATEGORY_LABELS[category],
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
      unit: CATEGORY_UNITS[category],
    })
  }

  // Sort by priority and limit to 3
  sensorTypes.sort((a, b) => CATEGORY_PRIORITY[a.type] - CATEGORY_PRIORITY[b.type])
  const extraTypeCount = Math.max(0, sensorTypes.length - 3)
  sensorTypes.splice(3)

  return { sensorTypes, extraTypeCount, deviceCount, onlineCount }
}

/**
 * Formats an aggregated sensor value for the zone header.
 *
 * 1 value:    "22.0 °C" (thin space before unit)
 * 2+ values:  "18.3 – 22.5 °C" (range min – max)
 * Same min/max: "22.0 °C (2)" (count in parens)
 */
export function formatAggregatedValue(
  agg: ZoneAggregation['sensorTypes'][0],
  _deviceCount: number,
): string {
  if (agg.count === 0) return ''

  if (agg.count === 1) {
    return `${agg.min.toFixed(1)}\u2009${agg.unit}`
  }

  // Multiple values: show range
  const minStr = agg.min.toFixed(1)
  const maxStr = agg.max.toFixed(1)

  if (minStr === maxStr) {
    // Same value across sensors — show count
    return `${minStr}\u2009${agg.unit} (${agg.count})`
  }

  return `${minStr} – ${maxStr}\u2009${agg.unit}`
}





















