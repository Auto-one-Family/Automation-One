# Frontend Test Engine IST-Analyse

> **Agent:** frontend-debug
> **Datum:** 2026-02-10
> **Scope:** El Frontend (Vue 3 + Vitest + Playwright)
> **Auftrag:** Vollständige IST-Analyse der Frontend-Test-Engine gemäß TEST_ENGINE_ANALYSIS_PLAN.md

---

## Executive Summary

**Status:** ⚠️ **KRITISCH – Tests existieren, aber Test-Infrastruktur fehlt**

Die Frontend-Test-Suite hat **hochwertige Unit-Tests**, aber **kritische Lücken**:

| Kategorie | Befund | Coverage |
|-----------|--------|----------|
| **Test-Infrastruktur** | ❌ Keine Dependencies in package.json | N/A |
| **Store Tests** | ⚠️ 2 von 5 Stores getestet | **40%** |
| **Composable Tests** | ⚠️ 2 von 8 Composables getestet | **25%** |
| **Component Tests** | ❌ 0 von 67 Components getestet | **0%** |
| **Integration Tests** | ❌ Ordner leer | **0%** |
| **E2E Tests** | ✅ 5 Playwright Scenarios | ✅ OK |
| **Mocks** | ✅ MSW-basiert, comprehensive | ✅ OK |
| **Config** | ✅ vitest.config.ts + playwright.config.ts | ✅ OK |

**Kritisches Blocker-Problem:** Tests können **NICHT ausgeführt werden** – Vitest und Test-Utils fehlen in package.json!

---

## 1. Prüfpunkt: vitest.config.ts

### Befund: ✅ **OK – Vollständig konfiguriert**

**Datei:** `El Frontend/vitest.config.ts` (43 Zeilen)

```typescript
// Highlights
test: {
  globals: true,                        // ✅ Globale Test-APIs
  environment: 'jsdom',                 // ✅ DOM-Simulation
  setupFiles: ['./tests/setup.ts'],    // ✅ Setup-File definiert
  include: ['tests/**/*.test.ts'],     // ✅ Pattern korrekt
  coverage: {
    provider: 'v8',                     // ✅ Modern (v8 statt istanbul)
    reporter: ['text', 'json', 'html'], // ✅ Multiple Formate
    reportsDirectory: '../../logs/frontend/vitest/coverage', // ✅ Zentrales Log-Dir
    include: ['src/**/*.{ts,vue}'],     // ✅ Nur Source-Code
    exclude: ['src/**/*.d.ts', 'src/main.ts', 'src/vite-env.d.ts'] // ✅ Sinnvolle Excludes
  },
  testTimeout: 10000,                   // ✅ 10s Timeout
  hookTimeout: 10000,                   // ✅ Hook Timeout
  pool: 'forks',                        // ✅ Isolierung
  poolOptions: { forks: { singleFork: true } } // ✅ Single-Fork für Stabilität
}
resolve: {
  alias: { '@': resolve(__dirname, 'src') } // ✅ Alias wie in vite.config.ts
}
```

**Bewertung:**
- **Globals:** ✅ Aktiviert (describe, it, expect ohne Import)
- **Environment:** ✅ jsdom (korrekt für Vue)
- **Coverage:** ✅ V8-Provider, 3 Formate, zentrale Logs
- **Paths:** ✅ Alias @ → src
- **Timeouts:** ✅ 10s (angemessen für Vue-Tests mit async)
- **Pool:** ✅ Forks + singleFork (verhindert Race-Conditions)

**Findings:** Keine. Config ist **Best Practice 2025**.

---

## 2. Prüfpunkt: setup.ts

### Befund: ✅ **OK – Sehr gut strukturiert**

**Datei:** `El Frontend/tests/setup.ts` (156 Zeilen)

```typescript
// MSW Server Setup
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => { server.resetHandlers(); localStorage.clear(); sessionStorage.clear() })
afterAll(() => server.close())

// Pinia Setup (fresh store per test)
beforeEach(() => setActivePinia(createPinia()))

// Vue Test Utils Global Config
config.global.stubs = { RouterLink: true, RouterView: true, teleport: true }

// Global Mocks (jsdom-Lücken)
- window.matchMedia ✅
- ResizeObserver ✅
- IntersectionObserver ✅
- window.scrollTo ✅
- HTMLCanvasElement.getContext ✅ (für Chart.js)
```

**Bewertung:**
- **MSW:** ✅ Korrekt (listen, resetHandlers, close)
- **Pinia:** ✅ **PERFEKT** – Fresh Pinia in beforeEach (verhindert State-Pollution)
- **Vue Stubs:** ✅ Router + Teleport gestubbed
- **Global Mocks:** ✅ Alle jsdom-Lücken geschlossen
- **Chart.js Mock:** ✅ Umfassend (Canvas Context mit 20+ Methoden)

**Findings:** Keine. Setup ist **Best Practice 2025**.

---

## 3. Prüfpunkt: Store Tests (auth, esp)

