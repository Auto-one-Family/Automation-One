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
import { useSensorId } from '@/composables/useSensorId'

interface Props {
  sensorId?: string // "espId:gpio:sensorType"
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d'
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
const selectedRange = ref<'1h' | '6h' | '24h' | '7d' | '30d'>(props.timeRange)

// Local sensorId state — survives render() one-shot props (Bug 1b fix)
const localSensorId = ref(props.sensorId || '')

// Sync from props when they change (e.g. page reload with saved config)
watch(() => props.sensorId, (v) => { if (v) localSensorId.value = v })

// Centralized sensorId parsing
const { espId: parsedEspId, gpio: parsedGpio, sensorType: parsedSensorType, isValid: sensorIdValid } = useSensorId(localSensorId)

watch(selectedRange, (val) => {
  emit('update:config', { timeRange: val })
})

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

// Parsed sensor data — uses parsed sensorId parts
const parsedSensor = computed(() => {
  if (!sensorIdValid.value) return null
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === parsedEspId.value)
  if (!device) return null
  const sensor = ((device.sensors as MockSensor[]) || []).find(s =>
    s.gpio === parsedGpio.value && (!parsedSensorType.value || s.sensor_type === parsedSensorType.value)
  )
  if (!sensor) return null
  return { espId: parsedEspId.value!, gpio: parsedGpio.value!, sensor }
})

function selectSensor(sensorId: string) {
  localSensorId.value = sensorId  // Immediate local update (Bug 1b fix)
  emit('update:config', { sensorId })
}
</script>

<template>
  <div class="historical-widget">
    <template v-if="localSensorId && parsedSensor">
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
