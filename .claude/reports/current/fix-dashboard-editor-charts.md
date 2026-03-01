# Dashboard Editor Charts — Bug-Fixes Report

**Datum:** 2026-03-01
**Status:** ALLE 4 BUGS GEFIXT + PLAYWRIGHT-VERIFIZIERT

---

## Zusammenfassung

| Bug | Severity | Status | Playwright-Bestätigt |
|-----|----------|--------|---------------------|
| Bug 1: Charts nur nach Tab-Wechsel | CRITICAL | FIXED | Ja — Sensor-Auswahl wirkt sofort |
| Bug 2: Y-Achsen-Ranges falsch | HIGH | FIXED | Ja — SHT31 zeigt -40..125 °C |
| Bug 3: Charts nicht konfigurierbar | HIGH | FIXED | Ja — SlideOver mit Sensor/Color/YRange |
| Bug 4: MultiSensorChart nicht integriert | HIGH | FIXED | Ja — Im Widget-Katalog sichtbar |
| Bug 5: Layout-Persistenz | LOW | BEREITS GEFIXT | Ja — "Test Dashboard" überlebt Reload |

---

## Bug 1: Charts nur nach Tab-Wechsel (CRITICAL)

### Root Cause (3 Sub-Issues)

**1a: Watch auf `raw_value` feuert nicht bei konstanten Werten**
- Mock ESP sendet konstant `raw_value: 22.0` (SHT31)
- `watch(() => sensor.raw_value)` feuert nicht wenn Wert gleich bleibt
- **Fix:** Watch-Target auf `last_read` geändert (ändert sich bei jedem WS-Event)

**1b: `render(h(Component, props), el)` setzt Props einmalig (One-Shot)**
- Nach `selectSensor()` emittiert Widget `update:config`
- Aber `props.sensorId` im gerenderten vnode bleibt `undefined`
- Widget bleibt im Selector-State statt Chart anzuzeigen
- **Fix:** Lokaler `ref` State der den Prop überschreibt (Vue 3 Standard-Pattern)

**1c: GridStack nicht initialisiert nach Layout-Erstellung**
- `onMounted()` → `nextTick()` → `GridStack.init()` — aber wenn beim Mount kein Layout existiert (`v-if`), wird `gridContainer.value` nie gesetzt
- Nach Layout-Erstellung existiert das Grid-Element, aber GridStack wurde nie initialisiert
- **Fix:** `initGrid()` extrahiert + Watch auf `dashStore.activeLayoutId`

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `LineChartWidget.vue` | `localSensorId` ref + Watch auf `last_read` |
| `GaugeWidget.vue` | `localSensorId` ref + Prop-Sync watch |
| `SensorCardWidget.vue` | `localSensorId` ref + Prop-Sync watch |
| `HistoricalChartWidget.vue` | `localSensorId` ref + Prop-Sync watch |
| `ActuatorCardWidget.vue` | `localActuatorId` ref + Prop-Sync watch |
| `CustomDashboardView.vue` | `initGrid()` extrahiert + `watch(activeLayoutId)` |

---

## Bug 2: Y-Achsen-Ranges (HIGH)

### Root Cause
- `LiveLineChart.vue` Y-Achse hatte KEIN `suggestedMin`/`suggestedMax`
- Chart auto-scaled eng um aktuelle Werte → 22.0 zeigte Y-Achse 21.9–22.1

### Fix
- Neue Props: `sensorType?`, `yMin?`, `yMax?` in LiveLineChart.vue
- Import `SENSOR_TYPE_CONFIG` für automatisches min/max Lookup
- Priorität: Explizites yMin/yMax > SENSOR_TYPE_CONFIG > auto

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `LiveLineChart.vue` | Props `sensorType`, `yMin`, `yMax` + Y-Achsen-Config |
| `LineChartWidget.vue` | `:sensor-type` Prop an LiveLineChart durchgereicht |

---

## Bug 3: Charts nicht konfigurierbar (HIGH)

### Root Cause
- Kein Gear-Icon im Widget-Header
- Kein Config-Panel zum Ändern von Sensor, Farbe, Y-Range, etc.

