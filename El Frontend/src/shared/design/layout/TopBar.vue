<script setup lang="ts">
/**
 * TopBar — Unified Command Strip
 *
 * Consolidates the former TopBar + ActionBar + ZoomBreadcrumb into a single
 * 48px header. Dashboard-specific controls appear only when DashboardView
 * is active (via dashboard store).
 *
 * Layout (Dashboard):
 * LEFT:   [Hamburger] [Breadcrumb: Dashboard > Zone > Device]
 * CENTER: [StatusPills] [TypeSegment]
 * RIGHT:  [+Mock] [Pending] | [NOT-AUS] | [Dot] [User]
 *
 * Layout (Other pages):
 * LEFT:   [Hamburger] [PageTitle]
 * RIGHT:  [NOT-AUS] | [Dot] [User]
 */

import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDashboardStore } from '@/shared/stores/dashboard.store'
import {
  LogOut, ChevronDown, Menu, Filter,
  Plus, Sparkles, Radio, AlertTriangle
} from 'lucide-vue-next'
import EmergencyStopButton from '@/components/safety/EmergencyStopButton.vue'
import StatusPill from '@/components/dashboard/StatusPill.vue'
import ColorLegend from '@/components/common/ColorLegend.vue'

const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const dashStore = useDashboardStore()
const showUserMenu = ref(false)
const showMobileFilters = ref(false)

// WebSocket Connection Status
const { connectionStatus } = useWebSocket({ autoConnect: true })

const connectionDotClass = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': return 'header__dot--connected'
    case 'connecting': return 'header__dot--connecting'
    case 'error': return 'header__dot--error'
    default: return 'header__dot--disconnected'
  }
})

const connectionTooltip = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': return 'Server verbunden'
    case 'connecting': return 'Verbinde...'
    case 'error': return 'Verbindungsfehler'
    default: return 'Server getrennt'
  }
})

const pageTitle = computed(() =>
  (route.meta.title as string) || 'Dashboard'
)

/** Is user on hardware or monitor route? */
const isHardwareRoute = computed(() => route.path.startsWith('/hardware'))
const isMonitorRoute = computed(() => route.path.startsWith('/monitor'))
const isRouteBasedView = computed(() => isHardwareRoute.value || isMonitorRoute.value)

/** Route-based breadcrumb segments */
const routeBreadcrumbs = computed(() => {
  const crumbs: Array<{ label: string; to?: string; current: boolean }> = []

  if (isHardwareRoute.value) {
    crumbs.push({ label: 'Hardware', to: '/hardware', current: !route.params.zoneId })
    if (route.params.zoneId) {
      const zoneName = dashStore.breadcrumb.zoneName || (route.params.zoneId as string)
      crumbs.push({
        label: zoneName,
        to: `/hardware/${route.params.zoneId}`,
        current: !route.params.espId,
      })
    }
    if (route.params.espId) {
      const deviceName = dashStore.breadcrumb.deviceName || (route.params.espId as string)
      crumbs.push({ label: deviceName, current: true })
    }
  } else if (isMonitorRoute.value) {
    crumbs.push({ label: 'Monitor', to: '/monitor', current: !route.params.zoneId })
    if (route.params.zoneId) {
      const zoneName = dashStore.breadcrumb.zoneName || (route.params.zoneId as string)
      crumbs.push({ label: zoneName, current: true })
    }
  }

  return crumbs
})

function navigateCrumb(to: string | undefined) {
  if (to) router.push(to)
}

