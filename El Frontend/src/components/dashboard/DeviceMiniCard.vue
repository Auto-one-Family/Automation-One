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
  Thermometer, Droplets, Droplet, Zap, Sun, Gauge, Wind, Activity, Waves, Cloud, ToggleLeft, Layers,
  ToggleRight, GitBranch, Fan, Flame, Lightbulb, Cog, Power,
} from 'lucide-vue-next'
import ESPCardBase from '@/components/esp/ESPCardBase.vue'
import { getESPStatus, getESPStatusDisplay, type ESPStatus } from '@/composables/useESPStatus'
import { espHealthPresentation } from '@/domain/esp/espHealth'
import { groupSensorsByBaseType, type RawSensor } from '@/utils/sensorDefaults'
import { getActuatorTypeInfo } from '@/utils/labels'
import type { MockActuator } from '@/types'

interface Props {
  device: ESPDevice
  isMock: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'settings', device: ESPDevice): void
  (e: 'change-zone', device: ESPDevice): void
  (e: 'monitor-nav', device: ESPDevice): void
  (e: 'device-delete', deviceId: string): void
}>()

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
const statusText = computed(() => statusDisplay.value.text)

const runtimeHealthBadge = computed(() => {
  const vm = props.device.runtime_health_view
  if (!vm) return null
  const onlineLike = deviceStatus.value === 'online' || deviceStatus.value === 'stale'
  return espHealthPresentation(vm, onlineLike)
})

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
  Waves, Cloud, ToggleLeft, Layers, ToggleRight, GitBranch, Fan,
  Flame, Lightbulb, Cog, Power,
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

const MAX_VISIBLE_ROWS = 6

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
      if (result.length >= MAX_VISIBLE_ROWS) break
      result.push({
        label: val.label,
        value: formatValue(val.value, val.quality),
        unit: val.unit,
        valueColor: qualityToValueColor(val.quality, isDeviceOnline.value),
        icon: resolveIcon(val.icon),
      })
    }
    if (result.length >= MAX_VISIBLE_ROWS) break
  }

  return result
})

/** Total number of grouped sensor values */
const totalSensorValues = computed(() => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors) return 0
  const grouped = groupSensorsByBaseType(sensors)
  return grouped.reduce((sum, g) => sum + g.values.length, 0)
})

interface ActuatorDisplay {
  label: string
  value: string
  valueColor: string
  icon: Component
}

function resolveActuatorValue(actuator: MockActuator): string {
  const type = actuator.hardware_type ?? actuator.actuator_type
  if ((type === 'pwm' || type === 'fan') && actuator.pwm_value > 0) {
    return `${Math.round(actuator.pwm_value)}%`
  }
  return actuator.state ? 'EIN' : 'AUS'
}

function resolveActuatorValueColor(actuator: MockActuator): string {
  const type = actuator.hardware_type ?? actuator.actuator_type
  if ((type === 'pwm' || type === 'fan') && actuator.pwm_value > 0) {
    return 'var(--color-success)'
  }
  return actuator.state ? 'var(--color-success)' : 'var(--color-text-muted)'
}

function resolveActuatorIcon(type: string, hardwareType?: string | null): Component {
  const { icon } = getActuatorTypeInfo(type, hardwareType)
  return resolveIcon(icon)
}

const actuatorDisplays = computed((): ActuatorDisplay[] => {
  const actuators = (props.device.actuators as MockActuator[] | undefined) ?? []
  if (actuators.length === 0) return []

  return actuators.map((actuator) => ({
    label: actuator.name || getActuatorTypeInfo(actuator.actuator_type, actuator.hardware_type).label,
    value: resolveActuatorValue(actuator),
    valueColor: resolveActuatorValueColor(actuator),
    icon: resolveActuatorIcon(actuator.actuator_type, actuator.hardware_type),
  }))
})

const visibleSensorDisplays = computed(() => {
  const availableRows = Math.max(0, MAX_VISIBLE_ROWS - (actuatorDisplays.value.length > 0 ? 1 : 0))
  return sensorDisplays.value.slice(0, availableRows)
})

const visibleActuatorDisplays = computed(() => {
  const usedRows = visibleSensorDisplays.value.length
  const availableRows = Math.max(0, MAX_VISIBLE_ROWS - usedRows)
  return actuatorDisplays.value.slice(0, availableRows)
})

const extraSensorsCount = computed(() => {
  return Math.max(0, totalSensorValues.value - visibleSensorDisplays.value.length)
})

const extraActuatorsCount = computed(() => {
  return Math.max(0, actuatorDisplays.value.length - visibleActuatorDisplays.value.length)
})

