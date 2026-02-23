<script setup lang="ts">
/**
 * DashboardView
 *
 * Main dashboard with two-level zoom navigation:
 * Level 1: Zone Overview (ZonePlates)
 * Level 2: Zone Detail (ZoneMonitorView — sensors & actuators)
 *
 * Clicking a device in Level 2 opens the ESPSettingsSheet slide-in
 * panel instead of zooming to a separate Level 3.
 *
 * Level 3 (DeviceDetailView) is preserved in DOM for backwards-
 * compatible route-based access but is not reached via normal
 * dashboard navigation.
 *
 * All levels exist in DOM simultaneously (v-show),
 * connected by CSS zoom transitions via useZoomNavigation.
 *
 * Header controls (filters, breadcrumb, actions) are delegated
 * to the TopBar via the dashboard store.
 */

import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useLogicStore } from '@/shared/stores/logic.store'
import { useUiStore, useDashboardStore, useDragStateStore } from '@/shared/stores'
import type { ESPDevice } from '@/api/esp'
import { useZoneDragDrop, ZONE_UNASSIGNED, useKeyboardShortcuts, useSwipeNavigation } from '@/composables'
import { useZoomNavigation } from '@/composables/useZoomNavigation'
import { Plus, Filter, GitBranch, Workflow } from 'lucide-vue-next'
import { createLogger } from '@/utils/logger'

const logger = createLogger('Dashboard')

// Components
import ViewTabBar from '@/components/common/ViewTabBar.vue'
import CreateMockEspModal from '@/components/modals/CreateMockEspModal.vue'
import ESPSettingsSheet from '@/components/esp/ESPSettingsSheet.vue'
import ComponentSidebar from '@/components/dashboard/ComponentSidebar.vue'
import UnassignedDropBar from '@/components/dashboard/UnassignedDropBar.vue'
import PendingDevicesPanel from '@/components/esp/PendingDevicesPanel.vue'
import { EmptyState } from '@/shared/design/patterns'
import BaseSkeleton from '@/shared/design/primitives/BaseSkeleton.vue'

// Zoom components
import ZonePlate from '@/components/dashboard/ZonePlate.vue'
import ZoneMonitorView from '@/components/zones/ZoneMonitorView.vue'
import DeviceDetailView from '@/components/esp/DeviceDetailView.vue'

const router = useRouter()
const route = useRoute()
const espStore = useEspStore()
const logicStore = useLogicStore()
const uiStore = useUiStore()
const dashStore = useDashboardStore()
const dragStore = useDragStateStore()
const { groupDevicesByZone, handleDeviceDrop } = useZoneDragDrop()
const zoomNav = useZoomNavigation()
const { register } = useKeyboardShortcuts()

// Swipe navigation for mobile zoom-back
const zoomContainerRef = ref<HTMLElement | null>(null)
useSwipeNavigation(zoomContainerRef, {
  onSwipeRight: () => {
    if (zoomNav.currentLevel.value > 1 && !zoomNav.isTransitioning.value) {
      zoomNav.zoomOut()
    }
  },
})

// Settings popover state
const settingsDevice = ref<ESPDevice | null>(null)
const isSettingsOpen = ref(false)

// Cross-ESP connections toggle
const showCrossEspConnections = ref(true)

// =============================================================================
// Dashboard Store: Activate/Deactivate
// =============================================================================
onMounted(() => {
  dashStore.activate()
  espStore.fetchAll()
  espStore.fetchPendingDevices()
  logicStore.fetchRules()
  logicStore.subscribeToWebSocket()
})

onUnmounted(() => {
  dashStore.deactivate()
  logicStore.unsubscribeFromWebSocket()
})

// Keyboard: Escape to zoom out
const unregisterEscape = register({
  key: 'Escape',
  handler: () => {
    if (zoomNav.currentLevel.value > 1 && !zoomNav.isTransitioning.value) {
      zoomNav.zoomOut()
    }
  },
  description: 'Zoom zurück zur Übersicht',
  scope: 'global',
})

onUnmounted(() => {
  unregisterEscape()
})

