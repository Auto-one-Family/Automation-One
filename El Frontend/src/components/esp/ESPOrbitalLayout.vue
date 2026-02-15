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

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { X, Heart, Settings2, Loader2, Pencil, Check } from 'lucide-vue-next'
import ESPCard from './ESPCard.vue'
import { getWifiStrength, type WifiStrengthInfo } from '@/utils/wifiStrength'
import { formatRelativeTime } from '@/utils/formatters'
import SensorColumn from './SensorColumn.vue'
import ActuatorColumn from './ActuatorColumn.vue'
import AddSensorModal from './AddSensorModal.vue'
import AddActuatorModal from './AddActuatorModal.vue'
import EditSensorModal from './EditSensorModal.vue'
import type { EditableSensor } from './EditSensorModal.vue'
import AnalysisDropZone from './AnalysisDropZone.vue'
// GpioPicker moved to AddSensorModal/AddActuatorModal
import Badge from '@/components/common/Badge.vue'
import ZoneAssignmentDropdown from './ZoneAssignmentDropdown.vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator, ChartSensor } from '@/types'
import { espApi } from '@/api/esp'
// sensorsApi moved to AddSensorModal/EditSensorModal
import { getStateInfo } from '@/utils/labels'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/stores/dragState'
// useUiStore and useToast moved to extracted modal components
import { useZoneDragDrop } from '@/composables/useZoneDragDrop'
import { useGpioStatus } from '@/composables/useGpioStatus'
// sensorDefaults moved to AddSensorModal/EditSensorModal
// actuatorDefaults moved to AddActuatorModal.vue
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
// uiStore and toast moved to extracted modal components
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

// Edit modal computed/state moved to EditSensorModal.vue

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


// addSensor/addActuator moved to AddSensorModal.vue/AddActuatorModal.vue

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

const espId = computed(() => {
  return props.device?.esp_id || props.device?.device_id || ''
})

const isMock = computed(() => {
  return espApi.isMockEsp(espId.value)
})

// GPIO Status für dynamische GPIO-Auswahl (Phase 5)
// GPIO status used by edit sensor modal
useGpioStatus(espId)

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
 * Determine if sensors should use multi-row layout.
 * - ≤5 sensors: single row (horizontal)
 * - >5 sensors: 2-column grid (wraps into multiple rows)
 */
const sensorsUseMultiRow = computed(() => {
  return sensors.value.length > 5
})

/**
 * Connection quality based on WiFi RSSI
 * @deprecated - Use wifiInfo.quality instead (provides more detailed levels)
 */
// const connectionQuality = computed(() => {
//   if (!isOnline.value) return 'poor'
//   const rssi = props.device?.wifi_rssi
//   if (rssi === undefined || rssi === null) return 'fair'
//   if (rssi > -60) return 'good'
//   if (rssi >= -75) return 'fair'
//   return 'poor'
// })
//
// const connectionTooltip = computed(() => {
//   if (!isOnline.value) return 'Keine Verbindung'
//   switch (connectionQuality.value) {
//     case 'good': return 'Verbindung: Stabil'
//     case 'fair': return 'Verbindung: Schwach'
//     case 'poor': return 'Verbindung: Kritisch'
//     default: return 'Verbindung: Unbekannt'
//   }
// })

// =============================================================================
// WiFi Signal Strength (Phase 1)
// =============================================================================

/** WiFi strength info from RSSI value */
const wifiInfo = computed<WifiStrengthInfo>(() => getWifiStrength(props.device?.wifi_rssi))

/** WiFi color class based on signal quality */
const wifiColorClass = computed(() => {
  switch (wifiInfo.value.quality) {
    case 'excellent':
    case 'good':
      return 'text-emerald-400'
    case 'fair':
      return 'text-yellow-400'
    case 'poor':
      return 'text-orange-400'
    case 'none':
      return 'text-red-400'
    default:
      return 'text-slate-500'
  }
})

