<script setup lang="ts">
/**
 * CalibrationView
 *
 * Wrapper view for the CalibrationWizard component.
 * Route: /calibration
 */
import { ref, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import CalibrationWizard from '@/components/calibration/CalibrationWizard.vue'
import { useEspStore } from '@/stores/esp'

type CalibrationWizardExpose = {
  confirmLeave?: () => Promise<boolean>
}

const espStore = useEspStore()
const wizardRef = ref<CalibrationWizardExpose | null>(null)

onMounted(() => {
  if (espStore.devices.length === 0) {
    espStore.fetchAll()
  }
})

onBeforeRouteLeave(async () => {
  if (!wizardRef.value?.confirmLeave) {
    return true
  }
  return wizardRef.value.confirmLeave()
})
</script>

<template>
  <div class="calibration-view">
    <CalibrationWizard ref="wizardRef" />
  </div>
</template>

<style scoped>
.calibration-view {
  padding: 1.5rem;
  max-width: 720px;
  margin: 0 auto;
}
</style>
