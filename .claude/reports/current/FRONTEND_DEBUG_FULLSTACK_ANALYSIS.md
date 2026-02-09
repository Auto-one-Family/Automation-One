# Frontend Debug - Vollstaendige Stack-Analyse

**Erstellt:** 2026-02-08
**Zweck:** Bestandsaufnahme des gesamten Frontend-Stacks (El Frontend) als Grundlage fuer den Neubau des frontend-debug Agenten
**Methode:** Direkte Codebase-Analyse aller relevanten Dateien

---

## 1. IST-Zustand: Agent & Skill

### 1.1 Agent-Datei

**Pfad:** `.claude/agents/frontend/frontend-debug-agent.md` (202 Zeilen)

| Aspekt | IST |
|--------|-----|
| **Tools** | Read, Grep, Glob, Bash |
| **Model** | sonnet |
| **Modi** | A (Allgemeine Analyse), B (Spezifisches Problem) |
| **Abhaengigkeiten** | STATUS.md optional |
| **Primaere Quellen** | Source Code, Docker-Logs, Build-Logs |
| **Report** | `.claude/reports/current/FRONTEND_DEBUG_REPORT.md` |

**Staerken:**
- Eigenstaendige Analyse (kein TM-Format noetig)
- Erweiterte Faehigkeiten mit Docker/curl/API-Health
- Zwei klare Modi (A/B)
- Sicherheitsregeln definiert (kein build ohne Bestaetigung)

**Schwaechen:**
- Source-Code-Referenzen teilweise veraltet (Pfade)
- Kein Wissen ueber das exakte Type-System
- Keine Kenntnis der 26 WebSocket-Event-Typen
- Keine Info ueber Test-Infrastruktur (Vitest, Playwright)

### 1.2 Skill-Datei

**Pfad:** `.claude/skills/frontend-debug/SKILL.md` (427 Zeilen)

| Aspekt | IST |
|--------|-----|
| **Tools** | Read, Grep, Glob |
| **Fokus** | Log-Analyse, Error-Kategorien, Diagnose-Workflow |
| **Error-Kategorien** | Build (TS2xxx), Runtime (TypeError), WebSocket, API |
| **Referenzen** | WEBSOCKET_EVENTS.md, REST_ENDPOINTS.md, COMMUNICATION_FLOWS.md |

**Staerken:**
- Detaillierte Error-Kategorien (Build, Runtime, WebSocket, API)
- Vue Error Handler Pattern dokumentiert
- Diagnose-Workflow als Flowchart
- Source-Code Pattern-Analyse (Cleanup, Types, Imports)

**Schwaechen:**
- Skill hat Tools `Read, Grep, Glob` - Agent hat zusaetzlich `Bash` (Inkonsistenz)
- Vue Error Handler Pattern im Skill zeigt `JSON.stringify`, tatsaechlicher Code nutzt Object-Syntax
- Log-Locations verweisen auf `logs/current/` - Frontend hat dort keine eigenen Logs
- Browser-Console-Logs sind "nicht direkt lesbar" - korrekt, aber schlecht dokumentiert

### 1.3 Optimierungsplan (Agentplan.md, Sektion 2.4 + 3.4)

**Geplante Aenderungen:**
- Agent: Komplett umschreiben mit Bash, Model sonnet, eigenstaendig, zwei Modi
- Erweiterte Faehigkeiten: API-Health, Container-Status, Server-Log Scan, WS-Status
- Report-Name: `FRONTEND_DEBUG_REPORT.md` (ohne [MODUS]-Suffix)
- Sicherheitsregeln: npm-build nur mit Bestaetigung, curl nur GET

**Status:** Agent wurde bereits umgeschrieben (IST entspricht bereits dem SOLL). Skill noch nicht aktualisiert.

---

## 2. Build-Chain

### 2.1 Vite

**Config:** `El Frontend/vite.config.ts`

```
Vite 6.2.4
Plugin: @vitejs/plugin-vue 5.2.3
Port: 5173 (host: 0.0.0.0)
Alias: @ → ./src
Proxy:
  /api → http://el-servador:8000
  /ws  → ws://el-servador:8000 (WebSocket upgrade)
```

### 2.2 TypeScript

**Config:** `El Frontend/tsconfig.json`

```
Target: ES2020
Module: ESNext
Strict: true
noUnusedLocals: true
noUnusedParameters: true
noFallthroughCasesInSwitch: true
noUncheckedSideEffectImports: true
Path Alias: @/* → ./src/*
Include: src/**/*.ts, src/**/*.tsx, src/**/*.vue
```

**Node Config:** `El Frontend/tsconfig.node.json`
```
Target: ES2022, Lib: ES2023
composite: true, declaration: true
Include: vite.config.ts
```

### 2.3 Tailwind CSS

**Config:** `El Frontend/tailwind.config.js`

```
Version: 3.4.17
darkMode: 'class'
Content: index.html, src/**/*.{vue,js,ts,jsx,tsx}
Custom Colors: dark (10 shades), iridescent (4), success/warning/danger/info, mock/real, esp, glass
Custom Fonts: Inter (sans), JetBrains Mono (mono)
Custom Animations: shimmer, pulse-slow, skeleton, pulse-dot
Custom Breakpoints: 3xl (1600px), 4xl (1920px)
```

### 2.4 PostCSS

**Config:** `El Frontend/postcss.config.js` (via Docker-Compose Mount)
- Tailwind CSS + Autoprefixer

### 2.5 Build-Scripts

```json
"dev": "vite"
"build": "vue-tsc -b && vite build"
"preview": "vite preview"
"type-check": "vue-tsc --noEmit"
```

### 2.6 Dependencies

