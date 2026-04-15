<script setup lang="ts">
/**
 * GaugeWidget — GaugeChart widget for dashboard
 *
 * Fix: Uses local sensorId ref to survive render() one-shot props.
 * 8.1-A: Passes min/max/threshold config to GaugeChart for correct scale and color zones.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useEspStore } from '@/stores/esp'
import GaugeChart from '@/components/charts/GaugeChart.vue'
import {
  SENSOR_TYPE_CONFIG,
  getSensorUnit,
  aggregateZoneSensors,
  getAggCategoryGaugeRange,
  getSensorAggCategory,
  type AggCategory,
} from '@/utils/sensorDefaults'
import { tokens } from '@/utils/cssTokens'
import type { GaugeThreshold } from '@/components/charts/types'
import type { MockSensor } from '@/types'
import { useSensorId } from '@/composables/useSensorId'
import { useSensorOptions } from '@/composables/useSensorOptions'
import { useZoneDragDrop } from '@/composables/useZoneDragDrop'

/** Monitor L1 zone-tile: gauge = spot sensor vs Ø row above */
const GAUGE_TILE_SPOT_TOOLTIP =
  'Messwert eines Sensors in dieser Zone (Auswahl nach Priorität). Das Zonenmittel (Ø) steht in der KPI-Zeile darüber.'

const GAUGE_TILE_SPOT_ARIA =
  'Repräsentativ: ein Sensor in der Zone. Zonenmittel siehe KPI-Zeile oben.'

const GAUGE_TILE_ZONE_AVG_TOOLTIP =
  'Zonenmittel (Ø) aus derselben Aggregation wie die KPI-Zeile oben (Kategorie gemittelt, veraltete Werte ausgeschlossen).'

const GAUGE_TILE_ZONE_AVG_ARIA =
  'Zonenmittel wie KPI-Zeile oben, gleiche Berechnung pro Kategorie.'

interface Props {
  sensorId?: string // "espId:gpio:sensorType"
  zoneId?: string   // Zone-scoped sensor filtering (PA-02c)
  /** `zone_avg`: Wert aus {@link aggregateZoneSensors} für `aggCategory` (gleiche Quelle wie ZoneTileCard-Ø). */
  valueSource?: 'sensor' | 'zone_avg'
  /** Kategorie für `valueSource === 'zone_avg'` (Pflicht bei zone_avg). */
  aggCategory?: AggCategory
  /** When true (compact zone-tile panel), show Repräsentativ label + tooltip (vs Zonenmittel Ø). */
  tileSpotSemantics?: boolean
  /** Compact zone-tile: Gauge zeigt Zonenmittel wie KPI-Zeile (kein Repräsentativ-Spot). */
  tileZoneAvgSemantics?: boolean
  title?: string
  yMin?: number
  yMax?: number
  warnLow?: number
  warnHigh?: number
  alarmLow?: number
  alarmHigh?: number
  showThresholds?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  tileSpotSemantics: false,
  tileZoneAvgSemantics: false,
  valueSource: 'sensor',
})
const emit = defineEmits<{
  'update:config': [config: { sensorId: string }]
}>()

const espStore = useEspStore()
const { groupDevicesByZone } = useZoneDragDrop()

// Local sensorId state — survives render() one-shot props (Bug 1b fix)
const localSensorId = ref(props.sensorId || '')
const localZoneId = ref<string | undefined>(props.zoneId)

// Sync from props when they change (e.g. page reload with saved config)
watch(() => props.sensorId, (v) => { if (v) localSensorId.value = v })
watch(() => props.zoneId, (v) => { localZoneId.value = v })

// Centralized sensorId parsing
const { espId: parsedEspId, gpio: parsedGpio, sensorType: parsedSensorType, isValid: sensorIdValid } = useSensorId(localSensorId)

// Centralized sensor options (deduplicated, zone-filtered via PA-02c)
const { flatSensorOptions: availableSensors } = useSensorOptions(localZoneId)

/** Geräte in dieser Zone — gleiche Gruppierung wie useZoneKPIs für aggregateZoneSensors */
const zoneGroupDevices = computed(() => {
  if (!props.zoneId) return []
  const groups = groupDevicesByZone(espStore.devices as any[])
  const g = groups.find(x => x.zoneId === props.zoneId)
  return g?.devices ?? []
})

