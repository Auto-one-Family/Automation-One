# El Frontend - KI-Agenten Dokumentation

> **Für KI-Agenten:** Maßgebliche Referenz für Frontend-Entwicklung (Vue 3 + TypeScript + Vite + Pinia + Tailwind)

---

## Letzte Aktualisierung: 2026-01-27

**Version 6.0 – System Monitor & Konsolidierung:**
- **System Monitor View** (`SystemMonitorView.vue`) ersetzt DatabaseExplorer, LogViewer, AuditLog, MqttLog – eine View mit Tabs: Ereignisse | Logs | Datenbank | MQTT
- Neue Komponenten-Ordner: `system-monitor/`, `filters/`
- Neue Composables: `useQueryFilters.ts` (URL↔Filter-Sync), `useGpioStatus.ts` (GPIO-Status pro ESP)
- Neue Types: `gpio.ts`, `websocket-events.ts`
- Neue Utils: `actuatorDefaults`, `eventTransformer`, `eventTypeIcons`, `logMessageTranslator`, `logSummaryGenerator`, `databaseColumnTranslator`, `errorCodeTranslator`
- ESP Store: Pending Devices (Discovery/Approval), GPIO-Status; WebSocket-Events `sensor_health`, `device_discovered`, `device_approved`, `device_rejected`
- Entfernte View-Dateien (nur Redirects): DatabaseExplorerView, LogViewerView, AuditLogView, MqttLogView → alle zu `/system-monitor?tab=…`
- Dashboard-Komponenten: `ActuatorSidebar.vue`, `ComponentSidebar.vue`; ESP: `ESPSettingsPopover.vue`, `GpioPicker.vue`, `PendingDevicesPanel.vue`

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Server + Frontend starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0 | - |
| **Services stoppen/neu starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.3 | - |
| **Server-Logs prüfen** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.5 | - |
| **Bug debuggen** | `El Frontend/Docs/Bugs_and_Phases/` | Nach Phasen sortiert |
| **API-Endpoint finden** | Section "API-Layer" unten | `src/api/` |
| **WebSocket verstehen** | Section "WebSocket-System" unten | `src/services/websocket.ts` |
| **Zone zuweisen** | Section "Zone Management" unten | `src/components/zones/` |
| **ESP-Gerät verwalten** | Section "ESP Store" unten | `src/stores/esp.ts` |
| **System Monitor (Ereignisse/Logs/DB/MQTT)** | Section "System Monitor" unten | `src/views/SystemMonitorView.vue`, `src/components/system-monitor/` |
| **Komponente finden** | Section "Ordnerstruktur" unten | `src/components/` |

---

