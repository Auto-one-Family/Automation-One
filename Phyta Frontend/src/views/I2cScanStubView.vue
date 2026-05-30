<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  formatDeviceContextCaption,
  getDeviceDisplayName,
} from '@/composables/usePhytaDeviceDisplay'
import { useEspStore } from '@/stores/espStore'

const route = useRoute()
const router = useRouter()
const espStore = useEspStore()
const espId = route.params.espId as string

const device = computed(() => espStore.findDevice(espId))
const deviceTitle = computed(() =>
  device.value ? getDeviceDisplayName(device.value) : espId,
)
const deviceContextCaption = computed(() =>
  device.value ? formatDeviceContextCaption(device.value) : espId,
)

onMounted(async () => {
  if (!device.value && !espStore.isLoading) {
    try {
      await espStore.fetchAll()
    } catch {
      /* template shows fallback id */
    }
  }
})
</script>

<template>
  <div class="min-h-screen p-8">
    <h1 class="text-xl font-semibold">I2C-Scan (Persona B MVP)</h1>
    <p class="mt-2 text-base font-medium text-dark-100">{{ deviceTitle }}</p>
    <p
      v-if="deviceContextCaption && deviceContextCaption !== deviceTitle"
      class="mt-1 text-sm text-dark-400"
    >
      {{ deviceContextCaption }}
    </p>
    <p class="mt-4 text-sm text-dark-300">
      Scan-API-Anbindung folgt sobald Backend-Endpunkt ohne Scope-Erweiterung verfügbar ist.
    </p>
    <button
      type="button"
      class="mt-6 text-accent"
      aria-label="Zurück zur Hardware-Übersicht"
      @click="router.push('/hardware')"
    >
      Zurück zur Hardware-Übersicht
    </button>
  </div>
</template>
