<script setup lang="ts">
/**
 * UnassignedDropBar Component
 *
 * Fixed bottom bar for unassigned ESP devices:
 * - Minimized by default, shows count badge
 * - Expands on hover or drag-over
 * - Accepts dropped devices to unassign them from zones
 * - Shows list of unassigned devices (new ESPs/Mocks)
 */

import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { VueDraggable } from 'vue-draggable-plus'
import {
  Inbox,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  ExternalLink,
  Loader2
} from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { useZoneDragDrop } from '@/composables/useZoneDragDrop'
import { useEspStore } from '@/stores/esp'
import { espApi, type ESPDevice } from '@/api/esp'

const espStore = useEspStore()
const { handleRemoveFromZone, isProcessing, processingDeviceId } = useZoneDragDrop()

// State
const isExpanded = ref(false)
const isDragOver = ref(false)
const dragOverCount = ref(0)
const localDevices = ref<ESPDevice[]>([])

// Unassigned devices from store
const unassignedDevices = computed(() => {
  return espStore.devices.filter(device => !device.zone_id)
})

// Sync local devices with store
watch(unassignedDevices, (newDevices) => {
  localDevices.value = [...newDevices]
}, { immediate: true, deep: true })

// Device count
const deviceCount = computed(() => unassignedDevices.value.length)

// Check if device is mock
function isMock(device: ESPDevice): boolean {
  const deviceId = device.device_id || device.esp_id || ''
  return espApi.isMockEsp(deviceId)
}

// Get device ID
function getDeviceId(device: ESPDevice): string {
  return device.device_id || device.esp_id || ''
}

// Toggle expanded state
function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

// Drag & Drop handlers
function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value++
  isDragOver.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value--
  if (dragOverCount.value <= 0) {
    dragOverCount.value = 0
    isDragOver.value = false
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value = 0
  isDragOver.value = false
}

// Handle device added via VueDraggable
// BUG-001 fix: handleRemoveFromZone() already calls fetchAll() internally
// BUG-002 fix: Use event.added.element instead of localDevices[newIndex]
// because localDevices is mutated by VueDraggable before @add fires
async function handleDragAdd(event: any) {
  // VueDraggable provides the added element directly in event.added
  const device = event?.added?.element as ESPDevice | undefined
  if (!device) {
    console.warn('[UnassignedDropBar] handleDragAdd: No device in event.added.element')
    return
  }

  const deviceId = getDeviceId(device)
  if (!deviceId) {
    console.warn('[UnassignedDropBar] handleDragAdd: Device has no ID')
    return
  }

  // Only unassign if device has a zone (was dragged FROM a zone)
  if (device.zone_id) {
    console.debug(`[UnassignedDropBar] Unassigning device ${deviceId} from zone ${device.zone_id}`)
    await handleRemoveFromZone(device)
    // NOTE: handleRemoveFromZone() already calls espStore.fetchAll() internally
  }
}

// Navigate to device detail - close bar first for better UX
function goToDevice() {
  isExpanded.value = false
}
</script>

<template>
  <div
    :class="[
      'unassigned-bar',
      {
        'unassigned-bar--expanded': isExpanded,
        'unassigned-bar--drag-over': isDragOver,
        'unassigned-bar--has-devices': deviceCount > 0
      }
    ]"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <!-- Collapsed Header (Always Visible) -->
    <button
      class="unassigned-bar__header"
      @click="toggleExpanded"
    >
      <div class="unassigned-bar__header-left">
        <div class="unassigned-bar__icon-wrapper">
          <Inbox class="unassigned-bar__icon" />
          <span v-if="deviceCount > 0" class="unassigned-bar__badge">
            {{ deviceCount }}
          </span>
        </div>
        <span class="unassigned-bar__title">
          {{ isDragOver ? 'Hier ablegen zum Entfernen aus Zone' : 'Nicht zugewiesen' }}
        </span>
      </div>

      <div class="unassigned-bar__header-right">
        <span v-if="deviceCount > 0 && !isExpanded" class="unassigned-bar__hint">
          {{ deviceCount }} Gerät{{ deviceCount !== 1 ? 'e' : '' }}
        </span>
        <component
          :is="isExpanded ? ChevronDown : ChevronUp"
          class="unassigned-bar__chevron"
        />
      </div>
    </button>

    <!-- Expanded Content -->
    <Transition name="slide">
      <div v-if="isExpanded || isDragOver" class="unassigned-bar__content">
        <!-- VueDraggable for drop target -->
        <!-- Use @change instead of @add for consistent event format (like ZoneGroup.vue) -->
        <VueDraggable
          v-model="localDevices"
          class="unassigned-bar__grid"
          :class="{ 'unassigned-bar__grid--empty': deviceCount === 0 }"
          group="esp-devices"
          :animation="200"
          ghost-class="unassigned-item--ghost"
          @change="handleDragAdd"
        >
          <!-- Device Cards (Mini) -->
          <div
            v-for="device in localDevices"
            :key="getDeviceId(device)"
            class="unassigned-bar__device"
          >
            <div class="unassigned-bar__device-info">
              <Badge :variant="isMock(device) ? 'mock' : 'real'" size="xs">
                {{ isMock(device) ? 'M' : 'R' }}
              </Badge>
              <span class="unassigned-bar__device-name">
                {{ device.name || getDeviceId(device) }}
              </span>
              <Loader2
                v-if="isProcessing && processingDeviceId === getDeviceId(device)"
                class="w-3 h-3 animate-spin text-iridescent-1"
              />
            </div>
            <RouterLink
              :to="`/?openSettings=${getDeviceId(device)}`"
              class="unassigned-bar__device-link"
              @click="goToDevice()"
            >
              <ExternalLink class="w-3 h-3" />
            </RouterLink>
          </div>

          <!-- Empty State (inside VueDraggable for drop detection) -->
          <div v-if="deviceCount === 0" class="unassigned-bar__empty">
            <AlertTriangle class="w-4 h-4" />
            <span>Geräte hierher ziehen zum Entfernen aus Zone</span>
          </div>
        </VueDraggable>
      </div>
    </Transition>

    <!-- Drag Over Indicator (pulsing border) -->
    <div v-if="isDragOver" class="unassigned-bar__drop-indicator" />
  </div>
