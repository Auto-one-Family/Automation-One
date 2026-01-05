<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDatabaseStore } from '@/stores/database'
import { useEspStore } from '@/stores/esp'
import { Database, RefreshCw, AlertCircle, MemoryStick, HardDrive, CheckCircle2, AlertTriangle, Radio } from 'lucide-vue-next'

// Components
import TableSelector from '@/components/database/TableSelector.vue'
import SchemaInfoPanel from '@/components/database/SchemaInfoPanel.vue'
import FilterPanel from '@/components/database/FilterPanel.vue'
import DataTable from '@/components/database/DataTable.vue'
import Pagination from '@/components/database/Pagination.vue'
import RecordDetailModal from '@/components/database/RecordDetailModal.vue'

const store = useDatabaseStore()
const espStore = useEspStore()

// =============================================================================
// Data Source Tabs
// =============================================================================
type DataSourceTab = 'postgresql' | 'mock-store'
const activeSource = ref<DataSourceTab>('postgresql')

// Mock Store data
const mockStoreLoading = ref(false)

async function loadMockStoreData() {
  mockStoreLoading.value = true
  try {
    await espStore.fetchAll()
  } finally {
    mockStoreLoading.value = false
  }
}

// Mock ESPs filtered to only show those from memory (not orphaned)
const mockEspsInMemory = computed(() => {
  return espStore.devices.filter(d => {
    const deviceId = espStore.getDeviceId(d)
    const isMock = espStore.isMock(deviceId)
    const isOrphaned = (d.metadata as Record<string, unknown>)?.orphaned_mock === true
    return isMock && !isOrphaned
  })
})

// Mock ESPs in database (for sync comparison)
const mockEspsInDb = computed(() => {
  return espStore.devices.filter(d => {
    const deviceId = espStore.getDeviceId(d)
    return espStore.isMock(deviceId)
  })
})

// Sync status
const syncStatus = computed(() => {
  const memoryCount = mockEspsInMemory.value.length
  const dbCount = mockEspsInDb.value.length
  const orphanedCount = dbCount - memoryCount

  if (orphanedCount > 0) {
    return {
      status: 'warning' as const,
      message: `${orphanedCount} verwaiste Mock(s) in DB`,
      memoryCount,
      dbCount,
      orphanedCount
    }
  } else if (memoryCount === dbCount && memoryCount > 0) {
    return {
      status: 'synced' as const,
      message: 'Synchronisiert',
      memoryCount,
      dbCount,
      orphanedCount: 0
    }
  } else if (memoryCount === 0 && dbCount === 0) {
    return {
      status: 'empty' as const,
      message: 'Keine Mock ESPs',
      memoryCount,
      dbCount,
      orphanedCount: 0
    }
  }
  return {
    status: 'unknown' as const,
    message: 'Unbekannt',
    memoryCount,
    dbCount,
    orphanedCount: 0
  }
})

// Mock Store columns for table display (with German labels for better UX)
const mockStoreColumns = [
  { name: 'esp_id', label: 'ESP-ID', type: 'string' as const, nullable: false, primary_key: true },
  { name: 'zone_name', label: 'Zone', type: 'string' as const, nullable: true, primary_key: false },
  { name: 'zone_id', label: 'Zone-ID', type: 'string' as const, nullable: true, primary_key: false },
  { name: 'system_state', label: 'Systemzustand', type: 'string' as const, nullable: false, primary_key: false },
  { name: 'status', label: 'Status', type: 'string' as const, nullable: false, primary_key: false },
  { name: 'connected', label: 'Verbunden', type: 'boolean' as const, nullable: false, primary_key: false },
  { name: 'sensors', label: 'Sensoren', type: 'integer' as const, nullable: false, primary_key: false },
  { name: 'actuators', label: 'Aktoren', type: 'integer' as const, nullable: false, primary_key: false },
  { name: 'heap_free', label: 'Freier Heap', type: 'integer' as const, nullable: true, primary_key: false },
  { name: 'wifi_rssi', label: 'WiFi RSSI', type: 'integer' as const, nullable: true, primary_key: false },
  { name: 'uptime', label: 'Laufzeit', type: 'integer' as const, nullable: true, primary_key: false },
  { name: 'auto_heartbeat', label: 'Auto-Heartbeat', type: 'boolean' as const, nullable: false, primary_key: false },
  { name: 'last_heartbeat', label: 'Letzter Heartbeat', type: 'datetime' as const, nullable: true, primary_key: false },
]

