<script setup lang="ts">
/**
 * MonitorView — Sensor & Actuator Live Monitoring
 *
 * Route: /monitor, /monitor/:zoneId
 *
 * Read-only live data view with 3 levels:
 * L1 /monitor — Zone tiles with KPI aggregation + cross-zone dashboard links
 * L2 /monitor/:zoneId — Subzone accordion with sensor/actuator cards
 * L3 SlideOver — Sensor detail with historical time series
 *
 * NO config panels (read-only). Config is in SensorsView (/sensors).
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useZoneDragDrop, ZONE_UNASSIGNED } from '@/composables'
import { useZoneGrouping } from '@/composables/useZoneGrouping'
import { useSparklineCache } from '@/composables/useSparklineCache'
import { aggregateZoneSensors, formatAggregatedValue, getSensorUnit } from '@/utils/sensorDefaults'
import { useDashboardStore } from '@/shared/stores/dashboard.store'
import { getESPStatus } from '@/composables/useESPStatus'
import { formatRelativeTime } from '@/utils/formatters'
import { sensorsApi } from '@/api/sensors'
import type { SensorReading } from '@/types'
import { LayoutDashboard, Download, CheckCircle2, XCircle, Clock } from 'lucide-vue-next'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import TimeRangeSelector, { type TimePreset } from '@/components/charts/TimeRangeSelector.vue'
import { Line } from 'vue-chartjs'
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
  ChevronRight, Settings,
} from 'lucide-vue-next'
import type { MockSensor, MockActuator } from '@/types'
import LiveLineChart from '@/components/charts/LiveLineChart.vue'
import HistoricalChart from '@/components/charts/HistoricalChart.vue'
import GaugeChart from '@/components/charts/GaugeChart.vue'
import ViewTabBar from '@/components/common/ViewTabBar.vue'
import SensorCard from '@/components/devices/SensorCard.vue'
import ActuatorCard from '@/components/devices/ActuatorCard.vue'

const router = useRouter()
const route = useRoute()
const espStore = useEspStore()
const dashStore = useDashboardStore()
const { groupDevicesByZone } = useZoneDragDrop()

const selectedZoneId = computed(() => (route.params.zoneId as string) || null)
const selectedSensorId = computed(() => (route.params.sensorId as string) || null)
const isZoneDetail = computed(() => !!selectedZoneId.value)

// Expanded sensor card state (for inline charts)
const expandedSensorKey = ref<string | null>(null)
const historicalTimeRange = ref<'1h' | '6h' | '24h' | '7d'>('1h')

// Sparkline data cache (shared composable)
const { sparklineCache, getSensorKey } = useSparklineCache()

// Zone grouping composable (for L2 subzone accordion)
const { sensorsByZone, actuatorsByZone } = useZoneGrouping()

function toggleExpanded(sensorKey: string) {
  expandedSensorKey.value = expandedSensorKey.value === sensorKey ? null : sensorKey
}

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

const CHART_COLORS = ['#a78bfa', '#34d399', '#f97316', '#3b82f6']

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
  }, 300)
}

function onDetailRangeChange(payload: { start: string; end: string }) {
  detailStartTime.value = payload.start
  detailEndTime.value = payload.end
  fetchDetailData()
}

async function fetchDetailData() {
  if (!selectedDetailSensor.value) return
  detailLoading.value = true
  detailError.value = ''
  try {
    const response = await sensorsApi.queryData({
      esp_id: selectedDetailSensor.value.espId,
      gpio: selectedDetailSensor.value.gpio,
      start_time: detailStartTime.value,
      end_time: detailEndTime.value,
      limit: 1000,
    })
    detailReadings.value = response.readings ?? []
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : 'Fehler beim Laden'
    detailReadings.value = []
  } finally {
    detailLoading.value = false
  }
}

const detailChartData = computed(() => {
  if (!detailReadings.value.length) return { datasets: [] }
  const sensor = selectedDetailSensor.value
  return {
    datasets: [{
      label: `${sensor?.name ?? 'Sensor'} (${sensor?.unit ?? ''})`,
      data: detailReadings.value.map(r => ({
        x: new Date(r.timestamp).getTime(),
        y: r.processed_value ?? r.raw_value,
      })),
      borderColor: CHART_COLORS[0],
      backgroundColor: `${CHART_COLORS[0]}20`,
      borderWidth: 2,
      pointRadius: detailReadings.value.length > 200 ? 0 : 2,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: true,
    }],
  }
})

const detailChartOptions = computed(() => {
  const unit = selectedDetailSensor.value?.unit ?? ''
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(7,7,13,0.92)',
        borderColor: 'rgba(133,133,160,0.3)',
        borderWidth: 1,
        titleFont: { family: 'JetBrains Mono', size: 11 },
        bodyFont: { family: 'JetBrains Mono', size: 12 },
        titleColor: '#8585a0',
        bodyColor: '#eaeaf2',
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
          displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' },
        },
        grid: { color: 'rgba(29,29,42,0.8)' },
        ticks: { color: '#484860', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 },
        border: { display: false },
      },
      y: {
        grid: { color: 'rgba(29,29,42,0.8)' },
        ticks: {
          color: CHART_COLORS[0],
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (val: string | number) => `${val} ${unit}`,
        },
        border: { display: false },
      },
    },
  }
})

function exportDetailCsv() {
  if (!detailReadings.value.length) return
  const header = 'timestamp,raw_value,processed_value,unit,quality'
  const rows = detailReadings.value.map(r =>
    `${r.timestamp},${r.raw_value},${r.processed_value ?? ''},${r.unit ?? ''},${r.quality}`
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sensor-data_${selectedDetailSensor.value?.espId}_gpio${selectedDetailSensor.value?.gpio}_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Fetch data on mount + deep-link support
onMounted(() => {
  if (espStore.devices.length === 0) {
    espStore.fetchAll()
  }

  // Update breadcrumb zone name
  if (selectedZoneId.value) {
    dashStore.breadcrumb.zoneName = selectedZoneName.value
  }
})

onUnmounted(() => {
  dashStore.breadcrumb.sensorName = ''
})

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

// =============================================================================
// Level 1: Zone KPI Aggregation (using aggregateZoneSensors)
// =============================================================================

/** Zone health status — traffic-light pattern */
type ZoneHealthStatus = 'ok' | 'warning' | 'alarm'

