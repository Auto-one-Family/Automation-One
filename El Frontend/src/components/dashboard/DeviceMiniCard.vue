<script setup lang="ts">
/**
 * DeviceMiniCard Component (~120x56px)
 *
 * Compact device card for Level 1 (Zone Overview).
 * Shows: status dot, device name, mock/real badge, 1-2 key sensor values
 * with CSS-only spark-bars proportional to value range.
 *
 * Click: Zoom to Level 3 (device detail) with DOMRect for transition origin.
 * Drag: Header element has .esp-drag-handle for VueDraggable.
 */

import type { ESPDevice } from '@/api/esp'
import { computed, ref } from 'vue'
import { Settings2 } from 'lucide-vue-next'

interface Props {
  device: ESPDevice
  isMock: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'settings', device: ESPDevice): void
}>()

const cardRef = ref<HTMLElement | null>(null)

const deviceId = computed(() => props.device.device_id || props.device.esp_id || '')

const displayName = computed(() =>
  props.device.name || deviceId.value
)

/** Status dot color */
const statusColor = computed(() => {
  if (props.device.status === 'online' || props.device.connected === true) {
    return 'var(--color-success)'
  }
  if (props.device.status === 'error') {
    return 'var(--color-error)'
  }
  if (props.isMock && (props.device as any).system_state === 'SAFE_MODE') {
    return 'var(--color-warning)'
  }
  return 'var(--color-text-muted)'
})

/** Border left color based on mock/real */
const borderColor = computed(() =>
  props.isMock ? 'var(--color-mock)' : 'var(--color-real)'
)

/** Badge text */
const badgeText = computed(() => props.isMock ? 'MOCK' : 'REAL')
const badgeClass = computed(() => props.isMock ? 'device-mini-card__badge--mock' : 'device-mini-card__badge--real')

/** Sensor data with spark-bar info */
interface SensorDisplay {
  value: string
  unit: string
  /** 0–100 percentage for spark-bar width */
  percent: number
  /** CSS color variable for quality */
  qualityColor: string
}

/** Map sensor type to expected range for spark-bar normalization */
function getSensorRange(sensor: any): { min: number; max: number } {
  const type = (sensor.sensor_type || sensor.type || '').toLowerCase()
  if (type.includes('temp') || type.includes('ds18b20')) return { min: -10, max: 50 }
  if (type.includes('humid') || type.includes('sht3')) return { min: 0, max: 100 }
  if (type.includes('ph')) return { min: 0, max: 14 }
  if (type.includes('light') || type.includes('lux')) return { min: 0, max: 10000 }
  if (type.includes('moisture') || type.includes('soil')) return { min: 0, max: 100 }
  return { min: 0, max: 100 }
}

/** Map quality string to CSS color variable */
function qualityToColor(quality: string | undefined): string {
  if (!quality) return 'var(--color-accent)'
  const q = quality.toLowerCase()
  if (q === 'good' || q === 'excellent') return 'var(--color-success)'
  if (q === 'suspect' || q === 'warning' || q === 'degraded') return 'var(--color-warning)'
  if (q === 'bad' || q === 'error' || q === 'critical') return 'var(--color-error)'
  return 'var(--color-accent)'
}

const sensorDisplays = computed((): SensorDisplay[] => {
  const sensors = props.device.sensors as any[] | undefined
  if (!sensors || sensors.length === 0) return []

  const result: SensorDisplay[] = []
  for (const sensor of sensors) {
    if (result.length >= 2) break
    if (sensor.raw_value != null) {
      const range = getSensorRange(sensor)
      const val = Number(sensor.raw_value)
      const clamped = Math.max(range.min, Math.min(range.max, val))
      const percent = ((clamped - range.min) / (range.max - range.min)) * 100

      result.push({
        value: String(sensor.raw_value),
        unit: sensor.unit || '',
        percent: Math.round(percent),
        qualityColor: qualityToColor(sensor.quality),
      })
    }
  }
  return result
})

/** Fallback text when no sensor data */
const sensorFallback = computed(() => {
  if (sensorDisplays.value.length > 0) return ''
  const count = props.device.sensor_count
  if (count && count > 0) return `${count} Sensoren`
  return ''
})

/** Sensor & actuator counts for component count pills */
const sensorCount = computed(() => {
  const sensors = props.device.sensors as any[] | undefined
  return sensors?.length ?? props.device.sensor_count ?? 0
})

const actuatorCount = computed(() => {
  const actuators = props.device.actuators as any[] | undefined
  return actuators?.length ?? props.device.actuator_count ?? 0
})

