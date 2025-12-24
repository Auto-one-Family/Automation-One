/**
 * Unified ESP Store
 * 
 * Manages both Mock and Real ESP devices in a unified way.
 * Automatically routes API calls based on ESP type detection.
 */

import { defineStore } from 'pinia'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { espApi, type ESPDevice, type ESPDeviceUpdate, type ESPDeviceCreate } from '@/api/esp'
import { debugApi } from '@/api/debug'
import { useWebSocket } from '@/composables/useWebSocket'
import type { MockSystemState, MockSensorConfig, MockActuatorConfig, QualityLevel, MessageType } from '@/types'

/**
 * Extract error message from Axios error response.
 */
function extractErrorMessage(err: unknown, fallback: string): string {
  const axiosError = err as { response?: { data?: { detail?: string | Array<{ msg?: string; loc?: string[] }> } } }
  const detail = axiosError.response?.data?.detail
  
  if (!detail) return fallback
  
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const field = d.loc?.slice(1).join('.') || 'unknown'
      return `${field}: ${d.msg || 'validation error'}`
    }).join('; ')
  }
  
  return detail
}

export const useEspStore = defineStore('esp', () => {
  // State
  const devices = ref<ESPDevice[]>([])
  const selectedDeviceId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // WebSocket integration
  // Note: Server broadcasts these types from MQTT handlers:
  // - esp_health (heartbeat_handler.py)
  // - sensor_data (sensor_handler.py)
  // - actuator_status (actuator_handler.py)
  // - actuator_alert (actuator_alert_handler.py)
  const ws = useWebSocket({
    autoConnect: true,
    autoReconnect: true,
    filters: {
      types: ['esp_health', 'sensor_data', 'actuator_status', 'actuator_alert'] as MessageType[],
    },
  })

  // Store unsubscribe functions for cleanup
  const wsUnsubscribers: (() => void)[] = []

  // Getters
  const selectedDevice = computed(() =>
    devices.value.find(device => 
      (device.device_id || device.esp_id) === selectedDeviceId.value
    ) || null
  )

  const deviceCount = computed(() => devices.value.length)

  const onlineDevices = computed(() =>
    devices.value.filter(device => 
      device.status === 'online' || device.connected === true
    )
  )

  const offlineDevices = computed(() =>
    devices.value.filter(device => 
      device.status === 'offline' || device.connected === false
    )
  )

  const mockDevices = computed(() =>
    devices.value.filter(device => 
      espApi.isMockEsp(device.device_id || device.esp_id || '')
    )
  )

  const realDevices = computed(() =>
    devices.value.filter(device => 
      !espApi.isMockEsp(device.device_id || device.esp_id || '')
    )
  )

  const devicesByZone = computed(() => (zoneId: string) =>
    devices.value.filter(device => device.zone_id === zoneId)
  )

  const masterZoneDevices = computed(() =>
    devices.value.filter(device => device.is_zone_master === true)
  )

  /**
   * Check if device is Mock ESP
   */
  function isMock(deviceId: string): boolean {
    return espApi.isMockEsp(deviceId)
  }

  /**
   * Get normalized device ID
   */
  function getDeviceId(device: ESPDevice): string {
    return device.device_id || device.esp_id || ''
  }

  // Actions
  async function fetchAll(params?: {
    zone_id?: string
    status?: string
    hardware_type?: string
    page?: number
    page_size?: number
  }): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const fetchedDevices = await espApi.listDevices(params)

      // Deduplicate by device ID (safety net for API-level deduplication failures)
      const seen = new Set<string>()
      const dedupedDevices: ESPDevice[] = []

      for (const device of fetchedDevices) {
        const id = getDeviceId(device)
        if (id && !seen.has(id)) {
          seen.add(id)
          dedupedDevices.push(device)
        } else if (id) {
          console.warn(`[ESP Store] Duplicate device filtered: ${id}`)
        }
      }

      devices.value = dedupedDevices
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to fetch ESP devices')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function fetchDevice(deviceId: string): Promise<ESPDevice> {
    isLoading.value = true
    error.value = null

    try {
      const device = await espApi.getDevice(deviceId)
      
      // Update device in list if exists, otherwise add
      const index = devices.value.findIndex(d => 
        getDeviceId(d) === getDeviceId(device)
      )
      if (index !== -1) {
        devices.value[index] = device
      } else {
        devices.value.push(device)
      }
      
      return device
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to fetch device ${deviceId}`)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createDevice(config: ESPDeviceCreate): Promise<ESPDevice> {
    isLoading.value = true
    error.value = null

    try {
      const device = await espApi.createDevice(config)
      const deviceId = getDeviceId(device)

      // Check if device already exists (prevent duplicates)
      const existingIndex = devices.value.findIndex(d => getDeviceId(d) === deviceId)
      if (existingIndex !== -1) {
        // Replace existing with new data
        devices.value[existingIndex] = device
        console.debug(`[ESP Store] Device ${deviceId} already exists, updated`)
      } else {
        devices.value.push(device)
      }

      return device
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to create ESP device')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function updateDevice(deviceId: string, update: ESPDeviceUpdate): Promise<ESPDevice> {
    isLoading.value = true
    error.value = null

    try {
      const device = await espApi.updateDevice(deviceId, update)
      
      // Update device in list
      const index = devices.value.findIndex(d => 
        getDeviceId(d) === getDeviceId(device)
      )
      if (index !== -1) {
        devices.value[index] = device
      }
      
      return device
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to update device ${deviceId}`)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function deleteDevice(deviceId: string): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      await espApi.deleteDevice(deviceId)
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } }

      // If 404, device is already gone - still remove from local list
      if (axiosError.response?.status === 404) {
        console.warn(`[ESP Store] Device ${deviceId} not found on server, removing from local list`)
      } else {
        error.value = extractErrorMessage(err, `Fehler beim Löschen von ${deviceId}`)
        throw err
      }
    } finally {
      // Always remove from local list (handles orphaned devices)
      devices.value = devices.value.filter(d => getDeviceId(d) !== deviceId)

      if (selectedDeviceId.value === deviceId) {
        selectedDeviceId.value = null
      }

      isLoading.value = false
    }
  }

  async function getHealth(deviceId: string) {
    error.value = null

    try {
      return await espApi.getHealth(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to get health for ${deviceId}`)
      throw err
    }
  }

  async function restartDevice(deviceId: string, delaySeconds?: number, reason?: string) {
    error.value = null

    try {
      return await espApi.restartDevice(deviceId, delaySeconds, reason)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to restart device ${deviceId}`)
      throw err
    }
  }

  async function resetDevice(deviceId: string, preserveWifi: boolean = false) {
    error.value = null

    try {
      return await espApi.resetDevice(deviceId, preserveWifi)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to reset device ${deviceId}`)
      throw err
    }
  }

  // Mock ESP specific actions (for backward compatibility)
  async function triggerHeartbeat(deviceId: string): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Heartbeat trigger is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.triggerHeartbeat(deviceId)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } }

      // Special handling for orphaned mock devices
      if (axiosError.response?.status === 404) {
        error.value = `Mock ESP "${deviceId}" ist verwaist (nur in DB, nicht im Debug-Store). Bitte löschen und neu erstellen.`
      } else {
        error.value = extractErrorMessage(err, 'Failed to trigger heartbeat')
      }
      throw err
    }
  }

  async function setState(deviceId: string, state: MockSystemState, reason?: string): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Set state is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.setState(deviceId, state, reason)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } }

      // Special handling for orphaned mock devices
      if (axiosError.response?.status === 404) {
        error.value = `Mock ESP "${deviceId}" ist verwaist (nur in DB, nicht im Debug-Store). Bitte löschen und neu erstellen.`
      } else {
        error.value = extractErrorMessage(err, 'Failed to set state')
      }
      throw err
    }
  }

  async function setAutoHeartbeat(deviceId: string, enabled: boolean, interval: number = 60): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Auto-heartbeat is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.setAutoHeartbeat(deviceId, enabled, interval)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to configure auto-heartbeat')
      throw err
    }
  }

  async function addSensor(deviceId: string, config: MockSensorConfig): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Add sensor is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.addSensor(deviceId, config)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to add sensor')
      throw err
    }
  }

  async function setSensorValue(
    deviceId: string,
    gpio: number,
    rawValue: number,
    quality?: QualityLevel,
    publish: boolean = true
  ): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Set sensor value is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.setSensorValue(deviceId, gpio, rawValue, quality, publish)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to set sensor value')
      throw err
    }
  }

  async function removeSensor(deviceId: string, gpio: number): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Remove sensor is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.removeSensor(deviceId, gpio)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to remove sensor')
      throw err
    }
  }

  async function addActuator(deviceId: string, config: MockActuatorConfig): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Add actuator is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.addActuator(deviceId, config)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to add actuator')
      throw err
    }
  }

  async function setActuatorState(
    deviceId: string,
    gpio: number,
    state: boolean,
    pwmValue?: number
  ): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Set actuator state is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.setActuatorState(deviceId, gpio, state, pwmValue)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to set actuator state')
      throw err
    }
  }

  async function emergencyStop(deviceId: string, reason: string = 'manual'): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Emergency stop is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.emergencyStop(deviceId, reason)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to trigger emergency stop')
      throw err
    }
  }

  async function clearEmergency(deviceId: string): Promise<void> {
    if (!isMock(deviceId)) {
      throw new Error('Clear emergency is only available for Mock ESPs')
    }

    error.value = null

    try {
      await debugApi.clearEmergency(deviceId)
      // Refresh device data
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to clear emergency')
      throw err
    }
  }

  function selectDevice(deviceId: string | null): void {
    selectedDeviceId.value = deviceId
  }

  function clearError(): void {
    error.value = null
  }

  function updateDeviceInList(device: ESPDevice): void {
    const index = devices.value.findIndex(d => 
      getDeviceId(d) === getDeviceId(device)
    )
    if (index !== -1) {
      devices.value[index] = device
    }
  }

  // =============================================================================
  // WebSocket Event Handlers
  // =============================================================================

  /**
   * Handle esp_health WebSocket event
   */
  function handleEspHealth(message: any): void {
    const data = message.data
    const espId = data.esp_id || data.device_id
    
    if (!espId) return

    const device = devices.value.find(d => getDeviceId(d) === espId)
    if (device) {
      // Update device health metrics
      if (data.uptime !== undefined) device.uptime = data.uptime
      if (data.heap_free !== undefined) device.heap_free = data.heap_free
      if (data.wifi_rssi !== undefined) device.wifi_rssi = data.wifi_rssi
      if (data.sensor_count !== undefined) device.sensor_count = data.sensor_count
      if (data.actuator_count !== undefined) device.actuator_count = data.actuator_count
      if (data.timestamp) device.last_seen = new Date(data.timestamp * 1000).toISOString()
    }
  }

  /**
   * Handle actuator_alert WebSocket event
   * Updates actuator emergency state on alerts
   */
  function handleActuatorAlert(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const espId = data.esp_id as string || data.device_id as string
    const gpio = data.gpio as number
    const alertType = data.alert_type as string

    if (!espId || gpio === undefined) {
      console.warn('[ESP Store] actuator_alert missing esp_id or gpio')
      return
    }

    const device = devices.value.find(d => getDeviceId(d) === espId)
    if (!device?.actuators) {
      console.debug(`[ESP Store] Device ${espId} not found or has no actuators`)
      return
    }

    const actuator = (device.actuators as { gpio: number; emergency_stopped?: boolean; state?: boolean }[])
      .find(a => a.gpio === gpio)
    if (!actuator) {
      console.debug(`[ESP Store] Actuator GPIO ${gpio} not found on ${espId}`)
      return
    }

    // Emergency alerts set emergency_stopped flag
    if (alertType === 'emergency_stop' || alertType === 'runtime_protection' || alertType === 'safety_violation') {
      actuator.emergency_stopped = true
      actuator.state = false
    }

    console.info(`[ESP Store] Actuator alert: ${espId} GPIO ${gpio} - ${alertType}`)
  }

  /**
   * Handle sensor_data WebSocket event
   * Updates sensor value in corresponding device for live updates
   */
  function handleSensorData(message: any): void {
    const data = message.data
    const espId = data.esp_id || data.device_id
    const gpio = data.gpio

    if (!espId || gpio === undefined) return

    const device = devices.value.find(d => getDeviceId(d) === espId)
    if (!device?.sensors) return

    const sensor = (device.sensors as any[]).find(s => s.gpio === gpio)
    if (!sensor) return

    // Map server payload → frontend MockSensor
    if (data.value !== undefined) sensor.raw_value = data.value
    if (data.quality) sensor.quality = data.quality
    if (data.unit) sensor.unit = data.unit
    sensor.last_read = data.timestamp
      ? new Date(data.timestamp * 1000).toISOString()
      : new Date().toISOString()
  }

  /**
   * Handle actuator_status WebSocket event
   * Updates actuator state in corresponding device for live updates
   */
  function handleActuatorStatus(message: any): void {
    const data = message.data
    const espId = data.esp_id || data.device_id
    const gpio = data.gpio

    if (!espId || gpio === undefined) return

    const device = devices.value.find(d => getDeviceId(d) === espId)
    if (!device?.actuators) return

    const actuator = (device.actuators as any[]).find(a => a.gpio === gpio)
    if (!actuator) return

    // Map server payload → frontend MockActuator
    // Server: state="on"|"off"|"pwm" → Frontend: state=boolean
    if (data.state !== undefined) {
      actuator.state = data.state === 'on' || data.state === 'pwm'
    }
    if (data.value !== undefined) actuator.pwm_value = data.value
    if (data.emergency !== undefined) {
      actuator.emergency_stopped = data.emergency !== 'normal'
    }
    actuator.last_command = data.timestamp
      ? new Date(data.timestamp * 1000).toISOString()
      : new Date().toISOString()
  }

  // Subscribe to WebSocket events with proper cleanup
  onMounted(() => {
    // Each ws.on() returns an unsubscribe function - store for cleanup
    wsUnsubscribers.push(
      ws.on('esp_health', handleEspHealth),
      ws.on('sensor_data', handleSensorData),
      ws.on('actuator_status', handleActuatorStatus),
      ws.on('actuator_alert', handleActuatorAlert),
    )
    console.debug('[ESP Store] WebSocket handlers registered')
  })

  onUnmounted(() => {
    // Unsubscribe all handlers to prevent memory leaks
    wsUnsubscribers.forEach(unsub => unsub())
    wsUnsubscribers.length = 0
    ws.disconnect()
    console.debug('[ESP Store] WebSocket handlers unregistered')
  })

  return {
    // State
    devices,
    selectedDeviceId,
    isLoading,
    error,

    // Getters
    selectedDevice,
    deviceCount,
    onlineDevices,
    offlineDevices,
    mockDevices,
    realDevices,
    devicesByZone,
    masterZoneDevices,
    isMock,
    getDeviceId,

    // Actions
    fetchAll,
    fetchDevice,
    createDevice,
    updateDevice,
    deleteDevice,
    getHealth,
    restartDevice,
    resetDevice,
    
    // Mock ESP specific actions
    triggerHeartbeat,
    setState,
    setAutoHeartbeat,
    addSensor,
    setSensorValue,
    removeSensor,
    addActuator,
    setActuatorState,
    emergencyStop,
    clearEmergency,
    
    // Utility
    selectDevice,
    clearError,
    updateDeviceInList,
  }
})

