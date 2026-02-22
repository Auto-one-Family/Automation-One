<script setup lang="ts">
/**
 * HistoricalChart — Time Series Chart with Threshold Lines
 *
 * Loads historical sensor data via API and renders a line chart
 * with optional threshold overlays using chartjs-plugin-annotation.
 *
 * Features:
 * - Time range selection: 1h, 6h, 24h, 7d
 * - Threshold lines (alarmLow, warnLow, warnHigh, alarmHigh)
 * - Live data append via WebSocket sensor_data events
 * - Zoom/Pan support (optional)
 */

import { ref, computed, watch, onMounted, shallowRef } from 'vue'
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
import annotationPlugin from 'chartjs-plugin-annotation'
import 'chartjs-adapter-date-fns'
import { sensorsApi } from '@/api/sensors'
import { useEspStore } from '@/stores/esp'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale,
  annotationPlugin
)

interface Props {
  espId: string
  gpio: number
  sensorType: string
  /** Time range in minutes */
  timeRange?: '1h' | '6h' | '24h' | '7d'
  /** Chart accent color */
  color?: string
  /** Unit suffix */
  unit?: string
  /** Height */
  height?: string
  /** Threshold values for annotation lines */
  thresholds?: {
    alarmLow?: number
    warnLow?: number
    warnHigh?: number
    alarmHigh?: number
  }
  /** Show threshold lines */
  showThresholds?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  timeRange: '1h',
  color: '#3b82f6',
  unit: '',
  height: '300px',
  thresholds: () => ({}),
  showThresholds: true,
})

const espStore = useEspStore()
const loading = ref(true)
const error = ref<string | null>(null)

// Data buffer
interface DataPoint {
  timestamp: Date
  value: number
}
const dataBuffer = shallowRef<DataPoint[]>([])

// Time range in minutes
const timeRangeMinutes: Record<string, number> = {
  '1h': 60,
  '6h': 360,
  '24h': 1440,
  '7d': 10080,
}

const selectedRange = ref(props.timeRange)

