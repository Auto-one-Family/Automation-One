<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMockEspStore } from '@/stores/mockEsp'
import { useWebSocket } from '@/composables/useWebSocket'
import type { QualityLevel } from '@/types'
import type { WebSocketMessage } from '@/services/websocket'
import { Thermometer, Gauge, Filter, X, ChevronDown, ChevronUp } from 'lucide-vue-next'

const mockEspStore = useMockEspStore()

// WebSocket for live updates
const { subscribe, unsubscribe } = useWebSocket({
  autoConnect: true,
  autoReconnect: true,
})

// Track updated sensors for visual feedback
const updatedSensorKeys = ref<Set<string>>(new Set())

// Filter state
const showFilters = ref(false)
const filterEspId = ref('')
const filterSensorType = ref<string[]>([])
const filterQuality = ref<QualityLevel[]>([])

// Available filter options (computed from data)
const availableSensorTypes = computed(() => {
  const types = new Set<string>()
  mockEspStore.mockEsps.forEach(esp => {
    esp.sensors.forEach(sensor => types.add(sensor.sensor_type))
  })
  return Array.from(types).sort()
})

const availableEspIds = computed(() => {
  return mockEspStore.mockEsps.map(esp => esp.esp_id).sort()
})

const qualityLevels: QualityLevel[] = ['excellent', 'good', 'fair', 'poor', 'bad', 'stale']

onMounted(async () => {
  // Initial load via REST
  await mockEspStore.fetchAll()

  // Subscribe to WebSocket events for live updates
  subscribe(
    {
      types: ['sensor_data', 'esp_health'],
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

  if (type === 'sensor_data') {
    const espId = data.esp_id as string
    const gpio = data.gpio as number
    if (!espId || gpio === undefined) return

    // Update sensor value
    mockEspStore.updateSensorFromEvent(espId, gpio, {
      raw_value: (data.value as number) ?? (data.raw_value as number) ?? (data.raw as number),
      quality: (data.quality as QualityLevel),
      unit: (data.unit as string),
      last_read: data.timestamp ? new Date((data.timestamp as number) * 1000).toISOString() : new Date().toISOString(),
    })

    // Visual feedback: highlight updated sensor
    const sensorKey = `${espId}-${gpio}`
    updatedSensorKeys.value.add(sensorKey)
    setTimeout(() => {
      updatedSensorKeys.value.delete(sensorKey)
    }, 500) // Remove highlight after 500ms
  } else if (type === 'esp_health') {
    // Update ESP connection status (affects sensor display)
    const espId = data.esp_id as string
    if (!espId) return

    const esp = mockEspStore.mockEsps.find(e => e.esp_id === espId)
    if (!esp) return

    mockEspStore.updateEspFromEvent(espId, {
      connected: data.status === 'online' || data.status === 'connected',
    })
  }
}

const allSensors = computed(() => {
  return mockEspStore.mockEsps.flatMap(esp =>
    esp.sensors.map(sensor => ({
      ...sensor,
      esp_id: esp.esp_id,
      esp_state: esp.system_state,
    }))
  )
})

// Filtered sensors based on active filters
const filteredSensors = computed(() => {
  return allSensors.value.filter(sensor => {
    // ESP ID filter (substring match)
    if (filterEspId.value && !sensor.esp_id.toLowerCase().includes(filterEspId.value.toLowerCase())) {
      return false
    }
    // Sensor type filter
    if (filterSensorType.value.length > 0 && !filterSensorType.value.includes(sensor.sensor_type)) {
      return false
    }
    // Quality filter
    if (filterQuality.value.length > 0 && !filterQuality.value.includes(sensor.quality)) {
      return false
    }
    return true
  })
})

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return filterEspId.value !== '' ||
    filterSensorType.value.length > 0 ||
    filterQuality.value.length > 0
})

function clearFilters() {
  filterEspId.value = ''
  filterSensorType.value = []
  filterQuality.value = []
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
  <div class="space-y-4 md:space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-xl md:text-2xl font-bold text-dark-100">Sensors</h1>
        <p class="text-dark-400 mt-1 text-sm md:text-base">
          All sensors across mock ESPs
          <span v-if="hasActiveFilters" class="text-blue-400">
            · Showing {{ filteredSensors.length }} of {{ allSensors.length }}
          </span>
        </p>
      </div>
      <button
        class="btn-secondary flex items-center gap-2 self-start sm:self-auto"
        @click="showFilters = !showFilters"
      >
        <Filter class="w-4 h-4" />
        <span>Filters</span>
        <span v-if="hasActiveFilters" class="badge badge-info text-xs">
          {{ filterSensorType.length + filterQuality.length + (filterEspId ? 1 : 0) }}
        </span>
        <component :is="showFilters ? ChevronUp : ChevronDown" class="w-4 h-4" />
      </button>
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
                list="esp-ids"
              />
              <datalist id="esp-ids">
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

          <!-- Sensor Type Filter -->
          <div class="flex-1">
            <label class="label">Sensor Type</label>
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

          <!-- Quality Filter -->
          <div class="flex-1">
            <label class="label">Quality</label>
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
      Loading sensors...
    </div>

    <!-- Empty State -->
    <div v-else-if="allSensors.length === 0" class="card p-8 md:p-12 text-center">
      <Thermometer class="w-12 h-12 text-dark-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-dark-200 mb-2">No Sensors</h3>
      <p class="text-dark-400">
        Create a mock ESP and add sensors to see them here
      </p>
    </div>

    <!-- No Results (filters active) -->
    <div v-else-if="filteredSensors.length === 0 && hasActiveFilters" class="card p-8 md:p-12 text-center">
      <Filter class="w-12 h-12 text-dark-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-dark-200 mb-2">No Matching Sensors</h3>
      <p class="text-dark-400 mb-4">
        No sensors match your current filters
      </p>
      <button class="btn-secondary" @click="clearFilters">
        Clear Filters
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
