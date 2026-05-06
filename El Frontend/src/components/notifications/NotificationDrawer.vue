<script setup lang="ts">
/**
 * NotificationDrawer — Slide-in inbox panel
 *
 * Uses SlideOver.vue primitive (width="lg" = 560px).
 * Lifecycle + Schweregrad-Filter; Deep-Link zum Ereignis-Monitor (AUT-269).
 */

import { ref, computed, watch } from 'vue'
import { Settings, CheckCheck, Mail, ChevronDown, ChevronUp } from 'lucide-vue-next'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import BaseToggle from '@/shared/design/primitives/BaseToggle.vue'
import NotificationItem from '@/components/notifications/NotificationItem.vue'
import NotificationPreferences from '@/components/notifications/NotificationPreferences.vue'
import {
  useNotificationInboxStore,
  type InboxFilter,
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
const isResolvingAll = ref(false)

/** Schwere als kompakte Chips — reine Info-Meldungen erscheinen unter „Alle“. */
const severityChips: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'critical', label: 'Kritisch' },
  { key: 'warning', label: 'Warnungen' },
]

const eventsMonitorLink = {
  path: '/system-monitor',
  query: { tab: 'events', level: 'kritisch,fehler' },
} as const

const statusTabs = computed(() => {
  const stats = alertStore.alertStats
  const active = stats?.active_count ?? 0
  const ack = stats?.acknowledged_count ?? 0

  return [
    { key: 'all' as StatusFilter, label: 'Alle' },
    { key: 'active' as StatusFilter, label: `Aktiv (${active})` },
    { key: 'acknowledged' as StatusFilter, label: `Bestätigt (${ack})` },
    { key: 'resolved' as StatusFilter, label: 'Erledigt' },
  ]
})

function setLifecycleFilter(key: StatusFilter): void {
  inboxStore.lifecycleFilter = key === 'all' ? 'all' : key
}

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

watch(
  () => inboxStore.isDrawerOpen,
  (isOpen) => {
    if (isOpen && authStore.isAdmin) {
      void loadEmailLog()
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
      <p class="drawer__intro">
        Hier siehst du gespeicherte Alarme und Meldungen aus dem Betrieb.
        Sofortige Live-Fehler zusätzlich als Toast — für Details nutze den Ereignis-Monitor.
      </p>
      <!-- Lifecycle first, then severity chips -->
      <div class="drawer__primary-toolbar">
        <div class="drawer__status-tabs drawer__status-tabs--inline">
          <button
            v-for="tab in statusTabs"
            :key="tab.key"
            :class="[
              'drawer__status-tab',
              {
                'drawer__status-tab--active':
                  tab.key === 'all'
                    ? inboxStore.lifecycleFilter === 'all'
                    : inboxStore.lifecycleFilter === tab.key,
              },
            ]"
            @click="setLifecycleFilter(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="drawer__severity-row">
          <span class="drawer__severity-label">Schwere</span>
          <div class="drawer__severity-chips">
            <button
              v-for="chip in severityChips"
              :key="chip.key"
              type="button"
              :class="[
                'drawer__severity-chip',
                { 'drawer__severity-chip--active': inboxStore.activeFilter === chip.key },
              ]"
              @click="inboxStore.activeFilter = chip.key"
            >
              {{ chip.label }}
            </button>
          </div>
        </div>
      </div>

      <BaseToggle
        v-model="inboxStore.showSuppressed"
        size="sm"
        active-color="purple"
        label="Unterdrückte Einträge anzeigen"
        description="Audit-Einträge zum Unterdrücken (Kanal suppressed) in der Liste einblenden."
      />

      <div class="drawer__actions-row">
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

      <!-- Notification List -->
      <div class="drawer__list">
        <!-- Loading State -->
        <div v-if="inboxStore.isLoading && inboxStore.notifications.length === 0" class="drawer__loading">
          <span class="drawer__loading-text">Lade Benachrichtigungen...</span>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="inboxStore.groupedNotifications.length === 0"
          class="drawer__empty"
        >
          <span class="drawer__empty-icon">🔔</span>
          <span class="drawer__empty-text">Keine Benachrichtigungen</span>
          <span class="drawer__empty-sub">
            {{ inboxStore.activeFilter !== 'all' || inboxStore.sourceFilter || inboxStore.lifecycleFilter !== 'all'
              ? 'Kein Ergebnis für diesen Filter'
              : 'Hier erscheinen zukünftige Alarme und Ereignisse' }}
          </span>
        </div>

        <!-- Grouped Notifications -->
        <template v-else>
          <div
            v-for="group in inboxStore.groupedNotifications"
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

      <div class="drawer__footer-nav">
        <RouterLink
          :to="eventsMonitorLink"
          class="drawer__footer-nav-link"
          @click="inboxStore.isDrawerOpen = false"
        >
          Im Ereignis-Monitor öffnen
        </RouterLink>
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
            E-Mail-Postfach
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
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: var(--space-3);
}

.drawer__intro {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.45;
  margin: 0 0 var(--space-1) 0;
}

.drawer__primary-toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  width: 100%;
}

.drawer__status-tabs--inline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding-bottom: 0;
  border-bottom: none;
  margin-bottom: 0;
  width: 100%;
}

.drawer__severity-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.drawer__severity-label {
  font-size: var(--text-xxs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.drawer__severity-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
}

.drawer__severity-chip {
  padding: 2px var(--space-2);
  font-size: var(--text-xxs);
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.drawer__severity-chip:hover {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.drawer__severity-chip--active {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
}

.drawer__actions-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
}

.drawer__footer-nav {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--glass-border);
}

.drawer__footer-nav-link {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-iridescent-2);
  text-decoration: none;
}

.drawer__footer-nav-link:hover {
  text-decoration: underline;
}

/* Action Buttons */
.drawer__actions-row .drawer__action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
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
  padding: var(--space-1) var(--space-2);
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
  z-index: var(--z-dropdown);
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
  font-size: var(--text-display);
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
  font-size: var(--text-xxs);
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
