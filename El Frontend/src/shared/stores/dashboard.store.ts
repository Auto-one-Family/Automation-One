/**
 * Dashboard Store
 *
 * Bridge between HardwareView (data producer) and TopBar (UI consumer).
 * HardwareView writes counts, breadcrumb, and reads filter state.
 * TopBar reads counts/breadcrumb and writes filter changes.
 *
 * Extended with Custom Dashboard Layout management (Phase 2).
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type StatusFilter = 'online' | 'offline' | 'warning' | 'safemode'
export type TypeFilter = 'all' | 'mock' | 'real'

/** Widget type identifiers */
export type WidgetType = 'line-chart' | 'gauge' | 'sensor-card' |
  'historical' | 'actuator-card' | 'actuator-runtime' |
  'esp-health' | 'alarm-list'

/** Single widget configuration */
export interface DashboardWidget {
  id: string
  type: WidgetType
  x: number
  y: number
  w: number
  h: number
  config: {
    sensorId?: string
    actuatorId?: string
    espId?: string
    gpio?: number
    sensorType?: string
    zoneId?: string
    timeRange?: '1h' | '6h' | '24h' | '7d' | 'custom'
    showThresholds?: boolean
    title?: string
    color?: string
    syncTimeAxis?: boolean
  }
}

/** Dashboard layout */
export interface DashboardLayout {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  widgets: DashboardWidget[]
}

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

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOM DASHBOARD LAYOUTS (Phase 2)
  // ═══════════════════════════════════════════════════════════════════════════

  const STORAGE_KEY = 'automation-one-dashboard-layouts'

  /** All saved layouts */
  const layouts = ref<DashboardLayout[]>([])
  /** Currently active layout ID */
  const activeLayoutId = ref<string | null>(null)

  /** Currently active layout */
  const activeLayout = computed<DashboardLayout | null>(() =>
    layouts.value.find(l => l.id === activeLayoutId.value) ?? null
  )

  /** Load layouts from localStorage */
  function loadLayouts() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        layouts.value = JSON.parse(stored)
        if (layouts.value.length > 0 && !activeLayoutId.value) {
          activeLayoutId.value = layouts.value[0].id
        }
      }
    } catch {
      layouts.value = []
    }
  }

  /** Persist layouts to localStorage */
  function persistLayouts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts.value))
    } catch {
      // localStorage full or unavailable
    }
  }

  /** Create a new dashboard layout */
  function createLayout(name: string, description?: string): DashboardLayout {
    const layout: DashboardLayout = {
      id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      widgets: [],
    }
    layouts.value.push(layout)
    activeLayoutId.value = layout.id
    persistLayouts()
    return layout
  }

  /** Save current layout widgets */
  function saveLayout(layoutId: string, widgets: DashboardWidget[]) {
    const idx = layouts.value.findIndex(l => l.id === layoutId)
    if (idx === -1) return
    layouts.value[idx] = {
      ...layouts.value[idx],
      widgets,
      updatedAt: new Date().toISOString(),
    }
    persistLayouts()
  }

  /** Delete a layout */
  function deleteLayout(layoutId: string) {
    layouts.value = layouts.value.filter(l => l.id !== layoutId)
    if (activeLayoutId.value === layoutId) {
      activeLayoutId.value = layouts.value[0]?.id ?? null
    }
    persistLayouts()
  }

  /** Export layout as JSON string */
  function exportLayout(layoutId: string): string | null {
    const layout = layouts.value.find(l => l.id === layoutId)
    if (!layout) return null
    return JSON.stringify(layout, null, 2)
  }

  /** Import layout from JSON string */
  function importLayout(json: string): DashboardLayout | null {
    try {
      const layout = JSON.parse(json) as DashboardLayout
      layout.id = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      layout.createdAt = new Date().toISOString()
      layout.updatedAt = new Date().toISOString()
      layouts.value.push(layout)
      persistLayouts()
      return layout
    } catch {
      return null
    }
  }

  // Auto-load on store creation
  loadLayouts()

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

    // Custom Dashboard Layout (Phase 2)
    layouts,
    activeLayoutId,
    activeLayout,
    loadLayouts,
    createLayout,
    saveLayout,
    deleteLayout,
    exportLayout,
    importLayout,
  }
})
