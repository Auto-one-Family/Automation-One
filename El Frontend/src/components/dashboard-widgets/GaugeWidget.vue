<script setup lang="ts">
/**
 * GaugeWidget — GaugeChart widget for dashboard
 *
 * Fix: Uses local sensorId ref to survive render() one-shot props.
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import GaugeChart from '@/components/charts/GaugeChart.vue'
import type { MockSensor } from '@/types'

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
        id: `${deviceId}:${s.gpio}:${s.sensor_type}`,
        label: `${s.name || s.sensor_type} (${deviceId} — ${s.sensor_type})`,
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
