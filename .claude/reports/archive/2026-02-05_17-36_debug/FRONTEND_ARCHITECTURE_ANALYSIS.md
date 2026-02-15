# Frontend-Vollanalyse: IST-Zustand

> **Projekt:** AutomationOne - El Frontend (Vue 3 Dashboard)
> **Analysedatum:** 2026-02-05
> **Modus:** Dokumentation des IST-Zustands
> **Ziel:** Vollständige Wissensbasis für Technical Manager

---

## Executive Summary

Das Frontend ist eine **Vue 3 + TypeScript + Pinia + Tailwind CSS** Single-Page-Application mit:

| Aspekt | Implementierung |
|--------|-----------------|
| **Framework** | Vue 3.5 mit Composition API (Setup Script) |
| **State Management** | Pinia 2.3 |
| **HTTP-Client** | Axios 1.10 mit Interceptors |
| **Real-time** | WebSocket (Singleton Service) |
| **Styling** | Tailwind CSS 3.4 + Custom CSS Variables |
| **Build Tool** | Vite 6.2 |
| **Charts** | Chart.js 4.5 + vue-chartjs |
| **Icons** | Lucide Vue Next |

**Architektur-Prinzip:** Server-zentrisch. Frontend zeigt nur an und sammelt Input - alle Business-Logic liegt im Backend (El Servador).

---

## 1. Projektstruktur

### 1.1 Verzeichnisbaum (`El Frontend/src/`)

```
src/
├── api/                    # HTTP-Clients (Axios)
│   ├── index.ts           # Axios Instance + Interceptors
│   ├── auth.ts            # Authentication Endpoints
│   ├── esp.ts             # ESP32 Device Management
│   ├── sensors.ts         # Sensor CRUD + Data
│   ├── actuators.ts       # Actuator Control
│   ├── logic.ts           # Automation Rules
│   ├── zones.ts           # Zone Management
│   ├── subzones.ts        # Subzone Management
│   ├── logs.ts            # Server Logs
│   ├── audit.ts           # Audit Trail
│   ├── database.ts        # DB Queries
│   ├── errors.ts          # Error Logging
│   ├── config.ts          # System Config
│   ├── health.ts          # Health Checks
│   ├── loadtest.ts        # Load Testing
│   └── debug.ts           # Debug Tools
│
├── assets/                 # Statische Ressourcen
│
├── components/             # Vue 3 Komponenten
│   ├── charts/            # ChartContainer, MultiSensorChart
│   ├── common/            # ToastContainer, Badge, LoadingState
│   ├── dashboard/         # Dashboard-spezifische Komponenten
│   ├── database/          # Database UI
│   ├── error/             # ErrorDetailsModal, ErrorBoundary
│   ├── esp/               # ESPCard, ESPOrbitalLayout, Satellites
│   ├── filters/           # FilterBar, QueryFilterPanel
│   ├── layout/            # MainLayout, Header, Sidebar
│   ├── modals/            # Modal Dialogs
│   ├── safety/            # EmergencyStop, SafetyIndicator
│   ├── system-monitor/    # System Monitor Tabs
│   └── zones/             # ZoneCard, ZoneManager
│
├── composables/            # Reusable Composition Logic
│   ├── index.ts           # Re-exports
│   ├── useWebSocket.ts    # WebSocket Subscription
│   ├── useToast.ts        # Toast Notifications
│   ├── useModal.ts        # Modal Management
│   ├── useGpioStatus.ts   # GPIO Status Fetching
│   ├── useConfigResponse.ts # Config Response Handling
│   ├── useQueryFilters.ts # URL Query Parameter Filters
│   ├── useZoneDragDrop.ts # Zone Drag & Drop Logic
│   └── useSwipeNavigation.ts # Mobile Swipe
│
├── router/                 # Vue Router
│   └── index.ts           # Route Definitions + Guards
│
├── services/               # Singleton Services
│   └── websocket.ts       # WebSocket Service
│
├── stores/                 # Pinia State Management
│   ├── auth.ts            # Authentication State
│   ├── esp.ts             # Device State (größter Store)
│   ├── logic.ts           # Automation Rules State
│   ├── dragState.ts       # Drag & Drop State
│   └── database.ts        # Database Query State
│
├── types/                  # TypeScript Definitions
│   ├── index.ts           # Zentrale Types (~979 Zeilen)
│   ├── websocket-events.ts # WS Event Types (~748 Zeilen)
│   ├── logic.ts           # Automation Rule Types (~221 Zeilen)
│   └── gpio.ts            # GPIO Types (~158 Zeilen)
│
├── utils/                  # Utility Functions
│   ├── formatters.ts      # Date/Number/Status Formatter (~631 Zeilen)
│   ├── labels.ts          # German Label Mappings
│   ├── gpioConfig.ts      # GPIO Defaults
│   ├── sensorDefaults.ts  # Sensor Type Defaults
│   ├── actuatorDefaults.ts # Actuator Type Defaults
│   ├── errorCodeTranslator.ts # Error Code → German
│   ├── eventGrouper.ts    # WS Event Grouping
│   ├── logMessageTranslator.ts # Log Translation
│   └── zoneColors.ts      # Dynamic Zone Colors
│
├── views/                  # Page Components
│   ├── DashboardView.vue  # Hauptseite
│   ├── SensorsView.vue    # Sensor/Actuator Verwaltung
│   ├── LogicView.vue      # Automation Editor
│   ├── SettingsView.vue   # User Settings
│   ├── SystemMonitorView.vue # Admin: System Monitor
│   ├── UserManagementView.vue # Admin: Users
│   ├── SystemConfigView.vue # Admin: System Config
│   ├── LoadTestView.vue   # Admin: Load Testing
│   ├── MaintenanceView.vue # Admin: Maintenance
│   ├── LoginView.vue      # Authentication
│   └── SetupView.vue      # Initial Setup
│
├── App.vue                 # Root Component
├── main.ts                 # Application Entry Point
└── style.css               # Global Styles (~800 Zeilen)
```

### 1.2 Konfigurationsdateien

#### vite.config.ts
```typescript
// Zeilen 1-27
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://el-servador:8000', changeOrigin: true },
      '/ws': { target: 'ws://el-servador:8000', ws: true }
    }
  }
})
```

#### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

#### tailwind.config.js (Custom Theme)
```javascript
// Zeilen 10-139
theme: {
  extend: {
    colors: {
      // Dark Theme Palette
      dark: { 50: '#f8f8fc', ..., 950: '#05050a' },
      // Iridescent Colors
      iridescent: { 1: '#60a5fa', 2: '#818cf8', 3: '#a78bfa', 4: '#c084fc' },
      // Status Colors
      success: '#34d399', warning: '#fbbf24', danger: '#f87171', info: '#60a5fa',
      // Mock vs Real
      mock: '#a78bfa', real: '#22d3ee',
      // ESP Status
      esp: { online: '#34d399', offline: '#606070', error: '#f87171', safe: '#fbbf24' }
    },
    animation: {
      'shimmer': 'shimmer 4s infinite',
      'pulse-slow': 'pulse 3s infinite',
      'skeleton': 'skeleton-loading 1.5s infinite'
    },
    screens: { '3xl': '1600px', '4xl': '1920px' }
  }
}
```

#### package.json Dependencies
```json
{
  "dependencies": {
    "vue": "^3.5.13",
    "vue-router": "^4.5.0",
    "pinia": "^2.3.0",
    "axios": "^1.10.0",
    "chart.js": "^4.5.0",
    "vue-chartjs": "^5.3.2",
    "lucide-vue-next": "^0.468.0",
    "date-fns": "^4.1.0",
    "@vueuse/core": "^10.11.1",
    "vue-draggable-plus": "^0.6.0"
  },
  "devDependencies": {
    "vite": "^6.2.4",
    "typescript": "~5.7.2",
    "tailwindcss": "^3.4.17",
    "vue-tsc": "^2.2.0"
  }
}
```

