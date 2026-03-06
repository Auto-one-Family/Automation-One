<script setup lang="ts">
defineOptions({ name: 'CustomDashboardView' })

/**
 * CustomDashboardView — Dashboard Builder with GridStack.js
 *
 * Route: /editor, /editor/:dashboardId
 *
 * Features:
 * - GridStack.js 12-column layout grid
 * - Widget catalog sidebar (drag to add)
 * - Widget configuration inline
 * - Layout save/load from localStorage
 * - Multiple named layouts
 */

import { ref, watch, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, computed } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { GridStack, type GridItemHTMLElement, type GridStackNode } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import {
  LayoutGrid, Plus, Trash2, Download, Upload,
  ChevronDown, Pencil, Eye, MonitorPlay, MapPin,
} from 'lucide-vue-next'
import { useDashboardStore, type WidgetType } from '@/shared/stores/dashboard.store'
import { useUiStore } from '@/shared/stores'
import { useDragStateStore } from '@/shared/stores/dragState.store'
import { useToast } from '@/composables/useToast'
import { useDashboardWidgets } from '@/composables/useDashboardWidgets'
import { useEspStore } from '@/stores/esp'
import ViewTabBar from '@/components/common/ViewTabBar.vue'
import WidgetConfigPanel from '@/components/dashboard-widgets/WidgetConfigPanel.vue'

const route = useRoute()
const dashStore = useDashboardStore()
const uiStore = useUiStore()
const espStore = useEspStore()
const dragStore = useDragStateStore()
const toast = useToast()

// Widget Config Panel state (declared early — referenced by composable callbacks)
const configPanelOpen = ref(false)
const configWidgetId = ref('')
const configWidgetType = ref('')

// Shared widget rendering via composable
const {
  WIDGET_TYPE_META: widgetTypes,
  WIDGET_DEFAULT_CONFIGS,
  createWidgetElement,
  mountWidgetToElement: mountWidgetComponent,
  unmountWidgetFromElement,
  cleanupAllWidgets,
} = useDashboardWidgets({
  showConfigButton: true,
  onConfigClick: (widgetId, widgetType) => {
    configWidgetId.value = widgetId
    configWidgetType.value = widgetType
    configPanelOpen.value = true
  },
  onConfigUpdate: (widgetId, newConfig) => {
    const existing = widgetConfigs.value.get(widgetId) || {}
    widgetConfigs.value.set(widgetId, { ...existing, ...newConfig })
    autoSave()
  },
})

// GridStack instance
let grid: GridStack | null = null
const gridContainer = ref<HTMLElement | null>(null)

// UI State
const showCatalog = ref(false)
const showLayoutDropdown = ref(false)
const newLayoutName = ref('')
const isEditing = ref(false)
const layoutSelectorRef = ref<HTMLElement | null>(null)

// Guard: prevents autoSave during loadWidgetsToGrid (race condition with grid.on('removed'))
let isLoadingWidgets = false

// Close layout dropdown on outside click
onClickOutside(layoutSelectorRef, () => {
  showLayoutDropdown.value = false
})

// Target configurator (progressive disclosure)
const showTargetConfig = ref(false)

const activeTarget = computed(() => dashStore.activeLayout?.target ?? null)

function setTarget(view: 'monitor' | 'hardware', placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel') {
  const layoutId = dashStore.activeLayoutId
  if (!layoutId) return
  dashStore.setLayoutTarget(layoutId, { view, placement })
  showTargetConfig.value = false
}

function clearTarget() {
  const layoutId = dashStore.activeLayoutId
  if (!layoutId) return
  dashStore.setLayoutTarget(layoutId, null)
  showTargetConfig.value = false
}

/** Find which dashboard currently holds a target slot (for conflict hint) */
function targetSlotHolder(view: string, placement: string): string | null {
  const currentId = dashStore.activeLayoutId
  const holder = dashStore.layouts.find(l =>
    l.id !== currentId &&
    l.target?.view === view &&
    l.target?.placement === placement
  )
  return holder?.name ?? null
}

