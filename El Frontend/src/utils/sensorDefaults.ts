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
  /** Ob dieser Sensor-Typ On-Demand-Messungen unterstützt */
  supportsOnDemand?: boolean
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
    label: 'Temperatur (DS18B20)',
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
    // OneWire (Phase 6)
    requiresAddressScanning: true,
    supportsMultipleOnSamePin: true,
    recommendedGpios: [4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
  },

  // Lowercase variant for consistency (ESP32 may send lowercase)
  'ds18b20': {
    label: 'Temperatur (DS18B20)',
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
    label: 'Leitfähigkeit (EC)',
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
  },

  'sht31_temp': {
    label: 'Temperatur',
    unit: '°C',
    min: -40,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    defaultValue: 22.0,
    description: 'SHT31 Temperaturwert.',
    category: 'temperature',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
    supportsOnDemand: false,
  },

  'SHT31_humidity': {
    label: 'Luftfeuchtigkeit (SHT31)',
    unit: '% RH',
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
    label: 'Temperatur (BME280)',
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
  },

  'BME280_humidity': {
    label: 'Luftfeuchtigkeit (BME280)',
    unit: '% RH',
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
    label: 'Luftdruck (BME280)',
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
    label: 'Durchflusssensor',
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
    label: 'Lichtsensor',
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
    label: 'CO2-Sensor',
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
      { key: 'humidity', sensorType: 'sht31_humidity', label: 'Luftfeuchtigkeit', unit: '% RH', order: 2, icon: 'Droplets' }
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
    { key: 'humidity', sensorType: 'bme280_humidity', label: 'Feuchtigkeit', unit: '% RH', order: 2, icon: 'Droplets' },
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





















