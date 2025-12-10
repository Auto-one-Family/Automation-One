<template>
  <v-btn
    v-bind="$attrs"
    :aria-label="ariaLabel"
    :aria-describedby="ariaDescribedby"
    :aria-pressed="ariaPressed"
    :aria-expanded="ariaExpanded"
    :aria-controls="ariaControls"
    :aria-haspopup="ariaHasPopup"
    :aria-live="ariaLive"
    :aria-atomic="ariaAtomic"
    :aria-relevant="ariaRelevant"
    @click="$emit('click', $event)"
  >
    <slot />
  </v-btn>
</template>

<script setup>
defineProps({
  // ✅ NEU: Erweiterte ARIA-Props für bessere Accessibility
  ariaLabel: {
    type: String,
    default: null,
  },
  ariaDescribedby: {
    type: String,
    default: null,
  },
  ariaPressed: {
    type: Boolean,
    default: null,
  },
  ariaExpanded: {
    type: Boolean,
    default: null,
  },
  ariaControls: {
    type: String,
    default: null,
  },
  ariaHasPopup: {
    type: String,
    default: null,
  },
  ariaLive: {
    type: String,
    default: null,
  },
  ariaAtomic: {
    type: Boolean,
    default: null,
  },
  ariaRelevant: {
    type: String,
    default: null,
  },
})

defineEmits(['click'])
</script>
