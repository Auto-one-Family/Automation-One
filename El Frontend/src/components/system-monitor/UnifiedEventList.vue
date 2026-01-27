<script setup lang="ts">
/**
 * UnifiedEventList - Event List Component
 *
 * Displays a list of unified events with virtual scrolling support
 * for performance when > 200 events.
 *
 * Features:
 * - Empty state display
 * - Category-colored event items (esp-status, sensors, actuators, system)
 * - Severity overlay (warning, error, critical)
 * - Event type icons with RSSI indicator for heartbeats
 * - Virtual scrolling for large lists
 * - Date separators (Heute, Gestern, specific dates)
 * - Restored event highlighting
 * - German human-readable messages
 *
 * KATEGORIE-FARBEN (linke Border + Icon):
 * - esp-status (Blau #3B82F6):    Heartbeat, Online/Offline, LWT
 * - sensors (Emerald #10B981):    Sensor-Messwerte
 * - actuators (Amber #F59E0B):    Aktor-Status, Commands, Alerts
 * - system (Violet #8B5CF6):      Config, Auth, Errors, Lifecycle
 *
 * SEVERITY (Hintergrund-Tint + rechtes Icon):
 * - info: Kein Tint, Info-Icon
 * - warning: Amber-Tint (3%), AlertTriangle-Icon
 * - error: Rot-Tint (4%), AlertCircle-Icon
 * - critical: Rot-Tint (6%) + Puls, AlertOctagon-Icon
 *
 * @emits select - When an event is clicked
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { UnifiedEvent } from '@/types/websocket-events'
import { getEventIcon } from '@/utils/eventTypeIcons'
import { getEventCategory, transformEventMessage } from '@/utils/eventTransformer'
import RssiIndicator from './RssiIndicator.vue'
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  Server,
  Calendar,
  RotateCcw,
} from 'lucide-vue-next'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  events: UnifiedEvent[]
  isPaused: boolean
  eventTypeLabels: Record<string, string>
  restoredEventIds?: Set<string>
}

const props = withDefaults(defineProps<Props>(), {
  restoredEventIds: () => new Set<string>(),
})

const emit = defineEmits<{
  select: [event: UnifiedEvent]
}>()

// ============================================================================
// Virtual Scrolling State
// ============================================================================

const VIRTUAL_SCROLL_THRESHOLD = 200
const ITEM_HEIGHT = 60 // Approximate height of each item in pixels
const BUFFER_SIZE = 10 // Extra items to render above/below viewport

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(0)

// ============================================================================
// Computed
// ============================================================================

const shouldUseVirtualScroll = computed(() => props.events.length > VIRTUAL_SCROLL_THRESHOLD)

const visibleRange = computed(() => {
  if (!shouldUseVirtualScroll.value) {
    return { start: 0, end: props.events.length }
  }

  // Verbesserter Fallback: Wenn containerHeight noch nicht gemessen ist,
  // rendere ALLE Events (bis zu einem Limit) um schwarzen Bereich zu vermeiden.
  // Dies ist sicherer als ein fester 600px Fallback, weil:
  // 1. Es garantiert, dass Events sichtbar sind
  // 2. Performance ist akzeptabel für 200-500 Events
  // 3. Sobald containerHeight gemessen ist, schaltet Virtual Scroll korrekt um
  if (containerHeight.value === 0) {
    // Fallback: Rendere bis zu 100 Events (mehr als genug für jeden Viewport)
    const fallbackCount = Math.min(props.events.length, 100)
    return { start: 0, end: fallbackCount }
  }

  const start = Math.max(0, Math.floor(scrollTop.value / ITEM_HEIGHT) - BUFFER_SIZE)
  const visibleCount = Math.ceil(containerHeight.value / ITEM_HEIGHT) + BUFFER_SIZE * 2
  const end = Math.min(props.events.length, start + visibleCount)

  return { start, end }
})

const visibleEvents = computed(() => {
  return props.events.slice(visibleRange.value.start, visibleRange.value.end)
})

// ============================================================================
// Virtual Scroll Date Tracking - Sticky header shows current date
// ============================================================================

/**
 * Track which events start a new date (for virtual scroll mode)
 * Returns a Set of event IDs that should show a date separator
 */
const dateSeparatorEventIds = computed<Set<string>>(() => {
  const separatorIds = new Set<string>()
  if (props.events.length === 0) return separatorIds

  let lastDateKey = ''
  for (const event of props.events) {
    const dateKey = getDateKey(event.timestamp)
    if (dateKey !== lastDateKey) {
      separatorIds.add(event.id)
      lastDateKey = dateKey
    }
  }
  return separatorIds
})

