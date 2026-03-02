<script setup lang="ts">
/**
 * ZonePlate Component — Accordion Zone Section
 *
 * Renders a zone as an expandable section showing ESP devices directly.
 * Uses AccordionSection primitive for expand/collapse animation.
 *
 * Features:
 * - Glassmorphism styling with noise texture
 * - Iridescent top border for healthy zones
 * - Slim header: Zone-Name + ESP-Count + Online-Status + Alerts + Overflow Menu
 * - Inline zone name editing (pencil icon)
 * - Subzone grouping by device.subzone_id
 * - VueDraggable for cross-zone device drag-drop
 * - Zone management: rename, delete via context menu
 */

import { ref, computed, watch, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/shared/stores'
import { useUiStore } from '@/shared/stores/ui.store'
import { ChevronDown, MoreVertical, Pencil, Trash2, Activity } from 'lucide-vue-next'
import { PackageOpen } from 'lucide-vue-next'
import AccordionSection from '@/shared/design/primitives/AccordionSection.vue'
import { EmptyState } from '@/shared/design/patterns'
import DeviceMiniCard from './DeviceMiniCard.vue'
import { aggregateZoneSensors, formatAggregatedValue } from '@/utils/sensorDefaults'
import { getESPStatus } from '@/composables/useESPStatus'


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
  (e: 'change-zone', device: ESPDevice): void
  (e: 'rename', payload: { zoneId: string; newName: string }): void
  (e: 'delete', zoneId: string): void
  (e: 'device-delete', deviceId: string): void
  (e: 'monitor-nav', device: ESPDevice): void
}>()

const espStore = useEspStore()
const dragStore = useDragStateStore()
const uiStore = useUiStore()
const plateRef = ref<HTMLElement | null>(null)

// ── Subzone Filter (declared early — localDevices watch depends on it) ────
/** Active subzone filter (null = show all) */
const activeSubzoneFilter = ref<string | null>(null)

/** Filtered devices for VueDraggable based on subzone filter */
const filteredDevices = computed(() => {
  if (!activeSubzoneFilter.value) return props.devices
  return props.devices.filter(d =>
    (d.subzone_id || null) === activeSubzoneFilter.value
  )
})

