<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { MqttMessage, MessageType } from '@/types'
import { Play, Pause, Trash2, Filter, X, ChevronDown, ChevronRight } from 'lucide-vue-next'

const authStore = useAuthStore()

const messages = ref<MqttMessage[]>([])
const isConnected = ref(false)
const isPaused = ref(false)
const ws = ref<WebSocket | null>(null)
const maxMessages = 500
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const reconnectDelayMs = 3000

// Filters
const showFilters = ref(false)
const filterTypes = ref<MessageType[]>([])
const filterEspId = ref('')
const filterTopic = ref('')

// Expanded messages
const expandedIds = ref<Set<string>>(new Set())

const filteredMessages = computed(() => {
  return messages.value.filter(msg => {
    if (filterTypes.value.length > 0 && !filterTypes.value.includes(msg.type)) return false
    if (filterEspId.value && !msg.esp_id?.includes(filterEspId.value)) return false
    if (filterTopic.value && !msg.topic.includes(filterTopic.value)) return false
    return true
  })
})

// All message types from server broadcasts (see MessageType in types/index.ts)
const messageTypes: MessageType[] = [
  'sensor_data',
  'actuator_status',
  'actuator_response',
  'actuator_alert',
  'esp_health',
  'config_response',
  'zone_assignment',
  'logic_execution',
  'system_event',
]

async function ensureAuthToken(): Promise<string | null> {
  if (authStore.accessToken) {
    return authStore.accessToken
  }

  if (authStore.refreshToken) {
    try {
      await authStore.refreshTokens()
      return authStore.accessToken
    } catch (err) {
      console.error('WebSocket token refresh failed', err)
    }
  }

  await authStore.logout()
  window.location.href = '/login'
  return null
}

async function connect() {
  if (ws.value) return

  const token = await ensureAuthToken()
  if (!token) return

  const clientId = `frontend_${Date.now()}`
  // Use backend server URL (API_BASE), not frontend dev server
  const apiHost = import.meta.env.VITE_API_HOST || 'localhost:8000'
  const wsUrl = `ws://${apiHost}/api/v1/ws/realtime/${clientId}?token=${token}`

  ws.value = new WebSocket(wsUrl)

  ws.value.onopen = () => {
    isConnected.value = true
    // Subscribe to all message types
    ws.value?.send(JSON.stringify({
      action: 'subscribe',
      filters: { types: messageTypes }
    }))
  }

  ws.value.onmessage = (event) => {
    if (isPaused.value) return

    try {
      const data = JSON.parse(event.data)
      const msg: MqttMessage = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toISOString(),
        type: data.type || 'system_event',
        topic: data.topic || '',
        payload: data.payload || data,
        esp_id: data.esp_id,
      }

      messages.value.unshift(msg)

      // Limit messages
      if (messages.value.length > maxMessages) {
        messages.value = messages.value.slice(0, maxMessages)
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e)
    }
  }

  ws.value.onclose = () => {
    isConnected.value = false
    ws.value = null

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      if (!ws.value) {
        connect()
      }
    }, reconnectDelayMs)
  }

  ws.value.onerror = (error) => {
    console.error('WebSocket error:', error)
  }
}

