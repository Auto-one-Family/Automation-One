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
  MapPin,
  Layers,
  AlertCircle
} from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
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
function handleDragChange(event: any) {
  // Handle add event - device dropped into this zone
  if (event.added) {
    const device = event.added.element as ESPDevice
    const fromZoneId = device.zone_id || null

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
  <div
    :class="containerClasses"
    @dragenter="handleContainerDragEnter"
    @dragleave="handleContainerDragLeave"
    @dragover.prevent
    @drop="handleContainerDrop"
  >
    <!-- Zone Header -->
    <div
      :class="headerClasses"
      role="button"
      :tabindex="collapsible ? 0 : -1"
      :aria-expanded="isExpanded"
      @click="toggleExpanded"
      @keydown.enter="toggleExpanded"
      @keydown.space.prevent="toggleExpanded"
    >
      <!-- Left side: Icon + Zone name -->
      <div class="zone-group__header-left">
        <div class="zone-group__icon">
          <AlertCircle v-if="isUnassigned" class="w-5 h-5" />
          <MapPin v-else class="w-5 h-5" />
        </div>

        <div class="zone-group__title-group">
          <h3 class="zone-group__title">{{ zoneName }}</h3>
          <span v-if="zoneId && !isUnassigned" class="zone-group__id">
            {{ zoneId }}
          </span>
        </div>
      </div>

      <!-- Right side: Device count + Collapse indicator -->
      <div class="zone-group__header-right">
        <Badge
          :variant="isUnassigned ? 'warning' : 'info'"
          size="sm"
        >
          {{ deviceCount }} {{ deviceCount === 1 ? 'Gerät' : 'Geräte' }}
        </Badge>

        <ChevronDown
          v-if="collapsible"
          class="zone-group__chevron"
          :class="{ 'zone-group__chevron--expanded': isExpanded }"
        />
      </div>
    </div>

    <!-- Zone Content (devices) -->
    <Transition name="zone-content">
      <div v-show="isExpanded" class="zone-group__content">
        <!-- Draggable wrapper -->
        <VueDraggable
          v-if="enableDragDrop"
          v-model="localDevices"
          class="zone-group__grid"
          :class="{ 'zone-group__grid--compact': compactMode }"
          group="esp-devices"
          :animation="200"
          ghost-class="zone-item--ghost"
          chosen-class="zone-item--chosen"
          drag-class="zone-item--drag"
          @change="handleDragChange"
          @start="handleDragStart"
          @end="handleDragEnd"
        >
          <!-- Use slot for custom device rendering, or default to ESPCard -->
          <div
            v-for="device in localDevices"
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
        </div>

        <!-- Empty state -->
        <div v-if="devices.length === 0" class="zone-group__empty">
          <Layers class="zone-group__empty-icon" />
          <p class="zone-group__empty-text">
            {{ isUnassigned
              ? 'Alle Geräte sind Zonen zugewiesen'
              : 'Keine Geräte in dieser Zone'
            }}
          </p>
          <p v-if="enableDragDrop && !isUnassigned" class="zone-group__empty-hint">
            Geräte hierher ziehen um sie zuzuweisen
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.zone-group {
  position: relative;
  margin-bottom: 1.5rem;
  border-radius: 0.75rem;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.zone-group:hover {
  border-color: rgba(255, 255, 255, 0.12);
}

.zone-group--drag-over {
  border-color: var(--color-iridescent-1);
  box-shadow:
    0 0 0 1px var(--color-iridescent-1),
    0 0 20px rgba(96, 165, 250, 0.2),
    0 0 40px rgba(96, 165, 250, 0.1);
  transform: scale(1.01);
  transition: all 0.2s ease-out;
}

/* Pulsing iridescent border effect */
.zone-group--drag-over::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    90deg,
    var(--color-iridescent-1),
    var(--color-iridescent-2),
    var(--color-iridescent-3),
    var(--color-iridescent-1)
  );
  background-size: 300% 100%;
  animation: drag-pulse 1.5s ease-in-out infinite;
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

@keyframes drag-pulse {
  0%, 100% {
    background-position: 0% 50%;
    opacity: 0.8;
  }
  50% {
    background-position: 100% 50%;
    opacity: 1;
  }
}

/* Darken content slightly during drag-over */
.zone-group--drag-over .zone-group__content {
  background-color: rgba(96, 165, 250, 0.03);
  transition: background-color 0.2s ease;
}

.zone-group--unassigned {
  border-color: rgba(251, 191, 36, 0.2);
}

.zone-group--unassigned:hover {
  border-color: rgba(251, 191, 36, 0.3);
}

/* Header */
.zone-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.05) 0%,
    rgba(167, 139, 250, 0.05) 100%
  );
  border-bottom: 1px solid var(--glass-border);
  cursor: pointer;
  user-select: none;
  transition: all 0.3s ease;
}

