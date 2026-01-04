<script setup lang="ts">
/**
 * ActuatorsView
 *
 * @deprecated 2025-01-04: Funktionen wurden in SensorsView (Tab-System) integriert.
 * Route redirected zu /sensors?tab=actuators.
 * Entfernung in v2.0 geplant.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMockEspStore } from '@/stores/mockEsp'
import { useWebSocket } from '@/composables/useWebSocket'
import type { WebSocketMessage } from '@/services/websocket'
import { Power, AlertTriangle, Filter, X, ChevronDown, ChevronUp } from 'lucide-vue-next'

type ActuatorStateFilter = 'on' | 'off' | 'emergency'

const mockEspStore = useMockEspStore()

// WebSocket for live updates
const { subscribe, unsubscribe } = useWebSocket({
  autoConnect: true,
  autoReconnect: true,
})

// Filter state
const showFilters = ref(false)
const filterEspId = ref('')
const filterActuatorType = ref<string[]>([])
const filterState = ref<ActuatorStateFilter[]>([])

// Available filter options (computed from data)
const availableActuatorTypes = computed(() => {
  const types = new Set<string>()
  mockEspStore.mockEsps.forEach(esp => {
    esp.actuators.forEach(actuator => types.add(actuator.actuator_type))
  })
  return Array.from(types).sort()
})

const availableEspIds = computed(() => {
  return mockEspStore.mockEsps.map(esp => esp.esp_id).sort()
})

const stateFilters: { value: ActuatorStateFilter; label: string }[] = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
  { value: 'emergency', label: 'E-STOP' },
]

onMounted(async () => {
  // Initial load via REST
  await mockEspStore.fetchAll()

  // Subscribe to WebSocket events for live updates
  subscribe(
    {
      types: ['actuator_status', 'esp_health'],
    },
    (message: WebSocketMessage) => {
      handleWebSocketMessage(message)
    }
  )
})

onUnmounted(() => {
  unsubscribe()
})

/**
 * Handle WebSocket messages for live updates
 */
function handleWebSocketMessage(message: WebSocketMessage) {
  const { type, data } = message

  if (type === 'actuator_status') {
    const espId = data.esp_id as string
    const gpio = data.gpio as number
    if (!espId || gpio === undefined) return

    // Update actuator state
    mockEspStore.updateActuatorFromEvent(espId, gpio, {
      state: (data.state as boolean) ?? false,
      pwm_value: (data.pwm_value as number) ?? (data.pwm as number) ?? 0,
      emergency_stopped: (data.emergency_stopped as boolean) ?? false,
      last_command: data.timestamp ? new Date((data.timestamp as number) * 1000).toISOString() : new Date().toISOString(),
    })
  } else if (type === 'esp_health') {
    // Update ESP connection status (affects actuator display)
    const espId = data.esp_id as string
    if (!espId) return

    const esp = mockEspStore.mockEsps.find(e => e.esp_id === espId)
    if (!esp) return

    mockEspStore.updateEspFromEvent(espId, {
      connected: data.status === 'online' || data.status === 'connected',
    })
  }
}

const allActuators = computed(() => {
  return mockEspStore.mockEsps.flatMap(esp =>
    esp.actuators.map(actuator => ({
      ...actuator,
      esp_id: esp.esp_id,
      esp_state: esp.system_state,
    }))
  )
})

// Filtered actuators based on active filters
const filteredActuators = computed(() => {
  return allActuators.value.filter(actuator => {
    // ESP ID filter (substring match)
    if (filterEspId.value && !actuator.esp_id.toLowerCase().includes(filterEspId.value.toLowerCase())) {
      return false
    }
    // Actuator type filter
    if (filterActuatorType.value.length > 0 && !filterActuatorType.value.includes(actuator.actuator_type)) {
      return false
    }
    // State filter
    if (filterState.value.length > 0) {
      const matchesOn = filterState.value.includes('on') && actuator.state && !actuator.emergency_stopped
      const matchesOff = filterState.value.includes('off') && !actuator.state && !actuator.emergency_stopped
      const matchesEmergency = filterState.value.includes('emergency') && actuator.emergency_stopped
      if (!matchesOn && !matchesOff && !matchesEmergency) {
        return false
      }
    }
    return true
  })
})

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return filterEspId.value !== '' ||
    filterActuatorType.value.length > 0 ||
    filterState.value.length > 0
})

