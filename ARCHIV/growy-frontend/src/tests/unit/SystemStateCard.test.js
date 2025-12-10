import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SystemStateCard from '@/components/dashboard/SystemStateCard.vue'

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

describe('SystemStateCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const createMockMqttStore = (deviceData) => {
    return {
      espDevices: new Map([['test_esp', deviceData]]),
      getKaiserId: vi.fn(() => 'default_kaiser'),
      kaiserIdConflicts: new Map(),
      sendSystemCommand: vi.fn(),
    }
  }

  it('should display safe mode tooltip when enter_reason is present', () => {
    const mockDevice = {
      safeMode: true,
      safeModeEnterReason: 'GPIO-Konflikt auf Pin 0',
      safeModeEnterTimestamp: Math.floor(Date.now() / 1000) * 1000, // Convert to milliseconds
      systemState: 'OPERATIONAL',
      lastUpdate: Date.now(),
    }

    const wrapper = mount(SystemStateCard, {
      props: {
        espId: 'test_esp',
      },
      global: {
        provide: {
          mqttStore: createMockMqttStore(mockDevice),
        },
        stubs: {
          'v-card': true,
          'v-card-title': true,
          'v-card-text': true,
          'v-card-actions': true,
          'v-row': true,
          'v-col': true,
          'v-list': true,
          'v-list-item': true,
          'v-chip': true,
          'v-tooltip': true,
          'v-icon': true,
          'v-spacer': true,
          'v-btn': true,
        },
      },
    })

    const safeModeChip = wrapper.find('[data-test="safe-mode-chip"]')
    expect(safeModeChip.exists()).toBe(true)
    expect(safeModeChip.classes()).toContain('cursor-help')
  })

  it('should not show tooltip when enter_reason is missing', () => {
    const mockDevice = {
      safeMode: true,
      // No enter_reason
      systemState: 'OPERATIONAL',
      lastUpdate: Date.now(),
    }

    const wrapper = mount(SystemStateCard, {
      props: {
        espId: 'test_esp',
      },
      global: {
        provide: {
          mqttStore: createMockMqttStore(mockDevice),
        },
        stubs: {
          'v-card': true,
          'v-card-title': true,
          'v-card-text': true,
          'v-card-actions': true,
          'v-row': true,
          'v-col': true,
          'v-list': true,
          'v-list-item': true,
          'v-chip': true,
          'v-tooltip': true,
          'v-icon': true,
          'v-spacer': true,
          'v-btn': true,
        },
      },
    })

    const safeModeChip = wrapper.find('[data-test="safe-mode-chip"]')
    expect(safeModeChip.exists()).toBe(true)
    expect(safeModeChip.classes()).not.toContain('cursor-help')
  })

  it('should not show tooltip when safe mode is disabled', () => {
    const mockDevice = {
      safeMode: false,
      safeModeEnterReason: 'Some reason',
      systemState: 'OPERATIONAL',
      lastUpdate: Date.now(),
    }

    const wrapper = mount(SystemStateCard, {
      props: {
        espId: 'test_esp',
      },
      global: {
        provide: {
          mqttStore: createMockMqttStore(mockDevice),
        },
        stubs: {
          'v-card': true,
          'v-card-title': true,
          'v-card-text': true,
          'v-card-actions': true,
          'v-row': true,
          'v-col': true,
          'v-list': true,
          'v-list-item': true,
          'v-chip': true,
          'v-tooltip': true,
          'v-icon': true,
          'v-spacer': true,
          'v-btn': true,
        },
      },
    })

    const safeModeChip = wrapper.find('[data-test="safe-mode-chip"]')
    expect(safeModeChip.exists()).toBe(true)
    expect(safeModeChip.classes()).not.toContain('cursor-help')
  })

  it('should handle missing device gracefully', () => {
    const wrapper = mount(SystemStateCard, {
      props: {
        espId: 'non_existent_esp',
      },
      global: {
        provide: {
          mqttStore: createMockMqttStore(null),
        },
        stubs: {
          'v-card': true,
          'v-card-title': true,
          'v-card-text': true,
          'v-card-actions': true,
          'v-row': true,
          'v-col': true,
          'v-list': true,
          'v-list-item': true,
          'v-chip': true,
          'v-tooltip': true,
          'v-icon': true,
          'v-spacer': true,
          'v-btn': true,
        },
      },
    })

    // Should not throw error
    expect(wrapper.exists()).toBe(true)
  })

  it('should display correct safe mode status text', () => {
    const mockDevice = {
      safeMode: true,
      safeModeEnterReason: 'Test reason',
      systemState: 'OPERATIONAL',
      lastUpdate: Date.now(),
    }

    const wrapper = mount(SystemStateCard, {
      props: {
        espId: 'test_esp',
      },
      global: {
        provide: {
          mqttStore: createMockMqttStore(mockDevice),
        },
        stubs: {
          'v-card': true,
          'v-card-title': true,
          'v-card-text': true,
          'v-card-actions': true,
          'v-row': true,
          'v-col': true,
          'v-list': true,
          'v-list-item': true,
          'v-chip': true,
          'v-tooltip': true,
          'v-icon': true,
          'v-spacer': true,
          'v-btn': true,
        },
      },
    })

    const safeModeChip = wrapper.find('[data-test="safe-mode-chip"]')
    expect(safeModeChip.text()).toContain('Enabled')
  })
})
