<script setup lang="ts">
/**
 * ActuatorCard — Unified actuator card for config and monitor views
 *
 * Config mode: Name, type, ESP-ID, GPIO, state badge, toggle, settings hint
 * Monitor mode: Read-only — state badge visible, toggle button hidden
 */
import { computed } from 'vue'
import { Power, ChevronRight } from 'lucide-vue-next'
import type { ActuatorWithContext } from '@/composables/useZoneGrouping'

interface Props {
  actuator: ActuatorWithContext
  mode: 'monitor' | 'config'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  configure: [actuator: ActuatorWithContext]
  toggle: [espId: string, gpio: number, currentState: boolean]
}>()

const displayName = computed(() =>
  props.actuator.name || `GPIO ${props.actuator.gpio}`
)

function handleClick() {
  if (props.mode === 'config') {
    emit('configure', props.actuator)
  }
}

function handleToggle(event: Event) {
  event.stopPropagation()
  emit('toggle', props.actuator.esp_id, props.actuator.gpio, props.actuator.state)
}
</script>

<template>
  <div
    :class="[
      'actuator-card',
      `actuator-card--${mode}`,
      { 'actuator-card--emergency': actuator.emergency_stopped },
    ]"
    @click="handleClick"
  >
    <div class="actuator-card__header">
      <div
        :class="[
          'actuator-card__icon',
          actuator.state ? 'actuator-card__icon--on' : 'actuator-card__icon--off',
        ]"
      >
        <Power :class="['w-5 h-5', actuator.state ? 'text-green-400' : 'text-dark-400']" />
      </div>
      <div class="actuator-card__info">
        <p class="actuator-card__name">{{ displayName }}</p>
        <p class="actuator-card__meta">{{ actuator.esp_id }} · {{ actuator.actuator_type }}</p>
      </div>
      <ChevronRight
        v-if="mode === 'config'"
        class="w-4 h-4 text-dark-500 flex-shrink-0"
      />
    </div>
    <div class="actuator-card__body">
      <div class="actuator-card__badges">
        <span :class="['badge', actuator.state ? 'badge-success' : 'badge-gray']">
          {{ actuator.state ? 'Ein' : 'Aus' }}
        </span>
        <span v-if="actuator.emergency_stopped" class="badge badge-danger">
          Not-Stopp
        </span>
      </div>
      <button
        v-if="mode === 'config'"
        class="btn-secondary btn-sm flex-shrink-0 touch-target"
        :disabled="actuator.emergency_stopped"
        @click="handleToggle"
      >
        {{ actuator.state ? 'Ausschalten' : 'Einschalten' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.actuator-card {
  cursor: pointer;
  transition: all var(--transition-fast);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-tertiary);
  padding: var(--space-3);
}

.actuator-card:hover {
  border-color: var(--color-border-hover, rgba(255, 255, 255, 0.12));
}

.actuator-card--emergency {
  border-color: rgba(248, 113, 113, 0.3);
}

.actuator-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.actuator-card__icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.actuator-card__icon--on {
  background: rgba(34, 197, 94, 0.15);
}

.actuator-card__icon--off {
  background: var(--color-bg-quaternary, rgba(255, 255, 255, 0.04));
}

.actuator-card__info {
  flex: 1;
  min-width: 0;
}

.actuator-card__name {
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actuator-card__meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actuator-card__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.actuator-card__badges {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
