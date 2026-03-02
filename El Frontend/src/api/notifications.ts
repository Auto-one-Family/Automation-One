/**
 * Notifications API Client
 *
 * Handles notification inbox, preferences, and test-email endpoints.
 * Server endpoints: /v1/notifications/*
 *
 * @see El Servador/god_kaiser_server/src/api/v1/notifications.py
 */

import api from './index'

// =============================================================================
// Types
// =============================================================================

export type NotificationSeverity = 'critical' | 'warning' | 'info'
export type NotificationCategory =
  | 'connectivity'
  | 'data_quality'
  | 'infrastructure'
  | 'lifecycle'
  | 'maintenance'
  | 'security'
  | 'system'
export type NotificationSource =
  | 'logic_engine'
  | 'mqtt_handler'
  | 'grafana'
  | 'sensor_threshold'
  | 'device_event'
  | 'autoops'
  | 'manual'
  | 'system'

export interface NotificationDTO {
  id: string
  user_id: number
  channel: string
  severity: NotificationSeverity
  category: NotificationCategory
  title: string
  body: string | null
  metadata: Record<string, unknown>
  source: NotificationSource
  is_read: boolean
  is_archived: boolean
  digest_sent: boolean
  parent_notification_id: string | null
  created_at: string | null
  updated_at: string | null
  read_at: string | null
}

export interface NotificationListFilters {
  severity?: NotificationSeverity
  category?: NotificationCategory
  source?: NotificationSource
  is_read?: boolean
  page?: number
  page_size?: number
}

export interface PaginationMeta {
  page: number
  page_size: number
  total_items: number
  total_pages: number
}

export interface NotificationListResponse {
  success: boolean
  data: NotificationDTO[]
  pagination: PaginationMeta
}

export interface NotificationUnreadCountResponse {
  success: boolean
  unread_count: number
  highest_severity: NotificationSeverity | null
}

export interface NotificationSendRequest {
  title: string
  body?: string
  severity?: NotificationSeverity
  category?: NotificationCategory
  source?: NotificationSource
  channel?: string
  metadata?: Record<string, unknown>
}

export interface NotificationPreferencesDTO {
  user_id: number
  websocket_enabled: boolean
  email_enabled: boolean
  email_address: string | null
  email_severities: string[]
  quiet_hours_enabled: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  digest_interval_minutes: number
  browser_notifications: boolean
  created_at: string | null
  updated_at: string | null
}

export interface NotificationPreferencesUpdate {
  websocket_enabled?: boolean
  email_enabled?: boolean
  email_address?: string | null
  email_severities?: string[]
  quiet_hours_enabled?: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  digest_interval_minutes?: number
  browser_notifications?: boolean
}

export interface TestEmailRequest {
  email?: string | null
}

export interface TestEmailResponse {
  success: boolean
  message: string
  provider: string | null
  recipient: string | null
}

// =============================================================================
// Notifications API
// =============================================================================

export const notificationsApi = {
  /**
   * List notifications with optional filters
   */
  async list(filters?: NotificationListFilters): Promise<NotificationListResponse> {
    const response = await api.get<NotificationListResponse>('/notifications', {
      params: filters,
    })
    return response.data
  },

  /**
   * Get unread notification count (for badge)
   */
  async getUnreadCount(): Promise<NotificationUnreadCountResponse> {
    const response = await api.get<NotificationUnreadCountResponse>(
      '/notifications/unread-count',
    )
    return response.data
  },

  /**
   * Get a single notification by ID
   */
  async getById(id: string): Promise<NotificationDTO> {
    const response = await api.get<NotificationDTO>(`/notifications/${id}`)
    return response.data
  },

  /**
   * Mark a single notification as read
   */
  async markRead(id: string): Promise<NotificationDTO> {
    const response = await api.patch<NotificationDTO>(
      `/notifications/${id}/read`,
    )
    return response.data
  },

  /**
   * Mark all notifications as read
   */
  async markAllRead(): Promise<{ success: boolean; message: string }> {
    const response = await api.patch<{ success: boolean; message: string }>(
      '/notifications/read-all',
    )
    return response.data
  },

  /**
   * Admin: Send a notification manually
   */
  async send(request: NotificationSendRequest): Promise<NotificationDTO> {
    const response = await api.post<NotificationDTO>(
      '/notifications/send',
      request,
    )
    return response.data
  },

  /**
   * Get user notification preferences
   */
  async getPreferences(): Promise<NotificationPreferencesDTO> {
    const response = await api.get<NotificationPreferencesDTO>(
      '/notifications/preferences',
    )
    return response.data
  },

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    prefs: NotificationPreferencesUpdate,
  ): Promise<NotificationPreferencesDTO> {
    const response = await api.put<NotificationPreferencesDTO>(
      '/notifications/preferences',
      prefs,
    )
    return response.data
  },

  /**
   * Send a test email to verify configuration
   */
  async sendTestEmail(request?: TestEmailRequest): Promise<TestEmailResponse> {
    const response = await api.post<TestEmailResponse>(
      '/notifications/test-email',
      request ?? {},
    )
    return response.data
  },
}
