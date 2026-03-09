---
name: frontend-development
description: |
  El Frontend Vue 3 Dashboard Entwicklung fuer AutomationOne IoT-Framework.
  Verwenden bei: Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, Axios,
  WebSocket, Dashboard, ESP-Card, Sensor-Satellite, Actuator-Satellite,
  Zone-Management, Drag-Drop, System-Monitor, Database-Explorer, Log-Viewer,
  Audit-Log, MQTT-Traffic, Composables, useWebSocket, useToast, useModal,
  useQueryFilters, useGpioStatus, useZoneDragDrop, Pinia-Stores, auth-store,
  esp-store, logic-store, plugins-store, formatters, sensorDefaults, actuatorDefaults,
  Mock-ESP, PendingDevices, GPIO-Status, MainLayout, AppSidebar, Router,
  Navigation-Guards, Token-Refresh, JWT-Auth, REST-API-Client.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
argument-hint: "[Beschreibe was implementiert werden soll]"
---

# El Frontend - KI-Agenten Dokumentation

**Version:** 9.61
**Letzte Aktualisierung:** 2026-03-08
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
├── api/           # 18 API-Module
│   ├── index.ts       # Axios Instance + Interceptors (~89 Zeilen)
│   ├── auth.ts        # Login, Logout, Token Refresh
│   ├── esp.ts         # ESP Device Management
│   ├── sensors.ts     # Sensor CRUD + History
│   ├── actuators.ts   # Actuator Commands
│   ├── zones.ts       # Zone Assignment
│   ├── subzones.ts    # Subzone Management
│   ├── backups.ts     # DB-Backup (Admin)
│   ├── inventory.ts   # Zone Context, Export, Schema Registry (Phase K4)
│   ├── logic.ts       # Automation Rules
│   └── ...
├── config/        # Device Schemas (Phase K4)
│   └── device-schemas/  # JSON-Schemas für Sensoren/Aktoren (DS18B20, SHT31, relay, pwm, etc.)
├── components/    # Vue Komponenten (20 Unterverzeichnisse)
│   ├── calibration/   # CalibrationWizard
│   ├── charts/        # LiveLineChart, HistoricalChart, GaugeChart, MultiSensorChart
│   ├── command/       # CommandPalette
│   ├── common/        # Modal, Toast, Skeleton, ViewTabBar (13 Dateien)
│   ├── dashboard/     # Dashboard subcomponents (11 Dateien, inkl. DashboardViewer + InlineDashboardPanel)
│   ├── dashboard-widgets/ # SensorCardWidget, GaugeWidget, LineChartWidget, etc.
│   ├── database/      # DataTable, FilterPanel, Pagination, etc. (6 Dateien)
│   ├── devices/       # SensorCard, ActuatorCard, DeviceMetadataSection, LinkedRulesSection, AlertConfigSection, DeviceAlertConfigSection, RuntimeMaintenanceSection, SubzoneAssignmentSection (8 Dateien)
│   ├── error/         # ErrorDetailsModal, TroubleshootingPanel
│   ├── esp/           # ESPCard, ESPCardBase, ESPOrbitalLayout, SensorConfigPanel, ActuatorConfigPanel (11 Dateien)
│   ├── filters/       # UnifiedFilterBar
│   ├── forms/         # FormBuilder
│   ├── inventory/     # Wissensdatenbank (Phase K4): InventoryTable, DeviceDetailPanel, SchemaForm, ZoneContextEditor, SubzoneContextEditor (5 Dateien)
│   ├── logic/         # RuleCardCompact (Monitor L2 Regeln für diese Zone, 1 Datei)
│   ├── modals/
│   ├── monitor/       # ZoneRulesSection (L2), ActiveAutomationsSection (L1 Aktive Automatisierungen, 2 Dateien)
│   ├── rules/         # RuleCard, RuleConfigPanel, RuleFlowEditor, RuleNodePalette, RuleTemplateCard (5 Dateien)
│   ├── notifications/ # NotificationDrawer, NotificationItem, AlertStatusBar, NotificationPreferences (4 Dateien)
│   ├── quick-action/  # QuickActionBall (FAB), QuickActionMenu, QuickActionItem, QuickAlertPanel, QuickNavPanel (5 Dateien)
│   ├── safety/        # EmergencyStopButton
│   ├── system-monitor/ # 19 Dateien (inkl. HierarchyTab, HealthTab, DiagnoseTab, ReportsTab)
│   ├── widgets/       # Widget primitives
│   └── zones/         # ZoneGroup, ZoneAssignmentPanel
├── shared/        # Design System + Shared Stores (NEU)
│   ├── design/
│   │   ├── primitives/  # 13 Komponenten (10 Base + AccordionSection + QualityIndicator + RangeSlider + SlideOver)
│   │   ├── layout/      # AppShell, Sidebar, TopBar (3 Dateien)
│   │   └── patterns/    # ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer (5 Dateien)
│   └── stores/          # 18 Shared Stores (actuator, alertCenter, auth, config, dashboard, database, diagnostics, dragState, gpio, inventory, logic, notification, notificationInbox, plugins, quickAction, sensor, ui, zone)
├── styles/        # CSS Design Tokens + Shared Styles (6 Dateien)
│   ├── tokens.css       # Design Token Definitionen
│   ├── glass.css        # Glassmorphism Klassen
│   ├── animations.css   # Animationen
│   ├── main.css         # Hauptstyles (Buttons, Layout)
│   ├── forms.css        # Shared Form + Modal Styles
│   └── tailwind.css     # Tailwind Konfiguration
├── composables/   # 25 Composables
│   ├── useWebSocket.ts
│   ├── useToast.ts
│   ├── useModal.ts
│   ├── useQueryFilters.ts
│   ├── useGpioStatus.ts
│   ├── useSubzoneCRUD.ts
│   ├── useSubzoneResolver.ts
│   ├── useZoneDragDrop.ts
│   ├── useSwipeNavigation.ts
│   ├── useConfigResponse.ts
│   ├── useCalibration.ts
│   ├── useCommandPalette.ts
│   ├── useContextMenu.ts
│   ├── useDashboardWidgets.ts
│   ├── useDeviceActions.ts
│   ├── useDeviceMetadata.ts
│   ├── useESPStatus.ts
│   ├── useGrafana.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useNavigationHistory.ts
│   ├── useOrbitalDragDrop.ts
│   ├── useQuickActions.ts
│   ├── useScrollLock.ts
│   ├── useSparklineCache.ts
│   └── useZoneGrouping.ts
├── router/        # Route-Definitionen + Guards
├── services/      # WebSocket Singleton
│   └── websocket.ts   # ~625 Zeilen
├── stores/        # 1 Pinia Store (Legacy, ESP-spezifisch)
│   └── esp.ts         # ~2500 Zeilen
├── types/         # 8 Type-Dateien
│   ├── index.ts           # ~979 Zeilen (Re-Exports)
│   ├── monitor.ts         # ZoneMonitorData, SubzoneGroup (Monitor L2)
│   ├── websocket-events.ts # ~748 Zeilen
│   ├── logic.ts
│   ├── gpio.ts
│   ├── device-metadata.ts  # DeviceMetadata Interface + Utility-Funktionen
│   ├── event-grouping.ts
│   └── form-schema.ts
├── utils/         # 11 Utility-Module
│   ├── formatters.ts      # ~631 Zeilen
│   ├── labels.ts
│   ├── sensorDefaults.ts
│   ├── actuatorDefaults.ts
│   ├── errorCodeTranslator.ts
│   ├── subzoneHelpers.ts  # normalizeSubzoneId (Defense-in-Depth vor API)
│   ├── trendUtils.ts      # calculateTrend (Linear Regression), TrendDirection, TREND_THRESHOLDS
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
├── ZonePlate.vue[] (Accordion, sortiert: offline→online→leer→alpha)
│   ├── Header: Aggregierte Sensorwerte + Status-Dot + Subzone-Chips
│   ├── VueDraggable (filteredDevices)
│   │   └── DeviceMiniCard.vue[] (Compact: groupSensorsByBaseType)
│   └── EmptyState (PackageOpen, wenn Zone leer)
├── UnassignedDropBar.vue (bottom, MOCK-Badge, Sensor-Summary)
├── PendingDevicesPanel.vue (slide-over)
├── ESPSettingsSheet.vue (SlideOver, ESP-Detail: Status, Zone, Alert-Konfiguration (Gerät) via DeviceAlertConfigSection, Geräte nach Subzone read-only, Mock/Real, Delete)
├── SensorConfigPanel.vue (SlideOver, via DeviceDetailView @sensor-click — Grundeinstellungen inkl. operating_mode, timeout_seconds)
└── ActuatorConfigPanel.vue (SlideOver, via DeviceDetailView @actuator-click — subzone_id via normalizeSubzoneId)
```

### Komponentenhierarchie (SensorsView / Komponenten-Tab)

**Navigation:** Sidebar „Komponenten“ → Route `/sensors` → `SensorsView.vue` (ComponentInventoryView). Diese View ist die **Wissensdatenbank** (Inventar): flache Tabelle aller Sensoren/Aktoren/ESPs, Zone-Kontext, Device-Schemas. **SensorConfigPanel/ActuatorConfigPanel werden hier NICHT geöffnet** — nur in der HardwareView (Route `/hardware`). Backend-APIs: `/zone/context`, `/export/*`, `/schema-registry/*`, ggf. `inventory` (siehe `src/api/`). DB-Trennung: `.claude/reference/DATABASE_ARCHITECTURE.md`.

```
SensorsView.vue (?sensor={espId}-gpio{gpio} oder ?focus=sensorId → auto-open DeviceDetailPanel, NICHT SensorConfigPanel)
├── InventoryTable.vue (filterbar, sortierbar)
├── DeviceDetailPanel.vue (SlideOver: Metadaten, Schema, Zone-Kontext, LinkedRules)
│   └── Link "Vollständige Konfiguration" → /hardware?openSettings={espId} (öffnet ESPSettingsSheet; Sensor-/Aktor-Konfig via Level 2 → Card klicken)
└── EmergencyStopButton.vue
```

### Komponentenhierarchie (MonitorView / Live-Monitoring)

```
MonitorView.vue (URL-Sync: L1→L2→L3 via route params)
├── L1 /monitor — Ready-Gate: BaseSkeleton bei espStore.isLoading, ErrorState bei espStore.error, Content nur nach erfolgreichem Laden
│   ├── Datenquellen: espStore.devices (KPIs) + zonesApi.getAllZones() (inkl. leere Zonen aus ZoneContext)
│   ├── Zone-Tiles: <button> (keyboard-navigierbar, :focus-visible); Reihenfolge: Zone-Tiles → Aktive Automatisierungen → Cross-Zone-Dashboards → Inline-Panels
│   ├── Leere Zonen: ZoneHealthStatus 'empty' (Minus-Icon, opacity 0.7, status "Leer"), NICHT "alarm"
│   ├── Zone-Tile Footer: "X/Y online" (ESP-Count), Sensor/Aktor-Counts, lastActivity
│   ├── ActiveAutomationsSection: logicStore.enabledRules, Top 5 als RuleCardCompact (ul/li, :focus-visible), Link "Alle Regeln" → /logic; Zone-Badge Fallback "—"; responsive Grid
│   └── 40px Trennung: var(--space-10) zwischen Zone-Grid, ActiveAutomationsSection, Dashboard-Card, Inline-Panels
├── L2 /monitor/:zoneId — Reihenfolge: Zone-Header → Sensoren → Aktoren → Regeln für diese Zone → Zone-Dashboards → Inline-Panels
│   ├── Datenquelle: zonesApi.getZoneMonitorData (primär, AbortController bei Zone-Wechsel), Fallback useZoneGrouping + useSubzoneResolver nur bei API-Fehler; Ready-Gate (v-if=!zoneMonitorLoading) + BaseSkeleton während Loading, ErrorState bei Fehler
│   ├── Inline-Panels L2: inlineMonitorPanelsL2 = cross-zone + zone-spezifische (scope=zone, zoneId=selectedZoneId); L1 nutzt inlineMonitorPanelsCrossZone
│   ├── Zone-Header: Name + Sensor/Aktor-Count + Alarm-Count
│   ├── Sensoren (N): Sektionsueberschrift mit Count; Subzone-Zeile NUR Name (kein Count, kein CRUD); Leere Subzonen: Hinweis "Keine Sensoren zugeordnet" + Link zur Hardware-Ansicht
│   ├── Aktoren (N): Sektionsueberschrift mit Count; Subzone-Zeile NUR Name (kein Count, kein CRUD)
│   ├── Regeln für diese Zone (N): ZoneRulesSection.vue — logicStore.getRulesForZone(zoneId); RuleCardCompact pro Regel; Klick → /logic/:ruleId; Empty State: Link "Zum Regeln-Tab"; Bei >10 Regeln: erste 5 + Link "Weitere X Regeln — Im Regeln-Tab anzeigen"
│   ├── Zone-Dashboards: getDashboardNameSuffix(dash) fuer eindeutige Namen (createdAt oder ID)
│   ├── SensorCard.vue[] (mode='monitor', Stale/ESP-Offline-Badges, Trend-Pfeil via :trend Prop, from components/devices/)
│   │   ├── #sparkline: LiveLineChart (compact, sensor-type → auto Y-Range, thresholds → farbige Schwellwert-Zonen aus SENSOR_TYPE_CONFIG)
│   │   └── [Expanded] 1h-Chart (vue-chartjs Line, sensorsApi.queryData Initial-Fetch)
│   │       ├── "Zeitreihe anzeigen" → openSensorDetail (L3)
│   │       └── "Konfiguration" → /sensors?sensor={espId}-gpio{gpio}
│   └── ActuatorCard.vue[] (mode='monitor', read-only: kein Toggle, PWM-Badge bei pwm_value>0, linkedRules mit Status-Dot+Name+Condition, lastExecution mit relativem Zeitstempel, "+N weitere" Link bei >2 Regeln, from components/devices/)
└── L3 /monitor/:zoneId/sensor/:sensorId — SlideOver (Sensor-Detail, Deep-Link-faehig)
    └── Multi-Sensor-Overlay: Chip-Selektor (max 4 Sensoren), sekundaere Y-Achse bei unterschiedlichen Einheiten
```

### Komponentenhierarchie (CustomDashboardView / Dashboard Editor)

```
CustomDashboardView.vue (/editor, /editor/:dashboardId)
├── ViewTabBar.vue (Tab-Navigation)
├── Toolbar
│   ├── Layout-Selector (Dropdown: vorhandene Dashboards + Templates)
│   │   └── DASHBOARD_TEMPLATES (4 Templates: Zonen-Uebersicht, Sensor-Detail, Multi-Sensor, Leer)
│   ├── Edit/View-Toggle (Pencil/Eye Icon, isEditing ref)
│   ├── Widget-Katalog-Toggle (LayoutGrid Icon, showCatalog ref)
│   ├── Export/Import/Delete Buttons (nur im Edit-Modus sichtbar)
│   └── "Neues Dashboard" Button
├── Widget-Katalog Sidebar (showCatalog, 9 Widget-Typen mit Icon + Label + Description)
│   └── addWidget(type) → WIDGET_DEFAULT_CONFIGS + GridStack.addWidget()
├── GridStack 12-Column Grid (staticGrid im View-Modus, editierbar im Edit-Modus)
│   └── Dashboard-Widget[] (imperativ via createWidgetElement + mountWidgetComponent)
│       ├── Widget-Header (Titel + Gear-Icon, nur im Edit-Modus sichtbar)
│       └── Widget-Body (SensorCardWidget, GaugeWidget, LineChartWidget, etc.)
└── WidgetConfigPanel.vue (SlideOver, Gear-Icon oeffnet Konfiguration)
    ├── Titel-Input
    ├── Sensor/Actuator-Selektion (je nach Widget-Typ)
    ├── Zone-Filter-Dropdown (alarm-list, esp-health, actuator-runtime; "Alle Zonen" oder konkrete Zone aus espStore.devices)
    ├── Y-Achse Min/Max (Charts)
    ├── Zeitraum-Chips (Historical)
    ├── Farb-Palette (8 Farben)
    └── Threshold-Konfiguration (Alarm/Warn Low/High, auto-populate aus SENSOR_TYPE_CONFIG)
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
| MockSensor | 234-290 | Sensor mit Multi-Value Support, config_id (UUID), interface_type, i2c_address |
| MockActuator | 265-273 | Actuator mit PWM |
| QualityLevel | - | 'excellent' \| 'good' \| 'fair' \| 'poor' \| 'bad' \| 'stale' \| 'error' |
| MockSystemState | - | 12 States: BOOT, WIFI_SETUP, WIFI_CONNECTED, MQTT_CONNECTING, MQTT_CONNECTED, AWAITING_USER_CONFIG, ZONE_CONFIGURED, SENSORS_CONFIGURED, OPERATIONAL, LIBRARY_DOWNLOADING, SAFE_MODE, ERROR |

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

**WICHTIG:** Type-Aenderungen IMMER mit Server-Team abstimmen!
WebSocket-Events = Kontrakt zwischen Frontend und Backend.

### Logic Types (types/logic.ts)

- LogicRule: Conditions + Actions + Cooldown + logic_operator (AND/OR)
- SensorCondition: Vergleichsoperatoren (>, <, >=, <=, ==, !=, between), optional subzone_id (Phase 2.4)
- TimeCondition: start_hour, end_hour, days_of_week (0=Monday, 6=Sunday — ISO 8601 / Python weekday())
- HysteresisCondition: activate_above/deactivate_below
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
| dashboard | stores/dashboard.store.ts | statusCounts (computed via getESPStatus), deviceCounts, filters, breadcrumb (level, zoneName, deviceName, sensorName, ruleName, dashboardName), layouts[], DASHBOARD_TEMPLATES, DashboardTarget (interface), inlineMonitorPanels (alias), inlineMonitorPanelsCrossZone (computed), inlineMonitorPanelsForZone(zoneId) (fn), sideMonitorPanels (computed), bottomMonitorPanels (computed), hardwarePanels (computed) | toggleStatusFilter, resetFilters, createLayout, saveLayout, createLayoutFromTemplate, deleteLayout, exportLayout, importLayout, setLayoutTarget, generateZoneDashboard, claimAutoLayout |
| zone | stores/zone.store.ts | (stateless) | handleZoneAssignment (+ Toasts), handleSubzoneAssignment (+ Toasts) |
| logic | shared/stores/logic.store.ts | rules[], activeExecutions, executionHistory[], historyLoaded | fetchRules, toggleRule, crossEspConnections, getRulesForZone(zoneId), getZonesForRule(rule), getRulesForActuator(espId, gpio), getLastExecutionForActuator(espId, gpio), loadExecutionHistory, pushToHistory, undo, redo, canUndo, canRedo |
| dragState | stores/dragState.ts | isDragging* flags, payloads | start/endDrag, 30s timeout |
| database | stores/database.ts | tables, currentData, queryParams | loadTables, selectTable, refreshData |
| quickAction | stores/quickAction.store.ts | isMenuOpen, activePanel (QuickActionPanel: 'menu' \| 'alerts' \| 'navigation'), currentView, contextActions[], globalActions[] | toggleMenu, closeMenu, setActivePanel, setViewContext, setContextActions, executeAction; alertSummary (computed from alert-center + inbox fallback), hasActiveAlerts, isCritical, isWarning |
| notificationInbox | stores/notification-inbox.store.ts | notifications[], unreadCount, highestSeverity, isDrawerOpen, activeFilter (InboxFilter), sourceFilter (SourceFilterValue) | loadInitial, loadMore, markAsRead, markAllAsRead, toggleDrawer, setSourceFilter; filteredNotifications (Severity + Source); WS-Listener: notification_new, notification_updated, notification_unread_count |
| alertCenter | stores/alert-center.store.ts | alertStats, activeAlerts[], statusFilter, severityFilter | fetchStats, fetchActiveAlerts, acknowledgeAlert, resolveAlert, startStatsPolling, stopStatsPolling; unresolvedCount, criticalCount, warningCount, hasCritical, mttaFormatted, mttrFormatted (computed) |
| diagnostics | shared/stores/diagnostics.store.ts | currentReport, history[], availableChecks[], isRunning | runDiagnostic, runCheck, loadHistory, loadReport, exportReport; lastRunAge (aus currentReport oder history[0]), checksByName, statusCounts (Phase 4D) |
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

## 7. API-Layer

### Axios-Instanz (`api/index.ts`)

```typescript
// Base URL
baseURL: '/api/v1'

// Request Interceptor
- Fuegt Bearer Token aus authStore hinzu

// Response Interceptor
- 401 → refreshTokens() → Retry
- Refresh fehlgeschlagen → Logout + Redirect /login
- Infinite Loop Prevention fuer Auth-Endpoints
```

### API-Module

| Modul | Endpoints | Beschreibung |
|-------|-----------|--------------|
| `auth.ts` | `/auth/*` | Login, Logout, Setup, Refresh, Me |
| `esp.ts` | `/esp/*`, `/debug/*` | Unified Mock + Real ESP API |
| `sensors.ts` | `/sensors/*` | Sensor CRUD + History + Stats |
| `actuators.ts` | `/actuators/*` | Actuator Control |
| `zones.ts` | `/zone/*` | Zone Assignment/Removal, getAllZones (inkl. leere), getZoneMonitorData (L2) |
| `subzones.ts` | `/subzone/*` | Subzone CRUD + Safe-Mode |
| `backups.ts` | `/backups/*` | DB-Backup erstellen/listen/download/restore (Admin) |
| `inventory.ts` | (aggregiert) | Geräte-Inventar (Wissensdatenbank, nutzt zone context + export) |
| `logic.ts` | `/logic/*` | Cross-ESP Automation Rules |
| `debug.ts` | `/debug/*` | Mock ESP Simulation, Maintenance Status/Config/Trigger |
| `diagnostics.ts` | `/diagnostics/*` | Diagnose-Checks, Report-History, Export (Phase 4D) |
| `audit.ts` | `/audit/*` | Audit Log Query + Stats |
| `logs.ts` | `/logs/*` | Log Viewer + Management |

---

## 8. WebSocket-System

### Service (`services/websocket.ts`)

**URL-Pattern:** `ws[s]://host/api/v1/ws/realtime/{clientId}?token={jwt}`

| Feature | Wert |
|---------|------|
| Reconnect | Exponential Backoff 1s → 30s max + 10% Jitter |
| Rate-Limit | 10 messages/second client-side |
| Tab-Visibility | Schneller Reconnect bei Tab-Aktivierung |
| Subscription | Filter-basiert (types, esp_ids, sensor_types) |

### Filter-Typen

```typescript
interface WebSocketFilters {
  types?: MessageType[]      // 'sensor_data', 'esp_health', ...
  esp_ids?: string[]         // Filter by ESP ID
  sensor_types?: string[]    // Filter by sensor type
  topicPattern?: string      // Regex pattern
}
```

---

## 9. Utilities

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
'/monitor/dashboard/:dashboardId'      → MonitorView.vue L3 (Dashboard Viewer, VOR :zoneId wegen Greedy-Matching)
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
2. In `CustomDashboardView.vue` → `mountWidgetComponent()` einbinden
3. `widgetTypes` Array erweitern (icon, label, description, defaultW/H)
4. `WIDGET_DEFAULT_CONFIGS` Record erweitern (Smart-Defaults fuer Config)
5. CSS: Tailwind + `glass-panel` fuer Konsistenz
6. Daten aus Store beziehen (nicht direkt API)

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

### IMMER

- TypeScript Types verwenden
- Composables fuer wiederverwendbare Logik
- API-Calls ueber `src/api/` Module
- Pinia Stores fuer State Management
- Cleanup in `onUnmounted`
- Deutsche Labels in `utils/labels.ts`
- `npm run build` zur Verifikation

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

**Version:** 9.62
**Letzte Aktualisierung:** 2026-03-08

### Aenderungen in v9.62 (T10-FixB — DELETE-Pipeline config_id statt GPIO)

- SensorConfigPanel.vue: Mock-Delete-Pfad von `espStore.removeSensor(espId, gpio)` auf `sensorsApi.delete(espId, configId)` umgestellt — Mock UND Real nutzen jetzt einheitlich `DELETE /sensors/{esp_id}/{config_id}` (UUID). Behebt Mass-Delete Bug (6 I2C-Sensoren auf GPIO 0 alle geloescht statt 1)
- SensorConfigPanel.vue: `isMock` Check in confirmAndDelete() entfernt — kein separater Code-Pfad mehr noetig
- sensors.ts (API): `getByConfigId(configId)` NEU — `GET /sensors/config/{config_id}` fuer eindeutigen Sensor-Lookup per UUID
- Backend debug.py: Guard im `remove_sensor()` Endpoint — bei >1 Sensor auf GPIO ohne sensor_type gibt 409 Conflict statt Mass-Delete
- test_mock_esp_multi_value.py: 5 neue Tests `TestDeleteGuardMultipleSensorsOnGpio` — Guard-Logik fuer 0/1/2/6 Sensoren mit/ohne sensor_type

### Aenderungen in v9.61 (T10-FixD — MiniCard Overflow-Zaehlung + LiveDataPreview Humidity-Wert)

- DeviceMiniCard.vue: `sensorCount` computed (Zeile 154-157) von `sensors.length` auf `groupSensorsByBaseType()` umgestellt — Status-Zeile ("XS") und Overflow ("+X weitere") basieren jetzt auf derselben Zaehlbasis (gruppierte Values statt Roh-Array-Laenge)
- LiveDataPreview.vue: Neuer optionaler Prop `sensorType?: string` — filtert WebSocket sensor_data nach sensor_type bei Multi-Value-Sensoren (z.B. SHT31 temp vs humidity auf demselben GPIO)
- LiveDataPreview.vue: `handleMessage()` erweitert um case-insensitive `sensor_type` Vergleich — verhindert Cross-Update wenn sht31_temp nach sht31_humidity eintrifft
- SensorConfigPanel.vue: `:sensor-type="sensorType"` an LiveDataPreview durchgereicht (Zeile 798) — sensorType ist bereits als Prop verfuegbar

### Aenderungen in v9.60 (T09-FixA — Multi-Value Sensor Identifikation)

- types/index.ts: `config_id?: string` zu MockSensor Interface hinzugefuegt — UUID aus DB als primaerer Identifier fuer Multi-Value-Sensoren (statt GPIO)
- api/esp.ts: `mapSensorConfigToMockSensor()` mappt `config.id` auf `config_id` — DB-Devices bekommen UUID durchgereicht
- SensorColumn.vue: `config_id?: string` zu SensorItem Interface hinzugefuegt; `:key` von `sensor-${sensor.gpio}` auf `sensor.config_id || sensor-${sensor.gpio}-${sensor.sensor_type}` — eindeutiger Virtual-DOM-Key fuer Multi-Value-Sensoren auf GPIO 0
- SensorColumn.vue: Emit von `'sensor-click': [gpio: number]` auf `'sensor-click': [payload: { configId?: string; gpio: number; sensorType: string }]` — uebertraegt config_id + sensorType fuer eindeutige Identifikation
- SensorColumn.vue: `sortedSensors` Computed — deterministische Sortierung nach sensor_type alphabetisch, dann i2c_address
- ESPOrbitalLayout.vue: Emit-Typ und Handler auf `{ configId?, gpio, sensorType }` Payload umgestellt — Event-Chain Step 2
- DeviceDetailView.vue: Emit-Typ erweitert um `sensorType` und `configId`; Handler spreaded Payload mit espId — Event-Chain Step 3
- HardwareView.vue: `configSensorData` um `configId?: string` erweitert; `handleSensorClickFromDetail` nutzt `gpio + sensorType` Lookup (Primary) mit GPIO-only Fallback; Template `:config-id` an SensorConfigPanel durchgereicht
- SensorConfigPanel.vue: Neuer optionaler Prop `configId?: string`; Delete-Logik: Mock UND Real → unified `sensorsApi.delete(espId, configId)` (T10-Fix-B: Mock-Pfad von `espStore.removeSensor` GPIO-basiert auf config_id umgestellt), fehlende configId → Error-Toast (kein 500er)
- sensors.ts (API): `delete()` Signatur von `(espId, gpio)` auf `(espId, configId: string)` — nutzt `DELETE /sensors/{esp_id}/{config_id}` (UUID statt GPIO, behebt scalar_one_or_none Crash bei Multi-Value)
- sensor.store.ts: `handleSensorData` priorisiert exakten Match per `gpio + sensor_type` (Post-Fix1 Pattern) vor Legacy-Multi-Value-Merge — behebt Cross-Update bei SHT31 temp/humidity
- useWebSocket.ts: `on()` registriert Handler nur via `websocketService.on()` wenn KEINE Subscription aktiv — behebt Double-Dispatch (Handler 2x pro Message bei gleichzeitiger Subscription + Listener)
- Section 4 Type-System: MockSensor Beschreibung um config_id erweitert

### Aenderungen in v9.59 (T08-Fix2A — Sensor Display-Namen MiniCard + Orbital I2C-Label)

- sensorDefaults.ts: `formatSensorType(sensorType)` exportiert — Underscores → Spaces, Title Case ("sht31_temp" → "Sht31 Temp"), Fallback fuer unbekannte Sensortypen
- sensorDefaults.ts: `groupSensorsByBaseType()` bevorzugt jetzt `sensor.name` (Custom-Name) in allen Code-Pfaden (Multi-Value valueConfig, Multi-Value baseType, Unknown valueType, Single-Value) — Fallback: Registry-Label → formatSensorType()
- DeviceMiniCard.vue: `:title="sensor.label"` Tooltip auf Sensor-Name-Span (Volltext bei Truncation)
- SensorColumn.vue: `interface_type` zu SensorItem Interface + Prop-Durchreichung an SensorSatellite
- SensorSatellite.vue: Neuer Prop `interfaceType?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | null`
- SensorSatellite.vue: `interfaceLabel` Computed erweitert um `interfaceType` Prop-Check + `I2C_SENSOR_PREFIXES` Fallback-Array (sht31, bmp280, bme280, bh1750)
- SensorSatellite.vue: `displayLabel` bevorzugt `props.name` (Custom-Name) vor Device/Sensor-Config-Label
- SensorSatellite.vue: Doppelte `interfaceLabel` Deklaration (Zeile 101 alt + 163 neu) bereinigt
- Server schemas/debug.py: `i2c_address` + `interface_type` Felder zu `MockSensorResponse` hinzugefuegt
- Server api/v1/debug.py: Response-Builder mappt `i2c_address` + `interface_type` aus simulation_config
- Server esp_repo.py: `rebuild_simulation_config()` persistiert `interface_type` aus sensor_configs
- Section 9: sensorDefaults.ts um `formatSensorType()` Helper + groupSensorsByBaseType Name-Preference erweitert

### Aenderungen in v9.58 (T08-Fix2B — AddSensorModal Reaktiver Info-Text)

- AddSensorModal.vue: Statisches `typeSummary` (via `getSensorTypeAwareSummary`) durch reaktives `sensorTypeInfo` computed ersetzt — reflektiert aktuelle I2C-Adresse, Messintervall und Multi-Value-Eintragsanzahl
- AddSensorModal.vue: SHT31 Info-Text zeigt aktuelle I2C-Adresse (`selectedI2CAddress` Hex-Lookup via `i2cAddressOptions`) + "(erstellt 2 Sensor-Eintraege)" + Intervall
- AddSensorModal.vue: BMP280/BME280 Info-Text zeigt aktuelle I2C-Adresse + Multi-Value-Count (2 bzw. 3 Eintraege)
- AddSensorModal.vue: DS18B20 Info-Text zeigt `oneWireScanPin` GPIO, kein Multi-Value-Hinweis
- AddSensorModal.vue: Fallback fuer andere Sensortypen via `getSensorLabel()`
- AddSensorModal.vue: `role="status"` + `aria-live="polite"` auf Info-Banner (Screen-Reader Reaktivitaet bei I2C-Adress-Wechsel)
- AddSensorModal.vue: Import `getSensorTypeAwareSummary` entfernt, `getSensorLabel` + `getDefaultInterval` hinzugefuegt

### Aenderungen in v9.57 (Aufgabe 2 — Orbital I2C-Adresse statt GPIO 0)

- types/index.ts: `MockSensor` um `interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | null` und `i2c_address?: number | null` erweitert — fuer Orbital-Anzeige "I2C 0x44" statt "GPIO 0"
- api/esp.ts: `mapSensorConfigToMockSensor()` mappt jetzt `i2c_address` aus `SensorConfigResponse` — DB-Devices bekommen I2C-Adresse durchgereicht
- SensorColumn.vue: `SensorItem` Interface um `i2c_address` erweitert, Prop `:i2c-address` an SensorSatellite durchgereicht
- SensorSatellite.vue: Neuer optionaler Prop `i2cAddress?: number | null` (Default null)
- SensorSatellite.vue: `interfaceLabel` Computed — sht31/bmp/bme → "I2C 0x{HEX}" (padStart 2), sonstige → "GPIO {n}" (gpio=0 wird unterdrueckt), Hex immer uppercase mit 0x-Praefix
- SensorSatellite.vue: GPIO-Badge zeigt `interfaceLabel` statt nur GPIO-Nummer, immer sichtbar (nicht nur bei Multi-Value)
- SensorSatellite.vue: Title-Tooltip nutzt `interfaceLabel` statt hartcodiertem "GPIO {n}"
- Section 4 Type-System: MockSensor Zeilenbereich und Beschreibung aktualisiert

### Aenderungen in v9.56 (T08-Fix-D/E — Sensor Delete Pipeline + Alert Cleanup)

- types/index.ts: `'sensor_config_deleted'` zu MessageType Union hinzugefuegt — neues WS-Event fuer Sensor-Config-Loeschung
- esp.ts (Store): `handleSensorConfigDeleted` Handler — filtert geloeschten Sensor aus `device.sensors` per gpio+sensor_type Match, Toast-Info bei Erfolg
- esp.ts (Store): WS-Listener `ws.on('sensor_config_deleted', handleSensorConfigDeleted)` in initWebSocket registriert
- Section 4 WebSocket Events: `sensor_config_deleted` Event dokumentiert (config_id, esp_id, gpio, sensor_type; Server→WS Delete-Pipeline)

### Aenderungen in v9.55 (T02-Fix5 — Runtime-Errors, API-Serialisierung, Alert-Metriken, Monitor-Readonly)

- MonitorView.vue: `smartDefaultsApplied` ref-Deklaration vor den Watcher verschoben — behebt ReferenceError beim Laden des Monitor-Tabs (N2)
- MonitorView.vue: Subzone-Inline-Edit komplett entfernt (Rename-Input, Check/X-Buttons, CRUD-Actions Pencil/Trash2, "Subzone hinzufuegen"-Button) — Monitor ist jetzt vollstaendig read-only (B18)
- MonitorView.vue: `useSubzoneCRUD` Import + Instanziierung entfernt, `useUiStore` Import entfernt (nicht mehr benoetigt nach CRUD-Entfernung), `Trash2`/`Check`/`X` Icons aus Import entfernt
- MonitorView.vue: Docstring aktualisiert — "Subzone CRUD" → "read-only, no configuration"
- esp.ts (Store): `isLoading = true` aus `deleteDevice()` entfernt — verhindert weissen Bildschirm-Blitz beim Loeschen des letzten Devices (B17); Delete ist kein fetch-all und braucht keinen Loading-State
- AlertStatusBar.vue: `hasSensors` Computed hinzugefuegt — Bar nur sichtbar wenn Devices UND Sensoren existieren UND mindestens ein Alert-Count > 0 (B15)
- NotificationBadge.vue: `espStore.devices.length > 0` Check in `hasBadge` — Badge unsichtbar bei leerem System (B16)
- Backend logs.py: Router-Prefix `/logs` → `/v1/logs` korrigiert — Frontend-Log-Endpoint erreichbar unter `/api/v1/logs/frontend` statt `/api/logs/frontend` (N3)
- Backend esp.py (API): `deleted_at` und `deleted_by` in ESPDeviceResponse-Konstruktor gemappt — Felder werden bei `include_deleted=true` korrekt serialisiert (N4)

### Aenderungen in v9.54 (T02-Fix6 — Layout-Ueberarbeitung: Orbital-Namen, L1 Zone-Tile, Konsistenz-Polish)

- SensorSatellite.vue: `text-transform: uppercase` entfernt — Sensor-Namen in Normal-Case (wie vom Nutzer eingegeben); `color` von `--color-text-muted` auf `--color-text-secondary` (lesbarer); `letter-spacing` von 0.06em auf 0.02em reduziert
- SensorSatellite.vue: Label bekommt 2-Zeilen-Clamp (`-webkit-line-clamp: 2`, `line-height: 1.2`, `max-height: 2.4em`) statt `white-space: nowrap` — lange Sensor-Namen umbrechen statt abschneiden
- SensorSatellite.vue: `:title="displayLabel"` auf Label-Element — Tooltip mit vollem Namen bei Truncation (Bug N1 aus T02-Verify)
- ActuatorSatellite.vue: `max-width` von 130px auf 180px — konsistent mit Sensor-Satellite Spaltenbreite
- ActuatorSatellite.vue: Label bekommt 2-Zeilen-Clamp + `color: --color-text-secondary` (konsistent mit SensorSatellite)
- ActuatorSatellite.vue: `:title` auf Label-Element (Tooltip, konsistent mit SensorSatellite)
- ESPOrbitalLayout.css: Sensor-/Actuator-Spaltenbreite von 120px auf 180px (Desktop), Multi-Row Grid von `repeat(2, 120px)` auf `repeat(2, 180px)`; Tablet-Breakpoint `max-width` von 120px auf 160px
- ZonePlate.vue: `.zone-plate__devices` von `display: flex; flex-wrap: wrap` auf `display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr))` — bei 1 Device fuellt Card volle Breite, bei 2+ responsives Grid
- ZonePlate.vue: `.zone-plate__agg-values` bekommt `margin-left: var(--space-2)` — mehr Abstand zwischen Zone-Name und Aggregation
- DeviceMiniCard.vue: `max-width` von 240px auf 100% — Grid steuert Breite statt feste Maximalbreite
- DeviceMiniCard.vue: `.device-mini-card__sensor-unit` `color` von `--color-text-muted` auf `--color-text-secondary` — Einheit (°C, %RH) lesbar statt fast unsichtbar
- sensorDefaults.ts: `formatAggregatedValue()` fuegt Thin Space (`\u2009`) vor Einheit ein — "22.5 °C" statt "22.5°C", "18.3 – 22.5 °C" statt "18.3 – 22.5°C"

### Aenderungen in v9.53 (T02-Fix4 — Layout-Polish: Responsive TopBar, SensorCard-Namen, Mock-Dialog, Alert-Metriken)

- CreateMockEspModal.vue: Heartbeat-Intervall Default von 60 auf 15 Sekunden korrigiert — konsistent mit Backend-Default fuer Mock-ESPs; betrifft Initial-State (ref) und resetForm()
- TopBar.vue: Responsive Overflow-Handling — `.header__breadcrumb` bekommt `overflow: hidden`; `.header__crumb--current` bekommt `max-width: 200px` + `text-overflow: ellipsis`
- TopBar.vue: Neuer Breakpoint `@media (max-width: 1399px)` — `.header__type-segment` ausgeblendet (`display: none`), Crumb max-width auf 140px reduziert; bestehender `1023px`-Breakpoint um `max-width: 100px` auf Crumb erweitert
- SensorCard.vue: Monitor-Mode Name bekommt `:title="displayName"` fuer Tooltip bei abgeschnittenem Text (Namen werden uppercase in DB gespeichert, kein text-transform im CSS)
- MonitorView.vue: `.monitor-card-grid` von `minmax(200px, 1fr)` auf `minmax(220px, 1fr)` — breitere Karten fuer laengere Sensor-Namen
- ComponentSidebar.vue: Scroll-Indikator via `::after` Pseudo-Element — `linear-gradient(to bottom, transparent, var(--color-bg-secondary))`, 24px Hoehe, `pointer-events: none`, nur bei nicht-kollabierten Sidebar (`:not(.component-sidebar--collapsed)`)
- AlertStatusBar.vue: `useEspStore` importiert, `hasDevices` Computed (`espStore.devices.length > 0`), `showBar` Computed — Bar nur sichtbar wenn alertStats vorhanden UND Devices existieren UND mindestens ein Count > 0 (active, acknowledged oder resolved_today)
- AlertStatusBar.vue: Template `v-if` erweitert auf `showBar && alertStore.alertStats` — doppelte Guard fuer TypeScript Type-Narrowing + inhaltliche Pruefung

### Aenderungen in v9.52 (T02-Fix3 — L1 Zone-Tile Aggregation + DeviceMiniCard Multi-Sensor + Unassigned-Section)

- sensorDefaults.ts: `formatAggregatedValue()` zeigt jetzt Range statt Durchschnitt — 1 Wert: "22.0°C", 2+ Werte: "18.3 – 22.5°C" (min–max), gleiche Werte: "22.0°C (2)"; Parameter `deviceCount` unbenutzt (jetzt `_deviceCount`)
- sensorDefaults.ts: `ZoneAggregation` um `extraTypeCount: number` erweitert — Anzahl abgeschnittener Kategorien (>3) fuer "+X mehr" Badge
- sensorDefaults.ts: `aggregateZoneSensors()` berechnet `extraTypeCount` vor `splice(3)`, gibt es im Return zurueck
- sensorDefaults.ts: `groupSensorsByBaseType()` — Single-Value-Sensoren nutzen unique Map-Key `${sType}_${gpio}` statt `sType` — behebt Ueberschreibung bei 2x DS18B20 auf einem Device; Label nutzt `sensor.name` fuer spezifische Namen (z.B. "Substrat", "Wasser")
- ZonePlate.vue: Aggregierte Werte mit Pipe-Separator (`' | '`) statt Double-Space; `extraTypeCount` Computed fuer "+X" Badge (`zone-plate__agg-extra`, font-size 9px, color text-muted)
- HardwareView.vue: Unassigned-Section mit `v-if="unassignedDevices.length > 0 || dragStore.isDraggingEspCard"` — ausgeblendet wenn leer, sichtbar als Drop-Target waehrend Drag
- Section 9: sensorDefaults.ts Types aktualisiert (RawSensor, GroupedSensor, ZoneAggregation, AggCategory jetzt 10 Kategorien)

### Aenderungen in v9.51 (Phase 3.1.4 + 3.1.5 + 3.2.4 + 3.2.5 — ActuatorCard Monitor-Kontext + SensorCard Trend-Pfeil)

- ActuatorCard.vue: Neue optionale Props `linkedRules?: LogicRule[]`, `lastExecution?: ExecutionHistoryItem | null` — nur im monitor-mode ausgewertet
- ActuatorCard.vue: PWM-Badge (`actuator-card__pwm-badge`) neben Ein/Aus-Badge wenn `pwm_value > 0` — zeigt "75%" als kompaktes Badge statt separater Zeile
- ActuatorCard.vue: Rules-Section (`actuator-card__rules`) — max 2 Regeln mit Status-Dot (8px, gruen=enabled via `--color-status-success`, rot=error via `--color-status-error`, grau=deaktiviert via `--color-text-muted`) + Rule-Name + Condition-Kurztext via `formatConditionShort(rule)`
- ActuatorCard.vue: "+N weitere" router-link zu `/logic` bei >2 verknuepften Regeln (`actuator-card__rules-more`, Farbe `--color-iridescent-2`)
- ActuatorCard.vue: Letzte Execution (`actuator-card__last-execution`) — `formatRelativeTime(triggered_at)` + `trigger_reason` in Klammern; importiert aus `@/utils/formatters`
- ActuatorCard.vue: config-mode komplett unveraendert (keine Regression)
- SensorCard.vue: Neuer optionaler Prop `trend?: TrendDirection` (importiert aus `@/utils/trendUtils`) — nur im monitor-mode gerendert
- SensorCard.vue: Trend-Pfeil neben Wert+Unit — `TrendingUp`/`Minus`/`TrendingDown` Icons (lucide-vue-next, :size="14"), `v-if="trend"`, `title`-Attribut ("Steigend"/"Stabil"/"Fallend")
- SensorCard.vue: CSS `.sensor-card__trend` — `color: var(--color-text-muted)`, inline-flex, IMMER neutral gefaerbt (kein rot/gruen)
- SensorCard.vue: `TREND_ICONS`/`TREND_TITLES` Record-Maps fuer Icon-Aufloesung und Barrierefreiheit
- MonitorView.vue: `useLogicStore` importiert, `logicStore` instanziiert
- MonitorView.vue onMounted: `logicStore.fetchRules()` + `logicStore.loadExecutionHistory()` aufgerufen (ActuatorCard-Kontext)
- MonitorView.vue L2: `getSensorTrend(espId, gpio, sensorType)` Hilfsfunktion — holt Punkte aus sparklineCache, gibt `undefined` bei <5 Punkten (kein Trend statt 'stable'), berechnet Trend via `calculateTrend()` aus trendUtils
- MonitorView.vue L2 Template: SensorCard bekommt `:trend="getSensorTrend(sensor.esp_id, sensor.gpio, sensor.sensor_type)"`
- MonitorView.vue L2 Template: ActuatorCard bekommt `:linked-rules="logicStore.getRulesForActuator(actuator.esp_id, actuator.gpio)"` und `:last-execution="logicStore.getLastExecutionForActuator(actuator.esp_id, actuator.gpio)"`
- Section 3: Komponentenhierarchie MonitorView L2 — SensorCard um Trend-Pfeil, ActuatorCard um linkedRules, lastExecution, PWM-Badge, "+N weitere" erweitert

### Aenderungen in v9.50 (Phase 3 — ActuatorCard Logik-Grundlage + Sparkline Aussagekraeftig)

- logic.store.ts: `getRulesForActuator(espId, gpio): LogicRule[]` — filtert rules nach Actions mit type 'actuator'/'actuator_command' + esp_id + gpio Match; Sortierung priority (niedrig = hoeher); im Store-Return exportiert
- logic.store.ts: `getLastExecutionForActuator(espId, gpio): ExecutionHistoryItem | null` — nutzt getRulesForActuator intern, sammelt Rule-IDs, filtert executionHistory, sortiert triggered_at DESC, gibt erstes Element oder null
- types/logic.ts: `formatConditionShort(rule): string` — lesbarer Kurztext aller Conditions; sensor/sensor_threshold: Label + Operator + Wert + Einheit ("Temperatur > 28°C"); hysteresis: "Ein >28, Aus <25"; time: "06:00–20:00"; compound: "[Komplex]"; Verbindung logic_operator UND/ODER; importiert getSensorLabel/getSensorUnit aus sensorDefaults
- types/index.ts: Re-Export `formatConditionShort` aus logic.ts
- Section 4 Logic Types: formatConditionShort dokumentiert
- Section 5 Store-Architektur: logic Store um getRulesForActuator, getLastExecutionForActuator erweitert
- trendUtils.ts: **NEU** — `calculateTrend()` (Lineare Regression/Least Squares), `TrendDirection` Type, `TrendResult` Interface, `TREND_THRESHOLDS` (sensor-typ-spezifisch: 13 Eintraege), `DEFAULT_TREND_THRESHOLD` (0.1); gibt `'stable'` bei <5 Datenpunkten zurueck
- MonitorView.vue L2: `ThresholdConfig` Import aus LiveLineChart; `getDefaultThresholds(sensorType)` Hilfsfunktion — alarmLow/warnLow/warnHigh/alarmHigh aus SENSOR_TYPE_CONFIG (10%/20% Range-Raender)
- MonitorView.vue L2: LiveLineChart im #sparkline Slot bekommt `:sensor-type`, `:thresholds`, `:show-thresholds` — Y-Achse mit sinnvollem Bereich, farbige Schwellwert-Zonen sichtbar
- Section 2: utils/ 10 → 11 Module (trendUtils.ts)
- Section 3: Komponentenhierarchie MonitorView L2 — SensorCard Sparkline um sensor-type + Threshold-Zonen erweitert

### Aenderungen in v9.49 (Dashboard Sync-Fehler im UI anzeigen)

- dashboard.store.ts: `syncLayoutToServer()` setzt jetzt `lastSyncError` bei Fehlern (vorher nur `logger.warn()` fire-and-forget) und setzt `lastSyncError = null` bei erfolgreichem Sync (create oder update)
- CustomDashboardView.vue: Neuer Watcher auf `dashStore.lastSyncError` — zeigt `toast.error()` mit Fehlermeldung an wenn Sync fehlschlaegt; nutzt bestehenden useToast-Service (Dedup-Window 2s schuetzt vor Spam)

### Aenderungen in v9.48 (Zone-Frontend Phase 0.3 — Leere Zonen + Subzonen)

- zones.ts: `getAllZones()` Methode — GET /zone/zones, liefert alle Zonen inkl. leere (Device-Zuweisungen + ZoneContext merged)
- types/index.ts: `ZoneListEntry` (zone_id, zone_name, device_count, sensor_count, actuator_count) + `ZoneListResponse` (zones[], total)
- MonitorView.vue L1: `allZones` ref via `zonesApi.getAllZones()` in onMounted; `zoneKPIs` Computed merged Device-KPIs + leere Zonen aus Zone-API
- MonitorView.vue L1: `ZoneHealthStatus` erweitert um `'empty'` — leere Zonen (0 Devices) zeigen Status "Leer" (Minus-Icon, opacity 0.7), NICHT "alarm"
- MonitorView.vue L1: `HEALTH_STATUS_CONFIG.empty` — Label "Leer", CSS `.zone-status--empty` (var(--color-text-muted)), `.monitor-zone-tile--empty`
- MonitorView.vue L2: Leere Subzonen mit Hinweis "Keine Sensoren zugeordnet — Sensoren in der Hardware-Ansicht hinzufuegen" + router-link zu /hardware
- Backend zone.py: `GET /v1/zone/zones` Endpoint — merged Zonen aus Device-Zuweisungen + ZoneContext-Tabelle
- Backend schemas/zone.py: `ZoneListEntry` + `ZoneListResponse` Pydantic Schemas
- Backend monitor_data_service.py: `configured_subzone_keys` im ersten Pass gesammelt, leere Subzonen nicht mehr rausgefiltert

### Aenderungen in v9.47 (Sparkline Initial History Load)

- useSparklineCache.ts: `loadInitialData(sensors: SensorIdentifier[])` — laedt letzte 30 Datenpunkte pro Sensor via sensorsApi.queryData beim ersten Render; Throttling max 5 parallele Requests (Promise.allSettled in Batches); `loadedKeys` Set verhindert doppeltes Laden
- useSparklineCache.ts: `mergeAndDeduplicate()` — merged historische API-Daten mit zwischenzeitlich eingetroffenen WS-Events; chronologische Sortierung, 5s-Dedup, capped bei maxPoints
- useSparklineCache.ts: Neues Interface `SensorIdentifier` (esp_id, gpio, sensor_type?) exportiert; neuer Return-Wert `initialLoadInFlight` ref
- MonitorView.vue L2: Watcher auf `zoneSensorGroup` — extrahiert Sensor-Identifier und ruft `loadSparklineHistory()` auf wenn Zone-Daten verfuegbar werden; feuert automatisch bei Zone-Wechsel
- Kein Server-Change: Nutzt bestehende GET /sensors/data API mit esp_id + gpio + sensor_type + limit Filter

### Aenderungen in v9.46 (Monitor L1 Ready-Gate + L2 AbortController)

- MonitorView.vue L1: Ready-Gate-Pattern — BaseSkeleton bei espStore.isLoading, ErrorState mit Retry (espStore.fetchAll) bei espStore.error, Empty State nur bei wirklich leeren Daten nach erfolgreichem Laden
- MonitorView.vue L1: Zone-Tiles von `<div @click>` zu `<button>` — nativ keyboard-navigierbar (Tab + Enter), :focus-visible Outline (2px var(--color-iridescent-2)), Button-Reset-CSS (font, color, text-align)
- MonitorView.vue L2: AbortController bei fetchZoneMonitorData — bricht vorherigen Request ab bei schnellem Zone-Wechsel, AbortError im catch ignoriert, Loading nur zurueckgesetzt wenn Controller noch aktuell
- zones.ts: getZoneMonitorData akzeptiert optionalen AbortSignal Parameter
- onUnmounted: zoneMonitorAbort.abort() Cleanup
- Section 3: Komponentenhierarchie MonitorView L1 um Ready-Gate und button-Kacheln erweitert, L2 um AbortController ergaenzt

### Aenderungen in v9.45 (ActuatorCard Toggle Mode-Guard)

- ActuatorCard.vue: Toggle-Button mit `v-if="mode !== 'monitor'"` — im monitor-mode ausgeblendet (Sicherheit: kein sendActuatorCommand aus read-only Monitor-Kontext)
- ActuatorCard.vue: PWM-Wert-Anzeige im monitor-mode bei `actuator_type === 'pwm'` — "PWM: X%" als read-only Info
- MonitorView.vue: Einziger Aufrufpfad `@toggle="toggleActuator"` durch Button-Guard gekappt — kein Code-Entfernung noetig
- ActuatorCardWidget.vue (Dashboard): Toggle weiterhin funktional — Dashboard-Editor ist bewusster Steuerungs-Kontext (kein Fix)
- Section 3: Komponentenhierarchie MonitorView L2 — ActuatorCard um read-only Hinweis erweitert

### Aenderungen in v9.44 (Monitor L1 — Computerspieloptik-Optimierung)

- RuleCardCompact.vue: Zone-Badge Fallback "—" wenn zoneNames leer/undefined (5-Sekunden-Regel "Wo?"); Badge immer wenn zoneNames-Prop uebergeben (v-if="zoneNames !== undefined"); Zone-Badge Styling an SensorCard angeglichen (padding 2px 8px, border 1px solid var(--glass-border), max-width 140px); statusAriaLabel + aria-live="polite" fuer Screenreader; :focus-visible Outline (2px var(--color-iridescent-2)); Status-Dot transition (background-color, box-shadow)
- ZoneRulesSection.vue: Empty State um Link "Zum Regeln-Tab" ergaenzt (wie ActiveAutomationsSection); :focus-visible auf __more-link und __empty-link
- ActiveAutomationsSection.vue: Regel-Liste semantisch als ul/li (role="list", list-style: none); :focus-visible auf __link und __empty-link; Grid responsive minmax(min(200px, 100%), 1fr) fuer schmale Viewports (z. B. 320px)

### Aenderungen in v9.43 (Monitor L1 — Aktive Automatisierungen)

- ActiveAutomationsSection.vue: Neue Komponente in components/monitor/ — L1-Sektion "Aktive Automatisierungen (N)"; logicStore.enabledRules, Top 5 Regeln (Fehler zuerst, dann priority/name), RuleCardCompact mit zoneNames, Link "Alle Regeln" → /logic; Empty State bei 0 Regeln
- RuleCardCompact.vue: Optionaler Prop `zoneNames?: string[]` — Zone-Badge fuer L1 (5-Sekunden-Regel: "Wo?"); L2 uebergibt nicht (Zone implizit); Badge-Format: "Zone1, Zone2" oder "Zone1 +2" bei >2 Zonen
- logic.store.ts: `getZonesForRule(rule): string[]` — ermittelt Zone-Namen ueber referenzierte ESPs (extractEspIdsFromRule + espStore.devices.zone_name/zone_id)
- MonitorView.vue L1: ActiveAutomationsSection zwischen Zone-Tiles und Dashboard-Card eingefuegt; Reihenfolge: Zonen-Kacheln → Aktive Automatisierungen → Cross-Zone-Dashboards → Inline-Panels
- monitor-view__empty: margin-bottom var(--space-10) fuer konsistenten Abstand vor ActiveAutomationsSection
- Section 2: monitor/ 1 → 2 Dateien (ActiveAutomationsSection)
- Section 3: Komponentenhierarchie MonitorView L1 um ActiveAutomationsSection erweitert

### Aenderungen in v9.42 (Monitor L2 — Regeln für diese Zone Verbesserungen)

- ZoneRulesSection.vue: Bei >10 Regeln nur erste 5 anzeigen + Zeile "Weitere X Regeln — Im Regeln-Tab anzeigen" mit Link zu /logic; RULES_VISIBLE_THRESHOLD=10, MAX_DISPLAYED_WHEN_OVER=5
- RuleCardCompact.vue: Fehler-Rand bei last_execution_success=false — border-left: 3px solid var(--color-status-alarm) (5-Sekunden-Regel)

### Aenderungen in v9.41 (Monitor L2 — Regeln für diese Zone)

- ZoneRulesSection.vue: Neue Komponente in components/monitor/ — Sektion "Regeln für diese Zone (N)"; nutzt logicStore.getRulesForZone(zoneId); Empty State bei 0 Regeln
- RuleCardCompact.vue: Neue Komponente in components/logic/ — Read-only Regel-Karte (Status-Dot, Name, letzte Ausführung, optional Badge); Klick → router.push(/logic/:ruleId); Glow bei activeExecutions
- MonitorView.vue L2: ZoneRulesSection zwischen Aktoren und Zone-Dashboards eingefuegt; Reihenfolge: Sensoren → Aktoren → Regeln → Zone-Dashboards → Inline-Panels

### Aenderungen in v9.40 (getRulesForZone — Monitor-Integration Grundlage)

- logic.store.ts: `getRulesForZone(zoneId): LogicRule[]` — filtert Regeln nach Zone via extractEspIdsFromRule + espStore.devices.zone_id; Sortierung priority, name
- types/logic.ts: `extractEspIdsFromRule(rule): Set<string>` — sammelt ESP-IDs aus SensorCondition, HysteresisCondition, ActuatorAction (rekursiv in Compound)
- Section 4 Logic Types: extractEspIdsFromRule dokumentiert
- Section 5 Store-Architektur: logic Store um getRulesForZone erweitert, Pfad shared/stores/logic.store.ts korrigiert

### Aenderungen in v9.39 (Phase 2.4 — Logic Subzone-Matching)

- types/logic.ts: SensorCondition um optionales `subzone_id?: string | null` erweitert (Backend-Kompatibilitaet)
- Section 4 Logic Types: SensorCondition subzone_id dokumentiert

### Aenderungen in v9.34 (Alert-Basis 4 — websocket_enabled in NotificationPreferences)

- NotificationPreferences.vue: Toggle „Echtzeit-Updates (WebSocket)“ in Basic Zone (vor E-Mail) — Backend nutzt websocket_enabled: bei false kein WS-Broadcast
- applyPrefs/save: websocket_enabled ref + API-Binding, Default true
- Section 2: notifications/ 3 → 4 Dateien (NotificationPreferences explizit)

### Aenderungen in v9.33 (Alert-Basis 3 — Filter nach source in NotificationDrawer)

- notification-inbox.store.ts: Neuer State `sourceFilter` (SourceFilterValue), Action `setSourceFilter()`, `filteredNotifications` erweitert um Source-Filter (AND mit Severity)
- NotificationDrawer.vue: Source-Filter-Chips (Alle, Sensor, Infrastruktur, Aktor, Regel, System) unter Status-Tabs
- NotificationItem.vue: Source-Badge in Titelzeile (Sensor/Infrastruktur/Aktor/Regel/System), Farbkodierung (blau/orange/lila/indigo/grau)
- labels.ts: NOTIFICATION_SOURCE_LABELS + getNotificationSourceLabel() — Backend-source zu lesbarem Label
- shared/stores/index.ts: Re-Export SourceFilterValue

### Aenderungen in v9.32 (Alert-Basis 2 — Device-Level Alert-Config UI)

- DeviceAlertConfigSection.vue: Neue Komponente in `components/devices/` — Device-Level Alert-Konfiguration (ISA-18.2), espApi.getAlertConfig/updateAlertConfig, Felder: alerts_enabled, propagate_to_children, suppression_reason, suppression_note, suppression_until (kein custom_thresholds/severity_override)
- ESPSettingsSheet.vue: Accordion-Sektion „Alert-Konfiguration (Gerät)“ mit DeviceAlertConfigSection integriert (nach Zone, vor Geräte nach Subzone)
- Section 2: devices/ 7 → 8 Dateien (DeviceAlertConfigSection)
- Section 3: Komponentenhierarchie HardwareView — ESPSettingsSheet um Alert-Konfiguration erweitert

### Aenderungen in v9.31 (Alert-Basis 1 — AlarmListWidget Notification-API)

- AlarmListWidget.vue: Datenquelle von espStore.devices (sensor.quality) auf alertCenterStore.activeAlertsFromInbox umgestellt — persistierte Notifications statt Live-Quality
- AlarmListWidget.vue: Gleiche Quelle wie QuickAlertPanel und NotificationDrawer (Single Source of Truth)
- AlarmListWidget.vue: Klick auf Alert oeffnet NotificationDrawer („Zum Alert“), Empty-State „Keine aktiven Alerts“ + Link „Benachrichtigungen oeffnen“
- Section 0.4 ALERT_VOLLANALYSE: Status GEFIXT dokumentiert

### Aenderungen in v9.36 (Phase D D1 — CalibrationStep Retry-Flow)

- CalibrationStep.vue: Expliziter "Erneut versuchen"-Button bei readError — erscheint neben Fehlermeldung, ruft readCurrentValue() erneut auf; CSS calibration-step__error-row, calibration-step__retry-btn (outline, var(--color-warning))
- PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md + PHASE_D_D1_RETRY_FLOW_IMPLEMENTIERUNGSAUFTRAG.md: Docs aktualisiert (Status Implementiert, Akzeptanzkriterien abgehakt)

### Aenderungen in v9.36 (Phase D2 — Kalibrierung Abbruch-Button)

- CalibrationWizard.vue: "Abbrechen"-Button in point1, point2, confirm — handleAbort() ruft reset(), optional ConfirmDialog bei points.length > 0 (uiStore.confirm), kein API-Call
- CalibrationWizard.vue: calibration-wizard__abort-btn CSS (sekundaerer Stil, Hover --color-error)
- SensorConfigPanel.vue: "Abbrechen"-Button in pH/EC Kalibrierung point1/point2 — ruft calibration.resetCalibration(), sensor-config__cal-btn--abort CSS
- Abgrenzung: "Zuruecksetzen" = gespeicherte Kalibrierung loeschen (complete); "Abbrechen" = laufende Erfassung abbrechen (point1/point2)

### Aenderungen in v9.36 (Phase D4 — EC-Presets)

- CalibrationWizard.vue: EC-Preset-Dropdown "Kalibrierloesung" bei sensor_type === 'ec' — Optionen: "0 / 1413 µS/cm", "1413 / 12.880 µS/cm", "Eigene Werte"; Default "1413 / 12.880 µS/cm"; ecPreset State, EC_PRESETS Konstante, getSuggestedReference/getReferenceLabel nutzen Preset-Werte
- CalibrationStep.vue: Keine Aenderung — suggestedReference/referenceLabel werden vom Wizard durchgereicht; bei Custom manuelle Eingabe wie bisher

### Aenderungen in v9.37 (Editor — Unteres Panel / bottom-panel)

- DashboardTarget.placement um `'bottom-panel'` erweitert
- dashboard.store.ts: neues Computed `bottomMonitorPanels` (analog inlineMonitorPanels, sideMonitorPanels)
- CustomDashboardView.vue: Target-Dropdown um "Monitor — Unteres Panel" erweitert
- MonitorView.vue: `monitor-layout__main-col` Wrapper (main + bottom), neuer Bereich `monitor-layout__bottom` mit InlineDashboardPanel (mode="inline"), max-height 400px, overflow-y auto
- El Servador dashboard.py: target-Docstring um `bottom-panel` ergaenzt

### Aenderungen in v9.38 (Phase 3.3 + E3 — Zone-Filter im WidgetConfigPanel, Inline-Panels L2 Zone-Filter)

- WidgetConfigPanel.vue: Zone-Filter-Dropdown fuer alarm-list, esp-health, actuator-runtime — "Alle Zonen" oder konkrete Zone (aus espStore.devices); config.zoneFilter
- dashboard.store.ts: inlineMonitorPanelsCrossZone (scope !== 'zone' oder null), inlineMonitorPanelsForZone(zoneId) (scope === 'zone' && zoneId); inlineMonitorPanels = Alias fuer Cross-Zone
- MonitorView.vue L2: inlineMonitorPanelsL2 = cross-zone + zone-spezifische Panels fuer selectedZoneId; L1 nutzt inlineMonitorPanels (Cross-Zone)
- DashboardWidget.config: zoneFilter?: string | null ergaenzt

### Aenderungen in v9.37 (Phase 1 Monitor-Layout)

- MonitorView.vue L2: Reihenfolge Zone-Header → Sensoren → Aktoren → Regeln für diese Zone → Zone-Dashboards → Inline-Panels
- MonitorView.vue L2: Zaehlung nur in Sektionsueberschrift "Sensoren (N)" / "Aktoren (N)"; Subzone-Zeile ohne Count
- MonitorView.vue L1: Zone-Tile Footer zeigt "X/Y online" (ESP-Count aus zoneKPIs.onlineDevices/totalDevices)
- MonitorView.vue L2: getDashboardNameSuffix(dash) — Zone-Dashboard-Namen mit Suffix (createdAt "DD.MM." oder ID) fuer Eindeutigkeit (F004)
- tokens.css: --space-10: 2.5rem (40px) fuer Major-Section-Trennung
- MonitorView.vue: margin-bottom: var(--space-10) auf Zone-Grid, Dashboard-Card, monitor-section, monitor-dashboards, monitor-view__header

### Aenderungen in v9.35 (Phase C — getSensorTypeOptions Deduplizierung)

- sensorDefaults.ts: getSensorTypeOptions() — Device-Liste statt Value-Liste; ein Eintrag pro Multi-Value-Device (sht31, bmp280, bme280) mit Label aus MULTI_VALUE_DEVICES; Value-Types (sht31_temp, sht31_humidity, bme280_*) ausgeblendet; Duplikate DS18B20/ds18b20 dedupliziert (lowercase ds18b20 kanonisch); deviceKeySet + addedLowercase fuer Ausschluss
- sensorDefaults.ts: getMultiValueDeviceFallbackLabel() — Fallback-Labels fuer MULTI_VALUE_DEVICES ohne label
- AddSensorModal.vue: defaultSensorType von 'DS18B20' auf 'ds18b20' (kanonischer Key)
- sensorDefaults.test.ts: Tests fuer SHT31/BME280 Einzeleintrag, Value-Types ausgeschlossen, Single-Value-Sensoren vorhanden

### Aenderungen in v9.30 (Config-Panel-Optimierung 5 — schedule_config + Schwellwerte-Doku)

- SensorConfigPanel.vue: schedule_config UI bei operating_mode=scheduled — Cron-Presets + Expression-Input, Load/Save via sensorsApi.createOrUpdate
- SensorConfigPanel.vue: Accordion-Titel "Sensor-Schwellwerte (Basis)" — Klarstellung vs. AlertConfigSection
- AlertConfigSection.vue: Sektion "Schwellen-Override für Alerts" — In-Code-Kommentar: Override ueberschreibt Haupt-Schwellen nur fuer Alert-Regeln
- types/index.ts: SensorConfigResponse um schedule_config erweitert
- Backend: _model_to_response in sensors.py liefert schedule_config in GET-Response

### Sensor-Schwellwerte: Haupt vs. Alert-Override

| Stelle | Zweck | API |
|--------|------|-----|
| **SensorConfigPanel** "Sensor-Schwellwerte (Basis)" | Basiskonfiguration fuer den Sensor (threshold_min/max, warning_min/max) | POST createOrUpdate |
| **AlertConfigSection** "Schwellen-Override für Alerts" | Override nur fuer Alert-Regeln (custom_thresholds, severity_override) | PATCH /sensors/{id}/alert-config |

Keine Dopplung der Semantik: Haupt-Schwellen = eine Stelle (SensorConfigPanel). Alert-Override = separate Stelle (AlertConfigSection).

### Aenderungen in v9.30 (T08-Fix F/G/H — Sensor Pipeline + Slug + Auth)

- AddSensorModal.vue: `buildSensorPayload()` als gemeinsame Funktion fuer I2C- und OneWire-Flow extrahiert — OneWire-Flow uebertraegt jetzt User-Eingaben (name, raw_value, unit, operating_mode, timeout_seconds, subzone_id) statt Hardcoded-Werte
- AddSensorModal.vue: `SensorPayload` Type-Alias (MockSensorConfig & operating_mode & timeout_seconds & i2c_address)
- subzoneHelpers.ts: `slugifyGerman()` — Deutsche Umlaut-Transliteration (ae/oe/ue/ss) VOR Slugify, dann lowercase + non-alnum → underscore
- useSubzoneCRUD.ts: `confirmCreateSubzone()` nutzt `slugifyGerman()` statt `toLowerCase().replace(/\s+/g, '_')` — "Naehrloesung" statt "n_hrl_sung"
- api/index.ts: Token-Refresh Promise-Queue Pattern (isRefreshing + failedQueue) — genau 1 Refresh-Call bei N parallelen 401-Responses, keine Console-401-Errors

### Aenderungen in v9.29 (Config-Panel-Optimierung 3 — Initial-Panels Subzone-Dropdown)

- AddSensorModal.vue: Freitext durch SubzoneAssignmentSection ersetzt — Dropdown „Keine Subzone“ + bestehende Subzonen + „Neue Subzone erstellen“; effectiveGpio (OneWire/I2C/GPIO), subzoneModel (string | null), resetForm subzone_id: null
- AddActuatorModal.vue: Freitext durch SubzoneAssignmentSection ersetzt — gleiche Dropdown-Logik
- addMultipleOneWireSensors: `normalizeSubzoneId(newSensor.subzone_id)` statt trim/undefined
- types/index.ts: MockSensorConfig.subzone_id?: string | null (analog MockActuatorConfig)

### Aenderungen in v9.28 (Config-Panel-Optimierung 2)

- subzoneHelpers.ts: Neues Util `normalizeSubzoneId()` — "__none__", "", leer → null vor API (Defense-in-Depth)
- esp.ts: addSensor/addActuator nutzen normalizeSubzoneId fuer subzone_id
- ActuatorConfigPanel.vue: handleSave normalisiert subzone_id via normalizeSubzoneId
- SensorConfigPanel.vue: operating_mode + timeout_seconds (Load, UI, Save) — Betriebsmodus-Select, Stale-Timeout bei continuous
- types/index.ts: SensorConfigResponse um operating_mode, timeout_seconds erweitert
- Backend: SensorConfigResponse + _model_to_response liefern operating_mode, timeout_seconds

### Aenderungen in v9.27 (Initiales Sensor/Aktor-Config — Subzone top-level)

- esp.ts addSensor (Real-ESP): `subzone_id` als **top-level** in `realConfig` (nicht nur in metadata) — Backend wertet nur top-level; metadata nur noch `created_via`
- esp.ts addActuator (Real-ESP): `realConfig` um `subzone_id: config.subzone_id ?? null` ergaenzt
- types/index.ts: `ActuatorConfigCreate` und `MockActuatorConfig` um `subzone_id?: string | null` erweitert
- AddActuatorModal.vue: SubzoneAssignmentSection (Dropdown) — `subzoneModel` v-model, resetForm `subzone_id: null`; Wert an addActuator uebergeben
- AddSensorModal.vue: SubzoneAssignmentSection (Dropdown) — `subzoneModel` v-model, effectiveGpio je nach Sensortyp; addMultipleOneWireSensors nutzt `normalizeSubzoneId(newSensor.subzone_id)` bei jedem `espStore.addSensor()`-Aufruf

### Aenderungen in v9.26 (ESPSettingsSheet Bereinigung + Layout)

- ESPSettingsSheet.vue: Reines Informations-Panel — Emits `open-sensor-config`/`open-actuator-config` entfernt, keine Links zu SensorConfigPanel/ActuatorConfigPanel
- ESPSettingsSheet.vue: Eine Sektion „Geräte nach Subzone“ statt getrennter Sensor-/Aktor-Listen — gruppiert nach subzone_id, „Keine Subzone“ am Ende, read-only (kein cursor: pointer)
- ESPSettingsSheet.vue: Layout-Vereinheitlichung — Design-Tokens (--space-*, --text-xs, --text-sm), device-group/device-list CSS, kompakte Zeilen
- ESPSettingsSheet.vue: Mock vs. Real getrennt — „Mock-Steuerung“ nur bei isMock, „Echt-ESP-Info“ nur bei echtem ESP
- HardwareView.vue: handleSensorConfigFromSheet/handleActuatorConfigFromSheet entfernt — Konfiguration ausschliesslich via Level 2 (DeviceDetailView @sensor-click/@actuator-click)
- Section 3: Komponentenhierarchie HardwareView — ESPSettingsSheet, SensorConfigPanel, ActuatorConfigPanel aktualisiert

### Aenderungen in v9.25 (Phase C V1.2 Email-Retry Frontend)

- labels.ts: EMAIL_STATUS_LABELS + getEmailStatusLabel() — Email-Status-Labels (sent, failed, pending, permanently_failed) fuer NotificationDrawer + NotificationItem
- api/notifications.ts: EmailLogStatus Type, EmailLogEntry.status um permanently_failed erweitert, EmailLogListFilters.status typisiert
- NotificationDrawer.vue: getEmailStatusLabel aus labels, retry_count-Anzeige (X/3 Versuche) bei failed/permanently_failed, CSS drawer__email-dot--permanently_failed
- NotificationItem.vue: getEmailStatusLabel aus labels, CSS item__email-status--permanently_failed
- Section 9: labels.ts um EMAIL_STATUS_LABELS + getEmailStatusLabel erweitert

### Aenderungen in v9.24 (Backend-Datenkonsistenz Fix)

- MonitorView L2: Ready-Gate — v-if="!zoneMonitorLoading" auf L2-Content, BaseSkeleton während Loading, ErrorState mit Retry bei API-Fehler
- sensorSubzones/actuatorSubzones: Fallback nur bei zoneMonitorError (nicht während Loading) — behebt "Keine Subzone"-Flackern
- fetchZoneMonitorData() extrahiert für Retry und Watch
- Section 3: Komponentenhierarchie MonitorView — Datenquelle-Zeile um Ready-Gate ergänzt

### Aenderungen in v9.23 (Phase 4D Diagnostics Hub)

- Router: `/maintenance` → Redirect zu `/system-monitor?tab=health` (Wartung in Health-Tab integriert)
- HealthTab.vue: Wartung & Cleanup AccordionSection — Cleanup-Config (Sensor-Daten, Befehlsverlauf, Orphan Mocks) + Maintenance-Jobs mit Run-Buttons (debugApi)
- HealthTab.vue: Plugins-KPI-Cards nutzen `total`/`enabled` (nicht total_plugins/enabled_plugins)
- HealthSummaryBar.vue: Diagnose-Chip immer sichtbar wenn lastRunAge (auch ohne Problems), "Letzte Diagnose: vor Xm ✓"
- diagnostics.store.ts: lastRunAge aus history[0] wenn currentReport null
- DiagnoseTab.vue: loadHistory() beim Mount wenn history leer
- ReportsTab.vue: triggerLabel() — manual→Manuell, logic_rule→Regel, schedule→Zeitplan
- api/diagnostics.ts, shared/stores/diagnostics.store.ts, DiagnoseTab.vue, ReportsTab.vue (Phase 4D)
- Section 5: diagnostics Store, Section 7: diagnostics.ts API-Modul

### Aenderungen in v9.21

- Monitor L2 optimiertes Design — primäre Datenquelle `zonesApi.getZoneMonitorData()`, Fallback `useZoneGrouping` + `useSubzoneResolver`
- types/monitor.ts: ZoneMonitorData, SubzoneGroup, SubzoneSensorEntry, SubzoneActuatorEntry
- zones.ts: `getZoneMonitorData(zoneId)` — GET /zone/{id}/monitor-data
- useSubzoneResolver.ts: Neues Composable — Map (espId, gpio) → { subzoneId, subzoneName } aus Subzone-API, Fallback für Monitor L2
- useZoneGrouping.ts: Optionaler Parameter `subzoneResolver` für GPIO-basierte Subzone-Auflösung
- MonitorView L2: Subzone-Accordion mit „Keine Subzone“-Gruppe, Smart Defaults (≤4 offen, >4 erste offen), localStorage-Persistenz

### Aenderungen in v9.23

- Phase 4C Plugin-System Dokumentation: WebSocket-Events `plugin_execution_started`, `plugin_execution_completed` in Quick-Reference; plugins.ts API-Modul; plugins Store in Store-Architektur; Shared Stores 17 → 18

### Aenderungen in v9.22

- Phase 4B Konsistenz: Alert-Center als Single Source of Truth fuer Badge/Counts
- quickAction.store.ts: alertSummary nutzt alert-center (unresolvedCount, hasCritical, warningCount) mit Fallback auf notification-inbox
- QuickActionMenu.vue: global-alerts Badge reaktiv aus store.alertSummary (nicht aus Action-Objekt)
- NotificationDrawer.vue: Status-Tabs (Aktiv/Gesehen) nutzen alertStore.alertStats (active_count, acknowledged_count) statt lokaler Zaehlung
- App.vue: alertCenterStore.fetchStats() + startStatsPolling() bei Login, stopStatsPolling bei Logout, watch auf isAuthenticated
- useQuickActions.ts: inboxStore aus buildGlobalActions entfernt (Badge kommt aus Store)

### Aenderungen in v9.20

- Phase C: Frontend-Verfeinerung — V1.1 Email-Status-Tracking, V4.1 Timed Snooze, V6.1 QAB-Actions
- notifications.ts (API): 4 neue Types (`EmailLogEntry`, `EmailLogListResponse`, `EmailLogListFilters`, `EmailLogStatsDTO`) + 2 neue Methoden (`getEmailLog()`, `getEmailLogStats()`) fuer Phase C V1.1 Email-Log
- NotificationItem.vue: Email-Delivery-Status im Detail-Grid — `emailStatus`, `emailProvider`, `hasEmailInfo` Computeds aus notification.metadata, Mail-Icon, Zugestellt/Fehlgeschlagen/Ausstehend Badge mit Provider-Info, CSS `.item__email-status--sent/failed/pending`
- QuickAlertPanel.vue: Timed Snooze (Phase C V4.1) — 5 Preset-Dauern (15min, 30min, 1h, 4h, 8h), `suppressionMap` trackt aktive Snooze-Timer, Timer-Countdown-Anzeige, `sensorsApi.updateAlertConfig()` mit `suppression_until` ISO-Datetime
- useQuickActions.ts: Neue QAB-Actions (Phase C V6.1) — `global-last-report` (System Monitor Reports-Tab), ViewContext `'plugins'` fuer PluginsView, `buildGlobalActions()` nimmt jetzt `router` Parameter
- quickAction.store.ts: `'plugins'` zu `ViewContext` Type Union hinzugefuegt
- RuleConfigPanel.vue (Logic): Neuer Action-Node-Typ `plugin` — Plugin-Liste aus API, Konfig aus Schema, Rule-Flow-Editor unterstuetzt Plugin-Actions (Phase 4C)
- Router: Alle Route-Komponenten ueber `lazyView()` (Retry bei dynamic import failure), SystemMonitorView-Tabs per `defineAsyncComponent` (DiagnoseTab, ReportsTab, etc.)

### Aenderungen in v9.19

- Phase 4B: Unified Alert Center — ISA-18.2 Alert Lifecycle (active → acknowledged → resolved) im Frontend
- alert-center.store.ts: Neuer Shared Store — `activeAlerts[]`, `alertStats` (MTTA, MTTR), `fetchActiveAlerts()`, `fetchAlertStats()`, `acknowledgeAlert()`, `resolveAlert()`, Computeds: `alertsByCategory`, `alertsBySeverity`, `criticalCount`, `warningCount`
- notification-inbox.store.ts: Neuer Shared Store — `notifications[]`, `unreadCount`, `highestSeverity`, `isDrawerOpen`, `filter`, WS-Listener fuer `notification_new`, `notification_updated`, `notification_unread_count`
- AlertStatusBar.vue: Neue Komponente in `components/notifications/` — Horizontale Alert-Statusleiste mit Severity-Counts (critical/warning/info), Klick oeffnet NotificationDrawer mit Filter
- NotificationDrawer.vue: Ack/Resolve Buttons integriert — `acknowledgeAlert()` und `resolveAlert()` via `alertCenterStore`, Status-Badge (active/acknowledged/resolved) pro NotificationItem
- NotificationItem.vue: ISA-18.2 Status-Anzeige — Status-Dot mit Farbkodierung, Ack/Resolve Action-Buttons, acknowledged_by/resolved_at Timestamps
- QuickAlertPanel.vue: Status-Filter (active/acknowledged) — FilterChips, Severity-Sortierung (critical > warning > info), Bugfix: ungenutzter `Check` Import entfernt (TS6133)
- HealthTab.vue (System Monitor): Alert-Statistik-Sektion — ISA-18.2 KPIs (MTTA, MTTR), Active/Acknowledged/Resolved Counts, AlertStatusBar Integration
- HealthSummaryBar.vue (System Monitor): Alert-Count-Chips — Critical/Warning Counts aus `alertCenterStore`, Klick-Navigation zu System Monitor Health-Tab
- notifications.ts (API): 4 neue Methoden — `getActiveAlerts()`, `getAlertStats()`, `acknowledgeAlert()`, `resolveAlert()` (Phase 4B REST-Endpoints)
- notification_updated WS-Event: Erweitert um `status`, `acknowledged_at`, `acknowledged_by`, `resolved_at` Felder
- Section 2: notifications/ 2 → 3 Dateien (AlertStatusBar), Shared Stores 13 → 15 (alertCenter, notificationInbox)
- Section 5: Store-Tabelle um notificationInbox und alertCenter erweitert

### Aenderungen in v9.18

- AlertConfigSection.vue: Neue Komponente in `components/devices/` — Per-Sensor/Actuator Alert-Konfiguration (ISA-18.2 Shelved Alarms Pattern), Master-Toggle, Suppression-Details (Grund, Notiz, Zeitlimit), Custom Thresholds (warning/critical min/max), Severity Override, generische Props (`fetchFn`/`updateFn` fuer Sensor/Actuator-Reuse)
- RuntimeMaintenanceSection.vue: Neue Komponente in `components/devices/` — Laufzeit-Statistiken (Uptime, letzte Wartung, erwartete Lebensdauer), Wartungsprotokoll mit Add-Entry-Formular, Maintenance-Overdue-Alert, generische Props (`fetchFn`/`updateFn`)
- SensorConfigPanel.vue: 2 neue AccordionSections integriert — "Alert-Konfiguration" (AlertConfigSection mit sensorsApi) + "Laufzeit & Wartung" (RuntimeMaintenanceSection mit sensorsApi)
- ActuatorConfigPanel.vue: 2 neue AccordionSections integriert — "Alert-Konfiguration" (AlertConfigSection mit actuatorsApi) + "Laufzeit & Wartung" (RuntimeMaintenanceSection mit actuatorsApi)
- QuickAlertPanel.vue: Mute-Button aktiviert — `sensorsApi.updateAlertConfig()` mit `alerts_enabled: false` + `suppression_reason: 'user_mute'`
- sensors.ts: 4 neue Methoden in `sensorsApi` — `getAlertConfig()`, `updateAlertConfig()`, `getRuntime()`, `updateRuntime()` (Phase 4A.7/4A.8)
- actuators.ts: 4 neue Methoden in `actuatorsApi` — `getAlertConfig()`, `updateAlertConfig()`, `getRuntime()`, `updateRuntime()` (Phase 4A.7/4A.8)
- sensors.ts: Bugfix — alert-config/runtime Methoden waren versehentlich in `oneWireApi` statt `sensorsApi` platziert (TypeScript-Fehler)
- Section 2: devices/ Components 4 → 6 (AlertConfigSection + RuntimeMaintenanceSection)

### Aenderungen in v9.17

- formatRelativeTime: 8 lokale Duplikate eliminiert — QuickAlertPanel, NotificationItem, LogicView, DataTable, HealthProblemChip, HealthSummaryBar, useESPStatus, PreviewEventCard importieren jetzt alle von `@/utils/formatters` (Single Source of Truth)
- Server FIX-02: Severity auf 3 Stufen reduziert (critical/warning/info) — kein `success`/`resolved` als Severity
- Server FIX-07: `fingerprint` VARCHAR(64) Spalte in notifications-Tabelle + Partial UNIQUE Index fuer Grafana-Alert Deduplication
- Server FIX-09: Kein separates `alert_update` WS-Event — `notification_new` fuer alles, Frontend unterscheidet via `source`-Feld
- Server FIX-13: Event-Routing — `notification` (legacy) → Toast, `notification_new` → notification-inbox.store (Inbox/Badge)
- Server FIX-15: actuator_alert_handler routet jetzt durch NotificationRouter mit ISA-18.2 Severity-Mapping (emergency→critical, safety→warning, runtime→info, hardware→warning)
- Section 9: formatRelativeTime als SSOT markiert

### Aenderungen in v9.16

- QuickActionBall.vue: Sub-Panel-Routing — dynamische `<component :is>` rendert QuickActionMenu, QuickAlertPanel oder QuickNavPanel basierend auf `store.activePanel`
- QuickAlertPanel.vue: Neues Sub-Panel im FAB — Top-5 ungelesene Alerts sortiert nach Severity (critical > warning > info), Ack/Navigate/Details-Expand Actions, Mute als disabled Placeholder (Auftrag 5 Abhaengigkeit), Footer oeffnet NotificationDrawer
- QuickNavPanel.vue: Neues Sub-Panel im FAB — MRU-Liste (letzte 5 besuchte Views), Favoriten mit Stern-Toggle, Quick-Search Trigger (Ctrl+K via uiStore.toggleCommandPalette)
- useNavigationHistory.ts: Neues Composable — Route-Tracking via router.afterEach(), localStorage Persistenz (ao_nav_history max 20, ao_nav_favorites separat), ROUTE_META fuer 12 Views, StoredNavItem/NavHistoryItem Dual-Type-Pattern (JSON-serializable vs Component-Icon)
- quickAction.store.ts: `QuickActionPanel` Type ('menu' | 'alerts' | 'navigation'), `activePanel` State, `setActivePanel()` Action
- quickAction.store.ts: Bugfix `executeAction()` — prueft ob `activePanel` sich nach Handler-Aufruf geaendert hat, schliesst Menu nur wenn Handler kein Sub-Panel geoeffnet hat
- quickAction.store.ts: Bugfix `toggleMenu()` — nutzt `closeMenu()` beim Schliessen (resettet `activePanel` auf 'menu'), verhindert dass Sub-Panel beim naechsten Oeffnen noch aktiv ist
- useQuickActions.ts: `global-alerts` Action oeffnet jetzt QuickAlertPanel via `setActivePanel('alerts')` statt `inboxStore.toggleDrawer()`
- useQuickActions.ts: Neue `global-navigation` Action mit Navigation-Icon, oeffnet QuickNavPanel via `setActivePanel('navigation')`
- composables/index.ts: Re-Exports fuer `useNavigationHistory` + Type `NavHistoryItem`
- shared/stores/index.ts: Re-Exports fuer `useNotificationInboxStore`, `InboxFilter`, `QuickActionPanel`
- Neues Verzeichnis: `components/notifications/` (NotificationDrawer, NotificationItem)
- Section 2: components/ 18 → 19 Unterverzeichnisse (notifications/ hinzugefuegt), composables 22 → 23 (useNavigationHistory), quick-action/ 3 → 5 Dateien (QuickAlertPanel + QuickNavPanel)
- Section 5: quickAction Store-Tabelle um activePanel, setActivePanel, closeMenu, hasActiveAlerts, isCritical, isWarning erweitert

### Aenderungen in v9.15

- AppShell.vue: `keep-alive` Wrapper mit `:include="['MonitorView', 'LogicView', 'CustomDashboardView']"` — Views bleiben bei Tab-Wechsel erhalten
- MonitorView.vue, LogicView.vue, CustomDashboardView.vue: `defineOptions({ name: 'ComponentName' })` fuer keep-alive Matching
- CustomDashboardView.vue: `onActivated()` re-initialisiert GridStack + Breadcrumb, `onDeactivated()` raeumt Breadcrumb auf (keep-alive Lifecycle)
- MonitorView.vue: DashboardOverviewCard mit horizontalen Chips, Collapse-Toggle (localStorage), Edit-Icons, "+"-Button
- LogicView.vue: Layout umstrukturiert — Eigene Regeln OBEN (primaer), Vorlagen UNTEN (collapsible mit localStorage-State)
- dashboard.store.ts: Per-Layout Debounce-Timer (`Map<string, ReturnType<typeof setTimeout>>`) statt globalem Timer — verhindert Datenverlust bei schnellem Layout-Wechsel
- logic.store.ts: `execution_count` und `last_execution_success` werden bei WebSocket `logic_execution` Event aktualisiert
- DashboardViewer.vue: `inset: 4px` aus `.grid-stack-item-content` entfernt (konsistent mit GridStack-Default margin)
- InlineDashboardPanel.vue: ROW_HEIGHT 60 → 80px (synchron mit CustomDashboardView/DashboardViewer cellHeight), overflow `hidden` → `auto`, CSS hardcoded px → Design-Tokens
- CSS-Konsistenz: 4 Widget-Dateien (ActuatorRuntimeWidget, ActuatorCardWidget, AlarmListWidget, MultiSensorWidget) — hardcoded `font-size`, `padding`, `gap`, `rgba()` durch `var(--text-xs)`, `var(--space-*)`, `var(--color-zone-*)` ersetzt
- Section 16: keep-alive Pattern dokumentiert

### Aenderungen in v9.14

- formatters.ts: 3 neue benannte Konstanten — `DATA_LIVE_THRESHOLD_S` (30), `DATA_STALE_THRESHOLD_S` (120), `ZONE_STALE_THRESHOLD_MS` (60000) — ersetzen Magic Numbers in getDataFreshness(), useDeviceActions, MonitorView
- useDeviceActions.ts: `isRecentlyActive` nutzt `DATA_STALE_THRESHOLD_S * 1000` statt hardcoded `120_000`
- SensorCard.vue: Sensor-Typ-Icons im Monitor-Modus — `ICON_MAP` Record mappt SENSOR_TYPE_CONFIG Icon-Namen auf Lucide-Komponenten (Thermometer, Droplets, Wind, Sun, Gauge, Leaf, Activity), `sensorIcon` Computed, `.sensor-card__type-icon` (14px, iridescent-2)
- dashboard.store.ts: `generateZoneDashboard()` trackt `espId` pro Device — SensorEntry/ActuatorEntry um `espId` erweitert, Widget-Configs enthalten `espId`, `sensorId`/`actuatorId` (`{espId}-gpio{gpio}`)
- dashboard.store.ts: `crossZoneDashboards` filtert nach `target.view === 'monitor'` (verhindert Hardware-Dashboards im Monitor)
- dashboard.store.ts: `generateZoneDashboard()` ruft `syncLayoutToServer()` nach Erstellung auf (auto-persist)
- dashboard.store.ts: `target` Cast von `(dto as any).target` zu `(dto.target as unknown)` (type-safe)
- DashboardViewer.vue: Layout-Lookup per `l.id === layoutId || l.serverId === layoutId` (Server-UUID Kompatibilitaet)
- DashboardViewer.vue: Empty-State mit `router-link` zurueck zum Monitor statt Button + goBack()
- TopBar.vue: Dashboard-Breadcrumb im Monitor-Route — `hasDashboard` Check, `dashboardName` Segment bei `/monitor/dashboard/:dashboardId`
- MonitorView.vue: Zone-Dashboard Empty-State — "Dashboard erstellen" Link zu Editor bei leeren Zonen (LayoutDashboard Icon, dashed Border)
- MonitorView.vue: CSV-Export mit BOM (`\uFEFF`) fuer korrekte UTF-8-Erkennung in Excel
- MonitorView.vue: `URL.revokeObjectURL` verzoegert (1s setTimeout) fuer zuverlaessigeren Download
- MonitorView.vue: `detailIsStale` nutzt `DATA_STALE_THRESHOLD_S * 1000` statt hardcoded `120_000`
- MonitorView.vue: `expandedChartData` Label ohne leere Klammern wenn Unit fehlt
- MonitorView.vue: Error-Logging bei fehlgeschlagenem `fetchDetailStats()`
- Section 9: formatters.ts Zeilenanzahl 631 → 655

### Aenderungen in v9.13

- useDashboardWidgets.ts: Container-agnostisches Widget-Rendering Composable — extrahiert aus CustomDashboardView, 9 Widget-Typen, `WIDGET_TYPE_META`, `WIDGET_DEFAULT_CONFIGS`, `createWidgetElement()`, `mountWidgetToElement()`, `cleanupAllWidgets()`
- DashboardViewer.vue: View-Only Dashboard-Rendering mit GridStack `staticGrid: true` — Header (Zurueck + Titel + "Im Editor bearbeiten"), Auto-Generated Banner mit Uebernehmen/Anpassen
- InlineDashboardPanel.vue: CSS-Grid-Only Dashboard-Renderer (12 Spalten, KEIN GridStack) — Props: `layoutId`, `mode: 'inline' | 'side-panel'`, Zero-Overhead Rendering
- dashboard.store.ts: `DashboardTarget` Interface (`view`, `placement`, `anchor`, `panelPosition`, `panelWidth`, `order`), `setLayoutTarget()`, `generateZoneDashboard()`, `claimAutoLayout()`
- dashboard.store.ts: 3 neue Computeds — `inlineMonitorPanels`, `sideMonitorPanels`, `hardwarePanels` (filtern layouts nach target.view + target.placement)
- dashboard.store.ts: `serverToLocal()`/`localToServer()` mappen target-Feld zwischen API DTO und lokalem State
- Router: 2 neue Routes — `monitor/dashboard/:dashboardId` (name: 'monitor-dashboard', VOR :zoneId wegen Greedy-Matching), `monitor/:zoneId/dashboard/:dashboardId` (name: 'monitor-zone-dashboard')
- MonitorView.vue: InlineDashboardPanel-Integration — CSS-Grid-Layout mit Side-Panel (`grid-template-columns: 1fr 300px`), Inline-Panels in L1 + L2, responsive Breakpoint 768px
- HardwareView.vue: InlineDashboardPanel-Integration — Side-Panel fuer Hardware-View mit sticky Positionierung, responsive Breakpoint 768px
- CustomDashboardView.vue: Target-Konfigurator — `showTargetConfig`, `activeTarget`, `setTarget()`/`clearTarget()`, "Im Monitor anzeigen" RouterLink mit `monitorRouteForLayout` Computed
- Server: `target` JSON-Spalte in DashboardLayout Model + DashboardCreate/Update/Response Schemas + Alembic Migration
- api/dashboards.ts: `target` Feld in DashboardDTO, CreatePayload, UpdatePayload
- composables/index.ts: Re-Export `useDashboardWidgets` + Types (`WidgetTypeMeta`, `UseDashboardWidgetsOptions`)
- Section 2: dashboard/ Components 9 → 11 (DashboardViewer + InlineDashboardPanel)
- Section 5: dashboard Store-Tabelle um DashboardTarget, target-Computeds, setLayoutTarget, generateZoneDashboard, claimAutoLayout erweitert
- Section 10: Router-Tabelle um monitor/dashboard/:dashboardId und monitor/:zoneId/dashboard/:dashboardId erweitert

### Aenderungen in v9.12

- RuleConfigPanel.vue: Days-of-Week Fix — `dayLabels` von `['So','Mo',...,'Sa']` (JS: 0=Sonntag) zu `['Mo','Di','Mi','Do','Fr','Sa','So']` (ISO 8601: 0=Montag) umgestellt, passt zu Python `weekday()`
- RuleFlowEditor.vue: Default `daysOfWeek` von `[1,2,3,4,5]` auf `[0,1,2,3,4]` korrigiert (Montag-Freitag)
- types/logic.ts: ExecutionHistoryItem Felder an Server-Response angepasst — `logic_rule_id`→`rule_id`, `timestamp`→`triggered_at`, `trigger_data`→`trigger_reason` (Typ: Record→string), `rule_name` hinzugefuegt
- types/logic.ts: TimeCondition Kommentar aktualisiert auf `0 = Monday, 6 = Sunday (ISO 8601 / Python weekday())`
- logic.store.ts: `loadExecutionHistory(ruleId?)` Action — REST-Fetch via `logicApi.getExecutionHistory()`, Merge mit WebSocket-Events, Deduplizierung nach ID, max 50 Eintraege
- logic.store.ts: Neuer State: `executionHistory`, `isLoadingHistory`, `historyLoaded`
- logic.store.ts: `handleLogicExecutionEvent` erweitert — pusht WS-Events auch in `executionHistory`
- RuleFlowEditor.vue: `pushToHistory()` in 4 fehlende Events eingebaut — onDrop, deleteNode (vor Loeschung), duplicateNode, onNodeDragStop
- RuleFlowEditor.vue: Undo/Redo Buttons als Overlay (Undo2/Redo2 Icons), disabled-State bei `!canUndo`/`!canRedo`
- RuleFlowEditor.vue: Keyboard-Shortcuts Ctrl+Z (Undo), Ctrl+Y/Ctrl+Shift+Z (Redo), via `@keydown` auf Graph-Container
- LogicView.vue: Landing-Page Rule-Liste von Inline-Buttons auf `<RuleCard>` Komponenten umgestellt
- LogicView.vue: RuleCard Event-Handler — `@select` (Rule oeffnen), `@toggle` (Enable/Disable + Toast), `@delete` (ConfirmDialog + Toast)
- LogicView.vue: Execution History Panel erweitert — REST-Integration beim ersten Oeffnen, Filter (Regel + Status), expandierbare Detail-Rows, Loading-Spinner
- LogicView.vue: Alte list-item CSS (72 Zeilen) ersetzt durch `.rules-empty__cards` Grid
- RuleCard.vue: Sichtbares Status-Label ("Aktiv"/"Deaktiviert"/"Fehler") neben Status-Dot
- RuleCard.vue: Error-Styling — `rule-card--error` (roter Rand) bei `last_execution_success === false`, AlertCircle Error-Icon
- RuleCard.vue: Toggle-Pulse-Animation (dot-pulse, 0.8s) beim Status-Dot-Klick
- Section 4: Logic Types um ExecutionHistoryItem und LogicConnection ergaenzt
- Section 5: Logic Store Zeile um executionHistory, historyLoaded, loadExecutionHistory, pushToHistory, undo, redo erweitert

### Aenderungen in v9.11

- MonitorView.vue L2: SensorCard Sparkline im Monitor-Modus entfernt — keine `sparklineData` Prop-Bindung, keine `LiveLineChart`-Nutzung, kompaktere Karte (Name + Wert + Dot + ESP-ID)
- MonitorView.vue L2: Expanded Panel radikal vereinfacht — GaugeChart, LiveLineChart, HistoricalChart + doppelte TimeRange-Buttons ENTFERNT, ersetzt durch 1h-Chart (vue-chartjs `Line`) + 2 Action-Buttons
- MonitorView.vue L2: 1h-Chart mit Initial-Fetch — `fetchExpandedChartData()` via `sensorsApi.queryData` (1h Fenster, 500 Datenpunkte), `expandedChartData`/`expandedChartOptions` Computeds
- MonitorView.vue L2: Auto-generierte Zone-Dashboards — `generatedZoneDashboards` Guard-Set, Watcher ruft `dashStore.generateZoneDashboard()` beim ersten Zonenbesuch
- MonitorView.vue L2: Zone-Header erweitert um KPI-Zeile (Sensor-Count, Aktor-Count, Alarm-Count mit AlertTriangle)
- MonitorView.vue L2: Subzone-Header erweitert um Status-Dot (`getWorstQualityStatus`) und KPI-Werte (`getSubzoneKPIs` — aggregiert Sensorwerte nach Basistyp, max 3 Eintraege)
- MonitorView.vue L3: Multi-Sensor-Overlay — `availableOverlaySensors` Computed, `toggleOverlaySensor()`, `fetchOverlaySensorData()`, Chip-Selektor UI (max 4 Overlays), sekundaere Y-Achse bei unterschiedlichen Einheiten, Legend bei aktiven Overlays
- MonitorView.vue L3: Overlay-Cleanup in `closeSensorDetail()` und Re-Fetch in `onDetailRangeChange()`
- SensorCard.vue: Stale-Indikator (>120s kein Update) — `getDataFreshness()`, CSS `sensor-card--stale` (opacity 0.7, warning border), Clock-Badge mit `formatRelativeTime()`
- SensorCard.vue: ESP-Offline-Indikator — `esp_state !== 'OPERATIONAL'`, CSS `sensor-card--esp-offline` (opacity 0.5), WifiOff-Badge
- SensorCard.vue: `formatValue()` Signatur von `(value: number)` zu `(value: number | null | undefined)` — 0 wird korrekt als valider Wert behandelt (P2.5 Fix)
- SensorCard.vue: `LiveLineChart` Import entfernt (nicht mehr benoetigt)
- Section 3: Komponentenhierarchie MonitorView aktualisiert (Sparkline→1h-Chart, L3 Overlay dokumentiert)

### Aenderungen in v9.10

- CustomDashboardView.vue: Edit/View-Mode-Trennung — `isEditing` ref, GridStack `enableMove()`/`enableResize()` Toggle, Gear-Icon + Katalog/Export/Import/Delete nur im Edit-Modus sichtbar
- CustomDashboardView.vue: Widget-Katalog erweitert um `description` Feld pro Widget-Typ (9 Beschreibungen), Text-xs + text-muted Darstellung
- CustomDashboardView.vue: `WIDGET_DEFAULT_CONFIGS` Record mit Smart-Defaults pro Widget-Typ (z.B. line-chart: timeRange '1h', historical: timeRange '24h')
- CustomDashboardView.vue: Template-Auswahl UI im Layout-Dropdown (4 Templates via `dashStore.DASHBOARD_TEMPLATES`)
- MultiSensorChart.vue: `SENSOR_TYPE_CONFIG` Import, Y-Achse von hart `min`/`max` zu flexibel `suggestedMin`/`suggestedMax` (3-Tier: Props > SENSOR_TYPE_CONFIG > computedYRange)
- MultiSensorChart.vue: `sharedSensorTypeConfig` Computed — erkennt wenn alle Sensoren gleichen Typ haben, nutzt dann SENSOR_TYPE_CONFIG fuer Y-Achsen-Defaults
- WidgetConfigPanel.vue: `handleSensorChange()` auto-populate Threshold-Werte aus SENSOR_TYPE_CONFIG (warnLow/warnHigh bei 10% vom Rand, alarmLow/alarmHigh bei min/max)
- WidgetConfigPanel.vue: 4 Threshold-Inputfelder (Alarm Low/High, Warn Low/High) mit farbigen Labels, sichtbar wenn showThresholds aktiviert
- dashboard.store.ts: `DASHBOARD_TEMPLATES` Registry (4 Templates: zone-overview, sensor-detail, multi-sensor-compare, empty)
- dashboard.store.ts: `createLayoutFromTemplate(templateId, name?)` Funktion mit eindeutigen Widget-IDs (Index in ID gegen Kollision)
- Bugfix: Threshold auto-populate Check `!value` → `value == null` (Wert 0 ist valider Threshold, z.B. 0°C)
- Bugfix: Template Widget-ID Kollision bei synchronem `.map()` — Index im ID-String ergaenzt
- Bugfix: View-Modus Cursor `move` auf Widget-Header → `default` (nur im Edit-Modus `move`)
- Section 3: Neue Komponentenhierarchie (CustomDashboardView / Dashboard Editor) dokumentiert
- Section 5 Store-Tabelle: dashboard Store um DASHBOARD_TEMPLATES + createLayoutFromTemplate erweitert
- Section 13: "Neues Dashboard-Widget" Workflow auf CustomDashboardView + WIDGET_DEFAULT_CONFIGS aktualisiert

### Aenderungen in v9.9

- Router: `/custom-dashboard` umbenannt zu `/editor`, neuer optionaler Param `/editor/:dashboardId` (name: 'editor-dashboard')
- Router: `/logic/:ruleId` Route hinzugefuegt (name: 'logic-rule') — Deep-Link zu spezifischer Rule
- Router: `/monitor/:zoneId/sensor/:sensorId` Route hinzugefuegt (name: 'monitor-sensor') — Sensor-Detail L3 URL-basiert
- Router: Legacy-Redirects `/custom-dashboard` → `/editor` und `/sensor-history` → `/monitor`
- ViewTabBar.vue: Tab-Pfad `/custom-dashboard` → `/editor`, activeTab Computed erweitert
- Sidebar.vue: "Zeitreihen" Eintrag entfernt (veraltet, in Monitor L3 integriert), Dashboard Active-Check deckt `/editor` ab
- TopBar.vue: Breadcrumbs fuer Editor (Dashboard-Name), Logic (Rule-Name), Monitor L3 (Sensor-Name) hinzugefuegt
- dashboard.store.ts: breadcrumb ref erweitert um `sensorName`, `ruleName`, `dashboardName` (6 Felder statt 3)
- LogicView.vue: Deep-Link Support — `route.params.ruleId` lesen, `selectRule()` mit `router.replace()` URL-Sync, Breadcrumb-Update
- CustomDashboardView.vue: Deep-Link Support — `route.params.dashboardId` und Legacy `route.query.layout` konsumieren, Breadcrumb-Update
- MonitorView.vue: Sensor-Detail URL-Sync via `router.replace()` in `openSensorDetail()`/`closeSensorDetail()`, Deep-Link Watcher fuer sensorId
- MonitorView.vue: Cross-Link "Konfiguration" Button → `/sensors?sensor={espId}-gpio{gpio}`, alle `/custom-dashboard` Links → `/editor`
- SensorsView.vue: `?sensor={espId}-gpio{gpio}` bzw. `?focus=sensorId` — auto-open DeviceDetailPanel (volle Konfiguration nur in HardwareView)
- SensorsView.vue: Cross-Link "Live-Daten im Monitor anzeigen" Button → `/monitor/:zoneId`
- LinkedRulesSection.vue: Rule-Items klickbar mit `router.push({ name: 'logic-rule', params: { ruleId } })`, ExternalLink Icon mit Hover-Reveal
- HardwareView.vue: breadcrumb Objekt erweitert um `sensorName`, `ruleName`, `dashboardName`
- Sensor-ID-Format fuer URLs: `{espId}-gpio{gpio}` (z.B. "ESP_12AB34CD-gpio5")
- Section 10 (Router): Route-Struktur vollstaendig aktualisiert, Deep-Link-Pattern dokumentiert
- Komponentenhierarchien: SensorsView und MonitorView mit Cross-Links und URL-Sync aktualisiert

### Aenderungen in v9.8

- Neues Verzeichnis `components/devices/` (4 Dateien): SensorCard, ActuatorCard, DeviceMetadataSection, LinkedRulesSection
- SensorCard.vue: Unified Sensor-Card mit `mode: 'config' | 'monitor'` — ersetzt Inline-Cards in SensorsView UND MonitorView
- ActuatorCard.vue: Unified Actuator-Card mit Toggle in beiden Modi — ersetzt Inline-Cards in SensorsView UND MonitorView
- DeviceMetadataSection.vue: Formular fuer Geraete-Metadaten (3 Gruppen: Hersteller/Produkt, Installation/Wartung, Notizen) mit Wartungs-Ueberfaellig-Alert
- LinkedRulesSection.vue: Read-Only Anzeige verknuepfter Logic Rules per Sensor/Aktor (filtert logicStore.connections)
- SensorsView.vue: Monitoring-Elemente entfernt (Sparklines, Live-Werte, Quality-Dots, updatedSensorKeys, getQualityColor) — Inline-Cards durch SensorCard/ActuatorCard ersetzt
- MonitorView.vue: Inline-Cards durch SensorCard/ActuatorCard ersetzt, ~70 Zeilen ungenutztes CSS entfernt
- SensorConfigPanel.vue: 2 neue AccordionSections ("Geraete-Informationen" + "Verknuepfte Regeln") mit DeviceMetadataSection + LinkedRulesSection
- ActuatorConfigPanel.vue: Identisch zu SensorConfigPanel — 2 neue AccordionSections
- Neuer Type: `device-metadata.ts` — DeviceMetadata Interface + parseDeviceMetadata + mergeDeviceMetadata + getNextMaintenanceDate + isMaintenanceOverdue
- Neues Composable: `useDeviceMetadata.ts` — metadata ref, isDirty, loadFromRaw, toRawMetadata, updateField
- types/index.ts: Re-Exports fuer DeviceMetadata + Utility-Funktionen
- composables/index.ts: Re-Exports fuer useDeviceMetadata + useZoneGrouping
- Ordnerstruktur: components/ 13 → 18 Unterverzeichnisse, composables 18 → 20, types 4 → 7
- Komponentenhierarchien: SensorsView und MonitorView dokumentiert

### Aenderungen in v9.7

- dashboard.store.ts: statusCounts von ref() zu computed() umgebaut — nutzt getESPStatus() direkt, keine manuelle Zuweisung aus HardwareView mehr noetig
- HardwareView.vue: 30 Zeilen entfernt (4 Computeds onlineCount/offlineCount/warningCount/safeModeCount + watch-Block der dashStore.statusCounts schrieb)
- zone.store.ts: handleZoneAssignment() hat jetzt Toasts (zone_assigned, zone_removed, error) — identische Texte zu useZoneDragDrop.ts fuer 2s-Deduplication
- PendingDevicesPanel.vue: Status-Dot (8x8px, border-radius 50%) vor Status-Text in beiden Geraete-Listen (assigned + unassigned)
- Store-Architektur-Tabelle: dashboard und zone Stores dokumentiert

### Aenderungen in v9.6

- ESPSettingsSheet.vue: Custom SlideOver-Implementierung (Teleport+Transition+Overlay) ersetzt durch SlideOver-Primitive (shared/design/primitives/SlideOver.vue)
- ESPSettingsSheet.vue: Status-Anzeige von eigener `isOnline` Logik auf `useESPStatus()` Composable migriert (Dot + Text + Pulse)
- ESPSettingsSheet.vue: Inline SensorConfigPanel/ActuatorConfigPanel (AccordionSections) entfernt — durch klickbare Sensor/Actuator-Liste ersetzt
- ESPSettingsSheet.vue: Neue Emits `open-sensor-config` und `open-actuator-config` — HardwareView faengt Events und oeffnet separate SlideOvers
- ESPSettingsSheet.vue: Two-Step-Delete (showDeleteConfirm ref) ersetzt durch `uiStore.confirm()` (ConfirmDialog) + `useToast()` Feedback
- ESPSettingsSheet.vue: 1419 → 1341 Zeilen (Wrapper-Vereinfachung, Inline-Panels entfernt)
- HardwareView.vue: Neue Event-Handler `handleSensorConfigFromSheet()` und `handleActuatorConfigFromSheet()`
- HardwareView.vue: 1066 → 1316 Zeilen (neue Handler + parallele Block-2-Arbeit)
- Komponentenhierarchie (HardwareView): ESPSettingsSheet, SensorConfigPanel, ActuatorConfigPanel als SlideOver-Stack dokumentiert

### Aenderungen in v9.5

- ZonePlate.vue: `display: contents` auf device-wrapper entfernt — brach SortableJS Drag-Visuals (Element wurde verschoben, aber hatte keine CSS-Box)
- ZonePlate.vue: VueDraggable Template iteriert jetzt `localDevices` direkt statt verschachtelt `subzoneGroups` — fixes v-model/DOM-Kind Mismatch
- ZonePlate.vue: VueDraggable animation 0 → 150 fuer visuelles Reorder-Feedback
- UnassignedDropBar.vue: `@start`/`@end` Events + dragStore Integration hinzugefuegt — ZonePlates zeigen Drop-Target-Visuals beim Drag aus der Leiste
- Section 12 (Drag & Drop): VueDraggable-Regeln dokumentiert (display:contents Verbot, v-model/Template Konsistenz, force-fallback Pflicht)
- Section 12: Zone-Removal Flow (Zone → UnassignedDropBar) als separater Flow dokumentiert
- Section 12: Dual-System Tabelle erweitert um Unassigned-Drag Flow

### Aenderungen in v9.4

- HardwareView Level 1 Redesign (Zone Accordion) — 4-Block Implementierung
- sensorDefaults.ts: Labels gekuerzt ("Temperatur (DS18B20)" → "Temperatur"), Units normalisiert ("% RH" → "%RH")
- sensorDefaults.ts: 3 neue Aggregation-Funktionen (groupSensorsByBaseType, aggregateZoneSensors, formatAggregatedValue)
- sensorDefaults.ts: 4 neue Types (RawSensor, GroupedSensor, ZoneAggregation, AggCategory)
- DeviceMiniCard.vue: Sensor-Display nutzt groupSensorsByBaseType (Multi-Value-Aufloesung), Spark-Bars entfernt, Quality-Textfarbe
- DeviceMiniCard.vue: "Oeffnen"-Button entfernt → ChevronRight-Hint + MoreVertical drill-down
- ZonePlate.vue: Aggregierte Sensorwerte im Zone-Header, farbiger Status-Dot (8px), Subzone-Chips mit Filter
- ZonePlate.vue: EmptyState-Pattern (PackageOpen) fuer leere Zonen, getESPStatus fuer online-Zaehlung
- HardwareView.vue: Zone-Sortierung (offline/warning → online → leer → alphabetisch)
- HardwareView.vue: localStorage-Persistenz fuer Accordion-Zustand, Smart Defaults (≤4 alle offen, >4 nur erste)
- UnassignedDropBar.vue: Badge SIM/HW → nur MOCK (kein Badge fuer echte Devices), Sensor-Summary statt Count

### Aenderungen in v9.3

- esp.ts Store: onlineDevices/offlineDevices nutzen jetzt getESPStatus() statt einfacher status/connected Checks (Heartbeat-Timing-Fallback, stale=online)
- DeviceMiniCard.vue: Stale-Daten-Visualisierung via getESPStatus — graue Sparkbars, "Zuletzt vor X Min." Label, CSS-Klasse device-mini-card--stale
- useESPStatus ist jetzt Single Source of Truth fuer Status in Store UND Komponenten (nicht nur Komponenten)

### Aenderungen in v9.2

- Composables Expansion: 16 → 18 (neu: useESPStatus, useOrbitalDragDrop)
- useESPStatus: Single source of truth fuer ESP-Status (composable + pure functions getESPStatus/getESPStatusDisplay)
- useOrbitalDragDrop: DnD-Logik aus ESPOrbitalLayout extrahiert (250 Zeilen)
- ESPOrbitalLayout.vue: 655 → 410 Zeilen (DnD-Handler + Analysis-Auto-Open + Modal-Watchers in Composable)
- ESPCardBase.vue: Neue Base-Komponente (4 Varianten: mini/compact/standard/full)
- dashboard.store.ts: deviceCounts Fix (dead ref → computed)
- forms.css: Neues Shared CSS fuer Form/Modal Styles, doppelte BEM-Button-Definitionen entfernt
- tokens.css: 3 neue semantische Aliase (--color-text-inverse, --color-border, --color-surface-hover)
- ESPCard.vue + ESPHealthWidget.vue: Status-Logik auf useESPStatus migriert
- Styles: 5 → 6 CSS Dateien (forms.css hinzugefuegt)
- esp/ Components: 10 → 11 (ESPCardBase.vue hinzugefuegt)

### Aenderungen in v9.1

- Settings-Panel Modernisierung (Block B): Three-Zone-Pattern fuer SensorConfigPanel + ActuatorConfigPanel
- Neue Design Primitive: AccordionSection.vue (localStorage-Persistenz, CSS grid-template-rows Animation)
- ESPSettingsSheet.vue: Status-Details, Sensor/Aktor-Config, Mock-Controls als Accordion-Sektionen
- AddSensorModal.vue: Sensor-Type-Aware Summary (SHT31 → "auf I2C 0x44, misst Temperatur + Luftfeuchtigkeit, alle 30s")
- sensorDefaults.ts: Neues Feld defaultIntervalSeconds, neue Funktionen getDefaultInterval(), getSensorTypeAwareSummary()
- Primitives: 9 → 10 (AccordionSection), Barrel Exports: 20 → 21

### Aenderungen in v9.0

- Dashboard-Merge (cursor/dashboard-neue-struktur): 5 neue Views (CustomDashboard, Hardware, Monitor, Calibration, LoadTest)
- Shared Stores Expansion: 4 → 12 (actuator, auth, config, dashboard, database, dragState, gpio, logic, notification, sensor, ui, zone)
- Original stores/ konsolidiert: 5 → 1 (nur esp.ts verbleibt, Rest nach shared/stores/ migriert)
- Composables Expansion: 8 → 16 (neu: useCalibration, useCommandPalette, useContextMenu, useDeviceActions, useGrafana, useKeyboardShortcuts, useScrollLock, useSwipeNavigation)
- Neue Pakete: gridstack (Dashboard Builder), chartjs-plugin-annotation (Threshold-Linien), @vue-flow/core (Rule Editor)
- dashboard.store.ts: Exportierte Types WidgetType, DashboardWidget, DashboardLayout
- Component Count: 97 → 129 .vue, Views: 11 → 16, Stores: 9 → 13, Composables: 8 → 16
- 20 TypeScript-Fehler gefixt nach Merge (API-Type-Mismatches, ComputedRef-Calls, unused Imports)

### Aenderungen in v8.0

- Design System: `shared/design/` mit primitives/ (9), layout/ (3), patterns/ (3)
- Shared Stores: `shared/stores/` (auth, database, dragState, logic)
- Styles: `styles/` (tokens.css, glass.css, animations.css, main.css, tailwind.css)
- Rules Components: `components/rules/` (RuleCard, RuleConfigPanel, RuleFlowEditor, RuleNodePalette, RuleTemplateCard)
- Component Count: 67 → 97 .vue, Stores: 5 → 9 (5 original + 4 shared)
- Ordnerstruktur (Section 2) vollstaendig aktualisiert

### Aenderungen in v7.1

- Test-Stack hinzugefuegt: vitest, @vue/test-utils, jsdom, msw, @vitest/coverage-v8
- Test-Scripts dokumentiert: npm test, test:watch, test:coverage
- Test-Ordnerstruktur (tests/) in Section 2 ergaenzt
- Unit Tests Status in Bekannte Luecken aktualisiert (5 Files, 250 Tests)

### Aenderungen in v7.0

- Projekt-Setup Section mit Tech-Stack Details
- Component-Entwicklung Checkliste und Hierarchie
- Type-System detaillierte Tabellen
- Store-Architektur Uebersicht
- Server-Verbindung erweitert
- Drag & Drop System dokumentiert
- Farbsystem & Design komplett
- Bekannte Luecken dokumentiert
- Entwicklungs-Workflows hinzugefuegt
- Make-Targets dokumentiert