// Count actuators by state
const actuatorStats = computed(() => {
  const stats = { on: 0, off: 0, emergency: 0 }
  allActuators.value.forEach(actuator => {
    if (actuator.emergency_stopped) stats.emergency++
    else if (actuator.state) stats.on++
    else stats.off++
  })
  return stats
})

function clearFilters() {
  filterEspId.value = ''
  filterActuatorType.value = []
  filterState.value = []
}

function toggleActuatorType(type: string) {
  const index = filterActuatorType.value.indexOf(type)
  if (index === -1) {
    filterActuatorType.value.push(type)
  } else {
    filterActuatorType.value.splice(index, 1)
  }
}

function toggleStateFilter(state: ActuatorStateFilter) {
  const index = filterState.value.indexOf(state)
  if (index === -1) {
    filterState.value.push(state)
  } else {
    filterState.value.splice(index, 1)
  }
}

async function toggleActuator(espId: string, gpio: number, currentState: boolean) {
  await mockEspStore.setActuatorState(espId, gpio, !currentState)
}

async function emergencyStopAll() {
  if (confirm('Trigger emergency stop on ALL mock ESPs?')) {
    for (const esp of mockEspStore.mockEsps) {
      await mockEspStore.emergencyStop(esp.esp_id, 'Global emergency stop from UI')
    }
  }
}
</script>

