# AutomationOne – Frontend-Architektur (El Frontend)

> **Version:** 3.0 | **Stand:** 2026-02-23
> **Grundlage:** Vollständige Code-Analyse nach Dashboard-Merge (feature/frontend-consolidation)
> **Grundlage v2.0:** Vollständige Code-Analyse von `El Frontend/src/` (alle Dateien) + Detail-Audit (CSS, z-index, Duplikate, Overlays, Imports)
> **Referenzen:** auto-one_systemarchitektur.md (Schicht 3), WEBSOCKET_EVENTS, REST_ENDPOINTS
> **Übergeordnet:** `auto-one_systemarchitektur.md`

---

## 1. Überblick

El Frontend ist das Vue 3 Dashboard des AutomationOne IoT-Frameworks. Es implementiert das Kernprinzip: **das Frontend ist ein "Dumb Display Layer"** – der Server (El Servador) liefert bereits verarbeitete Daten, deutsche Fehlermeldungen und berechnete Severities. Das Frontend zeigt nur an, filtert und steuert.

### Kennzahlen

| Eigenschaft | Wert |
|-------------|------|
| **Framework** | Vue 3.5 + TypeScript (strict) |
| **Build** | Vite 6.2 |
| **State Management** | Pinia (13 Stores: 1 Legacy esp.ts + 12 Shared) |
| **Styling** | Tailwind CSS 3.4 + Scoped CSS + Design Tokens |
| **HTTP-Client** | Axios (mit JWT Token-Refresh-Interceptor) |
| **Echtzeit** | Native WebSocket (Singleton-Service, 28 Event-Typen) |
| **Icons** | Lucide Vue Next |
| **Charts** | Vue Flow (Logic Editor), Chart.js 4.5 (vue-chartjs), GridStack 12.4 (Custom Dashboard) |
| **Charting** | Chart.js 4.5 + vue-chartjs + chartjs-plugin-annotation + date-fns Adapter |
| **Grid Layout** | GridStack 12.4 (Custom Dashboard) |
| **Drag & Drop** | vue-draggable-plus 0.6 |
| **VueUse** | @vueuse/core 10.11 |
| **Port** | 5173 (Vite Dev), Docker-Container |
| **Pfad** | `El Frontend/src/` |

### Architektur-Prinzip

```
┌─────────────────────────────────────────────────────────┐
│  App.vue (Root)                                         │
│  ├── RouterView → Login / Setup / MainLayout            │
│  ├── ToastContainer (global)                            │
│  ├── ConfirmDialog (global)                             │
│  ├── ContextMenu (global)                               │
│  └── ErrorDetailsModal (global, via CustomEvent)        │
└─────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    Views (16)    Components (93)    Services/Stores
    (Seiten)      (UI-Bausteine)     (Daten + Logik)
```

---

## 2. Dateistruktur

```
El Frontend/src/
├── main.ts                              # Entry-Point: Pinia, Router, Global Error Handler
├── App.vue                              # Root: Auth-Init, globale Overlays
│
├── router/
│   └── index.ts                         # Vue Router: 16 Views, Navigation Guards, Redirects
│
├── views/                               # 16 Views (Seiten)
│   ├── MonitorView.vue                  # NEU: Sensor/Aktor-Daten nach Zonen (Default-Route)
│   ├── HardwareView.vue                 # NEU: ESP-Hardware-Topologie (3-Level-Zoom)
│   ├── CustomDashboardView.vue          # NEU: GridStack Widget-Builder
│   ├── CalibrationView.vue              # NEU: Sensor-Kalibrierungs-Wizard
│   ├── SensorHistoryView.vue            # NEU: Historische Zeitreihen (Chart.js)
│   ├── DashboardView.vue                # LEGACY: Altes Dashboard (unter /dashboard-legacy)
│   ├── LoginView.vue                    # Login mit Particle-Animations
│   ├── SetupView.vue                    # Ersteinrichtung Admin-Account
│   ├── LogicView.vue                    # Node-RED-inspirierter Rule-Editor
│   ├── SystemMonitorView.vue            # Konsolidierter System-Monitor
│   ├── SensorsView.vue                  # Sensor + Aktor-Übersicht
│   ├── MaintenanceView.vue              # Wartung + Cleanup-Konfiguration
│   ├── LoadTestView.vue                 # Last-Test-Tool für Mock-ESPs
│   ├── UserManagementView.vue           # Benutzerverwaltung CRUD
│   ├── SystemConfigView.vue             # Systemkonfiguration Key-Value
│   └── SettingsView.vue                 # Benutzer-Einstellungen + Logout
│
├── components/                          # 93 Komponenten in 13 Kategorien
│   ├── calibration/   (2)              # NEU: Kalibrierungs-Wizard
│   ├── charts/        (6 + index)      # Diagramm-Komponenten (erweitert: +HistoricalChart, +TimeRangeSelector)
│   ├── command/       (1)              # Command Palette
│   ├── common/        (1)              # Nur GrafanaPanelEmbed (Rest migriert)
│   ├── dashboard/     (10 + index)     # Dashboard-Level-Komponenten
│   ├── database/      (6)              # Database Explorer
│   ├── error/         (2)              # Error-Details + Troubleshooting
│   ├── esp/           (24 + index)     # ESP-Device-Verwaltung (erweitert: +ESPConfigPanel, +ZoneConfigPanel)
│   ├── filters/       (1 + index)      # Filter-Leisten
│   ├── forms/         (3 + index)      # Dynamische Formulare
│   ├── modals/        (2)              # Globale Modals
│   ├── rules/         (5)              # Logic-Rule-Editor
│   ├── safety/        (1)              # Emergency-Stop
│   ├── system-monitor/ (20 + index)    # System-Monitor-Tabs
│   └── zones/         (6)              # Zone-Verwaltung
│
├── shared/
│   ├── design/                          # Design System
│   │   ├── primitives/ (12 + index)    # +SlideOver, +QualityIndicator, +RangeSlider
│   │   ├── layout/     (3 + index)      # AppShell, Sidebar, TopBar
│   │   └── patterns/   (5 + index)      # ConfirmDialog, ContextMenu, Toast, ...
│   └── stores/         (12 + index)     # Shared Pinia Stores (kanonisch)
│
├── stores/             (1)              # Nur esp.ts (Legacy-Proxies entfernt)
├── composables/        (16 + index)     # +useScrollLock, +useCalibration
├── api/                (18 + index)     # +calibration.ts
├── services/
│   └── websocket.ts                     # WebSocket Singleton-Service
├── types/              (6 + index)      # TypeScript-Definitionen
├── utils/              (16 + index)     # Utility-Funktionen
├── config/             (2)              # sensor-schemas.ts, rule-templates.ts
└── styles/             (5)              # CSS-Dateien
```

**REMOVED directories (since v2.0):**
- `components/layout/` (3 files → migrated to shared/design/layout/)
- `components/widgets/` (5 files → replaced by CustomDashboardView + GridStack)
- `stores/auth.ts`, `stores/logic.ts`, `stores/database.ts`, `stores/dragState.ts` (4 Legacy-Proxies removed)
- `components/common/` deprecated wrappers (11 files removed, only GrafanaPanelEmbed remains)

---

## 3. Routing und Navigation

### 3.1 Route-Struktur

| Route | View | Auth | Admin | Beschreibung |
|-------|------|------|-------|-------------|
| `/login` | LoginView | Nein | – | JWT-Login |
| `/setup` | SetupView | Nein | – | Ersteinrichtung (Admin-Account erstellen) |
| `/` | – (Redirect) | – | – | Redirect → `/monitor` |
| `/monitor` | MonitorView | Ja | – | **NEU:** Sensor/Aktor-Daten nach Zonen (Default-Route) |
| `/monitor/:zoneId` | MonitorView | Ja | – | **NEU:** Zone-Detail mit Sensor-/Aktor-Karten |
| `/hardware` | HardwareView | Ja | – | **NEU:** ESP-Hardware-Topologie (Zoom-Navigation) |
| `/hardware/:zoneId` | HardwareView | Ja | – | **NEU:** Zone-Level ESP-Übersicht |
| `/hardware/:zoneId/:espId` | HardwareView | Ja | – | **NEU:** ESP-Detail mit Sensoren/Aktoren |
| `/custom-dashboard` | CustomDashboardView | Ja | – | **NEU:** Widget-Builder (GridStack) |
| `/calibration` | CalibrationView | Ja | Ja | **NEU:** Sensor-Kalibrierung (pH, EC) |
| `/sensor-history` | SensorHistoryView | Ja | – | **NEU:** Historische Zeitreihen (Chart.js) |
| `/dashboard-legacy` | DashboardView | Ja | – | **LEGACY:** Altes Dashboard |
| `/sensors` | SensorsView | Ja | – | Sensor- + Aktor-Übersicht (Tab: `?tab=actuators`) |
| `/logic` | LogicView | Ja | – | Automatisierungs-Editor |
| `/system-monitor` | SystemMonitorView | Ja | Ja | Events, Logs, DB, MQTT, Health (Tab: `?tab=`) |
| `/users` | UserManagementView | Ja | Ja | Benutzerverwaltung |
| `/system-config` | SystemConfigView | Ja | Ja | Systemkonfiguration |
| `/load-test` | LoadTestView | Ja | Ja | Last-Tests |
| `/maintenance` | MaintenanceView | Ja | Ja | Wartung + Cleanup |
| `/settings` | SettingsView | Ja | – | Benutzer-Einstellungen |

### 3.2 Deprecated Routes (Redirects)

| Alte Route | Redirect | Seit |
|-----------|----------|------|
| `/` | `/monitor` | 2026-02-23 |
| `/devices` | `/hardware` | 2026-02-23 (war: `/`) |
| `/devices/:espId` | `/hardware?openSettings={espId}` | 2026-02-23 |
| `/mock-esp` | `/hardware` | 2026-02-23 (war: `/`) |
| `/database` | `/system-monitor?tab=database` | 2026-01-23 |
| `/logs` | `/system-monitor?tab=logs` | 2026-01-23 |
| `/audit` | `/system-monitor?tab=events` | 2026-01-24 |
| `/mqtt-log` | `/system-monitor?tab=mqtt` | 2026-01-23 |
| `/actuators` | `/sensors?tab=actuators` | 2025-01-04 |

### 3.3 Navigation Guards

