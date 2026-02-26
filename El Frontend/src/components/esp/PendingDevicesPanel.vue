<script setup lang="ts">
/**
 * PendingDevicesPanel
 *
 * Unified popover component for:
 * - Pending (unapproved) ESP devices list
 * - Info/Guide tab for connecting real ESP32 devices
 *
 * Features:
 * - Tab navigation (Pending / Info)
 * - Human-readable signal strength
 * - "Time ago" display for discovery timestamp
 * - Approve/Reject buttons with loading states
 * - Anchor-based positioning (attaches to trigger button)
 */

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useScrollLock } from '@/composables/useScrollLock'
import { X, Check, Ban, Wifi, Clock, MapPin, Info, Loader2, Radio, Settings2 } from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'
import { useZoneDragDrop, ZONE_UNASSIGNED } from '@/composables/useZoneDragDrop'
import { getESPStatus } from '@/composables/useESPStatus'
import { getWifiStrength } from '@/utils/wifiStrength'
import RejectDeviceModal from '@/components/modals/RejectDeviceModal.vue'
import type { PendingESPDevice } from '@/types'
import type { ESPDevice } from '@/api/esp'

interface Props {
  isOpen: boolean
  anchorEl?: HTMLElement | null
}

const props = withDefaults(defineProps<Props>(), {
  anchorEl: null
})

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  close: []
  'open-esp-config': [device: ESPDevice]
}>()

const espStore = useEspStore()
const { groupDevicesByZone } = useZoneDragDrop()
const panelRef = ref<HTMLElement | null>(null)

// Tab state
type TabType = 'pending' | 'devices' | 'info'
const activeTab = ref<TabType>('devices')

// Configured ESPs grouped by zone (for "Geräte" tab)
const zoneGroups = computed(() => {
  const devices = espStore.devices ?? []
  const groups = groupDevicesByZone(devices)
  return groups.filter(g => g.zoneId !== ZONE_UNASSIGNED)
})

// Loading states for individual devices
const approvingDevices = ref<Set<string>>(new Set())
const rejectingDevices = ref<Set<string>>(new Set())

// Reject modal state
const rejectModalOpen = ref(false)
const rejectTargetDevice = ref<PendingESPDevice | null>(null)

// Reference-counted scroll lock
const scrollLock = useScrollLock()

// Escape key handler
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

// Fetch pending devices when panel opens
watch(() => props.isOpen, (open) => {
  if (open) {
    scrollLock.lock()
    espStore.fetchPendingDevices()
    nextTick(updatePosition)
    // Re-run after layout (offsetWidth can be 0 on first paint)
    requestAnimationFrame(() => requestAnimationFrame(updatePosition))
  } else {
    scrollLock.unlock()
  }
})

onMounted(() => {
  if (props.isOpen) {
    scrollLock.lock()
    espStore.fetchPendingDevices()
    nextTick(updatePosition)
  }
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('keydown', handleKeydown)
  scrollLock.unlock()
})

// Watch for anchor changes
watch(() => props.anchorEl, () => nextTick(updatePosition))

// Position panel relative to anchor element, or use fallback when anchor is null
function updatePosition() {
  if (!panelRef.value || !props.isOpen) return

  const panel = panelRef.value
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  if (props.anchorEl) {
    // Position below the button, right-aligned
    const anchor = props.anchorEl.getBoundingClientRect()
    let top = anchor.bottom + 8
    let left = anchor.right - panel.offsetWidth

    // Viewport boundary checks
    if (left < 16) left = 16
    if (left + panel.offsetWidth > viewportWidth - 16) {
      left = viewportWidth - panel.offsetWidth - 16
    }

    // If not enough space below, position above
    if (top + panel.offsetHeight > viewportHeight - 16) {
      top = anchor.top - panel.offsetHeight - 8
    }

    panel.style.right = 'auto'
    panel.style.top = `${top}px`
    panel.style.left = `${left}px`
  } else {
    // Fallback when no anchor (e.g. triggered from TopBar): top-right below header
    const HEADER_OFFSET = 72
    const panelH = panel.offsetHeight || 320
    let top = HEADER_OFFSET + 8

    if (top + panelH > viewportHeight - 16) {
      top = Math.max(16, viewportHeight - panelH - 16)
    }

    panel.style.left = 'auto'
    panel.style.right = '16px'
    panel.style.top = `${top}px`
  }
}

