<script setup lang="ts">
/**
 * EventsTab - Events Tab for System Monitor
 *
 * Features:
 * - Unified event stream (Sensor, Actuator, System, Error events)
 * - Integrated DataSourceSelector with Filter controls
 * - Mobile-responsive design
 *
 * Layout Pattern:
 * - Consistent with ServerLogsTab, DatabaseTab, MqttTrafficTab
 * - One root container with flex-column
 * - Filter section fixed at top (flex-shrink: 0)
 * - Content section scrollable (flex: 1, overflow-y: auto)
 *
 * @see SystemMonitorView.vue - Parent component
 */

import { defineProps, defineEmits } from 'vue'
// No icons needed - status bar removed
import DataSourceSelector from './DataSourceSelector.vue'
import UnifiedEventList from './UnifiedEventList.vue'
import type { UnifiedEvent } from '@/types'
import type { DataSource } from '@/api/audit'

// ============================================================================
// Types
// ============================================================================

type TimeRange = 'all' | '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'

// ============================================================================
// Props
// ============================================================================

interface Props {
  // Event data
  filteredEvents: UnifiedEvent[]
  totalAvailableEvents: number
  hasMoreEvents: boolean
  isLoadingMore: boolean
  isPaused: boolean
  eventTypeLabels: Record<string, string>
  restoredEventIds: Set<string>
  // Filter props (passed to DataSourceSelector)
  filterEspId: string
  filterLevels: Set<string>
  filterTimeRange: TimeRange
  uniqueEspIds: string[]
  // Custom Date Range (for 'custom' timeRange)
  customStartDate?: string
  customEndDate?: string
}

defineProps<Props>()

// ============================================================================
// Emits
// ============================================================================

const emit = defineEmits<{
  // DataSource changes
  'data-sources-change': [sources: DataSource[]]
  // Filter changes (from DataSourceSelector)
  'update:filterEspId': [value: string]
  'update:filterLevels': [value: Set<string>]
  'update:filterTimeRange': [value: TimeRange]
  // Custom Date Range changes
  'update:customStartDate': [value: string | undefined]
  'update:customEndDate': [value: string | undefined]
  // Actions
  'load-more': []
  'select': [event: UnifiedEvent]
}>()

// ============================================================================
// Handlers
// ============================================================================

function handleDataSourcesChange(sources: DataSource[]) {
  emit('data-sources-change', sources)
}

function handleEspIdChange(value: string) {
  emit('update:filterEspId', value)
}

function handleLevelsChange(value: Set<string>) {
  emit('update:filterLevels', value)
}

function handleTimeRangeChange(value: TimeRange) {
  emit('update:filterTimeRange', value)
}

function handleCustomStartDateChange(value: string | undefined) {
  emit('update:customStartDate', value)
}

function handleCustomEndDateChange(value: string | undefined) {
  emit('update:customEndDate', value)
}

function selectEvent(event: UnifiedEvent) {
  emit('select', event)
}

</script>

<template>
  <div class="events-tab">
    <!-- Filter Section (fixed at top) - DataSourceSelector now includes all filters -->
    <div class="events-filters">
      <DataSourceSelector
        :esp-id="filterEspId"
        :levels="filterLevels"
        :time-range="filterTimeRange"
        :unique-esp-ids="uniqueEspIds"
        :custom-start-date="customStartDate"
        :custom-end-date="customEndDate"
        @change="handleDataSourcesChange"
        @update:esp-id="handleEspIdChange"
        @update:levels="handleLevelsChange"
        @update:time-range="handleTimeRangeChange"
        @update:custom-start-date="handleCustomStartDateChange"
        @update:custom-end-date="handleCustomEndDateChange"
      />
    </div>

    <!-- Event List (direkter Scroll-Container) -->
    <div class="events-list">
      <UnifiedEventList
        :events="filteredEvents"
        :is-paused="isPaused"
        :event-type-labels="eventTypeLabels"
        :restored-event-ids="restoredEventIds"
        @select="selectEvent"
      />
    </div>
  </div>
</template>

<style scoped>
/* =============================================================================
   Events Tab - Main Container
   ============================================================================= */
.events-tab {
  display: flex;
  flex-direction: column;
  flex: 1;  /* ⭐ FIX: Nutze flex: 1 statt height: 100% für korrekte Flexbox-Hierarchie */
  overflow: hidden;
  min-height: 0;  /* ⭐ KRITISCH: Erlaubt Flexbox-Children korrekte Höhenberechnung */
}

/* =============================================================================
   Filter Section (fixed at top)
   ============================================================================= */
.events-filters {
  flex-shrink: 0;  /* ⭐ Bleibt oben fixiert, scrollt NICHT mit */
  /* No overflow-y, no height - just auto-size */
}

/* =============================================================================
   Events List (Container für UnifiedEventList)
   ============================================================================= */
.events-list {
  flex: 1;
  overflow: hidden;  /* ⭐ FIX: NICHT auto! UnifiedEventList hat eigenen Scroll-Container */
  min-height: 0;  /* ⭐ KRITISCH: Erlaubt Virtual Scroll Container korrekte Höhenberechnung */
  display: flex;
  flex-direction: column;
  /* KEIN background, KEIN border, KEIN border-radius */
}

</style>
