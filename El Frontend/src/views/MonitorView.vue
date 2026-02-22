<script setup lang="ts">
/**
 * MonitorView — Sensor & Actuator Data View
 *
 * Route: /monitor, /monitor/:zoneId
 *
 * Shows pure sensor and actuator data organized by zones (NOT by ESPs).
 * Level 1: Zone tiles with KPI aggregation
 * Level 2: Sensor/Actuator cards with live data
 *
 * This view is for operational monitoring — daily checks,
 * threshold monitoring, manual actuator control.
 */

import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useZoneDragDrop, ZONE_UNASSIGNED } from '@/composables'
import { ArrowLeft, Thermometer, Droplets, Zap, Activity, AlertTriangle } from 'lucide-vue-next'
import type { MockSensor, MockActuator } from '@/types'

const router = useRouter()
const route = useRoute()
const espStore = useEspStore()
const { groupDevicesByZone } = useZoneDragDrop()

const selectedZoneId = computed(() => (route.params.zoneId as string) || null)
const isZoneDetail = computed(() => !!selectedZoneId.value)

// =============================================================================
// Level 1: Zone KPI Aggregation
// =============================================================================

interface ZoneKPI {
  zoneId: string
  zoneName: string
  sensorCount: number
  actuatorCount: number
  activeSensors: number
  activeActuators: number
  alarmCount: number
  avgTemperature: number | null
  avgHumidity: number | null
}

const zoneKPIs = computed<ZoneKPI[]>(() => {
  const groups = groupDevicesByZone(espStore.devices)
  return groups
    .filter(g => g.zoneId !== ZONE_UNASSIGNED)
    .map(group => {
      let sensorCount = 0
      let actuatorCount = 0
      let activeSensors = 0
      let activeActuators = 0
      let alarmCount = 0
      const temps: number[] = []
      const humidities: number[] = []

      for (const device of group.devices) {
        const sensors = (device.sensors as MockSensor[]) || []
        const actuators = (device.actuators as MockActuator[]) || []

        sensorCount += sensors.length
        actuatorCount += actuators.length
        activeSensors += sensors.filter(s => s.quality !== 'error' && s.quality !== 'stale').length
        activeActuators += actuators.filter(a => a.state).length
        alarmCount += sensors.filter(s => s.quality === 'error' || s.quality === 'bad').length

        for (const s of sensors) {
          if (s.sensor_type?.toLowerCase().includes('temperature') || s.sensor_type === 'DS18B20') {
            if (typeof s.raw_value === 'number') temps.push(s.raw_value)
          }
          if (s.sensor_type?.toLowerCase().includes('humidity') || s.sensor_type === 'SHT31_humidity') {
            if (typeof s.raw_value === 'number') humidities.push(s.raw_value)
          }
        }
      }

      return {
        zoneId: group.zoneId,
        zoneName: group.zoneName,
        sensorCount,
        actuatorCount,
        activeSensors,
        activeActuators,
        alarmCount,
        avgTemperature: temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
        avgHumidity: humidities.length > 0 ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null,
      }
    })
})

// =============================================================================
// Level 2: All sensors/actuators in selected zone
// =============================================================================

interface SensorItem {
  type: 'sensor'
  espId: string
  espName: string
  gpio: number
  sensorType: string
  name: string
  value: number
  unit: string
  quality: string
  lastRead: string | undefined
}

interface ActuatorItem {
  type: 'actuator'
  espId: string
  espName: string
  gpio: number
  actuatorType: string
  name: string
  state: boolean
  value?: number
}

const zoneSensors = computed<SensorItem[]>(() => {
  if (!selectedZoneId.value) return []
  const devices = espStore.devices.filter(d => d.zone_id === selectedZoneId.value)
  const items: SensorItem[] = []
  for (const device of devices) {
    const deviceId = espStore.getDeviceId(device)
    const sensors = (device.sensors as MockSensor[]) || []
    for (const s of sensors) {
      items.push({
        type: 'sensor',
        espId: deviceId,
        espName: device.name || deviceId,
        gpio: s.gpio,
        sensorType: s.sensor_type,
        name: s.name || s.sensor_type,
        value: s.raw_value ?? 0,
        unit: s.unit || '',
        quality: s.quality || 'good',
        lastRead: s.last_read,
      })
    }
  }
  return items
})

const zoneActuators = computed<ActuatorItem[]>(() => {
  if (!selectedZoneId.value) return []
  const devices = espStore.devices.filter(d => d.zone_id === selectedZoneId.value)
  const items: ActuatorItem[] = []
  for (const device of devices) {
    const deviceId = espStore.getDeviceId(device)
    const actuators = (device.actuators as MockActuator[]) || []
    for (const a of actuators) {
      items.push({
        type: 'actuator',
        espId: deviceId,
        espName: device.name || deviceId,
        gpio: a.gpio,
        actuatorType: a.actuator_type || 'relay',
        name: a.name || a.actuator_type || `Aktor GPIO ${a.gpio}`,
        state: !!a.state,
        value: a.pwm_value,
      })
    }
  }
  return items
})

