<script setup lang="ts">
/**
 * DashboardView
 *
 * Main dashboard with:
 * - ActionBar for quick status overview and actions
 * - Zone-grouped ESP overview with drag & drop
 * - ESPOrbitalLayout for visual device display (within zones)
 */

import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useLogicStore } from '@/stores/logic'
import { useUiStore } from '@/shared/stores'
import type { ESPDevice } from '@/api/esp'
import { useZoneDragDrop, ZONE_UNASSIGNED } from '@/composables'
import { Plus, Filter, GitBranch, Workflow } from 'lucide-vue-next'
import { createLogger } from '@/utils/logger'

const logger = createLogger('Dashboard')

// Components
import ActionBar from '@/components/dashboard/ActionBar.vue'
import CreateMockEspModal from '@/components/modals/CreateMockEspModal.vue'
import ESPOrbitalLayout from '@/components/esp/ESPOrbitalLayout.vue'
import ESPSettingsSheet from '@/components/esp/ESPSettingsSheet.vue'
import ZoneGroup from '@/components/zones/ZoneGroup.vue'
import CrossEspConnectionOverlay from '@/components/dashboard/CrossEspConnectionOverlay.vue'
import ComponentSidebar from '@/components/dashboard/ComponentSidebar.vue'
import UnassignedDropBar from '@/components/dashboard/UnassignedDropBar.vue'
import PendingDevicesPanel from '@/components/esp/PendingDevicesPanel.vue'
import { LoadingState, EmptyState } from '@/components/common'

const router = useRouter()
const route = useRoute()
const espStore = useEspStore()
const logicStore = useLogicStore()
const uiStore = useUiStore()
const { groupDevicesByZone, handleDeviceDrop } = useZoneDragDrop()

// Filter state (type filter unchanged)
const filterType = ref<'all' | 'mock' | 'real'>('all')

// Status filter using Set for multi-select pills
type StatusFilter = 'online' | 'offline' | 'warning' | 'safemode'
const activeStatusFilters = ref<Set<StatusFilter>>(new Set())

// Modal states
const showCreateMockModal = ref(false)
const showPendingDevices = ref(false)
const pendingButtonAnchor = ref<HTMLElement | null>(null)

// Settings popover state (Phase 2)
const settingsDevice = ref<ESPDevice | null>(null)
const isSettingsOpen = ref(false)

// Cross-ESP connections toggle
const showCrossEspConnections = ref(true)

onMounted(() => {
  espStore.fetchAll()
  espStore.fetchPendingDevices()  // Fetch pending devices for Discovery/Approval
  logicStore.fetchRules()
  // Subscribe to WebSocket for live logic execution updates
  logicStore.subscribeToWebSocket()
})

onUnmounted(() => {
  // Unsubscribe from WebSocket when leaving dashboard
  logicStore.unsubscribeFromWebSocket()
})

// =============================================================================
// Query Parameter Support: ?openSettings=ESP_ID
// Opens ESPSettingsSheet when navigating from /devices/:espId redirect
// =============================================================================
watch(
  [() => route.query.openSettings, () => espStore.devices, () => espStore.isLoading],
  ([openSettingsId, devices, isLoading]) => {
    // Wait for devices to be loaded
    if (isLoading || !devices.length) return

    // Check if we have an openSettings query parameter
    if (!openSettingsId || typeof openSettingsId !== 'string') return

    // Find the device by ID
    const device = devices.find(d => espStore.getDeviceId(d) === openSettingsId)

    if (device) {
      // Open settings popover for this device
      settingsDevice.value = device
      isSettingsOpen.value = true
      logger.info(`Opened settings for ${openSettingsId} via query parameter`)

      // Remove query parameter from URL to prevent re-opening on refresh
      router.replace({ path: '/', query: {} })
    } else {
      logger.warn(`Device ${openSettingsId} not found for openSettings query`)
      // Remove invalid query parameter
      router.replace({ path: '/', query: {} })
    }
  },
  { immediate: true }
)

