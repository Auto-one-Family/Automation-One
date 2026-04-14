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
 * - Subzone chips from device.subzones[] (T14-Fix-F: hydrated at page load)
 * - VueDraggable for cross-zone device drag-drop
 * - Zone management: rename, delete via context menu
 */

import { ref, computed, watch, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/shared/stores'
import { useUiStore } from '@/shared/stores/ui.store'
import { useSubzoneCRUD } from '@/composables/useSubzoneCRUD'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-vue-next'
import { PackageOpen } from 'lucide-vue-next'
import AccordionSection from '@/shared/design/primitives/AccordionSection.vue'
import { EmptyState } from '@/shared/design/patterns'
import DeviceMiniCard from './DeviceMiniCard.vue'
import { aggregateZoneSensors } from '@/utils/sensorDefaults'
import { getESPStatus } from '@/composables/useESPStatus'
import type { ZoneContextSummary, ZoneEntity } from '@/types'
import { Settings } from 'lucide-vue-next'


interface Props {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
  isDropTarget?: boolean
  isExpanded?: boolean
  zoneEntity?: ZoneEntity
  isArchived?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDropTarget: false,
  isExpanded: true,
  isArchived: false,
})

const emit = defineEmits<{
  (e: 'update:isExpanded', value: boolean): void
  (e: 'device-dropped', payload: { device: ESPDevice; fromZoneId: string | null; toZoneId: string }): void
  (e: 'device-click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'settings', device: ESPDevice): void
  (e: 'change-zone', device: ESPDevice): void
  (e: 'rename', payload: { zoneId: string; newName: string }): void
  (e: 'device-delete', deviceId: string): void
  (e: 'monitor-nav', device: ESPDevice): void
  (e: 'zone-settings', zoneId: string): void
}>()

const espStore = useEspStore()
const dragStore = useDragStateStore()
const uiStore = useUiStore()
const subzoneCRUD = useSubzoneCRUD()
const plateRef = ref<HTMLElement | null>(null)

// ── Subzone Filter (declared early — localDevices watch depends on it) ────
/** Active subzone filter (null = show all) */
const activeSubzoneFilter = ref<string | null>(null)

/** Filtered devices for VueDraggable based on subzone filter */
const filteredDevices = computed(() => {
  if (!activeSubzoneFilter.value) return props.devices
  return props.devices.filter(d =>
    d.subzones?.some(sz => sz.subzone_id === activeSubzoneFilter.value) ?? false
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

/** Pipe-separated segments with Ø prefix (aligned with Monitor L1 ZoneTileCard KPI semantics) */
const aggregatedSegments = computed(() => {
  return zoneAggregation.value.sensorTypes.map((agg) => {
    const avgRounded = Number.isInteger(agg.avg) ? `${agg.avg}` : agg.avg.toFixed(1)
    return { type: agg.type, text: `${avgRounded}\u2009${agg.unit}` }
  })
})

const extraTypeCount = computed(() => zoneAggregation.value.extraTypeCount)

// ── Zone Context (Phase 4) ───────────────────────────────────────────────
const zoneContext = computed<ZoneContextSummary | null>(() => {
  for (const d of props.devices) {
    if ((d as any).zone_context) return (d as any).zone_context
  }
  return null
})

const zoneContextLabel = computed(() => {
  const ctx = zoneContext.value
  if (!ctx) return ''
  const parts: string[] = []
  if (ctx.growth_phase) parts.push(ctx.growth_phase.replace(/_/g, ' '))
  if (ctx.variety) parts.push(ctx.variety)
  return parts.join(' · ')
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

// ── Subzone aggregation from device.subzones[] (T14-Fix-F) ──────────────
interface AggregatedSubzone {
  subzoneId: string
  subzoneName: string
  sensorCount: number
  actuatorCount: number
  devices: ESPDevice[]
}

/** Distinct subzones aggregated from all device.subzones[] arrays */
const distinctSubzones = computed((): AggregatedSubzone[] => {
  const subzoneMap = new Map<string, AggregatedSubzone>()

  for (const device of props.devices) {
    if (!device.subzones?.length) continue
    for (const sz of device.subzones) {
      if (!subzoneMap.has(sz.subzone_id)) {
        subzoneMap.set(sz.subzone_id, {
          subzoneId: sz.subzone_id,
          subzoneName: sz.subzone_name,
          sensorCount: 0,
          actuatorCount: 0,
          devices: [],
        })
      }
      const entry = subzoneMap.get(sz.subzone_id)!
      entry.sensorCount += sz.sensor_count
      entry.actuatorCount += sz.actuator_count
      if (!entry.devices.includes(device)) {
        entry.devices.push(device)
      }
    }
  }

  return Array.from(subzoneMap.values())
    .sort((a, b) => (a.subzoneName ?? '').localeCompare(b.subzoneName ?? ''))
})

/** Subzone status dot color based on device online status */
function getSubzoneStatusColor(group: AggregatedSubzone): string {
  const online = group.devices.filter(d => {
    const s = getESPStatus(d)
    return s === 'online' || s === 'stale'
  }).length
  if (online === 0) return 'var(--color-error)'
  if (online < group.devices.length) return 'var(--color-warning)'
  return 'var(--color-success)'
}

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
  if (fromZoneId === props.zoneId) {
    return
  }
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
        'zone-plate--drop-target': !isArchived && (isDropTarget || dragStore.isDraggingEspCard),
        'zone-plate--archived': isArchived,
      },
    ]"
    role="region"
    :aria-label="`Zone ${zoneName}: ${stats.online}/${stats.total} Geräte online`"
  >
    <AccordionSection
      :model-value="true"
      class="zone-plate__accordion"
    >
      <!-- Custom zone header -->
      <template #header>
        <div
          class="zone-plate__header"
          :aria-expanded="true"
        >
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
            <h3 class="zone-plate__title" @click.stop="startRename" title="Klicken zum Umbenennen">{{ zoneName }}</h3>
            <button
              class="zone-plate__edit-btn"
              title="Zone umbenennen"
              @click.stop="startRename"
            >
              <Pencil class="zone-plate__edit-icon" />
            </button>
          </template>

          <!-- B1: Aggregated sensor values (pipe-separated; Ø = Zonenmittel, konsistent mit Monitor L1) -->
          <span
            v-if="aggregatedSegments.length > 0"
            class="zone-plate__agg-values"
            title="Zonenmittel pro Sensorkategorie (ohne stale)"
          >
            <template v-for="(seg, i) in aggregatedSegments" :key="seg.type">
              <template v-if="i > 0"> | </template>
              <span class="zone-plate__agg-avg" aria-hidden="true">Ø</span>{{ seg.text }}
            </template>
            <span v-if="extraTypeCount > 0" class="zone-plate__agg-extra">+{{ extraTypeCount }}</span>
          </span>

          <!-- Phase 4: Zone context badge -->
          <span v-if="zoneContextLabel" class="zone-plate__context-badge" :title="zoneContext?.variety || ''">
            {{ zoneContextLabel }}
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

          <!-- Archived badge -->
          <span v-if="isArchived" class="zone-plate__archived-badge">Archiv</span>

          <!-- Settings button -->
          <button
            v-if="zoneEntity"
            class="zone-plate__settings-btn"
            title="Zone-Einstellungen"
            @click.stop="emit('zone-settings', zoneId)"
          >
            <Settings class="zone-plate__settings-icon" />
          </button>

        </div>

        <!-- B3: Subzone chips (with CRUD — disabled for archived zones) -->
        <div v-if="!isArchived && (distinctSubzones.length > 0 || subzoneCRUD.creatingSubzoneForZone.value === zoneId)" class="zone-plate__subzone-chips" @click.stop>
          <template v-for="sz in distinctSubzones" :key="sz.subzoneId ?? '__none'">
            <!-- Inline rename mode -->
            <div v-if="subzoneCRUD.editingSubzoneId.value === sz.subzoneId" class="zone-plate__subzone-chip zone-plate__subzone-chip--editing">
              <input
                v-model="subzoneCRUD.editingSubzoneName.value"
                class="zone-plate__subzone-rename-input"
                @click.stop
                @keyup.enter.stop="subzoneCRUD.saveSubzoneName(sz.subzoneId!, zoneId)"
                @keyup.escape.stop="subzoneCRUD.cancelRenameSubzone()"
              />
              <button class="zone-plate__subzone-action" @click.stop="subzoneCRUD.saveSubzoneName(sz.subzoneId!, zoneId)" :disabled="subzoneCRUD.subzoneActionLoading.value">
                <Check class="w-3 h-3" />
              </button>
              <button class="zone-plate__subzone-action" @click.stop="subzoneCRUD.cancelRenameSubzone()">
                <X class="w-3 h-3" />
              </button>
            </div>
            <!-- Normal chip with hover actions -->
            <div v-else class="zone-plate__subzone-chip-wrap">
              <button
                class="zone-plate__subzone-chip"
                :class="{ 'zone-plate__subzone-chip--active': activeSubzoneFilter === sz.subzoneId }"
                @click.stop="toggleSubzoneFilter(sz.subzoneId)"
              >
                <span
                  class="zone-plate__subzone-chip-dot"
                  :style="{ backgroundColor: getSubzoneStatusColor(sz) }"
                />
                {{ sz.subzoneName }}
                <span v-if="sz.sensorCount > 0 || sz.actuatorCount > 0" class="zone-plate__subzone-chip-count">
                  {{ sz.sensorCount }}S{{ sz.actuatorCount > 0 ? ` ${sz.actuatorCount}A` : '' }}
                </span>
              </button>
              <div class="zone-plate__subzone-hover-actions">
                <button class="zone-plate__subzone-action" title="Umbenennen" @click.stop="subzoneCRUD.startRenameSubzone(sz.subzoneId!, sz.subzoneName)">
                  <Pencil class="w-2.5 h-2.5" />
                </button>
                <button class="zone-plate__subzone-action zone-plate__subzone-action--danger" title="Loeschen" @click.stop="uiStore.confirm({ title: 'Subzone loeschen', message: `&quot;${sz.subzoneName}&quot; wirklich loeschen?`, variant: 'danger', confirmText: 'Loeschen' }).then(ok => { if (ok) subzoneCRUD.deleteSubzone(sz.subzoneId!, sz.subzoneName, zoneId) })">
                  <Trash2 class="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </template>

          <!-- Create subzone inline form -->
          <div v-if="subzoneCRUD.creatingSubzoneForZone.value === zoneId" class="zone-plate__subzone-chip zone-plate__subzone-chip--editing">
            <input
              v-model="subzoneCRUD.newSubzoneName.value"
              class="zone-plate__subzone-rename-input"
              placeholder="Name..."
              @click.stop
              @keyup.enter.stop="subzoneCRUD.confirmCreateSubzone(zoneId)"
              @keyup.escape.stop="subzoneCRUD.cancelCreateSubzone()"
            />
            <button class="zone-plate__subzone-action" :disabled="subzoneCRUD.subzoneActionLoading.value" @click.stop="subzoneCRUD.confirmCreateSubzone(zoneId)">
              <Check class="w-3 h-3" />
            </button>
            <button class="zone-plate__subzone-action" @click.stop="subzoneCRUD.cancelCreateSubzone()">
              <X class="w-3 h-3" />
            </button>
          </div>

          <!-- Add subzone button -->
          <button
            v-if="subzoneCRUD.creatingSubzoneForZone.value !== zoneId"
            class="zone-plate__subzone-chip zone-plate__subzone-chip--add"
            @click.stop="subzoneCRUD.startCreateSubzone(zoneId)"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>
      </template>

      <!-- Devices inside VueDraggable for cross-zone drag-drop (disabled for archived zones) -->
      <VueDraggable
        v-model="localDevices"
        class="zone-plate__devices"
        :group="isArchived ? undefined : 'esp-devices'"
        :animation="150"
        handle=".esp-drag-handle"
        :force-fallback="true"
        :fallback-on-body="true"
        :disabled="isArchived"
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
            @device-delete="handleDeviceDelete"
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
  cursor: default;
  user-select: none;
  padding: var(--space-1) 0;
}

.zone-plate__header:hover .zone-plate__title {
  color: var(--color-accent-bright);
}

.zone-plate__header:hover .zone-plate__edit-btn {
  opacity: 1;
}

.zone-plate__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
  transition: color var(--transition-fast), text-decoration-color var(--transition-fast);
}

.zone-plate__title:hover {
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  text-decoration-color: var(--color-text-muted);
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

/* Pencil edit button (subtle on desktop, visible on touch) */
.zone-plate__edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.4;
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
  flex: 1;
  margin-left: var(--space-2);
}

.zone-plate__agg-avg {
  font-size: 0.85em;
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-right: 1px;
}

/* Extra type count badge */
.zone-plate__agg-extra {
  font-size: 9px;
  color: var(--color-text-muted);
  margin-left: 2px;
}

/* Stats label */
.zone-plate__context-badge {
  font-size: var(--text-xs);
  color: var(--color-iridescent-3);
  background: rgba(167, 139, 250, 0.1);
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  flex-shrink: 0;
  text-transform: capitalize;
}

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
  padding: 2px 0 0 0;
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

.zone-plate__subzone-chip-count {
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  opacity: 0.8;
  margin-left: 1px;
}

/* Subzone chip wrapper (chip + hover actions) */
.zone-plate__subzone-chip-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.zone-plate__subzone-hover-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0.4;
  transition: opacity var(--transition-fast);
  margin-left: -2px;
}

.zone-plate__subzone-chip-wrap:hover .zone-plate__subzone-hover-actions,
.zone-plate__subzone-chip-wrap:focus-within .zone-plate__subzone-hover-actions {
  opacity: 1;
}

.zone-plate__subzone-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.zone-plate__subzone-action:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.zone-plate__subzone-action--danger:hover {
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.1);
}

