import { apiClient } from '@/api/client'
import type { EspDeviceListResponse, PhytaEspDevice } from '@/types/esp'

export async function listDevices(params?: {
  zone_id?: string
  status?: string
  page_size?: number
}): Promise<PhytaEspDevice[]> {
  const res = await apiClient.get<EspDeviceListResponse>('/esp/devices', {
    params: { page_size: 200, ...params },
  })
  return res.data?.data ?? []
}

export function getDeviceId(device: PhytaEspDevice): string {
  return device.device_id || device.esp_id || ''
}
