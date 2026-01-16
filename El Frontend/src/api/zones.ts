/**
 * Zone Assignment API Client
 *
 * Provides methods for zone assignment operations with the backend.
 * Follows the same patterns as other API clients (sensors.ts, actuators.ts).
 */

import api from './index'
import type { ZoneAssignRequest, ZoneAssignResponse, ZoneRemoveResponse, ZoneInfo } from '@/types'

/**
 * Zone Assignment API client
 */
export const zonesApi = {
  /**
   * Assign ESP to a zone
   *
   * Sends zone assignment request to server, which publishes via MQTT to ESP.
   * ESP confirmation comes asynchronously via WebSocket zone_assignment event.
   */
  async assignZone(
    deviceId: string,
    request: ZoneAssignRequest
  ): Promise<ZoneAssignResponse> {
    const response = await api.post<ZoneAssignResponse>(
      `/zone/devices/${deviceId}/assign`,
      request
    )
    return response.data
  },

  /**
   * Remove zone assignment from ESP
   *
   * Sends empty zone assignment to ESP to clear its configuration.
   */
  async removeZone(deviceId: string): Promise<ZoneRemoveResponse> {
    const response = await api.delete<ZoneRemoveResponse>(
      `/zone/devices/${deviceId}/zone`
    )
    return response.data
  },

  /**
   * Get zone information for an ESP
   */
  async getZoneInfo(deviceId: string): Promise<ZoneInfo> {
    const response = await api.get<ZoneInfo>(`/zone/devices/${deviceId}`)
    return response.data
  },

  /**
   * Get all ESPs in a specific zone
   */
  async getZoneDevices(zoneId: string): Promise<ZoneInfo[]> {
    const response = await api.get<ZoneInfo[]>(`/zone/${zoneId}/devices`)
    return response.data
  },

  /**
   * Get all unassigned ESPs (without zone_id)
   */
  async getUnassignedDevices(): Promise<string[]> {
    const response = await api.get<string[]>('/zone/unassigned')
    return response.data
  }
}

