**Runtime (10):**
| Package | Version | Zweck |
|---------|---------|-------|
| vue | ^3.5.13 | UI Framework |
| vue-router | ^4.5.0 | Routing |
| pinia | ^2.3.0 | State Management |
| axios | ^1.10.0 | HTTP Client |
| @vueuse/core | ^10.11.1 | Composition Utilities |
| chart.js | ^4.5.0 | Diagramme |
| vue-chartjs | ^5.3.2 | Chart.js Vue-Wrapper |
| chartjs-adapter-date-fns | ^3.0.0 | Datum-Adapter fuer Charts |
| date-fns | ^4.1.0 | Datum-Utilities |
| lucide-vue-next | ^0.468.0 | Icon-Library |
| vue-draggable-plus | ^0.6.0 | Drag & Drop |

**Dev (8):**
| Package | Version | Zweck |
|---------|---------|-------|
| vite | ^6.2.4 | Build Tool |
| @vitejs/plugin-vue | ^5.2.3 | Vue SFC Compiler |
| typescript | ~5.7.2 | TypeScript Compiler |
| vue-tsc | ^2.2.0 | Vue Type-Checking |
| tailwindcss | ^3.4.17 | CSS Framework |
| autoprefixer | ^10.4.20 | CSS PostCSS Plugin |
| postcss | ^8.4.49 | CSS Processing |
| @types/node | ^22.10.2 | Node.js Types |

**ACHTUNG:** Vitest und Playwright sind NICHT in package.json! Tests nutzen eigene Konfiguration.

---

## 3. Docker-Setup

### 3.1 Container

**Service-Name:** `el-frontend`
**Container-Name:** `automationone-frontend`
**Base Image:** `node:20-alpine`
**Port:** 5173:5173 (Vite Dev Server)
**Healthcheck:** `node -e "fetch('http://localhost:5173')..."`
**User:** Non-root (`appuser:1001`)
**Restart:** `unless-stopped`
**CMD:** `npm run dev -- --host 0.0.0.0`

### 3.2 Volumes (Live-Reload)

| Host | Container | Mode |
|------|-----------|------|
| `./El Frontend/src` | `/app/src` | ro |
| `./El Frontend/public` | `/app/public` | ro |
| `./El Frontend/index.html` | `/app/index.html` | ro |
| `./El Frontend/vite.config.ts` | `/app/vite.config.ts` | ro |
| `./El Frontend/tsconfig.json` | `/app/tsconfig.json` | ro |
| `./El Frontend/tailwind.config.js` | `/app/tailwind.config.js` | ro |
| `./El Frontend/postcss.config.js` | `/app/postcss.config.js` | ro |

### 3.3 Environment Variables

| Variable | Wert | Verwendung |
|----------|------|------------|
| `VITE_API_URL` | `http://localhost:8000` | API Base URL (Environment) |
| `VITE_WS_URL` | `ws://localhost:8000` | WebSocket URL (Environment) |
| `NODE_ENV` | `development` | Build Mode |

**WICHTIG:** Die Vite-Config verwendet NICHT `VITE_API_URL`/`VITE_WS_URL` direkt. Der Proxy leitet `/api` und `/ws` an `el-servador:8000` weiter (Docker-internes Netzwerk). Der WebSocket-Service (`services/websocket.ts`) baut die URL selbst: `ws://localhost:8000/api/v1/ws/realtime/{client_id}` im Dev-Modus.

### 3.4 Nginx (Production)

**Pfad:** `El Frontend/docker/nginx/nginx.conf`

```
Port: 80
Vue Router History Mode: try_files → /index.html
API Proxy: /api/ → http://el-servador:8000
WebSocket Proxy: /ws → ws://el-servador:8000 (Upgrade)
Static Caching: 1y mit immutable
Gzip: Level 6
Security Headers: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
```

### 3.5 Logging

| Quelle | Zugriff | Format |
|--------|---------|--------|
| Vite Dev Server stdout/stderr | `docker compose logs el-frontend` | Text |
| Vite Build Output | Nur bei manuellem Build | Text (TS Errors) |
| Browser Console | NICHT direkt lesbar | User muss exportieren |
| Nginx Access (Prod) | `docker compose logs el-frontend` | Combined Log |

---

## 4. Frontend-Architektur (Alle Pfade)

### 4.1 Entry Point

**Pfad:** `El Frontend/src/main.ts` (43 Zeilen)

**Initialisierung:**
1. `createApp(App)` - Vue App erstellen
2. `app.use(createPinia())` - Pinia State Management
3. `app.use(router)` - Vue Router
4. `import './style.css'` - Globale Styles (Tailwind)
5. `app.config.errorHandler` - Globaler Error Handler (JSON-Output)
6. `app.config.warnHandler` - Globaler Warning Handler
7. `window.addEventListener('unhandledrejection')` - Promise Rejection Handler
8. `app.mount('#app')` - App mounten

**Error Handler Format:**
```typescript
console.error('[Vue Error]', {
  error: string,     // Fehlermeldung
  stack: string,     // Stack-Trace
  component: string, // Komponenten-Name
  info: string,      // Vue Lifecycle-Info
  timestamp: string  // ISO-Timestamp
})
```

### 4.2 App.vue

**Pfad:** `El Frontend/src/App.vue`

- Initialisiert `authStore.checkAuthStatus()` bei Mount
- Registriert `espStore.cleanupWebSocket()` bei Unmount
- Globaler `ToastContainer` und `ErrorDetailsModal`
- Custom Event Listener `show-error-details` fuer Modal-Trigger

### 4.3 Router

**Pfad:** `El Frontend/src/router/index.ts` (183 Zeilen)

**Aktive Views (9):**

| Route | View | Auth | Admin |
|-------|------|------|-------|
| `/` | DashboardView | Ja | - |
| `/system-monitor` | SystemMonitorView | Ja | Ja |
| `/users` | UserManagementView | Ja | Ja |
| `/system-config` | SystemConfigView | Ja | Ja |
| `/load-test` | LoadTestView | Ja | Ja |
| `/maintenance` | MaintenanceView | Ja | Ja |
| `/sensors` | SensorsView | Ja | - |
| `/logic` | LogicView | Ja | - |
| `/settings` | SettingsView | Ja | - |

**Oeffentliche Routes (2):**

| Route | View |
|-------|------|
| `/login` | LoginView |
| `/setup` | SetupView |

