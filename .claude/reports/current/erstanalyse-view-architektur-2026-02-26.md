# Erstanalyse: View-Architektur AutomationOne Frontend

> **Datum:** 2026-02-26
> **Agent:** Cursor Cloud Agent
> **Branch:** `cursor/development-environment-setup-49c6`

## Executive Summary

Das Frontend nutzt eine **3-Ebenen-Zoom-Navigation** (Zone-Tiles → Zone-Detail → ESP-Orbital) mit route-basiertem State (`/hardware/:zoneId/:espId`). Die Architektur ist funktional stabil, hat aber **~2045 Zeilen Dead Code** (bereits entfernt in diesem Commit), **ein isoliertes Monitor-2-Level-System**, und einen **Dashboard-Builder ohne Gallery/View-Mode**. Die Navigation wurde umbenannt: Sidebar "Dashboard", Tabs [Übersicht] [Monitor] [Editor]. `useZoomNavigation.ts` existiert nicht — die Navigation ist direkt in `HardwareView.vue` implementiert.

---

## 1. Ebenen-System (B2.1)

### Level 1: Zone-Übersicht

| Eigenschaft | Wert |
|-------------|------|
| **View-Komponente** | `HardwareView.vue` (690 Z.) |
| **Route** | `/hardware` |
| **Rendering-Komponente** | `ZonePlate.vue` (637 Z.) — je eine Instanz pro Zone |
| **Daten** | `useEspStore()` → `groupDevicesByZone()` Composable |
| **Aktionen** | Zone anklicken → Level 2, Mock-ESP erstellen, Drag&Drop (Zone-Zuweisung) |

### Level 2: Zone-Detail (ESP-Liste)

| Eigenschaft | Wert |
|-------------|------|
| **View-Komponente** | `HardwareView.vue` (gleiche View, bedingtes Rendering) |
| **Route** | `/hardware/:zoneId` |
| **Rendering-Komponente** | `ZoneDetailView.vue` (348 Z.) |
| **Daten** | Gefilterte ESP-Liste aus `espStore` nach `zoneId` |
| **Aktionen** | ESP anklicken → Level 3, Zurück → Level 1 |

### Level 3: ESP-Detail (Orbital)

| Eigenschaft | Wert |
|-------------|------|
| **View-Komponente** | `HardwareView.vue` (gleiche View) |
| **Route** | `/hardware/:zoneId/:espId` |
| **Rendering-Komponente** | `ESPOrbitalLayout.vue` (636 Z., intern "ESPHorizontalLayout") via `DeviceDetailView.vue` |
| **Daten** | Einzelnes ESP-Device aus `espStore`, Sensoren + Aktoren |
| **Aktionen** | SensorConfig, ActuatorConfig, AddSensor, AddActuator, ESPSettings |

### Navigation-Mechanismus

```typescript
// HardwareView.vue:61-65 — Route-basiert, kein Composable
const currentLevel = computed<1 | 2 | 3>(() => {
  if (route.params.espId) return 3
  if (route.params.zoneId) return 2
  return 1
})
```

- **URL-Sync:** Vollständig via Vue Router. Browser-Back/Forward funktioniert korrekt.
- **State-Persistenz:** Voll persistent bei Browser-Refresh (URL enthält alle State-Infos).
- **`useZoomNavigation.ts`:** Existiert **NICHT**. Alle Referenzen im Auftrag sind inkorrekt.

---

## 2. Monitor-Komponenten (B2.2)

### Aktive Komponenten

| Komponente | Zeilen | Route | Zweck |
|-----------|--------|-------|-------|
| `MonitorView.vue` | 986 | `/monitor`, `/monitor/:zoneId` | Operationales Monitoring: Sensoren/Aktoren nach Zone gruppiert, Live-Werte, Sparklines, Inline-Charts |
| `SensorsView.vue` | 1639 | `/sensors` | CRUD-Management: Sensor-Liste, Konfiguration, Kalibrierung, Emergency-Stop |

### Dead Code (ENTFERNT)

| Komponente | Zeilen | Status |
|-----------|--------|--------|
| `ZoneMonitorView.vue` | 634 | **Gelöscht** — 0 Imports, nie integriert |

### MonitorView eigenes 2-Level-System

MonitorView hat ein **eigenständiges 2-Level-System**:
- **Level 1** (`/monitor`): Zone-Tiles mit KPI-Aggregation (Sensor-Anzahl, Warnungen)
- **Level 2** (`/monitor/:zoneId`): Sensor/Actuator-Cards mit Live-Daten, Sparklines, Inline-Charts

