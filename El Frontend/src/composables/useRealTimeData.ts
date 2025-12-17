/**
 * Real-Time Data Composable
 * 
 * Provides WebSocket-based real-time updates for ESP data.
 * Connects to the server's WebSocket endpoint and distributes
 * updates to listening components.
 */

import { ref, onMounted, onUnmounted, computed } from 'vue'

// =============================================================================
// TYPES
// =============================================================================

export interface SensorUpdate {
  esp_id: string
  gpio: number
  value: number
  quality: string
  timestamp: string
}

export interface ActuatorUpdate {
  esp_id: string
  gpio: number
  state: boolean
  pwm_value?: number
  timestamp: string
}

export interface HeartbeatUpdate {
  esp_id: string
  uptime: number
  heap_free: number
  wifi_rssi: number
  system_state: string
  timestamp: string
}

export interface RealTimeMessage {
  type: 'sensor' | 'actuator' | 'heartbeat' | 'state_change' | 'error'
  data: SensorUpdate | ActuatorUpdate | HeartbeatUpdate | Record<string, unknown>
}

export interface UseRealTimeDataOptions {
  /** Filter updates by ESP ID */
  espId?: string
  /** Auto-connect on mount */
  autoConnect?: boolean
  /** Reconnect on disconnect */
  autoReconnect?: boolean
  /** Reconnect delay in ms */
  reconnectDelay?: number
  /** Max reconnect attempts (0 = unlimited) */
  maxReconnectAttempts?: number
}

// =============================================================================
// COMPOSABLE
// =============================================================================

