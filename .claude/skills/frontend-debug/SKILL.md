---
name: frontend-debug
description: |
  Frontend Debug-Wissensdatenbank: Vue 3 Architektur, 26+ WebSocket-Events,
  API-Client mit Token-Refresh, 13 Pinia Stores (esp + 12 shared), Auth-Flow, Build-Chain,
  Error-Kategorien, Component-Hierarchie, Design System (shared/design/), Test-Infrastruktur,
  Dashboard-Navigation (ZonePlate→DeviceDetail, route-based 2-Level), useSwipeNavigation.
  Trigger-Keywords: frontend, vue, vite, typescript, websocket, store, pinia,
  component, build, ts2, axios, 401, token, tailwind, dashboard
allowed-tools: Read, Grep, Glob, Bash
context: inline
---

# Frontend Debug - Skill Dokumentation

> **Fokus:** Vue 3 Frontend Debugging-Wissensdatenbank
> **Stack:** Vite 6 + Vue 3 + TypeScript strict + Pinia + Tailwind 3 + Axios

---

## 1. Frontend-Architektur Kompakt

### Layer-Uebersicht

```
Entry: main.ts → App.vue → Router → Views (16 aktiv)
State: 13 Pinia Stores (1 esp + 12 shared/stores/)
API:   17 Module via Axios mit Interceptors
WS:    Singleton Service → useWebSocket Composable → Store-Handler (22 Handler im ESP Store)
UI:    129 .vue Components (15 subdirs: layout/, common/, dashboard/, esp/, zones/, charts/, system-monitor/, rules/, shared/design/, ...)
Design: shared/design/ (primitives/ 9, layout/ 3, patterns/ 5) + styles/ (5 CSS)
Utils: 14 Dateien | Types: 5 Dateien | Composables: 16
```

### Entry Point (`El Frontend/src/main.ts`)

1. `createApp(App)` → `app.use(createPinia())` → `app.use(router)`
2. `import './style.css'` (Tailwind)
3. `app.config.errorHandler` → Global Error Handler
4. `app.config.warnHandler` → Global Warning Handler
5. `window.addEventListener('unhandledrejection')` → Promise Rejection Handler
6. `app.mount('#app')`

### Error Handler Format (tatsaechlich)

```typescript
console.error('[Vue Error]', {
  error: string,     // Fehlermeldung
  stack: string,     // Stack-Trace
  component: string, // Komponenten-Name
  info: string,      // Vue Lifecycle-Info
  timestamp: string  // ISO-Timestamp
})
```

### Was ist NICHT mein Bereich?

| Symptom | Weiterleiten an |
|---------|----------------|
| Server-Logs (god_kaiser.log) | server-debug |
| MQTT-Traffic auf Broker-Level | mqtt-debug |
| ESP32 Serial-Logs | esp32-debug |
| Datenbank-Schema/Migrations | db-inspector |

---

## 2. WebSocket-Integration

### 26+ Event-Typen (MessageType)

Definiert in `src/types/index.ts`. Server broadcastet zusaetzlich: `subzone_assignment`, `esp_diagnostics`, `events_restored` (siehe WEBSOCKET_EVENTS.md).

| Gruppe | Events |
|--------|--------|
| **Core** | `sensor_data`, `actuator_status`, `actuator_response`, `actuator_alert` |
| **Health** | `esp_health`, `sensor_health` |
| **Config** | `config_response`, `zone_assignment`, `subzone_assignment` (Server) |
| **Discovery** | `device_discovered`, `device_approved`, `device_rejected`, `device_rediscovered` |
| **Actuator Lifecycle** | `actuator_command`, `actuator_command_failed` |
| **Config Lifecycle** | `config_published`, `config_failed` |
| **Sequence** | `sequence_started`, `sequence_step`, `sequence_completed`, `sequence_error`, `sequence_cancelled` |
| **System** | `logic_execution`, `system_event`, `notification`, `error_event` |

### ESP Store Event-Handler (22 aktiv)

