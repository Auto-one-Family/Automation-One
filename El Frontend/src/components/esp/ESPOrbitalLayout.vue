<script setup lang="ts">
/**
 * ESPOrbitalLayout Component
 * 
 * Displays sensors and actuators in an orbital layout around the central ESP card.
 * 
 * Features:
 * - Circular arrangement: sensors left (180°-360°), actuators right (0°-180°)
 * - Dynamic radius based on item count
 * - Responsive: mobile = linear, tablet/desktop = orbital
 * - Position tracking for ConnectionLines
 * - Click to select/highlight satellites
 */

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, Wifi, Activity } from 'lucide-vue-next'
import ESPCard from './ESPCard.vue'
import SensorSatellite from './SensorSatellite.vue'
import ActuatorSatellite from './ActuatorSatellite.vue'
import ConnectionLines from './ConnectionLines.vue'
import Badge from '@/components/common/Badge.vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator, QualityLevel } from '@/types'
import { espApi } from '@/api/esp'
import { getStateInfo } from '@/utils/labels'

interface Props {
  /** The ESP device data */
  device: ESPDevice
  /** Whether to show connection lines (default: true) */
  showConnections?: boolean
  /** Compact mode for dashboard view (default: false) */
  compactMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showConnections: true,
  compactMode: false
})

const router = useRouter()

const emit = defineEmits<{
  sensorClick: [gpio: number]
  actuatorClick: [gpio: number]
}>()

// =============================================================================
// Refs
// =============================================================================
const containerRef = ref<HTMLElement | null>(null)
const centerRef = ref<HTMLElement | null>(null)
const isDesktop = ref(true)

// Selected satellite state
const selectedGpio = ref<number | null>(null)
const selectedType = ref<'sensor' | 'actuator' | null>(null)

// =============================================================================
// Computed: Device Data
// =============================================================================
const sensors = computed<MockSensor[]>(() => {
  return (props.device?.sensors as MockSensor[]) || []
})

const actuators = computed<MockActuator[]>(() => {
  return (props.device?.actuators as MockActuator[]) || []
})

const espId = computed(() => {
  return props.device?.esp_id || props.device?.device_id || ''
})

const isMock = computed(() => {
  return espApi.isMockEsp(espId.value)
})

const isOnline = computed(() => {
  return props.device?.status === 'online' || props.device?.connected === true
})

const systemState = computed(() => {
  if (isMock.value && 'system_state' in props.device) {
    return (props.device as any).system_state
  }
  return props.device?.status || 'unknown'
})

const stateInfo = computed(() => {
  if (isMock.value) {
    return getStateInfo(systemState.value)
  }
  const status = props.device?.status || 'unknown'
  if (status === 'online') return { label: 'Online', variant: 'success' }
  if (status === 'offline') return { label: 'Offline', variant: 'gray' }
  if (status === 'error') return { label: 'Error', variant: 'danger' }
  return { label: 'Unknown', variant: 'gray' }
})

const totalItems = computed(() => {
  return sensors.value.length + actuators.value.length
})

// Navigation to detail view
function goToDetails() {
  router.push(`/devices/${espId.value}`)
}

// =============================================================================
// Computed: Orbital Layout
// =============================================================================

/**
 * Dynamic orbital radius based on number of items
 * In compact mode, use larger radius to prevent overlap
 */
const orbitalRadius = computed(() => {
  // Compact mode needs MORE space, not less, to avoid overlap
  const baseRadius = props.compactMode ? 1.4 : 1.0
  if (totalItems.value <= 2) return 180 * baseRadius
  if (totalItems.value <= 4) return 200 * baseRadius
  if (totalItems.value <= 8) return 240 * baseRadius
  if (totalItems.value <= 12) return 280 * baseRadius
  return 320 * baseRadius
})

/**
 * Calculate sensor positions (left semicircle: 180° to 360°)
 * Sensors are distributed evenly on the left half
 */
