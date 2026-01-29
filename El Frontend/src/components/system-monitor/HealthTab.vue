<script setup lang="ts">
/**
 * HealthTab - Fleet Health Overview
 *
 * Shows aggregated health metrics for all ESP devices:
 * - Summary KPI cards (online count, heap, RSSI, errors)
 * - Per-device health list with sortable columns
 * - Problem-ESP highlighting
 * - Cross-tab navigation to Events tab
 */

import { ref, computed, onMounted } from 'vue'
import { Cpu, Wifi, AlertTriangle, HeartPulse, ArrowUpDown, ExternalLink, RefreshCw } from 'lucide-vue-next'
import StatCard from '@/components/dashboard/StatCard.vue'
import { getFleetHealth, type FleetHealthResponse } from '@/api/health'

// =============================================================================
// Props & Emits
// =============================================================================

interface Props {
  filterEspId?: string
}

const props = withDefaults(defineProps<Props>(), {
  filterEspId: '',
})

const emit = defineEmits<{
  'filter-device': [espId: string]
}>()

// =============================================================================
// State
// =============================================================================

const healthData = ref<FleetHealthResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const sortField = ref<'device_id' | 'status' | 'uptime_seconds' | 'heap_free' | 'wifi_rssi'>('status')
const sortAsc = ref(true)

// =============================================================================
// Computed
// =============================================================================

const filteredDevices = computed(() => {
  if (!healthData.value) return []
  let devices = healthData.value.devices
  if (props.filterEspId) {
    const q = props.filterEspId.toLowerCase()
    devices = devices.filter(
      d => d.device_id.toLowerCase().includes(q) || (d.name && d.name.toLowerCase().includes(q))
    )
  }
  return devices
})

const sortedDevices = computed(() => {
  const list = [...filteredDevices.value]
  const field = sortField.value
  const asc = sortAsc.value
  list.sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'string' && typeof bv === 'string') {
      return asc ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return asc ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })
  return list
})

const problemDevices = computed(() =>
  filteredDevices.value.filter(
    d =>
      d.status === 'offline' ||
      d.status === 'error' ||
      (d.heap_free != null && d.heap_free < 20480) ||
      (d.wifi_rssi != null && d.wifi_rssi < -80)
  )
)

const onlinePercent = computed(() => {
  if (!healthData.value || healthData.value.total_devices === 0) return 100
  return Math.round((healthData.value.online_count / healthData.value.total_devices) * 100)
})

// =============================================================================
// Methods
// =============================================================================

async function fetchHealth() {
  loading.value = true
  error.value = null
  try {
    healthData.value = await getFleetHealth()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Fehler beim Laden der Health-Daten'
  } finally {
    loading.value = false
  }
}

function toggleSort(field: typeof sortField.value) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = true
  }
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatHeap(bytes: number | null): string {
  if (bytes == null) return '—'
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatRssi(rssi: number | null): string {
  if (rssi == null) return '—'
  return `${rssi} dBm`
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `vor ${diff}s`
  if (diff < 3600) return `vor ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)}h`
  return `vor ${Math.floor(diff / 86400)}d`
}

function statusClass(status: string): string {
  switch (status) {
    case 'online': return 'status-online'
    case 'offline': return 'status-offline'
    case 'error': return 'status-error'
    default: return 'status-unknown'
  }
}

function heapSeverity(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 20480) return 'heap-critical'
  if (bytes < 40960) return 'heap-warning'
  return ''
}

function rssiSeverity(rssi: number | null): string {
  if (rssi == null) return ''
  if (rssi < -80) return 'rssi-critical'
  if (rssi < -70) return 'rssi-warning'
  return ''
}

function showEventsForEsp(espId: string) {
  emit('filter-device', espId)
}

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(fetchHealth)
</script>

