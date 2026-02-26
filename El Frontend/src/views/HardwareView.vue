<script setup lang="ts">
/**
 * HardwareView — ESP & Hardware Topology (Übersicht)
 *
 * Route: /hardware, /hardware/:zoneId (scroll-anchor), /hardware/:zoneId/:espId
 *
 * Two-level navigation:
 * Level 1: Zone Accordion — all zones as expandable sections with ESP cards
 * Level 2: ESP Detail — single ESP with sensors/actuators (Orbital Layout)
 *
 * Zones are default-expanded, showing DeviceMiniCards directly.
 * Click on ESP card navigates to Orbital Layout (Level 2).
 * /hardware/:zoneId auto-expands and scrolls to that zone.
 */

import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useLogicStore } from '@/shared/stores/logic.store'
import { useUiStore, useDashboardStore } from '@/shared/stores'
import type { ESPDevice } from '@/api/esp'
import { useZoneDragDrop, ZONE_UNASSIGNED, useKeyboardShortcuts, useSwipeNavigation } from '@/composables'
import { useToast } from '@/composables/useToast'
import { zonesApi } from '@/api/zones'
import { Plus, Filter, GitBranch, Workflow } from 'lucide-vue-next'
import { getESPStatus } from '@/composables/useESPStatus'
import { createLogger } from '@/utils/logger'

const logger = createLogger('HardwareView')

// Tab Bar + SlideOver + Config Panels
import ViewTabBar from '@/components/common/ViewTabBar.vue'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import SensorConfigPanel from '@/components/esp/SensorConfigPanel.vue'
import ActuatorConfigPanel from '@/components/esp/ActuatorConfigPanel.vue'
import ESPConfigPanel from '@/components/esp/ESPConfigPanel.vue'

// Components
import CreateMockEspModal from '@/components/modals/CreateMockEspModal.vue'
import ESPSettingsSheet from '@/components/esp/ESPSettingsSheet.vue'
import ComponentSidebar from '@/components/dashboard/ComponentSidebar.vue'
import UnassignedDropBar from '@/components/dashboard/UnassignedDropBar.vue'
import PendingDevicesPanel from '@/components/esp/PendingDevicesPanel.vue'
import LoadingState from '@/shared/design/primitives/BaseSkeleton.vue'
import { EmptyState } from '@/shared/design/patterns'

// Level components
import ZonePlate from '@/components/dashboard/ZonePlate.vue'
import DeviceDetailView from '@/components/esp/DeviceDetailView.vue'

const router = useRouter()
const route = useRoute()
const espStore = useEspStore()
const logicStore = useLogicStore()
const uiStore = useUiStore()
const dashStore = useDashboardStore()
const { groupDevicesByZone, handleDeviceDrop, generateZoneId } = useZoneDragDrop()
const { register } = useKeyboardShortcuts()
const { success: showSuccess, error: showError } = useToast()

// =============================================================================
// Navigation State (route-param based, 2 levels)
// =============================================================================
const currentLevel = computed<1 | 2>(() => {
  if (route.params.espId) return 2
  return 1
})

const selectedZoneId = computed(() => (route.params.zoneId as string) || null)
const selectedEspId = computed(() => (route.params.espId as string) || null)

// Swipe navigation for mobile zoom-back
const zoomContainerRef = ref<HTMLElement | null>(null)
useSwipeNavigation(zoomContainerRef, {
  onSwipeRight: () => {
    if (currentLevel.value > 1) zoomOut()
  },
})

// =============================================================================
// Accordion State — per-zone expand/collapse with localStorage persistence (D3)
// =============================================================================
const COLLAPSE_KEY_PREFIX = 'ao-zone-collapse-'

/** Load persisted collapse state from localStorage */
function loadCollapseState(zoneId: string): boolean | null {
  try {
    const stored = localStorage.getItem(`${COLLAPSE_KEY_PREFIX}${zoneId}`)
    if (stored === null) return null
    return stored === '1'
  } catch {
    return null
  }
}

/** Persist collapse state to localStorage */
function saveCollapseState(zoneId: string, expanded: boolean) {
  try {
    localStorage.setItem(`${COLLAPSE_KEY_PREFIX}${zoneId}`, expanded ? '1' : '0')
  } catch {
    // Ignore storage errors
  }
}

