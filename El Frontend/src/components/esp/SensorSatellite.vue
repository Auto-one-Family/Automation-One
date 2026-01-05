<script setup lang="ts">
/**
 * SensorSatellite Component
 *
 * Displays a sensor as a "satellite" card around the main ESP card.
 * Shows live sensor values with quality indicators.
 *
 * Features:
 * - Live value display with unit
 * - Quality indicator (good/degraded/poor)
 * - Icon based on sensor type
 * - Click to show connection lines to linked actuators
 * - Draggable for Multi-Sensor Chart (Phase 4)
 */

import { computed, ref } from 'vue'
import { Thermometer, Droplet, Zap, Gauge, Wind, Sun } from 'lucide-vue-next'
import { SENSOR_TYPE_CONFIG, getSensorUnit, getSensorLabel } from '@/utils/sensorDefaults'
import { formatNumber } from '@/utils/formatters'
import { useDragStateStore } from '@/stores/dragState'
import type { QualityLevel } from '@/types'

interface Props {
  /** ESP ID this sensor belongs to */
  espId: string
  /** GPIO pin number */
  gpio: number
  /** Sensor type (e.g., 'DS18B20', 'pH', 'EC') */
  sensorType: string
  /** Sensor name (optional) */
  name?: string | null
  /** Current sensor value */
  value: number
  /** Quality level */
  quality: QualityLevel
  /** Unit (optional, will be derived from sensor type if not provided) */
  unit?: string
  /** Whether this sensor is selected/highlighted */
  selected?: boolean
  /** Whether to show connection lines on click */
  showConnections?: boolean
  /** Whether dragging is enabled (for Multi-Sensor Chart) */
  draggable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  showConnections: false,
  draggable: true,
})

const emit = defineEmits<{
  click: [gpio: number]
  showConnections: [gpio: number]
}>()

// Drag state store (global for auto-opening chart)
const dragStore = useDragStateStore()

// Local drag state for visual feedback
const isDragging = ref(false)

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
  if (iconName.includes('zap') || iconName.includes('ec')) return Zap
  if (iconName.includes('wind') || iconName.includes('fan')) return Wind
  if (iconName.includes('sun') || iconName.includes('light')) return Sun
  return Gauge
})

// Quality variant for icon color
const qualityVariant = computed(() => {
  if (props.quality === 'excellent' || props.quality === 'good') return 'success'
  if (props.quality === 'fair') return 'warning'
  if (props.quality === 'poor' || props.quality === 'bad' || props.quality === 'stale') return 'danger'
  return 'gray'
})

// Formatted value
const formattedValue = computed(() =>
  formatNumber(props.value, sensorConfig.value.decimals)
)

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

// Debug logger with consistent styling
function log(message: string, data?: Record<string, unknown>): void {
  const style = 'background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
  const label = `SensorSatellite:${props.espId}:GPIO${props.gpio}`
  if (data) {
    console.log(`%c[${label}]%c ${message}`, style, 'color: #34d399;', data)
  } else {
    console.log(`%c[${label}]%c ${message}`, style, 'color: #34d399;')
  }
}

// Drag handlers for Multi-Sensor Chart (Phase 4)
function handleDragStart(event: DragEvent) {
  log('dragstart fired', { draggable: props.draggable, hasDataTransfer: !!event.dataTransfer })

  if (!props.draggable || !event.dataTransfer) {
    log('dragstart ABORTED - not draggable or no dataTransfer')
    return
  }

  // KRITISCH: Verhindere dass VueDraggable (Parent) das Event abfängt!
  // Ohne stopPropagation() würde VueDraggable denken, eine ESP-Card wird gedraggt,
  // was den UI-State korrumpiert und dragend nie aufgerufen wird.
  event.stopPropagation()
  log('stopPropagation() called')

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
  log('dataTransfer set', { dragData })

  // Update global drag state for auto-opening chart
  dragStore.startSensorDrag(dragData)
  log('dragStore.startSensorDrag() called')
}

