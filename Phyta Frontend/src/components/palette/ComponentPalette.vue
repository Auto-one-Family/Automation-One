<script setup lang="ts">
/** Palette types per M-1/M-2 verify (level + fan/heater/light excluded). */
const SENSOR_TYPES = [
  { id: 'ds18b20', label: 'Temperatur (OneWire)' },
  { id: 'sht31', label: 'Temp+Feuchte (I2C)' },
  { id: 'bme280', label: 'BME280 (I2C)' },
  { id: 'ph', label: 'pH (Analog)' },
  { id: 'ec', label: 'EC (Analog)' },
  { id: 'moisture', label: 'Boden (Analog)' },
  { id: 'bh1750', label: 'Licht (I2C)' },
  { id: 'co2', label: 'CO₂ (I2C)' },
  { id: 'flow', label: 'Durchfluss' },
] as const

const ACTUATOR_TYPES = [
  { id: 'pump', label: 'Pumpe' },
  { id: 'valve', label: 'Ventil' },
  { id: 'pwm', label: 'PWM' },
  { id: 'relay', label: 'Relais' },
] as const

function onDragStart(event: DragEvent, type: string, kind: 'sensor' | 'actuator'): void {
  event.dataTransfer?.setData('application/phyta-component', JSON.stringify({ type, kind }))
}
</script>

<template>
  <div
    class="palette-drawer glass-panel border-b border-glass-border px-4 py-3"
    role="toolbar"
    aria-label="Komponenten-Palette"
  >
    <p class="mb-2 text-xs uppercase tracking-wide text-dark-400">Komponenten</p>
    <div class="flex flex-wrap gap-2 overflow-x-auto pb-1">
      <span
        v-for="s in SENSOR_TYPES"
        :key="s.id"
        draggable="true"
        class="cursor-grab rounded-md border border-glass-border bg-dark-900 px-3 py-1.5 text-xs text-dark-200"
        @dragstart="onDragStart($event, s.id, 'sensor')"
      >
        {{ s.label }}
      </span>
      <span
        v-for="a in ACTUATOR_TYPES"
        :key="a.id"
        draggable="true"
        class="cursor-grab rounded-md border border-iridescent-1/40 bg-dark-900 px-3 py-1.5 text-xs text-dark-200"
        @dragstart="onDragStart($event, a.id, 'actuator')"
      >
        {{ a.label }}
      </span>
    </div>
  </div>
</template>