---

## 2. Type-System

### 2.1 Zentrale Types (`src/types/index.ts`)

#### ESP Device Interface (Zeilen 275-306)
```typescript
interface MockESP {
  esp_id: string                    // Hardware ID (MAC-basiert)
  name: string | null               // User-definierter Name
  zone_id: string | null            // Zugewiesene Zone
  zone_name: string | null          // Zone Display-Name
  system_state: MockSystemState     // BOOT | WIFI_SETUP | MQTT_SETUP | REGISTERING |
                                    // CONFIG_PENDING | CONFIGURING | OPERATIONAL |
                                    // SAFE_MODE | ERROR
  status: 'online' | 'offline' | 'pending_approval' | 'approved' | 'rejected' | 'error'
  sensors: MockSensor[]
  actuators: MockActuator[]
  heap_free: number                 // Bytes
  wifi_rssi: number                 // dBm (-100 bis 0)
  uptime: number                    // Sekunden
  last_heartbeat: string | null     // ISO Timestamp
  hardware_type?: string            // 'MOCK_ESP32_WROOM' | 'ESP32_WROOM_32' | etc.
  connected?: boolean               // WebSocket-Connection Status
}
```

#### Sensor Interface (Zeilen 234-263)
```typescript
interface MockSensor {
  gpio: number                      // GPIO Pin (0-48)
  sensor_type: string               // 'DS18B20' | 'pH' | 'EC' | 'DHT22' | etc.
  name: string | null
  subzone_id: string | null

  // Single-Value (Legacy)
  raw_value: number
  processed_value: number
  unit: string                      // '°C' | 'pH' | 'mS/cm' | '%' | etc.
  quality: QualityLevel             // 'excellent' | 'good' | 'fair' | 'poor' | 'stale'

  // Operating Mode
  operating_mode: 'continuous' | 'on_demand' | 'scheduled' | 'paused'
  timeout_seconds: number
  is_stale: boolean
  stale_reason: string | null

  // Phase 6: Multi-Value Support
  device_type?: string | null       // 'sht31' | 'bmp280' | 'aht20' | etc.
  multi_values?: Record<string, MultiValueEntry>  // { 'TEMPERATURE': {...}, 'HUMIDITY': {...} }
  is_multi_value?: boolean

  // Phase 6: OneWire
  onewire_address?: string          // 64-bit OneWire Address
  interface_type?: 'gpio' | 'onewire' | 'i2c'
}

interface MultiValueEntry {
  value: number
  unit: string
  quality: QualityLevel
  timestamp?: string
}
```

#### Actuator Interface (Zeilen 265-273)
```typescript
interface MockActuator {
  gpio: number
  actuator_type: string             // 'relay' | 'pwm' | 'pump' | 'fan' | 'valve'
  name: string | null
  state: boolean                    // ON/OFF
  pwm_value?: number                // 0-255 für PWM
  emergency_stopped?: boolean
  last_command?: string
}
```

#### Quality Level Type
```typescript
type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'stale' | 'error' | 'unknown'
```

### 2.2 WebSocket Event Types (`src/types/websocket-events.ts`)

#### Base Event Interface (Zeilen 20-33)
```typescript
interface WebSocketEventBase {
  event: string
  timestamp: string                 // ISO 8601
  severity: 'info' | 'warning' | 'error' | 'critical'
  source_type: 'esp32' | 'user' | 'system' | 'api' | 'mqtt' | 'scheduler'
  source_id: string                 // Device/User ID
  data: Record<string, unknown>
}
```

#### Event Types (vollständige Liste)
| Event Type | Data Fields | Beschreibung |
|------------|-------------|--------------|
| `sensor_data` | esp_id, gpio, value, unit, quality | Sensor-Messwert |
| `actuator_status` | esp_id, gpio, state, value, emergency_stopped | Aktor-Status |
| `esp_health` | esp_id, status, heap_free, wifi_rssi, uptime | Heartbeat |
| `config_response` | esp_id, status, config_hash, error_code | Config-Bestätigung |
| `device_discovered` | esp_id, hardware_type, firmware_version | Neue ESP gefunden |
| `device_rediscovered` | esp_id | Bekannte ESP zurück online |
| `device_approved` | esp_id, approved_by | ESP genehmigt |
| `device_rejected` | esp_id, rejected_by, reason | ESP abgelehnt |
| `actuator_response` | esp_id, gpio, action, success | Befehl bestätigt |
| `actuator_alert` | esp_id, gpio, alert_type | Notfall/Timeout |
| `zone_assignment` | esp_id, zone_id, assigned_by | Zone zugewiesen |
| `logic_execution` | rule_id, condition_met, actions_executed | Regel ausgeführt |
| `sequence_started/step/completed` | sequence_id, step_index, status | Sequenz-Events |
| `server_log` | level, logger, message, exception | Server-Log (WARNING+) |
| `error_event` | esp_id, error_code, title, troubleshooting[] | ESP-Fehler |
| `system_event` | event_type, details | Wartungs-Events |
| `sensor_health` | esp_id, gpio, health_status | Sensor-Timeout/Recovery |
| `notification` | channel, target, message | Automation-Benachrichtigung |

#### Unified Event (für System Monitor, Zeilen 668-709)
```typescript
interface UnifiedEvent {
  id: string                        // UUID
  timestamp: string
  event_type: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  source: 'server' | 'mqtt' | 'database' | 'esp' | 'logic' | 'user'
  esp_id?: string
  zone_id?: string
  message: string                   // German Text
  error_code?: number | string
  correlation_id?: string
  data: Record<string, unknown>
  _sourceType?: 'server' | 'websocket'
}
```

### 2.3 Logic Rule Types (`src/types/logic.ts`)

```typescript
interface LogicRule {
  id: string
  name: string
  enabled: boolean
  conditions: LogicCondition[]
  logic_operator: 'AND' | 'OR'
  actions: LogicAction[]
  priority: number                  // Höher = früher ausgeführt
  cooldown_seconds?: number         // Mindestzeit zwischen Ausführungen
  max_executions_per_hour?: number
}

// Condition Types
type LogicCondition =
  | SensorCondition           // Sensor-Wert Vergleich
  | TimeCondition             // Zeitfenster
  | ActuatorStateCondition    // Aktor-Status
  | SystemStateCondition      // ESP-Status

interface SensorCondition {
  type: 'sensor' | 'sensor_threshold'
  esp_id: string
  gpio: number
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between'
  value: number
  min?: number                // Für 'between'
  max?: number
}

// Action Types
type LogicAction =
  | ActuatorAction           // Aktor schalten
  | NotificationAction       // Benachrichtigung senden
  | LogAction                // Log-Eintrag erstellen

interface ActuatorAction {
  type: 'actuator' | 'actuator_command'
  esp_id: string
  gpio: number
  command: 'ON' | 'OFF' | 'PWM' | 'TOGGLE'
  value?: number             // Für PWM (0.0-1.0)
  duration?: number          // Auto-off nach N Sekunden
}
```

### 2.4 GPIO Types (`src/types/gpio.ts`)

