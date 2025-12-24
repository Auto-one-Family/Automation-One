# Frontend UI Documentation

**Erstellt:** 2025-12-19
**Letztes Update:** 2025-12-23 (Vollständige Synchronisation mit Code)
**Projekt:** Auto-one El Frontend (Vue3 + TypeScript + Vite)

---

## Übersicht

Diese Dokumentation bietet eine vollständige Analyse aller Frontend-Views, API-Integrationen und Komponenten des Auto-one Frontend-Projekts.

**Frontend-Pfad:** `El Frontend/`
**Backend-Pfad:** `El Servador/god_kaiser_server/`

### Dokumentations-Dateien

| Datei | Zweck | Wann verwenden? |
|-------|-------|-----------------|
| **[VIEW_ANALYSIS.md](VIEW_ANALYSIS.md)** | 📘 Vollständige View-Analyse (32KB) | Detaillierte Informationen zu jedem View, API-Calls, Komponenten, Stores |
| **[VIEW_QUICK_REFERENCE.md](VIEW_QUICK_REFERENCE.md)** | 🚀 Schnellreferenz (10KB) | Übersichtstabellen, Feature-Status, Komponenten-Matrix |
| **[API_PAYLOAD_EXAMPLES.md](API_PAYLOAD_EXAMPLES.md)** | 📦 API-Payload-Beispiele (20KB) | Request/Response-Beispiele für alle API-Endpoints |

---

## Quick Links

### Für Entwickler

**Neue View hinzufügen:**
1. View-Datei erstellen: `El Frontend/src/views/MyNewView.vue`
2. Route hinzufügen: `El Frontend/src/router/index.ts`
3. Navigation-Link hinzufügen: `El Frontend/src/components/layout/MainLayout.vue`
4. Auth-Guard konfigurieren (falls nötig): `requiresAuth`, `requiresAdmin`
5. Dokumentation aktualisieren: Diese Dateien

**API-Integration hinzufügen:**
1. API-Modul erstellen: `El Frontend/src/api/myApi.ts`
2. Types definieren: `El Frontend/src/types/index.ts`
3. Store erstellen (optional): `El Frontend/src/stores/myStore.ts`
4. Payload-Beispiele dokumentieren: `API_PAYLOAD_EXAMPLES.md`

**Komponente hinzufügen:**
1. Komponente erstellen: `El Frontend/src/components/[category]/MyComponent.vue`
2. Props-Interface definieren (TypeScript)
3. Index-Export hinzufügen: `El Frontend/src/components/[category]/index.ts`
4. Komponente in `VIEW_QUICK_REFERENCE.md` dokumentieren

### Für Tester

**Kritische User-Flows (siehe VIEW_ANALYSIS.md Section 10.1):**
- Mock-ESP erstellen & Sensor hinzufügen
- Database-Explorer Workflow
- Log-Viewer Real-time
- User-Management CRUD
- WebSocket-Integration

**Edge-Cases (siehe VIEW_ANALYSIS.md Section 10.2):**
- ESP mit 0 Sensoren/Aktoren
- WebSocket Connection-Loss
- Database NULL-Werte
- Pagination Edge-Cases

### Für Admins

**Admin-Only Views (siehe VIEW_QUICK_REFERENCE.md):**
- `/mock-esp` - Mock-ESP-Verwaltung
- `/database` - Database-Explorer
- `/logs` - Log-Viewer
- `/users` - Benutzerverwaltung
- `/load-test` - Load-Testing
- `/system-config` - System-Konfiguration

**Public Views (Auth-required):**
- `/` - Dashboard
- `/sensors` - Sensor-Übersicht
- `/actuators` - Aktor-Übersicht
- `/mqtt-log` - MQTT-Nachrichten
- `/audit` - Audit-Log
- `/settings` - Einstellungen

---

## Statistiken

### Views

- **Total:** 18 Views (inkl. 2 Legacy-Redirects)
- **Implementiert:** 17 Views (94.4%)
- **Placeholder:** 1 View (LogicView - 5.6%)

### API-Endpoints

- **Debug-APIs:** 26 Endpoints (Admin-only)
- **Public-APIs:** 12 Endpoints
- **WebSocket:** 1 Endpoint
- **Auth:** 3 Endpoints
- **Total:** 42+ Endpoints

### Komponenten

