<script setup lang="ts">
/**
 * ActuatorSatellite Component
 *
 * Displays an actuator as a "satellite" card around the main ESP card.
 * Shows actuator status (ON/OFF/PWM value).
 *
 * Features:
 * - Status display (AN/AUS/PWM-Wert)
 * - Icon based on actuator type
 * - Click to show connection lines to linked sensors
 * - Draggable for future chart integration (Phase 4)
 */

import { computed, ref } from 'vue'
import { Power, ToggleRight, Waves, GitBranch, Fan, Flame, Lightbulb, Cog } from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { getActuatorTypeInfo } from '@/utils/labels'
import { useDragStateStore } from '@/stores/dragState'

interface Props {
  /** ESP ID this actuator belongs to */
  espId: string
  /** GPIO pin number */
  gpio: number
  /** Actuator type (e.g., 'relay', 'pump', 'valve') */
  actuatorType: string
  /** Actuator name (optional) */
  name?: string | null
  /** Current state (ON/OFF) */
  state: boolean
  /** PWM value (0-255, if applicable) */
  pwmValue?: number
  /** Whether actuator is emergency stopped */
  emergencyStopped?: boolean
  /** Whether this actuator is selected/highlighted */
  selected?: boolean
  /** Whether to show connection lines on click */
  showConnections?: boolean
  /** Whether dragging is enabled */
  draggable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  emergencyStopped: false,
  selected: false,
  showConnections: false,
  draggable: true,
})

const emit = defineEmits<{
  click: [gpio: number]
  showConnections: [gpio: number]
}>()

// Drag state store (global ESP-Card drag tracking)
const dragStore = useDragStateStore()

// Drag state
const isDragging = ref(false)

/**
 * Effective draggable state.
 * KRITISCH: Wenn ein ESP-Card-Drag (VueDraggable) aktiv ist,
 * muss das Actuator-eigene draggable deaktiviert werden,
 * da es sonst den VueDraggable-Drag stören würde.
 */
const effectiveDraggable = computed(() => {
  if (dragStore.isDraggingEspCard) {
    return false
  }
  return props.draggable
})

// Get actuator type info
const actuatorInfo = computed(() => getActuatorTypeInfo(props.actuatorType))

// Get actuator icon component
const actuatorIcon = computed(() => {
  const iconName = actuatorInfo.value.icon.toLowerCase()
  if (iconName.includes('toggle') || iconName.includes('power')) return Power
  if (iconName.includes('waves') || iconName.includes('pump')) return Waves
  if (iconName.includes('branch') || iconName.includes('valve')) return GitBranch
  if (iconName.includes('fan')) return Fan
  if (iconName.includes('flame') || iconName.includes('heater')) return Flame
  if (iconName.includes('lightbulb') || iconName.includes('light')) return Lightbulb
  if (iconName.includes('cog') || iconName.includes('motor')) return Cog
  return ToggleRight
})

// Status display
const statusDisplay = computed(() => {
  if (props.emergencyStopped) {
    return { text: 'E-STOP', variant: 'danger' as const }
  }
  
  if (props.actuatorType === 'pwm' || props.actuatorType === 'fan') {
    const pwm = props.pwmValue || 0
    const percent = Math.round((pwm / 255) * 100)
    return {
      text: `${percent}%`,
      variant: pwm > 0 ? 'success' : 'gray'
    } as const
  }

  return {
    text: props.state ? 'AN' : 'AUS',
    variant: props.state ? 'success' : 'gray'
  } as const
})

// Handle click
function handleClick() {
  emit('click', props.gpio)
  if (props.showConnections) {
    emit('showConnections', props.gpio)
  }
}

