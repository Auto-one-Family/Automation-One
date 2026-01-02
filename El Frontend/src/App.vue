<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEspStore } from '@/stores/esp'
import { onMounted, onUnmounted } from 'vue'
import ToastContainer from '@/components/common/ToastContainer.vue'

const authStore = useAuthStore()
const espStore = useEspStore()

onMounted(async () => {
  // Check auth status on app load
  await authStore.checkAuthStatus()
})

onUnmounted(() => {
  // Cleanup WebSocket subscriptions on app unmount
  // This ensures proper resource cleanup (rarely triggered, but good practice)
  espStore.cleanupWebSocket()
})
</script>

<template>
  <RouterView />
  <ToastContainer />
</template>
