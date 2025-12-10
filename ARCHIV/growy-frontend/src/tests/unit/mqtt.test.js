import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMqttStore } from '@/stores/mqtt'

// Mock window.$snackbar
Object.defineProperty(window, '$snackbar', {
  value: {
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
  },
  writable: true,
})

describe('MQTT Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('handleSafeModeMessage', () => {
    it('should process safe mode payload with enter_reason', () => {
      const mqttStore = useMqttStore()

      // Mock device
      const espId = 'test_esp_001'
      mqttStore.espDevices.set(espId, {
        espId,
        safeMode: false,
        lastUpdate: null,
      })

      // Test payload
      const payload = {
        safe_mode: true,
        safe_pins: [2, 4, 5],
        total_available_pins: 10,
        pins_in_safe_mode: 3,
        enter_reason: 'GPIO-Konflikt auf Pin 0',
        enter_timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
      }

      // Execute
      mqttStore.handleSafeModeMessage(espId, payload)

      // Assert
      const device = mqttStore.espDevices.get(espId)
      expect(device.safeMode).toBe(true)
      expect(device.safeModeEnterReason).toBe('GPIO-Konflikt auf Pin 0')
      expect(device.safeModeEnterTimestamp).toBe(payload.enter_timestamp)
      expect(device.safeModePins).toEqual([2, 4, 5])
      expect(device.safeModeTotalPins).toBe(10)
      expect(device.safeModeActivePins).toBe(3)
    })

    it('should handle missing enter_reason gracefully', () => {
      const mqttStore = useMqttStore()

      const espId = 'test_esp_002'
      mqttStore.espDevices.set(espId, {
        espId,
        safeMode: false,
        lastUpdate: null,
      })

      const payload = {
        safe_mode: true,
        safe_pins: [2, 4],
        total_available_pins: 10,
        pins_in_safe_mode: 2,
        // No enter_reason
      }

      mqttStore.handleSafeModeMessage(espId, payload)

      const device = mqttStore.espDevices.get(espId)
      expect(device.safeMode).toBe(true)
      expect(device.safeModeEnterReason).toBeNull()
      expect(device.safeModeEnterTimestamp).toBeDefined()
      expect(typeof device.safeModeEnterTimestamp).toBe('number')
    })

    it('should handle safe mode deactivation', () => {
      const mqttStore = useMqttStore()

      const espId = 'test_esp_003'
      mqttStore.espDevices.set(espId, {
        espId,
        safeMode: true,
        safeModeEnterReason: 'Previous reason',
        safeModeEnterTimestamp: Date.now() - 1000,
        lastUpdate: null,
      })

      const payload = {
        safe_mode: false,
        safe_pins: [],
        total_available_pins: 10,
        pins_in_safe_mode: 0,
      }

      mqttStore.handleSafeModeMessage(espId, payload)

      const device = mqttStore.espDevices.get(espId)
      expect(device.safeMode).toBe(false)
      expect(device.safeModeEnterReason).toBeNull()
      expect(device.safeModeActivePins).toBe(0)
    })

    it('should handle non-existent device gracefully', () => {
      const mqttStore = useMqttStore()

      const espId = 'non_existent_esp'
      const payload = {
        safe_mode: true,
        enter_reason: 'Test reason',
      }

      // Should not throw error
      expect(() => {
        mqttStore.handleSafeModeMessage(espId, payload)
      }).not.toThrow()

      // Device should not be created
      expect(mqttStore.espDevices.has(espId)).toBe(false)
    })
  })

  describe('SafeMode State Management', () => {
    it('should maintain safe mode state across multiple updates', () => {
      const mqttStore = useMqttStore()

      const espId = 'test_esp_004'
      mqttStore.espDevices.set(espId, {
        espId,
        safeMode: false,
        lastUpdate: null,
      })

      // First update - activate safe mode
      mqttStore.handleSafeModeMessage(espId, {
        safe_mode: true,
        enter_reason: 'First reason',
        enter_timestamp: 1000, // Unix timestamp in seconds
      })

      let device = mqttStore.espDevices.get(espId)
      expect(device.safeMode).toBe(true)
      expect(device.safeModeEnterReason).toBe('First reason')

      // Second update - change reason
      mqttStore.handleSafeModeMessage(espId, {
        safe_mode: true,
        enter_reason: 'Updated reason',
        enter_timestamp: 2000, // Unix timestamp in seconds
      })

      device = mqttStore.espDevices.get(espId)
      expect(device.safeMode).toBe(true)
      expect(device.safeModeEnterReason).toBe('Updated reason')
      expect(device.safeModeEnterTimestamp).toBe(2000)
    })
  })
})
