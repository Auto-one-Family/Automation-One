<script setup lang="ts">
/**
 * EventDetailsPanel - Redesigned Event Detail Display Component
 *
 * Features:
 * - Iridescent Glasmorphism Design
 * - Dynamische Sections basierend auf Event-Typ
 * - Metric Cards für Gerätestatus (Speicher, Signal, Laufzeit)
 * - RSSI Visualisierung
 * - Deutsche, menschenverständliche Nachrichten
 * - Collapsible JSON Details
 * - Mobile-responsive mit Swipe-to-Close
 * - Click-Outside to close (Desktop)
 * - ESC key to close
 *
 * SECTION MAPPING:
 * - Heartbeat:      Header, Zusammenfassung, Gerätestatus, JSON
 * - Sensor Data:    Header, Zusammenfassung, Messwert-Details, JSON
 * - Device Offline: Header, Zusammenfassung, Verbindungs-Info, JSON
 * - Config Response:Header, Zusammenfassung, Fehler-Details*, JSON
 * - Actuator:       Header, Zusammenfassung, Befehl-Details, JSON
 *
 * @emits close - When close button is clicked, ESC pressed, or click outside
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { UnifiedEvent } from '@/types/websocket-events'
import { getSeverityLabel } from '@/utils/errorCodeTranslator'
import { getEventIcon } from '@/utils/eventTypeIcons'
import { getEventCategory, transformEventMessage, formatUptime, formatMemory } from '@/utils/eventTransformer'
import RssiIndicator from './RssiIndicator.vue'
import {
  X,
  Copy,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  GripHorizontal,
  ChevronDown,
  ChevronUp,
  MemoryStick,
  Wifi,
  Clock,
  Thermometer,
  Zap,
  Filter,
  FileText,
} from 'lucide-vue-next'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  event: UnifiedEvent
  eventTypeLabels: Record<string, string>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  'filter-device': [espId: string]
  'show-server-logs': [event: UnifiedEvent]
}>()

// ============================================================================
// State
// ============================================================================

const jsonCopied = ref(false)
const jsonExpanded = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const isMobile = ref(false)

// Swipe state
const touchStartY = ref(0)
const touchCurrentY = ref(0)
const isDragging = ref(false)
const dragOffset = ref(0)

// Click-Outside state
const isVisible = ref(false)

// ============================================================================
// Computed - Event Analysis
// ============================================================================

const eventCategory = computed(() => getEventCategory(props.event))
const transformedMessage = computed(() => transformEventMessage(props.event))
const eventData = computed(() => (props.event.data || {}) as Record<string, unknown>)

/**
 * Determine which sections to show based on event type
 */
const showDeviceStatus = computed(() => {
  return props.event.event_type === 'esp_health'
})

const showSensorData = computed(() => {
  return props.event.event_type === 'sensor_data' || props.event.event_type === 'sensor_health'
})

// Reserved for future use - actuator and connection sections
// const showActuatorData = computed(() => {
//   return ['actuator_status', 'actuator_response', 'actuator_alert'].includes(props.event.event_type)
// })
// const showConnectionInfo = computed(() => {
//   return ['device_offline', 'device_online', 'lwt_received'].includes(props.event.event_type)
// })

const showErrorDetails = computed(() => {
  const status = eventData.value.status as string | undefined
  return status === 'error' || status === 'failed' || props.event.error_code !== undefined
})

/**
 * Device Status Metrics (for heartbeat events)
 */
const deviceMetrics = computed(() => {
  if (!showDeviceStatus.value) return null

  const data = eventData.value
  return {
    heapFree: typeof data.heap_free === 'number' ? data.heap_free : 0,
    heapTotal: 320 * 1024, // ESP32 has ~320KB RAM
    wifiRssi: typeof data.wifi_rssi === 'number' ? data.wifi_rssi : 0,
    uptime: typeof data.uptime === 'number' ? data.uptime : 0,
    sensorCount: typeof data.sensor_count === 'number' ? data.sensor_count : 0,
    actuatorCount: typeof data.actuator_count === 'number' ? data.actuator_count : 0,
  }
})

/**
 * Calculate heap percentage used
 */