export function useRealTimeData(options: UseRealTimeDataOptions = {}) {
  const {
    espId,
    autoConnect = true,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 10,
  } = options

  // Connection state
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const connectionError = ref<string | null>(null)
  const reconnectAttempts = ref(0)

  // Data state
  const lastUpdate = ref<Date | null>(null)
  const lastSensorUpdate = ref<SensorUpdate | null>(null)
  const lastActuatorUpdate = ref<ActuatorUpdate | null>(null)
  const lastHeartbeat = ref<HeartbeatUpdate | null>(null)

  // Event handlers (to be set by consumers)
  const eventHandlers = {
    onSensorUpdate: null as ((update: SensorUpdate) => void) | null,
    onActuatorUpdate: null as ((update: ActuatorUpdate) => void) | null,
    onHeartbeat: null as ((update: HeartbeatUpdate) => void) | null,
    onStateChange: null as ((data: Record<string, unknown>) => void) | null,
    onError: null as ((error: string) => void) | null,
  }

  // WebSocket instance
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Computed
  const connectionStatus = computed(() => {
    if (isConnecting.value) return 'connecting'
    if (isConnected.value) return 'connected'
    if (connectionError.value) return 'error'
    return 'disconnected'
  })

  // =============================================================================
  // WEBSOCKET FUNCTIONS
  // =============================================================================

  /**
   * Get WebSocket URL based on current location
   */
  function getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    
    // Build URL with optional ESP filter
    let url = `${protocol}//${host}/api/v1/ws/live`
    if (espId) {
      url += `?esp_id=${encodeURIComponent(espId)}`
    }
    
    return url
  }

  /**
   * Connect to WebSocket
   */
  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      console.log('[WebSocket] Already connected or connecting')
      return
    }

    isConnecting.value = true
    connectionError.value = null

    try {
      const url = getWebSocketUrl()
      console.log('[WebSocket] Connecting to:', url)
      
      ws = new WebSocket(url)

      ws.onopen = () => {
        console.log('[WebSocket] Connected')
        isConnected.value = true
        isConnecting.value = false
        connectionError.value = null
        reconnectAttempts.value = 0
      }

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason)
        isConnected.value = false
        isConnecting.value = false
        
        // Attempt reconnect if enabled
        if (autoReconnect && (maxReconnectAttempts === 0 || reconnectAttempts.value < maxReconnectAttempts)) {
          scheduleReconnect()
        }
      }

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event)
        connectionError.value = 'Verbindungsfehler'
        isConnecting.value = false
        eventHandlers.onError?.('WebSocket-Verbindungsfehler')
      }

      ws.onmessage = (event) => {
        handleMessage(event.data)
      }
    } catch (error) {
      console.error('[WebSocket] Connection error:', error)
      connectionError.value = 'Verbindung fehlgeschlagen'
      isConnecting.value = false
    }
  }

  /**
   * Disconnect from WebSocket
   */
  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      ws.close()
      ws = null
    }

    isConnected.value = false
    isConnecting.value = false
  }

  /**
   * Schedule a reconnect attempt
   */
  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }

    reconnectAttempts.value++
    console.log(`[WebSocket] Scheduling reconnect attempt ${reconnectAttempts.value}/${maxReconnectAttempts || '∞'}`)

    reconnectTimer = setTimeout(() => {
      connect()
    }, reconnectDelay)
  }

  /**
   * Handle incoming WebSocket message
   */
  function handleMessage(data: string) {
    try {
      const message: RealTimeMessage = JSON.parse(data)
      lastUpdate.value = new Date()

      // Filter by ESP ID if specified
      if (espId) {
        const msgEspId = (message.data as { esp_id?: string })?.esp_id
        if (msgEspId && msgEspId !== espId) {
          return // Ignore messages for other ESPs
        }
      }

      switch (message.type) {
        case 'sensor':
          lastSensorUpdate.value = message.data as SensorUpdate
          eventHandlers.onSensorUpdate?.(message.data as SensorUpdate)
          break

        case 'actuator':
          lastActuatorUpdate.value = message.data as ActuatorUpdate
          eventHandlers.onActuatorUpdate?.(message.data as ActuatorUpdate)
          break

        case 'heartbeat':
          lastHeartbeat.value = message.data as HeartbeatUpdate
          eventHandlers.onHeartbeat?.(message.data as HeartbeatUpdate)
          break

        case 'state_change':
          eventHandlers.onStateChange?.(message.data as Record<string, unknown>)
          break

        case 'error':
          eventHandlers.onError?.((message.data as { message?: string })?.message ?? 'Unbekannter Fehler')
          break

        default:
          console.warn('[WebSocket] Unknown message type:', message.type)
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error)
    }
  }

  /**
   * Send a message through WebSocket
   */
  function send(data: Record<string, unknown>) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] Cannot send - not connected')
      return false
    }

    try {
      ws.send(JSON.stringify(data))
      return true
    } catch (error) {
      console.error('[WebSocket] Send error:', error)
      return false
    }
  }

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  function onSensorUpdate(handler: (update: SensorUpdate) => void) {
    eventHandlers.onSensorUpdate = handler
  }

  function onActuatorUpdate(handler: (update: ActuatorUpdate) => void) {
    eventHandlers.onActuatorUpdate = handler
  }

  function onHeartbeat(handler: (update: HeartbeatUpdate) => void) {
    eventHandlers.onHeartbeat = handler
  }

  function onStateChange(handler: (data: Record<string, unknown>) => void) {
    eventHandlers.onStateChange = handler
  }

  function onError(handler: (error: string) => void) {
    eventHandlers.onError = handler
  }

  // =============================================================================
  // LIFECYCLE
  // =============================================================================

  onMounted(() => {
    if (autoConnect) {
      connect()
    }
  })

  onUnmounted(() => {
    disconnect()
  })

  // =============================================================================
  // RETURN
  // =============================================================================

  return {
    // State
    isConnected,
    isConnecting,
    connectionError,
    connectionStatus,
    lastUpdate,
    lastSensorUpdate,
    lastActuatorUpdate,
    lastHeartbeat,
    reconnectAttempts,

    // Actions
    connect,
    disconnect,
    send,

    // Event handlers
    onSensorUpdate,
    onActuatorUpdate,
    onHeartbeat,
    onStateChange,
    onError,
  }
}

// =============================================================================
// SINGLETON FOR GLOBAL UPDATES
// =============================================================================

let globalInstance: ReturnType<typeof useRealTimeData> | null = null

/**
 * Get or create a global real-time data instance
 * Use this for app-wide updates (e.g., in the sidebar or header)
 */
export function useGlobalRealTimeData() {
  if (!globalInstance) {
    globalInstance = useRealTimeData({
      autoConnect: false, // Manually connect when needed
      autoReconnect: true,
    })
  }
  return globalInstance
}

