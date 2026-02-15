/**
 * useZoomNavigation Composable
 *
 * Manages the three-level dashboard zoom navigation:
 *   Level 1: ESP-Orbital-View (default) — ESPs with sensors/actuators grouped by zone
 *   Level 2: Komponentenübersicht — All sensors + actuators without ESPs, filterable
 *   Level 3: Zonen-Navigator — Zone/Subzone overview with aggregated stats
 *
 * Features:
 * - CSS zoom transitions between levels
 * - URL query param sync (?level=2&zone=xxx)
 * - Keyboard shortcuts (Escape = zoom out)
 * - Browser back/forward navigation
 * - Transition state management
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { createLogger } from '@/utils/logger'

const logger = createLogger('ZoomNavigation')

export type ZoomLevel = 1 | 2 | 3

import type { Ref, ComputedRef } from 'vue'

export interface UseZoomNavigationReturn {
  /** Current active zoom level */
  currentLevel: Ref<ZoomLevel>
  /** Selected zone ID (for L1 filtering after navigating from L3) */
  selectedZoneId: Ref<string | null>
  /** Whether a transition animation is in progress */
  isTransitioning: Ref<boolean>
  /** Direction of current transition */
  transitionDirection: Ref<'in' | 'out' | null>
  /** CSS class for Level 1 container */
  level1Class: ComputedRef<string>
  /** CSS class for Level 2 container */
  level2Class: ComputedRef<string>
  /** CSS class for Level 3 container */
  level3Class: ComputedRef<string>
  /** Navigate to a specific level */
  zoomToLevel: (level: ZoomLevel) => void
  /** Navigate to Level 1 filtered by zone */
  zoomToZone: (zoneId: string) => void
  /** Go one level up */
  zoomOut: () => void
  /** Level labels for navigation UI */
  levelLabels: { level: ZoomLevel; label: string; icon: string }[]
}

// Transition timing constants (ms)
const EXIT_DURATION = 200
const ENTER_DURATION = 250

export function useZoomNavigation(): UseZoomNavigationReturn {
  const router = useRouter()
  const route = useRoute()

  // ── State ──────────────────────────────────────────────────────────
  const currentLevel = ref<ZoomLevel>(1)
  const selectedZoneId = ref<string | null>(null)
  const isTransitioning = ref(false)
  const transitionDirection = ref<'in' | 'out' | null>(null)
  const exitingLevel = ref<ZoomLevel | null>(null)
  const enteringLevel = ref<ZoomLevel | null>(null)

  // ── Level labels for navigation ────────────────────────────────────
  const levelLabels: { level: ZoomLevel; label: string; icon: string }[] = [
    { level: 1, label: 'ESPs', icon: 'cpu' },
    { level: 2, label: 'Komponenten', icon: 'activity' },
    { level: 3, label: 'Zonen', icon: 'map' },
  ]

  // ── CSS Classes ────────────────────────────────────────────────────

  function getLevelClass(level: ZoomLevel): string {
    const isActive = currentLevel.value === level
    const isExiting = exitingLevel.value === level
    const isEntering = enteringLevel.value === level
    const dir = transitionDirection.value

    if (isExiting && dir === 'in') return 'zoom-level zoom-level--exiting animate-zoom-in-exit'
    if (isExiting && dir === 'out') return 'zoom-level zoom-level--exiting animate-zoom-out-exit'
    if (isEntering && dir === 'in') return 'zoom-level zoom-level--entering animate-zoom-in-enter'
    if (isEntering && dir === 'out') return 'zoom-level zoom-level--entering animate-zoom-out-enter'
    if (isActive) return 'zoom-level zoom-level--active'
    return 'zoom-level'
  }

  const level1Class = computed(() => getLevelClass(1))
  const level2Class = computed(() => getLevelClass(2))
  const level3Class = computed(() => getLevelClass(3))

  // ── Navigation ─────────────────────────────────────────────────────

  /**
   * Animate transition from current level to target level.
   */
  function animateTransition(fromLevel: ZoomLevel, toLevel: ZoomLevel, callback?: () => void) {
    if (isTransitioning.value) return

    const direction = toLevel > fromLevel ? 'in' : 'out'

    isTransitioning.value = true
    transitionDirection.value = direction
    exitingLevel.value = fromLevel
    enteringLevel.value = null

    // Phase 1: Exit animation
    setTimeout(() => {
      // Phase 2: Switch level, start enter
      currentLevel.value = toLevel
      exitingLevel.value = null
      enteringLevel.value = toLevel

      // Phase 3: End enter animation
      setTimeout(() => {
        enteringLevel.value = null
        isTransitioning.value = false
        transitionDirection.value = null
        callback?.()
      }, ENTER_DURATION)
    }, EXIT_DURATION)
  }

  /**
   * Navigate to a specific level.
   */
  function zoomToLevel(level: ZoomLevel) {
    if (level === currentLevel.value || isTransitioning.value) return

    logger.info(`Navigating: L${currentLevel.value} → L${level}`)

    // Clear zone filter when leaving L1 via tab click
    if (level !== 1) {
      selectedZoneId.value = null
    }

    animateTransition(currentLevel.value, level, () => {
      syncUrlQuery()
    })
  }

  /**
   * Navigate from L3 to L1 filtered by a specific zone.
   */
  function zoomToZone(zoneId: string) {
    if (isTransitioning.value) return

    logger.info(`Navigating to zone: ${zoneId}`)
    selectedZoneId.value = zoneId

    animateTransition(currentLevel.value, 1, () => {
      syncUrlQuery()
    })
  }

  /**
   * Go one level up (or stay at L1).
   */
  function zoomOut() {
    if (currentLevel.value === 1 || isTransitioning.value) return

    const targetLevel = (currentLevel.value - 1) as ZoomLevel
    animateTransition(currentLevel.value, targetLevel, () => {
      syncUrlQuery()
    })
  }

  // ── URL Sync ───────────────────────────────────────────────────────

  function syncUrlQuery() {
    const query: Record<string, string> = {}
    if (currentLevel.value !== 1) {
      query.level = String(currentLevel.value)
    }
    if (selectedZoneId.value) {
      query.zone = selectedZoneId.value
    }
    // Use replace to avoid polluting history on every level switch
    router.replace({ query: { ...route.query, ...query, level: query.level, zone: query.zone } })
  }

  function restoreFromUrl() {
    const levelParam = route.query.level
    const zoneParam = route.query.zone

    if (levelParam) {
      const parsed = parseInt(levelParam as string, 10)
      if (parsed >= 1 && parsed <= 3) {
        currentLevel.value = parsed as ZoomLevel
      }
    }

    if (zoneParam && typeof zoneParam === 'string') {
      selectedZoneId.value = zoneParam
    }
  }

  // Watch for browser back/forward
  watch(
    () => route.query.level,
    (newLevel) => {
      if (isTransitioning.value) return
      const parsed = newLevel ? parseInt(newLevel as string, 10) : 1
      if (parsed >= 1 && parsed <= 3 && parsed !== currentLevel.value) {
        currentLevel.value = parsed as ZoomLevel
      }
    }
  )

  // ── Keyboard Shortcuts ─────────────────────────────────────────────

  function handleKeydown(e: KeyboardEvent) {
    // Don't capture when user is typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      zoomOut()
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  onMounted(() => {
    restoreFromUrl()
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    currentLevel,
    selectedZoneId,
    isTransitioning,
    transitionDirection,
    level1Class,
    level2Class,
    level3Class,
    zoomToLevel,
    zoomToZone,
    zoomOut,
    levelLabels,
  }
}
