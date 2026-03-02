<script setup lang="ts">
/**
 * DeviceMiniCard Component
 *
 * Compact device card for Level 1 (Zone Overview).
 * Shows: status dot, device name, mock/real badge (via ESPCardBase header),
 * status text line, up to 4 sensor rows with icons and sparklines,
 * and an action row (Öffnen + overflow menu).
 *
 * Click: Zoom to Level 2 (device detail) with DOMRect for transition origin.
 * Drag: Header element has .esp-drag-handle for VueDraggable (via ESPCardBase).
 *
 * Wraps ESPCardBase variant="mini" for consistent header rendering.
 */

import type { ESPDevice } from '@/api/esp'
import type { Component } from 'vue'
import { computed, ref } from 'vue'
import {
  Settings2, MoreVertical, Trash2, ArrowRightLeft,
  Thermometer, Droplets, Droplet, Zap, Sun, Gauge, Wind, Activity, Waves, Cloud, ToggleLeft, Layers,
} from 'lucide-vue-next'
import ESPCardBase from '@/components/esp/ESPCardBase.vue'
import { getESPStatus, getESPStatusDisplay, type ESPStatus } from '@/composables/useESPStatus'
import { useUiStore } from '@/shared/stores/ui.store'
import { groupSensorsByBaseType, type RawSensor } from '@/utils/sensorDefaults'

interface Props {
  device: ESPDevice
  isMock: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'settings', device: ESPDevice): void
  (e: 'delete', deviceId: string): void
  (e: 'change-zone', device: ESPDevice): void
  (e: 'monitor-nav', device: ESPDevice): void
}>()

const uiStore = useUiStore()
const cardRef = ref<InstanceType<typeof ESPCardBase> | null>(null)

/** Device ID (needed locally for emit payloads) */
const deviceId = computed(() => {
  const d = props.device
  return d.device_id || (d as any).esp_id || ''
})

// ── Status ───────────────────────────────────────────────────────────────
const deviceStatus = computed<ESPStatus>(() => getESPStatus(props.device))
const statusDisplay = computed(() => getESPStatusDisplay(deviceStatus.value))
const isDeviceOnline = computed(() => deviceStatus.value === 'online')
const statusColor = computed(() => statusDisplay.value.color)
const statusText = computed(() => statusDisplay.value.text)

/** Relative time for stale/offline devices */
const lastSeenText = computed(() => {
  if (isDeviceOnline.value) return ''
  const ts = props.device.last_seen || props.device.last_heartbeat
  if (!ts) return ''
  const diffMs = Date.now() - new Date(ts).getTime()
  if (diffMs < 0) return ''
  if (diffMs < 60_000) return 'Gerade eben'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  return `vor ${days} Tag${days > 1 ? 'en' : ''}`
})

// ── Sensor Icon Map ──────────────────────────────────────────────────────
const SENSOR_ICON_MAP: Record<string, Component> = {
  Thermometer, Droplet, Droplets, Zap, Sun, Gauge, Wind, Activity,
  Waves, Cloud, ToggleLeft, Layers,
}

function resolveIcon(iconName: string): Component {
  return SENSOR_ICON_MAP[iconName] || Activity
}

// ── Sensor Display (via groupSensorsByBaseType) ──────────────────────────
interface SensorDisplay {
  label: string
  value: string
  unit: string
  valueColor: string
  icon: Component
}

const MAX_VISIBLE_SENSORS = 4

/** Map quality to CSS color for value text */
function qualityToValueColor(quality: 'normal' | 'warning' | 'stale' | 'unknown', isOnline: boolean): string {
  if (!isOnline) return 'var(--color-text-muted)'
  if (quality === 'warning') return 'var(--color-warning)'
  if (quality === 'stale') return 'var(--color-text-muted)'
  if (quality === 'unknown') return 'var(--color-text-muted)'
  return 'var(--color-text-primary)'
}

/** Format a sensor value with decimals from config */
function formatValue(value: number | null, quality: 'normal' | 'warning' | 'stale' | 'unknown'): string {
  if (value === null || value === undefined) return '--'
  if (quality === 'stale') return `${value}?`
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

const sensorDisplays = computed((): SensorDisplay[] => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors || sensors.length === 0) return []

  const grouped = groupSensorsByBaseType(sensors)
  const result: SensorDisplay[] = []

  for (const group of grouped) {
    for (const val of group.values) {
      if (result.length >= MAX_VISIBLE_SENSORS) break
      result.push({
        label: val.label,
        value: formatValue(val.value, val.quality),
        unit: val.unit,
        valueColor: qualityToValueColor(val.quality, isDeviceOnline.value),
        icon: resolveIcon(val.icon),
      })
    }
    if (result.length >= MAX_VISIBLE_SENSORS) break
  }

  return result
})