| Event | Store Action |
|-------|-------------|
| `sensor_data` | Update Sensor-Werte im ESP |
| `esp_health` | Online/Offline Status, Health-Metriken |
| `actuator_status` | Actuator State-Update |
| `actuator_response` | Command-Bestaetigung |
| `actuator_alert` | Emergency-Stop, Timeout-Alert |
| `config_response` | Config-ACK Verarbeitung |
| `zone_assignment` | Zone-Zuweisung bestaetigt |
| `subzone_assignment` | Subzone ACK (WP4) |
| `device_discovered` | Neues Pending Device |
| `device_approved` | Pending → Active |
| `device_rejected` | Pending entfernt |
| `device_rediscovered` | Rejected/Offline → Pending |
| `sensor_health` | Sensor Timeout/Recovery |
| `actuator_command` | Command-Publish-Bestaetigung |
| `actuator_command_failed` | Command-Fehler |
| `config_published` | Config-Publish-Bestaetigung |
| `config_failed` | Config-Publish-Fehler |
| `notification` | Rule-Notification |
| `error_event` | ESP-Fehler |
| `system_event` | Maintenance-Events |
| `sequence_started`, `sequence_step`, `sequence_completed`, `sequence_error`, `sequence_cancelled` | Sequence-Lifecycle |

### Connection Flow

```
App.vue mount → espStore init → useWebSocket({ autoConnect: true })
→ websocketService.connect()
→ URL: ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt}
→ Open: Resubscribe + Process Pending + Notify Callbacks
→ Close (!=1000): Reconnect mit Backoff (1s→2s→4s→8s→16s→max 30s, max 10 Versuche)
```

### WebSocket Service (`src/services/websocket.ts`, 624 Zeilen)

- **Pattern:** Singleton (`WebSocketService.getInstance()`)
- **Rate Limit:** 10 msg/s (Client-seitig)
- **Token Refresh:** Automatisch vor Reconnect wenn Token < 60s gueltig
- **Message Queue:** Max 1000 Messages
- **Visibility:** Page Visibility API fuer Tab-Wechsel
- **Subscriptions:** Filter-basiert (types, esp_ids, sensor_types, topicPattern)

---

## 3. API-Client

### Base Client (`src/api/index.ts`)

| Aspekt | Detail |
|--------|--------|
| Library | Axios |
| Base URL | `/api/v1` |
| Timeout | 30000ms |
| Auth | Request Interceptor: Bearer Token aus authStore |
| 401 | Response Interceptor: refreshTokens → Retry |
| Loop Guard | Skip fuer `/auth/refresh`, `/auth/login`, `/auth/setup`, `/auth/status` |
| Fallback | Bei Refresh-Fehler → `clearAuth()` + Redirect `/login` |

### 16 API-Module

| Modul | Pfad | Kern-Endpoints |
|-------|------|----------------|
| auth | `src/api/auth.ts` | Login, Setup, Refresh, Status |
| esp | `src/api/esp.ts` | Devices CRUD, Config, Restart, GPIO |
| sensors | `src/api/sensors.ts` | Sensors CRUD, Data, Stats, OneWire |
| actuators | `src/api/actuators.ts` | CRUD, Command, State, History |
| zones | `src/api/zones.ts` | Zone CRUD, Assign, Master |
| subzones | `src/api/subzones.ts` | Subzone CRUD, SafeMode |
| logic | `src/api/logic.ts` | Rules CRUD, Toggle, History |
| database | `src/api/database.ts` | Tables, Schema, Data |
| config | `src/api/config.ts` | System Config List, Update |
| health | `src/api/health.ts` | Health Live, Detailed |
| audit | `src/api/audit.ts` | Audit Log |
| logs | `src/api/logs.ts` | Server Logs |
| errors | `src/api/errors.ts` | Error History |
| debug | `src/api/debug.ts` | Debug/Mock-ESP Commands |
| users | `src/api/users.ts` | User Management |
| loadtest | `src/api/loadtest.ts` | Load Test API |

### Error-Flow

```
API Error → Axios Response Interceptor
  → 401: Auto-Refresh + Retry (Loop Guard aktiv)
  → Andere: Promise.reject(error)
  → Store catch: extractErrorMessage()
  → useToast: error notification
  → ErrorDetailsModal (via CustomEvent 'show-error-details')
```

---

## 4. Pinia Stores (13)

