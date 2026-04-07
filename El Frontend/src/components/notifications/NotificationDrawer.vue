<script setup lang="ts">
/**
 * NotificationDrawer — Slide-in inbox panel
 *
 * Uses SlideOver.vue primitive (width="lg" = 560px).
 * Features:
 * - Header: Title + Settings gear + "Alle gelesen" button
 * - Filter tabs: Alle | Kritisch | Warnungen | System
 * - Grouped by Heute/Gestern/Älter
 * - Lazy loading: first 50, then "Mehr laden" button
 * - ESC and click-outside close (SlideOver feature)
 */

import { ref, computed, watch } from 'vue'
import { Settings, CheckCheck, Mail, ChevronDown, ChevronUp } from 'lucide-vue-next'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import NotificationItem from '@/components/notifications/NotificationItem.vue'
import NotificationPreferences from '@/components/notifications/NotificationPreferences.vue'
import {
  useNotificationInboxStore,
  type InboxFilter,
  type SourceFilterValue,
} from '@/shared/stores/notification-inbox.store'
import { useAlertCenterStore } from '@/shared/stores/alert-center.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import { notificationsApi, type EmailLogEntry } from '@/api/notifications'
import { formatRelativeTime } from '@/utils/formatters'
import { getEmailStatusLabel } from '@/utils/labels'

const inboxStore = useNotificationInboxStore()
const alertStore = useAlertCenterStore()
const authStore = useAuthStore()

type StatusFilter = 'all' | 'active' | 'acknowledged' | 'resolved'
const activeStatusFilter = ref<StatusFilter>('all')
const isResolvingAll = ref(false)

const filterTabs: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'critical', label: 'Kritisch' },
  { key: 'warning', label: 'Warnungen' },
  { key: 'system', label: 'System' },
]

/** Source filter chips: Alle | Sensor | Infrastruktur | Aktor | Regel | System */
const sourceChips: { value: SourceFilterValue; label: string }[] = [
  { value: null, label: 'Alle' },
  { value: 'sensor_threshold', label: 'Sensor' },
  { value: 'grafana', label: 'Infrastruktur' },
  { value: 'mqtt_handler', label: 'Aktor' },
  { value: 'logic_engine', label: 'Regel' },
  { value: '__system__', label: 'System' },
]

const statusTabs = computed(() => {
  const stats = alertStore.alertStats
  const active = stats?.active_count ?? inboxStore.notifications.filter(n => n.status === 'active').length
  const ack = stats?.acknowledged_count ?? inboxStore.notifications.filter(n => n.status === 'acknowledged').length
  const resolved = inboxStore.notifications.filter(n => n.status === 'resolved').length

  return [
    { key: 'all' as StatusFilter, label: 'Alle' },
    { key: 'active' as StatusFilter, label: `Aktiv (${active})` },
    { key: 'acknowledged' as StatusFilter, label: `Gesehen (${ack})` },
    { key: 'resolved' as StatusFilter, label: `Erledigt (${resolved})` },
  ]
})

const filteredGroupedNotifications = computed(() => {
  if (activeStatusFilter.value === 'all') {
    return inboxStore.groupedNotifications
  }

  return inboxStore.groupedNotifications
    .map(group => ({
      ...group,
      items: group.items.filter(n => n.status === activeStatusFilter.value),
    }))
    .filter(group => group.items.length > 0)
})

function handleClose(): void {
  inboxStore.isDrawerOpen = false
}

function handleMarkRead(id: string): void {
  inboxStore.markAsRead(id)
}

async function handleResolveAll(): Promise<void> {
  if (isResolvingAll.value || alertStore.unresolvedCount === 0) return
  isResolvingAll.value = true
  try {
    await alertStore.resolveAllAlerts()
    await inboxStore.loadInitial()
  } finally {
    isResolvingAll.value = false
  }
}

async function handleAcknowledge(id: string): Promise<void> {
  await alertStore.acknowledgeAlert(id)
}

async function handleResolve(id: string): Promise<void> {
  await alertStore.resolveAlert(id)
}

// Email log footer
const emailLog = ref<EmailLogEntry[]>([])
const emailLogExpanded = ref(false)
const emailLogLoading = ref(false)

async function loadEmailLog(): Promise<void> {
  emailLogLoading.value = true
  try {
    const res = await notificationsApi.getEmailLog({ page_size: 5 })
    emailLog.value = res.data
  } catch {
    emailLog.value = []
  } finally {
    emailLogLoading.value = false
  }
}

const hasEmailLog = computed(() => emailLog.value.length > 0)

