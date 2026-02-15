# Frontend Logging Assessment - Erstanalyse
**Datum:** 2026-02-09
**Auftrag:** 4.2 Frontend Logging Assessment
**Agent:** frontend-debug + server-debug + manuelle Analyse
**Status:** Abgeschlossen

---

## 1. Console-Call-Inventar (korrigierte Zahlen)

### Gesamtübersicht

| Level | Calls | Dateien | Anteil |
|-------|-------|---------|--------|
| console.error | 85 | 24 | 35% |
| console.log | 67* | 16 | 27% |
| console.warn | 35 | 10 | 14% |
| console.debug | 30 | 8 | 12% |
| console.info | 24 | 4 | 10% |
| **Gesamt** | **241** | **33** | 100% |

> *Korrektur: TM-Schätzung war "68 Calls in 34 Dateien" - das war nur console.log. Tatsächlich: **241 Calls in 33 Dateien**. 4 console.log in `api/sensors.ts` sind JSDoc-Kommentare (nicht ausführbar).*

### Top-10 Dateien nach Call-Anzahl

| Datei | log | error | warn | debug | info | **Total** |
|-------|-----|-------|------|-------|------|-----------|
| stores/esp.ts | 9 | 8 | 15 | 11 | 9 | **52** |
| services/websocket.ts | 14 | 9 | 2 | 3 | 0 | **28** |
| views/SystemMonitorView.vue | 12 | 4 | 4 | 0 | 0 | **20** |
| api/esp.ts | 5 | 0 | 5 | 3 | 4 | **17** |
| views/DashboardView.vue | 1 | 3 | 3 | 0 | 9 | **16** |
| components/esp/ESPOrbitalLayout.vue | 5 | 7 | 0 | 3 | 0 | **15** |
| components/system-monitor/CleanupPanel.vue | 0 | 12 | 0 | 0 | 0 | **12** |
| stores/logic.ts | 0 | 4 | 0 | 4 | 2 | **10** |
| composables/useZoneDragDrop.ts | 1 | 4 | 0 | 3 | 0 | **8** |
| components/system-monitor/DatabaseTab.vue | 0 | 7 | 0 | 0 | 0 | **7** |

### Kategorisierung nach Zweck

#### A. API-Error-Handling (ca. 55 Calls)
Größte Kategorie. Pattern: try/catch um API-Calls mit `console.error('[Component]', err)`.
- **CleanupPanel**: 12x console.error - jede Operation hat eigenen try/catch
- **DatabaseTab**: 7x console.error - CRUD-Operationen
- **ESPOrbitalLayout**: 7x console.error - Sensor/Actuator-Operationen
- **ESPSettingsPopover**: 4x console.error - Device-Steuerung
- **ServerLogsTab, LogManagementPanel, MqttTrafficTab**: je 2-3x console.error

#### B. WebSocket-Lifecycle (ca. 30 Calls)
Zweitgrößte Kategorie. Alle in `services/websocket.ts`:
- 14x console.log: Verbindungsstatus, Reconnect, Visibility
- 9x console.error: Verbindungsfehler, Parse-Fehler, Callback-Fehler
- 3x console.debug: Status-Checks
- 2x console.warn: Rate-Limit, Queue-Overflow

#### C. ESP Store State-Management (ca. 52 Calls)
Die größte Einzeldatei. Kategorien:
- **WebSocket-Handler** (~25 Calls): esp_health, config_response, zone_assignment, device_discovered/approved/rejected, sensor_health, actuator_alert
- **CRUD-Operationen** (~15 Calls): fetchAll, updateDevice, updateDeviceZone
- **Debug/Trace** (~12 Calls): console.debug für Store-State-Änderungen

#### D. Styled Debug-Helpers (12 Calls)
Pattern mit `%c` CSS-Styling für farbige DevTools-Ausgabe:
```javascript
console.log(`%c[ComponentName]%c ${message}`, style, 'color: #5eead4;', data)
```
Betrifft: MultiSensorChart, ZoneGroup, SensorSatellite, DragState, AnalysisDropZone, ESPOrbitalLayout

#### E. Temporary DEBUG Logs (6 Calls)
Explizit als `[DEBUG]` markiert in SystemMonitorView.vue (Zeilen 917-989):
```javascript
console.log('[DEBUG] loadHistoricalEvents called with...')
console.log('[DEBUG] API response:', {...})
console.log('[DEBUG] Sensor Events in Response:', {...})
```
→ **Sollten entfernt werden** - sind Debug-Artefakte aus der Entwicklung.

