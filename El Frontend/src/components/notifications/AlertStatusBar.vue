<script setup lang="ts">
/**
 * AlertStatusBar — kompakte, menschenlesbare Alert-Zusammenfassung.
 * Kombiniert Alert-Lage + Einstieg in Benachrichtigungen (kein doppelter Badge).
 */
import { computed } from 'vue'
import { AlertTriangle, BellRing } from 'lucide-vue-next'
import { useAlertCenterStore } from '@/shared/stores'
import { useEspStore } from '@/stores/esp'
import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'

const alertStore = useAlertCenterStore()
const espStore = useEspStore()
const inboxStore = useNotificationInboxStore()

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
  return (
    s.active_count > 0 ||
    s.acknowledged_count > 0 ||
    s.resolved_today_count > 0 ||
    inboxStore.unreadCount > 0
  )
})

const isCritical = computed(() => alertStore.hasCritical)
const activeCount = computed(() => alertStore.alertStats?.active_count ?? 0)
const acknowledgedCount = computed(() => alertStore.alertStats?.acknowledged_count ?? 0)
const unreadCount = computed(() => inboxStore.unreadCount)
const mttrText = computed(() => alertStore.mttrFormatted)

const primaryText = computed(() => {
  if (activeCount.value > 0) {
    return `${activeCount.value} aktive Alerts`
  }
  if (acknowledgedCount.value > 0) {
    return `${acknowledgedCount.value} bestätigt`
  }
  return 'Keine aktiven Alerts'
})

const stateText = computed(() => {
  if (isCritical.value) return 'Kritisch'
  if (activeCount.value > 0) return 'Warnungen aktiv'
  return 'Stabil'
})

const assistiveLabel = computed(() => {
  const parts = [primaryText.value, stateText.value]
  if (mttrText.value !== '–') parts.push(`durchschnittliche Lösungszeit ${mttrText.value}`)
  if (acknowledgedCount.value > 0) parts.push(`${acknowledgedCount.value} bestätigt`)
  if (unreadCount.value > 0) parts.push(`${unreadCount.value} neue Benachrichtigungen`)
  return `${parts.join(', ')}. Klicken für Details.`
})

</script>

<template>
  <button
    v-if="showBar && alertStore.alertStats"
    class="alert-status-bar"
    :class="{ 'alert-status-bar--critical': isCritical }"
    :title="assistiveLabel"
    :aria-label="assistiveLabel"
    @click="inboxStore.toggleDrawer()"
  >
    <AlertTriangle
      :size="14"
      class="alert-status-bar__icon"
      :class="isCritical ? 'text-error' : 'text-warning'"
    />
    <span class="alert-status-bar__primary">{{ primaryText }}</span>
    <span class="alert-status-bar__state">{{ stateText }}</span>
    <span v-if="mttrText !== '–'" class="alert-status-bar__chip">
      Lösung Ø {{ mttrText }}
    </span>
    <span v-if="acknowledgedCount > 0" class="alert-status-bar__chip">
      Bestätigt {{ acknowledgedCount }}
    </span>
    <span v-if="unreadCount > 0" class="alert-status-bar__chip alert-status-bar__chip--new">
      <BellRing :size="12" class="alert-status-bar__chip-icon" />
      Neu {{ unreadCount }}
    </span>
  </button>
</template>

<style scoped>
.alert-status-bar {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 6px var(--space-3, 12px);
  min-height: 34px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: var(--text-xs, 11px);
  white-space: nowrap;
  max-width: min(40vw, 520px);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

.alert-status-bar:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--glass-border-hover);
}

.alert-status-bar--critical {
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(248, 113, 113, 0.05);
}

.alert-status-bar__icon {
  flex-shrink: 0;
}

.alert-status-bar__primary {
  font-weight: 600;
  color: var(--color-text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-status-bar__state {
  color: var(--color-text-muted);
  font-size: 10px;
  border-left: 1px solid var(--glass-border);
  padding-left: var(--space-2, 8px);
}

.text-error {
  color: var(--color-error);
}

.text-warning {
  color: var(--color-warning);
}

.alert-status-bar__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.alert-status-bar__chip--new {
  color: var(--color-info);
}

.alert-status-bar__chip-icon {
  flex-shrink: 0;
}

@media (max-width: 1279px) {
  .alert-status-bar {
    max-width: min(44vw, 360px);
  }

  .alert-status-bar__state,
  .alert-status-bar__chip {
    display: none;
  }
}

@media (max-width: 1023px) {
  .alert-status-bar {
    max-width: 280px;
    padding: 6px var(--space-2, 8px);
    gap: var(--space-1, 4px);
  }
}

/* Compact displays: less translucency for crisper text/icons */
@media (max-width: 1366px), (max-height: 820px) {
  .alert-status-bar {
    background: var(--color-bg-tertiary);
    border-color: var(--glass-border-hover);
    box-shadow: none;
  }

  .alert-status-bar--critical {
    background: rgba(248, 113, 113, 0.1);
    border-color: rgba(248, 113, 113, 0.35);
  }
}

@media (max-width: 767px) {
  .alert-status-bar {
    min-height: 44px;
    max-width: 210px;
    padding: 0 var(--space-2, 8px);
  }
}

@media (min-width: 1536px) {
  .alert-status-bar {
    min-height: 40px;
    max-width: min(42vw, 720px);
    padding: 8px var(--space-4, 16px);
    font-size: var(--text-sm, 13px);
    gap: var(--space-3, 12px);
  }

  .alert-status-bar__icon {
    width: 16px;
    height: 16px;
  }

  .alert-status-bar__state {
    font-size: 11px;
  }

  .alert-status-bar__chip {
    padding: 3px 8px;
    font-size: 11px;
  }
}
</style>
