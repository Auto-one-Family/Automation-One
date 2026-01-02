/**
 * Logic Store
 *
 * Manages Cross-ESP automation rules and provides connection data
 * for visualization in ConnectionLines component.
 *
 * @see El Servador/god_kaiser_server/src/services/logic_engine.py
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logicApi } from '@/api/logic'
import { extractConnections } from '@/types/logic'
import type { LogicRule, LogicConnection } from '@/types/logic'
import { websocketService, type WebSocketMessage } from '@/services/websocket'

/**
 * Logic Execution Event from WebSocket.
 * Matches server broadcast: logic_engine.py broadcast_logic_execution()
 */
interface LogicExecutionEvent {
  rule_id: string
  rule_name: string
  trigger: {
    esp_id: string
    gpio: number
    sensor_type: string
    value: number
  }
  action: {
    esp_id: string
    gpio: number
    command: string
  }
  success: boolean
  timestamp: number
}

/**
 * Extract error message from Axios error response.
 */
function extractErrorMessage(err: unknown, fallback: string): string {
  const axiosError = err as {
    response?: { data?: { detail?: string | Array<{ msg?: string; loc?: string[] }> } }
  }
  const detail = axiosError.response?.data?.detail

  if (!detail) return fallback

  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = d.loc?.slice(1).join('.') || 'unknown'
        return `${field}: ${d.msg || 'validation error'}`
      })
      .join('; ')
  }

  return detail
}

