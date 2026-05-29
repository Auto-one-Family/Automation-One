import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getDeviceId, listDevices } from '@/api/esp'
import type { ActuatorStatusPayload, EspHealthPayload, PhytaEspDevice, SensorDataPayload } from '@/types/esp'
import { normalizeSensorType } from '@/utils/sensorMatch'

export const ZONE_UNASSIGNED = '__unassigned__'

export const useEspStore = defineStore('phyta-esp', () => {
  const devices = ref<PhytaEspDevice[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const devicesByZone = computed(() => {
    const map = new Map<string, PhytaEspDevice[]>()
    for (const d of devices.value) {
      const zone = d.zone_id?.trim() || ZONE_UNASSIGNED
      if (!map.has(zone)) map.set(zone, [])
      map.get(zone)!.push(d)
    }
    return map
  })

  const zoneIds = computed(() => {
    const ids = [...devicesByZone.value.keys()]
    return ids.sort((a, b) => {
      if (a === ZONE_UNASSIGNED) return 1
      if (b === ZONE_UNASSIGNED) return -1
      return a.localeCompare(b)
    })
  })

  async function fetchAll(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      devices.value = await listDevices()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'ESP-Liste konnte nicht geladen werden'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function findDevice(espId: string): PhytaEspDevice | undefined {
    return devices.value.find((d) => getDeviceId(d) === espId)
  }

  function applySensorData(data: SensorDataPayload): void {
    const espId = data.esp_id
    const device = findDevice(espId)
    if (!device?.sensors?.length) return
    const sensor = device.sensors.find((s) => matchSensorToEvent(s, data))
    if (!sensor) return
    sensor.raw_value = data.raw_value ?? data.value ?? sensor.raw_value
    sensor.unit = data.unit ?? sensor.unit
    sensor.quality = data.quality ?? sensor.quality
  }

  function applyActuatorStatus(data: ActuatorStatusPayload): void {
    const device = findDevice(data.esp_id)
    if (!device?.actuators?.length) return
    const act = device.actuators.find(
      (a) => a.gpio === data.gpio && (!data.actuator_type || a.actuator_type === data.actuator_type),
    )
    if (!act) return
    if (data.state) act.state = data.state
    if (data.pwm_value != null) act.pwm_value = data.pwm_value
  }

  function applyEspHealth(data: EspHealthPayload): void {
    const device = findDevice(data.esp_id)
    if (!device) return
    if (data.last_seen) device.last_seen = data.last_seen
    if (data.status) device.status = data.status
  }

  return {
    devices,
    isLoading,
    error,
    devicesByZone,
    zoneIds,
    fetchAll,
    findDevice,
    applySensorData,
    applyActuatorStatus,
    applyEspHealth,
  }
})

function matchSensorToEvent(
  sensor: { config_id?: string; gpio: number; sensor_type: string; i2c_address?: string | null; onewire_address?: string | null },
  data: SensorDataPayload,
): boolean {
  if (data.config_id && sensor.config_id) {
    return sensor.config_id === data.config_id
  }
  if (
    sensor.gpio !== data.gpio ||
    normalizeSensorType(sensor.sensor_type) !== normalizeSensorType(data.sensor_type)
  ) {
    return false
  }
  if (data.i2c_address != null && sensor.i2c_address != null) {
    return sensor.i2c_address === data.i2c_address
  }
  if (data.onewire_address && sensor.onewire_address) {
    return sensor.onewire_address === data.onewire_address
  }
  return true
}
