<script setup lang="ts">
/**
 * AlarmListWidget
 *
 * Active alarms and recent warnings.
 * Shows sensors with quality === 'alarm' or 'warning', sorted chronologically.
 * Min grid size: 4x4
 */

import { ref, computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import WidgetWrapper from './WidgetWrapper.vue'
import { Bell, CheckCircle } from 'lucide-vue-next'

interface AlarmEntry {
  espId: string
  espName: string
  gpio: number
  sensorName: string
  sensorType: string
  value: number | null
  unit: string
  quality: string
  zoneName: string
  subzoneName: string
  threshold?: number
  timestamp: Date
}

interface Props {
  widgetId: string
  config?: {
    maxItems?: number
    showResolved?: boolean
    zoneFilter?: string | null
  }
}

const props = withDefaults(defineProps<Props>(), {
  config: () => ({}),
})

const emit = defineEmits<{
  remove: []
  'update-config': [config: Record<string, unknown>]
}>()

const espStore = useEspStore()

const maxItems = ref(props.config.maxItems ?? 20)
const zoneFilter = ref<string | null>(props.config.zoneFilter ?? null)

const alarms = computed(() => {
  const entries: AlarmEntry[] = []

  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)

    if (zoneFilter.value && device.zone_id !== zoneFilter.value) continue

    const sensors: any[] = (device as any).sensors || []
    for (const sensor of sensors) {
      const quality = sensor.quality || sensor.data_quality
      if (quality === 'alarm' || quality === 'warning') {
        entries.push({
          espId: deviceId,
          espName: device.name || deviceId,
          gpio: sensor.gpio,
          sensorName: sensor.name || sensor.sensor_type,
          sensorType: sensor.sensor_type,
          value: sensor.last_value ?? sensor.current_value ?? null,
          unit: sensor.unit || '',
          quality,
          zoneName: device.zone_name || device.zone_id || '',
          subzoneName: device.subzone_name || '',
          threshold: sensor.threshold_min ?? sensor.threshold_max,
          timestamp: new Date(sensor.last_updated || sensor.last_seen || Date.now()),
        })
      }
    }

    // Check actuators for emergency stops
    const actuators: any[] = (device as any).actuators || []
    for (const act of actuators) {
      if (act.emergency_stopped) {
        entries.push({
          espId: deviceId,
          espName: device.name || deviceId,
          gpio: act.gpio,
          sensorName: act.name || act.actuator_type,
          sensorType: 'actuator',
          value: null,
          unit: '',
          quality: 'alarm',
          zoneName: device.zone_name || device.zone_id || '',
          subzoneName: device.subzone_name || '',
          timestamp: new Date(act.last_command_at || Date.now()),
        })
      }
    }
  }

  // Sort by timestamp (newest first)
  entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  return entries.slice(0, maxItems.value)
})

const alarmCount = computed(() => alarms.value.filter(a => a.quality === 'alarm').length)

const zones = computed(() => {
  const zoneSet = new Map<string, string>()
  for (const d of espStore.devices) {
    if (d.zone_id) zoneSet.set(d.zone_id, d.zone_name || d.zone_id)
  }
  return Array.from(zoneSet.entries()).map(([id, name]) => ({ id, name }))
})

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'gerade eben'
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min`
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std`
  return `vor ${Math.floor(seconds / 86400)} Tagen`
}

function formatThreshold(alarm: AlarmEntry): string {
  if (alarm.value == null) return 'E-STOP aktiv'
  if (alarm.threshold != null) {
    return `${alarm.value.toFixed(1)} ${alarm.unit} (Grenze: ${alarm.threshold} ${alarm.unit})`
  }
  return `${alarm.value.toFixed(1)} ${alarm.unit}`
}
</script>

<template>
  <WidgetWrapper
    title="Alarme"
    :icon="Bell"
    :badge="alarmCount > 0 ? alarmCount : undefined"
    @remove="$emit('remove')"
  >
    <div class="alarm-list-content">
      <div v-if="alarms.length === 0" class="alarm-empty">
        <CheckCircle class="alarm-empty-icon" />
        <p>Keine aktiven Alarme</p>
        <p class="alarm-empty-sub">Alles im grünen Bereich</p>
      </div>
      <div v-else class="alarm-list">
        <div
          v-for="alarm in alarms"
          :key="`${alarm.espId}-${alarm.gpio}`"
          class="alarm-entry"
          :class="{
            'alarm-entry--alarm': alarm.quality === 'alarm',
            'alarm-entry--warning': alarm.quality === 'warning',
          }"
        >
          <span class="alarm-indicator" />
          <div class="alarm-body">
            <div class="alarm-header">
              <span class="alarm-sensor-name">{{ alarm.sensorName }}</span>
              <span class="alarm-time">{{ formatTimeAgo(alarm.timestamp) }}</span>
            </div>
            <div class="alarm-value">{{ formatThreshold(alarm) }}</div>
            <div class="alarm-location">
              <span v-if="alarm.zoneName">{{ alarm.zoneName }}</span>
              <span v-if="alarm.subzoneName"> · {{ alarm.subzoneName }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #config="{ close }">
      <div class="widget-config-inner">
        <label class="config-label">Zone</label>
        <select
          class="config-select"
          :value="zoneFilter || ''"
          @change="(e) => {
            const val = (e.target as HTMLSelectElement).value || null
            zoneFilter = val
            emit('update-config', { zoneFilter: val, maxItems: maxItems })
          }"
        >
          <option value="">Alle Zonen</option>
          <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.name }}</option>
        </select>

        <label class="config-label">Max. Einträge</label>
        <input
          type="number"
          class="config-input"
          :value="maxItems"
          min="5"
          max="100"
          @change="(e) => {
            maxItems = parseInt((e.target as HTMLInputElement).value) || 20
            emit('update-config', { zoneFilter, maxItems })
          }"
        />
        <button class="config-close-btn" @click="close()">Schließen</button>
      </div>
    </template>
  </WidgetWrapper>
</template>

<style scoped>
.alarm-list-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.alarm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-1);
  text-align: center;
}

.alarm-empty-icon {
  width: 24px;
  height: 24px;
  color: var(--color-success);
  opacity: 0.6;
}

.alarm-empty p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.alarm-empty-sub {
  font-size: var(--text-xs) !important;
  color: var(--color-text-muted) !important;
}

.alarm-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.alarm-entry {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.alarm-entry:hover {
  background: var(--color-bg-quaternary);
}

.alarm-indicator {
  width: 3px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  background: var(--color-text-muted);
}

.alarm-entry--alarm .alarm-indicator {
  background: var(--color-error);
}

.alarm-entry--warning .alarm-indicator {
  background: var(--color-warning);
}

.alarm-body {
  flex: 1;
  min-width: 0;
}

.alarm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.alarm-sensor-name {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-time {
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.alarm-value {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-secondary);
  margin-top: 1px;
}

.alarm-location {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 1px;
}

.widget-config-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.config-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.config-select,
.config-input {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-xs);
  font-family: inherit;
}

.config-close-btn {
  align-self: flex-end;
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.config-close-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}
</style>