interface ZoneKPI {
  zoneId: string
  zoneName: string
  sensorCount: number
  actuatorCount: number
  activeSensors: number
  activeActuators: number
  alarmCount: number
  aggregation: ReturnType<typeof aggregateZoneSensors>
  /** Newest sensor reading timestamp across all devices in this zone */
  lastActivity: string | null
  /** Computed zone health status */
  healthStatus: ZoneHealthStatus
  /** Number of online ESP devices in this zone */
  onlineDevices: number
  /** Total ESP devices in this zone */
  totalDevices: number
}

/** Stale threshold: zone considered stale if no sensor event for >60s */
const ZONE_STALE_THRESHOLD_MS = 60_000

function getZoneHealthStatus(
  alarmCount: number,
  activeSensors: number,
  sensorCount: number,
  onlineDevices: number,
  totalDevices: number,
  emergencyStoppedCount: number,
): ZoneHealthStatus {
  // Red: all devices offline OR no active sensors when sensors exist
  if (totalDevices > 0 && onlineDevices === 0) return 'alarm'
  if (sensorCount > 0 && activeSensors === 0) return 'alarm'
  // Yellow: some alarms OR some sensors offline OR emergency-stopped actuators
  // (matches ZonePlate warning logic in HardwareView for consistency)
  if (alarmCount > 0 || (sensorCount > 0 && activeSensors < sensorCount)) return 'warning'
  if (emergencyStoppedCount > 0) return 'warning'
  // Green: everything OK
  return 'ok'
}

const HEALTH_STATUS_CONFIG: Record<ZoneHealthStatus, { label: string; colorClass: string }> = {
  ok: { label: 'Alles OK', colorClass: 'zone-status--ok' },
  warning: { label: 'Warnung', colorClass: 'zone-status--warning' },
  alarm: { label: 'Alarm', colorClass: 'zone-status--alarm' },
}

