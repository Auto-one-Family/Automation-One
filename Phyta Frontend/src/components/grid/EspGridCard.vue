<script setup lang="ts">
import { computed } from 'vue'
import { getDeviceId } from '@/api/esp'
import {
  statusDotClass,
  statusLabel,
  usePhytaEspStatus,
} from '@/composables/usePhytaEspHealth'
import type { PhytaEspDevice } from '@/types/esp'

interface Props {
  device: PhytaEspDevice
}

const props = defineProps<Props>()

const emit = defineEmits<{
  open: [payload: { deviceId: string; originRect: DOMRect }]
}>()

const deviceId = computed(() => getDeviceId(props.device))
const status = usePhytaEspStatus(() => props.device)
const displayName = computed(
  () => props.device.name || props.device.zone_name || deviceId.value,
)

function onClick(event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement
  emit('open', { deviceId: deviceId.value, originRect: el.getBoundingClientRect() })
}
</script>

<template>
  <button
    type="button"
    class="esp-grid-card glass-panel iridescent-border w-full text-left p-4 rounded-lg transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    :aria-label="`ESP ${displayName} öffnen`"
    @click="onClick"
  >
    <div class="flex items-start gap-3">
      <span
        class="mt-1 h-3 w-3 shrink-0 rounded-full"
        :class="statusDotClass(status)"
        :title="statusLabel(status)"
      />
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-base font-medium text-dark-100">
          {{ displayName }}
        </h3>
        <p class="text-sm text-dark-400 font-mono truncate">{{ deviceId }}</p>
        <p class="mt-1 text-xs text-dark-300">{{ statusLabel(status) }}</p>
        <p
          v-if="device.sensor_count != null || device.actuator_count != null"
          class="mt-2 text-xs text-dark-400"
        >
          {{ device.sensor_count ?? 0 }} Sensoren · {{ device.actuator_count ?? 0 }} Aktoren
        </p>
      </div>
    </div>
  </button>
</template>

<style scoped>
.esp-grid-card {
  background: var(--glass-bg-l2, var(--glass-bg));
}
</style>