const hasComponentCounts = computed(() => sensorCount.value > 0 || actuatorCount.value > 0)

/** Subzone label (if assigned) */
const subzoneName = computed(() => props.device.subzone_name || '')

function handleClick() {
  const rect = cardRef.value?.getBoundingClientRect()
  if (rect) {
    emit('click', { deviceId: deviceId.value, originRect: rect })
  }
}

function handleSettings(event: MouseEvent) {
  event.stopPropagation()
  emit('settings', props.device)
}
</script>

<template>
  <div
    ref="cardRef"
    class="device-mini-card"
    :style="{ borderLeftColor: borderColor }"
    role="button"
    :aria-label="`${displayName}, Status: ${device.status || 'unbekannt'}`"
    tabindex="0"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
  >
    <!-- Header row: status dot + name + badge + settings gear -->
    <div class="device-mini-card__header esp-drag-handle">
      <span
        class="device-mini-card__status-dot"
        :style="{ backgroundColor: statusColor, color: statusColor }"
        :title="device.status === 'online' || device.connected === true ? 'Online: Gerät verbunden' : device.status === 'error' ? 'Fehler: Gerät meldet Fehler' : 'Offline: Keine Verbindung'"
      />
      <span class="device-mini-card__name">{{ displayName }}</span>
      <span
        class="device-mini-card__badge"
        :class="badgeClass"
        :title="isMock ? 'Mock-Gerät (simuliert)' : 'Hardware-Gerät'"
      >{{ badgeText }}</span>
      <button
        class="device-mini-card__settings-btn"
        title="Einstellungen"
        @click="handleSettings"
      >
        <Settings2 class="device-mini-card__settings-icon" />
      </button>
    </div>

    <!-- Subzone indicator -->
    <div v-if="subzoneName" class="device-mini-card__subzone">
      {{ subzoneName }}
    </div>

    <!-- Sensor values with spark-bars -->
    <div v-if="sensorDisplays.length > 0" class="device-mini-card__sensors">
      <div
        v-for="(sensor, idx) in sensorDisplays"
        :key="idx"
        class="device-mini-card__sensor"
      >
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
    </div>

    <!-- Fallback: sensor count text -->
    <div v-else-if="sensorFallback" class="device-mini-card__values">
      {{ sensorFallback }}
    </div>

    <!-- Component count pills (sensor + actuator) -->
    <div v-if="hasComponentCounts" class="device-mini-card__counts">
      <span v-if="sensorCount > 0" class="device-mini-card__count-pill">{{ sensorCount }}S</span>
      <span v-if="sensorCount > 0 && actuatorCount > 0" class="device-mini-card__count-sep">·</span>
      <span v-if="actuatorCount > 0" class="device-mini-card__count-pill">{{ actuatorCount }}A</span>
    </div>
  </div>
</template>

<style scoped>
.device-mini-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-mock);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
  min-width: 120px;
  max-width: 200px;
  position: relative;
  overflow: hidden;
}

/* Shimmer sweep on hover (reuse existing keyframe) */
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
  /* Border-left brightness boost */
  border-left-width: 3px;
  filter: brightness(1.05);
}

/* Status dot glow on hover */
.device-mini-card:hover .device-mini-card__status-dot {
  box-shadow: 0 0 8px currentColor;
}

/* Tactile touch feedback */
.device-mini-card:active {
  transform: scale(0.97);
  transition-duration: 60ms;
}

.device-mini-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.device-mini-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.device-mini-card__status-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  transition: box-shadow var(--transition-fast);
  /* Use currentColor from inline style for glow */
  color: inherit;
}

.device-mini-card__name {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.device-mini-card__badge {
  font-size: 9px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
}

.device-mini-card__badge--mock {
  color: var(--color-mock);
  background: rgba(167, 139, 250, 0.12);
}

.device-mini-card__badge--real {
  color: var(--color-real);
  background: rgba(34, 211, 238, 0.12);
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
  margin-left: auto;
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

/* ── Component count pills ── */
.device-mini-card__counts {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 1px;
}

.device-mini-card__count-pill {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.device-mini-card__count-sep {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  opacity: 0.5;
}

/* ── Sensor values with spark-bars ── */
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
  flex: 1;
  height: 3px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 2px;
  overflow: hidden;
  min-width: 16px;
}

.device-mini-card__spark-fill {
  height: 100%;
  border-radius: 2px;
  transition: width var(--transition-base);
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

/* Mobile: allow full width */
@media (max-width: 640px) {
  .device-mini-card {
    max-width: none;
  }
}
</style>