// =============================================================================
// Load Historical Data
// =============================================================================
async function loadData() {
  loading.value = true
  error.value = null

  try {
    const minutes = timeRangeMinutes[selectedRange.value] || 60
    const from = new Date(Date.now() - minutes * 60 * 1000).toISOString()
    const to = new Date().toISOString()

    const limit = selectedRange.value === '7d' ? 2000 : 1000

    const response = await sensorsApi.queryData({
      esp_id: props.espId,
      gpio: props.gpio,
      start_time: from,
      end_time: to,
      limit,
    })

    if (response && Array.isArray(response.data)) {
      dataBuffer.value = response.data.map((d: any) => ({
        timestamp: new Date(d.timestamp),
        value: typeof d.value === 'number' ? d.value : parseFloat(d.value),
      }))
    } else {
      dataBuffer.value = []
    }
  } catch (err: any) {
    error.value = err?.response?.data?.detail || 'Daten konnten nicht geladen werden'
    dataBuffer.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

watch(selectedRange, loadData)

// Watch for live sensor data updates and append
watch(
  () => {
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
    const sensors = (device?.sensors as any[]) || []
    const sensor = sensors.find(s => s.gpio === props.gpio)
    return sensor?.last_read
  },
  () => {
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
    const sensors = (device?.sensors as any[]) || []
    const sensor = sensors.find(s => s.gpio === props.gpio)
    if (sensor && typeof sensor.raw_value === 'number') {
      const newPoint: DataPoint = {
        timestamp: new Date(sensor.last_read || Date.now()),
        value: sensor.raw_value,
      }
      // Append and trim old data
      const maxPoints = selectedRange.value === '7d' ? 2000 : 1000
      const newBuffer = [...dataBuffer.value, newPoint]
      if (newBuffer.length > maxPoints) newBuffer.shift()
      dataBuffer.value = newBuffer
    }
  }
)

// =============================================================================
// Chart Configuration
// =============================================================================
const chartData = computed(() => ({
  labels: dataBuffer.value.map(d => d.timestamp),
  datasets: [{
    data: dataBuffer.value.map(d => d.value),
    borderColor: props.color,
    backgroundColor: `${props.color}1a`,
    borderWidth: 2,
    pointRadius: 0,
    pointHitRadius: 8,
    tension: 0.3,
    fill: true,
  }],
}))

const chartOptions = computed(() => {
  const annotations: Record<string, any> = {}

  if (props.showThresholds && props.thresholds) {
    if (props.thresholds.alarmLow != null) {
      annotations.alarmLow = {
        type: 'line',
        yMin: props.thresholds.alarmLow,
        yMax: props.thresholds.alarmLow,
        borderColor: 'rgba(239, 68, 68, 0.6)',
        borderWidth: 1,
        borderDash: [4, 4],
        label: {
          display: true,
          content: `Alarm ↓ ${props.thresholds.alarmLow}`,
          position: 'start',
          font: { size: 9, family: 'JetBrains Mono' },
          color: 'rgba(239, 68, 68, 0.8)',
          backgroundColor: 'transparent',
        },
      }
    }

    if (props.thresholds.warnLow != null) {
      annotations.warnLow = {
        type: 'line',
        yMin: props.thresholds.warnLow,
        yMax: props.thresholds.warnLow,
        borderColor: 'rgba(234, 179, 8, 0.5)',
        borderWidth: 1,
        borderDash: [4, 4],
      }
    }

    if (props.thresholds.warnHigh != null) {
      annotations.warnHigh = {
        type: 'line',
        yMin: props.thresholds.warnHigh,
        yMax: props.thresholds.warnHigh,
        borderColor: 'rgba(234, 179, 8, 0.5)',
        borderWidth: 1,
        borderDash: [4, 4],
      }
    }

    if (props.thresholds.alarmHigh != null) {
      annotations.alarmHigh = {
        type: 'line',
        yMin: props.thresholds.alarmHigh,
        yMax: props.thresholds.alarmHigh,
        borderColor: 'rgba(239, 68, 68, 0.6)',
        borderWidth: 1,
        borderDash: [4, 4],
        label: {
          display: true,
          content: `Alarm ↑ ${props.thresholds.alarmHigh}`,
          position: 'start',
          font: { size: 9, family: 'JetBrains Mono' },
          color: 'rgba(239, 68, 68, 0.8)',
          backgroundColor: 'transparent',
        },
      }
    }
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(7, 7, 13, 0.9)',
        borderColor: 'rgba(133, 133, 160, 0.3)',
        borderWidth: 1,
        titleFont: { family: 'JetBrains Mono', size: 11 },
        bodyFont: { family: 'JetBrains Mono', size: 12 },
        titleColor: '#8585a0',
        bodyColor: '#eaeaf2',
        padding: 8,
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y?.toFixed(2)}${props.unit ? ' ' + props.unit : ''}`,
        },
      },
      annotation: {
        annotations,
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        display: true,
        grid: { display: true, color: 'rgba(29, 29, 42, 0.8)' },
        ticks: {
          color: '#484860',
          font: { family: 'JetBrains Mono', size: 10 },
          maxTicksLimit: 8,
        },
        border: { display: false },
      },
      y: {
        display: true,
        grid: { display: true, color: 'rgba(29, 29, 42, 0.8)' },
        ticks: {
          color: '#484860',
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (val: any) => `${val}${props.unit ? ' ' + props.unit : ''}`,
        },
        border: { display: false },
      },
    },
  }
})
</script>

<template>
  <div class="historical-chart">
    <!-- Time Range Selector -->
    <div class="historical-chart__header">
      <div class="historical-chart__range-buttons">
        <button
          v-for="range in ['1h', '6h', '24h', '7d']"
          :key="range"
          :class="['historical-chart__range-btn', { 'historical-chart__range-btn--active': selectedRange === range }]"
          @click="selectedRange = range as any"
        >
          {{ range }}
        </button>
      </div>
      <span v-if="dataBuffer.length > 0" class="historical-chart__count">
        {{ dataBuffer.length }} Datenpunkte
      </span>
    </div>

    <!-- Chart -->
    <div class="historical-chart__canvas" :style="{ height }">
      <div v-if="loading" class="historical-chart__loading">Lade Daten...</div>
      <div v-else-if="error" class="historical-chart__error">{{ error }}</div>
      <div v-else-if="dataBuffer.length === 0" class="historical-chart__empty">
        Keine Daten für den gewählten Zeitraum
      </div>
      <Line
        v-else
        :data="chartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>

<style scoped>
.historical-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.historical-chart__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.historical-chart__range-buttons {
  display: flex;
  gap: 2px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.historical-chart__range-btn {
  padding: var(--space-1) var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  font-family: var(--font-mono);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.historical-chart__range-btn:hover {
  color: var(--color-text-secondary);
}

.historical-chart__range-btn--active {
  background: var(--color-accent);
  color: white;
}

.historical-chart__count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.historical-chart__canvas {
  position: relative;
  width: 100%;
}

.historical-chart__loading,
.historical-chart__error,
.historical-chart__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.historical-chart__error {
  color: var(--color-status-alarm);
}
</style>