// Status counts for ActionBar pills
const onlineCount = computed(() => espStore.onlineDevices.length)
const offlineCount = computed(() => espStore.offlineDevices.length)
const pendingCount = computed(() => espStore.pendingCount)

const warningCount = computed(() =>
  espStore.devices.filter(device => {
    const deviceId = espStore.getDeviceId(device)
    if (espStore.isMock(deviceId)) {
      const mockDevice = device as any
      return mockDevice.system_state === 'ERROR' ||
        mockDevice.actuators?.some((a: any) => a.emergency_stopped)
    }
    return device.status === 'error'
  }).length
)

const safeModeCount = computed(() =>
  espStore.devices.filter(device => {
    const deviceId = espStore.getDeviceId(device)
    if (espStore.isMock(deviceId)) {
      return (device as any).system_state === 'SAFE_MODE'
    }
    return false
  }).length
)

// Problem message for ActionBar warning banner
const problemMessage = computed(() => {
  if (warningCount.value > 0) {
    return `${warningCount.value} Gerät(e) mit Fehlern`
  }
  if (safeModeCount.value > 0) {
    return `${safeModeCount.value} Gerät(e) im Safe-Mode`
  }
  if (offlineCount.value > 0 && onlineCount.value > 0) {
    return `${offlineCount.value} Gerät(e) offline`
  }
  return ''
})

const hasProblems = computed(() =>
  warningCount.value > 0 || safeModeCount.value > 0
)

// Toggle status filter
function toggleStatusFilter(filter: StatusFilter) {
  const newFilters = new Set(activeStatusFilters.value)
  if (newFilters.has(filter)) {
    newFilters.delete(filter)
  } else {
    newFilters.add(filter)
  }
  activeStatusFilters.value = newFilters
}

/** Reset type and status filters (used when "No Results" is shown) */
function resetFilters() {
  filterType.value = 'all'
  activeStatusFilters.value = new Set()
}

// Handle Mock ESP created
function onMockEspCreated(espId: string) {
  // Refresh devices to show the new ESP
  espStore.fetchAll()
  // Show a toast or notification (could be enhanced later)
  logger.info(`Mock ESP erstellt: ${espId}`)
}

// Filtered ESPs (using type filter + status pills)
const filteredEsps = computed(() => {
  let esps = espStore.devices

  // Filter by type (unchanged)
  if (filterType.value === 'mock') {
    esps = esps.filter(e => espStore.isMock(espStore.getDeviceId(e)))
  } else if (filterType.value === 'real') {
    esps = esps.filter(e => !espStore.isMock(espStore.getDeviceId(e)))
  }

  // Filter by status pills (Set-based, empty = show all)
  const filters = activeStatusFilters.value
  if (filters.size > 0) {
    esps = esps.filter(device => {
      const deviceId = espStore.getDeviceId(device)
      const isMock = espStore.isMock(deviceId)
      const mockDevice = device as any

      // Check each active filter
      if (filters.has('online')) {
        if (device.status === 'online' || device.connected === true) return true
      }
      if (filters.has('offline')) {
        if (device.status === 'offline' || device.connected === false) return true
      }
      if (filters.has('warning')) {
        if (isMock) {
          if (mockDevice.system_state === 'ERROR' ||
              mockDevice.actuators?.some((a: any) => a.emergency_stopped)) return true
        } else if (device.status === 'error') return true
      }
      if (filters.has('safemode')) {
        if (isMock && mockDevice.system_state === 'SAFE_MODE') return true
      }
      return false
    })
  }

  return esps
})

// Counts for filter badges (type filter)
const counts = computed(() => ({
  all: espStore.devices.length,
  mock: espStore.mockDevices.length,
  real: espStore.realDevices.length,
}))

// Group filtered ESPs by zone (excluding unassigned - shown in bottom bar)
const zoneGroups = computed(() => {
  const allGroups = groupDevicesByZone(filteredEsps.value)
  // Filter out unassigned group - it's shown in UnassignedDropBar
  return allGroups.filter(g => g.zoneId !== ZONE_UNASSIGNED)
})

