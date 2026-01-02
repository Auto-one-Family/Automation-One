/**
 * Formatting Utilities (German)
 * 
 * Provides consistent formatting for dates, times, numbers, and other values
 * throughout the application. All formats are German-localized.
 */

// =============================================================================
// DATE & TIME FORMATTING
// =============================================================================

/**
 * Format a date as relative time (German)
 * @example "Gerade eben", "vor 5 Minuten", "vor 2 Stunden"
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return 'Nie'
  
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  
  // Future dates
  if (diffSec < 0) {
    return formatDateTime(date)
  }
  
  // Past dates
  if (diffSec < 10) return 'Gerade eben'
  if (diffSec < 60) return `vor ${diffSec} Sekunden`
  
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin === 1) return 'vor 1 Minute'
  if (diffMin < 60) return `vor ${diffMin} Minuten`
  
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour === 1) return 'vor 1 Stunde'
  if (diffHour < 24) return `vor ${diffHour} Stunden`
  
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return 'vor 1 Tag'
  if (diffDay < 7) return `vor ${diffDay} Tagen`
  
  // Older than a week: show full date
  return formatDateTime(date)
}

/**
 * Format a date as full date + time (German format)
 * @example "15.12.2024, 14:30"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date))
  } catch {
    return '-'
  }
}

/**
 * Format a date only (without time)
 * @example "15.12.2024"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(date))
  } catch {
    return '-'
  }
}

/**
 * Format time only
 * @example "14:30:45"
 */
export function formatTime(date: string | Date | null | undefined, includeSeconds = false): string {
  if (!date) return '-'
  
  try {
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
    }
    
    if (includeSeconds) {
      options.second = '2-digit'
    }
    
    return new Intl.DateTimeFormat('de-DE', options).format(new Date(date))
  } catch {
    return '-'
  }
}

/**
 * Format ISO timestamp for display
 * @example "2024-12-15T14:30:00Z" → "15.12.2024, 15:30"
 */
export function formatTimestamp(timestamp: string | null | undefined): string {
  return formatDateTime(timestamp)
}

// =============================================================================
// NUMBER FORMATTING
// =============================================================================

/**
 * Format a number with specified decimal places
 * @example formatNumber(23.456, 2) → "23,46"
 */
export function formatNumber(
  value: number | null | undefined, 
  decimals: number = 2,
  fallback: string = '-'
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return fallback
  }
  
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Format a number as integer
 * @example formatInteger(1234) → "1.234"
 */
export function formatInteger(value: number | null | undefined, fallback: string = '-'): string {
  if (value === null || value === undefined || isNaN(value)) {
    return fallback
  }
  
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

/**
 * Format a sensor value with its unit
 * @example formatSensorValue(23.5, "°C", 1) → "23,5 °C"
 */
export function formatSensorValue(
  value: number | null | undefined, 
  unit: string = '',
  decimals: number = 2
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '-'
  }
  
  const formattedValue = formatNumber(value, decimals)
  return unit ? `${formattedValue} ${unit}` : formattedValue
}

/**
 * Format percentage
 * @example formatPercent(0.85) → "85%"
 */
export function formatPercent(
  value: number | null | undefined, 
  decimals: number = 0
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '-'
  }
  
  // If value is already in percentage (0-100), use directly
  // If value is a ratio (0-1), multiply by 100
  const percentValue = value > 1 ? value : value * 100
  
  return `${formatNumber(percentValue, decimals)}%`
}

// =============================================================================
// UPTIME / DURATION FORMATTING
// =============================================================================

/**
 * Format uptime in seconds to human-readable format
 * @example formatUptime(3661) → "1h 1m 1s"
 */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return '-'
  }
  
  if (seconds < 0) seconds = 0
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

/**
 * Format uptime as short format (for compact displays)
 * @example formatUptimeShort(3661) → "1h 1m"
 */
export function formatUptimeShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return '-'
  }
  
  if (seconds < 0) seconds = 0
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

/**
 * Format duration in milliseconds
 * @example formatDuration(1500) → "1.5s"
 */
export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || isNaN(milliseconds)) {
    return '-'
  }
  
  if (milliseconds < 1000) {
    return `${milliseconds}ms`
  }
  
  const seconds = milliseconds / 1000
  if (seconds < 60) {
    return `${formatNumber(seconds, 1)}s`
  }
  
  return formatUptime(Math.floor(seconds))
}

// =============================================================================
// BYTE SIZE FORMATTING
// =============================================================================

/**
 * Format bytes to human-readable size
 * @example formatBytes(1536) → "1.5 KB"
 */
export function formatBytes(bytes: number | null | undefined, decimals: number = 1): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return '-'
  }
  
  if (bytes === 0) return '0 B'
  if (bytes < 0) return '-'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  if (i >= sizes.length) {
    return `${formatNumber(bytes / Math.pow(k, sizes.length - 1), decimals)} ${sizes[sizes.length - 1]}`
  }
  
  return `${formatNumber(bytes / Math.pow(k, i), decimals)} ${sizes[i]}`
}

