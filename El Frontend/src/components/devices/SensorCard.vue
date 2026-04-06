<script setup lang="ts">
/**
 * SensorCard — Unified sensor card for config and monitor views
 *
 * Config mode: Name, type, ESP-ID, GPIO, settings hint
 * Monitor mode: Name, live value, quality dot, sparkline, ESP-ID
 */
import { computed, ref, type Component } from 'vue'
import { Settings, ChevronRight, WifiOff, Clock, Thermometer, Droplets, Wind, Sun, Gauge, Leaf, Activity, CircleDot, TrendingUp, TrendingDown, Minus, Info } from 'lucide-vue-next'
import type { SensorWithContext } from '@/composables/useZoneGrouping'
import type { TrendDirection } from '@/utils/trendUtils'
import { qualityToStatus, getDataFreshness, formatRelativeTime } from '@/utils/formatters'
import { getSensorLabel, getSensorUnit, getSensorDisplayName, SENSOR_TYPE_CONFIG, VIRTUAL_SENSOR_META } from '@/utils/sensorDefaults'
import { useDeviceContextStore } from '@/shared/stores/deviceContext.store'
import { useZoneStore } from '@/shared/stores/zone.store'

/** Default fallback icon for unknown sensor types */
const DEFAULT_SENSOR_ICON = CircleDot

/** Map SENSOR_TYPE_CONFIG icon names to Lucide components */
const ICON_MAP: Record<string, Component> = {
  Thermometer, Droplets, Wind, Sun, Gauge, Leaf, Activity,
  Droplet: Droplets,
  Zap: Activity,
}

interface Props {
  sensor: SensorWithContext
  mode: 'monitor' | 'config'
  dataMode?: 'Live' | 'Hybrid' | 'Snapshot'
  trend?: TrendDirection
}

const props = withDefaults(defineProps<Props>(), {
  dataMode: 'Hybrid',
})

const emit = defineEmits<{
  configure: [sensor: SensorWithContext]
  click: [sensor: SensorWithContext]
}>()

const displayName = computed(() =>
  getSensorDisplayName({ sensor_type: props.sensor.sensor_type, name: props.sensor.name }) || `GPIO ${props.sensor.gpio}`
)

const sensorLabel = computed(() =>
  getSensorLabel(props.sensor.sensor_type) || props.sensor.sensor_type
)

// Effective quality status: stale overrides actual quality
const effectiveQualityStatus = computed(() =>
  isStale.value ? 'warning' : qualityToStatus(props.sensor.quality)
)

const statusClass = computed(() =>
  `sensor-card__dot--${effectiveQualityStatus.value}`
)

// Data freshness indicator (stale after 120s)
const freshness = computed(() => getDataFreshness(props.sensor.last_read))
const isStale = computed(() => freshness.value === 'stale')
// Value present but no timestamp known
const isTimestampUnknown = computed(() =>
  freshness.value === 'unknown' && props.sensor.raw_value != null
)

// ESP offline indicator
const isEspOffline = computed(() =>
  props.sensor.esp_state !== undefined && props.sensor.esp_state !== 'OPERATIONAL'
)

// Sensor type icon — 3-tier fallback: exact match → base-type suffix → default
const sensorIcon = computed(() => {
  const sType = props.sensor.sensor_type
  // 1. Exact match
  const exactIcon = SENSOR_TYPE_CONFIG[sType]?.icon
  if (exactIcon && ICON_MAP[exactIcon]) return ICON_MAP[exactIcon]
  // 2. Base-type suffix (e.g. "bme280_pressure" → "pressure")
  const suffix = sType.includes('_') ? sType.split('_').pop() : null
  if (suffix) {
    const suffixIcon = SENSOR_TYPE_CONFIG[suffix]?.icon
    if (suffixIcon && ICON_MAP[suffixIcon]) return ICON_MAP[suffixIcon]
  }
  // 3. Default fallback
  return DEFAULT_SENSOR_ICON
})

// Resolved unit: sensor.unit → SENSOR_TYPE_CONFIG fallback
const resolvedUnit = computed(() => {
  const raw = props.sensor.unit
  if (raw && raw !== 'raw') return raw
  const configUnit = getSensorUnit(props.sensor.sensor_type)
  return configUnit !== 'raw' ? configUnit : ''
})

// Quality text label for accessibility (dual encoding: color + text)
const qualityLabel = computed(() => {
  if (isStale.value) return 'Veraltet'
  const status = qualityToStatus(props.sensor.quality)
  const labels: Record<string, string> = {
    good: 'OK',
    warning: 'Warnung',
    alarm: 'Kritisch',
    offline: 'Offline',
  }
  return labels[status] ?? ''
})