const zoneAggregation = computed(() => aggregateZoneSensors(zoneGroupDevices.value))

const resolvedAggCategory = computed<AggCategory | null>(() => {
  if (props.aggCategory) return props.aggCategory
  if (props.valueSource === 'zone_avg' && sensorType.value) {
    const c = getSensorAggCategory(sensorType.value)
    return c === 'other' ? null : c
  }
  return null
})

const effectiveZoneAvgRow = computed(() => {
  if (props.valueSource !== 'zone_avg') return null
  const cat = resolvedAggCategory.value
  if (!cat) return null
  return zoneAggregation.value.sensorTypes.find(st => st.type === cat) ?? null
})

const useZoneAvgChannel = computed(
  () => props.valueSource === 'zone_avg' && !!props.zoneId && !!effectiveZoneAvgRow.value && effectiveZoneAvgRow.value.count > 0,
)

// Current sensor data — uses parsed sensorId parts
const currentSensor = computed(() => {
  if (!sensorIdValid.value) return null
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === parsedEspId.value)
  if (!device) return null
  return ((device.sensors as MockSensor[]) || []).find(s =>
    s.gpio === parsedGpio.value && (!parsedSensorType.value || s.sensor_type === parsedSensorType.value)
  ) || null
})

// Sensor type from parsed sensorId or from currentSensor
const sensorType = computed(() => {
  return parsedSensorType.value || currentSensor.value?.sensor_type || null
})

// Unit fallback for mock sensors that do not carry `unit` consistently
const displayUnit = computed(() => {
  if (useZoneAvgChannel.value && effectiveZoneAvgRow.value) {
    return effectiveZoneAvgRow.value.unit
  }
  const type = sensorType.value
  if (!type) return currentSensor.value?.unit || ''
  const resolved = getSensorUnit(type)
  return resolved !== 'raw' ? resolved : (currentSensor.value?.unit || '')
})

// SENSOR_TYPE_CONFIG defaults as fallback for min/max
const sensorTypeDefaults = computed(() => {
  if (!sensorType.value) return null
  return SENSOR_TYPE_CONFIG[sensorType.value] ?? null
})

const aggGaugeRange = computed(() => {
  const cat = resolvedAggCategory.value
  if (!cat) return null
  return getAggCategoryGaugeRange(cat)
})

// Effective min/max: config > zone-avg category scale > SENSOR_TYPE_CONFIG > 0/100
const effectiveMin = computed(() => {
  if (props.yMin != null) return props.yMin
  if (useZoneAvgChannel.value && aggGaugeRange.value) return aggGaugeRange.value.min
  return sensorTypeDefaults.value?.min ?? 0
})
const effectiveMax = computed(() => {
  if (props.yMax != null) return props.yMax
  if (useZoneAvgChannel.value && aggGaugeRange.value) return aggGaugeRange.value.max
  return sensorTypeDefaults.value?.max ?? 100
})

const gaugeChartValue = computed(() => {
  if (useZoneAvgChannel.value && effectiveZoneAvgRow.value) {
    return effectiveZoneAvgRow.value.avg
  }
  return currentSensor.value?.raw_value ?? 0
})

const showGaugeChart = computed(() => {
  if (useZoneAvgChannel.value) return true
  return !!(localSensorId.value && currentSensor.value)
})

