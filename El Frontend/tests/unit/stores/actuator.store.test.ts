import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { ESPDevice } from '@/api/esp'
import { useActuatorStore } from '@/shared/stores/actuator.store'

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  show: vi.fn(),
  dismiss: vi.fn(),
  clear: vi.fn(),
  toasts: { value: [] },
}

vi.mock('@/composables/useToast', () => ({
  useToast: () => mockToast,
}))

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('actuator.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('terminalisiert REST-started intents deterministisch per timeout', () => {
    const store = useActuatorStore()

    store.registerCommandIntent('ESP_1', 5, 'ON', 'corr-1', 'req-1')
    vi.advanceTimersByTime(30_000)

    const intent = store.getIntentSnapshot().find((entry) => (
      entry.intentType === 'actuator' &&
      entry.subjectId === 'ESP_1:5' &&
      entry.correlationId === 'corr-1'
    ))

    expect(intent).toBeDefined()
    expect(intent?.state).toBe('terminal_timeout')
    expect(intent?.terminalSource).toBe('actuator_timeout')
    expect(mockToast.error).toHaveBeenCalled()
  })

  it('terminalisiert config-intents deterministisch per timeout', () => {
    const store = useActuatorStore()

    const subjectId = store.registerConfigIntentFromRest({
      espId: 'ESP_2',
      scope: 'sensor:4:ds18b20',
      correlationId: 'corr-config-1',
      requestId: 'req-config-1',
    })
    vi.advanceTimersByTime(45_000)

    const intent = store.getIntentSnapshot().find((entry) => (
      entry.intentType === 'config' &&
      entry.subjectId === subjectId &&
      entry.correlationId === 'corr-config-1'
    ))

    expect(intent).toBeDefined()
    expect(intent?.state).toBe('terminal_timeout')
    expect(intent?.terminalSource).toBe('config_timeout')
    expect(mockToast.error).toHaveBeenCalled()
  })

  it('verwirft stale actuator_status-events nach offline-reset-epoch', () => {
    const store = useActuatorStore()
    let device: ESPDevice = {
      device_id: 'ESP_1',
      esp_id: 'ESP_1',
      actuators: [{ gpio: 5, state: false, pwm_value: 0 }],
      sensors: [],
    } as unknown as ESPDevice

    store.markActuatorResetEpoch('ESP_1', 2_000, 5)

    store.handleActuatorStatus(
      {
        data: {
          esp_id: 'ESP_1',
          gpio: 5,
          state: 'on',
          timestamp: 1, // 1000 ms < reset epoch => stale
        },
      },
      (_espId, patchFn) => {
        device = patchFn(device)
        return true
      },
    )

    const staleActuator = (device.actuators as Array<{ gpio: number; state: boolean }>).find((a) => a.gpio === 5)
    expect(staleActuator?.state).toBe(false)

    store.handleActuatorStatus(
      {
        data: {
          esp_id: 'ESP_1',
          gpio: 5,
          state: 'on',
          timestamp: 3, // 3000 ms > reset epoch => apply
        },
      },
      (_espId, patchFn) => {
        device = patchFn(device)
        return true
      },
    )

    const freshActuator = (device.actuators as Array<{ gpio: number; state: boolean }>).find((a) => a.gpio === 5)
    expect(freshActuator?.state).toBe(true)
  })
})