#### F. Informational Logging (ca. 24 Calls)
`console.info` nur in 4 Dateien:
- DashboardView (9x): Device-Operationen (delete, heartbeat, safe-mode, settings)
- esp.ts Store (9x): Zone-Zuweisung, Device-Discovery, Config-Status
- api/esp.ts (4x): Mock-ESP-Management
- stores/logic.ts (2x): Rule-Toggle, Rule-Test

### Pattern-Analyse

**Gut:**
- Konsistentes `[ComponentName]` Prefix-Pattern in 90% der Calls
- Fehler werden nie verschluckt - jeder catch-Block hat console.error
- API-Client hat zentrale Request/Response-Logging via Interceptors

**Problematisch:**
- Kein Level-Gate: ALLE Logs erscheinen in Production (kein `if (dev)` Check)
- Console.log für Info-Zwecke (statt console.info) in WebSocket-Service
- 6 explizite `[DEBUG]` Calls die nie entfernt wurden
- Styled `%c` Logging ist in Docker-Logs nicht nützlich (CSS wird als Text geloggt)
- Keine Strukturierung: Output ist Plaintext, nicht JSON (außer main.ts Handlers)

---

## 2. Error-Handling-Analyse

### Globale Error-Handler (main.ts)

**Vorhanden und strukturiert!** Besser als erwartet.

```typescript
// Vue Error Handler - Zeile 15
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    component: instance?.$options?.name || 'Unknown',
    info,
    timestamp: new Date().toISOString()
  })
}

// Vue Warning Handler - Zeile 25
app.config.warnHandler = (msg, instance, trace) => {
  console.warn('[Vue Warning]', {
    message: msg,
    component: instance?.$options?.name || 'Unknown',
    trace,
    timestamp: new Date().toISOString()
  })
}

// Unhandled Promise Rejection - Zeile 35
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
    timestamp: new Date().toISOString()
  })
})
```

**Bewertung:**
- ✅ Structured JSON Output mit Timestamp, Component, Stack
- ✅ Fängt Vue-Errors, Vue-Warnings, Unhandled Rejections
- ❌ Kein `window.onerror` Handler (JavaScript Runtime-Errors außerhalb von Promises/Vue)
- ❌ Keine Error-Aggregation oder -Zählung
- ❌ Kein User-Feedback (kein Toast/Modal bei Fehlern)
- ❌ Keine Error-Forwarding an Server

### API Error-Handling (api/index.ts)

```typescript
// Request Interceptor: Logging jedes Requests
console.debug('[API]', config.method?.toUpperCase(), config.url)

// Response Interceptor: Logging jeder Response
console.debug('[API]', method, url, '→', response.status)

// Error Interceptor: 401 → Token Refresh → Retry
// Bei finalem Fehler:
console.error('[API]', method, url, '→', status || 'NETWORK_ERROR', error.message)
```

**Error-Propagation-Kette:**
```
API-Call → Axios Interceptor (401 → Refresh → Retry) → Promise.reject(error)
  → Store-Action catch-Block → console.error + Toast.error
  → Component catch-Block → console.error + UI-State-Update
```

**Bewertung:**
- ✅ Zentraler Interceptor mit Token-Refresh-Logic
- ✅ Fehler werden sauber propagiert (nicht verschluckt)
- ✅ Toast-Feedback für User bei den meisten Fehlern
- ❌ Kein Error-Code-Tracking (HTTP-Status wird geloggt, aber nicht kategorisiert)
- ❌ Kein Retry-Mechanismus außer 401-Token-Refresh

### Komponentenebene

**Pattern in 24 Dateien:**
```typescript
try {
  const result = await apiCall()
  // success handling
} catch (err) {
  console.error('[ComponentName] Operation failed:', err)
  toast.error('User-friendly message')
}
```

**Bewertung:**
- ✅ Konsistentes try/catch-Pattern
- ✅ Toast-Feedback für User in den meisten Fällen
- ❌ Kein Error-Boundary-Component (Vue ErrorBoundary)
- ❌ Keine Error-Recovery (Seite muss manuell refreshed werden)

---

## 3. Aktuelle Logging-Infrastruktur

### Was existiert

