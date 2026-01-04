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
import { useDragStateStore } from '@/stores/dragState'

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

// Drag state store (global ESP-Card drag tracking)
const dragStore = useDragStateStore()

// Local state
const isExpanded = ref(props.defaultExpanded)
const isDragOver = ref(false)
const dragOverCount = ref(0)  // Track nested drag events
const localDevices = ref<ESPDevice[]>([...props.devices])
const dragStarted = ref(false)  // Tracks if @start has fired (for proper cleanup in @unchoose)

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

// Debug logger with consistent styling
function log(message: string, data?: Record<string, unknown>): void {
  const style = 'background: #ec4899; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
  const label = `ZoneGroup:${props.zoneId}`
  if (data) {
    console.log(`%c[${label}]%c ${message}`, style, 'color: #f472b6;', data)
  } else {
    console.log(`%c[${label}]%c ${message}`, style, 'color: #f472b6;')
  }
}

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
  log('VueDraggable @change', {
    hasAdded: !!event.added,
    hasMoved: !!event.moved,
    hasRemoved: !!event.removed,
    event,
  })

  // Note: @change mit added/moved/removed funktioniert nur bei manchen vue-draggable-plus Versionen
  // Wir verwenden stattdessen @add für das Hinzufügen

  // Handle moved event - reorder within zone (falls hier getriggert)
  if (event.moved) {
    log('Device MOVED within zone', { oldIndex: event.moved.oldIndex, newIndex: event.moved.newIndex })
    emit('devices-reordered', localDevices.value)
  }
}

function handleDragAdd(event: any) {
  // SortableJS @add Event Format:
  // - event.item: DOM-Element das hinzugefügt wurde
  // - event.item.dataset: data-* Attribute (deviceId)
  // - event.from: Container von dem es kam
  // - event.oldIndex, event.newIndex: Positionen

  const deviceId = event?.item?.dataset?.deviceId
  log('VueDraggable @add 📥', {
    deviceId,
    oldIndex: event?.oldIndex,
    newIndex: event?.newIndex,
    fromClass: event?.from?.className?.slice?.(0, 50),
    toClass: event?.to?.className?.slice?.(0, 50),
  })

  if (!deviceId) {
    log('ERROR: No deviceId found in item dataset')
    return
  }

  // Finde das Device in localDevices (wurde bereits von VueDraggable hinzugefügt)
  const device = localDevices.value.find(d =>
    (d.device_id || d.esp_id) === deviceId
  )

  if (!device) {
    log('ERROR: Device not found in localDevices', { deviceId, localDevices: localDevices.value.map(d => d.device_id || d.esp_id) })
    return
  }

  const fromZoneId = device.zone_id || null

  log('Device ADDED to zone ✅', {
    deviceId,
    fromZoneId,
    toZoneId: props.zoneId,
    deviceName: device.name,
  })

  // Emit event für Parent-Komponente um API-Call auszuführen
  emit('device-dropped', {
    device,
    fromZoneId,
    toZoneId: props.zoneId
  })
}

function handleDragUpdate(_event: any) {
  log('VueDraggable @update (legacy)', { event: _event })
  // Kept for compatibility but @change handles this better
}

function handleDragStart(event: any) {
  log('VueDraggable @start 🚀', {
    item: event?.item?.dataset,
    itemClass: event?.item?.className?.slice?.(0, 80),
    from: event?.from?.className?.slice?.(0, 50),
    originalEvent: event?.originalEvent?.type,
    // SortableJS interne Flags
    dragged: !!event?.item,
    clone: !!event?.clone,
  })

  // Flag setzen damit @unchoose weiß dass der Drag gestartet wurde
  dragStarted.value = true

  // State wurde bereits in @choose gesetzt, hier nur sicherstellen
  if (!dragStore.isDraggingEspCard) {
    dragStore.startEspCardDrag()
  }
}

function handleDragEnd(event: any) {
  log('VueDraggable @end 🏁', {
    item: event?.item?.dataset,
    itemClass: event?.item?.className?.slice?.(0, 80),
    to: event?.to?.className?.slice?.(0, 50),
    from: event?.from?.className?.slice?.(0, 50),
    oldIndex: event?.oldIndex,
    newIndex: event?.newIndex,
    pullMode: event?.pullMode,
    originalEvent: event?.originalEvent?.type,
  })
  isDragOver.value = false

  // Reset flag
  dragStarted.value = false

  // KRITISCH: Globalen ESP-Card-Drag-State beenden
  dragStore.endEspCardDrag()
}