/**
 * Get the date label for a specific event (if it starts a new date)
 */
function getDateLabelForEvent(event: UnifiedEvent): string | null {
  if (!dateSeparatorEventIds.value.has(event.id)) return null
  return formatDateLabel(getDateKey(event.timestamp))
}

/**
 * Current date being viewed (for sticky header in virtual scroll)
 * Based on the first visible event
 */
const currentStickyDate = computed(() => {
  if (!shouldUseVirtualScroll.value) return null

  const firstVisibleEvent = visibleEvents.value[0]
  if (!firstVisibleEvent) return null

  return formatDateLabel(getDateKey(firstVisibleEvent.timestamp))
})

const totalHeight = computed(() => {
  if (!shouldUseVirtualScroll.value) return 'auto'
  return `${props.events.length * ITEM_HEIGHT}px`
})

const offsetTop = computed(() => {
  if (!shouldUseVirtualScroll.value) return 0
  return visibleRange.value.start * ITEM_HEIGHT
})

// ============================================================================
// Date Grouping - Group events by date for separators
// ============================================================================

interface DateGroup {
  date: string // YYYY-MM-DD
  label: string // Heute, Gestern, or formatted date
  events: UnifiedEvent[]
}

/**
 * Get date key from timestamp (YYYY-MM-DD)
 */
function getDateKey(timestamp: string): string {
  return new Date(timestamp).toISOString().split('T')[0]
}

/**
 * Format date label for display
 */
function formatDateLabel(dateKey: string): string {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  if (dateKey === today) return 'Heute'
  if (dateKey === yesterday) return 'Gestern'

  // Format as "22. Januar 2026"
  const date = new Date(dateKey)
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Group events by date (for non-virtual scrolling mode)
 */
const eventsByDate = computed<DateGroup[]>(() => {
  if (props.events.length === 0) return []

  const groupMap = new Map<string, UnifiedEvent[]>()

  // Events are already sorted by timestamp (newest first)
  for (const event of props.events) {
    const dateKey = getDateKey(event.timestamp)
    if (!groupMap.has(dateKey)) {
      groupMap.set(dateKey, [])
    }
    groupMap.get(dateKey)!.push(event)
  }

  // Convert to array with labels
  const groups: DateGroup[] = []
  for (const [date, events] of groupMap) {
    groups.push({
      date,
      label: formatDateLabel(date),
      events,
    })
  }

  return groups
})

/**
 * Check if an event is restored (for highlighting)
 */
function isRestoredEvent(event: UnifiedEvent): boolean {
  return props.restoredEventIds.has(event.id) ||
    (event.data && (event.data as Record<string, unknown>)._restored_from_backup !== undefined)
}

/**
 * Check if an event is a system lifecycle event (server start/stop)
 *
 * WICHTIG: event_type ist ein Top-Level-Feld im UnifiedEvent Interface,
 * nicht in event.data!
 */
function isSystemLifecycleEvent(event: UnifiedEvent): boolean {
  return event.event_type === 'service_start' || event.event_type === 'service_stop'
}

/**
 * Get lifecycle event type (start or stop)
 *
 * WICHTIG: event_type ist ein Top-Level-Feld im UnifiedEvent Interface,
 * nicht in event.data!
 */
function getLifecycleEventType(event: UnifiedEvent): 'start' | 'stop' | null {
  if (event.event_type === 'service_start') return 'start'
  if (event.event_type === 'service_stop') return 'stop'
  return null
}

// ============================================================================
// Methods
// ============================================================================

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical': return AlertOctagon
    case 'error': return AlertCircle
    case 'warning': return AlertTriangle
    default: return Info
  }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('de-DE')
}

function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
}

function handleSelect(event: UnifiedEvent) {
  emit('select', event)
}

/**
 * Get the event category for styling
 */
function getCategoryClass(event: UnifiedEvent): string {
  return getEventCategory(event)
}

/**
 * Get transformed message for display
 */
function getTransformedMessage(event: UnifiedEvent) {
  return transformEventMessage(event)
}

/**
 * Check if event is a heartbeat with RSSI data
 */
function hasRssiData(event: UnifiedEvent): boolean {
  if (event.event_type !== 'esp_health') return false
  const data = event.data as Record<string, unknown> | undefined
  return typeof data?.wifi_rssi === 'number'
}

/**
 * Get RSSI value from heartbeat event
 */
