<script setup lang="ts">
/**
 * ESPHorizontalLayout Component (formerly ESPOrbitalLayout)
 *
 * Displays sensors and actuators in a horizontal 3-column layout:
 * - Left column: Sensors (vertically stacked)
 * - Center column: ESP Card
 * - Right column: Actuators (vertically stacked)
 *
 * Features:
 * - Side-by-side layout: no overlap, all elements always visible
 * - Responsive: mobile = vertical stack, tablet/desktop = horizontal
 * - Drag & drop for adding sensors from sidebar
 * - Click to select/highlight satellites
 * - Chart panel expands within center card (not overlaying satellites)
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, X } from 'lucide-vue-next'
import ESPCard from './ESPCard.vue'
import SensorSatellite from './SensorSatellite.vue'
import ActuatorSatellite from './ActuatorSatellite.vue'
import AnalysisDropZone from './AnalysisDropZone.vue'
import Badge from '@/components/common/Badge.vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator, QualityLevel, ChartSensor, MockSensorConfig } from '@/types'
import { espApi } from '@/api/esp'
import { getStateInfo } from '@/utils/labels'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/stores/dragState'
import {
  SENSOR_TYPE_CONFIG,
  getSensorUnit,
  getSensorDefault,
  getSensorTypeOptions
} from '@/utils/sensorDefaults'

interface Props {
  /** The ESP device data */
  device: ESPDevice
  /** Whether to show connection lines (default: true) */
  showConnections?: boolean
  /** Compact mode for dashboard view (default: false) */
  compactMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showConnections: true,
  compactMode: false
})

const router = useRouter()
const espStore = useEspStore()
const dragStore = useDragStateStore()

const emit = defineEmits<{
  sensorClick: [gpio: number]
  actuatorClick: [gpio: number]
  sensorDropped: [sensor: ChartSensor]
}>()

// =============================================================================
// Analysis Drop Zone State
// =============================================================================
const analysisExpanded = ref(false)

// Track if chart was auto-opened (to auto-close when drag ends)
const wasAutoOpened = ref(false)

// Check if a sensor from this ESP is being dragged (for visual feedback)
const isSensorBeingDraggedFromThisEsp = computed(() =>
  dragStore.isDraggingSensor && dragStore.draggingSensorEspId === espId.value
)

// Handle sensor dropped into analysis zone
function handleSensorDrop(sensor: ChartSensor) {
  emit('sensorDropped', sensor)
}

// =============================================================================
// Add Sensor Drop Handler State
// =============================================================================
const isDragOver = ref(false)
const showAddSensorModal = ref(false)

// Default sensor type for new sensors
const defaultSensorType = 'DS18B20'

// New sensor form state
const newSensor = ref<MockSensorConfig>({
  gpio: 0,
  sensor_type: defaultSensorType,
  name: '',
  subzone_id: '',
  raw_value: getSensorDefault(defaultSensorType),
  unit: getSensorUnit(defaultSensorType),
  quality: 'good',
  raw_mode: true
})

// Sensor type options for dropdown
const sensorTypeOptions = getSensorTypeOptions()

// Watch for sensor type changes and update unit/initial value
watch(() => newSensor.value.sensor_type, (newType) => {
  const config = SENSOR_TYPE_CONFIG[newType]
  if (config) {
    newSensor.value.unit = config.unit
    newSensor.value.raw_value = config.defaultValue
  }
})

// Reset new sensor form to defaults
function resetNewSensor() {
  newSensor.value = {
    gpio: 0,
    sensor_type: defaultSensorType,
    name: '',
    subzone_id: '',
    raw_value: getSensorDefault(defaultSensorType),
    unit: getSensorUnit(defaultSensorType),
    quality: 'good',
    raw_mode: true
  }
}

// =============================================================================
// Drop Event Handlers (for adding sensors via drag from sidebar)
// =============================================================================

