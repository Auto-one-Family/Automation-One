<script setup lang="ts">
/**
 * CleanupPanel - Consolidated Cleanup & Backup Management
 *
 * Konsolidiertes Panel für Bereinigung und Aufbewahrung:
 * - Statistik-Übersicht mit Schnellaktion
 * - Aufbewahrungsregeln (immer sichtbar)
 * - Backup-Verwaltung
 *
 * UX: 2 Klicks bis zur Löschung (Bereinigen → Endgültig löschen)
 *
 * Design: Industrial-Grade, Iridescent, Mobile-Responsive
 * Backend: God-Kaiser Server ist Single Source of Truth
 *
 * @see El Servador/god_kaiser_server/src/services/audit_backup_service.py
 * @see El Servador/god_kaiser_server/src/services/audit_retention_service.py
 */

import { ref, computed, watch, onMounted } from 'vue'
import {
  X,
  Trash2,
  RefreshCw,
  Archive,
  Clock,
  Settings,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Database,
  HardDrive,
  Info,
  AlertCircle,
  Shield,
} from 'lucide-vue-next'

import {
  auditApi,
  type AuditStatistics,
  type CleanupResult,
  type BackupInfo,
  type BackupRestoreResult,
  type RetentionConfig,
  type RetentionConfigUpdate,
  type AutoCleanupStatus,
  type BackupRetentionConfig,
} from '@/api/audit'
import { useAuthStore } from '@/stores/auth'

import CleanupPreview from './CleanupPreview.vue'
import AutoCleanupStatusBanner from './AutoCleanupStatusBanner.vue'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  show: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  'cleanup-success': [result: CleanupResult]
  'restore-success': [result: BackupRestoreResult]
}>()

// ============================================================================
// State
// ============================================================================

const authStore = useAuthStore()

// Loading states
const isLoadingStats = ref(false)
const isLoadingBackups = ref(false)
const isLoadingRetention = ref(false)
const isLoadingAutoCleanupStatus = ref(false)
const isLoadingBackupRetention = ref(false)
const isRunningCleanup = ref(false)
const isRestoringBackup = ref<string | null>(null)
const isDeletingBackup = ref<string | null>(null)
const isSavingRetention = ref(false)
const isSavingBackupRetention = ref(false)

// Data
const statistics = ref<AuditStatistics | null>(null)
const backups = ref<BackupInfo[]>([])
const retentionConfig = ref<RetentionConfig | null>(null)
const autoCleanupStatus = ref<AutoCleanupStatus | null>(null)
const cleanupResult = ref<CleanupResult | null>(null)
const backupRetentionConfig = ref<BackupRetentionConfig | null>(null)

// Cleanup dialog state
const showCleanupDialog = ref(false)
const cleanupPreview = ref<CleanupResult | null>(null)
const createBackupBeforeCleanup = ref(true)
const isDeleting = ref(false)

// UI state - cleanup completion result (shown after dialog closes)
const completedCleanupResult = ref<CleanupResult | null>(null)