const heapPercentage = computed(() => {
  if (!deviceMetrics.value) return 0
  const used = deviceMetrics.value.heapTotal - deviceMetrics.value.heapFree
  return Math.round((used / deviceMetrics.value.heapTotal) * 100)
})

/**
 * Get heap status class
 */
const heapStatusClass = computed(() => {
  const pct = heapPercentage.value
  if (pct < 50) return 'good'
  if (pct < 75) return 'warning'
  return 'critical'
})

/**
 * Get RSSI quality class
 */
const rssiQualityClass = computed(() => {
  if (!deviceMetrics.value) return 'good'
  const rssi = deviceMetrics.value.wifiRssi
  if (rssi > -50) return 'good'
  if (rssi > -70) return 'fair'
  return 'weak'
})

/**
 * Sensor Data (for sensor events)
 */
const sensorData = computed(() => {
  if (!showSensorData.value) return null

  const data = eventData.value
  return {
    sensorType: (data.sensor_type || props.event.device_type || 'sensor') as string,
    value: typeof data.value === 'number' ? data.value : 0,
    unit: (data.unit || '') as string,
    quality: typeof data.quality === 'number' ? data.quality : undefined,
    rawMode: data.raw_mode as boolean | undefined,
  }
})

/**
 * Error Details (for error events)
 */
const errorDetails = computed(() => {
  if (!showErrorDetails.value) return null

  const data = eventData.value
  return {
    errorCode: props.event.error_code || data.error_code,
    configType: (data.type || data.config_type || 'Config') as string,
    status: (data.status || 'error') as string,
    message: (data.message || props.event.message || 'Unbekannter Fehler') as string,
    failedCount: typeof data.failed_count === 'number' ? data.failed_count : undefined,
    failures: data.failures as Array<{ gpio?: number; reason?: string }> | undefined,
  }
})

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

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatEventTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    esp: 'ESP via MQTT',
    mqtt: 'MQTT',
    server: 'Server',
    user: 'Benutzer',
    logic: 'Automation',
  }
  return labels[source] || source
}

// ============================================================================
// Mobile Detection & Swipe Handlers
// ============================================================================

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

function handleTouchStart(e: TouchEvent) {
  if (!isMobile.value) return

  const target = e.target as HTMLElement
  if (!target.closest('.details-panel__drag-handle')) return

  touchStartY.value = e.touches[0].clientY
  touchCurrentY.value = touchStartY.value
  isDragging.value = true
  dragOffset.value = 0
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging.value || !isMobile.value) return

  touchCurrentY.value = e.touches[0].clientY
  const deltaY = touchCurrentY.value - touchStartY.value

  if (deltaY > 0) {
    dragOffset.value = deltaY
    e.preventDefault()
  }
}

function handleTouchEnd() {
  if (!isDragging.value || !isMobile.value) return

  const deltaY = touchCurrentY.value - touchStartY.value

  if (deltaY > 150) {
    emit('close')
  }

  isDragging.value = false
  dragOffset.value = 0
}

function copyJson() {
  navigator.clipboard.writeText(JSON.stringify(props.event.data, null, 2))
  jsonCopied.value = true
  setTimeout(() => {
    jsonCopied.value = false
  }, 2000)
}

function copyEspId() {
  if (props.event.esp_id) {
    navigator.clipboard.writeText(props.event.esp_id)
  }
}

function handleClose() {
  emit('close')
}

function toggleJson() {
  jsonExpanded.value = !jsonExpanded.value
}

/**
 * Handle click on backdrop (outside panel)
 */
function handleBackdropClick(e: MouseEvent) {
  // Only close if clicking on the backdrop itself, not its children
  if (e.target === e.currentTarget) {
    handleClose()
  }
}

