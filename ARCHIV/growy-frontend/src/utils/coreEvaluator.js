// 🆕 NEU: Zentrale Evaluierungsschicht für alle Logik-Module
import { useActuatorLogicStore } from '@/stores/actuatorLogic'
import { useSensorRegistryStore } from '@/stores/sensorRegistry'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { computed } from 'vue'
import { timeToMinutes } from '@/utils/time'

export class CoreEvaluator {
  constructor() {
    this.actuatorLogicStore = useActuatorLogicStore()
    this.sensorRegistry = useSensorRegistryStore()
    const centralDataHub = useCentralDataHub()
    this.mqttStore = computed(() => centralDataHub.storeReferences.mqtt)
  }

  // ✅ NEU: Zentrale Evaluierungsmethode für alle Module
  async evaluateLogic(espId, gpio) {
    const logic = this.actuatorLogicStore.getActuatorLogic(espId, gpio)
    if (!logic) {
      return {
        error: 'Keine Logik gefunden',
        explanation: 'Für diesen Aktor ist keine Logik konfiguriert.',
      }
    }

    const evaluation = {
      logicId: `${espId}-${gpio}`,
      timestamp: Date.now(),
      logic,
      sensorValues: {},
      conditionResults: {},
      timerResults: {},
      eventResults: {},
      finalDecision: null,
      confidence: 0.5,
      debugInfo: {},
    }

    try {
      // ✅ BESTEHEND: Verwende bestehende ActuatorLogicEngine
      const engine = this.actuatorLogicStore.logicEngine
      const finalState = engine.evaluateActuatorState(espId, gpio, logic.actuator?.type)

      evaluation.finalDecision = {
        state: finalState.state,
        source: finalState.source,
        priority: finalState.priority,
        reason: finalState.reason,
      }

      // Sensor-Werte sammeln für Debug-Info
      evaluation.sensorValues = await this.collectSensorValues(espId, logic)

      // Bedingungen auswerten
      evaluation.conditionResults = await this.evaluateConditions(
        espId,
        logic,
        evaluation.sensorValues,
      )

      // Timer auswerten
      evaluation.timerResults = await this.evaluateTimers(espId, logic)

      // Events auswerten
      evaluation.eventResults = await this.evaluateEvents(espId, logic)

      // Konfidenz berechnen
      evaluation.confidence = this.calculateConfidence(evaluation)

      // Debug-Informationen
      evaluation.debugInfo = {
        logicVersion: logic.version || '1.0',
        evaluationTime: Date.now() - evaluation.timestamp,
        sensorCount: Object.keys(evaluation.sensorValues).length,
        conditionCount: logic.conditions?.length || 0,
        timerCount: logic.timers?.length || 0,
        eventCount: logic.events?.length || 0,
      }
    } catch (error) {
      evaluation.error = error.message
      evaluation.finalDecision = {
        state: false,
        source: 'ERROR',
        priority: 0,
        reason: error.message,
      }
    }

    return evaluation
  }

  // ✅ NEU: Vorhersage-Evaluierung für Simulation
  async evaluateLogicWithForecast(logic, forecastData, timestamp) {
    const evaluation = {
      logicId: `${logic.espId}-${logic.gpio}`,
      timestamp,
      logic,
      forecastData,
      finalDecision: null,
      confidence: 0.5,
    }

    try {
      // Temporäre Sensor-Werte mit Vorhersage-Daten setzen
      const originalValues = new Map()

      for (const [sensorGpio, forecast] of Object.entries(forecastData)) {
        const sensor = this.sensorRegistry.getSensor(logic.espId, sensorGpio)
        if (sensor) {
          originalValues.set(sensorGpio, sensor.value)
          sensor.value = forecast.value
        }
      }

      // Logik mit Vorhersage-Daten auswerten
      const engine = this.actuatorLogicStore.logicEngine
      const finalState = engine.evaluateActuatorState(logic.espId, logic.gpio, logic.actuator?.type)

      evaluation.finalDecision = {
        state: finalState.state,
        source: finalState.source,
        priority: finalState.priority,
        reason: finalState.reason,
      }

      // Konfidenz basierend auf Vorhersage-Qualität
      const avgConfidence =
        Object.values(forecastData).reduce((sum, f) => sum + (f.confidence || 0.5), 0) /
        Object.keys(forecastData).length
      evaluation.confidence = avgConfidence

      // Werte wiederherstellen
      for (const [sensorGpio, value] of originalValues) {
        const sensor = this.sensorRegistry.getSensor(logic.espId, sensorGpio)
        if (sensor) {
          sensor.value = value
        }
      }
    } catch (error) {
      evaluation.error = error.message
      evaluation.finalDecision = {
        state: false,
        source: 'ERROR',
        priority: 0,
        reason: error.message,
      }
    }

    return evaluation
  }