/**
 * Format heap/memory size (commonly in bytes)
 * @example formatHeapSize(131072) → "128 KB"
 */
export function formatHeapSize(bytes: number | null | undefined): string {
  return formatBytes(bytes, 0)
}

// =============================================================================
// SIGNAL STRENGTH FORMATTING
// =============================================================================

/**
 * Format WiFi RSSI to human-readable signal strength
 * @example formatRssi(-65) → "-65 dBm (Gut)"
 */
export function formatRssi(rssi: number | null | undefined): string {
  if (rssi === null || rssi === undefined || isNaN(rssi)) {
    return '-'
  }
  
  let quality: string
  if (rssi >= -50) {
    quality = 'Ausgezeichnet'
  } else if (rssi >= -60) {
    quality = 'Sehr gut'
  } else if (rssi >= -70) {
    quality = 'Gut'
  } else if (rssi >= -80) {
    quality = 'Akzeptabel'
  } else {
    quality = 'Schwach'
  }
  
  return `${rssi} dBm (${quality})`
}

/**
 * Get RSSI quality level
 */
export function getRssiQuality(rssi: number | null | undefined): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
  if (rssi === null || rssi === undefined || isNaN(rssi)) {
    return 'unknown'
  }
  
  if (rssi >= -50) return 'excellent'
  if (rssi >= -60) return 'good'
  if (rssi >= -80) return 'fair'
  return 'poor'
}

// =============================================================================
// ID / IDENTIFIER FORMATTING
// =============================================================================

/**
 * Truncate a long ID for display
 * @example truncateId("ESP_ABCDEF123456", 8) → "ESP_ABCD..."
 */
export function truncateId(id: string | null | undefined, maxLength: number = 12): string {
  if (!id) return '-'
  if (id.length <= maxLength) return id
  return `${id.substring(0, maxLength)}...`
}

/**
 * Format ESP ID with MOCK indicator
 */
export function formatEspId(espId: string, isMock: boolean): string {
  return isMock ? `${espId} (Mock)` : espId
}

// =============================================================================
// RANGE / VALUE VALIDATION
// =============================================================================

/**
 * Clamp a value to a range and format
 */
export function formatClampedValue(
  value: number | null | undefined,
  min: number,
  max: number,
  unit: string = '',
  decimals: number = 2
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '-'
  }
  
  const clamped = Math.max(min, Math.min(max, value))
  return formatSensorValue(clamped, unit, decimals)
}

// =============================================================================
// BOOLEAN FORMATTING
// =============================================================================

/**
 * Format boolean as German text
 */
export function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return value ? 'Ja' : 'Nein'
}

/**
 * Format on/off state
 */
export function formatOnOff(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return value ? 'Ein' : 'Aus'
}

/**
 * Format enabled/disabled state
 */
export function formatEnabled(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return value ? 'Aktiviert' : 'Deaktiviert'
}

// =============================================================================
// LIST FORMATTING
// =============================================================================

/**
 * Format a count with singular/plural German text
 * @example formatCount(1, "Sensor", "Sensoren") → "1 Sensor"
 * @example formatCount(5, "Sensor", "Sensoren") → "5 Sensoren"
 */
export function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

// =============================================================================
// DATA FRESHNESS UTILITIES
// =============================================================================

/**
 * Freshness level for data
 */
export type FreshnessLevel = 'live' | 'recent' | 'stale' | 'unknown'

/**
 * Get data freshness level based on timestamp
 * - live: < 30 seconds ago
 * - recent: < 2 minutes ago
 * - stale: > 2 minutes ago
 * - unknown: no timestamp
 */
export function getDataFreshness(
  timestamp: string | Date | null | undefined,
  thresholds: { live?: number; recent?: number } = {}
): FreshnessLevel {
  if (!timestamp) return 'unknown'

  const { live = 30, recent = 120 } = thresholds
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 0) return 'live' // Future = just received
  if (diffSec <= live) return 'live'
  if (diffSec <= recent) return 'recent'
  return 'stale'
}

/**
 * Get freshness info with label and color class
 */
export function getFreshnessInfo(freshness: FreshnessLevel): {
  label: string
  colorClass: string
  icon: 'live' | 'recent' | 'stale' | 'unknown'
} {
  switch (freshness) {
    case 'live':
      return { label: 'Live', colorClass: 'text-success', icon: 'live' }
    case 'recent':
      return { label: 'Aktuell', colorClass: 'text-info', icon: 'recent' }
    case 'stale':
      return { label: 'Veraltet', colorClass: 'text-warning', icon: 'stale' }
    default:
      return { label: 'Unbekannt', colorClass: 'text-muted', icon: 'unknown' }
  }
}

/**
 * Calculate age in seconds from timestamp
 */
export function getAgeSeconds(timestamp: string | Date | null | undefined): number | null {
  if (!timestamp) return null
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  return Math.floor((now - then) / 1000)
}















