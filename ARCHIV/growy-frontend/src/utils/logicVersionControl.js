// ✅ NEU: Erweiterte Vergleichslogik für Versionshistorie
export class LogicVersionControl {
  // ✅ NEU: Erweiterte Vergleichslogik mit DeepDiff-ähnlicher Funktionalität
  compareLogicVersions(oldLogic, newLogic) {
    const changes = {
      added: [],
      removed: [],
      modified: [],
      unchanged: [],
      summary: '',
    }

    // Bedingungen vergleichen
    const conditionChanges = this.compareConditions(oldLogic.conditions, newLogic.conditions)
    changes.added.push(...conditionChanges.added)
    changes.removed.push(...conditionChanges.removed)
    changes.modified.push(...conditionChanges.modified)

    // Timer vergleichen
    const timerChanges = this.compareTimers(oldLogic.timers, newLogic.timers)
    changes.added.push(...timerChanges.added)
    changes.removed.push(...timerChanges.removed)
    changes.modified.push(...timerChanges.modified)

    // Aktor-Eigenschaften vergleichen
    const actuatorChanges = this.compareActuator(oldLogic.actuator, newLogic.actuator)
    if (actuatorChanges) {
      changes.modified.push(actuatorChanges)
    }

    // Zusammenfassung generieren
    changes.summary = this.generateChangeSummary(changes)

    return changes
  }

  // ✅ NEU: Bedingungen vergleichen
  compareConditions(oldConditions, newConditions) {
    const changes = { added: [], removed: [], modified: [] }

    const oldMap = new Map(oldConditions?.map((c) => [this.getConditionKey(c), c]) || [])
    const newMap = new Map(newConditions?.map((c) => [this.getConditionKey(c), c]) || [])

    // Entfernte Bedingungen
    for (const [key, condition] of oldMap) {
      if (!newMap.has(key)) {
        changes.removed.push({
          type: 'condition',
          key,
          oldValue: condition,
          description: `Bedingung entfernt: ${condition.sensorGpio} ${condition.operator} ${condition.threshold}`,
        })
      }
    }

    // Neue Bedingungen
    for (const [key, condition] of newMap) {
      if (!oldMap.has(key)) {
        changes.added.push({
          type: 'condition',
          key,
          newValue: condition,
          description: `Bedingung hinzugefügt: ${condition.sensorGpio} ${condition.operator} ${condition.threshold}`,
        })
      }
    }

    // Geänderte Bedingungen
    for (const [key, newCondition] of newMap) {
      const oldCondition = oldMap.get(key)
      if (oldCondition && !this.conditionsEqual(oldCondition, newCondition)) {
        changes.modified.push({
          type: 'condition',
          key,
          oldValue: oldCondition,
          newValue: newCondition,
          description: `Bedingung geändert: ${this.describeConditionChange(oldCondition, newCondition)}`,
        })
      }
    }

    return changes
  }

  // ✅ NEU: Timer vergleichen
  compareTimers(oldTimers, newTimers) {
    const changes = { added: [], removed: [], modified: [] }

    const oldMap = new Map(oldTimers?.map((t) => [this.getTimerKey(t), t]) || [])
    const newMap = new Map(newTimers?.map((t) => [this.getTimerKey(t), t]) || [])

    // Entfernte Timer
    for (const [key, timer] of oldMap) {
      if (!newMap.has(key)) {
        changes.removed.push({
          type: 'timer',
          key,
          oldValue: timer,
          description: `Timer entfernt: ${timer.startTime} - ${timer.endTime}`,
        })
      }
    }

    // Neue Timer
    for (const [key, timer] of newMap) {
      if (!oldMap.has(key)) {
        changes.added.push({
          type: 'timer',
          key,
          newValue: timer,
          description: `Timer hinzugefügt: ${timer.startTime} - ${timer.endTime}`,
        })
      }
    }

    // Geänderte Timer
    for (const [key, newTimer] of newMap) {
      const oldTimer = oldMap.get(key)
      if (oldTimer && !this.timersEqual(oldTimer, newTimer)) {
        changes.modified.push({
          type: 'timer',
          key,
          oldValue: oldTimer,
          newValue: newTimer,
          description: `Timer geändert: ${this.describeTimerChange(oldTimer, newTimer)}`,
        })
      }
    }

    return changes
  }