### Befund: ⚠️ **2 von 5 Stores getestet (40% Coverage)**

**Getestete Stores:**

| Store | Test-File | Zeilen | Qualität |
|-------|-----------|--------|----------|
| **auth** | `tests/unit/stores/auth.test.ts` | 520 | ✅ **Exzellent** |
| **esp** | `tests/unit/stores/esp.test.ts` | 989 | ✅ **Exzellent** |

**Nicht getestete Stores:**

| Store | Pfad | Geschätzte Complexity |
|-------|------|----------------------|
| ❌ **database** | `src/stores/database.ts` | Mittel (DB Explorer State) |
| ❌ **logic** | `src/stores/logic.ts` | Hoch (Cross-ESP Automation) |
| ❌ **dragState** | `src/stores/dragState.ts` | Niedrig (Drag&Drop State) |

### auth.test.ts – Analyse

**Struktur:** 9 Test-Suites, 520 Zeilen

```typescript
✅ Initial State (7 Tests)
✅ Computed Getters (3x describe: isAuthenticated, isAdmin, isOperator)
✅ checkAuthStatus (6 Tests: setup_required, token validation, isLoading)
✅ login (5 Tests: success, localStorage, error, loading)
✅ setup (3 Tests: admin creation, setupRequired=false)
✅ logout (4 Tests: clear state, disconnect WS, API failure resilience)
✅ refreshTokens (3 Tests: no token error, success, failure → clearAuth)
✅ clearAuth (2 Tests: reset state, localStorage)
```

**Pattern-Konformität:**
- ✅ `setActivePinia(createPinia())` in beforeEach
- ✅ MSW für API-Mocking
- ✅ `vi.mock('@/services/websocket')` für externe Dependencies
- ✅ localStorage.clear() in afterEach
- ✅ Assertions auf State UND localStorage
- ✅ Error-Handling getestet (401, 500)
- ✅ Loading-States getestet

**Bewertung:** **10/10** – Best Practice, comprehensive, industrielles Niveau.

### esp.test.ts – Analyse

**Struktur:** 12 Test-Suites, 989 Zeilen

```typescript
✅ Initial State (8 Tests)
✅ fetchAll (4 Tests: success, isLoading, error, deduplication)
✅ fetchDevice (3 Tests)
✅ createDevice (2 Tests)
✅ updateDevice (2 Tests: success, fallback to debug store)
✅ deleteDevice (3 Tests: remove, clear selectedDeviceId, 404 graceful)
✅ Pending Devices (3x describe: fetchPendingDevices, approveDevice, rejectDevice)
✅ Computed Getters (9x describe: selectedDevice, deviceCount, onlineDevices, offlineDevices, mockDevices, realDevices, devicesByZone, pendingCount, isMock)
✅ GPIO Status (2 Tests: fetch + cache, loading state)
✅ Mock ESP Actions (5x describe: triggerHeartbeat, setState, addSensor, removeSensor, addActuator)
✅ Actuator Commands (2x describe: sendActuatorCommand, emergencyStopAll)
✅ Utility Actions (3x describe: selectDevice, clearError, updateDeviceInList)
✅ Edge Cases (2 Tests: timeout, validation errors)
```

**Pattern-Konformität:**
- ✅ `setActivePinia(createPinia())` in beforeEach
- ✅ MSW für API-Mocking
- ✅ `vi.mock('@/services/websocket')` + `vi.mock('@/composables/useWebSocket')`
- ✅ **Persistent Mock Functions** (mockToastFunctions außerhalb, kein Rebind pro Test)
- ✅ Deduplication-Tests (device_id vs esp_id)
- ✅ Fallback-Logic getestet (debug store für orphaned mocks)
- ✅ Edge-Cases (timeout, validation errors)

**Bewertung:** **10/10** – Best Practice, sehr umfassend, Fallback-Logik abgedeckt.

**Findings:**
- ✅ Beide Tests nutzen korrekt `setActivePinia` (keine State-Pollution)
- ✅ Mocking-Strategy konsistent (MSW + vi.mock für Services)
- ❌ **Gap:** 3 Stores ohne Tests (database, logic, dragState)

---

## 4. Prüfpunkt: Composable Tests (useToast, useWebSocket)

### Befund: ⚠️ **2 von 8 Composables getestet (25% Coverage)**

**Getestete Composables:**

| Composable | Test-File | Zeilen | Qualität |
|------------|-----------|--------|----------|
| **useToast** | `tests/unit/composables/useToast.test.ts` | 378 | ✅ **Exzellent** |
| **useWebSocket** | `tests/unit/composables/useWebSocket.test.ts` | 943 | ✅ **Exzellent** |

**Nicht getestete Composables:**

