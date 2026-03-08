<script setup lang="ts">
/**
 * AlertStatusBar — ISA-18.2 Alert Status Overview
 *
 * Compact status bar showing active/acknowledged alert counts and ISA metrics.
 * Placed in TopBar or Dashboard header area.
 *
 * Phase 4B.2.1
 */
import { onMounted, onUnmounted, computed } from 'vue'
import { AlertTriangle, CheckCircle, Clock, Activity } from 'lucide-vue-next'
import { useAlertCenterStore } from '@/shared/stores'
import { useEspStore } from '@/stores/esp'

const alertStore = useAlertCenterStore()
const espStore = useEspStore()

/** Hide entire bar when no devices or no sensors exist (stale data from previous sessions) */
const hasDevices = computed(() => espStore.devices.length > 0)
const hasSensors = computed(() =>
  espStore.devices.some(d => (d.sensors?.length ?? 0) > 0)
)

/** Show bar only when there is meaningful data to display */
const showBar = computed(() => {
  if (!alertStore.alertStats) return false
  if (!hasDevices.value) return false
  if (!hasSensors.value) return false
  const s = alertStore.alertStats
  return s.active_count > 0 || s.acknowledged_count > 0 || s.resolved_today_count > 0
})

onMounted(() => {
  alertStore.startStatsPolling()
})

onUnmounted(() => {
  alertStore.stopStatsPolling()
})
</script>

<template>
  <div
    v-if="showBar && alertStore.alertStats"
    class="alert-status-bar"
    :class="{ 'alert-status-bar--critical': alertStore.hasCritical }"
  >
    <!-- Active Alerts -->
    <div class="alert-status-bar__item" title="Aktive Alerts">
      <AlertTriangle
        :size="14"
        :class="alertStore.hasCritical ? 'text-error' : 'text-warning'"
      />
      <span class="alert-status-bar__count">
        {{ alertStore.alertStats.active_count }}
      </span>
    </div>

    <!-- Acknowledged -->
    <div
      v-if="alertStore.alertStats.acknowledged_count > 0"
      class="alert-status-bar__item"
      title="Bestätigte Alerts"
    >
      <CheckCircle :size="14" class="text-info" />
      <span class="alert-status-bar__count">
        {{ alertStore.alertStats.acknowledged_count }}
      </span>
    </div>

    <!-- MTTA -->
    <div
      v-if="alertStore.mttaFormatted !== '–'"
      class="alert-status-bar__item alert-status-bar__metric"
      title="Mittlere Bestätigungszeit (MTTA)"
    >
      <Clock :size="12" class="text-muted" />
      <span class="alert-status-bar__label">MTTA</span>
      <span class="alert-status-bar__value">{{ alertStore.mttaFormatted }}</span>
    </div>

    <!-- MTTR -->
    <div
      v-if="alertStore.mttrFormatted !== '–'"
      class="alert-status-bar__item alert-status-bar__metric"
      title="Mittlere Lösungszeit (MTTR)"
    >
      <Activity :size="12" class="text-muted" />
      <span class="alert-status-bar__label">MTTR</span>
      <span class="alert-status-bar__value">{{ alertStore.mttrFormatted }}</span>
    </div>

    <!-- Resolved Today -->
    <div
      v-if="alertStore.alertStats.resolved_today_count > 0"
      class="alert-status-bar__item alert-status-bar__metric"
      title="Heute gelöst"
    >
      <CheckCircle :size="12" class="text-success" />
      <span class="alert-status-bar__value">
        {{ alertStore.alertStats.resolved_today_count }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.alert-status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-1, 4px) var(--space-3, 12px);
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg-tertiary);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: var(--text-xs, 11px);
}

.alert-status-bar--critical {
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(248, 113, 113, 0.05);
}

.alert-status-bar__item {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}

.alert-status-bar__count {
  font-weight: 600;
  color: var(--color-text-primary);
}

.alert-status-bar__metric {
  opacity: 0.7;
}

.alert-status-bar__label {
  color: var(--color-text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.alert-status-bar__value {
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.text-error {
  color: var(--color-error);
}

.text-warning {
  color: var(--color-warning);
}

.text-info {
  color: var(--color-info);
}

.text-success {
  color: var(--color-success);
}

.text-muted {
  color: var(--color-text-muted);
}
</style>
