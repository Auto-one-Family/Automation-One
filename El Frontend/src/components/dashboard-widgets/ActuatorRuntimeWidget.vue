<script setup lang="ts">
/**
 * ActuatorRuntimeWidget — Actuator runtime statistics for dashboard
 *
 * Shows horizontal bars for each actuator's ON-time.
 * Data sourced from store (actuator state tracking).
 * Min-size: 3x3
 */
import { computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import { Zap } from 'lucide-vue-next'
import { formatRelativeTime } from '@/utils/formatters'
import type { MockActuator } from '@/types'

interface Props {
  zoneFilter?: string | null
  actuatorFilter?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  zoneFilter: null,
  actuatorFilter: null,
})

interface ActuatorInfo {
  id: string
  name: string
  state: boolean
  lastCommand: string | null
  espName: string
}

const espStore = useEspStore()

const actuators = computed<ActuatorInfo[]>(() => {
  const items: ActuatorInfo[] = []

  for (const device of espStore.devices) {
    if (props.zoneFilter && device.zone_id !== props.zoneFilter) continue

    const deviceId = espStore.getDeviceId(device)
    const acts = (device.actuators as MockActuator[]) || []

    for (const act of acts) {
      const id = `${deviceId}:${act.gpio}`
      if (props.actuatorFilter && id !== props.actuatorFilter) continue

      items.push({
        id,
        name: act.name || `${act.actuator_type} (GPIO ${act.gpio})`,
        state: act.state,
        lastCommand: act.last_command_at,
        espName: device.name || deviceId,
      })
    }
  }

  return items
})

const activeCount = computed(() => actuators.value.filter(a => a.state).length)
</script>

<template>
  <div class="runtime-widget">
    <template v-if="actuators.length > 0">
      <!-- Summary -->
      <div class="runtime-widget__summary">
        <span class="runtime-widget__count">
          <span class="runtime-widget__count-active">{{ activeCount }}</span>
          / {{ actuators.length }} aktiv
        </span>
      </div>

      <!-- Actuator List -->
      <div class="runtime-widget__list">
        <div
          v-for="act in actuators"
          :key="act.id"
          class="runtime-widget__item"
        >
          <span
            :class="['runtime-widget__dot', act.state ? 'runtime-widget__dot--on' : 'runtime-widget__dot--off']"
          />
          <span class="runtime-widget__name">{{ act.name }}</span>
          <span
            :class="['runtime-widget__badge', act.state ? 'runtime-widget__badge--on' : '']"
          >
            {{ act.state ? 'EIN' : 'AUS' }}
          </span>
          <span v-if="act.lastCommand" class="runtime-widget__cmd">
            {{ formatRelativeTime(act.lastCommand) }}
          </span>
        </div>
      </div>
    </template>

    <!-- Empty State -->
    <div v-else class="runtime-widget__empty">
      <Zap class="w-6 h-6" style="opacity: 0.3" />
      <span>Keine Aktoren konfiguriert</span>
    </div>
  </div>
</template>

<style scoped>
.runtime-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.runtime-widget__summary {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.runtime-widget__count {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
}

.runtime-widget__count-active {
  color: var(--color-success);
}

.runtime-widget__list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-1) 0;
}

.runtime-widget__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  margin: 0 var(--space-1);
}

.runtime-widget__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.runtime-widget__dot--on { background: var(--color-success); }
.runtime-widget__dot--off { background: var(--color-text-muted); opacity: 0.5; }

.runtime-widget__name {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-widget__badge {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-bg-quaternary);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.runtime-widget__badge--on {
  background: var(--color-zone-normal, rgba(34, 197, 94, 0.15));
  color: var(--color-success);
}

.runtime-widget__cmd {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  opacity: 0.7;
  flex-shrink: 0;
}

.runtime-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