| Element | Status | Details |
|---------|--------|---------|
| Globale Error-Handler | ✅ Vorhanden | Structured JSON, Vue + Promise |
| API Interceptor-Logging | ✅ Vorhanden | Request/Response/Error Trace |
| Component-Prefix-Pattern | ✅ Konsistent | `[ComponentName]` in 90% der Calls |
| Zentraler Logger | ❌ Fehlt | Kein Logger-Modul, kein Log-Level-Gate |
| Conditional Logging (Dev/Prod) | ❌ Fehlt | Alle Logs in allen Environments |
| Console-Stripping im Build | ❌ Nicht konfiguriert | vite.config.ts hat kein `esbuild.drop` |
| `VITE_LOG_LEVEL` Env-Var | ⚠️ Definiert, nicht genutzt | docker-compose.yml Zeile 133 |
| Docker Log-Capture | ✅ Funktioniert | json-file Driver → Promtail → Loki |
| Promtail Frontend-Scrape | ✅ Funktioniert | Alle Container werden gescraped |
| Grafana Frontend-Panel | ✅ Vorhanden | `count_over_time({compose_service="el-frontend"}[1m])` |

### Was fehlt

1. **Log-Level-Gate**: Alle 241 Calls gehen immer in Production durch
2. **Structured Output**: Nur main.ts globale Handler loggen JSON - der Rest ist Plaintext
3. **Context-Enrichment**: Kein Request-ID, kein Session-ID, kein User-ID in Logs
4. **Error-Aggregation**: Keine Zählung/Rate von Fehlern
5. **Loki-Label-Parsing**: Promtail hat keine Pipeline-Stages für Frontend-Logs (nur Server health-drop)

---

## 4. Server-seitige Infrastruktur

### Debug/Log-Endpoints

| Endpoint | Methode | Funktion |
|----------|---------|----------|
| `/api/v1/debug/logs/files` | GET | Server-Logdateien auflisten |
| `/api/v1/debug/logs/statistics` | GET | Log-Statistiken |
| `/api/v1/debug/logs/cleanup` | POST | Logs aufräumen |
| `/api/v1/debug/logs/{filename}` | DELETE | Log-Datei löschen |
| `/api/v1/debug/logs/backup/{id}` | GET | Backup herunterladen |

**→ Alle Endpoints sind für SERVER-Logs. Kein Endpoint für Frontend-Log-Ingestion.**

### CORS-Konfiguration

```python
# core/config.py:117-120
class CORSSettings(BaseSettings):
    allowed_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        alias="CORS_ALLOWED_ORIGINS",
    )
```

**→ Loki (Port 3100) ist NICHT in den CORS Origins. Frontend kann NICHT direkt an Loki pushen.**

### Server-Logging

- Structured JSON logging über Python `logging` Module
- stdout → Docker json-file Driver → Promtail → Loki
- LoggingSettings in `core/config.py`
- Server hat bewährten Logging-Stack der als Vorbild dienen kann

---

## 5. Logger-Bibliotheken-Bewertung

### Option A: `loglevel` (Empfohlen)

| Kriterium | Bewertung |
|-----------|-----------|
| Bundle-Size | ~1.1 KB (min+gzip) |
| Tree-Shaking | Ja |
| Browser-Support | Alle modernen + IE11 |
| API | `log.trace/debug/info/warn/error` + `log.setLevel()` |
| Plugins | `loglevel-plugin-prefix` für Prefixing |
| Maintenance | Aktiv, 2.8M wöchentliche Downloads |

**Vorteile:**
- Minimaler Footprint, drop-in Replacement für console.*
- `VITE_LOG_LEVEL` kann direkt als Level-Gate genutzt werden
- Prefix-Plugin ermöglicht `[ComponentName]`-Pattern beizubehalten
- Custom Plugin für JSON-Formatting möglich

### Option B: `pino` (Browser-Version)

| Kriterium | Bewertung |
|-----------|-----------|
| Bundle-Size | ~5 KB (min+gzip) |
| Tree-Shaking | Ja |
| API | `logger.info/warn/error` + child loggers |
| Structured | Nativ JSON-Output |

**Vorteile:** Konsistenz mit Server-Logging falls pino dort genutzt wird
**Nachteile:** 5x größer als loglevel, Server nutzt Python logging (nicht pino)

### Option C: Custom Logger (~50 LOC)

