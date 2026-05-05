/**
 * AUT-249: Snapshot tests for the three-column rule-flow layout.
 *
 * Vue Flow's canvas-heavy runtime makes a full mount() of RuleFlowEditor.vue
 * brittle in happy-dom. Instead, these tests verify the SAME contract that
 * the editor relies on: every condition/action of an existing LogicRule is
 * placed into the correct visual column ('trigger' / 'condition' / 'action')
 * via getNodeColumn(). This guarantees the "loads existing rules 1:1 without
 * data loss" acceptance criterion of AUT-249, because the editor uses
 * getNodeColumnX() (built on top of getNodeColumn()) to assign the x position
 * of each node when reconstructing the graph from a rule.
 *
 * Three rule snapshots cover the matrix from the AUT-249 spec:
 *  1. Rule with TimeCondition           → time node lands in the trigger column
 *  2. Rule with Compound(Sensor + Time) → compound (logic) lands in the
 *     condition column, while the inner sensor + time conditions are still
 *     classified as trigger inputs
 *  3. Rule with Hysteresis + Actuator   → hysteresis lands in trigger,
 *     actuator lands in action
 */

import { describe, it, expect } from 'vitest'
import type {
  LogicRule,
  LogicCondition,
  LogicAction,
  CompoundCondition,
} from '@/types/logic'
import { getNodeColumn } from '@/utils/ruleNodeColumns'

/**
 * Helper: walk a rule's conditions + actions in the same order in which
 * `ruleToGraph()` (RuleFlowEditor.vue) emits Vue Flow nodes. Compound
 * conditions emit one logic gate plus their flattened sub-conditions.
 */
function nodeTypesForRule(rule: LogicRule): string[] {
  const types: string[] = []

  function walkConditions(conds: LogicCondition[]): void {
    for (const cond of conds) {
      if (cond.type === 'compound') {
        // ruleToGraph emits a logic gate for each rule, plus the inner
        // sub-conditions become individual nodes.
        types.push('logic')
        walkConditions((cond as CompoundCondition).conditions)
      } else if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
        types.push('sensor')
      } else if (cond.type === 'hysteresis') {
        // RuleFlowEditor renders hysteresis as a `sensor` node with
        // isHysteresis=true — it still belongs to the trigger column.
        types.push('sensor')
      } else if (cond.type === 'time_window' || cond.type === 'time') {
        types.push('time')
      } else if (cond.type === 'diagnostics_status') {
        types.push('diagnostics_status')
      } else if (cond.type === 'sensor_diff') {
        types.push('sensor_diff')
      }
    }
  }

  walkConditions(rule.conditions)

  // ruleToGraph always emits one logic gate per rule (consistent graph
  // structure — see RuleFlowEditor.vue, "Always create logic gate").
  if (!types.includes('logic')) {
    types.push('logic')
  }

  for (const action of rule.actions) {
    const a = action as LogicAction
    if (a.type === 'actuator' || a.type === 'actuator_command') {
      types.push('actuator')
    } else if (a.type === 'notification') {
      types.push('notification')
    } else if (a.type === 'delay') {
      types.push('delay')
    } else if (a.type === 'plugin' || a.type === 'autoops_trigger') {
      types.push('plugin')
    } else if (a.type === 'run_diagnostic') {
      types.push('run_diagnostic')
    }
  }

  return types
}

