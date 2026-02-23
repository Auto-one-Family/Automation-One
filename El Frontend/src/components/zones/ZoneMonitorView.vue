<script setup lang="ts">
/**
 * ZoneMonitorView Component
 *
 * Level 2: Sensor+Actuator-centric zone view.
 * Shows all sensors and actuators from all devices in the zone,
 * grouped by subzone.
 *
 * Replaces the device-centric ZoneDetailView for Level 2.
 */

import { computed } from 'vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator } from '@/types'
import { useEspStore } from '@/stores/esp'
import { useLogicStore } from '@/shared/stores/logic.store'
import { ArrowLeft, Cpu, Thermometer, Zap } from 'lucide-vue-next'
import SensorSatellite from '@/components/esp/SensorSatellite.vue'
import ActuatorSatellite from '@/components/esp/ActuatorSatellite.vue'

interface Props {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'device-click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'back'): void
  (e: 'heartbeat', deviceId: string): void
  (e: 'delete', deviceId: string): void
  (e: 'settings', device: ESPDevice): void
}>()

const espStore = useEspStore()
const logicStore = useLogicStore()

// ═══════════════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════════════

const totalSensors = computed(() =>
  props.devices.reduce((sum, d) => {
    const sensors = d.sensors as MockSensor[] | undefined
    return sum + (sensors?.length ?? d.sensor_count ?? 0)
  }, 0)
)

const totalActuators = computed(() =>
  props.devices.reduce((sum, d) => {
    const actuators = d.actuators as MockActuator[] | undefined
    return sum + (actuators?.length ?? d.actuator_count ?? 0)
  }, 0)
)

/** Cross-ESP connections in this zone */
const crossEspCount = computed(() => {
  return logicStore.crossEspConnections.filter(conn => {
    const sourceDevice = espStore.devices.find(d => espStore.getDeviceId(d) === conn.sourceEspId)
    const targetDevice = espStore.devices.find(d => espStore.getDeviceId(d) === conn.targetEspId)
    return sourceDevice?.zone_id === props.zoneId || targetDevice?.zone_id === props.zoneId
  }).length
})

// ═══════════════════════════════════════════════════════════════════════════
// Subzone Grouping with Sensors & Actuators extracted
// ═══════════════════════════════════════════════════════════════════════════

interface DeviceWithComponents {
  deviceId: string
  deviceName: string
  isMock: boolean
  sensors: MockSensor[]
  actuators: MockActuator[]
}

interface SubzoneGroup {
  subzoneId: string | null
  subzoneName: string
  devices: DeviceWithComponents[]
  sensorCount: number
  actuatorCount: number
}

const subzoneGroups = computed((): SubzoneGroup[] => {
  const groups = new Map<string | null, SubzoneGroup>()

  for (const device of props.devices) {
    const szId = device.subzone_id || null
    const deviceId = espStore.getDeviceId(device)

    if (!groups.has(szId)) {
      groups.set(szId, {
        subzoneId: szId,
        subzoneName: device.subzone_name || (szId ? szId : 'Nicht zugeordnet'),
        devices: [],
        sensorCount: 0,
        actuatorCount: 0,
      })
    }

    const sensors = (device.sensors as MockSensor[] | undefined) || []
    const actuators = (device.actuators as MockActuator[] | undefined) || []

    const group = groups.get(szId)!
    group.devices.push({
      deviceId,
      deviceName: device.name || deviceId,
      isMock: espStore.isMock(deviceId),
      sensors,
      actuators,
    })
    group.sensorCount += sensors.length
    group.actuatorCount += actuators.length
  }

  const result = Array.from(groups.values())
  result.sort((a, b) => {
    if (a.subzoneId === null) return 1
    if (b.subzoneId === null) return -1
    return a.subzoneName.localeCompare(b.subzoneName)
  })
  return result
})

// ═══════════════════════════════════════════════════════════════════════════
// Device Label Click → emit device-click to parent
// ═══════════════════════════════════════════════════════════════════════════

function onDeviceLabelClick(deviceId: string, event: Event) {
  const el = (event.currentTarget || event.target) as HTMLElement
  const rect = el.getBoundingClientRect()
  emit('device-click', { deviceId, originRect: rect })
}
</script>

