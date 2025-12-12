<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { onMounted } from 'vue'

const authStore = useAuthStore()

onMounted(async () => {
  // Check auth status on app load
  await authStore.checkAuthStatus()
})
</script>

<template>
  <RouterView />
</template>
