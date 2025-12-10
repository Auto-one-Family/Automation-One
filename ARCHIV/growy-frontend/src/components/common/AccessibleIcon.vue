<template>
  <v-icon
    v-bind="$attrs"
    :aria-label="ariaLabel"
    :aria-hidden="ariaHidden"
    :role="role"
    :aria-describedby="ariaDescribedby"
  >
    <slot />
  </v-icon>
</template>

<script setup>
defineProps({
  // ✅ NEU: ARIA-Props für Icons
  ariaLabel: {
    type: String,
    default: null,
  },
  ariaHidden: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    default: 'img',
  },
  ariaDescribedby: {
    type: String,
    default: null,
  },
})
</script>
