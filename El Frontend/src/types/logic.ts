/**
 * Logic Types for Cross-ESP Automation Rules
 *
 * Server API: /v1/logic/rules
 * @see El Servador/god_kaiser_server/src/schemas/logic.py
 */

// =============================================================================
// Logic Rule Types
// =============================================================================

export interface LogicRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  conditions: LogicCondition[]
  logic_operator: 'AND' | 'OR'
  actions: LogicAction[]
  priority: number
  cooldown_seconds?: number
  max_executions_per_hour?: number
  last_triggered?: string
  created_at: string
  updated_at: string
}

// =============================================================================
// Condition Types
// =============================================================================

export type LogicCondition = SensorCondition | TimeCondition | CompoundCondition

export interface SensorCondition {
  type: 'sensor' | 'sensor_threshold'
  esp_id: string
  gpio: number
  sensor_type: string
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between'
  value: number
  min?: number // For 'between' operator
  max?: number // For 'between' operator
}

export interface TimeCondition {
  type: 'time_window' | 'time'
  start_hour: number
  end_hour: number
  days_of_week?: number[] // 0 = Sunday, 6 = Saturday
}

export interface CompoundCondition {
  type: 'compound'
  logic: 'AND' | 'OR'
  conditions: LogicCondition[]
}

// =============================================================================
// Action Types
// =============================================================================

export type LogicAction = ActuatorAction | NotificationAction | DelayAction

export interface ActuatorAction {
  type: 'actuator' | 'actuator_command'
  esp_id: string
  gpio: number
  command: 'ON' | 'OFF' | 'PWM' | 'TOGGLE'
  value?: number // For PWM (0.0-1.0)
  duration?: number // Auto-off after N seconds
}

export interface NotificationAction {
  type: 'notification'
  channel: 'email' | 'webhook' | 'websocket'
  target: string
  message_template: string
}

export interface DelayAction {
  type: 'delay'
  seconds: number
}

// =============================================================================
// Connection Types (for Visualization)
// =============================================================================

/**
 * Represents a visual connection between a sensor and actuator
 * Used by ConnectionLines component to draw logic rule visualizations
 */
export interface LogicConnection {
  ruleId: string
  ruleName: string
  ruleDescription: string // Human-readable: "Temp > 25°C → Lüfter AN"
  sourceEspId: string
  sourceGpio: number
  sourceSensorType: string
  targetEspId: string
  targetGpio: number
  targetCommand: string
  enabled: boolean
  priority: number
  isCrossEsp: boolean // true if source and target are on different ESPs
}

// =============================================================================
// API Response Types
// =============================================================================

export interface LogicRulesResponse {
  items: LogicRule[]
  total: number
  page: number
  page_size: number
}

export interface ExecutionHistoryResponse {
  items: ExecutionHistoryItem[]
  total: number
}

export interface ExecutionHistoryItem {
  id: string
  logic_rule_id: string
  trigger_data: Record<string, unknown>
  actions_executed: Record<string, unknown>[]
  success: boolean
  error_message?: string
  execution_time_ms: number
  timestamp: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate human-readable description from condition and action
 */
export function generateRuleDescription(
  condition: SensorCondition,
  action: ActuatorAction
): string {
  const opMap: Record<string, string> = {
    '>': '>',
    '>=': '≥',
    '<': '<',
    '<=': '≤',
    '==': '=',
    '!=': '≠',
    between: '↔',
  }
  const op = opMap[condition.operator] || condition.operator
  const cmd =
    action.command === 'ON'
      ? 'AN'
      : action.command === 'OFF'
        ? 'AUS'
        : action.command

  return `${condition.sensor_type} ${op} ${condition.value} → ${cmd}`
}

/**
 * Extract all LogicConnections from a LogicRule
 * Creates one connection per sensor-actuator pair in the rule
 */
export function extractConnections(rule: LogicRule): LogicConnection[] {
  const connections: LogicConnection[] = []

  // Get all sensor conditions (including nested in compound conditions)
  const sensorConditions = extractSensorConditions(rule.conditions)

  // Get all actuator actions
  const actuatorActions = rule.actions.filter(
    (a): a is ActuatorAction =>
      a.type === 'actuator' || a.type === 'actuator_command'
  )

  // Create connection for each sensor→actuator pair
  for (const condition of sensorConditions) {
    for (const action of actuatorActions) {
      connections.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleDescription: generateRuleDescription(condition, action),
        sourceEspId: condition.esp_id,
        sourceGpio: condition.gpio,
        sourceSensorType: condition.sensor_type,
        targetEspId: action.esp_id,
        targetGpio: action.gpio,
        targetCommand: action.command,
        enabled: rule.enabled,
        priority: rule.priority,
        isCrossEsp: condition.esp_id !== action.esp_id,
      })
    }
  }

  return connections
}

/**
 * Recursively extract all SensorConditions from condition tree
 */
function extractSensorConditions(conditions: LogicCondition[]): SensorCondition[] {
  const result: SensorCondition[] = []

  for (const cond of conditions) {
    if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
      result.push(cond as SensorCondition)
    } else if (cond.type === 'compound') {
      result.push(...extractSensorConditions((cond as CompoundCondition).conditions))
    }
  }

  return result
}