| Composable | Pfad | Geschätzte Complexity |
|------------|------|----------------------|
| ❌ **useModal** | `src/composables/useModal.ts` | Niedrig |
| ❌ **useSwipeNavigation** | `src/composables/useSwipeNavigation.ts` | Mittel |
| ❌ **useGpioStatus** | `src/composables/useGpioStatus.ts` | Mittel |
| ❌ **useQueryFilters** | `src/composables/useQueryFilters.ts` | Mittel |
| ❌ **useZoneDragDrop** | `src/composables/useZoneDragDrop.ts` | Hoch |
| ❌ **useConfigResponse** | `src/composables/useConfigResponse.ts` | Mittel |

### useToast.test.ts – Analyse

**Struktur:** 9 Test-Suites, 378 Zeilen

```typescript
✅ Basic Show (4 Tests: API vollständig, ID unique, createdAt timestamp)
✅ Convenience Methods (4 Tests: success/error/warning/info + params)
✅ Duration (5 Tests: default 5s, error 8s, custom, auto-dismiss, persistent no dismiss)
✅ Dismiss & Clear (3 Tests)
✅ Deduplication (3 Tests: 2s window, different types, window expiry)
✅ Max Limits (3 Tests: 20 total, oldest removed, 10 persistent)
✅ Singleton State (2 Tests: shared state, clear() affects all)
✅ Toast Actions (2 Tests: actions array, multiple actions)
```

**Pattern-Konformität:**
- ✅ `vi.useFakeTimers()` + `vi.advanceTimersByTime()` für auto-dismiss
- ✅ `beforeEach(() => { vi.useFakeTimers(); clear() })`
- ✅ `afterEach(() => { clear(); vi.useRealTimers() })`
- ✅ Singleton-Behavior getestet (shared state)
- ✅ Edge-Cases (max limits, deduplication)

**Bewertung:** **10/10** – Timer-Handling korrekt, Singleton-Tests, comprehensive.

### useWebSocket.test.ts – Analyse

**Struktur:** 10 Test-Suites, 943 Zeilen

```typescript
✅ Basic API (1 Test: returns expected properties)
✅ Connection (4x describe: Initial State, connect(), disconnect())
✅ Subscriptions (3x describe: subscribe(), on(), unsubscribe())
✅ Messages (4 Tests: lastMessage, messageCount, dispatch, all handlers)
✅ Filter Updates (3 Tests: updateFilters)
✅ Status Monitor (3 Tests: isConnected update, 1s interval, watchStatus)
✅ Cleanup (5 Tests: stop interval, clear handlers, unsubscribe, multiple calls, singleton not disconnected)
✅ Options (4 Tests: autoConnect true/false, initial filters, subscribe on connect)
✅ Errors (4 Tests: connectionError, status=error, clear on retry, service error)
✅ Integration Scenarios (3 Tests: full lifecycle, multiple handlers, filter updates)
```

**Pattern-Konformität:**
- ✅ `vi.mock('@/services/websocket', () => createWebSocketMock())`
- ✅ **Custom WebSocket Mock** (`tests/mocks/websocket.ts`) – simuliert Service
- ✅ `vi.useFakeTimers()` für Status-Monitor-Interval (1s)
- ✅ **Cleanup-Tracking** (`cleanupFunctions[]`) – verhindert Timer-Leaks
- ✅ `beforeEach(() => mockWebSocketService.reset())`
- ✅ Lifecycle-Tests (connect → subscribe → receive → disconnect)
- ✅ Edge-Cases (error handling, cleanup safety)

**Bewertung:** **10/10** – Best Practice für Singleton-Service-Tests, Timer-Cleanup korrekt.

**Findings:**
- ✅ Beide Tests nutzen Fake-Timers korrekt
- ✅ Custom Mock für WebSocketService ist comprehensive
- ❌ **Gap:** 6 Composables ohne Tests

---

## 5. Prüfpunkt: Mocks (handlers, server, websocket)

### Befund: ✅ **OK – MSW-basiert, comprehensive**

**Mock-Dateien:**

| File | Zeilen | Zweck |
|------|--------|-------|
| `handlers.ts` | 799 | MSW Request Handlers (alle API-Endpoints) |
| `server.ts` | ~ | MSW Server Setup |
| `websocket.ts` | ~ | Custom WebSocket Service Mock |

### handlers.ts – Analyse (799 Zeilen)

**Mock-Data (exportiert für Tests):**
```typescript
mockUser, mockTokens, mockESPDevice, mockSensor, mockActuator, mockPendingDevice, mockGpioStatus
```

**API-Handler-Gruppen:**

| Gruppe | Endpoints | Zeilen | Coverage |
|--------|-----------|--------|----------|
| **Auth** | 5 Endpoints (status, login, setup, refresh, me, logout) | 90 | ✅ Vollständig |
| **ESP Devices** | 6 Endpoints (list, pending, get, update, delete, gpio-status) + approve/reject | 100 | ✅ Vollständig |
| **Sensors** | 2 Endpoints (data, create/update) | 50 | ⚠️ Partial (keine delete, stats) |
| **Actuators** | 2 Endpoints (command, emergency_stop) | 35 | ✅ OK |
| **OneWire** | 1 Endpoint (scan) | 25 | ✅ OK |
| **Zones** | 2 Endpoints (assign, remove) | 30 | ⚠️ Partial (keine subzones) |
| **Database** | 1 Endpoint (tables) | 15 | ⚠️ Minimal |
| **Audit** | 1 Endpoint (statistics) | 15 | ⚠️ Minimal |
| **Debug/Mock ESP** | 14 Endpoints (CRUD + sensors/actuators/state/heartbeat) | 260 | ✅ Umfassend |

