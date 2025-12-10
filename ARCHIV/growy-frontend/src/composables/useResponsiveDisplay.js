import { ref, computed, onMounted, onUnmounted } from 'vue'

export function useResponsiveDisplay() {
  const windowWidth = ref(window.innerWidth)
  const windowHeight = ref(window.innerHeight)

  // Breakpoints (konsistent mit bestehenden CSS-Breakpoints)
  const BREAKPOINTS = {
    mobile: 768,
    tablet: 1024,
    desktop: 1400,
  }

  // Computed Properties
  const isMobile = computed(() => windowWidth.value < BREAKPOINTS.mobile)
  const isTablet = computed(
    () => windowWidth.value >= BREAKPOINTS.mobile && windowWidth.value < BREAKPOINTS.tablet,
  )
  const isDesktop = computed(() => windowWidth.value >= BREAKPOINTS.tablet)
  const isSmallScreen = computed(() => windowWidth.value < BREAKPOINTS.tablet)

  const getDisplayMode = computed(() => {
    if (isMobile.value) return 'compact'
    if (isTablet.value) return 'standard'
    return 'detailed'
  })

  const getOrientation = computed(() => {
    return windowHeight.value > windowWidth.value ? 'portrait' : 'landscape'
  })

  // Detail Level Management
  const detailLevels = {
    compact: ['critical', 'primary'],
    standard: ['critical', 'primary', 'secondary'],
    detailed: ['critical', 'primary', 'secondary', 'tertiary'],
  }

  const shouldShowDetail = (detailType) => {
    const mode = getDisplayMode.value
    return detailLevels[mode].includes(detailType)
  }

  // Component-specific display logic
  const getComponentDisplay = (componentType) => {
    const mode = getDisplayMode.value

    const componentConfigs = {
      card: {
        compact: { density: 'compact', showActions: false, showHeaderActions: false },
        standard: { density: 'default', showActions: true, showHeaderActions: true },
        detailed: { density: 'comfortable', showActions: true, showHeaderActions: true },
      },
      table: {
        compact: { density: 'compact', showPagination: false, itemsPerPage: 5 },
        standard: { density: 'default', showPagination: true, itemsPerPage: 10 },
        detailed: { density: 'comfortable', showPagination: true, itemsPerPage: 25 },
      },
      form: {
        compact: { density: 'compact', showHints: false, showValidation: false },
        standard: { density: 'default', showHints: true, showValidation: true },
        detailed: { density: 'comfortable', showHints: true, showValidation: true },
      },
      navigation: {
        compact: { showLabels: false, showIcons: true, collapsed: true },
        standard: { showLabels: true, showIcons: true, collapsed: false },
        detailed: { showLabels: true, showIcons: true, collapsed: false },
      },
    }

    return componentConfigs[componentType]?.[mode] || componentConfigs[componentType]?.standard
  }

  // Grid system helpers
  const getGridCols = (defaultCols = 12) => {
    const mode = getDisplayMode.value

    const gridConfigs = {
      compact: Math.min(defaultCols, 6), // Max 6 cols on mobile
      standard: Math.min(defaultCols, 8), // Max 8 cols on tablet
      detailed: defaultCols, // Full cols on desktop
    }

    return gridConfigs[mode]
  }

  const getResponsiveCols = (mobileCols = 12, tabletCols = 6, desktopCols = 4) => {
    if (isMobile.value) return mobileCols
    if (isTablet.value) return tabletCols
    return desktopCols
  }

  // Spacing helpers
  const getSpacing = () => {
    const mode = getDisplayMode.value

    const spacingConfigs = {
      compact: 'small',
      standard: 'normal',
      detailed: 'large',
    }

    return spacingConfigs[mode]
  }

  // Text size helpers
  const getTextSize = () => {
    const mode = getDisplayMode.value

    const textConfigs = {
      compact: 'small',
      standard: 'normal',
      detailed: 'large',
    }

    return textConfigs[mode]
  }

  // Touch-friendly helpers
  const getTouchTargetSize = () => {
    return isMobile.value ? 44 : 32 // 44px for mobile (iOS guidelines), 32px for desktop
  }

  // ✅ NEU: Optimale Grid-Spalten basierend auf Element-Anzahl
  const getOptimalGridCols = (itemCount, minCols = 1, maxCols = 4) => {
    if (itemCount <= 2) return Math.min(maxCols, minCols + 1)
    if (itemCount <= 4) return Math.min(maxCols, minCols + 2)
    return Math.min(maxCols, minCols + 3)
  }

  // ✅ NEU: Dynamische Aktor-Grid-Anpassung
  const getDynamicActuatorCols = (actuatorCount) => {
    if (actuatorCount <= 2) return getResponsiveCols(1, 1, 2)
    if (actuatorCount <= 4) return getResponsiveCols(1, 2, 2)
    return getResponsiveCols(1, 2, 3)
  }

  // 🆕 NEU: Zonen-Grid-Anpassung für ESP-Verwaltung
  const getZoneGridCols = (zoneCount) => {
    if (zoneCount <= 1) return getResponsiveCols(1, 1, 1)
    if (zoneCount <= 2) return getResponsiveCols(1, 1, 2)
    if (zoneCount <= 4) return getResponsiveCols(1, 2, 2)
    return getResponsiveCols(1, 2, 3)
  }

  // 🆕 NEU: ESP-Card-Grid-Anpassung
  const getEspCardGridCols = (espCount) => {
    if (espCount <= 1) return getResponsiveCols(1, 1, 1)
    if (espCount <= 2) return getResponsiveCols(1, 1, 2)
    if (espCount <= 4) return getResponsiveCols(1, 2, 2)
    if (espCount <= 6) return getResponsiveCols(1, 2, 3)
    return getResponsiveCols(1, 2, 4)
  }

  // 🆕 NEU: Kaiser-Grid-Anpassung
  const getKaiserGridCols = (kaiserCount) => {
    if (kaiserCount <= 1) return getResponsiveCols(1, 1, 1)
    if (kaiserCount <= 2) return getResponsiveCols(1, 1, 2)
    if (kaiserCount <= 4) return getResponsiveCols(1, 2, 2)
    return getResponsiveCols(1, 2, 3)
  }

  // 🆕 NEU: Drag & Drop Touch-Optimierung
  const getDragDropConfig = () => {
    const mode = getDisplayMode.value

    const dragConfigs = {
      compact: {
        dragHandleSize: 44,
        dropZonePadding: 8,
        dragFeedback: 'minimal',
        touchDelay: 500,
      },
      standard: {
        dragHandleSize: 32,
        dropZonePadding: 12,
        dragFeedback: 'standard',
        touchDelay: 300,
      },
      detailed: {
        dragHandleSize: 28,
        dropZonePadding: 16,
        dragFeedback: 'detailed',
        touchDelay: 200,
      },
    }

    return dragConfigs[mode]
  }

  // 🆕 NEU: Zone-Container-Optimierung
  const getZoneContainerConfig = () => {
    const mode = getDisplayMode.value

    const containerConfigs = {
      compact: {
        padding: '1rem',
        gap: '1rem',
        borderRadius: '8px',
        showZoneIcons: false,
        showZoneDescriptions: false,
      },
      standard: {
        padding: '1.5rem',
        gap: '1.5rem',
        borderRadius: '12px',
        showZoneIcons: true,
        showZoneDescriptions: false,
      },
      detailed: {
        padding: '2rem',
        gap: '2rem',
        borderRadius: '16px',
        showZoneIcons: true,
        showZoneDescriptions: true,
      },
    }

    return containerConfigs[mode]
  }

  // 🆕 NEU: Mobile-spezifische Zone-Navigation
  const getMobileZoneNavigation = () => {
    if (!isMobile.value) return null

    return {
      showZoneTabs: true,
      showZoneBreadcrumbs: false,
      showZoneQuickActions: false,
      zoneCardCompact: true,
      enableSwipeNavigation: true,
    }
  }

  const isTouchDevice = computed(() => {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  })

  // Performance optimizations
  const shouldLazyLoad = computed(() => {
    return isMobile.value || windowWidth.value < 1024
  })

  const shouldReduceAnimations = computed(() => {
    return isMobile.value || windowWidth.value < 768
  })

  // ✅ KORRIGIERT: Sichere Event-Handler
  const handleResize = () => {
    // ✅ NEU: DOM-Ready-Check
    if (typeof window === 'undefined') return

    try {
      windowWidth.value = window.innerWidth
      windowHeight.value = window.innerHeight
    } catch (error) {
      console.warn('Resize handler error:', error)
    }
  }

  // Lifecycle
  onMounted(() => {
    // ✅ NEU: Sichere Event-Listener-Registrierung
    try {
      window.addEventListener('resize', handleResize)
      window.addEventListener('orientationchange', handleResize)
    } catch (error) {
      console.error('Failed to add resize listeners:', error)
    }
  })

  onUnmounted(() => {
    // ✅ NEU: Sichere Event-Listener-Entfernung
    try {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    } catch (error) {
      console.error('Failed to remove resize listeners:', error)
    }
  })

  // Utility functions
  const debounce = (func, wait) => {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  const debouncedResize = debounce(handleResize, 250)

  // Return reactive values and functions
  return {
    // Reactive values
    windowWidth,
    windowHeight,
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen,
    getDisplayMode,
    getOrientation,
    isTouchDevice,
    shouldLazyLoad,
    shouldReduceAnimations,

    // Functions
    shouldShowDetail,
    getComponentDisplay,
    getGridCols,
    getResponsiveCols,
    getOptimalGridCols,
    getDynamicActuatorCols,
    getZoneGridCols,
    getEspCardGridCols,
    getKaiserGridCols,
    getDragDropConfig,
    getZoneContainerConfig,
    getMobileZoneNavigation,
    getSpacing,
    getTextSize,
    getTouchTargetSize,
    handleResize: debouncedResize,

    // Constants
    BREAKPOINTS,
  }
}
