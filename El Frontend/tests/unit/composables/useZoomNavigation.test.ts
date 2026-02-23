/**
 * useZoomNavigation Composable Tests
 *
 * Tests for the 3-level dashboard zoom navigation:
 * - Level state management
 * - Transition animations (EXIT=250ms + DELAY=50ms + ENTER=300ms = 600ms)
 * - zoomToZone (Level 1 → Level 2)
 * - zoomToDevice (Level 2 → Level 3)
 * - zoomToLevel (breadcrumb DOWN only: 3→2, 3→1, 2→1)
 * - zoomOut (one level up)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

// Transition timing constants (must match composable)
const EXIT_DURATION = 250
const ENTER_DELAY = 50
const ENTER_DURATION = 300
const FULL_TRANSITION = EXIT_DURATION + ENTER_DELAY + ENTER_DURATION // 600ms

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

// Mock ESP store with test device (needed for zoomToDevice)
vi.mock('@/stores/esp', () => ({
  useEspStore: () => ({
    devices: [
      { device_id: 'test_device_1', zone_id: 'test_zone_1' },
    ],
    getDeviceId: (d: any) => d.device_id || d.esp_id || '',
    isMock: () => false,
    isLoading: false,
  }),
}))

// Mock toast composable
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
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
    setActivePinia(createPinia())
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

  describe('zoomToZone (Level 1 → Level 2)', () => {
    it('sets selectedZoneId and navigates to level 2', () => {
      const nav = useZoomNavigation()
      nav.zoomToZone('gewaechshaus_a')

      // Should start transition
      expect(nav.isTransitioning.value).toBe(true)
      expect(nav.transitionDirection.value).toBe('in')

      // After exit + enter delay, midpoint sets level
      vi.advanceTimersByTime(EXIT_DURATION + ENTER_DELAY)
      expect(nav.currentLevel.value).toBe(2)
      expect(nav.selectedZoneId.value).toBe('gewaechshaus_a')

      // After enter duration, transition completes
      vi.advanceTimersByTime(ENTER_DURATION)
      expect(nav.isTransitioning.value).toBe(false)
      expect(nav.transitionDirection.value).toBeNull()
    })

    it('ignores zoomToZone when not at level 1', () => {
      const nav = useZoomNavigation()
      // Go to level 2 first
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(2)

      // Try zoomToZone again from level 2
      nav.zoomToZone('another_zone')
      expect(nav.isTransitioning.value).toBe(false)
      expect(nav.selectedZoneId.value).toBe('test_zone_1') // unchanged
    })

    it('ignores zoomToZone during transition', () => {
      const nav = useZoomNavigation()
      nav.zoomToZone('zone_a')
      expect(nav.isTransitioning.value).toBe(true)

      // Try another zoomToZone while transitioning
      nav.zoomToZone('zone_b')

      // Should complete first transition to zone_a
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(2)
      expect(nav.selectedZoneId.value).toBe('zone_a')
    })
  })

  describe('zoomToDevice (Level 2 → Level 3)', () => {
    it('navigates to device detail at level 3', () => {
      const nav = useZoomNavigation()
      // First go to level 2
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(2)

      // Then go to level 3
      nav.zoomToDevice('test_device_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(3)
      expect(nav.selectedDeviceId.value).toBe('test_device_1')
    })

    it('warns when device not found', () => {
      const nav = useZoomNavigation()
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)

      nav.zoomToDevice('nonexistent_device')
      expect(nav.isTransitioning.value).toBe(false)
      expect(nav.currentLevel.value).toBe(2) // stays at level 2
    })
  })

  describe('zoomToLevel (breadcrumb DOWN navigation only)', () => {
    it('ignores same-level navigation', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(1) // Already at 1
      expect(nav.isTransitioning.value).toBe(false)
    })

    it('ignores upward navigation (cannot go 1→2 via zoomToLevel)', () => {
      const nav = useZoomNavigation()
      nav.zoomToLevel(2)
      expect(nav.isTransitioning.value).toBe(false)
      expect(nav.currentLevel.value).toBe(1)
    })

    it('navigates down from level 2 to level 1', () => {
      const nav = useZoomNavigation()
      // First go to level 2
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(2)

      // Navigate back to level 1 via zoomToLevel
      nav.zoomToLevel(1)
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(1)
      expect(nav.selectedZoneId.value).toBeNull()
    })

    it('navigates down from level 3 to level 1 (multi-step)', () => {
      const nav = useZoomNavigation()
      // Go to level 2
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      // Go to level 3
      nav.zoomToDevice('test_device_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(3)

      // Navigate back to level 1 via zoomToLevel (skips level 2)
      nav.zoomToLevel(1)
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(1)
      expect(nav.selectedZoneId.value).toBeNull()
      expect(nav.selectedDeviceId.value).toBeNull()
    })

    it('ignores zoomToLevel during transition', () => {
      const nav = useZoomNavigation()
      // Go to level 2
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)

      // Start zoomOut transition
      nav.zoomOut()
      expect(nav.isTransitioning.value).toBe(true)

      // Try zoomToLevel during transition - should be ignored
      nav.zoomToLevel(1)
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(1) // Completed original zoomOut
    })
  })

  describe('zoomOut', () => {
    it('goes from level 2 to level 1', () => {
      const nav = useZoomNavigation()
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(2)

      nav.zoomOut()
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(1)
    })

    it('goes from level 3 to level 2', () => {
      const nav = useZoomNavigation()
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      nav.zoomToDevice('test_device_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.currentLevel.value).toBe(3)

      nav.zoomOut()
      vi.advanceTimersByTime(FULL_TRANSITION)
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
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)

      nav.zoomOut()
      expect(nav.transitionDirection.value).toBe('out')
    })

    it('clears selectedZoneId when zooming out from level 2', () => {
      const nav = useZoomNavigation()
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.selectedZoneId.value).toBe('test_zone_1')

      nav.zoomOut()
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.selectedZoneId.value).toBeNull()
    })

    it('clears selectedDeviceId when zooming out from level 3', () => {
      const nav = useZoomNavigation()
      nav.zoomToZone('test_zone_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      nav.zoomToDevice('test_device_1')
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.selectedDeviceId.value).toBe('test_device_1')

      nav.zoomOut()
      vi.advanceTimersByTime(FULL_TRANSITION)
      expect(nav.selectedDeviceId.value).toBeNull()
      expect(nav.selectedZoneId.value).toBe('test_zone_1') // zone preserved
    })
  })
})
