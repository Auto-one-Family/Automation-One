# El Frontend ? Vollständige Dashboard-Analyse

**Datum:** 2026-02-22  
**Autor:** Agent-Analyse (Code-basiert)  
**Bezug:** Roadmap Q1-Q2 2026 ? Frontend von 85% auf 100%

---

## 1. Executive Summary

### Gesamtbewertung

Das El Frontend ist **weiter als 85%** ? eher **~90?92%** basierend auf den verifizierten Zahlen und Neuentdeckungen (CalibrationWizard, SensorHistoryView, UserManagementView existieren bereits).

### Top-5-Stärken

1. **Design-System:** 8 Primitives, 5 Patterns, 3 Layout-Komponenten, konsistente Tokens in `tokens.css`
2. **WebSocket-Architektur:** 28 Event-Typen, zentraler Dispatcher im esp.store, Reconnect mit Exponential Backoff, Page-Visibility-Reconnect
3. **Zoom-Navigation:** 3-Level-Zoom (ZonePlate ? ZoneDetail ? DeviceDetail), URL-Sync via Query-Params, Browser-Back funktioniert
4. **Rule-Builder:** 6 Node-Typen (sensor, time, logic, actuator, notification, delay), Vue Flow Canvas mit Auto-Layout, MiniMap, Live-Execution-Flash
5. **Test-Abdeckung:** 76 Test-Dateien (34 Unit + 42 E2E)

### Top-5-Probleme

1. **SettingsView zu dünn:** Nur User-Info, Logout, Server-Connection, About ? keine Passwort-Änderung, Theme-Einstellungen, Notif-Prefs
2. **Kein Undo/Redo im Rule-Builder:** Änderungen am Graph sind nicht rückgängig machbar
3. **Hardcoded Hex-Farben:** 50+ Komponenten nutzen `#hex` statt `var(--color-*)` aus tokens.css
4. **Keine i18n:** Alle Texte deutsch hardcoded, gemischt mit englischen UI-Elementen ("Sign Out", "User Account")
5. **Responsive lückenhaft:** Breakpoints `sm:`, `md:`, `lg:` teilweise genutzt, viele Views ohne mobile Breakpoints

### 2-Wochen-Priorität

- GPIO-Blacklist in AddSensorModal/EditSensorModal (paralleler Auftrag)
- SettingsView erweitern (Passwort-Änderung, Theme-Einstellungen, Notif-Prefs)
- Responsive-Basics für Tablet (768px)

---

## 2. Verifizierte Zahlen

