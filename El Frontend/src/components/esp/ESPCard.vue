<script setup lang="ts">
/**
 * ESPCard Component
 *
 * Displays an ESP device card with:
 * - Mock/Real visual distinction (purple vs cyan border)
 * - Online/Offline status indicator
 * - Orphaned mock warning badge
 * - Quick stats (sensors, actuators)
 * - Different actions for Mock vs Real devices with loading states
 * - Zone information
 * - Last heartbeat time
 */

import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Heart,
  AlertTriangle,
  Trash2,
  Settings,
  ExternalLink,
  AlertOctagon,
  Loader2,
  Thermometer,
  Zap,
  Clock,
  HardDrive,
  MapPin,
  Wifi,
  Database,
  MemoryStick,
  Radio,
  TimerOff,
} from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { formatRelativeTime, formatUptimeShort, formatHeapSize, getDataFreshness, type FreshnessLevel } from '@/utils/formatters'
import { espApi, type ESPDevice } from '@/api/esp'

interface Props {
  /** The ESP device data */
  esp: ESPDevice
  /** Loading state for heartbeat action */
  heartbeatLoading?: boolean
  /** Loading state for safe-mode toggle action */
  safeModeLoading?: boolean
  /** Loading state for delete action */
  deleteLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  heartbeatLoading: false,
  safeModeLoading: false,
  deleteLoading: false,
})

const emit = defineEmits<{
  heartbeat: [espId: string]
  toggleSafeMode: [espId: string]
  delete: [espId: string]
}>()

// Computed properties
const isMock = computed(() => {
  const deviceId = props.esp.device_id || props.esp.esp_id || ''
  return espApi.isMockEsp(deviceId)
})

const isOnline = computed(() => 
  props.esp.status === 'online' || props.esp.connected === true
)

const espId = computed(() => 
  props.esp.device_id || props.esp.esp_id || ''
)

const hasEmergencyStopped = computed(() => {
  if (!props.esp.actuators) return false
  return props.esp.actuators.some((a: any) => a.emergency_stopped)
})

// Orphaned mock detection - Mock ESP exists in DB but not in debug store
const isOrphanedMock = computed(() => {
  if (!isMock.value) return false
  // Check if metadata contains orphaned_mock flag (set by esp.ts API)
  const metadata = props.esp.metadata as Record<string, unknown> | undefined
  return metadata?.orphaned_mock === true
})

// Check if any action is currently loading
const isAnyActionLoading = computed(() =>
  props.heartbeatLoading || props.safeModeLoading || props.deleteLoading
)

// System state (FSM) for Mock ESPs - only shown when relevant (SAFE_MODE, ERROR)
const systemState = computed(() => {
  if (isMock.value && 'system_state' in props.esp) {
    return (props.esp as any).system_state
  }
  return null
})

// Connection status - consistent for ALL devices (online/offline)
const connectionStatus = computed(() => {
  // Use 'status' field if available (Mock ESPs now include this)
  if ('status' in props.esp && props.esp.status) {
    return props.esp.status
  }
  // Fallback to 'connected' for Mock ESPs
  if ('connected' in props.esp) {
    return props.esp.connected ? 'online' : 'offline'
  }
  return props.esp.status || 'unknown'
})

// Primary status info - ALWAYS shows connection status (Online/Offline)
const stateInfo = computed(() => {
  const status = connectionStatus.value
  if (status === 'online') {
    return { label: 'Online', variant: 'success' }
  } else if (status === 'offline') {
    return { label: 'Offline', variant: 'gray' }
  } else if (status === 'error') {
    return { label: 'Fehler', variant: 'danger' }
  }
  return { label: 'Unbekannt', variant: 'gray' }
})

