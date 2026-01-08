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

import { computed, ref } from 'vue'
import { Gauge, Info, Edit, Trash2, AlertTriangle, Activity, Clock, Calendar, Pause, HelpCircle, Play } from 'lucide-vue-next'
import { sensorsApi } from '@/api/sensors'
import { useToast } from '@/composables/useToast'
import Badge from '@/components/common/Badge.vue'
import {
  SENSOR_TYPE_CONFIG,
  getSensorLabel,
} from '@/utils/sensorDefaults'
import { getQualityInfo, getGpioDescription } from '@/utils/labels'
import { formatRelativeTime, formatNumber, formatSensorStatus, getModeLabel } from '@/utils/formatters'
import type { SensorOperatingMode } from '@/types'

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
  // Phase 2E: Health-Status fields
  operating_mode?: SensorOperatingMode
  timeout_seconds?: number
  is_stale?: boolean
  stale_reason?: string
  last_reading_at?: string | null
}

interface Props {
  /** The sensor data */
  sensor: Sensor
  /** ESP device ID - required for triggering measurements */
  espId: string
  /** Whether editing is enabled */
  editable?: boolean
  /** Whether to show compact view */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  editable: false,
  compact: false,
})

// Toast notifications
const toast = useToast()

// State for measurement button
const isMeasuring = ref(false)

// Computed: Button nur für nicht-continuous Modi anzeigen
const showMeasureButton = computed(() => {
  const mode = props.sensor.operating_mode
  // Zeige Button für on_demand, paused, oder scheduled
  // NICHT für continuous (die messen automatisch)
  return mode && mode !== 'continuous'
})

// Handler für Measurement-Trigger
async function handleTriggerMeasurement() {
  if (isMeasuring.value) return

  isMeasuring.value = true

  try {
    const result = await sensorsApi.triggerMeasurement(props.espId, props.sensor.gpio)

    toast.success(`Messung gestartet für GPIO ${props.sensor.gpio}`)

    console.log('Measurement triggered:', result)

  } catch (err: unknown) {
    console.error('Measurement trigger failed:', err)

    const errorMessage = (err as { response?: { data?: { detail?: string } } })
      .response?.data?.detail || 'Messung konnte nicht gestartet werden'

    toast.error(errorMessage)

  } finally {
    // Kurze Verzögerung bevor Button wieder aktiv wird
    // (gibt ESP32 Zeit für Messung + MQTT Response)
    setTimeout(() => {
      isMeasuring.value = false
    }, 2000)
  }
}

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

// Phase 2E: Modus-basierter Sensor-Status für Anzeige
const sensorStatus = computed(() => {
  return formatSensorStatus({
    operating_mode: props.sensor.operating_mode,
    is_stale: props.sensor.is_stale,
    last_reading_at: props.sensor.last_reading_at || props.sensor.updated_at,
    timeout_seconds: props.sensor.timeout_seconds,
  })
})

// Map icon names to components
const statusIconMap: Record<string, typeof AlertTriangle> = {
  'Activity': Activity,
  'AlertTriangle': AlertTriangle,
  'Clock': Clock,
  'Calendar': Calendar,
  'Pause': Pause,
  'HelpCircle': HelpCircle,
}
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
      
      <!-- Quality and status badges -->
      <div class="sensor-value-card__badges">
        <!-- Quality Badge (bestehend) -->
        <Badge
          :variant="qualityInfo.label === 'Gut' || qualityInfo.label === 'Ausgezeichnet' ? 'success' : 'warning'"
          size="sm"
        >
          {{ qualityInfo.label }}
        </Badge>

        <!-- Phase 2E: Operating Mode Badge (nur wenn nicht continuous) -->
        <Badge
          v-if="sensor.operating_mode && sensor.operating_mode !== 'continuous'"
          :variant="sensorStatus.variant"
          size="sm"
          :title="sensorStatus.label"
        >
          <component
            :is="statusIconMap[sensorStatus.icon]"
            class="w-3 h-3 mr-1"
          />
          {{ getModeLabel(sensor.operating_mode) }}
        </Badge>

        <!-- Phase 2E: Stale-Warnung (nur bei continuous + stale) -->
        <Badge
          v-if="sensor.operating_mode === 'continuous' && sensor.is_stale"
          variant="error"
          size="sm"
          :title="sensorStatus.label"
        >
          <AlertTriangle class="w-3 h-3 mr-1" />
          Stale
        </Badge>

        <!-- Subzone Badge -->
        <Badge v-if="sensor.subzone_id" variant="gray" size="sm">
          {{ sensor.subzone_id }}
        </Badge>
      </div>

      <!-- Phase 2D: Messung starten Button (nur für nicht-continuous Modi) -->
      <button
        v-if="showMeasureButton"
        class="sensor-value-card__measure-btn"
        :disabled="isMeasuring"
        @click="handleTriggerMeasurement"
      >
        <!-- Loading Spinner -->
        <svg
          v-if="isMeasuring"
          class="sensor-value-card__spinner"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>

        <!-- Play Icon (wenn nicht loading) -->
        <Play v-else class="w-4 h-4" />

        <span>{{ isMeasuring ? 'Messe...' : 'Messung starten' }}</span>
      </button>

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
          <div v-if="sensor.updated_at || sensor.last_reading_at" class="sensor-value-card__detail-row">
            <span>Aktualisiert</span>
            <span>{{ formatRelativeTime(sensor.last_reading_at || sensor.updated_at) }}</span>
          </div>
          <!-- Phase 2E: Operating Mode -->
          <div v-if="sensor.operating_mode" class="sensor-value-card__detail-row">
            <span>Modus</span>
            <span>{{ getModeLabel(sensor.operating_mode) }}</span>
          </div>
          <div v-if="sensor.timeout_seconds && sensor.timeout_seconds > 0" class="sensor-value-card__detail-row">
            <span>Timeout</span>
            <span>{{ sensor.timeout_seconds }}s</span>
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

/* Phase 2D: Measure Button Styles */
.sensor-value-card__measure-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.5rem;
  transition: all 0.2s;
  background-color: rgba(59, 130, 246, 0.2);
  color: rgb(96, 165, 250);
  border: 1px solid rgba(59, 130, 246, 0.3);
  cursor: pointer;
}

.sensor-value-card__measure-btn:hover:not(:disabled) {
  background-color: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
}

.sensor-value-card__measure-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sensor-value-card__spinner {
  width: 1rem;
  height: 1rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>


















