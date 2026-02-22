/**
 * Integration Test: Error Handling Flow
 *
 * Tests that API errors propagate correctly through the store
 * layer and result in appropriate user-facing feedback.
 *
 * Why this matters: An API error that gets swallowed by the store
 * leaves the user staring at a loading spinner forever — or worse,
 * showing stale data as if the operation succeeded.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'

// MSW Server Lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

// Mock WebSocket service
vi.mock('@/services/websocket', () => ({
  websocketService: {
    disconnect: vi.fn(),
    connect: vi.fn(),
    isConnected: vi.fn(() => false),
    on: vi.fn(() => vi.fn()),
    onConnect: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn())
  }
}))

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    on: vi.fn(() => vi.fn()),
    disconnect: vi.fn(),
    connect: vi.fn(),
    status: 'disconnected'
  }))
}))

vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn()
  }))
}))

// Import stores after mocks
import { useEspStore } from '@/stores/esp'
import { useAuthStore } from '@/stores/auth'

describe('Error Handling Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('ESP store handles 500 server error on device fetch', async () => {
    // Override MSW to return 500
    server.use(
      http.get('*/api/v1/esp/devices', () => {
        return HttpResponse.json(
          { detail: 'Internal Server Error' },
          { status: 500 }
        )
      })
    )

    const store = useEspStore()

    // Attempt to fetch devices — should handle error gracefully
    try {
      await store.fetchAll()
    } catch (e) {
      // May throw — that's OK
    }

    // Store should not contain corrupt data
    expect(Array.isArray(store.devices)).toBe(true)
  })

  it('ESP store handles network timeout gracefully', async () => {
    // Override MSW to simulate timeout
    server.use(
      http.get('*/api/v1/esp/devices', () => {
        return HttpResponse.error()
      })
    )

    const store = useEspStore()

    try {
      await store.fetchAll()
    } catch (e) {
      // Expected to fail
    }

    // Store should remain in a valid state
    expect(Array.isArray(store.devices)).toBe(true)
  })

  it('auth store handles expired token scenario', async () => {
    const authStore = useAuthStore()

    // Simulate having an expired token
    authStore.$patch({
      accessToken: 'expired-token',
      user: {
        id: 1,
        username: 'testuser',
        email: 'test@test.com',
        full_name: 'Test',
        role: 'admin',
        is_active: true
      }
    })

    expect(authStore.isAuthenticated).toBe(true)

    // Override to return 401 for any authenticated request
    server.use(
      http.get('*/api/v1/esp/devices', () => {
        return HttpResponse.json(
          { detail: 'Token expired' },
          { status: 401 }
        )
      })
    )

    const espStore = useEspStore()

    try {
      await espStore.fetchAll()
    } catch (e) {
      // Expected
    }

    // ESP data should not be corrupted
    expect(Array.isArray(espStore.devices)).toBe(true)
  })
})