// Monitor route for "Im Monitor anzeigen" button (based on layout scope)
const monitorRouteForLayout = computed(() => {
  const layout = dashStore.activeLayout
  if (!layout?.scope) return null

  if (layout.scope === 'zone' && layout.zoneId) {
    return {
      name: 'monitor-zone-dashboard',
      params: { zoneId: layout.zoneId, dashboardId: layout.id },
    }
  }
  if (layout.scope === 'cross-zone') {
    return {
      name: 'monitor-dashboard',
      params: { dashboardId: layout.id },
    }
  }
  if (layout.scope === 'sensor-detail' && layout.sensorId && layout.zoneId) {
    return {
      name: 'monitor-sensor',
      params: { zoneId: layout.zoneId, sensorId: layout.sensorId },
    }
  }
  return null
})

const groupedWidgets = computed(() => {
  const groups: Record<string, typeof widgetTypes> = {}
  for (const w of widgetTypes) {
    if (!groups[w.category]) groups[w.category] = []
    groups[w.category].push(w)
  }
  return groups
})

// =============================================================================
// GridStack Initialization
// =============================================================================

/**
 * Initialize GridStack on the container element.
 * Extracted into a separate function so it can be called both from onMounted
 * and from the watch on activeLayoutId (GridStack re-init after layout creation).
 */
function initGrid() {
  if (!gridContainer.value || grid) return

  grid = GridStack.init({
    column: 12,
    cellHeight: 80,
    margin: 8,
    float: true,
    animate: true,
    removable: true,
    acceptWidgets: true,
    handle: '.dashboard-widget__header',
  }, gridContainer.value)

  // Load active layout
  if (dashStore.activeLayout) {
    loadWidgetsToGrid(dashStore.activeLayout.widgets)
  }

  // Auto-save on change
  grid.on('change', () => {
    autoSave()
  })

  grid.on('removed', (_event: Event, items: GridStackNode[]) => {
    // Unmount Vue components of removed widgets to prevent memory leaks
    for (const item of items) {
      if (item.id) {
        unmountWidgetFromElement(item.id)
      }
    }
    autoSave()
  })

  // Handle external widget drops from FAB QuickWidgetPanel (HTML5 DnD)
  grid.on('dropped', (_event: Event, _previousNode: GridStackNode, newNode: GridStackNode) => {
    if (!newNode.el || !isEditing.value) return

    const payload = dragStore.dashboardWidgetPayload
    if (!payload) return

    // Remove GridStack's auto-created placeholder — reuse addWidget() for robust mounting
    grid!.removeWidget(newNode.el, true, false)
    addWidget(payload.widgetType)

    dragStore.endDrag()
  })

  // Apply edit mode state after init (default: view mode = locked)
  if (!isEditing.value) {
    grid.enableMove(false)
    grid.enableResize(false)
    grid.opts.removable = false
  }
}

/** Toggle between edit and view mode */
function toggleEditMode() {
  isEditing.value = !isEditing.value
  if (!grid) return

  if (isEditing.value) {
    grid.enableMove(true)
    grid.enableResize(true)
    grid.opts.removable = true
    showCatalog.value = true
  } else {
    grid.enableMove(false)
    grid.enableResize(false)
    grid.opts.removable = false
    showCatalog.value = false
    configPanelOpen.value = false
  }
}

// Re-initialize GridStack when a layout is created or switched.
// When no layout exists at mount time, the grid div is hidden (v-if).
// After creating a layout, the div appears but GridStack was never initialized.
watch(() => dashStore.activeLayoutId, (newId) => {
  if (newId && !grid) {
    nextTick(() => {
      initGrid()
    })
  }
})

/** Handle keyboard widget placement from FAB (Space/Enter on widget chip) */
function handleWidgetPlaceAnnounced(e: Event): void {
  const detail = (e as CustomEvent).detail
  if (detail?.type && isEditing.value) {
    addWidget(detail.type)
  }
}

