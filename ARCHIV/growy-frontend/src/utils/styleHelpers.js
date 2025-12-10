/**
 * Zentrale Style-Helper für konsistente Klassen-Logik
 * Verwendet in allen Komponenten für einheitliche Styling-Entscheidungen
 */

/**
 * Verbindungs-Klassen basierend auf Status und Qualität
 * @param {boolean} isConnected - Verbindungsstatus
 * @param {string} quality - Verbindungsqualität ('excellent', 'good', 'poor')
 * @returns {Object} CSS-Klassen-Objekt
 */
export function getConnectionClasses(isConnected, quality) {
  return {
    'border-green-200': isConnected && quality === 'excellent',
    'border-yellow-200': isConnected && quality === 'good',
    'border-red-200': !isConnected || quality === 'poor',
    'opacity-75': !isConnected,
    'bg-green-50': isConnected && quality === 'excellent',
    'bg-yellow-50': isConnected && quality === 'good',
    'bg-red-50': !isConnected || quality === 'poor',
  }
}

/**
 * Status-Klassen für verschiedene Zustände
 * @param {string} status - Status ('online', 'offline', 'configured', 'discovered')
 * @returns {string} CSS-Klassen-String
 */
export function getStatusClasses(status) {
  const baseClasses = 'font-medium px-2 py-1 rounded text-xs'

  const statusMap = {
    online: `${baseClasses} bg-green-100 text-green-800`,
    offline: `${baseClasses} bg-red-100 text-red-800`,
    configured: `${baseClasses} bg-blue-100 text-blue-800`,
    discovered: `${baseClasses} bg-yellow-100 text-yellow-800`,
  }

  return statusMap[status] || `${baseClasses} bg-gray-100 text-gray-800`
}

/**
 * Card-Klassen für interaktive Elemente
 * @param {boolean} isInteractive - Ob das Element interaktiv ist
 * @param {boolean} isSelected - Ob das Element ausgewählt ist
 * @returns {Object} CSS-Klassen-Objekt
 */
export function getCardClasses(isInteractive = false, isSelected = false) {
  return {
    'cursor-pointer': isInteractive,
    'hover:shadow-lg': isInteractive,
    'ring-2 ring-primary-500': isSelected,
    'transition-all duration-200': true,
  }
}

/**
 * Button-Klassen für verschiedene Varianten
 * @param {string} variant - Button-Variante ('primary', 'secondary', 'success', 'warning', 'error')
 * @param {string} size - Button-Größe ('small', 'medium', 'large')
 * @returns {string} CSS-Klassen-String
 */
export function getButtonClasses(variant = 'default', size = 'medium') {
  const baseClasses = 'font-medium rounded transition-all duration-200'

  const variantClasses = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    error: 'bg-red-600 hover:bg-red-700 text-white',
    default: 'bg-gray-600 hover:bg-gray-700 text-white',
  }

  const sizeClasses = {
    small: 'px-3 py-1 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg',
  }

  return `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`
}

/**
 * Responsive Grid-Klassen
 * @param {Object} cols - Spalten-Konfiguration für verschiedene Breakpoints
 * @returns {string} CSS-Klassen-String
 */
export function getResponsiveClasses(breakpoint, cols) {
  const responsiveMap = {
    sm: `grid-cols-${cols.sm || 1}`,
    md: `md:grid-cols-${cols.md || cols.sm || 1}`,
    lg: `lg:grid-cols-${cols.lg || cols.md || cols.sm || 1}`,
    xl: `xl:grid-cols-${cols.xl || cols.lg || cols.md || cols.sm || 1}`,
  }

  return Object.values(responsiveMap).join(' ')
}

/**
 * Sensor-spezifische Klassen
 * @param {string} sensorType - Sensor-Typ
 * @param {number} value - Sensor-Wert
 * @param {Object} thresholds - Schwellenwerte für Warnungen
 * @returns {Object} CSS-Klassen-Objekt
 */
export function getSensorClasses(sensorType, value, thresholds = {}) {
  const classes = {
    'sensor-card': true,
    'transition-all duration-200': true,
  }

  // Warnung-Klassen basierend auf Sensor-Typ und Wert
  if (sensorType === 'TEMP_DS18B20') {
    const { min = 5, max = 35, warningMin = 10, warningMax = 30 } = thresholds
    if (value > max || value < min) {
      classes['bg-red-50 border-red-200'] = true
    } else if (value > warningMax || value < warningMin) {
      classes['bg-yellow-50 border-yellow-200'] = true
    } else {
      classes['bg-green-50 border-green-200'] = true
    }
  } else if (sensorType === 'HUMIDITY_DHT22') {
    const { min = 20, max = 90, warningMin = 30, warningMax = 80 } = thresholds
    if (value > max || value < min) {
      classes['bg-red-50 border-red-200'] = true
    } else if (value > warningMax || value < warningMin) {
      classes['bg-yellow-50 border-yellow-200'] = true
    } else {
      classes['bg-green-50 border-green-200'] = true
    }
  } else {
    classes['bg-gray-50 border-gray-200'] = true
  }

  return classes
}

