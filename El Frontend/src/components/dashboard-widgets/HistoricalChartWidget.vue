<script setup lang="ts">
/**
 * HistoricalChartWidget — Historical sensor data over selectable time range
 *
 * Dashboard widget wrapping HistoricalChart.vue with sensor selector.
 * Min-size: 6x4 (6 columns, 4 rows = 320px)
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import { useZoneStore } from '@/shared/stores/zone.store'
import HistoricalChart from '@/components/charts/HistoricalChart.vue'
import ExportCsvDialog from '@/components/dashboard-widgets/ExportCsvDialog.vue'
import { BarChart3, Download } from 'lucide-vue-next'
import type { MockSensor } from '@/types'
import { useSensorId } from '@/composables/useSensorId'
import { useSensorOptions } from '@/composables/useSensorOptions'

interface Props {
  sensorId?: string // "espId:gpio:sensorType"
  zoneId?: string   // Zone-scoped sensor filtering (PA-02c)
  title?: string
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
const zoneStore = useZoneStore()
const selectedRange = ref<'1h' | '6h' | '24h' | '7d' | '30d'>(props.timeRange)
const showExportDialog = ref(false)

// Local sensorId state — survives render() one-shot props (Bug 1b fix)
const localSensorId = ref(props.sensorId || '')
const localZoneId = ref<string | undefined>(props.zoneId)

// Sync from props when they change (e.g. page reload with saved config)
watch(() => props.sensorId, (v) => { if (v) localSensorId.value = v })
watch(() => props.zoneId, (v) => { localZoneId.value = v })

// Centralized sensorId parsing
const { espId: parsedEspId, gpio: parsedGpio, sensorType: parsedSensorType, isValid: sensorIdValid } = useSensorId(localSensorId)

watch(selectedRange, (val) => {
  emit('update:config', { timeRange: val })
})

// Centralized sensor options (deduplicated, zone-filtered via PA-02c)
const { flatSensorOptions: availableSensors } = useSensorOptions(localZoneId)

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

// Resolved names for ExportCsvDialog
const resolvedSensorName = computed(() =>
  parsedSensor.value?.sensor.name || parsedSensorType.value || ''
)
const zoneNameFromContext = computed(() => {
  if (!localZoneId.value) return undefined
  return zoneStore.zoneEntities.find(z => z.zone_id === localZoneId.value)?.name
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
        <button
          class="historical-widget__export-btn"
          title="Als CSV exportieren"
          @click="showExportDialog = true"
        >
          <Download :size="14" />
        </button>
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
      <p>Sensor für Zeitreihe auswählen{{ props.title ? ` für ${props.title}` : '' }}:</p>
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

    <ExportCsvDialog
      v-model:open="showExportDialog"
      :sensor-id="localSensorId"
      :sensor-name="resolvedSensorName"
      :zone-name="zoneNameFromContext"
    />
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
  flex: 1;
  min-width: 0;
}

.historical-widget__export-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 28px;
  min-height: 28px;
  padding: var(--space-1);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s, color 0.15s;
}

.historical-widget__export-btn:hover {
  opacity: 1;
  color: var(--color-accent);
}

@media (hover: none) {
  .historical-widget__export-btn {
    opacity: 0.8;
  }
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
