<script setup lang="ts">
import { Layers } from 'lucide-vue-next'
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

function deviceCountLabel(count: number): string {
  return count === 1 ? '1 Gerät' : `${count} Geräte`
}
</script>

<template>
  <section
    class="zone-plate noise-overlay"
    :aria-label="`Zone ${zoneTitle(zoneId, zoneLabel)}`"
  >
    <h2 class="zone-plate__title">
      <Layers :size="18" class="text-iridescent-2" aria-hidden="true" />
      {{ zoneTitle(zoneId, zoneLabel) }}
      <span class="zone-plate__count">{{ deviceCountLabel(devices.length) }}</span>
    </h2>
    <div
      v-if="devices.length"
      class="zone-plate__grid grid gap-3"
    >
      <EspGridCard
        v-for="(device, index) in devices"
        :key="device.device_id || device.esp_id"
        :device="device"
        :device-index="index + 1"
        @open="emit('openDevice', $event)"
      />
    </div>
    <p
      v-else
      class="zone-plate__empty rounded-lg border border-dashed border-glass-border px-4 py-6 text-center text-sm text-dark-400"
    >
      Keine Geräte in dieser Zone
    </p>
  </section>
</template>

<style scoped>
.zone-plate {
  position: relative;
}
</style>
