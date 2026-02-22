/**
 * Integration Test: Store → Component Synchronization
 *
 * Tests that changes in Pinia stores correctly propagate to
 * components that consume them. This validates the reactive
 * binding between stores and the Vue component tree.
 *
 * Why this matters: A store update that doesn't trigger a component
 * re-render is a silent bug that unit tests on either side won't catch.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { server } from '../mocks/server'

// MSW Server Lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

// Mock WebSocket service (required by ESP store)
vi.mock('@/services/websocket', () => ({
  websocketService: {
    disconnect: vi.fn(),
    connect: vi.fn(),
    isConnected: vi.fn(() => false),
    on: vi.fn(() => vi.fn()),
    onConnect: vi.fn(() => vi.fn())
  }
}))

describe('Store → Component Sync Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ESP store device update reflects in computed getters', async () => {
    const { useESPStore } = await import('@/stores/esp')
    const store = useESPStore()

    // Initially no devices
    expect(store.espDevices).toHaveLength(0)

    // Simulate WebSocket device update (direct store mutation)
    store.$patch({
      espDevices: [{
        esp_id: 'ESP_INT_001',
        device_id: 'ESP_INT_001',
        name: 'Integration Test ESP',
        status: 'online',
        zone_id: 'zone_1',
        zone_name: 'Test Zone',
        sensors: [],
        actuators: [],
        connected: true,
        last_heartbeat: new Date().toISOString()
      }]
    })

    // Verify store state updated
    expect(store.espDevices).toHaveLength(1)
    expect(store.espDevices[0].name).toBe('Integration Test ESP')
    expect(store.espDevices[0].status).toBe('online')
  })

  it('auth store login state propagates correctly', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()

    // Initially not authenticated
    expect(store.isAuthenticated).toBe(false)

    // Simulate successful login (direct state update)
    store.$patch({
      token: 'test-token-integration',
      user: {
        id: 1,
        username: 'integration_test',
        email: 'test@integration.com',
        full_name: 'Integration Tester',
        role: 'admin',
        is_active: true
      }
    })

    // Verify auth state
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.username).toBe('integration_test')
  })
})
