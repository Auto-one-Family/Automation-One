<script setup lang="ts">
/**
 * GaugeWidget — GaugeChart widget for dashboard
 *
 * Fix: Uses local sensorId ref to survive render() one-shot props.
 * 8.1-A: Passes min/max/threshold config to GaugeChart for correct scale and color zones.
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import GaugeChart from '@/components/charts/GaugeChart.vue'
import { SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'
import { tokens } from '@/utils/cssTokens'
import type { GaugeThreshold } from '@/components/charts/types'
import type { MockSensor } from '@/types'

interface Props {
  sensorId?: string // "espId:gpio:sensorType"
  yMin?: number
  yMax?: number
  warnLow?: number
  warnHigh?: number
  alarmLow?: number
  alarmHigh?: number
  showThresholds?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:config': [config: { sensorId: string }]
}>()

const espStore = useEspStore()

// Local sensorId state — survives render() one-shot props (Bug 1b fix)
const localSensorId = ref(props.sensorId || '')

// Sync from props when they change (e.g. page reload with saved config)
watch(() => props.sensorId, (v) => { if (v) localSensorId.value = v })

const availableSensors = computed(() => {
  const items: { id: string; label: string }[] = []
  const seen = new Set<string>()
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const s of (device.sensors as MockSensor[]) || []) {
      const id = `${deviceId}:${s.gpio}:${s.sensor_type}`
      if (seen.has(id)) continue
      seen.add(id)
      items.push({
        id,
        label: `${s.name || s.sensor_type} (${deviceId} GPIO ${s.gpio} — ${s.sensor_type})`,
      })
    }
  }
  return items
})

// Current sensor data — uses localSensorId instead of props.sensorId
const currentSensor = computed(() => {
  if (!localSensorId.value) return null
  const parts = localSensorId.value.split(':')
  const espId = parts[0]
  const gpio = parseInt(parts[1])
  const sensorType = parts[2] || null
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  if (!device) return null
  return ((device.sensors as MockSensor[]) || []).find(s =>
    s.gpio === gpio && (!sensorType || s.sensor_type === sensorType)
  ) || null
})

// Sensor type from 3-part sensorId or from currentSensor
const sensorType = computed(() => {
  const parts = localSensorId.value.split(':')
  return parts[2] || currentSensor.value?.sensor_type || null
})

// SENSOR_TYPE_CONFIG defaults as fallback for min/max
const sensorTypeDefaults = computed(() => {
  if (!sensorType.value) return null
  return SENSOR_TYPE_CONFIG[sensorType.value] ?? null
})

// Effective min/max: config > SENSOR_TYPE_CONFIG > 0/100
const effectiveMin = computed(() => props.yMin ?? sensorTypeDefaults.value?.min ?? 0)
const effectiveMax = computed(() => props.yMax ?? sensorTypeDefaults.value?.max ?? 100)

// Build GaugeThreshold[] from threshold props
// Pattern: alarmLow < warnLow < warnHigh < alarmHigh
// Zones: [min..alarmLow] = alarm, [alarmLow..warnLow] = warning, [warnLow..warnHigh] = good, [warnHigh..alarmHigh] = warning, [alarmHigh..max] = alarm
const gaugeThresholds = computed<GaugeThreshold[]>(() => {
  const hasThresholds = props.warnLow != null || props.warnHigh != null ||
    props.alarmLow != null || props.alarmHigh != null

  if (!hasThresholds) {
    // No thresholds configured: single green zone across entire range
    return [{ value: effectiveMin.value, color: tokens.statusGood }]
  }

  const thresholds: GaugeThreshold[] = []
  const min = effectiveMin.value
  const aLow = props.alarmLow ?? min
  const wLow = props.warnLow ?? aLow
  const wHigh = props.warnHigh ?? effectiveMax.value
  const aHigh = props.alarmHigh ?? effectiveMax.value

  // Zone from min: alarm if alarmLow > min
  if (aLow > min) {
    thresholds.push({ value: min, color: tokens.statusAlarm })
  }
  // Zone: warning between alarmLow and warnLow
  if (wLow > aLow) {
    thresholds.push({ value: aLow, color: tokens.statusWarning })
  }
  // Zone: good (normal range)
  thresholds.push({ value: wLow, color: tokens.statusGood })
  // Zone: warning between warnHigh and alarmHigh
  if (aHigh > wHigh) {
    thresholds.push({ value: wHigh, color: tokens.statusWarning })
  } else {
    thresholds.push({ value: wHigh, color: tokens.statusAlarm })
  }
  // Zone: alarm above alarmHigh
  if (aHigh < effectiveMax.value && aHigh > wHigh) {
    thresholds.push({ value: aHigh, color: tokens.statusAlarm })
  }

  return thresholds
})

function selectSensor(sensorId: string) {
  localSensorId.value = sensorId  // Immediate local update (Bug 1b fix)
  emit('update:config', { sensorId })
}
</script>

<template>
  <div class="gauge-widget">
    <template v-if="localSensorId && currentSensor">
      <GaugeChart
        :value="currentSensor.raw_value ?? 0"
        :unit="currentSensor.unit || ''"
        :min="effectiveMin"
        :max="effectiveMax"
        :thresholds="gaugeThresholds"
        size="md"
      />
    </template>
    <div v-else class="gauge-widget__empty">
      <p>Sensor auswählen:</p>
      <select
        class="gauge-widget__select"
        @change="selectSensor(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled selected>— Sensor —</option>
        <option
          v-for="s in availableSensors"
          :key="s.id"
          :value="s.id"
        >{{ s.label }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.gauge-widget {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gauge-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.gauge-widget__select {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  max-width: 200px;
}
</style>