1. **Setup-Guard:** Wenn `setupRequired === true` → Redirect zu `/setup`
2. **Auth-Guard:** Wenn `requiresAuth` und nicht authentifiziert → Redirect zu `/login`
3. **Admin-Guard:** Wenn `requiresAdmin` und kein Admin → Redirect zu `/monitor`
4. **Post-Auth-Guard:** Authentifizierte User werden von `/login` und `/setup` nach `/monitor` weggeleitet

---

## 4. Views (16 Seiten)

### 4.1 MonitorView (NEU, Default-Route)

**Sensor-/Aktor-Daten-Ansicht nach Zonen.**

Route: `/monitor`, `/monitor/:zoneId`

| Level | Ansicht | Inhalt |
|-------|---------|--------|
| **1** | Zone KPI Tiles | Alle Zonen als Kacheln mit aggregierten KPIs (Sensor-/Aktor-Count, Alarme, Durchschnitts-Temperatur/-Feuchtigkeit) |
| **2** | Zone Detail | Einzelne Zone: Sensor-Karten + Aktor-Karten mit Live-Daten |

**Besonderheit:** Zeigt Daten nach Zonen (nicht nach ESPs). Operatives Monitoring für tägliche Kontrolle, Schwellwert-Überwachung, manuelle Aktor-Steuerung. Klick auf Sensor/Aktor öffnet SlideOver-Panel mit Konfiguration.

**Genutzte Stores:** `espStore`, `dashboardStore`
**Genutzte Composables:** `useZoneDragDrop`
**Neue Patterns:** `SlideOver` + `SensorConfigPanel` / `ActuatorConfigPanel`

### 4.2 HardwareView (NEU)

**ESP-Hardware-Topologie mit 3-Level-Zoom-Navigation.**

Route: `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId`

Erbt die Zoom-Navigation des alten DashboardView:

| Level | Ansicht | Komponente | Inhalt |
|-------|---------|-----------|--------|
| **1** | Zone Overview | `ZonePlate` (pro Zone) | Alle Zonen als Karten mit Device-Count, Status |
| **2** | Zone Detail | `ZoneDetailView` | Einzelne Zone mit ESPs |
| **3** | Device Detail | `DeviceDetailView` | ESP mit Orbital-Layout (Sensoren/Aktoren als Satelliten) |

**Besonderheit:** URL-basierte Navigation über Vue Router params (nicht mehr Query). Klick auf Sensor/Aktor öffnet SlideOver-Panel.

**Genutzte Stores:** `espStore`, `logicStore`, `uiStore`, `dashboardStore`
**Genutzte Composables:** `useZoneDragDrop`, `useKeyboardShortcuts`, `useSwipeNavigation`
**Neue Patterns:** `SlideOver` + `SensorConfigPanel` / `ActuatorConfigPanel` / `ESPConfigPanel`

### 4.3 CustomDashboardView (NEU)

**Dashboard-Builder mit GridStack.js.**

Route: `/custom-dashboard`

- GridStack.js 12-Spalten Layout-Grid
- Widget-Katalog-Sidebar (Drag to Add)
- Widget-Typen: Linien-Chart, Gauge, Sensor-Karte, Historische Zeitreihe, Aktor-Status, Aktor-Laufzeit, ESP-Health, Alarm-Liste
- Widget-Konfiguration inline
- Layout Save/Load via localStorage
- Mehrere benannte Layouts

**Genutzte Stores:** `dashboardStore`
**Dependencies:** `gridstack`

### 4.4 CalibrationView (NEU)

**Sensor-Kalibrierungs-Wizard.**

Route: `/calibration` (Admin-only)

Wrapper-View für `CalibrationWizard`-Komponente. Unterstützt pH (2-Punkt) und EC (1-/2-Punkt) Kalibrierung.

**Genutzte Composables:** `useCalibration`
**API:** `calibration.ts`

### 4.5 SensorHistoryView (NEU)

**Historische Sensor-Zeitreihen.**

Route: `/sensor-history`

- Chart.js Liniendiagramm mit Zeitachse
- Sensor-Picker (Multi-Select)
- Time-Range-Presets: 1h, 6h, 24h, 7d, Custom
- CSV-Export
- Echtzeit-Daten-Append via WebSocket

**Dependencies:** `chart.js`, `vue-chartjs`, `chartjs-adapter-date-fns`

### 4.6 DashboardView (LEGACY, ~955 Zeilen)

**LEGACY: Altes Haupt-Dashboard, jetzt unter `/dashboard-legacy`.** Die Funktionalität wurde auf HardwareView und MonitorView aufgeteilt.

| Level | Ansicht | Komponente | Inhalt |
|-------|---------|-----------|--------|
| **1** | Zone Overview | `ZonePlate` (pro Zone) | Alle Zonen als Karten mit Device-Count, Status |
| **2** | Zone Detail | `ZoneMonitorView` | Einzelne Zone mit Sensor-/Aktor-Live-Daten |
| **3** | Device Detail | `DeviceDetailView` | ESP mit Orbital-Layout (Sensoren/Aktoren als Satelliten) |

**Besonderheit:** Alle 3 Levels existieren gleichzeitig im DOM (`v-show`), verbunden durch CSS-Zoom-Transitions. Level-2 öffnet bei Klick auf ein Device den `ESPSettingsSheet` als Slide-In statt Level 3.

**Genutzte Composables:** `useZoomNavigation`, `useZoneDragDrop`, `useKeyboardShortcuts`, `useSwipeNavigation`

**Genutzte Stores:** `espStore`, `logicStore`, `uiStore`, `dashboardStore`

**Sub-Komponenten:** CreateMockEspModal, ESPSettingsSheet, ComponentSidebar, UnassignedDropBar, PendingDevicesPanel, ZonePlate, ZoneMonitorView, DeviceDetailView

### 4.7 LoginView (~695 Zeilen)

**Mission-Control-Login mit animiertem Design.**

- Ambient Particle Field (CSS-only)
- Logo Scanline Sweep + Breathe Glow
- Server-Telemetrie im Footer (Health-Status, Device-Count, Uptime)
- WebSocket-Status-Anzeige
- Success-Celebration-Animation nach Login
- Rein BEM-scoped CSS (kein Tailwind)

### 4.8 SetupView (~776 Zeilen)

**Ersteinrichtung: Admin-Account erstellen.**

- Visuell identisch mit LoginView (gleiche Aesthetic)
- Passwort-Stärke-Indikator (Gradient-Bar rot → gelb → irisierend)
- Requirement-Checks: 8 Zeichen, Groß-/Kleinbuchstabe, Zahl, Sonderzeichen
- Rein BEM-scoped CSS (kein Tailwind)

### 4.9 LogicView (~1.552 Zeilen)

**Node-RED-inspirierter visueller Automations-Editor.**

Layout:
```
┌──────────────────────────────────────────────────────────────┐
│ Toolbar: [← Back] [Rule ▼] [Name] [Desc] ... [Actions]      │
├──────────┬───────────────────────────┬───────────────────────┤
│ Node     │                           │ Config Panel          │
│ Palette  │     Vue Flow Canvas       │ (wenn Node selektiert)│
│          │                           │                       │
├──────────┴───────────────────────────┴───────────────────────┤
│ Execution History (ausklappbar, unten)                       │
└──────────────────────────────────────────────────────────────┘
```

- Drag-and-Drop-Node-Composition (Vue Flow)
- Rule-CRUD (Erstellen, Speichern, Löschen, Aktivieren/Deaktivieren)
- Test-Ausführung mit Live-Feedback
- Execution-History mit Zeitstempel und Ergebnis

### 4.10 SystemMonitorView (~2.466 Zeilen)

**Konsolidierter System-Monitor mit 5 Tabs.**

| Tab | Komponente | Inhalt |
|-----|-----------|--------|
| **Ereignisse** | `EventsTab` | Live WebSocket Events, Audit-Logs, Filter |
| **Server-Logs** | `ServerLogsTab` | God-Kaiser JSON-Logs |
| **Datenbank** | `DatabaseTab` | DB Explorer (Tabellen, Schema, Daten) |
| **MQTT** | `MqttTrafficTab` | MQTT-Traffic Live-Ansicht |
| **Health** | `HealthTab` | System-Health, ESP-Fleet-Status |

**Features:**
- `HealthSummaryBar` oben (immer sichtbar)
- `CleanupPanel` für Daten-Bereinigung
- URL-Sync für Deep-Linking (`?tab=events&esp=ESP_xxx`)
- Max 10.000 Events mit Virtual Scrolling (ab 200 Events)
- Event-Gruppierung nach Zeitfenster

### 4.11 SensorsView (~692 Zeilen)

**Kombinierte Sensor- und Aktor-Übersicht mit Tab-Navigation.**

- Tab "Sensoren": Alle Sensoren aller ESPs, Filter nach Typ, Qualität, ESP
- Tab "Aktoren": Alle Aktoren, Filter nach Status (on/off/emergency)
- `EmergencyStopButton` für globalen Notfall-Stop
- URL-Sync: `?tab=actuators`
- Visuelles Feedback bei Live-Updates (Highlight-Animation)

### 4.12 MaintenanceView (~529 Zeilen)

**Wartungs-Dashboard für System-Administration.**

- Service-Status (Running/Stopped, ESP-Count, Sensor-Count)
- Cleanup-Konfiguration (Retention, Auto-Cleanup)
- Manueller Cleanup-Trigger
- Cleanup-History (letzte Ausführungen)

### 4.13 LoadTestView (~389 Zeilen)

**Last-Test-Tool für Mock-ESP-Szenarien.**

- Bulk-Create: N Mock-ESPs mit Sensoren/Aktoren erstellen
- Simulation starten/stoppen (Intervall, Dauer)
- Live-Metriken-Dashboard (Auto-Refresh)
- Cleanup aller Last-Test-ESPs

### 4.14 UserManagementView (~566 Zeilen)

**Benutzerverwaltung mit vollständigem CRUD.**

- User-Liste mit Rollen-Badges (Admin, Operator, Viewer)
- Create/Edit/Delete User
- Passwort-Reset durch Admin
- Eigenes Passwort ändern

### 4.15 SystemConfigView (~286 Zeilen)

**Key-Value Systemkonfiguration.**

- Config-Einträge nach Typ gruppiert
- Inline-Editing
- Secret-Werte maskiert (Toggle zum Anzeigen)
- Typ-Filter

