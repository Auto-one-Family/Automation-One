import { computed, onMounted, onUnmounted, ref, type MaybeRefOrGetter, toValue } from 'vue'
import type { PhytaEspDevice } from '@/types/esp'

export const HEARTBEAT_STALE_MS = 70_000
export const HEARTBEAT_OFFLINE_MS = 120_000

export type PhytaEspStatus = 'online' | 'stale' | 'offline' | 'pending_approval' | 'unknown'

const STATUS_TICK_MS = 1_000
const tick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function ensureTick(): void {
  if (timer !== null) return
  timer = setInterval(() => {
    tick.value += 1
  }, STATUS_TICK_MS)
}

function statusFromLastSeen(lastSeen: string | null | undefined): PhytaEspStatus {
  if (!lastSeen) return 'offline'
  const age = Date.now() - new Date(lastSeen).getTime()
  if (age < HEARTBEAT_STALE_MS) return 'online'
  if (age < HEARTBEAT_OFFLINE_MS) return 'stale'
  return 'offline'
}

export function getPhytaEspStatus(device: PhytaEspDevice): PhytaEspStatus {
  void tick.value
  const serverStatus = device.status?.toLowerCase()
  if (serverStatus === 'pending_approval') return 'pending_approval'
  if (serverStatus === 'offline' || serverStatus === 'rejected') return 'offline'
  const hb = statusFromLastSeen(device.last_seen)
  if (serverStatus === 'online' || serverStatus === 'approved') {
    return hb
  }
  return hb
}

export function usePhytaEspStatus(device: MaybeRefOrGetter<PhytaEspDevice>) {
  onMounted(() => ensureTick())
  onUnmounted(() => {
    /* global tick shared */
  })

  return computed(() => getPhytaEspStatus(toValue(device)))
}

export function statusDotClass(status: PhytaEspStatus): string {
  switch (status) {
    case 'online':
      return 'status-dot status-dot--online'
    case 'stale':
      return 'status-dot status-dot--stale'
    case 'pending_approval':
      return 'status-dot status-dot--pending'
    case 'offline':
      return 'status-dot status-dot--offline'
    default:
      return 'status-dot status-dot--unknown'
  }
}

export function statusLabel(status: PhytaEspStatus): string {
  switch (status) {
    case 'online':
      return 'Online'
    case 'stale':
      return 'Verzögert'
    case 'pending_approval':
      return 'Wartet auf Freigabe'
    case 'offline':
      return 'Offline'
    default:
      return 'Unbekannt'
  }
}

/** Relative offline/stale hint for operator cards. */
export function formatLastContactHint(
  lastSeen: string | null | undefined,
  status: PhytaEspStatus,
): string | null {
  if (status === 'online') return null
  if (!lastSeen) {
    return status === 'offline' ? 'Kein Kontakt' : null
  }

  const ageMs = Date.now() - new Date(lastSeen).getTime()
  if (ageMs < 0) return null

  const minutes = Math.floor(ageMs / 60_000)
  const hours = Math.floor(minutes / 60)

  if (status === 'offline') {
    if (minutes < 1) return 'Offline seit wenigen Sekunden'
    if (minutes < 60) {
      return minutes === 1 ? 'Offline seit 1 Minute' : `Offline seit ${minutes} Minuten`
    }
    if (hours < 24) {
      return hours === 1 ? 'Offline seit 1 Stunde' : `Offline seit ${hours} Stunden`
    }
    return 'Seit gestern offline'
  }

  if (status === 'stale') {
    if (minutes < 1) return 'Letzter Kontakt vor wenigen Sekunden'
    if (minutes < 60) {
      return minutes === 1
        ? 'Letzter Kontakt vor 1 Minute'
        : `Letzter Kontakt vor ${minutes} Minuten`
    }
    return hours === 1
      ? 'Letzter Kontakt vor 1 Stunde'
      : `Letzter Kontakt vor ${hours} Stunden`
  }

  return null
}
