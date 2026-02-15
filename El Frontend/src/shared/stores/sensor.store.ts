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
}

/** Message wrapper for sensor_data events */
interface SensorDataMessage {
  data: SensorDataPayload
}

/** Message wrapper for sensor_health events */
interface SensorHealthMessage {
  data: SensorHealthEvent
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

export const useSensorStore = defineStore('sensor', () => {

  // =========================================================================
  // Sensor Data Handler
  // =========================================================================

  /**
   * Handle sensor_data WebSocket event.
   * Updates sensor value in corresponding device for live updates.
   *
   * Phase 6: HYBRID LOGIC
   * 1. Known multi-value sensors → Group by GPIO using registry
   * 2. Unknown multi-value → Dynamic detection when multiple types on same GPIO
   * 3. Single-value sensors → Unchanged behavior
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

    // HYBRID LOGIC:
    // 1. Check if this is a KNOWN multi-value sensor type (Registry)
    const knownDeviceType = getDeviceTypeFromSensorType(sensorType)

    if (knownDeviceType) {
      handleKnownMultiValueSensor(sensors, data, knownDeviceType)
      return
    }

    // 2. Check if there's already a sensor on this GPIO with different type
    const existingSensor = sensors.find(s => s.gpio === gpio)

    if (existingSensor && existingSensor.sensor_type !== sensorType && !existingSensor.is_multi_value) {
      handleDynamicMultiValueSensor(existingSensor, data)
      return
    }

    // 3. Single-value sensor (or first value of unknown multi-value)
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
    sensor.last_read = data.timestamp
      ? new Date(data.timestamp * 1000).toISOString()
      : new Date().toISOString()
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
    existingSensor.last_read = data.timestamp
      ? new Date(data.timestamp * 1000).toISOString()
      : new Date().toISOString()
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HANDLER 3: SINGLE-VALUE (unchanged behavior)
  // ════════════════════════════════════════════════════════════════════════════
  function handleSingleValueSensorData(sensors: MockSensor[], data: SensorDataPayload): void {
    const sensor = sensors.find(
      s => s.gpio === data.gpio && s.sensor_type === data.sensor_type
    )

    if (sensor) {
      if (data.value !== undefined) sensor.raw_value = data.value
      if (data.quality) sensor.quality = data.quality
      if (data.unit) sensor.unit = data.unit
      sensor.last_read = data.timestamp
        ? new Date(data.timestamp * 1000).toISOString()
        : new Date().toISOString()
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