```typescript
type GpioOwner = 'sensor' | 'actuator' | 'system'
type GpioSource = 'database' | 'esp_reported' | 'static'

interface GpioUsageItem {
  gpio: number               // 0-48
  owner: GpioOwner
  component: string          // z.B. "DS18B20", "pump_1"
  name: string | null
  id: string | null          // DB UUID
  source: GpioSource
}

interface GpioStatusResponse {
  esp_id: string
  available: number[]        // Freie Pins
  reserved: GpioUsageItem[]  // Belegte Pins
  system: number[]           // Flash, UART, Boot Pins
  onewire_buses?: OneWireBusInfo[]
  hardware_type: string
  last_esp_report: string | null
}
```

---

## 3. Router-Konfiguration

### 3.1 Route Definitions (`src/router/index.ts`)

#### Public Routes
| Path | Name | Component | Description |
|------|------|-----------|-------------|
| `/login` | login | LoginView | Authentifizierung |
| `/setup` | setup | SetupView | Initial Setup (erster Admin) |

#### Protected Routes (unter MainLayout)
| Path | Name | Component | Auth | Admin | Title |
|------|------|-----------|------|-------|-------|
| `/` | dashboard | DashboardView | ✓ | - | Dashboard |
| `/sensors` | sensors | SensorsView | ✓ | - | Komponenten |
| `/logic` | logic | LogicView | ✓ | - | Automatisierung |
| `/settings` | settings | SettingsView | ✓ | - | Einstellungen |
| `/system-monitor` | system-monitor | SystemMonitorView | ✓ | ✓ | System Monitor |
| `/users` | users | UserManagementView | ✓ | ✓ | Benutzerverwaltung |
| `/system-config` | system-config | SystemConfigView | ✓ | ✓ | Systemkonfiguration |
| `/load-test` | load-test | LoadTestView | ✓ | ✓ | Last-Tests |
| `/maintenance` | maintenance | MaintenanceView | ✓ | ✓ | Wartung |

#### Deprecated Routes (mit Redirects)
```typescript
{ path: '/devices', redirect: '/' }
{ path: '/devices/:espId', redirect: to => `/?openSettings=${to.params.espId}` }
{ path: '/mock-esp', redirect: '/' }
{ path: '/database', redirect: '/system-monitor?tab=database' }
{ path: '/logs', redirect: '/system-monitor?tab=logs' }
{ path: '/audit', redirect: '/system-monitor?tab=events' }
{ path: '/mqtt-log', redirect: '/system-monitor?tab=mqtt' }
{ path: '/actuators', redirect: '/sensors?tab=actuators' }
```

### 3.2 Navigation Guards (Zeilen 150-180)

```typescript
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // 1. Initial Auth-Status Check (einmalig)
  if (authStore.setupRequired === null) {
    await authStore.checkAuthStatus()
  }

  // 2. Redirect zu Setup wenn noch kein Admin existiert
  if (authStore.setupRequired && to.name !== 'setup') {
    return next({ name: 'setup' })
  }

  // 3. Auth-Check für geschützte Routes
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // 4. Admin-Check für Admin-Only Routes
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return next({ name: 'dashboard' })
  }

  // 5. Redirect authentifizierte User weg von Login/Setup
  if (authStore.isAuthenticated && (to.name === 'login' || to.name === 'setup')) {
    return next({ name: 'dashboard' })
  }

  next()
})
```

### 3.3 Route Meta Fields
```typescript
interface RouteMeta {
  requiresAuth?: boolean    // Braucht Authentifizierung
  requiresAdmin?: boolean   // Braucht Admin-Rolle
  title?: string            // Seiten-Titel für Header
}
```

---

## 4. Application Bootstrap

### 4.1 main.ts
```typescript
// Zeilen 1-14
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())      // Pinia State Management
app.use(router)             // Vue Router
app.mount('#app')
```

### 4.2 App.vue
```vue
<script setup lang="ts">
// Root Component Verantwortungen:
// 1. RouterView rendern
// 2. Auth-Status beim Start prüfen
// 3. Global Toast-Nachrichten anzeigen
// 4. Error-Details Modal verwalten
// 5. WebSocket-Cleanup bei Unmount

import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEspStore } from '@/stores/esp'
import { onMounted, onUnmounted, ref } from 'vue'
import ToastContainer from '@/components/common/ToastContainer.vue'
import ErrorDetailsModal from '@/components/error/ErrorDetailsModal.vue'

const authStore = useAuthStore()
const espStore = useEspStore()

onMounted(async () => {
  await authStore.checkAuthStatus()
  window.addEventListener('show-error-details', handleShowErrorDetails)
})

onUnmounted(() => {
  espStore.cleanupWebSocket()
  window.removeEventListener('show-error-details', handleShowErrorDetails)
})
</script>

<template>
  <RouterView />
  <ToastContainer />
  <ErrorDetailsModal :error="errorModalData" :open="errorModalOpen" @close="errorModalOpen = false" />
</template>
```

---

## 5. Dashboard-Architektur

### 5.1 Layout-Struktur (`src/views/DashboardView.vue`)

```
DashboardView (Zeilen 379-607)
│
├── ActionBar (Zeilen 382-400)
│   ├── Status-Pills (Online/Offline/Warning/SafeMode Count)
│   ├── Filter-Controls
│   └── Pending-Devices Badge
│
├── dashboard-main-layout (Flex Container)
│   │
│   ├── zone-groups-wrapper (flex: 1)
│   │   │
│   │   ├── CrossEspConnectionOverlay (SVG, z-index: 1, absolut)
│   │   │   └── Logic-Verbindungen zwischen ESPs
│   │   │
│   │   └── zone-groups-container (CSS Grid)
│   │       │
│   │       └── ZoneGroup (VueDraggable, für jede Zone)
│   │           │
│   │           └── template #device="{ device }"
│   │               │
│   │               └── ESPOrbitalLayout
│   │                   ├── Left Column: Sensors (vertikal)
│   │                   ├── Center Column: ESPCard
│   │                   └── Right Column: Actuators (vertikal)
│   │
│   └── ComponentSidebar (rechts, fixed width)
│       ├── Add Sensor Types
│       └── Add Actuator Types
│
├── UnassignedDropBar (fixed bottom)
│   └── Drop-Target für Zone-Entfernung
│
├── PendingDevicesPanel (Slide-over)
│   └── Neu entdeckte ESPs zur Genehmigung
│
└── ESPSettingsPopover (Floating)
    └── Device-Details & Einstellungen
```

### 5.2 CSS Grid Layout (Zeilen 566-607)

```css
.zone-groups-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  gap: 1rem;
  padding-bottom: 60px;  /* Platz für UnassignedDropBar */
}

/* Desktop (≥1600px): Mehr Platz pro Zone */
@media (min-width: 1600px) {
  .zone-groups-container {
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  }
}

/* Mobile (<768px): 1 Spalte */
@media (max-width: 767px) {
  .zone-groups-container {
    grid-template-columns: 1fr;
  }
}
```

### 5.3 ESPOrbitalLayout (WICHTIG: Name ist irreführend!)

**Datei:** `src/components/esp/ESPOrbitalLayout.vue`

**REALITÄT:** Trotz des Namens ist dies ein **3-Spalten CSS Grid Layout**, NICHT ein orbitales/kreisförmiges Layout:

