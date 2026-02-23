<script setup lang="ts">
/**
 * ActuatorRuntimeWidget
 *
 * Runtime statistics for actuators (last 24h or 7d).
 * Shows horizontal bar chart with runtime as percentage of max runtime.
 * Min grid size: 3x3
 */

import { ref, computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import WidgetWrapper from './WidgetWrapper.vue'
import { Activity } from 'lucide-vue-next'

type TimeRange = '24h' | '7d'

interface ActuatorRuntime {
  espId: string
  gpio: number
  name: string
  actuatorType: string
  isOn: boolean
  runtimeSeconds: number
  maxRuntimeSeconds: number
  runtimePercent: number
  lastCommand: string
  source: string
}

interface Props {
  widgetId: string
  config?: {
    zoneFilter?: string | null
    actuatorFilter?: string | null
    timeRange?: TimeRange
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

const zoneFilter = ref<string | null>(props.config.zoneFilter ?? null)
const timeRange = ref<TimeRange>(props.config.timeRange || '24h')

const MAX_RUNTIME_DEFAULT: Record<TimeRange, number> = {
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600,
}

const actuatorRuntimes = computed(() => {
  const runtimes: ActuatorRuntime[] = []

  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    if (zoneFilter.value && device.zone_id !== zoneFilter.value) continue

    const actuators: any[] = (device as any).actuators || []
    for (const act of actuators) {
      const runtime = act.runtime_seconds ?? act.total_runtime ?? 0
      const maxRuntime = act.max_runtime_seconds ?? MAX_RUNTIME_DEFAULT[timeRange.value]
      const percent = maxRuntime > 0 ? Math.min(100, (runtime / maxRuntime) * 100) : 0

      runtimes.push({
        espId: deviceId,
        gpio: act.gpio,
        name: act.name || act.actuator_type || `GPIO ${act.gpio}`,
        actuatorType: act.actuator_type || 'unknown',
        isOn: act.state === 'ON' || act.current_state === true || (act.value ?? 0) > 0,
        runtimeSeconds: runtime,
        maxRuntimeSeconds: maxRuntime,
        runtimePercent: percent,
        lastCommand: act.last_command || '--',
        source: act.last_command_source || '--',
      })
    }
  }

  // Sort by runtime descending
  runtimes.sort((a, b) => b.runtimePercent - a.runtimePercent)
  return runtimes
})

const zones = computed(() => {
  const zoneSet = new Map<string, string>()
  for (const d of espStore.devices) {
    if (d.zone_id) zoneSet.set(d.zone_id, d.zone_name || d.zone_id)
  }
  return Array.from(zoneSet.entries()).map(([id, name]) => ({ id, name }))
})

function formatRuntime(seconds: number): string {
  if (seconds === 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function getBarColor(percent: number): string {
  if (percent > 80) return 'var(--color-error)'
  if (percent > 50) return 'var(--color-warning)'
  return 'var(--color-success)'
}
</script>

<template>
  <WidgetWrapper
    title="Aktor-Laufzeit"
    :icon="Activity"
    @remove="$emit('remove')"
  >
    <div class="runtime-content">
      <!-- Time Range Selector -->
      <div class="time-range-bar">
        <button
          v-for="range in (['24h', '7d'] as TimeRange[])"
          :key="range"
          class="time-range-btn"
          :class="{ 'time-range-btn--active': timeRange === range }"
          @click="() => {
            timeRange = range
            emit('update-config', { zoneFilter, timeRange: range })
          }"
        >
          {{ range }}
        </button>
      </div>

      <!-- Actuator List -->
      <div v-if="actuatorRuntimes.length === 0" class="widget-empty">
        Keine Aktoren konfiguriert
      </div>
      <div v-else class="runtime-list">
        <div
          v-for="act in actuatorRuntimes"
          :key="`${act.espId}-${act.gpio}`"
          class="runtime-entry"
        >
          <div class="runtime-header">
            <span class="runtime-name">
              {{ act.name }}
              <span v-if="act.isOn" class="runtime-active-dot" title="Aktiv" />
            </span>
            <span class="runtime-value">{{ formatRuntime(act.runtimeSeconds) }}</span>
          </div>
          <div class="runtime-bar">
            <div
              class="runtime-bar-fill"
              :style="{
                width: `${act.runtimePercent}%`,
                background: getBarColor(act.runtimePercent),
              }"
            />
          </div>
          <div class="runtime-meta">
            <span>{{ act.lastCommand }}</span>
            <span>{{ act.source }}</span>
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
            emit('update-config', { zoneFilter: val, timeRange })
          }"
        >
          <option value="">Alle Zonen</option>
          <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.name }}</option>
        </select>
        <button class="config-close-btn" @click="close()">Schließen</button>
      </div>
    </template>
  </WidgetWrapper>
</template>

<style scoped>
.runtime-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--space-2);
}

.time-range-bar {
  display: flex;
  gap: 2px;
  background: var(--color-bg-quaternary);
  border-radius: var(--radius-sm);
  padding: 2px;
  flex-shrink: 0;
}

.time-range-btn {
  flex: 1;
  padding: 2px var(--space-2);
  border: none;
  border-radius: calc(var(--radius-sm) - 1px);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.time-range-btn:hover {
  color: var(--color-text-secondary);
}

.time-range-btn--active {
  background: var(--color-bg-secondary);
  color: var(--color-accent-bright);
}

.runtime-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.runtime-entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.runtime-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.runtime-name {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.runtime-active-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--color-success);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.runtime-value {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
}

.runtime-bar {
  height: 4px;
  background: var(--color-bg-quaternary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.runtime-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--transition-base);
}

.runtime-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--color-text-muted);
}

.widget-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
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

.config-select {
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
