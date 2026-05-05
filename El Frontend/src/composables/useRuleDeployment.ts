/**
 * useRuleDeployment Composable (AUT-248)
 *
 * Determines where a rule will be evaluated:
 *  - 'esp':    Rule runs entirely on ESP hardware (offline-capable). Requires
 *              a HysteresisCondition AND at least one ActuatorAction whose
 *              esp_id matches the hysteresis-trigger esp_id. No server-only
 *              actions (notification/plugin/delay) and no cross-ESP actions.
 *  - 'server': Rule needs the server (default). No hysteresis, OR cross-ESP
 *              actions, OR notification/plugin/delay actions.
 *  - 'hybrid': Rule has BOTH an offline-capable hysteresis-actuator pair
 *              (same ESP) AND server-only side effects (notification, plugin,
 *              delay, or cross-ESP actuator actions).
 *
 * Detection mirrors `ConfigPayloadBuilder._build_offline_rules()` in
 *   El Servador/god_kaiser_server/src/services/config_builder.py
 *
 * The composable is purely client-side; no REST endpoints are added.
 *
 * @see types/logic.ts for LogicRule, HysteresisCondition, ActuatorAction
 */

import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  LogicRule,
  LogicCondition,
  LogicAction,
  HysteresisCondition,
  ActuatorAction,
  CompoundCondition,
} from '@/types/logic'

/** Where the rule will be evaluated. */
export type RuleDeploymentTarget = 'esp' | 'server' | 'hybrid'

/** Reason a rule cannot run offline (used for tooltips/diagnostics). */
export type ServerOnlyReason =
  | 'no_hysteresis'
  | 'cross_esp_action'
  | 'notification_action'
  | 'plugin_action'
  | 'delay_action'
  | 'compound_condition'
  | 'diagnostics_condition'
  | 'sensor_diff_condition'

export interface RuleDeploymentInfo {
  /** Final target: where will the rule be evaluated. */
  target: RuleDeploymentTarget
  /** ESP ID that owns the offline-capable part (if any). */
  offlineEspId: string | null
  /** True when at least one Hysteresis+Actuator pair on the same ESP exists. */
  hasOfflineCapablePair: boolean
  /** True when at least one server-only action / construct exists. */
  hasServerOnlyAction: boolean
  /** Reasons why parts of the rule require the server. */
  serverOnlyReasons: ServerOnlyReason[]
}

/**
 * Recursively flatten LogicCondition tree (handles nested CompoundCondition).
 * Returns a flat list AND the set of disqualifying reason codes.
 */
function flattenConditions(
  conditions: LogicCondition[],
  reasons: Set<ServerOnlyReason>,
): LogicCondition[] {
  const out: LogicCondition[] = []
  for (const cond of conditions) {
    if (cond.type === 'compound') {
      // Compound conditions are not allowed in offline_rules per server contract.
      reasons.add('compound_condition')
      out.push(...flattenConditions((cond as CompoundCondition).conditions, reasons))
    } else if (cond.type === 'diagnostics_status') {
      reasons.add('diagnostics_condition')
      out.push(cond)
    } else if (cond.type === 'sensor_diff') {
      reasons.add('sensor_diff_condition')
      out.push(cond)
    } else {
      out.push(cond)
    }
  }
  return out
}

/**
 * Pure helper: classify a single rule. Exported for unit testing.
 */