// Retention form
const retentionForm = ref<RetentionConfigUpdate>({
  enabled: false,
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

// ============================================================================
// Computed
// ============================================================================

const hasActiveBackups = computed(() => backups.value.filter(b => !b.expired).length > 0)

const isAdmin = computed(() => authStore.isAdmin)
const isOperatorOrAdmin = computed(() => authStore.isOperator)
const canPreview = computed(() => isOperatorOrAdmin.value)
const canCleanup = computed(() => isAdmin.value)

// Retention dropdown options
const retentionOptions = [
  { value: 7, label: '7 Tage' },
  { value: 14, label: '14 Tage' },
  { value: 30, label: '30 Tage' },
  { value: 60, label: '60 Tage' },
  { value: 90, label: '90 Tage' },
  { value: 180, label: '6 Monate' },
  { value: 365, label: '1 Jahr' },
  { value: 730, label: '2 Jahre' },
  { value: 1825, label: '5 Jahre' },
  { value: 0, label: 'Niemals löschen' },
]

const backupRetentionOptions = [
  { value: 1, label: '1 Tag' },
  { value: 7, label: '7 Tage (Standard)' },
  { value: 30, label: '30 Tage' },
  { value: 90, label: '90 Tage' },
  { value: 365, label: '1 Jahr' },
  { value: 0, label: 'Niemals löschen' },
]

const selectedBackupRetention = ref(7)

const formatBytes = (mb: number) => {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`
  return `${mb.toFixed(1)} MB`
}

const formatNumber = (num: number) => new Intl.NumberFormat('de-DE').format(num)

const formatTimeAgo = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`
}

const formatExpiresIn = (expiresAt: string | null) => {
  if (expiresAt === null) return 'Nie'

  const expires = new Date(expiresAt)
  const now = new Date()
  const diffMs = expires.getTime() - now.getTime()

  if (diffMs <= 0) return 'Abgelaufen'

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const remainingHours = diffHours % 24
  const remainingMins = diffMins % 60

  if (diffDays > 0) return `${diffDays}d ${remainingHours}h`
  if (diffHours < 1) return `${diffMins} Min.`
  return `${diffHours}h ${remainingMins}m`
}

// ============================================================================
// Methods - Data Loading
// ============================================================================

async function loadAll() {
  await Promise.all([
    loadAutoCleanupStatus(),
    loadStatistics(),
    loadBackups(),
    loadRetentionConfig(),
    loadBackupRetentionConfig(),
  ])
}

async function loadAutoCleanupStatus() {
  isLoadingAutoCleanupStatus.value = true
  try {
    autoCleanupStatus.value = await auditApi.getRetentionStatus()
  } catch (err) {
    console.error('[CleanupPanel] Failed to load auto-cleanup status:', err)
  } finally {
    isLoadingAutoCleanupStatus.value = false
  }
}

function scrollToRetentionSettings() {
  // Retention is now always visible, just scroll to it
  const el = document.querySelector('.retention-section')
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function loadStatistics() {
  isLoadingStats.value = true
  try {
    statistics.value = await auditApi.getStatistics()
  } catch (err) {
    console.error('[CleanupPanel] Failed to load statistics:', err)
  } finally {
    isLoadingStats.value = false
  }
}

async function loadBackups() {
  isLoadingBackups.value = true
  try {
    const response = await auditApi.listBackups(true)
    backups.value = response.backups
  } catch (err) {
    console.error('[CleanupPanel] Failed to load backups:', err)
  } finally {
    isLoadingBackups.value = false
  }
}

async function loadRetentionConfig() {
  isLoadingRetention.value = true
  try {
    retentionConfig.value = await auditApi.getRetentionConfig()
    retentionForm.value = {
      enabled: retentionConfig.value.enabled,
      default_days: retentionConfig.value.default_days,
      severity_days: { ...retentionConfig.value.severity_days },
      max_records: retentionConfig.value.max_records,
      batch_size: retentionConfig.value.batch_size,
      preserve_emergency_stops: retentionConfig.value.preserve_emergency_stops,
    }
  } catch (err) {
    console.error('[CleanupPanel] Failed to load retention config:', err)
  } finally {
    isLoadingRetention.value = false
  }
}

async function loadBackupRetentionConfig() {
  if (!isAdmin.value) return

  isLoadingBackupRetention.value = true
  try {
    backupRetentionConfig.value = await auditApi.getBackupRetentionConfig()
    selectedBackupRetention.value = backupRetentionConfig.value.retention_days
  } catch (err) {
    console.error('[CleanupPanel] Failed to load backup retention config:', err)
  } finally {
    isLoadingBackupRetention.value = false
  }
}

async function saveBackupRetentionConfig() {
  if (!isAdmin.value) return

  isSavingBackupRetention.value = true
  try {
    await auditApi.updateBackupRetentionConfig({
      retention_days: selectedBackupRetention.value
    })
    await loadBackupRetentionConfig()
  } catch (err) {
    console.error('[CleanupPanel] Failed to save backup retention config:', err)
  } finally {
    isSavingBackupRetention.value = false
  }
}

// ============================================================================
// Methods - Cleanup (2-click flow)
// ============================================================================

async function handleCleanupClick() {
  // Step 1: Run dry-run to get preview
  isRunningCleanup.value = true
  cleanupPreview.value = null

  try {
    const result = await auditApi.runCleanup({
      dryRun: true,
      includePreviewEvents: true,
      previewLimit: 20,
    })
    cleanupPreview.value = result

    if (result.deleted_count === 0) {
      // Nothing to delete - show inline message
      cleanupResult.value = result
    } else {
      // Open dialog with preview + confirm button
      showCleanupDialog.value = true
    }
  } catch (err) {
    console.error('[CleanupPanel] Cleanup preview failed:', err)
  } finally {
    isRunningCleanup.value = false
  }
}

async function confirmAndRunCleanup() {
  // Step 2: Execute real cleanup
  isDeleting.value = true

  try {
    const result = await auditApi.runCleanup({
      dryRun: false,
    })
    cleanupResult.value = result
    completedCleanupResult.value = result
    showCleanupDialog.value = false

    if (result.deleted_count > 0) {
      await Promise.all([loadStatistics(), loadBackups()])
      emit('cleanup-success', result)
    }
  } catch (err) {
    console.error('[CleanupPanel] Cleanup failed:', err)
  } finally {
    isDeleting.value = false
  }
}

function closeCleanupDialog() {
  showCleanupDialog.value = false
  cleanupPreview.value = null
}

async function loadAllPreviewEvents() {
  isRunningCleanup.value = true
  try {
    const result = await auditApi.runCleanup({
      dryRun: true,
      includePreviewEvents: true,
      previewLimit: 100,
    })
    cleanupPreview.value = result
  } catch (err) {
    console.error('[CleanupPanel] Failed to load all preview events:', err)
  } finally {
    isRunningCleanup.value = false
  }
}

// ============================================================================
// Methods - Backup Management
// ============================================================================

async function restoreBackup(backupId: string) {
  isRestoringBackup.value = backupId
  try {
    const result = await auditApi.restoreBackup(backupId)
    await loadBackups()
    emit('restore-success', result)
  } catch (err) {
    console.error('[CleanupPanel] Restore failed:', err)
  } finally {
    isRestoringBackup.value = null
  }
}

async function deleteBackup(backupId: string) {
  isDeletingBackup.value = backupId
  try {
    await auditApi.deleteBackup(backupId)
    await loadBackups()
  } catch (err) {
    console.error('[CleanupPanel] Delete backup failed:', err)
  } finally {
    isDeletingBackup.value = null
  }
}

// ============================================================================
// Methods - Retention Settings
// ============================================================================

async function saveRetentionConfig() {
  isSavingRetention.value = true
  try {
    await auditApi.updateRetentionConfig(retentionForm.value)
    await Promise.all([
      loadRetentionConfig(),
      loadAutoCleanupStatus(),
      loadStatistics(),
    ])
  } catch (err) {
    console.error('[CleanupPanel] Failed to save retention config:', err)
  } finally {
    isSavingRetention.value = false
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

watch(() => props.show, (show) => {
  if (show) {
    loadAll()
    cleanupResult.value = null
    completedCleanupResult.value = null
    showCleanupDialog.value = false
  }
})

onMounted(() => {
  if (props.show) {
    loadAll()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="cleanup-overlay" @click.self="emit('close')">
        <Transition name="slide-up">
          <div v-if="show" class="cleanup-panel">
            <!-- Header -->
            <header class="cleanup-header">
              <div class="cleanup-header__title">
                <div class="title-icon">
                  <Database class="w-5 h-5" />
                </div>
                <div>
                  <h2>Bereinigung & Aufbewahrung</h2>
                  <p class="subtitle">Ereignis-Datenbank verwalten</p>
                </div>
              </div>
              <button class="close-btn" @click="emit('close')">
                <X class="w-5 h-5" />
              </button>
            </header>

            <!-- Content -->
            <div class="cleanup-content">
              <!-- 1. STATUS BANNER -->
              <AutoCleanupStatusBanner
                :status="autoCleanupStatus"
                :loading="isLoadingAutoCleanupStatus"
                @enable-auto-cleanup="scrollToRetentionSettings"
                @refresh="loadAutoCleanupStatus"
              />

              <!-- 2. ÜBERSICHT & AKTION -->
              <section class="panel-section">
                <div class="section-header">
                  <HardDrive class="w-4 h-4" />
                  <span>Übersicht & Aktion</span>
                  <button
                    class="refresh-btn"
                    @click="loadStatistics"
                    :disabled="isLoadingStats"
                  >
                    <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoadingStats }" />
                  </button>
                </div>

                <div v-if="statistics" class="stats-grid">
                  <div class="stat-card">
                    <span class="stat-label">Gesamt</span>
                    <span class="stat-value">{{ formatNumber(statistics.total_count) }}</span>
                  </div>
                  <div class="stat-card stat-card--warning">
                    <span class="stat-label">Zu löschen</span>
                    <span class="stat-value">{{ formatNumber(statistics.pending_cleanup_count) }}</span>
                  </div>
                  <div class="stat-card">
                    <span class="stat-label">Speicher</span>
                    <span class="stat-value">{{ formatBytes(statistics.storage_estimate_mb) }}</span>
                  </div>
                  <div class="stat-card stat-card--error" v-if="statistics.count_by_severity.error">
                    <span class="stat-label">Fehler</span>
                    <span class="stat-value">{{ formatNumber(statistics.count_by_severity.error || 0) }}</span>
                  </div>
                </div>

                <div v-else-if="isLoadingStats" class="loading-placeholder">
                  <RefreshCw class="w-5 h-5 animate-spin" />
                  <span>Lade Statistiken...</span>
                </div>

                <!-- Action button -->
                <div class="action-row">
                  <button
                    class="action-btn action-btn--danger"
                    @click="handleCleanupClick"
                    :disabled="isRunningCleanup || !canCleanup"
                    :title="!canCleanup ? 'Bereinigung erfordert Admin-Rechte' : ''"
                  >
                    <RefreshCw v-if="isRunningCleanup" class="w-4 h-4 animate-spin" />
                    <Trash2 v-else class="w-4 h-4" />
                    <span>Jetzt bereinigen</span>
                  </button>
                </div>

                <!-- Operator hint -->
                <div v-if="canPreview && !canCleanup" class="permission-hint">
                  <Info class="w-4 h-4" />
                  <span>Als Operator kannst du Vorschauen erstellen. Bereinigung erfordert Admin-Rechte.</span>
                </div>

                <!-- Completed cleanup result (shown after dialog closes) -->
                <Transition name="fade">
                  <div v-if="completedCleanupResult && !completedCleanupResult.dry_run && completedCleanupResult.deleted_count > 0" class="cleanup-result cleanup-result--success">
                    <div class="result-header">
                      <CheckCircle class="w-5 h-5" />
                      <span>Abgeschlossen</span>
                    </div>
                    <div class="result-details">
                      <p>
                        <strong>{{ formatNumber(completedCleanupResult.deleted_count) }}</strong>
                        Einträge gelöscht
                      </p>
                      <div v-if="Object.keys(completedCleanupResult.deleted_by_severity).length > 0" class="severity-breakdown">
                        <span v-for="(count, severity) in completedCleanupResult.deleted_by_severity" :key="String(severity)" class="severity-chip" :class="`severity-chip--${severity}`">
                          {{ severity }}: {{ formatNumber(count) }}
                        </span>
                      </div>
                      <div v-if="completedCleanupResult.backup_id" class="backup-notice">
                        <Archive class="w-4 h-4" />
                        <span>Backup #{{ completedCleanupResult.backup_id.slice(0, 8) }} erstellt</span>
                      </div>
                    </div>
                  </div>
                </Transition>

                <!-- Nothing to delete message -->
                <Transition name="fade">
                  <div v-if="cleanupResult && cleanupResult.dry_run && cleanupResult.deleted_count === 0" class="cleanup-result">
                    <div class="result-header">
                      <CheckCircle class="w-5 h-5" />
                      <span>Keine Einträge zu bereinigen</span>
                    </div>
                    <p class="result-message-muted">Alle Events entsprechen den Aufbewahrungsregeln.</p>
                  </div>
                </Transition>
              </section>

              <!-- 3. AUFBEWAHRUNGSREGELN (always visible) -->
              <section class="panel-section retention-section">
                <div class="section-header">
                  <Settings class="w-4 h-4" />
                  <span>Aufbewahrungsregeln</span>
                  <span v-if="retentionConfig?.enabled" class="badge badge--success">Aktiv</span>
                  <span v-else class="badge badge--muted">Inaktiv</span>
                </div>

                <div class="retention-settings">
                  <div class="setting-row">
                    <label class="checkbox-label">
                      <input type="checkbox" v-model="retentionForm.enabled" />
                      <span>Automatische Bereinigung aktivieren</span>
                    </label>
                  </div>

                  <div class="severity-retention-grid">
                    <div class="severity-retention-row">
                      <div class="severity-icon severity-icon--info">
                        <Info class="w-4 h-4" />
                      </div>
                      <span class="severity-label">Info</span>
                      <select v-model.number="retentionForm.severity_days!.info" class="retention-select">
                        <option v-for="opt in retentionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </div>
                    <div class="severity-retention-row">
                      <div class="severity-icon severity-icon--warning">
                        <AlertTriangle class="w-4 h-4" />
                      </div>
                      <span class="severity-label">Warnung</span>
                      <select v-model.number="retentionForm.severity_days!.warning" class="retention-select">
                        <option v-for="opt in retentionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </div>
                    <div class="severity-retention-row">
                      <div class="severity-icon severity-icon--error">
                        <AlertCircle class="w-4 h-4" />
                      </div>
                      <span class="severity-label">Fehler</span>
                      <select v-model.number="retentionForm.severity_days!.error" class="retention-select">
                        <option v-for="opt in retentionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </div>
                    <div class="severity-retention-row">
                      <div class="severity-icon severity-icon--critical">
                        <Shield class="w-4 h-4" />
                      </div>
                      <span class="severity-label">Kritisch</span>
                      <select v-model.number="retentionForm.severity_days!.critical" class="retention-select">
                        <option v-for="opt in retentionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </div>
                  </div>

                  <div class="setting-row">
                    <label class="checkbox-label">
                      <input type="checkbox" v-model="retentionForm.preserve_emergency_stops" />
                      <span>Notfall-Stopp Events niemals löschen</span>
                    </label>
                  </div>

                  <div class="setting-actions">
                    <button class="btn-primary" @click="saveRetentionConfig" :disabled="isSavingRetention">
                      <RefreshCw v-if="isSavingRetention" class="w-4 h-4 animate-spin" />
                      Speichern
                    </button>
                  </div>
                </div>
              </section>

              <!-- 4. BACKUPS -->
              <section class="panel-section">
                <div class="section-header">
                  <Archive class="w-4 h-4" />
                  <span>Backups</span>
                  <span v-if="hasActiveBackups" class="badge">{{ backups.filter(b => !b.expired).length }} verfügbar</span>
                  <button
                    class="refresh-btn"
                    @click="loadBackups"
                    :disabled="isLoadingBackups"
                  >
                    <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoadingBackups }" />
                  </button>
                </div>

                <div v-if="backups.length > 0" class="backup-list">
                  <div
                    v-for="backup in backups"
                    :key="backup.backup_id"
                    class="backup-item"
                    :class="{ 'backup-item--expired': backup.expired }"
                  >
                    <div class="backup-info">
                      <div class="backup-icon">
                        <Archive class="w-4 h-4" />
                      </div>
                      <div class="backup-details">
                        <span class="backup-id">#{{ backup.backup_id.slice(0, 8) }}</span>
                        <span class="backup-meta">
                          {{ formatNumber(backup.event_count) }} Events · {{ formatTimeAgo(backup.created_at) }}
                        </span>
                      </div>
                    </div>

                    <div class="backup-status">
                      <span v-if="backup.expired" class="status-expired">Abgelaufen</span>
                      <span v-else class="status-expires">
                        <Clock class="w-3 h-3" />
                        {{ formatExpiresIn(backup.expires_at) }}
                      </span>
                    </div>

                    <div class="backup-actions">
                      <button
                        v-if="!backup.expired"
                        class="backup-action-btn backup-action-btn--restore"
                        @click="restoreBackup(backup.backup_id)"
                        :disabled="isRestoringBackup === backup.backup_id"
                        title="Wiederherstellen"
                      >
                        <RefreshCw v-if="isRestoringBackup === backup.backup_id" class="w-4 h-4 animate-spin" />
                        <RotateCcw v-else class="w-4 h-4" />
                      </button>
                      <button
                        class="backup-action-btn backup-action-btn--delete"
                        @click="deleteBackup(backup.backup_id)"
                        :disabled="isDeletingBackup === backup.backup_id"
                        title="Löschen"
                      >
                        <RefreshCw v-if="isDeletingBackup === backup.backup_id" class="w-4 h-4 animate-spin" />
                        <Trash2 v-else class="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div v-else-if="isLoadingBackups" class="loading-placeholder">
                  <RefreshCw class="w-5 h-5 animate-spin" />
                  <span>Lade Backups...</span>
                </div>

                <div v-else class="empty-state">
                  <Archive class="w-8 h-8" />
                  <span>Keine Backups vorhanden</span>
                  <small>Backups werden automatisch vor Bereinigungen erstellt</small>
                </div>

                <!-- Backup Retention Configuration (Admin only) -->
                <div v-if="isAdmin" class="backup-retention-config">
                  <label class="backup-retention-label">
                    <Clock class="w-4 h-4" />
                    <span>Aufbewahrung neuer Backups:</span>
                  </label>
                  <div class="backup-retention-controls">
                    <select
                      v-model.number="selectedBackupRetention"
                      class="backup-retention-select"
                      :disabled="isSavingBackupRetention"
                    >
                      <option
                        v-for="opt in backupRetentionOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                    <button
                      class="backup-retention-save"
                      @click="saveBackupRetentionConfig"
                      :disabled="isSavingBackupRetention || selectedBackupRetention === backupRetentionConfig?.retention_days"
                    >
                      <RefreshCw v-if="isSavingBackupRetention" class="w-4 h-4 animate-spin" />
                      <span v-else>Speichern</span>
                    </button>
                  </div>
                  <small class="backup-retention-hint">
                    {{ selectedBackupRetention === 0 ? 'Backups werden niemals automatisch gelöscht' : `Neue Backups laufen nach ${selectedBackupRetention} Tagen ab` }}
                  </small>
                </div>
              </section>
            </div>

            <!-- Footer -->
            <footer class="cleanup-footer">
              <button class="btn-secondary" @click="emit('close')">
                Schließen
              </button>
            </footer>
          </div>
        </Transition>

        <!-- ================================================================ -->
        <!-- CLEANUP DIALOG (Preview + Confirm in one) -->
        <!-- ================================================================ -->
        <Transition name="fade">
          <div v-if="showCleanupDialog" class="cleanup-dialog-overlay" @click.self="closeCleanupDialog">
            <div class="cleanup-dialog">
              <header class="dialog-header">
                <Trash2 class="w-5 h-5" />
                <h3>Bereinigung</h3>
                <button class="close-btn" @click="closeCleanupDialog">
                  <X class="w-5 h-5" />
                </button>
              </header>

              <div class="dialog-content" v-if="cleanupPreview">
                <!-- Summary -->
                <div class="dialog-summary">
                  <AlertTriangle class="w-6 h-6 summary-icon" />
                  <div>
                    <p class="summary-count">
                      {{ formatNumber(cleanupPreview.deleted_count) }} Einträge werden gelöscht
                    </p>
                    <div v-if="Object.keys(cleanupPreview.deleted_by_severity).length > 0" class="summary-breakdown">
                      <span
                        v-for="(count, severity) in cleanupPreview.deleted_by_severity"
                        :key="String(severity)"
                        :class="`severity-badge severity-${severity}`"
                      >
                        {{ severity === 'info' ? 'Info' : severity === 'warning' ? 'Warnung' : severity === 'error' ? 'Fehler' : 'Kritisch' }}: {{ formatNumber(count) }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Preview Events -->
                <div v-if="cleanupPreview.preview_events && cleanupPreview.preview_events.length > 0" class="dialog-events">
                  <CleanupPreview
                    :preview="cleanupPreview"
                    @openFullList="loadAllPreviewEvents"
                  />
                </div>

                <!-- Options -->
                <div class="dialog-options">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="createBackupBeforeCleanup" />
                    <span>Backup vor Löschung erstellen (empfohlen)</span>
                  </label>
                </div>
              </div>

              <footer class="dialog-footer">
                <button class="btn-secondary" @click="closeCleanupDialog">
                  Abbrechen
                </button>
                <button
                  class="btn-danger"
                  @click="confirmAndRunCleanup"
                  :disabled="isDeleting"
                >
                  <RefreshCw v-if="isDeleting" class="w-4 h-4 animate-spin" />
                  <Trash2 v-else class="w-4 h-4" />
                  Endgültig löschen
                </button>
              </footer>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ============================================================================
   Base Panel Styles - Glassmorphism & Iridescent
   ============================================================================ */

.cleanup-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  background-color: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(8px);
}

.cleanup-panel {
  width: 100%;
  max-width: 56rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-2xl);
  box-shadow:
    var(--glass-shadow),
    0 0 60px rgba(96, 165, 250, 0.1);
  overflow: hidden;
}

/* Header */
.cleanup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--glass-border);
  background: linear-gradient(135deg,
    rgba(96, 165, 250, 0.08) 0%,
    transparent 100%
  );
}

.cleanup-header__title {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.title-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-iridescent);
  border-radius: var(--radius-lg);
  color: white;
}

.cleanup-header__title h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.cleanup-header__title .subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin: 0;
}

.close-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: all var(--transition-base);
}

