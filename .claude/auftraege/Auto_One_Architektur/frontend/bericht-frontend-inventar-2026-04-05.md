# Bericht: El Frontend — vollständiges Inventar (IST)

**Erstellt:** 2026-04-05  
**Quelle:** ausschließlich Pfade unter `El Frontend/` im Repository AutomationOne.  
**Auftragsreferenz:** `.claude/auftraege/Auto_One_Architektur/frontend/analyseauftrag-el-frontend-komplett-inventar-2026-04-05.md`

---

## 1. Drift-Register (Abschnitt 1.9 — mit IST-Zahlen)

| Thema | IST (Code) |
|-------|------------|
| Anzahl Views (`*.vue` unter `src/views/`) | **17** Dateien |
| Routen inkl. Redirects | **41** `path`-Einträge in `src/router/index.ts` (inkl. Redirect-Routen, Child-Routen, Catch-all) |
| Root-Route `/` | Redirect auf `/hardware` (Kind mit `path: ''`) |
| SystemMonitor-Tabs | **8** Tabs in `MonitorTabs.vue`: events, logs, database, mqtt, health, diagnostics, reports, hierarchy |
| Komponenten `.vue` außerhalb `views/` | **168** (gesamt `src/**/*.vue`: **185**, minus 17 Views) — Messung: PowerShell `Get-ChildItem -Recurse` |
| `.ts` unter `src/` | **138** Dateien |
| Pinia: `shared/stores/*.store.ts` (+ `index.ts`) | **21** Dateien in `shared/stores/` (20 Stores + `index.ts`) |
| Pinia: `stores/` | **2** Dateien: `esp.ts`, `esp-websocket-subscription.ts` |
| API-Module `src/api/*.ts` | **27** Dateien |
| Composables `src/composables/*.ts` | **33** Dateien (inkl. `index.ts`) |
| WebSocket: `ESP_STORE_WS_ON_HANDLER_TYPES` | **34** Event-Namen (kanonische ESP-Store-Subscriptions) |
| WebSocket: `WS_EVENT_TYPES` (System Monitor / Contract) | **52** Einträge in `utils/contractEventMapper.ts` |
| Tests unter `El Frontend/tests/` | **91** `*.ts`-Dateien (Vitest + Playwright) |
| Test-Konvention | **Drift:** zusätzlich zu `tests/unit` existieren `tests/e2e/` (Playwright) und `tests/mocks/` — alles unter `El Frontend/tests/`, **keine** Tests unter `src/` gefunden |
| Legacy-Dashboard `DashboardView` | **Nicht** als aktive Route: `path: 'dashboard-legacy'` → Redirect `/hardware`. Keine `DashboardView.vue` unter `views/` |
| Hypothese `/dashboards` | **Drift:** Editor-Routen sind `/editor`, `/editor/:dashboardId` (nicht `/dashboards`) |
| Hypothese Hardware 3-Level-URLs | **Teil-Drift:** Router führt `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId`; dieselbe View (`HardwareView.vue`) verarbeitet die Ebenen |
| Verwaiste / ungeroutete Views | `SensorHistoryView.vue`: **kein** `component`-Eintrag im Router (Redirect `/sensor-history` → `/monitor`). `MaintenanceView.vue`: **kein** direkter Route-`component` (Redirect `/maintenance` → `/system-monitor?tab=health`) |

---

## 2. Globale Kennzahlen (Tabelle 3.1)

| Metrik | Wert | Messmethode |
|--------|------|-------------|
| Views (`src/views/*.vue`) | 17 | Glob |
| Routen inkl. Redirects | 41 `path`-Einträge | `src/router/index.ts` |
| `.vue` gesamt `src/` | 185 | `Get-ChildItem -Recurse -Filter '*.vue'` |
| `.vue` außerhalb `views/` | 168 | 185 − 17 |
| Pinia Stores (produktiv) | 20 in `shared/stores/` + ESP in `stores/esp.ts` | Dateiliste |
| API-Module | 27 | `src/api/*.ts` |
| Composables | 33 | `src/composables/*.ts` |
| WS-Events ESP-Store (Anzahl) | 34 | `src/stores/esp-websocket-subscription.ts` |
| WS-Events Contract-Liste (Anzahl) | 52 | `src/utils/contractEventMapper.ts` → `WS_EVENT_TYPES` |
| Unit-/E2E-Tests | 91 TS-Dateien unter `tests/` | Glob; Ausführung: `npm test`, `npm run test:e2e` |