// Transform mock ESPs to table rows
const mockStoreTableData = computed(() => {
  return mockEspsInMemory.value.map((esp: any) => ({
    esp_id: esp.esp_id || esp.device_id,
    zone_id: esp.zone_id || null,
    zone_name: esp.zone_name || null,
    system_state: esp.system_state || 'UNKNOWN',
    status: esp.status || (esp.connected ? 'online' : 'offline'),
    connected: esp.connected ?? false,
    sensors: esp.sensors?.length ?? esp.sensor_count ?? 0,
    actuators: esp.actuators?.length ?? esp.actuator_count ?? 0,
    heap_free: esp.heap_free,
    wifi_rssi: esp.wifi_rssi,
    uptime: esp.uptime,
    auto_heartbeat: esp.auto_heartbeat ?? false,
    last_heartbeat: esp.last_heartbeat,
  }))
})

// Load tables on mount
onMounted(async () => {
  if (store.tables.length === 0) {
    await store.loadTables()
  }
})

// Handle table selection
async function handleSelectTable(tableName: string): Promise<void> {
  try {
    await store.selectTable(tableName)
  } catch (err) {
    console.error('Failed to select table:', err)
  }
}

// Handle sorting
async function handleSort(column: string): Promise<void> {
  try {
    await store.toggleSort(column)
  } catch (err) {
    console.error('Failed to sort:', err)
  }
}

// Handle row click
function handleRowClick(record: Record<string, unknown>): void {
  // Find primary key column
  const pkColumn = store.currentSchema?.columns.find(c => c.primary_key)
  const pkValue = pkColumn ? String(record[pkColumn.name] || '') : String(record['id'] || '')
  
  if (pkValue) {
    store.loadRecord(pkValue)
  }
}

// Handle pagination
async function handlePageChange(page: number): Promise<void> {
  try {
    await store.setPage(page)
  } catch (err) {
    console.error('Failed to change page:', err)
  }
}

async function handlePageSizeChange(size: number): Promise<void> {
  try {
    await store.setPageSize(size)
  } catch (err) {
    console.error('Failed to change page size:', err)
  }
}

// Handle filters
async function handleApplyFilters(filters: Record<string, unknown>): Promise<void> {
  try {
    await store.setFilters(filters)
  } catch (err) {
    console.error('Failed to apply filters:', err)
  }
}

async function handleClearFilters(): Promise<void> {
  try {
    await store.clearFilters()
  } catch (err) {
    console.error('Failed to clear filters:', err)
  }
}

// Handle refresh
async function handleRefresh(): Promise<void> {
  try {
    await store.refreshData()
  } catch (err) {
    console.error('Failed to refresh:', err)
  }
}

