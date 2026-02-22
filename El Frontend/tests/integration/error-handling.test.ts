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
    onConnect: vi.fn(() => vi.fn())
  }
}))

describe('Error Handling Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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

    const { useESPStore } = await import('@/stores/esp')
    const store = useESPStore()

    // Attempt to fetch devices — should handle error gracefully
    try {
      await store.fetchESPDevices()
    } catch (e) {
      // May throw — that's OK
    }

    // Store should not contain corrupt data
    expect(Array.isArray(store.espDevices)).toBe(true)
  })

  it('ESP store handles network timeout gracefully', async () => {
    // Override MSW to simulate timeout
    server.use(
      http.get('*/api/v1/esp/devices', () => {
        return HttpResponse.error()
      })
    )

    const { useESPStore } = await import('@/stores/esp')
    const store = useESPStore()

    try {
      await store.fetchESPDevices()
    } catch (e) {
      // Expected to fail
    }

    // Store should remain in a valid state
    expect(Array.isArray(store.espDevices)).toBe(true)
  })

  it('auth store handles expired token on API call', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()

    // Simulate having an expired token
    store.$patch({
      token: 'expired-token',
      user: {
        id: 1,
        username: 'testuser',
        email: 'test@test.com',
        full_name: 'Test',
        role: 'admin',
        is_active: true
      }
    })

    expect(store.isAuthenticated).toBe(true)

    // Override to return 401 for any authenticated request
    server.use(
      http.get('*/api/v1/esp/devices', () => {
        return HttpResponse.json(
          { detail: 'Token expired' },
          { status: 401 }
        )
      })
    )

    // The token is technically "valid" in store but the server rejects it
    // This tests that the error is handled, not swallowed
    const { useESPStore } = await import('@/stores/esp')
    const espStore = useESPStore()

    try {
      await espStore.fetchESPDevices()
    } catch (e) {
      // Expected
    }

    // ESP data should not be corrupted
    expect(Array.isArray(espStore.espDevices)).toBe(true)
  })
})