// Secondary state info for Mock ESPs - only shown for notable states (SAFE_MODE, ERROR)
const mockStateInfo = computed(() => {
  if (!isMock.value || !systemState.value) return null
  // Only show system_state badge for notable states, not for OPERATIONAL
  const state = systemState.value
  if (state === 'SAFE_MODE') {
    return { label: 'Sicherheitsmodus', variant: 'warning' }
  } else if (state === 'ERROR') {
    return { label: 'Fehler', variant: 'danger' }
  } else if (state === 'BOOT' || state === 'WIFI_SETUP' || state === 'MQTT_CONNECTING') {
    return { label: 'Startet...', variant: 'info' }
  }
  // Don't show badge for OPERATIONAL - connection status is sufficient
  return null
})

// Card classes based on mock/real and online/offline
const cardClasses = computed(() => {
  const classes = ['esp-card']

  if (isMock.value) {
    classes.push('esp-card--mock')
  } else {
    classes.push('esp-card--real')
  }

  if (!isOnline.value) {
    classes.push('esp-card--offline')
  }

  if (hasEmergencyStopped.value) {
    classes.push('esp-card--emergency')
  }

  if (isOrphanedMock.value) {
    classes.push('esp-card--orphaned')
  }

  return classes
})

// Status bar color based on state
const statusBarClasses = computed(() => {
  if (isOrphanedMock.value) return 'esp-card__status-bar--orphaned'
  if (hasEmergencyStopped.value) return 'esp-card__status-bar--emergency'
  if (!isOnline.value) return 'esp-card__status-bar--offline'
  if (systemState.value === 'SAFE_MODE') return 'esp-card__status-bar--warning'
  if (systemState.value === 'ERROR' || connectionStatus.value === 'error') return 'esp-card__status-bar--error'
  if (isMock.value) return 'esp-card__status-bar--mock'
  return 'esp-card__status-bar--real'
})

// =============================================================================
// Data Source & Freshness Indicators
// =============================================================================

// Data source: where is this data coming from?
// Mock ESPs from debug store have rich data (sensors array, system_state, etc.)
// Orphaned mocks or real ESPs from DB may have less data
const dataSource = computed<'memory' | 'database'>(() => {
  // If it has sensors array with full data, it's from memory (debug store)
  if (isMock.value && !isOrphanedMock.value && props.esp.sensors && Array.isArray(props.esp.sensors)) {
    return 'memory'
  }
  // If it's a real ESP or orphaned mock, it's from database
  return 'database'
})

const dataSourceInfo = computed(() => {
  if (dataSource.value === 'memory') {
    return { label: 'Live-Speicher', icon: 'memory', colorClass: 'text-success' }
  }
  return { label: 'Datenbank', icon: 'database', colorClass: 'text-info' }
})

// Data freshness based on last heartbeat
const dataFreshness = computed<FreshnessLevel>(() => {
  const timestamp = props.esp.last_heartbeat || props.esp.last_seen
  return getDataFreshness(timestamp)
})

const freshnessInfo = computed(() => {
  switch (dataFreshness.value) {
    case 'live':
      return { label: 'Live', colorClass: 'freshness--live', title: 'Daten sind aktuell (< 30s)' }
    case 'recent':
      return { label: 'Aktuell', colorClass: 'freshness--recent', title: 'Daten sind aktuell (< 2min)' }
    case 'stale':
      return { label: 'Veraltet', colorClass: 'freshness--stale', title: 'Daten sind veraltet (> 2min)' }
    default:
      return { label: 'Unbekannt', colorClass: 'freshness--unknown', title: 'Kein Heartbeat empfangen' }
  }
})

// Check if important data might be stale or missing
const hasIncompleteData = computed(() => {
  // Check if uptime/heap/rssi are undefined (might indicate stale DB data)
  return props.esp.uptime === undefined &&
         props.esp.heap_free === undefined &&
         props.esp.wifi_rssi === undefined
})
</script>