const selectedZoneName = computed(() => {
  if (!selectedZoneId.value) return ''
  const device = espStore.devices.find(d => d.zone_id === selectedZoneId.value)
  return device?.zone_name || selectedZoneId.value
})

// =============================================================================
// Navigation
// =============================================================================

function goToZone(zoneId: string) {
  router.push({ name: 'monitor-zone', params: { zoneId } })
}

function goBack() {
  router.push({ name: 'monitor' })
}

// =============================================================================
// Actuator control
// =============================================================================

async function toggleActuator(item: ActuatorItem) {
  const command = item.state ? 'OFF' : 'ON'
  try {
    await espStore.sendActuatorCommand(item.espId, item.gpio, command)
  } catch {
    // Toast handled by store
  }
}

// Helpers
function formatValue(value: number, decimals = 1): string {
  return value.toFixed(decimals)
}

function qualityToStatus(quality: string): 'good' | 'warning' | 'alarm' | 'offline' {
  if (quality === 'good' || quality === 'excellent') return 'good'
  if (quality === 'fair') return 'warning'
  if (quality === 'poor' || quality === 'bad' || quality === 'error') return 'alarm'
  if (quality === 'stale') return 'offline'
  return 'good'
}
</script>

<template>
  <div class="monitor-view">
    <!-- Level 1: Zone Overview -->
    <template v-if="!isZoneDetail">
      <h2 class="monitor-view__title">Sensor & Aktor Monitoring</h2>
      <p class="monitor-view__subtitle">Echtzeit-Daten aller Zonen</p>

      <div v-if="zoneKPIs.length === 0" class="monitor-view__empty">
        <Activity class="w-12 h-12" style="color: var(--color-text-muted)" />
        <p>Keine Zonen mit Geräten vorhanden.</p>
      </div>

      <div v-else class="monitor-zone-grid">
        <div
          v-for="zone in zoneKPIs"
          :key="zone.zoneId"
          class="monitor-zone-tile"
          @click="goToZone(zone.zoneId)"
        >
          <div class="monitor-zone-tile__header">
            <h3 class="monitor-zone-tile__name">{{ zone.zoneName }}</h3>
            <span
              v-if="zone.alarmCount > 0"
              class="monitor-zone-tile__alarm-badge"
            >
              <AlertTriangle class="w-3 h-3" />
              {{ zone.alarmCount }}
            </span>
          </div>

          <div class="monitor-zone-tile__kpis">
            <div v-if="zone.avgTemperature !== null" class="monitor-zone-tile__kpi">
              <Thermometer class="w-4 h-4" style="color: var(--color-status-warning)" />
              <span class="monitor-zone-tile__kpi-value">{{ formatValue(zone.avgTemperature) }}°C</span>
            </div>
            <div v-if="zone.avgHumidity !== null" class="monitor-zone-tile__kpi">
              <Droplets class="w-4 h-4" style="color: var(--color-info)" />
              <span class="monitor-zone-tile__kpi-value">{{ formatValue(zone.avgHumidity) }}%</span>
            </div>
          </div>

          <div class="monitor-zone-tile__counts">
            <span>{{ zone.activeSensors }}/{{ zone.sensorCount }} Sensoren</span>
            <span>{{ zone.activeActuators }}/{{ zone.actuatorCount }} Aktoren</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Level 2: Zone Data Detail -->
    <template v-else>
      <div class="monitor-view__header">
        <button class="monitor-view__back" @click="goBack">
          <ArrowLeft class="w-4 h-4" />
          <span>Zurück</span>
        </button>
        <h2 class="monitor-view__title">{{ selectedZoneName }}</h2>
      </div>

      <!-- Sensors Section -->
      <section v-if="zoneSensors.length > 0" class="monitor-section">
        <h3 class="monitor-section__title">Sensoren ({{ zoneSensors.length }})</h3>
        <div class="monitor-card-grid">
          <div
            v-for="sensor in zoneSensors"
            :key="`${sensor.espId}-${sensor.gpio}`"
            :class="['monitor-sensor-card', `monitor-sensor-card--${qualityToStatus(sensor.quality)}`]"
          >
            <div class="monitor-sensor-card__header">
              <span class="monitor-sensor-card__name">{{ sensor.name }}</span>
              <span :class="['monitor-sensor-card__dot', `monitor-sensor-card__dot--${qualityToStatus(sensor.quality)}`]" />
            </div>
            <div class="monitor-sensor-card__value">
              <span class="monitor-sensor-card__number">{{ formatValue(sensor.value) }}</span>
              <span class="monitor-sensor-card__unit">{{ sensor.unit }}</span>
            </div>
            <div class="monitor-sensor-card__meta">
              <span>{{ sensor.espName }}</span>
              <span>GPIO {{ sensor.gpio }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Actuators Section -->
      <section v-if="zoneActuators.length > 0" class="monitor-section">
        <h3 class="monitor-section__title">Aktoren ({{ zoneActuators.length }})</h3>
        <div class="monitor-card-grid">
          <div
            v-for="actuator in zoneActuators"
            :key="`${actuator.espId}-${actuator.gpio}`"
            :class="['monitor-actuator-card', actuator.state ? 'monitor-actuator-card--on' : 'monitor-actuator-card--off']"
          >
            <div class="monitor-actuator-card__header">
              <span class="monitor-actuator-card__name">{{ actuator.name }}</span>
              <button
                class="monitor-actuator-card__toggle"
                :class="{ 'monitor-actuator-card__toggle--on': actuator.state }"
                @click.stop="toggleActuator(actuator)"
              >
                {{ actuator.state ? 'AUS' : 'EIN' }}
              </button>
            </div>
            <div class="monitor-actuator-card__status">
              <Zap class="w-4 h-4" />
              <span>{{ actuator.state ? 'Aktiv' : 'Inaktiv' }}</span>
            </div>
            <div class="monitor-actuator-card__meta">
              <span>{{ actuator.espName }}</span>
              <span>GPIO {{ actuator.gpio }}</span>
            </div>
          </div>
        </div>
      </section>

      <div v-if="zoneSensors.length === 0 && zoneActuators.length === 0" class="monitor-view__empty">
        <Activity class="w-12 h-12" style="color: var(--color-text-muted)" />
        <p>Keine Sensoren oder Aktoren in dieser Zone.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.monitor-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.monitor-view__title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.monitor-view__subtitle {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.monitor-view__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.monitor-view__back {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.monitor-view__back:hover {
  color: var(--color-text-primary);
  border-color: var(--glass-border-hover);
}

.monitor-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12);
  text-align: center;
  color: var(--color-text-muted);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONE TILES (Level 1)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-zone-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.monitor-zone-tile {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  cursor: pointer;
  transition: all var(--transition-base);
}

.monitor-zone-tile:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.monitor-zone-tile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.monitor-zone-tile__name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.monitor-zone-tile__alarm-badge {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-status-alarm);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
}

.monitor-zone-tile__kpis {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.monitor-zone-tile__kpi {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.monitor-zone-tile__kpi-value {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-primary);
}

.monitor-zone-tile__counts {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SENSOR/ACTUATOR CARDS (Level 2)
   ═══════════════════════════════════════════════════════════════════════════ */

.monitor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.monitor-section__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin: 0;
}

.monitor-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}

/* Sensor Card */
.monitor-sensor-card {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--color-status-good);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  transition: all var(--transition-fast);
}

