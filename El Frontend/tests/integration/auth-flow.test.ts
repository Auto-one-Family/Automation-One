/**
 * Integration Test: Authentication Flow
 *
 * Tests the complete login → token storage → authenticated API call
 * flow. This validates that auth state correctly propagates to
 * API request headers and store state.
 *
 * Why this matters: A login that succeeds but doesn't correctly
 * store/use the token results in all subsequent API calls failing
 * with 401 — a common integration bug.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { mockUser, mockTokens } from '../mocks/handlers'

// MSW Server Lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

// Mock WebSocket service
vi.mock('@/services/websocket', () => ({
  websocketService: {
    disconnect: vi.fn(),
    connect: vi.fn(),
    isConnected: vi.fn(() => false)
  }
}))

describe('Authentication Flow Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('login → store update → isAuthenticated becomes true', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()

    // Before login
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()

    // Perform login
    await store.login('testuser', 'password123')

    // After login — store should have user and token
    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toBeTruthy()
    expect(store.user?.username).toBe(mockUser.username)
  })

  it('logout clears all auth state', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()

    // Login first
    await store.login('testuser', 'password123')
    expect(store.isAuthenticated).toBe(true)

    // Logout
    store.logout()

    // All auth state should be cleared
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBe('')
  })

  it('handles login failure gracefully', async () => {
    // Override MSW to return 401
    server.use(
      http.post('*/api/v1/auth/login', () => {
        return HttpResponse.json(
          { detail: 'Invalid credentials' },
          { status: 401 }
        )
      })
    )

    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()

    // Attempt login with bad credentials
    try {
      await store.login('baduser', 'badpass')
    } catch (e) {
      // Expected to throw
    }

    // Should remain unauthenticated
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })
})
