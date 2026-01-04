<script setup lang="ts">
/**
 * ESPSettingsPopover Component
 *
 * A floating settings panel that appears over the ESP card in the dashboard.
 * Provides access to device settings, status info, and actions without
 * navigating away from the dashboard.
 *
 * Features:
 * - Device identification (name, ESP-ID, type)
 * - Status overview (online status, WiFi, heap, heartbeat)
 * - Zone information display
 * - Mock-specific controls (manual heartbeat)
 * - Danger zone (delete device)
 *
 * Phase 2 of Dashboard ESP-Card Consolidation
 */

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  X,
  Heart,
  Wifi,
  HardDrive,
  Clock,
  MapPin,
  Trash2,
  Loader2,
  AlertTriangle,
  Info,
  Settings2,
  Pencil,
  Check,
  Timer,
} from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import ZoneAssignmentPanel from '@/components/zones/ZoneAssignmentPanel.vue'
import { espApi, type ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { getWifiStrength, type WifiStrengthInfo } from '@/utils/wifiStrength'
import { formatRelativeTime, formatUptimeShort, formatHeapSize } from '@/utils/formatters'

interface Props {
  /** The ESP device data */
  device: ESPDevice
  /** Whether the popover is open */
  isOpen: boolean
  /** Reference element for positioning (optional) */
  anchorRef?: HTMLElement | null
}

const props = withDefaults(defineProps<Props>(), {
  anchorRef: null,
})

const emit = defineEmits<{
  /** Close the popover */
  close: []
  /** v-model support for isOpen */
  'update:isOpen': [value: boolean]
  /** Name was updated */
  'name-updated': [payload: { deviceId: string; name: string }]
  /** Zone was updated */
  'zone-updated': [payload: { deviceId: string; zoneId: string; zoneName: string }]
  /** Device was deleted */
  deleted: [payload: { deviceId: string }]
  /** Heartbeat was triggered (Mock only) */
  'heartbeat-triggered': [payload: { deviceId: string }]
}>()

// =============================================================================
// REFS & STORE
// =============================================================================

const espStore = useEspStore()
const popoverRef = ref<HTMLElement | null>(null)

// Loading states
const heartbeatLoading = ref(false)
const deleteLoading = ref(false)
const showDeleteConfirm = ref(false)

// Name editing state (Phase 3)
const isEditingName = ref(false)
const editedName = ref('')
const isSavingName = ref(false)
const saveError = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

// Zone error state (Phase 4)
const zoneError = ref('')

// Auto-Heartbeat state (Phase 5)
const autoHeartbeatEnabled = ref(false)
const autoHeartbeatInterval = ref(60)
const autoHeartbeatLoading = ref(false)

// =============================================================================
// COMPUTED
// =============================================================================

const espId = computed(() => props.device?.device_id || props.device?.esp_id || '')

const isMock = computed(() => espApi.isMockEsp(espId.value))

const isOnline = computed(() =>
  props.device?.status === 'online' || props.device?.connected === true
)

const displayName = computed(() => props.device?.name || espId.value)

const deviceType = computed(() => {
  if (isMock.value) {
    return (props.device as any).hardware_type || 'MOCK_ESP32_WROOM'
  }
  return props.device?.hardware_type || 'ESP32'
})

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

/** Check if heartbeat is "fresh" (< 30 seconds ago) */
const isHeartbeatFresh = computed(() => {
  const timestamp = props.device?.last_heartbeat || props.device?.last_seen
  if (!timestamp) return false

  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  return diffSec >= 0 && diffSec < 30
})

/** Uptime display */
const uptimeDisplay = computed(() => {
  if (props.device?.uptime === undefined) return null
  return formatUptimeShort(props.device.uptime)
})

/** Heap display */
const heapDisplay = computed(() => {
  if (props.device?.heap_free === undefined) return null
  return formatHeapSize(props.device.heap_free)
})

/** Zone display */
const zoneDisplay = computed(() => {
  return props.device?.zone_name || props.device?.zone_id || null
})

// =============================================================================
// METHODS
// =============================================================================

function close() {
  emit('update:isOpen', false)
  emit('close')
  showDeleteConfirm.value = false
}

function handleOverlayClick(event: MouseEvent) {
  // Only close if clicking directly on the overlay, not on popover content
  if (event.target === event.currentTarget) {
    close()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.isOpen) {
    close()
  }
}

/**
 * Trigger heartbeat for Mock ESP
 */
async function handleHeartbeat() {
  if (!isMock.value || heartbeatLoading.value) return

  heartbeatLoading.value = true
  try {
    await espStore.triggerHeartbeat(espId.value)
    emit('heartbeat-triggered', { deviceId: espId.value })
  } catch (err) {
    console.error('[ESPSettingsPopover] Failed to trigger heartbeat:', err)
  } finally {
    // Short delay so user sees the loading state
    setTimeout(() => {
      heartbeatLoading.value = false
    }, 500)
  }
}

/**
 * Delete device with confirmation
 */
async function handleDelete() {
  if (deleteLoading.value) return

  deleteLoading.value = true
  try {
    await espStore.deleteDevice(espId.value)
    emit('deleted', { deviceId: espId.value })
    close()
  } catch (err) {
    console.error('[ESPSettingsPopover] Failed to delete device:', err)
  } finally {
    deleteLoading.value = false
  }
}

// =============================================================================
// NAME EDITING (Phase 3)
// =============================================================================

/**
 * Start editing the device name
 */
function startEditName() {
  editedName.value = props.device?.name || ''
  isEditingName.value = true
  saveError.value = ''
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

/**
 * Cancel name editing
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

  // No change? Just close edit mode
  if (newName === (props.device?.name || null)) {
    cancelEditName()
    return
  }

  isSavingName.value = true
  saveError.value = ''

  try {
    await espStore.updateDevice(deviceId, { name: newName || undefined })
    isEditingName.value = false
    emit('name-updated', { deviceId, name: newName || '' })
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    saveError.value = axiosError.response?.data?.detail || 'Fehler beim Speichern'
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
// ZONE MANAGEMENT (Phase 4)
// =============================================================================

/**
 * Handle zone update from ZoneAssignmentPanel
 */
function handleZoneUpdated(zoneData: { zone_id: string; zone_name?: string; master_zone_id?: string }) {
  zoneError.value = ''
  emit('zone-updated', {
    deviceId: espId.value,
    zoneId: zoneData.zone_id,
    zoneName: zoneData.zone_name || zoneData.zone_id,
  })
}

/**
 * Handle zone error from ZoneAssignmentPanel
 */
function handleZoneError(error: string) {
  zoneError.value = error
  // Auto-clear after 5 seconds
  setTimeout(() => {
    zoneError.value = ''
  }, 5000)
}

// =============================================================================
// AUTO-HEARTBEAT MANAGEMENT (Phase 5)
// =============================================================================

/**
 * Toggle auto-heartbeat for Mock ESP
 */
async function handleAutoHeartbeatToggle() {
  if (!isMock.value || autoHeartbeatLoading.value) return

  autoHeartbeatLoading.value = true
  const newEnabled = !autoHeartbeatEnabled.value

  try {
    await espStore.setAutoHeartbeat(
      espId.value,
      newEnabled,
      autoHeartbeatInterval.value
    )
    autoHeartbeatEnabled.value = newEnabled
  } catch (err) {
    console.error('[ESPSettingsPopover] Failed to toggle auto-heartbeat:', err)
    // Revert on error
    autoHeartbeatEnabled.value = !newEnabled
  } finally {
    autoHeartbeatLoading.value = false
  }
}

/**
 * Update auto-heartbeat interval
 */
async function handleIntervalChange() {
  if (!isMock.value || !autoHeartbeatEnabled.value || autoHeartbeatLoading.value) return

  // Validate interval (min 10, max 300)
  const interval = Math.max(10, Math.min(300, autoHeartbeatInterval.value))
  autoHeartbeatInterval.value = interval

  autoHeartbeatLoading.value = true

  try {
    await espStore.setAutoHeartbeat(espId.value, true, interval)
  } catch (err) {
    console.error('[ESPSettingsPopover] Failed to update interval:', err)
  } finally {
    autoHeartbeatLoading.value = false
  }
}

// =============================================================================
// LIFECYCLE
// =============================================================================

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// Focus management when opening
watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      showDeleteConfirm.value = false
      // Sync auto-heartbeat state from device (Phase 5)
      autoHeartbeatEnabled.value = (props.device as any)?.auto_heartbeat ?? false
      nextTick(() => {
        popoverRef.value?.focus()
      })
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="popover">
      <div
        v-if="isOpen"
        class="popover-overlay"
        @click="handleOverlayClick"
      >
        <div
          ref="popoverRef"
          class="popover-content"
          tabindex="-1"
          @click.stop
        >
          <!-- Header -->
          <div class="popover-header">
            <div class="popover-header__title-group">
              <Settings2 class="w-5 h-5 text-iridescent" />
              <h3 class="popover-header__title">Geräte-Einstellungen</h3>
            </div>
            <button
              class="popover-close-btn"
              aria-label="Schließen"
              @click="close"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Body -->
          <div class="popover-body">
            <!-- IDENTIFICATION Section -->
            <section class="popover-section">
              <h4 class="popover-section__title">Identifikation</h4>
              <div class="popover-section__content">
                <!-- Name (Editable - Phase 3) -->
                <div class="info-row info-row--name">
                  <span class="info-row__label">Name</span>

                  <!-- Edit Mode -->
                  <template v-if="isEditingName">
                    <div class="name-edit">
                      <input
                        ref="nameInputRef"
                        v-model="editedName"
                        type="text"
                        class="name-edit__input"
                        placeholder="Gerätename eingeben..."
                        :disabled="isSavingName"
                        @keydown="handleNameKeydown"
                        @blur="saveName"
                      />
                      <div class="name-edit__actions">
                        <button
                          v-if="isSavingName"
                          class="name-edit__btn"
                          disabled
                        >
                          <Loader2 class="w-4 h-4 animate-spin" />
                        </button>
                        <template v-else>
                          <button
                            class="name-edit__btn name-edit__btn--save"
                            title="Speichern (Enter)"
                            @mousedown.prevent="saveName"
                          >
                            <Check class="w-4 h-4" />
                          </button>
                          <button
                            class="name-edit__btn name-edit__btn--cancel"
                            title="Abbrechen (Escape)"
                            @mousedown.prevent="cancelEditName"
                          >
                            <X class="w-4 h-4" />
                          </button>
                        </template>
                      </div>
                    </div>
                  </template>

                  <!-- Display Mode -->
                  <template v-else>
                    <div
                      class="name-display"
                      title="Klicken zum Bearbeiten"
                      @click="startEditName"
                    >
                      <span :class="['info-row__value info-row__value--name', { 'info-row__value--empty': !displayName }]">
                        {{ displayName || 'Unbenannt' }}
                      </span>
                      <Pencil class="name-display__pencil w-4 h-4" />
                    </div>
                  </template>
                </div>

                <!-- Name Error Message -->
                <div v-if="saveError" class="name-edit__error">
                  {{ saveError }}
                </div>

                <!-- ESP-ID -->
                <div class="info-row">
                  <span class="info-row__label">ESP-ID</span>
                  <code class="info-row__value info-row__value--mono">{{ espId }}</code>
                </div>

                <!-- Type -->
                <div class="info-row">
                  <span class="info-row__label">Typ</span>
                  <div class="info-row__value">
                    <Badge :variant="isMock ? 'mock' : 'real'" size="sm">
                      {{ isMock ? 'MOCK' : 'REAL' }}
                    </Badge>
                    <span class="text-muted text-sm ml-2">{{ deviceType }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- STATUS Section -->
            <section class="popover-section">
              <h4 class="popover-section__title">Status</h4>
              <div class="popover-section__content">
                <!-- Online Status -->
                <div class="info-row">
                  <span class="info-row__label">Verbindung</span>
                  <Badge
                    :variant="isOnline ? 'success' : 'gray'"
                    :pulse="isOnline"
                    dot
                    size="sm"
                  >
                    {{ isOnline ? 'Online' : 'Offline' }}
                  </Badge>
                </div>

                <!-- WiFi Signal -->
                <div class="info-row">
                  <span class="info-row__label">
                    <Wifi class="w-4 h-4 inline mr-1" />
                    WiFi
                  </span>
                  <div class="info-row__value wifi-display">
                    <!-- WiFi Bars -->
                    <div :class="['wifi-bars', wifiColorClass]">
                      <span :class="['wifi-bar', { active: wifiInfo.bars >= 1 }]" />
                      <span :class="['wifi-bar', { active: wifiInfo.bars >= 2 }]" />
                      <span :class="['wifi-bar', { active: wifiInfo.bars >= 3 }]" />
                      <span :class="['wifi-bar', { active: wifiInfo.bars >= 4 }]" />
                    </div>
                    <span :class="wifiColorClass">{{ wifiInfo.label }}</span>
                    <span v-if="device.wifi_rssi" class="text-muted text-xs ml-1">
                      ({{ device.wifi_rssi }} dBm)
                    </span>
                  </div>
                </div>

                <!-- Heap Memory -->
                <div v-if="heapDisplay" class="info-row">
                  <span class="info-row__label">
                    <HardDrive class="w-4 h-4 inline mr-1" />
                    Speicher
                  </span>
                  <span class="info-row__value">{{ heapDisplay }} frei</span>
                </div>

                <!-- Uptime -->
                <div v-if="uptimeDisplay" class="info-row">
                  <span class="info-row__label">
                    <Clock class="w-4 h-4 inline mr-1" />
                    Uptime
                  </span>
                  <span class="info-row__value">{{ uptimeDisplay }}</span>
                </div>

                <!-- Last Heartbeat -->
                <div class="info-row">
                  <span class="info-row__label">
                    <Heart class="w-4 h-4 inline mr-1" />
                    Heartbeat
                  </span>
                  <span :class="['info-row__value', isHeartbeatFresh ? 'text-success' : '']">
                    {{ formatRelativeTime(device.last_heartbeat || device.last_seen || '') }}
                  </span>
                </div>
              </div>
            </section>

            <!-- ZONE Section (Phase 4) -->
            <section class="popover-section">
              <h4 class="popover-section__title">
                <MapPin class="w-4 h-4 inline mr-1" />
                Zone
              </h4>
              <div class="popover-section__content">
                <!-- Current zone display -->
                <div v-if="zoneDisplay" class="info-row info-row--zone-current">
                  <span class="info-row__label">Aktuell</span>
                  <Badge variant="success" size="sm">
                    {{ zoneDisplay }}
                  </Badge>
                </div>

                <!-- Zone Assignment Panel (compact mode) -->
                <ZoneAssignmentPanel
                  :esp-id="espId"
                  :current-zone-id="device.zone_id ?? undefined"
                  :current-zone-name="device.zone_name ?? undefined"
                  :current-master-zone-id="device.master_zone_id ?? undefined"
                  :is-mock="isMock"
                  compact
                  @zone-updated="handleZoneUpdated"
                  @zone-error="handleZoneError"
                />

                <p class="text-muted text-xs mt-2">
                  <Info class="w-3 h-3 inline mr-1" />
                  Zone kann auch via Drag & Drop im Dashboard geändert werden.
                </p>
              </div>
            </section>

            <!-- MOCK CONTROLS Section (only for Mock ESPs) -->
            <section v-if="isMock" class="popover-section popover-section--mock">
              <h4 class="popover-section__title">Mock-Steuerung</h4>
              <div class="popover-section__content">
                <!-- Manual Heartbeat Button -->
                <button
                  class="action-btn action-btn--heartbeat"
                  :disabled="heartbeatLoading"
                  @click="handleHeartbeat"
                >
                  <Loader2 v-if="heartbeatLoading" class="w-4 h-4 animate-spin" />
                  <Heart v-else class="w-4 h-4" />
                  <span>{{ heartbeatLoading ? 'Wird gesendet...' : 'Heartbeat senden' }}</span>
                </button>

                <!-- Auto-Heartbeat Toggle (Phase 5) -->
                <div class="auto-heartbeat">
                  <div class="auto-heartbeat__row">
                    <div class="auto-heartbeat__label">
                      <Timer class="w-4 h-4" />
                      <span>Automatische Heartbeats</span>
                    </div>
                    <button
                      :class="[
                        'auto-heartbeat__toggle',
                        { 'auto-heartbeat__toggle--active': autoHeartbeatEnabled }
                      ]"
                      :disabled="autoHeartbeatLoading"
                      @click="handleAutoHeartbeatToggle"
                    >
                      <span class="auto-heartbeat__toggle-knob" />
                    </button>
                  </div>

                  <!-- Interval Input (visible when enabled) -->
                  <Transition name="slide-fade">
                    <div v-if="autoHeartbeatEnabled" class="auto-heartbeat__interval">
                      <label class="auto-heartbeat__interval-label">
                        Intervall:
                        <input
                          v-model.number="autoHeartbeatInterval"
                          type="number"
                          min="10"
                          max="300"
                          class="auto-heartbeat__interval-input"
                          :disabled="autoHeartbeatLoading"
                          @change="handleIntervalChange"
                        />
                        <span class="auto-heartbeat__interval-unit">Sek.</span>
                      </label>
                      <Loader2 v-if="autoHeartbeatLoading" class="w-3 h-3 animate-spin text-muted" />
                    </div>
                  </Transition>
                </div>

                <p class="text-muted text-xs mt-2">
                  <template v-if="autoHeartbeatEnabled">
                    Heartbeats werden automatisch alle {{ autoHeartbeatInterval }} Sekunden gesendet.
                  </template>
                  <template v-else>
                    Mock ESPs senden keine automatischen Heartbeats.
                    Aktiviere diese Option für regelmäßige Updates.
                  </template>
                </p>
              </div>
            </section>

            <!-- REAL ESP INFO (only for Real ESPs) -->
            <section v-if="!isMock" class="popover-section popover-section--info">
              <h4 class="popover-section__title">Geräteinformation</h4>
              <div class="popover-section__content">
                <p class="text-muted text-sm">
                  <Info class="w-4 h-4 inline mr-1" />
                  Dieses Gerät sendet automatisch alle 60 Sekunden einen Heartbeat.
                  Sensor- und Aktor-Daten werden in Echtzeit über MQTT synchronisiert.
                </p>
              </div>
            </section>

            <!-- DANGER ZONE -->
            <section class="popover-section popover-section--danger">
              <h4 class="popover-section__title">
                <AlertTriangle class="w-4 h-4 inline mr-1" />
                Gefahrenzone
              </h4>
              <div class="popover-section__content">
                <!-- Confirmation Step -->
                <div v-if="showDeleteConfirm" class="delete-confirm">
                  <p class="delete-confirm__text">
                    Möchtest du <strong>{{ displayName }}</strong> wirklich löschen?
                  </p>
                  <p v-if="isMock" class="delete-confirm__detail">
                    Der simulierte ESP wird vollständig entfernt.
                  </p>
                  <p v-else class="delete-confirm__detail">
                    Das Gerät und alle zugehörigen Sensoren/Aktoren werden aus der Datenbank entfernt.
                  </p>
                  <div class="delete-confirm__actions">
                    <button
                      class="action-btn action-btn--secondary"
                      @click="showDeleteConfirm = false"
                    >
                      Abbrechen
                    </button>
                    <button
                      class="action-btn action-btn--delete"
                      :disabled="deleteLoading"
                      @click="handleDelete"
                    >
                      <Loader2 v-if="deleteLoading" class="w-4 h-4 animate-spin" />
                      <Trash2 v-else class="w-4 h-4" />
                      <span>Endgültig löschen</span>
                    </button>
                  </div>
                </div>

                <!-- Initial Delete Button -->
                <button
                  v-else
                  class="action-btn action-btn--danger-outline"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="w-4 h-4" />
                  <span>Gerät löschen</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* =============================================================================
   OVERLAY
   ============================================================================= */

.popover-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: rgba(10, 10, 15, 0.6);
  backdrop-filter: blur(2px);
}

/* =============================================================================
   POPOVER CONTENT
   ============================================================================= */

.popover-content {
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4),
              0 0 1px rgba(255, 255, 255, 0.1) inset;
  overflow: hidden;
  outline: none;
}

