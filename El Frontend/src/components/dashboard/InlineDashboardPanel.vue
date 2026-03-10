<script setup lang="ts">
/**
 * InlineDashboardPanel — CSS-Grid-Only Dashboard Renderer
 *
 * Renders dashboard widgets in a 12-column CSS grid (NO GridStack).
 * Zero overhead: no drag/resize listeners, no external library.
 * Used for inline/side-panel dashboard embedding in Monitor/Hardware views.
 *
 * Block 7c: El Frontend/src/components/dashboard/InlineDashboardPanel.vue
 */
import { onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Pencil } from 'lucide-vue-next'
import { useDashboardStore, type DashboardWidget } from '@/shared/stores/dashboard.store'
import { useDashboardWidgets } from '@/composables/useDashboardWidgets'
import { createLogger } from '@/utils/logger'

const logger = createLogger('InlineDashboardPanel')

interface Props {
  layoutId: string
  mode?: 'inline' | 'side-panel'
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'inline',
})

const dashStore = useDashboardStore()

const { createWidgetElement, mountWidgetToElement, cleanupAllWidgets, widgetComponentMap } = useDashboardWidgets({
  showConfigButton: false,
  showWidgetHeader: false,
  readOnly: true,
})

/** Row height in pixels — synchronized with CustomDashboardView/DashboardViewer cellHeight */
const ROW_HEIGHT_INLINE = 80
const ROW_HEIGHT_SIDE = 120

const isSidePanel = computed(() => props.mode === 'side-panel')
const rowHeightPx = computed(() => `${isSidePanel.value ? ROW_HEIGHT_SIDE : ROW_HEIGHT_INLINE}px`)

const layout = computed(() =>
  dashStore.getLayoutById(props.layoutId)
)

const widgets = computed(() => layout.value?.widgets ?? [])

const editorRoute = computed(() => ({
  name: 'editor-dashboard' as const,
  params: { dashboardId: layout.value?.serverId || props.layoutId },
}))

/**
 * Calculate grid cell style from widget position.
 * Side-panel mode: single column, widgets stacked vertically (ignore x/w).
 * Inline mode: full 12-column grid with original positions.
 */
function widgetStyle(w: DashboardWidget): Record<string, string> {
  if (isSidePanel.value) {
    // Stack vertically — each widget spans full width, height from original h
    const minH = Math.max(w.h, 2)
    return {
      'grid-column': '1 / -1',
      'grid-row': `span ${minH}`,
    }
  }
  return {
    'grid-column': `${w.x + 1} / span ${w.w}`,
    'grid-row': `${w.y + 1} / span ${w.h}`,
  }
}

/** Check if a widget type has a registered Vue component */
function isKnownWidgetType(type: string): boolean {
  return type in widgetComponentMap
}

/** Mount all widgets into their DOM containers */
function mountWidgets() {
  cleanupAllWidgets()

  nextTick(() => {
    for (const w of widgets.value) {
      if (!isKnownWidgetType(w.type)) {
        logger.warn(`Unknown widget type "${w.type}" — skipping render`)
        continue
      }

      const containerId = `inline-${props.layoutId}-${w.id}`
      const container = document.getElementById(containerId)
      if (!container) continue

      // Clear previous DOM to prevent element accumulation on re-mount
      container.innerHTML = ''

      // Use distinct mount ID to avoid duplicate IDs (container already has containerId)
      const vmMountId = `vm-${containerId}`
      const el = createWidgetElement(w.type, w.config?.title || '', w.id, vmMountId)
      container.appendChild(el)
      mountWidgetToElement(w.id, vmMountId, w.type, w.config || {})
    }
  })
}

watch(widgets, () => mountWidgets(), { deep: true })

onMounted(() => {
  if (widgets.value.length > 0) mountWidgets()
})

onUnmounted(() => {
  cleanupAllWidgets()
})
</script>

<template>
  <div
    v-if="layout && widgets.length > 0"
    :class="['inline-dashboard', `inline-dashboard--${mode}`]"
  >
    <!-- Header -->
    <div class="inline-dashboard__header">
      <span class="inline-dashboard__name">{{ layout.name }}</span>
      <RouterLink :to="editorRoute" class="inline-dashboard__edit-link" title="Im Editor bearbeiten">
        <Pencil :size="14" />
      </RouterLink>
    </div>

    <!-- CSS Grid -->
    <div class="inline-dashboard__grid">
      <div
        v-for="w in widgets"
        :key="w.id"
        class="inline-dashboard__cell"
        :style="widgetStyle(w)"
      >
        <div v-if="isKnownWidgetType(w.type)" :id="`inline-${layoutId}-${w.id}`" class="inline-dashboard__mount" />
        <div v-else class="inline-dashboard__unknown">
          <span>{{ w.type }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inline-dashboard {
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.inline-dashboard--side-panel {
  border-radius: 0;
  border-left: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-right: none;
  border-top: none;
  border-bottom: none;
  height: 100%;
}

.inline-dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  background: var(--color-bg-tertiary);
}

.inline-dashboard__name {
  font-size: var(--text-sm, 13px);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.inline-dashboard__edit-link {
  color: var(--color-text-muted);
  transition: color var(--transition-fast, 150ms);
}

.inline-dashboard__edit-link:hover {
  color: var(--color-iridescent-1);
}

.inline-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: v-bind(rowHeightPx);
  gap: var(--space-1);
  padding: var(--space-2);
}

.inline-dashboard--side-panel .inline-dashboard__grid {
  grid-template-columns: 1fr;
  grid-auto-rows: v-bind(rowHeightPx);
  gap: var(--space-2);
}

.inline-dashboard__cell {
  min-width: 0;
  overflow: hidden;
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));
}

.inline-dashboard__mount {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Widget shell fills mount container — no outer header, direct widget content */
.inline-dashboard__mount :deep(.dashboard-widget) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.inline-dashboard__mount :deep(.dashboard-widget__vue-mount) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.inline-dashboard__unknown {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-xs, 11px);
  font-style: italic;
  opacity: 0.6;
}
</style>
