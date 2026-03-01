/**
 * Shared chart color palette for dashboard widgets.
 *
 * These 8 colors align with the design system (iridescent, status, accent):
 * - Blue (#60a5fa), Green (#34d399), Amber (#fbbf24), Red (#f87171)
 * - Purple (#a78bfa), Cyan (#22d3ee), Orange (#fb923c), Pink (#f472b6)
 *
 * Used by: WidgetConfigPanel (color swatches), MultiSensorWidget (line colors)
 */
export const CHART_COLORS = [
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#22d3ee',
  '#fb923c',
  '#f472b6',
] as const

export type ChartColor = (typeof CHART_COLORS)[number]
