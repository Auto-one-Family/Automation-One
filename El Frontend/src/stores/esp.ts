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
import { sensorsApi } from '@/api/sensors'
import { actuatorsApi } from '@/api/actuators'
import { useWebSocket } from '@/composables/useWebSocket'
import { websocketService } from '@/services/websocket'
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/logger'
import type {
  MockSystemState, MockSensorConfig, MockActuatorConfig, QualityLevel, MessageType,
  MockESPCreate, OfflineInfo, OfflineReason,
  StatusSource, SensorConfigCreate, ActuatorConfigCreate, MockSensor,
  HeartbeatGpioItem,
  PendingESPDevice, ESPApprovalRequest, ESPApprovalResponse,
  DeviceDiscoveredPayload, DeviceApprovedPayload, DeviceRejectedPayload
} from '@/types'
import { useZoneStore } from '@/shared/stores/zone.store'
import { useActuatorStore } from '@/shared/stores/actuator.store'
import { useSensorStore } from '@/shared/stores/sensor.store'
import { useGpioStore } from '@/shared/stores/gpio.store'
import { useNotificationStore } from '@/shared/stores/notification.store'
import { useConfigStore } from '@/shared/stores/config.store'
import {
  inferInterfaceType,
  getDefaultI2CAddress
} from '@/utils/sensorDefaults'
import { isPwmActuator } from '@/utils/actuatorDefaults'

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

// ============================================
// OFFLINE REASON HELPERS
// ============================================

/**
 * Generiert menschenlesbaren Text für Offline-Grund.
 *
 * @param source - Quelle der Offline-Erkennung
 * @param reason - Detaillierter Grund (optional)
 * @returns Menschenlesbarer deutscher Text
 */
function getOfflineDisplayText(source: StatusSource, reason?: string): string {
  switch (source) {
    case 'lwt':
      return 'Verbindung verloren'
    case 'heartbeat_timeout':
      return 'Keine Antwort'
    case 'api':
      return reason === 'shutdown' ? 'Heruntergefahren' : 'Offline'
    default:
      return 'Offline'
  }
}

/**
 * Mappt source zu OfflineReason.
 */
function getOfflineReason(source: StatusSource, reason?: string): OfflineReason {
  if (source === 'lwt') return 'lwt'
  if (source === 'heartbeat_timeout' || reason === 'heartbeat_timeout') return 'heartbeat_timeout'
  if (reason === 'shutdown') return 'shutdown'
  return 'unknown'
}

