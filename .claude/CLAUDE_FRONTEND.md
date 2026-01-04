# El Frontend - KI-Agenten Dokumentation

> **Für KI-Agenten:** Maßgebliche Referenz für Frontend-Entwicklung (Vue 3 + TypeScript + Vite + Pinia + Tailwind)

---

## Letzte Aktualisierung: 2025-01-02

**Cleanup & Dokumentation:**
- Leere Component-Ordner entfernt (7 Stück)
- Deprecated `useRealTimeData.ts` entfernt (ersetzt durch `useWebSocket.ts`)
- Ungenutzte Legacy-Views entfernt (`MockEspView.vue`, `MockEspDetailView.vue`)
- Ungenutzter `mockEsp.ts` Store entfernt (durch unified `esp.ts` ersetzt)
- Vollständige Ordnerstruktur dokumentiert

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
| **Zone zuweisen** | Section "Zone Naming" unten | `src/components/zones/` |
| **ESP-Gerät verwalten** | Section "ESP Store" unten | `src/stores/esp.ts` |
| **Komponente finden** | Section "Ordnerstruktur" unten | `src/components/` |

---

## 1. Ordnerstruktur (Stand: 2025-01-02)

```
El Frontend/src/
├── api/                      # HTTP API Clients (15 Dateien)
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
│   ├── logs.ts               # Log Viewer
│   ├── loadtest.ts           # Load Testing
│   └── users.ts              # User Management
│
├── components/               # Vue 3 Komponenten (10 Unterordner)
│   ├── common/               # ⭐ Wiederverwendbare UI-Bausteine (10 Dateien)
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
│   │   ├── ToastContainer.vue # Toast Notifications
│   │   └── index.ts          # Re-Exports
│   │
│   ├── layout/               # App Layout (3 Dateien)
│   │   ├── MainLayout.vue    # Haupt-Layout mit Sidebar
│   │   ├── AppHeader.vue     # Top Header
│   │   └── AppSidebar.vue    # Seitenleiste Navigation
│   │
│   ├── dashboard/            # Dashboard-spezifisch (6 Dateien)
│   │   ├── StatCard.vue      # KPI-Kacheln
│   │   ├── ActionBar.vue     # Top Action Bar
│   │   ├── SensorSidebar.vue # Sensor-Kategorien Sidebar
│   │   ├── StatusPill.vue    # Status-Badge
│   │   ├── UnassignedDropBar.vue # Unassigned Devices Zone
│   │   ├── CrossEspConnectionOverlay.vue # Logic-Verbindungen
│   │   └── index.ts          # Re-Exports
│   │
│   ├── esp/                  # ESP Device Darstellung (7 Dateien)
│   │   ├── ESPCard.vue       # ⭐ Device Card (Status, Health)
│   │   ├── ESPOrbitalLayout.vue # Orbital-Layout für Sensoren
│   │   ├── SensorSatellite.vue # Sensor im Orbital-Layout
│   │   ├── ActuatorSatellite.vue # Actuator im Orbital-Layout
│   │   ├── SensorValueCard.vue # Sensor-Wert Display
│   │   ├── ConnectionLines.vue # Logic-Rule Verbindungslinien
│   │   ├── AnalysisDropZone.vue # Analyse Drop Zone
│   │   └── index.ts          # Re-Exports
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
│   └── modals/               # Modal Dialoge (1 Datei)
│       └── CreateMockEspModal.vue # Mock ESP erstellen
│
├── composables/              # Vue 3 Composables (6 Dateien)
│   ├── useWebSocket.ts       # ⭐ WebSocket Integration
│   ├── useToast.ts           # Toast Notifications (Singleton)
│   ├── useModal.ts           # Modal State Management
│   ├── useSwipeNavigation.ts # Mobile Swipe Gesten
│   ├── useZoneDragDrop.ts    # Zone Drag & Drop Logic
│   ├── useConfigResponse.ts  # Config Response Handler
│   └── index.ts              # Re-Exports
│
├── services/                 # Singleton Services (1 Datei)
│   └── websocket.ts          # ⭐ WebSocket Service (Singleton)
│
├── stores/                   # Pinia State Management (5 Stores)
│   ├── auth.ts               # ⭐ Authentication State
│   ├── esp.ts                # ⭐ ESP Devices (Mock + Real unified)
│   ├── logic.ts              # Automation Rules
│   ├── database.ts           # Database Explorer State
│   └── dragState.ts          # Drag & Drop State
│
├── types/                    # TypeScript Types (2 Dateien)
│   ├── index.ts              # ⭐ Haupt-Types (636 Zeilen)
│   └── logic.ts              # Logic-spezifische Types
│
├── utils/                    # Utility Functions (6 Dateien)
│   ├── formatters.ts         # ⭐ Date, Number, Sensor Formatierung
│   ├── labels.ts             # UI Label Mappings (Deutsch)
│   ├── sensorDefaults.ts     # ⭐ Sensor Type Registry (20+ Types)
│   ├── gpioConfig.ts         # GPIO Pin Konfiguration
│   ├── wifiStrength.ts       # WiFi Signal Berechnung
│   ├── zoneColors.ts         # Zone Farben
│   └── index.ts              # Re-Exports
│
├── views/                    # Page Views (15 Dateien)
│   ├── DashboardView.vue     # ⭐ Dashboard + ESP-Übersicht (/)
│   ├── DevicesView.vue       # ⚠️ DEPRECATED → Redirect zu /
│   ├── DeviceDetailView.vue  # ⚠️ DEPRECATED → Redirect zu /?openSettings={id}
│   ├── SensorsView.vue       # ⭐ Komponenten mit Tabs: Sensoren | Aktoren (/sensors)
│   ├── ActuatorsView.vue     # ⚠️ DEPRECATED → Redirect zu /sensors?tab=actuators
│   ├── LogicView.vue         # Automation Rules (/logic)
│   ├── DatabaseExplorerView.vue # Database Explorer (/database)
│   ├── AuditLogView.vue      # Audit Logs (/audit)
│   ├── MqttLogView.vue       # MQTT Logs (/mqtt-log)
│   ├── LoadTestView.vue      # Load Testing (/load-test)
│   ├── MaintenanceView.vue   # Maintenance Jobs (/maintenance)
│   ├── SystemConfigView.vue  # System Config (/system-config)
│   ├── UserManagementView.vue # User Management (/users)
│   ├── SettingsView.vue      # Einstellungen (/settings)
│   ├── LoginView.vue         # Login (/login)
│   ├── SetupView.vue         # Initial Setup (/setup)
│   └── LogViewerView.vue     # Log Viewer (/logs)
│
├── router/                   # Vue Router (1 Datei)
│   └── index.ts              # Routes + Navigation Guards
│
├── App.vue                   # Root Component
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
| `logs.ts` | `/logs/*` | Log Viewer |
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
'esp_health'      → handleEspHealth()      // Heartbeat Updates
'sensor_data'     → handleSensorData()     // Live Sensor Values
'actuator_status' → handleActuatorStatus() // Actuator State
'actuator_alert'  → handleActuatorAlert()  // Emergency/Timeout
'config_response' → handleConfigResponse() // Config ACK
'zone_assignment' → handleZoneAssignment() // Zone ACK
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

### Routen-Struktur

```typescript
// Public Routes
'/login'  → LoginView.vue
'/setup'  → SetupView.vue

// Protected Routes (requiresAuth: true)
'/'               → DashboardView.vue (mit ?openSettings={id} Support)
'/sensors'        → SensorsView.vue (Tabs: Sensoren | Aktoren)
'/logic'          → LogicView.vue
'/mqtt-log'       → MqttLogView.vue
'/audit'          → AuditLogView.vue
'/settings'       → SettingsView.vue

// Admin Routes (requiresAdmin: true)
'/database'       → DatabaseExplorerView.vue
'/logs'           → LogViewerView.vue
'/users'          → UserManagementView.vue
'/system-config'  → SystemConfigView.vue
'/load-test'      → LoadTestView.vue
'/maintenance'    → MaintenanceView.vue

// Redirects (Stand: 2025-01-04)
'/devices'        → redirect to '/'
'/devices/:espId' → redirect to '/?openSettings={espId}'
'/actuators'      → redirect to '/sensors?tab=actuators'
'/mock-esp'       → redirect to '/'
'/mock-esp/:espId' → redirect to '/?openSettings={espId}'
```

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

**Version:** 5.0 (Cleanup & Dokumentation Update)
**Letzte Aktualisierung:** 2025-01-02
