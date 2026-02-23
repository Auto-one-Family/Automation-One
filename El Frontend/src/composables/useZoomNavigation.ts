/**
 * useZoomNavigation Composable
 *
 * Manages the three-level zoom navigation for the Dashboard:
 * Level 1: Zone Overview (all zones at a glance)
 * Level 2: Zone Detail (all devices of one zone)
 * Level 3: Device Detail (one device with all sensors/actuators)
 *
 * Features:
 * - CSS animation class orchestration for zoom transitions
 * - URL query parameter sync (browser back/forward support)
 * - Device removal watcher (auto zoom-out if device deleted)
 * - Transition locking (prevents rapid double-clicks)
 */

import { ref, computed, watch, nextTick, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'

export type ZoomLevel = 1 | 2 | 3

export interface UseZoomNavigationReturn {
  currentLevel: Ref<ZoomLevel>
  selectedZoneId: Ref<string | null>
  selectedDeviceId: Ref<string | null>
  isTransitioning: Ref<boolean>
  transitionDirection: Ref<'in' | 'out' | null>
  /** Computed CSS class for each level container */
  level1Class: ComputedRef<string>
  level2Class: ComputedRef<string>
  level3Class: ComputedRef<string>
  zoomToZone: (zoneId: string, originRect?: DOMRect) => void
  zoomToDevice: (deviceId: string, originRect?: DOMRect) => void
  zoomOut: () => void
  zoomToLevel: (targetLevel: ZoomLevel) => void
}

// Transition timing constants (ms)
const EXIT_DURATION = 250
const ENTER_DELAY = 50
const ENTER_DURATION = 300

export function useZoomNavigation(): UseZoomNavigationReturn {
  const router = useRouter()
  const route = useRoute()
  const espStore = useEspStore()
  const toast = useToast()

  // ── State ──────────────────────────────────────────────────────────────
  const currentLevel = ref<ZoomLevel>(1)
  const selectedZoneId = ref<string | null>(null)
  const selectedDeviceId = ref<string | null>(null)
  const isTransitioning = ref(false)
  const transitionDirection = ref<'in' | 'out' | null>(null)

  // Internal: tracks which levels are animating
  const exitingLevel = ref<ZoomLevel | null>(null)
  const enteringLevel = ref<ZoomLevel | null>(null)

  // Timer IDs for cleanup on unmount
  const transitionTimers: ReturnType<typeof setTimeout>[] = []

  // ── Computed CSS classes ────────────────────────────────────────────────
  function levelClass(level: ZoomLevel): string {
    const direction = transitionDirection.value === 'in' ? 'zoom-in' : 'zoom-out'

    if (exitingLevel.value === level) {
      return `zoom-level--exiting animate-${direction}-exit`
    }

    if (enteringLevel.value === level) {
      return `zoom-level--entering animate-${direction}-enter`
    }

    if (currentLevel.value === level) {
      return 'zoom-level--active'
    }

    return 'zoom-level'
  }

  const level1Class = computed(() => levelClass(1))
  const level2Class = computed(() => levelClass(2))
  const level3Class = computed(() => levelClass(3))

  // ── URL Sync (restore state from query on mount) ───────────────────────
  function initFromQuery(): void {
    const zoneId = route.query.zone as string | undefined
    const deviceId = route.query.device as string | undefined

    if (deviceId && zoneId) {
      // Validate device still exists
      const exists = espStore.devices.some(
        d => espStore.getDeviceId(d) === deviceId
      )
      if (exists) {
        selectedZoneId.value = zoneId
        selectedDeviceId.value = deviceId
        currentLevel.value = 3
        return
      }
    }

    if (zoneId) {
      selectedZoneId.value = zoneId
      currentLevel.value = 2
      return
    }

    currentLevel.value = 1
  }

  // Watch for store loading completion to restore URL state.
  // The immediate: true option handles the case where devices are already loaded.
  // Uses nextTick to avoid TDZ (stopLoadingWatch not yet assigned during immediate callback).
  const stopLoadingWatch = watch(
    () => espStore.isLoading,
    (loading) => {
      if (!loading && espStore.devices.length > 0) {
        initFromQuery()
        nextTick(() => stopLoadingWatch())
      }
    },
    { immediate: true }
  )

  // ── Sync URL on state change ───────────────────────────────────────────
  function syncQueryParams(): void {
    const query: Record<string, string> = {}

    if (selectedZoneId.value) {
      query.zone = selectedZoneId.value
    }
    if (selectedDeviceId.value) {
      query.device = selectedDeviceId.value
    }

    // Preserve openSettings if present
    const openSettings = route.query.openSettings
    if (openSettings && typeof openSettings === 'string') {
      query.openSettings = openSettings
    }

    router.replace({ query })
  }

  // ── Browser back/forward handling ──────────────────────────────────────
  const stopRouteWatch = watch(
    () => route.query,
    (newQuery) => {
      // Skip during our own transitions
      if (isTransitioning.value) return

      const zoneId = newQuery.zone as string | undefined
      const deviceId = newQuery.device as string | undefined

      if (deviceId && zoneId) {
        const exists = espStore.devices.some(
          d => espStore.getDeviceId(d) === deviceId
        )
        if (exists) {
          selectedZoneId.value = zoneId
          selectedDeviceId.value = deviceId
          currentLevel.value = 3
        } else {
          // Device gone, fall back
          selectedZoneId.value = zoneId
          selectedDeviceId.value = null
          currentLevel.value = 2
        }
      } else if (zoneId) {
        selectedZoneId.value = zoneId
        selectedDeviceId.value = null
        currentLevel.value = 2
      } else {
        selectedZoneId.value = null
        selectedDeviceId.value = null
        currentLevel.value = 1
      }
    }
  )

  // ── Transition helper ──────────────────────────────────────────────────
  function runTransition(
    direction: 'in' | 'out',
    fromLevel: ZoomLevel,
    toLevel: ZoomLevel,
    onMidpoint: () => void
  ): void {
    if (isTransitioning.value) return

    isTransitioning.value = true
    transitionDirection.value = direction
    exitingLevel.value = fromLevel

    // After exit animation completes
    const exitTimer = setTimeout(() => {
      exitingLevel.value = null
      onMidpoint()
      enteringLevel.value = toLevel

      // After enter animation completes
      const enterTimer = setTimeout(() => {
        enteringLevel.value = null
        isTransitioning.value = false
        transitionDirection.value = null

        // Focus management: move focus to first focusable in new level
        nextTick(() => {
          const levelSelector = `.zoom-level--active`
          const activeLevel = document.querySelector(levelSelector)
          if (activeLevel) {
            const focusable = activeLevel.querySelector<HTMLElement>(
              'button, [tabindex="0"], a[href], input, select'
            )
            focusable?.focus()
          }
        })
      }, ENTER_DURATION)
      transitionTimers.push(enterTimer)
    }, EXIT_DURATION + ENTER_DELAY)
    transitionTimers.push(exitTimer)
  }

  // ── Zoom In: Level 1 → Level 2 ────────────────────────────────────────
  function zoomToZone(zoneId: string, _originRect?: DOMRect): void {
    if (isTransitioning.value) return
    if (currentLevel.value !== 1) return

    runTransition('in', 1, 2, () => {
      selectedZoneId.value = zoneId
      selectedDeviceId.value = null
      currentLevel.value = 2
      syncQueryParams()
    })
  }

  // ── Zoom In: Level 2 → Level 3 (or Level 1 → Level 3 via MiniCard) ───
  function zoomToDevice(deviceId: string, _originRect?: DOMRect): void {
    if (isTransitioning.value) return

    // Validate device exists
    const device = espStore.devices.find(
      d => espStore.getDeviceId(d) === deviceId
    )
    if (!device) {
      toast.warning('Gerät nicht gefunden')
      return
    }

    // Determine zone from device
    const zoneId = device.zone_id || null

    const fromLevel = currentLevel.value as 1 | 2
    if (fromLevel !== 1 && fromLevel !== 2) return

    runTransition('in', fromLevel, 3, () => {
      if (fromLevel === 1) selectedZoneId.value = zoneId
      selectedDeviceId.value = deviceId
      currentLevel.value = 3
      syncQueryParams()
    })
  }

  // ── Zoom Out (one level up) ────────────────────────────────────────────
  function zoomOut(): void {
    if (isTransitioning.value) return

    if (currentLevel.value === 3) {
      runTransition('out', 3, 2, () => {
        selectedDeviceId.value = null
        currentLevel.value = 2
        syncQueryParams()
      })
    } else if (currentLevel.value === 2) {
      runTransition('out', 2, 1, () => {
        selectedZoneId.value = null
        selectedDeviceId.value = null
        currentLevel.value = 1
        syncQueryParams()
      })
    }
  }

  // ── Zoom to specific level (for breadcrumb multi-level jumps) ────────
  function zoomToLevel(targetLevel: ZoomLevel): void {
    if (isTransitioning.value) return
    if (targetLevel >= currentLevel.value) return

    // Single-step: delegate to zoomOut
    if (targetLevel === (currentLevel.value as number) - 1) {
      zoomOut()
      return
    }

    // Multi-step (e.g. L3 → L1): single animated transition
    const fromLevel = currentLevel.value
    runTransition('out', fromLevel, targetLevel, () => {
      selectedDeviceId.value = null
      if (targetLevel === 1) {
        selectedZoneId.value = null
      }
      currentLevel.value = targetLevel
      syncQueryParams()
    })
  }

  // ── Device removal watcher ─────────────────────────────────────────────
  // If the viewed device gets deleted, zoom out automatically
  const stopDeviceWatch = watch(
    () => espStore.devices,
    (devices) => {
      if (currentLevel.value === 3 && selectedDeviceId.value) {
        const exists = devices.some(
          d => espStore.getDeviceId(d) === selectedDeviceId.value
        )
        if (!exists) {
          // Don't use animated transition — just snap back
          selectedDeviceId.value = null
          currentLevel.value = 2
          syncQueryParams()
          toast.warning('Gerät wurde entfernt')
        }
      }
    },
    { deep: false }
  )

  // ── Cleanup ───────────────────────────────────────────────────────────
  onUnmounted(() => {
    stopLoadingWatch()
    stopRouteWatch()
    stopDeviceWatch()
    transitionTimers.forEach(id => clearTimeout(id))
    transitionTimers.length = 0
  })

  return {
    currentLevel,
    selectedZoneId,
    selectedDeviceId,
    isTransitioning,
    transitionDirection,
    level1Class,
    level2Class,
    level3Class,
    zoomToZone,
    zoomToDevice,
    zoomOut,
    zoomToLevel,
  }
}