// Local copy of devices for VueDraggable v-model.
// Syncs with filteredDevices (respects subzone filter).
const localDevices = ref<ESPDevice[]>([...props.devices])
watch([() => props.devices, () => activeSubzoneFilter.value], () => {
  localDevices.value = [...filteredDevices.value]
})
// ── Status Aggregation ───────────────────────────────────────────────────
const stats = computed(() => {
  const total = props.devices.length
  const online = props.devices.filter(d => {
    const status = getESPStatus(d)
    return status === 'online' || status === 'stale'
  }).length
  const warnings = props.devices.filter(d => {
    const status = getESPStatus(d)
    if (status === 'error' || status === 'safemode') return true
    // Emergency-stopped actuators count as warnings regardless of device status
    const actuators = (d as any).actuators as Array<{ emergency_stopped?: boolean }> | undefined
    return actuators?.some(a => a.emergency_stopped) ?? false
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

// ── B1: Zone Sensor Aggregation ──────────────────────────────────────────
const zoneAggregation = computed(() => aggregateZoneSensors(props.devices))

const aggregatedValues = computed(() => {
  return zoneAggregation.value.sensorTypes.map(agg =>
    formatAggregatedValue(agg, stats.value.total)
  )
})

// ── B2: Status Dot Color ─────────────────────────────────────────────────
const statusDotColor = computed(() => {
  if (stats.value.total === 0) return 'var(--color-text-muted)'
  if (stats.value.online === 0) return 'var(--color-error)'
  if (stats.value.online < stats.value.total) return 'var(--color-warning)'
  return 'var(--color-success)'
})

const statusLabel = computed(() => {
  if (stats.value.total === 0) return '- Leer'
  if (stats.value.online === 0) return `0/${stats.value.total} Offline`
  return `${stats.value.online}/${stats.value.total} Online`
})

// ── B3: Subzone Chips ────────────────────────────────────────────────────
function toggleSubzoneFilter(subzoneId: string | null) {
  if (activeSubzoneFilter.value === subzoneId) {
    activeSubzoneFilter.value = null // Deselect
  } else {
    activeSubzoneFilter.value = subzoneId
  }
}

/** Distinct subzones with at least one device */
const distinctSubzones = computed(() => {
  return subzoneGroups.value.filter(g => g.subzoneId !== null)
})

/** Subzone status dot color */
function getSubzoneStatusColor(group: SubzoneGroup): string {
  const online = group.devices.filter(d => {
    const s = getESPStatus(d)
    return s === 'online' || s === 'stale'
  }).length
  if (online === 0) return 'var(--color-error)'
  if (online < group.devices.length) return 'var(--color-warning)'
  return 'var(--color-success)'
}

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

// ── Inline Rename ────────────────────────────────────────────────────────
const isRenaming = ref(false)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function startRename() {
  renameValue.value = props.zoneName
  isRenaming.value = true
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function confirmRename() {
  if (!isRenaming.value) return
  const trimmed = renameValue.value.trim()
  isRenaming.value = false
  if (trimmed && trimmed !== props.zoneName) {
    emit('rename', { zoneId: props.zoneId, newName: trimmed })
  }
}

function cancelRename() {
  isRenaming.value = false
}

// ── Overflow Menu ────────────────────────────────────────────────────────
function openOverflowMenu(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  uiStore.openContextMenu(rect.right, rect.bottom, [
    {
      id: 'rename',
      label: 'Umbenennen',
      icon: Pencil,
      action: () => startRename(),
    },
    {
      id: 'delete',
      label: 'Löschen',
      icon: Trash2,
      variant: 'danger',
      action: () => handleZoneDelete(),
    },
  ])
}

async function handleZoneDelete() {
  const deviceCount = stats.value.total
  const confirmed = await uiStore.confirm({
    title: 'Zone löschen',
    message: deviceCount > 0
      ? `Alle ${deviceCount} Geräte in "${props.zoneName}" werden aus der Zone entfernt. Die Geräte werden nicht gelöscht.`
      : `Zone "${props.zoneName}" wird entfernt.`,
    variant: 'danger',
    confirmText: 'Zone löschen',
  })
  if (confirmed) {
    emit('delete', props.zoneId)
  }
}

// ── Toggle Handler ────────────────────────────────────────────────────────
function handleHeaderClick(toggle: () => void) {
  if (dragStore.isAnyDragActive) return
  if (isRenaming.value) return
  toggle()
}

function handleDeviceClick(payload: { deviceId: string; originRect: DOMRect }) {
  emit('device-click', payload)
}

function handleDeviceSettings(device: ESPDevice) {
  emit('settings', device)
}

function handleDeviceChangeZone(device: ESPDevice) {
  emit('change-zone', device)
}

function handleDeviceDelete(deviceId: string) {
  emit('device-delete', deviceId)
}

function handleDeviceMonitorNav(device: ESPDevice) {
  emit('monitor-nav', device)
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
      },
    ]"
    role="region"
    :aria-label="`Zone ${zoneName}: ${stats.online}/${stats.total} Geräte online`"
  >
    <AccordionSection
      :model-value="isExpanded"
      class="zone-plate__accordion"
      @update:model-value="(val: boolean) => emit('update:isExpanded', val)"
    >
      <!-- Custom zone header -->
      <template #header="{ isOpen, toggle }">
        <div
          class="zone-plate__header"
          :aria-expanded="isOpen"
          @click="handleHeaderClick(toggle)"
        >
          <ChevronDown
            class="zone-plate__chevron"
            :class="{ 'zone-plate__chevron--collapsed': !isOpen }"
          />

          <!-- Zone name: inline editable -->
          <template v-if="isRenaming">
            <input
              ref="renameInputRef"
              v-model="renameValue"
              class="zone-plate__rename-input"
              maxlength="60"
              @click.stop
              @keydown.enter.prevent="confirmRename"
              @keydown.escape.prevent="cancelRename"
              @blur="confirmRename"
            />
          </template>
          <template v-else>
            <h3 class="zone-plate__title">{{ zoneName }}</h3>
            <button
              class="zone-plate__edit-btn"
              title="Zone umbenennen"
              @click.stop="startRename"
            >
              <Pencil class="zone-plate__edit-icon" />
            </button>
          </template>

          <!-- B1: Aggregated sensor values -->
          <span v-if="aggregatedValues.length > 0" class="zone-plate__agg-values">
            {{ aggregatedValues.join('  ') }}
          </span>

          <!-- B2: Status with colored dot -->
          <span class="zone-plate__stats">
            {{ stats.total }} ESP{{ stats.total !== 1 ? 's' : '' }}
            <span class="zone-plate__stats-sep">·</span>
            <span
              class="zone-plate__status-dot"
              :style="{ backgroundColor: statusDotColor }"
            />
            {{ statusLabel }}
          </span>

          <span
            v-if="stats.warnings > 0"
            class="zone-plate__alert"
          >
            ⚠ {{ stats.warnings }}
          </span>

          <!-- Monitor quick-link -->
          <RouterLink
            :to="{ name: 'monitor-zone', params: { zoneId: zoneId } }"
            class="zone-plate__monitor-link"
            title="Zone im Monitor anzeigen"
            @click.stop
          >
            <Activity class="zone-plate__monitor-icon" />
            <span class="zone-plate__monitor-label">Monitor</span>
          </RouterLink>

          <!-- Overflow menu -->
          <button
            class="zone-plate__menu-btn"
            title="Zone-Aktionen"
            @click.stop="openOverflowMenu($event)"
          >
            <MoreVertical class="zone-plate__menu-icon" />
          </button>
        </div>

        <!-- B3: Subzone chips (only if subzones exist) -->
        <div v-if="distinctSubzones.length > 0" class="zone-plate__subzone-chips" @click.stop>
          <button
            v-for="sz in distinctSubzones"
            :key="sz.subzoneId ?? '__none'"
            class="zone-plate__subzone-chip"
            :class="{ 'zone-plate__subzone-chip--active': activeSubzoneFilter === sz.subzoneId }"
            @click.stop="toggleSubzoneFilter(sz.subzoneId)"
          >
            <span
              class="zone-plate__subzone-chip-dot"
              :style="{ backgroundColor: getSubzoneStatusColor(sz) }"
            />
            {{ sz.subzoneName }}
          </button>
        </div>
      </template>

      <!-- Devices inside VueDraggable for cross-zone drag-drop -->
      <VueDraggable
        v-model="localDevices"
        class="zone-plate__devices"
        group="esp-devices"
        :animation="150"
        handle=".esp-drag-handle"
        :force-fallback="true"
        :fallback-on-body="true"
        ghost-class="zone-item--ghost"
        chosen-class="zone-item--chosen"
        drag-class="zone-item--drag"
        :swap-threshold="0.65"
        :delay-on-touch-only="true"
        :delay="300"
        :fallback-tolerance="5"
        :touch-start-threshold="3"
        @add="handleDragAdd"
        @start="handleDragStart"
        @end="handleDragEnd"
      >
        <div
          v-for="device in localDevices"
          :key="espStore.getDeviceId(device)"
          :data-device-id="espStore.getDeviceId(device)"
          class="zone-plate__device-wrapper"
        >
          <DeviceMiniCard
            :device="device"
            :is-mock="isMock(device)"
            @click="handleDeviceClick"
            @settings="handleDeviceSettings"
            @change-zone="handleDeviceChangeZone"
            @delete="handleDeviceDelete"
            @monitor-nav="handleDeviceMonitorNav"
          />
        </div>
      </VueDraggable>

      <!-- Empty state with drop target hint -->
      <EmptyState
        v-if="devices.length === 0"
        :icon="PackageOpen"
        title="Keine Geräte in dieser Zone"
        description="Weise ESPs per Drag & Drop zu — ziehe sie aus der Leiste unten oder aus einer anderen Zone."
        :show-action="false"
        class="zone-plate__empty"
      />
    </AccordionSection>
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

/* ═══════ Accordion override ═══════ */
.zone-plate__accordion :deep(.accordion) {
  border-bottom: none;
}

.zone-plate__accordion :deep(.accordion__panel--open .accordion__content) {
  padding-bottom: 0;
}

/* ═══════ Header ═══════ */
.zone-plate__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) 0;
}

.zone-plate__header:hover .zone-plate__title {
  color: var(--color-accent-bright);
}

.zone-plate__header:hover .zone-plate__edit-btn {
  opacity: 1;
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

/* Inline rename input */
.zone-plate__rename-input {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-iridescent-1);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-2);
  outline: none;
  min-width: 100px;
  max-width: 250px;
}

/* Pencil edit button (hover only) */
.zone-plate__edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
  padding: 0;
}

