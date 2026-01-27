<script setup lang="ts">
/**
 * SensorsView (with Actuators Tab)
 *
 * Combined view for Sensors and Actuators with tab navigation.
 * URL query parameter ?tab=actuators switches to actuators tab.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import type { QualityLevel } from '@/types'
import {
  Thermometer,
  Gauge,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Power,
  AlertTriangle,
} from 'lucide-vue-next'

type TabType = 'sensors' | 'actuators'
type ActuatorStateFilter = 'on' | 'off' | 'emergency'

const route = useRoute()
const router = useRouter()
const espStore = useEspStore()

// =============================================================================
// Tab State
// =============================================================================
const activeTab = ref<TabType>('sensors')

// Initialize from URL query parameter
watch(
  () => route.query.tab,
  (tab) => {
    if (tab === 'actuators') {
      activeTab.value = 'actuators'
    } else {
      activeTab.value = 'sensors'
    }
  },
  { immediate: true }
)

// Switch tab and update URL
function setActiveTab(tab: TabType) {
  activeTab.value = tab
  const query = tab === 'actuators' ? { tab: 'actuators' } : {}
  router.replace({ path: '/sensors', query })
}

// Track updated items for visual feedback
const updatedSensorKeys = ref<Set<string>>(new Set())

// =============================================================================
// Common Filter State
// =============================================================================
const showFilters = ref(false)
const filterEspId = ref('')

// Sensor-specific filters
const filterSensorType = ref<string[]>([])
const filterQuality = ref<QualityLevel[]>([])
const qualityLevels: QualityLevel[] = ['excellent', 'good', 'fair', 'poor', 'bad', 'stale']

// Actuator-specific filters
const filterActuatorType = ref<string[]>([])
const filterState = ref<ActuatorStateFilter[]>([])
const stateFilters: { value: ActuatorStateFilter; label: string }[] = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
  { value: 'emergency', label: 'E-STOP' },
]

// =============================================================================
// Available Filter Options (computed from data)
// =============================================================================
const availableEspIds = computed(() => {
  return espStore.devices.map(esp => espStore.getDeviceId(esp)).sort()
})

const availableSensorTypes = computed(() => {
  const types = new Set<string>()
  espStore.devices.forEach(esp => {
    if (esp.sensors) {
      (esp.sensors as { sensor_type: string }[]).forEach(sensor => types.add(sensor.sensor_type))
    }
  })
  return Array.from(types).sort()
})

const availableActuatorTypes = computed(() => {
  const types = new Set<string>()
  espStore.devices.forEach(esp => {
    if (esp.actuators) {
      (esp.actuators as { actuator_type: string }[]).forEach(actuator => types.add(actuator.actuator_type))
    }
  })
  return Array.from(types).sort()
})

// =============================================================================
// Lifecycle
// =============================================================================
onMounted(async () => {
  // Initial load via REST (WebSocket is handled by esp store)
  await espStore.fetchAll()
})

// =============================================================================
// Sensor Data & Filters
// =============================================================================
const allSensors = computed(() => {
  return espStore.devices.flatMap(esp => {
    const sensors = esp.sensors as { gpio: number; sensor_type: string; name: string | null; raw_value: number; unit: string; quality: QualityLevel }[] | undefined
    if (!sensors) return []
    return sensors.map(sensor => ({
      ...sensor,
      esp_id: espStore.getDeviceId(esp),
      esp_state: esp.system_state,
    }))
  })
})

const filteredSensors = computed(() => {
  return allSensors.value.filter(sensor => {
    if (filterEspId.value && !sensor.esp_id.toLowerCase().includes(filterEspId.value.toLowerCase())) {
      return false
    }
    if (filterSensorType.value.length > 0 && !filterSensorType.value.includes(sensor.sensor_type)) {
      return false
    }
    if (filterQuality.value.length > 0 && !filterQuality.value.includes(sensor.quality)) {
      return false
    }
    return true
  })
})

const hasSensorFilters = computed(() => {
  return filterEspId.value !== '' ||
    filterSensorType.value.length > 0 ||
    filterQuality.value.length > 0
})

// =============================================================================
// Actuator Data & Filters
// =============================================================================
const allActuators = computed(() => {
  return espStore.devices.flatMap(esp => {
    const actuators = esp.actuators as { gpio: number; actuator_type: string; name: string | null; state: boolean; pwm_value: number; emergency_stopped: boolean }[] | undefined
    if (!actuators) return []
    return actuators.map(actuator => ({
      ...actuator,
      esp_id: espStore.getDeviceId(esp),
      esp_state: esp.system_state,
    }))
  })
})

const filteredActuators = computed(() => {
  return allActuators.value.filter(actuator => {
    if (filterEspId.value && !actuator.esp_id.toLowerCase().includes(filterEspId.value.toLowerCase())) {
      return false
    }
    if (filterActuatorType.value.length > 0 && !filterActuatorType.value.includes(actuator.actuator_type)) {
      return false
    }
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

const hasActuatorFilters = computed(() => {
  return filterEspId.value !== '' ||
    filterActuatorType.value.length > 0 ||
    filterState.value.length > 0
})

const actuatorStats = computed(() => {
  const stats = { on: 0, off: 0, emergency: 0 }
  allActuators.value.forEach(actuator => {
    if (actuator.emergency_stopped) stats.emergency++
    else if (actuator.state) stats.on++
    else stats.off++
  })
  return stats
})

// =============================================================================
// Combined hasActiveFilters based on current tab
// =============================================================================
const hasActiveFilters = computed(() => {
  return activeTab.value === 'sensors' ? hasSensorFilters.value : hasActuatorFilters.value
})

const activeFilterCount = computed(() => {
  if (activeTab.value === 'sensors') {
    return filterSensorType.value.length + filterQuality.value.length + (filterEspId.value ? 1 : 0)
  } else {
    return filterActuatorType.value.length + filterState.value.length + (filterEspId.value ? 1 : 0)
  }
})

// =============================================================================
// Filter Actions
// =============================================================================
function clearFilters() {
  filterEspId.value = ''
  if (activeTab.value === 'sensors') {
    filterSensorType.value = []
    filterQuality.value = []
  } else {
    filterActuatorType.value = []
    filterState.value = []
  }
}

function toggleSensorType(type: string) {
  const index = filterSensorType.value.indexOf(type)
  if (index === -1) {
    filterSensorType.value.push(type)
  } else {
    filterSensorType.value.splice(index, 1)
  }
}

function toggleQuality(quality: QualityLevel) {
  const index = filterQuality.value.indexOf(quality)
  if (index === -1) {
    filterQuality.value.push(quality)
  } else {
    filterQuality.value.splice(index, 1)
  }
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

// =============================================================================
// Actuator Actions
// =============================================================================
async function toggleActuator(espId: string, gpio: number, currentState: boolean) {
  await espStore.setActuatorState(espId, gpio, !currentState)
}

async function emergencyStopAll() {
  if (confirm('Emergency-Stop für ALLE ESPs auslösen?')) {
    for (const esp of espStore.devices) {
      await espStore.emergencyStop(espStore.getDeviceId(esp), 'Globaler Emergency-Stop über UI')
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================
function getQualityColor(quality: string): string {
  switch (quality) {
    case 'excellent':
    case 'good': return 'badge-success'
    case 'fair': return 'badge-info'
    case 'poor': return 'badge-warning'
    case 'bad':
    case 'stale': return 'badge-danger'
    default: return 'badge-gray'
  }
}
</script>

<template>
  <div class="h-full overflow-auto space-y-4 md:space-y-6">
    <!-- Header with Tabs -->
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2 justify-end">
          <button
            class="btn-secondary flex items-center gap-2"
            @click="showFilters = !showFilters"
          >
            <Filter class="w-4 h-4" />
            <span>Filter</span>
            <span v-if="activeFilterCount > 0" class="badge badge-info text-xs">
              {{ activeFilterCount }}
            </span>
            <component :is="showFilters ? ChevronUp : ChevronDown" class="w-4 h-4" />
          </button>
          <!-- Emergency Stop (only on actuators tab) -->
          <button
            v-if="activeTab === 'actuators'"
            class="btn-danger flex items-center gap-2"
            @click="emergencyStopAll"
          >
            <AlertTriangle class="w-4 h-4" />
            <span class="hidden sm:inline">Emergency Stop All</span>
            <span class="sm:hidden">E-Stop</span>
          </button>
        </div>

      <!-- Tab Navigation -->
      <div class="tab-navigation">
        <button
          :class="['tab-btn', activeTab === 'sensors' ? 'tab-btn--active' : '']"
          @click="setActiveTab('sensors')"
        >
          <Thermometer class="w-4 h-4" />
          <span>Sensoren</span>
          <span class="tab-count">{{ allSensors.length }}</span>
        </button>
        <button
          :class="['tab-btn', activeTab === 'actuators' ? 'tab-btn--active' : '']"
          @click="setActiveTab('actuators')"
        >
          <Power class="w-4 h-4" />
          <span>Aktoren</span>
          <span class="tab-count">{{ allActuators.length }}</span>
        </button>
      </div>
    </div>

    <!-- Actuator Quick Stats (only on actuators tab) -->
    <div v-if="activeTab === 'actuators'" class="grid grid-cols-3 gap-2 md:gap-4">
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-green-400">{{ actuatorStats.on }}</p>
        <p class="text-xs md:text-sm text-dark-400">Aktiv (ON)</p>
      </div>
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-dark-400">{{ actuatorStats.off }}</p>
        <p class="text-xs md:text-sm text-dark-400">Inaktiv (OFF)</p>
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
          <!-- ESP ID Filter (common) -->
          <div class="flex-1">
            <label class="label">ESP ID</label>
            <div class="relative">
              <input
                v-model="filterEspId"
                type="text"
                class="input pr-8"
                placeholder="Nach ESP ID suchen..."
                list="esp-ids-components"
              />
              <datalist id="esp-ids-components">
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

          <!-- Sensor Type Filter (sensors tab) -->
          <template v-if="activeTab === 'sensors'">
            <div class="flex-1">
              <label class="label">Sensor Typ</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="type in availableSensorTypes"
                  :key="type"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                    filterSensorType.includes(type)
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                  ]"
                  @click="toggleSensorType(type)"
                >
                  {{ type }}
                </button>
              </div>
            </div>

            <div class="flex-1">
              <label class="label">Qualität</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="quality in qualityLevels"
                  :key="quality"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                    filterQuality.includes(quality)
                      ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                  ]"
                  @click="toggleQuality(quality)"
                >
                  {{ quality }}
                </button>
              </div>
            </div>
          </template>

          <!-- Actuator Type Filter (actuators tab) -->
          <template v-if="activeTab === 'actuators'">
            <div class="flex-1">
              <label class="label">Aktor Typ</label>
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

            <div class="flex-1">
              <label class="label">Status</label>
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
          </template>
        </div>

        <!-- Clear Filters -->
        <div v-if="hasActiveFilters" class="mt-4 pt-4 border-t border-dark-700">
          <button class="btn-ghost text-sm" @click="clearFilters">
            <X class="w-4 h-4 mr-1" />
            Alle Filter zurücksetzen
          </button>
        </div>
      </div>
    </Transition>

    <!-- Loading State -->
    <div v-if="espStore.isLoading" class="text-center py-12 text-dark-400">
      <div class="animate-spin w-8 h-8 border-2 border-dark-600 border-t-blue-500 rounded-full mx-auto mb-4" />
      Lade {{ activeTab === 'sensors' ? 'Sensoren' : 'Aktoren' }}...
    </div>

    <!-- ========== SENSORS TAB CONTENT ========== -->
    <template v-else-if="activeTab === 'sensors'">
      <!-- Empty State -->
      <div v-if="allSensors.length === 0" class="card p-8 md:p-12 text-center">
        <Thermometer class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine Sensoren</h3>
        <p class="text-dark-400">
          Erstelle einen Mock ESP mit Sensoren, um sie hier zu sehen
        </p>
      </div>

      <!-- No Results (filters active) -->
      <div v-else-if="filteredSensors.length === 0 && hasSensorFilters" class="card p-8 md:p-12 text-center">
        <Filter class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine passenden Sensoren</h3>
        <p class="text-dark-400 mb-4">
          Kein Sensor entspricht den aktuellen Filtern
        </p>
        <button class="btn-secondary" @click="clearFilters">
          Filter zurücksetzen
        </button>
      </div>

      <!-- Sensor Grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div
          v-for="sensor in filteredSensors"
          :key="`${sensor.esp_id}-${sensor.gpio}`"
          :class="[
            'card hover:border-dark-600 transition-colors',
            updatedSensorKeys.has(`${sensor.esp_id}-${sensor.gpio}`) ? 'sensor-value--updated' : ''
          ]"
        >
          <div class="card-header flex items-center gap-3">
            <div class="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Gauge class="w-5 h-5 text-purple-400" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-dark-100 truncate">{{ sensor.name || `GPIO ${sensor.gpio}` }}</p>
              <p class="text-xs text-dark-400 truncate">{{ sensor.esp_id }} · {{ sensor.sensor_type }}</p>
            </div>
          </div>
          <div class="card-body">
            <div class="flex items-end justify-between gap-2">
              <div class="min-w-0">
                <p class="text-2xl md:text-3xl font-bold font-mono text-dark-100 truncate">
                  {{ sensor.raw_value.toFixed(2) }}
                </p>
                <p class="text-sm text-dark-400">{{ sensor.unit }}</p>
              </div>
              <span :class="['badge flex-shrink-0', getQualityColor(sensor.quality)]">
                {{ sensor.quality }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ========== ACTUATORS TAB CONTENT ========== -->
    <template v-else-if="activeTab === 'actuators'">
      <!-- Empty State -->
      <div v-if="allActuators.length === 0" class="card p-8 md:p-12 text-center">
        <Power class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine Aktoren</h3>
        <p class="text-dark-400">
          Erstelle einen Mock ESP mit Aktoren, um sie hier zu sehen
        </p>
      </div>

      <!-- No Results (filters active) -->
      <div v-else-if="filteredActuators.length === 0 && hasActuatorFilters" class="card p-8 md:p-12 text-center">
        <Filter class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine passenden Aktoren</h3>
        <p class="text-dark-400 mb-4">
          Kein Aktor entspricht den aktuellen Filtern
        </p>
        <button class="btn-secondary" @click="clearFilters">
          Filter zurücksetzen
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
                {{ actuator.state ? 'Ausschalten' : 'Einschalten' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Tab Navigation */
.tab-navigation {
  display: flex;
  gap: 0.25rem;
  background-color: var(--color-bg-tertiary, #1a1a2e);
  padding: 0.25rem;
  border-radius: 0.5rem;
  width: fit-content;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
  color: var(--color-text-muted, #6b7280);
  transition: all 0.2s;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--color-text-primary, #f3f4f6);
}

.tab-btn--active {
  background: linear-gradient(135deg, var(--color-iridescent-1, #a78bfa), var(--color-iridescent-2, #818cf8));
  color: white;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 9999px;
  background-color: rgba(255, 255, 255, 0.15);
}

.tab-btn:not(.tab-btn--active) .tab-count {
  background-color: var(--color-bg-secondary, #1e1e2e);
}

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

/* Visual feedback for updated sensor values */
.sensor-value--updated {
  animation: sensorUpdateHighlight 0.5s ease-out;
}

@keyframes sensorUpdateHighlight {
  0% {
    border-color: rgba(59, 130, 246, 0.5);
    background-color: rgba(59, 130, 246, 0.1);
  }
  100% {
    border-color: transparent;
    background-color: transparent;
  }
}
</style>
