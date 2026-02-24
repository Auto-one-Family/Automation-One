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

**Version:** 9.0
**Letzte Aktualisierung:** 2026-02-23
**Zweck:** Massgebliche Referenz fuer Frontend-Entwicklung (Vue 3 + TypeScript + Vite + Pinia + Tailwind)
**Codebase:** `El Frontend/src/` (~10.000+ Zeilen TypeScript/Vue, 129 .vue Komponenten)

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
├── components/    # Vue Komponenten (13 Unterverzeichnisse)
│   ├── common/        # Modal, Toast, Skeleton (13 Dateien)
│   ├── layout/        # MainLayout, AppHeader, AppSidebar
│   ├── dashboard/     # Dashboard subcomponents (9 Dateien)
│   ├── esp/           # ESPCard, ESPOrbitalLayout (10 Dateien)
│   ├── zones/         # ZoneGroup, ZoneAssignmentPanel
│   ├── charts/        # MultiSensorChart
│   ├── system-monitor/ # 18 Dateien
│   ├── filters/       # UnifiedFilterBar
│   ├── modals/
│   ├── rules/         # RuleConfigPanel, RuleFlowEditor, RuleNodePalette (3 Dateien)
│   ├── error/         # ErrorDetailsModal, TroubleshootingPanel
│   ├── database/      # DataTable, FilterPanel, Pagination, etc. (6 Dateien)
│   └── safety/        # EmergencyStopButton
├── shared/        # Design System + Shared Stores (NEU)
│   ├── design/
│   │   ├── primitives/  # 9 Base-Komponenten (BaseBadge, BaseButton, BaseCard, etc.)
│   │   ├── layout/      # AppShell, Sidebar, TopBar (3 Dateien)
│   │   └── patterns/    # EmptyState, ErrorState, ToastContainer (3 Dateien)
│   └── stores/          # 12 Shared Stores (actuator, auth, config, dashboard, database, dragState, gpio, logic, notification, sensor, ui, zone)
├── styles/        # CSS Design Tokens (NEU)
│   ├── tokens.css       # Design Token Definitionen
│   ├── glass.css        # Glassmorphism Klassen
│   ├── animations.css   # Animationen
│   ├── main.css         # Hauptstyles
│   └── tailwind.css     # Tailwind Konfiguration
├── composables/   # 16 Composables
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
│   ├── useDeviceActions.ts
│   ├── useGrafana.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useScrollLock.ts
│   └── useZoomNavigation.ts
├── router/        # Route-Definitionen + Guards
├── services/      # WebSocket Singleton
│   └── websocket.ts   # ~625 Zeilen
├── stores/        # 1 Pinia Store (Legacy, ESP-spezifisch)
│   └── esp.ts         # ~2500 Zeilen
├── types/         # 4 Type-Dateien (~2106 Zeilen)
│   ├── index.ts           # ~979 Zeilen
│   ├── websocket-events.ts # ~748 Zeilen
│   ├── logic.ts
│   └── gpio.ts
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
└── ESPSettingsPopover.vue (floating)
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

- LogicRule: Conditions + Actions + Cooldown
- SensorCondition: Vergleichsoperatoren + between
- ActuatorAction: ON/OFF/PWM/TOGGLE + Duration

### GPIO Types (types/gpio.ts)

- GpioUsageItem: Pin-Belegung
- GpioStatusResponse: Freie/Belegte/System-Pins

---

## 5. State Management (Pinia)

### Store-Architektur

| Store | Datei | State | Wichtigste Actions |
|-------|-------|-------|-------------------|
| auth | stores/auth.ts | user, tokens, setupRequired | login, logout, refreshTokens |
| esp | stores/esp.ts | devices[], pendingDevices[] | fetchAll, isMock, gpioStatusMap |
| logic | stores/logic.ts | rules[], activeExecutions | fetchRules, toggleRule, crossEspConnections |
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

### formatters.ts (~631 Zeilen)

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
  label: string      // "Temperatur (DS18B20)"
  unit: string       // "°C"
  min: number        // 0
  max: number        // 100
  decimals: number   // 1
  icon: string       // "Thermometer"
  defaultValue: number
  category: SensorCategoryId
}>