.zone-group__header:hover {
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.1) 0%,
    rgba(167, 139, 250, 0.1) 100%
  );
}

.zone-group__header:focus-visible {
  outline: 2px solid var(--color-iridescent-1);
  outline-offset: -2px;
}

.zone-group__header--static {
  cursor: default;
}

.zone-group__header--drag-over {
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.15) 0%,
    rgba(167, 139, 250, 0.15) 100%
  );
  border-color: var(--color-iridescent-1);
}

.zone-group__header--unassigned {
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.05) 0%,
    rgba(251, 191, 36, 0.08) 100%
  );
}

.zone-group__header--unassigned:hover {
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.1) 0%,
    rgba(251, 191, 36, 0.12) 100%
  );
}

.zone-group__header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.zone-group__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background-color: rgba(96, 165, 250, 0.1);
  color: var(--color-iridescent-1);
}

.zone-group--unassigned .zone-group__icon {
  background-color: rgba(251, 191, 36, 0.1);
  color: var(--color-warning);
}

.zone-group__title-group {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.zone-group__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.zone-group__id {
  font-size: 0.6875rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
}

.zone-group__header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.zone-group__chevron {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-text-muted);
  transition: transform 0.3s ease;
}

.zone-group__chevron--expanded {
  transform: rotate(180deg);
}

/* Content */
.zone-group__content {
  padding: 1.25rem;
}

.zone-group__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
  transition: max-width 0.3s ease, gap 0.3s ease;
}

/* Adaptive sizing based on device count */
/* Single device - compact */
.zone-group:has(.zone-group__grid > :only-child) .zone-group__grid {
  max-width: 400px;
}

/* 2 devices */
.zone-group:has(.zone-group__grid > :nth-child(2):last-child) .zone-group__grid {
  max-width: 50%;
}

/* 3-5 devices - 75% width */
.zone-group:has(.zone-group__grid > :nth-child(3)):not(:has(.zone-group__grid > :nth-child(6))) .zone-group__grid {
  max-width: 75%;
}

/* 6+ devices - full width (default, no max-width needed) */

/* Empty zone - minimal padding */
.zone-group:has(.zone-group__empty) .zone-group__content {
  padding: 0;
}

/* Larger cards on bigger screens */
@media (min-width: 1280px) {
  .zone-group__grid {
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  }
}

@media (min-width: 1600px) {
  .zone-group__grid {
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  }
}

/* Compact mode for dashboard - larger cards */
.zone-group__grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
  gap: 2rem;
}

@media (min-width: 1440px) {
  .zone-group__grid--compact {
    grid-template-columns: repeat(auto-fill, minmax(600px, 1fr));
  }
}

@media (min-width: 1920px) {
  .zone-group__grid--compact {
    grid-template-columns: repeat(auto-fill, minmax(700px, 1fr));
  }
}

@media (max-width: 768px) {
  .zone-group__grid,
  .zone-group__grid--compact {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}

/* Empty state */
.zone-group__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
}

.zone-group__empty-icon {
  width: 3rem;
  height: 3rem;
  color: var(--color-text-muted);
  margin-bottom: 1rem;
  opacity: 0.5;
}

.zone-group__empty-text {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.zone-group__empty-hint {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin: 0.5rem 0 0 0;
}

/* Transition for content expand/collapse */
.zone-content-enter-active {
  transition: all 0.3s ease-out;
}

.zone-content-leave-active {
  transition: all 0.2s ease-in;
}

.zone-content-enter-from,
.zone-content-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Grid item wrapper */
.zone-group__item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Drag & Drop styles for zone items */
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
  transform: scale(1.05);
  z-index: 1000;
}

.zone-item--drag > * {
  box-shadow: 0 12px 32px rgba(96, 165, 250, 0.3) !important;
}

/* Deep styles for ESPCard and orbital layout */
:deep(.esp-card),
:deep(.esp-orbital-grid__item) {
  cursor: grab;
}

:deep(.esp-card):active,
:deep(.esp-orbital-grid__item):active {
  cursor: grabbing;
}
</style>
