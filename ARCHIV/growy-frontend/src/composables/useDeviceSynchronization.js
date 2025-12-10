import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useEspManagementStore } from '@/stores/espManagement'
import { useCentralConfigStore } from '@/stores/centralConfig'

export function useDeviceSynchronization() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = computed(() => centralDataHub.storeReferences.mqtt)
  const espStore = useEspManagementStore()
  const centralConfig = useCentralConfigStore()

  // Zentrale Synchronisations-Status
  const isSynchronizing = ref(false)
  const lastSyncTime = ref(null)
  const syncErrors = ref([])

  // Computed Properties für konsistente Daten
  const synchronizedEspDevices = computed(() => {
    return Array.from(mqttStore.value.espDevices.entries()).map(([espId, device]) => ({
      espId,
      ...device,
      zone: device.zone || centralConfig.getZoneForEsp(espId),
      subzones: device.subzones || new Map(),
      lastUpdate: device.lastHeartbeat || device.lastUpdate,
    }))
  })

  const synchronizedSubzones = computed(() => (espId) => {
    const device = mqttStore.value.espDevices.get(espId)
    if (!device) return []

    return Array.from(device.subzones?.values() || []).map((subzone) => ({
      ...subzone,
      sensors: subzone.sensors || new Map(),
      actuators: subzone.actuators || new Map(),
    }))
  })

  const synchronizedPins = computed(() => (espId) => {
    return espStore.getPinAssignments(espId)
  })

  const availablePins = computed(() => (espId) => {
    return espStore.getAvailablePinsForEsp(espId)
  })

  // Zentrale Synchronisations-Methoden
  const syncDeviceData = async (espId) => {
    isSynchronizing.value = true
    try {
      // Aktualisiere ESP-Device-Daten
      const device = mqttStore.value.espDevices.get(espId)
      if (device) {
        // Synchronisiere mit ESP Management Store
        espStore.updateEspDevice(espId, device)

        // Aktualisiere Zone-Mapping
        if (device.zone) {
          centralConfig.setZone(espId, device.zone)
        }
      }

      lastSyncTime.value = Date.now()
      console.log(`[Sync] Device ${espId} synchronized successfully`)
    } catch (error) {
      console.error(`[Sync] Failed to sync device ${espId}:`, error)
      syncErrors.value.push({
        espId,
        error: error.message,
        timestamp: Date.now(),
      })
    } finally {
      isSynchronizing.value = false
    }
  }

  const syncAllDevices = async () => {
    isSynchronizing.value = true
    try {
      const espIds = Array.from(mqttStore.value.espDevices.keys())

      for (const espId of espIds) {
        await syncDeviceData(espId)
      }

      // Aktualisiere verfügbare Zonen
      centralConfig.updateAvailableZones()

      lastSyncTime.value = Date.now()
      console.log(`[Sync] All ${espIds.length} devices synchronized successfully`)
    } catch (error) {
      console.error('[Sync] Failed to sync all devices:', error)
      syncErrors.value.push({
        espId: 'all',
        error: error.message,
        timestamp: Date.now(),
      })
    } finally {
      isSynchronizing.value = false
    }
  }

  // Pin-Konfiguration über zentrale API
  const configurePinSynchronized = async (espId, pinConfig) => {
    try {
      // Verwende ESP Management Store API
      await espStore.configurePinAssignment(espId, {
        gpio: pinConfig.pin,
        type: pinConfig.type,
        name: pinConfig.name,
        subzone: pinConfig.subzoneId,
        category: pinConfig.type.startsWith('SENSOR_') ? 'sensor' : 'actuator',
      })

      // Synchronisiere nach Pin-Konfiguration
      await syncDeviceData(espId)

      return { success: true }
    } catch (error) {
      console.error('[Sync] Pin configuration failed:', error)
      return { success: false, error: error.message }
    }
  }

  // Subzone-Management über zentrale API
  const editSubzoneSynchronized = async (espId, subzoneId, newName) => {
    try {
      await espStore.renameSubzone(espId, subzoneId, newName)
      await syncDeviceData(espId)
      return { success: true }
    } catch (error) {
      console.error('[Sync] Subzone edit failed:', error)
      return { success: false, error: error.message }
    }
  }

  const deleteSubzoneSynchronized = async (espId, subzoneId) => {
    try {
      await espStore.removeSubzone(espId, subzoneId)
      await syncDeviceData(espId)
      return { success: true }
    } catch (error) {
      console.error('[Sync] Subzone deletion failed:', error)
      return { success: false, error: error.message }
    }
  }

  // Zone-Management über zentrale API
  const moveEspToZoneSynchronized = async (espId, newZone, oldZone = null) => {
    try {
      await centralConfig.moveEspToZone(espId, newZone, oldZone)
      await syncDeviceData(espId)
      return { success: true }
    } catch (error) {
      console.error('[Sync] Zone move failed:', error)
      return { success: false, error: error.message }
    }
  }

  // Automatische Synchronisation bei MQTT-Updates
  const setupAutoSync = () => {
    watch(
      () => mqttStore.value.espDevices,
      async (newDevices, oldDevices) => {
        // Identifiziere geänderte ESPs
        const changedEspIds = []

        for (const [espId, device] of newDevices) {
          const oldDevice = oldDevices?.get(espId)
          if (!oldDevice || JSON.stringify(device) !== JSON.stringify(oldDevice)) {
            changedEspIds.push(espId)
          }
        }

        // Synchronisiere geänderte ESPs
        for (const espId of changedEspIds) {
          await syncDeviceData(espId)
        }
      },
      { deep: true },
    )

    // Synchronisiere bei ESP-Auswahl-Änderungen
    watch(
      () => centralConfig.getSelectedEspId,
      async (newEspId) => {
        if (newEspId) {
          await syncDeviceData(newEspId)
        }
      },
    )
  }

  // Cleanup-Funktion
  const clearSyncErrors = () => {
    syncErrors.value = []
  }

  return {
    // Status
    isSynchronizing,
    lastSyncTime,
    syncErrors,

    // Computed Properties
    synchronizedEspDevices,
    synchronizedSubzones,
    synchronizedPins,
    availablePins,

    // Methoden
    syncDeviceData,
    syncAllDevices,
    configurePinSynchronized,
    editSubzoneSynchronized,
    deleteSubzoneSynchronized,
    moveEspToZoneSynchronized,
    setupAutoSync,
    clearSyncErrors,
  }
}