onMounted(() => {
  // Ensure ESP data is loaded for widgets
  if (espStore.devices.length === 0) {
    espStore.fetchAll()
  }

  // Fetch dashboards from server (merges with localStorage cache)
  dashStore.fetchLayouts()

  // Deep-link: open dashboard from URL param /editor/:dashboardId
  const dashboardIdFromUrl = route.params.dashboardId as string | undefined
  if (dashboardIdFromUrl) {
    const layout = dashStore.getLayoutById(dashboardIdFromUrl)
    if (layout) {
      dashStore.activeLayoutId = layout.id
      dashStore.breadcrumb.dashboardName = layout.name
    }
  }
  // Also support legacy ?layout= query param (from MonitorView cross-links)
  const layoutFromQuery = route.query.layout as string | undefined
  if (layoutFromQuery && !dashboardIdFromUrl) {
    const layout = dashStore.getLayoutById(layoutFromQuery)
    if (layout) {
      dashStore.activeLayoutId = layout.id
      dashStore.breadcrumb.dashboardName = layout.name
    }
  }

  // Listen for keyboard-placed widgets from FAB
  window.addEventListener('widget-place-announced', handleWidgetPlaceAnnounced)

  nextTick(() => {
    initGrid()
  })
})

onUnmounted(() => {
  window.removeEventListener('widget-place-announced', handleWidgetPlaceAnnounced)

  // Cleanup all mounted Vue vnodes
  cleanupAllWidgets()

  if (grid) {
    grid.destroy(false)
    grid = null
  }

  // Clear breadcrumb
  dashStore.breadcrumb.dashboardName = ''
})

// keep-alive lifecycle: Preserve GridStack state across tab switches
onActivated(() => {
  // Re-init grid if it was destroyed during deactivation
  if (!grid) {
    nextTick(() => initGrid())
  }
  // Restore breadcrumb
  const layout = dashStore.activeLayout
  if (layout) {
    dashStore.breadcrumb.dashboardName = layout.name
  }
})

onDeactivated(() => {
  // Clear breadcrumb while hidden (other views may set their own)
  dashStore.breadcrumb.dashboardName = ''
})

// Widget config cache (stored per widget ID)
const widgetConfigs = ref<Map<string, Record<string, any>>>(new Map())

function loadWidgetsToGrid(widgets: any[]) {
  if (!grid) return

  // Guard: prevent autoSave from firing during removeAll/addWidget cycle
  isLoadingWidgets = true

  // Cleanup existing mounted widgets
  cleanupAllWidgets()

  grid.removeAll(true)

  const mountOps: Array<() => void> = []

  for (const w of widgets) {
    const mountId = `widget-mount-${w.id}`
    if (w.config) {
      widgetConfigs.value.set(w.id, w.config)
    }
    const widgetDef = widgetTypes.find(t => t.type === w.type)
    const itemEl = grid.addWidget({
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      minW: widgetDef?.minW,
      minH: widgetDef?.minH,
      id: w.id,
    })

    // Collect mount operations to run in a single nextTick
    mountOps.push(() => {
      const contentDiv = itemEl.querySelector('.grid-stack-item-content')
      contentDiv?.appendChild(createWidgetElement(w.type, w.config?.title || w.type, w.id, mountId))
      mountWidgetComponent(w.id, mountId, w.type, w.config || {})
    })
  }

  // Release guard AFTER all Vue mount operations complete
  nextTick(() => {
    for (const op of mountOps) op()
    isLoadingWidgets = false
  })
}

// =============================================================================
// Widget Actions
// =============================================================================

function addWidget(type: string) {
  if (!grid) {
    toast.warning('Erstelle zuerst ein Dashboard')
    return
  }

  const widgetDef = widgetTypes.find(w => w.type === type)
  if (!widgetDef) return

  const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const mountId = `widget-mount-${id}`
  const config = { title: widgetDef.label, ...WIDGET_DEFAULT_CONFIGS[type] }
  widgetConfigs.value.set(id, config)

  const itemEl = grid.addWidget({
    w: widgetDef.w,
    h: widgetDef.h,
    minW: widgetDef.minW,
    minH: widgetDef.minH,
    id,
  })

  // Inject widget DOM and mount Vue component after GridStack has created the cell
  nextTick(() => {
    const contentDiv = itemEl.querySelector('.grid-stack-item-content')
    contentDiv?.appendChild(createWidgetElement(type, widgetDef.label, id, mountId))
    mountWidgetComponent(id, mountId, type, config)
  })

  autoSave()
}

