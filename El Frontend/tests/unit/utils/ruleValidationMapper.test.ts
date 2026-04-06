import { describe, it, expect } from 'vitest'
import {
  extractRuleValidationIssues,
  mapRuleValidationIssues,
} from '@/utils/ruleValidationMapper'

describe('ruleValidationMapper', () => {
  it('maps backend loc for conditions/actions to node + field', () => {
    const issues = [
      { loc: ['body', 'conditions', 0, 'sensor_type'], msg: 'sensor_type required' },
      { loc: ['body', 'actions', 1, 'command'], msg: 'command invalid' },
    ]

    const mapped = mapRuleValidationIssues(issues, {
      conditionNodeIds: ['cond-node-a'],
      actionNodeIds: ['action-node-a', 'action-node-b'],
    })

    expect(mapped.nodeErrors['cond-node-a'].sensorType[0]).toContain('required')
    expect(mapped.nodeErrors['action-node-b'].command[0]).toContain('invalid')
    expect(Object.keys(mapped.metadataErrors)).toHaveLength(0)
  })

  it('maps metadata loc directly', () => {
    const issues = [{ loc: ['body', 'cooldown_seconds'], msg: 'must be >= 0' }]
    const mapped = mapRuleValidationIssues(issues, { conditionNodeIds: [], actionNodeIds: [] })
    expect(mapped.metadataErrors.cooldown_seconds[0]).toContain('>= 0')
  })

  it('extracts issues from axios-like error payload', () => {
    const error = {
      response: {
        data: {
          detail: [{ loc: ['body', 'priority'], msg: 'invalid' }],
        },
      },
    }

    const extracted = extractRuleValidationIssues(error)
    expect(extracted).toHaveLength(1)
    expect(extracted[0].msg).toBe('invalid')
  })
})
