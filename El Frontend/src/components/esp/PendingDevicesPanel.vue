<script setup lang="ts">
/**
 * PendingDevicesPanel — Device Management SlideOver
 *
 * Block 3: Converted from popover to SlideOver for consistent UX.
 * Provides device list (Variante A) with tabs for configured, pending, and info.
 * "Konfig." button emits to parent which opens ESPSettingsSheet (Variante B).
 *
 * Features:
 * - SlideOver from right (consistent with SensorConfigPanel/ActuatorConfigPanel)
 * - Tab navigation (Geräte / Wartend / Anleitung)
 * - Search field in Geräte tab
 * - Unassigned devices section
 * - Delete action with ConfirmDialog
 * - Toast feedback for approve/reject/delete actions
 */

import { ref, computed, watch } from 'vue'
import { Search, X, Check, Ban, Wifi, Clock, MapPin, Info, Loader2, Radio, Settings2, Trash2, Package } from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'
import { useUiStore } from '@/shared/stores/ui.store'
import { useZoneDragDrop, ZONE_UNASSIGNED } from '@/composables/useZoneDragDrop'
import { getESPStatus, getESPStatusDisplay } from '@/composables/useESPStatus'
import { getWifiStrength } from '@/utils/wifiStrength'
import { useToast } from '@/composables/useToast'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import RejectDeviceModal from '@/components/modals/RejectDeviceModal.vue'
import type { PendingESPDevice } from '@/types'
import type { ESPDevice } from '@/api/esp'

interface Props {
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  close: []
  'open-esp-config': [device: ESPDevice]
  'device-deleted': [deviceId: string]
}>()

const espStore = useEspStore()
const uiStore = useUiStore()
const { groupDevicesByZone } = useZoneDragDrop()
const { success: showSuccess, error: showError } = useToast()

// Tab state
type TabType = 'devices' | 'pending' | 'info'
const activeTab = ref<TabType>('devices')

// Search state
const searchQuery = ref('')

// Fetch pending devices when panel opens
watch(() => props.isOpen, (open) => {
  if (open) {
    espStore.fetchPendingDevices()
    searchQuery.value = ''
  }
})

// ── Device List (Geräte Tab) ───────────────────────────────────────────

/** All configured ESPs grouped by zone (excluding unassigned) */
const zoneGroups = computed(() => {
  const devices = espStore.devices ?? []
  const groups = groupDevicesByZone(devices)
  return groups.filter(g => g.zoneId !== ZONE_UNASSIGNED)
})

/** Unassigned devices (separate section) */
const unassignedGroup = computed(() => {
  const devices = espStore.devices ?? []
  const groups = groupDevicesByZone(devices)
  const group = groups.find(g => g.zoneId === ZONE_UNASSIGNED)
  return group?.devices ?? []
})

/** Filter zone groups + unassigned by search query */
const filteredZoneGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return zoneGroups.value

  return zoneGroups.value
    .map(group => ({
      ...group,
      devices: group.devices.filter(d => matchesSearch(d, q)),
    }))
    .filter(group => group.devices.length > 0)
})

const filteredUnassigned = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return unassignedGroup.value
  return unassignedGroup.value.filter(d => matchesSearch(d, q))
})

function matchesSearch(device: ESPDevice, query: string): boolean {
  const id = (device.device_id || (device as any).esp_id || '').toLowerCase()
  const name = (device.name || '').toLowerCase()
  const zoneName = (device.zone_name || '').toLowerCase()
  return id.includes(query) || name.includes(query) || zoneName.includes(query)
}

/** Total device count for header */
const totalDeviceCount = computed(() => espStore.devices.length)

// ── Pending Devices (Wartend Tab) ──────────────────────────────────────

const pendingDevices = computed(() => espStore.pendingDevices)
const isLoading = computed(() => espStore.isPendingLoading)
const isEmpty = computed(() => pendingDevices.value.length === 0 && !isLoading.value)

