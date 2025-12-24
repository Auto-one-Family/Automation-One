<script setup lang="ts">
/**
 * DevicesView
 *
 * Management view for all ESP devices (Mock + Real).
 * Shows ESPs in a list/card grid for CRUD operations.
 *
 * Features:
 * - Per-action loading states for feedback
 * - Proper delete confirmation modal
 * - Mock/Real ESP purpose explanation
 */

import { ref, reactive, onMounted, computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import { useZoneDragDrop } from '@/composables'
import type { ESPDeviceCreate, ESPDevice } from '@/api/esp'
import type { MockESPCreate, MockSystemState } from '@/types'
import { Plus, RefreshCw, X, Filter, Trash2, AlertTriangle, Info, Cpu, TestTube2, Layers, LayoutGrid } from 'lucide-vue-next'

// Components
import ESPCard from '@/components/esp/ESPCard.vue'
import ZoneGroup from '@/components/zones/ZoneGroup.vue'
import { LoadingState, EmptyState, ErrorState, Modal, Button } from '@/components/common'

const espStore = useEspStore()
const { groupDevicesByZone, handleDeviceDrop } = useZoneDragDrop()

// =============================================================================
// Per-Device Action Loading States
// =============================================================================
interface ActionLoadingState {
  heartbeat: boolean
  safeMode: boolean
  delete: boolean
}

const actionLoadingStates = reactive<Map<string, ActionLoadingState>>(new Map())

function getLoadingState(espId: string): ActionLoadingState {
  if (!actionLoadingStates.has(espId)) {
    actionLoadingStates.set(espId, { heartbeat: false, safeMode: false, delete: false })
  }
  return actionLoadingStates.get(espId)!
}

function setLoading(espId: string, action: keyof ActionLoadingState, loading: boolean) {
  const state = getLoadingState(espId)
  state[action] = loading
}

// =============================================================================
// Delete Confirmation Modal
// =============================================================================
const showDeleteModal = ref(false)
const deviceToDelete = ref<ESPDevice | null>(null)
const deleteInProgress = ref(false)

function openDeleteModal(espId: string) {
  const device = espStore.devices.find(e => espStore.getDeviceId(e) === espId)
  if (device) {
    deviceToDelete.value = device
    showDeleteModal.value = true
  }
}

function closeDeleteModal() {
  showDeleteModal.value = false
  deviceToDelete.value = null
}

async function confirmDelete() {
  if (!deviceToDelete.value) return

  const espId = espStore.getDeviceId(deviceToDelete.value)
  deleteInProgress.value = true
  setLoading(espId, 'delete', true)

  try {
    await espStore.deleteDevice(espId)
    closeDeleteModal()
  } finally {
    deleteInProgress.value = false
    setLoading(espId, 'delete', false)
  }
}

// =============================================================================
// Info Panel State
// =============================================================================
const showInfoPanel = ref(false)

// Modal state
const showCreateModal = ref(false)
const createType = ref<'mock' | 'real'>('mock')
const newEsp = ref<MockESPCreate | ESPDeviceCreate>({
  esp_id: '',
  zone_id: '',
  auto_heartbeat: false,
  heartbeat_interval_seconds: 60,
  sensors: [],
  actuators: [],
})

// Filter state
const filterType = ref<'all' | 'mock' | 'real'>('all')
const filterStatus = ref<'all' | 'online' | 'offline'>('all')
const filterZone = ref<string>('all')
const filterHardware = ref<string>('all')

// Zone grouping toggle
const groupByZone = ref(false)

onMounted(() => {
  espStore.fetchAll()
})

// Filtered ESPs
const filteredEsps = computed(() => {
  let esps = espStore.devices
  
  // Filter by type
  if (filterType.value === 'mock') {
    esps = esps.filter(e => espStore.isMock(espStore.getDeviceId(e)))
  } else if (filterType.value === 'real') {
    esps = esps.filter(e => !espStore.isMock(espStore.getDeviceId(e)))
  }
  
  // Filter by status
  if (filterStatus.value === 'online') {
    esps = esps.filter(e => e.status === 'online' || e.connected === true)
  } else if (filterStatus.value === 'offline') {
    esps = esps.filter(e => e.status === 'offline' || e.connected === false)
  }
  
  // Filter by zone
  if (filterZone.value !== 'all') {
    if (filterZone.value === 'none') {
      esps = esps.filter(e => !e.zone_id)
    } else {
      esps = esps.filter(e => e.zone_id === filterZone.value)
    }
  }
  
  // Filter by hardware type
  if (filterHardware.value !== 'all') {
    esps = esps.filter(e => e.hardware_type === filterHardware.value)
  }
  
  return esps
})

// Available zones for filter
const availableZones = computed(() => {
  const zones = new Set<string>()
  espStore.devices.forEach(device => {
    if (device.zone_id) {
      zones.add(device.zone_id)
    }
  })
  return Array.from(zones).sort()
})

// Available hardware types for filter
const availableHardwareTypes = computed(() => {
  const types = new Set<string>()
  espStore.devices.forEach(device => {
    if (device.hardware_type) {
      types.add(device.hardware_type)
    }
  })
  return Array.from(types).sort()
})

// Counts for filter badges
const counts = computed(() => ({
  all: espStore.devices.length,
  mock: espStore.mockDevices.length,
  real: espStore.realDevices.length,
  online: espStore.onlineDevices.length,
  offline: espStore.offlineDevices.length,
}))

// Group filtered ESPs by zone (when groupByZone is enabled)
const zoneGroups = computed(() => {
  return groupDevicesByZone(filteredEsps.value)
})

// Handle zone drop event from ZoneGroup
async function onDeviceDropped(payload: {
  device: ESPDevice
  fromZoneId: string | null
  toZoneId: string
}) {
  await handleDeviceDrop(payload)
  // Refresh devices after zone change
  await espStore.fetchAll()
}

// Generate random ESP ID
function generateEspId(): string {
  const chars = 'ABCDEF0123456789'
  let id = 'ESP_MOCK_'
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

function openCreateModal(type: 'mock' | 'real' = 'mock') {
  createType.value = type
  if (type === 'mock') {
    newEsp.value = {
      esp_id: generateEspId(),
      zone_name: '', // User enters human-readable name, server auto-generates zone_id
      auto_heartbeat: false,
      heartbeat_interval_seconds: 60,
      sensors: [],
      actuators: [],
    } as MockESPCreate
  } else {
    newEsp.value = {
      device_id: '',
      name: '',
      zone_name: '', // User enters human-readable name, server auto-generates zone_id
      ip_address: '',
      mac_address: '',
      firmware_version: '2.0.0',
      hardware_type: 'ESP32_WROOM',
    } as ESPDeviceCreate
  }
  showCreateModal.value = true
}

async function createEsp() {
  try {
    if (createType.value === 'mock') {
      await espStore.createDevice(newEsp.value as MockESPCreate)
    } else {
      await espStore.createDevice(newEsp.value as ESPDeviceCreate)
    }
    showCreateModal.value = false
  } catch {
    // Error handled in store
  }
}

async function handleHeartbeat(espId: string) {
  if (!espStore.isMock(espId)) return

  setLoading(espId, 'heartbeat', true)
  try {
    await espStore.triggerHeartbeat(espId)
  } finally {
    setLoading(espId, 'heartbeat', false)
  }
}

async function handleToggleSafeMode(espId: string) {
  if (!espStore.isMock(espId)) return

  const device = espStore.devices.find(e => espStore.getDeviceId(e) === espId)
  if (!device || !('system_state' in device)) return

  setLoading(espId, 'safeMode', true)
  try {
    const currentState = device.system_state as string
    const newState: MockSystemState = currentState === 'SAFE_MODE' ? 'OPERATIONAL' : 'SAFE_MODE'
    await espStore.setState(espId, newState, 'Manueller Wechsel')
  } finally {
    setLoading(espId, 'safeMode', false)
  }
}

function handleDelete(espId: string) {
  // Open confirmation modal instead of native confirm
  openDeleteModal(espId)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold" style="color: var(--color-text-primary)">ESP-Geräte</h1>
        <p style="color: var(--color-text-muted)" class="mt-1">
          Mock- und echte ESP32-Geräte verwalten
        </p>
      </div>
      <div class="flex gap-3">
        <button
          class="btn-ghost btn-sm"
          @click="showInfoPanel = !showInfoPanel"
          :title="showInfoPanel ? 'Info ausblenden' : 'Was ist Mock vs. Real?'"
        >
          <Info class="w-4 h-4" />
        </button>
        <button class="btn-secondary" @click="espStore.fetchAll" :disabled="espStore.isLoading">
          <RefreshCw :class="['w-4 h-4', espStore.isLoading ? 'animate-spin' : '']" />
          <span class="hidden sm:inline ml-1">Aktualisieren</span>
        </button>
        <button class="btn-primary" @click="openCreateModal('mock')">
          <Plus class="w-4 h-4" />
          <span class="hidden sm:inline ml-1">Mock ESP erstellen</span>
        </button>
      </div>
    </div>

    <!-- Info Panel: Mock vs. Real ESP Explanation -->
    <Transition name="slide-fade">
      <div v-if="showInfoPanel" class="info-panel">
        <div class="info-panel__grid">
          <!-- Mock ESP Info -->
          <div class="info-card info-card--mock">
            <div class="info-card__header">
              <TestTube2 class="w-5 h-5" />
              <span>Mock ESP</span>
            </div>
            <p class="info-card__description">
              Simulierte Geräte für Entwicklung und Testing. Existieren nur im Server-Speicher und
              werden bei Neustart gelöscht.
            </p>
            <ul class="info-card__features">
              <li>Keine echte Hardware nötig</li>
              <li>Simulierte Heartbeats & Sensordaten</li>
              <li>Schnelles Prototyping von Automationen</li>
              <li>Safe-Mode Testing</li>
            </ul>
          </div>

          <!-- Real ESP Info -->
          <div class="info-card info-card--real">
            <div class="info-card__header">
              <Cpu class="w-5 h-5" />
              <span>Real ESP</span>
            </div>
            <p class="info-card__description">
              Echte ESP32-Hardware die via MQTT kommuniziert. Persistent in der Datenbank gespeichert.
            </p>
            <ul class="info-card__features">
              <li>Echte Sensor-/Aktor-Daten</li>
              <li>Persistente Konfiguration</li>
              <li>OTA-Updates möglich</li>
              <li>Produktions-ready</li>
            </ul>
          </div>
        </div>
        <button class="info-panel__close" @click="showInfoPanel = false">
          <X class="w-4 h-4" />
          Schließen
        </button>
      </div>
    </Transition>

    <!-- Error Alert -->
    <ErrorState
      v-if="espStore.error"
      :message="espStore.error"
      show-dismiss
      @retry="espStore.fetchAll"
      @dismiss="espStore.clearError"
    />

    <!-- Filters -->
    <div class="flex flex-wrap gap-4">
      <!-- Type Filter -->
      <div class="filter-group">
        <span class="filter-label">Typ:</span>
        <div class="filter-buttons">
          <button 
            :class="['filter-btn', filterType === 'all' ? 'filter-btn--active' : '']"
            @click="filterType = 'all'"
          >
            Alle ({{ counts.all }})
          </button>
          <button 
            :class="['filter-btn', filterType === 'mock' ? 'filter-btn--active filter-btn--mock' : '']"
            @click="filterType = 'mock'"
          >
            Mock ({{ counts.mock }})
          </button>
          <button 
            :class="['filter-btn', filterType === 'real' ? 'filter-btn--active filter-btn--real' : '']"
            @click="filterType = 'real'"
          >
            Real ({{ counts.real }})
          </button>
        </div>
      </div>
      
      <!-- Status Filter -->
      <div class="filter-group">
        <span class="filter-label">Status:</span>
        <div class="filter-buttons">
          <button 
            :class="['filter-btn', filterStatus === 'all' ? 'filter-btn--active' : '']"
            @click="filterStatus = 'all'"
          >
            Alle
          </button>
          <button 
            :class="['filter-btn', filterStatus === 'online' ? 'filter-btn--active filter-btn--success' : '']"
            @click="filterStatus = 'online'"
          >
            Online ({{ counts.online }})
          </button>
          <button 
            :class="['filter-btn', filterStatus === 'offline' ? 'filter-btn--active' : '']"
            @click="filterStatus = 'offline'"
          >
            Offline ({{ counts.offline }})
          </button>
        </div>
      </div>

      <!-- Zone Filter -->
      <div class="filter-group" v-if="availableZones.length > 0">
        <span class="filter-label">Zone:</span>
        <select v-model="filterZone" class="filter-select">
          <option value="all">Alle Zonen</option>
          <option value="none">Ohne Zone</option>
          <option v-for="zone in availableZones" :key="zone" :value="zone">
            {{ zone }}
          </option>
        </select>
      </div>

      <!-- Hardware Type Filter -->
      <div class="filter-group" v-if="availableHardwareTypes.length > 0">
        <span class="filter-label">Hardware:</span>
        <select v-model="filterHardware" class="filter-select">
          <option value="all">Alle Typen</option>
          <option v-for="type in availableHardwareTypes" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
      </div>

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Zone Grouping Toggle -->
      <div class="filter-group">
        <button
          :class="['group-toggle', groupByZone ? 'group-toggle--active' : '']"
          @click="groupByZone = !groupByZone"
          title="Nach Zone gruppieren"
        >
          <Layers v-if="groupByZone" class="w-4 h-4" />
          <LayoutGrid v-else class="w-4 h-4" />
          <span class="hidden sm:inline">{{ groupByZone ? 'Zone-Gruppen' : 'Alle anzeigen' }}</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <LoadingState v-if="espStore.isLoading && espStore.devices.length === 0" text="Lade ESP-Geräte..." />

    <!-- Empty State -->
    <EmptyState
      v-else-if="espStore.devices.length === 0"
      :icon="Plus"
      title="Keine ESP-Geräte"
      description="Erstellen Sie Ihr erstes Mock-ESP32-Gerät, um mit dem Testen zu beginnen."
      action-text="Mock ESP erstellen"
      @action="openCreateModal('mock')"
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
      <button class="btn-secondary" @click="filterType = 'all'; filterStatus = 'all'; filterZone = 'all'; filterHardware = 'all'">
        Filter zurücksetzen
      </button>
    </div>

    <!-- Zone-Grouped View -->
    <div v-else-if="groupByZone" class="zone-groups-container">
      <ZoneGroup
        v-for="group in zoneGroups"
        :key="group.zoneId"
        :zone-id="group.zoneId"
        :zone-name="group.zoneName"
        :devices="group.devices"
        :is-unassigned="group.zoneId === '__unassigned__'"
        :compact-mode="false"
        :enable-drag-drop="true"
        :default-expanded="true"
        @device-dropped="onDeviceDropped"
      >
        <!-- Use ESPCard with loading states for DevicesView -->
        <template #device="{ device }">
          <ESPCard
            :esp="device"
            :heartbeat-loading="getLoadingState(espStore.getDeviceId(device)).heartbeat"
            :safe-mode-loading="getLoadingState(espStore.getDeviceId(device)).safeMode"
            :delete-loading="getLoadingState(espStore.getDeviceId(device)).delete"
            @heartbeat="handleHeartbeat"
            @toggle-safe-mode="handleToggleSafeMode"
            @delete="handleDelete"
          />
        </template>
      </ZoneGroup>

      <!-- Drag & Drop Hint -->
      <div v-if="zoneGroups.length > 1" class="drag-hint">
        <Layers class="w-4 h-4" />
        <span>Tipp: Geräte zwischen Zonen verschieben per Drag & Drop</span>
      </div>
    </div>

    <!-- Flat ESP Card Grid (default) -->
    <div v-else class="esp-card-grid">
      <ESPCard
        v-for="esp in filteredEsps"
        :key="espStore.getDeviceId(esp)"
        :esp="esp"
        :heartbeat-loading="getLoadingState(espStore.getDeviceId(esp)).heartbeat"
        :safe-mode-loading="getLoadingState(espStore.getDeviceId(esp)).safeMode"
        :delete-loading="getLoadingState(espStore.getDeviceId(esp)).delete"
        @heartbeat="handleHeartbeat"
        @toggle-safe-mode="handleToggleSafeMode"
        @delete="handleDelete"
      />
    </div>

    <!-- Delete Confirmation Modal -->
    <Modal
      :open="showDeleteModal"
      :title="deviceToDelete ? `${espStore.isMock(espStore.getDeviceId(deviceToDelete)) ? 'Mock ESP' : 'ESP'} löschen` : 'ESP löschen'"
      max-width="max-w-md"
      :close-on-overlay="!deleteInProgress"
      :close-on-escape="!deleteInProgress"
      @update:open="(v: boolean) => !v && closeDeleteModal()"
    >
      <div class="delete-modal__content">
        <div class="delete-modal__icon">
          <AlertTriangle class="w-8 h-8" />
        </div>

        <div class="delete-modal__info" v-if="deviceToDelete">
          <p class="delete-modal__message">
            Möchten Sie dieses Gerät wirklich löschen?
          </p>

          <div class="delete-modal__device-info">
            <div class="delete-modal__device-row">
              <span class="delete-modal__label">Gerät-ID:</span>
              <code class="delete-modal__value">{{ espStore.getDeviceId(deviceToDelete) }}</code>
            </div>
            <div class="delete-modal__device-row" v-if="deviceToDelete.zone_id">
              <span class="delete-modal__label">Zone:</span>
              <span class="delete-modal__value">{{ deviceToDelete.zone_name || deviceToDelete.zone_id }}</span>
            </div>
            <div class="delete-modal__device-row">
              <span class="delete-modal__label">Typ:</span>
              <span :class="['delete-modal__value', espStore.isMock(espStore.getDeviceId(deviceToDelete)) ? 'text-mock' : 'text-real']">
                {{ espStore.isMock(espStore.getDeviceId(deviceToDelete)) ? 'Mock ESP' : 'Real ESP' }}
              </span>
            </div>
            <div class="delete-modal__device-row" v-if="deviceToDelete.sensor_count || deviceToDelete.sensors?.length">
              <span class="delete-modal__label">Sensoren:</span>
              <span class="delete-modal__value">{{ deviceToDelete.sensor_count ?? deviceToDelete.sensors?.length ?? 0 }}</span>
            </div>
            <div class="delete-modal__device-row" v-if="deviceToDelete.actuator_count || deviceToDelete.actuators?.length">
              <span class="delete-modal__label">Aktoren:</span>
              <span class="delete-modal__value">{{ deviceToDelete.actuator_count ?? deviceToDelete.actuators?.length ?? 0 }}</span>
            </div>
          </div>

          <p class="delete-modal__warning">
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        </div>
      </div>

      <template #footer>
        <div class="delete-modal__actions">
          <Button
            variant="secondary"
            :disabled="deleteInProgress"
            @click="closeDeleteModal"
          >
            Abbrechen
          </Button>
          <Button
            variant="danger"
            :loading="deleteInProgress"
            @click="confirmDelete"
          >
            <Trash2 class="w-4 h-4" />
            Löschen
          </Button>
        </div>
      </template>
    </Modal>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">{{ createType === 'mock' ? 'Mock ESP erstellen' : 'ESP registrieren' }}</h3>
            <button class="modal-close" @click="showCreateModal = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body space-y-4">
            <!-- Mock ESP Form -->
            <template v-if="createType === 'mock'">
              <div>
                <label class="label">ESP ID</label>
                <div class="flex gap-2">
                  <input v-model="(newEsp as MockESPCreate).esp_id" class="input flex-1 font-mono" />
                  <button class="btn-secondary" @click="(newEsp as MockESPCreate).esp_id = generateEspId()" title="Neue ID generieren">
                    <RefreshCw class="w-4 h-4" />
                  </button>
                </div>
                <p class="text-xs mt-1" style="color: var(--color-text-muted)">
                  Format: ESP_MOCK_XXXXXX
                </p>
              </div>

              <div>
                <label class="label">Zonenname (optional)</label>
                <input v-model="(newEsp as MockESPCreate).zone_name" class="input" placeholder="z.B. Zelt 1, Gewächshaus A" />
                <p class="text-xs mt-1" style="color: var(--color-text-muted)">
                  Menschenfreundlicher Name. Die technische Zone-ID wird automatisch generiert.
                </p>
              </div>

              <div class="flex items-center gap-3">
                <input
                  id="autoHeartbeat"
                  v-model="(newEsp as MockESPCreate).auto_heartbeat"
                  type="checkbox"
                  class="checkbox"
                />
                <label for="autoHeartbeat" style="color: var(--color-text-secondary)">
                  Auto-Heartbeat aktivieren
                </label>
              </div>

              <div v-if="(newEsp as MockESPCreate).auto_heartbeat">
                <label class="label">Heartbeat-Intervall (Sekunden)</label>
                <input
                  v-model.number="(newEsp as MockESPCreate).heartbeat_interval_seconds"
                  type="number"
                  min="5"
                  max="300"
                  class="input"
                />
              </div>
            </template>

            <!-- Real ESP Form -->
            <template v-else>
              <div>
                <label class="label">Device ID</label>
                <input v-model="(newEsp as ESPDeviceCreate).device_id" class="input font-mono" placeholder="ESP_12AB34CD" />
                <p class="text-xs mt-1" style="color: var(--color-text-muted)">
                  Format: ESP_XXXXXXXX (8 hex chars)
                </p>
              </div>

              <div>
                <label class="label">Name (optional)</label>
                <input v-model="(newEsp as ESPDeviceCreate).name" class="input" placeholder="z.B. Greenhouse Node 1" />
              </div>

              <div>
                <label class="label">IP Address</label>
                <input v-model="(newEsp as ESPDeviceCreate).ip_address" class="input" placeholder="192.168.1.100" />
              </div>

              <div>
                <label class="label">MAC Address</label>
                <input v-model="(newEsp as ESPDeviceCreate).mac_address" class="input font-mono" placeholder="AA:BB:CC:DD:EE:FF" />
              </div>

              <div>
                <label class="label">Hardware Type</label>
                <select v-model="(newEsp as ESPDeviceCreate).hardware_type" class="input">
                  <option value="ESP32_WROOM">ESP32-WROOM</option>
                  <option value="XIAO_ESP32_C3">XIAO ESP32-C3</option>
                </select>
              </div>

              <div>
                <label class="label">Zonenname (optional)</label>
                <input v-model="(newEsp as ESPDeviceCreate).zone_name" class="input" placeholder="z.B. Zelt 1, Gewächshaus A" />
                <p class="text-xs mt-1" style="color: var(--color-text-muted)">
                  Menschenfreundlicher Name. Die technische Zone-ID wird automatisch generiert.
                </p>
              </div>
            </template>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary flex-1" @click="showCreateModal = false">
              Abbrechen
            </button>
            <button class="btn-primary flex-1" @click="createEsp">
              Erstellen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ESP Card Grid */
.esp-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
}

@media (min-width: 1280px) {
  .esp-card-grid {
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  }
}

@media (max-width: 768px) {
  .esp-card-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}

/* Filter group */
.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.filter-buttons {
  display: flex;
  gap: 0.25rem;
  background-color: var(--color-bg-tertiary);
  padding: 0.25rem;
  border-radius: 0.5rem;
}

.filter-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  transition: all 0.2s;
  background: transparent;
  border: none;
  cursor: pointer;
}

.filter-btn:hover {
  color: var(--color-text-primary);
}

.filter-btn--active {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.filter-btn--mock.filter-btn--active {
  color: var(--color-mock);
}

.filter-btn--real.filter-btn--active {
  color: var(--color-real);
}

.filter-btn--success.filter-btn--active {
  color: var(--color-success);
}

.filter-select {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  color: var(--color-text-primary);
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: var(--color-iridescent-1);
}

/* Checkbox */
.checkbox {
  width: 1rem;
  height: 1rem;
  border-radius: 0.25rem;
  border: 1px solid var(--glass-border);
  background-color: var(--color-bg-tertiary);
  cursor: pointer;
}

.checkbox:checked {
  background-color: var(--color-iridescent-1);
  border-color: var(--color-iridescent-1);
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(4px);
}

.modal-content {
  width: 100%;
  max-width: 28rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  box-shadow: var(--glass-shadow);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close {
  padding: 0.5rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  transition: all 0.2s;
}

.modal-close:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
}

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
}

/* =============================================================================
   Info Panel Styles
   ============================================================================= */
.info-panel {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.info-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.info-card {
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--glass-border);
  background-color: var(--color-bg-tertiary);
}

.info-card--mock {
  border-color: rgba(168, 85, 247, 0.3);
  background-color: rgba(168, 85, 247, 0.05);
}

.info-card--real {
  border-color: rgba(34, 211, 238, 0.3);
  background-color: rgba(34, 211, 238, 0.05);
}

.info-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.info-card--mock .info-card__header {
  color: var(--color-mock);
}

.info-card--real .info-card__header {
  color: var(--color-real);
}

.info-card__description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
  line-height: 1.5;
}