/** WiFi tooltip with technical dBm value for experts */
const wifiTooltip = computed(() => {
  if (props.device?.wifi_rssi === undefined || props.device?.wifi_rssi === null) {
    return 'WiFi-Signalstärke: Keine Daten verfügbar'
  }
  const simNote = isMock.value ? ' (simuliert)' : ''
  return `WiFi: ${props.device.wifi_rssi} dBm${simNote}`
})

// =============================================================================
// Heartbeat Indicator (Phase 1)
// =============================================================================

/** Loading state for heartbeat button */
const heartbeatLoading = ref(false)

/**
 * Check if heartbeat is "fresh" (< 30 seconds ago)
 * Used for pulse animation on heartbeat icon
 */
const isHeartbeatFresh = computed(() => {
  const timestamp = props.device?.last_heartbeat || props.device?.last_seen
  if (!timestamp) return false

  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  return diffSec >= 0 && diffSec < 30
})

/**
 * Heartbeat tooltip based on device type
 */
const heartbeatTooltip = computed(() => {
  const timestamp = props.device?.last_heartbeat || props.device?.last_seen
  const relativeTime = timestamp ? formatRelativeTime(timestamp) : 'Nie'

  if (isMock.value) {
    return `Letzter Heartbeat: ${relativeTime}\nKlicken zum manuellen Senden`
  }
  return `Letzter Heartbeat: ${relativeTime}\n(Real ESPs senden automatisch)`
})

/**
 * Heartbeat click handler
 * - Mock ESP: Emits heartbeat event
 * - Real ESP: Shows info tooltip (no action)
 */
async function handleHeartbeatClick() {
  if (!isMock.value) {
    // Real ESPs can't trigger heartbeat manually - tooltip explains this
    return
  }

  heartbeatLoading.value = true
  emit('heartbeat', props.device)

  // Reset loading after a short delay (actual response comes via WebSocket)
  setTimeout(() => {
    heartbeatLoading.value = false
  }, 1500)
}

/**
 * Settings click handler - opens settings popover
 */
function handleSettingsClick() {
  emit('settings', props.device)
}

// =============================================================================
// Name Editing (Phase 3)
// =============================================================================

const isEditingName = ref(false)
const editedName = ref('')
const isSavingName = ref(false)
const saveError = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

/** Display name or fallback */
const displayName = computed(() => props.device?.name || null)

/**
 * Start inline editing of the device name
 */
function startEditName() {
  editedName.value = props.device?.name || ''
  isEditingName.value = true
  saveError.value = ''
  // Focus the input after DOM update
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

/**
 * Cancel name editing, reset to original value
 */
function cancelEditName() {
  isEditingName.value = false
  editedName.value = ''
  saveError.value = ''
}

/**
 * Save the new name via API
 */
async function saveName() {
  if (isSavingName.value) return

  const newName = editedName.value.trim() || null
  const deviceId = espId.value

  // No change? Just close
  if (newName === (props.device?.name || null)) {
    cancelEditName()
    return
  }

  isSavingName.value = true
  saveError.value = ''

  try {
    await espStore.updateDevice(deviceId, { name: newName || undefined })
    isEditingName.value = false
    emit('name-updated', { deviceId, name: newName })
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    saveError.value = axiosError.response?.data?.detail || 'Fehler beim Speichern'
    // Keep edit mode open on error
    setTimeout(() => {
      saveError.value = ''
    }, 3000)
  } finally {
    isSavingName.value = false
  }
}

/**
 * Handle keyboard events in name input
 */
function handleNameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveName()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditName()
  }
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
              {{ formatRelativeTime(device.last_heartbeat || device.last_seen || '') }}
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
  justify-content: center; /* Center content when columns are hidden */
  gap: 0.5rem; /* Reduced gap for tighter layout */
  padding: 0; /* Removed padding - card provides its own */
  min-height: auto;
  /* Shrink container to fit content */
  width: fit-content;
}

/* =============================================================================
   Left/Right Columns (Sensors & Actuators)
   Dynamic sizing - columns shrink to fit content, no fixed min-width
   ============================================================================= */
