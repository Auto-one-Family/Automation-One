/**
 * AUT-249: Unit tests for the rule-flow column mapping helper.
 *
 * Pure-function tests — no Vue Flow / DOM required.
 */

import { describe, it, expect } from 'vitest'
import {
  getNodeColumn,
  getNodeColumnX,
  shouldMigrateNodePosition,
  COLUMN_X_FRACTION,
} from '@/utils/ruleNodeColumns'

describe('getNodeColumn', () => {
  it('classifies sensor-based triggers into the trigger column', () => {
    expect(getNodeColumn('sensor')).toBe('trigger')
    expect(getNodeColumn('sensor_threshold')).toBe('trigger')
    expect(getNodeColumn('hysteresis')).toBe('trigger')
    expect(getNodeColumn('sensor_diff')).toBe('trigger')
  })

  it('classifies time-based triggers into the trigger column', () => {
    expect(getNodeColumn('time')).toBe('trigger')
    expect(getNodeColumn('time_window')).toBe('trigger')
  })

  it('classifies diagnostics_status into the trigger column', () => {
    expect(getNodeColumn('diagnostics_status')).toBe('trigger')
  })

  it('classifies logic / compound nodes into the condition column', () => {
    expect(getNodeColumn('logic')).toBe('condition')
    expect(getNodeColumn('compound')).toBe('condition')
  })

  it('classifies all action node types into the action column', () => {
    expect(getNodeColumn('actuator')).toBe('action')
    expect(getNodeColumn('actuator_command')).toBe('action')
    expect(getNodeColumn('notification')).toBe('action')
    expect(getNodeColumn('delay')).toBe('action')
    expect(getNodeColumn('plugin')).toBe('action')
    expect(getNodeColumn('autoops_trigger')).toBe('action')
    expect(getNodeColumn('run_diagnostic')).toBe('action')
  })

  it('falls back to condition column for unknown / nullish node types', () => {
    expect(getNodeColumn(undefined)).toBe('condition')
    expect(getNodeColumn(null)).toBe('condition')
    expect(getNodeColumn('')).toBe('condition')
    expect(getNodeColumn('totally-unknown-type')).toBe('condition')
  })
})

describe('getNodeColumnX', () => {
  it('places trigger nodes near the left edge (10 % of canvas width)', () => {
    expect(getNodeColumnX('sensor', 1000)).toBe(Math.round(1000 * COLUMN_X_FRACTION.trigger))
    expect(getNodeColumnX('sensor', 1000)).toBe(100)
  })

  it('places condition nodes around the middle (40 % of canvas width)', () => {
    expect(getNodeColumnX('logic', 1000)).toBe(400)
  })

  it('places action nodes near the right edge (70 % of canvas width)', () => {
    expect(getNodeColumnX('actuator', 1000)).toBe(700)
    expect(getNodeColumnX('notification', 1000)).toBe(700)
  })

  it('uses a sensible default canvas width when given zero or invalid input', () => {
    // Falls back to 900 px → action column = 0.7 × 900 = 630
    expect(getNodeColumnX('actuator', 0)).toBe(630)
    expect(getNodeColumnX('actuator', Number.NaN)).toBe(630)
    expect(getNodeColumnX('actuator', -50)).toBe(630)
  })
})

describe('shouldMigrateNodePosition', () => {
  it('does NOT migrate positions inside the tolerance band (manual layout preserved)', () => {
    // Trigger column target at 100 px (canvasWidth=1000), tolerance ±150 px
    expect(shouldMigrateNodePosition('sensor', 80, 1000)).toBe(false)
    expect(shouldMigrateNodePosition('sensor', 200, 1000)).toBe(false)
  })

  it('migrates positions clearly outside the tolerance band', () => {
    // Trigger node sitting in the action column → must migrate
    expect(shouldMigrateNodePosition('sensor', 700, 1000)).toBe(true)
    // Action node sitting near the trigger column → must migrate
    expect(shouldMigrateNodePosition('actuator', 50, 1000)).toBe(true)
  })

  it('migrates when the position is non-finite', () => {
    expect(shouldMigrateNodePosition('sensor', Number.NaN, 1000)).toBe(true)
  })
})