const sensorPositions = computed(() => {
  const items = sensors.value
  const positions: Record<number, { x: number; y: number; angle: number }> = {}
  
  if (items.length === 0) return positions
  
  // Single sensor: position at top-left (225°)
  if (items.length === 1) {
    const angle = (5 * Math.PI) / 4 // 225°
    positions[items[0].gpio] = {
      x: Math.cos(angle) * orbitalRadius.value,
      y: Math.sin(angle) * orbitalRadius.value,
      angle
    }
    return positions
  }
  
  // Multiple sensors: distribute on left semicircle (180° to 360°)
  const startAngle = Math.PI // 180°
  const endAngle = 2 * Math.PI // 360°
  const angleStep = (endAngle - startAngle) / (items.length + 1)
  
  items.forEach((sensor, index) => {
    const angle = startAngle + angleStep * (index + 1)
    positions[sensor.gpio] = {
      x: Math.cos(angle) * orbitalRadius.value,
      y: Math.sin(angle) * orbitalRadius.value,
      angle
    }
  })
  
  return positions
})

/**
 * Calculate actuator positions (right semicircle: 0° to 180°)
 * Actuators are distributed evenly on the right half
 */
const actuatorPositions = computed(() => {
  const items = actuators.value
  const positions: Record<number, { x: number; y: number; angle: number }> = {}
  
  if (items.length === 0) return positions
  
  // Single actuator: position at top-right (-45° / 315°)
  if (items.length === 1) {
    const angle = -Math.PI / 4 // -45° (top-right)
    positions[items[0].gpio] = {
      x: Math.cos(angle) * orbitalRadius.value,
      y: Math.sin(angle) * orbitalRadius.value,
      angle
    }
    return positions
  }
  
  // Multiple actuators: distribute on right semicircle (0° to 180°)
  const startAngle = 0 // 0°
  const endAngle = Math.PI // 180°
  const angleStep = (endAngle - startAngle) / (items.length + 1)
  
  items.forEach((actuator, index) => {
    const angle = startAngle + angleStep * (index + 1)
    positions[actuator.gpio] = {
      x: Math.cos(angle) * orbitalRadius.value,
      y: Math.sin(angle) * orbitalRadius.value,
      angle
    }
  })
  
  return positions
})

// =============================================================================
// Computed: ConnectionLines
// =============================================================================

/**
 * Absolute positions for ConnectionLines
 * Keys: 'center', 'sensor-{gpio}', 'actuator-{gpio}'
 */
const absolutePositions = ref<Record<string, { x: number; y: number }>>({})

/**
 * Connections array - currently empty, ready for Logic Rules integration
 */
const connections = computed(() => {
  // TODO: Logic Rules Integration (when Logic Store is available)
  // For now, return empty array
  return []
})

// =============================================================================
// Position Tracking
// =============================================================================

/**
 * Update absolute positions for ConnectionLines
 * Called on mount, resize, and device changes
 */
function updateAbsolutePositions() {
  if (!containerRef.value || !centerRef.value || !isDesktop.value) {
    absolutePositions.value = {}
    return
  }
  
  try {
    const containerRect = containerRef.value.getBoundingClientRect()
    const centerRect = centerRef.value.getBoundingClientRect()
    
    const centerX = centerRect.left - containerRect.left + centerRect.width / 2
    const centerY = centerRect.top - containerRect.top + centerRect.height / 2
    
    const positions: Record<string, { x: number; y: number }> = {}
    
    // Center position
    positions['center'] = { x: centerX, y: centerY }
    
    // Sensor positions
    for (const [gpio, pos] of Object.entries(sensorPositions.value)) {
      positions[`sensor-${gpio}`] = {
        x: centerX + pos.x,
        y: centerY + pos.y
      }
    }
    
    // Actuator positions
    for (const [gpio, pos] of Object.entries(actuatorPositions.value)) {
      positions[`actuator-${gpio}`] = {
        x: centerX + pos.x,
        y: centerY + pos.y
      }
    }
    
    absolutePositions.value = positions
  } catch (error) {
    console.error('[ESPOrbitalLayout] Error calculating positions:', error)
    absolutePositions.value = {}
  }
}