// Loading states for individual devices
const approvingDevices = ref<Set<string>>(new Set())
const rejectingDevices = ref<Set<string>>(new Set())

// Reject modal state
const rejectModalOpen = ref(false)
const rejectTargetDevice = ref<PendingESPDevice | null>(null)

// ── Helpers ────────────────────────────────────────────────────────────

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

  return { label: info.label, bars: info.bars, colorClass }
}

function getDeviceId(device: ESPDevice): string {
  return device.device_id || (device as any).esp_id || ''
}

function getSensorCount(device: ESPDevice): number {
  return (device.sensors as any[])?.length ?? device.sensor_count ?? 0
}

// ── Actions ────────────────────────────────────────────────────────────

function handleClose() {
  emit('update:isOpen', false)
  emit('close')
}

function handleOpenConfig(device: ESPDevice) {
  emit('open-esp-config', device)
}

async function handleApprove(device: PendingESPDevice) {
  if (approvingDevices.value.has(device.device_id)) return

  approvingDevices.value.add(device.device_id)
  try {
    await espStore.approveDevice(device.device_id)
    showSuccess(`${device.device_id} genehmigt`)
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Genehmigung fehlgeschlagen')
  } finally {
    approvingDevices.value.delete(device.device_id)
  }
}

function handleReject(device: PendingESPDevice) {
  if (rejectingDevices.value.has(device.device_id)) return
  rejectTargetDevice.value = device
  rejectModalOpen.value = true
}

async function confirmReject(reason: string) {
  const device = rejectTargetDevice.value
  if (!device) return

  rejectingDevices.value.add(device.device_id)
  try {
    await espStore.rejectDevice(device.device_id, reason)
    showSuccess(`${device.device_id} abgelehnt`)
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Ablehnung fehlgeschlagen')
  } finally {
    rejectingDevices.value.delete(device.device_id)
    rejectTargetDevice.value = null
  }
}

function cancelReject() {
  rejectTargetDevice.value = null
}

async function handleDeleteDevice(device: ESPDevice) {
  const deviceId = getDeviceId(device)
  const displayName = device.name || deviceId
  const sensorCount = getSensorCount(device)

  const confirmed = await uiStore.confirm({
    title: 'Gerät löschen',
    message: sensorCount > 0
      ? `"${displayName}" und alle ${sensorCount} Sensoren werden gelöscht. Fortfahren?`
      : `"${displayName}" wird gelöscht. Fortfahren?`,
    variant: 'danger',
    confirmText: 'Löschen',
  })
  if (!confirmed) return

  try {
    await espStore.deleteDevice(deviceId)
    showSuccess(`${displayName} wurde gelöscht`)
    emit('device-deleted', deviceId)
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Gerät konnte nicht gelöscht werden')
  }
}

function isProcessing(deviceId: string): boolean {
  return approvingDevices.value.has(deviceId) || rejectingDevices.value.has(deviceId)
}
</script>

