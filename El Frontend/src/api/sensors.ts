import api from './index'
import type { SensorConfigCreate, SensorConfigResponse } from '@/types'

export const sensorsApi = {
  /**
   * Create or update sensor configuration
   */
  async createOrUpdate(
    espId: string,
    gpio: number,
    config: SensorConfigCreate
  ): Promise<SensorConfigResponse> {
    const response = await api.post<SensorConfigResponse>(
      `/v1/sensors/${espId}/${gpio}`,
      {
        ...config,
        esp_id: espId,
        gpio,
      }
    )
    return response.data
  },

  /**
   * Delete sensor configuration
   */
  async delete(espId: string, gpio: number): Promise<void> {
    await api.delete(`/v1/sensors/${espId}/${gpio}`)
  },

  /**
   * Get sensor configuration
   */
  async get(espId: string, gpio: number): Promise<SensorConfigResponse> {
    const response = await api.get<SensorConfigResponse>(
      `/v1/sensors/${espId}/${gpio}`
    )
    return response.data
  },

  /**
   * List sensor configurations
   */
  async list(params?: {
    esp_id?: string
    sensor_type?: string
    enabled?: boolean
    page?: number
    page_size?: number
  }): Promise<{ data: SensorConfigResponse[]; total: number }> {
    const response = await api.get<{
      data: SensorConfigResponse[]
      total: number
      page: number
      page_size: number
      total_pages: number
    }>('/v1/sensors', { params })
    return {
      data: response.data.data,
      total: response.data.total,
    }
  },
}











