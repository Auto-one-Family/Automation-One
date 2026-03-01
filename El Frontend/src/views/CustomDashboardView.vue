<script setup lang="ts">
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

import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { GridStack, type GridItemHTMLElement, type GridStackNode } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import {
  LayoutGrid, Plus, Trash2, Download, Upload,
  BarChart3, Gauge, Activity, Zap, Bell, Cpu,
  ChevronDown, Pencil, Eye,
} from 'lucide-vue-next'
import { useDashboardStore, type WidgetType } from '@/shared/stores/dashboard.store'
import { useUiStore } from '@/shared/stores'
import { useToast } from '@/composables/useToast'
import { useEspStore } from '@/stores/esp'
import ViewTabBar from '@/components/common/ViewTabBar.vue'
import { h, render, type Component, getCurrentInstance } from 'vue'

// Widget components
import LineChartWidget from '@/components/dashboard-widgets/LineChartWidget.vue'
import GaugeWidget from '@/components/dashboard-widgets/GaugeWidget.vue'
import SensorCardWidget from '@/components/dashboard-widgets/SensorCardWidget.vue'
import ActuatorCardWidget from '@/components/dashboard-widgets/ActuatorCardWidget.vue'
import HistoricalChartWidget from '@/components/dashboard-widgets/HistoricalChartWidget.vue'
import ESPHealthWidget from '@/components/dashboard-widgets/ESPHealthWidget.vue'
import AlarmListWidget from '@/components/dashboard-widgets/AlarmListWidget.vue'
import ActuatorRuntimeWidget from '@/components/dashboard-widgets/ActuatorRuntimeWidget.vue'
import MultiSensorWidget from '@/components/dashboard-widgets/MultiSensorWidget.vue'
import WidgetConfigPanel from '@/components/dashboard-widgets/WidgetConfigPanel.vue'

const route = useRoute()
const dashStore = useDashboardStore()
const uiStore = useUiStore()
const espStore = useEspStore()
const toast = useToast()

// Widget component registry (all 9 types)
const widgetComponentMap: Record<string, Component> = {
  'line-chart': LineChartWidget,
  'gauge': GaugeWidget,
  'sensor-card': SensorCardWidget,
  'actuator-card': ActuatorCardWidget,
  'historical': HistoricalChartWidget,
  'esp-health': ESPHealthWidget,
  'alarm-list': AlarmListWidget,
  'actuator-runtime': ActuatorRuntimeWidget,
  'multi-sensor': MultiSensorWidget,
}

// Track mounted Vue vnodes for cleanup
const mountedWidgets = new Map<string, HTMLElement>()

// GridStack instance
let grid: GridStack | null = null
const gridContainer = ref<HTMLElement | null>(null)

// UI State
const showCatalog = ref(false)
const showLayoutDropdown = ref(false)
const newLayoutName = ref('')
const isEditing = ref(false)
const layoutSelectorRef = ref<HTMLElement | null>(null)

// Close layout dropdown on outside click
onClickOutside(layoutSelectorRef, () => {
  showLayoutDropdown.value = false
})

// Widget Config Panel state
const configPanelOpen = ref(false)
const configWidgetId = ref('')
const configWidgetType = ref('')

const widgetTypes = [
  { type: 'line-chart', label: 'Linien-Chart', description: 'Live-Verlauf eines Sensors mit Y-Achsen-Defaults', icon: BarChart3, w: 6, h: 4, minW: 4, minH: 3, category: 'Sensoren' },
  { type: 'gauge', label: 'Gauge-Chart', description: 'Kreisanzeige für aktuelle Messwerte', icon: Gauge, w: 3, h: 3, minW: 2, minH: 3, category: 'Sensoren' },
  { type: 'sensor-card', label: 'Sensor-Karte', description: 'Kompakte Karte mit aktuellem Wert', icon: Activity, w: 3, h: 2, minW: 2, minH: 2, category: 'Sensoren' },
  { type: 'historical', label: 'Historische Zeitreihe', description: 'Zeitreihe mit historischen API-Daten', icon: BarChart3, w: 6, h: 4, minW: 6, minH: 4, category: 'Sensoren' },
  { type: 'multi-sensor', label: 'Multi-Sensor-Chart', description: 'Mehrere Sensoren in einem Chart vergleichen', icon: BarChart3, w: 8, h: 5, minW: 6, minH: 4, category: 'Sensoren' },
  { type: 'actuator-card', label: 'Aktor-Status', description: 'Aktor-Status und Steuerung', icon: Zap, w: 3, h: 2, minW: 2, minH: 2, category: 'Aktoren' },
  { type: 'actuator-runtime', label: 'Aktor-Laufzeit', description: 'Laufzeitstatistik eines Aktors', icon: BarChart3, w: 4, h: 3, minW: 3, minH: 3, category: 'Aktoren' },
  { type: 'esp-health', label: 'ESP-Health', description: 'Health-Metriken eines ESP32', icon: Cpu, w: 6, h: 3, minW: 4, minH: 3, category: 'System' },
  { type: 'alarm-list', label: 'Alarm-Liste', description: 'Liste aktiver und vergangener Alarme', icon: Bell, w: 4, h: 4, minW: 4, minH: 4, category: 'System' },
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
        const mountEl = mountedWidgets.get(item.id)
        if (mountEl) {
          render(null, mountEl)
          mountedWidgets.delete(item.id)
        }
      }
    }
    autoSave()
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

