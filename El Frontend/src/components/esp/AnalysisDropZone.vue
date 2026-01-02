<script setup lang="ts">
/**
 * AnalysisDropZone Component
 *
 * Drop target for sensor satellites to create Multi-Sensor Charts.
 * Accepts dragged sensors and displays them in a combined chart.
 *
 * Features:
 * - Drop zone with visual feedback
 * - Multiple sensor selection
 * - Time range selector (1h, 6h, 24h, 7d, 30d)
 * - Remove sensors from chart
 * - Integrates with MultiSensorChart component
 *
 * Phase 4: Charts & Drag-Drop
 */

import { ref, computed } from 'vue'
import { X, ChartLine, Plus, Settings } from 'lucide-vue-next'
import MultiSensorChart from '@/components/charts/MultiSensorChart.vue'
import type { ChartSensor, SensorDragData } from '@/types'

interface Props {
  /** Title for the drop zone */
  title?: string
  /** Maximum sensors allowed */
  maxSensors?: number
  /** ESP ID to filter sensors (optional) */
  espId?: string
  /** Compact mode for embedded display */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Sensor-Analyse',
  maxSensors: 5,
  espId: '',
  compact: false,
})

const emit = defineEmits<{
  sensorAdded: [sensor: ChartSensor]
  sensorRemoved: [sensorId: string]
  sensorsCleared: []
}>()

// State
const isDragOver = ref(false)
const selectedSensors = ref<ChartSensor[]>([])
const timeRange = ref<'1h' | '6h' | '24h' | '7d' | '30d'>('24h')

// Y-Axis configuration (undefined = auto)
const yAxisMin = ref<number | undefined>(undefined)
const yAxisMax = ref<number | undefined>(undefined)
const showYAxisSettings = ref(false)

// Chart colors palette
const chartColors = [
  '#a78bfa', // Purple
  '#34d399', // Green
  '#60a5fa', // Blue
  '#f472b6', // Pink
  '#fbbf24', // Yellow
]

// Time range options
const timeRangeOptions = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
] as const

// Computed
const hasReachedMax = computed(() => selectedSensors.value.length >= props.maxSensors)
const isEmpty = computed(() => selectedSensors.value.length === 0)

// Get next available color
function getNextColor(): string {
  const usedColors = selectedSensors.value.map((s) => s.color)
  return chartColors.find((c) => !usedColors.includes(c)) || chartColors[0]
}

// Drag handlers - auf Root-Element für zuverlässiges Drop-Target
function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  if (!hasReachedMax.value) {
    isDragOver.value = true
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  if (hasReachedMax.value) {
    event.dataTransfer!.dropEffect = 'none'
    return
  }
  event.dataTransfer!.dropEffect = 'copy'
  isDragOver.value = true
}