/**
 * Handle ESC key to close panel
 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleClose()
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('keydown', handleKeydown)

  // Delay visibility for animation
  requestAnimationFrame(() => {
    isVisible.value = true
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <!-- Backdrop for click-outside (Desktop only) -->
  <div
    v-if="!isMobile"
    class="details-backdrop"
    :class="{ 'details-backdrop--visible': isVisible }"
    @click="handleBackdropClick"
  />

  <!-- Panel -->
  <div
    ref="panelRef"
    class="details-panel"
    :class="[
      { 'is-dragging': isDragging },
      `details-panel--category-${eventCategory}`,
    ]"
    :style="{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined }"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Mobile: Drag Handle -->
    <div v-if="isMobile" class="details-panel__drag-handle">
      <GripHorizontal class="w-6 h-6" />
      <span class="details-panel__drag-hint">Nach unten wischen zum Schließen</span>
    </div>

    <!-- =========================================================================
         HEADER SECTION
         ========================================================================= -->
    <div class="panel-header">
      <div class="panel-header__left">
        <span class="severity-badge" :class="`severity-badge--${event.severity}`">
          <component :is="getSeverityIcon(event.severity)" class="w-3 h-3" />
          {{ getSeverityLabel(event.severity as any) }}
        </span>
        <div class="panel-header__title">
          <component :is="getEventIcon(event.event_type)" class="w-5 h-5" />
          <span>{{ transformedMessage.titleDE }}</span>
        </div>
      </div>
      <button class="panel-close" @click="handleClose">
        <X class="w-5 h-5" />
      </button>
    </div>

    <div class="panel-body">
      <!-- =========================================================================
           ZUSAMMENFASSUNG SECTION
           ========================================================================= -->
      <section class="panel-section" :class="{ 'panel-section--error': showErrorDetails }">
        <div class="section-header">
          <span class="section-title">Zusammenfassung</span>
        </div>
        <p class="summary-text" :class="{ 'summary-text--error': showErrorDetails }">
          <component
            v-if="showErrorDetails"
            :is="getSeverityIcon(event.severity)"
            class="w-4 h-4 inline-block mr-2"
          />
          {{ transformedMessage.description }}
        </p>
      </section>

      <!-- =========================================================================
           DETAILS SECTION (Zeitpunkt, Quelle, ESP-ID)
           ========================================================================= -->
      <section class="panel-section">
        <div class="section-header">
          <span class="section-title">Details</span>
        </div>
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Zeitpunkt</span>
            <span class="detail-value">{{ formatTimestamp(event.timestamp) }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Quelle</span>
            <span class="detail-value">{{ getSourceLabel(event.source) }}</span>
          </div>
          <div v-if="event.esp_id" class="detail-item detail-item--full">
            <span class="detail-label">ESP-ID</span>
            <div class="detail-value detail-value--copyable" @click="copyEspId">
              <span class="font-mono">{{ event.esp_id }}</span>
              <Copy class="w-3.5 h-3.5 copy-icon" />
            </div>
          </div>
          <div v-if="event.zone_name" class="detail-item">
            <span class="detail-label">Zone</span>
            <span class="detail-value">{{ event.zone_name }}</span>
          </div>
          <div v-if="event.gpio !== undefined" class="detail-item">
            <span class="detail-label">GPIO</span>
            <span class="detail-value font-mono">{{ event.gpio }}</span>
          </div>

          <!-- Action Buttons -->
          <div v-if="event.esp_id" class="detail-item detail-item--full detail-item--actions">
            <button
              class="action-btn action-btn--filter"
              @click="emit('filter-device', event.esp_id!)"
            >
              <Filter :size="14" />
              Alle Events von {{ event.esp_id }}
            </button>
            <button
              class="action-btn action-btn--logs"
              @click="emit('show-server-logs', event)"
            >
              <FileText :size="14" />
              Server-Logs um {{ formatEventTime(event.timestamp) }}
            </button>
          </div>
        </div>
      </section>

      <!-- =========================================================================
           GERÄTESTATUS SECTION (Heartbeat Events)
           ========================================================================= -->
      <section v-if="showDeviceStatus && deviceMetrics" class="panel-section">
        <div class="section-header">
          <span class="section-title">Gerätestatus</span>
        </div>

        <!-- Metric Cards Row 1 -->
        <div class="metric-grid">
          <!-- Speicher Card -->
          <div class="metric-card">
            <div class="metric-header">
              <MemoryStick class="w-4 h-4" />
              <span>Speicher</span>
            </div>
            <div class="metric-value">{{ formatMemory(deviceMetrics.heapFree) }} frei</div>
            <div class="metric-bar">
              <div
                class="metric-bar__fill"
                :class="`metric-bar__fill--${heapStatusClass}`"
                :style="{ width: `${100 - heapPercentage}%` }"
              />
            </div>
            <div class="metric-sublabel">{{ 100 - heapPercentage }}% verfügbar</div>
          </div>

          <!-- Signal Card -->
          <div class="metric-card">
            <div class="metric-header">
              <Wifi class="w-4 h-4" />
              <span>Signal</span>
            </div>
            <div class="metric-value">
              <RssiIndicator :rssi="deviceMetrics.wifiRssi" :show-value="true" />
            </div>
            <div class="metric-sublabel" :class="`text-${rssiQualityClass}`">
              {{ rssiQualityClass === 'good' ? 'Ausgezeichnet' : rssiQualityClass === 'fair' ? 'Gut' : 'Schwach' }}
            </div>
          </div>

          <!-- Laufzeit Card -->
          <div class="metric-card">
            <div class="metric-header">
              <Clock class="w-4 h-4" />
              <span>Laufzeit</span>
            </div>
            <div class="metric-value">{{ formatUptime(deviceMetrics.uptime) }}</div>
          </div>
        </div>

        <!-- Metric Cards Row 2 -->
        <div class="metric-grid metric-grid--small">
          <div class="metric-card metric-card--compact">
            <div class="metric-header">
              <Thermometer class="w-4 h-4" />
              <span>Sensoren</span>
            </div>
            <div class="metric-value">{{ deviceMetrics.sensorCount }} aktiv</div>
          </div>

          <div class="metric-card metric-card--compact">
            <div class="metric-header">
              <Zap class="w-4 h-4" />
              <span>Aktoren</span>
            </div>
            <div class="metric-value">{{ deviceMetrics.actuatorCount }} aktiv</div>
          </div>
        </div>
      </section>

      <!-- =========================================================================
           SENSOR DATA SECTION
           ========================================================================= -->
      <section v-if="showSensorData && sensorData" class="panel-section">
        <div class="section-header">
          <span class="section-title">Messwert-Details</span>
        </div>
        <div class="sensor-display">
          <div class="sensor-value-large">
            {{ sensorData.value.toFixed(sensorData.sensorType === 'ph' ? 2 : 1) }}
            <span class="sensor-unit">{{ sensorData.unit }}</span>
          </div>
          <div class="sensor-meta">
            <span class="sensor-type">{{ sensorData.sensorType }}</span>
            <span v-if="sensorData.quality !== undefined" class="sensor-quality">
              Qualität: {{ sensorData.quality }}%
            </span>
            <span v-if="sensorData.rawMode" class="sensor-raw-badge">RAW</span>
          </div>
        </div>
      </section>

      <!-- =========================================================================
           ERROR DETAILS SECTION
           ========================================================================= -->
      <section v-if="showErrorDetails && errorDetails" class="panel-section panel-section--error-details">
        <div class="section-header">
          <span class="section-title">Fehler-Details</span>
        </div>

        <div v-if="errorDetails.errorCode" class="error-code-display">
          <span class="error-code-label">Fehler-Code</span>
          <span class="error-code-badge">{{ errorDetails.errorCode }}</span>
        </div>

        <div class="error-info">
          <div class="error-info-row">
            <span class="error-info-label">Beschreibung</span>
            <p class="error-info-text">{{ errorDetails.message }}</p>
          </div>

          <div v-if="errorDetails.configType" class="error-info-row">
            <span class="error-info-label">Config-Typ</span>
            <span class="error-info-value">{{ errorDetails.configType }}</span>
          </div>

          <div class="error-info-row">
            <span class="error-info-label">Status</span>
            <span class="error-status-badge error-status-badge--failed">
              Fehlgeschlagen
            </span>
          </div>

          <!-- Failed Items List -->
          <div v-if="errorDetails.failures && errorDetails.failures.length > 0" class="error-failures">
            <span class="error-info-label">Fehlgeschlagene Elemente</span>
            <ul class="failure-list">
              <li v-for="(failure, i) in errorDetails.failures" :key="i" class="failure-item">
                <span v-if="failure.gpio !== undefined" class="failure-gpio">GPIO {{ failure.gpio }}</span>
                <span v-if="failure.reason" class="failure-reason">{{ failure.reason }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- =========================================================================
           TECHNISCHE DETAILS (JSON) SECTION
           ========================================================================= -->
      <section class="panel-section panel-section--json">
        <button class="json-toggle" @click="toggleJson">
          <span class="json-toggle__label">
            <component :is="jsonExpanded ? ChevronUp : ChevronDown" class="w-4 h-4" />
            <span>Technische Details (JSON)</span>
          </span>
          <button class="json-copy-btn" @click.stop="copyJson">
            <component :is="jsonCopied ? CheckCircle2 : Copy" class="w-4 h-4" />
            {{ jsonCopied ? 'Kopiert!' : 'Kopieren' }}
          </button>
        </button>

        <Transition name="slide">
          <div v-if="jsonExpanded" class="json-content">
            <pre class="json-pre">{{ JSON.stringify(event.data, null, 2) }}</pre>
          </div>
        </Transition>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================================
   DETAIL PANEL - Iridescent Glassmorphism Design
   ============================================================================ */
