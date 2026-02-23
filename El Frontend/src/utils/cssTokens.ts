/**
 * CSS Token Utilities
 *
 * Provides runtime access to CSS custom properties (design tokens)
 * for use in JavaScript contexts where CSS `var()` is not available
 * (e.g., Chart.js configuration objects, canvas drawing, etc.)
 *
 * All values are read from `document.documentElement` at call time,
 * so they respect runtime theme changes.
 */

/** Cache for computed style to avoid repeated lookups within the same frame */
let cachedStyle: CSSStyleDeclaration | null = null
let cacheFrame: number | null = null

function getStyle(): CSSStyleDeclaration {
  const frame = typeof requestAnimationFrame !== 'undefined' ? 0 : 0
  if (!cachedStyle || cacheFrame !== frame) {
    cachedStyle = getComputedStyle(document.documentElement)
    cacheFrame = frame
  }
  return cachedStyle
}

/**
 * Read a CSS custom property value from :root.
 *
 * @param name - The CSS variable name including `--` prefix, e.g. `'--color-success'`
 * @returns The trimmed value string, e.g. `'#34d399'`
 *
 * @example
 * ```ts
 * import { getCssToken } from '@/utils/cssTokens'
 *
 * const successColor = getCssToken('--color-success') // '#34d399'
 * const chartColor = getCssToken('--color-accent')    // '#3b82f6'
 * ```
 */
export function getCssToken(name: string): string {
  if (typeof document === 'undefined') return ''
  return getStyle().getPropertyValue(name).trim()
}

/**
 * Pre-defined token accessors for commonly used colors in charts and JS contexts.
 * These resolve at call time — safe to use in computed properties.
 */
export const tokens = {
  // Status colors
  get success() { return getCssToken('--color-success') || '#34d399' },
  get warning() { return getCssToken('--color-warning') || '#fbbf24' },
  get error() { return getCssToken('--color-error') || '#f87171' },
  get info() { return getCssToken('--color-info') || '#60a5fa' },

  // Accent
  get accent() { return getCssToken('--color-accent') || '#3b82f6' },
  get accentBright() { return getCssToken('--color-accent-bright') || '#60a5fa' },

  // Device distinction
  get mock() { return getCssToken('--color-mock') || '#a78bfa' },
  get real() { return getCssToken('--color-real') || '#22d3ee' },

  // Sensor status
  get statusGood() { return getCssToken('--color-status-good') || '#22c55e' },
  get statusWarning() { return getCssToken('--color-status-warning') || '#eab308' },
  get statusAlarm() { return getCssToken('--color-status-alarm') || '#ef4444' },
  get statusOffline() { return getCssToken('--color-status-offline') || '#6b7280' },

  // Text
  get textPrimary() { return getCssToken('--color-text-primary') || '#eaeaf2' },
  get textSecondary() { return getCssToken('--color-text-secondary') || '#8585a0' },
  get textMuted() { return getCssToken('--color-text-muted') || '#484860' },

  // Backgrounds
  get bgPrimary() { return getCssToken('--color-bg-primary') || '#07070d' },
  get bgSecondary() { return getCssToken('--color-bg-secondary') || '#0d0d16' },
  get bgTertiary() { return getCssToken('--color-bg-tertiary') || '#15151f' },

  // Threshold zone backgrounds
  get zoneAlarm() { return getCssToken('--color-zone-alarm') || 'rgba(239, 68, 68, 0.15)' },
  get zoneWarning() { return getCssToken('--color-zone-warning') || 'rgba(234, 179, 8, 0.10)' },
  get zoneNormal() { return getCssToken('--color-zone-normal') || 'rgba(34, 197, 94, 0.10)' },

  // Glass
  get glassBorder() { return getCssToken('--glass-border') || 'rgba(255, 255, 255, 0.06)' },
}
