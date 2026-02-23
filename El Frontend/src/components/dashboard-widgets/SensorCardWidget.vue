<script setup lang="ts">
/**
 * SensorCardWidget
 *
 * Compact sensor value card for dashboard.
 * Shows current value, unit, trend indicator, and quality status.
 */

import { ref, computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import WidgetWrapper from './WidgetWrapper.vue'
import { Thermometer, TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'

interface Props {
  widgetId: string
  config?: {
    espId?: string
    gpio?: number
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

// Previous value for trend detection
const previousValue = ref<number | null>(null)

const sensor = computed(() => {
  if (!selectedEspId.value || selectedGpio.value < 0) return null
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  if (!device) return null
  return ((device as any).sensors || []).find((s: any) => s.gpio === selectedGpio.value) || null
})

const deviceName = computed(() => {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  return device?.name || selectedEspId.value
})

const currentValue = computed(() => sensor.value?.last_value ?? null)

const trend = computed(() => {
  if (currentValue.value == null || previousValue.value == null) return 'stable'
  if (currentValue.value > previousValue.value) return 'up'
  if (currentValue.value < previousValue.value) return 'down'
  return 'stable'
})

const qualityClass = computed(() => {
  const q = sensor.value?.quality
  if (q === 'alarm') return 'quality--alarm'
  if (q === 'warning') return 'quality--warning'
  if (q === 'good') return 'quality--good'
  return ''
})

const availableSensors = computed(() => {
  const sensors: { espId: string; gpio: number; label: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const s of ((device as any).sensors || [])) {
      sensors.push({
        espId: deviceId,
        gpio: s.gpio,
        label: `${device.name || deviceId} / ${s.name || s.sensor_type} (GPIO ${s.gpio})`,
      })
    }
  }
  return sensors
})

function selectSensor(espId: string, gpio: number) {
  selectedEspId.value = espId
  selectedGpio.value = gpio
  previousValue.value = null
  emit('update-config', { espId, gpio })
}
</script>

<template>
  <WidgetWrapper
    title="Sensor"
    :icon="Thermometer"
    @remove="$emit('remove')"
  >
    <div v-if="!sensor" class="widget-empty">
      <p>Sensor auswählen</p>
    </div>
    <div v-else class="sensor-card-content" :class="qualityClass">
      <div class="sensor-card-name">{{ sensor.name || sensor.sensor_type }}</div>
      <div class="sensor-card-value">
        <span class="value-number">{{ currentValue != null ? currentValue.toFixed(1) : '--' }}</span>
        <span class="value-unit">{{ sensor.unit || '' }}</span>
      </div>
      <div class="sensor-card-meta">
        <span class="sensor-device">{{ deviceName }}</span>
        <span class="sensor-trend">
          <TrendingUp v-if="trend === 'up'" class="trend-icon trend-icon--up" />
          <TrendingDown v-else-if="trend === 'down'" class="trend-icon trend-icon--down" />
          <Minus v-else class="trend-icon" />
        </span>
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
.sensor-card-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.quality--alarm {
  background: rgba(248, 113, 113, 0.08);
}

.quality--warning {
  background: rgba(251, 191, 36, 0.08);
}

.quality--good {
  background: rgba(52, 211, 153, 0.05);
}

.sensor-card-name {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-card-value {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}

.value-number {
  font-size: 1.5rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-primary);
  line-height: 1;
}

.value-unit {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.sensor-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sensor-device {
  font-size: 10px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-trend {
  flex-shrink: 0;
}

.trend-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
}

.trend-icon--up {
  color: var(--color-success);
}

.trend-icon--down {
  color: var(--color-error);
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
