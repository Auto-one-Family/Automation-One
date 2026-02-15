<script setup lang="ts">
/**
 * ZonePlate — Level 3 Zone Overview Card
 *
 * Elevated glass rectangle showing a zone's aggregate stats.
 * Design: "Deep Space Mission Control" aesthetic from the design doc.
 * Shows device count, online status, sensor/actuator counts per zone.
 * Subzones rendered as tinted areas within the plate.
 */

import { computed } from 'vue'
import { Tag, Wifi, Thermometer, Zap, AlertTriangle } from 'lucide-vue-next'
import type { ESPDevice } from '@/api/esp'
import { useEspStore } from '@/stores/esp'

interface Props {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: [payload: { zoneId: string }]
}>()

const espStore = useEspStore()

// ── Aggregated Stats ─────────────────────────────────────────────────

const stats = computed(() => {
  const total = props.devices.length
  const online = props.devices.filter(d =>
    d.status === 'online' || d.connected === true
  ).length
  const warnings = props.devices.filter(d => {
    const id = espStore.getDeviceId(d)
    if (espStore.isMock(id)) {
      const m = d as any
      return m.system_state === 'ERROR' || m.actuators?.some((a: any) => a.emergency_stopped)
    }
    return d.status === 'error'
  }).length

  // Count sensors and actuators across all devices
  let sensorCount = 0
  let actuatorCount = 0
  for (const device of props.devices) {
    sensorCount += (device.sensors as any[])?.length ?? device.sensor_count ?? 0
    actuatorCount += (device.actuators as any[])?.length ?? device.actuator_count ?? 0
  }

  return { total, online, warnings, sensorCount, actuatorCount }
})

// Health status for border styling
const healthClass = computed(() => {
  if (stats.value.warnings > 0) return 'zone-plate--warning'
  if (stats.value.online === stats.value.total && stats.value.total > 0) return 'zone-plate--healthy'
  if (stats.value.total === 0) return ''
  return ''
})

// ── Subzone grouping ─────────────────────────────────────────────────

interface SubzoneGroup {
  subzoneId: string | null
  subzoneName: string
  devices: ESPDevice[]
}

const subzoneGroups = computed<SubzoneGroup[]>(() => {
  const groups = new Map<string | null, SubzoneGroup>()

  for (const device of props.devices) {
    const subId = (device as any).subzone_id || null
    const subName = (device as any).subzone_name || (subId ? subId : '')

    if (!groups.has(subId)) {
      groups.set(subId, {
        subzoneId: subId,
        subzoneName: subName,
        devices: [],
      })
    }
    groups.get(subId)!.devices.push(device)
  }

  // Sort: named subzones first, then unassigned
  return Array.from(groups.values()).sort((a, b) => {
    if (a.subzoneId === null) return 1
    if (b.subzoneId === null) return -1
    return a.subzoneName.localeCompare(b.subzoneName)
  })
})

function handleClick() {
  emit('click', { zoneId: props.zoneId })
}
</script>

<template>
  <div
    :class="['zone-plate', healthClass]"
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <!-- Header -->
    <div class="zone-plate__header">
      <div class="zone-plate__header-left">
        <Tag class="zone-plate__icon" />
        <h3 class="zone-plate__title">{{ zoneName }}</h3>
      </div>
      <div class="zone-plate__header-right">
        <span class="zone-plate__stat">
          <Wifi class="zone-plate__stat-icon" />
          {{ stats.online }}/{{ stats.total }}
        </span>
        <span v-if="stats.warnings > 0" class="zone-plate__stat zone-plate__stat--warning">
          <AlertTriangle class="zone-plate__stat-icon" />
          {{ stats.warnings }}
        </span>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="zone-plate__stats-row">
      <span class="zone-plate__stat-chip">
        <Thermometer class="zone-plate__chip-icon" />
        {{ stats.sensorCount }} Sensoren
      </span>
      <span class="zone-plate__stat-chip">
        <Zap class="zone-plate__chip-icon" />
        {{ stats.actuatorCount }} Aktoren
      </span>
    </div>

    <!-- Subzone Areas -->
    <div v-if="subzoneGroups.length > 0" class="zone-plate__subzones">
      <div
        v-for="group in subzoneGroups"
        :key="group.subzoneId || '__none'"
        class="zone-plate__subzone"
      >
        <span v-if="group.subzoneId" class="zone-plate__subzone-label">
          {{ group.subzoneName }}
        </span>
        <div class="zone-plate__subzone-stats">
          {{ group.devices.length }} Gerät{{ group.devices.length !== 1 ? 'e' : '' }}
        </div>
      </div>
    </div>

    <!-- Noise overlay for depth -->
    <div class="zone-plate__noise" />
  </div>
</template>

<style scoped>
.zone-plate {
  position: relative;
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  padding: 1rem;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.zone-plate:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.12));
}

.zone-plate:focus-visible {
  outline: 2px solid var(--color-iridescent-1);
  outline-offset: 2px;
}

/* Status-dependent top border */
.zone-plate--healthy {
  border-top: 2px solid transparent;
  border-image: linear-gradient(
    135deg,
    var(--color-iridescent-1),
    var(--color-iridescent-2),
    var(--color-iridescent-3),
    var(--color-iridescent-4)
  ) 1;
}

.zone-plate--warning {
  border-top: 2px solid var(--color-warning);
  box-shadow: 0 -4px 20px rgba(251, 191, 36, 0.06);
}

/* Header */
.zone-plate__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.zone-plate__header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.zone-plate__header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.zone-plate__icon {
  width: 1rem;
  height: 1rem;
  color: var(--color-iridescent-1);
}

.zone-plate__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.zone-plate__stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-secondary);
}

.zone-plate__stat--warning {
  color: var(--color-warning);
}

.zone-plate__stat-icon {
  width: 0.75rem;
  height: 0.75rem;
}

/* Stats Row */
.zone-plate__stats-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.zone-plate__stat-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.375rem;
  border: 1px solid var(--glass-border);
}

.zone-plate__chip-icon {
  width: 0.625rem;
  height: 0.625rem;
}

/* Subzone Areas */
.zone-plate__subzones {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.zone-plate__subzone {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.375rem 0.625rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed var(--glass-border);
  border-radius: 0.375rem;
}

.zone-plate__subzone-label {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
}

.zone-plate__subzone-stats {
  font-size: 0.6875rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-secondary);
}

/* Noise overlay */
.zone-plate__noise {
  position: absolute;
  inset: 0;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  pointer-events: none;
  border-radius: inherit;
}
</style>
