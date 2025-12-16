<script setup lang="ts">
import { computed } from 'vue'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface Props {
  /** Button variant/style */
  variant?: ButtonVariant
  /** Button size */
  size?: ButtonSize
  /** Whether the button is disabled */
  disabled?: boolean
  /** Whether to show loading spinner */
  loading?: boolean
  /** Whether the button should take full width */
  fullWidth?: boolean
  /** HTML button type */
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  fullWidth: false,
  type: 'button',
})

const classes = computed(() => {
  const base = [
    'inline-flex items-center justify-center font-medium rounded-lg',
    'transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-900',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'touch-target', // Accessibility: 44px min touch target
  ]

  // Variant styles
  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-dark-700 text-dark-100 hover:bg-dark-600 focus:ring-dark-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    ghost: 'bg-transparent text-dark-300 hover:bg-dark-800 hover:text-dark-100',
  }

  // Size styles
  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2.5',
  }

  return [
    ...base,
    variantClasses[props.variant],
    sizeClasses[props.size],
    props.fullWidth ? 'w-full' : '',
    props.loading ? 'cursor-wait' : '',
  ].filter(Boolean).join(' ')
})
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
  >
    <!-- Loading Spinner -->
    <svg
      v-if="loading"
      class="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>

    <!-- Button Content -->
    <slot />
  </button>
</template>