// Handle zone drop event
// NOTE: handleDeviceDrop() already calls espStore.fetchAll() internally,
// so we don't need to call it again here (BUG-001 fix)
async function onDeviceDropped(payload: {
  device: any
  fromZoneId: string | null
  toZoneId: string
}) {
  await handleDeviceDrop(payload)
}

// =============================================================================
// Phase 0: Event Handlers from ZoneGroup
// These handlers were missing - ZoneGroup emits them but DashboardView wasn't handling them
// =============================================================================

/**
 * Handle heartbeat request from ZoneGroup/ESPCard
 * Only works for Mock ESPs - Real ESPs send heartbeats automatically
 */
async function handleHeartbeat(espId: string) {
  if (!espStore.isMock(espId)) {
    // Real ESPs send heartbeats automatically every 60 seconds
    // There's no server endpoint to request a heartbeat from real devices
    logger.info(`Heartbeat request ignored for Real ESP ${espId} - they send automatically`)
    return
  }

  try {
    await espStore.triggerHeartbeat(espId)
    logger.info(`Heartbeat triggered for Mock ESP ${espId}`)
  } catch (err) {
    logger.error(`Failed to trigger heartbeat for ${espId}`, err)
  }
}

/**
 * Handle delete request from ZoneGroup/ESPCard
 * Works for both Mock and Real ESPs with confirmation dialog
 */
