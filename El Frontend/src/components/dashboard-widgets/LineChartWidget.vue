<script setup lang="ts">
/**
 * LineChartWidget — LiveLineChart widget for dashboard
 *
 * Renders a LiveLineChart with live sensor data from the store.
 * Includes a sensor selector dropdown for configuration.
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import LiveLineChart from '@/components/charts/LiveLineChart.vue'
import type { ChartDataPoint } from '@/components/charts/LiveLineChart.vue'
import type { MockSensor } from '@/types'

interface Props {
  sensorId?: string   // format: "espId:gpio"
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:config': [config: { sensorId: string }]
}>()

const espStore = useEspStore()
const dataBuffer = ref<ChartDataPoint[]>([])
const MAX_POINTS = 60

// All available sensors for selection
const availableSensors = computed(() => {
  const items: { id: string; label: string; unit: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const s of (device.sensors as MockSensor[]) || []) {
      items.push({
        id: `${deviceId}:${s.gpio}`,
        label: `${s.name || s.sensor_type} (${deviceId} GPIO ${s.gpio})`,
        unit: s.unit || '',
      })
    }
  }
  return items
})

// Current sensor data
const currentSensor = computed(() => {
  if (!props.sensorId) return null
  const [espId, gpioStr] = props.sensorId.split(':')
  const gpio = parseInt(gpioStr)
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  if (!device) return null
  const sensor = ((device.sensors as MockSensor[]) || []).find(s => s.gpio === gpio)
  return sensor ? { ...sensor, espId, unit: sensor.unit || '' } : null
})

// Cache live data points
watch(
  () => currentSensor.value?.raw_value,
  (val) => {
    if (val == null) return
    const point: ChartDataPoint = { timestamp: new Date(), value: val }
    const buf = [...dataBuffer.value, point]
    if (buf.length > MAX_POINTS) buf.shift()
    dataBuffer.value = buf
  },
)

function selectSensor(sensorId: string) {
  emit('update:config', { sensorId })
  dataBuffer.value = []
}
</script>

<template>
  <div class="line-chart-widget">
    <template v-if="sensorId && currentSensor">
      <LiveLineChart
        :data="dataBuffer"
        height="100%"
        :unit="currentSensor.unit"
        :fill="true"
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