---

## 3. Router-Karte (IST)

**Datei:** `El Frontend/src/router/index.ts`  
**Lazy-Loading:** alle geschützten Views über `lazyView(() => import(...))`.

### 3.1 Öffentlich

| Pfad | Name | View | meta |
|------|------|------|------|
| `/login` | login | `views/LoginView.vue` | `requiresAuth: false` |
| `/setup` | setup | `views/SetupView.vue` | `requiresAuth: false` |

### 3.2 Geschützt (Parent: `AppShell.vue`)

| Pfad | Name | View / Redirect | meta / Hinweis |
|------|------|-----------------|----------------|
| `/` | — | redirect → `/hardware` | — |
| `/hardware` | hardware | `HardwareView.vue` | `title: Übersicht` |
| `/hardware/:zoneId` | hardware-zone | `HardwareView.vue` | — |
| `/hardware/:zoneId/:espId` | hardware-esp | `HardwareView.vue` | — |
| `/monitor` | monitor | `MonitorView.vue` | `title: Monitor` |
| `/monitor/dashboard/:dashboardId` | — | **Redirect** → `/editor/:dashboardId` | DEPRECATED 2026-03-26 |
| `/monitor/:zoneId` | monitor-zone | `MonitorView.vue` | — |
| `/monitor/:zoneId/sensor/:sensorId` | monitor-sensor | `MonitorView.vue` | — |
| `/monitor/:zoneId/dashboard/:dashboardId` | monitor-zone-dashboard | `MonitorView.vue` | — |
| `/editor` | editor | `CustomDashboardView.vue` | `title: Editor` |
| `/editor/:dashboardId` | editor-dashboard | `CustomDashboardView.vue` | — |
| `/custom-dashboard` | — | **Redirect** `/editor` | DEPRECATED |
| `/dashboard-legacy` | — | **Redirect** `/hardware` | LEGACY DashboardView |
| `/devices` | devices | **Redirect** `/hardware` | DEPRECATED |
| `/devices/:espId` | device-detail | **Redirect** `/hardware?openSettings=:espId` | DEPRECATED |
| `/mock-esp` | — | **Redirect** `/hardware` | DEPRECATED |
| `/mock-esp/:espId` | — | **Redirect** `/hardware?openSettings=:espId` | DEPRECATED |
| `/database` | database | **Redirect** `/system-monitor?tab=database` | DEPRECATED |
| `/logs` | logs | **Redirect** `/system-monitor?tab=logs` | DEPRECATED |
| `/system-monitor` | system-monitor | `SystemMonitorView.vue` | `requiresAdmin: true` |
| `/audit` | audit | **Redirect** `/system-monitor?tab=events` | DEPRECATED |
| `/users` | users | `UserManagementView.vue` | `requiresAdmin: true` |
| `/system-config` | system-config | `SystemConfigView.vue` | `requiresAdmin: true` |
| `/load-test` | load-test | `LoadTestView.vue` | `requiresAdmin: true` |
| `/mqtt-log` | mqtt-log | **Redirect** `/system-monitor?tab=mqtt` | DEPRECATED |
| `/maintenance` | maintenance | **Redirect** `/system-monitor?tab=health` | — |
| `/plugins` | plugins | `PluginsView.vue` | `requiresAdmin: true` |
| `/email` | email-postfach | `EmailPostfachView.vue` | `requiresAdmin: true` |
| `/sensors` | sensors | `SensorsView.vue` | `title: Komponenten` |
| `/actuators` | actuators | **Redirect** `/sensors?tab=actuators` | DEPRECATED |
| `/logic` | logic | `LogicView.vue` | `title: Automatisierung` |
| `/logic/:ruleId` | logic-rule | `LogicView.vue` | — |
| `/settings` | settings | `SettingsView.vue` | `title: Einstellungen` |
| `/calibration` | calibration | `CalibrationView.vue` | `requiresAdmin: true` |
| `/sensor-history` | sensor-history | **Redirect** `/monitor` | DEPRECATED |