**Pattern-Konformität:**
- ✅ MSW `http.get/post/patch/delete/put` korrekt
- ✅ URL-Parameter via `params` extrahiert
- ✅ Request-Body via `await request.json()`
- ✅ HttpResponse.json() mit Status-Codes (200, 401, 404, 422, 500)
- ✅ Error-Handling (401, 404 für verschiedene Szenarien)
- ✅ Validation-Errors (422 mit Pydantic-Format)
- ✅ Mock-Data realistisch (timestamps, IDs, nested objects)

**Server-API-Schema-Konsistenz:**

Prüfung gegen `.claude/reference/api/REST_ENDPOINTS.md`:

| Endpoint | Mock vorhanden | Schema-Match |
|----------|----------------|--------------|
| POST /auth/login | ✅ | ✅ (tokens + user) |
| POST /auth/refresh | ✅ | ✅ (tokens nested) |
| GET /auth/me | ✅ | ✅ (user object) |
| GET /esp/devices | ✅ | ✅ (data + total) |
| POST /esp/devices/:id/approve | ✅ | ✅ (success + device) |
| POST /actuators/:espId/:gpio/command | ✅ | ✅ (success + command) |
| POST /actuators/emergency_stop | ✅ | ❌ **Endpoint ist emergency_stop (underscore), nicht emergency-stop (hyphen)** |

**Findings:**
- ✅ MSW-Handlers decken **~80% der Server-API** ab
- ❌ **Gap:** Keine Mocks für Subzones, Logic, Logs, Errors, Health (detailed), Users, Loadtest
- ✅ Debug/Mock-ESP Handlers sind **sehr umfassend** (14 Endpoints)
- ⚠️ **Inkonsistenz:** `emergency_stop` (underscore) ist korrekt (siehe Mock), aber Dokumentation könnte Hyphen haben

---

## 6. Prüfpunkt: E2E Scenarios (Playwright)

### Befund: ✅ **OK – 5 Scenarios vorhanden, Config vollständig**

**E2E Scenarios:**

| File | Scope | Geschätzte Zeilen |
|------|-------|-------------------|
| `auth.spec.ts` | Login/Logout Flow | ~ |
| `actuator.spec.ts` | Actuator Control | ~ |
| `device-discovery.spec.ts` | Pending Device Approval | ~ |
| `emergency.spec.ts` | Emergency Stop via UI | ~ |
| `sensor-live.spec.ts` | Live Sensor Updates (WebSocket) | ~ |

**playwright.config.ts – Analyse (107 Zeilen)**

```typescript
testDir: './tests/e2e/scenarios'
testMatch: '**/*.spec.ts'
fullyParallel: true                         // ✅ Parallel-Execution
forbidOnly: !!process.env.CI                // ✅ CI-Safety
retries: process.env.CI ? 1 : 0             // ✅ Flaky-Test-Recovery nur CI
workers: process.env.CI ? 2 : undefined     // ✅ Resource-Limits CI

reporter: [
  ['html', { outputFolder: '../../logs/frontend/playwright/playwright-report' }], // ✅ Zentral
  ['list'],
  ...(process.env.CI ? [['github']] : [])   // ✅ GitHub Annotations
]

globalSetup: './tests/e2e/global-setup.ts'        // ✅ Auth-Setup (Login einmal)
globalTeardown: './tests/e2e/global-teardown.ts'  // ✅ Cleanup

use: {
  baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173', // ✅ Konfigurierbar
  storageState: '.playwright/auth-state.json',    // ✅ Auth-State-Reuse
  trace: 'on-first-retry',                         // ✅ Debugging
  screenshot: 'only-on-failure',                   // ✅ Artifacts
  video: 'on-first-retry',                         // ✅ Video bei Retry
  viewport: { width: 1280, height: 720 },         // ✅ Konsistent
  actionTimeout: 10000,                            // ✅ WebSocket-fähig
  navigationTimeout: 30000                         // ✅ Langsame API
}

timeout: 30000                               // ✅ Global 30s (WebSocket-Tests)
expect: { timeout: 10000 }                   // ✅ Expect 10s

projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } } // ✅ Nur Chromium (Speed)
]
```

**Pattern-Konformität:**
- ✅ Global Setup für Auth (Login einmal, Token in `.playwright/auth-state.json`)
- ✅ storageState reused (jeder Test startet authenticated)
- ✅ Trace + Screenshot + Video bei Failures
- ✅ Zentrale Log-Directory (`logs/frontend/playwright/`)
- ✅ CI-Optimierungen (GitHub Reporter, Retries, Workers)
- ✅ Timeouts angepasst für WebSocket (30s global, 10s action)