// Trend icon + title for accessibility
const TREND_ICONS: Record<TrendDirection, Component> = {
  rising: TrendingUp,
  stable: Minus,
  falling: TrendingDown,
}
const TREND_TITLES: Record<TrendDirection, string> = {
  rising: 'Steigend',
  stable: 'Stabil',
  falling: 'Fallend',
}

// Scope badge (T13-R3 WP4): only show for non-default scopes with DB config
const scopeBadge = computed(() => {
  const scope = props.sensor.device_scope
  if (!scope || scope === 'zone_local') return null
  if (scope === 'multi_zone') return { text: 'Multi-Zone', cls: 'sensor-card__scope-badge--multi-zone' }
  if (scope === 'mobile') return { text: 'Mobil', cls: 'sensor-card__scope-badge--mobile' }
  return null
})

const scopeTooltip = computed(() => {
  if (scopeBadge.value?.text !== 'Multi-Zone') return ''
  const zones = props.sensor.assigned_zones
  if (!zones?.length) return ''
  return `Bedient: ${zones.join(', ')}`
})

// Virtual sensor info (V19-F03): tooltip for server-computed sensors
const virtualMeta = computed(() => VIRTUAL_SENSOR_META[props.sensor.sensor_type] ?? null)
const showVirtualInfo = ref(false)

function toggleVirtualInfo(event: Event): void {
  event.stopPropagation()
  showVirtualInfo.value = !showVirtualInfo.value
}

// Subzone badge (Phase 2.2): "Keine Subzone" when null/empty
const subzoneLabel = computed(() => {
  const name = props.sensor.subzone_name ?? ''
  const id = props.sensor.subzone_id ?? ''
  if (typeof name === 'string' && name.trim()) return name
  if (typeof id === 'string' && id.trim()) return id
  return 'Keine Subzone'
})

// Mobile sensor context (6.7)
const deviceContextStore = useDeviceContextStore()
const zoneStore = useZoneStore()
const isChangingContext = ref(false)

const isMobile = computed(() => props.sensor.device_scope === 'mobile')

const activeContext = computed(() => {
  if (!isMobile.value) return null
  const configId = (props.sensor as SensorWithContext & { config_id?: string }).config_id
  if (!configId) return null
  return deviceContextStore.getContext(configId)
})

const activeZoneName = computed(() => {
  const zoneId = activeContext.value?.active_zone_id
  if (!zoneId) return null
  const entity = zoneStore.zoneEntities.find(z => z.zone_id === zoneId)
  return entity?.name ?? zoneId
})

/** Zones available for context switch (mobile sensors) */
const availableZones = computed(() => {
  if (!isMobile.value) return []
  const assignedZones = props.sensor.assigned_zones
  if (assignedZones && assignedZones.length > 0) {
    return zoneStore.activeZones.filter(z => assignedZones.includes(z.zone_id))
  }
  return zoneStore.activeZones
})

async function handleZoneContextChange(event: Event): Promise<void> {
  const select = event.target as HTMLSelectElement
  const newZoneId = select.value || null
  const configId = (props.sensor as SensorWithContext & { config_id?: string }).config_id
  if (!configId) return

  isChangingContext.value = true
  try {
    if (newZoneId) {
      await deviceContextStore.setContext('sensor', configId, newZoneId)
    } else {
      await deviceContextStore.clearContext('sensor', configId)
    }
  } catch {
    // Toast already shown by store
  } finally {
    isChangingContext.value = false
  }
}

function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  const dec = SENSOR_TYPE_CONFIG[props.sensor.sensor_type]?.decimals ?? 1
  return Number(value).toFixed(dec)
}

function handleClick() {
  if (props.mode === 'config') {
    emit('configure', props.sensor)
  } else {
    emit('click', props.sensor)
  }
}
</script>

