/**
 * Zone Store
 *
 * Handles zone entity CRUD (T13-R1) and WebSocket events for zone/subzone
 * assignment and device scope/context changes (T13-R2).
 *
 * Server-centric architecture:
 * ESP32 → MQTT (kaiser/{esp_id}/zone/ack) → Server → WS (zone_assignment) → this store
 * ESP32 → MQTT (kaiser/{esp_id}/subzone/ack) → Server → WS (subzone_assignment) → this store
 * Frontend → REST → Server → WS (device_scope_changed / device_context_changed) → this store
 *
 * Cross-store dependency: Uses useEspStore() for devices state.
 * The WS dispatcher in esp.store.ts delegates zone events here.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/logger'
import { zonesApi } from '@/api/zones'
import type { ESPDevice } from '@/api/esp'
import type {
  ZoneEntity, ZoneEntityCreate, ZoneEntityUpdate, ZoneStatus,
} from '@/types'

const logger = createLogger('ZoneStore')

/** Payload shape for zone_assignment WebSocket events */
interface ZoneAssignmentPayload {
  esp_id?: string
  device_id?: string
  status: 'zone_assigned' | 'zone_removed' | 'error'
  zone_id?: string | null
  zone_name?: string | null
  master_zone_id?: string | null
  kaiser_id?: string | null
  timestamp?: number
  message?: string
}