**Deprecated Redirects (6):**
- `/devices` → `/` (seit 2025-01-04)
- `/devices/:id` → `/?openSettings=id` (seit 2025-01-04)
- `/mock-esp`, `/mock-esp/:id` → `/` (Legacy)
- `/database` → `/system-monitor?tab=database` (seit 2026-01-23)
- `/logs` → `/system-monitor?tab=logs` (seit 2026-01-23)
- `/audit` → `/system-monitor?tab=events` (seit 2026-01-24)
- `/mqtt-log` → `/system-monitor?tab=mqtt` (seit 2026-01-23)
- `/actuators` → `/sensors?tab=actuators` (seit 2025-01-04)

**Navigation Guards:**
1. Auth-Status pruefen (lazy init)
2. Setup-Redirect wenn `setupRequired`
3. Auth-Check: Unauthentifiziert → Login
4. Admin-Check: Nicht-Admin → Dashboard
5. Authenticated → weg von Login/Setup

### 4.4 Pinia Stores (4)

| Store | Pfad | defineStore ID | Zweck |
|-------|------|---------------|-------|
| **esp** | `src/stores/esp.ts` | `'esp'` | ESP-Devices, Sensoren, Aktoren, Zones, WebSocket, Pending Devices (~2500 Zeilen) |
| **auth** | `src/stores/auth.ts` | `'auth'` | Login, Token, User, Refresh, Setup (177 Zeilen) |
| **logic** | `src/stores/logic.ts` | `'logic'` | Cross-ESP Automation Rules, Connections |
| **database** | `src/stores/database.ts` | `'database'` | DB Explorer State, Table/Schema/Data |
| **dragState** | `src/stores/dragState.ts` | `'dragState'` | Drag&Drop State mit Safety-Timeout (30s) |

**ESP Store (Kern-Store):**
- State: `esps`, `pendingDevices`, `selectedEsp`, `loading`, `error`, `offlineInfoMap`
- WebSocket: `setupWebSocket()`, `cleanupWebSocket()`, auto-connect via `useWebSocket` Composable
- API-Integration: Nutzt `espApi`, `sensorsApi`, `actuatorsApi`, `debugApi`
- Event-Handler: `sensor_data`, `esp_health`, `actuator_status`, `actuator_response`, `actuator_alert`, `config_response`, `zone_assignment`, `device_discovered`, `device_approved`, `device_rejected`, `sensor_health`

**Auth Store:**
- Token-Management: `localStorage` mit Keys `el_frontend_access_token`, `el_frontend_refresh_token`
- Flow: `checkAuthStatus()` → `login()` → `refreshTokens()` → `logout()`
- WebSocket-Cleanup bei Logout: `websocketService.disconnect()`

### 4.5 Services (1)

| Service | Pfad | Pattern |
|---------|------|---------|
| **WebSocket** | `src/services/websocket.ts` | Singleton (624 Zeilen) |

**WebSocketService Details:**
- **Pattern:** Singleton (`WebSocketService.getInstance()`)
- **Endpoint:** `ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}` (Dev)
- **Endpoint (Prod):** `wss://{host}/api/v1/ws/realtime/{client_id}?token={jwt_token}`
- **Rate Limit:** 10 messages/second (Client-seitig)
- **Reconnect:** Exponential Backoff (1s, 2s, 4s, 8s, 16s, max 30s) mit Jitter
- **Max Reconnect Attempts:** 10
- **Token Refresh:** Automatisch vor Reconnect wenn Token < 60s gueltig
- **Message Queue:** Max 1000 Messages
- **Visibility Handling:** Page Visibility API fuer Tab-Wechsel
- **Subscription-System:** Filter-basiert (types, esp_ids, sensor_types, topicPattern)
- **onConnect Callbacks:** Stores koennen sich registrieren fuer Post-Connect-Refresh

### 4.6 Composables (8)

| Composable | Pfad | Zweck |
|------------|------|-------|
| **useWebSocket** | `src/composables/useWebSocket.ts` | WebSocket-Verbindung und Subscriptions (290 Zeilen) |
| **useModal** | `src/composables/useModal.ts` | Modal State Management |
| **useToast** | `src/composables/useToast.ts` | Toast Notifications |
| **useSwipeNavigation** | `src/composables/useSwipeNavigation.ts` | Touch Swipe + Edge Swipe |
| **useZoneDragDrop** | `src/composables/useZoneDragDrop.ts` | Zone Drag & Drop |
| **useConfigResponse** | `src/composables/useConfigResponse.ts` | Config Response Handling |
| **useQueryFilters** | `src/composables/useQueryFilters.ts` | System Monitor Filter State |
| **useGpioStatus** | `src/composables/useGpioStatus.ts` | GPIO Status Abfrage |

**useWebSocket Details:**
- Wraps `websocketService` Singleton
- Provides: `connect()`, `disconnect()`, `subscribe()`, `on()`, `updateFilters()`
- Auto-connect bei Mount (default)
- Auto-cleanup bei onUnmounted
- Status-Monitor Interval (1s Polling)

**Re-Export Index:** `src/composables/index.ts` exportiert alle Composables

### 4.7 API Client (12 Module)

**Base Client:** `src/api/index.ts`

| Aspekt | Detail |
|--------|--------|
| **Library** | Axios |
| **Base URL** | `/api/v1` |
| **Timeout** | 30000ms (30s) |
| **Auth** | Request Interceptor: Bearer Token aus authStore |
| **Token Refresh** | Response Interceptor: Bei 401 → refreshTokens → Retry |
| **Infinite Loop Guard** | Skip Interceptor fuer `/auth/refresh`, `/auth/login`, `/auth/setup`, `/auth/status` |
| **Fallback** | Bei Refresh-Fehler → `clearAuth()` + Redirect `/login` |

**API-Module:**

