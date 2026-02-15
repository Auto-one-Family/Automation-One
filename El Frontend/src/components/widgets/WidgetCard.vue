<script setup lang="ts">
/**
 * WidgetCard Component
 *
 * Extended card for dashboard widgets with header (icon + title + actions),
 * collapsible body, loading/error states. Built on BaseCard with glass effect.
 */

import { ref, computed, type Component } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import BaseCard from '@/shared/design/primitives/BaseCard.vue'
import BaseSkeleton from '@/shared/design/primitives/BaseSkeleton.vue'
import BaseBadge from '@/shared/design/primitives/BaseBadge.vue'

interface Props {
  /** Widget title */
  title: string
  /** Lucide icon component */
  icon?: Component
  /** Grid span size */
  span?: '1x1' | '2x1' | '1x2' | '2x2'
  /** Allow collapsing widget body */
  collapsible?: boolean
  /** Show loading skeleton overlay */
  loading?: boolean
  /** Error message to display */
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  icon: undefined,
  span: '1x1',
  collapsible: false,
  loading: false,
  error: null,
})

const isCollapsed = ref(false)

function toggleCollapse(): void {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value
  }
}

const widgetClasses = computed(() => {
  const classes = ['widget-card']
  const spanMap: Record<string, string> = {
    '1x1': '',
    '2x1': 'widget-card--span-2x1',
    '1x2': 'widget-card--span-1x2',
    '2x2': 'widget-card--span-2x2',
  }
  if (spanMap[props.span]) {
    classes.push(spanMap[props.span])
  }
  return classes
})
</script>

<template>
  <div :class="widgetClasses">
    <BaseCard glass hoverable>
      <template #header>
        <div class="widget-card__header">
          <div class="widget-card__title-group">
            <component
              :is="icon"
              v-if="icon"
              class="widget-card__icon"
            />
            <h3 class="widget-card__title">{{ title }}</h3>
          </div>
          <div class="widget-card__actions">
            <slot name="actions" />
            <button
              v-if="collapsible"
              class="widget-card__collapse-btn"
              :class="{ 'widget-card__collapse-btn--collapsed': isCollapsed }"
              :title="isCollapsed ? 'Aufklappen' : 'Zuklappen'"
              :aria-expanded="!isCollapsed"
              aria-label="Widget ein-/ausklappen"
              @click="toggleCollapse"
            >
              <ChevronDown class="widget-card__collapse-icon" />
            </button>
          </div>
        </div>
      </template>

      <div
        class="widget-card__body"
        :class="{ 'widget-card__body--collapsed': isCollapsed }"
      >
        <div class="widget-card__body-inner">
          <!-- Loading state -->
          <div v-if="loading" class="widget-card__loading">
            <BaseSkeleton size="md" text="" />
          </div>

          <!-- Error state -->
          <div v-else-if="error" class="widget-card__error">
            <BaseBadge variant="danger">{{ error }}</BaseBadge>
          </div>

          <!-- Content -->
          <slot v-else />
        </div>
      </div>

      <template v-if="$slots.footer" #footer>
        <div class="widget-card__footer">
          <slot name="footer" />
        </div>
      </template>
    </BaseCard>
  </div>
</template>

<style scoped>
.widget-card--span-2x1 {
  grid-column: span 2;
}

.widget-card--span-1x2 {
  grid-row: span 2;
}

.widget-card--span-2x2 {
  grid-column: span 2;
  grid-row: span 2;
}

.widget-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.widget-card__title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.widget-card__icon {
  width: 16px;
  height: 16px;
  color: var(--color-accent);
  flex-shrink: 0;
}

.widget-card__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widget-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.widget-card__collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.widget-card__collapse-btn:hover {
  background: var(--color-bg-tertiary);
}

.widget-card__collapse-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: transform var(--transition-base);
}

.widget-card__collapse-btn--collapsed .widget-card__collapse-icon {
  transform: rotate(-90deg);
}

.widget-card__body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--transition-base);
}

.widget-card__body--collapsed {
  grid-template-rows: 0fr;
}

.widget-card__body-inner {
  overflow: hidden;
  min-height: 0;
}

.widget-card__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
}

.widget-card__error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

.widget-card__footer {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}

/* Responsive: 2x1 collapses to 1x1 on small screens */
@media (max-width: 768px) {
  .widget-card--span-2x1 {
    grid-column: span 1;
  }

  .widget-card--span-2x2 {
    grid-column: span 1;
    grid-row: span 1;
  }
}
</style>
