<script setup lang="ts">
/**
 * WidgetGrid Component
 *
 * CSS Grid container for dashboard widgets.
 * Auto-fills columns with responsive sizing.
 * Supports collapsing with animated transition.
 */

interface Props {
  /** Collapse the entire grid */
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
})
</script>

<template>
  <div
    class="widget-grid-wrapper"
    :class="{ 'widget-grid-wrapper--collapsed': collapsed }"
  >
    <div class="widget-grid-wrapper__inner">
      <div class="widget-grid" role="region" aria-label="Dashboard Widgets">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-grid-wrapper {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--transition-slow);
}

.widget-grid-wrapper--collapsed {
  grid-template-rows: 0fr;
}

.widget-grid-wrapper__inner {
  overflow: hidden;
  min-height: 0;
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-4);
  padding: var(--space-1) 0;
}

/* Smaller min-width on narrow viewports */
@media (max-width: 768px) {
  .widget-grid {
    grid-template-columns: 1fr;
  }
}
</style>
