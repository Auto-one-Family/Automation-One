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

interface Props {
  layoutId: string
  mode?: 'inline' | 'side-panel'
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'inline',
})

const dashStore = useDashboardStore()

const { createWidgetElement, mountWidgetToElement, cleanupAllWidgets } = useDashboardWidgets({
  showConfigButton: false,
})

const layout = computed(() =>
  dashStore.layouts.find(l => l.id === props.layoutId || l.serverId === props.layoutId)
)

const widgets = computed(() => layout.value?.widgets ?? [])

const editorRoute = computed(() => ({
  name: 'editor-dashboard' as const,
  params: { dashboardId: layout.value?.serverId || props.layoutId },
}))

/** Calculate grid cell style from widget position (row height = 60px via grid-auto-rows) */
function widgetStyle(w: DashboardWidget): Record<string, string> {
  return {
    'grid-column': `${w.x + 1} / span ${w.w}`,
    'grid-row': `${w.y + 1} / span ${w.h}`,
  }
}

/** Mount all widgets into their DOM containers */
function mountWidgets() {
  cleanupAllWidgets()

  nextTick(() => {
    for (const w of widgets.value) {
      const mountId = `inline-${props.layoutId}-${w.id}`
      const container = document.getElementById(mountId)
      if (!container) continue

      const el = createWidgetElement(w.type, w.config?.title || '', w.id, mountId)
      container.appendChild(el)
      mountWidgetToElement(w.id, mountId, w.type, w.config || {})
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
        <div :id="`inline-${layoutId}-${w.id}`" class="inline-dashboard__mount" />
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
  padding: 8px 12px;
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
  grid-auto-rows: 60px;
  gap: 4px;
  padding: 8px;
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
</style>
