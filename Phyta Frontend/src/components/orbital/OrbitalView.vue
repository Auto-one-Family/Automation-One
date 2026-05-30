<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { getDeviceId } from '@/api/esp'
import { statusDotClass, statusLabel, usePhytaEspStatus } from '@/composables/usePhytaEspHealth'
import ComponentPalette from '@/components/palette/ComponentPalette.vue'
import SatelliteTile from '@/components/orbital/SatelliteTile.vue'
import type { PhytaEspDevice } from '@/types/esp'

interface Props {
  device: PhytaEspDevice
  originRect: DOMRect | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  wizardDrop: [payload: { kind: 'sensor' | 'actuator'; type: string; espId: string }]
}>()

const cardRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
const isAnimating = ref(false)

const deviceId = computed(() => getDeviceId(props.device))
const status = usePhytaEspStatus(() => props.device)

const sensors = computed(() => props.device.sensors ?? [])
const actuators = computed(() => props.device.actuators ?? [])

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  void runFlipIn()
  nextTick(() => closeRef.value?.focus())
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

watch(
  () => props.originRect,
  () => void runFlipIn(),
)

async function runFlipIn(): Promise<void> {
  const el = cardRef.value
  const origin = props.originRect
  if (!el || !origin) return

  const target = el.getBoundingClientRect()
  const dx = origin.left + origin.width / 2 - (target.left + target.width / 2)
  const dy = origin.top + origin.height / 2 - (target.top + target.height / 2)
  const sf = Math.min(origin.width / target.width, origin.height / target.height, 1)

  isAnimating.value = true
  el.style.transform = `translate(${dx}px, ${dy}px) scale(${sf})`
  el.style.transition = 'none'

  await nextTick()
  requestAnimationFrame(() => {
    el.style.transition = `transform var(--flip-duration) var(--ease-out)`
    el.style.transform = 'translate(0, 0) scale(1)'
    setTimeout(() => {
      isAnimating.value = false
    }, 560)
  })
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  const raw = event.dataTransfer?.getData('application/phyta-component')
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as { kind: 'sensor' | 'actuator'; type: string }
    emit('wizardDrop', { ...parsed, espId: deviceId.value })
  } catch {
    /* ignore */
  }
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
}

async function toggleActuator(gpio: number, actuatorType: string): Promise<void> {
  try {
    const { apiClient } = await import('@/api/client')
    await apiClient.post(`/esp/devices/${deviceId.value}/actuators/${gpio}/command`, {
      command: 'TOGGLE',
      actuator_type: actuatorType,
    })
  } catch {
    /* toast in follow-up */
  }
}
</script>

<template>
  <div class="orbital-root fixed inset-0 z-50 flex items-center justify-center">
    <button
      type="button"
      class="orbital-backdrop absolute inset-0"
      aria-label="Orbital schließen"
      @click="emit('close')"
    />
    <ComponentPalette class="absolute top-0 left-0 right-0 z-10" />
    <article
      ref="cardRef"
      class="orbital-card iridescent-border glass-panel relative z-20 mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl p-6"
      role="dialog"
      aria-modal="true"
      :aria-label="`Orbital ${deviceId}`"
    >
      <header class="mb-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <span class="h-3 w-3 rounded-full shrink-0" :class="statusDotClass(status)" />
          <div class="min-w-0">
            <h2 class="truncate text-xl font-semibold">{{ device.name || deviceId }}</h2>
            <p class="text-sm text-dark-400">{{ statusLabel(status) }}</p>
          </div>
        </div>
        <button
          ref="closeRef"
          type="button"
          class="rounded-lg p-2 text-dark-300 hover:bg-dark-800 hover:text-dark-100"
          aria-label="Schließen"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>

      <div class="relative flex flex-1 min-h-[280px] items-center justify-center gap-8 overflow-auto">
        <div class="flex flex-col gap-3 max-w-[140px]">
          <SatelliteTile
            v-for="s in sensors"
            :key="`${s.gpio}-${s.sensor_type}`"
            :label="s.name || s.sensor_type"
            :value="s.raw_value"
            :unit="s.unit"
            kind="sensor"
          />
        </div>
        <div
          class="orbital-center shrink-0 rounded-xl border border-glass-border bg-dark-900 px-8 py-6 text-center"
          @dragover="onDragOver"
          @drop="onDrop"
        >
          <p class="font-mono text-sm text-dark-300">{{ deviceId }}</p>
          <p class="mt-1 text-xs text-dark-400">{{ device.zone_name || device.zone_id || '—' }}</p>
        </div>
        <div class="flex flex-col gap-3 max-w-[140px]">
          <SatelliteTile
            v-for="a in actuators"
            :key="`${a.gpio}-${a.actuator_type}`"
            :label="a.name || a.actuator_type"
            :value="a.state"
            kind="actuator"
            @toggle="toggleActuator(a.gpio, a.actuator_type)"
          />
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.orbital-backdrop {
  background: rgba(4, 6, 15, 0.65);
  backdrop-filter: blur(8px);
}

.orbital-card {
  background: var(--color-bg-level-2);
}

@media (prefers-reduced-motion: reduce) {
  .orbital-card {
    transition: none !important;
    transform: none !important;
  }
}
</style>