| Store | Pfad | Kernverantwortung |
|-------|------|-------------------|
| **esp** | `src/stores/esp.ts` | ESP-Devices, Sensoren, Aktoren, Zones, WebSocket, Pending Devices (22 Event-Handler) |
| **auth** | `src/shared/stores/auth.store.ts` | Login, Token, User, Refresh, Setup |
| **logic** | `src/shared/stores/logic.store.ts` | Cross-ESP Automation Rules, Connections |
| **database** | `src/shared/stores/database.store.ts` | DB Explorer State, Table/Schema/Data |
| **dragState** | `src/shared/stores/dragState.store.ts` | Drag&Drop State, Safety-Timeout (30s) |
| **zone** | `src/shared/stores/zone.store.ts` | Zone-Management |
| **actuator** | `src/shared/stores/actuator.store.ts` | Actuator-State |
| **sensor** | `src/shared/stores/sensor.store.ts` | Sensor-State |
| **gpio** | `src/shared/stores/gpio.store.ts` | GPIO-Status, OneWire-Scan |
| **notification** | `src/shared/stores/notification.store.ts` | Benachrichtigungen |
| **config** | `src/shared/stores/config.store.ts` | System-Config |
| **ui** | `src/shared/stores/ui.store.ts` | UI-State, Confirm, Context-Menu |
| **dashboard** | `src/shared/stores/dashboard.store.ts` | Dashboard-Filter, Zoom, TopBar-Actions |

### ESP Store (Detail)

- **State:** `esps`, `pendingDevices`, `selectedEsp`, `loading`, `error`, `offlineInfoMap`
- **WebSocket:** `setupWebSocket()`, `cleanupWebSocket()`, auto-connect via useWebSocket
- **API:** Nutzt `espApi`, `sensorsApi`, `actuatorsApi`, `debugApi`
- **22 Event-Handler:** siehe Sektion 2

---

## 5. Auth-Flow

### localStorage Keys

| Key | Wert |
|-----|------|
| `el_frontend_access_token` | JWT Access Token |
| `el_frontend_refresh_token` | JWT Refresh Token |

### Flow-Kette

```
App Mount → authStore.checkAuthStatus()
  → GET /auth/status (setupRequired?)
  → If token: GET /auth/me → User laden
  → If 401: refreshTokens() → POST /auth/refresh → Retry
  → If refresh fails: clearAuth() → redirect /login

Login: POST /auth/login → {tokens, user} → localStorage
Logout: clearAuth() + websocketService.disconnect()
WebSocket: Token in URL Query, refreshTokenIfNeeded() vor Reconnect
```

### Infinite-Loop-Guard

Skip Interceptor fuer: `/auth/refresh`, `/auth/login`, `/auth/setup`, `/auth/status`

---

## 6. Build-Chain

```
Vite 6.2.4 + Vue 3 + TypeScript strict + Tailwind 3.4.17
Build = 2 Steps: vue-tsc -b (Type-Check) + vite build (Bundle)
Dev: Port 5173, Proxy /api → el-servador:8000, Proxy /ws → ws://el-servador:8000
Alias: @ → ./src (tsconfig.json + vite.config.ts)
```

### Build-Scripts

```json
"dev": "vite"
"build": "vue-tsc -b && vite build"
"type-check": "vue-tsc --noEmit"
```

### TypeScript Config

```
Target: ES2020 | Module: ESNext | Strict: true
noUnusedLocals: true | noUnusedParameters: true
Path Alias: @/* → ./src/*
Include: src/**/*.ts, src/**/*.tsx, src/**/*.vue
```

---

## 7. Docker-Setup

| Aspekt | Wert |
|--------|------|
| Service | `el-frontend` |
| Container | `automationone-frontend` |
| Image | `node:20-alpine` |
| Port | 5173:5173 |
| CMD | `npm run dev -- --host 0.0.0.0` |
| Healthcheck | `node -e "fetch('http://localhost:5173')..."` |
| User | Non-root (`appuser:1001`) |

### Volumes (7, alle read-only)

`./El Frontend/src`, `public`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`

### Logging

| Quelle | Zugriff | Format |
|--------|---------|--------|
| Docker stdout/stderr | `docker compose logs el-frontend` | JSON structured (createLogger → Alloy Stage 3) + Text (Vite) |
| **Loki** (Monitoring-Profil) | `curl` Loki API, Label `compose_service="el-frontend"` (ROADMAP §1.1) | JSON, 7 Tage Retention |
| **Grafana** (Monitoring-Profil) | `http://localhost:3000` (Panel 5: Log Volume, Panel 6: Errors) | Dashboard |
| Browser Console | Nur Browser DevTools (Blind Spot) | DOM-Events, User-Interaktionen |
| `logs/current/frontend_container.log` | Nach `scripts/debug/start_session.sh` | Ephemer, Snapshot |

