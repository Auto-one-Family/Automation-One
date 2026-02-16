# AutomationOne – Frontend-Architektur (El Frontend)

> **Version:** 2.0 | **Stand:** 2026-02-15
> **Grundlage:** Vollständige Code-Analyse von `El Frontend/src/` (alle Dateien) + Detail-Audit (CSS, z-index, Duplikate, Overlays, Imports)
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
| **State Management** | Pinia (17 Stores: 5 Legacy-Proxies + 12 Shared) |
| **Styling** | Tailwind CSS 3.4 + Scoped CSS + Design Tokens |
| **HTTP-Client** | Axios (mit JWT Token-Refresh-Interceptor) |
| **Echtzeit** | Native WebSocket (Singleton-Service, 28 Event-Typen) |
| **Icons** | Lucide Vue Next |
| **Charts** | Vue Flow (Logic Editor), Custom SVG Charts |
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
    Views (11)    Components (105)   Services/Stores
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
│   └── index.ts                         # Vue Router: 11 aktive Routes, Navigation Guards, Redirects
│
├── views/                               # 11 Views (Seiten)
│   ├── DashboardView.vue                # Haupt-Dashboard mit 3-Level-Zoom (955 Zeilen)
│   ├── LoginView.vue                    # Login mit Particle-Animations (695 Zeilen)
│   ├── SetupView.vue                    # Ersteinrichtung Admin-Account (776 Zeilen)
│   ├── LogicView.vue                    # Node-RED-inspirierter Rule-Editor (1552 Zeilen)
│   ├── SystemMonitorView.vue            # Konsolidierter System-Monitor (2466 Zeilen)
│   ├── SensorsView.vue                  # Sensor + Aktor-Übersicht (692 Zeilen)
│   ├── MaintenanceView.vue              # Wartung + Cleanup-Konfiguration (529 Zeilen)
│   ├── LoadTestView.vue                 # Last-Test-Tool für Mock-ESPs (389 Zeilen)
│   ├── UserManagementView.vue           # Benutzerverwaltung CRUD (566 Zeilen)
│   ├── SystemConfigView.vue             # Systemkonfiguration Key-Value (286 Zeilen)
│   └── SettingsView.vue                 # Benutzer-Einstellungen + Logout (112 Zeilen)
│
├── components/                          # 105 Komponenten in 14 Kategorien
│   ├── charts/         (4 + index)      # Diagramm-Komponenten
│   ├── command/        (1)              # Command Palette
│   ├── common/         (12 + index)     # UI-Primitive (Button, Card, Modal, ...)
│   ├── dashboard/      (14 + index)     # Dashboard-Level-Komponenten
│   ├── database/       (6)              # Database Explorer
│   ├── error/          (2)              # Error-Details + Troubleshooting
│   ├── esp/            (22 + index)     # ESP-Device-Verwaltung
│   ├── filters/        (1 + index)      # Filter-Leisten
│   ├── forms/          (3 + index)      # Dynamische Formulare
│   ├── layout/         (3)              # App-Shell (Header, Sidebar, MainLayout)
│   ├── modals/         (2)              # Globale Modals
│   ├── rules/          (5)              # Logic-Rule-Editor
│   ├── safety/         (1)              # Emergency-Stop
│   ├── system-monitor/ (20 + index)     # System-Monitor-Tabs
│   ├── widgets/        (5 + index)      # Dashboard-Widgets
│   └── zones/          (6)              # Zone-Verwaltung
│
├── shared/
│   ├── design/                          # Design System
│   │   ├── primitives/ (9 + index)      # BaseBadge, BaseButton, BaseCard, ...
│   │   ├── layout/     (3 + index)      # AppShell, Sidebar, TopBar
│   │   └── patterns/   (5 + index)      # ConfirmDialog, ContextMenu, Toast, ...
│   └── stores/         (12 + index)     # Shared Pinia Stores (kanonisch)
│
├── stores/             (5)              # Legacy-Proxies → shared/stores/
├── composables/        (15 + index)     # Vue 3 Composition API Utilities
├── api/                (17 + index)     # Axios API-Module
├── services/
│   └── websocket.ts                     # WebSocket Singleton-Service (686 Zeilen)
├── types/              (6 + index)      # TypeScript-Definitionen
├── utils/              (16 + index)     # Utility-Funktionen
└── styles/             (5)              # CSS-Dateien
```

---

## 3. Routing und Navigation

### 3.1 Route-Struktur

| Route | View | Auth | Admin | Beschreibung |
|-------|------|------|-------|-------------|
| `/login` | LoginView | Nein | – | JWT-Login |
| `/setup` | SetupView | Nein | – | Ersteinrichtung (Admin-Account erstellen) |
| `/` | DashboardView | Ja | – | Haupt-Dashboard mit Zoom-Navigation |
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
| `/devices` | `/` | 2025-01-04 |
| `/devices/:espId` | `/?openSettings={espId}` | 2025-01-04 |
| `/mock-esp` | `/` | 2025-01-04 |
| `/database` | `/system-monitor?tab=database` | 2026-01-23 |
| `/logs` | `/system-monitor?tab=logs` | 2026-01-23 |
| `/audit` | `/system-monitor?tab=events` | 2026-01-24 |
| `/mqtt-log` | `/system-monitor?tab=mqtt` | 2026-01-23 |
| `/actuators` | `/sensors?tab=actuators` | 2025-01-04 |

### 3.3 Navigation Guards

1. **Setup-Guard:** Wenn `setupRequired === true` → Redirect zu `/setup`
2. **Auth-Guard:** Wenn `requiresAuth` und nicht authentifiziert → Redirect zu `/login`
3. **Admin-Guard:** Wenn `requiresAdmin` und kein Admin → Redirect zu `/`
4. **Post-Auth-Guard:** Authentifizierte User werden von `/login` und `/setup` weggeleitet

---

## 4. Views (11 Seiten)

### 4.1 DashboardView (~955 Zeilen)

**Haupt-Dashboard mit 3-Level-Zoom-Navigation.**

| Level | Ansicht | Komponente | Inhalt |
|-------|---------|-----------|--------|
| **1** | Zone Overview | `ZonePlate` (pro Zone) | Alle Zonen als Karten mit Device-Count, Status |
| **2** | Zone Detail | `ZoneMonitorView` | Einzelne Zone mit Sensor-/Aktor-Live-Daten |
| **3** | Device Detail | `DeviceDetailView` | ESP mit Orbital-Layout (Sensoren/Aktoren als Satelliten) |

**Besonderheit:** Alle 3 Levels existieren gleichzeitig im DOM (`v-show`), verbunden durch CSS-Zoom-Transitions. Level-2 öffnet bei Klick auf ein Device den `ESPSettingsSheet` als Slide-In statt Level 3.

**Genutzte Composables:** `useZoomNavigation`, `useZoneDragDrop`, `useKeyboardShortcuts`, `useSwipeNavigation`

**Genutzte Stores:** `espStore`, `logicStore`, `uiStore`, `dashboardStore`

**Sub-Komponenten:** CreateMockEspModal, ESPSettingsSheet, ComponentSidebar, UnassignedDropBar, PendingDevicesPanel, ZonePlate, ZoneMonitorView, DeviceDetailView

### 4.2 LoginView (~695 Zeilen)

**Mission-Control-Login mit animiertem Design.**

- Ambient Particle Field (CSS-only)
- Logo Scanline Sweep + Breathe Glow
- Server-Telemetrie im Footer (Health-Status, Device-Count, Uptime)
- WebSocket-Status-Anzeige
- Success-Celebration-Animation nach Login
- Rein BEM-scoped CSS (kein Tailwind)

### 4.3 SetupView (~776 Zeilen)

**Ersteinrichtung: Admin-Account erstellen.**

- Visuell identisch mit LoginView (gleiche Aesthetic)
- Passwort-Stärke-Indikator (Gradient-Bar rot → gelb → irisierend)
- Requirement-Checks: 8 Zeichen, Groß-/Kleinbuchstabe, Zahl, Sonderzeichen
- Rein BEM-scoped CSS (kein Tailwind)

### 4.4 LogicView (~1.552 Zeilen)

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

### 4.5 SystemMonitorView (~2.466 Zeilen)

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

### 4.6 SensorsView (~692 Zeilen)

**Kombinierte Sensor- und Aktor-Übersicht mit Tab-Navigation.**

- Tab "Sensoren": Alle Sensoren aller ESPs, Filter nach Typ, Qualität, ESP
- Tab "Aktoren": Alle Aktoren, Filter nach Status (on/off/emergency)
- `EmergencyStopButton` für globalen Notfall-Stop
- URL-Sync: `?tab=actuators`
- Visuelles Feedback bei Live-Updates (Highlight-Animation)

### 4.7 MaintenanceView (~529 Zeilen)

**Wartungs-Dashboard für System-Administration.**

- Service-Status (Running/Stopped, ESP-Count, Sensor-Count)
- Cleanup-Konfiguration (Retention, Auto-Cleanup)
- Manueller Cleanup-Trigger
- Cleanup-History (letzte Ausführungen)

### 4.8 LoadTestView (~389 Zeilen)

**Last-Test-Tool für Mock-ESP-Szenarien.**

- Bulk-Create: N Mock-ESPs mit Sensoren/Aktoren erstellen
- Simulation starten/stoppen (Intervall, Dauer)
- Live-Metriken-Dashboard (Auto-Refresh)
- Cleanup aller Last-Test-ESPs

### 4.9 UserManagementView (~566 Zeilen)

**Benutzerverwaltung mit vollständigem CRUD.**

- User-Liste mit Rollen-Badges (Admin, Operator, Viewer)
- Create/Edit/Delete User
- Passwort-Reset durch Admin
- Eigenes Passwort ändern

### 4.10 SystemConfigView (~286 Zeilen)

**Key-Value Systemkonfiguration.**

- Config-Einträge nach Typ gruppiert
- Inline-Editing
- Secret-Werte maskiert (Toggle zum Anzeigen)
- Typ-Filter

### 4.11 SettingsView (~112 Zeilen)

**Benutzer-Einstellungen.**

- User-Info (Username, Email, Rolle)
- API-URL-Anzeige
- Logout (einzeln oder alle Geräte)

---

## 5. Komponenten (105 Dateien)

### 5.1 Layout (3 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `MainLayout.vue` | Wrapper für authentifizierte Seiten: Sidebar + TopBar + Content-Area |
| `AppHeader.vue` | Obere Navigationsleiste (veraltet, wird durch TopBar im Design System ersetzt) |
| `AppSidebar.vue` | Seitliche Navigation: Logo, Nav-Links, Collapse-Toggle, User-Info |

### 5.2 Dashboard (14 Komponenten)

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

### 5.3 ESP (22 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `ESPCard.vue` | Standard ESP-Gerätekarte: Status, Name, Zone, Sensoren, Aktoren |
| `ESPOrbitalLayout.vue` | Orbital-Darstellung: ESP im Zentrum, Sensoren/Aktoren als Satelliten im Kreis |
| `ESPOrbitalLayout.css` | Zugehörige CSS-Animationen für Orbital-Darstellung |
| `ESPSettingsSheet.vue` | Slide-In-Panel: ESP-Konfiguration (Name, Zone, GPIO-Status, Sensor/Aktor-Verwaltung) |
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

### 5.4 Zones (6 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `ZoneDetailView.vue` | Zone-Detail (Level 2): Alle ESPs einer Zone mit DeviceSummaryCards |
| `ZoneMonitorView.vue` | Zone-Monitor: Live-Sensor-/Aktor-Daten einer Zone |
| `ZoneGroup.vue` | Gruppierung von ESPs nach Zone |
| `DeviceSummaryCard.vue` | Kompakte ESP-Übersicht innerhalb einer Zone: Status, Sensoren, Aktoren |
| `SubzoneArea.vue` | Subzone-Bereich: Darstellung einer Subzone mit zugehörigen Sensoren/Aktoren |
| `ZoneAssignmentPanel.vue` | Panel für Zone-Zuweisungen (Drag-and-Drop) |

### 5.5 Rules/Logic (5 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `RuleFlowEditor.vue` | Vue Flow Canvas: Visueller Regel-Editor mit Custom Nodes und Edges |
| `RuleNodePalette.vue` | Node-Palette: Draggable Nodes (Sensor-Trigger, Time-Window, Actuator-Action, etc.) |
| `RuleConfigPanel.vue` | Konfigurations-Panel: Einstellungen für den selektierten Node (Schwellwerte, GPIO, etc.) |
| `RuleCard.vue` | Regel-Karte: Kompakte Darstellung einer Rule (Name, Status, letzte Ausführung) |
| `RuleTemplateCard.vue` | Regel-Template: Vordefinierte Regel-Vorlagen zum schnellen Erstellen |

### 5.6 System Monitor (20 Komponenten)

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

### 5.7 Charts (4 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `GaugeChart.vue` | Gauge/Tacho-Diagramm: Sensor-Wert als halbkreisförmiges Gauge |
| `LiveLineChart.vue` | Live-Liniendiagramm: Echtzeit-Sensor-Verlauf |
| `MultiSensorChart.vue` | Multi-Sensor-Chart: Mehrere Sensoren im Vergleich |
| `StatusBarChart.vue` | Status-Balkendiagramm: Verteilung von Zuständen |

### 5.8 Common (12 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `Badge.vue` | Farbiges Label/Badge |
| `Button.vue` | Standard-Button mit Varianten |
| `Card.vue` | Container-Karte |
| `EmptyState.vue` | Platzhalter bei leeren Daten |
| `ErrorState.vue` | Fehler-Anzeige |
| `GrafanaPanelEmbed.vue` | Grafana-Panel als iFrame eingebettet |
| `Input.vue` | Eingabefeld |
| `LoadingState.vue` | Lade-Animation |
| `Modal.vue` | Modal-Dialog |
| `Select.vue` | Dropdown-Auswahl |
| `Spinner.vue` | Lade-Spinner |
| `ToastContainer.vue` | Toast-Notification-Container (zeigt alle aktiven Toasts) |
| `Toggle.vue` | Toggle-Switch |

### 5.9 Database (6 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `DataTable.vue` | Tabellen-Darstellung: Sortierbar, Spalten-Auswahl |
| `FilterPanel.vue` | Filter für DB-Abfragen |
| `Pagination.vue` | Seitennavigation für Tabellen-Daten |
| `RecordDetailModal.vue` | Modal: Einzelner Datensatz im Detail |
| `SchemaInfoPanel.vue` | Schema-Info: Spalten, Typen, Indizes einer Tabelle |
| `TableSelector.vue` | Tabellen-Auswahl-Sidebar |

### 5.10 Error (2 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `ErrorDetailsModal.vue` | Modal: Detaillierte Fehler-Anzeige mit Stack-Trace und Kontext |
| `TroubleshootingPanel.vue` | Panel: Fehlerbehebungs-Vorschläge vom Server |

### 5.11 Forms (3 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `DynamicForm.vue` | Dynamisch generiertes Formular aus Schema-Definition |
| `FormField.vue` | Einzelnes Formularfeld mit Label, Validierung, Fehlermeldung |
| `FormGroup.vue` | Gruppierung von Formularfeldern |

### 5.12 Filters (1 Komponente)

| Komponente | Beschreibung |
|-----------|-------------|
| `UnifiedFilterBar.vue` | Universelle Filter-Leiste: Suchfeld, Dropdowns, Chips |

### 5.13 Modals (2 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `CreateMockEspModal.vue` | Modal: Mock-ESP erstellen (Name, Sensoren, Aktoren) |
| `RejectDeviceModal.vue` | Modal: Gerät ablehnen mit Begründung |

### 5.14 Safety (1 Komponente)

| Komponente | Beschreibung |
|-----------|-------------|
| `EmergencyStopButton.vue` | Globaler Emergency-Stop-Button: Großer roter Button, Bestätigungs-Dialog |

### 5.15 Command (1 Komponente)

| Komponente | Beschreibung |
|-----------|-------------|
| `CommandPalette.vue` | Spotlight-artige Suchleiste (Ctrl+K): Fuzzy-Search über Navigation, Geräte, Aktionen |

### 5.16 Widgets (5 Komponenten)

| Komponente | Beschreibung |
|-----------|-------------|
| `WidgetGrid.vue` | Grid-Layout für Dashboard-Widgets |
| `WidgetCard.vue` | Widget-Container mit Header und Content-Slot |
| `DeviceStatusWidget.vue` | Widget: Geräte-Status-Übersicht (Online/Offline/Warning) |
| `SensorOverviewWidget.vue` | Widget: Sensor-Übersicht (Typen, Anzahl, Qualität) |
| `SystemHealthWidget.vue` | Widget: System-Health (Server, MQTT, DB) |

---

## 6. Design System (`shared/design/`)

Dreistufiges Design System:

### 6.1 Primitives (9 Komponenten)

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

## 7. Pinia Stores (17 Stores)

### 7.1 Store-Architektur

Die Stores sind in zwei Schichten organisiert:

```
stores/                          shared/stores/
├── esp.ts      (Haupt-Store)    ├── auth.store.ts       (kanonisch)
├── auth.ts     → Re-Export      ├── logic.store.ts      (kanonisch)
├── logic.ts    → Re-Export      ├── database.store.ts   (kanonisch)
├── database.ts → Re-Export      ├── dragState.store.ts  (kanonisch)
├── dragState.ts → Re-Export     ├── ui.store.ts         (kanonisch)
                                 ├── dashboard.store.ts  (kanonisch)
                                 ├── zone.store.ts       (kanonisch)
                                 ├── sensor.store.ts     (kanonisch)
                                 ├── actuator.store.ts   (kanonisch)
                                 ├── gpio.store.ts       (kanonisch)
                                 ├── notification.store.ts (kanonisch)
                                 └── config.store.ts     (kanonisch)
