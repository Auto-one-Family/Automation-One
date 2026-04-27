/**
 * Actuator Store
 *
 * Handles actuator-related WebSocket events and command lifecycle.
 * Mirrors server-side actuator_handler.py, actuator_alert_handler.py,
 * and sequence execution services.
 *
 * Server-centric architecture:
 * ESP32 → MQTT (kaiser/{esp_id}/actuator/status) → Server → WS (actuator_status) → this store
 * ESP32 → MQTT (kaiser/{esp_id}/actuator/alert) → Server → WS (actuator_alert) → this store
 * Server → WS (actuator_response, actuator_command, actuator_command_failed) → this store
 * Server → WS (sequence_started/step/completed/error/cancelled) → this store
 *
 * Cross-store dependency: Receives devices array from esp.store.ts via dispatcher.
 */

import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/logger'
import { CONTRACT_OPERATOR_ACTION, extractCorrelationId, extractRequestId, validateContractEvent } from '@/utils/contractEventMapper'
import type { ESPDevice } from '@/api/esp'

const logger = createLogger('ActuatorStore')

/** Payload shape for actuator_status WebSocket events */
interface ActuatorStatusPayload {
  esp_id?: string
  device_id?: string
  gpio: number
  actuator_type?: string
  /** Original ESP32 hardware type (relay, pump, valve, pwm) */
  hardware_type?: string | null
  state?: string
  value?: number
  emergency?: string
  timestamp?: number
  command_source?: string
  correlation_id?: string
}

/** Message wrapper for actuator_status events */
interface ActuatorStatusMessage {
  data: ActuatorStatusPayload
}

type FinalityState =
  | 'accepted'
  | 'pending'
  | 'terminal_success'
  | 'terminal_failed'
  | 'terminal_timeout'
  | 'terminal_integration_issue'
type IntentType = 'actuator' | 'config' | 'sequence'
type IntentTerminalOutcome = 'success' | 'failed' | 'timeout' | 'integration_issue'
type IntentTerminalSource =
  | 'actuator_response'
  | 'actuator_command_failed'
  | 'actuator_status'
  | 'actuator_timeout'
  | 'config_response'
  | 'config_failed'
  | 'config_timeout'
  | 'sequence_completed'
  | 'sequence_error'
  | 'sequence_cancelled'

interface IntentRecord {
  intentId: string
  key: string
  intentType: IntentType
  subjectId: string
  state: FinalityState
  terminalOutcome: IntentTerminalOutcome | null
  correlationId?: string
  requestId?: string
  issuedBy?: string
  createdAt: number
  updatedAt: number
  terminalAt?: number
  terminalSource?: IntentTerminalSource
  nonTerminalHints: string[]
  command?: string
  gpio?: number
  summary?: string
}

interface ContractIssueContext {
  eventType:
    | 'actuator_command'
    | 'actuator_response'
    | 'actuator_command_failed'
    | 'config_published'
    | 'config_response'
    | 'config_failed'
    | 'sequence_started'
    | 'sequence_step'
    | 'sequence_completed'
    | 'sequence_error'
    | 'sequence_cancelled'
  details: string
  correlationId?: string
}

type DevicePatchFn = (device: ESPDevice) => ESPDevice
type ApplyDevicePatch = (espId: string, patchFn: DevicePatchFn) => boolean

interface ActuatorSnapshot {
  state: unknown
  pwmValue: unknown
}

