<script setup lang="ts">
/**
 * DeviceHeaderBar Component
 *
 * Compact header card for an ESP device using useDeviceActions composable.
 * Shows: Name (editable), Status, WiFi, Zone, Heartbeat, Settings button.
 *
 * Used in:
 * - ESPOrbitalLayout (compact mode center column)
 * - Future: DeviceDetailView
 */

import {
  Heart,
  Settings2,
  Loader2,
  Pencil,
  Check,
  X,
} from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import ZoneAssignmentDropdown from './ZoneAssignmentDropdown.vue'
import type { ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useDeviceActions } from '@/composables/useDeviceActions'
import { useZoneDragDrop } from '@/composables/useZoneDragDrop'
import { computed } from 'vue'
// formatRelativeTime now handled by useDeviceActions

interface Props {
  device: ESPDevice
}

const props = defineProps<Props>()

const emit = defineEmits<{
  heartbeat: [device: ESPDevice]
  settings: [device: ESPDevice]
  'name-updated': [payload: { deviceId: string; name: string | null }]
}>()

const espStore = useEspStore()
const { handleDeviceDrop, handleRemoveFromZone, getAvailableZones } = useZoneDragDrop()

// ── useDeviceActions composable (replaces all inline logic) ──────────
const actions = useDeviceActions(() => props.device)

// Re-export for template
const {
  espId, isMock, displayName, isOnline, systemState, stateInfo,
  wifiInfo, wifiColorClass, wifiTooltip,
  heartbeatLoading, isHeartbeatFresh, heartbeatTooltip,
  isEditingName, editedName, isSavingName, saveError, nameInputRef,
  startEditName, cancelEditName,
} = actions

/** Override keydown to emit name-updated after save */
function handleNameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleSaveName()
  if (e.key === 'Escape') cancelEditName()
}

// Zone
const availableZones = computed(() => getAvailableZones(espStore.devices))

// ── Actions ──────────────────────────────────────────────────────────

async function handleHeartbeatClick() {
  await actions.triggerHeartbeat()
  emit('heartbeat', props.device)
}

async function handleSaveName() {
  const result = await actions.saveName()
  if (result) {
    emit('name-updated', result)
  }
}

function handleSettingsClick() {
  emit('settings', props.device)
}

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
</script>

<template>
  <div :class="['device-header-bar', isMock ? 'device-header-bar--mock' : 'device-header-bar--real']">
    <!-- Header row is the drag handle -->
    <div class="device-header-bar__header esp-drag-handle">
      <!-- Top Row: Name + Settings -->
      <div class="device-header-bar__top-row">
        <!-- Name Edit Mode -->
        <template v-if="isEditingName">
          <div class="device-header-bar__name-edit" data-no-drag>
            <input
              ref="nameInputRef"
              v-model="editedName"
              type="text"
              class="device-header-bar__name-input"
              placeholder="Gerätename..."
              :disabled="isSavingName"
              @keydown="handleNameKeydown"
              @blur="handleSaveName"
              @click.stop
            />
            <div class="device-header-bar__name-actions">
              <button v-if="isSavingName" class="device-header-bar__name-btn" disabled>
                <Loader2 class="w-3 h-3 animate-spin" />
              </button>
              <template v-else>
                <button class="device-header-bar__name-btn device-header-bar__name-btn--save" title="Speichern" @mousedown.prevent="handleSaveName">
                  <Check class="w-3 h-3" />
                </button>
                <button class="device-header-bar__name-btn device-header-bar__name-btn--cancel" title="Abbrechen" @mousedown.prevent="cancelEditName">
                  <X class="w-3 h-3" />
                </button>
              </template>
            </div>
          </div>
        </template>

        <!-- Name Display Mode -->
        <template v-else>
          <div
            class="device-header-bar__name-display"
            :title="displayName ? `${displayName}\n(Doppelklick zum Bearbeiten)` : 'Doppelklick zum Bearbeiten'"
            @dblclick.stop="startEditName"
          >
            <h3 :class="['device-header-bar__title', { 'device-header-bar__title--empty': !displayName }]">
              {{ displayName || 'Unbenannt' }}
            </h3>
            <Pencil class="device-header-bar__pencil w-3 h-3" />
          </div>
        </template>

        <!-- Settings -->
        <button class="device-header-bar__settings-btn" title="Einstellungen" @click.stop="handleSettingsClick">
          <Settings2 class="w-4 h-4" />
        </button>
      </div>

      <!-- Error -->
      <span v-if="saveError" class="device-header-bar__error">{{ saveError }}</span>

      <!-- Info Row -->
      <div class="device-header-bar__info-row">
        <Badge :variant="isMock ? 'mock' : 'real'" size="xs">
          {{ isMock ? 'Simuliert' : 'Hardware' }}
        </Badge>
        <span class="device-header-bar__id">{{ espId }}</span>
        <Badge
          :variant="(stateInfo.variant as any)"
          :pulse="isOnline && (systemState === 'OPERATIONAL' || device.status === 'online')"
          dot
          size="xs"
        >
          {{ stateInfo.label }}
        </Badge>
        <!-- WiFi Signal -->
        <div class="device-header-bar__wifi" :title="wifiTooltip">
          <div :class="['device-header-bar__wifi-bars', wifiColorClass]">
            <span :class="['device-header-bar__wifi-bar', { active: wifiInfo.bars >= 1 }]" />
            <span :class="['device-header-bar__wifi-bar', { active: wifiInfo.bars >= 2 }]" />
            <span :class="['device-header-bar__wifi-bar', { active: wifiInfo.bars >= 3 }]" />
            <span :class="['device-header-bar__wifi-bar', { active: wifiInfo.bars >= 4 }]" />
          </div>
          <span :class="['device-header-bar__wifi-label', wifiColorClass]">{{ wifiInfo.label }}</span>
        </div>
      </div>

      <!-- Zone -->
      <ZoneAssignmentDropdown
        :device="device"
        :zones="availableZones"
        @zone-changed="handleZoneChanged"
      />

      <!-- Heartbeat -->
      <button
        :class="[
          'device-header-bar__heartbeat',
          { 'device-header-bar__heartbeat--fresh': isHeartbeatFresh },
          { 'device-header-bar__heartbeat--mock': isMock }
        ]"
        :title="heartbeatTooltip"
        :disabled="heartbeatLoading"
        @click.stop="handleHeartbeatClick"
      >
        <Heart :class="['w-3 h-3', isHeartbeatFresh ? 'device-header-bar__heart-pulse' : '']" />
        <span class="device-header-bar__heartbeat-text">
          {{ actions.heartbeatText.value }}
        </span>
        <Loader2 v-if="heartbeatLoading" class="w-3 h-3 animate-spin" />
      </button>
    </div>

    <!-- Slot for additional content (e.g. AnalysisDropZone) -->
    <slot />
  </div>