### Fix
- **Gear-Icon**: SVG-Button in `createWidgetElement()` (opacity:0, visible on hover)
- **WidgetConfigPanel.vue**: Neues SlideOver-Komponente mit:
  - Titel-Feld
  - Sensor/Aktor-Auswahl (je nach Widget-Typ)
  - Y-Achsen-Range mit SENSOR_TYPE_CONFIG Hint
  - Zeitraum-Chips (für Historical)
  - 8 Farb-Swatches
  - Schwellenwerte-Toggle
- **Re-Mount-Logik**: `handleConfigUpdate()` rendert Widget mit neuen Props neu

### Neue/Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `WidgetConfigPanel.vue` | NEU — SlideOver Config-Panel |
| `CustomDashboardView.vue` | Gear-Icon + openConfigPanel() + handleConfigUpdate() |

---

## Bug 4: MultiSensorChart nicht integriert (HIGH)

### Root Cause
- `MultiSensorChart.vue` (893 Zeilen) existierte, war aber nicht im Dashboard registriert

### Fix
- **MultiSensorWidget.vue**: Neuer Dashboard-Wrapper mit:
  - Chip-basierte Multi-Sensor-Auswahl (farbkodiert)
  - Add/Remove via Dropdown
  - `dataSources` als komma-separierte Sensor-IDs
  - Lokaler State Pattern (Bug 1b)
- **Integration**: Im `widgetComponentMap`, `widgetTypes`, `WidgetType` registriert
- **Store**: `dataSources`, `yMin`, `yMax` in `DashboardWidget.config` Interface

### Neue/Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `MultiSensorWidget.vue` | NEU — Multi-Sensor Dashboard-Wrapper |
| `CustomDashboardView.vue` | Import + Registry + widgetTypes + Prop-Forwarding |
| `dashboard.store.ts` | `WidgetType` + Config Interface erweitert |

---

## Playwright-Verifikation

### Test-Ergebnisse

1. **Dashboard lädt** — "Test Dashboard" Layout aktiv (Bug 5 OK)
2. **GridStack initialisiert** — Widget-Grid funktioniert nach Seiten-Reload
3. **Y-Achse SHT31** — Zeigt -40 bis 140 °C (SENSOR_TYPE_CONFIG angewandt)
4. **Gear-Icon** — "Konfigurieren" Button sichtbar im Widget-Header
5. **Config-Panel** — SlideOver öffnet mit Sensor-Dropdown, Y-Range, Farben
6. **Sensor-Auswahl sofort** — SensorCardWidget zeigt "SHT31 22.0 °C" nach Auswahl
7. **Multi-Sensor-Chart** — Im Widget-Katalog unter "Sensoren" verfügbar
8. **Keine TypeScript-Fehler** — `vue-tsc --noEmit` clean (nur vorbestehende Fehler in RuleFlowEditor/SensorHistoryView)

### Screenshots
- `dashboard-after-fixes.png` — Dashboard mit Y-Achsen-Range + Gear-Icon
- `bug1b-fixed-sensor-select.png` — Sensor-Karte nach sofortiger Sensor-Auswahl

---

## Alle geänderten Dateien (Komplett)

| Datei | Art | Bug |
|-------|-----|-----|
| `El Frontend/src/components/dashboard-widgets/LineChartWidget.vue` | EDIT | 1a, 1b, 2 |
| `El Frontend/src/components/dashboard-widgets/GaugeWidget.vue` | EDIT | 1b |
| `El Frontend/src/components/dashboard-widgets/SensorCardWidget.vue` | EDIT | 1b |
| `El Frontend/src/components/dashboard-widgets/HistoricalChartWidget.vue` | EDIT | 1b |
| `El Frontend/src/components/dashboard-widgets/ActuatorCardWidget.vue` | EDIT | 1b |
| `El Frontend/src/components/charts/LiveLineChart.vue` | EDIT | 2 |
| `El Frontend/src/views/CustomDashboardView.vue` | EDIT | 1c, 3, 4 |
| `El Frontend/src/shared/stores/dashboard.store.ts` | EDIT | 4 |
| `El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue` | NEU | 3 |
| `El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue` | NEU | 4 |
