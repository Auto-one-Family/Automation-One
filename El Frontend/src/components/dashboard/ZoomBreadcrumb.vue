<script setup lang="ts">
/**
 * ZoomBreadcrumb Component
 *
 * Navigation breadcrumb for the three-level zoom dashboard.
 * Shows the current path and allows click-to-navigate-up.
 *
 * Level 1: Dashboard
 * Level 2: Dashboard > Gewaechshaus A
 * Level 3: Dashboard > Gewaechshaus A > ESP_Temp_01
 */

type ZoomLevel = 1 | 2 | 3

interface Props {
  level: ZoomLevel
  zoneName?: string
  deviceName?: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'navigate', level: ZoomLevel): void
}>()
</script>

<template>
  <nav aria-label="Zoom-Navigation" class="zoom-breadcrumb">
    <ol role="list" class="zoom-breadcrumb__list">
      <!-- Dashboard (always visible) -->
      <li>
        <button
          :class="level === 1 ? 'zoom-breadcrumb__item--current' : 'zoom-breadcrumb__item'"
          :aria-current="level === 1 ? 'page' : undefined"
          @click="level > 1 && emit('navigate', 1)"
        >
          Dashboard
        </button>
      </li>

      <!-- Zone name (Level 2+) -->
      <template v-if="level >= 2 && zoneName">
        <li aria-hidden="true" class="zoom-breadcrumb__separator">›</li>
        <li>
          <button
            :class="level === 2 ? 'zoom-breadcrumb__item--current' : 'zoom-breadcrumb__item'"
            :aria-current="level === 2 ? 'page' : undefined"
            @click="level > 2 && emit('navigate', 2)"
          >
            {{ zoneName }}
          </button>
        </li>
      </template>

      <!-- Device name (Level 3) -->
      <template v-if="level >= 3 && deviceName">
        <li aria-hidden="true" class="zoom-breadcrumb__separator">›</li>
        <li>
          <button
            class="zoom-breadcrumb__item--current"
            aria-current="page"
          >
            {{ deviceName }}
          </button>
        </li>
      </template>
    </ol>
  </nav>
</template>

<style scoped>
.zoom-breadcrumb {
  padding: var(--space-1) 0;
  margin-bottom: var(--space-3);
}

.zoom-breadcrumb__list {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

/* Shared button reset for breadcrumb items */
.zoom-breadcrumb__item,
.zoom-breadcrumb__item--current {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  white-space: nowrap;
}

.zoom-breadcrumb__item {
  cursor: pointer;
  transition: color var(--transition-fast);
  color: var(--color-text-muted);
}

.zoom-breadcrumb__item:hover {
  color: var(--color-accent-bright);
}

.zoom-breadcrumb__item--current {
  color: var(--color-text-primary);
  font-weight: 500;
  cursor: default;
}

.zoom-breadcrumb__separator {
  color: var(--color-text-muted);
  opacity: 0.5;
  font-size: var(--text-xs);
  user-select: none;
}
</style>
