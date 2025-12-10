// ✅ ANPASSUNG: Logic Simulation Module - Nutzt zentrale Evaluierungsschicht
import { coreEvaluator } from './coreEvaluator'

export class LogicSimulation {
  constructor() {
    // Keine eigenen Store-Referenzen mehr - nutzt CoreEvaluator
    this.simulations = new Map()
    this.forecastData = new Map()
  }

  // ✅ ANPASSUNG: Vorhersage-Simulation starten - nutzt gemeinsame Evaluierung
  async startForecastSimulation(espId, gpio, options = {}) {
    const {
      duration = 24 * 60 * 60 * 1000, // 24 Stunden
      interval = 5 * 60 * 1000, // 5 Minuten
    } = options

    // ✅ NEU: Verwende CoreEvaluator für Logik-Abruf
    const evaluation = await coreEvaluator.evaluateLogic(espId, gpio)
    if (evaluation.error) {
      throw new Error(`Keine Logik gefunden für ESP ${espId}, GPIO ${gpio}`)
    }
    const logic = evaluation.logic

    const simulation = {
      id: `${espId}-${gpio}-${Date.now()}`,
      logicId: `${espId}-${gpio}`,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      interval,
      status: 'running',
      dataPoints: [],
      predictions: [],
      triggers: [],
      summary: {},
      options,
    }

    // Simulation starten
    this.runSimulationLoop(simulation, logic)

    this.simulations.set(simulation.id, simulation)
    return simulation
  }

  // 🆕 NEU: Simulations-Schleife
  async runSimulationLoop(simulation, logic) {
    const startTime = simulation.startTime
    const endTime = simulation.endTime
    const interval = simulation.interval

    for (let currentTime = startTime; currentTime <= endTime; currentTime += interval) {
      try {
        // Vorhersage-Daten generieren
        const forecastData = await this.generateForecastData(
          simulation.logicId,
          currentTime,
          simulation.options,
        )

        // ✅ NEU: Verwende gemeinsame Evaluierung mit Vorhersage-Daten
        const evaluation = await coreEvaluator.evaluateLogicWithForecast(
          logic,
          forecastData,
          currentTime,
        )

        const dataPoint = {
          timestamp: currentTime,
          forecastData,
          evaluation,
          actuatorState: evaluation.state,
          confidence: evaluation.confidence || 0.5,
        }

        simulation.dataPoints.push(dataPoint)

        // Trigger-Events erkennen
        if (this.isTriggerEvent(dataPoint, simulation.dataPoints)) {
          simulation.triggers.push({
            timestamp: currentTime,
            type: 'state_change',
            fromState: this.getPreviousState(simulation.dataPoints, currentTime),
            toState: evaluation.state,
            reason: evaluation.reason,
            confidence: evaluation.confidence,
          })
        }

        // Kurzzeit-Vorhersage (nächste 30 Minuten)
        const shortTermPrediction = await this.predictShortTerm(
          simulation.logicId,
          currentTime,
          logic,
          30 * 60 * 1000,
        )
        simulation.predictions.push(shortTermPrediction)
      } catch (error) {
        console.error('Simulation error:', error)
        simulation.status = 'error'
        simulation.error = error.message
        break
      }
    }

    // Simulation abgeschlossen
    simulation.status = 'completed'
    simulation.summary = this.generateSimulationSummary(simulation)
  }

  // 🆕 NEU: Vorhersage-Daten generieren
  async generateForecastData(logicId, timestamp, options) {
    const [espId, gpio] = logicId.split('-')
    const logic = this.actuatorLogicStore.getActuatorLogic(espId, gpio)
    const forecastData = {}

    if (logic.conditions) {
      for (const condition of logic.conditions) {
        const sensor = this.sensorRegistry.getSensor(espId, condition.sensorGpio)
        if (sensor) {
          forecastData[condition.sensorGpio] = await this.forecastSensorValue(
            sensor,
            timestamp,
            options,
          )
        }
      }
    }

    return forecastData
  }