```typescript
// Konzept-Skizze
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const
const currentLevel = LOG_LEVELS[import.meta.env.VITE_LOG_LEVEL || 'info']

export function createLogger(component: string) {
  return {
    debug: (...args) => currentLevel <= 0 && console.debug(`[${component}]`, ...args),
    info:  (...args) => currentLevel <= 1 && console.info(`[${component}]`, ...args),
    warn:  (...args) => currentLevel <= 2 && console.warn(`[${component}]`, ...args),
    error: (...args) => console.error(`[${component}]`, ...args),
  }
}
```

**Vorteile:** Zero dependencies, volle Kontrolle, exact-fit
**Nachteile:** Kein Plugin-Ecosystem, muss selbst maintained werden

### Empfehlung: Option C (Custom Logger) → dann Option A bei Bedarf

**Begründung:**
- Das bestehende `[ComponentName]` Pattern ist bereits konsistent
- Ein Custom Logger mit ~50 LOC deckt die Kern-Anforderungen ab
- Nutzt `VITE_LOG_LEVEL` das bereits in docker-compose definiert ist
- Keine neue Dependency im Bundle
- Kann später zu `loglevel` migriert werden wenn Plugins gebraucht werden

---

## 6. Loki-Push-Strategie

### IST-Zustand: Logs fließen bereits nach Loki!

```
Frontend console.* → Docker stdout → json-file Driver → Promtail → Loki
```

**Aber:** Die Logs sind unstrukturiert (Plaintext), haben keine Log-Level-Labels, und werden als einziger Stream `{compose_service="el-frontend"}` gesammelt.

### Strategie: 3-Phasen-Migration

#### Phase 1: Structured Console Output (Low-Effort, High-Impact)

**Aufwand:** ~4h | **Impact:** Sofort in Loki sichtbar

Alle console.*-Calls durch den Custom Logger ersetzen, der JSON ausgibt:
```json
{"level":"error","component":"CleanupPanel","message":"Failed to load statistics","timestamp":"2026-02-09T14:30:00.000Z","error":"NetworkError"}
```

Promtail Pipeline-Stage für Frontend-Container ergänzen:
```yaml
- match:
    selector: '{compose_service="el-frontend"}'
    stages:
      - json:
          expressions:
            level: level
            component: component
      - labels:
          level:
          component:
```

**Ergebnis:** Loki kann nach Level und Component filtern. Grafana-Dashboard bekommt Frontend-Error-Rate.

#### Phase 2: Log-Level-Gate + DEBUG-Cleanup (Low-Effort)

**Aufwand:** ~2h

- `VITE_LOG_LEVEL=info` in Production → debug-Logs verschwinden
- 6 `[DEBUG]` Calls in SystemMonitorView entfernen
- Styled `%c` Calls durch Logger ersetzen (CSS-Styles sind in Docker-Logs nutzlos)
- `window.onerror` Handler in main.ts ergänzen

#### Phase 3: Server-Proxy für Frontend-Logs (Optional, Medium-Effort)

**Aufwand:** ~8h

Neuer Endpoint in El Servador:
```
POST /api/v1/debug/frontend-logs
Body: { level, component, message, error?, stack?, context? }
```

**Warum Proxy statt Direct-Push:**
- ❌ Direct-Push an Loki (Port 3100): CORS blockiert, Loki hat keine Auth
- ✅ Proxy über El Servador: CORS bereits konfiguriert, Auth über JWT, Server kann Logs enrichen (User-ID, Session-ID)

**Wann nötig:** Nur wenn Browser-Console-Logs nicht reichen (z.B. wenn Frontend in Production als statische Files von nginx ausgeliefert wird → kein Docker stdout).

### Empfehlung: Phase 1 + Phase 2

Im aktuellen Setup (Vite Dev Server in Docker) fließen Console-Logs bereits nach Loki. Durch Structured Output (Phase 1) und Level-Gate (Phase 2) wird die bestehende Pipeline massiv aufgewertet - **ohne neue Endpoints oder Infrastruktur**.

Phase 3 wird erst relevant wenn:
- Frontend auf Production-Build (nginx) umgestellt wird
- Console-Output nicht mehr über Docker stdout geht
- User-Context (wer hatte den Error?) benötigt wird

---

## 7. Zusammenfassung & Aufwandsschätzung

### Quick Wins (Phase 1+2)