function onDragEnter(event: DragEvent) {
  // Only react visually if dragging a sensor type from sidebar (for adding new sensors)
  if (dragStore.isDraggingSensorType) {
    isDragOver.value = true
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }
  // Sensor-Satellite-Drags (für Chart) werden durchgelassen zur AnalysisDropZone
}

function onDragOver(event: DragEvent) {
  // KRITISCH: preventDefault() muss aufgerufen werden um Drop zu erlauben!
  // Ohne preventDefault() zeigt der Browser "nicht zulässig" (roter Kreis)

  if (dragStore.isDraggingSensorType) {
    // Sensor-Typ aus Sidebar → Drop auf ESP-Card erlauben (zum Hinzufügen)
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  } else if (dragStore.isDraggingSensor) {
    // Sensor-Satellite für Chart → Drop auf AnalysisDropZone erlauben
    // Wir erlauben den Drop hier, die AnalysisDropZone entscheidet ob sie ihn annimmt
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }
  // Andere Drags (z.B. ESP-Card-Reordering via VueDraggable) werden durchgelassen
}

function onDragLeave(event: DragEvent) {
  // Only reset if leaving the container entirely
  const target = event.currentTarget as HTMLElement
  const related = event.relatedTarget as HTMLElement
  if (!target.contains(related)) {
    isDragOver.value = false
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false

  const jsonData = event.dataTransfer?.getData('application/json')
  if (!jsonData) return

  try {
    const payload = JSON.parse(jsonData)
    if (payload.action === 'add-sensor') {
      // Pre-fill form with dragged sensor type
      newSensor.value.sensor_type = payload.sensorType
      newSensor.value.unit = getSensorUnit(payload.sensorType)
      newSensor.value.raw_value = getSensorDefault(payload.sensorType)
      // Find next available GPIO
      const usedGpios = sensors.value.map(s => s.gpio)
      const availableGpios = [32, 33, 34, 35, 36, 39, 25, 26, 27, 14, 12, 13]
      const nextGpio = availableGpios.find(g => !usedGpios.includes(g)) || 0
      newSensor.value.gpio = nextGpio
      // Open modal
      showAddSensorModal.value = true
    }
  } catch (error) {
    console.error('[ESPOrbitalLayout] Failed to parse drop data:', error)
  }
}

// Add sensor to ESP
async function addSensor() {
  if (!isMock.value) return

  try {
    await espStore.addSensor(espId.value, newSensor.value)
    showAddSensorModal.value = false
    resetNewSensor()
    // Refresh ESP data
    await espStore.fetchAll()
  } catch (error) {
    console.error('[ESPOrbitalLayout] Failed to add sensor:', error)
  }
}

// =============================================================================
// Refs
// =============================================================================
const containerRef = ref<HTMLElement | null>(null)
const centerRef = ref<HTMLElement | null>(null)

// Selected satellite state
const selectedGpio = ref<number | null>(null)
const selectedType = ref<'sensor' | 'actuator' | null>(null)

// =============================================================================
// Computed: Device Data
// =============================================================================
const sensors = computed<MockSensor[]>(() => {
  return (props.device?.sensors as MockSensor[]) || []
})

const actuators = computed<MockActuator[]>(() => {
  return (props.device?.actuators as MockActuator[]) || []
})

const espId = computed(() => {
  return props.device?.esp_id || props.device?.device_id || ''
})

const isMock = computed(() => {
  return espApi.isMockEsp(espId.value)
})

const isOnline = computed(() => {
  return props.device?.status === 'online' || props.device?.connected === true
})

const systemState = computed(() => {
  if (isMock.value && 'system_state' in props.device) {
    return (props.device as any).system_state
  }
  return props.device?.status || 'unknown'
})

const stateInfo = computed(() => {
  if (isMock.value) {
    return getStateInfo(systemState.value)
  }
  const status = props.device?.status || 'unknown'
  if (status === 'online') return { label: 'Online', variant: 'success' }
  if (status === 'offline') return { label: 'Offline', variant: 'gray' }
  if (status === 'error') return { label: 'Error', variant: 'danger' }
  return { label: 'Unknown', variant: 'gray' }
})

const totalItems = computed(() => {
  return sensors.value.length + actuators.value.length
})

/**
 * Connection quality based on WiFi RSSI
 * - 'good': RSSI > -60 dBm (stable)
 * - 'fair': RSSI -60 to -75 dBm (weak)
 * - 'poor': RSSI < -75 dBm or offline (no connection)
 */
const connectionQuality = computed(() => {
  if (!isOnline.value) return 'poor'
  const rssi = props.device?.wifi_rssi
  if (rssi === undefined || rssi === null) return 'fair' // Unknown = assume fair
  if (rssi > -60) return 'good'
  if (rssi >= -75) return 'fair'
  return 'poor'
})

/**
 * Human-readable connection tooltip (NO technical dBm values!)
 */
const connectionTooltip = computed(() => {
  if (!isOnline.value) return 'Keine Verbindung'
  switch (connectionQuality.value) {
    case 'good': return 'Verbindung: Stabil'
    case 'fair': return 'Verbindung: Schwach'
    case 'poor': return 'Verbindung: Kritisch'
    default: return 'Verbindung: Unbekannt'
  }
})

// Navigation to detail view
function goToDetails() {
  router.push(`/devices/${espId.value}`)
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleSensorClick(gpio: number) {
  if (selectedGpio.value === gpio && selectedType.value === 'sensor') {
    selectedGpio.value = null
    selectedType.value = null
  } else {
    selectedGpio.value = gpio
    selectedType.value = 'sensor'
  }
  emit('sensorClick', gpio)
}

function handleActuatorClick(gpio: number) {
  if (selectedGpio.value === gpio && selectedType.value === 'actuator') {
    selectedGpio.value = null
    selectedType.value = null
  } else {
    selectedGpio.value = gpio
    selectedType.value = 'actuator'
  }
  emit('actuatorClick', gpio)
}

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  // Component mounted - no special initialization needed for horizontal layout
})