.monitor-sensor-card:hover {
  border-color: var(--glass-border-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.monitor-sensor-card--warning { border-left-color: var(--color-status-warning); }
.monitor-sensor-card--alarm { border-left-color: var(--color-status-alarm); background: rgba(239, 68, 68, 0.03); }
.monitor-sensor-card--offline { border-left-color: var(--color-status-offline); opacity: 0.7; }

.monitor-sensor-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.monitor-sensor-card__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-sensor-card__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.monitor-sensor-card__dot--good { background: var(--color-status-good); box-shadow: 0 0 4px rgba(34, 197, 94, 0.4); }
.monitor-sensor-card__dot--warning { background: var(--color-status-warning); }
.monitor-sensor-card__dot--alarm { background: var(--color-status-alarm); animation: pulse-alarm 1.5s infinite; }
.monitor-sensor-card__dot--offline { background: var(--color-status-offline); }

@keyframes pulse-alarm {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.monitor-sensor-card__value {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}

.monitor-sensor-card__number {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1;
}

.monitor-sensor-card__unit {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.monitor-sensor-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--color-text-muted);
}

/* Actuator Card */
.monitor-actuator-card {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--color-status-offline);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  transition: all var(--transition-fast);
}

.monitor-actuator-card--on { border-left-color: var(--color-status-good); }

.monitor-actuator-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.monitor-actuator-card__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-actuator-card__toggle {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--glass-border);
  background: var(--color-bg-quaternary);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.monitor-actuator-card__toggle:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}

.monitor-actuator-card__toggle--on {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--color-status-alarm);
  color: var(--color-status-alarm);
}

.monitor-actuator-card__status {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
}

.monitor-actuator-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--color-text-muted);
}
</style>
