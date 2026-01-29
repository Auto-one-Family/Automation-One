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
      `/v1/actuators/${espId}/${gpio}`,
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
    await api.delete(`/v1/actuators/${espId}/${gpio}`)
  },

  /**
   * Get actuator configuration
   */
  async get(espId: string, gpio: number): Promise<ActuatorConfigResponse> {
    const response = await api.get<ActuatorConfigResponse>(
      `/v1/actuators/${espId}/${gpio}`
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
    }>('/v1/actuators', { params })
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
      `/v1/actuators/${espId}/${gpio}/command`,
      command
    )
    return response.data
  },

  /**
   * Emergency stop - stops all actuators immediately
   */
  async emergencyStop(request: EmergencyStopRequest): Promise<EmergencyStopResponse> {
    const response = await api.post<EmergencyStopResponse>(
      '/v1/actuators/emergency_stop',
      request
    )
    return response.data
  },
}


