// Helper Functions
getSensorUnit(type): string
getSensorLabel(type): string
getSensorDefault(type): number
isValidSensorValue(type, value): boolean
```

---

## 10. Router & Navigation

### Route-Struktur

```typescript
// Public Routes
'/login'  → LoginView.vue
'/setup'  → SetupView.vue

// Protected Routes (requiresAuth: true)
'/'               → DashboardView.vue (?openSettings={id})
'/sensors'        → SensorsView.vue (Tabs: Sensoren | Aktoren)
'/logic'          → LogicView.vue
'/settings'       → SettingsView.vue

// Admin Routes (requiresAdmin: true)
'/system-monitor' → SystemMonitorView.vue
'/users'          → UserManagementView.vue
'/system-config'  → SystemConfigView.vue
'/load-test'      → LoadTestView.vue
'/maintenance'    → MaintenanceView.vue

// Deprecated Redirects
'/devices'   → '/'
'/database'  → '/system-monitor?tab=database'
'/logs'      → '/system-monitor?tab=logs'
'/audit'     → '/system-monitor?tab=events'
'/mqtt-log'  → '/system-monitor?tab=mqtt'
'/actuators' → '/sensors?tab=actuators'
```

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
| Zone-Drag | VueDraggable | ESP-Card | Andere Zone |
| Sensor-Drag | Native HTML5 | SensorSatellite | Chart-Panel |
| Component-Drag | Native HTML5 | Sidebar-Item | ESP-Card |

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

### Zone-Assignment Flow

```
1. VueDraggable @add Event
   └─> ZoneGroup.vue emits 'device-dropped'

2. View: onDeviceDropped(event)
   └─> useZoneDragDrop Composable

3. API: zonesApi.assignZone(deviceId, {zone_id, zone_name})
   └─> POST /api/v1/zone/devices/{id}/assign

4. Server: DB Update + MQTT Publish

5. ESP32: Speichert in NVS, sendet ACK

6. Server: Empfaengt ACK, broadcastet WebSocket

7. Frontend: espStore.fetchAll() → UI aktualisiert
   └─> History-Push (fuer Undo, max 20 Eintraege)
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

1. Komponente in `components/dashboard/` erstellen
2. In `DashboardView.vue` einbinden
3. CSS: Tailwind + `glass-panel` fuer Konsistenz
4. Daten aus Store beziehen (nicht direkt API)

### Feature mit Settings

1. Setting-UI in `SettingsView.vue` oder `ESPSettingsPopover`
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
| ESPOrbitalLayout | Name irrefuehrend | Ist 3-Spalten Grid, NICHT orbital |

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

**Version:** 9.0
**Letzte Aktualisierung:** 2026-02-23

### Aenderungen in v9.0

- Dashboard-Merge (cursor/dashboard-neue-struktur): 5 neue Views (CustomDashboard, Hardware, Monitor, Calibration, LoadTest)
- Shared Stores Expansion: 4 → 12 (actuator, auth, config, dashboard, database, dragState, gpio, logic, notification, sensor, ui, zone)
- Original stores/ konsolidiert: 5 → 1 (nur esp.ts verbleibt, Rest nach shared/stores/ migriert)
- Composables Expansion: 8 → 16 (neu: useCalibration, useCommandPalette, useContextMenu, useDeviceActions, useGrafana, useKeyboardShortcuts, useScrollLock, useZoomNavigation)
- Neue Pakete: gridstack (Dashboard Builder), chartjs-plugin-annotation (Threshold-Linien), @vue-flow/core (Rule Editor)
- dashboard.store.ts: Exportierte Types WidgetType, DashboardWidget, DashboardLayout
- Component Count: 97 → 129 .vue, Views: 11 → 16, Stores: 9 → 13, Composables: 8 → 16
- 20 TypeScript-Fehler gefixt nach Merge (API-Type-Mismatches, ComputedRef-Calls, unused Imports)

### Aenderungen in v8.0

- Design System: `shared/design/` mit primitives/ (9), layout/ (3), patterns/ (3)
- Shared Stores: `shared/stores/` (auth, database, dragState, logic)
- Styles: `styles/` (tokens.css, glass.css, animations.css, main.css, tailwind.css)
- Rules Components: `components/rules/` (RuleConfigPanel, RuleFlowEditor, RuleNodePalette)
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
