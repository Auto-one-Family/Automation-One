<script setup lang="ts">
/**
 * SensorSatellite Component
 *
 * Displays a sensor as a "satellite" card around the main ESP card.
 * Shows live sensor values with quality indicators.
 *
 * Features:
 * - Live value display with unit
 * - Multi-value support (Phase 7): 1, 2, or 3 values per sensor
 * - Quality indicator (good/degraded/poor)
 * - Icon based on sensor type
 * - Click to show connection lines to linked actuators
 * - Draggable for Multi-Sensor Chart (Phase 4)
 */

import { computed, ref } from 'vue'
import { Thermometer, Droplet, Zap, Gauge, Wind, Sun, Droplets } from 'lucide-vue-next'
import {
  SENSOR_TYPE_CONFIG,
  getSensorUnit,
  getSensorLabel,
  getMultiValueDeviceConfig,
  getValueConfigForSensorType
} from '@/utils/sensorDefaults'
import { formatNumber } from '@/utils/formatters'
import { useDragStateStore } from '@/stores/dragState'
import { createLogger } from '@/utils/logger'
import type { QualityLevel, MultiValueEntry } from '@/types'

interface Props {
  /** ESP ID this sensor belongs to */
  espId: string
  /** GPIO pin number */
  gpio: number
  /** Sensor type (e.g., 'DS18B20', 'pH', 'EC') */
  sensorType: string
  /** Sensor name (optional) */
  name?: string | null
  /** Current sensor value (single-value fallback) */
  value: number
  /** Quality level (single-value fallback) */
  quality: QualityLevel
  /** Unit (optional, will be derived from sensor type if not provided) */
  unit?: string
  /** Whether this sensor is selected/highlighted */
  selected?: boolean
  /** Whether to show connection lines on click */
  showConnections?: boolean
  /** Whether dragging is enabled (for Multi-Sensor Chart) */
  draggable?: boolean
  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 7: Multi-Value Props
  // ═══════════════════════════════════════════════════════════════════════════
  /** Device type if multi-value (e.g., "sht31", "bmp280") */
  deviceType?: string | null
  /** All values for multi-value sensors, keyed by sensor_type */
  multiValues?: Record<string, MultiValueEntry> | null
  /** Is this a multi-value sensor? */
  isMultiValue?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  showConnections: false,
  draggable: true,
  deviceType: null,
  multiValues: null,
  isMultiValue: false,
})

const emit = defineEmits<{
  click: [gpio: number]
  showConnections: [gpio: number]
}>()

// Drag state store (global for auto-opening chart)
const dragStore = useDragStateStore()

// Local drag state for visual feedback
const isDragging = ref(false)

// Logger
const log = createLogger('SensorSatellite')

// Get sensor configuration
const sensorConfig = computed(() => SENSOR_TYPE_CONFIG[props.sensorType] || {
  label: getSensorLabel(props.sensorType),
  unit: props.unit || getSensorUnit(props.sensorType) || '',
  decimals: 2,
  icon: 'Gauge',
})

// Get sensor icon component
const sensorIcon = computed(() => {
  const iconName = sensorConfig.value.icon.toLowerCase()
  if (iconName.includes('thermometer')) return Thermometer
  if (iconName.includes('droplet') || iconName.includes('ph')) return Droplet
  if (iconName.includes('droplets')) return Droplets
  if (iconName.includes('zap') || iconName.includes('ec')) return Zap
  if (iconName.includes('wind') || iconName.includes('fan')) return Wind
  if (iconName.includes('sun') || iconName.includes('light')) return Sun
  return Gauge
})

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7: Multi-Value Computed Properties
// ═══════════════════════════════════════════════════════════════════════════

/** Number of values (1, 2, or 3) */
const valueCount = computed(() => {
  if (!props.isMultiValue || !props.multiValues) return 1
  return Object.keys(props.multiValues).length
})

/** Device configuration from registry */
const deviceConfig = computed(() => {
  if (!props.deviceType) return null
  return getMultiValueDeviceConfig(props.deviceType)
})

/** Display label for header (device name or sensor type) */
const displayLabel = computed(() => {
  if (props.deviceType && deviceConfig.value) {
    // Extract device name without the parenthetical description
    // "SHT31 (Temp + Humidity)" → "SHT31"
    return deviceConfig.value.label.split('(')[0].trim()
  }
  return props.name || sensorConfig.value.label
})

/** Aggregated quality (worst across all values) */
const displayQuality = computed((): QualityLevel => {
  if (!props.isMultiValue || !props.multiValues) {
    return props.quality || 'good'
  }

  const qualities = Object.values(props.multiValues).map(v => v.quality)
  return getWorstQuality(qualities)
})

