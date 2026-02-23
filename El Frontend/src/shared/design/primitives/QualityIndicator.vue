<script setup lang="ts">
/**
 * QualityIndicator — Status Dot with Label
 *
 * Four states:
 * - good: green, steady
 * - warning: yellow, steady
 * - alarm: red, pulsing
 * - offline: gray, steady
 *
 * Used in SensorCards, SensorSatellites, and MonitorView.
 */

interface Props {
  /** Current quality status */
  status: 'good' | 'warning' | 'alarm' | 'offline'
  /** Show label text next to dot */
  showLabel?: boolean
  /** Size variant */
  size?: 'sm' | 'md'
}

withDefaults(defineProps<Props>(), {
  showLabel: true,
  size: 'sm',
})

const statusLabels: Record<string, string> = {
  good: 'Normal',
  warning: 'Warnung',
  alarm: 'Alarm',
  offline: 'Offline',
}
</script>

<template>
  <div :class="['quality-indicator', `quality-indicator--${status}`, `quality-indicator--${size}`]">
    <span class="quality-indicator__dot" />
    <span v-if="showLabel" class="quality-indicator__label">{{ statusLabels[status] }}</span>
  </div>
</template>

<style scoped>
.quality-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOT
   ═══════════════════════════════════════════════════════════════════════════ */

.quality-indicator__dot {
  border-radius: 50%;
  flex-shrink: 0;
}

.quality-indicator--sm .quality-indicator__dot {
  width: 6px;
  height: 6px;
}

.quality-indicator--md .quality-indicator__dot {
  width: 8px;
  height: 8px;
}

/* Status colors */
.quality-indicator--good .quality-indicator__dot {
  background: var(--color-status-good);
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}

.quality-indicator--warning .quality-indicator__dot {
  background: var(--color-status-warning);
  box-shadow: 0 0 4px rgba(234, 179, 8, 0.4);
}

.quality-indicator--alarm .quality-indicator__dot {
  background: var(--color-status-alarm);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  animation: alarm-pulse 1.5s ease-in-out infinite;
}

.quality-indicator--offline .quality-indicator__dot {
  background: var(--color-status-offline);
  box-shadow: none;
}

@keyframes alarm-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LABEL
   ═══════════════════════════════════════════════════════════════════════════ */

.quality-indicator__label {
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.quality-indicator--good .quality-indicator__label {
  color: var(--color-status-good);
}

.quality-indicator--warning .quality-indicator__label {
  color: var(--color-status-warning);
}

.quality-indicator--alarm .quality-indicator__label {
  color: var(--color-status-alarm);
}

.quality-indicator--offline .quality-indicator__label {
  color: var(--color-status-offline);
}
</style>
