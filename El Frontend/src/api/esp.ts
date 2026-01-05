/**
 * Unified ESP API Client
 * 
 * Supports both Mock ESPs (via /debug/mock-esp) and Real ESPs (via /v1/esp/devices).
 * Automatically routes API calls based on ESP ID detection.
 */

import api from './index'
import { debugApi } from './debug'
import type { MockESP, MockESPCreate } from '@/types'

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Unified ESP Device interface.
 *
 * ID Naming Convention (aligned with Server and ESP32 Firmware):
 * - `device_id`: Primary identifier (format: ESP_XXXXXXXX or ESP_MOCK_XXX)
 *   - Used by Server API and Database
 *   - Always present in all ESP types
 * - `esp_id`: Alias for device_id (backward compatibility with Mock ESPs)
 *   - Mock ESPs originally used esp_id as primary key
 *   - When present, should equal device_id
 * - `id`: Database UUID (optional, only from Server DB responses)
 *
 * Zone Naming Convention:
 * - `zone_id`: Technical zone identifier (lowercase, no spaces, e.g., "zelt_1")
 *   - Auto-generated from zone_name if not provided
 *   - Used in MQTT topics and API calls
 * - `zone_name`: Human-readable zone name (allows spaces, e.g., "Zelt 1")
 *   - Displayed in UI
 *   - Falls back to zone_id if not set
 *
 * @see El Servador/god_kaiser_server/src/schemas/esp.py - ESPDeviceResponse
 * @see El Trabajante/src/utils/topic_builder.cpp - MQTT topic format
 */
export interface ESPDevice {
  id?: string                         // Database UUID (from Server)
  device_id: string                   // Primary ID: ESP_XXXXXXXX or ESP_MOCK_XXX
  esp_id?: string                     // Alias for device_id (Mock ESP compatibility)
  name?: string | null                // Human-readable device name
  zone_id?: string | null             // Technical zone ID (lowercase, no spaces)
  zone_name?: string | null           // Human-readable zone name (UI display)
  master_zone_id?: string | null      // Parent zone for hierarchical zones
  is_zone_master?: boolean            // Whether this ESP is zone master
  ip_address?: string
  mac_address?: string
  firmware_version?: string
  hardware_type?: string              // ESP32_WROOM, XIAO_ESP32_C3, MOCK_ESP32
  capabilities?: Record<string, unknown>
  status?: string                     // online, offline, error, unknown
  last_seen?: string | null           // ISO timestamp of last heartbeat
  metadata?: Record<string, unknown>
  sensor_count?: number
  actuator_count?: number
  // Mock ESP specific fields (from debug API in-memory store)
  system_state?: string               // MockSystemState (BOOT, OPERATIONAL, etc.)
  sensors?: unknown[]                 // MockSensor[]
  actuators?: unknown[]               // MockActuator[]
  auto_heartbeat?: boolean            // Whether auto-heartbeat is enabled (Mock ESPs only)
  heartbeat_interval_seconds?: number // Heartbeat interval in seconds (Mock ESPs only)
  heap_free?: number                  // Free heap memory in bytes
  wifi_rssi?: number                  // WiFi signal strength in dBm
  uptime?: number                     // Uptime in seconds
  last_heartbeat?: string | null      // ISO timestamp
  connected?: boolean                 // MQTT connection status
  created_at?: string
  updated_at?: string
}

