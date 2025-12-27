import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { debugApi } from '@/api/debug'
import type { MockESP, MockESPCreate, MockSystemState, MockSensorConfig, MockActuatorConfig, QualityLevel } from '@/types'

/**
 * Extract error message from Axios error response.
 * Handles both string and array (FastAPI validation) formats.
 */
function extractErrorMessage(err: unknown, fallback: string): string {
  const axiosError = err as { response?: { data?: { detail?: string | Array<{ msg?: string; loc?: string[] }> } } }
  const detail = axiosError.response?.data?.detail
  
  if (!detail) return fallback
  
  // FastAPI validation errors return an array
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const field = d.loc?.slice(1).join('.') || 'unknown'
      return `${field}: ${d.msg || 'validation error'}`
    }).join('; ')
  }
  
  // Standard string error
  return detail
}

export const useMockEspStore = defineStore('mockEsp', () => {
  // State
  const mockEsps = ref<MockESP[]>([])
  const selectedEspId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const selectedEsp = computed(() =>
    mockEsps.value.find(esp => esp.esp_id === selectedEspId.value) || null
  )

  const espCount = computed(() => mockEsps.value.length)

  const onlineEsps = computed(() =>
    mockEsps.value.filter(esp => esp.connected && esp.system_state === 'OPERATIONAL')
  )

  // Actions
  async function fetchAll(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      mockEsps.value = await debugApi.listMockEsps()
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to fetch mock ESPs')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function create(config: MockESPCreate): Promise<MockESP> {
    isLoading.value = true
    error.value = null

    try {
      const esp = await debugApi.createMockEsp(config)
      mockEsps.value.push(esp)
      return esp
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to create mock ESP')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function remove(espId: string): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      await debugApi.deleteMockEsp(espId)
      mockEsps.value = mockEsps.value.filter(esp => esp.esp_id !== espId)

      if (selectedEspId.value === espId) {
        selectedEspId.value = null
      }
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to delete mock ESP')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function triggerHeartbeat(espId: string): Promise<void> {
    error.value = null

    try {
      await debugApi.triggerHeartbeat(espId)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to trigger heartbeat')
      throw err
    }
  }

  async function setState(espId: string, state: MockSystemState, reason?: string): Promise<void> {
    error.value = null

    try {
      await debugApi.setState(espId, state, reason)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to set state')
      throw err
    }
  }

  async function setAutoHeartbeat(espId: string, enabled: boolean, interval: number = 60): Promise<void> {
    error.value = null

    try {
      await debugApi.setAutoHeartbeat(espId, enabled, interval)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to configure auto-heartbeat')
      throw err
    }
  }

  async function addSensor(espId: string, config: MockSensorConfig): Promise<void> {
    error.value = null

    try {
      await debugApi.addSensor(espId, config)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to add sensor')
      throw err
    }
  }

  async function setSensorValue(
    espId: string,
    gpio: number,
    rawValue: number,
    quality?: QualityLevel,
    publish: boolean = true
  ): Promise<void> {
    error.value = null

    try {
      await debugApi.setSensorValue(espId, gpio, rawValue, quality, publish)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to set sensor value')
      throw err
    }
  }

  async function setBatchSensorValues(
    espId: string,
    values: Record<number, number>,
    publish: boolean = true
  ): Promise<void> {
    error.value = null

    try {
      await debugApi.setBatchSensorValues(espId, values, publish)
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to set batch sensor values')
      throw err
    }
  }

  async function removeSensor(espId: string, gpio: number): Promise<void> {
    error.value = null

    try {
      await debugApi.removeSensor(espId, gpio)
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to remove sensor')
      throw err
    }
  }

  async function addActuator(espId: string, config: MockActuatorConfig): Promise<void> {
    error.value = null

    try {
      await debugApi.addActuator(espId, config)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to add actuator')
      throw err
    }
  }

  async function setActuatorState(
    espId: string,
    gpio: number,
    state: boolean,
    pwmValue?: number
  ): Promise<void> {
    error.value = null

    try {
      await debugApi.setActuatorState(espId, gpio, state, pwmValue)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to set actuator state')
      throw err
    }
  }

  async function emergencyStop(espId: string, reason: string = 'manual'): Promise<void> {
    error.value = null

    try {
      await debugApi.emergencyStop(espId, reason)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to trigger emergency stop')
      throw err
    }
  }

  async function clearEmergency(espId: string): Promise<void> {
    error.value = null

    try {
      await debugApi.clearEmergency(espId)
      // Refresh ESP data
      const updated = await debugApi.getMockEsp(espId)
      updateEsp(espId, updated)
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Failed to clear emergency')
      throw err
    }
  }

  function updateEsp(espId: string, updated: MockESP): void {
    const index = mockEsps.value.findIndex(esp => esp.esp_id === espId)
    if (index !== -1) {
      mockEsps.value[index] = updated
    }
  }

  /**
   * Update ESP from WebSocket event (partial update)
   * Used for live updates without full refresh
   */
  function updateEspFromEvent(espId: string, updates: Partial<MockESP>): void {
    const index = mockEsps.value.findIndex(esp => esp.esp_id === espId)
    if (index !== -1) {
      // Merge updates into existing ESP object
      mockEsps.value[index] = {
        ...mockEsps.value[index],
        ...updates,
      }
    }
  }

  /**
   * Update sensor value from WebSocket event
   */
  function updateSensorFromEvent(espId: string, gpio: number, updates: Partial<MockESP['sensors'][0]>): void {
    const esp = mockEsps.value.find(e => e.esp_id === espId)
    if (!esp) return

    const sensorIndex = esp.sensors.findIndex(s => s.gpio === gpio)
    if (sensorIndex !== -1) {
      esp.sensors[sensorIndex] = {
        ...esp.sensors[sensorIndex],
        ...updates,
      }
    }
  }

  /**
   * Update actuator state from WebSocket event
   */
  function updateActuatorFromEvent(espId: string, gpio: number, updates: Partial<MockESP['actuators'][0]>): void {
    const esp = mockEsps.value.find(e => e.esp_id === espId)
    if (!esp) return

    const actuatorIndex = esp.actuators.findIndex(a => a.gpio === gpio)
    if (actuatorIndex !== -1) {
      esp.actuators[actuatorIndex] = {
        ...esp.actuators[actuatorIndex],
        ...updates,
      }
    }
  }

  function selectEsp(espId: string | null): void {
    selectedEspId.value = espId
  }

  function clearError(): void {
    error.value = null
  }

  return {
    // State
    mockEsps,
    selectedEspId,
    isLoading,
    error,

    // Getters
    selectedEsp,
    espCount,
    onlineEsps,

    // Actions
    fetchAll,
    create,
    remove,
    triggerHeartbeat,
    setState,
    setAutoHeartbeat,
    addSensor,
    setSensorValue,
    setBatchSensorValues,
    removeSensor,
    addActuator,
    setActuatorState,
    emergencyStop,
    clearEmergency,
    updateEspFromEvent,
    updateSensorFromEvent,
    updateActuatorFromEvent,
    selectEsp,
    clearError,
  }
})
