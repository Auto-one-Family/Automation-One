<script setup lang="ts">
/**
 * WidgetConfigPanel — SlideOver panel for configuring dashboard widgets
 *
 * Opens from a gear icon on each widget header.
 * Allows changing: sensor/actuator selection, title, Y-axis range,
 * time range (historical), thresholds, color.
 */
import { ref, computed, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import { SlideOver } from '@/shared/design/primitives'
import { SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'
import { CHART_COLORS } from '@/utils/chartColors'
import type { MockSensor, MockActuator } from '@/types'

interface Props {
  open: boolean
  widgetId: string
  widgetType: string
  config: Record<string, any>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  'update:config': [config: Record<string, any>]
}>()

const espStore = useEspStore()

// Local config copy for editing
const localConfig = ref<Record<string, any>>({})

watch(() => props.config, (cfg) => {
  localConfig.value = { ...cfg }
}, { immediate: true, deep: true })

// Determine which fields to show based on widget type
const hasSensorField = computed(() =>
  ['line-chart', 'gauge', 'sensor-card', 'historical'].includes(props.widgetType)
)
const hasActuatorField = computed(() =>
  ['actuator-card'].includes(props.widgetType)
)
const hasTimeRange = computed(() =>
  ['historical'].includes(props.widgetType)
)
const hasYRange = computed(() =>
  ['line-chart', 'historical'].includes(props.widgetType)
)

// Available sensors
const availableSensors = computed(() => {
  const items: { id: string; label: string; type: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const s of (device.sensors as MockSensor[]) || []) {
      items.push({
        id: `${deviceId}:${s.gpio}:${s.sensor_type}`,
        label: `${s.name || s.sensor_type} (${deviceId} GPIO ${s.gpio} — ${s.sensor_type})`,
        type: s.sensor_type || '',
      })
    }
  }
  return items
})

// Available actuators
const availableActuators = computed(() => {
  const items: { id: string; label: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const a of (device.actuators as MockActuator[]) || []) {
      items.push({
        id: `${deviceId}:${a.gpio}`,
        label: `${a.name || a.actuator_type} (${deviceId})`,
      })
    }
  }
  return items
})

// Current sensor type config for Y-range hints
const sensorTypeConfig = computed(() => {
  if (!localConfig.value.sensorId) return null
  const sensor = availableSensors.value.find(s => s.id === localConfig.value.sensorId)
  if (!sensor) return null
  return SENSOR_TYPE_CONFIG[sensor.type] || null
})

function updateField(field: string, value: any) {
  localConfig.value = { ...localConfig.value, [field]: value }
  emit('update:config', localConfig.value)
}

function handleSensorChange(sensorId: string) {
  // Auto-populate thresholds from SENSOR_TYPE_CONFIG when sensor changes
  const sensor = availableSensors.value.find(s => s.id === sensorId)
  const updates: Record<string, any> = { sensorId }

  if (sensor) {
    const cfg = SENSOR_TYPE_CONFIG[sensor.type]
    if (cfg) {
      const range = cfg.max - cfg.min
      // Only auto-fill thresholds when not yet set
      if (localConfig.value.warnLow == null && localConfig.value.warnHigh == null) {
        updates.warnLow = Math.round((cfg.min + range * 0.1) * 10) / 10
        updates.warnHigh = Math.round((cfg.max - range * 0.1) * 10) / 10
        updates.alarmLow = cfg.min
        updates.alarmHigh = cfg.max
      }
    }
  }

  localConfig.value = { ...localConfig.value, ...updates }
  emit('update:config', localConfig.value)
}

function handleActuatorChange(actuatorId: string) {
  updateField('actuatorId', actuatorId)
}

const widgetTypeLabels: Record<string, string> = {
  'line-chart': 'Linien-Chart',
  'gauge': 'Gauge',
  'sensor-card': 'Sensor-Karte',
  'historical': 'Historische Zeitreihe',
  'actuator-card': 'Aktor-Status',
  'actuator-runtime': 'Aktor-Laufzeit',
  'esp-health': 'ESP-Health',
  'alarm-list': 'Alarm-Liste',
  'multi-sensor': 'Multi-Sensor-Chart',
}
</script>

