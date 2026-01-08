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
import { useWebSocket } from '@/composables/useWebSocket'
import { websocketService } from '@/services/websocket'
import { useToast } from '@/composables/useToast'
import type { MockSystemState, MockSensorConfig, MockActuatorConfig, QualityLevel, MessageType, ConfigResponse, ConfigResponseExtended, ConfigFailure, MockESPCreate, OfflineInfo, OfflineReason, StatusSource, SensorConfigCreate, SensorHealthEvent, MockSensor, GpioStatusResponse, GpioUsageItem, GpioPinStatus, GpioOwner, HeartbeatGpioItem } from '@/types'

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
  // State
  const devices = ref<ESPDevice[]>([])
  const selectedDeviceId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // GPIO Status State (Phase 3)
  const gpioStatusMap = ref<Map<string, GpioStatusResponse>>(new Map())
  const gpioStatusLoading = ref<Map<string, boolean>>(new Map())

  // WebSocket integration
  // Note: Server broadcasts these types from MQTT handlers:
  // - esp_health (heartbeat_handler.py)
  // - sensor_data (sensor_handler.py)
  // - actuator_status (actuator_handler.py)
  // - actuator_alert (actuator_alert_handler.py)
  // - config_response (config_handler.py)
  // - sensor_health (maintenance/jobs/sensor_health.py) - Phase 2E
  const ws = useWebSocket({
    autoConnect: true,
    autoReconnect: true,
    filters: {
      types: ['esp_health', 'sensor_data', 'actuator_status', 'actuator_alert', 'config_response', 'zone_assignment', 'sensor_health'] as MessageType[],
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

  // =========================================================================
  // GPIO Status Getters (Phase 3)
  // =========================================================================

  /**
   * Get GPIO status for a specific ESP.
   */
  function getGpioStatusForEsp(espId: string): GpioStatusResponse | null {
    return gpioStatusMap.value.get(espId) ?? null
  }

  /**
   * Get available GPIOs for a specific ESP.
   */
  function getAvailableGpios(espId: string): number[] {
    return gpioStatusMap.value.get(espId)?.available ?? []
  }

  /**
   * Get reserved GPIOs for a specific ESP.
   */
  function getReservedGpios(espId: string): GpioUsageItem[] {
    return gpioStatusMap.value.get(espId)?.reserved ?? []
  }

  /**
   * Check if a GPIO is available for a specific ESP.
   */
  function isGpioAvailableForEsp(espId: string, gpio: number): boolean {
    const status = gpioStatusMap.value.get(espId)
    if (!status) return false  // Unknown = not available (safe default)
    return status.available.includes(gpio)
  }

  /**
   * Get human-readable name for system pins.
   */
  function getSystemPinName(gpio: number): string {
    const names: Record<number, string> = {
      0: 'Boot',
      1: 'UART TX',
      2: 'Boot',
      3: 'UART RX',
      6: 'Flash CLK',
      7: 'Flash D0',
      8: 'Flash D1',
      9: 'Flash D2',
      10: 'Flash D3',
      11: 'Flash CMD',
      21: 'I2C SDA',
      22: 'I2C SCL'
    }
    return names[gpio] ?? `System ${gpio}`
  }

  /**
   * Get enriched pin status list for UI.
   * Combines all GPIO info into displayable format.
   */
  function getAllPinStatuses(espId: string): GpioPinStatus[] {
    const status = gpioStatusMap.value.get(espId)
    if (!status) return []

    const allPins: GpioPinStatus[] = []

    // Available pins
    for (const gpio of status.available) {
      allPins.push({
        gpio,
        available: true,
        owner: null,
        component: null,
        name: null,
        statusClass: 'available',
        tooltip: `GPIO ${gpio} - Verfügbar`
      })
    }

    // Reserved pins
    for (const item of status.reserved) {
      allPins.push({
        gpio: item.gpio,
        available: false,
        owner: item.owner,
        component: item.component,
        name: item.name,
        statusClass: item.owner as 'sensor' | 'actuator' | 'system',
        tooltip: `GPIO ${item.gpio} - ${item.owner}: ${item.name || item.component}`
      })
    }

    // System pins
    for (const gpio of status.system) {
      allPins.push({
        gpio,
        available: false,
        owner: 'system',
        component: getSystemPinName(gpio),
        name: null,
        statusClass: 'system',
        tooltip: `GPIO ${gpio} - System (${getSystemPinName(gpio)})`
      })
    }

    return allPins.sort((a, b) => a.gpio - b.gpio)
  }

  // =========================================================================
  // GPIO Status Actions (Phase 3)
  // =========================================================================

  /**
   * Fetch GPIO status for an ESP device.
   *
   * Called when:
   * - ESP detail view is opened
   * - Add sensor/actuator modal is opened
   * - After successful sensor/actuator creation
   */
  async function fetchGpioStatus(espId: string): Promise<GpioStatusResponse | null> {
    // Prevent duplicate fetches
    if (gpioStatusLoading.value.get(espId)) {
      return gpioStatusMap.value.get(espId) ?? null
    }

    gpioStatusLoading.value.set(espId, true)

    try {
      const status = await espApi.getGpioStatus(espId)
      gpioStatusMap.value.set(espId, status)
      return status
    } catch (err) {
      console.error(`[ESP Store] Failed to fetch GPIO status for ${espId}:`, err)
      return null
    } finally {
      gpioStatusLoading.value.set(espId, false)
    }
  }

  /**
   * Clear GPIO status for an ESP (e.g., when device goes offline).
   */
  function clearGpioStatus(espId: string): void {
    gpioStatusMap.value.delete(espId)
  }

  /**
   * Update GPIO status from WebSocket esp_health event.
   *
   * Partial update: Only updates if gpio_status is present in event.
   * If no full status exists yet, triggers a full fetch.
   */
  function updateGpioStatusFromHeartbeat(
    espId: string,
    gpioStatus: HeartbeatGpioItem[]
  ): void {
    const current = gpioStatusMap.value.get(espId)
    if (!current) {
      // No full status yet, trigger full fetch
      fetchGpioStatus(espId)
      return
    }

    // Update reserved list from ESP-reported data
    // Note: This is a partial update, full status comes from API
    const espReported: GpioUsageItem[] = gpioStatus
      .filter(item => !item.safe)  // Only non-safe-mode pins
      .map(item => ({
        gpio: item.gpio,
        owner: item.owner as GpioOwner,
        component: item.component,
        name: null,
        id: null,
        source: 'esp_reported' as const
      }))

    // Merge: Keep DB-sourced items, add/update ESP-reported
    const dbItems = current.reserved.filter(r => r.source === 'database' || r.source === 'static')
    const mergedReserved = [...dbItems]

    for (const espItem of espReported) {
      const existingIndex = mergedReserved.findIndex(r => r.gpio === espItem.gpio)
      if (existingIndex === -1) {
        mergedReserved.push(espItem)
      }
      // Don't overwrite DB/static items with ESP items (DB is more detailed)
    }

    // Update available list
    const reservedGpios = new Set(mergedReserved.map(r => r.gpio))
    const systemGpios = new Set(current.system)
    const available = Array.from({ length: 40 }, (_, i) => i)
      .filter(gpio => !reservedGpios.has(gpio) && !systemGpios.has(gpio))

    gpioStatusMap.value.set(espId, {
      ...current,
      available,
      reserved: mergedReserved,
      last_esp_report: new Date().toISOString()
    })
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
        const realConfig: SensorConfigCreate = {
          esp_id: deviceId,
          gpio: config.gpio,
          sensor_type: config.sensor_type,
          name: config.name || null,
          enabled: true,
          // Operating Mode Felder (Phase 2B)
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
        const realConfig: SensorConfigCreate = {
          esp_id: deviceId,
          gpio: gpio,
          sensor_type: existingSensor.sensor_type,
          name: config.name !== undefined ? config.name : existingSensor.name,
          enabled: config.enabled !== undefined ? config.enabled : true,
          // Operating Mode Felder (Phase 2F)
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
   * 3. LWT handler - sends source='lwt' when ESP disconnects unexpectedly
   *
   * BUG X FIX: If device is unknown but status is "online", refresh device list
   * to show newly connected ESPs immediately in the UI.
   */
  function handleEspHealth(message: any): void {
    const data = message.data
    const espId = data.esp_id || data.device_id

    // DEBUG: Log when WebSocket event arrives
    console.log('[ESP Store] handleEspHealth received:', {
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
      console.info(`[ESP Store] New device online: ${espId}, refreshing device list...`)
      fetchAll().catch(err => {
        console.error('[ESP Store] Failed to refresh devices after new online device:', err)
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
      let newLastSeen: string | undefined = device.last_seen
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

      console.debug(`[ESP Store] esp_health update for ${espId}:`, {
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
   *
   * Phase 4: Extended to handle partial_success and failures array
   * - Max 3 detail toasts for individual failures
   * - Additional failures logged to console
   */
  function handleConfigResponse(message: any): void {
    const data = message.data as ConfigResponseExtended
    const toast = useToast()

    if (!data.esp_id) return

    const deviceName = devices.value.find(d => getDeviceId(d) === data.esp_id)?.name || data.esp_id
    const MAX_DETAIL_TOASTS = 3

    if (data.status === 'success') {
      toast.success(
        `${deviceName}: ${data.message}`,
        { duration: 4000 }
      )
      console.info(`[ESP Store] Config success: ${data.esp_id} - ${data.config_type} (${data.count})`)
    } else if (data.status === 'partial_success') {
      // Phase 4: Partial success - some items OK, some failed
      toast.warning(
        `${deviceName}: ${data.count} konfiguriert, ${data.failed_count || 0} fehlgeschlagen`,
        { duration: 6000 }
      )
      console.warn(`[ESP Store] Config partial_success: ${data.esp_id} - ${data.count} OK, ${data.failed_count} failed`)

      // Show detail toasts for individual failures (max 3)
      if (data.failures && data.failures.length > 0) {
        const toShow = data.failures.slice(0, MAX_DETAIL_TOASTS)
        toShow.forEach((failure: ConfigFailure) => {
          toast.error(
            `GPIO ${failure.gpio} (${failure.type}): ${failure.error}${failure.detail ? ` - ${failure.detail}` : ''}`,
            { duration: 8000 }
          )
        })

        // Log additional failures to console
        if (data.failures.length > MAX_DETAIL_TOASTS) {
          const remaining = data.failures.slice(MAX_DETAIL_TOASTS)
          console.warn(`[ESP Store] ${remaining.length} additional failures (not shown in toast):`)
          remaining.forEach((failure: ConfigFailure) => {
            console.warn(`  - GPIO ${failure.gpio} (${failure.type}): ${failure.error} - ${failure.detail || 'No details'}`)
          })
        }
      }
    } else {
      // Full error - all items failed
      toast.error(
        `${deviceName}: ${data.error_code || 'CONFIG_ERROR'} - ${data.message}`,
        { duration: 6000 }
      )
      console.error(`[ESP Store] Config error: ${data.esp_id} - ${data.error_code}`)

      // Phase 4: Show detail toasts for failures (max 3)
      if (data.failures && data.failures.length > 0) {
        const toShow = data.failures.slice(0, MAX_DETAIL_TOASTS)
        toShow.forEach((failure: ConfigFailure) => {
          toast.error(
            `GPIO ${failure.gpio}: ${failure.detail || failure.error}`,
            { duration: 8000 }
          )
        })

        // Log additional failures to console
        if (data.failures.length > MAX_DETAIL_TOASTS) {
          const remaining = data.failures.slice(MAX_DETAIL_TOASTS)
          console.error(`[ESP Store] ${remaining.length} additional failures:`)
          remaining.forEach((failure: ConfigFailure) => {
            console.error(`  - GPIO ${failure.gpio}: ${failure.error} - ${failure.detail || 'No details'}`)
          })
        }
      } else if (data.failed_item) {
        // Legacy: Single failed_item (backward compatibility)
        const item = data.failed_item
        toast.error(
          `GPIO ${item.gpio || 'N/A'}: ${item.sensor_type || item.actuator_type || 'Unknown'}`,
          { duration: 8000 }
        )
      }
    }

    // Refresh GPIO status after config change
    fetchGpioStatus(data.esp_id)
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

  /**
   * Handle sensor_health WebSocket event (Phase 2E).
   * Updates sensor stale status based on timeout violations.
   *
   * Server payload (from maintenance/jobs/sensor_health.py):
   * {
   *   esp_id: string,
   *   gpio: number,
   *   sensor_type: string,
   *   sensor_name: string | null,
   *   is_stale: boolean,
   *   stale_reason: 'timeout_exceeded' | 'no_data' | 'sensor_error',
   *   last_reading_at: string | null,
   *   timeout_seconds: number,
   *   seconds_overdue: number,
   *   operating_mode: string,
   *   config_source: string,
   *   timestamp: number
   * }
   */
  function handleSensorHealth(message: { data: SensorHealthEvent }): void {
    const event = message.data

    if (!event.esp_id || event.gpio === undefined) {
      console.warn('[ESP Store] sensor_health missing esp_id or gpio')
      return
    }

    // Find the device
    const deviceIndex = devices.value.findIndex(d => getDeviceId(d) === event.esp_id)
    if (deviceIndex === -1) {
      console.debug(`[ESP Store] sensor_health: Device not found: ${event.esp_id}`)
      return
    }

    const device = devices.value[deviceIndex]
    if (!device.sensors) {
      console.debug(`[ESP Store] sensor_health: Device ${event.esp_id} has no sensors`)
      return
    }

    // Find the sensor
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
      console.debug(
        `[ESP Store] sensor_health: Sensor GPIO ${event.gpio} not found on ${event.esp_id}`
      )
      return
    }

    // Update sensor health status
    // Note: We update the sensor in-place since sensors is already reactive
    const sensor = sensors[sensorIndex]
    sensor.is_stale = event.is_stale
    sensor.stale_reason = event.stale_reason
    sensor.last_reading_at = event.last_reading_at
    sensor.operating_mode = event.operating_mode
    sensor.timeout_seconds = event.timeout_seconds

    if (event.is_stale) {
      console.warn(
        `[ESP Store] Sensor stale: ${event.esp_id} GPIO ${event.gpio} ` +
        `(${event.sensor_type}) - ${event.stale_reason}, ` +
        `overdue by ${event.seconds_overdue}s`
      )
    } else {
      console.debug(
        `[ESP Store] Sensor health updated: ${event.esp_id} GPIO ${event.gpio} ` +
        `is_stale=${event.is_stale}`
      )
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
      ws.on('sensor_health', handleSensorHealth),  // Phase 2E
    )

    // BUG U FIX: Register callback to refresh ESP data when WebSocket connects/reconnects
    // This ensures the UI shows the current state from the server after connection is established
    wsUnsubscribers.push(
      websocketService.onConnect(() => {
        console.log('[ESP Store] WebSocket connected, refreshing ESP data...')
        // Use fetchAll to get current state from server
        // This handles the case where heartbeats arrived before WebSocket was connected
        fetchAll().catch(err => {
          console.error('[ESP Store] Failed to refresh ESP data after WebSocket connect:', err)
        })
      })
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
  }
})