## 1. Ordnerstruktur (Stand: 2026-01-27)

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
│   ├── debug.ts              # Mock ESP Simulation (Heartbeat, Sensors)
│   ├── audit.ts              # Audit Log Query + Stats
│   ├── config.ts             # System Configuration
│   ├── database.ts           # Database Explorer
│   ├── logs.ts               # ⭐ Log Viewer + Log-Management (Statistics, Cleanup)
│   ├── loadtest.ts           # Load Testing
│   └── users.ts              # User Management
│
├── components/               # Vue 3 Komponenten (12 Unterordner)
│   ├── common/               # ⭐ Wiederverwendbare UI-Bausteine (13 Dateien + index)
│   │   ├── Button.vue        # Standard Button
│   │   ├── Input.vue         # Form Input
│   │   ├── Select.vue        # Form Select
│   │   ├── Toggle.vue        # Toggle Switch
│   │   ├── Badge.vue         # Status Badges
│   │   ├── Card.vue          # Card Container
│   │   ├── Modal.vue         # Modal Dialog
│   │   ├── Spinner.vue       # Loading Spinner
│   │   ├── LoadingState.vue  # Loading State mit Message
│   │   ├── EmptyState.vue    # Empty State mit Action
│   │   ├── ErrorState.vue    # Error State mit Retry
│   │   ├── ToastContainer.vue # Toast Notifications (von App.vue direkt importiert)
│   │   └── index.ts          # Re-Exports (ohne ToastContainer)
│   │
│   ├── layout/               # App Layout (3 Dateien)
│   │   ├── MainLayout.vue    # Haupt-Layout mit Sidebar
│   │   ├── AppHeader.vue     # Top Header
│   │   └── AppSidebar.vue    # Seitenleiste Navigation
│   │
│   ├── dashboard/            # Dashboard-spezifisch (9 Dateien + index)
│   │   ├── StatCard.vue      # KPI-Kacheln
│   │   ├── ActionBar.vue     # Top Action Bar
│   │   ├── SensorSidebar.vue # Sensor-Kategorien Sidebar
│   │   ├── ActuatorSidebar.vue # Aktor-Kategorien Sidebar
│   │   ├── ComponentSidebar.vue # Sensoren+Aktoren kombinierte Sidebar
│   │   ├── StatusPill.vue    # Status-Badge
│   │   ├── UnassignedDropBar.vue # Unassigned Devices Zone
│   │   ├── CrossEspConnectionOverlay.vue # Logic-Verbindungen
│   │   └── index.ts
│   │
│   ├── esp/                  # ESP Device Darstellung (10 Dateien + index)
│   │   ├── ESPCard.vue       # ⭐ Device Card (Status, Health)
│   │   ├── ESPOrbitalLayout.vue # Orbital-Layout für Sensoren
│   │   ├── SensorSatellite.vue # Sensor im Orbital-Layout
│   │   ├── ActuatorSatellite.vue # Actuator im Orbital-Layout
│   │   ├── SensorValueCard.vue # Sensor-Wert Display
│   │   ├── ConnectionLines.vue # Logic-Rule Verbindungslinien
│   │   ├── AnalysisDropZone.vue # Analyse Drop Zone
│   │   ├── ESPSettingsPopover.vue # ESP-Einstellungen Popover
│   │   ├── GpioPicker.vue    # GPIO-Pin-Auswahl
│   │   ├── PendingDevicesPanel.vue # Pending Devices (Discovery/Approval)
│   │   └── index.ts         # Re-Exports (ESPCard, SensorValueCard, …; ohne ESPSettingsPopover/GpioPicker/PendingDevicesPanel)
│   │
│   ├── database/             # Database Explorer (6 Dateien)
│   │   ├── DataTable.vue     # Daten-Tabelle
│   │   ├── FilterPanel.vue   # Filter-Panel
│   │   ├── Pagination.vue    # Pagination
│   │   ├── RecordDetailModal.vue # Detail-Modal
│   │   ├── SchemaInfoPanel.vue # Schema-Info
│   │   └── TableSelector.vue # Tabellen-Auswahl
│   │
│   ├── zones/                # Zone Management (2 Dateien)
│   │   ├── ZoneAssignmentPanel.vue # ⭐ Zone-Zuweisung Formular
│   │   └── ZoneGroup.vue     # Drag & Drop Zone Container
│   │
│   ├── charts/               # Chart-Komponenten (1 Datei)
│   │   └── MultiSensorChart.vue # Multi-Sensor Chart
│   │
│   ├── filters/              # ⭐ Filter-Komponenten (neu)
│   │   ├── UnifiedFilterBar.vue # Wiederverwendbare Filter-Leiste (StatusFilter, TypeFilter, TimeRange)
│   │   └── index.ts
│   │
│   ├── system-monitor/       # ⭐ System Monitor (neu, ersetzt eigene Views)
│   │   ├── MonitorTabs.vue   # Tab-Leiste + Live-Toggle (events|logs|database|mqtt)
│   │   ├── MonitorFilterPanel.vue # Filter (ESP, Level, Zeit, Event-Typen)
│   │   ├── UnifiedEventList.vue # Ereignisliste mit virtuellem Scroll
│   │   ├── EventDetailsPanel.vue # Ereignis-Detail mit Fehlercode-Übersetzung
│   │   ├── EventsTab.vue     # Ereignis-Tab-Container
│   │   ├── ServerLogsTab.vue # Server-Log-Viewer (Polling)
│   │   ├── DatabaseTab.vue   # Datenbank-Tabellen-Explorer
│   │   ├── MqttTrafficTab.vue # MQTT-Nachrichten-Viewer
│   │   ├── LogManagementPanel.vue # Log-Verwaltung (Cleanup, Statistiken)
│   │   ├── AutoCleanupStatusBanner.vue # Auto-Cleanup-Status
│   │   ├── CleanupPanel.vue  # Cleanup-Konfiguration
│   │   ├── CleanupPreview.vue # Cleanup-Vorschau
│   │   ├── DataSourceSelector.vue # Datenquellen-Auswahl
│   │   ├── PreviewEventCard.vue # Ereignis-Karte für Vorschau
│   │   ├── RssiIndicator.vue # RSSI-Anzeige
│   │   ├── MonitorHeader.vue # @deprecated – in MonitorTabs integriert
│   │   └── index.ts         # Re-Exports (MonitorTabs, MonitorFilterPanel, …)
│   │
│   └── modals/               # Modal Dialoge (1 Datei)
│       └── CreateMockEspModal.vue # Mock ESP erstellen
│
├── composables/              # Vue 3 Composables (9 Dateien)
│   ├── useWebSocket.ts       # ⭐ WebSocket Integration
│   ├── useToast.ts           # Toast Notifications (Singleton)
│   ├── useModal.ts           # Modal State Management
│   ├── useSwipeNavigation.ts # Mobile Swipe Gesten (useSidebarSwipe, useEdgeSwipe)
│   ├── useZoneDragDrop.ts    # Zone Drag & Drop Logic
│   ├── useConfigResponse.ts  # Config Response Handler
│   ├── useQueryFilters.ts    # ⭐ URL↔Filter-Sync (System Monitor, MonitorCategory, TimeRange)
│   ├── useGpioStatus.ts      # ⭐ GPIO-Status pro ESP (useEspStore, types/gpio)
│   └── index.ts              # Re-Exports
│
├── services/                 # Singleton Services (1 Datei)
│   └── websocket.ts          # ⭐ WebSocket Service (Singleton)
│
├── stores/                   # Pinia State Management (5 Stores)
│   ├── auth.ts               # ⭐ Authentication State
│   ├── esp.ts                # ⭐ ESP Devices (Mock + Real, Pending, GPIO-Status)
│   ├── logic.ts              # Automation Rules
│   ├── database.ts           # Database Explorer State
│   └── dragState.ts          # Drag & Drop State
│
├── types/                    # TypeScript Types (4 Dateien)
│   ├── index.ts              # ⭐ Haupt-Types (ESP, Sensor, Actuator, PendingESPDevice, …)
│   ├── logic.ts              # Logic-spezifische Types
│   ├── gpio.ts               # ⭐ GpioStatusResponse, GpioPinStatus, GpioUsageItem, …
│   └── websocket-events.ts   # ⭐ System-Monitor-Event-Types
│
├── utils/                    # Utility Functions (14 Dateien, index exportiert die meisten)
│   ├── formatters.ts         # ⭐ Date, Number, Sensor Formatierung
│   ├── labels.ts             # UI Label Mappings (Deutsch)
│   ├── sensorDefaults.ts     # ⭐ Sensor Type Registry (20+ Types)
│   ├── actuatorDefaults.ts   # ⭐ Aktor-Typ-Defaults
│   ├── gpioConfig.ts         # GPIO Pin Konfiguration (nicht aus index – Namenskonflikt)
│   ├── wifiStrength.ts       # WiFi Signal Berechnung
│   ├── zoneColors.ts         # Zone Farben
│   ├── errorCodeTranslator.ts # Fehlercode → deutscher Text
│   ├── databaseColumnTranslator.ts # DB-Spalten → Anzeige
│   ├── logMessageTranslator.ts # Log-Nachrichten-Übersetzung
│   ├── logSummaryGenerator.ts # Log-Zusammenfassungen
│   ├── eventTransformer.ts   # Event-Transformation (System Monitor)
│   ├── eventTypeIcons.ts     # Event-Typ → Icon
│   └── index.ts              # Re-Exports (ohne gpioConfig)
│
├── views/                    # Page Views (11 Dateien – Stand 2026-01-27)
│   ├── DashboardView.vue    # ⭐ Dashboard + ESP-Übersicht (/), ?openSettings={id}
│   ├── SensorsView.vue       # ⭐ Komponenten mit Tabs: Sensoren | Aktoren (/sensors)
│   ├── LogicView.vue         # Automation Rules (/logic)
│   ├── SystemMonitorView.vue # ⭐ System Monitor: Ereignisse|Logs|Datenbank|MQTT (/system-monitor)
│   ├── UserManagementView.vue # User Management (/users)
│   ├── SystemConfigView.vue  # System Config (/system-config)
│   ├── LoadTestView.vue      # Load Testing (/load-test)
│   ├── MaintenanceView.vue   # Maintenance Jobs (/maintenance)
│   ├── SettingsView.vue      # Einstellungen (/settings)
│   ├── LoginView.vue         # Login (/login)
│   └── SetupView.vue         # Initial Setup (/setup)
│
│   # Entfernte View-Dateien (nur noch Redirects in router/index.ts):
│   # /devices → / | /devices/:espId → /?openSettings={espId}
│   # /actuators → /sensors?tab=actuators
│   # /database → /system-monitor?tab=database
│   # /logs → /system-monitor?tab=logs
│   # /audit → /system-monitor?tab=events
│   # /mqtt-log → /system-monitor?tab=mqtt
│
├── router/                   # Vue Router (1 Datei)
│   └── index.ts              # Routes + Navigation Guards (createWebHistory)
│
├── App.vue                   # Root Component (checkAuthStatus, espStore.cleanupWebSocket)
├── main.ts                   # Entry Point
├── style.css                 # Global Styles (Tailwind)
└── vite-env.d.ts             # Vite Type Definitions
```

---

## 2. API-Layer

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
| `logs.ts` | `/logs/*` | Log Viewer + Log-Management (Statistics, Cleanup) |
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
    // Merged aus Debug-Store + DB
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
logout(logoutAll)   // Logout + WebSocket Cleanup ✅
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

// Getters
selectedDevice
deviceCount
onlineDevices / offlineDevices
mockDevices / realDevices
devicesByZone(zoneId)
masterZoneDevices

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

// WebSocket
initWebSocket()         // Handler registrieren
cleanupWebSocket()      // Handler entfernen ✅
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

### esp.ts – Erweiterungen (Pending Devices, GPIO-Status)

```typescript
// State (zusätzlich)
pendingDevices: PendingESPDevice[]
isPendingLoading: boolean
gpioStatusMap: Map<string, GpioStatusResponse>
gpioStatusLoading: Map<string, boolean>

// Getters
getGpioStatusForEsp(espId): GpioStatusResponse | null
getAvailableGpios(espId): number[]

// Actions (Pending/GPIO)
fetchPendingDevices()
approveDevice(deviceId, request?)
rejectDevice(deviceId, request?)
fetchGpioStatus(espId)
```

---

## 4. WebSocket-System

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

### Routen-Struktur (Stand: 2026-01-27)

```typescript
// Public Routes
'/login'  → LoginView.vue
'/setup'  → SetupView.vue

// Protected Routes (requiresAuth: true, unter MainLayout)
'/'               → DashboardView.vue (mit ?openSettings={id} Support)
'/sensors'        → SensorsView.vue (Tabs: Sensoren | Aktoren)
'/logic'          → LogicView.vue
'/settings'       → SettingsView.vue
'/system-monitor' → SystemMonitorView.vue (requiresAdmin, Tabs: events|logs|database|mqtt)

// Admin Routes (requiresAdmin: true)
'/users'          → UserManagementView.vue
'/system-config'  → SystemConfigView.vue
'/load-test'      → LoadTestView.vue
'/maintenance'    → MaintenanceView.vue

// Redirects (Stand: 2026-01-27)
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
**Route:** `/system-monitor` (requiresAdmin). Query-Parameter `tab` steuert den aktiven Tab.

| Tab-ID    | Bedeutung      | Komponenten (Auszug)      |
|-----------|----------------|---------------------------|
| `events`  | Ereignisse     | EventsTab, UnifiedEventList, EventDetailsPanel, MonitorFilterPanel |
| `logs`    | Server-Logs    | ServerLogsTab, LogManagementPanel |
| `database`| Datenbank      | DatabaseTab (DataTable, FilterPanel, …) |
| `mqtt`    | MQTT-Traffic   | MqttTrafficTab |

**Composable:** `useQueryFilters` – synchronisiert Filter (ESP, Level, TimeRange, category) mit URL-Query für Deep-Links und ESP-Card → System-Monitor-Navigation.

**Relevante API:** `src/api/logs.ts` (Log-Viewer + Log-Management: Statistics, Cleanup), `src/api/audit.ts`, `src/api/database.ts`.

### Navigation Guards

```typescript
beforeEach(async (to, from, next) => {
  // 1. checkAuthStatus() wenn noch nicht geprüft
  // 2. Redirect zu /setup wenn setupRequired
  // 3. Redirect zu /login wenn nicht authentifiziert
  // 4. Redirect zu / wenn nicht Admin aber requiresAdmin
  // 5. Redirect zu / wenn bereits eingeloggt und auf /login oder /setup
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
| `getDataFreshness(timestamp)` | Aktualität | "fresh" / "stale" / "error" |

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

### Weitere Utils (Stand 2026-01-27)

| Datei | Zweck |
|-------|--------|
| `actuatorDefaults.ts` | Aktor-Typ-Defaults (Labels, Konfiguration) |
| `errorCodeTranslator.ts` | Fehlercode → deutscher Text (System Monitor / Events) |
| `databaseColumnTranslator.ts` | DB-Spaltennamen → Anzeige-Labels |
| `logMessageTranslator.ts` | Log-Nachrichten-Übersetzung |
| `logSummaryGenerator.ts` | Log-Zusammenfassungen |
| `eventTransformer.ts` | Event-Daten für System-Monitor-Listen |
| `eventTypeIcons.ts` | Event-Typ → Icon-Mapping |
| `gpioConfig.ts` | GPIO Pin Konfiguration (direkt importieren, nicht aus `@/utils` – Namenskonflikt mit errorCodeTranslator) |

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
  espStore.cleanupWebSocket()  // ✅ Cleanup
})
```

### Auth Store Logout

```typescript
async function logout() {
  websocketService.disconnect()  // ✅ Cleanup
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

| Problem | Ursache | Lösung |
|---------|---------|--------|
| 401-Refresh-Loop | Korrupte Tokens | LocalStorage löschen |
| "Not enough segments" | JWT ungültig | Inkognito / Neu einloggen |
| Setup hängt | DB nicht leer | Server-DB neu erstellen |
| WebSocket disconnected | Token expired | Seite neu laden |
| Mock ESP nicht gefunden | Server neugestartet | Mock ESP neu erstellen |
| Zone-Zuweisung fehlgeschlagen | ESP offline | Heartbeat triggern |
| System Monitor Tab leer | Falsche `tab`-Query / API-Fehler | URL prüfen (`?tab=events|logs|database|mqtt`), Netzwerk/Console prüfen |
| gpioConfig Import-Fehler | Namenskonflikt mit errorCodeTranslator | `import { … } from '@/utils/gpioConfig'` (nicht aus `@/utils`) |

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
| Backend-Architektur | `.claude/CLAUDE_SERVER.md` | Server API, MQTT, DB |
| ESP32 Firmware | `.claude/CLAUDE.md` | ESP32 Code, Topics |
| MQTT Protokoll | `El Trabajante/docs/Mqtt_Protocoll.md` | Topic-Schema |

---

## Changelog (Version 6.0, 2026-01-27)

**Views**
- Neu: `SystemMonitorView.vue` – konsolidierte View mit Tabs Ereignisse | Logs | Datenbank | MQTT
- Entfernt (nur Redirects): DatabaseExplorerView, LogViewerView, AuditLogView, MqttLogView; DevicesView, DeviceDetailView, ActuatorsView waren bereits in v5 durch Redirects ersetzt, Dateien existieren nicht mehr

**Components**
- Neu: Ordner `system-monitor/` (MonitorTabs, MonitorFilterPanel, UnifiedEventList, EventDetailsPanel, ServerLogsTab, DatabaseTab, MqttTrafficTab, LogManagementPanel, …)
- Neu: Ordner `filters/` (UnifiedFilterBar)
- Neu in dashboard: ActuatorSidebar.vue, ComponentSidebar.vue
- Neu in esp: ESPSettingsPopover.vue, GpioPicker.vue, PendingDevicesPanel.vue

**Composables**
- Neu: `useQueryFilters.ts` – URL↔Filter-Sync für System Monitor (MonitorCategory, TimeRange, SeverityLevel)
- Neu: `useGpioStatus.ts` – GPIO-Status pro ESP (nutzt espStore, types/gpio)

**Types**
- Neu: `gpio.ts` (GpioStatusResponse, GpioPinStatus, GpioUsageItem, …)
- Neu: `websocket-events.ts` (System-Monitor-Event-Types)

**Utils**
- Neu: actuatorDefaults, errorCodeTranslator, databaseColumnTranslator, logMessageTranslator, logSummaryGenerator, eventTransformer, eventTypeIcons

**Stores (esp.ts)**
- Neu: pendingDevices, isPendingLoading, gpioStatusMap, gpioStatusLoading; fetchPendingDevices, approveDevice, rejectDevice, fetchGpioStatus; getGpioStatusForEsp, getAvailableGpios
- WebSocket-Events erweitert: sensor_health, device_discovered, device_approved, device_rejected

**Routing**
- Neue Route: `/system-monitor` → SystemMonitorView.vue
- Redirects: /database, /logs, /audit, /mqtt-log → /system-monitor?tab=…

**API**
- `logs.ts`: Log-Management-Typen und -Endpoints (Statistics, Cleanup) ergänzt – siehe `src/api/logs.ts`

---

### Change-Summary (Version 6.0, 2026-01-27)

| Metrik | Wert |
|--------|------|
| **Neue View-Dateien** | 1 (SystemMonitorView.vue) |
| **Entfernte View-Dateien** | 7 (DevicesView, DeviceDetailView, ActuatorsView, DatabaseExplorerView, LogViewerView, AuditLogView, MqttLogView – nur noch Redirects) |
| **Neue Komponenten-Ordner** | 2 (system-monitor/, filters/) |
| **Neue Komponenten (Dateien)** | ~18 in system-monitor, 1 in filters; je 2 in dashboard und esp |
| **Neue Composables** | 2 (useQueryFilters, useGpioStatus) |
| **Neue Type-Dateien** | 2 (gpio.ts, websocket-events.ts) |
| **Neue Utils** | 7 (actuatorDefaults, errorCodeTranslator, databaseColumnTranslator, logMessageTranslator, logSummaryGenerator, eventTransformer, eventTypeIcons) |
| **Neue Sections/Unterabschnitte** | 5.1 System Monitor; Erweiterungen in Section 3 (ESP Store), Section 6 (Utils), Section 10 (Troubleshooting) |

**Wichtigste Änderungen:** Konsolidierung von Database-, Log-, Audit- und MQTT-Views in eine System-Monitor-View mit Tabs; Pending-Devices- und GPIO-Status-Integration im ESP Store; URL-Filter-Sync für System Monitor (useQueryFilters); neue Types/Utils für Events, Logs und Fehlercodes.

**Diskrepanzen Frontend ↔ Server:** Keine systematisch geprüft; API-Basis bleibt `/api/v1`. Für Abgleich mit Server-Endpoints siehe `.claude/CLAUDE_SERVER.md`.

---

**Version:** 6.0 (System Monitor & Dokumentations-Update)
**Letzte Aktualisierung:** 2026-01-27
