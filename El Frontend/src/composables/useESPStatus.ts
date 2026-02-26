/**
 * useESPStatus — Central ESP Status Logic
 *
 * Server-centric: Status derived from last_heartbeat/last_seen and device metadata.
 * Used by: espStore (onlineDevices/offlineDevices), DeviceMiniCard, ESPSettingsSheet,
 * ZonePlate, StatusPill.
 *
 * Thresholds (aligned with Server heartbeat_handler):
 * - online: last_seen < 1.5× heartbeat_interval (default 90s)
 * - stale: 1.5× - 5min (data delayed but device may still be reachable)
 * - offline: > 5min
 */

import { computed } from 'vue'
import type { ESPDevice } from '@/api/esp'
import { formatRelativeTime } from '@/utils/formatters'

/** Status values for UI display */
export type ESPStatusValue =
  | 'online'
  | 'stale'
  | 'offline'
  | 'unknown'
  | 'error'
  | 'safe_mode'
  | 'pending'

/** Default heartbeat interval (seconds) when not provided by device */
const DEFAULT_HEARTBEAT_INTERVAL = 60

/** Online threshold: 1.5× interval */
const ONLINE_MULTIPLIER = 1.5

/** Stale threshold: 5 minutes */
const STALE_THRESHOLD_SEC = 300

export interface ESPStatusInfo {
  status: ESPStatusValue
  /** Human-readable label for UI */
  label: string
  /** "Zuletzt vor X Min." for stale/offline */
  lastSeenLabel: string | null
  /** Whether data should be shown as stale (gray sparkbars, etc.) */
  isStale: boolean
  /** Whether device is considered reachable (online or stale) */
  isReachable: boolean
}

/**
 * Get status from device metadata (error, safe_mode, pending) — server-provided.
 */
function getStatusFromMetadata(device: ESPDevice): ESPStatusValue | null {
  if (device.status === 'error') return 'error'
  if (device.status === 'pending_approval' || device.status === 'rejected') return 'pending'

  const d = device as any
  if (d.system_state === 'SAFE_MODE') return 'safe_mode'

  return null
}

/**
 * Compute status from last_seen/last_heartbeat timing.
 */
function getStatusFromHeartbeat(
  device: ESPDevice
): { status: 'online' | 'stale' | 'offline' | 'unknown'; ageSec: number } {
  const ts = device.last_seen || device.last_heartbeat
  if (!ts) {
    return { status: 'unknown', ageSec: Infinity }
  }

  const then = new Date(ts).getTime()
  const now = Date.now()
  const ageSec = Math.floor((now - then) / 1000)

  const interval = device.heartbeat_interval_seconds ?? DEFAULT_HEARTBEAT_INTERVAL
  const onlineThreshold = interval * ONLINE_MULTIPLIER

  if (ageSec < 0) return { status: 'unknown', ageSec }
  if (ageSec < onlineThreshold) return { status: 'online', ageSec }
  if (ageSec < STALE_THRESHOLD_SEC) return { status: 'stale', ageSec }
  return { status: 'offline', ageSec }
}

/**
 * Get full ESP status info for a device.
 * Use this in components for consistent status display.
 */
export function getESPStatus(device: ESPDevice | null | undefined): ESPStatusInfo {
  if (!device) {
    return {
      status: 'unknown',
      label: 'Unbekannt',
      lastSeenLabel: null,
      isStale: true,
      isReachable: false,
    }
  }

  const metaStatus = getStatusFromMetadata(device)
  if (metaStatus) {
    const labels: Record<ESPStatusValue, string> = {
      online: 'Online',
      stale: 'Verzögert',
      offline: 'Offline',
      unknown: 'Unbekannt',
      error: 'Fehler',
      safe_mode: 'Safe-Mode',
      pending: 'Warte auf Genehmigung',
    }
    return {
      status: metaStatus,
      label: labels[metaStatus],
      lastSeenLabel: null,
      isStale: metaStatus !== 'online',
      isReachable: false,
    }
  }

  const { status } = getStatusFromHeartbeat(device)
  const ts = device.last_seen || device.last_heartbeat
  const lastSeenLabel = ts ? formatRelativeTime(ts) : null

  const labels: Record<string, string> = {
    online: 'Online',
    stale: 'Verzögert',
    offline: 'Offline',
    unknown: 'Unbekannt',
  }

  return {
    status,
    label: labels[status] ?? 'Unbekannt',
    lastSeenLabel: status !== 'online' ? lastSeenLabel : null,
    isStale: status === 'stale' || status === 'offline' || status === 'unknown',
    isReachable: status === 'online' || status === 'stale',
  }
}

/**
 * Composable: returns getESPStatus and a computed for a given device.
 */
export function useESPStatus(device: () => ESPDevice | null | undefined) {
  const statusInfo = computed(() => getESPStatus(device()))
  return { getESPStatus, statusInfo }
}
