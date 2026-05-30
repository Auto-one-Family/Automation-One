<script setup lang="ts">
import { computed } from 'vue'
import { Cpu } from 'lucide-vue-next'
import { getDeviceId } from '@/api/esp'
import { getDeviceDisplayName } from '@/composables/usePhytaDeviceDisplay'
import {
  formatLastContactHint,
  statusDotClass,
  statusLabel,
  usePhytaEspStatus,
  type PhytaEspStatus,
} from '@/composables/usePhytaEspHealth'
import type { PhytaEspDevice } from '@/types/esp'

interface Props {
  device: PhytaEspDevice
  deviceIndex?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  open: [payload: { deviceId: string; originRect: DOMRect }]
}>()

const deviceId = computed(() => getDeviceId(props.device))
const status = usePhytaEspStatus(() => props.device)
const displayName = computed(() => getDeviceDisplayName(props.device, props.deviceIndex))
const contactHint = computed(() =>
  formatLastContactHint(props.device.last_seen, status.value),
)
const showRenameHint = computed(
  () => !props.device.name?.trim() && props.deviceIndex != null,
)

const cardStateClass = computed(() => {
  const s = status.value as PhytaEspStatus
  if (s === 'offline') return 'esp-grid-card--offline'
  if (s === 'pending_approval') return 'esp-grid-card--pending'
  return ''
})

const statusBadgeClass = computed(() => {
  switch (status.value) {
    case 'online':
      return 'text-success bg-success/10 border border-success/30'
    case 'stale':
      return 'text-warning bg-warning/10 border border-warning/30'
    case 'offline':
      return 'text-danger bg-danger/10 border border-danger/40'
    case 'pending_approval':
      return 'text-iridescent-2 bg-iridescent-2/10 border border-iridescent-2/30'
    default:
      return 'text-dark-400 bg-dark-800 border border-glass-border'
  }
})

function onClick(event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement
  emit('open', { deviceId: deviceId.value, originRect: el.getBoundingClientRect() })
}
</script>

<template>
  <button
    type="button"
    class="esp-grid-card glass-panel iridescent-border water-reflection w-full text-left p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    :class="cardStateClass"
    :data-esp-id="deviceId"
    :aria-label="`Gerät ${displayName} öffnen`"
    @click="onClick"
  >
    <div class="flex items-start gap-3">
      <span
        :class="statusDotClass(status)"
        :title="contactHint || statusLabel(status)"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <Cpu :size="14" class="shrink-0 text-dark-400" aria-hidden="true" />
          <h3 class="truncate text-base font-medium text-dark-100">
            {{ displayName }}
          </h3>
        </div>
        <p class="mt-0.5 text-xs text-dark-400 font-mono truncate">{{ deviceId }}</p>
        <p
          v-if="showRenameHint"
          class="mt-1 text-xxs text-dark-400 italic"
        >
          Noch kein Name — in Detailansicht anpassen
        </p>
        <p
          class="mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xxs font-semibold"
          :class="statusBadgeClass"
        >
          {{ statusLabel(status) }}
        </p>
        <p
          v-if="contactHint"
          class="mt-1 text-xxs text-dark-400"
        >
          {{ contactHint }}
        </p>
        <p
          v-if="device.sensor_count != null || device.actuator_count != null"
          class="mt-2 font-mono text-xxs text-dark-400 tabular-nums"
        >
          {{ device.sensor_count ?? 0 }} Sensoren · {{ device.actuator_count ?? 0 }} Aktoren
        </p>
      </div>
    </div>
  </button>
</template>