// VueDraggable @choose event - fired when item is selected (before drag starts)
function handleDragChoose(event: any) {
  log('VueDraggable @choose 👆 (item selected)', {
    item: event?.item?.dataset,
    itemClass: event?.item?.className?.slice?.(0, 80),
    oldIndex: event?.oldIndex,
  })

  // Reset flag
  dragStarted.value = false

  // KRITISCH: ESP-Card-Drag-State SOFORT setzen (nicht erst bei @start!)
  // Dadurch wird SensorSatellite's draggable deaktiviert BEVOR der Drag startet
  // und verhindert dass Sensor-Elemente den Drag "stehlen"
  dragStore.startEspCardDrag()
}

// VueDraggable @unchoose event - fired when item is deselected
function handleDragUnchoose(event: any) {
  log('VueDraggable @unchoose 👋 (item deselected)', {
    item: event?.item?.dataset,
    dragStarted: dragStarted.value,
  })

  // Wenn @start nie gefeuert hat, wurde der Drag abgebrochen (z.B. kurzer Klick)
  // In diesem Fall müssen wir den State hier beenden
  if (!dragStarted.value) {
    log('Drag was aborted (no @start), cleaning up state')
    dragStore.endEspCardDrag()
  }
  // Sonst: @end wird den State beenden
}

/**
 * Handles native HTML5 dragstart events on the item wrapper.
 *
 * KRITISCH: VueDraggable mit force-fallback verwendet Mouse Events, nicht native Drag Events.
 * Aber Child-Elemente (SensorSatellite, ActuatorSatellite) haben draggable="true" für Chart-Drag.
 * Diese können native dragstart Events auslösen die hochbubblen.
 *
 * Diese Funktion:
 * 1. Lässt Satellite-Drags durch (für Chart-Funktionalität)
 * 2. Blockiert alle anderen native Drags (verhindert Interferenz mit VueDraggable)
 */
function handleNativeDragStart(event: DragEvent) {
  const target = event.target as HTMLElement

  // Prüfe ob das Event von einem Satellite-Element kommt (für Chart-Drag)
  const isSatelliteDrag = target.closest('[data-satellite-type]')

  if (isSatelliteDrag) {
    // Satellite-Drag für Chart - durchlassen
    log('Native dragstart from satellite - allowing for chart drag', {
      satelliteType: (target.closest('[data-satellite-type]') as HTMLElement)?.dataset?.satelliteType,
    })
    return
  }

  // Alle anderen native Drags blockieren - VueDraggable handhabt ESP-Card-Drag via Mouse Events
  log('Native dragstart BLOCKED - VueDraggable uses mouse events (force-fallback)', {
    target: target.tagName,
    targetClass: target.className?.toString()?.slice(0, 50),
  })
  event.preventDefault()
  event.stopPropagation()
}

// Container-level drag handlers for full zone drag-over effect
function handleContainerDragEnter(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value++
  isDragOver.value = true
  log('Container dragenter', { dragOverCount: dragOverCount.value })
}

function handleContainerDragLeave(event: DragEvent) {
  event.preventDefault()
  dragOverCount.value--
  if (dragOverCount.value <= 0) {
    dragOverCount.value = 0
    isDragOver.value = false
  }
  log('Container dragleave', { dragOverCount: dragOverCount.value })
}

function handleContainerDrop(event: DragEvent) {
  log('Container drop', { types: event.dataTransfer?.types })
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
        <!--
          VueDraggable Configuration:
          - group="esp-devices": Enables cross-zone drag & drop
          - animation="0": Disabled for performance (fallback mode has its own animation)
          - handle: Only the ESP card header (.esp-drag-handle) can trigger drag
          - filter: Backup exclusion for elements that should never trigger drag
          - force-fallback: KRITISCH! Zwingt SortableJS, Mouse Events statt native HTML5 Drag API zu verwenden.
            Ohne force-fallback können native drag events von Satellit-Elementen (draggable="true" für Chart)
            den VueDraggable-Drag unterbrechen, weil @choose feuert aber dann ein natives dragend Event
            den internen State korrumpiert bevor @start feuern kann.
          - fallback-on-body: Clone wird auf <body> appendiert für besseres z-index handling
          - fallback-class: Custom class for the fallback drag clone (siehe :global() CSS)
        -->
        <VueDraggable
          v-if="enableDragDrop"
          v-model="localDevices"
          class="zone-group__grid"
          :class="{
            'zone-group__grid--compact': compactMode,
            'zone-group__grid--empty': devices.length === 0
          }"
          group="esp-devices"
          :animation="0"
          ghost-class="zone-item--ghost"
          chosen-class="zone-item--chosen"
          drag-class="zone-item--drag"
          handle=".esp-drag-handle"
          :filter="'button, a, input, select, [data-no-drag]'"
          :prevent-on-filter="false"
          :force-fallback="true"
          :fallback-on-body="true"
          fallback-class="zone-item--fallback"
          :delay="0"
          :touch-start-threshold="5"
          @add="handleDragAdd"
          @update="handleDragUpdate"
          @change="handleDragChange"
          @start="handleDragStart"
          @end="handleDragEnd"
          @choose="handleDragChoose"
          @unchoose="handleDragUnchoose"
        >
          <!--
            Device cards wrapper - VueDraggable manages drag via mouse events (force-fallback).
            The @dragstart.capture prevents any NATIVE drag events from propagating.
            This is necessary because:
            1. Child elements (SensorSatellite, ActuatorSatellite) have draggable="true" for chart drag
            2. Without this, a native dragstart could bubble up and interfere with VueDraggable
            3. We only allow dragstart to proceed if it originates from a satellite element
          -->
          <div
            v-for="device in localDevices"
            :key="getDeviceId(device)"
            class="zone-group__item"
            :data-device-id="getDeviceId(device)"
            @dragstart.capture="handleNativeDragStart"
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
  /* FLEXBOX statt GRID: Items behalten ihre natürliche Größe */
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
  overflow: visible;  /* Erlaubt Overlays von Child-Elementen */
}

