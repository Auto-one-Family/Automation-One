<script setup lang="ts">
/**
 * AuditLogView
 * 
 * Comprehensive audit log management dashboard:
 * - View and filter audit logs
 * - Statistics and error rates
 * - Retention policy management
 * - Manual cleanup with preview
 */

import { ref, computed, onMounted, watch } from 'vue'
import { auditApi } from '@/api/audit'
import type { 
  AuditLog, 
  AuditStatistics, 
  RetentionConfig, 
  CleanupResult,
  EventTypeInfo,
  SeverityInfo,
  AuditLogFilters
} from '@/api/audit'
import {
  FileText, AlertTriangle, Settings, Trash2, RefreshCw, 
  Filter, Clock, Database, ChevronDown, ChevronUp, X,
  AlertCircle, Info, CheckCircle, XCircle
} from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { LoadingState } from '@/components/common'

// State
const isLoading = ref(false)
const error = ref<string | null>(null)

// Data
const logs = ref<AuditLog[]>([])
const statistics = ref<AuditStatistics | null>(null)
const retentionConfig = ref<RetentionConfig | null>(null)
const eventTypes = ref<EventTypeInfo[]>([])
const severities = ref<SeverityInfo[]>([])
const sourceTypes = ref<string[]>([])

// Pagination
const currentPage = ref(1)
const pageSize = ref(50)
const totalLogs = ref(0)
const totalPages = ref(0)

// Filters
const showFilters = ref(false)
const filters = ref<AuditLogFilters>({
  event_type: undefined,
  severity: undefined,
  source_type: undefined,
  source_id: undefined,
  hours: 24,
})

// Modals
const showRetentionModal = ref(false)
const showCleanupModal = ref(false)

// Cleanup
const cleanupResult = ref<CleanupResult | null>(null)
const isRunningCleanup = ref(false)

// Retention form
const retentionForm = ref({
  enabled: true,
  default_days: 30,
  severity_days: {
    info: 14,
    warning: 30,
    error: 90,
    critical: 365,
  },
  max_records: 0,
  batch_size: 1000,
  preserve_emergency_stops: true,
})

// Computed
const activeFiltersCount = computed(() => {
  let count = 0
  if (filters.value.event_type) count++
  if (filters.value.severity) count++
  if (filters.value.source_type) count++
  if (filters.value.source_id) count++
  return count
})

const severityColors: Record<string, string> = {
  info: 'var(--color-info)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  critical: '#dc2626',
}

// Methods
async function fetchData() {
  isLoading.value = true
  error.value = null
  
  try {
    const [logsResponse, statsResponse, configResponse, typesResponse, sevsResponse, srcResponse] = await Promise.all([
      auditApi.list({
        ...filters.value,
        page: currentPage.value,
        page_size: pageSize.value,
      }),
      auditApi.getStatistics(),
      auditApi.getRetentionConfig(),
      auditApi.getEventTypes(),
      auditApi.getSeverities(),
      auditApi.getSourceTypes(),
    ])
    
    logs.value = logsResponse.data
    totalLogs.value = logsResponse.total
    totalPages.value = logsResponse.total_pages
    statistics.value = statsResponse
    retentionConfig.value = configResponse
    eventTypes.value = typesResponse
    severities.value = sevsResponse
    sourceTypes.value = srcResponse
    
    // Initialize retention form with current values
    if (configResponse) {
      retentionForm.value = {
        enabled: configResponse.enabled,
        default_days: configResponse.default_days,
        severity_days: { ...configResponse.severity_days },
        max_records: configResponse.max_records,
        batch_size: configResponse.batch_size,
        preserve_emergency_stops: configResponse.preserve_emergency_stops,
      }
    }
  } catch (err) {
    error.value = 'Fehler beim Laden der Audit-Logs'
    console.error('Failed to fetch audit data:', err)
  } finally {
    isLoading.value = false
  }
}

async function refreshLogs() {
  isLoading.value = true
  try {
    const response = await auditApi.list({
      ...filters.value,
      page: currentPage.value,
      page_size: pageSize.value,
    })
    logs.value = response.data
    totalLogs.value = response.total
    totalPages.value = response.total_pages
  } catch (err) {
    error.value = 'Fehler beim Aktualisieren'
  } finally {
    isLoading.value = false
  }
}