Loki-Labels: `compose_service="el-frontend"`, `container="automationone-frontend"`, `stream="stdout"/"stderr"` (Alloy: `reference/ROADMAP_KI_MONITORING.md` §1.1)

---

## 8. Error-Kategorien

### Build-Errors (TypeScript)

| Code | Kategorie | Typische Ursache |
|------|-----------|------------------|
| TS2304 | Not Defined | Type/Variable nicht importiert |
| TS2322 | Type Mismatch | Inkompatible Zuweisung |
| TS2339 | Property Missing | Property existiert nicht auf Typ |
| TS7006 | Implicit Any | Parameter ohne Type-Annotation |
| Module not found | Import | Falscher Pfad, fehlender Export |
| `[vite]` | Vite | Build-Konfiguration |

### Runtime-Errors

| Pattern | Kategorie | Typische Ursache |
|---------|-----------|------------------|
| TypeError | Null/Undefined | `.value` auf undefined, fehlende Optional Chaining |
| ReferenceError | Scope | Variable nicht definiert |
| `[Vue warn]` | Vue | Component/Lifecycle Warning |
| `[Pinia]` | Store | State-Management Fehler |
| Uncaught (in promise) | Async | Unhandled Promise rejection |

### WebSocket-Errors

| Symptom | Ursache | Debug-Pfad |
|---------|---------|------------|
| Close Code 1006 | Abnormal Closure | Server-Status + Reconnect-Logik |
| Events fehlen | Handler fehlt | ESP Store 22 Handler pruefen |
| Reconnect-Loop | Token expired | Auth-Flow + refreshTokenIfNeeded |
| Rate Limit | >10 msg/s | Client-seitig, Service pruefen |

### API-Errors

| HTTP | Bedeutung | Debug-Pfad |
|------|-----------|------------|
| 401 | Unauthorized | Token + Interceptor + Refresh-Loop |
| 403 | Forbidden | Router Guard + Admin-Check |
| 404 | Not Found | Endpoint + Resource-ID |
| 422 | Validation | Request-Body + Pydantic-Schema |
| 500 | Server Error | → server-debug |
| ECONNREFUSED | No Connection | Server-Container + Port |

---

## 9. Component-Hierarchie

### Dashboard-Kette (Zwei-Stufen-Navigation, route-based)

```
HardwareView (router.push, useSwipeNavigation)
  Level 1: ZonePlate (pro Zone) → DeviceMiniCard (pro ESP) → Klick navigiert zu Device
  Level 2: DeviceDetailView → ESPOrbitalLayout (SensorSatellite, ActuatorSatellite)
+ Breadcrumb via Router
+ UnassignedDropBar (Drag&Drop unzugewiesene Devices)
+ PendingDevicesPanel (device_discovered → Approve/Reject)
+ DeviceMiniCard, DeviceHeaderBar
+ ComponentSidebar, Sensor/Actuator Sidebars
```

### SystemMonitor-Kette

```
SystemMonitorView → MonitorHeader + MonitorTabs
  ├→ EventsTab → EventTimeline + EventDetailsPanel
  ├→ HealthTab → HealthSummaryBar
  ├→ DatabaseTab → DataTable
  ├→ MqttTrafficTab
  └→ ServerLogsTab
```

### App-Level

```
App.vue
  ├→ authStore (Init: checkAuthStatus)
  ├→ espStore (Cleanup: cleanupWebSocket)
  ├→ ToastContainer (Global)
  └→ ErrorDetailsModal (Global)
MainLayout → AppHeader + AppSidebar + <RouterView />
```

---

## 10. Data-Pipelines (4 Kern-Flows)

**WebSocket → UI:** Server broadcast → WS Frame → WebSocketService → Filter-Match → Store Handler → Vue Reactivity → DOM

**API → UI:** User Click → Store Action → API Module → Axios (Bearer Token) → Server → Response Interceptor (401→Refresh) → Store → DOM

**Auth:** App Start → checkAuthStatus → Token validate → Router Guard → WebSocket Token in URL

**Error:** API Error → Interceptor (401→Refresh) → Store catch → Toast → ErrorDetailsModal