.info-card__features {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  list-style: none;
  padding: 0;
  margin: 0;
}

.info-card__features li {
  padding-left: 1.25rem;
  position: relative;
  margin-bottom: 0.25rem;
}

.info-card__features li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--color-success);
}

.info-panel__close {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.info-panel__close:hover {
  color: var(--color-text-primary);
}

/* Slide fade transition */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* =============================================================================
   Delete Modal Styles
   ============================================================================= */
.delete-modal__content {
  text-align: center;
}

.delete-modal__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background-color: rgba(248, 113, 113, 0.1);
  color: var(--color-error);
}

.delete-modal__message {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
}

.delete-modal__device-info {
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  text-align: left;
}

.delete-modal__device-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.375rem 0;
  font-size: 0.875rem;
}

.delete-modal__device-row:not(:last-child) {
  border-bottom: 1px solid var(--glass-border);
}

.delete-modal__label {
  color: var(--color-text-muted);
}

.delete-modal__value {
  color: var(--color-text-primary);
  font-weight: 500;
}

.delete-modal__value code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8125rem;
}

.delete-modal__warning {
  font-size: 0.8125rem;
  color: var(--color-warning);
  font-style: italic;
}

.delete-modal__actions {
  display: flex;
  gap: 0.75rem;
  width: 100%;
}

.delete-modal__actions > * {
  flex: 1;
}

/* Color utilities */
.text-mock {
  color: var(--color-mock);
}

.text-real {
  color: var(--color-real);
}

/* Zone grouping toggle */
.group-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: all 0.3s ease;
}

.group-toggle:hover {
  color: var(--color-text-primary);
  border-color: var(--color-iridescent-1);
}

.group-toggle--active {
  color: var(--color-iridescent-1);
  background-color: rgba(96, 165, 250, 0.1);
  border-color: var(--color-iridescent-1);
}

/* Zone groups container */
.zone-groups-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Drag hint */
.drag-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-tertiary);
  border: 1px dashed var(--glass-border);
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
</style>



