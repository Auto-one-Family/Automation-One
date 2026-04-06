export type MonitorConnectivityState =
  | 'connected'
  | 'stale'
  | 'reconnecting'
  | 'degraded_api'
  | 'disconnected'

export type MonitorDataMode = 'Live' | 'Hybrid' | 'Snapshot'

export interface MonitorConnectivityInput {
  wsStatus: 'connected' | 'connecting' | 'disconnected' | 'error'
  hasZoneApiError: boolean
  hasDetailApiError: boolean
  lastApiSuccessAt: number | null
  nowTs?: number
  staleAfterMs?: number
}

export interface MonitorDataModeInput {
  hasSnapshotBase: boolean
  hasLiveOverlay: boolean
  monitorState: MonitorConnectivityState
}

const DEFAULT_STALE_AFTER_MS = 90_000

export function resolveMonitorConnectivityState(input: MonitorConnectivityInput): MonitorConnectivityState {
  const nowTs = input.nowTs ?? Date.now()
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS

  if (input.wsStatus === 'disconnected' || input.wsStatus === 'error') {
    return 'disconnected'
  }

  if (input.hasZoneApiError || input.hasDetailApiError) {
    return 'degraded_api'
  }

  if (input.wsStatus === 'connecting') {
    return 'reconnecting'
  }

  if (input.lastApiSuccessAt != null && nowTs - input.lastApiSuccessAt > staleAfterMs) {
    return 'stale'
  }

  return 'connected'
}

export function resolveMonitorDataMode(input: MonitorDataModeInput): MonitorDataMode {
  if (input.monitorState === 'disconnected' || input.monitorState === 'degraded_api') {
    return 'Snapshot'
  }
  if (input.hasSnapshotBase && input.hasLiveOverlay) {
    return 'Hybrid'
  }
  if (!input.hasSnapshotBase && input.hasLiveOverlay) {
    return 'Live'
  }
  return 'Snapshot'
}

export function createMonitorRecoveryOrchestrator(runSteps: () => Promise<void>) {
  let running: Promise<void> | null = null
  let rerunRequested = false

  async function executeLoop(): Promise<void> {
    do {
      rerunRequested = false
      await runSteps()
    } while (rerunRequested)
  }

  async function trigger(): Promise<void> {
    if (running) {
      rerunRequested = true
      return running
    }
    running = executeLoop().finally(() => {
      running = null
    })
    return running
  }

  function isRunning(): boolean {
    return running != null
  }

  return {
    trigger,
    isRunning,
  }
}
