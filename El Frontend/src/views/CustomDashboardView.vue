<script setup lang="ts">
/**
 * CustomDashboardView
 *
 * User-configurable widget dashboard using GridStack.js.
 * Supports 8 widget types, drag-from-sidebar, resize, reposition,
 * and localStorage persistence.
 *
 * GridStack handles:
 * - Widget positioning and snapping
 * - Overlap prevention
 * - Responsive column adaptation
 * - Drag handles (only widget header)
 */

import {
  ref, reactive, onMounted, onUnmounted, nextTick,
  createApp, h, type Component,
} from 'vue'
import { createPinia } from 'pinia'
import { useRouter } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { GridStack } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import { createLogger } from '@/utils/logger'
import {
  TrendingUp, Gauge, Thermometer, Zap, Clock, Server, Bell, Activity,
  Plus, LayoutDashboard, Trash2,
} from 'lucide-vue-next'

// Widget components
import LineChartWidget from '@/components/dashboard-widgets/LineChartWidget.vue'
import GaugeWidget from '@/components/dashboard-widgets/GaugeWidget.vue'
import SensorCardWidget from '@/components/dashboard-widgets/SensorCardWidget.vue'
import ActuatorCardWidget from '@/components/dashboard-widgets/ActuatorCardWidget.vue'
import HistoricalChartWidget from '@/components/dashboard-widgets/HistoricalChartWidget.vue'
import ESPHealthWidget from '@/components/dashboard-widgets/ESPHealthWidget.vue'
import AlarmListWidget from '@/components/dashboard-widgets/AlarmListWidget.vue'
import ActuatorRuntimeWidget from '@/components/dashboard-widgets/ActuatorRuntimeWidget.vue'

const logger = createLogger('CustomDashboard')
const router = useRouter()
const espStore = useEspStore()

// ============================================================================
// Widget Registry
// ============================================================================

interface WidgetType {
  id: string
  label: string
  icon: Component
  description: string
  component: Component
  minW: number
  minH: number
  defaultW: number
  defaultH: number
}

const WIDGET_TYPES: WidgetType[] = [
  {
    id: 'line-chart',
    label: 'Live-Chart',
    icon: TrendingUp,
    description: 'Echtzeit-Linien-Chart für Sensor-Daten',
    component: LineChartWidget,
    minW: 4, minH: 3, defaultW: 4, defaultH: 3,
  },
  {
    id: 'gauge',
    label: 'Gauge',
    icon: Gauge,
    description: 'Halbkreis-Anzeige für einzelnen Sensor-Wert',
    component: GaugeWidget,
    minW: 2, minH: 3, defaultW: 2, defaultH: 3,
  },
  {
    id: 'sensor-card',
    label: 'Sensor-Karte',
    icon: Thermometer,
    description: 'Kompakte Sensor-Wert-Anzeige mit Trend',
    component: SensorCardWidget,
    minW: 2, minH: 2, defaultW: 2, defaultH: 2,
  },
  {
    id: 'actuator-card',
    label: 'Aktor-Karte',
    icon: Zap,
    description: 'Aktor-Status-Anzeige (Ein/Aus, PWM)',
    component: ActuatorCardWidget,
    minW: 2, minH: 2, defaultW: 2, defaultH: 2,
  },
  {
    id: 'historical',
    label: 'Verlauf',
    icon: Clock,
    description: 'Historische Sensor-Daten (1h/6h/24h/7d)',
    component: HistoricalChartWidget,
    minW: 6, minH: 4, defaultW: 6, defaultH: 4,
  },
  {
    id: 'esp-health',
    label: 'ESP-Übersicht',
    icon: Server,
    description: 'Alle ESPs mit Verbindungsstatus',
    component: ESPHealthWidget,
    minW: 4, minH: 3, defaultW: 4, defaultH: 3,
  },
  {
    id: 'alarm-list',
    label: 'Alarme',
    icon: Bell,
    description: 'Aktive Alarme und Warnungen',
    component: AlarmListWidget,
    minW: 4, minH: 4, defaultW: 4, defaultH: 4,
  },
  {
    id: 'actuator-runtime',
    label: 'Aktor-Laufzeit',
    icon: Activity,
    description: 'Laufzeit-Statistik der Aktoren',
    component: ActuatorRuntimeWidget,
    minW: 3, minH: 3, defaultW: 3, defaultH: 3,
  },
]

// ============================================================================
// State
// ============================================================================

interface WidgetInstance {
  id: string
  type: string
  config: Record<string, unknown>
  x?: number
  y?: number
  w: number
  h: number
}

const STORAGE_KEY = 'automationone-dashboard-layout'
const gridEl = ref<HTMLElement | null>(null)
let grid: GridStack | null = null
const widgets = reactive<WidgetInstance[]>([])
const mountedApps = new Map<string, ReturnType<typeof createApp>>()
const sidebarOpen = ref(true)

// ============================================================================
// Persistence
// ============================================================================

