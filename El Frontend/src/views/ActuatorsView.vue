<script setup lang="ts">
/**
 * ActuatorsView
 *
 * @deprecated 2025-01-04: Diese View wurde durch SensorsView mit Tab-System ersetzt.
 * Route /actuators redirected automatisch zu /sensors?tab=actuators.
 *
 * Diese Datei existiert nur für den Fall eines direkten Zugriffs.
 * Entfernung in v2.0 geplant.
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  // Redirect zur neuen Sensors-View mit Actuators-Tab
  router.replace('/sensors?tab=actuators')
})
</script>

<template>
  <div class="p-8 text-center text-gray-400">
    <p>Weiterleitung zu /sensors?tab=actuators...</p>
  </div>
</template>