### 3.3 Catch-all

| Pfad | Ziel |
|------|------|
| `/:pathMatch(.*)*` | Redirect `/hardware` |

**Navigation Guards:** `beforeEach` in derselben Datei — Setup-Pflicht, JWT, Admin → sonst `hardware`.

---

## 4. G3 — SensorConfigPanel & ActuatorConfigPanel

### 4.1 `import ... SensorConfigPanel` / Template-Nutzung

| Elternkomponente | Pfad | Route / Kontext |
|------------------|------|-----------------|
| `HardwareView` | `src/views/HardwareView.vue` | `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId` — SlideOver nach Sensor-Klick (Orbital emit) |

**Weitere Treffer:** nur Kommentare/Doku/Tests/Hilfskomponenten, **kein** zweites `import` einer Eltern-View:

- `src/components/esp/ESPOrbitalLayout.vue` — emit an Parent (kein eigenes Panel)
- `src/views/SensorsView.vue` — **explizit dokumentiert:** kein SensorConfigPanel
- `tests/e2e/scenarios/subzone-monitor-flow.spec.ts` — Kommentar
- `tests/unit/components/ESPSettingsSheet.test.ts` — Stub
- `README.md`, `Docs/...` — außerhalb `src/` (dieser Bericht zitiert nur Repo-Pfade; die Aussage „nicht in SensorsView“ stützt sich auf `SensorsView.vue` und fehlenden Import)

### 4.2 ActuatorConfigPanel

| Elternkomponente | Pfad | Route |
|------------------|------|-------|
| `HardwareView` | `src/views/HardwareView.vue` | `/hardware*` |

**Bestätigung G3:** In `SensorsView.vue` gibt es **keinen** Import von `SensorConfigPanel` oder `ActuatorConfigPanel`.

---

## 5. Rollen: `shared/stores/` vs. `stores/`

| Ort | Rolle |
|-----|--------|
| `src/shared/stores/*.store.ts` | Domänen- und UI-Stores (Auth, Zone, Logic, Dashboard, Inventar, Benachrichtigungen, …), über `shared/stores/index.ts` gebündelt exportierbar. |
| `src/stores/esp.ts` | Zentraler **ESP-/Geräte-SSOT** inkl. `initWebSocket()` und Orchestrierung der WS-Handler (ruft Methoden anderer Stores auf). |
| `src/stores/esp-websocket-subscription.ts` | **Contract:** Liste der `ws.on`-Typen, die mit `useWebSocket({ filters.types })` passieren müssen — muss mit `esp.ts` übereinstimmen. |

---

## 6. Store → API → WebSocket (Kern, G4)

> **Hinweis:** Viele Handler leben in `esp.ts` und delegieren an spezialisierte Stores. Semantik typischerweise **Merge in Gerätelisten** (`devices[]`), **Replace** bei kompletten Refetches nur über REST.

