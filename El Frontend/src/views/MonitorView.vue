<script setup lang="ts">
defineOptions({ name: 'MonitorView' })

/**
 * MonitorView — Sensor & Actuator Live Monitoring
 *
 * Route: /monitor, /monitor/:zoneId
 *
 * Live data view with 3 levels (read-only, no configuration):
 * L1 /monitor — Zone tiles with KPI aggregation + cross-zone dashboard links
 * L2 /monitor/:zoneId — Subzone accordion with sensor/actuator cards (read-only)
 * L3 SlideOver — Sensor detail with historical time series
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useSwipeNavigation } from '@/composables/useSwipeNavigation'
import { useEspStore } from '@/stores/esp'
import { useZoneStore } from '@/shared/stores/zone.store'
import { useDeviceContextStore } from '@/shared/stores/deviceContext.store'
import { useZoneGrouping } from '@/composables/useZoneGrouping'
import { useZoneKPIs } from '@/composables/useZoneKPIs'
import type { ZoneHealthStatus } from '@/composables/useZoneKPIs'
import { useSubzoneResolver } from '@/composables/useSubzoneResolver'
import { useSparklineCache } from '@/composables/useSparklineCache'
import { useWebSocket } from '@/composables/useWebSocket'
import {
  createMonitorRecoveryOrchestrator,
  resolveMonitorConnectivityState,
  resolveMonitorDataMode,
} from '@/composables/monitorConnectivity'
import { getSensorLabel, getSensorUnit, SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'
import { useDashboardStore } from '@/shared/stores/dashboard.store'
import { useLogicStore } from '@/shared/stores/logic.store'
import { formatRelativeTime, formatDate, qualityToStatus, DATA_STALE_THRESHOLD_S } from '@/utils/formatters'
import { calculateTrend } from '@/utils/trendUtils'
import type { TrendDirection } from '@/utils/trendUtils'
import { sensorsApi } from '@/api/sensors'
import { zonesApi } from '@/api/zones'
import type { SensorReading, SensorStats } from '@/types'
import type { ZoneMonitorData } from '@/types/monitor'
import type { SensorWithContext, ActuatorWithContext } from '@/composables/useZoneGrouping'
import { Download, Clock, TrendingUp, TrendingDown, Minus, ListFilter } from 'lucide-vue-next'
import ZoneTileCard from '@/components/monitor/ZoneTileCard.vue'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import TimeRangeSelector, { type TimePreset } from '@/components/charts/TimeRangeSelector.vue'
import { Line } from 'vue-chartjs'
import LiveLineChart, { type ThresholdConfig } from '@/components/charts/LiveLineChart.vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js'
import type { TooltipItem } from 'chart.js'
import 'chartjs-adapter-date-fns'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, TimeScale, Filler,
)
import {
  ArrowLeft, Activity, AlertTriangle,
  ChevronLeft, ChevronRight,
} from 'lucide-vue-next'
import type { MockSensor } from '@/types'
import ViewTabBar from '@/components/common/ViewTabBar.vue'
import SensorCard from '@/components/devices/SensorCard.vue'
import ActuatorCard from '@/components/devices/ActuatorCard.vue'
import SharedSensorRefCard from '@/components/devices/SharedSensorRefCard.vue'
import DashboardViewer from '@/components/dashboard/DashboardViewer.vue'
import InlineDashboardPanel from '@/components/dashboard/InlineDashboardPanel.vue'
import BaseSkeleton from '@/shared/design/primitives/BaseSkeleton.vue'
import ErrorState from '@/shared/design/patterns/ErrorState.vue'
import ZoneRulesSection from '@/components/monitor/ZoneRulesSection.vue'
import QuickActionBall from '@/components/quick-action/QuickActionBall.vue'
import AddWidgetDialog from '@/components/monitor/AddWidgetDialog.vue'
import { getChartColors } from '@/utils/chartColors'
import { tokens } from '@/utils/cssTokens'

const router = useRouter()
const route = useRoute()
const espStore = useEspStore()
const zoneStore = useZoneStore()
const deviceContextStore = useDeviceContextStore()
const dashStore = useDashboardStore()
const logicStore = useLogicStore()
const monitorWs = useWebSocket({ autoConnect: true, autoReconnect: true })
// =============================================================================
// L1 Zone KPIs (extracted composable)
// =============================================================================

const selectedZoneFilter = ref<string | null>(null)

const {
  zoneKPIs,
  filteredZoneKPIs,
  isZoneStale,
  allZones,
  zoneApiDegraded,
  lastZoneApiSuccessAt,
} = useZoneKPIs({ filter: selectedZoneFilter })

const zoneFilterOptions = computed(() => {
  const fromEntities = zoneStore.zoneEntities.map(zone => ({
    zoneId: zone.zone_id,
    name: zone.name || zone.zone_id,
    archived: zone.status === 'archived',
  }))
  if (fromEntities.length > 0) {
    return fromEntities
  }
  // Fallback: render zone names from KPI data when ZoneEntity list is not available yet.
  return zoneKPIs.value.map(zone => ({
    zoneId: zone.zoneId,
    name: zone.zoneName || zone.zoneId,
    archived: false,
  }))
})

const activeZoneFilterOptions = computed(() =>
  zoneFilterOptions.value.filter(zone => !zone.archived),
)

const archivedZoneFilterOptions = computed(() =>
  zoneFilterOptions.value.filter(zone => zone.archived),
)

const isArchivedZoneSelected = computed(() => {
  if (!selectedZoneFilter.value) return false
  return archivedZoneFilterOptions.value.some(zone => zone.zoneId === selectedZoneFilter.value)
})

const isZoneFilterActive = computed(() => selectedZoneFilter.value !== null)


// =============================================================================
// L2 Subzone Filter
// =============================================================================

const selectedSubzoneFilter = ref<string | null>(null)

const filteredSubzones = computed(() => {
  if (!selectedSubzoneFilter.value) return zoneDeviceGroup.value
  return zoneDeviceGroup.value.filter(sz => sz.subzoneId === selectedSubzoneFilter.value)
})

/** Unique subzone list for the L2 filter dropdown */
const availableSubzones = computed(() => {
  return zoneDeviceGroup.value.map(sz => ({ id: sz.subzoneId, name: sz.subzoneName }))
})

const selectedZoneId = computed(() => (route.params.zoneId as string) || null)
const selectedSensorId = computed(() => (route.params.sensorId as string) || null)
const selectedDashboardId = computed(() => (route.params.dashboardId as string) || null)
const isDashboardView = computed(() => !!selectedDashboardId.value)
const isZoneDetail = computed(() => !!selectedZoneId.value)

// Expanded sensor card state (for inline 1h chart)
const expandedSensorKey = ref<string | null>(null)

// Sensor key helper (from sparkline cache composable)
const { sparklineCache, getSensorKey, loadInitialData: loadSparklineHistory } = useSparklineCache()


// Zone monitor data (API primary, fallback via useZoneGrouping)
const zoneMonitorData = ref<ZoneMonitorData | null>(null)
const zoneMonitorLoading = ref(false)
const zoneMonitorError = ref<string | null>(null)
const zoneMonitorAbort = ref<AbortController | null>(null)
const lastZoneMonitorApiSuccessAt = ref<number | null>(null)
const lastDetailApiSuccessAt = ref<number | null>(null)

// Subzone resolver for fallback (GPIO → subzone map) — lazy: only triggered on API error
const subzoneResolver = useSubzoneResolver(selectedZoneId, { lazy: true })

// Zone grouping composable (fallback when API fails)
const { sensorsByZone, actuatorsByZone } = useZoneGrouping({
  subzoneResolver: subzoneResolver.resolverMap,
})

function toggleExpanded(sensorKey: string) {
  const wasExpanded = expandedSensorKey.value === sensorKey
  expandedSensorKey.value = wasExpanded ? null : sensorKey
  if (!wasExpanded) {
    fetchExpandedChartData(sensorKey)
  }
}

// =============================================================================
// Sparkline: Default thresholds from SENSOR_TYPE_CONFIG
// =============================================================================

function getDefaultThresholds(sensorType: string): ThresholdConfig | undefined {
  const config = SENSOR_TYPE_CONFIG[sensorType]
  if (config == null || config.min == null || config.max == null) return undefined

  const range = config.max - config.min
  return {
    alarmLow: config.min + range * 0.1,
    warnLow: config.min + range * 0.2,
    warnHigh: config.max - range * 0.2,
    alarmHigh: config.max - range * 0.1,
  }
}

// =============================================================================
// Trend calculation from sparkline data
// =============================================================================

const MIN_TREND_POINTS = 5

function getSensorTrend(espId: string, gpio: number, sensorType?: string): TrendDirection | undefined {
  const key = getSensorKey(espId, gpio, sensorType)
  const points = sparklineCache.value.get(key)
  if (!points || points.length < MIN_TREND_POINTS) return undefined
  return calculateTrend(points, sensorType).direction
}

// =============================================================================
// Chart colors (shared between expanded panel + L3 overlay)
// =============================================================================

function getChartColor(index: number): string {
  const palette = getChartColors()
  if (palette.length === 0) return tokens.accent || tokens.info
  return palette[index % palette.length] || tokens.accent || tokens.info
}

// =============================================================================
// Expanded Panel: 1h Chart with Initial Fetch
// =============================================================================

const expandedChartLoading = ref(false)
const expandedChartReadings = ref<SensorReading[]>([])

async function fetchExpandedChartData(sensorKey: string) {
  // Parse sensorKey format: "{espId}-{gpio}-{sensorType}" or legacy "{espId}-{gpio}"
  const parts = sensorKey.split('-')
  if (parts.length < 2) return

  // sensor_type is the last part if 3+ segments and not a number
  let sensorType: string | undefined
  const lastPart = parts[parts.length - 1]
  if (parts.length >= 3 && isNaN(parseInt(lastPart, 10))) {
    sensorType = lastPart
    parts.pop()
  }
  const gpio = parseInt(parts[parts.length - 1], 10)
  const espId = parts.slice(0, -1).join('-')
  if (isNaN(gpio)) return

  expandedChartLoading.value = true
  expandedChartReadings.value = []
  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const response = await sensorsApi.queryData({
      esp_id: espId,
      gpio,
      sensor_type: sensorType || undefined,
      start_time: oneHourAgo.toISOString(),
      end_time: now.toISOString(),
      limit: 500,
    })
    expandedChartReadings.value = response.readings ?? []
  } catch {
    expandedChartReadings.value = []
  } finally {
    expandedChartLoading.value = false
  }
}

/** Resolve unit for the currently expanded sensor (avoids duplication in chartData + chartOptions) */
const expandedSensorUnit = computed(() => {
  if (!expandedSensorKey.value) return ''
  const keyParts = expandedSensorKey.value.split('-')

  // Extract sensor_type from key if present (last part, non-numeric)
  let sensorType: string | undefined
  const lastPart = keyParts[keyParts.length - 1]
  if (keyParts.length >= 3 && isNaN(parseInt(lastPart, 10))) {
    sensorType = lastPart
    keyParts.pop()
  }
  const gpio = parseInt(keyParts[keyParts.length - 1], 10)
  const espId = keyParts.slice(0, -1).join('-')

  for (const sz of zoneDeviceGroup.value) {
    const found = sz.sensors.find(s =>
      s.esp_id === espId && s.gpio === gpio && (!sensorType || s.sensor_type === sensorType)
    )
    if (found) {
      return getSensorUnit(found.sensor_type) !== 'raw' ? getSensorUnit(found.sensor_type) : (found.unit || '')
    }
  }
  return ''
})

const expandedChartData = computed(() => {
  if (!expandedChartReadings.value.length) return { datasets: [] }

  const unit = expandedSensorUnit.value

  return {
    datasets: [{
      label: unit ? `Letzte Stunde (${unit})` : 'Letzte Stunde',
      data: expandedChartReadings.value.map(r => ({
        x: new Date(r.timestamp).getTime(),
        y: r.processed_value ?? r.raw_value,
      })),
      borderColor: getChartColor(0),
      backgroundColor: `${getChartColor(0)}20`,
      borderWidth: 2,
      pointRadius: expandedChartReadings.value.length > 100 ? 0 : 2,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: true,
    }],
  }
})

