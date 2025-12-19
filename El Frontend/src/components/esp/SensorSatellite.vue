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
 */

import { computed } from 'vue'
import { Thermometer, Droplet, Zap, Gauge, Wind, Sun } from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { SENSOR_TYPE_CONFIG, getSensorUnit, getSensorLabel } from '@/utils/sensorDefaults'
import { getQualityInfo } from '@/utils/labels'
import { formatNumber } from '@/utils/formatters'
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
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  showConnections: false,
})

const emit = defineEmits<{
  click: [gpio: number]
  showConnections: [gpio: number]
}>()

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

// Quality info
const qualityInfo = computed(() => getQualityInfo(props.quality))

// Quality variant for badge
const qualityVariant = computed(() => {
  if (props.quality === 'excellent' || props.quality === 'good') return 'success'
  if (props.quality === 'fair' || props.quality === 'degraded') return 'warning'
  if (props.quality === 'poor' || props.quality === 'bad') return 'danger'
  return 'gray'
})

// Formatted value
const formattedValue = computed(() => 
  formatNumber(props.value, sensorConfig.value.decimals)
)

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
      'sensor-satellite',
      { 'sensor-satellite--selected': selected }
    ]"
    @click="handleClick"
  >
    <!-- Icon -->
    <div class="sensor-satellite__icon" :class="`sensor-satellite__icon--${qualityVariant}`">
      <component :is="sensorIcon" class="w-5 h-5" />
    </div>
    
    <!-- Content -->
    <div class="sensor-satellite__content">
      <!-- Name/Type -->
      <div class="sensor-satellite__header">
        <span class="sensor-satellite__name">
          {{ name || sensorConfig.label }}
        </span>
        <span class="sensor-satellite__gpio">GPIO {{ gpio }}</span>
      </div>
      
      <!-- Value -->
      <div class="sensor-satellite__value">
        <span class="sensor-satellite__value-number">{{ formattedValue }}</span>
        <span class="sensor-satellite__value-unit">{{ sensorConfig.unit }}</span>
      </div>
      
      <!-- Quality Badge -->
      <Badge 
        :variant="qualityVariant" 
        size="xs"
        class="sensor-satellite__quality"
      >
        {{ qualityInfo.label }}
      </Badge>
    </div>
    
    <!-- Connection indicator (if has connections) -->
    <div v-if="showConnections" class="sensor-satellite__connection-indicator" />
  </div>
</template>

<style scoped>
.sensor-satellite {
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

.sensor-satellite:hover {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.sensor-satellite--selected {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
}

.sensor-satellite__icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
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

.sensor-satellite__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.sensor-satellite__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.sensor-satellite__name {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sensor-satellite__gpio {
  font-size: 0.625rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.sensor-satellite__value {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.sensor-satellite__value-number {
  font-size: 1.125rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-primary);
  line-height: 1;
}

.sensor-satellite__value-unit {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.sensor-satellite__quality {
  align-self: flex-start;
}

.sensor-satellite__connection-indicator {
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

