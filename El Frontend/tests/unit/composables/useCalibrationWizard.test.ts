import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const wsHandlers = vi.hoisted(
  () => new Map<string, (message: { data?: Record<string, unknown> }) => void>(),
)

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => ({
    on: (eventType: string, callback: (message: { data?: Record<string, unknown> }) => void) => {
      wsHandlers.set(eventType, callback)
      return () => wsHandlers.delete(eventType)
    },
    cleanup: vi.fn(),
  }),
}))

const calibrationApiMock = vi.hoisted(() => ({
  calibrate: vi.fn(),
  startSession: vi.fn(),
  getSession: vi.fn(),
  addPoint: vi.fn(),
  finalizeSession: vi.fn(),
  applySession: vi.fn(),
  deleteSession: vi.fn(),
  deletePoint: vi.fn(),
}))

const uiStoreMock = vi.hoisted(() => ({
  confirm: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/api/calibration', () => ({
  calibrationApi: calibrationApiMock,
}))

vi.mock('@/shared/stores/ui.store', () => ({
  useUiStore: () => uiStoreMock,
}))

vi.mock('@/api/sensors', () => ({
  sensorsApi: {
    triggerMeasurement: vi.fn().mockResolvedValue(undefined),
  },
}))

import { useCalibrationWizard } from '@/composables/useCalibrationWizard'

