<script setup lang="ts">
/**
 * ZonePlate Component
 *
 * Level 1 (Zone Overview): Elevated glass rectangle showing a zone overview.
 * Displays zone status header + aggregated metrics + DeviceMiniCards grouped by subzone.
 *
 * Features:
 * - Glassmorphism styling with noise texture
 * - Iridescent top border for healthy zones
 * - Aggregated zone metrics (temp range, humidity range, active actuators)
 * - Subzone grouping by device.subzone_id
 * - VueDraggable for cross-zone device drag-drop
 * - Status aggregation (online/warning/error counts)
 * - Iridescent drag-over border glow
 */

import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/shared/stores'
import DeviceMiniCard from './DeviceMiniCard.vue'

interface Props {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
  isDropTarget?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDropTarget: false,
})

const emit = defineEmits<{
  (e: 'click', payload: { zoneId: string; originRect: DOMRect }): void
  (e: 'device-dropped', payload: { device: ESPDevice; fromZoneId: string | null; toZoneId: string }): void
  (e: 'device-click', payload: { deviceId: string; originRect: DOMRect }): void
}>()

const espStore = useEspStore()
const dragStore = useDragStateStore()
const plateRef = ref<HTMLElement | null>(null)

// Local copy of ALL devices for VueDraggable v-model.
// Shallow watch on props.devices to sync (store replaces array reference on update).
const localDevices = ref<ESPDevice[]>([...props.devices])
watch(() => props.devices, (newDevices) => {
  localDevices.value = [...newDevices]
})

// ── Status Aggregation ───────────────────────────────────────────────────
const stats = computed(() => {
  const total = props.devices.length
  const online = props.devices.filter(d =>
    d.status === 'online' || d.connected === true
  ).length
  const warnings = props.devices.filter(d => {
    const id = espStore.getDeviceId(d)
    if (espStore.isMock(id)) {
      const m = d as any
      return m.system_state === 'ERROR' || m.actuators?.some((a: any) => a.emergency_stopped)
    }
    return d.status === 'error'
  }).length
  return { total, online, warnings }
})

/** CSS variant class based on zone health */
const statusVariant = computed(() => {
  if (stats.value.warnings > 0) return 'zone-plate--warning'
  if (stats.value.total > 0 && stats.value.online === stats.value.total) return 'zone-plate--healthy'
  if (props.devices.some(d => d.status === 'error')) return 'zone-plate--error'
  return ''
})

// ── Aggregated Zone Metrics ──────────────────────────────────────────────
interface ZoneMetrics {
  tempMin: number | null
  tempMax: number | null
  humMin: number | null
  humMax: number | null
  activeActuators: number
}

const zoneMetrics = computed((): ZoneMetrics => {
  let tempMin: number | null = null
  let tempMax: number | null = null
  let humMin: number | null = null
  let humMax: number | null = null
  let activeActuators = 0

  for (const device of props.devices) {
    const sensors = device.sensors as any[] | undefined
    if (sensors) {
      for (const s of sensors) {
        if (s.raw_value == null) continue
        const val = Number(s.raw_value)
        const type = (s.sensor_type || s.type || '').toLowerCase()

        if (type.includes('temp') || type.includes('ds18b20')) {
          if (tempMin === null || val < tempMin) tempMin = val
          if (tempMax === null || val > tempMax) tempMax = val
        }
        if (type.includes('humid') || type.includes('sht3')) {
          if (humMin === null || val < humMin) humMin = val
          if (humMax === null || val > humMax) humMax = val
        }
      }
    }

    const actuators = device.actuators as any[] | undefined
    if (actuators) {
      activeActuators += actuators.filter((a: any) => a.state === 'on' || a.active === true).length
    }
  }

  return { tempMin, tempMax, humMin, humMax, activeActuators }
})

const hasMetrics = computed(() =>
  zoneMetrics.value.tempMin !== null ||
  zoneMetrics.value.humMin !== null ||
  zoneMetrics.value.activeActuators > 0
)

// ── Subzone Grouping ─────────────────────────────────────────────────────
interface SubzoneGroup {
  subzoneId: string | null
  subzoneName: string
  devices: ESPDevice[]
}

