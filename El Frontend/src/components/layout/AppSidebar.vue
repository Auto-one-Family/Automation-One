<script setup lang="ts">
/**
 * AppSidebar Component
 * 
 * Main navigation sidebar with:
 * - Grouped navigation items
 * - Collapsible groups
 * - Admin-only sections
 * - Iridescent active state
 * - Mobile responsive
 */

import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  X,
  ChevronDown,
  LayoutDashboard,
  Cpu,
  Thermometer,
  Power,
  Workflow,
  Activity,
  FileText,
  Users,
  Database,
  Settings,
  Zap,
  MessageSquare,
} from 'lucide-vue-next'

// Props & Emits for mobile responsive
defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const route = useRoute()
const authStore = useAuthStore()

// Collapsed state for groups (persisted to localStorage)
const collapsedGroups = ref<Set<string>>(new Set())

// Load collapsed state from localStorage
const loadCollapsedState = () => {
  try {
    const saved = localStorage.getItem('sidebar_collapsed_groups')
    if (saved) {
      collapsedGroups.value = new Set(JSON.parse(saved))
    }
  } catch {
    // Ignore errors
  }
}

// Save collapsed state to localStorage
const saveCollapsedState = () => {
  try {
    localStorage.setItem(
      'sidebar_collapsed_groups', 
      JSON.stringify([...collapsedGroups.value])
    )
  } catch {
    // Ignore errors
  }
}

loadCollapsedState()

// Toggle group collapsed state
const toggleGroup = (groupId: string) => {
  if (collapsedGroups.value.has(groupId)) {
    collapsedGroups.value.delete(groupId)
  } else {
    collapsedGroups.value.add(groupId)
  }
  saveCollapsedState()
}

// Check if group is collapsed
const isGroupCollapsed = (groupId: string) => collapsedGroups.value.has(groupId)

// Navigation structure
interface NavItem {
  name: string
  to: string
  icon?: typeof LayoutDashboard
}

interface NavGroup {
  id: string
  label?: string
  icon?: typeof LayoutDashboard
  adminOnly?: boolean
  items: NavItem[]
}

const navigationGroups: NavGroup[] = [
  {
    id: 'main',
    items: [
      { name: 'Dashboard', to: '/', icon: LayoutDashboard },
    ]
  },
  {
    id: 'devices',
    label: 'Geräte',
    icon: Cpu,
    items: [
      { name: 'Alle ESPs', to: '/devices', icon: Cpu },
      { name: 'Sensoren', to: '/sensors', icon: Thermometer },
      { name: 'Aktoren', to: '/actuators', icon: Power },
    ]
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Workflow,
    items: [
      { name: 'Regeln', to: '/logic', icon: Workflow },
      // { name: 'Verlauf', to: '/logic/history', icon: History },
    ]
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: Activity,
    items: [
      { name: 'MQTT Live', to: '/mqtt-log', icon: MessageSquare },
      { name: 'Server Logs', to: '/logs', icon: FileText },
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Settings,
    adminOnly: true,
    items: [
      { name: 'Benutzer', to: '/users', icon: Users },
      { name: 'Datenbank', to: '/database', icon: Database },
      { name: 'System', to: '/system-config', icon: Settings },
      { name: 'Last-Tests', to: '/load-test', icon: Zap },
    ]
  }
]

// Filter groups based on admin status
const filteredGroups = computed(() => 
  navigationGroups.filter(group => !group.adminOnly || authStore.isAdmin)
)

// Check if a route is active
function isActive(to: string): boolean {
  if (to === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(to)
}

// Check if any item in a group is active
function isGroupActive(group: NavGroup): boolean {
  return group.items.some(item => isActive(item.to))
}

// Handle nav click - close sidebar on mobile
function handleNavClick() {
  emit('close')
}

// Auto-expand groups when a child is active
watch(() => route.path, () => {
  for (const group of navigationGroups) {
    if (group.label && isGroupActive(group)) {
      collapsedGroups.value.delete(group.id)
    }
  }
}, { immediate: true })
</script>

<template>
  <aside
    :class="[
      'sidebar',
      isOpen ? 'sidebar--open' : 'sidebar--closed',
    ]"
  >
    <!-- Logo & Close Button -->
    <div class="sidebar__header">
      <h1 class="sidebar__logo">
        <span class="text-gradient">AutomationOne</span>
      </h1>
      <!-- Close button - mobile only -->
      <button
        class="sidebar__close-btn md:hidden"
        @click="emit('close')"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="sidebar__nav">
      <template v-for="group in filteredGroups" :key="group.id">
        <!-- Group without header (main) -->
        <div v-if="!group.label" class="sidebar__group">
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            :class="[
              'sidebar__link',
              isActive(item.to) ? 'sidebar__link--active' : ''
            ]"
            @click="handleNavClick"
          >
            <component v-if="item.icon" :is="item.icon" class="sidebar__link-icon" />
            <span>{{ item.name }}</span>
          </RouterLink>
        </div>
        
        <!-- Group with header (collapsible) -->
        <div v-else class="sidebar__group">
          <button
            class="sidebar__group-header"
            :class="{ 'sidebar__group-header--active': isGroupActive(group) }"
            @click="toggleGroup(group.id)"
          >
            <div class="sidebar__group-header-left">
              <component v-if="group.icon" :is="group.icon" class="sidebar__group-icon" />
              <span class="sidebar__group-label">{{ group.label }}</span>
            </div>
            <ChevronDown 
              :class="[
                'sidebar__group-chevron',
                isGroupCollapsed(group.id) ? '' : 'sidebar__group-chevron--open'
              ]"
            />
          </button>
          
          <!-- Collapsible items -->
          <div 
            v-show="!isGroupCollapsed(group.id)"
            class="sidebar__group-items"
          >
            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              :class="[
                'sidebar__link sidebar__link--nested',
                isActive(item.to) ? 'sidebar__link--active' : ''
              ]"
              @click="handleNavClick"
            >
              <component v-if="item.icon" :is="item.icon" class="sidebar__link-icon" />
              <span>{{ item.name }}</span>
            </RouterLink>
          </div>
        </div>
      </template>
    </nav>

    <!-- User Info -->
    <div class="sidebar__footer">
      <div class="sidebar__user">
        <div class="sidebar__user-avatar">
          {{ authStore.user?.username?.charAt(0).toUpperCase() || '?' }}
        </div>
        <div class="sidebar__user-info">
          <p class="sidebar__user-name">
            {{ authStore.user?.username || 'Unbekannt' }}
          </p>
          <p class="sidebar__user-role">
            {{ authStore.user?.role || 'user' }}
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: 16rem;
  background-color: var(--color-bg-secondary);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  z-index: 40;
  transition: transform 0.3s ease-in-out;
}