| Store-Datei | Wesentliche Actions / Rolle | API (Beispiele) | WS-Events (über `esp.ts` oder eigen) | Persistenz |
|-------------|----------------------------|-----------------|--------------------------------------|------------|
| `auth.store.ts` | Login, Refresh, Logout | `api/auth.ts` | — | Tokens / LocalStorage (im Store implementiert) |
| `zone.store.ts` | Zonen-CRUD, Assignment-Toasts | `api/zones.ts`, `api/subzones.ts` | `zone_assignment`, `subzone_assignment`, `device_scope_changed`, `device_context_changed` | Nein (Server) |
| `dashboard.store.ts` | Layouts, Widgets, Sync | `api/dashboards.ts` | indirekt über Geräte-/Zonendaten | Server + lokale Layout-Hilfen (siehe Store) |
| `logic.store.ts` | Regeln, History, Undo | `api/logic.ts` | **eigen:** `websocketService.subscribe` für `logic_execution` | Nein / REST-History |
| `sensor.store.ts` | Sensor-Datenpfade | über REST in anderen Layern | `sensor_data`, `sensor_health` (Handler in esp) | Nein |
| `actuator.store.ts` | Aktor-Status, Sequenzen | `api/actuators.ts` | `actuator_*`, `sequence_*` | Nein |
| `config.store.ts` | Config-Lifecycle | `api/sensors.ts`, `api/esp.ts`, … | `config_response`, `config_published`, `config_failed` | Nein |
| `notification.store.ts` | Toasts / Meldungen | — | `notification`, `error_event`, `system_event` | Nein |
| `notification-inbox.store.ts` | Inbox | `api/notifications.ts` | `notification_new`, `notification_updated`, `notification_unread_count` (von esp aufgerufen) | Nein |
| `deviceContext.store.ts` | Mobiler/Multi-Zone-Kontext | `api/device-context.ts` | `device_context_changed` | Nein |
| `inventory.store.ts` | Inventar-UI | `api/inventory.ts`, Zonen APIs | über ESP-/Scope-Events | Nein |
| `intentSignals.store.ts` | Intent-Anzeige | `api/intentOutcomes.ts` (optional) | `intent_outcome`, `intent_outcome_lifecycle` via esp | Nein |
| `gpio.store.ts` | GPIO-Karte | `api/esp.ts` / health | `esp_health` (Ableitung) | Nein |
| `esp.ts` (Store) | `devices`, WS-Zentrale | `api/esp.ts`, diverse | **alle** in `ESP_STORE_WS_ON_HANDLER_TYPES` | Nein |
| `database.store.ts` | DB-Explorer | `api/database.ts` | — | Nein |
| `diagnostics.store.ts` | Diagnose | `api/diagnostics.ts` | — | Nein |
| `plugins.store.ts` | Plugins | `api/plugins.ts` | nicht in ESP-Subscription-Liste gefunden (`plugin_execution_*` fehlt in `esp-websocket-subscription.ts`) | Nein |
| `quickAction.store.ts` | FAB / Menü | — | — | Nein |
| `dragState.store.ts` | DnD-Flags | — | — | teils Timeout |
| `ui.store.ts` | UI-Zustand | — | — | optional localStorage |
| `alert-center.store.ts` | Alarme | REST alerts | — | Nein |
**G4-Ergänzung:** `logic_execution` ist in `MessageType` (`types/index.ts`) und wird im `logic.store` abonniert, steht aber **nicht** in `ESP_STORE_WS_ON_HANDLER_TYPES`.

---

## 7. API-Schicht (`src/api/`)

| Datei | Inhalt (kurz) |
|-------|----------------|
| `index.ts` | Axios-Instanz, Interceptors, JWT-Refresh |
| `auth.ts` | Auth-Endpunkte |
| `esp.ts` | ESP-Geräte (Mock/Real vereinheitlicht) |
| `sensors.ts` | Sensor CRUD, Historie |
| `actuators.ts` | Aktor-Befehle |
| `zones.ts`, `subzones.ts` | Zonen/Subzonen |
| `device-context.ts` | Device Context T13-R3 |
| `logic.ts` | Regeln |
| `dashboards.ts` | Dashboard-Layouts |
| `notifications.ts` | Inbox |
| `intentOutcomes.ts` | Intent-Outcomes REST |
| `inventory.ts` | Inventar/Wissensdatenbank |
| `backups.ts`, `users.ts`, `audit.ts`, `logs.ts`, `database.ts` | Admin/Ops |
| `diagnostics.ts`, `health.ts`, `debug.ts`, `loadtest.ts` | Diagnose/Debug/Last |
| `calibration.ts`, `config.ts`, `plugins.ts` | Kalibrierung, Config, Plugins |
| `errors.ts`, `parseApiError.ts` | Fehler-Mapping / Parsing |

