/**
 * useRuleDeployment Composable Tests (AUT-248)
 *
 * Validates rule deployment classification mirroring
 * ConfigPayloadBuilder._extract_offline_rule() fallback chain:
 *   hysteresis → sensor_threshold (3a) → time_window-only (3d)
 *
 * Targets:
 *  - server: no offline trigger pair, or server-only constructs
 *  - esp:    offline-capable trigger + same-ESP actuator, no server-only side effects
 *  - hybrid: offline-capable pair + server-only action(s)
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
  TimeCondition,
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

/** Non-calibration sensor, convertible operator → offline-capable via path 2 */
const SENSOR_THRESHOLD_ESP_A: SensorCondition = {
  type: 'sensor',
  esp_id: 'ESP_AAAA',
  gpio: 5,
  sensor_type: 'sht31_temp',
  operator: '>',
  value: 28,
}

/** Calibration-required sensor → stays server-only */
const SENSOR_PH_ESP_A: SensorCondition = {
  type: 'sensor',
  esp_id: 'ESP_AAAA',
  gpio: 6,
  sensor_type: 'ph',
  operator: '>',
  value: 7.5,
}

/** Unsupported operator → stays server-only */
const SENSOR_EQUAL_ESP_A: SensorCondition = {
  type: 'sensor',
  esp_id: 'ESP_AAAA',
  gpio: 5,
  sensor_type: 'sht31_temp',
  operator: '==',
  value: 25,
}

const TIME_WINDOW: TimeCondition = {
  type: 'time_window',
  start_hour: 11,
  start_minute: 0,
  end_hour: 11,
  end_minute: 1,
}

const ACTUATOR_ESP_A: ActuatorAction = {
  type: 'actuator',
  esp_id: 'ESP_AAAA',
  gpio: 12,
  command: 'ON',
  value: 1.0,
}