.esp-horizontal-layout__column {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  /* Dynamic width based on content - no fixed min-width */
  width: fit-content;
  max-width: 120px;
  flex-shrink: 0;
}

/* Sensors column: Default = single vertical column */
.esp-horizontal-layout__column--sensors {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  align-items: stretch;
  width: 120px;
}

/* Sensors column: Empty state - minimal footprint */
.esp-horizontal-layout__column--sensors.esp-horizontal-layout__column--empty {
  width: 56px;
}

/* Sensors column: Multi-column mode (>5 sensors) = 2 columns side by side */
.esp-horizontal-layout__column--sensors.esp-horizontal-layout__column--multi-row {
  display: grid;
  grid-template-columns: repeat(2, 120px);
  gap: 0.375rem;
  width: auto;
}

/* Actuators column */
.esp-horizontal-layout__column--actuators {
  align-items: stretch;
  width: 120px;
}

.esp-horizontal-layout__column--actuators.esp-horizontal-layout__column--empty {
  width: 56px;
}

/* Satellite cards in horizontal layout - fill column width */
.esp-horizontal-layout__satellite {
  position: relative !important;
  transform: none !important;
  left: auto !important;
  top: auto !important;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
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

/* Empty sensor/actuator slot - ghost placeholder */
.esp-horizontal-layout__empty-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.75rem 0.5rem;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.2);
  font-size: 0.5625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  transition: all 0.2s ease;
  cursor: default;
}

.esp-horizontal-layout__empty-slot:hover {
  border-color: rgba(96, 165, 250, 0.2);
  color: rgba(255, 255, 255, 0.35);
  background: rgba(96, 165, 250, 0.03);
}

/* =============================================================================
   Center Column (ESP Card)
   ============================================================================= */
.esp-horizontal-layout__center {
  flex: 0 1 auto; /* Don't grow, can shrink, auto width */
  min-width: 140px;
  max-width: 240px;
}

/* =============================================================================
   Compact ESP Info Card
   ============================================================================= */
.esp-info-compact {
  position: relative; /* Für absolute Positionierung des Overlay-Dropzone */
  width: 100%;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  outline: none;
  overflow: visible; /* Damit Overlay sichtbar ist */
  user-select: none; /* Verhindert Text-Selection während Drag (blaues Leuchten) */
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
  gap: 0.25rem;
}

/* =============================================================================
   Mock vs Real Visual Distinction
   ============================================================================= */

.esp-info-compact--mock {
  border-left: 3px solid var(--color-mock, #a78bfa);
  border-color: rgba(167, 139, 250, 0.25);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 0 20px rgba(167, 139, 250, 0.08);
}

.esp-info-compact--mock:hover {
  border-color: rgba(167, 139, 250, 0.4);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.25),
    0 0 25px rgba(167, 139, 250, 0.12);
}

.esp-info-compact--real {
  border-left: 3px solid var(--color-real, #22d3ee);
  border-color: rgba(34, 211, 238, 0.2);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 0 20px rgba(34, 211, 238, 0.06);
}

.esp-info-compact--real:hover {
  border-color: rgba(34, 211, 238, 0.35);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.25),
    0 0 25px rgba(34, 211, 238, 0.1);
}

/* Top Row: Name + Settings (flexbox with space-between) */
.esp-info-compact__top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
}

/* Info Row: Badges, ID, Status, WiFi (compact horizontal) */
.esp-info-compact__info-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.esp-info-compact__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  margin: 0;
  max-width: 140px;
  /* Fade-out Gradient für lange Namen (statt harter Ellipsis) */
  mask-image: linear-gradient(to right, black 75%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, black 75%, transparent 100%);
}

.esp-info-compact__title--empty {
  color: var(--color-text-muted);
  font-style: italic;
  font-weight: 400;
}

/* =============================================================================
   Name Editing (Phase 3)
   ============================================================================= */

.esp-info-compact__name-display {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  padding: 0.125rem 0.25rem;
  margin: -0.125rem -0.25rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s ease;
}

