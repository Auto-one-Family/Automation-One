import { ref } from 'vue'

/**
 * ✅ NEU: Wiederverwendbares Composable für Blink-Animation bei Zonenwechsel
 * Kann in EspGrid.vue und DashboardView.vue verwendet werden
 */
export function useBlinkTracker() {
  const lastMovedEspId = ref(null)
  const lastZoneChange = ref(null) // ✅ NEU: Logging der letzten Zonenänderung

  /**
   * Markiert ein Gerät als kürzlich verschoben
   * @param {string} espId - ESP-ID des verschobenen Geräts
   * @param {string} oldZone - Vorherige Zone
   * @param {string} newZone - Neue Zone
   * @param {number} duration - Dauer der Animation in ms (Standard: 5000)
   */
  const markAsRecentlyMoved = (espId, oldZone = null, newZone = null, duration = 5000) => {
    lastMovedEspId.value = espId

    // ✅ NEU: Logge Zonenwechsel
    if (oldZone !== newZone) {
      lastZoneChange.value = {
        espId,
        oldZone,
        newZone,
        timestamp: Date.now(),
      }

      // Console-Log für Debug-Zwecke
      console.info(
        `[ZoneChange] ESP ${espId} von '${oldZone}' nach '${newZone}' (${new Date().toISOString()})`,
      )
    }

    // Reset nach angegebener Zeit
    setTimeout(() => {
      if (lastMovedEspId.value === espId) {
        lastMovedEspId.value = null
      }
    }, duration)
  }

  /**
   * Prüft, ob ein Gerät kürzlich verschoben wurde
   * @param {string} espId - ESP-ID zu prüfen
   * @returns {boolean} True wenn das Gerät kürzlich verschoben wurde
   */
  const isRecentlyMoved = (espId) => {
    return espId === lastMovedEspId.value
  }

  /**
   * ✅ NEU: Gibt die letzte Zonenänderung zurück
   * @returns {Object|null} Letzte Zonenänderung oder null
   */
  const getLastZoneChange = () => {
    return lastZoneChange.value
  }

  /**
   * ✅ NEU: Löscht die Historie der letzten Zonenänderung
   */
  const clearZoneChangeHistory = () => {
    lastZoneChange.value = null
  }

  /**
   * Überwacht Zonenänderungen in einem Device-Map
   * @param {Map} newDevices - Aktuelle Devices
   * @param {Map} oldDevices - Vorherige Devices
   */
  const watchZoneChanges = (newDevices, oldDevices) => {
    if (!oldDevices) return

    for (const [espId, newDevice] of newDevices.entries()) {
      const oldDevice = oldDevices.get(espId)
      if (oldDevice && oldDevice.zone !== newDevice.zone) {
        // Gerät blinkt bei Zonenwechsel kurz auf – zur visuellen Orientierung
        markAsRecentlyMoved(espId, oldDevice.zone, newDevice.zone)
        break // Nur das erste gefundene Gerät animieren
      }
    }
  }

  return {
    lastMovedEspId,
    lastZoneChange,
    markAsRecentlyMoved,
    isRecentlyMoved,
    getLastZoneChange,
    clearZoneChangeHistory,
    watchZoneChanges,
  }
}
