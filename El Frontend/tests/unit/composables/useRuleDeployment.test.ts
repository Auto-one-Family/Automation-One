/**
 * useRuleDeployment Composable Tests (AUT-248)
 *
 * Validates rule deployment classification:
 *  - server: no hysteresis OR cross-ESP actuators OR notification/plugin/delay actions
 *  - esp:    hysteresis + actuator on same ESP, no server-only side effects
 *  - hybrid: offline-capable pair + server-only action(s)
 *
 * Banner reactivity is exercised by mutating the underlying ref and asserting
 * the computed `target` updates accordingly.
 */

import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import {
  classifyRuleDeployment,
  useRuleDeployment,
} from '@/composables/useRuleDeployment'
import type {
  LogicRule,
  HysteresisCondition,
  SensorCondition,
  ActuatorAction,
  NotificationAction,
} from '@/types/logic'

const NOW_ISO = '2026-05-06T00:00:00.000Z'

function makeRule(overrides: Partial<LogicRule> = {}): LogicRule {
  return {
    id: 'rule-001',
    name: 'Test Rule',
    enabled: true,
    conditions: [],
    logic_operator: 'AND',
    actions: [],
    priority: 5,
    cooldown_seconds: 0,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...overrides,
  }
}

const HYSTERESIS_ESP_A: HysteresisCondition = {
  type: 'hysteresis',
  esp_id: 'ESP_AAAA',
  gpio: 5,
  sensor_type: 'sht31_temp',
  activate_above: 28,
  deactivate_below: 24,
}

const SENSOR_THRESHOLD_ESP_A: SensorCondition = {
  type: 'sensor',
  esp_id: 'ESP_AAAA',
  gpio: 5,
  sensor_type: 'sht31_temp',
  operator: '>',
  value: 28,
}

const ACTUATOR_ESP_A: ActuatorAction = {
  type: 'actuator',
  esp_id: 'ESP_AAAA',
  gpio: 12,
  command: 'ON',
  value: 1.0,
}

const ACTUATOR_ESP_B: ActuatorAction = {
  type: 'actuator',
  esp_id: 'ESP_BBBB',
  gpio: 14,
  command: 'OFF',
  value: 0.0,
}

const NOTIFICATION_ACTION: NotificationAction = {
  type: 'notification',
  channel: 'email',
  target: 'admin@example.com',
  message_template: 'Temperature too high!',
}