.close-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-quaternary);
  transform: rotate(90deg);
}

/* Content */
.cleanup-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* Footer */
.cleanup-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-xl);
  border-top: 1px solid var(--glass-border);
  background: linear-gradient(0deg,
    rgba(96, 165, 250, 0.03) 0%,
    transparent 100%
  );
}

/* ============================================================================
   Section Styles
   ============================================================================ */

.panel-section {
  padding: var(--space-lg);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-md);
}

.section-header .badge {
  margin-left: auto;
}

.refresh-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-base);
  margin-left: var(--space-xs);
}

.refresh-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ============================================================================
   Statistics Grid
   ============================================================================ */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-sm);
}

.stat-card {
  padding: var(--space-md);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-xs);
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-card--warning {
  background: linear-gradient(135deg,
    rgba(251, 191, 36, 0.1) 0%,
    rgba(251, 191, 36, 0.05) 100%
  );
  border-color: rgba(251, 191, 36, 0.3);
}

.stat-card--warning .stat-value {
  color: var(--color-warning);
}

.stat-card--error {
  background: linear-gradient(135deg,
    rgba(248, 113, 113, 0.1) 0%,
    rgba(248, 113, 113, 0.05) 100%
  );
  border-color: rgba(248, 113, 113, 0.3);
}

.stat-card--error .stat-value {
  color: var(--color-error);
}

