<script setup lang="ts">
/**
 * AppSidebar Component
 *
 * Flat navigation sidebar with:
 * - Direct links (no nested groups)
 * - Visual dividers between sections
 * - Admin-only items (conditional)
 * - Mobile responsive
 */

import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  X,
  LayoutDashboard,
  Cpu,
  Workflow,
  Monitor,
  Users,
  Settings,
  Wrench,
  Zap,
  UserCog,
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

// Check if a route is active
function isActive(to: string): boolean {
  if (to === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(to)
}

// Handle nav click - close sidebar on mobile
function handleNavClick() {
  emit('close')
}
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

    <!-- Navigation: Flat links -->
    <nav class="sidebar__nav">
      <!-- Haupt-Navigation -->
      <RouterLink
        to="/"
        :class="['sidebar__link', isActive('/') ? 'sidebar__link--active' : '']"
        @click="handleNavClick"
      >
        <LayoutDashboard class="sidebar__link-icon" />
        <span>Dashboard</span>
      </RouterLink>

      <RouterLink
        to="/sensors"
        :class="['sidebar__link', isActive('/sensors') ? 'sidebar__link--active' : '']"
        @click="handleNavClick"
      >
        <Cpu class="sidebar__link-icon" />
        <span>Komponenten</span>
      </RouterLink>

      <RouterLink
        to="/logic"
        :class="['sidebar__link', isActive('/logic') ? 'sidebar__link--active' : '']"
        @click="handleNavClick"
      >
        <Workflow class="sidebar__link-icon" />
        <span>Regeln</span>
      </RouterLink>

      <!-- Divider -->
      <div class="sidebar__divider" />

      <!-- Monitoring -->
      <RouterLink
        to="/system-monitor"
        :class="['sidebar__link', isActive('/system-monitor') ? 'sidebar__link--active' : '']"
        @click="handleNavClick"
      >
        <Monitor class="sidebar__link-icon" />
        <span>System Monitor</span>
      </RouterLink>

      <!-- Admin Section -->
      <template v-if="authStore.isAdmin">
        <!-- Divider -->
        <div class="sidebar__divider" />

        <RouterLink
          to="/users"
          :class="['sidebar__link', isActive('/users') ? 'sidebar__link--active' : '']"
          @click="handleNavClick"
        >
          <Users class="sidebar__link-icon" />
          <span>Benutzer</span>
        </RouterLink>

        <RouterLink
          to="/system-config"
          :class="['sidebar__link', isActive('/system-config') ? 'sidebar__link--active' : '']"
          @click="handleNavClick"
        >
          <Settings class="sidebar__link-icon" />
          <span>System</span>
        </RouterLink>

        <RouterLink
          to="/maintenance"
          :class="['sidebar__link', isActive('/maintenance') ? 'sidebar__link--active' : '']"
          @click="handleNavClick"
        >
          <Wrench class="sidebar__link-icon" />
          <span>Wartung</span>
        </RouterLink>

        <RouterLink
          to="/load-test"
          :class="['sidebar__link', isActive('/load-test') ? 'sidebar__link--active' : '']"
          @click="handleNavClick"
        >
          <Zap class="sidebar__link-icon" />
          <span>Last-Tests</span>
        </RouterLink>
      </template>
    </nav>

    <!-- Footer: Settings & User Info -->
    <div class="sidebar__footer">
      <!-- Settings Link (visible for all users) -->
      <RouterLink
        to="/settings"
        :class="['sidebar__link', isActive('/settings') ? 'sidebar__link--active' : '']"
        @click="handleNavClick"
      >
        <UserCog class="sidebar__link-icon" />
        <span>Einstellungen</span>
      </RouterLink>

      <!-- User Info -->
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
  padding: 1rem 0.75rem;
}

/* Divider between sections */
.sidebar__divider {
  height: 1px;
  background-color: var(--glass-border);
  margin: 0.75rem 0.5rem;
}

/* Navigation links - FLAT */
.sidebar__link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin-bottom: 0.25rem;
  border-radius: 0.5rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s ease;
  text-decoration: none;
  min-height: 44px; /* Touch target */
}

.sidebar__link:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
  transform: translateX(2px);
}

.sidebar__link:active {
  transform: translateX(0);
}

.sidebar__link--active {
  color: var(--color-iridescent-1);
  background-color: var(--color-bg-tertiary);
  border-left: 2px solid var(--color-iridescent-1);
  margin-left: -2px;
}

.sidebar__link--active:hover {
  transform: none;
}

.sidebar__link-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

/* Footer / User info */
.sidebar__footer {
  padding: 1rem 0.75rem;
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.sidebar__user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
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