onUnmounted(() => {
  // Cleanup handled by Vue reactivity
})

// =============================================================================
// Auto-Opening Chart when Sensor is Dragged
// =============================================================================

/**
 * Check if a sensor from THIS ESP is being dragged.
 * Used to immediately activate drop target (before visual opening).
 */
const isSensorFromThisEspDragging = computed(() =>
  dragStore.isDraggingSensor && dragStore.draggingSensorEspId === espId.value
)

/**
 * Watch for sensor drag state changes.
 * Auto-opens the chart IMMEDIATELY when a sensor from THIS ESP is being dragged.
 *
 * WICHTIG: Die DropZone wird während des Drags als OVERLAY angezeigt (position: absolute),
 * damit das Layout stabil bleibt und das Drag-Event nicht unterbrochen wird.
 * Nach dem Drop wechselt sie in den normalen Inline-Modus.
 */
watch(
  () => isSensorFromThisEspDragging.value,
  (isDraggingFromThisEsp) => {
    if (isDraggingFromThisEsp) {
      // Sofort öffnen - kein Delay, da wir Overlay-Modus verwenden
      // Overlay verhindert Layout-Shifts die Drag unterbrechen könnten
      if (!analysisExpanded.value) {
        wasAutoOpened.value = true // ZUERST setzen - aktiviert Overlay-Modus
        analysisExpanded.value = true
      }
    } else {
      // Nach Drag-Ende: Overlay-Modus beenden, Chart bleibt aber offen
      // Kurze Verzögerung damit Drop-Event verarbeitet werden kann
      if (wasAutoOpened.value) {
        setTimeout(() => {
          wasAutoOpened.value = false
          // Chart bleibt geöffnet im normalen Inline-Modus
        }, 300)
      }
    }
  }
)

// Wenn User manuell schließt, auch wasAutoOpened zurücksetzen
watch(
  () => analysisExpanded.value,
  (expanded) => {
    if (!expanded) {
      wasAutoOpened.value = false
    }
  }
)
</script>

