export interface PhytaEspDevice {
  id?: string
  device_id: string
  esp_id?: string
  name?: string | null
  zone_id?: string | null
  zone_name?: string | null
  status?: string
  last_seen?: string | null
  hardware_type?: string
  sensor_count?: number
  actuator_count?: number
  sensors?: PhytaSensorConfig[]
  actuators?: PhytaActuatorConfig[]
}

export interface PhytaSensorConfig {
  config_id?: string
  gpio: number
  sensor_type: string
  name?: string
  i2c_address?: string | null
  onewire_address?: string | null
  raw_value?: number | null
  unit?: string
  quality?: string
}

export interface PhytaActuatorConfig {
  config_id?: string
  gpio: number
  actuator_type: string
  name?: string
  state?: string
  pwm_value?: number
}

export interface EspDeviceListResponse {
  success: boolean
  data: PhytaEspDevice[]
}

export interface SensorDataPayload {
  esp_id: string
  gpio: number
  sensor_type: string
  config_id?: string | null
  raw_value?: number
  value?: number
  unit?: string
  quality?: string
  i2c_address?: string | null
  onewire_address?: string | null
  timestamp?: number
}

export interface ActuatorStatusPayload {
  esp_id: string
  gpio: number
  actuator_type?: string
  state?: string
  pwm_value?: number
}

export interface EspHealthPayload {
  esp_id: string
  last_seen?: string
  status?: string
}