Dies ist **unabhängig** vom Hardware-View-Ebenen-System. Die Stores (`useEspStore`) werden geteilt, aber die Navigation ist vollständig separat.

### SensorsView Aufteilung (geschätzt)

| Anteil | Zeilen (ca.) | Typ |
|--------|-------------|-----|
| Monitoring (Read-Only) | ~500 Z. | Live-Werte, Quality-Badges, Status-Anzeige |
| CRUD/Management | ~800 Z. | Sensor-Config, Kalibrierung, Add/Edit/Delete |
| Layout/Infrastruktur | ~340 Z. | Template, Styles, Filter, Tab-Logic |

---

## 3. Dashboard-Builder (B2.3)

### CustomDashboardView.vue (791 Zeilen)

| Eigenschaft | Wert |
|-------------|------|
| **Route** | `/custom-dashboard` |
| **Grid-System** | GridStack.js, 12-Spalten-Layout |
| **Speicherung** | `localStorage` via `useDashboardStore` (Pinia) |
| **Widget-Typen** | 8 Typen in 3 Kategorien |
| **Edit/View-Mode** | Nur Edit-Mode (GridStack immer `static: false`) |
| **Gallery** | Keine — Dashboard-Dropdown zum Wechseln |

### Widget-Registry

| Widget | Komponente | Datenquelle |
|--------|-----------|-------------|
| Linien-Chart | `LineChartWidget.vue` | ESP Sensor-Live-Daten |
| Gauge-Chart | `GaugeWidget.vue` | ESP Sensor-Live-Daten |
| Sensor-Karte | `SensorCardWidget.vue` | ESP Sensor-Config + Wert |
| Historische Zeitreihe | `HistoricalChartWidget.vue` | Sensor-History API |
| Aktor-Status | `ActuatorCardWidget.vue` | ESP Actuator-State |
| Aktor-Laufzeit | `ActuatorRuntimeWidget.vue` | ESP Actuator-History |
| ESP-Health | `ESPHealthWidget.vue` | ESP Device-State |
| Alarm-Liste | `AlarmListWidget.vue` | System Events |

### Dashboard-Datenmodell (localStorage)

```typescript
// dashboard.store.ts
interface DashboardLayout {
  id: string
  name: string
  widgets: WidgetConfig[]  // position, size, type, config
}
```

---

## 4. Routing + Navigation (B2.4)

### Vollständige Route-Map

| Route | View | Einbindung | Status |
|-------|------|-----------|--------|
| `/` | Redirect → `/hardware` | — | Aktiv |
| `/hardware` | `HardwareView.vue` | Sidebar "Dashboard" / Tab "Übersicht" | Aktiv |
| `/hardware/:zoneId` | `HardwareView.vue` | Level 2 Navigation | Aktiv |
| `/hardware/:zoneId/:espId` | `HardwareView.vue` | Level 3 Navigation | Aktiv |
| `/monitor` | `MonitorView.vue` | Tab "Monitor" | Aktiv |
| `/monitor/:zoneId` | `MonitorView.vue` | Monitor Level 2 | Aktiv |
| `/custom-dashboard` | `CustomDashboardView.vue` | Tab "Editor" | Aktiv |
| `/logic` | `LogicView.vue` | Sidebar "Regeln" | Aktiv |
| `/sensors` | `SensorsView.vue` | Sidebar "Komponenten" | Aktiv |
| `/sensor-history` | `SensorHistoryView.vue` | Sidebar "Zeitreihen" | Aktiv |
| `/system-monitor` | `SystemMonitorView.vue` | Sidebar "System" (Admin) | Aktiv |
| `/users` | `UserManagementView.vue` | Sidebar "Benutzer" (Admin) | Aktiv |
| `/settings` | `SettingsView.vue` | Sidebar "Einstellungen" | Aktiv |
| `/maintenance` | `MaintenanceView.vue` | Sidebar "Wartung" (Admin) | Aktiv |
| `/calibration` | `CalibrationView.vue` | Sidebar "Kalibrierung" (Admin) | Aktiv |
| `/system-config` | `SystemConfigView.vue` | Sidebar (Admin) | Aktiv |
| `/load-test` | `LoadTestView.vue` | Admin-only | Aktiv |
| `/login` | `LoginView.vue` | Public | Aktiv |
| `/setup` | `SetupView.vue` | Public (Initial) | Aktiv |
| `/dashboard-legacy` | Redirect → `/hardware` | — | Deprecated |
| `/devices` | Redirect → `/hardware` | — | Deprecated |
| `/database` | Redirect → `/system-monitor?tab=database` | — | Deprecated |
| `/logs` | Redirect → `/system-monitor?tab=logs` | — | Deprecated |
| `/audit` | Redirect → `/system-monitor?tab=events` | — | Deprecated |
| `/mqtt-log` | Redirect → `/system-monitor?tab=mqtt` | — | Deprecated |
| `/actuators` | Redirect → `/sensors?tab=actuators` | — | Deprecated |
| `/:pathMatch(.*)*` | Redirect → `/hardware` | Catch-all | Aktiv |