export function classifyRuleDeployment(rule: LogicRule | null): RuleDeploymentInfo {
  if (!rule) {
    return {
      target: 'server',
      offlineEspId: null,
      hasOfflineCapablePair: false,
      hasServerOnlyAction: false,
      serverOnlyReasons: ['no_hysteresis'],
    }
  }

  const reasons = new Set<ServerOnlyReason>()
  const flatConditions = flattenConditions(rule.conditions ?? [], reasons)

  // Find hysteresis conditions (offline-capable trigger).
  const hysteresisConditions = flatConditions.filter(
    (c): c is HysteresisCondition => c.type === 'hysteresis',
  )

  if (hysteresisConditions.length === 0) {
    reasons.add('no_hysteresis')
  }

  // Inspect actions.
  const actuatorActions: ActuatorAction[] = []
  let hasServerOnlyAction = false

  for (const action of rule.actions ?? []) {
    const a = action as LogicAction
    if (a.type === 'actuator' || a.type === 'actuator_command') {
      actuatorActions.push(a as ActuatorAction)
    } else if (a.type === 'notification') {
      reasons.add('notification_action')
      hasServerOnlyAction = true
    } else if (a.type === 'plugin' || a.type === 'autoops_trigger') {
      reasons.add('plugin_action')
      hasServerOnlyAction = true
    } else if (a.type === 'delay') {
      reasons.add('delay_action')
      hasServerOnlyAction = true
    } else if (a.type === 'run_diagnostic') {
      // Diagnostics action requires server.
      reasons.add('plugin_action')
      hasServerOnlyAction = true
    }
  }

  // Look for at least one Hysteresis+Actuator pair on the SAME ESP.
  let offlineEspId: string | null = null
  let hasOfflineCapablePair = false
  let hasCrossEspActuator = false

  if (hysteresisConditions.length > 0 && actuatorActions.length > 0) {
    for (const hyst of hysteresisConditions) {
      for (const act of actuatorActions) {
        if (hyst.esp_id && act.esp_id && hyst.esp_id === act.esp_id) {
          hasOfflineCapablePair = true
          offlineEspId = hyst.esp_id
          break
        }
      }
      if (hasOfflineCapablePair) break
    }

    // Detect cross-ESP actuator actions (relative to the offline-capable ESP).
    if (offlineEspId) {
      for (const act of actuatorActions) {
        if (act.esp_id && act.esp_id !== offlineEspId) {
          hasCrossEspActuator = true
          break
        }
      }
    } else if (hysteresisConditions[0]?.esp_id) {
      // Hysteresis exists but no matching actuator → all actuators are cross-ESP.
      const triggerEsp = hysteresisConditions[0].esp_id
      for (const act of actuatorActions) {
        if (act.esp_id && act.esp_id !== triggerEsp) {
          hasCrossEspActuator = true
          break
        }
      }
    }
  }

  if (hasCrossEspActuator) {
    reasons.add('cross_esp_action')
    hasServerOnlyAction = true
  }

  // Resolve target.
  let target: RuleDeploymentTarget
  if (hasOfflineCapablePair && !hasServerOnlyAction) {
    target = 'esp'
  } else if (hasOfflineCapablePair && hasServerOnlyAction) {
    target = 'hybrid'
  } else {
    target = 'server'
  }

  return {
    target,
    offlineEspId,
    hasOfflineCapablePair,
    hasServerOnlyAction,
    serverOnlyReasons: Array.from(reasons),
  }
}

/**
 * Reactive composable wrapping {@link classifyRuleDeployment}.
 *
 * @param rule - Reactive ref to the rule (as edited in the canvas, or fetched).
 * @returns reactive deployment info derived from the rule.
 */
export function useRuleDeployment(
  rule: Ref<LogicRule | null>,
): {
  deployment: ComputedRef<RuleDeploymentInfo>
  target: ComputedRef<RuleDeploymentTarget>
  offlineEspId: ComputedRef<string | null>
  hasOfflineCapablePair: ComputedRef<boolean>
  hasServerOnlyAction: ComputedRef<boolean>
} {
  const deployment = computed<RuleDeploymentInfo>(() => classifyRuleDeployment(rule.value))

  return {
    deployment,
    target: computed(() => deployment.value.target),
    offlineEspId: computed(() => deployment.value.offlineEspId),
    hasOfflineCapablePair: computed(() => deployment.value.hasOfflineCapablePair),
    hasServerOnlyAction: computed(() => deployment.value.hasServerOnlyAction),
  }
}