```

Die 5 Dateien in `stores/` sind **Legacy-Proxies** (deprecated), die per Re-Export auf `shared/stores/` verweisen. Ausnahme: `esp.ts` ist der Haupt-Store (~1.645 Zeilen) und bleibt eigenständig.

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

## 8. Composables (15 Stück)

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

---

## 9. API-Module (17 Stück)

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

### 20.1 Design-System-Migration: 90% abgeschlossen

Die Migration von `components/common/` + `components/layout/` → `shared/design/` ist strukturell abgeschlossen, aber **6 Dateien importieren noch vom alten Pfad**.

### 20.2 Doppelte Komponenten (14 Paare)

Alle deprecated-Dateien sind 5-Zeilen-Wrapper mit `@deprecated` Kommentar:

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

### 20.3 Dateien die noch vom alten Pfad importieren (6 Stück)

| Datei | Import | Zeile | Sollte sein |
|-------|--------|-------|-------------|
| `App.vue` | `import ToastContainer from '@/components/common/ToastContainer.vue'` | 6 | `from '@/shared/design/patterns/ToastContainer.vue'` |
| `DashboardView.vue` | `import { LoadingState, EmptyState } from '@/components/common'` | 42 | `from '@/shared/design/patterns'` |
| `UnassignedDropBar.vue` | `import Badge from '@/components/common/Badge.vue'` | 24 | `from '@/shared/design/primitives'` |
| `ESPOrbitalLayout.vue` | `import Badge from '@/components/common/Badge.vue'` | 30 | `from '@/shared/design/primitives'` |
| `AddSensorModal.vue` | `import Badge from '@/components/common/Badge.vue'` | 16 | `from '@/shared/design/primitives'` |
| `MaintenanceView.vue` | `import LoadingState from '@/components/common/LoadingState.vue'` | 202 | `from '@/shared/design/patterns'` |

**Inkonsistenz in `App.vue`:** Mischt deprecated (`ToastContainer from common`) mit kanonisch (`ConfirmDialog from shared/design/patterns`) im selben File.

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
| `auth.ts` | Re-Export-Proxy | 2 | `@deprecated` → `shared/stores/auth.store` |
| `logic.ts` | Re-Export-Proxy | 2 | `@deprecated` → `shared/stores/logic.store` |
| `database.ts` | Re-Export-Proxy | 2 | `@deprecated` → `shared/stores/database.store` |
| `dragState.ts` | Re-Export-Proxy + Types | 3 | `@deprecated` → `shared/stores/dragState.store` |

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

**Fazit:** 39 Dateien importieren noch vom Legacy-Pfad. Neue Stores (`useUiStore`, `useDashboardStore`) werden korrekt vom neuen Pfad importiert.

### 22.3 Inkonsistenz in Einzeldateien

| Datei | Problem | Detail |
|-------|---------|--------|
| `ZonePlate.vue` | **Gemischte Pfade** | Zeile 21: `useEspStore from '@/stores/esp'`, Zeile 22: `useDragStateStore from '@/shared/stores'` |
| `App.vue` | **Gemischte Pfade** | `useAuthStore from '@/stores/auth'` + `ConfirmDialog from '@/shared/design/patterns'` |
| `DashboardView.vue` | **Gemischte Pfade** | `useEspStore from '@/stores/esp'` + `useUiStore from '@/shared/stores'` |

### 22.4 Barrel-Export Nutzung

| Barrel (`index.ts`) | Exportierte Komponenten | Tatsächliche Barrel-Importe | Nutzungsrate |
|---|---|---|---|
| `components/common/` | 10 | 1 (DashboardView) | 10% |
| `components/dashboard/` | 15 | **0** | 0% |
| `components/esp/` | 12 | **0** | 0% |
| `components/forms/` | 3 | 2 | 67% ✅ |
| `components/widgets/` | 5 | **0** | 0% |
| `shared/design/primitives/` | 18 (9 Base + 9 Alias) | Einige | ~30% |
| `shared/stores/` | 12 | 7 | 58% |
| `composables/` | 14 | Variabel | ~50% |

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
| H5 | 6 Dateien importieren noch von deprecated `@/components/common/` | App.vue, DashboardView, UnassignedDropBar, ESPOrbitalLayout, AddSensorModal, MaintenanceView | 1h |
| H6 | 39 Dateien importieren Store vom Legacy-Pfad `@/stores/` | 39 .vue/.ts Dateien | 2h |
| H7 | MonitorHeader/SystemMonitorView z-index: 100 — über Modals | `MonitorHeader.vue:414`, `SystemMonitorView.vue:1798` | 0.25h |
| H8 | Scroll-Lock Race Condition bei mehreren offenen Modals | Alle scroll-lockenden Modals | 1h (useScrollLock Composable) |

### 23.3 MITTEL (nächster Sprint)

| # | Problem | Betroffene Dateien | Aufwand |
|---|---------|-------------------|---------|
| M1 | 14 deprecated Wrapper-Dateien (components/common + layout) — bereit zum Löschen nach H5 | 14 .vue Dateien | 0.5h |
| M2 | Barrel-Files zu 90% ungenutzt (dashboard, esp, widgets je 0% Nutzung) | 5 index.ts Dateien | 1h (Entscheidung + Cleanup) |
| M3 | Transition-Inkonsistenz: 3 verschiedene Durations/Easings für Modals | BaseModal, CommandPalette, ESPSettingsSheet | 1h |
| M4 | `@keyframes spin` dupliziert in animations.css + ESPOrbitalLayout.css | 2 Dateien | 0.25h |
| M5 | `--color-text-muted` Kontrast 4.1:1 grenzwertig auf primary bg | Dokumentation/Token | 0.5h |
| M6 | BaseModal nutzt Tailwind `z-50` statt CSS-Variable `var(--z-modal)` | BaseModal.vue, RecordDetailModal.vue | 0.5h |
| M7 | Widgets-Barrel exportiert 5 Komponenten die nirgends importiert werden | `components/widgets/index.ts` | Prüfen ob Dead Code |

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
| Komponenten-Migration | 8/10 | 90% fertig, 6 Dateien offen |
| Store-Migration | 4/10 | 61% nutzen noch Legacy-Pfad |
| Overlay-Stacking | 3/10 | Chaotisch, keine konsistente Hierarchie |
| Modal-Features (Scroll-Lock, Escape) | 5/10 | 3 von 6 Modals haben Scroll-Lock |
| Backdrop-Konsistenz | 3/10 | 7 verschiedene Implementierungen |
| Barrel-File-Nutzung | 2/10 | Meiste Barrels ungenutzt |
| **Gesamt** | **5.2/10** | **Strukturell gut, Details inkonsistent** |