// Computed
const pendingDevices = computed(() => espStore.pendingDevices)
const isLoading = computed(() => espStore.isPendingLoading)
const isEmpty = computed(() => pendingDevices.value.length === 0 && !isLoading.value)

// Time ago helper
function getTimeAgo(isoDate: string): string {
  const now = new Date()
  const then = new Date(isoDate)
  const diffMs = now.getTime() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'gerade eben'
  if (diffMin === 1) return 'vor 1 Min'
  if (diffMin < 60) return `vor ${diffMin} Min`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours === 1) return 'vor 1 Std'
  if (diffHours < 24) return `vor ${diffHours} Std`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'vor 1 Tag'
  return `vor ${diffDays} Tagen`
}

// Signal strength display (human-readable)
function getSignalDisplay(rssi: number | null | undefined): { label: string; bars: number; colorClass: string } {
  const info = getWifiStrength(rssi)
  let colorClass = 'text-gray-400'

  if (info.quality === 'excellent' || info.quality === 'good') {
    colorClass = 'text-emerald-400'
  } else if (info.quality === 'fair') {
    colorClass = 'text-yellow-400'
  } else if (info.quality === 'poor' || info.quality === 'none') {
    colorClass = 'text-orange-400'
  }

  return {
    label: info.label,
    bars: info.bars,
    colorClass
  }
}

// Actions
async function handleApprove(device: PendingESPDevice) {
  if (approvingDevices.value.has(device.device_id)) return

  approvingDevices.value.add(device.device_id)
  try {
    await espStore.approveDevice(device.device_id)
  } finally {
    approvingDevices.value.delete(device.device_id)
  }
}

function handleReject(device: PendingESPDevice) {
  if (rejectingDevices.value.has(device.device_id)) return

  // Open reject modal instead of window.prompt() for UX consistency
  rejectTargetDevice.value = device
  rejectModalOpen.value = true
}

async function confirmReject(reason: string) {
  const device = rejectTargetDevice.value
  if (!device) return

  rejectingDevices.value.add(device.device_id)
  try {
    await espStore.rejectDevice(device.device_id, reason)
  } finally {
    rejectingDevices.value.delete(device.device_id)
    rejectTargetDevice.value = null
  }
}

function cancelReject() {
  rejectTargetDevice.value = null
}

function handleClose() {
  emit('update:isOpen', false)
  emit('close')
}

function handleOpenConfig(device: ESPDevice) {
  emit('open-esp-config', device)
  handleClose()
}