function handleDragLeave(event: DragEvent) {
  // Nur zurücksetzen wenn wir das Root-Element verlassen, nicht bei Child-Elementen
  const target = event.currentTarget as HTMLElement
  const related = event.relatedTarget as HTMLElement | null
  if (!related || !target.contains(related)) {
    isDragOver.value = false
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false

  if (hasReachedMax.value) return

  const data = event.dataTransfer?.getData('application/json')
  if (!data) return

  try {
    const dragData = JSON.parse(data)

    // ISSUE-002 fix: Vollständige Validierung der drag data
    // Prüfe alle erforderlichen Felder bevor sie verwendet werden
    if (
      dragData.type !== 'sensor' ||
      typeof dragData.espId !== 'string' || !dragData.espId ||
      typeof dragData.gpio !== 'number' || isNaN(dragData.gpio) ||
      typeof dragData.sensorType !== 'string' || !dragData.sensorType
    ) {
      console.warn('[AnalysisDropZone] Invalid drag data - missing required fields:', {
        type: dragData.type,
        espId: dragData.espId,
        gpio: dragData.gpio,
        sensorType: dragData.sensorType,
      })
      return
    }

    // Check if sensor already exists
    const sensorId = `${dragData.espId}_${dragData.gpio}`
    if (selectedSensors.value.some((s) => s.id === sensorId)) {
      console.debug(`[AnalysisDropZone] Sensor ${sensorId} already in chart`)
      return
    }

    // Add sensor to chart with validated data and defaults for optional fields
    const newSensor: ChartSensor = {
      id: sensorId,
      espId: dragData.espId,
      gpio: dragData.gpio,
      sensorType: dragData.sensorType,
      name: dragData.name || `Sensor GPIO ${dragData.gpio}`,
      unit: dragData.unit || '',
      color: getNextColor(),
    }
    selectedSensors.value.push(newSensor)
    emit('sensorAdded', newSensor)
    console.debug(`[AnalysisDropZone] Added sensor ${sensorId} to chart`)
  } catch (error) {
    console.warn('[AnalysisDropZone] Failed to parse drag data:', error)
  }
}

// Remove sensor from chart
function removeSensor(sensorId: string) {
  selectedSensors.value = selectedSensors.value.filter((s) => s.id !== sensorId)
  emit('sensorRemoved', sensorId)
}

// Clear all sensors
function clearAll() {
  selectedSensors.value = []
  emit('sensorsCleared')
}
</script>

<template>
  <div
    :class="[
      'analysis-drop-zone',
      {
        'analysis-drop-zone--compact': compact,
        'analysis-drop-zone--drag-over': isDragOver
      }
    ]"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Header (hidden in compact mode when empty) -->
    <div v-if="!compact || !isEmpty" class="analysis-drop-zone__header">
      <div class="analysis-drop-zone__title">
        <ChartLine :class="compact ? 'w-4 h-4' : 'w-5 h-5'" />
        <span>{{ title }}</span>
      </div>

      <!-- Time Range Selector -->
      <div v-if="!isEmpty" class="analysis-drop-zone__controls">
        <div class="analysis-drop-zone__time-range">
          <button
            v-for="option in timeRangeOptions"
            :key="option.value"
            :class="[
              'analysis-drop-zone__time-btn',
              { 'analysis-drop-zone__time-btn--active': timeRange === option.value },
            ]"
            @click="timeRange = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <!-- Y-Axis Settings Toggle -->
        <button
          :class="[
            'analysis-drop-zone__settings-btn',
            { 'analysis-drop-zone__settings-btn--active': showYAxisSettings },
          ]"
          @click="showYAxisSettings = !showYAxisSettings"
          title="Y-Achse einstellen"
        >
          <Settings class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Y-Axis Settings Panel -->
    <div v-if="showYAxisSettings && !isEmpty" class="analysis-drop-zone__y-axis-settings">
      <div class="analysis-drop-zone__y-axis-row">
        <label class="analysis-drop-zone__y-axis-label">Y-Achse:</label>
        <div class="analysis-drop-zone__y-axis-inputs">
          <input
            type="number"
            :value="yAxisMin"
            @input="yAxisMin = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined"
            placeholder="Min (auto)"
            class="analysis-drop-zone__y-axis-input"
          />
          <span class="analysis-drop-zone__y-axis-separator">–</span>
          <input
            type="number"
            :value="yAxisMax"
            @input="yAxisMax = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined"
            placeholder="Max (auto)"
            class="analysis-drop-zone__y-axis-input"
          />
        </div>
        <button
          v-if="yAxisMin !== undefined || yAxisMax !== undefined"
          class="analysis-drop-zone__y-axis-reset"
          @click="yAxisMin = undefined; yAxisMax = undefined"
          title="Auto-Skalierung"
        >
          Auto
        </button>
      </div>
    </div>

    <!-- Drop Zone (when empty) - Events sind auf Root-Element -->
    <div
      v-if="isEmpty"
      :class="[
        'analysis-drop-zone__empty',
        { 'analysis-drop-zone__empty--drag-over': isDragOver },
        { 'analysis-drop-zone__empty--compact': compact },
      ]"
    >
      <Plus :class="compact ? 'w-5 h-5' : 'w-8 h-8'" />
      <p>{{ compact ? 'Sensoren hierher ziehen' : 'Sensoren hierher ziehen' }}</p>
      <p v-if="!compact" class="text-sm text-muted">Max. {{ maxSensors }} Sensoren</p>
    </div>

    <!-- Chart Content -->
    <template v-else>
      <!-- Sensor Legend -->
      <div class="analysis-drop-zone__legend">
        <div
          v-for="sensor in selectedSensors"
          :key="sensor.id"
          class="analysis-drop-zone__legend-item"
        >
          <span
            class="analysis-drop-zone__legend-color"
            :style="{ backgroundColor: sensor.color }"
          />
          <span class="analysis-drop-zone__legend-name">{{ sensor.name }}</span>
          <span class="analysis-drop-zone__legend-unit">({{ sensor.unit }})</span>
          <button
            class="analysis-drop-zone__legend-remove"
            @click="removeSensor(sensor.id)"
            title="Entfernen"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Add more indicator - Events sind auf Root-Element -->
        <div
          v-if="!hasReachedMax"
          :class="[
            'analysis-drop-zone__add-more',
            { 'analysis-drop-zone__add-more--drag-over': isDragOver },
          ]"
        >
          <Plus class="w-4 h-4" />
        </div>
      </div>

      <!-- Chart -->
      <MultiSensorChart
        :sensors="selectedSensors"
        :time-range="timeRange"
        :y-min="yAxisMin"
        :y-max="yAxisMax"
        :height="compact ? 120 : 300"
      />

      <!-- Actions -->
      <div class="analysis-drop-zone__actions">
        <button class="analysis-drop-zone__clear-btn" @click="clearAll">
          Alle entfernen
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.analysis-drop-zone {
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

/* Visuelles Feedback auf Root-Element beim Drag-Over */
.analysis-drop-zone--drag-over {
  border-color: var(--color-success);
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.3),
              inset 0 0 20px rgba(16, 185, 129, 0.05);
  background: rgba(16, 185, 129, 0.05);
}

