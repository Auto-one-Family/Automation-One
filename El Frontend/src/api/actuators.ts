import api from './index'
import type { ActuatorConfigCreate, ActuatorConfigResponse } from '@/types'

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
}











