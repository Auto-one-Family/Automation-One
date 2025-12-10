import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

export const useTimeRangeStore = defineStore('timeRange', {
  state: () => ({
    // Standard-Zeitbereiche
    standardTimeRanges: [
      { id: '5min', label: '5 Minuten', value: 5 * 60 * 1000 },
      { id: '15min', label: '15 Minuten', value: 15 * 60 * 1000 },
      { id: '1h', label: '1 Stunde', value: 60 * 60 * 1000 },
      { id: '6h', label: '6 Stunden', value: 6 * 60 * 60 * 1000 },
      { id: '24h', label: '24 Stunden', value: 24 * 60 * 60 * 1000 },
      { id: '7d', label: '7 Tage', value: 7 * 24 * 60 * 60 * 1000 },
    ],

    // Benutzerdefinierte Zeitbereiche
    customTimeRanges: new Map(), // Map<rangeId, CustomTimeRange>

    // Aktive Konfiguration
    activeTimeRange: '1h',
    aggregationMethod: 'average', // average, min, max, sum, median
    aggregationInterval: 5, // Minuten

    // Vergleichsmodus
    comparisonMode: 'none', // none, previous, yesterday, lastWeek, custom
    selectedComparisonRange: null,

    // Loading & Error States
    loading: false,
    error: null,
    lastUpdate: null,
  }),

  getters: {
    // Alle verfügbaren Zeitbereiche
    getAllTimeRanges: (state) => {
      return [...state.standardTimeRanges, ...Array.from(state.customTimeRanges.values())]
    },

    // Aktiver Zeitbereich
    getActiveTimeRange: (state) => {
      const standard = state.standardTimeRanges.find((r) => r.id === state.activeTimeRange)
      if (standard) return standard

      return state.customTimeRanges.get(state.activeTimeRange)
    },

    // Benutzerdefinierte Zeitbereiche
    getCustomTimeRanges: (state) => {
      return Array.from(state.customTimeRanges.values())
    },

    // Zeitbereich nach ID
    getTimeRangeById: (state) => (rangeId) => {
      const standard = state.standardTimeRanges.find((r) => r.id === rangeId)
      if (standard) return standard

      return state.customTimeRanges.get(rangeId)
    },

    // Verfügbare Aggregationsmethoden
    getAggregationMethods: () => [
      { title: 'Durchschnitt', value: 'average' },
      { title: 'Minimum', value: 'min' },
      { title: 'Maximum', value: 'max' },
      { title: 'Summe', value: 'sum' },
      { title: 'Median', value: 'median' },
    ],

    // Vergleichsmodi
    getComparisonModes: () => [
      { title: 'Kein Vergleich', value: 'none' },
      { title: 'Vorheriger Zeitraum', value: 'previous' },
      { title: 'Gleicher Zeitraum gestern', value: 'yesterday' },
      { title: 'Gleicher Zeitraum letzte Woche', value: 'lastWeek' },
      { title: 'Benutzerdefiniert', value: 'custom' },
    ],
  },

  actions: {
    // Benutzerdefinierten Zeitbereich erstellen
    createCustomTimeRange(config) {
      const rangeId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const customRange = {
        id: rangeId,
        name: config.name,
        label: config.label || config.name,
        value: config.duration * 60 * 1000, // Konvertiere Minuten zu Millisekunden
        duration: config.duration, // Minuten
        isActive: config.isActive !== false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      this.customTimeRanges.set(rangeId, customRange)
      this.saveToStorage()

      return customRange
    },

    // Benutzerdefinierten Zeitbereich entfernen
    removeCustomTimeRange(rangeId) {
      if (this.customTimeRanges.has(rangeId)) {
        this.customTimeRanges.delete(rangeId)
        this.saveToStorage()
        return true
      }
      return false
    },

    // Aktiven Zeitbereich setzen
    setActiveTimeRange(rangeId) {
      this.activeTimeRange = rangeId
      this.saveToStorage()
    },

    // Aggregationsmethode setzen
    setAggregationMethod(method) {
      this.aggregationMethod = method
      this.saveToStorage()
    },

    // Aggregationsintervall setzen
    setAggregationInterval(interval) {
      this.aggregationInterval = interval
      this.saveToStorage()
    },

    // Vergleichsmodus setzen
    setComparisonMode(mode) {
      this.comparisonMode = mode
      this.saveToStorage()
    },

    // Vergleichszeitraum setzen
    setSelectedComparisonRange(rangeId) {
      this.selectedComparisonRange = rangeId
      this.saveToStorage()
    },

    // Zeitbereich formatieren
    formatTimeRange(minutes) {
      if (minutes < 60) return `${minutes} Min`
      if (minutes < 1440) return `${Math.floor(minutes / 60)} Std`
      return `${Math.floor(minutes / 1440)} Tage`
    },

    // Zeitbereich in Millisekunden konvertieren
    getTimeRangeInMs(rangeId) {
      const range = this.getTimeRangeById(rangeId)
      return range ? range.value : 60 * 60 * 1000 // Default: 1 Stunde
    },

    // Zeitbereich für Vergleich berechnen
    getComparisonTimeRange(baseRangeId) {
      const baseRange = this.getTimeRangeById(baseRangeId)
      if (!baseRange) return null

      const now = Date.now()
      const baseStart = now - baseRange.value

      switch (this.comparisonMode) {
        case 'previous':
          return {
            start: baseStart - baseRange.value,
            end: baseStart,
          }
        case 'yesterday': {
          const oneDayMs = 24 * 60 * 60 * 1000
          return {
            start: baseStart - oneDayMs,
            end: now - oneDayMs,
          }
        }
        case 'lastWeek': {
          const oneWeekMs = 7 * 24 * 60 * 60 * 1000
          return {
            start: baseStart - oneWeekMs,
            end: now - oneWeekMs,
          }
        }
        case 'custom':
          if (this.selectedComparisonRange) {
            const customRange = this.getTimeRangeById(this.selectedComparisonRange)
            if (customRange) {
              return {
                start: now - customRange.value,
                end: now,
              }
            }
          }
          return null
        default:
          return null
      }
    },

    // ✅ NEU: Restore-Methode für Konsistenz mit main.js
    restoreTimeRange() {
      this.loadFromStorage()
    },

    // Persistenz
    saveToStorage() {
      try {
        storage.save('time_range_config', {
          customTimeRanges: Array.from(this.customTimeRanges.entries()),
          activeTimeRange: this.activeTimeRange,
          aggregationMethod: this.aggregationMethod,
          aggregationInterval: this.aggregationInterval,
          comparisonMode: this.comparisonMode,
          selectedComparisonRange: this.selectedComparisonRange,
        })
      } catch (error) {
        console.error('Fehler beim Speichern der Zeitbereich-Konfiguration:', error)
      }
    },

    loadFromStorage() {
      try {
        const saved = storage.load('time_range_config', {
          customTimeRanges: [],
          activeTimeRange: '1h',
          aggregationMethod: 'average',
          aggregationInterval: 5,
          comparisonMode: 'none',
          selectedComparisonRange: null,
        })

        this.customTimeRanges = new Map(saved.customTimeRanges)
        this.activeTimeRange = saved.activeTimeRange
        this.aggregationMethod = saved.aggregationMethod
        this.aggregationInterval = saved.aggregationInterval
        this.comparisonMode = saved.comparisonMode
        this.selectedComparisonRange = saved.selectedComparisonRange
      } catch (error) {
        console.error('Fehler beim Laden der Zeitbereich-Konfiguration:', error)
      }
    },
  },
})
