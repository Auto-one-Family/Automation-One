<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Cpu, X } from 'lucide-vue-next'
import { getDeviceId } from '@/api/esp'
import { getDeviceDisplayName, getDeviceIdCaption, getDeviceZoneLabel } from '@/composables/usePhytaDeviceDisplay'
import { statusDotClass, statusLabel, usePhytaEspStatus } from '@/composables/usePhytaEspHealth'
import ComponentPalette from '@/components/palette/ComponentPalette.vue'
import SatelliteTile from '@/components/orbital/SatelliteTile.vue'
import { useEspStore } from '@/stores/espStore'
import type { PhytaEspDevice } from '@/types/esp'

interface Props {
  device: PhytaEspDevice
  originRect: DOMRect | null
  deviceIndex?: number
}

interface BulgeOffset {
  x: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  wizardDrop: [payload: { kind: 'sensor' | 'actuator'; type: string; espId: string }]
}>()

const espStore = useEspStore()
const paletteRef = ref<InstanceType<typeof ComponentPalette> | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const fieldRef = ref<HTMLElement | null>(null)
const hubRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
const nodeRefs = ref<Map<string, HTMLElement>>(new Map())
const isDragOver = ref(false)
const isEditingName = ref(false)
const editName = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

const deviceId = computed(() => getDeviceId(props.device))
const status = usePhytaEspStatus(() => props.device)
const sensors = computed(() => props.device.sensors ?? [])
const actuators = computed(() => props.device.actuators ?? [])
const displayName = computed(() => getDeviceDisplayName(props.device, props.deviceIndex))
const zoneLabel = computed(() => getDeviceZoneLabel(props.device))
const showDeviceIdCaption = computed(() => getDeviceIdCaption(props.device, props.deviceIndex) != null)
const deviceIdCaption = computed(() => getDeviceIdCaption(props.device, props.deviceIndex))

interface LineSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  key: string
}

const connectionLines = ref<LineSegment[]>([])
const fieldSize = ref({ width: 800, height: 400 })

function computeBulgeOffset(index: number, total: number, side: 'left' | 'right'): BulgeOffset {
  if (total <= 0) return { x: 0 }
  const t = total === 1 ? 0.5 : index / (total - 1)
  const bulgeMax = Math.min(48, Math.max(20, fieldSize.value.width * 0.07))
  const bulge = bulgeMax * Math.sin(Math.PI * t)
  const base = 12
  const x = side === 'left' ? -(base + bulge) : base + bulge
  return { x }
}

const sensorBulges = computed(() =>
  sensors.value.map((_, i) => computeBulgeOffset(i, sensors.value.length, 'left')),
)
const actuatorBulges = computed(() =>
  actuators.value.map((_, i) => computeBulgeOffset(i, actuators.value.length, 'right')),
)

function setNodeRef(key: string, el: HTMLElement | null): void {
  if (el) nodeRefs.value.set(key, el)
  else nodeRefs.value.delete(key)
}

function updateLines(): void {
  const field = fieldRef.value
  const hub = hubRef.value
  if (!field || !hub) {
    connectionLines.value = []
    return
  }

  const fieldRect = field.getBoundingClientRect()
  const hubRect = hub.getBoundingClientRect()
  const cx = hubRect.left + hubRect.width / 2 - fieldRect.left
  const cy = hubRect.top + hubRect.height / 2 - fieldRect.top

  const lines: LineSegment[] = []
  for (const [key, el] of nodeRefs.value) {
    if (key === 'hub') continue
    const r = el.getBoundingClientRect()
    lines.push({
      key,
      x1: cx,
      y1: cy,
      x2: r.left + r.width / 2 - fieldRect.left,
      y2: r.top + r.height / 2 - fieldRect.top,
    })
  }
  connectionLines.value = lines
  fieldSize.value = { width: fieldRect.width, height: fieldRect.height }
}

let resizeObserver: ResizeObserver | null = null

function bindFieldObserver(): void {
  if (!fieldRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    nextTick(updateLines)
  })
  resizeObserver.observe(fieldRef.value)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (isEditingName.value) {
      isEditingName.value = false
      return
    }
    emit('close')
  }
}

async function runFlipIn(): Promise<void> {
  const el = cardRef.value
  const origin = props.originRect
  if (!el || !origin) return

  const target = el.getBoundingClientRect()
  const dx = origin.left + origin.width / 2 - (target.left + target.width / 2)
  const dy = origin.top + origin.height / 2 - (target.top + target.height / 2)
  const sf = Math.min(origin.width / target.width, origin.height / target.height, 1)

  el.style.transform = `translate(${dx}px, ${dy}px) scale(${sf})`
  el.style.transition = 'none'

  await nextTick()
  requestAnimationFrame(() => {
    el.style.transition = `transform var(--flip-duration) var(--ease-out)`
    el.style.transform = 'translate(0, 0) scale(1)'
    setTimeout(() => nextTick(updateLines), 580)
  })
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  void runFlipIn()
  nextTick(() => {
    closeRef.value?.focus()
    setNodeRef('hub', hubRef.value)
    bindFieldObserver()
    updateLines()
  })
  window.addEventListener('resize', updateLines)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateLines)
  resizeObserver?.disconnect()
})