| Modul | Pfad | Endpoints |
|-------|------|-----------|
| `auth` | `src/api/auth.ts` | Login, Setup, Refresh, Logout, Me, Status |
| `esp` | `src/api/esp.ts` | Devices CRUD, Config, Restart, GPIO, Approve/Reject |
| `sensors` | `src/api/sensors.ts` | Sensors CRUD, Data, Stats, OneWire, Trigger |
| `actuators` | `src/api/actuators.ts` | Actuators CRUD, Command, State, History |
| `zones` | `src/api/zones.ts` | Zone CRUD, Assign, Remove, Master |
| `subzones` | `src/api/subzones.ts` | Subzone CRUD, Assign, SafeMode |
| `logic` | `src/api/logic.ts` | Rules CRUD, Toggle, Execution History |
| `database` | `src/api/database.ts` | Tables, Schema, Data, Records |
| `config` | `src/api/config.ts` | System Config List, Update |
| `health` | `src/api/health.ts` | Health Live, Detailed |
| `audit` | `src/api/audit.ts` | Audit Log |
| `logs` | `src/api/logs.ts` | Server Logs |
| `errors` | `src/api/errors.ts` | Error History |
| `debug` | `src/api/debug.ts` | Debug/Mock-ESP Commands |
| `users` | `src/api/users.ts` | User Management |
| `loadtest` | `src/api/loadtest.ts` | Load Test API |

### 4.8 Components (70)

**Layout (3):**
| Component | Pfad |
|-----------|------|
| MainLayout | `src/components/layout/MainLayout.vue` |
| AppHeader | `src/components/layout/AppHeader.vue` |
| AppSidebar | `src/components/layout/AppSidebar.vue` |

**Common/UI (10):**
| Component | Pfad |
|-----------|------|
| Button | `src/components/common/Button.vue` |
| Card | `src/components/common/Card.vue` |
| Modal | `src/components/common/Modal.vue` |
| Input | `src/components/common/Input.vue` |
| Select | `src/components/common/Select.vue` |
| Toggle | `src/components/common/Toggle.vue` |
| Badge | `src/components/common/Badge.vue` |
| Spinner | `src/components/common/Spinner.vue` |
| ToastContainer | `src/components/common/ToastContainer.vue` |
| LoadingState | `src/components/common/LoadingState.vue` |
| EmptyState | `src/components/common/EmptyState.vue` |
| ErrorState | `src/components/common/ErrorState.vue` |

**Dashboard (7):**
| Component | Pfad |
|-----------|------|
| StatCard | `src/components/dashboard/StatCard.vue` |
| StatusPill | `src/components/dashboard/StatusPill.vue` |
| ActionBar | `src/components/dashboard/ActionBar.vue` |
| SensorSidebar | `src/components/dashboard/SensorSidebar.vue` |
| ActuatorSidebar | `src/components/dashboard/ActuatorSidebar.vue` |
| ComponentSidebar | `src/components/dashboard/ComponentSidebar.vue` |
| UnassignedDropBar | `src/components/dashboard/UnassignedDropBar.vue` |
| CrossEspConnectionOverlay | `src/components/dashboard/CrossEspConnectionOverlay.vue` |

**ESP (9):**
| Component | Pfad |
|-----------|------|
| ESPCard | `src/components/esp/ESPCard.vue` |
| ESPOrbitalLayout | `src/components/esp/ESPOrbitalLayout.vue` |
| ESPSettingsPopover | `src/components/esp/ESPSettingsPopover.vue` |
| SensorSatellite | `src/components/esp/SensorSatellite.vue` |
| ActuatorSatellite | `src/components/esp/ActuatorSatellite.vue` |
| SensorValueCard | `src/components/esp/SensorValueCard.vue` |
| ConnectionLines | `src/components/esp/ConnectionLines.vue` |
| GpioPicker | `src/components/esp/GpioPicker.vue` |
| PendingDevicesPanel | `src/components/esp/PendingDevicesPanel.vue` |
| AnalysisDropZone | `src/components/esp/AnalysisDropZone.vue` |

**Zones (2):**
| Component | Pfad |
|-----------|------|
| ZoneGroup | `src/components/zones/ZoneGroup.vue` |
| ZoneAssignmentPanel | `src/components/zones/ZoneAssignmentPanel.vue` |

**System Monitor (14):**
| Component | Pfad |
|-----------|------|
| MonitorHeader | `src/components/system-monitor/MonitorHeader.vue` |
| MonitorTabs | `src/components/system-monitor/MonitorTabs.vue` |
| MonitorFilterPanel | `src/components/system-monitor/MonitorFilterPanel.vue` |
| EventsTab | `src/components/system-monitor/EventsTab.vue` |
| EventTimeline | `src/components/system-monitor/EventTimeline.vue` |
| EventDetailsPanel | `src/components/system-monitor/EventDetailsPanel.vue` |
| PreviewEventCard | `src/components/system-monitor/PreviewEventCard.vue` |
| UnifiedEventList | `src/components/system-monitor/UnifiedEventList.vue` |
| HealthTab | `src/components/system-monitor/HealthTab.vue` |
| HealthSummaryBar | `src/components/system-monitor/HealthSummaryBar.vue` |
| HealthProblemChip | `src/components/system-monitor/HealthProblemChip.vue` |
| DatabaseTab | `src/components/system-monitor/DatabaseTab.vue` |
| MqttTrafficTab | `src/components/system-monitor/MqttTrafficTab.vue` |
| ServerLogsTab | `src/components/system-monitor/ServerLogsTab.vue` |
| DataSourceSelector | `src/components/system-monitor/DataSourceSelector.vue` |
| RssiIndicator | `src/components/system-monitor/RssiIndicator.vue` |
| AutoCleanupStatusBanner | `src/components/system-monitor/AutoCleanupStatusBanner.vue` |
| CleanupPanel | `src/components/system-monitor/CleanupPanel.vue` |
| CleanupPreview | `src/components/system-monitor/CleanupPreview.vue` |
| LogManagementPanel | `src/components/system-monitor/LogManagementPanel.vue` |

