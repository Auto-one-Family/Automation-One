<script setup lang="ts">
/**
 * CalibrationView
 *
 * Wrapper view for the CalibrationWizard component.
 * Route: /calibration
 */
import CalibrationWizard from '@/components/calibration/CalibrationWizard.vue'
</script>

<template>
  <div class="calibration-view">
    <CalibrationWizard />
  </div>
</template>

<style scoped>
.calibration-view {
  padding: 1.5rem;
  max-width: 720px;
  margin: 0 auto;
}
</style>
