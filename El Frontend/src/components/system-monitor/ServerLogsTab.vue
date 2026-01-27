<script setup lang="ts">
/**
 * ServerLogsTab - Server Logs Tab for System Monitor
 *
 * Features:
 * - Compact horizontal filter bar
 * - Polling with Play/Pause button (3s interval)
 * - CSV export functionality
 * - Expandable log entries with full details
 * - Mobile-responsive design
 *
 * @see El Servador/god_kaiser_server/src/core/logging_config.py - Logging Configuration
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { logsApi, type LogEntry, type LogLevel, type LogFile, type LogQueryParams } from '@/api/logs'
import {
  Play,
  Pause,
  RefreshCw,
  Download,
  Trash2,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  XCircle,
  FileText,
  Copy,
  Check,
} from 'lucide-vue-next'

// ============================================================================
// Constants
// ============================================================================

const POLL_INTERVAL = 3000 // 3 seconds
const PAGE_SIZE = 100

// Log level configuration
const LOG_LEVELS: { value: LogLevel | ''; label: string; icon: typeof Info; color: string }[] = [
  { value: '', label: 'Alle', icon: FileText, color: 'text-gray-400' },
  { value: 'DEBUG', label: 'Debug', icon: Bug, color: 'text-gray-400' },
  { value: 'INFO', label: 'Info', icon: Info, color: 'text-blue-400' },
  { value: 'WARNING', label: 'Warnung', icon: AlertTriangle, color: 'text-yellow-400' },
  { value: 'ERROR', label: 'Fehler', icon: XCircle, color: 'text-red-400' },
  { value: 'CRITICAL', label: 'Kritisch', icon: AlertCircle, color: 'text-red-600' },
]

// ============================================================================
// State
// ============================================================================

const logs = ref<LogEntry[]>([])
const logFiles = ref<LogFile[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const totalCount = ref(0)
const hasMore = ref(false)

// Polling state
const isPolling = ref(false)
const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)

// Filter state
const selectedFile = ref('')
const selectedLevel = ref<LogLevel | ''>('')
const moduleFilter = ref('')
const searchQuery = ref('')
const page = ref(1)

// Expanded state
const expandedIds = ref<Set<number>>(new Set())
const copiedId = ref<number | null>(null)

// ============================================================================
// Computed
// ============================================================================

const currentQueryParams = computed<LogQueryParams>(() => ({
  level: selectedLevel.value || undefined,
  module: moduleFilter.value || undefined,
  search: searchQuery.value || undefined,
  file: selectedFile.value || undefined,
  page: page.value,
  page_size: PAGE_SIZE,
}))

// ============================================================================
// Methods - Data Loading
// ============================================================================

async function loadLogFiles(): Promise<void> {
  try {
    const response = await logsApi.listFiles()
    logFiles.value = response.files

    // Select current file by default
    const currentFile = response.files.find(f => f.is_current)
    if (currentFile && !selectedFile.value) {
      selectedFile.value = currentFile.name
    }
  } catch (err) {
    console.error('[ServerLogsTab] Failed to load log files:', err)
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
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Logs konnten nicht geladen werden'
  } finally {
    isLoading.value = false
  }
}

async function loadMore(): Promise<void> {
  page.value++
  isLoading.value = true

  try {
    const response = await logsApi.queryLogs(currentQueryParams.value)
    logs.value = [...logs.value, ...response.logs]
    totalCount.value = response.total_count
    hasMore.value = response.has_more
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Weitere Logs konnten nicht geladen werden'
    page.value--
  } finally {
    isLoading.value = false
  }
}

// ============================================================================
// Methods - Polling
// ============================================================================

function togglePolling() {
  isPolling.value = !isPolling.value

  if (isPolling.value) {
    // Start polling
    pollInterval.value = setInterval(() => {
      loadLogs()
    }, POLL_INTERVAL)
  } else {
    // Stop polling
    if (pollInterval.value) {
      clearInterval(pollInterval.value)
      pollInterval.value = null
    }
  }
}

function stopPolling() {
  if (pollInterval.value) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
  isPolling.value = false
}

// ============================================================================
// Methods - UI Actions
// ============================================================================

function applyFilters() {
  page.value = 1
  loadLogs()
}

function clearLogs() {
  logs.value = []
  expandedIds.value.clear()
}

function toggleExpand(index: number) {
  if (expandedIds.value.has(index)) {
    expandedIds.value.delete(index)
  } else {
    expandedIds.value.add(index)
  }
}

async function copyLogEntry(log: LogEntry, index: number) {
  try {
    const text = JSON.stringify(log, null, 2)
    await navigator.clipboard.writeText(text)
    copiedId.value = index
    setTimeout(() => {
      copiedId.value = null
    }, 2000)
  } catch (e) {
    console.error('[ServerLogsTab] Failed to copy:', e)
  }
}

// ============================================================================
// Methods - Export
// ============================================================================

function exportToCsv() {
  // CSV Header
  const headers = ['Zeitstempel', 'Level', 'Logger', 'Modul', 'Funktion', 'Zeile', 'Nachricht']
  const rows = [headers.join(';')]

  // CSV Rows
  logs.value.forEach(log => {
    const row = [
      formatTimestamp(log.timestamp),
      log.level,
      log.logger || '',
      log.module || '',
      log.function || '',
      log.line?.toString() || '',
      // Escape double quotes and wrap in quotes
      `"${(log.message || '').replace(/"/g, '""')}"`,
    ]
    rows.push(row.join(';'))
  })

  const csvContent = rows.join('\n')
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `server-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================================
// Methods - Formatting
// ============================================================================

function formatTimestamp(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return timestamp
  }
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return timestamp
  }
}

function getLevelConfig(level: string) {
  return LOG_LEVELS.find(l => l.value === level) || LOG_LEVELS[0]
}

function getLevelClass(level: string): string {
  switch (level) {
    case 'DEBUG':
      return 'log-level--debug'
    case 'INFO':
      return 'log-level--info'
    case 'WARNING':
      return 'log-level--warning'
    case 'ERROR':
      return 'log-level--error'
    case 'CRITICAL':
      return 'log-level--critical'
    default:
      return 'log-level--debug'
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  await loadLogFiles()
  await loadLogs()
})

onUnmounted(() => {
  stopPolling()
})

// Watch for file changes
watch(selectedFile, () => {
  page.value = 1
  loadLogs()
})
</script>

<template>
  <div class="logs-tab">
    <!-- Toolbar / Filter Bar -->
    <div class="logs-toolbar">
      <div class="logs-toolbar__filters">
        <!-- File Selector -->
        <select v-model="selectedFile" class="logs-select logs-select--file">
          <option v-for="file in logFiles" :key="file.name" :value="file.name">
            {{ file.name }}
          </option>
        </select>

        <!-- Level Selector -->
        <select v-model="selectedLevel" class="logs-select" @change="applyFilters">
          <option v-for="level in LOG_LEVELS" :key="level.value" :value="level.value">
            {{ level.label }}
          </option>
        </select>

        <!-- Module Filter -->
        <input
          v-model="moduleFilter"
          type="text"
          class="logs-input logs-input--module"
          placeholder="Modul..."
          @keyup.enter="applyFilters"
        />

        <!-- Search -->
        <div class="logs-search">
          <Search class="logs-search__icon" />
          <input
            v-model="searchQuery"
            type="text"
            class="logs-search__input"
            placeholder="Suchen..."
            @keyup.enter="applyFilters"
          />
        </div>
      </div>

      <div class="logs-toolbar__actions">
        <!-- Polling Toggle -->
        <button
          class="btn-ghost btn-sm"
          :class="{ 'btn-ghost--active': isPolling }"
          @click="togglePolling"
        >
          <component :is="isPolling ? Pause : Play" class="w-4 h-4" />
          <span class="btn-label">{{ isPolling ? 'Stoppen' : 'Live' }}</span>
        </button>

        <!-- Refresh -->
        <button
          class="btn-ghost btn-sm"
          :disabled="isLoading"
          @click="loadLogs"
        >
          <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']" />
          <span class="btn-label">Aktualisieren</span>
        </button>

        <!-- Export CSV -->
        <button
          class="btn-ghost btn-sm"
          :disabled="logs.length === 0"
          @click="exportToCsv"
        >
          <Download class="w-4 h-4" />
          <span class="btn-label">CSV</span>
        </button>

        <!-- Clear -->
        <button
          class="btn-ghost btn-sm btn-ghost--danger"
          :disabled="logs.length === 0"
          @click="clearLogs"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Info Bar -->
    <div class="logs-info">
      <span class="logs-info__count">
        {{ logs.length }} von {{ totalCount.toLocaleString() }} Einträgen
      </span>
      <span v-if="isPolling" class="logs-info__polling">
        <span class="logs-info__dot"></span>
        Live-Aktualisierung
      </span>
    </div>

    <!-- Error Alert -->
    <div v-if="error" class="logs-error">
      <AlertCircle class="logs-error__icon" />
      <span class="logs-error__text">{{ error }}</span>
      <button class="logs-error__close" @click="error = null">&times;</button>
    </div>

    <!-- Log List -->
    <div class="logs-list">
      <!-- Loading State -->
      <div v-if="isLoading && logs.length === 0" class="logs-loading">
        <div class="logs-loading__spinner"></div>
        <span>Logs werden geladen...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="logs.length === 0" class="logs-empty">
        <FileText class="logs-empty__icon" />
        <p class="logs-empty__text">Keine Log-Einträge gefunden</p>
      </div>

      <!-- Log Entries -->
      <template v-else>
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="log-entry"
        >
          <!-- Entry Header -->
          <div class="log-entry__header" @click="toggleExpand(index)">
            <button class="log-entry__expand">
              <component :is="expandedIds.has(index) ? ChevronDown : ChevronRight" class="w-4 h-4" />
            </button>

            <span class="log-entry__time">{{ formatTime(log.timestamp) }}</span>

            <span :class="['log-level', getLevelClass(log.level)]">
              <component :is="getLevelConfig(log.level).icon" class="w-3 h-3" />
              {{ log.level }}
            </span>

            <span class="log-entry__logger">{{ log.logger }}</span>

            <span class="log-entry__message">{{ log.message }}</span>
          </div>

          <!-- Expanded Details -->
          <Transition name="expand">
            <div v-if="expandedIds.has(index)" class="log-entry__details">
              <div class="log-details__grid">
                <div class="log-details__item">
                  <span class="log-details__label">Zeitstempel</span>
                  <span class="log-details__value">{{ formatTimestamp(log.timestamp) }}</span>
                </div>
                <div class="log-details__item">
                  <span class="log-details__label">Modul</span>
                  <span class="log-details__value">{{ log.module || 'N/A' }}</span>
                </div>
                <div class="log-details__item">
                  <span class="log-details__label">Funktion</span>
                  <span class="log-details__value">{{ log.function || 'N/A' }}</span>
                </div>
                <div class="log-details__item">
                  <span class="log-details__label">Zeile</span>
                  <span class="log-details__value">{{ log.line || 'N/A' }}</span>
                </div>
              </div>

              <!-- Full Message -->
              <div class="log-details__section">
                <div class="log-details__section-header">
                  <span class="log-details__section-title">Vollständige Nachricht</span>
                  <button
                    class="log-details__copy"
                    @click.stop="copyLogEntry(log, index)"
                  >
                    <component :is="copiedId === index ? Check : Copy" class="w-3.5 h-3.5" />
                    {{ copiedId === index ? 'Kopiert!' : 'JSON kopieren' }}
                  </button>
                </div>
                <pre class="log-details__code">{{ log.message }}</pre>
              </div>

              <!-- Exception (if present) -->
              <div v-if="log.exception" class="log-details__section log-details__section--error">
                <span class="log-details__section-title">Exception</span>
                <pre class="log-details__code log-details__code--error">{{ log.exception }}</pre>
              </div>

              <!-- Extra Data (if present) -->
              <div v-if="log.extra && Object.keys(log.extra).length > 0" class="log-details__section">
                <span class="log-details__section-title">Extra-Daten</span>
                <pre class="log-details__code">{{ JSON.stringify(log.extra, null, 2) }}</pre>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Load More -->
        <div v-if="hasMore" class="logs-load-more">
          <button
            class="btn-secondary btn-sm"
            :disabled="isLoading"
            @click="loadMore"
          >
            <RefreshCw v-if="isLoading" class="w-4 h-4 mr-2 animate-spin" />
            Mehr laden
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.logs-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* =============================================================================
   Toolbar
   ============================================================================= */