const expandedZones = ref<Set<string>>(new Set())
const allZonesInitialized = ref(false)

/** Initialize zones: restore from localStorage, fallback to smart defaults */
watch(
  () => espStore.devices.length,
  () => {
    if (!allZonesInitialized.value && espStore.devices.length > 0) {
      const allZoneIds = Array.from(new Set(
        espStore.devices
          .filter(d => d.zone_id)
          .map(d => d.zone_id!)
      ))

      const expanded = new Set<string>()
      let hasStoredState = false

      for (const zoneId of allZoneIds) {
        const stored = loadCollapseState(zoneId)
        if (stored !== null) {
          hasStoredState = true
          if (stored) expanded.add(zoneId)
        }
      }

      if (!hasStoredState) {
        // First visit: expand all if ≤4 zones, otherwise only the first
        if (allZoneIds.length <= 4) {
          allZoneIds.forEach(id => expanded.add(id))
        } else if (allZoneIds.length > 0) {
          expanded.add(allZoneIds[0])
        }
      }

      // D3: Zones with offline devices → always expanded
      for (const zoneId of allZoneIds) {
        const devicesInZone = espStore.devices.filter(d => d.zone_id === zoneId)
        const hasOffline = devicesInZone.some(d => {
          const s = getESPStatus(d)
          return s === 'offline' || s === 'error'
        })
        if (hasOffline) expanded.add(zoneId)
      }

      expandedZones.value = expanded
      allZonesInitialized.value = true
    }
  },
  { immediate: true }
)

function isZoneExpanded(zoneId: string): boolean {
  return expandedZones.value.has(zoneId)
}

function setZoneExpanded(zoneId: string, expanded: boolean) {
  const next = new Set(expandedZones.value)
  if (expanded) {
    next.add(zoneId)
  } else {
    next.delete(zoneId)
  }
  expandedZones.value = next
  saveCollapseState(zoneId, expanded)
}

/**
 * When /hardware/:zoneId is navigated to (without espId),
 * auto-expand that zone and scroll to it.
 */