### 4.16 SettingsView (~112 Zeilen)

**Benutzer-Einstellungen.**

- User-Info (Username, Email, Rolle)
- API-URL-Anzeige
- Logout (einzeln oder alle Geräte)

---

## 5. Komponenten (93 Dateien)

### 5.1 Dashboard (13 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `ZonePlate.vue` | Zone-Karte (Level 1): Zeigt Zone-Name, Device-Count, Status-Indikatoren. Klick → Zoom zu Level 2 |
| `ZoneMonitorView` | (Siehe zones/) |
| `DeviceMiniCard.vue` | Kompakte ESP-Karte innerhalb einer ZonePlate: Status-LED, Name, Sensor-/Aktor-Count |
| `ZoomBreadcrumb.vue` | Breadcrumb-Navigation für Zoom-Levels: Zone Overview → Zone Detail → Device |
| `LevelNavigation.vue` | Navigations-Controls für Zoom-Level-Wechsel |
| `ActionBar.vue` | Aktionsleiste: Filter, Add-Buttons, Pending-Counter |
| `StatCard.vue` | Statistik-Karte: Einzelne Kennzahl (z.B. "12 Sensoren online") |
| `StatusPill.vue` | Status-Badge: Farbiger Pill (online/offline/warning/safemode) |
| `ComponentSidebar.vue` | Seitenpanel: Sensor-/Aktor-Typen zum Drag-and-Drop auf ESPs |
| `SensorSidebar.vue` | Spezifisches Seitenpanel für Sensor-Typ-Auswahl |
| `ActuatorSidebar.vue` | Spezifisches Seitenpanel für Aktor-Typ-Auswahl |
| `ComponentCard.vue` | Karte für einzelnen Sensor-/Aktor-Typ in der Sidebar |
| `UnassignedDropBar.vue` | Drop-Zone am unteren Rand: ESPs ohne Zone hierher ziehen |
| `CrossEspConnectionOverlay.vue` | SVG-Overlay: Zeichnet Verbindungslinien zwischen ESPs (Logic Rules) |

### 5.2 ESP (24 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `ESPCard.vue` | Standard ESP-Gerätekarte: Status, Name, Zone, Sensoren, Aktoren |
| `ESPOrbitalLayout.vue` | Orbital-Darstellung: ESP im Zentrum, Sensoren/Aktoren als Satelliten im Kreis |
| `ESPOrbitalLayout.css` | Zugehörige CSS-Animationen für Orbital-Darstellung |
| `ESPSettingsSheet.vue` | Slide-In-Panel: ESP-Konfiguration (Name, Zone, GPIO-Status, Sensor/Aktor-Verwaltung) |
| `ESPConfigPanel.vue` | ESP-Konfigurationspanel: Name, Zone, WiFi/MQTT-Status, GPIO-Pins, Emergency-Stop (SlideOver) |
| `ZoneConfigPanel.vue` | Zone-Konfigurationspanel: Name, Beschreibung, Subzonen, Statistiken (SlideOver) |
| `DeviceDetailView.vue` | Device-Detail (Level 3): Vollbild-Ansicht eines ESP mit Orbital-Layout |
| `DeviceHeaderBar.vue` | Header-Leiste eines ESP: Name (inline-editierbar), Status, WiFi-Signal, Actions |
| `PendingDevicesPanel.vue` | Panel für ausstehende Geräte-Genehmigungen: Approve/Reject-Actions |
| `SensorSatellite.vue` | Einzelner Sensor als Orbital-Satelliten-Element: Icon, Wert, Qualität |
| `ActuatorSatellite.vue` | Einzelner Aktor als Orbital-Satelliten-Element: Icon, Status, Toggle |
| `SensorValueCard.vue` | Detaillierte Sensor-Wert-Anzeige: Wert, Einheit, Qualität, Trend |
| `SensorColumn.vue` | Sensor-Spalte in Tabellenansicht |
| `ActuatorColumn.vue` | Aktor-Spalte in Tabellenansicht |
| `SensorConfigPanel.vue` | Sensor-Konfigurationsformular: Typ, GPIO, Intervall, Raw-Mode |
| `ActuatorConfigPanel.vue` | Aktor-Konfigurationsformular: Typ, GPIO, Safety-Settings |
| `AddSensorModal.vue` | Modal: Neuen Sensor hinzufügen (Typ-Auswahl, GPIO-Picker) |
| `AddActuatorModal.vue` | Modal: Neuen Aktor hinzufügen |
| `EditSensorModal.vue` | Modal: Bestehenden Sensor bearbeiten |
| `GpioPicker.vue` | GPIO-Pin-Auswahl: Visuelle Pin-Map, verfügbare/reservierte Pins |
| `ConnectionLines.vue` | SVG-Verbindungslinien zwischen Sensor-Satelliten und ESP-Zentrum |
| `LiveDataPreview.vue` | Echtzeit-Datenvorschau für einen Sensor |
| `ZoneAssignmentDropdown.vue` | Dropdown für Zone-Zuweisung eines ESP |
| `AnalysisDropZone.vue` | Drop-Zone für Sensor-Analyse (Drag-Sensor → Analyse-Bereich) |

### 5.3 Zones (6 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `ZoneDetailView.vue` | Zone-Detail (Level 2): Alle ESPs einer Zone mit DeviceSummaryCards |
| `ZoneMonitorView.vue` | Zone-Monitor: Live-Sensor-/Aktor-Daten einer Zone |
| `ZoneGroup.vue` | Gruppierung von ESPs nach Zone |
| `DeviceSummaryCard.vue` | Kompakte ESP-Übersicht innerhalb einer Zone: Status, Sensoren, Aktoren |
| `SubzoneArea.vue` | Subzone-Bereich: Darstellung einer Subzone mit zugehörigen Sensoren/Aktoren |
| `ZoneAssignmentPanel.vue` | Panel für Zone-Zuweisungen (Drag-and-Drop) |

### 5.4 Rules/Logic (5 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `RuleFlowEditor.vue` | Vue Flow Canvas: Visueller Regel-Editor mit Custom Nodes und Edges |
| `RuleNodePalette.vue` | Node-Palette: Draggable Nodes (Sensor-Trigger, Time-Window, Actuator-Action, etc.) |
| `RuleConfigPanel.vue` | Konfigurations-Panel: Einstellungen für den selektierten Node (Schwellwerte, GPIO, etc.) |
| `RuleCard.vue` | Regel-Karte: Kompakte Darstellung einer Rule (Name, Status, letzte Ausführung) |
| `RuleTemplateCard.vue` | Regel-Template: Vordefinierte Regel-Vorlagen zum schnellen Erstellen |

### 5.5 System Monitor (20 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `MonitorTabs.vue` | Tab-Navigation: Events, Server-Logs, Datenbank, MQTT, Health |
| `MonitorHeader.vue` | Header mit Suchfeld und globalen Aktionen |
| `MonitorFilterPanel.vue` | Filter-Panel: ESP, Level, Zeitraum, Event-Type |
| `EventsTab.vue` | Events-Tab: Live WebSocket Events + historische Audit-Logs |
| `ServerLogsTab.vue` | Server-Logs-Tab: God-Kaiser JSON-Logs mit Level-Filter |
| `DatabaseTab.vue` | Datenbank-Tab: Tabellen-Explorer mit Schema und Daten |
| `MqttTrafficTab.vue` | MQTT-Tab: Live MQTT-Message-Stream |
| `HealthTab.vue` | Health-Tab: System-Health, ESP-Fleet, Grafana-Embeds |
| `HealthSummaryBar.vue` | Health-Summary: Kompakte Statusleiste oben (immer sichtbar) |
| `HealthProblemChip.vue` | Problem-Chip: Einzelnes Health-Problem als Badge |
| `EventTimeline.vue` | Zeitstrahl-Darstellung von Events |
| `EventDetailsPanel.vue` | Detail-Panel: Einzelnes Event mit allen Feldern und Troubleshooting |
| `PreviewEventCard.vue` | Vorschau-Karte für ein Event |
| `UnifiedEventList.vue` | Event-Liste: Virtual Scrolling für tausende Events |
| `DataSourceSelector.vue` | Umschalter: Live WebSocket vs. historische API-Daten |
| `CleanupPanel.vue` | Cleanup-Aktionen: Daten bereinigen mit Vorschau |
| `CleanupPreview.vue` | Cleanup-Vorschau: Zeigt was gelöscht wird |
| `AutoCleanupStatusBanner.vue` | Banner: Auto-Cleanup-Status und nächste Ausführung |
| `LogManagementPanel.vue` | Log-Management: Retention, Export |
| `RssiIndicator.vue` | WiFi-Signal-Stärke als visueller Indikator |

### 5.6 Charts (6 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `GaugeChart.vue` | Gauge/Tacho-Diagramm: Sensor-Wert als halbkreisförmiges Gauge |
| `LiveLineChart.vue` | Live-Liniendiagramm: Echtzeit-Sensor-Verlauf |
| `MultiSensorChart.vue` | Multi-Sensor-Chart: Mehrere Sensoren im Vergleich |
| `StatusBarChart.vue` | Status-Balkendiagramm: Verteilung von Zuständen |
| `HistoricalChart.vue` | NEU: Historisches Zeitreihen-Diagramm mit Threshold-Linien (chartjs-plugin-annotation) und Live-Daten-Append via WebSocket |
| `TimeRangeSelector.vue` | NEU: Zeitbereich-Selektor: Presets (1h, 6h, 24h, 7d) + Custom Datumsbereich |

### 5.7 Common (1 Komponente)

| Komponente | Beschreibung |
|-----------|-------------|
| `GrafanaPanelEmbed.vue` | Grafana-Panel als iFrame eingebettet |

**Migration abgeschlossen:** Alle 11 deprecated Wrapper-Dateien (Badge, Button, Card, Modal, Input, Select, Toggle, Spinner, EmptyState, ErrorState, ToastContainer, LoadingState) wurden entfernt. Die kanonischen Versionen in `shared/design/` sind jetzt die einzige Quelle.