.logs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  flex-wrap: wrap;
}

.logs-toolbar__filters {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.logs-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.logs-select,
.logs-input {
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  color: var(--color-text-primary);
}

.logs-select {
  min-width: 5rem;
}

.logs-select--file {
  max-width: 10rem;
}

.logs-input--module {
  width: 8rem;
}

.logs-search {
  position: relative;
  flex: 1;
  min-width: 8rem;
  max-width: 16rem;
}

.logs-search__icon {
  position: absolute;
  left: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.875rem;
  height: 0.875rem;
  color: var(--color-text-muted);
  pointer-events: none;
}

.logs-search__input {
  width: 100%;
  padding: 0.375rem 0.625rem 0.375rem 2rem;
  font-size: 0.8125rem;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  color: var(--color-text-primary);
}

.logs-search__input::placeholder {
  color: var(--color-text-muted);
}

.btn-ghost--active {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn-ghost--danger:hover {
  color: var(--color-danger);
}

.btn-label {
  display: none;
}

@media (min-width: 768px) {
  .btn-label {
    display: inline;
    margin-left: 0.375rem;
  }
}

/* =============================================================================
   Info Bar
   ============================================================================= */
.logs-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  background-color: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--glass-border);
}

.logs-info__polling {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--color-success);
}

.logs-info__dot {
  width: 0.5rem;
  height: 0.5rem;
  background-color: var(--color-success);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* =============================================================================
   Error
   ============================================================================= */
.logs-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background-color: rgba(239, 68, 68, 0.1);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
}