.analysis-drop-zone__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.analysis-drop-zone__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.analysis-drop-zone__controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.analysis-drop-zone__time-range {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--color-text-muted);
}

.analysis-drop-zone__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  border-radius: 0.375rem;
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.analysis-drop-zone__settings-btn:hover {
  border-color: var(--color-iridescent-1);
  color: var(--color-text-primary);
}

.analysis-drop-zone__settings-btn--active {
  background: var(--color-iridescent-1);
  border-color: var(--color-iridescent-1);
  color: white;
}

/* Y-Axis Settings Panel */
.analysis-drop-zone__y-axis-settings {
  background: var(--color-bg-tertiary);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
}

.analysis-drop-zone__y-axis-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.analysis-drop-zone__y-axis-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.analysis-drop-zone__y-axis-inputs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.analysis-drop-zone__y-axis-input {
  width: 70px;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border-radius: 0.25rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.analysis-drop-zone__y-axis-input:focus {
  border-color: var(--color-iridescent-1);
}

.analysis-drop-zone__y-axis-input::placeholder {
  color: var(--color-text-muted);
  font-size: 0.625rem;
}

.analysis-drop-zone__y-axis-separator {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.analysis-drop-zone__y-axis-reset {
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  border-radius: 0.25rem;
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.analysis-drop-zone__y-axis-reset:hover {
  border-color: var(--color-iridescent-1);
  color: var(--color-iridescent-1);
}

.analysis-drop-zone__time-btn {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.analysis-drop-zone__time-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.analysis-drop-zone__time-btn--active {
  background: var(--color-iridescent-1);
  color: white;
  border-color: var(--color-iridescent-1);
}

.analysis-drop-zone__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem 2rem;
  border: 2px dashed var(--glass-border);
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.analysis-drop-zone__empty--drag-over {
  border-color: var(--color-success);
  border-style: solid;
  background: rgba(16, 185, 129, 0.15);
  color: var(--color-success);
  transform: scale(1.02);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.2),
              inset 0 0 30px rgba(16, 185, 129, 0.05);
}

.analysis-drop-zone__empty--drag-over svg {
  animation: pulse-scale 1s ease-in-out infinite;
}

@keyframes pulse-scale {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

.analysis-drop-zone__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.analysis-drop-zone__legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.analysis-drop-zone__legend-color {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.analysis-drop-zone__legend-name {
  color: var(--color-text-primary);
  font-weight: 500;
}

.analysis-drop-zone__legend-unit {
  color: var(--color-text-muted);
}

.analysis-drop-zone__legend-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.analysis-drop-zone__legend-remove:hover {
  background: rgba(248, 113, 113, 0.2);
  color: var(--color-error);
}

.analysis-drop-zone__add-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 2px dashed var(--glass-border);
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.analysis-drop-zone__add-more:hover,
.analysis-drop-zone__add-more--drag-over {
  border-color: var(--color-iridescent-1);
  color: var(--color-iridescent-1);
  background: rgba(167, 139, 250, 0.1);
}

.analysis-drop-zone__actions {
  display: flex;
  justify-content: flex-end;
}

.analysis-drop-zone__clear-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.analysis-drop-zone__clear-btn:hover {
  border-color: var(--color-error);
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.1);
}

.text-muted {
  color: var(--color-text-muted);
}

/* =============================================================================
   Compact Mode Styles (for ESP Card embedded view)
   ============================================================================= */
.analysis-drop-zone--compact {
  padding: 0.5rem;
  gap: 0.5rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__header {
  gap: 0.5rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__title {
  font-size: 0.75rem;
  gap: 0.375rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__time-range {
  gap: 0.125rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__time-btn {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
}

.analysis-drop-zone__empty--compact {
  padding: 1rem;
  gap: 0.25rem;
  font-size: 0.75rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__legend {
  gap: 0.375rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__legend-item {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__settings-btn {
  padding: 0.25rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__settings-btn .w-4 {
  width: 0.75rem;
  height: 0.75rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__y-axis-settings {
  padding: 0.375rem 0.5rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__y-axis-label {
  font-size: 0.625rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__y-axis-input {
  width: 55px;
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
}

.analysis-drop-zone--compact .analysis-drop-zone__y-axis-reset {
  font-size: 0.5rem;
  padding: 0.125rem 0.375rem;
}
</style>