function saveLayout() {
  if (!grid) return
  const items = grid.getGridItems()
  const layout = items.map(el => {
    const node = el.gridstackNode
    const widgetId = el.getAttribute('gs-id') || ''
    const widget = widgets.find(w => w.id === widgetId)
    return {
      id: widgetId,
      type: widget?.type || '',
      config: widget?.config || {},
      x: node?.x ?? 0,
      y: node?.y ?? 0,
      w: node?.w ?? 2,
      h: node?.h ?? 2,
    }
  })

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
    logger.debug('Layout saved', { count: layout.length })
  } catch (err) {
    logger.warn('Failed to save layout', err)
  }
}

function loadLayout(): WidgetInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// ============================================================================
// Widget Mounting (Vue components into GridStack cells)
// ============================================================================

function mountWidgetComponent(widgetId: string, containerEl: HTMLElement) {
  const widget = widgets.find(w => w.id === widgetId)
  if (!widget) return

  const typeDef = WIDGET_TYPES.find(t => t.id === widget.type)
  if (!typeDef) return

  // Unmount previous if exists
  unmountWidgetComponent(widgetId)

  const contentEl = containerEl.querySelector('.grid-stack-item-content')
  if (!contentEl) return

  // Create a new Vue app for the widget
  const app = createApp({
    render() {
      return h(typeDef.component, {
        widgetId: widget.id,
        config: widget.config,
        onRemove: () => removeWidget(widgetId),
        onUpdateConfig: (config: Record<string, unknown>) => {
          widget.config = { ...widget.config, ...config }
          saveLayout()
        },
      })
    },
  })

  // Share the parent Pinia instance
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)

  // Mount into the content div
  const mountTarget = document.createElement('div')
  mountTarget.style.height = '100%'
  contentEl.appendChild(mountTarget)
  app.mount(mountTarget)

  mountedApps.set(widgetId, app)
}

function unmountWidgetComponent(widgetId: string) {
  const app = mountedApps.get(widgetId)
  if (app) {
    app.unmount()
    mountedApps.delete(widgetId)
  }
}

// ============================================================================
// GridStack Init
// ============================================================================

function initGrid() {
  if (!gridEl.value) return

  grid = GridStack.init({
    column: 12,
    cellHeight: 80,
    margin: 8,
    float: true,
    animate: true,
    draggable: {
      handle: '.gs-drag-handle',
    },
    resizable: {
      handles: 'se',
    },
    removable: false,
    acceptWidgets: true,
  }, gridEl.value)

  // Save layout on changes
  grid.on('change', () => {
    saveLayout()
  })

  // Load saved layout
  const saved = loadLayout()
  if (saved.length > 0) {
    for (const item of saved) {
      addWidgetToGrid(item)
    }
  }
}

function addWidgetToGrid(widget: WidgetInstance) {
  if (!grid) return

  const typeDef = WIDGET_TYPES.find(t => t.id === widget.type)
  if (!typeDef) return

  // Add to reactive state
  widgets.push(widget)

  // Add to GridStack
  const el = grid.addWidget({
    id: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    minW: typeDef.minW,
    minH: typeDef.minH,
    content: '',
  })

  // Mount Vue component into grid cell
  nextTick(() => {
    if (el) {
      mountWidgetComponent(widget.id, el)
    }
  })
}

function addWidget(typeId: string) {
  const typeDef = WIDGET_TYPES.find(t => t.id === typeId)
  if (!typeDef) return

  const widget: WidgetInstance = {
    id: `${typeId}-${Date.now()}`,
    type: typeId,
    config: {},
    w: typeDef.defaultW,
    h: typeDef.defaultH,
  }

  addWidgetToGrid(widget)
  saveLayout()
}

function removeWidget(widgetId: string) {
  if (!grid) return

  // Unmount Vue component
  unmountWidgetComponent(widgetId)

  // Remove from GridStack
  const el = gridEl.value?.querySelector(`[gs-id="${widgetId}"]`) as HTMLElement
  if (el) {
    grid.removeWidget(el, false)
  }

  // Remove from reactive state
  const idx = widgets.findIndex(w => w.id === widgetId)
  if (idx !== -1) widgets.splice(idx, 1)

  saveLayout()
}

function clearDashboard() {
  if (!grid) return

  // Unmount all
  for (const [id] of mountedApps) {
    unmountWidgetComponent(id)
  }

  grid.removeAll(false)
  widgets.splice(0, widgets.length)
  saveLayout()
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
  espStore.fetchAll()
  nextTick(initGrid)
})

onUnmounted(() => {
  // Cleanup all mounted widget apps
  for (const [id] of mountedApps) {
    unmountWidgetComponent(id)
  }

  if (grid) {
    grid.destroy(false)
    grid = null
  }
})
</script>

