/**
 * Dashboard Store Tests
 *
 * Tests for the shared dashboard store that bridges
 * DashboardView (data producer) and TopBar (UI consumer).
 *
 * statusCounts and pendingCount are computed from espStore,
 * so we mock the esp store with controlled device data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref, computed, reactive } from 'vue'
import type { StatusFilter } from '@/shared/stores/dashboard.store'

// ── Mock ESP Store ──────────────────────────────────────────────────────────
// Dashboard store depends on espStore for computed counts.
// We provide a minimal mock with controllable devices/pendingDevices arrays.
// Wrapped in reactive() to mimic Pinia's auto-unwrapping of refs/computeds.

const mockDevices = ref<any[]>([])
const mockPendingDevices = ref<any[]>([])

vi.mock('@/stores/esp', () => ({
  useEspStore: () => reactive({
    devices: mockDevices,
    pendingDevices: mockPendingDevices,
    pendingCount: computed(() => mockPendingDevices.value.length),
    mockDevices: computed(() => mockDevices.value.filter((d: any) => {
      const id = d.device_id || ''
      return id.startsWith('ESP_MOCK_') || id.startsWith('MOCK_')
    })),
    realDevices: computed(() => mockDevices.value.filter((d: any) => {
      const id = d.device_id || ''
      return !id.startsWith('ESP_MOCK_') && !id.startsWith('MOCK_')
    })),
  }),
}))

// Mock WebSocket (used by espStore internally — prevents import errors)
vi.mock('@/services/websocket', () => ({
  websocketService: { disconnect: vi.fn(), connect: vi.fn(), isConnected: vi.fn(() => false), on: vi.fn(() => vi.fn()), onConnect: vi.fn(() => vi.fn()) },
}))
vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ on: vi.fn(() => vi.fn()), disconnect: vi.fn(), connect: vi.fn(), status: 'connected' })),
}))
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))

// Now import the store under test (AFTER mocks are set up)
const { useDashboardStore } = await import('@/shared/stores/dashboard.store')

/** Helper: create minimal device with controlled status */
function makeDevice(overrides: Record<string, any> = {}) {
  return {
    device_id: `ESP_TEST_${Math.random().toString(36).slice(2, 6)}`,
    ...overrides,
  }
}