/**
 * Debounced resize handler
 */
let resizeTimeout: ReturnType<typeof setTimeout> | null = null

function handleResize() {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  resizeTimeout = setTimeout(() => {
    checkBreakpoint()
    updateAbsolutePositions()
  }, 100)
}

/**
 * Check if we're on desktop (>= 768px)
 */
function checkBreakpoint() {
  isDesktop.value = window.innerWidth >= 768
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleSensorClick(gpio: number) {
  if (selectedGpio.value === gpio && selectedType.value === 'sensor') {
    selectedGpio.value = null
    selectedType.value = null
  } else {
    selectedGpio.value = gpio
    selectedType.value = 'sensor'
  }
  emit('sensorClick', gpio)
}

function handleActuatorClick(gpio: number) {
  if (selectedGpio.value === gpio && selectedType.value === 'actuator') {
    selectedGpio.value = null
    selectedType.value = null
  } else {
    selectedGpio.value = gpio
    selectedType.value = 'actuator'
  }
  emit('actuatorClick', gpio)
}

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  checkBreakpoint()
  window.addEventListener('resize', handleResize)
  
  // Update positions after DOM is ready
  nextTick(() => {
    updateAbsolutePositions()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
})

// Watch for device changes
watch(() => props.device, () => {
  nextTick(() => {
    updateAbsolutePositions()
  })
}, { deep: true })

// Watch for breakpoint changes
watch(isDesktop, () => {
  nextTick(() => {
    updateAbsolutePositions()
  })
})
</script>

<template>
  <div 
    ref="containerRef" 
    class="esp-orbital-layout"
    :class="{ 'esp-orbital-layout--has-items': totalItems > 0 }"
    :style="{
      '--orbital-radius': `${orbitalRadius}px`,
      '--container-size': `${orbitalRadius * 2 + 250}px`
    }"
  >
    <!-- SVG Connection Lines (Background Layer) -->
    <ConnectionLines
      v-if="showConnections && isDesktop && connections.length > 0"
      :connections="connections"
      :positions="absolutePositions"
      class="esp-orbital-layout__connections"
    />
    
    <!-- Central ESP Info -->
    <div ref="centerRef" class="esp-orbital-layout__center">
      <!-- Compact Mode: Simple Info Card -->
      <div v-if="compactMode" class="esp-info-compact">
        <div class="esp-info-compact__header">
          <div class="esp-info-compact__title-group">
            <h3 class="esp-info-compact__title">{{ espId }}</h3>
            <Badge :variant="isMock ? 'mock' : 'real'" size="xs">
              {{ isMock ? 'MOCK' : 'REAL' }}
            </Badge>
          </div>
          <Badge 
            :variant="stateInfo.variant as any" 
            :pulse="isOnline && (systemState === 'OPERATIONAL' || device.status === 'online')"
            dot
            size="sm"
          >
            {{ stateInfo.label }}
          </Badge>
        </div>
        
        <div class="esp-info-compact__stats">
          <div class="esp-info-compact__stat">
            <span class="esp-info-compact__stat-label">Zone</span>
            <span class="esp-info-compact__stat-value">{{ device.zone_name || device.zone_id || '-' }}</span>
          </div>
          <div class="esp-info-compact__stat">
            <Activity class="w-3 h-3" style="color: var(--color-text-muted)" />
            <span class="esp-info-compact__stat-value">{{ sensors.length }} / {{ actuators.length }}</span>
          </div>
          <div v-if="device.wifi_rssi !== undefined" class="esp-info-compact__stat">
            <Wifi class="w-3 h-3" style="color: var(--color-text-muted)" />
            <span class="esp-info-compact__stat-value">{{ device.wifi_rssi }} dBm</span>
          </div>
        </div>
        
        <button class="esp-info-compact__details-btn" @click="goToDetails">
          <ExternalLink class="w-4 h-4" />
          <span>Details & Management</span>
        </button>
      </div>
      
      <!-- Full Mode: Full ESP Card (for detail view) -->
      <ESPCard v-else :esp="device" />
    </div>
    
    <!-- Sensor Satellites -->
    <div 
      v-if="sensors.length > 0"
      class="esp-orbital-layout__satellites esp-orbital-layout__satellites--sensors"
    >
      <SensorSatellite
        v-for="sensor in sensors"
        :key="`sensor-${sensor.gpio}`"
        :esp-id="espId"
        :gpio="sensor.gpio"
        :sensor-type="sensor.sensor_type"
        :name="sensor.name"
        :value="sensor.raw_value"
        :quality="sensor.quality as QualityLevel"
        :unit="sensor.unit"
        :selected="selectedGpio === sensor.gpio && selectedType === 'sensor'"
        :show-connections="showConnections"
        :style="isDesktop ? {
          '--orbital-x': `${sensorPositions[sensor.gpio]?.x || 0}px`,
          '--orbital-y': `${sensorPositions[sensor.gpio]?.y || 0}px`,
        } : undefined"
        :class="{ 'esp-orbital-layout__satellite--orbital': isDesktop }"
        class="esp-orbital-layout__satellite"
        @click="handleSensorClick(sensor.gpio)"
      />
    </div>
    
    <!-- Actuator Satellites -->
    <div 
      v-if="actuators.length > 0"
      class="esp-orbital-layout__satellites esp-orbital-layout__satellites--actuators"
    >
      <ActuatorSatellite
        v-for="actuator in actuators"
        :key="`actuator-${actuator.gpio}`"
        :esp-id="espId"
        :gpio="actuator.gpio"
        :actuator-type="actuator.actuator_type"
        :name="actuator.name"
        :state="actuator.state"
        :pwm-value="actuator.pwm_value"
        :emergency-stopped="actuator.emergency_stopped"
        :selected="selectedGpio === actuator.gpio && selectedType === 'actuator'"
        :show-connections="showConnections"
        :style="isDesktop ? {
          '--orbital-x': `${actuatorPositions[actuator.gpio]?.x || 0}px`,
          '--orbital-y': `${actuatorPositions[actuator.gpio]?.y || 0}px`,
        } : undefined"
        :class="{ 'esp-orbital-layout__satellite--orbital': isDesktop }"
        class="esp-orbital-layout__satellite"
        @click="handleActuatorClick(actuator.gpio)"
      />
    </div>
    
    <!-- Empty State (no sensors/actuators) -->
    <div v-if="totalItems === 0" class="esp-orbital-layout__empty">
      <p class="esp-orbital-layout__empty-text">
        Keine Sensoren oder Aktoren konfiguriert
      </p>
    </div>
  </div>
