import { apiClient } from '@/api/client'
import type { PhytaSensorConfig } from '@/types/esp'

interface SensorConfigRow {
  id: string
  esp_device_id?: string
  esp_id?: string
  gpio: number
  sensor_type: string
  name?: string | null
  latest_value?: number | null
  latest_quality?: string | null
  i2c_address?: string | null
  onewire_address?: string | null
}

interface SensorListResponse {
  data: SensorConfigRow[]
  pagination?: { total_pages: number }
}

function mapSensor(row: SensorConfigRow): PhytaSensorConfig {
  const unit = defaultUnit(row.sensor_type)
  return {
    config_id: row.id,
    gpio: row.gpio,
    sensor_type: row.sensor_type,
    name: row.name ?? undefined,
    raw_value: row.latest_value ?? null,
    unit,
    quality: row.latest_quality ?? undefined,
    i2c_address: row.i2c_address ?? null,
    onewire_address: row.onewire_address ?? null,
  }
}

function defaultUnit(sensorType: string): string {
  const t = sensorType.toLowerCase()
  if (t.includes('temp')) return '°C'
  if (t.includes('humid')) return '%'
  if (t === 'ph') return 'pH'
  if (t === 'ec') return 'µS/cm'
  if (t.includes('light') || t === 'bh1750') return 'lux'
  return ''
}

export async function listAllSensorConfigs(): Promise<Map<string, PhytaSensorConfig[]>> {
  const byEsp = new Map<string, PhytaSensorConfig[]>()
  let page = 1
  let totalPages = 1

  do {
    const res = await apiClient.get<SensorListResponse>('/sensors/', {
      params: { page, page_size: 100 },
    })
    const rows = res.data?.data ?? []
    for (const row of rows) {
      const espId = row.esp_device_id || row.esp_id
      if (!espId) continue
      if (!byEsp.has(espId)) byEsp.set(espId, [])
      byEsp.get(espId)!.push(mapSensor(row))
    }
    totalPages = res.data?.pagination?.total_pages ?? 1
    if (rows.length < 100) break
    page += 1
  } while (page <= totalPages)

  return byEsp
}
