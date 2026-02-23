<script setup lang="ts">
/**
 * ViewTabBar
 *
 * Tab navigation bar for switching between Hardware / Monitor / Dashboard views.
 * RouterLink-based for proper URL handling and browser history.
 */

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { LayoutGrid, Activity, LayoutDashboard } from 'lucide-vue-next'

interface TabItem {
  label: string
  to: string
  icon: any
  match: (path: string) => boolean
}

const route = useRoute()

const tabs: TabItem[] = [
  {
    label: 'Hardware',
    to: '/',
    icon: LayoutGrid,
    match: (path) => path === '/' || path === '',
  },
  {
    label: 'Monitor',
    to: '/system-monitor',
    icon: Activity,
    match: (path) => path.startsWith('/system-monitor'),
  },
  {
    label: 'Dashboard',
    to: '/custom-dashboard',
    icon: LayoutDashboard,
    match: (path) => path.startsWith('/custom-dashboard'),
  },
]

const activeTab = computed(() => {
  const path = route.path
  return tabs.findIndex(t => t.match(path))
})
</script>

<template>
  <nav class="view-tab-bar">
    <RouterLink
      v-for="(tab, idx) in tabs"
      :key="tab.to"
      :to="tab.to"
      class="tab-item"
      :class="{ 'tab-item--active': activeTab === idx }"
    >
      <component :is="tab.icon" class="tab-icon" />
      <span class="tab-label">{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.view-tab-bar {
  display: flex;
  gap: 2px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 3px;
  margin-bottom: var(--space-3);
}

.tab-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: calc(var(--radius-md) - 2px);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  text-decoration: none;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.tab-item:hover {
  color: var(--color-text-secondary);
  background: var(--color-bg-quaternary);
}

.tab-item--active {
  background: var(--color-bg-tertiary);
  color: var(--color-accent-bright);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.tab-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.tab-label {
  /* Hidden on very small screens */
}

@media (max-width: 480px) {
  .tab-label {
    display: none;
  }

  .tab-item {
    padding: var(--space-2);
  }
}
</style>
