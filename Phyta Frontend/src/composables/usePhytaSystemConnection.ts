import { computed } from 'vue'
import { wsConnected, wsConnecting, wsLastActivityAt } from '@/services/websocket'

export type PhytaConnectionState = 'live' | 'connecting' | 'offline'

function formatActivityAgo(at: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000))
  if (sec < 5) return 'gerade eben'
  if (sec < 60) return `vor ${sec} Sek.`
  const min = Math.floor(sec / 60)
  if (min < 60) return `vor ${min} Min.`
  const hours = Math.floor(min / 60)
  return `vor ${hours} Std.`
}

export function usePhytaSystemConnection() {
  const connectionState = computed<PhytaConnectionState>(() => {
    if (wsConnected.value) return 'live'
    if (wsConnecting.value) return 'connecting'
    return 'offline'
  })

  const connectionIndicatorClass = computed(() => {
    const base = 'connection-indicator'
    switch (connectionState.value) {
      case 'live':
        return `${base} connection-indicator--live`
      case 'connecting':
        return `${base} connection-indicator--connecting`
      default:
        return `${base} connection-indicator--offline`
    }
  })

  const connectionTooltip = computed(() => {
    if (connectionState.value === 'live') {
      const at = wsLastActivityAt.value
      const hint = at ? formatActivityAgo(at) : 'gerade eben'
      return `Mit dem System verbunden · Letzte Aktualisierung ${hint}`
    }
    if (connectionState.value === 'connecting') {
      return 'Verbindung wird hergestellt…'
    }
    return 'Keine Live-Verbindung zum System'
  })

  return {
    connectionState,
    connectionIndicatorClass,
    connectionTooltip,
  }
}