### Navigation Guards

- **Auth Guard** (`beforeEach`): Alle Routes mit `requiresAuth: true` prüfen auf `isAuthenticated`
- **Admin Guard**: Routes mit `requiresAdmin: true` prüfen auf `isAdmin`
- **Setup Guard**: Redirect zu `/setup` wenn `setupRequired === true`
- **Keine `beforeEnter` Guards** auf individuellen Routes

### Lazy Loading

Alle Views nutzen `() => import()` für Code-Splitting. Build erzeugt separate Chunks:
- `HardwareView` (229 KB)
- `MonitorView` (nicht separat gelistet — in index.js oder eigener Chunk)
- `CustomDashboardView` (109 KB)
- `SystemMonitorView` (200 KB)
- `LogicView` (265 KB)

---

## 5. Redundanz-Inventar (B2.5)

### Bestätigte Dead-Code-Redundanzen (ENTFERNT)

| Komponente | Zeilen | Ersetzt durch | Status |
|-----------|--------|--------------|--------|
| `SensorSidebar.vue` | 574 | `ComponentSidebar.vue` (431 Z.) | **Gelöscht** |
| `ActuatorSidebar.vue` | 519 | `ComponentSidebar.vue` (431 Z.) | **Gelöscht** |
| `ZoneMonitorView.vue` | 634 | `MonitorView.vue` (986 Z.) | **Gelöscht** |
| `ZoomBreadcrumb.vue` | 122 | TopBar Breadcrumbs | **Gelöscht** |
| `LevelNavigation.vue` | 125 | `ViewTabBar.vue` (128 Z.) | **Gelöscht** |
| `LevelNavigation.test.ts` | 77 | — | **Gelöscht** |
| **Total entfernt** | **2051** | | |

### Verbleibende Redundanzen

| Redundanz | Bewertung |
|-----------|-----------|
| `ZoneDetailView.vue` (348 Z.) ↔ `ZonePlate.vue` (637 Z.) | Kein Dead Code — ZoneDetailView rendert Level 2 ESP-Liste, ZonePlate rendert Level 1 Zone-Tiles. Verschiedene Zwecke. Bei D2-Umbau (Level 1+2 zusammenführen) wird ZoneDetailView in ZonePlate integriert. |
| `DashboardView.vue` | Existiert **NICHT** — bereits in HardwareView extrahiert (nur `/dashboard-legacy` Redirect) |
| MonitorView vs. SensorsView Monitoring-Teile | Teilweise redundant (Live-Werte-Anzeige). MonitorView = operationales Monitoring, SensorsView = CRUD+Management. Saubere Trennung durch verschiedene Zielgruppen. |

### Store-Redundanzen

| Store | Genutzt von | Doppelte API-Calls? |
|-------|------------|---------------------|
| `useEspStore` | HardwareView, MonitorView, SensorsView, CustomDashboardView | Nein — Singleton-Store, einmal geladen, WebSocket-Updates |
| `useDashboardStore` | HardwareView, CustomDashboardView | Nein — verschiedene Features (Layout vs. Dashboard-Config) |

---

## 6. Komponentenabhängigkeits-Graph (B2.6)

### HardwareView.vue (690 Z.)

```
HardwareView.vue
├── ViewTabBar.vue (128 Z.)
├── ZonePlate.vue (637 Z.)                    ← Level 1
│   └── DeviceMiniCard (inline)
├── ZoneDetailView.vue (348 Z.)               ← Level 2
│   └── ESP-Cards (inline)
├── DeviceDetailView.vue                       ← Level 3
│   └── ESPOrbitalLayout.vue (636 Z.)
│       ├── SensorConfigPanel.vue
│       └── ActuatorConfigPanel.vue
├── ComponentSidebar.vue (431 Z.)
├── UnassignedDropBar.vue
├── PendingDevicesPanel.vue
├── CreateMockEspModal.vue
├── ESPSettingsSheet.vue
├── ESPConfigPanel.vue
├── SlideOver.vue
├── SensorConfigPanel.vue (via SlideOver)
├── ActuatorConfigPanel.vue (via SlideOver)
└── Composables: useZoneDragDrop, useKeyboardShortcuts, useSwipeNavigation
```

