// ✅ ANPASSUNG: Logic Explainability Module - Nutzt zentrale Evaluierungsschicht
import { coreEvaluator } from './coreEvaluator'

export class LogicExplainability {
  constructor() {
    // Keine eigenen Store-Referenzen mehr - nutzt CoreEvaluator
  }

  // ✅ ANPASSUNG: Vollständige Logik-Erklärung generieren - nutzt gemeinsame Evaluierung
  async explainLogicDecision(espId, gpio, context = {}) {
    // ✅ NEU: Verwende gemeinsame Evaluierung
    const evaluation = await coreEvaluator.evaluateLogic(espId, gpio, context)

    if (evaluation.error) {
      return {
        error: evaluation.error,
        explanation: evaluation.explanation || 'Fehler bei der Logik-Auswertung',
      }
    }

    const explanation = {
      logicId: evaluation.logicId,
      timestamp: evaluation.timestamp,
      logic: evaluation.logic,
      steps: [],
      finalDecision: evaluation.finalDecision,
      confidence: evaluation.confidence,
      recommendations: [],
      debugInfo: evaluation.debugInfo,
    }

    // ✅ NEU: Erkläre die Entscheidung basierend auf gemeinsamer Evaluierung
    explanation.steps = this.generateExplanationSteps(evaluation)
    explanation.recommendations = this.generateRecommendations(explanation)

    return explanation
  }

  // ✅ NEU: Erklärungsschritte aus gemeinsamer Evaluierung generieren
  generateExplanationSteps(evaluation) {
    const steps = []

    // Schritt 1: Sensor-Werte sammeln
    steps.push({
      step: 1,
      title: 'Sensor-Werte sammeln',
      description: 'Aktuelle Werte aller relevanten Sensoren werden abgerufen',
      data: evaluation.sensorValues,
      status: 'completed',
    })

    // Schritt 2: Bedingungen auswerten
    steps.push({
      step: 2,
      title: 'Bedingungen auswerten',
      description: 'Alle konfigurierten Bedingungen werden geprüft',
      data: evaluation.conditionResults,
      status: 'completed',
    })

    // Schritt 3: Timer prüfen
    steps.push({
      step: 3,
      title: 'Timer prüfen',
      description: 'Zeitbasierte Bedingungen werden ausgewertet',
      data: evaluation.timerResults,
      status: 'completed',
    })

    // Schritt 4: Events prüfen
    steps.push({
      step: 4,
      title: 'Events prüfen',
      description: 'Event-basierte Bedingungen werden ausgewertet',
      data: evaluation.eventResults,
      status: 'completed',
    })

    // Schritt 5: Finale Entscheidung
    steps.push({
      step: 5,
      title: 'Finale Entscheidung',
      description: 'Endgültiger Aktor-Zustand wird bestimmt',
      data: {
        state: evaluation.finalDecision.state,
        source: evaluation.finalDecision.source,
        reason: evaluation.finalDecision.reason,
      },
      status: 'completed',
    })

    return steps
  }

  // ✅ NEU: Empfehlungen generieren
  generateRecommendations(explanation) {
    const recommendations = []

    // Sensor-Empfehlungen
    const sensorStep = explanation.steps.find((s) => s.step === 1)
    if (sensorStep) {
      const unavailableSensors = Object.values(sensorStep.data).filter((s) => s.status !== 'active')
      if (unavailableSensors.length > 0) {
        recommendations.push({
          type: 'sensor',
          priority: 'high',
          message: `${unavailableSensors.length} Sensor(s) nicht verfügbar`,
          action: 'check_sensors',
        })
      }
    }

    // Bedingungs-Empfehlungen
    const conditionStep = explanation.steps.find((s) => s.step === 2)
    if (conditionStep && conditionStep.data.failedConditions > 0) {
      recommendations.push({
        type: 'condition',
        priority: 'medium',
        message: `${conditionStep.data.failedConditions} Bedingung(en) nicht erfüllt`,
        action: 'review_conditions',
      })
    }

    // Timer-Empfehlungen
    const timerStep = explanation.steps.find((s) => s.step === 3)
    if (timerStep && timerStep.data.totalTimers > 0 && timerStep.data.activeTimers === 0) {
      recommendations.push({
        type: 'timer',
        priority: 'low',
        message: 'Keine Timer aktiv - Zeitplan prüfen',
        action: 'check_schedule',
      })
    }

    return recommendations
  }

  // ✅ NEU: Hilfsfunktionen
  getDayName(dayIndex) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
    return days[dayIndex] || 'Unbekannt'
  }

  // ✅ NEU: Erklärung als Text exportieren
  exportExplanationAsText(explanation) {
    let text = `Logik-Erklärung für ${explanation.logicId}\n`
    text += `Zeitpunkt: ${new Date(explanation.timestamp).toLocaleString()}\n\n`

    for (const step of explanation.steps) {
      text += `Schritt ${step.step}: ${step.title}\n`
      text += `${step.description}\n`

      if (step.data) {
        text += `Status: ${step.status}\n`
        if (step.data.overallResult !== undefined) {
          text += `Ergebnis: ${step.data.overallResult ? 'Erfüllt' : 'Nicht erfüllt'}\n`
        }
      }
      text += '\n'
    }

    text += `Finale Entscheidung:\n`
    text += `Zustand: ${explanation.finalDecision.state ? 'Aktiv' : 'Inaktiv'}\n`
    text += `Quelle: ${explanation.finalDecision.source}\n`
    text += `Grund: ${explanation.finalDecision.reason}\n`
    text += `Konfidenz: ${(explanation.confidence * 100).toFixed(1)}%\n`

    return text
  }
}

// ✅ NEU: Singleton-Instanz
export const logicExplainability = new LogicExplainability()
