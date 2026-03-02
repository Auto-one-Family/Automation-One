<script setup lang="ts">
/**
 * QuickAlertPanel — Top-5 active alerts shown as sub-panel in the FAB.
 *
 * Data source: notification-inbox.store.ts (no own fetch).
 * Actions: Ack (markAsRead), Navigate (deep-link), Details (expand).
 * Mute: Calls sensorsApi.updateAlertConfig() to suppress alerts per sensor.
 * Footer: "Alle Alerts anzeigen" opens the full NotificationDrawer.
 */

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BellOff,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-vue-next'
import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'
import { useQuickActionStore } from '@/shared/stores/quickAction.store'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'
import { sensorsApi } from '@/api/sensors'
import { formatRelativeTime } from '@/utils/formatters'
import type { NotificationDTO } from '@/api/notifications'

const MAX_ALERTS = 5

const router = useRouter()
const inboxStore = useNotificationInboxStore()
const quickActionStore = useQuickActionStore()
const espStore = useEspStore()

const { success, error } = useToast()
const expandedId = ref<string | null>(null)
const mutingId = ref<string | null>(null)

/** Top-5 unread alerts sorted by severity priority */
const topAlerts = computed<NotificationDTO[]>(() => {
  const severityOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  }

  return [...inboxStore.notifications]
    .filter((n) => !n.is_read && (n.severity === 'critical' || n.severity === 'warning' || n.severity === 'info'))
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))
    .slice(0, MAX_ALERTS)
})

const hasAlerts = computed(() => topAlerts.value.length > 0)

function severityDotClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'alert-item__dot--critical'
    case 'warning': return 'alert-item__dot--warning'
    case 'info': return 'alert-item__dot--info'
    default: return 'alert-item__dot--info'
  }
}

function handleAck(id: string): void {
  inboxStore.markAsRead(id)
}

/**
 * Navigate to the relevant Monitor/Hardware view for an alert.
 *
 * Routing strategy (server-centric — zone resolved from espStore):
 * 1. esp_id + zone → /monitor/:zoneId (Monitor L2, shows device in zone context)
 * 2. esp_id without zone → /?openSettings=espId (Dashboard, opens ESP detail)
 * 3. No esp_id → no navigation (button hidden in template)
 */
function handleNavigate(notification: NotificationDTO): void {
  const meta = notification.metadata || {}
  const espId = meta.esp_id as string | undefined

  if (!espId) return

  // Resolve zone from device registry (espStore is single source of truth)
  const device = espStore.devices.find(d => d.esp_id === espId)
  const zoneId = device?.zone_id

  if (zoneId) {
    // Device is assigned to a zone → Monitor L2 (zone overview with live data)
    void router.push(`/monitor/${zoneId}`)
  } else {
    // Device has no zone → Dashboard with ESP settings open
    void router.push(`/?openSettings=${espId}`)
  }

  quickActionStore.closeMenu()
}

function toggleExpand(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}

async function handleMute(notification: NotificationDTO): Promise<void> {
  const meta = notification.metadata || {}
  const sensorId = meta.sensor_config_id as string | undefined

  if (!sensorId) {
    error('Sensor-ID nicht verfügbar — Mute nicht möglich')
    return
  }

  mutingId.value = notification.id
  try {
    await sensorsApi.updateAlertConfig(sensorId, {
      alerts_enabled: false,
      suppression_reason: 'custom',
      suppression_note: `Stummgeschaltet via Quick Alert Panel`,
    })
    handleAck(notification.id)
    success('Sensor-Alerts stummgeschaltet')
  } catch (e) {
    error(e instanceof Error ? e.message : 'Fehler beim Stummschalten')
  } finally {
    mutingId.value = null
  }
}

function handleBack(): void {
  quickActionStore.setActivePanel('menu')
}

function handleShowAll(): void {
  quickActionStore.closeMenu()
  inboxStore.toggleDrawer()
}
</script>