### MonitorView.vue (986 Z.)

```
MonitorView.vue
├── ViewTabBar.vue (128 Z.)
├── Zone-Tiles (Level 1, inline template)
├── Sensor/Actuator Cards (Level 2, inline template)
├── LiveLineChart.vue
├── HistoricalChart.vue
├── GaugeChart.vue
├── SlideOver.vue
├── SensorConfigPanel.vue
└── ActuatorConfigPanel.vue
```

### CustomDashboardView.vue (791 Z.)

```
CustomDashboardView.vue
├── ViewTabBar.vue (128 Z.)
├── GridStack.js (external)
├── LineChartWidget.vue
├── GaugeWidget.vue
├── SensorCardWidget.vue
├── ActuatorCardWidget.vue
├── HistoricalChartWidget.vue
├── ESPHealthWidget.vue
├── AlarmListWidget.vue
├── ActuatorRuntimeWidget.vue
└── useDashboardStore (Layout-Persistenz)
```

### SensorsView.vue (1639 Z.)

```
SensorsView.vue
├── Sensor-Liste (Tab: Sensoren)
├── Actuator-Liste (Tab: Aktoren)
├── Filter/Suche
├── Kalibrierungs-Dialoge
├── Emergency-Stop-Button
├── ComponentCard.vue (via import)
└── useEspStore
```

---

## 7. Vorschläge (B3)

### 7.1 Tab-Benennung

**Empfehlung (umgesetzt):** `[Übersicht] [Monitor] [Editor]`

| Tab | Begründung |
|-----|-----------|
| **Übersicht** | Level 1 zeigt alle Zonen als Tiles — eine topologische Übersicht |
| **Monitor** | Passt bereits. Operationales Sensor/Aktor-Monitoring |
| **Editor** | Im Kontext des Sidebar-Eintrags "Dashboard" eindeutig als Dashboard-Builder erkennbar |

### 7.2 Monitor-Integration

**Empfehlung: Option A — Monitor als eigenen Tab beibehalten.**

MonitorView hat ein eigenes 2-Level-System (`/monitor`, `/monitor/:zoneId`). Eine Verschmelzung mit dem Hardware-View-Ebenen-System wäre ein State-Management-Alptraum. Die Systeme haben verschiedene Zwecke:
- Hardware/Übersicht = **WO** sind Geräte (Topologie)
- Monitor = **WAS** zeigen Sensoren (Daten)

### 7.3 Dashboard-Gallery

**Empfehlung: Gallery als Default-Ansicht innerhalb des Editor-Tabs.**

`CustomDashboardView.vue` bekommt einen `showGallery`-State. Bei Entry: Gallery mit Dashboard-Kacheln. Klick → Editor öffnet sich. Kein neuer View, kein Route-Umbau. ~2h Aufwand.

### 7.4 Quick-Wins

| Quick-Win | Aufwand | Status |
|-----------|---------|--------|
| Dead-Code-Cleanup (6 Dateien, -2051 Z.) | ~45 min | **ERLEDIGT** ✅ |
| Tab-Umbenennung [Übersicht] [Monitor] [Editor] | ~30 min | **ERLEDIGT** ✅ |
| Sidebar-Umbenennung "Hardware" → "Dashboard" | ~15 min | **ERLEDIGT** ✅ |
| Deprecated-Route-Cleanup (7 Redirects) | ~30 min | Offen |

---

## Anhang: Rohdaten

### Zeilenzahlen (verifiziert)

| Datei | Zeilen |
|-------|--------|
| `HardwareView.vue` | 690 |
| `MonitorView.vue` | 986 |
| `CustomDashboardView.vue` | 791 |
| `SensorsView.vue` | 1639 |
| `ZonePlate.vue` | 637 |
| `ZoneDetailView.vue` | 348 |
| `ESPOrbitalLayout.vue` | 636 |
| `ComponentSidebar.vue` | 431 |
| `ViewTabBar.vue` | 128 |
| `Sidebar.vue` | 431 |
| `router/index.ts` | 247 |

### Entfernter Dead Code

| Datei | Zeilen |
|-------|--------|
| `SensorSidebar.vue` | 574 |
| `ActuatorSidebar.vue` | 519 |
| `ZoneMonitorView.vue` | 634 |
| `ZoomBreadcrumb.vue` | 122 |
| `LevelNavigation.vue` | 125 |
| `LevelNavigation.test.ts` | 77 |
| **Total** | **2051** |
