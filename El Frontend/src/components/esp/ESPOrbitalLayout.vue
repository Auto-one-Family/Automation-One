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

import { ref, computed } from 'vue'
import { X, Heart, Settings2, Loader2, Pencil, Check } from 'lucide-vue-next'
import ESPCard from './ESPCard.vue'
import SensorColumn from './SensorColumn.vue'
import ActuatorColumn from './ActuatorColumn.vue'
import AddSensorModal from './AddSensorModal.vue'
import AddActuatorModal from './AddActuatorModal.vue'
import AnalysisDropZone from './AnalysisDropZone.vue'
import { Badge } from '@/shared/design/primitives'
import ZoneAssignmentDropdown from './ZoneAssignmentDropdown.vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator, ChartSensor } from '@/types'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/shared/stores/dragState.store'
import { useZoneDragDrop } from '@/composables/useZoneDragDrop'
import { useDeviceActions } from '@/composables/useDeviceActions'
import { useGpioStatus } from '@/composables/useGpioStatus'
import { useOrbitalDragDrop } from '@/composables/useOrbitalDragDrop'

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
  sensorClick: [payload: { configId?: string; gpio: number; sensorType: string }]
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

// ── Device Actions (shared composable) ───────────────────────────────
const actions = useDeviceActions(() => props.device)
const {
  espId, isMock, displayName, isOnline, systemState, stateInfo,
  wifiInfo, wifiColorClass, wifiTooltip,
  heartbeatLoading, isHeartbeatFresh, heartbeatTooltip, heartbeatText,
  isEditingName, editedName, isSavingName, saveError, nameInputRef,
  startEditName, cancelEditName, handleNameKeydown,
} = actions

// GPIO Status for dynamic GPIO selection (Phase 5)
useGpioStatus(espId)

// ── Drag & Drop (extracted composable) ───────────────────────────────
const {
  onDragEnter, onDragOver, onDragLeave, onDrop,
  isDragOver,
  showAddSensorModal, showAddActuatorModal,
  droppedSensorType, droppedActuatorType,
  analysisExpanded, wasAutoOpened,
} = useOrbitalDragDrop(espId)

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

// Handle sensor dropped into analysis zone
function handleSensorDrop(sensor: ChartSensor) {
  emit('sensorDropped', sensor)
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

const totalItems = computed(() => {
  return sensors.value.length + actuators.value.length
})

/**
 * Determine if sensors should use multi-row layout.
 * - <=5 sensors: single row (horizontal)
 * - >5 sensors: 2-column grid (wraps into multiple rows)
 */
const sensorsUseMultiRow = computed(() => {
  return sensors.value.length > 5
})

// =============================================================================
// Event Handlers
// =============================================================================

/** Heartbeat click: trigger + emit */
async function handleHeartbeatClick() {
  await actions.triggerHeartbeat()
  emit('heartbeat', props.device)
}

/** Settings click -> emit to parent */
function handleSettingsClick() {
  emit('settings', props.device)
}

/** Save name + emit */
async function saveName() {
  const result = await actions.saveName()
  if (result) emit('name-updated', result)
}

function handleSensorClick(payload: { configId?: string; gpio: number; sensorType: string }) {
  // Emit to parent (HardwareView) -> opens SensorConfigPanel in SlideOver
  emit('sensorClick', payload)
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
          Analysis Drop Zone - Opens automatically on sensor drag.
          Always in DOM (no v-if!), only hidden/shown via CSS.
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

    <!-- Drop Indicator Overlay (Phase 2B: for all ESPs) -->
    <Transition name="fade">
      <div v-if="isDragOver" class="esp-horizontal-layout__drop-indicator">
        <span class="esp-horizontal-layout__drop-text">{{ dragStore.isDraggingActuatorType ? 'Aktor hinzufügen' : 'Sensor hinzufügen' }}</span>
      </div>
    </Transition>
  </div>

  <!-- Add Sensor Modal (extracted component) -->
  <AddSensorModal
    v-model="showAddSensorModal"
    :esp-id="espId"
    :initial-sensor-type="droppedSensorType"
    @added="() => { droppedSensorType = null; espStore.fetchDevice(espId); espStore.fetchGpioStatus(espId) }"
  />

  <!-- Add Actuator Modal (extracted component) -->
  <AddActuatorModal
    v-model="showAddActuatorModal"
    :esp-id="espId"
    :initial-actuator-type="droppedActuatorType"
    @added="() => { droppedActuatorType = null; espStore.fetchDevice(espId); espStore.fetchGpioStatus(espId) }"
  />
</template>

<style scoped src="./ESPOrbitalLayout.css"></style>