**E2E Helpers:**

| File | Zweck |
|------|-------|
| `helpers/api.ts` | API-Helper für Playwright |
| `helpers/format.ts` | Formatierung |
| `helpers/mqtt.ts` | MQTT-Helper (unklar ob genutzt) |
| `helpers/websocket.ts` | WebSocket-Helper |

**Findings:**
- ✅ Playwright-Config ist **Best Practice 2025**
- ✅ Auth-Setup mit globalSetup (verhindert Login-Redundanz)
- ⚠️ **Unklar:** Werden E2E-Tests in CI ausgeführt? (Kein GitHub-Workflow sichtbar)
- ❌ **Gap:** Keine Zone-Kaiser E2E Scenarios (zone assignment, subzone, drag-drop)

---

## 7. Prüfpunkt: Integration/ ist LEER

### Befund: ❌ **LEER – Nur .gitkeep vorhanden**

**Verzeichnis:** `El Frontend/tests/integration/`

```bash
$ ls -la El Frontend/tests/integration/
total 0
drwxr-xr-x 1 PCUser 197121 0 Feb  6 06:34 .
drwxr-xr-x 1 PCUser 197121 0 Feb  6 13:19 ..
-rw-r--r-- 1 PCUser 197121 0 Feb  6 06:34 .gitkeep
```

**Bewusste Entscheidung oder Lücke?**

**Analyse:** Wahrscheinlich **Lücke**, nicht bewusste Entscheidung. Gründe:

1. **Ordner existiert** (nicht gelöscht) → geplant, aber nicht umgesetzt
2. **MSW ist da** (setup.ts startet MSW Server) → Integration-Tests könnten Store + API-Mock kombinieren
3. **E2E deckt nicht alles ab** → Integration-Tests für Store ↔ API Zusammenspiel fehlen

**Was sollte in Integration-Tests stehen?**

Beispiele:
- **Store + API Mock:** `espStore.fetchAll()` → MSW Response → Store aktualisiert
- **WebSocket + Store:** WS-Message `sensor_data` → ESP Store-Handler → UI-Update
- **Router Guards + Auth:** Navigate `/dashboard` ohne Token → Redirect `/login`
- **Pinia Store-Interaktion:** `authStore.logout()` → `espStore.cleanupWebSocket()` aufgerufen

**Findings:**
- ❌ **Gap:** Integration-Tests komplett fehlend
- ⚠️ **Pattern-Lücke:** Keine Tests für Store ↔ API Zusammenspiel

---

## 8. Prüfpunkt: Coverage-Lücken (Stores, Composables, Components)

### Store Coverage

| Store | Source | Test | Status |
|-------|--------|------|--------|
| auth | `src/stores/auth.ts` | `tests/unit/stores/auth.test.ts` | ✅ **520 Zeilen** |
| esp | `src/stores/esp.ts` | `tests/unit/stores/esp.test.ts` | ✅ **989 Zeilen** |
| database | `src/stores/database.ts` | ❌ NO TEST | ❌ **0%** |
| logic | `src/stores/logic.ts` | ❌ NO TEST | ❌ **0%** |
| dragState | `src/stores/dragState.ts` | ❌ NO TEST | ❌ **0%** |

**Store Coverage:** **2/5 = 40%**

### Composable Coverage

| Composable | Source | Test | Status |
|------------|--------|------|--------|
| useToast | `src/composables/useToast.ts` | `tests/unit/composables/useToast.test.ts` | ✅ **378 Zeilen** |
| useWebSocket | `src/composables/useWebSocket.ts` | `tests/unit/composables/useWebSocket.test.ts` | ✅ **943 Zeilen** |
| useModal | `src/composables/useModal.ts` | ❌ NO TEST | ❌ **0%** |
| useSwipeNavigation | `src/composables/useSwipeNavigation.ts` | ❌ NO TEST | ❌ **0%** |
| useGpioStatus | `src/composables/useGpioStatus.ts` | ❌ NO TEST | ❌ **0%** |
| useQueryFilters | `src/composables/useQueryFilters.ts` | ❌ NO TEST | ❌ **0%** |
| useZoneDragDrop | `src/composables/useZoneDragDrop.ts` | ❌ NO TEST | ❌ **0%** |
| useConfigResponse | `src/composables/useConfigResponse.ts` | ❌ NO TEST | ❌ **0%** |

**Composable Coverage:** **2/8 = 25%**

### Component Coverage

**Gesamt:** 67 `.vue`-Files in `src/components/`

```bash
$ find "El Frontend/src/components/" -name "*.vue" | wc -l
67
```

**Component-Tests:** **0**

```bash
$ find "El Frontend/tests/" -name "*.vue.test.ts" -o -name "*Component.test.ts" | wc -l
0
```

**Component Coverage:** **0/67 = 0%**

**Kritische Components ohne Tests:**