  // ✅ NEU: Sensor-Werte sammeln
  async collectSensorValues(espId, logic) {
    const sensorValues = {}

    if (logic.conditions) {
      for (const condition of logic.conditions) {
        const sensor = this.sensorRegistry.getSensor(espId, condition.sensorGpio)
        if (sensor) {
          sensorValues[condition.sensorGpio] = {
            value: sensor.value,
            unit: sensor.unit,
            name: sensor.name,
            type: sensor.type,
            lastUpdate: sensor.lastUpdate,
            status: sensor.status || 'active',
          }
        } else {
          sensorValues[condition.sensorGpio] = {
            value: null,
            status: 'not_found',
            error: `Sensor ${condition.sensorGpio} nicht gefunden`,
          }
        }
      }
    }

    return sensorValues
  }

  // ✅ NEU: Bedingungen auswerten
  async evaluateConditions(espId, logic, sensorValues) {
    const results = {
      totalConditions: logic.conditions?.length || 0,
      metConditions: 0,
      failedConditions: 0,
      conditionDetails: [],
      overallResult: false,
    }

    if (!logic.conditions || logic.conditions.length === 0) {
      results.overallResult = true // Keine Bedingungen = immer erfüllt
      return results
    }

    for (const condition of logic.conditions) {
      const sensor = sensorValues[condition.sensorGpio]
      const conditionResult = {
        sensorGpio: condition.sensorGpio,
        operator: condition.operator,
        threshold: condition.threshold,
        actualValue: sensor?.value,
        met: false,
        reason: '',
      }

      if (sensor && sensor.value !== null && sensor.value !== undefined) {
        const value = Number(sensor.value)
        const threshold = Number(condition.threshold)

        switch (condition.operator) {
          case '>':
            conditionResult.met = value > threshold
            break
          case '<':
            conditionResult.met = value < threshold
            break
          case '>=':
            conditionResult.met = value >= threshold
            break
          case '<=':
            conditionResult.met = value <= threshold
            break
          case '==':
            conditionResult.met = value === threshold
            break
          case '!=':
            conditionResult.met = value !== threshold
            break
        }

        conditionResult.reason = `${value} ${condition.operator} ${threshold} = ${conditionResult.met}`
      } else {
        conditionResult.reason = 'Sensor-Wert nicht verfügbar'
      }

      results.conditionDetails.push(conditionResult)

      if (conditionResult.met) {
        results.metConditions++
      } else {
        results.failedConditions++
      }
    }

    // Alle Bedingungen müssen erfüllt sein (AND-Logik)
    results.overallResult = results.metConditions === results.totalConditions

    return results
  }

