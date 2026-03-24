<script setup lang="ts">
/**
 * LineChartWidget — LiveLineChart widget for dashboard
 *
 * Renders a LiveLineChart with live sensor data from the store.
 * Includes a sensor selector dropdown for configuration.
 *
 * Fix: Uses local sensorId ref to survive render() one-shot props.
 * Fix: Watch on last_read instead of raw_value (fires on every WS event,
 *      even when value is constant).
 */
import { ref, computed, watch } from 'vue'
import type { ThresholdConfig } from '@/components/charts/LiveLineChart.vue'
import { useEspStore } from '@/stores/esp'
import LiveLineChart from '@/components/charts/LiveLineChart.vue'
import type { ChartDataPoint } from '@/components/charts/LiveLineChart.vue'
import type { MockSensor } from '@/types'

interface Props {
  sensorId?: string   // format: "espId:gpio:sensorType"
  showThresholds?: boolean
  yMin?: number
  yMax?: number
  color?: string
  /** Threshold values from WidgetConfigPanel */
  warnLow?: number
  warnHigh?: number
  alarmLow?: number
  alarmHigh?: number
}

const props = withDefaults(defineProps<Props>(), {
  showThresholds: false,
  yMin: undefined,
  yMax: undefined,
  color: undefined,
  warnLow: undefined,
  warnHigh: undefined,
  alarmLow: undefined,
  alarmHigh: undefined,
})
const emit = defineEmits<{
  'update:config': [config: { sensorId: string }]
}>()

const espStore = useEspStore()
const dataBuffer = ref<ChartDataPoint[]>([])
const MAX_POINTS = 60

// Local sensorId state — survives render() one-shot props (Bug 1b fix)
const localSensorId = ref(props.sensorId || '')

// Sync from props when they change (e.g. page reload with saved config)
watch(() => props.sensorId, (v) => { if (v) localSensorId.value = v })

// All available sensors for selection (deduplicated by espId:gpio:sensorType)
const availableSensors = computed(() => {
  const items: { id: string; label: string; unit: string }[] = []
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
        unit: s.unit || '',
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
  const sensor = ((device.sensors as MockSensor[]) || []).find(s =>
    s.gpio === gpio && (!sensorType || s.sensor_type === sensorType)
  )
  return sensor ? { ...sensor, espId, unit: sensor.unit || '' } : null
})

// Watch on last_read instead of raw_value (Bug 1a fix):
// raw_value doesn't change for constant sensors (e.g. Mock SHT31 = 22.0),
// but last_read updates on every WebSocket event.
watch(
  () => currentSensor.value?.last_read,
  () => {
    const sensor = currentSensor.value
    if (!sensor || sensor.raw_value == null) return
    const point: ChartDataPoint = { timestamp: new Date(), value: sensor.raw_value }
    const buf = [...dataBuffer.value, point]
    if (buf.length > MAX_POINTS) buf.shift()
    dataBuffer.value = buf
  },
)

// Build threshold config from individual props
const thresholdConfig = computed<ThresholdConfig | undefined>(() => {
  if (!props.showThresholds) return undefined
  const t: ThresholdConfig = {}
  if (props.warnLow != null) t.warnLow = props.warnLow
  if (props.warnHigh != null) t.warnHigh = props.warnHigh
  if (props.alarmLow != null) t.alarmLow = props.alarmLow
  if (props.alarmHigh != null) t.alarmHigh = props.alarmHigh
  return Object.keys(t).length > 0 ? t : undefined
})

function selectSensor(sensorId: string) {
  localSensorId.value = sensorId  // Immediate local update (Bug 1b fix)
  emit('update:config', { sensorId })
  dataBuffer.value = []
}
</script>

<template>
  <div class="line-chart-widget">
    <template v-if="localSensorId && currentSensor">
      <LiveLineChart
        :data="dataBuffer"
        height="100%"
        :unit="currentSensor.unit"
        :sensor-type="currentSensor.sensor_type"
        :fill="true"
        :color="props.color"
        :y-min="props.yMin"
        :y-max="props.yMax"
        :show-thresholds="props.showThresholds"
        :thresholds="thresholdConfig"
      />
    </template>
    <div v-else class="line-chart-widget__empty">
      <p>Sensor auswählen:</p>
      <select
        class="line-chart-widget__select"
        @change="selectSensor(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled selected>— Sensor wählen —</option>
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
.line-chart-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.line-chart-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.line-chart-widget__select {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  max-width: 200px;
}
</style>