export interface ESPDeviceListResponse {
  success: boolean
  data: ESPDevice[]
  pagination?: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

export interface ESPDeviceUpdate {
  name?: string
  zone_id?: string | null
  zone_name?: string | null
  is_zone_master?: boolean
  capabilities?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface ESPDeviceCreate {
  device_id: string
  name?: string
  zone_id?: string
  zone_name?: string
  is_zone_master?: boolean
  ip_address: string
  mac_address: string
  firmware_version?: string
  hardware_type?: string
  capabilities?: Record<string, unknown>
}

export interface ESPHealthResponse {
  success: boolean
  device_id: string
  status: string
  metrics?: {
    uptime: number
    heap_free: number
    wifi_rssi: number
    sensor_count: number
    actuator_count: number
    timestamp: number
  }
  last_seen?: string
  uptime_formatted?: string
}

export interface ESPCommandResponse {
  success: boolean
  device_id: string
  command: string
  command_sent?: boolean
  result?: Record<string, unknown>
  error?: string
}

export interface ESPConfigResponse {
  success: boolean
  device_id: string
  config_sent: boolean
  config_acknowledged?: boolean
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if an ESP ID is a Mock ESP
 */
function isMockEsp(espId: string): boolean {
  return (
    espId.startsWith('ESP_MOCK_') ||
    espId.startsWith('MOCK_') ||
    espId.includes('MOCK')
  )
}

/**
 * Normalize ESP ID (handle both device_id and esp_id)
 */
function normalizeEspId(device: ESPDevice | string): string {
  if (typeof device === 'string') {
    return device
  }
  return device.device_id || device.esp_id || ''
}

// =============================================================================
// Unified ESP API
// =============================================================================

export const espApi = {
  /**
   * List all ESP devices (Mock + Real)
   *
   * IMPORTANT: Mock ESPs exist in both in-memory store AND database.
   * This function deduplicates by preferring the in-memory mock data
   * (which has richer state like sensors, actuators, system_state).
   */
  async listDevices(params?: {
    zone_id?: string
    status?: string
    hardware_type?: string
    page?: number
    page_size?: number
  }): Promise<ESPDevice[]> {
    // Fetch both Mock and Real ESPs in parallel
    const [mockEsps, dbDevices] = await Promise.all([
      debugApi.listMockEsps().catch((err) => {
        console.warn('[ESP API] Failed to fetch mock ESPs:', err)
        return [] as MockESP[]
      }),
      api
        .get<ESPDeviceListResponse>('/esp/devices', { params })
        .catch((err) => {
          console.warn('[ESP API] Failed to fetch DB devices:', err)
          return { data: { success: true, data: [] } }
        })
        .then((res) => (res.data?.data || []) as ESPDevice[]),
    ])

    console.log(`[ESP API] listDevices: ${mockEsps.length} mocks, ${dbDevices.length} DB devices`)

    // DEBUG: Log raw mock ESP data from server to verify name field
    if (mockEsps.length > 0) {
      console.log('[ESP API] listDevices: Raw Mock ESP data from debug API:')
      mockEsps.forEach((mock) => {
        console.log(`  - ${mock.esp_id}: name="${mock.name}", zone_id="${mock.zone_id}"`)
      })
    }

    // Create Set of mock ESP IDs for fast lookup
    const mockEspIds = new Set(mockEsps.map((m) => m.esp_id))

    // Normalize Mock ESPs to unified format (rich data from in-memory store)
    const normalizedMockEsps: ESPDevice[] = mockEsps.map((mock) => ({
      id: mock.esp_id,
      device_id: mock.esp_id,
      esp_id: mock.esp_id,
      name: mock.name || null,  // Now properly passed from server
      zone_id: mock.zone_id || null,
      zone_name: mock.zone_name || null,
      master_zone_id: mock.master_zone_id || null,
      is_zone_master: false,
      hardware_type: mock.hardware_type || 'MOCK_ESP32',
      status: mock.connected ? 'online' : 'offline',
      system_state: mock.system_state,
      sensors: mock.sensors,
      actuators: mock.actuators,
      auto_heartbeat: mock.auto_heartbeat,
      heap_free: mock.heap_free,
      wifi_rssi: mock.wifi_rssi,
      uptime: mock.uptime,
      last_heartbeat: mock.last_heartbeat,
      last_seen: mock.last_heartbeat,
      connected: mock.connected,
      sensor_count: mock.sensors?.length || 0,
      actuator_count: mock.actuators?.length || 0,
      created_at: mock.created_at,
    }))

    // Filter DB devices: exclude those that exist in mock store (prevent duplicates)
    // But mark mock IDs that only exist in DB as "orphaned"
    const filteredDbDevices = dbDevices
      .filter((device) => {
        const deviceId = device.device_id || device.esp_id || ''
        // If it's in the mock store, skip it (we already have richer data)
        if (mockEspIds.has(deviceId)) {
          console.debug(`[ESP API] Filtering out DB device ${deviceId} (exists in mock store)`)
          return false
        }
        return true
      })
      .map((device) => {
        const deviceId = device.device_id || device.esp_id || ''
        // Mark mock-pattern IDs that aren't in mock store as orphaned
        if (isMockEsp(deviceId)) {
          console.debug(`[ESP API] Marking ${deviceId} as orphaned mock (not in mock store)`)
          return {
            ...device,
            metadata: { ...device.metadata, orphaned_mock: true },
          }
        }
        return device
      })

    const result = [...normalizedMockEsps, ...filteredDbDevices]
    console.debug(`[ESP API] Returning ${result.length} devices (${normalizedMockEsps.length} mocks + ${filteredDbDevices.length} filtered DB)`)

    // Combine: Mock ESPs first (active), then real/orphaned
    return result
  },

  /**
   * Get a specific ESP device (Mock or Real)
   *
   * Handles orphaned mock devices by falling back to database if debug API returns 404
   */
  async getDevice(espId: string): Promise<ESPDevice> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      try {
        const mockEsp = await debugApi.getMockEsp(normalizedId)

        const result: ESPDevice = {
          id: mockEsp.esp_id,
          device_id: mockEsp.esp_id,
          esp_id: mockEsp.esp_id,
          name: mockEsp.name || null,  // Now properly passed from server
          zone_id: mockEsp.zone_id || null,
          zone_name: mockEsp.zone_name || null, // Map zone_name from Mock ESP
          master_zone_id: mockEsp.master_zone_id || null,
          is_zone_master: false,
          hardware_type: mockEsp.hardware_type || 'MOCK_ESP32',
          status: mockEsp.connected ? 'online' : 'offline',
          system_state: mockEsp.system_state,
          sensors: mockEsp.sensors,
          actuators: mockEsp.actuators,
          auto_heartbeat: mockEsp.auto_heartbeat,
          heap_free: mockEsp.heap_free,
          wifi_rssi: mockEsp.wifi_rssi,
          uptime: mockEsp.uptime,
          last_heartbeat: mockEsp.last_heartbeat,
          last_seen: mockEsp.last_heartbeat,
          connected: mockEsp.connected,
          sensor_count: mockEsp.sensors?.length || 0,
          actuator_count: mockEsp.actuators?.length || 0,
          created_at: mockEsp.created_at,
        }
        return result
      } catch (err: unknown) {
        const axiosError = err as { response?: { status?: number } }

        // If 404: device might exist in DB only (orphaned mock)
        if (axiosError.response?.status === 404) {
          console.warn(`[ESP API] Mock ESP ${normalizedId} not in debug store, trying database...`)
          const response = await api.get<ESPDevice>(`/esp/devices/${normalizedId}`)
          // Mark as orphaned mock for UI indication
          return {
            ...response.data,
            metadata: { ...response.data.metadata, orphaned_mock: true },
          }
        }
        throw err
      }
    } else {
      const response = await api.get<ESPDevice>(`/esp/devices/${normalizedId}`)
      return response.data
    }
  },

