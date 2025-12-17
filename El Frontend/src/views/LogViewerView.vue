<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { logsApi, type LogEntry, type LogLevel, type LogFile, type LogQueryParams } from '@/api/logs'
import {
  FileText, RefreshCw, Filter, Search, AlertCircle, Info, AlertTriangle,
  Bug, XCircle, ChevronDown, ChevronUp, Play, Pause, Trash2
} from 'lucide-vue-next'

// State
const logs = ref<LogEntry[]>([])
const logFiles = ref<LogFile[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const totalCount = ref(0)
const hasMore = ref(false)

// Filter state
const selectedLevel = ref<LogLevel | ''>('')
const moduleFilter = ref('')
const searchQuery = ref('')
const selectedFile = ref('')
const startTime = ref<string>('')
const endTime = ref<string>('')
const page = ref(1)
const pageSize = ref(100)

// Real-time state
const isRealtime = ref(false)
const autoScroll = ref(true)
const realtimeInterval = ref<ReturnType<typeof setInterval> | null>(null)

// Expanded log entries
const expandedLogIds = ref<Set<number>>(new Set())

// Log level configuration
const LOG_LEVELS: { value: LogLevel | ''; label: string; icon: typeof Info; color: string }[] = [
  { value: '', label: 'All Levels', icon: Filter, color: 'text-dark-400' },
  { value: 'DEBUG', label: 'Debug', icon: Bug, color: 'text-gray-400' },
  { value: 'INFO', label: 'Info', icon: Info, color: 'text-blue-400' },
  { value: 'WARNING', label: 'Warning', icon: AlertTriangle, color: 'text-yellow-400' },
  { value: 'ERROR', label: 'Error', icon: XCircle, color: 'text-red-400' },
  { value: 'CRITICAL', label: 'Critical', icon: AlertCircle, color: 'text-red-600' }
]

// Computed
const currentQueryParams = computed<LogQueryParams>(() => ({
  level: selectedLevel.value || undefined,
  module: moduleFilter.value || undefined,
  search: searchQuery.value || undefined,
  file: selectedFile.value || undefined,
  start_time: startTime.value || undefined,
  end_time: endTime.value || undefined,
  page: page.value,
  page_size: pageSize.value
}))

// Methods
async function loadLogFiles(): Promise<void> {
  try {
    const response = await logsApi.listFiles()
    logFiles.value = response.files
    // Select current file by default
    const currentFile = response.files.find(f => f.is_current)
    if (currentFile && !selectedFile.value) {
      selectedFile.value = currentFile.name
    }
  } catch (err: unknown) {
    console.error('Failed to load log files:', err)
  }
}

async function loadLogs(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    const response = await logsApi.queryLogs(currentQueryParams.value)
    logs.value = response.logs
    totalCount.value = response.total_count
    hasMore.value = response.has_more

    // Auto-scroll to bottom if enabled
    if (autoScroll.value && isRealtime.value) {
      setTimeout(() => {
        const container = document.getElementById('log-container')
        if (container) {
          container.scrollTop = 0 // Logs are newest first
        }
      }, 100)
    }
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to load logs'
  } finally {
    isLoading.value = false
  }
}

function toggleRealtime(): void {
  isRealtime.value = !isRealtime.value

  if (isRealtime.value) {
    // Start polling every 3 seconds
    realtimeInterval.value = setInterval(() => {
      loadLogs()
    }, 3000)
  } else {
    // Stop polling
    if (realtimeInterval.value) {
      clearInterval(realtimeInterval.value)
      realtimeInterval.value = null
    }
  }
}

function applyFilters(): void {
  page.value = 1
  loadLogs()
}

function clearFilters(): void {
  selectedLevel.value = ''
  moduleFilter.value = ''
  searchQuery.value = ''
  startTime.value = ''
  endTime.value = ''
  page.value = 1
  loadLogs()
}

function toggleLogExpand(index: number): void {
  if (expandedLogIds.value.has(index)) {
    expandedLogIds.value.delete(index)
  } else {
    expandedLogIds.value.add(index)
  }
}

