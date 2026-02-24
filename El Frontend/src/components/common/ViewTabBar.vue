<script setup lang="ts">
/**
 * ViewTabBar — Shared Tab Navigation for Hardware/Monitor/Dashboard
 *
 * A sticky tab bar displayed at the top of the content area on all three
 * main views. Uses RouterLink for URL-based navigation so browser
 * back/forward works correctly.
 *
 * Active tab is determined by the current route path.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Cpu, Activity, LayoutGrid } from 'lucide-vue-next'

const route = useRoute()

const tabs = [
  { path: '/hardware', label: 'Hardware', icon: Cpu },
  { path: '/monitor', label: 'Monitor', icon: Activity },
  { path: '/custom-dashboard', label: 'Dashboard', icon: LayoutGrid },
] as const

const activeTab = computed(() => {
  const path = route.path
  if (path.startsWith('/hardware')) return '/hardware'
  if (path.startsWith('/monitor')) return '/monitor'
  if (path.startsWith('/custom-dashboard')) return '/custom-dashboard'
  return '/hardware'
})
</script>

<template>
  <nav class="view-tab-bar" aria-label="Hauptansichten">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.path"
      :to="tab.path"
      :class="['view-tab-bar__tab', { 'view-tab-bar__tab--active': activeTab === tab.path }]"
    >
      <component :is="tab.icon" class="view-tab-bar__icon" />
      <span class="view-tab-bar__label">{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.view-tab-bar {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  width: fit-content;
  margin-bottom: var(--space-4);
}

.view-tab-bar__tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: all var(--transition-fast);
  white-space: nowrap;
  position: relative;
}

.view-tab-bar__tab:hover {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.02);
}

.view-tab-bar__tab--active {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.view-tab-bar__tab--active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 2px;
  background: var(--color-accent-bright);
  border-radius: 1px;
  box-shadow: 0 0 6px rgba(96, 165, 250, 0.4);
}

.view-tab-bar__tab--active .view-tab-bar__icon {
  color: var(--color-accent-bright);
}

.view-tab-bar__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition: color var(--transition-fast);
}

.view-tab-bar__label {
  display: inline;
}

@media (max-width: 480px) {
  .view-tab-bar {
    width: 100%;
  }

  .view-tab-bar__tab {
    flex: 1;
    justify-content: center;
    padding: var(--space-2) var(--space-2);
  }

  .view-tab-bar__label {
    display: none;
  }
}
</style>
