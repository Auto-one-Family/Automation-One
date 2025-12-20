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
import ESPCard from './ESPCard.vue'
import SensorSatellite from './SensorSatellite.vue'
import ActuatorSatellite from './ActuatorSatellite.vue'
import ConnectionLines from './ConnectionLines.vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator, QualityLevel } from '@/types'

interface Props {
  /** The ESP device data */
  device: ESPDevice
  /** Whether to show connection lines (default: true) */
  showConnections?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showConnections: true
})

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

const totalItems = computed(() => {
  return sensors.value.length + actuators.value.length
})

// =============================================================================
// Computed: Orbital Layout
// =============================================================================

/**
 * Dynamic orbital radius based on number of items
 * - ≤4 items: 150px
 * - ≤8 items: 200px
 * - >8 items: 250px
 * - >12 items: 300px
 */
const orbitalRadius = computed(() => {
  if (totalItems.value <= 4) return 150
  if (totalItems.value <= 8) return 200
  if (totalItems.value <= 12) return 250
  return 300
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
    
    <!-- Central ESP Card -->
    <div ref="centerRef" class="esp-orbital-layout__center">
      <ESPCard :esp="device" />
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
}

.esp-orbital-layout__center {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 400px;
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
}

.esp-orbital-layout__connections {
  display: none; /* Hidden on mobile */
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
    padding: 2rem;
    gap: 0;
  }

  .esp-orbital-layout--has-items {
    /* When we have satellites, position relatively for orbital layout */
    position: relative;
  }

  .esp-orbital-layout__center {
    position: relative;
    z-index: 2;
    max-width: none;
    width: auto;
  }

  .esp-orbital-layout__satellites {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: auto;
    pointer-events: none;
    display: block;
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
    transition: transform 0.3s ease, box-shadow 0.2s ease;
  }

  .esp-orbital-layout__satellite--orbital:hover {
    z-index: 10;
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

