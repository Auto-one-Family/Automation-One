<script setup lang="ts">
/**
 * MultiSensorWidget — Multi-sensor chart widget for dashboard
 *
 * Wraps MultiSensorChart.vue for the custom dashboard builder.
 * Allows selecting multiple sensors via chip-based UI.
 * Uses local state to survive render() one-shot props.
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import MultiSensorChart from '@/components/charts/MultiSensorChart.vue'
import { BarChart3, Plus, X } from 'lucide-vue-next'
import { CHART_COLORS } from '@/utils/chartColors'
import type { MockSensor, ChartSensor } from '@/types'

interface Props {
  /** Comma-separated sensor IDs: "espId:gpio,espId:gpio" */
  dataSources?: string
  timeRange?: '1h' | '6h' | '24h' | '7d'
}

const props = withDefaults(defineProps<Props>(), {
  timeRange: '24h',
})

const emit = defineEmits<{
  'update:config': [config: Record<string, any>]
}>()

const espStore = useEspStore()

// Local state — survives render() one-shot props (Bug 1b pattern)
const localDataSources = ref(props.dataSources || '')
const localTimeRange = ref(props.timeRange)

watch(() => props.dataSources, (v) => { if (v) localDataSources.value = v })
watch(() => props.timeRange, (v) => { if (v) localTimeRange.value = v })

// Parse selected sensor IDs from comma-separated string
const selectedSensorIds = computed(() => {
  if (!localDataSources.value) return []
  return localDataSources.value.split(',').filter(Boolean)
})

// Build ChartSensor[] for MultiSensorChart
const chartSensors = computed<ChartSensor[]>(() => {
  return selectedSensorIds.value.map((sId, idx) => {
    const [espId, gpioStr] = sId.split(':')
    const gpio = parseInt(gpioStr)
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
    const sensor = device
      ? ((device.sensors as MockSensor[]) || []).find(s => s.gpio === gpio)
      : null
    return {
      id: `${espId}_${gpio}`,
      espId,
      gpio,
      sensorType: sensor?.sensor_type || 'unknown',
      name: sensor?.name || sensor?.sensor_type || `GPIO ${gpio}`,
      unit: sensor?.unit || '',
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }
  })
})

// All available sensors for "add" dropdown
const availableSensors = computed(() => {
  const items: { id: string; label: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const s of (device.sensors as MockSensor[]) || []) {
      const id = `${deviceId}:${s.gpio}`
      if (!selectedSensorIds.value.includes(id)) {
        items.push({
          id,
          label: `${s.name || s.sensor_type} (${deviceId} GPIO ${s.gpio})`,
        })
      }
    }
  }
  return items
})

const showAddDropdown = ref(false)

function addSensor(sensorId: string) {
  const ids = [...selectedSensorIds.value, sensorId]
  localDataSources.value = ids.join(',')
  emit('update:config', { dataSources: localDataSources.value })
  showAddDropdown.value = false
}

function removeSensor(sensorId: string) {
  const ids = selectedSensorIds.value.filter(id => id !== sensorId)
  localDataSources.value = ids.join(',')
  emit('update:config', { dataSources: localDataSources.value })
}

</script>

<template>
  <div class="multi-sensor-widget">
    <template v-if="chartSensors.length > 0">
      <!-- Sensor chips -->
      <div class="multi-sensor-widget__chips">
        <span
          v-for="(sensor, idx) in chartSensors"
          :key="sensor.id"
          class="multi-sensor-widget__chip"
          :style="{ borderColor: CHART_COLORS[idx % CHART_COLORS.length] }"
        >
          <span
            class="multi-sensor-widget__chip-dot"
            :style="{ background: CHART_COLORS[idx % CHART_COLORS.length] }"
          />
          {{ sensor.name }}
          <button class="multi-sensor-widget__chip-remove" @click="removeSensor(selectedSensorIds[idx])">
            <X :size="10" />
          </button>
        </span>
        <button
          v-if="availableSensors.length > 0"
          class="multi-sensor-widget__add-btn"
          @click="showAddDropdown = !showAddDropdown"
        >
          <Plus :size="12" />
        </button>
        <div v-if="showAddDropdown" class="multi-sensor-widget__dropdown">
          <div
            v-for="s in availableSensors"
            :key="s.id"
            class="multi-sensor-widget__dropdown-item"
            @click="addSensor(s.id)"
          >{{ s.label }}</div>
        </div>
      </div>

      <!-- Chart -->
      <div class="multi-sensor-widget__chart">
        <MultiSensorChart
          :sensors="chartSensors"
          :time-range="localTimeRange"
          :enable-live-updates="true"
        />
      </div>
    </template>

    <!-- Empty state: select sensors -->
    <div v-else class="multi-sensor-widget__empty">
      <BarChart3 class="w-8 h-8" style="opacity: 0.3" />
      <p>Sensoren für Multi-Chart auswählen:</p>
      <select
        class="multi-sensor-widget__select"
        @change="addSensor(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
      >
        <option value="" disabled selected>— Sensor hinzufügen —</option>
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
.multi-sensor-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.multi-sensor-widget__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) var(--space-2);
  flex-shrink: 0;
  position: relative;
}

.multi-sensor-widget__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  background: var(--color-bg-quaternary);
}

.multi-sensor-widget__chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.multi-sensor-widget__chip-remove {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
}

.multi-sensor-widget__chip-remove:hover {
  color: var(--color-error);
}

.multi-sensor-widget__add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.multi-sensor-widget__add-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.multi-sensor-widget__dropdown {
  position: absolute;
  top: 100%;
  left: var(--space-2);
  z-index: var(--z-dropdown);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--elevation-floating);
  max-height: 200px;
  overflow-y: auto;
  min-width: 200px;
}

.multi-sensor-widget__dropdown-item {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.multi-sensor-widget__dropdown-item:hover {
  background: var(--glass-bg-light);
  color: var(--color-text-primary);
}

.multi-sensor-widget__chart {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.multi-sensor-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.multi-sensor-widget__select {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  max-width: 220px;
}
</style>