describe('classifyRuleDeployment (AUT-248)', () => {
  describe('Pflicht-Testfall 1: Pure Server-Rule', () => {
    it('returns "server" for SensorCondition + NotificationAction', () => {
      const rule = makeRule({
        conditions: [SENSOR_THRESHOLD_ESP_A],
        actions: [NOTIFICATION_ACTION],
      })

      const info = classifyRuleDeployment(rule)

      expect(info.target).toBe('server')
      expect(info.hasOfflineCapablePair).toBe(false)
      expect(info.hasServerOnlyAction).toBe(true)
      expect(info.serverOnlyReasons).toContain('no_hysteresis')
      expect(info.serverOnlyReasons).toContain('notification_action')
      expect(info.offlineEspId).toBeNull()
    })

    it('returns "server" for plain SensorCondition + ActuatorAction without hysteresis', () => {
      const rule = makeRule({
        conditions: [SENSOR_THRESHOLD_ESP_A],
        actions: [ACTUATOR_ESP_A],
      })

      const info = classifyRuleDeployment(rule)

      expect(info.target).toBe('server')
      expect(info.serverOnlyReasons).toContain('no_hysteresis')
    })
  })

  describe('Pflicht-Testfall 2: Pure ESP-Rule', () => {
    it('returns "esp" for HysteresisCondition + ActuatorAction on same ESP', () => {
      const rule = makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A],
      })

      const info = classifyRuleDeployment(rule)

      expect(info.target).toBe('esp')
      expect(info.hasOfflineCapablePair).toBe(true)
      expect(info.hasServerOnlyAction).toBe(false)
      expect(info.offlineEspId).toBe('ESP_AAAA')
      expect(info.serverOnlyReasons).toEqual([])
    })
  })

  describe('Pflicht-Testfall 3: Hybrid-Rule', () => {
    it('returns "hybrid" for Hysteresis + same-ESP Actuator + NotificationAction', () => {
      const rule = makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A, NOTIFICATION_ACTION],
      })

      const info = classifyRuleDeployment(rule)

      expect(info.target).toBe('hybrid')
      expect(info.hasOfflineCapablePair).toBe(true)
      expect(info.hasServerOnlyAction).toBe(true)
      expect(info.offlineEspId).toBe('ESP_AAAA')
      expect(info.serverOnlyReasons).toContain('notification_action')
    })

    it('returns "hybrid" when actuator on different ESP than hysteresis trigger', () => {
      const rule = makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A, ACTUATOR_ESP_B],
      })

      const info = classifyRuleDeployment(rule)

      expect(info.target).toBe('hybrid')
      expect(info.serverOnlyReasons).toContain('cross_esp_action')
    })

    it('returns "server" when only cross-ESP actuator available (no same-ESP pair)', () => {
      const rule = makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_B],
      })

      const info = classifyRuleDeployment(rule)

      expect(info.target).toBe('server')
      expect(info.hasOfflineCapablePair).toBe(false)
      expect(info.serverOnlyReasons).toContain('cross_esp_action')
    })
  })

  describe('edge cases', () => {
    it('returns "server" with no_hysteresis reason for null rule', () => {
      const info = classifyRuleDeployment(null)
      expect(info.target).toBe('server')
      expect(info.serverOnlyReasons).toContain('no_hysteresis')
    })

    it('flags PluginAction as server-only', () => {
      const rule = makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [
          ACTUATOR_ESP_A,
          { type: 'plugin', plugin_id: 'autoops.notify', config: {} },
        ],
      })
      const info = classifyRuleDeployment(rule)
      expect(info.target).toBe('hybrid')
      expect(info.serverOnlyReasons).toContain('plugin_action')
    })

    it('flags DelayAction as server-only', () => {
      const rule = makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A, { type: 'delay', seconds: 30 }],
      })
      const info = classifyRuleDeployment(rule)
      expect(info.target).toBe('hybrid')
      expect(info.serverOnlyReasons).toContain('delay_action')
    })

    it('flags compound conditions as server-only construct', () => {
      const rule = makeRule({
        conditions: [
          {
            type: 'compound',
            logic: 'AND',
            conditions: [HYSTERESIS_ESP_A, SENSOR_THRESHOLD_ESP_A],
          },
        ],
        actions: [ACTUATOR_ESP_A],
      })
      const info = classifyRuleDeployment(rule)
      // Compound conditions disqualify offline_rules per server contract.
      expect(info.serverOnlyReasons).toContain('compound_condition')
    })
  })
})

describe('useRuleDeployment (reactivity bonus)', () => {
  it('switches from "esp" to "hybrid" when a NotificationAction is added', () => {
    const ruleRef = ref<LogicRule | null>(
      makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A],
      }),
    )

    const { target, hasServerOnlyAction } = useRuleDeployment(ruleRef)

    // Initial: pure ESP rule.
    expect(target.value).toBe('esp')
    expect(hasServerOnlyAction.value).toBe(false)

    // Mutate: add NotificationAction → must flip to hybrid.
    ruleRef.value = {
      ...ruleRef.value!,
      actions: [...ruleRef.value!.actions, NOTIFICATION_ACTION],
    }

    expect(target.value).toBe('hybrid')
    expect(hasServerOnlyAction.value).toBe(true)
  })

  it('switches from "esp" to "server" when hysteresis is removed', () => {
    const ruleRef = ref<LogicRule | null>(
      makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A],
      }),
    )
    const { target } = useRuleDeployment(ruleRef)
    expect(target.value).toBe('esp')

    ruleRef.value = {
      ...ruleRef.value!,
      conditions: [SENSOR_THRESHOLD_ESP_A],
    }
    expect(target.value).toBe('server')
  })

  it('returns "server" when ref is null', () => {
    const ruleRef = ref<LogicRule | null>(null)
    const { target } = useRuleDeployment(ruleRef)
    expect(target.value).toBe('server')
  })
})
