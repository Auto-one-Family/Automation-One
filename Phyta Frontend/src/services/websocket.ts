import { useEspStore } from '@/stores/espStore'
import type { ActuatorStatusPayload, EspHealthPayload, SensorDataPayload } from '@/types/esp'

const TOKEN_KEY = 'el_frontend_access_token'

type MessageHandler = (type: string, data: Record<string, unknown>) => void

class PhytaWebSocketService {
  private ws: WebSocket | null = null
  private clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  private handlers = new Set<MessageHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect(): void {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    if (this.ws?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/v1/ws/realtime/${this.clientId}?token=${encodeURIComponent(token)}`
    this.ws = new WebSocket(url)

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string
          data: Record<string, unknown>
        }
        this.dispatch(msg.type, msg.data)
        for (const h of this.handlers) h(msg.type, msg.data)
      } catch {
        /* ignore malformed */
      }
    }

    this.ws.onclose = () => {
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  private dispatch(type: string, data: Record<string, unknown>): void {
    const store = useEspStore()
    if (type === 'sensor_data') {
      store.applySensorData(data as unknown as SensorDataPayload)
    } else if (type === 'actuator_status') {
      store.applyActuatorStatus(data as unknown as ActuatorStatusPayload)
    } else if (type === 'esp_health') {
      store.applyEspHealth(data as unknown as EspHealthPayload)
    }
  }

  on(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
}

export const phytaWebSocket = new PhytaWebSocketService()
