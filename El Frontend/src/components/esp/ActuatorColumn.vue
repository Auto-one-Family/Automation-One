<script setup lang="ts">
/**
 * ActuatorColumn Component
 *
 * Extracted from ESPOrbitalLayout: Renders the right column of actuator satellites.
 * Handles actuator selection.
 *
 * Used in:
 * - ESPOrbitalLayout (right column)
 * - Future: DeviceDetailView standalone actuator panel
 */

import { Plus } from 'lucide-vue-next'
import ActuatorSatellite from './ActuatorSatellite.vue'

/** Actuator data shape from device.actuators array */
export interface ActuatorItem {
  gpio: number
  actuator_type: string
  /** Original ESP32 hardware type (relay, pump, valve, pwm) for icon lookup */
  hardware_type?: string | null
  name: string | null
  state: boolean
  pwm_value?: number
  emergency_stopped?: boolean
  device_scope?: 'zone_local' | 'multi_zone' | 'mobile' | null
  assigned_zones?: string[] | null
}

interface Props {
  espId: string
  actuators: ActuatorItem[]
  selectedGpio?: number | null
  showConnections?: boolean
}

withDefaults(defineProps<Props>(), {
  selectedGpio: null,
  showConnections: true,
})

const emit = defineEmits<{
  'actuator-click': [gpio: number]
}>()
</script>

<template>
  <div
    :class="[
      'actuator-column',
      { 'actuator-column--empty': actuators.length === 0 }
    ]"
  >
    <ActuatorSatellite
      v-for="actuator in actuators"
      :key="`actuator-${actuator.gpio}`"
      :esp-id="espId"
      :gpio="actuator.gpio"
      :actuator-type="actuator.actuator_type"
      :hardware-type="actuator.hardware_type"
      :name="actuator.name"
      :state="actuator.state"
      :pwm-value="actuator.pwm_value"
      :emergency-stopped="actuator.emergency_stopped"
      :device-scope="actuator.device_scope"
      :assigned-zones="actuator.assigned_zones ?? undefined"
      :selected="selectedGpio === actuator.gpio"
      :show-connections="showConnections"
      class="actuator-column__satellite"
      @click="emit('actuator-click', actuator.gpio)"
    />

    <!-- Empty state -->
    <div v-if="actuators.length === 0" class="actuator-column__empty-slot">
      <Plus class="w-3 h-3" />
      <span>Aktoren</span>
    </div>
  </div>
</template>

<style scoped>
.actuator-column {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  align-items: stretch;
  width: 120px;
  flex-shrink: 0;
}

.actuator-column--empty {
  width: 56px;
}

.actuator-column__satellite {
  position: relative !important;
  transform: none !important;
  width: 100%;
  animation: satellite-appear 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes satellite-appear {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.actuator-column__empty-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.75rem 0.5rem;
  border: 1px dashed var(--glass-border);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.2);
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-height: 56px;
}

.actuator-column__empty-slot:hover {
  border-color: rgba(96, 165, 250, 0.2);
  color: rgba(255, 255, 255, 0.35);
}
</style>