<template>
  <div :class="cardClasses">
    <!-- Status indicator bar (left border) -->
    <div :class="['esp-card__status-bar', statusBarClasses]" />
    
    <div class="esp-card__content">
      <!-- Header: ID + Badges -->
      <div class="esp-card__header">
        <div class="esp-card__id-group">
        <RouterLink
          :to="`/devices/${espId}`"
          class="esp-card__id"
        >
          {{ espId }}
        </RouterLink>
          
          <Badge :variant="isMock ? 'mock' : 'real'" size="sm">
            {{ isMock ? 'MOCK' : 'REAL' }}
          </Badge>
        </div>
        
        <div class="esp-card__status-badges">
          <!-- Orphaned Mock Warning - highest priority indicator -->
          <Badge
            v-if="isOrphanedMock"
            variant="warning"
            size="sm"
            :dot="true"
          >
            <AlertOctagon class="w-3 h-3 mr-1" />
            Verwaist
          </Badge>

          <!-- Primary: Connection status (Online/Offline) - consistent for ALL devices -->
          <Badge
            v-if="!isOrphanedMock"
            :variant="stateInfo.variant as any"
            :pulse="isOnline"
            :dot="true"
            size="sm"
          >
            {{ stateInfo.label }}
          </Badge>

          <!-- Secondary: Mock ESP system state (only for SAFE_MODE, ERROR, etc.) -->
          <Badge
            v-if="mockStateInfo && !isOrphanedMock"
            :variant="mockStateInfo.variant as any"
            size="sm"
          >
            {{ mockStateInfo.label }}
          </Badge>

          <Badge v-if="hasEmergencyStopped" variant="danger" size="sm">
            E-STOP
          </Badge>
        </div>
      </div>
      
      <!-- Zone info (prominent) - shows zone_name (human-readable) with zone_id fallback -->
      <div class="esp-card__zone">
        <MapPin class="w-4 h-4 text-muted" />
        <span class="esp-card__zone-name">
          {{ esp.zone_name || esp.zone_id || 'Keine Zone' }}
        </span>
        <!-- Show technical zone_id as tooltip if zone_name differs -->
        <span
          v-if="esp.zone_name && esp.zone_id && esp.zone_name !== esp.zone_id"
          class="esp-card__zone-id"
          :title="`Zone ID: ${esp.zone_id}`"
        >
          ({{ esp.zone_id }})
        </span>
      </div>

      <!-- Data Source & Freshness Indicators -->
      <div class="esp-card__data-info">
        <!-- Data Source -->
        <div :class="['esp-card__data-source', dataSourceInfo.colorClass]" :title="dataSource === 'memory' ? 'Daten aus Debug-Store (RAM)' : 'Daten aus PostgreSQL'">
          <MemoryStick v-if="dataSource === 'memory'" class="w-3.5 h-3.5" />
          <Database v-else class="w-3.5 h-3.5" />
          <span>{{ dataSourceInfo.label }}</span>
        </div>

        <!-- Separator -->
        <span class="esp-card__data-separator">•</span>

        <!-- Freshness -->
        <div :class="['esp-card__freshness', freshnessInfo.colorClass]" :title="freshnessInfo.title">
          <Radio v-if="dataFreshness === 'live'" class="w-3.5 h-3.5" />
          <Clock v-else-if="dataFreshness === 'recent'" class="w-3.5 h-3.5" />
          <TimerOff v-else class="w-3.5 h-3.5" />
          <span>{{ freshnessInfo.label }}</span>
        </div>

        <!-- Incomplete Data Warning -->
        <template v-if="hasIncompleteData && dataSource === 'database'">
          <span class="esp-card__data-separator">•</span>
          <div class="esp-card__incomplete-data" title="Keine Uptime/Heap/RSSI Daten - letzter Heartbeat fehlt">
            <AlertTriangle class="w-3.5 h-3.5" />
            <span>Unvollständig</span>
          </div>
        </template>
      </div>

      <!-- Quick stats (compact grid) -->
      <div class="esp-card__stats">
        <div class="esp-card__stat" title="Sensoren">
          <Thermometer class="w-4 h-4" />
          <span>{{ esp.sensor_count ?? esp.sensors?.length ?? 0 }}</span>
        </div>
        <div class="esp-card__stat" title="Aktoren">
          <Zap class="w-4 h-4" />
          <span>{{ esp.actuator_count ?? esp.actuators?.length ?? 0 }}</span>
        </div>
        <div v-if="esp.uptime !== undefined" class="esp-card__stat" title="Uptime">
          <Clock class="w-4 h-4" />
          <span>{{ formatUptimeShort(esp.uptime || 0) }}</span>
        </div>
        <div v-if="esp.heap_free !== undefined" class="esp-card__stat" title="Heap">
          <HardDrive class="w-4 h-4" />
          <span>{{ formatHeapSize(esp.heap_free || 0) }}</span>
        </div>
        <div v-if="esp.wifi_rssi !== undefined" class="esp-card__stat" title="WiFi RSSI">
          <Wifi class="w-4 h-4" />
          <span>{{ esp.wifi_rssi }} dBm</span>
        </div>
      </div>

      <!-- Last heartbeat (separate row for visibility) -->
      <div v-if="esp.last_heartbeat || esp.last_seen" class="esp-card__heartbeat-info">
        <Heart class="w-3.5 h-3.5" />
        <span :title="esp.last_heartbeat || esp.last_seen || ''">
          {{ formatRelativeTime(esp.last_heartbeat || esp.last_seen || '') }}
        </span>
      </div>
      
      <!-- Auto-heartbeat indicator (Mock ESP only) -->
      <div v-if="isMock && 'auto_heartbeat' in esp" class="esp-card__auto-heartbeat">
        <span :class="['esp-card__auto-heartbeat-dot', (esp as any).auto_heartbeat ? 'active' : '']" />
        <span class="esp-card__auto-heartbeat-text">
          Auto-Heartbeat {{ (esp as any).auto_heartbeat ? 'aktiv' : 'inaktiv' }}
        </span>
      </div>
      
      <!-- Orphaned Mock Warning Message -->
      <div v-if="isOrphanedMock" class="esp-card__orphaned-warning">
        <AlertOctagon class="w-4 h-4 flex-shrink-0" />
        <span>
          Verwaist: Nur in DB, nicht im Debug-Store. Bitte löschen und neu erstellen.
        </span>
      </div>

      <!-- Actions -->
      <div class="esp-card__actions">
        <!-- Always available: Details -->
        <RouterLink
          :to="`/devices/${espId}`"
          class="btn-secondary btn-sm"
        >
          <ExternalLink class="w-4 h-4" />
          Details
        </RouterLink>

        <!-- Mock ESP specific actions -->
        <template v-if="isMock">
          <!-- Heartbeat Button with Loading -->
          <button
            class="btn-ghost btn-sm"
            :disabled="heartbeatLoading || isOrphanedMock || isAnyActionLoading"
            :title="isOrphanedMock ? 'Nicht verfügbar für verwaiste Mocks' : 'Heartbeat senden'"
            @click="emit('heartbeat', espId)"
          >
            <Loader2 v-if="heartbeatLoading" class="w-4 h-4 animate-spin" />
            <Heart v-else class="w-4 h-4" />
          </button>

          <!-- Safe Mode Toggle with Loading -->
          <button
            :class="['btn-ghost btn-sm', mockStateInfo?.variant === 'warning' ? 'text-warning' : '']"
            :disabled="safeModeLoading || isOrphanedMock || isAnyActionLoading"
            :title="isOrphanedMock ? 'Nicht verfügbar für verwaiste Mocks' : (systemState === 'SAFE_MODE' ? 'Sicherheitsmodus beenden' : 'Sicherheitsmodus aktivieren')"
            @click="emit('toggleSafeMode', espId)"
          >
            <Loader2 v-if="safeModeLoading" class="w-4 h-4 animate-spin" />
            <AlertTriangle v-else class="w-4 h-4" />
          </button>

          <!-- Delete Button with Loading -->
          <button
            class="btn-ghost btn-sm text-error hover:bg-danger/10"
            :disabled="deleteLoading || isAnyActionLoading"
            title="Löschen"
            @click="emit('delete', espId)"
          >
            <Loader2 v-if="deleteLoading" class="w-4 h-4 animate-spin" />
            <Trash2 v-else class="w-4 h-4" />
          </button>
        </template>

        <!-- Real ESP specific actions -->
        <template v-else>
          <button
            class="btn-ghost btn-sm"
            :disabled="deleteLoading"
            title="Löschen"
            @click="emit('delete', espId)"
          >
            <Loader2 v-if="deleteLoading" class="w-4 h-4 animate-spin" />
            <Trash2 v-else class="w-4 h-4" />
          </button>
          <button
            class="btn-ghost btn-sm"
            title="Konfigurieren"
            @click="$router.push(`/devices/${espId}`)"
          >
            <Settings class="w-4 h-4" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.esp-card {
  position: relative;
  display: flex;
  background-color: var(--color-bg-secondary);
  border-radius: 0.75rem;
  border: 1px solid var(--glass-border);
  overflow: hidden;
  transition: all 0.2s ease;
}

