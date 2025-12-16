<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMockEspStore } from '@/stores/mockEsp'
import type { MockESPCreate, MockSystemState } from '@/types'
import { Plus, Trash2, Heart, RefreshCw, AlertTriangle, X } from 'lucide-vue-next'

const mockEspStore = useMockEspStore()

const showCreateModal = ref(false)
const newEsp = ref<MockESPCreate>({
  esp_id: '',
  zone_id: '',
  auto_heartbeat: false,
  heartbeat_interval_seconds: 60,
  sensors: [],
  actuators: [],
})

onMounted(() => {
  mockEspStore.fetchAll()
})

function generateEspId(): string {
  const chars = 'ABCDEF0123456789'
  let id = 'ESP_'
  for (let i = 0; i < 8; i++) {
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

async function deleteEsp(espId: string) {
  if (confirm(`Delete mock ESP ${espId}?`)) {
    await mockEspStore.remove(espId)
  }
}

async function triggerHeartbeat(espId: string) {
  await mockEspStore.triggerHeartbeat(espId)
}

async function toggleState(espId: string, currentState: MockSystemState) {
  const newState: MockSystemState = currentState === 'SAFE_MODE' ? 'OPERATIONAL' : 'SAFE_MODE'
  await mockEspStore.setState(espId, newState, 'Manual toggle from UI')
}

function getStateColor(state: MockSystemState): string {
  switch (state) {
    case 'OPERATIONAL': return 'badge-success'
    case 'SAFE_MODE': return 'badge-warning'
    case 'ERROR': return 'badge-danger'
    default: return 'badge-gray'
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-dark-100">Mock ESP Manager</h1>
        <p class="text-dark-400 mt-1">Create and manage virtual ESP32 devices</p>
      </div>
      <div class="flex gap-3">
        <button class="btn-secondary" @click="mockEspStore.fetchAll">
          <RefreshCw class="w-4 h-4 mr-2" />
          Refresh
        </button>
        <button class="btn-primary" @click="openCreateModal">
          <Plus class="w-4 h-4 mr-2" />
          Create Mock ESP
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div
      v-if="mockEspStore.error"
      class="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl"
    >
      <AlertTriangle class="w-5 h-5 text-red-400" />
      <span class="text-red-400">{{ mockEspStore.error }}</span>
      <button class="ml-auto text-red-400 hover:text-red-300" @click="mockEspStore.clearError">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Loading -->
    <div v-if="mockEspStore.isLoading" class="text-center py-12 text-dark-400">
      Loading mock ESPs...
    </div>

    <!-- Empty State -->
    <div
      v-else-if="mockEspStore.mockEsps.length === 0"
      class="card p-12 text-center"
    >
      <div class="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <Plus class="w-8 h-8 text-dark-400" />
      </div>
      <h3 class="text-lg font-medium text-dark-200 mb-2">No Mock ESPs</h3>
      <p class="text-dark-400 mb-4">Create your first virtual ESP32 device to start testing</p>
      <button class="btn-primary" @click="openCreateModal">
        <Plus class="w-4 h-4 mr-2" />
        Create Mock ESP
      </button>
    </div>

    <!-- ESP Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="esp in mockEspStore.mockEsps"
        :key="esp.esp_id"
        class="card hover:border-dark-600 transition-colors"
      >
        <div class="card-header flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span
              :class="[
                'status-dot',
                esp.connected ? 'status-online' : 'status-offline'
              ]"
            />
            <RouterLink
              :to="`/mock-esp/${esp.esp_id}`"
              class="font-mono font-medium text-dark-100 hover:text-blue-400"
            >
              {{ esp.esp_id }}
            </RouterLink>
            <span
              v-if="esp.hardware_type?.startsWith('MOCK_')"
              class="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/20 text-purple-400 rounded"
            >
              MOCK
            </span>
          </div>
          <span :class="['badge', getStateColor(esp.system_state)]">
            {{ esp.system_state }}
          </span>
        </div>

        <div class="card-body space-y-4">
          <!-- Stats -->
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-dark-400">Sensors</p>
              <p class="text-dark-100 font-medium">{{ esp.sensors.length }}</p>
            </div>
            <div>
              <p class="text-dark-400">Actuators</p>
              <p class="text-dark-100 font-medium">{{ esp.actuators.length }}</p>
            </div>
            <div>
              <p class="text-dark-400">Uptime</p>
              <p class="text-dark-100 font-medium">{{ Math.floor(esp.uptime / 60) }}m</p>
            </div>
            <div>
              <p class="text-dark-400">Heap</p>
              <p class="text-dark-100 font-medium">{{ Math.round(esp.heap_free / 1024) }}KB</p>
            </div>
          </div>

          <!-- Zone -->
          <div v-if="esp.zone_id" class="text-sm">
            <span class="text-dark-400">Zone:</span>
            <span class="text-dark-200 ml-1">{{ esp.zone_id }}</span>
          </div>

          <!-- Auto Heartbeat -->
          <div class="flex items-center gap-2 text-sm">
            <span
              :class="[
                'w-2 h-2 rounded-full',
                esp.auto_heartbeat ? 'bg-green-500' : 'bg-dark-600'
              ]"
            />
            <span class="text-dark-400">
              Auto-heartbeat {{ esp.auto_heartbeat ? 'enabled' : 'disabled' }}
            </span>
          </div>

          <!-- Actions -->
          <div class="flex gap-2 pt-2 border-t border-dark-700">
            <button
              class="btn-ghost btn-sm flex-1"
              @click="triggerHeartbeat(esp.esp_id)"
              title="Send Heartbeat"
            >
              <Heart class="w-4 h-4" />
            </button>
            <button
              class="btn-ghost btn-sm flex-1"
              :class="esp.system_state === 'SAFE_MODE' ? 'text-yellow-400' : ''"
              @click="toggleState(esp.esp_id, esp.system_state)"
              :title="esp.system_state === 'SAFE_MODE' ? 'Exit Safe Mode' : 'Enter Safe Mode'"
            >
              <AlertTriangle class="w-4 h-4" />
            </button>
            <RouterLink
              :to="`/mock-esp/${esp.esp_id}`"
              class="btn-secondary btn-sm flex-1 justify-center"
            >
              Details
            </RouterLink>
            <button
              class="btn-ghost btn-sm text-red-400 hover:text-red-300 hover:bg-red-500/10"
              @click="deleteEsp(esp.esp_id)"
              title="Delete"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      @click.self="showCreateModal = false"
    >
      <div class="card w-full max-w-md">
        <div class="card-header flex items-center justify-between">
          <h3 class="text-lg font-semibold text-dark-100">Create Mock ESP</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showCreateModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="label">ESP ID</label>
            <div class="flex gap-2">
              <input v-model="newEsp.esp_id" class="input flex-1 font-mono" />
              <button class="btn-secondary" @click="newEsp.esp_id = generateEspId()">
                <RefreshCw class="w-4 h-4" />
              </button>
            </div>
            <p class="text-xs text-dark-400 mt-1">Format: ESP_XXXXXXXX</p>
          </div>

          <div>
            <label class="label">Zone ID (optional)</label>
            <input v-model="newEsp.zone_id" class="input" placeholder="e.g., greenhouse" />
          </div>

          <div class="flex items-center gap-3">
            <input
              id="autoHeartbeat"
              v-model="newEsp.auto_heartbeat"
              type="checkbox"
              class="w-4 h-4 rounded border-dark-600 bg-dark-800 text-blue-600"
            />
            <label for="autoHeartbeat" class="text-sm text-dark-200">
              Enable auto-heartbeat
            </label>
          </div>

          <div v-if="newEsp.auto_heartbeat">
            <label class="label">Heartbeat Interval (seconds)</label>
            <input
              v-model.number="newEsp.heartbeat_interval_seconds"
              type="number"
              min="5"
              max="300"
              class="input"
            />
          </div>

          <div class="flex gap-3 pt-4">
            <button class="btn-secondary flex-1" @click="showCreateModal = false">
              Cancel
            </button>
            <button class="btn-primary flex-1" @click="createEsp">
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
