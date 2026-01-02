<script setup lang="ts">
/**
 * ZoneGroup Component
 *
 * A container for grouping ESPs by zone with:
 * - Collapsible zone header with device count
 * - Glass-morphism styling with iridescent border effects
 * - Drag & drop support via vue-draggable-plus
 * - Empty state for zones without devices
 * - Smooth transitions for expand/collapse and drag operations
 */

import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  ChevronDown,
  Tag,
  Layers,
  AlertTriangle
} from 'lucide-vue-next'
import ESPCard from '@/components/esp/ESPCard.vue'
import { type ESPDevice } from '@/api/esp'

interface Props {
  /** Zone ID (technical, lowercase) */
  zoneId: string
  /** Zone name (human-readable) */
  zoneName: string
  /** List of devices in this zone */
  devices: ESPDevice[]
  /** Whether the zone can be collapsed */
  collapsible?: boolean
  /** Whether the zone starts expanded */
  defaultExpanded?: boolean
  /** Enable drag & drop */
  enableDragDrop?: boolean
  /** Show as "unassigned" zone (special styling) */
  isUnassigned?: boolean
  /** Compact mode for dashboard (smaller cards) */
  compactMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsible: true,
  defaultExpanded: true,
  enableDragDrop: true,
  isUnassigned: false,
  compactMode: false,
})

const emit = defineEmits<{
  /** Emitted when a device is dropped into this zone */
  (e: 'device-dropped', payload: {
    device: ESPDevice
    fromZoneId: string | null
    toZoneId: string
  }): void
  /** Emitted when devices are reordered within the zone */
  (e: 'devices-reordered', devices: ESPDevice[]): void
  /** Request heartbeat for device */
  (e: 'heartbeat', espId: string): void
  /** Request safe-mode toggle */
  (e: 'toggle-safe-mode', espId: string): void
  /** Request device deletion */
  (e: 'delete', espId: string): void
}>()

// Local state
const isExpanded = ref(props.defaultExpanded)
const isDragOver = ref(false)
const dragOverCount = ref(0)  // Track nested drag events
const localDevices = ref<ESPDevice[]>([...props.devices])

// Watch for prop changes to sync local devices
watch(() => props.devices, (newDevices) => {
  localDevices.value = [...newDevices]
}, { deep: true })

// Computed
const deviceCount = computed(() => props.devices.length)

const headerClasses = computed(() => {
  const classes = ['zone-group__header']

  if (isDragOver.value) {
    classes.push('zone-group__header--drag-over')
  }

  if (props.isUnassigned) {
    classes.push('zone-group__header--unassigned')
  }

  if (!props.collapsible) {
    classes.push('zone-group__header--static')
  }

  return classes
})

const containerClasses = computed(() => {
  const classes = ['zone-group']

  if (isDragOver.value) {
    classes.push('zone-group--drag-over')
  }

  if (props.isUnassigned) {
    classes.push('zone-group--unassigned')
  }

  return classes
})

// Methods
function toggleExpanded() {
  if (props.collapsible) {
    isExpanded.value = !isExpanded.value
  }
}

// Drag & Drop handlers
// vue-draggable-plus @change event provides structured data with added/removed/moved
// This is more reliable than @add/@remove events which have SortableJS format

function handleDragChange(event: any) {
  // Handle add event - device dropped into this zone FROM another zone
  if (event.added) {
    const device = event.added.element as ESPDevice
    const fromZoneId = device.zone_id || null
    const deviceId = device.device_id || device.esp_id || ''

    console.debug(`[ZoneGroup] Device ${deviceId} dropped: ${fromZoneId} → ${props.zoneId}`)

    emit('device-dropped', {
      device,
      fromZoneId,
      toZoneId: props.zoneId
    })
  }

  // Handle moved event - reorder within zone
  if (event.moved) {
    emit('devices-reordered', localDevices.value)
  }
}

function handleDragAdd(_event: any) {
  // Kept for compatibility but @change handles this better
}

function handleDragUpdate(_event: any) {
  // Kept for compatibility but @change handles this better
}

function handleDragStart() {
  // Could add visual feedback here
}

