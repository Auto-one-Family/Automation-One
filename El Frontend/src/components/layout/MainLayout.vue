<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'

// Mobile sidebar state
const sidebarOpen = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}
</script>

<template>
  <!-- ⭐ h-screen statt min-h-screen: Feste Höhe für korrekte Flex-Kette -->
  <div class="h-screen flex bg-dark-950 overflow-hidden">
    <!-- Mobile Overlay -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 bg-black/50 z-30 md:hidden"
        @click="closeSidebar"
      />
    </Transition>

    <!-- Sidebar -->
    <AppSidebar
      :is-open="sidebarOpen"
      @close="closeSidebar"
    />

    <!-- Main Content -->
    <div class="flex-1 flex flex-col ml-0 md:ml-64 transition-[margin] duration-300">
      <!-- Header -->
      <AppHeader @toggle-sidebar="toggleSidebar" />

      <!-- Page Content -->
      <!-- ⭐ Page-Scroll: overflow-y-auto erlaubt Scrollen der gesamten Seite -->
      <main class="flex-1 p-4 md:p-6 overflow-y-auto min-h-0">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