async function handleLogout() {
  showUserMenu.value = false
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <header class="header">
    <!-- ═══ LEFT: Hamburger + Breadcrumb/Title ═══ -->
    <div class="header__left">
      <button class="header__hamburger" @click="emit('toggle-sidebar')">
        <Menu class="header__hamburger-icon" />
      </button>

      <!-- Route-based Breadcrumb (Hardware / Monitor views) -->
      <nav v-if="isRouteBasedView && routeBreadcrumbs.length > 0" class="header__breadcrumb" aria-label="Navigation">
        <template v-for="(crumb, idx) in routeBreadcrumbs" :key="idx">
          <span v-if="idx > 0" class="header__crumb-sep" aria-hidden="true">›</span>
          <button
            v-if="!crumb.current && crumb.to"
            class="header__crumb"
            @click="navigateCrumb(crumb.to)"
          >{{ crumb.label }}</button>
          <span v-else class="header__crumb--current">{{ crumb.label }}</span>
        </template>
      </nav>

      <!-- Non-Dashboard: Page Title -->
      <span v-else class="header__page-title">{{ pageTitle }}</span>
    </div>

    <!-- ═══ CENTER: Dashboard Controls ═══ -->
    <div v-if="dashStore.showControls" class="header__controls">
      <!-- Problem Alert (inline) -->
      <div v-if="dashStore.hasProblems && dashStore.problemMessage" class="header__alert">
        <AlertTriangle class="header__alert-icon" />
        <span class="header__alert-text">{{ dashStore.problemMessage }}</span>
      </div>

      <!-- Desktop Filters (≥1024px) -->
      <div class="header__filters-desktop">
        <StatusPill
          type="online"
          :count="dashStore.statusCounts.online"
          label="Online"
          :active="dashStore.activeStatusFilters.has('online')"
          @click="dashStore.toggleStatusFilter('online')"
        />
        <StatusPill
          type="offline"
          :count="dashStore.statusCounts.offline"
          label="Offline"
          :active="dashStore.activeStatusFilters.has('offline')"
          @click="dashStore.toggleStatusFilter('offline')"
        />
        <StatusPill
          v-if="dashStore.statusCounts.warning > 0"
          type="warning"
          :count="dashStore.statusCounts.warning"
          label="Fehler"
          :active="dashStore.activeStatusFilters.has('warning')"
          @click="dashStore.toggleStatusFilter('warning')"
        />
        <StatusPill
          v-if="dashStore.statusCounts.safeMode > 0"
          type="safemode"
          :count="dashStore.statusCounts.safeMode"
          label="Safe Mode"
          :active="dashStore.activeStatusFilters.has('safemode')"
          @click="dashStore.toggleStatusFilter('safemode')"
        />

        <!-- Type Segment -->
        <div class="header__type-segment">
          <button
            :class="['header__type-btn', { 'header__type-btn--active': dashStore.filterType === 'all' }]"
            @click="dashStore.filterType = 'all'"
          >Alle <span class="header__type-count">{{ dashStore.deviceCounts.all }}</span></button>
          <button
            :class="['header__type-btn', 'header__type-btn--mock', { 'header__type-btn--active': dashStore.filterType === 'mock' }]"
            @click="dashStore.filterType = 'mock'"
          >Mock <span class="header__type-count">{{ dashStore.deviceCounts.mock }}</span></button>
          <button
            :class="['header__type-btn', 'header__type-btn--real', { 'header__type-btn--active': dashStore.filterType === 'real' }]"
            @click="dashStore.filterType = 'real'"
          >Real <span class="header__type-count">{{ dashStore.deviceCounts.real }}</span></button>
        </div>
      </div>

      <!-- Mobile Filter Toggle (<1024px) -->
      <button
        class="header__filter-toggle"
        :class="{ 'header__filter-toggle--active': showMobileFilters }"
        @click="showMobileFilters = !showMobileFilters"
      >
        <Filter class="header__filter-toggle-icon" />
      </button>
    </div>

    <!-- ═══ RIGHT: Actions + Emergency + Status + User ═══ -->
    <div class="header__right">
      <!-- Dashboard Actions -->
      <template v-if="dashStore.showControls">
        <button
          class="header__action-btn header__action-btn--create"
          title="Test-ESP erstellen"
          @click="dashStore.showCreateMock = true"
        >
          <Plus class="header__action-btn-icon" />
          <span class="header__action-btn-label">Mock</span>
        </button>

        <button
          :class="[
            'header__action-btn',
            dashStore.hasPendingDevices
              ? 'header__action-btn--pending'
              : 'header__action-btn--default'
          ]"
          :title="dashStore.hasPendingDevices
            ? 'Neue Geräte warten auf Genehmigung'
            : 'Geräte verwalten'"
          @click="dashStore.showPendingPanel = true"
        >
          <component
            :is="dashStore.hasPendingDevices ? Sparkles : Radio"
            class="header__action-btn-icon"
          />
          <span class="header__action-btn-label">
            {{ dashStore.hasPendingDevices ? `${dashStore.pendingCount} Neue` : 'Geräte' }}
          </span>
        </button>

        <div class="header__divider" />
      </template>

      <!-- Color Legend -->
      <ColorLegend />

      <!-- Emergency Stop -->
      <EmergencyStopButton />
      <div class="header__divider" />

      <!-- Connection Dot -->
      <div class="header__connection" :title="connectionTooltip">
        <span class="header__dot" :class="connectionDotClass" />
        <span class="header__connection-label">{{ connectionTooltip }}</span>
      </div>

      <!-- User Menu -->
      <div class="header__user-wrapper">
        <button class="header__user-trigger" @click="showUserMenu = !showUserMenu">
          <div class="header__user-avatar">
            {{ authStore.user?.username?.charAt(0).toUpperCase() || '?' }}
          </div>
          <ChevronDown class="header__chevron" />
        </button>

        <Transition name="dropdown">
          <div v-if="showUserMenu" class="header__dropdown">
            <div class="header__dropdown-info">
              <p class="header__dropdown-name">{{ authStore.user?.username }}</p>
              <p class="header__dropdown-email">{{ authStore.user?.email || authStore.user?.role }}</p>
            </div>
            <div class="header__dropdown-actions">
              <button class="header__dropdown-item" @click="handleLogout">
                <LogOut class="header__dropdown-item-icon" />
                Abmelden
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </header>

  <!-- Mobile Filter Dropdown (slides below header) -->
  <Transition name="filter-slide">
    <div v-if="dashStore.showControls && showMobileFilters" class="header-mobile-filters">
      <div class="header-mobile-filters__pills">
        <StatusPill
          type="online"
          :count="dashStore.statusCounts.online"
          label="Online"
          :active="dashStore.activeStatusFilters.has('online')"
          @click="dashStore.toggleStatusFilter('online')"
        />
        <StatusPill
          type="offline"
          :count="dashStore.statusCounts.offline"
          label="Offline"
          :active="dashStore.activeStatusFilters.has('offline')"
          @click="dashStore.toggleStatusFilter('offline')"
        />
        <StatusPill
          v-if="dashStore.statusCounts.warning > 0"
          type="warning"
          :count="dashStore.statusCounts.warning"
          label="Fehler"
          :active="dashStore.activeStatusFilters.has('warning')"
          @click="dashStore.toggleStatusFilter('warning')"
        />
        <StatusPill
          v-if="dashStore.statusCounts.safeMode > 0"
          type="safemode"
          :count="dashStore.statusCounts.safeMode"
          label="Safe Mode"
          :active="dashStore.activeStatusFilters.has('safemode')"
          @click="dashStore.toggleStatusFilter('safemode')"
        />
      </div>

      <div class="header-mobile-filters__segment">
        <button
          :class="['header__type-btn', { 'header__type-btn--active': dashStore.filterType === 'all' }]"
          @click="dashStore.filterType = 'all'"
        >Alle <span class="header__type-count">{{ dashStore.deviceCounts.all }}</span></button>
        <button
          :class="['header__type-btn', 'header__type-btn--mock', { 'header__type-btn--active': dashStore.filterType === 'mock' }]"
          @click="dashStore.filterType = 'mock'"
        >Mock <span class="header__type-count">{{ dashStore.deviceCounts.mock }}</span></button>
        <button
          :class="['header__type-btn', 'header__type-btn--real', { 'header__type-btn--active': dashStore.filterType === 'real' }]"
          @click="dashStore.filterType = 'real'"
        >Real <span class="header__type-count">{{ dashStore.deviceCounts.real }}</span></button>
      </div>
    </div>
  </Transition>

  <!-- Click-away overlay -->
  <div
    v-if="showUserMenu"
    class="header__click-away"
    @click="showUserMenu = false"
  />
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   UNIFIED COMMAND STRIP — 48px consolidated header
   Merges TopBar + ActionBar + Breadcrumb into one strip.
   ═══════════════════════════════════════════════════════════════════════════ */