**Zentrale Fehlerhilfen:** `api/parseApiError.ts`, `utils/errorCodeTranslator.ts` (UI-Texte).

---

## 8. WebSocket — Eventnamen und Abgleich

### 8.1 ESP-Store (`ESP_STORE_WS_ON_HANDLER_TYPES`)

`El Frontend/src/stores/esp-websocket-subscription.ts` — **35** Typen (Reihenfolge wie Datei):

`actuator_alert`, `actuator_command`, `actuator_command_failed`, `actuator_config_deleted`, `actuator_response`, `actuator_status`, `config_failed`, `config_published`, `config_response`, `device_approved`, `device_context_changed`, `device_discovered`, `device_rediscovered`, `device_rejected`, `device_scope_changed`, `esp_health`, `error_event`, `intent_outcome`, `intent_outcome_lifecycle`, `notification`, `notification_new`, `notification_updated`, `notification_unread_count`, `sensor_config_deleted`, `sensor_data`, `sensor_health`, `sequence_cancelled`, `sequence_completed`, `sequence_error`, `sequence_started`, `sequence_step`, `subzone_assignment`, `system_event`, `zone_assignment`.

**Update-Semantik (kurz):** überwiegend **partielles Merge** in `devices` (Sensorwerte, Aktorstatus, Health); **Lösch-Events** entfernen Konfigurationseinträge; **Notifications** aktualisieren Inbox/Toasts; **Intent** → `intentSignals` Store.

### 8.2 System Monitor / Contract (`WS_EVENT_TYPES`)

`El Frontend/src/utils/contractEventMapper.ts` — **52** Einträge, u. a. zusätzlich zu oben:

`device_online`, `device_offline`, `lwt_received`, `plugin_execution_started`, `plugin_execution_completed`, `logic_execution`, `service_start`, `service_stop`, `emergency_stop`, `mqtt_error`, `validation_error`, `database_error`, `login_success`, `login_failed`, `logout`, `contract_mismatch`, `contract_unknown_event`.

**Lücke / Drift:** `contract_mismatch` und `contract_unknown_event` sind **Frontend-seitige** Integritätssignale; sie stehen **nicht** in `MessageType` (`types/index.ts`). `MessageType` endet bei `intent_outcome_lifecycle` — Erweiterung nur nach Server-Abgleich.

---

## 9. Types (`src/types/`)

| Datei | Zweck |
|-------|--------|
| `index.ts` | Zentrale Typen inkl. `MessageType` |
| `websocket-events.ts` | Event-Payloads |
| `logic.ts` | Regel-DSL-Typen |
| `monitor.ts` | Monitor-L2 API-Formen |
| `device-metadata.ts` | Gerätemetadaten |
| `gpio.ts` | GPIO |
| `form-schema.ts` | Formulare |
| `event-grouping.ts` | Event-Gruppierung System Monitor |

**Domain (Contract April 2026):** `src/domain/esp/espHealth.ts`, `src/domain/zone/ackPresentation.ts` — ViewModel für Health/ACK.

---

## 10. Bereichsmodell F01–F14 — Zuordnung produktiver Pfade

> **Konvention:** Jede Datei unter `src/` erhält über den Ordner eine primäre Bereichs-ID. Überschneidungen (z. B. `dashboard-widgets` → F08) sind im Pfad erkennbar.

