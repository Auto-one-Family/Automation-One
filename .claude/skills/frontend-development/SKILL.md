---
name: frontend-development
description: |
  El Frontend Vue 3 Dashboard Entwicklung für AutomationOne IoT-Framework.
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

**Version:** 6.1 (SKILL.md Format)
**Letzte Aktualisierung:** 2026-02-01
**Zweck:** Maßgebliche Referenz für Frontend-Entwicklung (Vue 3 + TypeScript + Vite + Pinia + Tailwind)
**Codebase:** `El Frontend/src/` (~8.000+ Zeilen TypeScript/Vue)

> **📖 Server-Dokumentation:** Siehe `.claude/skills/server-development/SKILL.md`
> **📖 ESP32-Firmware:** Siehe `.claude/skills/esp32-development/SKILL.md`
> **🛠️ Service-Management:** Siehe `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Server + Frontend starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0 | - |
| **Services stoppen/neu starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.3 | - |
| **Server-Logs prüfen** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.5 | - |
| **Bug debuggen** | `El Frontend/Docs/Bugs_and_Phases/` | Nach Phasen sortiert |
| **API-Endpoint finden** | `.claude/reference/api/REST_ENDPOINTS.md` | ~170 Endpoints dokumentiert |
| **WebSocket verstehen** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Alle Events mit Payloads |
| **Zone zuweisen** | [Section 7: Zone Management](#7-zone-management) | `src/components/zones/` |
| **ESP-Gerät verwalten** | [Section 3: ESP Store](#3-state-management-pinia-stores) | `src/stores/esp.ts` |
| **System Monitor** | [Section 5.1: System Monitor](#51-system-monitor-view--tabs) | `src/views/SystemMonitorView.vue` |
| **Komponente finden** | [Section 1: Ordnerstruktur](#1-ordnerstruktur) | `src/components/` |
| **Error-Codes verstehen** | `.claude/reference/errors/ERROR_CODES.md` | ESP32 + Server Codes |
| **Datenflüsse verstehen** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Frontend↔Server↔ESP32 |

---

## 1. Ordnerstruktur

```
El Frontend/src/
├── api/                      # HTTP API Clients (16 Dateien)
│   ├── index.ts              # Axios-Instanz, Interceptors, Token-Refresh
│   ├── auth.ts               # Login, Logout, Setup, Refresh, Me
│   ├── esp.ts                # ⭐ Unified ESP API (Mock + Real)
│   ├── sensors.ts            # Sensor CRUD + History + Stats
│   ├── actuators.ts          # Actuator Control
│   ├── zones.ts              # Zone Assignment
│   ├── subzones.ts           # Subzone Management
│   ├── logic.ts              # Cross-ESP Automation Rules
│   ├── debug.ts              # Mock ESP Simulation
│   ├── audit.ts              # Audit Log Query + Stats
│   ├── config.ts             # System Configuration
│   ├── database.ts           # Database Explorer
│   ├── logs.ts               # ⭐ Log Viewer + Log-Management
│   ├── loadtest.ts           # Load Testing
│   └── users.ts              # User Management
│
├── components/               # Vue 3 Komponenten (12 Unterordner)
│   ├── common/               # ⭐ Wiederverwendbare UI-Bausteine (13 Dateien)
│   │   ├── Button.vue, Input.vue, Select.vue, Toggle.vue
│   │   ├── Badge.vue, Card.vue, Modal.vue, Spinner.vue
│   │   ├── LoadingState.vue, EmptyState.vue, ErrorState.vue
│   │   ├── ToastContainer.vue
│   │   └── index.ts          # Re-Exports (ohne ToastContainer)
│   │
│   ├── layout/               # App Layout (3 Dateien)
│   │   ├── MainLayout.vue    # Haupt-Layout mit Sidebar
│   │   ├── AppHeader.vue     # Top Header
│   │   └── AppSidebar.vue    # Seitenleiste Navigation
│   │
│   ├── dashboard/            # Dashboard-spezifisch (9 Dateien)
│   │   ├── StatCard.vue      # KPI-Kacheln
│   │   ├── ActionBar.vue     # Top Action Bar
│   │   ├── SensorSidebar.vue # Sensor-Kategorien Sidebar
│   │   ├── ActuatorSidebar.vue # Aktor-Kategorien Sidebar
│   │   ├── ComponentSidebar.vue # Kombinierte Sidebar
│   │   ├── StatusPill.vue, UnassignedDropBar.vue
│   │   ├── CrossEspConnectionOverlay.vue
│   │   └── index.ts
│   │
│   ├── esp/                  # ESP Device Darstellung (10 Dateien)
│   │   ├── ESPCard.vue       # ⭐ Device Card (Status, Health)
│   │   ├── ESPOrbitalLayout.vue # Orbital-Layout für Sensoren
│   │   ├── SensorSatellite.vue # Sensor im Orbital-Layout
│   │   ├── ActuatorSatellite.vue # Actuator im Orbital-Layout
│   │   ├── SensorValueCard.vue # Sensor-Wert Display
│   │   ├── ConnectionLines.vue # Logic-Rule Verbindungslinien
│   │   ├── AnalysisDropZone.vue
│   │   ├── ESPSettingsPopover.vue # ESP-Einstellungen
│   │   ├── GpioPicker.vue    # GPIO-Pin-Auswahl
│   │   ├── PendingDevicesPanel.vue # Pending Devices
│   │   └── index.ts
│   │
│   ├── database/             # Database Explorer (6 Dateien)
│   │   ├── DataTable.vue, FilterPanel.vue, Pagination.vue
│   │   ├── RecordDetailModal.vue, SchemaInfoPanel.vue
│   │   └── TableSelector.vue
│   │
│   ├── zones/                # Zone Management (2 Dateien)
│   │   ├── ZoneAssignmentPanel.vue # ⭐ Zone-Zuweisung
│   │   └── ZoneGroup.vue     # Drag & Drop Container
│   │
│   ├── charts/               # Chart-Komponenten
│   │   └── MultiSensorChart.vue
│   │
│   ├── filters/              # ⭐ Filter-Komponenten
│   │   ├── UnifiedFilterBar.vue # Wiederverwendbare Filter-Leiste
│   │   └── index.ts
│   │
│   ├── system-monitor/       # ⭐ System Monitor (18 Dateien)
│   │   ├── MonitorTabs.vue   # Tab-Leiste + Live-Toggle
│   │   ├── MonitorFilterPanel.vue # Filter
│   │   ├── UnifiedEventList.vue # Ereignisliste
│   │   ├── EventDetailsPanel.vue # Detail mit Fehlercode
│   │   ├── EventsTab.vue, ServerLogsTab.vue
│   │   ├── DatabaseTab.vue, MqttTrafficTab.vue
│   │   ├── LogManagementPanel.vue, CleanupPanel.vue
│   │   ├── CleanupPreview.vue, DataSourceSelector.vue
│   │   ├── AutoCleanupStatusBanner.vue
│   │   ├── PreviewEventCard.vue, RssiIndicator.vue
│   │   └── index.ts
│   │
│   └── modals/
│       └── CreateMockEspModal.vue
│
├── composables/              # Vue 3 Composables (9 Dateien)
│   ├── useWebSocket.ts       # ⭐ WebSocket Integration
│   ├── useToast.ts           # Toast Notifications (Singleton)
│   ├── useModal.ts           # Modal State Management
│   ├── useSwipeNavigation.ts # Mobile Swipe Gesten
│   ├── useZoneDragDrop.ts    # Zone Drag & Drop Logic
│   ├── useConfigResponse.ts  # Config Response Handler
│   ├── useQueryFilters.ts    # ⭐ URL↔Filter-Sync
│   ├── useGpioStatus.ts      # ⭐ GPIO-Status pro ESP
│   └── index.ts
│
├── services/                 # Singleton Services
│   └── websocket.ts          # ⭐ WebSocket Service
│
├── stores/                   # Pinia State Management (5 Stores)
│   ├── auth.ts               # ⭐ Authentication State
│   ├── esp.ts                # ⭐ ESP Devices (Mock + Real)
│   ├── logic.ts              # Automation Rules
│   ├── database.ts           # Database Explorer State
│   └── dragState.ts          # Drag & Drop State
│
├── types/                    # TypeScript Types (4 Dateien)
│   ├── index.ts              # ⭐ Haupt-Types (ESP, Sensor, Actuator)
│   ├── logic.ts              # Logic-spezifische Types
│   ├── gpio.ts               # ⭐ GPIO-Status Types
│   └── websocket-events.ts   # ⭐ System-Monitor Events
│
├── utils/                    # Utility Functions (14 Dateien)
│   ├── formatters.ts         # ⭐ Date, Number, Sensor
│   ├── labels.ts             # UI Label Mappings (Deutsch)
│   ├── sensorDefaults.ts     # ⭐ Sensor Type Registry (20+)
│   ├── actuatorDefaults.ts   # ⭐ Aktor-Typ-Defaults
│   ├── gpioConfig.ts         # GPIO Pin Konfiguration
│   ├── wifiStrength.ts       # WiFi Signal Berechnung
│   ├── zoneColors.ts         # Zone Farben
│   ├── errorCodeTranslator.ts # Fehlercode → Text
│   ├── databaseColumnTranslator.ts
│   ├── logMessageTranslator.ts
│   ├── logSummaryGenerator.ts
│   ├── eventTransformer.ts   # Event-Transformation
│   ├── eventTypeIcons.ts     # Event-Typ → Icon
│   └── index.ts              # Re-Exports (ohne gpioConfig)
│
├── views/                    # Page Views (11 Dateien)
│   ├── DashboardView.vue     # ⭐ Dashboard (/), ?openSettings={id}
│   ├── SensorsView.vue       # ⭐ Sensoren | Aktoren (/sensors)
│   ├── LogicView.vue         # Automation Rules (/logic)
│   ├── SystemMonitorView.vue # ⭐ System Monitor (/system-monitor)
│   ├── UserManagementView.vue # User Management (/users)
│   ├── SystemConfigView.vue  # System Config (/system-config)
│   ├── LoadTestView.vue      # Load Testing (/load-test)
│   ├── MaintenanceView.vue   # Maintenance Jobs (/maintenance)
│   ├── SettingsView.vue      # Einstellungen (/settings)
│   ├── LoginView.vue         # Login (/login)
│   └── SetupView.vue         # Initial Setup (/setup)
│
├── router/
│   └── index.ts              # Routes + Navigation Guards
│
├── App.vue                   # Root Component
├── main.ts                   # Entry Point
├── style.css                 # Global Styles (Tailwind)
└── vite-env.d.ts
```

---

## 2. API-Layer

> **Vollständige REST-API-Referenz:** `.claude/reference/api/REST_ENDPOINTS.md`

### Axios-Instanz (`api/index.ts`)

```typescript
// Base URL
baseURL: '/api/v1'

