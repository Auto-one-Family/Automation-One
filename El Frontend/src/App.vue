<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useEspStore } from '@/stores/esp'
import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'
import { onMounted, onUnmounted, ref } from 'vue'
import ToastContainer from '@/shared/design/patterns/ToastContainer.vue'
import ErrorDetailsModal from '@/components/error/ErrorDetailsModal.vue'
import type { ErrorDetailsData } from '@/components/error/ErrorDetailsModal.vue'
import ConfirmDialog from '@/shared/design/patterns/ConfirmDialog.vue'
import ContextMenu from '@/shared/design/patterns/ContextMenu.vue'
import NotificationDrawer from '@/components/notifications/NotificationDrawer.vue'

const authStore = useAuthStore()
const espStore = useEspStore()
const notificationInboxStore = useNotificationInboxStore()

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

  // Load notification inbox after auth is ready
  if (authStore.isAuthenticated) {
    notificationInboxStore.loadInitial()
  }
})

onUnmounted(() => {
  espStore.cleanupWebSocket()
  window.removeEventListener('show-error-details', handleShowErrorDetails)
})
</script>

<template>
  <RouterView />
  <NotificationDrawer />
  <ToastContainer />
  <ConfirmDialog />
  <ContextMenu />
  <ErrorDetailsModal
    :error="errorModalData"
    :open="errorModalOpen"
    @close="errorModalOpen = false"
  />
</template>