<template>
  <div class="space-y-4 md:space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-xl md:text-2xl font-bold text-dark-100">Actuators</h1>
        <p class="text-dark-400 mt-1 text-sm md:text-base">
          All actuators across mock ESPs
          <span v-if="hasActiveFilters" class="text-blue-400">
            · Showing {{ filteredActuators.length }} of {{ allActuators.length }}
          </span>
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn-secondary flex items-center gap-2"
          @click="showFilters = !showFilters"
        >
          <Filter class="w-4 h-4" />
          <span>Filters</span>
          <span v-if="hasActiveFilters" class="badge badge-info text-xs">
            {{ filterActuatorType.length + filterState.length + (filterEspId ? 1 : 0) }}
          </span>
          <component :is="showFilters ? ChevronUp : ChevronDown" class="w-4 h-4" />
        </button>
        <button class="btn-danger flex items-center gap-2" @click="emergencyStopAll">
          <AlertTriangle class="w-4 h-4" />
          <span class="hidden sm:inline">Emergency Stop All</span>
          <span class="sm:hidden">E-Stop All</span>
        </button>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="grid grid-cols-3 gap-2 md:gap-4">
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-green-400">{{ actuatorStats.on }}</p>
        <p class="text-xs md:text-sm text-dark-400">Active (ON)</p>
      </div>
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-dark-400">{{ actuatorStats.off }}</p>
        <p class="text-xs md:text-sm text-dark-400">Inactive (OFF)</p>
      </div>
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-red-400">{{ actuatorStats.emergency }}</p>
        <p class="text-xs md:text-sm text-dark-400">Emergency Stop</p>
      </div>
    </div>

    <!-- Filter Panel -->
    <Transition name="slide">
      <div v-if="showFilters" class="card p-4">
        <div class="flex flex-col lg:flex-row gap-4">
          <!-- ESP ID Filter -->
          <div class="flex-1">
            <label class="label">ESP ID</label>
            <div class="relative">
              <input
                v-model="filterEspId"
                type="text"
                class="input pr-8"
                placeholder="Search by ESP ID..."
                list="esp-ids-actuators"
              />
              <datalist id="esp-ids-actuators">
                <option v-for="id in availableEspIds" :key="id" :value="id" />
              </datalist>
              <button
                v-if="filterEspId"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200"
                @click="filterEspId = ''"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Actuator Type Filter -->
          <div class="flex-1">
            <label class="label">Actuator Type</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="type in availableActuatorTypes"
                :key="type"
                :class="[
                  'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                  filterActuatorType.includes(type)
                    ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50'
                    : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                ]"
                @click="toggleActuatorType(type)"
              >
                {{ type }}
              </button>
            </div>
          </div>

          <!-- State Filter -->
          <div class="flex-1">
            <label class="label">State</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="state in stateFilters"
                :key="state.value"
                :class="[
                  'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                  filterState.includes(state.value)
                    ? state.value === 'on' ? 'bg-green-500/30 text-green-300 border border-green-500/50'
                    : state.value === 'emergency' ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                    : 'bg-dark-500/30 text-dark-200 border border-dark-400/50'
                    : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                ]"
                @click="toggleStateFilter(state.value)"
              >
                {{ state.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Clear Filters -->
        <div v-if="hasActiveFilters" class="mt-4 pt-4 border-t border-dark-700">
          <button class="btn-ghost text-sm" @click="clearFilters">
            <X class="w-4 h-4 mr-1" />
            Clear all filters
          </button>
        </div>
      </div>
    </Transition>

    <!-- Loading State -->
    <div v-if="mockEspStore.isLoading" class="text-center py-12 text-dark-400">
      <div class="animate-spin w-8 h-8 border-2 border-dark-600 border-t-blue-500 rounded-full mx-auto mb-4" />
      Loading actuators...
    </div>

    <!-- Empty State -->
    <div v-else-if="allActuators.length === 0" class="card p-8 md:p-12 text-center">
      <Power class="w-12 h-12 text-dark-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-dark-200 mb-2">No Actuators</h3>
      <p class="text-dark-400">
        Create a mock ESP and add actuators to see them here
      </p>
    </div>

    <!-- No Results (filters active) -->
    <div v-else-if="filteredActuators.length === 0 && hasActiveFilters" class="card p-8 md:p-12 text-center">
      <Filter class="w-12 h-12 text-dark-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-dark-200 mb-2">No Matching Actuators</h3>
      <p class="text-dark-400 mb-4">
        No actuators match your current filters
      </p>
      <button class="btn-secondary" @click="clearFilters">
        Clear Filters
      </button>
    </div>

    <!-- Actuator Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      <div
        v-for="actuator in filteredActuators"
        :key="`${actuator.esp_id}-${actuator.gpio}`"
        class="card hover:border-dark-600 transition-colors"
        :class="{ 'border-red-500/30': actuator.emergency_stopped }"
      >
        <div class="card-header flex items-center gap-3">
          <div
            :class="[
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              actuator.state ? 'bg-green-500/20' : 'bg-dark-700'
            ]"
          >
            <Power :class="['w-5 h-5', actuator.state ? 'text-green-400' : 'text-dark-400']" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-dark-100 truncate">{{ actuator.name || `GPIO ${actuator.gpio}` }}</p>
            <p class="text-xs text-dark-400 truncate">{{ actuator.esp_id }} · {{ actuator.actuator_type }}</p>
          </div>
        </div>
        <div class="card-body">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span :class="['badge', actuator.state ? 'badge-success' : 'badge-gray']">
                {{ actuator.state ? 'ON' : 'OFF' }}
              </span>
              <span v-if="actuator.emergency_stopped" class="badge badge-danger">
                E-STOP
              </span>
            </div>
            <button
              class="btn-secondary btn-sm flex-shrink-0 touch-target"
              :disabled="actuator.emergency_stopped"
              @click="toggleActuator(actuator.esp_id, actuator.gpio, actuator.state)"
            >
              {{ actuator.state ? 'Turn OFF' : 'Turn ON' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Slide transition for filter panel */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 500px;
}
</style>
