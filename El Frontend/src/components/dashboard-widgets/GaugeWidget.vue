<script setup lang="ts">
/**
 * GaugeWidget
 *
 * Gauge chart widget for dashboard.
 * Displays a single sensor value as a semi-circular gauge.
 */

import { ref, computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import GaugeChart from '@/components/charts/GaugeChart.vue'
import WidgetWrapper from './WidgetWrapper.vue'
import { Gauge } from 'lucide-vue-next'

interface Props {
  widgetId: string
  config?: {
    espId?: string
    gpio?: number
    min?: number
    max?: number
    unit?: string
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

const selectedEspId = ref(props.config.espId || '')
const selectedGpio = ref(props.config.gpio ?? -1)

const currentValue = computed(() => {
  if (!selectedEspId.value || selectedGpio.value < 0) return 0
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  if (!device) return 0
  const sensor = ((device as any).sensors || []).find((s: any) => s.gpio === selectedGpio.value)
  return sensor?.last_value ?? 0
})

const sensorUnit = computed(() => {
  if (!selectedEspId.value || selectedGpio.value < 0) return props.config.unit || ''
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  if (!device) return ''
  const sensor = ((device as any).sensors || []).find((s: any) => s.gpio === selectedGpio.value)
  return sensor?.unit || props.config.unit || ''
})

const sensorName = computed(() => {
  if (!selectedEspId.value || selectedGpio.value < 0) return 'Sensor'
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  if (!device) return 'Sensor'
  const sensor = ((device as any).sensors || []).find((s: any) => s.gpio === selectedGpio.value)
  return sensor?.name || sensor?.sensor_type || 'Sensor'
})

const availableSensors = computed(() => {
  const sensors: { espId: string; gpio: number; label: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const sensor of ((device as any).sensors || [])) {
      sensors.push({
        espId: deviceId,
        gpio: sensor.gpio,
        label: `${device.name || deviceId} / ${sensor.name || sensor.sensor_type} (GPIO ${sensor.gpio})`,
      })
    }
  }
  return sensors
})

function selectSensor(espId: string, gpio: number) {
  selectedEspId.value = espId
  selectedGpio.value = gpio
  emit('update-config', { espId, gpio })
}
</script>

<template>
  <WidgetWrapper
    title="Gauge"
    :icon="Gauge"
    @remove="$emit('remove')"
  >
    <div v-if="!selectedEspId || selectedGpio < 0" class="widget-empty">
      <p>Sensor auswählen</p>
    </div>
    <div v-else class="gauge-content">
      <div class="gauge-label">{{ sensorName }}</div>
      <div class="gauge-chart-container">
        <GaugeChart
          :value="currentValue"
          :min="props.config.min ?? 0"
          :max="props.config.max ?? 100"
          :unit="sensorUnit"
          size="md"
        />
      </div>
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
.gauge-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-1);
}

.gauge-label {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  font-weight: 500;
  text-align: center;
}

.gauge-chart-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
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
