<script setup lang="ts">
/**
 * TimeRangeSelector — Time range button group
 *
 * Reusable time range selector for charts.
 * Can synchronize multiple charts via shared model.
 */

interface Props {
  modelValue: string
  options?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  options: () => ['1h', '6h', '24h', '7d'],
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="time-range-selector">
    <button
      v-for="opt in options"
      :key="opt"
      :class="['time-range-selector__btn', { 'time-range-selector__btn--active': modelValue === opt }]"
      @click="emit('update:modelValue', opt)"
    >
      {{ opt }}
    </button>
  </div>
</template>

<style scoped>
.time-range-selector {
  display: flex;
  gap: 2px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.time-range-selector__btn {
  padding: var(--space-1) var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  font-family: var(--font-mono);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.time-range-selector__btn:hover {
  color: var(--color-text-secondary);
}

.time-range-selector__btn--active {
  background: var(--color-accent);
  color: white;
}
</style>
