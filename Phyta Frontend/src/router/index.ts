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
      path: '/hardware',
      name: 'hardware',
      component: () => import('@/views/HardwareGridView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/auth-hint',
      name: 'auth-hint',
      component: () => import('@/views/AuthHintView.vue'),
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
    return { name: 'auth-hint' }
  }
  return true
})

export default router
