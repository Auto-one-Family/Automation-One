/**
 * AddActuatorModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import AddActuatorModal from '@/components/esp/AddActuatorModal.vue'

// Mock ESP store
vi.mock('@/stores/esp', () => ({
  useEspStore: () => ({
    getDeviceId: (d: any) => d.device_id || '',
    isMock: () => true,
    addActuator: vi.fn(),
    fetchGpioStatus: vi.fn(),
    fetchDevice: vi.fn(),
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }),
}))

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}))

describe('AddActuatorModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not render when modelValue is false', () => {
    const wrapper = mount(AddActuatorModal, {
      props: { modelValue: false, espId: 'ESP_001' },
      global: { plugins: [createPinia()], stubs: { Teleport: true, GpioPicker: true } },
    })
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })

  it('renders when modelValue is true', () => {
    const wrapper = mount(AddActuatorModal, {
      props: { modelValue: true, espId: 'ESP_001' },
      global: { plugins: [createPinia()], stubs: { Teleport: true, GpioPicker: true } },
    })
    expect(wrapper.text()).toContain('Aktor hinzufügen')
  })

  it('shows actuator type dropdown', () => {
    const wrapper = mount(AddActuatorModal, {
      props: { modelValue: true, espId: 'ESP_001' },
      global: { plugins: [createPinia()], stubs: { Teleport: true, GpioPicker: true } },
    })
    expect(wrapper.text()).toContain('Aktor-Typ')
  })

  it('shows name input', () => {
    const wrapper = mount(AddActuatorModal, {
      props: { modelValue: true, espId: 'ESP_001' },
      global: { plugins: [createPinia()], stubs: { Teleport: true, GpioPicker: true } },
    })
    expect(wrapper.text()).toContain('Name')
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
  })

  it('emits update:modelValue on close', async () => {
    const wrapper = mount(AddActuatorModal, {
      props: { modelValue: true, espId: 'ESP_001' },
      global: { plugins: [createPinia()], stubs: { Teleport: true, GpioPicker: true } },
    })
    await wrapper.find('.modal-close').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
  })

  it('has Hinzufügen button', () => {
    const wrapper = mount(AddActuatorModal, {
      props: { modelValue: true, espId: 'ESP_001' },
      global: { plugins: [createPinia()], stubs: { Teleport: true, GpioPicker: true } },
    })
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('Hinzufügen'))
    expect(addBtn).toBeDefined()
  })
})
