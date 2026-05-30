<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const espId = route.params.espId as string
</script>

<template>
  <div class="min-h-screen p-8">
    <h1 class="text-xl font-semibold">I2C-Scan (Persona B MVP)</h1>
    <p class="mt-2 text-dark-400 font-mono">{{ espId }}</p>
    <p class="mt-4 text-sm text-dark-300">
      Scan-API-Anbindung folgt sobald Backend-Endpunkt ohne Scope-Erweiterung verfügbar ist.
    </p>
    <button
      type="button"
      class="mt-6 text-accent"
      @click="router.push('/hardware')"
    >
      Zurück zur Hardware-Übersicht
    </button>
  </div>
</template>