  // 🆕 NEU: Sensor-Wert vorhersagen
  async forecastSensorValue(sensor, timestamp, options) {
    const forecast = {
      value: sensor.value,
      confidence: 0.5,
      trend: 'stable',
      factors: [],
    }

    // Historische Daten verwenden
    if (options.includeHistorical && sensor.history && sensor.history.length > 0) {
      const historicalTrend = this.analyzeHistoricalTrend(sensor.history, timestamp)
      forecast.value = historicalTrend.predictedValue
      forecast.confidence = historicalTrend.confidence
      forecast.trend = historicalTrend.trend
      forecast.factors.push('historical_data')
    }

    // Trend-Analyse
    if (options.includeTrends) {
      const trendAnalysis = this.analyzeTrend(sensor, timestamp)
      forecast.value = this.combinePredictions(forecast.value, trendAnalysis.predictedValue, 0.7)
      forecast.confidence = Math.min(forecast.confidence + 0.2, 1.0)
      forecast.factors.push('trend_analysis')
    }

    // Wetter-Daten (falls verfügbar)
    if (options.includeWeather) {
      const weatherImpact = await this.getWeatherImpact(sensor, timestamp)
      if (weatherImpact) {
        forecast.value = this.combinePredictions(forecast.value, weatherImpact.predictedValue, 0.3)
        forecast.factors.push('weather_data')
      }
    }

    // Zyklische Muster (Tages-/Wochenzyklen)
    const cyclicPattern = this.analyzeCyclicPattern(sensor, timestamp)
    if (cyclicPattern.confidence > 0.3) {
      forecast.value = this.combinePredictions(forecast.value, cyclicPattern.predictedValue, 0.4)
      forecast.factors.push('cyclic_pattern')
    }

    return forecast
  }

  // 🆕 NEU: Historischen Trend analysieren
  analyzeHistoricalTrend(history, timestamp) {
    if (history.length < 3) {
      return {
        predictedValue: history[history.length - 1]?.value || 0,
        confidence: 0.3,
        trend: 'stable',
      }
    }

    // Lineare Regression für Trend
    const recentData = history.slice(-10) // Letzte 10 Datenpunkte
    const xValues = recentData.map((_, index) => index)
    const yValues = recentData.map((h) => h.value)

    const { slope, intercept } = this.calculateLinearRegression(xValues, yValues)

    // Vorhersage für nächsten Zeitpunkt
    const timeSteps = (timestamp - recentData[recentData.length - 1].timestamp) / (5 * 60 * 1000) // 5-Minuten-Intervalle
    const predictedValue = slope * timeSteps + intercept

    return {
      predictedValue: Math.max(0, predictedValue), // Keine negativen Werte
      confidence: Math.abs(slope) > 0.1 ? 0.7 : 0.5,
      trend: slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable',
    }
  }

  // 🆕 NEU: Trend analysieren
  analyzeTrend(sensor, timestamp) {
    const now = new Date(timestamp)
    const hour = now.getHours()

    // Einfache Trend-Basierung auf Tageszeit
    let trendFactor = 1.0

    // Temperatur-Trends basierend auf Tageszeit
    if (sensor.type === 'SENSOR_TEMP_DS18B20') {
      if (hour >= 6 && hour <= 12) {
        trendFactor = 1.1 // Morgens steigend
      } else if (hour >= 18 && hour <= 22) {
        trendFactor = 0.9 // Abends fallend
      }
    }

    // Feuchtigkeit-Trends
    if (sensor.type === 'SENSOR_MOISTURE') {
      if (hour >= 6 && hour <= 10) {
        trendFactor = 0.95 // Morgens leicht fallend (Bewässerung)
      } else if (hour >= 14 && hour <= 18) {
        trendFactor = 1.05 // Nachmittags steigend
      }
    }

    return {
      predictedValue: sensor.value * trendFactor,
      confidence: 0.6,
      trend: trendFactor > 1 ? 'increasing' : trendFactor < 1 ? 'decreasing' : 'stable',
    }
  }

  // 🆕 NEU: Wetter-Impact (Dummy-Implementation)
  async getWeatherImpact() {
    // In einer echten Implementation würde hier eine Wetter-API aufgerufen
    return null
  }

