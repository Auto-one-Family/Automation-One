<script setup lang="ts">
/**
 * SensorValueCard Component
 * 
 * Displays a sensor's value with:
 * - Human-readable sensor type label
 * - Correct unit from SENSOR_TYPE_CONFIG
 * - Quality indicator
 * - Technical details (collapsible)
 * - Edit/Remove actions
 */

import { computed } from 'vue'
import { Gauge, Info, Edit, Trash2 } from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { 
  SENSOR_TYPE_CONFIG, 
  getSensorLabel, 
  getSensorUnit,
  formatSensorValueWithUnit 
} from '@/utils/sensorDefaults'
import { getQualityInfo, getGpioDescription } from '@/utils/labels'
import { formatRelativeTime, formatNumber } from '@/utils/formatters'

interface Sensor {
  gpio: number
  sensor_type: string
  name?: string
  subzone_id?: string
  raw_value: number
  processed_value?: number
  unit: string
  quality: string
  updated_at?: string
}

interface Props {
  /** The sensor data */
  sensor: Sensor
  /** Whether editing is enabled */
  editable?: boolean
  /** Whether to show compact view */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  editable: false,
  compact: false,
})

const emit = defineEmits<{
  edit: [gpio: number]
  remove: [gpio: number]
}>()

// Get sensor configuration
const sensorConfig = computed(() => SENSOR_TYPE_CONFIG[props.sensor.sensor_type])

// Use the correct unit from config, fallback to sensor's unit
const displayUnit = computed(() => 
  sensorConfig.value?.unit ?? props.sensor.unit ?? 'raw'
)

// Get display value (processed if available, otherwise raw)
const displayValue = computed(() => 
  props.sensor.processed_value ?? props.sensor.raw_value
)

// Format the value with correct decimals from config
const formattedValue = computed(() => {
  const decimals = sensorConfig.value?.decimals ?? 2
  return formatNumber(displayValue.value, decimals)
})

// Get quality info for badge
const qualityInfo = computed(() => getQualityInfo(props.sensor.quality))

// Human-readable name
const sensorName = computed(() => 
  props.sensor.name || getSensorLabel(props.sensor.sensor_type) || `GPIO ${props.sensor.gpio}`
)

// Sensor type label
const typeLabel = computed(() => getSensorLabel(props.sensor.sensor_type))

// GPIO description for tooltip
const gpioTooltip = computed(() => getGpioDescription(props.sensor.gpio))
</script>

<template>
  <div :class="['sensor-value-card', { 'sensor-value-card--compact': compact }]">
    <!-- Icon -->
    <div class="sensor-value-card__icon">
      <Gauge class="w-5 h-5" />
    </div>
    
    <!-- Main content -->
    <div class="sensor-value-card__content">
      <!-- Name and type -->
      <div class="sensor-value-card__header">
        <span class="sensor-value-card__name">{{ sensorName }}</span>
        <span class="sensor-value-card__type">{{ typeLabel }}</span>
      </div>
      
      <!-- Value display -->
      <div class="sensor-value-card__value-row">
        <span class="sensor-value-card__value">{{ formattedValue }}</span>
        <span class="sensor-value-card__unit">{{ displayUnit }}</span>
      </div>
      
      <!-- Quality and subzone badges -->
      <div class="sensor-value-card__badges">
        <Badge 
          :variant="qualityInfo.label === 'Gut' || qualityInfo.label === 'Ausgezeichnet' ? 'success' : 'warning'" 
          size="sm"
        >
          {{ qualityInfo.label }}
        </Badge>
        
        <Badge v-if="sensor.subzone_id" variant="gray" size="sm">
          {{ sensor.subzone_id }}
        </Badge>
      </div>
      
      <!-- Technical details (expandable) -->
      <details v-if="!compact" class="sensor-value-card__details">
        <summary class="sensor-value-card__details-toggle">
          <Info class="w-3 h-3" />
          Technische Details
        </summary>
        <div class="sensor-value-card__details-content">
          <div class="sensor-value-card__detail-row">
            <span>Typ</span>
            <span>{{ sensor.sensor_type }}</span>
          </div>
          <div class="sensor-value-card__detail-row" :title="gpioTooltip">
            <span>GPIO</span>
            <span>{{ sensor.gpio }}</span>
          </div>
          <div class="sensor-value-card__detail-row">
            <span>Rohwert</span>
            <span>{{ formatNumber(sensor.raw_value, 4) }}</span>
          </div>
          <div v-if="sensor.updated_at" class="sensor-value-card__detail-row">
            <span>Aktualisiert</span>
            <span>{{ formatRelativeTime(sensor.updated_at) }}</span>
          </div>
          <div v-if="sensorConfig?.description" class="sensor-value-card__description">
            {{ sensorConfig.description }}
          </div>
        </div>
      </details>
    </div>
    
    <!-- Actions -->
    <div v-if="editable" class="sensor-value-card__actions">
      <button
        class="sensor-value-card__action-btn"
        @click="emit('edit', sensor.gpio)"
        title="Bearbeiten"
      >
        <Edit class="w-4 h-4" />
      </button>
      <button
        class="sensor-value-card__action-btn sensor-value-card__action-btn--danger"
        @click="emit('remove', sensor.gpio)"
        title="Entfernen"
      >
        <Trash2 class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.sensor-value-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  transition: background-color 0.2s;
}

.sensor-value-card:hover {
  background-color: var(--color-bg-hover);
}

.sensor-value-card--compact {
  padding: 0.75rem;
}

.sensor-value-card__icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background-color: rgba(167, 139, 250, 0.2);
  color: var(--color-mock);
  flex-shrink: 0;
}

.sensor-value-card__content {
  flex: 1;
  min-width: 0;
}

.sensor-value-card__header {
  margin-bottom: 0.25rem;
}

.sensor-value-card__name {
  font-weight: 600;
  color: var(--color-text-primary);
  display: block;
}

.sensor-value-card__type {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.sensor-value-card__value-row {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  margin: 0.5rem 0;
}

.sensor-value-card__value {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-primary);
}

.sensor-value-card__unit {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.sensor-value-card__badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.sensor-value-card__details {
  margin-top: 0.75rem;
  font-size: 0.75rem;
}

.sensor-value-card__details-toggle {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--color-text-muted);
  cursor: pointer;
  user-select: none;
}

.sensor-value-card__details-toggle:hover {
  color: var(--color-text-secondary);
}

.sensor-value-card__details-content {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: var(--color-bg-secondary);
  border-radius: 0.25rem;
}

.sensor-value-card__detail-row {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--glass-border);
}

.sensor-value-card__detail-row:last-child {
  border-bottom: none;
}

.sensor-value-card__detail-row span:first-child {
  color: var(--color-text-muted);
}

.sensor-value-card__detail-row span:last-child {
  color: var(--color-text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.sensor-value-card__description {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--glass-border);
  color: var(--color-text-secondary);
  font-style: italic;
}

.sensor-value-card__actions {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sensor-value-card__action-btn {
  padding: 0.5rem;
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.sensor-value-card__action-btn:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
}

.sensor-value-card__action-btn--danger:hover {
  color: var(--color-error);
  background-color: rgba(248, 113, 113, 0.1);
}
</style>