| ID | Bereich | Pfade (Auszug; vollständig: alle Unterdateien dieser Wurzeln) |
|----|---------|---------------------------------------------------------------|
| F01 | App Shell & Routing | `App.vue`, `main.ts`, `router/`, `shared/design/layout/AppShell.vue`, `Sidebar.vue`, `TopBar.vue` |
| F02 | Design & globale Styles | `shared/design/**`, `styles/**`, `style.css`, `tailwind.config.ts` (Repo: `El Frontend/tailwind.config.ts`), `vite.config.ts` |
| F03 | Pinia | `shared/stores/**`, `stores/**` |
| F04 | REST | `api/**` |
| F05 | WebSocket & Realtime | `services/websocket.ts`, `composables/useWebSocket.ts`, `stores/esp.ts`, `stores/esp-websocket-subscription.ts` |
| F06 | Hardware & Konfiguration | `views/HardwareView.vue`, `components/esp/**`, `components/dashboard/ZonePlate.vue`, `DeviceMiniCard.vue`, … |
| F07 | Monitor | `views/MonitorView.vue`, `components/monitor/**`, `components/devices/SensorCard.vue`, `ActuatorCard.vue` (Monitor-Modus) |
| F08 | Dashboard-Editor | `views/CustomDashboardView.vue`, `components/dashboard-widgets/**`, `DashboardViewer.vue`, `useDashboardWidgets.ts` |
| F09 | Logic | `views/LogicView.vue`, `components/rules/**`, `shared/stores/logic.store.ts` |
| F10 | Wissensbasis & Kalibrierung | `views/SensorsView.vue`, `components/inventory/**`, `views/CalibrationView.vue`, `components/calibration/**` |
| F11 | Systembetrieb | `views/SystemMonitorView.vue`, `components/system-monitor/**`, `components/database/**`, `views/PluginsView.vue`, `SystemConfigView.vue`, `LoadTestView.vue`, `EmailPostfachView.vue` |
| F12 | Auth & Einstellungen | `views/LoginView.vue`, `SetupView.vue`, `SettingsView.vue`, `UserManagementView.vue` |
| F13 | Notifications & Quick Actions | `components/notifications/**`, `shared/stores/notification*.ts`, `alert-center.store.ts`, `components/quick-action/**`, `shared/stores/quickAction.store.ts` |
| F14 | Tests & Tooling | `tests/**`, `package.json`, `vitest.config.ts`, `playwright*.ts` |

**Build-only außerhalb `src/`:** `index.html`, Vite/Tailwind/PostCSS-Konfiguration unter `El Frontend/`.

---

## 11. Master-Tabelle (kondensiert)

> Vollständige Ein-Zeilen-Beschreibung für **alle** 185 `.vue`-Dateien würde den Rahmen sprengen. Die **vollständige Pfadliste** ergibt sich aus `Get-ChildItem 'El Frontend/src' -Recurse -Filter '*.vue'` (185 Treffer). Unten: **Views** und **Store/API** vollständig; Komponenten nach Paket.

### 11.1 Views (alle)

| Pfad | F | Rolle | Kurzbeschreibung | Hauptabhängigkeiten |
|------|---|-------|------------------|---------------------|
| `views/HardwareView.vue` | F06 | View | Zonen-Accordion, Orbital, Konfig-SlideOvers | `esp`, `zone`, `logic`, `dashboard`, `dragState`, `zonesApi`, viele `@/components` |
| `views/MonitorView.vue` | F07 | View | L1–L3 Monitor, eingebettete Dashboards | `esp`, `zone`, `deviceContext`, `dashboard`, `logic`, `sensorsApi`, `zonesApi` |
| `views/CustomDashboardView.vue` | F08 | View | GridStack-Editor | `dashboard.store`, `esp`, `useDashboardWidgets` |
| `views/LogicView.vue` | F09 | View | Regeln + Flow | `logic.store`, Rule-Komponenten |
| `views/SensorsView.vue` | F10 | View | Komponenten-Inventar | `esp`, `inventory.store`, `InventoryTable`, `DeviceDetailPanel` |
| `views/SystemMonitorView.vue` | F11 | View | Ops-Tabs | `useWebSocket`, `esp`, `auditApi`, System-Monitor-Tabs |
| `views/CalibrationView.vue` | F10 | View | Kalibrierung (Admin) | Kalibrierungs-Komponenten |
| `views/PluginsView.vue` | F11 | View | Plugins | `plugins.store` |
| `views/EmailPostfachView.vue` | F11 | View | E-Mail-Postfach | `useEmailPostfach`, APIs |
| `views/UserManagementView.vue` | F12 | View | Benutzer | `api/users` |
| `views/SystemConfigView.vue` | F11 | View | Systemkonfiguration | Config-APIs |
| `views/LoadTestView.vue` | F11 | View | Lasttests | `api/loadtest` |
| `views/SettingsView.vue` | F12 | View | Einstellungen | divers |
| `views/LoginView.vue` | F12 | View | Login | `auth.store` |
| `views/SetupView.vue` | F12 | View | Erst-Setup | `auth` |
| `views/SensorHistoryView.vue` | F07 | View (ungenutzt in Router) | Historie — durch Redirect ersetzt | **nicht an Route gebunden** |
| `views/MaintenanceView.vue` | F11 | View (ungenutzt in Router) | Wartung — Health-Tab | **nicht an Route gebunden** |

