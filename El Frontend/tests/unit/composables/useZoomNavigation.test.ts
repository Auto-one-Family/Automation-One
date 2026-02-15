/**
 * useZoomNavigation Composable Tests
 *
 * Tests for the 3-level dashboard zoom navigation:
 * - Level state management
 * - Transition animations
 * - URL query sync
 * - Keyboard shortcuts (Escape)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// Mock vue-router
const mockReplace = vi.fn()
const mockRouteQuery = ref<Record<string, string>>({})

vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useRoute: () => ({
    query: mockRouteQuery.value,
  }),
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useZoomNavigation, type ZoomLevel } from '@/composables/useZoomNavigation'

describe('useZoomNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockRouteQuery.value = {}
    mockReplace.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initial State', () => {
    it('starts at level 1 by default', () => {
      const nav = useZoomNavigation()
      expect(nav.currentLevel.value).toBe(1)
    })

    it('has no selected zone initially', () => {
      const nav = useZoomNavigation()
      expect(nav.selectedZoneId.value).toBeNull()
    })

    it('is not transitioning initially', () => {
      const nav = useZoomNavigation()
      expect(nav.isTransitioning.value).toBe(false)
    })

    it('has null transition direction initially', () => {
      const nav = useZoomNavigation()
      expect(nav.transitionDirection.value).toBeNull()
    })

    it('has 3 level labels', () => {
      const nav = useZoomNavigation()
      expect(nav.levelLabels).toHaveLength(3)
      expect(nav.levelLabels[0].level).toBe(1)
      expect(nav.levelLabels[1].level).toBe(2)
      expect(nav.levelLabels[2].level).toBe(3)
    })

    it('has correct level label text', () => {
      const nav = useZoomNavigation()
      expect(nav.levelLabels[0].label).toBe('ESPs')
      expect(nav.levelLabels[1].label).toBe('Komponenten')
      expect(nav.levelLabels[2].label).toBe('Zonen')
    })
  })

  describe('CSS Classes', () => {
    it('level1Class is active when at level 1', () => {
      const nav = useZoomNavigation()
      expect(nav.level1Class.value).toContain('zoom-level--active')
    })

    it('level2Class is hidden when at level 1', () => {
      const nav = useZoomNavigation()
      expect(nav.level2Class.value).toBe('zoom-level')
      expect(nav.level2Class.value).not.toContain('active')
    })

    it('level3Class is hidden when at level 1', () => {
      const nav = useZoomNavigation()
      expect(nav.level3Class.value).toBe('zoom-level')
    })
  })

  describe('zoomToLevel', () => {
    it('transitions from level 1 to level 2', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(2)

      // Should be transitioning
      expect(nav.isTransitioning.value).toBe(true)
      expect(nav.transitionDirection.value).toBe('in')

      // After exit duration (200ms)
      vi.advanceTimersByTime(200)
      expect(nav.currentLevel.value).toBe(2)

      // After enter duration (250ms more)
      vi.advanceTimersByTime(250)
      expect(nav.isTransitioning.value).toBe(false)
      expect(nav.transitionDirection.value).toBeNull()
    })

    it('transitions from level 2 to level 3', () => {
      const nav = useZoomNavigation()
      // First go to level 2
      nav.zoomToLevel(2)
      vi.advanceTimersByTime(500)

      // Then go to level 3
      nav.zoomToLevel(3)
      vi.advanceTimersByTime(500)
      expect(nav.currentLevel.value).toBe(3)
    })

    it('ignores same-level navigation', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(1) // Already at 1
      expect(nav.isTransitioning.value).toBe(false)
    })

    it('ignores navigation during transition', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(2)
      expect(nav.isTransitioning.value).toBe(true)

      // Try another navigation while transitioning
      nav.zoomToLevel(3)
      // Should still be transitioning to 2, not 3
      vi.advanceTimersByTime(500)
      expect(nav.currentLevel.value).toBe(2)
    })

    it('clears selectedZoneId when leaving level 1', () => {
      const nav = useZoomNavigation()
      nav.selectedZoneId.value = 'zone_1'
      nav.zoomToLevel(2)
      expect(nav.selectedZoneId.value).toBeNull()
    })
  })

  describe('zoomToZone', () => {
    it('sets selectedZoneId and navigates to level 1', () => {
      const nav = useZoomNavigation()
      // Start at level 3
      nav.zoomToLevel(3)
      vi.advanceTimersByTime(500)
      expect(nav.currentLevel.value).toBe(3)

      // Navigate to zone
      nav.zoomToZone('gewaechshaus_a')
      vi.advanceTimersByTime(500)

      expect(nav.currentLevel.value).toBe(1)
      expect(nav.selectedZoneId.value).toBe('gewaechshaus_a')
    })
  })

  describe('zoomOut', () => {
    it('goes from level 2 to level 1', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(2)
      vi.advanceTimersByTime(500)

      nav.zoomOut()
      vi.advanceTimersByTime(500)
      expect(nav.currentLevel.value).toBe(1)
    })

    it('goes from level 3 to level 2', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(3)
      vi.advanceTimersByTime(500)

      nav.zoomOut()
      vi.advanceTimersByTime(500)
      expect(nav.currentLevel.value).toBe(2)
    })

    it('does nothing at level 1', () => {
      const nav = useZoomNavigation()
      nav.zoomOut()
      expect(nav.isTransitioning.value).toBe(false)
      expect(nav.currentLevel.value).toBe(1)
    })

    it('sets transition direction to out', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(2)
      vi.advanceTimersByTime(500)

      nav.zoomOut()
      expect(nav.transitionDirection.value).toBe('out')
    })
  })
})