<template>
  <div class="health-tab">
    <!-- Error State -->
    <div v-if="error" class="health-error">
      <AlertTriangle class="health-error__icon" />
      <span>{{ error }}</span>
      <button class="health-error__retry" @click="fetchHealth">Erneut versuchen</button>
    </div>

    <!-- Summary Cards -->
    <section class="health-summary">
      <StatCard
        title="Geräte Online"
        :value="loading ? '...' : `${healthData?.online_count ?? 0}/${healthData?.total_devices ?? 0}`"
        :subtitle="loading ? undefined : `${onlinePercent}% erreichbar`"
        :icon="HeartPulse"
        :icon-color="onlinePercent < 80 ? 'text-error' : 'text-success'"
        :icon-bg-color="onlinePercent < 80 ? 'bg-error/10' : 'bg-success/10'"
        :loading="loading"
      />
      <StatCard
        title="Durchschn. Heap"
        :value="loading ? '...' : formatHeap(healthData?.avg_heap_free ?? null)"
        subtitle="Freier Speicher"
        :icon="Cpu"
        :loading="loading"
      />
      <StatCard
        title="Durchschn. RSSI"
        :value="loading ? '...' : formatRssi(healthData?.avg_wifi_rssi ?? null)"
        subtitle="Signal-Qualität"
        :icon="Wifi"
        :loading="loading"
      />
      <StatCard
        title="Probleme"
        :value="loading ? '...' : problemDevices.length"
        :subtitle="loading ? undefined : problemDevices.length > 0 ? 'Geräte mit Auffälligkeiten' : 'Alles in Ordnung'"
        :icon="AlertTriangle"
        :icon-color="problemDevices.length > 0 ? 'text-warning' : 'text-success'"
        :icon-bg-color="problemDevices.length > 0 ? 'bg-warning/10' : 'bg-success/10'"
        :loading="loading"
      />
    </section>

    <!-- Refresh Button -->
    <div class="health-actions">
      <button class="refresh-btn" :disabled="loading" @click="fetchHealth">
        <RefreshCw class="refresh-icon" :class="{ 'refresh-icon--spinning': loading }" />
        Aktualisieren
      </button>
    </div>

    <!-- Problem Devices -->
    <section v-if="!loading && problemDevices.length > 0" class="health-problems">
      <h3 class="section-title section-title--warning">
        <AlertTriangle class="section-icon" />
        Problem-Geräte ({{ problemDevices.length }})
      </h3>
      <div class="problem-list">
        <div
          v-for="device in problemDevices"
          :key="device.device_id"
          class="problem-item"
          @click="showEventsForEsp(device.device_id)"
        >
          <span class="problem-item__id">{{ device.name || device.device_id }}</span>
          <span :class="['status-badge', statusClass(device.status)]">{{ device.status }}</span>
          <span v-if="device.heap_free != null && device.heap_free < 20480" class="problem-tag problem-tag--error">
            Heap {{ formatHeap(device.heap_free) }}
          </span>
          <span v-if="device.wifi_rssi != null && device.wifi_rssi < -80" class="problem-tag problem-tag--warning">
            RSSI {{ device.wifi_rssi }} dBm
          </span>
          <ExternalLink class="problem-item__link" />
        </div>
      </div>
    </section>

    <!-- Device Health List -->
    <section v-if="!loading" class="health-list-section">
      <h3 class="section-title">
        Alle Geräte ({{ filteredDevices.length }})
      </h3>

      <div class="health-table-wrap">
        <table class="health-table">
          <thead>
            <tr>
              <th class="col-sortable" @click="toggleSort('device_id')">
                ESP-ID
                <ArrowUpDown v-if="sortField === 'device_id'" class="sort-icon" />
              </th>
              <th class="col-sortable" @click="toggleSort('status')">
                Status
                <ArrowUpDown v-if="sortField === 'status'" class="sort-icon" />
              </th>
              <th class="col-sortable" @click="toggleSort('uptime_seconds')">
                Uptime
                <ArrowUpDown v-if="sortField === 'uptime_seconds'" class="sort-icon" />
              </th>
              <th class="col-sortable" @click="toggleSort('heap_free')">
                Heap
                <ArrowUpDown v-if="sortField === 'heap_free'" class="sort-icon" />
              </th>
              <th class="col-sortable" @click="toggleSort('wifi_rssi')">
                RSSI
                <ArrowUpDown v-if="sortField === 'wifi_rssi'" class="sort-icon" />
              </th>
              <th>Sensoren</th>
              <th>Zuletzt gesehen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="device in sortedDevices"
              :key="device.device_id"
              class="health-row"
              :class="{ 'health-row--problem': device.status === 'offline' || device.status === 'error' }"
            >
              <td class="col-id">
                <div class="device-id-cell">
                  <span class="device-name">{{ device.name || device.device_id }}</span>
                  <span v-if="device.name" class="device-id-sub">{{ device.device_id }}</span>
                </div>
              </td>
              <td>
                <span :class="['status-badge', statusClass(device.status)]">{{ device.status }}</span>
              </td>
              <td>{{ formatUptime(device.uptime_seconds) }}</td>
              <td :class="heapSeverity(device.heap_free)">{{ formatHeap(device.heap_free) }}</td>
              <td :class="rssiSeverity(device.wifi_rssi)">{{ formatRssi(device.wifi_rssi) }}</td>
              <td>{{ device.sensor_count }} / {{ device.actuator_count }}</td>
              <td>{{ formatLastSeen(device.last_seen) }}</td>
              <td>
                <button class="events-link" @click="showEventsForEsp(device.device_id)" title="Events anzeigen">
                  <ExternalLink class="events-link__icon" />
                </button>
              </td>
            </tr>
            <tr v-if="sortedDevices.length === 0">
              <td colspan="8" class="empty-state">
                {{ props.filterEspId ? 'Kein Gerät entspricht dem Filter' : 'Keine Geräte registriert' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Loading skeleton for table -->
    <section v-if="loading" class="health-list-section">
      <div v-for="i in 5" :key="i" class="skeleton-row">
        <div class="skeleton skeleton--sm" />
        <div class="skeleton skeleton--xs" />
        <div class="skeleton skeleton--xs" />
        <div class="skeleton skeleton--xs" />
      </div>
    </section>
  </div>
</template>

<style scoped>
/* =============================================================================
   Layout
   ============================================================================= */
.health-tab {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
}

/* =============================================================================
   Summary Cards
   ============================================================================= */
.health-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

/* =============================================================================
   Actions
   ============================================================================= */
.health-actions {
  display: flex;
  justify-content: flex-end;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-lg);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all var(--transition-base);
}

.refresh-btn:hover:not(:disabled) {
  background: var(--glass-bg-light);
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-icon {
  width: 0.875rem;
  height: 0.875rem;
}

.refresh-icon--spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* =============================================================================
   Error State
   ============================================================================= */
.health-error {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-lg);
  color: var(--color-error);
  font-size: 0.875rem;
}

.health-error__icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

.health-error__retry {
  margin-left: auto;
  padding: 0.375rem 0.75rem;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background var(--transition-base);
}

.health-error__retry:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* =============================================================================
   Section Titles
   ============================================================================= */
.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
}