/* =============================================================================
   HEADER
   ============================================================================= */

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.popover-header__title-group {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.popover-header__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.popover-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.popover-close-btn:hover {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

/* =============================================================================
   BODY
   ============================================================================= */

.popover-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* =============================================================================
   SECTIONS
   ============================================================================= */

.popover-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.popover-section__title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--glass-border);
}

.popover-section__content {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

/* Section variants */
.popover-section--mock {
  background-color: rgba(168, 85, 247, 0.04);
  border: 1px solid rgba(168, 85, 247, 0.15);
  border-radius: 0.5rem;
  padding: 0.875rem;
}

.popover-section--mock .popover-section__title {
  color: var(--color-mock);
  border-color: rgba(168, 85, 247, 0.2);
}

.popover-section--info {
  background-color: rgba(96, 165, 250, 0.04);
  border: 1px solid rgba(96, 165, 250, 0.15);
  border-radius: 0.5rem;
  padding: 0.875rem;
}

.popover-section--info .popover-section__title {
  color: var(--color-info);
  border-color: rgba(96, 165, 250, 0.2);
}

.popover-section--danger {
  background-color: rgba(239, 68, 68, 0.04);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 0.5rem;
  padding: 0.875rem;
}

.popover-section--danger .popover-section__title {
  color: var(--color-error);
  border-color: rgba(239, 68, 68, 0.2);
}

/* =============================================================================
   INFO ROWS
   ============================================================================= */

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 28px;
}