/* ============================================================================
   Action Row (single button, right-aligned)
   ============================================================================ */

.action-row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-md);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-base);
  font-weight: 600;
  font-size: 0.875rem;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn--danger:hover:not(:disabled) {
  background: linear-gradient(135deg,
    rgba(248, 113, 113, 0.2) 0%,
    rgba(248, 113, 113, 0.1) 100%
  );
  border-color: var(--color-error);
  color: var(--color-error);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Cleanup Result (inline) */
.cleanup-result {
  margin-top: var(--space-md);
  padding: var(--space-md);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}

.cleanup-result--success {
  background: linear-gradient(135deg,
    rgba(52, 211, 153, 0.1) 0%,
    rgba(52, 211, 153, 0.05) 100%
  );
  border-color: rgba(52, 211, 153, 0.3);
}

.result-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-weight: 600;
  margin-bottom: var(--space-sm);
  color: var(--color-text-primary);
}

.result-details {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.result-details p {
  margin: 0 0 var(--space-sm);
}

.result-message-muted {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  margin: 0;
}

.severity-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
}

.severity-chip {
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.severity-chip--info { color: var(--color-info); }
.severity-chip--warning { color: var(--color-warning); }
.severity-chip--error { color: var(--color-error); }
.severity-chip--critical { color: var(--color-error); font-weight: 700; }

.backup-notice {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: rgba(52, 211, 153, 0.1);
  border-radius: var(--radius-md);
  color: var(--color-success);
  font-size: 0.8125rem;
}

/* ============================================================================
   Retention Settings (always visible)
   ============================================================================ */

.retention-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.severity-retention-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.severity-retention-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}

