<script setup lang="ts">
/**
 * EmptyState Component
 * 
 * Displays an empty state placeholder with:
 * - Icon
 * - Title
 * - Description
 * - Optional action button
 */

import type { Component } from 'vue'
import { Inbox } from 'lucide-vue-next'

interface Props {
  /** Icon component to display */
  icon?: Component
  /** Title text */
  title: string
  /** Description text */
  description?: string
  /** Action button text */
  actionText?: string
  /** Whether to show the action button */
  showAction?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  icon: () => Inbox,
  showAction: true,
})

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon-wrapper">
      <component :is="icon" class="empty-state__icon" />
    </div>
    
    <h3 class="empty-state__title">{{ title }}</h3>
    
    <p v-if="description" class="empty-state__description">
      {{ description }}
    </p>
    
    <button
      v-if="showAction && actionText"
      class="btn-primary"
      @click="emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  text-align: center;
}

.empty-state__icon-wrapper {
  width: 4rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--color-bg-tertiary);
  margin-bottom: 1rem;
}

.empty-state__icon {
  width: 2rem;
  height: 2rem;
  color: var(--color-text-muted);
}

.empty-state__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.empty-state__description {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  max-width: 20rem;
  margin-bottom: 1.5rem;
}
</style>