<template>
  <div class="qa-alert-panel" role="region" aria-label="Quick Alerts">
    <!-- Header -->
    <div class="qa-alert-panel__header">
      <button class="qa-alert-panel__back" aria-label="Zurück" @click="handleBack">
        <ArrowLeft class="qa-alert-panel__back-icon" />
      </button>
      <span class="qa-alert-panel__title">Alerts</span>
      <span v-if="inboxStore.unreadCount > 0" class="qa-alert-panel__count">
        {{ inboxStore.unreadCount > 99 ? '99+' : inboxStore.unreadCount }}
      </span>
    </div>

    <!-- Alert List -->
    <div v-if="hasAlerts" class="qa-alert-panel__list">
      <div
        v-for="alert in topAlerts"
        :key="alert.id"
        class="alert-item"
        :class="{ 'alert-item--expanded': expandedId === alert.id }"
      >
        <!-- Main Row -->
        <div class="alert-item__row">
          <span class="alert-item__dot" :class="severityDotClass(alert.severity)" />
          <div class="alert-item__content">
            <span class="alert-item__title">{{ alert.title }}</span>
            <span class="alert-item__meta">
              <span v-if="alert.metadata?.zone_name" class="alert-item__zone">
                {{ alert.metadata.zone_name }}
              </span>
              <span class="alert-item__time">{{ formatRelativeTime(alert.created_at) }}</span>
            </span>
          </div>
          <div class="alert-item__actions">
            <button
              v-if="!alert.is_read"
              class="alert-item__action"
              title="Als gelesen markieren"
              @click.stop="handleAck(alert.id)"
            >
              <Check class="alert-item__action-icon" />
            </button>
            <button
              v-if="alert.metadata?.esp_id"
              class="alert-item__action"
              title="Zum Gerät anzeigen"
              @click.stop="handleNavigate(alert)"
            >
              <ExternalLink class="alert-item__action-icon" />
            </button>
            <button
              class="alert-item__action"
              title="Details"
              @click.stop="toggleExpand(alert.id)"
            >
              <ChevronDown v-if="expandedId !== alert.id" class="alert-item__action-icon" />
              <ChevronUp v-else class="alert-item__action-icon" />
            </button>
          </div>
        </div>

        <!-- Expanded Details -->
        <Transition name="alert-expand">
          <div v-if="expandedId === alert.id" class="alert-item__details">
            <div v-if="alert.body" class="alert-item__body">{{ alert.body }}</div>
            <div class="alert-item__detail-grid">
              <div v-if="alert.severity" class="alert-item__detail">
                <component
                  :is="alert.severity === 'critical' || alert.severity === 'warning' ? AlertTriangle : Info"
                  class="alert-item__detail-icon"
                />
                <span class="alert-item__detail-label">{{ alert.severity }}</span>
              </div>
              <div v-if="alert.source" class="alert-item__detail">
                <span class="alert-item__detail-text">Quelle: {{ alert.source }}</span>
              </div>
              <div v-if="alert.metadata?.esp_id" class="alert-item__detail">
                <span class="alert-item__detail-text">ESP: {{ alert.metadata.esp_id }}</span>
              </div>
            </div>
            <!-- Mute: suppress sensor alerts via Alert-Config API -->
            <button
              class="alert-item__mute"
              :class="{ 'alert-item__mute--active': alert.metadata?.sensor_config_id }"
              :disabled="!alert.metadata?.sensor_config_id || mutingId === alert.id"
              :title="alert.metadata?.sensor_config_id ? 'Sensor-Alerts stummschalten' : 'Sensor-ID nicht verfügbar'"
              @click.stop="handleMute(alert)"
            >
              <BellOff class="alert-item__mute-icon" />
              <span>{{ mutingId === alert.id ? 'Wird stummgeschaltet...' : 'Stummschalten' }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="qa-alert-panel__empty">
      <CheckCircle2 class="qa-alert-panel__empty-icon" />
      <span>Keine aktiven Alerts</span>
    </div>

    <!-- Footer -->
    <button class="qa-alert-panel__footer" @click="handleShowAll">
      Alle Alerts anzeigen &rarr;
    </button>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   QUICK ALERT PANEL — Sub-panel inside the FAB
   ═══════════════════════════════════════════════════════════════════════════ */

.qa-alert-panel {
  position: absolute;
  bottom: calc(100% + var(--space-2));
  right: 0;
  width: 320px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  background: rgba(20, 20, 30, 0.9);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--elevation-floating);
  transform-origin: bottom right;
  overflow: hidden;
}

/* ── Header ── */

.qa-alert-panel__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--glass-border);
}

.qa-alert-panel__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.qa-alert-panel__back:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.qa-alert-panel__back-icon {
  width: 14px;
  height: 14px;
}

.qa-alert-panel__title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
}

.qa-alert-panel__count {
  font-size: var(--text-xs);
  font-weight: 700;
  color: white;
  background: var(--color-error);
  border-radius: var(--radius-full);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* ── Alert List ── */

.qa-alert-panel__list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-1);
}

/* ── Alert Item ── */

.alert-item {
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.alert-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.alert-item__row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2);
}

.alert-item__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  margin-top: 5px;
}

.alert-item__dot--critical {
  background: var(--color-error);
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.5);
}

.alert-item__dot--warning {
  background: var(--color-warning);
  box-shadow: 0 0 4px rgba(251, 191, 36, 0.4);
}

.alert-item__dot--info {
  background: var(--color-info);
}

.alert-item__content {
  flex: 1;
  min-width: 0;
}

.alert-item__title {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-item__meta {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: 2px;
}

.alert-item__zone {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

.alert-item__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.alert-item__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.alert-item__action:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.alert-item__action-icon {
  width: 13px;
  height: 13px;
}

/* ── Expanded Details ── */

.alert-item__details {
  padding: 0 var(--space-2) var(--space-2) calc(var(--space-2) + 8px + var(--space-2));
}

.alert-item__body {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin-bottom: var(--space-2);
}

.alert-item__detail-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin-bottom: var(--space-2);
}

.alert-item__detail {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--color-text-muted);
}

.alert-item__detail-icon {
  width: 11px;
  height: 11px;
}

.alert-item__detail-label {
  text-transform: capitalize;
}

.alert-item__detail-text {
  font-family: var(--font-mono);
}

.alert-item__mute {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  cursor: not-allowed;
  opacity: 0.4;
  transition: all var(--transition-fast);
}

.alert-item__mute--active {
  cursor: pointer;
  opacity: 1;
}

.alert-item__mute--active:hover {
  border-color: var(--color-warning);
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.08);
}

.alert-item__mute-icon {
  width: 12px;
  height: 12px;
}

/* ── Empty State ── */

.qa-alert-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.qa-alert-panel__empty-icon {
  width: 24px;
  height: 24px;
  color: var(--color-success);
  opacity: 0.6;
}

/* ── Footer ── */

.qa-alert-panel__footer {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-top: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-iridescent-1);
  font-size: var(--text-xs);
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.qa-alert-panel__footer:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-iridescent-2);
}

/* ── Expand Transition ── */

.alert-expand-enter-active {
  transition: all var(--duration-fast) var(--ease-out);
}

.alert-expand-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}

.alert-expand-enter-from,
.alert-expand-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