.zone-plate__subzone-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Inline subzone rename input */
.zone-plate__subzone-rename-input {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-iridescent-1);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  outline: none;
  width: 80px;
  max-width: 120px;
}

/* Chip in editing/creating mode */
.zone-plate__subzone-chip--editing {
  gap: 2px;
  padding: 1px 2px 1px 4px;
  border-color: var(--color-iridescent-1);
  background: rgba(96, 165, 250, 0.04);
  cursor: default;
}

/* Add subzone "+" chip */
.zone-plate__subzone-chip--add {
  padding: 1px 6px;
  border-style: dashed;
  color: var(--color-text-muted);
  opacity: 0.5;
  transition: all var(--transition-fast);
}

.zone-plate__subzone-chip--add:hover {
  opacity: 1;
  border-color: var(--color-iridescent-1);
  color: var(--color-iridescent-1);
}

/* Alert badge */
.zone-plate__alert {
  font-size: var(--text-xs);
  color: var(--color-warning);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ═══════ Body (expanded content) ═══════ */

/* Device grid — auto-fill stretches cards when few devices */
.zone-plate__devices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
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
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}

.zone-item--chosen > * {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--color-iridescent-1) !important;
}

.zone-item--drag {
  transform: scale(1.03);
  z-index: var(--z-drag-overlay);
  pointer-events: none;
}