.severity-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.severity-icon--info {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.severity-icon--warning {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.severity-icon--error {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.severity-icon--critical {
  background: rgba(220, 38, 38, 0.15);
  color: #dc2626;
}

.severity-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  min-width: 80px;
}

.retention-select {
  margin-left: auto;
  padding: var(--space-xs) var(--space-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all var(--transition-base);
  min-width: 160px;
}

.retention-select:hover {
  border-color: var(--glass-border-hover);
}

.retention-select:focus {
  outline: none;
  border-color: var(--color-iridescent-1);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
}

.setting-row {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  color: var(--color-text-primary);
  font-size: 0.875rem;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}

.setting-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-sm);
}

/* ============================================================================
   Backup List
   ============================================================================ */

.backup-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.backup-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  transition: all var(--transition-base);
}

.backup-item:hover {
  border-color: var(--glass-border-hover);
}

.backup-item--expired {
  opacity: 0.6;
}

.backup-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
}

.backup-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}

.backup-details {
  display: flex;
  flex-direction: column;
}

.backup-id {
  font-weight: 600;
  font-family: ui-monospace, monospace;
  font-size: 0.875rem;
  color: var(--color-text-primary);
}

.backup-meta {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.backup-status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.status-expired {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-error);
  padding: 0.125rem 0.5rem;
  background: rgba(248, 113, 113, 0.15);
  border-radius: var(--radius-full);
}