const expandedChartOptions = computed(() => {
  const unit = expandedSensorUnit.value

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tokens.backdropColor,
        borderColor: tokens.glassBorder,
        borderWidth: 1,
        titleFont: { family: 'JetBrains Mono', size: 11 },
        bodyFont: { family: 'JetBrains Mono', size: 12 },
        titleColor: tokens.textSecondary,
        bodyColor: tokens.textPrimary,
        padding: 10,
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => {
            if (!items.length) return ''
            return new Date(items[0].parsed.x ?? 0).toLocaleString('de-DE')
          },
          label: (item: TooltipItem<'line'>) => ` ${item.parsed.y?.toFixed(2)} ${unit}`,
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm' },
        },
        grid: { color: tokens.glassBorder },
        ticks: { color: tokens.textMuted, font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 6 },
        border: { display: false },
      },
      y: {
        grid: { color: tokens.glassBorder },
        ticks: {
          color: getChartColor(0),
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (val: string | number) => `${val} ${unit}`,
        },
        border: { display: false },
      },
    },
  }
})

// =============================================================================
// Level 3: Sensor Detail SlideOver
// =============================================================================

interface DetailSensor {
  espId: string
  gpio: number
  sensorType: string
  name: string
  unit: string
}

const showSensorDetail = ref(false)
const selectedDetailSensor = ref<DetailSensor | null>(null)
const detailPreset = ref<TimePreset>('24h')
const detailStartTime = ref(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
const detailEndTime = ref(new Date().toISOString())
const detailReadings = ref<SensorReading[]>([])
const detailLoading = ref(false)
const detailError = ref('')

// Multi-sensor overlay state
const overlaySensorIds = ref<string[]>([])
const overlaySensorReadings = ref<Map<string, SensorReading[]>>(new Map())
const overlayLoading = ref<Set<string>>(new Set())
const MAX_OVERLAY_SENSORS = 4

function openSensorDetail(sensor: { esp_id: string; gpio: number; sensor_type: string; name: string | null; unit: string }) {
  const sensorName = sensor.name || sensor.sensor_type
  selectedDetailSensor.value = {
    espId: sensor.esp_id,
    gpio: sensor.gpio,
    sensorType: sensor.sensor_type,
    name: sensorName,
    unit: getSensorUnit(sensor.sensor_type) !== 'raw' ? getSensorUnit(sensor.sensor_type) : (sensor.unit || ''),
  }
  showSensorDetail.value = true
  fetchDetailData()

  // URL-sync: update URL to /monitor/:zoneId/sensor/:sensorId
  if (selectedZoneId.value) {
    const sensorId = `${sensor.esp_id}-gpio${sensor.gpio}`
    dashStore.breadcrumb.sensorName = sensorName
    router.replace({
      name: 'monitor-sensor',
      params: { zoneId: selectedZoneId.value, sensorId },
    })
  }
}

function closeSensorDetail() {
  showSensorDetail.value = false

  // URL-sync: go back to /monitor/:zoneId
  if (selectedZoneId.value) {
    dashStore.breadcrumb.sensorName = ''
    router.replace({ name: 'monitor-zone', params: { zoneId: selectedZoneId.value } })
  }

  setTimeout(() => {
    selectedDetailSensor.value = null
    detailReadings.value = []
    // Clear overlay state
    overlaySensorIds.value = []
    overlaySensorReadings.value = new Map()
    overlayLoading.value = new Set()
  }, 300)
}

function onDetailRangeChange(payload: { start: string; end: string }) {
  detailStartTime.value = payload.start
  detailEndTime.value = payload.end
  fetchDetailData()
  // Re-fetch overlay sensor data for new time range
  for (const key of overlaySensorIds.value) {
    fetchOverlaySensorData(key)
  }
}

async function fetchDetailData() {
  if (!selectedDetailSensor.value) return
  detailLoading.value = true
  detailError.value = ''
  try {
    const response = await sensorsApi.queryData({
      esp_id: selectedDetailSensor.value.espId,
      gpio: selectedDetailSensor.value.gpio,
      sensor_type: selectedDetailSensor.value.sensorType || undefined,
      start_time: detailStartTime.value,
      end_time: detailEndTime.value,
      limit: 1000,
    })
    detailReadings.value = response.readings ?? []
    lastDetailApiSuccessAt.value = Date.now()
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : 'Fehler beim Laden'
    detailReadings.value = []
  } finally {
    detailLoading.value = false
  }
}

// =============================================================================
// Multi-Sensor Overlay (L3)
// =============================================================================

/** All sensors in current zone except the primary detail sensor (includes sensor_type for multi-value separation) */
const availableOverlaySensors = computed(() => {
  if (zoneDeviceGroup.value.length === 0 || !selectedDetailSensor.value) return []
  const result: { key: string; name: string; type: string; unit: string; espId: string; gpio: number }[] = []
  for (const sz of zoneDeviceGroup.value) {
    for (const s of sz.sensors) {
      // Exclude the primary detail sensor (match by espId + gpio + sensorType)
      if (s.esp_id === selectedDetailSensor.value.espId &&
          s.gpio === selectedDetailSensor.value.gpio &&
          s.sensor_type === selectedDetailSensor.value.sensorType) continue
      const key = s.config_id || `${s.esp_id}-${s.gpio}-${s.sensor_type}`
      result.push({
        key,
        name: s.name || getSensorLabel(s.sensor_type) || `GPIO ${s.gpio}`,
        type: s.sensor_type,
        unit: getSensorUnit(s.sensor_type) !== 'raw' ? getSensorUnit(s.sensor_type) : (s.unit || ''),
        espId: s.esp_id,
        gpio: s.gpio,
      })
    }
  }
  return result
})

async function toggleOverlaySensor(sensorKey: string) {
  const idx = overlaySensorIds.value.indexOf(sensorKey)
  if (idx >= 0) {
    overlaySensorIds.value.splice(idx, 1)
    overlaySensorReadings.value.delete(sensorKey)
    overlayLoading.value.delete(sensorKey)
    return
  }
  if (overlaySensorIds.value.length >= MAX_OVERLAY_SENSORS) return
  overlaySensorIds.value.push(sensorKey)
  await fetchOverlaySensorData(sensorKey)
}

async function fetchOverlaySensorData(sensorKey: string) {
  const parts = sensorKey.split('-')
  if (parts.length < 2) return

  // Extract sensor_type from key if present (last part, non-numeric)
  let sensorType: string | undefined
  const lastPart = parts[parts.length - 1]
  if (parts.length >= 3 && isNaN(parseInt(lastPart, 10))) {
    sensorType = lastPart
    parts.pop()
  }
  const gpio = parseInt(parts[parts.length - 1], 10)
  const espId = parts.slice(0, -1).join('-')
  if (isNaN(gpio)) return

  overlayLoading.value.add(sensorKey)
  try {
    const response = await sensorsApi.queryData({
      esp_id: espId,
      gpio,
      sensor_type: sensorType || undefined,
      start_time: detailStartTime.value,
      end_time: detailEndTime.value,
      limit: 1000,
    })
    overlaySensorReadings.value.set(sensorKey, response.readings ?? [])
  } catch {
    overlaySensorReadings.value.set(sensorKey, [])
  } finally {
    overlayLoading.value.delete(sensorKey)
  }
}

/** Get the chart color for an overlay sensor by its index in overlaySensorIds */
function getOverlayColor(sensorKey: string): string {
  const idx = overlaySensorIds.value.indexOf(sensorKey)
  return getChartColor(idx + 1)
}

const detailChartData = computed(() => {
  const hasMain = detailReadings.value.length > 0
  const hasOverlay = overlaySensorIds.value.length > 0
  if (!hasMain && !hasOverlay) return { datasets: [] }

  const sensor = selectedDetailSensor.value
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datasets: any[] = []

  // Primary sensor dataset
  if (hasMain) {
    datasets.push({
      label: `${sensor?.name ?? 'Sensor'} (${sensor?.unit ?? ''})`,
      data: detailReadings.value.map(r => ({
        x: new Date(r.timestamp).getTime(),
        y: r.processed_value ?? r.raw_value,
      })),
      borderColor: getChartColor(0),
      backgroundColor: `${getChartColor(0)}20`,
      borderWidth: 2,
      pointRadius: detailReadings.value.length > 200 ? 0 : 2,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: true,
      yAxisID: 'y',
    })
  }

  // Overlay sensor datasets
  for (let i = 0; i < overlaySensorIds.value.length; i++) {
    const key = overlaySensorIds.value[i]
    const readings = overlaySensorReadings.value.get(key)
    if (!readings?.length) continue

    const overlaySensor = availableOverlaySensors.value.find(s => s.key === key)
    const color = getChartColor(i + 1)
    const sameUnit = overlaySensor?.unit === sensor?.unit

    datasets.push({
      label: `${overlaySensor?.name ?? key} (${overlaySensor?.unit ?? ''})`,
      data: readings.map(r => ({
        x: new Date(r.timestamp).getTime(),
        y: r.processed_value ?? r.raw_value,
      })),
      borderColor: color,
      backgroundColor: `${color}10`,
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.3,
      fill: false,
      yAxisID: sameUnit ? 'y' : 'y1',
    })
  }

  return { datasets }
})

const detailChartOptions = computed(() => {
  const unit = selectedDetailSensor.value?.unit ?? ''
  const hasOverlays = overlaySensorIds.value.length > 0

  // Check if any overlay sensor has a different unit → needs secondary y-axis
  const needsSecondaryAxis = overlaySensorIds.value.some(key => {
    const s = availableOverlaySensors.value.find(os => os.key === key)
    return s && s.unit !== unit
  })
  const secondaryUnit = needsSecondaryAxis
    ? (availableOverlaySensors.value.find(s => overlaySensorIds.value.includes(s.key) && s.unit !== unit)?.unit ?? '')
    : ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scales: any = {
    x: {
      type: 'time' as const,
      time: {
        displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' },
      },
      grid: { color: tokens.glassBorder },
      ticks: { color: tokens.textMuted, font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 },
      border: { display: false },
    },
    y: {
      grid: { color: tokens.glassBorder },
      ticks: {
        color: getChartColor(0),
        font: { family: 'JetBrains Mono', size: 10 },
        callback: (val: string | number) => `${val} ${unit}`,
      },
      border: { display: false },
      // SENSOR_TYPE_CONFIG Y-axis defaults (suggestedMin/suggestedMax)
      ...(detailSensorTypeConfig.value ? {
        suggestedMin: detailSensorTypeConfig.value.min,
        suggestedMax: detailSensorTypeConfig.value.max,
      } : {}),
    },
  }

  if (needsSecondaryAxis) {
    scales.y1 = {
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: {
        color: getChartColor(1),
        font: { family: 'JetBrains Mono', size: 10 },
        callback: (val: string | number) => `${val} ${secondaryUnit}`,
      },
      border: { display: false },
    }
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        display: hasOverlays,
        labels: {
          color: tokens.textSecondary,
          font: { family: 'JetBrains Mono', size: 10 },
          boxWidth: 12,
          boxHeight: 2,
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: tokens.backdropColor,
        borderColor: tokens.glassBorder,
        borderWidth: 1,
        titleFont: { family: 'JetBrains Mono', size: 11 },
        bodyFont: { family: 'JetBrains Mono', size: 12 },
        titleColor: tokens.textSecondary,
        bodyColor: tokens.textPrimary,
        padding: 10,
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => {
            if (!items.length) return ''
            return new Date(items[0].parsed.x ?? 0).toLocaleString('de-DE')
          },
          label: (item: TooltipItem<'line'>) => {
            const dsUnit = item.dataset.label?.match(/\(([^)]*)\)/)?.[1] ?? unit
            return ` ${item.parsed.y?.toFixed(2)} ${dsUnit}`
          },
        },
      },
    },
    scales,
  }
})