async function applyFilters() {
  currentPage.value = 1
  await refreshLogs()
}

function clearFilters() {
  filters.value = {
    event_type: undefined,
    severity: undefined,
    source_type: undefined,
    source_id: undefined,
    hours: 24,
  }
  applyFilters()
}

async function saveRetentionConfig() {
  try {
    const updated = await auditApi.updateRetentionConfig(retentionForm.value)
    retentionConfig.value = updated
    showRetentionModal.value = false
  } catch (err) {
    error.value = 'Fehler beim Speichern der Konfiguration'
  }
}

async function runCleanup(dryRun: boolean) {
  isRunningCleanup.value = true
  cleanupResult.value = null
  
  try {
    const result = await auditApi.runCleanup(dryRun)
    cleanupResult.value = result
    
    if (!dryRun && result.deleted_count > 0) {
      // Refresh data after real cleanup
      await fetchData()
    }
  } catch (err) {
    error.value = 'Fehler beim Bereinigen'
  } finally {
    isRunningCleanup.value = false
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'info': return Info
    case 'warning': return AlertTriangle
    case 'error': return XCircle
    case 'critical': return AlertCircle
    default: return Info
  }
}

function getSeverityVariant(severity: string): 'info' | 'warning' | 'danger' | 'gray' {
  switch (severity) {
    case 'info': return 'info'
    case 'warning': return 'warning'
    case 'error':
    case 'critical': return 'danger'
    default: return 'gray'
  }
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('de-DE').format(num)
}

// Watch for page changes
watch(currentPage, refreshLogs)

