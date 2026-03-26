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

**Version:** 9.92
**Letzte Aktualisierung:** 2026-03-26

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
| **WebSocket verstehen** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Events mit Payloads |
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
├── api/           # 19 API-Module
│   ├── index.ts           # Axios Instance + Interceptors (~89 Zeilen)
│   ├── auth.ts            # Login, Logout, Token Refresh
│   ├── esp.ts             # ESP Device Management
│   ├── sensors.ts         # Sensor CRUD + History
│   ├── actuators.ts       # Actuator Commands
│   ├── zones.ts           # Zone Assignment + ZoneEntity CRUD (T13-R3)
│   ├── subzones.ts        # Subzone Management
│   ├── device-context.ts  # Device Context setzen/lesen/loeschen (T13-R3, NEU)
│   ├── backups.ts         # DB-Backup (Admin)
│   ├── inventory.ts       # Zone Context, Export, Schema Registry (Phase K4)
│   ├── logic.ts           # Automation Rules
│   └── ...
├── config/        # Device Schemas (Phase K4)
│   └── device-schemas/  # JSON-Schemas für Sensoren/Aktoren (DS18B20, SHT31, relay, pwm, etc.)
├── components/    # Vue Komponenten (20 Unterverzeichnisse)
│   ├── calibration/   # CalibrationWizard
│   ├── charts/        # LiveLineChart, HistoricalChart (+ VPD Box-Annotations PB-01), GaugeChart, MultiSensorChart
│   ├── command/       # CommandPalette
│   ├── common/        # Modal, Toast, Skeleton, ViewTabBar (13 Dateien)
│   ├── dashboard/     # Dashboard subcomponents (11 Dateien, inkl. DashboardViewer + InlineDashboardPanel)
│   ├── dashboard-widgets/ # SensorCardWidget, GaugeWidget, LineChartWidget, StatisticsWidget, ExportCsvDialog, etc.
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
│   └── stores/          # 20 Shared Stores (actuator, alertCenter, auth, config, dashboard, database, deviceContext, diagnostics, dragState, gpio, inventory, logic, notification, notificationInbox, plugins, quickAction, sensor, ui, zone + zone erweitert T13-R3)
├── styles/        # CSS Design Tokens + Shared Styles (6 Dateien)
│   ├── tokens.css       # Design Token Definitionen
│   ├── glass.css        # Glassmorphism Klassen
│   ├── animations.css   # Animationen
│   ├── main.css         # Hauptstyles (Buttons, Layout)
│   ├── forms.css        # Shared Form + Modal Styles
│   └── tailwind.css     # Tailwind Konfiguration
├── composables/   # 31 Composables
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
│   ├── useWidgetDragFromFab.ts # FAB-to-GridStack widget drag (D3 Editor)
│   ├── useZoneGrouping.ts
│   └── useZoneKPIs.ts          # Zone KPI aggregation (extracted from MonitorView)
├── router/        # Route-Definitionen + Guards
├── services/      # WebSocket Singleton
│   └── websocket.ts   # ~625 Zeilen
├── stores/        # 1 Pinia Store (Legacy, ESP-spezifisch)
│   └── esp.ts         # ~2500 Zeilen
├── types/         # 8 Type-Dateien
│   ├── index.ts           # ~1187 Zeilen (Re-Exports, SensorDataResolution, SensorDataQuery mit resolution/before_timestamp)
│   ├── monitor.ts         # ZoneMonitorData, SubzoneGroup (Monitor L2)
│   ├── websocket-events.ts # ~748 Zeilen
│   ├── logic.ts
│   ├── gpio.ts
│   ├── device-metadata.ts  # DeviceMetadata Interface + Utility-Funktionen
│   ├── event-grouping.ts
│   └── form-schema.ts
├── utils/         # 12 Utility-Module
│   ├── formatters.ts      # ~631 Zeilen
│   ├── labels.ts
│   ├── sensorDefaults.ts
│   ├── actuatorDefaults.ts
│   ├── errorCodeTranslator.ts
│   ├── subzoneHelpers.ts  # normalizeSubzoneId (Defense-in-Depth vor API)
│   ├── trendUtils.ts      # calculateTrend (Linear Regression), TrendDirection, TREND_THRESHOLDS
│   ├── autoResolution.ts  # getAutoResolution(minutes) → SensorDataResolution, TIME_RANGE_MINUTES
│   └── ...
├── views/         # 17 View-Komponenten
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
├── L1 /monitor — Ready-Gate: BaseSkeleton bei espStore.isLoading, ErrorState bei espStore.error, Content nur nach erfolgreichem Laden
│   ├── Datenquellen: useZoneKPIs composable (espStore.devices Watch 300ms debounce + zonesApi.getAllZones() 30s Cooldown, inkl. leere Zonen) + zoneStore.activeZones/archivedZones (T13-R3 WP5)
│   ├── Zone-Filter: Native <select> mit activeZones + <optgroup label="Archiv"> fuer archivedZones; selectedZoneFilter ref; filteredZoneKPIs computed; "Gefiltert" Badge (ListFilter-Icon) bei aktivem Filter; Archived-Banner bei archivierter Zone (T13-R3 WP5)
│   ├── Zone-Tiles: ZoneTileCard.vue (Props: zone/isStale/healthConfig/rules?/totalRuleCount?/isRuleActive?, Emit: click, Slots: kpis/extra/footer); Rules-Summary Block (L1 kompakt, max 2 Regeln, Zap-Icon, aktive Regel Glow, "X weitere" Badge, .monitor-zone-tile__rules-summary); CSS-Grid align-items: stretch (gleiche Hoehe pro Zeile), Footer margin-top: auto; Reihenfolge: Zone-Tiles → Aktive Automatisierungen (D2: Cross-Zone-Dashboards + losgeloeste Inline-Panels entfernt); extra-Slot (Phase 3): InlineDashboardPanel compact mode="view" mit getZoneMiniPanelId() — zeigt max 1 zone-tile Dashboard (scope='zone-tile', nur gauge/sensor-card, max 120px Hoehe, keine Toolbar); ensureZoneTileDashboard() auto-generiert Tile-Dashboards mit Temp+Humidity Gauges beim ersten L1-Laden (Session-Guard)
│   ├── Leere Zonen: ZoneHealthStatus 'empty' (Minus-Icon, opacity 0.7, status "Leer"), NICHT "alarm"
│   ├── Zone-Tile Footer: "X/Y online" (ESP-Count), Sensor/Aktor-Counts, lastActivity, mobileGuestCount ("+ X mobil" wenn >0, 6.7)
│   ├── ActiveAutomationsSection: v-if="hasActiveAutomations" (hidden bei 0 enabled Rules, sichtbar waehrend Loading); logicStore.enabledRules, Top 5 als RuleCardCompact (ul/li, :focus-visible), Link "Alle Regeln" → /logic; Zone-Badge Fallback "—"; responsive Grid
│   ├── Empty State CTA: "Noch keine Zonen eingerichtet." + "Weise Geraeten Zonen zu unter Hardware." mit `<router-link to="/hardware">` (sekundaerer Ghost-Button-Stil, CSS `.monitor-view__empty-cta`) bei leerem zoneKPIs-Array
│   └── 40px Trennung: var(--space-10) zwischen Zone-Grid und ActiveAutomationsSection
├── L2 /monitor/:zoneId — Subzone-First Gruppierung: Zone-Header → Subzone-Accordions (Sensoren+Aktoren zusammen) → Regeln → Zone-Dashboards → Inline-Panels
│   ├── Datenquelle: zonesApi.getZoneMonitorData (primaer, AbortController bei Zone-Wechsel), Fallback useZoneGrouping + useSubzoneResolver nur bei API-Fehler; Ready-Gate (v-if=!zoneMonitorLoading) + BaseSkeleton waehrend Loading, ErrorState bei Fehler
│   ├── Datenstruktur: zoneDeviceGroup computed (ZoneDeviceSubzone[]) — unified sensors+actuators pro Subzone; filteredSubzones computed (Subzone-Filter); ersetzt getrennte zoneSensorGroup/zoneActuatorGroup
│   ├── Inline-Panels L2: inlineMonitorPanelsL2 mode="manage" = cross-zone + zone-spezifische (scope=zone, zoneId=selectedZoneId); Hover-Toolbar [Konfigurieren][Entfernen] (D4); L1 zeigt NUR zone-spezifische Mini-Widgets IN Kacheln (Phase 3, extra-Slot) — losgeloeste Inline-Panels auf L1 entfernt (D2)
│   ├── Zone-Header: Name + Sensor/Aktor-Count + Alarm-Count
│   ├── Subzone-Filter: Native <select> (nur wenn >1 Subzone); selectedSubzoneFilter ref (reset bei Zone-Wechsel); filteredSubzones computed; availableSubzones aus zoneDeviceGroup (T13-R3 WP5)
│   ├── Subzone-Accordion: v-for subzone in filteredSubzones; Header mit Count-Badge "XS · YA"; Accordion-Header NUR wenn >1 Subzone oder benannte Subzone; Body v-show mit Transition; Smart-Defaults (<=4 alle offen, >4 erste+Zone-weit offen, leere eingeklappt); localStorage-Persistenz
│   │   ├── Typ-Labels "Sensoren"/"Aktoren": NUR sichtbar wenn BEIDE Typen in der Subzone vorhanden
│   │   ├── Dashed Trennlinie (.monitor-subzone__separator): NUR zwischen Sensoren und Aktoren wenn beide vorhanden
│   │   ├── SensorCard.vue[] (mode='monitor', Stale/ESP-Offline-Badges, Trend-Pfeil via :trend Prop, Scope-Badge Multi-Zone/Mobil (T13-R3 WP4), from components/devices/; effectiveQualityStatus: bei Stale→'warning' Override, qualityLabel "Veraltet" statt "OK", border-left: 3px solid var(--color-warning); Mobile: Kontext-Hint "Aktiv in Zone X seit..." + Zone-Wechsel-Dropdown via deviceContextStore (6.7); Virtual-Sensor Info-Icon: Lucide Info 14px neben Titel bei VIRTUAL_SENSOR_META match, Glassmorphism-Tooltip mit Quell-Sensoren + Formel (V19-F03))
│   │   │   ├── #sparkline: LiveLineChart (compact, sensor-type → auto Y-Range, thresholds → farbige Schwellwert-Zonen aus SENSOR_TYPE_CONFIG)
│   │   │   └── [Expanded] 1h-Chart (vue-chartjs Line, sensorsApi.queryData Initial-Fetch)
│   │   │       ├── "Zeitreihe anzeigen" → openSensorDetail (L3)
│   │   │       └── "Konfiguration" → /sensors?sensor={espId}-gpio{gpio}
│   │   ├── ActuatorCard.vue[] (mode='monitor', read-only: kein Toggle, PWM-Badge bei pwm_value>0, linkedRules mit Status-Dot+Name+Condition, lastExecution mit relativem Zeitstempel, "+N weitere" Link bei >2 Regeln, Scope-Badge Multi-Zone/Mobil (T13-R3 WP4), ESP-Offline-Badge (opacity 0.5, WifiOff) + Stale-Markierung (opacity 0.7, warning border-left), typ-spezifische Icons via getActuatorTypeInfo(), Subzone-Fallback "Zone-weit", from components/devices/)
│   │   └── Leere Subzone: "Keine Geraete zugeordnet" (kompakt, kein Link)
│   ├── "Zone-weit" (statt "Keine Subzone"): Am Ende sortiert, kein farbiger Left-Border, dashed Top-Border; bei einziger Gruppe (nur Zone-weit): kein Accordion-Wrapper, Geraete direkt sichtbar
│   ├── Regeln fuer diese Zone (N): ZoneRulesSection.vue — logicStore.getRulesForZone(zoneId); RuleCardCompact pro Regel; Klick → /logic/:ruleId; Empty State: Link "Zum Regeln-Tab"; Bei >10 Regeln: erste 5 + Link "Weitere X Regeln — Im Regeln-Tab anzeigen"
│   ├── Shared Sensors (6.7): v-if="sharedSensorRefs.length > 0"; multi_zone Sensoren aus ANDEREN Zonen deren assigned_zones die aktuelle Zone enthaelt; SharedSensorRefCard (kompakt, read-only, dashed border, "via Heimzone" + Navigation-Link)
│   └── Zone-Dashboards: getDashboardNameSuffix(dash) fuer eindeutige Namen (createdAt oder ID)
├── L3 /monitor/:zoneId/sensor/:sensorId — SlideOver (Sensor-Detail, Deep-Link-faehig)
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
│       └── Widget-Body (SensorCardWidget, GaugeWidget, LineChartWidget, MultiSensorWidget (Compare Mode: Toggle + sensorType/Zone-Dropdowns → Auto-Fill max 4 Subzone-Sensoren mit Subzone-Labels), etc.)
├── WidgetConfigPanel.vue (SlideOver, Gear-Icon oeffnet Konfiguration; zoneId Prop fuer Zone-Scope Default PA-02c)
│   ├── Titel-Input
│   ├── Sensor Zone-Filter (selectedSensorZone: defaults to zoneId Prop bei Zone-Dashboards, "Alle Zonen" bei global; filtert useSensorOptions via filterZoneId)
│   ├── Sensor-Selektion (gruppiert nach Zone/Subzone via optgroup: "ZoneName" oder "ZoneName / SubzoneName"; useSensorOptions Composable; zentrale Dedup)
│   ├── Actuator-Selektion (je nach Widget-Typ)
│   ├── Zone-Filter-Dropdown (alarm-list, esp-health, actuator-runtime; "Alle Zonen" oder konkrete Zone aus espStore.devices)
│   ├── Y-Achse Min/Max (Charts + Gauge)
│   ├── Zeitraum-Chips (1h, 6h, 24h, 7d, 30d — Historical + Statistics)
│   ├── Farb-Palette (8 Farben)
│   ├── Threshold-Konfiguration (Alarm/Warn Low/High, auto-populate aus SENSOR_TYPE_CONFIG, sichtbar fuer line-chart + historical + gauge)
│   └── Statistics-Optionen (showStdDev Checkbox, showQuality Checkbox — nur bei statistics Widget)
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
| actuator_status | esp_id, gpio, state | MQTT→Server→WS |
| esp_health | esp_id, status, heap, rssi | Heartbeat→Server→WS |
| config_response | esp_id, status, error_code | ESP→MQTT→Server→WS |
| device_discovered | esp_id, hardware_type | Auto-Discovery |
| error_event | esp_id, error_code, troubleshooting | ESP→Server→WS |
| server_log | level, message, exception | Server intern |
| plugin_execution_started | execution_id, plugin_id, trigger_source | PluginService→WS |
| sensor_config_deleted | config_id, esp_id, gpio, sensor_type | Server→WS (Delete-Pipeline) |
| plugin_execution_completed | execution_id, plugin_id, status, duration_seconds, error_message | PluginService→WS |
| device_scope_changed (T13-R3) | config_type, config_id, device_scope, assigned_zones | Server→WS (PUT sensors/actuators) |
| device_context_changed (T13-R3) | config_type, config_id, active_zone_id, active_subzone_id, context_source, changed_by | Server→WS (PUT/DELETE /device-context) |
| subzone_assignment (T13-R3) | esp_id, subzone_id, status, timestamp, error_code, message | MQTT→Server→WS (subzone ACK) |

