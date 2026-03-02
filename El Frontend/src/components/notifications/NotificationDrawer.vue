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

import { watch } from 'vue'
import { Settings, CheckCheck } from 'lucide-vue-next'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import NotificationItem from '@/components/notifications/NotificationItem.vue'
import NotificationPreferences from '@/components/notifications/NotificationPreferences.vue'
import { useNotificationInboxStore, type InboxFilter } from '@/shared/stores/notification-inbox.store'

const inboxStore = useNotificationInboxStore()

const filterTabs: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'critical', label: 'Kritisch' },
  { key: 'warning', label: 'Warnungen' },
  { key: 'system', label: 'System' },
]

function handleClose(): void {
  inboxStore.isDrawerOpen = false
}

function handleMarkRead(id: string): void {
  inboxStore.markAsRead(id)
}

function handleMarkAllRead(): void {
  inboxStore.markAllAsRead()
}

// Refresh list when drawer opens
watch(
  () => inboxStore.isDrawerOpen,
  (isOpen) => {
    if (isOpen) {
      inboxStore.loadInitial()
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
            title="Alle als gelesen markieren"
            :disabled="inboxStore.unreadCount === 0"
            @click="handleMarkAllRead"
          >
            <CheckCheck class="drawer__action-icon" />
            <span class="drawer__action-label">Alle gelesen</span>
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
            {{ inboxStore.activeFilter !== 'all'
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
</style>
