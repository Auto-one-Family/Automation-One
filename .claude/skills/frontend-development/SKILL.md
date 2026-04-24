---
name: frontend-development
description: |
  El Frontend Vue 3 Dashboard Entwicklung fuer AutomationOne IoT-Framework.
  Verwenden bei: Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, Axios,
  WebSocket, Dashboard, ESP-Card, Sensor-Satellite, Actuator-Satellite,
  Zone-Management, Drag-Drop, System-Monitor, Database-Explorer, Log-Viewer,
  Audit-Log, MQTT-Traffic, Composables, useWebSocket, useToast, useModal,
  useQueryFilters, useGpioStatus, useZoneDragDrop, useSensorId, Pinia-Stores, auth-store,
  esp-store, logic-store, plugins-store, formatters, sensorDefaults, actuatorDefaults,
  Mock-ESP, PendingDevices, GPIO-Status, MainLayout, AppSidebar, Router,
  Navigation-Guards, Token-Refresh, JWT-Auth, REST-API-Client.
argument-hint: "[Beschreibe was implementiert werden soll]"
---

# El Frontend - KI-Agenten Dokumentation

**Version:** 10.12
**Letzte Aktualisierung:** 2026-04-23

**Zweck:** Massgebliche Referenz fuer Frontend-Entwicklung (Vue 3 + TypeScript + Vite + Pinia + Tailwind)
**Codebase:** `El Frontend/src/` (~10.000+ Zeilen TypeScript/Vue, 143 .vue Komponenten)