// Refresh list when drawer opens
watch(
  () => inboxStore.isDrawerOpen,
  (isOpen) => {
    if (isOpen) {
      inboxStore.loadInitial()
      activeStatusFilter.value = 'all'
      if (authStore.isAdmin) loadEmailLog()
    }
  },
)
</script>

<template>
  <SlideOver
    :open="inboxStore.isDrawerOpen"
    title="Benachrichtigungen"
    width="lg"
    @close="handleClose"
  >
    <!-- Custom header actions (injected via default slot, header area) -->
    <template #default>
      <!-- Header Actions Row -->
      <div class="drawer__header-actions">
        <div class="drawer__tabs">
          <button
            v-for="tab in filterTabs"
            :key="tab.key"
            :class="[
              'drawer__tab',
              { 'drawer__tab--active': inboxStore.activeFilter === tab.key },
            ]"
            @click="inboxStore.activeFilter = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="drawer__actions">
          <button
            class="drawer__action-btn"
            title="Alle aktiven Alerts erledigen"
            :disabled="alertStore.unresolvedCount === 0 || isResolvingAll"
            @click="handleResolveAll"
          >
            <CheckCheck class="drawer__action-icon" />
            <span class="drawer__action-label">
              {{ isResolvingAll ? 'Erledige...' : 'Alle erledigen' }}
            </span>
          </button>
          <button
            class="drawer__action-btn"
            title="Einstellungen"
            @click="inboxStore.openPreferences()"
          >
            <Settings class="drawer__action-icon" />
          </button>
        </div>
      </div>

      <!-- Status Filter Tabs -->
      <div class="drawer__status-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.key"
          :class="[
            'drawer__status-tab',
            { 'drawer__status-tab--active': activeStatusFilter === tab.key },
          ]"
          @click="activeStatusFilter = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Source Filter Chips -->
      <div class="drawer__source-chips">
        <button
          v-for="chip in sourceChips"
          :key="chip.value ?? 'all'"
          :class="[
            'drawer__source-chip',
            { 'drawer__source-chip--active': inboxStore.sourceFilter === chip.value },
          ]"
          @click="inboxStore.setSourceFilter(chip.value)"
        >
          {{ chip.label }}
        </button>
      </div>

      <!-- Notification List -->
      <div class="drawer__list">
        <!-- Loading State -->
        <div v-if="inboxStore.isLoading && inboxStore.notifications.length === 0" class="drawer__loading">
          <span class="drawer__loading-text">Lade Benachrichtigungen...</span>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredGroupedNotifications.length === 0"
          class="drawer__empty"
        >
          <span class="drawer__empty-icon">🔔</span>
          <span class="drawer__empty-text">Keine Benachrichtigungen</span>
          <span class="drawer__empty-sub">
            {{ inboxStore.activeFilter !== 'all' || inboxStore.sourceFilter
              ? 'Kein Ergebnis für diesen Filter'
              : 'Hier erscheinen zukünftige Alarme und Ereignisse' }}
          </span>
        </div>

        <!-- Grouped Notifications -->
        <template v-else>
          <div
            v-for="group in filteredGroupedNotifications"
            :key="group.label"
            class="drawer__group"
          >
            <div class="drawer__group-label">{{ group.label }}</div>
            <NotificationItem
              v-for="n in group.items"
              :key="n.id"
              :notification="n"
              @mark-read="handleMarkRead"
              @acknowledge="handleAcknowledge"
              @resolve="handleResolve"
            />
          </div>

          <!-- Load More Button -->
          <div v-if="inboxStore.hasMore" class="drawer__load-more">
            <button
              class="drawer__load-more-btn"
              :disabled="inboxStore.isLoading"
              @click="inboxStore.loadMore()"
            >
              {{ inboxStore.isLoading ? 'Lade...' : 'Mehr laden' }}
            </button>
          </div>
        </template>
      </div>

      <!-- Email Log Footer (Admin only) -->
      <div v-if="authStore.isAdmin" class="drawer__email-footer">
        <div class="drawer__email-toggle-row">
          <button
            v-if="hasEmailLog"
            class="drawer__email-toggle"
            @click="emailLogExpanded = !emailLogExpanded"
          >
            <Mail class="drawer__email-toggle-icon" />
            <span>Letzte 5 Emails</span>
            <component
              :is="emailLogExpanded ? ChevronUp : ChevronDown"
              class="drawer__email-toggle-chevron"
            />
          </button>
          <RouterLink
            to="/email"
            class="drawer__email-all-link"
            @click="inboxStore.isDrawerOpen = false"
          >
            Alle anzeigen
          </RouterLink>
        </div>

        <Transition name="expand">
          <div v-if="hasEmailLog && emailLogExpanded" class="drawer__email-list">
            <div
              v-for="entry in emailLog"
              :key="entry.id"
              class="drawer__email-entry"
            >
              <span :class="['drawer__email-dot', `drawer__email-dot--${entry.status}`]" />
              <span class="drawer__email-subject">{{ entry.subject }}</span>
              <span class="drawer__email-status">
                {{ getEmailStatusLabel(entry.status) }}
                <span
                  v-if="(entry.status === 'failed' || entry.status === 'permanently_failed') && entry.retry_count > 0"
                  class="drawer__email-retry"
                >
                  ({{ entry.retry_count }}/3 Versuche)
                </span>
              </span>
              <span v-if="entry.sent_at || entry.created_at" class="drawer__email-time">
                {{ formatRelativeTime(entry.sent_at || entry.created_at!) }}
              </span>
            </div>
          </div>
        </Transition>
      </div>
    </template>
  </SlideOver>

  <!-- Preferences Panel -->
  <NotificationPreferences />
