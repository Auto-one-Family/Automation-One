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
import { X, Heart, Settings2, Loader2, Pencil, Check } from 'lucide-vue-next'
import ESPCard from './ESPCard.vue'
// wifiStrength + formatRelativeTime now provided by useDeviceActions
import SensorColumn from './SensorColumn.vue'
import ActuatorColumn from './ActuatorColumn.vue'
import AddSensorModal from './AddSensorModal.vue'
import AddActuatorModal from './AddActuatorModal.vue'
import EditSensorModal from './EditSensorModal.vue'
import type { EditableSensor } from './EditSensorModal.vue'
import AnalysisDropZone from './AnalysisDropZone.vue'
// GpioPicker, Badge used by extracted modal components
import { Badge } from '@/shared/design/primitives'
import ZoneAssignmentDropdown from './ZoneAssignmentDropdown.vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator, ChartSensor } from '@/types'
// espApi + getStateInfo now provided by useDeviceActions
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/shared/stores/dragState.store'
import { useZoneDragDrop } from '@/composables/useZoneDragDrop'
import { useDeviceActions } from '@/composables/useDeviceActions'
import { useGpioStatus } from '@/composables/useGpioStatus'
import { createLogger } from '@/utils/logger'

const logger = createLogger('ESPOrbitalLayout')

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

const espStore = useEspStore()
const dragStore = useDragStateStore()
const { handleDeviceDrop, handleRemoveFromZone, getAvailableZones } = useZoneDragDrop()

const emit = defineEmits<{
  sensorClick: [gpio: number]
  actuatorClick: [gpio: number]
  sensorDropped: [sensor: ChartSensor]
  /** Heartbeat request (Mock ESPs only) */
  heartbeat: [device: ESPDevice]
  /** Delete request - opens confirmation dialog */
  delete: [device: ESPDevice]
  /** Settings popover request */
  settings: [device: ESPDevice]
  /** Name was updated via inline edit */
  'name-updated': [payload: { deviceId: string; name: string | null }]
}>()

// =============================================================================
// Zone Assignment (Dropdown alternative to drag)
// =============================================================================
const availableZones = computed(() => getAvailableZones(espStore.devices))

async function handleZoneChanged(_deviceId: string, zoneId: string | null) {
  if (zoneId === null) {
    await handleRemoveFromZone(props.device)
  } else {
    await handleDeviceDrop({
      device: props.device,
      fromZoneId: props.device.zone_id || null,
      toZoneId: zoneId,
    })
  }
}

// =============================================================================
// Analysis Drop Zone State
// =============================================================================
const analysisExpanded = ref(false)

// Track if chart was auto-opened (to auto-close when drag ends)
const wasAutoOpened = ref(false)

// Handle sensor dropped into analysis zone
function handleSensorDrop(sensor: ChartSensor) {
  emit('sensorDropped', sensor)
}

// =============================================================================
// Add Sensor Drop Handler State
// =============================================================================
const isDragOver = ref(false)
const showAddSensorModal = ref(false)
const showAddActuatorModal = ref(false)

// =============================================================================
// EDIT SENSOR STATE (Phase 2F) — delegated to EditSensorModal component
// =============================================================================
const showEditSensorModal = ref(false)
const editSensorGpio = ref<number | null>(null)

/** Payload for EditSensorModal — computed from current device sensors */
const editSensorPayload = computed<EditableSensor | null>(() => {
  if (editSensorGpio.value === null) return null
  const sensor = sensors.value.find(s => s.gpio === editSensorGpio.value)
  if (!sensor) return null
  return {
    gpio: sensor.gpio,
    sensor_type: sensor.sensor_type,
    name: sensor.name || null,
    operating_mode: sensor.operating_mode || null,
    timeout_seconds: sensor.timeout_seconds ?? null,
    schedule_config: sensor.schedule_config as { type: string; expression: string } | null,
  }
})


// =============================================================================
// Debug Logger
// =============================================================================
function log(message: string, data?: Record<string, unknown>): void {
  logger.debug(message, data)
}

// =============================================================================
// Drop Event Handlers (for adding sensors via drag from sidebar)
// =============================================================================