.header {
  height: var(--header-height);
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  flex-shrink: 0;
  position: relative;
  z-index: var(--z-dropdown);
  gap: var(--space-3);
}

/* ═══ LEFT SECTION ══════════════════════════════════════════════════════ */

.header__left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex-shrink: 1;
}

.header__hamburger {
  display: none;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
}

.header__hamburger:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
}

.header__hamburger-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 767px) {
  .header__hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* ── Page Title (non-dashboard) ── */
.header__page-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Breadcrumb (dashboard) ── */
.header__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.header__crumb,
.header__crumb--current {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: var(--text-sm);
  white-space: nowrap;
}

.header__crumb {
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  margin: -2px -6px;
}

.header__crumb:hover {
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.08);
}

.header__crumb--current {
  color: var(--color-text-primary);
  font-weight: 600;
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header__crumb-sep {
  color: var(--color-text-muted);
  opacity: 0.4;
  font-size: var(--text-xs);
  user-select: none;
  flex-shrink: 0;
}

/* ═══ CENTER SECTION: Dashboard Controls ════════════════════════════════ */

.header__controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  justify-content: center;
  min-width: 0;
}

/* ── Problem Alert (inline) ── */
.header__alert {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  font-size: var(--text-xs);
  color: var(--color-warning);
  white-space: nowrap;
  flex-shrink: 0;
}

