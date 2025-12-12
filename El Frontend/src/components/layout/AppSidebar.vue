<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  LayoutDashboard,
  Cpu,
  Thermometer,
  Power,
  MessageSquare,
  GitBranch,
  Settings,
} from 'lucide-vue-next'

const route = useRoute()
const authStore = useAuthStore()

const navigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Mock ESPs', to: '/mock-esp', icon: Cpu, requiresAdmin: true },
  { name: 'Sensors', to: '/sensors', icon: Thermometer },
  { name: 'Actuators', to: '/actuators', icon: Power },
  { name: 'MQTT Log', to: '/mqtt-log', icon: MessageSquare },
  { name: 'Logic Rules', to: '/logic', icon: GitBranch },
  { name: 'Settings', to: '/settings', icon: Settings },
]

const filteredNavigation = navigation.filter(
  item => !item.requiresAdmin || authStore.isAdmin
)

function isActive(to: string): boolean {
  if (to === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(to)
}
</script>

<template>
  <aside class="fixed left-0 top-0 h-screen w-64 bg-dark-900 border-r border-dark-700 flex flex-col z-40">
    <!-- Logo -->
    <div class="h-16 flex items-center px-6 border-b border-dark-700">
      <h1 class="text-xl font-bold text-gradient">El Frontend</h1>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
      <RouterLink
        v-for="item in filteredNavigation"
        :key="item.name"
        :to="item.to"
        :class="[
          isActive(item.to) ? 'sidebar-link-active' : 'sidebar-link',
        ]"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span>{{ item.name }}</span>
      </RouterLink>
    </nav>

    <!-- User Info -->
    <div class="p-4 border-t border-dark-700">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center">
          <span class="text-sm font-medium text-dark-200">
            {{ authStore.user?.username?.charAt(0).toUpperCase() || '?' }}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-dark-100 truncate">
            {{ authStore.user?.username || 'Unknown' }}
          </p>
          <p class="text-xs text-dark-400 capitalize">
            {{ authStore.user?.role || 'user' }}
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>
