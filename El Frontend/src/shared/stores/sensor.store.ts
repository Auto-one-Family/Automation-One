/**
 * Sensor Store
 *
 * Handles sensor-related WebSocket events.
 * Mirrors server-side sensor_handler.py and sensor_health_job.py.
 *
 * Server-centric architecture:
 * ESP32 → MQTT (kaiser/{esp_id}/sensor/data) → Server → WS (sensor_data) → this store
 * Server (maintenance job) → WS (sensor_health) → this store
 *
 * Cross-store dependency: Receives devices array from esp.store.ts via dispatcher.
 *
 * Sensor Data Processing (Phase 6 HYBRID LOGIC):
 * 1. Known multi-value sensors → Group by GPIO using registry
 * 2. Unknown multi-value → Dynamic detection when multiple types on same GPIO
 * 3. Single-value sensors → Unchanged behavior
 *
 * IMPORTANT: ALL sensor processing/logic happens on the SERVER.
 * The frontend only receives pre-processed values and updates the UI.
 */

import { defineStore } from 'pinia'
import { createLogger } from '@/utils/logger'
import {
  getDeviceTypeFromSensorType,
  getMultiValueDeviceConfigBySensorType,
} from '@/utils/sensorDefaults'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MultiValueEntry, QualityLevel, SensorHealthEvent } from '@/types'

const logger = createLogger('SensorStore')

/** Payload shape for sensor_data WebSocket events */
interface SensorDataPayload {
  esp_id?: string
  device_id?: string
  gpio: number
  sensor_type: string
  value: number
  unit: string
  quality?: QualityLevel
  timestamp?: number
  // Address-based matching for multi-sensor GPIOs (Phase 3)
  config_id?: string
  i2c_address?: number
  onewire_address?: string
}

/** Message wrapper for sensor_data events */
interface SensorDataMessage {
  data: SensorDataPayload
}

/** Message wrapper for sensor_health events */
interface SensorHealthMessage {
  data: SensorHealthEvent
}

/**
 * Normalize raw timestamp from server WebSocket event to ISO string.
 *
 * Server sends esp32_timestamp_raw which can be in seconds OR milliseconds.
 * Mirrors server-side logic: if > 1e10, treat as milliseconds; else seconds.
 * (sensor_handler.py line 315-322)
 */
function normalizeRawTimestamp(ts: number | undefined | null): string {
  if (!ts) return new Date().toISOString()
  const ms = ts > 1e10 ? ts : ts * 1000
  // Sanity: if result is unreasonable (before year 2000 or after 2100), use now
  if (ms < 946684800000 || ms > 4102444800000) return new Date().toISOString()
  return new Date(ms).toISOString()
}

// ============================================================================
// Helper: Get worst quality from multi-values
// ============================================================================
function getWorstQuality(values: MultiValueEntry[]): QualityLevel {
  const qualityOrder: QualityLevel[] = ['excellent', 'good', 'fair', 'poor', 'bad', 'stale', 'error']

  let worstIndex = 0
  for (const value of values) {
    const index = qualityOrder.indexOf(value.quality)
    if (index > worstIndex) {
      worstIndex = index
    }
  }

  return qualityOrder[worstIndex]
}

// ============================================================================
// Helper: Match sensor to incoming WS event data
// Supports config_id (primary), address-based (I2C/OneWire), and legacy fallback
// ============================================================================
function matchSensorToEvent(sensor: MockSensor, data: SensorDataPayload): boolean {
  // Primary: config_id match (most unique key)
  if (data.config_id && sensor.config_id) {
    return sensor.config_id === data.config_id
  }

  // Base: gpio + sensor_type must match
  if (sensor.gpio !== data.gpio || sensor.sensor_type !== data.sensor_type) {
    return false
  }

  // Address differentiation when available
  if (data.i2c_address != null && sensor.i2c_address != null) {
    return sensor.i2c_address === data.i2c_address
  }
  if (data.onewire_address && sensor.onewire_address) {
    return sensor.onewire_address === data.onewire_address
  }

  // Legacy: no address in event → first match (backward compatibility)
  return true
}

