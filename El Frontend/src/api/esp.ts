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

export interface ESPDevice {
  id?: string
  device_id: string
  esp_id?: string // Alias for device_id (for Mock ESP compatibility)
  name?: string | null
  zone_id?: string | null
  zone_name?: string | null
  master_zone_id?: string | null
  is_zone_master?: boolean
  ip_address?: string
  mac_address?: string
  firmware_version?: string
  hardware_type?: string
  capabilities?: Record<string, unknown>
  status?: string // online, offline, error, unknown
  last_seen?: string | null
  metadata?: Record<string, unknown>
  sensor_count?: number
  actuator_count?: number
  // Mock ESP specific fields
  system_state?: string
  sensors?: unknown[]
  actuators?: unknown[]
  auto_heartbeat?: boolean
  heap_free?: number
  wifi_rssi?: number
  uptime?: number
  last_heartbeat?: string | null
  connected?: boolean
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
   */
  async listDevices(params?: {
    zone_id?: string
    status?: string
    hardware_type?: string
    page?: number
    page_size?: number
  }): Promise<ESPDevice[]> {
    // Fetch both Mock and Real ESPs in parallel
    const [mockEsps, realEspsResponse] = await Promise.all([
      debugApi.listMockEsps().catch(() => [] as MockESP[]),
      api
        .get<ESPDeviceListResponse>('/v1/esp/devices', { params })
        .catch(() => ({ data: { success: true, data: [] } }))
        .then((res) => (res.data?.data || []) as ESPDevice[]),
    ])

    // Normalize Mock ESPs to unified format
    const normalizedMockEsps: ESPDevice[] = mockEsps.map((mock) => ({
      id: mock.esp_id,
      device_id: mock.esp_id,
      esp_id: mock.esp_id,
      name: null,
      zone_id: mock.zone_id || null,
      zone_name: null,
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

    // Combine and return
    return [...normalizedMockEsps, ...realEspsResponse]
  },

  /**
   * Get a specific ESP device (Mock or Real)
   */
  async getDevice(espId: string): Promise<ESPDevice> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      const mockEsp = await debugApi.getMockEsp(normalizedId)
      return {
        id: mockEsp.esp_id,
        device_id: mockEsp.esp_id,
        esp_id: mockEsp.esp_id,
        name: null,
        zone_id: mockEsp.zone_id || null,
        zone_name: null,
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
      const response = await api.get<ESPDevice>(`/v1/esp/devices/${normalizedId}`)
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
        name: null,
        zone_id: mockEsp.zone_id || null,
        zone_name: null,
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
      const response = await api.post<ESPDevice>('/v1/esp/devices', realConfig)
      return response.data
    }
  },

  /**
   * Update an ESP device (Mock or Real)
   */
  async updateDevice(
    espId: string,
    update: ESPDeviceUpdate
  ): Promise<ESPDevice> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      // Mock ESPs don't have a direct update endpoint
      // We need to get the current device and recreate if needed
      // For now, we'll use the state endpoint for system_state changes
      const current = await debugApi.getMockEsp(normalizedId)
      
      // If zone_id changed, we can't update Mock ESPs directly via API
      // This would require backend support
      // For now, return the current device
      return {
        id: current.esp_id,
        device_id: current.esp_id,
        esp_id: current.esp_id,
        name: null,
        zone_id: update.zone_id !== undefined ? update.zone_id : current.zone_id || null,
        zone_name: update.zone_name !== undefined ? update.zone_name : null,
        master_zone_id: current.master_zone_id || null,
        is_zone_master: update.is_zone_master !== undefined ? update.is_zone_master : false,
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
      }
    } else {
      const response = await api.patch<ESPDevice>(
        `/v1/esp/devices/${normalizedId}`,
        update
      )
      return response.data
    }
  },

  /**
   * Delete an ESP device (Mock or Real)
   */
  async deleteDevice(espId: string): Promise<void> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      await debugApi.deleteMockEsp(normalizedId)
    } else {
      // Real ESPs might not have a delete endpoint
      // Check if endpoint exists, otherwise throw error
      throw new Error('Deleting real ESP devices is not supported via API')
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
        last_seen: mockEsp.last_heartbeat || null,
      }
    } else {
      const response = await api.get<ESPHealthResponse>(
        `/v1/esp/devices/${normalizedId}/health`
      )
      return response.data
    }
  },

  /**
   * Restart an ESP device
   */
  async restartDevice(
    espId: string,
    delaySeconds?: number,
    reason?: string
  ): Promise<ESPCommandResponse> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      // Mock ESPs don't have restart endpoint
      // Return success response
      return {
        success: true,
        device_id: normalizedId,
        command: 'restart',
        command_sent: false,
      }
    } else {
      const response = await api.post<ESPCommandResponse>(
        `/v1/esp/devices/${normalizedId}/restart`,
        { delay_seconds: delaySeconds || 0, reason }
      )
      return response.data
    }
  },

  /**
   * Factory reset an ESP device
   */
  async resetDevice(
    espId: string,
    preserveWifi: boolean = false
  ): Promise<ESPCommandResponse> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      // Mock ESPs don't have reset endpoint
      return {
        success: true,
        device_id: normalizedId,
        command: 'reset',
        command_sent: false,
      }
    } else {
      const response = await api.post<ESPCommandResponse>(
        `/v1/esp/devices/${normalizedId}/reset`,
        { confirm: true, preserve_wifi: preserveWifi }
      )
      return response.data
    }
  },

  /**
   * Update ESP configuration via MQTT
   */
  async updateConfig(
    espId: string,
    config: Record<string, unknown>
  ): Promise<ESPConfigResponse> {
    const normalizedId = normalizeEspId(espId)

    if (isMockEsp(normalizedId)) {
      // Mock ESPs don't support config updates via this endpoint
      return {
        success: true,
        device_id: normalizedId,
        config_sent: false,
        config_acknowledged: false,
      }
    } else {
      const response = await api.post<ESPConfigResponse>(
        `/v1/esp/devices/${normalizedId}/config`,
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



