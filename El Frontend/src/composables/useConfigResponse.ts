/**
 * Config Response Composable
 * 
 * Handles WebSocket events for configuration responses from ESP32 devices.
 * Listens for 'config_response' events and provides notifications and state management.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import type { ConfigResponse } from '@/types'

// =============================================================================
// COMPOSABLE
// =============================================================================

export function useConfigResponse() {
  const lastResponse = ref<ConfigResponse | null>(null)
  const isConnected = ref(false)
  const ws = ref<WebSocket | null>(null)
  
  // Event handlers
  const onSuccessHandler = ref<((response: ConfigResponse) => void) | null>(null)
  const onErrorHandler = ref<((response: ConfigResponse) => void) | null>(null)

  /**
   * Connect to WebSocket for config responses
   * Uses the same WebSocket endpoint as MqttLogView
   */
  async function connect() {
    if (ws.value && (ws.value.readyState === WebSocket.CONNECTING || ws.value.readyState === WebSocket.OPEN)) {
      return
    }

    try {
      // Get auth token (similar to MqttLogView)
      const authStore = (await import('@/stores/auth')).useAuthStore()
      let token = authStore.accessToken
      
      if (!token && authStore.refreshToken) {
        try {
          await authStore.refreshTokens()
          token = authStore.accessToken
        } catch (err) {
          console.error('[ConfigResponse] Token refresh failed:', err)
          return
        }
      }

      if (!token) {
        console.error('[ConfigResponse] No auth token available')
        return
      }

      const clientId = `config_response_${Date.now()}`
      const apiHost = import.meta.env.VITE_API_HOST || 'localhost:8000'
      const wsUrl = `ws://${apiHost}/api/v1/ws/realtime/${clientId}?token=${token}`

      ws.value = new WebSocket(wsUrl)

      ws.value.onopen = () => {
        isConnected.value = true
        console.log('[ConfigResponse] WebSocket connected')
        
        // Subscribe to config_response events
        ws.value?.send(JSON.stringify({
          action: 'subscribe',
          filters: { types: ['config_response'] }
        }))
      }

      ws.value.onclose = () => {
        isConnected.value = false
        console.log('[ConfigResponse] WebSocket disconnected')
      }

      ws.value.onerror = (error) => {
        console.error('[ConfigResponse] WebSocket error:', error)
      }

      ws.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Handle config_response events (server sends type: 'config_response')
          if (data.type === 'config_response') {
            const response: ConfigResponse = {
              esp_id: data.esp_id || '',
              config_type: data.config_type || 'sensor',
              status: data.status || 'error',
              count: data.count || 0,
              message: data.message || '',
              error_code: data.error_code,
              timestamp: data.timestamp || Date.now(),
            }
            
            lastResponse.value = response
            
            // Call appropriate handler
            if (response.status === 'success') {
              onSuccessHandler.value?.(response)
            } else {
              onErrorHandler.value?.(response)
            }
          }
        } catch (error) {
          console.error('[ConfigResponse] Failed to parse message:', error)
        }
      }
    } catch (error) {
      console.error('[ConfigResponse] Connection error:', error)
    }
  }

  /**
   * Disconnect from WebSocket
   */
  function disconnect() {
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    isConnected.value = false
  }

  /**
   * Register success handler
   */
  function onSuccess(handler: (response: ConfigResponse) => void) {
    onSuccessHandler.value = handler
  }

  /**
   * Register error handler
   */
  function onError(handler: (response: ConfigResponse) => void) {
    onErrorHandler.value = handler
  }

  // Auto-connect on mount
  onMounted(() => {
    connect()
  })

  // Disconnect on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    lastResponse,
    isConnected,
    connect,
    disconnect,
    onSuccess,
    onError,
  }
}

