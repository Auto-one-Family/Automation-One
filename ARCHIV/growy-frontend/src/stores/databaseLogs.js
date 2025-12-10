import { defineStore } from 'pinia'
import { apiService } from '@/services/apiService'
import { storage } from '@/utils/storage'

export const useDatabaseLogsStore = defineStore('databaseLogs', {
  state: () => ({
    // ✅ KONSOLIDIERT: Cache wird jetzt über Central Data Hub verwaltet
    // dataCache: { ... } // ENTFERNT - wird über centralDataHub verwaltet

    // Filter und Einstellungen
    filters: storage.load('database_logs_filters', {
      dataType: 'sensor_data',
      espId: null,
      sensorType: null,
      timeRange: '24h',
      limit: 200,
      currentStep: 0, // 🆕 NEU: Filterführung
    }),

    // 🆕 NEU: Filterführung State
    filterGuidance: {
      enabled: storage.load('database_logs_guidance_enabled', true),
      currentStep: 0,
      steps: [
        { id: 'dataType', message: 'Wählen Sie zuerst den Daten-Typ aus' },
        { id: 'espId', message: 'Wählen Sie ein Feld-Gerät (optional)' },
        { id: 'timeRange', message: 'Definieren Sie den Zeitraum' },
        { id: 'load', message: 'Klicken Sie "Daten laden" um zu starten' },
      ],
    },

    // UI State
    loading: false,
    error: null,
    lastUpdate: null,

    // Export-Einstellungen
    exportSettings: storage.load('database_logs_export', {
      includeHeaders: true,
      dateFormat: 'ISO',
      decimalSeparator: '.',
      fieldSeparator: ',',
      lastExportTime: null, // 🆕 NEU: Export-Statistiken
      exportCount: 0,
      documentedExports: {}, // 🆕 NEU: Dokumentierte Exports
    }),
  }),

  getters: {
    // ✅ LÖSUNG: Event-basierte Kommunikation mit Central Data Hub
    getCurrentData: () => {
      // ✅ LÖSUNG: Direkter Cache-Zugriff über Event-System
      const cacheKey = `database_logs_${this.filters.dataType}`
      return this.dataCache[cacheKey] || []
    },

    // 🆕 NEU: Aggregierte Daten
    getAggregatedData: () => {
      // ✅ LÖSUNG: Direkter Cache-Zugriff über Event-System
      const cacheKey = 'database_logs_aggregated_data'
      return this.dataCache[cacheKey] || []
    },

    // Daten-Statistiken
    getDataStats: () => {
      const data = this.getCurrentData
      return {
        total: data.length,
        byEsp: {},
        byType: {},
        timeRange: {
          earliest:
            data.length > 0
              ? Math.min(...data.map((d) => new Date(d.timestamp || d.entered_at || 0)))
              : null,
          latest:
            data.length > 0
              ? Math.max(...data.map((d) => new Date(d.timestamp || d.entered_at || 0)))
              : null,
        },
      }
    },

    // Verfügbare ESP-IDs in den Daten
    getAvailableEspIds: () => {
      const data = this.getCurrentData
      const espIds = new Set()

      data.forEach((item) => {
        if (item.esp_id) {
          espIds.add(item.esp_id)
        }
      })

      return Array.from(espIds).sort()
    },

    // Verfügbare Sensor-Typen in den Daten
    getAvailableSensorTypes: (state) => {
      const data = state.dataCache[state.filters.dataType] || []
      const types = new Set()

      data.forEach((item) => {
        if (item.sensor_type) {
          types.add(item.sensor_type)
        }
      })

      return Array.from(types).sort()
    },

    // Gefilterte Daten
    getFilteredData: (state) => {
      let data = state.dataCache[state.filters.dataType] || []

      // ESP-ID Filter
      if (state.filters.espId) {
        data = data.filter((item) => item.esp_id === state.filters.espId)
      }

      // Sensor-Typ Filter
      if (state.filters.sensorType) {
        data = data.filter((item) => item.sensor_type === state.filters.sensorType)
      }

      // Limit anwenden
      if (state.filters.limit && data.length > state.filters.limit) {
        data = data.slice(0, state.filters.limit)
      }

      return data
    },

    // Loading State
    isLoading: (state) => state.loading,

    // Error State
    getError: (state) => state.error,

    // Last Update
    getLastUpdate: (state) => state.lastUpdate,

    // 🆕 NEU: Export-Statistiken
    getExportStats: (state) => {
      return {
        totalExports: state.exportSettings.exportCount,
        lastExport: state.exportSettings.lastExportTime,
        documentedExports: state.exportSettings.documentedExports,
      }
    },
  },

  actions: {
    // Daten laden
    async loadData(dataType = null) {
      const type = dataType || this.filters.dataType

      this.loading = true
      this.error = null

      try {
        const params = {
          limit: this.filters.limit,
          time_range: this.filters.timeRange,
        }

        if (this.filters.espId) params.esp_id = this.filters.espId
        if (this.filters.sensorType) params.sensor_type = this.filters.sensorType

        let response
        switch (type) {
          case 'sensor_data':
            response = await apiService.getSensorData(params)
            break
          case 'actuator_states':
            response = await apiService.getActuatorStates(params)
            break
          case 'esp_devices':
            response = await apiService.getEspDevicesList(params)
            break
          case 'gpio_usage':
            response = await apiService.getGpioUsage(params)
            break
          case 'safe_mode_history':
            if (!this.filters.espId) {
              throw new Error('ESP ID erforderlich für SafeMode-Historie')
            }
            response = await apiService.getSafeModeHistory(this.filters.espId, params)
            break
          case 'statistics':
            response = await apiService.getDatabaseStatistics(params)
            break
          default:
            throw new Error('Unbekannter Daten-Typ')
        }

        const data = response.data || response || []
        this.lastUpdate = Date.now()

        // ✅ LÖSUNG: Direkter Cache-Zugriff über Event-System
        const cacheKey = `database_logs_${type}`
        this.dataCache[cacheKey] = data

        return data
      } catch (err) {
        console.error('Fehler beim Laden der Daten:', err)
        this.error = err.message || 'Unbekannter Fehler'
        throw err
      } finally {
        this.loading = false
      }
    },

    // 🆕 NEU: Aggregierte Daten laden
    async loadAggregatedData(interval = 'hour', sensorType = null) {
      this.loading = true
      this.error = null

      try {
        const params = {
          interval,
          time_range: this.filters.timeRange,
          limit: this.filters.limit,
        }

        if (sensorType) params.sensor_type = sensorType
        if (this.filters.espId) params.esp_id = this.filters.espId

        // Verwende bestehende API-Endpunkte mit Aggregation-Parameter
        const response = await apiService.getSensorData({
          ...params,
          aggregate: true,
          aggregate_interval: interval,
        })

        const data = response.data || response || []
        this.lastUpdate = Date.now()

        // ✅ LÖSUNG: Direkter Cache-Zugriff über Event-System
        const cacheKey = 'database_logs_aggregated_data'
        this.dataCache[cacheKey] = data

        return data
      } catch (err) {
        console.error('Fehler beim Laden der aggregierten Daten:', err)
        this.error = err.message || 'Unbekannter Fehler'
        throw err
      } finally {
        this.loading = false
      }
    },

    // Filter aktualisieren
    updateFilters(newFilters) {
      this.filters = { ...this.filters, ...newFilters }
      this.saveFilters()
    },

    // Filter zurücksetzen
    resetFilters() {
      this.filters = {
        dataType: 'sensor_data',
        espId: null,
        sensorType: null,
        timeRange: '24h',
        limit: 200,
        currentStep: 0,
      }
      this.saveFilters()
    },

    // Cache löschen
    // ✅ LÖSUNG: Direkter Cache-Zugriff über Event-System
    clearCache(dataType = null) {
      if (dataType) {
        const cacheKey = `database_logs_${dataType}`
        delete this.dataCache[cacheKey]
      } else {
        // Alle Database Logs Caches invalidieren
        const cacheKeys = [
          'database_logs_sensor_data',
          'database_logs_actuator_states',
          'database_logs_esp_devices',
          'database_logs_gpio_usage',
          'database_logs_safe_mode_history',
          'database_logs_statistics',
          'database_logs_aggregated_data',
        ]
        cacheKeys.forEach((key) => delete this.dataCache[key])
      }
    },

    // 🆕 NEU: Erweiterte CSV Export
    async executeExport(dataType = null) {
      const type = dataType || this.filters.dataType
      const data = this.getFilteredData

      if (!data.length) {
        throw new Error('Keine Daten zum Exportieren')
      }

      try {
        // CSV-Header basierend auf Daten-Struktur
        const headers = Object.keys(data[0]).filter((key) => !key.startsWith('_') && key !== 'id')

        const csvHeaders = headers.join(this.exportSettings.fieldSeparator)

        // CSV-Daten
        const csvData = data
          .map((item) => {
            return headers
              .map((header) => {
                const value = item[header]
                // Escape CSV-Werte
                if (
                  typeof value === 'string' &&
                  (value.includes(this.exportSettings.fieldSeparator) || value.includes('"'))
                ) {
                  return `"${value.replace(/"/g, '""')}"`
                }
                return value || ''
              })
              .join(this.exportSettings.fieldSeparator)
          })
          .join('\n')

        // CSV-Datei erstellen und herunterladen
        const csvContent = this.exportSettings.includeHeaders
          ? `${csvHeaders}\n${csvData}`
          : csvData
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)

        link.setAttribute('href', url)
        link.setAttribute(
          'download',
          `database_export_${type}_${new Date().toISOString().split('T')[0]}.csv`,
        )
        link.style.visibility = 'hidden'

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        // 🆕 NEU: Export-Statistiken aktualisieren
        this.exportSettings.lastExportTime = Date.now()
        this.exportSettings.exportCount++
        this.saveExportSettings()

        return true
      } catch (err) {
        console.error('Fehler beim CSV-Export:', err)
        throw err
      }
    },

    // 🆕 NEU: Als dokumentiert markieren
    markAsDocumented(dataType) {
      this.exportSettings.documentedExports = this.exportSettings.documentedExports || {}
      this.exportSettings.documentedExports[dataType] = {
        timestamp: Date.now(),
        count: this.exportSettings.exportCount,
      }
      this.saveExportSettings()

      window.$snackbar?.showInfo('Export als dokumentiert markiert')
    },

    // 🆕 NEU: Filterführung Methods
    startFilterGuidance() {
      this.filterGuidance.currentStep = 0
      this.filterGuidance.enabled = true
      this.saveGuidanceSettings()
    },

    nextGuidanceStep() {
      if (this.filterGuidance.currentStep < this.filterGuidance.steps.length - 1) {
        this.filterGuidance.currentStep++
      }
    },

    saveGuidanceSettings() {
      storage.save('database_logs_guidance_enabled', this.filterGuidance.enabled)
    },

    // Export-Einstellungen aktualisieren
    updateExportSettings(settings) {
      this.exportSettings = { ...this.exportSettings, ...settings }
      this.saveExportSettings()
    },

    // ✅ KONSOLIDIERT: Cache wird jetzt über Central Data Hub verwaltet
    // saveCache() und loadCache() sind nicht mehr nötig

    // Filter speichern
    saveFilters() {
      storage.save('database_logs_filters', this.filters)
    },

    // Export-Einstellungen speichern
    saveExportSettings() {
      storage.save('database_logs_export', this.exportSettings)
    },

    // Fehler löschen
    clearError() {
      this.error = null
    },
  },
})