async function handleDelete(espId: string) {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  const displayName = device?.name || espId

  const confirmed = await uiStore.confirm({
    title: 'Gerät löschen',
    message: `Möchtest du "${displayName}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
    variant: 'danger',
    confirmText: 'Löschen',
  })
  if (!confirmed) return

  try {
    await espStore.deleteDevice(espId)
    logger.info(`Device ${espId} deleted successfully`)
  } catch (err) {
    logger.error(`Failed to delete device ${espId}`, err)
  }
}

/**
 * Handle safe-mode toggle from ZoneGroup/ESPCard
 * Only works for Mock ESPs - toggles between OPERATIONAL and SAFE_MODE
 */
async function handleToggleSafeMode(espId: string) {
  if (!espStore.isMock(espId)) {
    logger.warn(`Safe-mode toggle not available for Real ESP ${espId}`)
    return
  }

  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  if (!device) {
    logger.warn(`Device ${espId} not found`)
    return
  }

  // Type assertion for Mock ESP device with system_state
  const mockDevice = device as { system_state?: string }
  const currentState = mockDevice.system_state

  // Toggle between SAFE_MODE and OPERATIONAL
  const newState = currentState === 'SAFE_MODE' ? 'OPERATIONAL' : 'SAFE_MODE'

  try {
    await espStore.setState(espId, newState as any, 'Manueller Wechsel über Dashboard')
    logger.info(`Safe-mode toggled for ${espId}: ${currentState} → ${newState}`)
  } catch (err) {
    logger.error(`Failed to toggle safe-mode for ${espId}`, err)
  }
}

/**
 * Handle settings request from ESPOrbitalLayout
 * Opens ESPSettingsSheet with the selected device
 */
function handleSettings(device: ESPDevice) {
  const deviceId = espStore.getDeviceId(device)
  logger.info(`Settings requested for ${deviceId}`)

  // Open ESPSettingsSheet
  settingsDevice.value = device
  isSettingsOpen.value = true
}

/**
 * Handle popover close
 */
function handleSettingsClose() {
  isSettingsOpen.value = false
  // Keep settingsDevice for a moment to allow closing animation
  setTimeout(() => {
    if (!isSettingsOpen.value) {
      settingsDevice.value = null
    }
  }, 200)
}

/**
 * Handle device deletion from popover
 */
function handleDeviceDeleted(payload: { deviceId: string }) {
  logger.info(`Device ${payload.deviceId} was deleted via popover`)
  // Device list will be updated automatically via store
  handleSettingsClose()
}

/**
 * Handle name update from ESPOrbitalLayout or ESPSettingsSheet (Phase 3)
 */
function handleNameUpdated(payload: { deviceId: string; name: string | null }) {
  logger.info(`Device name updated: ${payload.deviceId} → "${payload.name || 'Unbenannt'}"`)
  // Store is already updated via updateDevice(), just log for debugging
}

/**
 * Handle zone update from ESPSettingsSheet (Phase 4)
 * Zone assignment is already processed by ZoneAssignmentPanel → zonesApi → ESP Store
 * This handler is for logging and potential future cross-component coordination
 */
function handleZoneUpdated(payload: { deviceId: string; zoneId: string; zoneName: string }) {
  logger.info(`Zone updated: ${payload.deviceId} → "${payload.zoneName}" (${payload.zoneId})`)
  // ESP Store is updated via WebSocket event from server
  // Card will automatically move to correct ZoneGroup via reactive computed
}

/**
 * Handle opening pending devices panel
 * Captures the button element for anchor-based positioning
 */
function handleOpenPendingDevices(event: MouseEvent) {
  pendingButtonAnchor.value = event.currentTarget as HTMLElement
  showPendingDevices.value = true
}

// =============================================================================
// Rules Activity Ribbon
// =============================================================================

/** Latest rule execution for display */
const latestExecution = computed(() => {
  if (logicStore.recentExecutions.length === 0) return null
  return logicStore.recentExecutions[0]
})

/** Format Unix timestamp (seconds) to relative German time string */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000)
  if (seconds < 60) return 'gerade eben'
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`
  return `vor ${Math.floor(seconds / 86400)} Tagen`
}
</script>

<template>
  <div class="dashboard-view">
    <!-- Action Bar (replaces StatCards and Status Filters) -->
    <!-- Type Filter is now consolidated into ActionBar (Robin UX feedback) -->
    <ActionBar
      :online-count="onlineCount"
      :offline-count="offlineCount"
      :warning-count="warningCount"
      :safe-mode-count="safeModeCount"
      :pending-count="pendingCount"
      :active-filters="activeStatusFilters"
      :has-problems="hasProblems"
      :problem-message="problemMessage"
      :filter-type="filterType"
      :total-count="counts.all"
      :mock-count="counts.mock"
      :real-count="counts.real"
      @toggle-filter="toggleStatusFilter"
      @update:filter-type="filterType = $event"
      @create-mock-esp="showCreateMockModal = true"
      @open-pending-devices="handleOpenPendingDevices"
    />

    <!-- Rules Activity Ribbon -->
    <div v-if="logicStore.ruleCount > 0 || logicStore.recentExecutions.length > 0" class="rules-ribbon">
      <div class="rules-ribbon__status">
        <Workflow class="w-4 h-4" />
        <span>{{ logicStore.enabledCount }} / {{ logicStore.ruleCount }} Regeln aktiv</span>
        <span v-if="logicStore.activeExecutions.size > 0" class="rules-ribbon__pulse" />
      </div>

      <div class="rules-ribbon__divider" />

      <div v-if="latestExecution" class="rules-ribbon__last-exec">
        <span
          class="rules-ribbon__exec-dot"
          :class="latestExecution.success ? 'rules-ribbon__exec-dot--ok' : 'rules-ribbon__exec-dot--fail'"
        />
        <span>{{ latestExecution.rule_name }}</span>
        <span class="rules-ribbon__time">{{ formatTimeAgo(latestExecution.timestamp) }}</span>
      </div>
      <div v-else class="rules-ribbon__last-exec">
        <span class="rules-ribbon__time">Noch keine Ausführungen</span>
      </div>

      <RouterLink to="/logic" class="rules-ribbon__link">
        Regeln verwalten →
      </RouterLink>
    </div>

    <!-- Loading -->
    <LoadingState v-if="espStore.isLoading && espStore.devices.length === 0" text="Lade ESP-Geräte..." />

    <!-- Empty State -->
    <EmptyState
      v-else-if="espStore.devices.length === 0"
      :icon="Plus"
      title="Keine ESP-Geräte"
      description="Erstellen Sie Ihr erstes Mock-ESP32-Gerät, um mit dem Testen zu beginnen."
      action-text="Gerät erstellen"
      @action="showCreateMockModal = true"
    />

    <!-- No Results (with filters) -->
    <div
      v-else-if="filteredEsps.length === 0"
      class="card p-8 text-center"
    >
      <Filter class="w-12 h-12 mx-auto mb-4" style="color: var(--color-text-muted)" />
      <h3 class="font-semibold mb-2" style="color: var(--color-text-secondary)">
        Keine Ergebnisse
      </h3>
      <p style="color: var(--color-text-muted)" class="mb-4">
        Keine Geräte entsprechen den aktuellen Filtern.
      </p>
      <button class="btn-secondary" @click="resetFilters">
        Filter zurücksetzen
      </button>
    </div>

    <!-- Zone-Grouped ESP Grid with Cross-ESP Overlay and Sensor Sidebar -->
    <div v-else class="dashboard-main-layout">
      <!-- Main Content Area -->
      <div class="zone-groups-wrapper">
        <!-- Cross-ESP Connection Overlay (renders on top of all ESPs) -->
        <CrossEspConnectionOverlay
          :show="showCrossEspConnections"
          :show-labels="true"
        />

        <div class="zone-groups-container">
          <!-- Empty State when all devices are unassigned -->
          <div v-if="zoneGroups.length === 0" class="no-zones-hint">
            <p>Alle Geräte sind noch keiner Zone zugewiesen.</p>
            <p class="text-sm">Ziehe Geräte aus der unteren Leiste in eine Zone.</p>
          </div>

          <ZoneGroup
            v-for="group in zoneGroups"
            :key="group.zoneId"
            :zone-id="group.zoneId"
            :zone-name="group.zoneName"
            :devices="group.devices"
            :is-unassigned="false"
            :compact-mode="true"
            :enable-drag-drop="true"
            :default-expanded="true"
            @device-dropped="onDeviceDropped"
            @heartbeat="handleHeartbeat"
            @delete="handleDelete"
            @toggle-safe-mode="handleToggleSafeMode"
          >
            <!-- Use ESPOrbitalLayout for Dashboard (compact view with sensors/actuators) -->
            <template #device="{ device }">
              <ESPOrbitalLayout
                :device="device"
                :show-connections="false"
                :compact-mode="true"
                @heartbeat="(d) => handleHeartbeat(espStore.getDeviceId(d))"
                @delete="(d) => handleDelete(espStore.getDeviceId(d))"
                @settings="handleSettings"
                @name-updated="handleNameUpdated"
              />
            </template>
          </ZoneGroup>
        </div>

        <!-- Cross-ESP Toggle (if connections exist) -->
        <button
          v-if="logicStore.crossEspConnections.length > 0"
          class="cross-esp-toggle"
          :class="{ 'cross-esp-toggle--active': showCrossEspConnections }"
          @click="showCrossEspConnections = !showCrossEspConnections"
          :title="showCrossEspConnections ? 'Verbindungen ausblenden' : 'Verbindungen einblenden'"
        >
          <GitBranch class="w-4 h-4" />
          <span>{{ logicStore.crossEspConnections.length }} Cross-ESP</span>
        </button>
      </div>

      <!-- Komponenten-Sidebar (rechte Seite) -->
      <ComponentSidebar />
    </div>

    <!-- Fixed Bottom Bar for Unassigned Devices -->
    <UnassignedDropBar />

    <!-- Create Mock ESP Modal -->
    <CreateMockEspModal
      v-model="showCreateMockModal"
      @created="onMockEspCreated"
    />

    <!-- Pending Devices Panel (Discovery/Approval) -->
    <PendingDevicesPanel
      v-model:is-open="showPendingDevices"
      :anchor-el="pendingButtonAnchor"
      @close="showPendingDevices = false"
    />

    <!-- ESP Settings Sheet (Slide-in from right) -->
    <ESPSettingsSheet
      v-if="settingsDevice"
      :device="settingsDevice"
      :is-open="isSettingsOpen"
      @update:is-open="isSettingsOpen = $event"
      @close="handleSettingsClose"
      @deleted="handleDeviceDeleted"
      @heartbeat-triggered="(p) => handleHeartbeat(p.deviceId)"
      @name-updated="handleNameUpdated"
      @zone-updated="handleZoneUpdated"
    />

  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD VIEW — Mission Control Main View
   Staggered entrance, token-aligned spacing
   ═══════════════════════════════════════════════════════════════════════════ */

.dashboard-view {
  /* Let shell__content handle scrolling — no nested scroll context */
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: 120px; /* Account for fixed UnassignedDropBar */
}

/* ── Staggered Page Entrance ── */
.dashboard-view > :nth-child(1) {
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
}

.dashboard-view > :nth-child(2) {
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) 0.10s both;
}

.dashboard-view > :nth-child(3) {
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
}

.dashboard-view > :nth-child(4) {
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) 0.20s both;
}