.details-panel {
  position: fixed;
  bottom: 0;
  left: 16rem;
  right: 0;
  max-height: 65vh;
  z-index: 50;
  overflow-y: auto;
  transition: transform 0.15s ease-out;

  /* Iridescent Glassmorphism */
  background: rgba(15, 15, 20, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 -4px 24px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.details-panel.is-dragging {
  transition: none;
}

/* Category-based top border accent */
.details-panel--category-esp-status {
  border-top-color: rgba(59, 130, 246, 0.3);
}

.details-panel--category-sensors {
  border-top-color: rgba(16, 185, 129, 0.3);
}

.details-panel--category-actuators {
  border-top-color: rgba(245, 158, 11, 0.3);
}

.details-panel--category-system {
  border-top-color: rgba(139, 92, 246, 0.3);
}

/* Drag Handle (Mobile only) */
.details-panel__drag-handle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: grab;
  touch-action: none;
  color: var(--color-text-muted);
}

.details-panel__drag-handle:active {
  cursor: grabbing;
}

.details-panel__drag-hint {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ============================================================================
   HEADER
   ============================================================================ */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  position: sticky;
  top: 0;
  background: rgba(15, 15, 20, 0.98);
  backdrop-filter: blur(12px);
  z-index: 10;
}

.panel-header__left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.panel-header__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.severity-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.severity-badge--info {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(96, 165, 250, 0.25);
}

.severity-badge--warning {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.severity-badge--error,
.severity-badge--critical {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.panel-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-primary);
  transform: rotate(90deg);
}

/* ============================================================================
   BODY & SECTIONS
   ============================================================================ */
.panel-body {
  padding: 1rem 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel-section {
  padding: 1rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.panel-section--error {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.15);
}

.panel-section--error-details {
  background: rgba(239, 68, 68, 0.03);
  border-color: rgba(239, 68, 68, 0.12);
}

.section-header {
  margin-bottom: 0.75rem;
}

.section-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.summary-text {
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  line-height: 1.5;
  margin: 0;
}

.summary-text--error {
  color: #fca5a5;
}

/* ============================================================================
   DETAILS GRID
   ============================================================================ */
.details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.detail-item--full {
  grid-column: 1 / -1;
}

.detail-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.detail-value {
  font-size: 0.875rem;
  color: var(--color-text-primary);
}

.detail-value--copyable {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: color 0.15s;
}

.detail-value--copyable:hover {
  color: #60a5fa;
}

.detail-value--copyable .copy-icon {
  opacity: 0;
  transition: opacity 0.15s;
}

.detail-value--copyable:hover .copy-icon {
  opacity: 1;
}

/* ============================================================================
   METRIC CARDS (Device Status)
   ============================================================================ */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.metric-grid--small {
  grid-template-columns: repeat(2, 1fr);
  margin-bottom: 0;
}

.metric-card {
  padding: 0.875rem;
  border-radius: 0.625rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.metric-card--compact {
  padding: 0.75rem;
}

.metric-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.metric-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.metric-bar {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin-top: 0.25rem;
}

.metric-bar__fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}

.metric-bar__fill--good { background: #22c55e; }
.metric-bar__fill--warning { background: #f59e0b; }
.metric-bar__fill--critical { background: #ef4444; }

.metric-sublabel {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.text-good { color: #22c55e; }
.text-fair { color: #f59e0b; }
.text-weak { color: #ef4444; }

/* ============================================================================
   SENSOR DATA DISPLAY
   ============================================================================ */
.sensor-display {
  text-align: center;
  padding: 1rem;
}

.sensor-value-large {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1;
}

.sensor-unit {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--color-text-muted);
  margin-left: 0.25rem;
}

.sensor-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.sensor-type {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: capitalize;
}

.sensor-quality {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.sensor-raw-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  text-transform: uppercase;
}

/* ============================================================================
   ERROR DETAILS
   ============================================================================ */
.error-code-display {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
}

.error-code-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
}

.error-code-badge {
  display: inline-block;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  font-family: var(--font-mono, monospace);
  font-size: 0.875rem;
  font-weight: 600;
  color: #fca5a5;
}

.error-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.error-info-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.error-info-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
}

.error-info-text {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.error-info-value {
  font-size: 0.875rem;
  color: var(--color-text-primary);
}

.error-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.error-status-badge--failed {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.error-failures {
  margin-top: 0.5rem;
}

.failure-list {
  list-style: none;
  margin: 0.5rem 0 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.failure-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.1);
  font-size: 0.8125rem;
}

.failure-gpio {
  font-family: var(--font-mono, monospace);
  color: #fca5a5;
  font-weight: 600;
}

.failure-reason {
  color: var(--color-text-secondary);
}

/* ============================================================================
   JSON SECTION
   ============================================================================ */
.panel-section--json {
  padding: 0;
  background: transparent;
  border: none;
}

.json-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}

.json-toggle:hover {
  background: rgba(255, 255, 255, 0.04);
}

.json-toggle__label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.json-copy-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.15s;
}

.json-copy-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-primary);
}

/* === ACTION BUTTONS === */
.detail-item--actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.75rem;
  margin-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-primary);
}

.action-btn--filter:hover {
  border-color: rgba(96, 165, 250, 0.3);
  color: #60a5fa;
}

.action-btn--logs:hover {
  border-color: rgba(139, 92, 246, 0.3);
  color: #a78bfa;
}

@media (max-width: 480px) {
  .detail-item--actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
    justify-content: center;
  }
}

