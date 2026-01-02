import api from './index'
import type {
  SensorConfigCreate,
  SensorConfigResponse,
  SensorDataQuery,
  SensorDataResponse,
  SensorStatsResponse,
} from '@/types'

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
      `/sensors/${espId}/${gpio}`,
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
    await api.delete(`/sensors/${espId}/${gpio}`)
  },

  /**
   * Get sensor configuration
   */
  async get(espId: string, gpio: number): Promise<SensorConfigResponse> {
    const response = await api.get<SensorConfigResponse>(
      `/sensors/${espId}/${gpio}`
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
    }>('/sensors', { params })
    return {
      data: response.data.data,
      total: response.data.total,
    }
  },

  // ===========================================================================
  // Sensor History API (Phase 3)
  // Server: GET /sensors/data (sensors.py:440-526)
  // ===========================================================================

  /**
   * Query historical sensor data with filters.
   *
   * @param query - Query parameters
   * @returns Sensor readings with metadata
   *
   * @example
   * // Get last 24h of temperature data for ESP
   * const data = await sensorsApi.queryData({
   *   esp_id: 'ESP_12AB34CD',
   *   sensor_type: 'temperature',
   *   limit: 500
   * })
   *
   * @example
   * // Get specific time range
   * const data = await sensorsApi.queryData({
   *   esp_id: 'ESP_12AB34CD',
   *   gpio: 34,
   *   start_time: '2025-01-01T00:00:00Z',
   *   end_time: '2025-01-01T23:59:59Z'
   * })
   */
  async queryData(query?: SensorDataQuery): Promise<SensorDataResponse> {
    const response = await api.get<SensorDataResponse>('/sensors/data', {
      params: query,
    })
    return response.data
  },

  /**
   * Get statistical summary for sensor data.
   *
   * Server: GET /sensors/{esp_id}/{gpio}/stats (sensors.py:644-717)
   *
   * @param espId - ESP device ID
   * @param gpio - GPIO pin number
   * @param params - Optional time range
   * @returns Statistics including min, max, avg, std_dev
   *
   * @example
   * // Get 24h stats (default)
   * const stats = await sensorsApi.getStats('ESP_12AB34CD', 34)
   * console.log(stats.stats.avg_value)
   *
   * @example
   * // Get stats for specific range
   * const stats = await sensorsApi.getStats('ESP_12AB34CD', 34, {
   *   start_time: '2025-01-01T00:00:00Z',
   *   end_time: '2025-01-07T23:59:59Z'
   * })
   */
  async getStats(
    espId: string,
    gpio: number,
    params?: {
      start_time?: string
      end_time?: string
    }
  ): Promise<SensorStatsResponse> {
    const response = await api.get<SensorStatsResponse>(
      `/sensors/${espId}/${gpio}/stats`,
      { params }
    )
    return response.data
  },

  /**
   * Query sensor data filtered by data source.
   *
   * Server: GET /sensors/data/by-source/{source} (sensors.py:534-612)
   *
   * @param source - Data source: production, mock, test, simulation
   * @param params - Optional filters
   * @returns Sensor readings from specified source
   */
  async queryDataBySource(
    source: 'production' | 'mock' | 'test' | 'simulation',
    params?: {
      esp_id?: string
      limit?: number
    }
  ): Promise<SensorDataResponse> {
    const response = await api.get<SensorDataResponse>(
      `/sensors/data/by-source/${source}`,
      { params }
    )
    return response.data
  },

  /**
   * Get sensor data count grouped by data source.
   *
   * Server: GET /sensors/data/stats/by-source (sensors.py:615-636)
   *
   * @returns Count per source type
   */
  async getCountBySource(): Promise<{
    success: boolean
    counts: Record<string, number>
    total: number
  }> {
    const response = await api.get<{
      success: boolean
      counts: Record<string, number>
      total: number
    }>('/sensors/data/stats/by-source')
    return response.data
  },
}