.header__alert-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.header__alert-text {
  font-weight: 500;
}

/* ── Desktop Filter Row (≥1024px) ── */
.header__filters-desktop {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* ── Type Segment Control ── */
.header__type-segment {
  display: flex;
  gap: 1px;
  background: var(--color-bg-primary);
  padding: 2px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  margin-left: var(--space-2);
}

.header__type-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
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

.header__type-btn:hover {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.header__type-btn--active {
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.header__type-btn--mock.header__type-btn--active {
  color: var(--color-mock);
}

.header__type-btn--real.header__type-btn--active {
  color: var(--color-real);
}

.header__type-count {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.header__type-btn--active .header__type-count {
  opacity: 1;
}

/* ── Mobile Filter Toggle (visible <1024px) ── */
.header__filter-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
}

.header__filter-toggle:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.header__filter-toggle--active {
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.08);
}

.header__filter-toggle-icon {
  width: 16px;
  height: 16px;
}

@media (max-width: 1023px) {
  .header__filters-desktop {
    display: none;
  }

  .header__filter-toggle {
    display: flex;
  }

  .header__alert {
    display: none;
  }
}

/* ═══ RIGHT SECTION ═════════════════════════════════════════════════════ */

.header__right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* ── Action Buttons (Dashboard) ── */
.header__action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 4px var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.header__action-btn-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.header__action-btn-label {
  display: none;
}

@media (min-width: 768px) {
  .header__action-btn-label {
    display: inline;
  }
}

/* Default (Devices) */
.header__action-btn--default {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--glass-border);
}

.header__action-btn--default:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--glass-border-hover);
}

/* Pending (Iridescent Pulse) */
.header__action-btn--pending {
  position: relative;
  color: white;
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.15),
    rgba(129, 140, 248, 0.15),
    rgba(167, 139, 250, 0.15)
  );
  border-color: transparent;
  overflow: hidden;
  animation: iridescent-pulse 3s ease-in-out infinite;
}