- **Common:** 11 Komponenten (Badge, Button, Card, EmptyState, ErrorState, Input, LoadingState, Modal, Select, Spinner, Toggle)
- **Layout:** 3 Komponenten (MainLayout, AppHeader, AppSidebar)
- **ESP:** 6 Komponenten (ESPCard, ESPOrbitalLayout, SensorSatellite, ActuatorSatellite, SensorValueCard, ConnectionLines)
- **Dashboard:** 1 Komponente (StatCard)
- **Database:** 6 Komponenten (DataTable, FilterPanel, Pagination, RecordDetailModal, SchemaInfoPanel, TableSelector)
- **Zones:** 1 Komponente (ZoneAssignmentPanel)
- **Total:** 27 Komponenten

### Stores

- **authStore** - Authentication & User-Management
- **espStore** - Unified ESP CRUD (Mock + Real) & State-Management
- **databaseStore** - Database-Explorer State

---

## Feature-Status

| Feature | Status | View | Dokumentation |
|---------|--------|------|---------------|
| Mock-ESP CRUD | ✅ Done | MockEspView, MockEspDetailView | VIEW_ANALYSIS.md Section 2.1, 2.2 |
| Sensor-Management | ✅ Done | MockEspDetailView | VIEW_ANALYSIS.md Section 2.2 |
| Actuator-Management | ✅ Done | MockEspDetailView | VIEW_ANALYSIS.md Section 2.2 |
| Zone-Assignment | ✅ Done | MockEspDetailView | VIEW_ANALYSIS.md Section 2.2 |
| WebSocket Real-time | ✅ Done | MqttLogView | VIEW_ANALYSIS.md Section 2.4, Section 6 |
| Database-Explorer | ✅ Done | DatabaseExplorerView | VIEW_ANALYSIS.md Section 2.5 |
| Log-Viewer | ✅ Done | LogViewerView | VIEW_ANALYSIS.md Section 2.6 |
| User-Management | ✅ Done | UserManagementView | VIEW_ANALYSIS.md Section 2.7 |
| Load-Testing | ✅ Done | LoadTestView | VIEW_ANALYSIS.md Section 2.8 |
| System-Config | ✅ Done | SystemConfigView | VIEW_ANALYSIS.md Section 2.9 |
| Audit-Log | ✅ Done | AuditLogView | VIEW_ANALYSIS.md Section 2.10 |
| **Logic-Engine** | ⚠️ **Placeholder** | LogicView | VIEW_ANALYSIS.md Section 2.3 |
| Auth-System | ✅ Done | LoginView, SetupView | VIEW_ANALYSIS.md Section 11 |

---

## Architektur-Übersicht

```
El Frontend/
├── src/
│   ├── views/                    # 18 Views (17 implementiert, 1 Placeholder)
│   │   ├── DashboardView.vue
│   │   ├── DevicesView.vue       # ✅ Unified ESP-Liste (Mock+Real)
│   │   ├── DeviceDetailView.vue  # ✅ Unified ESP-Details
│   │   ├── SensorsView.vue
│   │   ├── ActuatorsView.vue
│   │   ├── LogicView.vue         # ⚠️ Placeholder
│   │   ├── MqttLogView.vue
│   │   ├── DatabaseExplorerView.vue
│   │   ├── LogViewerView.vue
│   │   ├── UserManagementView.vue
│   │   ├── LoadTestView.vue
│   │   ├── SystemConfigView.vue
│   │   ├── AuditLogView.vue
│   │   ├── SettingsView.vue
│   │   ├── LoginView.vue
│   │   ├── SetupView.vue
│   │   ├── MockEspView.vue       # → Redirect zu /devices
│   │   └── MockEspDetailView.vue # → Redirect zu /devices/:espId
│   ├── components/               # 27 Wiederverwendbare Komponenten
│   │   ├── common/               # 11 Basis-Komponenten
│   │   ├── layout/               # 3 Layout-Komponenten
│   │   ├── esp/                  # 6 ESP-Komponenten
│   │   ├── dashboard/            # 1 Dashboard-Komponente
│   │   ├── database/             # 6 Database-Komponenten
│   │   └── zones/                # 1 Zone-Komponente
│   ├── api/                      # 13 API-Module
│   │   ├── index.ts              # Axios-Instance + Interceptors
│   │   ├── auth.ts
│   │   ├── debug.ts              # Mock-ESP-APIs
│   │   ├── esp.ts                # Real-ESP-APIs
│   │   ├── database.ts
│   │   ├── logs.ts
│   │   ├── users.ts
│   │   ├── loadtest.ts
│   │   ├── config.ts
│   │   ├── audit.ts
│   │   ├── sensors.ts
│   │   ├── actuators.ts
│   │   ├── zones.ts
│   │   └── subzones.ts
│   ├── stores/                   # 3 Pinia-Stores
│   │   ├── auth.ts
│   │   ├── esp.ts                # Unified Store (Mock + Real)
│   │   └── database.ts
│   ├── utils/                    # Helper-Funktionen
│   │   ├── sensorDefaults.ts     # Sensor-Type-Config
│   │   ├── labels.ts             # Label-Mappings
│   │   └── formatters.ts         # Value-Formatierung
│   ├── types/
│   │   └── index.ts              # 50+ TypeScript-Interfaces
│   └── router/
│       └── index.ts              # Router + Auth-Guards
└── Docs/
    └── UI/                       # ⭐ Diese Dokumentation
        ├── README.md             # Diese Datei
        ├── VIEW_ANALYSIS.md      # Vollständige Analyse
        ├── VIEW_QUICK_REFERENCE.md  # Schnellreferenz
        └── API_PAYLOAD_EXAMPLES.md  # Request/Response-Beispiele
```