/**
 * Aktor-spezifische Klassen
 * @param {boolean} isActive - Ob der Aktor aktiv ist
 * @param {boolean} isOverride - Ob ein manueller Override aktiv ist
 * @param {boolean} isSafeMode - Ob Safe Mode aktiv ist
 * @returns {Object} CSS-Klassen-Objekt
 */
export function getActuatorClasses(isActive, isOverride = false, isSafeMode = false) {
  return {
    'actuator-card': true,
    'transition-all duration-200': true,
    'bg-green-50 border-green-200': isActive && !isSafeMode,
    'bg-red-50 border-red-200': !isActive && !isSafeMode,
    'bg-yellow-50 border-yellow-200': isOverride,
    'bg-gray-50 border-gray-200 opacity-50': isSafeMode,
    'cursor-not-allowed': isSafeMode,
    'cursor-pointer': !isSafeMode,
  }
}

/**
 * Animation-Klassen für verschiedene Effekte
 * @param {string} animationType - Animation-Typ ('blink', 'pulse', 'slideIn', 'fadeIn', 'bounce')
 * @param {boolean} isActive - Ob die Animation aktiv ist
 * @returns {string} CSS-Klassen-String
 */
export function getAnimationClasses(animationType, isActive = true) {
  if (!isActive) return ''

  const animationMap = {
    blink: 'blink-animation',
    pulse: 'pulse-animation',
    slideIn: 'slide-in-animation',
    fadeIn: 'fade-in-animation',
    bounce: 'bounce-animation',
  }

  return animationMap[animationType] || ''
}

/**
 * Icon-Klassen für verschiedene Zustände
 * @param {string} status - Status für Icon-Farbe
 * @param {string} size - Icon-Größe ('small', 'medium', 'large')
 * @returns {Object} CSS-Klassen-Objekt
 */
export function getIconClasses(status, size = 'small') {
  const sizeMap = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  }

  const colorMap = {
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
    info: 'text-blue-600',
    default: 'text-gray-600',
  }

  return {
    [sizeMap[size]]: true,
    [colorMap[status] || colorMap.default]: true,
  }
}

/**
 * Text-Klassen für verschiedene Prioritäten
 * @param {string} priority - Text-Priorität ('critical', 'important', 'normal', 'secondary')
 * @param {string} size - Text-Größe ('xs', 'sm', 'base', 'lg', 'xl')
 * @returns {string} CSS-Klassen-String
 */
export function getTextClasses(priority = 'normal', size = 'base') {
  const priorityMap = {
    critical: 'font-bold text-red-900',
    important: 'font-semibold text-gray-900',
    normal: 'font-medium text-gray-700',
    secondary: 'font-normal text-gray-500',
  }

  const sizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  }

  return `${priorityMap[priority]} ${sizeMap[size]}`
}

/**
 * Layout-Klassen für verschiedene Container
 * @param {string} layoutType - Layout-Typ ('card', 'list', 'grid', 'sidebar')
 * @param {boolean} isCompact - Ob kompaktes Layout verwendet werden soll
 * @returns {Object} CSS-Klassen-Objekt
 */
export function getLayoutClasses(layoutType, isCompact = false) {
  const baseClasses = {
    card: 'bg-white rounded-lg shadow p-4',
    list: 'space-y-2',
    grid: 'grid gap-4',
    sidebar: 'bg-gray-50 border-r border-gray-200 p-4',
  }

  const compactClasses = {
    card: 'bg-white rounded shadow-sm p-2',
    list: 'space-y-1',
    grid: 'grid gap-2',
    sidebar: 'bg-gray-50 border-r border-gray-200 p-2',
  }

  return isCompact ? compactClasses[layoutType] : baseClasses[layoutType]
}

/**
 * Utility-Funktion zum Kombinieren von Klassen-Objekten
 * @param {...Object} classObjects - Mehrere Klassen-Objekte
 * @returns {Object} Kombiniertes Klassen-Objekt
 */
export function combineClasses(...classObjects) {
  return classObjects.reduce((combined, current) => {
    return { ...combined, ...current }
  }, {})
}

/**
 * Utility-Funktion zum Konvertieren von Klassen-Objekt zu String
 * @param {Object} classObject - Klassen-Objekt
 * @returns {string} CSS-Klassen-String
 */
export function classesToString(classObject) {
  return Object.entries(classObject)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(' ')
}