// Build GaugeThreshold[] from threshold props
// Pattern: alarmLow < warnLow < warnHigh < alarmHigh
// Zones: [min..alarmLow] = alarm, [alarmLow..warnLow] = warning, [warnLow..warnHigh] = good, [warnHigh..alarmHigh] = warning, [alarmHigh..max] = alarm
const gaugeThresholds = computed<GaugeThreshold[]>(() => {
  const hasThresholds = props.warnLow != null || props.warnHigh != null ||
    props.alarmLow != null || props.alarmHigh != null

  if (!hasThresholds) {
    // No thresholds configured: single green zone across entire range
    return [{ value: effectiveMin.value, color: tokens.statusGood }]
  }

  const thresholds: GaugeThreshold[] = []
  const min = effectiveMin.value
  const aLow = props.alarmLow ?? min
  const wLow = props.warnLow ?? aLow
  const wHigh = props.warnHigh ?? effectiveMax.value
  const aHigh = props.alarmHigh ?? effectiveMax.value

  // Zone from min: alarm if alarmLow > min
  if (aLow > min) {
    thresholds.push({ value: min, color: tokens.statusAlarm })
  }
  // Zone: warning between alarmLow and warnLow
  if (wLow > aLow) {
    thresholds.push({ value: aLow, color: tokens.statusWarning })
  }
  // Zone: good (normal range)
  thresholds.push({ value: wLow, color: tokens.statusGood })
  // Zone: warning between warnHigh and alarmHigh
  if (aHigh > wHigh) {
    thresholds.push({ value: wHigh, color: tokens.statusWarning })
  } else {
    thresholds.push({ value: wHigh, color: tokens.statusAlarm })
  }
  // Zone: alarm above alarmHigh
  if (aHigh < effectiveMax.value && aHigh > wHigh) {
    thresholds.push({ value: aHigh, color: tokens.statusAlarm })
  }

  return thresholds
})

// Adaptive gauge size: detect container height to choose sm/md
const widgetEl = ref<HTMLElement | null>(null)
const gaugeSize = ref<'sm' | 'md'>('md')
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (widgetEl.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        gaugeSize.value = entry.contentRect.height < 90 ? 'sm' : 'md'
      }
    })
    resizeObserver.observe(widgetEl.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

function selectSensor(sensorId: string) {
  localSensorId.value = sensorId  // Immediate local update (Bug 1b fix)
  emit('update:config', { sensorId })
}
</script>

<template>
  <div
    ref="widgetEl"
    class="gauge-widget"
    :class="{
      'gauge-widget--tile-spot': props.tileSpotSemantics,
      'gauge-widget--tile-zone-avg': props.tileZoneAvgSemantics,
    }"
    :title="props.tileSpotSemantics ? GAUGE_TILE_SPOT_TOOLTIP : (props.tileZoneAvgSemantics ? GAUGE_TILE_ZONE_AVG_TOOLTIP : undefined)"
    :role="props.tileSpotSemantics || props.tileZoneAvgSemantics ? 'group' : undefined"
    :aria-label="props.tileSpotSemantics ? GAUGE_TILE_SPOT_ARIA : (props.tileZoneAvgSemantics ? GAUGE_TILE_ZONE_AVG_ARIA : undefined)"
  >
    <span
      v-if="props.tileSpotSemantics"
      class="gauge-widget__spot-label"
      :title="GAUGE_TILE_SPOT_TOOLTIP"
      aria-hidden="true"
    >Repräsentativ</span>
    <span
      v-if="props.tileZoneAvgSemantics"
      class="gauge-widget__zone-avg-label"
      :title="GAUGE_TILE_ZONE_AVG_TOOLTIP"
      aria-hidden="true"
    >Zonenmittel</span>
    <div
      v-if="showGaugeChart"
      class="gauge-widget__chart"
    >
      <GaugeChart
        :value="gaugeChartValue"
        :unit="displayUnit"
        :min="effectiveMin"
        :max="effectiveMax"
        :thresholds="gaugeThresholds"
        :size="gaugeSize"
      />
    </div>
    <div
      v-else-if="props.valueSource === 'zone_avg' && props.zoneId"
      class="gauge-widget__empty gauge-widget__empty--zone-avg"
    >
      <p>Keine Sensordaten</p>
    </div>
    <div v-else class="gauge-widget__empty">
      <p>Sensor auswählen{{ props.title ? ` für ${props.title}` : '' }}:</p>
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

.gauge-widget--tile-spot,
.gauge-widget--tile-zone-avg {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-height: 0;
}

.gauge-widget__spot-label,
.gauge-widget__zone-avg-label {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  line-height: 1.1;
  margin-bottom: var(--space-1);
}

.gauge-widget__zone-avg-label {
  color: var(--color-text-secondary);
}

.gauge-widget__chart {
  flex: 1;
  min-height: 0;
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