<template>
  <div class="custom-dashboard">
    <!-- Sidebar: Widget Types -->
    <aside
      class="widget-sidebar"
      :class="{ 'widget-sidebar--collapsed': !sidebarOpen }"
    >
      <div class="sidebar-header">
        <LayoutDashboard class="sidebar-header-icon" />
        <span v-if="sidebarOpen" class="sidebar-header-title">Widgets</span>
        <button
          class="sidebar-toggle"
          @click="sidebarOpen = !sidebarOpen"
          :title="sidebarOpen ? 'Sidebar schließen' : 'Sidebar öffnen'"
        >
          {{ sidebarOpen ? '‹' : '›' }}
        </button>
      </div>

      <div v-if="sidebarOpen" class="sidebar-content">
        <div
          v-for="wt in WIDGET_TYPES"
          :key="wt.id"
          class="widget-type-card"
          draggable="false"
          @click="addWidget(wt.id)"
          @dblclick="addWidget(wt.id)"
        >
          <component :is="wt.icon" class="widget-type-icon" />
          <div class="widget-type-info">
            <span class="widget-type-label">{{ wt.label }}</span>
            <span class="widget-type-desc">{{ wt.description }}</span>
          </div>
          <Plus class="widget-type-add" />
        </div>

        <!-- Actions -->
        <div class="sidebar-actions">
          <button class="sidebar-action-btn sidebar-action-btn--danger" @click="clearDashboard">
            <Trash2 class="w-3.5 h-3.5" />
            Alle entfernen
          </button>
        </div>
      </div>
    </aside>

    <!-- Grid Area -->
    <main class="dashboard-grid-area">
      <!-- Empty State -->
      <div
        v-if="widgets.length === 0"
        class="dashboard-empty"
      >
        <LayoutDashboard class="dashboard-empty-icon" />
        <h3>Dashboard ist leer</h3>
        <p>Klicke auf einen Widget-Typ in der Seitenleiste, um ihn hinzuzufügen.</p>
      </div>

      <!-- GridStack Container -->
      <div ref="gridEl" class="grid-stack" />
    </main>
  </div>
</template>

<style scoped>
.custom-dashboard {
  display: flex;
  height: 100%;
  gap: 0;
  min-height: 500px;
}

/* ── Sidebar ── */
.widget-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  transition: width var(--transition-base);
  overflow: hidden;
}

.widget-sidebar--collapsed {
  width: 44px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--glass-border);
  min-height: 40px;
}

.sidebar-header-icon {
  width: 16px;
  height: 16px;
  color: var(--color-accent-bright);
  flex-shrink: 0;
}

.sidebar-header-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.sidebar-toggle {
  margin-left: auto;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sidebar-toggle:hover {
  background: var(--color-bg-quaternary);
  color: var(--color-text-secondary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.widget-type-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.widget-type-card:hover {
  background: var(--color-bg-quaternary);
  border-color: var(--glass-border);
}

.widget-type-icon {
  width: 16px;
  height: 16px;
  color: var(--color-accent-bright);
  flex-shrink: 0;
}

.widget-type-info {
  flex: 1;
  min-width: 0;
}

.widget-type-label {
  display: block;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-primary);
}

.widget-type-desc {
  display: block;
  font-size: 10px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-type-add {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.widget-type-card:hover .widget-type-add {
  opacity: 1;
}

.sidebar-actions {
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px solid var(--glass-border);
}

.sidebar-action-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sidebar-action-btn:hover {
  border-color: var(--glass-border-hover);
  color: var(--color-text-secondary);
}

.sidebar-action-btn--danger:hover {
  border-color: rgba(248, 113, 113, 0.3);
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.05);
}

/* ── Grid Area ── */
.dashboard-grid-area {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: auto;
  padding: var(--space-2);
}

.dashboard-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  pointer-events: none;
}

.dashboard-empty-icon {
  width: 40px;
  height: 40px;
  color: var(--color-text-muted);
  opacity: 0.3;
}

.dashboard-empty h3 {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text-secondary);
  margin: 0;
}

.dashboard-empty p {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  text-align: center;
}

/* ── GridStack Overrides ── */
:deep(.grid-stack) {
  min-height: 400px;
}

:deep(.grid-stack-item) {
  /* Override GridStack's default cursor */
  cursor: default;
}

:deep(.grid-stack-item-content) {
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
}

:deep(.grid-stack-item > .ui-resizable-handle) {
  /* Make resize handle more visible */
  opacity: 0;
  transition: opacity var(--transition-fast);
}

:deep(.grid-stack-item:hover > .ui-resizable-handle) {
  opacity: 0.5;
}

:deep(.grid-stack-placeholder > .placeholder-content) {
  border: 2px dashed var(--color-accent-bright);
  border-radius: var(--radius-md);
  background: rgba(59, 130, 246, 0.05);
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .widget-sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: var(--z-modal);
    width: 260px;
    transform: translateX(-100%);
    transition: transform var(--transition-base);
  }

  .widget-sidebar:not(.widget-sidebar--collapsed) {
    transform: translateX(0);
    box-shadow: var(--elevation-floating);
  }

  .dashboard-grid-area {
    padding: var(--space-1);
  }
}
</style>