<template>
  <div class="zone-monitor">
    <!-- Back Navigation Strip -->
    <nav class="zone-monitor__nav" aria-label="Zoom-Navigation">
      <button class="zone-monitor__back" @click="emit('back')">
        <ArrowLeft class="zone-monitor__back-icon" />
        <span>Übersicht</span>
      </button>
      <span class="zone-monitor__nav-sep">/</span>
      <span class="zone-monitor__nav-current">{{ zoneName }}</span>
    </nav>

    <!-- Zone Header -->
    <div class="zone-monitor__header">
      <h2 class="zone-monitor__title">{{ zoneName }}</h2>
      <div class="zone-monitor__meta">
        <span class="zone-monitor__stat">
          <Cpu class="zone-monitor__stat-icon" />
          {{ devices.length }} Geräte
        </span>
        <span class="zone-monitor__stat">
          <Thermometer class="zone-monitor__stat-icon" />
          {{ totalSensors }} Sensoren
        </span>
        <span class="zone-monitor__stat">
          <Zap class="zone-monitor__stat-icon" />
          {{ totalActuators }} Aktoren
        </span>
      </div>
      <RouterLink
        v-if="crossEspCount > 0"
        to="/logic"
        class="zone-monitor__cross-esp-badge"
      >
        {{ crossEspCount }} Cross-ESP Regeln aktiv
      </RouterLink>
    </div>

    <!-- Sensor + Actuator Grid (per subzone) -->
    <div class="zone-monitor__components">
      <section
        v-for="group in subzoneGroups"
        :key="group.subzoneId ?? '__none'"
        class="zone-monitor__subzone"
      >
        <!-- Subzone Header -->
        <div class="zone-monitor__subzone-header">
          <div class="zone-monitor__subzone-accent" />
          <h3 class="zone-monitor__subzone-name">{{ group.subzoneName }}</h3>
          <div class="zone-monitor__subzone-counts">
            <span v-if="group.sensorCount > 0" class="zone-monitor__subzone-count">
              {{ group.sensorCount }} S
            </span>
            <span v-if="group.actuatorCount > 0" class="zone-monitor__subzone-count zone-monitor__subzone-count--actuator">
              {{ group.actuatorCount }} A
            </span>
          </div>
        </div>

        <!-- Per device within subzone -->
        <div
          v-for="device in group.devices"
          :key="device.deviceId"
          class="zone-monitor__device-section"
        >
          <div
            class="zone-monitor__device-label zone-monitor__device-label--clickable"
            role="button"
            tabindex="0"
            :title="`${device.deviceName} — Details öffnen`"
            @click="onDeviceLabelClick(device.deviceId, $event)"
            @keydown.enter="onDeviceLabelClick(device.deviceId, $event)"
          >
            <Cpu class="zone-monitor__device-label-icon" />
            <span>{{ device.deviceName }}</span>
            <span v-if="device.isMock" class="zone-monitor__mock-badge">MOCK</span>
          </div>

          <!-- Sensors from this device -->
          <div v-if="device.sensors.length > 0" class="zone-monitor__card-grid">
            <SensorSatellite
              v-for="sensor in device.sensors"
              :key="`${device.deviceId}-s-${sensor.gpio}`"
              :esp-id="device.deviceId"
              :gpio="sensor.gpio"
              :sensor-type="sensor.sensor_type"
              :name="sensor.name"
              :value="sensor.raw_value"
              :quality="sensor.quality"
              :unit="sensor.unit"
              :draggable="true"
            />
          </div>

          <!-- Actuators from this device -->
          <div v-if="device.actuators.length > 0" class="zone-monitor__card-grid zone-monitor__card-grid--actuators">
            <ActuatorSatellite
              v-for="actuator in device.actuators"
              :key="`${device.deviceId}-a-${actuator.gpio}`"
              :esp-id="device.deviceId"
              :gpio="actuator.gpio"
              :actuator-type="actuator.actuator_type"
              :name="actuator.name"
              :state="actuator.state"
              :pwm-value="actuator.pwm_value"
              :emergency-stopped="actuator.emergency_stopped"
              :draggable="true"
            />
          </div>

          <!-- Empty device (no sensors/actuators) -->
          <div
            v-if="device.sensors.length === 0 && device.actuators.length === 0"
            class="zone-monitor__device-empty"
          >
            Keine Sensoren oder Aktoren konfiguriert
          </div>
        </div>
      </section>
    </div>

    <!-- Empty state (no devices at all) -->
    <div v-if="devices.length === 0" class="zone-monitor__empty">
      <p>Keine Geräte in dieser Zone.</p>
      <p class="zone-monitor__empty-hint">Ziehe Geräte hierher, um sie zuzuweisen.</p>
    </div>

    <!-- Automation rules link (only shown when cross-ESP connections exist) -->
    <RouterLink
      v-if="crossEspCount > 0"
      to="/logic"
      class="zone-monitor__rules-link"
    >
      Regeln verwalten →
    </RouterLink>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   ZoneMonitorView — Sensor+Actuator-centric Level 2
   Mission Control Glassmorphism Theme
   ═══════════════════════════════════════════════════════════════════════════ */

.zone-monitor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: linear-gradient(180deg, var(--color-bg-level-2), rgba(13, 13, 22, 0.8));
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  min-height: 300px;
}

/* ── Back Navigation Strip ── */
.zone-monitor__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  margin-bottom: var(--space-1);
}

.zone-monitor__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--text-sm);
  font-weight: 500;
}

