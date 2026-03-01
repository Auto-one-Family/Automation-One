---
name: frontend-development
description: |
  El Frontend Vue 3 Dashboard Entwicklung fuer AutomationOne IoT-Framework.
  Verwenden bei: Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, Axios,
  WebSocket, Dashboard, ESP-Card, Sensor-Satellite, Actuator-Satellite,
  Zone-Management, Drag-Drop, System-Monitor, Database-Explorer, Log-Viewer,
  Audit-Log, MQTT-Traffic, Composables, useWebSocket, useToast, useModal,
  useQueryFilters, useGpioStatus, useZoneDragDrop, Pinia-Stores, auth-store,
  esp-store, logic-store, formatters, sensorDefaults, actuatorDefaults,
  Mock-ESP, PendingDevices, GPIO-Status, MainLayout, AppSidebar, Router,
  Navigation-Guards, Token-Refresh, JWT-Auth, REST-API-Client.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# El Frontend - KI-Agenten Dokumentation

**Version:** 9.13
**Letzte Aktualisierung:** 2026-03-01
**Zweck:** Massgebliche Referenz fuer Frontend-Entwicklung (Vue 3 + TypeScript + Vite + Pinia + Tailwind)
**Codebase:** `El Frontend/src/` (~10.000+ Zeilen TypeScript/Vue, 143 .vue Komponenten)