.esp-card:hover {
  border-color: rgba(96, 165, 250, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Status bar (left border indicator) */
.esp-card__status-bar {
  width: 4px;
  flex-shrink: 0;
}

.esp-card__status-bar--mock {
  background-color: var(--color-mock);
}

.esp-card__status-bar--real {
  background-color: var(--color-real);
}

.esp-card__status-bar--offline {
  background-color: var(--color-text-muted);
}

.esp-card__status-bar--warning {
  background-color: var(--color-warning);
}

.esp-card__status-bar--error {
  background-color: var(--color-error);
}

.esp-card__status-bar--emergency {
  background-color: var(--color-error);
  animation: pulse-bar 1s infinite;
}

@keyframes pulse-bar {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Offline state */
.esp-card--offline {
  opacity: 0.7;
}

/* Emergency state */
.esp-card--emergency {
  border-color: rgba(248, 113, 113, 0.3);
}

/* Orphaned mock state */
.esp-card--orphaned {
  border-color: rgba(251, 191, 36, 0.4);
  background-color: rgba(251, 191, 36, 0.03);
}

.esp-card__status-bar--orphaned {
  background-color: var(--color-warning);
  animation: pulse-bar 1.5s infinite;
}

/* Content area */
.esp-card__content {
  flex: 1;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-width: 0;
}

/* Header */
.esp-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.esp-card__id-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.esp-card__id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
  text-decoration: none;
  transition: color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.esp-card__id:hover {
  color: var(--color-iridescent-1);
}

.esp-card__status-badges {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

/* Zone info */
.esp-card__zone {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
}

.esp-card__zone-name {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.esp-card__zone-id {
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  font-family: 'JetBrains Mono', monospace;
  cursor: help;
}

.text-muted {
  color: var(--color-text-muted);
}

/* Data Source & Freshness Indicators */
.esp-card__data-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.esp-card__data-source,
.esp-card__freshness,
.esp-card__incomplete-data {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.esp-card__data-separator {
  color: var(--color-text-muted);
  opacity: 0.5;
}

/* Freshness color states */
.freshness--live {
  color: var(--color-success);
}

.freshness--recent {
  color: var(--color-info);
}

.freshness--stale {
  color: var(--color-warning);
}

.freshness--unknown {
  color: var(--color-text-muted);
}

.esp-card__incomplete-data {
  color: var(--color-warning);
}

.text-success {
  color: var(--color-success);
}

.text-info {
  color: var(--color-info);
}

/* Quick stats grid */
.esp-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.esp-card__stat {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.esp-card__stat span {
  color: var(--color-text-secondary);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* Heartbeat info */
.esp-card__heartbeat-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.esp-card__heartbeat-info span {
  color: var(--color-text-secondary);
}

/* Auto-heartbeat indicator */
.esp-card__auto-heartbeat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.esp-card__auto-heartbeat-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: var(--color-text-muted);
}

.esp-card__auto-heartbeat-dot.active {
  background-color: var(--color-success);
  animation: pulse-dot 2s infinite;
}

/* Orphaned mock warning message */
.esp-card__orphaned-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  color: var(--color-warning);
  background-color: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 0.375rem;
}

.esp-card__orphaned-warning span {
  line-height: 1.4;
}

/* Actions */
.esp-card__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--glass-border);
  margin-top: auto;
}

/* Disabled button state */
.esp-card__actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>