/** Payload shape for subzone_assignment WebSocket events */
interface SubzoneAssignmentPayload {
  esp_id?: string
  device_id?: string
  subzone_id?: string
  status: 'subzone_assigned' | 'subzone_removed' | 'error'
  timestamp?: number
  error_code?: string
  message?: string
}

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
  // Zone Entity State (T13-R1)
  // =========================================================================

  const zoneEntities = ref<ZoneEntity[]>([])
  const isLoadingZones = ref(false)

  // =========================================================================
  // Zone Entity Getters
  // =========================================================================

  const activeZones = computed(() =>
    zoneEntities.value.filter(z => z.status === 'active'),
  )

  const archivedZones = computed(() =>
    zoneEntities.value.filter(z => z.status === 'archived'),
  )

  // =========================================================================
  // Zone Entity Actions
  // =========================================================================

  async function fetchZoneEntities(status?: ZoneStatus): Promise<void> {
    isLoadingZones.value = true
    try {
      const response = await zonesApi.listZoneEntities(status)
      zoneEntities.value = response.zones
    } catch (e) {
      logger.error('Failed to fetch zone entities', e)
    } finally {
      isLoadingZones.value = false
    }
  }

  async function createZone(data: ZoneEntityCreate): Promise<ZoneEntity> {
    const zone = await zonesApi.createZoneEntity(data)
    zoneEntities.value.push(zone)
    return zone
  }

  async function updateZone(zoneId: string, data: ZoneEntityUpdate): Promise<void> {
    const updated = await zonesApi.updateZoneEntity(zoneId, data)
    const index = zoneEntities.value.findIndex(z => z.zone_id === zoneId)
    if (index !== -1) {
      zoneEntities.value[index] = updated
    }
  }

  async function archiveZone(zoneId: string): Promise<void> {
    const archived = await zonesApi.archiveZoneEntity(zoneId)
    const index = zoneEntities.value.findIndex(z => z.zone_id === zoneId)
    if (index !== -1) {
      zoneEntities.value[index] = archived
    }
  }

  async function reactivateZone(zoneId: string): Promise<void> {
    const reactivated = await zonesApi.reactivateZoneEntity(zoneId)
    const index = zoneEntities.value.findIndex(z => z.zone_id === zoneId)
    if (index !== -1) {
      zoneEntities.value[index] = reactivated
    }
  }

  async function deleteZoneEntity(zoneId: string): Promise<void> {
    await zonesApi.deleteZoneEntity(zoneId)
    zoneEntities.value = zoneEntities.value.filter(z => z.zone_id !== zoneId)
  }

  // =========================================================================
  // Zone Assignment Handler (existing)
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
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    setDevice: (index: number, device: ESPDevice) => void,
  ): void {
    const data = message.data as unknown as ZoneAssignmentPayload
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

    const toast = useToast()

    if (data.status === 'zone_assigned') {
      // DEFENSIVE: only update fields that are DEFINED in the event
      const updates: Partial<ESPDevice> = {}

      if (data.zone_id !== undefined) updates.zone_id = data.zone_id
      if (data.zone_name !== undefined) updates.zone_name = data.zone_name
      if (data.master_zone_id !== undefined) updates.master_zone_id = data.master_zone_id
      if (data.kaiser_id !== undefined) updates.kaiser_id = data.kaiser_id

      setDevice(deviceIndex, { ...device, ...updates })
      logger.info(`Zone confirmed: ${espId} → ${data.zone_id}${data.zone_name ? ` (${data.zone_name})` : ''} (reactivity triggered)`)

      const deviceName = device.name || espId
      const zoneName = data.zone_name || data.zone_id || 'Zone'
      toast.success(`"${deviceName}" wurde zu "${zoneName}" zugewiesen`)
    } else if (data.status === 'zone_removed') {
      // Capture zone name before clearing fields
      const deviceName = device.name || espId
      const zoneName = device.zone_name || device.zone_id || 'Zone'

      // Clear zone fields on removal. kaiser_id remains unchanged (WP2-F24)
      setDevice(deviceIndex, {
        ...device,
        zone_id: undefined,
        zone_name: undefined,
        master_zone_id: undefined,
      })
      logger.info(`Zone removed: ${espId}`)
      toast.success(`"${deviceName}" wurde aus "${zoneName}" entfernt`)
    } else if (data.status === 'error') {
      logger.error(`Zone assignment error for ${espId}: ${data.message}`)
      toast.error(data.message || 'Zone-Zuweisung fehlgeschlagen')
    } else {
      logger.warn(`Unknown zone_assignment status: ${data.status}`)
    }
  }

  // =========================================================================
  // Subzone Assignment Handler (existing)
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
  /**
   * @returns true if devices should be refreshed (subzone_assigned or subzone_removed)
   */
  function handleSubzoneAssignment(
    message: { data: Record<string, unknown> },
    devices: ESPDevice[],
    getDeviceId: (d: ESPDevice) => string,
    _setDevice: (index: number, device: ESPDevice) => void,
  ): boolean {
    const toast = useToast()
    const data = message.data as unknown as SubzoneAssignmentPayload
    const espId = data.esp_id || data.device_id

    if (!espId) {
      logger.warn('subzone_assignment missing esp_id')
      return false
    }

    const deviceIndex = findDeviceIndex(devices, espId, getDeviceId)
    if (deviceIndex === -1) {
      logger.debug(`Subzone assignment for unknown device: ${espId}`)
      return false
    }

    const device = devices[deviceIndex]

    if (data.status === 'subzone_assigned') {
      logger.info(`Subzone confirmed: ${espId} → ${data.subzone_id}`)
      toast.success(`Subzone zugewiesen: ${device.name || espId}`)
      return true
    } else if (data.status === 'subzone_removed') {
      logger.info(`Subzone removed: ${espId}`)
      toast.success(`Subzone entfernt: ${device.name || espId}`)
      return true
    } else if (data.status === 'error') {
      logger.error(`Subzone assignment error for ${espId}: ${data.message}`)
      toast.error(data.message || 'Subzone-Zuweisung fehlgeschlagen')
    } else {
      logger.warn(`Unknown subzone_assignment status: ${data.status}`)
    }
    return false
  }

  // =========================================================================
  // Device Scope & Context WS Handlers (T13-R2)
  // =========================================================================

  /**
   * Handle device_scope_changed WebSocket event.
   * Triggered when a sensor/actuator's device_scope or assigned_zones change.
   * Defensively refreshes ESP data via espStore.fetchAll().
   */
  function handleDeviceScopeChanged(message: { data: Record<string, unknown> }): void {
    try {
      const toast = useToast()
      const data = message.data
      const configType = data.config_type as string || 'device'
      const espId = data.esp_id as string || ''

      logger.info(`Device scope changed: ${configType} on ${espId}`, data)
      toast.info(`Geräte-Scope aktualisiert${espId ? ` (${espId})` : ''}`)
    } catch (e) {
      logger.error('Error handling device_scope_changed', e)
    }
  }

  /**
   * Handle device_context_changed WebSocket event.
   * Triggered when a sensor/actuator's active zone/subzone context changes.
   * Defensively refreshes ESP data via espStore.fetchAll().
   */
  function handleDeviceContextChanged(message: { data: Record<string, unknown> }): void {
    try {
      const toast = useToast()
      const data = message.data
      const configType = data.config_type as string || 'device'
      const activeZone = data.active_zone_id as string || ''

      logger.info(`Device context changed: ${configType} → zone ${activeZone}`, data)
      toast.info(`Geräte-Kontext aktualisiert${activeZone ? ` (Zone: ${activeZone})` : ''}`)
    } catch (e) {
      logger.error('Error handling device_context_changed', e)
    }
  }

  return {
    // Zone Entity State
    zoneEntities,
    isLoadingZones,
    // Zone Entity Getters
    activeZones,
    archivedZones,
    // Zone Entity Actions
    fetchZoneEntities,
    createZone,
    updateZone,
    archiveZone,
    reactivateZone,
    deleteZoneEntity,
    // Zone/Subzone Assignment WS Handlers (existing)
    handleZoneAssignment,
    handleSubzoneAssignment,
    // Device Scope/Context WS Handlers (T13-R2)
    handleDeviceScopeChanged,
    handleDeviceContextChanged,
  }
})