### 5.8 Database (6 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `DataTable.vue` | Tabellen-Darstellung: Sortierbar, Spalten-Auswahl |
| `FilterPanel.vue` | Filter für DB-Abfragen |
| `Pagination.vue` | Seitennavigation für Tabellen-Daten |
| `RecordDetailModal.vue` | Modal: Einzelner Datensatz im Detail |
| `SchemaInfoPanel.vue` | Schema-Info: Spalten, Typen, Indizes einer Tabelle |
| `TableSelector.vue` | Tabellen-Auswahl-Sidebar |

### 5.9 Error (2 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `ErrorDetailsModal.vue` | Modal: Detaillierte Fehler-Anzeige mit Stack-Trace und Kontext |
| `TroubleshootingPanel.vue` | Panel: Fehlerbehebungs-Vorschläge vom Server |

### 5.10 Forms (3 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `DynamicForm.vue` | Dynamisch generiertes Formular aus Schema-Definition |
| `FormField.vue` | Einzelnes Formularfeld mit Label, Validierung, Fehlermeldung |
| `FormGroup.vue` | Gruppierung von Formularfeldern |

### 5.11 Filters (1 Komponente)

| Komponente | Beschreibung |
|-----------|-------------|
| `UnifiedFilterBar.vue` | Universelle Filter-Leiste: Suchfeld, Dropdowns, Chips |

### 5.12 Modals (2 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `CreateMockEspModal.vue` | Modal: Mock-ESP erstellen (Name, Sensoren, Aktoren) |
| `RejectDeviceModal.vue` | Modal: Gerät ablehnen mit Begründung |

### 5.13 Safety (1 Komponente)

| Komponente | Beschreibung |
|-----------|-------------|
| `EmergencyStopButton.vue` | Globaler Emergency-Stop-Button: Großer roter Button, Bestätigungs-Dialog |

### 5.14 Command (1 Komponente)

| Komponente | Beschreibung |
|-----------|-------------|
| `CommandPalette.vue` | Spotlight-artige Suchleiste (Ctrl+K): Fuzzy-Search über Navigation, Geräte, Aktionen |

### 5.15 Calibration (2 Komponenten, NEU)

| Komponente | Beschreibung |
|-----------|-------------|
| `CalibrationWizard.vue` | Mehrstufiger Kalibrierungs-Wizard: Sensor-Typ-Auswahl, Messpunkt-Erfassung, Ergebnis-Berechnung |
| `CalibrationStep.vue` | Einzelner Kalibrierschritt: Rohwert-Erfassung, Referenzwert-Eingabe |

---

## 6. Design System (`shared/design/`)

Dreistufiges Design System:

### 6.1 Primitives (12 Komponenten)

Atomare UI-Bausteine ohne Business-Logik:

| Komponente | Beschreibung |
|-----------|-------------|
| `BaseBadge.vue` | Badge mit Farb-Varianten |
| `BaseButton.vue` | Button mit Size/Variant/Loading-State |
| `BaseCard.vue` | Card-Container mit Header/Body/Footer-Slots |
| `BaseInput.vue` | Input mit Label, Placeholder, Error, Disabled |
| `BaseModal.vue` | Modal mit Overlay, Transition, Close-Button |
| `BaseSelect.vue` | Select-Dropdown |
| `BaseSkeleton.vue` | Skeleton-Loading-Placeholder |
| `BaseSpinner.vue` | Animierter Lade-Spinner |
| `BaseToggle.vue` | Toggle-Switch |
| `SlideOver.vue` | NEU: Slide-In-Panel von rechts (sm/md/lg Breiten), Teleport to body, ESC/Click-Outside |
| `QualityIndicator.vue` | NEU: Status-Punkt mit Label (good/warning/alarm/offline), optional pulsierend |
| `RangeSlider.vue` | NEU: Vier-Punkt-Schwellwert-Slider (alarmLow→warnLow→warnHigh→alarmHigh), Farb-Zonen |

### 6.2 Layout (3 Komponenten)

Seiten-Struktur-Bausteine:

| Komponente | Beschreibung |
|-----------|-------------|
| `AppShell.vue` | Haupt-Shell: Sidebar + TopBar + Content-Area |
| `Sidebar.vue` | Design-System-Sidebar: Navigation, Collapse, User-Bereich |
| `TopBar.vue` | Obere Leiste: Breadcrumb, Suche, Zoom-Controls, Notifications |

### 6.3 Patterns (5 Komponenten)

Wiederverwendbare UI-Muster:

| Komponente | Beschreibung |
|-----------|-------------|
| `ConfirmDialog.vue` | Globaler Bestätigungs-Dialog (Promise-basiert via uiStore) |
| `ContextMenu.vue` | Globales Rechtsklick-Menü (via uiStore) |
| `EmptyState.vue` | Leerer-Zustand-Platzhalter (Design System Version) |
| `ErrorState.vue` | Fehler-Zustand-Anzeige (Design System Version) |
| `ToastContainer.vue` | Toast-Container (Design System Version) |

---

## 7. Pinia Stores (13 Stores)

### 7.1 Store-Architektur

Die Stores sind in zwei Schichten organisiert:

```
stores/                          shared/stores/
├── esp.ts      (Haupt-Store)    ├── auth.store.ts       (kanonisch)
                                 ├── logic.store.ts      (kanonisch)
                                 ├── database.store.ts   (kanonisch)
                                 ├── dragState.store.ts  (kanonisch)
                                 ├── ui.store.ts         (kanonisch)
                                 ├── dashboard.store.ts  (kanonisch)
                                 ├── zone.store.ts       (kanonisch)
                                 ├── sensor.store.ts     (kanonisch)
                                 ├── actuator.store.ts   (kanonisch)
                                 ├── gpio.store.ts       (kanonisch)
                                 ├── notification.store.ts (kanonisch)
                                 └── config.store.ts     (kanonisch)
```

Die 4 Legacy-Proxy-Dateien (auth.ts, logic.ts, database.ts, dragState.ts) wurden entfernt. Nur esp.ts verbleibt als eigenständiger Haupt-Store.

### 7.2 Store-Übersicht

| Store | Datei | Verantwortung |
|-------|-------|---------------|
| **esp** | `stores/esp.ts` | Haupt-Store: ESP-Geräte, Mock/Real-Routing, WebSocket-Dispatcher, Sensor-/Aktor-Daten, API-Calls. Delegiert WebSocket-Events an Sub-Stores |
| **auth** | `shared/stores/auth.store.ts` | JWT-Auth: Login, Logout, Token-Refresh, User-Info, Setup-Check |
| **logic** | `shared/stores/logic.store.ts` | Logic Rules: CRUD, WebSocket-Events (logic_execution), Connection-Daten für Visualisierung |
| **database** | `shared/stores/database.store.ts` | DB Explorer: Tabellen, Schema, Daten-Queries, Pagination |
| **dragState** | `shared/stores/dragState.store.ts` | Drag-and-Drop: Globaler D&D-State, Payload-Verwaltung, Safety-Timeout (30s) |
| **ui** | `shared/stores/ui.store.ts` | UI State: Sidebar-Collapsed, Command-Palette, ConfirmDialog, ContextMenu |
| **dashboard** | `shared/stores/dashboard.store.ts` | Dashboard: Status-Counts, Filter, Breadcrumb, Modal-Triggers (Bridge TopBar ↔ DashboardView) |
| **zone** | `shared/stores/zone.store.ts` | Zone-Events: WebSocket zone_assignment/subzone_assignment → Device-Updates |
| **sensor** | `shared/stores/sensor.store.ts` | Sensor-Events: WebSocket sensor_data/sensor_health → Device-Sensor-Updates |
| **actuator** | `shared/stores/actuator.store.ts` | Aktor-Events: WebSocket actuator_status/alert/response/sequence → Device-Aktor-Updates |
| **gpio** | `shared/stores/gpio.store.ts` | GPIO-Status: Pin-Belegung pro ESP, OneWire-Scan-State |
| **notification** | `shared/stores/notification.store.ts` | Notifications: WebSocket notification/error_event/system_event → Toast-Anzeige |
| **config** | `shared/stores/config.store.ts` | Config-Events: WebSocket config_response/published/failed → Toast-Feedback |

### 7.3 WebSocket Event-Dispatcher (esp.ts)

Der `espStore` fungiert als zentraler WebSocket-Dispatcher. Er empfängt alle 28 Event-Typen und delegiert sie an spezialisierte Sub-Stores:

```
WebSocket Message
      │
      ▼
  espStore (Dispatcher)
      │
      ├── sensor_data, sensor_health ──────► sensorStore
      ├── actuator_status, actuator_alert,
      │   actuator_response, actuator_command,
      │   actuator_command_failed,
      │   sequence_* ──────────────────────► actuatorStore
      ├── zone_assignment, subzone_assignment ► zoneStore
      ├── config_response, config_published,
      │   config_failed ───────────────────► configStore
      ├── notification, error_event,
      │   system_event ────────────────────► notificationStore
      ├── esp_health, esp_diagnostics ─────► espStore (intern)
      ├── device_discovered, device_approved,
      │   device_rejected, device_rediscovered ► espStore (intern)
      └── logic_execution ─────────────────► logicStore
```

---

## 8. Composables (16 Stück)

| Composable | Beschreibung |
|-----------|-------------|
| `useWebSocket` | WebSocket-Verbindung: Auto-Connect, Auto-Reconnect, Filter-basierte Subscriptions, Lifecycle-gebunden |
| `useZoomNavigation` | 3-Level-Zoom: CSS-Animationsklassen, URL-Query-Sync, Transition-Locking, Device-Removal-Watcher |
| `useToast` | Toast-Notifications: Singleton-State, Auto-Dismiss, Actions, Stacking (max 20) |
| `useZoneDragDrop` | Zone-Drag-and-Drop: Optimistic UI, API-Calls, Error-Rollback, Gruppierung nach Zonen |
| `useGpioStatus` | GPIO-Status: Reaktiver GPIO-Status pro ESP, Available/Reserved Pins, Validation |
| `useCommandPalette` | Command Palette: Singleton-Registry, Fuzzy-Search, Keyboard-Navigation |
| `useKeyboardShortcuts` | Keyboard Shortcuts: Singleton-Registry, Scope-Awareness, Input-Element-Suppression |
| `useModal` | Modal-State: open/close/toggle, Multi-Modal-Support via `useModals()` |
| `useQueryFilters` | Query-Filter: URL-Query-Sync für System Monitor, Deep-Linking |
| `useConfigResponse` | Config-Response: WebSocket-Listener für ESP32 Config-ACKs |
| `useSwipeNavigation` | Swipe-Gesten: Touch-Gesten für Mobile (Left/Right/Up/Down), Sidebar-Swipe, Edge-Swipe |
| `useGrafana` | Grafana-Integration: Embed-URL-Builder für Panels und Dashboards |
| `useContextMenu` | Context-Menu: Wrapper um uiStore.openContextMenu, Viewport-Boundary-Detection |
| `useDeviceActions` | Device-Aktionen: Inline-Name-Editing, Heartbeat-Trigger, WiFi-Info, State-Info |
| `useScrollLock` | NEU: Reference-counted Body Scroll-Lock. Verhindert Race Conditions bei mehreren offenen Modals/Overlays |
| `useCalibration` | NEU: Kalibrierungs-Wizard-State: pH 2-Punkt / EC 1-2-Punkt Kalibrierung, Messpunkt-Erfassung, Ergebnis-Berechnung |

