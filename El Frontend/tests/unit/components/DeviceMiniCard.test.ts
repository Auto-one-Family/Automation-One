import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import DeviceMiniCard from '@/components/dashboard/DeviceMiniCard.vue'

vi.mock('@/composables/useESPStatus', () => ({
  getESPStatus: () => 'online',
  getESPStatusDisplay: () => ({ text: 'Online' }),
}))

const ESPCardBaseStub = defineComponent({
  name: 'ESPCardBase',
  emits: ['click', 'settings', 'change-zone', 'monitor-nav', 'delete'],
  template: `
    <div>
      <button data-testid="emit-click" @click="$emit('click')">click</button>
      <button data-testid="emit-settings" @click="$emit('settings')">settings</button>
      <button data-testid="emit-change-zone" @click="$emit('change-zone')">change-zone</button>
      <button data-testid="emit-monitor-nav" @click="$emit('monitor-nav')">monitor-nav</button>
      <button data-testid="emit-delete" @click="$emit('delete')">delete</button>
      <slot />
    </div>
  `,
})

const device = {
  device_id: 'ESP_TEST_001',
  esp_id: 'ESP_TEST_001',
  name: 'Test Device',
  status: 'online',
  sensors: [],
  actuators: [],
  sensor_count: 0,
  actuator_count: 0,
  last_seen: null,
  last_heartbeat: null,
}

function mountCard() {
  return mount(DeviceMiniCard, {
    props: {
      device: device as any,
      isMock: true,
    },
    global: {
      stubs: {
        ESPCardBase: ESPCardBaseStub,
      },
    },
  })
}

describe('DeviceMiniCard', () => {
  it('maps delete to device-delete with device id', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-testid="emit-delete"]').trigger('click')

    expect(wrapper.emitted('device-delete')).toBeTruthy()
    expect(wrapper.emitted('device-delete')?.[0]).toEqual(['ESP_TEST_001'])
  })

  it('forwards settings/change-zone/monitor-nav with full device payload', async () => {
    const wrapper = mountCard()

    await wrapper.get('[data-testid="emit-settings"]').trigger('click')
    await wrapper.get('[data-testid="emit-change-zone"]').trigger('click')
    await wrapper.get('[data-testid="emit-monitor-nav"]').trigger('click')

    expect(wrapper.emitted('settings')?.[0]).toEqual([device])
    expect(wrapper.emitted('change-zone')?.[0]).toEqual([device])
    expect(wrapper.emitted('monitor-nav')?.[0]).toEqual([device])
  })
})
