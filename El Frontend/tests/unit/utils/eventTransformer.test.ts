/**
 * Event Transformer Utility Unit Tests
 *
 * Tests for transforming raw events into human-readable German messages.
 */

import { describe, it, expect } from 'vitest'
import {
  getEventCategory,
  formatUptime,
  formatMemory,
  formatSensorValue,
  transformEventMessage,
  type EventCategory
} from '@/utils/eventTransformer'
import type { UnifiedEvent } from '@/types/websocket-events'

// =============================================================================
// Helper: Create mock events
// =============================================================================

function makeEvent(overrides: Partial<UnifiedEvent> = {}): UnifiedEvent {
  return {
    id: 'test-1',
    timestamp: '2026-01-01T00:00:00Z',
    event_type: 'system_event',
    severity: 'info',
    source: 'server',
    message: 'Test',
    data: {},
    ...overrides,
  }
}

// =============================================================================
// getEventCategory
// =============================================================================

describe('getEventCategory', () => {
  it('returns esp-status for esp_health', () => {
    const event = makeEvent({ event_type: 'esp_health' })
    expect(getEventCategory(event)).toBe('esp-status')
  })

  it('returns sensors for sensor_data', () => {
    const event = makeEvent({ event_type: 'sensor_data' })
    expect(getEventCategory(event)).toBe('sensors')
  })

  it('returns actuators for actuator_status', () => {
    const event = makeEvent({ event_type: 'actuator_status' })
    expect(getEventCategory(event)).toBe('actuators')
  })

  it('returns system for config_published', () => {
    const event = makeEvent({ event_type: 'config_published' })
    expect(getEventCategory(event)).toBe('system')
  })

  it('returns esp-status for device_discovered', () => {
    const event = makeEvent({ event_type: 'device_discovered' })
    expect(getEventCategory(event)).toBe('esp-status')
  })

  it('returns esp-status for device_online', () => {
    const event = makeEvent({ event_type: 'device_online' })
    expect(getEventCategory(event)).toBe('esp-status')
  })

  it('returns esp-status for device_offline', () => {
    const event = makeEvent({ event_type: 'device_offline' })
    expect(getEventCategory(event)).toBe('esp-status')
  })

  it('returns esp-status for lwt_received', () => {
    const event = makeEvent({ event_type: 'lwt_received' })
    expect(getEventCategory(event)).toBe('esp-status')
  })

  it('returns actuators for actuator_alert', () => {
    const event = makeEvent({ event_type: 'actuator_alert' })
    expect(getEventCategory(event)).toBe('actuators')
  })

  it('returns system for unknown event type', () => {
    const event = makeEvent({ event_type: 'unknown' })
    expect(getEventCategory(event)).toBe('system')
  })
})

// =============================================================================
// formatUptime
// =============================================================================

describe('formatUptime', () => {
  it('formats seconds only', () => {
    expect(formatUptime(30)).toBe('30 Sek')
  })

  it('formats 1 minute', () => {
    expect(formatUptime(90)).toBe('1 Min')
  })

  it('formats hours and minutes', () => {
    expect(formatUptime(3700)).toBe('1 Std 1 Min')
  })

  it('formats 1 day', () => {
    expect(formatUptime(86400)).toBe('1 Tage')
  })

  it('formats days and hours', () => {
    expect(formatUptime(90000)).toBe('1 Tage 1 Std')
  })

  it('formats hours without minutes when minutes are zero', () => {
    expect(formatUptime(3600)).toBe('1 Std')
  })

  it('formats days without hours when hours are zero', () => {
    expect(formatUptime(86400)).toBe('1 Tage')
  })

  it('formats multiple days', () => {
    expect(formatUptime(172800)).toBe('2 Tage')
  })

  it('formats mixed values', () => {
    expect(formatUptime(93661)).toBe('1 Tage 2 Std')
  })
})

// =============================================================================
// formatMemory
// =============================================================================

describe('formatMemory', () => {
  it('formats bytes to KB', () => {
    expect(formatMemory(128000)).toBe('125 KB')
  })

  it('rounds to nearest KB', () => {
    expect(formatMemory(1024)).toBe('1 KB')
  })

  it('formats zero bytes', () => {
    expect(formatMemory(0)).toBe('0 KB')
  })

  it('formats large byte values', () => {
    expect(formatMemory(1048576)).toBe('1024 KB')
  })
})

// =============================================================================
// formatSensorValue
// =============================================================================

describe('formatSensorValue', () => {
  it('formats temperature with 1 decimal', () => {
    expect(formatSensorValue(23.5, 'temperature')).toBe('23.5 °C')
  })

  it('formats ds18b20 with 1 decimal', () => {
    expect(formatSensorValue(23.5, 'ds18b20')).toBe('23.5 °C')
  })

  it('formats humidity as percentage', () => {
    expect(formatSensorValue(65, 'humidity')).toBe('65%')
  })

  it('formats pH with 2 decimals', () => {
    expect(formatSensorValue(7.12, 'ph')).toBe('7.12')
  })

  it('formats EC with unit', () => {
    expect(formatSensorValue(1200, 'ec')).toBe('1200 µS/cm')
  })

  it('formats unknown type with 1 decimal', () => {
    expect(formatSensorValue(42.567, undefined)).toBe('42.6')
  })

  it('rounds humidity to integer', () => {
    expect(formatSensorValue(65.7, 'humidity')).toBe('66%')
  })
})

// =============================================================================
// transformEventMessage - esp_health
// =============================================================================