---

## API-Architektur

### Base-URL

```bash
# Development
VITE_API_BASE=/api/v1
VITE_API_HOST=localhost:8000

# Production
VITE_API_BASE=/api/v1
VITE_API_HOST=auto-one.prod.local:8000
```

### Axios-Interceptors

**Request-Interceptor:**
- Fügt `Authorization: Bearer ${token}` Header hinzu
- Verwendet `authStore.accessToken`

**Response-Interceptor:**
- Bei 401 (Unauthorized) → Token-Refresh via `authStore.refreshTokens()`
- Retry original Request
- Bei Refresh-Fehler → Logout & Redirect zu `/login`

### WebSocket-URL

```bash
ws://${apiHost}/api/v1/ws/realtime/${clientId}?token=${accessToken}
```

**Client-ID-Format:** `frontend_${Date.now()}`

**Reconnect-Logic:**
- Auto-Reconnect nach 3000ms
- Token-Refresh vor Reconnect
- Error-Handling via Console-Logging

---

## Router-Guards

### Navigation-Guard-Flow

```typescript
router.beforeEach(async (to, from, next) => {
  // 1. Setup-Check
  if (authStore.setupRequired && to.name !== 'setup') {
    return next({ name: 'setup' })
  }

  // 2. Auth-Check
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // 3. Admin-Check
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return next({ name: 'dashboard' })
  }

  // 4. Redirect authenticated users
  if (authStore.isAuthenticated && (to.name === 'login' || to.name === 'setup')) {
    return next({ name: 'dashboard' })
  }

  next()
})
```

### Route-Meta-Felder

```typescript
{
  requiresAuth: boolean,   // Login erforderlich
  requiresAdmin: boolean    // Admin-Rolle erforderlich
}
```

---

## Type-System

### Wichtigste Interfaces

**MockESP:**
- `MockESP` - Vollständiges ESP-Objekt (Server-Response)
- `MockESPCreate` - Payload für ESP-Erstellung
- `MockSensor` - Sensor-Konfiguration + Daten
- `MockActuator` - Aktor-Konfiguration + State

**System-States:**
- `INITIALIZING` - ESP startet
- `OPERATIONAL` - Normal-Betrieb (Grün)
- `SAFE_MODE` - Sicherheitsmodus (Gelb)
- `ERROR` - Fehlerzustand (Rot)
- `EMERGENCY_STOP` - Notfall-Stopp (Rot)
- `OFFLINE` - Nicht verbunden (Grau)

**Quality-Levels:**
- `excellent` - Exzellent (Grün)
- `good` - Gut (Grün)
- `fair` - Ausreichend (Gelb)
- `poor` - Schlecht (Gelb)
- `bad` - Sehr schlecht (Rot)
- `stale` - Veraltet (Grau)

**WebSocket-Message-Types:**
- `sensor_data` - Sensor-Messwerte
- `actuator_status` - Aktor-Statusänderungen
- `logic_execution` - Logic-Engine-Events
- `esp_health` - Heartbeat/Diagnostics
- `system_event` - Server-Events

**Vollständige Type-Definitionen:** Siehe `VIEW_ANALYSIS.md` Section 9

---

## Testing-Guide

### Unit-Tests

**Empfohlene Test-Frameworks:**
- Vitest (Vue3-optimiert)
- @vue/test-utils (Component-Testing)
- MSW (Mock Service Worker für API-Mocking)

**Test-Struktur:**
```bash
El Frontend/tests/
├── unit/
│   ├── components/
│   │   ├── common/
│   │   ├── esp/
│   │   └── database/
│   ├── stores/
│   │   ├── auth.spec.ts
│   │   ├── mockEsp.spec.ts
│   │   └── database.spec.ts
│   └── utils/
│       ├── sensorDefaults.spec.ts
│       ├── labels.spec.ts
│       └── formatters.spec.ts
└── e2e/
    ├── mock-esp-flow.spec.ts
    ├── database-explorer.spec.ts
    └── log-viewer.spec.ts
```

