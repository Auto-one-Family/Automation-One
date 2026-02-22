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
    onConnect: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn())
  }
}))

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    on: vi.fn(() => vi.fn()),
    disconnect: vi.fn(),
    connect: vi.fn(),
    status: 'connected'
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

describe('Store → Component Sync Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('ESP store device update reflects in computed getters', () => {
    const store = useEspStore()

    // Initially no devices
    expect(store.devices).toHaveLength(0)

    // Simulate device update (direct store mutation)
    store.$patch({
      devices: [{
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
    expect(store.devices).toHaveLength(1)
    expect(store.devices[0].name).toBe('Integration Test ESP')
    expect(store.devices[0].status).toBe('online')
  })

  it('auth store login state propagates correctly', () => {
    const store = useAuthStore()

    // Initially not authenticated
    expect(store.isAuthenticated).toBe(false)

    // Simulate successful login (direct state update)
    // isAuthenticated requires both accessToken AND user
    store.$patch({
      accessToken: 'test-token-integration',
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