function exportDetailCsv() {
  if (!detailReadings.value.length) return
  const sensor = selectedDetailSensor.value
  const unit = sensor?.unit || ''
  const header = 'timestamp,raw_value,processed_value,unit,quality'
  const rows = detailReadings.value.map(r => {
    const processedVal = r.processed_value ?? r.raw_value
    const rowUnit = r.unit || unit
    return `${r.timestamp},${r.raw_value},${processedVal},${rowUnit},${r.quality}`
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sensor-data_${sensor?.espId}_gpio${sensor?.gpio}_${Date.now()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// =============================================================================
// Level 3: Sensor Detail — Live Value, Stats, Trend (Block 1 Polishing)
// =============================================================================

/** Current live value from store (reactive) */
const detailLiveValue = computed(() => {
  if (!selectedDetailSensor.value) return null
  const device = espStore.devices.find(d =>
    espStore.getDeviceId(d) === selectedDetailSensor.value!.espId
  )
  if (!device) return null
  const sensor = (device.sensors as MockSensor[] | undefined)?.find(
    s => s.gpio === selectedDetailSensor.value!.gpio &&
         s.sensor_type === selectedDetailSensor.value!.sensorType
  )
  if (!sensor) return null
  return {
    value: sensor.raw_value,
    quality: sensor.quality ?? 'unknown',
    lastUpdate: sensor.last_reading_at ?? sensor.last_read ?? null,
  }
})

/** SENSOR_TYPE_CONFIG for the detail sensor */
const detailSensorTypeConfig = computed(() => {
  if (!selectedDetailSensor.value) return null
  return SENSOR_TYPE_CONFIG[selectedDetailSensor.value.sensorType] ?? null
})

/** Stale indicator: no update within DATA_STALE_THRESHOLD_S */
const detailIsStale = computed(() => {
  const lastUpdate = detailLiveValue.value?.lastUpdate
  if (!lastUpdate) return false
  return Date.now() - new Date(lastUpdate).getTime() > DATA_STALE_THRESHOLD_S * 1000
})

const detailHistoryLatestAt = computed<string | null>(() => {
  if (detailReadings.value.length === 0) return null
  const newest = detailReadings.value[detailReadings.value.length - 1]
  return newest?.timestamp ?? null
})

const detailHistoryIsStale = computed(() => {
  if (!detailHistoryLatestAt.value) return true
  const ageMs = Date.now() - new Date(detailHistoryLatestAt.value).getTime()
  return ageMs > DATA_STALE_THRESHOLD_S * 1000
})

const overlayHistoryLatest = computed(() => {
  const latest = new Map<string, string | null>()
  for (const key of overlaySensorIds.value) {
    const readings = overlaySensorReadings.value.get(key) ?? []
    latest.set(key, readings.length > 0 ? readings[readings.length - 1].timestamp : null)
  }
  return latest
})

/** Trend calculation from readings (last 10% vs first 10%) */
const detailTrend = computed<'up' | 'down' | 'stable'>(() => {
  const readings = detailReadings.value
  if (readings.length < 4) return 'stable'
  const chunkSize = Math.max(2, Math.floor(readings.length * 0.1))
  const firstChunk = readings.slice(0, chunkSize)
  const lastChunk = readings.slice(-chunkSize)
  const avgFirst = firstChunk.reduce((sum, r) => sum + (r.processed_value ?? r.raw_value), 0) / chunkSize
  const avgLast = lastChunk.reduce((sum, r) => sum + (r.processed_value ?? r.raw_value), 0) / chunkSize
  const diff = avgLast - avgFirst
  const range = detailSensorTypeConfig.value
    ? (detailSensorTypeConfig.value.max - detailSensorTypeConfig.value.min)
    : Math.abs(avgFirst) || 1
  const threshold = range * 0.02
  if (diff > threshold) return 'up'
  if (diff < -threshold) return 'down'
  return 'stable'
})

/** Stats fetched from server API */
const detailStats = ref<SensorStats | null>(null)

async function fetchDetailStats() {
  if (!selectedDetailSensor.value) return
  try {
    const resp = await sensorsApi.getStats(
      selectedDetailSensor.value.espId,
      selectedDetailSensor.value.gpio,
      {
        start_time: detailStartTime.value,
        end_time: detailEndTime.value,
        sensor_type: selectedDetailSensor.value.sensorType,
      },
    )
    detailStats.value = resp.stats
  } catch (e) {
    console.warn('[MonitorView] Failed to fetch sensor stats:', selectedDetailSensor.value?.espId, 'GPIO', selectedDetailSensor.value?.gpio, e)
    detailStats.value = null
  }
}

/** Format a stat value with the detail sensor's unit and decimals */
function formatStatValue(value: number | null): string {
  if (value == null) return '—'
  const decimals = detailSensorTypeConfig.value?.decimals ?? 1
  return value.toFixed(decimals).replace('.', ',')
}

/** Find timestamp of min/max values from readings (client-side fallback) */
const detailMinMaxTimestamps = computed(() => {
  const readings = detailReadings.value
  if (readings.length === 0) return { minAt: null as string | null, maxAt: null as string | null }
  let minVal = Infinity
  let maxVal = -Infinity
  let minAt: string | null = null
  let maxAt: string | null = null
  for (const r of readings) {
    const val = r.processed_value ?? r.raw_value
    if (val < minVal) { minVal = val; minAt = r.timestamp }
    if (val > maxVal) { maxVal = val; maxAt = r.timestamp }
  }
  return { minAt, maxAt }
})

/** Format a timestamp to short time (HH:mm) */
function formatShortTime(ts: string | null): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

/** Sensor config link removed — Monitor is read-only + Subzone-CRUD only */

// Fetch stats whenever detail data is loaded
watch(detailReadings, (readings) => {
  if (readings.length > 0) {
    fetchDetailStats()
  } else {
    detailStats.value = null
  }
})

/**
 * Load device contexts for all mobile/multi_zone sensors (6.7).
 * Iterates over espStore.devices, finds non-zone_local sensors with config_id,
 * and loads their active context from the API.
 */
async function loadMobileDeviceContexts(): Promise<void> {
  if (deviceContextStore.isLoaded) return
  const devices: Array<{ configType: 'sensor' | 'actuator'; configId: string }> = []
  for (const esp of espStore.devices) {
    const sensors = (esp.sensors as MockSensor[]) || []
    for (const sensor of sensors) {
      const s = sensor as MockSensor & { config_id?: string; device_scope?: string }
      if (s.device_scope && s.device_scope !== 'zone_local' && s.config_id) {
        devices.push({ configType: 'sensor', configId: s.config_id })
      }
    }
  }
  if (devices.length > 0) {
    await deviceContextStore.loadContextsForDevices(devices)
  }
}

// Fetch data on mount + deep-link support
onMounted(() => {
  if (espStore.devices.length === 0) {
    espStore.fetchAll()
  }

  // allZones fetch handled by useZoneKPIs composable (onMounted + guarded)

  // Fetch zone entities for filter dropdown (active + archived)
  if (zoneStore.zoneEntities.length === 0) {
    zoneStore.fetchZoneEntities()
  }

  // Fetch logic rules + execution history for ActuatorCard context
  logicStore.fetchRules()
  logicStore.loadExecutionHistory()
  logicStore.subscribeToWebSocket()

  // Load device contexts for mobile/multi_zone sensors (6.7)
  loadMobileDeviceContexts()

  // Update breadcrumb zone name
  if (selectedZoneId.value) {
    dashStore.breadcrumb.zoneName = selectedZoneName.value
  }
})

onUnmounted(() => {
  dashStore.breadcrumb.sensorName = ''
  deactivateScope('monitor-zone')
  unregisterLeft?.()
  unregisterRight?.()
  // Abort any in-flight zone monitor request
  zoneMonitorAbort.value?.abort()
  // KPI debounce timer cleanup handled by useZoneKPIs composable
})

const monitorRecovery = createMonitorRecoveryOrchestrator(async () => {
  await espStore.fetchAll()
  if (selectedZoneId.value) {
    await fetchZoneMonitorData()
  }
  if (showSensorDetail.value && selectedDetailSensor.value) {
    await fetchDetailData()
  }
})

async function runMonitorRecovery(): Promise<void> {
  await monitorRecovery.trigger()
}

watch(
  () => monitorWs.connectionStatus.value,
  (status, prevStatus) => {
    if (status === 'connected' && prevStatus && prevStatus !== 'connected') {
      runMonitorRecovery().catch(() => {
        // Recovery errors surface via existing store/API error channels.
      })
    }
  },
)

// Graceful fallback: redirect to L1 if zone does not exist
// Check both device zones and allZones (includes empty zones from ZoneContext)
watch(
  [selectedZoneId, () => espStore.devices.length, allZones],
  ([zoneId, deviceCount]) => {
    if (!zoneId) return
    const zoneInDevices = espStore.devices.some(d => d.zone_id === zoneId)
    const zoneInApi = allZones.value.some(z => z.zone_id === zoneId)
    if (!zoneInDevices && !zoneInApi && deviceCount > 0) {
      router.replace({ name: 'monitor' })
    }
  },
  { immediate: true },
)

// Deep-link: open sensor detail from URL /monitor/:zoneId/sensor/:sensorId
watch(
  [selectedSensorId, () => espStore.devices.length],
  ([sensorId, deviceCount]) => {
    if (!sensorId || deviceCount === 0 || showSensorDetail.value) return

    // Parse sensorId format: "{espId}-gpio{gpio}"
    const match = sensorId.match(/^(.+)-gpio(\d+)$/)
    if (!match) return

    const [, espId, gpioStr] = match
    const gpio = parseInt(gpioStr, 10)

    // Find the sensor in the current zone
    for (const device of espStore.devices) {
      if (espStore.getDeviceId(device) === espId) {
        const sensor = (device.sensors as MockSensor[] | undefined)?.find(s => s.gpio === gpio)
        if (sensor) {
          openSensorDetail({
            esp_id: espId,
            gpio,
            sensor_type: sensor.sensor_type ?? '',
            name: sensor.name ?? null,
            unit: sensor.unit ?? '',
          })
          break
        }
      }
    }
  },
  { immediate: true },
)

// Zone KPI types + logic: see @/composables/useZoneKPIs

const monitorLastApiSuccessAt = computed(() => {
  const candidates = [
    lastZoneApiSuccessAt.value,
    lastZoneMonitorApiSuccessAt.value,
    lastDetailApiSuccessAt.value,
  ].filter((value): value is number => value != null)
  if (candidates.length === 0) return null
  return Math.max(...candidates)
})

const monitorConnectivityState = computed(() => resolveMonitorConnectivityState({
  wsStatus: monitorWs.connectionStatus.value,
  hasZoneApiError: zoneApiDegraded.value || zoneMonitorError.value != null,
  hasDetailApiError: showSensorDetail.value && detailError.value.length > 0,
  lastApiSuccessAt: monitorLastApiSuccessAt.value,
}))


const monitorSensorCardDataMode = computed(() => resolveMonitorDataMode({
  hasSnapshotBase: !zoneMonitorError.value,
  hasLiveOverlay: true,
  monitorState: monitorConnectivityState.value,
}))

const monitorActuatorCardDataMode = computed(() => resolveMonitorDataMode({
  hasSnapshotBase: !zoneMonitorError.value,
  hasLiveOverlay: true,
  monitorState: monitorConnectivityState.value,
}))

const showActuatorSnapshotWarning = computed(() =>
  monitorConnectivityState.value === 'disconnected' || monitorConnectivityState.value === 'degraded_api',
)

// =============================================================================
// L1 Zone Mini-Widgets (Phase 3)
// =============================================================================

/** Widget types compact enough for ~70px tile height */
const TILE_ALLOWED_WIDGET_TYPES = new Set(['gauge', 'sensor-card'])

/**
 * Returns the first zone-tile dashboard whose widgets are all tile-compatible.
 * Filters on scope='zone-tile' to avoid collision with full zone dashboards.
 * Max 1 panel per tile.
 */
function getZoneMiniPanelId(zoneId: string): string | undefined {
  const panels = dashStore.layouts
    .filter(l => l.scope === 'zone-tile' && l.zoneId === zoneId)
  for (const panel of panels) {
    const allAllowed = panel.widgets.length > 0 &&
      panel.widgets.every(w => TILE_ALLOWED_WIDGET_TYPES.has(w.type))
    if (allAllowed) return panel.id
  }
  return undefined
}

/** Sensor type priority for zone-tile mini-widgets (highest first) */
const TILE_SENSOR_PRIORITY: string[] = [
  'temp', 'humi', 'vpd', 'ph', 'ec', 'co2', 'soil', 'light', 'pressure', 'flow',
]

function getTileSensorPriority(sensorType: string): number {
  const idx = TILE_SENSOR_PRIORITY.findIndex(p => sensorType.includes(p))
  return idx >= 0 ? idx : TILE_SENSOR_PRIORITY.length
}

/**
 * Ensures a tile mini-dashboard exists for the given zone.
 * Creates gauge widgets for the top-2 sensor types (by priority).
 * Uses scope='zone-tile' to avoid collision with generateZoneDashboard().
 * Migrates stale dashboards with wrong widget dimensions (w≠6 or h≠1).
 */
function ensureZoneTileDashboard(zoneId: string, zoneName: string): void {
  // Migrate stale tile dashboards: fix widget dimensions from old versions (w:3,h:3 → w:6,h:1)
  const existingId = getZoneMiniPanelId(zoneId)
  if (existingId) {
    const existing = dashStore.getLayoutById(existingId)
    if (existing) {
      const needsMigration = existing.widgets.some(w => w.w !== 6 || w.h !== 1)
      if (needsMigration) {
        existing.widgets.forEach((w, i) => {
          w.x = i * 6
          w.y = 0
          w.w = 6
          w.h = 1
        })
      }
    }
    return
  }

  // Find sensors in this zone
  const sensors: { espId: string; gpio: number; sensorType: string }[] = []
  for (const device of espStore.devices) {
    if (device.zone_id !== zoneId) continue
    const deviceId = espStore.getDeviceId(device)
    for (const s of (device.sensors || []) as { gpio: number; sensor_type: string }[]) {
      sensors.push({ espId: deviceId, gpio: s.gpio, sensorType: s.sensor_type })
    }
  }
  if (sensors.length === 0) return

  // Pick top-2 sensors by priority (deduplicate by base type)
  const sorted = [...sensors].sort((a, b) => getTileSensorPriority(a.sensorType) - getTileSensorPriority(b.sensorType))
  const picked: typeof sensors = []
  const seenBaseTypes = new Set<string>()
  for (const s of sorted) {
    const base = TILE_SENSOR_PRIORITY.find(p => s.sensorType.includes(p)) ?? s.sensorType
    if (seenBaseTypes.has(base)) continue
    seenBaseTypes.add(base)
    picked.push(s)
    if (picked.length >= 2) break
  }

  // Create layout via store, then set tile-specific properties
  const layout = dashStore.createLayout(`${zoneName} Tile`)
  layout.scope = 'zone-tile'
  layout.zoneId = zoneId
  layout.autoGenerated = true
  layout.target = { view: 'monitor', placement: 'inline' }

  // Add gauge widgets — w:6 h:1 for compact tile sizing (2 side-by-side in 12-col grid)
  for (let i = 0; i < picked.length; i++) {
    const s = picked[i]
    dashStore.addWidget(layout.id, {
      type: 'gauge',
      x: i * 6, y: 0, w: 6, h: 1,
      config: {
        sensorId: `${s.espId}:${s.gpio}:${s.sensorType}`,
        title: getSensorLabel(s.sensorType),
        zoneId,
      },
    })
  }
}

/** Track which zones already have a tile-dashboard (per-zone instead of global guard) */
const ensuredTileZoneIds = new Set<string>()

// =============================================================================
// Level 2: Unified subzone-first device grouping
// =============================================================================

interface ZoneDeviceSubzone {
  subzoneId: string | null
  subzoneName: string
  sensors: SensorWithContext[]
  actuators: ActuatorWithContext[]
}

const zoneDeviceGroup = computed<ZoneDeviceSubzone[]>(() => {
  if (!selectedZoneId.value) return []

  // Primary path: API data (server delivers subzones with sensors + actuators together)
  const data = zoneMonitorData.value
  if (data && !zoneMonitorError.value) {
    // Read espStore.devices to establish reactivity — live values override API snapshot
    const devices = espStore.devices
    return data.subzones.map(sz => ({
      subzoneId: sz.subzone_id,
      subzoneName: sz.subzone_id === null ? 'Zone-weit' : sz.subzone_name,
      sensors: sz.sensors.map(s => {
        const device = devices.find(d => espStore.getDeviceId(d) === s.esp_id)
        const liveSensor = (device?.sensors as MockSensor[] | undefined)?.find(
          (sens) => sens.gpio === s.gpio && sens.sensor_type === s.sensor_type
        )
        const raw_value = liveSensor?.raw_value ?? s.raw_value ?? 0
        const quality = (liveSensor?.quality ?? s.quality) as SensorWithContext['quality']
        const last_read = liveSensor?.last_reading_at ?? liveSensor?.last_read ?? s.last_read ?? null
        return {
          ...s,
          raw_value,
          quality,
          last_read,
          interface_type: liveSensor?.interface_type ?? null,
          zone_id: data.zone_id,
          zone_name: data.zone_name,
          subzone_id: sz.subzone_id,
          subzone_name: sz.subzone_name,
        }
      }) as SensorWithContext[],
      actuators: sz.actuators.map(a => ({
        ...a,
        state: (() => {
          const liveDevice = devices.find(d => espStore.getDeviceId(d) === a.esp_id)
          const liveActuator = (liveDevice?.actuators as ActuatorWithContext[] | undefined)?.find(
            candidate => candidate.gpio === a.gpio,
          )
          return liveActuator?.state ?? a.state
        })(),
        pwm_value: (() => {
          const liveDevice = devices.find(d => espStore.getDeviceId(d) === a.esp_id)
          const liveActuator = (liveDevice?.actuators as ActuatorWithContext[] | undefined)?.find(
            candidate => candidate.gpio === a.gpio,
          )
          return liveActuator?.pwm_value ?? a.pwm_value
        })(),
        emergency_stopped: (() => {
          const liveDevice = devices.find(d => espStore.getDeviceId(d) === a.esp_id)
          const liveActuator = (liveDevice?.actuators as ActuatorWithContext[] | undefined)?.find(
            candidate => candidate.gpio === a.gpio,
          )
          return liveActuator?.emergency_stopped ?? a.emergency_stopped
        })(),
        last_command_at: (() => {
          const liveDevice = devices.find(d => espStore.getDeviceId(d) === a.esp_id)
          const liveActuator = (liveDevice?.actuators as ActuatorWithContext[] | undefined)?.find(
            candidate => candidate.gpio === a.gpio,
          )
          return liveActuator?.last_command_at ?? (a as Partial<ActuatorWithContext>).last_command_at ?? null
        })(),
        esp_state: (() => {
          const liveDevice = devices.find(d => espStore.getDeviceId(d) === a.esp_id)
          return liveDevice?.system_state ?? (a as Partial<ActuatorWithContext>).esp_state
        })(),
        last_seen: (() => {
          const liveDevice = devices.find(d => espStore.getDeviceId(d) === a.esp_id)
          return liveDevice?.last_seen ?? (a as Partial<ActuatorWithContext>).last_seen ?? null
        })(),
        zone_id: data.zone_id,
        zone_name: data.zone_name,
        subzone_id: sz.subzone_id,
        subzone_name: sz.subzone_name,
      })) as ActuatorWithContext[],
    })).sort((a, b) => {
      // Named subzones first (alphabetical), "Zone-weit" (null) at end
      if (a.subzoneId === null) return 1
      if (b.subzoneId === null) return -1
      return (a.subzoneName ?? '').localeCompare(b.subzoneName ?? '')
    })
  }

  // Fallback path: useZoneGrouping + useSubzoneResolver (merge sensors + actuators)
  const sensorGroup = sensorsByZone.value.find(z => z.zoneId === selectedZoneId.value)
  const actuatorGroup = actuatorsByZone.value.find(z => z.zoneId === selectedZoneId.value)
  if (!sensorGroup && !actuatorGroup) return []

  const subzoneMap = new Map<string | null, ZoneDeviceSubzone>()

  for (const sz of sensorGroup?.subzones ?? []) {
    subzoneMap.set(sz.subzoneId, {
      subzoneId: sz.subzoneId,
      subzoneName: sz.subzoneId === null ? 'Zone-weit' : (sz.subzoneName || 'Zone-weit'),
      sensors: sz.sensors as SensorWithContext[],
      actuators: [],
    })
  }

  for (const sz of actuatorGroup?.subzones ?? []) {
    const existing = subzoneMap.get(sz.subzoneId)
    if (existing) {
      existing.actuators = sz.actuators as ActuatorWithContext[]
    } else {
      subzoneMap.set(sz.subzoneId, {
        subzoneId: sz.subzoneId,
        subzoneName: sz.subzoneId === null ? 'Zone-weit' : (sz.subzoneName || 'Zone-weit'),
        sensors: [],
        actuators: sz.actuators as ActuatorWithContext[],
      })
    }
  }

  return Array.from(subzoneMap.values()).sort((a, b) => {
    if (a.subzoneId === null) return 1
    if (b.subzoneId === null) return -1
    return (a.subzoneName ?? '').localeCompare(b.subzoneName ?? '')
  })
})

const selectedZoneName = computed(() => {
  if (!selectedZoneId.value) return ''
  const device = espStore.devices.find(d => d.zone_id === selectedZoneId.value)
  return device?.zone_name || selectedZoneId.value
})

const selectedZoneKpi = computed(() =>
  zoneKPIs.value.find(zone => zone.zoneId === selectedZoneId.value) ?? null,
)

const zoneHealthLabelMap: Record<ZoneHealthStatus, string> = {
  ok: 'Stabil',
  warning: 'Warnung',
  alarm: 'Kritisch',
  empty: 'Leer',
}

const selectedZoneHealthStatus = computed<ZoneHealthStatus | null>(() =>
  selectedZoneKpi.value?.healthStatus ?? null,
)

const selectedZoneHealthLabel = computed(() => {
  const status = selectedZoneHealthStatus.value
  if (status == null) return 'Unbekannt'
  return zoneHealthLabelMap[status]
})

const selectedZoneHealthReason = computed(() =>
  selectedZoneKpi.value?.healthReason ?? null,
)

const zoneSensorCount = computed(() =>
  zoneDeviceGroup.value.reduce((sum, sz) => sum + sz.sensors.length, 0)
)
const zoneActuatorCount = computed(() =>
  zoneDeviceGroup.value.reduce((sum, sz) => sum + sz.actuators.length, 0)
)

/**
 * Shared sensor references for L2 (6.7):
 * Multi-zone sensors from OTHER zones whose assigned_zones includes the current zone.
 */
const sharedSensorRefs = computed(() => {
  if (!selectedZoneId.value) return []
  const zoneId = selectedZoneId.value
  const result: Array<MockSensor & { _homeZoneName: string; _homeZoneId: string; esp_id: string }> = []

  for (const esp of espStore.devices) {
    // Only look at ESPs NOT in the current zone (to avoid duplication)
    if (esp.zone_id === zoneId) continue
    const sensors = (esp.sensors as MockSensor[]) || []
    for (const sensor of sensors) {
      const s = sensor as MockSensor & { device_scope?: string; assigned_zones?: string[] }
      if (
        s.device_scope === 'multi_zone' &&
        s.assigned_zones?.includes(zoneId)
      ) {
        result.push({
          ...sensor,
          _homeZoneName: esp.zone_name || esp.zone_id || '',
          _homeZoneId: esp.zone_id || '',
          esp_id: espStore.getDeviceId(esp),
        })
      }
    }
  }
  return result
})

// Reactive breadcrumb update — when devices load after mount, zone_id → zone_name
watch(selectedZoneName, (name) => {
  if (name && selectedZoneId.value) {
    dashStore.breadcrumb.zoneName = name
  }
})

// Breadcrumb update for dashboard name (match by local ID or server UUID via store getter)
watch(selectedDashboardId, (dashId) => {
  if (dashId) {
    const layout = dashStore.getLayoutById(dashId)
    dashStore.breadcrumb.dashboardName = layout?.name || ''
  } else {
    dashStore.breadcrumb.dashboardName = ''
  }
}, { immediate: true })

// Auto-generate zone dashboard on first visit or auto-update when sensors change
const generatedZoneDashboards = ref<Set<string>>(new Set())

watch(
  [selectedZoneId, () => espStore.devices.length],
  ([zoneId, deviceCount]) => {
    if (!zoneId || deviceCount === 0) return

    const zoneDevices = espStore.devices.filter(d => d.zone_id === zoneId)
    if (zoneDevices.length === 0) return
    const zoneName = zoneDevices[0]?.zone_name || zoneId

    const existingDashboards = dashStore.zoneDashboards(zoneId)

    // Case 1: No dashboard exists — generate on first visit
    if (existingDashboards.length === 0 && !generatedZoneDashboards.value.has(zoneId)) {
      const generated = dashStore.generateZoneDashboard(zoneId, zoneDevices as any, zoneName)
      // Only mark as generated if dashboard was actually created (non-null = has widgets)
      if (generated) {
        generatedZoneDashboards.value.add(zoneId)
      }
      return
    }

    // Case 2: Auto-generated dashboard exists — update if sensor/actuator count changed
    const autoLayout = existingDashboards.find(l => l.autoGenerated)
    if (autoLayout) {
      const totalSensors = zoneDevices.reduce((sum, d) => sum + (d.sensors?.length || 0), 0)
      const totalActuators = zoneDevices.reduce((sum, d) => sum + (d.actuators?.length || 0), 0)
      const currentWidgetCount = autoLayout.widgets.length
      if (totalSensors + totalActuators !== currentWidgetCount) {
        dashStore.generateZoneDashboard(zoneId, zoneDevices as any, zoneName)
      }
    }
  },
  { immediate: true },
)

// Auto-generate tile mini-dashboards for L1 zone tiles (gauge widgets only).
// Per-zone tracking: retries zones whose sensors weren't loaded yet on first trigger.
watch([filteredZoneKPIs, () => espStore.devices.length], ([zones]) => {
  if (zones.length === 0) return
  for (const zone of zones) {
    if (ensuredTileZoneIds.has(zone.zoneId)) continue
    // Only attempt when espStore has sensor data for this zone
    const hasSensors = espStore.devices.some(
      d => d.zone_id === zone.zoneId && (d.sensors?.length ?? 0) > 0,
    )
    if (!hasSensors) continue
    ensuredTileZoneIds.add(zone.zoneId)
    ensureZoneTileDashboard(zone.zoneId, zone.zoneName)
  }
}, { immediate: true })

// Fetch zone monitor data (API primary for L2) with AbortController for race-condition safety
async function fetchZoneMonitorData() {
  const zoneId = selectedZoneId.value
  if (!zoneId) {
    zoneMonitorData.value = null
    zoneMonitorError.value = null
    return
  }
  // Only fetch when zone exists in current devices (avoids 500 for invalid/deep-link zone slugs)
  const zoneExists = espStore.devices.some((d) => d.zone_id === zoneId)
  if (!zoneExists) {
    zoneMonitorData.value = null
    zoneMonitorError.value = null
    return
  }

  // Abort previous in-flight request (race-condition guard on fast zone switches)
  if (zoneMonitorAbort.value) {
    zoneMonitorAbort.value.abort()
  }
  const controller = new AbortController()
  zoneMonitorAbort.value = controller

  zoneMonitorLoading.value = true
  zoneMonitorError.value = null
  try {
    const data = await zonesApi.getZoneMonitorData(zoneId, controller.signal)
    zoneMonitorData.value = data
    lastZoneMonitorApiSuccessAt.value = Date.now()
  } catch (e) {
    // Ignore AbortError — expected when user switches zones quickly
    if (e instanceof DOMException && e.name === 'AbortError') return
    zoneMonitorError.value = e instanceof Error ? e.message : 'Fehler beim Laden'
    zoneMonitorData.value = null
  } finally {
    // Only clear loading if this controller is still current (not superseded)
    if (zoneMonitorAbort.value === controller) {
      zoneMonitorLoading.value = false
    }
  }
}

watch(selectedZoneId, (zoneId) => {
  if (zoneId) fetchZoneMonitorData()
  else {
    zoneMonitorData.value = null
    zoneMonitorError.value = null
  }
}, { immediate: true })

// Lazy Resolver: trigger only when primary monitor-data API fails
watch(zoneMonitorError, (err) => {
  if (err && selectedZoneId.value) {
    subzoneResolver.buildResolver()
  }
})

// Load initial sparkline history when zone device data becomes available
watch(zoneDeviceGroup, (subzones) => {
  if (!subzones.length) return
  const sensors: { esp_id: string; gpio: number; sensor_type?: string }[] = []
  for (const sz of subzones) {
    for (const s of sz.sensors) {
      sensors.push({ esp_id: s.esp_id, gpio: s.gpio, sensor_type: s.sensor_type })
    }
  }
  if (sensors.length > 0) {
    loadSparklineHistory(sensors)
  }
})

// =============================================================================
// Accordion State with localStorage persistence
// =============================================================================

const collapsedSubzones = ref<Set<string>>(new Set())

function loadAccordionState(zoneId: string) {
  try {
    const stored = localStorage.getItem(`ao-monitor-subzone-collapse-${zoneId}`)
    if (stored) {
      collapsedSubzones.value = new Set(JSON.parse(stored))
      return
    }
  } catch {
    // Fall through to smart defaults
  }

  applySmartDefaults(zoneId)
}

function applySmartDefaults(zoneId: string) {
  const subzones = zoneDeviceGroup.value

  // Collapse empty subzones (0 sensors + 0 actuators)
  const emptyKeys = new Set<string>()
  for (const sz of subzones) {
    if (sz.sensors.length === 0 && sz.actuators.length === 0) {
      emptyKeys.add(getSubzoneKey(zoneId, sz.subzoneId))
    }
  }

  // Count named subzones (exclude "Zone-weit")
  const namedSubzones = subzones.filter(sz => sz.subzoneId !== null)

  if (namedSubzones.length <= 4) {
    // <= 4 subzones: all open, except empty ones
    collapsedSubzones.value = emptyKeys
    return
  }

  // >4 named subzones: only first named + "Zone-weit" open
  const firstNamedId = namedSubzones[0]?.subzoneId

  const collapsed = new Set<string>(emptyKeys)
  for (const sz of namedSubzones) {
    if (sz.subzoneId === firstNamedId) continue
    collapsed.add(getSubzoneKey(zoneId, sz.subzoneId))
  }

  collapsedSubzones.value = collapsed
}

function saveAccordionState(zoneId: string) {
  try {
    localStorage.setItem(
      `ao-monitor-subzone-collapse-${zoneId}`,
      JSON.stringify([...collapsedSubzones.value])
    )
  } catch {
    // localStorage full or unavailable
  }
}

function isSubzoneExpanded(subzoneKey: string): boolean {
  return !collapsedSubzones.value.has(subzoneKey)
}

function toggleSubzone(subzoneKey: string) {
  const next = new Set(collapsedSubzones.value)
  if (next.has(subzoneKey)) {
    next.delete(subzoneKey)
  } else {
    next.add(subzoneKey)
  }
  collapsedSubzones.value = next
  if (selectedZoneId.value) {
    saveAccordionState(selectedZoneId.value)
  }
}

function shouldShowSubzoneAccordionHeader(subzoneId: string | null): boolean {
  return filteredSubzones.value.length > 1 || subzoneId !== null
}

// Apply smart defaults once data becomes available (zoneSensorGroup may be null on initial load)
const smartDefaultsApplied = ref(false)

// Load accordion state when zone changes (also handles Prev/Next nav via router.replace)
const prevZoneId = ref<string | null>(null)

watch(selectedZoneId, (zoneId) => {
  if (zoneId && zoneId !== prevZoneId.value) {
    loadAccordionState(zoneId)
    prevZoneId.value = zoneId
    smartDefaultsApplied.value = false
    // Close expanded sensor panel when switching zones
    expandedSensorKey.value = null
    // Reset subzone filter when zone changes
    selectedSubzoneFilter.value = null
  }
}, { immediate: true })

watch(
  zoneDeviceGroup,
  () => {
    if (smartDefaultsApplied.value) return
    if (!selectedZoneId.value) return
    if (zoneDeviceGroup.value.length === 0) return

    const stored = localStorage.getItem(
      `ao-monitor-subzone-collapse-${selectedZoneId.value}`
    )
    if (stored) {
      smartDefaultsApplied.value = true
      return
    }

    applySmartDefaults(selectedZoneId.value)
    smartDefaultsApplied.value = true
  }
)

// =============================================================================
// Navigation
// =============================================================================

function goToZone(zoneId: string) {
  router.push({ name: 'monitor-zone', params: { zoneId } })
}

function goBack() {
  router.push({ name: 'monitor' })
}

// Zone-to-Zone navigation (Prev/Next on L2)
const sortedZoneIds = computed(() => zoneKPIs.value.map(z => z.zoneId))

const currentZoneIndex = computed(() => {
  if (!selectedZoneId.value) return -1
  return sortedZoneIds.value.indexOf(selectedZoneId.value)
})

const prevNavZoneId = computed(() => {
  const idx = currentZoneIndex.value
  return idx > 0 ? sortedZoneIds.value[idx - 1] : null
})

const nextNavZoneId = computed(() => {
  const idx = currentZoneIndex.value
  return idx >= 0 && idx < sortedZoneIds.value.length - 1
    ? sortedZoneIds.value[idx + 1]
    : null
})

/** L2 inline panels: cross-zone + zone-specific for selectedZoneId (E3) */
const inlineMonitorPanelsL2 = computed(() => {
  const cross = dashStore.inlineMonitorPanelsCrossZone
  const zoneId = selectedZoneId.value
  if (!zoneId) return cross
  const forZone = dashStore.inlineMonitorPanelsForZone(zoneId)
  const seen = new Set(cross.map(p => p.id))
  const combined = [...cross]
  for (const p of forZone) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      combined.push(p)
    }
  }
  return combined.sort((a, b) => (a.target?.order ?? 0) - (b.target?.order ?? 0))
})

function goToPrevZone() {
  if (prevNavZoneId.value) {
    router.replace({ name: 'monitor-zone', params: { zoneId: prevNavZoneId.value } })
  }
}

function goToNextZone() {
  if (nextNavZoneId.value) {
    router.replace({ name: 'monitor-zone', params: { zoneId: nextNavZoneId.value } })
  }
}

// =============================================================================
// Keyboard shortcuts: ArrowLeft/ArrowRight for zone navigation on L2
// =============================================================================

const { register: registerShortcut, activateScope, deactivateScope } = useKeyboardShortcuts()
let unregisterLeft: (() => void) | null = null
let unregisterRight: (() => void) | null = null

watch(selectedZoneId, (zoneId) => {
  if (zoneId) {
    activateScope('monitor-zone')
    unregisterLeft?.()
    unregisterRight?.()
    unregisterLeft = registerShortcut({
      key: 'ArrowLeft',
      handler: goToPrevZone,
      description: 'Vorherige Zone',
      scope: 'monitor-zone',
    })
    unregisterRight = registerShortcut({
      key: 'ArrowRight',
      handler: goToNextZone,
      description: 'Nächste Zone',
      scope: 'monitor-zone',
    })
  } else {
    deactivateScope('monitor-zone')
    unregisterLeft?.()
    unregisterRight?.()
    unregisterLeft = null
    unregisterRight = null
  }
})

// =============================================================================
// Swipe navigation: Left/Right swipe for zone navigation on L2
// =============================================================================

const monitorContentRef = ref<HTMLElement | null>(null)

useSwipeNavigation(monitorContentRef, {
  onSwipeLeft: () => { if (selectedZoneId.value) goToNextZone() },
  onSwipeRight: () => { if (selectedZoneId.value) goToPrevZone() },
  threshold: 50,
})

// =============================================================================
// Actuator control
// =============================================================================

async function toggleActuator(espId: string, gpio: number, currentState: boolean) {
  const command = currentState ? 'OFF' : 'ON'
  try {
    await espStore.sendActuatorCommand(espId, gpio, command)
  } catch {
    // Toast handled by store
  }
}

// Helpers
function getSubzoneKey(zoneId: string | null, subzoneId: string | null): string {
  return `${zoneId ?? '__u'}-${subzoneId ?? '__n'}`
}

// Subzone KPI helper: representative sensor values for header
function getSubzoneKPIs(sensors: { sensor_type: string; raw_value: number | null; unit: string; quality: string }[]): string {
  const typeMap = new Map<string, { sum: number; count: number; unit: string }>()
  for (const s of sensors) {
    // VPD (kPa) must not mix with humidity (%) — both share category 'air'
    if (s.sensor_type === 'vpd') continue
    // Group by SENSOR_TYPE_CONFIG category (temperature, water, air, etc.)
    const cfg = SENSOR_TYPE_CONFIG[s.sensor_type]
    const groupKey = cfg?.category || 'other'
    if (!typeMap.has(groupKey)) {
      typeMap.set(groupKey, { sum: 0, count: 0, unit: getSensorUnit(s.sensor_type) !== 'raw' ? getSensorUnit(s.sensor_type) : (s.unit || '') })
    }
    const entry = typeMap.get(groupKey)!
    // Skip null/undefined AND uninitialized values (raw_value=0 with unknown quality)
    if (s.raw_value === null || s.raw_value === undefined) continue
    if (s.raw_value === 0 && (!s.quality || s.quality === 'unknown')) continue
    entry.sum += s.raw_value
    entry.count++
  }

  const parts: string[] = []
  for (const [, v] of typeMap) {
    if (v.count > 0) {
      const avg = v.count > 1 ? v.sum / v.count : v.sum
      parts.push(`${Number.isInteger(avg) ? avg : avg.toFixed(1)}${v.unit}`)
    }
  }
  return parts.slice(0, 3).join(' · ')
}

// Worst-case quality status for a set of sensors
function getWorstQualityStatus(sensors: { quality: string }[]): 'good' | 'warning' | 'alarm' | 'offline' {
  let worst: 'good' | 'warning' | 'alarm' | 'offline' = 'good'
  for (const s of sensors) {
    const status = qualityToStatus(s.quality)
    if (status === 'alarm') return 'alarm'
    if (status === 'warning') worst = 'warning'
    if (status === 'offline' && worst === 'good') worst = 'offline'
  }
  return worst
}

// =============================================================================
// FAB Quick-Add Widget Dialog (D3)
// =============================================================================

const showAddWidgetDialog = ref(false)
const addWidgetDefaultType = ref<string | undefined>(undefined)

/** FAB widget-selected handler: open AddWidgetDialog with pre-selected type */
function handleFabWidgetSelected(widgetType: string) {
  addWidgetDefaultType.value = widgetType
  showAddWidgetDialog.value = true
}
</script>

<template>
  <div class="monitor-view">
    <!-- View Tab Bar (Hardware / Monitor / Dashboard) -->
    <ViewTabBar />

    <!-- L3 Dashboard View (Cross-Zone or Zone-specific) -->
    <template v-if="isDashboardView">
      <DashboardViewer :layoutId="selectedDashboardId!" showHeader />
    </template>

    <!-- L1/L2 with optional Side-Panel and Bottom-Panel -->
    <div v-else class="monitor-layout" :class="{ 'monitor-layout--has-side': dashStore.sideMonitorPanels.length > 0 }">
      <div class="monitor-layout__main-col">
      <main class="monitor-layout__main">

    <!-- Level 1: Zone Overview -->
    <template v-if="!isZoneDetail">
      <!-- L1 Ready-Gate: Loading → Error → Content -->
      <BaseSkeleton v-if="espStore.isLoading" text="Lade Zonen..." full-height />
      <ErrorState
        v-else-if="espStore.error"
        :message="espStore.error"
        title="Fehler beim Laden der Geräte"
        show-retry
        @retry="espStore.fetchAll()"
      />
      <template v-else>
      <!-- L1 Zone Filter -->
      <div v-if="zoneKPIs.length > 0" class="monitor-zone-filter">
        <div class="monitor-zone-filter__select-wrap">
          <ListFilter class="monitor-zone-filter__icon" />
          <select
            v-model="selectedZoneFilter"
            class="monitor-zone-filter__select"
          >
            <option :value="null">Alle Zonen</option>
            <option
              v-for="z in activeZoneFilterOptions"
              :key="z.zoneId"
              :value="z.zoneId"
            >
              {{ z.name }}
            </option>
            <optgroup v-if="archivedZoneFilterOptions.length > 0" label="Archiv">
              <option
                v-for="z in archivedZoneFilterOptions"
                :key="z.zoneId"
                :value="z.zoneId"
              >
                {{ z.name }} (Archiv)
              </option>
            </optgroup>
          </select>
        </div>
        <span v-if="isZoneFilterActive" class="monitor-zone-filter__badge">
          Gefiltert
        </span>
      </div>

      <!-- Archived Zone Banner -->
      <div v-if="isArchivedZoneSelected" class="monitor-archived-banner">
        <AlertTriangle class="w-4 h-4" />
        <span>Archivierte Zone — nur historische Daten</span>
      </div>

      <!-- Empty State (only when loading done + no error + truly empty) -->
      <div v-if="zoneKPIs.length === 0" class="monitor-view__empty">
        <Activity class="w-12 h-12" style="color: var(--color-text-muted)" />
        <p>Noch keine Zonen eingerichtet.</p>
        <p class="monitor-view__empty-hint">Weise Geräten Zonen zu unter Hardware.</p>
        <router-link to="/hardware" class="monitor-view__empty-cta">
          Zur Hardware-Ansicht
        </router-link>
      </div>

      <!-- Zone Tiles Grid -->
      <div v-else class="monitor-zone-grid">
        <ZoneTileCard
          v-for="zone in filteredZoneKPIs"
          :key="zone.zoneId"
          :zone="zone"
          :is-stale="isZoneStale(zone.lastActivity)"
          :rules="logicStore.getRulesForZone(zone.zoneId).slice(0, 2)"
          :total-rule-count="logicStore.getRulesForZone(zone.zoneId).length"
          :is-rule-active="logicStore.isRuleActive"
          @click="goToZone(zone.zoneId)"
        >
          <!-- Phase 3: Zone mini-widget (first compatible zone-specific inline panel) -->
          <template #extra>
            <InlineDashboardPanel
              v-if="getZoneMiniPanelId(zone.zoneId)"
              :layout-id="getZoneMiniPanelId(zone.zoneId)!"
              :zone-id="zone.zoneId"
              :compact="true"
              mode="inline"
              class="monitor-zone-tile__mini-widget"
            />
          </template>
        </ZoneTileCard>
      </div>

      </template>
    </template>

    <!-- Level 2: Zone Data Detail (Subzone Accordion) -->
    <template v-else>
      <!-- Ready-Gate: BaseSkeleton during load, ErrorState on API error -->
      <BaseSkeleton v-if="zoneMonitorLoading" text="Lade Zonendaten..." full-height />
      <ErrorState
        v-else-if="zoneMonitorError"
        :message="zoneMonitorError"
        show-retry
        @retry="fetchZoneMonitorData()"
      />
      <div v-else ref="monitorContentRef">
      <section
        class="monitor-zone-detail"
        :class="selectedZoneHealthStatus ? `monitor-zone-detail--${selectedZoneHealthStatus}` : ''"
      >
      <div
        class="monitor-view__header"
        :class="{ 'monitor-view__header--with-zone-nav': sortedZoneIds.length > 1 }"
      >
        <button class="monitor-view__back" aria-label="Zurück" title="Zurück" @click="goBack">
          <ArrowLeft class="w-4 h-4" />
        </button>

        <!-- Zone-to-Zone Navigation -->
        <div v-if="sortedZoneIds.length > 1" class="monitor-view__zone-nav">
          <button
            class="monitor-view__zone-nav-btn"
            :disabled="!prevNavZoneId"
            aria-label="Vorherige Zone"
            title="Vorherige Zone"
            @click="goToPrevZone"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <span class="monitor-view__zone-nav-label">
            {{ selectedZoneName }}
          </span>
          <button
            class="monitor-view__zone-nav-btn"
            :disabled="!nextNavZoneId"
            aria-label="Nächste Zone"
            title="Nächste Zone"
            @click="goToNextZone"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>

        <div v-else class="monitor-view__header-info">
          <h2 class="monitor-view__title">{{ selectedZoneName }}</h2>
        </div>

        <div class="monitor-view__header-status" :class="selectedZoneHealthStatus ? `monitor-view__header-status--${selectedZoneHealthStatus}` : ''">
          <span class="monitor-view__header-status-dot" />
          <span class="monitor-view__header-status-text">{{ selectedZoneHealthLabel }}</span>
        </div>
      </div>
      <p v-if="selectedZoneHealthReason" class="monitor-view__header-reason">
        {{ selectedZoneHealthReason }}
      </p>

      <!-- L2 Subzone Filter (only when >1 subzone) -->
      <div v-if="availableSubzones.length > 1" class="monitor-zone-filter">
        <div class="monitor-zone-filter__select-wrap">
          <ListFilter class="monitor-zone-filter__icon" />
          <select
            v-model="selectedSubzoneFilter"
            class="monitor-zone-filter__select"
          >
            <option :value="null">Alle Subzonen</option>
            <option
              v-for="sz in availableSubzones"
              :key="sz.id ?? '__none__'"
              :value="sz.id"
            >
              {{ sz.name }}
            </option>
          </select>
        </div>
        <span v-if="selectedSubzoneFilter !== null" class="monitor-zone-filter__badge">
          Gefiltert
        </span>
      </div>

      <!-- Unified Subzone-First Section (sensors + actuators per subzone) -->
      <section v-if="filteredSubzones.length > 0" class="monitor-section monitor-section--subzones">
        <div
          v-for="subzone in filteredSubzones"
          :key="subzone.subzoneId ?? '__zoneweit__'"
          class="monitor-subzone"
          :class="{ 'monitor-subzone--unassigned': subzone.subzoneId === null }"
        >
          <!-- Accordion-Header: only when >1 subzone OR named subzone -->
          <button
            v-if="shouldShowSubzoneAccordionHeader(subzone.subzoneId)"
            @click="toggleSubzone(getSubzoneKey(selectedZoneId, subzone.subzoneId))"
            class="monitor-subzone__header"
            :class="{ 'monitor-subzone__header--zoneweit': subzone.subzoneId === null }"
          >
            <ChevronRight
              :class="['monitor-subzone__chevron', { 'monitor-subzone__chevron--expanded': isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId)) }]"
            />
            <span :class="['monitor-subzone__status-dot', `monitor-subzone__status-dot--${getWorstQualityStatus(subzone.sensors)}`]" />
            <span class="monitor-subzone__name">{{ subzone.subzoneName }}</span>
            <span class="monitor-subzone__count">
              {{ subzone.sensors.length }}S · {{ subzone.actuators.length }}A
            </span>
            <span class="monitor-subzone__kpis" v-if="getSubzoneKPIs(subzone.sensors)">{{ getSubzoneKPIs(subzone.sensors) }}</span>
          </button>
          <div
            v-else
            class="monitor-subzone__header monitor-subzone__header--static monitor-subzone__header--zoneweit"
          >
            <span :class="['monitor-subzone__status-dot', `monitor-subzone__status-dot--${getWorstQualityStatus(subzone.sensors)}`]" />
            <span class="monitor-subzone__name">{{ subzone.subzoneName }}</span>
            <span class="monitor-subzone__count">
              {{ subzone.sensors.length }}S · {{ subzone.actuators.length }}A
            </span>
            <span class="monitor-subzone__kpis" v-if="getSubzoneKPIs(subzone.sensors)">{{ getSubzoneKPIs(subzone.sensors) }}</span>
            <span class="monitor-subzone__optional-hint">Keine Subzone konfiguriert</span>
          </div>

          <!-- Accordion-Body -->
          <Transition name="accordion">
          <div
            v-show="!shouldShowSubzoneAccordionHeader(subzone.subzoneId) || isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId))"
            class="monitor-subzone__content"
          >

            <!-- Sensors -->
            <template v-if="subzone.sensors.length > 0">
              <div
                v-if="subzone.sensors.length > 0 && subzone.actuators.length > 0"
                class="monitor-subzone__type-label"
              >Sensoren</div>
              <div class="monitor-card-grid">
                <div
                  v-for="sensor in subzone.sensors"
                  :key="`${sensor.esp_id}-${sensor.gpio}-${sensor.sensor_type}`"
                  :class="[
                    'monitor-sensor-card',
                    { 'monitor-sensor-card--expanded': expandedSensorKey === getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type) }
                  ]"
                >
                  <SensorCard
                    :sensor="sensor"
                    mode="monitor"
                    :data-mode="monitorSensorCardDataMode"
                    :trend="getSensorTrend(sensor.esp_id, sensor.gpio, sensor.sensor_type)"
                    @click="toggleExpanded(getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type))"
                  >
                    <template #sparkline>
                      <LiveLineChart
                        v-if="sparklineCache.get(getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type))?.length"
                        :data="sparklineCache.get(getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type))!"
                        compact
                        height="32px"
                        :max-data-points="30"
                        :sensor-type="sensor.sensor_type"
                        :thresholds="getDefaultThresholds(sensor.sensor_type)"
                        :show-thresholds="!!getDefaultThresholds(sensor.sensor_type)"
                      />
                    </template>
                  </SensorCard>

                  <!-- Expanded Chart Panel (inline 1h chart) -->
                  <Transition name="expand">
                    <div
                      v-if="expandedSensorKey === getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type)"
                      class="monitor-sensor-card__charts"
                      @click.stop
                    >
                      <div class="monitor-sensor-card__1h-chart">
                        <div v-if="expandedChartLoading" class="monitor-sensor-card__chart-loading">
                          <div class="sensor-detail__spinner" />
                          <span>Lade Daten...</span>
                        </div>
                        <div v-else-if="expandedChartData.datasets.length > 0" style="height: 160px">
                          <Line :data="expandedChartData" :options="expandedChartOptions" />
                        </div>
                        <div v-else class="monitor-sensor-card__chart-empty">
                          Keine Daten der letzten Stunde
                        </div>
                      </div>
                      <div class="monitor-sensor-card__actions">
                        <button
                          class="monitor-sensor-card__detail-btn"
                          @click.stop="openSensorDetail(sensor)"
                        >
                          <ChevronRight class="w-4 h-4" />
                          <span>Zeitreihe anzeigen</span>
                        </button>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </template>

            <!-- Separator: only when BOTH types present -->
            <hr
              v-if="subzone.sensors.length > 0 && subzone.actuators.length > 0"
              class="monitor-subzone__separator"
            />

            <!-- Actuators -->
            <template v-if="subzone.actuators.length > 0">
              <div
                v-if="subzone.sensors.length > 0 && subzone.actuators.length > 0"
                class="monitor-subzone__type-label"
              >Aktoren</div>
              <div class="monitor-card-grid">
                <ActuatorCard
                  v-for="actuator in subzone.actuators"
                  :key="`${actuator.esp_id}-${actuator.gpio}`"
                  :actuator="actuator"
                  mode="monitor"
                  :data-mode="monitorActuatorCardDataMode"
                  :show-snapshot-warning="showActuatorSnapshotWarning"
                  :linked-rules="logicStore.getRulesForActuator(actuator.esp_id, actuator.gpio)"
                  :last-execution="logicStore.getLastExecutionForActuator(actuator.esp_id, actuator.gpio)"
                  @toggle="toggleActuator"
                />
              </div>
            </template>

            <!-- Empty subzone -->
            <div
              v-if="subzone.sensors.length === 0 && subzone.actuators.length === 0"
              class="monitor-subzone__empty"
            >
              Keine Geräte zugeordnet
            </div>
          </div>
          </Transition>
        </div>
      </section>
      </section>

      <!-- Zonenweite Regeln (bewusst getrennt von Subzone-Bloecken) -->
      <div class="monitor-zonewide-rules">
        <ZoneRulesSection :zone-id="selectedZoneId" />
      </div>

      <!-- Shared Sensors from other zones (6.7) -->
      <section v-if="sharedSensorRefs.length > 0" class="monitor-shared-equipment">
        <h3 class="monitor-section__title">
          Shared Sensors
          <span class="monitor-section__count">{{ sharedSensorRefs.length }}</span>
        </h3>
        <div class="monitor-shared-equipment__grid">
          <SharedSensorRefCard
            v-for="sensor in sharedSensorRefs"
            :key="sensor.config_id || `${sensor.esp_id}-${sensor.gpio}`"
            :sensor="sensor"
            :home-zone-id="sensor._homeZoneId"
          />
        </div>
      </section>

      <!-- Inline Dashboard Panels for this zone (cross-zone + zone-specific, E3) -->
      <InlineDashboardPanel
        v-for="panel in inlineMonitorPanelsL2"
        :key="panel.id"
        :layoutId="panel.id"
        :zone-id="selectedZoneId ?? undefined"
        mode="manage"
      />

      <div v-if="zoneSensorCount === 0 && zoneActuatorCount === 0" class="monitor-view__empty">
        <Activity class="w-12 h-12" style="color: var(--color-text-muted)" />
        <p>Keine Sensoren oder Aktoren in dieser Zone.</p>
      </div>
      </div><!-- /monitorContentRef -->
    </template>

      </main>

      <!-- Bottom-Panel (target.view='monitor', placement='bottom-panel') -->
      <div v-if="dashStore.bottomMonitorPanels?.length > 0" class="monitor-layout__bottom">
        <InlineDashboardPanel
          v-for="panel in dashStore.bottomMonitorPanels"
          :key="panel.id"
          :layoutId="panel.id"
          mode="manage"
          :zone-id="selectedZoneId ?? undefined"
        />
      </div>
      </div>

      <!-- Side-Panel (target.view='monitor', placement='side-panel') -->
      <aside v-if="dashStore.sideMonitorPanels.length > 0" class="monitor-layout__side">
        <InlineDashboardPanel
          v-for="panel in dashStore.sideMonitorPanels"
          :key="panel.id"
          :layoutId="panel.id"
          mode="side-panel"
          :zone-id="selectedZoneId ?? undefined"
        />
      </aside>
    </div>

    <!-- Level 3: Sensor Detail SlideOver (5-Section Anatomy) -->
    <SlideOver
      :open="showSensorDetail"
      :title="selectedDetailSensor?.name || 'Sensor-Detail'"
      width="lg"
      @close="closeSensorDetail"
    >
      <template v-if="selectedDetailSensor">
        <!-- ═══ Section 1: Header — Live Value + Trend + Stale ═══ -->
        <div class="sensor-detail__hero">
          <div class="sensor-detail__hero-top">
            <span class="sensor-detail__sensor-type">{{ selectedDetailSensor.sensorType }}</span>
            <span class="sensor-detail__hero-sep">·</span>
            <span class="sensor-detail__esp-name">{{ selectedDetailSensor.espId }}</span>
            <template v-if="selectedZoneName">
              <span class="sensor-detail__hero-sep">·</span>
              <span class="sensor-detail__zone-name">{{ selectedZoneName }}</span>
            </template>
          </div>
          <div class="sensor-detail__hero-value">
            <span v-if="detailLiveValue?.value != null" class="sensor-detail__live-value">
              {{ formatStatValue(detailLiveValue.value) }}
              <span class="sensor-detail__live-unit">{{ selectedDetailSensor.unit }}</span>
            </span>
            <span v-else class="sensor-detail__live-value sensor-detail__live-value--no-data">—</span>
            <component
              :is="detailTrend === 'up' ? TrendingUp : detailTrend === 'down' ? TrendingDown : Minus"
              :class="['sensor-detail__trend-icon', `sensor-detail__trend-icon--${detailTrend}`]"
              :size="20"
            />
          </div>
          <div class="sensor-detail__hero-meta">
            <span v-if="detailIsStale" class="sensor-detail__stale-badge">
              <Clock :size="12" />
              Veraltet
            </span>
            <span class="sensor-detail__source-line">
              Live jetzt:
              <strong v-if="detailLiveValue?.lastUpdate">{{ formatRelativeTime(detailLiveValue.lastUpdate) }}</strong>
              <strong v-else>unbekannt</strong>
            </span>
            <span class="sensor-detail__source-line">
              Historie bis:
              <strong v-if="detailHistoryLatestAt">{{ formatRelativeTime(detailHistoryLatestAt) }}</strong>
              <strong v-else>keine Daten</strong>
              <span v-if="detailHistoryIsStale" class="sensor-detail__history-stale">Snapshot</span>
            </span>
          </div>
        </div>

        <!-- ═══ Section 2: TimeRange Chips ═══ -->
        <TimeRangeSelector
          v-model="detailPreset"
          @range-change="onDetailRangeChange"
        />

        <!-- Multi-Sensor Overlay Selector -->
        <div v-if="availableOverlaySensors.length > 0" class="sensor-detail__overlay">
          <p class="sensor-detail__overlay-label">Vergleichen mit:</p>
          <div class="sensor-detail__overlay-chips">
            <button
              v-for="s in availableOverlaySensors"
              :key="s.key"
              :class="[
                'sensor-detail__overlay-chip',
                { 'sensor-detail__overlay-chip--active': overlaySensorIds.includes(s.key) },
                { 'sensor-detail__overlay-chip--loading': overlayLoading.has(s.key) },
              ]"
              :disabled="!overlaySensorIds.includes(s.key) && overlaySensorIds.length >= MAX_OVERLAY_SENSORS"
              @click="toggleOverlaySensor(s.key)"
            >
              <span
                class="sensor-detail__overlay-dot"
                :style="{ background: overlaySensorIds.includes(s.key) ? getOverlayColor(s.key) : 'var(--color-text-muted)' }"
              />
              {{ s.name }}
              <span class="sensor-detail__overlay-unit">{{ s.unit }}</span>
            </button>
          </div>
        </div>

        <!-- ═══ Section 3: Chart ═══ -->
        <!-- Loading -->
        <div v-if="detailLoading" class="sensor-detail__status">
          <div class="sensor-detail__spinner" />
          <span>Lade Sensordaten...</span>
        </div>

        <!-- Error -->
        <div v-else-if="detailError" class="sensor-detail__status sensor-detail__status--error">
          {{ detailError }}
        </div>

        <!-- No data -->
        <div v-else-if="detailReadings.length === 0" class="sensor-detail__status">
          Keine Daten für den gewählten Zeitraum.
        </div>

        <!-- Chart + Stats -->
        <template v-else>
          <div class="sensor-detail__chart-wrap">
            <div class="sensor-detail__chart-header">
              <span class="sensor-detail__point-count">
                {{ detailReadings.length }} Datenpunkte
              </span>
              <span class="sensor-detail__point-count">
                Stand: {{ detailHistoryLatestAt ? formatRelativeTime(detailHistoryLatestAt) : 'unbekannt' }}
              </span>
            </div>
            <div v-if="overlaySensorIds.length > 0" class="sensor-detail__overlay-stand">
              <span
                v-for="sensorKey in overlaySensorIds"
                :key="sensorKey"
                class="sensor-detail__overlay-stand-chip"
              >
                Overlay: {{ overlayHistoryLatest.get(sensorKey) ? formatRelativeTime(overlayHistoryLatest.get(sensorKey)!) : 'keine Daten' }}
              </span>
            </div>
            <div class="sensor-detail__chart" style="height: 300px">
              <Line :data="detailChartData" :options="detailChartOptions" />
            </div>
          </div>

          <!-- ═══ Section 4: Statistics Row ═══ -->
          <div v-if="detailStats" class="sensor-detail__stats">
            <div class="sensor-detail__stat">
              <span class="sensor-detail__stat-label">Min</span>
              <span class="sensor-detail__stat-value">{{ formatStatValue(detailStats.min_value) }}</span>
              <span class="sensor-detail__stat-unit">{{ selectedDetailSensor.unit }}</span>
              <span v-if="detailMinMaxTimestamps.minAt" class="sensor-detail__stat-time">({{ formatShortTime(detailMinMaxTimestamps.minAt) }})</span>
            </div>
            <div class="sensor-detail__stat">
              <span class="sensor-detail__stat-label">Max</span>
              <span class="sensor-detail__stat-value">{{ formatStatValue(detailStats.max_value) }}</span>
              <span class="sensor-detail__stat-unit">{{ selectedDetailSensor.unit }}</span>
              <span v-if="detailMinMaxTimestamps.maxAt" class="sensor-detail__stat-time">({{ formatShortTime(detailMinMaxTimestamps.maxAt) }})</span>
            </div>
            <div class="sensor-detail__stat">
              <span class="sensor-detail__stat-label">Ø</span>
              <span class="sensor-detail__stat-value">{{ formatStatValue(detailStats.avg_value) }}</span>
              <span class="sensor-detail__stat-unit">{{ selectedDetailSensor.unit }}</span>
            </div>
            <div class="sensor-detail__stat">
              <span class="sensor-detail__stat-label">Messungen</span>
              <span class="sensor-detail__stat-value">{{ detailStats.reading_count }}</span>
            </div>
          </div>
        </template>
      </template>

      <!-- ═══ Section 5: Quick-Actions (fixed footer) ═══ -->
      <template #footer v-if="selectedDetailSensor">
        <div class="sensor-detail__actions">
          <button class="sensor-detail__action-btn" @click="exportDetailCsv" :disabled="detailReadings.length === 0">
            <Download :size="14" />
            CSV Export
          </button>
        </div>
      </template>
    </SlideOver>

    <!-- FAB (Quick-Add Widget) -->
    <QuickActionBall
      mode="monitor"
      @widget-selected="handleFabWidgetSelected"
    />

    <!-- Add Widget Dialog (D3) -->
    <AddWidgetDialog
      :open="showAddWidgetDialog"
      :default-zone-id="selectedZoneId ?? undefined"
      :default-widget-type="addWidgetDefaultType"
      @update:open="showAddWidgetDialog = $event"
      @close="showAddWidgetDialog = false"
    />
  </div>