/* ── Rules Activity Ribbon ── */
.rules-ribbon {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.rules-ribbon__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.rules-ribbon__pulse {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-iridescent-1);
  animation: rules-pulse 1.5s ease-in-out infinite;
}

.rules-ribbon__divider {
  width: 1px;
  height: 20px;
  background: var(--glass-border);
  flex-shrink: 0;
}

.rules-ribbon__last-exec {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  min-width: 0;
  overflow: hidden;
}

.rules-ribbon__last-exec > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rules-ribbon__exec-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.rules-ribbon__exec-dot--ok {
  background: var(--color-success);
}

.rules-ribbon__exec-dot--fail {
  background: var(--color-error);
}

.rules-ribbon__time {
  color: var(--color-text-muted);
  opacity: 0.7;
  white-space: nowrap;
}

.rules-ribbon__link {
  margin-left: auto;
  color: var(--color-accent-bright);
  font-weight: 500;
  font-size: var(--text-sm);
  text-decoration: none;
  transition: color var(--transition-fast);
  white-space: nowrap;
}

.rules-ribbon__link:hover {
  color: var(--color-iridescent-2);
}

@media (max-width: 640px) {
  .rules-ribbon {
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .rules-ribbon__divider {
    display: none;
  }

  .rules-ribbon__link {
    width: 100%;
    text-align: center;
    margin-left: 0;
  }
}

/* ── Emergency Alert ── */
.emergency-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  background-color: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: var(--radius-md);
  color: var(--color-error);
}

