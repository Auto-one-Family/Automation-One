<script setup lang="ts">
/**
 * MockEspView
 * 
 * List view for all Mock ESP devices.
 * Uses ESPCard component for consistent display.
 */

import { ref, onMounted, computed } from 'vue'
import { useMockEspStore } from '@/stores/mockEsp'
import type { MockESPCreate, MockSystemState } from '@/types'
import { Plus, RefreshCw, AlertTriangle, X, Filter } from 'lucide-vue-next'

// Components
import ESPCard from '@/components/esp/ESPCard.vue'
import { LoadingState, EmptyState, ErrorState } from '@/components/common'

const mockEspStore = useMockEspStore()

// Modal state
const showCreateModal = ref(false)
const newEsp = ref<MockESPCreate>({
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

onMounted(() => {
  mockEspStore.fetchAll()
})

// Filtered ESPs
const filteredEsps = computed(() => {
  let esps = mockEspStore.mockEsps
  
  // Filter by type
  if (filterType.value === 'mock') {
    esps = esps.filter(e => 
      e.hardware_type?.startsWith('MOCK_') || e.esp_id?.startsWith('ESP_MOCK_')
    )
  } else if (filterType.value === 'real') {
    esps = esps.filter(e => 
      !e.hardware_type?.startsWith('MOCK_') && !e.esp_id?.startsWith('ESP_MOCK_')
    )
  }
  
  // Filter by status
  if (filterStatus.value === 'online') {
    esps = esps.filter(e => e.connected)
  } else if (filterStatus.value === 'offline') {
    esps = esps.filter(e => !e.connected)
  }
  
  return esps
})

// Counts for filter badges
const counts = computed(() => ({
  all: mockEspStore.mockEsps.length,
  mock: mockEspStore.mockEsps.filter(e => 
    e.hardware_type?.startsWith('MOCK_') || e.esp_id?.startsWith('ESP_MOCK_')
  ).length,
  real: mockEspStore.mockEsps.filter(e => 
    !e.hardware_type?.startsWith('MOCK_') && !e.esp_id?.startsWith('ESP_MOCK_')
  ).length,
  online: mockEspStore.mockEsps.filter(e => e.connected).length,
  offline: mockEspStore.mockEsps.filter(e => !e.connected).length,
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

function openCreateModal() {
  newEsp.value = {
    esp_id: generateEspId(),
    zone_id: '',
    auto_heartbeat: false,
    heartbeat_interval_seconds: 60,
    sensors: [],
    actuators: [],
  }
  showCreateModal.value = true
}

async function createEsp() {
  try {
    await mockEspStore.create(newEsp.value)
    showCreateModal.value = false
  } catch {
    // Error handled in store
  }
}

async function handleHeartbeat(espId: string) {
  await mockEspStore.triggerHeartbeat(espId)
}

async function handleToggleSafeMode(espId: string) {
  const esp = mockEspStore.mockEsps.find(e => e.esp_id === espId)
  if (!esp) return
  const newState: MockSystemState = esp.system_state === 'SAFE_MODE' ? 'OPERATIONAL' : 'SAFE_MODE'
  await mockEspStore.setState(espId, newState, 'Manueller Wechsel')
}

async function handleDelete(espId: string) {
  if (confirm(`Mock ESP "${espId}" wirklich löschen?`)) {
    await mockEspStore.remove(espId)
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
          Mock-ESP32-Geräte erstellen und verwalten
        </p>
      </div>
      <div class="flex gap-3">
        <button class="btn-secondary" @click="mockEspStore.fetchAll" :disabled="mockEspStore.isLoading">
          <RefreshCw :class="['w-4 h-4', mockEspStore.isLoading ? 'animate-spin' : '']" />
          <span class="hidden sm:inline ml-1">Aktualisieren</span>
        </button>
        <button class="btn-primary" @click="openCreateModal">
          <Plus class="w-4 h-4" />
          <span class="hidden sm:inline ml-1">Mock ESP erstellen</span>
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <ErrorState
      v-if="mockEspStore.error"
      :message="mockEspStore.error"
      show-dismiss
      @retry="mockEspStore.fetchAll"
      @dismiss="mockEspStore.clearError"
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
    </div>

    <!-- Loading -->
    <LoadingState v-if="mockEspStore.isLoading && mockEspStore.mockEsps.length === 0" text="Lade ESP-Geräte..." />

    <!-- Empty State -->
    <EmptyState
      v-else-if="mockEspStore.mockEsps.length === 0"
      :icon="Plus"
      title="Keine Mock-ESPs"
      description="Erstellen Sie Ihr erstes virtuelles ESP32-Gerät, um mit dem Testen zu beginnen."
      action-text="Mock ESP erstellen"
      @action="openCreateModal"
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
      <button class="btn-secondary" @click="filterType = 'all'; filterStatus = 'all'">
        Filter zurücksetzen
      </button>
    </div>

    <!-- ESP Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <ESPCard
        v-for="esp in filteredEsps"
        :key="esp.esp_id"
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
            <h3 class="modal-title">Mock ESP erstellen</h3>
            <button class="modal-close" @click="showCreateModal = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div>
              <label class="label">ESP ID</label>
              <div class="flex gap-2">
                <input v-model="newEsp.esp_id" class="input flex-1 font-mono" />
                <button class="btn-secondary" @click="newEsp.esp_id = generateEspId()" title="Neue ID generieren">
                  <RefreshCw class="w-4 h-4" />
                </button>
              </div>
              <p class="text-xs mt-1" style="color: var(--color-text-muted)">
                Format: ESP_MOCK_XXXXXX
              </p>
            </div>

            <div>
              <label class="label">Zone (optional)</label>
              <input v-model="newEsp.zone_id" class="input" placeholder="z.B. gewächshaus" />
            </div>

            <div class="flex items-center gap-3">
              <input
                id="autoHeartbeat"
                v-model="newEsp.auto_heartbeat"
                type="checkbox"
                class="checkbox"
              />
              <label for="autoHeartbeat" style="color: var(--color-text-secondary)">
                Auto-Heartbeat aktivieren
              </label>
            </div>

            <div v-if="newEsp.auto_heartbeat">
              <label class="label">Heartbeat-Intervall (Sekunden)</label>
              <input
                v-model.number="newEsp.heartbeat_interval_seconds"
                type="number"
                min="5"
                max="300"
                class="input"
              />
            </div>
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
