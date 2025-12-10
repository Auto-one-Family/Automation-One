// 🆕 NEU: Aktor-Logik-Validierung
import { timeToMinutes, minutesToTime } from '@/utils/time'

export const actuatorLogicValidation = {
  // 🆕 NEU: JSON Schema-Validierung
  async validateAgainstSchema(logic) {
    try {
      // Dynamischer Import für Schema-Validierung
      const Ajv = await import('ajv')
      const ajv = new Ajv.default({ allErrors: true })

      // Schema laden (wird zur Laufzeit geladen)
      const logicSchema = await import('@/schemas/logic.schema.json')
      const validate = ajv.compile(logicSchema.default)
      const valid = validate(logic)

      return {
        valid,
        errors: validate.errors || [],
        schemaVersion: logicSchema.default.version,
      }
    } catch (error) {
      return {
        valid: false,
        errors: [{ message: `Schema-Validierung fehlgeschlagen: ${error.message}` }],
        schemaVersion: 'unknown',
      }
    }
  },

  // 🆕 NEU: Logische Vollständigkeit prüfen
  validateLogicRule(rule) {
    const errors = []

    // Prüfe Aktor
    if (!rule.actuator) {
      errors.push('Kein Aktor definiert')
    }

    // Prüfe Bedingungen
    if (!rule.conditions || rule.conditions.length === 0) {
      errors.push('Keine Bedingungen definiert')
    } else {
      rule.conditions.forEach((condition, index) => {
        if (!condition.sensorGpio) {
          errors.push(`Bedingung ${index + 1}: Sensor nicht definiert`)
        }
        if (!condition.operator) {
          errors.push(`Bedingung ${index + 1}: Vergleichsoperator fehlt`)
        }
        if (condition.threshold === undefined || condition.threshold === null) {
          errors.push(`Bedingung ${index + 1}: Schwellenwert fehlt`)
        }
      })
    }

    // Prüfe Timer
    if (rule.timers && rule.timers.length > 0) {
      rule.timers.forEach((timer, index) => {
        if (!timer.startTime || !timer.endTime) {
          errors.push(`Timer ${index + 1}: Start- oder Endzeit fehlt`)
        }
        if (!timer.days || timer.days.length === 0) {
          errors.push(`Timer ${index + 1}: Keine Tage definiert`)
        }
      })
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      reason: errors.length > 0 ? errors.join(', ') : null,
    }
  },

  // 🆕 NEU: Zyklische Redundanz prüfen
  checkCircularDependencies(rule) {
    const dependencies = new Set()
    const circular = []

    // Sammle alle Abhängigkeiten
    if (rule.conditions) {
      rule.conditions.forEach((condition) => {
        if (condition.sensorGpio) {
          dependencies.add(`sensor_${condition.sensorGpio}`)
        }
      })
    }

    // Prüfe auf Selbstreferenzierung
    if (dependencies.has(`actuator_${rule.actuator?.gpio}`)) {
      circular.push('Aktor referenziert sich selbst')
    }

    return {
      hasCircular: circular.length > 0,
      circular: circular,
    }
  },

  // 🆕 NEU: Sicherheitsvalidierung
  validateSafetyConstraints(rule) {
    const warnings = []

    // Prüfe gefährliche Kombinationen
    if (rule.actuator?.type === 'ACTUATOR_PUMP') {
      const hasMoistureSensor = rule.conditions?.some((c) => c.sensorType === 'SENSOR_MOISTURE')

      if (!hasMoistureSensor) {
        warnings.push('Pumpe ohne Feuchtigkeitssensor - Überflutungsrisiko')
      }
    }

    // Prüfe Temperatur-Heizung Kombination
    if (rule.actuator?.type === 'ACTUATOR_HEATER') {
      const hasTempSensor = rule.conditions?.some((c) => c.sensorType === 'SENSOR_TEMP_DS18B20')

      if (!hasTempSensor) {
        warnings.push('Heizung ohne Temperatursensor - Überhitzungsrisiko')
      }
    }

    return {
      safe: warnings.length === 0,
      warnings: warnings,
    }
  },

  // 🆕 NEU: Performance-Validierung
  validatePerformance(rule) {
    const issues = []

    // Prüfe zu häufige Auswertungen
    if (rule.evaluationInterval && rule.evaluationInterval < 5000) {
      issues.push('Sehr häufige Auswertung (< 5s) - Performance-Risiko')
    }

    // Prüfe zu viele Bedingungen
    if (rule.conditions && rule.conditions.length > 10) {
      issues.push('Viele Bedingungen (> 10) - Performance-Risiko')
    }

    return {
      performant: issues.length === 0,
      issues: issues,
    }
  },

  // 🆕 NEU: Duplicate-Detection
  checkDuplicateLogic(existingLogics, newLogic) {
    const duplicates = []

    existingLogics.forEach((existing, key) => {
      if (this.isDuplicate(existing, newLogic)) {
        duplicates.push({
          key: key,
          logic: existing,
          similarity: this.calculateSimilarity(existing, newLogic),
        })
      }
    })

    return {
      hasDuplicates: duplicates.length > 0,
      duplicates: duplicates,
    }
  },

  // 🆕 NEU: Duplicate-Prüfung
  isDuplicate(logic1, logic2) {
    // Prüfe grundlegende Eigenschaften
    if (logic1.actuator?.gpio !== logic2.actuator?.gpio) return false
    if (logic1.actuator?.type !== logic2.actuator?.type) return false

    // Prüfe Bedingungen
    if (logic1.conditions?.length !== logic2.conditions?.length) return false

    const conditionsMatch = logic1.conditions?.every((cond1, index) => {
      const cond2 = logic2.conditions[index]
      return (
        cond1.sensorGpio === cond2.sensorGpio &&
        cond1.operator === cond2.operator &&
        cond1.threshold === cond2.threshold
      )
    })

    if (!conditionsMatch) return false

    // Prüfe Timer
    if (logic1.timers?.length !== logic2.timers?.length) return false

    const timersMatch = logic1.timers?.every((timer1, index) => {
      const timer2 = logic2.timers[index]
      return (
        timer1.startTime === timer2.startTime &&
        timer1.endTime === timer2.endTime &&
        JSON.stringify(timer1.days) === JSON.stringify(timer2.days)
      )
    })

    return timersMatch
  },

  // 🆕 NEU: Ähnlichkeitsberechnung
  calculateSimilarity(logic1, logic2) {
    let similarity = 0
    let totalChecks = 0

    // Aktor-Ähnlichkeit
    if (logic1.actuator?.gpio === logic2.actuator?.gpio) similarity += 1
    if (logic1.actuator?.type === logic2.actuator?.type) similarity += 1
    totalChecks += 2

    // Bedingungs-Ähnlichkeit
    if (logic1.conditions && logic2.conditions) {
      const maxConditions = Math.max(logic1.conditions.length, logic2.conditions.length)
      if (maxConditions > 0) {
        let conditionMatches = 0
        logic1.conditions.forEach((cond1) => {
          logic2.conditions.forEach((cond2) => {
            if (
              cond1.sensorGpio === cond2.sensorGpio &&
              cond1.operator === cond2.operator &&
              cond1.threshold === cond2.threshold
            ) {
              conditionMatches++
            }
          })
        })
        similarity += (conditionMatches / maxConditions) * 2
        totalChecks += 2
      }
    }

    return totalChecks > 0 ? (similarity / totalChecks) * 100 : 0
  },

  // 🆕 NEU: Prioritätskonflikt-Detektion
  checkPriorityConflicts(allLogics) {
    const conflicts = []
    const logicMap = new Map()

    // Logiken nach ESP+GPIO gruppieren
    allLogics.forEach((logic, key) => {
      const [espId, gpio] = key.split('-')
      const actuatorKey = `${espId}-${gpio}`

      if (!logicMap.has(actuatorKey)) {
        logicMap.set(actuatorKey, [])
      }
      logicMap.get(actuatorKey).push(logic)
    })

    // Konflikte prüfen
    logicMap.forEach((logics, actuatorKey) => {
      if (logics.length > 1) {
        const conflict = this.analyzeLogicConflict(logics, actuatorKey)
        if (conflict.hasConflict) {
          conflicts.push(conflict)
        }
      }
    })

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      recommendations: this.generateConflictRecommendations(conflicts),
    }
  },

  // 🆕 NEU: Konflikt-Analyse
  analyzeLogicConflict(logics, actuatorKey) {
    const [espId, gpio] = actuatorKey.split('-')

    // Zeitliche Überschneidungen prüfen
    const timeConflicts = this.checkTimeOverlaps(logics)

    // Sensor-Abhängigkeiten prüfen
    const sensorConflicts = this.checkSensorDependencies(logics)

    // Prioritäts-Hierarchie prüfen
    const priorityConflicts = this.checkPriorityHierarchy(logics)

    return {
      actuatorKey,
      espId,
      gpio,
      hasConflict:
        timeConflicts.length > 0 || sensorConflicts.length > 0 || priorityConflicts.length > 0,
      timeConflicts,
      sensorConflicts,
      priorityConflicts,
      severity: this.calculateConflictSeverity(timeConflicts, sensorConflicts, priorityConflicts),
    }
  },

  // 🆕 NEU: Zeitliche Überschneidungen
  checkTimeOverlaps(logics) {
    const overlaps = []

    for (let i = 0; i < logics.length; i++) {
      for (let j = i + 1; j < logics.length; j++) {
        const overlap = this.findTimeOverlap(logics[i], logics[j])
        if (overlap) {
          overlaps.push({
            logic1: logics[i].name,
            logic2: logics[j].name,
            overlap,
          })
        }
      }
    }

    return overlaps
  },

  // 🆕 NEU: Zeitliche Überschneidung finden
  findTimeOverlap(logic1, logic2) {
    if (!logic1.timers || !logic2.timers) return null

    for (const timer1 of logic1.timers) {
      for (const timer2 of logic2.timers) {
        const overlap = this.calculateTimeOverlap(timer1, timer2)
        if (overlap) {
          return {
            timer1: timer1.name || 'Timer 1',
            timer2: timer2.name || 'Timer 2',
            overlap,
          }
        }
      }
    }

    return null
  },

  // 🆕 NEU: Zeitliche Überschneidung berechnen
  calculateTimeOverlap(timer1, timer2) {
    // Gemeinsame Tage finden
    const commonDays = timer1.days?.filter((day) => timer2.days?.includes(day)) || []
    if (commonDays.length === 0) return null

    const start1 = timeToMinutes(timer1.startTime)
    const end1 = timeToMinutes(timer1.endTime)
    const start2 = timeToMinutes(timer2.startTime)
    const end2 = timeToMinutes(timer2.endTime)

    // Überschneidung prüfen
    if (start1 <= end2 && start2 <= end1) {
      const overlapStart = Math.max(start1, start2)
      const overlapEnd = Math.min(end1, end2)
      return {
        days: commonDays,
        start: minutesToTime(overlapStart),
        end: minutesToTime(overlapEnd),
        duration: overlapEnd - overlapStart,
      }
    }

    return null
  },

  // 🆕 NEU: Sensor-Abhängigkeiten prüfen
  checkSensorDependencies(logics) {
    const conflicts = []
    const sensorUsage = new Map()

    logics.forEach((logic) => {
      if (logic.conditions) {
        logic.conditions.forEach((condition) => {
          const sensorKey = `${condition.sensorGpio}`
          if (!sensorUsage.has(sensorKey)) {
            sensorUsage.set(sensorKey, [])
          }
          sensorUsage.get(sensorKey).push({
            logic: logic.name,
            condition: condition,
          })
        })
      }
    })

    // Konflikte bei gleichen Sensoren mit unterschiedlichen Schwellenwerten
    sensorUsage.forEach((usages, sensorKey) => {
      if (usages.length > 1) {
        const thresholds = usages.map((u) => u.condition.threshold)
        const uniqueThresholds = [...new Set(thresholds)]

        if (uniqueThresholds.length > 1) {
          conflicts.push({
            sensor: sensorKey,
            usages,
            conflict: 'Verschiedene Schwellenwerte für gleichen Sensor',
          })
        }
      }
    })

    return conflicts
  },

  // 🆕 NEU: Prioritäts-Hierarchie prüfen
  checkPriorityHierarchy(logics) {
    const conflicts = []

    // Prüfe auf widersprüchliche Prioritäten
    const priorities = logics.map((logic) => ({
      name: logic.name,
      priority: logic.priority || 'LOGIC',
      actuatorType: logic.actuator?.type,
    }))

    // Gleiche Priorität bei verschiedenen Aktor-Typen
    const priorityGroups = new Map()
    priorities.forEach((p) => {
      if (!priorityGroups.has(p.priority)) {
        priorityGroups.set(p.priority, [])
      }
      priorityGroups.get(p.priority).push(p)
    })

    priorityGroups.forEach((group, priority) => {
      if (group.length > 1) {
        const actuatorTypes = [...new Set(group.map((g) => g.actuatorType))]
        if (actuatorTypes.length > 1) {
          conflicts.push({
            priority,
            logics: group,
            conflict: 'Gleiche Priorität bei verschiedenen Aktor-Typen',
          })
        }
      }
    })

    return conflicts
  },

  // 🆕 NEU: Konflikt-Schweregrad berechnen
  calculateConflictSeverity(timeConflicts, sensorConflicts, priorityConflicts) {
    let severity = 0

    // Zeitliche Konflikte: Hoch
    severity += timeConflicts.length * 3

    // Sensor-Konflikte: Mittel
    severity += sensorConflicts.length * 2

    // Prioritäts-Konflikte: Niedrig
    severity += priorityConflicts.length * 1

    if (severity >= 6) return 'critical'
    if (severity >= 3) return 'warning'
    return 'info'
  },

  // 🆕 NEU: Konflikt-Empfehlungen generieren
  generateConflictRecommendations(conflicts) {
    const recommendations = []

    conflicts.forEach((conflict) => {
      switch (conflict.severity) {
        case 'critical':
          recommendations.push(
            `Kritischer Konflikt bei ESP ${conflict.espId} GPIO ${conflict.gpio}: Zeitliche Überschneidungen`,
          )
          break
        case 'warning':
          recommendations.push(
            `Warnung bei ESP ${conflict.espId} GPIO ${conflict.gpio}: Sensor-Konflikte`,
          )
          break
        case 'info':
          recommendations.push(
            `Info bei ESP ${conflict.espId} GPIO ${conflict.gpio}: Prioritäts-Konflikte`,
          )
          break
      }
    })

    return recommendations
  },

  // 🆕 NEU: Multi-Level Validierung mit Severity Levels
  validateWithSeverity(logic, existingLogics = []) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
      severity: 'success', // success, warning, error
      recommendations: [],
      testCases: [],
    }

    // Schema-Validierung (Error Level)
    const schemaValidation = this.validateAgainstSchema(logic)
    if (!schemaValidation.valid) {
      results.valid = false
      results.severity = 'error'
      results.errors.push(
        ...schemaValidation.errors.map((err) => ({
          type: 'schema',
          message: err.message,
          path: err.instancePath,
          severity: 'error',
        })),
      )
    }

    // Logische Vollständigkeit (Error Level)
    const logicValidation = this.validateLogicRule(logic)
    if (!logicValidation.valid) {
      results.valid = false
      results.severity = 'error'
      results.errors.push(
        ...logicValidation.errors.map((err) => ({
          type: 'logic',
          message: err,
          severity: 'error',
        })),
      )
    }

    // Sicherheitsvalidierung (Warning Level)
    const safetyValidation = this.validateSafetyConstraints(logic)
    if (!safetyValidation.safe) {
      results.warnings.push(
        ...safetyValidation.warnings.map((warning) => ({
          type: 'safety',
          message: warning,
          severity: 'warning',
        })),
      )
      if (results.severity === 'success') results.severity = 'warning'
    }

    // Performance-Validierung (Warning Level)
    const performanceValidation = this.validatePerformance(logic)
    if (!performanceValidation.performant) {
      results.warnings.push(
        ...performanceValidation.issues.map((issue) => ({
          type: 'performance',
          message: issue,
          severity: 'warning',
        })),
      )
      if (results.severity === 'success') results.severity = 'warning'
    }

    // Duplicate-Detection (Info Level)
    const duplicateCheck = this.checkDuplicateLogic(existingLogics, logic)
    if (duplicateCheck.hasDuplicates) {
      results.info.push(
        ...duplicateCheck.duplicates.map((dup) => ({
          type: 'duplicate',
          message: `Ähnliche Logik gefunden (${dup.similarity.toFixed(1)}% Übereinstimmung)`,
          severity: 'info',
          details: dup,
        })),
      )
    }

    // Prioritätskonflikt-Detektion (Warning Level)
    const conflictCheck = this.checkPriorityConflicts([...existingLogics, logic])
    if (conflictCheck.conflicts.length > 0) {
      results.warnings.push(
        ...conflictCheck.conflicts.map((conflict) => ({
          type: 'priority',
          message: `Prioritätskonflikt: ${conflict.description}`,
          severity: 'warning',
          details: conflict,
        })),
      )
      if (results.severity === 'success') results.severity = 'warning'
    }

    // 🆕 NEU: Automatische Test-Case-Generierung
    results.testCases = this.generateTestCases(logic)

    // 🆕 NEU: Intelligente Empfehlungen
    results.recommendations = this.generateRecommendations(logic, results)

    return results
  },

  // 🆕 NEU: Test-Case-Generierung
  generateTestCases(logic) {
    const testCases = []

    // Basis-Test-Cases für Bedingungen
    if (logic.conditions) {
      logic.conditions.forEach((condition, index) => {
        // Test: Bedingung erfüllt
        testCases.push({
          id: `condition_${index}_met`,
          name: `Bedingung ${index + 1} erfüllt`,
          description: `Testet ob ${condition.sensorGpio} ${condition.operator} ${condition.threshold}`,
          type: 'condition',
          input: {
            sensors: {
              [condition.sensorGpio]: this.getTestValue(
                condition.operator,
                condition.threshold,
                true,
              ),
            },
          },
          expected: {
            state: true,
            reason: 'logic_conditions_met',
          },
        })

        // Test: Bedingung nicht erfüllt
        testCases.push({
          id: `condition_${index}_not_met`,
          name: `Bedingung ${index + 1} nicht erfüllt`,
          description: `Testet ob ${condition.sensorGpio} ${condition.operator} ${condition.threshold} nicht erfüllt`,
          type: 'condition',
          input: {
            sensors: {
              [condition.sensorGpio]: this.getTestValue(
                condition.operator,
                condition.threshold,
                false,
              ),
            },
          },
          expected: {
            state: false,
            reason: 'logic_conditions_not_met',
          },
        })
      })
    }

    // Timer-Test-Cases
    if (logic.timers) {
      logic.timers.forEach((timer, index) => {
        testCases.push({
          id: `timer_${index}_active`,
          name: `Timer ${index + 1} aktiv`,
          description: `Testet Timer ${timer.name || index + 1} während aktiver Zeit`,
          type: 'timer',
          input: {
            time: timer.startTime,
            day: timer.days[0] || 0,
          },
          expected: {
            state: true,
            reason: 'timer_active',
          },
        })

        testCases.push({
          id: `timer_${index}_inactive`,
          name: `Timer ${index + 1} inaktiv`,
          description: `Testet Timer ${timer.name || index + 1} außerhalb aktiver Zeit`,
          type: 'timer',
          input: {
            time: this.getInactiveTime(timer),
            day: timer.days[0] || 0,
          },
          expected: {
            state: false,
            reason: 'timer_inactive',
          },
        })
      })
    }

    return testCases
  },

  // 🆕 NEU: Test-Wert-Generierung
  getTestValue(operator, threshold, shouldMeet) {
    const numThreshold = Number(threshold)

    if (shouldMeet) {
      switch (operator) {
        case '>':
          return numThreshold + 1
        case '<':
          return numThreshold - 1
        case '>=':
          return numThreshold
        case '<=':
          return numThreshold
        case '==':
          return numThreshold
        case '!=':
          return numThreshold + 1
        default:
          return numThreshold
      }
    } else {
      switch (operator) {
        case '>':
          return numThreshold - 1
        case '<':
          return numThreshold + 1
        case '>=':
          return numThreshold - 1
        case '<=':
          return numThreshold + 1
        case '==':
          return numThreshold + 1
        case '!=':
          return numThreshold
        default:
          return numThreshold + 1
      }
    }
  },

  // 🆕 NEU: Inaktive Zeit für Timer-Tests
  getInactiveTime(timer) {
    const startMinutes = timeToMinutes(timer.startTime)
    const endMinutes = timeToMinutes(timer.endTime)

    // Zeit außerhalb des Timer-Bereichs
    if (startMinutes < endMinutes) {
      return minutesToTime(Math.max(0, startMinutes - 1))
    } else {
      return minutesToTime(endMinutes + 1)
    }
  },

  // 🆕 NEU: Erweiterte Empfehlungen
  generateRecommendations(logic) {
    const recommendations = []

    // Aktor-Typ-spezifische Empfehlungen
    if (logic.actuator?.type === 'ACTUATOR_PUMP') {
      const hasMoistureSensor = logic.conditions?.some((c) => c.sensorType === 'SENSOR_MOISTURE')
      if (!hasMoistureSensor) {
        recommendations.push({
          type: 'safety',
          priority: 'high',
          message: 'Feuchtigkeitssensor hinzufügen für Überflutungsschutz',
          action: 'add_moisture_sensor',
        })
      }
    }

    if (logic.actuator?.type === 'ACTUATOR_HEATER') {
      const hasTempSensor = logic.conditions?.some((c) => c.sensorType === 'SENSOR_TEMP_DS18B20')
      if (!hasTempSensor) {
        recommendations.push({
          type: 'safety',
          priority: 'high',
          message: 'Temperatursensor hinzufügen für Überhitzungsschutz',
          action: 'add_temp_sensor',
        })
      }
    }

    // Performance-Empfehlungen
    if (logic.evaluationInterval && logic.evaluationInterval < 10000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Auswertungsintervall auf mindestens 10s erhöhen für bessere Performance',
        action: 'increase_interval',
      })
    }

    // Logik-Optimierungen
    if (logic.conditions && logic.conditions.length > 5) {
      recommendations.push({
        type: 'optimization',
        priority: 'low',
        message: 'Bedingungen gruppieren für bessere Lesbarkeit',
        action: 'group_conditions',
      })
    }

    return recommendations
  },
}

// 🆕 NEU: Composable für Validierung
export const useActuatorLogicValidation = () => {
  return actuatorLogicValidation
}
