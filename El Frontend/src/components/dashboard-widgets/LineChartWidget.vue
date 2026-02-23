<script setup lang="ts">
/**
 * LineChartWidget
 *
 * Real-time line chart widget for dashboard.
 * Shows live sensor data as a continuously updating line chart.
 */

import { ref, computed, watch, onUnmounted } from 'vue'
import { useEspStore } from '@/stores/esp'
import LiveLineChart from '@/components/charts/LiveLineChart.vue'
import type { ChartDataPoint } from '@/components/charts/LiveLineChart.vue'
import WidgetWrapper from './WidgetWrapper.vue'
import { TrendingUp } from 'lucide-vue-next'

interface Props {
  widgetId: string
  config?: {
    sensorId?: string
    espId?: string
    gpio?: number
    maxPoints?: number
    color?: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  config: () => ({}),
})

const emit = defineEmits<{
  remove: []
  'update-config': [config: Record<string, unknown>]
}>()

const espStore = useEspStore()

// Config state
const selectedEspId = ref(props.config.espId || '')
const selectedGpio = ref(props.config.gpio ?? -1)

// Data buffer
const dataPoints = ref<ChartDataPoint[]>([])

// Available sensors
const availableSensors = computed(() => {
  const sensors: { espId: string; gpio: number; label: string; unit: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    const sensorList = (device as any).sensors || []
    for (const sensor of sensorList) {
      sensors.push({
        espId: deviceId,
        gpio: sensor.gpio,
        label: `${device.name || deviceId} / ${sensor.name || sensor.sensor_type} (GPIO ${sensor.gpio})`,
        unit: sensor.unit || '',
      })
    }
  }
  return sensors
})

const selectedSensor = computed(() =>
  availableSensors.value.find(s => s.espId === selectedEspId.value && s.gpio === selectedGpio.value)
)

// Watch for WebSocket sensor_data updates
const stopWatch = watch(
  () => espStore.devices,
  () => {
    if (!selectedEspId.value || selectedGpio.value < 0) return
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
    if (!device) return
    const sensor = ((device as any).sensors || []).find((s: any) => s.gpio === selectedGpio.value)
    if (sensor?.last_value != null) {
      const now = new Date()
      const last = dataPoints.value[dataPoints.value.length - 1]
      // Only add if value actually changed or >5s elapsed
      if (!last || last.value !== sensor.last_value || (now.getTime() - new Date(last.timestamp).getTime()) > 5000) {
        dataPoints.value = [...dataPoints.value.slice(-(props.config.maxPoints || 50) + 1), {
          timestamp: now,
          value: sensor.last_value,
        }]
      }
    }
  },
  { deep: true }
)

onUnmounted(() => stopWatch())

function selectSensor(espId: string, gpio: number) {
  selectedEspId.value = espId
  selectedGpio.value = gpio
  dataPoints.value = []
  emit('update-config', { espId, gpio })
}
</script>

<template>
  <WidgetWrapper
    title="Live-Chart"
    :icon="TrendingUp"
    @remove="$emit('remove')"
  >
    <div v-if="!selectedEspId || selectedGpio < 0" class="widget-empty">
      <p>Sensor auswählen</p>
    </div>
    <div v-else class="line-chart-content">
      <div class="line-chart-label">
        {{ selectedSensor?.label || 'Sensor' }}
        <span v-if="selectedSensor?.unit" class="line-chart-unit">({{ selectedSensor.unit }})</span>
      </div>
      <LiveLineChart
        :data="dataPoints"
        :max-data-points="props.config.maxPoints || 50"
        :color="props.config.color || '#3b82f6'"
        height="100%"
        :unit="selectedSensor?.unit || ''"
      />
    </div>

    <template #config="{ close }">
      <div class="widget-config-inner">
        <label class="config-label">Sensor</label>
        <select
          class="config-select"
          :value="`${selectedEspId}:${selectedGpio}`"
          @change="(e) => {
            const [esp, gpio] = (e.target as HTMLSelectElement).value.split(':')
            selectSensor(esp, parseInt(gpio))
          }"
        >
          <option value=":-1" disabled>Sensor wählen...</option>
          <option
            v-for="s in availableSensors"
            :key="`${s.espId}:${s.gpio}`"
            :value="`${s.espId}:${s.gpio}`"
          >
            {{ s.label }}
          </option>
        </select>
        <button class="config-close-btn" @click="close()">Schließen</button>
      </div>
    </template>
  </WidgetWrapper>
</template>

<style scoped>
.line-chart-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--space-1);
}

.line-chart-label {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.line-chart-unit {
  color: var(--color-text-muted);
  font-weight: 400;
}

.widget-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.widget-config-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.config-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.config-select {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-xs);
  font-family: inherit;
}

.config-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.config-close-btn {
  align-self: flex-end;
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.config-close-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}
</style>