function onDragEnter(event: DragEvent) {
  // Prüfe ob das ein VueDraggable-Event ist (ESP-Card-Reordering)
  // VueDraggable setzt keine dataTransfer-Typen, native Drags schon
  const types = event.dataTransfer?.types || []
  const isVueDraggable = types.length === 0 || types.includes('text/plain')

  log('dragenter', {
    isDraggingSensorType: dragStore.isDraggingSensorType,
    isDraggingSensor: dragStore.isDraggingSensor,
    isDraggingActuatorType: dragStore.isDraggingActuatorType,
    types: Array.from(types),
    isVueDraggable,
    target: (event.target as Element)?.className?.slice?.(0, 50) || (event.target as Element)?.tagName,
  })

  // KRITISCH: Wenn weder SensorType noch Sensor noch ActuatorType gedraggt wird,
  // ist es wahrscheinlich ein VueDraggable-Event (ESP-Card-Reordering)
  // In diesem Fall NICHT reagieren, um VueDraggable nicht zu stören!
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    log('dragenter IGNORED - likely VueDraggable ESP-Card reordering')
    return
  }

  // React visually if dragging a sensor or actuator type from sidebar (for adding new items)
  if (dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType) {
    isDragOver.value = true
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
    log('isDragOver = true (sensor/actuator type from sidebar)')
  }
  // Sensor-Satellite-Drags (für Chart) werden durchgelassen zur AnalysisDropZone
}

function onDragOver(event: DragEvent) {
  // KRITISCH: Wenn weder SensorType noch Sensor noch ActuatorType gedraggt wird,
  // ist es wahrscheinlich ein VueDraggable-Event (ESP-Card-Reordering)
  // In diesem Fall NICHT preventDefault() aufrufen, um VueDraggable nicht zu stören!
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    // VueDraggable ESP-Card-Reordering - durchlassen ohne Intervention
    return
  }

  // KRITISCH: preventDefault() muss aufgerufen werden um Drop zu erlauben!
  // Ohne preventDefault() zeigt der Browser "nicht zulässig" (roter Kreis)

  if (dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType) {
    // Sensor/Aktor-Typ aus Sidebar → Drop auf ESP-Card erlauben (zum Hinzufügen)
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
}

function onDragLeave(event: DragEvent) {
  // KRITISCH: Ignorieren wenn es ein VueDraggable-Event ist
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    return
  }

  // Only reset if leaving the container entirely
  const target = event.currentTarget as HTMLElement
  const related = event.relatedTarget as HTMLElement
  if (!target.contains(related)) {
    isDragOver.value = false
    log('dragleave - isDragOver = false')
  }
}

function onDrop(event: DragEvent) {
  // KRITISCH: Ignorieren wenn es ein VueDraggable-Event ist
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    log('DROP IGNORED - likely VueDraggable ESP-Card reordering')
    return
  }

  log('DROP on ESPLayout', {
    hasJsonData: !!event.dataTransfer?.getData('application/json'),
    types: event.dataTransfer?.types,
  })

  event.preventDefault()
  isDragOver.value = false

  const jsonData = event.dataTransfer?.getData('application/json')
  if (!jsonData) {
    log('DROP - no JSON data, ignoring')
    return
  }

  try {
    const payload = JSON.parse(jsonData)
    log('DROP payload parsed', payload)

    if (payload.action === 'add-sensor') {
      log('DROP - add-sensor action, opening modal')
      // Modal handles its own form state and defaults
      showAddSensorModal.value = true
    } else if (payload.action === 'add-actuator') {
      log('DROP - add-actuator action, opening modal')
      // Modal handles its own form state and defaults
      showAddActuatorModal.value = true
    } else if (payload.type === 'sensor') {
      log('DROP - sensor for chart, should be handled by AnalysisDropZone')
    } else {
      log('DROP - unknown payload type', { type: payload.type, action: payload.action })
    }
  } catch (error) {
    log('DROP ERROR - failed to parse', { error })
  }
}



// =============================================================================
// EDIT SENSOR HANDLERS (Phase 2F)
// =============================================================================

/**
 * Open edit modal for a sensor
 */
