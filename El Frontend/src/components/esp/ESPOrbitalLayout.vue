<script setup lang="ts">
/**
 * ESPHorizontalLayout Component (formerly ESPOrbitalLayout)
 *
 * Displays sensors and actuators in a horizontal 3-column layout:
 * - Left column: Sensors (vertically stacked)
 * - Center column: ESP Card (compact or full)
 * - Right column: Actuators (vertically stacked)
 *
 * Features:
 * - Side-by-side layout: no overlap, all elements always visible
 * - Responsive: mobile = vertical stack, tablet/desktop = horizontal
 * - Drag & drop for adding sensors from sidebar
 * - Click to select/highlight satellites
 */

import { ref, computed } from 'vue'
import ESPCard from './ESPCard.vue'
import ESPCompactCard from './ESPCompactCard.vue'
import SensorColumn from './SensorColumn.vue'
import ActuatorColumn from './ActuatorColumn.vue'
import AddSensorModal from './AddSensorModal.vue'
import AddActuatorModal from './AddActuatorModal.vue'
import EditSensorModal from './EditSensorModal.vue'
import type { EditableSensor } from './EditSensorModal.vue'
import type { ESPDevice } from '@/api/esp'
import { espApi } from '@/api/esp'
import type { MockSensor, MockActuator, ChartSensor } from '@/types'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/shared/stores/dragState.store'
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
// Add Sensor/Actuator Drop Handler State
// =============================================================================
const isDragOver = ref(false)
const showAddSensorModal = ref(false)
const showAddActuatorModal = ref(false)

// =============================================================================
// Edit Sensor State (Phase 2F)
// =============================================================================
const showEditSensorModal = ref(false)
const editSensorGpio = ref<number | null>(null)

// =============================================================================
// Refs
// =============================================================================
const containerRef = ref<HTMLElement | null>(null)
const centerRef = ref<HTMLElement | null>(null)
const selectedGpio = ref<number | null>(null)
const selectedType = ref<'sensor' | 'actuator' | null>(null)

// =============================================================================
// Computed: Device Data
// =============================================================================
const espId = computed(() => props.device.device_id)
const isMock = computed(() => espApi.isMockEsp(espId.value))

const sensors = computed<MockSensor[]>(() => {
  return (props.device?.sensors as MockSensor[]) || []
})

const actuators = computed<MockActuator[]>(() => {
  return (props.device?.actuators as MockActuator[]) || []
})

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

const totalItems = computed(() => sensors.value.length + actuators.value.length)

const sensorsUseMultiRow = computed(() => sensors.value.length > 5)

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

  // If nothing relevant is being dragged, it's likely VueDraggable ESP-Card reordering
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    log('dragenter IGNORED - likely VueDraggable ESP-Card reordering')
    return
  }

  if (dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType) {
    isDragOver.value = true
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
    log('isDragOver = true (sensor/actuator type from sidebar)')
  }
}

function onDragOver(event: DragEvent) {
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    return
  }

  if (dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  } else if (dragStore.isDraggingSensor) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }
}

function onDragLeave(event: DragEvent) {
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    return
  }

  const target = event.currentTarget as HTMLElement
  const related = event.relatedTarget as HTMLElement
  if (!target.contains(related)) {
    isDragOver.value = false
    log('dragleave - isDragOver = false')
  }
}

function onDrop(event: DragEvent) {
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
      showAddSensorModal.value = true
    } else if (payload.action === 'add-actuator') {
      log('DROP - add-actuator action, opening modal')
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
// Edit Sensor Handler (Phase 2F)
// =============================================================================
function openEditSensorModal(gpio: number) {
  editSensorGpio.value = gpio
  showEditSensorModal.value = true
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleSensorClick(gpio: number) {
  openEditSensorModal(gpio)
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
      <!-- Compact Mode: Extracted ESPCompactCard component -->
      <ESPCompactCard
        v-if="compactMode"
        :device="device"
        @heartbeat="(d) => emit('heartbeat', d)"
        @settings="(d) => emit('settings', d)"
        @name-updated="(p) => emit('name-updated', p)"
        @sensor-dropped="(s) => emit('sensorDropped', s)"
      />

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

  <!-- Add Actuator Modal (extracted component) -->
  <AddActuatorModal
    v-model="showAddActuatorModal"
    :esp-id="espId"
    @added="() => { espStore.fetchDevice(espId); espStore.fetchGpioStatus(espId) }"
  />

  <!-- Edit Sensor Modal (extracted component) -->
  <EditSensorModal
    v-model="showEditSensorModal"
    :esp-id="espId"
    :sensor="editSensorPayload"
    :is-mock="isMock"
    @saved="() => espStore.fetchAll()"
    @deleted="() => espStore.fetchAll()"
  />
</template>

<style scoped src="./ESPOrbitalLayout.css"></style>