/** Handle config update from config panel — re-mounts the Vue component with new props */
function handleConfigUpdate(newConfig: Record<string, any>) {
  const widgetId = configWidgetId.value
  if (!widgetId) return

  widgetConfigs.value.set(widgetId, newConfig)

  // Re-mount the widget component with updated config
  const mountId = `widget-mount-${widgetId}`
  unmountWidgetFromElement(widgetId)
  mountWidgetComponent(widgetId, mountId, configWidgetType.value, newConfig)

  // Update the header title
  const widgetEl = document.querySelector(`[data-widget-id="${widgetId}"]`)
  if (widgetEl && newConfig.title) {
    const titleEl = widgetEl.querySelector('.dashboard-widget__title')
    if (titleEl) titleEl.textContent = newConfig.title
  }

  autoSave()
}

function autoSave() {
  if (!grid || !dashStore.activeLayoutId || isLoadingWidgets) return

  const items = grid.getGridItems()
  const widgets = items.map((el: GridItemHTMLElement) => {
    const node = el.gridstackNode
    const widgetEl = el.querySelector('.dashboard-widget')
    const widgetId = widgetEl?.getAttribute('data-widget-id') || node?.id || ''
    return {
      id: widgetId,
      type: (widgetEl?.getAttribute('data-type') || 'line-chart') as WidgetType,
      x: node?.x || 0,
      y: node?.y || 0,
      w: node?.w || 3,
      h: node?.h || 2,
      config: widgetConfigs.value.get(widgetId) || {},
    }
  })

  dashStore.saveLayout(dashStore.activeLayoutId, widgets)
}

// =============================================================================
// Layout Management
// =============================================================================

function handleCreateLayout() {
  const name = newLayoutName.value.trim()
  if (!name) return

  dashStore.createLayout(name)
  newLayoutName.value = ''
  showLayoutDropdown.value = false

  // Clear grid (guard against autoSave race)
  if (grid) {
    isLoadingWidgets = true
    grid.removeAll(true)
    isLoadingWidgets = false
  }
  toast.success(`Dashboard "${name}" erstellt`)
}

function handleCreateFromTemplate(templateId: string) {
  const layout = dashStore.createLayoutFromTemplate(templateId)
  if (!layout) return
  showLayoutDropdown.value = false

  // Load template widgets into grid
  nextTick(() => {
    if (!grid) {
      initGrid()
    } else {
      loadWidgetsToGrid(layout.widgets)
    }
  })
  toast.success(`Dashboard "${layout.name}" aus Vorlage erstellt`)
}

function switchLayout(layoutId: string) {
  dashStore.activeLayoutId = layoutId
  const layout = dashStore.layouts.find(l => l.id === layoutId)
  if (layout) {
    dashStore.breadcrumb.dashboardName = layout.name
    if (grid) {
      loadWidgetsToGrid(layout.widgets)
    }
  }
  showLayoutDropdown.value = false
}

async function handleDeleteLayout() {
  if (!dashStore.activeLayoutId) return
  const name = dashStore.activeLayout?.name
  const confirmed = await uiStore.confirm({
    title: 'Dashboard löschen',
    message: `Dashboard "${name}" wirklich löschen?`,
    variant: 'danger',
    confirmText: 'Löschen',
  })
  if (!confirmed) return
  dashStore.deleteLayout(dashStore.activeLayoutId)
  if (grid) {
    isLoadingWidgets = true
    grid.removeAll(true)
    isLoadingWidgets = false
  }
  toast.info(`Dashboard "${name}" gelöscht`)
}

function handleExport() {
  if (!dashStore.activeLayoutId) return
  const json = dashStore.exportLayout(dashStore.activeLayoutId)
  if (!json) return

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dashboard-${dashStore.activeLayout?.name || 'export'}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Dashboard exportiert')
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const json = await file.text()
    const layout = dashStore.importLayout(json)
    if (layout) {
      toast.success(`Dashboard "${layout.name}" importiert`)
      switchLayout(layout.id)
    } else {
      toast.error('Import fehlgeschlagen')
    }
  }
  input.click()
}
</script>