.header__action-btn--pending::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: var(--gradient-iridescent);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: iridescent-shift 3s ease-in-out infinite;
  pointer-events: none;
}

.header__action-btn--pending:hover {
  transform: translateY(-1px);
  box-shadow:
    0 4px 12px rgba(96, 165, 250, 0.2),
    0 0 16px rgba(129, 140, 248, 0.1);
}

/* Create Mock */
.header__action-btn--create {
  color: var(--color-success);
  background: rgba(52, 211, 153, 0.06);
  border-color: rgba(52, 211, 153, 0.15);
}

.header__action-btn--create:hover {
  background: rgba(52, 211, 153, 0.12);
  border-color: rgba(52, 211, 153, 0.3);
}

/* ── Divider ── */
.header__divider {
  width: 1px;
  height: 20px;
  background-color: var(--glass-border);
  flex-shrink: 0;
}

/* ── Connection Dot ── */
.header__connection {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-1);
  cursor: default;
}

.header__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  transition: background-color var(--transition-base), box-shadow var(--transition-base);
}

.header__dot--connected {
  background-color: var(--color-success);
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
  animation: pulse-dot 3s ease-in-out infinite;
}

.header__dot--connecting {
  background-color: var(--color-warning);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

.header__dot--error {
  background-color: var(--color-error);
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
}

.header__dot--disconnected {
  background-color: var(--color-text-muted);
}

.header__connection-label {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

@media (max-width: 767px) {
  .header__connection-label {
    display: none;
  }
}

/* ── User Menu ── */
.header__user-wrapper {
  position: relative;
}

.header__user-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.header__user-trigger:hover {
  background-color: var(--color-bg-tertiary);
}

.header__user-avatar {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-bg-tertiary), var(--color-bg-quaternary));
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.header__chevron {
  width: 12px;
  height: 12px;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.header__user-trigger:hover .header__chevron {
  color: var(--color-text-secondary);
}

/* ── Dropdown ── */
.header__dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-2));
  width: 200px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-floating);
  z-index: var(--z-dropdown);
  overflow: hidden;
}

.header__dropdown-info {
  padding: var(--space-3);
  border-bottom: 1px solid var(--glass-border);
}

.header__dropdown-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.header__dropdown-email {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: 2px;
  text-transform: capitalize;
}

.header__dropdown-actions {
  padding: var(--space-1);
}

.header__dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-error);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);
}

.header__dropdown-item:hover {
  background-color: var(--color-bg-quaternary);
}

.header__dropdown-item-icon {
  width: 14px;
  height: 14px;
}

/* ═══ MOBILE FILTER DROPDOWN ════════════════════════════════════════════ */

.header-mobile-filters {
  display: none;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  z-index: var(--z-dropdown);
}

@media (max-width: 1023px) {
  .header-mobile-filters {
    display: flex;
  }
}

.header-mobile-filters__pills {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.header-mobile-filters__segment {
  display: flex;
  gap: 1px;
  background: var(--color-bg-primary);
  padding: 2px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
}

.header-mobile-filters__segment .header__type-btn {
  flex: 1;
  justify-content: center;
}

/* ═══ TRANSITIONS ═══════════════════════════════════════════════════════ */

.dropdown-enter-active {
  transition: all var(--duration-fast) var(--ease-out);
}

.dropdown-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

.filter-slide-enter-active {
  transition: all var(--duration-base) var(--ease-out);
}

.filter-slide-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}

.filter-slide-enter-from,
.filter-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ── Click-away overlay ── */
.header__click-away {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-dropdown) - 1);
}

/* ═══ REDUCED MOTION ════════════════════════════════════════════════════ */

@media (prefers-reduced-motion: reduce) {
  .header__dot--connected,
  .header__dot--connecting,
  .header__action-btn--pending,
  .header__action-btn--pending::before {
    animation: none;
  }
}
</style>