// =============================================================================
// Query Parameter Support: ?openSettings=ESP_ID
// =============================================================================
watch(
  [() => route.query.openSettings, () => espStore.devices, () => espStore.isLoading],
  ([openSettingsId, devices, isLoading]) => {
    if (isLoading || !devices.length) return
    if (!openSettingsId || typeof openSettingsId !== 'string') return

    const device = devices.find(d => espStore.getDeviceId(d) === openSettingsId)
    if (device) {
      settingsDevice.value = device
      isSettingsOpen.value = true
      logger.info(`Opened settings for ${openSettingsId} via query parameter`)
    } else {
      logger.warn(`Device ${openSettingsId} not found for openSettings query`)
    }

    const { openSettings: _, ...remainingQuery } = route.query
    router.replace({ query: remainingQuery })
  },
  { immediate: true }
)

// =============================================================================
// Status counts → Dashboard Store
// =============================================================================
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

const counts = computed(() => ({
  all: espStore.devices.length,
  mock: espStore.mockDevices.length,
  real: espStore.realDevices.length,
}))

// Sync counts to dashboard store
watch(
  [onlineCount, offlineCount, warningCount, safeModeCount],
  ([on, off, warn, safe]) => {
    dashStore.statusCounts = { online: on, offline: off, warning: warn, safeMode: safe }
  },
  { immediate: true }
)

watch(counts, (c) => {
  dashStore.deviceCounts = { all: c.all, mock: c.mock, real: c.real }
}, { immediate: true })

watch(pendingCount, (c) => {
  dashStore.pendingCount = c
}, { immediate: true })