<template>
  <div class="dashboard-builder">
    <!-- View Tab Bar (Hardware / Monitor / Dashboard) -->
    <ViewTabBar />

    <!-- Toolbar -->
    <div class="dashboard-builder__toolbar">
      <div class="dashboard-builder__toolbar-left">
        <LayoutGrid class="w-5 h-5" style="color: var(--color-accent-bright)" />
        <h2 class="dashboard-builder__title">Dashboard Builder</h2>

        <!-- Layout Selector -->
        <div ref="layoutSelectorRef" class="dashboard-builder__layout-selector">
          <button class="dashboard-builder__layout-btn" @click="showLayoutDropdown = !showLayoutDropdown">
            <span>{{ dashStore.activeLayout?.name || 'Kein Dashboard' }}</span>
            <ChevronDown class="w-3 h-3" />
          </button>

          <div v-if="showLayoutDropdown" class="dashboard-builder__layout-dropdown">
            <div
              v-for="layout in dashStore.layouts"
              :key="layout.id"
              :class="['dashboard-builder__layout-item', { 'dashboard-builder__layout-item--active': layout.id === dashStore.activeLayoutId }]"
              @click="switchLayout(layout.id)"
            >
              {{ layout.name }}
            </div>
            <div class="dashboard-builder__layout-divider" />
            <!-- Templates -->
            <div class="dashboard-builder__template-section">
              <div class="dashboard-builder__template-title">Vorlagen</div>
              <button
                v-for="(tpl, tplId) in dashStore.DASHBOARD_TEMPLATES"
                :key="tplId"
                class="dashboard-builder__template-btn"
                @click="handleCreateFromTemplate(tplId as string)"
              >
                <span class="dashboard-builder__template-name">{{ tpl.name }}</span>
                <span class="dashboard-builder__template-desc">{{ tpl.description }}</span>
              </button>
            </div>
            <div class="dashboard-builder__layout-divider" />
            <div class="dashboard-builder__layout-create">
              <input
                v-model="newLayoutName"
                type="text"
                placeholder="Neues Dashboard..."
                class="dashboard-builder__layout-input"
                @keydown.enter="handleCreateLayout"
              />
              <button class="dashboard-builder__layout-create-btn" @click="handleCreateLayout">
                <Plus class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-builder__toolbar-right">
        <!-- "Im Monitor anzeigen" link (only if dashboard has a scope) -->
        <router-link
          v-if="monitorRouteForLayout"
          :to="monitorRouteForLayout"
          class="dashboard-builder__tool-btn dashboard-builder__tool-btn--monitor"
          title="Im Monitor anzeigen"
        >
          <MonitorPlay class="w-4 h-4" />
        </router-link>

        <!-- Target Configurator (progressive disclosure) -->
        <div v-if="dashStore.activeLayoutId && isEditing" class="dashboard-builder__target-wrapper">
          <button
            :class="['dashboard-builder__tool-btn', { 'dashboard-builder__tool-btn--active': activeTarget }]"
            title="Anzeigeort festlegen"
            @click="showTargetConfig = !showTargetConfig"
          >
            <MapPin class="w-4 h-4" />
          </button>
          <div v-if="showTargetConfig" class="dashboard-builder__target-dropdown">
            <div class="dashboard-builder__target-title">Anzeigeort</div>
            <div class="dashboard-builder__target-hint">Wo soll dieses Dashboard eingebettet werden?</div>
            <button
              :class="['dashboard-builder__target-option', { 'dashboard-builder__target-option--selected': activeTarget?.view === 'monitor' && activeTarget?.placement === 'inline' }]"
              @click="setTarget('monitor', 'inline')"
            >
              <span class="dashboard-builder__target-label">Monitor — Inline</span>
              <span class="dashboard-builder__target-desc">Unter den Zone-Kacheln im Monitor</span>
              <span v-if="targetSlotHolder('monitor', 'inline')" class="dashboard-builder__target-conflict">
                Belegt von: {{ targetSlotHolder('monitor', 'inline') }} — wird übernommen
              </span>
            </button>
            <button
              :class="['dashboard-builder__target-option', { 'dashboard-builder__target-option--selected': activeTarget?.view === 'monitor' && activeTarget?.placement === 'side-panel' }]"
              @click="setTarget('monitor', 'side-panel')"
            >
              <span class="dashboard-builder__target-label">Monitor — Seitenpanel</span>
              <span class="dashboard-builder__target-desc">Fixiert rechts neben dem Monitor-Inhalt</span>
              <span v-if="targetSlotHolder('monitor', 'side-panel')" class="dashboard-builder__target-conflict">
                Belegt von: {{ targetSlotHolder('monitor', 'side-panel') }} — wird übernommen
              </span>
            </button>
            <button
              :class="['dashboard-builder__target-option', { 'dashboard-builder__target-option--selected': activeTarget?.view === 'monitor' && activeTarget?.placement === 'bottom-panel' }]"
              @click="setTarget('monitor', 'bottom-panel')"
            >
              <span class="dashboard-builder__target-label">Monitor — Unteres Panel</span>
              <span class="dashboard-builder__target-desc">Unter dem Hauptinhalt im Monitor</span>
              <span v-if="targetSlotHolder('monitor', 'bottom-panel')" class="dashboard-builder__target-conflict">
                Belegt von: {{ targetSlotHolder('monitor', 'bottom-panel') }} — wird übernommen
              </span>
            </button>
            <button
              :class="['dashboard-builder__target-option', { 'dashboard-builder__target-option--selected': activeTarget?.view === 'hardware' && activeTarget?.placement === 'inline' }]"
              @click="setTarget('hardware', 'inline')"
            >
              <span class="dashboard-builder__target-label">Übersicht — Seitenpanel</span>
              <span class="dashboard-builder__target-desc">Fixiert rechts in der Hardware-Übersicht</span>
              <span v-if="targetSlotHolder('hardware', 'inline')" class="dashboard-builder__target-conflict">
                Belegt von: {{ targetSlotHolder('hardware', 'inline') }} — wird übernommen
              </span>
            </button>
            <button v-if="activeTarget" class="dashboard-builder__target-option dashboard-builder__target-option--clear" @click="clearTarget">
              <span class="dashboard-builder__target-label">Anzeigeort entfernen</span>
            </button>
          </div>
        </div>

        <button
          v-if="dashStore.activeLayoutId"
          :class="['dashboard-builder__tool-btn', { 'dashboard-builder__tool-btn--active': isEditing }]"
          :title="isEditing ? 'Ansichtsmodus' : 'Bearbeiten'"
          @click="toggleEditMode"
        >
          <Pencil v-if="isEditing" class="w-4 h-4" />
          <Eye v-else class="w-4 h-4" />
        </button>
        <button v-if="isEditing" class="dashboard-builder__tool-btn" title="Katalog" @click="showCatalog = !showCatalog">
          <Plus class="w-4 h-4" />
        </button>
        <button class="dashboard-builder__tool-btn" title="Exportieren" @click="handleExport">
          <Download class="w-4 h-4" />
        </button>
        <button v-if="isEditing" class="dashboard-builder__tool-btn" title="Importieren" @click="handleImport">
          <Upload class="w-4 h-4" />
        </button>
        <button
          v-if="dashStore.activeLayoutId && isEditing"
          class="dashboard-builder__tool-btn dashboard-builder__tool-btn--danger"
          title="Dashboard löschen"
          @click="handleDeleteLayout"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="dashboard-builder__content">
      <!-- Widget Catalog Sidebar (only in edit mode) -->
      <aside v-if="showCatalog && isEditing" class="dashboard-builder__catalog">
        <h3 class="dashboard-builder__catalog-title">Widget-Katalog</h3>
        <p v-if="!dashStore.activeLayoutId" class="dashboard-builder__catalog-hint">
          Erstelle zuerst ein Dashboard
        </p>
        <div v-for="(widgets, category) in groupedWidgets" :key="category" class="dashboard-builder__catalog-group">
          <div class="dashboard-builder__catalog-group-title">{{ category }}</div>
          <button
            v-for="widget in widgets"
            :key="widget.type"
            class="dashboard-builder__catalog-item"
            :disabled="!dashStore.activeLayoutId || !isEditing"
            @click="addWidget(widget.type)"
          >
            <component :is="widget.icon" class="w-4 h-4 flex-shrink-0" />
            <div class="dashboard-builder__catalog-item-text">
              <span>{{ widget.label }}</span>
              <span class="dashboard-builder__catalog-item-desc">{{ widget.description }}</span>
            </div>
          </button>
        </div>
      </aside>

      <!-- Grid Area -->
      <div class="dashboard-builder__grid-area">
        <div v-if="!dashStore.activeLayoutId" class="dashboard-builder__no-layout">
          <LayoutGrid class="w-12 h-12" style="color: var(--color-text-muted); opacity: 0.3" />
          <p>Erstelle ein neues Dashboard oder wähle ein bestehendes aus.</p>
        </div>

        <div
          v-else
          ref="gridContainer"
          :class="[
            'grid-stack',
            { 'grid-stack--editing': isEditing },
            { 'grid-stack--drop-target': isEditing && dragStore.isDraggingDashboardWidget },
          ]"
        />
      </div>
    </div>
    <!-- Widget Config Panel (SlideOver) -->
    <WidgetConfigPanel
      :open="configPanelOpen"
      :widget-id="configWidgetId"
      :widget-type="configWidgetType"
      :config="widgetConfigs.get(configWidgetId) || {}"
      @close="configPanelOpen = false"
      @update:config="handleConfigUpdate"
    />
  </div>
