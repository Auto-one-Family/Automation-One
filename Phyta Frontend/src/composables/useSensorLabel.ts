import { computed, unref, type MaybeRef } from 'vue'
import {
  getSensorDisplayName,
  getSensorLabel,
  getSensorUnit,
  formatSensorValue,
} from '@/utils/sensorDefaults'

export interface SensorLabelInput {
  sensor_type: string
  name?: string | null
  raw_value?: number | null
  unit?: string | null
}

/**
 * Operator-facing sensor labels — same strings as palette chips (via sensorDefaults).
 */
export function useSensorLabel(sensor: MaybeRef<SensorLabelInput>) {
  const typeLabel = computed(() => getSensorLabel(unref(sensor).sensor_type))

  /** Card title: custom name or type label (multi-value sub-types disambiguated). */
  const label = computed(() => getSensorDisplayName(unref(sensor)))

  const unit = computed(() => {
    const s = unref(sensor)
    return s.unit?.trim() || getSensorUnit(s.sensor_type) || ''
  })

  const formattedValue = computed(() => formatSensorValue(unref(sensor)))

  return { label, typeLabel, unit, formattedValue }
}