/* ── Zone Groups Container ── */
.zone-groups-container {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  overflow: visible;
}

.no-zones-hint {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-muted);
  background: var(--glass-bg);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
}

.no-zones-hint p {
  margin: 0;
}

.no-zones-hint .text-sm {
  font-size: var(--text-sm);
  opacity: 0.7;
  margin-top: var(--space-2);
}

@media (min-width: 1600px) {
  .zone-groups-container {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 450px), 1fr));
    gap: var(--space-6);
  }
}

/* ── Dashboard Main Layout ── */
.dashboard-main-layout {
  display: flex;
  gap: 0;
  min-height: 400px;
}

.zone-groups-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}

/* ── Cross-ESP Toggle ── */
.cross-esp-toggle {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  z-index: 100;
  box-shadow: var(--elevation-raised);
}

.cross-esp-toggle:hover {
  border-color: var(--color-accent-bright);
  color: var(--color-text-primary);
  transform: translateY(-2px);
  box-shadow: var(--elevation-floating);
}

.cross-esp-toggle--active {
  background: var(--gradient-iridescent);
  border-color: transparent;
  color: white;
}

.cross-esp-toggle--active:hover {
  border-color: transparent;
  color: white;
  box-shadow: 0 6px 20px rgba(96, 165, 250, 0.4);
}

/* ── Modal Overlay ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background-color: rgba(7, 7, 13, 0.85);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
</style>
