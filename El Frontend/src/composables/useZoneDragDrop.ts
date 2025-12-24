/**
 * useZoneDragDrop Composable
 *
 * Handles zone drag & drop operations with:
 * - Optimistic UI updates
 * - API calls for zone assignment
 * - Error handling with rollback
 * - Toast notifications
 */

import { ref } from 'vue'
import { zonesApi } from '@/api/zones'
import { useEspStore } from '@/stores/esp'
import { useToast } from './useToast'
import type { ESPDevice } from '@/api/esp'

interface ZoneDropEvent {
  device: ESPDevice
  fromZoneId: string | null
  toZoneId: string
}

interface ZoneGrouping {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
}

export function useZoneDragDrop() {
  const espStore = useEspStore()
  const toast = useToast()

  // State
  const isProcessing = ref(false)
  const lastError = ref<string | null>(null)
  const processingDeviceId = ref<string | null>(null)

  /**
   * Generate zone_name from zone_id (reverse of the normal flow)
   * Used for display when only zone_id is available
   * "zelt_1" -> "Zelt 1", "gewaechshaus_nord" -> "Gewaechshaus Nord"
   */
  function zoneIdToDisplayName(zoneId: string): string {
    if (!zoneId) return ''
    return zoneId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Generate technical zone_id from human-readable zone_name
   * Mirrors server-side logic
   * "Zelt 1" -> "zelt_1", "Gewächshaus Nord" -> "gewaechshaus_nord"
   */
  function generateZoneId(zoneName: string): string {
    if (!zoneName) return ''
    let zoneId = zoneName.toLowerCase()
    // Replace German umlauts
    zoneId = zoneId.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    // Replace spaces and special chars with underscores
    zoneId = zoneId.replace(/[^a-z0-9]+/g, '_')
    // Remove leading/trailing underscores
    zoneId = zoneId.replace(/^_+|_+$/g, '')
    return zoneId
  }

  /**
   * Group devices by zone
   * Returns array of zone groups including an "unassigned" group
   */
  function groupDevicesByZone(devices: ESPDevice[]): ZoneGrouping[] {
    const zoneMap = new Map<string, ZoneGrouping>()

    // Group devices
    for (const device of devices) {
      const zoneId = device.zone_id || '__unassigned__'
      const zoneName = device.zone_name || (zoneId !== '__unassigned__' ? zoneIdToDisplayName(zoneId) : 'Nicht zugewiesen')

      if (!zoneMap.has(zoneId)) {
        zoneMap.set(zoneId, {
          zoneId,
          zoneName,
          devices: []
        })
      }

      zoneMap.get(zoneId)!.devices.push(device)
    }

    // Convert to array and sort (unassigned last)
    const groups = Array.from(zoneMap.values())
    groups.sort((a, b) => {
      if (a.zoneId === '__unassigned__') return 1
      if (b.zoneId === '__unassigned__') return -1
      return a.zoneName.localeCompare(b.zoneName)
    })

    return groups
  }

  /**
   * Get all unique zones from devices
   */
  function getAvailableZones(devices: ESPDevice[]): { zoneId: string; zoneName: string }[] {
    const zones = new Map<string, string>()

    for (const device of devices) {
      if (device.zone_id) {
        const zoneName = device.zone_name || zoneIdToDisplayName(device.zone_id)
        zones.set(device.zone_id, zoneName)
      }
    }

    return Array.from(zones.entries())
      .map(([zoneId, zoneName]) => ({ zoneId, zoneName }))
      .sort((a, b) => a.zoneName.localeCompare(b.zoneName))
  }

  /**
   * Handle device drop - assign device to new zone
   * Makes single API call to zonesApi.assignZone() which handles DB + MQTT
   */
  async function handleDeviceDrop(event: ZoneDropEvent): Promise<boolean> {
    const { device, fromZoneId, toZoneId } = event
    const deviceId = device.device_id || device.esp_id || ''

    // Skip if dropping to same zone
    if (fromZoneId === toZoneId) {
      return true
    }

    // Skip if dropping to unassigned (use removeZone instead)
    if (toZoneId === '__unassigned__') {
      return handleRemoveFromZone(device)
    }

    isProcessing.value = true
    processingDeviceId.value = deviceId
    lastError.value = null

    try {
      // Single API call - handles DB update and MQTT publish
      const response = await zonesApi.assignZone(deviceId, {
        zone_id: toZoneId,
        zone_name: zoneIdToDisplayName(toZoneId)
      })

      if (!response.success) {
        throw new Error(response.message || 'Zone-Zuweisung fehlgeschlagen')
      }

      // Refresh store from server to get updated data
      await espStore.fetchAll()

      // Success toast
      const deviceName = device.name || deviceId
      const zoneName = zoneIdToDisplayName(toZoneId)
      toast.success(`"${deviceName}" wurde zu "${zoneName}" zugewiesen`)

      console.log(`[useZoneDragDrop] Successfully assigned ${deviceId} to zone ${toZoneId}`)
      return true

    } catch (error) {
      console.error('[useZoneDragDrop] Failed to assign zone:', error)

      // Refresh store to ensure consistent state
      await espStore.fetchAll()

      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler'
      lastError.value = errorMessage

      // Error toast with retry action
      toast.error(`Zone-Zuweisung fehlgeschlagen: ${errorMessage}`, {
        duration: 8000,
        actions: [
          {
            label: 'Erneut versuchen',
            variant: 'primary',
            onClick: async () => { await handleDeviceDrop(event) }
          }
        ]
      })

      return false

    } finally {
      isProcessing.value = false
      processingDeviceId.value = null
    }
  }

  /**
   * Remove device from zone (assign to unassigned)
   * Makes single API call to zonesApi.removeZone() which handles DB + MQTT
   */
  async function handleRemoveFromZone(device: ESPDevice): Promise<boolean> {
    const deviceId = device.device_id || device.esp_id || ''

    if (!device.zone_id) {
      // Already unassigned
      return true
    }

    isProcessing.value = true
    processingDeviceId.value = deviceId
    lastError.value = null

    // Store original zone info for toast message
    const originalZoneId = device.zone_id
    const originalZoneName = device.zone_name

    try {
      // Single API call - handles DB update and MQTT publish
      const response = await zonesApi.removeZone(deviceId)

      if (!response.success) {
        throw new Error(response.message || 'Zone-Entfernung fehlgeschlagen')
      }

      // Refresh store from server to get updated data
      await espStore.fetchAll()

      // Success toast
      const deviceName = device.name || deviceId
      const zoneName = originalZoneName || zoneIdToDisplayName(originalZoneId)
      toast.success(`"${deviceName}" wurde aus "${zoneName}" entfernt`)

      console.log(`[useZoneDragDrop] Successfully removed ${deviceId} from zone`)
      return true

    } catch (error) {
      console.error('[useZoneDragDrop] Failed to remove zone:', error)

      // Refresh store to ensure consistent state
      await espStore.fetchAll()

      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler'
      lastError.value = errorMessage

      // Error toast with retry action
      toast.error(`Zone-Entfernung fehlgeschlagen: ${errorMessage}`, {
        duration: 8000,
        actions: [
          {
            label: 'Erneut versuchen',
            variant: 'primary',
            onClick: async () => { await handleRemoveFromZone(device) }
          }
        ]
      })

      return false

    } finally {
      isProcessing.value = false
      processingDeviceId.value = null
    }
  }

  return {
    // State
    isProcessing,
    lastError,
    processingDeviceId,

    // Methods
    groupDevicesByZone,
    getAvailableZones,
    handleDeviceDrop,
    handleRemoveFromZone,
    generateZoneId,
    zoneIdToDisplayName
  }
}
