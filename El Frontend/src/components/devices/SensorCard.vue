<script setup lang="ts">
/**
 * SensorCard — Unified sensor card for config and monitor views
 *
 * Config mode: Name, type, ESP-ID, GPIO, settings hint
 * Monitor mode: Name, live value, quality dot, sparkline, ESP-ID
 */
import { computed } from 'vue'
import { Settings, ChevronRight } from 'lucide-vue-next'
import type { SensorWithContext } from '@/composables/useZoneGrouping'
import type { ChartDataPoint } from '@/components/charts/LiveLineChart.vue'
import { qualityToStatus } from '@/utils/formatters'
import { getSensorLabel } from '@/utils/sensorDefaults'
import LiveLineChart from '@/components/charts/LiveLineChart.vue'

interface Props {
  sensor: SensorWithContext
  mode: 'monitor' | 'config'
  sparklineData?: ChartDataPoint[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  configure: [sensor: SensorWithContext]
  click: [sensor: SensorWithContext]
}>()

const displayName = computed(() =>
  props.sensor.name || `GPIO ${props.sensor.gpio}`
)

const sensorLabel = computed(() =>
  getSensorLabel(props.sensor.sensor_type) || props.sensor.sensor_type
)

const statusClass = computed(() =>
  `sensor-card__dot--${qualityToStatus(props.sensor.quality)}`
)

function formatValue(value: number): string {
  if (value === null || value === undefined) return '--'
  return Number.isInteger(value) ? value.toString() : value.toFixed(1)
}

function handleClick() {
  if (props.mode === 'config') {
    emit('configure', props.sensor)
  } else {
    emit('click', props.sensor)
  }
}
</script>

<template>
  <div
    :class="[
      'sensor-card',
      `sensor-card--${mode}`,
      mode === 'monitor' ? `sensor-card--${qualityToStatus(sensor.quality)}` : '',
    ]"
    @click="handleClick"
  >
    <!-- Config Mode -->
    <template v-if="mode === 'config'">
      <div class="sensor-card__header">
        <div class="sensor-card__icon sensor-card__icon--config">
          <Settings class="w-5 h-5 text-purple-400" />
        </div>
        <div class="sensor-card__info">
          <p class="sensor-card__name">{{ displayName }}</p>
          <p class="sensor-card__meta">{{ sensor.esp_id }} · {{ sensorLabel }}</p>
        </div>
        <ChevronRight class="w-4 h-4 text-dark-500 flex-shrink-0" />
      </div>
    </template>

    <!-- Monitor Mode -->
    <template v-else>
      <div class="sensor-card__header">
        <span class="sensor-card__name">{{ displayName }}</span>
        <span :class="['sensor-card__dot', statusClass]" />
      </div>
      <div class="sensor-card__value">
        <span class="sensor-card__number">{{ formatValue(sensor.raw_value) }}</span>
        <span class="sensor-card__unit">{{ sensor.unit }}</span>
      </div>
      <div
        v-if="sparklineData?.length"
        class="sensor-card__sparkline"
      >
        <LiveLineChart
          :data="sparklineData"
          :compact="true"
          height="50px"
          :fill="true"
          :show-grid="false"
        />
      </div>
      <div class="sensor-card__footer">
        <span class="sensor-card__esp">{{ sensor.esp_id }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sensor-card {
  cursor: pointer;
  transition: all var(--transition-fast);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-tertiary);
}

.sensor-card:hover {
  border-color: var(--color-border-hover, rgba(255, 255, 255, 0.12));
}

/* Config Mode */
.sensor-card--config {
  padding: var(--space-3);
}

.sensor-card--config .sensor-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sensor-card__icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sensor-card__icon--config {
  background: rgba(168, 85, 247, 0.15);
}

.sensor-card__info {
  flex: 1;
  min-width: 0;
}

.sensor-card__name {
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-card__meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Monitor Mode */
.sensor-card--monitor {
  padding: var(--space-3);
}

.sensor-card--monitor .sensor-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.sensor-card--monitor .sensor-card__name {
  font-size: var(--text-sm);
  font-weight: 500;
}

.sensor-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sensor-card__dot--good {
  background: var(--color-success);
}

.sensor-card__dot--warning {
  background: var(--color-warning);
}

.sensor-card__dot--alarm {
  background: var(--color-error);
}

.sensor-card__dot--offline {
  background: var(--color-text-muted);
}

.sensor-card__value {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
}

.sensor-card__number {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: var(--color-text-primary);
}

.sensor-card__unit {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.sensor-card__sparkline {
  height: 50px;
  margin: var(--space-1) 0;
  opacity: 0.8;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.sensor-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sensor-card__esp {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Status border in monitor mode */
.sensor-card--good { border-color: rgba(52, 211, 153, 0.15); }
.sensor-card--warning { border-color: rgba(251, 191, 36, 0.15); }
.sensor-card--alarm { border-color: rgba(248, 113, 113, 0.15); }
.sensor-card--offline { border-color: var(--glass-border); }
</style>
