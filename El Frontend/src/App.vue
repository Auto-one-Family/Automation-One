<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEspStore } from '@/stores/esp'
import { onMounted, onUnmounted, ref } from 'vue'
import ToastContainer from '@/components/common/ToastContainer.vue'
import ErrorDetailsModal from '@/components/error/ErrorDetailsModal.vue'
import type { ErrorDetailsData } from '@/components/error/ErrorDetailsModal.vue'

const authStore = useAuthStore()
const espStore = useEspStore()

// Error Details Modal state (triggered via CustomEvent from toast actions)
const errorModalOpen = ref(false)
const errorModalData = ref<ErrorDetailsData | null>(null)

function handleShowErrorDetails(e: Event) {
  const detail = (e as CustomEvent).detail as ErrorDetailsData
  errorModalData.value = detail
  errorModalOpen.value = true
}

onMounted(async () => {
  await authStore.checkAuthStatus()
  window.addEventListener('show-error-details', handleShowErrorDetails)
})

onUnmounted(() => {
  espStore.cleanupWebSocket()
  window.removeEventListener('show-error-details', handleShowErrorDetails)
})
</script>

<template>
  <RouterView />
  <ToastContainer />
  <ErrorDetailsModal
    :error="errorModalData"
    :open="errorModalOpen"
    @close="errorModalOpen = false"
  />
</template>