</template>

<style scoped>
/* =============================================================================
   Compact ESP Info Card
   ============================================================================= */
.esp-info-compact {
  width: 100%;
  max-width: 280px;
  background-color: var(--color-bg-secondary);
  border: 3px solid var(--glass-border);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: all 0.2s;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
}

.esp-info-compact:hover {
  border-color: var(--color-iridescent-1);
  box-shadow: 0 12px 32px rgba(167, 139, 250, 0.5);
  transform: scale(1.02);
}

.esp-info-compact__header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.esp-info-compact__title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.esp-info-compact__title {
  font-size: 0.875rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-primary);
  word-break: break-all;
}

.esp-info-compact__stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.5rem;
}

.esp-info-compact__stat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.esp-info-compact__stat-label {
  color: var(--color-text-muted);
  min-width: 50px;
}

.esp-info-compact__stat-value {
  color: var(--color-text-primary);
  font-weight: 500;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}

.esp-info-compact__details-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-2));
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(167, 139, 250, 0.3);
}

.esp-info-compact__details-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
}

.esp-info-compact__details-btn:active {
  transform: translateY(0);
}

/* =============================================================================
   Base Layout (Mobile-First)
   ============================================================================= */
.esp-orbital-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem;
  min-height: 300px;
  isolation: isolate; /* Create stacking context */
}

.esp-orbital-layout__center {
  position: relative;
  z-index: 5;
  width: 100%;
  max-width: 400px;
  pointer-events: auto;
}

