<template>
  <div class="maintenance-view">
    <div class="page-header">
      <h1>🔧 Maintenance & Monitoring</h1>
      <p class="subtitle">System-Wartung und Überwachung</p>
    </div>

    <!-- Service Status -->
    <div class="status-section">
      <h2>Service Status</h2>
      <div v-if="loading" class="loading">
        <LoadingState message="Lade Maintenance-Status..." />
      </div>

      <div v-else-if="status" class="status-grid">
        <div class="status-card" :class="status.service_running ? 'status-success' : 'status-error'">
          <div class="status-icon">{{ status.service_running ? '✅' : '❌' }}</div>
          <div class="status-content">
            <div class="status-label">Service</div>
            <div class="status-value">{{ status.service_running ? 'Running' : 'Stopped' }}</div>
          </div>
        </div>

        <div class="status-card">
          <div class="status-icon">📊</div>
          <div class="status-content">
            <div class="status-label">Total ESPs</div>
            <div class="status-value">{{ status.stats_cache.total_esps }}</div>
            <div class="status-sub">{{ status.stats_cache.online_esps }} online</div>
          </div>
        </div>

        <div class="status-card">
          <div class="status-icon">📡</div>
          <div class="status-content">
            <div class="status-label">Total Sensors</div>
            <div class="status-value">{{ status.stats_cache.total_sensors }}</div>
          </div>
        </div>

        <div class="status-card">
          <div class="status-icon">⚙️</div>
          <div class="status-content">
            <div class="status-label">Total Actuators</div>
            <div class="status-value">{{ status.stats_cache.total_actuators }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Configuration -->
    <div class="config-section">
      <h2>Cleanup Configuration</h2>
      <div v-if="config" class="config-grid">
        <div class="config-card">
          <h3>Sensor Data Cleanup</h3>
          <div class="config-item">
            <span class="config-label">Status:</span>
            <span class="config-value" :class="config.sensor_data.retention_enabled ? 'enabled' : 'disabled'">
              {{ config.sensor_data.retention_enabled ? '✅ ENABLED' : '⚠️ DISABLED' }}
            </span>
          </div>
          <div v-if="config.sensor_data.retention_enabled" class="config-item">
            <span class="config-label">Retention:</span>
            <span class="config-value">{{ config.sensor_data.retention_days }} days</span>
          </div>
          <div v-if="config.sensor_data.retention_enabled" class="config-item">
            <span class="config-label">Mode:</span>
            <span class="config-value" :class="config.sensor_data.dry_run ? 'dry-run' : 'active'">
              {{ config.sensor_data.dry_run ? '🔍 DRY-RUN' : '🗑️ ACTIVE' }}
            </span>
          </div>
        </div>

        <div class="config-card">
          <h3>Command History Cleanup</h3>
          <div class="config-item">
            <span class="config-label">Status:</span>
            <span class="config-value" :class="config.command_history.retention_enabled ? 'enabled' : 'disabled'">
              {{ config.command_history.retention_enabled ? '✅ ENABLED' : '⚠️ DISABLED' }}
            </span>
          </div>
          <div v-if="config.command_history.retention_enabled" class="config-item">
            <span class="config-label">Retention:</span>
            <span class="config-value">{{ config.command_history.retention_days }} days</span>
          </div>
          <div v-if="config.command_history.retention_enabled" class="config-item">
            <span class="config-label">Mode:</span>
            <span class="config-value" :class="config.command_history.dry_run ? 'dry-run' : 'active'">
              {{ config.command_history.dry_run ? '🔍 DRY-RUN' : '🗑️ ACTIVE' }}
            </span>
          </div>
        </div>

        <div class="config-card">
          <h3>Orphaned Mocks Cleanup</h3>
          <div class="config-item">
            <span class="config-label">Status:</span>
            <span class="config-value" :class="config.orphaned_mocks.cleanup_enabled ? 'enabled' : 'disabled'">
              {{ config.orphaned_mocks.cleanup_enabled ? '✅ ENABLED' : '⚠️ DISABLED' }}
            </span>
          </div>
          <div v-if="config.orphaned_mocks.cleanup_enabled" class="config-item">
            <span class="config-label">Mode:</span>
            <span class="config-value" :class="config.orphaned_mocks.auto_delete ? 'active' : 'warn'">
              {{ config.orphaned_mocks.auto_delete ? '🗑️ AUTO-DELETE' : '⚠️ WARN ONLY' }}
            </span>
          </div>
          <div v-if="config.orphaned_mocks.cleanup_enabled" class="config-item">
            <span class="config-label">Age Threshold:</span>
            <span class="config-value">{{ config.orphaned_mocks.age_hours }}h</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Maintenance Jobs -->
    <div class="jobs-section">
      <h2>Maintenance & Monitor Jobs</h2>
      <div v-if="status" class="jobs-grid">
        <div
          v-for="job in status.jobs"
          :key="job.job_id"
          class="job-card"
        >
          <div class="job-header">
            <div class="job-icon">{{ getJobIcon(job.job_id) }}</div>
            <div class="job-title">
              <h3>{{ formatJobName(job.job_id) }}</h3>
              <span class="job-id">{{ job.job_id }}</span>
            </div>
            <button
              class="btn-trigger"
              :disabled="triggering === job.job_id"
              @click="triggerJob(job.job_id)"
            >
              {{ triggering === job.job_id ? '⏳' : '▶️' }} Run
            </button>
          </div>

          <div class="job-details">
            <div class="job-detail">
              <span class="detail-label">Last Run:</span>
              <span class="detail-value">{{ formatDate(job.last_run) }}</span>
            </div>
            <div class="job-detail">
              <span class="detail-label">Next Run:</span>
              <span class="detail-value">{{ formatDate(job.next_run) }}</span>
            </div>
            <div class="job-detail">
              <span class="detail-label">Status:</span>
              <span class="detail-value" :class="`status-${job.last_result}`">
                {{ job.last_result }}
              </span>
            </div>

            <!-- Job-specific results -->
            <div v-if="job.records_found !== undefined" class="job-result">
              <div class="result-item">
                <span class="result-label">Records Found:</span>
                <span class="result-value">{{ job.records_found?.toLocaleString() }}</span>
              </div>
              <div class="result-item">
                <span class="result-label">Records Deleted:</span>
                <span class="result-value">{{ job.records_deleted?.toLocaleString() }}</span>
              </div>
              <div v-if="job.dry_run" class="result-warning">
                🔍 DRY-RUN MODE (keine Daten gelöscht)
              </div>
            </div>

            <div v-if="job.orphaned_found !== undefined" class="job-result">
              <div class="result-item">
                <span class="result-label">Orphaned Found:</span>
                <span class="result-value">{{ job.orphaned_found }}</span>
              </div>
              <div class="result-item">
                <span class="result-label">Deleted:</span>
                <span class="result-value">{{ job.deleted }}</span>
              </div>
              <div class="result-item">
                <span class="result-label">Warned:</span>
                <span class="result-value">{{ job.warned }}</span>
              </div>
            </div>

            <div v-if="job.esps_checked !== undefined" class="job-result">
              <div class="result-item">
                <span class="result-label">ESPs Checked:</span>
                <span class="result-value">{{ job.esps_checked }}</span>
              </div>
              <div class="result-item">
                <span class="result-label">Timeouts:</span>
                <span class="result-value">{{ job.timeouts_detected }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { debugApi, type MaintenanceStatusResponse, type MaintenanceConfigResponse } from '@/api/debug'
import LoadingState from '@/components/common/LoadingState.vue'

const loading = ref(true)
const status = ref<MaintenanceStatusResponse | null>(null)
const config = ref<MaintenanceConfigResponse | null>(null)
const triggering = ref<string | null>(null)

async function loadData() {
  loading.value = true
  try {
    const [statusData, configData] = await Promise.all([
      debugApi.getMaintenanceStatus(),
      debugApi.getMaintenanceConfig(),
    ])
    status.value = statusData
    config.value = configData
  } catch (error) {
    console.error('Failed to load maintenance data:', error)
  } finally {
    loading.value = false
  }
}

async function triggerJob(jobId: string) {
  triggering.value = jobId
  try {
    const result = await debugApi.triggerMaintenanceJob(jobId)
    console.log('Job triggered:', result)
    // Reload status nach Trigger
    await loadData()
  } catch (error) {
    console.error('Failed to trigger job:', error)
  } finally {
    triggering.value = null
  }
}

function getJobIcon(jobId: string): string {
  if (jobId.includes('cleanup_sensor')) return '📊'
  if (jobId.includes('cleanup_command')) return '📝'
  if (jobId.includes('cleanup_orphaned')) return '🗑️'
  if (jobId.includes('health_check_esps')) return '💓'
  if (jobId.includes('health_check_mqtt')) return '📡'
  if (jobId.includes('aggregate_stats')) return '📈'
  return '⚙️'
}

function formatJobName(jobId: string): string {
  return jobId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('de-DE')
}

onMounted(() => {
  loadData()
  // Auto-refresh alle 30 Sekunden
  setInterval(loadData, 30000)
})
</script>

<style scoped>
.maintenance-view {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--text-muted);
  font-size: 1rem;
}

/* Status Section */
.status-section {
  margin-bottom: 2rem;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.status-card.status-success {
  border-color: var(--success-color);
}

.status-card.status-error {
  border-color: var(--error-color);
}

.status-icon {
  font-size: 2rem;
}

.status-content {
  flex: 1;
}

.status-label {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.status-value {
  font-size: 1.25rem;
  font-weight: 600;
}

.status-sub {
  font-size: 0.875rem;
  color: var(--text-muted);
}

/* Config Section */
.config-section {
  margin-bottom: 2rem;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.config-card {
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.config-card h3 {
  font-size: 1rem;
  margin-bottom: 1rem;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.config-item:last-child {
  border-bottom: none;
}

.config-label {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.config-value {
  font-weight: 600;
}

.config-value.enabled {
  color: var(--success-color);
}

.config-value.disabled {
  color: var(--warning-color);
}

.config-value.dry-run {
  color: var(--info-color);
}

.config-value.active {
  color: var(--error-color);
}

.config-value.warn {
  color: var(--warning-color);
}

/* Jobs Section */
.jobs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1rem;
}

.job-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  padding: 1rem;
}

.job-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.job-icon {
  font-size: 1.5rem;
}

.job-title {
  flex: 1;
}

.job-title h3 {
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.job-id {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.btn-trigger {
  padding: 0.5rem 1rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-trigger:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.job-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.job-detail {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.detail-label {
  color: var(--text-muted);
}

.detail-value.status-success {
  color: var(--success-color);
}

.detail-value.status-error {
  color: var(--error-color);
}

.job-result {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-color);
}

.result-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

.result-label {
  color: var(--text-muted);
}

.result-value {
  font-weight: 600;
}

.result-warning {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: var(--info-bg);
  color: var(--info-color);
  border-radius: 4px;
  font-size: 0.875rem;
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
</style>