/**
 * Get worst quality from array (matches store logic)
 */
function getWorstQuality(qualities: QualityLevel[]): QualityLevel {
  const priorityOrder: QualityLevel[] = ['error', 'stale', 'bad', 'poor', 'fair', 'good', 'excellent']
  for (const q of priorityOrder) {
    if (qualities.includes(q)) return q
  }
  return 'good'
}

/** Quality label for display */
const qualityLabel = computed(() => {
  const labels: Record<QualityLevel, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    bad: 'Bad',
    stale: 'Stale',
    error: 'Error'
  }
  return labels[displayQuality.value] || displayQuality.value
})

/** Formatted values for template */
interface FormattedValue {
  key: string
  value: string
  unit: string
  label: string
  quality: QualityLevel
  order: number
}

const formattedValues = computed((): FormattedValue[] => {
  // Single-value mode
  if (!props.isMultiValue || !props.multiValues) {
    return [{
      key: props.sensorType,
      value: formatNumber(props.value, sensorConfig.value.decimals),
      unit: sensorConfig.value.unit,
      label: props.name || sensorConfig.value.label,
      quality: props.quality,
      order: 0
    }]
  }

  // Multi-value mode: Sort by registry order if available
  return Object.entries(props.multiValues)
    .map(([sensorType, entry]) => {
      const valueConfig = getValueConfigForSensorType(sensorType)
      const typeConfig = SENSOR_TYPE_CONFIG[sensorType]

      return {
        key: sensorType,
        value: formatNumber(entry.value, typeConfig?.decimals ?? 1),
        unit: entry.unit || valueConfig?.unit || typeConfig?.unit || '',
        label: valueConfig?.label || typeConfig?.label || sensorType,
        quality: entry.quality,
        order: valueConfig?.order ?? 99
      }
    })
    .sort((a, b) => a.order - b.order)
})

// Quality variant for icon color (uses displayQuality for multi-value aggregation)
const qualityVariant = computed(() => {
  const q = displayQuality.value
  if (q === 'excellent' || q === 'good') return 'success'
  if (q === 'fair') return 'warning'
  if (q === 'poor' || q === 'bad' || q === 'stale') return 'danger'
  if (q === 'error') return 'danger'
  return 'gray'
})

/**
 * Effective draggable state.
 * KRITISCH: Wenn ein ESP-Card-Drag (VueDraggable) aktiv ist,
 * muss das Sensor-eigene draggable deaktiviert werden,
 * da es sonst den VueDraggable-Drag stören würde.
 */
const effectiveDraggable = computed(() => {
  // Wenn ESP-Card gedraggt wird, eigenes draggable deaktivieren
  if (dragStore.isDraggingEspCard) {
    return false
  }
  return props.draggable
})

// Handle click
function handleClick() {
  emit('click', props.gpio)
  if (props.showConnections) {
    emit('showConnections', props.gpio)
  }
}


// Drag handlers for Multi-Sensor Chart (Phase 4)
function handleDragStart(event: DragEvent) {
  log.debug('dragstart fired', { draggable: props.draggable, hasDataTransfer: !!event.dataTransfer })

  if (!props.draggable || !event.dataTransfer) {
    log.debug('dragstart ABORTED - not draggable or no dataTransfer')
    return
  }

  // KRITISCH: Verhindere dass VueDraggable (Parent) das Event abfängt!
  // Ohne stopPropagation() würde VueDraggable denken, eine ESP-Card wird gedraggt,
  // was den UI-State korrumpiert und dragend nie aufgerufen wird.
  event.stopPropagation()
  log.debug('stopPropagation() called')

  isDragging.value = true

  // Set drag data with sensor info
  const dragData = {
    type: 'sensor' as const,
    espId: props.espId,
    gpio: props.gpio,
    sensorType: props.sensorType,
    name: props.name || sensorConfig.value.label,
    unit: sensorConfig.value.unit,
  }
  event.dataTransfer.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer.effectAllowed = 'copy'
  log.debug('dataTransfer set', { dragData })

  // Update global drag state for auto-opening chart
  dragStore.startSensorDrag(dragData)
  log.debug('dragStore.startSensorDrag() called')
}

function handleDragEnd(event: DragEvent) {
  log.debug('dragend fired', { dropEffect: event.dataTransfer?.dropEffect })

  // KRITISCH: Auch hier stopPropagation für konsistentes Verhalten
  event.stopPropagation()
  log.debug('stopPropagation() called')

  isDragging.value = false
  // Clear global drag state
  dragStore.endDrag()
  log.debug('dragStore.endDrag() called - drag complete')
}
</script>