```
┌─────────────────────────────────────────────────────────┐
│                    ESPOrbitalLayout                     │
├─────────────┬─────────────────────────┬─────────────────┤
│   Sensors   │        ESP-Card         │    Actuators    │
│  (vertikal) │        (center)         │    (vertikal)   │
│             │                         │                 │
│  ┌───────┐  │  ┌───────────────────┐  │  ┌───────────┐  │
│  │Sensor1│  │  │                   │  │  │ Actuator1 │  │
│  └───────┘  │  │   Device Name     │  │  └───────────┘  │
│  ┌───────┐  │  │   Status Badges   │  │  ┌───────────┐  │
│  │Sensor2│  │  │   Quick Stats     │  │  │ Actuator2 │  │
│  └───────┘  │  │   Satellite Dots  │  │  └───────────┘  │
│  ┌───────┐  │  │   Actions         │  │                 │
│  │Sensor3│  │  │                   │  │                 │
│  └───────┘  │  └───────────────────┘  │                 │
│             │                         │                 │
└─────────────┴─────────────────────────┴─────────────────┘
```

**Implementierung:**
- CSS `display: grid; grid-template-columns: auto 1fr auto;`
- Sensoren links in Flexbox-Spalte
- Aktuatoren rechts in Flexbox-Spalte
- KEINE trigonometrischen Berechnungen
- KEIN Canvas/SVG für Positionierung

---

## 6. ESP-Card Komponente

### 6.1 Props & Events (`src/components/esp/ESPCard.vue`)

```typescript
// Props (Zeilen 79-91)
interface Props {
  esp: ESPDevice
  heartbeatLoading?: boolean
  deleteLoading?: boolean
}

// Events (Zeilen 93-97)
const emit = defineEmits<{
  heartbeat: [espId: string]
  delete: [espId: string]
  nameUpdated: [espId: string, newName: string | null]
}>()
```

### 6.2 Status-Visualisierung

#### Status-Mapping (Zeilen 247-265)
| Status | Label (DE) | Variant | Farbe |
|--------|-----------|---------|-------|
| `online` | Online | success | #34d399 |
| `offline` | Offline | gray | #606070 |
| `error` | Fehler | danger | #ef4444 |
| `pending_approval` | Wartet auf Freigabe | warning | #fbbf24 |
| `approved` | Freigegeben | info | #60a5fa |
| `rejected` | Abgelehnt | danger | #ef4444 |
| `SAFE_MODE` (system_state) | Sicherheitsmodus | warning | #fbbf24 |
| `ERROR` (system_state) | Systemfehler | danger | #ef4444 |

#### Status-Bar (linker Rand, 4px)
```css
/* Mock vs Real */
.esp-card__status-bar--mock { background-color: var(--color-mock); }      /* #a78bfa Lila */
.esp-card__status-bar--real { background-color: var(--color-real); }      /* #22d3ee Cyan */

/* Status-spezifisch */
.esp-card__status-bar--offline { background-color: #404050; }
.esp-card__status-bar--warning { background-color: var(--color-warning); }
.esp-card__status-bar--error {
  background-color: var(--color-error);
  animation: pulse 1.5s infinite;
}
.esp-card__status-bar--orphaned {
  background-color: var(--color-warning);
  animation: pulse 1.5s infinite;
}
```

### 6.3 Card-Aufbau (Zeilen 579-927)

```
ESPCard
│
├── Status-Bar (linker Rand, 4px)
│
├── Header (Zeilen 585-700)
│   ├── Editable Name (Click → Input, Enter → Save)
│   ├── ESP-ID (Monospace, kleinere Schrift)
│   ├── MOCK/REAL Badge (Lila/Cyan)
│   └── Status Badges (online, safe-mode, emergency, orphaned)
│
├── Zone Info (Zeilen 703-711)
│   ├── Icon (MapPin)
│   └── Zone-Name oder "Keine Zone" (dashed border)
│
├── Offline Info (Zeilen 714-724, nur wenn offline)
│   ├── Icon (Zap/Clock/Power je nach Grund)
│   ├── Text ("Verbindung verloren", "Timeout", etc.)
│   └── Relative Zeit + Tooltip mit absolutem Timestamp
│
├── Data Source & Freshness (Zeilen 727-754)
│   ├── Quelle: "Live-Speicher" vs "Datenbank"
│   ├── Freshness: "Live" / "Aktuell" / "Veraltet"
│   └── Warning wenn Daten unvollständig
│
├── Quick Stats (Zeilen 757-792)
│   ├── Sensors: Icon + Count
│   ├── Actuators: Icon + Count
│   ├── Uptime: formatiert ("5d 12h")
│   ├── Heap: formatiert ("156 KB")
│   └── WiFi: 4 Balken + Qualität-Label
│
├── Satellite Dots (Zeilen 795-823, nur wenn Sensors/Actuators > 0)
│   ├── Sensor Dots: Kreise, farbig nach Quality
│   │   ├── good/excellent: Grün
│   │   ├── fair: Orange
│   │   └── poor/bad: Rot
│   └── Actuator Dots: Quadrate mit Rundung
│       ├── ON: Grün + Pulse
│       ├── OFF: Dunkelgrau
│       └── E-STOP: Rot + Pulse
│
├── Heartbeat Indicator (Zeilen 825-855, nur wenn vorhanden)
│   ├── Heart Icon
│   ├── Relative Zeit ("vor 5 Sek")
│   ├── Pulse-Animation wenn < 30 Sek
│   └── Clickable für Mock ESPs (Trigger Heartbeat)
│
└── Actions (Zeilen 866-926)
    ├── Details Link → /?openSettings={espId}
    ├── Logs Button → /system-monitor?tab=logs&esp={espId}
    ├── Heartbeat Button (nur Mock)
    ├── Settings Button (nur Real)
    └── Delete Button (mit Confirm)
```

---

## 7. Sensor & Actuator Satellites

### 7.1 SensorSatellite (`src/components/esp/SensorSatellite.vue`)

#### Props (Zeilen 30-60)
```typescript
interface Props {
  espId: string
  gpio: number
  sensorType: string           // 'DS18B20', 'pH', 'EC', etc.
  name?: string | null
  value: number                // Single-value fallback
  quality: QualityLevel
  unit?: string
  selected?: boolean
  showConnections?: boolean
  draggable?: boolean

  // Phase 6: Multi-Value
  deviceType?: string | null   // 'sht31', 'bmp280'
  multiValues?: Record<string, MultiValueEntry>
  isMultiValue?: boolean
}
```

#### Aufbau (Zeilen 296-354)
```
SensorSatellite (72-220px Breite je nach Value-Count)
│
├── Header
│   ├── Icon (farbig nach Quality: grün/orange/rot/grau)
│   ├── Label (Sensor-Name oder Sensor-Type)
│   └── GPIO Badge (z.B. "GPIO 4")
│
├── Values Section (CSS Grid)
│   ├── Single-Value: 1 Spalte, 1.125rem Schrift
│   ├── Multi-Value (2): 2 Spalten, 0.9375rem
│   └── Multi-Value (3): 3 Spalten, 0.8125rem
│
├── Quality Indicator
│   ├── Dot (farbig)
│   └── Label ("Gut", "Akzeptabel", etc.)
│
└── Connection Indicator (nur wenn showConnections)
    └── Zeigt Anzahl verbundener Rules
```

#### Quality-Aggregation (Multi-Value)
```typescript
// Zeilen 129-136
const displayQuality = computed((): QualityLevel => {
  if (!isMultiValue || !multiValues) return props.quality
  const qualities = Object.values(multiValues).map(v => v.quality)
  return getWorstQuality(qualities)
})

// Priorität: error > stale > bad > poor > fair > good > excellent
```

### 7.2 ActuatorSatellite (`src/components/esp/ActuatorSatellite.vue`)

#### Props (Zeilen 21-42)
```typescript
interface Props {
  espId: string
  gpio: number
  actuatorType: string         // 'relay', 'pump', 'valve', 'fan'
  name?: string | null
  state: boolean               // ON/OFF
  pwmValue?: number            // 0-255
  emergencyStopped?: boolean
  selected?: boolean
  showConnections?: boolean
  draggable?: boolean
}
```