.esp-info-compact__name-display:hover {
  background-color: var(--glass-bg);
}

.esp-info-compact__name-display:hover .esp-info-compact__name-pencil {
  opacity: 1;
}

.esp-info-compact__name-pencil {
  color: var(--color-text-muted);
  opacity: 0.3;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.esp-info-compact__name-edit {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
}

.esp-info-compact__name-input {
  flex: 1;
  min-width: 0;
  max-width: 120px;
  padding: 0.25rem 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  background-color: transparent;
  border: none;
  border-bottom: 2px solid var(--color-iridescent-1);
  outline: none;
  font-family: inherit;
}

.esp-info-compact__name-input::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}

.esp-info-compact__name-input:disabled {
  opacity: 0.6;
}

.esp-info-compact__name-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.esp-info-compact__name-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 0.25rem;
  background-color: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.esp-info-compact__name-btn:hover:not(:disabled) {
  background-color: var(--glass-bg);
}

.esp-info-compact__name-btn:disabled {
  cursor: not-allowed;
}

.esp-info-compact__name-btn--save:hover:not(:disabled) {
  color: var(--color-success);
  background-color: rgba(34, 197, 94, 0.1);
}

.esp-info-compact__name-btn--cancel:hover:not(:disabled) {
  color: var(--color-error);
  background-color: rgba(239, 68, 68, 0.1);
}

.esp-info-compact__name-error {
  font-size: 0.625rem;
  color: var(--color-error);
  margin-left: 0.25rem;
}

.esp-info-compact__id {
  font-size: 0.5625rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  opacity: 0.7;
  letter-spacing: -0.025em;
}

/* Settings Button */
.esp-info-compact__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.esp-info-compact__settings-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
  color: var(--color-text-secondary);
}

.esp-info-compact__settings-btn:active {
  transform: scale(0.95);
}

/* =============================================================================
   WiFi Signal Bars (Phase 1.1)
   ============================================================================= */

.esp-info-compact__wifi {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: help;
}

.esp-info-compact__wifi-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 12px;
}

.esp-info-compact__wifi-bar {
  width: 2px;
  background-color: var(--color-text-muted);
  border-radius: 1px;
  opacity: 0.25;
  transition: opacity 0.2s ease, background-color 0.2s ease;
}

/* Bar heights: increasing from left to right */
.esp-info-compact__wifi-bar:nth-child(1) { height: 3px; }
.esp-info-compact__wifi-bar:nth-child(2) { height: 5px; }
.esp-info-compact__wifi-bar:nth-child(3) { height: 8px; }
.esp-info-compact__wifi-bar:nth-child(4) { height: 11px; }

/* Active bars inherit color from parent and are fully opaque */
.esp-info-compact__wifi-bar.active {
  opacity: 1;
  background-color: currentColor;
}

.esp-info-compact__wifi-label {
  font-size: 0.5625rem;
  font-weight: 500;
  white-space: nowrap;
}