| Metrik | Wert | Quelle |
|--------|------|--------|
| .vue-Dateien | 120 | `El Frontend/src/**/*.vue` |
| Views | 13 | router + views/ |
| App.vue | 1 | ? |
| Feature-Komponenten | 90 | components/ |
| Design-System | 16 (8 Primitives + 5 Patterns + 3 Layout) | shared/design/ |
| WebSocket-Events | 28 | WEBSOCKET_EVENTS.md |
| Pinia Stores | 14 | 1 esp.ts + 12 shared + index |
| API-Clients | 18 | api/*.ts |
| Composables | 15 + 1 index | composables/ |
| Test-Dateien | 76 (34 Unit + 42 E2E) | tests/ |
| Aktive Routes | 13 | router |
| Deprecated-Redirects | 9 | router |

---

## 3. View-Inventar (13 Views)

| Route | View | Zeilen | Status | Kritisch |
|-------|------|--------|--------|----------|
| `/` | DashboardView | 829 | Komplett | 3-Level-Zoom funktional |
| `/login` | LoginView | 603 | Komplett | Ambient-Particles, Auth-Flow |
| `/setup` | SetupView | 674 | Komplett | Erst-Admin-Erstellung |
| `/sensors` | SensorsView | 635 | Komplett | Tab: Sensoren + Aktoren |
| `/logic` | LogicView | 1353 | Komplett | 6 Node-Typen, kein Undo |
| `/settings` | SettingsView | 111 | **Minimal** | Nur User-Info + Logout |
| `/system-monitor` | SystemMonitorView | 2120 | Komplett | 5 Tabs, Admin-only |
| `/users` | UserManagementView | 473 | Komplett | CRUD + Rollen |
| `/calibration` | CalibrationView | 23 | Komplett | Wrapper für Wizard |
| `/sensor-history` | SensorHistoryView | 438 | Komplett | Zeitreihen + CSV-Export |
| `/system-config` | SystemConfigView | 285 | Komplett | Config-Key/Value-Editor |
| `/maintenance` | MaintenanceView | 459 | Komplett | Service-Status + Jobs |
| `/load-test` | LoadTestView | 345 | Komplett | Bulk-Mock-ESP + Simulation |

### Wichtige Entdeckungen (Life-Repo-Korrekturen)

- **CalibrationWizard existiert bereits:** `CalibrationWizard.vue` mit 5-Phasen-Flow (select ? point1 ? point2 ? confirm ? done), Presets für pH, EC, Moisture, Temperature
- **SensorHistoryView existiert bereits:** 438 Zeilen mit TimeRangeSelector, Multi-Line-Chart, Sensor-Picker, CSV-Export
- **UserManagementView ist weitgehend komplett:** User-Tabelle, Create/Edit/Delete, Password-Reset, Role-Management (admin/operator/viewer), eigene Passwort-Änderung
- **Vue Flow Version:** `@vue-flow/core: ^1.48.2` ? stabile 1.x API

---

## 4. Detail-Analyse A?L

### A. Views (13 Views)

Alle 13 Views dokumentiert. Nutzer-Perspektive, verwendete Stores, WebSocket-Events und API-Clients pro View:

- **DashboardView:** espStore, zoneStore, dashboardStore, gpioStore ? esp_health, sensor_data, actuator_status, device_discovered, config_response, zone_assignment, subzone_assignment
- **LoginView:** authStore, useWebSocket (Footer-Status)
- **SetupView:** authStore ? Initial-Setup
- **SensorsView:** espStore, sensorStore, actuatorStore ? REST + WebSocket via esp
- **LogicView:** logicStore, espStore ? logic_execution
- **SettingsView:** authStore, uiStore ? minimal
- **SystemMonitorView:** useWebSocket, databaseStore ? alle Event-Typen
- **UserManagementView:** authStore (users API)
- **CalibrationView:** Wrapper für CalibrationWizard
- **SensorHistoryView:** sensorsApi, MultiSensorChart, TimeRangeSelector
- **SystemConfigView:** configStore
- **MaintenanceView:** Maintenance-API
- **LoadTestView:** loadtestApi, debugApi

### B. 3-Level-Zoom

- **URL-Sync:** Query-Params `?zone=...&device=...`, Browser-Back funktioniert
- **CSS-Animationen:** 250ms exit, 300ms enter, Transition-Locking gegen Doppelklick
- **Level-2-Varianten:** `ZoneDetailView` (device-centric) vs `ZoneMonitorView` (sensor-centric)
- **useZoomNavigation** (354 Zeilen): Breadcrumb-Support, Focus-Management
- **useSwipeNavigation** (156 Zeilen): Touch-Gestures via `@vueuse/core`
- **Lücke:** Keine Deep-Links für `/zones/zone-id/device-id` ? nur Query-Params

**Code-Referenz:** `src/composables/useZoomNavigation.ts`, `src/components/dashboard/ZonePlate.vue`, `src/components/zones/ZoneDetailView.vue`, `src/components/zones/ZoneMonitorView.vue`

### C. Rule-Builder

- **6 Node-Typen:** sensor, time, logic (AND/OR), actuator, notification, delay
- **RuleFlowEditor.vue** (1443 Zeilen): Vue Flow Canvas mit Auto-Layout, MiniMap, Controls
- **Rule-Testing:** via API `logicStore.testRule()`
- **Live-Execution-Flash:** Nodes blinken bei Auslösung
- **Lücken:** Kein Undo/Redo, keine Verbindungs-Validation (ungültige Edges werden nicht visuell abgelehnt)

**Code-Referenz:** `src/components/rules/RuleFlowEditor.vue`, `src/shared/stores/logic.store.ts`

### D. WebSocket (28 Events)

Zentrale Dispatcher-Architektur im `esp.store.ts`. Reconnect mit Exponential Backoff (1s?30s, max 10 Versuche). Page-Visibility-Reconnect. Token-Refresh vor Reconnect.

**Event-Liste (vollständig):**

| Kategorie | Events |
|-----------|--------|
| ESP/Device | esp_health, device_discovered, device_rediscovered, device_approved, device_rejected, esp_diagnostics |
| Sensor | sensor_data, sensor_health |
| Actuator | actuator_status, actuator_command, actuator_command_failed, actuator_response, actuator_alert |
| Config | config_response, config_published, config_failed |
| Zone | zone_assignment, subzone_assignment |
| Logic | logic_execution, notification |
| Sequence | sequence_started, sequence_step, sequence_completed, sequence_error, sequence_cancelled |
| System | system_event, error_event, events_restored |

**Code-Referenz:** `src/services/websocket.ts`, `src/composables/useWebSocket.ts`, `src/stores/esp.ts`, `.claude/reference/api/WEBSOCKET_EVENTS.md`

### E. Stores (14 Stores)

Dispatcher-Pattern: `esp.ts` empfängt alles, delegiert an spezialisierte Handler-Stores. Nur `auth.store` nutzt localStorage.

| Store | Rolle |
|-------|-------|
| esp.ts | WebSocket-Dispatcher, Device-State (1645 Zeilen) |
| auth.store | JWT, User, localStorage |
| zone.store | Zonen, Subzonen |
| sensor.store | Sensor-Konfiguration |
| actuator.store | Aktor-Konfiguration |
| logic.store | Rules, Test-API |
| gpio.store | GPIO-Status (delegiert von esp) |
| notification.store | Benachrichtigungen |
| config.store | System-Config |
| database.store | DB-Explorer |
| dashboard.store | Dashboard-State |
| dragState.store | Drag&Drop |
| ui.store | Modals, Confirm |

**Lücke:** Loading/Error-States inkonsistent (nur 4 von 14 haben `isLoading`/`error`).

### F. Design-System

- **8 Primitives:** BaseButton, BaseCard, BaseModal, BaseToggle, BaseInput, BaseSelect, BaseBadge, BaseSkeleton, BaseSpinner
- **5 Patterns:** ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer
- **3 Layout:** AppShell, Sidebar, TopBar
- **Tokens:** `src/styles/tokens.css` ? `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`
- **Problem:** Viele hardcoded Hex-Farben in Komponenten (50+ Dateien) statt Token-Referenzen

### G. Responsive

Breakpoints `sm:`, `md:`, `lg:`, `xl:` teilweise genutzt. AppShell/Sidebar haben Mobile-Collapse. TopBar hat Hamburger-Menu. **Aber:** Nicht durchgängig ? viele Views haben keine mobilen Breakpoints.

### H. Charts

5 Chart-Komponenten: GaugeChart, LiveLineChart, MultiSensorChart, StatusBarChart, TimeRangeSelector. Chart.js 4.5.0. SensorHistoryView hat Zeitreihen. **Lücke:** Kein Heatmap-Chart.

**Code-Referenz:** `src/components/charts/`

### I. Discovery

`device_discovered` Event ? `PendingDevicesPanel.vue`. Approval/Rejection via Store-Actions. `device_rediscovered` wird behandelt.

**Code-Referenz:** `src/components/esp/PendingDevicesPanel.vue`, `src/stores/esp.ts`

### J. Safety

`EmergencyStopButton.vue` immer sichtbar in TopBar (rechts). Confirm-Dialog mit Teleport. z-index: `--z-safety` (75). ESC schließt Dialog. **Lücke:** Keine Recovery-UI nach Emergency-Stop.

**Code-Referenz:** `src/components/safety/EmergencyStopButton.vue`, `src/shared/design/layout/TopBar.vue`

### K. Accessibility

BaseModal hat `role="dialog"`, `aria-modal`. BaseSpinner hat `role="status"`. BaseToggle hat `role="switch"`. **Lücken:** EmergencyStopButton hat nur `title`, kein `aria-label`. Charts haben keine Textalternativen.

### L. Performance

Alle Routes lazy-loaded. Vite-Defaults (kein custom Chunking). Vue Flow + Chart.js sind große Bundles. Kein `v-memo` für hochfrequente Komponenten.

---

## 5. Antworten auf die 10 spezifischen Fragen

1. **Komponentenzahl:** 120 .vue-Dateien (90 Feature + 16 Design-System + 13 Views + 1 App.vue)
2. **WebSocket-Events:** 28 Events (vollständig in WEBSOCKET_EVENTS.md)
3. **Legacy-Trennung:** `esp.ts` ist der zentrale WebSocket-Dispatcher (1645 Zeilen). War historisch der erste Store. Migration möglich aber riskant wegen zentraler Rolle.
4. **database vs system-monitor:** Kein separater `database`-View mehr. `/database` redirectet zu `/system-monitor?tab=database`. SystemMonitor hat 5 Tabs: Events, Logs, Database, MQTT, Health.
5. **maintenance + load-test:** Beide komplett. Maintenance: Service-Status, Cleanup-Config, Job-Triggers. LoadTest: Bulk-Mock-ESP-Creation, Simulation-Start/Stop, Metrics.
6. **Dark Mode:** Dark-Only. Kein Toggle nötig. `darkMode: 'class'` in Tailwind-Config, keine `dark:` Klassen verwendet. Alle Styles sind bereits dunkel.
7. **i18n:** Nicht vorhanden. Alle Texte deutsch hardcoded. Einige UI-Elemente sind Englisch gemischt ("Sign Out", "User Account").
8. **User-Management:** Weitgehend komplett: User-Tabelle, Create/Edit/Delete, Rollen (admin/operator/viewer), Password-Reset, eigene Passwort-Änderung.
9. **/setup-Route:** Initial-Setup für erstes Admin-Konto. Passwort-Stärke-Indikator, Anforderungs-Checks, visuelles Styling wie LoginView.
10. **Kalibrierungs-Wizard-Aufwand:** Wizard existiert bereits! Schätzung für Polishing (UX-Feedback, Live-Sensor-Wert-Anzeige, bessere Fehlermeldungen): ~4?6 Stunden.