</template>

<style scoped>
.unassigned-bar {
  position: fixed;
  bottom: 0;
  left: var(--sidebar-width, 240px);
  right: 0;
  z-index: 100;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--glass-border);
  transition: all 0.2s ease;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
}

/* Expanded state */
.unassigned-bar--expanded {
  border-top-color: var(--color-iridescent-1);
}

/* Drag over state */
.unassigned-bar--drag-over {
  border-top-color: var(--color-warning);
  background: rgba(251, 191, 36, 0.05);
  box-shadow: 0 -4px 24px rgba(251, 191, 36, 0.2);
}

/* Has devices indicator */
.unassigned-bar--has-devices .unassigned-bar__icon-wrapper {
  color: var(--color-warning);
}

/* Header */
.unassigned-bar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.625rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s;
}

.unassigned-bar__header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.unassigned-bar__header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.unassigned-bar__icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition: color 0.15s;
}

.unassigned-bar__icon {
  width: 1.25rem;
  height: 1.25rem;
}

/* Badge (count) */
.unassigned-bar__badge {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--color-warning);
  color: var(--color-bg-primary);
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.unassigned-bar__title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.unassigned-bar--drag-over .unassigned-bar__title {
  color: var(--color-warning);
  font-weight: 600;
}

.unassigned-bar__header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.unassigned-bar__hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.unassigned-bar__chevron {
  width: 1rem;
  height: 1rem;
  color: var(--color-text-muted);
  transition: transform 0.2s;
}

/* Content */
.unassigned-bar__content {
  padding: 0.5rem 1rem 0.75rem;
  border-top: 1px solid var(--glass-border);
  max-height: 200px;
  overflow-y: auto;
}

.unassigned-bar__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-height: 40px;
}

.unassigned-bar__grid--empty {
  justify-content: center;
  align-items: center;
}

/* Device card (mini) */
.unassigned-bar__device {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  cursor: grab;
  transition: all 0.15s;
}

.unassigned-bar__device:hover {
  border-color: var(--color-iridescent-1);
  background: rgba(167, 139, 250, 0.05);
}

.unassigned-bar__device:active {
  cursor: grabbing;
}

.unassigned-bar__device-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.unassigned-bar__device-name {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unassigned-bar__device-link {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  color: var(--color-text-muted);
  border-radius: 0.25rem;
  transition: all 0.15s;
}

.unassigned-bar__device-link:hover {
  color: var(--color-iridescent-1);
  background: rgba(167, 139, 250, 0.1);
}

/* Empty state */
.unassigned-bar__empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  width: 100%;
  justify-content: center;
}

.unassigned-bar--drag-over .unassigned-bar__empty {
  color: var(--color-warning);
}

/* Drop indicator (pulsing border) */
.unassigned-bar__drop-indicator {
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--color-warning),
    var(--color-iridescent-2),
    var(--color-warning)
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Slide transition */
.slide-enter-active {
  transition: all 0.2s ease-out;
}

.slide-leave-active {
  transition: all 0.15s ease-in;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* Ghost/Drag classes */
.unassigned-item--ghost {
  opacity: 0.4;
}

/* Responsive: Account for sidebar */
@media (max-width: 768px) {
  .unassigned-bar {
    left: 0;
  }
}
</style>