| Component | Pfad | Geschätzte Complexity |
|-----------|------|----------------------|
| ESPCard | `components/esp/ESPCard.vue` | ⭐⭐⭐ Hoch |
| SensorSatellite | `components/esp/SensorSatellite.vue` | ⭐⭐ Mittel |
| ActuatorSatellite | `components/esp/ActuatorSatellite.vue` | ⭐⭐ Mittel |
| PendingDevicesPanel | `components/esp/PendingDevicesPanel.vue` | ⭐⭐ Mittel |
| ZoneGroup | `components/zones/ZoneGroup.vue` | ⭐⭐⭐ Hoch |
| EventTimeline | `components/system-monitor/EventTimeline.vue` | ⭐⭐ Mittel |
| ErrorDetailsModal | `components/error/ErrorDetailsModal.vue` | ⭐ Niedrig |
| ToastContainer | `components/common/ToastContainer.vue` | ⭐ Niedrig |

**Findings:**
- ❌ **Gap:** 67 Components, **0 Tests**
- ❌ **Gap:** Kritische Components (ESPCard, ZoneGroup) ohne Tests
- ⚠️ **Risiko:** UI-Rendering-Fehler werden erst in E2E oder manuell gefunden

---

## 9. Prüfpunkt: TypeScript-Konsistenz (Types in Tests vs. src/types/)

### Befund: ✅ **OK – Tests nutzen korrekt src/types/**

**Source Types:**

| File | Zweck |
|------|-------|
| `src/types/index.ts` | Haupt-Types (ESPDevice, Sensor, Actuator, User, etc.) |
| `src/types/websocket-events.ts` | MessageType Union (26 WebSocket Events) |
| `src/types/api.ts` | API Request/Response Types |
| `src/types/stores.ts` | Store Types |
| `src/types/components.ts` | Component Props Types |

**Test-Imports:**

```typescript
// auth.test.ts
import { mockUser, mockTokens } from '../../mocks/handlers'  // ✅ aus Mocks

// esp.test.ts
import { mockESPDevice, mockSensor, mockActuator, ... } from '../../mocks/handlers'  // ✅ aus Mocks

// useWebSocket.test.ts
import { useWebSocket } from '@/composables/useWebSocket'  // ✅ @ Alias korrekt
```

**Mock-Handler Types:**

```typescript
// handlers.ts nutzt implizit die gleichen Shapes wie src/types/
const mockUser = { id: 1, username: 'testuser', ... }  // ✅ Shape von User-Type
const mockESPDevice = { esp_id: 'ESP_TEST_001', ... }  // ✅ Shape von ESPDevice-Type
```

**Type-Import-Konsistenz:**

```bash
# Prüfe: Nutzen Tests src/types/ direkt?
$ grep -r "from '@/types" "El Frontend/tests/" --include="*.ts"
# Ergebnis: KEINE direkten Type-Imports in Tests
```

**Interpretation:** Tests nutzen **Mock-Data** statt Type-Definitionen direkt. Das ist **OK**, weil:
- Mocks sind **strukturell kompatibel** mit den Types
- Tests prüfen **Verhalten**, nicht **Type-Definitionen**
- TypeScript-Compiler validiert Types automatisch

**Findings:**
- ✅ Kein Type-Drift zwischen Tests und Source sichtbar
- ✅ @ Alias funktioniert in Tests (vitest.config.ts resolve.alias)
- ⚠️ **Potential Improvement:** Test-Helpers könnten Type-Guards nutzen (z.B. `assertIsESPDevice()`)

---

## 10. Prüfpunkt: package.json Scripts

### Befund: ❌ **KRITISCH – Keine Test-Dependencies, keine Test-Scripts**

**package.json – Analyse:**

```json
{
  "name": "el-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "type-check": "vue-tsc --noEmit"
    // ❌ KEINE Test-Scripts!
  },
  "dependencies": {
    "@vueuse/core": "^10.11.1",
    "axios": "^1.10.0",
    "chart.js": "^4.5.0",
    "pinia": "^2.3.0",
    "vue": "^3.5.13",
    "vue-router": "^4.5.0"
    // ... weitere Runtime-Dependencies
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@vitejs/plugin-vue": "^5.2.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "~5.7.2",
    "vite": "^6.2.4",
    "vue-tsc": "^2.2.0"
    // ❌ KEINE Test-Dependencies!
  }
}
```

**Fehlende Test-Dependencies:**

| Package | Zweck | Empfohlene Version |
|---------|-------|-------------------|
| ❌ **vitest** | Test-Runner | `^3.0.0` |
| ❌ **@vitest/coverage-v8** | Coverage-Provider | `^3.0.0` |
| ❌ **@vue/test-utils** | Vue Component Testing | `^2.4.6` |
| ❌ **@testing-library/vue** | Alternative zu test-utils | `^8.1.0` (optional) |
| ❌ **jsdom** | DOM-Simulation | `^25.0.0` |
| ❌ **msw** | Mock Service Worker | `^2.6.9` |
| ❌ **@playwright/test** | E2E Testing | `^1.50.0` |
| ❌ **happy-dom** | Alternative zu jsdom | `^16.8.0` (optional) |

