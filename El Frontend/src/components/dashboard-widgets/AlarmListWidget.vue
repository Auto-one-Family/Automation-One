<script setup lang="ts">
/**
 * AlarmListWidget — Active alarms and warnings for dashboard
 *
 * Shows sensors with quality 'alarm', 'poor', 'bad', 'error' or 'warning'.
 * Chronological list (newest first).
 * Min-size: 4x4
 */
import { computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import { Bell, AlertTriangle, AlertCircle } from 'lucide-vue-next'
import type { MockSensor } from '@/types'

interface Props {
  maxItems?: number
  showResolved?: boolean
  zoneFilter?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  maxItems: 20,
  showResolved: false,
  zoneFilter: null,
})

const espStore = useEspStore()

interface AlarmEntry {
  sensorId: string
  espId: string
  gpio: number
  sensorName: string
  sensorType: string
  value: number
  unit: string
  quality: string
  zoneName: string
  lastRead: string | null
  severity: 'alarm' | 'warning'
}

const alarms = computed<AlarmEntry[]>(() => {
  const entries: AlarmEntry[] = []

  for (const device of espStore.devices) {
    if (props.zoneFilter && device.zone_id !== props.zoneFilter) continue

    const deviceId = espStore.getDeviceId(device)
    const sensors = (device.sensors as MockSensor[]) || []

    for (const sensor of sensors) {
      const q = sensor.quality
      const isAlarm = q === 'poor' || q === 'bad' || q === 'error'
      const isWarning = q === 'fair' || sensor.is_stale === true

      if (!isAlarm && !isWarning) continue

      entries.push({
        sensorId: `${deviceId}:${sensor.gpio}`,
        espId: deviceId,
        gpio: sensor.gpio,
        sensorName: sensor.name || sensor.sensor_type,
        sensorType: sensor.sensor_type,
        value: sensor.raw_value ?? 0,
        unit: sensor.unit || '',
        quality: q,
        zoneName: device.zone_name || '',
        lastRead: sensor.last_read || null,
        severity: isAlarm ? 'alarm' : 'warning',
      })
    }
  }

  // Sort by severity (alarm first) then by time (newest first)
  entries.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'alarm' ? -1 : 1
    const tA = a.lastRead ? new Date(a.lastRead).getTime() : 0
    const tB = b.lastRead ? new Date(b.lastRead).getTime() : 0
    return tB - tA
  })

  return entries.slice(0, props.maxItems)
})

const alarmCount = computed(() => alarms.value.filter(a => a.severity === 'alarm').length)

function formatTimeAgo(isoStr: string | null): string {
  if (!isoStr) return '–'
  const diff = Date.now() - new Date(isoStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'gerade'
  if (minutes < 60) return `vor ${minutes} Min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std`
  return `vor ${Math.floor(hours / 24)}d`
}
</script>

<template>
  <div class="alarm-widget">
    <!-- Alarm Count Badge -->
    <div v-if="alarmCount > 0" class="alarm-widget__badge-bar">
      <span class="alarm-widget__badge">{{ alarmCount }} aktive Alarme</span>
    </div>

    <!-- Alarm List -->
    <div v-if="alarms.length > 0" class="alarm-widget__list">
      <div
        v-for="alarm in alarms"
        :key="alarm.sensorId"
        :class="['alarm-widget__item', `alarm-widget__item--${alarm.severity}`]"
      >
        <component
          :is="alarm.severity === 'alarm' ? AlertCircle : AlertTriangle"
          class="alarm-widget__icon w-3.5 h-3.5"
        />
        <div class="alarm-widget__content">
          <div class="alarm-widget__header">
            <span class="alarm-widget__sensor">{{ alarm.sensorName }}</span>
            <span class="alarm-widget__time">{{ formatTimeAgo(alarm.lastRead) }}</span>
          </div>
          <div class="alarm-widget__detail">
            <span class="alarm-widget__value">{{ alarm.value.toFixed(1) }} {{ alarm.unit }}</span>
            <span v-if="alarm.zoneName" class="alarm-widget__zone">{{ alarm.zoneName }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="alarm-widget__empty">
      <Bell class="w-6 h-6" style="opacity: 0.3" />
      <span>Keine aktiven Alarme</span>
      <span class="alarm-widget__empty-sub">Alles im grünen Bereich</span>
    </div>
  </div>
</template>

<style scoped>
.alarm-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.alarm-widget__badge-bar {
  display: flex;
  padding: var(--space-1) var(--space-2);
  flex-shrink: 0;
}

.alarm-widget__badge {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-error);
  background: var(--color-zone-alarm, rgba(248, 113, 113, 0.1));
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.alarm-widget__list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-1);
}

.alarm-widget__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  margin-bottom: 2px;
  border-left: 2px solid transparent;
}

.alarm-widget__item--alarm {
  border-left-color: var(--color-error);
  background: rgba(248, 113, 113, 0.04);
}

.alarm-widget__item--alarm .alarm-widget__icon {
  color: var(--color-error);
}

.alarm-widget__item--warning {
  border-left-color: var(--color-warning);
  background: rgba(251, 191, 36, 0.04);
}

.alarm-widget__item--warning .alarm-widget__icon {
  color: var(--color-warning);
}

.alarm-widget__content {
  flex: 1;
  min-width: 0;
}

.alarm-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
}

.alarm-widget__sensor {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-widget__time {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.alarm-widget__detail {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.alarm-widget__value {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
}

.alarm-widget__zone {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  background: var(--color-bg-quaternary);
  padding: var(--space-1) var(--space-1);
  border-radius: var(--radius-sm);
}

.alarm-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.alarm-widget__empty-sub {
  font-size: var(--text-xs);
  opacity: 0.6;
}

.alarm-widget__icon {
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
