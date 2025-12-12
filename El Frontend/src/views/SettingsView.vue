<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { Settings, User, LogOut, Server } from 'lucide-vue-next'

const authStore = useAuthStore()
const router = useRouter()

const apiUrl = ref(window.location.origin)

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

async function handleLogoutAll() {
  if (confirm('This will log you out from all devices. Continue?')) {
    await authStore.logout(true)
    router.push('/login')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-dark-100">Settings</h1>
      <p class="text-dark-400 mt-1">Application configuration</p>
    </div>

    <!-- User Info -->
    <div class="card">
      <div class="card-header flex items-center gap-3">
        <User class="w-5 h-5 text-blue-400" />
        <h3 class="font-semibold text-dark-100">User Account</h3>
      </div>
      <div class="card-body space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-sm text-dark-400">Username</p>
            <p class="text-dark-100">{{ authStore.user?.username }}</p>
          </div>
          <div>
            <p class="text-sm text-dark-400">Email</p>
            <p class="text-dark-100">{{ authStore.user?.email }}</p>
          </div>
          <div>
            <p class="text-sm text-dark-400">Role</p>
            <p class="text-dark-100 capitalize">{{ authStore.user?.role }}</p>
          </div>
          <div>
            <p class="text-sm text-dark-400">Status</p>
            <span class="badge badge-success">Active</span>
          </div>
        </div>

        <div class="flex gap-3 pt-4 border-t border-dark-700">
          <button class="btn-secondary" @click="handleLogout">
            <LogOut class="w-4 h-4 mr-2" />
            Sign Out
          </button>
          <button class="btn-ghost text-red-400 hover:bg-red-500/10" @click="handleLogoutAll">
            <LogOut class="w-4 h-4 mr-2" />
            Sign Out All Devices
          </button>
        </div>
      </div>
    </div>

    <!-- Server Connection -->
    <div class="card">
      <div class="card-header flex items-center gap-3">
        <Server class="w-5 h-5 text-green-400" />
        <h3 class="font-semibold text-dark-100">Server Connection</h3>
      </div>
      <div class="card-body space-y-4">
        <div>
          <p class="text-sm text-dark-400">API URL</p>
          <p class="text-dark-100 font-mono">{{ apiUrl }}/api/v1</p>
        </div>
        <div>
          <p class="text-sm text-dark-400">WebSocket</p>
          <p class="text-dark-100 font-mono">{{ apiUrl.replace('http', 'ws') }}/ws/realtime</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="status-online"></span>
          <span class="text-dark-300">Connected to God-Kaiser Server</span>
        </div>
      </div>
    </div>

    <!-- About -->
    <div class="card">
      <div class="card-header flex items-center gap-3">
        <Settings class="w-5 h-5 text-purple-400" />
        <h3 class="font-semibold text-dark-100">About</h3>
      </div>
      <div class="card-body">
        <div class="space-y-2 text-sm">
          <p><span class="text-dark-400">Frontend:</span> <span class="text-dark-200">El Frontend v1.0.0</span></p>
          <p><span class="text-dark-400">Stack:</span> <span class="text-dark-200">Vue 3 + TypeScript + Tailwind CSS</span></p>
          <p><span class="text-dark-400">Backend:</span> <span class="text-dark-200">God-Kaiser Server (FastAPI)</span></p>
          <p><span class="text-dark-400">Purpose:</span> <span class="text-dark-200">AutomationOne Debug Dashboard</span></p>
        </div>
      </div>
    </div>
  </div>
</template>
