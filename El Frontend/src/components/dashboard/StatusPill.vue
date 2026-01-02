<script setup lang="ts">
import { computed } from 'vue'

type StatusType = 'online' | 'offline' | 'warning' | 'safemode'

interface Props {
  type: StatusType
  count: number
  label: string
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  active: false
})

const emit = defineEmits<{
  click: []
}>()

const colorConfig = computed(() => {
  const configs: Record<StatusType, { dot: string; activeBg: string; hoverBg: string; text: string }> = {
    online: {
      dot: 'bg-emerald-500',
      activeBg: 'bg-emerald-500/20 border-emerald-500/50',
      hoverBg: 'hover:bg-emerald-500/10',
      text: 'text-emerald-400'
    },
    offline: {
      dot: 'bg-red-500',
      activeBg: 'bg-red-500/20 border-red-500/50',
      hoverBg: 'hover:bg-red-500/10',
      text: 'text-red-400'
    },
    warning: {
      dot: 'bg-amber-500',
      activeBg: 'bg-amber-500/20 border-amber-500/50',
      hoverBg: 'hover:bg-amber-500/10',
      text: 'text-amber-400'
    },
    safemode: {
      dot: 'bg-orange-500',
      activeBg: 'bg-orange-500/20 border-orange-500/50',
      hoverBg: 'hover:bg-orange-500/10',
      text: 'text-orange-400'
    }
  }
  return configs[props.type]
})

const pillClasses = computed(() => {
  const base = 'flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer select-none'

  if (props.active) {
    return `${base} ${colorConfig.value.activeBg}`
  }

  return `${base} border-gray-700 ${colorConfig.value.hoverBg}`
})
</script>

<template>
  <button
    :class="pillClasses"
    @click="emit('click')"
    type="button"
  >
    <span
      class="w-2 h-2 rounded-full"
      :class="colorConfig.dot"
    />
    <span
      class="text-sm font-medium"
      :class="active ? colorConfig.text : 'text-gray-300'"
    >
      {{ count }}
    </span>
    <span class="text-sm text-gray-400 hidden sm:inline">
      {{ label }}
    </span>
  </button>
</template>