.info-row__label {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.info-row__value {
  font-size: 0.8125rem;
  color: var(--color-text-primary);
  font-weight: 500;
  text-align: right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.info-row__value--name {
  font-weight: 600;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-row__value--empty {
  color: var(--color-text-muted);
  font-style: italic;
  font-weight: 400;
}

/* =============================================================================
   NAME EDITING (Phase 3)
   ============================================================================= */

.info-row--name {
  flex-wrap: wrap;
}

.name-display {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  margin: -0.25rem -0.5rem;
  border-radius: 0.375rem;
  transition: background-color 0.15s ease;
}

.name-display:hover {
  background-color: var(--glass-bg);
}

.name-display:hover .name-display__pencil {
  opacity: 1;
}

.name-display__pencil {
  color: var(--color-text-muted);
  opacity: 0.3;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.name-edit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.name-edit__input {
  flex: 1;
  min-width: 0;
  padding: 0.375rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  background-color: transparent;
  border: none;
  border-bottom: 2px solid var(--color-iridescent-1);
  outline: none;
  font-family: inherit;
}

.name-edit__input::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}

.name-edit__input:disabled {
  opacity: 0.6;
}

.name-edit__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.name-edit__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 0.375rem;
  background-color: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.name-edit__btn:hover:not(:disabled) {
  background-color: var(--glass-bg);
}

.name-edit__btn:disabled {
  cursor: not-allowed;
}

.name-edit__btn--save:hover:not(:disabled) {
  color: var(--color-success);
  background-color: rgba(34, 197, 94, 0.1);
}

.name-edit__btn--cancel:hover:not(:disabled) {
  color: var(--color-error);
  background-color: rgba(239, 68, 68, 0.1);
}

.name-edit__error {
  width: 100%;
  font-size: 0.75rem;
  color: var(--color-error);
  margin-top: 0.25rem;
}

.info-row__value--mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  background-color: var(--color-bg-tertiary);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.info-row--zone-current {
  padding-bottom: 0.625rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--glass-border);
}

/* =============================================================================
   WIFI DISPLAY
   ============================================================================= */

.wifi-display {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.wifi-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.wifi-bar {
  width: 3px;
  background-color: var(--color-text-muted);
  border-radius: 1px;
  opacity: 0.25;
  transition: opacity 0.2s ease, background-color 0.2s ease;
}

.wifi-bar:nth-child(1) { height: 3px; }
.wifi-bar:nth-child(2) { height: 6px; }
.wifi-bar:nth-child(3) { height: 9px; }
.wifi-bar:nth-child(4) { height: 12px; }

.wifi-bar.active {
  opacity: 1;
  background-color: currentColor;
}

/* =============================================================================
   ACTION BUTTONS
   ============================================================================= */

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  width: 100%;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn--heartbeat {
  background: linear-gradient(135deg, rgba(244, 114, 182, 0.15), rgba(168, 85, 247, 0.1));
  border: 1px solid rgba(244, 114, 182, 0.3);
  color: #f472b6;
}

.action-btn--heartbeat:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(244, 114, 182, 0.25), rgba(168, 85, 247, 0.15));
  border-color: rgba(244, 114, 182, 0.5);
  transform: translateY(-1px);
}

.action-btn--danger-outline {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--color-error);
}

