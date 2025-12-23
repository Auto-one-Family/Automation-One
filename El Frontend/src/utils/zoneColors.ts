/**
 * Zone Colors Utility
 *
 * Provides consistent, deterministic color assignment for zones based on ID hash.
 * Uses the iridescent color palette from the design system.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ZoneColorInfo {
  /** Primary color (hex) */
  primary: string
  /** RGB values for CSS rgba() usage */
  rgb: string
  /** Background with opacity for containers */
  background: string
  /** Border color */
  border: string
  /** Hover border color */
  borderHover: string
}

// =============================================================================
// COLOR PALETTE
// =============================================================================

/**
 * Zone color palette using design system colors.
 * Order designed for visual distinction between adjacent zones.
 */
const ZONE_COLORS: Array<{ hex: string; rgb: string }> = [
  { hex: '#60a5fa', rgb: '96, 165, 250' },   // Iridescent Blue
  { hex: '#34d399', rgb: '52, 211, 153' },   // Success Green
  { hex: '#a78bfa', rgb: '167, 139, 250' },  // Iridescent Purple
  { hex: '#22d3ee', rgb: '34, 211, 238' },   // Cyan (Real)
  { hex: '#fbbf24', rgb: '251, 191, 36' },   // Warning Amber
  { hex: '#c084fc', rgb: '192, 132, 252' },  // Iridescent Violet
  { hex: '#818cf8', rgb: '129, 140, 248' },  // Iridescent Indigo
  { hex: '#f472b6', rgb: '244, 114, 182' },  // Pink
]

/** Default color for zones without ID or unassigned devices */
const DEFAULT_ZONE_COLOR: { hex: string; rgb: string } = {
  hex: '#6b7280',  // Gray-500
  rgb: '107, 114, 128'
}

// =============================================================================
// HASH FUNCTION
// =============================================================================

/**
 * Simple hash function for consistent color assignment.
 * Same zone ID always gets the same color.
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get color information for a zone ID.
 * Returns consistent colors based on zone ID hash.
 *
 * @param zoneId - The zone identifier (null for unassigned)
 * @returns ZoneColorInfo object with all color variants
 *
 * @example
 * const color = getZoneColor('zone_tent_1')
 * // Use in Vue template:
 * // :style="{ borderColor: color.primary }"
 * // :style="{ background: color.background }"
 */
export function getZoneColor(zoneId: string | null | undefined): ZoneColorInfo {
  if (!zoneId) {
    return {
      primary: DEFAULT_ZONE_COLOR.hex,
      rgb: DEFAULT_ZONE_COLOR.rgb,
      background: `rgba(${DEFAULT_ZONE_COLOR.rgb}, 0.05)`,
      border: `rgba(${DEFAULT_ZONE_COLOR.rgb}, 0.2)`,
      borderHover: `rgba(${DEFAULT_ZONE_COLOR.rgb}, 0.4)`,
    }
  }

  const colorIndex = hashString(zoneId) % ZONE_COLORS.length
  const color = ZONE_COLORS[colorIndex]

  return {
    primary: color.hex,
    rgb: color.rgb,
    background: `rgba(${color.rgb}, 0.05)`,
    border: `rgba(${color.rgb}, 0.2)`,
    borderHover: `rgba(${color.rgb}, 0.4)`,
  }
}

/**
 * Get just the RGB string for a zone (for CSS variable usage).
 *
 * @example
 * :style="{ '--zone-color-rgb': getZoneColorRGB('zone_1') }"
 */
export function getZoneColorRGB(zoneId: string | null | undefined): string {
  return getZoneColor(zoneId).rgb
}

/**
 * Get color by index (for manual assignment).
 * Useful when you want predictable color order.
 */
export function getZoneColorByIndex(index: number): ZoneColorInfo {
  const safeIndex = Math.abs(index) % ZONE_COLORS.length
  const color = ZONE_COLORS[safeIndex]

  return {
    primary: color.hex,
    rgb: color.rgb,
    background: `rgba(${color.rgb}, 0.05)`,
    border: `rgba(${color.rgb}, 0.2)`,
    borderHover: `rgba(${color.rgb}, 0.4)`,
  }
}

/**
 * Get all available zone colors (for color picker UI).
 */
export function getAllZoneColors(): Array<{ hex: string; rgb: string }> {
  return [...ZONE_COLORS]
}

/**
 * Check if a zone has a custom color assigned.
 * (Currently always returns false as we use hash-based assignment)
 */
export function hasCustomColor(_zoneId: string): boolean {
  return false
}
