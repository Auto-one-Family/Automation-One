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
  Thermometer, Droplets, Droplet, Zap, Sun, Gauge, Wind, Activity,
} from 'lucide-vue-next'
import ESPCardBase from '@/components/esp/ESPCardBase.vue'
import { getESPStatus, getESPStatusDisplay, type ESPStatus } from '@/composables/useESPStatus'
import { useUiStore } from '@/shared/stores/ui.store'
import { SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'

interface Props {
  device: ESPDevice
  isMock: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'settings', device: ESPDevice): void
  (e: 'delete', deviceId: string): void
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
  Thermometer,
  Droplet,
  Droplets,
  Zap,
  Sun,
  Gauge,
  Wind,
  Activity,
}

function getSensorIcon(sensorType: string): Component {
  const config = SENSOR_TYPE_CONFIG[sensorType]
  if (config?.icon && SENSOR_ICON_MAP[config.icon]) {
    return SENSOR_ICON_MAP[config.icon]
  }
  return Activity
}

// ── Sensor Display ───────────────────────────────────────────────────────
interface SensorDisplay {
  name: string
  value: string
  unit: string
  percent: number
  qualityColor: string
  icon: Component
}

const MAX_VISIBLE_SENSORS = 4

/** Map quality string to CSS color variable */
function qualityToColor(quality: string | undefined): string {
  if (!quality) return 'var(--color-accent)'
  const q = quality.toLowerCase()
  if (q === 'good' || q === 'excellent') return 'var(--color-success)'
  if (q === 'suspect' || q === 'warning' || q === 'degraded') return 'var(--color-warning)'
  if (q === 'bad' || q === 'error' || q === 'critical') return 'var(--color-error)'
  return 'var(--color-accent)'
}

/** Fallback range for unknown sensor types */
function getFallbackRange(sensor: any): { min: number; max: number } {
  const type = (sensor.sensor_type || sensor.type || '').toLowerCase()
  if (type.includes('temp') || type.includes('ds18b20')) return { min: -10, max: 50 }
  if (type.includes('humid') || type.includes('sht3')) return { min: 0, max: 100 }
  if (type.includes('ph')) return { min: 0, max: 14 }
  if (type.includes('light') || type.includes('lux')) return { min: 0, max: 10000 }
  if (type.includes('moisture') || type.includes('soil')) return { min: 0, max: 100 }
  return { min: 0, max: 100 }
}

const sensorDisplays = computed((): SensorDisplay[] => {
  const sensors = props.device.sensors as any[] | undefined
  if (!sensors || sensors.length === 0) return []

  const result: SensorDisplay[] = []
  for (const sensor of sensors) {
    if (result.length >= MAX_VISIBLE_SENSORS) break
    if (sensor.raw_value != null) {
      const sType = sensor.sensor_type || sensor.type || ''
      const config = SENSOR_TYPE_CONFIG[sType]
      const range = config
        ? { min: config.min, max: config.max }
        : getFallbackRange(sensor)
      const val = Number(sensor.raw_value)
      const clamped = Math.max(range.min, Math.min(range.max, val))
      const percent = ((clamped - range.min) / (range.max - range.min)) * 100

      result.push({
        name: sensor.name || config?.label || sType || `GPIO ${sensor.gpio}`,
        value: String(sensor.raw_value),
        unit: sensor.unit || config?.unit || '',
        percent: Math.round(percent),
        qualityColor: isDeviceOnline.value ? qualityToColor(sensor.quality) : 'var(--color-text-muted)',
        icon: getSensorIcon(sType),
      })
    }
  }
  return result
})