  // ✅ NEU: Timer auswerten
  async evaluateTimers(espId, logic) {
    const results = {
      totalTimers: logic.timers?.length || 0,
      activeTimers: 0,
      timerDetails: [],
      overallResult: false,
    }

    if (!logic.timers || logic.timers.length === 0) {
      results.overallResult = true // Keine Timer = immer erfüllt
      return results
    }

    const now = new Date()
    const currentTime = now.getHours() * 60 + now.getMinutes()
    const currentDay = now.getDay()

    for (const timer of logic.timers) {
      const timerResult = {
        name: timer.name || 'Unnamed Timer',
        startTime: timer.startTime,
        endTime: timer.endTime,
        days: timer.days,
        active: false,
        reason: '',
      }

      if (timer.days.includes(currentDay)) {
        const startMinutes = timeToMinutes(timer.startTime)
        const endMinutes = timeToMinutes(timer.endTime)

        if (startMinutes <= endMinutes) {
          // Normaler Timer (z.B. 08:00 - 18:00)
          timerResult.active = currentTime >= startMinutes && currentTime <= endMinutes
        } else {
          // Über-Mitternacht Timer (z.B. 22:00 - 06:00)
          timerResult.active = currentTime >= startMinutes || currentTime <= endMinutes
        }

        timerResult.reason = timerResult.active ? 'Timer aktiv' : 'Timer inaktiv'
      } else {
        timerResult.reason = 'Heute nicht aktiv'
      }

      results.timerDetails.push(timerResult)

      if (timerResult.active) {
        results.activeTimers++
      }
    }

    // Mindestens ein Timer muss aktiv sein (OR-Logik)
    results.overallResult = results.activeTimers > 0

    return results
  }

  // ✅ NEU: Events auswerten
  async evaluateEvents(espId, logic) {
    const results = {
      totalEvents: logic.events?.length || 0,
      activeEvents: 0,
      eventDetails: [],
      overallResult: false,
    }

    if (!logic.events || logic.events.length === 0) {
      results.overallResult = true // Keine Events = immer erfüllt
      return results
    }

    // Event-Auswertung basierend auf bestehender Engine
    for (const event of logic.events) {
      const eventResult = {
        name: event.name || 'Unnamed Event',
        type: event.type,
        active: false,
        reason: '',
      }

      // Event-spezifische Auswertung
      switch (event.type) {
        case 'manual_trigger':
          eventResult.active = event.triggered || false
          eventResult.reason = eventResult.active ? 'Manuell ausgelöst' : 'Nicht ausgelöst'
          break
        case 'scheduled': {
          // Zeitbasierte Events
          const now = new Date()
          const eventTime = new Date(event.scheduledTime)
          eventResult.active =
            Math.abs(now.getTime() - eventTime.getTime()) < (event.duration || 60000) // 1 Minute Standard
          eventResult.reason = eventResult.active ? 'Zeitplan aktiv' : 'Zeitplan inaktiv'
          break
        }
        default:
          eventResult.reason = 'Unbekannter Event-Typ'
      }

      results.eventDetails.push(eventResult)

      if (eventResult.active) {
        results.activeEvents++
      }
    }

    // Mindestens ein Event muss aktiv sein (OR-Logik)
    results.overallResult = results.activeEvents > 0

    return results
  }

  // ✅ NEU: Konfidenz berechnen
  calculateConfidence(evaluation) {
    let confidence = 0.5 // Basis-Konfidenz

    // Sensor-Verfügbarkeit
    const totalSensors = Object.keys(evaluation.sensorValues).length
    const availableSensors = Object.values(evaluation.sensorValues).filter(
      (s) => s.status === 'active',
    ).length

    if (totalSensors > 0) {
      confidence += (availableSensors / totalSensors) * 0.2
    }

    // Bedingungs-Qualität
    if (evaluation.conditionResults.totalConditions > 0) {
      const conditionQuality =
        evaluation.conditionResults.metConditions / evaluation.conditionResults.totalConditions
      confidence += conditionQuality * 0.2
    }

    // Timer-Qualität
    if (evaluation.timerResults.totalTimers > 0) {
      const timerQuality =
        evaluation.timerResults.activeTimers / evaluation.timerResults.totalTimers
      confidence += timerQuality * 0.1
    }

    return Math.min(confidence, 1.0)
  }
}

// ✅ NEU: Singleton-Instanz für globale Nutzung
export const coreEvaluator = new CoreEvaluator()