const subzoneGroups = computed((): SubzoneGroup[] => {
  const groups = new Map<string | null, SubzoneGroup>()

  for (const device of props.devices) {
    const szId = device.subzone_id || null
    if (!groups.has(szId)) {
      groups.set(szId, {
        subzoneId: szId,
        subzoneName: device.subzone_name || (szId ? szId : ''),
        devices: [],
      })
    }
    groups.get(szId)!.devices.push(device)
  }

  // Sort: named subzones first, then unassigned
  const result = Array.from(groups.values())
  result.sort((a, b) => {
    if (a.subzoneId === null) return 1
    if (b.subzoneId === null) return -1
    return a.subzoneName.localeCompare(b.subzoneName)
  })
  return result
})

// ── Click Handler ────────────────────────────────────────────────────────
function handlePlateClick(event: Event) {
  // Don't zoom if click came from a mini card or drag
  const target = event.target as HTMLElement
  if (target.closest('.device-mini-card')) return
  if (dragStore.isAnyDragActive) return

  const rect = plateRef.value?.getBoundingClientRect()
  if (rect) {
    emit('click', { zoneId: props.zoneId, originRect: rect })
  }
}

function handleDeviceClick(payload: { deviceId: string; originRect: DOMRect }) {
  emit('device-click', payload)
}

// ── Drag & Drop ──────────────────────────────────────────────────────────
function isMock(device: ESPDevice): boolean {
  return espStore.isMock(espStore.getDeviceId(device))
}

function handleDragAdd(event: any) {
  const deviceId = event?.item?.dataset?.deviceId
  if (!deviceId) return

  // Look up in store to get authoritative data (device may come from another zone)
  const device = espStore.devices.find(d =>
    espStore.getDeviceId(d) === deviceId
  )
  if (!device) return

  const fromZoneId = device.zone_id || null
  emit('device-dropped', {
    device,
    fromZoneId,
    toZoneId: props.zoneId,
  })
}

function handleDragStart() {
  dragStore.startEspCardDrag()
}

function handleDragEnd() {
  dragStore.endEspCardDrag()
}
</script>

<template>
  <article
    ref="plateRef"
    class="zone-plate"
    :class="[statusVariant, { 'zone-plate--drop-target': isDropTarget }]"
    role="region"
    :aria-label="`Zone ${zoneName}: ${stats.online}/${stats.total} Geräte online`"
    tabindex="0"
    @click="handlePlateClick"
    @keydown.enter="handlePlateClick"
  >
    <!-- Zone Header -->
    <div class="zone-plate__header">
      <h3 class="zone-plate__title">{{ zoneName }}</h3>
      <div class="zone-plate__stats" aria-live="polite">
        <span class="zone-plate__count">{{ stats.online }}/{{ stats.total }} Online</span>
        <span v-if="stats.warnings > 0" class="zone-plate__warning">
          · {{ stats.warnings }} Warning{{ stats.warnings > 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- Aggregated zone metrics (compact one-liner) -->
    <div v-if="hasMetrics" class="zone-plate__metrics">
      <span v-if="zoneMetrics.tempMin !== null" class="zone-plate__metric">
        {{ zoneMetrics.tempMin }}–{{ zoneMetrics.tempMax }}°C
      </span>
      <span v-if="zoneMetrics.humMin !== null" class="zone-plate__metric">
        {{ zoneMetrics.humMin }}–{{ zoneMetrics.humMax }}%
      </span>
      <span v-if="zoneMetrics.activeActuators > 0" class="zone-plate__metric zone-plate__metric--active">
        {{ zoneMetrics.activeActuators }} Aktor{{ zoneMetrics.activeActuators > 1 ? 'en' : '' }} aktiv
      </span>
    </div>

    <!-- Devices grouped by subzone for visual clarity, inside ONE VueDraggable for cross-zone drag-drop -->
    <VueDraggable
      v-model="localDevices"
      class="zone-plate__devices"
      group="esp-devices"
      :animation="0"
      handle=".esp-drag-handle"
      :force-fallback="true"
      :fallback-on-body="true"
      ghost-class="zone-item--ghost"
      :swap-threshold="0.65"
      @add="handleDragAdd"
      @start="handleDragStart"
      @end="handleDragEnd"
    >
      <!-- Subzone visual grouping (rendered inline within the flat drag list) -->
      <template v-for="group in subzoneGroups" :key="group.subzoneId ?? '__ungrouped'">
        <div
          v-if="group.subzoneId && subzoneGroups.length > 1"
          class="zone-plate__subzone-label"
        >
          {{ group.subzoneName }}
        </div>
        <div
          v-for="device in group.devices"
          :key="espStore.getDeviceId(device)"
          :data-device-id="espStore.getDeviceId(device)"
          class="zone-plate__device-wrapper"
        >
          <DeviceMiniCard
            :device="device"
            :is-mock="isMock(device)"
            @click="handleDeviceClick"
          />
        </div>
      </template>
    </VueDraggable>

    <!-- Empty state -->
    <div v-if="devices.length === 0" class="zone-plate__empty">
      Keine Geräte
    </div>

    <!-- Zoom hint (visible on hover) -->
    <div class="zone-plate__zoom-hint" aria-hidden="true">
      Zone ansehen →
    </div>
  </article>
</template>

<style scoped>
.zone-plate {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--elevation-raised);
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
  position: relative;
  overflow: hidden;
}

/* Noise overlay for depth */
.zone-plate::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  pointer-events: none;
}

