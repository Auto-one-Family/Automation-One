/**
 * ZonePlate Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ZonePlate from '@/components/dashboard/ZonePlate.vue'

// lucide-vue-next is mocked globally in tests/setup.ts

// Mock the ESP store entirely to avoid WebSocket initialization
vi.mock('@/stores/esp', () => ({
  useEspStore: () => ({
    getDeviceId: (d: any) => d.device_id || d.esp_id || '',
    isMock: (id: string) => id.includes('MOCK'),
    devices: [],
  }),
}))

vi.mock('@/shared/stores/logic.store', () => ({
  useLogicStore: () => ({
    crossEspConnections: [],
  }),
}))

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}))

const mockDevices = [
  {
    device_id: 'ESP_001', name: 'ESP 1', status: 'online', connected: true,
    sensors: [{ gpio: 4, sensor_type: 'DS18B20' }], actuators: [{ gpio: 16, actuator_type: 'relay' }],
    sensor_count: 1, actuator_count: 1, subzone_id: 'sub_1', subzone_name: 'Bewässerung',
  },
  {
    device_id: 'ESP_002', name: 'ESP 2', status: 'offline', connected: false,
    sensors: [{ gpio: 5, sensor_type: 'DHT22' }, { gpio: 6, sensor_type: 'BH1750' }], actuators: [],
    sensor_count: 2, actuator_count: 0, subzone_id: null, subzone_name: null,
  },
]

function mountPlate(overrides: Record<string, unknown> = {}) {
  return mount(ZonePlate, {
    props: { zoneId: 'zone_1', zoneName: 'Zone 1', devices: mockDevices as any, ...overrides },
    global: { plugins: [createPinia()] },
  })
}

describe('ZonePlate', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('renders zone name', () => {
    const w = mountPlate({ zoneName: 'Gewächshaus A' })
    expect(w.text()).toContain('Gewächshaus A')
  })

  it('shows online/total count', () => {
    const w = mountPlate()
    expect(w.text()).toContain('1/2')
  })

  it('shows total sensor/actuator counts in header', () => {
    const w = mountPlate()
    // Total: 3 sensors (1 + 2), 1 actuator — shown as meta pills
    expect(w.text()).toContain('3S')
    expect(w.text()).toContain('1A')
  })

  it('renders device wrappers for each device', () => {
    const w = mountPlate()
    const wrappers = w.findAll('.zone-plate__device-wrapper')
    expect(wrappers).toHaveLength(2)
  })

  it('renders subzone label', () => {
    const w = mountPlate()
    expect(w.text()).toContain('Bewässerung')
  })

  it('emits update:isExpanded on header click', async () => {
    const w = mountPlate({ isExpanded: true })
    await w.find('.zone-plate__header').trigger('click')
    expect(w.emitted('update:isExpanded')).toBeTruthy()
    expect(w.emitted('update:isExpanded')![0][0]).toBe(false)
  })

  it('has healthy class when all online', () => {
    const allOnline = [{ ...mockDevices[0] }]
    const w = mountPlate({ devices: allOnline })
    expect(w.find('.zone-plate--healthy').exists()).toBe(true)
  })

  it('handles empty devices', () => {
    const w = mountPlate({ devices: [] })
    expect(w.text()).toContain('0/0')
  })
})