---

## 9. API-Module (18 Stück)

Alle Module nutzen die zentrale Axios-Instanz (`api/index.ts`) mit JWT-Interceptor.

| Modul | Endpunkte | Beschreibung |
|-------|-----------|-------------|
| `index.ts` | – | Axios-Instanz: BaseURL `/api/v1`, Token-Interceptor, Auto-Refresh bei 401 |
| `esp.ts` | `/esp/devices/*` | ESP-CRUD, Approval/Reject, Config-Push, GPIO-Status |
| `sensors.ts` | `/sensors/*` | Sensor-CRUD, Daten, Kalibrierung, OneWire-Scan |
| `actuators.ts` | `/actuators/*` | Aktor-CRUD, Commands, Emergency-Stop, History |
| `auth.ts` | `/auth/*` | Login, Refresh, Setup, Status, MQTT-Credentials |
| `logic.ts` | `/logic/*` | Rules CRUD, Toggle, Test, Execution-History |
| `zones.ts` | `/zone/*` | Zone-Zuweisung, ESPs pro Zone |
| `subzones.ts` | `/subzone/*` | Subzone CRUD, Sensor-Zuordnung |
| `audit.ts` | `/audit/*` | Audit-Logs, Statistiken, Export, Unified Events |
| `health.ts` | `/health/*` | Liveness, Readiness, Detailed, ESP-Fleet |
| `database.ts` | `/debug/database/*` | Tabellen, Schema, Daten, Record-Detail |
| `debug.ts` | `/debug/*` | Mock-ESP, Simulation, MQTT-Debug |
| `errors.ts` | `/errors/*` | Error-Logs, Stats, Error-Code-Referenz |
| `config.ts` | `/config/*` | Systemkonfiguration Key-Value |
| `logs.ts` | `/debug/logs/*` | Server-Log-Dateien lesen |
| `users.ts` | `/users/*` | User CRUD, Password-Reset |
| `loadtest.ts` | `/debug/loadtest/*` | Bulk-Create, Simulation, Metriken |
| `calibration.ts` | `/sensors/calibrate` | NEU: Sensor-Kalibrierung (pH, EC), X-API-Key Auth |

### 9.1 Axios-Interceptor (Token-Refresh)

```
Request → Bearer Token hinzufügen
Response 401 → Token abgelaufen?
  ├── Ja → POST /auth/refresh → Neues Token → Request wiederholen
  └── Refresh auch fehlgeschlagen → clearAuth() → Redirect /login
Skip: /auth/refresh, /auth/login, /auth/setup, /auth/status (kein Refresh-Loop)
```

---

## 10. WebSocket-Service (`services/websocket.ts`, 686 Zeilen)

### 10.1 Architektur

```
WebSocketService (Singleton)
├── Connection Management (Connect, Disconnect, Reconnect)
├── Subscription System (Filter-basiert, Multiple Subscribers)
├── Rate Limiting (10 msg/s Client-seitig)
├── Token Refresh (vor Reconnect wenn Token < 60s gültig)
├── Visibility Handling (Tab-Wechsel → Reconnect)
├── Pending Subscriptions Queue (während 'connecting')
└── Status Change Callbacks (reaktive Status-Updates)
```

### 10.2 Verbindung

| Eigenschaft | Wert |
|-------------|------|
| **Endpoint** | `ws://{host}:8000/api/v1/ws/realtime/{client_id}?token={jwt}` |
| **Client-ID** | UUID-like (generiert beim Start) |
| **Reconnect** | Exponential Backoff: 1s → 2s → 4s → 8s → 16s → max 30s |
| **Max Retries** | 10 |
| **Rate Limit** | 10 Messages/Sekunde (Client-seitig) |
| **Token Refresh** | Automatisch vor Reconnect wenn Token < 60s gültig |

### 10.3 28 Event-Typen

| Gruppe | Events |
|--------|--------|
| **Sensor/Aktor** | `sensor_data`, `actuator_status`, `actuator_command`, `actuator_command_failed`, `actuator_response`, `actuator_alert` |
| **Health** | `esp_health`, `sensor_health`, `esp_diagnostics` |
| **Discovery** | `device_discovered`, `device_approved`, `device_rejected`, `device_rediscovered` |
| **Config** | `config_response`, `config_published`, `config_failed`, `zone_assignment`, `subzone_assignment` |
| **Logic** | `logic_execution`, `notification`, `sequence_started`, `sequence_step`, `sequence_completed`, `sequence_error`, `sequence_cancelled` |
| **System** | `system_event`, `error_event`, `events_restored` |

---

## 11. TypeScript-Typen (6 Dateien)

| Datei | Inhalt |
|-------|--------|
| `index.ts` | Re-Exports + Discovery/Approval-Types, Device-Config-Types, Multi-Value-Sensor, Quality, Offline-Info |
| `gpio.ts` | GPIO-Status-Types: GpioOwner, GpioSource, GpioUsageItem, GpioPinStatus, Validation |
| `logic.ts` | Logic-Rule-Types: LogicRule, Conditions (Sensor/Time/Compound), Actions (Actuator/Delay/Notification/Sequence) |
| `websocket-events.ts` | UnifiedEvent-Typ für System Monitor |
| `event-grouping.ts` | Event-Gruppierung: EventOrGroup, GroupingOptions |
| `form-schema.ts` | Dynamische Formular-Schema-Definitionen |

---

## 12. Utility-Funktionen (16 Dateien)

| Datei | Beschreibung |
|-------|-------------|
| `formatters.ts` | Formatierung: Datum, Zeit, Relative Zeit, Bytes, Zahlen |
| `sensorDefaults.ts` | Sensor-Typ-Defaults: Icons, Units, Min/Max, Interface-Typ-Erkennung, Multi-Value-Config |
| `actuatorDefaults.ts` | Aktor-Typ-Defaults: Icons, Labels |
| `gpioConfig.ts` | GPIO-Konfiguration: Board-Typen, Safe-Pins, Reserved-Pins |
| `labels.ts` | Label-Mapping: State-Info, Status-Labels, deutsche Übersetzungen |
| `zoneColors.ts` | Zone-Farben: Farb-Palette für Zonen |
| `wifiStrength.ts` | WiFi-Signal-Stärke: dBm → Prozent → Icon → Label |
| `errorCodeTranslator.ts` | Error-Code-Übersetzung: Code → Kategorie → Deutsche Beschreibung |
| `eventGrouper.ts` | Event-Gruppierung: Events nach Zeitfenster gruppieren |
| `eventTransformer.ts` | Event-Transformation: API-Events → Unified-Events |
| `eventTypeIcons.ts` | Event-Typ-Icons: Mapping Event-Type → Lucide-Icon |
| `databaseColumnTranslator.ts` | DB-Spalten-Übersetzung: Technische Spaltennamen → Deutsche Labels |
| `logMessageTranslator.ts` | Log-Message-Übersetzung: Server-Logs → Deutsche Nachrichten |
| `logSummaryGenerator.ts` | Log-Summary: Zusammenfassung von Log-Einträgen |
| `logger.ts` | Frontend-Logger: Structured Logging mit Modulnamen (createLogger) |
| `index.ts` | Re-Exports |

---

## 13. Styles (5 Dateien)

| Datei | Beschreibung |
|-------|-------------|
| `main.css` | Haupt-CSS: Tailwind-Imports, globale Styles, Card/Button-Basis-Klassen |
| `tailwind.css` | Tailwind-Konfiguration: `@tailwind base/components/utilities` |
| `tokens.css` | Design Tokens: CSS Custom Properties für Farben, Spacing, Radii, Shadows |
| `glass.css` | Glassmorphismus-Effekte: Backdrop-Blur, Border-Glow, Gradient-Overlays |
| `animations.css` | CSS-Animationen: Zoom-Transitions, Fade, Slide, Pulse, Orbital-Rotation |

---

## 14. Auth-Flow

```
App.vue onMounted()
  └── authStore.checkAuthStatus()
        ├── GET /auth/status → setupRequired?
        │   └── Ja → clearAuth() → Redirect /setup
        ├── Token vorhanden?
        │   └── GET /auth/me → User laden
        │       ├── 200 → User gesetzt, isAuthenticated = true
        │       └── 401 → refreshTokens()
        │             ├── POST /auth/refresh → Neues Token → Retry /auth/me
        │             └── Refresh fehlgeschlagen → clearAuth() → Redirect /login
        └── Kein Token → Redirect /login

Token-Speicherung: localStorage
  ├── el_frontend_access_token
  └── el_frontend_refresh_token
```

---

## 15. Dashboard Zoom-Navigation

### 15.1 Transitions

```
Level 1 (Zone Overview)
    │ Klick auf ZonePlate
    ▼ CSS: zoom-enter-from-overview
Level 2 (Zone Detail)
    │ Klick auf DeviceSummaryCard
    ▼ CSS: zoom-enter-from-detail
Level 3 (Device Detail)
    │ ODER: Klick auf Device in Level 2 → ESPSettingsSheet (Slide-In)

Zurück:
    ← Breadcrumb-Klick
    ← Escape-Taste
    ← Swipe-Geste (Mobile)
    ← Browser-Back-Button (URL-Sync)
```

### 15.2 URL-Sync

| Level | URL |
|-------|-----|
| 1 | `/` |
| 2 | `/?zone={zoneId}` |
| 3 | `/?zone={zoneId}&device={deviceId}` |
| Settings | `/?openSettings={espId}` |

### 15.3 Technische Details

