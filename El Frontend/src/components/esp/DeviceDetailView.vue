<script setup lang="ts">
/**
 * DeviceDetailView Component
 *
 * Level 3: Full device detail layout. Wraps ESPOrbitalLayout in a
 * full-width container that solves the overflow bug by providing
 * unlimited vertical space.
 *
 * Adds:
 * - DeviceHeaderBar with zone context and back navigation
 * - Full-width CSS overrides (no max-width constraints)
 * - Cross-ESP connection overlay (only visible on Level 3)
 *
 * Strategy: Re-uses ESPOrbitalLayout (compact-mode="true") to preserve
 * all existing functionality (sensor/actuator modals, drag-drop, inline
 * editing, OneWire scanning) without duplicating 3,913 lines of code.
 * The layout differences (wider columns, unlimited scroll) are handled
 * by CSS overrides on the wrapper.
 */

import { defineAsyncComponent } from 'vue'
import type { ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useLogicStore } from '@/shared/stores/logic.store'
import ESPOrbitalLayout from './ESPOrbitalLayout.vue'
import DeviceHeaderBar from './DeviceHeaderBar.vue'

const CrossEspConnectionOverlay = defineAsyncComponent(
  () => import('@/components/dashboard/CrossEspConnectionOverlay.vue')
)

interface Props {
  device: ESPDevice
  zoneId: string
  zoneName: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'settings', device: ESPDevice): void
  (e: 'delete', deviceId: string): void
  (e: 'heartbeat', deviceId: string): void
  (e: 'name-updated', payload: { deviceId: string; name: string | null }): void
}>()

const espStore = useEspStore()
const logicStore = useLogicStore()

function handleHeartbeat(device: ESPDevice) {
  emit('heartbeat', espStore.getDeviceId(device))
}

function handleDelete(device: ESPDevice) {
  emit('delete', espStore.getDeviceId(device))
}

function handleSettings(device: ESPDevice) {
  emit('settings', device)
}

function handleNameUpdated(payload: { deviceId: string; name: string | null }) {
  emit('name-updated', payload)
}
</script>

<template>
  <div class="device-detail-view">
    <!-- Header with back navigation -->
    <DeviceHeaderBar
      :device="device"
      :zone-name="zoneName"
      @back="emit('back')"
    />

    <!-- Cross-ESP Connection Overlay (only on Level 3) -->
    <div class="device-detail-view__content">
      <CrossEspConnectionOverlay
        v-if="logicStore.crossEspConnections.length > 0"
        :show="true"
        :show-labels="true"
      />

      <!-- ESPOrbitalLayout in compact mode, full-width -->
      <ESPOrbitalLayout
        :device="device"
        :show-connections="true"
        :compact-mode="true"
        @heartbeat="handleHeartbeat"
        @delete="handleDelete"
        @settings="handleSettings"
        @name-updated="handleNameUpdated"
      />
    </div>
  </div>
</template>

<style scoped>
.device-detail-view {
  background: linear-gradient(180deg, var(--color-bg-level-3), var(--color-bg-tertiary));
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  min-height: 400px;
}

.device-detail-view__content {
  position: relative;
}

/* Override ESPOrbitalLayout width constraints for full-page Level 3 view */
.device-detail-view__content :deep(.esp-horizontal-layout) {
  max-width: none;
}

/* Allow sensor/actuator columns to grow taller */
.device-detail-view__content :deep(.esp-horizontal-layout__column--sensors),
.device-detail-view__content :deep(.esp-horizontal-layout__column--actuators) {
  max-height: 60vh;
  overflow-y: auto;
}

/* Widen the analysis/chart area */
.device-detail-view__content :deep(.esp-horizontal-layout__center) {
  flex: 2;
}
</style>