#### Aufbau (Zeilen 149-199)
```
ActuatorSatellite (52-130px Breite)
│
├── Icon (2rem Kreis)
│   ├── ON: Grün (#34d399)
│   ├── OFF: Dunkelgrau
│   └── E-STOP: Rot (#ef4444)
│
├── Status Badge
│   ├── Relay/Pump/Valve: "AN" / "AUS"
│   ├── PWM/Fan: "75%" (berechnet aus pwmValue)
│   ├── E-STOP: "E-STOP" rot
│   └── Pulse-Animation wenn aktiv
│
└── Label
    └── Actuator-Name oder Typ (0.625rem)
```

#### Status-Berechnung (Zeilen 92-110)
```typescript
const statusDisplay = computed(() => {
  if (props.emergencyStopped) {
    return { text: 'E-STOP', variant: 'danger' }
  }
  if (props.actuatorType === 'pwm' || props.actuatorType === 'fan') {
    const percent = Math.round((props.pwmValue / 255) * 100)
    return { text: `${percent}%`, variant: props.pwmValue > 0 ? 'success' : 'gray' }
  }
  return { text: props.state ? 'AN' : 'AUS', variant: props.state ? 'success' : 'gray' }
})
```

---

## 8. Drag & Drop System

### 8.1 Übersicht: Dual-System

| System | Library | Drag-Objekt | Drop-Target | Aktion |
|--------|---------|-------------|-------------|--------|
| Zone-Assignment | VueDraggable | ESP-Card | Andere Zone | Zone zuweisen |
| Sensor-Analyse | Native HTML5 | SensorSatellite | Chart-Panel | Zu Multi-Sensor-Chart hinzufügen |
| Add Component | Native HTML5 | Sidebar-Item | ESP-Card | Neuen Sensor/Actuator hinzufügen |

### 8.2 Drag State Store (`src/stores/dragState.ts`)

#### State (Zeilen 95-131)
```typescript
const isDraggingSensorType = ref(false)      // Sidebar → ESP
const sensorTypePayload = ref<SensorTypeDragPayload | null>(null)

const isDraggingSensor = ref(false)          // Satellite → Chart
const sensorPayload = ref<SensorDragPayload | null>(null)

const isDraggingEspCard = ref(false)         // ESP → Zone (VueDraggable)

const isDraggingActuatorType = ref(false)    // Sidebar → ESP
const actuatorTypePayload = ref<ActuatorTypeDragPayload | null>(null)

const dragStartTime = ref<number | null>(null)

const stats = ref<DragStats>({
  totalDrags: 0,
  successfulDrops: 0,
  cancelledDrags: 0,
  timeoutResets: 0
})
```

#### Safety-Mechanismen

**30-Sekunden Timeout (Zeilen 156-166):**
```typescript
const DRAG_TIMEOUT_MS = 30000

// Im Interval geprüft:
if (dragStartTime.value && Date.now() - dragStartTime.value > DRAG_TIMEOUT_MS) {
  console.warn('[DragState] Drag timeout - resetting')
  stats.value.timeoutResets++
  endDrag()
}
```

**Global Event Listeners (Zeilen 405-412):**
```typescript
// Capture-Phase für zuverlässiges Cleanup
window.addEventListener('dragend', handleGlobalDragEnd, { capture: true })

// Escape-Taste zum Abbrechen
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isAnyDragActive.value) {
    endDrag()
  }
})
```

#### Konflikt-Vermeidung (SensorSatellite, Zeilen 220-226)
```typescript
// Sensor-Drag deaktivieren während ESP-Card-Drag
const effectiveDraggable = computed(() => {
  if (dragStore.isDraggingEspCard) return false
  return props.draggable
})
```

### 8.3 Zone Drag & Drop (`src/composables/useZoneDragDrop.ts`)

#### VueDraggable Integration
```typescript
import { VueDraggable } from 'vue-draggable-plus'

// In ZoneGroup.vue Template:
<VueDraggable
  v-model="devices"
  group="esp-devices"
  @change="handleChange"
  @add="handleAdd"
  @start="handleStart"
  @unchoose="handleEnd"
>
```

#### Drop-Verarbeitung (Zeilen 183-261)
```typescript
async function handleDeviceDrop(payload: ZoneDropEvent): Promise<boolean> {
  const { device, fromZoneId, toZoneId } = payload

  // 1. Gleiche Zone → Skip
  if (fromZoneId === toZoneId) return false

  // 2. Zu Unassigned → Zone entfernen
  if (toZoneId === ZONE_UNASSIGNED) {
    return await handleRemoveFromZone(device)
  }

  // 3. API-Call
  try {
    await zonesApi.assignZone(device.id, { zone_id: toZoneId })
    await espStore.fetchAll()

    // 4. History für Undo/Redo
    pushToHistory({
      type: 'zone_change',
      deviceId: device.id,
      fromZoneId,
      toZoneId,
      timestamp: Date.now()
    })

    toast.success(`${device.name} zu Zone verschoben`)
    return true
  } catch (error) {
    toast.error('Fehler beim Verschieben')
    return false
  }
}
```

#### Zone-Konstanten (Zeilen 22-27)
```typescript
export const ZONE_UNASSIGNED = '__unassigned__' as const
export const ZONE_UNASSIGNED_DISPLAY_NAME = 'Nicht zugewiesen' as const
```

#### Undo/Redo (Zeilen 346-474)
- Max 20 History-Einträge
- `canUndo`, `canRedo` computed
- Full reversal mit API-Calls

---

## 9. Server-Verbindung

### 9.1 HTTP-Client (`src/api/index.ts`)

#### Axios Instance (Zeilen 5-11)
```typescript
const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})
```

#### Request Interceptor - Auth (Zeilen 14-28)
```typescript
api.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  const token = authStore.accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

#### Response Interceptor - Token Refresh (Zeilen 31-71)
```typescript
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config
    const authStore = useAuthStore()

    // Skip für Auth-Endpoints (verhindert Infinite Loop)
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/refresh')
                        || originalRequest?.url?.includes('/auth/login')
                        || originalRequest?.url?.includes('/auth/setup')

    // Bei 401 + nicht-Auth-Endpoint: Token refreshen
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true
      try {
        await authStore.refreshTokens()
        originalRequest.headers.Authorization = `Bearer ${authStore.accessToken}`
        return api(originalRequest)  // Retry mit neuem Token
      } catch (refreshError) {
        authStore.clearAuth()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  }
)
```

#### Helper Functions (Zeilen 76-89)
```typescript
export const get = <T>(url: string, config?) => api.get<T>(url, config).then(r => r.data)
export const post = <T>(url: string, data?, config?) => api.post<T>(url, data, config).then(r => r.data)
export const put = <T>(url: string, data?, config?) => api.put<T>(url, data, config).then(r => r.data)
export const del = <T>(url: string) => api.delete<T>(url).then(r => r.data)
export const patch = <T>(url: string, data?, config?) => api.patch<T>(url, data, config).then(r => r.data)
```

### 9.2 WebSocket Service (`src/services/websocket.ts`)

#### Singleton Pattern (Zeilen 42-79)
```typescript
class WebSocketService {
  private static instance: WebSocketService | null = null

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService()
    }
    return WebSocketService.instance
  }
}
```

#### URL & Authentifizierung (Zeilen 92-116)
```typescript
private getWebSocketUrl(): string {
  const isDev = import.meta.env.DEV
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = isDev ? 'localhost:8000' : window.location.host

  // JWT-Token in Query-Parameter (nicht Header, da WebSocket kein Custom-Header unterstützt)
  return `${protocol}//${host}/api/v1/ws/realtime/${this.clientId}?token=${encodeURIComponent(token)}`
}
```

#### Reconnect mit Exponential Backoff (Zeilen 251-280)
```typescript
private scheduleReconnect(): void {
  const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)  // 1s → 30s max
  const jitter = baseDelay * 0.1 * (Math.random() - 0.5)  // ±10%
  const delay = baseDelay + jitter

  setTimeout(() => {
    this.reconnectAttempts++
    this.connect()
  }, delay)
}
```

#### Tab-Visibility Handling (Zeilen 283-328)
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Bei Tab-Aktivierung: Schneller Reconnect
    this.reconnectAttempts = Math.max(0, this.reconnectAttempts - 2)
    if (this.state !== 'connected') {
      this.connect()
    }
  }
})
```

