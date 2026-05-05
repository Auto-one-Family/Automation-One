/**
 * Tests for HeaderDeviceStatus component.
 *
 * Verifies:
 * - Online/Offline counter display in all modes
 * - Alarm counter only visible when > 0
 * - Mock/Real type toggle hidden in production when no mock devices
 * - Mock/Real type toggle visible in development mode
 * - Mock/Real type toggle visible in production when mock devices exist
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockRouterPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

let mockStatusCounts = { online: 0, offline: 0, warning: 0, safeMode: 0 }
let mockDeviceCounts = { all: 0, mock: 0, real: 0 }
let mockFilterType = 'all'
const mockResetFilters = vi.fn()
const mockToggleStatusFilter = vi.fn()

vi.mock('@/shared/stores/dashboard.store', () => ({
  useDashboardStore: () => ({
    get statusCounts() { return mockStatusCounts },
    get deviceCounts() { return mockDeviceCounts },
    get filterType() { return mockFilterType },
    set filterType(v: string) { mockFilterType = v },
    resetFilters: mockResetFilters,
    toggleStatusFilter: mockToggleStatusFilter,
  }),
}))

let mockMockDevices: any[] = []
let mockAlertStats: { active_count: number } | null = null

vi.mock('@/stores/esp', () => ({
  useEspStore: () => ({
    get mockDevices() { return mockMockDevices },
  }),
}))

vi.mock('@/shared/stores', () => ({
  useAlertCenterStore: () => ({
    get alertStats() { return mockAlertStats },
  }),
}))

async function mountComponent() {
  const HeaderDeviceStatus = (await import('@/components/layout/HeaderDeviceStatus.vue')).default
  return mount(HeaderDeviceStatus, {
    global: { plugins: [createPinia()] },
  })
}

describe('HeaderDeviceStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockStatusCounts = { online: 4, offline: 3, warning: 0, safeMode: 0 }
    mockDeviceCounts = { all: 7, mock: 0, real: 7 }
    mockFilterType = 'all'
    mockMockDevices = []
    mockAlertStats = null
    mockResetFilters.mockClear()
    mockToggleStatusFilter.mockClear()
    mockRouterPush.mockClear()
    vi.stubEnv('MODE', 'production')
  })

  it('renders Online counter', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('4 Online')
  })

  it('renders Offline counter', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('3 Offline')
  })

  it('does not render alarm chip when alarm count is 0', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.text()).not.toContain('⚠')
  })

  it('renders alarm chip when active alerts exist', async () => {
    mockAlertStats = { active_count: 2 }
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('2')
    const alarmChip = wrapper.find('.hds__chip--alarm')
    expect(alarmChip.exists()).toBe(true)
  })

  it('does not render Mock/Real toggle in production mode with no mock devices', async () => {
    vi.stubEnv('MODE', 'production')
    mockMockDevices = []
    const wrapper = await mountComponent()
    expect(wrapper.find('.hds__type-segment').exists()).toBe(false)
  })

  it('renders Mock/Real toggle in development mode', async () => {
    vi.stubEnv('MODE', 'development')
    const wrapper = await mountComponent()
    expect(wrapper.find('.hds__type-segment').exists()).toBe(true)
  })

  it('renders Mock/Real toggle in production mode when mock devices exist', async () => {
    vi.stubEnv('MODE', 'production')
    mockMockDevices = [{ device_id: 'ESP_MOCK_abc' }]
    const wrapper = await mountComponent()
    expect(wrapper.find('.hds__type-segment').exists()).toBe(true)
  })

  it('navigates to /hardware and sets status filter on Online click', async () => {
    const wrapper = await mountComponent()
    await wrapper.find('.hds__chip--online').trigger('click')
    expect(mockRouterPush).toHaveBeenCalledWith('/hardware')
    expect(mockResetFilters).toHaveBeenCalled()
    expect(mockToggleStatusFilter).toHaveBeenCalledWith('online')
  })

  it('navigates to /hardware and sets status filter on Offline click', async () => {
    const wrapper = await mountComponent()
    await wrapper.find('.hds__chip--offline').trigger('click')
    expect(mockRouterPush).toHaveBeenCalledWith('/hardware')
    expect(mockResetFilters).toHaveBeenCalled()
    expect(mockToggleStatusFilter).toHaveBeenCalledWith('offline')
  })
})
