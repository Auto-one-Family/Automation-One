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

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'settings', device: ESPDevice): void
  (e: 'delete', deviceId: string): void
  (e: 'heartbeat', deviceId: string): void
  (e: 'name-updated', payload: { deviceId: string; name: string | null }): void
  (e: 'sensor-click', payload: { espId: string; gpio: number; sensorType: string; configId?: string }): void
  (e: 'actuator-click', payload: { espId: string; gpio: number }): void
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

function handleSensorClick(payload: { configId?: string; gpio: number; sensorType: string }) {
  emit('sensor-click', { espId: espStore.getDeviceId(props.device), ...payload })
}

function handleActuatorClick(gpio: number) {
  emit('actuator-click', { espId: espStore.getDeviceId(props.device), gpio })
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
        @sensor-click="handleSensorClick"
        @actuator-click="handleActuatorClick"
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
  width: min(100%, 1560px);
  max-width: 1560px;
  margin-inline: auto;
}

.device-detail-view__content {
  position: relative;
  width: 100%;
}

/* Orbital layout overrides for full-page detail view */
.device-detail-view__content :deep(.esp-horizontal-layout) {
  margin-inline: auto;
}

.device-detail-view__content :deep(.esp-info-compact) {
  min-height: auto;
  height: auto;
}

/* Reduce orbit radius on standard/compact screens */
@media (max-width: 1700px) {
  .device-detail-view__content :deep(.esp-horizontal-layout) {
    --orbit-radius: 200px;
  }
}

@media (min-width: 1701px) {
  .device-detail-view__content :deep(.esp-horizontal-layout) {
    --orbit-radius: 280px;
  }
}

@media (max-width: 1100px) {
  .device-detail-view {
    width: 100%;
    padding: var(--space-3);
  }
}
</style>