> **Server-Dokumentation:** Siehe `.claude/skills/server-development/SKILL.md`
> **ESP32-Firmware:** Siehe `.claude/skills/esp32-development/SKILL.md`

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primaere Quelle | Code-Location |
|-------------|-----------------|---------------|
| **Server + Frontend starten** | `make dev` oder Docker | - |
| **API-Endpoint finden** | `.claude/reference/api/REST_ENDPOINTS.md` | ~170 Endpoints |
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
├── api/           # 16 API-Module
│   ├── index.ts       # Axios Instance + Interceptors (~89 Zeilen)
│   ├── auth.ts        # Login, Logout, Token Refresh
│   ├── esp.ts         # ESP Device Management
│   ├── sensors.ts     # Sensor CRUD + History
│   ├── actuators.ts   # Actuator Commands
│   ├── zones.ts       # Zone Assignment
│   ├── logic.ts       # Automation Rules
│   └── ...
├── components/    # Vue Komponenten (18 Unterverzeichnisse)
│   ├── calibration/   # CalibrationWizard
│   ├── charts/        # LiveLineChart, HistoricalChart, GaugeChart, MultiSensorChart
│   ├── command/       # CommandPalette
│   ├── common/        # Modal, Toast, Skeleton, ViewTabBar (13 Dateien)
│   ├── dashboard/     # Dashboard subcomponents (11 Dateien, inkl. DashboardViewer + InlineDashboardPanel)
│   ├── dashboard-widgets/ # SensorCardWidget, GaugeWidget, LineChartWidget, etc.
│   ├── database/      # DataTable, FilterPanel, Pagination, etc. (6 Dateien)
│   ├── devices/       # SensorCard, ActuatorCard, DeviceMetadataSection, LinkedRulesSection (4 Dateien)
│   ├── error/         # ErrorDetailsModal, TroubleshootingPanel
│   ├── esp/           # ESPCard, ESPCardBase, ESPOrbitalLayout, SensorConfigPanel, ActuatorConfigPanel (11 Dateien)
│   ├── filters/       # UnifiedFilterBar
│   ├── forms/         # FormBuilder
│   ├── modals/
│   ├── rules/         # RuleCard, RuleConfigPanel, RuleFlowEditor, RuleNodePalette, RuleTemplateCard (5 Dateien)
│   ├── safety/        # EmergencyStopButton
│   ├── system-monitor/ # 18 Dateien
│   ├── widgets/       # Widget primitives
│   └── zones/         # ZoneGroup, ZoneAssignmentPanel
├── shared/        # Design System + Shared Stores (NEU)
│   ├── design/
│   │   ├── primitives/  # 13 Komponenten (10 Base + AccordionSection + QualityIndicator + RangeSlider + SlideOver)
│   │   ├── layout/      # AppShell, Sidebar, TopBar (3 Dateien)
│   │   └── patterns/    # ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer (5 Dateien)
│   └── stores/          # 12 Shared Stores (actuator, auth, config, dashboard, database, dragState, gpio, logic, notification, sensor, ui, zone)
├── styles/        # CSS Design Tokens + Shared Styles (6 Dateien)
│   ├── tokens.css       # Design Token Definitionen
│   ├── glass.css        # Glassmorphism Klassen
│   ├── animations.css   # Animationen
│   ├── main.css         # Hauptstyles (Buttons, Layout)
│   ├── forms.css        # Shared Form + Modal Styles
│   └── tailwind.css     # Tailwind Konfiguration
├── composables/   # 21 Composables
│   ├── useWebSocket.ts
│   ├── useToast.ts
│   ├── useModal.ts
│   ├── useQueryFilters.ts
│   ├── useGpioStatus.ts
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
│   ├── useOrbitalDragDrop.ts
│   ├── useScrollLock.ts
│   ├── useSparklineCache.ts
│   └── useZoneGrouping.ts
├── router/        # Route-Definitionen + Guards
├── services/      # WebSocket Singleton
│   └── websocket.ts   # ~625 Zeilen
├── stores/        # 1 Pinia Store (Legacy, ESP-spezifisch)
│   └── esp.ts         # ~2500 Zeilen
├── types/         # 7 Type-Dateien
│   ├── index.ts           # ~979 Zeilen (Re-Exports)
│   ├── websocket-events.ts # ~748 Zeilen
│   ├── logic.ts
│   ├── gpio.ts
│   ├── device-metadata.ts  # DeviceMetadata Interface + Utility-Funktionen
│   ├── event-grouping.ts
│   └── form-schema.ts
├── utils/         # 9 Utility-Module
│   ├── formatters.ts      # ~631 Zeilen
│   ├── labels.ts
│   ├── sensorDefaults.ts
│   ├── actuatorDefaults.ts
│   ├── errorCodeTranslator.ts
│   └── ...
├── views/         # 16 View-Komponenten
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
├── ESPSettingsSheet.vue (SlideOver, ESP-Detail: Status, Sensor/Actuator-Liste, Delete)
├── SensorConfigPanel.vue (SlideOver, via ESPSettingsSheet Event)
└── ActuatorConfigPanel.vue (SlideOver, via ESPSettingsSheet Event)
```

### Komponentenhierarchie (SensorsView / Komponenten-Tab)

```
SensorsView.vue (?sensor={espId}-gpio{gpio} → auto-open SensorConfigPanel)
├── Tab-Navigation (Sensors/Actuators)
├── Filter (ESP ID, Sensor Type, Quality, Actuator Type, State)
├── Zone-Accordion → Subzone-Accordion
│   ├── SensorCard.vue[] (mode='config', from components/devices/)
│   └── ActuatorCard.vue[] (mode='config', from components/devices/)
├── Subzone CRUD (erstellen, umbenennen, loeschen)
├── SlideOver
│   ├── SensorConfigPanel.vue (AccordionSections + DeviceMetadataSection + LinkedRulesSection)
│   │   └── Cross-Link: "Live-Daten im Monitor anzeigen" → /monitor/:zoneId
│   └── ActuatorConfigPanel.vue (AccordionSections + DeviceMetadataSection + LinkedRulesSection)
└── EmergencyStopButton.vue
```

### Komponentenhierarchie (MonitorView / Live-Monitoring)

```
MonitorView.vue (URL-Sync: L1→L2→L3 via route params)
├── L1 /monitor — Zone-Tiles mit KPI-Aggregation + Cross-Zone-Dashboards
├── L2 /monitor/:zoneId — Subzone-Accordion (KPIs im Header, Status-Dots)
│   ├── Zone-Header: Name + Sensor/Aktor-Count + Alarm-Count
│   ├── Auto-generierte Zone-Dashboards (generateZoneDashboard bei erstem Besuch)
│   ├── SensorCard.vue[] (mode='monitor', Stale/ESP-Offline-Badges, from components/devices/)
│   │   └── [Expanded] 1h-Chart (vue-chartjs Line, sensorsApi.queryData Initial-Fetch)
│   │       ├── "Zeitreihe anzeigen" → openSensorDetail (L3)
│   │       └── "Konfiguration" → /sensors?sensor={espId}-gpio{gpio}
│   └── ActuatorCard.vue[] (mode='monitor', from components/devices/)
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
| MockSensor | 234-263 | Sensor mit Multi-Value Support |
| MockActuator | 265-273 | Actuator mit PWM |
| QualityLevel | - | 'excellent' \| 'good' \| 'fair' \| 'poor' \| 'bad' \| 'stale' \| 'error' |
| MockSystemState | - | 12 States: BOOT, WIFI_SETUP, WIFI_CONNECTED, MQTT_CONNECTING, MQTT_CONNECTED, AWAITING_USER_CONFIG, ZONE_CONFIGURED, SENSORS_CONFIGURED, OPERATIONAL, LIBRARY_DOWNLOADING, SAFE_MODE, ERROR |

### WebSocket Events (types/websocket-events.ts)

| Event | Data | Woher |
|-------|------|-------|
| sensor_data | esp_id, gpio, value, quality | MQTT→Server→WS |
| actuator_status | esp_id, gpio, state | MQTT→Server→WS |
| esp_health | esp_id, status, heap, rssi | Heartbeat→Server→WS |
| config_response | esp_id, status, error_code | ESP→MQTT→Server→WS |
| device_discovered | esp_id, hardware_type | Auto-Discovery |
| error_event | esp_id, error_code, troubleshooting | ESP→Server→WS |
| server_log | level, message, exception | Server intern |

