/**
 * Real-Time Data Composable
 * 
 * @deprecated This composable is deprecated. Use `useWebSocket` from '@/composables/useWebSocket' instead.
 * 
 * This composable creates its own WebSocket connection, which is inefficient.
 * The new `useWebSocket` composable uses the singleton WebSocket service for
 * better performance and resource management.
 * 
 * Migration guide:
 * - Replace `useRealTimeData()` with `useWebSocket()`
 * - Use `subscribe()` method with filters instead of event handlers
 * - See `useWebSocket.ts` for API documentation
 * 
 * Provides WebSocket-based real-time updates for ESP data.
 * Connects to the server's WebSocket endpoint and distributes
 * updates to listening components.
 */

import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

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

export interface ZoneUpdate {
  esp_id: string
  status: 'zone_assigned' | 'error'
  zone_id: string
  master_zone_id?: string
  timestamp: number
  message?: string
}

/**
 * Subzone update from WebSocket (ESP ACK confirmation).
 * Phase: 9 - Subzone Management
 */
export interface SubzoneUpdate {
  device_id: string
  subzone_id: string
  status: 'subzone_assigned' | 'subzone_removed' | 'error'
  timestamp: number
  error_code?: number
  message?: string
}

export interface RealTimeMessage {
  type: 'sensor' | 'actuator' | 'heartbeat' | 'state_change' | 'error' | 'zone_assignment' | 'subzone_assignment'
  data: SensorUpdate | ActuatorUpdate | HeartbeatUpdate | ZoneUpdate | SubzoneUpdate | Record<string, unknown>
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
  const lastZoneUpdate = ref<ZoneUpdate | null>(null)
  const lastSubzoneUpdate = ref<SubzoneUpdate | null>(null)

  // Event handlers (to be set by consumers)
  const eventHandlers = {
    onSensorUpdate: null as ((update: SensorUpdate) => void) | null,
    onActuatorUpdate: null as ((update: ActuatorUpdate) => void) | null,
    onHeartbeat: null as ((update: HeartbeatUpdate) => void) | null,
    onStateChange: null as ((data: Record<string, unknown>) => void) | null,
    onError: null as ((error: string) => void) | null,
    onZoneUpdate: null as ((update: ZoneUpdate) => void) | null,
    onSubzoneUpdate: null as ((update: SubzoneUpdate) => void) | null,
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
   *
   * Server expects: /api/v1/ws/realtime/{client_id}?token=<jwt>
   */
  function getWebSocketUrl(): string {
    const authStore = useAuthStore()
    const token = authStore.accessToken

    if (!token) {
      console.error('[WebSocket] No auth token available')
      throw new Error('Authentication required for WebSocket connection')
    }

    // In development, use localhost:8000 directly for WebSocket
    // In production, use the same host as the page
    const isDev = import.meta.env.DEV
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = isDev ? 'localhost:8000' : window.location.host

    // Generate unique client ID
    const clientId = `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Build URL with token and optional ESP filter
    const params = new URLSearchParams()
    params.append('token', token)
    if (espId) {
      params.append('esp_id', espId)
    }

    return `${protocol}//${host}/api/v1/ws/realtime/${clientId}?${params.toString()}`
  }

  /**
   * Connect to WebSocket
   */
  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      console.log('[WebSocket] Already connected or connecting')
      return
    }

    // Check authentication before attempting connection
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) {
      console.log('[WebSocket] Not authenticated, skipping connection')
      connectionError.value = 'Nicht authentifiziert'
      return
    }

    isConnecting.value = true
    connectionError.value = null

    try {
      const url = getWebSocketUrl()
      console.log('[WebSocket] Connecting to:', url.replace(/token=[^&]+/, 'token=***'))

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

        // Handle auth rejection (code 4001)
        if (event.code === 4001) {
          connectionError.value = event.reason || 'Authentifizierung fehlgeschlagen'
          // Don't auto-reconnect on auth failure
          return
        }

        // Attempt reconnect if enabled and still authenticated
        if (autoReconnect && authStore.isAuthenticated && (maxReconnectAttempts === 0 || reconnectAttempts.value < maxReconnectAttempts)) {
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
      connectionError.value = error instanceof Error ? error.message : 'Verbindung fehlgeschlagen'
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

        case 'zone_assignment':
          lastZoneUpdate.value = message.data as ZoneUpdate
          eventHandlers.onZoneUpdate?.(message.data as ZoneUpdate)
          break

        case 'subzone_assignment':
          lastSubzoneUpdate.value = message.data as SubzoneUpdate
          eventHandlers.onSubzoneUpdate?.(message.data as SubzoneUpdate)
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

  function onZoneUpdate(handler: (update: ZoneUpdate) => void) {
    eventHandlers.onZoneUpdate = handler
  }

  function onSubzoneUpdate(handler: (update: SubzoneUpdate) => void) {
    eventHandlers.onSubzoneUpdate = handler
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
    lastZoneUpdate,
    lastSubzoneUpdate,
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
    onZoneUpdate,
    onSubzoneUpdate,
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




