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
import { useEspStore } from '@/stores/esp'
import {
  LogOut, ChevronDown, Menu, Filter,
  Plus, Sparkles, Radio, AlertTriangle,
} from 'lucide-vue-next'
import EmergencyStopButton from '@/components/safety/EmergencyStopButton.vue'
import AlertStatusBar from '@/components/notifications/AlertStatusBar.vue'
import StatusPill from '@/components/dashboard/StatusPill.vue'

const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const dashStore = useDashboardStore()
const espStore = useEspStore()
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
  if (espStore.hasFlappingDevices) {
    const n = espStore.flappingDeviceCount
    const serverPart = connectionStatus.value === 'connected'
      ? 'Server verbunden'
      : connectionStatus.value === 'connecting'
        ? 'Verbinde...'
        : 'Server getrennt'
    return `${serverPart} · ${n} Gerät${n > 1 ? 'e' : ''} instabil`
  }
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

const pendingAndUnassignedCount = computed(() =>
  espStore.pendingDevices.length + espStore.unassignedDevices.length
)

const headerMetrics = computed(() => ([
  {
    key: 'real',
    label: 'Real',
    value: dashStore.deviceCounts.real,
    variant: 'header__metric-chip--real',
  },
  {
    key: 'mock',
    label: 'Mock',
    value: dashStore.deviceCounts.mock,
    variant: 'header__metric-chip--mock',
  },
  {
    key: 'offline',
    label: 'Offline',
    value: dashStore.statusCounts.offline,
    variant: 'header__metric-chip--offline',
  },
]))

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

      <span class="header__page-title">{{ pageTitle }}</span>
    </div>

    <!-- ═══ CENTER: Dashboard Controls ═══ -->
    <div v-if="dashStore.showControls" class="header__controls">
      <!-- Compact metrics chips -->
      <div class="header__metrics" aria-label="Dashboard-Metriken">
        <span
          v-for="metric in headerMetrics"
          :key="metric.key"
          class="header__metric-chip"
          :class="metric.variant"
        >
          {{ metric.label }} {{ metric.value }}
        </span>
      </div>

      <!-- Problem Alert (inline) -->
      <div v-if="dashStore.hasProblems && dashStore.problemMessage" class="header__alert">
        <AlertTriangle class="header__alert-icon" />
        <span class="header__alert-text">{{ dashStore.problemMessage }}</span>
      </div>

      <!-- Desktop Filters — only visible when devices exist (≥1024px) -->
      <div v-if="dashStore.deviceCounts.all > 0" class="header__filters-desktop">
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

      <!-- Mobile Filter Toggle (<1024px, only when devices exist) -->
      <button
        v-if="dashStore.deviceCounts.all > 0"
        class="header__filter-toggle"
        :class="{ 'header__filter-toggle--active': showMobileFilters }"
        @click="showMobileFilters = !showMobileFilters"
      >
        <Filter class="header__filter-toggle-icon" />
      </button>
    </div>

    <!-- ═══ RIGHT: Actions + System ═══ -->
    <div class="header__right">
      <!-- Pending/Unassigned Badge (visible on ALL routes) -->
      <button
        :class="[
          'header__action-btn',
          pendingAndUnassignedCount > 0
            ? 'header__action-btn--pending'
            : 'header__action-btn--default'
        ]"
        :title="pendingAndUnassignedCount > 0
          ? `${pendingAndUnassignedCount} Geräte offen`
          : 'Geräte verwalten'"
        @click="dashStore.showPendingPanel = true"
      >
        <component
          :is="pendingAndUnassignedCount > 0 ? Sparkles : Radio"
          class="header__action-btn-icon"
        />
        <span class="header__action-btn-label">
          {{ pendingAndUnassignedCount > 0 ? `${pendingAndUnassignedCount} offen` : 'Geräte' }}
        </span>
      </button>

      <!-- Dashboard Actions (only on hardware routes) -->
      <template v-if="dashStore.showControls">
        <button
          class="header__action-btn header__action-btn--create"
          title="Test-ESP erstellen"
          @click="dashStore.showCreateMock = true"
        >
          <Plus class="header__action-btn-icon" />
          <span class="header__action-btn-label">Mock</span>
        </button>
      </template>

      <div class="header__alerts-group">
        <div class="header__divider" />
        <!-- Alert Status (Phase 4B — ISA-18.2) -->
        <AlertStatusBar />
        <div class="header__divider" />
      </div>

      <!-- Emergency Stop -->
      <EmergencyStopButton />

      <!-- Connection Dot + Flapping Indicator + User -->
      <div class="header__connection" :title="connectionTooltip">
        <span
          v-if="espStore.hasFlappingDevices"
          class="header__flapping-badge"
          :title="`${espStore.flappingDeviceCount} Gerät${espStore.flappingDeviceCount > 1 ? 'e' : ''} mit instabiler Verbindung`"
        >
          <AlertTriangle class="header__flapping-icon" />
          <span class="header__flapping-count">{{ espStore.flappingDeviceCount }}</span>
        </span>
        <span class="header__dot" :class="connectionDotClass" />
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

  <!-- Mobile Filter Dropdown (slides below header, only when devices exist) -->
  <Transition name="filter-slide">
    <div v-if="dashStore.showControls && showMobileFilters && dashStore.deviceCounts.all > 0" class="header-mobile-filters">
      <div class="header-mobile-filters__pills">
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
  --header-control-size: 32px;
  --header-action-padding-y: 4px;
  --header-action-padding-x: var(--space-2);
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
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
  overflow: hidden;
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
  max-width: 200px;
}

.header__crumb-sep {
  color: var(--color-text-muted);
  opacity: 0.4;
  font-size: var(--text-xs);
  user-select: none;
  flex-shrink: 0;
}

