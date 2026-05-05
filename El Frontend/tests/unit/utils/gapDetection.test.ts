/**
 * Gap Detection Utility Unit Tests (AUT-113)
 *
 * Tests for sparse-data-aware gap heuristic used by HistoricalChart.
 * Covers acceptance criteria:
 *   - B-CHART-01: 2 points with 5h gap → 2 null markers inserted
 *   - B-CHART-02: median-based interval, sparse fallback to resolution
 *   - B-CHART-04: GapMarkingMode union type ('auto' | 'hatched' | 'off')
 */

import { describe, it, expect } from 'vitest'
import {
  calculateMedianInterval,
  computeExpectedInterval,
  detectGaps,
  insertGapMarkers,
  countRealDataPoints,
  resolutionToMs,
  formatGapDuration,
  formatTimeShort,
  type GapDataPoint,
  type GapMarkingMode,
} from '@/utils/gapDetection'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

function point(timestamp: Date, value: number | null): GapDataPoint {
  return { timestamp, value }
}

// =============================================================================
// resolutionToMs
// =============================================================================

describe('resolutionToMs', () => {
  it('returns 0 for null/undefined', () => {
    expect(resolutionToMs(null)).toBe(0)
    expect(resolutionToMs(undefined)).toBe(0)
  })

  it('maps known resolutions to milliseconds', () => {
    expect(resolutionToMs('1m')).toBe(60_000)
    expect(resolutionToMs('5m')).toBe(300_000)
    expect(resolutionToMs('1h')).toBe(3_600_000)
    expect(resolutionToMs('1d')).toBe(86_400_000)
  })

  it('returns 0 for unknown resolution string', () => {
    expect(resolutionToMs('raw')).toBe(0)
    expect(resolutionToMs('xyz')).toBe(0)
  })
})

// =============================================================================
// calculateMedianInterval
// =============================================================================

describe('calculateMedianInterval', () => {
  it('returns 0 when fewer than 2 points', () => {
    expect(calculateMedianInterval([])).toBe(0)
    expect(calculateMedianInterval([{ timestamp: new Date() }])).toBe(0)
  })

  it('returns the only interval for exactly 2 points', () => {
    const points = [
      { timestamp: new Date(0) },
      { timestamp: new Date(60_000) },
    ]
    expect(calculateMedianInterval(points)).toBe(60_000)
  })

  it('returns median of intervals (robust against outliers)', () => {
    // 1m, 1m, 1m, 5h — median of [60k, 60k, 60k, 18M] = 60k
    const points = [
      { timestamp: new Date(0) },
      { timestamp: new Date(60_000) },
      { timestamp: new Date(120_000) },
      { timestamp: new Date(180_000) },
      { timestamp: new Date(180_000 + 5 * HOUR_MS) },
    ]
    const median = calculateMedianInterval(points)
    expect(median).toBe(60_000)
  })
})

// =============================================================================
// computeExpectedInterval
// =============================================================================

describe('computeExpectedInterval', () => {
  it('uses resolution bucket for sparse data (< 5 points)', () => {
    expect(computeExpectedInterval(0, '1h', 2)).toBe(HOUR_MS)
    expect(computeExpectedInterval(60_000, '5m', 3)).toBe(300_000)
  })

  it('uses max(median, resolution) for normal data', () => {
    // median > resolution → median wins
    expect(computeExpectedInterval(2 * MINUTE_MS, '1m', 10)).toBe(2 * MINUTE_MS)
    // resolution > median → resolution wins (avoids false-positive gaps)
    expect(computeExpectedInterval(30_000, '1m', 10)).toBe(MINUTE_MS)
  })

  it('falls back to median when no resolution given and data is sparse', () => {
    // No resolution available → must use median even when sparse
    expect(computeExpectedInterval(45_000, null, 2)).toBe(45_000)
    expect(computeExpectedInterval(45_000, undefined, 3)).toBe(45_000)
  })

  it('returns 0 when both median and resolution are 0', () => {
    expect(computeExpectedInterval(0, null, 10)).toBe(0)
  })
})

// =============================================================================
// detectGaps
// =============================================================================

describe('detectGaps', () => {
  it('returns empty array for fewer than 2 points', () => {
    expect(detectGaps([], 60_000)).toEqual([])
    expect(detectGaps([point(new Date(), 1)], 60_000)).toEqual([])
  })

  it('returns empty array when expectedIntervalMs is 0', () => {
    const points = [point(new Date(0), 1), point(new Date(HOUR_MS), 2)]
    expect(detectGaps(points, 0)).toEqual([])
  })

  it('detects a single gap when delta > 3× expected', () => {
    const points = [
      point(new Date(0), 1),
      point(new Date(5 * HOUR_MS), 2),
    ]
    const gaps = detectGaps(points, HOUR_MS)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].durationMs).toBe(5 * HOUR_MS)
  })

  it('does not detect gap when delta ≤ 3× expected', () => {
    const points = [
      point(new Date(0), 1),
      point(new Date(3 * HOUR_MS), 2),
    ]
    expect(detectGaps(points, HOUR_MS)).toEqual([])
  })

  it('skips gaps where one endpoint is null', () => {
    const points = [
      point(new Date(0), 1),
      point(new Date(HOUR_MS), null),
      point(new Date(10 * HOUR_MS), 2),
    ]
    expect(detectGaps(points, HOUR_MS)).toEqual([])
  })
})

