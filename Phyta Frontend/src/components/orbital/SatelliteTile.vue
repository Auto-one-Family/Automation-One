<script setup lang="ts">
interface Props {
  label: string
  value?: string | number | null
  unit?: string
  kind: 'sensor' | 'actuator'
}

defineProps<Props>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <div
    class="satellite-tile glass-panel rounded-lg p-3 text-sm"
    :class="kind === 'actuator' ? 'cursor-pointer hover:border-accent' : ''"
    @click="kind === 'actuator' ? emit('toggle') : undefined"
  >
    <p class="truncate font-medium text-dark-200">{{ label }}</p>
    <p v-if="kind === 'sensor'" class="mt-1 font-mono text-accent-bright">
      {{ value != null ? value : '—' }}{{ unit ? ` ${unit}` : '' }}
    </p>
    <p v-else class="mt-1 text-dark-300">{{ value || 'unknown' }}</p>
  </div>
</template>

<style scoped>
.satellite-tile {
  width: 120px;
  min-height: 80px;
  background: var(--glass-bg-l2, var(--glass-bg));
}
</style>
