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
 * - Zoom/Pan support via chartjs-plugin-zoom (8.0-A)
 * - Gap detection: line breaks when ESP was offline (8.0-C)
 * - Stats overlay: Min/Max/Avg from API + Avg annotation line (8.0-D)
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
import zoomPlugin from 'chartjs-plugin-zoom'
import 'chartjs-adapter-date-fns'
import { RotateCcw } from 'lucide-vue-next'
import { sensorsApi } from '@/api/sensors'
import { useEspStore } from '@/stores/esp'
import { tokens } from '@/utils/cssTokens'
import { getAutoResolution, TIME_RANGE_MINUTES } from '@/utils/autoResolution'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale,
  zoomPlugin
)

interface Props {
  espId: string
  gpio: number
  sensorType: string
  /** Time range */
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d'
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
  color: tokens.accent,
  unit: '',
  height: '300px',
  thresholds: () => ({}),
  showThresholds: true,
})

const espStore = useEspStore()
const loading = ref(true)
const error = ref<string | null>(null)

// Data buffer — allows null values for gap markers (8.0-C)
interface DataPoint {
  timestamp: Date
  value: number | null
  minValue?: number | null
  maxValue?: number | null
}
const dataBuffer = shallowRef<DataPoint[]>([])
const isAggregated = ref(false)

// Stats from API (8.0-D)
interface SensorStats {
  min: number
  max: number
  avg: number
  stdDev: number
  count: number
}
const stats = ref<SensorStats | null>(null)

// Zoom state (8.0-A)
const chartRef = ref<InstanceType<typeof Line> | null>(null)
const isZoomed = ref(false)

// Time range in minutes — uses shared TIME_RANGE_MINUTES from autoResolution

const selectedRange = ref(props.timeRange)

// Median interval for gap detection (8.0-C)
let medianIntervalMs = 0

/** Multiplier: gap if time between points exceeds median * this */
const GAP_THRESHOLD_MULTIPLIER = 3

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

// =============================================================================
// Gap Detection (8.0-C)
// =============================================================================

/**
 * Calculates median interval from sorted data points.
 * Returns 0 if fewer than 2 points.
 */
function calculateMedianInterval(points: Array<{ timestamp: Date }>): number {
  if (points.length < 2) return 0
  const intervals: number[] = []
  for (let i = 1; i < points.length; i++) {
    intervals.push(points[i].timestamp.getTime() - points[i - 1].timestamp.getTime())
  }
  intervals.sort((a, b) => a - b)
  return intervals[Math.floor(intervals.length / 2)]
}

/**
 * Inserts null gap markers where time between consecutive points
 * exceeds GAP_THRESHOLD_MULTIPLIER * medianInterval.
 */
function insertGapMarkers(
  points: DataPoint[],
  medianInterval: number
): DataPoint[] {
  if (points.length < 2 || medianInterval <= 0) return points
  const gapThreshold = medianInterval * GAP_THRESHOLD_MULTIPLIER
  const result: DataPoint[] = [points[0]]

  for (let i = 1; i < points.length; i++) {
    const timeDiff = points[i].timestamp.getTime() - points[i - 1].timestamp.getTime()
    if (timeDiff > gapThreshold) {
      // Insert null marker 1ms after last valid point to break line
      result.push({ timestamp: new Date(points[i - 1].timestamp.getTime() + 1), value: null })
    }
    result.push(points[i])
  }
  return result
}

