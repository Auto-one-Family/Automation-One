<script setup lang="ts">
/**
 * HistoricalChartWidget — Historical sensor data over selectable time range
 *
 * Dashboard widget wrapping HistoricalChart.vue with sensor selector.
 * Min-size: 6x4 (6 columns, 4 rows = 320px)
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import HistoricalChart from '@/components/charts/HistoricalChart.vue'
import { BarChart3 } from 'lucide-vue-next'
import type { MockSensor } from '@/types'

interface Props {
  sensorId?: string // "espId:gpio"
  timeRange?: '1h' | '6h' | '24h' | '7d'
  showThresholds?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  timeRange: '24h',
  showThresholds: true,
})

const emit = defineEmits<{
  'update:config': [config: Record<string, any>]
}>()

const espStore = useEspStore()
const selectedRange = ref<'1h' | '6h' | '24h' | '7d'>(props.timeRange)

watch(selectedRange, (val) => {
  emit('update:config', { timeRange: val })
})

const availableSensors = computed(() => {
  const items: { id: string; label: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const s of (device.sensors as MockSensor[]) || []) {
      items.push({
        id: `${deviceId}:${s.gpio}`,
        label: `${s.name || s.sensor_type} (${deviceId} GPIO ${s.gpio})`,
      })
    }
  }
  return items
})

const parsedSensor = computed(() => {
  if (!props.sensorId) return null
  const [espId, gpioStr] = props.sensorId.split(':')
  const gpio = parseInt(gpioStr)
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  if (!device) return null
  const sensor = ((device.sensors as MockSensor[]) || []).find(s => s.gpio === gpio)
  if (!sensor) return null
  return { espId, gpio, sensor }
})

function selectSensor(sensorId: string) {
  emit('update:config', { sensorId })
}
</script>

<template>
  <div class="historical-widget">
    <template v-if="sensorId && parsedSensor">
      <div class="historical-widget__info">
        <span class="historical-widget__sensor-name">
          {{ parsedSensor.sensor.name || parsedSensor.sensor.sensor_type }}
        </span>
      </div>
      <div class="historical-widget__chart">
        <HistoricalChart
          :esp-id="parsedSensor.espId"
          :gpio="parsedSensor.gpio"
          :sensor-type="parsedSensor.sensor.sensor_type"
          :time-range="selectedRange"
          :unit="parsedSensor.sensor.unit || ''"
          :show-thresholds="showThresholds"
          height="100%"
        />
      </div>
    </template>
    <div v-else class="historical-widget__empty">
      <BarChart3 class="w-8 h-8" style="opacity: 0.3" />
      <p>Sensor für Zeitreihe auswählen:</p>
      <select
        class="historical-widget__select"
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
.historical-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.historical-widget__info {
  display: flex;
  align-items: center;
  padding: 0 var(--space-1) var(--space-1) var(--space-1);
  flex-shrink: 0;
}

.historical-widget__sensor-name {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.historical-widget__chart {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.historical-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.historical-widget__select {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  max-width: 220px;
}
</style>