<template>
  <SlideOver
    :open="isOpen"
    title="Geräteverwaltung"
    width="md"
    @close="handleClose"
  >
    <!-- Tab Navigation -->
    <div class="device-panel__tabs">
      <button
        :class="['device-panel__tab', { 'device-panel__tab--active': activeTab === 'devices' }]"
        @click="activeTab = 'devices'"
      >
        <Settings2 class="w-4 h-4" />
        <span>Geräte</span>
        <span v-if="totalDeviceCount > 0" class="device-panel__tab-count">{{ totalDeviceCount }}</span>
      </button>
      <button
        :class="['device-panel__tab', { 'device-panel__tab--active': activeTab === 'pending' }]"
        @click="activeTab = 'pending'"
      >
        <Radio class="w-4 h-4" />
        <span>Wartend</span>
        <span v-if="pendingDevices.length > 0" class="device-panel__tab-badge">
          {{ pendingDevices.length }}
        </span>
      </button>
      <button
        :class="['device-panel__tab', { 'device-panel__tab--active': activeTab === 'info' }]"
        @click="activeTab = 'info'"
      >
        <Info class="w-4 h-4" />
        <span>Anleitung</span>
      </button>
    </div>

    <!-- ═══ Tab: Geräte (Variante A — Device List) ═══ -->
    <div v-if="activeTab === 'devices'" class="device-panel__content">
      <!-- Search Field -->
      <div class="device-panel__search">
        <Search class="device-panel__search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          class="device-panel__search-input"
          placeholder="Gerät suchen..."
        />
        <button
          v-if="searchQuery"
          class="device-panel__search-clear"
          @click="searchQuery = ''"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Zone Groups -->
      <div v-if="filteredZoneGroups.length > 0 || filteredUnassigned.length > 0" class="device-panel__list">
        <!-- Assigned Zones -->
        <div v-for="group in filteredZoneGroups" :key="group.zoneId" class="device-panel__zone-group">
          <div class="device-panel__zone-title">{{ group.zoneName }}</div>
          <div
            v-for="device in group.devices"
            :key="getDeviceId(device)"
            class="device-panel__device"
          >
            <div class="device-panel__device-info">
              <div class="device-panel__device-name">{{ device.name || getDeviceId(device) }}</div>
              <div class="device-panel__device-meta">
                <span
                  class="device-panel__device-status"
                  :style="{ color: getESPStatusDisplay(getESPStatus(device)).color }"
                >
                  {{ getESPStatusDisplay(getESPStatus(device)).text }}
                </span>
                <span class="device-panel__device-sep">·</span>
                <span>{{ getSensorCount(device) }} Sensoren</span>
              </div>
            </div>
            <div class="device-panel__device-actions">
              <button
                class="device-panel__btn device-panel__btn--config"
                title="Konfigurieren"
                @click="handleOpenConfig(device)"
              >
                <Settings2 class="w-4 h-4" />
              </button>
              <button
                class="device-panel__btn device-panel__btn--delete"
                title="Löschen"
                @click="handleDeleteDevice(device)"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- Unassigned Devices -->
        <div v-if="filteredUnassigned.length > 0" class="device-panel__zone-group device-panel__zone-group--unassigned">
          <div class="device-panel__zone-title device-panel__zone-title--unassigned">
            <Package class="w-3 h-3" />
            Nicht zugewiesen
          </div>
          <div
            v-for="device in filteredUnassigned"
            :key="getDeviceId(device)"
            class="device-panel__device"
          >
            <div class="device-panel__device-info">
              <div class="device-panel__device-name">{{ device.name || getDeviceId(device) }}</div>
              <div class="device-panel__device-meta">
                <span
                  class="device-panel__device-status"
                  :style="{ color: getESPStatusDisplay(getESPStatus(device)).color }"
                >
                  {{ getESPStatusDisplay(getESPStatus(device)).text }}
                </span>
                <span class="device-panel__device-sep">·</span>
                <span>{{ getSensorCount(device) }} Sensoren</span>
              </div>
            </div>
            <div class="device-panel__device-actions">
              <button
                class="device-panel__btn device-panel__btn--config"
                title="Konfigurieren"
                @click="handleOpenConfig(device)"
              >
                <Settings2 class="w-4 h-4" />
              </button>
              <button
                class="device-panel__btn device-panel__btn--delete"
                title="Löschen"
                @click="handleDeleteDevice(device)"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty: No devices at all -->
      <div v-else-if="totalDeviceCount === 0" class="device-panel__empty">
        <Settings2 class="device-panel__empty-icon" />
        <p class="device-panel__empty-text">Keine Geräte vorhanden.</p>
        <p class="device-panel__empty-hint">Erstelle ein Mock-ESP oder verbinde ein echtes Gerät.</p>
      </div>

      <!-- Empty: Search has no results -->
      <div v-else class="device-panel__empty">
        <Search class="device-panel__empty-icon" />
        <p class="device-panel__empty-text">Keine Treffer für "{{ searchQuery }}"</p>
        <button class="device-panel__clear-search" @click="searchQuery = ''">
          Suche zurücksetzen
        </button>
      </div>

      <!-- Footer: Pending count summary -->
      <div class="device-panel__footer">
        Wartend: {{ pendingDevices.length }} Gerät(e) zur Genehmigung
      </div>
    </div>

    <!-- ═══ Tab: Wartend (Pending Devices) ═══ -->
    <div v-if="activeTab === 'pending'" class="device-panel__content">
      <!-- Loading State -->
      <div v-if="isLoading" class="device-panel__loading">
        <Loader2 class="device-panel__loading-icon" />
        <span>Suche nach Geräten...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="isEmpty" class="device-panel__empty">
        <Radio class="device-panel__empty-icon" />
        <p class="device-panel__empty-text">
          Keine neuen Geräte.
          <br><span class="device-panel__empty-hint">ESP32 verbinden sich automatisch.</span>
        </p>
        <button class="device-panel__info-link" @click="activeTab = 'info'">
          Wie verbinde ich ein ESP32?
        </button>
      </div>

      <!-- Pending Device List -->
      <div v-else class="device-panel__list">
        <div
          v-for="(device, index) in pendingDevices"
          :key="device.device_id"
          class="device-panel__pending-device"
          :class="{
            'device-panel__pending-device--processing': isProcessing(device.device_id),
            'device-panel__pending-device--fresh': getTimeAgo(device.last_seen || device.discovered_at) === 'gerade eben',
          }"
          :style="{ '--stagger-index': index }"
        >
          <div class="device-panel__device-info">
            <div class="device-panel__device-name device-panel__device-name--mono">
              {{ device.device_id }}
            </div>
            <div class="device-panel__device-meta">
              <span v-if="device.ip_address" class="device-panel__meta-item">
                <MapPin class="w-3 h-3" />
                {{ device.ip_address }}
              </span>
              <span
                v-if="device.wifi_rssi"
                class="device-panel__meta-item"
                :class="getSignalDisplay(device.wifi_rssi).colorClass"
              >
                <Wifi class="w-3 h-3" />
                {{ getSignalDisplay(device.wifi_rssi).label }}
              </span>
              <span class="device-panel__meta-item">
                <Clock class="w-3 h-3" />
                {{ getTimeAgo(device.last_seen || device.discovered_at) }}
              </span>
            </div>
          </div>

          <div class="device-panel__pending-actions">
            <button
              class="device-panel__btn device-panel__btn--approve"
              :disabled="isProcessing(device.device_id)"
              title="Gerät genehmigen"
              @click="handleApprove(device)"
            >
              <Loader2 v-if="approvingDevices.has(device.device_id)" class="w-4 h-4 animate-spin" />
              <Check v-else class="w-4 h-4" />
              <span>Genehmigen</span>
            </button>
            <button
              class="device-panel__btn device-panel__btn--reject"
              :disabled="isProcessing(device.device_id)"
              title="Gerät ablehnen"
              @click="handleReject(device)"
            >
              <Loader2 v-if="rejectingDevices.has(device.device_id)" class="w-4 h-4 animate-spin" />
              <Ban v-else class="w-4 h-4" />
              <span>Ablehnen</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Tab: Anleitung (Info/Guide) ═══ -->
    <div v-if="activeTab === 'info'" class="device-panel__content">
      <div class="device-panel__info">
        <h4 class="device-panel__info-title">
          <Wifi class="device-panel__info-title-icon" />
          ESP32 verbinden
        </h4>

        <p class="device-panel__info-text">
          Echte ESP32-Geräte verbinden sich automatisch und erscheinen im "Wartend"-Tab zur Genehmigung.
        </p>

        <div class="device-panel__steps">
          <div class="device-panel__step">
            <span class="device-panel__step-number">1</span>
            <div class="device-panel__step-content">
              <strong>Firmware flashen</strong>
              <span>AutomationOne Firmware auf ESP32 installieren</span>
            </div>
          </div>
          <div class="device-panel__step">
            <span class="device-panel__step-number">2</span>
            <div class="device-panel__step-content">
              <strong>Provisioning</strong>
              <span>ESP startet im AP-Modus für WiFi-Konfiguration</span>
            </div>
          </div>
          <div class="device-panel__step">
            <span class="device-panel__step-number">3</span>
            <div class="device-panel__step-content">
              <strong>Auto-Discovery</strong>
              <span>ESP sendet Heartbeat und erscheint als "Wartend"</span>
            </div>
          </div>
          <div class="device-panel__step">
            <span class="device-panel__step-number">4</span>
            <div class="device-panel__step-content">
              <strong>Freigabe</strong>
              <span>Klicke "Genehmigen" und der ESP wechselt zu vollem Betrieb</span>
            </div>
          </div>
        </div>

        <div class="device-panel__info-note">
          <Info class="w-4 h-4" />
          <span>Firmware: <code>El Trabajante/</code> · Docs: <code>CLAUDE.md</code></span>
        </div>
      </div>
    </div>
  </SlideOver>

  <!-- Reject Device Modal (rendered outside SlideOver to avoid z-index issues) -->
  <RejectDeviceModal
    v-model:open="rejectModalOpen"
    :device-id="rejectTargetDevice?.device_id ?? ''"
    @confirm="confirmReject"
    @cancel="cancelReject"
  />
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-1);
  margin-bottom: var(--space-3);
  background: rgba(0, 0, 0, 0.25);
  border-radius: var(--radius-md);
}

