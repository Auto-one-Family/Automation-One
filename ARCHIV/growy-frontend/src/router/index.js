import { createRouter, createWebHistory } from 'vue-router'
import { useCentralDataHub } from '@/stores/centralDataHub'
import HomeView from '../views/HomeView.vue'
import DashboardView from '../views/DashboardView.vue'
import SettingsView from '../views/SettingsView.vue'
import ZonesView from '../views/ZonesView.vue'
// ✅ ENTFERNT: DevicesView Import
import DevelopmentView from '../views/DevelopmentView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/zones',
      name: 'zones',
      component: ZonesView,
    },
    {
      path: '/zones/new',
      name: 'zone-new',
      component: () => import('../views/ZoneFormView.vue'),
      meta: {
        title: 'Neue Zone',
      },
    },
    {
      path: '/zones/:id/edit',
      name: 'zone-edit',
      component: () => import('../views/ZoneFormView.vue'),
      props: true,
      meta: {
        title: 'Zone bearbeiten',
      },
    },
    {
      path: '/zone/:espId/config',
      name: 'zone-config',
      component: SettingsView,
      props: true,
    },
    // ✅ ENTFERNT: /devices Route
    // ✅ NEU: Redirect von /devices zu /settings?tab=devices
    {
      path: '/devices',
      redirect: '/settings?tab=devices',
    },
    {
      path: '/devices/:espId',
      redirect: (to) => ({
        path: '/settings',
        query: { tab: 'devices', espId: to.params.espId },
      }),
    },
    {
      path: '/dev',
      name: 'development',
      component: DevelopmentView,
      meta: {
        requiresAuth: true, // Optional: restrict access in production
        developmentOnly: true, // Nur in Development verfügbar
      },
    },
  ],
})

// Update document title based on route meta
router.beforeEach(async (to, from, next) => {
  try {
    console.log('🔍 ROUTER DEBUG - Navigation to:', to.path)

    // ✅ NEU: Development-Only Route Guard
    if (to.meta.developmentOnly && !import.meta.env.DEV) {
      console.warn('Development route accessed in production:', to.path)
      next('/dashboard') // Redirect to dashboard in production
      return
    }

    // ✅ NEU: Store-Ready-Check vor Navigation
    const centralDataHub = useCentralDataHub()

    console.log('🔍 ROUTER DEBUG - centralDataHub:', centralDataHub)
    console.log('🔍 ROUTER DEBUG - isSystemInitialized:', centralDataHub.isSystemInitialized)
    console.log('🔍 ROUTER DEBUG - initializationStatus:', centralDataHub.initializationStatus)
    console.log('🔍 ROUTER DEBUG - storeReferences:', centralDataHub.storeReferences)

    // ✅ NEU: Warte auf Store-Initialisierung mit Timeout
    if (!centralDataHub.isSystemInitialized) {
      console.log('⏳ Waiting for system initialization...')

      const maxWaitTime = 5000 // 5 Sekunden
      const startTime = Date.now()

      await new Promise((resolve) => {
        const checkReady = () => {
          console.log('🔍 ROUTER DEBUG - Checking system ready...')
          console.log('🔍 ROUTER DEBUG - isSystemInitialized:', centralDataHub.isSystemInitialized)

          if (centralDataHub.isSystemInitialized) {
            console.log('✅ System ready, proceeding with navigation')
            resolve()
          } else if (Date.now() - startTime > maxWaitTime) {
            console.warn('⚠️ System initialization timeout, proceeding anyway')
            resolve()
          } else {
            setTimeout(checkReady, 100)
          }
        }
        checkReady()
      })
    }

    // Dynamischer Dokument-Titel basierend auf God-Konfiguration
    const godName = centralDataHub.centralConfig?.godName || 'God Pi'
    document.title = to.meta.title ? `${to.meta.title} - ${godName}` : godName
    console.log('✅ Router navigation proceeding to:', to.path)
    next()
  } catch (error) {
    console.error('❌ Router navigation error:', error)
    // ✅ NEU: Fallback-Navigation
    next()
  }
})

export default router