watch(
  () => [sensors.value.length, actuators.value.length],
  () => nextTick(updateLines),
)

watch(
  () => props.originRect,
  () => void runFlipIn(),
)

watch(hubRef, (el) => {
  setNodeRef('hub', el)
  nextTick(updateLines)
})

function onDrop(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = false
  const raw = event.dataTransfer?.getData('application/phyta-component')
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as { kind: 'sensor' | 'actuator'; type: string }
    paletteRef.value?.collapseAfterDrop()
    emit('wizardDrop', { ...parsed, espId: deviceId.value })
  } catch {
    /* ignore */
  }
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = true
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(): void {
  isDragOver.value = false
}

async function toggleActuator(gpio: number, actuatorType: string): Promise<void> {
  try {
    const { apiClient } = await import('@/api/client')
    await apiClient.post(`/actuators/${deviceId.value}/${gpio}/command`, {
      command: 'TOGGLE',
      actuator_type: actuatorType,
    })
  } catch {
    /* toast in follow-up */
  }
}

function sensorKey(s: (typeof sensors.value)[0], i: number): string {
  return `s-${s.config_id ?? `${s.gpio}-${s.sensor_type}`}-${i}`
}

function actuatorKey(a: (typeof actuators.value)[0], i: number): string {
  return `a-${a.config_id ?? `${a.gpio}-${a.actuator_type}`}-${i}`
}

function startNameEdit(): void {
  editName.value = props.device.name?.trim() || displayName.value
  isEditingName.value = true
  nextTick(() => nameInputRef.value?.select())
}

async function commitNameEdit(): Promise<void> {
  const next = editName.value.trim()
  isEditingName.value = false
  if (!next || next === props.device.name?.trim()) return
  try {
    await espStore.renameDevice(deviceId.value, next)
  } catch {
    /* toast in follow-up */
  }
}

function cancelNameEdit(): void {
  isEditingName.value = false
}
</script>

<template>
  <div class="orbital-root fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="orbital-backdrop absolute inset-0"
      aria-label="Orbital schließen"
      @click="emit('close')"
    />
    <article
      ref="cardRef"
      class="orbital-card iridescent-border glass-panel relative z-20 flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl"
      role="dialog"
      aria-modal="true"
      :aria-label="`Gerät ${displayName}`"
    >
      <header class="orbital-header flex shrink-0 items-center justify-between">
        <div class="orbital-header__lead flex min-w-0 items-center">
          <span :class="statusDotClass(status)" :title="statusLabel(status)" aria-hidden="true" />
          <div class="min-w-0">
            <div v-if="isEditingName" class="orbital-header__edit">
              <input
                ref="nameInputRef"
                v-model="editName"
                type="text"
                class="phyta-input orbital-header__input"
                maxlength="100"
                aria-label="Gerätename bearbeiten"
                @keydown.enter.prevent="commitNameEdit"
                @keydown.esc.prevent="cancelNameEdit"
                @blur="commitNameEdit"
              />
            </div>
            <button
              v-else
              type="button"
              class="orbital-header__title truncate text-left hover:text-accent-bright"
              :title="`Gerätename bearbeiten (${deviceId})`"
              @click="startNameEdit"
            >
              {{ displayName }}
            </button>
            <p class="orbital-header__caption">
              <span v-if="zoneLabel">{{ zoneLabel }} · </span>
              <span v-if="showDeviceIdCaption" class="font-mono">{{ deviceIdCaption }} · </span>
              {{ statusLabel(status) }}
            </p>
          </div>
        </div>
        <button
          ref="closeRef"
          type="button"
          class="orbital-header__close"
          aria-label="Schließen"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>

      <ComponentPalette ref="paletteRef" class="shrink-0 border-y border-glass-border" />

      <div
        ref="fieldRef"
        class="orbital-field relative flex-1 overflow-visible"
      >
        <svg
          class="orbital-lines pointer-events-none absolute inset-0 h-full w-full"
          :viewBox="`0 0 ${fieldSize.width} ${fieldSize.height}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="line in connectionLines"
            :key="line.key"
            :x1="line.x1"
            :y1="line.y1"
            :x2="line.x2"
            :y2="line.y2"
            class="orbital-line"
          />
        </svg>

        <div class="orbital-layout grid h-full grid-cols-[1fr_auto_1fr] items-center">
          <div class="orbital-arm orbital-arm--sensors flex flex-col items-end justify-center">
            <p v-if="!sensors.length" class="orbital-arm__empty">
              Keine Sensoren
            </p>
            <div
              v-for="(s, i) in sensors"
              :key="sensorKey(s, i)"
              :ref="(el) => setNodeRef(sensorKey(s, i), el as HTMLElement | null)"
              class="orbital-satellite-wrap"
              :style="{ transform: `translateX(${sensorBulges[i]?.x ?? 0}px)` }"
            >
              <SatelliteTile kind="sensor" :sensor="s" />
            </div>
          </div>

          <div
            ref="hubRef"
            class="orbital-hub iridescent-border z-[2] shrink-0"
            :class="{ 'orbital-hub--drag-over': isDragOver }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
          >
            <Cpu :size="28" class="orbital-hub__icon text-iridescent-2" aria-hidden="true" />
            <p class="orbital-hub__name">{{ displayName }}</p>
            <p v-if="zoneLabel || showDeviceIdCaption" class="orbital-hub__meta">
              <span v-if="zoneLabel">{{ zoneLabel }}</span>
              <span v-if="zoneLabel && showDeviceIdCaption"> · </span>
              <span v-if="showDeviceIdCaption" class="font-mono">{{ deviceIdCaption }}</span>
            </p>
            <p
              v-if="isDragOver"
              class="orbital-hub__drop-hint"
            >
              Hier ablegen
            </p>
          </div>

          <div class="orbital-arm orbital-arm--actuators flex flex-col items-start justify-center">
            <p v-if="!actuators.length" class="orbital-arm__empty orbital-arm__empty--start">
              Keine Aktoren
            </p>
            <div
              v-for="(a, i) in actuators"
              :key="actuatorKey(a, i)"
              :ref="(el) => setNodeRef(actuatorKey(a, i), el as HTMLElement | null)"
              class="orbital-satellite-wrap"
              :style="{ transform: `translateX(${actuatorBulges[i]?.x ?? 0}px)` }"
            >
              <SatelliteTile
                kind="actuator"
                :actuator="a"
                @toggle="toggleActuator(a.gpio, a.actuator_type)"
              />
            </div>
          </div>
        </div>

        <p
          v-if="!sensors.length && !actuators.length"
          class="orbital-field__hint"
        >
          Komponente aus der Leiste oben auf das Gerät ziehen
        </p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.orbital-backdrop {
  background: var(--orbital-backdrop-color);
  backdrop-filter: blur(var(--orbital-backdrop-blur));
}

