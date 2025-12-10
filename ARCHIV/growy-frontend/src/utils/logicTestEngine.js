// 🆕 NEU: Logic Test Engine für automatisierte Tests
import { useActuatorLogicStore } from '@/stores/actuatorLogic'
import { useSensorRegistryStore } from '@/stores/sensorRegistry'
import { actuatorLogicValidation } from './actuatorLogicValidation'
import { timeToMinutes } from '@/utils/time'

export class LogicTestEngine {
  constructor() {
    this.actuatorLogicStore = useActuatorLogicStore()
    this.sensorRegistry = useSensorRegistryStore()
    this.testResults = new Map()
    this.simulationData = new Map()
  }

  // 🆕 NEU: Test-Suite ausführen
  async runTestSuite(espId, gpio, testCases = null) {
    const logic = this.actuatorLogicStore.getActuatorLogic(espId, gpio)
    if (!logic) {
      throw new Error(`Keine Logik gefunden für ESP ${espId}, GPIO ${gpio}`)
    }

    // Test-Cases generieren falls nicht vorhanden
    if (!testCases) {
      const validation = actuatorLogicValidation.validateWithSeverity(logic)
      testCases = validation.testCases
    }

    const results = {
      logicId: `${espId}-${gpio}`,
      timestamp: Date.now(),
      totalTests: testCases.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      testResults: [],
      summary: {},
    }

    for (const testCase of testCases) {
      try {
        const testResult = await this.runTestCase(espId, gpio, testCase)
        results.testResults.push(testResult)

        if (testResult.status === 'passed') {
          results.passed++
        } else if (testResult.status === 'failed') {
          results.failed++
        } else {
          results.skipped++
        }
      } catch (error) {
        results.testResults.push({
          id: testCase.id,
          status: 'error',
          error: error.message,
          duration: 0,
        })
        results.failed++
      }
    }

    // Zusammenfassung generieren
    results.summary = this.generateTestSummary(results)

    // Ergebnisse speichern
    this.testResults.set(results.logicId, results)

    return results
  }