- Alle 3 Levels gleichzeitig im DOM (`v-show`, nicht `v-if`)
- Transition-Locking verhindert Doppelklick-Probleme
- Exit-Duration: 250ms, Enter-Duration: 350ms
- Device-Removal-Watcher: Automatischer Zoom-Out wenn Device gelöscht wird

---

## 16. Drag-and-Drop-System

### 16.1 Zone-Drag-and-Drop

ESPs können per Drag-and-Drop zwischen Zonen verschoben werden:

```
DashboardView
  ├── ZonePlate (Drop-Target pro Zone)
  ├── DeviceMiniCard (Draggable)
  └── UnassignedDropBar (Drop-Target für "Nicht zugewiesen")
```

**Composable:** `useZoneDragDrop`
- Optimistic UI: Sofortige Verschiebung im Frontend
- API-Call: `PATCH /zone/assign`
- Error-Rollback: Bei Fehler automatisch zurückverschieben
- Toast-Feedback: Erfolg/Fehler-Benachrichtigung

### 16.2 Sensor/Aktor-Drag

Sensoren und Aktoren können aus der ComponentSidebar auf ESPs gezogen werden:

```
ComponentSidebar
  ├── SensorSidebar → Sensor-Typ-Cards (Draggable)
  └── ActuatorSidebar → Aktor-Typ-Cards (Draggable)
        ↓ Drag
ESPOrbitalLayout / ESPCard (Drop-Target)
        ↓ Drop
AddSensorModal / AddActuatorModal (Konfigurations-Dialog)
```

**Store:** `dragStateStore`
- Globaler D&D-State (welches Element wird gerade gezogen)
- Payload-Verwaltung (Sensor-Typ, Label, Default-Unit)
- Safety-Timeout: 30s automatisches Reset bei hängendem State

---

## 17. Dependency-Graph

```
App.vue
└─► Router → Views
    │
    ├─► DashboardView
    │   ├─► espStore (Haupt-Store)
    │   │   ├─► sensorStore, actuatorStore, zoneStore
    │   │   ├─► gpioStore, notificationStore, configStore
    │   │   └─► websocketService (Singleton)
    │   ├─► logicStore
    │   ├─► dashboardStore, uiStore
    │   ├─► useZoomNavigation
    │   ├─► useZoneDragDrop
    │   ├─► useKeyboardShortcuts
    │   └─► useSwipeNavigation
    │
    ├─► LogicView
    │   ├─► logicStore → logicApi
    │   ├─► RuleFlowEditor (Vue Flow)
    │   ├─► RuleNodePalette
    │   └─► RuleConfigPanel
    │
    ├─► SystemMonitorView
    │   ├─► useWebSocket (Live-Events)
    │   ├─► auditApi (historische Daten)
    │   ├─► useQueryFilters (URL-Sync)
    │   └─► 5 Tab-Komponenten
    │
    ├─► SensorsView
    │   ├─► espStore
    │   └─► EmergencyStopButton → actuatorsApi
    │
    └─► Auth Views (Login, Setup)
        └─► authStore → authApi

API-Layer:
api/index.ts (Axios Singleton)
├─► JWT Token Interceptor
├─► 401 → Auto-Refresh
└─► 16 spezialisierte API-Module

WebSocket-Layer:
websocket.ts (Singleton)
├─► Exponential Backoff Reconnect
├─► Filter-basierte Subscriptions
├─► Token-Refresh vor Reconnect
└─► Rate Limiting (10 msg/s)
```

---

## 18. Referenz-Verzeichnis

| Thema | Dokument | Pfad |
|-------|----------|------|
| **System-Architektur** | Gesamtübersicht (3 Schichten) | `.claude/reports/current/auto-one_systemarchitektur.md` |
| **ESP32-Architektur** | Firmware-Detail | `.claude/reports/current/auto-one_esparchitektur.md` |
| **WebSocket-Events** | 28 Event-Typen | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
| **REST-API** | ~170 Endpoints | `.claude/reference/api/REST_ENDPOINTS.md` |
| **Datenflüsse** | Code-Referenzen | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| **Error-Codes** | ESP32 + Server | `.claude/reference/errors/ERROR_CODES.md` |

---

## 19. CSS Detail-Audit

### 19.1 Design Tokens (`styles/tokens.css`, 184 Zeilen, 76 Custom Properties)

