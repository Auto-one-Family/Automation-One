<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { LogOut, User, ChevronDown, Menu } from 'lucide-vue-next'

// Emit for sidebar toggle
const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const router = useRouter()
const authStore = useAuthStore()
const showUserMenu = ref(false)

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
        {{ $route.meta.title || 'Debug Dashboard' }}
      </h2>
    </div>

    <!-- Right Side -->
    <div class="flex items-center gap-4">
      <!-- Connection Status -->
      <div class="flex items-center gap-2 text-sm">
        <span class="status-online animate-pulse"></span>
        <span class="text-dark-400">Server Connected</span>
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