export const useSensorStore = defineStore('sensor', () => {

  // =========================================================================
  // Sensor Data Handler
  // =========================================================================

  /**
   * Handle sensor_data WebSocket event.
   * Updates sensor value in corresponding device for live updates.
   *
   * Post-Fix1: Backend delivers separate sensor_config entries per value type
   * (e.g., sht31_temp and sht31_humidity as two distinct entries).
   * Priority: exact match by gpio + sensor_type first (handles multi-value correctly).
   * Fallback: legacy multi-value merge logic for backward compatibility.
   */
  function handleSensorData(
    message: SensorDataMessage,
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
  ): void {
    const data = message.data
    const espId = data.esp_id || data.device_id
    const gpio = data.gpio
    const sensorType = data.sensor_type

    if (!espId || gpio === undefined) return

    const device = devices.find(d => getDeviceId(d) === espId)
    if (!device?.sensors) return

    const sensors = device.sensors as MockSensor[]

    // Post-Fix1: Find exact match by config_id, address, or gpio+sensor_type.
    // Handles multi-sensor GPIOs (e.g. 2x DS18B20) via address-based matching.
    const exactMatch = sensors.find(s => matchSensorToEvent(s, data))

    if (exactMatch) {
      if (data.value !== undefined) exactMatch.raw_value = data.value
      if (data.quality) exactMatch.quality = data.quality
      if (data.unit) exactMatch.unit = data.unit
      exactMatch.last_read = normalizeRawTimestamp(data.timestamp)
      return
    }

    // Fallback: legacy multi-value merge for sensors not yet in array
    const knownDeviceType = getDeviceTypeFromSensorType(sensorType)

    if (knownDeviceType) {
      handleKnownMultiValueSensor(sensors, data, knownDeviceType)
      return
    }

    // Dynamic multi-value detection (different type on same GPIO)
    const existingSensor = sensors.find(s => s.gpio === gpio)

    if (existingSensor && existingSensor.sensor_type !== sensorType && !existingSensor.is_multi_value) {
      handleDynamicMultiValueSensor(existingSensor, data)
      return
    }

    // Single-value sensor (or first value of unknown multi-value)
    handleSingleValueSensorData(sensors, data)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HANDLER 1: KNOWN MULTI-VALUE (Registry-based)
  // ════════════════════════════════════════════════════════════════════════════
  function handleKnownMultiValueSensor(
    sensors: MockSensor[],
    data: SensorDataPayload,
    deviceType: string
  ): void {
    let sensor = sensors.find(s => s.gpio === data.gpio)
    const deviceConfig = getMultiValueDeviceConfigBySensorType(data.sensor_type)

    if (!sensor) {
      sensor = {
        gpio: data.gpio,
        sensor_type: data.sensor_type,
        name: deviceConfig?.label ?? data.sensor_type,
        raw_value: data.value,
        unit: data.unit,
        quality: data.quality ?? 'good',
        raw_mode: true,
        last_read: new Date().toISOString(),
        device_type: deviceType,
        is_multi_value: true,
        multi_values: {}
      }
      sensors.push(sensor)
    }

    if (!sensor.multi_values) {
      sensor.multi_values = {}
      sensor.is_multi_value = true
      sensor.device_type = deviceType
    }

    sensor.multi_values[data.sensor_type] = {
      value: data.value,
      unit: data.unit,
      quality: data.quality ?? 'good',
      timestamp: Date.now(),
      sensorType: data.sensor_type
    }

    if (deviceConfig) {
      const primaryType = deviceConfig.values[0]?.sensorType
      if (sensor.multi_values[primaryType]) {
        sensor.raw_value = sensor.multi_values[primaryType].value
        sensor.unit = sensor.multi_values[primaryType].unit
      }
    }

    sensor.quality = getWorstQuality(Object.values(sensor.multi_values))
    sensor.last_read = normalizeRawTimestamp(data.timestamp)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HANDLER 2: DYNAMIC MULTI-VALUE (Auto-detected)
  // ════════════════════════════════════════════════════════════════════════════
  function handleDynamicMultiValueSensor(
    existingSensor: MockSensor,
    data: SensorDataPayload
  ): void {
    if (!existingSensor.is_multi_value) {
      existingSensor.is_multi_value = true
      existingSensor.device_type = null
      existingSensor.multi_values = {
        [existingSensor.sensor_type]: {
          value: existingSensor.raw_value,
          unit: existingSensor.unit,
          quality: existingSensor.quality,
          timestamp: Date.now(),
          sensorType: existingSensor.sensor_type
        }
      }
      existingSensor.name = `Multi-Sensor GPIO ${existingSensor.gpio}`
    }

    existingSensor.multi_values![data.sensor_type] = {
      value: data.value,
      unit: data.unit,
      quality: data.quality ?? 'good',
      timestamp: Date.now(),
      sensorType: data.sensor_type
    }

    existingSensor.quality = getWorstQuality(Object.values(existingSensor.multi_values!))
    existingSensor.last_read = normalizeRawTimestamp(data.timestamp)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HANDLER 3: SINGLE-VALUE (unchanged behavior)
  // ════════════════════════════════════════════════════════════════════════════
  function handleSingleValueSensorData(sensors: MockSensor[], data: SensorDataPayload): void {
    const sensor = sensors.find(s => matchSensorToEvent(s, data))

    if (sensor) {
      if (data.value !== undefined) sensor.raw_value = data.value
      if (data.quality) sensor.quality = data.quality
      if (data.unit) sensor.unit = data.unit
      sensor.last_read = normalizeRawTimestamp(data.timestamp)
    }
  }

  // =========================================================================
  // Sensor Health Handler
  // =========================================================================

  /**
   * Handle sensor_health WebSocket event.
   * Updates sensor stale status from server maintenance job.
   * Server: maintenance/jobs/sensor_health.py
   */
  function handleSensorHealth(
    message: SensorHealthMessage,
    findDeviceByEspId: (espId: string) => { device: ESPDevice; index: number } | null,
  ): void {
    const event = message.data as SensorHealthEvent

    if (!event.esp_id || event.gpio === undefined) {
      logger.warn('sensor_health missing esp_id or gpio')
      return
    }

    const result = findDeviceByEspId(event.esp_id)
    if (!result) {
      logger.debug(`sensor_health: Device not found: ${event.esp_id}`)
      return
    }

    const { device } = result
    if (!device.sensors) {
      logger.debug(`sensor_health: Device ${event.esp_id} has no sensors`)
      return
    }

    const sensors = device.sensors as Array<{
      gpio: number
      is_stale?: boolean
      stale_reason?: string
      last_reading_at?: string | null
      operating_mode?: string
      timeout_seconds?: number
    }>
    const sensorIndex = sensors.findIndex(s => s.gpio === event.gpio)
    if (sensorIndex === -1) {
      logger.debug(`sensor_health: Sensor GPIO ${event.gpio} not found on ${event.esp_id}`)
      return
    }

    const sensor = sensors[sensorIndex]
    sensor.is_stale = event.is_stale
    sensor.stale_reason = event.stale_reason
    sensor.last_reading_at = event.last_reading_at
    sensor.operating_mode = event.operating_mode
    sensor.timeout_seconds = event.timeout_seconds

    if (event.is_stale) {
      logger.warn(`Sensor stale: ${event.esp_id} GPIO ${event.gpio} ` +
        `(${event.sensor_type}) - ${event.stale_reason}, ` +
        `overdue by ${event.seconds_overdue}s`
      )
    } else {
      logger.debug(`Sensor health updated: ${event.esp_id} GPIO ${event.gpio} ` +
        `is_stale=${event.is_stale}`
      )
    }
  }

  return {
    handleSensorData,
    handleSensorHealth,
  }
})