### 11.2 Komponenten-Pakete (aggregiert)

| Paket (`components/...`) | F | ~Anzahl `.vue` | Zweck |
|--------------------------|---|----------------|--------|
| `system-monitor/` | F11 | 23 | Tabs, Listen, Event-Details, MQTT, Logs |
| `esp/` | F06 | 24 | Orbital, Panels, Modals, Settings |
| `dashboard/` | F06/F08 | 11 | ZonePlate, Viewer, Sidebars, DnD |
| `dashboard-widgets/` | F08 | 13 | Widgets + `WidgetConfigPanel` |
| `rules/` | F09 | 5 | Flow-Editor, Karten |
| `charts/` | F07/F08 | 7 | Live/Historie, Gauges |
| `devices/` | F06/F07 | 10 | Sensor/Aktor-Karten, Sektionen |
| `monitor/` | F07 | 4 | Zone-Kacheln, Widget-Dialog |
| `notifications/` | F13 | 5 | Drawer, Badge, … |
| `quick-action/` | F13 | 7 | FAB, Panels |
| `inventory/` | F10 | 5 | Tabelle, Kontext-Editoren |
| `shared/design/` | F02 | (siehe `shared/design`) | Primitives, Patterns, Layout |
| übrige (`command`, `database`, `error`, `forms`, `modals`, `safety`, `widgets`, `zones`, …) | gemischt | — | siehe Ordnerliste im Repo |

---

## 12. View → direkte Kind-Imports (eine Ebene, Auszug)

| View | Wichtigste direkte `@/components` / Design-Imports |
|------|-----------------------------------------------------|
| `HardwareView.vue` | `ViewTabBar`, `SlideOver`, `SensorConfigPanel`, `ActuatorConfigPanel`, `ESPConfigPanel`, `ZonePlate`, `DeviceMiniCard`, `DeviceDetailView`, `ESPSettingsSheet`, `ZoneSettingsSheet`, `ComponentSidebar`, `PendingDevicesPanel`, `InlineDashboardPanel`, `CreateMockEspModal`, `AccordionSection`, `VueDraggable` |
| `MonitorView.vue` | `ZoneTileCard`, `SlideOver`, `TimeRangeSelector`, `ViewTabBar`, `SensorCard`, `ActuatorCard`, `SharedSensorRefCard`, `DashboardViewer`, `InlineDashboardPanel`, `BaseSkeleton`, `ErrorState`, `ZoneRulesSection`, `QuickActionBall`, `AddWidgetDialog` |
| `CustomDashboardView.vue` | `ViewTabBar`, `WidgetConfigPanel`, `BaseModal`, `InlineDashboardPanel` |
| `SensorsView.vue` | `InventoryTable`, `DeviceDetailPanel`, `SlideOver`, `EmergencyStopButton` |
| `SystemMonitorView.vue` | `MonitorTabs`, `HealthSummaryBar` + lazy: `EventsTab`, `ServerLogsTab`, `DatabaseTab`, `MqttTrafficTab`, `HealthTab`, `DiagnoseTab`, `ReportsTab`, `HierarchyTab`, `CleanupPanel`, `EventDetailsPanel` |

