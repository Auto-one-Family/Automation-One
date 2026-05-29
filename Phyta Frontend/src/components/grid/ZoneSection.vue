<script setup lang="ts">
import EspGridCard from '@/components/grid/EspGridCard.vue'
import { ZONE_UNASSIGNED } from '@/stores/espStore'
import type { PhytaEspDevice } from '@/types/esp'

interface Props {
  zoneId: string
  zoneLabel: string
  devices: PhytaEspDevice[]
}

defineProps<Props>()

const emit = defineEmits<{
  openDevice: [payload: { deviceId: string; originRect: DOMRect }]
}>()

function zoneTitle(zoneId: string, label: string): string {
  if (zoneId === ZONE_UNASSIGNED) return 'Ohne Zone'
  return label || zoneId
}
</script>

<template>
  <section class="mb-8" :aria-label="`Zone ${zoneTitle(zoneId, zoneLabel)}`">
    <h2 class="mb-3 text-lg font-semibold text-dark-100">
      {{ zoneTitle(zoneId, zoneLabel) }}
    </h2>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <EspGridCard
        v-for="device in devices"
        :key="device.device_id || device.esp_id"
        :device="device"
        @open="emit('openDevice', $event)"
      />
    </div>
  </section>
</template>