.device-panel__tab {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex: 1;
  justify-content: center;
  padding: var(--space-2) var(--space-2);
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

.device-panel__tab:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.device-panel__tab--active {
  color: var(--color-text-primary);
  background: rgba(96, 165, 250, 0.12);
}

.device-panel__tab-count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 400;
}

.device-panel__tab-badge {
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

/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEARCH
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__search {
  position: relative;
  display: flex;
  align-items: center;
}

.device-panel__search-icon {
  position: absolute;
  left: var(--space-3);
  width: 1rem;
  height: 1rem;
  color: var(--color-text-muted);
  pointer-events: none;
}

.device-panel__search-input {
  width: 100%;
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-8);
  font-size: var(--text-sm);
  font-family: var(--font-body);
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.device-panel__search-input::placeholder {
  color: var(--color-text-muted);
}

.device-panel__search-input:focus {
  border-color: var(--color-accent);
}

.device-panel__search-clear {
  position: absolute;
  right: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.device-panel__search-clear:hover {
  color: var(--color-text-primary);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEVICE LIST
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.device-panel__zone-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.device-panel__zone-title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  padding: 0 var(--space-2);
}

.device-panel__zone-title--unassigned {
  color: var(--color-warning);
}

.device-panel__zone-group--unassigned {
  padding-top: var(--space-2);
  border-top: 1px solid var(--glass-border);
}

/* Device Row */
.device-panel__device {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast);
}

.device-panel__device:hover {
  border-color: var(--glass-border-hover);
}

.device-panel__device-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.device-panel__device-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-panel__device-name--mono {
  font-family: var(--font-mono);
}

.device-panel__device-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-family: var(--font-body);
  color: var(--color-text-muted);
}