<template>
  <div
    :class="[
      'sensor-satellite',
      `sensor-satellite--values-${valueCount}`,
      {
        'sensor-satellite--selected': selected,
        'sensor-satellite--dragging': isDragging,
        'sensor-satellite--draggable': effectiveDraggable,
        'sensor-satellite--multi': isMultiValue
      }
    ]"
    :data-esp-id="espId"
    :data-gpio="gpio"
    :data-value-count="valueCount"
    data-satellite-type="sensor"
    :draggable="effectiveDraggable"
    :title="`${displayLabel} (GPIO ${gpio})`"
    @click="handleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Header: Icon + Label + GPIO Badge -->
    <div class="sensor-satellite__header">
      <div class="sensor-satellite__icon" :class="`sensor-satellite__icon--${qualityVariant}`">
        <component :is="sensorIcon" class="w-4 h-4" />
      </div>
      <span class="sensor-satellite__label">{{ displayLabel }}</span>
      <span v-if="isMultiValue" class="sensor-satellite__gpio-badge">{{ gpio }}</span>
    </div>

    <!-- Values Section: Grid layout based on value count -->
    <div class="sensor-satellite__values" :class="`sensor-satellite__values--count-${valueCount}`">
      <div
        v-for="val in formattedValues"
        :key="val.key"
        class="sensor-satellite__value-cell"
      >
        <!-- Value + Unit -->
        <div class="sensor-satellite__value">
          <span class="sensor-satellite__value-number">{{ val.value }}</span>
          <span class="sensor-satellite__value-unit">{{ val.unit }}</span>
        </div>
        <!-- Value Label (only for multi-value) -->
        <span v-if="valueCount > 1" class="sensor-satellite__value-label">
          {{ val.label }}
        </span>
      </div>
    </div>

    <!-- Quality Indicator -->
    <div class="sensor-satellite__quality" :class="`sensor-satellite__quality--${displayQuality}`">
      <span class="sensor-satellite__quality-dot" />
      <span class="sensor-satellite__quality-text">{{ qualityLabel }}</span>
    </div>

    <!-- Connection indicator (if has connections) -->
    <div v-if="showConnections" class="sensor-satellite__connection-indicator" />
  </div>
</template>

<style scoped>
/* =============================================================================
   SensorSatellite - Precision Instrument Panel
   Industrial IoT aesthetic with bold data readouts and clear hierarchy
   ============================================================================= */

.sensor-satellite {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.625rem;
  background: #141720;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 2px solid rgba(96, 165, 250, 0.4);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: satellite-enter 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;
}

@keyframes satellite-enter {
  from {
    opacity: 0;
    transform: translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Quality-colored left accent border */
.sensor-satellite:has(.sensor-satellite__quality--excellent) {
  border-left-color: #10b981;
}
.sensor-satellite:has(.sensor-satellite__quality--good) {
  border-left-color: var(--color-status-good);
}
.sensor-satellite:has(.sensor-satellite__quality--fair) {
  border-left-color: var(--color-status-warning);
}
.sensor-satellite:has(.sensor-satellite__quality--poor) {
  border-left-color: #f97316;
}
.sensor-satellite:has(.sensor-satellite__quality--bad),
.sensor-satellite:has(.sensor-satellite__quality--error) {
  border-left-color: var(--color-status-alarm);
}
.sensor-satellite:has(.sensor-satellite__quality--stale) {
  border-left-color: #4b5563;
}

/* Multi-value: wider cards */
.sensor-satellite--values-2 {
  min-width: 140px;
  max-width: 220px;
}

.sensor-satellite--values-3 {
  min-width: 180px;
  max-width: 260px;
}

/* Hover - clean elevation with subtle scale */
.sensor-satellite:hover {
  border-color: var(--glass-border-hover);
  background: #181c28;
  transform: scale(1.02);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(96, 165, 250, 0.08);
}

/* Selected state */
.sensor-satellite--selected {
  border-color: rgba(34, 211, 238, 0.4);
  background: rgba(34, 211, 238, 0.04);
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.2),
    0 2px 8px rgba(34, 211, 238, 0.1);
}

/* Draggable states */
.sensor-satellite--draggable {
  cursor: grab;
}

.sensor-satellite--draggable:active {
  cursor: grabbing;
}

.sensor-satellite--dragging {
  opacity: 0.8;
  transform: scale(0.97);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.5),
    0 0 16px rgba(34, 211, 238, 0.2);
}