<template>
  <div
    ref="containerRef"
    class="esp-horizontal-layout"
    :class="{
      'esp-horizontal-layout--has-items': totalItems > 0,
      'esp-horizontal-layout--can-drop': dragStore.isDraggingSensorType && isMock,
      'esp-horizontal-layout--drag-over': isDragOver && isMock
    }"
    :data-esp-id="espId"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Left Column: Sensors -->
    <div class="esp-horizontal-layout__column esp-horizontal-layout__column--sensors">
      <SensorSatellite
        v-for="sensor in sensors"
        :key="`sensor-${sensor.gpio}`"
        :esp-id="espId"
        :gpio="sensor.gpio"
        :sensor-type="sensor.sensor_type"
        :name="sensor.name"
        :value="sensor.processed_value ?? sensor.raw_value"
        :quality="sensor.quality as QualityLevel"
        :unit="sensor.unit"
        :selected="selectedGpio === sensor.gpio && selectedType === 'sensor'"
        :show-connections="showConnections"
        class="esp-horizontal-layout__satellite"
        @click="handleSensorClick(sensor.gpio)"
      />
      <!-- Empty sensor placeholder -->
      <div v-if="sensors.length === 0" class="esp-horizontal-layout__empty-column">
        <span class="esp-horizontal-layout__empty-label">Keine Sensoren</span>
      </div>
    </div>

    <!-- Center Column: ESP Card -->
    <div ref="centerRef" class="esp-horizontal-layout__center">
      <!-- Compact Mode: Simple Info Card -->
      <div v-if="compactMode" class="esp-info-compact">
        <div class="esp-info-compact__header">
          <div class="esp-info-compact__title-group">
            <!-- Device name as main title, fallback to ESP-ID -->
            <h3 class="esp-info-compact__title">{{ device.name || espId }}</h3>
            <Badge :variant="isMock ? 'mock' : 'real'" size="xs">
              {{ isMock ? 'MOCK' : 'REAL' }}
            </Badge>
          </div>
          <!-- ESP-ID secondary (only if name exists) -->
          <span v-if="device.name" class="esp-info-compact__id">{{ espId }}</span>
          <div class="esp-info-compact__status-row">
            <Badge
              :variant="stateInfo.variant as any"
              :pulse="isOnline && (systemState === 'OPERATIONAL' || device.status === 'online')"
              dot
              size="sm"
            >
              {{ stateInfo.label }}
            </Badge>
            <!-- Connection quality indicator -->
            <span
              :class="['connection-dot', connectionQuality]"
              :title="connectionTooltip"
            />
          </div>
        </div>

        <!-- Analysis Drop Zone (collapsible) -->
        <div class="esp-info-compact__analysis">
          <button
            class="esp-info-compact__analysis-toggle"
            :class="{
              'esp-info-compact__analysis-toggle--active': analysisExpanded,
              'esp-info-compact__analysis-toggle--drag-hint': isSensorBeingDraggedFromThisEsp && !analysisExpanded
            }"
            @click="analysisExpanded = !analysisExpanded"
          >
            <span>{{ analysisExpanded ? 'Chart ▲' : (isSensorBeingDraggedFromThisEsp ? '↓ Hier ablegen' : 'Chart ▼') }}</span>
          </button>
        </div>

        <!--
          WICHTIG: DropZone ist IMMER im DOM (kein v-if!), nur mit CSS versteckt.
          Dadurch bleibt sie während des Drags als Drop-Target verfügbar.
          Bei Auto-Open während Drag wird sie als Overlay angezeigt.
        -->
        <AnalysisDropZone
          :esp-id="espId"
          :max-sensors="4"
          :compact="true"
          :class="[
            'esp-info-compact__dropzone',
            {
              'esp-info-compact__dropzone--visible': analysisExpanded,
              'esp-info-compact__dropzone--overlay': wasAutoOpened && analysisExpanded
            }
          ]"
          @sensor-added="handleSensorDrop"
        />

        <button class="esp-info-compact__details-btn" @click="goToDetails">
          <ExternalLink class="w-3 h-3" />
          <span>Details</span>
        </button>
      </div>

      <!-- Full Mode: Full ESP Card (for detail view) -->
      <ESPCard v-else :esp="device" />
    </div>

    <!-- Right Column: Actuators -->
    <div class="esp-horizontal-layout__column esp-horizontal-layout__column--actuators">
      <ActuatorSatellite
        v-for="actuator in actuators"
        :key="`actuator-${actuator.gpio}`"
        :esp-id="espId"
        :gpio="actuator.gpio"
        :actuator-type="actuator.actuator_type"
        :name="actuator.name"
        :state="actuator.state"
        :pwm-value="actuator.pwm_value"
        :emergency-stopped="actuator.emergency_stopped"
        :selected="selectedGpio === actuator.gpio && selectedType === 'actuator'"
        :show-connections="showConnections"
        class="esp-horizontal-layout__satellite"
        @click="handleActuatorClick(actuator.gpio)"
      />
      <!-- Empty actuator placeholder -->
      <div v-if="actuators.length === 0" class="esp-horizontal-layout__empty-column">
        <span class="esp-horizontal-layout__empty-label">Keine Aktoren</span>
      </div>
    </div>

    <!-- Drop Indicator Overlay -->
    <Transition name="fade">
      <div v-if="isDragOver && isMock" class="esp-horizontal-layout__drop-indicator">
        <span class="esp-horizontal-layout__drop-text">Sensor hinzufügen</span>
      </div>
    </Transition>
  </div>

  <!-- Add Sensor Modal (Teleport to body) -->
  <Teleport to="body">
    <div v-if="showAddSensorModal && isMock" class="modal-overlay" @click.self="showAddSensorModal = false">
      <div class="modal-content">
        <!-- Modal Header -->
        <div class="modal-header">
          <h3 class="modal-title">Sensor hinzufügen</h3>
          <button class="modal-close" @click="showAddSensorModal = false">
            <X :size="20" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <!-- GPIO + Sensor Type Row -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">GPIO</label>
              <input
                v-model.number="newSensor.gpio"
                type="number"
                min="0"
                max="39"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Sensor-Typ</label>
              <select v-model="newSensor.sensor_type" class="form-select">
                <option
                  v-for="option in sensorTypeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Name -->
          <div class="form-group">
            <label class="form-label">Name (optional)</label>
            <input
              v-model="newSensor.name"
              type="text"
              class="form-input"
              placeholder="z.B. Wassertemperatur"
            />
          </div>

          <!-- Subzone -->
          <div class="form-group">
            <label class="form-label">Subzone (optional)</label>
            <input
              v-model="newSensor.subzone_id"
              type="text"
              class="form-input"
              placeholder="z.B. gewaechshaus_reihe_1"
            />
          </div>

          <!-- Initial Value + Unit Row -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Startwert</label>
              <input
                v-model.number="newSensor.raw_value"
                type="number"
                step="0.1"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Einheit</label>
              <input
                :value="newSensor.unit"
                type="text"
                class="form-input form-input--readonly"
                readonly
              />
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button class="btn btn--secondary" @click="showAddSensorModal = false">
            Abbrechen
          </button>
          <button class="btn btn--primary" @click="addSensor">
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* =============================================================================
   NEW: Horizontal 3-Column Layout (Sensors | ESP-Card | Actuators)
   Replaces orbital/absolute positioning with side-by-side flexbox
   ============================================================================= */
