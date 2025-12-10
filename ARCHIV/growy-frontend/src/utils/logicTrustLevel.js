// ✅ NEU: Vertrauenslevel-System basierend auf zentralen Evaluationsdaten
export class LogicTrustLevel {
  constructor() {
    this.trustLevels = {
      UNTESTED: { value: 0, label: 'Nicht getestet', color: 'grey' },
      SIMULATED: { value: 1, label: 'Simuliert', color: 'blue' },
      TESTED: { value: 2, label: 'Getestet', color: 'green' },
      VALIDATED: { value: 3, label: 'Validiert', color: 'success' },
      PRODUCTION: { value: 4, label: 'Produktion', color: 'primary' },
    }
  }

  // ✅ NEU: Vertrauenslevel aus zentralen Evaluationsdaten berechnen
  calculateTrustLevel(logic) {
    let score = 0
    const factors = []

    // Test-Status prüfen
    if (logic.testResults?.passed > 0) {
      score += 1
      factors.push('Tests bestanden')
    }

    // Simulation-Status prüfen
    if (logic.simulationResults?.completed) {
      score += 1
      factors.push('Simulation durchgeführt')
    }

    // Validierung prüfen
    if (logic.validationResults?.valid) {
      score += 1
      factors.push('Validierung bestanden')
    }

    // Produktionszeit prüfen
    if (logic.productionTime && logic.productionTime > 24 * 60 * 60 * 1000) {
      score += 1
      factors.push('24h+ in Produktion')
    }

    // Vertrauenslevel bestimmen
    let trustLevel = 'UNTESTED'
    if (score >= 4) trustLevel = 'PRODUCTION'
    else if (score >= 3) trustLevel = 'VALIDATED'
    else if (score >= 2) trustLevel = 'TESTED'
    else if (score >= 1) trustLevel = 'SIMULATED'

    return {
      level: trustLevel,
      score,
      factors,
      confidence: score / 4,
    }
  }

  // ✅ NEU: Vertrauenslevel-Informationen abrufen
  getTrustLevelInfo(level) {
    return this.trustLevels[level] || this.trustLevels.UNTESTED
  }

  // ✅ NEU: Vertrauenslevel aus Evaluationsdaten berechnen
  calculateTrustFromEvaluation(evaluation) {
    let score = 0
    const factors = []

    // Sensor-Verfügbarkeit
    const availableSensors = Object.values(evaluation.sensorValues).filter(
      (s) => s.status === 'active',
    ).length
    const totalSensors = Object.keys(evaluation.sensorValues).length

    if (totalSensors > 0) {
      const sensorAvailability = availableSensors / totalSensors
      if (sensorAvailability >= 0.9) {
        score += 0.5
        factors.push('Alle Sensoren verfügbar')
      } else if (sensorAvailability >= 0.7) {
        score += 0.25
        factors.push('Meiste Sensoren verfügbar')
      }
    }

    // Bedingungs-Qualität
    if (evaluation.conditionResults.totalConditions > 0) {
      const conditionQuality =
        evaluation.conditionResults.metConditions / evaluation.conditionResults.totalConditions
      if (conditionQuality >= 0.8) {
        score += 0.5
        factors.push('Bedingungen erfüllt')
      }
    }

    // Timer-Qualität
    if (evaluation.timerResults.totalTimers > 0) {
      const timerQuality =
        evaluation.timerResults.activeTimers / evaluation.timerResults.totalTimers
      if (timerQuality > 0) {
        score += 0.25
        factors.push('Timer aktiv')
      }
    }

    // Konfidenz-Wert
    if (evaluation.confidence >= 0.8) {
      score += 0.5
      factors.push('Hohe Konfidenz')
    } else if (evaluation.confidence >= 0.6) {
      score += 0.25
      factors.push('Mittlere Konfidenz')
    }

    // Vertrauenslevel bestimmen
    let trustLevel = 'UNTESTED'
    if (score >= 2.0) trustLevel = 'PRODUCTION'
    else if (score >= 1.5) trustLevel = 'VALIDATED'
    else if (score >= 1.0) trustLevel = 'TESTED'
    else if (score >= 0.5) trustLevel = 'SIMULATED'

    return {
      level: trustLevel,
      score: Math.min(score, 2.0),
      factors,
      confidence: score / 2.0,
    }
  }