.zone-plate__edit-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.zone-plate__edit-icon {
  width: 12px;
  height: 12px;
}

/* Aggregated sensor values */
.zone-plate__agg-values {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* Stats label */
.zone-plate__stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto;
}

.zone-plate__stats-sep {
  color: var(--color-text-muted);
  opacity: 0.5;
  margin: 0 1px;
}

/* Status dot in header */
.zone-plate__status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

/* Subzone chips */
.zone-plate__subzone-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 0 0 22px; /* Indent to align with title (past chevron) */
}

.zone-plate__subzone-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.zone-plate__subzone-chip:hover {
  border-color: var(--color-text-secondary);
  color: var(--color-text-secondary);
}

.zone-plate__subzone-chip--active {
  border-color: var(--color-iridescent-1);
  color: var(--color-iridescent-1);
  background: rgba(96, 165, 250, 0.06);
}

.zone-plate__subzone-chip-dot {
  width: 4px;
  height: 4px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

/* Alert badge */
.zone-plate__alert {
  font-size: var(--text-xs);
  color: var(--color-warning);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Monitor quick-link */
.zone-plate__monitor-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: color var(--transition-fast), background var(--transition-fast), opacity var(--transition-fast);
  opacity: 0;
  text-decoration: none;
  font-size: 10px;
  font-weight: 500;
}

.zone-plate__header:hover .zone-plate__monitor-link {
  opacity: 1;
}

.zone-plate__monitor-link:hover {
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.08);
}