| Kategorie | Anzahl | Token-Beispiele |
|-----------|--------|----------------|
| **Backgrounds** | 8 | `--color-bg-primary` (#07070d) bis `--color-bg-level-3` (#0e0e1a) |
| **Text** | 3 | `--color-text-primary` (#eaeaf2), `-secondary` (#8585a0), `-muted` (#484860) |
| **Accent** | 3 | `--color-accent` (#3b82f6), `-bright`, `-dim` |
| **Iridescent** | 6 | `--color-iridescent-1` bis `-4` + 2 Gradients |
| **Status** | 4 | `--color-success`, `-warning`, `-error`, `-info` |
| **Device-Type** | 2 | `--color-mock` (#a78bfa), `--color-real` (#22d3ee) |
| **Glass** | 6 | `--glass-bg`, `-border`, `-shadow`, `-shadow-glow` |
| **Spacing** | 13 | 7 numerisch (`--space-1` bis `--space-12`) + 6 Aliase (xs/sm/md/lg/xl/2xl) |
| **Radius** | 6 | 3 Basis (`--radius-sm/md/lg`) + `--radius-full` + 2 Aliase |
| **Elevation** | 3 | `--elevation-flat`, `-raised`, `-floating` |
| **Animation** | 9 | 3 Easing, 3 Duration, 3 Transition-Composites |
| **Z-Index** | 9 | `--z-base` (0) bis `--z-tooltip` (70) |
| **Typography** | 15 | 3 Font-Families, 7 Sizes, 3 Line-Heights, 3 Letter-Spacing |
| **Layout** | 2 | `--sidebar-width` (15rem), `--header-height` (3rem) |

**Token-Compliance:** Farben 95%, Spacing 90%, Radius 100%, Typography 100%, **Z-Index nur 30%**

### 19.2 Z-Index Skala (Soll vs. Ist)

**Definierte Skala (tokens.css:141-151):**

```
0   --z-base           Background
10  --z-dropdown        Dropdowns, Context Menus
20  --z-sticky          Sticky Headers, Toolbars
30  --z-fixed           Fixed Navigation, Sidebars
35  --z-tray            Bottom Trays (UnassignedDropBar)
40  --z-modal-backdrop  Modal Backdrops
50  --z-modal           Modals, Panels
60  --z-popover         Popovers
70  --z-tooltip          Tooltips, höchste Priorität
```

### 19.3 Z-Index Violations (24 Stellen)

| Severity | Datei | Element | Ist-Wert | Soll-Token | Zeile |
|----------|-------|---------|----------|------------|-------|
| **KRITISCH** | `ESPOrbitalLayout.css` | `.esp-info-compact__dropzone--overlay` | **10000** | `--z-tooltip` (70) | 557 |
| **KRITISCH** | `EmergencyStopButton.vue` | `.emergency-stop__button` | **10000** | `--z-tooltip` (70) | 162 |
| **KRITISCH** | `DataSourceSelector.vue` | `.source-selector__modal` | **9999** | `--z-tooltip` (70) | 896 |
| **KRITISCH** | `ToastContainer.vue` (shared) | `.toast-container` | **9999** | 75 (neu) | 107 |
| **KRITISCH** | `ZoneGroup.vue` | `.zone-group__drag-item` | **9999** | `--z-modal` (50) | 883, 901 |
| **KRITISCH** | `ErrorDetailsModal.vue` | `.error-modal-backdrop` | **9999** | `--z-tooltip` (70) | 252 |
| **HOCH** | `ESPOrbitalLayout.css` | `.modal-overlay` | **1000** | `--z-modal` (50) | 715 |
| **HOCH** | `MonitorHeader.vue` | `.monitor-header__sticky` | **100** | `--z-sticky` (20) | 414 |
| **HOCH** | `SystemMonitorView.vue` | `.monitor-view__sticky` | **100** | `--z-sticky` (20) | 1798 |
| **HOCH** | `ESPOrbitalLayout.css` | `.esp-horizontal-layout__drop-indicator` | **100** | `--z-sticky` (20) | 680 |
| **MITTEL** | `CommandPalette.vue` | `.palette-overlay` | 70 | 62 (unter Tooltip) | 168 |
| **MITTEL** | `Sidebar.vue` (shared) | `.sidebar__navigation` | 40 | `--z-fixed` (30) | 213 |
| **MITTEL** | `LogicView.vue` | `.logic-toolbar__actions` | 50 | `--z-sticky` (20) | 789 |
| **NIEDRIG** | `TopBar.vue` (shared) | `.topbar__dropdown` | 9 | `--z-dropdown` (10) | 839 |

**Korrekt verwendende Komponenten (35+):** CommandPalette (70), ContextMenu (60), AppShell (30), EventDetailsPanel (50/10), CrossEspConnectionOverlay (50), etc.

### 19.4 CSS-Dateien Architektur

| Datei | Zeilen | Zweck | Layer | Status |
|-------|--------|-------|-------|--------|
| `tokens.css` | 184 | Design Tokens (:root) | :root | ✅ Sauber |
| `main.css` | 759 | Globale Utility-Klassen (btn, badge, status, table, skeleton) | @layer base/components | ✅ Sauber |
| `glass.css` | 74 | Glassmorphismus (glass-panel, glass-overlay, iridescent-border) | @layer components | ✅ Sauber |
| `animations.css` | 179 | Keyframes + Animation-Utilities (stagger, pulse, breathe, shimmer) | @layer utilities | ✅ Sauber |
| `tailwind.css` | 3 | Tailwind Directives | Integration | ✅ Standard |
| `ESPOrbitalLayout.css` | **1458** | **FEHLPLATZIERT** in `components/esp/` | Component (scoped) | ❌ Problematisch |

### 19.5 ESPOrbitalLayout.css — Kritisches Problem

**Problem:** 1458-Zeilen CSS-Datei liegt in `components/esp/` statt in `styles/`. Wird als `<style src="./ESPOrbitalLayout.css" scoped>` eingebunden.

**Redefinierte globale Klassen (Konflikte mit main.css):**

| Klasse | In main.css | In ESPOrbitalLayout.css | Konflikt |
|--------|------------|------------------------|----------|
| `.btn` | Zeile 64-96 | Zeile 852-861 | ❌ **Doppelte Definition** |
| `.btn-primary` | Zeile 99-117 | Zeile 863-871 | ❌ **Doppelte Definition** |
| `.btn-secondary` | Zeile 120-130 | Zeile 873-882 | ❌ **Doppelte Definition** |
| `.btn-danger` | Zeile 144-153 | Zeile 787-796 | ❌ **Doppelte Definition** |
| `.modal-*` | — | Zeile 707-785 | ⚠️ Nicht in main.css |
| `.form-label`, `.form-input`, `.form-select` | — | Zeile 822-843 | ⚠️ Nicht in main.css |
| `@keyframes spin` | — (in animations.css) | Zeile 1039, 1440 | ⚠️ Dupliziert |

**Auswirkung:** Buttons in ESPOrbitalLayout.vue sehen/verhalten sich anders als Buttons in allen anderen Komponenten (scoped overrides global).

### 19.6 Inline Styles

**Ergebnis:** Fast alle Inline-Styles verwenden Tokens oder dynamische Werte korrekt. Einzige Ausnahme:

| Datei | Zeile | Problem | Fix |
|-------|-------|---------|-----|
| `ESPCard.vue` | 792 | `style="opacity: 0.4"` (hardcoded) | `class="opacity-40"` (Tailwind) |

### 19.7 Dark Mode

Frontend ist **ausschließlich Dark Mode** (Mission-Control-Aesthetic). Kein Light-Mode-Support, keine Theme-Umschaltung. Intentional by Design.

### 19.8 Accessibility (Kontrast)

| Token | Wert | Kontrast auf `--color-bg-primary` | WCAG |
|-------|------|-----------------------------------|------|
| `--color-text-primary` | #eaeaf2 | 19.1:1 | ✅ AAA |
| `--color-text-secondary` | #8585a0 | 7.2:1 | ✅ AA |
| `--color-text-muted` | #484860 | 4.1:1 | ⚠️ Grenzwertig (unter AA für Body) |

`--color-text-muted` sollte nur auf helleren Hintergründen (tertiary+) verwendet werden.

---

## 20. Komponenten-Duplikate & Migrations-Status

### 20.1 Design-System-Migration: 100% abgeschlossen

Die Migration von `components/common/` + `components/layout/` → `shared/design/` ist **vollständig abgeschlossen**. Die Verzeichnisse `components/layout/` und `components/widgets/` wurden gelöscht. `components/common/` enthält nur noch `GrafanaPanelEmbed.vue` (keine kanonische Design-System-Version vorhanden).

### 20.2 Doppelte Komponenten (14 Paare) — Historisch

**Status (v3.0):** Alle 14 deprecated Wrapper-Dateien wurden entfernt. Die 4 Legacy-Store-Proxies (auth.ts, logic.ts, database.ts, dragState.ts) wurden ebenfalls entfernt.

Alle deprecated-Dateien waren 5-Zeilen-Wrapper mit `@deprecated` Kommentar:

```typescript
/** @deprecated Use @/shared/design/primitives/BaseBadge.vue instead */
import BaseBadge from '@/shared/design/primitives/BaseBadge.vue'
export default BaseBadge
```

**Primitives (8 Paare):**

| Deprecated (`components/common/`) | Kanonisch (`shared/design/primitives/`) | Zeilen (deprecated → kanonisch) |
|---|---|---|
| `Badge.vue` | `BaseBadge.vue` | 5 → 104 |
| `Button.vue` | `BaseButton.vue` | 5 → 117 |
| `Card.vue` | `BaseCard.vue` | 5 → 102 |
| `Modal.vue` | `BaseModal.vue` | 5 → 225 |
| `Input.vue` | `BaseInput.vue` | 5 → 120 |
| `Select.vue` | `BaseSelect.vue` | 5 → 122 |
| `Toggle.vue` | `BaseToggle.vue` | 5 → 108 |
| `Spinner.vue` | `BaseSpinner.vue` | 5 → 50 |

**Patterns (3 Paare):**

| Deprecated (`components/common/`) | Kanonisch (`shared/design/patterns/`) | Zeilen |
|---|---|---|
| `EmptyState.vue` | `EmptyState.vue` | 5 → 102 |
| `ErrorState.vue` | `ErrorState.vue` | 5 → 127 |
| `ToastContainer.vue` | `ToastContainer.vue` | 5 → 328 |

**Layout (3 Paare):**

| Deprecated (`components/layout/`) | Kanonisch (`shared/design/layout/`) | Zeilen |
|---|---|---|
| `MainLayout.vue` | `AppShell.vue` | 5 → ~500 |
| `AppHeader.vue` | `TopBar.vue` | 5 → 917 |
| `AppSidebar.vue` | `Sidebar.vue` | 5 → ~400 |

**Nicht migrierte Komponenten (2):** `LoadingState.vue` und `GrafanaPanelEmbed.vue` haben keine kanonische Version in `shared/design/`.

### 20.3 Import-Migration — Abgeschlossen

**Alle 6 Dateien mit alten Import-Pfaden wurden migriert.** Es gibt keine Importe mehr von `@/components/common/` (außer GrafanaPanelEmbed). Die Store-Legacy-Proxies wurden entfernt.

### 20.4 Index-Exports — 3 Parallele Pfade zum selben Component

Jede Komponente ist über **3 verschiedene Pfade** importierbar:

```typescript
// Pfad A: Deprecated Wrapper (5-Zeilen-Proxy)
import Badge from '@/components/common/Badge.vue'

// Pfad B: Kanonisch direkt
import BaseBadge from '@/shared/design/primitives/BaseBadge.vue'

// Pfad C: Kanonisch via Barrel (mit Alias)
import { Badge } from '@/shared/design/primitives'
```

`shared/design/primitives/index.ts` exportiert sowohl `BaseBadge` als auch `Badge`-Alias für Rückwärtskompatibilität.

---

## 21. Overlay-Stacking & Modal-Konflikte

### 21.1 Overlay-Komponenten Stacking Order (Ist-Zustand)

```
z-10000  ESPOrbitalLayout.css (.zone-item--drag)        ← AUSSERHALB DER SKALA
z-10000  EmergencyStopButton (.emergency-stop__button)   ← AUSSERHALB DER SKALA
z-9999   ErrorDetailsModal (.error-modal-backdrop)       ← AUSSERHALB DER SKALA
z-9999   ToastContainer (.toast-container)               ← KOLLIDIERT mit Error!
z-9999   ZoneGroup (.zone-group__drag-item)              ← AUSSERHALB DER SKALA
z-9999   DataSourceSelector (.source-selector__modal)    ← AUSSERHALB DER SKALA
z-1000   ESPOrbitalLayout.css (.modal-overlay)           ← AUSSERHALB DER SKALA
z-100    MonitorHeader, SystemMonitorView                ← ÜBER Modals!
z-70     CommandPalette (.palette-overlay)               ← ÜBER Modals
z-60     PendingDevicesPanel (.pending-panel)
z-50     BaseModal (Tailwind z-50)
z-50     ESPSettingsSheet (.sheet-overlay)
z-50     RecordDetailModal (Tailwind z-50)
z-50     UserManagementView (5× inline z-50)
z-40     PendingDevicesPanel (.pending-backdrop)         ← UNTER eigenem Panel!
z-auto   ESPSettingsSheet (.sheet-content)               ← NICHT DEFINIERT!
z-auto   UnassignedDropBar (.drop-bar)                   ← NICHT DEFINIERT!
```

### 21.2 Kritische Stacking-Szenarien

**Szenario A: Error + Toast gleichzeitig**
- Beide z-9999 → DOM-Reihenfolge entscheidet → **unvorhersehbar**

**Szenario B: Drag + Modal offen**
- Drag-Overlay z-10000 → überdeckt Error-Modal (z-9999) und Toast → **UX-Chaos**

**Szenario C: Sheet + Modal gleichzeitig**
- Beide z-50 → Stacking Context entscheidet → **fragil**

### 21.3 Backdrop-Filter — 7 Verschiedene Implementierungen

| Komponente | Background | Opacity | Blur | Konsistenz |
|-----------|-----------|---------|------|------------|
| `glass.css` (Standard) | rgba(7,7,13) | 0.85 | 8px | ✅ Referenz |
| `BaseModal` | (via glass-overlay) | 0.85 | 8px | ✅ Konsistent |
| `CommandPalette` | rgba(7,7,13) | 0.60 | 4px | ⚠️ Leichter |
| `PendingDevicesPanel` | rgba(7,7,13) | 0.72 | 8px | ⚠️ Abweichend |
| `ESPSettingsSheet` | rgba(10,10,15) | 0.60 | 2px | ❌ Andere Farbe, minimal |
| `ErrorDetailsModal` | rgba(0,0,0) | 0.60 | 4px | ❌ Schwarz statt Theme |
| `RecordDetailModal` | rgba(0,0,0) | 0.70 | **0px** | ❌ Kein Blur! |

### 21.4 Fehlende Modal-Features

| Komponente | Scroll-Lock | Escape-Key | Click-Outside | Modal-Stack |
|-----------|------------|-----------|--------------|------------|
| `BaseModal` | ✅ | ✅ | ✅ | ❌ |
| `ESPSettingsSheet` | ✅ | ✅ | ✅ | ✅ (uiStore) |
| `ErrorDetailsModal` | ❌ **FEHLT** | ✅ | ✅ | ❌ |
| `PendingDevicesPanel` | ❌ **FEHLT** | ❌ **FEHLT** | ✅ | ✅ (uiStore) |
| `CommandPalette` | ❌ **FEHLT** | ✅ | ✅ | ❌ |
| `UserManagementView` (5×) | ❌ **FEHLT** | ❌ **FEHLT** | ⚠️ Nur Backdrop | ❌ |

**Scroll-Lock Race Condition:** Wenn `BaseModal` + `ErrorDetailsModal` gleichzeitig offen sind und `ErrorDetailsModal` zuerst schließt → `document.body.style.overflow = ''` → BaseModal verliert Scroll-Lock.

### 21.5 Transitions — 3 Verschiedene Implementierungen

| Komponente | Overlay Duration | Content Transform | Easing | Token? |
|-----------|-----------------|-------------------|--------|--------|
| `BaseModal` | 200ms | scale(0.95) + translateY(-10px) | ease | ❌ Hardcoded |
| `CommandPalette` | 120ms | scale(0.95) + translateY(-10px) | ease | ✅ `--transition-fast` |
| `ESPSettingsSheet` | 300ms | translateX(100%) | cubic-bezier(0.16,1,0.3,1) | ❌ Hardcoded |

### 21.6 UserManagementView — 5 Inline-Modals

`UserManagementView.vue` enthält **5 inline Modal-Implementierungen** (Zeilen 373, 418, 460, 481, 509) statt `BaseModal` zu nutzen:

```vue
<!-- 5× wiederholt: -->
<Transition name="fade">
  <div v-if="isEditingUser" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70">
    <div class="bg-slate-900 rounded-lg p-6 w-full max-w-md">...</div>
  </div>
</Transition>
```

Kein Scroll-Lock, kein Escape-Handler, kein Design-System.

---

## 22. Store & Import-Konsistenz

### 22.1 Store-Architektur (Ist-Zustand)

| Datei in `stores/` | Typ | Zeilen | Status |
|---|---|---|---|
| `esp.ts` | **ECHTE Implementierung** | 1645+ | Aktiv, kein Proxy |

**Legacy-Proxies entfernt:** auth.ts, logic.ts, database.ts, dragState.ts wurden gelöscht. Alle Stores werden jetzt direkt importiert.

### 22.2 Import-Verteilung

| Store | Legacy `@/stores/` | Neu `@/shared/stores/` | Total |
|-------|--------------------|-----------------------|-------|
| `useEspStore` | **21** | 0 | 21 |
| `useAuthStore` | **8** | 0 | 8 |
| `useUiStore` | 0 | **7** | 7 |
| `useLogicStore` | **5** | 0 | 5 |
| `useDragStateStore` | **4** | **2** | 6 (⚠️ gemischt!) |
| `useDashboardStore` | 0 | **2** | 2 |
| `useDatabaseStore` | **1** | 0 | 1 |
| Sub-Stores (zone, actuator, sensor, gpio, notification, config) | 0 | 8 (intern in esp.ts) | 8 |
| **Gesamt** | **39** (61%) | **25** (39%) | 64 |

**Fazit:** Legacy-Proxies entfernt. Alle Stores werden jetzt direkt importiert. `useEspStore` wird weiterhin von `@/stores/esp` importiert (eigenständiger Store, kein Proxy).

### 22.3 Inkonsistenz in Einzeldateien

| Datei | Problem | Detail |
|-------|---------|--------|
| `ZonePlate.vue` | **Gemischte Pfade** | Zeile 21: `useEspStore from '@/stores/esp'`, Zeile 22: `useDragStateStore from '@/shared/stores'` |
| `App.vue` | **Gemischte Pfade** | `useAuthStore from '@/stores/auth'` + `ConfirmDialog from '@/shared/design/patterns'` |
| `DashboardView.vue` | **Gemischte Pfade** | `useEspStore from '@/stores/esp'` + `useUiStore from '@/shared/stores'` |

### 22.4 Barrel-Export Nutzung

| Barrel (`index.ts`) | Exportierte Komponenten | Tatsächliche Barrel-Importe | Nutzungsrate |
|---|---|---|---|
| `components/common/` | 1 (nur GrafanaPanelEmbed) | – | n/a |
| `components/dashboard/` | 13 | **0** | 0% |
| `components/esp/` | 12 | **0** | 0% |
| `components/forms/` | 3 | 2 | 67% ✅ |
| `components/widgets/` | – | – | **GELÖSCHT** |
| `shared/design/primitives/` | 18 (12 Base + 6 Alias) | Einige | ~30% |
| `shared/stores/` | 12 | 7 | 58% |
| `composables/` | 16 | Variabel | ~50% |

**Fazit:** Die meisten Barrel-Files werden ignoriert. Komponenten werden direkt per Dateipfad importiert.

### 22.5 Composables — Kein Duplikat

`useZoomNavigation` wird **nur 1× exportiert** (composables/index.ts Zeile 28). Die frühere Angabe im Dokument (Sektion 8, doppelter Eintrag) war ein Dokumentationsfehler, kein Code-Duplikat.

### 22.6 config/ Dateien

| Datei | Zeilen | Genutzt von | Status |
|-------|--------|------------|--------|
| `config/sensor-schemas.ts` | 391 | `SensorConfigPanel.vue`, `ActuatorConfigPanel.vue` | ✅ Aktiv |
| `config/rule-templates.ts` | 220 | `RuleTemplateCard.vue` | ✅ Aktiv |

---

## 23. Identifizierte Probleme — Priorisierte Übersicht

### 23.1 KRITISCH (sofort beheben)

| # | Problem | Betroffene Dateien | Aufwand |
|---|---------|-------------------|---------|
| K1 | Z-Index 9999/10000 in 6 Komponenten — bricht Overlay-Hierarchie | ErrorDetailsModal, ToastContainer, ZoneGroup, DataSourceSelector, ESPOrbitalLayout.css, EmergencyStopButton | 2-3h |
| K2 | ESPOrbitalLayout.css (1458 Zeilen) fehlplatziert — redefiniert `.btn`, `.btn-primary`, `.btn-danger` | `components/esp/ESPOrbitalLayout.css` | 4-5h |
| K3 | ToastContainer (z-9999) kollidiert mit ErrorDetailsModal (z-9999) — DOM-Order entscheidet | `ToastContainer.vue`, `ErrorDetailsModal.vue` | 0.5h |
| K4 | ESPSettingsSheet `.sheet-content` hat **keinen z-index** definiert | `ESPSettingsSheet.vue:820` | 0.25h |
| K5 | UnassignedDropBar `.drop-bar` hat **keinen z-index** definiert | `UnassignedDropBar.vue` | 0.25h |

### 23.2 HOCH (diese Woche)

| # | Problem | Betroffene Dateien | Aufwand |
|---|---------|-------------------|---------|
| H1 | PendingDevicesPanel: Kein Escape-Handler, kein Scroll-Lock | `PendingDevicesPanel.vue` | 0.5h |
| H2 | ErrorDetailsModal + CommandPalette: Kein Scroll-Lock | `ErrorDetailsModal.vue`, `CommandPalette.vue` | 0.5h |
| H3 | UserManagementView: 5 inline Modals statt BaseModal | `UserManagementView.vue` | 2h |
| H4 | 7 verschiedene Backdrop-Implementierungen — keine Tokens | Alle Modal-Komponenten | 1.5h |
| H5 | ✅ Deprecated Wrapper entfernt (Sektion 20) | App.vue, DashboardView, UnassignedDropBar, ESPOrbitalLayout, AddSensorModal, MaintenanceView | ERLEDIGT |
| H6 | ⚠️ 4 Legacy-Store-Proxies entfernt. `stores/esp.ts` bleibt als einziger Legacy-Import-Pfad. | 39 .vue/.ts Dateien | TEILWEISE ERLEDIGT |
| H7 | MonitorHeader/SystemMonitorView z-index: 100 — über Modals | `MonitorHeader.vue:414`, `SystemMonitorView.vue:1798` | 0.25h |
| H8 | Scroll-Lock Race Condition bei mehreren offenen Modals | Alle scroll-lockenden Modals | 1h (useScrollLock Composable) |

### 23.3 MITTEL (nächster Sprint)

| # | Problem | Betroffene Dateien | Aufwand |
|---|---------|-------------------|---------|
| M1 | ✅ ERLEDIGT: 14 deprecated Wrapper-Dateien + layout/ + widgets/ gelöscht | – | – |
| M2 | Barrel-Files zu 90% ungenutzt (dashboard, esp je 0% Nutzung) | 4 index.ts Dateien | 1h (Entscheidung + Cleanup) |
| M3 | Transition-Inkonsistenz: 3 verschiedene Durations/Easings für Modals | BaseModal, CommandPalette, ESPSettingsSheet | 1h |
| M4 | `@keyframes spin` dupliziert in animations.css + ESPOrbitalLayout.css | 2 Dateien | 0.25h |
| M5 | `--color-text-muted` Kontrast 4.1:1 grenzwertig auf primary bg | Dokumentation/Token | 0.5h |
| M6 | BaseModal nutzt Tailwind `z-50` statt CSS-Variable `var(--z-modal)` | BaseModal.vue, RecordDetailModal.vue | 0.5h |
| M7 | ✅ ERLEDIGT: Widgets-Verzeichnis gelöscht | – | – |

### 23.4 Empfohlene neue Tokens

```css
/* Ergänzung für tokens.css */
--z-safety:         75;    /* Emergency Stop — höchste interaktive Priorität */
--z-toast:          73;    /* Toasts — über Modals, unter Safety */
--z-drag-overlay:   72;    /* Drag-Feedback — ephemeral, über Tooltip */

/* Backdrop-Tokens */
--backdrop-color:         rgba(7, 7, 13, 0.85);   /* Standard */
--backdrop-color-light:   rgba(7, 7, 13, 0.60);   /* Leicht */
--backdrop-blur-strong:   blur(8px);
--backdrop-blur-medium:   blur(4px);
--backdrop-blur-subtle:   blur(2px);
```

### 23.5 Compliance Scorecard

| Kategorie | Score | Details |
|-----------|-------|---------|
| Token-System Design | 9/10 | 76 Tokens, gut organisiert |
| Token-Adoption (Farben, Spacing, Typo) | 9/10 | 95% Compliance |
| **Token-Adoption (Z-Index)** | **3/10** | **Nur ~30% nutzen Tokens** |
| CSS-Organisation | 6/10 | ESPOrbitalLayout.css-Problem |
| Komponenten-Migration | 10/10 | 100% fertig, alle deprecated Wrapper entfernt |
| Store-Migration | 7/10 | Legacy-Proxies entfernt, nur esp.ts verbleibt als eigenständiger Store |
| Overlay-Stacking | 3/10 | Chaotisch, keine konsistente Hierarchie |
| Modal-Features (Scroll-Lock, Escape) | 5/10 | 3 von 6 Modals haben Scroll-Lock |
| Backdrop-Konsistenz | 3/10 | 7 verschiedene Implementierungen |
| Barrel-File-Nutzung | 2/10 | Meiste Barrels ungenutzt |
| **Gesamt** | **5.2/10** | **Strukturell gut, Details inkonsistent** |