function handleDragEnd() {
  isDragOver.value = false
}

// Container-level drag handlers for full zone drag-over effect
function handleContainerDragEnter(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value++
  isDragOver.value = true
}

function handleContainerDragLeave(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value--
  if (dragOverCount.value <= 0) {
    dragOverCount.value = 0
    isDragOver.value = false
  }
}

function handleContainerDrop(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value = 0
  isDragOver.value = false
}

// Forward card events
function handleHeartbeat(espId: string) {
  emit('heartbeat', espId)
}

function handleToggleSafeMode(espId: string) {
  emit('toggle-safe-mode', espId)
}

function handleDelete(espId: string) {
  emit('delete', espId)
}

// Utility function to get device ID
function getDeviceId(device: ESPDevice): string {
  return device.device_id || device.esp_id || ''
}
</script>

<template>
  <section
    :class="containerClasses"
    @dragenter="handleContainerDragEnter"
    @dragleave="handleContainerDragLeave"
    @dragover.prevent
    @drop="handleContainerDrop"
  >
    <!-- Minimal Section Header -->
    <div
      :class="headerClasses"
      role="button"
      :tabindex="collapsible ? 0 : -1"
      :aria-expanded="isExpanded"
      @click="toggleExpanded"
      @keydown.enter="toggleExpanded"
      @keydown.space.prevent="toggleExpanded"
    >
      <div class="zone-group__header-line"></div>

      <span class="zone-group__header-label">
        <component :is="isUnassigned ? AlertTriangle : Tag" class="zone-group__header-icon" />
        <span class="zone-group__header-text">{{ zoneName }}</span>
        <span class="zone-group__header-count">({{ deviceCount }})</span>
      </span>

      <div class="zone-group__header-line"></div>

      <ChevronDown
        v-if="collapsible"
        class="zone-group__chevron"
        :class="{ 'zone-group__chevron--expanded': isExpanded }"
      />
    </div>

    <!-- Zone Content (devices) -->
    <Transition name="zone-content">
      <div v-show="isExpanded" class="zone-group__content">
        <!-- Draggable wrapper with minimum height for empty drop targets -->
        <VueDraggable
          v-if="enableDragDrop"
          v-model="localDevices"
          class="zone-group__grid"
          :class="{
            'zone-group__grid--compact': compactMode,
            'zone-group__grid--empty': devices.length === 0
          }"
          group="esp-devices"
          :animation="200"
          ghost-class="zone-item--ghost"
          chosen-class="zone-item--chosen"
          drag-class="zone-item--drag"
          @add="handleDragAdd"
          @update="handleDragUpdate"
          @change="handleDragChange"
          @start="handleDragStart"
          @end="handleDragEnd"
        >
          <!-- Device cards - wrapper needs explicit height for VueDraggable -->
          <div
            v-for="device in localDevices"
            :key="getDeviceId(device)"
            class="zone-group__item"
            :data-device-id="getDeviceId(device)"
          >
            <slot name="device" :device="device" :device-id="getDeviceId(device)">
              <ESPCard
                :esp="device"
                @heartbeat="handleHeartbeat"
                @toggle-safe-mode="handleToggleSafeMode"
                @delete="handleDelete"
              />
            </slot>
          </div>

          <!-- Empty state INSIDE VueDraggable for drop target visibility -->
          <div v-if="devices.length === 0" class="zone-group__empty zone-group__empty--drop-target">
            <Layers class="zone-group__empty-icon" />
            <p class="zone-group__empty-text">
              {{ isUnassigned
                ? 'Geräte hierher ziehen, um sie aus ihrer Zone zu lösen'
                : 'Keine Geräte in dieser Zone'
              }}
            </p>
            <p class="zone-group__empty-hint">
              {{ isUnassigned
                ? 'Die Geräte bleiben erhalten und können später einer neuen Zone zugewiesen werden'
                : 'Geräte hierher ziehen zum Zuweisen'
              }}
            </p>
          </div>
        </VueDraggable>

        <!-- Non-draggable grid (fallback) -->
        <div
          v-else
          class="zone-group__grid"
          :class="{ 'zone-group__grid--compact': compactMode }"
        >
          <div
            v-for="device in devices"
            :key="getDeviceId(device)"
            class="zone-group__item"
          >
            <slot name="device" :device="device" :device-id="getDeviceId(device)">
              <ESPCard
                :esp="device"
                @heartbeat="handleHeartbeat"
                @toggle-safe-mode="handleToggleSafeMode"
                @delete="handleDelete"
              />
            </slot>
          </div>

          <!-- Empty state for non-draggable mode -->
          <div v-if="devices.length === 0" class="zone-group__empty">
            <Layers class="zone-group__empty-icon" />
            <p class="zone-group__empty-text">
              {{ isUnassigned
                ? 'Alle Geräte sind Zonen zugewiesen'
                : 'Keine Geräte in dieser Zone'
              }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
/* =============================================================================
   Zone Group - Minimal Section Header Design
   Industry-Benchmark: Home Assistant Mushroom Cards, Grafana IoT
   ============================================================================= */

/* Base: Transparent with left accent border */
.zone-group {
  position: relative;
  background: transparent;
  border-left: 2px solid rgba(96, 165, 250, 0.45);  /* Deutlich verstärkt */
  padding: 0.625rem 0 0.625rem 0.75rem;
  margin-bottom: 0;  /* Grid-Gap übernimmt */
  transition: all 0.2s ease;
}

/* Drag-over state: Highlight left border + subtle background */
.zone-group--drag-over {
  border-left-color: var(--color-iridescent-1);
  background: rgba(96, 165, 250, 0.02);
}

/* Pulsing left border effect during drag */
.zone-group--drag-over::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(
    180deg,
    var(--color-iridescent-1),
    var(--color-iridescent-2),
    var(--color-iridescent-3),
    var(--color-iridescent-1)
  );
  background-size: 100% 300%;
  animation: drag-pulse 1.5s ease-in-out infinite;
}

