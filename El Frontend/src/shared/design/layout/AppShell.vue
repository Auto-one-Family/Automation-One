<script setup lang="ts">
/**
 * AppShell — Mission Control Layout Container
 *
 * Full viewport shell with fixed sidebar, header, and scrollable content area.
 * All dimensions driven by design tokens.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from './Sidebar.vue'
import AppHeader from './TopBar.vue'
import { useUiStore } from '@/shared/stores'
import { useKeyboardShortcuts } from '@/composables'

const uiStore = useUiStore()
const { register } = useKeyboardShortcuts()

// Mobile sidebar state
const sidebarOpen = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}

// ── Global Keyboard Shortcuts ──
const unregisterFns: Array<() => void> = []

onMounted(() => {
  // Ctrl+K → Command Palette toggle
  unregisterFns.push(register({
    key: 'k',
    ctrl: true,
    handler: (e) => {
      e.preventDefault()
      uiStore.toggleCommandPalette()
    },
    description: 'Command Palette öffnen',
    scope: 'global',
  }))

  // Escape → Close topmost overlay
  unregisterFns.push(register({
    key: 'Escape',
    handler: (e) => {
      const closed = uiStore.closeTopModal()
      if (closed) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    description: 'Overlay schließen',
    scope: 'global',
  }))
})

onUnmounted(() => {
  unregisterFns.forEach(fn => fn())
})
</script>

<template>
  <div class="shell">
    <!-- Mobile Overlay -->
    <Transition name="overlay">
      <div
        v-if="sidebarOpen"
        class="shell__overlay"
        @click="closeSidebar"
      />
    </Transition>

    <!-- Sidebar -->
    <AppSidebar
      :is-open="sidebarOpen"
      @close="closeSidebar"
    />

    <!-- Main Area (offset by sidebar on desktop) -->
    <div class="shell__main">
      <!-- Header -->
      <AppHeader @toggle-sidebar="toggleSidebar" />

      <!-- Page Content — scrollable -->
      <main class="shell__content">
        <RouterView v-slot="{ Component }">
          <keep-alive :include="['MonitorView', 'LogicView', 'CustomDashboardView']" :max="5">
            <component :is="Component" />
          </keep-alive>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   APP SHELL — Full viewport layout with sidebar offset
   ═══════════════════════════════════════════════════════════════════════════ */

.shell {
  height: 100vh;
  display: flex;
  background-color: var(--color-bg-primary);
  overflow: hidden;
}

/* Mobile overlay with blur */
.shell__overlay {
  position: fixed;
  inset: 0;
  background: rgba(7, 7, 13, 0.6);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  z-index: var(--z-fixed);
}

@media (min-width: 768px) {
  .shell__overlay {
    display: none;
  }
}

/* Main content area — fills remaining space */
.shell__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: 0;
  min-width: 0;
  transition: margin-left 0.3s var(--ease-out);
}

@media (min-width: 768px) {
  .shell__main {
    margin-left: var(--sidebar-width);
  }
}

/* Scrollable page content */
.shell__content {
  flex: 1;
  padding: var(--space-4) var(--space-4);
  overflow-y: auto;
  min-height: 0;
}

@media (min-width: 768px) {
  .shell__content {
    padding: var(--space-6);
  }
}

/* ── Overlay Transition ── */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.3s var(--ease-out);
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}
</style>