  // 🆕 NEU: Zyklische Muster analysieren
  analyzeCyclicPattern(sensor, timestamp) {
    const now = new Date(timestamp)
    const hour = now.getHours()

    // Tageszyklen
    let cyclicValue = sensor.value

    if (sensor.type === 'SENSOR_TEMP_DS18B20') {
      // Temperatur folgt Tagesrhythmus
      const baseTemp = 20
      const amplitude = 5
      const phase = ((hour - 6) * Math.PI) / 12 // Höchsttemperatur um 14 Uhr
      cyclicValue = baseTemp + amplitude * Math.sin(phase)
    }

    if (sensor.type === 'SENSOR_MOISTURE') {
      // Feuchtigkeit folgt Bewässerungsrhythmus
      if (hour >= 6 && hour <= 8) {
        cyclicValue = sensor.value * 0.8 // Nach Bewässerung
      } else if (hour >= 18 && hour <= 20) {
        cyclicValue = sensor.value * 1.2 // Vor Bewässerung
      }
    }

    return {
      predictedValue: cyclicValue,
      confidence: 0.4,
      pattern: 'daily_cycle',
    }
  }

  // 🆕 NEU: Vorhersagen kombinieren
  combinePredictions(value1, value2, weight) {
    return value1 * (1 - weight) + value2 * weight
  }