**Database (5):**
| Component | Pfad |
|-----------|------|
| TableSelector | `src/components/database/TableSelector.vue` |
| FilterPanel | `src/components/database/FilterPanel.vue` |
| DataTable | `src/components/database/DataTable.vue` |
| SchemaInfoPanel | `src/components/database/SchemaInfoPanel.vue` |
| RecordDetailModal | `src/components/database/RecordDetailModal.vue` |
| Pagination | `src/components/database/Pagination.vue` |

**Charts (1):**
| Component | Pfad |
|-----------|------|
| MultiSensorChart | `src/components/charts/MultiSensorChart.vue` |

**Error (2):**
| Component | Pfad |
|-----------|------|
| ErrorDetailsModal | `src/components/error/ErrorDetailsModal.vue` |
| TroubleshootingPanel | `src/components/error/TroubleshootingPanel.vue` |

**Filters (1):**
| Component | Pfad |
|-----------|------|
| UnifiedFilterBar | `src/components/filters/UnifiedFilterBar.vue` |

**Safety (1):**
| Component | Pfad |
|-----------|------|
| EmergencyStopButton | `src/components/safety/EmergencyStopButton.vue` |

**Modals (1):**
| Component | Pfad |
|-----------|------|
| CreateMockEspModal | `src/components/modals/CreateMockEspModal.vue` |

### 4.9 Views (11 aktiv + Login/Setup)

| View | Pfad | Beschreibung |
|------|------|-------------|
| DashboardView | `src/views/DashboardView.vue` | Haupt-Dashboard mit ESP-Cards |
| SystemMonitorView | `src/views/SystemMonitorView.vue` | Konsolidiert: Events, Health, DB, MQTT, Logs |
| SensorsView | `src/views/SensorsView.vue` | Sensor/Actuator-Uebersicht |
| LogicView | `src/views/LogicView.vue` | Cross-ESP Automation Rules |
| SettingsView | `src/views/SettingsView.vue` | User-Einstellungen |
| UserManagementView | `src/views/UserManagementView.vue` | Admin: User-Verwaltung |
| SystemConfigView | `src/views/SystemConfigView.vue` | Admin: System-Konfiguration |
| LoadTestView | `src/views/LoadTestView.vue` | Admin: Last-Tests |
| MaintenanceView | `src/views/MaintenanceView.vue` | Admin: Wartung |
| LoginView | `src/views/LoginView.vue` | Login-Formular |
| SetupView | `src/views/SetupView.vue` | Erst-Einrichtung |

### 4.10 Types (5 Dateien)

| Datei | Pfad | Inhalt |
|-------|------|--------|
| **index.ts** | `src/types/index.ts` | Haupt-Type-Datei (~979 Zeilen): Auth, MockESP, Sensor, Actuator, Zone, Subzone, Config, WebSocket MessageType, Offline, DragData, Chart, API Response |
| **gpio.ts** | `src/types/gpio.ts` | GPIO-spezifische Types: GpioStatusResponse, GpioPinStatus, GpioOwner, HeartbeatGpioItem |
| **websocket-events.ts** | `src/types/websocket-events.ts` | WebSocket Event Contracts: WebSocketEventBase und abgeleitete Events |
| **logic.ts** | `src/types/logic.ts` | Logic/Automation Types: LogicRule, Conditions, Actions, Connections |
| **event-grouping.ts** | `src/types/event-grouping.ts` | Event-Gruppierung fuer System Monitor |

### 4.11 Utils (12 Dateien)

| Datei | Pfad | Zweck |
|-------|------|-------|
| formatters | `src/utils/formatters.ts` | Datum, Zahlen, Zeitstempel Formatierung |
| sensorDefaults | `src/utils/sensorDefaults.ts` | Default-Config pro Sensor-Typ, Multi-Value |
| actuatorDefaults | `src/utils/actuatorDefaults.ts` | Default-Config pro Actuator-Typ |
| gpioConfig | `src/utils/gpioConfig.ts` | GPIO Pin-Mapping, Valid Pins |
| labels | `src/utils/labels.ts` | UI-Labels und Uebersetzungen |
| wifiStrength | `src/utils/wifiStrength.ts` | RSSI → Qualitaet Mapping |
| zoneColors | `src/utils/zoneColors.ts` | Farb-Zuordnung fuer Zones |
| errorCodeTranslator | `src/utils/errorCodeTranslator.ts` | Error-Code → Menschenlesbar |
| logMessageTranslator | `src/utils/logMessageTranslator.ts` | Log-Nachrichten Uebersetzung |
| logSummaryGenerator | `src/utils/logSummaryGenerator.ts` | Log-Zusammenfassungen |
| databaseColumnTranslator | `src/utils/databaseColumnTranslator.ts` | DB-Spalten → UI-Label |
| eventTransformer | `src/utils/eventTransformer.ts` | WebSocket Events transformieren |
| eventTypeIcons | `src/utils/eventTypeIcons.ts` | Event-Typ → Icon Mapping |
| eventGrouper | `src/utils/eventGrouper.ts` | Events gruppieren |
| index | `src/utils/index.ts` | Re-Export |

---

## 5. WebSocket-Integration (Detailliert)

### 5.1 Architektur

```
Browser ←WebSocket→ Vite Proxy (/ws) ←→ el-servador:8000/api/v1/ws/realtime/{client_id}
                          |
                          ↓
              WebSocketService (Singleton)
                    ↓           ↓
           Subscriptions    Type Listeners
                    ↓           ↓
              Filter-Match   on() callbacks
                    ↓
              Store Handlers
              (esp store)
```

### 5.2 Connection Flow

1. `App.vue` mounted → `espStore` initialisiert
2. ESP Store nutzt `useWebSocket({ autoConnect: true })`
3. `useWebSocket.connect()` → `websocketService.connect()`
4. Service baut URL: `ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt}`
5. Bei Open: Resubscribe, Process Pending, Notify Connect Callbacks
6. Bei Close (!=1000): Schedule Reconnect mit Backoff

### 5.3 Event-Handler im ESP Store

