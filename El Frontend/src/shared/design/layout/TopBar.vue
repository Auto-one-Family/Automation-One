<script setup lang="ts">
/**
 * TopBar — Mission Control Header
 *
 * Design: NOT-AUS as the only red element (visually heavy, always visible),
 * server status as a subtle pulse-dot, context info breadcrumb.
 */

import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWebSocket } from '@/composables/useWebSocket'
import { LogOut, ChevronDown, Menu } from 'lucide-vue-next'
import EmergencyStopButton from '@/components/safety/EmergencyStopButton.vue'

// Emit for sidebar toggle
const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const showUserMenu = ref(false)

// WebSocket Connection Status
const { connectionStatus } = useWebSocket({ autoConnect: true })

// Computed: connection dot class
const connectionDotClass = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return 'header__dot--connected'
    case 'connecting':
      return 'header__dot--connecting'
    case 'error':
      return 'header__dot--error'
    default:
      return 'header__dot--disconnected'
  }
})

// Computed: connection tooltip
const connectionTooltip = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return 'Server verbunden'
    case 'connecting':
      return 'Verbinde...'
    case 'error':
      return 'Verbindungsfehler'
    default:
      return 'Server getrennt'
  }
})

// Computed: page title from route
const pageTitle = computed(() => {
  return (route.meta.title as string) || 'Dashboard'
})

async function handleLogout() {
  showUserMenu.value = false
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <header class="header">
    <!-- Left: Hamburger (mobile) + Context -->
    <div class="header__left">
      <button
        class="header__hamburger"
        @click="emit('toggle-sidebar')"
      >
        <Menu class="header__hamburger-icon" />
      </button>

      <!-- Context Breadcrumb -->
      <div class="header__context">
        <span class="header__page-title">{{ pageTitle }}</span>
      </div>
    </div>

    <!-- Right: Status + Emergency + User -->
    <div class="header__right">
      <!-- Server Connection: Subtle Pulse Dot -->
      <div
        class="header__connection"
        :title="connectionTooltip"
      >
        <span
          class="header__dot"
          :class="connectionDotClass"
        />
        <span class="header__connection-label">{{ connectionTooltip }}</span>
      </div>

      <!-- Divider -->
      <div class="header__divider" />

      <!-- Emergency Stop — THE only red element -->
      <EmergencyStopButton />

      <!-- Divider -->
      <div class="header__divider" />

      <!-- User Menu -->
      <div class="header__user-wrapper">
        <button
          class="header__user-trigger"
          @click="showUserMenu = !showUserMenu"
        >
          <div class="header__user-avatar">
            {{ authStore.user?.username?.charAt(0).toUpperCase() || '?' }}
          </div>
          <ChevronDown class="header__chevron" />
        </button>

        <!-- Dropdown Menu -->
        <Transition name="dropdown">
          <div
            v-if="showUserMenu"
            class="header__dropdown"
          >
            <div class="header__dropdown-info">
              <p class="header__dropdown-name">{{ authStore.user?.username }}</p>
              <p class="header__dropdown-email">{{ authStore.user?.email || authStore.user?.role }}</p>
            </div>
            <div class="header__dropdown-actions">
              <button
                class="header__dropdown-item"
                @click="handleLogout"
              >
                <LogOut class="header__dropdown-item-icon" />
                Abmelden
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </header>

  <!-- Click outside to close menu -->
  <div
    v-if="showUserMenu"
    class="header__click-away"
    @click="showUserMenu = false"
  />
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   HEADER — Mission Control Top Bar
   Clean, minimal, purposeful. NOT-AUS is the loudest element.
   ═══════════════════════════════════════════════════════════════════════════ */

.header {
  height: var(--header-height);
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

/* ── Left Section ── */
.header__left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.header__hamburger {
  display: none;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
}

.header__hamburger:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
}

.header__hamburger-icon {
  width: 20px;
  height: 20px;
}

@media (max-width: 767px) {
  .header__hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* Context / Breadcrumb */
.header__context {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.header__page-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Right Section ── */
.header__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* ── Server Connection Dot ── */
.header__connection {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  cursor: default;
}

.header__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  transition: background-color var(--transition-base), box-shadow var(--transition-base);
}

.header__dot--connected {
  background-color: var(--color-success);
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
  animation: pulse-dot 3s ease-in-out infinite;
}

.header__dot--connecting {
  background-color: var(--color-warning);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

.header__dot--error {
  background-color: var(--color-error);
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
}

.header__dot--disconnected {
  background-color: var(--color-text-muted);
}

.header__connection-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

@media (max-width: 767px) {
  .header__connection-label {
    display: none;
  }
}

/* ── Vertical Divider ── */
.header__divider {
  width: 1px;
  height: 20px;
  background-color: var(--glass-border);
  flex-shrink: 0;
}

/* ── User Menu ── */
.header__user-wrapper {
  position: relative;
}

.header__user-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.header__user-trigger:hover {
  background-color: var(--color-bg-tertiary);
}

.header__user-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-bg-tertiary), var(--color-bg-quaternary));
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.header__chevron {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.header__user-trigger:hover .header__chevron {
  color: var(--color-text-secondary);
}

/* ── Dropdown ── */
.header__dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-2));
  width: 200px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-floating);
  z-index: var(--z-dropdown);
  overflow: hidden;
}

.header__dropdown-info {
  padding: var(--space-3);
  border-bottom: 1px solid var(--glass-border);
}

.header__dropdown-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.header__dropdown-email {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: 2px;
  text-transform: capitalize;
}

.header__dropdown-actions {
  padding: var(--space-1);
}

.header__dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-error);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);
}

.header__dropdown-item:hover {
  background-color: var(--color-bg-quaternary);
}

.header__dropdown-item-icon {
  width: 14px;
  height: 14px;
}

/* Dropdown Transition */
.dropdown-enter-active {
  transition: all var(--duration-fast) var(--ease-out);
}

.dropdown-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

/* ── Click-away overlay ── */
.header__click-away {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-dropdown) - 1);
}
</style>
