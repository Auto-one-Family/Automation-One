<script setup lang="ts">
/**
 * HistoricalChartWidget
 *
 * Historical sensor data over selectable time ranges.
 * Uses the sensors API to fetch historical data and appends live data via WebSocket.
 * Min grid size: 6x4 (6 columns, 4 rows = 320px)
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useEspStore } from '@/stores/esp'
import { sensorsApi } from '@/api/sensors'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { chartTooltipStyle, chartGridStyle } from '@/utils/cssTokens'
import WidgetWrapper from './WidgetWrapper.vue'
import { Clock } from 'lucide-vue-next'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, TimeScale)

type TimeRange = '1h' | '6h' | '24h' | '7d'

interface Props {
  widgetId: string
  config?: {
    espId?: string
    gpio?: number
    timeRange?: TimeRange
    showThresholds?: boolean
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
const timeRange = ref<TimeRange>(props.config.timeRange || '24h')

const isLoading = ref(false)
const dataError = ref<string | null>(null)
const historicalData = ref<{ timestamp: Date; value: number }[]>([])

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

const sensor = computed(() => {
  if (!selectedEspId.value || selectedGpio.value < 0) return null
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  if (!device) return null
  return ((device as any).sensors || []).find((s: any) => s.gpio === selectedGpio.value) || null
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

async function fetchHistoricalData() {
  if (!selectedEspId.value || selectedGpio.value < 0) return

  isLoading.value = true
  dataError.value = null

  try {
    const now = new Date()
    const startTime = new Date(now.getTime() - TIME_RANGE_MS[timeRange.value])

    const response = await sensorsApi.queryData({
      esp_id: selectedEspId.value,
      gpio: selectedGpio.value,
      start_time: startTime.toISOString(),
      end_time: now.toISOString(),
      limit: 1000,
    } as any)

    historicalData.value = (response.readings || []).map((d: any) => ({
      timestamp: new Date(d.timestamp || d.created_at),
      value: d.processed_value ?? d.raw_value ?? 0,
    }))
  } catch (err) {
    dataError.value = 'Daten konnten nicht geladen werden'
    historicalData.value = []
  } finally {
    isLoading.value = false
  }
}

// Append live data from WebSocket
const stopLiveWatch = watch(
  () => espStore.devices,
  () => {
    if (!sensor.value || sensor.value.last_value == null) return
    const now = new Date()
    const cutoff = new Date(now.getTime() - TIME_RANGE_MS[timeRange.value])

    // Add new point
    const newData = [...historicalData.value, { timestamp: now, value: sensor.value.last_value }]
    // Remove points outside time range
    historicalData.value = newData.filter(d => d.timestamp >= cutoff)
  },
  { deep: true }
)

// Fetch on mount and when config changes
onMounted(fetchHistoricalData)

watch([selectedEspId, selectedGpio, timeRange], () => {
  fetchHistoricalData()
})

onUnmounted(() => stopLiveWatch())

const chartData = computed(() => ({
  labels: historicalData.value.map(d => d.timestamp),
  datasets: [{
    data: historicalData.value.map(d => d.value),
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    pointHitRadius: 8,
    borderWidth: 1.5,
  }],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 200 },
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      ...chartTooltipStyle,
      callbacks: {
        title: (items: any[]) => {
          if (!items.length) return ''
          const date = items[0].parsed.x
          return new Date(date).toLocaleString('de-DE')
        },
        label: (item: any) => {
          return `${item.parsed.y?.toFixed(2)} ${sensor.value?.unit || ''}`
        },
      },
    },
  },
  scales: {
    x: {
      type: 'time' as const,
      time: {
        tooltipFormat: 'dd.MM.yyyy HH:mm',
        displayFormats: {
          minute: 'HH:mm',
          hour: 'HH:mm',
          day: 'dd.MM',
        },
      },
      grid: chartGridStyle,
      ticks: { color: '#484860', font: { size: 10 } },
    },
    y: {
      grid: chartGridStyle,
      ticks: {
        color: '#484860',
        font: { size: 10 },
        callback: (val: any) => `${val}${sensor.value?.unit ? ' ' + sensor.value.unit : ''}`,
      },
    },
  },
}))

function selectSensor(espId: string, gpio: number) {
  selectedEspId.value = espId
  selectedGpio.value = gpio
  historicalData.value = []
  emit('update-config', { espId, gpio, timeRange: timeRange.value })
}

function setTimeRange(range: TimeRange) {
  timeRange.value = range
  emit('update-config', { espId: selectedEspId.value, gpio: selectedGpio.value, timeRange: range })
}
</script>

<template>
  <WidgetWrapper
    title="Verlauf"
    :icon="Clock"
    @remove="$emit('remove')"
  >
    <div v-if="!selectedEspId || selectedGpio < 0" class="widget-empty">
      <p>Sensor auswählen</p>
    </div>
    <div v-else class="historical-content">
      <!-- Time Range Selector -->
      <div class="time-range-bar">
        <button
          v-for="range in (['1h', '6h', '24h', '7d'] as TimeRange[])"
          :key="range"
          class="time-range-btn"
          :class="{ 'time-range-btn--active': timeRange === range }"
          @click="setTimeRange(range)"
        >
          {{ range }}
        </button>
      </div>

      <!-- Chart -->
      <div v-if="isLoading" class="widget-loading">Lade Daten...</div>
      <div v-else-if="dataError" class="widget-error">{{ dataError }}</div>
      <div v-else-if="historicalData.length === 0" class="widget-empty-data">
        Keine Daten für den gewählten Zeitraum
      </div>
      <div v-else class="chart-container">
        <Line :data="chartData" :options="chartOptions" />
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
.historical-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--space-2);
}

.time-range-bar {
  display: flex;
  gap: 2px;
  background: var(--color-bg-quaternary);
  border-radius: var(--radius-sm);
  padding: 2px;
  flex-shrink: 0;
}

.time-range-btn {
  flex: 1;
  padding: 2px var(--space-2);
  border: none;
  border-radius: calc(var(--radius-sm) - 1px);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.time-range-btn:hover {
  color: var(--color-text-secondary);
}

.time-range-btn--active {
  background: var(--color-bg-secondary);
  color: var(--color-accent-bright);
}

.chart-container {
  flex: 1;
  min-height: 0;
  position: relative;
}

.widget-empty,
.widget-loading,
.widget-error,
.widget-empty-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.widget-error {
  color: var(--color-error);
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
