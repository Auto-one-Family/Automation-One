/**
 * Log Viewer API
 * 
 * Provides methods to interact with server log endpoints.
 */

import api from './index'

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  logger: string
  message: string
  module?: string
  function?: string
  line?: number
  exception?: string
  extra?: Record<string, unknown>
}

export interface LogsResponse {
  success: boolean
  logs: LogEntry[]
  total_count: number
  page: number
  page_size: number
  has_more: boolean
}

export interface LogFile {
  name: string
  path: string
  size_bytes: number
  size_human: string
  modified: string
  is_current: boolean
}

export interface LogFilesResponse {
  success: boolean
  files: LogFile[]
  log_directory: string
}

export interface LogQueryParams {
  level?: LogLevel
  module?: string
  search?: string
  start_time?: string
  end_time?: string
  file?: string
  page?: number
  page_size?: number
}

// =============================================================================
// API Functions
// =============================================================================

export const logsApi = {
  /**
   * Get list of available log files
   */
  async listFiles(): Promise<LogFilesResponse> {
    const response = await api.get<LogFilesResponse>('/debug/logs/files')
    return response.data
  },

  /**
   * Query logs with filtering and pagination
   */
  async queryLogs(params: LogQueryParams = {}): Promise<LogsResponse> {
    const queryParams = new URLSearchParams()

    if (params.level) queryParams.set('level', params.level)
    if (params.module) queryParams.set('module', params.module)
    if (params.search) queryParams.set('search', params.search)
    if (params.start_time) queryParams.set('start_time', params.start_time)
    if (params.end_time) queryParams.set('end_time', params.end_time)
    if (params.file) queryParams.set('file', params.file)
    if (params.page) queryParams.set('page', params.page.toString())
    if (params.page_size) queryParams.set('page_size', params.page_size.toString())

    const query = queryParams.toString()
    const url = `/debug/logs${query ? '?' + query : ''}`

    const response = await api.get<LogsResponse>(url)
    return response.data
  }
}

export default logsApi













