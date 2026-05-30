import { getAccessToken } from '@/api/client'
import { useEspStore } from '@/stores/espStore'
import type { ActuatorStatusPayload, EspHealthPayload, SensorDataPayload } from '@/types/esp'
import { ref } from 'vue'

export const wsConnected = ref(false)
export const wsConnecting = ref(false)
/** Last WS open or inbound message — operator tooltip only, not shown in header text. */
export const wsLastActivityAt = ref<Date | null>(null)

const LIVE_TYPES = ['sensor_data', 'actuator_status', 'esp_health', 'actuator_response'] as const

type MessageHandler = (type: string, data: Record<string, unknown>) => void

class PhytaWebSocketService {
  private ws: WebSocket | null = null
  private clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  private handlers = new Set<MessageHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect(): void {
    const token = getAccessToken()
    if (!token) return
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/v1/ws/realtime/${this.clientId}?token=${encodeURIComponent(token)}`
    this.ws = new WebSocket(url)
    wsConnected.value = false
    wsConnecting.value = true

    this.ws.onopen = () => {
      wsConnected.value = true
      wsConnecting.value = false
      wsLastActivityAt.value = new Date()
      this.sendSubscribe()
    }

    this.ws.onmessage = (event) => {
      wsLastActivityAt.value = new Date()
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string
          data: Record<string, unknown>
        }
        if (!msg?.type || !msg.data) return
        this.dispatch(msg.type, msg.data)
        for (const h of this.handlers) h(msg.type, msg.data)
      } catch {
        /* ignore malformed */
      }
    }

    this.ws.onclose = () => {
      wsConnected.value = false
      wsConnecting.value = false
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      wsConnected.value = false
      wsConnecting.value = false
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.ws = null
    wsConnected.value = false
    wsConnecting.value = false
  }

  private sendSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        action: 'subscribe',
        filters: {
          types: [...LIVE_TYPES],
        },
      }),
    )
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    wsConnecting.value = true
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  private dispatch(type: string, data: Record<string, unknown>): void {
    const store = useEspStore()
    if (type === 'sensor_data') {
      store.applySensorData(normalizeSensorData(data))
    } else if (type === 'actuator_status' || type === 'actuator_response') {
      store.applyActuatorStatus(normalizeActuatorStatus(data))
    } else if (type === 'esp_health') {
      store.applyEspHealth(normalizeEspHealth(data))
    }
  }

  on(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
}

function normalizeSensorData(data: Record<string, unknown>): SensorDataPayload {
  const espId = String(data.esp_id ?? data.device_id ?? '')
  const raw = data.raw_value ?? data.value
  return {
    esp_id: espId,
    gpio: Number(data.gpio),
    sensor_type: String(data.sensor_type ?? ''),
    config_id: data.config_id != null ? String(data.config_id) : null,
    raw_value: typeof raw === 'number' ? raw : undefined,
    value: typeof raw === 'number' ? raw : undefined,
    unit: data.unit != null ? String(data.unit) : undefined,
    quality: data.quality != null ? String(data.quality) : undefined,
    i2c_address: data.i2c_address != null ? String(data.i2c_address) : null,
    onewire_address: data.onewire_address != null ? String(data.onewire_address) : null,
  }
}

function normalizeActuatorStatus(data: Record<string, unknown>): ActuatorStatusPayload {
  return {
    esp_id: String(data.esp_id ?? data.device_id ?? ''),
    gpio: Number(data.gpio),
    actuator_type: data.actuator_type != null ? String(data.actuator_type) : undefined,
    state: data.state != null ? String(data.state) : data.success === true ? 'on' : undefined,
    pwm_value: typeof data.pwm_value === 'number' ? data.pwm_value : typeof data.value === 'number' ? data.value : undefined,
  }
}

function normalizeEspHealth(data: Record<string, unknown>): EspHealthPayload {
  const ts = data.timestamp
  let lastSeen: string | undefined
  if (typeof ts === 'number' && ts > 0) {
    const ms = ts > 1_000_000_000_000 ? ts : ts * 1000
    lastSeen = new Date(ms).toISOString()
  } else if (typeof data.last_seen === 'string') {
    lastSeen = data.last_seen
  }
  return {
    esp_id: String(data.esp_id ?? ''),
    status: data.status != null ? String(data.status) : undefined,
    last_seen: lastSeen,
  }
}

export const phytaWebSocket = new PhytaWebSocketService()