| Maßnahme | Dateien | Aufwand |
|----------|---------|---------|
| Custom Logger erstellen (`src/utils/logger.ts`) | 1 neue Datei | Klein |
| console.*-Calls durch Logger ersetzen | 33 Dateien | Mittel (mechanisch) |
| VITE_LOG_LEVEL Gate aktivieren | logger.ts + docker-compose | Klein |
| [DEBUG] Calls in SystemMonitorView entfernen | 1 Datei | Klein |
| window.onerror Handler in main.ts | 1 Datei | Klein |
| Promtail Pipeline-Stage für Frontend-JSON | docker/promtail/config.yml | Klein |

### Abhängigkeiten

- Kein neuer npm-Package nötig
- Kein Server-seitiger Code-Change nötig
- Kein Infrastruktur-Change nötig (Promtail/Loki/Grafana bestehen bereits)
- VITE_LOG_LEVEL ist bereits in docker-compose.yml definiert

### Risiken

- **Gering:** 241 mechanische Replacements könnten Typos einführen → TypeScript fängt die meisten ab
- **Gering:** JSON-Output in Console ist weniger lesbar für Entwickler → nur in Docker/Loki relevant, DevTools bleiben unverändert wenn Level=debug

---

## Anhang: Datei-Index aller Console-Calls

### Components (15 Dateien, ~100 Calls)
- `components/charts/MultiSensorChart.vue` - 2 Calls (styled debug)
- `components/dashboard/UnassignedDropBar.vue` - 3 Calls (warn+debug)
- `components/database/RecordDetailModal.vue` - 1 Call (copy error)
- `components/esp/AnalysisDropZone.vue` - 2 Calls (styled debug)
- `components/esp/ESPCard.vue` - 4 Calls (name save debug)
- `components/esp/ESPOrbitalLayout.vue` - 15 Calls (sensor CRUD + debug)
- `components/esp/ESPSettingsPopover.vue` - 4 Calls (device operations)
- `components/esp/SensorSatellite.vue` - 2 Calls (styled debug)
- `components/esp/SensorValueCard.vue` - 2 Calls (measurement)
- `components/system-monitor/CleanupPanel.vue` - 12 Calls (all errors)
- `components/system-monitor/DatabaseTab.vue` - 7 Calls (all errors)
- `components/system-monitor/EventDetailsPanel.vue` - 1 Call (copy error)
- `components/system-monitor/LogManagementPanel.vue` - 3 Calls (errors)
- `components/system-monitor/MqttTrafficTab.vue` - 2 Calls (errors)
- `components/system-monitor/ServerLogsTab.vue` - 3 Calls (errors)
- `components/system-monitor/UnifiedEventList.vue` - 1 Call (warn)
- `components/zones/ZoneAssignmentPanel.vue` - 6 Calls (API + WS)
- `components/zones/ZoneGroup.vue` - 3 Calls (styled debug + warn)

### Views (4 Dateien, ~39 Calls)
- `views/DashboardView.vue` - 16 Calls (device operations)
- `views/LoadTestView.vue` - 1 Call (error)
- `views/MaintenanceView.vue` - 3 Calls (job trigger)
- `views/SystemMonitorView.vue` - 19 Calls (inkl. 6 DEBUG)

### Stores (4 Dateien, ~67 Calls)
- `stores/auth.ts` - 2 Calls (auth error, logout error)
- `stores/dragState.ts` - 3 Calls (styled debug + safety timeout)
- `stores/esp.ts` - 52 Calls (WebSocket handlers + CRUD)
- `stores/logic.ts` - 10 Calls (rule operations + WS)

### Services (1 Datei, 28 Calls)
- `services/websocket.ts` - 28 Calls (connection lifecycle)

### API Layer (2 Dateien, ~22 Calls)
- `api/index.ts` - 3 Calls (interceptor logging)
- `api/esp.ts` - 17 Calls (device operations + debug)
- `api/sensors.ts` - 4 Calls (JSDoc only, nicht ausführbar)

### Composables (3 Dateien, ~10 Calls)
- `composables/useConfigResponse.ts` - 1 Call (parse error)
- `composables/useWebSocket.ts` - 1 Call (connection error)
- `composables/useZoneDragDrop.ts` - 8 Calls (drag operations)

### Core (1 Datei, 3 Calls)
- `main.ts` - 3 Calls (global error handlers)