  // 🆕 NEU: Einzelnen Test ausführen
  async runTestCase(espId, gpio, testCase) {
    const startTime = Date.now()

    try {
      let result

      switch (testCase.type) {
        case 'condition':
          result = await this.testCondition(espId, gpio, testCase)
          break
        case 'timer':
          result = await this.testTimer(espId, gpio, testCase)
          break
        case 'integration':
          result = await this.testIntegration(espId, gpio, testCase)
          break
        default:
          throw new Error(`Unbekannter Test-Typ: ${testCase.type}`)
      }

      const duration = Date.now() - startTime

      return {
        id: testCase.id,
        name: testCase.name,
        type: testCase.type,
        status: result.passed ? 'passed' : 'failed',
        duration,
        expected: testCase.expected,
        actual: result.actual,
        details: result.details,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      return {
        id: testCase.id,
        name: testCase.name,
        type: testCase.type,
        status: 'error',
        duration,
        error: error.message,
      }
    }
  }

  // 🆕 NEU: Bedingungs-Test
  async testCondition(espId, gpio, testCase) {
    // Sensor-Werte temporär setzen
    const originalValues = new Map()

    for (const [sensorGpio, value] of Object.entries(testCase.input.sensors)) {
      const sensor = this.sensorRegistry.getSensor(espId, sensorGpio)
      if (sensor) {
        originalValues.set(sensorGpio, sensor.value)
        sensor.value = value
      }
    }

    try {
      // Logik auswerten
      const evaluation = await this.actuatorLogicStore.evaluateLogic(espId, gpio)

      // Werte wiederherstellen
      for (const [sensorGpio, value] of originalValues) {
        const sensor = this.sensorRegistry.getSensor(espId, sensorGpio)
        if (sensor) {
          sensor.value = value
        }
      }

      const passed = this.compareResults(evaluation, testCase.expected)

      return {
        passed,
        actual: evaluation,
        details: {
          sensorValues: testCase.input.sensors,
          evaluationResult: evaluation,
        },
      }
    } catch (error) {
      // Werte wiederherstellen bei Fehler
      for (const [sensorGpio, value] of originalValues) {
        const sensor = this.sensorRegistry.getSensor(espId, sensorGpio)
        if (sensor) {
          sensor.value = value
        }
      }
      throw error
    }
  }

  // 🆕 NEU: Timer-Test
  async testTimer(espId, gpio, testCase) {
    // Zeit temporär setzen
    const testTime = new Date()
    testTime.setHours(parseInt(testCase.input.time.split(':')[0]))
    testTime.setMinutes(parseInt(testCase.input.time.split(':')[1]))
    testTime.setDay(testCase.input.day)

    // Mock Date.now()
    const originalNow = Date.now
    Date.now = () => testTime.getTime()

    try {
      // Logik auswerten
      const evaluation = await this.actuatorLogicStore.evaluateLogic(espId, gpio)

      // Zeit wiederherstellen
      Date.now = originalNow

      const passed = this.compareResults(evaluation, testCase.expected)

      return {
        passed,
        actual: evaluation,
        details: {
          testTime: testTime.toISOString(),
          evaluationResult: evaluation,
        },
      }
    } catch (error) {
      // Zeit wiederherstellen bei Fehler
      Date.now = originalNow
      throw error
    }
  }

  // 🆕 NEU: Integration-Test
  async testIntegration(espId, gpio, testCase) {
    // Komplexe Szenarien mit mehreren Bedingungen
    const evaluation = await this.actuatorLogicStore.evaluateLogic(espId, gpio)

    const passed = this.compareResults(evaluation, testCase.expected)

    return {
      passed,
      actual: evaluation,
      details: {
        scenario: testCase.description,
        evaluationResult: evaluation,
      },
    }
  }

  // 🆕 NEU: Ergebnisse vergleichen
  compareResults(actual, expected) {
    // Zustand vergleichen
    if (expected.state !== undefined && actual.state !== expected.state) {
      return false
    }

    // Grund vergleichen (falls erwartet)
    if (expected.reason && actual.reason !== expected.reason) {
      return false
    }

    return true
  }

  // 🆕 NEU: Test-Zusammenfassung generieren
  generateTestSummary(results) {
    const summary = {
      successRate: (results.passed / results.totalTests) * 100,
      status: results.failed === 0 ? 'success' : results.passed > 0 ? 'partial' : 'failed',
      recommendations: [],
    }

    // Empfehlungen basierend auf Testergebnissen
    if (results.failed > 0) {
      summary.recommendations.push({
        type: 'test_failure',
        message: `${results.failed} Tests fehlgeschlagen - Logik überprüfen`,
        priority: 'high',
      })
    }

    if (results.passed === 0) {
      summary.recommendations.push({
        type: 'no_success',
        message: 'Keine Tests erfolgreich - Logik-Konfiguration prüfen',
        priority: 'critical',
      })
    }

    return summary
  }

  // 🆕 NEU: Live-Simulation mit echten Daten
  async runLiveSimulation(espId, gpio, duration = 60000) {
    const logic = this.actuatorLogicStore.getActuatorLogic(espId, gpio)
    if (!logic) {
      throw new Error(`Keine Logik gefunden für ESP ${espId}, GPIO ${gpio}`)
    }

    const simulation = {
      logicId: `${espId}-${gpio}`,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      dataPoints: [],
      predictions: [],
      status: 'running',
    }

    // Simulation starten
    const interval = setInterval(async () => {
      try {
        const currentTime = Date.now()
        if (currentTime >= simulation.endTime) {
          clearInterval(interval)
          simulation.status = 'completed'
          return
        }

        // Aktuelle Logik-Auswertung
        const evaluation = await this.actuatorLogicStore.evaluateLogic(espId, gpio)

        // Sensor-Daten sammeln
        const sensorData = {}
        if (logic.conditions) {
          for (const condition of logic.conditions) {
            const sensor = this.sensorRegistry.getSensor(espId, condition.sensorGpio)
            if (sensor) {
              sensorData[condition.sensorGpio] = {
                value: sensor.value,
                unit: sensor.unit,
                lastUpdate: sensor.lastUpdate,
              }
            }
          }
        }

        const dataPoint = {
          timestamp: currentTime,
          evaluation,
          sensorData,
          actuatorState: evaluation.state,
        }

        simulation.dataPoints.push(dataPoint)

        // Vorhersage für nächste 5 Minuten
        const prediction = await this.predictNextState(espId, gpio, logic, currentTime + 300000)
        simulation.predictions.push(prediction)
      } catch (error) {
        console.error('Simulation error:', error)
        simulation.status = 'error'
        simulation.error = error.message
        clearInterval(interval)
      }
    }, 5000) // Alle 5 Sekunden

    this.simulationData.set(simulation.logicId, simulation)
    return simulation
  }

  // 🆕 NEU: Zustandsvorhersage
  async predictNextState(espId, gpio, logic, targetTime) {
    const prediction = {
      timestamp: targetTime,
      predictedState: false,
      confidence: 0.5,
      factors: [],
    }

    // Timer-basierte Vorhersage
    if (logic.timers) {
      const targetDate = new Date(targetTime)
      const targetDay = targetDate.getDay()
      const targetMinutes = targetDate.getHours() * 60 + targetDate.getMinutes()

      for (const timer of logic.timers) {
        if (timer.days.includes(targetDay)) {
          const startMinutes = timeToMinutes(timer.startTime)
          const endMinutes = timeToMinutes(timer.endTime)

          if (targetMinutes >= startMinutes && targetMinutes <= endMinutes) {
            prediction.predictedState = true
            prediction.confidence += 0.3
            prediction.factors.push('timer_active')
          }
        }
      }
    }

    // Sensor-basierte Vorhersage (Trend-Analyse)
    if (logic.conditions) {
      for (const condition of logic.conditions) {
        const sensor = this.sensorRegistry.getSensor(espId, condition.sensorGpio)
        if (sensor && sensor.history && sensor.history.length > 0) {
          const trend = this.analyzeSensorTrend(sensor.history, targetTime)
          prediction.factors.push(`sensor_${condition.sensorGpio}_trend: ${trend}`)

          if (trend === 'increasing' && condition.operator === '>') {
            prediction.confidence += 0.2
          } else if (trend === 'decreasing' && condition.operator === '<') {
            prediction.confidence += 0.2
          }
        }
      }
    }

    prediction.confidence = Math.min(prediction.confidence, 1.0)
    return prediction
  }

  // 🆕 NEU: Sensor-Trend-Analyse
  analyzeSensorTrend(history, targetTime) {
    if (history.length < 3) return 'stable'

    const recentValues = history
      .filter((h) => h.timestamp > targetTime - 300000) // Letzte 5 Minuten
      .map((h) => h.value)
      .slice(-3)

    if (recentValues.length < 3) return 'stable'

    const trend = recentValues[2] - recentValues[0]
    if (trend > 0.1) return 'increasing'
    if (trend < -0.1) return 'decreasing'
    return 'stable'
  }

  // 🆕 NEU: Test-Ergebnisse abrufen
  getTestResults(logicId) {
    return this.testResults.get(logicId)
  }

  // 🆕 NEU: Simulation-Daten abrufen
  getSimulationData(logicId) {
    return this.simulationData.get(logicId)
  }

  // 🆕 NEU: Alle Tests löschen
  clearTestResults() {
    this.testResults.clear()
  }

  // 🆕 NEU: Alle Simulationen stoppen
  stopAllSimulations() {
    for (const [, simulation] of this.simulationData) {
      simulation.status = 'stopped'
    }
  }
}

// 🆕 NEU: Singleton-Instanz
export const logicTestEngine = new LogicTestEngine()
