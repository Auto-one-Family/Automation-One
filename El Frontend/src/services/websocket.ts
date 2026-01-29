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
  private baseReconnectDelay: number = 1000  // Base delay for exponential backoff
  private maxReconnectDelay: number = 30000  // Max 30 seconds
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private subscriptions: Map<string, WebSocketSubscription> = new Map()
  private messageQueue: WebSocketMessage[] = []
  private rateLimitWarning: boolean = false
  private messageCount: number = 0
  private rateLimitWindowStart: number = Date.now()
  private listeners: Map<string, Set<(message: WebSocketMessage) => void>> = new Map()
  private visibilityHandler: (() => void) | null = null

  // NEW: Pending subscriptions queue for subscriptions during 'connecting' state
  private pendingSubscriptions: WebSocketFilters[] = []

  // NEW: Token expiration tracking
  private tokenExpiry: number | null = null

  // NEW: Connection success callbacks for notifying stores to refresh data
  private onConnectCallbacks: Set<() => void> = new Set()

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
    return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * Get WebSocket URL
   * Also extracts and stores token expiry for automatic refresh handling
   */
  private getWebSocketUrl(): string {
    const authStore = useAuthStore()
    const token = authStore.accessToken

    if (!token) {
      throw new Error('No access token available')
    }

    // Extract token expiry from JWT payload (for auto-refresh handling)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      this.tokenExpiry = payload.exp ? payload.exp * 1000 : null // Convert to ms
    } catch {
      this.tokenExpiry = null
    }

    // In development, use localhost:8000 directly for WebSocket
    // In production, use the same host as the page
    const isDev = import.meta.env.DEV
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = isDev ? 'localhost:8000' : window.location.host

    // Backend endpoint: /api/v1/ws/realtime/{client_id}
    return `${protocol}//${host}/api/v1/ws/realtime/${this.clientId}?token=${encodeURIComponent(token)}`
  }

  /**
   * Check if token is expired or about to expire (within 60 seconds)
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return false
    const bufferMs = 60000 // 60 second buffer
    return Date.now() >= this.tokenExpiry - bufferMs
  }

  /**
   * Refresh access token before reconnecting
   * Returns true if refresh was successful, false otherwise
   */
  private async refreshTokenIfNeeded(): Promise<boolean> {
    if (!this.isTokenExpired()) {
      return true // Token still valid
    }

    console.log('[WebSocket] Token expired/expiring, refreshing before reconnect...')
    const authStore = useAuthStore()

    try {
      await authStore.refreshTokens()
      console.log('[WebSocket] Token refreshed successfully')
      return true
    } catch (error) {
      console.error('[WebSocket] Token refresh failed:', error)
      return false
    }
  }

  /**
   * Connect to WebSocket
   *
   * Returns a Promise that resolves when the connection is actually open,
   * not just when the WebSocket object is created.
   */
  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('[WebSocket] Already connected or connecting')
      return
    }

    this.status = 'connecting'
    this.reconnectAttempts = 0

    return new Promise((resolve, reject) => {
      try {
        const url = this.getWebSocketUrl()
        console.log('[WebSocket] Connecting to:', url)

        this.ws = new WebSocket(url)

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected')
          this.status = 'connected'
          this.reconnectAttempts = 0
          this.rateLimitWarning = false

          // Enable visibility handling for tab switches
          this.setupVisibilityHandling()

          // Send existing subscriptions
          this.resubscribeAll()

          // Process pending subscriptions that were queued during 'connecting' state
          this.processPendingSubscriptions()

          // Process queued messages
          this.processMessageQueue()

          // Notify listeners that connection is established (for stores to refresh data)
          this.notifyConnectCallbacks()

          resolve()
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
          reject(new Error('WebSocket connection failed'))
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }
      } catch (error) {
        console.error('[WebSocket] Connection error:', error)
        this.status = 'error'
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    // Cleanup visibility handling
    this.cleanupVisibilityHandling()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    // Clear pending subscriptions
    this.pendingSubscriptions = []

    this.status = 'disconnected'
    this.reconnectAttempts = 0
  }

  /**
   * Schedule a reconnect attempt with exponential backoff
   * Delay doubles each attempt: 1s, 2s, 4s, 8s, 16s (max 30s)
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectAttempts++

    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    )
    // Add jitter (±10%) to prevent thundering herd
    const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1)
    const delay = Math.round(exponentialDelay + jitter)

    console.log(`[WebSocket] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`)

    this.reconnectTimer = setTimeout(async () => {
      // Refresh token before reconnecting if needed
      const tokenValid = await this.refreshTokenIfNeeded()
      if (!tokenValid) {
        console.error('[WebSocket] Cannot reconnect - token refresh failed')
        this.status = 'error'
        return
      }

      this.connect()
    }, delay)
  }

  /**
   * Setup Page Visibility API handling for Tab-Wechsel
   * Reconnects WebSocket when tab becomes visible again
   */
  private setupVisibilityHandling(): void {
    // Nur einmal registrieren
    if (this.visibilityHandler) return

    this.visibilityHandler = async () => {
      if (document.visibilityState === 'visible') {
        console.log('[WebSocket] Tab visible, checking connection...')

        // Check if already connected or connecting
        if (this.isConnected()) {
          console.debug('[WebSocket] Already connected')
          return
        }

        if (this.status === 'connecting') {
          console.debug('[WebSocket] Already connecting, waiting...')
          return
        }

        console.log('[WebSocket] Reconnecting after tab became visible')

        // Only reset attempts if significant time has passed (>30s)
        // This prevents rapid reconnect attempts on quick tab switches
        if (this.reconnectAttempts > 0) {
          // Keep some backoff if we recently failed
          this.reconnectAttempts = Math.max(0, this.reconnectAttempts - 2)
        }

        // Refresh token before reconnecting if needed
        const tokenValid = await this.refreshTokenIfNeeded()
        if (!tokenValid) {
          console.error('[WebSocket] Cannot reconnect - token refresh failed')
          this.status = 'error'
          return
        }

        this.connect()
      }
    }

    document.addEventListener('visibilitychange', this.visibilityHandler)
    console.log('[WebSocket] Visibility handling enabled')
  }

  /**
   * Cleanup Page Visibility API handler
   */
  private cleanupVisibilityHandling(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
      console.log('[WebSocket] Visibility handling disabled')
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data)

      // DEBUG: Log all incoming WebSocket messages
      console.log('[WebSocket] Received message:', message.type, message.data)

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
    for (const [, subscription] of this.subscriptions.entries()) {
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
   * If WebSocket is connecting, subscription is queued and sent after connection
   */
  subscribe(filters: WebSocketFilters, callback: (message: WebSocketMessage) => void): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    this.subscriptions.set(subscriptionId, { filters, callback })

    // Send subscription to server if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription(filters)
    } else if (this.status === 'connecting') {
      // Queue subscription for when connection is established
      console.debug('[WebSocket] Connection pending, queuing subscription:', filters.types)
      this.pendingSubscriptions.push(filters)
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
   * Process pending subscriptions that were queued during 'connecting' state
   */
  private processPendingSubscriptions(): void {
    if (this.pendingSubscriptions.length === 0) return

    console.log(`[WebSocket] Processing ${this.pendingSubscriptions.length} pending subscriptions`)

    while (this.pendingSubscriptions.length > 0) {
      const filters = this.pendingSubscriptions.shift()
      if (filters) {
        this.sendSubscription(filters)
      }
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    // Limit queue size to prevent memory issues
    const MAX_QUEUE_SIZE = 1000
    if (this.messageQueue.length > MAX_QUEUE_SIZE) {
      console.warn(`[WebSocket] Message queue exceeded ${MAX_QUEUE_SIZE}, dropping oldest messages`)
      this.messageQueue = this.messageQueue.slice(-MAX_QUEUE_SIZE)
    }

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

  /**
   * Register a callback to be called when WebSocket connects successfully.
   * Useful for stores to refresh data after connection is established.
   *
   * @param callback Function to call on connect
   * @returns Unsubscribe function
   */
  onConnect(callback: () => void): () => void {
    this.onConnectCallbacks.add(callback)
    return () => {
      this.onConnectCallbacks.delete(callback)
    }
  }

  /**
   * Notify all registered connect callbacks.
   * Called internally when WebSocket connection is established.
   */
  private notifyConnectCallbacks(): void {
    console.log(`[WebSocket] Notifying ${this.onConnectCallbacks.size} connect callbacks`)
    this.onConnectCallbacks.forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.error('[WebSocket] Error in connect callback:', error)
      }
    })
  }
}

// Export singleton instance
export const websocketService = WebSocketService.getInstance()

