### E2E-Tests (Cypress/Playwright)

**Kritische Flows:**
1. Mock-ESP erstellen & Sensor hinzufügen
2. Database-Explorer Navigation & Filter
3. Log-Viewer Real-time-Modus
4. User-Management CRUD
5. WebSocket Connection & Reconnect

**Test-Beispiel (Cypress):**
```typescript
describe('Mock-ESP CRUD Flow', () => {
  it('should create ESP, add sensor, and publish value', () => {
    cy.login('admin', 'password')
    cy.visit('/mock-esp')
    cy.get('[data-test="create-esp-btn"]').click()
    cy.get('[data-test="esp-id-input"]').type('ESP_TEST_123')
    cy.get('[data-test="submit-btn"]').click()
    cy.contains('ESP_TEST_123').click()
    cy.get('[data-test="add-sensor-btn"]').click()
    cy.get('[data-test="sensor-type-select"]').select('DS18B20')
    cy.get('[data-test="submit-btn"]').click()
    cy.contains('DS18B20').should('be.visible')
  })
})
```

---

## Performance-Optimierung

### Lazy-Loading

**Alle Views werden lazy-loaded:**
```typescript
{
  path: '/mock-esp',
  component: () => import('@/views/MockEspView.vue')
}
```

**Vorteile:**
- Initial-Bundle: ~150KB (gzip)
- Code-Splitting: Automatisch
- FCP (First Contentful Paint): < 1s

### WebSocket-Message-Limit

**MqttLogView:**
- Max Messages: 500
- Auto-Truncate bei Overflow
- Verhindert Memory-Leaks

### Pagination

**DatabaseExplorerView:**
- Page-Sizes: 50, 100, 200
- Server-seitige Pagination
- Lazy-Loading (optional)

---

## Security-Considerations

### Token-Storage

**Aktuell:** LocalStorage
```typescript
localStorage.setItem('access_token', token)
localStorage.setItem('refresh_token', token)
```

**Risiko:** XSS-Attacken können Tokens stehlen

**Alternative (empfohlen):** httpOnly Cookies (Server-seitig)

### Admin-Routes

**Client-seitig:**
```typescript
if (to.meta.requiresAdmin && !authStore.isAdmin) {
  return next({ name: 'dashboard' })
}
```

**Server-seitig (CRITICAL):**
```python
@router.get("/debug/mock-esp")
async def list_mock_esps(current_user: User = Depends(require_admin)):
    ...
```

**Wichtig:** Client-seitige Guards sind NUR UI-Schutz!
Server MUSS immer validieren!

### Secret-Handling

**SystemConfigView:**
- `is_secret: true` → Value wird maskiert (******)
- Keine Secrets im Frontend-Log
- Keine Secrets in WebSocket-Messages

---

## Deployment

### Build-Command

```bash
npm run build
```

**Output:** `El Frontend/dist/`

### Environment-Variablen

**Production `.env`:**
```bash
VITE_API_BASE=/api/v1
VITE_API_HOST=auto-one.prod.local:8000
NODE_ENV=production
```

### Nginx-Config

**Siehe:** `VIEW_ANALYSIS.md` Section 13.3

**Wichtige Punkte:**
- SPA-Routing: `try_files $uri $uri/ /index.html`
- API-Proxy: `proxy_pass http://localhost:8000`
- WebSocket-Proxy: `proxy_http_version 1.1` + `Upgrade: websocket`

---

## Änderungshistorie

| Datum | Version | Änderungen | Autor |
|-------|---------|------------|-------|
| 2025-12-19 | 1.0 | Initial-Dokumentation erstellt | Claude Sonnet 4.5 |
| 2025-12-20 | 1.1 | WebSocket-Integration verifiziert | Claude Sonnet 4.5 |
| 2025-12-23 | 2.0 | Vollständige Synchronisation mit Code: 18 Views, 27 Komponenten, Unified ESP-Store | Claude Opus 4.5 |

---

## Kontakt & Support

**Bei Fragen oder Problemen:**
1. Lesen Sie die relevante Sektion in `VIEW_ANALYSIS.md`
2. Prüfen Sie `API_PAYLOAD_EXAMPLES.md` für Request/Response-Formate
3. Konsultieren Sie `VIEW_QUICK_REFERENCE.md` für schnelle Übersichten

**Weitere Ressourcen:**
- `.claude/CLAUDE_FRONTEND.md` - Frontend-spezifische KI-Dokumentation
- `El Frontend/Docs/APIs.md` - API-Übersicht
- `El Frontend/Docs/Bugs_Found.md` - Bekannte Bugs & Fixes

---

**Ende README**