<template>
  <div
    :class="[
      'sensor-card',
      `sensor-card--${mode}`,
      mode === 'monitor' ? `sensor-card--${effectiveQualityStatus}` : '',
      mode === 'monitor' && isStale ? 'sensor-card--stale' : '',
      mode === 'monitor' && isEspOffline ? 'sensor-card--esp-offline' : '',
    ]"
    @click="handleClick"
  >
    <!-- Config Mode -->
    <template v-if="mode === 'config'">
      <div class="sensor-card__header">
        <div class="sensor-card__icon sensor-card__icon--config">
          <Settings class="w-5 h-5 text-purple-400" />
        </div>
        <div class="sensor-card__info">
          <p class="sensor-card__name">{{ displayName }}</p>
          <p class="sensor-card__meta">{{ sensor.esp_id }} · {{ sensorLabel }}</p>
          <span class="sensor-card__subzone-badge">{{ subzoneLabel }}</span>
          <span v-if="scopeBadge" :class="['sensor-card__scope-badge', scopeBadge.cls]" :title="scopeTooltip">{{ scopeBadge.text }}</span>
        </div>
        <ChevronRight class="w-4 h-4 text-dark-500 flex-shrink-0" />
      </div>
    </template>

    <!-- Monitor Mode -->
    <template v-else>
      <div class="sensor-card__header">
        <component :is="sensorIcon" class="sensor-card__type-icon" />
        <span class="sensor-card__name" :title="displayName">{{ displayName }}</span>
        <span v-if="virtualMeta" class="sensor-card__virtual-info-trigger" @click="toggleVirtualInfo" @mouseenter="showVirtualInfo = true" @mouseleave="showVirtualInfo = false">
          <Info :size="14" />
          <div v-show="showVirtualInfo" class="sensor-card__virtual-tooltip">
            <p class="sensor-card__virtual-tooltip-heading">Berechnet aus:</p>
            <ul class="sensor-card__virtual-tooltip-list">
              <li v-for="src in virtualMeta.sources" :key="src">{{ src }}</li>
            </ul>
            <p class="sensor-card__virtual-tooltip-formula">Formel: {{ virtualMeta.formula }}</p>
          </div>
        </span>
        <div class="sensor-card__quality">
          <span :class="['sensor-card__mode-badge', `sensor-card__mode-badge--${dataMode.toLowerCase()}`]">
            {{ dataMode }}
          </span>
          <span :class="['sensor-card__dot', statusClass]" />
          <span v-if="qualityLabel" :class="['sensor-card__quality-text', `sensor-card__quality-text--${effectiveQualityStatus}`]">{{ qualityLabel }}</span>
        </div>
      </div>
      <div class="sensor-card__value">
        <span class="sensor-card__number">{{ formatValue(sensor.raw_value) }}</span>
        <span class="sensor-card__unit">{{ resolvedUnit }}</span>
        <span v-if="trend" class="sensor-card__trend" :title="TREND_TITLES[trend]">
          <component :is="TREND_ICONS[trend]" :size="14" />
        </span>
      </div>
      <!-- Sparkline slot: parent can inject a mini chart -->
      <div v-if="$slots.sparkline" class="sensor-card__sparkline">
        <slot name="sparkline" />
      </div>
      <div class="sensor-card__footer">
        <span class="sensor-card__esp">{{ sensor.esp_id }}</span>
        <div class="sensor-card__footer-badges">
          <span class="sensor-card__subzone-badge">{{ subzoneLabel }}</span>
          <span v-if="scopeBadge" :class="['sensor-card__scope-badge', scopeBadge.cls]" :title="scopeTooltip">{{ scopeBadge.text }}</span>
          <span v-if="isEspOffline" class="sensor-card__badge sensor-card__badge--offline">
            <WifiOff class="w-3 h-3" /> ESP offline
          </span>
          <span v-else-if="isStale" class="sensor-card__badge sensor-card__badge--stale">
            <Clock class="w-3 h-3" /> {{ formatRelativeTime(sensor.last_read) }}
          </span>
          <span v-else-if="isTimestampUnknown" class="sensor-card__badge sensor-card__badge--unknown" title="Zeitpunkt des Messwerts unbekannt">
            <Clock class="w-3 h-3" /> Zeitpunkt unbekannt
          </span>
        </div>
      </div>
      <!-- Mobile sensor context hint (6.7) -->
      <div
        v-if="mode === 'monitor' && isMobile && activeContext"
        class="sensor-card__context-hint"
      >
        Aktiv in {{ activeZoneName }} seit {{ formatRelativeTime(activeContext.context_since) }}
      </div>
      <!-- Mobile sensor zone switch (6.7) -->
      <div
        v-if="mode === 'monitor' && isMobile"
        class="sensor-card__context-controls"
      >
        <select
          :value="activeContext?.active_zone_id ?? ''"
          :disabled="isChangingContext"
          class="sensor-card__zone-select"
          @change="handleZoneContextChange($event)"
          @click.stop
        >
          <option value="">Keine Zone</option>
          <option
            v-for="zone in availableZones"
            :key="zone.zone_id"
            :value="zone.zone_id"
          >
            {{ zone.name }}
          </option>
        </select>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sensor-card {
  cursor: pointer;
  transition: all var(--transition-fast);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-tertiary);
}

.sensor-card:hover {
  border-color: var(--color-border-hover, rgba(255, 255, 255, 0.12));
}

/* Config Mode */
.sensor-card--config {
  padding: var(--space-3);
}

.sensor-card--config .sensor-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sensor-card__icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sensor-card__icon--config {
  background: var(--color-mock-bg);
}

.sensor-card__info {
  flex: 1;
  min-width: 0;
}

.sensor-card__name {
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-card__meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-card__info .sensor-card__subzone-badge {
  margin-top: var(--space-1);
  display: inline-block;
}

/* Monitor Mode */
.sensor-card--monitor {
  padding: var(--space-3);
}

.sensor-card--monitor .sensor-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
}

