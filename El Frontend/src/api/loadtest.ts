/**
 * Load Testing API
 * 
 * Provides methods to interact with load testing endpoints.
 */

import api from './index'

// =============================================================================
// Types
// =============================================================================

export interface BulkCreateRequest {
  count: number
  prefix?: string
  with_sensors?: number
  with_actuators?: number
}

export interface BulkCreateResponse {
  success: boolean
  created_count: number
  esp_ids: string[]
  message: string
}

export interface SimulationRequest {
  esp_ids?: string[]
  interval_ms?: number
  duration_seconds?: number
}

export interface SimulationResponse {
  success: boolean
  message: string
  active_simulations: number
}

export interface MetricsResponse {
  success: boolean
  mock_esp_count: number
  total_sensors: number
  total_actuators: number
  messages_published: number
  uptime_seconds: number
}

// =============================================================================
// API Functions
// =============================================================================

export const loadTestApi = {
  /**
   * Bulk create mock ESPs for load testing
   */
  async bulkCreate(request: BulkCreateRequest): Promise<BulkCreateResponse> {
    const response = await api.post<BulkCreateResponse>(
      '/debug/load-test/bulk-create',
      request
    )
    return response.data
  },

  /**
   * Start sensor simulation
   */
  async startSimulation(request: SimulationRequest = {}): Promise<SimulationResponse> {
    const response = await api.post<SimulationResponse>(
      '/debug/load-test/simulate',
      request
    )
    return response.data
  },

  /**
   * Stop all simulations
   */
  async stopSimulation(): Promise<SimulationResponse> {
    const response = await api.post<SimulationResponse>('/debug/load-test/stop')
    return response.data
  },

  /**
   * Get load test metrics
   */
  async getMetrics(): Promise<MetricsResponse> {
    const response = await api.get<MetricsResponse>('/debug/load-test/metrics')
    return response.data
  }
}

export default loadTestApi