</template>

<style scoped>
.monitor-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/* ViewTabBar hat eigenen margin-bottom; im Monitor steuern wir den Abstand zentral */
.monitor-view :deep(.view-tab-bar) {
  margin-bottom: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONE / SUBZONE FILTER (WP5)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-zone-filter {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.monitor-zone-filter__select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.monitor-zone-filter__icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.monitor-zone-filter__select {
  padding: 6px 32px 6px 30px;
  font-size: var(--text-sm);
  font-family: inherit;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  appearance: none;
  cursor: pointer;
  transition: border-color 0.2s;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23707080' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.monitor-zone-filter__select:focus {
  outline: none;
  border-color: var(--color-iridescent-2);
}

.monitor-zone-filter__select option,
.monitor-zone-filter__select optgroup {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.monitor-zone-filter__badge {
  font-size: var(--text-xs);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-iridescent-2) 15%, transparent);
  color: var(--color-iridescent-2);
  font-weight: 500;
}

.monitor-archived-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LAYOUT — Main + optional Side-Panel (Block 7d)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
}

.monitor-layout--has-side {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: var(--space-4);
}

.monitor-layout__main-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.monitor-layout__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.monitor-zone-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  margin-bottom: var(--space-2);
}

.monitor-zone-detail--ok { border-left-color: var(--color-success); }
.monitor-zone-detail--warning { border-left-color: var(--color-warning); }
.monitor-zone-detail--alarm { border-left-color: var(--color-error); }
.monitor-zone-detail--empty { border-left-color: var(--color-text-muted); opacity: 0.9; }