.esp-orbital-layout__satellites {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  width: 100%;
}

.esp-orbital-layout__satellites--sensors {
  order: -1; /* Sensors above center on mobile */
}

.esp-orbital-layout__satellites--actuators {
  order: 1; /* Actuators below center on mobile */
}

.esp-orbital-layout__satellite {
  flex-shrink: 0;
  z-index: 10;
  position: relative;
}

.esp-orbital-layout__connections {
  display: none; /* Hidden on mobile */
  z-index: 1;
}

.esp-orbital-layout__empty {
  padding: 2rem;
  text-align: center;
}

.esp-orbital-layout__empty-text {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

/* =============================================================================
   Tablet Layout (768px+)
   ============================================================================= */
@media (min-width: 768px) {
  .esp-orbital-layout {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    min-height: calc(var(--container-size, 500px) + 2rem);
    padding: 3rem;
    gap: 0;
  }

  .esp-orbital-layout--has-items {
    /* When we have satellites, position relatively for orbital layout */
    position: relative;
    min-height: calc(var(--container-size, 600px) + 4rem);
  }

  .esp-orbital-layout__center {
    position: relative;
    z-index: 5;
    max-width: none;
    width: auto;
  }

  .esp-orbital-layout__satellites {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    pointer-events: none;
    display: block;
    z-index: 10;
  }

  .esp-orbital-layout__satellites--sensors,
  .esp-orbital-layout__satellites--actuators {
    order: 0;
  }

  .esp-orbital-layout__satellite--orbital {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(
      calc(-50% + var(--orbital-x, 0px)),
      calc(-50% + var(--orbital-y, 0px))
    );
    pointer-events: auto;
    transition: transform 0.3s ease, box-shadow 0.2s ease, z-index 0s;
    z-index: 10;
  }

  .esp-orbital-layout__satellite--orbital:hover {
    z-index: 20;
    transform: translate(
      calc(-50% + var(--orbital-x, 0px)),
      calc(-50% + var(--orbital-y, 0px))
    ) scale(1.05);
  }

  .esp-orbital-layout__connections {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }
}

/* =============================================================================
   Desktop Layout (1024px+)
   ============================================================================= */
@media (min-width: 1024px) {
  .esp-orbital-layout {
    min-height: calc(var(--container-size, 600px) + 2rem);
    padding: 3rem;
  }

  .esp-orbital-layout__satellite--orbital {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), 
                box-shadow 0.2s ease,
                border-color 0.2s ease;
  }
}

/* =============================================================================
   Section Labels (Optional Visual Enhancement)
   ============================================================================= */
@media (min-width: 768px) {
  .esp-orbital-layout__satellites--sensors::before,
  .esp-orbital-layout__satellites--actuators::before {
    position: absolute;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .esp-orbital-layout__satellites--sensors::before {
    content: 'Sensoren';
    left: calc(-1 * var(--orbital-radius, 150px) - 2rem);
    top: 50%;
    transform: translateY(-50%) rotate(-90deg);
    transform-origin: center center;
  }

  .esp-orbital-layout__satellites--actuators::before {
    content: 'Aktoren';
    right: calc(-1 * var(--orbital-radius, 150px) - 2rem);
    top: 50%;
    transform: translateY(-50%) rotate(90deg);
    transform-origin: center center;
  }
}

/* =============================================================================
   Animations
   ============================================================================= */
@keyframes satellite-appear {
  from {
    opacity: 0;
    transform: translate(
      calc(-50% + var(--orbital-x, 0px) * 0.5),
      calc(-50% + var(--orbital-y, 0px) * 0.5)
    ) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translate(
      calc(-50% + var(--orbital-x, 0px)),
      calc(-50% + var(--orbital-y, 0px))
    ) scale(1);
  }
}

@media (min-width: 768px) {
  .esp-orbital-layout__satellite--orbital {
    animation: satellite-appear 0.4s ease-out forwards;
    animation-delay: calc(var(--satellite-index, 0) * 0.05s);
  }
}
</style>