function getRssiValue(event: UnifiedEvent): number {
  const data = event.data as Record<string, unknown> | undefined
  return typeof data?.wifi_rssi === 'number' ? data.wifi_rssi : 0
}

// ============================================================================
// Lifecycle
// ============================================================================

/**
 * Misst die Container-Höhe für Virtual Scroll
 *
 * WICHTIG: Verwendet requestAnimationFrame statt nextTick, weil:
 * - nextTick garantiert nur Vue-Reaktivität, NICHT Flexbox-Layout-Completion
 * - Bei Initial-Load mit >200 Events ist das Flexbox-Layout oft noch nicht fertig
 * - requestAnimationFrame wird nach dem Browser-Paint aufgerufen
 *
 * Retry-Logik: Falls Höhe 0, versuche bis zu 5x mit steigender Verzögerung
 */
async function measureContainerHeight(retryCount = 0): Promise<void> {
  const MAX_RETRIES = 5
  const BASE_DELAY = 50 // ms

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      if (containerRef.value) {
        const height = containerRef.value.clientHeight

        if (height > 0) {
          containerHeight.value = height
          resolve()
        } else if (retryCount < MAX_RETRIES) {
          // Container hat noch keine Höhe - retry mit steigender Verzögerung
          const delay = BASE_DELAY * Math.pow(2, retryCount) // 50, 100, 200, 400, 800ms
          setTimeout(() => {
            measureContainerHeight(retryCount + 1).then(resolve)
          }, delay)
        } else {
          // Nach allen Retries immer noch 0 - verwende Viewport-Höhe als Fallback
          // Das ist besser als der hardcodierte 600px Fallback
          containerHeight.value = window.innerHeight * 0.6 // ~60% der Viewport-Höhe
          console.warn('[UnifiedEventList] Container height could not be measured, using viewport fallback')
          resolve()
        }
      } else {
        resolve()
      }
    })
  })
}

onMounted(async () => {
  // Initial-Messung mit requestAnimationFrame für korrektes Timing
  await measureContainerHeight()

  if (containerRef.value) {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Nur aktualisieren wenn die neue Höhe > 0 ist
        if (entry.contentRect.height > 0) {
          containerHeight.value = entry.contentRect.height
        }
      }
    })
    resizeObserver.observe(containerRef.value)

    // Store for cleanup
    ;(containerRef.value as any).__resizeObserver = resizeObserver
  }
})

// Wenn Virtual Scroll aktiviert wird (Events > 200), Container-Höhe neu messen
watch(shouldUseVirtualScroll, async (newValue) => {
  if (newValue) {
    await measureContainerHeight()
  }
})

// Bei signifikanter Änderung der Event-Anzahl neu messen
// Dies hilft beim Initial-Load wenn Events später geladen werden
watch(
  () => props.events.length,
  async (newLength, oldLength) => {
    // Nur bei großen Änderungen (mehr als 50 Events Unterschied) neu messen
    // um unnötige Re-Messungen bei WebSocket-Events zu vermeiden
    if (Math.abs(newLength - (oldLength || 0)) > 50) {
      await measureContainerHeight()
    }
  }
)

onUnmounted(() => {
  if (containerRef.value && (containerRef.value as any).__resizeObserver) {
    ;(containerRef.value as any).__resizeObserver.disconnect()
  }
})
</script>