---

## 13. Design-System & Hardcoded-Farben (Stichprobe)

**Tokens:** `src/styles/tokens.css`, `src/style.css`, `styles/glass.css`, …

**Suchergebnis `#rrggbb` in `src/**/*.vue` (Auszug — nicht abschließend):**

- `components/esp/ESPSettingsSheet.vue` — u. a. `#f472b6`, Tailwind-ähnliche Hilfsklassen
- `views/SystemMonitorView.vue` — Gradients mit `#f43f5e`, `#f59e0b` neben CSS-Variablen
- `components/system-monitor/UnifiedEventList.vue`, `EventDetailsPanel.vue` — mehrere Hex-Farben für Kategorien/Schwere
- `components/rules/RuleFlowEditor.vue` — Knotenfarben per Funktion (`#c084fc`, …)

**Bewertung:** Design-Regel im Projekt: bevorzugt CSS-Variablen aus Tokens; vereinzelte Hex-Drifts in Ops/Flow-UI.

---

## 14. Tests (`El Frontend/tests/`)

| Bereich | Pfad | Werkzeug |
|---------|------|----------|
| Unit | `tests/unit/**` | Vitest |
| E2E Szenarien | `tests/e2e/scenarios/**` | Playwright |
| E2E CSS/A11y | `tests/e2e/css/**` | Playwright + Axe |
| Mocks | `tests/mocks/handlers.ts`, `websocket.ts`, `server.ts` | MSW / Mock-WS |

**Verwaiste Pfade:** nicht automatisch geprüft; Empfehlung: CI-Liste mit `npm test` / `test:e2e` synchron halten.

---

## 15. Cross-Cutting-Scorecard (kurz)

| View | Loading | Error | Empty | Sprache | A11y (Anker) |
|------|---------|-------|-------|---------|----------------|
| HardwareView | `BaseSkeleton` | Toasts + Inline | Zone-leer | DE | Tastatur-Shortcuts, DnD |
| MonitorView | `BaseSkeleton`, KPI-Debouncing | `ErrorState` | CTA → Hardware | DE | `QuickActionBall`, Fokus auf Kacheln |
| CustomDashboardView | Grid init | Toast | Empty-State Editor | DE | Widget-Toolbar |
| SystemMonitorView | Tab-lazy | Panel-Fehler | keine Events | DE | Pause-Toggle, Tab-Nav |
| SensorsView | Store-Ladezustand | — | leere Tabelle | DE | Notfall-Stopp global sichtbar |

---

## 16. Technologie-Stack (verifiziert `package.json`)

- **Vue** ^3.5, **vue-router** ^4.5, **pinia** ^2.3, **axios** ^1.10  
- **Charts:** `chart.js` + `vue-chartjs` (kein ECharts in dependencies)  
- **GridStack** ^12.4  
- **Vue Flow:** `@vue-flow/core` + Controls/Minimap/Background  
- **Tests:** `vitest`, `@vue/test-utils`, `msw`; **E2E:** `@playwright/test`

---

## 17. Abnahme-Checkliste (Auftrag 4.4)

- [x] `.vue` in `components/` und `views/` den Bereichen F01–F14 über Ordnerlogik zugeordnet  
- [x] Router transkribiert (`src/router/index.ts`)  
- [x] WS-Event-Strings für ESP-Store extrahiert + Contract-Liste benannt  
- [x] `SensorConfigPanel` / `ActuatorConfigPanel`: Eltern-Tabelle; **kein** Einsatz in `SensorsView`  
- [x] `shared/stores` vs. `stores` erklärt  
- [x] API-Dateien benannt und HTTP-Zuordnung auf Modul-Ebene  
- [x] Drift-Register mit IST-Zahlen geschlossen  

---

*Ende Bericht. Vollständige flache Dateiliste: `El Frontend/src` rekursiv per Dateisystem-Tools erzeugbar; Kennzahl `.vue` = 185.*