.sensor-card__type-icon {
  width: 14px;
  height: 14px;
  color: var(--color-iridescent-2);
  flex-shrink: 0;
}

.sensor-card--monitor .sensor-card__name {
  font-size: var(--text-sm);
  font-weight: 500;
  flex: 1;
}

.sensor-card__quality {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sensor-card__mode-badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.1;
  color: var(--color-text-secondary);
}

.sensor-card__mode-badge--live {
  color: var(--color-success);
}

.sensor-card__mode-badge--hybrid {
  color: var(--color-info);
}

.sensor-card__mode-badge--snapshot {
  color: var(--color-warning);
}

.sensor-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sensor-card__quality-text {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.sensor-card__quality-text--good { color: var(--color-success); }
.sensor-card__quality-text--warning { color: var(--color-warning); }
.sensor-card__quality-text--alarm { color: var(--color-error); }
.sensor-card__quality-text--offline { color: var(--color-text-muted); }

.sensor-card__sparkline {
  height: 32px;
  margin: 0 0 var(--space-1);
  overflow: hidden;
}

.sensor-card__dot--good {
  background: var(--color-success);
}

.sensor-card__dot--warning {
  background: var(--color-warning);
}

.sensor-card__dot--alarm {
  background: var(--color-error);
}

.sensor-card__dot--offline {
  background: var(--color-text-muted);
}

.sensor-card__value {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
}

.sensor-card__number {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: var(--color-text-primary);
}

.sensor-card__unit {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.sensor-card__trend {
  display: inline-flex;
  align-items: center;
  margin-left: var(--space-1);
  color: var(--color-text-muted);
}

.sensor-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.sensor-card__footer-badges {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.sensor-card__subzone-badge {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-xs);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-quaternary, rgba(255, 255, 255, 0.06));
  color: var(--color-text-secondary);
  border: 1px solid var(--glass-border);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-card__esp {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Status border in monitor mode */
.sensor-card--good { border-color: rgba(52, 211, 153, 0.15); }
.sensor-card--warning { border-color: rgba(251, 191, 36, 0.15); }
.sensor-card--alarm { border-color: rgba(248, 113, 113, 0.15); }
.sensor-card--offline { border-color: var(--glass-border); }

/* Stale data indicator */
.sensor-card--stale {
  opacity: 0.7;
  border-color: rgba(251, 191, 36, 0.25);
  border-left: 3px solid var(--color-warning);
}

.sensor-card--stale .sensor-card__number {
  color: var(--color-text-secondary);
}

.sensor-card--stale .sensor-card__sparkline {
  opacity: 0.5;
  filter: saturate(0.3);
}

.sensor-card--stale .sensor-card__trend {
  opacity: 0.5;
}

/* ESP offline indicator */
.sensor-card--esp-offline {
  opacity: 0.5;
  border-color: var(--glass-border);
}

.sensor-card--esp-offline .sensor-card__number {
  color: var(--color-text-muted);
}

/* Badges */
.sensor-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
}

.sensor-card__badge--stale {
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.1);
}

.sensor-card__badge--offline {
  color: var(--color-text-muted);
  background: rgba(112, 112, 128, 0.15);
}

.sensor-card__badge--unknown {
  color: var(--color-text-muted);
  background: rgba(112, 112, 128, 0.1);
}

/* Scope badges (T13-R3 WP4) */
.sensor-card__scope-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
  cursor: default;
}

.sensor-card__scope-badge--multi-zone {
  background: rgba(96, 165, 250, 0.2);
  color: rgb(96, 165, 250);
}

.sensor-card__scope-badge--mobile {
  background: rgba(251, 146, 60, 0.2);
  color: rgb(251, 146, 60);
}

/* Mobile sensor context hint (6.7) */
.sensor-card__context-hint {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px dashed var(--glass-border);
}

/* Mobile sensor zone switch (6.7) */
.sensor-card__context-controls {
  margin-top: var(--space-1);
}

.sensor-card__zone-select {
  width: 100%;
  font-size: var(--text-xs);
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  min-height: 44px;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.sensor-card__zone-select:hover {
  border-color: var(--color-iridescent-1);
}

.sensor-card__zone-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Virtual sensor info icon + tooltip (V19-F03) */
.sensor-card__virtual-info-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  color: var(--color-text-muted);
  cursor: help;
  flex-shrink: 0;
}

.sensor-card__virtual-tooltip {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  min-width: 200px;
  padding: var(--space-3);
  background: var(--glass-bg, rgba(18, 18, 26, 0.92));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.sensor-card__virtual-tooltip-heading {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-1);
}

.sensor-card__virtual-tooltip-list {
  list-style: disc;
  padding-left: 1rem;
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.sensor-card__virtual-tooltip-list li {
  margin-bottom: 2px;
}

.sensor-card__virtual-tooltip-formula {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0;
}
</style>