// =============================================================================
// insertGapMarkers — B-CHART-01 acceptance
// =============================================================================

describe('insertGapMarkers (B-CHART-01)', () => {
  it('returns input unchanged when fewer than 2 points', () => {
    const single = [point(new Date(0), 1)]
    expect(insertGapMarkers(single, HOUR_MS)).toEqual(single)
    expect(insertGapMarkers([], HOUR_MS)).toEqual([])
  })

  it('returns input unchanged when expectedIntervalMs is 0', () => {
    const points = [point(new Date(0), 1), point(new Date(HOUR_MS), 2)]
    expect(insertGapMarkers(points, 0)).toEqual(points)
  })

  it('B-CHART-01: 2 points + 5h gap → inserts exactly 2 null markers', () => {
    const t0 = new Date(0)
    const t1 = new Date(5 * HOUR_MS)
    const points = [point(t0, 22.5), point(t1, 23.1)]
    const expected = HOUR_MS // resolution-derived

    const result = insertGapMarkers(points, expected)

    // Original 2 points + 2 null markers = 4 entries
    expect(result).toHaveLength(4)

    // First and last entries are the original real points
    expect(result[0].value).toBe(22.5)
    expect(result[3].value).toBe(23.1)

    // Middle two entries are gap markers (null + _gap flag)
    expect(result[1].value).toBeNull()
    expect(result[1]._gap).toBe(true)
    expect(result[2].value).toBeNull()
    expect(result[2]._gap).toBe(true)

    // Markers sit just inside the gap boundaries (off-by-one ms)
    expect(result[1].timestamp.getTime()).toBe(t0.getTime() + 1)
    expect(result[2].timestamp.getTime()).toBe(t1.getTime() - 1)
  })

  it('does not insert markers for tightly-spaced points', () => {
    const points = [
      point(new Date(0), 1),
      point(new Date(MINUTE_MS), 2),
      point(new Date(2 * MINUTE_MS), 3),
    ]
    const result = insertGapMarkers(points, MINUTE_MS)
    expect(result).toHaveLength(3)
    expect(result.every((p) => !p._gap)).toBe(true)
  })

  it('handles multiple gaps independently', () => {
    const points = [
      point(new Date(0), 1),
      point(new Date(5 * HOUR_MS), 2),
      point(new Date(5 * HOUR_MS + MINUTE_MS), 3),
      point(new Date(20 * HOUR_MS), 4),
    ]
    const result = insertGapMarkers(points, HOUR_MS)
    // 4 real + 4 markers (2 per gap, 2 gaps) = 8
    expect(result).toHaveLength(8)
    expect(result.filter((p) => p._gap).length).toBe(4)
  })

  it('does not insert markers when previous value is null', () => {
    const points: GapDataPoint[] = [
      point(new Date(0), null),
      point(new Date(5 * HOUR_MS), 2),
    ]
    const result = insertGapMarkers(points, HOUR_MS)
    expect(result).toHaveLength(2)
    expect(result.every((p) => !p._gap)).toBe(true)
  })
})

// =============================================================================
// countRealDataPoints
// =============================================================================

describe('countRealDataPoints', () => {
  it('counts only non-null, non-gap points', () => {
    const points: GapDataPoint[] = [
      { timestamp: new Date(0), value: 1 },
      { timestamp: new Date(1), value: null, _gap: true },
      { timestamp: new Date(2), value: null, _gap: true },
      { timestamp: new Date(3), value: 2 },
      { timestamp: new Date(4), value: null }, // legitimate null, not gap
    ]
    expect(countRealDataPoints(points)).toBe(2)
  })
})

// =============================================================================
// formatGapDuration / formatTimeShort
// =============================================================================

describe('formatGapDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatGapDuration(45_000)).toBe('45s')
  })

  it('formats sub-hour durations as minutes', () => {
    expect(formatGapDuration(15 * MINUTE_MS)).toBe('15 Min')
  })

  it('formats sub-day durations as hours+minutes', () => {
    expect(formatGapDuration(2 * HOUR_MS)).toBe('2h')
    expect(formatGapDuration(2 * HOUR_MS + 30 * MINUTE_MS)).toBe('2h 30m')
  })

  it('formats long durations as days+hours', () => {
    expect(formatGapDuration(86_400_000)).toBe('1d')
    expect(formatGapDuration(86_400_000 + 5 * HOUR_MS)).toBe('1d 5h')
  })
})

describe('formatTimeShort', () => {
  it('formats Date as HH:mm with zero-padding', () => {
    const d = new Date(2026, 0, 1, 9, 5)
    expect(formatTimeShort(d)).toBe('09:05')
  })
})

// =============================================================================
// GapMarkingMode type guard (B-CHART-04 — TypeScript-strict)
// =============================================================================

describe('GapMarkingMode (B-CHART-04)', () => {
  it('accepts the three valid mode literals at compile time', () => {
    const modes: GapMarkingMode[] = ['auto', 'hatched', 'off']
    expect(modes).toHaveLength(3)
    // Sanity: the type is a string union, runtime values match
    expect(modes.every((m) => typeof m === 'string')).toBe(true)
  })
})
