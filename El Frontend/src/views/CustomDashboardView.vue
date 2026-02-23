<script setup lang="ts">
/**
 * CustomDashboardView — Dashboard Builder with GridStack.js
 *
 * Route: /custom-dashboard
 *
 * Features:
 * - GridStack.js 12-column layout grid
 * - Widget catalog sidebar (drag to add)
 * - Widget configuration inline
 * - Layout save/load from localStorage
 * - Multiple named layouts
 */

import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { GridStack, type GridItemHTMLElement } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import {
  LayoutGrid, Plus, Trash2, Download, Upload,
  BarChart3, Gauge, Activity, Zap, Bell, Cpu,
  ChevronDown,
} from 'lucide-vue-next'
import { useDashboardStore, type WidgetType } from '@/shared/stores/dashboard.store'
import { useToast } from '@/composables/useToast'

const dashStore = useDashboardStore()
const toast = useToast()

// GridStack instance
let grid: GridStack | null = null
const gridContainer = ref<HTMLElement | null>(null)

// UI State
const showCatalog = ref(true)
const showLayoutDropdown = ref(false)
const newLayoutName = ref('')

const widgetTypes = [
  { type: 'line-chart', label: 'Linien-Chart', icon: BarChart3, w: 6, h: 4, category: 'Sensoren' },
  { type: 'gauge', label: 'Gauge-Chart', icon: Gauge, w: 3, h: 3, category: 'Sensoren' },
  { type: 'sensor-card', label: 'Sensor-Karte', icon: Activity, w: 3, h: 2, category: 'Sensoren' },
  { type: 'historical', label: 'Historische Zeitreihe', icon: BarChart3, w: 6, h: 4, category: 'Sensoren' },
  { type: 'actuator-card', label: 'Aktor-Status', icon: Zap, w: 3, h: 2, category: 'Aktoren' },
  { type: 'actuator-runtime', label: 'Aktor-Laufzeit', icon: BarChart3, w: 4, h: 3, category: 'Aktoren' },
  { type: 'esp-health', label: 'ESP-Health', icon: Cpu, w: 6, h: 3, category: 'System' },
  { type: 'alarm-list', label: 'Alarm-Liste', icon: Bell, w: 4, h: 4, category: 'System' },
]

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

onMounted(() => {
  nextTick(() => {
    if (!gridContainer.value) return

    grid = GridStack.init({
      column: 12,
      cellHeight: 80,
      margin: 8,
      float: true,
      animate: true,
      removable: true,
      acceptWidgets: true,
    }, gridContainer.value)

    // Load active layout
    if (dashStore.activeLayout) {
      loadWidgetsToGrid(dashStore.activeLayout.widgets)
    }

    // Auto-save on change
    grid.on('change', () => {
      autoSave()
    })

    grid.on('removed', () => {
      autoSave()
    })
  })
})

onUnmounted(() => {
  if (grid) {
    grid.destroy(false)
    grid = null
  }
})

function loadWidgetsToGrid(widgets: any[]) {
  if (!grid) return
  grid.removeAll(false)

  for (const w of widgets) {
    grid.addWidget({
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      id: w.id,
      content: createWidgetContent(w.type, w.config?.title || w.type),
    })
  }
}

function createWidgetContent(type: string, title: string): string {
  const widgetDef = widgetTypes.find(w => w.type === type)
  const label = widgetDef?.label || type
  return `
    <div class="dashboard-widget" data-type="${type}">
      <div class="dashboard-widget__header">
        <span class="dashboard-widget__title">${title || label}</span>
        <span class="dashboard-widget__type">${type}</span>
      </div>
      <div class="dashboard-widget__body">
        <div class="dashboard-widget__placeholder">${label}</div>
      </div>
    </div>
  `
}

// =============================================================================
// Widget Actions
// =============================================================================

function addWidget(type: string) {
  if (!grid) return

  const widgetDef = widgetTypes.find(w => w.type === type)
  if (!widgetDef) return

  const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  grid.addWidget({
    w: widgetDef.w,
    h: widgetDef.h,
    id,
    content: createWidgetContent(type, widgetDef.label),
  })

  autoSave()
}

function autoSave() {
  if (!grid || !dashStore.activeLayoutId) return

  const items = grid.getGridItems()
  const widgets = items.map((el: GridItemHTMLElement) => {
    const node = el.gridstackNode
    return {
      id: node?.id || '',
      type: (el.querySelector('.dashboard-widget')?.getAttribute('data-type') || 'line-chart') as WidgetType,
      x: node?.x || 0,
      y: node?.y || 0,
      w: node?.w || 3,
      h: node?.h || 2,
      config: {},
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

  // Clear grid
  if (grid) grid.removeAll(false)
  toast.success(`Dashboard "${name}" erstellt`)
}

function switchLayout(layoutId: string) {
  dashStore.activeLayoutId = layoutId
  const layout = dashStore.layouts.find(l => l.id === layoutId)
  if (layout && grid) {
    loadWidgetsToGrid(layout.widgets)
  }
  showLayoutDropdown.value = false
}

function handleDeleteLayout() {
  if (!dashStore.activeLayoutId) return
  const name = dashStore.activeLayout?.name
  dashStore.deleteLayout(dashStore.activeLayoutId)
  if (grid) grid.removeAll(false)
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
    <!-- Toolbar -->
    <div class="dashboard-builder__toolbar">
      <div class="dashboard-builder__toolbar-left">
        <LayoutGrid class="w-5 h-5" style="color: var(--color-accent-bright)" />
        <h2 class="dashboard-builder__title">Dashboard Builder</h2>

        <!-- Layout Selector -->
        <div class="dashboard-builder__layout-selector">
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
        <button class="dashboard-builder__tool-btn" title="Katalog" @click="showCatalog = !showCatalog">
          <Plus class="w-4 h-4" />
        </button>
        <button class="dashboard-builder__tool-btn" title="Exportieren" @click="handleExport">
          <Download class="w-4 h-4" />
        </button>
        <button class="dashboard-builder__tool-btn" title="Importieren" @click="handleImport">
          <Upload class="w-4 h-4" />
        </button>
        <button
          v-if="dashStore.activeLayoutId"
          class="dashboard-builder__tool-btn dashboard-builder__tool-btn--danger"
          title="Dashboard löschen"
          @click="handleDeleteLayout"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="dashboard-builder__content">
      <!-- Widget Catalog Sidebar -->
      <aside v-if="showCatalog" class="dashboard-builder__catalog">
        <h3 class="dashboard-builder__catalog-title">Widget-Katalog</h3>
        <div v-for="(widgets, category) in groupedWidgets" :key="category" class="dashboard-builder__catalog-group">
          <div class="dashboard-builder__catalog-group-title">{{ category }}</div>
          <button
            v-for="widget in widgets"
            :key="widget.type"
            class="dashboard-builder__catalog-item"
            @click="addWidget(widget.type)"
          >
            <component :is="widget.icon" class="w-4 h-4" />
            <span>{{ widget.label }}</span>
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
          class="grid-stack"
        />
      </div>
    </div>
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
.dashboard-builder__tool-btn--danger:hover { color: var(--color-status-alarm); }

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

.dashboard-builder__catalog-item:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
  background: rgba(59, 130, 246, 0.04);
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
</style>
