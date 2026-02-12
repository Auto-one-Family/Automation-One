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
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/logger'
import type { ESPDevice } from '@/api/esp'

const logger = createLogger('ActuatorStore')

/** Payload shape for actuator_status WebSocket events */
interface ActuatorStatusPayload {
  esp_id?: string
  device_id?: string
  gpio: number
  actuator_type?: string
  state?: string
  value?: number
  emergency?: string
  timestamp?: number
}

/** Message wrapper for actuator_status events */
interface ActuatorStatusMessage {
  data: ActuatorStatusPayload
}

export const useActuatorStore = defineStore('actuator', () => {

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
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
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

    // "ALL" means all devices affected (system-wide emergency)
    const targetDevices = espId === 'ALL'
      ? devices
      : devices.filter(d => getDeviceId(d) === espId)

    for (const device of targetDevices) {
      if (!device?.actuators) continue
      const actuators = device.actuators as { gpio: number; emergency_stopped?: boolean; state?: boolean }[]

      if (gpio === undefined) {
        if (isEmergencyAlert) {
          for (const act of actuators) {
            act.emergency_stopped = true
            act.state = false
          }
        }
      } else {
        const actuator = actuators.find(a => a.gpio === gpio)
        if (!actuator) continue
        if (isEmergencyAlert) {
          actuator.emergency_stopped = true
          actuator.state = false
        }
      }
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
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
  ): void {
    const data = message.data
    const espId = data.esp_id || data.device_id
    const gpio = data.gpio

    if (!espId || gpio === undefined) return

    const device = devices.find(d => getDeviceId(d) === espId)
    if (!device?.actuators) return

    const actuator = (device.actuators as { gpio: number; state?: boolean; pwm_value?: number; emergency_stopped?: boolean; last_command?: string }[]).find(a => a.gpio === gpio)
    if (!actuator) return

    // Map server payload → frontend MockActuator
    // Server: state="on"|"off"|"pwm" → Frontend: state=boolean
    if (data.state !== undefined) {
      actuator.state = data.state === 'on' || data.state === 'pwm'
    }
    if (data.value !== undefined) actuator.pwm_value = data.value
    if (data.emergency !== undefined) {
      actuator.emergency_stopped = data.emergency !== 'normal'
    }
    actuator.last_command = data.timestamp
      ? new Date(data.timestamp * 1000).toISOString()
      : new Date().toISOString()
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
  ): void {
    const data = message.data
    const espId = data.esp_id as string || data.device_id as string
    const gpio = data.gpio as number
    const success = data.success as boolean
    const command = data.command as string
    const errorCode = data.error_code as number | undefined
    const msg = data.message as string | undefined

    if (!espId) return

    const toast = useToast()
    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId

    if (success) {
      toast.success(`${deviceName} GPIO ${gpio}: ${command} bestätigt`)
    } else {
      toast.error(
        `${deviceName} GPIO ${gpio}: Befehl fehlgeschlagen${errorCode ? ` (${errorCode})` : ''}${msg ? ` – ${msg}` : ''}`,
        { persistent: true }
      )
    }
  }

  // =========================================================================
  // Actuator Command Lifecycle Handlers
  // =========================================================================

  /**
   * Handle actuator_command WebSocket event.
   * Notifies that a command was sent to an ESP (not yet confirmed).
   */
  function handleActuatorCommand(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
  ): void {
    const data = message.data
    const espId = data.esp_id as string
    const gpio = data.gpio as number
    const command = data.command as string
    if (!espId) return

    const toast = useToast()
    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId
    toast.info(`${deviceName} GPIO ${gpio}: ${command} gesendet`)
  }

  /**
   * Handle actuator_command_failed WebSocket event.
   * Notifies that a command could NOT be sent to ESP (MQTT/safety failure).
   */
  function handleActuatorCommandFailed(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
  ): void {
    const data = message.data
    const espId = data.esp_id as string
    const gpio = data.gpio as number
    const error = data.error as string || 'Unbekannter Fehler'
    if (!espId) return

    const toast = useToast()
    const deviceName = devices.find(d => getDeviceId(d) === espId)?.name || espId
    toast.error(
      `${deviceName} GPIO ${gpio}: Befehl fehlgeschlagen – ${error}`,
      { persistent: true }
    )
  }

  // =========================================================================
  // Sequence Handlers (Automation Sequences)
  // =========================================================================

  /** Handle sequence_started WebSocket event */
  function handleSequenceStarted(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const name = data.rule_name as string || data.description as string || `Sequenz ${data.sequence_id}`
    const toast = useToast()
    toast.info(`Sequenz gestartet: ${name}`)
  }

  /** Handle sequence_step WebSocket event (no toast - too frequent) */
  function handleSequenceStep(_message: { data: Record<string, unknown> }): void {
    // No toast - would flood the UI
  }

  /** Handle sequence_completed WebSocket event */
  function handleSequenceCompleted(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const success = data.success as boolean
    const toast = useToast()

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
    const msg = data.message as string || 'Unbekannter Sequenz-Fehler'
    const toast = useToast()
    toast.error(`Sequenz-Fehler: ${msg}`, { persistent: true })
  }

  /** Handle sequence_cancelled WebSocket event */
  function handleSequenceCancelled(message: { data: Record<string, unknown> }): void {
    const data = message.data
    const reason = data.reason as string
    const toast = useToast()
    toast.warning(reason ? `Sequenz abgebrochen: ${reason}` : 'Sequenz abgebrochen')
  }

  return {
    // WS Handlers (called by esp.store dispatcher)
    handleActuatorAlert,
    handleActuatorStatus,
    handleActuatorResponse,
    handleActuatorCommand,
    handleActuatorCommandFailed,
    handleSequenceStarted,
    handleSequenceStep,
    handleSequenceCompleted,
    handleSequenceError,
    handleSequenceCancelled,
  }
})