// Check if device is being processed
function isProcessing(deviceId: string): boolean {
  return approvingDevices.value.has(deviceId) || rejectingDevices.value.has(deviceId)
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop: glass overlay for mission-control atmosphere -->
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="pending-backdrop"
        @click="handleClose"
      />
    </Transition>

    <!-- Panel -->
    <Transition name="slide-down">
      <div
        v-if="isOpen"
        ref="panelRef"
        class="pending-panel"
      >
        <!-- Header with Tabs -->
        <div class="pending-panel__header">
          <div class="pending-panel__tabs">
            <button
              :class="['pending-panel__tab', { active: activeTab === 'devices' }]"
              @click="activeTab = 'devices'"
            >
              <Settings2 class="w-4 h-4" />
              <span>Geräte</span>
            </button>
            <button
              :class="['pending-panel__tab', { active: activeTab === 'pending' }]"
              @click="activeTab = 'pending'"
            >
              <Radio class="w-4 h-4" />
              <span>Wartend</span>
              <span v-if="pendingDevices.length > 0" class="pending-panel__badge">
                {{ pendingDevices.length }}
              </span>
            </button>
            <button
              :class="['pending-panel__tab', { active: activeTab === 'info' }]"
              @click="activeTab = 'info'"
            >
              <Info class="w-4 h-4" />
              <span>Anleitung</span>
            </button>
          </div>
          <button
            class="pending-panel__close"
            @click="handleClose"
            title="Schließen"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Tab Content: Configured Devices (Variante A) -->
        <div v-if="activeTab === 'devices'" class="pending-panel__content">
          <div v-if="zoneGroups.length === 0" class="pending-panel__empty">
            <Settings2 class="pending-panel__empty-icon" />
            <p class="pending-panel__empty-text">Keine Geräte in Zonen.</p>
            <p class="pending-panel__empty-hint">Ziehe Geräte aus „Nicht zugewiesen“ in eine Zone.</p>
          </div>
          <div v-else class="pending-panel__list">
            <div v-for="group in zoneGroups" :key="group.zoneId" class="pending-panel__zone-group">
              <div class="pending-panel__zone-title">{{ group.zoneName }}</div>
              <div
                v-for="device in group.devices"
                :key="espStore.getDeviceId(device)"
                class="pending-device pending-device--config"
              >
                <div class="pending-device__info">
                  <div class="pending-device__name">{{ device.name || espStore.getDeviceId(device) }}</div>
                  <div class="pending-device__meta">
                    <span class="pending-device__meta-item">{{ getESPStatus(device).label }}</span>
                    <span class="pending-device__meta-item">{{ (device.sensors?.length ?? device.sensor_count ?? 0) }} Sensoren</span>
                  </div>
                </div>
                <button
                  class="pending-device__btn pending-device__btn--config"
                  title="Konfigurieren"
                  @click="handleOpenConfig(device)"
                >
                  <Settings2 class="w-4 h-4" />
                  <span class="hidden sm:inline">Konfig.</span>
                </button>
              </div>
            </div>
          </div>
          <div class="pending-panel__footer">
            Pending: {{ pendingDevices.length }} Gerät(e) warten auf Genehmigung
          </div>
        </div>

        <!-- Tab Content: Pending Devices -->
        <div v-if="activeTab === 'pending'" class="pending-panel__content">
          <!-- Loading State -->
          <div v-if="isLoading" class="pending-panel__loading">
            <Loader2 class="pending-panel__loading-icon" />
            <span>Suche nach Geräten...</span>
          </div>

          <!-- Empty State -->
          <div v-else-if="isEmpty" class="pending-panel__empty">
            <Radio class="pending-panel__empty-icon" />
            <p class="pending-panel__empty-text">
              Keine neuen Geräte.
              <br><span class="pending-panel__empty-hint">ESP32 verbinden sich automatisch.</span>
            </p>
            <button
              class="pending-panel__info-link"
              @click="activeTab = 'info'"
            >
              Wie verbinde ich ein ESP32?
            </button>
          </div>

          <!-- Device List -->
          <div v-else class="pending-panel__list">
            <div
              v-for="(device, index) in pendingDevices"
              :key="device.device_id"
              class="pending-device"
              :class="{
                'pending-device--processing': isProcessing(device.device_id),
                'pending-device--fresh': getTimeAgo(device.last_seen || device.discovered_at) === 'gerade eben'
              }"
              :style="{ '--stagger-index': index }"
            >
              <!-- Device Info -->
              <div class="pending-device__info">
                <div class="pending-device__name">
                  {{ device.device_id }}
                </div>
                <div class="pending-device__meta">
                  <!-- IP Address -->
                  <span v-if="device.ip_address" class="pending-device__meta-item">
                    <MapPin class="w-3 h-3" />
                    {{ device.ip_address }}
                  </span>

                  <!-- Signal Strength (human-readable) -->
                  <span
                    v-if="device.wifi_rssi"
                    class="pending-device__meta-item"
                    :class="getSignalDisplay(device.wifi_rssi).colorClass"
                  >
                    <Wifi class="w-3 h-3" />
                    {{ getSignalDisplay(device.wifi_rssi).label }}
                  </span>

                  <!-- Last activity (last_seen) - fallback to discovered_at for backwards compat -->
                  <span class="pending-device__meta-item">
                    <Clock class="w-3 h-3" />
                    {{ getTimeAgo(device.last_seen || device.discovered_at) }}
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div class="pending-device__actions">
                <button
                  class="pending-device__btn pending-device__btn--approve"
                  :disabled="isProcessing(device.device_id)"
                  @click="handleApprove(device)"
                  title="Gerät genehmigen"
                >
                  <Loader2 v-if="approvingDevices.has(device.device_id)" class="w-4 h-4 animate-spin" />
                  <Check v-else class="w-4 h-4" />
                  <span class="hidden sm:inline">Genehmigen</span>
                </button>
                <button
                  class="pending-device__btn pending-device__btn--reject"
                  :disabled="isProcessing(device.device_id)"
                  @click="handleReject(device)"
                  title="Gerät ablehnen"
                >
                  <Loader2 v-if="rejectingDevices.has(device.device_id)" class="w-4 h-4 animate-spin" />
                  <Ban v-else class="w-4 h-4" />
                  <span class="hidden sm:inline">Ablehnen</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab Content: Info/Guide -->
        <div v-if="activeTab === 'info'" class="pending-panel__content">
          <div class="pending-panel__info">
            <h4 class="pending-panel__info-title">
              <Wifi class="pending-panel__info-icon" />
              ESP32 verbinden
            </h4>

            <p class="pending-panel__info-text">
              Echte ESP32-Geräte verbinden sich automatisch und erscheinen hier zur Genehmigung.
            </p>

            <div class="pending-panel__steps">
              <div class="pending-panel__step">
                <span class="pending-panel__step-number">1</span>
                <div class="pending-panel__step-content">
                  <strong>Firmware flashen</strong>
                  <span>AutomationOne Firmware auf ESP32 installieren</span>
                </div>
              </div>
              <div class="pending-panel__step">
                <span class="pending-panel__step-number">2</span>
                <div class="pending-panel__step-content">
                  <strong>Provisioning</strong>
                  <span>ESP startet im AP-Modus für WiFi-Konfiguration</span>
                </div>
              </div>
              <div class="pending-panel__step">
                <span class="pending-panel__step-number">3</span>
                <div class="pending-panel__step-content">
                  <strong>Auto-Discovery</strong>
                  <span>ESP sendet Heartbeat → erscheint hier als "Wartend"</span>
                </div>
              </div>
              <div class="pending-panel__step">
                <span class="pending-panel__step-number">4</span>
                <div class="pending-panel__step-content">
                  <strong>Freigabe</strong>
                  <span>Klicke "Genehmigen" → ESP wechselt zu vollem Betrieb</span>
                </div>
              </div>
            </div>

            <div class="pending-panel__info-note">
              <Info class="w-4 h-4" />
              <span>Firmware: <code>El Trabajante/</code> • Docs: <code>CLAUDE.md</code></span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Reject Device Modal -->
    <RejectDeviceModal
      v-model:open="rejectModalOpen"
      :device-id="rejectTargetDevice?.device_id ?? ''"
      @confirm="confirmReject"
      @cancel="cancelReject"
    />
  </Teleport>