// Drag handlers (Phase 4)
function handleDragStart(event: DragEvent) {
  if (!props.draggable || !event.dataTransfer) return

  // KRITISCH: Verhindere dass VueDraggable (Parent) das Event abfängt!
  // Ohne stopPropagation() würde VueDraggable denken, eine ESP-Card wird gedraggt.
  event.stopPropagation()

  isDragging.value = true

  // Set drag data with actuator info
  const dragData = {
    type: 'actuator' as const,
    espId: props.espId,
    gpio: props.gpio,
    actuatorType: props.actuatorType,
    name: props.name || actuatorInfo.value.label,
  }
  event.dataTransfer.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer.effectAllowed = 'copy'
}

function handleDragEnd(event: DragEvent) {
  // KRITISCH: Auch hier stopPropagation für konsistentes Verhalten
  event.stopPropagation()
  isDragging.value = false
}
</script>

<template>
  <div
    :class="[
      'actuator-satellite',
      {
        'actuator-satellite--selected': selected,
        'actuator-satellite--active': state && !emergencyStopped,
        'actuator-satellite--emergency': emergencyStopped,
        'actuator-satellite--dragging': isDragging,
        'actuator-satellite--draggable': effectiveDraggable
      }
    ]"
    :data-esp-id="espId"
    :data-gpio="gpio"
    data-satellite-type="actuator"
    :draggable="effectiveDraggable"
    :title="`${name || actuatorInfo.label} (GPIO ${gpio})`"
    @click="handleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Compact vertical layout: Icon → Status → Label -->
    <div
      class="actuator-satellite__icon"
      :class="[
        `actuator-satellite__icon--${statusDisplay.variant}`,
        { 'actuator-satellite__icon--active': state && !emergencyStopped }
      ]"
    >
      <component :is="actuatorIcon" class="w-4 h-4" />
    </div>

    <!-- Status Badge (prominent) -->
    <Badge
      :variant="statusDisplay.variant"
      size="xs"
      :pulse="state && !emergencyStopped"
      class="actuator-satellite__badge"
    >
      {{ statusDisplay.text }}
    </Badge>

    <!-- Label (compact) -->
    <span class="actuator-satellite__label">
      {{ name || actuatorInfo.label }}
    </span>

    <!-- Connection indicator (if has connections) -->
    <div v-if="showConnections" class="actuator-satellite__connection-indicator" />
  </div>
</template>

<style scoped>
/* =============================================================================
   ActuatorSatellite - Compact Vertical Design for Side-by-Side Layout
   Optimized for narrow columns in horizontal ESP layout
   ============================================================================= */

.actuator-satellite {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  background: rgba(30, 32, 40, 0.9);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 52px;
  max-width: 130px;
  backdrop-filter: blur(10px);
  /* Enhanced floating effect */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.1);
}

.actuator-satellite:hover {
  border-color: var(--color-iridescent-1);
  transform: translateY(-2px);
  background: rgba(40, 42, 54, 0.95);
  /* Enhanced hover shadow */
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.25),
    0 8px 24px rgba(0, 0, 0, 0.15),
    0 0 16px rgba(167, 139, 250, 0.15);
}

.actuator-satellite--selected {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
}

.actuator-satellite--draggable {
  cursor: grab;
}

.actuator-satellite--draggable:active {
  cursor: grabbing;
}

.actuator-satellite--dragging {
  opacity: 0.7;
  transform: scale(0.95);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.actuator-satellite--active {
  border-color: rgba(52, 211, 153, 0.4);
}

.actuator-satellite--emergency {
  border-color: rgba(248, 113, 113, 0.4);
  animation: pulse-emergency 1s infinite;
}

@keyframes pulse-emergency {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Icon - compact circle */
.actuator-satellite__icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.2s;
}

.actuator-satellite__icon--success {
  background-color: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
}

.actuator-satellite__icon--gray {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}

.actuator-satellite__icon--danger {
  background-color: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
}

.actuator-satellite__icon--active {
  animation: pulse-icon 2s infinite;
}

@keyframes pulse-icon {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Badge - centered */
.actuator-satellite__badge {
  /* Badge styling handled by component */
}

/* Label - compact */
.actuator-satellite__label {
  font-size: 0.625rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1.2;
}

/* Connection indicator */
.actuator-satellite__connection-indicator {
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