.esp-horizontal-layout {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.5rem;
  min-height: auto;
}

/* =============================================================================
   Left/Right Columns (Sensors & Actuators)
   ============================================================================= */
.esp-horizontal-layout__column {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 56px;
  max-width: 140px;
  flex-shrink: 0;
}

/* Sensors column: align items to the right (toward center card) */
.esp-horizontal-layout__column--sensors {
  align-items: flex-end;
}

/* Actuators column: align items to the left (toward center card) */
.esp-horizontal-layout__column--actuators {
  align-items: flex-start;
}

/* Satellite cards in horizontal layout - compact styling */
.esp-horizontal-layout__satellite {
  /* Override any absolute positioning from satellite components */
  position: relative !important;
  transform: none !important;
  left: auto !important;
  top: auto !important;
  /* Compact width for side columns */
  width: 100%;
  max-width: 130px;
}

/* Empty column placeholder */
.esp-horizontal-layout__empty-column {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  padding: 0.5rem;
  border: 1px dashed var(--glass-border);
  border-radius: 0.375rem;
  opacity: 0.5;
}

.esp-horizontal-layout__empty-label {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  text-align: center;
  white-space: nowrap;
}

/* =============================================================================
   Center Column (ESP Card)
   ============================================================================= */
.esp-horizontal-layout__center {
  flex: 1;
  min-width: 140px;
  max-width: 220px;
}