/** Number of sensor value rows beyond the visible limit */
const extraSensorsCount = computed(() => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors) return 0
  const grouped = groupSensorsByBaseType(sensors)
  const totalValues = grouped.reduce((sum, g) => sum + g.values.length, 0)
  return Math.max(0, totalValues - MAX_VISIBLE_SENSORS)
})

/** Fallback text when no sensor data */
const sensorFallback = computed(() => {
  if (sensorDisplays.value.length > 0) return ''
  const count = props.device.sensor_count
  if (count && count > 0) return `${count} Sensoren`
  return ''
})

/** Sensor & actuator counts for status line */
const sensorCount = computed(() => {
  const sensors = props.device.sensors as any[] | undefined
  return sensors?.length ?? props.device.sensor_count ?? 0
})

/** Subzone label (if assigned) */
const subzoneName = computed(() => props.device.subzone_name || '')

// ── Click / Action Handlers ──────────────────────────────────────────────
function handleClick() {
  const el = cardRef.value?.$el as HTMLElement | undefined
  const rect = el?.getBoundingClientRect()
  if (rect) {
    emit('click', { deviceId: deviceId.value, originRect: rect })
  }
}

function handleSettings(event: MouseEvent) {
  event.stopPropagation()
  emit('settings', props.device)
}

function handleMonitorNav(event: MouseEvent) {
  event.stopPropagation()
  emit('monitor-nav', props.device)
}

function openCardMenu(event: MouseEvent) {
  event.stopPropagation()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  uiStore.openContextMenu(rect.right, rect.bottom, [
    {
      id: 'change-zone',
      label: 'Zone ändern',
      icon: ArrowRightLeft,
      action: () => emit('change-zone', props.device),
    },
    {
      id: 'delete',
      label: 'Löschen',
      icon: Trash2,
      variant: 'danger',
      action: () => emit('delete', deviceId.value),
    },
  ])
}
</script>

<template>
  <ESPCardBase
    ref="cardRef"
    :esp="device"
    variant="mini"
    :class="['device-mini-card', { 'device-mini-card--stale': !isDeviceOnline }]"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
  >
    <!-- Header actions slot intentionally empty — settings moved to action row -->

    <!-- Card content: status line, subzone, sensors -->
    <template #default>
      <!-- Status line: dot + text + last seen + sensor count -->
      <div class="device-mini-card__status-line">
        <span
          class="device-mini-card__status-dot"
          :style="{ backgroundColor: statusColor }"
        />
        <span
          class="device-mini-card__status-text"
          :style="{ color: statusColor }"
        >{{ statusText }}</span>
        <span v-if="lastSeenText" class="device-mini-card__last-seen">· {{ lastSeenText }}</span>
        <span v-if="sensorCount > 0" class="device-mini-card__sensor-count">{{ sensorCount }}S</span>
      </div>

      <!-- Subzone indicator -->
      <div v-if="subzoneName" class="device-mini-card__subzone">
        {{ subzoneName }}
      </div>

      <!-- Sensor values with type icons (max 4, no spark-bars) -->
      <div v-if="sensorDisplays.length > 0" class="device-mini-card__sensors">
        <div
          v-for="(sensor, idx) in sensorDisplays"
          :key="idx"
          class="device-mini-card__sensor"
        >
          <component :is="sensor.icon" class="device-mini-card__sensor-icon" />
          <span class="device-mini-card__sensor-name">{{ sensor.label }}</span>
          <span class="device-mini-card__sensor-value" :style="{ color: sensor.valueColor }">{{ sensor.value }}</span>
          <span class="device-mini-card__sensor-unit">{{ sensor.unit }}</span>
        </div>
        <div v-if="extraSensorsCount > 0" class="device-mini-card__sensors-overflow">
          +{{ extraSensorsCount }} weitere
        </div>
      </div>

      <!-- Fallback: sensor count text -->
      <div v-else-if="sensorFallback" class="device-mini-card__values">
        {{ sensorFallback }}
      </div>

      <!-- Action Row: Primary monitor link + settings + overflow -->
      <div class="device-mini-card__actions" @click.stop>
        <button
          class="device-mini-card__action-btn device-mini-card__action-btn--primary"
          title="Im Monitor anzeigen"
          @click="handleMonitorNav($event)"
        >
          <Activity :size="13" />
          <span class="device-mini-card__action-label">Monitor</span>
        </button>
        <span class="device-mini-card__actions-spacer" />
        <button
          class="device-mini-card__action-btn"
          title="Konfigurieren"
          @click="handleSettings($event)"
        >
          <Settings2 :size="13" />
        </button>
        <button
          class="device-mini-card__action-btn"
          title="Weitere Aktionen"
          @click.stop="openCardMenu($event)"
        >
          <MoreVertical :size="13" />
        </button>
      </div>
    </template>
  </ESPCardBase>
