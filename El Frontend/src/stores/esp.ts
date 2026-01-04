/**
 * Unified ESP Store
 * 
 * Manages both Mock and Real ESP devices in a unified way.
 * Automatically routes API calls based on ESP type detection.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { espApi, type ESPDevice, type ESPDeviceUpdate, type ESPDeviceCreate } from '@/api/esp'
import { debugApi } from '@/api/debug'
import { useWebSocket } from '@/composables/useWebSocket'
import { useToast } from '@/composables/useToast'
import type { MockSystemState, MockSensorConfig, MockActuatorConfig, QualityLevel, MessageType, ConfigResponse, MockESPCreate } from '@/types'

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
  // - config_response (config_handler.py)
  const ws = useWebSocket({
    autoConnect: true,
    autoReconnect: true,
    filters: {
      types: ['esp_health', 'sensor_data', 'actuator_status', 'actuator_alert', 'config_response', 'zone_assignment'] as MessageType[],
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

      // DEBUG: Log fetched devices with name field
      console.log('[ESP Store] fetchAll: Fetched devices:')
      fetchedDevices.forEach((d) => {
        console.log(`  - ${d.device_id || d.esp_id}: name="${d.name}"`)
      })

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

      console.log('[ESP Store] fetchAll: Setting devices.value with', dedupedDevices.length, 'devices')
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

  async function createDevice(config: ESPDeviceCreate | MockESPCreate): Promise<ESPDevice> {
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

    console.log('[ESP Store] updateDevice called:', { deviceId, update })

    try {
      // First, persist the update to the database
      const dbDevice = await espApi.updateDevice(deviceId, update)
      console.log('[ESP Store] espApi.updateDevice returned:', {
        deviceId: dbDevice.device_id,
        name: dbDevice.name,
      })

      // For Mock ESPs: Re-fetch to get complete data (merged from Debug Store + DB)
      // The DB only returns partial data, but espApi.getDevice() merges both sources
      let device: ESPDevice
      if (isMock(deviceId)) {
        console.log('[ESP Store] Mock ESP detected, re-fetching complete data from server')
        device = await espApi.getDevice(deviceId)
      } else {
        device = dbDevice
      }

      // Update device in list
      const index = devices.value.findIndex(d =>
        getDeviceId(d) === getDeviceId(device)
      )
      if (index !== -1) {
        devices.value[index] = device
        console.log('[ESP Store] Device updated in list:', device.name)
      }

      return device
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to update device ${deviceId}`)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Update device zone fields directly in store (optimistic update).
   * Called immediately after successful API response for instant UI feedback.
   * WebSocket event will also update, but this ensures immediate reactivity.
   */
  function updateDeviceZone(
    deviceId: string,
    zoneData: { zone_id?: string; zone_name?: string; master_zone_id?: string }
  ): void {
    const index = devices.value.findIndex(d => getDeviceId(d) === deviceId)
    if (index === -1) {
      console.warn(`[ESP Store] updateDeviceZone: device not found: ${deviceId}`)
      return
    }

    const device = devices.value[index]
    // Replace entire object to trigger Vue reactivity
    devices.value[index] = {
      ...device,
      zone_id: zoneData.zone_id ?? device.zone_id,
      zone_name: zoneData.zone_name ?? device.zone_name,
      master_zone_id: zoneData.master_zone_id ?? device.master_zone_id,
    }
    console.info(`[ESP Store] Zone updated (optimistic): ${deviceId} → ${zoneData.zone_id}`)
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
   *
   * Receives updates from:
   * 1. Heartbeat handler (MQTT) - sends timestamp (Unix seconds)
   * 2. MOCK-FIX in esp.py PATCH - sends last_seen (ISO string)
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

      // Handle last_seen from either source:
      // - timestamp: Unix ms from heartbeat handler (MQTT) - 13 digits
      // - timestamp: Unix seconds from old handlers - 10 digits
      // - last_seen: ISO string from MOCK-FIX (esp.py PATCH)
      let newLastSeen: string | null = null
      if (data.timestamp) {
        // Check if timestamp is in seconds (10 digits) or milliseconds (13 digits)
        const ts = data.timestamp > 10000000000 ? data.timestamp : data.timestamp * 1000
        newLastSeen = new Date(ts).toISOString()
      } else if (data.last_seen) {
        newLastSeen = data.last_seen
      }

      if (newLastSeen) {
        device.last_seen = newLastSeen
        // Also update last_heartbeat since ESPCard uses it for freshness
        // (ESPCard: const timestamp = props.esp.last_heartbeat || props.esp.last_seen)
        device.last_heartbeat = newLastSeen
      }

      // Update status if provided (from MOCK-FIX or heartbeat)
      if (data.status !== undefined) {
        device.status = data.status
      }

      // Update name if provided (from MOCK-FIX broadcast)
      if (data.name !== undefined) {
        device.name = data.name
      }

      console.debug(`[ESP Store] esp_health update for ${espId}:`, {
        last_seen: device.last_seen,
        status: device.status,
        name: device.name,
      })
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

  /**
   * Handle config_response WebSocket event
   * Shows toast notification when ESP confirms config changes
   */
  function handleConfigResponse(message: any): void {
    const data: ConfigResponse = message.data
    const toast = useToast()

    if (!data.esp_id) return

    const deviceName = devices.value.find(d => getDeviceId(d) === data.esp_id)?.name || data.esp_id

    if (data.status === 'success') {
      toast.success(
        `${deviceName}: ${data.message}`,
        { duration: 4000 }
      )
      console.info(`[ESP Store] Config success: ${data.esp_id} - ${data.config_type} (${data.count})`)
    } else {
      toast.error(
        `${deviceName}: ${data.error_code || 'CONFIG_ERROR'} - ${data.message}`,
        { duration: 6000 }
      )
      console.error(`[ESP Store] Config error: ${data.esp_id} - ${data.error_code}`)
    }
  }

  /**
   * Handle zone_assignment WebSocket event
   * Updates device zone fields when ESP confirms zone assignment
   *
   * Server payload (from zone_ack_handler.py):
   * {
   *   esp_id: string,
   *   status: "zone_assigned" | "error",
   *   zone_id: string,
   *   master_zone_id?: string,
   *   timestamp: number,
   *   message?: string
   * }
   */
  function handleZoneAssignment(message: any): void {
    const data = message.data
    const espId = data.esp_id || data.device_id

    if (!espId) {
      console.warn('[ESP Store] zone_assignment missing esp_id')
      return
    }

    const deviceIndex = devices.value.findIndex(d => getDeviceId(d) === espId)
    if (deviceIndex === -1) {
      console.debug(`[ESP Store] Zone assignment for unknown device: ${espId}`)
      return
    }

    const device = devices.value[deviceIndex]

    if (data.status === 'zone_assigned') {
      // IMPORTANT: Replace entire device object to trigger Vue reactivity
      // Direct mutation (device.zone_id = ...) doesn't reliably trigger computed updates
      devices.value[deviceIndex] = {
        ...device,
        zone_id: data.zone_id || undefined,
        zone_name: data.zone_name || undefined,
        master_zone_id: data.master_zone_id || undefined,
      }
      console.info(`[ESP Store] Zone confirmed: ${espId} → ${data.zone_id} (reactivity triggered)`)
    } else if (data.status === 'error') {
      console.error(`[ESP Store] Zone assignment error for ${espId}: ${data.message}`)
    } else {
      console.warn(`[ESP Store] Unknown zone_assignment status: ${data.status}`)
    }
  }

  // =============================================================================
  // WebSocket Registration
  // =============================================================================
  // NOTE: Pinia stores don't have lifecycle hooks like Vue components.
  // We register handlers immediately and provide explicit cleanup methods.

  /**
   * Initialize WebSocket subscriptions.
   * Called automatically on store creation.
   * Safe to call multiple times (guards against duplicate registration).
   */
  function initWebSocket(): void {
    if (wsUnsubscribers.length > 0) {
      console.debug('[ESP Store] WebSocket handlers already registered, skipping')
      return
    }

    // Each ws.on() returns an unsubscribe function - store for cleanup
    wsUnsubscribers.push(
      ws.on('esp_health', handleEspHealth),
      ws.on('sensor_data', handleSensorData),
      ws.on('actuator_status', handleActuatorStatus),
      ws.on('actuator_alert', handleActuatorAlert),
      ws.on('config_response', handleConfigResponse),
      ws.on('zone_assignment', handleZoneAssignment),
    )
    console.debug('[ESP Store] WebSocket handlers registered')
  }

  /**
   * Cleanup WebSocket subscriptions.
   * Call when app is being destroyed or user logs out.
   */
  function cleanupWebSocket(): void {
    wsUnsubscribers.forEach(unsub => unsub())
    wsUnsubscribers.length = 0
    ws.disconnect()
    console.debug('[ESP Store] WebSocket handlers unregistered')
  }

  // Auto-initialize WebSocket handlers on store creation
  initWebSocket()

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
    updateDeviceZone,
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

    // WebSocket management
    initWebSocket,
    cleanupWebSocket,
  }
})