</template>

<style scoped>
/* Backdrop: glass overlay — mission-control depth */
.pending-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  background: var(--backdrop-color);
  -webkit-backdrop-filter: blur(var(--backdrop-blur));
  backdrop-filter: blur(var(--backdrop-blur));
}

/* Panel Container - positioned via JS, CSS fallback wenn anchor=null */
.pending-panel {
  position: fixed;
  z-index: var(--z-popover);
  top: 80px;
  right: 16px;
  left: auto;
  width: 100%;
  max-width: 400px;
  max-height: calc(100vh - 100px);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.4),
    0 8px 10px -6px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.04),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.03);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Iridescent accent — top edge, matches "✨ 1 Neue" button */
.pending-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--gradient-iridescent);
  opacity: 0.85;
  z-index: 1;
}

/* Header with Tabs */
.pending-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--glass-border);
  background-color: var(--color-bg-tertiary);
  position: relative;
  z-index: 2;
}

/* Tab System */
.pending-panel__tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background: rgba(0, 0, 0, 0.25);
  border-radius: var(--radius-md);
}

.pending-panel__tab {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
  font-weight: 500;
  font-family: var(--font-body);
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.pending-panel__tab:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.pending-panel__tab.active {
  color: var(--color-text-primary);
  background: rgba(96, 165, 250, 0.12);
}

.pending-panel__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-3));
  border-radius: 9999px;
}

.pending-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.pending-panel__close:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* Content - min-height: 0 required for flex-based scrolling */
.pending-panel__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: var(--glass-border) transparent;
}

/* Loading State */
.pending-panel__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8);
  color: var(--color-text-muted);
}

.pending-panel__loading-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--color-iridescent-2);
  animation: spin 0.8s linear infinite;
}

/* Empty State */
.pending-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.pending-panel__empty-icon {
  width: 2rem;
  height: 2rem;
  margin-bottom: var(--space-2);
  color: var(--color-text-muted);
  opacity: 0.7;
}

.pending-panel__empty-text {
  font-size: var(--text-sm);
  font-family: var(--font-body);
  color: var(--color-text-secondary);
  line-height: var(--leading-loose);
  margin: 0;
}