| Event | Store Action |
|-------|-------------|
| `sensor_data` | Update Sensor-Werte im ESP |
| `esp_health` | Online/Offline Status, Health-Metriken |
| `actuator_status` | Actuator State-Update |
| `actuator_response` | Command-Bestaetigung |
| `actuator_alert` | Emergency-Stop, Timeout-Alert |
| `config_response` | Config-ACK Verarbeitung |
| `zone_assignment` | Zone-Zuweisung bestaetigt |
| `device_discovered` | Neues Pending Device |
| `device_approved` | Pending → Active |
| `device_rejected` | Pending entfernt |
| `sensor_health` | Sensor Timeout/Recovery |

### 5.4 26 WebSocket Event-Typen (Referenz)

Definiert in `src/types/index.ts` als `MessageType` Union:
- Core: `sensor_data`, `actuator_status`, `actuator_response`, `actuator_alert`
- Health: `esp_health`, `sensor_health`
- Config: `config_response`, `zone_assignment`
- Discovery: `device_discovered`, `device_approved`, `device_rejected`, `device_rediscovered`
- Actuator Lifecycle: `actuator_command`, `actuator_command_failed`
- Config Lifecycle: `config_published`, `config_failed`
- Sequence: `sequence_started`, `sequence_step`, `sequence_completed`, `sequence_error`, `sequence_cancelled`
- System: `logic_execution`, `system_event`, `notification`, `error_event`

---

## 6. API-Integration (Detailliert)

### 6.1 Auth Flow

```
App Mount → authStore.checkAuthStatus()
  ├→ GET /auth/status → setupRequired?
  ├→ If token: GET /auth/me → User laden
  ├→ If 401: refreshTokens() → Retry
  └→ If refresh fails: clearAuth() → Login Redirect

Login:
  POST /auth/login → {tokens, user}
  → localStorage.setItem(access_token, refresh_token)

Token Refresh (Interceptor):
  401 Response → POST /auth/refresh → Retry Original Request
  Infinite Loop Guard: Skip fuer /auth/* Endpoints
```

### 6.2 Data Flow

```
User Action → Store Action → API Module → Axios Instance
  → Request Interceptor (Bearer Token)
  → Server Response
  → Response Interceptor (401 → Refresh)
  → Store State Update
  → Vue Reactivity → UI Update
```

---

## 7. Test-Infrastruktur

### 7.1 Vitest (Unit Tests)

**Config:** `El Frontend/vitest.config.ts`

| Aspekt | Wert |
|--------|------|
| Environment | jsdom |
| Setup | `tests/setup.ts` |
| Include | `tests/**/*.test.ts` |
| Coverage Provider | v8 |
| Coverage Output | `logs/frontend/vitest/coverage/` |
| Pool | forks (singleFork) |
| Timeout | 10000ms |

**Unit Test-Dateien (4):**

| Test | Pfad | Testet |
|------|------|--------|
| formatters.test | `tests/unit/utils/formatters.test.ts` | Formatter-Utils |
| auth.test | `tests/unit/stores/auth.test.ts` | Auth Store |
| useToast.test | `tests/unit/composables/useToast.test.ts` | Toast Composable |
| useWebSocket.test | `tests/unit/composables/useWebSocket.test.ts` | WebSocket Composable |
| esp.test | `tests/unit/stores/esp.test.ts` | ESP Store |

**Test Support:**
- `tests/setup.ts` - Test-Setup
- `tests/mocks/server.ts` - Mock-Server
- `tests/mocks/handlers.ts` - Request Handler
- `tests/mocks/websocket.ts` - WebSocket Mock

### 7.2 Playwright (E2E Tests)

**Config:** `El Frontend/playwright.config.ts`

| Aspekt | Wert |
|--------|------|
| Test Dir | `tests/e2e/scenarios/` |
| Browser | Chromium only |
| Base URL | `http://localhost:5173` |
| Auth | Global Setup mit `storageState` |
| Report | `logs/frontend/playwright/playwright-report/` |
| Artifacts | `logs/frontend/playwright/test-results/` |
| Timeout | 30000ms (WebSocket-Tests) |
| Retries CI | 1 |
| Workers CI | 2 |

**E2E Test-Dateien (5):**

| Test | Pfad | Testet |
|------|------|--------|
| auth.spec | `tests/e2e/scenarios/auth.spec.ts` | Login/Logout Flow |
| sensor-live.spec | `tests/e2e/scenarios/sensor-live.spec.ts` | Live Sensor Data |
| actuator.spec | `tests/e2e/scenarios/actuator.spec.ts` | Actuator Commands |
| emergency.spec | `tests/e2e/scenarios/emergency.spec.ts` | Emergency Stop |
| device-discovery.spec | `tests/e2e/scenarios/device-discovery.spec.ts` | Device Discovery |

**E2E Support:**
- `tests/e2e/global-setup.ts` - Auth Token Setup
- `tests/e2e/global-teardown.ts` - Cleanup
- `tests/e2e/helpers/api.ts` - API Helpers
- `tests/e2e/helpers/mqtt.ts` - MQTT Helpers
- `tests/e2e/helpers/websocket.ts` - WebSocket Helpers
- `tests/e2e/helpers/format.ts` - Format Helpers

---

## 8. Architektur-Abhaengigkeiten & Datenfluesse

### 8.1 Data Flow: WebSocket Event → UI Update

```
Server broadcast(message) via ws_manager
  → WebSocket TCP Frame
  → Browser WebSocket.onmessage
  → WebSocketService.handleMessage()
    → JSON.parse
    → checkRateLimit (10 msg/s)
    → routeMessage (Filter-Match gegen Subscriptions)
    → Notify type-specific listeners
  → ESP Store Handler (z.B. handleSensorData)
    → ref<>.value = newData (Pinia reactive)
  → Vue Reactivity (computed, watchers, template refs)
  → DOM Update (Component re-render)
```

### 8.2 API Flow: User Action → Response → UI

