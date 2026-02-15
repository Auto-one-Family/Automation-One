<script setup lang="ts">
/**
 * LiveLineChart Component
 *
 * Generic line chart for live data visualization.
 * Design-token-consistent dark theme, responsive, with live update support.
 */

import { computed, watch, shallowRef } from 'vue'
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale
)

export interface ChartDataPoint {
  timestamp: string | Date
  value: number
  label?: string
}

interface Props {
  /** Initial data points */
  data?: ChartDataPoint[]
  /** Maximum data points before oldest are removed */
  maxDataPoints?: number
  /** Chart accent color (CSS var or hex) */
  color?: string
  /** Show grid lines */
  showGrid?: boolean
  /** Container height */
  height?: string
  /** Y-axis unit suffix */
  unit?: string
  /** Show area fill under line */
  fill?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  maxDataPoints: 50,
  color: '#3b82f6',
  showGrid: true,
  height: '200px',
  unit: '',
  fill: true,
})

// Internal data buffer
const dataBuffer = shallowRef<ChartDataPoint[]>([...props.data])

// Watch for prop changes
watch(() => props.data, (newData) => {
  dataBuffer.value = [...newData].slice(-props.maxDataPoints)
}, { deep: true })

const chartData = computed(() => ({
  labels: dataBuffer.value.map(d =>
    d.timestamp instanceof Date ? d.timestamp : new Date(d.timestamp)
  ),
  datasets: [{
    data: dataBuffer.value.map(d => d.value),
    borderColor: props.color,
    backgroundColor: props.fill
      ? `${props.color}1a`  // 10% opacity
      : 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    pointHitRadius: 8,
    tension: 0.3,
    fill: props.fill,
  }],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
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
        label: (ctx: any) => `${ctx.parsed.y}${props.unit ? ' ' + props.unit : ''}`,
      },
    },
  },
  scales: {
    x: {
      type: 'time' as const,
      display: true,
      grid: {
        display: props.showGrid,
        color: 'rgba(29, 29, 42, 0.8)',
      },
      ticks: {
        color: '#484860',
        font: { family: 'JetBrains Mono', size: 10 },
        maxTicksLimit: 6,
      },
      border: { display: false },
    },
    y: {
      display: true,
      grid: {
        display: props.showGrid,
        color: 'rgba(29, 29, 42, 0.8)',
      },
      ticks: {
        color: '#484860',
        font: { family: 'JetBrains Mono', size: 10 },
        callback: (val: any) => `${val}${props.unit ? ' ' + props.unit : ''}`,
      },
      border: { display: false },
    },
  },
}))

/**
 * Add a single data point (for live updates).
 * Removes oldest point if maxDataPoints exceeded.
 */
function addDataPoint(point: ChartDataPoint): void {
  const newBuffer = [...dataBuffer.value, point]
  if (newBuffer.length > props.maxDataPoints) {
    newBuffer.shift()
  }
  dataBuffer.value = newBuffer
}

/**
 * Clear all data points.
 */
function clear(): void {
  dataBuffer.value = []
}

defineExpose({ addDataPoint, clear })
</script>

<template>
  <div class="live-line-chart" :style="{ height }">
    <Line
      :data="chartData"
      :options="chartOptions"
    />
  </div>
</template>

<style scoped>
.live-line-chart {
  position: relative;
  width: 100%;
}
</style>