.monitor-layout__bottom {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex-shrink: 0;
  max-height: 400px;
  overflow-y: auto;
}

.monitor-layout__side {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
  max-height: calc(100vh - 120px);
  position: sticky;
  top: 0;
}

@media (max-width: 768px) {
  .monitor-layout--has-side {
    grid-template-columns: 1fr;
  }
  .monitor-layout__side {
    position: static;
    max-height: none;
  }
}

.monitor-view__title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.monitor-view__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: nowrap;
  justify-content: space-between;
  margin-bottom: 0;
  padding: 0 0 var(--space-2);
  border-bottom: 1px solid var(--glass-border);
}

.monitor-view__header--with-zone-nav {
  justify-content: flex-start;
}

/* Zone-to-Zone Navigation (Prev/Next on L2) */
.monitor-view__zone-nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex: 1 1 auto;
  min-width: 0;
  justify-content: center;
}

.monitor-view__zone-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-primary);
  transition: all var(--transition-fast);
  padding: 0;
}

.monitor-view__zone-nav-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.monitor-view__zone-nav-btn:not(:disabled):hover {
  background: var(--color-surface-hover);
  border-color: var(--glass-border-hover);
}

.monitor-view__zone-nav-label {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-primary);
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1;
  padding: 0 var(--space-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(60vw, 340px);
  justify-content: center;
}

