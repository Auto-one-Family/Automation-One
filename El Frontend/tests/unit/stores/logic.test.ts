/**
 * Logic Store Unit Tests
 *
 * Tests for Logic Store state management, API integration,
 * connection extraction, and WebSocket event handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// MOCK WEBSOCKET SERVICE
// =============================================================================

// Mock functions must be created inside factory to avoid hoisting issues
vi.mock('@/services/websocket', () => {
  const mockSubscribe = vi.fn().mockReturnValue('sub-logic-123')
  const mockUnsubscribe = vi.fn()

  return {
    websocketService: {
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
    },
    WebSocketMessage: {},
  }
})

// =============================================================================
// MOCK LOGGER
// =============================================================================

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Import after mocks are set up
import { setActivePinia, createPinia } from 'pinia'
import { useLogicStore } from '@/stores/logic'
import { server } from '../../mocks/server'
import { http, HttpResponse } from 'msw'
import { mockLogicRule } from '../../mocks/handlers'
import { websocketService } from '@/services/websocket'

// =============================================================================
// INITIAL STATE
// =============================================================================

describe('Logic Store - Initial State', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has empty rules array on initialization', () => {
    const store = useLogicStore()
    expect(store.rules).toEqual([])
  })

  it('has isLoading false initially', () => {
    const store = useLogicStore()
    expect(store.isLoading).toBe(false)
  })

  it('has null error initially', () => {
    const store = useLogicStore()
    expect(store.error).toBeNull()
  })

  it('has empty activeExecutions map initially', () => {
    const store = useLogicStore()
    expect(store.activeExecutions.size).toBe(0)
  })

  it('has empty recentExecutions array initially', () => {
    const store = useLogicStore()
    expect(store.recentExecutions).toEqual([])
  })
})

// =============================================================================
// COMPUTED GETTERS
// =============================================================================

describe('Logic Store - Computed Getters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('connections', () => {
    it('returns empty array when no rules', () => {
      const store = useLogicStore()
      expect(store.connections).toEqual([])
    })

    it('extracts connections from rules', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      expect(store.connections.length).toBeGreaterThan(0)
      const conn = store.connections[0]
      expect(conn).toHaveProperty('ruleId')
      expect(conn).toHaveProperty('sourceEspId')
      expect(conn).toHaveProperty('targetEspId')
    })

    it('creates connection with correct data from mockLogicRule', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const conn = store.connections[0]
      expect(conn.ruleId).toBe('rule-001')
      expect(conn.ruleName).toBe('Temperature Fan Control')
      expect(conn.sourceEspId).toBe('ESP_TEST_001')
      expect(conn.sourceGpio).toBe(4)
      expect(conn.sourceSensorType).toBe('ds18b20')
      expect(conn.targetEspId).toBe('ESP_TEST_002')
      expect(conn.targetGpio).toBe(16)
      expect(conn.targetCommand).toBe('ON')
      expect(conn.enabled).toBe(true)
    })
  })

  describe('crossEspConnections', () => {
    it('returns empty array when no rules', () => {
      const store = useLogicStore()
      expect(store.crossEspConnections).toEqual([])
    })

    it('filters cross-ESP connections', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      // mockLogicRule is cross-ESP (ESP_TEST_001 → ESP_TEST_002)
      expect(store.crossEspConnections.length).toBe(1)
      const conn = store.crossEspConnections[0]
      expect(conn.isCrossEsp).toBe(true)
      expect(conn.sourceEspId).not.toBe(conn.targetEspId)
    })

    it('excludes same-ESP connections', async () => {
      const store = useLogicStore()

      // Add same-ESP rule
      store.rules.push({
        id: 'rule-002',
        name: 'Same ESP Rule',
        enabled: true,
        conditions: [
          {
            type: 'sensor_threshold',
            esp_id: 'ESP_SAME',
            gpio: 4,
            sensor_type: 'ds18b20',
            operator: '>',
            value: 25,
          },
        ],
        logic_operator: 'AND',
        actions: [
          {
            type: 'actuator_command',
            esp_id: 'ESP_SAME',
            gpio: 16,
            command: 'ON',
          },
        ],
        priority: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const crossEspConns = store.crossEspConnections
      const sameEspConn = store.connections.find((c) => c.sourceEspId === 'ESP_SAME')

      expect(sameEspConn).toBeDefined()
      expect(sameEspConn?.isCrossEsp).toBe(false)
      expect(crossEspConns.some((c) => c.sourceEspId === 'ESP_SAME')).toBe(false)
    })
  })

  describe('enabledRules', () => {
    it('returns only enabled rules', () => {
      const store = useLogicStore()

      store.rules = [
        { ...mockLogicRule, id: 'rule-1', enabled: true },
        { ...mockLogicRule, id: 'rule-2', enabled: false },
        { ...mockLogicRule, id: 'rule-3', enabled: true },
      ]

      expect(store.enabledRules.length).toBe(2)
      expect(store.enabledRules.every((r) => r.enabled)).toBe(true)
    })

    it('returns empty array when all rules disabled', () => {
      const store = useLogicStore()

      store.rules = [
        { ...mockLogicRule, id: 'rule-1', enabled: false },
        { ...mockLogicRule, id: 'rule-2', enabled: false },
      ]

      expect(store.enabledRules).toEqual([])
    })
  })

  describe('ruleCount', () => {
    it('returns 0 when no rules', () => {
      const store = useLogicStore()
      expect(store.ruleCount).toBe(0)
    })

    it('returns correct count of all rules', () => {
      const store = useLogicStore()

      store.rules = [
        { ...mockLogicRule, id: 'rule-1' },
        { ...mockLogicRule, id: 'rule-2' },
        { ...mockLogicRule, id: 'rule-3' },
      ]

      expect(store.ruleCount).toBe(3)
    })
  })

  describe('enabledCount', () => {
    it('returns 0 when no enabled rules', () => {
      const store = useLogicStore()
      store.rules = [{ ...mockLogicRule, enabled: false }]

      expect(store.enabledCount).toBe(0)
    })

    it('returns correct count of enabled rules', () => {
      const store = useLogicStore()

      store.rules = [
        { ...mockLogicRule, id: 'rule-1', enabled: true },
        { ...mockLogicRule, id: 'rule-2', enabled: false },
        { ...mockLogicRule, id: 'rule-3', enabled: true },
      ]

      expect(store.enabledCount).toBe(2)
    })
  })
})

// =============================================================================
// FETCH RULES
// =============================================================================

describe('Logic Store - fetchRules', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads rules from API on success', async () => {
    const store = useLogicStore()
    await store.fetchRules()

    expect(store.rules.length).toBe(1)
    expect(store.rules[0].id).toBe('rule-001')
    expect(store.rules[0].name).toBe('Temperature Fan Control')
  })

  it('sets isLoading during fetch', async () => {
    const store = useLogicStore()

    const fetchPromise = store.fetchRules()
    expect(store.isLoading).toBe(true)

    await fetchPromise
    expect(store.isLoading).toBe(false)
  })

  it('clears error on successful fetch', async () => {
    const store = useLogicStore()
    store.error = 'Previous error'

    await store.fetchRules()

    expect(store.error).toBeNull()
  })

  it('sets error on API failure', async () => {
    server.use(
      http.get('/api/v1/logic/rules', () => {
        return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
      })
    )

    const store = useLogicStore()
    await store.fetchRules()

    expect(store.error).not.toBeNull()
    expect(store.error).toContain('Server error')
  })

  it('sets isLoading to false even on error', async () => {
    server.use(
      http.get('/api/v1/logic/rules', () => {
        return HttpResponse.json({ detail: 'Error' }, { status: 500 })
      })
    )

    const store = useLogicStore()
    await store.fetchRules()

    expect(store.isLoading).toBe(false)
  })

  it('passes query parameters to API', async () => {
    let capturedParams: URLSearchParams | null = null

    server.use(
      http.get('/api/v1/logic/rules', ({ request }) => {
        capturedParams = new URL(request.url).searchParams
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 50 })
      })
    )

    const store = useLogicStore()
    await store.fetchRules({ enabled: true, page: 2, page_size: 25 })

    expect(capturedParams?.get('enabled')).toBe('true')
    expect(capturedParams?.get('page')).toBe('2')
    expect(capturedParams?.get('page_size')).toBe('25')
  })
})

// =============================================================================
// FETCH RULE
// =============================================================================

describe('Logic Store - fetchRule', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('fetches single rule by ID', async () => {
    const store = useLogicStore()
    const rule = await store.fetchRule('rule-001')

    expect(rule).not.toBeNull()
    expect(rule?.id).toBe('rule-001')
  })

  it('adds new rule to list when not present', async () => {
    const store = useLogicStore()
    expect(store.rules.length).toBe(0)

    await store.fetchRule('rule-001')

    expect(store.rules.length).toBe(1)
    expect(store.rules[0].id).toBe('rule-001')
  })

  it('updates existing rule in list', async () => {
    const store = useLogicStore()

    // Add rule with old data
    store.rules = [{ ...mockLogicRule, name: 'Old Name' }]

    // Fetch updated rule
    await store.fetchRule('rule-001')

    expect(store.rules.length).toBe(1)
    expect(store.rules[0].name).toBe('Temperature Fan Control')
  })

  it('sets isLoading during fetch', async () => {
    const store = useLogicStore()

    const fetchPromise = store.fetchRule('rule-001')
    expect(store.isLoading).toBe(true)

    await fetchPromise
    expect(store.isLoading).toBe(false)
  })

  it('returns null and sets error on 404', async () => {
    server.use(
      http.get('/api/v1/logic/rules/:ruleId', () => {
        return HttpResponse.json({ detail: 'Rule not found' }, { status: 404 })
      })
    )

    const store = useLogicStore()
    const rule = await store.fetchRule('nonexistent')

    expect(rule).toBeNull()
    expect(store.error).not.toBeNull()
    expect(store.error).toContain('Rule not found')
  })

  it('clears error on successful fetch', async () => {
    const store = useLogicStore()
    store.error = 'Previous error'

    await store.fetchRule('rule-001')

    expect(store.error).toBeNull()
  })
})

// =============================================================================
// TOGGLE RULE
// =============================================================================

describe('Logic Store - toggleRule', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('toggles rule enabled state via API', async () => {
    const store = useLogicStore()
    store.rules = [{ ...mockLogicRule, enabled: true }]

    const newState = await store.toggleRule('rule-001')

    expect(newState).toBe(false)
  })

  it('updates local rule state after toggle', async () => {
    const store = useLogicStore()
    store.rules = [{ ...mockLogicRule, enabled: true }]

    await store.toggleRule('rule-001')

    expect(store.rules[0].enabled).toBe(false)
  })

  it('clears error on successful toggle', async () => {
    const store = useLogicStore()
    store.rules = [{ ...mockLogicRule }]
    store.error = 'Previous error'

    await store.toggleRule('rule-001')

    expect(store.error).toBeNull()
  })

  it('sets error and throws on API failure', async () => {
    server.use(
      http.post('/api/v1/logic/rules/:ruleId/toggle', () => {
        return HttpResponse.json({ detail: 'Toggle failed' }, { status: 500 })
      })
    )

    const store = useLogicStore()
    store.rules = [{ ...mockLogicRule }]

    await expect(store.toggleRule('rule-001')).rejects.toThrow()
    expect(store.error).not.toBeNull()
  })

  it('throws on 404 not found', async () => {
    server.use(
      http.post('/api/v1/logic/rules/:ruleId/toggle', () => {
        return HttpResponse.json({ detail: 'Rule not found' }, { status: 404 })
      })
    )

    const store = useLogicStore()

    await expect(store.toggleRule('nonexistent')).rejects.toThrow()
  })
})

// =============================================================================
// TEST RULE
// =============================================================================

describe('Logic Store - testRule', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns conditions_result from test API', async () => {
    const store = useLogicStore()
    const result = await store.testRule('rule-001')

    expect(typeof result).toBe('boolean')
  })

  it('clears error on successful test', async () => {
    const store = useLogicStore()
    store.error = 'Previous error'

    await store.testRule('rule-001')

    expect(store.error).toBeNull()
  })

  it('sets error and throws on API failure', async () => {
    server.use(
      http.post('/api/v1/logic/rules/:ruleId/test', () => {
        return HttpResponse.json({ detail: 'Test failed' }, { status: 500 })
      })
    )

    const store = useLogicStore()

    await expect(store.testRule('rule-001')).rejects.toThrow()
    expect(store.error).not.toBeNull()
  })

  it('throws on 404 not found', async () => {
    server.use(
      http.post('/api/v1/logic/rules/:ruleId/test', () => {
        return HttpResponse.json({ detail: 'Rule not found' }, { status: 404 })
      })
    )

    const store = useLogicStore()

    await expect(store.testRule('nonexistent')).rejects.toThrow()
  })
})

// =============================================================================
// CONNECTION HELPERS
// =============================================================================

describe('Logic Store - Connection Helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('getConnectionsForEsp', () => {
    it('returns empty array when no connections', () => {
      const store = useLogicStore()
      expect(store.getConnectionsForEsp('ESP_001')).toEqual([])
    })

    it('returns connections where ESP is source', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const connections = store.getConnectionsForEsp('ESP_TEST_001')
      expect(connections.length).toBeGreaterThan(0)
      expect(connections.some((c) => c.sourceEspId === 'ESP_TEST_001')).toBe(true)
    })

    it('returns connections where ESP is target', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const connections = store.getConnectionsForEsp('ESP_TEST_002')
      expect(connections.length).toBeGreaterThan(0)
      expect(connections.some((c) => c.targetEspId === 'ESP_TEST_002')).toBe(true)
    })

    it('returns connections for both source and target roles', async () => {
      const store = useLogicStore()

      // Rule where ESP is both source and target in different connections
      store.rules = [
        {
          ...mockLogicRule,
          id: 'rule-multi',
          conditions: [
            {
              type: 'sensor_threshold',
              esp_id: 'ESP_MULTI',
              gpio: 4,
              sensor_type: 'ds18b20',
              operator: '>',
              value: 25,
            },
          ],
          actions: [
            {
              type: 'actuator_command',
              esp_id: 'ESP_TARGET_1',
              gpio: 16,
              command: 'ON',
            },
          ],
        },
        {
          ...mockLogicRule,
          id: 'rule-multi-2',
          conditions: [
            {
              type: 'sensor_threshold',
              esp_id: 'ESP_OTHER',
              gpio: 5,
              sensor_type: 'sht31',
              operator: '<',
              value: 30,
            },
          ],
          actions: [
            {
              type: 'actuator_command',
              esp_id: 'ESP_MULTI',
              gpio: 17,
              command: 'OFF',
            },
          ],
        },
      ]

      const connections = store.getConnectionsForEsp('ESP_MULTI')
      expect(connections.length).toBe(2)
      expect(connections.some((c) => c.sourceEspId === 'ESP_MULTI')).toBe(true)
      expect(connections.some((c) => c.targetEspId === 'ESP_MULTI')).toBe(true)
    })
  })

  describe('getOutgoingConnections', () => {
    it('returns only connections where ESP is source', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const outgoing = store.getOutgoingConnections('ESP_TEST_001')
      expect(outgoing.length).toBeGreaterThan(0)
      expect(outgoing.every((c) => c.sourceEspId === 'ESP_TEST_001')).toBe(true)
    })

    it('excludes connections where ESP is target', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const outgoing = store.getOutgoingConnections('ESP_TEST_002')
      expect(outgoing.length).toBe(0)
    })
  })

  describe('getIncomingConnections', () => {
    it('returns only connections where ESP is target', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const incoming = store.getIncomingConnections('ESP_TEST_002')
      expect(incoming.length).toBeGreaterThan(0)
      expect(incoming.every((c) => c.targetEspId === 'ESP_TEST_002')).toBe(true)
    })

    it('excludes connections where ESP is source', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const incoming = store.getIncomingConnections('ESP_TEST_001')
      expect(incoming.length).toBe(0)
    })
  })

  describe('getRuleById', () => {
    it('returns undefined when rule not found', () => {
      const store = useLogicStore()
      expect(store.getRuleById('nonexistent')).toBeUndefined()
    })

    it('finds rule by ID', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const rule = store.getRuleById('rule-001')
      expect(rule).toBeDefined()
      expect(rule?.id).toBe('rule-001')
    })
  })

  describe('clearError', () => {
    it('resets error to null', () => {
      const store = useLogicStore()
      store.error = 'Some error'

      store.clearError()

      expect(store.error).toBeNull()
    })
  })
})

// =============================================================================
// WEBSOCKET INTEGRATION
// =============================================================================

describe('Logic Store - WebSocket Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('subscribeToWebSocket', () => {
    it('calls websocketService.subscribe with correct filter', () => {
      const store = useLogicStore()
      store.subscribeToWebSocket()

      expect(websocketService.subscribe).toHaveBeenCalledWith(
        { types: ['logic_execution'] },
        expect.any(Function)
      )
    })

    it('does not subscribe twice if already subscribed', () => {
      const store = useLogicStore()

      store.subscribeToWebSocket()
      store.subscribeToWebSocket()

      expect(websocketService.subscribe).toHaveBeenCalledTimes(1)
    })
  })

  describe('unsubscribeFromWebSocket', () => {
    it('calls websocketService.unsubscribe', () => {
      const store = useLogicStore()

      store.subscribeToWebSocket()
      store.unsubscribeFromWebSocket()

      expect(websocketService.unsubscribe).toHaveBeenCalledWith('sub-logic-123')
    })

    it('does nothing if not subscribed', () => {
      const store = useLogicStore()

      store.unsubscribeFromWebSocket()

      expect(websocketService.unsubscribe).not.toHaveBeenCalled()
    })

    it('allows re-subscription after unsubscribe', () => {
      const store = useLogicStore()

      store.subscribeToWebSocket()
      store.unsubscribeFromWebSocket()
      vi.clearAllMocks()

      store.subscribeToWebSocket()

      expect(websocketService.subscribe).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleLogicExecutionEvent', () => {
    it('adds event to recentExecutions', () => {
      const store = useLogicStore()
      store.subscribeToWebSocket()

      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]
      const mockEvent = {
        type: 'logic_execution',
        data: {
          rule_id: 'rule-001',
          rule_name: 'Test Rule',
          trigger: {
            esp_id: 'ESP_001',
            gpio: 4,
            sensor_type: 'ds18b20',
            value: 26.5,
          },
          action: {
            esp_id: 'ESP_002',
            gpio: 16,
            command: 'ON',
          },
          success: true,
          timestamp: Date.now() / 1000,
        },
        timestamp: Date.now(),
      }

      callback(mockEvent)

      expect(store.recentExecutions.length).toBe(1)
      expect(store.recentExecutions[0].rule_id).toBe('rule-001')
    })

    it('keeps only last 20 executions', () => {
      const store = useLogicStore()
      store.subscribeToWebSocket()

      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]

      // Add 25 events
      for (let i = 0; i < 25; i++) {
        callback({
          type: 'logic_execution',
          data: {
            rule_id: `rule-${i}`,
            rule_name: `Rule ${i}`,
            trigger: { esp_id: 'ESP', gpio: 4, sensor_type: 'ds18b20', value: 25 },
            action: { esp_id: 'ESP', gpio: 16, command: 'ON' },
            success: true,
            timestamp: Date.now() / 1000,
          },
          timestamp: Date.now(),
        })
      }

      expect(store.recentExecutions.length).toBe(20)
      expect(store.recentExecutions[0].rule_id).toBe('rule-24')
      expect(store.recentExecutions[19].rule_id).toBe('rule-5')
    })

    it('marks rule as active in activeExecutions map', () => {
      const store = useLogicStore()
      store.subscribeToWebSocket()

      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]

      callback({
        type: 'logic_execution',
        data: {
          rule_id: 'rule-001',
          rule_name: 'Test',
          trigger: { esp_id: 'ESP', gpio: 4, sensor_type: 'ds18b20', value: 25 },
          action: { esp_id: 'ESP', gpio: 16, command: 'ON' },
          success: true,
          timestamp: Date.now() / 1000,
        },
        timestamp: Date.now(),
      })

      expect(store.activeExecutions.has('rule-001')).toBe(true)
    })

    it('updates rule last_triggered if rule exists in store', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      store.subscribeToWebSocket()
      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]

      const eventTimestamp = Date.now() / 1000

      callback({
        type: 'logic_execution',
        data: {
          rule_id: 'rule-001',
          rule_name: 'Temperature Fan Control',
          trigger: { esp_id: 'ESP', gpio: 4, sensor_type: 'ds18b20', value: 26 },
          action: { esp_id: 'ESP', gpio: 16, command: 'ON' },
          success: true,
          timestamp: eventTimestamp,
        },
        timestamp: Date.now(),
      })

      const rule = store.getRuleById('rule-001')
      expect(rule?.last_triggered).toBeDefined()
    })

    it('ignores events without rule_id', () => {
      const store = useLogicStore()
      store.subscribeToWebSocket()

      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]

      callback({
        type: 'logic_execution',
        data: {
          rule_name: 'Test',
        },
        timestamp: Date.now(),
      })

      expect(store.recentExecutions.length).toBe(0)
    })

    it('ignores non-logic_execution events', () => {
      const store = useLogicStore()
      store.subscribeToWebSocket()

      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]

      callback({
        type: 'sensor_data',
        data: {},
        timestamp: Date.now(),
      })

      expect(store.recentExecutions.length).toBe(0)
    })
  })

  describe('isRuleActive', () => {
    it('returns false when rule not in activeExecutions', () => {
      const store = useLogicStore()
      expect(store.isRuleActive('rule-001')).toBe(false)
    })

    it('returns true when rule is active', () => {
      const store = useLogicStore()
      store.subscribeToWebSocket()

      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]

      callback({
        type: 'logic_execution',
        data: {
          rule_id: 'rule-active',
          rule_name: 'Active Rule',
          trigger: { esp_id: 'ESP', gpio: 4, sensor_type: 'ds18b20', value: 25 },
          action: { esp_id: 'ESP', gpio: 16, command: 'ON' },
          success: true,
          timestamp: Date.now() / 1000,
        },
        timestamp: Date.now(),
      })

      expect(store.isRuleActive('rule-active')).toBe(true)
    })
  })

  describe('isConnectionActive', () => {
    it('returns false when connection rule not active', async () => {
      const store = useLogicStore()
      await store.fetchRules()

      const connection = store.connections[0]
      expect(store.isConnectionActive(connection)).toBe(false)
    })

    it('returns true when connection rule is active', async () => {
      const store = useLogicStore()
      await store.fetchRules()
      store.subscribeToWebSocket()

      const callback = (websocketService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]

      callback({
        type: 'logic_execution',
        data: {
          rule_id: 'rule-001',
          rule_name: 'Test',
          trigger: { esp_id: 'ESP', gpio: 4, sensor_type: 'ds18b20', value: 25 },
          action: { esp_id: 'ESP', gpio: 16, command: 'ON' },
          success: true,
          timestamp: Date.now() / 1000,
        },
        timestamp: Date.now(),
      })

      const connection = store.connections[0]
      expect(store.isConnectionActive(connection)).toBe(true)
    })
  })
})
