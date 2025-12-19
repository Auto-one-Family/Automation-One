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
 */

import { computed } from 'vue'
import { Power, ToggleRight, Waves, GitBranch, Fan, Flame, Lightbulb, Cog } from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { getActuatorTypeLabel, getActuatorTypeInfo } from '@/utils/labels'

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
}

const props = withDefaults(defineProps<Props>(), {
  emergencyStopped: false,
  selected: false,
  showConnections: false,
})

const emit = defineEmits<{
  click: [gpio: number]
  showConnections: [gpio: number]
}>()

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
      variant: (pwm > 0 ? 'success' : 'gray') as const 
    }
  }
  
  return {
    text: props.state ? 'AN' : 'AUS',
    variant: (props.state ? 'success' : 'gray') as const
  }
})

// Handle click
function handleClick() {
  emit('click', props.gpio)
  if (props.showConnections) {
    emit('showConnections', props.gpio)
  }
}
</script>

<template>
  <div
    :class="[
      'actuator-satellite',
      { 
        'actuator-satellite--selected': selected,
        'actuator-satellite--active': state && !emergencyStopped,
        'actuator-satellite--emergency': emergencyStopped
      }
    ]"
    @click="handleClick"
  >
    <!-- Icon -->
    <div 
      class="actuator-satellite__icon" 
      :class="[
        `actuator-satellite__icon--${statusDisplay.variant}`,
        { 'actuator-satellite__icon--active': state && !emergencyStopped }
      ]"
    >
      <component :is="actuatorIcon" class="w-5 h-5" />
    </div>
    
    <!-- Content -->
    <div class="actuator-satellite__content">
      <!-- Name/Type -->
      <div class="actuator-satellite__header">
        <span class="actuator-satellite__name">
          {{ name || actuatorInfo.label }}
        </span>
        <span class="actuator-satellite__gpio">GPIO {{ gpio }}</span>
      </div>
      
      <!-- Status -->
      <div class="actuator-satellite__status">
        <Badge 
          :variant="statusDisplay.variant" 
          size="sm"
          :pulse="state && !emergencyStopped"
        >
          {{ statusDisplay.text }}
        </Badge>
        <span 
          v-if="(actuatorType === 'pwm' || actuatorType === 'fan') && pwmValue !== undefined"
          class="actuator-satellite__pwm"
        >
          PWM: {{ pwmValue }}
        </span>
      </div>
    </div>
    
    <!-- Connection indicator (if has connections) -->
    <div v-if="showConnections" class="actuator-satellite__connection-indicator" />
  </div>
</template>

<style scoped>
.actuator-satellite {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 180px;
}

.actuator-satellite:hover {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.actuator-satellite--selected {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
}

.actuator-satellite--active {
  border-color: rgba(52, 211, 153, 0.3);
}

.actuator-satellite--emergency {
  border-color: rgba(248, 113, 113, 0.3);
  animation: pulse-emergency 1s infinite;
}

@keyframes pulse-emergency {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.actuator-satellite__icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
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

.actuator-satellite__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.actuator-satellite__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.actuator-satellite__name {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actuator-satellite__gpio {
  font-size: 0.625rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.actuator-satellite__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.actuator-satellite__pwm {
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
}

.actuator-satellite__connection-indicator {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: var(--color-success);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>



