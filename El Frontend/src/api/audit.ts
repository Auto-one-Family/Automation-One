/**
 * Audit Log API Client
 * 
 * Provides access to audit log endpoints:
 * - List and filter audit logs
 * - Get statistics and error rates
 * - Manage retention policies
 * - Run manual cleanup
 */

import api from './index'

// =============================================================================
// Types
// =============================================================================

export interface AuditLog {
  id: string
  event_type: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  source_type: string
  source_id: string | null
  status: string
  message: string | null
  details: Record<string, unknown>
  error_code: string | null
  error_description: string | null
  ip_address: string | null
  correlation_id: string | null
  created_at: string
}

export interface AuditLogListResponse {
  data: AuditLog[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AuditLogFilters {
  event_type?: string
  severity?: string
  source_type?: string
  source_id?: string
  status?: string
  error_code?: string
  start_time?: string
  end_time?: string
  hours?: number
  page?: number
  page_size?: number
}

export interface RetentionConfig {
  enabled: boolean
  default_days: number
  severity_days: Record<string, number>
  max_records: number
  batch_size: number
  preserve_emergency_stops: boolean
  last_cleanup: string | null
}

export interface RetentionConfigUpdate {
  enabled?: boolean
  default_days?: number
  severity_days?: Record<string, number>
  max_records?: number
  batch_size?: number
  preserve_emergency_stops?: boolean
}

export interface CleanupResult {
  deleted_count: number
  deleted_by_severity: Record<string, number>
  duration_ms: number
  dry_run: boolean
  errors: string[]
}

export interface AuditStatistics {
  total_count: number
  count_by_severity: Record<string, number>
  count_by_event_type: Record<string, number>
  oldest_entry: string | null
  newest_entry: string | null
  storage_estimate_mb: number
  pending_cleanup_count: number
  pending_cleanup_by_severity: Record<string, number>
  retention_config: RetentionConfig
}

export interface ErrorRate {
  period_hours: number
  total_events: number
  error_events: number
  error_rate_percent: number
}

export interface EventTypeInfo {
  value: string
  description: string
  category: string
}

export interface SeverityInfo {
  value: string
  description: string
  color: string
}

// =============================================================================
// API Functions
// =============================================================================

export const auditApi = {
  /**
   * List audit logs with filters
   */
  async list(filters: AuditLogFilters = {}): Promise<AuditLogListResponse> {
    const params = new URLSearchParams()
    
    if (filters.event_type) params.append('event_type', filters.event_type)
    if (filters.severity) params.append('severity', filters.severity)
    if (filters.source_type) params.append('source_type', filters.source_type)
    if (filters.source_id) params.append('source_id', filters.source_id)
    if (filters.status) params.append('status', filters.status)
    if (filters.error_code) params.append('error_code', filters.error_code)
    if (filters.start_time) params.append('start_time', filters.start_time)
    if (filters.end_time) params.append('end_time', filters.end_time)
    if (filters.hours) params.append('hours', filters.hours.toString())
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.page_size) params.append('page_size', filters.page_size.toString())
    
    const response = await api.get<AuditLogListResponse>(
      `/audit?${params.toString()}`
    )
    return response.data
  },

  /**
   * Get recent errors
   */
  async getErrors(hours: number = 24, limit: number = 100): Promise<AuditLog[]> {
    const response = await api.get<AuditLog[]>(
      `/audit/errors?hours=${hours}&limit=${limit}`
    )
    return response.data
  },

  /**
   * Get config history for ESP device
   */
  async getEspConfigHistory(espId: string, limit: number = 50): Promise<AuditLog[]> {
    const response = await api.get<AuditLog[]>(
      `/audit/esp/${espId}/config-history?limit=${limit}`
    )
    return response.data
  },

  /**
   * Get audit statistics
   */
  async getStatistics(): Promise<AuditStatistics> {
    const response = await api.get<AuditStatistics>('/audit/statistics')
    return response.data
  },

  /**
   * Get error rate for period
   */
  async getErrorRate(hours: number = 24): Promise<ErrorRate> {
    const response = await api.get<ErrorRate>(`/audit/error-rate?hours=${hours}`)
    return response.data
  },

  /**
   * Get retention config
   */
  async getRetentionConfig(): Promise<RetentionConfig> {
    const response = await api.get<RetentionConfig>('/audit/retention/config')
    return response.data
  },

  /**
   * Update retention config
   */
  async updateRetentionConfig(config: RetentionConfigUpdate): Promise<RetentionConfig> {
    const response = await api.put<RetentionConfig>('/audit/retention/config', config)
    return response.data
  },

  /**
   * Run retention cleanup
   */
  async runCleanup(dryRun: boolean = false): Promise<CleanupResult> {
    const response = await api.post<CleanupResult>(
      `/audit/retention/cleanup?dry_run=${dryRun}`
    )
    return response.data
  },

  /**
   * Get available event types
   */
  async getEventTypes(): Promise<EventTypeInfo[]> {
    const response = await api.get<EventTypeInfo[]>('/audit/event-types')
    return response.data
  },

  /**
   * Get available severities
   */
  async getSeverities(): Promise<SeverityInfo[]> {
    const response = await api.get<SeverityInfo[]>('/audit/severities')
    return response.data
  },

  /**
   * Get available source types
   */
  async getSourceTypes(): Promise<string[]> {
    const response = await api.get<string[]>('/audit/source-types')
    return response.data
  },
}

export default auditApi