</template>

<style scoped>
.dashboard-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: calc(100vh - var(--header-height) - 2rem);
}

/* Toolbar */
.dashboard-builder__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.dashboard-builder__toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.dashboard-builder__toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.dashboard-builder__title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

/* Layout Selector */
.dashboard-builder__layout-selector {
  position: relative;
}

.dashboard-builder__layout-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
}

.dashboard-builder__layout-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: var(--space-1);
  min-width: 200px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-floating);
  z-index: var(--z-dropdown);
  padding: var(--space-1);
}

.dashboard-builder__layout-item {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.dashboard-builder__layout-item:hover { background: var(--glass-bg-light); color: var(--color-text-primary); }
.dashboard-builder__layout-item--active { color: var(--color-accent-bright); background: rgba(59, 130, 246, 0.06); }

.dashboard-builder__layout-divider {
  height: 1px;
  background: var(--glass-border);
  margin: var(--space-1) 0;
}

.dashboard-builder__template-section {
  padding: var(--space-1);
}

.dashboard-builder__template-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin-bottom: var(--space-1);
  padding: 0 var(--space-2);
}

.dashboard-builder__template-btn {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--space-2) var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
}

.dashboard-builder__template-btn:hover {
  background: var(--glass-bg-light);
}

.dashboard-builder__template-name {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.dashboard-builder__template-btn:hover .dashboard-builder__template-name {
  color: var(--color-text-primary);
}

.dashboard-builder__template-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.3;
}