export const useActuatorStore = defineStore('actuator', () => {
  function isTerminalState(state: FinalityState): boolean {
    return state === 'terminal_success' || state === 'terminal_failed' || state === 'terminal_timeout' || state === 'terminal_integration_issue'
  }

  function toTerminalState(outcome: IntentTerminalOutcome): FinalityState {
    if (outcome === 'success') return 'terminal_success'
    if (outcome === 'failed') return 'terminal_failed'
    if (outcome === 'timeout') return 'terminal_timeout'
    return 'terminal_integration_issue'
  }

  function buildHandleSuffix(correlationId?: string, requestId?: string): string {
    const parts: string[] = []
    if (correlationId) parts.push(`Korrelation: ${correlationId}`)
    if (requestId) parts.push(`Request-ID: ${requestId}`)
    if (parts.length === 0) return ''
    return ` (${parts.join(' | ')})`
  }

  function formatIssuedBy(issuedBy?: string): string {
    if (!issuedBy) return 'unbekannt'
    const source = issuedBy.trim()
    if (!source) return 'unbekannt'
    if (source.startsWith('user:')) {
      const user = source.slice(5).trim()
      return user ? `manuell (${user})` : 'manuell'
    }
    if (source.startsWith('logic:')) {
      const ruleId = source.slice(6).trim()
      return ruleId ? `Automationsregel (${ruleId})` : 'Automationsregel'
    }
    if (source.startsWith('logic_engine')) return 'Automationsregel'
    if (source.startsWith('system:')) return source.replace('system:', 'system/')
    return source
  }

  function normalizeActuatorFailureMessage(rawMessage: string | undefined, command: string | undefined): string | undefined {
    if (!rawMessage) return undefined
    const message = rawMessage.trim()
    if (!message) return undefined
    const lowered = message.toLowerCase()

    if (lowered.includes('failed to turn actuator on')) {
      return 'Aktor konnte nicht eingeschaltet werden'
    }
    if (lowered.includes('failed to turn actuator off')) {
      return 'Aktor konnte nicht ausgeschaltet werden'
    }
    if (lowered.includes('actuator command execution failed')) {
      return 'Aktor-Befehl konnte nicht ausgefuehrt werden'
    }
    if (command === 'ON' && lowered.includes('execute_fail')) {
      return 'Aktor konnte nicht eingeschaltet werden'
    }
    if (command === 'OFF' && lowered.includes('execute_fail')) {
      return 'Aktor konnte nicht ausgeschaltet werden'
    }
    return message
  }


  // Pending commands awaiting firmware confirmation (key: `${esp_id}:${gpio}`)
  const pendingCommands = new Map<string, ReturnType<typeof setTimeout>>()
  const pendingActuatorSnapshots = new Map<string, ActuatorSnapshot>()
  const ACTUATOR_RESPONSE_TIMEOUT_MS = 30_000
  const pendingConfigTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  // Keep above one heartbeat period to avoid false timeout noise
  // when config exchange is only slightly delayed.
  const CONFIG_RESPONSE_TIMEOUT_MS = 75_000
  const CONFIG_RESPONSE_TIMEOUT_WITH_OFFLINE_RULES_MS = 120_000
  const terminalToastCorrelations = new Map<string, number>()
  const MAX_TERMINAL_TOAST_CORRELATIONS = 500
  /**
   * Offline-/Reset-Epoch je Aktor (key: `${esp_id}:${gpio}`).
   * Dient als Guard gegen verspätete actuator_status Events nach Offline-Reset.
   */
  const actuatorResetEpochMsByKey = new Map<string, number>()
  const MAX_INTENT_HISTORY = 200
  const intents = reactive(new Map<string, IntentRecord>())

  function nowMs(): number {
    return Date.now()
  }

  function canEmitTerminalToast(correlationId?: string): boolean {
    const normalizedCorrelationId = typeof correlationId === 'string' ? correlationId.trim() : ''
    if (!normalizedCorrelationId) return true
    if (terminalToastCorrelations.has(normalizedCorrelationId)) {
      return false
    }
    terminalToastCorrelations.set(normalizedCorrelationId, nowMs())
    if (terminalToastCorrelations.size <= MAX_TERMINAL_TOAST_CORRELATIONS) return true

    let oldestKey: string | null = null
    let oldestTs = Number.POSITIVE_INFINITY
    for (const [key, ts] of terminalToastCorrelations.entries()) {
      if (ts < oldestTs) {
        oldestTs = ts
        oldestKey = key
      }
    }
    if (oldestKey) terminalToastCorrelations.delete(oldestKey)
    return true
  }

  function buildActuatorTerminalToastKey(subjectId: string, correlationId?: string, requestId?: string): string {
    return `actuator-terminal:${correlationId ?? requestId ?? subjectId}`
  }

  function getIntentKey(intentType: IntentType, subjectId: string): string {
    return `${intentType}:${subjectId}`
  }

  function buildIntentId(intentType: IntentType, subjectId: string): string {
    return `${intentType}:${subjectId}:${nowMs()}`
  }

  function findIntent(intentType: IntentType, subjectId: string, correlationId?: string): IntentRecord | undefined {
    if (correlationId) {
      for (const intent of intents.values()) {
        if (intent.intentType === intentType && intent.correlationId === correlationId) return intent
      }
    }
    return intents.get(getIntentKey(intentType, subjectId))
  }

  function findIntentByCorrelation(intentType: IntentType, correlationId: string): IntentRecord | undefined {
    for (const intent of intents.values()) {
      if (intent.intentType !== intentType) continue
      if (intent.correlationId !== correlationId) continue
      return intent
    }
    return undefined
  }

  function findIntentByRequest(intentType: IntentType, requestId: string): IntentRecord | undefined {
    for (const intent of intents.values()) {
      if (intent.intentType !== intentType) continue
      if (intent.requestId !== requestId) continue
      return intent
    }
    return undefined
  }

  function saveIntent(intent: IntentRecord): void {
    intents.set(intent.key, intent)
    if (intents.size <= MAX_INTENT_HISTORY) return
    let oldestKey: string | null = null
    let oldestTs = Number.POSITIVE_INFINITY
    for (const [key, candidate] of intents.entries()) {
      if (candidate.updatedAt < oldestTs) {
        oldestTs = candidate.updatedAt
        oldestKey = key
      }
    }
    if (oldestKey) intents.delete(oldestKey)
  }

  function createOrUpdateIntentPending(params: {
    intentType: IntentType
    subjectId: string
    command?: string
    gpio?: number
    summary?: string
    correlationId?: string
    requestId?: string
    issuedBy?: string
    preserveCreated?: boolean
  }): IntentRecord {
    const existing = findIntent(params.intentType, params.subjectId, params.correlationId)
    const ts = nowMs()

    const canReuseTerminalIntent = !!existing && isTerminalState(existing.state) && (
      (!!params.correlationId && params.correlationId === existing.correlationId) ||
      (!params.correlationId && !!params.requestId && params.requestId === existing.requestId)
    )
    if (canReuseTerminalIntent) return existing as IntentRecord

    const updatableExisting = existing && !isTerminalState(existing.state) ? existing : undefined

    const key = getIntentKey(params.intentType, params.subjectId)
    const next: IntentRecord = updatableExisting
      ? {
          ...updatableExisting,
          command: params.command ?? updatableExisting.command,
          gpio: params.gpio ?? updatableExisting.gpio,
          summary: params.summary ?? updatableExisting.summary,
          state: updatableExisting.state === 'accepted' ? 'pending' : updatableExisting.state,
          updatedAt: ts,
          correlationId: params.correlationId ?? updatableExisting.correlationId,
          requestId: params.requestId ?? updatableExisting.requestId,
          issuedBy: params.issuedBy ?? updatableExisting.issuedBy,
        }
      : {
          intentId: buildIntentId(params.intentType, params.subjectId),
          key,
          intentType: params.intentType,
          subjectId: params.subjectId,
          command: params.command,
          gpio: params.gpio,
          summary: params.summary,
          state: params.preserveCreated ? 'accepted' : 'pending',
          terminalOutcome: null,
          correlationId: params.correlationId,
          requestId: params.requestId,
          issuedBy: params.issuedBy,
          createdAt: ts,
          updatedAt: ts,
          nonTerminalHints: [],
        }

    saveIntent(next)
    return next
  }

  function finalizeIntent(params: {
    intentType: IntentType
    subjectId: string
    command?: string
    gpio?: number
    summary?: string
    outcome: IntentTerminalOutcome
    source: IntentTerminalSource
    correlationId?: string
    requestId?: string
    issuedBy?: string
    allowTimeoutOverride?: boolean
  }): IntentRecord {
    const existing = findIntent(params.intentType, params.subjectId, params.correlationId)
    const ts = nowMs()
    if (existing && isTerminalState(existing.state)) {
      const canOverrideTimeout = params.allowTimeoutOverride === true && existing.state === 'terminal_timeout'
      if (!canOverrideTimeout) return existing
    }

    const base = existing ?? createOrUpdateIntentPending({
      intentType: params.intentType,
      subjectId: params.subjectId,
      command: params.command,
      gpio: params.gpio,
      summary: params.summary,
      correlationId: params.correlationId,
      requestId: params.requestId,
    })

    const next: IntentRecord = {
      ...base,
      state: toTerminalState(params.outcome),
      terminalOutcome: params.outcome,
      terminalAt: ts,
      terminalSource: params.source,
      updatedAt: ts,
      correlationId: params.correlationId ?? base.correlationId,
      requestId: params.requestId ?? base.requestId,
      command: params.command ?? base.command,
      gpio: params.gpio ?? base.gpio,
      summary: params.summary ?? base.summary,
      issuedBy: params.issuedBy ?? base.issuedBy,
    }

    saveIntent(next)
    return next
  }

  function appendNonTerminalHint(
    intentType: IntentType,
    subjectId: string,
    hint: string,
    correlationId?: string,
  ): void {
    const intent = findIntent(intentType, subjectId, correlationId)
    if (!intent || isTerminalState(intent.state)) return
    const trimmed = hint.trim()
    if (!trimmed) return
    if (intent.nonTerminalHints[intent.nonTerminalHints.length - 1] === trimmed) return
    intent.nonTerminalHints.push(trimmed)
    intent.updatedAt = nowMs()
    saveIntent(intent)
  }

  function isIntentTerminal(intentType: IntentType, subjectId: string, correlationId?: string): boolean {
    const intent = findIntent(intentType, subjectId, correlationId)
    return !!intent && isTerminalState(intent.state)
  }

  function notifyContractIssue(context: ContractIssueContext): void {
    const toast = useToast()
    const correlationPart = context.correlationId ? ` Korrelation: ${context.correlationId}.` : ''
    toast.error(
      `Integrationsstoerung (${context.eventType}): ${context.details}.${correlationPart} ${CONTRACT_OPERATOR_ACTION}.`,
      { persistent: true }
    )
    logger.error(`Contract mismatch in ${context.eventType}: ${context.details}`, { correlation_id: context.correlationId })
  }

  function parseActuatorTimestampMs(raw: unknown): number | null {
    if (typeof raw !== 'number' || Number.isNaN(raw)) return null
    // Server may forward ESP "ts" (seconds epoch OR relative uptime in seconds/ms).
    // Stale-guard must only compare absolute epoch timestamps.
    if (raw >= 1_000_000_000_000) return raw // epoch milliseconds
    if (raw >= 1_000_000_000) return raw * 1000 // epoch seconds
    // Smaller values are treated as relative uptime and are not comparable to Date.now().
    return null
  }

  function normalizeActuatorState(raw: unknown): string {
    if (typeof raw === 'boolean') return raw ? 'on' : 'off'
    if (typeof raw !== 'string') return ''
    return raw.trim().toLowerCase()
  }

  function recordActuatorSnapshot(
    espId: string,
    gpio: number,
    applyDevicePatch: ApplyDevicePatch,
  ): void {
    const key = `${espId}:${gpio}`
    applyDevicePatch(espId, (device) => {
      if (!device?.actuators) return device
      const actuator = (device.actuators as unknown as Array<Record<string, unknown>>)
        .find((entry) => entry.gpio === gpio)
      if (!actuator) return device
      if (!pendingActuatorSnapshots.has(key)) {
        pendingActuatorSnapshots.set(key, {
          state: actuator.state,
          pwmValue: actuator.pwm_value,
        })
      }
      return device
    })
  }

  function applyOptimisticActuatorState(
    espId: string,
    gpio: number,
    command: string,
    rawValue: unknown,
    applyDevicePatch: ApplyDevicePatch,
  ): void {
    const normalizedCommand = command.trim().toUpperCase()
    const numericValue = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null
    applyDevicePatch(espId, (device) => {
      if (!device?.actuators) return device
      const actuators = (device.actuators as unknown as Array<Record<string, unknown>>)
        .map((entry) => ({ ...entry }))
      const actuator = actuators.find((entry) => entry.gpio === gpio)
      if (!actuator) return device

      if (normalizedCommand === 'ON') {
        actuator.state = true
      } else if (normalizedCommand === 'OFF') {
        actuator.state = false
        actuator.pwm_value = 0
      } else if (normalizedCommand === 'PWM') {
        actuator.state = true
        if (numericValue !== null) actuator.pwm_value = numericValue
      } else if (normalizedCommand === 'TOGGLE') {
        actuator.state = !(actuator.state === true)
      }

      return { ...device, actuators: actuators as unknown as ESPDevice['actuators'] }
    })
  }

  function restoreActuatorSnapshot(
    espId: string,
    gpio: number,
    applyDevicePatch?: ApplyDevicePatch,
  ): void {
    const key = `${espId}:${gpio}`
    const snapshot = pendingActuatorSnapshots.get(key)
    if (!snapshot) return
    pendingActuatorSnapshots.delete(key)
    if (!applyDevicePatch) return

    applyDevicePatch(espId, (device) => {
      if (!device?.actuators) return device
      const actuators = (device.actuators as unknown as Array<Record<string, unknown>>)
        .map((entry) => ({ ...entry }))
      const actuator = actuators.find((entry) => entry.gpio === gpio)
      if (!actuator) return device
      actuator.state = snapshot.state
      actuator.pwm_value = snapshot.pwmValue
      return { ...device, actuators: actuators as unknown as ESPDevice['actuators'] }
    })
  }

  function clearActuatorSnapshot(espId: string, gpio: number): void {
    pendingActuatorSnapshots.delete(`${espId}:${gpio}`)
  }

  function scheduleActuatorTimeout(
    espId: string,
    gpio: number,
    command: string,
    deviceName: string,
    applyDevicePatch?: ApplyDevicePatch,
    correlationId?: string,
    requestId?: string,
    issuedBy?: string,
  ): void {
    const key = `${espId}:${gpio}`
    const existing = pendingCommands.get(key)
    if (existing) clearTimeout(existing)

    const timeoutId = setTimeout(() => {
      pendingCommands.delete(key)
      restoreActuatorSnapshot(espId, gpio, applyDevicePatch)
      const subjectId = `${espId}:${gpio}`
      if (isIntentTerminal('actuator', subjectId, correlationId)) return

      finalizeIntent({
        intentType: 'actuator',
        subjectId,
        gpio,
        command,
        correlationId,
        requestId,
        issuedBy,
        outcome: 'timeout',
        source: 'actuator_timeout',
        summary: `Timeout: Keine terminale Rueckmeldung für "${command}" (${formatIssuedBy(issuedBy)}) innerhalb ${Math.round(ACTUATOR_RESPONSE_TIMEOUT_MS / 1000)}s`,
      })
      appendNonTerminalHint('actuator', subjectId, `Timeout: Keine Bestätigung für "${command}"`, correlationId)

      const toast = useToast()
      if (!canEmitTerminalToast(correlationId)) {
        logger.debug('Suppress duplicate terminal timeout toast for correlation_id', {
          subject_id: subjectId,
          correlation_id: correlationId,
          request_id: requestId,
        })
        return
      }
      toast.error(
        `${deviceName} GPIO ${gpio}: Timeout - keine terminale Rueckmeldung für "${command}" (Quelle: ${formatIssuedBy(issuedBy)})${buildHandleSuffix(correlationId, requestId)}`,
        {
          persistent: true,
          dedupeKey: buildActuatorTerminalToastKey(subjectId, correlationId, requestId),
        }
      )
    }, ACTUATOR_RESPONSE_TIMEOUT_MS)

    pendingCommands.set(key, timeoutId)
  }

  function getConfigTimeoutKeys(subjectId: string, correlationId?: string, requestId?: string): string[] {
    const keys = [`subject:${subjectId}`]
    if (correlationId) keys.push(`correlation:${correlationId}`)
    if (requestId) keys.push(`request:${requestId}`)
    return keys
  }

  function clearConfigTimeout(subjectId: string, correlationId?: string, requestId?: string): void {
    const keys = getConfigTimeoutKeys(subjectId, correlationId, requestId)
    const handles = new Set<ReturnType<typeof setTimeout>>()
    for (const key of keys) {
      const handle = pendingConfigTimeouts.get(key)
      if (handle) handles.add(handle)
      pendingConfigTimeouts.delete(key)
    }
    for (const handle of handles) clearTimeout(handle)
  }

  function scheduleConfigTimeout(
    subjectId: string,
    summary: string,
    correlationId?: string,
    requestId?: string,
    timeoutMs: number = CONFIG_RESPONSE_TIMEOUT_MS,
  ): void {
    clearConfigTimeout(subjectId, correlationId, requestId)
    const keys = getConfigTimeoutKeys(subjectId, correlationId, requestId)
    const timeoutId = setTimeout(() => {
      for (const key of keys) pendingConfigTimeouts.delete(key)
      if (isIntentTerminal('config', subjectId, correlationId)) return
      finalizeIntent({
        intentType: 'config',
        subjectId,
        summary: `Timeout: ${summary} ohne terminale Antwort innerhalb ${Math.round(timeoutMs / 1000)}s`,
        correlationId,
        requestId,
        outcome: 'timeout',
        source: 'config_timeout',
      })
      logger.info('config_pending_over_timeout', {
        subject_id: subjectId,
        correlation_id: correlationId,
        request_id: requestId,
        timeout_ms: timeoutMs,
        summary,
      })
      const toast = useToast()
      toast.warning(
        `Konfigurationsauftrag ausstehend: ${summary}${buildHandleSuffix(correlationId, requestId)}. Gerät hat noch nicht terminal geantwortet.`,
        {
          persistent: false,
          dedupeKey: `config-timeout:${correlationId ?? requestId ?? subjectId}`,
        },
      )
    }, timeoutMs)
    for (const key of keys) pendingConfigTimeouts.set(key, timeoutId)
  }

  // =========================================================================
  // Actuator Alert Handler
  // =========================================================================

  /**
   * Handle actuator_alert WebSocket event.
   * Updates actuator emergency state on alerts.
   * Server: actuator_alert_handler.py
   */
  function handleActuatorAlert(
    message: { data: Record<string, unknown> },
    applyDevicePatch: ApplyDevicePatch,
    getDeviceIds: () => string[],
  ): void {
    const data = message.data
    const espId = data.esp_id as string || data.device_id as string
    const gpio = data.gpio as number | undefined
    const alertType = data.alert_type as string

    if (!espId) {
      logger.warn('actuator_alert missing esp_id')
      return
    }

    const isEmergencyAlert = alertType === 'emergency_stop' || alertType === 'runtime_protection' || alertType === 'safety_violation'

    const targetIds = espId === 'ALL' ? getDeviceIds() : [espId]

    for (const targetId of targetIds) {
      applyDevicePatch(targetId, (device) => {
        if (!device?.actuators) return device
        const actuators = (device.actuators as unknown as Array<Record<string, unknown>>)
          .map((act) => ({ ...act }))

        if (gpio === undefined) {
          if (isEmergencyAlert) {
            for (const act of actuators) {
              act.emergency_stopped = true
              act.state = false
            }
          }
        } else {
          const actuator = actuators.find(a => a.gpio === gpio)
          if (!actuator) return device
          if (isEmergencyAlert) {
            actuator.emergency_stopped = true
            actuator.state = false
          }
        }

        return { ...device, actuators: actuators as unknown as ESPDevice['actuators'] }
      })
    }

    logger.info(`Actuator alert: ${espId} GPIO ${gpio ?? 'ALL'} - ${alertType}`)
  }

  // =========================================================================
  // Actuator Status Handler
  // =========================================================================

  /**
   * Handle actuator_status WebSocket event.
   * Updates actuator state in corresponding device for live updates.
   * Server: actuator_handler.py
   */
  function handleActuatorStatus(
    message: ActuatorStatusMessage,
    applyDevicePatch: ApplyDevicePatch,
  ): void {
    const data = message.data
    const espId = data.esp_id || data.device_id
    const gpio = data.gpio

    if (!espId || gpio === undefined) return

    applyDevicePatch(espId, (device) => {
      if (!device?.actuators) return device

      const statusTsMs = parseActuatorTimestampMs(data.timestamp)
      const staleGuardKey = `${espId}:${gpio}`
      const resetEpochMs = actuatorResetEpochMsByKey.get(staleGuardKey)
      if (resetEpochMs !== undefined && statusTsMs !== null && statusTsMs < resetEpochMs) {
        logger.warn('Ignoring stale actuator_status after offline reset', {
          esp_id: espId,
          gpio,
          status_ts_ms: statusTsMs,
          reset_epoch_ms: resetEpochMs,
        })
        return device
      }

      const actuators = (device.actuators as unknown as Array<Record<string, unknown>>).map((actuator) => ({ ...actuator }))
      const actuator = actuators.find(a => a.gpio === gpio)
      if (!actuator) return device

      // Map server payload → frontend MockActuator
      // Server: state="on"|"off"|"pwm" → Frontend: state=boolean
      const normalizedState = normalizeActuatorState(data.state)
      if (normalizedState) {
        actuator.state = normalizedState === 'on' || normalizedState === 'pwm'
      }
      if (data.value !== undefined) actuator.pwm_value = data.value
      if (data.emergency !== undefined) {
        actuator.emergency_stopped = data.emergency !== 'normal'
      }
      if (data.hardware_type !== undefined) {
        actuator.hardware_type = data.hardware_type
      }
      if (typeof data.command_source === 'string' && data.command_source.trim().length > 0) {
        actuator.last_command_source = data.command_source.trim()
      }
      actuator.last_command_at = statusTsMs !== null
        ? new Date(statusTsMs).toISOString()
        : new Date().toISOString()

      return { ...device, actuators: actuators as unknown as ESPDevice['actuators'] }
    })

    const subjectId = `${espId}:${gpio}`
    const correlationId = extractCorrelationId(message.data as unknown as Record<string, unknown>)
    const pendingIntent = findIntent('actuator', subjectId, correlationId)
    if (!pendingIntent || isTerminalState(pendingIntent.state) || !pendingIntent.command) return

    const normalizedState = normalizeActuatorState(data.state)
    const numericValue = typeof data.value === 'number' ? data.value : Number(data.value)
    const hasNumericValue = Number.isFinite(numericValue)
    const isOnLike = normalizedState === 'on' || normalizedState === 'pwm'
    const isOffLike = normalizedState === 'off' || normalizedState === 'idle' || (!isOnLike && (!hasNumericValue || numericValue <= 0))
    const isPwmLike = normalizedState === 'pwm' || (isOnLike && hasNumericValue && numericValue > 0)

    const command = pendingIntent.command.toUpperCase()
    const commandSatisfied =
      command === 'ON'
        ? isOnLike
        : command === 'OFF'
          ? isOffLike
          : command === 'PWM'
            ? isPwmLike
            : command === 'TOGGLE'
              ? normalizedState.length > 0
              : false

    if (!commandSatisfied) return

    const timeoutKey = `${espId}:${gpio}`
    const pendingTimeout = pendingCommands.get(timeoutKey)
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingCommands.delete(timeoutKey)
    }
    clearActuatorSnapshot(espId, gpio)

    const terminal = finalizeIntent({
      intentType: 'actuator',
      subjectId,
      gpio,
      command,
      issuedBy: pendingIntent.issuedBy,
      outcome: 'success',
      source: 'actuator_status',
      correlationId,
      requestId: pendingIntent.requestId,
    })
    if (terminal.state !== 'terminal_success') return

    if (!canEmitTerminalToast(correlationId)) {
      logger.debug('Suppress duplicate terminal actuator_status toast for correlation_id', {
        subject_id: subjectId,
        correlation_id: correlationId,
        request_id: pendingIntent.requestId,
      })
      return
    }
    const toast = useToast()
    toast.success(
      `${espId} GPIO ${gpio}: ${command} durch Status bestaetigt (Quelle: ${formatIssuedBy(pendingIntent.issuedBy)})${buildHandleSuffix(correlationId, pendingIntent.requestId)}`,
      { dedupeKey: buildActuatorTerminalToastKey(subjectId, correlationId, pendingIntent.requestId) },
    )
  }

  // =========================================================================
  // Actuator Response Handler (ESP confirmed command)
  // =========================================================================

  /**
   * Handle actuator_response WebSocket event.
   * ESP confirmed or rejected a command.
   */
  function handleActuatorResponse(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    applyDevicePatch?: ApplyDevicePatch,
  ): void {
    const data = message.data
    const correlationId = extractCorrelationId(data)
    const requestId = extractRequestId(data)
    const contractCheck = validateContractEvent('actuator_response', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'actuator_response',
        details: contractCheck.reason,
        correlationId,
      })
      return
    }
    const espId = (data.esp_id as string) || (data.device_id as string)
    const gpio = data.gpio as number
    const success = data.success as boolean
    const command = data.command as string
    const errorCode = data.error_code as number | undefined
    const msg = normalizeActuatorFailureMessage(data.message as string | undefined, command)
    const subjectId = `${espId}:${gpio}`
    const existingIntent = findIntent('actuator', subjectId, correlationId)
    const issuedBy = (typeof data.issued_by === 'string' && data.issued_by.trim().length > 0)
      ? data.issued_by.trim()
      : existingIntent?.issuedBy

    if (
      existingIntent &&
      isTerminalState(existingIntent.state) &&
      !(success && existingIntent.state === 'terminal_timeout')
    ) {
      logger.debug('Ignore duplicate terminal actuator_response', { esp_id: espId, gpio, correlation_id: correlationId })
      return
    }

    // Cancel pending timeout for this actuator
    const key = `${espId}:${gpio}`
    const pending = pendingCommands.get(key)
    if (pending) {
      clearTimeout(pending)
      pendingCommands.delete(key)
    }

    const toast = useToast()
    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId

    if (success) {
      clearActuatorSnapshot(espId, gpio)
      const hadActuatorTimeout = existingIntent?.state === 'terminal_timeout'
      finalizeIntent({
        intentType: 'actuator',
        subjectId,
        gpio,
        command,
        issuedBy,
        outcome: 'success',
        source: 'actuator_response',
        correlationId,
        requestId,
        allowTimeoutOverride: true,
      })
      const normalizedCorrelation = typeof correlationId === 'string' ? correlationId.trim() : ''
      if (hadActuatorTimeout && normalizedCorrelation) {
        terminalToastCorrelations.delete(normalizedCorrelation)
      }
      if (!canEmitTerminalToast(correlationId)) {
        logger.debug('Suppress duplicate terminal actuator_response success toast for correlation_id', {
          subject_id: subjectId,
          correlation_id: correlationId,
          request_id: requestId,
        })
        return
      }
      toast.success(
        `${deviceName} GPIO ${gpio}: ${command} bestaetigt (Quelle: ${formatIssuedBy(issuedBy)})${buildHandleSuffix(correlationId, requestId)}`,
        { dedupeKey: buildActuatorTerminalToastKey(subjectId, correlationId, requestId) },
      )
    } else {
      restoreActuatorSnapshot(espId, gpio, applyDevicePatch)
      finalizeIntent({
        intentType: 'actuator',
        subjectId,
        gpio,
        command,
        issuedBy,
        outcome: errorCode || msg ? 'failed' : 'integration_issue',
        source: 'actuator_response',
        correlationId,
        requestId,
      })
      if (!canEmitTerminalToast(correlationId)) {
        logger.debug('Suppress duplicate terminal actuator_response failed toast for correlation_id', {
          subject_id: subjectId,
          correlation_id: correlationId,
          request_id: requestId,
        })
        return
      }
      toast.error(
        `${deviceName} GPIO ${gpio}: Befehl fehlgeschlagen (Quelle: ${formatIssuedBy(issuedBy)})${errorCode ? ` (${errorCode})` : ''}${msg ? ` - ${msg}` : ''}${!errorCode && !msg ? ` - ${CONTRACT_OPERATOR_ACTION}` : ''}${buildHandleSuffix(correlationId, requestId)}`,
        {
          persistent: true,
          dedupeKey: buildActuatorTerminalToastKey(subjectId, correlationId, requestId),
        }
      )
    }
  }

  // =========================================================================
  // Actuator Command Lifecycle Handlers
  // =========================================================================

  /**
   * Handle actuator_command WebSocket event.
   * Registers a pending timeout — no toast here.
   * Toast is only shown on actuator_response (confirmed/failed) or timeout.
   */
  function handleActuatorCommand(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    applyDevicePatch?: ApplyDevicePatch,
  ): void {
    const data = message.data
    const correlationId = extractCorrelationId(data)
    const requestId = extractRequestId(data)
    const contractCheck = validateContractEvent('actuator_command', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'actuator_command',
        details: contractCheck.reason,
        correlationId,
      })
      return
    }
    const espId = data.esp_id as string
    const gpio = data.gpio as number
    const command = data.command as string
    const commandValue = data.value
    const issuedBy = (typeof data.issued_by === 'string' && data.issued_by.trim().length > 0)
      ? data.issued_by.trim()
      : undefined

    createOrUpdateIntentPending({
      intentType: 'actuator',
      subjectId: `${espId}:${gpio}`,
      gpio,
      command,
      correlationId,
      requestId,
      issuedBy,
    })

    if (applyDevicePatch) {
      recordActuatorSnapshot(espId, gpio, applyDevicePatch)
      applyOptimisticActuatorState(espId, gpio, command, commandValue, applyDevicePatch)
    }

    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId
    const toast = useToast()
    toast.info(`Befehl in Bearbeitung: ${deviceName} GPIO ${gpio} (${command}, Quelle: ${formatIssuedBy(issuedBy)})${buildHandleSuffix(correlationId, requestId)}`, {
      dedupeKey: `actuator-accepted:${espId}:${gpio}:${correlationId ?? requestId ?? command}`,
    })

    scheduleActuatorTimeout(espId, gpio, command, deviceName, applyDevicePatch, correlationId, requestId, issuedBy)
  }

  /**
   * Handle actuator_command_failed WebSocket event.
   * Notifies that a command could NOT be sent to ESP (MQTT/safety failure).
   */
  function handleActuatorCommandFailed(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    applyDevicePatch?: ApplyDevicePatch,
  ): void {
    const data = message.data
    const correlationId = extractCorrelationId(data)
    const requestId = extractRequestId(data)
    const contractCheck = validateContractEvent('actuator_command_failed', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'actuator_command_failed',
        details: contractCheck.reason,
        correlationId,
      })
      return
    }
    const espId = data.esp_id as string
    const gpio = data.gpio as number
    const command = data.command as string
    const error = normalizeActuatorFailureMessage(data.error as string, command) ?? 'Unbekannter Fehler'
    const subjectId = `${espId}:${gpio}`
    const existingIntent = findIntent('actuator', subjectId, correlationId)
    const issuedBy = (typeof data.issued_by === 'string' && data.issued_by.trim().length > 0)
      ? data.issued_by.trim()
      : existingIntent?.issuedBy

    if (isIntentTerminal('actuator', subjectId, correlationId)) {
      logger.debug('Ignore duplicate terminal actuator_command_failed', { esp_id: espId, gpio, correlation_id: correlationId })
      return
    }

    restoreActuatorSnapshot(espId, gpio, applyDevicePatch)

    finalizeIntent({
      intentType: 'actuator',
      subjectId,
      gpio,
      command,
      issuedBy,
      outcome: error === 'Unbekannter Fehler' ? 'integration_issue' : 'failed',
      source: 'actuator_command_failed',
      correlationId,
      requestId,
    })

    if (!canEmitTerminalToast(correlationId)) {
      logger.debug('Suppress duplicate terminal actuator_command_failed toast for correlation_id', {
        subject_id: subjectId,
        correlation_id: correlationId,
        request_id: requestId,
      })
      return
    }
    const toast = useToast()
    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId
    toast.error(
      `${deviceName} GPIO ${gpio}: Befehl fehlgeschlagen (Quelle: ${formatIssuedBy(issuedBy)}) - ${error}${error === 'Unbekannter Fehler' ? ` (${CONTRACT_OPERATOR_ACTION})` : ''}${buildHandleSuffix(correlationId, requestId)}`,
      {
        persistent: true,
        dedupeKey: buildActuatorTerminalToastKey(subjectId, correlationId, requestId),
      }
    )
  }

  // =========================================================================
  // Config Handlers (Configuration Lifecycle)
  // =========================================================================

  function handleConfigPublished(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const correlationId = extractCorrelationId(data)
    const requestId = extractRequestId(data)
    const contractCheck = validateContractEvent('config_published', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'config_published',
        details: contractCheck.reason,
        correlationId,
      })
      return
    }

    const espId = data.esp_id as string
    const queued = data.queued === true
    const deviceStatus = typeof data.device_status === 'string' ? data.device_status : undefined
    const reasonCode = typeof data.reason_code === 'string' ? data.reason_code : undefined
    const generation = typeof data.generation === 'number' ? data.generation : undefined
    const keys = Array.isArray(data.config_keys)
      ? (data.config_keys as unknown[]).map((key) => String(key))
      : []
    const summaryBase = keys.length > 0 ? `Config gesendet: ${keys.join(', ')}` : 'Config gesendet'
    const summaryMeta = `${reasonCode ? ` | Grund=${reasonCode}` : ''}${generation ? ` | Gen=${generation}` : ''}`
    const summary = `${summaryBase}${summaryMeta}`
    const subjectId = correlationId || requestId || `${espId}:${keys.sort().join(',') || 'all'}`

    createOrUpdateIntentPending({
      intentType: 'config',
      subjectId,
      summary,
      correlationId,
      requestId,
    })
    if (queued) {
      appendNonTerminalHint(
        'config',
        subjectId,
        `Config im Broker gequeued (Gerätestatus: ${deviceStatus ?? 'offline'})`,
        correlationId,
      )
      const toast = useToast()
      toast.info(
        `Konfigurationsauftrag gequeued: ${summary}${buildHandleSuffix(correlationId, requestId)} (Gerätestatus: ${deviceStatus ?? 'offline'})`,
        {
          dedupeKey: `config-queued:${correlationId ?? requestId ?? subjectId}`,
        },
      )
      return
    }
    const timeoutMs = keys.includes('offline_rules')
      ? CONFIG_RESPONSE_TIMEOUT_WITH_OFFLINE_RULES_MS
      : CONFIG_RESPONSE_TIMEOUT_MS
    scheduleConfigTimeout(subjectId, summary, correlationId, requestId, timeoutMs)
  }

  function handleConfigResponse(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const correlationId = extractCorrelationId(data)
    const requestId = extractRequestId(data)
    const status = String(data.status || '').toLowerCase()
    const reasonCode = typeof data.reason_code === 'string' ? data.reason_code : undefined
    const generation = typeof data.generation === 'number' ? data.generation : undefined
    const contractCheck = validateContractEvent('config_response', data)
    if (contractCheck.kind !== 'ok') {
      // If terminal success arrives without strict contract shape, avoid false
      // operator errors; we cannot finalize deterministically without IDs anyway.
      if (status === 'success' || status === 'partial_success') {
        logger.warn('Ignore non-finalizable successful config_response shape', {
          reason: contractCheck.reason,
          correlation_id: correlationId,
          request_id: requestId,
          data,
        })
        return
      }
      notifyContractIssue({
        eventType: 'config_response',
        details: contractCheck.reason,
        correlationId,
      })
      return
    }

    const summary = `Config Antwort: ${status || 'unbekannt'}${reasonCode ? ` | Grund=${reasonCode}` : ''}${generation ? ` | Gen=${generation}` : ''}`
    if (!correlationId) {
      notifyContractIssue({
        eventType: 'config_response',
        details: 'config_response ohne correlation_id ist nicht finalisierbar',
      })
      return
    }
    const existing = findIntentByCorrelation('config', correlationId)
      ?? (requestId ? findIntentByRequest('config', requestId) : undefined)
    if (!existing) {
      if (status === 'success' || status === 'partial_success') {
        logger.info('Late config_response without tracked intent ignored (already resolved or missed start event)', {
          correlation_id: correlationId,
          request_id: requestId,
          status,
        })
        return
      }
      notifyContractIssue({
        eventType: 'config_response',
        details: `Kein passendes Config-Intent für correlation_id "${correlationId}"${requestId ? ` oder request_id "${requestId}"` : ''}`,
        correlationId,
      })
      return
    }
    const effectiveCorrelationId = existing.correlationId ?? correlationId
    if (!findIntentByCorrelation('config', correlationId) && requestId && existing.requestId === requestId) {
      logger.warn('config_response correlation mismatch recovered via request_id fallback', {
        ws_correlation_id: correlationId,
        intent_correlation_id: existing.correlationId,
        request_id: requestId,
        subject_id: existing.subjectId,
      })
    }
    const subjectId = existing.subjectId

    const existingTerminal = findIntent('config', subjectId, effectiveCorrelationId)
    if (existingTerminal && isTerminalState(existingTerminal.state) && existingTerminal.state !== 'terminal_timeout') return
    clearConfigTimeout(subjectId, effectiveCorrelationId, requestId)

    finalizeIntent({
      intentType: 'config',
      subjectId,
      summary,
      correlationId: effectiveCorrelationId,
      requestId,
      outcome: status === 'success' ? 'success' : status === 'failed' || status === 'partial_success' ? 'failed' : 'integration_issue',
      source: 'config_response',
      allowTimeoutOverride: true,
    })
  }

  /**
   * Handle config_response_guard_replay WebSocket event (PKG-04b, INC-2026-04-20).
   * Fired by server Terminal Authority Guard when a duplicate/stale config_response
   * is detected but a frontend client may have missed the original (reconnect window).
   * Lookup: correlation_id -> request_id fallback (3-step same as handleConfigResponse).
   * Timeout-Shortcut: clears pending config timeout immediately.
   */
  function handleConfigResponseGuardReplay(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const correlationId = extractCorrelationId(data)
    const requestId = extractRequestId(data)
    const status = String(data.status || '').toLowerCase()
    const correlationIdSource = data.correlation_id_source as string | undefined

    if (!correlationId) {
      logger.warn('config_response_guard_replay without correlation_id - not finalizable', {
        correlation_id_source: correlationIdSource,
        request_id: requestId,
      })
      return
    }

    const existing = findIntentByCorrelation('config', correlationId)
      ?? (requestId ? findIntentByRequest('config', requestId) : undefined)

    if (!existing) {
      logger.info('config_response_guard_replay: no tracked intent - already resolved or never started', {
        correlation_id: correlationId,
        request_id: requestId,
        status,
        correlation_id_source: correlationIdSource,
      })
      return
    }

    const effectiveCorrelationId = existing.correlationId ?? correlationId
    const subjectId = existing.subjectId

    // Timeout-Shortcut: clear pending timeout immediately (guard replay = terminal authority)
    clearConfigTimeout(subjectId, effectiveCorrelationId, requestId)

    finalizeIntent({
      intentType: 'config',
      subjectId,
      summary: `Config Guard-Replay: ${status || 'unbekannt'}`,
      correlationId: effectiveCorrelationId,
      requestId,
      outcome: status === 'success' ? 'success'
             : status === 'failed' || status === 'partial_success' ? 'failed'
             : 'integration_issue',
      source: 'config_response',  // intentional: same finality-source, no terminalSource-Union extension needed
      allowTimeoutOverride: true,
    })
  }

  function handleConfigFailed(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const correlationId = extractCorrelationId(data)
    const requestId = extractRequestId(data)
    const reasonCode = typeof data.reason_code === 'string' ? data.reason_code : undefined
    const generation = typeof data.generation === 'number' ? data.generation : undefined
    const contractCheck = validateContractEvent('config_failed', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'config_failed',
        details: contractCheck.reason,
        correlationId,
      })
      return
    }

    const error = String(data.error || 'Unbekannter Fehler')
    if (!correlationId) {
      notifyContractIssue({
        eventType: 'config_failed',
        details: 'config_failed ohne correlation_id ist nicht finalisierbar',
      })
      return
    }
    const existing = findIntentByCorrelation('config', correlationId)
      ?? (requestId ? findIntentByRequest('config', requestId) : undefined)
    if (!existing) {
      notifyContractIssue({
        eventType: 'config_failed',
        details: `Kein passendes Config-Intent für correlation_id "${correlationId}"${requestId ? ` oder request_id "${requestId}"` : ''}`,
        correlationId,
      })
      return
    }
    const effectiveCorrelationId = existing.correlationId ?? correlationId
    if (!findIntentByCorrelation('config', correlationId) && requestId && existing.requestId === requestId) {
      logger.warn('config_failed correlation mismatch recovered via request_id fallback', {
        ws_correlation_id: correlationId,
        intent_correlation_id: existing.correlationId,
        request_id: requestId,
        subject_id: existing.subjectId,
      })
    }
    const subjectId = existing.subjectId

    const existingTerminal = findIntent('config', subjectId, effectiveCorrelationId)
    if (existingTerminal && isTerminalState(existingTerminal.state) && existingTerminal.state !== 'terminal_timeout') return
    clearConfigTimeout(subjectId, effectiveCorrelationId, requestId)

    finalizeIntent({
      intentType: 'config',
      subjectId,
      summary: `Config fehlgeschlagen: ${error}${reasonCode ? ` | Grund=${reasonCode}` : ''}${generation ? ` | Gen=${generation}` : ''}`,
      correlationId: effectiveCorrelationId,
      requestId,
      outcome: error === 'Unbekannter Fehler' ? 'integration_issue' : 'failed',
      source: 'config_failed',
      allowTimeoutOverride: true,
    })
  }

  // =========================================================================
  // Sequence Handlers (Automation Sequences)
  // =========================================================================

  /** Handle sequence_started WebSocket event */
  function handleSequenceStarted(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const contractCheck = validateContractEvent('sequence_started', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'sequence_started',
        details: contractCheck.reason,
      })
      return
    }
    const sequenceId = data.sequence_id as string
    const name = data.rule_name as string || data.description as string || `Sequenz ${data.sequence_id}`
    createOrUpdateIntentPending({
      intentType: 'sequence',
      subjectId: sequenceId,
      summary: `Sequenz gestartet: ${name}`,
      preserveCreated: true,
    })
    appendNonTerminalHint('sequence', sequenceId, 'Sequenz in Bearbeitung')
    const toast = useToast()
    toast.info(`Sequenz gestartet: ${name}`)
  }

  /** Handle sequence_step WebSocket event (no toast - too frequent) */
  function handleSequenceStep(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const contractCheck = validateContractEvent('sequence_step', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'sequence_step',
        details: contractCheck.reason,
      })
      return
    }
    const sequenceId = data.sequence_id as string
    const step = data.step as number
    const total = data.total_steps as number | undefined
    appendNonTerminalHint('sequence', sequenceId, total ? `Schritt ${step}/${total}` : `Schritt ${step}`)
  }

  /** Handle sequence_completed WebSocket event */
  function handleSequenceCompleted(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const contractCheck = validateContractEvent('sequence_completed', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'sequence_completed',
        details: contractCheck.reason,
      })
      return
    }
    const sequenceId = data.sequence_id as string
    const success = data.success as boolean
    const toast = useToast()

    if (isIntentTerminal('sequence', sequenceId)) return

    finalizeIntent({
      intentType: 'sequence',
      subjectId: sequenceId,
      summary: success ? 'Sequenz abgeschlossen' : 'Sequenz fehlgeschlagen',
      outcome: success ? 'success' : 'failed',
      source: 'sequence_completed',
    })

    if (success) {
      toast.success('Sequenz erfolgreich abgeschlossen')
    } else {
      const error = data.error as string || 'Unbekannter Fehler'
      toast.error(`Sequenz fehlgeschlagen: ${error}`, { persistent: true })
    }
  }

  /** Handle sequence_error WebSocket event */
  function handleSequenceError(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const contractCheck = validateContractEvent('sequence_error', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'sequence_error',
        details: contractCheck.reason,
      })
      return
    }
    const sequenceId = data.sequence_id as string
    const msg = data.message as string || 'Unbekannter Sequenz-Fehler'
    if (isIntentTerminal('sequence', sequenceId)) return
    finalizeIntent({
      intentType: 'sequence',
      subjectId: sequenceId,
      summary: `Sequenz-Fehler: ${msg}`,
      outcome: 'failed',
      source: 'sequence_error',
    })
    const toast = useToast()
    toast.error(`Sequenz-Fehler: ${msg}`, { persistent: true })
  }

  /** Handle sequence_cancelled WebSocket event */
  function handleSequenceCancelled(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const contractCheck = validateContractEvent('sequence_cancelled', data)
    if (contractCheck.kind !== 'ok') {
      notifyContractIssue({
        eventType: 'sequence_cancelled',
        details: contractCheck.reason,
      })
      return
    }
    const sequenceId = data.sequence_id as string
    const reason = data.reason as string
    if (isIntentTerminal('sequence', sequenceId)) return
    finalizeIntent({
      intentType: 'sequence',
      subjectId: sequenceId,
      summary: reason ? `Sequenz abgebrochen: ${reason}` : 'Sequenz abgebrochen',
      outcome: 'failed',
      source: 'sequence_cancelled',
    })
    const toast = useToast()
    toast.warning(reason ? `Sequenz abgebrochen: ${reason}` : 'Sequenz abgebrochen')
  }

  /** Cancel all pending firmware timeouts (call on view unmount to suppress stale warnings) */
  function clearPendingCommands(): void {
    pendingCommands.forEach((timeout) => clearTimeout(timeout))
    pendingCommands.clear()
    pendingActuatorSnapshots.clear()
    pendingConfigTimeouts.forEach((timeout) => clearTimeout(timeout))
    pendingConfigTimeouts.clear()
    terminalToastCorrelations.clear()
  }

  /**
   * Register intent at REST command creation boundary.
   * Sequenz: accepted -> pending -> terminal_*
   */
  function registerCommandIntent(
    espId: string,
    gpio: number,
    command: string,
    correlationId?: string,
    requestId?: string,
  ): void {
    const created = createOrUpdateIntentPending({
      intentType: 'actuator',
      subjectId: `${espId}:${gpio}`,
      gpio,
      command,
      correlationId,
      requestId,
      preserveCreated: true,
    })
    if (created.state === 'accepted') {
      created.updatedAt = nowMs()
      saveIntent(created)
    }
    scheduleActuatorTimeout(espId, gpio, command, espId, undefined, correlationId, requestId)
  }

  function registerConfigIntentFromRest(params: {
    espId: string
    scope: string
    correlationId?: string
    requestId?: string
    summary?: string
  }): string {
    const subjectId = params.correlationId || params.requestId || `rest:${params.espId}:${params.scope}:${nowMs()}`
    const summary = params.summary ?? `Konfigurationsauftrag ${params.scope} angenommen`
    const created = createOrUpdateIntentPending({
      intentType: 'config',
      subjectId,
      summary,
      correlationId: params.correlationId,
      requestId: params.requestId,
      preserveCreated: true,
    })
    if (created.state === 'accepted') {
      created.updatedAt = nowMs()
      saveIntent(created)
    }
    scheduleConfigTimeout(subjectId, summary, params.correlationId, params.requestId)
    return subjectId
  }

  function waitForIntentTerminal(params: {
    intentType: IntentType
    subjectId: string
    correlationId?: string
    timeoutMs?: number
    pollIntervalMs?: number
  }): Promise<IntentRecord | null> {
    const timeoutMs = params.timeoutMs ?? 60_000
    const pollIntervalMs = Math.max(50, params.pollIntervalMs ?? 150)
    const resolveCurrent = (): IntentRecord | undefined => {
      const current = findIntent(params.intentType, params.subjectId, params.correlationId)
      return current && isTerminalState(current.state) ? current : undefined
    }
    const immediate = resolveCurrent()
    if (immediate) return Promise.resolve(immediate)
    return new Promise((resolve) => {
      const startedAt = nowMs()
      const intervalId = setInterval(() => {
        const terminal = resolveCurrent()
        if (terminal) {
          clearInterval(intervalId)
          resolve(terminal)
          return
        }
        if (nowMs() - startedAt >= timeoutMs) {
          clearInterval(intervalId)
          resolve(null)
        }
      }, pollIntervalMs)
    })
  }

  function waitForConfigTerminal(params: {
    subjectId: string
    correlationId?: string
    timeoutMs?: number
  }): Promise<IntentRecord | null> {
    return waitForIntentTerminal({
      intentType: 'config',
      subjectId: params.subjectId,
      correlationId: params.correlationId,
      timeoutMs: params.timeoutMs,
    })
  }

  /**
   * Markiert den letzten Offline-/Reset-Zeitpunkt für einen Aktor.
   * Wenn gpio fehlt, wird die Epoch für alle Aktoren eines Geräts gesetzt.
   */
  function markActuatorResetEpoch(
    espId: string,
    epochMs: number,
    gpio?: number,
    knownGpios: number[] = [],
  ): void {
    if (!Number.isFinite(epochMs) || epochMs <= 0) return
    if (typeof gpio === 'number') {
      actuatorResetEpochMsByKey.set(`${espId}:${gpio}`, epochMs)
      return
    }
    if (knownGpios.length === 0) return
    for (const g of knownGpios) {
      actuatorResetEpochMsByKey.set(`${espId}:${g}`, epochMs)
    }
  }

  function getIntentSnapshot(): IntentRecord[] {
    return Array.from(intents.values())
  }

  /**
   * Reactive list of config intents that are still pending or timed out
   * without a definitive success/failed/integration_issue resolution.
   * UI uses this to render persistent pending-config banners.
   */
  const pendingConfigOrders = computed<IntentRecord[]>(() => {
    const result: IntentRecord[] = []
    for (const intent of intents.values()) {
      if (intent.intentType !== 'config') continue
      const s = intent.state
      if (s === 'terminal_success' || s === 'terminal_failed' || s === 'terminal_integration_issue') continue
      result.push(intent)
    }
    return result
  })

  /**
   * Look up a specific config intent by subjectId (optionally + correlationId).
   * Used by config panels to track their own pending order.
   */
  function findConfigIntentBySubject(subjectId: string, correlationId?: string): IntentRecord | undefined {
    return findIntent('config', subjectId, correlationId)
  }

  /**
   * Dismiss a timed-out config intent so the user can cleanly retry.
   * Only works on terminal_timeout intents — definitive states are immutable.
   */
  function dismissConfigTimeout(subjectId: string, correlationId?: string): boolean {
    const intent = findIntent('config', subjectId, correlationId)
    if (!intent || intent.state !== 'terminal_timeout') return false
    intents.delete(intent.key)
    return true
  }

  return {
    // WS Handlers (called by esp.store dispatcher)
    handleActuatorAlert,
    handleActuatorStatus,
    handleActuatorResponse,
    handleActuatorCommand,
    handleActuatorCommandFailed,
    handleConfigPublished,
    handleConfigResponse,
    handleConfigResponseGuardReplay,
    handleConfigFailed,
    handleSequenceStarted,
    handleSequenceStep,
    handleSequenceCompleted,
    handleSequenceError,
    handleSequenceCancelled,
    clearPendingCommands,
    registerCommandIntent,
    registerConfigIntentFromRest,
    waitForIntentTerminal,
    waitForConfigTerminal,
    markActuatorResetEpoch,
    getIntentSnapshot,
    pendingConfigOrders,
    findConfigIntentBySubject,
    dismissConfigTimeout,
  }
})