function handleDragEnd(event: DragEvent) {
  log('dragend fired', { dropEffect: event.dataTransfer?.dropEffect })

  // KRITISCH: Auch hier stopPropagation für konsistentes Verhalten
  event.stopPropagation()
  log('stopPropagation() called')

  isDragging.value = false
  // Clear global drag state
  dragStore.endDrag()
  log('dragStore.endDrag() called - drag complete')
}
</script>

<template>
  <div
    :class="[
      'sensor-satellite',
      {
        'sensor-satellite--selected': selected,
        'sensor-satellite--dragging': isDragging,
        'sensor-satellite--draggable': effectiveDraggable
      }
    ]"
    :data-esp-id="espId"
    :data-gpio="gpio"
    data-satellite-type="sensor"
    :draggable="effectiveDraggable"
    :title="`${name || sensorConfig.label} (GPIO ${gpio})`"
    @click="handleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Compact vertical layout: Icon → Value → Label -->
    <div class="sensor-satellite__icon" :class="`sensor-satellite__icon--${qualityVariant}`">
      <component :is="sensorIcon" class="w-4 h-4" />
    </div>

    <!-- Value (prominent) -->
    <div class="sensor-satellite__value">
      <span class="sensor-satellite__value-number">{{ formattedValue }}</span>
      <span class="sensor-satellite__value-unit">{{ sensorConfig.unit }}</span>
    </div>

    <!-- Label (compact) -->
    <span class="sensor-satellite__label">
      {{ name || sensorConfig.label }}
    </span>

    <!-- Connection indicator (if has connections) -->
    <div v-if="showConnections" class="sensor-satellite__connection-indicator" />
  </div>
</template>

<style scoped>
/* =============================================================================
   SensorSatellite - Compact Vertical Design for Side-by-Side Layout
   Optimized for narrow columns in horizontal ESP layout
   ============================================================================= */

.sensor-satellite {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1875rem;
  padding: 0.4375rem 0.375rem;
  background: rgba(30, 32, 40, 0.9);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 50px;
  max-width: 120px;
  backdrop-filter: blur(10px);
  /* Enhanced floating effect */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.1);
}

.sensor-satellite:hover {
  border-color: var(--color-iridescent-2);
  transform: translateY(-2px);
  background: rgba(40, 42, 54, 0.95);
  /* Enhanced hover shadow */
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.25),
    0 8px 24px rgba(0, 0, 0, 0.15),
    0 0 16px rgba(167, 139, 250, 0.15);
}

.sensor-satellite--selected {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
}

.sensor-satellite--draggable {
  cursor: grab;
}

.sensor-satellite--draggable:active {
  cursor: grabbing;
}

.sensor-satellite--dragging {
  opacity: 0.7;
  transform: scale(0.95);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4),
              0 0 12px rgba(167, 139, 250, 0.3);
  border-color: var(--color-iridescent-1);
}

/* Icon - compact circle */
.sensor-satellite__icon {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.2s;
}

.sensor-satellite__icon--success {
  background-color: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
}

.sensor-satellite__icon--warning {
  background-color: rgba(251, 191, 36, 0.15);
  color: var(--color-warning);
}

.sensor-satellite__icon--danger {
  background-color: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
}

.sensor-satellite__icon--gray {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}

/* Value - prominent display */
.sensor-satellite__value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.0625rem;
}

.sensor-satellite__value-number {
  font-size: 0.875rem;    /* Increased from 0.8125rem */
  font-weight: 700;       /* Increased from 600 */
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-primary);
  line-height: 1;
  letter-spacing: -0.025em;
}

.sensor-satellite__value-unit {
  font-size: 0.625rem;    /* Increased from 0.5625rem */
  color: var(--color-text-secondary);  /* Improved contrast */
}

/* Label - compact */
.sensor-satellite__label {
  font-size: 0.625rem;    /* Increased from 0.5625rem */
  font-weight: 500;
  color: var(--color-text-secondary);  /* Improved contrast */
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1.2;
}

/* Connection indicator */
.sensor-satellite__connection-indicator {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background-color: var(--color-success);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>