export const useLogicStore = defineStore('logic', () => {
  // =============================================================================
  // State
  // =============================================================================
  const rules = ref<LogicRule[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /** Currently active rule executions (for visual feedback) */
  const activeExecutions = ref<Map<string, number>>(new Map())

  /** Recent execution history from WebSocket */
  const recentExecutions = ref<LogicExecutionEvent[]>([])

  /** WebSocket subscription ID */
  let wsSubscriptionId: string | null = null

  // =============================================================================
  // Getters
  // =============================================================================

  /** All connections extracted from rules (for visualization) */
  const connections = computed<LogicConnection[]>(() => {
    return rules.value.flatMap((rule) => extractConnections(rule))
  })

  /** Only cross-ESP connections (for dashboard overlay) */
  const crossEspConnections = computed<LogicConnection[]>(() => {
    return connections.value.filter((conn) => conn.isCrossEsp)
  })

  /** Only enabled rules */
  const enabledRules = computed(() => {
    return rules.value.filter((rule) => rule.enabled)
  })

  /** Rule count */
  const ruleCount = computed(() => rules.value.length)

  /** Enabled rule count */
  const enabledCount = computed(() => enabledRules.value.length)

  // =============================================================================
  // Actions
  // =============================================================================

  /**
   * Fetch all rules from server
   */
  async function fetchRules(params?: {
    enabled?: boolean
    page?: number
    page_size?: number
  }): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await logicApi.getRules(params)
      rules.value = response.items || []
      console.debug(`[Logic Store] Fetched ${rules.value.length} rules`)
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Laden der Logic Rules')
      console.error('[Logic Store] fetchRules error:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch a single rule by ID
   */
  async function fetchRule(ruleId: string): Promise<LogicRule | null> {
    isLoading.value = true
    error.value = null

    try {
      const rule = await logicApi.getRule(ruleId)
      // Update in list if exists, otherwise add
      const index = rules.value.findIndex((r) => r.id === ruleId)
      if (index !== -1) {
        rules.value[index] = rule
      } else {
        rules.value.push(rule)
      }
      return rule
    } catch (err) {
      error.value = extractErrorMessage(err, `Fehler beim Laden der Regel ${ruleId}`)
      console.error('[Logic Store] fetchRule error:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Toggle rule enabled/disabled
   */
  async function toggleRule(ruleId: string): Promise<boolean> {
    error.value = null

    try {
      const response = await logicApi.toggleRule(ruleId)
      // Update local state
      const rule = rules.value.find((r) => r.id === ruleId)
      if (rule) {
        rule.enabled = response.enabled
      }
      console.info(`[Logic Store] Rule ${ruleId} toggled: enabled=${response.enabled}`)
      return response.enabled
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Umschalten der Regel')
      console.error('[Logic Store] toggleRule error:', err)
      throw err
    }
  }

  /**
   * Test rule evaluation without executing actions
   */
  async function testRule(ruleId: string): Promise<boolean> {
    error.value = null

    try {
      const response = await logicApi.testRule(ruleId)
      console.info(
        `[Logic Store] Rule ${ruleId} test: conditions=${response.conditions_result}`
      )
      return response.conditions_result
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Testen der Regel')
      console.error('[Logic Store] testRule error:', err)
      throw err
    }
  }

  /**
   * Get connections for a specific ESP (either as source or target)
   */
  function getConnectionsForEsp(espId: string): LogicConnection[] {
    return connections.value.filter(
      (conn) => conn.sourceEspId === espId || conn.targetEspId === espId
    )
  }

  /**
   * Get connections where ESP is the source (sensor triggers action)
   */
  function getOutgoingConnections(espId: string): LogicConnection[] {
    return connections.value.filter((conn) => conn.sourceEspId === espId)
  }

  /**
   * Get connections where ESP is the target (receives action)
   */
  function getIncomingConnections(espId: string): LogicConnection[] {
    return connections.value.filter((conn) => conn.targetEspId === espId)
  }

  /**
   * Get rule by ID
   */
  function getRuleById(ruleId: string): LogicRule | undefined {
    return rules.value.find((r) => r.id === ruleId)
  }

  /**
   * Clear error state
   */
  function clearError(): void {
    error.value = null
  }

  // =============================================================================
  // WebSocket Integration
  // =============================================================================

  /**
   * Handle incoming logic_execution WebSocket events.
   * Updates activeExecutions for visual feedback.
   */
  function handleLogicExecutionEvent(message: WebSocketMessage): void {
    if (message.type !== 'logic_execution') return

    const event = message.data as unknown as LogicExecutionEvent
    if (!event.rule_id) return

    console.debug(`[Logic Store] Logic execution: ${event.rule_name} (${event.success ? 'success' : 'failed'})`)

    // Add to recent executions (keep last 20)
    recentExecutions.value.unshift(event)
    if (recentExecutions.value.length > 20) {
      recentExecutions.value.pop()
    }

    // Mark rule as active (for visual feedback)
    const ruleId = event.rule_id
    activeExecutions.value.set(ruleId, Date.now())

    // Clear active state after 2 seconds
    setTimeout(() => {
      activeExecutions.value.delete(ruleId)
    }, 2000)

    // Update rule's last_triggered if we have the rule
    const rule = rules.value.find((r) => r.id === ruleId)
    if (rule) {
      rule.last_triggered = new Date(event.timestamp * 1000).toISOString()
    }
  }

  /**
   * Subscribe to WebSocket for logic execution events.
   */
  function subscribeToWebSocket(): void {
    if (wsSubscriptionId) return // Already subscribed

    wsSubscriptionId = websocketService.subscribe(
      { types: ['logic_execution'] },
      handleLogicExecutionEvent
    )
    console.debug('[Logic Store] Subscribed to WebSocket for logic_execution events')
  }

  /**
   * Unsubscribe from WebSocket.
   */
  function unsubscribeFromWebSocket(): void {
    if (wsSubscriptionId) {
      websocketService.unsubscribe(wsSubscriptionId)
      wsSubscriptionId = null
      console.debug('[Logic Store] Unsubscribed from WebSocket')
    }
  }

  /**
   * Check if a rule is currently active (just executed).
   */
  function isRuleActive(ruleId: string): boolean {
    return activeExecutions.value.has(ruleId)
  }

  /**
   * Check if a connection is currently active (rule just executed).
   */
  function isConnectionActive(connection: LogicConnection): boolean {
    return activeExecutions.value.has(connection.ruleId)
  }

  // =============================================================================
  // Return
  // =============================================================================
  return {
    // State
    rules,
    isLoading,
    error,
    activeExecutions,
    recentExecutions,

    // Getters
    connections,
    crossEspConnections,
    enabledRules,
    ruleCount,
    enabledCount,

    // Actions
    fetchRules,
    fetchRule,
    toggleRule,
    testRule,
    getConnectionsForEsp,
    getOutgoingConnections,
    getIncomingConnections,
    getRuleById,
    clearError,

    // WebSocket
    subscribeToWebSocket,
    unsubscribeFromWebSocket,
    isRuleActive,
    isConnectionActive,
  }
})