> **Server-Dokumentation:** Siehe `.claude/skills/server-development/SKILL.md`
> **ESP32-Firmware:** Siehe `.claude/skills/esp32-development/SKILL.md`

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primaere Quelle | Code-Location |
|-------------|-----------------|---------------|
| **Server + Frontend starten** | `make dev` oder Docker | - |
| **API-Endpoint finden** | `.claude/reference/api/REST_ENDPOINTS.md` | ~230 Endpoints (inkl. Zone Context, Backups, Export, Schema Registry) |
| **WebSocket verstehen** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Events mit Payloads; ESP-Store: `esp-websocket-subscription.ts` + §0.1 in WEBSOCKET_EVENTS |
| **Zone zuweisen** | [Section 12: Drag & Drop](#12-drag--drop-system) | `src/components/zones/` |
| **ESP-Geraet verwalten** | [Section 5: State Management](#5-state-management-pinia) | `src/stores/esp.ts` |
| **System Monitor** | [Section 10: Router](#10-router--navigation) | `SystemMonitorView.vue` |
| **Komponente finden** | [Section 2: Ordnerstruktur](#2-ordnerstruktur) | `src/components/` |
| **Error-Codes verstehen** | `.claude/reference/errors/ERROR_CODES.md` | ESP32 + Server Codes |
| **Farben/Design** | [Section 11: Farbsystem](#11-farbsystem--design) | `src/style.css` |

---

## 1. Projekt-Setup

### Tech-Stack (aus package.json)

| Paket | Version | Zweck |
|-------|---------|-------|
| vue | ^3.5.13 | Framework (Composition API + Script Setup) |
| vue-router | ^4.5.0 | Routing + Navigation Guards |
| pinia | ^2.3.0 | State Management |
| axios | ^1.10.0 | HTTP-Client mit Interceptors |
| chart.js | ^4.5.0 | Diagramme |
| vue-chartjs | ^5.3.2 | Chart.js Vue-Wrapper |
| lucide-vue-next | ^0.468.0 | Icons |
| date-fns | ^4.1.0 | Datum-Utilities |
| @vueuse/core | ^10.11.1 | Vue Composition Utilities |
| vue-draggable-plus | ^0.6.0 | Drag & Drop |
| gridstack | ^12.1.2 | Dashboard Grid Layout (Custom Dashboard Builder) |
| chartjs-plugin-annotation | ^3.1.0 | Threshold-Linien in Charts |
| chartjs-plugin-zoom | ^2.2.0 | Zoom/Pan in Charts (Wheel, Pinch, Drag) |
| @vue-flow/core | ^1.43.2 | Node-basierter Rule-Flow-Editor |
| vite | ^6.2.4 | Build Tool |
| tailwindcss | ^3.4.17 | CSS Framework |
| typescript | ~5.7.2 | Type Safety |
| vitest | ^3.0.0 | Unit Test Framework |
| @vue/test-utils | ^2.4.0 | Vue Component Testing |
| jsdom | ^25.0.0 | DOM Environment fuer Tests |
| msw | ^2.7.0 | HTTP Request Mocking (Mock Service Worker) |
| @vitest/coverage-v8 | ^3.0.0 | Code Coverage |

### Build-Konfiguration

**vite.config.ts:**
```typescript
// Port: 5173 (Dev)
// Proxy: /api → http://el-servador:8000
// Proxy: /ws → ws://el-servador:8000
// Alias: @ → ./src/
```

**tsconfig.json:**
```typescript
// strict: true
// noUnusedLocals: true
// noUnusedParameters: true
// paths: @/* → ./src/*
```

### Docker

- Container: `automationone-frontend`
- Port: 3000 (Prod) / 5173 (Dev)
- Volume: `./El Frontend:/app`

### Make-Targets

```bash
make dev          # Docker Dev mit hot-reload
make build        # Production build
make logs         # el-frontend Container Logs
docker exec automationone-frontend npm run build  # Build im Container

# Tests (lokal)
npm test          # Vitest run (einmalig)
npm run test:watch    # Vitest watch mode
npm run test:coverage # Vitest mit v8 Coverage
```

---

## 2. Ordnerstruktur

```
El Frontend/src/
├── api/           # 28 API-Module
│   ├── index.ts           # Axios Instance + Interceptors (~89 Zeilen)
│   ├── uiApiError.ts      # REST-Error-SSOT: toUiApiError()/formatUiApiError() inkl. request_id/retryability
│   ├── auth.ts            # Login, Logout, Token Refresh
│   ├── esp.ts             # ESP Device Management
│   ├── intentOutcomes.ts  # GET /intent-outcomes (Parität zu WS intent_outcome)
│   ├── sensors.ts         # Sensor CRUD + History
│   ├── actuators.ts       # Actuator Commands
│   ├── zones.ts           # Zone Assignment + ZoneEntity CRUD (T13-R3)
│   ├── subzones.ts        # Subzone Management
│   ├── device-context.ts  # Device Context setzen/lesen/loeschen (T13-R3, NEU)
│   ├── backups.ts         # DB-Backup (Admin)
│   ├── inventory.ts       # Zone Context, Export, Schema Registry (Phase K4)
│   ├── logic.ts           # Automation Rules
│   ├── plugins.ts         # Plugin-Execution, History, Config, Enable/Disable (Phase 4C/F11)
│   ├── loadtest.ts        # Loadtest bulk/simulate/metrics + Preflight/Capabilities-Fallback (F11)
│   └── ...
├── config/        # Device Schemas (Phase K4)
│   └── device-schemas/  # JSON-Schemas für Sensoren/Aktoren (DS18B20, SHT31, relay, pwm, etc.)
├── components/    # Vue Komponenten (20 Unterverzeichnisse)
│   ├── calibration/   # CalibrationWizard
│   ├── charts/        # LiveLineChart, HistoricalChart (+ VPD Box-Annotations PB-01), GaugeChart, MultiSensorChart (+ Aktor-Overlay P8-A6c)
│   ├── command/       # CommandPalette
│   ├── common/        # Modal, Toast, Skeleton, ViewTabBar (13 Dateien)
│   ├── dashboard/     # Dashboard subcomponents (11 Dateien, inkl. DashboardViewer + InlineDashboardPanel)
│   ├── dashboard-widgets/ # SensorCardWidget, GaugeWidget, LineChartWidget, StatisticsWidget, ActuatorRuntimeWidget, ExportCsvDialog, etc.
│   ├── database/      # DataTable, FilterPanel, Pagination, etc. (6 Dateien)
│   ├── devices/       # SensorCard, ActuatorCard, DeviceMetadataSection, LinkedRulesSection, AlertConfigSection, DeviceAlertConfigSection, RuntimeMaintenanceSection, SubzoneAssignmentSection, DeviceScopeSection, SharedSensorRefCard (10 Dateien)
│   ├── error/         # ErrorDetailsModal, TroubleshootingPanel
│   ├── esp/           # ESPCard, ESPCardBase, ESPOrbitalLayout, SensorConfigPanel, ActuatorConfigPanel (11 Dateien)
│   ├── filters/       # UnifiedFilterBar
│   ├── forms/         # FormBuilder
│   ├── inventory/     # Wissensdatenbank (Phase K4): InventoryTable, DeviceDetailPanel, SchemaForm, ZoneContextEditor, SubzoneContextEditor (5 Dateien)
│   ├── logic/         # RuleCardCompact (Monitor L2 Regeln für diese Zone, 1 Datei)
│   ├── modals/
│   ├── monitor/       # ZoneTileCard (L1 Zone-Kachel), ZoneRulesSection (L2), ActiveAutomationsSection (L1 Aktive Automatisierungen), AddWidgetDialog (D3 FAB Quick-Add, 4 Dateien)
│   ├── rules/         # RuleCard, RuleConfigPanel, RuleFlowEditor, RuleNodePalette, RuleTemplateCard (5 Dateien)
│   ├── notifications/ # NotificationDrawer, NotificationItem, AlertStatusBar, NotificationPreferences (4 Dateien)
│   ├── quick-action/  # QuickActionBall (FAB, mode: editor|monitor), QuickActionMenu, QuickActionItem, QuickAlertPanel, QuickNavPanel, QuickWidgetPanel (mode: editor=drag, monitor=click→AddWidgetDialog), QuickDashboardPanel (7 Dateien)
│   ├── safety/        # EmergencyStopButton
│   ├── system-monitor/ # 19 Dateien (inkl. HierarchyTab, HealthTab, DiagnoseTab, ReportsTab)
│   ├── widgets/       # Widget primitives
│   └── zones/         # ZoneGroup, ZoneAssignmentPanel, ZoneSettingsSheet, ZoneSwitchDialog (4 Dateien)
├── shared/        # Design System + Shared Stores (NEU)
│   ├── design/
│   │   ├── primitives/  # 13 Komponenten (10 Base + AccordionSection + QualityIndicator + RangeSlider + SlideOver)
│   │   ├── layout/      # AppShell, Sidebar, TopBar (3 Dateien)
│   │   └── patterns/    # ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer (5 Dateien)
│   └── stores/          # 22 Shared Stores (inkl. ops-lifecycle fuer High-Risk Ops-Tracking)
├── styles/        # CSS Design Tokens + Shared Styles (6 Dateien)
│   ├── tokens.css       # Design Token Definitionen
│   ├── glass.css        # Glassmorphism Klassen
│   ├── animations.css   # Animationen
│   ├── main.css         # Hauptstyles (Buttons, Layout)
│   ├── forms.css        # Shared Form + Modal Styles
│   └── tailwind.css     # Tailwind Konfiguration
├── composables/   # 32 Composables
│   ├── useWebSocket.ts
│   ├── useToast.ts
│   ├── useModal.ts
│   ├── useQueryFilters.ts
│   ├── useGpioStatus.ts
│   ├── useSensorId.ts          # sensorId parser (espId:gpio:sensorType, legacy 2-part support)
│   ├── useSensorOptions.ts     # Zone-grouped sensor options for dashboard widgets (PA-02b, dedup + optgroup)
│   ├── useSubzoneCRUD.ts
│   ├── useSubzoneResolver.ts
│   ├── useZoneDragDrop.ts
│   ├── useSwipeNavigation.ts
│   ├── useConfigResponse.ts
│   ├── useCalibration.ts
│   ├── useCalibrationWizard.ts   # Kalibrier-Wizard F-P1; Live-Messung: POST measure + Cooldown wie SensorValueCard
│   ├── useCommandPalette.ts
│   ├── useContextMenu.ts
│   ├── useDashboardWidgets.ts  # Container-agnostic widget mount/unmount, zoneId propagation (PA-02c)
│   ├── useDeviceActions.ts
│   ├── useDeviceMetadata.ts
│   ├── useEmailPostfach.ts     # Email-Postfach Admin composable
│   ├── useESPStatus.ts
│   ├── useExportCsv.ts         # CSV export for sensor data (PB-04, multi-sensor batch)
│   ├── useGrafana.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useNavigationHistory.ts
│   ├── useOrbitalDragDrop.ts
│   ├── useQuickActions.ts
│   ├── useScrollLock.ts
│   ├── useSparklineCache.ts
│   ├── monitorConnectivity.ts # F07: Monitor-Zustandsmaschine + Datenmodus-Aufloesung + Reconnect-Orchestrator
│   ├── useWidgetDragFromFab.ts # FAB-to-GridStack widget drag (D3 Editor)
│   ├── useZoneGrouping.ts
│   └── useZoneKPIs.ts          # Zone KPI aggregation (extracted from MonitorView)
├── domain/        # Domain-Adapter (Contract April 2026)
│   ├── esp/espHealth.ts   # esp_health + Laufzeit-Telemetrie → ViewModel / Presentation
│   └── zone/ackPresentation.ts  # Zone/Subzone-ACK Toasts (reason_code = Brückengrund)
├── router/        # Route-Definitionen + Guards
├── services/      # WebSocket Singleton
│   └── websocket.ts   # ~625 Zeilen
├── stores/        # ESP-Pinia + WS-Subscription-Konstanten
│   ├── esp.ts                      # ~2500 Zeilen
│   └── esp-websocket-subscription.ts  # filters.types ≡ ws.on-Typen (P0-A)
├── types/         # 9 Type-Dateien
│   ├── index.ts           # ~1187 Zeilen (Re-Exports, SensorDataResolution, SensorDataQuery mit resolution/before_timestamp)
│   ├── monitor.ts         # ZoneMonitorData, SubzoneGroup (Monitor L2)
│   ├── websocket-events.ts # ~748 Zeilen
│   ├── ops-lifecycle.ts # High-Risk Ops-Lifecycle Contract (initiated/running/partial/success/failed)
│   ├── logic.ts
│   ├── gpio.ts
│   ├── device-metadata.ts  # DeviceMetadata Interface + Utility-Funktionen
│   ├── event-grouping.ts
│   └── form-schema.ts
├── utils/         # 13 Utility-Module
│   ├── formatters.ts      # ~631 Zeilen
│   ├── labels.ts
│   ├── sensorDefaults.ts
│   ├── actuatorDefaults.ts
│   ├── errorCodeTranslator.ts
│   ├── subzoneHelpers.ts  # normalizeSubzoneId (Defense-in-Depth vor API)
│   ├── trendUtils.ts      # calculateTrend (Linear Regression), TrendDirection, TREND_THRESHOLDS
│   ├── autoResolution.ts  # getAutoResolution(minutes) → SensorDataResolution, TIME_RANGE_MINUTES
│   ├── gridLayout.ts      # findFirstFreePosition(widgets, w, h, cols?) → {x,y} — Smart Placement fuer Dashboard-Widgets (FIX-ED-1)
│   └── ...
├── views/         # 19 View-Komponenten (inkl. NotFoundView + AccessDeniedView)
├── main.ts        # Bootstrap
├── App.vue        # Root Component
└── style.css      # CSS Variablen (~800 Zeilen)

El Frontend/tests/           # Test-Infrastruktur (Vitest + MSW)
├── setup.ts                 # Global Setup: MSW, Pinia, jsdom Mocks
├── mocks/
│   ├── server.ts            # MSW setupServer
│   ├── handlers.ts          # ~80 MSW Request Handlers
│   └── websocket.ts         # MockWebSocketService
└── unit/
    ├── stores/
    │   ├── auth.test.ts     # 37 Tests
    │   └── esp.test.ts      # 40 Tests
    ├── composables/
    │   ├── useToast.test.ts     # 27 Tests
    │   └── useWebSocket.test.ts # 55 Tests
    └── utils/
        └── formatters.test.ts   # 65 Tests
```

---

## 3. Component-Entwicklung

### Neue Komponente erstellen - Checkliste

1. TypeScript Interface in `types/index.ts` (wenn neue Datenstruktur)
2. Komponente in `src/components/{bereich}/` erstellen
3. `<script setup lang="ts">` verwenden
4. Props typisieren mit `defineProps<Props>()`
5. Events typisieren mit `defineEmits<{...}>()`
6. Composables fuer wiederverwendbare Logik
7. Tailwind + CSS Variables fuer Styling
8. @/ Imports verwenden (KEINE relativen ../.. Pfade)
9. Cleanup in `onUnmounted()` fuer Subscriptions
10. `npm run build` zur Verifikation

### Komponentenhierarchie (Dashboard)

```
DashboardView.vue
├── ActionBar.vue (Status-Pills, Filter)
├── ZoneGroupsContainer (CSS Grid)
│   └── ZoneGroup.vue (VueDraggable)
│       └── ESPOrbitalLayout.vue (3-Spalten)
│           ├── SensorSatellite.vue[] (links)
│           ├── ESPCard.vue (center)
│           └── ActuatorSatellite.vue[] (rechts)
├── ComponentSidebar.vue (rechts)
├── CrossEspConnectionOverlay.vue (SVG)
├── UnassignedDropBar.vue (bottom)
├── PendingDevicesPanel.vue (slide-over)
└── ESPSettingsSheet.vue (SlideOver)
```

### Komponentenhierarchie (HardwareView / Zone Accordion)

```
HardwareView.vue
├── ActionBar.vue (Filter, View Toggle)
├── ZonePlate.vue[] (Accordion, sortiert: offline→online→leer→alpha, Datenquelle: zoneStore.activeZones merged mit device-only Zonen)
│   ├── Header: Aggregierte Sensorwerte + Status-Dot + Subzone-Chips + Settings-Icon (→ ZoneSettingsSheet) + Zone-Name click-to-rename (cursor: text, dashed underline on hover)
│   ├── VueDraggable (filteredDevices, disabled bei isArchived)
│   │   └── DeviceMiniCard.vue[] (Compact: groupSensorsByBaseType, Sensor+Aktor-Count "XS / YA", Touch: always-visible actions, 44px touch targets, long-press feedback via chosen-class)
│   └── EmptyState (PackageOpen, wenn Zone leer)
├── Archived Zones AccordionSection (localStorage, nur wenn archivedZoneEntries > 0)
│   └── ZonePlate.vue[] (isArchived=true, opacity 0.6, dashed border, kein DnD, kein Subzone-CRUD)
├── UnassignedDropBar.vue (bottom, MOCK-Badge, Sensor-Summary)
├── PendingDevicesPanel.vue (slide-over)
├── ESPSettingsSheet.vue (SlideOver, ESP-Detail: Status, Zone (ZoneAssignmentPanel mit subzoneStrategy-Prop), Alert-Konfiguration (Gerät) via DeviceAlertConfigSection, Geräte nach Subzone read-only (Gruppierung via device.subzones SubzoneSummary-Resolver), Mock/Real, Delete)
│   └── ZoneSwitchDialog.vue (Modal bei Zone-Wechsel: Strategy-Auswahl transfer/reset/copy via RadioGroup, Props: isOpen/deviceName/currentZoneName/targetZoneName, Emits: close/confirm(strategy))
├── ZoneSettingsSheet.vue (SlideOver, Zone-Detail: Name, Beschreibung, Status, Archivieren/Reaktivieren, Loeschen)
├── SensorConfigPanel.vue (SlideOver, via DeviceDetailView @sensor-click — Grundeinstellungen inkl. operating_mode, timeout_seconds)
└── ActuatorConfigPanel.vue (SlideOver, via DeviceDetailView @actuator-click — subzone_id via normalizeSubzoneId)
```

### Komponentenhierarchie (SensorsView / Komponenten-Tab)

**Navigation:** Sidebar „Komponenten“ → Route `/sensors` → `SensorsView.vue` (ComponentInventoryView). Diese View ist die **Wissensdatenbank** (Inventar): flache Tabelle aller Sensoren/Aktoren/ESPs, Zone-Kontext, Device-Schemas. **SensorConfigPanel/ActuatorConfigPanel werden hier NICHT geöffnet** — nur in der HardwareView (Route `/hardware`). Backend-APIs: `/zone/context`, `/export/*`, `/schema-registry/*`, ggf. `inventory` (siehe `src/api/`). DB-Trennung: `.claude/reference/DATABASE_ARCHITECTURE.md`.

```
SensorsView.vue (?sensor={espId}-gpio{gpio} oder ?focus=sensorId → auto-open DeviceDetailPanel, NICHT SensorConfigPanel)
├── Scope-Filter-Chips (zone_local/multi_zone/mobile, nur sichtbar wenn hasNonLocalScope, T13-R3 WP5)
├── InventoryTable.vue (filterbar, sortierbar, Scope/ActiveZone Spalten opt-in defaultVisible: false)
├── DeviceDetailPanel.vue (SlideOver: Metadaten, Schema, Zone-Kontext, LinkedRules)
│   └── Link "Vollständige Konfiguration" → /hardware?openSettings={espId} (öffnet ESPSettingsSheet; Sensor-/Aktor-Konfig via Level 2 → Card klicken)
└── EmergencyStopButton.vue
```

### Komponentenhierarchie (MonitorView / Live-Monitoring)

```
MonitorView.vue (URL-Sync: L1→L2→L3 via route params)
├── Globales Connectivity-Banner (F07): Zustandsmaschine `connected|stale|reconnecting|degraded_api|disconnected`; Inputs: WS-Status + API-Fehler + letzter API-Erfolg; Retry-Aktion triggert serialisierte Rehydrate-Pipeline
├── L1 /monitor — Ready-Gate: BaseSkeleton bei espStore.isLoading, ErrorState bei espStore.error, Content nur nach erfolgreichem Laden
│   ├── Datenquellen: useZoneKPIs composable (espStore.devices Watch 300ms debounce + zonesApi.getAllZones() 30s Cooldown, inkl. leere Zonen) + zoneStore.activeZones/archivedZones (T13-R3 WP5)
│   ├── Datenmoduskennzeichnung (F07): ZoneTileCard zeigt `Live|Hybrid|Snapshot` explizit
│   ├── Zone-Filter: Native <select> mit activeZones + <optgroup label="Archiv"> fuer archivedZones; selectedZoneFilter ref; filteredZoneKPIs computed; "Gefiltert" Badge (ListFilter-Icon) bei aktivem Filter; Archived-Banner bei archivierter Zone (T13-R3 WP5)
│   ├── Zone-Tiles: ZoneTileCard.vue (Props: zone/isStale/healthConfig/rules?/totalRuleCount?/isRuleActive?, Emit: click, Slots: kpis/extra/footer); Rules-Summary Block (L1 kompakt, max 2 Regeln, Zap-Icon, aktive Regel Glow, "X weitere" Badge, .monitor-zone-tile__rules-summary); CSS-Grid align-items: stretch (gleiche Hoehe pro Zeile), Footer margin-top: auto; Reihenfolge: Zone-Tiles → Aktive Automatisierungen (D2: Cross-Zone-Dashboards + losgeloeste Inline-Panels entfernt); extra-Slot (Phase 3): InlineDashboardPanel compact mode="view" mit getZoneMiniPanelId() — zeigt max 1 zone-tile Dashboard (scope='zone-tile', nur gauge/sensor-card, max 120px Hoehe, keine Toolbar); ensureZoneTileDashboard() auto-generiert Tile-Dashboards mit Temp+Humidity Gauges beim ersten L1-Laden (Session-Guard)
│   ├── Leere Zonen: ZoneHealthStatus 'empty' (Minus-Icon, opacity 0.7, status "Leer"), NICHT "alarm"
│   ├── Zone-Tile Footer: "X/Y online" (ESP-Count), Sensor/Aktor-Counts, lastActivity, mobileGuestCount ("+ X mobil" wenn >0, 6.7)
│   ├── ActiveAutomationsSection: v-if="hasActiveAutomations" (hidden bei 0 enabled Rules, sichtbar waehrend Loading); logicStore.enabledRules, Top 5 als RuleCardCompact (ul/li, :focus-visible), Link "Alle Regeln" → /logic; Zone-Badge Fallback "—"; responsive Grid
│   ├── Empty State CTA: "Noch keine Zonen eingerichtet." + "Weise Geraeten Zonen zu unter Hardware." mit `<router-link to="/hardware">` (sekundaerer Ghost-Button-Stil, CSS `.monitor-view__empty-cta`) bei leerem zoneKPIs-Array
│   └── 40px Trennung: var(--space-10) zwischen Zone-Grid und ActiveAutomationsSection
├── L2 /monitor/:zoneId — Subzone-First Gruppierung: Zone-Header → Subzone-Accordions (Sensoren+Aktoren zusammen) → Regeln → Zone-Dashboards → Inline-Panels
│   ├── Datenquelle: zonesApi.getZoneMonitorData (primaer, AbortController bei Zone-Wechsel), Fallback useZoneGrouping + useSubzoneResolver nur bei API-Fehler; Ready-Gate (v-if=!zoneMonitorLoading) + BaseSkeleton waehrend Loading, ErrorState bei Fehler
│   ├── Reconnect-Recovery (F07): bei WS-Reconnect serialisiert `espStore.fetchAll()` → `fetchZoneMonitorData()` → optional `fetchDetailData()`; dedupliziert bei Mehrfachtriggern; Sync-Hinweis "Stand synchronisiert um <zeit>"
│   ├── Datenstruktur: zoneDeviceGroup computed (ZoneDeviceSubzone[]) — unified sensors+actuators pro Subzone; filteredSubzones computed (Subzone-Filter); ersetzt getrennte zoneSensorGroup/zoneActuatorGroup
│   ├── Inline-Panels L2: inlineMonitorPanelsL2 mode="manage" = cross-zone + zone-spezifische (scope=zone, zoneId=selectedZoneId); Hover-Toolbar [Konfigurieren][Entfernen] (D4); L1 zeigt NUR zone-spezifische Mini-Widgets IN Kacheln (Phase 3, extra-Slot) — losgeloeste Inline-Panels auf L1 entfernt (D2)
│   ├── Zone-Header: Name + Sensor/Aktor-Count + Alarm-Count
│   ├── Subzone-Filter: Native <select> (nur wenn >1 Subzone); selectedSubzoneFilter ref (reset bei Zone-Wechsel); filteredSubzones computed; availableSubzones aus zoneDeviceGroup (T13-R3 WP5)
│   ├── Subzone-Accordion: v-for subzone in filteredSubzones; Header mit Count-Badge "XS · YA"; Accordion-Header NUR wenn >1 Subzone oder benannte Subzone; Body v-show mit Transition; Smart-Defaults (<=4 alle offen, >4 erste+Zone-weit offen, leere eingeklappt); localStorage-Persistenz
│   │   ├── Typ-Labels "Sensoren"/"Aktoren": NUR sichtbar wenn BEIDE Typen in der Subzone vorhanden
│   │   ├── Dashed Trennlinie (.monitor-subzone__separator): NUR zwischen Sensoren und Aktoren wenn beide vorhanden
│   │   ├── SensorCard.vue[] (mode='monitor', Stale/ESP-Offline-Badges, Trend-Pfeil via :trend Prop, Scope-Badge Multi-Zone/Mobil (T13-R3 WP4), Datenmodus-Badge `Live|Hybrid|Snapshot` (F07), from components/devices/; effectiveQualityStatus: bei Stale→`stale` (eigener Status), qualityLabel "Veraltet", eigene Stale-Farbkodierung getrennt von Warning; Mobile: Kontext-Hint "Aktiv in Zone X seit..." + Zone-Wechsel-Dropdown via deviceContextStore (6.7); Virtual-Sensor Info-Icon: Lucide Info 14px neben Titel bei VIRTUAL_SENSOR_META match, Glassmorphism-Tooltip mit Quell-Sensoren + Formel (V19-F03))
│   │   │   ├── #sparkline: LiveLineChart (compact, sensor-type → auto Y-Range, thresholds → farbige Schwellwert-Zonen aus SENSOR_TYPE_CONFIG)
│   │   │   └── [Expanded] 1h-Chart (vue-chartjs Line, sensorsApi.queryData Initial-Fetch)
│   │   │       ├── "Zeitreihe anzeigen" → openSensorDetail (L3)
│   │   │       └── "Konfiguration" → /sensors?sensor={espId}-gpio{gpio}
│   │   ├── ActuatorCard.vue[] (mode='monitor', read-only: kein Toggle, PWM-Badge bei pwm_value>0, linkedRules mit Status-Dot+Name+Condition, lastExecution mit relativem Zeitstempel, "+N weitere" Link bei >2 Regeln, Scope-Badge Multi-Zone/Mobil (T13-R3 WP4), ESP-Offline-Badge (opacity 0.5, WifiOff) + Stale-Markierung (opacity 0.7, warning border-left), Datenmodus-Badge `Live|Hybrid|Snapshot` + Warntext "Status ggf. veraltet" bei `disconnected|degraded_api` (F07), typ-spezifische Icons via getActuatorTypeInfo(actuator_type, hardware_type) — hardware_type bevorzugt für Pumpe/Ventil/Relay-Differenzierung, Subzone-Fallback "Zone-weit", from components/devices/)
│   │   └── Leere Subzone: "Keine Geraete zugeordnet" (kompakt, kein Link)
│   ├── "Zone-weit" (statt "Keine Subzone"): Am Ende sortiert, kein farbiger Left-Border, dashed Top-Border; bei einziger Gruppe (nur Zone-weit): kein Accordion-Wrapper, Geraete direkt sichtbar
│   ├── Regeln fuer diese Zone (N): ZoneRulesSection.vue — logicStore.getRulesForZone(zoneId); RuleCardCompact pro Regel; Klick → /logic/:ruleId; Empty State: Link "Zum Regeln-Tab"; Bei >10 Regeln: erste 5 + Link "Weitere X Regeln — Im Regeln-Tab anzeigen"
│   ├── Shared Sensors (6.7): v-if="sharedSensorRefs.length > 0"; multi_zone Sensoren aus ANDEREN Zonen deren assigned_zones die aktuelle Zone enthaelt; SharedSensorRefCard (kompakt, read-only, dashed border, "via Heimzone" + Navigation-Link)
│   └── Zone-Dashboards: getDashboardNameSuffix(dash) fuer eindeutige Namen (createdAt oder ID)
├── L3 /monitor/:zoneId/sensor/:sensorId — SlideOver (Sensor-Detail, Deep-Link-faehig)
│   ├── F07 Transparenz: "Live jetzt: <wert/zeit>" (Store-Quelle) getrennt von "Historie bis: <zeit>" (API-Quelle), inklusive Stale-Markierung fuer historischen Stand
│   └── Multi-Sensor-Overlay: Chip-Selektor (max 4 Sensoren), sekundaere Y-Achse bei unterschiedlichen Einheiten, server-seitige Aggregation via getAutoResolution (resolution-Parameter im API-Call, Tooltip "(Ø)" bei aggregierten Daten, kein Min/Max-Band)
├── QuickActionBall (FAB, mode="monitor", fixed bottom-right): Klick auf Widget-Typ → emitiert widget-selected → oeffnet AddWidgetDialog (D3); "Dashboards" → QuickDashboardPanel (position: fixed, z-index: --z-fab, V19-F04)
│   └── QuickDashboardPanel (position: fixed ueber FAB; Dashboard-Liste gruppiert nach cross-zone/zone; Empty-State min-height 120px; Touch: Edit-Button immer sichtbar @media hover:none)
└── AddWidgetDialog (BaseModal, 3-Schritt: Widget-Typ → Zone → Sensor; Props: open, defaultZoneId aus L2-Route, defaultWidgetType aus FAB; erstellt Zone-Dashboard via generateZoneDashboard falls keins existiert; nutzt useSensorOptions(filterZoneId) + WIDGET_TYPE_META; addWidget() in dashboard.store; D3)
```

### Komponentenhierarchie (CustomDashboardView / Dashboard Editor)

```
CustomDashboardView.vue (/editor, /editor/:dashboardId)
├── ViewTabBar.vue (Tab-Navigation)
├── Toolbar
│   ├── Layout-Selector (Dropdown: vorhandene Dashboards + Templates, "Auto"-Badge bei autoGenerated)
│   │   ├── "Auto-generierte aufräumen" Button (nur sichtbar bei autoGenerated > 0, oeffnet Bulk-Modal)
│   │   ├── Per-Item Trash2 Delete-Icon (hover-sichtbar Desktop, immer sichtbar Touch, Confirm-Dialog)
│   │   └── DASHBOARD_TEMPLATES (4 Templates: Zonen-Uebersicht, Sensor-Detail, Multi-Sensor, Leer)
│   ├── Edit/View-Toggle (Pencil/Eye Icon, isEditing ref)
│   ├── Widget-Katalog-Toggle (LayoutGrid Icon, showCatalog ref)
│   ├── Export/Import/Delete Buttons (nur im Edit-Modus sichtbar)
│   └── "Neues Dashboard" Button (oeffnet direkt im Edit-Mode mit Widget-Katalog)
├── Widget-Katalog Sidebar (showCatalog, 10 Widget-Typen mit Icon + Label + Description)
│   └── addWidget(type) → WIDGET_DEFAULT_CONFIGS + GridStack.addWidget()
├── Empty-State (v-if leeres Dashboard im View-Mode: Icon + "Noch keine Widgets" + CTA "Bearbeiten")
├── No-Dashboard-State (v-if layouts.length === 0: "Kein Dashboard vorhanden" + "Neues Dashboard" CTA)
├── GridStack 12-Column Grid (staticGrid im View-Modus, editierbar im Edit-Modus)
│   └── Dashboard-Widget[] (imperativ via createWidgetElement + mountWidgetComponent)
│       ├── Widget-Header (Titel + Gear-Icon + X-Remove-Button, nur im Edit-Modus sichtbar)
│       └── Widget-Body (SensorCardWidget, GaugeWidget, LineChartWidget, MultiSensorWidget (Compare Mode: Toggle + sensorType/Zone-Dropdowns → Auto-Fill max 4 Subzone-Sensoren; Aktor-Korrelation P8-A6c: max 2 Aktoren als Hintergrund-Overlay + Schaltmoment-Annotations), etc.)
├── WidgetConfigPanel.vue (SlideOver, Gear-Icon oeffnet Konfiguration; zoneId Prop fuer Zone-Scope Default PA-02c; 3-Zonen Progressive Disclosure P8-A2)
│   ├── Zone 1 KERN (immer sichtbar, max 5 Felder):
│   │   ├── Titel-Input
│   │   ├── Sensor Zone-Filter (selectedSensorZone: defaults to zoneId Prop bei Zone-Dashboards, "Alle Zonen" bei global; filtert useSensorOptions via filterZoneId)
│   │   ├── Zone-Filter-Dropdown (alarm-list, esp-health, actuator-runtime; "Alle Zonen" oder konkrete Zone aus espStore.devices)
│   │   ├── Sensor-Selektion (gruppiert nach Zone/Subzone via optgroup; useSensorOptions Composable) / Actuator-Selektion
│   │   └── Zeitraum-Chips (1h, 6h, 24h, 7d, 30d — Historical + Statistics)
│   ├── Zone 2 DARSTELLUNG (details/summary Accordion, eingeklappt):
│   │   ├── Y-Achse Min/Max (hasYRange: line-chart, historical, gauge; auto-populate via handleSensorChange)
│   │   ├── Farb-Palette (CHART_COLORS, 8 Farben)
│   │   └── Threshold-Konfiguration (hasThresholdFields: line-chart, gauge, historical; showThresholds Toggle + Alarm/Warn Low/High)
│   └── Zone 3 ERWEITERT (details/summary Accordion, eingeklappt, nur statistics):
│       └── Statistics-Optionen (showStdDev Checkbox, showQuality Checkbox)
└── BulkCleanupModal (BaseModal, Checkbox-Liste aller autoGenerated Dashboards, Bulk-Delete via bulkDeleteLayouts)
```

### Standard Component Template

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'
import type { MockESP } from '@/types'

// Props
interface Props {
  deviceId: string
  showDetails?: boolean
}
const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update', device: MockESP): void
  (e: 'delete'): void
}>()

// Stores & Composables
const espStore = useEspStore()
const { showSuccess, showError } = useToast()

// Local State
const isLoading = ref(false)

// Computed
const device = computed(() =>
  espStore.devices.find(d => d.esp_id === props.deviceId)
)

// Methods
async function handleAction(): Promise<void> {
  isLoading.value = true
  try {
    await espStore.fetchDevice(props.deviceId)
    showSuccess('Erfolgreich')
  } catch (e) {
    showError(e instanceof Error ? e.message : 'Fehler')
  } finally {
    isLoading.value = false
  }
}

// Lifecycle
onMounted(() => { /* init */ })
onUnmounted(() => { /* cleanup */ })
</script>

<template>
  <div class="card">
    <!-- Content -->
  </div>
</template>
```

---

## 4. Type-System

### Kerntypen (types/index.ts)

| Type | Zeilen | Beschreibung |
|------|--------|--------------|
| MockESP / ESPDevice | 275-294 | Device mit Sensors, Actuators, Status |
| MockSensor | 234-290 | Sensor mit Multi-Value Support, config_id (UUID), interface_type (inkl. VIRTUAL), i2c_address, device_scope, assigned_zones |
| MockActuator | 265-273 | Actuator mit PWM, device_scope, assigned_zones |
| QualityLevel | - | 'excellent' \| 'good' \| 'fair' \| 'poor' \| 'bad' \| 'stale' \| 'error' |
| MockSystemState | - | 12 States: BOOT, WIFI_SETUP, WIFI_CONNECTED, MQTT_CONNECTING, MQTT_CONNECTED, AWAITING_USER_CONFIG, ZONE_CONFIGURED, SENSORS_CONFIGURED, OPERATIONAL, LIBRARY_DOWNLOADING, SAFE_MODE, ERROR |
| ZoneStatus (T13-R3) | - | 'active' \| 'archived' — Status einer ZoneEntity |
| ZoneEntity (T13-R3) | - | Zone-Entitaet mit id, name, slug, status, created_at, updated_at |
| ZoneEntityCreate (T13-R3) | - | Create-Payload: name (required), description? |
| ZoneEntityUpdate (T13-R3) | - | Update-Payload: name?, description? |
| ZoneEntityListResponse (T13-R3) | - | Paginierte Zone-Liste: items[], total, active_count, archived_count |
| DeviceScope (T13-R3) | - | 'zone_local' \| 'multi_zone' \| 'mobile' — Reichweite eines Sensors/Aktors |
| DeviceContextSet (T13-R3) | - | Context-Payload: active_zone_id, active_subzone_id? |
| DeviceContextResponse (T13-R3) | - | Gesetzte Context-Antwort: config_type, config_id, active_zone_id, active_subzone_id?, context_source |
| SensorConfigCreate (erweitert) | - | +device_scope?: DeviceScope, +assigned_zones?: string[] |
| SensorConfigResponse (erweitert) | - | +device_scope: DeviceScope, +assigned_zones: string[] |
| ActuatorConfigCreate (erweitert) | - | +device_scope?: DeviceScope, +assigned_zones?: string[] |
| ActuatorConfigResponse (erweitert) | - | +device_scope: DeviceScope, +assigned_zones: string[] |
| ZoneAssignRequest (erweitert) | - | +subzone_strategy?: string |

### WebSocket Events (types/websocket-events.ts)

| Event | Data | Woher |
|-------|------|-------|
| sensor_data | esp_id, gpio, value, quality, zone_id, subzone_id (Phase 0.1) | MQTT→Server→WS |
| actuator_status | esp_id, gpio, actuator_type (server-normalisiert), hardware_type (ESP32-Typ), state, value, emergency | MQTT→Server→WS |
| esp_health | esp_id, status, heap, rssi, optional Telemetrie (`persistence_degraded`, `network_degraded`, `critical_outcome_drop_count`, …), Offline-Kontext (`source`, `reason`, `timeout_seconds`, `actuator_states_reset`), Reconnect-Hinweise (`is_reconnect`, `is_flapping`, `lwt_count_5m`) | Heartbeat/LWT/Timeout→Server→WS |
| esp_reconnect_phase | esp_id, phase (`adopting`/`adopted`/`delta_enforced`/`converged`), timestamp, offline_seconds?, config_push_pending? | Heartbeat-Reconnect→Server→WS |
| config_response | esp_id, status, error_code, correlation_id (pflicht), request_id? | ESP→MQTT→Server→WS (terminal nur per correlation_id) |
| config_published | esp_id, config_keys[], correlation_id? | Server Publish→WS (non-terminal, pending) |
| config_failed | esp_id, config_keys[], error, correlation_id (pflicht), request_id? | Server Publish→WS (terminal nur per correlation_id) |
| intent_outcome | esp_id, intent_id, flow, outcome, code, correlation_id, … (kanonisch) | MQTT→Server→WS |
| intent_outcome_lifecycle | esp_id, schema, event_type, reason_code?, boot_sequence_id?, ts? | MQTT CONFIG_PENDING-Lifecycle→Server→WS |
| actuator_command | esp_id, gpio, command, correlation_id?, request_id? | REST/MQTT→Server→WS (non-terminal, pending); `correlation_id` = Feld aus REST `ActuatorCommandResponse` bei User-Commands |
| actuator_response | esp_id, gpio, command, success, correlation_id?, request_id? | ESP→MQTT→Server→WS (terminal) |
| actuator_command_failed | esp_id, gpio, command, error, correlation_id?, request_id? | Server→WS (terminal, publish/safety failure) |
| sequence_started | sequence_id, rule_name?, total_steps | Logic Engine→WS (non-terminal, pending) |
| sequence_step | sequence_id, step, total_steps | Logic Engine→WS (non-terminal, progress) |
| sequence_completed | sequence_id, success | Logic Engine→WS (terminal) |
| sequence_error | sequence_id, message | Logic Engine→WS (terminal) |
| sequence_cancelled | sequence_id, reason? | Logic Engine→WS (terminal) |
| device_discovered | esp_id, hardware_type | Auto-Discovery |
| error_event | esp_id, error_code, troubleshooting | ESP→Server→WS |
| server_log | level, message, exception | Server intern |
| plugin_execution_started | execution_id, plugin_id, trigger_source | PluginService→WS |
| plugin_execution_status (optional) | execution_id, plugin_id, status, message, updated_at, progress_percent?, step?, error_code?, error_message? | PluginService/Worker→WS |
| sensor_config_deleted | config_id, esp_id, gpio, sensor_type | Server→WS (Delete-Pipeline) |
| actuator_config_deleted | esp_id, gpio, actuator_type | Server→WS (Delete-Pipeline) |
| plugin_execution_completed | execution_id, plugin_id, status, duration_seconds, error_message | PluginService→WS |
| device_scope_changed (T13-R3) | config_type, config_id, device_scope, assigned_zones | Server→WS (PUT sensors/actuators) |
| device_context_changed (T13-R3) | config_type, config_id, active_zone_id, active_subzone_id, context_source, changed_by | Server→WS (PUT/DELETE /device-context) |
| zone_assignment (T13-R3) | esp_id, status, zone_id, master_zone_id, zone_name, kaiser_id, timestamp, message?, reason_code? | MQTT→Server→WS (zone ACK) |
| subzone_assignment (T13-R3) | esp_id, subzone_id, status, timestamp, error_code, message, reason_code? | MQTT→Server→WS (subzone ACK) |
| notification_new | (Router-Payload) | NotificationRouter→WS |
| notification_updated | (Router-Payload) | NotificationRouter→WS |
| notification_unread_count | count, highest_severity? | NotificationRouter→WS |
| contract_mismatch | original_event_type, mismatch_reason, correlation_id?, request_id? | Frontend-Mapper (Integrationssignal) |
| contract_unknown_event | original_event_type, correlation_id?, request_id? | Frontend-Mapper (Integrationssignal) |

**WICHTIG:** Type-Aenderungen IMMER mit Server-Team abstimmen!
WebSocket-Events = Kontrakt zwischen Frontend und Backend.
Contract-Consumption im Frontend ist contract-first: terminal_success/terminal_failed kommen aus terminalen Contract-Events; ausbleibende Endevents duerfen ueber lokale Schutz-Timeouts als `terminal_timeout` finalisiert werden.
Intent-Lifecycle Zuordnung:
- Actuator terminal nur via `actuator_response` / `actuator_command_failed`
- Config terminal nur via `config_response` / `config_failed`
- Sequence terminal nur via `sequence_completed` / `sequence_error` / `sequence_cancelled`
- Kanonische MQTT-Intents zusaetzlich: `intent_outcome` (terminal je nach Payload) / `intent_outcome_lifecycle` (nicht-terminal) — Anzeige-SSOT `intentSignals.store.ts`; Firmware-`code` nicht als pauschaler Vertragsfehler labeln
- Primaerer Korrelationsschluessel ist `correlation_id`; `request_id` ist optionaler Trace-Kontext und fuer Config-Events nicht durchgaengig verfuegbar.
- Fuer Aktor-Finalitaet gilt Operator-UI-Guardrail: pro `correlation_id` genau ein terminaler Toast-Ausgang (success/failed/timeout), auch bei konkurrierenden Regelpfaden oder mehrfachen terminalen Eventquellen.
- Wenn terminale Contract-Events ausbleiben, werden offene Aktor-/Config-Intents nach Frist als `terminal_timeout` abgeschlossen (Operator-Hinweis statt Dauer-`pending`).
- `EventDetailsPanel` zeigt fuer terminale Fehler-/Abbruchfaelle eine einheitliche Operator-Entscheidung (Problemtyp, Prioritaet, Ursache, naechster Schritt).

### Logic Types (types/logic.ts)

- LogicRule: Conditions + Actions + Cooldown + logic_operator (AND/OR) + priority (1–100; kleinere Zahl = höhere Priorität bei Sortierung/Konflikten, konsistent mit Server/OpenAPI)
- SensorCondition: Vergleichsoperatoren (>, <, >=, <=, ==, !=, between), optional subzone_id (Phase 2.4)
- TimeCondition: start_hour, end_hour, days_of_week (0=Monday, 6=Sunday — ISO 8601 / Python weekday())
- HysteresisCondition: Kühlung (activate_above/deactivate_below) oder Heizung (activate_below/deactivate_above)
- CompoundCondition: Nested AND/OR conditions
- ActuatorAction: ON/OFF/PWM/TOGGLE + Duration
- NotificationAction: channel + target + message_template
- DelayAction: seconds
- RuleLifecycleState: `accepted` | `pending_activation` | `pending_execution` | `terminal_success` | `terminal_failed` | `terminal_conflict` | `terminal_integration_issue`
- RuleIntentLifecycle: Rule-instanzbezogener Laufzeitstatus inkl. `terminal_reason_code`, `terminal_reason_text`, `correlation_id`, `request_id`, `updated_at`
- ExecutionHistoryItem: rule_id, rule_name, triggered_at, trigger_reason, actions_executed, success, error_message?, execution_time_ms, lifecycle_state?, terminal_reason_code?, terminal_reason_text?, intent_id?, correlation_id?, request_id?, updated_at?, action_outcomes?
- LogicConnection: ruleId, sourceEspId/Gpio, targetEspId/Gpio, isCrossEsp
- extractEspIdsFromRule(rule): Set<string> — alle ESP-IDs aus Conditions (Sensor, Hysteresis) + ActuatorActions; fuer getRulesForZone und getZonesForRule
- formatConditionShort(rule): string — lesbarer Kurztext aller Conditions ("Temperatur > 28°C UND 06:00–20:00"); nutzt getSensorLabel/getSensorUnit fuer Labels+Einheiten; Operatoren ≥/≤, between, Hysterese, Zeit, Compound→"[Komplex]"; Verbindung via logic_operator (UND/ODER)

### GPIO Types (types/gpio.ts)

- GpioUsageItem: Pin-Belegung
- GpioStatusResponse: Freie/Belegte/System-Pins

### Device Metadata Types (types/device-metadata.ts)

- DeviceMetadata: Hersteller, Modell, Datenblatt-URL, Seriennummer, Installation, Wartung, Notizen, custom_fields
- parseDeviceMetadata(raw): Extrahiert typisierte Felder aus Server-JSON
- mergeDeviceMetadata(existing, structured): Merged strukturierte Metadaten zurueck in Server-JSON (preserviert unbekannte Felder)
- getNextMaintenanceDate(metadata): Berechnet naechsten Wartungstermin aus last_maintenance + interval
- isMaintenanceOverdue(metadata): Prueft ob Wartung ueberfaellig

---

## 5. State Management (Pinia)

### Store-Architektur

| Store | Datei | State | Wichtigste Actions |
|-------|-------|-------|-------------------|
| auth | stores/auth.ts | user, tokens, setupRequired | login, logout, refreshTokens |
| esp | stores/esp.ts | devices[] (inkl. optional `runtime_health_view`), pendingDevices[] | fetchAll, fetchDevice, `replaceDevices(snapshot)`, `applyDevicePatch(espId, patchFn)` (Write-Boundary fuer Device-Domain), isMock, gpioStatusMap, onlineDevices (via getESPStatus), offlineDevices; WS: `initWebSocket` + Filterliste/Mutation-Contract in `esp-websocket-subscription.ts` |
| intentSignals | shared/stores/intentSignals.store.ts | byEspId (Intent/Zwischenstand pro Geraet) | ingestOutcome, ingestLifecycle, getDisplayForEsp, clearAll (Logout / esp cleanupWebSocket) |
| dashboard | stores/dashboard.store.ts | statusCounts (computed via getESPStatus), deviceCounts, filters, breadcrumb (level, zoneName, deviceName, sensorName, ruleName, dashboardName), layouts[], DASHBOARD_TEMPLATES, DashboardTarget (interface), inlineMonitorPanels (alias), inlineMonitorPanelsCrossZone (computed), inlineMonitorPanelsForZone(zoneId) (fn), sideMonitorPanels (computed), bottomMonitorPanels (computed), hardwarePanels (computed), autoGeneratedLayouts (computed), lastSyncError, syncFlags pro Layout (`local_only`/`dirty`/`server_synced`/`conflict`, inkl. last_sync_*) | toggleStatusFilter, resetFilters, createLayout, saveLayout, createLayoutFromTemplate, deleteLayout, bulkDeleteLayouts(layoutIds), exportLayout, importLayout, setLayoutTarget, setLayoutScope, setLayoutMetadata, generateZoneDashboard, claimAutoLayout, retrySync, flushPendingSyncs, buildLayoutIdentityKey, addWidget(layoutId, config), removeWidget(layoutId, widgetId), updateWidgetConfig(layoutId, widgetId, newConfig); fetchLayouts (Server-Merge mit Dirty-/Zeitregeln + Orphan-Sync + autoGenerated-Migration); cleanupOrphanedDashboards (V19-F05: auto-delete orphaned zone dashboards, watch on zoneEntities once + after deleteZoneEntity) |
| zone | stores/zone.store.ts | zoneEntities[], isLoadingZones | handleZoneAssignment (+ Toasts), handleSubzoneAssignment (+ Toasts), fetchZoneEntities, createZone, updateZone, archiveZone, reactivateZone, deleteZoneEntity (+ cleanupOrphanedDashboards V19-F05); activeZones/archivedZones (computed); handleDeviceScopeChanged, handleDeviceContextChanged (T13-R3) |
| deviceContext | shared/stores/deviceContext.store.ts | contexts (Map\<string, DeviceContextResponse\>), isLoaded | loadContextsForDevices, setContext, clearContext, handleContextChanged (WS), getActiveZoneId, getContext; fuer mobile/multi_zone Sensoren (6.7) |
| logic | shared/stores/logic.store.ts | rules[], activeExecutions, executionHistory[], historyLoaded, ruleLifecycleByRuleId, lifecycleTransitions | fetchRules, toggleRule, crossEspConnections, getRulesForZone(zoneId), getZonesForRule(rule), getRulesForActuator(espId, gpio), getLastExecutionForActuator(espId, gpio), loadExecutionHistory, `setRuleLifecycle`/`getRuleLifecycleState`, `lifecycleByReasonCode`, pushToHistory, undo, redo, canUndo, canRedo |
| dragState | stores/dragState.ts | isDragging* flags, payloads | start/endDrag, 30s timeout |
| database | stores/database.ts | tables, currentData, queryParams | loadTables, selectTable, refreshData |
| quickAction | stores/quickAction.store.ts | isMenuOpen, activePanel (QuickActionPanel: 'menu' \| 'alerts' \| 'navigation'), currentView, contextActions[], globalActions[] | toggleMenu, closeMenu, setActivePanel, setViewContext, setContextActions, executeAction; alertSummary (computed from alert-center + inbox fallback), hasActiveAlerts, isCritical, isWarning |
| notificationInbox | stores/notification-inbox.store.ts | notifications[], unreadCount, highestSeverity, isDrawerOpen, activeFilter (InboxFilter), sourceFilter (SourceFilterValue) | loadInitial, loadMore, markAsRead, markAllAsRead, toggleDrawer, setSourceFilter, `applyAlertUpdate(updated)` (einzige Inbox-Write-API fuer Fremdstores); filteredNotifications (Severity + Source); WS-Listener: notification_new, notification_updated, notification_unread_count |
| alertCenter | stores/alert-center.store.ts | alertStats, activeAlerts[], statusFilter, severityFilter | fetchStats, fetchActiveAlerts, acknowledgeAlert, resolveAlert, startStatsPolling, stopStatsPolling; Inbox-Updates nur via `notificationInbox.applyAlertUpdate()` (kein Direkt-Write in `notifications[]`); unresolvedCount, criticalCount, warningCount, hasCritical, mttaFormatted, mttrFormatted (computed) |
| diagnostics | shared/stores/diagnostics.store.ts | currentReport, history[], availableChecks[], isRunning | runDiagnostic, runCheck, loadHistory, loadReport, exportReport; lastRunAge (aus currentReport oder history[0]), checksByName, statusCounts (Phase 4D) |
| inventory | shared/stores/inventory.store.ts | searchQuery, zoneFilter, typeFilter, statusFilter, scopeFilter, sortKey, sortDirection, pageSize, currentPage, visibleColumns, selectedDeviceId, isDetailOpen | toggleSort, setPage, toggleColumn, openDetail, closeDetail, resetFilters; allComponents (unified sensors+actuators), filteredComponents, sortedComponents, paginatedComponents, availableZones, hasNonLocalScope (computed); ComponentItem mit scope/activeZone (T13-R3 WP5) |
| plugins | shared/stores/plugins.store.ts | plugins[], selectedPlugin, executionHistory[], pluginOptions (computed), executionLifecycleIds | fetchPlugins, fetchPluginDetail, executePlugin, togglePlugin, updateConfig, fetchHistory, startLifecycleMonitoring, stopLifecycleMonitoring, reconcileRunningExecutions (Phase 4C/F11) |
| opsLifecycle | shared/stores/ops-lifecycle.store.ts | entries[] (OpsLifecycleEntry) | startLifecycle, updateByExecutionId, markRunning/Partial/Success/Failed, runningHighRiskEntries |

### Store-Konventionen

- **Setup Stores** (Composition API, NICHT Options API)
- `ref()` fuer State, `computed()` fuer Getters
- Async Actions mit try/catch + Toast-Feedback
- WebSocket-Events in Store-Actions verarbeiten
- KEIN direkter API-Call aus Komponenten
- Device-Domain-Writes nur ueber `esp.applyDevicePatch()` / `esp.replaceDevices()` (keine Fremdstore-Array-Mutationen)

### ESP Store WebSocket-Integration

**Kritisch:** `useWebSocket({ filters: { types: [...] } })` — `types` muss **jede** in `initWebSocket` registrierte `ws.on('…')`-Typ enthalten (sonst keine Auslieferung an Handler). Siehe `stores/esp-websocket-subscription.ts` und `WEBSOCKET_EVENTS.md` §0.1.

```typescript
// Pattern: WebSocket Event → Store Update → Reactive Render
const wsUnsubscribers: (() => void)[] = []

function initWebSocket(): void {
  const ws = WebSocketService.getInstance()

  wsUnsubscribers.push(
    ws.on('sensor_data', (msg) => {
      const device = devices.value.find(d => d.esp_id === msg.esp_id)
      if (device) {
        const sensor = device.sensors.find(s => s.gpio === msg.gpio)
        if (sensor) {
          sensor.raw_value = msg.data.value
          sensor.quality = msg.data.quality
        }
      }
    })
  )
}

function cleanupWebSocket(): void {
  wsUnsubscribers.forEach(unsub => unsub())
  wsUnsubscribers.length = 0
}
```

---

## 6. Server-Verbindung

### HTTP-Client (api/index.ts)

```typescript
// Axios Instance
baseURL: '/api/v1'
timeout: 30000

// Request Interceptor
- JWT Bearer Token hinzufuegen

// Response Interceptor
- 401 → Auto Token-Refresh bei 401
- Auth-Endpoints ueberspringen Refresh (Anti-Loop)

// Helper Functions
get<T>, post<T>, put<T>, del<T>, patch<T>
```

### REST-Error SSOT (`api/uiApiError.ts`)

```typescript
type UiApiError = {
  message: string
  numeric_code: number | null
  request_id: string | null
  retryability: 'yes' | 'no' | 'unknown'
  status: number
}

toUiApiError(error, fallbackMessage)
formatUiApiError(uiError)
// Regel: Keine ad-hoc detail-Parser in Business-Stores/Views.
// 403 -> retryability='no' + Text "Zugriff verweigert".
```

### Neuen API-Endpunkt hinzufuegen

1. Funktion in passendes `api/*.ts` Modul
2. Response-Type in `types/index.ts`
3. Store-Action die API-Modul aufruft
4. Komponente ruft Store-Action auf

### WebSocket Service (services/websocket.ts)

```typescript
class WebSocketService {
  // Singleton Pattern
  static getInstance(): WebSocketService

  // Connection
  connect(): Promise<void>
  disconnect(): void
  isConnected(): boolean
  getStatus(): 'disconnected' | 'connecting' | 'connected' | 'error'

  // Subscriptions
  subscribe(filters, callback): string
  unsubscribe(subscriptionId): void
  on(type, callback): () => void  // Returns unsubscribe fn

  // Features
  - Reconnect: Exponential Backoff 1s → 30s max
  - Rate-Limit: MAX_MESSAGES_PER_SECOND = 10
  - Tab-Visibility: Schneller Reconnect bei Aktivierung
  - JWT in Query-Parameter (kein Custom Header bei WS)
}
```

### useWebSocket Composable

```typescript
const { on, cleanup, isConnected } = useWebSocket()

// Registriere Handler
const unsubscribe = on('sensor_data', handleSensorData)

// Cleanup in onUnmounted
onUnmounted(() => {
  cleanup()
})
```

---

## 7. API-Module

| Modul | Endpoints | Beschreibung |
|-------|-----------|--------------|
| `auth.ts` | `/auth/*` | Login, Logout, Setup, Refresh, Me |
| `esp.ts` | `/esp/*`, `/debug/*` | Unified Mock + Real ESP API |
| `sensors.ts` | `/sensors/*` | Sensor CRUD + History + Stats |
| `actuators.ts` | `/actuators/*` | Actuator Control |
| `zones.ts` | `/zone/*`, `/zones` | Zone Assignment/Removal, getAllZones (inkl. leere), getZoneMonitorData (L2), ZoneEntity CRUD (T13-R3) |
| `subzones.ts` | `/subzone/*` | Subzone CRUD + Safe-Mode |
| `device-context.ts` | `/device-context/*` | Device Context setzen (PUT), lesen (GET), loeschen (DELETE) — T13-R3, NEU |
| `backups.ts` | `/backups/*` | DB-Backup erstellen/listen/download/restore (Admin) |
| `inventory.ts` | (aggregiert) | Geräte-Inventar (Wissensdatenbank, nutzt zone context + export) |
| `intentOutcomes.ts` | `/intent-outcomes`, `/intent-outcomes/{intent_id}` | Intent-Outcome-Liste/Detail (JWT; Parität zu WS) |
| `logic.ts` | `/logic/*` | Cross-ESP Automation Rules |
| `debug.ts` | `/debug/*` | Mock ESP Simulation, Maintenance Status/Config/Trigger |
| `plugins.ts` | `/plugins/*` | Plugin-Ausführung mit execution_id, History, Config, Enable/Disable |
| `loadtest.ts` | `/debug/load-test/*` | Bulk-Create, Simulation, Metrics; Preflight/Capabilities mit Fallback |
| `diagnostics.ts` | `/diagnostics/*` | Diagnose-Checks, Report-History, Export (Phase 4D) |
| `audit.ts` | `/audit/*` | Audit Log Query + Stats |
| `logs.ts` | `/logs/*` | Log Viewer + Management |

---

## 8. Utilities

### formatters.ts (~655 Zeilen)

German-lokalisierte Formatter:

| Funktion | Beispiel Output |
|----------|-----------------|
| formatDateTime(date) | "15.12.2024, 14:30" |
| formatNumber(23.46) | "23,46" (Komma-Dezimal) |
| formatHeapSize(bytes) | "128 KB" |
| formatUptime(seconds) | "1d 1h 1m" |
| formatRssi(dBm) | "-65 dBm (Gut)" |
| formatSensorValue(value, type) | "23,5 °C" |
| formatRelativeTime(date) | "vor 5 Minuten" (SSOT — alle Komponenten importieren von hier) |

### labels.ts

Zentrale deutsche Labels:

```typescript
QUALITY_LABELS: { excellent: "Ausgezeichnet", good: "Gut", ... }
STATE_LABELS: { OPERATIONAL: "Betriebsbereit", ... }
ACTUATOR_TYPE_LABELS: { relay: "Relais", pump: "Pumpe", ... }
EMAIL_STATUS_LABELS: { sent: "Zugestellt", failed: "Fehlgeschlagen", pending: "Ausstehend", permanently_failed: "Dauerhaft fehlgeschlagen" }  // Phase C V1.2
getEmailStatusLabel(status): string  // Email-Log + Notification metadata.email_status
NOTIFICATION_SOURCE_LABELS: { sensor_threshold: "Sensor", grafana: "Infrastruktur", mqtt_handler: "Aktor", logic_engine: "Regel", manual/system/device_event/autoops: "System" }  // Alert-Basis 3
getNotificationSourceLabel(source): string  // Filter-Chips + NotificationItem Badge
```

### errorCodeTranslator.ts

Error-Codes (1xxx-5xxx) → Deutsche Beschreibungen

### subzoneHelpers.ts

```typescript
normalizeSubzoneId(val: string | null | undefined): string | null
// "Keine Subzone" = immer null. "__none__", "", leer → null. Defense-in-Depth vor API.

slugifyGerman(name: string): string
// Deutsche Umlaut-Transliteration (ae/oe/ue/ss) VOR Slugify.
// "Naehrloesung" → "naehrloesung", "Gewaechshaus Alpha" → "gewaechshaus_alpha"
```

### contractEventMapper.ts

```typescript
validateContractEvent(eventType, data): { kind: 'ok' | 'mismatch' | 'unknown_event'; reason? }
getDataSourceForEventType(eventType): 'audit_log' | 'sensor_data' | 'esp_health' | 'actuators' | undefined
inferFallbackSeverity(eventType, data): 'info' | 'warning' | 'error' | 'critical'
CONTRACT_OPERATOR_ACTION: 'Contract-Pruefung erforderlich'
extractEspId(data): string | undefined
extractCorrelationId(data): string | undefined
extractRequestId(data): string | undefined
INTENT_CONTRACT_INVENTORY: actuator/config/sequence (REST-Start + WS-Start/Terminal-Events)
// Config terminal strictness:
// config_response/config_failed ohne data.correlation_id => contract_mismatch (nicht finalisierbar)
getOperatorActionGuidance(event): OperatorActionGuidance | null  // SSOT fuer terminale Operator-Hinweise
// WS_EVENT_TYPES / validateContractEvent: u.a. intent_outcome, intent_outcome_lifecycle, notification_new/updated/unread_count, subzone_assignment (System Monitor Live-Pfad)
```

### eventTypeLabels.ts

```typescript
EVENT_TYPE_LABELS: Record<string, string>
getEventTypeLabel(eventType): string
// SSOT fuer kurze Event-Typ-Labels im Monitor (UnifiedEventList, EventsTab, SystemMonitorView).
// Keine lokalen EVENT_TYPE_LABELS-Mappings mehr in Views/Komponenten.
```

### sensorDefaults.ts

```typescript
SENSOR_TYPE_CONFIG: Record<string, {
  label: string      // "Temperatur" (gekuerzt, ohne Geraetesuffix)
  unit: string       // "°C", "%RH" (ohne Leerzeichen)
  min: number        // 0
  max: number        // 100
  decimals: number   // 1
  icon: string       // "Thermometer"
  defaultValue: number
  category: SensorCategoryId
  defaultIntervalSeconds?: number  // 30 (DS18B20/SHT31), 60 (BME280)
}>

// Helper Functions (Lookup)
getSensorUnit(type): string
getSensorLabel(type): string
getSensorDefault(type): number
isValidSensorValue(type, value): boolean
getDefaultInterval(type): number
getSensorTypeAwareSummary(type): string | null
getSensorTypeOptions(): Array<{ value: string; label: string }>
formatSensorType(sensorType: string): string
  // Formatiert raw sensor_type fuer Display: "sht31_temp" → "Sht31 Temp" (Underscores → Spaces, Title Case)
  // Add-Sensor-Dropdown: DEVICE-Liste (ein Eintrag pro Multi-Value-Device + Single-Value).
  // Keine Value-Types (sht31_temp, sht31_humidity), keine Duplikate (DS18B20/ds18b20 → nur ds18b20).
getSensorDisplayName(sensor: { sensor_type: string; name?: string | null }): string
  // Display-Name mit Multi-Value-Disambiguierung: "Temp&Hum (Temperatur)" / "Temp&Hum (Luftfeuchte)"
  // Fallback-Kette: (1) name + Sub-Type-Suffix bei Multi-Value, (2) name bei Single-Value, (3) SENSOR_TYPE_CONFIG label
  // Nutzt getValueConfigForSensorType() intern — kein Suffix bei Base-Types oder Single-Value-Sensoren

// Aggregation Functions (NEU v9.4, aktualisiert v9.52)
groupSensorsByBaseType(sensors: RawSensor[]): GroupedSensor[]
  // Gruppiert Raw-Sensoren nach Basistyp (SHT31 → temp+humidity)
  // Name-Preference: sensor.name (Custom) > Registry-Label > formatSensorType() Fallback
  // Single-Value-Sensoren: unique Key per Sensor (gpio-basiert) — keine Map-Kollision bei 2x DS18B20
aggregateZoneSensors(devices: {sensors}[]): ZoneAggregation
  // Zone-weite Aggregation pro Kategorie, extraTypeCount fuer "+X mehr" Badge
formatAggregatedValue(agg, _deviceCount): string
  // 1 Wert: "22.0°C", 2+ Werte: "18.3 – 22.5°C" (Range), gleiche Werte: "22.0°C (2)"

// Types (NEU v9.4, aktualisiert v9.52)
type RawSensor = { sensor_type: string; raw_value: number | null; name: string; unit?: string; gpio?: number; quality?: string }
type GroupedSensor = { baseType: string; label: string; values: { type, label, value, unit, icon, quality }[] }
type ZoneAggregation = { sensorTypes: { type, label, avg, min, max, count, unit }[]; extraTypeCount: number; deviceCount: number; onlineCount: number }
type AggCategory = 'temperature' | 'humidity' | 'pressure' | 'light' | 'co2' | 'moisture' | 'ph' | 'ec' | 'flow' | 'other'

// Computed/Virtual Sensor Types (PB-01)
// 'vpd': { label: 'VPD', unit: 'kPa', min: 0, max: 3, decimals: 2, category: 'air' }
// VPD = server-computed from sht31_temp + sht31_humidity, persisted as sensor_data with gpio=0

// Virtual Sensor Metadata (V19-F03) — source info for server-computed sensors
VIRTUAL_SENSOR_META: Record<string, { sources: string[]; formula: string }>
// vpd → sources: ['Temperatur (SHT31)', 'Luftfeuchtigkeit (SHT31)'], formula: 'Magnus-Tetens (Air-VPD)'
// Used by SensorCard to show Info-Icon + Tooltip for virtual sensors
```

---

## 10. Router & Navigation

### Route-Struktur

```typescript
// Public Routes
'/login'  → LoginView.vue
'/setup'  → SetupView.vue
'/not-found' → NotFoundView.vue (sichtbarer 404-Fehlerzustand)

// Protected Routes (requiresAuth: true)
'/'                                    → DashboardView.vue (?openSettings={id})
'/hardware'                            → HardwareView.vue (Zone Accordion)
'/monitor'                             → MonitorView.vue L1 (Zone-Tiles)
'/monitor/:zoneId'                     → MonitorView.vue L2 (Subzone-Accordion)
'/monitor/:zoneId/sensor/:sensorId'    → MonitorView.vue L3 (Sensor-Detail SlideOver)
'/monitor/:zoneId/dashboard/:dashboardId' → MonitorView.vue L3 (Zone-Dashboard Viewer)
'/editor'                              → CustomDashboardView.vue
'/editor/:dashboardId'                 → CustomDashboardView.vue (Deep-Link)
'/sensors'                             → SensorsView.vue (Tabs: Sensoren | Aktoren, ?sensor={espId}-gpio{gpio})
'/logic'                               → LogicView.vue
'/logic/:ruleId'                       → LogicView.vue (Deep-Link: Rule oeffnen)
'/settings'                            → SettingsView.vue
'/access-denied'                       → AccessDeniedView.vue (Guard-Fehlerpfad fuer fehlende Admin-Rechte)

// Admin Routes (requiresAdmin: true)
'/system-monitor' → SystemMonitorView.vue (Tabs: Health, Hierarchy, Database, Logs, MQTT, Events, Reports, Diagnostics — Tabs lazy via defineAsyncComponent)
'/plugins'        → PluginsView.vue (AutoOps Plugins, Phase 4C)
'/email'          → EmailPostfachView.vue (E-Mail-Postfach, Admin)
'/users'          → UserManagementView.vue
'/system-config'  → SystemConfigView.vue
'/load-test'      → LoadTestView.vue
'/maintenance'    → Redirect zu /system-monitor?tab=health (Phase 4D: Wartung in Health-Tab integriert)

// Deprecated Redirects
'/devices'           → '/'
'/database'          → '/system-monitor?tab=database'
'/logs'              → '/system-monitor?tab=logs'
'/audit'             → '/system-monitor?tab=events'
'/mqtt-log'          → '/system-monitor?tab=mqtt'
'/actuators'         → '/sensors?tab=actuators'
'/custom-dashboard'  → '/editor'
'/sensor-history'    → '/monitor'
'/monitor/dashboard/:dashboardId' → '/editor/:dashboardId' (D2: cross-zone Dashboard-Viewer entfernt)
```

### Deep-Link-Pattern

Views synchronisieren URL-Parameter mit UI-State:

```typescript
// onMounted: URL → UI-State
const ruleId = route.params.ruleId as string | undefined
if (ruleId) selectRule(ruleId)

// Benutzer-Aktion: UI-State → URL
router.replace({ name: 'logic-rule', params: { ruleId } })

// Cleanup: onUnmounted oder Deselect
router.replace({ name: 'logic' })
```

**Sensor-ID-Format fuer URLs:** `{espId}-gpio{gpio}` (z.B. `ESP_12AB34CD-gpio5`)

### Navigation Guards

```typescript
beforeEach(async (to, from, next) => {
  // 1. Initial Auth-Status Check (einmalig)
  // 2. Setup-Redirect (setup_required=true → /setup)
  // 3. Auth-Check (nicht eingeloggt → /login)
  // 4. Admin-Check (kein Admin auf Admin-Route → /access-denied?from=...)
  // 5. Login-Redirect (eingeloggt → weg von /login)
})
```

**Catch-all Verhalten:** Unbekannte Pfade werden auf `/not-found?from=<original>` umgeleitet (kein Blind-Redirect auf `/hardware`).

### Lazy Loading (lazyView + Retry)

Alle Route-Komponenten werden ueber `lazyView()` geladen (`router/index.ts`):

```typescript
// lazyView() wrappt dynamic import mit Retry (MAX_IMPORT_RETRIES=2, RETRY_DELAY_MS=200)
// Fängt "Failed to fetch dynamically imported module" (HMR/Cache) ab
component: lazyView(() => import('@/views/PluginsView.vue'))
```

`router.onError` faengt Chunk-Fehler und `ERR_INSUFFICIENT_RESOURCES` ab und loest einmalig `location.assign(to.fullPath)` aus (Reload-Cooldown 10s). SystemMonitorView-Tabs nutzen `defineAsyncComponent` fuer Tab-Komponenten (DiagnoseTab, ReportsTab, etc.), um initialen Speicher zu reduzieren.

### Neue Route hinzufuegen

1. View-Komponente in `src/views/`
2. Route in `router/index.ts` mit `component: lazyView(() => import('@/views/...'))` und `meta: { requiresAuth, requiresAdmin?, title }`
3. Sidebar-Eintrag in `components/layout/AppSidebar.vue`
4. Falls Admin: `requiresAdmin: true`

---

## 11. Farbsystem & Design

### CSS Variables (style.css)

Alle Farben ueber CSS Variables definiert.
**KEINE hardcoded Hex-Werte in Komponenten!**
Chart-Konfigurationen (z. B. Chart.js Tooltips/Paletten) duerfen als eng begrenzte Ausnahme hardcoded bleiben, wenn kein gleichwertiger Token-Kontext verfuegbar ist.

```css
/* Background (3 Stufen) */
--color-bg-primary: #0a0a0f
--color-bg-secondary: #12121a
--color-bg-tertiary: #1a1a24

/* Text (3 Stufen) */
--color-text-primary: #f0f0f5
--color-text-secondary: #b0b0c0
--color-text-muted: #707080

/* Iridescent (4 Stufen) */
--color-iridescent-1: #60a5fa  /* Blau */
--color-iridescent-2: #818cf8  /* Indigo */
--color-iridescent-3: #a78bfa  /* Lila */
--color-iridescent-4: #c084fc  /* Violet */

/* Status */
--color-success: #34d399
--color-warning: #fbbf24
--color-error: #f87171
--color-info: #60a5fa

/* Mock/Real */
--color-mock: #a78bfa  /* Lila */
--color-real: #22d3ee  /* Cyan */
```

### Glassmorphism — 3-Level Tiefenhierarchie

Drei visuelle Tiefenebenen via Tokens in `styles/tokens.css`:

| Level | Wo | Blur | Bg Alpha | Beispiel-Komponenten |
|-------|-----|------|----------|---------------------|
| **L1** | Hintergrund-Panels, Tab-Bars | 8px | 0.01 | ViewTabBar, Section-Container |
| **L2** | Content-Cards, Zone-Tiles | 12px | 0.02 | ESPCard, SensorCard, ZoneTileCard (via `.glass-panel`/`--glass-bg` Alias) |
| **L3** | Modals, SlideOvers, Dropdowns | 16px | 0.06 | BaseModal, WidgetConfigPanel SlideOver |

Tokens: `--glass-{bg,blur,border,shadow}-l{1,2,3}`. Bestehende `--glass-bg`, `--glass-border`, `--glass-shadow` sind Aliase auf L2 (kein Breaking Change). `@supports not (backdrop-filter)` Fallback mit Solid-Dark-Backgrounds vorhanden.

```css
/* Utility-Klassen (glass.css, L2 default) */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur-l2));
  border: 1px solid var(--glass-border);
}

.glass-overlay {
  background: var(--backdrop-color);
  backdrop-filter: blur(var(--backdrop-blur));
}

.iridescent-border {
  /* Gradient-Border via background-clip */
}

.water-reflection {
  /* Shimmer-Animation (4s loop) */
}
```

### Zone-Farben

Dynamisch aus 8-Farben-Palette via Hash der Zone-ID.
Gleiche Zone = immer gleiche Farbe (deterministisch).

### Touch-Accessibility (Fix-R)

**Konvention:** Keine hover-only interaktiven Elemente. Alle klickbaren Elemente muessen auch auf Touch-Geraeten erreichbar sein.

```css
/* Pattern: Progressive Disclosure — sichtbar aber dezent */
.action-element {
  opacity: 0.4;
  transition: opacity 0.2s;
}
.parent:hover .action-element,
.parent:focus-within .action-element {
  opacity: 1;
}

/* Touch-Geraete: Immer voll sichtbar */
@media (hover: none) {
  .action-element {
    opacity: 1;
  }
}
```

**Touch-Targets:** Mindestens `min-width: 44px; min-height: 44px` auf allen klickbaren Elementen (WCAG-Empfehlung). Icons bleiben optisch klein, Touch-Area wird ueber Padding vergroessert.

**Long-Press Feedback (VueDraggable):** `chosen-class` auf Drag-Items fuer visuelles Feedback nach 300ms Long-Press: `transform: scale(1.02)` + `box-shadow` mit `--color-iridescent-1`.

---

## 12. Drag & Drop System

### Dual-System

| System | Library | Was | Wohin |
|--------|---------|-----|-------|
| Zone-Drag | VueDraggable | ESP-Card (DeviceMiniCard) | Andere Zone / UnassignedDropBar |
| Unassigned-Drag | VueDraggable | Unassigned-Card | ZonePlate (Zone zuweisen) |
| Sensor-Drag | Native HTML5 | SensorSatellite | Chart-Panel |
| Component-Drag | Native HTML5 | Sidebar-Item | ESP-Card |

### VueDraggable Regeln (Wichtig!)

- **NIEMALS** `display: contents` auf Drag-Item-Wrapper — SortableJS braucht echte Box-Elemente
- **IMMER** `v-model` Array und Template-Iteration muessen identische Datenquelle nutzen (1:1 DOM-Kind zu Array-Item)
- **IMMER** `group="esp-devices"` auf allen verbundenen VueDraggable-Instanzen
- **IMMER** `force-fallback` + `fallback-on-body` fuer zuverlaessiges Cross-Container-Drag
- **IMMER** `@start`/`@end` Events an `dragStore.startEspCardDrag()`/`endEspCardDrag()` weiterleiten
- **IMMER** `chosen-class` fuer Touch Long-Press Feedback (scale + glow, siehe Section 11 Touch-Accessibility)
- **IMMER** Drag-Handles mit `min-width: 44px; min-height: 44px` fuer Touch-Targets

### DragState Store

```typescript
// State
isDragging: boolean
isDraggingSensor: boolean
isDraggingComponent: boolean
dragPayload: any

// Features
- 30-Sekunden Timeout (Safety Reset)
- Global dragend + Escape-Listener
- Konfliktvermeidung: Sensor-Drag deaktiviert waehrend ESP-Drag
- Stats-Tracking (totalDrags, successfulDrops, timeouts)
```

### Zone-Assignment Flow (Zone → Zone / Unassigned → Zone)

```
1. VueDraggable @add Event (ZonePlate)
   └─> ZonePlate.vue emits 'device-dropped'
   └─> event.item.dataset.deviceId → espStore.devices lookup

2. HardwareView: onDeviceDropped(event)
   └─> useZoneDragDrop.handleDeviceDrop()

3. API: zonesApi.assignZone(deviceId, {zone_id, zone_name})
   └─> POST /api/v1/zone/devices/{id}/assign

4. Server: DB Update + MQTT Publish

5. ESP32: Speichert in NVS, sendet ACK

6. Server: Empfaengt ACK, broadcastet WebSocket

7. Frontend: espStore.fetchAll() → UI aktualisiert
   └─> History-Push (fuer Undo, max 20 Eintraege)
   └─> Toast-Finalitaet dedupliziert: zuerst "akzeptiert/in Bearbeitung", Erfolg erst bei terminaler Bestaetigung
```

### Zone-Removal Flow (Zone → UnassignedDropBar)

```
1. VueDraggable @change Event (UnassignedDropBar)
   └─> event.added.element → ESPDevice Objekt

2. UnassignedDropBar: handleDragAdd()
   └─> device.zone_id gesetzt? → handleRemoveFromZone(device)

3. API: zonesApi.removeZone(deviceId)
   └─> DELETE /api/v1/zone/devices/{id}/zone

4. Server: DB Update + MQTT Publish → espStore.fetchAll()
   └─> Toast-Finalitaet dedupliziert: Request-Akzeptanz zuerst, terminale Erfolgsrueckmeldung nur einmal
```

---

## 13. Entwicklungs-Workflows

### Neue Sensor-Anzeige

1. Type in `types/index.ts` erweitern
2. `SensorSatellite.vue` anpassen (falls neue Darstellung)
3. WS-Event Handler in espStore registrieren
4. `labels.ts` + `formatters.ts` ergaenzen

### Neues Dashboard-Widget

1. Widget-Komponente in `components/dashboard-widgets/` erstellen
2. 4-Stellen-Registrierung in `composables/useDashboardWidgets.ts`: `componentMap`, `WIDGET_TYPE_META`, `WIDGET_DEFAULT_CONFIGS`, Props-Bridge (if-Zeilen in `mountWidgetToElement`)
3. `WidgetType` Union in `shared/stores/dashboard.store.ts` erweitern
4. `WidgetConfigPanel.vue`: `hasSensorField`/`hasTimeRange`/`widgetTypeLabels` je nach Bedarf ergaenzen; Felder in passende Zone einordnen (Zone 1 Kern, Zone 2 Darstellung, Zone 3 Erweitert)
5. Falls neue Config-Props: im flachen Config-Interface in `dashboard.store.ts` als optionale Felder ergaenzen
6. Scoped CSS mit BEM-Klassen + Design-Tokens (kein Tailwind in dashboard-widgets)

### Feature mit Settings

1. Setting-UI in `SettingsView.vue` oder `ESPSettingsSheet`
2. API-Call ueber `api/*.ts` Modul
3. Store-Action fuer Persistenz
4. Toast-Feedback bei Erfolg/Fehler

---

## 14. Mock ESP Architektur

### Dual-Storage

```
Mock ESP erstellen (POST /v1/debug/mock-esp)
        │
        ├── MockESPManager (In-Memory)
        │   └── Live-Simulation: Sensoren, Aktoren
        │
        └── ESPRepository (PostgreSQL)
            └── Persistenz: Zone, Name, Status
```

### API-Routing

| Operation | Endpoint | Ziel |
|-----------|----------|------|
| Create | `POST /debug/mock-esp` | Memory + DB |
| Read | `GET /debug/mock-esp/{id}` | Memory (Live) |
| Update | `PATCH /esp/devices/{id}` | DB (normale API!) |
| Delete | `DELETE /debug/mock-esp/{id}` | Memory + DB |
| Zone | `POST /zone/devices/{id}/assign` | DB |

---

## 15. Bekannte Luecken / Offene Punkte

| Feature | Status | Hinweis |
|---------|--------|---------|
| Dark/Light Mode Toggle | CSS vorhanden, kein UI | Dark Theme ONLY |
| PWA/Offline-First | Nicht implementiert | - |
| i18n | Hardcoded German | Kein Mehrsprachigkeit |
| Unit Tests | 5 Files, 250 Tests (Vitest + MSW) | Stores, Composables, Utils |
| E2E Tests | Nicht vorhanden | - |
| ESPOrbitalLayout | 410 Zeilen (von 3913 reduziert) | 3-Spalten Grid, DnD-Logik in useOrbitalDragDrop Composable |

---

## 16. Lifecycle & Cleanup

### keep-alive Pattern (AppShell)

AppShell nutzt `keep-alive` fuer MonitorView, LogicView, CustomDashboardView. Bei Nutzung:

1. `defineOptions({ name: 'ComponentName' })` setzen (muss mit `:include` Array matchen)
2. `onActivated()` fuer Re-Init (z.B. GridStack, Breadcrumbs)
3. `onDeactivated()` fuer Cleanup (z.B. Breadcrumb reset)
4. `onMounted`/`onUnmounted` nur einmal beim ersten Mount/letzten Destroy

```typescript
defineOptions({ name: 'CustomDashboardView' })

onActivated(() => {
  // Re-init nach Tab-Wechsel (GridStack, Breadcrumb)
  if (!grid) nextTick(() => initGrid())
})

onDeactivated(() => {
  // Cleanup bei Tab-Wechsel (Breadcrumb reset)
  dashStore.breadcrumb.dashboardName = ''
})
```

### App.vue

```typescript
onMounted(async () => {
  await authStore.checkAuthStatus()
})

onUnmounted(() => {
  espStore.cleanupWebSocket()
})
```

### Dashboard Store Persistenz-Finalitaet (F08)

```typescript
// Kanonische Metadaten-Mutationen (kein Direkt-Write auf layouts[])
dashStore.setLayoutScope(layoutId, 'zone', zoneId)
dashStore.setLayoutMetadata(layoutId, { target: { view: 'monitor', placement: 'inline' } })

// Best-effort Flush fuer ausstehende Debounce-Syncs
onBeforeRouteLeave(async () => {
  await dashStore.flushPendingSyncs('flush')
})
```

### Auth Store Logout

```typescript
async function logout() {
  websocketService.disconnect()
  clearAuth()
}
```

### ESP Store

```typescript
// Auto-Init bei Store-Erstellung
initWebSocket()

// Cleanup-Funktion fuer App-Unmount
cleanupWebSocket() {
  wsUnsubscribers.forEach(unsub => unsub())
  wsUnsubscribers.length = 0
  ws.disconnect()
}
```

---

## 17. Fehlerquellen / Troubleshooting

| Problem | Ursache | Loesung |
|---------|---------|---------|
| 401-Refresh-Loop | Korrupte Tokens | LocalStorage loeschen |
| "Not enough segments" | JWT ungueltig | Inkognito / Neu einloggen |
| Setup haengt | DB nicht leer | Server-DB neu erstellen |
| WebSocket disconnected | Token expired | Seite neu laden |
| Mock ESP nicht gefunden | Server neugestartet | Mock ESP neu erstellen |
| Zone-Zuweisung fehlgeschlagen | ESP offline | Heartbeat triggern |
| gpioConfig Import-Fehler | Namenskonflikt | Direkt importieren |
| State-Verlust bei Tab-Wechsel | View nicht in keep-alive `:include` | `defineOptions({ name: 'ViewName' })` + Name in AppShell include-Array |
| GridStack leer nach Tab-Rueckkehr | `onActivated` fehlt | Re-Init in `onActivated()`, Cleanup in `onDeactivated()` |
| FAB Sub-Panel nicht sichtbar | `position: absolute` in FAB-Container geclippt | `position: fixed` + explizites `bottom/right` + `z-index: var(--z-fab)` (V19-F04) |
| Monitor-Chart crasht mit `borderCapStyle`-Fehler | Ungueltige Annotation-Werte (NaN/String) oder leere Annotation-Konfiguration | Annotationen vor Render numerisch validieren, nur bei gueltigen Eintraegen aktivieren (`LiveLineChart`, `HistoricalChart`, `MultiSensorChart`) |

---

## 18. Regeln fuer Code-Aenderungen

### NIEMALS

- API-Endpunkte ohne Server-Abgleich aendern
- WebSocket-Events ohne Backend-Kompatibilitaet
- Types ohne vollstaendige Definition
- Stores ohne Cleanup-Logik
- Options API statt Composition API
- Direkte API-Calls in Komponenten
- Relative Imports (../.. statt @/ Alias)
- Inline Styles oder !important
- Light Mode Styles (nur Dark Theme)
- Hover-only interaktive Elemente ohne Touch-Fallback (`@media (hover: none)` oder `focus-within`)

### IMMER

- TypeScript Types verwenden
- Composables fuer wiederverwendbare Logik
- API-Calls ueber `src/api/` Module
- Pinia Stores fuer State Management
- Cleanup in `onUnmounted`
- Deutsche Labels in `utils/labels.ts`
- Event-Typ-Labels ueber `utils/eventTypeLabels.ts` aufloesen (keine lokalen Label-Maps)
- REST-Fehler in Stores/Views ueber `api/uiApiError.ts` mappen (kein lokales `response.data.detail`)
- `npm run build` zur Verifikation
- Touch-Targets mindestens 44x44px auf klickbaren Elementen (WCAG)
- `@media (hover: none)` Block fuer Touch-Geraete bei hover-abhaengigen Elementen

---

## Referenz-Dokumentation

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| **REST API** | `.claude/reference/api/REST_ENDPOINTS.md` | API-Calls implementieren |
| **WebSocket Events** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Real-time Features |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | Fehler debuggen/anzeigen |
| **Datenbank / Wissensdatenbank** | `.claude/reference/DATABASE_ARCHITECTURE.md` | Zonen, Subzonen, Wissen vs. operative Daten, Abhängigkeiten |
| **Datenfluesse** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | System-Kommunikation |
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | Backend-Kommunikation |

---

## Versions-Historie

**Version:** 10.12 | **Letzte Aktualisierung:** 2026-04-23

- 2026-04-23: HardwareView/L2-Nachzug fuer konsistente Device-Counts und GPIO-Freigabe nach Delete-Events: `esp.store` triggert nach `sensor_config_deleted`/`actuator_config_deleted` ein `fetchGpioStatus(esp_id)` (Picker sieht freigegebene Pins sofort), Count-Anzeigen wurden array-first gehaertet (`DeviceMiniCard`, `ESPCard`) damit stale `sensor_count`/`actuator_count` aus Snapshot-Daten keine geloeschten Sensoren/Aktoren mehr anzeigen.

- 2026-04-23: `ESPOrbitalLayout` responsive ab 6 Sensoren stabilisiert: Multi-Row-Sensor-Spalte nutzt flexibleres Grid (`minmax(0, 1fr)` + `clamp`), Mid-Breakpoint erzwingt 1-Spalten-Fallback zur Vermeidung seitlicher Spruenge; `SensorSatellite` Multi-Value-Cards ohne starre Min/Max-Breiten fuer bessere Anpassung an Viewport.

- 2026-04-22: AUT-124 umgesetzt — Runtime-Health-Operatorik für Badge `Eingeschränkt` geschärft: Ursache→Handlung aus `runtime_health_view` wird menschenverständlich aufgelöst (Reason-Code-Mapping + Priorisierung), Tooltip zeigt `Ursache`/`Weitere Ursache`/`Detail`, `Nächster Schritt` ist pro Hauptursache konkret; bestehende UI-Pfade (`DeviceMiniCard`, `DeviceSummaryCard`, `ESPSettingsSheet`) wiederverwendet, Offline-Semantik bleibt getrennt.

- 2026-04-22: AUT-122 nachgezogen — WS-Contract fuer `esp_health` (Offline-/Reconnect-Felder) erweitert, `esp_reconnect_phase` um Phase `converged` und optionale Felder (`timestamp`, `config_push_pending`) dokumentiert; Referenz auf `WEBSOCKET_EVENTS` aktualisiert.

- 2026-04-22: AUT-123 umgesetzt — Toast-Finalitaet bei konkurrierenden Regeln gehaertet: im Actuator-Lifecycle wird pro `correlation_id` genau ein terminaler UI-Ausgang erzeugt (quelle-unabhaengig ueber `actuator_response`, `actuator_command_failed`, `actuator_status`, `actuator_timeout`), bei bestehender accepted/pending-Transparenz.

- 2026-04-21: AUT-48 abgeschlossen — verbleibende 47 `.vue` Dateien auf Design-Token-Farben migriert; `var(--token, #hex)`-Fallbacks entfernt; UI-Hexwerte auf `var(--color-*)`/`tokens.*` umgestellt; verbleibende Hexwerte nur in Chart-Konfigurationen (`SensorHistoryView.vue`, `MultiSensorChart.vue`) belassen.

- 2026-04-14: Chart-Stabilitaet Monitor/L3 gehaertet — Annotation-Guards gegen ungueltige Threshold-/Event-Werte (`toFiniteNumber`, finite timestamp check), `borderCapStyle` defensiv gesetzt und Annotation-Plugin nur mit gueltigen Annotationen aktiviert (`LiveLineChart.vue`, `HistoricalChart.vue`, `MultiSensorChart.vue`).

- 2026-04-17: AUT-27 Status-Semantik nachgezogen — `qualityToStatus()` behandelt `stale` als eigenen Status (nicht warning/offline); SensorCard/QualityIndicator/Monitor-Statusdarstellung visuell und semantisch getrennt fuer `stale` vs. `warning`.

- 2026-04-11: Composables-Index — `useCalibrationWizard.ts` (Kalibrier-Wizard, Live-`triggerMeasurement` mit 2 s Post-HTTP-Cooldown, Parität `SensorValueCard`).

- 2026-04-06: F11 Ops-Lifecycle vereinheitlicht — neuer Shared-Contract `types/ops-lifecycle.ts` + `shared/stores/ops-lifecycle.store.ts`; `plugins.store` auf execution_id-zentriertes Lifecycle-Tracking mit Timeout-Guard und Reconciliation erweitert; `LoadTestView` mit Guardrail-Flow (Preflight, typed confirm, Lifecycle, Summary); `SystemConfigView` mit Key-Diff/Risiko und `saved` vs `applied`; `SystemMonitorView` zeigt globale High-Risk-Ops-Banner-Queue.

- 2026-04-06: F09 Logic-UI gehaertet — Rule-Lifecycle-Modell (`accepted`, `pending_*`, `terminal_*`) in `logic.store` dokumentiert, Conflict/Integration-Issue-Endlagen sichtbar gemacht, Validation-Mapping (`loc -> nodeId/field`) via `src/utils/ruleValidationMapper.ts` ergaenzt, Undo/Redo-Metadatensnapshot fuer `priority`/`cooldown_seconds` nachgefuehrt.

- 2026-04-06: F06 Hardware-Finalitaet gehaertet — Intent-Lifecycle fuer Aktor/Config um `terminal_timeout` erweitert; Doku auf deduplizierte Toast-Finalitaet (`accepted/pending` vor terminalem Erfolg) und asynchrone Abschlusslogik aktualisiert.

- 2026-04-06: F08 Persistenz-Haertung Dashboard-Editor — kanonische Store-Actions `setLayoutScope`/`setLayoutMetadata`, Safe-Flush via `flushPendingSyncs` (`beforeunload` + Route-Leave/Unmount), Merge-Haertung bei gleicher `serverId` (Dirty-/Zeitregeln + `conflict`), Name-only-Dedup entfernt zugunsten fachlicher Identity (`buildLayoutIdentityKey`), Sync-Diagnostik in `syncFlags` (`status`, `dirty`, `conflict`, `last_sync_*`).

- 2026-04-06: F07 Monitor-Degradation umgesetzt — globales Connectivity-Banner (`connected|stale|reconnecting|degraded_api|disconnected`), sichtbare Datenmodus-Badges (`Live|Hybrid|Snapshot`) in `ZoneTileCard`/`SensorCard`/`ActuatorCard`, serialisierte Reconnect-Rehydrate-Pipeline (`fetchAll` → aktive Zone-Refetch → optional L3-Refetch), L2-Aktorpfad als echter Hybrid mit expliziter Snapshot-Warnung bei Ausfall, L3-Trennung "Live jetzt" vs "Historie bis".

- 2026-04-06: F02 Design-System/Tokens abgeschlossen — `EmergencyStopButton`, `UnifiedEventList`, `MonitorView`, `SystemMonitorView` auf semantische Tokenpfade konsolidiert; `tailwind.config.js` auf Token-Spiegel umgestellt; `zoneColors.ts` Runtime-Fallback auf tokenbasierte Alpha-Ableitung vereinheitlicht.
- 2026-04-06: Routing/Guards F01 — neue Views `NotFoundView` und `AccessDeniedView`; Catch-all zeigt nun 404 statt `/hardware`-Blind-Redirect; Admin-Guard leitet auf `/access-denied?from=...` um; `checkAuthStatus()`-Fehlerpfad fuer protected routes auf Login-Recovery gehärtet.
- 2026-04-06: F03 State-Ownership — `esp` Device-Write-Adapter (`replaceDevices`, `applyDevicePatch`), `notification-inbox.applyAlertUpdate` als Inbox-Write-Boundary, WS-Mutation-Contract in `esp-websocket-subscription.ts`, Delta-Patches fuer `device_scope_changed`/`device_context_changed` mit Refresh-Fallback.
- 2026-04-06: F04 REST-API-Vertragsklarheit/Finalitaet — `api/uiApiError.ts` als Error-SSOT eingefuehrt; P1-Migration in `auth.store`, `logic.store`, `esp.store`, `UserManagementView`, `SystemConfigView`; Aktorik-Finalitaet auf `accepted | pending | terminal_*` konkretisiert; neuer Unit-Test `tests/unit/api/uiApiError.test.ts`.
- 2026-04-05: Contract April 2026 Frontend — `esp-websocket-subscription.ts`, `intentSignals.store`, `domain/esp/espHealth`, `domain/zone/ackPresentation`, `api/intentOutcomes`; Doku-Querrefs WEBSOCKET_EVENTS §0.1, REST Intent-Outcomes.

> Vollstaendiger Changelog: siehe `CHANGELOG.md` im selben Verzeichnis.