watch(
  () => [selectedZoneId.value, currentLevel.value] as const,
  async ([zoneId, level]) => {
    if (level === 1 && zoneId) {
      // Expand the targeted zone
      setZoneExpanded(zoneId, true)

      // Scroll to the zone element
      await nextTick()
      const el = document.getElementById(`zone-${zoneId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      // Replace route to clean /hardware/:zoneId → /hardware
      // (keeps the zone expanded, removes the intermediate route from history)
      router.replace({ name: 'hardware' })
    }
  },
  { immediate: true }
)

// Modal states
const settingsDevice = ref<ESPDevice | null>(null)
const isSettingsOpen = ref(false)
const showCrossEspConnections = ref(true)

// SlideOver states for config panels
const showSensorConfig = ref(false)
const showActuatorConfig = ref(false)
const showEspConfig = ref(false)
const configSensorData = ref<{ espId: string; gpio: number; sensorType: string; unit: string } | null>(null)
const configActuatorData = ref<{ espId: string; gpio: number; actuatorType: string } | null>(null)
const configEspDevice = ref<ESPDevice | null>(null)

// =============================================================================
// Lifecycle
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
    if (currentLevel.value > 1) zoomOut()
  },
  description: 'Zurück zur Übersicht',
  scope: 'global',
})
onUnmounted(() => unregisterEscape())

// =============================================================================
// Status counts → Dashboard Store
// =============================================================================
const onlineCount = computed(() => espStore.onlineDevices.length)
const offlineCount = computed(() => espStore.offlineDevices.length)

const warningCount = computed(() =>
  espStore.devices.filter(device => {
    const deviceId = espStore.getDeviceId(device)
    if (espStore.isMock(deviceId)) {
      const m = device as any
      return m.system_state === 'ERROR' || m.actuators?.some((a: any) => a.emergency_stopped)
    }
    return device.status === 'error'
  }).length
)

const safeModeCount = computed(() =>
  espStore.devices.filter(device => {
    if (espStore.isMock(espStore.getDeviceId(device))) {
      return (device as any).system_state === 'SAFE_MODE'
    }
    return false
  }).length
)

watch(
  [onlineCount, offlineCount, warningCount, safeModeCount],
  ([on, off, warn, safe]) => {
    dashStore.statusCounts = { online: on, offline: off, warning: warn, safeMode: safe }
  },
  { immediate: true }
)

// =============================================================================
// Filtered ESPs & Zone Grouping
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

      if (filters.has('online') && (device.status === 'online' || device.connected === true)) return true
      if (filters.has('offline') && (device.status === 'offline' || device.connected === false)) return true
      if (filters.has('warning')) {
        if (isMock && (mockDevice.system_state === 'ERROR' || mockDevice.actuators?.some((a: any) => a.emergency_stopped))) return true
        if (!isMock && device.status === 'error') return true
      }
      if (filters.has('safemode') && isMock && mockDevice.system_state === 'SAFE_MODE') return true
      return false
    })
  }

  return esps
})

const zoneGroups = computed(() => {
  const allGroups = groupDevicesByZone(filteredEsps.value)
  const zones = allGroups.filter(g => g.zoneId !== ZONE_UNASSIGNED)

  // D1: Sort zones — offline/warning first, then online, empty last, alpha within
  zones.sort((a, b) => {
    const aHasProblems = a.devices.some(d => {
      const s = getESPStatus(d)
      return s === 'offline' || s === 'error'
    })
    const bHasProblems = b.devices.some(d => {
      const s = getESPStatus(d)
      return s === 'offline' || s === 'error'
    })
    const aEmpty = a.devices.length === 0
    const bEmpty = b.devices.length === 0

    // Problems first
    if (aHasProblems && !bHasProblems) return -1
    if (!aHasProblems && bHasProblems) return 1
    // Empty last
    if (aEmpty && !bEmpty) return 1
    if (!aEmpty && bEmpty) return -1
    // Alpha within same category
    return a.zoneName.localeCompare(b.zoneName)
  })

  return zones
})

/** Unassigned devices (for zone create ESP picker) */
const unassignedDevices = computed(() => {
  const allGroups = groupDevicesByZone(espStore.devices)
  const unassigned = allGroups.find(g => g.zoneId === ZONE_UNASSIGNED)
  return unassigned?.devices || []
})

// =============================================================================
// Zone Create (inline form)
// =============================================================================
const showCreateZoneForm = ref(false)
const newZoneName = ref('')
const selectedEspForNewZone = ref('')

async function handleZoneCreate() {
  const name = newZoneName.value.trim()
  if (!name || !selectedEspForNewZone.value) return

  const zoneId = generateZoneId(name)
  try {
    await zonesApi.assignZone(selectedEspForNewZone.value, {
      zone_id: zoneId,
      zone_name: name,
    })
    showSuccess(`Zone "${name}" erstellt`)
    showCreateZoneForm.value = false
    newZoneName.value = ''
    selectedEspForNewZone.value = ''
    await espStore.fetchAll()
    // Auto-expand the new zone
    setZoneExpanded(zoneId, true)
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Zone konnte nicht erstellt werden')
    logger.error('Failed to create zone', err)
  }
}

function cancelZoneCreate() {
  showCreateZoneForm.value = false
  newZoneName.value = ''
  selectedEspForNewZone.value = ''
}

// =============================================================================
// Level 2 (Orbital) computed
// =============================================================================

const selectedDevice = computed(() => {
  if (!selectedEspId.value) return null
  return espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value) ?? null
})

const selectedZoneName = computed(() => {
  if (!selectedZoneId.value) return ''
  const device = espStore.devices.find(d => d.zone_id === selectedZoneId.value)
  return device?.zone_name || selectedZoneId.value
})

const selectedDeviceName = computed(() => {
  if (!selectedDevice.value) return ''
  return selectedDevice.value.name || espStore.getDeviceId(selectedDevice.value)
})

// =============================================================================
// Breadcrumb → Dashboard Store
// =============================================================================
watch(
  [currentLevel, selectedZoneName, selectedDeviceName],
  ([level, zone, device]) => {
    // Map new 2-level to dashStore's 3-level breadcrumb format
    // Level 2 (Orbital) maps to old Level 3 for TopBar
    const breadcrumbLevel = level === 2 ? 3 : 1
    dashStore.breadcrumb = {
      level: breadcrumbLevel as 1 | 2 | 3,
      zoneName: zone,
      deviceName: device,
    }
  },
  { immediate: true }
)

// =============================================================================
// Navigation helpers
// =============================================================================
function zoomToDevice(deviceId: string) {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === deviceId)
  const zoneId = device?.zone_id || 'unknown'
  router.push({ name: 'hardware-esp', params: { zoneId, espId: deviceId } })
}

function zoomOut() {
  if (currentLevel.value === 2) {
    router.push({ name: 'hardware' })
  }
}

// =============================================================================
// Event Handlers
// =============================================================================

function onDeviceCardClick(payload: { deviceId: string; originRect: DOMRect }) {
  zoomToDevice(payload.deviceId)
}

async function onDeviceDropped(payload: { device: any; fromZoneId: string | null; toZoneId: string }) {
  await handleDeviceDrop(payload)
}

function resetFilters() {
  dashStore.resetFilters()
}

function onMockEspCreated(espId: string) {
  espStore.fetchAll()
  logger.info(`Mock ESP erstellt: ${espId}`)
}

async function handleHeartbeat(espId: string) {
  if (!espStore.isMock(espId)) return
  try {
    await espStore.triggerHeartbeat(espId)
  } catch (err) {
    logger.error(`Failed to trigger heartbeat for ${espId}`, err)
  }
}

async function handleDelete(espId: string) {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  const displayName = device?.name || espId
  const confirmed = await uiStore.confirm({
    title: 'Gerät löschen',
    message: `Möchtest du "${displayName}" wirklich löschen?`,
    variant: 'danger',
    confirmText: 'Löschen',
  })
  if (!confirmed) return
  try {
    await espStore.deleteDevice(espId)
  } catch (err) {
    logger.error(`Failed to delete device ${espId}`, err)
  }
}

function handleSettings(device: ESPDevice) {
  settingsDevice.value = device
  isSettingsOpen.value = true
}

function handleSettingsClose() {
  isSettingsOpen.value = false
  setTimeout(() => { if (!isSettingsOpen.value) settingsDevice.value = null }, 200)
}

function handleDeviceDeleted(_payload: { deviceId: string }) {
  handleSettingsClose()
}

function handleNameUpdated(payload: { deviceId: string; name: string | null }) {
  logger.info(`Device name updated: ${payload.deviceId} → "${payload.name || 'Unbenannt'}"`)
}

function handleZoneUpdated(payload: { deviceId: string; zoneId: string; zoneName: string }) {
  logger.info(`Zone updated: ${payload.deviceId} → "${payload.zoneName}"`)
}

// =============================================================================
// Zone Management (Rename / Delete) — zones are string fields, not DB entities
// =============================================================================

/** Rename zone: reassign all ESPs in the zone with the new zone_name */
async function handleZoneRename(payload: { zoneId: string; newName: string }) {
  const devicesInZone = espStore.devices.filter(d => d.zone_id === payload.zoneId)
  if (devicesInZone.length === 0) return

  try {
    for (const device of devicesInZone) {
      const devId = espStore.getDeviceId(device)
      await zonesApi.assignZone(devId, {
        zone_id: payload.zoneId,
        zone_name: payload.newName,
      })
    }
    showSuccess(`Zone umbenannt zu "${payload.newName}"`)
    await espStore.fetchAll()
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Zone konnte nicht umbenannt werden')
    logger.error(`Failed to rename zone ${payload.zoneId}`, err)
  }
}

/** Delete zone: remove all ESPs from the zone (devices are NOT deleted) */
async function handleZoneDelete(zoneId: string) {
  const devicesInZone = espStore.devices.filter(d => d.zone_id === zoneId)
  if (devicesInZone.length === 0) return

  try {
    for (const device of devicesInZone) {
      const devId = espStore.getDeviceId(device)
      await zonesApi.removeZone(devId)
    }
    showSuccess('Zone gelöscht — Geräte sind jetzt unzugewiesen')
    await espStore.fetchAll()
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Zone konnte nicht gelöscht werden')
    logger.error(`Failed to delete zone ${zoneId}`, err)
  }
}

// =============================================================================
// SlideOver handlers: open config panels from ESP detail view
// =============================================================================

function handleSensorClickFromDetail(payload: { espId: string; gpio: number }) {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === payload.espId)
  const sensors = (device?.sensors as any[]) || []
  const sensor = sensors.find((s: any) => s.gpio === payload.gpio)
  if (!sensor) return

  configSensorData.value = {
    espId: payload.espId,
    gpio: payload.gpio,
    sensorType: sensor.sensor_type || 'unknown',
    unit: sensor.unit || '',
  }
  showSensorConfig.value = true
}

function handleActuatorClickFromDetail(payload: { espId: string; gpio: number }) {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === payload.espId)
  const actuators = (device?.actuators as any[]) || []
  const actuator = actuators.find((a: any) => a.gpio === payload.gpio)
  if (!actuator) return

  configActuatorData.value = {
    espId: payload.espId,
    gpio: payload.gpio,
    actuatorType: actuator.actuator_type || 'relay',
  }
  showActuatorConfig.value = true
}

// Rules Activity
const latestExecution = computed(() => logicStore.recentExecutions[0] ?? null)

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000)
  if (seconds < 60) return 'gerade eben'
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`
  return `vor ${Math.floor(seconds / 86400)} Tagen`
}
</script>

<template>
  <div :class="['hardware-view', currentLevel === 2 ? 'hardware-view--detail' : '']">
    <!-- View Tab Bar (Übersicht / Monitor / Editor) -->
    <ViewTabBar />

    <!-- Rules Activity Ribbon -->
    <div v-if="logicStore.ruleCount > 0 || logicStore.recentExecutions.length > 0" class="rules-ribbon">
      <div class="rules-ribbon__status">
        <Workflow class="rules-ribbon__icon" />
        <span>{{ logicStore.enabledCount }} / {{ logicStore.ruleCount }} Regeln aktiv</span>
        <span v-if="logicStore.activeExecutions.size > 0" class="rules-ribbon__pulse" />
      </div>
      <div class="rules-ribbon__divider" />
      <div v-if="latestExecution" class="rules-ribbon__last-exec">
        <span class="rules-ribbon__exec-dot" :class="latestExecution.success ? 'rules-ribbon__exec-dot--ok' : 'rules-ribbon__exec-dot--fail'" />
        <span>{{ latestExecution.rule_name }}</span>
        <span class="rules-ribbon__time">{{ formatTimeAgo(latestExecution.timestamp) }}</span>
      </div>
      <div v-else class="rules-ribbon__last-exec">
        <span class="rules-ribbon__time">Noch keine Ausführungen</span>
      </div>
      <RouterLink to="/logic" class="rules-ribbon__link">Regeln verwalten →</RouterLink>
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
      @action="dashStore.showCreateMock = true"
    />

    <!-- No Results (filters) -->
    <div v-else-if="filteredEsps.length === 0" class="card p-8 text-center">
      <Filter class="w-12 h-12 mx-auto mb-4" style="color: var(--color-text-muted)" />
      <h3 class="font-semibold mb-2" style="color: var(--color-text-secondary)">Keine Ergebnisse</h3>
      <p style="color: var(--color-text-muted)" class="mb-4">Keine Geräte entsprechen den aktuellen Filtern.</p>
      <button class="btn-secondary" @click="resetFilters">Filter zurücksetzen</button>
    </div>

    <!-- Two-Level Hardware View -->
    <template v-else>
      <div class="hardware-main-layout">
        <div ref="zoomContainerRef" class="zoom-container">

          <!-- LEVEL 1: Zone Accordion Overview -->
          <div v-if="currentLevel === 1" class="zoom-level--active">
            <div class="zone-accordion-list">
              <div v-if="zoneGroups.length === 0" class="no-zones-hint">
                <p>Alle Geräte sind noch keiner Zone zugewiesen.</p>
                <p class="text-sm">Ziehe Geräte aus der unteren Leiste in eine Zone.</p>
              </div>
              <ZonePlate
                v-for="group in zoneGroups"
                :id="`zone-${group.zoneId}`"
                :key="group.zoneId"
                :zone-id="group.zoneId"
                :zone-name="group.zoneName"
                :devices="group.devices"
                :is-expanded="isZoneExpanded(group.zoneId)"
                @update:is-expanded="setZoneExpanded(group.zoneId, $event)"
                @device-click="onDeviceCardClick"
                @device-dropped="onDeviceDropped"
                @rename="handleZoneRename"
                @delete="handleZoneDelete"
                @device-delete="handleDelete"
                @settings="handleSettings"
              />

              <!-- Zone Create: inline form -->
              <div v-if="showCreateZoneForm" class="zone-create-form">
                <input
                  v-model="newZoneName"
                  class="zone-create-form__input"
                  placeholder="Zone-Name"
                  maxlength="60"
                  @keydown.enter.prevent="handleZoneCreate"
                  @keydown.escape.prevent="cancelZoneCreate"
                />
                <select
                  v-model="selectedEspForNewZone"
                  class="zone-create-form__select"
                >
                  <option value="" disabled>ESP wählen...</option>
                  <option
                    v-for="dev in unassignedDevices"
                    :key="espStore.getDeviceId(dev)"
                    :value="espStore.getDeviceId(dev)"
                  >
                    {{ dev.name || espStore.getDeviceId(dev) }}
                  </option>
                </select>
                <button
                  class="zone-create-form__btn zone-create-form__btn--primary"
                  :disabled="!newZoneName.trim() || !selectedEspForNewZone"
                  @click="handleZoneCreate"
                >
                  Erstellen
                </button>
                <button
                  class="zone-create-form__btn"
                  @click="cancelZoneCreate"
                >
                  Abbrechen
                </button>
              </div>

              <!-- + Zone erstellen button -->
              <button
                v-if="!showCreateZoneForm"
                class="zone-create-btn"
                :disabled="unassignedDevices.length === 0"
                :title="unassignedDevices.length === 0 ? 'Keine unzugewiesenen ESPs vorhanden' : 'Neue Zone erstellen'"
                @click="showCreateZoneForm = true"
              >
                <Plus class="zone-create-btn__icon" />
                Zone erstellen
              </button>
            </div>

            <button
              v-if="logicStore.crossEspConnections.length > 0"
              class="cross-esp-toggle"
              :class="{ 'cross-esp-toggle--active': showCrossEspConnections }"
              @click="showCrossEspConnections = !showCrossEspConnections"
            >
              <GitBranch class="w-4 h-4" />
              <span>{{ logicStore.crossEspConnections.length }} Cross-ESP</span>
            </button>
          </div>

          <!-- LEVEL 2: Device Detail (Orbital Layout) -->
          <div v-else-if="currentLevel === 2" class="zoom-level--active">
            <DeviceDetailView
              v-if="selectedDevice"
              :device="selectedDevice"
              :zone-id="selectedZoneId || ''"
              :zone-name="selectedZoneName"
              @back="zoomOut()"
              @settings="handleSettings"
              @delete="handleDelete"
              @heartbeat="handleHeartbeat"
              @name-updated="handleNameUpdated"
              @sensor-click="handleSensorClickFromDetail"
              @actuator-click="handleActuatorClickFromDetail"
            />
          </div>

        </div>

        <!-- Component Sidebar (Level 2 / Orbital only) -->
        <ComponentSidebar v-show="currentLevel === 2" />
      </div>
    </template>

    <!-- Unassigned Devices Bar -->
    <UnassignedDropBar />

    <!-- Create Mock ESP Modal -->
    <CreateMockEspModal v-model="dashStore.showCreateMock" @created="onMockEspCreated" />

    <!-- Pending Devices Panel -->
    <PendingDevicesPanel v-model:is-open="dashStore.showPendingPanel" :anchor-el="null" @close="dashStore.showPendingPanel = false" />

    <!-- ESP Settings Sheet -->
    <ESPSettingsSheet
      v-if="settingsDevice"
      :device="settingsDevice"
      :is-open="isSettingsOpen"
      @update:is-open="isSettingsOpen = $event"
      @close="handleSettingsClose"
      @deleted="handleDeviceDeleted"
      @heartbeat-triggered="(p: any) => handleHeartbeat(p.deviceId)"
      @name-updated="handleNameUpdated"
      @zone-updated="handleZoneUpdated"
    />

    <!-- Sensor Config SlideOver -->
    <SlideOver
      :open="showSensorConfig"
      :title="configSensorData?.sensorType || 'Sensor'"
      width="lg"
      @close="showSensorConfig = false"
    >
      <SensorConfigPanel
        v-if="configSensorData"
        :esp-id="configSensorData.espId"
        :gpio="configSensorData.gpio"
        :sensor-type="configSensorData.sensorType"
        :unit="configSensorData.unit"
      />
    </SlideOver>

    <!-- Actuator Config SlideOver -->
    <SlideOver
      :open="showActuatorConfig"
      :title="configActuatorData?.actuatorType || 'Aktor'"
      width="lg"
      @close="showActuatorConfig = false"
    >
      <ActuatorConfigPanel
        v-if="configActuatorData"
        :esp-id="configActuatorData.espId"
        :gpio="configActuatorData.gpio"
        :actuator-type="configActuatorData.actuatorType"
      />
    </SlideOver>

    <!-- ESP Config SlideOver -->
    <SlideOver
      :open="showEspConfig"
      :title="configEspDevice?.name || 'ESP'"
      width="lg"
      @close="showEspConfig = false"
    >
      <ESPConfigPanel
        v-if="configEspDevice"
        :device="configEspDevice"
      />
    </SlideOver>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   HARDWARE VIEW — Two-level zone accordion + orbital detail
   ═══════════════════════════════════════════════════════════════════════════ */

.hardware-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: 120px;
  position: relative;
  background-color: var(--color-bg-level-1);
  transition: background-color var(--transition-slow);
}

.hardware-view--detail { background-color: var(--color-bg-level-3); }

.hardware-main-layout {
  display: flex;
  gap: 0;
  min-height: 400px;
}

.zoom-container {
  position: relative;
  flex: 1;
  min-width: 0;
}

.zoom-level--active {
  display: block;
  animation: fade-in 0.25s var(--ease-out) both;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Zone Accordion List — vertical stack */
.zone-accordion-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.no-zones-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-muted);
  background: var(--glass-bg);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
}

/* Rules Ribbon */
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

.rules-ribbon__icon { width: 14px; height: 14px; flex-shrink: 0; }
.rules-ribbon__pulse { width: 7px; height: 7px; border-radius: var(--radius-full); background: var(--color-iridescent-1); animation: rules-pulse 1.5s ease-in-out infinite; }
.rules-ribbon__divider { width: 1px; height: 16px; background: var(--glass-border); flex-shrink: 0; }
.rules-ribbon__last-exec { display: flex; align-items: center; gap: var(--space-1); color: var(--color-text-muted); min-width: 0; overflow: hidden; }
.rules-ribbon__exec-dot { width: 6px; height: 6px; border-radius: var(--radius-full); flex-shrink: 0; }
.rules-ribbon__exec-dot--ok { background: var(--color-success); }
.rules-ribbon__exec-dot--fail { background: var(--color-error); }
.rules-ribbon__time { color: var(--color-text-muted); opacity: 0.7; white-space: nowrap; }
.rules-ribbon__link { margin-left: auto; color: var(--color-accent-bright); font-weight: 500; font-size: var(--text-xs); text-decoration: none; white-space: nowrap; }
.rules-ribbon__link:hover { color: var(--color-iridescent-2); }

/* Cross-ESP Toggle */
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
  z-index: 100;
  box-shadow: var(--elevation-raised);
  transition: all var(--transition-base);
}

