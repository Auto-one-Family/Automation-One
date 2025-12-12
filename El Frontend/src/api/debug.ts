import api from './index'
import type {
  MockESP,
  MockESPCreate,
  MockSensorConfig,
  MockActuatorConfig,
  MockSystemState,
  CommandResponse,
  QualityLevel,
} from '@/types'

interface MockESPListResponse {
  success: boolean
  data: MockESP[]
  total: number
}

interface HeartbeatResponse {
  success: boolean
  esp_id: string
  timestamp: string
  message_published: boolean
  payload?: Record<string, unknown>
}

interface MqttMessageRecord {
  topic: string
  payload: Record<string, unknown>
  timestamp: string
  qos: number
}

interface MessagesResponse {
  success: boolean
  esp_id: string
  messages: MqttMessageRecord[]
  total: number
}

export const debugApi = {
  // ==========================================================================
  // Mock ESP CRUD
  // ==========================================================================

  /**
   * Create a new mock ESP32
   */
  async createMockEsp(config: MockESPCreate): Promise<MockESP> {
    const response = await api.post<MockESP>('/debug/mock-esp', config)
    return response.data
  },

  /**
   * List all mock ESPs
   */
  async listMockEsps(): Promise<MockESP[]> {
    const response = await api.get<MockESPListResponse>('/debug/mock-esp')
    return response.data.data
  },

  /**
   * Get a specific mock ESP
   */
  async getMockEsp(espId: string): Promise<MockESP> {
    const response = await api.get<MockESP>(`/debug/mock-esp/${espId}`)
    return response.data
  },

  /**
   * Delete a mock ESP
   */
  async deleteMockEsp(espId: string): Promise<void> {
    await api.delete(`/debug/mock-esp/${espId}`)
  },

  // ==========================================================================
  // Heartbeat & State
  // ==========================================================================

  /**
   * Trigger a heartbeat from a mock ESP
   */
  async triggerHeartbeat(espId: string): Promise<HeartbeatResponse> {
    const response = await api.post<HeartbeatResponse>(
      `/debug/mock-esp/${espId}/heartbeat`
    )
    return response.data
  },

  /**
   * Set system state of a mock ESP
   */
  async setState(
    espId: string,
    state: MockSystemState,
    reason?: string
  ): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/state`,
      { state, reason }
    )
    return response.data
  },

  /**
   * Configure auto-heartbeat
   */
  async setAutoHeartbeat(
    espId: string,
    enabled: boolean,
    intervalSeconds: number = 60
  ): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/auto-heartbeat`,
      null,
      { params: { enabled, interval_seconds: intervalSeconds } }
    )
    return response.data
  },

  // ==========================================================================
  // Sensor Operations
  // ==========================================================================

  /**
   * Add a sensor to a mock ESP
   */
  async addSensor(espId: string, config: MockSensorConfig): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/sensors`,
      config
    )
    return response.data
  },

  /**
   * Set sensor value
   */
  async setSensorValue(
    espId: string,
    gpio: number,
    rawValue: number,
    quality?: QualityLevel,
    publish: boolean = true
  ): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/sensors/${gpio}`,
      { raw_value: rawValue, quality, publish }
    )
    return response.data
  },

  /**
   * Remove a sensor from a mock ESP
   */
  async removeSensor(espId: string, gpio: number): Promise<CommandResponse> {
    const response = await api.delete<CommandResponse>(`/debug/mock-esp/${espId}/sensors/${gpio}`)
    return response.data
  },

  /**
   * Set multiple sensor values at once
   */
  async setBatchSensorValues(
    espId: string,
    values: Record<number, number>,
    publish: boolean = true
  ): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/sensors/batch`,
      { values, publish }
    )
    return response.data
  },

  // ==========================================================================
  // Actuator Operations
  // ==========================================================================

  /**
   * Add an actuator to a mock ESP
   */
  async addActuator(espId: string, config: MockActuatorConfig): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/actuators`,
      config
    )
    return response.data
  },

  /**
   * Set actuator state
   */
  async setActuatorState(
    espId: string,
    gpio: number,
    state: boolean,
    pwmValue?: number,
    publish: boolean = true
  ): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/actuators/${gpio}`,
      { state, pwm_value: pwmValue, publish }
    )
    return response.data
  },

  // ==========================================================================
  // Emergency Stop
  // ==========================================================================

  /**
   * Trigger emergency stop
   */
  async emergencyStop(espId: string, reason: string = 'manual'): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/emergency-stop`,
      null,
      { params: { reason } }
    )
    return response.data
  },

  /**
   * Clear emergency stop
   */
  async clearEmergency(espId: string): Promise<CommandResponse> {
    const response = await api.post<CommandResponse>(
      `/debug/mock-esp/${espId}/clear-emergency`
    )
    return response.data
  },

  // ==========================================================================
  // Message History
  // ==========================================================================

  /**
   * Get published MQTT messages from a mock ESP
   */
  async getMessages(espId: string, limit: number = 100): Promise<MqttMessageRecord[]> {
    const response = await api.get<MessagesResponse>(
      `/debug/mock-esp/${espId}/messages`,
      { params: { limit } }
    )
    return response.data.messages
  },

  /**
   * Clear message history
   */
  async clearMessages(espId: string): Promise<void> {
    await api.delete(`/debug/mock-esp/${espId}/messages`)
  },
}
