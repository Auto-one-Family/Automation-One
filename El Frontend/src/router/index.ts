import { createRouter, createWebHistory } from 'vue-router'
import type { Component } from 'vue'
import { useAuthStore } from '@/shared/stores/auth.store'

/**
 * Wraps a dynamic import with retry logic.
 * Catches "Failed to fetch dynamically imported module" errors that occur
 * when Vite HMR invalidates a module or the browser cache is stale.
 * Without this wrapper, Vue Router logs an uncaught navigation error warning
 * before router.onError can handle it.
 */
const MAX_IMPORT_RETRIES = 2
const RETRY_DELAY_MS = 200

function lazyView(factory: () => Promise<{ default: Component }>): () => Promise<{ default: Component }> {
  return async () => {
    for (let attempt = 0; attempt <= MAX_IMPORT_RETRIES; attempt++) {
      try {
        return await factory()
      } catch (error) {
        const isImportError =
          error instanceof TypeError &&
          error.message?.includes('Failed to fetch dynamically imported module')
        if (!isImportError || attempt === MAX_IMPORT_RETRIES) {
          throw error
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
      }
    }
    // Unreachable — either returns or throws above
    return await factory()
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Auth routes (public)
    {
      path: '/login',
      name: 'login',
      component: lazyView(() => import('@/views/LoginView.vue')),
      meta: { requiresAuth: false },
    },
    {
      path: '/setup',
      name: 'setup',
      component: lazyView(() => import('@/views/SetupView.vue')),
      meta: { requiresAuth: false },
    },

    // Protected routes (require auth)
    {
      path: '/',
      component: lazyView(() => import('@/shared/design/layout/AppShell.vue')),
      meta: { requiresAuth: true },
      children: [
        // Default redirect to /hardware (primary landing page)
        {
          path: '',
          redirect: '/hardware',
        },

        // ═══════════════════════════════════════════════════════════════════
        // HARDWARE VIEW — Übersicht: Zone Accordion + ESP Orbital (/hardware)
        // ═══════════════════════════════════════════════════════════════════
        {
          path: 'hardware',
          name: 'hardware',
          component: lazyView(() => import('@/views/HardwareView.vue')),
          meta: { title: 'Übersicht' },
        },
        {
          path: 'hardware/:zoneId',
          name: 'hardware-zone',
          component: lazyView(() => import('@/views/HardwareView.vue')),
          meta: { title: 'Übersicht' },
        },
        {
          path: 'hardware/:zoneId/:espId',
          name: 'hardware-esp',
          component: lazyView(() => import('@/views/HardwareView.vue')),
          meta: { title: 'Übersicht' },
        },

        // ═══════════════════════════════════════════════════════════════════
        // MONITOR VIEW — Sensor & Actuator Data (/monitor)
        // ═══════════════════════════════════════════════════════════════════
        {
          path: 'monitor',
          name: 'monitor',
          component: lazyView(() => import('@/views/MonitorView.vue')),
          meta: { title: 'Monitor' },
        },
        // IMPORTANT: monitor/dashboard/:dashboardId MUST come BEFORE monitor/:zoneId
        // otherwise Vue Router interprets "dashboard" as a zoneId (greedy matching)
        {
          path: 'monitor/dashboard/:dashboardId',
          name: 'monitor-dashboard',
          component: lazyView(() => import('@/views/MonitorView.vue')),
          meta: { title: 'Monitor' },
        },
        {
          path: 'monitor/:zoneId',
          name: 'monitor-zone',
          component: lazyView(() => import('@/views/MonitorView.vue')),
          meta: { title: 'Monitor' },
        },
        {
          path: 'monitor/:zoneId/sensor/:sensorId',
          name: 'monitor-sensor',
          component: lazyView(() => import('@/views/MonitorView.vue')),
          meta: { title: 'Monitor' },
        },
        {
          path: 'monitor/:zoneId/dashboard/:dashboardId',
          name: 'monitor-zone-dashboard',
          component: lazyView(() => import('@/views/MonitorView.vue')),
          meta: { title: 'Monitor' },
        },

        // ═══════════════════════════════════════════════════════════════════
        // EDITOR — Dashboard Widget Builder (/editor)
        // ═══════════════════════════════════════════════════════════════════
        {
          path: 'editor',
          name: 'editor',
          component: lazyView(() => import('@/views/CustomDashboardView.vue')),
          meta: { title: 'Editor' },
        },
        {
          path: 'editor/:dashboardId',
          name: 'editor-dashboard',
          component: lazyView(() => import('@/views/CustomDashboardView.vue')),
          meta: { title: 'Editor' },
        },
        // DEPRECATED 2026-03-01: /custom-dashboard → /editor
        {
          path: 'custom-dashboard',
          redirect: '/editor',
        },

        // DEPRECATED 2026-02-23: DashboardView-Legacy → Hardware
        {
          path: 'dashboard-legacy',
          redirect: '/hardware',
        },

        // DEPRECATED redirects (backward compatibility)
        {
          path: 'devices',
          name: 'devices',
          redirect: '/hardware',
        },
        {
          path: 'devices/:espId',
          name: 'device-detail',
          redirect: (to) => ({
            path: '/hardware',
            query: { openSettings: to.params.espId as string },
          }),
        },
        {
          path: 'mock-esp',
          redirect: '/hardware',
        },
        {
          path: 'mock-esp/:espId',
          redirect: (to) => ({
            path: '/hardware',
            query: { openSettings: to.params.espId as string },
          }),
        },
        // DEPRECATED 2026-01-23: DatabaseExplorerView → System Monitor
        {
          path: 'database',
          name: 'database',
          redirect: '/system-monitor?tab=database',
        },
        // DEPRECATED 2026-01-23: LogViewerView → System Monitor
        {
          path: 'logs',
          name: 'logs',
          redirect: '/system-monitor?tab=logs',
        },
        {
          path: 'system-monitor',
          name: 'system-monitor',
          component: lazyView(() => import('@/views/SystemMonitorView.vue')),
          meta: { requiresAdmin: true, title: 'System Monitor' },
        },
        // DEPRECATED 2026-01-24: AuditLogView → System Monitor (Phase 1 Konsolidierung)
        // Alle Funktionen sind in SystemMonitorView Tab "Ereignisse" verfügbar
        {
          path: 'audit',
          name: 'audit',
          redirect: '/system-monitor?tab=events',
        },
        {
          path: 'users',
          name: 'users',
          component: lazyView(() => import('@/views/UserManagementView.vue')),
          meta: { requiresAdmin: true, title: 'Benutzerverwaltung' },
        },
        {
          path: 'system-config',
          name: 'system-config',
          component: lazyView(() => import('@/views/SystemConfigView.vue')),
          meta: { requiresAdmin: true, title: 'Systemkonfiguration' },
        },
        {
          path: 'load-test',
          name: 'load-test',
          component: lazyView(() => import('@/views/LoadTestView.vue')),
          meta: { requiresAdmin: true, title: 'Last-Tests' },
        },
        // DEPRECATED 2026-01-23: MqttLogView → System Monitor
        {
          path: 'mqtt-log',
          name: 'mqtt-log',
          redirect: '/system-monitor?tab=mqtt',
        },
        // MaintenanceView bleibt als eigene Route erreichbar
        {
          path: 'maintenance',
          name: 'maintenance',
          component: lazyView(() => import('@/views/MaintenanceView.vue')),
          meta: { requiresAdmin: true, title: 'Wartung' },
        },
        {
          path: 'plugins',
          name: 'plugins',
          component: lazyView(() => import('@/views/PluginsView.vue')),
          meta: { requiresAdmin: true, title: 'AutoOps Plugins' },
        },
        {
          path: 'sensors',
          name: 'sensors',
          component: lazyView(() => import('@/views/SensorsView.vue')),
          meta: { title: 'Komponenten' },
        },
        // DEPRECATED 2025-01-04: ActuatorsView → SensorsView with tab query
        {
          path: 'actuators',
          name: 'actuators',
          redirect: '/sensors?tab=actuators',
        },
        {
          path: 'logic',
          name: 'logic',
          component: lazyView(() => import('@/views/LogicView.vue')),
          meta: { title: 'Automatisierung' },
        },
        {
          path: 'logic/:ruleId',
          name: 'logic-rule',
          component: lazyView(() => import('@/views/LogicView.vue')),
          meta: { title: 'Automatisierung' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: lazyView(() => import('@/views/SettingsView.vue')),
          meta: { title: 'Einstellungen' },
        },
        {
          path: 'calibration',
          name: 'calibration',
          component: lazyView(() => import('@/views/CalibrationView.vue')),
          meta: { requiresAdmin: true, title: 'Kalibrierung' },
        },
        // DEPRECATED 2026-03-01: SensorHistoryView → Monitor (integriert in Monitor L3 SlideOver)
        {
          path: 'sensor-history',
          name: 'sensor-history',
          redirect: '/monitor',
        },
      ],
    },

    // Catch-all redirect
    {
      path: '/:pathMatch(.*)*',
      redirect: '/hardware',
    },
  ],
})

// Dynamic import failure recovery — when browser runs out of resources
// (ERR_INSUFFICIENT_RESOURCES) or chunks fail to load, reload the page once.
const RELOAD_COOLDOWN_MS = 10_000
router.onError((error, to) => {
  if (
    error.message?.includes('Failed to fetch dynamically imported module') ||
    error.message?.includes('Loading chunk') ||
    error.message?.includes('ERR_INSUFFICIENT_RESOURCES')
  ) {
    const lastReload = sessionStorage.getItem('__route_reload_ts')
    const now = Date.now()
    if (lastReload && now - Number(lastReload) < RELOAD_COOLDOWN_MS) {
      console.error('[Router] Dynamic import failed repeatedly, not reloading again', to.fullPath)
      return
    }
    sessionStorage.setItem('__route_reload_ts', String(now))
    window.location.assign(to.fullPath)
  }
})

// Navigation guards
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // Wait for auth status check if not done yet
  if (authStore.setupRequired === null) {
    await authStore.checkAuthStatus()
  }

  // Redirect to setup if required
  if (authStore.setupRequired && to.name !== 'setup') {
    return next({ name: 'setup' })
  }

  // Check if route requires auth
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // Check if route requires admin
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return next({ name: 'hardware' })
  }

  // Redirect authenticated users away from login/setup
  if (authStore.isAuthenticated && (to.name === 'login' || to.name === 'setup')) {
    return next({ name: 'hardware' })
  }

  next()
})

export default router