const dataOverflowText = computed(() => {
  const parts: string[] = []
  if (extraSensorsCount.value > 0) parts.push(`${extraSensorsCount.value} Sensoren`)
  if (extraActuatorsCount.value > 0) parts.push(`${extraActuatorsCount.value} Aktoren`)
  if (parts.length === 0) return ''
  return `+${parts.join(' · ')} weitere`
})

/** Fallback text when no sensor data */
const sensorFallback = computed(() => {
  if (sensorDisplays.value.length > 0) return ''
  const count = props.device.sensor_count
  if (count && count > 0) return `${count} Sensoren`
  return ''
})

/** Sensor & actuator counts for status line (grouped values, consistent with overflow count) */
const sensorCount = computed(() => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors || sensors.length === 0) return props.device.sensor_count ?? 0
  const grouped = groupSensorsByBaseType(sensors)
  return grouped.reduce((sum, g) => sum + g.values.length, 0)
})

const actuatorCount = computed(() => {
  const actuators = (props.device as any).actuators as unknown[] | undefined
  return actuators?.length ?? props.device.actuator_count ?? 0
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

function handleSettings() {
  emit('settings', props.device)
}

function handleChangeZone() {
  emit('change-zone', props.device)
}

function handleMonitorNav() {
  emit('monitor-nav', props.device)
}

function handleDeviceDelete() {
  if (!deviceId.value) return
  emit('device-delete', deviceId.value)
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
    @settings="handleSettings"
    @change-zone="handleChangeZone"
    @monitor-nav="handleMonitorNav"
    @delete="handleDeviceDelete"
  >
    <!-- Header actions slot intentionally empty — settings moved to action row -->

    <!-- Card content: status line, subzone, sensors -->
    <template #default>
      <!-- Status line: dot + text + last seen + sensor count -->
      <div class="device-mini-card__status-line">
        <span
          class="device-mini-card__status-chip"
          :class="`device-mini-card__status-chip--${deviceStatus}`"
        >{{ statusText }}</span>
        <span
          v-if="runtimeHealthBadge?.showBadge"
          class="device-mini-card__status-chip device-mini-card__status-chip--stale"
          :title="runtimeHealthBadge.tooltipLines.join('\n')"
        >
          {{ runtimeHealthBadge.badgeLabel }}
        </span>
        <span v-if="lastSeenText" class="device-mini-card__last-seen">· {{ lastSeenText }}</span>
        <span v-if="sensorCount > 0 || actuatorCount > 0" class="device-mini-card__sensor-count">{{ sensorCount }}S<template v-if="actuatorCount > 0"> / {{ actuatorCount }}A</template></span>
      </div>

      <!-- Subzone indicator -->
      <div v-if="subzoneName" class="device-mini-card__subzone">
        {{ subzoneName }}
      </div>

      <!-- Sensor + actuator values (stabile Hoehe, max 4 Zeilen) -->
      <div
        v-if="visibleSensorDisplays.length > 0 || visibleActuatorDisplays.length > 0"
        class="device-mini-card__sensors"
      >
        <div v-if="visibleSensorDisplays.length > 0" class="device-mini-card__section-title">
          Sensoren
        </div>
        <div
          v-for="(sensor, idx) in visibleSensorDisplays"
          :key="idx"
          class="device-mini-card__sensor"
        >
          <component :is="sensor.icon" class="device-mini-card__sensor-icon" />
          <span class="device-mini-card__sensor-name" :title="sensor.label">{{ sensor.label }}</span>
          <span class="device-mini-card__sensor-value" :style="{ color: sensor.valueColor }">{{ sensor.value }}</span>
          <span class="device-mini-card__sensor-unit">{{ sensor.unit }}</span>
        </div>

        <div
          v-if="visibleActuatorDisplays.length > 0"
          class="device-mini-card__section-title device-mini-card__section-title--actuator"
        >
          Aktoren
        </div>
        <div
          v-for="(actuator, idx) in visibleActuatorDisplays"
          :key="`act-${idx}`"
          class="device-mini-card__sensor device-mini-card__sensor--actuator"
        >
          <component :is="actuator.icon" class="device-mini-card__sensor-icon device-mini-card__sensor-icon--actuator" />
          <span class="device-mini-card__sensor-name" :title="actuator.label">{{ actuator.label }}</span>
          <span class="device-mini-card__sensor-value" :style="{ color: actuator.valueColor }">{{ actuator.value }}</span>
        </div>

        <div v-if="dataOverflowText" class="device-mini-card__sensors-overflow">
          {{ dataOverflowText }}
        </div>
      </div>

      <!-- Fallback: keeps card height stable -->
      <div v-else class="device-mini-card__values">
        <span v-if="sensorFallback">{{ sensorFallback }}</span>
        <span v-else>Keine Sensoren oder Aktoren</span>
      </div>
    </template>
  </ESPCardBase>
</template>

<style scoped>
/* ── Root overrides on ESPCardBase for mini card styling ── */
.device-mini-card {
  background: var(--color-bg-tertiary);
  padding: var(--space-3);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
  min-width: 180px;
  max-width: 100%;
  position: relative;
  overflow: hidden;
}

.device-mini-card.esp-card-base {
  border-left-width: 1px;
  border-left-color: var(--glass-border);
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
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.26);
  filter: brightness(1.05);
}

/* Tactile touch feedback */
.device-mini-card:active {
  transform: scale(0.99);
  transition-duration: 60ms;
}

/* ── Grip handle (always visible for discoverability) ── */
:deep(.esp-drag-handle) {
  cursor: grab;
  min-height: 44px; /* Touch-friendly target size */
  min-width: 44px;
}

:deep(.esp-drag-handle):active {
  cursor: grabbing;
}

/* Long-press visual feedback (VueDraggable chosen-class applies after 300ms delay) */
.zone-item--chosen.device-mini-card,
.device-mini-card.sortable-chosen {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--color-iridescent-1);
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}

:deep(.esp-drag-handle)::before {
  content: '⠿';
  font-size: var(--text-xs);
  line-height: 1;
  color: var(--color-text-muted);
  opacity: 0.25;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}

.device-mini-card:hover :deep(.esp-drag-handle)::before,
.device-mini-card:focus-within :deep(.esp-drag-handle)::before {
  opacity: 0.5;
}

/* Touch devices: grip always visible */
@media (hover: none) {
  :deep(.esp-drag-handle)::before {
    opacity: 0.5;
  }
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
  font-size: var(--text-xxs);
}

/* (Settings button moved to action row) */

/* ── Status line ── */
.device-mini-card__status-line {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 20px;
}

.device-mini-card__status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-full);
  border: 1px solid var(--glass-border);
  padding: 1px var(--space-2);
  font-size: var(--text-xxs);
  line-height: 1.2;
  font-weight: 600;
  white-space: nowrap;
}