.device-panel__device-status {
  font-weight: 500;
}

.device-panel__device-sep {
  color: var(--glass-border);
}

.device-panel__meta-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.device-panel__device-actions {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  font-family: var(--font-body);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.device-panel__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.device-panel__btn--config {
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.1);
  border-color: rgba(96, 165, 250, 0.2);
}

.device-panel__btn--config:hover:not(:disabled) {
  background: rgba(96, 165, 250, 0.2);
  border-color: rgba(96, 165, 250, 0.35);
}

.device-panel__btn--delete {
  color: var(--color-text-muted);
  background: transparent;
  border-color: transparent;
}

.device-panel__btn--delete:hover:not(:disabled) {
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.25);
}

.device-panel__btn--approve {
  flex: 1;
  background: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
  border-color: rgba(52, 211, 153, 0.3);
}

.device-panel__btn--approve:hover:not(:disabled) {
  background: rgba(52, 211, 153, 0.25);
  border-color: rgba(52, 211, 153, 0.5);
}

.device-panel__btn--reject {
  flex: 1;
  background: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
  border-color: rgba(248, 113, 113, 0.3);
}

.device-panel__btn--reject:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.25);
  border-color: rgba(248, 113, 113, 0.5);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PENDING DEVICE CARD
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__pending-device {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  border-left-width: 3px;
  border-left-color: transparent;
  transition: border-color var(--transition-base);
  animation: device-enter 0.35s var(--ease-out) calc(var(--stagger-index, 0) * 0.04s) both;
}