.pending-panel__empty-hint {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.pending-panel__zone-group {
  margin-bottom: var(--space-3);
}

.pending-panel__zone-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin-bottom: var(--space-1);
  padding: 0 var(--space-2);
}

.pending-panel__footer {
  margin-top: auto;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border-top: 1px solid var(--glass-border);
}

.pending-device--config {
  border-color: var(--glass-border);
}

.pending-device__btn--config {
  background-color: rgba(96, 165, 250, 0.12);
  color: var(--color-accent-bright);
  border-color: rgba(96, 165, 250, 0.25);
}

.pending-device__btn--config:hover {
  background-color: rgba(96, 165, 250, 0.2);
  border-color: rgba(96, 165, 250, 0.4);
}

.pending-panel__info-link {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 500;
  font-family: var(--font-body);
  color: var(--color-iridescent-2);
  background: rgba(96, 165, 250, 0.08);
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.pending-panel__info-link:hover {
  background: rgba(96, 165, 250, 0.14);
  border-color: rgba(96, 165, 250, 0.35);
}

/* Device List */
.pending-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Device Card — staggered entrance */
.pending-device {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  border-left-width: 3px;
  border-left-color: transparent;
  transition: border-color var(--transition-base), transform var(--transition-fast);
  animation: pending-device-enter 0.35s var(--ease-out) calc(var(--stagger-index, 0) * 0.04s) both;
}

.pending-device:hover {
  border-color: var(--glass-border-hover);
  border-left-color: rgba(96, 165, 250, 0.4);
}

.pending-device--fresh {
  border-left-color: var(--color-iridescent-2);
  box-shadow: inset 0 0 12px rgba(96, 165, 250, 0.04);
}

.pending-device--processing {
  opacity: 0.7;
  pointer-events: none;
}

@keyframes pending-device-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pending-device__info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.pending-device__name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
}

.pending-device__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--text-xs);
  font-family: var(--font-body);
  color: var(--color-text-muted);
}

.pending-device__meta-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* Actions */
.pending-device__actions {
  display: flex;
  gap: 0.375rem;
}

.pending-device__btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  font-family: var(--font-body);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.pending-device__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pending-device__btn--approve {
  background-color: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
  border-color: rgba(52, 211, 153, 0.3);
}

.pending-device__btn--approve:hover:not(:disabled) {
  background-color: rgba(52, 211, 153, 0.25);
  border-color: rgba(52, 211, 153, 0.5);
}

.pending-device__btn--reject {
  background-color: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
  border-color: rgba(248, 113, 113, 0.3);
}

.pending-device__btn--reject:hover:not(:disabled) {
  background-color: rgba(248, 113, 113, 0.25);
  border-color: rgba(248, 113, 113, 0.5);
}

/* Info Content */
.pending-panel__info {
  padding: var(--space-2) var(--space-1);
}

.pending-panel__info-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
  font-family: var(--font-body);
  color: var(--color-text-primary);
}

.pending-panel__info-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-success);
}

.pending-panel__info-text {
  margin-bottom: var(--space-3);
  font-size: var(--text-base);
  font-family: var(--font-body);
  color: var(--color-text-secondary);
  line-height: var(--leading-loose);
}

.pending-panel__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pending-panel__step {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  background: rgba(0, 0, 0, 0.22);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-iridescent-2);
}

.pending-panel__step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-3));
  border-radius: 50%;
  flex-shrink: 0;
}

.pending-panel__step-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.pending-panel__step-content strong {
  font-size: var(--text-sm);
  font-weight: 600;
  font-family: var(--font-body);
  color: var(--color-text-primary);
}

.pending-panel__step-content span {
  font-size: var(--text-xs);
  font-family: var(--font-body);
  color: var(--color-text-secondary);
}

.pending-panel__info-note {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-2);
  font-size: var(--text-xs);
  font-family: var(--font-body);
  color: var(--color-text-muted);
  background: rgba(96, 165, 250, 0.08);
  border-radius: var(--radius-sm);
}

.pending-panel__info-note code {
  color: var(--color-iridescent-2);
  font-family: var(--font-mono);
  font-size: 0.65rem;
}

/* Transitions — match design system */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-base) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-spring);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}

/* Mobile adjustments */
@media (max-width: 480px) {
  .pending-panel {
    left: 0.5rem !important;
    right: 0.5rem;
    max-width: none;
    width: auto;
  }
}
</style>