```
User Click (z.B. "Actuator ON")
  → Component @click Handler
  → ESP Store Action (z.B. sendActuatorCommand)
  → API Module (actuatorsApi.sendCommand)
  → Axios Instance (mit Bearer Token)
  → Request Interceptor (Token Header)
  → HTTP POST /api/v1/actuators/{id}/command
  → Server verarbeitet
  → HTTP Response
  → Response Interceptor (401 Check)
  → Store: Update State
  → Vue Reactivity → UI
  → WebSocket Event `actuator_response` (asynchron)
    → Store: Bestaetigung/Status Update
    → Vue Reactivity → UI
```

### 8.3 Auth Flow

```
App Start
  → authStore.checkAuthStatus()
  → GET /auth/status (setupRequired?)
  → If token in localStorage:
    → GET /auth/me (validate token)
    → If 401: refreshTokens()
      → POST /auth/refresh
      → If ok: Retry /auth/me
      → If fail: clearAuth() → redirect /login
  → Router Guard: requiresAuth → isAuthenticated check
  → WebSocket: Token in URL Query (JWT)
  → WebSocket Reconnect: refreshTokenIfNeeded() → re-connect
```

### 8.4 Error Flow

```
API Error (z.B. 500)
  → Axios Response Interceptor
  → If 401: Auto-Refresh + Retry
  → If other: Promise.reject(error)
  → Store catch: extractErrorMessage()
  → useToast: error notification
  → ErrorDetailsModal (via CustomEvent)

Vue Error:
  → app.config.errorHandler
  → console.error('[Vue Error]', { structured JSON })
  → Docker json-file driver captures stdout

Unhandled Promise:
  → window 'unhandledrejection' listener
  → console.error('[Unhandled Rejection]', { structured JSON })
```

### 8.5 Cross-Component Abhaengigkeiten

```
App.vue
  ├→ authStore (Init)
  ├→ espStore (WebSocket Cleanup)
  ├→ ToastContainer (Global)
  └→ ErrorDetailsModal (Global)

MainLayout.vue
  ├→ AppHeader
  ├→ AppSidebar
  └→ <RouterView /> (Child Views)

DashboardView.vue
  ├→ espStore (Primary Consumer)
  ├→ ESPCard (per ESP)
  │   ├→ ESPOrbitalLayout
  │   ├→ SensorSatellite (per Sensor)
  │   ├→ ActuatorSatellite (per Actuator)
  │   └→ ESPSettingsPopover
  ├→ ZoneGroup (Gruppierung)
  ├→ PendingDevicesPanel
  ├→ MultiSensorChart (Drag Target)
  └→ Sidebars (Sensor, Actuator, Component)

SystemMonitorView.vue
  ├→ MonitorHeader + MonitorTabs
  ├→ EventsTab → EventTimeline + EventDetailsPanel
  ├→ HealthTab → HealthSummaryBar
  ├→ DatabaseTab → DataTable
  ├→ MqttTrafficTab
  └→ ServerLogsTab
```

---

## 9. Vorgehensweise Modus A (Allgemeine Frontend-Analyse)

### Schritt-fuer-Schritt

1. **Build-Status pruefen**
   - `docker compose ps el-frontend` → Container laeuft? Healthy?
   - Falls Container down: `docker compose logs --tail=50 el-frontend` → Crash-Grund
   - Typische Build-Errors: TS2xxx im Build-Output

2. **TypeScript Strict-Check (Source-Analyse)**
   - Grep fuer `// @ts-ignore`, `// @ts-expect-error`, `: any` → Workarounds
   - Grep fuer `as unknown as` → Unsichere Type-Casts
   - Pruefe `tsconfig.json` strict-Flags

3. **WebSocket-Health (Source + Runtime)**
   - Pruefe `services/websocket.ts`: Reconnect-Logik, Token-Handling
   - Pruefe ESP Store: Alle 11 Event-Handler vorhanden?
   - `curl -s http://localhost:8000/api/v1/health/detailed` → WebSocket-Status

4. **API-Client Analyse**
   - `src/api/index.ts`: Interceptors korrekt? Token-Refresh-Loop-Guard?
   - Alle API-Module: Error-Handling vorhanden?
   - `curl -s http://localhost:8000/api/v1/health/live` → Server erreichbar?

5. **Store Pattern-Analyse**
   - Cleanup in `onUnmounted` vorhanden? (Memory Leak Check)
   - WebSocket-Subscriptions aufgeraeumt?
   - Error-States korrekt zurueckgesetzt?

6. **Component Pattern-Analyse**
   - `@/ ` Imports vs relative Imports → Konsistenz
   - `onUnmounted` Cleanup in Components mit Subscriptions
   - Reactive State sparsam? Keine ueberfluessigen `ref()`?

7. **Test-Coverage**
   - Unit Tests: 5 Dateien vorhanden
   - E2E Tests: 5 Szenarien vorhanden
   - Coverage Report: `logs/frontend/vitest/coverage/`

8. **Report schreiben**
   - Alle Findings mit exakten Pfaden und Zeilennummern
   - Severity-Einstufung pro Finding
   - Empfehlungen

---

## 10. Vorgehensweise Modus B (Spezifisches Problem)

### Szenario 1: "Dashboard zeigt keine Live-Daten"

**Debug-Kette:**

1. **WebSocket-Connection pruefen**
   - `curl -s http://localhost:8000/api/v1/health/detailed` → WebSocket-Status
   - Pruefe `services/websocket.ts:connect()` → URL korrekt? Token vorhanden?
   - Pruefe `services/websocket.ts:scheduleReconnect()` → Reconnect aktiv?

2. **Store-Subscription pruefen**
   - `stores/esp.ts`: `setupWebSocket()` aufgerufen?
   - Event-Handler fuer `sensor_data` registriert?
   - `useWebSocket({ autoConnect: true })` → tatsaechlich verbunden?

3. **Data-Pipeline pruefen**
   - Server sendet Events? → `grep "broadcast.*sensor_data" logs/server/god_kaiser.log | tail -10`
   - MQTT kommt an? → `grep "sensor_handler" logs/server/god_kaiser.log | tail -10`
   - ESP sendet? → Pruefe ESP-Status im Store

