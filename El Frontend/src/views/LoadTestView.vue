<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { loadTestApi, type MetricsResponse } from '@/api/loadtest'
import {
  Zap, Plus, Play, Square, RefreshCw, AlertCircle, Check, X,
  Server, Thermometer, Power, MessageSquare, Clock
} from 'lucide-vue-next'

// State
const metrics = ref<MetricsResponse | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

// Bulk create form
const bulkCount = ref(10)
const bulkPrefix = ref('LOAD_TEST')
const bulkSensors = ref(2)
const bulkActuators = ref(1)

// Simulation form
const simInterval = ref(1000)
const simDuration = ref(60)

// Metrics refresh
const metricsInterval = ref<ReturnType<typeof setInterval> | null>(null)
const isSimulating = ref(false)

// Methods
async function loadMetrics(): Promise<void> {
  try {
    metrics.value = await loadTestApi.getMetrics()
  } catch (err) {
    console.error('Failed to load metrics:', err)
  }
}

async function bulkCreate(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    const response = await loadTestApi.bulkCreate({
      count: bulkCount.value,
      prefix: bulkPrefix.value,
      with_sensors: bulkSensors.value,
      with_actuators: bulkActuators.value
    })
    
    successMessage.value = response.message
    await loadMetrics()
    setTimeout(() => successMessage.value = null, 5000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to create mock ESPs'
  } finally {
    isLoading.value = false
  }
}

async function startSimulation(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    const response = await loadTestApi.startSimulation({
      interval_ms: simInterval.value,
      duration_seconds: simDuration.value
    })
    
    isSimulating.value = true
    successMessage.value = response.message
    await loadMetrics()
    
    // Start metrics refresh
    if (metricsInterval.value) clearInterval(metricsInterval.value)
    metricsInterval.value = setInterval(loadMetrics, 2000)
    
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to start simulation'
  } finally {
    isLoading.value = false
  }
}