.action-btn--danger-outline:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.5);
}

.action-btn--delete {
  background: var(--color-error);
  border: none;
  color: white;
}

.action-btn--delete:hover:not(:disabled) {
  background: #dc2626;
  transform: translateY(-1px);
}

.action-btn--secondary {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  color: var(--color-text-secondary);
}

.action-btn--secondary:hover:not(:disabled) {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* =============================================================================
   DELETE CONFIRMATION
   ============================================================================= */

.delete-confirm {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.delete-confirm__text {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  margin: 0;
}

.delete-confirm__detail {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0;
}

.delete-confirm__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.delete-confirm__actions .action-btn {
  flex: 1;
}

/* =============================================================================
   AUTO-HEARTBEAT (Phase 5)
   ============================================================================= */

.auto-heartbeat {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem;
  background-color: rgba(168, 85, 247, 0.06);
  border: 1px solid rgba(168, 85, 247, 0.15);
  border-radius: 0.5rem;
  margin-top: 0.5rem;
}

.auto-heartbeat__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.auto-heartbeat__label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

/* Toggle Switch */
.auto-heartbeat__toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.auto-heartbeat__toggle:hover:not(:disabled) {
  border-color: rgba(168, 85, 247, 0.4);
}

.auto-heartbeat__toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auto-heartbeat__toggle--active {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(139, 92, 246, 0.3));
  border-color: rgba(168, 85, 247, 0.5);
}

.auto-heartbeat__toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background-color: var(--color-text-muted);
  border-radius: 50%;
  transition: all 0.2s ease;
}