.cross-esp-toggle:hover {
  border-color: var(--color-accent-bright);
  color: var(--color-text-primary);
}

.cross-esp-toggle--active {
  background: var(--gradient-iridescent);
  border-color: transparent;
  color: white;
}

/* Zone Create Button */
.zone-create-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3);
  background: transparent;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.zone-create-btn:hover:not(:disabled) {
  border-color: var(--color-accent-bright);
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.04);
}

.zone-create-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zone-create-btn__icon {
  width: 16px;
  height: 16px;
}

/* Zone Create Form */
.zone-create-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}

.zone-create-form__input {
  flex: 1;
  min-width: 120px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.zone-create-form__input:focus {
  border-color: var(--color-iridescent-1);
}

.zone-create-form__select {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  outline: none;
  min-width: 150px;
  cursor: pointer;
}

.zone-create-form__select:focus {
  border-color: var(--color-iridescent-1);
}

.zone-create-form__btn {
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.zone-create-form__btn:hover {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
}

.zone-create-form__btn--primary {
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
  color: var(--color-accent-bright);
}

.zone-create-form__btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent) 25%, transparent);
}

.zone-create-form__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .hardware-view { padding-bottom: 80px; }
  .zone-accordion-list { gap: var(--space-3); }
  .hardware-main-layout { flex-direction: column; }
  .zone-create-form { flex-wrap: wrap; }
}
</style>