.zone-plate__monitor-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.zone-plate__monitor-label {
  display: none;
}

@media (min-width: 768px) {
  .zone-plate__monitor-label {
    display: inline;
  }
}

/* Overflow menu button */
.zone-plate__menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--transition-fast), background var(--transition-fast);
  padding: 0;
}

.zone-plate__menu-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.zone-plate__menu-icon {
  width: 14px;
  height: 14px;
}

/* ═══════ Body (expanded content) ═══════ */

/* Device flex grid */
.zone-plate__devices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
  padding-top: var(--space-1);
}

.zone-plate__device-wrapper {
  /* Must be a real box element — display: contents breaks SortableJS drag visuals */
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
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-3);
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.zone-plate__empty :deep(.empty-state) {
  padding: var(--space-3) var(--space-2);
}

.zone-plate__empty :deep(.empty-state__icon-wrapper) {
  width: 2.5rem;
  height: 2.5rem;
  margin-bottom: 0.5rem;
}

.zone-plate__empty :deep(.empty-state__icon) {
  width: 1.25rem;
  height: 1.25rem;
}

.zone-plate__empty :deep(.empty-state__title) {
  font-size: var(--text-sm);
  margin-bottom: 0.25rem;
}

.zone-plate__empty :deep(.empty-state__description) {
  font-size: var(--text-xs);
  margin-bottom: 0;
}

/* Drop target highlight for empty zones */
.zone-plate--drop-target .zone-plate__empty {
  border-color: var(--color-iridescent-1);
  background: rgba(96, 165, 250, 0.04);
}

/* ═══════ DnD Ghost / Chosen / Drag classes (from ZoneGroup reference) ═══════ */

.zone-item--ghost {
  opacity: 0.4;
  transform: scale(1.05);
}

.zone-item--ghost > * {
  border-style: dashed !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2) !important;
}

.zone-item--chosen {
  transform: scale(1.02);
}

.zone-item--chosen > * {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3) !important;
}

.zone-item--drag {
  transform: scale(1.03);
  z-index: var(--z-drag-overlay);
  pointer-events: none;
}

.zone-item--drag > * {
  box-shadow: 0 12px 32px rgba(96, 165, 250, 0.3) !important;
}

@media (max-width: 640px) {
  .zone-plate__header {
    flex-wrap: wrap;
  }

  .zone-plate__stats {
    margin-left: 0;
  }
}
</style>