.status-expires {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-success);
  padding: 0.125rem 0.5rem;
  background: rgba(52, 211, 153, 0.15);
  border-radius: var(--radius-full);
}

.backup-actions {
  display: flex;
  gap: var(--space-xs);
}

.backup-action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-base);
}

.backup-action-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
}

.backup-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.backup-action-btn--restore:hover:not(:disabled) {
  color: var(--color-success);
  background: rgba(52, 211, 153, 0.15);
  border-color: var(--color-success);
}

.backup-action-btn--delete:hover:not(:disabled) {
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.15);
  border-color: var(--color-error);
}

/* ============================================================================
   Empty & Loading States
   ============================================================================ */

.loading-placeholder,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl);
  color: var(--color-text-muted);
  text-align: center;
}

.empty-state small {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  max-width: 200px;
}

/* ============================================================================
   Badge
   ============================================================================ */

.badge {
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: var(--radius-full);
  background: var(--gradient-iridescent);
  color: white;
}

.badge--success {
  background: linear-gradient(135deg, var(--color-success) 0%, #10b981 100%);
}

.badge--muted {
  background: var(--color-bg-quaternary);
  color: var(--color-text-muted);
}

/* ============================================================================
   Buttons
   ============================================================================ */

.btn-primary,
.btn-secondary,
.btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  border: none;
}