  // 🆕 NEU: Lineare Regression berechnen
  calculateLinearRegression(xValues, yValues) {
    const n = xValues.length
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0

    for (let i = 0; i < n; i++) {
      sumX += xValues[i]
      sumY += yValues[i]
      sumXY += xValues[i] * yValues[i]
      sumX2 += xValues[i] * xValues[i]
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    return { slope, intercept }
  }

  // 🆕 NEU: Logik mit Vorhersage-Daten auswerten
  async evaluateLogicWithForecast(logic, forecastData) {
    // Temporäre Sensor-Werte setzen
    const originalValues = new Map()

    for (const [sensorGpio, forecast] of Object.entries(forecastData)) {
      const sensor = this.sensorRegistry.getSensor(logic.espId, sensorGpio)
      if (sensor) {
        originalValues.set(sensorGpio, sensor.value)
        sensor.value = forecast.value
      }
    }

    try {
      // Logik auswerten
      const evaluation = await this.actuatorLogicStore.evaluateLogic(logic.espId, logic.gpio)

      // Werte wiederherstellen
      for (const [sensorGpio, value] of originalValues) {
        const sensor = this.sensorRegistry.getSensor(logic.espId, sensorGpio)
        if (sensor) {
          sensor.value = value
        }
      }

      // Konfidenz basierend auf Vorhersage-Qualität
      const avgConfidence =
        Object.values(forecastData).reduce((sum, f) => sum + f.confidence, 0) /
        Object.keys(forecastData).length

      return {
        ...evaluation,
        confidence: avgConfidence,
        forecastData,
      }
    } catch (error) {
      // Werte wiederherstellen bei Fehler
      for (const [sensorGpio, value] of originalValues) {
        const sensor = this.sensorRegistry.getSensor(logic.espId, sensorGpio)
        if (sensor) {
          sensor.value = value
        }
      }
      throw error
    }
  }

  // 🆕 NEU: Trigger-Event erkennen
  isTriggerEvent(dataPoint, dataPoints) {
    if (dataPoints.length < 2) return false

    const previousPoint = dataPoints[dataPoints.length - 2]
    return previousPoint.actuatorState !== dataPoint.actuatorState
  }

  // 🆕 NEU: Vorherigen Zustand abrufen
  getPreviousState(dataPoints, currentTime) {
    const previousPoints = dataPoints.filter((p) => p.timestamp < currentTime)
    if (previousPoints.length === 0) return false

    return previousPoints[previousPoints.length - 1].actuatorState
  }

  // 🆕 NEU: Kurzzeit-Vorhersage
  async predictShortTerm(logicId, currentTime, logic, duration) {
    const prediction = {
      timestamp: currentTime,
      duration,
      predictions: [],
      confidence: 0.5,
    }

    const interval = 5 * 60 * 1000 // 5 Minuten
    for (let time = currentTime + interval; time <= currentTime + duration; time += interval) {
      const forecastData = await this.generateForecastData(logicId, time, { includeTrends: true })
      const evaluation = await this.evaluateLogicWithForecast(logic, forecastData, time)

      prediction.predictions.push({
        timestamp: time,
        state: evaluation.state,
        confidence: evaluation.confidence,
      })
    }

    prediction.confidence =
      prediction.predictions.reduce((sum, p) => sum + p.confidence, 0) /
      prediction.predictions.length
    return prediction
  }

  // 🆕 NEU: Simulations-Zusammenfassung generieren
  generateSimulationSummary(simulation) {
    const totalDataPoints = simulation.dataPoints.length
    const activeTime = simulation.dataPoints.filter((d) => d.actuatorState).length
    const triggerCount = simulation.triggers.length

    const summary = {
      totalDataPoints,
      activeTime,
      activePercentage: (activeTime / totalDataPoints) * 100,
      triggerCount,
      averageConfidence:
        simulation.dataPoints.reduce((sum, d) => sum + d.confidence, 0) / totalDataPoints,
      duration: simulation.endTime - simulation.startTime,
      status: simulation.status,
    }

    // Trigger-Analyse
    if (triggerCount > 0) {
      summary.triggerAnalysis = {
        averageInterval: (simulation.endTime - simulation.startTime) / triggerCount,
        mostCommonReason: this.getMostCommonTriggerReason(simulation.triggers),
        stateChanges: {
          offToOn: simulation.triggers.filter((t) => !t.fromState && t.toState).length,
          onToOff: simulation.triggers.filter((t) => t.fromState && !t.toState).length,
        },
      }
    }

    return summary
  }

  // 🆕 NEU: Häufigsten Trigger-Grund finden
  getMostCommonTriggerReason(triggers) {
    const reasons = triggers.map((t) => t.reason)
    const reasonCounts = {}

    reasons.forEach((reason) => {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
    })

    return Object.entries(reasonCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown'
  }

  // 🆕 NEU: Simulation abrufen
  getSimulation(simulationId) {
    return this.simulations.get(simulationId)
  }

  // 🆕 NEU: Alle Simulationen abrufen
  getAllSimulations() {
    return Array.from(this.simulations.values())
  }

  // 🆕 NEU: Simulation stoppen
  stopSimulation(simulationId) {
    const simulation = this.simulations.get(simulationId)
    if (simulation) {
      simulation.status = 'stopped'
    }
  }

  // 🆕 NEU: Alle Simulationen löschen
  clearSimulations() {
    this.simulations.clear()
  }

  // 🆕 NEU: Kalender-Ansicht für Simulation
  generateCalendarView(simulation, startDate, endDate) {
    const calendar = {
      startDate,
      endDate,
      days: [],
    }

    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dayData = {
        date: new Date(currentDate),
        dataPoints: [],
        triggers: [],
        summary: {},
      }

      // Datenpunkte für diesen Tag
      dayData.dataPoints = simulation.dataPoints.filter((d) => {
        const dataDate = new Date(d.timestamp)
        return dataDate.toDateString() === currentDate.toDateString()
      })

      // Trigger für diesen Tag
      dayData.triggers = simulation.triggers.filter((t) => {
        const triggerDate = new Date(t.timestamp)
        return triggerDate.toDateString() === currentDate.toDateString()
      })

      // Tages-Zusammenfassung
      if (dayData.dataPoints.length > 0) {
        dayData.summary = {
          totalPoints: dayData.dataPoints.length,
          activeTime: dayData.dataPoints.filter((d) => d.actuatorState).length,
          triggerCount: dayData.triggers.length,
          averageConfidence:
            dayData.dataPoints.reduce((sum, d) => sum + d.confidence, 0) /
            dayData.dataPoints.length,
        }
      }

      calendar.days.push(dayData)
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return calendar
  }
}

// 🆕 NEU: Singleton-Instanz
export const logicSimulation = new LogicSimulation()
