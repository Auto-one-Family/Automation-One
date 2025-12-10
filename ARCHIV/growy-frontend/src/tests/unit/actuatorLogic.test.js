import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useActuatorLogicStore } from '@/stores/actuatorLogic'

describe('ActuatorLogicStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useActuatorLogicStore()
  })

  describe('Logic Engine', () => {
    it('should initialize with correct priority levels', () => {
      const engine = store.getLogicEngine
      expect(engine.priorityLevels.EMERGENCY).toBe(100)
      expect(engine.priorityLevels.MANUAL).toBe(90)
      expect(engine.priorityLevels.ALERT).toBe(80)
      expect(engine.priorityLevels.LOGIC).toBe(70)
      expect(engine.priorityLevels.TIMER).toBe(60)
      expect(engine.priorityLevels.SCHEDULE).toBe(50)
      expect(engine.priorityLevels.DEFAULT).toBe(0)
    })

    it('should resolve priority correctly', () => {
      const engine = store.getLogicEngine
      const states = [
        { state: true, source: 'LOGIC', priority: 70, reason: 'Logic active' },
        { state: false, source: 'MANUAL', priority: 90, reason: 'Manual override' },
      ]

      const result = engine.resolvePriority(states, 'ACTUATOR_RELAY')
      expect(result.source).toBe('MANUAL')
      expect(result.state).toBe(false)
      expect(result.priority).toBe(90)
    })

    it('should handle type-specific conflicts for pumps', () => {
      const engine = store.getLogicEngine
      const states = [
        { state: true, source: 'LOGIC', priority: 70 },
        { state: false, source: 'TIMER', priority: 70 },
      ]

      const result = engine.resolveTypeSpecificConflict(states, 'ACTUATOR_PUMP')
      expect(result.state).toBe(false) // Safety state preferred
    })

    it('should handle type-specific conflicts for LEDs', () => {
      const engine = store.getLogicEngine
      const states = [
        { state: 0.3, source: 'LOGIC', priority: 70 },
        { state: 0.8, source: 'TIMER', priority: 70 },
      ]

      const result = engine.resolveTypeSpecificConflict(states, 'ACTUATOR_LED')
      expect(result.state).toBe(0.8) // Higher value preferred
    })
  })

  describe('Manual Override', () => {
    it('should set manual override correctly', async () => {
      const espId = 'test-esp'
      const gpio = 5
      const state = true
      const reason = 'test-override'

      await store.setManualOverride(espId, gpio, state, reason)

      const activeState = store.getLogicEngine.getActiveState(espId, gpio)
      expect(activeState.state).toBe(state)
      expect(activeState.source).toBe('MANUAL')
      expect(activeState.reason).toBe(reason)
    })

    it('should clear manual override correctly', async () => {
      const espId = 'test-esp'
      const gpio = 5

      // Set override first
      await store.setManualOverride(espId, gpio, true, 'test')

      // Clear override
      await store.clearManualOverride(espId, gpio)

      const activeState = store.getLogicEngine.getActiveState(espId, gpio)
      expect(activeState).toBeNull()
    })
  })

  describe('Actuator Type Validation', () => {
    it('should validate relay actuator correctly', () => {
      const validation = store.getActuatorTypeValidation('ACTUATOR_RELAY')
      expect(validation.allowedInputs).toContain('binary')
      expect(validation.allowedInputs).toContain('timer')
      expect(validation.allowedInputs).toContain('sensor')
      expect(validation.maxPoints).toBe(1)
    })

    it('should validate LED actuator correctly', () => {
      const validation = store.getActuatorTypeValidation('ACTUATOR_LED')
      expect(validation.allowedInputs).toContain('pwm')
      expect(validation.allowedInputs).toContain('gradient')
      expect(validation.maxPoints).toBe(10)
    })

    it('should validate pump actuator correctly', () => {
      const validation = store.getActuatorTypeValidation('ACTUATOR_PUMP')
      expect(validation.allowedInputs).toContain('binary')
      expect(validation.allowedInputs).toContain('timer')
      expect(validation.maxPoints).toBe(1)
    })
  })

  describe('Logic Configuration Validation', () => {
    it('should validate basic logic config', () => {
      const config = {
        conditions: [{ sensorGpio: 5, operator: '>', threshold: 25 }],
      }

      expect(() => store.validateLogicConfig(config, 'ACTUATOR_RELAY')).not.toThrow()
    })

    it('should reject invalid sensor conditions', () => {
      const config = {
        conditions: [{ sensorGpio: 5, operator: '>', threshold: 25 }],
      }

      // LED doesn't allow sensor conditions
      expect(() => store.validateLogicConfig(config, 'ACTUATOR_LED')).toThrow(
        'Sensor-Bedingungen nicht erlaubt',
      )
    })

    it('should reject too many timer points', () => {
      const config = {
        timers: [
          { startTime: '08:00', endTime: '12:00' },
          { startTime: '14:00', endTime: '18:00' },
        ],
      }

      // Pump only allows 1 timer point
      expect(() => store.validateLogicConfig(config, 'ACTUATOR_PUMP')).toThrow(
        'Maximal 1 Timer-Punkte erlaubt',
      )
    })

    it('should require at least one condition', () => {
      const config = {}

      expect(() => store.validateLogicConfig(config, 'ACTUATOR_RELAY')).toThrow(
        'Mindestens eine Bedingung',
      )
    })
  })

  describe('Priority Control', () => {
    it('should control actuator with priority management', async () => {
      const espId = 'test-esp'
      const gpio = 5
      const actuatorType = 'ACTUATOR_RELAY'
      const value = true

      // Mock MQTT store
      vi.mock('@/stores/mqtt', () => ({
        useMqttStore: () => ({
          isConnected: true,
          espDevices: new Map(),
        }),
      }))

      // Mock system commands
      vi.mock('@/stores/systemCommands', () => ({
        useSystemCommandsStore: () => ({
          controlActuator: vi.fn().mockResolvedValue(true),
        }),
      }))

      const result = await store.controlActuatorWithPriority(espId, gpio, actuatorType, value)

      expect(result).toBeDefined()
      expect(result.source).toBe('DEFAULT') // No active states
      expect(result.state).toBe(false)
    })
  })

  describe('Statistics', () => {
    it('should provide correct statistics', () => {
      const stats = store.getLogicStats

      expect(stats).toHaveProperty('totalLogics')
      expect(stats).toHaveProperty('activeProcesses')
      expect(stats).toHaveProperty('totalTimers')
      expect(stats).toHaveProperty('totalLogs')
      expect(stats).toHaveProperty('activeStates')

      expect(typeof stats.totalLogics).toBe('number')
      expect(typeof stats.activeStates).toBe('number')
    })
  })
})