<template>
  <div class="event-list-container">
    <!-- Empty State -->
    <div v-if="events.length === 0" class="monitor-empty">
      <Activity class="w-16 h-16 opacity-20" />
      <p class="monitor-empty__title">Keine Ereignisse</p>
      <p class="monitor-empty__subtitle">
        {{ isPaused ? 'Stream ist pausiert - klicke Play zum Fortsetzen' : 'Live-Events werden hier angezeigt' }}
      </p>
    </div>

    <!-- Event List -->
    <div
      v-else
      ref="containerRef"
      class="event-list"
      :class="{ 'event-list--virtual': shouldUseVirtualScroll }"
      @scroll="handleScroll"
    >
      <!-- Virtual Scroll Mode with Sticky Date Header -->
      <template v-if="shouldUseVirtualScroll">
        <!-- Sticky Date Header (always visible at top) -->
        <div v-if="currentStickyDate" class="date-separator date-separator--sticky">
          <div class="date-separator__line"></div>
          <div class="date-separator__label">
            <Calendar class="w-3.5 h-3.5" />
            <span>{{ currentStickyDate }}</span>
          </div>
          <div class="date-separator__line"></div>
        </div>

        <!-- Virtual Scroll Content -->
        <div
          class="event-list__spacer"
          :style="{ height: totalHeight }"
        >
          <div
            class="event-list__visible"
            :style="{ transform: `translateY(${offsetTop}px)` }"
          >
            <template v-for="event in visibleEvents" :key="event.id">
              <!-- Inline Date Separator (shows when date changes) -->
              <div
                v-if="getDateLabelForEvent(event) && getDateLabelForEvent(event) !== currentStickyDate"
                class="date-separator date-separator--inline"
              >
                <div class="date-separator__line"></div>
                <div class="date-separator__label">
                  <Calendar class="w-3.5 h-3.5" />
                  <span>{{ getDateLabelForEvent(event) }}</span>
                </div>
                <div class="date-separator__line"></div>
              </div>

              <!-- Event Item -->
              <div
                class="event-item"
                :class="[
                  `event-item--category-${getCategoryClass(event)}`,
                  `event-item--severity-${event.severity}`,
                ]"
                :data-category="getCategoryClass(event)"
                :data-severity="event.severity"
                @click="handleSelect(event)"
              >
                <div class="event-item__category-bar" />
                <div class="event-item__icon">
                  <component :is="getEventIcon(event.event_type)" class="w-4 h-4" />
                </div>
                <div class="event-item__time">
                  {{ formatTime(event.timestamp) }}
                </div>
                <div class="event-item__content">
                  <span class="event-item__type">{{ eventTypeLabels[event.event_type] || event.event_type }}</span>
                  <span class="event-item__message">{{ getTransformedMessage(event).summary }}</span>
                </div>
                <div class="event-item__meta">
                  <!-- RSSI Indicator for heartbeat events -->
                  <RssiIndicator
                    v-if="hasRssiData(event)"
                    :rssi="getRssiValue(event)"
                    :show-value="true"
                  />
                  <span v-if="event.esp_id" class="event-item__esp">{{ event.esp_id }}</span>
                  <span v-if="event.gpio !== undefined" class="event-item__gpio">GPIO {{ event.gpio }}</span>
                  <span v-if="event.error_code" class="event-item__error">{{ event.error_code }}</span>
                </div>
                <component :is="getSeverityIcon(event.severity)" class="event-item__severity w-4 h-4" />
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- Non-virtual rendering with date separators -->
      <template v-else>
        <div
          v-for="group in eventsByDate"
          :key="group.date"
          class="event-date-group"
        >
          <!-- Date Separator -->
          <div class="date-separator">
            <div class="date-separator__line"></div>
            <div class="date-separator__label">
              <Calendar class="w-3.5 h-3.5" />
              <span>{{ group.label }}</span>
            </div>
            <div class="date-separator__line"></div>
          </div>

          <!-- Events for this date -->
          <template v-for="event in group.events" :key="event.id">
            <!-- Server Lifecycle Separator (if applicable) -->
            <div
              v-if="isSystemLifecycleEvent(event)"
              class="lifecycle-separator"
              :class="`lifecycle-separator--${getLifecycleEventType(event)}`"
            >
              <div class="lifecycle-separator__line"></div>
              <div class="lifecycle-separator__label">
                <Server class="w-3 h-3" />
                <span>{{ getLifecycleEventType(event) === 'start' ? 'Server gestartet' : 'Server gestoppt' }}</span>
              </div>
              <div class="lifecycle-separator__line"></div>
            </div>

            <!-- Event Item -->
            <div
              class="event-item"
              :class="[
                `event-item--category-${getCategoryClass(event)}`,
                `event-item--severity-${event.severity}`,
                { 'event-item--restored': isRestoredEvent(event) }
              ]"
              :data-category="getCategoryClass(event)"
              :data-severity="event.severity"
              @click="handleSelect(event)"
            >
              <!-- Restored Badge -->
              <div v-if="isRestoredEvent(event)" class="event-item__restored-badge">
                <RotateCcw class="w-3 h-3" />
              </div>

              <div class="event-item__category-bar" />
              <div class="event-item__icon">
                <component :is="getEventIcon(event.event_type)" class="w-4 h-4" />
              </div>
              <div class="event-item__time">
                {{ formatTime(event.timestamp) }}
              </div>
              <div class="event-item__content">
                <span class="event-item__type">{{ eventTypeLabels[event.event_type] || event.event_type }}</span>
                <span class="event-item__message">{{ getTransformedMessage(event).summary }}</span>
              </div>
              <div class="event-item__meta">
                <!-- RSSI Indicator for heartbeat events -->
                <RssiIndicator
                  v-if="hasRssiData(event)"
                  :rssi="getRssiValue(event)"
                  :show-value="true"
                />
                <span v-if="event.esp_id" class="event-item__esp">{{ event.esp_id }}</span>
                <span v-if="event.gpio !== undefined" class="event-item__gpio">GPIO {{ event.gpio }}</span>
                <span v-if="event.error_code" class="event-item__error">{{ event.error_code }}</span>
              </div>
              <component :is="getSeverityIcon(event.severity)" class="event-item__severity w-4 h-4" />
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.event-list-container {
  flex: 1;  /* ⭐ FIX: Nur flex: 1, KEIN height: 100% - Flexbox bestimmt Höhe automatisch */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;  /* ⭐ KRITISCH: Erlaubt Flexbox-Child die korrekte Höhenberechnung */
}