onMounted(() => {
  // Ensure ESP data is loaded for widgets
  if (espStore.devices.length === 0) {
    espStore.fetchAll()
  }

  // Deep-link: open dashboard from URL param /editor/:dashboardId
  const dashboardIdFromUrl = route.params.dashboardId as string | undefined
  if (dashboardIdFromUrl) {
    const layout = dashStore.layouts.find(l => l.id === dashboardIdFromUrl)
    if (layout) {
      dashStore.activeLayoutId = dashboardIdFromUrl
      dashStore.breadcrumb.dashboardName = layout.name
    }
  }
  // Also support legacy ?layout= query param (from MonitorView cross-links)
  const layoutFromQuery = route.query.layout as string | undefined
  if (layoutFromQuery && !dashboardIdFromUrl) {
    const layout = dashStore.layouts.find(l => l.id === layoutFromQuery)
    if (layout) {
      dashStore.activeLayoutId = layoutFromQuery
      dashStore.breadcrumb.dashboardName = layout.name
    }
  }

  nextTick(() => {
    initGrid()
  })
})

onUnmounted(() => {
  // Cleanup all mounted Vue vnodes
  for (const [, el] of mountedWidgets) {
    render(null, el)
  }
  mountedWidgets.clear()

  if (grid) {
    grid.destroy(false)
    grid = null
  }

  // Clear breadcrumb
  dashStore.breadcrumb.dashboardName = ''
})

// Widget config cache (stored per widget ID)
const widgetConfigs = ref<Map<string, Record<string, any>>>(new Map())

function loadWidgetsToGrid(widgets: any[]) {
  if (!grid) return

  // Cleanup existing mounted widgets
  for (const [, el] of mountedWidgets) {
    render(null, el)
  }
  mountedWidgets.clear()

  grid.removeAll(true)

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

    // Inject widget DOM and mount Vue component after GridStack has created the cell
    nextTick(() => {
      const contentDiv = itemEl.querySelector('.grid-stack-item-content')
      contentDiv?.appendChild(createWidgetElement(w.type, w.config?.title || w.type, w.id, mountId))
      mountWidgetComponent(w.id, mountId, w.type, w.config || {})
    })
  }
}

/**
 * Build widget DOM element using the DOM API (no innerHTML) so user-controlled
 * strings such as `title` are set via textContent and cannot carry XSS payloads.
 * GridStack.renderCB no longer needs to be overridden — we inject the element
 * directly into `.grid-stack-item-content` after addWidget() returns.
 */
function createWidgetElement(type: string, title: string, widgetId: string, mountId: string): HTMLElement {
  const widgetDef = widgetTypes.find(w => w.type === type)
  const label = widgetDef?.label || type
  const hasVueComponent = type in widgetComponentMap

  const container = document.createElement('div')
  container.className = 'dashboard-widget'
  container.dataset.type = type
  container.dataset.widgetId = widgetId

  const header = document.createElement('div')
  header.className = 'dashboard-widget__header'

  const titleEl = document.createElement('span')
  titleEl.className = 'dashboard-widget__title'
  titleEl.textContent = title || label        // textContent — safe for user input

  const typeEl = document.createElement('span')
  typeEl.className = 'dashboard-widget__type'
  typeEl.textContent = type

  // Gear icon for widget configuration (Bug 3 fix)
  const gearBtn = document.createElement('button')
  gearBtn.className = 'dashboard-widget__gear-btn'
  gearBtn.title = 'Konfigurieren'
  gearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    openConfigPanel(widgetId, type)
  })

  header.append(titleEl, typeEl, gearBtn)
  container.appendChild(header)

  if (hasVueComponent) {
    const mountDiv = document.createElement('div')
    mountDiv.id = mountId
    mountDiv.className = 'dashboard-widget__vue-mount'
    container.appendChild(mountDiv)
  } else {
    const body = document.createElement('div')
    body.className = 'dashboard-widget__body'
    const placeholder = document.createElement('div')
    placeholder.className = 'dashboard-widget__placeholder'
    placeholder.textContent = label
    body.appendChild(placeholder)
    container.appendChild(body)
  }

  return container
}