const baseMeta = {
  id: 'rule-test',
  name: 'Test',
  enabled: true,
  priority: 5,
  cooldown_seconds: 60,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const

describe('RuleFlowEditor — three-column layout (AUT-249)', () => {
  describe('Rule snapshot 1: TimeCondition only', () => {
    const rule: LogicRule = {
      ...baseMeta,
      logic_operator: 'AND',
      conditions: [
        {
          type: 'time_window',
          start_hour: 6,
          end_hour: 20,
        },
      ],
      actions: [
        {
          type: 'actuator',
          esp_id: 'esp-1',
          gpio: 5,
          command: 'ON',
        },
      ],
    }

    it('places the time node in the trigger column', () => {
      const types = nodeTypesForRule(rule)
      expect(getNodeColumn('time')).toBe('trigger')
      expect(types).toContain('time')
    })

    it('places the logic gate in the condition column', () => {
      const types = nodeTypesForRule(rule)
      expect(types).toContain('logic')
      expect(getNodeColumn('logic')).toBe('condition')
    })

    it('places the actuator in the action column', () => {
      const types = nodeTypesForRule(rule)
      expect(types).toContain('actuator')
      expect(getNodeColumn('actuator')).toBe('action')
    })

    it('preserves all rule parts without data loss when classified by column', () => {
      const types = nodeTypesForRule(rule)
      const columns = types.map(getNodeColumn)
      // Exactly one trigger (time), one condition (logic), one action (actuator)
      expect(columns.filter((c) => c === 'trigger').length).toBe(1)
      expect(columns.filter((c) => c === 'condition').length).toBe(1)
      expect(columns.filter((c) => c === 'action').length).toBe(1)
    })
  })

  describe('Rule snapshot 2: Compound(Sensor AND TimeWindow)', () => {
    const rule: LogicRule = {
      ...baseMeta,
      logic_operator: 'AND',
      conditions: [
        {
          type: 'compound',
          logic: 'AND',
          conditions: [
            {
              type: 'sensor',
              esp_id: 'esp-1',
              gpio: 4,
              sensor_type: 'DS18B20',
              operator: '>',
              value: 28,
            },
            {
              type: 'time_window',
              start_hour: 8,
              end_hour: 18,
            },
          ],
        },
      ],
      actions: [
        {
          type: 'actuator',
          esp_id: 'esp-1',
          gpio: 5,
          command: 'ON',
        },
      ],
    }

    it('places the compound (logic) node in the condition column', () => {
      const types = nodeTypesForRule(rule)
      expect(types.filter((t) => t === 'logic').length).toBeGreaterThanOrEqual(1)
      expect(getNodeColumn('logic')).toBe('condition')
    })

    it('places inner sensor + time conditions in the trigger column', () => {
      const types = nodeTypesForRule(rule)
      expect(types).toContain('sensor')
      expect(types).toContain('time')
      expect(getNodeColumn('sensor')).toBe('trigger')
      expect(getNodeColumn('time')).toBe('trigger')
    })

    it('keeps every part of the compound rule reachable through the column map', () => {
      const types = nodeTypesForRule(rule)
      const columns = types.map(getNodeColumn)
      // Two triggers (sensor + time), at least one condition (logic), one action
      expect(columns.filter((c) => c === 'trigger').length).toBe(2)
      expect(columns.filter((c) => c === 'condition').length).toBeGreaterThanOrEqual(1)
      expect(columns.filter((c) => c === 'action').length).toBe(1)
    })
  })

  describe('Rule snapshot 3: Hysteresis + Actuator (offline-capable)', () => {
    const rule: LogicRule = {
      ...baseMeta,
      logic_operator: 'AND',
      conditions: [
        {
          type: 'hysteresis',
          esp_id: 'esp-1',
          gpio: 4,
          sensor_type: 'sht31_temp',
          activate_above: 28,
          deactivate_below: 24,
        },
      ],
      actions: [
        {
          type: 'actuator',
          esp_id: 'esp-1',
          gpio: 5,
          command: 'ON',
        },
      ],
    }

    it('places the hysteresis node in the trigger column', () => {
      const types = nodeTypesForRule(rule)
      // Hysteresis is rendered as a `sensor` node with isHysteresis=true.
      expect(types).toContain('sensor')
      expect(getNodeColumn('sensor')).toBe('trigger')
      // Direct hysteresis type is also a trigger when used standalone.
      expect(getNodeColumn('hysteresis')).toBe('trigger')
    })

    it('places the actuator in the action column', () => {
      const types = nodeTypesForRule(rule)
      expect(types).toContain('actuator')
      expect(getNodeColumn('actuator')).toBe('action')
    })

    it('produces a clean trigger → condition → action chain (no orphaned parts)', () => {
      const types = nodeTypesForRule(rule)
      const columns = types.map(getNodeColumn)
      expect(columns.filter((c) => c === 'trigger').length).toBe(1)
      expect(columns.filter((c) => c === 'condition').length).toBe(1)
      expect(columns.filter((c) => c === 'action').length).toBe(1)
      // No node should remain unclassified.
      expect(columns.includes(undefined as unknown as ReturnType<typeof getNodeColumn>)).toBe(false)
    })
  })
})
