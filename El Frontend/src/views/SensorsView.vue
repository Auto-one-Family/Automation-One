<script setup lang="ts">
/**
 * ComponentInventoryView — Flat Hardware Inventory
 *
 * Unified view for all sensors, actuators, and ESPs in a single searchable,
 * filterable, sortable table. Replaces the former zone-grouped SensorsView.
 * Route: /sensors (unchanged for backward compatibility).
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Search, Filter, X, Columns,
  Package,
} from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'
import { useInventoryStore, INVENTORY_COLUMNS } from '@/shared/stores/inventory.store'
import type { ComponentItem } from '@/shared/stores/inventory.store'
import InventoryTable from '@/components/inventory/InventoryTable.vue'
import DeviceDetailPanel from '@/components/inventory/DeviceDetailPanel.vue'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import EmergencyStopButton from '@/components/safety/EmergencyStopButton.vue'

const route = useRoute()
const espStore = useEspStore()
const store = useInventoryStore()

// =============================================================================
// Column Selector
// =============================================================================
const showColumnSelector = ref(false)

// =============================================================================
// Search debounce
// =============================================================================
const searchInput = ref(store.searchQuery)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    store.searchQuery = val
    store.currentPage = 1
  }, 300)
})

// =============================================================================
// Filter visibility
// =============================================================================
const showFilters = ref(false)

const activeFilterCount = computed(() => {
  let count = 0
  if (store.typeFilter !== 'all') count++
  if (store.statusFilter !== 'all') count++
  if (store.zoneFilter.length > 0) count += store.zoneFilter.length
  return count
})

// =============================================================================
// Lifecycle
// =============================================================================
onMounted(async () => {
  await espStore.fetchAll()

  // Deep-link: ?focus=sensorId → open detail panel
  const focusParam = route.query.focus as string | undefined
  if (focusParam) {
    // Wait for store to populate
    setTimeout(() => {
      const item = store.allComponents.find(c => c.id === focusParam)
      if (item) store.openDetail(item.id)
    }, 200)
  }

  // Legacy: ?sensor={espId}-gpio{gpio} → open detail panel
  const sensorParam = route.query.sensor as string | undefined
  if (sensorParam) {
    const match = sensorParam.match(/^(.+)-gpio(\d+)$/)
    if (match) {
      const syntheticId = `${match[1]}_gpio${match[2]}`
      setTimeout(() => {
        const item = store.allComponents.find(c => c.id === syntheticId)
        if (item) store.openDetail(item.id)
      }, 200)
    }
  }
})

// =============================================================================
// Detail Panel
// =============================================================================
const selectedItem = computed(() =>
  store.selectedDeviceId
    ? store.allComponents.find(c => c.id === store.selectedDeviceId) ?? null
    : null
)

function handleSelect(item: ComponentItem) {
  store.openDetail(item.id)
}

// =============================================================================
// Zone filter toggle
// =============================================================================
function toggleZoneFilter(zone: string) {
  const idx = store.zoneFilter.indexOf(zone)
  if (idx === -1) {
    store.zoneFilter = [...store.zoneFilter, zone]
  } else {
    store.zoneFilter = store.zoneFilter.filter(z => z !== zone)
  }
  store.currentPage = 1
}
</script>

<template>
  <div class="h-full overflow-auto">
    <!-- Header -->
    <div class="inventory-header">
      <div class="inventory-header__title-row">
        <h1 class="inventory-header__title">
          <Package class="w-5 h-5" />
          Komponenten-Inventar
        </h1>
        <div class="inventory-header__actions">
          <EmergencyStopButton />
        </div>
      </div>

      <!-- Search + Filter Bar -->
      <div class="inventory-toolbar">
        <!-- Search -->
        <div class="inventory-search">
          <Search class="inventory-search__icon" />
          <input
            v-model="searchInput"
            class="inventory-search__input"
            type="text"
            placeholder="Suche nach Name, Typ, Zone, Hersteller..."
          />
          <button
            v-if="searchInput"
            class="inventory-search__clear"
            @click="searchInput = ''; store.searchQuery = ''"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Type Filter -->
        <div class="inventory-filter-group">
          <button
            v-for="opt in [
              { value: 'all', label: 'Alle' },
              { value: 'sensor', label: 'Sensoren' },
              { value: 'actuator', label: 'Aktoren' },
            ]"
            :key="opt.value"
            :class="['inventory-chip', { 'inventory-chip--active': store.typeFilter === opt.value }]"
            @click="store.typeFilter = opt.value as 'all' | 'sensor' | 'actuator'; store.currentPage = 1"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Filter Toggle -->
        <button
          :class="['inventory-toolbar__btn', { 'inventory-toolbar__btn--active': showFilters }]"
          @click="showFilters = !showFilters"
        >
          <Filter class="w-4 h-4" />
          <span>Filter</span>
          <span v-if="activeFilterCount > 0" class="inventory-toolbar__badge">{{ activeFilterCount }}</span>
        </button>

        <!-- Column Selector -->
        <div class="inventory-col-selector">
          <button
            class="inventory-toolbar__btn"
            @click="showColumnSelector = !showColumnSelector"
          >
            <Columns class="w-4 h-4" />
            <span>Spalten</span>
          </button>
          <Transition name="fade">
            <div v-if="showColumnSelector" class="inventory-col-dropdown">
              <label
                v-for="col in INVENTORY_COLUMNS"
                :key="col.key"
                class="inventory-col-dropdown__item"
              >
                <input
                  type="checkbox"
                  :checked="store.visibleColumns.includes(col.key)"
                  @change="store.toggleColumn(col.key)"
                />
                <span>{{ col.label }}</span>
              </label>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Expanded Filters -->
      <Transition name="slide">
        <div v-if="showFilters" class="inventory-filters">
          <!-- Zone Filter -->
          <div class="inventory-filters__group">
            <label class="inventory-filters__label">Zone</label>
            <div class="inventory-filters__chips">
              <button
                v-for="zone in store.availableZones"
                :key="zone"
                :class="['inventory-chip', { 'inventory-chip--active': store.zoneFilter.includes(zone) }]"
                @click="toggleZoneFilter(zone)"
              >
                {{ zone }}
              </button>
            </div>
          </div>

          <!-- Status Filter -->
          <div class="inventory-filters__group">
            <label class="inventory-filters__label">Status</label>
            <div class="inventory-filters__chips">
              <button
                v-for="opt in [
                  { value: 'all', label: 'Alle' },
                  { value: 'online', label: 'Online' },
                  { value: 'offline', label: 'Offline' },
                  { value: 'maintenance_due', label: 'Wartung fällig' },
                ]"
                :key="opt.value"
                :class="['inventory-chip', { 'inventory-chip--active': store.statusFilter === opt.value }]"
                @click="store.statusFilter = opt.value as 'all' | 'online' | 'offline' | 'maintenance_due'; store.currentPage = 1"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Clear -->
          <div v-if="activeFilterCount > 0" class="inventory-filters__clear">
            <button class="btn-ghost text-sm" @click="store.resetFilters(); showFilters = false">
              <X class="w-4 h-4 mr-1" />
              Alle Filter zurücksetzen
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Summary Bar -->
    <div class="inventory-summary">
      <span>{{ store.totalCount }} Komponenten</span>
      <span v-if="store.searchQuery || activeFilterCount > 0" class="text-dark-400">
        (gefiltert aus {{ store.allComponents.length }})
      </span>
    </div>

    <!-- Table -->
    <InventoryTable @select="handleSelect" />

    <!-- Detail SlideOver -->
    <SlideOver
      :open="store.isDetailOpen"
      :title="selectedItem?.name || 'Details'"
      width="lg"
      @close="store.closeDetail()"
    >
      <DeviceDetailPanel
        v-if="selectedItem"
        :item="selectedItem"
      />
    </SlideOver>
  </div>
</template>

<style scoped>
/* Header */
.inventory-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.inventory-header__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.inventory-header__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

