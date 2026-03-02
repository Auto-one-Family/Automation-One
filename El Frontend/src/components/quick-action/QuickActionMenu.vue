<script setup lang="ts">
/**
 * QuickActionMenu — Expanding panel shown when the FAB is clicked.
 *
 * Renders context-specific actions (top section), an optional widget
 * drag section (only on editor/monitor views), and global actions
 * (bottom section). Glassmorphism styling consistent with design tokens.
 */

import { computed } from 'vue'
import { useQuickActionStore } from '@/shared/stores/quickAction.store'
import { useWidgetDragFromFab } from '@/composables/useWidgetDragFromFab'
import type { WidgetDragItem } from '@/composables/useWidgetDragFromFab'
import { LayoutGrid } from 'lucide-vue-next'
import QuickActionItem from './QuickActionItem.vue'

const store = useQuickActionStore()
const { groupedWidgetItems, handleDragStart, handleDragEnd, announceWidget } = useWidgetDragFromFab()

const contextActions = computed(() => store.contextActions)
const globalActions = computed(() => store.globalActions)
const hasContextActions = computed(() => contextActions.value.length > 0)

/** Widget section visible only on views that accept widget drops */
const isWidgetCapableView = computed(() =>
  store.currentView === 'editor' || store.currentView === 'monitor'
)

function handleAction(actionId: string) {
  store.executeAction(actionId)
}

/** Keyboard: Space/Enter places widget at next free slot */
function handleWidgetKeydown(e: KeyboardEvent, item: WidgetDragItem): void {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    announceWidget(item)
  }
}
</script>

<template>
  <div class="qa-menu" role="menu" aria-label="Quick Actions">
    <!-- Context-specific actions -->
    <div v-if="hasContextActions" class="qa-menu__section">
      <span class="qa-menu__section-label">{{ store.currentView }}</span>
      <QuickActionItem
        v-for="action in contextActions"
        :key="action.id"
        :icon="action.icon"
        :label="action.label"
        :badge="action.badge"
        :badge-variant="action.badgeVariant"
        :shortcut-hint="action.shortcutHint"
        :disabled="action.disabled"
        role="menuitem"
        @click="handleAction(action.id)"
      />
    </div>

    <!-- Widget DnD Section (only on editor/monitor views) -->
    <template v-if="isWidgetCapableView">
      <div v-if="hasContextActions" class="qa-menu__separator" />
      <div class="qa-menu__section">
        <span class="qa-menu__section-label">
          <LayoutGrid class="qa-menu__section-icon" />
          Widgets
        </span>
        <div class="qa-widget-strip">
          <div
            v-for="(items, category) in groupedWidgetItems"
            :key="category"
            class="qa-widget-strip__group"
          >
            <span class="qa-widget-strip__category">{{ category }}</span>
            <div class="qa-widget-strip__items">
              <div
                v-for="item in items"
                :key="item.type"
                class="qa-widget-chip"
                draggable="true"
                tabindex="0"
                role="menuitem"
                :aria-label="`Widget ${item.label} auf Dashboard ziehen`"
                @dragstart="handleDragStart($event, item)"
                @dragend="handleDragEnd()"
                @keydown="handleWidgetKeydown($event, item)"
              >
                <span class="qa-widget-chip__label">{{ item.label }}</span>
              </div>
            </div>
          </div>
        </div>
        <span class="qa-widget-strip__hint">Auf Dashboard ziehen</span>
      </div>
    </template>

    <!-- Separator -->
    <div v-if="(hasContextActions || isWidgetCapableView) && globalActions.length > 0" class="qa-menu__separator" />

    <!-- Global actions (always available) -->
    <div v-if="globalActions.length > 0" class="qa-menu__section">
      <span class="qa-menu__section-label">Global</span>
      <QuickActionItem
        v-for="action in globalActions"
        :key="action.id"
        :icon="action.icon"
        :label="action.label"
        :badge="action.badge"
        :badge-variant="action.badgeVariant"
        :shortcut-hint="action.shortcutHint"
        :disabled="action.disabled"
        role="menuitem"
        @click="handleAction(action.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.qa-menu {
  position: absolute;
  bottom: calc(100% + var(--space-2));
  right: 0;
  min-width: 240px;
  max-width: 300px;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: rgba(20, 20, 30, 0.85);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--elevation-floating);
  transform-origin: bottom right;
}

.qa-menu__section {
  display: flex;
  flex-direction: column;
}

.qa-menu__section-label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) var(--space-3);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  opacity: 0.6;
}

.qa-menu__section-icon {
  width: 10px;
  height: 10px;
}

.qa-menu__separator {
  height: 1px;
  margin: var(--space-1) var(--space-2);
  background: var(--glass-border);
}

/* ── Widget Strip ── */

.qa-widget-strip {
  padding: 0 var(--space-2);
  max-height: 140px;
  overflow-y: auto;
}

.qa-widget-strip__group {
  margin-bottom: var(--space-1);
}

.qa-widget-strip__category {
  display: block;
  padding: 2px var(--space-1);
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  opacity: 0.5;
}

.qa-widget-strip__items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 0;
}

.qa-widget-chip {
  padding: 3px var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: grab;
  user-select: none;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.qa-widget-chip:hover {
  border-color: var(--color-iridescent-1);
  color: var(--color-text-primary);
  background: rgba(96, 165, 250, 0.08);
}

.qa-widget-chip:active {
  cursor: grabbing;
  transform: scale(0.96);
}

.qa-widget-chip:focus-visible {
  outline: 2px solid var(--color-iridescent-1);
  outline-offset: 1px;
}

.qa-widget-strip__hint {
  display: block;
  padding: 2px var(--space-3);
  font-size: 9px;
  color: var(--color-text-muted);
  opacity: 0.4;
  text-align: center;
}
</style>