.btn-primary {
  background: var(--gradient-iridescent);
  color: white;
  box-shadow: var(--glass-shadow-glow);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(96, 165, 250, 0.4);
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border: 1px solid var(--glass-border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-quaternary);
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
}

.btn-danger {
  background: linear-gradient(135deg,
    rgba(248, 113, 113, 0.9) 0%,
    rgba(244, 63, 94, 0.9) 100%
  );
  color: white;
}

.btn-danger:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 0 25px rgba(248, 113, 113, 0.4);
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* ============================================================================
   Cleanup Dialog (Overlay within overlay)
   ============================================================================ */

.cleanup-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal-backdrop) + 10);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  background-color: rgba(10, 10, 15, 0.7);
  backdrop-filter: blur(4px);
}

.cleanup-dialog {
  width: 100%;
  max-width: 40rem;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: var(--radius-2xl);
  box-shadow:
    var(--glass-shadow),
    0 0 40px rgba(248, 113, 113, 0.1);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--glass-border);
  color: var(--color-error);
}

.dialog-header h3 {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  flex: 1;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg) var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.dialog-summary {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: linear-gradient(135deg,
    rgba(251, 191, 36, 0.1) 0%,
    rgba(251, 191, 36, 0.05) 100%
  );
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--radius-lg);
}