describe('useCalibrationWizard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    localStorage.clear()
    wsHandlers.clear()
    Object.values(calibrationApiMock).forEach((fn) => fn.mockReset())
    uiStoreMock.confirm.mockReset()
    uiStoreMock.confirm.mockResolvedValue(true)
  })

  it('verarbeitet calibration_measurement_received und setzt lastRawValue', () => {
    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_TEST_001',
      gpio: 4,
      sensorType: 'moisture',
    })

    wizard.selectSensor('ESP_TEST_001', 4, 'moisture')
    const handler = wsHandlers.get('calibration_measurement_received')
    expect(handler).toBeDefined()

    handler?.({
      data: {
        esp_id: 'ESP_TEST_001',
        gpio: 4,
        raw_value: 1111.5,
        quality: 'good',
        intent_id: 'intent-1',
      },
    })

    expect(wizard.lastRawValue.value).toBe(1111.5)
    expect(wizard.measurementQuality.value).toBe('good')
  })

  it('nutzt Session-Flow fuer submitCalibration', async () => {
    calibrationApiMock.startSession.mockResolvedValue({
      id: 'session-1',
      status: 'pending',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_points: { points: [] },
    })
    calibrationApiMock.addPoint.mockResolvedValue({
      id: 'session-1',
      status: 'collecting',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_points: {
        points: [{ id: 'p-1', point_role: 'dry' }, { id: 'p-2', point_role: 'wet' }],
      },
    })
    calibrationApiMock.finalizeSession.mockResolvedValue({
      id: 'session-1',
      status: 'finalizing',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_result: { slope: 1, offset: 0 },
      failure_reason: null,
    })
    calibrationApiMock.applySession.mockResolvedValue({
      id: 'session-1',
      status: 'applied',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_result: { slope: 1, offset: 0 },
      failure_reason: null,
    })
    calibrationApiMock.getSession.mockResolvedValue({
      id: 'session-1',
      status: 'applied',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_result: { slope: 1, offset: 0 },
      failure_reason: null,
    })

    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_TEST_001',
      gpio: 4,
      sensorType: 'moisture',
    })
    await wizard.onPoint1Captured({ raw: 1000, reference: 0 })
    await wizard.onPoint2Captured({ raw: 500, reference: 100 })

    await wizard.submitCalibration()

    expect(calibrationApiMock.startSession).toHaveBeenCalledTimes(1)
    expect(calibrationApiMock.addPoint).toHaveBeenCalledTimes(2)
    expect(calibrationApiMock.finalizeSession).toHaveBeenCalledTimes(1)
    expect(calibrationApiMock.applySession).toHaveBeenCalledTimes(1)
    expect(calibrationApiMock.getSession).toHaveBeenCalled()
    expect(wizard.phase.value).toBe('done')
  })

  it('setzt overwrite=true bei erneutem Rollenpunkt', async () => {
    calibrationApiMock.startSession.mockResolvedValue({
      id: 'session-2',
      status: 'pending',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_points: { points: [] },
    })
    calibrationApiMock.addPoint
      .mockResolvedValueOnce({
        id: 'session-2',
        status: 'collecting',
        method: 'linear_2point',
        sensor_type: 'moisture',
        calibration_points: { points: [{ id: 'dry-1', point_role: 'dry' }] },
      })
      .mockResolvedValueOnce({
        id: 'session-2',
        status: 'collecting',
        method: 'linear_2point',
        sensor_type: 'moisture',
        calibration_points: { points: [{ id: 'dry-1', point_role: 'dry' }] },
      })

    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_TEST_001',
      gpio: 4,
      sensorType: 'moisture',
    })

    await wizard.onPoint1Captured({ raw: 1000, reference: 0 })
    wizard.phase.value = 'point1'
    await wizard.onPoint1Captured({ raw: 950, reference: 2 })

    expect(uiStoreMock.confirm).toHaveBeenCalledTimes(1)
    expect(calibrationApiMock.addPoint).toHaveBeenNthCalledWith(
      2,
      'session-2',
      expect.objectContaining({
        point_role: 'dry',
        overwrite: true,
      }),
    )
  })

  it('loescht Punkt ueber Session-Route und aktualisiert lokalen Zustand', async () => {
    calibrationApiMock.startSession.mockResolvedValue({
      id: 'session-3',
      status: 'pending',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_points: { points: [] },
    })
    calibrationApiMock.addPoint
      .mockResolvedValueOnce({
        id: 'session-3',
        status: 'collecting',
        method: 'linear_2point',
        sensor_type: 'moisture',
        calibration_points: { points: [{ id: 'dry-1', point_role: 'dry' }] },
      })
      .mockResolvedValueOnce({
        id: 'session-3',
        status: 'collecting',
        method: 'linear_2point',
        sensor_type: 'moisture',
        calibration_points: {
          points: [
            { id: 'dry-1', point_role: 'dry' },
            { id: 'wet-1', point_role: 'wet' },
          ],
        },
      })
    calibrationApiMock.deletePoint.mockResolvedValue({
      id: 'session-3',
      status: 'collecting',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_points: { points: [{ id: 'dry-1', point_role: 'dry' }] },
    })

    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_TEST_001',
      gpio: 4,
      sensorType: 'moisture',
    })

    await wizard.onPoint1Captured({ raw: 1000, reference: 0 })
    await wizard.onPoint2Captured({ raw: 500, reference: 100 })
    expect(wizard.points.value).toHaveLength(2)

    await wizard.deletePoint('wet')

    expect(calibrationApiMock.deletePoint).toHaveBeenCalledWith('session-3', 'wet-1')
    expect(wizard.points.value).toHaveLength(1)
    expect(wizard.phase.value).toBe('point2')
  })

  it('finalisiert und applied nur bei gueltigem 2-Punkt-Zustand', async () => {
    calibrationApiMock.startSession.mockResolvedValue({
      id: 'session-4',
      status: 'pending',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_points: { points: [] },
    })
    calibrationApiMock.addPoint.mockResolvedValue({
      id: 'session-4',
      status: 'collecting',
      method: 'linear_2point',
      sensor_type: 'moisture',
      calibration_points: { points: [{ id: 'dry-1', point_role: 'dry' }] },
    })

    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_TEST_001',
      gpio: 4,
      sensorType: 'moisture',
    })

    await wizard.onPoint1Captured({ raw: 1000, reference: 0 })
    await wizard.submitCalibration()

    expect(calibrationApiMock.finalizeSession).not.toHaveBeenCalled()
    expect(calibrationApiMock.applySession).not.toHaveBeenCalled()
    expect(wizard.phase.value).toBe('error')
  })
})