.orbital-card {
  background: var(--color-bg-level-2);
  overflow: hidden;
}

.orbital-header {
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--glass-border);
}

.orbital-header__lead {
  gap: var(--space-3);
}

.orbital-header__edit {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.orbital-header__input {
  max-width: 16rem;
  font-size: var(--text-lg);
  font-weight: 600;
}

.orbital-header__title {
  display: block;
  width: 100%;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: var(--leading-tight);
}

.orbital-header__caption {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  line-height: var(--leading-tight);
  color: var(--color-text-muted);
}

.orbital-header__close {
  flex-shrink: 0;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  transition: color var(--transition-fast), background var(--transition-fast);
}

.orbital-header__close:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.orbital-header__close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 35%, transparent);
}

.orbital-field {
  min-height: calc(var(--space-12) * 7 + var(--space-6));
  padding: var(--space-4);
  background:
    radial-gradient(
      ellipse 55% 45% at 50% 50%,
      color-mix(in srgb, var(--color-iridescent-2) 6%, transparent),
      transparent 70%
    );
}

.orbital-field__hint {
  pointer-events: none;
  position: absolute;
  right: 0;
  bottom: var(--space-3);
  left: 0;
  text-align: center;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.orbital-layout {
  min-height: calc(var(--space-12) * 6 + var(--space-8));
  gap: var(--space-3);
}

@media (min-width: 640px) {
  .orbital-layout {
    gap: var(--space-4);
  }
}

.orbital-arm {
  gap: var(--space-3);
}

.orbital-arm__empty {
  padding-right: var(--space-2);
  text-align: right;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.orbital-arm__empty--start {
  padding-right: 0;
  padding-left: var(--space-2);
  text-align: left;
}

.orbital-hub__icon {
  display: block;
  margin-inline: auto;
}

.orbital-hub__name {
  margin-top: var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-tight);
  color: var(--color-text-primary);
}

.orbital-hub__meta {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  line-height: var(--leading-tight);
  color: var(--color-text-muted);
}

.orbital-hub__drop-hint {
  margin-top: var(--space-3);
  font-size: var(--text-xxs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-accent-bright);
  animation: drop-hint-pulse 1.2s ease-in-out infinite;
}

.orbital-satellite-wrap {
  position: relative;
  z-index: 3;
  transition: transform var(--transition-base);
}

.orbital-line {
  stroke: var(--color-text-muted);
  stroke-width: 1.5;
  stroke-dasharray: 6 5;
  opacity: 0.5;
}

.orbital-hub--drag-over {
  box-shadow:
    var(--elevation-floating),
    0 0 24px color-mix(in srgb, var(--color-accent) 35%, transparent);
}

@keyframes drop-hint-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (max-width: 640px) {
  .orbital-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    gap: var(--space-4);
  }

  .orbital-arm--sensors,
  .orbital-arm--actuators {
    align-items: center;
  }

  .orbital-satellite-wrap {
    transform: none !important;
  }

  .orbital-lines {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .orbital-card {
    transition: none !important;
    transform: none !important;
  }

  .orbital-satellite-wrap {
    transition: none;
  }

  .orbital-hub__drop-hint {
    animation: none;
  }
}
</style>
