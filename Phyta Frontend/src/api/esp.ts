import { listAllActuatorConfigs } from '@/api/actuators'
import { listAllSensorConfigs } from '@/api/sensors'
import { apiClient } from '@/api/client'
import type { EspDeviceListResponse, PhytaEspDevice } from '@/types/esp'

const MAX_PAGE_SIZE = 100

export async function listDevices(params?: {
  zone_id?: string
  status?: string
}): Promise<PhytaEspDevice[]> {
  const all: PhytaEspDevice[] = []
  let page = 1
  let totalPages = 1

  do {
    const res = await apiClient.get<EspDeviceListResponse>('/esp/devices', {
      params: {
        page,
        page_size: MAX_PAGE_SIZE,
        ...params,
      },
    })
    const body = res.data
    const items = body?.data ?? []
    all.push(...items)

    const pagination = body?.pagination
    if (pagination?.total_pages != null) {
      totalPages = pagination.total_pages
    } else if (items.length < MAX_PAGE_SIZE) {
      break
    }
    page += 1
  } while (page <= totalPages)

  await enrichWithConfigs(all)
  return all
}

async function enrichWithConfigs(devices: PhytaEspDevice[]): Promise<void> {
  const [sensorsByEsp, actuatorsByEsp] = await Promise.all([
    listAllSensorConfigs(),
    listAllActuatorConfigs(),
  ])

  for (const device of devices) {
    const id = device.device_id || device.esp_id || ''
    if (!id) continue

    const sensors = sensorsByEsp.get(id)
    if (sensors?.length) {
      device.sensors = sensors
      device.sensor_count = sensors.length
    }

    const actuators = actuatorsByEsp.get(id)
    if (actuators?.length) {
      device.actuators = actuators
      device.actuator_count = actuators.length
    }
  }
}

export function getDeviceId(device: PhytaEspDevice): string {
  return device.device_id || device.esp_id || ''
}

export async function updateDeviceName(espId: string, name: string): Promise<void> {
  await apiClient.patch(`/esp/devices/${espId}`, { name })
}
