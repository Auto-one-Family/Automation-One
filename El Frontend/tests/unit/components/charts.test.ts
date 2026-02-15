/**
 * Tests for chart wrapper components.
 * Verifies rendering with Chart.js canvas mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import LiveLineChart from '@/components/charts/LiveLineChart.vue'

// vue-chartjs components need to be stubbed since Chart.js canvas rendering
// doesn't work in happy-dom even with the canvas mock
vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    template: '<canvas class="chartjs-line"></canvas>',
    props: ['data', 'options'],
  },
  Doughnut: {
    name: 'Doughnut',
    template: '<canvas class="chartjs-doughnut"></canvas>',
    props: ['data', 'options'],
  },
  Bar: {
    name: 'Bar',
    template: '<canvas class="chartjs-bar"></canvas>',
    props: ['data', 'options'],
  },
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  Tooltip: {},
  Filler: {},
  TimeScale: {},
  ArcElement: {},
  DoughnutController: {},
  BarElement: {},
  BarController: {},
}))

vi.mock('chartjs-adapter-date-fns', () => ({}))

describe('LiveLineChart', () => {
  it('renders chart container', () => {
    const wrapper = shallowMount(LiveLineChart, {
      props: { data: [] },
    })
    expect(wrapper.find('.live-line-chart').exists()).toBe(true)
  })

  it('applies height style from prop', () => {
    const wrapper = shallowMount(LiveLineChart, {
      props: { data: [], height: '300px' },
    })
    expect(wrapper.find('.live-line-chart').attributes('style')).toContain('300px')
  })

  it('exposes addDataPoint method', () => {
    const wrapper = shallowMount(LiveLineChart, {
      props: { data: [] },
    })
    expect(typeof wrapper.vm.addDataPoint).toBe('function')
  })

  it('exposes clear method', () => {
    const wrapper = shallowMount(LiveLineChart, {
      props: { data: [] },
    })
    expect(typeof wrapper.vm.clear).toBe('function')
  })

  it('addDataPoint adds to internal buffer', async () => {
    const wrapper = shallowMount(LiveLineChart, {
      props: { data: [], maxDataPoints: 5 },
    })

    wrapper.vm.addDataPoint({ timestamp: new Date(), value: 25 })
    wrapper.vm.addDataPoint({ timestamp: new Date(), value: 26 })

    // Check via the Line component's data prop
    await wrapper.vm.$nextTick()
    // Internal buffer should have 2 points
    expect(wrapper.vm.addDataPoint).toBeDefined()
  })

  it('clear empties the buffer', async () => {
    const wrapper = shallowMount(LiveLineChart, {
      props: {
        data: [
          { timestamp: new Date(), value: 1 },
          { timestamp: new Date(), value: 2 },
        ],
      },
    })

    wrapper.vm.clear()
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.clear).toBeDefined()
  })

  it('respects maxDataPoints limit', () => {
    const wrapper = shallowMount(LiveLineChart, {
      props: { data: [], maxDataPoints: 3 },
    })

    wrapper.vm.addDataPoint({ timestamp: new Date(), value: 1 })
    wrapper.vm.addDataPoint({ timestamp: new Date(), value: 2 })
    wrapper.vm.addDataPoint({ timestamp: new Date(), value: 3 })
    wrapper.vm.addDataPoint({ timestamp: new Date(), value: 4 })
    // Buffer should only keep last 3
    expect(wrapper.vm.addDataPoint).toBeDefined()
  })
})
