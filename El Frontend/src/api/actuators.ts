import api from './index'
import type { ActuatorConfigCreate, ActuatorConfigResponse } from '@/types'

export interface ActuatorCommandRequest {
  command: 'ON' | 'OFF' | 'PWM' | 'TOGGLE'
  value?: number
  duration?: number
}

export interface ActuatorCommandResponse {
  success: boolean
  esp_id: string
  gpio: number
  command: string
  value: number
  command_sent: boolean
  acknowledged: boolean
  safety_warnings: string[]
}

export interface EmergencyStopRequest {
  esp_id?: string
  gpio?: number
  reason: string
}

export interface EmergencyStopResponse {
  success: boolean
  message: string
  devices_stopped: number
  actuators_stopped: number
  reason: string
  timestamp: string
  details: Array<{
    esp_id: string
    actuators: Array<{
      esp_id: string
      gpio: number
      success: boolean
      message?: string
    }>
  }>
}

export const actuatorsApi = {
  /**
   * Create or update actuator configuration
   */
  async createOrUpdate(
    espId: string,
    gpio: number,
    config: ActuatorConfigCreate
  ): Promise<ActuatorConfigResponse> {
    const response = await api.post<ActuatorConfigResponse>(
      `/actuators/${espId}/${gpio}`,
      {
        ...config,
        esp_id: espId,
        gpio,
      }
    )
    return response.data
  },

  /**
   * Delete actuator configuration
   */
  async delete(espId: string, gpio: number): Promise<void> {
    await api.delete(`/actuators/${espId}/${gpio}`)
  },

  /**
   * Get actuator configuration
   */
  async get(espId: string, gpio: number): Promise<ActuatorConfigResponse> {
    const response = await api.get<ActuatorConfigResponse>(
      `/actuators/${espId}/${gpio}`
    )
    return response.data
  },

  /**
   * List actuator configurations
   */
  async list(params?: {
    esp_id?: string
    actuator_type?: string
    enabled?: boolean
    page?: number
    page_size?: number
  }): Promise<{ data: ActuatorConfigResponse[]; total: number }> {
    const response = await api.get<{
      data: ActuatorConfigResponse[]
      total: number
      page: number
      page_size: number
      total_pages: number
    }>('/actuators/', { params })
    return {
      data: response.data.data,
      total: response.data.total,
    }
  },

  /**
   * Send command to actuator via MQTT
   */
  async sendCommand(
    espId: string,
    gpio: number,
    command: ActuatorCommandRequest
  ): Promise<ActuatorCommandResponse> {
    const response = await api.post<ActuatorCommandResponse>(
      `/actuators/${espId}/${gpio}/command`,
      command
    )
    return response.data
  },

  /**
   * Emergency stop - stops all actuators immediately
   */
  async emergencyStop(request: EmergencyStopRequest): Promise<EmergencyStopResponse> {
    const response = await api.post<EmergencyStopResponse>(
      '/actuators/emergency_stop',
      request
    )
    return response.data
  },

  /**
   * Clear emergency stop - releases emergency state so actuators can be controlled
   */
  async clearEmergency(espId?: string): Promise<{ success: boolean; message: string; devices_cleared: number }> {
    const response = await api.post<{ success: boolean; message: string; devices_cleared: number }>(
      '/actuators/clear_emergency',
      { esp_id: espId ?? undefined, reason: 'manual' }
    )
    return response.data
  },

  // =========================================================================
  // Alert Configuration (Phase 4A.7)
  // =========================================================================

  async getAlertConfig(actuatorId: string): Promise<import('./sensors').AlertConfigResponse> {
    const response = await api.get<import('./sensors').AlertConfigResponse>(
      `/actuators/${actuatorId}/alert-config`
    )
    return response.data
  },

  async updateAlertConfig(
    actuatorId: string,
    config: import('./sensors').AlertConfigUpdate
  ): Promise<import('./sensors').AlertConfigResponse> {
    const response = await api.patch<import('./sensors').AlertConfigResponse>(
      `/actuators/${actuatorId}/alert-config`,
      config
    )
    return response.data
  },

  // =========================================================================
  // Runtime Statistics (Phase 4A.8)
  // =========================================================================

  async getRuntime(actuatorId: string): Promise<import('./sensors').RuntimeStatsResponse> {
    const response = await api.get<import('./sensors').RuntimeStatsResponse>(
      `/actuators/${actuatorId}/runtime`
    )
    return response.data
  },

  async updateRuntime(
    actuatorId: string,
    stats: import('./sensors').RuntimeStatsUpdate
  ): Promise<import('./sensors').RuntimeStatsResponse> {
    const response = await api.patch<import('./sensors').RuntimeStatsResponse>(
      `/actuators/${actuatorId}/runtime`,
      stats
    )
    return response.data
  },
}
