/* WiFi color classes - these are shared with Tailwind classes */
.text-emerald-400 { color: #34d399; }
.text-yellow-400 { color: #facc15; }
.text-orange-400 { color: #fb923c; }
.text-red-400 { color: #f87171; }
.text-slate-500 { color: #64748b; }

/* =============================================================================
   Heartbeat Indicator (Phase 1.2)
   ============================================================================= */

.esp-info-compact__heartbeat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.375rem;
  font-size: 0.5625rem;
  color: var(--color-text-muted);
  background-color: transparent;
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  cursor: default;
  transition: all 0.2s ease;
}

.esp-info-compact__heartbeat--mock {
  cursor: pointer;
}

.esp-info-compact__heartbeat--mock:hover:not(:disabled) {
  background-color: var(--glass-bg);
  border-color: rgba(244, 114, 182, 0.3);
  color: var(--color-text-secondary);
}

.esp-info-compact__heartbeat:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Fresh heartbeat (< 30s) - show success color */
.esp-info-compact__heartbeat--fresh {
  border-color: rgba(74, 222, 128, 0.3);
  color: var(--color-success);
}

.esp-info-compact__heartbeat-text {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Pulse animation for fresh heartbeat */
.esp-info-compact__heart-pulse {
  animation: heart-pulse 1s ease-in-out infinite;
}

@keyframes heart-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.8;
  }
}

/* Connection quality indicator dot (legacy - kept for backwards compatibility) */
.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: help;
  transition: transform 0.2s;
}

.connection-dot:hover {
  box-shadow: 0 0 8px currentColor;
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
  max-height: 350px;
  overflow: visible;
  margin-top: 0.375rem;
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
  /* KEINE Animation mit transform während Drag - das verursacht Hit-Test-Probleme!
     Die Animation würde das Element verschieben während der Cursor darüber ist,
     was zu sofortigem dragleave führt. Nur opacity-Fade verwenden. */
  animation: dropzone-appear 0.1s ease-out;
}

@keyframes dropzone-appear {
  from {
    opacity: 0;
    /* KEIN transform hier! Verursacht Drag-Drop-Probleme */
  }
  to {
    opacity: 1;
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
    max-width: 240px;
  }
}

/* =============================================================================
   Desktop Layout (1024px+): Full horizontal with more space
   ============================================================================= */
@media (min-width: 1024px) {
  .esp-horizontal-layout {
    gap: 0.875rem;
  }

  .esp-horizontal-layout__column {
    max-width: 140px;
  }

  .esp-horizontal-layout__center {
    max-width: 300px;
  }

  .esp-horizontal-layout__satellite {
    max-width: 130px;
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

.modal-footer--with-delete {
  justify-content: flex-start;
}

.modal-footer__spacer {
  flex: 1;
}

/* Delete Button Styling */
.btn--danger {
  background-color: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn--danger:hover {
  background-color: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.btn--danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--icon {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
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

/* =============================================================================
   EDIT SENSOR MODAL STYLES (Phase 2F)
   ============================================================================= */

.modal-header--edit {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
}

.modal-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}

.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}

.form-label-row .form-label {
  margin-bottom: 0;
}

.btn-reset {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 500;
  color: var(--color-iridescent-1);
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reset:hover {
  background: rgba(167, 139, 250, 0.1);
  color: var(--color-iridescent-2);
}

.btn-reset svg {
  width: 0.75rem;
  height: 0.75rem;
}

.form-hint {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}

.form-hint--warning {
  color: var(--color-warning, #f59e0b);
}

.info-box {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  padding: 0.75rem;
  line-height: 1.5;
}

.info-box strong {
  color: var(--color-text-primary);
}

.info-box__content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-box__content p {
  margin: 0;
}

/* Alert Messages */
.alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  margin-top: 0.75rem;
}

.alert--error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.alert--success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.alert__icon {
  flex-shrink: 0;
}

.alert__text {
  flex: 1;
}

.alert__close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: inherit;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0.7;
  padding: 0;
  line-height: 1;
}

.alert__close:hover {
  opacity: 1;
}

/* Small Button Variant */
.btn--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  gap: 0.375rem;
}

/* Accent Button (for Measure Now) */
.btn--accent {
  background: var(--color-primary, #3b82f6);
  color: white;
  border: none;
}

.btn--accent:hover:not(:disabled) {
  background: var(--color-primary-hover, #2563eb);
}

.btn--accent:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Animation for loading spinner */
.animate-spin {
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

/* Schedule Configuration Styles */
.schedule-config {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.schedule-config__info {
  margin: 0;
}

.schedule-config__presets {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.preset-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.preset-btn--active {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: white;
}

.schedule-config__custom {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-input--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
}

.schedule-config__current {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.375rem;
}

.schedule-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.schedule-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
  color: var(--color-primary, #3b82f6);
  background: var(--color-bg-secondary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

/* Code styling in hints */
.form-hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  background: var(--color-bg-tertiary);
  padding: 0.0625rem 0.25rem;
  border-radius: 0.25rem;
}

/* Utility classes for SVG icons */
.w-3 {
  width: 0.75rem;
}
.h-3 {
  height: 0.75rem;
}

/* =============================================================================
   OneWire Scan Section (Phase 6 - DS18B20 Support)
   ============================================================================= */

.onewire-scan-section {
  margin-top: 1rem;
  padding: 1rem;
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.05) 0%,
    rgba(96, 165, 250, 0.08) 100%
  );
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 0.5rem;
}

.onewire-scan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.onewire-scan-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary, #ffffff);
  margin: 0;
}

.onewire-scan-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.form-select--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  width: auto;
  min-width: 100px;
}

.btn--scan {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(
    135deg,
    #3b82f6 0%,
    #60a5fa 100%
  );
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn--scan:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.4);
}

.btn--scan:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Scan Results */
.onewire-scan-results {
  margin-top: 1rem;
}

.onewire-scan-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.onewire-scan-results-count {
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #9ca3af);
  font-weight: 500;
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--color-text-secondary, #9ca3af);
}

.btn--ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.25);
  color: var(--color-text-primary, #ffffff);
}

.btn--xs {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  gap: 0.25rem;
}

/* Device List */
.onewire-device-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.onewire-device-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-bg-secondary, rgba(30, 33, 42, 0.8));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.onewire-device-item:hover {
  border-color: rgba(96, 165, 250, 0.4);
  background: var(--color-bg-tertiary, rgba(40, 43, 52, 0.9));
}

.onewire-device-item--selected {
  border-color: rgba(96, 165, 250, 0.6);
  background: rgba(96, 165, 250, 0.1);
}

/* OneWire Multi-Device Support: Already configured devices */
.onewire-device-item--configured {
  border-color: rgba(156, 163, 175, 0.3);
  background: rgba(107, 114, 128, 0.05);
  opacity: 0.7;
  cursor: not-allowed;
}

.onewire-device-item--configured:hover {
  border-color: rgba(156, 163, 175, 0.3);
  background: rgba(107, 114, 128, 0.05);
}

.onewire-device-item--configured input[type="checkbox"] {
  cursor: not-allowed;
  opacity: 0.5;
}

/* All devices already configured message */
.onewire-all-configured {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 0.375rem;
  color: #34d399;
  font-size: 0.8125rem;
  margin-top: 0.5rem;
}

.onewire-device-item input[type="checkbox"] {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: #60a5fa;
}

.onewire-device-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.onewire-rom-code {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

/* Bulk Add Button */
.onewire-bulk-add-btn {
  margin-top: 0.5rem;
}

/* Scan Error */
.onewire-scan-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 0.375rem;
  color: #f87171;
  font-size: 0.8125rem;
  margin-top: 1rem;
}

.onewire-scan-error svg {
  flex-shrink: 0;
  margin-top: 0.125rem;
}

/* Scan Empty State */
.onewire-scan-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--color-bg-tertiary, rgba(40, 43, 52, 0.5));
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 0.375rem;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 0.8125rem;
  justify-content: center;
  margin-top: 1rem;
}

/* No Devices Found State (after scan with 0 results) */
.onewire-scan-empty--no-devices {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-style: solid;
  padding: 1rem;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.onewire-scan-empty--no-devices svg {
  color: #fbbf24;
}

.onewire-scan-empty-content {
  text-align: left;
  width: 100%;
}

.onewire-scan-empty-title {
  font-weight: 600;
  color: var(--color-text-primary, #ffffff);
  margin-bottom: 0.5rem;
}

.onewire-scan-empty-hint {
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #9ca3af);
  line-height: 1.6;
  margin: 0;
}

/* Scan Loading State */
.onewire-scan-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 0.875rem;
  margin-top: 1rem;
}

.onewire-scan-loading svg {
  color: #60a5fa;
}

/* Spin animation for Loader2 */
.animate-spin {
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

/* Text color utilities */
.text-blue-400 {
  color: #60a5fa;
}

/* Width utility */
.w-full {
  width: 100%;
}
</style>


