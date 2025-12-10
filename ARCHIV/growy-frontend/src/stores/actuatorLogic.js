import { defineStore } from 'pinia'
import { useSystemCommandsStore } from './systemCommands'
import { useSensorRegistryStore } from './sensorRegistry'
import { storage } from '@/utils/storage'
import { eventBus, MQTT_EVENTS, storeHandler } from '@/utils/eventBus'
import { useCentralConfigStore } from './centralConfig'
import { timeToMinutes } from '@/utils/time'

// ✅ NEU: Zentrale Logic-Engine für Prioritätsmanagement
class ActuatorLogicEngine {
  constructor() {
    this.priorityLevels = {
      EMERGENCY: 100, // Notfall-Alerts
      MANUAL: 90, // Manuelle Steuerung
      ALERT: 80, // Alert-System
      LOGIC: 70, // Drag&Drop-Logik
      TIMER: 60, // Timer-basierte Logik
      SCHEDULE: 50, // Zeitplan
      DEFAULT: 0, // Standard-Zustand
    }

    // ✅ NEU: Memory-Limits für kritische Maps
    this.memoryLimits = {
      activeStates: 1000, // Max 1000 aktive Zustände
      actuatorLogics: 500, // Max 500 Logic-Konfigurationen
      logicHistory: 100, // Max 100 Versionshistorie pro Logic
      evaluationQueue: 50, // Max 50 pending evaluations
      priorityQueue: 50, // Max 50 high-priority items
      logicLogs: 200, // Max 200 Log-Einträge pro Logic
      activeProcesses: 100, // Max 100 aktive Prozesse
    }

    this.activeStates = new Map() // Map<`${espId}-${gpio}`, { state, source, priority, timestamp }>
  }

  // ✅ NEU: LRU-Eviction für Map-Größenlimits
  enforceMapLimit(map, limit, mapName) {
    if (map.size > limit) {
      const entries = Array.from(map.entries())

      // Sortiere nach Timestamp (LRU - Least Recently Used)
      entries.sort((a, b) => {
        const timestampA = a[1].timestamp || a[1].createdAt || a[1].updatedAt || 0
        const timestampB = b[1].timestamp || b[1].createdAt || b[1].updatedAt || 0
        return timestampA - timestampB
      })

      // Entferne die ältesten Einträge
      const toRemove = entries.slice(0, map.size - limit)
      toRemove.forEach(([key]) => {
        map.delete(key)
      })

      console.warn(
        `🧹 Memory-Limit enforced for ${mapName}: removed ${toRemove.length} old entries`,
      )
    }
  }

  // ✅ NEU: Array-Limit mit Priority-basierter Eviction
  enforceArrayLimit(array, limit, arrayName, priorityExtractor = null) {
    if (array.length > limit) {
      if (priorityExtractor) {
        // Priority-basierte Eviction: Entferne Low-Priority-Items
        array.sort((a, b) => priorityExtractor(b) - priorityExtractor(a))
        const toRemove = array.splice(limit)
        console.warn(
          `🧹 Priority-Limit enforced for ${arrayName}: removed ${toRemove.length} low-priority items`,
        )
      } else {
        // FIFO-Eviction: Entferne älteste Items
        const toRemove = array.splice(0, array.length - limit)
        console.warn(
          `🧹 FIFO-Limit enforced for ${arrayName}: removed ${toRemove.length} old items`,
        )
      }
    }
  }

  // ✅ NEU: Sichere Map-Operationen mit Memory-Limits
  setActiveState(key, value) {
    this.activeStates.set(key, { ...value, timestamp: Date.now() })
    this.enforceMapLimit(this.activeStates, this.memoryLimits.activeStates, 'activeStates')
  }

  // ✅ NEU: Sichere Array-Operationen mit Memory-Limits
  addToEvaluationQueue(item) {
    this.evaluationQueue.push(item)
    this.enforceArrayLimit(
      this.evaluationQueue,
      this.memoryLimits.evaluationQueue,
      'evaluationQueue',
    )
  }

  addToPriorityQueue(item) {
    this.priorityQueue.push(item)
    this.enforceArrayLimit(
      this.priorityQueue,
      this.memoryLimits.priorityQueue,
      'priorityQueue',
      (item) => item.priority || 0,
    )
  }

  // ✅ NEU: Zentrale Aktor-Zustandsauswertung
  evaluateActuatorState(espId, gpio, actuatorType) {
    const actuatorKey = `${espId}-${gpio}`

    // Alle aktiven Zustände sammeln
    const states = this.collectActiveStates(espId, gpio)

    // Priorität auflösen
    const finalState = this.resolvePriority(states, actuatorType)

    // ✅ NEU: Sichere Map-Operation mit Memory-Limit
    this.setActiveState(actuatorKey, {
      state: finalState.state,
      source: finalState.source,
      priority: finalState.priority,
    })

    return finalState
  }

  // ✅ NEU: Alle aktiven Zustände sammeln
  collectActiveStates(espId, gpio) {
    const states = []

    // Alert-System Zustand prüfen
    const alertState = this.getAlertState(espId, gpio)
    if (alertState.active) {
      states.push({
        state: alertState.state,
        source: 'ALERT',
        priority: this.priorityLevels.ALERT,
        reason: alertState.reason,
      })
    }

    // Logik-Zustand prüfen
    const logicState = this.getLogicState(espId, gpio)
    if (logicState.active) {
      states.push({
        state: logicState.state,
        source: 'LOGIC',
        priority: this.priorityLevels.LOGIC,
        reason: logicState.reason,
      })
    }

    // Manueller Zustand prüfen
    const manualState = this.getManualState(espId, gpio)
    if (manualState.active) {
      states.push({
        state: manualState.state,
        source: 'MANUAL',
        priority: this.priorityLevels.MANUAL,
        reason: manualState.reason,
      })
    }

    // Timer-Zustand prüfen
    const timerState = this.getTimerState(espId, gpio)
    if (timerState.active) {
      states.push({
        state: timerState.state,
        source: 'TIMER',
        priority: this.priorityLevels.TIMER,
        reason: timerState.reason,
      })
    }

    return states
  }

  // ✅ NEU: Priorität auflösen
  resolvePriority(states, actuatorType) {
    if (states.length === 0) {
      return {
        state: false,
        source: 'DEFAULT',
        priority: this.priorityLevels.DEFAULT,
        reason: 'Keine aktiven Zustände',
      }
    }

    // Höchste Priorität wählen
    const highestPriority = Math.max(...states.map((s) => s.priority))
    const winningStates = states.filter((s) => s.priority === highestPriority)

    // Bei gleicher Priorität: Aktor-Typ-spezifische Regeln
    if (winningStates.length > 1) {
      return this.resolveTypeSpecificConflict(winningStates, actuatorType)
    }

    return winningStates[0]
  }

  // ✅ NEU: Aktor-Typ-spezifische Konfliktlösung
  resolveTypeSpecificConflict(states, actuatorType) {
    switch (actuatorType) {
      case 'ACTUATOR_PUMP': {
        // Pumpe: Sicherheitszustand bevorzugen (AUS)
        return states.find((s) => s.state === false) || states[0]
      }

      case 'ACTUATOR_LED': {
        // LED: Helligkeit kombinieren (höchster Wert)
        const maxState = Math.max(...states.map((s) => s.state))
        return states.find((s) => s.state === maxState) || states[0]
      }

      case 'ACTUATOR_HEATER': {
        // Heizung: Temperatur-basierte Entscheidung
        return states.find((s) => s.source === 'LOGIC') || states[0]
      }

      default:
        // Standard: Ersten Zustand nehmen
        return states[0]
    }
  }

  // ✅ NEU: Alert-System Zustand abrufen
  async getAlertState(espId, gpio) {
    // ✅ LÖSUNG: Event-basierte Kommunikation mit MQTT Store
    const { useMqttStore } = await import('./mqtt')
    const mqttStore = useMqttStore()
    const device = mqttStore.espDevices.get(espId)
    const actuator = device?.actuators?.get(gpio)

    if (actuator?.alert) {
      return {
        active: true,
        state: actuator.alert.state,
        reason: actuator.alert.reason || 'alert_system',
      }
    }

    return { active: false, state: false, reason: null }
  }

  // ✅ NEU: Logik-Zustand abrufen
  getLogicState(espId, gpio) {
    // ✅ BESTEHEND: Integration mit bestehender Logik-Konfiguration
    const logic = this.actuatorLogics.get(`${espId}-${gpio}`)
    if (!logic || !logic.enabled) {
      return { active: false, state: false, reason: null }
    }

    // ✅ BESTEHEND: Verwende vorhandene Sensor-Registry für Bedingungen
    const sensorRegistry = useSensorRegistryStore()

    // Bedingungen auswerten
    if (logic.conditions && logic.conditions.length > 0) {
      const conditionsMet = logic.conditions.every((condition) => {
        const sensor = sensorRegistry.getSensor(espId, condition.sensorGpio)
        if (!sensor) return false

        const value = Number(sensor.value)
        const threshold = Number(condition.threshold)

        switch (condition.operator) {
          case '>':
            return value > threshold
          case '<':
            return value < threshold
          case '>=':
            return value >= threshold
          case '<=':
            return value <= threshold
          case '==':
            return value === threshold
          case '!=':
            return value !== threshold
          default:
            return false
        }
      })

      if (conditionsMet) {
        return {
          active: true,
          state: true,
          reason: 'logic_conditions_met',
        }
      }
    }

    return { active: false, state: false, reason: null }
  }

  // ✅ NEU: Manueller Zustand abrufen
  async getManualState(espId, gpio) {
    // ✅ LÖSUNG: Event-basierte Kommunikation mit MQTT Store
    const { useMqttStore } = await import('./mqtt')
    const mqttStore = useMqttStore()
    const device = mqttStore.espDevices.get(espId)
    const actuator = device?.actuators?.get(gpio)

    if (actuator?.manualOverride) {
      return {
        active: true,
        state: actuator.manualOverride.state,
        reason: actuator.manualOverride.reason || 'manual_override',
      }
    }

    return { active: false, state: false, reason: null }
  }

  // ✅ NEU: Timer-Zustand abrufen
  getTimerState(espId, gpio) {
    // ✅ BESTEHEND: Integration mit bestehenden Timer-Konfigurationen
    const timers = []
    for (const [key, timer] of this.timerConfigs.entries()) {
      if (key.startsWith(`${espId}-${gpio}-`) && timer.enabled) {
        timers.push(timer)
      }
    }

    if (timers.length === 0) {
      return { active: false, state: false, reason: null }
    }

    const now = new Date()
    const currentTime = now.getHours() * 60 + now.getMinutes()
    const currentDay = now.getDay()

    const activeTimer = timers.find((timer) => {
      if (!timer.days.includes(currentDay)) return false

      const startMinutes = timeToMinutes(timer.startTime)
      const endMinutes = timeToMinutes(timer.endTime)

      if (startMinutes <= endMinutes) {
        return currentTime >= startMinutes && currentTime <= endMinutes
      } else {
        return currentTime >= startMinutes || currentTime <= endMinutes
      }
    })

    if (activeTimer) {
      return {
        active: true,
        state: true,
        reason: `timer_${activeTimer.name}`,
      }
    }

    return { active: false, state: false, reason: null }
  }

  // ✅ NEU: Aktor-Zustand über MQTT aktualisieren
  updateActuatorState(espId, gpio, payload) {
    const actuatorKey = `${espId}-${gpio}`
    const currentState = this.activeStates.get(actuatorKey)

    if (currentState && payload.source && payload.source !== currentState.source) {
      // Zustand hat sich geändert - Log-Eintrag erstellen
      this.addLogicLog(espId, gpio, 'STATE_CHANGED', {
        message: `Aktor-Zustand geändert: ${currentState.source} → ${payload.source}`,
        oldState: currentState,
        newState: payload,
        reason: payload.reason || 'external_change',
      })
    }

    // Aktiven Zustand aktualisieren
    this.activeStates.set(actuatorKey, {
      state: payload.status === 'active' || payload.status === true,
      source: payload.source || 'unknown',
      priority: this.getPriorityForSource(payload.source),
      timestamp: Date.now(),
      reason: payload.reason || null,
    })
  }

  // ✅ NEU: Priorität für Quelle ermitteln
  getPriorityForSource(source) {
    switch (source) {
      case 'emergency':
        return this.priorityLevels.EMERGENCY
      case 'manual':
        return this.priorityLevels.MANUAL
      case 'alert':
        return this.priorityLevels.ALERT
      case 'logic':
        return this.priorityLevels.LOGIC
      case 'timer':
        return this.priorityLevels.TIMER
      case 'schedule':
        return this.priorityLevels.SCHEDULE
      default:
        return this.priorityLevels.DEFAULT
    }
  }

  // ✅ NEU: Aktiven Zustand abrufen
  getActiveState(espId, gpio) {
    return this.activeStates.get(`${espId}-${gpio}`) || null
  }

  // ✅ NEU: Manuellen Override setzen
  setManualOverride(espId, gpio, state, reason = 'manual') {
    const actuatorKey = `${espId}-${gpio}`
    this.activeStates.set(actuatorKey, {
      state,
      source: 'MANUAL',
      priority: this.priorityLevels.MANUAL,
      timestamp: Date.now(),
      reason,
    })
  }

  // ✅ NEU: Override zurücksetzen
  clearManualOverride(espId, gpio) {
    const actuatorKey = `${espId}-${gpio}`
    this.activeStates.delete(actuatorKey)
  }
}