.dashboard-builder__layout-create {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
}

.dashboard-builder__layout-input {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
}

.dashboard-builder__layout-create-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  cursor: pointer;
}

/* Tool Buttons */
.dashboard-builder__tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.dashboard-builder__tool-btn:hover { background: var(--glass-bg-light); color: var(--color-text-primary); }
.dashboard-builder__tool-btn--active { color: var(--color-accent); background: rgba(59, 130, 246, 0.08); }
.dashboard-builder__tool-btn--danger:hover { color: var(--color-status-alarm); }

/* Target Configurator Dropdown */
.dashboard-builder__target-wrapper {
  position: relative;
}

.dashboard-builder__target-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-dropdown, 50);
  min-width: 260px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-floating, 0 8px 32px rgba(0, 0, 0, 0.4));
  padding: var(--space-2) 0;
  animation: animate-fade-in 0.15s ease-out;
}

.dashboard-builder__target-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  padding: var(--space-1) var(--space-3);
}

.dashboard-builder__target-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: 0 var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: var(--space-1);
}

.dashboard-builder__target-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.dashboard-builder__target-option:hover {
  background: var(--glass-bg-light, rgba(255, 255, 255, 0.04));
}

.dashboard-builder__target-option--selected {
  background: rgba(59, 130, 246, 0.08);
}

