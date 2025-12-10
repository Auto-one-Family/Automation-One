import { defineStore } from 'pinia'
import { ref } from 'vue'
import { storage } from '@/utils/storage'

export const useZoneRegistryStore = defineStore('zoneRegistry', () => {
  // 🆕 NEU: Zentrale Zonen-Registrierung
  const renderedZones = ref(new Set())
  const zonePositions = ref({})

  // 🆕 NEU: Zone-Registrierung
  const registerZoneInstance = (zoneId, componentType = 'ZoneCard') => {
    if (renderedZones.value.has(zoneId)) {
      if (import.meta.env.DEV) {
        console.warn(`Zone ${zoneId} wird bereits in ${componentType} dargestellt`)
      }
      return false
    }

    renderedZones.value.add(zoneId)
    return true
  }

  const unregisterZoneInstance = (zoneId) => {
    renderedZones.value.delete(zoneId)
  }

  const isZoneRendered = (zoneId) => {
    return renderedZones.value.has(zoneId)
  }

  // 🆕 NEU: Position-Management
  const updateZonePosition = (zoneId, position) => {
    zonePositions.value[zoneId] = {
      position,
      timestamp: Date.now(),
    }
    saveZoneLayout()
  }

  const getZonePosition = (zoneId) => {
    return zonePositions.value[zoneId]?.position || 999
  }

  const restoreZonePosition = (zoneId, originalPosition) => {
    updateZonePosition(zoneId, originalPosition)
  }

  // 🆕 NEU: Layout-Persistierung
  const saveZoneLayout = () => {
    storage.save('zone_layout', zonePositions.value)
  }

  const loadZoneLayout = () => {
    zonePositions.value = storage.load('zone_layout', {})
  }

  // 🆕 NEU: Sortierte Zonen
  const getSortedZones = (zones) => {
    return zones.sort((a, b) => {
      const posA = getZonePosition(a.id)
      const posB = getZonePosition(b.id)
      return posA - posB
    })
  }

  // 🆕 NEU: Registry-Reset
  const clearRegistry = () => {
    renderedZones.value.clear()
  }

  // 🆕 NEU: Registry-Status
  const getRegistryStatus = () => {
    return {
      renderedCount: renderedZones.value.size,
      zones: Array.from(renderedZones.value),
      positions: zonePositions.value,
    }
  }

  // ✅ NEU: Restore-Methode für Konsistenz mit main.js
  const restoreZones = () => {
    loadZoneLayout()
  }

  return {
    // Registry-Funktionen
    registerZoneInstance,
    unregisterZoneInstance,
    isZoneRendered,
    clearRegistry,
    getRegistryStatus,

    // Position-Funktionen
    updateZonePosition,
    getZonePosition,
    restoreZonePosition,
    getSortedZones,

    // Layout-Funktionen
    saveZoneLayout,
    loadZoneLayout,

    // ✅ NEU: Restore-Methode hinzugefügt
    restoreZones,
  }
})