  // ✅ NEU: Vertrauenslevel-Trend analysieren
  analyzeTrustTrend(trustHistory) {
    if (!trustHistory || trustHistory.length < 2) {
      return {
        trend: 'stable',
        direction: 'none',
        confidence: 0.5,
      }
    }

    const recentScores = trustHistory.slice(-5).map((t) => t.score)
    const trend = this.calculateTrend(recentScores)

    return {
      trend: trend.trend,
      direction: trend.direction,
      confidence: trend.confidence,
      recommendation: this.getTrustRecommendation(trend),
    }
  }

  // ✅ NEU: Trend berechnen
  calculateTrend(scores) {
    if (scores.length < 2) {
      return { trend: 'stable', direction: 'none', confidence: 0.5 }
    }

    const firstHalf = scores.slice(0, Math.floor(scores.length / 2))
    const secondHalf = scores.slice(Math.floor(scores.length / 2))

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

    const difference = secondAvg - firstAvg
    const threshold = 0.1

    if (Math.abs(difference) < threshold) {
      return { trend: 'stable', direction: 'none', confidence: 0.8 }
    } else if (difference > threshold) {
      return { trend: 'improving', direction: 'up', confidence: 0.7 }
    } else {
      return { trend: 'declining', direction: 'down', confidence: 0.7 }
    }
  }

  // ✅ NEU: Vertrauenslevel-Empfehlung generieren
  getTrustRecommendation(trend) {
    switch (trend.trend) {
      case 'improving':
        return 'Vertrauenslevel verbessert sich - weiterhin überwachen'
      case 'declining':
        return 'Vertrauenslevel sinkt - Tests und Validierung empfohlen'
      case 'stable':
        return 'Vertrauenslevel stabil - regelmäßige Überwachung ausreichend'
      default:
        return 'Vertrauenslevel überwachen'
    }
  }

  // ✅ NEU: Vertrauenslevel-Bericht generieren
  generateTrustReport(logic, evaluation) {
    const trustData = this.calculateTrustFromEvaluation(evaluation)
    const trustInfo = this.getTrustLevelInfo(trustData.level)

    return {
      logicId: logic.logicId || `${logic.espId}-${logic.gpio}`,
      timestamp: Date.now(),
      trustLevel: trustData.level,
      trustScore: trustData.score,
      confidence: trustData.confidence,
      factors: trustData.factors,
      color: trustInfo.color,
      label: trustInfo.label,
      recommendations: this.generateTrustRecommendations(trustData, evaluation),
    }
  }

  // ✅ NEU: Vertrauenslevel-Empfehlungen generieren
  generateTrustRecommendations(trustData, evaluation) {
    const recommendations = []

    // Niedrige Konfidenz
    if (trustData.confidence < 0.5) {
      recommendations.push({
        type: 'confidence',
        priority: 'high',
        message: 'Niedrige Konfidenz - Tests durchführen',
        action: 'run_tests',
      })
    }

    // Fehlende Sensoren
    const unavailableSensors = Object.values(evaluation.sensorValues).filter(
      (s) => s.status !== 'active',
    )
    if (unavailableSensors.length > 0) {
      recommendations.push({
        type: 'sensor',
        priority: 'medium',
        message: `${unavailableSensors.length} Sensor(s) nicht verfügbar`,
        action: 'check_sensors',
      })
    }

    // Fehlgeschlagene Bedingungen
    if (evaluation.conditionResults.failedConditions > 0) {
      recommendations.push({
        type: 'condition',
        priority: 'medium',
        message: `${evaluation.conditionResults.failedConditions} Bedingung(en) nicht erfüllt`,
        action: 'review_conditions',
      })
    }

    return recommendations
  }
}

// ✅ NEU: Singleton-Instanz
export const logicTrustLevel = new LogicTrustLevel()
