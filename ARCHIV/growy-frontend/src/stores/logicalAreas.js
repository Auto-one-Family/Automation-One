import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

export const useLogicalAreasStore = defineStore('logicalAreas', {
  state: () => ({
    logicalAreas: new Map(), // Map<areaId, LogicalArea>
    areaTemplates: new Map(), // Map<templateId, AreaTemplate>
    activeAreas: new Set(), // Set<areaId>
    loading: false,
    error: null,
  }),

  getters: {
    getAllLogicalAreas: (state) => Array.from(state.logicalAreas.values()),

    getActiveLogicalAreas: (state) => {
      return Array.from(state.logicalAreas.values()).filter((area) =>
        state.activeAreas.has(area.id),
      )
    },

    getLogicalArea: (state) => (areaId) => {
      return state.logicalAreas.get(areaId)
    },

    getAreasBySensorType: (state) => (sensorType) => {
      return Array.from(state.logicalAreas.values()).filter((area) =>
        area.sensorTypes.includes(sensorType),
      )
    },

    getAreasByEsp: (state) => (espId) => {
      return Array.from(state.logicalAreas.values()).filter((area) =>
        area.sensors.some((s) => s.espId === espId),
      )
    },
  },

  actions: {
    // Logischen Bereich erstellen
    createLogicalArea(config) {
      const areaId = `area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const logicalArea = {
        id: areaId,
        name: config.name,
        description: config.description || '',
        sensorTypes: config.sensorTypes || [],
        sensors: config.sensors || [],
        timeInterval: config.timeInterval || '1h',
        criticalRanges: config.criticalRanges || [],
        aggregationMethod: config.aggregationMethod || 'average', // average, min, max, sum
        visualizationType: config.visualizationType || 'chart', // chart, gauge, table
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),

        // Erweiterte Konfiguration
        timeRanges: config.timeRanges || {
          short: '5min',
          medium: '1h',
          long: '24h',
        },

        // Benachrichtigungen
        notifications: config.notifications || {
          enabled: true,
          criticalOnly: false,
          email: false,
          mqtt: true,
        },

        // Export-Konfiguration
        exportConfig: config.exportConfig || {
          autoExport: false,
          format: 'json',
          interval: 'daily',
        },
      }

      this.logicalAreas.set(areaId, logicalArea)
      this.activeAreas.add(areaId)
      this.saveToStorage()

      return logicalArea
    },

    // Bereich aktualisieren
    updateLogicalArea(areaId, updates) {
      const area = this.logicalAreas.get(areaId)
      if (!area) return false

      Object.assign(area, updates, { updatedAt: Date.now() })
      this.logicalAreas.set(areaId, area)
      this.saveToStorage()

      return true
    },

    // Sensor zu Bereich hinzufügen
    addSensorToArea(areaId, sensor) {
      const area = this.logicalAreas.get(areaId)
      if (!area) return false

      const sensorKey = `${sensor.espId}-${sensor.gpio}`
      const exists = area.sensors.find((s) => `${s.espId}-${s.gpio}` === sensorKey)

      if (!exists) {
        area.sensors.push({
          espId: sensor.espId,
          gpio: sensor.gpio,
          type: sensor.type,
          name: sensor.name,
        })
        area.updatedAt = Date.now()
        this.logicalAreas.set(areaId, area)
        this.saveToStorage()
      }

      return true
    },

    // Kritischen Bereich hinzufügen
    addCriticalRange(areaId, range) {
      const area = this.logicalAreas.get(areaId)
      if (!area) return false

      const rangeId = `range_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      area.criticalRanges.push({
        id: rangeId,
        sensorType: range.sensorType,
        min: range.min,
        max: range.max,
        timeRange: range.timeRange || area.timeInterval, // Zeitbereich für Grenzwerte
        color: range.color || 'error',
        description: range.description || '',
        notification: range.notification || true,
        severity: range.severity || 'warning', // warning, error, critical
      })

      area.updatedAt = Date.now()
      this.logicalAreas.set(areaId, area)
      this.saveToStorage()

      return true
    },

    // Bereichs-Template erstellen
    createAreaTemplate(config) {
      const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const template = {
        id: templateId,
        name: config.name,
        description: config.description,
        category: config.category || 'general', // general, agriculture, climate, etc.
        sensorTypes: config.sensorTypes || [],
        defaultTimeInterval: config.defaultTimeInterval || '1h',
        defaultCriticalRanges: config.defaultCriticalRanges || [],
        visualizationType: config.visualizationType || 'chart',
        createdAt: Date.now(),
      }

      this.areaTemplates.set(templateId, template)
      this.saveToStorage()

      return template
    },

    // Bereich aus Template erstellen
    createAreaFromTemplate(templateId, config = {}) {
      const template = this.areaTemplates.get(templateId)
      if (!template) return null

      const areaConfig = {
        name: config.name || template.name,
        description: config.description || template.description,
        sensorTypes: config.sensorTypes || template.sensorTypes,
        sensors: config.sensors || [],
        timeInterval: config.timeInterval || template.defaultTimeInterval,
        criticalRanges: config.criticalRanges || template.defaultCriticalRanges,
        visualizationType: config.visualizationType || template.visualizationType,
      }

      return this.createLogicalArea(areaConfig)
    },

    // Bereich exportieren
    exportArea(areaId, format = 'json') {
      const area = this.logicalAreas.get(areaId)
      if (!area) return null

      switch (format) {
        case 'json':
          return JSON.stringify(area, null, 2)
        case 'csv':
          return this.convertAreaToCSV(area)
        default:
          return JSON.stringify(area, null, 2)
      }
    },

    // Bereich importieren
    importArea(areaData) {
      try {
        const area = typeof areaData === 'string' ? JSON.parse(areaData) : areaData

        // Generiere neue ID für importierten Bereich
        area.id = `area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        area.createdAt = Date.now()
        area.updatedAt = Date.now()

        this.logicalAreas.set(area.id, area)
        this.saveToStorage()

        return area
      } catch (error) {
        console.error('Fehler beim Importieren des Bereichs:', error)
        return null
      }
    },

    // ✅ NEU: Restore-Methode für Konsistenz mit main.js
    restoreLogicalAreas() {
      this.loadFromStorage()
    },

    // Persistenz
    saveToStorage() {
      try {
        storage.save('logical_areas', {
          logicalAreas: Array.from(this.logicalAreas.entries()),
          areaTemplates: Array.from(this.areaTemplates.entries()),
          activeAreas: Array.from(this.activeAreas),
        })
      } catch (error) {
        console.error('Fehler beim Speichern der logischen Bereiche:', error)
      }
    },

    loadFromStorage() {
      try {
        const saved = storage.load('logical_areas', {
          logicalAreas: [],
          areaTemplates: [],
          activeAreas: [],
        })

        this.logicalAreas = new Map(saved.logicalAreas)
        this.areaTemplates = new Map(saved.areaTemplates)
        this.activeAreas = new Set(saved.activeAreas)
      } catch (error) {
        console.error('Fehler beim Laden der logischen Bereiche:', error)
      }
    },
  },
})