const zoneKPIs = computed<ZoneKPI[]>(() => {
  const groups = groupDevicesByZone(espStore.devices)
  return groups
    .filter(g => g.zoneId !== ZONE_UNASSIGNED)
    .map(group => {
      let sensorCount = 0
      let actuatorCount = 0
      let activeSensors = 0
      let activeActuators = 0
      let alarmCount = 0
      let emergencyStoppedCount = 0
      let newestTimestamp: string | null = null
      let onlineDevices = 0

      for (const device of group.devices) {
        const sensors = (device.sensors as MockSensor[]) || []
        const actuators = (device.actuators as MockActuator[]) || []

        sensorCount += sensors.length
        actuatorCount += actuators.length
        activeSensors += sensors.filter(s => s.quality !== 'error' && s.quality !== 'stale').length
        activeActuators += actuators.filter(a => a.state).length
        alarmCount += sensors.filter(s => s.quality === 'error' || s.quality === 'bad').length
        emergencyStoppedCount += actuators.filter(a => (a as any).emergency_stopped).length

        // Track online devices
        const status = getESPStatus(device as any)
        if (status === 'online' || status === 'stale') {
          onlineDevices++
        }

        // Track newest sensor reading (with timestamp sanity check)
        for (const sensor of sensors) {
          const ts = (sensor as any).last_read || (sensor as any).last_reading_at
          if (ts) {
            const parsed = new Date(ts).getTime()
            // Skip corrupt timestamps (before 2020 or after 2100)
            if (!isNaN(parsed) && parsed > 1577836800000 && parsed < 4102444800000) {
              if (!newestTimestamp || ts > newestTimestamp) {
                newestTimestamp = ts
              }
            }
          }
        }

        // Fallback: use device last_seen if no sensor timestamps
        if (!newestTimestamp) {
          const deviceTs = (device as any).last_seen || (device as any).last_heartbeat
          if (deviceTs && (!newestTimestamp || deviceTs > newestTimestamp)) {
            newestTimestamp = deviceTs
          }
        }
      }

      const aggregation = aggregateZoneSensors(group.devices)
      const totalDevices = group.devices.length
      const healthStatus = getZoneHealthStatus(alarmCount, activeSensors, sensorCount, onlineDevices, totalDevices, emergencyStoppedCount)

      return {
        zoneId: group.zoneId,
        zoneName: group.zoneName,
        sensorCount,
        actuatorCount,
        activeSensors,
        activeActuators,
        alarmCount,
        aggregation,
        lastActivity: newestTimestamp,
        healthStatus,
        onlineDevices,
        totalDevices,
      }
    })
})

/** Check if a zone's last activity is stale (>60s ago) */
function isZoneStale(lastActivity: string | null): boolean {
  if (!lastActivity) return true
  const then = new Date(lastActivity).getTime()
  // Sanity: invalid or unreasonable timestamps (before 2020 or after 2100) are stale
  if (isNaN(then) || then < 1577836800000 || then > 4102444800000) return true
  const age = Date.now() - then
  return age > ZONE_STALE_THRESHOLD_MS
}

// =============================================================================
// Level 1: System Summary (dynamic subtitle)
// =============================================================================

const systemSummary = computed(() => {
  const zones = zoneKPIs.value
  const zoneCount = zones.length
  const totalSensors = zones.reduce((sum, z) => sum + z.sensorCount, 0)
  const activeSensors = zones.reduce((sum, z) => sum + z.activeSensors, 0)
  const totalAlarms = zones.reduce((sum, z) => sum + z.alarmCount, 0)
  const totalActuators = zones.reduce((sum, z) => sum + z.actuatorCount, 0)
  const activeActuators = zones.reduce((sum, z) => sum + z.activeActuators, 0)
  return { zoneCount, totalSensors, activeSensors, totalAlarms, totalActuators, activeActuators }
})

/** Cross-zone dashboards: max visible on L1 */
const MAX_CROSS_ZONE_VISIBLE = 4
const showAllCrossZone = ref(false)

const visibleCrossZoneDashboards = computed(() => {
  const all = dashStore.crossZoneDashboards
  if (showAllCrossZone.value || all.length <= MAX_CROSS_ZONE_VISIBLE) return all
  return all.slice(0, MAX_CROSS_ZONE_VISIBLE)
})

// =============================================================================
// Level 2: Filtered zone data from composable
// =============================================================================

const zoneSensorGroup = computed(() => {
  if (!selectedZoneId.value) return null
  return sensorsByZone.value.find(z => z.zoneId === selectedZoneId.value) ?? null
})

const zoneActuatorGroup = computed(() => {
  if (!selectedZoneId.value) return null
  return actuatorsByZone.value.find(z => z.zoneId === selectedZoneId.value) ?? null
})

const selectedZoneName = computed(() => {
  if (!selectedZoneId.value) return ''
  const device = espStore.devices.find(d => d.zone_id === selectedZoneId.value)
  return device?.zone_name || selectedZoneId.value
})

const zoneSensorCount = computed(() => zoneSensorGroup.value?.sensorCount ?? 0)
const zoneActuatorCount = computed(() => zoneActuatorGroup.value?.actuatorCount ?? 0)

