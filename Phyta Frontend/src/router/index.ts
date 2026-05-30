import { createRouter, createWebHistory } from 'vue-router'
import { hasAuthToken } from '@/api/client'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/hardware',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/hardware',
      name: 'hardware',
      component: () => import('@/views/HardwareGridView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/auth-hint',
      name: 'auth-hint',
      redirect: { name: 'login', query: { redirect: '/hardware' } },
    },
    {
      path: '/hardware/:espId/scan',
      name: 'i2c-scan',
      component: () => import('@/views/I2cScanStubView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !hasAuthToken()) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }
  if (to.meta.guestOnly && hasAuthToken()) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/hardware'
    return redirect.startsWith('/') ? redirect : '/hardware'
  }
  return true
})

export default router
