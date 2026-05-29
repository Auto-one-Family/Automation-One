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
      return 'bg-success shadow-[0_0_8px_var(--color-success)]'
    case 'stale':
      return 'bg-warning'
    case 'pending_approval':
      return 'bg-iridescent-2 animate-pulse'
    case 'offline':
      return 'bg-dark-400'
    default:
      return 'bg-dark-500'
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