function disconnect() {
  ws.value?.close()
  ws.value = null
  isConnected.value = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function togglePause() {
  isPaused.value = !isPaused.value
}

function clearMessages() {
  messages.value = []
  expandedIds.value.clear()
}

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

function getTypeColor(type: MessageType): string {
  switch (type) {
    case 'sensor_data': return 'badge-info'
    case 'actuator_status': return 'badge-success'
    case 'actuator_response': return 'badge-success'
    case 'actuator_alert': return 'badge-danger'
    case 'esp_health': return 'badge-gray'
    case 'config_response': return 'badge-warning'
    case 'zone_assignment': return 'badge-info'
    case 'logic_execution': return 'badge-warning'
    case 'system_event': return 'badge-danger'
    default: return 'badge-gray'
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString()
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-dark-100">MQTT Message Log</h1>
        <p class="text-dark-400 mt-1">Real-time message stream from WebSocket</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span
            :class="['status-dot', isConnected ? 'status-online' : 'status-offline']"
          />
          <span class="text-sm text-dark-400">
            {{ isConnected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
        <button
          class="btn-secondary"
          @click="togglePause"
        >
          <Pause v-if="!isPaused" class="w-4 h-4 mr-2" />
          <Play v-else class="w-4 h-4 mr-2" />
          {{ isPaused ? 'Resume' : 'Pause' }}
        </button>
        <button
          class="btn-secondary"
          @click="showFilters = !showFilters"
        >
          <Filter class="w-4 h-4 mr-2" />
          Filters
        </button>
        <button
          class="btn-secondary"
          @click="clearMessages"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          Clear
        </button>
      </div>
    </div>

    <!-- Filters Panel -->
    <div v-if="showFilters" class="card p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-medium text-dark-100">Filters</h3>
        <button class="text-dark-400 hover:text-dark-200" @click="showFilters = false">
          <X class="w-4 h-4" />
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="label">Message Types</label>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="type in messageTypes"
              :key="type"
              class="flex items-center gap-2 cursor-pointer"
            >
              <input
                v-model="filterTypes"
                :value="type"
                type="checkbox"
                class="w-4 h-4 rounded border-dark-600 bg-dark-800"
              />
              <span class="text-sm text-dark-300">{{ type }}</span>
            </label>
          </div>
        </div>
        <div>
          <label class="label">ESP ID</label>
          <input
            v-model="filterEspId"
            class="input"
            placeholder="e.g., ESP_12AB"
          />
        </div>
        <div>
          <label class="label">Topic Contains</label>
          <input
            v-model="filterTopic"
            class="input"
            placeholder="e.g., sensor"
          />
        </div>
      </div>
    </div>

    <!-- Message Count -->
    <div class="text-sm text-dark-400">
      Showing {{ filteredMessages.length }} of {{ messages.length }} messages
      <span v-if="isPaused" class="text-yellow-400 ml-2">(Paused)</span>
    </div>

    <!-- Messages List -->
    <div class="card overflow-hidden">
      <div v-if="filteredMessages.length === 0" class="p-12 text-center text-dark-400">
        <p v-if="messages.length === 0">Waiting for messages...</p>
        <p v-else>No messages match current filters</p>
      </div>
      <div v-else class="divide-y divide-dark-700 max-h-[600px] overflow-y-auto">
        <div
          v-for="msg in filteredMessages"
          :key="msg.id"
          class="hover:bg-dark-800/50"
        >
          <!-- Message Header -->
          <div
            class="flex items-center gap-3 p-3 cursor-pointer"
            @click="toggleExpand(msg.id)"
          >
            <button class="text-dark-400">
              <ChevronRight
                v-if="!expandedIds.has(msg.id)"
                class="w-4 h-4"
              />
              <ChevronDown v-else class="w-4 h-4" />
            </button>
            <span class="text-xs text-dark-500 font-mono w-20">
              {{ formatTime(msg.timestamp) }}
            </span>
            <span :class="['badge', getTypeColor(msg.type)]">
              {{ msg.type }}
            </span>
            <span v-if="msg.esp_id" class="text-xs text-dark-400 font-mono">
              {{ msg.esp_id }}
            </span>
            <span class="flex-1 text-sm text-dark-300 font-mono truncate">
              {{ msg.topic }}
            </span>
          </div>

          <!-- Expanded Payload -->
          <div
            v-if="expandedIds.has(msg.id)"
            class="px-4 pb-4 pl-12"
          >
            <pre class="text-xs font-mono bg-dark-950 p-3 rounded-lg overflow-x-auto text-dark-300">{{ formatJson(msg.payload) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
