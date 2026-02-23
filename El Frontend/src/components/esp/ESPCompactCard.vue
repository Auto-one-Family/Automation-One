<script setup lang="ts">
/**
 * ESPCompactCard Component
 *
 * Compact ESP device info card used in the zone/dashboard view.
 * Shows device name (editable), status, WiFi signal, zone assignment,
 * heartbeat indicator, and analysis drop zone.
 *
 * Extracted from ESPOrbitalLayout to keep components under 500 lines.
 */

import { ref, computed, watch } from 'vue'
import { X, Heart, Settings2, Loader2, Pencil, Check } from 'lucide-vue-next'
import { Badge } from '@/shared/design/primitives'
import ZoneAssignmentDropdown from './ZoneAssignmentDropdown.vue'
import AnalysisDropZone from './AnalysisDropZone.vue'
import type { ESPDevice } from '@/api/esp'
import type { ChartSensor } from '@/types'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/shared/stores/dragState.store'
import { useZoneDragDrop } from '@/composables/useZoneDragDrop'
import { useDeviceActions } from '@/composables/useDeviceActions'
import { useGpioStatus } from '@/composables/useGpioStatus'
import { createLogger } from '@/utils/logger'

const logger = createLogger('ESPCompactCard')

interface Props {
  device: ESPDevice
}

const props = defineProps<Props>()

const espStore = useEspStore()
const dragStore = useDragStateStore()
const { handleDeviceDrop, handleRemoveFromZone, getAvailableZones } = useZoneDragDrop()

const emit = defineEmits<{
  heartbeat: [device: ESPDevice]
  settings: [device: ESPDevice]
  'name-updated': [payload: { deviceId: string; name: string | null }]
  'sensor-dropped': [sensor: ChartSensor]
}>()

// =============================================================================
// Device Actions (shared composable)
// =============================================================================
const actions = useDeviceActions(() => props.device)
const {
  espId, isMock, displayName, isOnline, systemState, stateInfo,
  wifiInfo, wifiColorClass, wifiTooltip,
  heartbeatLoading, isHeartbeatFresh, heartbeatTooltip, heartbeatText,
  isEditingName, editedName, isSavingName, saveError, nameInputRef,
  startEditName, cancelEditName, handleNameKeydown,
} = actions

useGpioStatus(espId)

// =============================================================================
// Zone Assignment
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
// Analysis Drop Zone
// =============================================================================
const analysisExpanded = ref(false)
const wasAutoOpened = ref(false)

function handleSensorDrop(sensor: ChartSensor) {
  emit('sensor-dropped', sensor)
}

// =============================================================================
// Handlers
// =============================================================================
async function handleHeartbeatClick() {
  await actions.triggerHeartbeat()
  emit('heartbeat', props.device)
}

function handleSettingsClick() {
  emit('settings', props.device)
}

async function saveName() {
  const result = await actions.saveName()
  if (result) emit('name-updated', result)
}

// =============================================================================
// Auto-open chart when sensor from this ESP is dragged
// =============================================================================
const isSensorFromThisEspDragging = computed(() =>
  dragStore.isDraggingSensor && dragStore.draggingSensorEspId === espId.value
)

watch(
  () => isSensorFromThisEspDragging.value,
  (isDraggingFromThisEsp) => {
    if (isDraggingFromThisEsp) {
      if (!analysisExpanded.value) {
        wasAutoOpened.value = true
        analysisExpanded.value = true
        logger.debug('Auto-opening chart (overlay mode)')
      }
    } else {
      if (wasAutoOpened.value) {
        setTimeout(() => {
          wasAutoOpened.value = false
        }, 300)
      }
    }
  }
)

watch(
  () => analysisExpanded.value,
  (expanded) => {
    if (!expanded) wasAutoOpened.value = false
  }
)
</script>

<template>
  <div
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
      Always in DOM (no v-if!), hidden/shown with CSS.
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
</template>

<style scoped src="./ESPCompactCard.css"></style>