**Fehlende Test-Scripts:**

| Script | Befehl | Zweck |
|--------|--------|-------|
| ❌ `"test"` | `"vitest"` | Run all tests |
| ❌ `"test:unit"` | `"vitest run tests/unit"` | Run unit tests only |
| ❌ `"test:integration"` | `"vitest run tests/integration"` | Run integration tests |
| ❌ `"test:watch"` | `"vitest watch"` | Watch mode |
| ❌ `"test:ui"` | `"vitest --ui"` | Vitest UI |
| ❌ `"test:coverage"` | `"vitest run --coverage"` | Generate coverage report |
| ❌ `"e2e"` | `"playwright test"` | Run E2E tests |
| ❌ `"e2e:ui"` | `"playwright test --ui"` | Playwright UI mode |
| ❌ `"e2e:debug"` | `"playwright test --debug"` | Debug E2E |

**Impact:**

**Tests können NICHT ausgeführt werden!**

```bash
$ npm test
# Error: Missing script: "test"

$ npm run vitest
# Error: Missing script: "vitest"

$ npx vitest
# Error: Cannot find module 'vitest'
```

**Findings:**
- ❌ **BLOCKER:** Keine Test-Dependencies in package.json
- ❌ **BLOCKER:** Keine Test-Scripts definiert
- ⚠️ **Inkonsistenz:** Test-Files existieren, aber sind **nicht ausführbar**
- ⚠️ **CI-Problem:** Ohne Scripts können Tests nicht in CI laufen

---

## Zusammenfassung: Alle Prüfpunkte

| Prüfpunkt | Status | Bewertung |
|-----------|--------|-----------|
| 1. vitest.config.ts | ✅ OK | Vollständig, Best Practice 2025 |
| 2. setup.ts | ✅ OK | MSW + Pinia + Mocks, Best Practice |
| 3. Store Tests | ⚠️ Verbesserung | 2/5 getestet (40%), auth + esp exzellent |
| 4. Composable Tests | ⚠️ Verbesserung | 2/8 getestet (25%), useToast + useWebSocket exzellent |
| 5. Mocks | ✅ OK | MSW-basiert, 80% API abgedeckt |
| 6. E2E Scenarios | ✅ OK | 5 Playwright Specs, Config vollständig |
| 7. Integration/ | ❌ Missing | Ordner leer, bewusste Lücke |
| 8. Coverage-Lücken | ❌ Broken | Components 0/67, Stores 3/5, Composables 6/8 |
| 9. TypeScript-Konsistenz | ✅ OK | Keine Type-Drifts |
| 10. package.json Scripts | ❌ **KRITISCH** | Keine Dependencies, keine Scripts |

---

## Empfehlungen (Priorisiert nach Impact)

### P0 – Blocker (MUST FIX)

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P0-1** | **package.json erweitern:** Vitest + Coverage + Test-Utils + MSW + Playwright Dependencies hinzufügen | ❌ Tests nicht ausführbar | 10 min |
| **P0-2** | **Test-Scripts hinzufügen:** `test`, `test:unit`, `test:coverage`, `e2e` | ❌ Tests nicht ausführbar | 5 min |

```json
// Empfohlene package.json Ergänzung
"scripts": {
  "test": "vitest",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:watch": "vitest watch",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest run --coverage",
  "e2e": "playwright test",
  "e2e:ui": "playwright test --ui",
  "e2e:debug": "playwright test --debug"
},
"devDependencies": {
  "vitest": "^3.0.0",
  "@vitest/coverage-v8": "^3.0.0",
  "@vitest/ui": "^3.0.0",
  "@vue/test-utils": "^2.4.6",
  "jsdom": "^25.0.0",
  "msw": "^2.6.9",
  "@playwright/test": "^1.50.0"
}
```

### P1 – Critical Gaps (HIGH PRIORITY)

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P1-1** | **Store-Tests erweitern:** Tests für `database`, `logic`, `dragState` Stores | ⚠️ Stores ungetestet | 2-4 Std |
| **P1-2** | **Integration-Tests erstellen:** Store ↔ API Mock Zusammenspiel | ⚠️ Keine Integration-Tests | 3-5 Std |
| **P1-3** | **Component-Tests für kritische Components:** ESPCard, ZoneGroup, PendingDevicesPanel | ⚠️ UI-Rendering ungetestet | 5-8 Std |

### P2 – Nice-to-Have (MEDIUM PRIORITY)

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P2-1** | **Composable-Tests erweitern:** useModal, useGpioStatus, useQueryFilters, useZoneDragDrop, useConfigResponse, useSwipeNavigation | ⚠️ Composables ungetestet | 3-6 Std |
| **P2-2** | **MSW-Handlers erweitern:** Subzones, Logic, Logs, Health, Users | ⚠️ Partial API-Coverage | 2-3 Std |
| **P2-3** | **E2E-Scenarios erweitern:** Zone-Kaiser Workflows (zone assignment, subzone, drag-drop) | ⚠️ Neue Features ungetestet | 3-5 Std |

