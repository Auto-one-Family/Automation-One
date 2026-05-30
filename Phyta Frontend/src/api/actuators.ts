import { apiClient } from '@/api/client'
import type { PhytaActuatorConfig } from '@/types/esp'

interface ActuatorConfigRow {
  id?: string
  config_id?: string
  esp_device_id?: string
  esp_id?: string
  gpio: number
  actuator_type: string
  hardware_type?: string | null
  name?: string | null
  is_active?: boolean
  current_value?: number | null
  state?: string | null
}

interface ActuatorListResponse {
  data: ActuatorConfigRow[]
  pagination?: { total_pages: number }
}

function mapActuator(row: ActuatorConfigRow): PhytaActuatorConfig {
  return {
    config_id: row.config_id || row.id,
    gpio: row.gpio,
    actuator_type: row.actuator_type,
    hardware_type: row.hardware_type ?? undefined,
    name: row.name ?? undefined,
    state: row.state ?? (row.is_active ? 'on' : 'off'),
    pwm_value: row.current_value ?? undefined,
  }
}

export async function emergencyStop(reason: string): Promise<void> {
  await apiClient.post('/actuators/emergency_stop', { reason })
}

export async function listAllActuatorConfigs(): Promise<Map<string, PhytaActuatorConfig[]>> {
  const byEsp = new Map<string, PhytaActuatorConfig[]>()
  let page = 1
  let totalPages = 1

  do {
    const res = await apiClient.get<ActuatorListResponse>('/actuators/', {
      params: { page, page_size: 100 },
    })
    const rows = res.data?.data ?? []
    for (const row of rows) {
      const espId = row.esp_device_id || row.esp_id
      if (!espId) continue
      if (!byEsp.has(espId)) byEsp.set(espId, [])
      byEsp.get(espId)!.push(mapActuator(row))
    }
    totalPages = res.data?.pagination?.total_pages ?? 1
    if (rows.length < 100) break
    page += 1
  } while (page <= totalPages)

  return byEsp
}