async function stopSimulation(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    const response = await loadTestApi.stopSimulation()
    
    isSimulating.value = false
    successMessage.value = response.message
    
    // Stop metrics refresh
    if (metricsInterval.value) {
      clearInterval(metricsInterval.value)
      metricsInterval.value = null
    }
    
    await loadMetrics()
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to stop simulation'
  } finally {
    isLoading.value = false
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

// Lifecycle
onMounted(() => {
  loadMetrics()
})

onUnmounted(() => {
  if (metricsInterval.value) {
    clearInterval(metricsInterval.value)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-dark-100 flex items-center gap-3">
          <Zap class="w-7 h-7 text-orange-400" />
          Load Testing
        </h1>
        <p class="text-sm text-dark-400 mt-1">
          Create mock ESPs and simulate sensor activity
        </p>
      </div>

      <button
        class="btn-secondary"
        :disabled="isLoading"
        @click="loadMetrics"
      >
        <RefreshCw :class="['w-4 h-4 mr-2', isLoading && 'animate-spin']" />
        Refresh Metrics
      </button>
    </div>

    <!-- Alerts -->
    <div
      v-if="error"
      class="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3"
    >
      <AlertCircle class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <p class="text-sm text-red-400 flex-1">{{ error }}</p>
      <button class="text-red-400 hover:text-red-300" @click="error = null">
        <X class="w-4 h-4" />
      </button>
    </div>

    <div
      v-if="successMessage"
      class="p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-start gap-3"
    >
      <Check class="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
      <p class="text-sm text-green-400">{{ successMessage }}</p>
    </div>

    <!-- Metrics Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div class="card p-4">
        <div class="flex items-center gap-2 text-dark-400 mb-2">
          <Server class="w-4 h-4" />
          <span class="text-xs uppercase tracking-wider">Mock ESPs</span>
        </div>
        <p class="text-2xl font-bold text-dark-100">
          {{ metrics?.mock_esp_count || 0 }}
        </p>
      </div>
      
      <div class="card p-4">
        <div class="flex items-center gap-2 text-dark-400 mb-2">
          <Thermometer class="w-4 h-4" />
          <span class="text-xs uppercase tracking-wider">Sensors</span>
        </div>
        <p class="text-2xl font-bold text-blue-400">
          {{ metrics?.total_sensors || 0 }}
        </p>
      </div>
      
      <div class="card p-4">
        <div class="flex items-center gap-2 text-dark-400 mb-2">
          <Power class="w-4 h-4" />
          <span class="text-xs uppercase tracking-wider">Actuators</span>
        </div>
        <p class="text-2xl font-bold text-green-400">
          {{ metrics?.total_actuators || 0 }}
        </p>
      </div>
      
      <div class="card p-4">
        <div class="flex items-center gap-2 text-dark-400 mb-2">
          <MessageSquare class="w-4 h-4" />
          <span class="text-xs uppercase tracking-wider">Messages</span>
        </div>
        <p class="text-2xl font-bold text-purple-400">
          {{ (metrics?.messages_published || 0).toLocaleString() }}
        </p>
      </div>
      
      <div class="card p-4">
        <div class="flex items-center gap-2 text-dark-400 mb-2">
          <Clock class="w-4 h-4" />
          <span class="text-xs uppercase tracking-wider">Uptime</span>
        </div>
        <p class="text-2xl font-bold text-yellow-400">
          {{ formatUptime(metrics?.uptime_seconds || 0) }}
        </p>
      </div>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <!-- Bulk Create Card -->
      <div class="card">
        <div class="px-4 py-3 border-b border-dark-700">
          <h3 class="font-semibold text-dark-100 flex items-center gap-2">
            <Plus class="w-4 h-4 text-blue-400" />
            Bulk Create Mock ESPs
          </h3>
        </div>
        
        <div class="p-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Count</label>
              <input
                v-model.number="bulkCount"
                type="number"
                min="1"
                max="100"
                class="input w-full"
              />
            </div>
            <div>
              <label class="label">Prefix</label>
              <input
                v-model="bulkPrefix"
                type="text"
                class="input w-full"
              />
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Sensors per ESP</label>
              <input
                v-model.number="bulkSensors"
                type="number"
                min="0"
                max="10"
                class="input w-full"
              />
            </div>
            <div>
              <label class="label">Actuators per ESP</label>
              <input
                v-model.number="bulkActuators"
                type="number"
                min="0"
                max="10"
                class="input w-full"
              />
            </div>
          </div>
          
          <button
            class="btn-primary w-full"
            :disabled="isLoading"
            @click="bulkCreate"
          >
            <Plus class="w-4 h-4 mr-2" />
            Create {{ bulkCount }} Mock ESPs
          </button>
        </div>
      </div>

      <!-- Simulation Control Card -->
      <div class="card">
        <div class="px-4 py-3 border-b border-dark-700">
          <h3 class="font-semibold text-dark-100 flex items-center gap-2">
            <Zap class="w-4 h-4 text-orange-400" />
            Simulation Control
          </h3>
        </div>
        
        <div class="p-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Interval (ms)</label>
              <input
                v-model.number="simInterval"
                type="number"
                min="100"
                max="60000"
                step="100"
                class="input w-full"
              />
            </div>
            <div>
              <label class="label">Duration (seconds)</label>
              <input
                v-model.number="simDuration"
                type="number"
                min="10"
                max="3600"
                class="input w-full"
              />
            </div>
          </div>
          
          <div class="flex items-center gap-2 p-3 rounded bg-dark-800/50">
            <div
              :class="[
                'w-3 h-3 rounded-full',
                isSimulating ? 'bg-green-500 animate-pulse' : 'bg-dark-500'
              ]"
            />
            <span class="text-sm text-dark-300">
              {{ isSimulating ? 'Simulation running...' : 'Simulation stopped' }}
            </span>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <button
              class="btn-primary"
              :disabled="isLoading || isSimulating"
              @click="startSimulation"
            >
              <Play class="w-4 h-4 mr-2" />
              Start
            </button>
            <button
              class="btn-danger"
              :disabled="isLoading || !isSimulating"
              @click="stopSimulation"
            >
              <Square class="w-4 h-4 mr-2" />
              Stop
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Info Card -->
    <div class="card p-4">
      <h4 class="font-medium text-dark-200 mb-2">About Load Testing</h4>
      <p class="text-sm text-dark-400">
        Use this tool to create multiple mock ESP devices and simulate sensor activity.
        This is useful for stress testing the system, validating MQTT throughput, 
        and testing the UI under load. Mock ESPs are identified by 
        <code class="text-purple-400">hardware_type = "MOCK_ESP32"</code>.
      </p>
    </div>
  </div>
</template>





