.zone-item--drag > * {
  box-shadow: 0 12px 32px rgba(96, 165, 250, 0.3) !important;
}

/* ═══════ Archived state ═══════ */
.zone-plate--archived {
  opacity: 0.6;
  border-style: dashed;
  border-top: 1px dashed var(--glass-border);
}

.zone-plate--archived .zone-plate__title {
  color: var(--color-text-muted);
}

/* ═══════ Archived badge ═══════ */
.zone-plate__archived-badge {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.1);
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(251, 191, 36, 0.2);
  flex-shrink: 0;
}

/* ═══════ Settings button ═══════ */
.zone-plate__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
  padding: 0;
}

.zone-plate__header:hover .zone-plate__settings-btn,
.zone-plate__header:focus-within .zone-plate__settings-btn {
  opacity: 1;
}

.zone-plate__settings-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.zone-plate__settings-icon {
  width: 14px;
  height: 14px;
}

@media (max-width: 640px) {
  .zone-plate__header {
    flex-wrap: wrap;
  }

  .zone-plate__stats {
    margin-left: 0;
  }
}

/* Touch devices: all interactive elements fully visible */
@media (hover: none) {
  .zone-plate__edit-btn,
  .zone-plate__settings-btn,
  .zone-plate__subzone-hover-actions {
    opacity: 1;
  }
}

</style>