onMounted(fetchData)
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <div class="flex-1">
        <h1 class="text-2xl font-bold" style="color: var(--color-text-primary)">
          <FileText class="w-7 h-7 inline-block mr-2" style="color: var(--color-mock)" />
          Audit-Logs
        </h1>
        <p class="text-sm mt-1" style="color: var(--color-text-muted)">
          System-Ereignisse und Konfigurationshistorie
        </p>
      </div>
      
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary btn-sm" @click="showFilters = !showFilters">
          <Filter class="w-4 h-4" />
          <span class="ml-1">Filter</span>
          <Badge v-if="activeFiltersCount > 0" variant="mock" size="sm" class="ml-1">
            {{ activeFiltersCount }}
          </Badge>
        </button>
        <button class="btn-secondary btn-sm" @click="showRetentionModal = true">
          <Settings class="w-4 h-4" />
          <span class="hidden sm:inline ml-1">Retention</span>
        </button>
        <button class="btn-secondary btn-sm" @click="showCleanupModal = true">
          <Trash2 class="w-4 h-4" />
          <span class="hidden sm:inline ml-1">Bereinigen</span>
        </button>
        <button class="btn-primary btn-sm" @click="refreshLogs" :disabled="isLoading">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
        </button>
      </div>
    </div>
    
    <!-- Statistics Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4" v-if="statistics">
      <div class="card p-4">
        <p class="text-sm" style="color: var(--color-text-muted)">Gesamt</p>
        <p class="text-2xl font-bold" style="color: var(--color-text-primary)">
          {{ formatNumber(statistics.total_count) }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-sm" style="color: var(--color-text-muted)">Fehler (24h)</p>
        <p class="text-2xl font-bold" style="color: var(--color-error)">
          {{ formatNumber(statistics.count_by_severity.error || 0) }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-sm" style="color: var(--color-text-muted)">Speicher</p>
        <p class="text-2xl font-bold" style="color: var(--color-text-primary)">
          {{ statistics.storage_estimate_mb }} MB
        </p>
      </div>
      <div class="card p-4">
        <p class="text-sm" style="color: var(--color-text-muted)">Zu bereinigen</p>
        <p class="text-2xl font-bold" style="color: var(--color-warning)">
          {{ formatNumber(statistics.pending_cleanup_count) }}
        </p>
      </div>
    </div>
    
    <!-- Filters Panel -->
    <div v-if="showFilters" class="card p-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <label class="label">Event-Typ</label>
          <select v-model="filters.event_type" class="input">
            <option :value="undefined">Alle</option>
            <option v-for="et in eventTypes" :key="et.value" :value="et.value">
              {{ et.description }}
            </option>
          </select>
        </div>
        <div>
          <label class="label">Schweregrad</label>
          <select v-model="filters.severity" class="input">
            <option :value="undefined">Alle</option>
            <option v-for="sev in severities" :key="sev.value" :value="sev.value">
              {{ sev.description }}
            </option>
          </select>
        </div>
        <div>
          <label class="label">Quelle</label>
          <select v-model="filters.source_type" class="input">
            <option :value="undefined">Alle</option>
            <option v-for="st in sourceTypes" :key="st" :value="st">
              {{ st.toUpperCase() }}
            </option>
          </select>
        </div>
        <div>
          <label class="label">Zeitraum</label>
          <select v-model="filters.hours" class="input">
            <option :value="1">Letzte Stunde</option>
            <option :value="6">Letzte 6 Stunden</option>
            <option :value="24">Letzte 24 Stunden</option>
            <option :value="48">Letzte 48 Stunden</option>
            <option :value="168">Letzte Woche</option>
          </select>
        </div>
        <div class="flex items-end gap-2">
          <button class="btn-primary flex-1" @click="applyFilters">
            Anwenden
          </button>
          <button class="btn-ghost" @click="clearFilters">
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Loading -->
    <LoadingState v-if="isLoading && logs.length === 0" text="Lade Audit-Logs..." />
    
    <!-- Logs Table -->
    <div v-else-if="logs.length > 0" class="card">
      <div class="overflow-x-auto">
        <table class="audit-table">
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Schweregrad</th>
              <th>Event</th>
              <th>Quelle</th>
              <th>Status</th>
              <th>Nachricht</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td class="font-mono text-xs whitespace-nowrap">
                {{ formatTimestamp(log.created_at) }}
              </td>
              <td>
                <Badge :variant="getSeverityVariant(log.severity)" size="sm">
                  <component :is="getSeverityIcon(log.severity)" class="w-3 h-3 mr-1" />
                  {{ log.severity }}
                </Badge>
              </td>
              <td class="text-sm">{{ log.event_type }}</td>
              <td class="text-sm">
                <span style="color: var(--color-text-muted)">{{ log.source_type }}:</span>
                <span class="font-mono">{{ log.source_id || '-' }}</span>
              </td>
              <td>
                <Badge 
                  :variant="log.status === 'success' ? 'success' : log.status === 'failed' ? 'danger' : 'warning'"
                  size="sm"
                >
                  {{ log.status }}
                </Badge>
              </td>
              <td class="max-w-md truncate text-sm" :title="log.message || ''">
                {{ log.message || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- Pagination -->
      <div class="card-footer flex items-center justify-between">
        <p class="text-sm" style="color: var(--color-text-muted)">
          {{ formatNumber(totalLogs) }} Einträge
        </p>
        <div class="flex items-center gap-2">
          <button 
            class="btn-ghost btn-sm"
            :disabled="currentPage <= 1"
            @click="currentPage--"
          >
            <ChevronUp class="w-4 h-4 rotate-90" />
          </button>
          <span class="text-sm" style="color: var(--color-text-secondary)">
            Seite {{ currentPage }} / {{ totalPages }}
          </span>
          <button 
            class="btn-ghost btn-sm"
            :disabled="currentPage >= totalPages"
            @click="currentPage++"
          >
            <ChevronDown class="w-4 h-4 rotate-90" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Empty State -->
    <div v-else class="card p-8 text-center">
      <FileText class="w-12 h-12 mx-auto mb-4" style="color: var(--color-text-muted)" />
      <p style="color: var(--color-text-muted)">Keine Audit-Logs gefunden</p>
    </div>
    
    <!-- Retention Config Modal -->
    <Teleport to="body">
      <div v-if="showRetentionModal" class="modal-overlay" @click.self="showRetentionModal = false">
        <div class="modal-content modal-content--wide">
          <div class="modal-header">
            <h3 class="modal-title">
              <Settings class="w-5 h-5 inline-block mr-2" />
              Retention-Konfiguration
            </h3>
            <button class="modal-close" @click="showRetentionModal = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div class="flex items-center gap-3">
              <input 
                type="checkbox" 
                id="retention-enabled" 
                v-model="retentionForm.enabled"
              />
              <label for="retention-enabled" style="color: var(--color-text-primary)">
                Automatische Bereinigung aktivieren
              </label>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Standard-Aufbewahrung (Tage)</label>
                <input 
                  type="number" 
                  v-model.number="retentionForm.default_days" 
                  min="1" 
                  max="3650"
                  class="input"
                />
              </div>
              <div>
                <label class="label">Max. Einträge (0 = unbegrenzt)</label>
                <input 
                  type="number" 
                  v-model.number="retentionForm.max_records" 
                  min="0"
                  class="input"
                />
              </div>
            </div>
            
            <div>
              <label class="label mb-2">Aufbewahrung nach Schweregrad (Tage)</label>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div v-for="sev in ['info', 'warning', 'error', 'critical']" :key="sev">
                  <label class="text-sm" style="color: var(--color-text-secondary)">
                    {{ sev.charAt(0).toUpperCase() + sev.slice(1) }}
                  </label>
                  <input 
                    type="number" 
                    v-model.number="retentionForm.severity_days[sev]" 
                    min="1" 
                    max="3650"
                    class="input"
                  />
                </div>
              </div>
            </div>
            
            <div class="flex items-center gap-3">
              <input 
                type="checkbox" 
                id="preserve-emergency" 
                v-model="retentionForm.preserve_emergency_stops"
              />
              <label for="preserve-emergency" style="color: var(--color-text-primary)">
                Notfall-Stopp-Events niemals löschen
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary flex-1" @click="showRetentionModal = false">
              Abbrechen
            </button>
            <button class="btn-primary flex-1" @click="saveRetentionConfig">
              Speichern
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- Cleanup Modal -->
    <Teleport to="body">
      <div v-if="showCleanupModal" class="modal-overlay" @click.self="showCleanupModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">
              <Trash2 class="w-5 h-5 inline-block mr-2" />
              Audit-Logs bereinigen
            </h3>
            <button class="modal-close" @click="showCleanupModal = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body space-y-4">
            <p style="color: var(--color-text-secondary)">
              Bereinigt alte Audit-Logs basierend auf der Retention-Konfiguration.
            </p>
            
            <!-- Cleanup Result -->
            <div v-if="cleanupResult" class="p-4 rounded-lg" style="background: var(--color-bg-tertiary)">
              <p class="font-medium mb-2" style="color: var(--color-text-primary)">
                {{ cleanupResult.dry_run ? 'Vorschau:' : 'Ergebnis:' }}
              </p>
              <ul class="space-y-1 text-sm" style="color: var(--color-text-secondary)">
                <li>
                  <span class="font-mono">{{ formatNumber(cleanupResult.deleted_count) }}</span>
                  Einträge {{ cleanupResult.dry_run ? 'würden gelöscht' : 'gelöscht' }}
                </li>
                <li v-for="(count, severity) in cleanupResult.deleted_by_severity" :key="severity">
                  {{ severity }}: {{ formatNumber(count) }}
                </li>
                <li v-if="!cleanupResult.dry_run">
                  Dauer: {{ cleanupResult.duration_ms }}ms
                </li>
              </ul>
              <div v-if="cleanupResult.errors.length > 0" class="mt-2 text-sm" style="color: var(--color-error)">
                <p class="font-medium">Fehler:</p>
                <ul>
                  <li v-for="err in cleanupResult.errors" :key="err">{{ err }}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary flex-1" @click="showCleanupModal = false">
              Schließen
            </button>
            <button 
              class="btn-secondary flex-1" 
              @click="runCleanup(true)"
              :disabled="isRunningCleanup"
            >
              <RefreshCw v-if="isRunningCleanup" class="w-4 h-4 animate-spin mr-1" />
              Vorschau
            </button>
            <button 
              class="btn-danger flex-1" 
              @click="runCleanup(false)"
              :disabled="isRunningCleanup"
            >
              <Trash2 v-if="!isRunningCleanup" class="w-4 h-4 mr-1" />
              <RefreshCw v-else class="w-4 h-4 animate-spin mr-1" />
              Bereinigen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.audit-table {
  width: 100%;
  border-collapse: collapse;
}

.audit-table th,
.audit-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--glass-border);
}

.audit-table th {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
}

.audit-table td {
  color: var(--color-text-secondary);
}

.audit-table tbody tr:hover {
  background: var(--color-bg-tertiary);
}

.card-footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--glass-border);
}

/* Modal Styles */
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

.modal-content--wide {
  max-width: 42rem;
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