.monitor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.5rem;
  padding: 2rem;
  text-align: center;
}

.monitor-empty__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0;
}

.monitor-empty__subtitle {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin: 0;
}

.event-list {
  flex: 1;  /* ⭐ FIX: Nur flex: 1, KEIN height: 100% - Flexbox bestimmt Höhe automatisch */
  overflow-y: auto;  /* ⭐ EINZIGER SCROLL-CONTAINER! */
  min-height: 0;  /* ⭐ KRITISCH: Erlaubt Flexbox die Größe korrekt zu berechnen */
  position: relative;  /* ⭐ Für absolute positionierte Virtual Scroll Children */
}

.event-list--virtual {
  /* ⭐ FIX: `contain: strict` durch `contain: layout paint` ersetzt
   * - `strict` aktiviert Size Containment → Container-Höhe wird 0 bei flex: 1
   * - `layout paint` behält Performance-Vorteile ohne Size Containment
   */
  contain: layout paint;
}

.event-list__spacer {
  position: relative;
}

.event-list__visible {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  padding-left: 0; /* No left padding - category bar handles spacing */
  border-bottom: 1px solid var(--glass-border);
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 60px;
  position: relative;
}

.event-item:hover {
  background-color: rgba(255, 255, 255, 0.03);
  box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.02);
}

/* ============================================================================
   Category Bar (3px left border with category color)
   ============================================================================ */
.event-item__category-bar {
  width: 3px;
  align-self: stretch;
  flex-shrink: 0;
  margin-right: 0.75rem;
  border-radius: 0 2px 2px 0;
  transition: all 0.2s ease;
}

/* ESP-Status (Blue) */
.event-item--category-esp-status .event-item__category-bar {
  background-color: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
}

/* Sensors (Emerald) */
.event-item--category-sensors .event-item__category-bar {
  background-color: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
}

/* Actuators (Amber) */
.event-item--category-actuators .event-item__category-bar {
  background-color: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
}

/* System (Violet) */
.event-item--category-system .event-item__category-bar {
  background-color: #8b5cf6;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
}

/* ============================================================================
   Severity Overlay (subtle background tint)
   ============================================================================ */
.event-item--severity-info {
  /* No special styling for info */
}

.event-item--severity-warning {
  background-color: rgba(245, 158, 11, 0.03);
}

.event-item--severity-error {
  background-color: rgba(239, 68, 68, 0.04);
}

.event-item--severity-critical {
  background-color: rgba(239, 68, 68, 0.06);
  animation: pulse-subtle 2s ease-in-out infinite;
}

@keyframes pulse-subtle {
  0%, 100% { background-color: rgba(239, 68, 68, 0.06); }
  50% { background-color: rgba(239, 68, 68, 0.08); }
}

.event-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: all 0.2s ease;
}

/* Category-based icon styling */
.event-item--category-esp-status .event-item__icon {
  background-color: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}

.event-item--category-sensors .event-item__icon {
  background-color: rgba(16, 185, 129, 0.12);
  color: #34d399;
}

.event-item--category-actuators .event-item__icon {
  background-color: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}

.event-item--category-system .event-item__icon {
  background-color: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
}

/* NOTE: Icon color is now ALWAYS determined by category (not severity)
 * Severity is indicated via:
 * - Background tint (subtle overlay)
 * - Severity icon on the right (AlertTriangle, AlertCircle, etc.)
 *
 * This provides clearer visual separation:
 * - Icon color = "What is it?" (Category)
 * - Tint + right icon = "How important?" (Severity)
 */

.event-item__time {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
  min-width: 5rem;
}