@keyframes drag-pulse {
  0%, 100% {
    background-position: 50% 0%;
    opacity: 0.8;
  }
  50% {
    background-position: 50% 100%;
    opacity: 1;
  }
}

/* Unassigned zone: Warning accent */
.zone-group--unassigned {
  border-left-color: rgba(251, 191, 36, 0.3);
}

/* =============================================================================
   Section Header - Horizontal line with pill label
   ============================================================================= */

.zone-group__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
  cursor: pointer;
  user-select: none;
}

.zone-group__header:focus-visible {
  outline: none;
}

.zone-group__header:focus-visible .zone-group__header-label {
  box-shadow: 0 0 0 2px var(--color-iridescent-1);
}

.zone-group__header--static {
  cursor: default;
}

/* Horizontal gradient line */
.zone-group__header-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.2) 20%,   /* Früher sichtbar, stärker */
    rgba(255, 255, 255, 0.2) 80%,   /* Längeres Plateau */
    transparent 100%
  );
}

/* Pill-shaped label */
.zone-group__header-label {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 1rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 9999px;
  font-size: 0.875rem;           /* 14px statt 12px */
  font-weight: 600;               /* Fetter */
  text-transform: none;           /* Kein UPPERCASE mehr */
  letter-spacing: 0.01em;         /* Weniger Spacing */
  color: var(--color-text-secondary);  /* Heller */
  white-space: nowrap;
  transition: all 0.2s ease;
}

.zone-group__header:hover .zone-group__header-label {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
}

/* Icon inside label */
.zone-group__header-icon {
  width: 1rem;
  height: 1rem;
  opacity: 0.85;
}

/* Zone name text */
.zone-group__header-text {
  color: var(--color-text-secondary);
}

/* Device count */
.zone-group__header-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  opacity: 0.7;
}

/* Unassigned zone: Warning styling for label */
.zone-group--unassigned .zone-group__header-label {
  background: rgba(251, 191, 36, 0.1);
  border-color: rgba(251, 191, 36, 0.2);
  color: var(--color-warning);
}

.zone-group--unassigned .zone-group__header-icon {
  opacity: 1;
}

.zone-group--unassigned .zone-group__header-text {
  color: var(--color-warning);
}