</template>

<style scoped>
/* Header Actions */
.drawer__header-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: var(--space-3);
}

/* Filter Tabs */
.drawer__tabs {
  display: flex;
  gap: 1px;
  background: var(--color-bg-primary);
  padding: 2px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
}

.drawer__tab {
  padding: 4px var(--space-3);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.drawer__tab:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.03);
}

.drawer__tab--active {
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Action Buttons */
.drawer__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.drawer__action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 4px var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.drawer__action-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.drawer__action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.drawer__action-icon {
  width: 14px;
  height: 14px;
  pointer-events: none;
}

.drawer__action-label {
  white-space: nowrap;
}

/* Status Filter Tabs */
.drawer__status-tabs {
  display: flex;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: var(--space-3);
}

.drawer__status-tab {
  padding: 3px var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.drawer__status-tab:hover {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.drawer__status-tab--active {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
}

/* Source Filter Chips */
.drawer__source-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--glass-border);
}

.drawer__source-chip {
  padding: 2px var(--space-2);
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.drawer__source-chip:hover {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.drawer__source-chip--active {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
}

/* Notification List */
.drawer__list {
  margin: 0 calc(-1 * var(--space-6));
}

/* Group */
.drawer__group-label {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--glass-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

/* Loading State */
.drawer__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
}

.drawer__loading-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

/* Empty State */
.drawer__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.drawer__empty-icon {
  font-size: 32px;
  opacity: 0.4;
}

.drawer__empty-text {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.drawer__empty-sub {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  max-width: 240px;
}

/* Load More */
.drawer__load-more {
  display: flex;
  justify-content: center;
  padding: var(--space-4);
}

.drawer__load-more-btn {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.drawer__load-more-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--glass-border-hover);
}

.drawer__load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Email Log Footer */
.drawer__email-footer {
  border-top: 1px solid var(--glass-border);
  margin-top: var(--space-2);
  padding: var(--space-3) var(--space-4);
}

.drawer__email-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
}

.drawer__email-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  padding: var(--space-2) 0;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color var(--transition-fast);
  text-align: left;
}

.drawer__email-all-link {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-iridescent-2);
  text-decoration: none;
  white-space: nowrap;
  padding: var(--space-2) 0;
}

.drawer__email-all-link:hover {
  text-decoration: underline;
}

.drawer__email-toggle:hover {
  color: var(--color-text-primary);
}

.drawer__email-toggle-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
}

.drawer__email-toggle-chevron {
  width: 12px;
  height: 12px;
  margin-left: auto;
  color: var(--color-text-muted);
}

.drawer__email-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-top: var(--space-2);
}

.drawer__email-entry {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-size: var(--text-xs);
}

.drawer__email-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.drawer__email-dot--sent {
  background: var(--color-success);
}

.drawer__email-dot--failed {
  background: var(--color-error);
}

.drawer__email-dot--pending {
  background: var(--color-text-muted);
}

.drawer__email-dot--permanently_failed {
  background: var(--color-error);
}

.drawer__email-retry {
  color: var(--color-text-muted);
  font-size: 10px;
  margin-left: var(--space-1);
}

.drawer__email-subject {
  flex: 1;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer__email-status {
  flex-shrink: 0;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.drawer__email-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* Expand Transition (email footer) */
.expand-enter-active,
.expand-leave-active {
  transition: all var(--transition-fast);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 300px;
}
</style>
