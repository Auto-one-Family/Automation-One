/** Minimal sensor thresholds for Phyta wizard (subset of El Frontend SENSOR_TYPE_CONFIG). */

import { normalizeSensorType } from '@/utils/sensorMatch'

export interface SensorTypeConfig {
  label: string
  unit: string
  min: number
  max: number
  decimals: number
  icon: string
  description?: string
}

export const SENSOR_TYPE_CONFIG: Record<string, SensorTypeConfig> = {
  ds18b20: {
    label: 'Temperatur',
    unit: '°C',
    min: -55,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    description: 'Digitaler Temperatursensor (OneWire).',
  },
  sht31: {
    label: 'Temp & Feuchte',
    unit: '°C',
    min: -40,
    max: 125,
    decimals: 1,
    icon: 'Thermometer',
    description: 'Misst Temperatur und Luftfeuchtigkeit.',
  },
  bme280: {
    label: 'Klima',
    unit: '°C',
    min: -40,
    max: 85,
    decimals: 1,
    icon: 'Thermometer',
    description: 'Temperatur, Luftfeuchtigkeit und Luftdruck.',
  },
  ph: {
    label: 'pH-Wert',
    unit: 'pH',
    min: 0,
    max: 14,
    decimals: 2,
    icon: 'Droplet',
    description: 'Säuregrad der Lösung.',
  },
  ec: {
    label: 'Leitfähigkeit',
    unit: 'µS/cm',
    min: 0,
    max: 5000,
    decimals: 0,
    icon: 'Zap',
    description: 'Elektrische Leitfähigkeit.',
  },
  moisture: {
    label: 'Bodenfeuchte',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 0,
    icon: 'Droplets',
    description: 'Bodenfeuchtigkeit in Prozent.',
  },
  bh1750: {
    label: 'Licht',
    unit: 'lux',
    min: 0,
    max: 100000,
    decimals: 0,
    icon: 'Sun',
    description: 'Beleuchtungsstärke (I2C).',
  },
  co2: {
    label: 'CO₂',
    unit: 'ppm',
    min: 400,
    max: 5000,
    decimals: 0,
    icon: 'Cloud',
    description: 'CO₂-Konzentration in ppm.',
  },
  flow: {
    label: 'Durchfluss',
    unit: 'L/min',
    min: 0,
    max: 100,
    decimals: 2,
    icon: 'Waves',
    description: 'Durchflussrate.',
  },
}

/** Multi-value sub-types (e.g. SHT31 → temp + humidity rows in DB). */
const MULTI_VALUE_SUB_TYPES: Record<string, { label: string; unit?: string; decimals?: number }> = {
  sht31_temp: { label: 'Temperatur', unit: '°C', decimals: 1 },
  sht31_humidity: { label: 'Luftfeuchte', unit: '%RH', decimals: 0 },
  bme280_temp: { label: 'Temperatur', unit: '°C', decimals: 1 },
  bme280_humidity: { label: 'Luftfeuchte', unit: '%RH', decimals: 0 },
  bme280_pressure: { label: 'Luftdruck', unit: 'hPa', decimals: 0 },
}

const SENSOR_TYPE_ALIASES: Record<string, string> = {
  soil_moisture: 'moisture',
  sht31_temp: 'sht31',
  sht31_humidity: 'sht31',
  bme280_temp: 'bme280',
  bme280_humidity: 'bme280',
  bme280_pressure: 'bme280',
}

const byLowerKey = Object.fromEntries(
  Object.entries(SENSOR_TYPE_CONFIG).map(([k, v]) => [k.toLowerCase(), v]),
)

function canonicalSensorType(sensorType: string): string {
  const normalized = normalizeSensorType(sensorType)
  return SENSOR_TYPE_ALIASES[normalized] ?? normalized
}

export function getSensorConfig(sensorType: string): SensorTypeConfig | null {
  const normalized = normalizeSensorType(sensorType)
  const sub = MULTI_VALUE_SUB_TYPES[normalized]
  if (sub) {
    return {
      label: sub.label,
      unit: sub.unit ?? '%',
      min: 0,
      max: 100,
      decimals: sub.decimals ?? 1,
      icon: 'Gauge',
    }
  }

  const canonical = canonicalSensorType(sensorType)
  return SENSOR_TYPE_CONFIG[sensorType] ?? SENSOR_TYPE_CONFIG[canonical] ?? byLowerKey[normalized] ?? null
}

/** Operator-facing label — same strings as palette chips (`getPaletteSensorLabel`). */
export function getSensorLabel(sensorType: string): string {
  const normalized = normalizeSensorType(sensorType)
  const sub = MULTI_VALUE_SUB_TYPES[normalized]
  if (sub) return sub.label

  const direct = getSensorConfig(sensorType)
  if (direct) return direct.label

  const base = normalized.split('_')[0]
  const baseConfig = getSensorConfig(base)
  if (baseConfig) return baseConfig.label

  return sensorType
}

export function getSensorUnit(sensorType: string): string {
  return getSensorConfig(sensorType)?.unit ?? ''
}

export function formatSensorValue(sensor: {
  sensor_type: string
  raw_value?: number | null
}): string | number | null {
  if (sensor.raw_value == null) return null
  const cfg = getSensorConfig(sensor.sensor_type)
  const decimals = cfg?.decimals ?? 1
  return Number(sensor.raw_value.toFixed(decimals))
}

/**
 * Card title: custom name, or type label; multi-value rows get sub-type suffix.
 */
export function getSensorDisplayName(sensor: {
  sensor_type: string
  name?: string | null
}): string {
  const normalized = normalizeSensorType(sensor.sensor_type)
  const sub = MULTI_VALUE_SUB_TYPES[normalized]
  const typeLabel = getSensorLabel(sensor.sensor_type)
  const custom = sensor.name?.trim()

  if (sub && custom) {
    return `${custom} (${sub.label})`
  }

  if (!custom || custom.toLowerCase() === normalized || custom.toLowerCase() === sensor.sensor_type.toLowerCase()) {
    return typeLabel
  }

  return custom
}