---

## 11. Test-Infrastruktur

### Vitest (Unit Tests)

| Aspekt | Wert |
|--------|------|
| Config | `El Frontend/vitest.config.ts` |
| Script | `npm run test` / `npm run test:unit` |
| Environment | jsdom |
| Include | `tests/**/*.test.ts` |
| Coverage | `logs/frontend/vitest/coverage/` |
| Timeout | 10000ms |

**Unit Tests:** formatters, auth store, useToast, useWebSocket, esp store

### Playwright (E2E)

| Aspekt | Wert |
|--------|------|
| Config | `El Frontend/playwright.config.ts` |
| Script | `npx playwright test` |
| Browser | Chromium |
| Base URL | `http://localhost:5173` |
| Auth | Global Setup mit storageState |
| Report | `logs/frontend/playwright/playwright-report/` |
| Test-Dir | `tests/e2e/scenarios/` |

**6 E2E Szenarien:** auth, sensor-live, actuator, emergency, device-discovery, esp-registration-flow

**Vitest/Playwright:** In package.json (test, test:unit, test:coverage) und devDependencies.

### Playwright MCP (für Agenten)

Wenn der Editor (Cursor) den Playwright MCP-Server nutzt (z. B. cursor-ide-browser), kann der Agent den Browser **live** inspizieren und den Frontend-Blind-Spot vermeiden:
- `browser_navigate` → `http://localhost:5173`
- `browser_snapshot` → DOM-Zustand
- `browser_console_messages` → Vue/JS-Fehler
- `browser_network_requests` → fehlgeschlagene API-Calls, WebSocket-Status

Voraussetzung: Frontend läuft (z. B. `docker compose up el-frontend` oder Dev-Server). Details: `docs/plans/Debug.md` Sektion „Playwright MCP“. Siehe auch `reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` §9.1.

---

## 12. Grep-Patterns

```bash
# Type-Workarounds zaehlen
grep -rn "// @ts-ignore\|// @ts-expect-error\|: any\|as unknown" "El Frontend/src/" --include="*.ts" --include="*.vue" | wc -l

# Fehlende Cleanups (Components mit onMounted aber ohne onUnmounted)
grep -rn "onMounted\|watch(" "El Frontend/src/components/" --include="*.vue" -l | xargs grep -L "onUnmounted\|onBeforeUnmount"

# WebSocket-Subscriptions ohne Cleanup
grep -rn "subscribe\|\.on(" "El Frontend/src/" --include="*.ts" --include="*.vue" | grep -v "test"

# Store Event-Handler (esp Store + shared)
grep -rn "subscribe\|\.on(" "El Frontend/src/stores/" "El Frontend/src/shared/stores/" --include="*.ts" | head -30

# Import-Konsistenz (relative statt @/)
grep -rn "from '\.\.\/" "El Frontend/src/" --include="*.ts" --include="*.vue" | grep -v "node_modules"

# Vue Errors im Docker-Log
docker compose logs --tail=100 el-frontend 2>&1 | grep -i "error\|warn\|failed"

# TypeScript Errors im Build
docker compose logs --tail=100 el-frontend 2>&1 | grep -E "TS[0-9]{4}"

# Alle Vue Errors (globaler Handler)
grep -rn "\[Vue Error\]" "El Frontend/src/" --include="*.ts"

# Suche nach ws.on() ohne Cleanup
grep -rn "ws.on\|subscribe" "El Frontend/src" --include="*.vue" --include="*.ts"

# Suche nach any-Type
grep -rn ": any" "El Frontend/src" --include="*.ts" --include="*.vue"
```

---

## 13. Referenzen

| Wann | Datei | Zweck |
|------|-------|-------|
| Bei WebSocket-Fragen | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Event-Schema (28 Server-Events) |
| Bei API-Fragen | `.claude/reference/api/REST_ENDPOINTS.md` | Endpoint-Uebersicht |
| Bei Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Datenfluesse |
| Bei Error-Codes | `.claude/reference/errors/ERROR_CODES.md` | Server-Errors (5xxx) |
| Bei Type-Fragen | `El Frontend/src/types/` | Type-Definitionen |
| Bei Swipe-Navigation | `El Frontend/src/composables/useSwipeNavigation.ts` | Zwei-Stufen-Dashboard-Navigation (route-based) |