// =============================================================================
// Filtered ESPs & Zone Grouping (reads filters from dashboard store)
// =============================================================================
const filteredEsps = computed(() => {
  let esps = espStore.devices

  if (dashStore.filterType === 'mock') {
    esps = esps.filter(e => espStore.isMock(espStore.getDeviceId(e)))
  } else if (dashStore.filterType === 'real') {
    esps = esps.filter(e => !espStore.isMock(espStore.getDeviceId(e)))
  }

  const filters = dashStore.activeStatusFilters
  if (filters.size > 0) {
    esps = esps.filter(device => {
      const deviceId = espStore.getDeviceId(device)
      const isMock = espStore.isMock(deviceId)
      const mockDevice = device as any

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

// Zone groups for Level 1
const zoneGroups = computed(() => {
  const allGroups = groupDevicesByZone(filteredEsps.value)
  return allGroups.filter(g => g.zoneId !== ZONE_UNASSIGNED)
})

// =============================================================================
// Zoom-specific computed properties
// =============================================================================

/** Devices in the currently selected zone (Level 2) */
const zoneDevices = computed(() => {
  if (!zoomNav.selectedZoneId.value) return []
  return filteredEsps.value.filter(d => d.zone_id === zoomNav.selectedZoneId.value)
})

/** Currently selected device (Level 3) */
const selectedDevice = computed(() => {
  if (!zoomNav.selectedDeviceId.value) return null
  return espStore.devices.find(d =>
    espStore.getDeviceId(d) === zoomNav.selectedDeviceId.value
  ) ?? null
})

/** Zone name for the selected zone */
const selectedZoneName = computed(() => {
  if (!zoomNav.selectedZoneId.value) return ''
  const first = zoneDevices.value[0]
  return first?.zone_name || zoomNav.selectedZoneId.value
})

/** Device display name for breadcrumb */
const selectedDeviceName = computed(() => {
  if (!selectedDevice.value) return ''
  return selectedDevice.value.name || espStore.getDeviceId(selectedDevice.value)
})

// =============================================================================
// Breadcrumb → Dashboard Store
// =============================================================================
watch(
  [() => zoomNav.currentLevel.value, selectedZoneName, selectedDeviceName],
  ([level, zone, device]) => {
    dashStore.breadcrumb = {
      level: level as 1 | 2 | 3,
      zoneName: zone,
      deviceName: device,
    }
  },
  { immediate: true }
)

// Watch navigation requests from TopBar breadcrumb
watch(() => dashStore.navRequestCount, () => {
  const target = dashStore.navTarget
  if (target < zoomNav.currentLevel.value && !zoomNav.isTransitioning.value) {
    zoomNav.zoomToLevel(target)
  }
})

// =============================================================================
// Event Handlers
// =============================================================================

function resetFilters() {
  dashStore.resetFilters()
}

function onMockEspCreated(espId: string) {
  espStore.fetchAll()
  logger.info(`Mock ESP erstellt: ${espId}`)
}

async function onDeviceDropped(payload: {
  device: any
  fromZoneId: string | null
  toZoneId: string
}) {
  await handleDeviceDrop(payload)
}

async function handleHeartbeat(espId: string) {
  if (!espStore.isMock(espId)) {
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

function handleSettings(device: ESPDevice) {
  const deviceId = espStore.getDeviceId(device)
  logger.info(`Settings requested for ${deviceId}`)
  settingsDevice.value = device
  isSettingsOpen.value = true
}

function handleSettingsClose() {
  isSettingsOpen.value = false
  setTimeout(() => {
    if (!isSettingsOpen.value) {
      settingsDevice.value = null
    }
  }, 200)
}

function handleDeviceDeleted(payload: { deviceId: string }) {
  logger.info(`Device ${payload.deviceId} was deleted via popover`)
  handleSettingsClose()
}

function handleNameUpdated(payload: { deviceId: string; name: string | null }) {
  logger.info(`Device name updated: ${payload.deviceId} → "${payload.name || 'Unbenannt'}"`)
}

function handleZoneUpdated(payload: { deviceId: string; zoneId: string; zoneName: string }) {
  logger.info(`Zone updated: ${payload.deviceId} → "${payload.zoneName}" (${payload.zoneId})`)
}

// =============================================================================
// Zoom Navigation Handlers
// =============================================================================

function onZonePlateClick(payload: { zoneId: string; originRect: DOMRect }) {
  zoomNav.zoomToZone(payload.zoneId, payload.originRect)
}

function onDeviceCardClick(payload: { deviceId: string; originRect: DOMRect }) {
  // Instead of zooming to Level 3, open the ESPSettingsSheet for this device.
  // Level 3 is kept in DOM for backwards-compatible route-based access.
  const device = espStore.devices.find(d =>
    espStore.getDeviceId(d) === payload.deviceId
  )
  if (device) {
    handleSettings(device)
  }
}

// =============================================================================
// Rules Activity Ribbon
// =============================================================================

const latestExecution = computed(() => {
  if (logicStore.recentExecutions.length === 0) return null
  return logicStore.recentExecutions[0]
})

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000)
  if (seconds < 60) return 'gerade eben'
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`
  return `vor ${Math.floor(seconds / 86400)} Tagen`
}
</script>

<template>
  <div :class="['dashboard-view', 'dashboard-view--level-' + zoomNav.currentLevel.value]">
    <!-- Tab Navigation (Hardware / Monitor / Dashboard) -->
    <ViewTabBar />

    <!-- Rules Activity Ribbon (compact, visible on all levels) -->
    <div v-if="logicStore.ruleCount > 0 || logicStore.recentExecutions.length > 0" class="rules-ribbon">
      <div class="rules-ribbon__status">
        <Workflow class="rules-ribbon__icon" />
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
    <BaseSkeleton v-if="espStore.isLoading && espStore.devices.length === 0" text="Lade ESP-Geräte..." />

    <!-- Empty State -->
    <EmptyState
      v-else-if="espStore.devices.length === 0"
      :icon="Plus"
      title="Keine ESP-Geräte"
      description="Erstellen Sie Ihr erstes Mock-ESP32-Gerät, um mit dem Testen zu beginnen."
      action-text="Gerät erstellen"
      @action="dashStore.showCreateMock = true"
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

    <!-- ═══════════════════════════════════════════════════════════════════
         THREE-LEVEL ZOOM DASHBOARD
         All levels exist simultaneously, controlled by v-show + CSS classes
         ═══════════════════════════════════════════════════════════════════ -->
    <template v-else>
      <div class="dashboard-main-layout">
        <div ref="zoomContainerRef" class="zoom-container">

          <!-- ═══ LEVEL 1: Zone Overview ═══════════════════════════════ -->
          <div
            v-show="zoomNav.currentLevel.value === 1 || zoomNav.isTransitioning.value"
            :class="zoomNav.level1Class.value"
          >
            <!-- Zone Plates Grid -->
            <div class="zone-plates-grid">
              <div v-if="zoneGroups.length === 0" class="no-zones-hint">
                <p>Alle Geräte sind noch keiner Zone zugewiesen.</p>
                <p class="text-sm">Ziehe Geräte aus der unteren Leiste in eine Zone.</p>
              </div>

              <ZonePlate
                v-for="group in zoneGroups"
                :key="group.zoneId"
                :zone-id="group.zoneId"
                :zone-name="group.zoneName"
                :devices="group.devices"
                :is-drop-target="dragStore.isDraggingEspCard"
                @click="onZonePlateClick"
                @device-click="onDeviceCardClick"
                @device-dropped="onDeviceDropped"
                @settings="handleSettings"
              />
            </div>

            <!-- Cross-ESP Toggle -->
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

          <!-- ═══ LEVEL 2: Zone Detail ═════════════════════════════════ -->
          <div
            v-show="zoomNav.currentLevel.value === 2 || zoomNav.isTransitioning.value"
            :class="zoomNav.level2Class.value"
          >
            <ZoneMonitorView
              v-if="zoomNav.selectedZoneId.value"
              :zone-id="zoomNav.selectedZoneId.value"
              :zone-name="selectedZoneName"
              :devices="zoneDevices"
              @device-click="onDeviceCardClick"
              @back="zoomNav.zoomOut()"
              @heartbeat="handleHeartbeat"
              @delete="handleDelete"
              @settings="handleSettings"
            />
          </div>

          <!-- ═══ LEVEL 3: Device Detail (Legacy — kept for route-based access) ═══
               Normal dashboard navigation now opens ESPSettingsSheet instead.
               This level is only reached if someone navigates directly via URL. -->
          <div
            v-show="zoomNav.currentLevel.value === 3 || zoomNav.isTransitioning.value"
            :class="zoomNav.level3Class.value"
          >
            <DeviceDetailView
              v-if="selectedDevice"
              :device="selectedDevice"
              :zone-id="zoomNav.selectedZoneId.value || ''"
              :zone-name="selectedZoneName"
              @back="zoomNav.zoomOut()"
              @settings="handleSettings"
              @delete="handleDelete"
              @heartbeat="handleHeartbeat"
              @name-updated="handleNameUpdated"
            />
          </div>

        </div>

        <!-- Component Sidebar (Legacy — only visible if Level 3 is reached via direct route) -->
        <ComponentSidebar v-show="zoomNav.currentLevel.value === 3" />
      </div>
    </template>

    <!-- Fixed Bottom Bar for Unassigned Devices -->
    <UnassignedDropBar />

    <!-- Create Mock ESP Modal (triggered by TopBar via store) -->
    <CreateMockEspModal
      v-model="dashStore.showCreateMock"
      @created="onMockEspCreated"
    />

    <!-- Pending Devices Panel (triggered by TopBar via store) -->
    <PendingDevicesPanel
      v-model:is-open="dashStore.showPendingPanel"
      :anchor-el="null"
      @close="dashStore.showPendingPanel = false"
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
   DASHBOARD VIEW — Three-Level Zoom Mission Control
   ═══════════════════════════════════════════════════════════════════════════ */

.dashboard-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: 120px;
  position: relative;
  background-color: var(--color-bg-level-1);
  transition: background-color var(--transition-slow);
}

/* Level-aware background color */
.dashboard-view--level-2 {
  background-color: var(--color-bg-level-2);
}

.dashboard-view--level-3 {
  background-color: var(--color-bg-level-3);
}

/* Ambient glow pseudo-element per level */
.dashboard-view::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 300px;
  pointer-events: none;
  z-index: 0;
  opacity: 0;
  transition: opacity var(--transition-slow), background var(--transition-slow);
}

/* Level 2: subtle blue radial glow */
.dashboard-view--level-2::before {
  opacity: 1;
  background: radial-gradient(
    ellipse 80% 200px at 50% 0%,
    rgba(96, 165, 250, 0.04) 0%,
    transparent 70%
  );
}

/* Level 3: stronger violet radial glow */
.dashboard-view--level-3::before {
  opacity: 1;
  background: radial-gradient(
    ellipse 80% 250px at 50% 0%,
    rgba(167, 139, 250, 0.06) 0%,
    rgba(96, 165, 250, 0.02) 40%,
    transparent 70%
  );
}

/* ── Staggered Page Entrance ── */
.dashboard-view > :nth-child(1) {
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
}

.dashboard-view > :nth-child(2) {
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) 0.10s both;
}

/* ── Rules Activity Ribbon (compact: ~32px) ── */
.rules-ribbon {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-3);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
}

.rules-ribbon__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.rules-ribbon__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.rules-ribbon__pulse {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-iridescent-1);
  animation: rules-pulse 1.5s ease-in-out infinite;
}

.rules-ribbon__divider {
  width: 1px;
  height: 16px;
  background: var(--glass-border);
  flex-shrink: 0;
}

.rules-ribbon__last-exec {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
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
  font-size: var(--text-xs);
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

/* ── Dashboard Main Layout ── */
.dashboard-main-layout {
  display: flex;
  gap: 0;
  min-height: 400px;
}

.zoom-container {
  position: relative;
  flex: 1;
  min-width: 0;
}

/* ── Zone Plates Grid (Level 1) ── */
.zone-plates-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  overflow: visible;
}

@media (min-width: 1600px) {
  .zone-plates-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr));
    gap: var(--space-6);
  }
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

/* ── Zoom Level CSS ── */
.zoom-level {
  display: none;
}

.zoom-level--active {
  display: block;
  will-change: auto;
}

.zoom-level--exiting {
  display: block;
  pointer-events: none;
  will-change: transform, opacity, filter;
}

.zoom-level--entering {
  display: block;
  will-change: transform, opacity, filter;
}

/* ── Zoom-In exit: shrink + blur into depth ── */
.animate-zoom-in-exit {
  animation: zoom-in-exit 250ms var(--ease-out) forwards;
}

@keyframes zoom-in-exit {
  0% { opacity: 1; transform: scale(1); filter: blur(0); }
  100% { opacity: 0; transform: scale(0.92); filter: blur(4px); }
}

/* ── Zoom-In enter: scale-up with spring overshoot ── */
.animate-zoom-in-enter {
  animation: zoom-in-enter 300ms var(--ease-spring) forwards;
}

@keyframes zoom-in-enter {
  0% { opacity: 0; transform: scale(1.06); filter: blur(4px); }
  100% { opacity: 1; transform: scale(1); filter: blur(0); }
}

/* ── Zoom-Out exit: enlarge + blur ── */
.animate-zoom-out-exit {
  animation: zoom-out-exit 250ms var(--ease-out) forwards;
}

@keyframes zoom-out-exit {
  0% { opacity: 1; transform: scale(1); filter: blur(0); }
  100% { opacity: 0; transform: scale(1.08); filter: blur(4px); }
}

/* ── Zoom-Out enter: shrink-in with spring ── */
.animate-zoom-out-enter {
  animation: zoom-out-enter 300ms var(--ease-spring) forwards;
}

@keyframes zoom-out-enter {
  0% { opacity: 0; transform: scale(0.94); filter: blur(4px); }
  100% { opacity: 1; transform: scale(1); filter: blur(0); }
}

/* Reduced motion: instant transition */
@media (prefers-reduced-motion: reduce) {
  .zoom-level--exiting,
  .zoom-level--entering {
    animation: none !important;
    opacity: 1;
    filter: none !important;
  }
}

/* ── Mobile Responsive Overrides ── */
@media (max-width: 640px) {
  .dashboard-view {
    padding-bottom: 80px;
  }

  .zone-plates-grid {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }

  .dashboard-main-layout {
    flex-direction: column;
  }
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
  z-index: var(--z-tray);
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
</style>
