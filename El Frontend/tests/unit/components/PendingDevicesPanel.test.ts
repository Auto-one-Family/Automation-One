/**
 * PendingDevicesPanel Component Tests
 *
 * Tests panel visibility, backdrop, close behavior, tab switching,
 * empty state, and device list rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PendingDevicesPanel from '@/components/esp/PendingDevicesPanel.vue'

// Mock the ESP store
const mockFetchPendingDevices = vi.fn()
const mockApproveDevice = vi.fn()
const mockRejectDevice = vi.fn()

let mockPendingDevices: any[] = []
let mockIsPendingLoading = false

vi.mock('@/stores/esp', () => ({
  useEspStore: () => ({
    devices: [],
    pendingDevices: mockPendingDevices,
    isPendingLoading: mockIsPendingLoading,
    fetchPendingDevices: mockFetchPendingDevices,
    approveDevice: mockApproveDevice,
    rejectDevice: mockRejectDevice,
    getDeviceId: (d: any) => d?.device_id || d?.esp_id || '',
  }),
}))

vi.mock('@/utils/wifiStrength', () => ({
  getWifiStrength: (rssi: number | null | undefined) => ({
    quality: 'good',
    label: 'Gut',
    bars: 3,
  }),
}))

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Stub the child modal
vi.mock('@/components/modals/RejectDeviceModal.vue', () => ({
  default: {
    name: 'RejectDeviceModal',
    template: '<div class="reject-modal-stub" />',
    props: ['open', 'deviceId'],
  },
}))

const samplePendingDevices = [
  {
    device_id: 'ESP_NEW_001',
    ip_address: '192.168.1.50',
    wifi_rssi: -55,
    discovered_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  },
  {
    device_id: 'ESP_NEW_002',
    ip_address: '192.168.1.51',
    wifi_rssi: -72,
    discovered_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  },
]

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(PendingDevicesPanel, {
    props: {
      isOpen: false,
      ...props,
    },
    global: {
      plugins: [createPinia()],
    },
  })
}

describe('PendingDevicesPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockPendingDevices = []
    mockIsPendingLoading = false
    mockFetchPendingDevices.mockClear()
    mockApproveDevice.mockClear()
    mockRejectDevice.mockClear()
  })

  describe('visibility', () => {
    it('does NOT render panel content when isOpen=false', () => {
      const w = mountPanel({ isOpen: false })
      expect(w.find('.pending-panel').exists()).toBe(false)
    })

    it('renders panel when isOpen=true', () => {
      const w = mountPanel({ isOpen: true })
      expect(w.find('.pending-panel').exists()).toBe(true)
    })

    it('renders backdrop when isOpen=true', () => {
      const w = mountPanel({ isOpen: true })
      expect(w.find('.pending-backdrop').exists()).toBe(true)
    })

    it('does NOT render backdrop when isOpen=false', () => {
      const w = mountPanel({ isOpen: false })
      expect(w.find('.pending-backdrop').exists()).toBe(false)
    })
  })

  describe('close behavior', () => {
    it('close button emits update:isOpen with false', async () => {
      const w = mountPanel({ isOpen: true })
      const closeBtn = w.find('.pending-panel__close')
      expect(closeBtn.exists()).toBe(true)

      await closeBtn.trigger('click')

      expect(w.emitted('update:isOpen')).toBeTruthy()
      expect(w.emitted('update:isOpen')![0]).toEqual([false])
    })

    it('backdrop click emits close and update:isOpen', async () => {
      const w = mountPanel({ isOpen: true })
      const backdrop = w.find('.pending-backdrop')

      await backdrop.trigger('click')

      expect(w.emitted('close')).toBeTruthy()
      expect(w.emitted('update:isOpen')).toBeTruthy()
      expect(w.emitted('update:isOpen')![0]).toEqual([false])
    })
  })

  describe('tab switching', () => {
    it('starts on the devices tab', () => {
      const w = mountPanel({ isOpen: true })
      const tabs = w.findAll('.pending-panel__tab')
      expect(tabs[0].classes()).toContain('active')
      expect(tabs[0].text()).toContain('Geräte')
    })

    it('switches to info tab on click', async () => {
      const w = mountPanel({ isOpen: true })
      const tabs = w.findAll('.pending-panel__tab')
      await tabs[2].trigger('click')

      const updatedTabs = w.findAll('.pending-panel__tab')
      expect(updatedTabs[2].classes()).toContain('active')
    })

    it('info tab shows connection guide content', async () => {
      const w = mountPanel({ isOpen: true })
      const tabs = w.findAll('.pending-panel__tab')
      await tabs[2].trigger('click')

      expect(w.text()).toContain('ESP32 verbinden')
      expect(w.text()).toContain('Firmware flashen')
    })
  })

  describe('empty state', () => {
    it('shows devices empty state when no zones (default tab)', () => {
      mockPendingDevices = []
      mockIsPendingLoading = false
      const w = mountPanel({ isOpen: true })
      expect(w.find('.pending-panel__empty').exists()).toBe(true)
      expect(w.text()).toContain('Keine Geräte in Zonen')
    })

    it('shows pending empty state when on pending tab and no pending devices', async () => {
      mockPendingDevices = []
      mockIsPendingLoading = false
      const w = mountPanel({ isOpen: true })
      await w.findAll('.pending-panel__tab')[1].trigger('click')
      expect(w.text()).toContain('Keine neuen Geräte')
    })
  })

  describe('device list', () => {
    it('renders device cards when pending devices exist', async () => {
      mockPendingDevices = samplePendingDevices
      const w = mountPanel({ isOpen: true })
      await w.findAll('.pending-panel__tab')[1].trigger('click')
      const devices = w.findAll('.pending-device')
      expect(devices).toHaveLength(2)
    })

    it('displays device IDs', async () => {
      mockPendingDevices = samplePendingDevices
      const w = mountPanel({ isOpen: true })
      await w.findAll('.pending-panel__tab')[1].trigger('click')
      expect(w.text()).toContain('ESP_NEW_001')
      expect(w.text()).toContain('ESP_NEW_002')
    })

    it('displays IP addresses', async () => {
      mockPendingDevices = samplePendingDevices
      const w = mountPanel({ isOpen: true })
      await w.findAll('.pending-panel__tab')[1].trigger('click')
      expect(w.text()).toContain('192.168.1.50')
      expect(w.text()).toContain('192.168.1.51')
    })

    it('shows approve and reject buttons for each device', async () => {
      mockPendingDevices = [samplePendingDevices[0]]
      const w = mountPanel({ isOpen: true })
      await w.findAll('.pending-panel__tab')[1].trigger('click')
      const approveBtn = w.find('.pending-device__btn--approve')
      const rejectBtn = w.find('.pending-device__btn--reject')
      expect(approveBtn.exists()).toBe(true)
      expect(rejectBtn.exists()).toBe(true)
    })
  })
})
