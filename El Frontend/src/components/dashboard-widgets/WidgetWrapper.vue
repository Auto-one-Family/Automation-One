<script setup lang="ts">
/**
 * WidgetWrapper
 *
 * Container component for all dashboard widgets.
 * Provides header (title, config icon, remove button), body slot,
 * and config drawer integration.
 */

import { ref } from 'vue'
import { Settings, X, GripVertical } from 'lucide-vue-next'

interface Props {
  title: string
  icon?: any
  badge?: string | number
  configurable?: boolean
  removable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  icon: undefined,
  badge: undefined,
  configurable: true,
  removable: true,
})

const emit = defineEmits<{
  remove: []
  'toggle-config': [open: boolean]
}>()

const showConfig = ref(false)

function toggleConfig() {
  showConfig.value = !showConfig.value
  emit('toggle-config', showConfig.value)
}
</script>

<template>
  <div class="widget-wrapper">
    <!-- Header (drag handle) -->
    <div class="widget-header gs-drag-handle">
      <div class="widget-header__left">
        <GripVertical class="widget-header__grip" />
        <component :is="props.icon" v-if="props.icon" class="widget-header__icon" />
        <span class="widget-header__title">{{ props.title }}</span>
        <span v-if="props.badge != null" class="widget-header__badge">{{ props.badge }}</span>
      </div>
      <div class="widget-header__actions">
        <button
          v-if="props.configurable"
          class="widget-header__btn"
          title="Konfiguration"
          @click.stop="toggleConfig"
        >
          <Settings class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="props.removable"
          class="widget-header__btn widget-header__btn--danger"
          title="Widget entfernen"
          @click.stop="$emit('remove')"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="widget-body">
      <slot />
    </div>

    <!-- Config Drawer -->
    <Transition name="widget-config">
      <div v-if="showConfig" class="widget-config">
        <slot name="config" :close="() => { showConfig = false }" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.widget-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--glass-border);
  background: var(--color-bg-secondary);
  cursor: grab;
  min-height: 32px;
  user-select: none;
}

.widget-header:active {
  cursor: grabbing;
}

.widget-header__left {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.widget-header__grip {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  opacity: 0.5;
}

.widget-header__icon {
  width: 14px;
  height: 14px;
  color: var(--color-accent-bright);
  flex-shrink: 0;
}

.widget-header__title {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-header__badge {
  font-size: 10px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  color: white;
  line-height: 16px;
  flex-shrink: 0;
}

.widget-header__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.widget-header__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.widget-header__btn:hover {
  background: var(--color-bg-quaternary);
  color: var(--color-text-secondary);
}

.widget-header__btn--danger:hover {
  background: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
}

.widget-body {
  flex: 1;
  min-height: 0;
  padding: var(--space-2);
  overflow: auto;
}

.widget-config {
  border-top: 1px solid var(--glass-border);
  padding: var(--space-2);
  background: var(--color-bg-quaternary);
}

.widget-config-enter-active,
.widget-config-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.widget-config-enter-from,
.widget-config-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