/* =============================================================================
   Compact ESP Info Card
   ============================================================================= */
.esp-info-compact {
  position: relative; /* Für absolute Positionierung des Overlay-Dropzone */
  width: 100%;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.625rem;
  padding: 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  outline: none;
  overflow: visible; /* Damit Overlay sichtbar ist */
}

.esp-info-compact:hover {
  border-color: rgba(96, 165, 250, 0.4);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.esp-info-compact:focus-visible {
  outline: 2px solid var(--color-iridescent-1);
  outline-offset: 2px;
}

.esp-info-compact__header {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.esp-info-compact__title-group {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.esp-info-compact__title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary);
  word-break: break-word;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.esp-info-compact__id {
  font-size: 0.6rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.esp-info-compact__status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Connection quality indicator dot */
.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: help;
  transition: transform 0.2s;
}

.connection-dot:hover {
  transform: scale(1.3);
}

.connection-dot.good {
  background-color: var(--color-success, #22c55e);
  box-shadow: 0 0 6px var(--color-success, #22c55e);
}

.connection-dot.fair {
  background-color: var(--color-warning, #f59e0b);
  box-shadow: 0 0 6px var(--color-warning, #f59e0b);
}

.connection-dot.poor {
  background-color: var(--color-danger, #ef4444);
  box-shadow: 0 0 6px var(--color-danger, #ef4444);
}

.esp-info-compact__details-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-2));
  background-size: 200% 200%;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(167, 139, 250, 0.25);
  overflow: hidden;
}

.esp-info-compact__details-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.esp-info-compact__details-btn:hover::before {
  left: 100%;
}

.esp-info-compact__details-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
  background-position: 100% 100%;
}

.esp-info-compact__details-btn:active {
  transform: translateY(0);
}

/* Analysis Drop Zone - Chart Toggle */
.esp-info-compact__analysis {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.esp-info-compact__analysis-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.25rem 0.5rem;
  background-color: var(--color-bg-tertiary);
  border: 1px dashed var(--glass-border);
  border-radius: 0.25rem;
  font-size: 0.65rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.esp-info-compact__analysis-toggle:hover {
  border-color: var(--color-iridescent-1);
  color: var(--color-text-secondary);
}

.esp-info-compact__analysis-toggle--active {
  border-style: solid;
  border-color: var(--color-iridescent-1);
  color: var(--color-text-primary);
  background-color: rgba(167, 139, 250, 0.08);
}

.esp-info-compact__analysis-toggle--drag-hint {
  border-style: solid;
  border-color: var(--color-success);
  color: var(--color-success);
  background-color: rgba(16, 185, 129, 0.15);
  animation: pulse-hint 1s ease-in-out infinite;
}

@keyframes pulse-hint {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2); }
}

/*
 * DropZone ist IMMER im DOM, aber standardmäßig unsichtbar.
 * Zwei Modi:
 * 1. Normal (manuell geöffnet): Inline-Anzeige, beeinflusst Layout
 * 2. Overlay (auto-geöffnet während Drag): Absolute Position, Layout stabil
 *
 * WICHTIG: Wir verwenden opacity + pointer-events statt visibility,
 * weil visibility: hidden ALLE Pointer-Events blockiert, einschließlich
 * dragover und drop - was Drag & Drop unmöglich macht!
 */
.esp-info-compact__dropzone {
  /* Standardmäßig unsichtbar aber im DOM für Drag-Target */
  opacity: 0;
  pointer-events: none; /* Verhindert Klicks auf unsichtbares Element */
  max-height: 0;
  overflow: hidden;
  transition: opacity 0.15s ease, max-height 0.2s ease, pointer-events 0s;
  margin-top: 0;
}

/* Sichtbarer Zustand - normal (manuell geöffnet) */
.esp-info-compact__dropzone--visible {
  opacity: 1;
  pointer-events: auto; /* Events wieder aktivieren */
  max-height: 300px;
  overflow: visible;
  margin-top: 0.5rem;
}

/* Overlay-Modus (auto-geöffnet während Drag) */
.esp-info-compact__dropzone--overlay {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  /* WICHTIG: z-index muss höher sein als .zone-item--drag (9999) */
  z-index: 10000;
  margin-top: 0.25rem;
  max-height: none;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-success);
  border-radius: 0.5rem;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.25),
              0 0 0 4px rgba(16, 185, 129, 0.1);
  animation: dropzone-appear 0.15s ease-out;
}

@keyframes dropzone-appear {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* =============================================================================
   Mobile Layout (< 768px): Vertical Stack
   ============================================================================= */
@media (max-width: 767px) {
  .esp-horizontal-layout {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .esp-horizontal-layout__column {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    max-width: none;
    width: 100%;
  }

  .esp-horizontal-layout__column--sensors {
    order: -1; /* Sensors above center */
    align-items: center;
  }

  .esp-horizontal-layout__column--actuators {
    order: 1; /* Actuators below center */
    align-items: center;
  }

  .esp-horizontal-layout__center {
    max-width: 280px;
    order: 0;
  }

  .esp-horizontal-layout__satellite {
    max-width: 140px;
  }
}

/* =============================================================================
   Tablet Layout (768px - 1023px): Same as desktop but tighter
   ============================================================================= */
@media (min-width: 768px) and (max-width: 1023px) {
  .esp-horizontal-layout {
    gap: 0.5rem;
  }

  .esp-horizontal-layout__column {
    max-width: 120px;
  }

  .esp-horizontal-layout__center {
    max-width: 180px;
  }
}

/* =============================================================================
   Desktop Layout (1024px+): Full horizontal with more space
   ============================================================================= */
@media (min-width: 1024px) {
  .esp-horizontal-layout {
    gap: 1rem;
  }

  .esp-horizontal-layout__column {
    max-width: 150px;
  }

  .esp-horizontal-layout__center {
    max-width: 220px;
  }

  .esp-horizontal-layout__satellite {
    max-width: 140px;
  }
}

/* =============================================================================
   Drop Zone Styling (for adding sensors via drag from sidebar)
   ============================================================================= */
.esp-horizontal-layout--can-drop {
  border: 2px dashed var(--color-iridescent-2);
  border-radius: 0.75rem;
  transition: all 0.2s ease;
}

.esp-horizontal-layout--drag-over {
  border-color: var(--color-success);
  background: rgba(16, 185, 129, 0.05);
}

.esp-horizontal-layout__drop-indicator {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 0.75rem;
  pointer-events: none;
  z-index: 100;
}

.esp-horizontal-layout__drop-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-success);
  background: var(--color-bg-secondary);
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  border: 2px solid var(--color-success);
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* =============================================================================
   Modal Styling
   ============================================================================= */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  width: 100%;
  max-width: 28rem;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--glass-border);
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--glass-border);
}

/* Form Elements */
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input,
.form-select {
  padding: 0.625rem 0.75rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  transition: border-color 0.15s ease;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-iridescent-1);
}

.form-input--readonly {
  background: var(--color-bg-primary);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

/* Buttons */
.btn {
  flex: 1;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn--primary {
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-2));
  color: white;
}

.btn--primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
}

.btn--secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border: 1px solid var(--glass-border);
}

.btn--secondary:hover {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}
</style>