</template>

<style scoped>
.device-header-bar {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md, 0.625rem);
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.device-header-bar--mock {
  border-left: 3px solid var(--color-mock, #a78bfa);
}

.device-header-bar--real {
  border-left: 3px solid var(--color-real, #22d3ee);
}

.device-header-bar:hover {
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.12));
}

.device-header-bar__header {
  padding: 0.625rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  cursor: grab;
}

.device-header-bar__header:active {
  cursor: grabbing;
}

/* Top row: name + settings */
.device-header-bar__top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem;
  min-height: 1.5rem;
}

/* Name display */
.device-header-bar__name-display {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
  cursor: text;
}

.device-header-bar__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
  line-height: 1.2;
}

.device-header-bar__title--empty {
  color: var(--color-text-muted);
  font-style: italic;
}

.device-header-bar__pencil {
  opacity: 0;
  color: var(--color-text-muted);
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.device-header-bar__name-display:hover .device-header-bar__pencil {
  opacity: 0.6;
}

/* Name edit mode */
.device-header-bar__name-edit {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.device-header-bar__name-input {
  flex: 1;
  min-width: 0;
  padding: 0.125rem 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-iridescent-1);
  border-radius: 0.25rem;
  outline: none;
}

.device-header-bar__name-actions {
  display: flex;
  gap: 0.125rem;
}

.device-header-bar__name-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.25rem;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  background: transparent;
  transition: all 0.1s;
}

.device-header-bar__name-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.device-header-bar__name-btn--save { color: var(--color-success); }
.device-header-bar__name-btn--cancel { color: var(--color-error); }

.device-header-bar__error {
  font-size: 0.625rem;
  color: var(--color-error);
}

/* Settings button */
.device-header-bar__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  background: transparent;
  transition: all 0.15s;
  flex-shrink: 0;
}

.device-header-bar__settings-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

/* Info row */
.device-header-bar__info-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.device-header-bar__id {
  font-size: 0.625rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  opacity: 0.7;
}

/* WiFi */
.device-header-bar__wifi {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
}

.device-header-bar__wifi-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 0.75rem;
}

.device-header-bar__wifi-bar {
  width: 3px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.1);
  transition: background 0.2s;
}

.device-header-bar__wifi-bar:nth-child(1) { height: 25%; }
.device-header-bar__wifi-bar:nth-child(2) { height: 50%; }
.device-header-bar__wifi-bar:nth-child(3) { height: 75%; }
.device-header-bar__wifi-bar:nth-child(4) { height: 100%; }

.device-header-bar__wifi-bar.active { background: currentColor; }

.wifi--good { color: var(--color-success); }
.wifi--fair { color: var(--color-warning); }
.wifi--poor { color: var(--color-error); }

.device-header-bar__wifi-label {
  font-size: 0.5625rem;
  font-family: 'JetBrains Mono', monospace;
}

/* Heartbeat */
.device-header-bar__heartbeat {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  cursor: default;
  transition: all 0.15s;
  width: 100%;
}

.device-header-bar__heartbeat--mock {
  cursor: pointer;
}

.device-header-bar__heartbeat--mock:hover:not(:disabled) {
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(248, 113, 113, 0.05);
}

.device-header-bar__heartbeat--fresh {
  color: var(--color-success);
  border-color: rgba(52, 211, 153, 0.2);
}

.device-header-bar__heartbeat-text {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
}

.device-header-bar__heart-pulse {
  animation: heart-beat 1.5s ease-in-out infinite;
}

@keyframes heart-beat {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}
</style>
