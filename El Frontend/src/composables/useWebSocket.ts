/**
 * WebSocket Composable
 * 
 * Vue composable for WebSocket real-time updates.
 * Uses the WebSocket service singleton for connection management.
 * Provides subscription system consistent with backend.
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { websocketService, type WebSocketMessage, type WebSocketFilters } from '@/services/websocket'
import type { MessageType } from '@/types'

// =============================================================================
// Types
// =============================================================================

export interface UseWebSocketOptions {
  /** Auto-connect on mount */
  autoConnect?: boolean
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean
  /** Initial subscription filters */
  filters?: WebSocketFilters
}

// =============================================================================
// Composable
// =============================================================================

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    autoConnect = true,
    autoReconnect = true,
    filters,
  } = options

  // Connection state
  const isConnected = ref(websocketService.isConnected())
  const isConnecting = ref(false)
  const connectionError = ref<string | null>(null)
  const reconnectAttempts = ref(0)

  // Subscription state
  const subscriptionId = ref<string | null>(null)
  const activeFilters = ref<WebSocketFilters | null>(filters || null)

  // Message state
  const lastMessage = ref<WebSocketMessage | null>(null)
  const messageCount = ref(0)
  const rateLimitWarning = ref(false)

  // Event handlers
  const messageHandlers = new Map<string, Set<(message: WebSocketMessage) => void>>()

  // Computed
  const connectionStatus = computed(() => {
    if (isConnecting.value) return 'connecting'
    if (isConnected.value) return 'connected'
    if (connectionError.value) return 'error'
    return 'disconnected'
  })

  // =============================================================================
  // Connection Management
  // =============================================================================

  /**
   * Connect to WebSocket
   */
  async function connect(): Promise<void> {
    if (isConnecting.value || isConnected.value) {
      return
    }

    isConnecting.value = true
    connectionError.value = null

    try {
      await websocketService.connect()
      isConnected.value = websocketService.isConnected()
      
      // Subscribe with filters if provided
      if (activeFilters.value) {
        subscribe(activeFilters.value)
      }
    } catch (error) {
      console.error('[useWebSocket] Connection error:', error)
      connectionError.value = error instanceof Error ? error.message : 'Connection failed'
      isConnected.value = false
    } finally {
      isConnecting.value = false
    }
  }

  /**
   * Disconnect from WebSocket
   */
  function disconnect(): void {
    if (subscriptionId.value) {
      websocketService.unsubscribe(subscriptionId.value)
      subscriptionId.value = null
    }
    
    websocketService.disconnect()
    isConnected.value = false
    isConnecting.value = false
  }

  // =============================================================================
  // Subscription Management
  // =============================================================================

  /**
   * Subscribe to messages matching filters
   */
  function subscribe(filters: WebSocketFilters, callback?: (message: WebSocketMessage) => void): string {
    // Unsubscribe existing subscription if any
    if (subscriptionId.value) {
      websocketService.unsubscribe(subscriptionId.value)
    }

    const handler = callback || ((message: WebSocketMessage) => {
      lastMessage.value = message
      messageCount.value++
      
      // Notify type-specific handlers
      const typeHandlers = messageHandlers.get(message.type)
      if (typeHandlers) {
        typeHandlers.forEach(h => h(message))
      }
    })

    subscriptionId.value = websocketService.subscribe(filters, handler)
    activeFilters.value = filters

    return subscriptionId.value
  }

  /**
   * Unsubscribe from messages
   */
  function unsubscribe(): void {
    if (subscriptionId.value) {
      websocketService.unsubscribe(subscriptionId.value)
      subscriptionId.value = null
      activeFilters.value = null
    }
  }

  /**
   * Subscribe to specific message type
   */
  function on(type: MessageType | string, callback: (message: WebSocketMessage) => void): () => void {
    if (!messageHandlers.has(type)) {
      messageHandlers.set(type, new Set())
    }
    
    messageHandlers.get(type)!.add(callback)
    
    // Also subscribe via service for type-based routing
    const unsubscribeService = websocketService.on(type, callback)
    
    // Return combined unsubscribe function
    return () => {
      const handlers = messageHandlers.get(type)
      if (handlers) {
        handlers.delete(callback)
        if (handlers.size === 0) {
          messageHandlers.delete(type)
        }
      }
      unsubscribeService()
    }
  }

  /**
   * Update subscription filters
   */
  function updateFilters(filters: WebSocketFilters): void {
    if (subscriptionId.value) {
      unsubscribe()
    }
    subscribe(filters)
  }

  // =============================================================================
  // Status Monitoring
  // =============================================================================

  /**
   * Watch connection status
   */
  function watchStatus(callback: (status: string) => void): () => void {
    return watch(connectionStatus, callback, { immediate: true })
  }

  // =============================================================================
  // Lifecycle & Status Monitoring
  // =============================================================================

  // Status check interval - works in both component and non-component contexts
  let statusInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Start status monitoring
   */
  function startStatusMonitor(): void {
    if (statusInterval) return // Already running

    const checkStatus = () => {
      const connected = websocketService.isConnected()
      if (connected !== isConnected.value) {
        isConnected.value = connected
      }
    }

    statusInterval = setInterval(checkStatus, 1000)
  }

  /**
   * Stop status monitoring
   */
  function stopStatusMonitor(): void {
    if (statusInterval) {
      clearInterval(statusInterval)
      statusInterval = null
    }
  }

  /**
   * Full cleanup - call when done with this composable instance
   */
  function cleanup(): void {
    stopStatusMonitor()
    messageHandlers.clear()
    if (subscriptionId.value) {
      unsubscribe()
    }
  }

  // Auto-connect immediately if enabled (works in both component and store contexts)
  if (autoConnect) {
    connect()
    startStatusMonitor()
  }

  // Vue component lifecycle hooks (only work when used in Vue components)
  // These provide automatic cleanup when used in components
  onMounted(() => {
    // Start status monitor if not already started
    if (!statusInterval) {
      startStatusMonitor()
    }
  })

  onUnmounted(() => {
    cleanup()
    if (autoReconnect) {
      // Note: We don't disconnect the singleton service, just cleanup this composable
      // The service should stay connected for other consumers
    }
  })

  // =============================================================================
  // Return
  // =============================================================================

  return {
    // State
    isConnected,
    isConnecting,
    connectionError,
    connectionStatus,
    reconnectAttempts,
    lastMessage,
    messageCount,
    rateLimitWarning,
    activeFilters,

    // Actions
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    updateFilters,
    on,
    watchStatus,
    cleanup,
  }
}

