@media (max-width: 640px) {
  .monitor-view__zone-nav {
    gap: var(--space-1);
  }
}

.monitor-view__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  flex-shrink: 0;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.monitor-view__back:hover {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
  background: var(--glass-bg-light);
  transform: translateX(-2px);
}

.monitor-view__header-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0;
  flex: 1 1 auto;
  min-width: 0;
}

.monitor-view__header-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  flex-shrink: 0;
}

.monitor-view__header-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.monitor-view__header-status--ok .monitor-view__header-status-dot { background: var(--color-success); }
.monitor-view__header-status--warning .monitor-view__header-status-dot { background: var(--color-warning); }
.monitor-view__header-status--alarm .monitor-view__header-status-dot { background: var(--color-error); }

.monitor-view__header-status-text {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  font-weight: 600;
}

.monitor-view__header-reason {
  margin: calc(-1 * var(--space-1)) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* Defensive: falls alter Markup-Stand aktiv ist, KPI-Zeile/Back-Text ausblenden */
.monitor-view__zone-kpis,
.monitor-view__zone-kpi,
.monitor-view__back span {
  display: none;
}

.monitor-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12);
  text-align: center;
  color: var(--color-text-muted);
  margin-bottom: var(--space-10);
}

.monitor-view__empty-hint {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-top: calc(-1 * var(--space-2));
}

