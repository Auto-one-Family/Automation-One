<script setup lang="ts">
/**
 * ESPCard Component
 * 
 * Displays an ESP device card with:
 * - Mock/Real visual distinction (purple vs cyan border)
 * - Online/Offline status indicator
 * - Quick stats (sensors, actuators)
 * - Different actions for Mock vs Real devices
 * - Zone information
 * - Last heartbeat time
 */

import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Heart, AlertTriangle, Trash2, Settings, ExternalLink } from 'lucide-vue-next'
import Badge from '@/components/common/Badge.vue'
import { formatRelativeTime, formatUptimeShort, formatHeapSize } from '@/utils/formatters'
import { getStateLabel, getStateInfo } from '@/utils/labels'

interface ESPDevice {
  esp_id: string
  device_id?: string
  hardware_type?: string
  zone_id?: string
  zone_name?: string
  connected?: boolean
  is_online?: boolean
  system_state: string
  uptime: number
  heap_free: number
  wifi_rssi?: number
  sensors: Array<{ gpio: number }>
  actuators: Array<{ gpio: number; emergency_stopped?: boolean }>
  auto_heartbeat?: boolean
  last_heartbeat?: string
}

interface Props {
  /** The ESP device data */
  esp: ESPDevice
}

const props = defineProps<Props>()

const emit = defineEmits<{
  heartbeat: [espId: string]
  toggleSafeMode: [espId: string]
  delete: [espId: string]
}>()

// Computed properties
const isMock = computed(() => 
  props.esp.hardware_type?.startsWith('MOCK_') || 
  props.esp.esp_id?.startsWith('ESP_MOCK_') ||
  props.esp.device_id?.startsWith('ESP_MOCK_')
)

const isOnline = computed(() => 
  props.esp.connected ?? props.esp.is_online ?? false
)

const espId = computed(() => 
  props.esp.device_id ?? props.esp.esp_id
)

const hasEmergencyStopped = computed(() =>
  props.esp.actuators?.some(a => a.emergency_stopped)
)

const stateInfo = computed(() => getStateInfo(props.esp.system_state))

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
  
  return classes
})

// Status bar color based on state
const statusBarClasses = computed(() => {
  if (hasEmergencyStopped.value) return 'esp-card__status-bar--emergency'
  if (!isOnline.value) return 'esp-card__status-bar--offline'
  if (props.esp.system_state === 'SAFE_MODE') return 'esp-card__status-bar--warning'
  if (props.esp.system_state === 'ERROR') return 'esp-card__status-bar--error'
  if (isMock.value) return 'esp-card__status-bar--mock'
  return 'esp-card__status-bar--real'
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
            :to="`/mock-esp/${espId}`"
            class="esp-card__id"
          >
            {{ espId }}
          </RouterLink>
          
          <Badge :variant="isMock ? 'mock' : 'real'" size="sm">
            {{ isMock ? 'MOCK' : 'REAL' }}
          </Badge>
        </div>
        
        <div class="esp-card__status-badges">
          <Badge 
            :variant="stateInfo.variant as any" 
            :pulse="isOnline && esp.system_state === 'OPERATIONAL'"
            :dot="true"
            size="sm"
          >
            {{ stateInfo.label }}
          </Badge>
          
          <Badge v-if="hasEmergencyStopped" variant="danger" size="sm">
            E-STOP
          </Badge>
        </div>
      </div>
      
      <!-- Info rows -->
      <div class="esp-card__info">
        <div class="esp-card__info-row">
          <span class="esp-card__info-label">Zone</span>
          <span class="esp-card__info-value">
            {{ esp.zone_name || esp.zone_id || 'Nicht zugewiesen' }}
          </span>
        </div>
        
        <div class="esp-card__info-row">
          <span class="esp-card__info-label">Sensoren</span>
          <span class="esp-card__info-value">{{ esp.sensors?.length ?? 0 }}</span>
        </div>
        
        <div class="esp-card__info-row">
          <span class="esp-card__info-label">Aktoren</span>
          <span class="esp-card__info-value">{{ esp.actuators?.length ?? 0 }}</span>
        </div>
        
        <div class="esp-card__info-row">
          <span class="esp-card__info-label">Uptime</span>
          <span class="esp-card__info-value">{{ formatUptimeShort(esp.uptime) }}</span>
        </div>
        
        <div class="esp-card__info-row">
          <span class="esp-card__info-label">Heap</span>
          <span class="esp-card__info-value">{{ formatHeapSize(esp.heap_free) }}</span>
        </div>
        
        <div v-if="esp.last_heartbeat" class="esp-card__info-row">
          <span class="esp-card__info-label">Letzter Heartbeat</span>
          <span class="esp-card__info-value" :title="esp.last_heartbeat">
            {{ formatRelativeTime(esp.last_heartbeat) }}
          </span>
        </div>
      </div>
      
      <!-- Auto-heartbeat indicator -->
      <div v-if="isMock" class="esp-card__auto-heartbeat">
        <span :class="['esp-card__auto-heartbeat-dot', esp.auto_heartbeat ? 'active' : '']" />
        <span class="esp-card__auto-heartbeat-text">
          Auto-Heartbeat {{ esp.auto_heartbeat ? 'aktiv' : 'inaktiv' }}
        </span>
      </div>
      
      <!-- Actions -->
      <div class="esp-card__actions">
        <!-- Always available: Details -->
        <RouterLink
          :to="`/mock-esp/${espId}`"
          class="btn-secondary btn-sm"
        >
          <ExternalLink class="w-4 h-4" />
          Details
        </RouterLink>
        
        <!-- Mock ESP specific actions -->
        <template v-if="isMock">
          <button
            class="btn-ghost btn-sm"
            @click="emit('heartbeat', espId)"
            title="Heartbeat senden"
          >
            <Heart class="w-4 h-4" />
          </button>
          
          <button
            :class="['btn-ghost btn-sm', esp.system_state === 'SAFE_MODE' ? 'text-warning' : '']"
            @click="emit('toggleSafeMode', espId)"
            :title="esp.system_state === 'SAFE_MODE' ? 'Sicherheitsmodus beenden' : 'Sicherheitsmodus aktivieren'"
          >
            <AlertTriangle class="w-4 h-4" />
          </button>
          
          <button
            class="btn-ghost btn-sm text-error hover:bg-danger/10"
            @click="emit('delete', espId)"
            title="Löschen"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </template>
        
        <!-- Real ESP specific actions (for future use) -->
        <template v-else>
          <button
            class="btn-ghost btn-sm"
            title="Konfigurieren"
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

/* Content area */
.esp-card__content {
  flex: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Header */
.esp-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.esp-card__id-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.esp-card__id {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: var(--color-text-primary);
  text-decoration: none;
  transition: color 0.2s;
}

.esp-card__id:hover {
  color: var(--color-iridescent-1);
}

.esp-card__status-badges {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Info rows */
.esp-card__info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.esp-card__info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.esp-card__info-label {
  color: var(--color-text-muted);
}

.esp-card__info-value {
  color: var(--color-text-primary);
  font-weight: 500;
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

/* Actions */
.esp-card__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--glass-border);
  margin-top: auto;
}
</style>