/* Compact mode for dashboard - gleiche Flex-Basis */
.zone-group__grid--compact {
  gap: 0.75rem;
}

@media (min-width: 1440px) {
  .zone-group__grid--compact {
    gap: 1rem;
  }
}

/* Mobile: Flex-Items bekommen volle Breite */
@media (max-width: 480px) {
  .zone-group__grid,
  .zone-group__grid--compact {
    flex-direction: column;
    gap: 0.75rem;
  }

  .zone-group__item {
    width: 100%;
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
  /* PERFORMANCE: Nur transform/opacity für GPU-Beschleunigung */
  transition: transform 0.15s ease-out, opacity 0.15s ease-out;
  /* Position relative für z-index Stacking */
  position: relative;
  z-index: 1;
  /* WICHTIG: Kein contain:layout mehr - das blockiert absolute Positionierung
     von Child-Elementen wie AnalysisDropZone Overlay */
  overflow: visible;  /* Erlaubt Overlays die über das Item hinausgehen */
  /* KRITISCH: Verhindere Text-Selection (blaues Highlight) während Drag */
  user-select: none !important;
  -webkit-user-select: none !important;
  /* Bessere Touch-Unterstützung */
  touch-action: manipulation;
  /* GPU-Hint für bessere Performance */
  will-change: transform, opacity;
}

/* Verhindere Text-Selektion auf ALLEN Kind-Elementen während eines Drags */
.zone-group__item * {
  user-select: none !important;
  -webkit-user-select: none !important;
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

/*
 * Fallback mode styling (when force-fallback is enabled)
 * SortableJS creates a clone of the dragged element with this class
 * NOTE: Using :global() because fallback-on-body appends to <body>
 *
 * Problem: Grid macht Items 380px+ breit, Clone erbt diese Breite.
 * Lösung: width: fit-content auf Clone UND seine Kinder.
 */
:global(.zone-item--fallback) {
  transform: scale(1.02);
  z-index: 9999;
  pointer-events: none;
  opacity: 0.85;
  will-change: transform;
  transition: none !important;
  /* KRITISCH: Clone soll sich an Inhalt anpassen, nicht Grid-Breite erben */
  width: fit-content !important;
}

:global(.zone-item--fallback) > * {
  box-shadow: 0 8px 24px rgba(96, 165, 250, 0.35) !important;
  border: 2px solid var(--color-iridescent-1) !important;
  transition: none !important;
  /* Auch Kinder sollen sich anpassen */
  width: fit-content !important;
}

/* Spezifisch für den Layout-Container im Fallback */
:global(.zone-item--fallback .esp-horizontal-layout) {
  width: fit-content !important;
}

/* =============================================================================
   Cursor Styling for Drag & Drop

   Principle: Show grab cursor only on the drag handle (.esp-drag-handle).
   The handle is the ESP card header area. Other areas have their own cursors.
   ============================================================================= */

/* Base: Item wrapper has default cursor (not draggable everywhere) */
.zone-group__item {
  cursor: default;
}

/* Only the drag handle shows grab cursor */
.zone-group__item :deep(.esp-drag-handle) {
  cursor: grab;
}

.zone-group__item :deep(.esp-drag-handle):active {
  cursor: grabbing;
}

/*
 * Other elements control their own cursor:
 * - SensorSatellite: cursor: grab (when draggable for chart)
 * - ActuatorSatellite: cursor: grab (when draggable for chart)
 * - AnalysisDropZone: cursor: default
 * - Buttons/Links: cursor: pointer
 */
</style>