#### Event-Subscription Pattern (Zeilen 441-456)
```typescript
interface WebSocketFilters {
  types?: MessageType[]         // Event-Typen filtern
  esp_ids?: string[]            // Nur bestimmte ESPs
  sensor_types?: string[]       // Nur bestimmte Sensor-Typen
  topicPattern?: string         // MQTT Topic Pattern
}

function subscribe(filters: WebSocketFilters, callback: (msg) => void): string {
  const subscriptionId = generateId()
  this.subscriptions.set(subscriptionId, { filters, callback })
  return subscriptionId
}
```

#### Rate-Limiting (Zeilen 370-386)
```typescript
private readonly MAX_MESSAGES_PER_SECOND = 10

private handleMessage(event: MessageEvent): void {
  // Rate-Limit Check
  if (this.messagesThisSecond >= this.MAX_MESSAGES_PER_SECOND) {
    console.warn('WebSocket rate limit exceeded')
    return
  }
  this.messagesThisSecond++

  // Process message...
}
```

### 9.3 useWebSocket Composable (`src/composables/useWebSocket.ts`)

```typescript
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const websocketService = WebSocketService.getInstance()
  const subscriptionId = ref<string | null>(null)
  const messageHandlers = new Map<string, (msg: any) => void>()

  // Event-Handler registrieren
  function on(eventType: MessageType, callback: (msg) => void): () => void {
    messageHandlers.set(eventType, callback)
    return () => messageHandlers.delete(eventType)
  }

  // Cleanup bei Component-Unmount
  function cleanup(): void {
    stopStatusMonitor()
    messageHandlers.clear()
    if (subscriptionId.value) {
      websocketService.unsubscribe(subscriptionId.value)
      subscriptionId.value = null
    }
  }

  onUnmounted(cleanup)

  return { on, cleanup, connect, disconnect, status }
}
```

### 9.4 Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                         │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VUE COMPONENT                               │
│  (emit event / call store action / call API directly)           │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                      ┌───────────────┼───────────────┐
                      ▼               ▼               ▼
              ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
              │ Pinia Store  │ │  API Client  │ │  WebSocket   │
              │ (state)      │ │  (Axios)     │ │  Service     │
              └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                     │                │                │
                     │                ▼                │
                     │    ┌──────────────────────┐     │
                     │    │   HTTP Request       │     │
                     │    │   POST /api/v1/...   │     │
                     │    └──────────┬───────────┘     │
                     │               │                 │
                     │               ▼                 │
                     │    ┌──────────────────────┐     │
                     │    │   EL SERVADOR        │     │
                     │    │   (FastAPI)          │     │
                     │    └──────────┬───────────┘     │
                     │               │                 │
                     │      ┌────────┴────────┐        │
                     │      ▼                 ▼        │
                     │  ┌────────┐      ┌─────────┐    │
                     │  │Database│      │  MQTT   │    │
                     │  │(Postgres)     │ Broker  │    │
                     │  └────────┘      └────┬────┘    │
                     │                       │         │
                     │                       ▼         │
                     │              ┌──────────────┐   │
                     │              │ EL TRABAJANTE│   │
                     │              │   (ESP32)    │   │
                     │              └──────┬───────┘   │
                     │                     │           │
                     │         ┌───────────┴───────┐   │
                     │         │ MQTT Response/    │   │
                     │         │ Sensor Data       │   │
                     │         └───────────┬───────┘   │
                     │                     │           │
                     │                     ▼           │
                     │         ┌────────────────────┐  │
                     │         │   MQTT Handler     │  │
                     │         │   (Server)         │  │
                     │         └─────────┬──────────┘  │
                     │                   │             │
                     │                   ▼             │
                     │         ┌────────────────────┐  │
                     │         │ WebSocket Broadcast│◄─┘
                     │         │ (to all clients)   │
                     │         └─────────┬──────────┘
                     │                   │
                     │                   ▼
                     │         ┌────────────────────┐
                     └────────►│ Pinia Store Update │
                               │ (reactive state)   │
                               └─────────┬──────────┘
                                         │
                                         ▼
                               ┌────────────────────┐
                               │ Vue Component      │
                               │ (reactive render)  │
                               └────────────────────┘