describe('transformEventMessage - esp_health', () => {
  it('transforms heartbeat with data', () => {
    const event = makeEvent({
      event_type: 'esp_health',
      esp_id: 'ESP_001',
      data: {
        heap_free: 131072,
        wifi_rssi: -53,
        uptime: 3661
      }
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('esp_health')
    expect(result.title).toBe('HEARTBEAT')
    expect(result.titleDE).toBe('Verbindungsstatus')
    expect(result.summary).toContain('KB frei')
    expect(result.summary).toContain('-53 dBm')
    expect(result.category).toBe('esp-status')
  })
})

// =============================================================================
// transformEventMessage - sensor_data
// =============================================================================

describe('transformEventMessage - sensor_data', () => {
  it('transforms sensor data event', () => {
    const event = makeEvent({
      event_type: 'sensor_data',
      gpio: 4,
      data: {
        sensor_type: 'temperature',
        value: 23.5,
        unit: '°C'
      }
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('sensor_data')
    expect(result.title).toBe('SENSORDATEN')
    expect(result.summary).toContain('23.5')
    expect(result.category).toBe('sensors')
  })
})

// =============================================================================
// transformEventMessage - actuator_status
// =============================================================================

describe('transformEventMessage - actuator_status', () => {
  it('transforms actuator status with state ON', () => {
    const event = makeEvent({
      event_type: 'actuator_status',
      gpio: 5,
      data: {
        actuator_type: 'pump',
        state: true
      }
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('actuator_status')
    expect(result.title).toBe('AKTOR-STATUS')
    expect(result.summary).toContain('EIN')
    expect(result.category).toBe('actuators')
  })

  it('transforms actuator status with state OFF', () => {
    const event = makeEvent({
      event_type: 'actuator_status',
      gpio: 5,
      data: {
        actuator_type: 'relay',
        state: false
      }
    })
    const result = transformEventMessage(event)
    expect(result.summary).toContain('AUS')
  })
})

// =============================================================================
// transformEventMessage - actuator_alert
// =============================================================================

describe('transformEventMessage - actuator_alert', () => {
  it('transforms actuator alert', () => {
    const event = makeEvent({
      event_type: 'actuator_alert',
      gpio: 5,
      data: {
        alert_type: 'timeout'
      }
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('actuator_alert')
    expect(result.title).toBe('AKTOR-ALARM')
    expect(result.titleDE).toBe('Sicherheitswarnung')
    expect(result.category).toBe('actuators')
  })
})

// =============================================================================
// transformEventMessage - device_offline
// =============================================================================

describe('transformEventMessage - device_offline', () => {
  it('transforms device offline event', () => {
    const event = makeEvent({
      event_type: 'device_offline',
      esp_id: 'ESP_001',
      data: {
        reason: 'timeout'
      }
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('device_offline')
    expect(result.title).toBe('GERÄT OFFLINE')
    expect(result.titleDE).toBe('Verbindung verloren')
    expect(result.category).toBe('esp-status')
  })
})

// =============================================================================
// transformEventMessage - device_online
// =============================================================================

describe('transformEventMessage - device_online', () => {
  it('transforms device online event', () => {
    const event = makeEvent({
      event_type: 'device_online',
      esp_id: 'ESP_001'
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('device_online')
    expect(result.title).toBe('GERÄT ONLINE')
    expect(result.titleDE).toBe('Verbindung hergestellt')
    expect(result.category).toBe('esp-status')
  })
})

// =============================================================================
// transformEventMessage - config_response
// =============================================================================

describe('transformEventMessage - config_response', () => {
  it('transforms config response with error status', () => {
    const event = makeEvent({
      event_type: 'config_response',
      esp_id: 'ESP_001',
      data: {
        status: 'error',
        type: 'Sensor',
        error_code: 'VALIDATION_ERROR'
      }
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('config_response')
    expect(result.title).toBe('KONFIGURATION')
    expect(result.titleDE).toBe('Konfiguration fehlgeschlagen')
    expect(result.summary).toContain('Fehlgeschlagen')
    expect(result.category).toBe('system')
  })

  it('transforms config response with success status', () => {
    const event = makeEvent({
      event_type: 'config_response',
      esp_id: 'ESP_001',
      data: {
        status: 'success',
        type: 'Sensor'
      }
    })
    const result = transformEventMessage(event)
    expect(result.title).toBe('KONFIGURATION')
    expect(result.titleDE).toBe('Konfiguration empfangen')
    expect(result.summary).toContain('Erfolgreich')
  })
})

// =============================================================================
// transformEventMessage - device_discovered
// =============================================================================

describe('transformEventMessage - device_discovered', () => {
  it('transforms device discovered event', () => {
    const event = makeEvent({
      event_type: 'device_discovered',
      esp_id: 'ESP_NEW',
      data: {
        device_id: 'ESP_NEW'
      }
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('device_discovered')
    expect(result.title).toBe('NEUES GERÄT')
    expect(result.titleDE).toBe('Gerät entdeckt')
    expect(result.category).toBe('esp-status')
  })
})

// =============================================================================
// transformEventMessage - unknown event
// =============================================================================

describe('transformEventMessage - unknown event', () => {
  it('transforms unknown event type using defaults', () => {
    const event = makeEvent({
      event_type: 'custom_event',
      message: 'Custom message'
    })
    const result = transformEventMessage(event)
    expect(result.type).toBe('custom_event')
    expect(result.title).toBe('CUSTOM EVENT')
    expect(result.summary).toBe('Custom message')
  })
})