/* =============================================================================
   Header - Compact, informative
   ============================================================================= */

.sensor-satellite__header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 1.25rem;
}

.sensor-satellite__icon {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.sensor-satellite__icon--success {
  background: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
}

.sensor-satellite__icon--warning {
  background: rgba(251, 191, 36, 0.15);
  color: var(--color-warning);
}

.sensor-satellite__icon--danger {
  background: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
}

.sensor-satellite__icon--gray {
  background: rgba(107, 114, 128, 0.12);
  color: #9ca3af;
}

.sensor-satellite__label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sensor-satellite__gpio-badge {
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.0625rem 0.1875rem;
  border-radius: 0.125rem;
  flex-shrink: 0;
}

/* =============================================================================
   Values - Bold instrument readout
   ============================================================================= */

.sensor-satellite__values {
  display: grid;
  gap: 0.375rem;
  padding: 0.125rem 0;
}

.sensor-satellite__values--count-1 {
  grid-template-columns: 1fr;
  text-align: center;
}

.sensor-satellite__values--count-2 {
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.sensor-satellite__values--count-3 {
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.375rem;
}

.sensor-satellite__value-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  position: relative;
}

/* Subtle divider between multi-values */
.sensor-satellite--values-2 .sensor-satellite__value-cell:first-child::after,
.sensor-satellite--values-3 .sensor-satellite__value-cell:not(:last-child)::after {
  content: '';
  position: absolute;
  right: -0.25rem;
  top: 10%;
  height: 80%;
  width: 1px;
  background: rgba(255, 255, 255, 0.06);
}

.sensor-satellite__value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.125rem;
}

.sensor-satellite__value-number {
  font-family: var(--font-mono);
  font-weight: 700;
  color: #f0f4ff;
  line-height: 1;
  letter-spacing: -0.04em;
}

/* Single value: large instrument readout */
.sensor-satellite--values-1 .sensor-satellite__value-number {
  font-size: 1.375rem;
}

/* Multi-value: balanced sizing */
.sensor-satellite--values-2 .sensor-satellite__value-number {
  font-size: 1rem;
}

.sensor-satellite--values-3 .sensor-satellite__value-number {
  font-size: 0.875rem;
}

.sensor-satellite__value-unit {
  font-size: 0.5625rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.02em;
}

.sensor-satellite--values-2 .sensor-satellite__value-unit,
.sensor-satellite--values-3 .sensor-satellite__value-unit {
  font-size: 0.5rem;
}

.sensor-satellite__value-label {
  font-size: 0.5rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* =============================================================================
   Quality Indicator - LED-style status bar
   ============================================================================= */

.sensor-satellite__quality {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding-top: 0.25rem;
  margin-top: 0.125rem;
}

.sensor-satellite__quality-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.sensor-satellite__quality-text {
  font-size: 0.5rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Quality colors - LED glow */
.sensor-satellite__quality--excellent .sensor-satellite__quality-dot {
  background-color: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  animation: led-breathe 3s ease-in-out infinite;
}

@keyframes led-breathe {
  0%, 100% { opacity: 0.7; transform: scale(1); box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); }
  50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 10px rgba(16, 185, 129, 0.8); }
}

.sensor-satellite__quality--good .sensor-satellite__quality-dot {
  background-color: var(--color-status-good);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.sensor-satellite__quality--fair .sensor-satellite__quality-dot {
  background-color: var(--color-status-warning);
  box-shadow: 0 0 6px rgba(234, 179, 8, 0.5);
}

.sensor-satellite__quality--poor .sensor-satellite__quality-dot {
  background-color: #f97316;
  box-shadow: 0 0 6px rgba(249, 115, 22, 0.5);
}

.sensor-satellite__quality--bad .sensor-satellite__quality-dot {
  background-color: var(--color-status-alarm);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}

.sensor-satellite__quality--stale .sensor-satellite__quality-dot {
  background-color: #4b5563;
  box-shadow: 0 0 4px rgba(75, 85, 99, 0.3);
}

.sensor-satellite__quality--error .sensor-satellite__quality-dot {
  background-color: #dc2626;
  box-shadow: 0 0 10px rgba(220, 38, 38, 0.7);
  animation: led-blink 1.2s ease-in-out infinite;
}

@keyframes led-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* =============================================================================
   Connection Indicator
   ============================================================================= */

.sensor-satellite__connection-indicator {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--color-success);
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
  animation: conn-pulse 2s infinite;
}

@keyframes conn-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>



