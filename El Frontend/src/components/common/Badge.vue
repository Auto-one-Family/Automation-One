<script setup lang="ts">
/**
 * Badge Component
 * 
 * A versatile badge/tag component with support for:
 * - Multiple color variants including mock/real distinction
 * - Pulsing dot indicator for live status
 * - Static dot indicator
 * - Multiple sizes
 */

import { computed } from 'vue'

type BadgeVariant = 
  | 'success' 
  | 'warning' 
  | 'danger' 
  | 'info' 
  | 'gray' 
  | 'purple' 
  | 'orange'
  | 'mock'    // For mock ESP devices (purple)
  | 'real'    // For real ESP devices (cyan)
  | 'neutral' // Gray, for unknown/default

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
  /** Whether the badge has a border (for mock/real) */
  bordered?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'gray',
  size: 'md',
  pulse: false,
  dot: false,
  bordered: false,
})

// Badge classes based on variant
const badgeClasses = computed(() => {
  const base = 'badge'
  
  // Variant styles (background + text color)
  const variantClasses: Record<BadgeVariant, string> = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    gray: 'badge-gray',
    purple: 'bg-purple-500/15 text-purple-400',
    orange: 'bg-orange-500/15 text-orange-400',
    mock: 'badge-mock',
    real: 'badge-real',
    neutral: 'badge-gray',
  }

  // Size styles
  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1 text-sm gap-2',
  }

  return [base, variantClasses[props.variant], sizeClasses[props.size]].filter(Boolean).join(' ')
})

// Dot classes based on variant
const dotClasses = computed(() => {
  const dotVariantClasses: Record<BadgeVariant, string> = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    gray: 'bg-dark-400',
    purple: 'bg-purple-400',
    orange: 'bg-orange-400',
    mock: 'bg-mock',
    real: 'bg-real',
    neutral: 'bg-dark-400',
  }

  const classes = [
    'w-1.5 h-1.5 rounded-full',
    dotVariantClasses[props.variant],
  ]

  if (props.pulse) {
    classes.push('animate-pulse-dot')
  }

  return classes.join(' ')
})
</script>

<template>
  <span :class="badgeClasses">
    <!-- Optional dot indicator -->
    <span v-if="dot || pulse" :class="dotClasses" />

    <!-- Badge content -->
    <slot />
  </span>
</template>
