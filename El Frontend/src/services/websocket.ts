/**
 * WebSocket Service (Singleton)
 * 
 * Manages WebSocket connection to backend for real-time updates.
 * Consistent with backend WebSocket implementation.
 * 
 * Endpoint: ws://localhost:8000/ws/realtime/{client_id}
 * Rate Limiting: 10 messages per second
 */

import { useAuthStore } from '@/stores/auth'
import type { MessageType } from '@/types'

// =============================================================================
// Types
// =============================================================================

export interface WebSocketMessage {
  type: MessageType | string
  timestamp: number
  data: Record<string, unknown>
}

export interface WebSocketFilters {
  types?: MessageType[]
  esp_ids?: string[]
  sensor_types?: string[]
  topicPattern?: string
}

export interface WebSocketSubscription {
  filters: WebSocketFilters
  callback: (message: WebSocketMessage) => void
}

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// =============================================================================
// WebSocket Service (Singleton)
// =============================================================================

class WebSocketService {
  private static instance: WebSocketService | null = null
  private ws: WebSocket | null = null
  private clientId: string = ''
  private status: WebSocketStatus = 'disconnected'
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectDelay: number = 3000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private subscriptions: Map<string, WebSocketSubscription> = new Map()
  private messageQueue: WebSocketMessage[] = []
  private rateLimitWarning: boolean = false
  private messageCount: number = 0
  private rateLimitWindowStart: number = Date.now()
  private listeners: Map<string, Set<(message: WebSocketMessage) => void>> = new Map()

  private constructor() {
    // Generate client ID (UUID-like)
    this.clientId = this.generateClientId()
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService()
    }
    return WebSocketService.instance
  }

  /**
   * Generate a client ID (UUID-like format)
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get WebSocket URL
   */
  private getWebSocketUrl(): string {
    const authStore = useAuthStore()
    const token = authStore.accessToken
    
    if (!token) {
      throw new Error('No access token available')
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.VITE_API_BASE_URL?.replace(/^https?:\/\//, '') || window.location.host
    
    // Backend endpoint: /ws/realtime/{client_id}
    return `${protocol}//${host}/ws/realtime/${this.clientId}?token=${encodeURIComponent(token)}`
  }

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('[WebSocket] Already connected or connecting')
      return
    }

    this.status = 'connecting'
    this.reconnectAttempts = 0

    try {
      const url = this.getWebSocketUrl()
      console.log('[WebSocket] Connecting to:', url)
      
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected')
        this.status = 'connected'
        this.reconnectAttempts = 0
        this.rateLimitWarning = false
        
        // Send existing subscriptions
        this.resubscribeAll()
        
        // Process queued messages
        this.processMessageQueue()
      }

      this.ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason)
        this.status = 'disconnected'
        this.ws = null
        
        // Attempt reconnect if not a normal closure
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event)
        this.status = 'error'
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }
    } catch (error) {
      console.error('[WebSocket] Connection error:', error)
      this.status = 'error'
      throw error
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.status = 'disconnected'
    this.reconnectAttempts = 0
  }

  /**
   * Schedule a reconnect attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectAttempts++
    console.log(`[WebSocket] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data)
      
      // Rate limiting check (10 msg/sec)
      this.checkRateLimit()
      
      // Route message to subscribers
      this.routeMessage(message)
      
      // Notify type-specific listeners
      const typeListeners = this.listeners.get(message.type)
      if (typeListeners) {
        typeListeners.forEach(callback => callback(message))
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error)
    }
  }

  /**
   * Check rate limiting (10 messages per second)
   */
  private checkRateLimit(): void {
    const now = Date.now()
    const windowMs = 1000 // 1 second
    
    // Reset window if expired
    if (now - this.rateLimitWindowStart > windowMs) {
      this.messageCount = 0
      this.rateLimitWindowStart = now
    }
    
    this.messageCount++
    
    if (this.messageCount > 10 && !this.rateLimitWarning) {
      console.warn('[WebSocket] Rate limit warning: > 10 messages/second')
      this.rateLimitWarning = true
    }
  }

  /**
   * Route message to matching subscriptions
   */
  private routeMessage(message: WebSocketMessage): void {
    for (const [id, subscription] of this.subscriptions.entries()) {
      if (this.matchesFilters(message, subscription.filters)) {
        subscription.callback(message)
      }
    }
  }

  /**
   * Check if message matches filters
   */
  private matchesFilters(message: WebSocketMessage, filters: WebSocketFilters): boolean {
    // Type filter
    if (filters.types && filters.types.length > 0) {
      if (!filters.types.includes(message.type as MessageType)) {
        return false
      }
    }
    
    // ESP ID filter
    if (filters.esp_ids && filters.esp_ids.length > 0) {
      const espId = message.data.esp_id || message.data.device_id
      if (!espId || !filters.esp_ids.includes(espId as string)) {
        return false
      }
    }
    
    // Sensor type filter
    if (filters.sensor_types && filters.sensor_types.length > 0) {
      const sensorType = message.data.sensor_type
      if (!sensorType || !filters.sensor_types.includes(sensorType as string)) {
        return false
      }
    }
    
    // Topic pattern filter (if applicable)
    if (filters.topicPattern) {
      const topic = message.data.topic as string
      if (!topic || !topic.match(filters.topicPattern)) {
        return false
      }
    }
    
    return true
  }

  /**
   * Subscribe to messages matching filters
   */
  subscribe(filters: WebSocketFilters, callback: (message: WebSocketMessage) => void): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    this.subscriptions.set(subscriptionId, { filters, callback })
    
    // Send subscription to server if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription(filters)
    }
    
    return subscriptionId
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId)
    
    // Send unsubscribe to server if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe()
    }
  }

  /**
   * Subscribe to specific message type
   */
  on(type: MessageType | string, callback: (message: WebSocketMessage) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    
    this.listeners.get(type)!.add(callback)
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(type)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.listeners.delete(type)
        }
      }
    }
  }

  /**
   * Send subscription message to server
   */
  private sendSubscription(filters: WebSocketFilters): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    
    try {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        filters: filters,
      }))
    } catch (error) {
      console.error('[WebSocket] Failed to send subscription:', error)
    }
  }

  /**
   * Send unsubscribe message to server
   */
  private sendUnsubscribe(filters?: WebSocketFilters): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    
    try {
      this.ws.send(JSON.stringify({
        action: 'unsubscribe',
        filters: filters || null,
      }))
    } catch (error) {
      console.error('[WebSocket] Failed to send unsubscribe:', error)
    }
  }

  /**
   * Resubscribe all active subscriptions
   */
  private resubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      this.sendSubscription(subscription.filters)
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      if (message) {
        this.routeMessage(message)
      }
    }
  }

  /**
   * Get connection status
   */
  getStatus(): WebSocketStatus {
    return this.status
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }
}

// Export singleton instance
export const websocketService = WebSocketService.getInstance()

