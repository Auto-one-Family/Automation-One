import axios from 'axios'
import api from './index'

export interface CalibrationPoint {
  raw: number
  reference: number
}

export interface CalibrateRequest {
  esp_id: string
  gpio: number
  sensor_type: string
  calibration_points: CalibrationPoint[]
  method?: 'linear' | 'offset'
  save_to_config?: boolean
}

export interface CalibrateResponse {
  success: boolean
  calibration: Record<string, unknown>
  sensor_type: string
  method: string
  saved: boolean
  message: string | null
}

/**
 * Calibration API client.
 *
 * The /api/v1/sensors/calibrate endpoint uses X-API-Key auth (not JWT).
 * When VITE_CALIBRATION_API_KEY is set, calls go directly via axios.
 * Otherwise falls back to the JWT-authenticated axios instance (which
 * will 401 unless the server adds JWT support to that route).
 */
export const calibrationApi = {
  async calibrate(request: CalibrateRequest): Promise<CalibrateResponse> {
    const apiKey = import.meta.env.VITE_CALIBRATION_API_KEY as string | undefined

    if (apiKey) {
      const response = await axios.post<CalibrateResponse>(
        '/api/v1/sensors/calibrate',
        request,
        { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' } },
      )
      return response.data
    }

    // Fallback: use standard JWT client (requires server-side JWT support on this route)
    const response = await api.post<CalibrateResponse>(
      '/sensors/calibrate',
      request,
    )
    return response.data
  },
}