**WICHTIG:** Type-Aenderungen IMMER mit Server-Team abstimmen!
WebSocket-Events = Kontrakt zwischen Frontend und Backend.

### Logic Types (types/logic.ts)

- LogicRule: Conditions + Actions + Cooldown + logic_operator (AND/OR)
- SensorCondition: Vergleichsoperatoren (>, <, >=, <=, ==, !=, between), optional subzone_id (Phase 2.4)
- TimeCondition: start_hour, end_hour, days_of_week (0=Monday, 6=Sunday — ISO 8601 / Python weekday())
- HysteresisCondition: Kühlung (activate_above/deactivate_below) oder Heizung (activate_below/deactivate_above)
- CompoundCondition: Nested AND/OR conditions
- ActuatorAction: ON/OFF/PWM/TOGGLE + Duration
- NotificationAction: channel + target + message_template
- DelayAction: seconds
- ExecutionHistoryItem: rule_id, rule_name, triggered_at, trigger_reason, actions_executed, success, error_message?, execution_time_ms
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
| esp | stores/esp.ts | devices[], pendingDevices[] | fetchAll, isMock, gpioStatusMap, onlineDevices (via getESPStatus), offlineDevices |
| dashboard | stores/dashboard.store.ts | statusCounts (computed via getESPStatus), deviceCounts, filters, breadcrumb (level, zoneName, deviceName, sensorName, ruleName, dashboardName), layouts[], DASHBOARD_TEMPLATES, DashboardTarget (interface), inlineMonitorPanels (alias), inlineMonitorPanelsCrossZone (computed), inlineMonitorPanelsForZone(zoneId) (fn), sideMonitorPanels (computed), bottomMonitorPanels (computed), hardwarePanels (computed), autoGeneratedLayouts (computed), lastSyncError | toggleStatusFilter, resetFilters, createLayout, saveLayout, createLayoutFromTemplate, deleteLayout, bulkDeleteLayouts(layoutIds), exportLayout, importLayout, setLayoutTarget, generateZoneDashboard, claimAutoLayout, retrySync, addWidget(layoutId, config), removeWidget(layoutId, widgetId), updateWidgetConfig(layoutId, widgetId, newConfig); fetchLayouts (Server-Merge + Orphan-Sync + autoGenerated-Migration); cleanupOrphanedDashboards (V19-F05: auto-delete orphaned zone dashboards, watch on zoneEntities once + after deleteZoneEntity) |
| zone | stores/zone.store.ts | zoneEntities[], isLoadingZones | handleZoneAssignment (+ Toasts), handleSubzoneAssignment (+ Toasts), fetchZoneEntities, createZone, updateZone, archiveZone, reactivateZone, deleteZoneEntity (+ cleanupOrphanedDashboards V19-F05); activeZones/archivedZones (computed); handleDeviceScopeChanged, handleDeviceContextChanged (T13-R3) |
| deviceContext | shared/stores/deviceContext.store.ts | contexts (Map\<string, DeviceContextResponse\>), isLoaded | loadContextsForDevices, setContext, clearContext, handleContextChanged (WS), getActiveZoneId, getContext; fuer mobile/multi_zone Sensoren (6.7) |
| logic | shared/stores/logic.store.ts | rules[], activeExecutions, executionHistory[], historyLoaded | fetchRules, toggleRule, crossEspConnections, getRulesForZone(zoneId), getZonesForRule(rule), getRulesForActuator(espId, gpio), getLastExecutionForActuator(espId, gpio), loadExecutionHistory, pushToHistory, undo, redo, canUndo, canRedo |
| dragState | stores/dragState.ts | isDragging* flags, payloads | start/endDrag, 30s timeout |
| database | stores/database.ts | tables, currentData, queryParams | loadTables, selectTable, refreshData |
| quickAction | stores/quickAction.store.ts | isMenuOpen, activePanel (QuickActionPanel: 'menu' \| 'alerts' \| 'navigation'), currentView, contextActions[], globalActions[] | toggleMenu, closeMenu, setActivePanel, setViewContext, setContextActions, executeAction; alertSummary (computed from alert-center + inbox fallback), hasActiveAlerts, isCritical, isWarning |
| notificationInbox | stores/notification-inbox.store.ts | notifications[], unreadCount, highestSeverity, isDrawerOpen, activeFilter (InboxFilter), sourceFilter (SourceFilterValue) | loadInitial, loadMore, markAsRead, markAllAsRead, toggleDrawer, setSourceFilter; filteredNotifications (Severity + Source); WS-Listener: notification_new, notification_updated, notification_unread_count |
| alertCenter | stores/alert-center.store.ts | alertStats, activeAlerts[], statusFilter, severityFilter | fetchStats, fetchActiveAlerts, acknowledgeAlert, resolveAlert, startStatsPolling, stopStatsPolling; unresolvedCount, criticalCount, warningCount, hasCritical, mttaFormatted, mttrFormatted (computed) |
| diagnostics | shared/stores/diagnostics.store.ts | currentReport, history[], availableChecks[], isRunning | runDiagnostic, runCheck, loadHistory, loadReport, exportReport; lastRunAge (aus currentReport oder history[0]), checksByName, statusCounts (Phase 4D) |
| inventory | shared/stores/inventory.store.ts | searchQuery, zoneFilter, typeFilter, statusFilter, scopeFilter, sortKey, sortDirection, pageSize, currentPage, visibleColumns, selectedDeviceId, isDetailOpen | toggleSort, setPage, toggleColumn, openDetail, closeDetail, resetFilters; allComponents (unified sensors+actuators), filteredComponents, sortedComponents, paginatedComponents, availableZones, hasNonLocalScope (computed); ComponentItem mit scope/activeZone (T13-R3 WP5) |
| plugins | shared/stores/plugins.store.ts | plugins[], selectedPlugin, executionHistory[], pluginOptions (computed) | fetchPlugins, fetchPluginDetail, executePlugin, togglePlugin, updateConfig, fetchHistory (Phase 4C) |

