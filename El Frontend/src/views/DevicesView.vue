<script setup lang="ts">
/**
 * DevicesView
 * 
 * Unified list view for all ESP devices (Mock + Real).
 * Uses ESPCard component for consistent display.
 */

import { ref, onMounted, computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import { espApi, type ESPDeviceCreate } from '@/api/esp'
import type { MockESPCreate, MockSystemState } from '@/types'
import { Plus, RefreshCw, X, Filter } from 'lucide-vue-next'

// Components
import ESPCard from '@/components/esp/ESPCard.vue'
import { LoadingState, EmptyState, ErrorState } from '@/components/common'

const espStore = useEspStore()

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
      zone_id: '',
      auto_heartbeat: false,
      heartbeat_interval_seconds: 60,
      sensors: [],
      actuators: [],
    } as MockESPCreate
  } else {
    newEsp.value = {
      device_id: '',
      name: '',
      zone_id: '',
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
  if (espStore.isMock(espId)) {
    await espStore.triggerHeartbeat(espId)
  }
}

async function handleToggleSafeMode(espId: string) {
  if (!espStore.isMock(espId)) return
  
  const device = espStore.devices.find(e => espStore.getDeviceId(e) === espId)
  if (!device || !('system_state' in device)) return
  
  const currentState = device.system_state as string
  const newState: MockSystemState = currentState === 'SAFE_MODE' ? 'OPERATIONAL' : 'SAFE_MODE'
  await espStore.setState(espId, newState, 'Manueller Wechsel')
}

async function handleDelete(espId: string) {
  const deviceType = espStore.isMock(espId) ? 'Mock ESP' : 'ESP'
  if (confirm(`${deviceType} "${espId}" wirklich löschen?`)) {
    await espStore.deleteDevice(espId)
  }
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

    <!-- ESP Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <ESPCard
        v-for="esp in filteredEsps"
        :key="espStore.getDeviceId(esp)"
        :esp="esp"
        @heartbeat="handleHeartbeat"
        @toggle-safe-mode="handleToggleSafeMode"
        @delete="handleDelete"
      />
    </div>

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
                <label class="label">Zone (optional)</label>
                <input v-model="(newEsp as MockESPCreate).zone_id" class="input" placeholder="z.B. gewächshaus" />
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
                <label class="label">Zone (optional)</label>
                <input v-model="(newEsp as ESPDeviceCreate).zone_id" class="input" placeholder="z.B. gewächshaus" />
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
</style>

