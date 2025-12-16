<script setup lang="ts">
import { computed } from 'vue'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'gray' | 'purple' | 'orange'
type BadgeSize = 'sm' | 'md' | 'lg'

interface Props {
  /** Badge variant/color */
  variant?: BadgeVariant
  /** Badge size */
  size?: BadgeSize
  /** Whether to show a pulsing dot indicator */
  pulse?: boolean
  /** Whether to show a static dot indicator */
  dot?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'gray',
  size: 'md',
  pulse: false,
  dot: false,
})

const classes = computed(() => {
  const base = 'inline-flex items-center font-medium rounded-full'

  // Variant styles (background + text color)
  const variantClasses: Record<BadgeVariant, string> = {
    success: 'bg-green-500/20 text-green-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    danger: 'bg-red-500/20 text-red-400',
    info: 'bg-blue-500/20 text-blue-400',
    gray: 'bg-dark-600 text-dark-300',
    purple: 'bg-purple-500/20 text-purple-400',
    orange: 'bg-orange-500/20 text-orange-400',
  }

  // Size styles
  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-0.5 text-xs gap-1.5',
    lg: 'px-3 py-1 text-sm gap-2',
  }

  return [base, variantClasses[props.variant], sizeClasses[props.size]].join(' ')
})

// Dot color matches the text color for consistency
const dotClasses = computed(() => {
  const dotVariantClasses: Record<BadgeVariant, string> = {
    success: 'bg-green-400',
    warning: 'bg-yellow-400',
    danger: 'bg-red-400',
    info: 'bg-blue-400',
    gray: 'bg-dark-400',
    purple: 'bg-purple-400',
    orange: 'bg-orange-400',
  }

  return [
    'w-1.5 h-1.5 rounded-full',
    dotVariantClasses[props.variant],
    props.pulse ? 'animate-pulse' : '',
  ].join(' ')
})
</script>

<template>
  <span :class="classes">
    <!-- Optional dot indicator -->
    <span v-if="dot || pulse" :class="dotClasses" />

    <!-- Badge content -->
    <slot />
  </span>
</template>
