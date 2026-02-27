/**
 * Dashboard Store Tests
 *
 * Tests for the shared dashboard store that bridges
 * DashboardView (data producer) and TopBar (UI consumer).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDashboardStore } from '@/shared/stores/dashboard.store'
import type { StatusFilter } from '@/shared/stores/dashboard.store'

describe('dashboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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

    it('pendingCount is 0', () => {
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
    it('returns false when pendingCount is 0', () => {
      const store = useDashboardStore()
      expect(store.hasPendingDevices).toBe(false)
    })

    it('returns true when pendingCount is greater than 0', () => {
      const store = useDashboardStore()
      store.pendingCount = 1
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

  describe('problemMessage computed', () => {
    it('returns empty string when no problems', () => {
      const store = useDashboardStore()
      expect(store.problemMessage).toBe('')
    })

    it('returns warning message when warnings exist', () => {
      const store = useDashboardStore()
      store.statusCounts = { online: 2, offline: 0, warning: 1, safeMode: 0 }
      expect(store.problemMessage).toBe('1 Gerät(e) mit Fehlern')
    })

    it('returns safe-mode message when safeMode exists (and no warnings)', () => {
      const store = useDashboardStore()
      store.statusCounts = { online: 2, offline: 0, warning: 0, safeMode: 2 }
      expect(store.problemMessage).toBe('2 Gerät(e) im Safe-Mode')
    })

    it('returns offline message when offline devices and some online', () => {
      const store = useDashboardStore()
      store.statusCounts = { online: 1, offline: 3, warning: 0, safeMode: 0 }
      expect(store.problemMessage).toBe('3 Gerät(e) offline')
    })

    it('returns empty string when all offline and none online', () => {
      const store = useDashboardStore()
      store.statusCounts = { online: 0, offline: 3, warning: 0, safeMode: 0 }
      expect(store.problemMessage).toBe('')
    })

    it('warning takes priority over safeMode and offline', () => {
      const store = useDashboardStore()
      store.statusCounts = { online: 1, offline: 1, warning: 2, safeMode: 1 }
      expect(store.problemMessage).toBe('2 Gerät(e) mit Fehlern')
    })
  })

  describe('hasProblems computed', () => {
    it('returns false when all counts are zero', () => {
      const store = useDashboardStore()
      expect(store.hasProblems).toBe(false)
    })

    it('returns true when warning count > 0', () => {
      const store = useDashboardStore()
      store.statusCounts = { online: 0, offline: 0, warning: 1, safeMode: 0 }
      expect(store.hasProblems).toBe(true)
    })

    it('returns true when safeMode count > 0', () => {
      const store = useDashboardStore()
      store.statusCounts = { online: 0, offline: 0, warning: 0, safeMode: 1 }
      expect(store.hasProblems).toBe(true)
    })
  })
})