.zone-plate:hover {
  transform: translateY(-4px);
  box-shadow: var(--elevation-floating);
  border-color: var(--glass-border-hover);
}

.zone-plate:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Status-dependent top border */
.zone-plate--healthy {
  border-top: 2px solid transparent;
  border-image: var(--gradient-iridescent) 1;
}

.zone-plate--warning {
  border-top: 2px solid var(--color-warning);
  box-shadow: var(--elevation-raised), 0 -4px 20px rgba(251, 191, 36, 0.08);
}

.zone-plate--error {
  border-top: 2px solid var(--color-error);
  box-shadow: var(--elevation-raised), 0 -4px 20px rgba(248, 113, 113, 0.08);
}

/* Drag-over: iridescent border glow */
.zone-plate--drop-target {
  border-color: var(--color-iridescent-1);
  box-shadow:
    var(--elevation-floating),
    0 0 20px rgba(96, 165, 250, 0.15),
    inset 0 0 30px rgba(96, 165, 250, 0.03);
  background: rgba(255, 255, 255, 0.03);
}

/* Animated glow sweep on drop target */
.zone-plate--drop-target::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: var(--radius-lg);
  padding: 2px;
  background: var(--gradient-iridescent-full);
  background-size: 300% 100%;
  animation: glow-sweep 2s linear infinite;
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  z-index: 1;
}

/* Header */
.zone-plate__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
  gap: var(--space-2);
}

.zone-plate__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zone-plate__stats {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.zone-plate__count {
  color: var(--color-text-secondary);
}

.zone-plate__warning {
  color: var(--color-warning);
}

/* ── Aggregated metrics row ── */
.zone-plate__metrics {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
  padding: 2px 0;
}

.zone-plate__metric {
  white-space: nowrap;
}

.zone-plate__metric--active {
  color: var(--color-accent-bright);
}

/* Subzone hint below header */
.zone-plate__subzone-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: 500;
  margin-bottom: var(--space-2);
  opacity: 0.7;
}

/* Device flex grid — compact 6px gap */
.zone-plate__devices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
}

.zone-plate__device-wrapper {
  display: contents;
}

/* Subzone label inline within flat drag list */
.zone-plate__subzone-label {
  width: 100%;
  font-size: 9px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: 500;
  padding: 2px 4px 0;
  opacity: 0.6;
  flex-basis: 100%;
}

/* Empty state */
.zone-plate__empty {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-4);
}

/* Zoom hint (appears on hover) */
.zone-plate__zoom-hint {
  position: absolute;
  bottom: var(--space-2);
  right: var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-accent-bright);
  opacity: 0;
  transform: translateX(-4px);
  transition: all var(--transition-fast);
  pointer-events: none;
  font-weight: 500;
  z-index: 2;
}

.zone-plate:hover .zone-plate__zoom-hint {
  opacity: 0.7;
  transform: translateX(0);
}
</style>
