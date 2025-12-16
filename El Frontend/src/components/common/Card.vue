<script setup lang="ts">
interface Props {
  /** Whether to add hover effect */
  hoverable?: boolean
  /** Whether to add padding to the card body (use slots for custom layout) */
  noPadding?: boolean
  /** Border color variant */
  borderColor?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  hoverable: false,
  noPadding: false,
  borderColor: 'default',
})
</script>

<template>
  <div
    :class="[
      'bg-dark-900 border rounded-xl transition-colors',
      hoverable ? 'hover:border-dark-600 cursor-pointer' : '',
      {
        'border-dark-700': borderColor === 'default',
        'border-green-500/30': borderColor === 'success',
        'border-yellow-500/30': borderColor === 'warning',
        'border-red-500/30': borderColor === 'danger',
        'border-blue-500/30': borderColor === 'info',
      }
    ]"
  >
    <!-- Header slot -->
    <div
      v-if="$slots.header"
      class="px-4 sm:px-6 py-3 sm:py-4 border-b border-dark-700"
    >
      <slot name="header" />
    </div>

    <!-- Default slot (body) -->
    <div :class="noPadding ? '' : 'p-4 sm:p-6'">
      <slot />
    </div>

    <!-- Footer slot -->
    <div
      v-if="$slots.footer"
      class="px-4 sm:px-6 py-3 sm:py-4 border-t border-dark-700"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