export const useEspStore = defineStore('esp', () => {
  // Logger
  const logger = createLogger('ESPStore')

  // State
  const devices = ref<ESPDevice[]>([])
  const selectedDeviceId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // GPIO Status State → delegated to gpio.store.ts
  // Expose via computed for backward compatibility
  const gpioStore = useGpioStore()
  const gpioStatusMap = computed(() => gpioStore.gpioStatusMap)
  const gpioStatusLoading = computed(() => gpioStore.gpioStatusLoading)

  // =========================================================================
  // Pending Devices State (Discovery/Approval Phase)
  // =========================================================================
  const pendingDevices = ref<PendingESPDevice[]>([])
  const isPendingLoading = ref(false)

  // Track locally-initiated approvals to avoid duplicate fetchAll from WS echo
  const _recentlyApprovedByClient = ref<string | null>(null)
  const _recentlyApprovedAt = ref<number>(0)

  // WebSocket integration
  // Note: Server broadcasts these types from MQTT handlers:
  // - esp_health (heartbeat_handler.py)
  // - sensor_data (sensor_handler.py)
  // - actuator_status (actuator_handler.py)
  // - actuator_alert (actuator_alert_handler.py)
  // - config_response (config_handler.py)
  // - sensor_health (maintenance/jobs/sensor_health.py) - Phase 2E
  // - device_discovered, device_approved, device_rejected (Discovery/Approval Phase)
  const ws = useWebSocket({
    autoConnect: true,
    autoReconnect: true,
    filters: {
      types: [
        'esp_health', 'sensor_data', 'actuator_status', 'actuator_alert',
        'config_response', 'zone_assignment', 'subzone_assignment', 'sensor_health',
        'device_discovered', 'device_approved', 'device_rejected', 'device_rediscovered',
        'actuator_response', 'actuator_command', 'actuator_command_failed',
        'config_published', 'config_failed',
        'sequence_started', 'sequence_step', 'sequence_completed', 'sequence_error', 'sequence_cancelled',
        'logic_execution',
        'notification', 'error_event', 'system_event',
      ] as MessageType[],
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
      !(device.status === 'online' || device.connected === true)
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

  // Pending devices count for ActionBar badge
  const pendingCount = computed(() => pendingDevices.value.length)

/**
 * Check if device is Mock ESP
 */
function isMock(deviceId: string): boolean {
  return espApi.isMockEsp(deviceId)
}

/**
 * Find device by esp_id with UUID fallback (DEFENSIVE PROGRAMMING).
 *
 * CRITICAL: Server SHOULD always send device_id (e.g., "ESP_00000001").
 * However, if UUID slips through (e.g., "8f67d252-8aaa-4a87-9577-fb18e7ad7979"),
 * we try to match by internal id as a fallback.
 *
 * This prevents frontend breakage if server-side bug occurs.
 *
 * @param espId - Either device_id (expected) or UUID (fallback)
 * @returns Device index and device, or null if not found
 */
function findDeviceByEspIdDefensive(espId: string): { index: number; device: ESPDevice } | null {
  // Primary lookup: by device_id (expected)
  let index = devices.value.findIndex(d => getDeviceId(d) === espId)

  if (index !== -1) {
    return { index, device: devices.value[index] }
  }

  // Fallback: Check if espId looks like UUID (contains dashes and 36 chars)
  if (espId.includes('-') && espId.length === 36) {
    logger.warn(`Received UUID "${espId}" instead of device_id. ` +
      `Server should send device_id! Trying fallback lookup...`
    )

    // Try matching by internal id field (UUID from database)
    index = devices.value.findIndex(d => d.id === espId)

    if (index !== -1) {
      logger.info(`Fallback lookup successful: ${espId} → ${getDeviceId(devices.value[index])}`)
      return { index, device: devices.value[index] }
    }
  }

  return null
}

  /**
   * Get normalized device ID
   */
  function getDeviceId(device: ESPDevice): string {
    return device.device_id || device.esp_id || ''
  }

  // =========================================================================
  // GPIO Status - delegated to gpio.store.ts
  // =========================================================================

  const getGpioStatusForEsp = gpioStore.getGpioStatusForEsp
  const getAvailableGpios = gpioStore.getAvailableGpios
  const getReservedGpios = gpioStore.getReservedGpios
  const isGpioAvailableForEsp = gpioStore.isGpioAvailableForEsp
  const getSystemPinName = gpioStore.getSystemPinName
  const getAllPinStatuses = gpioStore.getAllPinStatuses
  const fetchGpioStatus = gpioStore.fetchGpioStatus
  const clearGpioStatus = gpioStore.clearGpioStatus
  const updateGpioStatusFromHeartbeat = gpioStore.updateGpioStatusFromHeartbeat

  // =========================================================================
  // OneWire Scan - delegated to gpio.store.ts
  // =========================================================================

  const oneWireScanStates = computed(() => gpioStore.oneWireScanStates)
  const getOneWireScanState = gpioStore.getOneWireScanState
  const scanOneWireBus = gpioStore.scanOneWireBus
  const clearOneWireScan = gpioStore.clearOneWireScan
  const toggleRomSelection = gpioStore.toggleRomSelection
  const selectAllOneWireDevices = gpioStore.selectAllOneWireDevices
  const deselectAllOneWireDevices = gpioStore.deselectAllOneWireDevices
  const selectSpecificRomCodes = gpioStore.selectSpecificRomCodes
  const isRomCodeSelected = gpioStore.isRomCodeSelected

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

      logger.debug('fetchAll: Fetched devices:')
      fetchedDevices.forEach((d) => {
        logger.debug(`  - ${d.device_id || d.esp_id}: name="${d.name ?? '(unnamed)'}"`)
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
          logger.warn(`Duplicate device filtered: ${id}`)
        }
      }

      logger.info('Loaded devices', { count: dedupedDevices.length })
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

  // ===========================================================================
  // Pending Devices Actions (Discovery/Approval Phase)
  // ===========================================================================

  /**
   * Fetch all pending (unapproved) devices.
   * Called on initial load and after approval/rejection.
   */
  async function fetchPendingDevices(): Promise<void> {
    isPendingLoading.value = true
    error.value = null

    try {
      const devices = await espApi.getPendingDevices()
      pendingDevices.value = devices
      logger.debug(`Fetched ${devices.length} pending devices`)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to fetch pending devices')
      logger.error(`Failed to fetch pending devices:`, err)
    } finally {
      isPendingLoading.value = false
    }
  }

  /**
   * Approve a pending device.
   * 
   * @param deviceId - Device ID to approve
   * @param data - Optional approval data (name, zone)
   * @returns Approval response
   */
  async function approveDevice(
    deviceId: string,
    data?: ESPApprovalRequest
  ): Promise<ESPApprovalResponse> {
    error.value = null
    const toast = useToast()

    try {
      const response = await espApi.approveDevice(deviceId, data)
      
      // Remove from pending list
      pendingDevices.value = pendingDevices.value.filter(d => d.device_id !== deviceId)
      
      // Track this approval so the WS echo handler skips its fetchAll
      _recentlyApprovedByClient.value = deviceId
      _recentlyApprovedAt.value = Date.now()
      
      // Toast notification
      toast.success(`Gerät ${deviceId} wurde genehmigt`, { duration: 4000 })
      
      // Refresh device list to show the newly approved device
      fetchAll()
      
      return response
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to approve device ${deviceId}`)
      toast.error(`Fehler beim Genehmigen: ${error.value}`, { duration: 6000 })
      throw err
    }
  }

  /**
   * Reject a pending device.
   * 
   * @param deviceId - Device ID to reject
   * @param reason - Reason for rejection
   * @returns Rejection response
   */
  async function rejectDevice(
    deviceId: string,
    reason: string
  ): Promise<ESPApprovalResponse> {
    error.value = null
    const toast = useToast()

    try {
      const response = await espApi.rejectDevice(deviceId, reason)
      
      // Remove from pending list
      pendingDevices.value = pendingDevices.value.filter(d => d.device_id !== deviceId)
      
      // Toast notification
      toast.info(`Gerät ${deviceId} wurde abgelehnt`, { duration: 4000 })
      
      return response
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, `Failed to reject device ${deviceId}`)
      toast.error(`Fehler beim Ablehnen: ${error.value}`, { duration: 6000 })
      throw err
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
        logger.debug(`Device ${deviceId} already exists, updated`)
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

    logger.info('updateDevice called:', { deviceId, update })

    try {
      // First, persist the update to the database
      const dbDevice = await espApi.updateDevice(deviceId, update)
      logger.info('espApi.updateDevice returned:', {
        deviceId: dbDevice.device_id,
        name: dbDevice.name,
      })

      // For Mock ESPs: Re-fetch to get complete data (merged from Debug Store + DB)
      // The DB only returns partial data, but espApi.getDevice() merges both sources
      let device: ESPDevice
      if (isMock(deviceId)) {
        logger.info('Mock ESP detected, re-fetching complete data from server')
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
        logger.info('Device updated in list:', device.name)
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
      logger.warn(`updateDeviceZone: device not found: ${deviceId}`)
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
    logger.info(`Zone updated (optimistic): ${deviceId} → ${zoneData.zone_id}`)
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
        logger.warn(`Device ${deviceId} not found on server, removing from local list`)
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
      // Refresh device data to get updated auto_heartbeat state
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to configure auto-heartbeat')
      throw err
    }
  }

  /**
   * Fügt einen Sensor zu einem ESP hinzu.
   *
   * Routing-Logik (Phase 2B):
   * - Mock-ESP (isMock=true)  → debugApi.addSensor()  → /debug/mock-esp/{id}/sensors
   * - Real-ESP (isMock=false) → sensorsApi.createOrUpdate() → /sensors/{espId}/{gpio}
   *
   * @param deviceId - ESP Device ID
   * @param config - Sensor-Konfiguration (Mock-Format, wird für Real-ESPs gemappt)
   */
  async function addSensor(
    deviceId: string,
    config: MockSensorConfig & { operating_mode?: string; timeout_seconds?: number }
  ): Promise<void> {
    error.value = null

    try {
      if (isMock(deviceId)) {
        // =========================================================================
        // MOCK-ESP: Debug-API verwenden (bestehende Logik)
        // =========================================================================
        await debugApi.addSensor(deviceId, config)

      } else {
        // =========================================================================
        // REAL-ESP: Sensor-API verwenden (NEU in Phase 2B)
        // =========================================================================
        // Infer interface type from sensor_type
        const interfaceType = inferInterfaceType(config.sensor_type)
        const defaultI2CAddress = getDefaultI2CAddress(config.sensor_type)

        const realConfig: SensorConfigCreate = {
          esp_id: deviceId,
          gpio: config.gpio,
          sensor_type: config.sensor_type,
          name: config.name || null,
          enabled: true,
          // =========================================================================
          // MULTI-VALUE SENSOR SUPPORT (I2C/OneWire)
          // =========================================================================
          interface_type: config.interface_type || interfaceType,
          // I2C: Use default address from registry (e.g., SHT31 → 0x44)
          i2c_address: interfaceType === 'I2C' ? defaultI2CAddress : null,
          // OneWire: Use provided ROM address (from scan) or null (server auto-generates)
          onewire_address: config.onewire_address || null,
          // =========================================================================
          // Operating Mode Felder (Phase 2B)
          // =========================================================================
          operating_mode: (config.operating_mode as SensorConfigCreate['operating_mode']) || 'continuous',
          timeout_seconds: config.timeout_seconds ?? 180,
          timeout_warning_enabled: (config.timeout_seconds ?? 180) > 0,
          // Weitere Felder mit Defaults
          calibration: null,
          threshold_min: null,
          threshold_max: null,
          metadata: {
            subzone_id: config.subzone_id || null,
            created_via: 'dashboard_drag_drop'
          }
        }

        await sensorsApi.createOrUpdate(deviceId, config.gpio, realConfig)
      }

      // UI aktualisieren
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to add sensor')
      throw err
    }
  }

  /**
   * Aktualisiert die Konfiguration eines bestehenden Sensors (Phase 2F).
   *
   * Verwendet für Operating Mode Overrides und Sensor-Einstellungen.
   * Routing-Logik:
   * - Mock-ESP (isMock=true)  → debugApi.updateSensor() (falls verfügbar) oder Re-Add
   * - Real-ESP (isMock=false) → sensorsApi.createOrUpdate()
   *
   * @param deviceId - ESP Device ID
   * @param gpio - GPIO Pin des Sensors
   * @param config - Zu aktualisierende Felder (partial update)
   */
  async function updateSensorConfig(
    deviceId: string,
    gpio: number,
    config: Partial<{
      name: string | null
      operating_mode: string | null
      timeout_seconds: number | null
      timeout_warning_enabled: boolean | null
      enabled: boolean
      schedule_config: { type: string; expression: string } | null
    }>
  ): Promise<void> {
    error.value = null

    // Find existing sensor to get current values
    const device = devices.value.find(d => getDeviceId(d) === deviceId)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }

    const sensors = device.sensors as MockSensor[] | undefined
    const existingSensor = sensors?.find(s => s.gpio === gpio)
    if (!existingSensor) {
      throw new Error(`Sensor not found: GPIO ${gpio}`)
    }

    try {
      if (isMock(deviceId)) {
        // =========================================================================
        // MOCK-ESP: Debug-API verwenden oder Sensor neu erstellen
        // =========================================================================
        // Mock ESPs können Sensoren über addSensor mit überschriebenen Werten aktualisieren
        const mockConfig: MockSensorConfig & { operating_mode?: string; timeout_seconds?: number } = {
          gpio: gpio,
          sensor_type: existingSensor.sensor_type,
          name: config.name !== undefined ? config.name || '' : existingSensor.name || '',
          raw_value: existingSensor.raw_value ?? 0,
          unit: existingSensor.unit || '',
          quality: existingSensor.quality || 'good',
          raw_mode: true,
          operating_mode: config.operating_mode !== undefined ? config.operating_mode || undefined : existingSensor.operating_mode,
          timeout_seconds: config.timeout_seconds !== undefined ? config.timeout_seconds ?? undefined : existingSensor.timeout_seconds,
        }

        // Remove sensor first, then re-add with updated config
        await debugApi.removeSensor(deviceId, gpio)
        await debugApi.addSensor(deviceId, mockConfig)

      } else {
        // =========================================================================
        // REAL-ESP: Sensor-API mit Partial Update
        // =========================================================================
        // Infer interface type from existing sensor_type
        const interfaceType = inferInterfaceType(existingSensor.sensor_type)
        const defaultI2CAddress = getDefaultI2CAddress(existingSensor.sensor_type)

        const realConfig: SensorConfigCreate = {
          esp_id: deviceId,
          gpio: gpio,
          sensor_type: existingSensor.sensor_type,
          name: config.name !== undefined ? config.name : existingSensor.name,
          enabled: config.enabled !== undefined ? config.enabled : true,
          // =========================================================================
          // MULTI-VALUE SENSOR SUPPORT (I2C/OneWire)
          // =========================================================================
          interface_type: interfaceType,
          i2c_address: interfaceType === 'I2C' ? defaultI2CAddress : null,
          onewire_address: null, // Server preserves existing address on update
          // =========================================================================
          // Operating Mode Felder (Phase 2F)
          // =========================================================================
          operating_mode: config.operating_mode !== undefined
            ? (config.operating_mode as SensorConfigCreate['operating_mode'] ?? undefined)
            : (existingSensor.operating_mode as SensorConfigCreate['operating_mode'] ?? undefined),
          timeout_seconds: config.timeout_seconds !== undefined
            ? (config.timeout_seconds ?? undefined)
            : (existingSensor.timeout_seconds ?? undefined),
          timeout_warning_enabled: config.timeout_warning_enabled !== undefined
            ? (config.timeout_warning_enabled ?? undefined)
            : ((existingSensor.timeout_seconds ?? 180) > 0 ? true : undefined),
          // Schedule configuration (Phase 2F)
          schedule_config: config.schedule_config !== undefined
            ? (config.schedule_config ?? undefined)
            : (existingSensor.schedule_config as { type: string; expression: string } ?? undefined),
          // Preserve existing metadata
          calibration: undefined,
          threshold_min: undefined,
          threshold_max: undefined,
          metadata: {
            updated_via: 'edit_modal_phase_2f'
          }
        }

        await sensorsApi.createOrUpdate(deviceId, gpio, realConfig)
      }

      // UI aktualisieren
      await fetchDevice(deviceId)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to update sensor config')
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
    error.value = null

    try {
      if (isMock(deviceId)) {
        // =========================================================================
        // MOCK-ESP: Debug-API verwenden (bestehende Logik)
        // =========================================================================
        await debugApi.addActuator(deviceId, config)
      } else {
        // =========================================================================
        // REAL-ESP: Actuator-API verwenden (analog zu addSensor Phase 2B)
        // =========================================================================
        const realConfig: ActuatorConfigCreate = {
          esp_id: deviceId,
          gpio: config.gpio,
          actuator_type: config.actuator_type,
          name: config.name || null,
          enabled: true,
          aux_gpio: config.aux_gpio !== 255 ? config.aux_gpio : null,
          inverted_logic: config.inverted_logic ?? false,
          max_runtime_seconds: config.max_runtime_seconds ?? 0,
          cooldown_seconds: config.cooldown_seconds ?? 0,
          pwm_frequency: isPwmActuator(config.actuator_type) ? 1000 : null,
          metadata: {
            created_via: 'dashboard_drag_drop'
          }
        }
        await actuatorsApi.createOrUpdate(deviceId, config.gpio, realConfig)
      }

      // UI aktualisieren
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
   * 3. LWT handler - sends source='lwt' when ESP disconnects unexpectedly
   *
   * BUG X FIX: If device is unknown but status is "online", refresh device list
   * to show newly connected ESPs immediately in the UI.
   */
  function handleEspHealth(message: any): void {
    const data = message.data
    const espId = data.esp_id || data.device_id

    // DEBUG: Log when WebSocket event arrives
    logger.info('handleEspHealth received:', {
      esp_id: espId,
      status: data.status,
      timestamp: data.timestamp,
      source: data.source,
      reason: data.reason,
      receivedAt: Date.now()
    })

    if (!espId) return

    const device = devices.value.find(d => getDeviceId(d) === espId)

    // BUG X FIX: Unknown device came online - refresh device list for real-time updates
    if (!device && data.status === 'online') {
      logger.info(`New device online: ${espId}, refreshing device list...`)
      fetchAll().catch(err => {
        logger.error(`Failed to refresh devices after new online device:`, err)
      })
      return
    }

    if (device) {
      // IMPORTANT: Replace entire device object for Vue reactivity
      // Direct mutation doesn't reliably trigger computed/watch updates
      const deviceIndex = devices.value.findIndex(d => getDeviceId(d) === espId)
      if (deviceIndex === -1) return

      // Calculate new last_seen from either source:
      // - timestamp: Unix ms from heartbeat handler (MQTT) - 13 digits
      // - timestamp: Unix seconds from old handlers - 10 digits
      // - last_seen: ISO string from MOCK-FIX (esp.py PATCH)
      let newLastSeen: string | undefined = device.last_seen ?? undefined
      if (data.timestamp) {
        const ts = data.timestamp > 10000000000 ? data.timestamp : data.timestamp * 1000
        newLastSeen = new Date(ts).toISOString()
      } else if (data.last_seen) {
        newLastSeen = data.last_seen
      }

      // Calculate offline info if device went offline
      let offlineInfo: OfflineInfo | undefined = undefined
      if (data.status === 'offline') {
        const source = (data.source as StatusSource) || 'heartbeat_timeout'
        const reason = getOfflineReason(source, data.reason)
        const displayText = getOfflineDisplayText(source, data.reason)

        offlineInfo = {
          reason,
          source,
          timestamp: data.timestamp || Math.floor(Date.now() / 1000),
          displayText
        }

        // Toast notification for LWT (unexpected disconnect)
        if (source === 'lwt') {
          const toast = useToast()
          toast.warning(
            `${device.name || device.device_id}: Verbindung unerwartet verloren`,
            { duration: 5000 }
          )
        }
      }

      // Replace device with updated copy (triggers Vue reactivity)
      devices.value[deviceIndex] = {
        ...device,
        uptime: data.uptime ?? device.uptime,
        heap_free: data.heap_free ?? device.heap_free,
        wifi_rssi: data.wifi_rssi ?? device.wifi_rssi,
        sensor_count: data.sensor_count ?? device.sensor_count,
        actuator_count: data.actuator_count ?? device.actuator_count,
        last_seen: newLastSeen,
        last_heartbeat: newLastSeen,
        status: data.status ?? device.status,
        name: data.name ?? device.name,
        // Clear offlineInfo when online, set when offline
        offlineInfo: data.status === 'offline' ? offlineInfo : undefined,
      }

      logger.debug(`esp_health update for ${espId}:`, {
        last_seen: newLastSeen,
        status: data.status ?? device.status,
        name: data.name ?? device.name,
        offlineInfo: data.status === 'offline' ? offlineInfo : 'cleared',
      })

      // Phase 3: Update GPIO status from heartbeat if present
      if (data.gpio_status && Array.isArray(data.gpio_status)) {
        updateGpioStatusFromHeartbeat(espId, data.gpio_status as HeartbeatGpioItem[])
      }
    }
  }

  /**
   * Actuator alert handler - delegates to actuator.store.ts
   * Server: actuator_alert_handler.py → WS: actuator_alert
   */
  function handleActuatorAlert(message: { data: Record<string, unknown> }): void {
    const actStore = useActuatorStore()
    actStore.handleActuatorAlert(message, devices.value, getDeviceId)
  }

  /**
   * Sensor data handler - delegates to sensor.store.ts
   * Server: sensor_handler.py → WS: sensor_data
   */
  function handleSensorData(message: { data: Record<string, unknown> }): void {
    const sensorStore = useSensorStore()
    sensorStore.handleSensorData(message as unknown as Parameters<typeof sensorStore.handleSensorData>[0], devices.value, getDeviceId)
  }

  /**
   * Actuator status handler - delegates to actuator.store.ts
   * Server: actuator_handler.py → WS: actuator_status
   */
  function handleActuatorStatus(message: { data: Record<string, unknown> }): void {
    const actStore = useActuatorStore()
    actStore.handleActuatorStatus(message as unknown as Parameters<typeof actStore.handleActuatorStatus>[0], devices.value, getDeviceId)
  }

  /**
   * Config response handler - delegates to config.store.ts
   * Server: config_ack_handler.py → WS: config_response
   */
  function handleConfigResponse(message: { data: Record<string, unknown> }): void {
    const cfgStore = useConfigStore()
    cfgStore.handleConfigResponse(message, devices.value, getDeviceId, fetchGpioStatus)
  }

  /**
   * Handle zone_assignment WebSocket event
   * Updates device zone fields when ESP confirms zone assignment
   *
   * WP4: DEFENSIVE implementation - only overwrite fields that are DEFINED in the event
   *
   * Server payload (from zone_ack_handler.py):
   * {
   *   esp_id: string,
   *   status: "zone_assigned" | "error",
   *   zone_id: string,
   *   zone_name?: string,       // ← server-dev WP4: NOW SENT
   *   kaiser_id?: string,       // ← server-dev WP4: NOW SENT
   *   master_zone_id?: string,
   *   timestamp: number,
   *   message?: string
   * }
   */
  /**
   * Zone assignment handler - delegates to zone.store.ts
   * Server: zone_ack_handler.py → WS: zone_assignment
   */
  function handleZoneAssignment(message: any): void {
    const zoneStore = useZoneStore()
    zoneStore.handleZoneAssignment(
      message,
      devices.value,
      getDeviceId,
      (idx, dev) => { devices.value[idx] = dev },
    )
  }

  /**
   * Subzone assignment handler - delegates to zone.store.ts
   * Server: subzone_ack_handler.py → WS: subzone_assignment
   */
  function handleSubzoneAssignment(message: any): void {
    const zoneStore = useZoneStore()
    zoneStore.handleSubzoneAssignment(
      message,
      devices.value,
      getDeviceId,
      (idx, dev) => { devices.value[idx] = dev },
    )
  }

  // ===========================================================================
  // Discovery/Approval WebSocket Handlers
  // ===========================================================================

  /**
   * Handle device_discovered WebSocket event.
   * Adds new device to pending list and shows toast notification.
   */
  function handleDeviceDiscovered(message: any): void {
    const data = message.data as DeviceDiscoveredPayload
    const toast = useToast()

    if (!data.device_id) {
      logger.warn('device_discovered missing device_id')
      return
    }

    logger.info(`New device discovered: ${data.device_id}`)

    // Add to pending list if not already present
    const exists = pendingDevices.value.some(d => d.device_id === data.device_id)
    if (!exists) {
      const newPending: PendingESPDevice = {
        device_id: data.device_id,
        discovered_at: data.discovered_at || new Date().toISOString(),
        last_seen: data.last_seen ?? data.discovered_at ?? new Date().toISOString(),
        ip_address: data.ip_address,
        heap_free: data.heap_free,
        wifi_rssi: data.wifi_rssi,
        sensor_count: data.sensor_count ?? 0,
        actuator_count: data.actuator_count ?? 0,
        heartbeat_count: 1,
        hardware_type: data.hardware_type,
      }
      pendingDevices.value.push(newPending)
    }

    // Toast notification
    toast.info(`Neues Gerät entdeckt: ${data.device_id}`, { duration: 4000 })
  }

  /**
   * Handle device_approved WebSocket event.
   * Removes device from pending list.
   */
  function handleDeviceApproved(message: any): void {
    const data = message.data as DeviceApprovedPayload
    const toast = useToast()

    if (!data.device_id) {
      logger.warn('device_approved missing device_id')
      return
    }

    logger.info(`Device approved: ${data.device_id} by ${data.approved_by}`)

    // Remove from pending list
    pendingDevices.value = pendingDevices.value.filter(d => d.device_id !== data.device_id)

    // Check if this approval was initiated by this client (avoids duplicate fetchAll)
    const isOwnApproval =
      _recentlyApprovedByClient.value === data.device_id &&
      (Date.now() - _recentlyApprovedAt.value) < 5000

    if (isOwnApproval) {
      // Own client already triggered fetchAll in approveDevice() - skip duplicate
      _recentlyApprovedByClient.value = null
      logger.debug(`Skipping fetchAll for own approval of ${data.device_id}`)
    } else {
      // Another client approved - show toast and refresh
      toast.success(`Gerät ${data.device_id} wurde genehmigt`, { duration: 4000 })
      fetchAll()
    }
  }

  /**
   * Handle device_rejected WebSocket event.
   * Removes device from pending list.
   */
  function handleDeviceRejected(message: any): void {
    const data = message.data as DeviceRejectedPayload
    const toast = useToast()

    if (!data.device_id) {
      logger.warn('device_rejected missing device_id')
      return
    }

    logger.info(`Device rejected: ${data.device_id} - ${data.rejection_reason}`)

    // Remove from pending list
    pendingDevices.value = pendingDevices.value.filter(d => d.device_id !== data.device_id)

    // Toast notification
    toast.warning(`Gerät ${data.device_id} wurde abgelehnt`, { duration: 4000 })
  }

  /**
   * Sensor health handler - delegates to sensor.store.ts
   * Server: maintenance/jobs/sensor_health.py → WS: sensor_health
   */
  function handleSensorHealth(message: { data: Record<string, unknown> }): void {
    const sensorStore = useSensorStore()
    sensorStore.handleSensorHealth(message as unknown as Parameters<typeof sensorStore.handleSensorHealth>[0], findDeviceByEspIdDefensive)
  }

  // =============================================================================
  // WebSocket Handlers: Actuator Feedback & Notifications (Phase UI/UX 1)
  // =============================================================================

  /**
   * Actuator response handler - delegates to actuator.store.ts
   * Server: actuator_handler.py → WS: actuator_response
   */
  function handleActuatorResponse(message: { data: Record<string, unknown> }): void {
    const actStore = useActuatorStore()
    actStore.handleActuatorResponse(message, devices.value, getDeviceId)
  }

  /**
   * Notification handler - delegates to notification.store.ts
   * Server: logic engine, system → WS: notification
   */
  function handleNotification(message: { data: Record<string, unknown> }): void {
    useNotificationStore().handleNotification(message)
  }

  /**
   * Error event handler - delegates to notification.store.ts
   * Server: error tracker → WS: error_event
   */
  function handleErrorEvent(message: { data: Record<string, unknown> }): void {
    useNotificationStore().handleErrorEvent(message, devices.value, getDeviceId)
  }

  /**
   * System event handler - delegates to notification.store.ts
   * Server: system events → WS: system_event
   */
  function handleSystemEvent(message: { data: Record<string, unknown> }): void {
    useNotificationStore().handleSystemEvent(message)
  }

  // =============================================================================
  // Phase 2: Actuator Command Lifecycle Handlers - delegates to actuator.store.ts
  // =============================================================================

  function handleActuatorCommand(message: { data: Record<string, unknown> }): void {
    const actStore = useActuatorStore()
    actStore.handleActuatorCommand(message, devices.value, getDeviceId)
  }

  function handleActuatorCommandFailed(message: { data: Record<string, unknown> }): void {
    const actStore = useActuatorStore()
    actStore.handleActuatorCommandFailed(message, devices.value, getDeviceId)
  }

  // =============================================================================
  // Phase 2: Config Publish Lifecycle Handlers
  // =============================================================================

  /**
   * Config published handler - delegates to config.store.ts
   * Server: config_publisher → WS: config_published
   */
  function handleConfigPublished(message: { data: Record<string, unknown> }): void {
    useConfigStore().handleConfigPublished(message, devices.value, getDeviceId)
  }

  /**
   * Config failed handler - delegates to config.store.ts
   * Server: config_publisher → WS: config_failed
   */
  function handleConfigFailed(message: { data: Record<string, unknown> }): void {
    useConfigStore().handleConfigFailed(message, devices.value, getDeviceId)
  }

  // =============================================================================
  // Phase 2: Device Rediscovery Handler
  // =============================================================================

  /**
   * Handle device_rediscovered WebSocket event.
   * Two cases:
   * 1) Approved device that went offline came back → update devices list
   * 2) Rejected device sends heartbeat again (cooldown expired) → now pending again, refresh pending list
   */
  function handleDeviceRediscovered(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const espId = (data.esp_id as string) || (data.device_id as string)
    if (!espId) return

    const toast = useToast()

    // Case 1: Device in approved list (was offline, came back)
    const deviceIndex = devices.value.findIndex(d => getDeviceId(d) === espId)
    if (deviceIndex !== -1) {
      const device = devices.value[deviceIndex]
      devices.value[deviceIndex] = {
        ...device,
        status: 'online',
        last_seen: new Date().toISOString(),
        offlineInfo: undefined,
        ip_address: (data.ip_address as string) ?? device.ip_address,
      }
      const deviceName = device.name || espId
      toast.info(`${deviceName} ist wieder online`)
      return
    }

    // Case 2: Rejected device rediscovered → now pending_approval again
    fetchPendingDevices().catch(err => {
      logger.error(`Failed to refresh pending after device_rediscovered:`, err)
    })
    toast.info(`${espId} ist wieder zur Genehmigung verfügbar`)
  }

  // =============================================================================
  // Sequence Handlers - delegates to actuator.store.ts
  // =============================================================================

  function handleSequenceStarted(message: { data: Record<string, unknown> }): void {
    useActuatorStore().handleSequenceStarted(message)
  }

  function handleSequenceStep(message: { data: Record<string, unknown> }): void {
    useActuatorStore().handleSequenceStep(message)
  }

  function handleSequenceCompleted(message: { data: Record<string, unknown> }): void {
    useActuatorStore().handleSequenceCompleted(message)
  }

  function handleSequenceError(message: { data: Record<string, unknown> }): void {
    useActuatorStore().handleSequenceError(message)
  }

  function handleSequenceCancelled(message: { data: Record<string, unknown> }): void {
    useActuatorStore().handleSequenceCancelled(message)
  }

  // =============================================================================
  // Actuator Commands (Real ESP + Mock)
  // =============================================================================

  /**
   * Send actuator command to real or mock ESP.
   * For real ESPs: calls REST API → MQTT → ESP.
   * For mock ESPs: calls debug API.
   * Toast feedback comes via WebSocket events.
   */
  async function sendActuatorCommand(
    deviceId: string,
    gpio: number,
    command: 'ON' | 'OFF' | 'PWM' | 'TOGGLE',
    value?: number
  ): Promise<void> {
    const toast = useToast()

    if (isMock(deviceId)) {
      // Mock path: use debug API
      try {
        const state = command === 'ON' || command === 'TOGGLE'
        await debugApi.setActuatorState(deviceId, gpio, state, value)
        await fetchDevice(deviceId)
      } catch (err: unknown) {
        const msg = extractErrorMessage(err, 'Mock-Befehl konnte nicht gesendet werden')
        toast.error(msg, { persistent: true })
        throw err
      }
      return
    }

    // Real ESP: use actuator command API
    try {
      await actuatorsApi.sendCommand(deviceId, gpio, {
        command,
        value: value ?? (command === 'ON' ? 1.0 : 0.0),
      })
      toast.info(`Befehl ${command} an ${deviceId} GPIO ${gpio} gesendet…`)
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Befehl konnte nicht gesendet werden')
      toast.error(msg, { persistent: true })
      throw err
    }
  }

  /**
   * Emergency stop all actuators (real API, not mock-only).
   */
  async function emergencyStopAll(reason: string = 'Manueller Notfall-Stopp über UI'): Promise<void> {
    const toast = useToast()
    try {
      const result = await actuatorsApi.emergencyStop({ reason })
      toast.show({
        message: `NOTFALL-STOPP: ${result.actuators_stopped} Aktoren auf ${result.devices_stopped} Geräten gestoppt`,
        type: 'warning',
        persistent: true,
      })
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Notfall-Stopp fehlgeschlagen')
      toast.error(msg, { persistent: true })
      throw err
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
      logger.debug('WebSocket handlers already registered, skipping')
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
      ws.on('subzone_assignment', handleSubzoneAssignment),  // WP4
      ws.on('sensor_health', handleSensorHealth),  // Phase 2E
      // Discovery/Approval Phase
      ws.on('device_discovered', handleDeviceDiscovered),
      ws.on('device_approved', handleDeviceApproved),
      ws.on('device_rejected', handleDeviceRejected),
      // Phase UI/UX 1: Feedback & Notifications
      ws.on('actuator_response', handleActuatorResponse),
      ws.on('notification', handleNotification),
      ws.on('error_event', handleErrorEvent),
      ws.on('system_event', handleSystemEvent),
      // Phase UI/UX 2: Full Event Coverage
      ws.on('actuator_command', handleActuatorCommand),
      ws.on('actuator_command_failed', handleActuatorCommandFailed),
      ws.on('config_published', handleConfigPublished),
      ws.on('config_failed', handleConfigFailed),
      ws.on('device_rediscovered', handleDeviceRediscovered),
      ws.on('sequence_started', handleSequenceStarted),
      ws.on('sequence_step', handleSequenceStep),
      ws.on('sequence_completed', handleSequenceCompleted),
      ws.on('sequence_error', handleSequenceError),
      ws.on('sequence_cancelled', handleSequenceCancelled),
    )

    // BUG U FIX: Register callback to refresh ESP data when WebSocket connects/reconnects
    // This ensures the UI shows the current state from the server after connection is established
    wsUnsubscribers.push(
      websocketService.onConnect(() => {
        logger.info('WebSocket connected, refreshing ESP data...')
        // Use fetchAll to get current state from server
        // This handles the case where heartbeats arrived before WebSocket was connected
        fetchAll().catch(err => {
          logger.error(`Failed to refresh ESP data after WebSocket connect:`, err)
        })
      })
    )

    logger.debug('WebSocket handlers registered')
  }

  /**
   * Cleanup WebSocket subscriptions.
   * Call when app is being destroyed or user logs out.
   */
  function cleanupWebSocket(): void {
    wsUnsubscribers.forEach(unsub => unsub())
    wsUnsubscribers.length = 0
    ws.disconnect()
    logger.debug('WebSocket handlers unregistered')
  }

  // Auto-initialize WebSocket handlers on store creation
  initWebSocket()

  return {
    // State
    devices,
    selectedDeviceId,
    isLoading,
    error,
    
    // Pending Devices State (Discovery/Approval)
    pendingDevices,
    isPendingLoading,
    pendingCount,

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
    
    // Pending Device Actions (Discovery/Approval)
    fetchPendingDevices,
    approveDevice,
    rejectDevice,
    
    // Actuator Commands (Real + Mock)
    sendActuatorCommand,
    emergencyStopAll,

    // Mock ESP specific actions
    triggerHeartbeat,
    setState,
    setAutoHeartbeat,
    addSensor,
    updateSensorConfig,  // Phase 2F: Edit Sensor Config
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

    // GPIO Status (Phase 3)
    gpioStatusMap,
    gpioStatusLoading,
    getGpioStatusForEsp,
    getAvailableGpios,
    getReservedGpios,
    isGpioAvailableForEsp,
    getAllPinStatuses,
    getSystemPinName,
    fetchGpioStatus,
    clearGpioStatus,
    updateGpioStatusFromHeartbeat,

    // OneWire Scan (Phase 6 - DS18B20 Support)
    oneWireScanStates,
    getOneWireScanState,
    scanOneWireBus,
    clearOneWireScan,
    toggleRomSelection,
    selectAllOneWireDevices,
    deselectAllOneWireDevices,
    selectSpecificRomCodes,
    isRomCodeSelected,
  }
})