const ACTUATOR_OFF_ESP_A: ActuatorAction = {
  type: 'actuator',
  esp_id: 'ESP_AAAA',
  gpio: 12,
  command: 'OFF',
  value: 0.0,
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

// =============================================================================
// Pflicht-Testfall 1: Pure Server-Rule
// =============================================================================

describe('classifyRuleDeployment — server-only rules (AUT-248)', () => {
  it('returns "server" for notification-only action (no actuator)', () => {
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

  it('returns "server" for calibration-required sensor (ph) + actuator', () => {
    const rule = makeRule({
      conditions: [SENSOR_PH_ESP_A],
      actions: [ACTUATOR_ESP_A],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('server')
    expect(info.hasOfflineCapablePair).toBe(false)
    expect(info.serverOnlyReasons).toContain('calibration_required_sensor')
  })

  it('returns "server" for unsupported operator (==) + actuator', () => {
    const rule = makeRule({
      conditions: [SENSOR_EQUAL_ESP_A],
      actions: [ACTUATOR_ESP_A],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('server')
    expect(info.hasOfflineCapablePair).toBe(false)
    expect(info.serverOnlyReasons).toContain('unsupported_operator')
  })

  it('returns "server" for OR-compound rule with 2+ conditions', () => {
    const rule = makeRule({
      logic_operator: 'OR',
      conditions: [HYSTERESIS_ESP_A, SENSOR_THRESHOLD_ESP_A],
      actions: [ACTUATOR_ESP_A],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('server')
    expect(info.hasOfflineCapablePair).toBe(false)
    expect(info.serverOnlyReasons).toContain('or_compound_rule')
  })

  it('returns "server" with no_hysteresis reason for null rule', () => {
    const info = classifyRuleDeployment(null)
    expect(info.target).toBe('server')
    expect(info.serverOnlyReasons).toContain('no_hysteresis')
  })
})

// =============================================================================
// Pflicht-Testfall 2: Pure ESP-Rule (offline-capable)
// =============================================================================

describe('classifyRuleDeployment — esp (offline-capable) rules (AUT-248)', () => {
  it('returns "esp" for HysteresisCondition + same-ESP ActuatorAction', () => {
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

  it('returns "esp" for sensor_threshold with convertible operator + same-ESP actuator (path 2)', () => {
    // Mirrors _extract_offline_rule() 3a: sensor → synthetic hysteresis with deadband
    const rule = makeRule({
      conditions: [SENSOR_THRESHOLD_ESP_A],
      actions: [ACTUATOR_ESP_A],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('esp')
    expect(info.hasOfflineCapablePair).toBe(true)
    expect(info.offlineEspId).toBe('ESP_AAAA')
    expect(info.hasServerOnlyAction).toBe(false)
  })

  it('returns "esp" for time_window + same-ESP ON actuator (path 3 — binary schedule)', () => {
    // Mirrors _extract_offline_rule() 3d: time_window-only fallback
    const rule = makeRule({
      conditions: [TIME_WINDOW],
      actions: [ACTUATOR_ESP_A],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('esp')
    expect(info.hasOfflineCapablePair).toBe(true)
    expect(info.offlineEspId).toBe('ESP_AAAA')
    expect(info.hasServerOnlyAction).toBe(false)
  })

  it('returns "esp" for time_window + sensor_threshold + same-ESP actuator (time becomes time_filter)', () => {
    // The server uses sensor_threshold path; time_window becomes time_filter on the offline rule.
    const rule = makeRule({
      conditions: [TIME_WINDOW, SENSOR_THRESHOLD_ESP_A],
      actions: [ACTUATOR_ESP_A],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('esp')
    expect(info.hasOfflineCapablePair).toBe(true)
  })
})

// =============================================================================
// Pflicht-Testfall 3: Hybrid-Rule
// =============================================================================

describe('classifyRuleDeployment — hybrid rules (AUT-248)', () => {
  it('returns "hybrid" for Hysteresis + same-ESP Actuator + Notification', () => {
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

  it('returns "hybrid" for sensor_threshold + same-ESP actuator + notification', () => {
    const rule = makeRule({
      conditions: [SENSOR_THRESHOLD_ESP_A],
      actions: [ACTUATOR_ESP_A, NOTIFICATION_ACTION],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('hybrid')
    expect(info.hasOfflineCapablePair).toBe(true)
    expect(info.serverOnlyReasons).toContain('notification_action')
  })

  it('returns "hybrid" for time_window + same-ESP ON actuator + notification', () => {
    const rule = makeRule({
      conditions: [TIME_WINDOW],
      actions: [ACTUATOR_ESP_A, NOTIFICATION_ACTION],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('hybrid')
    expect(info.hasOfflineCapablePair).toBe(true)
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

// =============================================================================
// time_window edge cases
// =============================================================================

describe('classifyRuleDeployment — time_window edge cases (AUT-248)', () => {
  it('returns "server" for time_window + OFF actuator (binary ON required for ESP path 3)', () => {
    // The server needs time_window_target_state = True; OFF leaves it None → skipped.
    const rule = makeRule({
      conditions: [TIME_WINDOW],
      actions: [ACTUATOR_OFF_ESP_A],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('server')
    expect(info.hasOfflineCapablePair).toBe(false)
  })

  it('returns "server" for time_window without actuator', () => {
    const rule = makeRule({
      conditions: [TIME_WINDOW],
      actions: [NOTIFICATION_ACTION],
    })

    const info = classifyRuleDeployment(rule)

    expect(info.target).toBe('server')
    expect(info.hasOfflineCapablePair).toBe(false)
  })
})

// =============================================================================
// Misc edge cases
// =============================================================================

describe('classifyRuleDeployment — misc edge cases (AUT-248)', () => {
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
    expect(info.serverOnlyReasons).toContain('compound_condition')
  })

  it('OR rule with single condition is still offline-capable', () => {
    // Only 1 condition → OR/AND makes no difference → offline path works.
    const rule = makeRule({
      logic_operator: 'OR',
      conditions: [HYSTERESIS_ESP_A],
      actions: [ACTUATOR_ESP_A],
    })
    const info = classifyRuleDeployment(rule)
    expect(info.target).toBe('esp')
    expect(info.serverOnlyReasons).not.toContain('or_compound_rule')
  })
})

// =============================================================================
// Reactivity tests
// =============================================================================

describe('useRuleDeployment (reactivity — AUT-248)', () => {
  it('switches from "esp" to "hybrid" when a NotificationAction is added', () => {
    const ruleRef = ref<LogicRule | null>(
      makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A],
      }),
    )

    const { target, hasServerOnlyAction } = useRuleDeployment(ruleRef)

    expect(target.value).toBe('esp')
    expect(hasServerOnlyAction.value).toBe(false)

    ruleRef.value = {
      ...ruleRef.value!,
      actions: [...ruleRef.value!.actions, NOTIFICATION_ACTION],
    }

    expect(target.value).toBe('hybrid')
    expect(hasServerOnlyAction.value).toBe(true)
  })

  it('switches from "esp" to "server" when hysteresis replaced with calibration-required sensor', () => {
    const ruleRef = ref<LogicRule | null>(
      makeRule({
        conditions: [HYSTERESIS_ESP_A],
        actions: [ACTUATOR_ESP_A],
      }),
    )
    const { target } = useRuleDeployment(ruleRef)
    expect(target.value).toBe('esp')

    // pH sensor requires calibration → not convertible to offline rule
    ruleRef.value = {
      ...ruleRef.value!,
      conditions: [SENSOR_PH_ESP_A],
    }
    expect(target.value).toBe('server')
  })

  it('switches from "server" to "esp" when hysteresis is added', () => {
    const ruleRef = ref<LogicRule | null>(
      makeRule({
        conditions: [SENSOR_PH_ESP_A],
        actions: [ACTUATOR_ESP_A],
      }),
    )
    const { target } = useRuleDeployment(ruleRef)
    expect(target.value).toBe('server')

    ruleRef.value = {
      ...ruleRef.value!,
      conditions: [HYSTERESIS_ESP_A],
    }
    expect(target.value).toBe('esp')
  })

  it('time_window rule switches from "esp" to "hybrid" when notification is added', () => {
    const ruleRef = ref<LogicRule | null>(
      makeRule({
        conditions: [TIME_WINDOW],
        actions: [ACTUATOR_ESP_A],
      }),
    )
    const { target } = useRuleDeployment(ruleRef)
    expect(target.value).toBe('esp')

    ruleRef.value = {
      ...ruleRef.value!,
      actions: [...ruleRef.value!.actions, NOTIFICATION_ACTION],
    }
    expect(target.value).toBe('hybrid')
  })

  it('returns "server" when ref is null', () => {
    const ruleRef = ref<LogicRule | null>(null)
    const { target } = useRuleDeployment(ruleRef)
    expect(target.value).toBe('server')
  })
})
