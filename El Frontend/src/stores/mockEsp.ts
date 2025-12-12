import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { debugApi } from '@/api/debug'
import type { MockESP, MockESPCreate, MockSystemState, MockSensorConfig, MockActuatorConfig, QualityLevel } from '@/types'

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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to fetch mock ESPs'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to create mock ESP'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to delete mock ESP'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to trigger heartbeat'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to set state'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to configure auto-heartbeat'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to add sensor'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to set sensor value'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to set batch sensor values'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to remove sensor'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to add actuator'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to set actuator state'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to trigger emergency stop'
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
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Failed to clear emergency'
      throw err
    }
  }

  function updateEsp(espId: string, updated: MockESP): void {
    const index = mockEsps.value.findIndex(esp => esp.esp_id === espId)
    if (index !== -1) {
      mockEsps.value[index] = updated
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
    selectEsp,
    clearError,
  }
})