// Reactive breadcrumb update — when devices load after mount, zone_id → zone_name
watch(selectedZoneName, (name) => {
  if (name && selectedZoneId.value) {
    dashStore.breadcrumb.zoneName = name
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
    } else {
      // Default: all expanded if ≤4 subzones, else only first expanded
      collapsedSubzones.value = new Set()
    }
  } catch {
    collapsedSubzones.value = new Set()
  }
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

// Load accordion state when zone changes
const prevZoneId = ref<string | null>(null)
onMounted(() => {
  if (selectedZoneId.value && selectedZoneId.value !== prevZoneId.value) {
    loadAccordionState(selectedZoneId.value)
    prevZoneId.value = selectedZoneId.value
  }
})

// =============================================================================
// Navigation
// =============================================================================

function goToZone(zoneId: string) {
  router.push({ name: 'monitor-zone', params: { zoneId } })
}

function goBack() {
  router.push({ name: 'monitor' })
}

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

function handleClaimLayout(layoutId: string) {
  dashStore.claimAutoLayout(layoutId)
  router.push({ path: '/editor', query: { layout: layoutId } })
}
</script>

<template>
  <div class="monitor-view">
    <!-- View Tab Bar (Hardware / Monitor / Dashboard) -->
    <ViewTabBar />

    <!-- Level 1: Zone Overview -->
    <template v-if="!isZoneDetail">
      <!-- L1 Header: Dynamic system summary (no redundant page title — ViewTabBar shows "Monitor") -->
      <div class="monitor-l1-header">
        <p class="monitor-l1-header__summary" :class="{ 'monitor-l1-header__summary--alarm': systemSummary.totalAlarms > 0 }">
          {{ systemSummary.zoneCount }} {{ systemSummary.zoneCount === 1 ? 'Zone' : 'Zonen' }}
          <span class="monitor-l1-header__dot">&middot;</span>
          {{ systemSummary.activeSensors }}/{{ systemSummary.totalSensors }} Sensoren online
          <template v-if="systemSummary.totalAlarms > 0">
            <span class="monitor-l1-header__dot">&middot;</span>
            <span class="monitor-l1-header__alarm-text">
              <AlertTriangle class="w-3.5 h-3.5" />
              {{ systemSummary.totalAlarms }} {{ systemSummary.totalAlarms === 1 ? 'Alarm' : 'Alarme' }}
            </span>
          </template>
        </p>
      </div>

      <!-- Empty State -->
      <div v-if="zoneKPIs.length === 0" class="monitor-view__empty">
        <Activity class="w-12 h-12" style="color: var(--color-text-muted)" />
        <p>Keine Zonen mit Geraeten vorhanden.</p>
      </div>

      <!-- Zone Tiles Grid -->
      <div v-else class="monitor-zone-grid">
        <div
          v-for="zone in zoneKPIs"
          :key="zone.zoneId"
          :class="['monitor-zone-tile', `monitor-zone-tile--${zone.healthStatus}`]"
          @click="goToZone(zone.zoneId)"
        >
          <!-- Header: Zone Name + Status Ampel -->
          <div class="monitor-zone-tile__header">
            <h3 class="monitor-zone-tile__name">{{ zone.zoneName }}</h3>
            <span :class="['monitor-zone-tile__status', HEALTH_STATUS_CONFIG[zone.healthStatus].colorClass]">
              <CheckCircle2 v-if="zone.healthStatus === 'ok'" class="w-3.5 h-3.5" />
              <AlertTriangle v-else-if="zone.healthStatus === 'warning'" class="w-3.5 h-3.5" />
              <XCircle v-else class="w-3.5 h-3.5" />
              <span>{{ HEALTH_STATUS_CONFIG[zone.healthStatus].label }}</span>
            </span>
          </div>

          <!-- KPIs from aggregateZoneSensors -->
          <div v-if="zone.aggregation.sensorTypes.length > 0" class="monitor-zone-tile__kpis">
            <div
              v-for="st in zone.aggregation.sensorTypes"
              :key="st.type"
              class="monitor-zone-tile__kpi"
            >
              <span class="monitor-zone-tile__kpi-label">{{ st.label }}</span>
              <span class="monitor-zone-tile__kpi-value">
                {{ formatAggregatedValue(st, zone.aggregation.deviceCount) }}
              </span>
            </div>
          </div>
          <div v-else class="monitor-zone-tile__kpis-empty">
            Keine Sensordaten
          </div>

          <!-- Footer: Sensor/Actuator Counts + Last Activity -->
          <div class="monitor-zone-tile__footer">
            <div class="monitor-zone-tile__counts">
              <span :class="['monitor-zone-tile__count', {
                'monitor-zone-tile__count--ok': zone.activeSensors === zone.sensorCount && zone.sensorCount > 0,
                'monitor-zone-tile__count--warn': zone.activeSensors < zone.sensorCount && zone.activeSensors > 0,
                'monitor-zone-tile__count--alarm': zone.sensorCount > 0 && zone.activeSensors === 0,
              }]">
                {{ zone.activeSensors }}/{{ zone.sensorCount }} Sensoren
              </span>
              <span :class="['monitor-zone-tile__count', {
                'monitor-zone-tile__count--ok': zone.activeActuators > 0,
              }]">
                {{ zone.activeActuators }}/{{ zone.actuatorCount }} Aktoren
              </span>
            </div>
            <div class="monitor-zone-tile__activity" :class="{ 'monitor-zone-tile__activity--stale': isZoneStale(zone.lastActivity) }">
              <Clock class="w-3 h-3" />
              <span>{{ zone.lastActivity ? formatRelativeTime(zone.lastActivity) : 'Keine Daten' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cross-Zone Dashboards -->
      <section v-if="dashStore.crossZoneDashboards.length > 0" class="monitor-dashboards">
        <h3 class="monitor-section__title">Cross-Zone Dashboards</h3>
        <div class="monitor-dashboard-links">
          <router-link
            v-for="dash in visibleCrossZoneDashboards"
            :key="dash.id"
            :to="{ path: '/editor', query: { layout: dash.id } }"
            class="monitor-dashboard-link"
          >
            <LayoutDashboard class="w-4 h-4" style="color: var(--color-iridescent-2)" />
            <div class="monitor-dashboard-link__info">
              <span class="monitor-dashboard-link__name">{{ dash.name }}</span>
              <span class="monitor-dashboard-link__meta">
                {{ dash.widgets.length }} Widgets
                <span class="monitor-dashboard-link__updated">{{ formatRelativeTime(dash.updatedAt) }}</span>
              </span>
            </div>
          </router-link>
        </div>
        <button
          v-if="dashStore.crossZoneDashboards.length > MAX_CROSS_ZONE_VISIBLE && !showAllCrossZone"
          class="monitor-dashboards__show-all"
          @click.stop="showAllCrossZone = true"
        >
          Alle {{ dashStore.crossZoneDashboards.length }} Dashboards anzeigen
        </button>
      </section>

      <!-- Logic Rules Section (placeholder — implementation in auftrag-logic-rules-live-monitoring-integration.md) -->
      <!-- Will contain: active rules with status, 24h trigger counter, zone tags, quick-access to rule detail -->
    </template>

    <!-- Level 2: Zone Data Detail (Subzone Accordion) -->
    <template v-else>
      <div class="monitor-view__header">
        <button class="monitor-view__back" @click="goBack">
          <ArrowLeft class="w-4 h-4" />
          <span>Zurück</span>
        </button>
        <h2 class="monitor-view__title">{{ selectedZoneName }}</h2>
      </div>

      <!-- Zone Dashboards -->
      <section v-if="selectedZoneId && dashStore.zoneDashboards(selectedZoneId).length > 0" class="monitor-dashboards">
        <h3 class="monitor-section__title">Zone-Dashboards</h3>
        <div class="monitor-dashboard-links">
          <div
            v-for="dash in dashStore.zoneDashboards(selectedZoneId!)"
            :key="dash.id"
            class="monitor-dashboard-link-wrap"
          >
            <router-link
              :to="{ path: '/editor', query: { layout: dash.id } }"
              class="monitor-dashboard-link"
            >
              <LayoutDashboard class="w-4 h-4" style="color: var(--color-iridescent-2)" />
              <div class="monitor-dashboard-link__info">
                <span class="monitor-dashboard-link__name">{{ dash.name }}</span>
                <span class="monitor-dashboard-link__meta">
                  {{ dash.widgets.length }} Widgets
                  <span v-if="dash.autoGenerated" class="monitor-dashboard-link__auto">Auto</span>
                </span>
              </div>
            </router-link>
            <button
              v-if="dash.autoGenerated"
              class="monitor-dashboard-link__claim"
              @click="handleClaimLayout(dash.id)"
            >
              Anpassen
            </button>
          </div>
        </div>
      </section>

      <!-- Sensors Section (Subzone Accordion) -->
      <section v-if="zoneSensorGroup && zoneSensorGroup.sensorCount > 0" class="monitor-section">
        <h3 class="monitor-section__title">Sensoren ({{ zoneSensorCount }})</h3>

        <div
          v-for="subzone in zoneSensorGroup.subzones"
          :key="subzone.subzoneId ?? '__none__'"
          class="monitor-subzone"
        >
          <!-- Subzone Header (only if multiple subzones or has name) -->
          <button
            v-if="zoneSensorGroup.subzones.length > 1 || subzone.subzoneName"
            :class="['monitor-subzone__header', { 'monitor-subzone__header--collapsed': !isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId)) }]"
            @click="toggleSubzone(getSubzoneKey(selectedZoneId, subzone.subzoneId))"
          >
            <ChevronRight
              :class="['monitor-subzone__chevron', { 'monitor-subzone__chevron--expanded': isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId)) }]"
            />
            <span class="monitor-subzone__name">{{ subzone.subzoneName || 'Keine Subzone' }}</span>
            <span class="monitor-subzone__count">{{ subzone.sensors.length }} {{ subzone.sensors.length === 1 ? 'Sensor' : 'Sensoren' }}</span>
          </button>

          <!-- Sensor Cards -->
          <Transition name="accordion">
            <div
              v-show="zoneSensorGroup.subzones.length <= 1 && !subzone.subzoneName ? true : isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId))"
              class="monitor-card-grid"
            >
              <div
                v-for="sensor in subzone.sensors"
                :key="`${sensor.esp_id}-${sensor.gpio}`"
                :class="[
                  'monitor-sensor-card',
                  { 'monitor-sensor-card--expanded': expandedSensorKey === getSensorKey(sensor.esp_id, sensor.gpio) }
                ]"
              >
                <SensorCard
                  :sensor="sensor"
                  mode="monitor"
                  :sparkline-data="sparklineCache.get(getSensorKey(sensor.esp_id, sensor.gpio))"
                  @click="toggleExpanded(getSensorKey(sensor.esp_id, sensor.gpio))"
                />

                <!-- Expanded Chart Panel -->
                <Transition name="expand">
                  <div
                    v-if="expandedSensorKey === getSensorKey(sensor.esp_id, sensor.gpio)"
                    class="monitor-sensor-card__charts"
                    @click.stop
                  >
                    <div class="monitor-sensor-card__charts-grid">
                      <div class="monitor-sensor-card__gauge">
                        <GaugeChart
                          :value="sensor.raw_value"
                          :unit="getSensorUnit(sensor.sensor_type) !== 'raw' ? getSensorUnit(sensor.sensor_type) : (sensor.unit || '')"
                          size="sm"
                        />
                      </div>
                      <div class="monitor-sensor-card__live-chart">
                        <LiveLineChart
                          :data="sparklineCache.get(getSensorKey(sensor.esp_id, sensor.gpio)) || []"
                          height="120px"
                          :unit="getSensorUnit(sensor.sensor_type) !== 'raw' ? getSensorUnit(sensor.sensor_type) : (sensor.unit || '')"
                          :fill="true"
                        />
                      </div>
                    </div>

                    <!-- Historical Chart -->
                    <div class="monitor-sensor-card__historical">
                      <!-- Time range buttons only when SlideOver is not open -->
                      <div v-if="!showSensorDetail" class="monitor-sensor-card__time-range">
                        <button
                          v-for="tr in (['1h', '6h', '24h', '7d'] as const)"
                          :key="tr"
                          :class="['monitor-sensor-card__time-btn', { 'monitor-sensor-card__time-btn--active': historicalTimeRange === tr }]"
                          @click.stop="historicalTimeRange = tr"
                        >{{ tr }}</button>
                      </div>
                      <HistoricalChart
                        :esp-id="sensor.esp_id"
                        :gpio="sensor.gpio"
                        :sensor-type="sensor.sensor_type"
                        :time-range="historicalTimeRange"
                      />
                    </div>

                    <!-- Action Buttons -->
                    <div class="monitor-sensor-card__actions">
                      <button
                        class="monitor-sensor-card__detail-btn"
                        @click.stop="openSensorDetail(sensor)"
                      >
                        <ChevronRight class="w-4 h-4" />
                        <span>Zeitreihe anzeigen</span>
                      </button>
                      <button
                        class="monitor-sensor-card__detail-btn monitor-sensor-card__detail-btn--secondary"
                        @click.stop="router.push({ name: 'sensors', query: { sensor: `${sensor.esp_id}-gpio${sensor.gpio}` } })"
                      >
                        <Settings class="w-4 h-4" />
                        <span>Konfiguration</span>
                      </button>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </Transition>
        </div>
      </section>

      <!-- Actuators Section (Subzone Accordion) -->
      <section v-if="zoneActuatorGroup && zoneActuatorGroup.actuatorCount > 0" class="monitor-section">
        <h3 class="monitor-section__title">Aktoren ({{ zoneActuatorCount }})</h3>

        <div
          v-for="subzone in zoneActuatorGroup.subzones"
          :key="subzone.subzoneId ?? '__none__'"
          class="monitor-subzone"
        >
          <!-- Subzone Header -->
          <button
            v-if="zoneActuatorGroup.subzones.length > 1 || subzone.subzoneName"
            :class="['monitor-subzone__header', { 'monitor-subzone__header--collapsed': !isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId)) }]"
            @click="toggleSubzone(getSubzoneKey(selectedZoneId, subzone.subzoneId))"
          >
            <ChevronRight
              :class="['monitor-subzone__chevron', { 'monitor-subzone__chevron--expanded': isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId)) }]"
            />
            <span class="monitor-subzone__name">{{ subzone.subzoneName || 'Keine Subzone' }}</span>
            <span class="monitor-subzone__count">{{ subzone.actuators.length }} {{ subzone.actuators.length === 1 ? 'Aktor' : 'Aktoren' }}</span>
          </button>

          <!-- Actuator Cards -->
          <Transition name="accordion">
            <div
              v-show="zoneActuatorGroup.subzones.length <= 1 && !subzone.subzoneName ? true : isSubzoneExpanded(getSubzoneKey(selectedZoneId, subzone.subzoneId))"
              class="monitor-card-grid"
            >
              <ActuatorCard
                v-for="actuator in subzone.actuators"
                :key="`${actuator.esp_id}-${actuator.gpio}`"
                :actuator="actuator"
                mode="monitor"
                @toggle="toggleActuator"
              />
            </div>
          </Transition>
        </div>
      </section>

      <div v-if="zoneSensorCount === 0 && zoneActuatorCount === 0" class="monitor-view__empty">
        <Activity class="w-12 h-12" style="color: var(--color-text-muted)" />
        <p>Keine Sensoren oder Aktoren in dieser Zone.</p>
      </div>
    </template>

    <!-- Level 3: Sensor Detail SlideOver -->
    <SlideOver
      :open="showSensorDetail"
      :title="selectedDetailSensor?.name || 'Sensor-Detail'"
      width="lg"
      @close="closeSensorDetail"
    >
      <template v-if="selectedDetailSensor">
        <!-- Breadcrumb -->
        <div class="sensor-detail__breadcrumb">
          Monitor → {{ selectedZoneName }} → {{ selectedDetailSensor.name }}
        </div>

        <!-- Time Range Selector -->
        <TimeRangeSelector
          v-model="detailPreset"
          @range-change="onDetailRangeChange"
        />

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

        <!-- Chart -->
        <div v-else class="sensor-detail__chart-wrap">
          <div class="sensor-detail__chart-header">
            <span class="sensor-detail__point-count">
              {{ detailReadings.length }} Datenpunkte
            </span>
            <button class="sensor-detail__export-btn" @click="exportDetailCsv">
              <Download :size="14" /> CSV Export
            </button>
          </div>
          <div class="sensor-detail__chart" style="height: 350px">
            <Line :data="detailChartData" :options="detailChartOptions" />
          </div>
        </div>
      </template>
    </SlideOver>
  </div>
</template>

<style scoped>
.monitor-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.monitor-view__title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   L1 HEADER — Dynamic system summary
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-l1-header {
  display: flex;
  align-items: center;
}

.monitor-l1-header__summary {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.monitor-l1-header__summary--alarm {
  color: var(--color-text-secondary);
}

.monitor-l1-header__dot {
  color: var(--color-text-muted);
  margin: 0 var(--space-1);
}

.monitor-l1-header__alarm-text {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--color-warning);
  font-weight: 600;
}

.monitor-view__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.monitor-view__back {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.monitor-view__back:hover {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
}

.monitor-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12);
  text-align: center;
  color: var(--color-text-muted);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONE TILES (Level 1)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-zone-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

@media (max-width: 639px) {
  .monitor-zone-grid {
    grid-template-columns: 1fr;
  }
}

.monitor-zone-tile {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border-left: 3px solid var(--glass-border);
}

.monitor-zone-tile--ok {
  border-left-color: var(--color-success);
}

.monitor-zone-tile--warning {
  border-left-color: var(--color-warning);
}

.monitor-zone-tile--alarm {
  border-left-color: var(--color-error);
}

.monitor-zone-tile:hover {
  border-color: var(--color-accent);
  border-left-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.monitor-zone-tile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.monitor-zone-tile__name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* Status Ampel: Farbe + Text + Icon (doppelte Kodierung) */
.monitor-zone-tile__status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.zone-status--ok {
  color: var(--color-success);
}

.zone-status--warning {
  color: var(--color-warning);
}

.zone-status--alarm {
  color: var(--color-error);
}

/* KPIs */
.monitor-zone-tile__kpis {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.monitor-zone-tile__kpi {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.monitor-zone-tile__kpi-label {
  font-size: 10px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.monitor-zone-tile__kpi-value {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.monitor-zone-tile__kpis-empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}

/* Footer: counts + activity */
.monitor-zone-tile__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--glass-border);
}

.monitor-zone-tile__counts {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-xs);
}

.monitor-zone-tile__count {
  color: var(--color-text-muted);
}

.monitor-zone-tile__count--ok {
  color: var(--color-success);
}

.monitor-zone-tile__count--warn {
  color: var(--color-warning);
}

.monitor-zone-tile__count--alarm {
  color: var(--color-error);
}

.monitor-zone-tile__activity {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.monitor-zone-tile__activity--stale {
  color: var(--color-warning);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUBZONE ACCORDION (Level 2)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
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

.monitor-subzone__count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SENSOR/ACTUATOR CARDS (Level 2)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}

/* Sensor Card */
.monitor-sensor-card {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--color-status-good);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.monitor-sensor-card:hover {
  border-color: var(--glass-border-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

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

.monitor-sensor-card__charts-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: var(--space-3);
  align-items: start;
}

@media (max-width: 480px) {
  .monitor-sensor-card__charts-grid {
    grid-template-columns: 1fr;
  }
}

.monitor-sensor-card__gauge {
  display: flex;
  align-items: center;
  justify-content: center;
}

.monitor-sensor-card__live-chart {
  min-width: 0;
}

.monitor-sensor-card__historical {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.monitor-sensor-card__time-range {
  display: flex;
  gap: 2px;
  background: var(--color-bg-primary);
  padding: 2px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  width: fit-content;
}

.monitor-sensor-card__time-btn {
  padding: 2px 8px;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.monitor-sensor-card__time-btn:hover {
  color: var(--color-text-secondary);
}

.monitor-sensor-card__time-btn--active {
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
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

.monitor-dashboards {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.monitor-dashboard-links {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.monitor-dashboard-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: inherit;
  transition: all var(--transition-fast);
  min-width: 180px;
}

.monitor-dashboard-link:hover {
  border-color: var(--color-iridescent-2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.monitor-dashboard-link__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.monitor-dashboard-link__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.monitor-dashboard-link__meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.monitor-dashboard-link__updated {
  color: var(--color-text-muted);
  font-size: 10px;
}

.monitor-dashboard-link__updated::before {
  content: '\00b7';
  margin-right: var(--space-1);
}

.monitor-dashboards__show-all {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-accent-bright);
  background: transparent;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  align-self: flex-start;
}

.monitor-dashboards__show-all:hover {
  border-color: var(--color-accent);
  background: rgba(59, 130, 246, 0.06);
}

.monitor-dashboard-link__auto {
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  background: rgba(167, 139, 250, 0.15);
  color: var(--color-iridescent-3);
  border-radius: 3px;
}

.monitor-dashboard-link-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.monitor-dashboard-link__claim {
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-iridescent-2);
  background: transparent;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  align-self: flex-start;
}

.monitor-dashboard-link__claim:hover {
  border-color: var(--color-iridescent-2);
  background: rgba(129, 140, 248, 0.06);
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
  background: rgba(59, 130, 246, 0.06);
}

.monitor-sensor-card__detail-btn--secondary {
  color: var(--color-text-secondary);
}

.monitor-sensor-card__detail-btn--secondary:hover {
  color: var(--color-text-primary);
  border-color: var(--color-border-hover, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
}

.monitor-sensor-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SENSOR DETAIL SLIDEOVER CONTENT
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-detail__breadcrumb {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
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

.sensor-detail__export-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensor-detail__export-btn:hover {
  border-color: var(--color-iridescent-1);
  color: var(--color-text-primary);
}

.sensor-detail__chart {
  position: relative;
  width: 100%;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}
</style>