export const useActuatorLogicStore = defineStore('actuatorLogic', {
  state: () => ({
    // ✅ NEU: Zentrale Logic-Engine
    logicEngine: new ActuatorLogicEngine(),

    // ✅ NEU: Memory-Limits für Store-Maps
    memoryLimits: {
      actuatorLogics: 500, // Max 500 Logic-Konfigurationen
      timerConfigs: 1000, // Max 1000 Timer-Konfigurationen
      logicLogs: 200, // Max 200 Log-Einträge pro Logic
      activeProcesses: 100, // Max 100 aktive Prozesse
      logicHistory: 100, // Max 100 Versionshistorie pro Logic
      crossEspLogicDefinitions: 50, // Max 50 Cross-ESP-Logics
    },

    // Aktor-Logik-Konfigurationen: Map<`${espId}-${gpio}`, LogicConfig>
    actuatorLogics: new Map(),

    // Timer-Konfigurationen: Map<`${espId}-${gpio}-${timerId}`, TimerConfig>
    timerConfigs: new Map(),

    // Logik-Logs: Map<`${espId}-${gpio}`, Array<LogEntry>>
    logicLogs: new Map(),

    // Aktive Logik-Prozesse: Map<`${espId}-${gpio}`, LogicProcess>
    activeProcesses: new Map(),

    // ✅ NEU: Performance-Optimierung mit Lock-Mechanismus
    evaluationOptimization: {
      isEvaluating: false, // 🔒 Lock-Flag für Race-Condition-Prevention
      evaluationQueue: [], // Queue für pending evaluations
      batchSize: 10, // Max 10 Logics gleichzeitig
      batchDelay: 100, // 100ms Pause zwischen Batches
      priorityQueue: [], // High-Priority Logics zuerst
      lastEvaluationTime: new Map(), // Tracking für Evaluation-Zeiten
      evaluationStats: {
        totalEvaluations: 0,
        averageTime: 0,
        slowLogics: new Set(),
        batchCount: 0,
        lastBatchTime: 0,
        concurrentEvaluations: 0, // 🔒 Track concurrent evaluations
        raceConditionPrevented: 0, // 🔒 Track prevented race conditions
      },
      performanceThresholds: {
        slowLogicThreshold: 1000, // > 1 Sekunde = langsam
        batchTimeout: 5000, // 5 Sekunden Batch-Timeout
        maxRetries: 3, // Max 3 Retries pro Logic
        maxConcurrentEvaluations: 1, // 🔒 Max 1 concurrent evaluation
      },
    },

    // ✅ NEU: Aktor-Typ-spezifische Validierungen
    actuatorTypeValidations: {
      ACTUATOR_RELAY: {
        allowedInputs: ['binary', 'timer', 'sensor'],
        maxPoints: 1,
        description: 'Ein/Aus-Relais - nur binäre Steuerung',
      },
      ACTUATOR_PUMP: {
        allowedInputs: ['binary', 'timer', 'sensor'],
        maxPoints: 1,
        description: 'Pumpe - nur Ein/Aus mit Sicherheitszeit',
      },
      ACTUATOR_LED: {
        allowedInputs: ['pwm', 'timer', 'sensor', 'gradient'],
        maxPoints: 10,
        description: 'LED - PWM-Steuerung mit Verläufen möglich',
      },
      ACTUATOR_HEATER: {
        allowedInputs: ['pwm', 'timer', 'sensor', 'gradient'],
        maxPoints: 5,
        description: 'Heizung - PWM mit Temperaturregelung',
      },
      ACTUATOR_FAN: {
        allowedInputs: ['pwm', 'timer', 'sensor', 'gradient'],
        maxPoints: 3,
        description: 'Lüfter - PWM mit Geschwindigkeitsregelung',
      },
      ACTUATOR_VALVE: {
        allowedInputs: ['binary', 'timer', 'sensor'],
        maxPoints: 1,
        description: 'Ventil - nur Ein/Aus',
      },
    },

    // Sicherheits-Einstellungen
    safetySettings: {
      failsafeEnabled: true,
      failsafeDefaultState: false,
      maxConcurrentProcesses: 10,
      processTimeout: 30000, // 30 Sekunden
    },

    loading: false,
    error: null,
    lastUpdate: null,

    // 🆕 NEU: Versionsmanagement
    logicHistory: new Map(), // Map<logicId, LogicVersion[]>
    versionSettings: {
      maxVersions: 10,
      autoVersioning: true,
      versionComments: true,
    },

    // ✅ NEU: Cross-ESP Logic-Definitionen
    crossEspLogicDefinitions: new Map(), // Map<logicId, CrossEspLogicDefinition>

    // ✅ NEU: Cross-ESP Logic-Metadaten
    crossEspLogicMetadata: {
      totalCrossEspLogics: 0,
      byComplexity: {
        low: 0,
        medium: 0,
        high: 0,
      },
      byZone: new Map(), // Map<zoneName, Array<logicId>>
      bySubzone: new Map(), // Map<subzoneId, Array<logicId>>
      averageLatency: 0,
      reliabilityScore: 0.95,
    },

    // ✅ NEU: Timer-Management-State erweitern
    timerManagement: {
      // System-Timer (permanent - nur bei Store-Destruction cleanen)
      systemTimers: new Map(), // Map<timerId, { type, description, interval }>

      // User-Logic-Timer (Features - NICHT cleanen!)
      userLogicTimers: new Map(), // Map<logicId, { timerId, schedule, description }>

      // Memory-Leak-Timer (cleanen!)
      crossEspTimeouts: new Map(), // Map<requestId, timerId>
      pendingTimeouts: new Map(), // Map<taskId, timerId>
      eventTimers: new Map(), // Map<eventId, timerId>

      // Cleanup-Tracking
      cleanupStats: {
        memoryLeaksCleaned: 0,
        lastCleanup: null,
        totalTimers: 0,
      },
    },
  }),

  getters: {
    // ✅ NEU: Logic-Engine Getter
    getLogicEngine: (state) => state.logicEngine,

    // ✅ NEU: Aktor-Logik abrufen
    getActuatorLogic(espId, gpio) {
      return this.actuatorLogics.get(`${espId}-${gpio}`)
    },

    // ✅ NEU: Alle Aktor-Logiken abrufen
    getAllActuatorLogics() {
      return Array.from(this.actuatorLogics.entries()).map(([key, logic]) => {
        const [espId, gpio] = key.split('-')
        return { espId, gpio: parseInt(gpio), logic }
      })
    },

    // ✅ NEU: Erweiterte Logik-Statistiken mit Cross-ESP-Info
    getExtendedLogicStats() {
      const stats = {
        total: this.actuatorLogics.size,
        enabled: 0,
        disabled: 0,
        withCrossEspSensors: 0,
        byEsp: {},
      }

      this.actuatorLogics.forEach((logic, key) => {
        const [espId] = key.split('-')

        if (logic.enabled) stats.enabled++
        else stats.disabled++

        stats.byEsp[espId] = (stats.byEsp[espId] || 0) + 1

        // Cross-ESP Sensoren zählen
        if (logic.conditions) {
          const hasCrossEsp = logic.conditions.some((condition) => {
            const sensorRef = condition.sensorReference || { espId, gpio: condition.sensorGpio }
            return sensorRef.espId !== espId
          })
          if (hasCrossEsp) stats.withCrossEspSensors++
        }
      })

      return stats
    },

    // Timer für spezifischen Aktor
    getActuatorTimers: (state) => (espId, gpio) => {
      const timers = []
      for (const [key, timer] of state.timerConfigs.entries()) {
        if (key.startsWith(`${espId}-${gpio}-`)) {
          timers.push(timer)
        }
      }
      return timers
    },

    // Logs für spezifischen Aktor
    getActuatorLogs: (state) => (espId, gpio) => {
      return state.logicLogs.get(`${espId}-${gpio}`) || []
    },

    // Aktive Prozesse
    getActiveProcesses: (state) => Array.from(state.activeProcesses.values()),

    // ✅ NEU: Aktor-Typ-Validierung
    getActuatorTypeValidation: (state) => (actuatorType) => {
      return (
        state.actuatorTypeValidations[actuatorType] || {
          allowedInputs: ['binary'],
          maxPoints: 1,
          description: 'Standard-Aktor',
        }
      )
    },

    // Statistik
    getLogicStats: (state) => {
      const stats = {
        totalLogics: state.actuatorLogics.size,
        activeProcesses: state.activeProcesses.size,
        totalTimers: state.timerConfigs.size,
        totalLogs: 0,
        activeStates: state.logicEngine.activeStates.size,
      }

      for (const logs of state.logicLogs.values()) {
        stats.totalLogs += logs.length
      }

      return stats
    },

    // 🆕 NEU: Versionshistorie abrufen
    getLogicHistory: (state) => (logicId) => {
      return state.logicHistory.get(logicId) || []
    },

    // 🆕 NEU: Aktuelle Version abrufen
    getCurrentVersion: (state) => (logicId) => {
      const history = state.logicHistory.get(logicId)
      return history && history.length > 0 ? history[0] : null
    },
  },

  actions: {
    // ✅ NEU: Memory-Limit-Enforcement für Store-Maps
    enforceStoreMemoryLimits() {
      // Logic-Engine Memory-Limits
      this.logicEngine.enforceMapLimit(
        this.logicEngine.activeStates,
        this.logicEngine.memoryLimits.activeStates,
        'activeStates',
      )

      // Store Memory-Limits
      this.enforceMapLimit(this.actuatorLogics, this.memoryLimits.actuatorLogics, 'actuatorLogics')
      this.enforceMapLimit(this.timerConfigs, this.memoryLimits.timerConfigs, 'timerConfigs')
      this.enforceMapLimit(
        this.activeProcesses,
        this.memoryLimits.activeProcesses,
        'activeProcesses',
      )
      this.enforceMapLimit(this.logicHistory, this.memoryLimits.logicHistory, 'logicHistory')
      this.enforceMapLimit(
        this.crossEspLogicDefinitions,
        this.memoryLimits.crossEspLogicDefinitions,
        'crossEspLogicDefinitions',
      )

      // Logic-Logs mit spezieller Behandlung (Array-Limits pro Logic)
      this.enforceLogicLogsLimits()
    },

    // ✅ NEU: Logic-Logs Memory-Limits (Array-Limits pro Logic)
    enforceLogicLogsLimits() {
      for (const [logicKey, logs] of this.logicLogs.entries()) {
        if (logs.length > this.memoryLimits.logicLogs) {
          const toRemove = logs.splice(0, logs.length - this.memoryLimits.logicLogs)
          console.warn(
            `🧹 Logic-Logs limit enforced for ${logicKey}: removed ${toRemove.length} old entries`,
          )
        }
      }
    },

    // ✅ NEU: Map-Limit-Enforcement (LRU-Eviction)
    enforceMapLimit(map, limit, mapName) {
      if (map.size > limit) {
        const entries = Array.from(map.entries())

        // Sortiere nach Timestamp (LRU - Least Recently Used)
        entries.sort((a, b) => {
          const timestampA = a[1].timestamp || a[1].createdAt || a[1].updatedAt || 0
          const timestampB = b[1].timestamp || b[1].createdAt || b[1].updatedAt || 0
          return timestampA - timestampB
        })

        // Entferne die ältesten Einträge
        const toRemove = entries.slice(0, map.size - limit)
        toRemove.forEach(([key]) => {
          map.delete(key)
        })

        console.warn(
          `🧹 Memory-Limit enforced for ${mapName}: removed ${toRemove.length} old entries`,
        )
      }
    },

    // ✅ NEU: Sichere Map-Operationen mit Memory-Limits
    setActuatorLogic(key, logic) {
      this.actuatorLogics.set(key, { ...logic, updatedAt: Date.now() })
      this.enforceMapLimit(this.actuatorLogics, this.memoryLimits.actuatorLogics, 'actuatorLogics')

      // ✅ NEU: State-Persistence für kritische Actuators
      this.persistActuatorState(key, logic)
    },

    setTimerConfig(key, config) {
      this.timerConfigs.set(key, { ...config, updatedAt: Date.now() })
      this.enforceMapLimit(this.timerConfigs, this.memoryLimits.timerConfigs, 'timerConfigs')
    },

    setActiveProcess(key, process) {
      this.activeProcesses.set(key, { ...process, updatedAt: Date.now() })
      this.enforceMapLimit(
        this.activeProcesses,
        this.memoryLimits.activeProcesses,
        'activeProcesses',
      )
    },

    addLogicLog(logicKey, logEntry) {
      if (!this.logicLogs.has(logicKey)) {
        this.logicLogs.set(logicKey, [])
      }
      this.logicLogs.get(logicKey).push({ ...logEntry, timestamp: Date.now() })
      this.enforceLogicLogsLimits()
    },

    // ✅ NEU: State-Persistence für kritische Actuators
    persistActuatorState(key, logic) {
      try {
        const [espId, gpio] = key.split('-')
        const stateKey = `actuator_state_${espId}_${gpio}`

        const stateData = {
          espId,
          gpio,
          logic: {
            id: logic.id,
            name: logic.name,
            enabled: logic.enabled,
            failsafeEnabled: logic.failsafeEnabled,
            failsafeState: logic.failsafeState,
            manualOverride: logic.manualOverride,
          },
          timestamp: Date.now(),
          version: '1.0',
        }

        localStorage.setItem(stateKey, JSON.stringify(stateData))
        console.log(`💾 Actuator-State persisted: ${key}`)
      } catch (error) {
        console.error(`❌ Failed to persist actuator state for ${key}:`, error)
      }
    },

    // ✅ NEU: State-Restoration für kritische Actuators
    restoreActuatorState(espId, gpio) {
      try {
        const stateKey = `actuator_state_${espId}_${gpio}`
        const stateData = localStorage.getItem(stateKey)

        if (stateData) {
          const state = JSON.parse(stateData)
          const now = Date.now()
          const maxAge = 24 * 60 * 60 * 1000 // 24 Stunden

          if (now - state.timestamp < maxAge) {
            console.log(`🔄 Actuator-State restored: ${espId}-${gpio}`)
            return state.logic
          } else {
            // Alten State löschen
            localStorage.removeItem(stateKey)
            console.log(`🧹 Old actuator state removed: ${espId}-${gpio}`)
          }
        }

        return null
      } catch (error) {
        console.error(`❌ Failed to restore actuator state for ${espId}-${gpio}:`, error)
        return null
      }
    },

    // ✅ NEU: Safety-State-Backup mit Automatic-Restore
    backupSafetyState(espId, gpio, safetyState) {
      try {
        const safetyKey = `actuator_safety_${espId}_${gpio}`
        const safetyData = {
          espId,
          gpio,
          safetyState,
          timestamp: Date.now(),
          reason: 'network_loss_or_hardware_failure',
        }

        localStorage.setItem(safetyKey, JSON.stringify(safetyData))
        console.log(`🛡️ Safety-State backed up: ${espId}-${gpio} = ${safetyState}`)
      } catch (error) {
        console.error(`❌ Failed to backup safety state for ${espId}-${gpio}:`, error)
      }
    },

    // ✅ NEU: Safety-State-Restore nach Network-Recovery
    restoreSafetyState(espId, gpio) {
      try {
        const safetyKey = `actuator_safety_${espId}_${gpio}`
        const safetyData = localStorage.getItem(safetyKey)

        if (safetyData) {
          const safety = JSON.parse(safetyData)
          const now = Date.now()
          const maxAge = 60 * 60 * 1000 // 1 Stunde für Safety-States

          if (now - safety.timestamp < maxAge) {
            console.log(`🛡️ Safety-State restored: ${espId}-${gpio} = ${safety.safetyState}`)
            localStorage.removeItem(safetyKey) // Safety-State nach Restore löschen
            return safety.safetyState
          } else {
            localStorage.removeItem(safetyKey)
            console.log(`🧹 Old safety state removed: ${espId}-${gpio}`)
          }
        }

        return null
      } catch (error) {
        console.error(`❌ Failed to restore safety state for ${espId}-${gpio}:`, error)
        return null
      }
    },

    // ✅ NEU: Log-Eintrag hinzufügen mit Memory-Limits (für ESP/GPIO)
    addLogicLogForActuator(espId, gpio, eventType, data) {
      const logKey = `${espId}-${gpio}`
      const logEntry = {
        id: `${logKey}-${Date.now()}`,
        timestamp: Date.now(),
        eventType,
        data,
        user: 'system', // TODO: Benutzer-Integration
      }

      // ✅ NEU: Sichere Log-Operation mit Memory-Limits
      this.addLogicLog(logKey, logEntry)
    },

    // ✅ MIGRIERT: Zentrale Aktor-Steuerung mit Prioritätsmanagement - Event-basiert
    async controlActuatorWithPriority(espId, gpio, actuatorType, value) {
      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ACTUATOR_COMMAND, {
        espId,
        gpio,
        command: 'control',
        value: value,
        actuatorType,
        timestamp: Date.now(),
      })

      try {
        // Zustand über Logic-Engine evaluieren
        const finalState = this.logicEngine.evaluateActuatorState(espId, gpio, actuatorType)

        // Log-Eintrag erstellen
        this.addLogicLogForActuator(espId, gpio, 'ACTUATOR_CONTROLLED', {
          message: `Aktor gesteuert: ${finalState.state ? 'Aktiv' : 'Inaktiv'}`,
          source: finalState.source,
          priority: finalState.priority,
          reason: finalState.reason,
          requestedValue: value,
          finalValue: finalState.state,
        })

        return finalState
      } catch (error) {
        console.error('Failed to control actuator with priority:', error)
        throw error
      }
    },

    // ✅ MIGRIERT: Manueller Override - Event-basiert
    async setManualOverride(espId, gpio, state, reason = 'manual') {
      this.logicEngine.setManualOverride(espId, gpio, state, reason)

      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ACTUATOR_OVERRIDE, {
        espId,
        gpio,
        value: state,
        reason,
        timestamp: Date.now(),
      })

      // ✅ MIGRIERT: Event-basierte Device-Daten-Abfrage
      eventBus.emit(MQTT_EVENTS.DEVICE_DATA_REQUEST, {
        espId,
        gpio,
        type: 'actuator',
        timestamp: Date.now(),
      })

      // Aktor sofort steuern mit Event-basierter Kommunikation
      await this.controlActuatorWithPriority(espId, gpio, 'ACTUATOR_RELAY', state)

      this.addLogicLogForActuator(espId, gpio, 'MANUAL_OVERRIDE_SET', {
        message: `Manueller Override gesetzt: ${state ? 'Aktiv' : 'Inaktiv'}`,
        reason,
      })
    },

    // ✅ MIGRIERT: Override zurücksetzen - Event-basiert
    async clearManualOverride(espId, gpio) {
      this.logicEngine.clearManualOverride(espId, gpio)

      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ACTUATOR_CLEAR_OVERRIDE, {
        espId,
        gpio,
        timestamp: Date.now(),
      })

      // ✅ MIGRIERT: Event-basierte Device-Daten-Abfrage
      eventBus.emit(MQTT_EVENTS.DEVICE_DATA_REQUEST, {
        espId,
        gpio,
        type: 'actuator',
        timestamp: Date.now(),
      })

      // Logik-basierte Steuerung wiederherstellen mit Event-basierter Kommunikation
      await this.controlActuatorWithPriority(espId, gpio, 'ACTUATOR_RELAY', null)

      this.addLogicLogForActuator(espId, gpio, 'MANUAL_OVERRIDE_CLEARED', {
        message: 'Manueller Override zurückgesetzt',
      })
    },

    // ✅ NEU: Erweiterte Logik-Validierung
    validateLogicConfig(config, actuatorType) {
      const validation = this.getActuatorTypeValidation(actuatorType)

      if (!config.conditions && !config.timers && !config.events) {
        throw new Error('Mindestens eine Bedingung, Timer oder Event erforderlich')
      }

      // Aktor-Typ-spezifische Validierung
      if (config.conditions) {
        config.conditions.forEach((condition, index) => {
          if (!condition.sensorGpio || !condition.operator || condition.threshold === undefined) {
            throw new Error(`Ungültige Bedingung ${index + 1}`)
          }

          // Prüfe, ob Input-Typ erlaubt ist
          if (!validation.allowedInputs.includes('sensor')) {
            throw new Error(`Sensor-Bedingungen nicht erlaubt für ${actuatorType}`)
          }
        })
      }

      if (config.timers) {
        config.timers.forEach((timer, index) => {
          if (!timer.startTime || !timer.endTime) {
            throw new Error(`Ungültiger Timer ${index + 1}`)
          }

          if (!validation.allowedInputs.includes('timer')) {
            throw new Error(`Timer nicht erlaubt für ${actuatorType}`)
          }
        })

        // Prüfe maximale Anzahl Punkte
        if (config.timers.length > validation.maxPoints) {
          throw new Error(
            `Maximal ${validation.maxPoints} Timer-Punkte erlaubt für ${actuatorType}`,
          )
        }
      }

      if (config.events) {
        config.events.forEach(() => {
          if (!validation.allowedInputs.includes('event')) {
            throw new Error(`Events nicht erlaubt für ${actuatorType}`)
          }
        })
      }
    },

    // ✅ MIGRIERT: Aktor-Logik konfigurieren - Event-basiert
    async configureActuatorLogic(espId, gpio, logicConfig) {
      // ✅ LÖSUNG: Event-basierte Kommunikation mit MQTT Store
      const { useMqttStore } = await import('./mqtt')
      const mqttStore = useMqttStore()
      const systemCommands = useSystemCommandsStore()

      if (!mqttStore.isConnected) {
        throw new Error('MQTT nicht verbunden')
      }

      // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
      eventBus.emit(MQTT_EVENTS.ACTUATOR_LOGIC_CONFIG, {
        espId,
        gpio,
        config: logicConfig,
        timestamp: Date.now(),
      })

      this.loading = true
      this.error = null

      try {
        const logicKey = `${espId}-${gpio}`

        // Validierung
        this.validateLogicConfig(logicConfig, 'ACTUATOR_RELAY') // Default actuator type for now

        // ✅ NEU: Sichere Logic-Speicherung mit Memory-Limits
        const logic = {
          id: logicKey,
          espId,
          gpio,
          name: logicConfig.name || `Aktor-Logik ${gpio}`,
          description: logicConfig.description || '',
          conditions: logicConfig.conditions || [],
          timers: logicConfig.timers || [],
          events: logicConfig.events || [],
          manualOverride: logicConfig.manualOverride || false,
          failsafeEnabled:
            logicConfig.failsafeEnabled !== undefined
              ? logicConfig.failsafeEnabled
              : this.safetySettings.failsafeEnabled,
          failsafeState:
            logicConfig.failsafeState !== undefined
              ? logicConfig.failsafeState
              : this.safetySettings.failsafeDefaultState,
          enabled: logicConfig.enabled !== undefined ? logicConfig.enabled : true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        this.setActuatorLogic(logicKey, logic)

        // ✅ NEU: Sichere Timer-Konfigurationen mit Memory-Limits
        if (logicConfig.timers) {
          logicConfig.timers.forEach((timer, index) => {
            const timerKey = `${logicKey}-timer-${index}`
            const timerConfig = {
              id: timerKey,
              espId,
              gpio,
              name: timer.name,
              startTime: timer.startTime,
              endTime: timer.endTime,
              days: timer.days || [0, 1, 2, 3, 4, 5, 6], // Alle Tage
              enabled: timer.enabled !== undefined ? timer.enabled : true,
              createdAt: Date.now(),
            }
            this.setTimerConfig(timerKey, timerConfig)
          })
        }

        // Logik an ESP senden
        await systemCommands.sendCommand(espId, 'configure_actuator_logic', {
          gpio,
          logic: JSON.stringify(logic),
        })

        // Log-Eintrag erstellen
        this.addLogicLog(espId, gpio, 'CONFIGURED', {
          message: 'Aktor-Logik konfiguriert',
          config: logic,
        })

        this.persistLogicConfig()
        this.lastUpdate = Date.now()

        return logic
      } catch (error) {
        console.error('Failed to configure actuator logic:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // Logik-Prozess starten
    async startLogicProcess(espId, gpio) {
      const logic = this.getActuatorLogic(espId, gpio)
      if (!logic || !logic.enabled) {
        throw new Error('Logik nicht verfügbar oder deaktiviert')
      }

      const processKey = `${espId}-${gpio}`

      // Prüfe maximale Anzahl aktiver Prozesse
      if (this.activeProcesses.size >= this.safetySettings.maxConcurrentProcesses) {
        throw new Error('Maximale Anzahl aktiver Prozesse erreicht')
      }

      const process = {
        id: processKey,
        espId,
        gpio,
        logicId: logic.id,
        status: 'running',
        startTime: Date.now(),
        lastEvaluation: Date.now(),
        evaluations: 0,
        triggers: [],
        currentState: null,
      }

      this.setActiveProcess(processKey, process)

      // Log-Eintrag
      this.addLogicLog(espId, gpio, 'PROCESS_STARTED', {
        message: 'Logik-Prozess gestartet',
        processId: process.id,
      })

      // Timer für regelmäßige Auswertung starten
      this.startEvaluationTimer(espId, gpio)

      return process
    },

    // Logik-Prozess stoppen
    async stopLogicProcess(espId, gpio) {
      const processKey = `${espId}-${gpio}`
      const process = this.activeProcesses.get(processKey)

      if (process) {
        process.status = 'stopped'
        process.endTime = Date.now()

        this.activeProcesses.delete(processKey)

        // Log-Eintrag
        this.addLogicLog(espId, gpio, 'PROCESS_STOPPED', {
          message: 'Logik-Prozess gestoppt',
          processId: process.id,
          duration: process.endTime - process.startTime,
        })
      }
    },

    // Logik auswerten
    async evaluateLogic(espId, gpio) {
      const logic = this.getActuatorLogic(espId, gpio)
      const process = this.activeProcesses.get(`${espId}-${gpio}`)

      if (!logic || !process || process.status !== 'running') {
        return
      }

      try {
        const sensorRegistry = useSensorRegistryStore()
        const systemCommands = useSystemCommandsStore()

        // Bedingungen auswerten
        const conditionsMet = await this.evaluateConditions(logic.conditions, espId, sensorRegistry)
        const timersActive = this.evaluateTimers(espId, gpio)
        const eventsActive = this.evaluateEvents(logic.events)

        // Gesamtentscheidung
        const shouldActivate = conditionsMet && timersActive && eventsActive

        // Aktor steuern wenn sich Zustand geändert hat
        if (shouldActivate !== process.currentState) {
          await systemCommands.controlActuator(espId, gpio, shouldActivate ? 1 : 0, 'logic')

          process.currentState = shouldActivate
          process.evaluations++
          process.lastEvaluation = Date.now()

          // Trigger loggen
          const trigger = {
            timestamp: Date.now(),
            type: shouldActivate ? 'ACTIVATED' : 'DEACTIVATED',
            reason: this.getTriggerReason(conditionsMet, timersActive, eventsActive),
          }
          process.triggers.push(trigger)

          // Log-Eintrag
          this.addLogicLog(
            espId,
            gpio,
            shouldActivate ? 'ACTUATOR_ACTIVATED' : 'ACTUATOR_DEACTIVATED',
            {
              message: `Aktor ${shouldActivate ? 'aktiviert' : 'deaktiviert'}`,
              trigger: trigger,
            },
          )
        }
      } catch (error) {
        console.error('Logic evaluation failed:', error)

        // Failsafe aktivieren wenn konfiguriert
        if (logic.failsafeEnabled) {
          await this.activateFailsafe(espId, gpio, logic.failsafeState)
        }

        this.addLogicLog(espId, gpio, 'EVALUATION_ERROR', {
          message: 'Logik-Auswertung fehlgeschlagen',
          error: error.message,
        })
      }
    },

    // Bedingungen auswerten
    async evaluateConditions(conditions, espId, sensorRegistry) {
      if (!conditions || conditions.length === 0) {
        return true // Keine Bedingungen = immer erfüllt
      }

      const results = await Promise.all(
        conditions.map(async (condition) => {
          // ✅ BESTEHENDE Cross-ESP Sensor-Unterstützung erweitern
          let sensorEspId = espId
          let sensorGpio = condition.sensorGpio

          if (condition.sensorReference) {
            sensorEspId = condition.sensorReference.espId || espId
            sensorGpio = condition.sensorReference.gpio || condition.sensorGpio

            // ✅ NEU: Kaiser-Referenzierung hinzufügen
            if (condition.sensorReference.kaiserId) {
              // Cross-Kaiser Sensor-Zugriff
              const crossKaiserData = await this.getCrossKaiserSensorData(
                condition.sensorReference.kaiserId,
                sensorEspId,
                sensorGpio,
              )
              return this.evaluateCondition(condition, crossKaiserData)
            }
          }

          // ✅ BESTEHENDE Logik beibehalten
          const sensorData = await sensorRegistry.getSensor(sensorEspId, sensorGpio)
          if (!this.evaluateCondition(condition, sensorData)) {
            return false
          }

          return true
        }),
      )

      // Alle Bedingungen müssen erfüllt sein (UND-Logik)
      return results.every((result) => result)
    },

    // Timer auswerten
    evaluateTimers(espId, gpio) {
      const timers = this.getActuatorTimers(espId, gpio)
      if (timers.length === 0) {
        return true // Keine Timer = immer aktiv
      }

      const now = new Date()
      const currentTime = now.getHours() * 60 + now.getMinutes() // Minuten seit Mitternacht
      const currentDay = now.getDay() // 0 = Sonntag, 1 = Montag, etc.

      return timers.some((timer) => {
        if (!timer.enabled) return false

        // Prüfe Wochentag
        if (!timer.days.includes(currentDay)) return false

        // Prüfe Zeitfenster
        const startMinutes = timeToMinutes(timer.startTime)
        const endMinutes = timeToMinutes(timer.endTime)

        if (startMinutes <= endMinutes) {
          // Normaler Tag (z.B. 8:00 - 18:00)
          return currentTime >= startMinutes && currentTime <= endMinutes
        } else {
          // Über Mitternacht (z.B. 22:00 - 6:00)
          return currentTime >= startMinutes || currentTime <= endMinutes
        }
      })
    },

    // Events auswerten
    evaluateEvents(events) {
      if (!events || events.length === 0) {
        return true // Keine Events = immer aktiv
      }

      // Hier würde die Event-Auswertung implementiert
      // Für jetzt: alle Events als aktiv betrachten
      return true
    },

    // ✅ ERWEITERT: Failsafe aktivieren mit Safety-State-Backup
    async activateFailsafe(espId, gpio, failsafeState) {
      const systemCommands = useSystemCommandsStore()

      try {
        await systemCommands.controlActuator(espId, gpio, failsafeState ? 1 : 0, 'failsafe')

        // ✅ NEU: Safety-State-Backup für Network-Recovery
        this.backupSafetyState(espId, gpio, failsafeState)

        this.addLogicLogForActuator(espId, gpio, 'FAILSAFE_ACTIVATED', {
          message: `Failsafe aktiviert: Aktor auf ${failsafeState ? 'Aktiv' : 'Inaktiv'} gesetzt`,
          failsafeState,
        })
      } catch (error) {
        console.error('Failsafe activation failed:', error)
      }
    },

    // ✅ MIGRIERT: Cross-Kaiser Sensor-Daten abrufen - Event-basiert
    async getCrossKaiserSensorData(kaiserId, espId, gpio) {
      try {
        // ✅ MIGRIERT: Event-basierte Kommunikation statt direkter Store-Zugriff
        eventBus.emit(MQTT_EVENTS.CROSS_KAISER_SENSOR_DATA, {
          kaiserId,
          espId,
          gpio,
          timestamp: Date.now(),
        })

        // ✅ LÖSUNG: Event-basierte Kommunikation mit MQTT Store
        const { useMqttStore } = await import('./mqtt')
        const mqttStore = useMqttStore()
        const topic = `kaiser/${kaiserId}/esp/${espId}/sensor/${gpio}/data`

        // BESTEHENDE MQTT-Request-Methode nutzen
        return await mqttStore.request(topic, {
          request_type: 'get_sensor_data',
          timestamp: Date.now(),
        })
      } catch (error) {
        console.error(`Failed to get cross-kaiser sensor data: ${kaiserId}/${espId}/${gpio}`, error)
        return null
      }
    },

    // ✅ ERWEITERT: Bedingung auswerten mit Sensor-Dependency-Protection
    evaluateCondition(condition, sensorData) {
      // ✅ NEU: Sensor-Data-Quality-Checks
      if (!sensorData) {
        console.warn('Sensor data not available for condition evaluation')
        return this.getFallbackValue(condition) // ✅ NEU: Fallback-Value
      }

      // ✅ NEU: Sensor-Data-Validierung
      if (!this.isValidSensorData(sensorData)) {
        console.warn('Invalid sensor data for condition evaluation')
        return this.getFallbackValue(condition) // ✅ NEU: Fallback-Value
      }

      const value = Number(sensorData.value)
      const threshold = Number(condition.threshold)

      // ✅ NEU: Range-Validation für Hardware-Limits
      if (!this.isValidSensorValue(value, condition)) {
        console.warn(`Sensor value ${value} outside valid range for condition`)
        return this.getFallbackValue(condition) // ✅ NEU: Fallback-Value
      }

      switch (condition.operator) {
        case '>':
          return value > threshold
        case '<':
          return value < threshold
        case '>=':
          return value >= threshold
        case '<=':
          return value <= threshold
        case '==':
          return value === threshold
        case '!=':
          return value !== threshold
        default:
          return false
      }
    },

    // ✅ NEU: Sensor-Data-Quality-Validation
    isValidSensorData(sensorData) {
      if (!sensorData || typeof sensorData !== 'object') return false
      if (sensorData.value === undefined || sensorData.value === null) return false
      if (isNaN(Number(sensorData.value))) return false
      if (sensorData.timestamp && Date.now() - sensorData.timestamp > 5 * 60 * 1000) {
        // Sensor-Daten älter als 5 Minuten
        console.warn('Sensor data too old for reliable evaluation')
        return false
      }
      return true
    },

    // ✅ NEU: Sensor-Value-Range-Validation
    isValidSensorValue(value, condition) {
      // Hardware-spezifische Limits basierend auf Sensor-Typ
      const limits = this.getSensorLimits(condition.sensorType || 'default')

      if (value < limits.min || value > limits.max) {
        console.warn(`Sensor value ${value} outside hardware limits [${limits.min}, ${limits.max}]`)
        return false
      }

      return true
    },

    // ✅ NEU: Sensor-Hardware-Limits
    getSensorLimits(sensorType) {
      const limits = {
        temperature: { min: -40, max: 125 },
        humidity: { min: 0, max: 100 },
        pressure: { min: 300, max: 1100 },
        light: { min: 0, max: 65535 },
        soil_moisture: { min: 0, max: 1023 },
        default: { min: -1000, max: 10000 },
      }

      return limits[sensorType] || limits.default
    },

    // ✅ NEU: Fallback-Value bei Sensor-Failure
    getFallbackValue(condition) {
      // Graceful-Degradation: Bei Sensor-Failure konservativ entscheiden
      const fallbackStrategy = condition.fallbackStrategy || 'safe_off'

      switch (fallbackStrategy) {
        case 'safe_off':
          return false // Sicherheitshalber aus
        case 'safe_on':
          return true // Sicherheitshalber an
        case 'maintain_last':
          return condition.lastValidValue || false
        case 'use_default':
          return condition.defaultValue || false
        default:
          return false // Standard: Sicherheitshalber aus
      }
    },

    getTriggerReason(conditionsMet, timersActive, eventsActive) {
      const reasons = []
      if (conditionsMet) reasons.push('Bedingungen erfüllt')
      if (timersActive) reasons.push('Timer aktiv')
      if (eventsActive) reasons.push('Events aktiv')
      return reasons.join(', ')
    },

    // Evaluation-Timer starten
    startEvaluationTimer(espId, gpio) {
      const interval = setInterval(async () => {
        const process = this.activeProcesses.get(`${espId}-${gpio}`)
        if (!process || process.status !== 'running') {
          clearInterval(interval)
          return
        }

        await this.evaluateLogic(espId, gpio)
      }, 5000) // Alle 5 Sekunden auswerten

      // ✅ NEU: System-Timer registrieren (permanent)
      const timerId = `system_evaluation_${espId}_${gpio}`
      this.timerManagement.systemTimers.set(timerId, {
        type: 'SYSTEM_EVALUATION',
        description: `Logic-Evaluation für ESP ${espId} GPIO ${gpio}`,
        interval: 5000,
        espId,
        gpio,
      })

      // Timer-ID speichern für Cleanup
      const process = this.activeProcesses.get(`${espId}-${gpio}`)
      if (process) {
        process.evaluationTimer = interval
        process.timerId = timerId // ✅ NEU: Timer-ID für Cleanup-Tracking
      }

      console.log(`✅ System-Timer gestartet: ${timerId} für ESP ${espId} GPIO ${gpio}`)
    },

    // Persistierung
    persistLogicConfig() {
      storage.save('actuator_logics', Array.from(this.actuatorLogics.entries()))
      storage.save('timer_configs', Array.from(this.timerConfigs.entries()))
      storage.save('logic_logs', Array.from(this.logicLogs.entries()))

      // ✅ NEU: User-Logic-Timer persistieren
      const userLogicTimers = Array.from(this.timerManagement.userLogicTimers.entries()).map(
        ([logicId, timerInfo]) => [
          logicId,
          {
            schedule: timerInfo.schedule,
            description: timerInfo.description,
            createdAt: timerInfo.createdAt,
            // timerId NICHT speichern - wird neu erstellt
          },
        ],
      )
      storage.save('user_logic_timers', userLogicTimers)
    },

    // Wiederherstellung
    restoreLogicConfig() {
      const logics = storage.load('actuator_logics', [])
      const timers = storage.load('timer_configs', [])
      const logs = storage.load('logic_logs', [])

      this.actuatorLogics = new Map(logics)
      this.timerConfigs = new Map(timers)
      this.logicLogs = new Map(logs)

      // ✅ NEU: User-Logic-Timer wiederherstellen
      const userLogicTimers = storage.load('user_logic_timers', [])
      for (const [logicId, timerInfo] of userLogicTimers) {
        // Timer mit gleicher Schedule neu erstellen
        this.createUserLogicTimer(logicId, timerInfo.schedule)
        console.log(`♻️ User-Logic-Timer wiederhergestellt: ${logicId}`)
      }

      console.log(`✅ ${userLogicTimers.length} User-Logic-Timer wiederhergestellt`)
    },

    // ✅ ERWEITERT: Intelligentes Timer-Cleanup mit Memory-Limits
    cleanup() {
      console.log('🧹 ActuatorLogic cleanup gestartet...')

      // ✅ NEU: Memory-Limits durchsetzen
      this.enforceStoreMemoryLimits()

      // ✅ System-Timer BEHALTEN (nur bei Store-Destruction cleanen)
      if (this.isStoreDestroyed) {
        console.log('🔄 Store-Destruction erkannt - System-Timer werden gecleaned')
        for (const [timerId, timerInfo] of this.timerManagement.systemTimers.entries()) {
          const process = this.activeProcesses.get(`${timerInfo.espId}-${timerInfo.gpio}`)
          if (process && process.evaluationTimer) {
            clearInterval(process.evaluationTimer)
            console.log(`✅ System-Timer gecleaned: ${timerId}`)
          }
        }
        this.timerManagement.systemTimers.clear()
      }

      // ✅ Memory-Leak-Timer CLEANEN (sofort)
      this.cleanupMemoryLeakTimers()

      // ✅ User-Logic-Timer BEHALTEN (sind Features!)
      console.log(
        `✅ User-Logic-Timer bleiben aktiv: ${this.timerManagement.userLogicTimers.size} Timer`,
      )

      // ✅ BESTEHEND: Aktive Prozesse stoppen
      for (const [, process] of this.activeProcesses.entries()) {
        if (process.evaluationTimer && !this.timerManagement.systemTimers.has(process.timerId)) {
          clearInterval(process.evaluationTimer)
        }
      }
      this.activeProcesses.clear()

      console.log('✅ ActuatorLogic cleanup abgeschlossen (Memory-Leaks + Limits)')
    },

    // ✅ NEU: Nur Memory-Leak-Timer cleanen
    cleanupMemoryLeakTimers() {
      let cleanedCount = 0

      // 1. Cross-ESP Timeout-Timer cleanen
      for (const [requestId, timerId] of this.timerManagement.crossEspTimeouts.entries()) {
        clearTimeout(timerId)
        this.timerManagement.crossEspTimeouts.delete(requestId)
        cleanedCount++
        console.log(`🧹 Cross-ESP Timeout gecleaned: ${requestId}`)
      }

      // 2. Vergessene setTimeout cleanen
      for (const [taskId, timerId] of this.timerManagement.pendingTimeouts.entries()) {
        clearTimeout(timerId)
        this.timerManagement.pendingTimeouts.delete(taskId)
        cleanedCount++
        console.log(`🧹 Pending Timeout gecleaned: ${taskId}`)
      }

      // 3. Event-basierte Timer cleanen (nicht User-Logic!)
      for (const [eventId, timerId] of this.timerManagement.eventTimers.entries()) {
        clearTimeout(timerId)
        this.timerManagement.eventTimers.delete(eventId)
        cleanedCount++
        console.log(`🧹 Event Timer gecleaned: ${eventId}`)
      }

      // Cleanup-Statistiken aktualisieren
      this.timerManagement.cleanupStats.memoryLeaksCleaned += cleanedCount
      this.timerManagement.cleanupStats.lastCleanup = Date.now()
      this.timerManagement.cleanupStats.totalTimers =
        this.timerManagement.systemTimers.size + this.timerManagement.userLogicTimers.size

      console.log(`✅ Memory-Leak-Cleanup abgeschlossen: ${cleanedCount} Timer gecleaned`)
    },

    // ✅ ERWEITERT: User-Logic-Timer verwalten mit Race-Condition-Protection
    createUserLogicTimer(logicId, schedule) {
      // ✅ NEU: Race-Condition-Protection - Prüfe ob Timer bereits existiert
      const existingTimer = this.timerManagement.userLogicTimers.get(logicId)
      if (existingTimer) {
        console.warn(`⚠️ Timer-Race-Condition verhindert: Timer für ${logicId} bereits aktiv`)
        clearInterval(existingTimer.timerId)
        this.timerManagement.userLogicTimers.delete(logicId)
      }

      // ✅ NEU: Central-Timer-Registry mit Conflict-Detection
      const timerId = setInterval(() => {
        this.executeScheduledLogic(logicId)
      }, schedule.intervalMs)

      this.timerManagement.userLogicTimers.set(logicId, {
        timerId,
        schedule,
        description: schedule.description || `User-Logic Timer für ${logicId}`,
        createdAt: Date.now(),
        lastExecution: null,
        executionCount: 0,
      })

      console.log(`✅ User-Logic-Timer erstellt: ${logicId} (${schedule.description})`)

      // ✅ NEU: Sofort persistieren nach Erstellung
      this.persistLogicConfig()

      return timerId
    },

    // ✅ NEU: User-Logic-Timer entfernen (nur wenn User die Logic löscht)
    removeUserLogicTimer(logicId) {
      const timerInfo = this.timerManagement.userLogicTimers.get(logicId)
      if (timerInfo) {
        clearInterval(timerInfo.timerId)
        this.timerManagement.userLogicTimers.delete(logicId)
        console.log(`✅ User-Logic-Timer entfernt: ${logicId}`)

        // ✅ NEU: Sofort persistieren nach Löschung
        this.persistLogicConfig()
      }
    },

    // ✅ NEU: Memory-Leak-Timer hinzufügen
    addCrossEspTimeout(requestId, timeoutMs) {
      const timerId = setTimeout(() => {
        this.handleCrossEspTimeout(requestId)
        this.timerManagement.crossEspTimeouts.delete(requestId) // Auto-cleanup
      }, timeoutMs)

      this.timerManagement.crossEspTimeouts.set(requestId, timerId)
      console.log(`⏰ Cross-ESP Timeout gesetzt: ${requestId} (${timeoutMs}ms)`)
      return timerId
    },

    // ✅ NEU: Pending Timeout hinzufügen
    addPendingTimeout(taskId, timeoutMs, callback) {
      const timerId = setTimeout(() => {
        callback()
        this.timerManagement.pendingTimeouts.delete(taskId) // Auto-cleanup
      }, timeoutMs)

      this.timerManagement.pendingTimeouts.set(taskId, timerId)
      console.log(`⏰ Pending Timeout gesetzt: ${taskId} (${timeoutMs}ms)`)
      return timerId
    },

    // ✅ NEU: Event Timer hinzufügen
    addEventTimer(eventId, timeoutMs, callback) {
      const timerId = setTimeout(() => {
        callback()
        this.timerManagement.eventTimers.delete(eventId) // Auto-cleanup
      }, timeoutMs)

      this.timerManagement.eventTimers.set(eventId, timerId)
      console.log(`⏰ Event Timer gesetzt: ${eventId} (${timeoutMs}ms)`)
      return timerId
    },

    // ✅ NEU: Timer-Statistiken abrufen
    getTimerStats() {
      return {
        system: this.timerManagement.systemTimers.size,
        userLogic: this.timerManagement.userLogicTimers.size,
        crossEspTimeouts: this.timerManagement.crossEspTimeouts.size,
        pendingTimeouts: this.timerManagement.pendingTimeouts.size,
        eventTimers: this.timerManagement.eventTimers.size,
        cleanupStats: this.timerManagement.cleanupStats,
      }
    },

    // ✅ NEU: Scheduled Logic ausführen (User-Feature)
    // ✅ ERWEITERT: Geplante Logik ausführen mit Race-Condition-Protection
    executeScheduledLogic(logicId) {
      const timerInfo = this.timerManagement.userLogicTimers.get(logicId)
      if (!timerInfo) {
        console.warn(`⚠️ Timer-Info nicht gefunden für ${logicId}`)
        return
      }

      // ✅ NEU: Race-Condition-Protection - Prüfe auf gleichzeitige Ausführungen
      const now = Date.now()
      const minInterval = timerInfo.schedule.intervalMs || 1000

      if (timerInfo.lastExecution && now - timerInfo.lastExecution < minInterval) {
        console.warn(`⚠️ Timer-Race-Condition verhindert: ${logicId} - zu häufige Ausführung`)
        return
      }

      // ✅ NEU: Execution-Tracking
      timerInfo.lastExecution = now
      timerInfo.executionCount++

      console.log(
        `🕐 Scheduled Logic ausgeführt: ${logicId} (Execution #${timerInfo.executionCount})`,
      )

      // ✅ NEU: Logic-Ausführung mit Error-Handling
      try {
        // Hier würde die tatsächliche Logic-Ausführung implementiert
        // z.B. "Täglich um 18:00 Bewässerung einschalten"
        // this.evaluateLogic(logicId)
      } catch (error) {
        console.error(`❌ Scheduled Logic execution failed for ${logicId}:`, error)
      }
    },

    // ✅ NEU: Cross-ESP Timeout Handler
    handleCrossEspTimeout(requestId) {
      console.log(`⏰ Cross-ESP Timeout erreicht: ${requestId}`)
      // Hier würde die Timeout-Behandlung implementiert
    },

    // 🆕 NEU: Logik-Version speichern
    async saveLogicVersion(logicId, snapshot, user, reason = 'manual_change') {
      const version = {
        id: `${logicId}-v${Date.now()}`,
        logicId,
        snapshot: JSON.parse(JSON.stringify(snapshot)), // Deep copy
        user: user || 'system',
        reason,
        timestamp: Date.now(),
        changes: this.detectChanges(logicId, snapshot),
      }

      if (!this.logicHistory.has(logicId)) {
        this.logicHistory.set(logicId, [])
      }

      const history = this.logicHistory.get(logicId)
      history.unshift(version)

      // Alte Versionen löschen
      if (history.length > this.versionSettings.maxVersions) {
        history.splice(this.versionSettings.maxVersions)
      }

      this.persistLogicHistory()

      return version
    },

    // 🆕 NEU: Änderungen erkennen
    detectChanges(logicId, newSnapshot) {
      const history = this.logicHistory.get(logicId)
      if (!history || history.length === 0) {
        return { type: 'created', details: 'Logik erstellt' }
      }

      const lastVersion = history[0].snapshot
      const changes = []

      // Bedingungen vergleichen
      if (newSnapshot.conditions !== lastVersion.conditions) {
        changes.push({
          type: 'conditions_changed',
          details: this.compareConditions(lastVersion.conditions, newSnapshot.conditions),
        })
      }

      // Timer vergleichen
      if (newSnapshot.timers !== lastVersion.timers) {
        changes.push({
          type: 'timers_changed',
          details: this.compareTimers(lastVersion.timers, newSnapshot.timers),
        })
      }

      // Name/Beschreibung vergleichen
      if (newSnapshot.name !== lastVersion.name) {
        changes.push({
          type: 'name_changed',
          details: `Name geändert: "${lastVersion.name}" → "${newSnapshot.name}"`,
        })
      }

      return {
        type: 'modified',
        changes,
        summary: `${changes.length} Änderungen`,
      }
    },

    // 🆕 NEU: Bedingungen vergleichen
    compareConditions(oldConditions, newConditions) {
      const changes = []

      if (!oldConditions && newConditions) {
        changes.push('Bedingungen hinzugefügt')
        return changes
      }

      if (oldConditions && !newConditions) {
        changes.push('Bedingungen entfernt')
        return changes
      }

      if (oldConditions.length !== newConditions.length) {
        changes.push(
          `Anzahl Bedingungen geändert: ${oldConditions.length} → ${newConditions.length}`,
        )
      }

      // Einzelne Bedingungen vergleichen
      const maxLength = Math.max(oldConditions.length, newConditions.length)
      for (let i = 0; i < maxLength; i++) {
        const oldCondition = oldConditions[i]
        const newCondition = newConditions[i]

        if (!oldCondition && newCondition) {
          changes.push(`Bedingung ${i + 1} hinzugefügt`)
        } else if (oldCondition && !newCondition) {
          changes.push(`Bedingung ${i + 1} entfernt`)
        } else if (oldCondition && newCondition) {
          if (oldCondition.threshold !== newCondition.threshold) {
            changes.push(
              `Bedingung ${i + 1} Schwellenwert: ${oldCondition.threshold} → ${newCondition.threshold}`,
            )
          }
          if (oldCondition.operator !== newCondition.operator) {
            changes.push(
              `Bedingung ${i + 1} Operator: ${oldCondition.operator} → ${newCondition.operator}`,
            )
          }
        }
      }

      return changes
    },

    // 🆕 NEU: Timer vergleichen
    compareTimers(oldTimers, newTimers) {
      const changes = []

      if (!oldTimers && newTimers) {
        changes.push('Timer hinzugefügt')
        return changes
      }

      if (oldTimers && !newTimers) {
        changes.push('Timer entfernt')
        return changes
      }

      if (oldTimers.length !== newTimers.length) {
        changes.push(`Anzahl Timer geändert: ${oldTimers.length} → ${newTimers.length}`)
      }

      // Einzelne Timer vergleichen
      const maxLength = Math.max(oldTimers.length, newTimers.length)
      for (let i = 0; i < maxLength; i++) {
        const oldTimer = oldTimers[i]
        const newTimer = newTimers[i]

        if (!oldTimer && newTimer) {
          changes.push(`Timer ${i + 1} hinzugefügt`)
        } else if (oldTimer && !newTimer) {
          changes.push(`Timer ${i + 1} entfernt`)
        } else if (oldTimer && newTimer) {
          if (oldTimer.startTime !== newTimer.startTime) {
            changes.push(`Timer ${i + 1} Startzeit: ${oldTimer.startTime} → ${newTimer.startTime}`)
          }
          if (oldTimer.endTime !== newTimer.endTime) {
            changes.push(`Timer ${i + 1} Endzeit: ${oldTimer.endTime} → ${newTimer.endTime}`)
          }
        }
      }

      return changes
    },

    // 🆕 NEU: Version wiederherstellen
    async restoreLogicVersion(logicId, versionId) {
      const history = this.logicHistory.get(logicId)
      if (!history) throw new Error('Keine Versionshistorie gefunden')

      const version = history.find((v) => v.id === versionId)
      if (!version) throw new Error('Version nicht gefunden')

      // Aktuelle Version sichern
      const currentLogic = this.actuatorLogics.get(logicId)
      if (currentLogic) {
        await this.saveLogicVersion(logicId, currentLogic, 'system', 'backup_before_restore')
      }

      // Version wiederherstellen
      const restoredLogic = { ...version.snapshot }
      this.actuatorLogics.set(logicId, restoredLogic)

      // Log-Eintrag
      this.addLogicLog(restoredLogic.espId, restoredLogic.gpio, 'VERSION_RESTORED', {
        message: `Version ${versionId} wiederhergestellt`,
        restoredVersion: version,
        restoredBy: 'user',
      })

      return restoredLogic
    },

    // 🆕 NEU: Versionshistorie persistieren
    persistLogicHistory() {
      storage.save('logic_history', Array.from(this.logicHistory.entries()))
    },

    // 🆕 NEU: Versionshistorie wiederherstellen
    restoreLogicHistory() {
      const history = storage.load('logic_history', [])
      this.logicHistory = new Map(history)
    },

    // ✅ NEU: Aktor-Logik zwischen ESPs kopieren
    async copyActuatorLogic(sourceEspId, sourceGpio, targetEspId, targetGpio, options = {}) {
      const sourceLogic = this.getActuatorLogic(sourceEspId, sourceGpio)
      if (!sourceLogic) {
        throw new Error('Quell-Logik nicht gefunden')
      }

      // ✅ NEU: Kopie mit angepassten Sensor-Referenzen
      const copiedLogic = this.adaptLogicForTarget(sourceLogic, sourceEspId, targetEspId, options)

      // ✅ NEU: Auf Ziel-Aktor anwenden
      await this.configureActuatorLogic(targetEspId, targetGpio, copiedLogic)

      return copiedLogic
    },

    // ✅ NEU: Logik für Ziel-ESP anpassen
    adaptLogicForTarget(sourceLogic, sourceEspId, targetEspId, options = {}) {
      const adaptedLogic = { ...sourceLogic }

      // ESP-ID anpassen
      adaptedLogic.actuator = {
        ...adaptedLogic.actuator,
        espId: targetEspId,
      }

      // Sensor-GPIOs anpassen falls erforderlich
      if (options.adaptSensors && adaptedLogic.conditions) {
        adaptedLogic.conditions = adaptedLogic.conditions.map((condition) => ({
          ...condition,
          // Hier könnte eine GPIO-Mapping-Logik implementiert werden
        }))
      }

      return adaptedLogic
    },

    // 🆕 NEU: Export-Funktionen
    exportLogicSchema(espId, gpio) {
      const logic = this.actuatorLogics.get(`${espId}-${gpio}`)
      if (!logic) return null

      const schema = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        espId: espId,
        gpio: gpio,
        actuator: {
          type: logic.actuator?.type,
          name: logic.actuator?.name,
          gpio: logic.actuator?.gpio,
        },
        dependencies:
          logic.conditions?.map((condition) => ({
            type: 'sensor',
            sensorId: `${espId}-${condition.sensorGpio}`,
            sensorGpio: condition.sensorGpio,
            operator: condition.operator,
            threshold: condition.threshold,
            sensorType: condition.sensorType,
          })) || [],
        timers:
          logic.timers?.map((timer) => ({
            start: timer.startTime,
            end: timer.endTime,
            days: timer.days,
            enabled: timer.enabled,
          })) || [],
        events:
          logic.events?.map((event) => ({
            type: event.type,
            trigger: event.trigger,
            action: event.action,
          })) || [],
        configuration: {
          enabled: logic.enabled,
          evaluationInterval: logic.evaluationInterval || 30000,
          failsafeState: logic.failsafeState || false,
          priority: logic.priority || 'LOGIC',
        },
        metadata: {
          name: logic.name,
          description: logic.description,
          createdBy: logic.createdBy || 'user',
          lastModified: logic.lastModified || new Date().toISOString(),
        },
      }

      return schema
    },

    // 🆕 NEU: Import-Funktionen
    async importLogicSchema(schema, targetEspId, targetGpio) {
      try {
        // Schema-Migration
        const migratedSchema = this.migrateSchema(schema)

        // Validierung
        const validation = this.validateLogicConfig(migratedSchema, migratedSchema.actuator?.type)
        if (!validation.valid) {
          throw new Error(`Validierungsfehler: ${validation.reason}`)
        }

        // Konfiguration erstellen
        const logicConfig = {
          name: migratedSchema.metadata?.name || 'Importierte Logik',
          description: migratedSchema.metadata?.description || '',
          enabled: migratedSchema.configuration?.enabled ?? true,
          conditions:
            migratedSchema.dependencies?.map((dep) => ({
              sensorGpio: dep.sensorGpio,
              operator: dep.operator,
              threshold: dep.threshold,
              sensorType: dep.sensorType,
            })) || [],
          timers:
            migratedSchema.timers?.map((timer) => ({
              startTime: timer.start,
              endTime: timer.end,
              days: timer.days,
              enabled: timer.enabled ?? true,
            })) || [],
          events: migratedSchema.events || [],
          evaluationInterval: migratedSchema.configuration?.evaluationInterval || 30000,
          failsafeEnabled: migratedSchema.configuration?.failsafeState !== undefined,
          failsafeState: migratedSchema.configuration?.failsafeState || false,
          priority: migratedSchema.configuration?.priority || 'LOGIC',
        }

        // Logik konfigurieren
        await this.configureActuatorLogic(targetEspId, targetGpio, logicConfig)

        return {
          success: true,
          logic: logicConfig,
          warnings: [],
        }
      } catch (error) {
        console.error('Import failed:', error)
        return {
          success: false,
          error: error.message,
        }
      }
    },

    // 🆕 NEU: Fehlertoleranter Import
    async importLogicSchemaWithFallback(schema, targetEspId, targetGpio) {
      try {
        // 1. Versuche normalen Import
        const result = await this.importLogicSchema(schema, targetEspId, targetGpio)

        if (result.success) {
          return result
        }

        // 2. Fehlertolerante Reparatur
        const repairedLogic = this.repairCorruptedLogic(schema, targetEspId, targetGpio)

        // 3. Validierung der reparierten Logik
        const validation = await this.validateRepairedLogic(repairedLogic)

        if (validation.isRepairable) {
          return {
            success: true,
            logic: repairedLogic,
            warnings: ['Logik wurde automatisch repariert', ...validation.warnings],
            wasRepaired: true,
            originalErrors: result.error,
          }
        }

        // 4. ReadOnly-Modus für nicht reparierbare Logiken
        return {
          success: false,
          error: 'Logik kann nicht repariert werden',
          readOnlyPreview: this.createReadOnlyPreview(schema),
          suggestions: this.generateRepairSuggestions(schema),
        }
      } catch (error) {
        return {
          success: false,
          error: `Import fehlgeschlagen: ${error.message}`,
          readOnlyPreview: this.createReadOnlyPreview(schema),
        }
      }
    },

    // 🆕 NEU: Logik-Reparatur
    repairCorruptedLogic(schema, targetEspId, targetGpio) {
      const repaired = {
        actuator: {
          type: schema.actuator?.type || 'ACTUATOR_UNKNOWN',
          name: schema.actuator?.name || 'Unbekannter Aktor',
          gpio: targetGpio,
          espId: targetEspId,
        },
        conditions: [],
        timers: [],
        events: [],
        enabled: false, // Sicherheitshalber deaktiviert
        evaluationInterval: 30000,
        failsafeState: false,
        priority: 'LOGIC',
        name: schema.metadata?.name || 'Reparierte Logik',
        description: schema.metadata?.description || 'Automatisch reparierte Logik',
        createdBy: 'repair',
        lastModified: new Date().toISOString(),
      }

      // Repariere Bedingungen
      if (schema.dependencies && Array.isArray(schema.dependencies)) {
        repaired.conditions = schema.dependencies
          .filter((dep) => dep.sensorGpio && dep.operator && dep.threshold !== undefined)
          .map((dep) => ({
            sensorGpio: dep.sensorGpio,
            operator: dep.operator,
            threshold: dep.threshold,
            sensorType: dep.sensorType || 'SENSOR_UNKNOWN',
          }))
      }

      // Repariere Timer
      if (schema.timers && Array.isArray(schema.timers)) {
        repaired.timers = schema.timers
          .filter((timer) => timer.start && timer.end && timer.days)
          .map((timer) => ({
            startTime: timer.start,
            endTime: timer.end,
            days: timer.days,
            enabled: timer.enabled !== undefined ? timer.enabled : true,
          }))
      }

      return repaired
    },

    // 🆕 NEU: Validierung reparierter Logik
    async validateRepairedLogic(repairedLogic) {
      const validation = this.validateLogicConfig(repairedLogic, repairedLogic.actuator?.type)

      return {
        isRepairable: validation.valid,
        warnings: validation.valid ? [] : [validation.reason],
      }
    },

    // 🆕 NEU: ReadOnly-Preview erstellen
    createReadOnlyPreview(schema) {
      return {
        name: schema.metadata?.name || 'Unbekannte Logik',
        description: schema.metadata?.description || 'Keine Beschreibung verfügbar',
        actuator: schema.actuator || { type: 'UNKNOWN', name: 'Unbekannt' },
        dependencies: schema.dependencies || [],
        timers: schema.timers || [],
        configuration: schema.configuration || {},
        isReadOnly: true,
      }
    },

    // 🆕 NEU: Reparatur-Vorschläge generieren
    generateRepairSuggestions(schema) {
      const suggestions = []

      if (!schema.actuator?.type) {
        suggestions.push('Aktor-Typ definieren')
      }

      if (!schema.dependencies || schema.dependencies.length === 0) {
        suggestions.push('Mindestens eine Bedingung hinzufügen')
      }

      if (!schema.metadata?.name) {
        suggestions.push('Logik-Name vergeben')
      }

      return suggestions
    },

    // 🆕 NEU: Schema-Migration
    migrateSchema(schema) {
      if (schema.version === '1.0') {
        return schema // passt
      }

      if (schema.version === '0.9') {
        // Beispielhafte Migration von 0.9 zu 1.0
        schema.configuration = {
          ...schema.configuration,
          evaluationInterval: schema.evaluationInterval || 30000,
        }
        schema.version = '1.0'
        return schema
      }

      throw new Error(`Nicht unterstütztes Schema: ${schema.version}`)
    },

    // 🆕 NEU: Bulk-Export für alle Logiken
    exportAllLogicSchemas() {
      const schemas = []

      for (const [key] of this.actuatorLogics.entries()) {
        const [espId, gpio] = key.split('-')
        const schema = this.exportLogicSchema(espId, parseInt(gpio))
        if (schema) {
          schemas.push(schema)
        }
      }

      return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        totalLogics: schemas.length,
        schemas: schemas,
      }
    },

    // 🆕 NEU: Schema als Datei exportieren
    exportLogicSchemaAsFile(espId, gpio) {
      const schema = this.exportLogicSchema(espId, gpio)
      if (!schema) return false

      const blob = new Blob([JSON.stringify(schema, null, 2)], {
        type: 'application/json',
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `logic-${espId}-${gpio}-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)

      return true
    },

    // 🆕 NEU: Bulk-Export als Datei
    exportAllLogicSchemasAsFile() {
      const allSchemas = this.exportAllLogicSchemas()

      const blob = new Blob([JSON.stringify(allSchemas, null, 2)], {
        type: 'application/json',
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `all-logics-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)

      return true
    },

    // 🆕 NEU: Schema aus Datei importieren
    async importLogicSchemaFromFile(file, targetEspId, targetGpio) {
      try {
        const text = await file.text()
        const schema = JSON.parse(text)

        return this.importLogicSchema(schema, targetEspId, targetGpio)
      } catch (error) {
        return {
          success: false,
          error: `Datei-Import fehlgeschlagen: ${error.message}`,
        }
      }
    },

    // 🆕 NEU: Bulk-Import aus Datei
    async importAllLogicSchemasFromFile(file) {
      try {
        const text = await file.text()
        const allSchemas = JSON.parse(text)

        if (!allSchemas.schemas || !Array.isArray(allSchemas.schemas)) {
          throw new Error('Ungültiges Bulk-Schema-Format')
        }

        const results = []

        for (const schema of allSchemas.schemas) {
          const result = await this.importLogicSchema(schema, schema.espId, schema.gpio)
          results.push({
            schema: schema,
            result: result,
          })
        }

        return {
          success: true,
          total: allSchemas.schemas.length,
          successful: results.filter((r) => r.result.success).length,
          failed: results.filter((r) => !r.result.success).length,
          results: results,
        }
      } catch (error) {
        return {
          success: false,
          error: `Bulk-Import fehlgeschlagen: ${error.message}`,
        }
      }
    },

    // ✅ ERWEITERT: Event-Listener für Event-basierte Kommunikation (migriert von MQTT Store)
    initializeEventListeners() {
      // Listener für Aktor-Status (migriert von MQTT Store)
      eventBus.on(MQTT_EVENTS.ACTUATOR_STATUS, (data) => {
        const { espId, topicParts, payload } = data
        this.handleActuatorStatus(espId, topicParts, payload)
      })

      // Listener für Aktor-Befehle
      eventBus.on(MQTT_EVENTS.ACTUATOR_COMMAND, (commandData) => {
        const { espId, gpio, command, actuatorType } = commandData
        this.controlActuatorWithPriority(espId, gpio, actuatorType, command)
      })

      // Listener für Aktor-Logic-Status
      eventBus.on(MQTT_EVENTS.ACTUATOR_LOGIC_STATUS, (logicData) => {
        const { espId, gpio, logicStatus } = logicData
        this.addLogicLog(espId, gpio, 'logic_status_update', logicStatus)
      })

      // Listener für Aktor-Logic-Befehle
      eventBus.on(MQTT_EVENTS.ACTUATOR_LOGIC_COMMAND, (commandData) => {
        const { espId, gpio, command, parameters } = commandData
        this.handleLogicCommand(espId, gpio, command, parameters)
      })

      console.log('✅ ActuatorLogic Event-Listener initialisiert (mit MQTT-Migration)')
    },

    // ✅ NEU: Aktor-Status Handler (migriert von MQTT Store)
    async handleActuatorStatus(espId, topicParts, payload) {
      const gpio = topicParts[5] // actuator/{gpio}/status
      const actuatorKey = `${espId}-${gpio}`

      console.log('[ActuatorLogic] Actuator status update:', { espId, gpio, payload })

      // Aktor-Status in Logic-Engine aktualisieren
      this.logicEngine.updateActuatorState(espId, gpio, payload)

      // ✅ LÖSUNG: Event-basierte Kommunikation mit MQTT Store
      const { useMqttStore } = await import('./mqtt')
      const mqttStore = useMqttStore()
      let device = mqttStore.espDevices.get(espId)
      if (!device) {
        device = mqttStore.createDeviceInfo(espId)
        mqttStore.espDevices.set(espId, device)
      }

      // Aktor-Status aktualisieren
      if (!device.actuators) {
        device.actuators = new Map()
      }

      const actuator = {
        espId,
        gpio: parseInt(gpio),
        type: payload.type,
        name: payload.name,
        status: payload.status,
        state: payload.state,
        timestamp: payload.timestamp,
        lastUpdate: Date.now(),
        // Sicherheitslogik-Felder
        desiredState: payload.desired_state,
        confirmedState: payload.confirmed_state,
        pendingState: undefined, // Wird unten gesetzt
        // Logic-Engine Felder
        source: payload.source || 'unknown',
        reason: payload.reason || null,
      }

      // Alert-Status aktualisieren
      if (payload.alert) {
        actuator.alert = {
          state: payload.alert.state,
          reason: payload.alert.reason,
          timestamp: Date.now(),
        }
      }

      // Manueller Override aktualisieren
      if (payload.manualOverride) {
        actuator.manualOverride = {
          state: payload.manualOverride.state,
          reason: payload.manualOverride.reason,
          timestamp: Date.now(),
        }
      }

      // Pending-State und Timeout verarbeiten
      const pendingState = mqttStore.actuatorPendingStates.get(actuatorKey)
      if (pendingState) {
        actuator.pendingState = pendingState.desiredState

        // Bestätigung erhalten - Cleanup
        if (payload.confirmed_state === pendingState.desiredState) {
          mqttStore.actuatorPendingStates.delete(actuatorKey)
          const timeoutId = mqttStore.actuatorConfirmationTimeouts.get(actuatorKey)
          if (timeoutId) {
            clearTimeout(timeoutId)
            mqttStore.actuatorConfirmationTimeouts.delete(actuatorKey)
          }
          actuator.pendingState = undefined
        }
      }

      device.actuators.set(actuatorKey, actuator)
      mqttStore.lastActuatorUpdate = {
        espId,
        timestamp: Date.now(),
        actuatorCount: device.actuators.size,
      }

      console.log(`[ActuatorLogic] Updated actuator ${actuatorKey} status`)
    },

    // ✅ NEU: Logic-Befehle verarbeiten
    handleLogicCommand(espId, gpio, command, parameters) {
      switch (command) {
        case 'start':
          this.startLogicProcess(espId, gpio)
          break
        case 'stop':
          this.stopLogicProcess(espId, gpio)
          break
        case 'evaluate':
          this.evaluateLogic(espId, gpio)
          break
        case 'configure':
          this.configureActuatorLogic(espId, gpio, parameters)
          break
        default:
          console.warn(`[ActuatorLogic] Unbekannter Logic-Befehl: ${command}`)
      }
    },

    // ✅ NEU: Cross-ESP Logic-Execution-Engine
    async evaluateCrossEspLogic(logicId) {
      const logic = this.crossEspLogicDefinitions.get(logicId)
      if (!logic) {
        throw new Error(`Cross-ESP Logic ${logicId} nicht gefunden`)
      }

      try {
        // 1. Cross-ESP Trigger evaluation mit Subzone-Support
        const triggerResults = await this.evaluateCrossEspTriggers(logic.triggers)

        // 2. Cross-ESP Condition evaluation mit Subzone-Support
        const conditionResults = await this.evaluateCrossEspConditions(logic.conditions)

        // 3. Logic execution decision
        if (this.shouldExecuteLogic(triggerResults, conditionResults)) {
          await this.executeCrossEspActions(logic.actions)
        }

        // 4. Cross-ESP Metadaten aktualisieren
        this.updateCrossEspLogicMetadata(logicId, {
          lastExecution: Date.now(),
          triggerResults,
          conditionResults,
        })

        // Event auslösen
        eventBus.emit(MQTT_EVENTS.CROSS_ESP_LOGIC_EXECUTED, {
          logicId,
          triggerResults,
          conditionResults,
          timestamp: Date.now(),
        })
      } catch (error) {
        console.error(`Cross-ESP Logic evaluation failed for ${logicId}:`, error)
        await this.handleCrossEspLogicError(logicId, error)
      }
    },

    async evaluateCrossEspTriggers(triggers) {
      // ✅ NEU: Timeout-Handling für Cross-ESP Logic
      const timeoutMs = 5000 // 5 Sekunden Timeout

      // Triggers über mehrere ESPs und Subzones evaluieren
      const results = await Promise.allSettled(
        triggers.map(async (trigger, index) => {
          const { espId, subzoneId, gpio } = trigger.sensorReference
          const requestId = `cross_esp_trigger_${espId}_${gpio}_${Date.now()}_${index}`

          try {
            // ✅ NEU: Timeout für einzelne Trigger-Evaluation
            const result = await Promise.race([
              this.evaluateSingleTrigger(trigger),
              new Promise((_, reject) => {
                const timeoutId = setTimeout(() => {
                  reject(new Error('Trigger evaluation timeout'))
                }, timeoutMs)

                // ✅ NEU: Timeout-Timer registrieren
                this.timerManagement.crossEspTimeouts.set(requestId, timeoutId)
              }),
            ])

            // ✅ NEU: Timeout-Timer entfernen bei Erfolg
            this.timerManagement.crossEspTimeouts.delete(requestId)

            return result
          } catch (error) {
            // ✅ NEU: Timeout-Timer entfernen bei Fehler
            this.timerManagement.crossEspTimeouts.delete(requestId)

            return {
              triggerId: `${espId}-${gpio}`,
              active: false,
              reason:
                error.message === 'Trigger evaluation timeout' ? 'timeout' : 'evaluation_error',
              error: error.message,
              subzoneId,
            }
          }
        }),
      )

      return results.map((result) =>
        result.status === 'fulfilled'
          ? result.value
          : {
              triggerId: 'unknown',
              active: false,
              reason: 'promise_rejected',
              error: result.reason?.message || 'Unknown error',
            },
      )
    },

    // ✅ NEU: Einzelne Trigger-Evaluation (für Timeout-Handling)
    async evaluateSingleTrigger(trigger) {
      const { espId, subzoneId, gpio } = trigger.sensorReference

      // Event-basierte Sensor-Daten-Abfrage
      const sensorData = await this.getCrossEspSensorData(espId, gpio, subzoneId)

      if (!sensorData) {
        return {
          triggerId: `${espId}-${gpio}`,
          active: false,
          reason: 'sensor_unavailable',
          error: 'Sensor nicht erreichbar',
          subzoneId,
        }
      }

      // Trigger-Bedingung auswerten
      const isActive = this.evaluateTriggerCondition(trigger, sensorData)

      return {
        triggerId: `${espId}-${gpio}`,
        active: isActive,
        reason: isActive ? 'condition_met' : 'condition_not_met',
        sensorData,
        subzoneId,
      }
    },

    async evaluateCrossEspConditions(conditions) {
      // Bedingungen über mehrere ESPs und Subzones evaluieren
      const results = await Promise.all(
        conditions.map(async (condition) => {
          const { espId, subzoneId, gpio } = condition.sensorReference

          try {
            const sensorData = await this.getCrossEspSensorData(espId, gpio, subzoneId)

            if (!sensorData) {
              return {
                conditionId: `${espId}-${gpio}`,
                met: false,
                reason: 'sensor_unavailable',
                error: 'Sensor nicht erreichbar',
                subzoneId,
              }
            }

            const isMet = this.evaluateCondition(condition, sensorData)

            return {
              conditionId: `${espId}-${gpio}`,
              met: isMet,
              reason: isMet ? 'condition_met' : 'condition_not_met',
              sensorData,
              subzoneId,
            }
          } catch (error) {
            return {
              conditionId: `${espId}-${gpio}`,
              met: false,
              reason: 'evaluation_error',
              error: error.message,
              subzoneId,
            }
          }
        }),
      )

      return results
    },

    async executeCrossEspActions(actions) {
      // Aktionen auf verschiedenen ESPs und Subzones ausführen
      const results = await Promise.all(
        actions.map(async (action) => {
          const { espId, subzoneId, gpio } = action.actuatorReference

          try {
            // MQTT-Topic-Routing über Kaiser-Grenzen
            const kaiserId = this.getKaiserForEsp(espId)
            const topic = `kaiser/${kaiserId}/esp/${espId}/actuator/${gpio}/command`

            const command = {
              command: action.command,
              duration: action.duration,
              metadata: {
                ...action.metadata,
                subzoneId,
                crossEspLogic: true,
                timestamp: Date.now(),
              },
            }

            await this.mqttStore.publish(topic, command)

            return {
              actionId: `${espId}-${gpio}`,
              success: true,
              subzoneId,
              command,
            }
          } catch (error) {
            return {
              actionId: `${espId}-${gpio}`,
              success: false,
              error: error.message,
              subzoneId,
            }
          }
        }),
      )

      return results
    },

    // ✅ NEU: Cross-Subzone Logic-Management
    getCrossEspLogicsBySubzone(subzoneId) {
      // Alle Logiken die eine bestimmte Subzone betreffen
      return Array.from(this.crossEspLogicDefinitions.values()).filter((logic) =>
        logic.crossEspMetadata.involvedSubzones.includes(subzoneId),
      )
    },

    getCrossEspLogicsByDevice(espId, gpio) {
      // Alle Logiken die ein bestimmtes Gerät betreffen
      return Array.from(this.crossEspLogicDefinitions.values()).filter((logic) => {
        const allReferences = [
          ...logic.triggers.map((t) => t.sensorReference),
          ...logic.conditions.map((c) => c.sensorReference),
          ...logic.actions.map((a) => a.actuatorReference),
        ]

        return allReferences.some((ref) => ref.espId === espId && ref.gpio === gpio)
      })
    },

    createCrossEspLogic(logicConfig) {
      // Neue Cross-ESP Logic erstellen
      const { id, name, description, triggers, conditions, actions, crossEspMetadata } = logicConfig

      // Cross-ESP-Metadaten validieren
      this.validateCrossEspLogicMetadata(crossEspMetadata)

      const logic = {
        id,
        name,
        description,
        triggers: triggers.map((trigger) => ({
          ...trigger,
          sensorReference: {
            espId: trigger.sensorReference.espId,
            subzoneId: trigger.sensorReference.subzoneId,
            gpio: trigger.sensorReference.gpio,
            deviceType: trigger.sensorReference.deviceType,
          },
        })),
        conditions: conditions.map((condition) => ({
          ...condition,
          sensorReference: {
            espId: condition.sensorReference.espId,
            subzoneId: condition.sensorReference.subzoneId,
            gpio: condition.sensorReference.gpio,
            deviceType: condition.sensorReference.deviceType,
          },
        })),
        actions: actions.map((action) => ({
          ...action,
          actuatorReference: {
            espId: action.actuatorReference.espId,
            subzoneId: action.actuatorReference.subzoneId,
            gpio: action.actuatorReference.gpio,
            deviceType: action.actuatorReference.deviceType,
          },
        })),
        crossEspMetadata: {
          ...crossEspMetadata,
          createdAt: Date.now(),
          lastModified: Date.now(),
        },
      }

      // Logic speichern
      this.crossEspLogicDefinitions.set(id, logic)

      // Metadaten aktualisieren
      this.updateCrossEspLogicMetadata(id, crossEspMetadata)

      // Event auslösen
      eventBus.emit(MQTT_EVENTS.CROSS_ESP_LOGIC_CREATED, { logicId: id, logic })

      return logic
    },

    // ✅ NEU: Hilfsmethoden für Cross-ESP Logic
    validateCrossEspLogicMetadata(crossEspMetadata) {
      const { involvedKaisers, involvedZones, involvedEsps, involvedSubzones } = crossEspMetadata

      if (!involvedKaisers || involvedKaisers.length === 0) {
        throw new Error('Cross-ESP Logic muss mindestens einen Kaiser involvieren')
      }

      if (!involvedZones || involvedZones.length === 0) {
        throw new Error('Cross-ESP Logic muss mindestens eine Zone involvieren')
      }

      if (!involvedEsps || involvedEsps.length === 0) {
        throw new Error('Cross-ESP Logic muss mindestens einen ESP involvieren')
      }

      if (!involvedSubzones || involvedSubzones.length === 0) {
        throw new Error('Cross-ESP Logic muss mindestens eine Subzone involvieren')
      }
    },

    updateCrossEspLogicMetadata(logicId, metadata) {
      // Metadaten aktualisieren
      this.crossEspLogicMetadata.totalCrossEspLogics = this.crossEspLogicDefinitions.size

      // By Complexity aktualisieren
      const complexity = metadata.crossEspComplexity || 'low'
      this.crossEspLogicMetadata.byComplexity[complexity]++

      // By Zone aktualisieren
      metadata.involvedZones?.forEach((zone) => {
        if (!this.crossEspLogicMetadata.byZone.has(zone)) {
          this.crossEspLogicMetadata.byZone.set(zone, [])
        }
        this.crossEspLogicMetadata.byZone.get(zone).push(logicId)
      })

      // By Subzone aktualisieren
      metadata.involvedSubzones?.forEach((subzoneId) => {
        if (!this.crossEspLogicMetadata.bySubzone.has(subzoneId)) {
          this.crossEspLogicMetadata.bySubzone.set(subzoneId, [])
        }
        this.crossEspLogicMetadata.bySubzone.get(subzoneId).push(logicId)
      })
    },

    getCrossEspSensorData(espId, gpio) {
      // Cross-ESP Sensor-Daten abrufen mit Subzone-Support
      return this.getCrossKaiserSensorData(this.getKaiserForEsp(espId), espId, gpio)
    },

    getKaiserForEsp(espId) {
      const centralConfig = useCentralConfigStore()
      return centralConfig.getKaiserForEsp(espId)
    },

    evaluateTriggerCondition(trigger, sensorData) {
      const value = Number(sensorData.value)
      const threshold = Number(trigger.value)

      switch (trigger.condition) {
        case 'greater_than':
          return value > threshold
        case 'less_than':
          return value < threshold
        case 'greater_equal':
          return value >= threshold
        case 'less_equal':
          return value <= threshold
        case 'equal':
          return value === threshold
        case 'not_equal':
          return value !== threshold
        default:
          return false
      }
    },

    shouldExecuteLogic(triggerResults, conditionResults) {
      // Alle Triggers müssen aktiv sein
      const allTriggersActive = triggerResults.every((result) => result.active)

      // Alle Bedingungen müssen erfüllt sein
      const allConditionsMet = conditionResults.every((result) => result.met)

      return allTriggersActive && allConditionsMet
    },

    async handleCrossEspLogicError(logicId, error) {
      console.error(`Cross-ESP Logic error for ${logicId}:`, error)

      // Failsafe aktivieren wenn konfiguriert
      const logic = this.crossEspLogicDefinitions.get(logicId)
      if (logic?.failsafeEnabled) {
        await this.activateCrossEspFailsafe(logicId, logic.failsafeState)
      }

      // Event auslösen
      eventBus.emit(MQTT_EVENTS.CROSS_ESP_LOGIC_FAILED, {
        logicId,
        error: error.message,
        timestamp: Date.now(),
      })
    },

    async activateCrossEspFailsafe(logicId, failsafeState) {
      const logic = this.crossEspLogicDefinitions.get(logicId)
      if (!logic) return

      // Failsafe-Aktionen auf allen betroffenen Aktoren ausführen
      await Promise.all(
        logic.actions.map(async (action) => {
          const { espId, gpio } = action.actuatorReference
          await this.activateFailsafe(espId, gpio, failsafeState)
        }),
      )
    },

    getCrossEspLogics() {
      return Array.from(this.crossEspLogicDefinitions.values())
    },

    // ✅ NEU: Optimierte Batch-Evaluation mit Race-Condition-Prevention
    async evaluateAllLogics() {
      // 🔒 Race-Condition-Prevention: Lock-Mechanismus
      if (this.evaluationOptimization.isEvaluating) {
        this.evaluationOptimization.evaluationStats.raceConditionPrevented++
        console.warn('⚠️ Evaluation bereits aktiv, überspringe (Race-Condition verhindert)')
        return
      }

      // 🔒 Lock setzen
      this.evaluationOptimization.isEvaluating = true
      this.evaluationOptimization.evaluationStats.concurrentEvaluations++

      const startTime = performance.now()

      try {
        // Alle aktiven Logics sammeln
        const activeLogics = Array.from(this.activeProcesses.entries())

        if (activeLogics.length === 0) {
          console.log('📊 Keine aktiven Logics für Evaluation')
          return
        }

        // Nach Priorität sortieren
        const sortedLogics = this.sortLogicsByPriority(activeLogics)

        // In Batches aufteilen
        const batches = this.createBatches(sortedLogics, this.evaluationOptimization.batchSize)

        console.log(
          `🚀 Batch-Evaluation gestartet: ${activeLogics.length} Logics in ${batches.length} Batches`,
        )

        for (const [batchIndex, batch] of batches.entries()) {
          const batchStartTime = performance.now()

          try {
            // Batch parallel verarbeiten
            await Promise.all(
              batch.map(([, process]) => this.evaluateLogicSafely(process.espId, process.gpio)),
            )

            // Batch-Statistiken aktualisieren
            const batchTime = performance.now() - batchStartTime
            this.evaluationOptimization.evaluationStats.batchCount++
            this.evaluationOptimization.evaluationStats.lastBatchTime = batchTime

            console.log(
              `✅ Batch ${batchIndex + 1}/${batches.length} abgeschlossen: ${batch.length} Logics in ${batchTime.toFixed(2)}ms`,
            )

            // Kurze Pause zwischen Batches für System-Stabilität
            if (batchIndex < batches.length - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, this.evaluationOptimization.batchDelay),
              )
            }
          } catch (error) {
            console.error(`❌ Batch ${batchIndex + 1} fehlgeschlagen:`, error)

            // Einzelne Logics retry
            for (const [logicKey, process] of batch) {
              try {
                await this.evaluateLogicSafely(process.espId, process.gpio)
              } catch (retryError) {
                console.error(`❌ Logic-Retry fehlgeschlagen: ${logicKey}`, retryError)
              }
            }
          }
        }

        // Performance-Statistiken aktualisieren
        const totalTime = performance.now() - startTime
        this.updateEvaluationStats(totalTime, activeLogics.length)

        console.log(
          `✅ Batch-Evaluation abgeschlossen: ${totalTime.toFixed(2)}ms für ${activeLogics.length} Logics`,
        )
      } finally {
        // 🔒 Lock freigeben
        this.evaluationOptimization.isEvaluating = false
        this.evaluationOptimization.evaluationStats.concurrentEvaluations--
      }
    },

    // ✅ NEU: Sichere Logic-Evaluation mit Timeout
    async evaluateLogicSafely(espId, gpio) {
      const logicKey = `${espId}-${gpio}`
      const startTime = performance.now()

      try {
        // Timeout für einzelne Logic-Evaluation
        await Promise.race([
          this.evaluateLogic(espId, gpio),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Logic evaluation timeout')), 2000),
          ),
        ])

        // Performance-Tracking
        const evaluationTime = performance.now() - startTime
        this.evaluationOptimization.lastEvaluationTime.set(logicKey, evaluationTime)

        // Langsame Logics identifizieren
        if (evaluationTime > this.evaluationOptimization.performanceThresholds.slowLogicThreshold) {
          this.evaluationOptimization.evaluationStats.slowLogics.add(logicKey)
          console.warn(`🐌 Langsame Logic erkannt: ${logicKey} (${evaluationTime.toFixed(2)}ms)`)
        }
      } catch (error) {
        console.error(`❌ Logic-Evaluation fehlgeschlagen: ${logicKey}`, error)
        this.handleLogicEvaluationError(espId, gpio, error)
      }
    },

    // ✅ NEU: Prioritäts-basierte Sortierung
    sortLogicsByPriority(logics) {
      return logics.sort(([keyA, processA], [keyB, processB]) => {
        // Emergency Logics zuerst
        const priorityA = processA.priority || 0
        const priorityB = processB.priority || 0

        if (priorityA !== priorityB) {
          return priorityB - priorityA // Höchste Priorität zuerst
        }

        // Bei gleicher Priorität: Logics mit längerer Inaktivität zuerst
        const lastEvalA = this.evaluationOptimization.lastEvaluationTime.get(keyA) || 0
        const lastEvalB = this.evaluationOptimization.lastEvaluationTime.get(keyB) || 0

        return lastEvalA - lastEvalB // Älteste Evaluation zuerst
      })
    },

    // ✅ NEU: Batch-Erstellung
    createBatches(items, batchSize) {
      const batches = []
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize))
      }
      return batches
    },

    // ✅ NEU: Performance-Statistiken aktualisieren
    updateEvaluationStats(totalTime, logicCount) {
      const stats = this.evaluationOptimization.evaluationStats
      stats.totalEvaluations += logicCount
      stats.averageTime = (stats.averageTime + totalTime) / 2

      // Performance-Warnungen
      if (totalTime > this.evaluationOptimization.performanceThresholds.batchTimeout) {
        console.warn(
          `⚠️ Langsame Batch-Evaluation: ${totalTime.toFixed(2)}ms für ${logicCount} Logics`,
        )
      }

      if (stats.slowLogics.size > 10) {
        console.warn(`⚠️ Viele langsame Logics: ${stats.slowLogics.size} Logics über Schwellwert`)
      }
    },

    // ✅ NEU: Logic-Evaluation-Fehler behandeln
    handleLogicEvaluationError(espId, gpio, error) {
      const logic = this.getActuatorLogic(espId, gpio)

      if (logic && logic.failsafeEnabled) {
        console.log(`🛡️ Failsafe aktiviert für ${espId}-${gpio} nach Evaluation-Fehler`)
        this.activateFailsafe(espId, gpio, logic.failsafeState)
      }

      this.addLogicLog(espId, gpio, 'EVALUATION_ERROR', {
        message: 'Logik-Auswertung fehlgeschlagen',
        error: error.message,
        timestamp: Date.now(),
      })
    },

    // ✅ OPTIMIERT: Performance-Monitoring mit CPU-Optimierung
    startPerformanceMonitoring() {
      // ✅ KRITISCH: Alle 5 Sekunden alle Logics evaluieren - UNBERÜHRT (EMERGENCY-RESPONSE)
      setInterval(() => {
        this.evaluateAllLogics()
      }, 5000) // UNVERÄNDERT - Safety-Critical!

      // ✅ OPTIMIERT: Performance-Statistiken alle 120 Sekunden loggen (statt 60s) - NON-CRITICAL
      setInterval(() => {
        this.logPerformanceStats()
      }, 120000) // 120 Sekunden statt 60
    },

    // ✅ NEU: Performance-Statistiken loggen
    logPerformanceStats() {
      const stats = this.evaluationOptimization.evaluationStats
      const slowCount = stats.slowLogics.size

      console.log(`📊 Logic-Performance-Report:`)
      console.log(`  - Gesamt-Evaluationen: ${stats.totalEvaluations}`)
      console.log(`  - Durchschnittszeit: ${stats.averageTime.toFixed(2)}ms`)
      console.log(`  - Batch-Anzahl: ${stats.batchCount}`)
      console.log(`  - Langsame Logics: ${slowCount}`)

      if (slowCount > 0) {
        console.log(`  - Langsame Logics: ${Array.from(stats.slowLogics).join(', ')}`)
      }
    },

    // ✅ NEU: Store-Initialisierung mit Event-Listenern
    setup() {
      // ✅ BESTEHEND: Konfiguration wiederherstellen
      this.restoreLogicConfig()
      this.restoreLogicHistory()

      // ✅ NEU: Timer-Management initialisieren
      this.initializeTimerManagement()

      // ✅ NEU: Window-Event-Listener für Cleanup registrieren
      this.registerCleanupListeners()

      // ✅ BESTEHEND: Event-Listener initialisieren
      this.initializeEventListeners()

      // ✅ NEU: Performance-Monitoring starten
      this.startPerformanceMonitoring()

      // ✅ NEU: Store im Event-System registrieren
      storeHandler.registerStore('actuatorLogic', this)

      // ❌ ENTFERNT: Zirkuläre Event-Emission
      // eventBus.emit(STORE_EVENTS.STORE_READY, {
      //   storeName: 'actuatorLogic',
      //   timestamp: Date.now(),
      // })

      console.log('✅ ActuatorLogic Store initialisiert mit Performance-Optimierung')
    },

    // ✅ NEU: Timer-Management initialisieren
    initializeTimerManagement() {
      // Timer-Statistiken zurücksetzen
      this.timerManagement.cleanupStats = {
        memoryLeaksCleaned: 0,
        lastCleanup: null,
        totalTimers: 0,
      }

      console.log('✅ Timer-Management initialisiert')
    },

    // ✅ NEU: Window-Event-Listener für Cleanup registrieren
    registerCleanupListeners() {
      // Beforeunload Event für Store-Destruction
      const handleBeforeUnload = () => {
        console.log('🔄 Window beforeunload - Store-Destruction erkannt')
        this.isStoreDestroyed = true
        this.cleanup()
      }

      // Page Visibility Change für Memory-Optimierung
      const handleVisibilityChange = () => {
        if (document.hidden) {
          console.log('📱 Page hidden - Memory-Leak-Cleanup ausführen')
          this.cleanupMemoryLeakTimers()
        }
      }

      // Memory Pressure Event (falls verfügbar)
      const handleMemoryPressure = () => {
        console.log('💾 Memory pressure - Aggressives Cleanup')
        this.cleanupMemoryLeakTimers()
        this.enforceStoreMemoryLimits() // ✅ NEU: Memory-Limits bei Pressure
      }

      // Event-Listener registrieren
      window.addEventListener('beforeunload', handleBeforeUnload)
      document.addEventListener('visibilitychange', handleVisibilityChange)

      // Memory Pressure Event (experimentell)
      if ('memory' in performance) {
        window.addEventListener('memorypressure', handleMemoryPressure)
      }

      // Cleanup-Funktionen für späteres Entfernen speichern
      this.cleanupListeners = {
        handleBeforeUnload,
        handleVisibilityChange,
        handleMemoryPressure,
      }

      console.log('✅ Cleanup-Event-Listener registriert')
    },

    // ✅ NEU: Event-Listener entfernen (bei Store-Destruction)
    removeCleanupListeners() {
      if (this.cleanupListeners) {
        window.removeEventListener('beforeunload', this.cleanupListeners.handleBeforeUnload)
        document.removeEventListener(
          'visibilitychange',
          this.cleanupListeners.handleVisibilityChange,
        )

        if ('memory' in performance) {
          window.removeEventListener('memorypressure', this.cleanupListeners.handleMemoryPressure)
        }

        this.cleanupListeners = null
        console.log('✅ Cleanup-Event-Listener entfernt')
      }
    },
  },
})