<template>
  <SlideOver
    :open="open"
    :title="`${widgetTypeLabels[widgetType] || widgetType} konfigurieren`"
    width="sm"
    @close="emit('close')"
  >
    <div class="widget-config-panel">
      <!-- Title -->
      <div class="widget-config-panel__field">
        <label class="widget-config-panel__label">Titel</label>
        <input
          type="text"
          class="widget-config-panel__input"
          :value="localConfig.title || ''"
          placeholder="Widget-Titel..."
          @input="updateField('title', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Sensor Selection -->
      <div v-if="hasSensorField" class="widget-config-panel__field">
        <label class="widget-config-panel__label">Sensor</label>
        <select
          class="widget-config-panel__select"
          :value="localConfig.sensorId || ''"
          @change="handleSensorChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>— Sensor wählen —</option>
          <option
            v-for="s in availableSensors"
            :key="s.id"
            :value="s.id"
          >{{ s.label }}</option>
        </select>
      </div>

      <!-- Actuator Selection -->
      <div v-if="hasActuatorField" class="widget-config-panel__field">
        <label class="widget-config-panel__label">Aktor</label>
        <select
          class="widget-config-panel__select"
          :value="localConfig.actuatorId || ''"
          @change="handleActuatorChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>— Aktor wählen —</option>
          <option
            v-for="a in availableActuators"
            :key="a.id"
            :value="a.id"
          >{{ a.label }}</option>
        </select>
      </div>

      <!-- Time Range (Historical) -->
      <div v-if="hasTimeRange" class="widget-config-panel__field">
        <label class="widget-config-panel__label">Zeitraum</label>
        <div class="widget-config-panel__chips">
          <button
            v-for="range in ['1h', '6h', '24h', '7d']"
            :key="range"
            :class="['widget-config-panel__chip', { 'widget-config-panel__chip--active': localConfig.timeRange === range }]"
            @click="updateField('timeRange', range)"
          >{{ range }}</button>
        </div>
      </div>

      <!-- Y-Axis Range (Charts) -->
      <div v-if="hasYRange" class="widget-config-panel__field">
        <label class="widget-config-panel__label">
          Y-Achse
          <span v-if="sensorTypeConfig" class="widget-config-panel__hint">
            ({{ sensorTypeConfig.label }}: {{ sensorTypeConfig.min }}–{{ sensorTypeConfig.max }} {{ sensorTypeConfig.unit }})
          </span>
        </label>
        <div class="widget-config-panel__range-row">
          <input
            type="number"
            class="widget-config-panel__input widget-config-panel__input--small"
            :value="localConfig.yMin ?? ''"
            placeholder="Min (auto)"
            @input="updateField('yMin', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
          />
          <span class="widget-config-panel__range-sep">–</span>
          <input
            type="number"
            class="widget-config-panel__input widget-config-panel__input--small"
            :value="localConfig.yMax ?? ''"
            placeholder="Max (auto)"
            @input="updateField('yMax', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
          />
        </div>
      </div>

      <!-- Color -->
      <div class="widget-config-panel__field">
        <label class="widget-config-panel__label">Farbe</label>
        <div class="widget-config-panel__color-row">
          <button
            v-for="c in CHART_COLORS"
            :key="c"
            :class="['widget-config-panel__color-swatch', { 'widget-config-panel__color-swatch--active': localConfig.color === c }]"
            :style="{ background: c }"
            @click="updateField('color', c)"
          />
        </div>
      </div>

      <!-- Thresholds toggle -->
      <div v-if="hasYRange" class="widget-config-panel__field">
        <label class="widget-config-panel__label-row">
          <span>Schwellenwerte anzeigen</span>
          <input
            type="checkbox"
            :checked="localConfig.showThresholds ?? false"
            @change="updateField('showThresholds', ($event.target as HTMLInputElement).checked)"
          />
        </label>
      </div>

      <!-- Threshold values (when enabled) -->
      <div v-if="hasYRange && localConfig.showThresholds" class="widget-config-panel__field">
        <label class="widget-config-panel__label">Alarm-Schwellen</label>
        <div class="widget-config-panel__threshold-grid">
          <div class="widget-config-panel__threshold-row">
            <span class="widget-config-panel__threshold-label widget-config-panel__threshold-label--alarm">Alarm Low</span>
            <input
              type="number"
              class="widget-config-panel__input widget-config-panel__input--small"
              :value="localConfig.alarmLow ?? ''"
              placeholder="—"
              @input="updateField('alarmLow', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            />
          </div>
          <div class="widget-config-panel__threshold-row">
            <span class="widget-config-panel__threshold-label widget-config-panel__threshold-label--warn">Warn Low</span>
            <input
              type="number"
              class="widget-config-panel__input widget-config-panel__input--small"
              :value="localConfig.warnLow ?? ''"
              placeholder="—"
              @input="updateField('warnLow', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            />
          </div>
          <div class="widget-config-panel__threshold-row">
            <span class="widget-config-panel__threshold-label widget-config-panel__threshold-label--warn">Warn High</span>
            <input
              type="number"
              class="widget-config-panel__input widget-config-panel__input--small"
              :value="localConfig.warnHigh ?? ''"
              placeholder="—"
              @input="updateField('warnHigh', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            />
          </div>
          <div class="widget-config-panel__threshold-row">
            <span class="widget-config-panel__threshold-label widget-config-panel__threshold-label--alarm">Alarm High</span>
            <input
              type="number"
              class="widget-config-panel__input widget-config-panel__input--small"
              :value="localConfig.alarmHigh ?? ''"
              placeholder="—"
              @input="updateField('alarmHigh', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            />
          </div>
        </div>
      </div>
    </div>
  </SlideOver>
</template>

<style scoped>
.widget-config-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}

.widget-config-panel__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.widget-config-panel__label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.widget-config-panel__hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  color: var(--color-text-muted);
}

.widget-config-panel__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.widget-config-panel__input {
  padding: var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
}

.widget-config-panel__input--small {
  width: 100px;
}

.widget-config-panel__select {
  padding: var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
}

.widget-config-panel__range-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.widget-config-panel__range-sep {
  color: var(--color-text-muted);
}

.widget-config-panel__chips {
  display: flex;
  gap: var(--space-1);
}

.widget-config-panel__chip {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-quaternary);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.widget-config-panel__chip:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}

.widget-config-panel__chip--active {
  background: rgba(59, 130, 246, 0.15);
  border-color: var(--color-accent);
  color: var(--color-accent-bright);
}

.widget-config-panel__color-row {
  display: flex;
  gap: var(--space-2);
}

.widget-config-panel__color-swatch {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.widget-config-panel__color-swatch:hover {
  transform: scale(1.15);
}

.widget-config-panel__color-swatch--active {
  border-color: var(--color-text-primary);
  box-shadow: 0 0 0 2px var(--color-bg-primary);
}

.widget-config-panel__threshold-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.widget-config-panel__threshold-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.widget-config-panel__threshold-label {
  font-size: var(--text-xs);
  width: 80px;
  flex-shrink: 0;
}

.widget-config-panel__threshold-label--alarm {
  color: var(--color-error);
}

.widget-config-panel__threshold-label--warn {
  color: var(--color-warning);
}
</style>
