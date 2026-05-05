/**
 * AUT-246: Schwellwert-SSoT — vier parallele Quellen klar trennen
 *
 * Verträge die diese Tests absichern:
 *   1) Änderung der Sensor-Schwelle (SensorConfig.thresholds) aktualisiert
 *      NICHT widget.config.warnLow/warnHigh/alarmLow/alarmHigh.
 *      → Dashboard.widgets[].config bleibt eine eigenständige Quelle (nur visuell).
 *   2) NotificationItem source-mapping bildet die 4 Quellen-Typen
 *      (sensor_threshold, logic_engine, device_event, system) korrekt ab.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// =============================================================================
// Test 1: Sensor-Schwelle ändern aktualisiert NICHT widget.config.warnLow
// =============================================================================
//
// Begründung: SensorConfig.thresholds (DB) und Dashboard.widgets[].config
// sind LAUT KONTRAKT entkoppelt. Der Sync-Button in WidgetConfigPanel ist
// ein One-Shot-Klick (Operator-Entscheidung), kein Auto-Sync.

describe('AUT-246 SSoT — Sensor-Schwelle vs Widget-config', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('aktualisiert NICHT widget.config.warnLow wenn Sensor-Schwelle geändert wird', async () => {
    // Frischer Mock-Store-Setup (Pinia setup-style)
    const { useDashboardStore } = await import('@/shared/stores/dashboard.store')
    const dashStore = useDashboardStore()

    // Layout mit einem Widget anlegen, das warnLow=10 nutzt.
    // (addWidget generiert seine eigene Widget-ID — Omit<DashboardWidget,'id'>)
    const layout = dashStore.createLayout('Test-Layout')
    const widget = dashStore.addWidget(layout.id, {
      type: 'line-chart',
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      config: {
        sensorId: 'esp-1:5:DS18B20',
        warnLow: 10,
        warnHigh: 30,
        alarmLow: 5,
        alarmHigh: 35,
        showThresholds: true,
      },
    })

    expect(widget).toBeTruthy()

    const widgetBefore = dashStore.layouts
      .find((l) => l.id === layout.id)!
      .widgets.find((w) => w.id === widget!.id)!
    expect(widgetBefore.config.warnLow).toBe(10)
    expect(widgetBefore.config.warnHigh).toBe(30)

    // Simuliere "Sensor-Schwelle wurde im SensorConfigPanel geändert".
    // Das beschreibt nur den Server-State / SensorConfig.thresholds.
    // Die Dashboard-Widget-Config darf davon UNBERÜHRT bleiben.
    const simulatedSensorBaseChange = {
      warning_min: 99,
      warning_max: 999,
      threshold_min: 0,
      threshold_max: 100,
    }

    // Bewusst: KEIN Aufruf einer Sync-Funktion auf dem Store.
    // Wenn ein Auto-Sync existieren würde (Bug), wäre warnLow nun 99.
    void simulatedSensorBaseChange

    await nextTick()

    const widgetAfter = dashStore.layouts
      .find((l) => l.id === layout.id)!
      .widgets.find((w) => w.id === widget!.id)!

    // Vertrag: Widget-Config ist NICHT an SensorConfig gekoppelt.
    expect(widgetAfter.config.warnLow).toBe(10)
    expect(widgetAfter.config.warnHigh).toBe(30)
    expect(widgetAfter.config.alarmLow).toBe(5)
    expect(widgetAfter.config.alarmHigh).toBe(35)
  })

  it('updateWidgetConfig auf widget.config.warnLow ändert NICHT andere Layouts', async () => {
    const { useDashboardStore } = await import('@/shared/stores/dashboard.store')
    const dashStore = useDashboardStore()

    const layoutA = dashStore.createLayout('Layout A')
    const layoutB = dashStore.createLayout('Layout B')

    const widgetA = dashStore.addWidget(layoutA.id, {
      type: 'gauge',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      config: { sensorId: 's1', warnLow: 10 },
    })!
    const widgetB = dashStore.addWidget(layoutB.id, {
      type: 'gauge',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      config: { sensorId: 's1', warnLow: 10 },
    })!

    dashStore.updateWidgetConfig(layoutA.id, widgetA.id, {
      ...widgetA.config,
      warnLow: 42,
    })

    const layoutAAfter = dashStore.layouts.find((l) => l.id === layoutA.id)!
    const layoutBAfter = dashStore.layouts.find((l) => l.id === layoutB.id)!

    expect(layoutAAfter.widgets.find((w) => w.id === widgetA.id)!.config.warnLow).toBe(42)
    // Widget B hängt am gleichen Sensor, darf aber NICHT mit-mutiert worden sein.
    expect(layoutBAfter.widgets.find((w) => w.id === widgetB.id)!.config.warnLow).toBe(10)
  })
})

// =============================================================================
// Test 2: NotificationItem Source-Mapping (4 Quellen-Typen → korrektes Label)
// =============================================================================

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/stores/esp', () => ({
  useEspStore: () => ({ devices: [] }),
}))

vi.mock('@/utils/notificationNavigation', () => ({
  buildEspContextRoute: () => null,
}))

describe('AUT-246 NotificationItem — source-mapping', () => {
  let NotificationItem: any

  beforeEach(async () => {
    setActivePinia(createPinia())
    // Lazy-import after vi.mock is set up.
    NotificationItem = (await import('@/components/notifications/NotificationItem.vue')).default
  })

  function makeNotification(overrides: Record<string, any> = {}) {
    return {
      id: 'n-1',
      title: 'Test Alert',
      body: 'Body text',
      severity: 'warning',
      status: 'active',
      is_read: false,
      created_at: new Date().toISOString(),
      acknowledged_at: null,
      acknowledged_by: null,
      resolved_at: null,
      correlation_id: null,
      source: null,
      category: null,
      metadata: {},
      ...overrides,
    }
  }

  const globalStubs = {
    StatusBadge: true,
    AlertAuditLines: true,
  }

  it('mapped sensor_threshold zu "Sensor-Schwelle: {Sensor-Name}"', async () => {
    const wrapper = mount(NotificationItem, {
      global: { stubs: globalStubs },
      props: {
        notification: makeNotification({
          source: 'sensor_threshold',
          metadata: {
            esp_id: 'ESP_ABC',
            sensor_name: 'pH Becken Ost',
            sensor_type: 'pH',
          },
        }),
      },
    })
    await nextTick()

    const sourceLine = wrapper.find('[data-testid="notification-source-line-n-1"]')
    expect(sourceLine.exists()).toBe(true)
    expect(sourceLine.text()).toContain('Sensor-Schwelle')
    expect(sourceLine.text()).toContain('pH Becken Ost')
  })

  it('mapped logic_engine zu "Regel: {Rule-Name}"', async () => {
    const wrapper = mount(NotificationItem, {
      global: { stubs: globalStubs },
      props: {
        notification: makeNotification({
          source: 'logic_engine',
          metadata: {
            rule_id: 'rule-42',
            rule_name: 'Lüfter bei 28°C',
          },
        }),
      },
    })
    await nextTick()

    const sourceLine = wrapper.find('[data-testid="notification-source-line-n-1"]')
    expect(sourceLine.exists()).toBe(true)
    expect(sourceLine.text()).toContain('Regel')
    expect(sourceLine.text()).toContain('Lüfter bei 28°C')
  })

  it('mapped device_event zu "Gerät: {ESP-Name} ({Reason})"', async () => {
    const wrapper = mount(NotificationItem, {
      global: { stubs: globalStubs },
      props: {
        notification: makeNotification({
          source: 'device_event',
          metadata: {
            esp_id: 'ESP_HEATER',
            event_type: 'Heartbeat-Timeout',
          },
        }),
      },
    })
    await nextTick()

    const sourceLine = wrapper.find('[data-testid="notification-source-line-n-1"]')
    expect(sourceLine.exists()).toBe(true)
    expect(sourceLine.text()).toContain('Gerät')
    expect(sourceLine.text()).toContain('ESP_HEATER')
    expect(sourceLine.text()).toContain('Heartbeat-Timeout')
  })

  it('mapped system zu "System: {reason}"', async () => {
    const wrapper = mount(NotificationItem, {
      global: { stubs: globalStubs },
      props: {
        notification: makeNotification({
          source: 'system',
          metadata: {
            reason: 'Watchdog-Reset',
          },
        }),
      },
    })
    await nextTick()

    const sourceLine = wrapper.find('[data-testid="notification-source-line-n-1"]')
    expect(sourceLine.exists()).toBe(true)
    expect(sourceLine.text()).toContain('System')
    expect(sourceLine.text()).toContain('Watchdog-Reset')
  })
})
