<script setup lang="ts">
import { computed } from 'vue'
import {
  Activity,
  Cloud,
  Droplet,
  Droplets,
  Gauge,
  Sun,
  Thermometer,
  Waves,
  Zap,
} from 'lucide-vue-next'
import { useActuatorLabel } from '@/composables/useActuatorLabel'
import { useSensorLabel } from '@/composables/useSensorLabel'
import type { PhytaActuatorConfig } from '@/types/esp'
import type { SensorLabelInput } from '@/composables/useSensorLabel'

interface Props {
  kind: 'sensor' | 'actuator'
  sensor?: SensorLabelInput
  actuator?: PhytaActuatorConfig
}

const props = defineProps<Props>()
const emit = defineEmits<{ toggle: [] }>()

const sensorInput = computed(
  () => props.sensor ?? { sensor_type: '', name: null, raw_value: null, unit: null },
)

const actuatorInput = computed(
  (): PhytaActuatorConfig => props.actuator ?? { gpio: 0, actuator_type: 'digital' },
)

const sensorLabels = useSensorLabel(sensorInput)
const actuatorLabels = useActuatorLabel(actuatorInput)

const displayLabel = computed(() =>
  props.kind === 'sensor' ? sensorLabels.label.value : actuatorLabels.label.value,
)

const displayValue = computed(() => {
  if (props.kind === 'sensor') {
    const v = sensorLabels.formattedValue.value
    return v == null ? '—' : v
  }
  return actuatorLabels.statusLine.value
})

const displayUnit = computed(() =>
  props.kind === 'sensor' ? sensorLabels.unit.value : '',
)

const ariaLabel = computed(() =>
  props.kind === 'actuator' ? actuatorLabels.operatorLine.value : displayLabel.value,
)

const icon = computed(() => {
  const t = (props.sensor?.sensor_type ?? '').toLowerCase()
  if (t.includes('ds18') || t.includes('sht') || t.includes('bme') || t.includes('temp')) {
    return Thermometer
  }
  if (t.includes('ph')) return Droplet
  if (t.includes('ec')) return Zap
  if (t.includes('moisture') || t.includes('soil')) return Droplets
  if (t.includes('bh1750') || t.includes('light')) return Sun
  if (t.includes('co2')) return Cloud
  if (t.includes('flow')) return Waves
  return props.kind === 'actuator' ? Activity : Gauge
})
</script>

<template>
  <div
    class="satellite-tile"
    :class="kind === 'actuator' ? 'cursor-pointer hover:border-accent satellite-tile--actuator' : 'satellite-tile--sensor'"
    :role="kind === 'actuator' ? 'button' : undefined"
    :tabindex="kind === 'actuator' ? 0 : undefined"
    :aria-label="kind === 'actuator' ? `${ariaLabel} umschalten` : ariaLabel"
    @click="kind === 'actuator' ? emit('toggle') : undefined"
    @keydown.enter.prevent="kind === 'actuator' ? emit('toggle') : undefined"
  >
    <div class="satellite-tile__label-row">
      <component
        :is="icon"
        :size="12"
        class="satellite-tile__icon"
        :class="kind === 'actuator' ? 'text-warning' : 'text-success'"
        aria-hidden="true"
      />
      <p class="satellite-tile__label">{{ displayLabel }}</p>
    </div>
    <p
      v-if="kind === 'sensor'"
      class="satellite-tile__value"
    >
      {{ displayValue }}<span
        v-if="displayUnit && displayValue !== '—'"
        class="satellite-tile__unit"
      >{{ displayUnit }}</span>
    </p>
    <p v-else class="satellite-tile__status">
      {{ displayValue }}
    </p>
  </div>
</template>

<style scoped>
.satellite-tile {
  padding: var(--space-3);
}

.satellite-tile__label-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.satellite-tile__icon {
  flex-shrink: 0;
}

.satellite-tile__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.satellite-tile__value {
  margin-top: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-base);
  line-height: var(--leading-tight);
  color: var(--color-accent-bright);
  font-variant-numeric: tabular-nums;
}

.satellite-tile__unit {
  margin-left: var(--space-1);
  font-size: var(--text-xxs);
  color: var(--color-text-muted);
}

.satellite-tile__status {
  margin-top: var(--space-2);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text-secondary);
}
</style>
