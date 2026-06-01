/**
 * Config push REST → UI terminalization (AUT-586).
 *
 * Server always returns correlation_id + push_status. Frontend must not wait
 * 65s for ESP ack when push_status is db_only.
 */

import type { useActuatorStore } from '@/shared/stores/actuator.store'
import type { useToast } from '@/composables/useToast'
import type { createLogger } from '@/utils/logger'

import type { ConfigPushStatus } from '@/types'

export type { ConfigPushStatus }

export interface ConfigPushFields {
  correlationId?: string
  requestId?: string
  pushStatus?: ConfigPushStatus
}

export function parseConfigPushFields(response: Record<string, unknown>): ConfigPushFields {
  const correlationId =
    typeof response.correlation_id === 'string' && response.correlation_id.trim()
      ? response.correlation_id.trim()
      : undefined
  const requestId =
    typeof response.request_id === 'string' && response.request_id.trim()
      ? response.request_id.trim()
      : undefined
  const raw = typeof response.push_status === 'string' ? response.push_status : undefined
  const pushStatus: ConfigPushStatus | undefined =
    raw === 'queued' || raw === 'published' || raw === 'db_only' ? raw : undefined
  return { correlationId, requestId, pushStatus }
}

export function configPushDbOnlyMessage(summary: string): string {
  return `${summary}: In der Datenbank gespeichert. Gerät nicht per MQTT erreicht — ESP-Bestätigung folgt nicht.`
}

export function configPushDeleteDbOnlyMessage(entityLabel: string): string {
  return `${entityLabel} entfernt (Datenbank). Gerät nicht per MQTT erreicht — Konfigurations-Push ausstehend.`
}

export function configPushDeleteQueuedMessage(entityLabel: string): string {
  return `${entityLabel} entfernt — Konfiguration wird an das Gerät gesendet`
}

type ActuatorStore = ReturnType<typeof useActuatorStore>
type Toast = ReturnType<typeof useToast>
type Logger = ReturnType<typeof createLogger>

export interface ConfigSaveAckParams {
  response: Record<string, unknown>
  espId: string
  scope: string
  summary: string
  dedupeScope: string
}

export type ConfigSaveAckResult = 'saved' | 'pending' | 'failed'

export interface ConfigSaveAckOutcome {
  result: ConfigSaveAckResult
  subjectId?: string
  correlationId?: string | null
}

/**
 * Register config intent, wait for ESP terminal event when appropriate,
 * emit toasts. Returns whether caller should emit saved / keep panel open.
 */
export async function runConfigSaveAckFlow(
  params: ConfigSaveAckParams,
  actuatorStore: ActuatorStore,
  toast: Toast,
  logger: Logger,
): Promise<ConfigSaveAckOutcome> {
  const { correlationId, requestId, pushStatus } = parseConfigPushFields(params.response)

  if (pushStatus === 'db_only') {
    const handle = correlationId ?? requestId ?? params.dedupeScope
    if (correlationId) {
      actuatorStore.registerConfigIntentFromRest({
        espId: params.espId,
        scope: params.scope,
        correlationId,
        requestId,
        summary: params.summary,
      })
    }
    toast.warning(configPushDbOnlyMessage(params.summary), {
      dedupeKey: `config-db-only:${handle}`,
    })
    return { result: 'saved', correlationId: correlationId ?? null }
  }

  const handles = [
    correlationId ? `Korrelation: ${correlationId}` : '',
    requestId ? `Request-ID: ${requestId}` : '',
  ]
    .filter(Boolean)
    .join(' | ')

  const subjectId = actuatorStore.registerConfigIntentFromRest({
    espId: params.espId,
    scope: params.scope,
    correlationId,
    requestId,
    summary: params.summary,
  })

  toast.info(
    `Konfigurationsauftrag akzeptiert: ${params.summary}.${handles ? ` ${handles}` : ''}`,
    {
      dedupeKey: `config-accepted:${correlationId ?? requestId ?? params.dedupeScope}`,
    },
  )

  const terminal = await actuatorStore.waitForConfigTerminal({
    subjectId,
    correlationId,
    timeoutMs: 65_000,
  })

  if (!terminal) {
    logger.info('config_pending_over_timeout: UI-Wartezeit abgelaufen', {
      subject_id: subjectId,
      correlation_id: correlationId,
    })
    toast.warning(
      'Konfigurationsauftrag ausstehend: Noch keine Geräte-Rückmeldung. Status wird im Panel angezeigt.',
      {
        dedupeKey: `config-await-timeout:${correlationId ?? requestId ?? subjectId}`,
      },
    )
    return { result: 'pending', subjectId, correlationId: correlationId ?? null }
  }

  if (terminal.state === 'terminal_success') {
    if (actuatorStore.canEmitTerminalToast(correlationId)) {
      toast.success('Konfiguration wurde vom Gerät bestätigt')
    }
    return { result: 'saved', subjectId, correlationId: correlationId ?? null }
  }

  if (terminal.state === 'terminal_timeout') {
    logger.info('config_pending_over_timeout: Store-Timeout erreicht', {
      subject_id: subjectId,
      correlation_id: correlationId,
    })
    toast.warning(
      'Konfigurationsauftrag ausstehend: Gerät hat nicht innerhalb der Frist geantwortet.',
      {
        dedupeKey: `config-terminal-timeout:${correlationId ?? requestId ?? subjectId}`,
      },
    )
    return { result: 'pending', subjectId, correlationId: correlationId ?? null }
  }

  toast.error('Konfiguration fehlgeschlagen. Details im Event-Monitor prüfen.', {
    persistent: true,
    dedupeKey: `config-terminal-failed:${correlationId ?? requestId ?? subjectId}`,
  })
  return { result: 'failed', subjectId, correlationId: correlationId ?? null }
}

export function notifyConfigDeletePush(
  deleted: Record<string, unknown>,
  entityLabel: string,
  dedupeKey: string,
  toast: Toast,
  actuatorStore: ActuatorStore,
  espId: string,
  scope: string,
): void {
  const { correlationId, pushStatus } = parseConfigPushFields(deleted)
  if (correlationId) {
    actuatorStore.registerConfigIntentFromRest({
      espId,
      scope,
      correlationId,
      summary: entityLabel,
    })
  }
  if (pushStatus === 'db_only') {
    toast.warning(configPushDeleteDbOnlyMessage(entityLabel), { dedupeKey })
    return
  }
  toast.info(configPushDeleteQueuedMessage(entityLabel), { dedupeKey })
}

export function notifyConfigAddPush(
  ack: Record<string, unknown>,
  label: string,
  successFallback: string,
  dedupeScope: string,
  toast: Toast,
  actuatorStore: ActuatorStore,
  espId: string,
  scope: string,
): void {
  const { correlationId, pushStatus } = parseConfigPushFields(ack)
  if (pushStatus === 'db_only') {
    toast.warning(configPushDbOnlyMessage(label), {
      dedupeKey: `config-db-only:${correlationId ?? dedupeScope}`,
    })
    return
  }
  if (correlationId) {
    actuatorStore.registerConfigIntentFromRest({
      espId,
      scope,
      correlationId,
      summary: label,
    })
    toast.info(`${label} — Konfiguration wird an das Gerät gesendet`, {
      dedupeKey: `config-accepted:${correlationId}`,
    })
    return
  }
  toast.success(successFallback)
}