/* Drag-over state for header label */
.zone-group--drag-over .zone-group__header-label {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.3);
}

/* Chevron */
.zone-group__chevron {
  width: 1rem;
  height: 1rem;
  color: var(--color-text-muted);
  opacity: 0.5;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.zone-group__header:hover .zone-group__chevron {
  opacity: 0.8;
}

.zone-group__chevron--expanded {
  transform: rotate(180deg);
}

/* =============================================================================
   Content & Grid - No wrapping box
   ============================================================================= */

.zone-group__content {
  padding: 0;
  overflow: visible;  /* Erlaubt Overlays */
}

.zone-group__grid {
  display: grid;
  /* min() verhindert Overflow bei schmalen Containern */
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 1rem;
  overflow: visible;  /* Erlaubt Overlays von Child-Elementen */
}

/* Responsive grid */
@media (min-width: 1280px) {
  .zone-group__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  }
}

@media (min-width: 1600px) {
  .zone-group__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  }
}

/* Compact mode for dashboard - TIGHT layout */
.zone-group__grid--compact {
  /* Smaller min-width for more cards per row */
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  gap: 0.75rem;
}

@media (min-width: 1440px) {
  .zone-group__grid--compact {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
    gap: 1rem;
  }
}

@media (min-width: 1920px) {
  .zone-group__grid--compact {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 480px), 1fr));
    gap: 1rem;
  }
}

/* Mobile: min() sorgt bereits für 1 Spalte wenn nötig */
/* Diese Regel nur für garantiert 1 Spalte auf sehr kleinen Screens */
@media (max-width: 480px) {
  .zone-group__grid,
  .zone-group__grid--compact {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}

/* Empty Grid (min-height for drop targets) */
.zone-group__grid--empty {
  min-height: 100px;
  display: flex;
  align-items: stretch;
}

/* =============================================================================
   Empty State
   ============================================================================= */

.zone-group__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  text-align: center;
  background: var(--glass-bg);
  border: 1px dashed var(--glass-border);
  border-radius: 0.5rem;
}

/* Drop target styling - spans full width inside VueDraggable */
.zone-group__empty--drop-target {
  flex: 1;
  width: 100%;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* Highlight on drag-over */
.zone-group--drag-over .zone-group__empty--drop-target {
  border-color: var(--color-iridescent-1);
  background: rgba(96, 165, 250, 0.05);
}

.zone-group__empty-icon {
  width: 2rem;
  height: 2rem;
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
  opacity: 0.4;
}

.zone-group__empty-text {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin: 0;
}

.zone-group__empty-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0.375rem 0 0 0;
  opacity: 0.7;
}

/* =============================================================================
   Transitions
   ============================================================================= */

.zone-content-enter-active {
  transition: all 0.2s ease-out;
}

.zone-content-leave-active {
  transition: all 0.15s ease-in;
}

.zone-content-enter-from,
.zone-content-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* =============================================================================
   Grid Item & Drag/Drop
   ============================================================================= */

.zone-group__item {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  /* Position relative für z-index Stacking */
  position: relative;
  z-index: 1;
  /* WICHTIG: Kein contain:layout mehr - das blockiert absolute Positionierung
     von Child-Elementen wie AnalysisDropZone Overlay */
  overflow: visible;  /* Erlaubt Overlays die über das Item hinausgehen */
}

.zone-item--ghost {
  opacity: 0.4;
}

.zone-item--ghost > * {
  border-style: dashed !important;
}

.zone-item--chosen {
  transform: scale(1.02);
}

.zone-item--chosen > * {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3) !important;
}

.zone-item--drag {
  transform: scale(1.03);
  z-index: 9999;  /* Höher als alles andere während des Ziehens */
  pointer-events: none;  /* Verhindert Selbst-Drop */
}

.zone-item--drag > * {
  box-shadow: 0 12px 32px rgba(96, 165, 250, 0.3) !important;
}

/* Grab cursor for draggable items */
:deep(.esp-card),
:deep(.esp-orbital-grid__item) {
  cursor: grab;
}

:deep(.esp-card):active,
:deep(.esp-orbital-grid__item):active {
  cursor: grabbing;
}
</style>