describe('dashboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDevices.value = []
    mockPendingDevices.value = []
  })

  describe('initial state', () => {
    it('showControls is false', () => {
      const store = useDashboardStore()
      expect(store.showControls).toBe(false)
    })

    it('showCreateMock is false', () => {
      const store = useDashboardStore()
      expect(store.showCreateMock).toBe(false)
    })

    it('showPendingPanel is false', () => {
      const store = useDashboardStore()
      expect(store.showPendingPanel).toBe(false)
    })

    it('pendingCount is 0 with no pending devices', () => {
      const store = useDashboardStore()
      expect(store.pendingCount).toBe(0)
    })

    it('activeStatusFilters is empty', () => {
      const store = useDashboardStore()
      expect(store.activeStatusFilters.size).toBe(0)
    })

    it('filterType is "all"', () => {
      const store = useDashboardStore()
      expect(store.filterType).toBe('all')
    })

    it('navRequestCount is 0 and navTarget is 1', () => {
      const store = useDashboardStore()
      expect(store.navRequestCount).toBe(0)
      expect(store.navTarget).toBe(1)
    })

    it('breadcrumb starts at level 1 with empty names', () => {
      const store = useDashboardStore()
      expect(store.breadcrumb.level).toBe(1)
      expect(store.breadcrumb.zoneName).toBe('')
      expect(store.breadcrumb.deviceName).toBe('')
    })
  })

  describe('activate / deactivate', () => {
    it('activate() sets showControls to true', () => {
      const store = useDashboardStore()
      store.activate()
      expect(store.showControls).toBe(true)
    })

    it('deactivate() resets showControls and filters', () => {
      const store = useDashboardStore()
      store.activate()
      store.toggleStatusFilter('online')
      store.filterType = 'mock'

      store.deactivate()

      expect(store.showControls).toBe(false)
      expect(store.activeStatusFilters.size).toBe(0)
      expect(store.filterType).toBe('all')
    })
  })

  describe('showPendingPanel toggle', () => {
    it('can be set to true', () => {
      const store = useDashboardStore()
      store.showPendingPanel = true
      expect(store.showPendingPanel).toBe(true)
    })

    it('can be toggled back to false', () => {
      const store = useDashboardStore()
      store.showPendingPanel = true
      store.showPendingPanel = false
      expect(store.showPendingPanel).toBe(false)
    })
  })

  describe('showCreateMock toggle', () => {
    it('can be set to true', () => {
      const store = useDashboardStore()
      store.showCreateMock = true
      expect(store.showCreateMock).toBe(true)
    })

    it('can be toggled back to false', () => {
      const store = useDashboardStore()
      store.showCreateMock = true
      store.showCreateMock = false
      expect(store.showCreateMock).toBe(false)
    })
  })

  describe('toggleStatusFilter', () => {
    it('adds a filter when not present', () => {
      const store = useDashboardStore()
      store.toggleStatusFilter('online')
      expect(store.activeStatusFilters.has('online')).toBe(true)
    })

    it('removes a filter when already present', () => {
      const store = useDashboardStore()
      store.toggleStatusFilter('offline')
      store.toggleStatusFilter('offline')
      expect(store.activeStatusFilters.has('offline')).toBe(false)
    })

    it('can hold multiple filters simultaneously', () => {
      const store = useDashboardStore()
      store.toggleStatusFilter('online')
      store.toggleStatusFilter('warning')
      expect(store.activeStatusFilters.size).toBe(2)
      expect(store.activeStatusFilters.has('online')).toBe(true)
      expect(store.activeStatusFilters.has('warning')).toBe(true)
    })
  })

  describe('resetFilters', () => {
    it('clears all status filters and resets filterType', () => {
      const store = useDashboardStore()
      store.toggleStatusFilter('online')
      store.toggleStatusFilter('warning')
      store.filterType = 'mock'

      store.resetFilters()

      expect(store.activeStatusFilters.size).toBe(0)
      expect(store.filterType).toBe('all')
    })
  })

  describe('hasPendingDevices computed', () => {
    it('returns false when no pending devices', () => {
      const store = useDashboardStore()
      expect(store.hasPendingDevices).toBe(false)
    })

    it('returns true when pending devices exist', () => {
      mockPendingDevices.value = [{ esp_id: 'ESP_NEW_001' }]
      const store = useDashboardStore()
      expect(store.hasPendingDevices).toBe(true)
    })
  })

  describe('requestNavigate', () => {
    it('increments navRequestCount', () => {
      const store = useDashboardStore()
      store.requestNavigate(2)
      expect(store.navRequestCount).toBe(1)
      store.requestNavigate(3)
      expect(store.navRequestCount).toBe(2)
    })

    it('sets navTarget to the requested level', () => {
      const store = useDashboardStore()
      store.requestNavigate(3)
      expect(store.navTarget).toBe(3)
    })
  })

  // ── statusCounts computed (from espStore.devices via getESPStatus) ─────────
  describe('statusCounts computed', () => {
    it('returns all zeros with no devices', () => {
      const store = useDashboardStore()
      expect(store.statusCounts).toEqual({ online: 0, offline: 0, warning: 0, safeMode: 0 })
    })

    it('counts online devices (status="online")', () => {
      mockDevices.value = [
        makeDevice({ status: 'online' }),
        makeDevice({ status: 'online' }),
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.online).toBe(2)
    })

    it('counts stale as online (heartbeat 90-300s ago)', () => {
      const staleTs = new Date(Date.now() - 120_000).toISOString()
      mockDevices.value = [
        makeDevice({ last_seen: staleTs }),
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.online).toBe(1) // stale counts as online
    })

    it('counts offline devices', () => {
      mockDevices.value = [
        makeDevice({ status: 'offline' }),
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.offline).toBe(1)
    })

    it('counts unknown (no status, no timestamps) as offline', () => {
      mockDevices.value = [
        makeDevice({}), // no status, no timestamps → unknown → offline
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.offline).toBe(1)
    })

    it('counts error devices as warning', () => {
      mockDevices.value = [
        makeDevice({ status: 'error' }),
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.warning).toBe(1)
    })

    it('counts safemode devices', () => {
      mockDevices.value = [
        makeDevice({ status: 'safemode' }),
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.safeMode).toBe(1)
    })

    it('counts mock ESP with system_state ERROR as warning', () => {
      mockDevices.value = [
        makeDevice({ device_id: 'ESP_MOCK_001', connected: true, system_state: 'ERROR' }),
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.warning).toBe(1)
    })

    it('counts mock ESP with system_state SAFE_MODE as safeMode', () => {
      mockDevices.value = [
        makeDevice({ device_id: 'ESP_MOCK_002', connected: true, system_state: 'SAFE_MODE' }),
      ]
      const store = useDashboardStore()
      expect(store.statusCounts.safeMode).toBe(1)
    })

    it('handles mixed mock + real devices correctly', () => {
      mockDevices.value = [
        makeDevice({ device_id: 'ESP_MOCK_001', connected: true }),                     // online (mock)
        makeDevice({ device_id: 'ESP_MOCK_002', connected: true, system_state: 'ERROR' }), // error (mock)
        makeDevice({ device_id: 'ESP_12AB34CD', status: 'online' }),                    // online (real)
        makeDevice({ device_id: 'ESP_56EF78AB', status: 'offline' }),                   // offline (real)
      ]
      const store = useDashboardStore()
      expect(store.statusCounts).toEqual({ online: 2, offline: 1, warning: 1, safeMode: 0 })
    })

    it('is reactive to device changes', () => {
      const store = useDashboardStore()
      expect(store.statusCounts.online).toBe(0)

      mockDevices.value = [makeDevice({ status: 'online' })]
      expect(store.statusCounts.online).toBe(1)

      mockDevices.value = []
      expect(store.statusCounts.online).toBe(0)
    })
  })

  // ── problemMessage / hasProblems computed ──────────────────────────────────
  describe('problemMessage computed', () => {
    it('returns empty string when no problems', () => {
      const store = useDashboardStore()
      expect(store.problemMessage).toBe('')
    })

    it('returns warning message when error devices exist', () => {
      mockDevices.value = [
        makeDevice({ status: 'online' }),
        makeDevice({ status: 'online' }),
        makeDevice({ status: 'error' }),
      ]
      const store = useDashboardStore()
      expect(store.problemMessage).toBe('1 Gerät(e) mit Fehlern')
    })

    it('returns safe-mode message when safeMode exists (and no warnings)', () => {
      mockDevices.value = [
        makeDevice({ status: 'online' }),
        makeDevice({ status: 'online' }),
        makeDevice({ status: 'safemode' }),
        makeDevice({ status: 'safemode' }),
      ]
      const store = useDashboardStore()
      expect(store.problemMessage).toBe('2 Gerät(e) im Safe-Mode')
    })

    it('returns offline message when offline devices and some online', () => {
      mockDevices.value = [
        makeDevice({ status: 'online' }),
        makeDevice({ status: 'offline' }),
        makeDevice({ status: 'offline' }),
        makeDevice({ status: 'offline' }),
      ]
      const store = useDashboardStore()
      expect(store.problemMessage).toBe('3 Gerät(e) offline')
    })

    it('returns empty string when all offline and none online', () => {
      mockDevices.value = [
        makeDevice({ status: 'offline' }),
        makeDevice({ status: 'offline' }),
        makeDevice({ status: 'offline' }),
      ]
      const store = useDashboardStore()
      expect(store.problemMessage).toBe('')
    })

    it('warning takes priority over safeMode and offline', () => {
      mockDevices.value = [
        makeDevice({ status: 'online' }),
        makeDevice({ status: 'offline' }),
        makeDevice({ status: 'error' }),
        makeDevice({ status: 'error' }),
        makeDevice({ status: 'safemode' }),
      ]
      const store = useDashboardStore()
      expect(store.problemMessage).toBe('2 Gerät(e) mit Fehlern')
    })
  })

  describe('hasProblems computed', () => {
    it('returns false when all counts are zero', () => {
      const store = useDashboardStore()
      expect(store.hasProblems).toBe(false)
    })

    it('returns true when error devices exist', () => {
      mockDevices.value = [makeDevice({ status: 'error' })]
      const store = useDashboardStore()
      expect(store.hasProblems).toBe(true)
    })

    it('returns true when safeMode devices exist', () => {
      mockDevices.value = [makeDevice({ status: 'safemode' })]
      const store = useDashboardStore()
      expect(store.hasProblems).toBe(true)
    })
  })

  // ── deviceCounts computed ─────────────────────────────────────────────────
  describe('deviceCounts computed', () => {
    it('returns all zeros with no devices', () => {
      const store = useDashboardStore()
      expect(store.deviceCounts).toEqual({ all: 0, mock: 0, real: 0 })
    })

    it('counts all, mock, and real devices', () => {
      mockDevices.value = [
        makeDevice({ device_id: 'ESP_MOCK_001' }),
        makeDevice({ device_id: 'ESP_MOCK_002' }),
        makeDevice({ device_id: 'ESP_12AB34CD' }),
      ]
      const store = useDashboardStore()
      expect(store.deviceCounts.all).toBe(3)
      expect(store.deviceCounts.mock).toBe(2)
      expect(store.deviceCounts.real).toBe(1)
    })
  })

  // ── pendingCount computed ─────────────────────────────────────────────────
  describe('pendingCount computed', () => {
    it('reflects pending devices count', () => {
      const store = useDashboardStore()
      expect(store.pendingCount).toBe(0)

      mockPendingDevices.value = [{ esp_id: 'ESP_NEW_001' }, { esp_id: 'ESP_NEW_002' }]
      expect(store.pendingCount).toBe(2)
    })
  })
})