  /**
   * Create a new ESP device (Mock or Real)
   */
  async createDevice(config: ESPDeviceCreate | MockESPCreate): Promise<ESPDevice> {
    // Check if it's a Mock ESP create request
    const mockConfig = config as MockESPCreate
    if (mockConfig.esp_id && isMockEsp(mockConfig.esp_id)) {
      const mockEsp = await debugApi.createMockEsp(mockConfig)
      return {
        id: mockEsp.esp_id,
        device_id: mockEsp.esp_id,
        esp_id: mockEsp.esp_id,
        name: mockEsp.name || null,  // Now properly passed from server
        zone_id: mockEsp.zone_id || null,
        zone_name: mockEsp.zone_name || null, // Map zone_name from Mock ESP
        master_zone_id: mockEsp.master_zone_id || null,
        is_zone_master: false,
        hardware_type: mockEsp.hardware_type || 'MOCK_ESP32',
        status: mockEsp.connected ? 'online' : 'offline',
        system_state: mockEsp.system_state,
        sensors: mockEsp.sensors,
        actuators: mockEsp.actuators,
        auto_heartbeat: mockEsp.auto_heartbeat,
        heap_free: mockEsp.heap_free,
        wifi_rssi: mockEsp.wifi_rssi,
        uptime: mockEsp.uptime,
        last_heartbeat: mockEsp.last_heartbeat,
        last_seen: mockEsp.last_heartbeat,
        connected: mockEsp.connected,
        sensor_count: mockEsp.sensors?.length || 0,
        actuator_count: mockEsp.actuators?.length || 0,
        created_at: mockEsp.created_at,
      }
    } else {
      const realConfig = config as ESPDeviceCreate
      const response = await api.post<ESPDevice>('/esp/devices', realConfig)
      return response.data
    }
  },