/* Mobile: hidden by default */
.sidebar--closed {
  transform: translateX(-100%);
}

.sidebar--open {
  transform: translateX(0);
}

/* Desktop: always visible */
@media (min-width: 768px) {
  .sidebar {
    transform: translateX(0);
  }
}

/* Header */
.sidebar__header {
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.sidebar__logo {
  font-size: 1.25rem;
  font-weight: 700;
}

.sidebar__close-btn {
  padding: 0.5rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  transition: all 0.2s;
}

.sidebar__close-btn:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
}

/* Navigation */
.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.sidebar__group {
  margin-bottom: 0.5rem;
}

/* Group header (collapsible) */
.sidebar__group-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: all 0.2s;
  cursor: pointer;
  background: transparent;
  border: none;
}

.sidebar__group-header:hover {
  color: var(--color-text-secondary);
  background-color: var(--color-bg-tertiary);
}

.sidebar__group-header--active {
  color: var(--color-iridescent-1);
}

.sidebar__group-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sidebar__group-icon {
  width: 1rem;
  height: 1rem;
}

.sidebar__group-chevron {
  width: 1rem;
  height: 1rem;
  transition: transform 0.2s;
}

.sidebar__group-chevron--open {
  transform: rotate(180deg);
}

.sidebar__group-items {
  margin-top: 0.25rem;
  margin-left: 0.5rem;
  padding-left: 0.5rem;
  border-left: 1px solid var(--glass-border);
}

/* Navigation links */
.sidebar__link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s;
  text-decoration: none;
  min-height: 44px; /* Touch target */
}

.sidebar__link:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
}

.sidebar__link--active {
  color: var(--color-iridescent-1);
  background-color: var(--color-bg-tertiary);
  border-left: 2px solid var(--color-iridescent-1);
  margin-left: -2px;
}

.sidebar__link--nested {
  padding-left: 1rem;
}

.sidebar__link-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

/* Footer / User info */
.sidebar__footer {
  padding: 1rem;
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.sidebar__user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sidebar__user-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background-color: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.sidebar__user-info {
  flex: 1;
  min-width: 0;
}

.sidebar__user-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-role {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: capitalize;
}
</style>