/* Cross-tab link (Monitor ↔ Hardware) */
.header__cross-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color var(--transition-fast), background var(--transition-fast);
  flex-shrink: 0;
}

.header__cross-link:hover {
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.08);
}

.header__cross-link-icon {
  width: 13px;
  height: 13px;
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

/* ── Compact Status Chip (Online/Total) ── */
.header__status-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
  cursor: default;
}

.header__metrics {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.header__metric-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.header__metric-chip--real {
  color: var(--color-real);
}

.header__metric-chip--mock {
  color: var(--color-mock);
}

.header__metric-chip--offline {
  color: var(--color-warning);
}

.header__status-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.header__status-dot--online {
  background-color: var(--color-success);
  box-shadow: 0 0 4px var(--color-success);
}

.header__status-dot--offline {
  background-color: var(--color-text-muted);
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
  border-radius: var(--radius-xs);
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
  font-size: var(--text-xxs);
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

@media (max-width: 1399px) {
  .header__type-segment {
    display: none;
  }

  .header__crumb--current {
    max-width: 140px;
  }
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

  .header__crumb--current {
    max-width: 100px;
  }

  .header__divider {
    height: 16px;
  }

  .header__right {
    gap: var(--space-1);
  }
}

@media (max-width: 767px) {
  .header {
    padding: 0 var(--space-2);
    gap: var(--space-2);
  }

  .header__left {
    max-width: 42%;
  }

  .header__controls {
    justify-content: flex-start;
  }

  .header__metrics {
    display: none;
  }

  .header__right {
    gap: var(--space-1);
  }

  .header__connection {
    display: none;
  }

  .header__flapping-badge {
    display: none;
  }
}

/* Medium widths: keep single-row and reduce low-priority noise */
@media (max-width: 900px) {
  .header {
    flex-wrap: nowrap;
    align-items: center;
    padding: 0 var(--space-2);
  }

  .header__left {
    flex: 1;
    min-width: 0;
  }

  .header__controls {
    flex: 0 0 auto;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .header__breadcrumb {
    gap: var(--space-1);
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .header__crumb,
  .header__crumb--current {
    max-width: clamp(72px, 18vw, 132px);
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
    vertical-align: bottom;
  }

  .header__alerts-group,
  .header__action-btn--create {
    display: none;
  }

  .header__right {
    gap: var(--space-1);
  }
}

/* Compact displays: reduce visual blur and increase edge contrast */
@media (max-width: 1366px), (max-height: 820px) {
  .header {
    border-bottom-color: var(--glass-border-hover);
  }

  .header__status-chip,
  .header__metric-chip,
  .header__type-segment,
  .header__action-btn--default {
    background: var(--color-bg-tertiary);
    border-color: var(--glass-border-hover);
    box-shadow: none;
  }

  .header__action-btn--pending {
    animation: none;
    background: rgba(96, 165, 250, 0.12);
    border-color: rgba(129, 140, 248, 0.35);
  }

  .header__action-btn--pending::before {
    animation: none;
    opacity: 0.65;
  }

  .header__action-btn--pending:hover {
    transform: none;
    box-shadow: none;
  }

  .header__dot--connected,
  .header__dot--connecting {
    animation: none;
    box-shadow: none;
  }

  .header__flapping-badge {
    animation: none;
  }
}

/* ═══ RIGHT SECTION ═════════════════════════════════════════════════════ */

.header__right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  min-width: 0;
}

.header__alerts-group {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/* ── Action Buttons (Dashboard) ── */
.header__action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--header-action-padding-y) var(--header-action-padding-x);
  min-height: var(--header-control-size);
  font-size: var(--text-xs);
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.header__action-btn-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.header__action-btn-label {
  display: none;
}

@media (min-width: 1280px) {
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
  padding: 0 6px;
  min-height: var(--header-control-size);
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

/* ── Flapping Indicator (PKG-20) ── */
.header__flapping-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: var(--color-warning);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  animation: flapping-pulse 2s ease-in-out infinite;
  cursor: default;
}

.header__flapping-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.header__flapping-count {
  font-variant-numeric: tabular-nums;
}

@keyframes flapping-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Connection label removed — tooltip-only via :title attribute */

/* ── User Menu ── */
.header__user-wrapper {
  position: relative;
}

.header__user-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px;
  min-height: var(--header-control-size);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.header__user-trigger:hover {
  background-color: var(--color-bg-tertiary);
}

.header__user-avatar {
  width: 24px;
  height: 24px;
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

@media (min-width: 1536px) {
  .header {
    --header-control-size: 40px;
    --header-action-padding-y: 8px;
    --header-action-padding-x: var(--space-3);
  }

  .header__right {
    gap: var(--space-3);
  }

  .header__action-btn {
    font-size: var(--text-sm);
  }

  .header__action-btn-icon {
    width: 16px;
    height: 16px;
  }

  .header__divider {
    height: 24px;
  }

  .header__dot {
    width: 8px;
    height: 8px;
  }

  .header__user-avatar {
    width: 30px;
    height: 30px;
    font-size: var(--text-sm);
  }

  .header__chevron {
    width: 14px;
    height: 14px;
  }
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

/* ── SVG pointer-events fix: prevent SVG icons from intercepting clicks on parent buttons ── */
.header__type-btn svg,
.header__action-btn svg {
  pointer-events: none;
}

/* ═══ REDUCED MOTION ════════════════════════════════════════════════════ */

@media (prefers-reduced-motion: reduce) {
  .header__dot--connected,
  .header__dot--connecting,
  .header__action-btn--pending,
  .header__action-btn--pending::before,
  .header__flapping-badge {
    animation: none;
  }
}
</style>