function openEditSensorModal(gpio: number) {
  editSensorGpio.value = gpio
  showEditSensorModal.value = true
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

// ── Device Actions (shared composable) ───────────────────────────────
const actions = useDeviceActions(() => props.device)
const {
  espId, isMock, displayName, isOnline, systemState, stateInfo,
  wifiInfo, wifiColorClass, wifiTooltip,
  heartbeatLoading, isHeartbeatFresh, heartbeatTooltip, heartbeatText,
  isEditingName, editedName, isSavingName, saveError, nameInputRef,
  startEditName, cancelEditName, handleNameKeydown,
} = actions

// GPIO Status für dynamische GPIO-Auswahl (Phase 5)
useGpioStatus(espId)

const totalItems = computed(() => {
  return sensors.value.length + actuators.value.length
})

/**
 * Determine if sensors should use multi-row layout.
 * - ≤5 sensors: single row (horizontal)
 * - >5 sensors: 2-column grid (wraps into multiple rows)
 */
const sensorsUseMultiRow = computed(() => {
  return sensors.value.length > 5
})

// WiFi, Heartbeat, Name Editing — all provided by useDeviceActions above

/** Heartbeat click: trigger + emit */
async function handleHeartbeatClick() {
  await actions.triggerHeartbeat()
  emit('heartbeat', props.device)
}

/** Settings click → emit to parent */
function handleSettingsClick() {
  emit('settings', props.device)
}

/** Save name + emit */
async function saveName() {
  const result = await actions.saveName()
  if (result) emit('name-updated', result)
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleSensorClick(gpio: number) {
  // Phase 2F: Öffne Edit-Modal statt nur Selektion zu toggeln
  openEditSensorModal(gpio)
  // Auch Event emittieren für externe Handler
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
    log('isSensorFromThisEspDragging changed', {
      isDraggingFromThisEsp,
      analysisExpanded: analysisExpanded.value,
      wasAutoOpened: wasAutoOpened.value,
    })

    if (isDraggingFromThisEsp) {
      // Sofort öffnen - kein Delay, da wir Overlay-Modus verwenden
      // Overlay verhindert Layout-Shifts die Drag unterbrechen könnten
      if (!analysisExpanded.value) {
        wasAutoOpened.value = true // ZUERST setzen - aktiviert Overlay-Modus
        analysisExpanded.value = true
        log('Auto-opening chart (overlay mode)')
      }
    } else {
      // Nach Drag-Ende: Overlay-Modus beenden, Chart bleibt aber offen
      // Kurze Verzögerung damit Drop-Event verarbeitet werden kann
      if (wasAutoOpened.value) {
        log('Drag ended, transitioning from overlay to inline mode')
        setTimeout(() => {
          wasAutoOpened.value = false
          log('wasAutoOpened = false (inline mode now)')
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
      'esp-horizontal-layout--can-drop': dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType,
      'esp-horizontal-layout--drag-over': isDragOver
    }"
    :data-esp-id="espId"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Left Column: Sensors (uses extracted SensorColumn) -->
    <SensorColumn
      :esp-id="espId"
      :sensors="sensors"
      :selected-gpio="selectedGpio !== null && selectedType === 'sensor' ? selectedGpio : null"
      :show-connections="showConnections"
      class="esp-horizontal-layout__column esp-horizontal-layout__column--sensors"
      :class="{
        'esp-horizontal-layout__column--multi-row': sensorsUseMultiRow,
        'esp-horizontal-layout__column--empty': sensors.length === 0
      }"
      @sensor-click="handleSensorClick"
    />

    <!-- Center Column: ESP Card -->
    <div ref="centerRef" class="esp-horizontal-layout__center">
      <!-- Compact Mode: Simple Info Card -->
      <div
        v-if="compactMode"
        :class="['esp-info-compact', isMock ? 'esp-info-compact--mock' : 'esp-info-compact--real']"
      >
        <!-- Header is the drag handle for VueDraggable (esp-drag-handle class) -->
        <div class="esp-info-compact__header esp-drag-handle">
          <!-- Top Row: Name + Settings -->
          <div class="esp-info-compact__top-row">
            <!-- Name Editing (Phase 3) - Edit Mode -->
            <template v-if="isEditingName">
              <div class="esp-info-compact__name-edit" data-no-drag>
                <input
                  ref="nameInputRef"
                  v-model="editedName"
                  type="text"
                  class="esp-info-compact__name-input"
                  placeholder="Gerätename..."
                  :disabled="isSavingName"
                  @keydown="handleNameKeydown"
                  @blur="saveName"
                  @click.stop
                />
                <div class="esp-info-compact__name-actions">
                  <button
                    v-if="isSavingName"
                    class="esp-info-compact__name-btn"
                    disabled
                  >
                    <Loader2 class="w-3 h-3 animate-spin" />
                  </button>
                  <template v-else>
                    <button
                      class="esp-info-compact__name-btn esp-info-compact__name-btn--save"
                      title="Speichern (Enter)"
                      @mousedown.prevent="saveName"
                    >
                      <Check class="w-3 h-3" />
                    </button>
                    <button
                      class="esp-info-compact__name-btn esp-info-compact__name-btn--cancel"
                      title="Abbrechen (Escape)"
                      @mousedown.prevent="cancelEditName"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </template>
                </div>
              </div>
            </template>

            <!-- Name Display Mode (double-click to edit) -->
            <template v-else>
              <div
                class="esp-info-compact__name-display"
                :title="displayName ? `${displayName}\n(Doppelklick zum Bearbeiten)` : 'Doppelklick zum Bearbeiten'"
                @dblclick.stop="startEditName"
              >
                <h3 :class="['esp-info-compact__title', { 'esp-info-compact__title--empty': !displayName }]">
                  {{ displayName || 'Unbenannt' }}
                </h3>
                <Pencil class="esp-info-compact__name-pencil w-3 h-3" />
              </div>
            </template>

            <!-- Settings Icon - always top right -->
            <button
              class="esp-info-compact__settings-btn"
              title="Einstellungen"
              @click.stop="handleSettingsClick"
            >
              <Settings2 class="w-4 h-4" />
            </button>
          </div>

          <!-- Name Edit Error Message -->
          <span v-if="saveError" class="esp-info-compact__name-error">{{ saveError }}</span>

          <!-- Info Row: Type Badge, ESP-ID, Status, WiFi -->
          <div class="esp-info-compact__info-row">
            <Badge :variant="isMock ? 'mock' : 'real'" size="xs">
              {{ isMock ? 'Simuliert' : 'Hardware' }}
            </Badge>
            <span class="esp-info-compact__id">{{ espId }}</span>
            <Badge
              :variant="stateInfo.variant as any"
              :pulse="isOnline && (systemState === 'OPERATIONAL' || device.status === 'online')"
              dot
              size="xs"
            >
              {{ stateInfo.label }}
            </Badge>
            <!-- WiFi Signal Bars -->
            <div class="esp-info-compact__wifi" :title="wifiTooltip">
              <div :class="['esp-info-compact__wifi-bars', wifiColorClass]">
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 1 }]" />
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 2 }]" />
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 3 }]" />
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 4 }]" />
              </div>
              <span :class="['esp-info-compact__wifi-label', wifiColorClass]">{{ wifiInfo.label }}</span>
            </div>
          </div>

          <!-- Zone Assignment Dropdown -->
          <ZoneAssignmentDropdown
            :device="device"
            :zones="availableZones"
            @zone-changed="handleZoneChanged"
          />

          <!-- Heartbeat Row -->
          <button
            :class="[
              'esp-info-compact__heartbeat',
              { 'esp-info-compact__heartbeat--fresh': isHeartbeatFresh },
              { 'esp-info-compact__heartbeat--mock': isMock }
            ]"
            :title="heartbeatTooltip"
            :disabled="heartbeatLoading"
            @click.stop="handleHeartbeatClick"
          >
            <Heart
              :class="[
                'w-3 h-3',
                isHeartbeatFresh ? 'esp-info-compact__heart-pulse' : ''
              ]"
            />
            <span class="esp-info-compact__heartbeat-text">
              {{ heartbeatText }}
            </span>
            <Loader2 v-if="heartbeatLoading" class="w-3 h-3 animate-spin" />
          </button>
        </div>

        <!--
          Analysis Drop Zone - Öffnet sich automatisch bei Sensor-Drag.
          IMMER im DOM (kein v-if!), nur mit CSS versteckt/sichtbar.
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
      </div>

      <!-- Full Mode: Full ESP Card (for detail view) -->
      <ESPCard v-else :esp="device" />
    </div>

    <!-- Right Column: Actuators (uses extracted ActuatorColumn) -->
    <ActuatorColumn
      :esp-id="espId"
      :actuators="actuators"
      :selected-gpio="selectedGpio !== null && selectedType === 'actuator' ? selectedGpio : null"
      :show-connections="showConnections"
      class="esp-horizontal-layout__column esp-horizontal-layout__column--actuators"
      :class="{ 'esp-horizontal-layout__column--empty': actuators.length === 0 }"
      @actuator-click="handleActuatorClick"
    />

    <!-- Drop Indicator Overlay (Phase 2B: für alle ESPs) -->
    <Transition name="fade">
      <div v-if="isDragOver" class="esp-horizontal-layout__drop-indicator">
        <span class="esp-horizontal-layout__drop-text">Sensor hinzufügen</span>
      </div>
    </Transition>
  </div>

  <!-- Add Sensor Modal (extracted component) -->
  <AddSensorModal
    v-model="showAddSensorModal"
    :esp-id="espId"
    @added="() => { espStore.fetchDevice(espId); espStore.fetchGpioStatus(espId) }"
  />

  <!-- LEGACY: Old inline Add Sensor Modal removed — now uses AddSensorModal component -->
  <!-- Add Actuator Modal (extracted component) -->
  <AddActuatorModal
    v-model="showAddActuatorModal"
    :esp-id="espId"
    @added="() => { espStore.fetchDevice(espId); espStore.fetchGpioStatus(espId) }"
  />

  <!-- Old inline sensor/actuator modals removed (see AddSensorModal.vue, AddActuatorModal.vue) -->

  <!-- Edit Sensor Modal (extracted component) -->
  <EditSensorModal
    v-model="showEditSensorModal"
    :esp-id="espId"
    :sensor="editSensorPayload"
    :is-mock="isMock"
    @saved="() => espStore.fetchAll()"
    @deleted="() => espStore.fetchAll()"
  />

  <!-- OLD INLINE EDIT MODAL REMOVED - replaced by EditSensorModal component -->
</template>

<style scoped src="./ESPOrbitalLayout.css"></style>
