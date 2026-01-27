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
import { X, Check, Ban, Wifi, Clock, MapPin, Info, Loader2, Radio } from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'
import { getWifiStrength } from '@/utils/wifiStrength'
import type { PendingESPDevice } from '@/types'

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
}>()

const espStore = useEspStore()
const panelRef = ref<HTMLElement | null>(null)

// Tab state
type TabType = 'pending' | 'info'
const activeTab = ref<TabType>('pending')

// Loading states for individual devices
const approvingDevices = ref<Set<string>>(new Set())
const rejectingDevices = ref<Set<string>>(new Set())

// Fetch pending devices when panel opens
watch(() => props.isOpen, (open) => {
  if (open) {
    espStore.fetchPendingDevices()
    nextTick(updatePosition)
  }
})

onMounted(() => {
  if (props.isOpen) {
    espStore.fetchPendingDevices()
    nextTick(updatePosition)
  }
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})

// Watch for anchor changes
watch(() => props.anchorEl, () => nextTick(updatePosition))

// Position panel relative to anchor element
function updatePosition() {
  if (!props.anchorEl || !panelRef.value || !props.isOpen) return

  const anchor = props.anchorEl.getBoundingClientRect()
  const panel = panelRef.value
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Position below the button, right-aligned
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

  panel.style.top = `${top}px`
  panel.style.left = `${left}px`
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

async function handleReject(device: PendingESPDevice) {
  if (rejectingDevices.value.has(device.device_id)) return

  // Simple prompt for rejection reason
  const reason = prompt('Grund für die Ablehnung (optional):') || 'Manuell abgelehnt'

  rejectingDevices.value.add(device.device_id)
  try {
    await espStore.rejectDevice(device.device_id, reason)
  } finally {
    rejectingDevices.value.delete(device.device_id)
  }
}

function handleClose() {
  emit('update:isOpen', false)
  emit('close')
}

// Check if device is being processed
function isProcessing(deviceId: string): boolean {
  return approvingDevices.value.has(deviceId) || rejectingDevices.value.has(deviceId)
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-40"
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

        <!-- Tab Content: Pending Devices -->
        <div v-if="activeTab === 'pending'" class="pending-panel__content">
          <!-- Loading State -->
          <div v-if="isLoading" class="pending-panel__loading">
            <Loader2 class="w-6 h-6 animate-spin text-blue-400" />
            <span>Lade Geräte...</span>
          </div>

          <!-- Empty State -->
          <div v-else-if="isEmpty" class="pending-panel__empty">
            <Radio class="w-8 h-8 text-gray-500 mb-2" />
            <p class="text-gray-400 text-sm text-center">
              Keine neuen Geräte.<br>
              ESP32 verbinden sich automatisch.
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
              v-for="device in pendingDevices"
              :key="device.device_id"
              class="pending-device"
              :class="{ 'pending-device--processing': isProcessing(device.device_id) }"
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
              <Wifi class="w-5 h-5 text-emerald-400" />
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
  </Teleport>
</template>

<style scoped>
/* Panel Container - positioned via JS */
.pending-panel {
  position: fixed;
  z-index: 50;
  width: 100%;
  max-width: 400px;
  max-height: calc(100vh - 100px);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.3),
    0 8px 10px -6px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header with Tabs */
.pending-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--glass-border);
  background-color: var(--color-bg-tertiary);
}

/* Tab System */
.pending-panel__tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
}

.pending-panel__tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pending-panel__tab:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.pending-panel__tab.active {
  color: var(--color-text-primary);
  background: rgba(96, 165, 250, 0.15);
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

/* Content */
.pending-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

/* Loading State */
.pending-panel__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--color-text-muted);
}

/* Empty State */
.pending-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
}

.pending-panel__info-link {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-iridescent-2);
  background: rgba(96, 165, 250, 0.1);
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.pending-panel__info-link:hover {
  background: rgba(96, 165, 250, 0.15);
  border-color: rgba(96, 165, 250, 0.3);
}

/* Device List */
.pending-panel__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Device Card */
.pending-device {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.pending-device:hover {
  border-color: rgba(96, 165, 250, 0.3);
}

.pending-device--processing {
  opacity: 0.7;
  pointer-events: none;
}

.pending-device__info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.pending-device__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.pending-device__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
  font-size: 0.75rem;
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
  gap: 0.375rem;
  padding: 0.4375rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
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
  padding: 0.5rem 0.25rem;
}

.pending-panel__info-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.pending-panel__info-text {
  margin-bottom: 0.875rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.pending-panel__steps {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pending-panel__step {
  display: flex;
  gap: 0.625rem;
  padding: 0.625rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
  border-left: 2px solid var(--color-iridescent-2);
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
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.pending-panel__step-content span {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.pending-panel__info-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.875rem;
  padding: 0.5rem 0.625rem;
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  background: rgba(96, 165, 250, 0.1);
  border-radius: 0.375rem;
}

.pending-panel__info-note code {
  color: var(--color-iridescent-2);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.6875rem;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
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
