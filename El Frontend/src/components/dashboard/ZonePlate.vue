<script setup lang="ts">
/**
 * ZonePlate Component — Accordion Zone Section
 *
 * Renders a zone as an expandable section showing ESP devices directly.
 * Default: expanded (all ESPs visible). Collapsible for large installations.
 *
 * Features:
 * - Glassmorphism styling with noise texture
 * - Iridescent top border for healthy zones
 * - Zone header: ESP count, online/total, alerts (data on cards)
 * - Sensor/Actuator/Cross-ESP counts in header
 * - Subzone grouping by device.subzone_id
 * - VueDraggable for cross-zone device drag-drop
 * - Status aggregation (online/warning/error counts)
 * - Expand/Collapse toggle with animation
 */

import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useLogicStore } from '@/shared/stores/logic.store'
import { useDragStateStore } from '@/shared/stores'
import { getESPStatus } from '@/composables/useESPStatus'
import { ChevronDown, GitBranch } from 'lucide-vue-next'
import DeviceMiniCard from './DeviceMiniCard.vue'


interface Props {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
  isDropTarget?: boolean
  isExpanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDropTarget: false,
  isExpanded: true,
})

const emit = defineEmits<{
  (e: 'update:isExpanded', value: boolean): void
  (e: 'device-dropped', payload: { device: ESPDevice; fromZoneId: string | null; toZoneId: string }): void
  (e: 'device-click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'settings', device: ESPDevice): void
}>()

const espStore = useEspStore()
const logicStore = useLogicStore()
const dragStore = useDragStateStore()
const plateRef = ref<HTMLElement | null>(null)

// Local copy of ALL devices for VueDraggable v-model.
// Shallow watch on props.devices to sync (store replaces array reference on update).
const localDevices = ref<ESPDevice[]>([...props.devices])
watch(() => props.devices, (newDevices) => {
  localDevices.value = [...newDevices]
})

// ── Status Aggregation (server-centric via getESPStatus) ───────────────────
const stats = computed(() => {
  const total = props.devices.length
  const online = props.devices.filter(d => getESPStatus(d).isReachable).length
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

// ── Sensor / Actuator / Cross-ESP Counts ─────────────────────────────────
const totalSensors = computed(() =>
  props.devices.reduce((sum, d) => {
    const sensors = d.sensors as any[] | undefined
    return sum + (sensors?.length ?? d.sensor_count ?? 0)
  }, 0)
)

const totalActuators = computed(() =>
  props.devices.reduce((sum, d) => {
    const actuators = d.actuators as any[] | undefined
    return sum + (actuators?.length ?? d.actuator_count ?? 0)
  }, 0)
)

const crossEspCount = computed(() => {
  return logicStore.crossEspConnections.filter(conn => {
    const sourceDevice = espStore.devices.find(d => espStore.getDeviceId(d) === conn.sourceEspId)
    const targetDevice = espStore.devices.find(d => espStore.getDeviceId(d) === conn.targetEspId)
    return sourceDevice?.zone_id === props.zoneId || targetDevice?.zone_id === props.zoneId
  }).length
})

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

// ── Toggle Handler ────────────────────────────────────────────────────────
function toggleExpanded() {
  if (dragStore.isAnyDragActive) return
  emit('update:isExpanded', !props.isExpanded)
}

function handleDeviceClick(payload: { deviceId: string; originRect: DOMRect }) {
  emit('device-click', payload)
}

function handleDeviceSettings(device: ESPDevice) {
  emit('settings', device)
}

// ── Drag & Drop ──────────────────────────────────────────────────────────
function isMock(device: ESPDevice): boolean {
  return espStore.isMock(espStore.getDeviceId(device))
}

function handleDragAdd(event: any) {
  const deviceId = event?.item?.dataset?.deviceId
  if (!deviceId) return

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
  <section
    ref="plateRef"
    class="zone-plate"
    :class="[
      statusVariant,
      {
        'zone-plate--drop-target': isDropTarget || dragStore.isDraggingEspCard,
        'zone-plate--collapsed': !isExpanded,
      },
    ]"
    role="region"
    :aria-label="`Zone ${zoneName}: ${stats.online}/${stats.total} Geräte online`"
    :aria-expanded="isExpanded"
  >
    <!-- Zone Header (always visible, clickable to toggle) -->
    <div class="zone-plate__header" @click="toggleExpanded">
      <div class="zone-plate__header-left">
        <ChevronDown
          class="zone-plate__chevron"
          :class="{ 'zone-plate__chevron--collapsed': !isExpanded }"
        />
        <h3 class="zone-plate__title">{{ zoneName }}</h3>
        <span class="zone-plate__stats">
          <span class="zone-plate__count">{{ stats.total }} ESP{{ stats.total !== 1 ? 's' : '' }} · {{ stats.online }}/{{ stats.total }} Online</span>
          <span
            v-if="stats.warnings > 0"
            class="zone-plate__warning"
          >
            · ⚠ {{ stats.warnings }}
          </span>
        </span>
      </div>
      <div class="zone-plate__header-right">
        <span v-if="totalSensors > 0" class="zone-plate__meta-pill">{{ totalSensors }}S</span>
        <span v-if="totalActuators > 0" class="zone-plate__meta-pill">{{ totalActuators }}A</span>
        <RouterLink
          v-if="crossEspCount > 0"
          to="/logic"
          class="zone-plate__cross-esp-badge"
          @click.stop
        >
          <GitBranch class="zone-plate__cross-icon" />
          {{ crossEspCount }}
        </RouterLink>
      </div>
    </div>

    <!-- Expanded: full zone content (metrics/sensor-preview removed; data on ESP cards) -->
    <div v-show="isExpanded" class="zone-plate__body">
      <!-- Subzone chips -->
      <div v-if="subzoneGroups.length > 1" class="zone-plate__subzone-chips">
        <span
          v-for="g in subzoneGroups.filter(sg => sg.subzoneId)"
          :key="g.subzoneId!"
          class="zone-plate__chip"
        >
          {{ g.subzoneName }}
        </span>
      </div>

      <!-- Devices grouped by subzone, inside ONE VueDraggable for cross-zone drag-drop -->
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
              @settings="handleDeviceSettings"
            />
          </div>
        </template>
      </VueDraggable>

      <!-- Empty state -->
      <div v-if="devices.length === 0" class="zone-plate__empty">
        Keine Geräte — ziehe ESPs hierher
      </div>
    </div>
  </section>
</template>

<style scoped>
.zone-plate {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--elevation-raised);
  transition: box-shadow var(--transition-base);
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

/* ═══════ Header ═══════ */
.zone-plate__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) 0;
  margin-bottom: var(--space-1);
}

.zone-plate__header:hover .zone-plate__title {
  color: var(--color-accent-bright);
}

.zone-plate__header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.zone-plate__header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.zone-plate__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.zone-plate__chevron--collapsed {
  transform: rotate(-90deg);
}

.zone-plate__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--transition-fast);
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

/* Meta pills (sensor/actuator counts) */
.zone-plate__meta-pill {
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* Cross-ESP badge */
.zone-plate__cross-esp-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.08);
  border: 1px solid rgba(96, 165, 250, 0.15);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  text-decoration: none;
  transition: all var(--transition-fast);
}

.zone-plate__cross-esp-badge:hover {
  background: rgba(96, 165, 250, 0.15);
  color: var(--color-iridescent-2);
}

.zone-plate__cross-icon {
  width: 10px;
  height: 10px;
}

/* ═══════ Body (expanded content) ═══════ */
.zone-plate__body {
  padding-top: var(--space-1);
}

/* ── Subzone chips ── */
.zone-plate__subzone-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}

.zone-plate__chip {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* Device flex grid */
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
  background: var(--glass-bg);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
}

/* Collapsed compact padding */
.zone-plate--collapsed {
  padding-bottom: var(--space-2);
}

@media (max-width: 640px) {
  .zone-plate__header {
    flex-wrap: wrap;
  }

  .zone-plate__header-right {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