  /**
   * Update an ESP device (Mock or Real)
   *
   * Mock ESPs are registered in the database (see debug.py:create_mock_esp)
   * and can be updated via the normal ESP API.
   */
  async updateDevice(
    espId: string,
    update: ESPDeviceUpdate
  ): Promise<ESPDevice> {
    const normalizedId = normalizeEspId(espId)

    // Both Mock and Real ESPs are in the database and can be updated via the normal API
    // Mock ESPs are registered in DB when created (debug.py lines 104-146)
    try {
      console.log(`[ESP API] updateDevice: Sending PATCH to /esp/devices/${normalizedId}`, update)
      const response = await api.patch<ESPDevice>(
        `/esp/devices/${normalizedId}`,
        update
      )
      console.log(`[ESP API] updateDevice: Server response:`, {
        status: response.status,
        name: response.data.name,
        device_id: response.data.device_id,
        fullData: response.data,
      })
      return response.data
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } }

      // If 404 and it's a Mock ESP, it might only exist in the debug store
      // This can happen if the server was restarted (DB cleared) but UI still has cached data
      if (axiosError.response?.status === 404 && isMockEsp(normalizedId)) {
        console.warn(
          `[ESP API] Mock ESP ${normalizedId} not found in database. ` +
          `It may need to be recreated. Fetching current state from debug store...`
        )

        // Try to get current state from debug store
        try {
          const current = await debugApi.getMockEsp(normalizedId)
          return {
            id: current.esp_id,
            device_id: current.esp_id,
            esp_id: current.esp_id,
            name: current.name || null,  // Now properly passed from server
            zone_id: current.zone_id || null,
            zone_name: current.zone_name || null,
            master_zone_id: current.master_zone_id || null,
            is_zone_master: false,
            hardware_type: current.hardware_type || 'MOCK_ESP32',
            status: current.connected ? 'online' : 'offline',
            system_state: current.system_state,
            sensors: current.sensors,
            actuators: current.actuators,
            auto_heartbeat: current.auto_heartbeat,
            heap_free: current.heap_free,
            wifi_rssi: current.wifi_rssi,
            uptime: current.uptime,
            last_heartbeat: current.last_heartbeat,
            last_seen: current.last_heartbeat,
            connected: current.connected,
            sensor_count: current.sensors?.length || 0,
            actuator_count: current.actuators?.length || 0,
            created_at: current.created_at,
            metadata: { db_sync_required: true, message: 'Mock ESP exists in debug store but not in database' },
          }
        } catch {
          // Not in debug store either - device truly doesn't exist
          throw err
        }
      }
      throw err
    }
  },

  /**
   * Delete an ESP device (Mock or Real)
   *
   * Handles orphaned mock devices that exist in DB but not in debug store:
   * - First tries debug API for mock devices
   * - Falls back to database deletion if debug API returns 404
   */
  async deleteDevice(espId: string): Promise<void> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      try {
        // Try debug API first (in-memory mock store)
        await debugApi.deleteMockEsp(normalizedId)
      } catch (err: unknown) {
        const axiosError = err as { response?: { status?: number } }

        // If 404: device exists in DB but not in mock store (orphaned)
        // Try to delete from database directly
        if (axiosError.response?.status === 404) {
          console.warn(`[ESP API] Mock ESP ${normalizedId} not found in debug store, trying database deletion...`)
          try {
            await api.delete(`/esp/devices/${normalizedId}`)
            console.info(`[ESP API] Successfully deleted orphaned mock ESP ${normalizedId} from database`)
            return
          } catch (dbErr: unknown) {
            const dbAxiosError = dbErr as { response?: { status?: number } }
            // If also 404 in DB, device is already gone - consider success
            if (dbAxiosError.response?.status === 404) {
              console.info(`[ESP API] Mock ESP ${normalizedId} already deleted from database`)
              return
            }
            throw new Error(`Konnte verwaisten Mock ESP nicht löschen: ${normalizedId}. Das Gerät existiert möglicherweise nur noch im UI-Cache.`)
          }
        }
        throw err
      }
    } else {
      // Real ESP - delete from database
      await api.delete(`/esp/devices/${normalizedId}`)
    }
  },

  /**
   * Get ESP health metrics
   */
  async getHealth(espId: string): Promise<ESPHealthResponse> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      const mockEsp = await debugApi.getMockEsp(normalizedId)
      return {
        success: true,
        device_id: mockEsp.esp_id,
        status: mockEsp.connected ? 'online' : 'offline',
        metrics: {
          uptime: mockEsp.uptime,
          heap_free: mockEsp.heap_free,
          wifi_rssi: mockEsp.wifi_rssi,
          sensor_count: mockEsp.sensors?.length || 0,
          actuator_count: mockEsp.actuators?.length || 0,
          timestamp: Math.floor(Date.now() / 1000),
        },
        last_seen: mockEsp.last_heartbeat ?? undefined,
      }
    } else {
      const response = await api.get<ESPHealthResponse>(
        `/esp/devices/${normalizedId}/health`
      )
      return response.data
    }
  },

  /**
   * Restart an ESP device
   *
   * Note: Mock ESPs don't support restart commands. The response will indicate
   * that no command was sent.
   */
  async restartDevice(
    espId: string,
    delaySeconds?: number,
    reason?: string
  ): Promise<ESPCommandResponse> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      // Mock ESPs don't have restart endpoint - be honest about it
      console.info(`[ESP API] Restart command not available for Mock ESP ${normalizedId}`)
      return {
        success: false, // Changed to false - command wasn't actually executed
        device_id: normalizedId,
        command: 'restart',
        command_sent: false,
        error: 'Mock ESPs unterstützen keine Restart-Befehle. Dies ist ein simuliertes Gerät.',
      }
    } else {
      const response = await api.post<ESPCommandResponse>(
        `/esp/devices/${normalizedId}/restart`,
        { delay_seconds: delaySeconds || 0, reason }
      )
      return response.data
    }
  },

  /**
   * Factory reset an ESP device
   *
   * Note: Mock ESPs don't support factory reset. The response will indicate
   * that no command was sent.
   */
  async resetDevice(
    espId: string,
    preserveWifi: boolean = false
  ): Promise<ESPCommandResponse> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      // Mock ESPs don't have reset endpoint - be honest about it
      console.info(`[ESP API] Factory reset command not available for Mock ESP ${normalizedId}`)
      return {
        success: false, // Changed to false - command wasn't actually executed
        device_id: normalizedId,
        command: 'reset',
        command_sent: false,
        error: 'Mock ESPs unterstützen keine Reset-Befehle. Zum Zurücksetzen bitte löschen und neu erstellen.',
      }
    } else {
      const response = await api.post<ESPCommandResponse>(
        `/esp/devices/${normalizedId}/reset`,
        { confirm: true, preserve_wifi: preserveWifi }
      )
      return response.data
    }
  },

  /**
   * Update ESP configuration via MQTT
   *
   * Note: Mock ESPs don't support MQTT config updates. Use the debug API
   * for Mock ESP state changes.
   */
  async updateConfig(
    espId: string,
    config: Record<string, unknown>
  ): Promise<ESPConfigResponse> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      // Mock ESPs don't support config updates via MQTT
      console.info(`[ESP API] Config updates via MQTT not available for Mock ESP ${normalizedId}`)
      return {
        success: false, // Changed to false - config wasn't actually sent
        device_id: normalizedId,
        config_sent: false,
        config_acknowledged: false,
      }
    } else {
      const response = await api.post<ESPConfigResponse>(
        `/esp/devices/${normalizedId}/config`,
        config
      )
      return response.data
    }
  },

  /**
   * Check if ESP is Mock
   */
  isMockEsp(espId: string): boolean {
    return isMockEsp(espId)
  },
}