/** Number of sensors with values beyond the visible limit */
const extraSensorsCount = computed(() => {
  const sensors = props.device.sensors as any[] | undefined
  if (!sensors) return 0
  const withValue = sensors.filter(s => s.raw_value != null).length
  return Math.max(0, withValue - MAX_VISIBLE_SENSORS)
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

function openCardMenu(event: MouseEvent) {
  event.stopPropagation()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  uiStore.openContextMenu(rect.right, rect.bottom, [
    {
      id: 'configure',
      label: 'Konfigurieren',
      icon: Settings2,
      action: () => emit('settings', props.device),
    },
    {
      id: 'change-zone',
      label: 'Zone ändern',
      icon: ArrowRightLeft,
      action: () => emit('settings', props.device),
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
    <!-- Settings gear in header actions -->
    <template #actions>
      <button
        class="device-mini-card__settings-btn"
        title="Einstellungen"
        @click="handleSettings"
      >
        <Settings2 class="device-mini-card__settings-icon" />
      </button>
    </template>

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

      <!-- Sensor values with type icons and spark-bars (max 4) -->
      <div v-if="sensorDisplays.length > 0" class="device-mini-card__sensors">
        <div
          v-for="(sensor, idx) in sensorDisplays"
          :key="idx"
          class="device-mini-card__sensor"
        >
          <component :is="sensor.icon" class="device-mini-card__sensor-icon" />
          <span class="device-mini-card__sensor-name">{{ sensor.name }}</span>
          <span class="device-mini-card__sensor-value">{{ sensor.value }}</span>
          <span class="device-mini-card__sensor-unit">{{ sensor.unit }}</span>
          <div class="device-mini-card__spark-bar">
            <div
              class="device-mini-card__spark-fill"
              :style="{
                width: sensor.percent + '%',
                backgroundColor: sensor.qualityColor,
              }"
            />
          </div>
        </div>
        <div v-if="extraSensorsCount > 0" class="device-mini-card__sensors-overflow">
          +{{ extraSensorsCount }} weitere
        </div>
      </div>

      <!-- Fallback: sensor count text -->
      <div v-else-if="sensorFallback" class="device-mini-card__values">
        {{ sensorFallback }}
      </div>
    </template>

    <!-- Action row: Öffnen + overflow menu -->
    <template #footer>
      <div class="device-mini-card__actions">
        <button
          class="device-mini-card__open-btn"
          @click.stop="handleClick"
        >
          Öffnen
        </button>
        <button
          class="device-mini-card__overflow-btn"
          title="Weitere Aktionen"
          @click.stop="openCardMenu($event)"
        >
          <MoreVertical class="device-mini-card__overflow-icon" />
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
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  filter: brightness(1.05);
}

/* Tactile touch feedback */
.device-mini-card:active {
  transform: scale(0.97);
  transition-duration: 60ms;
}

/* ── Grip handle (visible on hover via CSS pseudo-element) ── */
:deep(.esp-drag-handle) {
  cursor: grab;
}

:deep(.esp-drag-handle)::before {
  content: '⠿';
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}

.device-mini-card:hover :deep(.esp-drag-handle)::before {
  opacity: 0.4;
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

/* ── Settings gear button (hover-only) ── */
.device-mini-card__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
  padding: 0;
}

.device-mini-card:hover .device-mini-card__settings-btn {
  opacity: 1;
}

.device-mini-card__settings-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.device-mini-card__settings-icon {
  width: 11px;
  height: 11px;
}

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

.device-mini-card__spark-bar {
  flex: 0 0 28px;
  height: 3px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 2px;
  overflow: hidden;
}

.device-mini-card__spark-fill {
  height: 100%;
  border-radius: 2px;
  transition: width var(--transition-base);
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

.device-mini-card--stale .device-mini-card__spark-fill {
  opacity: 0.4;
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

/* ── Action row ── */
.device-mini-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
  padding-top: 2px;
}

.device-mini-card__open-btn {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-accent-bright);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast), background var(--transition-fast);
}

.device-mini-card__open-btn:hover {
  color: var(--color-iridescent-2);
  background: rgba(96, 165, 250, 0.08);
}

.device-mini-card__overflow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
  padding: 0;
}

.device-mini-card:hover .device-mini-card__overflow-btn {
  opacity: 1;
}

.device-mini-card__overflow-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.device-mini-card__overflow-icon {
  width: 12px;
  height: 12px;
}

/* Mobile: allow full width */
@media (max-width: 640px) {
  .device-mini-card {
    max-width: none;
  }
}
</style>
