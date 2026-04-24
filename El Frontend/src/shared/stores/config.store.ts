/**
 * Config Store
 *
 * Handles config lifecycle WebSocket events.
 * Mirrors server-side config_publisher and config_ack_handler.
 *
 * Server-centric architecture:
 * Frontend → REST (POST /esp/{id}/config) → Server → MQTT → ESP32
 * ESP32 → MQTT (kaiser/{esp_id}/config/response) → Server → WS (config_response) → this store
 * Server → WS (config_published) → this store (config sent to ESP via MQTT)
 * Server → WS (config_failed) → this store (MQTT publish failed)
 *
 * Cross-store dependency: Receives devices array from esp.store.ts via dispatcher.
 */

import { defineStore } from 'pinia'
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/logger'
import type { ESPDevice } from '@/api/esp'
import type { ConfigResponseExtended, ConfigFailure } from '@/types'

const logger = createLogger('ConfigStore')

export const useConfigStore = defineStore('config', () => {

  /**
   * Handle config_response WebSocket event.
   * Shows toast notification when ESP confirms config changes.
   *
   * Phase 4: Extended to handle partial_success and failures array
   * - Max 3 detail toasts for individual failures
   * - Additional failures logged to console
   */
  function handleConfigResponse(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    refreshGpioStatus: (espId: string) => void,
  ): void {
    const data = message.data as unknown as ConfigResponseExtended
    const toast = useToast()

    if (!data.esp_id) return

    const deviceName = devices.find(d => getDeviceId(d) === data.esp_id)?.name || data.esp_id
    const MAX_DETAIL_TOASTS = 3

    if (data.status === 'success') {
      toast.success(
        `${deviceName}: ${data.message}`,
        { duration: 4000 }
      )
      logger.info(`Config success: ${data.esp_id} - ${data.config_type} (${data.count})`)
    } else if (data.status === 'partial_success') {
      // Phase 4: Partial success - some items OK, some failed
      toast.warning(
        `${deviceName}: ${data.count} konfiguriert, ${data.failed_count || 0} fehlgeschlagen`,
        { duration: 6000 }
      )
      logger.warn(`Config partial_success: ${data.esp_id} - ${data.count} OK, ${data.failed_count} failed`)

      // Show detail toasts for individual failures (max 3)
      if (data.failures && data.failures.length > 0) {
        const toShow = data.failures.slice(0, MAX_DETAIL_TOASTS)
        toShow.forEach((failure: ConfigFailure) => {
          toast.error(
            `GPIO ${failure.gpio} (${failure.type}): ${failure.error}${failure.detail ? ` - ${failure.detail}` : ''}`,
            { duration: 8000 }
          )
        })

        // Log additional failures to console
        if (data.failures.length > MAX_DETAIL_TOASTS) {
          const remaining = data.failures.slice(MAX_DETAIL_TOASTS)
          logger.warn(`${remaining.length} additional failures (not shown in toast):`)
          remaining.forEach((failure: ConfigFailure) => {
            logger.warn(`  - GPIO ${failure.gpio} (${failure.type}): ${failure.error} - ${failure.detail || 'No details'}`)
          })
        }
      }
    } else {
      // Full error - all items failed
      toast.error(
        `${deviceName}: ${data.error_code || 'CONFIG_ERROR'} - ${data.message}`,
        { duration: 6000 }
      )
      logger.error(`Config error: ${data.esp_id} - ${data.error_code}`)

      // Phase 4: Show detail toasts for failures (max 3)
      if (data.failures && data.failures.length > 0) {
        const toShow = data.failures.slice(0, MAX_DETAIL_TOASTS)
        toShow.forEach((failure: ConfigFailure) => {
          toast.error(
            `GPIO ${failure.gpio}: ${failure.detail || failure.error}`,
            { duration: 8000 }
          )
        })

        // Log additional failures to console
        if (data.failures.length > MAX_DETAIL_TOASTS) {
          const remaining = data.failures.slice(MAX_DETAIL_TOASTS)
          logger.error(`${remaining.length} additional failures:`)
          remaining.forEach((failure: ConfigFailure) => {
            logger.error(`  - GPIO ${failure.gpio}: ${failure.error} - ${failure.detail || 'No details'}`)
          })
        }
      } else if (data.failed_item) {
        // Legacy: Single failed_item (backward compatibility)
        const item = data.failed_item
        toast.error(
          `GPIO ${item.gpio || 'N/A'}: ${item.sensor_type || item.actuator_type || 'Unknown'}`,
          { duration: 8000 }
        )
      }
    }

    // Refresh GPIO status after config change
    refreshGpioStatus(data.esp_id)
  }

  /**
   * Handle config_published WebSocket event.
   * Notifies that config was sent to ESP via MQTT.
   */
  function handleConfigPublished(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
  ): void {
    const data = message.data
    const espId = data.esp_id as string
    if (!espId) return

    const toast = useToast()
    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId
    const keys = data.config_keys as string[] | undefined
    const detail = keys?.length ? ` (${keys.join(', ')})` : ''
    const reason = typeof data.reason_code === 'string' ? data.reason_code : null
    const generation = typeof data.generation === 'number' ? data.generation : null
    const reasonDetail = reason ? ` | Grund: ${reason}` : ''
    const generationDetail = generation ? ` | Gen: ${generation}` : ''
    toast.info(`Konfiguration für ${deviceName} gesendet${detail}${reasonDetail}${generationDetail}`)
  }

  /**
   * Handle config_failed WebSocket event.
   * Notifies that config publishing failed.
   */
  function handleConfigFailed(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
  ): void {
    const data = message.data
    const espId = data.esp_id as string
    const error = data.error as string || 'Unbekannter Fehler'
    const reason = typeof data.reason_code === 'string' ? data.reason_code : null
    const generation = typeof data.generation === 'number' ? data.generation : null
    if (!espId) return

    const toast = useToast()
    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId
    const reasonDetail = reason ? ` (Grund: ${reason})` : ''
    const generationDetail = generation ? ` [Gen ${generation}]` : ''
    toast.error(
      `Konfiguration für ${deviceName} fehlgeschlagen${reasonDetail}${generationDetail}: ${error}`,
      { persistent: true }
    )
  }

  return {
    handleConfigResponse,
    handleConfigPublished,
    handleConfigFailed,
  }
})
