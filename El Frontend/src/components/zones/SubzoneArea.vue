<script setup lang="ts">
/**
 * SubzoneArea Component
 *
 * Tinted background area within ZoneDetailView that visually groups
 * DeviceSummaryCards by subzone. Solid accent border left, MapPin icon,
 * device count badge.
 */

import type { ESPDevice } from '@/api/esp'
import { MapPin } from 'lucide-vue-next'

interface Props {
  subzoneId: string
  subzoneName: string
  devices: ESPDevice[]
}

defineProps<Props>()
</script>

<template>
  <div class="subzone-area">
    <div class="subzone-area__header">
      <MapPin class="subzone-area__icon" />
      <div class="subzone-area__label">{{ subzoneName }}</div>
      <span class="subzone-area__count">{{ devices.length }}</span>
    </div>
    <div class="subzone-area__grid">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.subzone-area {
  background: var(--glass-bg-light);
  border: 1px solid var(--glass-border);
  border-left: 2px solid var(--color-accent-dim);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.subzone-area__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.subzone-area__icon {
  width: 12px;
  height: 12px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.subzone-area__label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: 500;
  flex: 1;
}

.subzone-area__count {
  font-size: var(--text-xxs);
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  padding: 1px 6px;
  flex-shrink: 0;
}

.subzone-area__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
}
</style>