.logs-error__icon {
  width: 1rem;
  height: 1rem;
  color: var(--color-danger);
  flex-shrink: 0;
}

.logs-error__text {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--color-danger);
}

.logs-error__close {
  padding: 0.25rem;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--color-danger);
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.7;
}

.logs-error__close:hover {
  opacity: 1;
}

/* =============================================================================
   Log List
   ============================================================================= */
.logs-list {
  flex: 1;
  overflow-y: auto;
}

.logs-loading,
.logs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
  gap: 0.75rem;
}

.logs-loading__spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--glass-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.logs-empty__icon {
  width: 3rem;
  height: 3rem;
  color: var(--color-text-muted);
  opacity: 0.3;
}

.logs-empty__text {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin: 0;
}

/* =============================================================================
   Log Entry
   ============================================================================= */
.log-entry {
  border-bottom: 1px solid var(--glass-border);
}

.log-entry:hover {
  background-color: var(--color-bg-secondary);
}

.log-entry__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  cursor: pointer;
}

.log-entry__expand {
  padding: 0;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
}

.log-entry__time {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  flex-shrink: 0;
  width: 4.5rem;
}

.log-level {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

.log-level--debug {
  background-color: rgba(156, 163, 175, 0.15);
  color: rgb(156, 163, 175);
}

.log-level--info {
  background-color: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.log-level--warning {
  background-color: rgba(251, 191, 36, 0.15);
  color: rgb(251, 191, 36);
}

.log-level--error {
  background-color: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.log-level--critical {
  background-color: rgba(220, 38, 38, 0.2);
  color: rgb(252, 165, 165);
}

.log-entry__logger {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
  flex-shrink: 0;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-entry__message {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* =============================================================================
   Log Details
   ============================================================================= */
.log-entry__details {
  padding: 0.75rem 1rem 1rem 2.5rem;
  background-color: var(--color-bg-tertiary);
  border-top: 1px solid var(--glass-border);
}

.log-details__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.log-details__item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.log-details__label {
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.log-details__value {
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
}

.log-details__section {
  margin-bottom: 0.75rem;
}

.log-details__section:last-child {
  margin-bottom: 0;
}

.log-details__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}

.log-details__section-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.log-details__section--error .log-details__section-title {
  color: var(--color-danger);
}

.log-details__copy {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  background: none;
  border: 1px solid var(--glass-border);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.log-details__copy:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

.log-details__code {
  padding: 0.75rem;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  line-height: 1.5;
  color: var(--color-text-secondary);
  background-color: var(--color-bg-primary);
  border-radius: 0.375rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.log-details__code--error {
  background-color: rgba(220, 38, 38, 0.1);
  color: rgb(248, 113, 113);
}

/* =============================================================================
   Load More
   ============================================================================= */
.logs-load-more {
  display: flex;
  justify-content: center;
  padding: 1rem;
  border-top: 1px solid var(--glass-border);
}

/* =============================================================================
   Transitions
   ============================================================================= */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.15s ease-out;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}

/* =============================================================================
   Mobile Responsive
   ============================================================================= */
@media (max-width: 768px) {
  .logs-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .logs-toolbar__filters {
    order: 2;
  }

  .logs-toolbar__actions {
    order: 1;
    justify-content: flex-end;
  }

  .logs-select--file {
    max-width: none;
    flex: 1;
  }

  .logs-input--module {
    display: none;
  }

  .logs-search {
    max-width: none;
    flex: 1;
  }

  .log-entry__header {
    flex-wrap: wrap;
    padding: 0.5rem;
  }

  .log-entry__logger {
    display: none;
  }

  .log-entry__message {
    width: 100%;
    margin-top: 0.25rem;
    padding-left: 1.5rem;
  }

  .log-entry__details {
    padding-left: 1rem;
    padding-right: 0.5rem;
  }

  .log-details__grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