</template>

<style scoped>
/* ── Root overrides on ESPCardBase for mini card styling ── */
.device-mini-card {
  background: var(--color-bg-tertiary);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
  min-width: 150px;
  max-width: 240px;
  position: relative;
  overflow: hidden;
}

/* Shimmer sweep on hover */
.device-mini-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.03),
    transparent
  );
  pointer-events: none;
  transition: none;
}

.device-mini-card:hover::before {
  animation: shimmer 0.8s ease-out forwards;
}

.device-mini-card:hover {
  background: var(--color-bg-quaternary);
  border-color: var(--glass-border-hover);
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  filter: brightness(1.05);
}

/* Tactile touch feedback */
.device-mini-card:active {
  transform: scale(0.97);
  transition-duration: 60ms;
}

/* ── Grip handle (always visible for discoverability) ── */
:deep(.esp-drag-handle) {
  cursor: grab;
  min-height: 44px; /* Touch-friendly target size */
}

:deep(.esp-drag-handle):active {
  cursor: grabbing;
}

:deep(.esp-drag-handle)::before {
  content: '⠿';
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-muted);
  opacity: 0.25;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}

.device-mini-card:hover :deep(.esp-drag-handle)::before {
  opacity: 0.5;
}

/* ── ESPCardBase inner overrides for mini sizing ── */

/* Smaller status dot */
:deep(.esp-card-base__status-dot) {
  width: 6px;
  height: 6px;
}

/* Status dot glow on hover */
.device-mini-card:hover :deep(.esp-card-base__status-dot) {
  box-shadow: 0 0 8px currentColor;
}

/* Smaller name text */
:deep(.esp-card-base__name) {
  font-size: var(--text-xs);
  font-weight: 500;
}

/* Match original badge styling */
:deep(.esp-card-base__badge) {
  font-family: var(--font-mono);
  font-size: 9px;
}

/* (Settings button moved to action row) */

/* ── Status line ── */
.device-mini-card__status-line {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  line-height: 1;
}

.device-mini-card__status-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.device-mini-card__status-text {
  font-weight: 500;
}

.device-mini-card__last-seen {
  color: var(--color-text-muted);
  font-size: 10px;
}

.device-mini-card__sensor-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

/* ── Subzone indicator ── */
.device-mini-card__subzone {
  font-size: 9px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

/* ── Sensor values with icons and spark-bars ── */
.device-mini-card__sensors {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.device-mini-card__sensor {
  display: flex;
  align-items: center;
  gap: 3px;
}

.device-mini-card__sensor-icon {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.device-mini-card__sensor-name {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-mini-card__sensor-value {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
  min-width: 0;
  flex-shrink: 0;
}

.device-mini-card__sensor-unit {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.device-mini-card__sensors-overflow {
  font-size: 10px;
  color: var(--color-text-muted);
  padding-left: 14px;
}

/* ── Stale/offline state ── */
.device-mini-card--stale {
  opacity: 0.75;
}

.device-mini-card--stale .device-mini-card__sensor-value {
  color: var(--color-text-secondary);
}

/* Fallback text */
.device-mini-card__values {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Action Row ── */
.device-mini-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-top: var(--space-1);
  border-top: 1px solid transparent;
  margin-top: auto;
  opacity: 0;
  transition: opacity var(--transition-fast), border-color var(--transition-fast);
}

.device-mini-card:hover .device-mini-card__actions {
  opacity: 1;
  border-top-color: var(--glass-border);
}

.device-mini-card__actions-spacer {
  flex: 1;
}

.device-mini-card__action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px var(--space-1);
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
  white-space: nowrap;
  flex-shrink: 0;
}

.device-mini-card__action-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

/* Primary action: Monitor link with accent color */
.device-mini-card__action-btn--primary {
  color: var(--color-accent-bright);
}

.device-mini-card__action-btn--primary:hover {
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.1);
}

.device-mini-card__action-label {
  line-height: 1;
}

/* Mobile: allow full width */
@media (max-width: 640px) {
  .device-mini-card {
    max-width: none;
  }
}
</style>