// Handle foreign key navigation
async function handleNavigateToForeignKey(table: string, id: string): Promise<void> {
  store.closeRecord()
  
  // Check if table exists in our list
  if (store.tableNames.includes(table)) {
    await handleSelectTable(table)
    // Apply filter for the specific ID
    await store.setFilters({ id })
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-dark-100 flex items-center gap-3">
          <Database class="w-7 h-7 text-purple-400" />
          Datenbanken
        </h1>
        <p class="text-sm text-dark-400 mt-1">
          PostgreSQL und Mock-Store Daten erkunden
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="activeSource === 'postgresql' && store.currentTable"
          class="btn-secondary"
          :disabled="store.isLoading"
          @click="handleRefresh"
        >
          <RefreshCw :class="['w-4 h-4 mr-2', store.isLoading && 'animate-spin']" />
          Aktualisieren
        </button>
        <button
          v-if="activeSource === 'mock-store'"
          class="btn-secondary"
          :disabled="mockStoreLoading"
          @click="loadMockStoreData"
        >
          <RefreshCw :class="['w-4 h-4 mr-2', mockStoreLoading && 'animate-spin']" />
          Aktualisieren
        </button>
      </div>
    </div>

    <!-- Data Source Tabs -->
    <div class="db-source-tabs">
      <button
        :class="['db-source-tab', activeSource === 'postgresql' && 'db-source-tab--active']"
        @click="activeSource = 'postgresql'"
      >
        <HardDrive class="w-4 h-4" />
        <span>PostgreSQL</span>
        <span class="db-source-tab__count">{{ store.tables.length }} Tabellen</span>
      </button>
      <button
        :class="['db-source-tab', activeSource === 'mock-store' && 'db-source-tab--active']"
        @click="activeSource = 'mock-store'; loadMockStoreData()"
      >
        <MemoryStick class="w-4 h-4" />
        <span>Mock Store</span>
        <span class="db-source-tab__count">{{ mockEspsInMemory.length }} ESPs</span>
        <!-- Sync Status Indicator -->
        <span :class="['db-source-tab__sync', `db-source-tab__sync--${syncStatus.status}`]" :title="syncStatus.message">
          <CheckCircle2 v-if="syncStatus.status === 'synced'" class="w-3 h-3" />
          <AlertTriangle v-else-if="syncStatus.status === 'warning'" class="w-3 h-3" />
          <Radio v-else-if="syncStatus.status === 'empty'" class="w-3 h-3" />
        </span>
      </button>
    </div>

    <!-- Error Alert -->
    <div
      v-if="store.error && activeSource === 'postgresql'"
      class="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3"
    >
      <AlertCircle class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p class="text-sm text-red-400">{{ store.error }}</p>
        <button
          class="text-xs text-red-400/70 hover:text-red-400 mt-1"
          @click="store.clearError()"
        >
          Schließen
        </button>
      </div>
    </div>

    <!-- =========================================================================
         PostgreSQL View
         ========================================================================= -->
    <template v-if="activeSource === 'postgresql'">
      <!-- Table Selector -->
      <div class="card p-4">
        <TableSelector
          :tables="store.tables"
          :selected-table="store.currentTable"
          :loading="store.isLoading && store.tables.length === 0"
          @select="handleSelectTable"
        />
      </div>
    
    <!-- Content Area (only shown when table is selected) -->
    <template v-if="store.currentTable">
      <!-- Schema Info -->
      <SchemaInfoPanel :schema="store.currentSchema" />
      
      <!-- Filter Panel -->
      <FilterPanel
        :columns="store.currentColumns"
        :current-filters="store.queryParams.filters"
        @apply="handleApplyFilters"
        @clear="handleClearFilters"
      />
      
      <!-- Data Table -->
      <DataTable
        :columns="store.currentColumns"
        :data="store.currentData?.data || []"
        :loading="store.isLoading"
        :sort-by="store.queryParams.sort_by"
        :sort-order="store.queryParams.sort_order"
        @sort="handleSort"
        @row-click="handleRowClick"
      />
      
      <!-- Pagination -->
      <Pagination
        v-if="store.currentData"
        :page="store.currentData.page"
        :total-pages="store.currentData.total_pages"
        :total-count="store.currentData.total_count"
        :page-size="store.queryParams.page_size || 50"
        @page-change="handlePageChange"
        @page-size-change="handlePageSizeChange"
      />
    </template>
    
    <!-- Empty State -->
    <div
      v-else-if="!store.isLoading"
      class="card p-12 text-center"
    >
      <Database class="w-16 h-16 mx-auto mb-4 text-dark-600" />
      <h3 class="text-lg font-medium text-dark-300 mb-2">Keine Tabelle ausgewählt</h3>
      <p class="text-sm text-dark-500">
        Wähle eine Tabelle aus dem Dropdown oben um die Daten zu erkunden
      </p>
    </div>
    </template>

    <!-- =========================================================================
         Mock Store View
         ========================================================================= -->
    <template v-if="activeSource === 'mock-store'">
      <!-- Sync Status Info -->
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <MemoryStick class="w-5 h-5 text-purple-400" />
            <div>
              <h3 class="font-medium" style="color: var(--color-text-primary)">Mock ESP Store (In-Memory)</h3>
              <p class="text-sm" style="color: var(--color-text-muted)">
                Simulierte ESPs im Server-RAM. Gehen bei Neustart verloren.
              </p>
            </div>
          </div>

          <!-- Sync Status Badge -->
          <div :class="['sync-status-badge', `sync-status-badge--${syncStatus.status}`]">
            <CheckCircle2 v-if="syncStatus.status === 'synced'" class="w-4 h-4" />
            <AlertTriangle v-else-if="syncStatus.status === 'warning'" class="w-4 h-4" />
            <Radio v-else class="w-4 h-4" />
            <div class="sync-status-badge__content">
              <span class="sync-status-badge__label">{{ syncStatus.message }}</span>
              <span class="sync-status-badge__detail">
                {{ syncStatus.memoryCount }} im RAM · {{ syncStatus.dbCount }} in DB
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Mock Store Data Table -->
      <DataTable
        v-if="mockStoreTableData.length > 0"
        :columns="mockStoreColumns"
        :data="mockStoreTableData"
        :loading="mockStoreLoading"
      />

      <!-- Empty State -->
      <div
        v-else-if="!mockStoreLoading"
        class="card p-12 text-center"
      >
        <MemoryStick class="w-16 h-16 mx-auto mb-4 text-dark-600" />
        <h3 class="text-lg font-medium text-dark-300 mb-2">Keine Mock ESPs im Speicher</h3>
        <p class="text-sm text-dark-500 mb-4">
          Erstelle einen Mock ESP unter "Geräte" um Daten hier zu sehen.
        </p>
        <router-link to="/" class="btn-primary">
          Zum Dashboard
        </router-link>
      </div>
    </template>

    <!-- Record Detail Modal -->
    <RecordDetailModal
      v-if="store.selectedRecord"
      :table-name="store.currentTable || ''"
      :record="store.selectedRecord.record"
      @close="store.closeRecord()"
      @navigate-to-foreign-key="handleNavigateToForeignKey"
    />
  </div>
</template>

<style scoped>
/* =============================================================================
   Data Source Tabs
   ============================================================================= */
.db-source-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.75rem;
  border: 1px solid var(--glass-border);
}

.db-source-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.db-source-tab:hover {
  color: var(--color-text-secondary);
  background-color: var(--color-bg-secondary);
}

.db-source-tab--active {
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.db-source-tab__count {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}

.db-source-tab--active .db-source-tab__count {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.db-source-tab__sync {
  display: flex;
  align-items: center;
}

.db-source-tab__sync--synced {
  color: var(--color-success);
}

.db-source-tab__sync--warning {
  color: var(--color-warning);
}

.db-source-tab__sync--empty {
  color: var(--color-text-muted);
}

.db-source-tab__sync--unknown {
  color: var(--color-text-muted);
}

/* =============================================================================
   Sync Status Badge
   ============================================================================= */
.sync-status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
}

.sync-status-badge--synced {
  background-color: rgba(34, 197, 94, 0.1);
  color: var(--color-success);
}

.sync-status-badge--warning {
  background-color: rgba(251, 191, 36, 0.1);
  color: var(--color-warning);
}

.sync-status-badge--empty,
.sync-status-badge--unknown {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}

.sync-status-badge__content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.sync-status-badge__label {
  font-weight: 500;
}

.sync-status-badge__detail {
  font-size: 0.6875rem;
  opacity: 0.8;
}
</style>
