4. **Component-Binding pruefen**
   - `DashboardView.vue` → `espStore.esps` → `ESPCard` → `SensorSatellite`
   - Computed Properties korrekt? `v-for` Key-Binding?

5. **Bruchstelle identifizieren**
   - WebSocket verbunden aber keine Events → Server-Problem
   - Events kommen aber Store nicht aktualisiert → Handler-Bug
   - Store aktualisiert aber UI nicht → Reactivity-Problem

### Szenario 2: "Build failed nach Dependency-Update"

**Debug-Kette:**

1. **Build-Log analysieren**
   - `docker compose logs --tail=100 el-frontend` → TypeScript-Errors
   - Grep fuer `TS2xxx`, `Module not found`, `Cannot resolve`

2. **TypeScript-Errors kategorisieren**
   - TS2304 (Type nicht definiert) → Fehlender Import/Export
   - TS2322 (Type Mismatch) → Breaking Change in Dependency
   - TS2339 (Property nicht vorhanden) → API-Aenderung in Library

3. **Package-Analyse**
   - `package.json` vs `package-lock.json` → Version-Drift?
   - Breaking Changes in Major-Version-Updates
   - Peer-Dependency-Konflikte

4. **Path-Aliases pruefen**
   - `tsconfig.json`: `@/*` → `./src/*` korrekt?
   - `vite.config.ts`: Alias `@` → `./src` korrekt?
   - Neue Dateien in korrektem Verzeichnis?

### Szenario 3: "API-Calls returnen 401 nach Login"

**Debug-Kette:**

1. **Token pruefen**
   - `stores/auth.ts`: Token in localStorage? `el_frontend_access_token`
   - Token expired? JWT Payload pruefen (exp Claim)

2. **Interceptor pruefen**
   - `api/index.ts`: Request Interceptor → Authorization Header gesetzt?
   - Response Interceptor → 401 Handler → refreshTokens() aufgerufen?
   - Infinite-Loop-Guard: Verhindert Refresh-Loop?

3. **Server-Seite pruefen**
   - `curl -s http://localhost:8000/api/v1/health/live` → Server erreichbar?
   - `curl -s -H "Authorization: Bearer {token}" http://localhost:8000/api/v1/auth/me` → Token valid?
   - Server-Log: `grep "401\|Unauthorized\|token" logs/server/god_kaiser.log | tail -20`

4. **WebSocket-Token pruefen**
   - `services/websocket.ts`: Token in URL Query korrekt?
   - `refreshTokenIfNeeded()` → Token-Refresh vor WS-Reconnect?

---

## 11. Empfehlungen fuer den neuen Agenten

### 11.1 Fehlende Informationen im aktuellen Agent/Skill

| Was fehlt | Warum wichtig | Wo dokumentieren |
|-----------|---------------|------------------|
| Exakte Component-Hierarchie | Debug-Kette: View → Component → Composable | Agent Section "Architektur" |
| 26 WebSocket Event-Typen | Event nicht ankommt → welcher Typ? | Skill Section "WebSocket Events" |
| API-Module Listing (12 Module) | API-Fehler → welches Modul? | Skill Section "API Client" |
| Test-Infrastruktur (Vitest/Playwright) | Test-Failures analysieren | Skill Section "Tests" |
| Tailwind Custom Colors/Theme | UI-Bugs → Styling-Referenz | Skill Section "Theme" |
| Auth Token Flow (localStorage Keys) | 401-Debugging → Token-Speicherort | Skill Section "Auth" |
| Docker Volume-Mounts (7 Mounts) | Container-Sync-Probleme | Agent Section "Docker" |
| Nginx Production Config | Production-Routing-Issues | Skill Section "Production" |
| `vue-tsc -b && vite build` Build-Command | Build = 2 Steps (Type-Check + Bundle) | Skill Section "Build" |

### 11.2 Skill-Update Prioritaeten

| Prioritaet | Was | Aufwand |
|------------|-----|--------|
| **Hoch** | Vue Error Handler Pattern korrigieren (Object statt JSON.stringify) | Klein |
| **Hoch** | WebSocket Event-Typen Liste (26 Events + MessageType) | Mittel |
| **Hoch** | API-Client Architektur (Interceptors, Token Refresh) | Mittel |
| **Mittel** | Component-Hierarchie DashboardView → ESPCard → Satellites | Mittel |
| **Mittel** | Store-Uebersicht (4 Stores mit Key-Properties) | Klein |
| **Mittel** | Test-Infrastruktur (Vitest + Playwright Config) | Klein |
| **Niedrig** | Utils-Listing (12 Dateien) | Klein |
| **Niedrig** | Tailwind Theme (Custom Colors) | Klein |

### 11.3 Agent-Update Prioritaeten

| Prioritaet | Was | Aufwand |
|------------|-----|--------|
| **Hoch** | Skill-Referenz in Frontmatter: Tools Konsistenz (Agent hat Bash, Skill nicht) | Klein |
| **Hoch** | Modus B Szenarien mit exakten Pfaden | Mittel |
| **Mittel** | Quick-Commands erweitern (type-check, Vitest, Playwright) | Klein |
| **Mittel** | Cross-Layer Check Commands praezisieren | Klein |
| **Niedrig** | Test-Analyse-Faehigkeit dokumentieren | Klein |

### 11.4 Zahlen-Zusammenfassung

| Metrik | Anzahl |
|--------|--------|
| Views (aktiv) | 11 |
| Components | ~70 |
| Pinia Stores | 5 (esp, auth, logic, database, dragState) |
| Composables | 8 |
| API Module | 16 |
| Utils | 14 |
| Type-Dateien | 5 |
| WebSocket Events | 26 Typen |
| Runtime Dependencies | 10 |
| Dev Dependencies | 8 |
| Unit Tests | 5 Dateien |
| E2E Tests | 5 Szenarien |
| Docker Volume Mounts | 7 |
| Router Routes (aktiv) | 11 |
| Deprecated Redirects | 8 |

---

*Analyse-Bericht fuer TM und Agent-Neubau. Alle Pfade verifiziert gegen die Codebase.*
