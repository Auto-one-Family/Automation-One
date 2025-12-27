<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { configApi, type ConfigEntry } from '@/api/config'
import {
  Settings, RefreshCw, Save, AlertCircle, Check, X, Edit, Lock, Eye, EyeOff
} from 'lucide-vue-next'

// State
const configs = ref<ConfigEntry[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

// Edit state
const editingKey = ref<string | null>(null)
const editValue = ref<string>('')
const showSecretValues = ref<Set<string>>(new Set())

// Filter state
const selectedType = ref<string>('')

// Computed
const configTypes = computed(() => {
  const types = new Set(configs.value.map(c => c.config_type))
  return Array.from(types).sort()
})

const filteredConfigs = computed(() => {
  if (!selectedType.value) return configs.value
  return configs.value.filter(c => c.config_type === selectedType.value)
})

const groupedConfigs = computed(() => {
  const groups: Record<string, ConfigEntry[]> = {}
  for (const config of filteredConfigs.value) {
    if (!groups[config.config_type]) {
      groups[config.config_type] = []
    }
    groups[config.config_type].push(config)
  }
  return groups
})

// Methods
async function loadConfigs(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    configs.value = await configApi.listConfig()
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to load configuration'
  } finally {
    isLoading.value = false
  }
}

function startEdit(config: ConfigEntry): void {
  if (config.is_secret) return
  editingKey.value = config.config_key
  editValue.value = typeof config.config_value === 'string' 
    ? config.config_value 
    : JSON.stringify(config.config_value, null, 2)
}

function cancelEdit(): void {
  editingKey.value = null
  editValue.value = ''
}

async function saveConfig(): Promise<void> {
  if (!editingKey.value) return

  isLoading.value = true
  error.value = null

  try {
    // Try to parse as JSON, fall back to string
    let value: unknown
    try {
      value = JSON.parse(editValue.value)
    } catch {
      value = editValue.value
    }

    await configApi.updateConfig(editingKey.value, value)
    
    editingKey.value = null
    editValue.value = ''
    successMessage.value = 'Configuration saved successfully'
    await loadConfigs()
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to save configuration'
  } finally {
    isLoading.value = false
  }
}

function toggleSecretVisibility(key: string): void {
  if (showSecretValues.value.has(key)) {
    showSecretValues.value.delete(key)
  } else {
    showSecretValues.value.add(key)
  }
}

function formatValue(config: ConfigEntry): string {
  if (config.is_secret && !showSecretValues.value.has(config.config_key)) {
    return '••••••••'
  }
  
  if (typeof config.config_value === 'object') {
    return JSON.stringify(config.config_value, null, 2)
  }
  return String(config.config_value)
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    mqtt: 'text-blue-400',
    database: 'text-green-400',
    api: 'text-purple-400',
    security: 'text-red-400',
    pi_enhanced: 'text-yellow-400'
  }
  return colors[type] || 'text-dark-400'
}

onMounted(() => {
  loadConfigs()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-dark-100 flex items-center gap-3">
          <Settings class="w-7 h-7 text-yellow-400" />
          System Configuration
        </h1>
        <p class="text-sm text-dark-400 mt-1">
          View and modify system configuration
        </p>
      </div>

      <div class="flex items-center gap-2">
        <select v-model="selectedType" class="input">
          <option value="">All Types</option>
          <option v-for="type in configTypes" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
        <button
          class="btn-secondary"
          :disabled="isLoading"
          @click="loadConfigs"
        >
          <RefreshCw :class="['w-4 h-4 mr-2', isLoading && 'animate-spin']" />
          Refresh
        </button>
      </div>
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

    <!-- Config Groups -->
    <div class="space-y-6">
      <div v-for="(groupConfigs, groupName) in groupedConfigs" :key="groupName" class="card">
        <div class="px-4 py-3 border-b border-dark-700">
          <h3 :class="['font-semibold uppercase tracking-wider text-sm', getTypeColor(groupName)]">
            {{ groupName }}
          </h3>
        </div>
        
        <div class="divide-y divide-dark-800">
          <div
            v-for="config in groupConfigs"
            :key="config.config_key"
            class="p-4 hover:bg-dark-800/30"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <code class="text-sm font-mono text-dark-100">{{ config.config_key }}</code>
                  <Lock v-if="config.is_secret" class="w-3 h-3 text-yellow-400" title="Secret value" />
                </div>
                <p v-if="config.description" class="text-xs text-dark-500 mt-1">
                  {{ config.description }}
                </p>
              </div>
              
              <!-- Actions -->
              <div class="flex items-center gap-1">
                <button
                  v-if="config.is_secret"
                  class="p-1.5 rounded hover:bg-dark-700 text-dark-400"
                  @click="toggleSecretVisibility(config.config_key)"
                >
                  <component :is="showSecretValues.has(config.config_key) ? EyeOff : Eye" class="w-4 h-4" />
                </button>
                <button
                  v-if="!config.is_secret"
                  class="p-1.5 rounded hover:bg-dark-700 text-dark-400 hover:text-blue-400"
                  @click="startEdit(config)"
                >
                  <Edit class="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <!-- Value Display/Edit -->
            <div class="mt-2">
              <template v-if="editingKey === config.config_key">
                <textarea
                  v-model="editValue"
                  class="input w-full font-mono text-sm"
                  rows="3"
                  placeholder="Enter value (JSON or string)"
                />
                <div class="flex justify-end gap-2 mt-2">
                  <button class="btn-ghost btn-sm" @click="cancelEdit">
                    Cancel
                  </button>
                  <button class="btn-primary btn-sm" :disabled="isLoading" @click="saveConfig">
                    <Save class="w-3 h-3 mr-1" />
                    Save
                  </button>
                </div>
              </template>
              <template v-else>
                <pre
                  :class="[
                    'p-2 rounded bg-dark-800 text-sm font-mono overflow-x-auto',
                    config.is_secret ? 'text-yellow-400' : 'text-dark-200'
                  ]"
                >{{ formatValue(config) }}</pre>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!isLoading && configs.length === 0" class="card p-12 text-center">
      <Settings class="w-16 h-16 mx-auto mb-4 text-dark-600" />
      <h3 class="text-lg font-medium text-dark-300 mb-2">No Configuration</h3>
      <p class="text-sm text-dark-500">
        No system configuration entries found
      </p>
    </div>
  </div>
</template>