.auto-heartbeat__toggle--active .auto-heartbeat__toggle-knob {
  left: calc(100% - 20px);
  background-color: #a78bfa;
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.5);
}

/* Interval Input */
.auto-heartbeat__interval {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.auto-heartbeat__interval-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.auto-heartbeat__interval-input {
  width: 60px;
  padding: 0.25rem 0.375rem;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.25rem;
  text-align: center;
}

.auto-heartbeat__interval-input:focus {
  outline: none;
  border-color: var(--color-iridescent-1);
}

.auto-heartbeat__interval-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auto-heartbeat__interval-unit {
  color: var(--color-text-muted);
}

/* Slide-fade transition for interval */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* =============================================================================
   COLOR UTILITIES
   ============================================================================= */

.text-iridescent {
  color: var(--color-iridescent-1);
}

.text-success {
  color: var(--color-success);
}

.text-muted {
  color: var(--color-text-muted);
}

.text-emerald-400 { color: #34d399; }
.text-yellow-400 { color: #facc15; }
.text-orange-400 { color: #fb923c; }
.text-red-400 { color: #f87171; }
.text-slate-500 { color: #64748b; }

.text-sm { font-size: 0.8125rem; }
.text-xs { font-size: 0.75rem; }
.ml-1 { margin-left: 0.25rem; }
.ml-2 { margin-left: 0.5rem; }
.mt-2 { margin-top: 0.5rem; }

/* =============================================================================
   TRANSITIONS
   ============================================================================= */

.popover-enter-active,
.popover-leave-active {
  transition: opacity 0.2s ease;
}

.popover-enter-active .popover-content,
.popover-leave-active .popover-content {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
}

.popover-enter-from .popover-content,
.popover-leave-to .popover-content {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

/* =============================================================================
   RESPONSIVE
   ============================================================================= */

@media (max-width: 480px) {
  .popover-content {
    max-width: 100%;
    max-height: 90vh;
    border-radius: 1rem 1rem 0 0;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
  }

  .popover-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .popover-enter-from .popover-content,
  .popover-leave-to .popover-content {
    transform: translateY(100%);
  }
}
</style>
