<script setup lang="ts">
import { buildPaletteItems } from '@/utils/componentPalette'

const emit = defineEmits<{
  dragStart: []
  dropped: []
}>()

const { sensors, actuators } = buildPaletteItems()

function onDragStart(event: DragEvent, type: string, kind: 'sensor' | 'actuator'): void {
  event.dataTransfer?.setData('application/phyta-component', JSON.stringify({ type, kind }))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  emit('dragStart')
}

function collapseAfterDrop(): void {
  emit('dropped')
}

defineExpose({ collapseAfterDrop })
</script>

<template>
  <div
    class="palette-drawer"
    role="toolbar"
    aria-label="Komponenten hinzufügen"
  >
    <div class="palette-drawer__row">
      <button
        v-for="item in sensors"
        :key="item.id"
        type="button"
        draggable="true"
        class="palette-chip palette-chip--compact palette-chip--sensor"
        :aria-label="`${item.label} hinzufügen`"
        :title="`${item.label}${item.hint ? ` — ${item.hint}` : ''}`"
        @dragstart="onDragStart($event, item.id, 'sensor')"
      >
        <span class="palette-chip__icon" aria-hidden="true">
          <component :is="item.icon" :size="12" />
        </span>
        <span class="palette-chip__label">{{ item.shortLabel }}</span>
      </button>

      <span class="palette-drawer__divider" aria-hidden="true" />

      <button
        v-for="item in actuators"
        :key="item.id"
        type="button"
        draggable="true"
        class="palette-chip palette-chip--compact palette-chip--actuator"
        :aria-label="`${item.label} hinzufügen`"
        :title="`${item.label}${item.hint ? ` — ${item.hint}` : ''}`"
        @dragstart="onDragStart($event, item.id, 'actuator')"
      >
        <span class="palette-chip__icon" aria-hidden="true">
          <component :is="item.icon" :size="12" />
        </span>
        <span class="palette-chip__label">{{ item.shortLabel }}</span>
      </button>
    </div>
  </div>
</template>