.device-panel__pending-device:hover {
  border-color: var(--glass-border-hover);
  border-left-color: rgba(96, 165, 250, 0.4);
}

.device-panel__pending-device--fresh {
  border-left-color: var(--color-iridescent-2);
  box-shadow: inset 0 0 12px rgba(96, 165, 250, 0.04);
}

.device-panel__pending-device--processing {
  opacity: 0.7;
  pointer-events: none;
}

@keyframes device-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.device-panel__pending-actions {
  display: flex;
  gap: 0.375rem;
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMPTY & LOADING STATES
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.device-panel__empty-icon {
  width: 2rem;
  height: 2rem;
  margin-bottom: var(--space-2);
  color: var(--color-text-muted);
  opacity: 0.7;
}

.device-panel__empty-text {
  font-size: var(--text-sm);
  font-family: var(--font-body);
  color: var(--color-text-secondary);
  line-height: var(--leading-loose);
  margin: 0;
}

.device-panel__empty-hint {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.device-panel__clear-search {
  margin-top: var(--space-2);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  font-family: var(--font-body);
  color: var(--color-accent-bright);
  background: transparent;
  border: 1px solid rgba(96, 165, 250, 0.25);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.device-panel__clear-search:hover {
  background: rgba(96, 165, 250, 0.1);
}

.device-panel__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8);
  color: var(--color-text-muted);
}

.device-panel__loading-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--color-iridescent-2);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__footer {
  margin-top: auto;
  padding-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border-top: 1px solid var(--glass-border);
}

/* ═══════════════════════════════════════════════════════════════════════════
   INFO TAB
   ═══════════════════════════════════════════════════════════════════════════ */

.device-panel__info {
  padding: var(--space-1) 0;
}

.device-panel__info-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
  font-family: var(--font-body);
  color: var(--color-text-primary);
}

.device-panel__info-title-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-success);
}

.device-panel__info-text {
  margin-bottom: var(--space-3);
  font-size: var(--text-base);
  font-family: var(--font-body);
  color: var(--color-text-secondary);
  line-height: var(--leading-loose);
}

.device-panel__info-link {
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

.device-panel__info-link:hover {
  background: rgba(96, 165, 250, 0.14);
  border-color: rgba(96, 165, 250, 0.35);
}

.device-panel__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.device-panel__step {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  background: rgba(0, 0, 0, 0.22);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-iridescent-2);
}

.device-panel__step-number {
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

.device-panel__step-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.device-panel__step-content strong {
  font-size: var(--text-sm);
  font-weight: 600;
  font-family: var(--font-body);
  color: var(--color-text-primary);
}

.device-panel__step-content span {
  font-size: var(--text-xs);
  font-family: var(--font-body);
  color: var(--color-text-secondary);
}

.device-panel__info-note {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2);
  font-size: var(--text-xs);
  font-family: var(--font-body);
  color: var(--color-text-muted);
  background: rgba(96, 165, 250, 0.08);
  border-radius: var(--radius-sm);
}

.device-panel__info-note code {
  color: var(--color-iridescent-2);
  font-family: var(--font-mono);
  font-size: 0.65rem;
}
</style>