.event-item__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.event-item__type {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.event-item__message {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-item__meta {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.event-item__esp,
.event-item__gpio,
.event-item__error {
  font-size: 0.6875rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
}

.event-item__error {
  background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
  color: var(--color-error);
}

.event-item__severity {
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.event-item--severity-error .event-item__severity,
.event-item--severity-critical .event-item__severity {
  color: #f87171;
}

.event-item--severity-warning .event-item__severity {
  color: #fbbf24;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .event-item {
    /* Touch-friendly row height (64px minimum) */
    min-height: 64px;
    padding: 0.75rem 1rem;
    gap: 0.5rem;
  }

  .event-item__icon {
    /* Larger touch target */
    width: 2.5rem;
    height: 2.5rem;
  }

  .event-item__time {
    display: none;
  }

  .event-item__meta {
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }
}

@media (max-width: 480px) {
  .event-item {
    min-height: 60px;
    padding: 0.625rem 0.75rem;
  }

  .event-item__icon {
    width: 2rem;
    height: 2rem;
  }

  .event-item__message {
    font-size: 0.8125rem;
  }

  .event-item__type {
    font-size: 0.625rem;
  }

  .event-item__esp,
  .event-item__gpio,
  .event-item__error {
    font-size: 0.625rem;
    padding: 0.125rem 0.25rem;
  }

  /* Hide severity icon on very small screens to save space */
  .event-item__severity {
    display: none;
  }
}

/* ============================================================================
   Date Separators
   ============================================================================ */

.event-date-group {
  display: flex;
  flex-direction: column;
}

.date-separator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  background-color: var(--color-bg-secondary);
}

.date-separator__line {
  flex: 1;
  height: 1px;
  background-color: var(--glass-border);
}

.date-separator__label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.date-separator__label svg {
  opacity: 0.6;
}

/* Sticky Date Header for Virtual Scrolling */
.date-separator--sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Inline Date Separator for date changes within virtual scroll */
.date-separator--inline {
  margin-top: 0.5rem;
}

/* ============================================================================
   Server Lifecycle Separators - Server Start/Stop (unauffällig)
   ============================================================================ */
.lifecycle-separator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  margin: 0.75rem 0 0.25rem 0;
}

.lifecycle-separator__line {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    currentColor 50%,
    transparent 100%
  );
  opacity: 0.3;
}

.lifecycle-separator__label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  background: var(--color-bg-secondary);
  border: 1px solid currentColor;
  border-radius: var(--radius-md);
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Server Start - Grün, unauffällig */
.lifecycle-separator--start {
  color: rgba(34, 197, 94, 0.6);
}

.lifecycle-separator--start .lifecycle-separator__label {
  border-color: rgba(34, 197, 94, 0.4);
}

/* Server Stop - Orange, unauffällig */
.lifecycle-separator--stop {
  color: rgba(251, 146, 60, 0.6);
}

.lifecycle-separator--stop .lifecycle-separator__label {
  border-color: rgba(251, 146, 60, 0.4);
}

/* ============================================================================
   Restored Event Highlighting
   ============================================================================ */

.event-item--restored {
  border-left: 3px solid var(--color-success, #22c55e) !important;
  background-color: color-mix(in srgb, var(--color-success, #22c55e) 8%, transparent);
  animation: restored-pulse 2s ease-out;
  position: relative;
}

.event-item--restored:hover {
  background-color: color-mix(in srgb, var(--color-success, #22c55e) 12%, transparent);
}

@keyframes restored-pulse {
  0% {
    background-color: color-mix(in srgb, var(--color-success, #22c55e) 20%, transparent);
  }
  100% {
    background-color: color-mix(in srgb, var(--color-success, #22c55e) 8%, transparent);
  }
}

.event-item__restored-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background-color: var(--color-success, #22c55e);
  color: white;
  animation: badge-pop 0.3s ease-out;
}

@keyframes badge-pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Mobile adjustments for date separators */
@media (max-width: 768px) {
  .date-separator {
    padding: 0.5rem 1rem;
  }

  .date-separator__label {
    font-size: 0.6875rem;
  }
}

@media (max-width: 480px) {
  .date-separator {
    padding: 0.5rem 0.75rem;
    gap: 0.5rem;
  }

  .date-separator__label {
    font-size: 0.625rem;
  }

  .event-item__restored-badge {
    width: 1rem;
    height: 1rem;
    top: 0.375rem;
    right: 0.375rem;
  }

  .event-item__restored-badge svg {
    width: 0.625rem;
    height: 0.625rem;
  }
}
</style>
