<script setup lang="ts">
/**
 * LevelNavigation — Segmented control for 3-level dashboard navigation.
 *
 * Three tabs: "ESPs" (L1) | "Komponenten" (L2) | "Zonen" (L3)
 * Glassmorphism styling consistent with the design system.
 */

import { Cpu, Activity, Map } from 'lucide-vue-next'
import type { ZoomLevel } from '@/composables/useZoomNavigation'

interface Props {
  currentLevel: ZoomLevel
  isTransitioning?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:currentLevel': [level: ZoomLevel]
}>()

const levels: { level: ZoomLevel; label: string; icon: typeof Cpu }[] = [
  { level: 1, label: 'ESPs', icon: Cpu },
  { level: 2, label: 'Komponenten', icon: Activity },
  { level: 3, label: 'Zonen', icon: Map },
]
</script>

<template>
  <nav class="level-nav" role="tablist" aria-label="Dashboard-Ansicht">
    <button
      v-for="item in levels"
      :key="item.level"
      role="tab"
      :aria-selected="currentLevel === item.level"
      :class="[
        'level-nav__tab',
        { 'level-nav__tab--active': currentLevel === item.level }
      ]"
      :disabled="isTransitioning"
      @click="emit('update:currentLevel', item.level)"
    >
      <component :is="item.icon" class="level-nav__icon" />
      <span class="level-nav__label">{{ item.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.level-nav {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 0.625rem;
  backdrop-filter: blur(12px);
}

.level-nav__tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.level-nav__tab:hover:not(:disabled) {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.level-nav__tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.level-nav__tab--active {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.level-nav__tab--active:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.level-nav__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.level-nav__label {
  line-height: 1;
}

/* Responsive: Stack on very narrow screens */
@media (max-width: 400px) {
  .level-nav__label {
    display: none;
  }

  .level-nav__tab {
    padding: 0.5rem;
  }

  .level-nav__icon {
    width: 1rem;
    height: 1rem;
  }
}
</style>