// =============================================================================
// Load Historical Data + Stats
// =============================================================================
async function loadData() {
  // Guard: skip API call if required props are missing (prevents 422)
  if (!props.espId || !props.sensorType) {
    error.value = 'Widget-Konfiguration unvollständig'
    loading.value = false
    dataBuffer.value = []
    stats.value = null
    return
  }

  loading.value = true
  error.value = null

  try {
    const minutes = TIME_RANGE_MINUTES[selectedRange.value] || 60
    const from = new Date(Date.now() - minutes * 60 * 1000).toISOString()
    const to = new Date().toISOString()

    // Auto-resolution: use server-side aggregation for longer time ranges
    const resolution = getAutoResolution(minutes)
    const limit = resolution ? 1000 : (selectedRange.value === '7d' ? 2000 : 1000)

    // Parallel: fetch data + stats (8.0-D)
    const [dataResponse, statsResponse] = await Promise.all([
      sensorsApi.queryData({
        esp_id: props.espId,
        gpio: props.gpio,
        sensor_type: props.sensorType,
        start_time: from,
        end_time: to,
        limit,
        resolution,
      }),
      sensorsApi.getStats(props.espId, props.gpio, {
        sensor_type: props.sensorType,
        start_time: from,
        end_time: to,
      }).catch(() => null), // Stats failure is non-critical
    ])

    isAggregated.value = resolution != null && dataResponse?.resolution !== 'raw'

    if (dataResponse && Array.isArray(dataResponse.readings)) {
      const rawPoints = dataResponse.readings.map((d) => {
        // Use processed_value (calibrated/converted) when available, fall back to raw_value
        const val = d.processed_value != null ? d.processed_value : d.raw_value
        return {
          timestamp: new Date(d.timestamp),
          value: typeof val === 'number' ? val : parseFloat(String(val)),
          minValue: d.min_value ?? null,
          maxValue: d.max_value ?? null,
        }
      })

      // Calculate median interval for gap detection (8.0-C)
      medianIntervalMs = calculateMedianInterval(rawPoints)

      // Insert gap markers where ESP was offline
      dataBuffer.value = insertGapMarkers(rawPoints, medianIntervalMs)
    } else {
      dataBuffer.value = []
      medianIntervalMs = 0
    }

    // Extract stats (8.0-D) — stats are nested in response.stats
    if (statsResponse?.stats && typeof statsResponse.stats.avg_value === 'number') {
      stats.value = {
        min: statsResponse.stats.min_value ?? 0,
        max: statsResponse.stats.max_value ?? 0,
        avg: statsResponse.stats.avg_value,
        stdDev: statsResponse.stats.std_dev ?? 0,
        count: statsResponse.stats.reading_count ?? dataBuffer.value.length,
      }
    } else {
      stats.value = null
    }
  } catch (err: any) {
    error.value = err?.response?.data?.detail || 'Daten konnten nicht geladen werden'
    dataBuffer.value = []
    stats.value = null
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

watch(selectedRange, () => {
  isZoomed.value = false
  loadData()
})

// Watch for live sensor data updates and append
// Filter by sensor_type to avoid cross-updates on multi-value sensors (e.g., SHT31 temp vs humidity)
watch(
  () => {
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
    const sensors = (device?.sensors as any[]) || []
    const sensor = sensors.find(s => s.gpio === props.gpio && s.sensor_type === props.sensorType)
    return sensor?.last_read
  },
  () => {
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
    const sensors = (device?.sensors as any[]) || []
    const sensor = sensors.find(s => s.gpio === props.gpio && s.sensor_type === props.sensorType)
    if (sensor && typeof sensor.raw_value === 'number') {
      const newTimestamp = new Date(sensor.last_read || Date.now())
      const newValue = sensor.raw_value

      // Gap check for live append (8.0-C)
      const currentBuffer = dataBuffer.value
      const maxPoints = selectedRange.value === '7d' ? 2000 : 1000
      const newBuffer = [...currentBuffer]

      if (newBuffer.length > 0 && medianIntervalMs > 0) {
        const lastPoint = newBuffer[newBuffer.length - 1]
        if (lastPoint.value !== null) {
          const timeDiff = newTimestamp.getTime() - lastPoint.timestamp.getTime()
          if (timeDiff > medianIntervalMs * GAP_THRESHOLD_MULTIPLIER) {
            newBuffer.push({ timestamp: new Date(lastPoint.timestamp.getTime() + 1), value: null })
          }
        }
      }

      newBuffer.push({ timestamp: newTimestamp, value: newValue })
      if (newBuffer.length > maxPoints) newBuffer.shift()
      dataBuffer.value = newBuffer
    }
  }
)

// =============================================================================
// Zoom Controls (8.0-A)
// =============================================================================
function resetZoom() {
  const chart = chartRef.value?.chart as any
  if (chart?.resetZoom) {
    chart.resetZoom()
    isZoomed.value = false
  }
}

// =============================================================================
// Format helper (8.0-D)
// =============================================================================
function formatStatValue(val: number): string {
  return val.toFixed(2).replace('.', ',')
}

// =============================================================================
// Chart Configuration
// =============================================================================
const chartData = computed(() => {
  const labels = dataBuffer.value.map(d => d.timestamp)
  const datasets: any[] = []

  // MIN/MAX band for aggregated data (rendered as filled area between min and max)
  const hasMinMax = isAggregated.value && dataBuffer.value.some(d => d.minValue != null)

  if (hasMinMax) {
    // Max line (upper bound of band)
    datasets.push({
      label: 'Max',
      data: dataBuffer.value.map(d => d.maxValue ?? d.value),
      borderColor: 'transparent',
      backgroundColor: `${props.color}10`,
      borderWidth: 0,
      pointRadius: 0,
      tension: 0.3,
      fill: '+1', // Fill down to the next dataset (min)
      spanGaps: false,
    })
    // Min line (lower bound of band)
    datasets.push({
      label: 'Min',
      data: dataBuffer.value.map(d => d.minValue ?? d.value),
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      borderWidth: 0,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
      spanGaps: false,
    })
  }

  // Main avg line (always present)
  datasets.push({
    label: 'Avg',
    data: dataBuffer.value.map(d => d.value),
    borderColor: props.color,
    backgroundColor: hasMinMax ? 'transparent' : `${props.color}1a`,
    borderWidth: 2,
    pointRadius: 0,
    pointHitRadius: 8,
    tension: 0.3,
    fill: !hasMinMax,
    spanGaps: false, // Break line at null values (8.0-C)
  })

  return { labels, datasets }
})

const resolvedAnnotations = computed(() => {
  const annotations: Record<string, any> = {}

  if (props.showThresholds && props.thresholds) {
    const alarmLow = toFiniteNumber(props.thresholds.alarmLow)
    const warnLow = toFiniteNumber(props.thresholds.warnLow)
    const warnHigh = toFiniteNumber(props.thresholds.warnHigh)
    const alarmHigh = toFiniteNumber(props.thresholds.alarmHigh)

    if (alarmLow != null) {
      annotations.alarmLow = {
        type: 'line',
        yMin: alarmLow,
        yMax: alarmLow,
        borderColor: 'rgba(239, 68, 68, 0.6)',
        borderWidth: 1,
        borderDash: [4, 4],
        borderCapStyle: 'butt',
        label: {
          display: true,
          content: `Alarm \u2193 ${alarmLow}`,
          position: 'start',
          font: { size: 9, family: 'JetBrains Mono' },
          color: 'rgba(239, 68, 68, 0.8)',
          backgroundColor: 'transparent',
        },
      }
    }

    if (warnLow != null) {
      annotations.warnLow = {
        type: 'line',
        yMin: warnLow,
        yMax: warnLow,
        borderColor: 'rgba(234, 179, 8, 0.5)',
        borderWidth: 1,
        borderDash: [4, 4],
        borderCapStyle: 'butt',
      }
    }

    if (warnHigh != null) {
      annotations.warnHigh = {
        type: 'line',
        yMin: warnHigh,
        yMax: warnHigh,
        borderColor: 'rgba(234, 179, 8, 0.5)',
        borderWidth: 1,
        borderDash: [4, 4],
        borderCapStyle: 'butt',
      }
    }

    if (alarmHigh != null) {
      annotations.alarmHigh = {
        type: 'line',
        yMin: alarmHigh,
        yMax: alarmHigh,
        borderColor: 'rgba(239, 68, 68, 0.6)',
        borderWidth: 1,
        borderDash: [4, 4],
        borderCapStyle: 'butt',
        label: {
          display: true,
          content: `Alarm \u2191 ${alarmHigh}`,
          position: 'start',
          font: { size: 9, family: 'JetBrains Mono' },
          color: 'rgba(239, 68, 68, 0.8)',
          backgroundColor: 'transparent',
        },
      }
    }
  }

  // Stats Avg annotation line (8.0-D) — subtler than thresholds
  const avgValue = toFiniteNumber(stats.value?.avg)
  if (avgValue != null) {
    annotations.avgLine = {
      type: 'line',
      yMin: avgValue,
      yMax: avgValue,
      borderColor: 'rgba(176, 176, 192, 0.4)',
      borderWidth: 1,
      borderDash: [6, 3],
      borderCapStyle: 'butt',
      label: {
        display: true,
        content: `Avg: ${formatStatValue(avgValue)}${props.unit ? ' ' + props.unit : ''}`,
        position: 'end',
        font: { size: 9, family: 'JetBrains Mono' },
        color: 'rgba(176, 176, 192, 0.7)',
        backgroundColor: 'rgba(10, 10, 15, 0.6)',
        padding: { top: 2, bottom: 2, left: 4, right: 4 },
      },
    }
  }

  // VPD zone background bands (PB-01)
  // Only active when sensorType is 'vpd'. Box annotations do NOT affect
  // Y-axis scaling — Chart.js auto-scales to actual data range.
  if (props.sensorType === 'vpd') {
    annotations.vpdZoneLow = {
      type: 'box' as const,
      yMin: 0.0, yMax: 0.4,
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderWidth: 0,
      label: { display: false },
    }
    annotations.vpdZoneSubLow = {
      type: 'box' as const,
      yMin: 0.4, yMax: 0.8,
      backgroundColor: 'rgba(234,179,8,0.08)',
      borderWidth: 0,
      label: { display: false },
    }
    annotations.vpdZoneOptimal = {
      type: 'box' as const,
      yMin: 0.8, yMax: 1.2,
      backgroundColor: 'rgba(34,197,94,0.10)',
      borderWidth: 0,
      label: { display: false },
    }
    annotations.vpdZoneSubHigh = {
      type: 'box' as const,
      yMin: 1.2, yMax: 1.6,
      backgroundColor: 'rgba(234,179,8,0.08)',
      borderWidth: 0,
      label: { display: false },
    }
    annotations.vpdZoneHigh = {
      type: 'box' as const,
      yMin: 1.6, yMax: 3.0,
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderWidth: 0,
      label: { display: false },
    }
  }

  return annotations
})

const hasResolvedAnnotations = computed(() => Object.keys(resolvedAnnotations.value).length > 0)

const chartPlugins = computed(() => (
  hasResolvedAnnotations.value ? [annotationPlugin] : []
))

const chartOptions = computed(() => {
  const safeAnnotations = hasResolvedAnnotations.value ? resolvedAnnotations.value : {}

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
        titleColor: tokens.textSecondary,
        bodyColor: tokens.textPrimary,
        padding: 8,
        filter: (item: any) => {
          // Hide Min/Max from tooltip — only show Avg
          return item.dataset.label === 'Avg' || !item.dataset.label
        },
        callbacks: {
          label: (ctx: any) => {
            if (ctx.parsed.y == null) return ''
            const suffix = props.unit ? ' ' + props.unit : ''
            const val = `${ctx.parsed.y?.toFixed(2)}${suffix}`
            if (!isAggregated.value) return val
            // Show min/max range for aggregated data
            const idx = ctx.dataIndex
            const point = dataBuffer.value[idx]
            if (point?.minValue != null && point?.maxValue != null) {
              return `Avg: ${val}  (${point.minValue.toFixed(1)}–${point.maxValue.toFixed(1)}${suffix})`
            }
            return val
          },
        },
      },
      // Keep annotation plugin/options disabled unless we have valid annotations.
      ...(hasResolvedAnnotations.value ? { annotation: { annotations: safeAnnotations } } : {}),
      // Zoom/Pan (8.0-A)
      zoom: {
        pan: {
          enabled: true,
          mode: 'x' as const,
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: 'x' as const,
          onZoom: () => { isZoomed.value = true },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        display: true,
        time: {
          displayFormats: {
            minute: 'HH:mm',
            hour: 'HH:mm',
            day: 'dd.MM.',
          },
        },
        grid: { display: true, color: 'rgba(29, 29, 42, 0.8)' },
        ticks: {
          color: tokens.textMuted,
          font: { family: 'JetBrains Mono', size: 10 },
          maxTicksLimit: 8,
          autoSkip: true,
          maxRotation: 0,
        },
        border: { display: false },
      },
      y: {
        display: true,
        grid: { display: true, color: 'rgba(29, 29, 42, 0.8)' },
        ticks: {
          color: tokens.textMuted,
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
          v-for="range in ['1h', '6h', '24h', '7d', '30d']"
          :key="range"
          :class="['historical-chart__range-btn', { 'historical-chart__range-btn--active': selectedRange === range }]"
          @click="selectedRange = range as any"
        >
          {{ range }}
        </button>
      </div>
      <div class="historical-chart__header-right">
        <button
          v-if="isZoomed"
          class="historical-chart__reset-zoom"
          title="Zoom zurücksetzen"
          @click="resetZoom"
        >
          <RotateCcw :size="14" />
        </button>
        <span v-if="dataBuffer.length > 0" class="historical-chart__count">
          {{ dataBuffer.length }} Datenpunkte
        </span>
      </div>
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
        ref="chartRef"
        :data="chartData"
        :options="chartOptions"
        :plugins="chartPlugins"
      />
    </div>

    <!-- Stats Overlay (8.0-D) -->
    <div v-if="stats && !loading" class="historical-chart__stats">
      <span class="historical-chart__stat">
        Min: {{ formatStatValue(stats.min) }}{{ unit ? ' ' + unit : '' }}
      </span>
      <span class="historical-chart__stat">
        Avg: {{ formatStatValue(stats.avg) }}{{ unit ? ' ' + unit : '' }}
      </span>
      <span class="historical-chart__stat">
        Max: {{ formatStatValue(stats.max) }}{{ unit ? ' ' + unit : '' }}
      </span>
      <span class="historical-chart__stat historical-chart__stat--muted">
        &sigma; {{ formatStatValue(stats.stdDev) }} &middot; {{ stats.count }} Punkte
      </span>
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

.historical-chart__header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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

.historical-chart__reset-zoom {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(133, 133, 160, 0.3);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.historical-chart__reset-zoom:hover {
  border-color: var(--color-iridescent-1);
  color: var(--color-iridescent-1);
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

/* Stats overlay (8.0-D) */
.historical-chart__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
}

.historical-chart__stat {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.historical-chart__stat--muted {
  color: var(--color-text-muted);
  margin-left: auto;
}
</style>