.inventory-header__actions {
  display: flex;
  gap: var(--space-2);
}

/* Toolbar */
.inventory-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.inventory-search {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.inventory-search__icon {
  position: absolute;
  left: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.inventory-search__input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  padding-left: calc(var(--space-3) + 20px);
  padding-right: calc(var(--space-3) + 20px);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.inventory-search__input:focus {
  border-color: var(--color-accent);
}

.inventory-search__input::placeholder {
  color: var(--color-text-muted);
}

.inventory-search__clear {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
}

.inventory-search__clear:hover {
  color: var(--color-text-primary);
}

/* Filter group (type chips inline) */
.inventory-filter-group {
  display: flex;
  gap: var(--space-1);
}

/* Toolbar buttons */
.inventory-toolbar__btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.inventory-toolbar__btn:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}

.inventory-toolbar__btn--active {
  border-color: var(--color-accent);
  color: var(--color-accent-bright);
}

.inventory-toolbar__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9999px;
  background: var(--color-accent);
  color: white;
  font-size: 10px;
  font-weight: 600;
}

/* Column Selector Dropdown */
.inventory-col-selector {
  position: relative;
}

.inventory-col-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 20;
  margin-top: var(--space-1);
  padding: var(--space-2);
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-floating);
  min-width: 180px;
}

.inventory-col-dropdown__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.inventory-col-dropdown__item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.inventory-col-dropdown__item input[type="checkbox"] {
  accent-color: var(--color-accent);
}

/* Chip */
.inventory-chip {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.inventory-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-text-secondary);
}

.inventory-chip--active {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.4);
  color: var(--color-iridescent-3);
}

/* Expanded Filters */
.inventory-filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

.inventory-filters__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.inventory-filters__label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.inventory-filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.inventory-filters__clear {
  padding-top: var(--space-2);
  border-top: 1px solid var(--glass-border);
}

/* Summary */
.inventory-summary {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* Transitions */
.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-enter-from, .slide-leave-to {
  opacity: 0;
  max-height: 0;
}
.slide-enter-to, .slide-leave-from {
  max-height: 500px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