.zone-monitor__back:hover {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
  background: var(--glass-bg-light);
  transform: translateX(-2px);
}

.zone-monitor__back-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.zone-monitor__nav-sep {
  color: var(--color-text-muted);
  opacity: 0.4;
}

.zone-monitor__nav-current {
  color: var(--color-text-primary);
  font-weight: 600;
}

/* ── Zone Header ── */
.zone-monitor__header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.zone-monitor__title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  position: relative;
  padding-bottom: 6px;
}

.zone-monitor__title::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 60px;
  height: 2px;
  background: var(--gradient-iridescent);
  border-radius: 1px;
}

.zone-monitor__meta {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.zone-monitor__stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.zone-monitor__stat-icon {
  width: 13px;
  height: 13px;
  opacity: 0.6;
  flex-shrink: 0;
}

.zone-monitor__cross-esp-badge {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.08);
  border: 1px solid rgba(96, 165, 250, 0.15);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  text-decoration: none;
  transition: all var(--transition-fast);
}

.zone-monitor__cross-esp-badge:hover {
  background: rgba(96, 165, 250, 0.15);
  color: var(--color-iridescent-2);
}

/* ── Components Area ── */
.zone-monitor__components {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ── Subzone Section ── */
.zone-monitor__subzone {
  background: var(--glass-bg-light);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.zone-monitor__subzone-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.zone-monitor__subzone-accent {
  width: 3px;
  height: 16px;
  border-radius: 2px;
  background: var(--gradient-iridescent);
  flex-shrink: 0;
}

.zone-monitor__subzone-name {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.zone-monitor__subzone-counts {
  display: flex;
  gap: var(--space-1);
}

.zone-monitor__subzone-count {
  font-size: 9px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-iridescent-1);
  background: rgba(96, 165, 250, 0.08);
  border: 1px solid rgba(96, 165, 250, 0.12);
  border-radius: var(--radius-full);
  padding: 1px 6px;
  white-space: nowrap;
}

.zone-monitor__subzone-count--actuator {
  color: var(--color-iridescent-4);
  background: rgba(192, 132, 252, 0.08);
  border-color: rgba(192, 132, 252, 0.12);
}

/* ── Per-Device Section ── */
.zone-monitor__device-section {
  background: var(--glass-bg);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}

.zone-monitor__device-section:last-child {
  margin-bottom: 0;
}

.zone-monitor__device-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.zone-monitor__device-label--clickable {
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  margin: calc(-1 * var(--space-1));
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-1);
}

.zone-monitor__device-label--clickable:hover {
  background: rgba(96, 165, 250, 0.06);
  border-bottom-color: rgba(96, 165, 250, 0.15);
  color: var(--color-text-secondary);
}

.zone-monitor__device-label--clickable:hover .zone-monitor__device-label-icon {
  opacity: 0.8;
  color: var(--color-accent-bright);
}

.zone-monitor__device-label--clickable:focus-visible {
  outline: 2px solid var(--color-accent-bright);
  outline-offset: 2px;
}

.zone-monitor__device-label-icon {
  width: 12px;
  height: 12px;
  opacity: 0.5;
  flex-shrink: 0;
  transition: opacity var(--transition-fast), color var(--transition-fast);
}

.zone-monitor__mock-badge {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-mock);
  background: rgba(167, 139, 250, 0.1);
  border: 1px solid rgba(167, 139, 250, 0.15);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  margin-left: auto;
}

/* ── Sensor/Actuator Card Grid ── */
.zone-monitor__card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.zone-monitor__card-grid:last-child {
  margin-bottom: 0;
}

.zone-monitor__card-grid--actuators {
  grid-template-columns: repeat(auto-fill, minmax(90px, 130px));
}

.zone-monitor__device-empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  opacity: 0.6;
  text-align: center;
  padding: var(--space-2);
}

/* ── Empty State ── */
.zone-monitor__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-muted);
  background: var(--glass-bg);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
}

.zone-monitor__empty p {
  margin: 0;
}

.zone-monitor__empty-hint {
  font-size: var(--text-sm);
  opacity: 0.7;
  margin-top: var(--space-2);
}

/* ── Rules Link ── */
.zone-monitor__rules-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-accent-bright);
  text-decoration: none;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.zone-monitor__rules-link:hover {
  background: rgba(96, 165, 250, 0.08);
  color: var(--color-iridescent-2);
}

/* ── Mobile Responsive ── */
@media (max-width: 640px) {
  .zone-monitor {
    padding: var(--space-4);
  }

  .zone-monitor__header {
    flex-direction: column;
    gap: var(--space-1);
  }

  .zone-monitor__cross-esp-badge {
    margin-left: 0;
  }

  .zone-monitor__meta {
    gap: var(--space-2);
  }

  .zone-monitor__card-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }

  .zone-monitor__card-grid--actuators {
    grid-template-columns: repeat(auto-fill, minmax(80px, 110px));
  }
}
</style>
