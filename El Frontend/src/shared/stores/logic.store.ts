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
import type { LogicRuleCreate, LogicRuleUpdate } from '@/api/logic'
import { extractConnections, extractEspIdsFromRule } from '@/types/logic'
import { createLogger } from '@/utils/logger'
import type { LogicRule, LogicConnection, ExecutionHistoryItem } from '@/types/logic'
import { websocketService, type WebSocketMessage } from '@/services/websocket'
import { useEspStore } from '@/stores/esp'

const logger = createLogger('LogicStore')

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

  /** Merged execution history (REST + WebSocket) */
  const executionHistory = ref<ExecutionHistoryItem[]>([])
  const isLoadingHistory = ref(false)
  const historyLoaded = ref(false)

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
      rules.value = response.data || []
      logger.debug('Fetched rules', { count: rules.value.length })
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Laden der Logic Rules')
      logger.error('fetchRules error', err)
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
      logger.error('fetchRule error', err)
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
      // Find current state to toggle
      const currentRule = rules.value.find((r) => r.id === ruleId)
      const newEnabled = currentRule ? !currentRule.enabled : true

      const response = await logicApi.toggleRule(ruleId, newEnabled)
      // Update local state
      const rule = rules.value.find((r) => r.id === ruleId)
      if (rule) {
        rule.enabled = response.enabled
      }
      logger.info('Rule toggled', { ruleId, enabled: response.enabled })
      return response.enabled
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Umschalten der Regel')
      logger.error('toggleRule error', err)
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
      logger.info('Rule test completed', { ruleId, wouldTrigger: response.would_trigger })
      return response.would_trigger
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Testen der Regel')
      logger.error('testRule error', err)
      throw err
    }
  }

  /**
   * Create a new rule and add it to the store
   */
  async function createRule(data: LogicRuleCreate): Promise<LogicRule> {
    error.value = null

    try {
      const created = await logicApi.createRule(data)
      rules.value.push(created)
      logger.info('Rule created', { id: created.id, name: created.name })
      return created
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Erstellen der Regel')
      logger.error('createRule error', err)
      throw err
    }
  }

  /**
   * Update an existing rule and sync the store
   */
  async function updateRule(ruleId: string, data: LogicRuleUpdate): Promise<LogicRule> {
    error.value = null

    try {
      const updated = await logicApi.updateRule(ruleId, data)
      const index = rules.value.findIndex((r) => r.id === ruleId)
      if (index !== -1) {
        rules.value[index] = updated
      }
      logger.info('Rule updated', { id: ruleId })
      return updated
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Aktualisieren der Regel')
      logger.error('updateRule error', err)
      throw err
    }
  }

  /**
   * Delete a rule and remove it from the store
   */
  async function deleteRule(ruleId: string): Promise<void> {
    error.value = null

    try {
      await logicApi.deleteRule(ruleId)
      rules.value = rules.value.filter((r) => r.id !== ruleId)
      logger.info('Rule deleted', { id: ruleId })
    } catch (err) {
      error.value = extractErrorMessage(err, 'Fehler beim Löschen der Regel')
      logger.error('deleteRule error', err)
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
   * Get all rules that reference at least one sensor or actuator in the given zone.
   * Zone mapping is derived from espStore.devices (device.zone_id).
   * Rules without any ESP in devices are excluded (unknown zone).
   */
  function getRulesForZone(zoneId: string): LogicRule[] {
    if (!zoneId) return []

    const espStore = useEspStore()
    const devices = espStore.devices

    return rules.value.filter((rule) => {
      const espIds = extractEspIdsFromRule(rule)
      if (espIds.size === 0) return false

      for (const espId of espIds) {
        const device = devices.find((d) => espStore.getDeviceId(d) === espId)
        if (device?.zone_id === zoneId) return true
      }
      return false
    }).sort((a, b) => {
      const prio = (a.priority ?? 0) - (b.priority ?? 0)
      return prio !== 0 ? prio : (a.name ?? '').localeCompare(b.name ?? '')
    })
  }

  /**
   * Get zone names for a rule (via referenced ESPs).
   * Used for L1 Monitor Zone-Badge — answers "Where?" per 5-second rule.
   */
  function getZonesForRule(rule: LogicRule): string[] {
    const espStore = useEspStore()
    const devices = espStore.devices
    const espIds = extractEspIdsFromRule(rule)
    const zoneNames = new Set<string>()

    for (const espId of espIds) {
      const device = devices.find((d) => espStore.getDeviceId(d) === espId)
      const name = device?.zone_name ?? device?.zone_id ?? null
      if (name) zoneNames.add(name)
    }

    return [...zoneNames].sort((a, b) => a.localeCompare(b))
  }

  /**
   * Clear error state
   */
  function clearError(): void {
    error.value = null
  }

  // =============================================================================
  // Execution History (REST + WebSocket merge)
  // =============================================================================

  /**
   * Load execution history from REST API and merge with WebSocket events.
   * Deduplicates by ID, sorts descending by triggered_at, limits to 50 entries.
   */
  async function loadExecutionHistory(ruleId?: string): Promise<void> {
    isLoadingHistory.value = true

    try {
      const params: { rule_id?: string; limit?: number } = { limit: 50 }
      if (ruleId) params.rule_id = ruleId

      const response = await logicApi.getExecutionHistory(params)
      const restEntries = response.entries || []

      // Merge with existing entries: REST entries as base, deduplicate by id
      const merged = new Map<string, ExecutionHistoryItem>()

      // Add REST entries first
      for (const entry of restEntries) {
        merged.set(entry.id, entry)
      }

      // Add existing entries (may include prior REST loads)
      for (const entry of executionHistory.value) {
        if (!merged.has(entry.id)) {
          merged.set(entry.id, entry)
        }
      }

      // Sort descending by triggered_at, limit to 50
      executionHistory.value = Array.from(merged.values())
        .sort((a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime())
        .slice(0, 50)

      historyLoaded.value = true
      logger.debug('Execution history loaded', { count: executionHistory.value.length })
    } catch (err) {
      logger.error('loadExecutionHistory error', err)
    } finally {
      isLoadingHistory.value = false
    }
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

    logger.debug('Logic execution', { ruleName: event.rule_name, success: event.success })

    // Add to recent executions (keep last 20)
    recentExecutions.value.unshift(event)
    if (recentExecutions.value.length > 20) {
      recentExecutions.value.pop()
    }

    // Also add to merged execution history if loaded
    if (historyLoaded.value) {
      const historyEntry: ExecutionHistoryItem = {
        id: `ws-${event.rule_id}-${event.timestamp}`,
        rule_id: event.rule_id,
        rule_name: event.rule_name,
        triggered_at: new Date(event.timestamp * 1000).toISOString(),
        trigger_reason: `${event.trigger.sensor_type} = ${event.trigger.value}`,
        actions_executed: [{ esp_id: event.action.esp_id, gpio: event.action.gpio, command: event.action.command }],
        success: event.success,
        execution_time_ms: 0,
      }
      executionHistory.value.unshift(historyEntry)
      if (executionHistory.value.length > 50) {
        executionHistory.value.pop()
      }
    }

    // Mark rule as active (for visual feedback)
    const ruleId = event.rule_id
    activeExecutions.value.set(ruleId, Date.now())

    // Clear active state after 2 seconds
    setTimeout(() => {
      activeExecutions.value.delete(ruleId)
    }, 2000)

    // Update rule's last_triggered and execution_count if we have the rule
    const rule = rules.value.find((r) => r.id === ruleId)
    if (rule) {
      rule.last_triggered = new Date(event.timestamp * 1000).toISOString()
      rule.execution_count = (rule.execution_count ?? 0) + 1
      rule.last_execution_success = event.success
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
    logger.debug('Subscribed to WebSocket for logic_execution events')
  }

  /**
   * Unsubscribe from WebSocket.
   */
  function unsubscribeFromWebSocket(): void {
    if (wsSubscriptionId) {
      websocketService.unsubscribe(wsSubscriptionId)
      wsSubscriptionId = null
      logger.debug('Unsubscribed from WebSocket')
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
  // UNDO/REDO — Command Pattern (Phase 2, Schritt 10)
  // =============================================================================

  interface RuleHistoryEntry {
    nodes: any[]
    edges: any[]
    timestamp: number
  }

  const history = ref<RuleHistoryEntry[]>([])
  const historyIndex = ref(-1)
  const MAX_HISTORY = 50

  /** Can undo? */
  const canUndo = computed(() => historyIndex.value > 0)

  /** Can redo? */
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  /**
   * Push a snapshot to history.
   * Called after every graph change in the rule editor.
   */
  function pushToHistory(nodes: any[], edges: any[]) {
    // Discard any "future" entries if we undid something and then changed
    history.value = history.value.slice(0, historyIndex.value + 1)

    history.value.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      timestamp: Date.now(),
    })

    // Trim to max size
    if (history.value.length > MAX_HISTORY) {
      history.value.shift()
    }

    historyIndex.value = history.value.length - 1
  }

  /**
   * Undo — returns the previous graph state.
   */
  function undo(): RuleHistoryEntry | null {
    if (!canUndo.value) return null
    historyIndex.value--
    return history.value[historyIndex.value]
  }

  /**
   * Redo — returns the next graph state.
   */
  function redo(): RuleHistoryEntry | null {
    if (!canRedo.value) return null
    historyIndex.value++
    return history.value[historyIndex.value]
  }

  /**
   * Clear history (e.g., when switching rules).
   */
  function clearHistory() {
    history.value = []
    historyIndex.value = -1
  }

  // =============================================================================
  // CONNECTION VALIDATION (Phase 2, Schritt 10)
  // =============================================================================

  /**
   * Validate whether a connection between two node types is allowed.
   *
   * Rules:
   * 1. Sensor → Condition: ALLOWED
   * 2. Sensor → Action: NOT ALLOWED (must go through condition)
   * 3. Condition → Condition: ALLOWED (AND/OR chaining)
   * 4. Condition → Action: ALLOWED
   * 5. Action → anything: NOT ALLOWED (action is terminal)
   * 6. No self-loops
   * 7. Time → Condition: ALLOWED
   * 8. Time → Action: ALLOWED
   */
  function isValidConnection(
    sourceNodeType: string | undefined,
    targetNodeType: string | undefined,
    sourceId: string,
    targetId: string
  ): { valid: boolean; reason?: string } {
    // No self-loops
    if (sourceId === targetId) {
      return { valid: false, reason: 'Selbst-Schleifen sind nicht erlaubt' }
    }

    // Action nodes cannot be sources (actuator, notification, delay have no outgoing connections)
    if (sourceNodeType === 'actuator' || sourceNodeType === 'notification') {
      return { valid: false, reason: 'Aktions-Knoten können keine Verbindung starten' }
    }

    // Sensor/Time → Actuator/Notification direct: NOT allowed (must go through logic node)
    if ((sourceNodeType === 'sensor' || sourceNodeType === 'time') && (targetNodeType === 'actuator' || targetNodeType === 'notification')) {
      return { valid: false, reason: 'Bedingung kann nicht direkt mit Aktion verbunden werden. Verwende einen Logik-Knoten (UND/ODER) dazwischen.' }
    }

    // Everything else is allowed
    return { valid: true }
  }

  /**
   * Get validation message for connection.
   */
  function getConnectionValidationMessage(
    sourceNodeType: string | undefined,
    targetNodeType: string | undefined,
    sourceId: string,
    targetId: string
  ): string {
    const result = isValidConnection(sourceNodeType, targetNodeType, sourceId, targetId)
    return result.reason || ''
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
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    testRule,
    getConnectionsForEsp,
    getOutgoingConnections,
    getIncomingConnections,
    getRuleById,
    getRulesForZone,
    getZonesForRule,
    clearError,

    // Execution History
    executionHistory,
    isLoadingHistory,
    historyLoaded,
    loadExecutionHistory,

    // WebSocket
    subscribeToWebSocket,
    unsubscribeFromWebSocket,
    isRuleActive,
    isConnectionActive,

    // Undo/Redo (Phase 2)
    history,
    historyIndex,
    canUndo,
    canRedo,
    pushToHistory,
    undo,
    redo,
    clearHistory,

    // Connection Validation (Phase 2)
    isValidConnection,
    getConnectionValidationMessage,
  }
})
