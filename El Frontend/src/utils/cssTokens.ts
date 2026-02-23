/**
 * CSS Token Utility
 *
 * Runtime access to CSS custom properties defined in tokens.css.
 * Used by Chart.js and other JS libraries that need token values at runtime.
 *
 * @example
 * import { getToken, tokens } from '@/utils/cssTokens'
 * const color = getToken('--color-accent') // '#3b82f6'
 * const bg = tokens.bgPrimary // '#07070d'
 */

const cache = new Map<string, string>()

/**
 * Get a CSS custom property value from the document root.
 * Results are cached for performance.
 */
export function getToken(property: string): string {
  if (cache.has(property)) {
    return cache.get(property)!
  }

  if (typeof document === 'undefined') return ''

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(property)
    .trim()

  if (value) {
    cache.set(property, value)
  }

  return value
}

/**
 * Clear the token cache (useful after theme changes).
 */
export function clearTokenCache(): void {
  cache.clear()
}

/**
 * Pre-resolved token values for frequent access.
 * Lazily evaluated on first access.
 */
export const tokens = {
  get bgPrimary() { return getToken('--color-bg-primary') },
  get bgSecondary() { return getToken('--color-bg-secondary') },
  get bgTertiary() { return getToken('--color-bg-tertiary') },
  get bgQuaternary() { return getToken('--color-bg-quaternary') },

  get textPrimary() { return getToken('--color-text-primary') },
  get textSecondary() { return getToken('--color-text-secondary') },
  get textMuted() { return getToken('--color-text-muted') },

  get accent() { return getToken('--color-accent') },
  get accentBright() { return getToken('--color-accent-bright') },
  get accentDim() { return getToken('--color-accent-dim') },

  get success() { return getToken('--color-success') },
  get warning() { return getToken('--color-warning') },
  get error() { return getToken('--color-error') },
  get info() { return getToken('--color-info') },

  get mock() { return getToken('--color-mock') },
  get real() { return getToken('--color-real') },

  get glassBg() { return getToken('--glass-bg') },
  get glassBorder() { return getToken('--glass-border') },
  get glassBorderHover() { return getToken('--glass-border-hover') },

  get iridescent1() { return getToken('--color-iridescent-1') },
  get iridescent2() { return getToken('--color-iridescent-2') },
  get iridescent3() { return getToken('--color-iridescent-3') },
  get iridescent4() { return getToken('--color-iridescent-4') },
}

/**
 * Chart.js tooltip style preset using design tokens.
 */
export const chartTooltipStyle = {
  get backgroundColor() { return 'rgba(7, 7, 13, 0.9)' },
  get borderColor() { return 'rgba(133, 133, 160, 0.3)' },
  borderWidth: 1,
  titleFont: { family: 'JetBrains Mono', size: 11 },
  bodyFont: { family: 'JetBrains Mono', size: 12 },
  get titleColor() { return tokens.textSecondary || '#8585a0' },
  get bodyColor() { return tokens.textPrimary || '#eaeaf2' },
  padding: 8,
  cornerRadius: 6,
}

/**
 * Chart.js grid style preset using design tokens.
 */
export const chartGridStyle = {
  get color() { return 'rgba(133, 133, 160, 0.08)' },
  drawBorder: false,
}