```

---

## 10. Pinia Stores

### 10.1 Auth Store (`src/stores/auth.ts`)

#### State
```typescript
const user = ref<User | null>(null)
const accessToken = ref<string | null>(localStorage.getItem('el_frontend_access_token'))
const refreshToken = ref<string | null>(localStorage.getItem('el_frontend_refresh_token'))
const isLoading = ref(false)
const setupRequired = ref<boolean | null>(null)
const error = ref<string | null>(null)
```

#### Getters
```typescript
const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
const isAdmin = computed(() => user.value?.role === 'admin')
const isOperator = computed(() => ['admin', 'operator'].includes(user.value?.role || ''))
```

#### Actions
| Action | Beschreibung |
|--------|--------------|
| `checkAuthStatus()` | Initial Check: Setup erforderlich? Token gültig? |
| `login(credentials)` | Login + Tokens setzen + User laden |
| `setup(data)` | Initial Setup (erster Admin) |
| `refreshTokens()` | Token-Refresh via API |
| `logout(logoutAll?)` | Logout + WebSocket-Cleanup + Redirect |
| `setTokens(access, refresh)` | Tokens in localStorage + ref |
| `clearAuth()` | Alle Auth-Daten löschen |

### 10.2 ESP Store (`src/stores/esp.ts`)

#### State
```typescript
const devices = ref<ESPDevice[]>([])
const selectedEspId = ref<string | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const websocketConnected = ref(false)
const pendingApprovals = ref<PendingESPDevice[]>([])
```

#### Getters
```typescript
const onlineDevices = computed(() => devices.value.filter(d => d.status === 'online'))
const offlineDevices = computed(() => devices.value.filter(d => d.status === 'offline'))
const devicesByZone = computed(() => groupBy(devices.value, 'zone_id'))
const selectedDevice = computed(() => devices.value.find(d => d.esp_id === selectedEspId.value))
```

#### Actions
| Action | Beschreibung |
|--------|--------------|
| `fetchDevices()` | Alle Devices laden |
| `createDevice(data)` | Mock-ESP erstellen |
| `deleteDevice(id)` | Device löschen |
| `updateSensor(espId, gpio, data)` | Sensor aktualisieren |
| `updateActuator(espId, gpio, data)` | Actuator aktualisieren |
| `approveDevice(id)` | Pending Device genehmigen |
| `rejectDevice(id)` | Pending Device ablehnen |
| `initWebSocket()` | WebSocket verbinden + Subscriptions |
| `cleanupWebSocket()` | WebSocket trennen |

#### WebSocket-Integration
```typescript
function initWebSocket(): void {
  const ws = useWebSocket()

  ws.on('esp_health', (msg) => {
    updateDeviceHealth(msg.esp_id, msg.data)
  })

  ws.on('sensor_data', (msg) => {
    updateSensorValue(msg.esp_id, msg.gpio, msg.data)
  })

  ws.on('device_discovered', (msg) => {
    pendingApprovals.value.push(msg.data)
  })

  // ... weitere Event-Handler
}
```

### 10.3 Logic Store (`src/stores/logic.ts`)

#### State
```typescript
const rules = ref<LogicRule[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const activeExecutions = ref<Map<string, number>>(new Map())
const recentExecutions = ref<LogicExecutionEvent[]>([])
```

#### Getters
```typescript
// Für Visualisierung: Alle Sensor→Actuator Verbindungen
const connections = computed((): LogicConnection[] => {
  return rules.value.flatMap(rule => extractConnections(rule))
})

// Nur Cross-ESP Verbindungen (für CrossEspConnectionOverlay)
const crossEspConnections = computed(() => {
  return connections.value.filter(c => c.isCrossEsp)
})

const enabledRules = computed(() => rules.value.filter(r => r.enabled))
```

### 10.4 Drag State Store (`src/stores/dragState.ts`)

#### State
```typescript
const isDraggingSensorType = ref(false)
const isDraggingSensor = ref(false)
const isDraggingEspCard = ref(false)
const isDraggingActuatorType = ref(false)
const dragStartTime = ref<number | null>(null)
const stats = ref<DragStats>({ /* ... */ })
```

#### Computed
```typescript
const isAnyDragActive = computed(() => {
  return isDraggingSensorType.value
      || isDraggingSensor.value
      || isDraggingEspCard.value
      || isDraggingActuatorType.value
})
```

#### Actions
| Action | Beschreibung |
|--------|--------------|
| `startSensorTypeDrag(payload)` | Sidebar → ESP Drag |
| `startSensorDrag(payload)` | Satellite → Chart Drag |
| `startEspCardDrag()` | VueDraggable Zone-Drag |
| `startActuatorTypeDrag(payload)` | Sidebar → ESP Drag |
| `endDrag()` | Alle Drags zurücksetzen |
| `endEspCardDrag()` | Zone-Drag beenden |

---

## 11. Farbdesign (Iridescent + Glassmorphism)

### 11.1 CSS-Variablen (`src/style.css`)

#### Hintergrund-Farben (Zeilen 11-16)
```css
:root {
  --color-bg-primary: #0a0a0f;      /* Sehr dunkles Blau-Schwarz */
  --color-bg-secondary: #12121a;    /* Etwas heller */
  --color-bg-tertiary: #1a1a24;     /* Card-Hintergrund */
  --color-bg-quaternary: #22222e;   /* Hover-State */
  --color-bg-hover: #22222e;
}
```

#### Text-Farben (Zeilen 18-21)
```css
:root {
  --color-text-primary: #f0f0f5;    /* Hellweiß */
  --color-text-secondary: #b0b0c0;  /* Hellgrau */
  --color-text-muted: #707080;      /* Dunkelgrau */
}
```

#### Iridescent-Palette (Zeilen 23-27)
```css
:root {
  --color-iridescent-1: #60a5fa;    /* Blau */
  --color-iridescent-2: #818cf8;    /* Indigo */
  --color-iridescent-3: #a78bfa;    /* Lila */
  --color-iridescent-4: #c084fc;    /* Violet */
}
```

#### Iridescent-Gradienten (Zeilen 29-41)
```css
:root {
  --gradient-iridescent: linear-gradient(135deg,
    #60a5fa 0%,
    #818cf8 50%,
    #a78bfa 100%
  );

  --gradient-iridescent-full: linear-gradient(135deg,
    #60a5fa 0%,
    #818cf8 25%,
    #a78bfa 50%,
    #c084fc 75%,
    #60a5fa 100%
  );
}
```

#### Status-Farben (Zeilen 43-47)
```css
:root {
  --color-success: #34d399;         /* Grün - Online, Gut */
  --color-warning: #fbbf24;         /* Amber - Warnung, SafeMode */
  --color-error: #f87171;           /* Rot - Fehler, E-STOP */
  --color-info: #60a5fa;            /* Blau - Info */
}
```

#### Mock vs Real (Zeilen 49-51)
```css
:root {
  --color-mock: #a78bfa;            /* Lila - Mock ESPs */
  --color-real: #22d3ee;            /* Cyan - Echte ESPs */
}
```

### 11.2 Glassmorphism-System (Zeilen 53-59)
```css
:root {
  --glass-bg: rgba(255, 255, 255, 0.03);
  --glass-bg-light: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-border-hover: rgba(255, 255, 255, 0.15);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  --glass-shadow-glow: 0 0 20px rgba(96, 165, 250, 0.3);
}

.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.glass-overlay {
  background: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(4px);
}
```

### 11.3 Status-Indikatoren (Zeilen 340-368)

```css
.status-online { background-color: var(--color-success); }
.status-offline { background-color: var(--color-text-muted); }
.status-error { background-color: var(--color-error); }
.status-warning { background-color: var(--color-warning); }

.status-dot-pulse {
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### 11.4 Badges (Zeilen 286-334)

```css
.badge-success {
  background-color: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.badge-warning {
  background-color: rgba(251, 191, 36, 0.15);
  color: var(--color-warning);
}

.badge-danger {
  background-color: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
}

.badge-mock {
  background-color: rgba(167, 139, 250, 0.15);
  color: var(--color-mock);
  border: 1px solid rgba(167, 139, 250, 0.3);
}

.badge-real {
  background-color: rgba(34, 211, 238, 0.15);
  color: var(--color-real);
  border: 1px solid rgba(34, 211, 238, 0.3);
}
```

### 11.5 Iridescent-Effekte (Zeilen 518-555)

#### Iridescent Border
```css
.iridescent-border {
  border: 1px solid transparent;
  background:
    linear-gradient(var(--color-bg-secondary), var(--color-bg-secondary)) padding-box,
    linear-gradient(135deg, #60a5fa, #818cf8, #a78bfa, #c084fc, #60a5fa) border-box;
}
```

#### Shimmer-Animation (Water Reflection)
```css
.water-reflection::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg,
    transparent,
    rgba(255, 255, 255, 0.03),
    transparent
  );
  animation: shimmer 4s infinite;
}

@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 200%; }
}
```

#### Gradient Text
```css
.text-gradient {
  background-image: linear-gradient(135deg, #60a5fa, #a78bfa);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}
```

### 11.6 Zone-Farben (`src/utils/zoneColors.ts`)

```typescript
// Dynamische Zone-Farbzuweisung (Hash-basiert für Konsistenz)
const ZONE_COLORS = [
  { hex: '#60a5fa', rgb: '96, 165, 250' },   // Iridescent Blue
  { hex: '#34d399', rgb: '52, 211, 153' },   // Success Green
  { hex: '#a78bfa', rgb: '167, 139, 250' },  // Iridescent Purple
  { hex: '#22d3ee', rgb: '34, 211, 238' },   // Cyan
  { hex: '#fbbf24', rgb: '251, 191, 36' },   // Amber
  { hex: '#c084fc', rgb: '192, 132, 252' },  // Violet
  { hex: '#818cf8', rgb: '129, 140, 248' },  // Indigo
  { hex: '#f472b6', rgb: '244, 114, 182' },  // Pink
]

// Gleiche Zone-ID → immer gleiche Farbe
function getZoneColor(zoneId: string): ZoneColorSet {
  const hash = hashString(zoneId)
  const index = Math.abs(hash) % ZONE_COLORS.length
  return ZONE_COLORS[index]
}
```

---

## 12. Settings & Einstellungen

### 12.1 ESP-Settings Popover (`src/components/esp/ESPSettingsPopover.vue`)

#### Komponenten-Typ
- **Floating Popover** (nicht Modal, nicht Sidebar)
- Positioniert relativ zur ESP-Card
- Backdrop für Click-Outside-Close

#### Verfügbare Einstellungen

| Einstellung | Beschreibung | UI-Element |
|-------------|--------------|------------|
| Name | Device-Name ändern | Inline-Edit (Pencil-Icon) |
| Zone | Zone zuweisen/entfernen | Dropdown oder Drag-Drop |
| Heartbeat | Heartbeat triggern (Mock) | Button |
| Löschen | Device entfernen | Button + Confirm |

### 12.2 Sensor/Actuator-Settings (Modal)

Für detaillierte Konfiguration von Sensoren und Aktoren wird ein Modal verwendet.

---

## 13. Utility-Funktionen

### 13.1 Formatters (`src/utils/formatters.ts`)

#### Datum/Zeit (German-lokalisiert)
| Funktion | Output | Beispiel |
|----------|--------|----------|
| `formatDateTime()` | "15.12.2024, 14:30" | Vollständig |
| `formatDate()` | "15.12.2024" | Nur Datum |
| `formatTime()` | "14:30:45" | Nur Zeit |
| `formatRelativeTime()` | "vor 5 Minuten" | Relativ |
| `formatTimestamp()` | "15.12.2024, 14:30:45" | ISO → DE |

#### Zahlen
| Funktion | Output | Beispiel |
|----------|--------|----------|
| `formatNumber(23.456, 2)` | "23,46" | Komma-Dezimal |
| `formatInteger(1234)` | "1.234" | Tausender-Punkt |
| `formatSensorValue(23.5, '°C')` | "23,5 °C" | Wert + Einheit |
| `formatPercent(0.85)` | "85%" | Prozent |

#### Speicher/Größen
| Funktion | Output | Beispiel |
|----------|--------|----------|
| `formatBytes(1536)` | "1,5 KB" | Bytes → KB/MB |
| `formatHeapSize(131072)` | "128 KB" | Heap |

#### Uptime
| Funktion | Output | Beispiel |
|----------|--------|----------|
| `formatUptime(90061)` | "1d 1h 1m" | Sekunden → lesbar |
| `formatUptimeShort(90061)` | "1d 1h" | Kurz |

#### WiFi
| Funktion | Output | Beispiel |
|----------|--------|----------|
| `formatRssi(-65)` | "-65 dBm (Gut)" | RSSI + Qualität |
| `getRssiQuality(-65)` | "good" | Qualitäts-Level |

### 13.2 Labels (`src/utils/labels.ts`)

```typescript
// Quality Levels → Deutsche Labels
QUALITY_LABELS = {
  'excellent': 'Ausgezeichnet',
  'good': 'Gut',
  'fair': 'Akzeptabel',
  'poor': 'Schlecht',
  'stale': 'Veraltet'
}

// System States
STATE_LABELS = {
  'OPERATIONAL': 'Betriebsbereit',
  'SAFE_MODE': 'Sicherheitsmodus',
  'ERROR': 'Fehler'
}

// Actuator Types
ACTUATOR_TYPE_LABELS = {
  'relay': 'Relais',
  'pwm': 'PWM-Ausgang',
  'pump': 'Pumpe',
  'fan': 'Lüfter (PWM)',
  'valve': 'Ventil'
}
```

---

## 14. Kritische Dateien für Änderungen

| Bereich | Datei | Zeilen | Beschreibung |
|---------|-------|--------|--------------|
| **Dashboard Layout** | `views/DashboardView.vue` | 379-607 | Grid + Zone-Groups |
| **ESP-Card** | `components/esp/ESPCard.vue` | 1-1009 | Device-Anzeige |
| **Sensor Satellite** | `components/esp/SensorSatellite.vue` | 1-354 | Sensor-Widget |
| **Actuator Satellite** | `components/esp/ActuatorSatellite.vue` | 1-200 | Aktor-Widget |
| **Orbital Layout** | `components/esp/ESPOrbitalLayout.vue` | 1-800 | 3-Spalten Layout |
| **Connection Lines** | `components/esp/ConnectionLines.vue` | 1-340 | SVG Verbindungen |
| **Drag State** | `stores/dragState.ts` | 1-464 | Drag-Management |
| **Zone Drag-Drop** | `composables/useZoneDragDrop.ts` | 1-474 | Zone-Assignment |
| **WebSocket Service** | `services/websocket.ts` | 1-500 | Real-time |
| **API Client** | `api/index.ts` | 1-89 | HTTP + Interceptors |
| **Auth Store** | `stores/auth.ts` | 1-180 | Authentication |
| **ESP Store** | `stores/esp.ts` | 1-500 | Device State |
| **Types** | `types/index.ts` | 1-979 | Zentrale Types |
| **WS Events** | `types/websocket-events.ts` | 1-748 | Event Types |
| **Farben** | `style.css` | 10-100 | CSS Variablen |
| **Formatters** | `utils/formatters.ts` | 1-631 | Alle Formatter |

---

## 15. Nicht Implementiert / Offene Punkte

| Feature | Status | Bemerkung |
|---------|--------|-----------|
| Dark/Light Mode Toggle | CSS vorhanden | Kein UI-Toggle gefunden |
| Experten-Modus | Nicht implementiert | In Settings nicht vorhanden |
| PWA / Offline-First | Nicht implementiert | Kein Service Worker |
| i18n | Nicht implementiert | Hardcoded German |
| E2E Tests | Nicht gefunden | Nur Unit Tests (falls vorhanden) |

---

## Anhang: Vollständige Farbpalette

| Verwendung | Variable | Hex | RGB |
|------------|----------|-----|-----|
| Background Primary | `--color-bg-primary` | #0a0a0f | 10, 10, 15 |
| Background Secondary | `--color-bg-secondary` | #12121a | 18, 18, 26 |
| Background Tertiary | `--color-bg-tertiary` | #1a1a24 | 26, 26, 36 |
| Text Primary | `--color-text-primary` | #f0f0f5 | 240, 240, 245 |
| Text Secondary | `--color-text-secondary` | #b0b0c0 | 176, 176, 192 |
| Text Muted | `--color-text-muted` | #707080 | 112, 112, 128 |
| Iridescent Blue | `--color-iridescent-1` | #60a5fa | 96, 165, 250 |
| Iridescent Indigo | `--color-iridescent-2` | #818cf8 | 129, 140, 248 |
| Iridescent Purple | `--color-iridescent-3` | #a78bfa | 167, 139, 250 |
| Iridescent Violet | `--color-iridescent-4` | #c084fc | 192, 132, 252 |
| Success | `--color-success` | #34d399 | 52, 211, 153 |
| Warning | `--color-warning` | #fbbf24 | 251, 191, 36 |
| Error | `--color-error` | #f87171 | 248, 113, 113 |
| Info | `--color-info` | #60a5fa | 96, 165, 250 |
| Mock ESP | `--color-mock` | #a78bfa | 167, 139, 250 |
| Real ESP | `--color-real` | #22d3ee | 34, 211, 238 |

---

**Ende der IST-Zustand Analyse**

*Erstellt: 2026-02-05*
*Basierend auf: Code-Reading durch 3 parallele Explore-Agenten*