.device-mini-card__status-chip--online {
  color: var(--color-success);
  border-color: color-mix(in srgb, var(--color-success) 40%, transparent);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.device-mini-card__status-chip--stale,
.device-mini-card__status-chip--safemode {
  color: var(--color-warning);
  border-color: color-mix(in srgb, var(--color-warning) 40%, transparent);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
}

.device-mini-card__status-chip--error {
  color: var(--color-error);
  border-color: color-mix(in srgb, var(--color-error) 40%, transparent);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
}

.device-mini-card__status-chip--offline,
.device-mini-card__status-chip--unknown {
  color: var(--color-text-muted);
  border-color: var(--glass-border);
  background: color-mix(in srgb, var(--color-bg-quaternary) 60%, transparent);
}

.device-mini-card__last-seen {
  color: var(--color-text-muted);
  font-size: var(--text-xxs);
}

.device-mini-card__sensor-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: var(--text-xxs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

/* ── Subzone indicator ── */
.device-mini-card__subzone {
  font-size: var(--text-xxs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
  margin-bottom: 2px;
}

/* ── Sensor values with icons and spark-bars ── */
.device-mini-card__sensors {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 108px;
  justify-content: flex-start;
}

.device-mini-card__section-title {
  font-size: var(--text-xxs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: 600;
  padding-top: 2px;
}

.device-mini-card__section-title--actuator {
  margin-top: 2px;
  border-top: 1px dashed var(--glass-border);
  padding-top: var(--space-1);
}

.device-mini-card__sensor {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.device-mini-card__sensor-icon {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.device-mini-card__sensor--actuator .device-mini-card__sensor-name {
  color: var(--color-text-primary);
}

.device-mini-card__sensor-icon--actuator {
  color: var(--color-accent-bright);
  opacity: 0.8;
}

.device-mini-card__sensor-name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-mini-card__sensor-value {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
  min-width: 0;
  flex-shrink: 0;
}

.device-mini-card__sensor-unit {
  font-family: var(--font-mono);
  font-size: var(--text-xxs);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.device-mini-card__sensors-overflow {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding-left: var(--space-4);
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
  display: flex;
  align-items: center;
  min-height: 108px;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

/* Mobile: allow full width */
@media (max-width: 640px) {
  .device-mini-card {
    max-width: none;
  }
}
</style>
