import { describe, it, expect } from 'vitest'
import { espHealthPresentation, normalizeEspHealthPayload } from '@/domain/esp/espHealth'

describe('normalizeEspHealthPayload', () => {
  it('maps degradation flags and keeps extra telemetry', () => {
    const vm = normalizeEspHealthPayload({
      esp_id: 'ESP_X',
      status: 'online',
      persistence_degraded: true,
      persistence_degraded_reason: 'flash_busy',
      network_degraded: false,
      metrics_schema_version: 2,
      custom_fw_counter: 3,
    })
    expect(vm.persistenceDegraded).toBe(true)
    expect(vm.persistenceDegradedReason).toBe('flash_busy')
    expect(vm.networkDegraded).toBe(false)
    expect(vm.rawTelemetry.metrics_schema_version).toBe(2)
    expect(vm.rawTelemetry.custom_fw_counter).toBe(3)
    expect(vm.rawTelemetry.persistence_degraded).toBeUndefined()
  })
})

describe('espHealthPresentation', () => {
  it('shows warning badge when online and degraded', () => {
    const vm = normalizeEspHealthPayload({
      esp_id: 'ESP_X',
      persistence_degraded: true,
    })
    const p = espHealthPresentation(vm, true)
    expect(p.showBadge).toBe(true)
    expect(p.severity).toBe('warning')
    expect(p.tooltipLines.some(l => l.includes('Persistenz'))).toBe(true)
  })

  it('does not show degradation badge when device not reported online', () => {
    const vm = normalizeEspHealthPayload({ esp_id: 'ESP_X', persistence_degraded: true })
    const p = espHealthPresentation(vm, false)
    expect(p.showBadge).toBe(false)
  })
})