.dashboard-builder__target-option--selected .dashboard-builder__target-label {
  color: var(--color-accent);
}

.dashboard-builder__target-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

.dashboard-builder__target-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.dashboard-builder__target-option--clear {
  border-top: 1px solid var(--glass-border);
  margin-top: var(--space-1);
  padding-top: var(--space-2);
}

.dashboard-builder__target-conflict {
  font-size: var(--text-xs);
  color: var(--color-warning, #f59e0b);
  font-style: italic;
}

.dashboard-builder__target-option--clear .dashboard-builder__target-label {
  color: var(--color-text-secondary);
}

.dashboard-builder__target-option--clear:hover .dashboard-builder__target-label {
  color: var(--color-status-alarm);
}

/* Content Area */
.dashboard-builder__content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Widget Catalog */
.dashboard-builder__catalog {
  width: 220px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--glass-border);
  overflow-y: auto;
  padding: var(--space-3);
  flex-shrink: 0;
}

.dashboard-builder__catalog-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin: 0 0 var(--space-3) 0;
}

.dashboard-builder__catalog-group {
  margin-bottom: var(--space-3);
}

.dashboard-builder__catalog-group-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: var(--space-1);
  text-transform: uppercase;
}

.dashboard-builder__catalog-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: 2px;
}

.dashboard-builder__catalog-item-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dashboard-builder__catalog-item-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.3;
}

.dashboard-builder__catalog-item:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
  background: rgba(59, 130, 246, 0.04);
}

.dashboard-builder__catalog-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dashboard-builder__catalog-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: var(--space-2) var(--space-1);
  margin-bottom: var(--space-2);
}

/* Grid Area */
.dashboard-builder__grid-area {
  flex: 1;
  overflow: auto;
  padding: var(--space-4);
  background: var(--color-bg-primary);
}

.dashboard-builder__no-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
}

/* GridStack widget styling */
:deep(.grid-stack) {
  min-height: 400px;
}

:deep(.grid-stack-item-content) {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

:deep(.grid-stack-item-content:hover) {
  border-color: var(--glass-border-hover);
}

:deep(.dashboard-widget) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

:deep(.dashboard-widget__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--glass-border);
  cursor: default;
}

.grid-stack--editing :deep(.dashboard-widget__header) {
  cursor: move;
}

:deep(.dashboard-widget__title) {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

:deep(.dashboard-widget__type) {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-text-muted);
  background: var(--color-bg-quaternary);
  padding: 1px 4px;
  border-radius: 3px;
}

:deep(.dashboard-widget__gear-btn) {
  display: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  opacity: 0;
  margin-left: auto;
}

/* Gear icon only visible in edit mode */
.grid-stack--editing :deep(.dashboard-widget__gear-btn) {
  display: flex;
}

.grid-stack--editing :deep(.dashboard-widget__header:hover .dashboard-widget__gear-btn) {
  opacity: 1;
}

/* Edit mode: dashed outline around widgets */
.grid-stack--editing :deep(.grid-stack-item-content) {
  outline: 1px dashed rgba(96, 165, 250, 0.25);
  outline-offset: -1px;
}

:deep(.dashboard-widget__gear-btn:hover) {
  background: var(--glass-bg-light);
  color: var(--color-text-primary);
}

:deep(.dashboard-widget__vue-mount) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.dashboard-widget__body) {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.dashboard-widget__placeholder) {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  opacity: 0.5;
}

/* GridStack resizing handles */
:deep(.grid-stack-item > .ui-resizable-se) {
  width: 16px;
  height: 16px;
  right: 4px;
  bottom: 4px;
}

/* Drop-zone feedback when dragging widget from FAB */
.grid-stack--drop-target {
  outline: 2px dashed var(--color-accent);
  outline-offset: 4px;
  animation: drop-zone-pulse 1.5s ease-in-out infinite;
}

@keyframes drop-zone-pulse {
  0%, 100% { outline-color: rgba(96, 165, 250, 0.4); }
  50% { outline-color: rgba(96, 165, 250, 0.8); }
}

@media (prefers-reduced-motion: reduce) {
  .grid-stack--drop-target {
    animation: none;
    outline-color: var(--color-accent);
  }
}
</style>