.monitor-view__empty-cta {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  text-decoration: none;
  transition: all var(--transition-fast);
}

.monitor-view__empty-cta:hover {
  border-color: var(--color-iridescent-2);
  color: var(--color-text-primary);
  background: color-mix(in srgb, var(--color-text-inverse) 4%, transparent);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONE TILES (Level 1)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-zone-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  margin-bottom: var(--space-10);
  --monitor-separator-color: var(--glass-border-hover);
}

.monitor-zone-grid :deep(.monitor-zone-tile) {
  position: relative;
}

.monitor-zone-grid :deep(.monitor-zone-tile + .monitor-zone-tile)::before {
  content: '';
  position: absolute;
  left: var(--space-4);
  right: var(--space-4);
  top: calc(-1 * var(--space-2));
  border-top: 2px dashed var(--monitor-separator-color);
  pointer-events: none;
}

/* Phase 3: Mini-widget inside zone tile (extra-slot) — height controlled by InlineDashboardPanel rowHeightPx */
.monitor-zone-tile__mini-widget {
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  padding: var(--space-1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUBZONE ACCORDION (Level 2)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-10);
}

.monitor-section--subzones {
  margin-bottom: var(--space-4);
}

.monitor-section__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin: 0;
}

.monitor-subzone {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--glass-bg);
}