.section-title--warning {
  color: var(--color-warning);
}

.section-icon {
  width: 1rem;
  height: 1rem;
}

/* =============================================================================
   Problem Devices
   ============================================================================= */
.health-problems {
  padding: 1rem 1.25rem;
  background: rgba(245, 158, 11, 0.05);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: var(--radius-lg);
}

.problem-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.problem-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
}

.problem-item:hover {
  background: var(--glass-bg-light);
  border-color: var(--glass-border-hover);
}

.problem-item__id {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.8125rem;
}

.problem-item__link {
  width: 0.875rem;
  height: 0.875rem;
  color: var(--color-text-muted);
  margin-left: auto;
  flex-shrink: 0;
}

.problem-tag {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
}

.problem-tag--error {
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
}

.problem-tag--warning {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-warning);
}

/* =============================================================================
   Status Badge
   ============================================================================= */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.status-online {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.status-offline {
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
}

.status-error {
  background: rgba(220, 38, 38, 0.15);
  color: #dc2626;
}

.status-unknown {
  background: rgba(112, 112, 128, 0.15);
  color: var(--color-text-muted);
}

/* =============================================================================
   Health Table
   ============================================================================= */
.health-table-wrap {
  overflow-x: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
}

.health-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.health-table thead {
  background: var(--glass-bg);
  position: sticky;
  top: 0;
  z-index: 1;
}

.health-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--glass-border);
  white-space: nowrap;
}