.summary-icon {
  color: #fbbf24;
  flex-shrink: 0;
  margin-top: 2px;
}

.summary-count {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-sm);
}

.summary-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.severity-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.severity-info {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.severity-warning {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.severity-error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.severity-critical {
  background: rgba(220, 38, 38, 0.2);
  color: #dc2626;
}

.dialog-events {
  max-height: 500px;
  overflow-y: auto;
  border-radius: var(--radius-lg);
}

.dialog-options {
  padding: var(--space-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding: var(--space-lg) var(--space-xl);
  border-top: 1px solid var(--glass-border);
}

/* ============================================================================
   Permission Hint
   ============================================================================ */

.permission-hint {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-lg);
  color: var(--color-text-tertiary);
  font-size: var(--text-sm);
  margin-top: var(--space-md);
}

.permission-hint svg {
  color: var(--color-accent);
  flex-shrink: 0;
}

/* ============================================================================
   Backup Retention Config
   ============================================================================ */

.backup-retention-config {
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: rgba(96, 165, 250, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}

.backup-retention-label {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin-bottom: var(--space-sm);
}

.backup-retention-controls {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.backup-retention-select {
  flex: 1;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.backup-retention-select:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.backup-retention-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.backup-retention-save {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: linear-gradient(135deg,
    rgba(96, 165, 250, 0.8) 0%,
    rgba(59, 130, 246, 0.8) 100%
  );
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: var(--radius-md);
  color: white;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 90px;
}

.backup-retention-save:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 0 15px rgba(96, 165, 250, 0.3);
}

.backup-retention-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.backup-retention-hint {
  display: block;
  margin-top: var(--space-sm);
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
}

/* ============================================================================
   Transitions
   ============================================================================ */

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-slow);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--transition-slow);
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* ============================================================================
   Animations
   ============================================================================ */

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ============================================================================
   Mobile Responsive
   ============================================================================ */

@media (max-width: 768px) {
  .cleanup-overlay {
    padding: 0;
  }

  .cleanup-panel {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .cleanup-content {
    padding: var(--space-md);
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .severity-retention-row {
    flex-wrap: wrap;
  }

  .retention-select {
    min-width: 0;
    flex: 1;
  }

  .backup-item {
    flex-wrap: wrap;
  }

  .backup-status {
    order: 2;
    flex: 1 1 100%;
    justify-content: flex-start;
    margin-top: var(--space-xs);
  }

  .backup-actions {
    order: 3;
    flex: 1 1 100%;
    justify-content: flex-end;
    margin-top: var(--space-xs);
  }

  .dialog-footer {
    flex-direction: column;
  }

  .dialog-footer button {
    width: 100%;
  }

  .backup-retention-controls {
    flex-direction: column;
  }

  .backup-retention-select,
  .backup-retention-save {
    width: 100%;
  }
}

/* Icon sizes */
.w-3 { width: 0.75rem; }
.h-3 { height: 0.75rem; }
.w-3\.5 { width: 0.875rem; }
.h-3\.5 { height: 0.875rem; }
.w-4 { width: 1rem; }
.h-4 { height: 1rem; }
.w-5 { width: 1.25rem; }
.h-5 { height: 1.25rem; }
.w-6 { width: 1.5rem; }
.h-6 { height: 1.5rem; }
.w-8 { width: 2rem; }
.h-8 { height: 2rem; }
</style>