  // ✅ NEU: Aktor vergleichen
  compareActuator(oldActuator, newActuator) {
    if (!oldActuator && !newActuator) return null
    if (!oldActuator) return { type: 'actuator', added: true, newValue: newActuator }
    if (!newActuator) return { type: 'actuator', removed: true, oldValue: oldActuator }

    const changes = []

    if (oldActuator.type !== newActuator.type) {
      changes.push(`Typ: ${oldActuator.type} → ${newActuator.type}`)
    }
    if (oldActuator.name !== newActuator.name) {
      changes.push(`Name: ${oldActuator.name} → ${newActuator.name}`)
    }

    if (changes.length > 0) {
      return {
        type: 'actuator',
        oldValue: oldActuator,
        newValue: newActuator,
        description: `Aktor geändert: ${changes.join(', ')}`,
      }
    }

    return null
  }

  // ✅ NEU: Hilfsfunktionen für Schlüssel-Generierung
  getConditionKey(condition) {
    return `${condition.sensorGpio}-${condition.operator}`
  }

  getTimerKey(timer) {
    return `${timer.startTime}-${timer.endTime}`
  }

  // ✅ NEU: Gleichheitsprüfungen
  conditionsEqual(cond1, cond2) {
    return (
      cond1.sensorGpio === cond2.sensorGpio &&
      cond1.operator === cond2.operator &&
      cond1.threshold === cond2.threshold
    )
  }

  timersEqual(timer1, timer2) {
    return (
      timer1.startTime === timer2.startTime &&
      timer1.endTime === timer2.endTime &&
      JSON.stringify(timer1.days) === JSON.stringify(timer2.days)
    )
  }

  // ✅ NEU: Änderungsbeschreibungen
  describeConditionChange(oldCondition, newCondition) {
    const changes = []

    if (oldCondition.threshold !== newCondition.threshold) {
      changes.push(`Schwellenwert: ${oldCondition.threshold} → ${newCondition.threshold}`)
    }

    return changes.join(', ')
  }

  describeTimerChange(oldTimer, newTimer) {
    const changes = []

    if (oldTimer.startTime !== newTimer.startTime) {
      changes.push(`Start: ${oldTimer.startTime} → ${newTimer.startTime}`)
    }
    if (oldTimer.endTime !== newTimer.endTime) {
      changes.push(`Ende: ${oldTimer.endTime} → ${newTimer.endTime}`)
    }

    return changes.join(', ')
  }

  // ✅ NEU: Zusammenfassung generieren
  generateChangeSummary(changes) {
    const counts = {
      added: changes.added.length,
      removed: changes.removed.length,
      modified: changes.modified.length,
    }

    const parts = []
    if (counts.added > 0) parts.push(`${counts.added} hinzugefügt`)
    if (counts.removed > 0) parts.push(`${counts.removed} entfernt`)
    if (counts.modified > 0) parts.push(`${counts.modified} geändert`)

    return parts.length > 0 ? parts.join(', ') : 'Keine Änderungen'
  }

  // ✅ NEU: Detaillierte Änderungsanalyse
  analyzeChanges(changes) {
    const analysis = {
      impact: 'low',
      risk: 'low',
      recommendations: [],
      affectedComponents: [],
    }

    // Impact-Analyse
    const totalChanges = changes.added.length + changes.removed.length + changes.modified.length
    if (totalChanges > 5) {
      analysis.impact = 'high'
    } else if (totalChanges > 2) {
      analysis.impact = 'medium'
    }

    // Risk-Analyse
    const hasConditionChanges =
      changes.added.some((c) => c.type === 'condition') ||
      changes.modified.some((c) => c.type === 'condition')
    if (hasConditionChanges) {
      analysis.risk = 'medium'
      analysis.recommendations.push('Bedingungen geändert - Tests empfohlen')
    }

    // Betroffene Komponenten
    const components = new Set()
    changes.added.concat(changes.modified).forEach((change) => {
      if (change.type === 'condition') {
        components.add('sensor_logic')
      }
      if (change.type === 'timer') {
        components.add('time_logic')
      }
      if (change.type === 'actuator') {
        components.add('actuator_config')
      }
    })
    analysis.affectedComponents = Array.from(components)

    return analysis
  }
}

// ✅ NEU: Singleton-Instanz
export const logicVersionControl = new LogicVersionControl()
