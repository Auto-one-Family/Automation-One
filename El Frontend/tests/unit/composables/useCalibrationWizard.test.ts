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

const sensorsApiMock = vi.hoisted(() => ({
  triggerMeasurement: vi.fn().mockResolvedValue({ request_id: 'req-1' }),
}))

vi.mock('@/api/sensors', () => ({
  sensorsApi: sensorsApiMock,
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
    sensorsApiMock.triggerMeasurement.mockReset()
    sensorsApiMock.triggerMeasurement.mockResolvedValue({ request_id: 'req-1' })
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

  it('sperrt triggerLiveMeasurement fuer 2s nach HTTP (Paritaet SensorValueCard)', async () => {
    vi.useFakeTimers()
    try {
      calibrationApiMock.startSession.mockResolvedValue({
        id: 'session-measure',
        status: 'pending',
        method: 'linear_2point',
        sensor_type: 'moisture',
        calibration_points: { points: [] },
      })

      const wizard = useCalibrationWizard({
        skipSelect: true,
        espId: 'ESP_M',
        gpio: 4,
        sensorType: 'moisture',
      })
      wizard.selectSensor('ESP_M', 4, 'moisture')

      const first = wizard.triggerLiveMeasurement()
      void wizard.triggerLiveMeasurement()
      await first

      expect(sensorsApiMock.triggerMeasurement).toHaveBeenCalledTimes(1)
      expect(wizard.isMeasuring.value).toBe(true)

      vi.advanceTimersByTime(2000)
      expect(wizard.isMeasuring.value).toBe(false)

      await wizard.triggerLiveMeasurement()
      expect(sensorsApiMock.triggerMeasurement).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  // ─── pH-Sensor Tests (2-Point: buffer_high, buffer_low) ───────────────

  it('haendelt pH-2-Punkt-Flow mit buffer_high und buffer_low', async () => {
    calibrationApiMock.startSession.mockResolvedValue({
      id: 'ph-session-1',
      status: 'pending',
      method: 'ph_2point',
      sensor_type: 'ph',
      expected_points: 2,
      calibration_points: { points: [] },
    })
    calibrationApiMock.addPoint
      .mockResolvedValueOnce({
        id: 'ph-session-1',
        status: 'collecting',
        method: 'ph_2point',
        sensor_type: 'ph',
        calibration_points: { points: [{ id: 'ph-1', point_role: 'buffer_high' }] },
      })
      .mockResolvedValueOnce({
        id: 'ph-session-1',
        status: 'collecting',
        method: 'ph_2point',
        sensor_type: 'ph',
        calibration_points: {
          points: [
            { id: 'ph-1', point_role: 'buffer_high' },
            { id: 'ph-2', point_role: 'buffer_low' },
          ],
        },
      })
    calibrationApiMock.finalizeSession.mockResolvedValue({
      id: 'ph-session-1',
      status: 'finalizing',
      method: 'ph_2point',
      sensor_type: 'ph',
      calibration_result: { slope: -59.16, offset: 0, slope_deviation_pct: 2.3 },
      failure_reason: null,
    })
    calibrationApiMock.applySession.mockResolvedValue({
      id: 'ph-session-1',
      status: 'applied',
      method: 'ph_2point',
      sensor_type: 'ph',
      calibration_result: { slope: -59.16, offset: 0, slope_deviation_pct: 2.3 },
      failure_reason: null,
    })
    calibrationApiMock.getSession.mockResolvedValue({
      id: 'ph-session-1',
      status: 'applied',
      method: 'ph_2point',
      sensor_type: 'ph',
      calibration_result: { slope: -59.16, offset: 0, slope_deviation_pct: 2.3 },
      failure_reason: null,
    })

    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_PH_001',
      gpio: 6,
      sensorType: 'ph',
    })

    // Phase 1: Capture buffer_high
    expect(wizard.phase.value).toBe('point1')
    await wizard.onPoint1Captured({ raw: 2000, reference: 7.0 })
    expect(wizard.phase.value).toBe('point2')
    expect(wizard.points.value[0]).toEqual(
      expect.objectContaining({ point_role: 'buffer_high' }),
    )

    // Phase 2: Capture buffer_low
    await wizard.onPoint2Captured({ raw: 3500, reference: 4.0 })
    expect(wizard.phase.value).toBe('confirm')
    expect(wizard.points.value[1]).toEqual(
      expect.objectContaining({ point_role: 'buffer_low' }),
    )

    // Submit: Should call with ph_2point method
    await wizard.submitCalibration()
    expect(calibrationApiMock.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'ph_2point',
        expected_points: 2,
      }),
    )
    expect(wizard.phase.value).toBe('done')
  })

  it('unterstuetzt pH-Referenzwert-Anpassung durch Gaertner', async () => {
    calibrationApiMock.startSession.mockResolvedValue({
      id: 'ph-custom-1',
      status: 'pending',
      method: 'ph_2point',
      sensor_type: 'ph',
      expected_points: 2,
      calibration_points: { points: [] },
    })
    calibrationApiMock.addPoint.mockResolvedValue({
      id: 'ph-custom-1',
      status: 'collecting',
      method: 'ph_2point',
      sensor_type: 'ph',
      calibration_points: { points: [{ id: 'ph-custom', point_role: 'buffer_high' }] },
    })

    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_PH_001',
      gpio: 6,
      sensorType: 'ph',
    })

    // User gibt eigenen Referenzwert ein (z.B. 6.86 statt 7.0)
    await wizard.onPoint1Captured({ raw: 2000, reference: 6.86 })

    expect(calibrationApiMock.addPoint).toHaveBeenCalledWith(
      'ph-custom-1',
      expect.objectContaining({
        reference_value: 6.86,
        point_role: 'buffer_high',
      }),
    )
  })

  // ─── EC-Sensor Tests (1-Point: reference) ──────────────────────────

  it('haendelt EC-1-Punkt-Flow mit reference-role', async () => {
    calibrationApiMock.startSession.mockResolvedValue({
      id: 'ec-session-1',
      status: 'pending',
      method: 'ec_1point',
      sensor_type: 'ec',
      expected_points: 1,
      calibration_points: { points: [] },
    })
    calibrationApiMock.addPoint.mockResolvedValue({
      id: 'ec-session-1',
      status: 'collecting',
      method: 'ec_1point',
      sensor_type: 'ec',
      calibration_points: { points: [{ id: 'ec-1', point_role: 'reference' }] },
    })
    calibrationApiMock.finalizeSession.mockResolvedValue({
      id: 'ec-session-1',
      status: 'finalizing',
      method: 'ec_1point',
      sensor_type: 'ec',
      calibration_result: { cell_factor: 1.05 },
      failure_reason: null,
    })
    calibrationApiMock.applySession.mockResolvedValue({
      id: 'ec-session-1',
      status: 'applied',
      method: 'ec_1point',
      sensor_type: 'ec',
      calibration_result: { cell_factor: 1.05 },
      failure_reason: null,
    })
    calibrationApiMock.getSession.mockResolvedValue({
      id: 'ec-session-1',
      status: 'applied',
      method: 'ec_1point',
      sensor_type: 'ec',
      calibration_result: { cell_factor: 1.05 },
      failure_reason: null,
    })

    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_EC_001',
      gpio: 7,
      sensorType: 'ec',
    })

    // EC: Phase 1 Capture -> directly to Confirm (no point2)
    expect(wizard.phase.value).toBe('point1')
    await wizard.onPoint1Captured({ raw: 1413, reference: 1413 })
    expect(wizard.phase.value).toBe('confirm')
    expect(wizard.points.value[0]).toEqual(
      expect.objectContaining({ point_role: 'reference' }),
    )

    // Submit: Should call with ec_1point method and expected_points=1
    await wizard.submitCalibration()
    expect(calibrationApiMock.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'ec_1point',
        expected_points: 1,
      }),
    )
    expect(wizard.phase.value).toBe('done')
    expect(wizard.calibrationResult.value?.calibration).toEqual(
      expect.objectContaining({ cell_factor: 1.05 }),
    )
  })

  it('EC-1-Punkt: point2-Phase wird nicht angezeigt (expectedPoints=1)', () => {
    const wizard = useCalibrationWizard({
      skipSelect: true,
      espId: 'ESP_EC_001',
      gpio: 7,
      sensorType: 'ec',
    })

    expect(wizard.currentPreset.value?.expectedPoints).toBe(1)
    expect(wizard.currentPreset.value?.calibrationMethod).toBe('ec_1point')
  })
})