// Get current Vue instance for app context sharing
const currentInstance = getCurrentInstance()

/**
 * Mount a Vue widget component into a GridStack cell.
 * Uses Vue's render() API with appContext to share Pinia stores.
 */
function mountWidgetComponent(widgetId: string, mountId: string, type: string, config: Record<string, any>) {
  const WidgetComponent = widgetComponentMap[type]
  if (!WidgetComponent) return

  const mountEl = document.getElementById(mountId)
  if (!mountEl) return

  // Build props based on widget type and config
  const props: Record<string, any> = {}
  if (config.sensorId) props.sensorId = config.sensorId
  if (config.actuatorId) props.actuatorId = config.actuatorId
  if (config.timeRange) props.timeRange = config.timeRange
  if (config.showThresholds != null) props.showThresholds = config.showThresholds
  if (config.zoneFilter) props.zoneFilter = config.zoneFilter
  if (config.showOfflineOnly != null) props.showOfflineOnly = config.showOfflineOnly
  if (config.maxItems) props.maxItems = config.maxItems
  if (config.showResolved != null) props.showResolved = config.showResolved
  if (config.actuatorFilter) props.actuatorFilter = config.actuatorFilter
  if (config.dataSources) props.dataSources = config.dataSources
  // Y-axis range, color, and threshold values (for chart widgets)
  if (config.yMin != null) props.yMin = config.yMin
  if (config.yMax != null) props.yMax = config.yMax
  if (config.color) props.color = config.color
  if (config.warnLow != null) props.warnLow = config.warnLow
  if (config.warnHigh != null) props.warnHigh = config.warnHigh
  if (config.alarmLow != null) props.alarmLow = config.alarmLow
  if (config.alarmHigh != null) props.alarmHigh = config.alarmHigh

  // onUpdate:config handler
  props['onUpdate:config'] = (newConfig: Record<string, any>) => {
    const existing = widgetConfigs.value.get(widgetId) || {}
    widgetConfigs.value.set(widgetId, { ...existing, ...newConfig })
    autoSave()
  }

  // Create vnode and attach appContext for Pinia/router access
  const vnode = h(WidgetComponent, props)
  if (currentInstance?.appContext) {
    vnode.appContext = currentInstance.appContext
  }

  render(vnode, mountEl)
  mountedWidgets.set(widgetId, mountEl)
}

// =============================================================================
// Widget Actions
// =============================================================================

/** Default config per widget type */
const WIDGET_DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  'line-chart': { timeRange: '1h', showThresholds: false },
  'gauge': {},
  'sensor-card': {},
  'historical': { timeRange: '24h' },
  'multi-sensor': { dataSources: '' },
  'actuator-card': {},
  'actuator-runtime': {},
  'esp-health': {},
  'alarm-list': {},
}

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

/** Open widget config panel */
function openConfigPanel(widgetId: string, widgetType: string) {
  configWidgetId.value = widgetId
  configWidgetType.value = widgetType
  configPanelOpen.value = true
}

/** Handle config update from config panel — re-mounts the Vue component with new props */
function handleConfigUpdate(newConfig: Record<string, any>) {
  const widgetId = configWidgetId.value
  if (!widgetId) return

  widgetConfigs.value.set(widgetId, newConfig)

  // Re-mount the widget component with updated config
  const mountId = `widget-mount-${widgetId}`
  const mountEl = mountedWidgets.get(widgetId)
  if (mountEl) {
    render(null, mountEl)
    mountedWidgets.delete(widgetId)
  }
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
  if (!grid || !dashStore.activeLayoutId) return

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

  // Clear grid
  if (grid) grid.removeAll(true)
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
  if (layout && grid) {
    loadWidgetsToGrid(layout.widgets)
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
  if (grid) grid.removeAll(true)
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
          :class="['grid-stack', { 'grid-stack--editing': isEditing }]"
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
</style>