**WICHTIG:** Type-Aenderungen IMMER mit Server-Team abstimmen!
WebSocket-Events = Kontrakt zwischen Frontend und Backend.

### Logic Types (types/logic.ts)

- LogicRule: Conditions + Actions + Cooldown + logic_operator (AND/OR)
- SensorCondition: Vergleichsoperatoren (>, <, >=, <=, ==, !=, between)
- TimeCondition: start_hour, end_hour, days_of_week (0=Monday, 6=Sunday — ISO 8601 / Python weekday())
- HysteresisCondition: activate_above/deactivate_below
- CompoundCondition: Nested AND/OR conditions
- ActuatorAction: ON/OFF/PWM/TOGGLE + Duration
- NotificationAction: channel + target + message_template
- DelayAction: seconds
- ExecutionHistoryItem: rule_id, rule_name, triggered_at, trigger_reason, actions_executed, success, error_message?, execution_time_ms
- LogicConnection: ruleId, sourceEspId/Gpio, targetEspId/Gpio, isCrossEsp

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
| dashboard | stores/dashboard.store.ts | statusCounts (computed via getESPStatus), deviceCounts, filters, breadcrumb (level, zoneName, deviceName, sensorName, ruleName, dashboardName), layouts[], DASHBOARD_TEMPLATES, DashboardTarget (interface), inlineMonitorPanels (computed), sideMonitorPanels (computed), hardwarePanels (computed) | toggleStatusFilter, resetFilters, createLayout, saveLayout, createLayoutFromTemplate, deleteLayout, exportLayout, importLayout, setLayoutTarget, generateZoneDashboard, claimAutoLayout |
| zone | stores/zone.store.ts | (stateless) | handleZoneAssignment (+ Toasts), handleSubzoneAssignment (+ Toasts) |
| logic | stores/logic.ts | rules[], activeExecutions, executionHistory[], historyLoaded | fetchRules, toggleRule, crossEspConnections, loadExecutionHistory, pushToHistory, undo, redo, canUndo, canRedo |
| dragState | stores/dragState.ts | isDragging* flags, payloads | start/endDrag, 30s timeout |
| database | stores/database.ts | tables, currentData, queryParams | loadTables, selectTable, refreshData |

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
| `zones.ts` | `/zone/*` | Zone Assignment/Removal |
| `subzones.ts` | `/subzone/*` | Subzone CRUD + Safe-Mode |
| `logic.ts` | `/logic/*` | Cross-ESP Automation Rules |
| `debug.ts` | `/debug/*` | Mock ESP Simulation |
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
| formatRelativeTime(date) | "vor 5 Minuten" |

### labels.ts

Zentrale deutsche Labels:

```typescript
QUALITY_LABELS: { excellent: "Ausgezeichnet", good: "Gut", ... }
STATE_LABELS: { OPERATIONAL: "Betriebsbereit", ... }
ACTUATOR_TYPE_LABELS: { relay: "Relais", pump: "Pumpe", ... }
```

### errorCodeTranslator.ts

Error-Codes (1xxx-5xxx) → Deutsche Beschreibungen

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

// Aggregation Functions (NEU v9.4)
groupSensorsByBaseType(sensors: RawSensor[]): GroupedSensor[]
  // Gruppiert Raw-Sensoren nach Basistyp (SHT31 → temp+humidity)
aggregateZoneSensors(devices: {sensors}[]): ZoneAggregation
  // Zone-weite Mittelwerte pro Kategorie (Klima, Wasser, Licht, System)
formatAggregatedValue(agg: ZoneAggregation, cat: AggCategory): string
  // Display-Formatierung mit Ø-Prefix bei Multi-Device Zonen

// Types (NEU v9.4)
type RawSensor = { type: string; raw_value: number | null; quality: string }
type GroupedSensor = { label: string; value: string; unit: string; valueColor: string }
type ZoneAggregation = Record<AggCategory, { avg: number; count: number; unit: string; quality: string }>
type AggCategory = 'climate' | 'water' | 'light' | 'system'
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
'/system-monitor' → SystemMonitorView.vue
'/users'          → UserManagementView.vue
'/system-config'  → SystemConfigView.vue
'/load-test'      → LoadTestView.vue
'/maintenance'    → MaintenanceView.vue

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

### Neue Route hinzufuegen

1. View-Komponente in `src/views/`
2. Route in `router/index.ts` mit `meta: { requiresAuth, requiresAdmin?, title }`
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
| **Datenfluesse** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | System-Kommunikation |
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | Backend-Kommunikation |

---

## Versions-Historie

**Version:** 9.13
**Letzte Aktualisierung:** 2026-03-01

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
- SensorsView.vue: `?sensor={espId}-gpio{gpio}` Query-Param Deep-Link — auto-open SensorConfigPanel
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
