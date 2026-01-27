<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWebSocket } from '@/composables/useWebSocket'
import { LogOut, User, ChevronDown, Menu, Wifi, WifiOff } from 'lucide-vue-next'

// Emit for sidebar toggle
const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const router = useRouter()
const authStore = useAuthStore()
const showUserMenu = ref(false)

// WebSocket Connection Status
const { isConnected, connectionStatus } = useWebSocket({ autoConnect: true })

// Computed: Server Status Text
const serverStatusText = computed(() => {
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

// Computed: Server Status Class
const serverStatusClass = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return 'server-status--connected'
    case 'connecting':
      return 'server-status--connecting'
    case 'error':
      return 'server-status--error'
    default:
      return 'server-status--disconnected'
  }
})

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <header class="h-16 bg-dark-900 border-b border-dark-700 flex items-center justify-between px-4 md:px-6">
    <!-- Left Side: Hamburger + Title -->
    <div class="flex items-center gap-3">
      <!-- Hamburger Menu Button - Mobile Only -->
      <button
        class="md:hidden p-2 rounded-lg hover:bg-dark-800 transition-colors touch-target"
        @click="emit('toggle-sidebar')"
      >
        <Menu class="w-6 h-6 text-dark-300" />
      </button>

      <!-- Page Title (can be dynamic via route meta) -->
      <h2 class="text-base md:text-lg font-semibold text-dark-100">
        {{ $route.meta.title || 'AutomationOne' }}
      </h2>
    </div>

    <!-- Right Side -->
    <div class="flex items-center gap-4">
      <!-- Server Connection Status -->
      <div
        class="server-status"
        :class="serverStatusClass"
        :title="serverStatusText"
      >
        <span class="status-dot" :class="{ 'animate-pulse': connectionStatus === 'connecting' || isConnected }"></span>
        <component :is="isConnected ? Wifi : WifiOff" class="w-4 h-4" />
        <span class="hidden md:inline">{{ serverStatusText }}</span>
      </div>

      <!-- User Menu -->
      <div class="relative">
        <button
          class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-dark-800 transition-colors"
          @click="showUserMenu = !showUserMenu"
        >
          <div class="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
            <User class="w-4 h-4 text-dark-300" />
          </div>
          <span class="text-sm text-dark-200">{{ authStore.user?.username }}</span>
          <ChevronDown class="w-4 h-4 text-dark-400" />
        </button>

        <!-- Dropdown -->
        <div
          v-if="showUserMenu"
          class="absolute right-0 mt-2 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50"
          @click="showUserMenu = false"
        >
          <div class="p-3 border-b border-dark-700">
            <p class="text-sm font-medium text-dark-100">{{ authStore.user?.username }}</p>
            <p class="text-xs text-dark-400">{{ authStore.user?.email }}</p>
          </div>
          <div class="p-2">
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-dark-700 rounded-lg transition-colors"
              @click="handleLogout"
            >
              <LogOut class="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- Click outside to close menu -->
  <div
    v-if="showUserMenu"
    class="fixed inset-0 z-40"
    @click="showUserMenu = false"
  />
</template>

<style scoped>
/* =============================================================================
   Server Connection Status - Iridescent Badge
   ============================================================================= */
.server-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

/* Connected - Green Glow */
.server-status--connected {
  color: rgb(52, 211, 153);
  background: linear-gradient(135deg,
    rgba(52, 211, 153, 0.2) 0%,
    rgba(52, 211, 153, 0.1) 100%
  );
  border: 1px solid rgba(52, 211, 153, 0.3);
  box-shadow: 0 0 15px rgba(52, 211, 153, 0.2);
}

.server-status--connected .status-dot {
  box-shadow: 0 0 8px currentColor;
}

/* Connecting - Yellow Glow */
.server-status--connecting {
  color: rgb(251, 191, 36);
  background: linear-gradient(135deg,
    rgba(251, 191, 36, 0.2) 0%,
    rgba(251, 191, 36, 0.1) 100%
  );
  border: 1px solid rgba(251, 191, 36, 0.3);
  box-shadow: 0 0 15px rgba(251, 191, 36, 0.2);
}

/* Disconnected - Red Glow */
.server-status--disconnected,
.server-status--error {
  color: rgb(239, 68, 68);
  background: linear-gradient(135deg,
    rgba(239, 68, 68, 0.2) 0%,
    rgba(239, 68, 68, 0.1) 100%
  );
  border: 1px solid rgba(239, 68, 68, 0.3);
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.2);
}

/* Pulse Animation */
.animate-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
