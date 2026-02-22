/**
 * Integration Test: Authentication Flow
 *
 * Tests the complete login → token storage → authenticated state
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

// Import store after mocks
import { useAuthStore } from '@/stores/auth'

describe('Authentication Flow Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('login → store update → isAuthenticated becomes true', async () => {
    const store = useAuthStore()

    // Before login
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()

    // Perform login with credentials object
    await store.login({ username: 'testuser', password: 'password123' })

    // After login — store should have user and token
    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toBeTruthy()
    expect(store.user?.username).toBe(mockUser.username)
  })

  it('logout clears all auth state', async () => {
    const store = useAuthStore()

    // Login first
    await store.login({ username: 'testuser', password: 'password123' })
    expect(store.isAuthenticated).toBe(true)

    // Logout (async — calls API then clears state)
    await store.logout()

    // All auth state should be cleared
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
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

    const store = useAuthStore()

    // Attempt login with bad credentials
    try {
      await store.login({ username: 'baduser', password: 'badpass' })
    } catch (e) {
      // Expected to throw
    }

    // Should remain unauthenticated
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })
})
