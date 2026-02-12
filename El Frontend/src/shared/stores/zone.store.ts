/**
 * Zone Store
 *
 * Handles zone and subzone assignment WebSocket events.
 * Mirrors server-side zone_ack_handler.py and subzone_ack_handler.py.
 *
 * Server-centric architecture:
 * ESP32 → MQTT (kaiser/{esp_id}/zone/ack) → Server → WS (zone_assignment) → this store
 * ESP32 → MQTT (kaiser/{esp_id}/subzone/ack) → Server → WS (subzone_assignment) → this store
 *
 * Cross-store dependency: Uses useEspStore() for devices state.
 * The WS dispatcher in esp.store.ts delegates zone events here.
 */

import { defineStore } from 'pinia'
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/logger'
import type { ESPDevice } from '@/api/esp'

const logger = createLogger('ZoneStore')

/**
 * Find device index in the devices array by esp_id.
 * Uses the same defensive pattern as esp.store.ts (findDeviceByEspIdDefensive).
 */
function findDeviceIndex(
  devices: ESPDevice[],
  espId: string,
  getDeviceId: (d: ESPDevice) => string,
): number {
  return devices.findIndex(d => getDeviceId(d) === espId)
}

export const useZoneStore = defineStore('zone', () => {

  // =========================================================================
  // Zone Assignment Handler
  // =========================================================================

  /**
   * Handle zone_assignment WebSocket event.
   * Updates device zone fields when server confirms zone assignment/removal.
   *
   * Server payload (from zone_ack_handler.py):
   * {
   *   esp_id: string,
   *   status: "zone_assigned" | "zone_removed" | "error",
   *   zone_id: string,
   *   zone_name?: string,
   *   kaiser_id?: string,
   *   master_zone_id?: string,
   *   timestamp: number,
   *   message?: string
   * }
   */
  function handleZoneAssignment(
    message: any,
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    setDevice: (index: number, device: ESPDevice) => void,
  ): void {
    const data = message.data
    const espId = data.esp_id || data.device_id

    if (!espId) {
      logger.warn('zone_assignment missing esp_id')
      return
    }

    const deviceIndex = findDeviceIndex(devices, espId, getDeviceId)
    if (deviceIndex === -1) {
      logger.debug(`Zone assignment for unknown device: ${espId}`)
      return
    }

    const device = devices[deviceIndex]

    if (data.status === 'zone_assigned') {
      // DEFENSIVE: only update fields that are DEFINED in the event
      const updates: Partial<ESPDevice> = {}

      if (data.zone_id !== undefined) updates.zone_id = data.zone_id
      if (data.zone_name !== undefined) updates.zone_name = data.zone_name
      if (data.master_zone_id !== undefined) updates.master_zone_id = data.master_zone_id
      if (data.kaiser_id !== undefined) updates.kaiser_id = data.kaiser_id

      setDevice(deviceIndex, { ...device, ...updates })
      logger.info(`Zone confirmed: ${espId} → ${data.zone_id}${data.zone_name ? ` (${data.zone_name})` : ''} (reactivity triggered)`)
    } else if (data.status === 'zone_removed') {
      // Clear zone fields on removal. kaiser_id remains unchanged (WP2-F24)
      setDevice(deviceIndex, {
        ...device,
        zone_id: undefined,
        zone_name: undefined,
        master_zone_id: undefined,
      })
      logger.info(`Zone removed: ${espId}`)
    } else if (data.status === 'error') {
      logger.error(`Zone assignment error for ${espId}: ${data.message}`)
    } else {
      logger.warn(`Unknown zone_assignment status: ${data.status}`)
    }
  }

  // =========================================================================
  // Subzone Assignment Handler
  // =========================================================================

  /**
   * Handle subzone_assignment WebSocket event.
   * Updates device subzone fields when server confirms subzone assignment/removal.
   *
   * Server payload (from subzone_ack_handler.py):
   * {
   *   esp_id: string,
   *   subzone_id: string,
   *   status: "subzone_assigned" | "subzone_removed" | "error",
   *   timestamp: number,
   *   error_code?: string,
   *   message?: string
   * }
   */
  function handleSubzoneAssignment(
    message: any,
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    setDevice: (index: number, device: ESPDevice) => void,
  ): void {
    const toast = useToast()
    const data = message.data
    const espId = data.esp_id || data.device_id

    if (!espId) {
      logger.warn('subzone_assignment missing esp_id')
      return
    }

    const deviceIndex = findDeviceIndex(devices, espId, getDeviceId)
    if (deviceIndex === -1) {
      logger.debug(`Subzone assignment for unknown device: ${espId}`)
      return
    }

    const device = devices[deviceIndex]

    if (data.status === 'subzone_assigned') {
      const updates: Partial<ESPDevice> = {}
      if (data.subzone_id !== undefined) updates.subzone_id = data.subzone_id

      setDevice(deviceIndex, { ...device, ...updates })
      logger.info(`Subzone confirmed: ${espId} → ${data.subzone_id} (reactivity triggered)`)
      toast.success(`Subzone zugewiesen: ${device.name || espId}`)
    } else if (data.status === 'subzone_removed') {
      setDevice(deviceIndex, {
        ...device,
        subzone_id: undefined,
        subzone_name: undefined,
      })
      logger.info(`Subzone removed: ${espId}`)
      toast.success(`Subzone entfernt: ${device.name || espId}`)
    } else if (data.status === 'error') {
      logger.error(`Subzone assignment error for ${espId}: ${data.message}`)
      toast.error(data.message || 'Subzone-Zuweisung fehlgeschlagen')
    } else {
      logger.warn(`Unknown subzone_assignment status: ${data.status}`)
    }
  }

  return {
    handleZoneAssignment,
    handleSubzoneAssignment,
  }
})