---

## 6. Priorisierte To-Do-Liste

### KRITISCH (vor Testlauf)

- [ ] GPIO-Blacklist in AddSensorModal/EditSensorModal (paralleler Auftrag)
- [ ] I2C-Adress-Dropdown statt GPIO-Pin für I2C-Sensoren
- [ ] SettingsView erweitern (Passwort-Änderung, Theme-Einstellungen, Notif-Prefs)

### HOCH (vor Kunden-Einsatz)

- [ ] Undo/Redo im Rule-Builder
- [ ] Verbindungs-Validation im Rule-Builder
- [ ] Hardcoded Hex-Farben ? Design-Tokens
- [ ] Responsive-Grundlagen für Tablet (768px)
- [ ] Deutsch/Englisch-Mix bereinigen
- [ ] Recovery-UI nach Emergency-Stop

### MITTEL (Q2 2026)

- [ ] Heatmap-Visualisierung
- [ ] Analyse-Profile UI
- [ ] Email/Webhook-Notification-Config
- [ ] Mobile-Optimierung (430px)
- [ ] Full i18n-Framework

### NIEDRIG (später)

- [ ] Chart-Accessibility (Textalternativen)
- [ ] Virtual Scrolling für lange Listen
- [ ] Custom Vite-Chunking für Bundle-Optimierung

---

## 7. Code-Referenzen

| Bereich | Pfad |
|---------|------|
| Views | `El Frontend/src/views/` |
| Design Primitives | `El Frontend/src/shared/design/primitives/` |
| Design Patterns | `El Frontend/src/shared/design/patterns/` |
| Design Layout | `El Frontend/src/shared/design/layout/` |
| Tokens | `El Frontend/src/styles/tokens.css` |
| WebSocket Service | `El Frontend/src/services/websocket.ts` |
| Composables | `El Frontend/src/composables/` |
| Stores | `El Frontend/src/stores/`, `El Frontend/src/shared/stores/` |
| API-Clients | `El Frontend/src/api/` |
| Rule-Builder | `El Frontend/src/components/rules/RuleFlowEditor.vue` |
| Zoom-Navigation | `El Frontend/src/composables/useZoomNavigation.ts` |
| WebSocket-Events-Referenz | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
