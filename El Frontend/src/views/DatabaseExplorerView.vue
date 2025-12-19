<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useDatabaseStore } from '@/stores/database'
import { Database, RefreshCw, AlertCircle } from 'lucide-vue-next'

// Components
import TableSelector from '@/components/database/TableSelector.vue'
import SchemaInfoPanel from '@/components/database/SchemaInfoPanel.vue'
import FilterPanel from '@/components/database/FilterPanel.vue'
import DataTable from '@/components/database/DataTable.vue'
import Pagination from '@/components/database/Pagination.vue'
import RecordDetailModal from '@/components/database/RecordDetailModal.vue'

const store = useDatabaseStore()

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
          Database Explorer
        </h1>
        <p class="text-sm text-dark-400 mt-1">
          Explore and inspect database tables
        </p>
      </div>
      
      <div class="flex items-center gap-2">
        <button
          v-if="store.currentTable"
          class="btn-secondary"
          :disabled="store.isLoading"
          @click="handleRefresh"
        >
          <RefreshCw :class="['w-4 h-4 mr-2', store.isLoading && 'animate-spin']" />
          Refresh
        </button>
      </div>
    </div>
    
    <!-- Error Alert -->
    <div
      v-if="store.error"
      class="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3"
    >
      <AlertCircle class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p class="text-sm text-red-400">{{ store.error }}</p>
        <button
          class="text-xs text-red-400/70 hover:text-red-400 mt-1"
          @click="store.clearError()"
        >
          Dismiss
        </button>
      </div>
    </div>
    
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
      <h3 class="text-lg font-medium text-dark-300 mb-2">No Table Selected</h3>
      <p class="text-sm text-dark-500">
        Select a table from the dropdown above to explore its data
      </p>
    </div>
    
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