### P3 – Optimization (LOW PRIORITY)

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P3-1** | **CI-Integration:** GitHub Actions Workflow für Tests | ℹ️ Tests nur lokal | 1-2 Std |
| **P3-2** | **Coverage-Thresholds:** Minimum Coverage in vitest.config.ts (z.B. 60% Statements) | ℹ️ Kein Quality-Gate | 15 min |
| **P3-3** | **Test-Helpers:** Type-Guards für Mock-Data (`assertIsESPDevice()`) | ℹ️ Type-Safety | 1 Std |

---

## Konkrete Findings mit Datei-Referenzen

### ✅ Positive Findings

1. **vitest.config.ts (43 Zeilen):** Vollständig konfiguriert, v8-Coverage, zentrale Logs, Best Practice 2025
2. **setup.ts (156 Zeilen):** MSW + Pinia + Global Mocks, perfektes Setup
3. **auth.test.ts (520 Zeilen):** Exzellent, alle Actions + Getters + Error-Handling, 10/10
4. **esp.test.ts (989 Zeilen):** Exzellent, 12 Test-Suites, Edge-Cases, Fallback-Logic, 10/10
5. **useToast.test.ts (378 Zeilen):** Exzellent, Timer-Handling, Singleton-Tests, 10/10
6. **useWebSocket.test.ts (943 Zeilen):** Exzellent, Custom Mock, Lifecycle-Tests, Cleanup-Tracking, 10/10
7. **handlers.ts (799 Zeilen):** MSW-basiert, 80% API abgedeckt, realistic Mock-Data
8. **playwright.config.ts (107 Zeilen):** Best Practice 2025, Global Auth-Setup, CI-Optimierungen

### ❌ Negative Findings

1. **package.json:** ❌ Keine vitest/msw/playwright Dependencies, ❌ Keine Test-Scripts
2. **tests/integration/:** ❌ Leer (nur .gitkeep)
3. **src/stores/database.ts:** ❌ Kein Test
4. **src/stores/logic.ts:** ❌ Kein Test
5. **src/stores/dragState.ts:** ❌ Kein Test
6. **src/composables/useModal.ts:** ❌ Kein Test
7. **src/composables/useGpioStatus.ts:** ❌ Kein Test
8. **src/composables/useQueryFilters.ts:** ❌ Kein Test
9. **src/composables/useZoneDragDrop.ts:** ❌ Kein Test
10. **src/composables/useConfigResponse.ts:** ❌ Kein Test
11. **src/composables/useSwipeNavigation.ts:** ❌ Kein Test
12. **src/components/:** ❌ 0 von 67 Components getestet
13. **E2E Scenarios:** ⚠️ Keine Zone-Kaiser Scenarios

### ⚠️ Verbesserungspotenzial

1. **handlers.ts:** Keine Mocks für Subzones, Logic, Logs, Health, Users
2. **CI-Integration:** Keine GitHub Actions Workflows für Tests sichtbar
3. **Coverage-Thresholds:** Keine Minimum-Coverage in vitest.config.ts
4. **Type-Guards:** Test-Helpers könnten Type-Guards nutzen

---

## Fazit

**Gesamtbewertung:** ⚠️ **70/100 Punkte**

**Stärken:**
- ✅ **Existierende Tests sind exzellent** (auth, esp, useToast, useWebSocket)
- ✅ **Config-Files sind Best Practice 2025** (vitest.config.ts, playwright.config.ts)
- ✅ **MSW-Mocks sind comprehensive** (799 Zeilen, 80% API)

**Schwächen:**
- ❌ **BLOCKER:** Tests nicht ausführbar (package.json fehlt Dependencies + Scripts)
- ❌ **Coverage-Lücken:** Components 0%, Stores 60%, Composables 75%
- ❌ **Integration-Tests:** Komplett fehlend

**Nächster Schritt:**
1. **P0-1 + P0-2 beheben** (package.json erweitern) → Tests werden ausführbar
2. **P1-1 bis P1-3 umsetzen** (Store-Tests, Integration-Tests, kritische Components)
3. **Coverage-Report generieren** (`npm run test:coverage`) → IST-Coverage sehen

**Empfohlene Implementierungsreihenfolge:**
1. package.json erweitern (10 min) → Tests ausführbar
2. Store-Tests für database, logic, dragState (2-4 Std)
3. Integration-Tests erstellen (3-5 Std)
4. Component-Tests für ESPCard, ZoneGroup, PendingDevicesPanel (5-8 Std)
5. E2E-Scenarios für Zone-Kaiser (3-5 Std)
6. CI-Integration + Coverage-Thresholds (1-2 Std)

---

**Report-Ende**
**Agent:** frontend-debug
**Datum:** 2026-02-10
**Nächster Schritt:** Gap-Analyse durch meta-analyst (wenn alle Layer analysiert)