// Request Interceptor
- Fügt Bearer Token aus authStore hinzu

// Response Interceptor
- 401 → refreshTokens() → Retry
- Refresh fehlgeschlagen → Logout + Redirect /login
- Infinite Loop Prevention für Auth-Endpoints
```

### API-Module

| Modul | Endpoints | Beschreibung |
|-------|-----------|--------------|
| `auth.ts` | `/auth/*` | Login, Logout, Setup, Refresh, Me |
| `esp.ts` | `/esp/*`, `/debug/*` | ⭐ Unified Mock + Real ESP API |
| `sensors.ts` | `/sensors/*` | Sensor CRUD + History + Stats |
| `actuators.ts` | `/actuators/*` | Actuator Control |
| `zones.ts` | `/zone/*` | Zone Assignment/Removal |
| `subzones.ts` | `/subzone/*` | Subzone Management |
| `logic.ts` | `/logic/*` | Cross-ESP Automation Rules |
| `debug.ts` | `/debug/*` | Mock ESP Simulation |
| `audit.ts` | `/audit/*` | Audit Log Query + Stats |
| `config.ts` | `/config/*` | System Configuration |
| `database.ts` | `/database/*` | Database Explorer |
| `logs.ts` | `/logs/*` | Log Viewer + Management |
| `loadtest.ts` | `/loadtest/*` | Load Testing |
| `users.ts` | `/users/*` | User Management |

### ESP API - Unified Routing (`esp.ts`)

```typescript
// Erkennt automatisch Mock vs Real ESP
function isMockEsp(espId: string): boolean {
  return espId.startsWith('ESP_MOCK_') ||
         espId.startsWith('MOCK_') ||
         espId.includes('MOCK')
}

// Routed automatisch zu korrektem Endpoint
async getDevice(espId: string): Promise<ESPDevice> {
  if (isMockEsp(espId)) {
    return mergeWithDbData(debugApi.getMockEsp(espId))
  }
  return api.get(`/esp/devices/${espId}`)
}
```

---

## 3. State Management (Pinia Stores)

### auth.ts - Authentication

```typescript
// State
user: User | null
accessToken: string | null
refreshToken: string | null
setupRequired: boolean | null
isLoading: boolean
error: string | null

// Getters
isAuthenticated: boolean
isAdmin: boolean
isOperator: boolean

// Actions
checkAuthStatus()   // Prüft Setup + Token
login(credentials)  // Login → Tokens + User
setup(data)         // Initial Setup
refreshTokens()     // Token Refresh
logout(logoutAll)   // Logout + WebSocket Cleanup
clearAuth()         // Tokens löschen

// LocalStorage Keys
'el_frontend_access_token'
'el_frontend_refresh_token'
```

### esp.ts - ESP Devices (Unified)

```typescript
// State
devices: ESPDevice[]
selectedDeviceId: string | null
isLoading: boolean
error: string | null
pendingDevices: PendingESPDevice[]
isPendingLoading: boolean
gpioStatusMap: Map<string, GpioStatusResponse>
gpioStatusLoading: Map<string, boolean>

// Getters
selectedDevice
deviceCount
onlineDevices / offlineDevices
mockDevices / realDevices
devicesByZone(zoneId)
masterZoneDevices
getGpioStatusForEsp(espId): GpioStatusResponse | null
getAvailableGpios(espId): number[]

// Actions
fetchAll(params?)       // Alle Geräte laden
fetchDevice(deviceId)   // Einzelnes Gerät
createDevice(config)    // Mock oder Real erstellen
updateDevice(id, update) // Update (DB)
deleteDevice(deviceId)  // Löschen

// Mock-spezifisch
triggerHeartbeat(id)
setState(id, state)
setAutoHeartbeat(id, enabled)
addSensor(id, config)
setSensorValue(id, gpio, value)
removeSensor(id, gpio)
addActuator(id, config)
setActuatorState(id, gpio, state)
emergencyStop(id) / clearEmergency(id)

// Pending Devices / GPIO
fetchPendingDevices()
approveDevice(deviceId, request?)
rejectDevice(deviceId, request?)
fetchGpioStatus(espId)

// WebSocket
initWebSocket()         // Handler registrieren
cleanupWebSocket()      // Handler entfernen
```

### WebSocket Event Handlers im ESP Store

```typescript
// Empfangene Events:
'esp_health'         → handleEspHealth()      // Heartbeat Updates
'sensor_data'        → handleSensorData()     // Live Sensor Values
'actuator_status'    → handleActuatorStatus() // Actuator State
'actuator_alert'     → handleActuatorAlert()  // Emergency/Timeout
'config_response'    → handleConfigResponse() // Config ACK
'zone_assignment'    → handleZoneAssignment() // Zone ACK
'sensor_health'      → (Maintenance/Phase 2E)
'device_discovered'  → Pending Devices Discovery
'device_approved'    → Pending Devices Approval
'device_rejected'    → Pending Devices Rejection
```

---

## 4. WebSocket-System

> **Vollständige Event-Referenz:** `.claude/reference/api/WEBSOCKET_EVENTS.md`

### Service (`services/websocket.ts`)

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
  subscribe(filters, callback): string  // Returns subscriptionId
  unsubscribe(subscriptionId): void
  on(type, callback): () => void        // Type-specific listener

  // Features
  - Auto-Reconnect mit Exponential Backoff
  - Token-Expiry Tracking
  - Rate Limiting (10 msg/sec)
  - Visibility Handling (Tab-Switches)
  - Message Queue während 'connecting'
}
```

### Composable (`composables/useWebSocket.ts`)

```typescript
function useWebSocket(options?: {
  autoConnect?: boolean      // default: true
  autoReconnect?: boolean    // default: true
  filters?: WebSocketFilters
}) {
  // State
  isConnected: Ref<boolean>
  isConnecting: Ref<boolean>
  connectionError: Ref<string | null>
  connectionStatus: ComputedRef<string>
  lastMessage: Ref<WebSocketMessage | null>

  // Actions
  connect(): Promise<void>
  disconnect(): void
  subscribe(filters, callback?): string
  unsubscribe(): void
  on(type, callback): () => void  // Returns unsubscribe fn
  updateFilters(filters): void
  cleanup(): void  // Call in onUnmounted
}
```

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

## 5. Routing (`router/index.ts`)

### Routen-Struktur

```typescript
// Public Routes
'/login'  → LoginView.vue
'/setup'  → SetupView.vue

// Protected Routes (requiresAuth: true)
'/'               → DashboardView.vue (?openSettings={id})
'/sensors'        → SensorsView.vue (Tabs: Sensoren | Aktoren)
'/logic'          → LogicView.vue
'/settings'       → SettingsView.vue
'/system-monitor' → SystemMonitorView.vue (requiresAdmin)

// Admin Routes (requiresAdmin: true)
'/users'          → UserManagementView.vue
'/system-config'  → SystemConfigView.vue
'/load-test'      → LoadTestView.vue
'/maintenance'    → MaintenanceView.vue

// Redirects
'/devices'         → '/'
'/devices/:espId'  → '/?openSettings={espId}'
'/mock-esp'        → '/'
'/mock-esp/:espId' → '/?openSettings={espId}'
'/actuators'       → '/sensors?tab=actuators'
'/database'        → '/system-monitor?tab=database'
'/logs'            → '/system-monitor?tab=logs'
'/audit'           → '/system-monitor?tab=events'
'/mqtt-log'        → '/system-monitor?tab=mqtt'
```

### 5.1 System Monitor (View & Tabs)

**View:** `src/views/SystemMonitorView.vue`
**Route:** `/system-monitor` (requiresAdmin)
**Query-Parameter:** `tab` steuert den aktiven Tab

| Tab-ID | Bedeutung | Komponenten |
|--------|-----------|-------------|
| `events` | Ereignisse | EventsTab, UnifiedEventList, EventDetailsPanel |
| `logs` | Server-Logs | ServerLogsTab, LogManagementPanel |
| `database` | Datenbank | DatabaseTab (DataTable, FilterPanel) |
| `mqtt` | MQTT-Traffic | MqttTrafficTab |

**Composable:** `useQueryFilters` – synchronisiert Filter mit URL-Query für Deep-Links

**Relevante API:** `src/api/logs.ts`, `src/api/audit.ts`, `src/api/database.ts`

### Navigation Guards

```typescript
beforeEach(async (to, from, next) => {
  // 1. checkAuthStatus() wenn noch nicht geprüft
  // 2. Redirect zu /setup wenn setupRequired
  // 3. Redirect zu /login wenn nicht authentifiziert
  // 4. Redirect zu / wenn nicht Admin aber requiresAdmin
  // 5. Redirect zu / wenn eingeloggt und auf /login oder /setup
})
```

---

## 6. Utilities

### formatters.ts

| Funktion | Beschreibung | Beispiel |
|----------|--------------|----------|
| `formatRelativeTime(date)` | Relative Zeit | "vor 5 Minuten" |
| `formatDateTime(date)` | Datum + Zeit | "02.01.2025, 14:30" |
| `formatTime(date)` | Nur Zeit | "14:30:45" |
| `formatNumber(n, decimals)` | Zahl formatieren | "1.234,56" |
| `formatSensorValue(value, type)` | Sensor-Wert + Unit | "23.5 °C" |
| `formatUptime(seconds)` | Uptime | "2d 5h 30m" |
| `formatHeapSize(bytes)` | Speicher | "45.2 KB" |
| `formatRssi(dBm)` | WiFi Signal | "-65 dBm (Gut)" |
| `getDataFreshness(timestamp)` | Aktualität | "fresh" / "stale" |

### sensorDefaults.ts

```typescript
// 20+ Sensor-Typen mit Konfiguration
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
getSensorDefault(type): number
getSensorLabel(type): string
getSensorTypeOptions(): { value, label }[]
isValidSensorValue(type, value): boolean
```

### labels.ts

```typescript
// Deutsche Label-Mappings
QUALITY_LABELS: Record<QualityLevel, string>
STATE_LABELS: Record<SystemState, string>
ACTUATOR_TYPE_LABELS: Record<ActuatorType, string>

// Helper Functions
getQualityInfo(quality): { label, colorClass }
getStateInfo(state): { label, variant }
getActuatorTypeLabel(type): string
```

### Weitere Utils

| Datei | Zweck |
|-------|-------|
| `actuatorDefaults.ts` | Aktor-Typ-Defaults |
| `errorCodeTranslator.ts` | Fehlercode → deutscher Text |
| `databaseColumnTranslator.ts` | DB-Spalten → Anzeige |
| `logMessageTranslator.ts` | Log-Nachrichten-Übersetzung |
| `logSummaryGenerator.ts` | Log-Zusammenfassungen |
| `eventTransformer.ts` | Event-Transformation |
| `eventTypeIcons.ts` | Event-Typ → Icon |
| `gpioConfig.ts` | GPIO Pin Konfiguration (direkt importieren!) |

**WICHTIG:** `gpioConfig.ts` direkt importieren (`@/utils/gpioConfig`), nicht aus `@/utils` wegen Namenskonflikt.

---

## 7. Zone Management

### Zwei-Feld-System

| Feld | Typ | Beispiel | Verwendung |
|------|-----|----------|------------|
| `zone_id` | Technisch | `zelt_1` | MQTT Topics, DB, API |
| `zone_name` | Display | `Zelt 1` | UI-Anzeige |

### Automatische ID-Generierung

```typescript
// ZoneAssignmentPanel.vue
function generateZoneId(zoneName: string): string {
  // "Gewächshaus Nord" → "gewaechshaus_nord"
  return zoneName
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
```

### Drag & Drop Flow

```
1. VueDraggable @add Event
   └─> ZoneGroup.vue emits 'device-dropped'

2. View: onDeviceDropped(event)
   └─> useZoneDragDrop Composable

3. API: zonesApi.assignZone(deviceId, {zone_id, zone_name})
   └─> POST /api/v1/zone/devices/{id}/assign

4. Server: DB Update + MQTT Publish
   └─> kaiser/{id}/esp/{esp_id}/zone/assign

5. ESP32: Speichert in NVS, sendet ACK

6. Server: Empfängt ACK, broadcastet WebSocket

7. Frontend: espStore.fetchAll() → UI aktualisiert
```

---

## 8. Mock ESP Architektur

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

## 9. Lifecycle & Cleanup

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

// Cleanup-Funktion für App-Unmount
cleanupWebSocket() {
  wsUnsubscribers.forEach(unsub => unsub())
  wsUnsubscribers.length = 0
  ws.disconnect()
}
```

---

## 10. Fehlerquellen / Troubleshooting

> **📚 Vollständige Error-Code Referenz:** `.claude/reference/errors/ERROR_CODES.md`
> Server-Fehler (5000-5699) und ESP32-Fehler (1000-4999) mit Lösungen

| Problem | Ursache | Lösung |
|---------|---------|--------|
| 401-Refresh-Loop | Korrupte Tokens | LocalStorage löschen |
| "Not enough segments" | JWT ungültig | Inkognito / Neu einloggen |
| Setup hängt | DB nicht leer | Server-DB neu erstellen |
| WebSocket disconnected | Token expired | Seite neu laden |
| Mock ESP nicht gefunden | Server neugestartet | Mock ESP neu erstellen |
| Zone-Zuweisung fehlgeschlagen | ESP offline | Heartbeat triggern |
| System Monitor Tab leer | Falsche `tab`-Query | URL prüfen (`?tab=events`) |
| gpioConfig Import-Fehler | Namenskonflikt | Direkt importieren |

---

## 11. Dokumentations-Matrix

### Frontend-spezifisch

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| Service-Management | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` | Start/Stop/Logs |
| Bug-Dokumentation | `El Frontend/Docs/Bugs_and_Phases/` | Nach Phasen sortiert |
| API-Referenz | `El Frontend/Docs/APIs.md` | REST-Endpunkte |

### System-übergreifend

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| **REST API Referenz** | `.claude/reference/api/REST_ENDPOINTS.md` | Alle ~170 Endpoints |
| **WebSocket Events** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Real-time Events |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | ESP32 + Server Fehler |
| **Datenflüsse** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Kommunikationsmuster |
| Backend-Architektur | `.claude/skills/server-development/SKILL.md` | Server-Details |
| ESP32 Firmware | `.claude/skills/esp32-development/SKILL.md` | Firmware-Details |
| MQTT Protokoll | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Referenz |
| **Test-Workflow** | `.claude/reference/testing/TEST_WORKFLOW.md` | NUR auf Anfrage |
| **Log-Locations** | `.claude/reference/debugging/LOG_LOCATIONS.md` | Bei Debugging |

---

## 12. KI-Agenten Workflow

### Schritt-für-Schritt Anleitung

**SCHRITT 1: Aufgabe identifizieren**
- Was soll geändert werden?
- Welches Modul ist betroffen? (Section 1, 11)
- Bug-Fix, Feature oder Refactoring?

**SCHRITT 2: Dokumentation konsultieren**
- Nutze Tabelle in Section 11
- **Immer zuerst lesen:** Relevante Doku vollständig
- Bei API-Änderungen: Server-Dokumentation prüfen

**SCHRITT 3: Code-Location finden**
- Nutze Ordnerstruktur aus Section 1
- Verstehe Abhängigkeiten (Stores, Composables, API)
- Prüfe bestehende Implementierungen

**SCHRITT 4: Änderungen implementieren**
- Vue 3 Composition API verwenden
- TypeScript Types aus `src/types/` nutzen
- Bestehende Composables wiederverwenden
- Pinia Store für State Management

**SCHRITT 5: Testen**
- Browser DevTools Console prüfen
- WebSocket-Verbindung testen
- API-Responses verifizieren

### Regeln für Code-Änderungen

**NIEMALS:**
- ❌ API-Endpunkte ohne Server-Abgleich ändern
- ❌ WebSocket-Events ohne Backend-Kompatibilität
- ❌ Types ohne vollständige Definition
- ❌ Stores ohne Cleanup-Logik

**IMMER:**
- ✅ TypeScript Types verwenden
- ✅ Composables für wiederverwendbare Logik
- ✅ API-Calls über `src/api/` Module
- ✅ Pinia Stores für State Management
- ✅ Cleanup in `onUnmounted`
- ✅ Deutsche Labels in `utils/labels.ts`

---

## 13. Komponenten-Patterns

### Standard Vue 3 Component

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEspStore } from '@/stores/esp'
import { useWebSocket } from '@/composables'
import type { ESPDevice } from '@/types'

// Props
const props = defineProps<{
  deviceId: string
}>()

// Emits
const emit = defineEmits<{
  (e: 'update', device: ESPDevice): void
}>()

// Stores
const espStore = useEspStore()

// Composables
const { on, cleanup } = useWebSocket()

// State
const isLoading = ref(false)

// Computed
const device = computed(() => 
  espStore.devices.find(d => d.esp_id === props.deviceId)
)

// Methods
async function loadDevice() {
  isLoading.value = true
  await espStore.fetchDevice(props.deviceId)
  isLoading.value = false
}

// Lifecycle
onMounted(() => {
  loadDevice()
  on('esp_health', handleHealth)
})

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div v-if="device">
    <!-- Content -->
  </div>
</template>
```

### Composable Pattern

```typescript
// composables/useFeature.ts
import { ref, computed, onUnmounted } from 'vue'

export function useFeature(options?: FeatureOptions) {
  // State
  const data = ref<Data | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const hasData = computed(() => data.value !== null)

  // Methods
  async function load() {
    isLoading.value = true
    error.value = null
    try {
      data.value = await api.getData()
    } catch (e) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  function cleanup() {
    data.value = null
  }

  // Auto-cleanup
  onUnmounted(cleanup)

  return {
    data,
    isLoading,
    error,
    hasData,
    load,
    cleanup
  }
}
```

---

## Referenz-Dokumentation

> Diese Referenz-Dateien enthalten detaillierte Informationen und sollten bei Bedarf konsultiert werden:

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| **REST API** | `.claude/reference/api/REST_ENDPOINTS.md` | API-Calls implementieren |
| **WebSocket Events** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Real-time Features |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | Fehler debuggen/anzeigen |
| **Datenflüsse** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | System-Kommunikation verstehen |
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | Backend-Kommunikation verstehen |
| **Log-Locations** | `.claude/reference/debugging/LOG_LOCATIONS.md` | Logs analysieren |
| **Tests** | `.claude/reference/testing/TEST_WORKFLOW.md` | Tests ausführen (NUR auf Anfrage) |

---

## Versions-Historie

**Version:** 6.1 (SKILL.md Format)
**Letzte Aktualisierung:** 2026-02-01

### Änderungen in v6.1

- YAML Frontmatter mit `name`, `description`, `allowed-tools` hinzugefügt
- Format für Claude Code VS Code Extension optimiert
- Pfade aktualisiert für neue `.claude/skills/` Struktur
- Section 12: KI-Agenten Workflow hinzugefügt
- Section 13: Komponenten-Patterns hinzugefügt
- Alle Inhalte vollständig erhalten

### Vorherige Änderungen (v6.0)

- **System Monitor View** ersetzt DatabaseExplorer, LogViewer, AuditLog, MqttLog
- Neue Komponenten-Ordner: `system-monitor/`, `filters/`
- Neue Composables: `useQueryFilters.ts`, `useGpioStatus.ts`
- Neue Types: `gpio.ts`, `websocket-events.ts`
- ESP Store: Pending Devices, GPIO-Status
- WebSocket-Events erweitert