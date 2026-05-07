import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

vi.mock('@/api/index', () => ({
  default: {
    post: (url: string, data?: unknown) => post(url, data),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}))

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-test-1',
    esp_id: 'ESP_CAL',
    gpio: 4,
    sensor_type: 'moisture',
    status: 'collecting',
    method: 'moisture_2point',
    expected_points: 2,
    points_collected: 0,
    calibration_points: { points: [] },
    calibration_result: null,
    correlation_id: null,
    initiated_by: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    failure_reason: null,
    ...overrides,
  }
}

describe('calibrationApi.calibrate (JWT-Pfad)', () => {
  beforeEach(() => {
    post.mockReset()
    vi.stubEnv('VITE_CALIBRATION_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('startet Session mit moisture_2point fuer normalisierte Feuchte', async () => {
    post
      .mockResolvedValueOnce({ data: baseSession({ points_collected: 0 }) })
      .mockResolvedValueOnce({ data: baseSession({ points_collected: 1 }) })
      .mockResolvedValueOnce({ data: baseSession({ points_collected: 2 }) })
      .mockResolvedValueOnce({
        data: baseSession({
          status: 'finalizing',
          points_collected: 2,
          calibration_result: { type: 'moisture_2point', dry_value: 1, wet_value: 2 },
        }),
      })
      .mockResolvedValueOnce({
        data: baseSession({
          status: 'applied',
          points_collected: 2,
          calibration_result: { type: 'moisture_2point', dry_value: 1, wet_value: 2 },
        }),
      })

    const { calibrationApi } = await import('@/api/calibration')

    await calibrationApi.calibrate({
      esp_id: 'ESP_CAL',
      gpio: 4,
      sensor_type: 'moisture',
      calibration_points: [
        { raw: 100, reference: 0 },
        { raw: 200, reference: 100 },
      ],
    })

    const startBody = post.mock.calls[0][1] as { method?: string; sensor_type?: string }
    expect(startBody.method).toBe('moisture_2point')
    expect(startBody.sensor_type).toBe('moisture')
  })

  it('leitet buffer_high und buffer_low unveraendert an den Server weiter', async () => {
    const phSession = baseSession({
      sensor_type: 'ph',
      method: 'ph_2point',
      points_collected: 1,
      calibration_points: {
        points: [{ id: 'p1', point_role: 'buffer_high', raw: 512, reference: 7.01 }],
      },
    })

    post
      .mockResolvedValueOnce({ data: { ...phSession, points_collected: 1 } })

    const { calibrationApi } = await import('@/api/calibration')

    await calibrationApi.addPoint('sess-ph-1', {
      raw_value: 512,
      reference_value: 7.01,
      point_role: 'buffer_high',
    })

    const addBody = post.mock.calls[0][1] as { point_role?: string }
    expect(addBody.point_role).toBe('buffer_high')

    post.mockReset()

    post.mockResolvedValueOnce({ data: { ...phSession, points_collected: 2 } })

    await calibrationApi.addPoint('sess-ph-1', {
      raw_value: 318,
      reference_value: 4.01,
      point_role: 'buffer_low',
    })

    const addBody2 = post.mock.calls[0][1] as { point_role?: string }
    expect(addBody2.point_role).toBe('buffer_low')
  })

  it('mappt soil_moisture auf moisture und nutzt moisture_2point', async () => {
    post
      .mockResolvedValueOnce({ data: baseSession({ points_collected: 0 }) })
      .mockResolvedValueOnce({ data: baseSession({ points_collected: 1 }) })
      .mockResolvedValueOnce({ data: baseSession({ points_collected: 2 }) })
      .mockResolvedValueOnce({
        data: baseSession({
          status: 'finalizing',
          points_collected: 2,
          calibration_result: {},
        }),
      })
      .mockResolvedValueOnce({
        data: baseSession({
          status: 'applied',
          points_collected: 2,
          calibration_result: {},
        }),
      })

    const { calibrationApi } = await import('@/api/calibration')

    await calibrationApi.calibrate({
      esp_id: 'ESP_CAL',
      gpio: 4,
      sensor_type: 'soil_moisture',
      calibration_points: [
        { raw: 100, reference: 0 },
        { raw: 200, reference: 100 },
      ],
    })

    const startBody = post.mock.calls[0][1] as { method?: string; sensor_type?: string }
    expect(startBody.method).toBe('moisture_2point')
    expect(startBody.sensor_type).toBe('moisture')
  })
})