.monitor-subzone--unassigned {
  border-style: dashed;
}

.monitor-subzone--unassigned .monitor-subzone__header {
  color: var(--color-text-secondary);
}

.monitor-subzone__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  width: 100%;
  text-align: left;
  color: var(--color-text-primary);
  font-size: var(--text-sm);
}

.monitor-subzone__header--static {
  cursor: default;
}

.monitor-subzone__header:hover {
  border-color: var(--glass-border-hover);
}

.monitor-subzone__chevron {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
}

.monitor-subzone__chevron--expanded {
  transform: rotate(90deg);
}

.monitor-subzone__name {
  font-weight: 600;
  flex: 1;
}

.monitor-subzone__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.monitor-subzone__status-dot--good { background: var(--color-success); }
.monitor-subzone__status-dot--warning { background: var(--color-warning); }
.monitor-subzone__status-dot--alarm { background: var(--color-error); }
.monitor-subzone__status-dot--offline { background: var(--color-text-muted); }

.monitor-subzone__kpis {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
  margin-left: auto;
  margin-right: var(--space-2);
  white-space: nowrap;
}

.monitor-subzone__optional-hint {
  margin-left: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.monitor-subzone__count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.monitor-subzone__separator {
  border: none;
  border-top: 1px dashed var(--monitor-separator-color);
  margin: var(--space-3) 0;
}

.monitor-subzone__type-label {
  font-size: var(--text-xs, 0.75rem);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}

.monitor-subzone__header--zoneweit {
  border-style: dashed;
}

.monitor-subzone__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.monitor-zonewide-rules {
  margin-bottom: var(--space-4);
  padding-top: 0;
  border-top: 1px dashed var(--monitor-separator-color);
}

.monitor-subzone__empty {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  padding: var(--space-3);
}

/* Subzone CRUD elements */
.monitor-subzone__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.monitor-subzone__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.monitor-subzone__header:hover .monitor-subzone__actions {
  opacity: 1;
}

.monitor-subzone__empty-hint {
  font-size: var(--text-xs, 11px);
  color: var(--color-text-muted);
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-sm);
  text-align: center;
  grid-column: 1 / -1;
}

.monitor-subzone__empty-link {
  color: var(--color-iridescent-2);
  text-decoration: none;
}

.monitor-subzone__empty-link:hover {
  text-decoration: underline;
}

.monitor-subzone__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.monitor-subzone__action-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
  color: var(--color-text-primary);
}

.monitor-subzone__action-btn--danger:hover {
  background: var(--color-error-bg);
  border-color: var(--color-error-border);
  color: var(--color-error);
}

.monitor-subzone__action-btn--confirm {
  color: var(--color-success);
}

.monitor-subzone__action-btn--confirm:hover {
  background: var(--color-success-bg);
  border-color: var(--color-success-border);
  color: var(--color-success);
}

.monitor-subzone__action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.monitor-subzone__rename-input {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  min-width: 120px;
  max-width: 200px;
}

.monitor-subzone__rename-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.monitor-subzone__create-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
}

.monitor-subzone__add-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  width: 100%;
}

.monitor-subzone__add-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-accent);
  color: var(--color-text-secondary);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SENSOR/ACTUATOR CARDS (Level 2)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
}

/* Sensor Card wrapper (SensorCard handles its own visual styling) */
.monitor-sensor-card--expanded {
  grid-column: 1 / -1;
}

@media (min-width: 640px) {
  .monitor-sensor-card--expanded {
    grid-column: span 2;
  }
}

/* Charts Panel (expanded) */
.monitor-sensor-card__charts {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.monitor-sensor-card__1h-chart {
  min-height: 60px;
}

.monitor-sensor-card__chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.monitor-sensor-card__chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-style: italic;
}

/* Expand transition */
.expand-enter-active {
  transition: all var(--duration-base) var(--ease-out);
}

.expand-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 600px;
}

/* Accordion transition */
.accordion-enter-active {
  transition: all var(--duration-base) var(--ease-out);
}

.accordion-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}

.accordion-enter-from,
.accordion-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
}

.accordion-enter-to,
.accordion-leave-from {
  max-height: 2000px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD LINKS
   ═══════════════════════════════════════════════════════════════════════════ */

/* Zone Dashboards section (L2) */
/* Shared Equipment section (6.7) */
.monitor-shared-equipment {
  margin-bottom: var(--space-10);
}

.monitor-shared-equipment__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.monitor-section__count {
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--color-text-muted);
  margin-left: var(--space-2);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SENSOR DETAIL BUTTON (in expanded card)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-sensor-card__detail-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-accent-bright);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  width: fit-content;
}

.monitor-sensor-card__detail-btn:hover {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 6%, transparent);
}

.monitor-sensor-card__detail-btn--secondary {
  color: var(--color-text-secondary);
}

.monitor-sensor-card__detail-btn--secondary:hover {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
  background: color-mix(in srgb, var(--color-text-inverse) 4%, transparent);
}

.monitor-sensor-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SENSOR DETAIL SLIDEOVER CONTENT (5-Section Anatomy)
   ═══════════════════════════════════════════════════════════════════════════ */

/* Section 1: Hero Header */
.sensor-detail__hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.sensor-detail__hero-top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.sensor-detail__sensor-type {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-iridescent-2);
  background: color-mix(in srgb, var(--color-iridescent-2) 10%, transparent);
  padding: 1px 6px;
  border-radius: 100px;
}

.sensor-detail__esp-name {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.sensor-detail__hero-sep {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.sensor-detail__zone-name {
  font-size: var(--text-xs);
  color: var(--color-iridescent-2);
  font-weight: 500;
}

.sensor-detail__hero-value {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.sensor-detail__live-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  line-height: 1.1;
}

.sensor-detail__live-value--no-data {
  color: var(--color-text-muted);
}

.sensor-detail__live-unit {
  font-size: var(--text-base);
  font-weight: 400;
  color: var(--color-text-secondary);
}

.sensor-detail__trend-icon {
  flex-shrink: 0;
}

.sensor-detail__trend-icon--up {
  color: var(--color-error);
}

.sensor-detail__trend-icon--down {
  color: var(--color-info);
}

.sensor-detail__trend-icon--stable {
  color: var(--color-text-muted);
}

.sensor-detail__hero-meta {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.sensor-detail__stale-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--color-warning);
  font-weight: 600;
  animation: breathe 2s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.sensor-detail__last-update {
  color: var(--color-text-muted);
}

.sensor-detail__source-line {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.sensor-detail__source-line strong {
  color: var(--color-text-secondary);
}

.sensor-detail__history-stale {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  padding: 1px 6px;
  color: var(--color-warning);
}

/* Section 4: Statistics Row */
.sensor-detail__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

.sensor-detail__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.sensor-detail__stat-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sensor-detail__stat-value {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
}

.sensor-detail__stat-unit {
  font-size: 10px;
  color: var(--color-text-muted);
}

.sensor-detail__stat-time {
  font-size: 10px;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

/* Section 5: Quick-Actions (footer) */
.sensor-detail__actions {
  display: flex;
  gap: var(--space-2);
}

.sensor-detail__action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-decoration: none;
  white-space: nowrap;
}

.sensor-detail__action-btn:hover:not(:disabled) {
  border-color: var(--color-iridescent-1);
  color: var(--color-text-primary);
}

.sensor-detail__action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sensor-detail__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.sensor-detail__status--error {
  color: var(--color-error);
}

.sensor-detail__spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--color-bg-tertiary);
  border-top-color: var(--color-iridescent-1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.sensor-detail__chart-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.sensor-detail__chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sensor-detail__point-count {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.sensor-detail__overlay-stand {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.sensor-detail__overlay-stand-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  border: 1px solid var(--glass-border);
  padding: 2px 8px;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.sensor-detail__chart {
  position: relative;
  width: 100%;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MULTI-SENSOR OVERLAY (L3)
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-detail__overlay {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.sensor-detail__overlay-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0;
  font-weight: 500;
}

.sensor-detail__overlay-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.sensor-detail__overlay-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 100px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.sensor-detail__overlay-chip:hover:not(:disabled) {
  border-color: var(--glass-border-hover);
  color: var(--color-text-primary);
}

.sensor-detail__overlay-chip--active {
  background: color-mix(in srgb, var(--color-iridescent-3) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-iridescent-3) 30%, transparent);
  color: var(--color-text-primary);
}

.sensor-detail__overlay-chip--loading {
  opacity: 0.6;
}

.sensor-detail__overlay-chip:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.sensor-detail__overlay-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sensor-detail__overlay-unit {
  color: var(--color-text-muted);
  font-size: 10px;
}
</style>
