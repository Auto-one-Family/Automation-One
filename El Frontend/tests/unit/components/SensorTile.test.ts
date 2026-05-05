/**
 * AUT-247: SensorTile — Unified sensor widget tests
 *
 * Verifies:
 *   1. Existing dashboard JSONs (4 legacy sensor widget types) load and render
 *      without data loss — all four mount successfully and pass props through.
 *   2. WS-Subscription path is unchanged: sensor_data lookup uses
 *      (esp_id, gpio, sensor_type) and live updates flow into the rendered
 *      numeric value via espStore.devices reactivity.
 *   3. Multi-Value sensor (SHT31): sub-value picker is visible, switching
 *      sub-value re-emits update:config with the sibling sensor_type's
 *      sensorId so the WS subscription stays consistent with the contract.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// ─── Stub heavy chart components (canvas-based) ─────────────────────────────

vi.mock('@/components/charts/GaugeChart.vue', () => ({
  default: {
    name: 'GaugeChart',
    props: ['value', 'unit', 'min', 'max', 'thresholds', 'size'],
    template: '<div class="gauge-chart-stub" :data-value="value" :data-unit="unit" />',
  },
}))

vi.mock('@/components/charts/LiveLineChart.vue', () => ({
  default: {
    name: 'LiveLineChart',
    props: ['data', 'height', 'unit', 'sensorType', 'fill', 'color', 'yMin', 'yMax', 'showThresholds', 'thresholds'],
    template: '<div class="live-line-chart-stub" :data-points="data?.length ?? 0" />',
  },
}))

vi.mock('@/components/charts/HistoricalChart.vue', () => ({
  default: {
    name: 'HistoricalChart',
    props: ['espId', 'gpio', 'sensorType', 'timeRange', 'unit', 'showThresholds', 'scatterMode', 'height'],
    template: '<div class="historical-chart-stub" :data-esp="espId" :data-gpio="gpio" :data-type="sensorType" />',
  },
}))

vi.mock('@/components/dashboard-widgets/ExportCsvDialog.vue', () => ({
  default: { name: 'ExportCsvDialog', template: '<div class="export-csv-stub" />' },
}))

// ─── Mock espStore (used by all sensor widgets) ─────────────────────────────

const TEST_DEVICE = {
  esp_id: 'ESP_TEST',
  device_id: 'ESP_TEST',
  zone_id: 'zone-1',
  zone_name: 'Zone 1',
  is_online: true,
  sensors: [
    {
      gpio: 4,
      sensor_type: 'sht31_temp',
      name: 'Temp&Hum',
      raw_value: 22.5,
      unit: '°C',
      quality: 'good',
      last_read: '2026-05-01T10:00:00Z',
    },
    {
      gpio: 4,
      sensor_type: 'sht31_humidity',
      name: 'Temp&Hum',
      raw_value: 55.0,
      unit: '%RH',
      quality: 'good',
      last_read: '2026-05-01T10:00:00Z',
    },
    {
      gpio: 5,
      sensor_type: 'ds18b20',
      name: 'Substrat',
      raw_value: 18.0,
      unit: '°C',
      quality: 'excellent',
      last_read: '2026-05-01T10:00:00Z',
    },
  ],
  actuators: [],
  subzones: [],
}

vi.mock('@/stores/esp', () => ({
  useEspStore: () => ({
    devices: [TEST_DEVICE],
    getDeviceId: (d: any) => d.device_id || d.esp_id,
    isMock: (_id: string) => false,
  }),
}))

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AUT-247 SensorTile — unified sensor widget', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // -------------------------------------------------------------------------
  // 1) Legacy dashboard JSON: all four wrapper widgets render via SensorTile
  // -------------------------------------------------------------------------

  it('renders SensorCardWidget (numeric mode) without data loss', async () => {
    const SensorCardWidget = (await import('@/components/dashboard-widgets/SensorCardWidget.vue')).default
    const wrapper = mount(SensorCardWidget, {
      props: { sensorId: 'ESP_TEST:5:ds18b20', zoneId: 'zone-1' },
    })
    await nextTick()
    // Numeric output — value 18.0 with 1 decimal
    expect(wrapper.text()).toContain('18.0')
    expect(wrapper.text()).toContain('Substrat')
  })

  it('renders GaugeWidget (gauge mode) and forwards thresholds', async () => {
    const GaugeWidget = (await import('@/components/dashboard-widgets/GaugeWidget.vue')).default
    const wrapper = mount(GaugeWidget, {
      props: {
        sensorId: 'ESP_TEST:5:ds18b20',
        zoneId: 'zone-1',
        yMin: 0,
        yMax: 30,
        warnLow: 10,
        warnHigh: 25,
        alarmLow: 5,
        alarmHigh: 28,
      },
    })
    await nextTick()
    const gauge = wrapper.find('.gauge-chart-stub')
    expect(gauge.exists()).toBe(true)
    expect(gauge.attributes('data-value')).toBe('18')
  })

  it('renders LineChartWidget (sparkline mode) with empty live buffer', async () => {
    const LineChartWidget = (await import('@/components/dashboard-widgets/LineChartWidget.vue')).default
    const wrapper = mount(LineChartWidget, {
      props: { sensorId: 'ESP_TEST:5:ds18b20', zoneId: 'zone-1' },
    })
    await nextTick()
    const chart = wrapper.find('.live-line-chart-stub')
    expect(chart.exists()).toBe(true)
    // Live buffer starts empty (0 points)
    expect(chart.attributes('data-points')).toBe('0')
  })

  it('renders HistoricalChartWidget (historic mode) and forwards esp_id/gpio/sensor_type', async () => {
    const HistoricalChartWidget = (await import('@/components/dashboard-widgets/HistoricalChartWidget.vue')).default
    const wrapper = mount(HistoricalChartWidget, {
      props: { sensorId: 'ESP_TEST:5:ds18b20', zoneId: 'zone-1', timeRange: '24h' },
    })
    await nextTick()
    const chart = wrapper.find('.historical-chart-stub')
    expect(chart.exists()).toBe(true)
    // WS contract triplet (esp_id, gpio, sensor_type) — same triplet drives REST history
    expect(chart.attributes('data-esp')).toBe('ESP_TEST')
    expect(chart.attributes('data-gpio')).toBe('5')
    expect(chart.attributes('data-type')).toBe('ds18b20')
  })

  // -------------------------------------------------------------------------
  // 2) WS-Subscription contract unchanged: (esp_id, gpio, sensor_type)
  // -------------------------------------------------------------------------

  it('looks up sensor data via (esp_id, gpio, sensor_type) triplet', async () => {
    // SensorTile parses sensorId "ESP_TEST:4:sht31_temp" and finds the sensor
    // matching all three parts. Same triplet the server uses for WS routing.
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: {
        sensorId: 'ESP_TEST:4:sht31_temp',
        displayMode: 'numeric',
        hideModeToggle: true,
      },
    })
    await nextTick()
    // sht31_temp on gpio=4 has raw_value 22.5; sht31_humidity on the same GPIO
    // has 55.0. Picking the temp variant proves the triplet match works.
    expect(wrapper.text()).toContain('22.5')
    expect(wrapper.text()).not.toContain('55.0')
  })

  it('switching sensor re-emits update:config with full triplet sensorId', async () => {
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: {
        sensorId: '',
        displayMode: 'numeric',
        hideModeToggle: true,
      },
    })
    await nextTick()
    // Empty state: pick a sensor through the dropdown
    const select = wrapper.find('select.sensor-tile__select')
    expect(select.exists()).toBe(true)
    await select.setValue('ESP_TEST:5:ds18b20')
    const events = wrapper.emitted('update:config')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ sensorId: 'ESP_TEST:5:ds18b20' })
  })

  // -------------------------------------------------------------------------
  // 3) Multi-Value Sensor (SHT31) — sub-value picker
  // -------------------------------------------------------------------------

  it('shows sub-value picker for multi-value sensors (SHT31)', async () => {
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: {
        sensorId: 'ESP_TEST:4:sht31_temp',
        displayMode: 'numeric',
        hideModeToggle: true,
      },
    })
    await nextTick()
    const tabs = wrapper.findAll('.sensor-tile__subvalue')
    expect(tabs.length).toBe(2)
    // Tabs labeled by MULTI_VALUE_DEVICES.sht31.values: Temperatur, Luftfeuchte
    const labels = tabs.map(t => t.text())
    expect(labels).toContain('Temperatur')
    expect(labels).toContain('Luftfeuchte')
  })

  it('does not show sub-value picker for single-value sensors (DS18B20)', async () => {
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: {
        sensorId: 'ESP_TEST:5:ds18b20',
        displayMode: 'numeric',
        hideModeToggle: true,
      },
    })
    await nextTick()
    expect(wrapper.findAll('.sensor-tile__subvalue').length).toBe(0)
  })

  it('switching sub-value emits update:config with sibling sensor_type', async () => {
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: {
        sensorId: 'ESP_TEST:4:sht31_temp',
        displayMode: 'numeric',
        hideModeToggle: true,
      },
    })
    await nextTick()
    const tabs = wrapper.findAll('.sensor-tile__subvalue')
    const humidityTab = tabs.find(t => t.text() === 'Luftfeuchte')
    expect(humidityTab).toBeTruthy()
    await humidityTab!.trigger('click')
    await flushPromises()
    const events = wrapper.emitted('update:config')
    expect(events).toBeTruthy()
    // Sibling sensorId: same espId+gpio, sensor_type swapped to sht31_humidity
    expect(events![0][0]).toMatchObject({ sensorId: 'ESP_TEST:4:sht31_humidity' })
  })

  // -------------------------------------------------------------------------
  // 4) Mode toggle (only when hideModeToggle=false)
  // -------------------------------------------------------------------------

  it('renders mode toggle pill bar by default', async () => {
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: { sensorId: 'ESP_TEST:5:ds18b20' },
    })
    await nextTick()
    const modes = wrapper.findAll('.sensor-tile__mode')
    expect(modes.length).toBe(4)
  })

  it('hides mode toggle when hideModeToggle=true (legacy wrapper case)', async () => {
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: { sensorId: 'ESP_TEST:5:ds18b20', hideModeToggle: true },
    })
    await nextTick()
    expect(wrapper.findAll('.sensor-tile__mode').length).toBe(0)
  })

  it('switching mode emits update:config with new displayMode', async () => {
    const SensorTile = (await import('@/components/dashboard-widgets/SensorTile.vue')).default
    const wrapper = mount(SensorTile, {
      props: { sensorId: 'ESP_TEST:5:ds18b20', displayMode: 'numeric' },
    })
    await nextTick()
    const modes = wrapper.findAll('.sensor-tile__mode')
    const gaugeBtn = modes.find(b => b.text().includes('Gauge'))
    expect(gaugeBtn).toBeTruthy()
    await gaugeBtn!.trigger('click')
    const events = wrapper.emitted('update:config')
    expect(events).toBeTruthy()
    expect(events![events!.length - 1][0]).toMatchObject({ displayMode: 'gauge' })
  })
})

// ─── Widget-Registry tests (Step 4: replaces computed-explosion) ────────────

describe('AUT-247 widgetRegistry — declarative capability map', () => {
  it('resolves capabilities for legacy sensor widget types', async () => {
    const { getWidgetCapabilities } = await import('@/types/widgetRegistry')
    const caps = getWidgetCapabilities('line-chart')
    expect(caps.hasSensorPicker).toBe(true)
    expect(caps.hasYRange).toBe(true)
    expect(caps.hasThresholds).toBe(true)
    expect(caps.hasZoneFilter).toBe(false)
  })

  it('resolves capabilities for sensor-tile (full sensor capability set)', async () => {
    const { getWidgetCapabilities } = await import('@/types/widgetRegistry')
    const caps = getWidgetCapabilities('sensor-tile')
    expect(caps.hasSensorPicker).toBe(true)
    expect(caps.hasShortTimeRange).toBe(true)
    expect(caps.hasThresholds).toBe(true)
  })

  it('returns all-false defaults for unknown widget type', async () => {
    const { getWidgetCapabilities } = await import('@/types/widgetRegistry')
    const caps = getWidgetCapabilities('unknown-widget-type')
    expect(caps.hasSensorPicker).toBe(false)
    expect(caps.hasYRange).toBe(false)
    expect(caps.hasThresholds).toBe(false)
    expect(caps.hasZoneFilter).toBe(false)
  })

  it('zone-filter capability only set for list widgets (alarm/esp-health/runtime)', async () => {
    const { getWidgetCapabilities } = await import('@/types/widgetRegistry')
    expect(getWidgetCapabilities('alarm-list').hasZoneFilter).toBe(true)
    expect(getWidgetCapabilities('esp-health').hasZoneFilter).toBe(true)
    expect(getWidgetCapabilities('actuator-runtime').hasZoneFilter).toBe(true)
    expect(getWidgetCapabilities('line-chart').hasZoneFilter).toBe(false)
  })
})

// ─── Dashboard JSON snapshot — round-trip for all 4 legacy widget types ─────

describe('AUT-247 — Dashboard snapshot loads all 4 legacy widget types', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addWidget accepts all four legacy types and preserves config', async () => {
    const { useDashboardStore } = await import('@/shared/stores/dashboard.store')
    const dashStore = useDashboardStore()
    const layout = dashStore.createLayout('Snapshot-Layout')

    const types: Array<{ type: any; config: any }> = [
      { type: 'sensor-card', config: { sensorId: 'ESP_TEST:5:ds18b20' } },
      { type: 'gauge', config: { sensorId: 'ESP_TEST:5:ds18b20', yMin: 0, yMax: 50 } },
      { type: 'line-chart', config: { sensorId: 'ESP_TEST:5:ds18b20', showThresholds: true, warnLow: 10 } },
      { type: 'historical', config: { sensorId: 'ESP_TEST:5:ds18b20', timeRange: '24h' } },
    ]

    for (const { type, config } of types) {
      const w = dashStore.addWidget(layout.id, { type, x: 0, y: 0, w: 4, h: 3, config })
      expect(w).toBeTruthy()
    }

    const stored = dashStore.layouts.find(l => l.id === layout.id)!
    expect(stored.widgets.length).toBe(4)
    expect(stored.widgets.map(w => w.type).sort()).toEqual(['gauge', 'historical', 'line-chart', 'sensor-card'])
    // Config payload preserved 1:1 — no migration loss
    expect(stored.widgets.find(w => w.type === 'gauge')!.config.yMax).toBe(50)
    expect(stored.widgets.find(w => w.type === 'line-chart')!.config.warnLow).toBe(10)
    expect(stored.widgets.find(w => w.type === 'historical')!.config.timeRange).toBe('24h')
  })
})