.col-sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-base);
}

.col-sortable:hover {
  color: var(--color-text-primary);
}

.sort-icon {
  width: 0.75rem;
  height: 0.75rem;
  display: inline-block;
  vertical-align: middle;
  margin-left: 0.25rem;
  color: var(--color-iridescent-1);
}

.health-table td {
  padding: 0.625rem 1rem;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--glass-border);
  white-space: nowrap;
}

.health-row {
  transition: background var(--transition-base);
}

.health-row:hover {
  background: var(--glass-bg-light);
}

.health-row--problem {
  background: rgba(239, 68, 68, 0.04);
}

.health-row--problem:hover {
  background: rgba(239, 68, 68, 0.08);
}

/* Device ID cell */
.device-id-cell {
  display: flex;
  flex-direction: column;
}

.device-name {
  font-weight: 500;
}

.device-id-sub {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

/* Heap severity */
.heap-critical {
  color: var(--color-error);
  font-weight: 600;
}

.heap-warning {
  color: var(--color-warning);
}

/* RSSI severity */
.rssi-critical {
  color: var(--color-error);
  font-weight: 600;
}

.rssi-warning {
  color: var(--color-warning);
}

/* Events link button */
.events-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-md);
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-base);
}

.events-link:hover {
  background: var(--glass-bg);
  border-color: var(--glass-border);
  color: var(--color-iridescent-1);
}

.events-link__icon {
  width: 0.875rem;
  height: 0.875rem;
}

/* Empty state */
.empty-state {
  text-align: center;
  color: var(--color-text-muted);
  padding: 2rem 1rem !important;
}

/* =============================================================================
   Skeleton Loading
   ============================================================================= */
.skeleton-row {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--glass-border);
}

.skeleton {
  background: linear-gradient(90deg, var(--glass-bg) 25%, var(--glass-bg-light) 50%, var(--glass-bg) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

.skeleton--sm {
  width: 120px;
  height: 1rem;
}

.skeleton--xs {
  width: 60px;
  height: 1rem;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* =============================================================================
   Responsive
   ============================================================================= */
@media (max-width: 768px) {
  .health-tab {
    padding: 1rem;
    gap: 1rem;
  }

  .health-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .health-table th:nth-child(n+6),
  .health-table td:nth-child(n+6) {
    display: none;
  }
}

@media (max-width: 480px) {
  .health-summary {
    grid-template-columns: 1fr;
  }

  .health-table th:nth-child(n+4),
  .health-table td:nth-child(n+4) {
    display: none;
  }
}

/* Utility classes for StatCard icon colors */
:deep(.text-success) { color: var(--color-success); }
:deep(.text-error) { color: var(--color-error); }
:deep(.text-warning) { color: var(--color-warning); }
:deep(.bg-success\/10) { background: rgba(34, 197, 94, 0.1); }
:deep(.bg-error\/10) { background: rgba(239, 68, 68, 0.1); }
:deep(.bg-warning\/10) { background: rgba(245, 158, 11, 0.1); }
</style>
