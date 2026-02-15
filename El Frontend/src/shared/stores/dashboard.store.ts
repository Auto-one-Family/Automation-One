/**
 * Dashboard Store
 *
 * Bridge between DashboardView (data producer) and TopBar (UI consumer).
 * DashboardView writes counts, breadcrumb, and reads filter state.
 * TopBar reads counts/breadcrumb and writes filter changes.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type StatusFilter = 'online' | 'offline' | 'warning' | 'safemode'
export type TypeFilter = 'all' | 'mock' | 'real'

export const useDashboardStore = defineStore('dashboard', () => {
  /* ── Visibility ── */
  const showControls = ref(false)

  /* ── Counts (written by DashboardView) ── */
  const statusCounts = ref({ online: 0, offline: 0, warning: 0, safeMode: 0 })
  const deviceCounts = ref({ all: 0, mock: 0, real: 0 })
  const pendingCount = ref(0)

  /* ── Filters (bidirectional: TopBar writes, DashboardView reads) ── */
  const activeStatusFilters = ref<Set<StatusFilter>>(new Set())
  const filterType = ref<TypeFilter>('all')

  /* ── Breadcrumb (written by DashboardView) ── */
  const breadcrumb = ref<{ level: 1 | 2 | 3; zoneName: string; deviceName: string }>({
    level: 1,
    zoneName: '',
    deviceName: '',
  })

  /* ── Modal/Panel triggers (TopBar writes, DashboardView reads) ── */
  const showCreateMock = ref(false)
  const showPendingPanel = ref(false)

  /* ── Navigation request (TopBar → DashboardView) ── */
  const navRequestCount = ref(0)
  const navTarget = ref<1 | 2 | 3>(1)

  /* ── Computed ── */
  const hasProblems = computed(() =>
    statusCounts.value.warning > 0 || statusCounts.value.safeMode > 0
  )

  const problemMessage = computed(() => {
    const { warning, safeMode, offline, online } = statusCounts.value
    if (warning > 0) return `${warning} Gerät(e) mit Fehlern`
    if (safeMode > 0) return `${safeMode} Gerät(e) im Safe-Mode`
    if (offline > 0 && online > 0) return `${offline} Gerät(e) offline`
    return ''
  })

  const hasPendingDevices = computed(() => pendingCount.value > 0)

  /* ── Actions ── */
  function toggleStatusFilter(filter: StatusFilter) {
    const next = new Set(activeStatusFilters.value)
    if (next.has(filter)) next.delete(filter)
    else next.add(filter)
    activeStatusFilters.value = next
  }

  function resetFilters() {
    filterType.value = 'all'
    activeStatusFilters.value = new Set()
  }

  function activate() {
    showControls.value = true
  }

  function deactivate() {
    showControls.value = false
    resetFilters()
  }

  function requestNavigate(level: 1 | 2 | 3) {
    navTarget.value = level
    navRequestCount.value++
  }

  return {
    showControls,
    statusCounts,
    deviceCounts,
    pendingCount,
    activeStatusFilters,
    filterType,
    breadcrumb,
    showCreateMock,
    showPendingPanel,
    navRequestCount,
    navTarget,
    hasProblems,
    problemMessage,
    hasPendingDevices,
    toggleStatusFilter,
    resetFilters,
    activate,
    deactivate,
    requestNavigate,
  }
})
