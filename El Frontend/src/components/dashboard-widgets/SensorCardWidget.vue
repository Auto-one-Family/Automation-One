<script setup lang="ts">
/**
 * SensorCardWidget — Sensor value card for dashboard
 *
 * Fix: Uses local sensorId ref to survive render() one-shot props.
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import { Activity } from 'lucide-vue-next'
import type { MockSensor } from '@/types'
import { getSensorUnit } from '@/utils/sensorDefaults'

interface Props {
  sensorId?: string // "espId:gpio"
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
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const s of (device.sensors as MockSensor[]) || []) {
      items.push({
        id: `${deviceId}:${s.gpio}`,
        label: `${s.name || s.sensor_type} (${deviceId})`,
      })
    }
  }
  return items
})

// Current sensor data — uses localSensorId instead of props.sensorId
const currentSensor = computed(() => {
  if (!localSensorId.value) return null
  const [espId, gpioStr] = localSensorId.value.split(':')
  const gpio = parseInt(gpioStr)
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  if (!device) return null
  return ((device.sensors as MockSensor[]) || []).find(s => s.gpio === gpio) || null
})

const qualityClass = computed(() => {
  const q = currentSensor.value?.quality
  if (q === 'good' || q === 'excellent') return 'sensor-card-widget__dot--good'
  if (q === 'fair') return 'sensor-card-widget__dot--warning'
  if (q === 'poor' || q === 'bad' || q === 'error') return 'sensor-card-widget__dot--alarm'
  return 'sensor-card-widget__dot--offline'
})

function selectSensor(sensorId: string) {
  localSensorId.value = sensorId  // Immediate local update (Bug 1b fix)
  emit('update:config', { sensorId })
}
</script>

<template>
  <div class="sensor-card-widget">
    <template v-if="localSensorId && currentSensor">
      <div class="sensor-card-widget__header">
        <span class="sensor-card-widget__name">{{ currentSensor.name || currentSensor.sensor_type }}</span>
        <span :class="['sensor-card-widget__dot', qualityClass]" />
      </div>
      <div class="sensor-card-widget__value">
        <span class="sensor-card-widget__number">{{ (currentSensor.raw_value ?? 0).toFixed(1) }}</span>
        <span class="sensor-card-widget__unit">{{ getSensorUnit(currentSensor.sensor_type) !== 'raw' ? getSensorUnit(currentSensor.sensor_type) : (currentSensor.unit || '') }}</span>
      </div>
    </template>
    <div v-else class="sensor-card-widget__empty">
      <Activity class="w-6 h-6" style="opacity: 0.3" />
      <select
        class="sensor-card-widget__select"
        @change="selectSensor(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled selected>Sensor wählen</option>
        <option v-for="s in availableSensors" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.sensor-card-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--space-2);
}

.sensor-card-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.sensor-card-widget__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-card-widget__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sensor-card-widget__dot--good { background: var(--color-status-good); }
.sensor-card-widget__dot--warning { background: var(--color-status-warning); }
.sensor-card-widget__dot--alarm { background: var(--color-status-alarm); }
.sensor-card-widget__dot--offline { background: var(--color-status-offline); }

.sensor-card-widget__value {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}

.sensor-card-widget__number {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1;
}

.sensor-card-widget__unit {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.sensor-card-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  color: var(--color-text-muted);
}

.sensor-card-widget__select {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-xs);
  max-width: 160px;
}
</style>