function getLevelConfig(level: string) {
  return LOG_LEVELS.find(l => l.value === level) || LOG_LEVELS[0]
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleString()
  } catch {
    return timestamp
  }
}

// Lifecycle
onMounted(async () => {
  await loadLogFiles()
  await loadLogs()
})

onUnmounted(() => {
  if (realtimeInterval.value) {
    clearInterval(realtimeInterval.value)
  }
})

// Watch for file changes
watch(selectedFile, () => {
  page.value = 1
  loadLogs()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-dark-100 flex items-center gap-3">
          <FileText class="w-7 h-7 text-blue-400" />
          Log Viewer
        </h1>
        <p class="text-sm text-dark-400 mt-1">
          View and analyze server logs
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          :class="[
            'btn-secondary',
            isRealtime && 'ring-2 ring-green-500'
          ]"
          @click="toggleRealtime"
        >
          <component :is="isRealtime ? Pause : Play" class="w-4 h-4 mr-2" />
          {{ isRealtime ? 'Pause' : 'Live' }}
        </button>
        <button
          class="btn-secondary"
          :disabled="isLoading"
          @click="loadLogs"
        >
          <RefreshCw :class="['w-4 h-4 mr-2', isLoading && 'animate-spin']" />
          Refresh
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div
      v-if="error"
      class="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3"
    >
      <AlertCircle class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p class="text-sm text-red-400">{{ error }}</p>
        <button class="text-xs text-red-400/70 hover:text-red-400 mt-1" @click="error = null">
          Dismiss
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="card p-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <!-- Log File Selector -->
        <div>
          <label class="label text-sm text-dark-400 mb-1">Log File</label>
          <select v-model="selectedFile" class="input w-full">
            <option v-for="file in logFiles" :key="file.name" :value="file.name">
              {{ file.name }} ({{ file.size_human }})
            </option>
          </select>
        </div>

        <!-- Level Filter -->
        <div>
          <label class="label text-sm text-dark-400 mb-1">Minimum Level</label>
          <select v-model="selectedLevel" class="input w-full">
            <option v-for="level in LOG_LEVELS" :key="level.value" :value="level.value">
              {{ level.label }}
            </option>
          </select>
        </div>

        <!-- Module Filter -->
        <div>
          <label class="label text-sm text-dark-400 mb-1">Module</label>
          <input
            v-model="moduleFilter"
            type="text"
            class="input w-full"
            placeholder="e.g., mqtt.handlers"
            @keyup.enter="applyFilters"
          />
        </div>

        <!-- Search -->
        <div>
          <label class="label text-sm text-dark-400 mb-1">Search</label>
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              class="input w-full pr-10"
              placeholder="Search in messages..."
              @keyup.enter="applyFilters"
            />
            <Search class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          </div>
        </div>
      </div>

      <!-- Time Range Filters (Second Row) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <!-- Start Time -->
        <div>
          <label class="label text-sm text-dark-400 mb-1">Start Time</label>
          <input
            v-model="startTime"
            type="datetime-local"
            class="input w-full"
            @change="applyFilters"
          />
        </div>

        <!-- End Time -->
        <div>
          <label class="label text-sm text-dark-400 mb-1">End Time</label>
          <input
            v-model="endTime"
            type="datetime-local"
            class="input w-full"
            @change="applyFilters"
          />
        </div>
      </div>

      <div class="flex items-center justify-between mt-4 pt-4 border-t border-dark-700">
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
            <input type="checkbox" v-model="autoScroll" class="rounded" />
            Auto-scroll
          </label>
          <span class="text-sm text-dark-400">
            {{ totalCount.toLocaleString() }} entries
          </span>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost btn-sm text-red-400" @click="clearFilters">
            <Trash2 class="w-3 h-3 mr-1" />
            Clear
          </button>
          <button class="btn-primary btn-sm" @click="applyFilters">
            <Filter class="w-3 h-3 mr-1" />
            Apply
          </button>
        </div>
      </div>
    </div>

    <!-- Logs Table -->
    <div class="card overflow-hidden">
      <div id="log-container" class="max-h-[600px] overflow-y-auto">
        <table class="w-full">
          <thead class="sticky top-0 bg-dark-800 z-10">
            <tr class="border-b border-dark-700">
              <th class="p-3 text-left text-xs font-medium text-dark-400 uppercase w-44">Time</th>
              <th class="p-3 text-left text-xs font-medium text-dark-400 uppercase w-24">Level</th>
              <th class="p-3 text-left text-xs font-medium text-dark-400 uppercase w-48">Logger</th>
              <th class="p-3 text-left text-xs font-medium text-dark-400 uppercase">Message</th>
            </tr>
          </thead>
          <tbody v-if="!isLoading && logs.length > 0">
            <template v-for="(log, index) in logs" :key="index">
              <tr
                class="border-b border-dark-800 hover:bg-dark-800/50 cursor-pointer"
                @click="toggleLogExpand(index)"
              >
                <td class="p-3 text-sm font-mono text-dark-300">
                  {{ formatTimestamp(log.timestamp) }}
                </td>
                <td class="p-3">
                  <span
                    :class="[
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                      getLevelConfig(log.level).color
                    ]"
                  >
                    <component :is="getLevelConfig(log.level).icon" class="w-3 h-3" />
                    {{ log.level }}
                  </span>
                </td>
                <td class="p-3 text-sm text-dark-400 font-mono truncate max-w-[200px]">
                  {{ log.logger }}
                </td>
                <td class="p-3 text-sm text-dark-200">
                  <div class="flex items-center gap-2">
                    <component
                      :is="expandedLogIds.has(index) ? ChevronUp : ChevronDown"
                      class="w-4 h-4 text-dark-500 flex-shrink-0"
                    />
                    <span class="truncate">{{ log.message }}</span>
                  </div>
                </td>
              </tr>
              <!-- Expanded details -->
              <tr v-if="expandedLogIds.has(index)" class="bg-dark-900">
                <td colspan="4" class="p-4">
                  <div class="space-y-2 text-sm">
                    <div class="flex gap-4">
                      <span class="text-dark-500">Module:</span>
                      <span class="text-dark-300 font-mono">{{ log.module || 'N/A' }}</span>
                      <span class="text-dark-500 ml-4">Function:</span>
                      <span class="text-dark-300 font-mono">{{ log.function || 'N/A' }}</span>
                      <span class="text-dark-500 ml-4">Line:</span>
                      <span class="text-dark-300 font-mono">{{ log.line || 'N/A' }}</span>
                    </div>
                    <div>
                      <span class="text-dark-500">Full Message:</span>
                      <pre class="mt-1 p-2 bg-dark-800 rounded text-dark-200 text-xs overflow-x-auto whitespace-pre-wrap">{{ log.message }}</pre>
                    </div>
                    <div v-if="log.exception">
                      <span class="text-red-400">Exception:</span>
                      <pre class="mt-1 p-2 bg-red-950/30 rounded text-red-300 text-xs overflow-x-auto whitespace-pre-wrap">{{ log.exception }}</pre>
                    </div>
                    <div v-if="log.extra && Object.keys(log.extra).length > 0">
                      <span class="text-dark-500">Extra Data:</span>
                      <pre class="mt-1 p-2 bg-dark-800 rounded text-dark-200 text-xs overflow-x-auto">{{ JSON.stringify(log.extra, null, 2) }}</pre>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
          <tbody v-else-if="isLoading">
            <tr>
              <td colspan="4" class="p-8 text-center text-dark-400">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  Loading logs...
                </div>
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr>
              <td colspan="4" class="p-8 text-center text-dark-400">
                No log entries found
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Load More -->
      <div v-if="hasMore" class="p-4 border-t border-dark-700 text-center">
        <button
          class="btn-secondary btn-sm"
          :disabled="isLoading"
          @click="page++; loadLogs()"
        >
          Load More
        </button>
      </div>
    </div>
  </div>
</template>

