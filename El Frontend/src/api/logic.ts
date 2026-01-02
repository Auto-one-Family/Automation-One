/**
 * Logic API Client
 *
 * Handles Cross-ESP automation rules.
 * Server endpoints: /v1/logic/rules, /v1/logic/execution_history
 *
 * @see El Servador/god_kaiser_server/src/api/v1/logic.py
 */

import api from './index'
import type {
  LogicRule,
  LogicRulesResponse,
  ExecutionHistoryResponse,
} from '@/types/logic'

// =============================================================================
// Request/Response Types
// =============================================================================

export interface LogicRuleCreate {
  name: string
  description?: string
  enabled?: boolean
  conditions: unknown[]
  logic_operator?: 'AND' | 'OR'
  actions: unknown[]
  priority?: number
  cooldown_seconds?: number
  max_executions_per_hour?: number
}

export interface LogicRuleUpdate {
  name?: string
  description?: string
  enabled?: boolean
  conditions?: unknown[]
  logic_operator?: 'AND' | 'OR'
  actions?: unknown[]
  priority?: number
  cooldown_seconds?: number
  max_executions_per_hour?: number
}

export interface ToggleResponse {
  success: boolean
  message: string
  rule_id: string
  enabled: boolean
}

export interface TestResponse {
  success: boolean
  message: string
  rule_id: string
  conditions_result: boolean
  evaluation_details: Record<string, unknown>[]
  would_execute_actions: boolean
}

// =============================================================================
// Logic API
// =============================================================================

export const logicApi = {
  /**
   * Get all logic rules
   */
  async getRules(params?: {
    enabled?: boolean
    page?: number
    page_size?: number
  }): Promise<LogicRulesResponse> {
    const response = await api.get<LogicRulesResponse>('/logic/rules', { params })
    return response.data
  },

  /**
   * Get a specific logic rule by ID
   */
  async getRule(ruleId: string): Promise<LogicRule> {
    const response = await api.get<LogicRule>(`/logic/rules/${ruleId}`)
    return response.data
  },

  /**
   * Create a new logic rule
   */
  async createRule(rule: LogicRuleCreate): Promise<LogicRule> {
    const response = await api.post<LogicRule>('/logic/rules', rule)
    return response.data
  },

  /**
   * Update an existing logic rule
   */
  async updateRule(ruleId: string, update: LogicRuleUpdate): Promise<LogicRule> {
    const response = await api.patch<LogicRule>(`/logic/rules/${ruleId}`, update)
    return response.data
  },

  /**
   * Delete a logic rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    await api.delete(`/logic/rules/${ruleId}`)
  },

  /**
   * Toggle rule enabled/disabled
   */
  async toggleRule(ruleId: string): Promise<ToggleResponse> {
    const response = await api.post<ToggleResponse>(`/logic/rules/${ruleId}/toggle`)
    return response.data
  },

  /**
   * Test rule evaluation without executing actions
   */
  async testRule(ruleId: string): Promise<TestResponse> {
    const response = await api.post<TestResponse>(`/logic/rules/${ruleId}/test`)
    return response.data
  },

  /**
   * Get execution history
   */
  async getExecutionHistory(params?: {
    rule_id?: string
    success?: boolean
    start_time?: string
    end_time?: string
    limit?: number
  }): Promise<ExecutionHistoryResponse> {
    const response = await api.get<ExecutionHistoryResponse>(
      '/logic/execution_history',
      { params }
    )
    return response.data
  },
}