### Store-Konventionen

- **Setup Stores** (Composition API, NICHT Options API)
- `ref()` fuer State, `computed()` fuer Getters
- Async Actions mit try/catch + Toast-Feedback
- WebSocket-Events in Store-Actions verarbeiten
- KEIN direkter API-Call aus Komponenten

### ESP Store WebSocket-Integration

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
| `logic.ts` | `/logic/*` | Cross-ESP Automation Rules |
| `debug.ts` | `/debug/*` | Mock ESP Simulation, Maintenance Status/Config/Trigger |
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
  // 2. Setup-Redirect (kein Admin → /setup)
  // 3. Auth-Check (nicht eingeloggt → /login)
  // 4. Admin-Check (kein Admin → /dashboard)
  // 5. Login-Redirect (eingeloggt → weg von /login)
})
```

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

### Glassmorphism-Klassen

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-overlay {
  background: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(4px);
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
   └─> Toast: Erfolg/Fehler
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
   └─> Toast: Erfolg/Fehler
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
4. `WidgetConfigPanel.vue`: `hasSensorField`/`hasTimeRange`/`widgetTypeLabels` je nach Bedarf ergaenzen
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

**Version:** 9.92 | **Letzte Aktualisierung:** 2026-03-26


> Vollstaendiger Changelog: siehe `CHANGELOG.md` im selben Verzeichnis.
