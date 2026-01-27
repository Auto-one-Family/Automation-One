import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Auth routes (public)
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/SetupView.vue'),
      meta: { requiresAuth: false },
    },

    // Protected routes (require auth)
    {
      path: '/',
      component: () => import('@/components/layout/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: 'Dashboard' },
        },
        // DEPRECATED 2025-01-04: DevicesView → Dashboard redirect
        {
          path: 'devices',
          name: 'devices',
          redirect: '/',
        },
        // DEPRECATED 2025-01-04: DeviceDetailView → Dashboard with openSettings query
        {
          path: 'devices/:espId',
          name: 'device-detail',
          redirect: (to) => ({
            path: '/',
            query: { openSettings: to.params.espId as string },
          }),
        },
        // Backward compatibility redirects (legacy mock-esp routes)
        {
          path: 'mock-esp',
          redirect: '/',
        },
        {
          path: 'mock-esp/:espId',
          redirect: (to) => ({
            path: '/',
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
          component: () => import('@/views/SystemMonitorView.vue'),
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
          component: () => import('@/views/UserManagementView.vue'),
          meta: { requiresAdmin: true, title: 'Benutzerverwaltung' },
        },
        {
          path: 'system-config',
          name: 'system-config',
          component: () => import('@/views/SystemConfigView.vue'),
          meta: { requiresAdmin: true, title: 'Systemkonfiguration' },
        },
        {
          path: 'load-test',
          name: 'load-test',
          component: () => import('@/views/LoadTestView.vue'),
          meta: { requiresAdmin: true, title: 'Last-Tests' },
        },
        // DEPRECATED 2026-01-23: MqttLogView → System Monitor
        {
          path: 'mqtt-log',
          name: 'mqtt-log',
          redirect: '/system-monitor?tab=mqtt',
        },
        {
          path: 'maintenance',
          name: 'maintenance',
          component: () => import('@/views/MaintenanceView.vue'),
          meta: { requiresAdmin: true, title: 'Wartung' },
        },
        {
          path: 'sensors',
          name: 'sensors',
          component: () => import('@/views/SensorsView.vue'),
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
          component: () => import('@/views/LogicView.vue'),
          meta: { title: 'Automatisierung' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: 'Einstellungen' },
        },
      ],
    },

    // Catch-all redirect
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
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
    return next({ name: 'dashboard' })
  }

  // Redirect authenticated users away from login/setup
  if (authStore.isAuthenticated && (to.name === 'login' || to.name === 'setup')) {
    return next({ name: 'dashboard' })
  }

  next()
})

export default router