.json-content {
  margin-top: 0.5rem;
  border-radius: 0.5rem;
  overflow: hidden;
}

.json-pre {
  margin: 0;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.5rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
  overflow-x: auto;
  white-space: pre;
}

/* Slide Transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 500px;
}

/* ============================================================================
   UTILITY CLASSES
   ============================================================================ */
.font-mono {
  font-family: var(--font-mono, monospace);
}

/* ============================================================================
   MOBILE RESPONSIVE
   ============================================================================ */
@media (max-width: 768px) {
  .details-panel {
    position: fixed;
    inset: 0;
    left: 0;
    max-height: 100vh;
    border-radius: 0;
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
  }

  .panel-body {
    padding: 1rem;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
  }

  .details-grid {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .metric-grid--small {
    grid-template-columns: repeat(2, 1fr);
  }

  .panel-close {
    width: 44px;
    height: 44px;
  }

  .sensor-value-large {
    font-size: 2rem;
  }
}

@media (max-width: 480px) {
  .panel-header {
    padding: 0.75rem 1rem;
  }

  .panel-header__title {
    font-size: 0.875rem;
    gap: 0.375rem;
  }

  .severity-badge {
    font-size: 0.625rem;
    padding: 0.1875rem 0.5rem;
  }

  .metric-card {
    padding: 0.625rem;
  }

  .metric-value {
    font-size: 1rem;
  }
}

/* ============================================================================
   BACKDROP (Click-Outside) - Desktop only
   ============================================================================ */
.details-backdrop {
  position: fixed;
  inset: 0;
  left: 16rem; /* Offset for sidebar */
  z-index: 49; /* Below panel (z-index: 50) */
  background: transparent;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease;
  cursor: pointer;
}

.details-backdrop--visible {
  opacity: 1;
  background: rgba(0, 0, 0, 0.15);
}

/* Sidebar adjustments for backdrop */
@media (max-width: 1024px) {
  .details-backdrop {
    left: 4rem; /* Collapsed sidebar width */
  }
}

@media (max-width: 768px) {
  .details-backdrop {
    display: none; /* Mobile uses swipe-to-close instead */
  }
}
</style>
