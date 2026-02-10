# Konsolidierter Report

**Erstellt:** 2026-02-09T12:00:00.000Z  
**Branch:** feature/docs-cleanup  
**Quellordner:** .technical-manager/inbox/agent-reports/  
**Anzahl Reports:** 8  

## Einbezogene Reports

| # | Report | Thema | Zeilen |
|---|--------|-------|--------|
| 1 | frontend-logging-assessment.md | Frontend Logging – Console-Inventar, Logger-Empfehlung | 339 |
| 2 | frontend-logging-impl-plan.md | Frontend Logging – Verifikation & Implementierungsplan | 37 |
| 3 | grafana-alerting-analysis.md | Grafana Alerting – 5 Rules, Provisioning | 341 |
| 4 | grafana-alerting-impl-plan.md | Grafana Alerting – Phase 1 implementiert | 212 |
| 5 | mosquitto-exporter-analysis.md | Mosquitto Exporter – Go/No-Go, sapcc-Exporter | 241 |
| 6 | mosquitto-exporter-impl-plan.md | Mosquitto Exporter – Verify & Plan (Image-Tag 0.8.0) | 368 |
| 7 | pgadmin-integration-analysis.md | pgAdmin – Erstanalyse, servers.json, Service-Spec | 178 |
| 8 | pgadmin-impl-plan.md | pgAdmin – Verifizierter Plan (Image 9.12, CVEs) | 279 |

---

## 1. frontend-logging-assessment.md

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

**→ Alle Endpoints sind für SERVER-logs. Kein Endpoint für Frontend-Log-Ingestion.**

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

---

## 2. frontend-logging-impl-plan.md

# Auftrag 4.2: Frontend Logging - Verifikation & Implementierungsplan
Datum: 2026-02-09
Agent: frontend-debug + system-control + main-context (parallel)
Typ: Verify + Plan

## Zusammenfassung

**Erstanalyse BESTÄTIGT.** Alle Kernfakten korrekt. Implementierungsplan für Phase 1+2 erstellt.

### Verifizierte Kernfakten
- 241 console.*-Calls in 33 Dateien (alle Level-Counts korrekt)
- Top-3: esp.ts(52), websocket.ts(28), SystemMonitorView.vue(20)
- window.onerror FEHLT (bestätigt)
- VITE_LOG_LEVEL definiert (docker-compose:133, default=debug) aber nur in 1 Datei genutzt
- Kein zentraler Logger vorhanden
- 6 [DEBUG]-Artefakte in SystemMonitorView (Zeilen 917-989)
- 12 styled %c-Calls in 6 Dateien
- Promtail: Keine Frontend-spezifische Pipeline-Stage
- Grafana: Panel 4 "Frontend Log Activity" = nur UP/DOWN, kein Level-Filter

### Implementierungsplan
1. **Logger**: `src/utils/logger.ts` (~80 LOC, createLogger Factory, JSON/plaintext dual-mode)
2. **main.ts**: window.onerror + alle Handler auf Logger umstellen
3. **Migration in 4 Batches**: API(20)→Services(28)→Stores(67)→Views+Components(122)
4. **Promtail**: JSON-Stage für el-frontend mit level/component Labels
5. **Grafana**: Panel 4 auf Frontend Error Count umstellen
6. **Aufwand**: ~4 Stunden, 36 Dateien

### Detailplan
Siehe: `.claude/plans/vivid-wobbling-wilkinson.md` (copy-paste-ready Code, YAML, Patterns)

## Nächster Schritt
TM entscheidet: Implementierung starten als Dev-Flow-Auftrag mit frontend-dev Agent.
Empfehlung: Batch-weise (1→2→3→4), nach jedem Batch `npm run build` zur Verifikation.

---


---

## 3. grafana-alerting-analysis.md

# Grafana Alerting - Erstanalyse

**Datum:** 2026-02-09
**Auftrag:** 3.2 Grafana Alerting
**Typ:** Analyse (kein Code)
**Agent:** Claude Code (system-control + server-debug + Web-Recherche)

---

## 1. IST-Zustand

### Grafana Setup
- **Version:** 11.5.2 (Unified Alerting ist Default seit 9.x - keine Aktivierung noetig)
- **Container:** `automationone-grafana`, Profile `monitoring`, Port 3000
- **Provisioning-Volume:** `./docker/grafana/provisioning:/etc/grafana/provisioning:ro`
- **Environment:** Nur `GF_SECURITY_ADMIN_PASSWORD` und `GF_USERS_ALLOW_SIGN_UP=false`
- **Kein** `GF_UNIFIED_ALERTING_ENABLED` gesetzt (Default: `true` seit 9.x = aktiv)

### Existierende Provisioning-Struktur
```
docker/grafana/provisioning/
  datasources/
    datasources.yml          # Prometheus (uid: prometheus) + Loki (uid: loki)
  dashboards/
    dashboards.yml           # Provider-Config, Ordner "AutomationOne"
    system-health.json       # 6 Panels (siehe unten)
  alerting/                  # EXISTIERT NICHT - muss erstellt werden
```

### Dashboard-Panels (system-health.json)
| Panel | Typ | Datasource | Query |
|-------|-----|------------|-------|
| Server Health Status | stat | Prometheus | `up{job="el-servador"}` |
| MQTT Broker Status | stat | Prometheus | `god_kaiser_mqtt_connected` |
| Database Status | stat | Prometheus | `pg_up` |
| Frontend Log Activity | stat | Loki | `sum(count_over_time({compose_service="el-frontend"}[1m]))` |
| Log Volume by Service | timeseries | Loki | `sum(count_over_time({compose_project="auto-one"} [5m])) by (compose_service)` |
| Recent Error Logs | logs | Loki | `{compose_project="auto-one"} \|~ "(?i)(error\|exception\|fail\|critical)"` |

### Prometheus-Config
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'el-servador'      # /api/v1/health/metrics
  - job_name: 'postgres'          # postgres-exporter:9187
  - job_name: 'prometheus'        # self-monitoring

# KEINE rule_files konfiguriert
# KEIN Alertmanager konfiguriert
```

### Verfuegbare Custom Metriken (metrics.py)
| Metrik | Typ | Beschreibung | Update-Interval |
|--------|-----|-------------|-----------------|
| `god_kaiser_uptime_seconds` | Gauge | Server-Uptime | 15s (Scheduler) |
| `god_kaiser_cpu_percent` | Gauge | CPU-Auslastung | 15s |
| `god_kaiser_memory_percent` | Gauge | Memory-Auslastung | 15s |
| `god_kaiser_mqtt_connected` | Gauge | MQTT-Status (1/0) | 15s |
| `god_kaiser_esp_total` | Gauge | Registrierte ESP-Geraete | 15s |
| `god_kaiser_esp_online` | Gauge | Online ESP-Geraete | 15s |
| `god_kaiser_esp_offline` | Gauge | Offline ESP-Geraete | 15s |

Zusaetzlich exponiert der `prometheus-fastapi-instrumentator` automatisch:
- `http_requests_total` (Counter)
- `http_request_duration_seconds` (Histogram)
- `http_request_size_bytes` (Summary)
- `http_response_size_bytes` (Summary)

### Server Health-Endpoints
| Endpoint | Auth | Response-Felder | Alert-tauglich |
|----------|------|----------------|----------------|
| `GET /api/v1/health/` | Nein | status, version, uptime_seconds | Ja (via Prometheus up-Metrik) |
| `GET /api/v1/health/live` | Nein | alive: bool | Ja (Liveness) |
| `GET /api/v1/health/ready` | Nein | ready: bool, checks: {database, mqtt, disk_space} | **Ja - beste Basis** |
| `GET /api/v1/health/detailed` | **JWT** | database, mqtt, websocket, system (CPU/mem/disk) | Nein (Auth erforderlich) |
| `GET /api/v1/health/esp` | **JWT** | devices, online/offline counts | Nein (Auth erforderlich) |
| `GET /api/v1/health/metrics` | Nein | Prometheus text format | Ja (wird bereits gescraped) |

**Wichtig:** `/ready` prueft `database`, `mqtt`, `disk_space` einzeln und braucht KEIN JWT. Aber: Dieser Endpoint ist nicht direkt als Prometheus-Metrik verfuegbar - er muesste via Blackbox-Exporter oder die bestehenden Gauges genutzt werden.

---

## 2. Vorgeschlagene Alert-Rules (5 Rules)

### Rule 1: Server Down
| Feld | Wert |
|------|------|
| **Name** | `server-down` |
| **Severity** | critical |
| **Query (PromQL)** | `up{job="el-servador"} == 0` |
| **Threshold** | Boolean (0 = down) |
| **Evaluation Interval** | 15s |
| **For Duration** | 1m |
| **Beschreibung** | God-Kaiser Server ist nicht erreichbar. Prometheus kann `/api/v1/health/metrics` nicht scrapen. |
| **Dashboard-Referenz** | Panel "Server Health Status" nutzt dieselbe Metrik |

### Rule 2: MQTT Disconnected
| Feld | Wert |
|------|------|
| **Name** | `mqtt-disconnected` |
| **Severity** | critical |
| **Query (PromQL)** | `god_kaiser_mqtt_connected == 0` |
| **Threshold** | Boolean (0 = disconnected) |
| **Evaluation Interval** | 15s |
| **For Duration** | 1m |
| **Beschreibung** | MQTT-Broker-Verbindung verloren. Kein ESP32-Datenempfang moeglich. |
| **Dashboard-Referenz** | Panel "MQTT Broker Status" nutzt dieselbe Metrik |

### Rule 3: Database Down
| Feld | Wert |
|------|------|
| **Name** | `database-down` |
| **Severity** | critical |
| **Query (PromQL)** | `pg_up == 0` |
| **Threshold** | Boolean (0 = down) |
| **Evaluation Interval** | 15s |
| **For Duration** | 1m |
| **Beschreibung** | PostgreSQL ist nicht erreichbar (postgres-exporter meldet down). |
| **Dashboard-Referenz** | Panel "Database Status" nutzt dieselbe Metrik |

### Rule 4: High Memory Usage
| Feld | Wert |
|------|------|
| **Name** | `high-memory-usage` |
| **Severity** | warning |
| **Query (PromQL)** | `god_kaiser_memory_percent > 85` |
| **Threshold** | 85% (Server-Code nutzt 90% als "degraded") |
| **Evaluation Interval** | 1m |
| **For Duration** | 5m |
| **Beschreibung** | Server-Memory ueber 85%. Bei 90% meldet Health-Endpoint "degraded". Fruehwarnung. |

### Rule 5: ESP Devices Offline
| Feld | Wert |
|------|------|
| **Name** | `esp-devices-offline` |
| **Severity** | warning |
| **Query (PromQL)** | `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` |
| **Threshold** | Jedes Offline-Geraet bei registrierten Geraeten |
| **Evaluation Interval** | 1m |
| **For Duration** | 3m |
| **Beschreibung** | Mindestens ein registriertes ESP32-Geraet ist offline. |
| **Anmerkung** | `god_kaiser_esp_total > 0` verhindert False-Positives bei leerem System |

### Bewusst NICHT als Alert:
- **CPU-Usage:** Spikes sind normal, Gauges nur alle 15s - zu ungenau fuer Alerting
- **Frontend-Status (Loki):** Log-Abwesenheit != Ausfall. Kein zuverlaessiger Indikator
- **HTTP-Fehlerrate:** Zu wenig Traffic in Dev-Umgebung, wuerde zu viele False-Positives erzeugen

---

## 3. Provisioning-Strategie

### Ansatz: File-Provisioning (YAML)

Grafana 11.5.2 unterstuetzt vollstaendiges Alerting-Provisioning via YAML-Dateien unter `provisioning/alerting/`. Keine API noetig. Kein externer Service noetig.

**Quelle:** [Grafana Docs - File Provisioning](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)

### Dateien die erstellt werden muessen

```
docker/grafana/provisioning/alerting/
  alert-rules.yml         # 5 Alert-Rules
  contact-points.yml      # Webhook Contact-Point
  notification-policy.yml # Routing: alle Alerts -> Webhook
```

### Datei 1: `alert-rules.yml`

```yaml
apiVersion: 1

groups:
  - orgId: 1
    name: automationone-critical
    folder: AutomationOne
    interval: 15s
    rules:
      - uid: ao-server-down
        title: "Server Down"
        condition: A
        data:
          - refId: A
            relativeTimeRange:
              from: 60
              to: 0
            datasourceUid: prometheus
            model:
              expr: "up{job=\"el-servador\"}"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
        noDataState: Alerting
        execErrState: Alerting
        for: 1m
        annotations:
          summary: "God-Kaiser Server ist nicht erreichbar"
          description: "Prometheus kann /api/v1/health/metrics nicht scrapen seit >1m"
        labels:
          severity: critical
          component: server

      - uid: ao-mqtt-disconnected
        title: "MQTT Disconnected"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 60
              to: 0
            datasourceUid: prometheus
            model:
              expr: "god_kaiser_mqtt_connected"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: lt
                    params: [1]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: Alerting
        execErrState: Alerting
        for: 1m
        annotations:
          summary: "MQTT-Broker Verbindung verloren"
          description: "god_kaiser_mqtt_connected == 0 seit >1m"
        labels:
          severity: critical
          component: mqtt

      - uid: ao-database-down
        title: "Database Down"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 60
              to: 0
            datasourceUid: prometheus
            model:
              expr: "pg_up"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: lt
                    params: [1]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: Alerting
        execErrState: Alerting
        for: 1m
        annotations:
          summary: "PostgreSQL nicht erreichbar"
          description: "postgres-exporter meldet pg_up == 0 seit >1m"
        labels:
          severity: critical
          component: database

  - orgId: 1
    name: automationone-warnings
    folder: AutomationOne
    interval: 1m
    rules:
      - uid: ao-high-memory
        title: "High Memory Usage"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: prometheus
            model:
              expr: "god_kaiser_memory_percent"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: gt
                    params: [85]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: OK
        execErrState: Alerting
        for: 5m
        annotations:
          summary: "Server Memory ueber 85%"
          description: "god_kaiser_memory_percent > 85 seit >5m. Bei 90% wird Status 'degraded'."
        labels:
          severity: warning
          component: server

      - uid: ao-esp-offline
        title: "ESP Devices Offline"
        condition: B
        data:
          - refId: A
            relativeTimeRange:
              from: 180
              to: 0
            datasourceUid: prometheus
            model:
              expr: "god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0"
              intervalMs: 15000
              maxDataPoints: 43200
              refId: A
          - refId: B
            datasourceUid: '__expr__'
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: gt
                    params: [0]
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
              refId: B
        noDataState: OK
        execErrState: Alerting
        for: 3m
        annotations:
          summary: "ESP32-Geraete offline"
          description: "Mindestens ein registriertes ESP32-Geraet ist seit >3m offline"
        labels:
          severity: warning
          component: esp32
```

### Datei 2: `contact-points.yml`

```yaml
apiVersion: 1

contactPoints:
  - orgId: 1
    name: automationone-webhook
    receivers:
      - uid: ao-webhook
        type: webhook
        disableResolveMessage: false
        settings:
          url: "http://el-servador:8000/api/v1/health/alert-webhook"
          httpMethod: POST
          maxAlerts: 10
```

**Notification-Strategie:**
- **Webhook an den Server selbst** = minimaler Aufwand, kein externer Service
- Server kann Alerts in Audit-Log schreiben + via WebSocket ans Frontend pushen
- Webhook-Endpoint (`/api/v1/health/alert-webhook`) muss noch implementiert werden
- **Alternative (noch einfacher):** Grafana kann auch in ein Log-File schreiben oder einfach nur im Grafana-UI Alerts anzeigen (dann reicht die Notification-Policy ohne Contact-Point)

### Datei 3: `notification-policy.yml`

```yaml
apiVersion: 1

policies:
  - orgId: 1
    receiver: automationone-webhook
    group_by:
      - grafana_folder
      - alertname
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - receiver: automationone-webhook
        matchers:
          - severity = critical
        group_wait: 10s
        group_interval: 1m
        repeat_interval: 1h
      - receiver: automationone-webhook
        matchers:
          - severity = warning
        group_wait: 1m
        group_interval: 5m
        repeat_interval: 4h
```

---

## 4. Notification-Kanal Optionen

| Option | Aufwand | Externer Service | Beschreibung |
|--------|---------|-----------------|-------------|
| **Grafana UI only** | Null | Nein | Alerts erscheinen nur im Grafana Alert-Panel. Kein Code noetig. |
| **Webhook -> Server** | Niedrig | Nein | Server empfaengt Alert-JSON, schreibt Audit-Log, pusht via WebSocket |
| **Webhook -> File** | Niedrig | Nein | Grafana schreibt in ein gemountetes Log-File |
| **Email (SMTP)** | Mittel | SMTP-Server | Braucht SMTP-Config in Grafana |
| **Slack/Discord** | Mittel | Ja | Braucht API-Token + External Access |

**Empfehlung: Zweistufig**
1. **Phase 1 (sofort):** Nur Grafana-UI Alerting. Alert-Rules + Notification-Policy ohne speziellen Contact-Point. Alerts sind in Grafana sichtbar + querybar.
2. **Phase 2 (spaeter):** Webhook-Endpoint im Server implementieren fuer Audit-Log + WebSocket-Push ans Dashboard.

---

## 5. Implementierungsschritte (Minimaler Aufwand)

### Phase 1: File-Provisioning (kein Code)
1. Ordner erstellen: `docker/grafana/provisioning/alerting/`
2. `alert-rules.yml` anlegen (wie oben)
3. `contact-points.yml` kann WEGGELASSEN werden fuer Phase 1
4. `notification-policy.yml` kann WEGGELASSEN werden fuer Phase 1
5. Grafana-Container neu starten
6. **Ergebnis:** 5 Alert-Rules aktiv in Grafana UI, Alerts sind sichtbar unter Grafana > Alerting

### Phase 2: Webhook-Integration (Code noetig)
1. `contact-points.yml` + `notification-policy.yml` anlegen
2. Server-Endpoint `POST /api/v1/health/alert-webhook` implementieren
3. Alert-Payload in `audit_log` Tabelle schreiben
4. WebSocket-Event `alert:fired` / `alert:resolved` ans Frontend pushen
5. Frontend-Notification-Toast bei Alert-Events anzeigen

### Kein Alertmanager noetig
Grafana 11.x hat einen eingebauten Alertmanager. Kein separater Prometheus Alertmanager-Container erforderlich. Keine `rule_files` in `prometheus.yml` noetig - die Evaluation passiert komplett in Grafana.

---

## 6. Offene Fragen / Risiken

| Frage | Relevanz |
|-------|----------|
| Soll Phase 1 (UI-only) oder direkt Phase 2 (Webhook) implementiert werden? | Entscheidung TM |
| Alert bei `god_kaiser_esp_offline > 0` koennte in Dev-Umgebung ohne ESP32 staendig feuern | `god_kaiser_esp_total > 0` Guard sollte das verhindern |
| `noDataState: Alerting` fuer Critical-Rules: Wenn Server down ist, fehlen Metriken = Alert | Gewuenscht - "kein Signal = Problem" |
| Grafana Provisioning-Volume ist `:ro` - Alerts koennen nicht aus der UI editiert werden | Gewuenscht fuer Infrastructure-as-Code, aber UI-Experimente sind blockiert |

---

## 7. Zusammenfassung

| Aspekt | Antwort |
|--------|---------|
| **Alert-Rules** | 5 Rules (3 critical, 2 warning) mit exakten PromQL-Queries auf bestehende Metriken |
| **Provisioning** | File-basiert unter `docker/grafana/provisioning/alerting/` (3 YAML-Dateien) |
| **Notification** | Phase 1: Grafana-UI only. Phase 2: Webhook -> Server -> Audit-Log + WebSocket |
| **Minimaler Aufwand** | 1 Ordner + 1 YAML-Datei + Container-Restart = funktionierendes Alerting |
| **Kein externer Service noetig** | Kein Alertmanager, kein SMTP, kein Slack |

**Quellen:**
- [Grafana File Provisioning Docs](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)
- [Grafana Provisioning Alerting Examples](https://github.com/grafana/provisioning-alerting-examples)

---

## 4. grafana-alerting-impl-plan.md

# Grafana Alerting - IMPLEMENTIERT (Phase 1)

**Datum:** 2026-02-09
**Auftrag:** 3.2 Grafana Alerting (Verifikation + Plan + Implementierung)
**Typ:** Verify + Plan + Implement
**Agent:** Claude Code (system-control + server-debug + Web-Recherche)
**Basis-Report:** grafana-alerting-analysis.md
**Status:** IMPLEMENTIERT UND VERIFIZIERT

---

## 1. Phase A: Provisioning-Format Verifizierung

### Datasource UIDs (VERIFIZIERT)

| Datasource | UID in `datasources.yml` | UID in Alert-Rules | Match |
|------------|--------------------------|-------------------|-------|
| Prometheus | `prometheus` | `prometheus` | YES |
| Loki | `loki` | (nicht verwendet) | n/a |
| Expression | `__expr__` (built-in) | `__expr__` | YES (Grafana Docs bestaetigt) |

### Ordner-Status (NACH Implementierung)

| Pfad | Status |
|------|--------|
| `docker/grafana/provisioning/datasources/` | Existiert |
| `docker/grafana/provisioning/dashboards/` | Existiert |
| `docker/grafana/provisioning/alerting/` | **NEU ERSTELLT** |
| `docker/grafana/provisioning/alerting/alert-rules.yml` | **NEU ERSTELLT** |

### Grafana-Version Kompatibilitaet

- **Version:** 11.5.2 (live verifiziert via `/api/health`)
- **Unified Alerting:** Default seit 9.x - aktiv ohne explizite Config
- **`apiVersion: 1`:** Vollstaendig unterstuetzt
- **Scheduler-Interval:** 10s (evaluation intervals muessen Vielfache von 10s sein)

**ERGEBNIS Phase A: Alle Voraussetzungen erfuellt.**

---

## 2. Phase B: Alert-Rules Validierung

### Live Prometheus-Daten (alle Queries verifiziert)

| Metric | PromQL | Live-Wert | Status | Scrape-Target |
|--------|--------|-----------|--------|---------------|
| Server Up | `up{job="el-servador"}` | `1` | OK | el-servador:8000 |
| MQTT Connected | `god_kaiser_mqtt_connected` | `1` | OK | el-servador:8000 |
| Database Up | `pg_up` | `1` | OK | postgres-exporter:9187 |
| Memory % | `god_kaiser_memory_percent` | `21.7` | OK | el-servador:8000 |
| ESP Offline | `god_kaiser_esp_offline` | `22` | OK | el-servador:8000 |
| ESP Total | `god_kaiser_esp_total` | `100` | OK | el-servador:8000 |

### mosquitto_exporter Status

- **NICHT implementiert** (kein Service in docker-compose.yml)
- **Keine 6. Rule** - wird erst nach Auftrag 3.1 ergaenzt

**ERGEBNIS Phase B: Alle 5 Metriken existieren und liefern plausible Werte.**

---

## 3. Bugs im Erstanalyse-Report (ALLE KORRIGIERT)

Waehrend der Implementierung wurden 3 Fehler im urspruenglichen YAML entdeckt und behoben:

### Bug 1: Rule 1 fehlende Threshold-Expression (aus Erstanalyse)

**Problem:** `condition: A` zeigt auf rohe PromQL-Query → feuert bei UP-State!
**Fix:** 3-stufige Pipeline mit Reduce + Threshold, `condition: C`

### Bug 2: Evaluation Interval 15s ungueltig (aus Impl-Plan v1)

**Problem:** `interval: 15s` ist kein Vielfaches des Grafana-Scheduler-Intervals (10s)
**Fehler:** `interval (15s) should be non-zero and divided exactly by scheduler interval: 10`
**Fix:** `interval: 10s` fuer Critical, `interval: 1m` fuer Warnings (60s/10=6 ✓)

### Bug 3: 2-Stage-Pipeline braucht 3-Stage (aus Impl-Plan v2)

**Problem:** Threshold-Expression kann keine Zeitreihendaten verarbeiten
**Fehler:** `looks like time series data, only reduced data can be alerted on`
**Fix:** 3-stufige Pipeline: A (PromQL) → B (Reduce:last) → C (Threshold)

---

## 4. FINALE alert-rules.yml (DEPLOYED)

Die tatsaechlich deployete Datei: `docker/grafana/provisioning/alerting/alert-rules.yml`

**Struktur jeder Rule (3-stufige Pipeline):**
```
A: PromQL-Query (datasource: prometheus) → Zeitreihe
B: Reduce (datasource: __expr__, type: reduce, expression: "A", reducer: last) → Einzelwert
C: Threshold (datasource: __expr__, type: threshold, expression: "B") → Alert-State
condition: C
```

### 5 Rules (3 Critical, 2 Warning)

| # | UID | Title | PromQL (refId A) | Threshold (refId C) | Severity | for |
|---|-----|-------|------------------|---------------------|----------|-----|
| 1 | `ao-server-down` | Server Down | `up{job="el-servador"}` | lt 1 | critical | 1m |
| 2 | `ao-mqtt-disconnected` | MQTT Disconnected | `god_kaiser_mqtt_connected` | lt 1 | critical | 1m |
| 3 | `ao-database-down` | Database Down | `pg_up` | lt 1 | critical | 1m |
| 4 | `ao-high-memory` | High Memory Usage | `god_kaiser_memory_percent` | gt 85 | warning | 5m |
| 5 | `ao-esp-offline` | ESP Devices Offline | `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` | gt 0 | warning | 3m |

### Gruppierung

| Gruppe | Rules | Eval Interval |
|--------|-------|---------------|
| `automationone-critical` | 1, 2, 3 | 10s |
| `automationone-warnings` | 4, 5 | 1m |

### noDataState / execErrState

| Rule | noDataState | execErrState |
|------|-------------|--------------|
| Rules 1-3 (Critical) | `Alerting` | `Alerting` |
| Rules 4-5 (Warning) | `OK` | `Alerting` |

---

## 5. Verifikation (ERFOLGREICH)

### Grafana-Logs

```
provisioning.alerting: "starting to provision alerting"
provisioning.alerting: "finished to provision alerting"
```
Keine Fehler beim Provisioning.

### Grafana API - Alert States (live verifiziert)

| Rule | State | Erwartung | Korrekt |
|------|-------|-----------|---------|
| Server Down | **Normal** | Server laeuft → Normal | ✅ |
| MQTT Disconnected | **Normal** | MQTT connected=1 → Normal | ✅ |
| Database Down | **Normal** | pg_up=1 → Normal | ✅ |
| High Memory Usage | **Normal** | Memory 21.7% < 85% → Normal | ✅ |
| ESP Devices Offline | **Pending→Alerting** | 22 offline ESPs → Alerting nach 3m | ✅ |

### Grafana API - Provisioning

```
curl -s -u "admin:admin" "http://localhost:3000/api/v1/provisioning/alert-rules"
→ 5 Rules, alle mit provenance: "file"
```

### Bekannter Hinweis

- SMTP nicht konfiguriert → Grafana versucht Default-Email-Notifications und loggt Fehler
- Dies ist **harmlos** in Phase 1 (UI-only). Kein externer Contact-Point konfiguriert
- Fix: In Phase 2 korrekte Contact-Points definieren

---

## 6. Aenderungen gegenueber Erstanalyse-Report

| Aenderung | Grund |
|-----------|-------|
| 2-Stage → 3-Stage Pipeline (A→B→C) | Grafana Threshold braucht reduzierte Daten |
| `condition: B` → `condition: C` | Threshold ist jetzt refId C |
| `interval: 15s` → `interval: 10s` | Muss Vielfaches des 10s Scheduler-Intervals sein |
| `expression: "A"` in Reduce | Referenziert PromQL-Query |
| `expression: "B"` in Threshold | Referenziert Reduce-Output |
| Contact-Points + Notification-Policy entfernt | Phase 1: UI-only |

---

## 7. Phase 2 Vorbereitung (NICHT implementiert)

### Zusaetzliche Dateien

1. **`contact-points.yml`** - Webhook an Server
2. **`notification-policy.yml`** - Routing Critical vs Warning
3. **Server-Endpoint:** `POST /api/v1/health/alert-webhook`
4. **WebSocket-Event:** `alert:fired` / `alert:resolved`

### 6. Rule nach Auftrag 3.1

Wenn mosquitto_exporter implementiert ist, ergaenze in `automationone-critical`:

```yaml
# Rule 6: MQTT Broker Down
- uid: ao-mqtt-broker-down
  title: "MQTT Broker Down"
  condition: C
  data:
    - refId: A
      relativeTimeRange:
        from: 60
        to: 0
      datasourceUid: prometheus
      model:
        expr: "up{job=\"mqtt-broker\"}"
        intervalMs: 15000
        maxDataPoints: 43200
        refId: A
    - refId: B
      relativeTimeRange:
        from: 0
        to: 0
      datasourceUid: '__expr__'
      model:
        type: reduce
        expression: "A"
        reducer: last
        refId: B
    - refId: C
      relativeTimeRange:
        from: 0
        to: 0
      datasourceUid: '__expr__'
      model:
        type: threshold
        expression: "B"
        conditions:
          - evaluator:
              type: lt
              params: [1]
        refId: C
  noDataState: Alerting
  execErrState: Alerting
  for: 1m
  annotations:
    summary: "MQTT Broker (Mosquitto) nicht erreichbar"
    description: "mosquitto_exporter meldet Broker unreachable seit >1m"
  labels:
    severity: critical
    component: mqtt-broker
```

**Hinweis:** `job: mqtt-broker` muss dem `job_name` in `prometheus.yml` entsprechen.
**WICHTIG:** 3-Stage-Pipeline (A→B→C) mit `condition: C` verwenden!

---

## 8. Zusammenfassung

### Status: PHASE 1 IMPLEMENTIERT UND VERIFIZIERT

| Aspekt | Status |
|--------|--------|
| Datasource UIDs | ✅ Korrekt |
| PromQL Queries | ✅ Alle 5 live verifiziert |
| Provisioning-Format | ✅ 3-Stage Pipeline, Grafana 11.5.2, apiVersion: 1 |
| Deployment | ✅ Erfolgreich, alle 5 Rules aktiv |
| Alert-States | ✅ 4x Normal, 1x Alerting (ESP offline - erwartetes Verhalten) |
| Volume-Mount | ✅ `:ro` liest alerting/ korrekt |

### Erstellte Dateien

| Datei | Aktion |
|-------|--------|
| `docker/grafana/provisioning/alerting/alert-rules.yml` | **NEU** |

### Nicht implementiert (bewusst - Phase 2)

| Aspekt | Grund |
|--------|-------|
| mosquitto_exporter Rule 6 | Auftrag 3.1 noch nicht implementiert |
| contact-points.yml | Braucht Server-Webhook-Endpoint |
| notification-policy.yml | Braucht Contact-Points |

### Key Learning: Grafana Alerting Provisioning Format

Das von vielen Quellen (inkl. Grafana-Doku-Beispielen) gezeigte 2-Stage-Format (`condition: B` mit Threshold direkt auf PromQL) funktioniert NICHT in Grafana 11.5.2. Man MUSS eine 3-Stage-Pipeline verwenden:

```
A: PromQL Query → Zeitreihe
B: Reduce (expression: "A", reducer: last) → Einzelwert
C: Threshold (expression: "B", evaluator: lt/gt) → Alert
condition: C
```

---

## 5. mosquitto-exporter-analysis.md

# Mosquitto Exporter -- Erstanalyse

**Datum:** 2026-02-09
**Auftrag:** 3.1 (mosquitto_exporter Erstanalyse)
**Typ:** Analyse (kein Code)
**Agents:** mqtt-debug, system-control, general-purpose (Web-Recherche)
**Status:** Abgeschlossen -- Go/No-Go-Entscheidung moeglich

---

## Executive Summary

Der Mosquitto-Broker (Eclipse Mosquitto 2.0.22) liefert **umfangreiche `$SYS`-Metriken nativ**. Der Prometheus-Exporter `sapcc/mosquitto-exporter` ist der klare Kandidat: Zero-Config, 3.2 MB Image, ~5-10 MB RAM, passt exakt in den bestehenden Monitoring-Stack. **Ein Healthcheck-Workaround ist noetig** (scratch-Image hat kein wget/curl). Integration: ~20 Zeilen docker-compose + ~6 Zeilen Prometheus-Config.

**Empfehlung: Go.** Niedriger Aufwand, hoher Mehrwert (ESP32-Fleet-Gesundheit, Message-Loss-Detection).

---

## 1. Broker IST-Zustand

### 1.1 Mosquitto-Konfiguration

| Setting | Wert | Hinweis |
|---------|------|---------|
| **Version** | mosquitto 2.0.22 | Image: `eclipse-mosquitto:2` |
| **Listener** | 1883 (MQTT), 9001 (WebSocket) | Dual-Protocol |
| **Auth** | `allow_anonymous true` | DEV ONLY |
| **Persistence** | `true` | Volume: `automationone-mosquitto-data` |
| **Max Inflight** | 20 | QoS 1/2 Flow Control |
| **Max Queued** | 1000 | Ausreichend fuer ESP32-Fleet |
| **Max Message Size** | 256 KB | Groesste Payloads: Config ~5KB |
| **Logging** | Alle Levels, file + stdout | Verbose (Dev) |
| **ACL** | Keine | Kein `acl_file` konfiguriert |

**Security-Status:** Development-Config. Production braucht: `allow_anonymous false`, password_file, acl_file, TLS.

### 1.2 Docker-Service

| Aspekt | Wert |
|--------|------|
| Service | `mqtt-broker` |
| Container | `automationone-mqtt` |
| Profile | *(default)* -- Core-Service |
| Ports | `1883:1883`, `9001:9001` |
| Netzwerk | `automationone-net` (bridge) |
| Healthcheck | `mosquitto_sub -t $SYS/# -C 1 -i healthcheck -W 3` |
| Depends On | Keine (Base-Service) |

### 1.3 $SYS-Topics: Verfuegbar und Uneingeschraenkt

`$SYS/#` ist **vollstaendig aktiv** -- bestaetigt durch:
- Mosquitto 2.x Default-Verhalten (automatisch aktiv)
- Healthcheck subscribed bereits auf `$SYS/#`
- Keine ACL blockiert den Zugriff

### 1.4 Live-Metriken (Snapshot)

**Clients:**
| Metrik | Wert |
|--------|------|
| connected | 1 |
| total | 1 |
| maximum (seit Start) | 2 |
| disconnected | 0 |

**Message-Raten (1min Average):**
| Metrik | Wert |
|--------|------|
| messages/received | ~300 msg/s |
| messages/sent | ~430 msg/s |
| publish/dropped | **0** (kein Loss) |
| bytes/received | ~76.6 KB/s |
| bytes/sent | ~78.3 KB/s |

**Store:**
| Metrik | Wert |
|--------|------|
| messages stored | 51 |
| store bytes | 265 |
| subscriptions | 16 |

**Hinweis:** Die hohe Message-Rate (~300 msg/s) bei nur 1 Client deutet auf laufende Mock/Simulation oder Server-interne Publish-Loops hin. Baseline nach Clean-Restart ermitteln.

---

## 2. Exporter-Empfehlung

### 2.1 Kandidaten-Vergleich

| Exporter | Typ | Sprache | Liest $SYS? | Maintenance | Empfehlung |
|----------|-----|---------|-------------|-------------|------------|
| **sapcc/mosquitto-exporter** | Broker-Metriken | Go | **Ja** | Low (v0.8.0, 2021) | **Empfohlen** |
| kpetremann/mqtt-exporter | Payload-Konverter | Python | Nein | Aktiv (v1.10.0, 2026) | Anderer Zweck |
| hikhvar/mqtt2prometheus | Payload-Konverter | Go | Nein | Moderat | Anderer Zweck |
| ypbind/prometheus-mosquitto-exporter | Broker-Metriken | Rust | Ja | Gering | Kein Docker-Image |
| pfinal/... | Broker-Metriken | PHP | Ja | Inaktiv | Nicht empfohlen |

**Ergebnis:** `sapcc/mosquitto-exporter` ist der **einzige ernstzunehmende `$SYS`-Exporter** mit Docker-Image. Die Alternativen (kpetremann, hikhvar) exportieren MQTT-Payloads als Prometheus-Metriken -- ein komplett anderer Anwendungsfall (Sensor-Daten direkt als Prometheus-Metriken, was bei uns der Server bereits ueber Instrumentator macht).

### 2.2 sapcc/mosquitto-exporter im Detail

| Eigenschaft | Wert |
|-------------|------|
| **GitHub** | github.com/sapcc/mosquitto-exporter |
| **Image** | `sapcc/mosquitto-exporter:v0.8.0` (Docker Hub) |
| **Image-Groesse** | 3.2 MB (scratch-basiert, Go-Binary only) |
| **RAM** | ~5-10 MB |
| **CPU** | Vernachlaessigbar |
| **Port** | 9234 (`/metrics` Endpoint) |
| **Config** | 1 Env-Variable: `BROKER_ENDPOINT=tcp://mqtt-broker:1883` |
| **Mosquitto 2.x** | Kompatibel (bestaetigt) |
| **Auth** | Optional: `MQTT_USER`, `MQTT_PASS`, `MQTT_CERT`, `MQTT_KEY` |

**Maintenance-Risiko:** Niedrig. Go-Binaries sind langzeitstabil, `$SYS`-Schnittstelle unveraendert seit Jahren, Code ist ~300 Zeilen. Fork trivial bei Bedarf.

### 2.3 Exportierte Metriken

**Counter (monoton steigend):**
- `broker_bytes_received` / `broker_bytes_sent`
- `broker_messages_received` / `broker_messages_sent`
- `broker_publish_messages_received` / `_sent` / `_dropped`
- `broker_uptime`
- `broker_clients_maximum` / `_total`

**Gauges (aktueller Wert):**
- `broker_clients_connected` / `_disconnected`
- `broker_subscriptions_count`
- `broker_messages_stored` / `_inflight`
- `broker_heap_current_size` / `_maximum_size`
- `broker_retained_messages_count`
- `broker_load_messages_received_1min` (und 5min, 15min)

---

## 3. Integration in Docker-Stack

### 3.1 Aktueller Stack (9 Services)

| # | Service | Profile | Zweck |
|---|---------|---------|-------|
| 1 | postgres | default | Database |
| 2 | mqtt-broker | default | MQTT Broker |
| 3 | el-servador | default | FastAPI Server |
| 4 | el-frontend | default | Vue 3 Dashboard |
| 5 | loki | monitoring | Log-Aggregation |
| 6 | promtail | monitoring | Log-Shipping |
| 7 | prometheus | monitoring | Metriken-Sammlung |
| 8 | grafana | monitoring | Dashboards |
| 9 | postgres-exporter | monitoring | DB-Metriken |

**Nach Integration:** 10 Services (+ mosquitto-exporter im `monitoring` Profile).

### 3.2 Docker-Compose Skizze

```yaml
mosquitto-exporter:
  image: sapcc/mosquitto-exporter:v0.8.0
  container_name: automationone-mosquitto-exporter
  profiles: ["monitoring"]
  environment:
    BROKER_ENDPOINT: "tcp://mqtt-broker:1883"
  ports:
    - "9234:9234"
  depends_on:
    mqtt-broker:
      condition: service_healthy
  networks:
    - automationone-net
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "5m"
      max-file: "3"
```

**Wichtig -- Healthcheck-Problem:** Das `scratch`-Image enthaelt **kein wget, curl oder Shell**. Standard-Healthcheck-Pattern (`wget --spider`) funktioniert NICHT. Optionen:
1. **Healthcheck weglassen** -- Prometheus-Scrape dient als impliziter Health-Indikator
2. **Alpine-basiertes Image bauen** -- ermoeglichen Healthcheck, aber erhoehte Maintenance
3. **Exporter mit `--bind-address`** testen ob Port-Probe reicht

**Empfehlung:** Option 1 (kein Healthcheck). Folgt dem KISS-Prinzip. Prometheus scrapt alle 15s -- wenn Metrics fehlen, sieht man das sofort im Dashboard (`up{job="mqtt-broker"} == 0`).

### 3.3 Prometheus-Config Ergaenzung

```yaml
- job_name: 'mqtt-broker'
  static_configs:
    - targets: ['mosquitto-exporter:9234']
      labels:
        service: 'mqtt-broker'
        environment: 'development'
```

**Job-Name:** `mqtt-broker` (nicht `mosquitto` oder `mosquitto-exporter`). Folgt dem Pattern: Job benennt den **gescrapten Service**, nicht den Exporter. Analog: Job `postgres` zeigt auf `postgres-exporter:9187`.

### 3.4 Netzwerk

Kein zusaetzliches Netzwerk noetig. `automationone-net` verbindet bereits alle Services. Exporter braucht:
- `mqtt-broker:1883` (MQTT-Subscription auf `$SYS/#`)
- Erreichbar von `prometheus` (Scrape auf Port 9234)

### 3.5 Kosten der Integration

| Aspekt | Aufwand |
|--------|---------|
| docker-compose.yml | ~15 Zeilen (1 Service-Block) |
| prometheus.yml | ~6 Zeilen (1 scrape_config) |
| Grafana Dashboard | 4-6 neue Panels (oder Grafana Dashboard 17721 importieren) |
| Container-Ressourcen | 3.2 MB Disk, ~5-10 MB RAM, ~0% CPU |
| Konfigurationsaenderungen an Mosquitto | **Keine** |
| Maintenance | Gering (Image pinnen, selten Updates) |

---

## 4. Dashboard-Panel Empfehlung

### 4.1 Tier 1: Kritisch (Haupt-Panels)

| Panel | Metrik | Typ | Zweck |
|-------|--------|-----|-------|
| **ESP32 Fleet Health** | `broker_clients_connected` | Stat | Anzahl verbundener ESPs. Soll vs. Ist sofort sichtbar. |
| **Message Rate** | `rate(broker_messages_received[5m])` | Timeseries | Sensor-Datenfluss. Abfall = Sensor/ESP-Ausfall. |
| **Messages Dropped** | `broker_publish_messages_dropped` | Stat (Alert) | **Muss immer 0 sein.** Jeder Drop = Datenverlust. |
| **MQTT Broker Up** | `up{job="mqtt-broker"}` | Stat | Exporter erreichbar = Broker laeuft. |

### 4.2 Tier 2: Wichtig (Sekundaere Panels)

| Panel | Metrik | Typ | Zweck |
|-------|--------|-----|-------|
| **Subscriptions** | `broker_subscriptions_count` | Stat | Handler-Coverage, Anomalie-Erkennung |
| **Inflight Messages** | `broker_messages_inflight` | Gauge | Backpressure-Indikator (QoS>0) |
| **Stored Messages** | `broker_messages_stored` | Gauge | Retained + Queue. Wachstum = Problem. |
| **Bandwidth** | `rate(broker_bytes_received[5m])` | Timeseries | Netzwerk-Throughput |

### 4.3 Tier 3: Diagnostik

| Panel | Metrik | Typ | Zweck |
|-------|--------|-----|-------|
| **Broker Uptime** | `broker_uptime` | Stat | Unerwartete Restarts erkennen |
| **Heap Usage** | `broker_heap_current_size` | Timeseries | Memory-Leak-Detection |
| **Max Clients** | `broker_clients_maximum` | Stat | Peak seit Broker-Start |

### 4.4 Bestehende Panels: Anpassung

**Panel 2 ("MQTT Broker Status")** zeigt aktuell `god_kaiser_mqtt_connected` -- eine **Server-seitige Gauge**. Mit dem Exporter koennte dieses Panel ersetzt oder ergaenzt werden:
- Alt: "Ist der Server mit dem Broker verbunden?" (Server-Perspektive)
- Neu: "Wie viele Clients sind mit dem Broker verbunden?" (Broker-Perspektive)

---

## 5. Risiken und Showstopper

| Risiko | Schwere | Beschreibung | Mitigation |
|--------|---------|-------------|------------|
| **Image nicht gewartet** | Niedrig | Letzte Release v0.8.0 (2021). Aber: Go-Binary stabil, `$SYS` stabil. | Pin auf v0.8.0, Fork bei Bedarf |
| **scratch-Image kein Healthcheck** | Niedrig | Kein wget/curl im Container. | Healthcheck weglassen, `up{}` als Proxy |
| **Nur amd64** | Niedrig | Kein ARM-Image. Stack laeuft auf x86. | Selbst bauen bei ARM-Bedarf |
| **Docker Hub Image-Tag** | Mittel | `:latest` koennte veraltet sein. | Explizit `:v0.8.0` pinnen |
| **Anonymous Auth** | Keins (Dev) | Exporter nutzt anonymous MQTT. Passt zu Dev-Config. | Production: MQTT-User fuer Exporter |

**Showstopper:** Keine identifiziert.

---

## 6. Zusammenfassung fuer Go/No-Go

### Was bekommen wir?

- **ESP32-Fleet-Gesundheit in Echtzeit** (nicht nur Server-seitig via DB-Query alle 15s)
- **Message-Loss-Detection** (publish_dropped muss 0 sein)
- **Broker-Performance-Baseline** (Message-Rates, Bandwidth, Heap)
- **Alerting-Grundlage** fuer Auftrag 3-2 (Grafana Alerting)

### Was kostet es?

- ~15 Zeilen docker-compose + ~6 Zeilen prometheus.yml
- 3.2 MB Disk + ~5-10 MB RAM
- Kein Eingriff in Mosquitto-Config
- ~30 Minuten Implementierung + Dashboard-Panels

### Empfehlung

**Go.** Der `sapcc/mosquitto-exporter` ist der einzige ernstzunehmende Kandidat fuer Broker-Metriken via `$SYS`. Die Integration ist minimal-invasiv und schliesst den groessten Blind Spot im aktuellen Monitoring-Stack: den MQTT-Broker.

---

*Dieser Report dient als Entscheidungsgrundlage. Implementierung erfolgt nach Go-Entscheidung durch den TM.*

---

## 6. mosquitto-exporter-impl-plan.md

# Mosquitto Exporter -- Verifikation & Implementierungsplan

**Datum:** 2026-02-09
**Auftrag:** 3.1 (Phase 2: Verify & Plan)
**Basis:** mosquitto-exporter-analysis.md (Erstanalyse)
**Status:** Implementierungsfertig

---

## 1. Verifikation der Erstanalyse

### 1.1 Korrekturen (Erstanalyse-Fehler)

| # | Erstanalyse behauptet | Realitaet | Schwere |
|---|----------------------|-----------|---------|
| **K1** | Image-Tag: `v0.8.0` | Tag heisst `0.8.0` (OHNE `v`-Prefix). `v0.8.0` existiert NICHT auf Docker Hub und wuerde `docker pull` fehlschlagen lassen. | **KRITISCH** |
| **K2** | Message-Rate ~300 msg/s "ungewoehnlich, Baseline nach Clean-Restart ermitteln" | Rate ist **konsistent** (jetzt 292.27 msg/s received, 380.34 msg/s sent). Kein Snapshot-Artefakt. Ursache: God-Kaiser-Server hat interne Publish-Loops (Heartbeat, Simulation, Status-Updates). | Niedrig (korrekte Baseline) |
| **K3** | Stack hat "9 Services" | Stack hat 9 service-Definitionen in docker-compose.yml. Korrekt. | Keins (war richtig) |

### 1.2 Bestaetigte Annahmen

| # | Annahme | Verifikation | Status |
|---|---------|-------------|--------|
| B1 | Mosquitto Version 2.0.22 | `$SYS/broker/version` = "mosquitto version 2.0.22" | OK |
| B2 | $SYS vollstaendig aktiv | Alle abgefragten $SYS-Topics liefern Werte | OK |
| B3 | Image auf Docker Hub | `docker pull sapcc/mosquitto-exporter:latest` erfolgreich, 3.33 MB | OK |
| B4 | Image-Version 0.8.0 | `--help` zeigt "VERSION: 0.8.0 (e268064), go1.17.2" | OK |
| B5 | Port 9234 | `--bind-address` default "0.0.0.0:9234" | OK |
| B6 | Env-Variable BROKER_ENDPOINT | `[$BROKER_ENDPOINT]` bestaetigt | OK |
| B7 | scratch-Image, kein Healthcheck moeglich | Image enthaelt nur Go-Binary, keine Shell | OK |
| B8 | `latest` und `0.8.0` identisch | Gleicher Digest: `sha256:241570341cd...` | OK |
| B9 | Dropped Messages = 0 | `$SYS/broker/publish/messages/dropped` = 0 | OK |
| B10 | Kein Eingriff in Mosquitto-Config noetig | Exporter liest nur $SYS via MQTT-Subscription | OK |

---

## 2. MQTT-Baseline-Snapshot

**Zeitpunkt:** 2026-02-09, Broker-Uptime 13431s (~3.7h)

### 2.1 Clients

| Metrik | $SYS-Topic | Wert |
|--------|-----------|------|
| Connected | `$SYS/broker/clients/connected` | **1** |
| Total | `$SYS/broker/clients/total` | **1** |
| Disconnected | (connected - total) | **0** |

**Einziger Client:** God-Kaiser-Server (el-servador). Keine ESPs verbunden (Dev-Modus ohne Hardware).

### 2.2 Message-Raten (1min Average)

| Metrik | $SYS-Topic | Wert |
|--------|-----------|------|
| Received | `$SYS/broker/load/messages/received/1min` | **292.27 msg/s** |
| Sent | `$SYS/broker/load/messages/sent/1min` | **380.34 msg/s** |
| Dropped | `$SYS/broker/publish/messages/dropped` | **0** |

**Analyse:** ~292 msg/s bei 1 Client ist die normale Server-Baseline. Der Server published intern:
- Heartbeat-Messages (zyklisch)
- SimulationScheduler-Updates (Mock-ESPs)
- Status-Broadcasts
- $SYS-Subscription-Responses erhoehen "sent" zusaetzlich

Dies ist der **Referenzwert fuer "nur Server, keine ESPs"**. Mit echten ESPs steigen beide Werte.

### 2.3 Store & Subscriptions

| Metrik | $SYS-Topic | Wert |
|--------|-----------|------|
| Messages Stored | `$SYS/broker/messages/stored` | **51** |
| Retained Messages | `$SYS/broker/retained messages/count` | **51** |
| Subscriptions | `$SYS/broker/subscriptions/count` | **16** |

### 2.4 Broker-Health

| Metrik | Wert |
|--------|------|
| Version | mosquitto 2.0.22 |
| Uptime | 13431 seconds |
| Dropped Messages | 0 |

---

## 3. Offene Punkte -- Entscheidungen

### 3.1 Message-Rate: Geklaert

Die ~300 msg/s sind die **stabile Server-Baseline**, kein Artefakt. Der Exporter wird diesen Wert korrekt als `broker_load_messages_received_1min` exportieren. Mit ESPs wird der Wert proportional steigen -- ideal fuer Fleet-Health-Monitoring.

### 3.2 Healthcheck: Kein Workaround noetig

**Entscheidung: Kein Healthcheck fuer mosquitto-exporter.**

Begruendung:
- scratch-Image hat keine Shell/wget/curl -- Standard-Pattern unmoeglich
- `up{job="mqtt-broker"}` in Prometheus ist der implizite Health-Indikator (scraped alle 15s)
- `depends_on: mqtt-broker: condition: service_healthy` stellt sicher, dass der Exporter erst nach dem Broker startet
- Das bestehende `postgres-exporter` hat einen Healthcheck weil dessen Image wget enthaelt -- kein Widerspruch

Folgt dem Pattern: Healthcheck nur wenn Image es unterstuetzt.

### 3.3 Dashboard-Strategie: In system-health.json, neue Row

**Entscheidung: MQTT-Panels in system-health.json einfuegen (keine separate Datei).**

Begruendung:
- system-health.json ist das zentrale Health-Dashboard -- MQTT-Broker-Health gehoert dazu
- Eine Row "MQTT Broker Metrics" separiert visuell von den bestehenden Panels
- 4 Tier-1-Panels (3 Stats + 1 Timeseries) sind kompakt genug
- Separates Dashboard wuerde Navigation erfordern und den Ueberblick fragmentieren

### 3.4 Image-Tag: `0.8.0` statt `latest`

**Entscheidung: Pinned auf `0.8.0`.**

Begruendung:
- `latest` und `0.8.0` sind identisch (gleicher Digest)
- Explicit Pinning verhindert ueberraschende Updates
- Folgt dem Pattern der anderen Services (`postgres:16-alpine`, `prom/prometheus:v3.2.1`, etc.)

---

## 4. Implementierungsplan

### 4.1 Uebersicht

| Schritt | Datei | Aenderung |
|---------|-------|-----------|
| 1 | `docker-compose.yml` | Service-Block einfuegen (nach Zeile 306) |
| 2 | `docker/prometheus/prometheus.yml` | scrape_config einfuegen (nach Zeile 23) |
| 3 | `docker/grafana/provisioning/dashboards/system-health.json` | 5 Panels einfuegen (IDs 7-11) |
| 4 | Verifikation | Container starten, Metriken pruefen |

### 4.2 Schritt 1: docker-compose.yml

**Einfuegen nach Zeile 306** (nach dem letzten logging-Block von postgres-exporter, VOR der leeren Zeile und dem Volumes-Kommentar bei Zeile 308).

```yaml

  # ============================================
  # Mosquitto Exporter (Prometheus Metrics) - Profile: monitoring
  # ============================================
  mosquitto-exporter:
    image: sapcc/mosquitto-exporter:0.8.0
    container_name: automationone-mosquitto-exporter
    profiles: ["monitoring"]
    environment:
      BROKER_ENDPOINT: "tcp://mqtt-broker:1883"
    ports:
      - "9234:9234"
    depends_on:
      mqtt-broker:
        condition: service_healthy
    networks:
      - automationone-net
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

**Kein Healthcheck** (scratch-Image, siehe 3.2).
**Kein Volume** (Exporter ist stateless, liest nur $SYS via MQTT).

**Edit-Anweisung fuer Dev-Agent:**
```
old_string (Zeile 307-308):

# ============================================
# Volumes

new_string:

  # ============================================
  # Mosquitto Exporter (Prometheus Metrics) - Profile: monitoring
  # ============================================
  mosquitto-exporter:
    image: sapcc/mosquitto-exporter:0.8.0
    container_name: automationone-mosquitto-exporter
    profiles: ["monitoring"]
    environment:
      BROKER_ENDPOINT: "tcp://mqtt-broker:1883"
    ports:
      - "9234:9234"
    depends_on:
      mqtt-broker:
        condition: service_healthy
    networks:
      - automationone-net
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"

# ============================================
# Volumes
```

### 4.3 Schritt 2: docker/prometheus/prometheus.yml

**Einfuegen nach Zeile 23** (nach dem letzten scrape_config-Block `prometheus`).

```yaml

  - job_name: 'mqtt-broker'
    static_configs:
      - targets: ['mosquitto-exporter:9234']
        labels:
          service: 'mqtt-broker'
          environment: 'development'
```

**Job-Name:** `mqtt-broker` (benennt den gescrapten Service, nicht den Exporter -- analog zu `postgres` Job der auf `postgres-exporter:9187` zeigt).

**Edit-Anweisung fuer Dev-Agent:**
```
old_string (Zeile 21-23):
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

new_string:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'mqtt-broker'
    static_configs:
      - targets: ['mosquitto-exporter:9234']
        labels:
          service: 'mqtt-broker'
          environment: 'development'
```

### 4.4 Schritt 3: docker/grafana/provisioning/dashboards/system-health.json

**Einfuegen nach dem letzten Panel (ID 6, "Recent Error Logs")** -- vor dem schliessenden `]` der panels-Array.

5 neue Panels (IDs 7-11):

**Panel 7 -- Row Separator:**
```json
{
  "title": "MQTT Broker Metrics",
  "type": "row",
  "gridPos": { "h": 1, "w": 24, "x": 0, "y": 12 },
  "id": 7,
  "collapsed": false,
  "panels": []
}
```

**Panel 8 -- MQTT Broker Up (Stat):**
```json
{
  "title": "MQTT Broker Up",
  "type": "stat",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 4, "w": 6, "x": 0, "y": 13 },
  "id": 8,
  "targets": [
    {
      "expr": "up{job=\"mqtt-broker\"}",
      "legendFormat": "Broker",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "mappings": [
        {
          "options": {
            "0": { "text": "DOWN", "color": "red" },
            "1": { "text": "UP", "color": "green" }
          },
          "type": "value"
        }
      ],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "green", "value": 1 }
        ]
      }
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "none",
    "justifyMode": "auto",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  }
}
```

**Panel 9 -- Connected Clients / ESP Fleet Health (Stat):**
```json
{
  "title": "Connected Clients",
  "type": "stat",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 4, "w": 6, "x": 6, "y": 13 },
  "id": 9,
  "targets": [
    {
      "expr": "broker_clients_connected{job=\"mqtt-broker\"}",
      "legendFormat": "Clients",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "orange", "value": 1 },
          { "color": "green", "value": 2 }
        ]
      }
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "none",
    "justifyMode": "auto",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  }
}
```

**Panel 10 -- Messages Dropped (Stat):**
```json
{
  "title": "Messages Dropped",
  "type": "stat",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 4, "w": 6, "x": 12, "y": 13 },
  "id": 10,
  "targets": [
    {
      "expr": "broker_publish_messages_dropped{job=\"mqtt-broker\"}",
      "legendFormat": "Dropped",
      "refId": "A"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "red", "value": 1 }
        ]
      }
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "none",
    "justifyMode": "auto",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  }
}
```

**Panel 11 -- Message Rate (Timeseries):**
```json
{
  "title": "MQTT Message Rate",
  "type": "timeseries",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "gridPos": { "h": 8, "w": 24, "x": 0, "y": 17 },
  "id": 11,
  "targets": [
    {
      "expr": "rate(broker_messages_received{job=\"mqtt-broker\"}[5m])",
      "legendFormat": "Received/s",
      "refId": "A"
    },
    {
      "expr": "rate(broker_messages_sent{job=\"mqtt-broker\"}[5m])",
      "legendFormat": "Sent/s",
      "refId": "B"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "palette-classic" },
      "custom": {
        "axisCenteredZero": false,
        "axisColorMode": "text",
        "axisLabel": "Messages/s",
        "axisPlacement": "auto",
        "drawStyle": "line",
        "fillOpacity": 10,
        "gradientMode": "none",
        "lineInterpolation": "smooth",
        "lineWidth": 2,
        "pointSize": 5,
        "showPoints": "never",
        "spanNulls": false
      },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [{ "color": "green", "value": null }]
      },
      "unit": "short"
    },
    "overrides": []
  },
  "options": {
    "legend": {
      "calcs": ["mean", "max"],
      "displayMode": "list",
      "placement": "bottom",
      "showLegend": true
    },
    "tooltip": { "mode": "multi", "sort": "desc" }
  }
}
```

**Edit-Anweisung fuer Dev-Agent:**

Die 5 Panel-Objekte werden als Komma-separierte JSON-Objekte nach dem letzten Panel (ID 6) eingefuegt. Suche nach dem schliessenden `}` von Panel 6 (Zeile 401) und fuege die neuen Panels vor dem `]` bei Zeile 402 ein.

```
old_string:
      }
    }
  ],
  "schemaVersion": 39,

new_string:
      }
    },
    {PANEL_7_JSON},
    {PANEL_8_JSON},
    {PANEL_9_JSON},
    {PANEL_10_JSON},
    {PANEL_11_JSON}
  ],
  "schemaVersion": 39,
```

(Dev-Agent muss die vollstaendigen Panel-JSON-Bloecke von oben einsetzen.)

### 4.5 Schritt 4: Verifikation

Nach der Implementierung folgende Commands ausfuehren:

```bash
# 1. Monitoring-Stack mit neuem Exporter starten
docker compose --profile monitoring up -d mosquitto-exporter

# 2. Pruefen ob Container laeuft
docker compose --profile monitoring ps mosquitto-exporter

# 3. Metriken-Endpoint direkt pruefen
curl -s http://localhost:9234/metrics | head -30

# 4. Spezifische Metriken pruefen
curl -s http://localhost:9234/metrics | grep broker_clients_connected
curl -s http://localhost:9234/metrics | grep broker_publish_messages_dropped
curl -s http://localhost:9234/metrics | grep broker_messages_received

# 5. Prometheus-Target pruefen (Prometheus muss laufen)
curl -s http://localhost:9090/api/v1/targets | python -m json.tool | grep mqtt-broker

# 6. Prometheus-Query testen
curl -s "http://localhost:9090/api/v1/query?query=up{job='mqtt-broker'}" | python -m json.tool
```

**Erwartete Ergebnisse:**
- Container Status: `Up` (ohne Healthcheck, daher kein "healthy")
- `/metrics` liefert Prometheus-Format mit `broker_*` Metriken
- `broker_clients_connected` >= 1 (mindestens God-Kaiser-Server)
- `broker_publish_messages_dropped` = 0
- Prometheus-Target `mqtt-broker` im Status "up"
- Grafana-Dashboard zeigt neue MQTT-Row mit 4 Panels

---

## 5. Implementierungs-Reihenfolge

| # | Aktion | Dateien | Risiko |
|---|--------|---------|--------|
| 1 | Service-Block in docker-compose.yml einfuegen | `docker-compose.yml` | Niedrig (additiv) |
| 2 | scrape_config in prometheus.yml einfuegen | `docker/prometheus/prometheus.yml` | Niedrig (additiv) |
| 3 | Dashboard-Panels in system-health.json einfuegen | `docker/grafana/provisioning/dashboards/system-health.json` | Niedrig (additiv) |
| 4 | Monitoring-Stack neustarten | - | Niedrig |
| 5 | Verifikation durchfuehren | - | Keins |

**Alle Aenderungen sind additiv** -- kein bestehender Code wird modifiziert, nur erweitert. Rollback = Zeilen entfernen.

---

## 6. Zusammenfassung

### Erstanalyse-Korrekturen

- **KRITISCH:** Image-Tag ist `0.8.0`, NICHT `v0.8.0`. Erstanalyse-Fehler haette Build gebrochen.
- **INFO:** Message-Rate ~300 msg/s ist stabile Server-Baseline, kein Artefakt.

### Entscheidungen

- **Image:** `sapcc/mosquitto-exporter:0.8.0` (pinned)
- **Healthcheck:** Keiner (scratch-Image). `up{job="mqtt-broker"}` als Proxy.
- **Dashboard:** In system-health.json, neue Row "MQTT Broker Metrics" mit 4 Tier-1-Panels.
- **Job-Name:** `mqtt-broker` (benennt den Service, nicht den Exporter).

### MQTT-Baseline (Referenzwerte VOR Exporter)

| Metrik | Wert | Bedeutung |
|--------|------|-----------|
| Clients connected | 1 | Nur God-Kaiser-Server |
| Messages received/s | 292.27 | Server-interne Publish-Loops |
| Messages sent/s | 380.34 | Received + $SYS-Responses |
| Messages dropped | 0 | Kein Datenverlust |
| Subscriptions | 16 | Server-Handler-Subscriptions |
| Stored messages | 51 | Retained Messages |
| Broker uptime | 13431s | ~3.7h seit letztem Restart |

### Verifikations-Checkliste

- [ ] `docker compose --profile monitoring ps` zeigt mosquitto-exporter als "Up"
- [ ] `curl http://localhost:9234/metrics` liefert `broker_*` Metriken
- [ ] `broker_clients_connected` >= 1
- [ ] `broker_publish_messages_dropped` = 0
- [ ] Prometheus-Target `mqtt-broker` Status "up"
- [ ] Grafana system-health Dashboard zeigt MQTT-Row

---

*Implementierungsplan vollstaendig. Dev-Agent kann ohne Rueckfragen umsetzen.*

---

## 7. pgadmin-integration-analysis.md

# pgAdmin DevTools-Profil: Erstanalyse

**Agent:** system-control (Analyse-Modus)
**Datum:** 2026-02-09
**Auftrag:** 4.1 - pgAdmin Integration Spezifikation
**Status:** VOLLSTAENDIG - Keine offenen Fragen

---

## 1. servers.json Verifikation

**Datei:** `docker/pgadmin/servers.json`

| Feld | servers.json Wert | docker-compose.yml / .env | Match |
|------|-------------------|---------------------------|-------|
| Host | `postgres` | Service-Name `postgres:` | OK |
| Port | `5432` | `ports: "5432:5432"` | OK |
| MaintenanceDB | `god_kaiser_db` | `POSTGRES_DB=god_kaiser_db` | OK |
| Username | `god_kaiser` | `POSTGRES_USER=god_kaiser` | OK |
| SSLMode | `prefer` | n/a (intern Docker-Netz) | OK (harmlos, kein SSL vorhanden) |
| PassFile | `/pgpass` | **PROBLEM** | KORREKTUR NOETIG |

### PassFile-Problem

`servers.json` referenziert `"PassFile": "/pgpass"` - diese Datei existiert nicht im Container. Zwei Optionen:

- **Option A (empfohlen):** `PassFile` Zeile entfernen. User gibt Passwort beim ersten Login ein, pgAdmin speichert es im persistenten Volume. Einfachster Ansatz fuer DevTools.
- **Option B:** pgpass-Datei erstellen und als Volume mounten. Unnoetige Komplexitaet fuer ein Dev-Tool.

### Korrigierte servers.json

```json
{
  "Servers": {
    "1": {
      "Name": "AutomationOne",
      "Group": "Servers",
      "Host": "postgres",
      "Port": 5432,
      "MaintenanceDB": "god_kaiser_db",
      "Username": "god_kaiser",
      "SSLMode": "prefer"
    }
  }
}
```

Einzige Aenderung: `PassFile` Zeile entfernt.

---

## 2. .env.example Korrektur

### IST-Zustand

Der TM-Auftrag erwaehnt `PGADMIN_EMAIL` und `PGADMIN_PASSWORD` in `.env.example`. **Diese Variablen existieren dort NICHT.** Die `.env.example` enthaelt keine pgAdmin-Variablen. Korrekturbedarf:

### SOLL-Zustand

Neuer Abschnitt in `.env.example` (nach Grafana-Sektion, Zeile 55):

```env
# =======================
# pgAdmin (Profile: devtools)
# SECURITY: Change this password! Default fallback in docker-compose: 'admin' - INSECURE!
# =======================
PGADMIN_DEFAULT_EMAIL=admin@automationone.local
PGADMIN_DEFAULT_PASSWORD=changeme
```

**Wichtig:** pgAdmin erwartet `PGADMIN_DEFAULT_EMAIL` und `PGADMIN_DEFAULT_PASSWORD` (nicht `PGADMIN_EMAIL`/`PGADMIN_PASSWORD`). Die Variablennamen sind durch das offizielle `dpage/pgadmin4` Image festgelegt.

---

## 3. Docker Service-Spezifikation

### Extrahierte Patterns aus bestehenden Monitoring-Services

| Aspekt | Monitoring-Pattern | pgAdmin-Anwendung |
|--------|-------------------|-------------------|
| Image-Pinning | Exakte Version (`grafana:11.5.2`, `prometheus:v3.2.1`) | Exakte Version pinnen |
| Container-Name | `automationone-{service}` | `automationone-pgadmin` |
| Healthcheck-Tool | `wget --no-verbose --tries=1 --spider` | Gleich |
| HC Timing | interval: 15s, timeout: 5s, retries: 5 | Gleich |
| Logging | json-file, max-size: 5m, max-file: 3 | Gleich |
| Network | `automationone-net` | Gleich |
| Restart | `unless-stopped` | Gleich |
| Profile | `profiles: ["monitoring"]` | `profiles: ["devtools"]` |
| depends_on | `condition: service_healthy` | `postgres: service_healthy` |

### Vollstaendige Service-Definition

```yaml
  # ============================================
  # pgAdmin (Database Management) - Profile: devtools
  # ============================================
  pgadmin:
    image: dpage/pgadmin4:9.3
    container_name: automationone-pgadmin
    profiles: ["devtools"]
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL:-admin@automationone.local}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD:-admin}
    volumes:
      - ./docker/pgadmin/servers.json:/pgadmin4/servers.json:ro
      - automationone-pgadmin-data:/var/lib/pgadmin
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:80/misc/ping || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks:
      - automationone-net
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

### Entscheidungen und Begruendungen

| Entscheidung | Begruendung |
|-------------|-------------|
| **Image `dpage/pgadmin4:9.3`** | Offizielles pgAdmin 4 Image. Version 9.3 ist aktuell stabil (Feb 2026). Exakt gepinnt wie Grafana/Prometheus. |
| **Port 5050:80** | pgAdmin lauscht intern auf 80. Port 5050 extern ist pgAdmin-Konvention und kollidiert mit keinem bestehenden Service. |
| **Profile `devtools`** | Eigenes Profil, nicht `monitoring`. pgAdmin ist ein Dev-Tool, kein Monitoring-Service. Ermoeglicht selektives Starten. |
| **Env-Defaults** | `admin@automationone.local` / `admin` als Fallback. Gleiche Strategie wie Grafana (`${GRAFANA_ADMIN_PASSWORD:-admin}`). |
| **Volume `automationone-pgadmin-data`** | Persistiert Einstellungen, gespeicherte Queries, Passwoerter. Named Volume wie alle anderen. |
| **servers.json read-only** | Pre-Provisioning Config. pgAdmin liest sie beim Start, weitere Aenderungen ueber UI. |
| **depends_on postgres healthy** | pgAdmin ist nutzlos ohne DB. Gleiche Strategie wie `postgres-exporter`. |
| **Kein Resource-Limit** | Kein bestehender Service hat `deploy.resources`. Konsistenz beibehalten. Bei Bedarf spaeter via `docker-compose.override.yml`. |

---

## 4. Volume-Ergaenzung

Neuer Eintrag in der `volumes:` Sektion:

```yaml
  automationone-pgadmin-data:
```

Position: Nach `automationone-promtail-positions:` (Zeile 319).

---

## 5. Makefile-Targets

### Bestehendes Pattern (monitoring)

```makefile
monitor-up:      $(COMPOSE) --profile monitoring up -d
monitor-down:    $(COMPOSE) --profile monitoring down
monitor-logs:    $(COMPOSE) --profile monitoring logs -f --tail=100
monitor-status:  $(COMPOSE) --profile monitoring ps
```

### Neue Targets (devtools)

```makefile
# ============================================
# DevTools Stack (Profile: devtools)
# ============================================
devtools-up:
	$(COMPOSE) --profile devtools up -d

devtools-down:
	$(COMPOSE) --profile devtools down

devtools-logs:
	$(COMPOSE) --profile devtools logs -f --tail=100

devtools-status:
	$(COMPOSE) --profile devtools ps
```

### Help-Sektion Ergaenzung

```
@echo ""
@echo "DevTools Stack:"
@echo "  make devtools-up     - Start devtools (pgAdmin)"
@echo "  make devtools-down   - Stop devtools stack"
@echo "  make devtools-logs   - Follow devtools logs"
@echo "  make devtools-status - DevTools container status"
```

### .PHONY Ergaenzung

Hinzufuegen: `devtools-up devtools-down devtools-logs devtools-status`

---

## 6. Platzierung im docker-compose.yml

Der neue Service-Block wird eingefuegt **nach dem postgres-exporter** (Zeile 306) und **vor der volumes-Sektion** (Zeile 308). Logische Gruppierung: alle profiled Services am Ende, devtools nach monitoring.

---

## 7. Zusammenfassung der Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `docker/pgadmin/servers.json` | `PassFile` Zeile entfernen |
| `.env.example` | pgAdmin-Sektion hinzufuegen (`PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`) |
| `docker-compose.yml` | pgadmin Service hinzufuegen (Profile: devtools) |
| `docker-compose.yml` | Volume `automationone-pgadmin-data` hinzufuegen |
| `Makefile` | 4 devtools-Targets + Help-Sektion + .PHONY |

---

## 8. Post-Implementation Checklist

- [ ] `docker compose --profile devtools config` validieren (YAML-Syntax)
- [ ] `make devtools-up` testen
- [ ] pgAdmin erreichbar unter `http://localhost:5050`
- [ ] AutomationOne-Server automatisch in der Server-Liste sichtbar
- [ ] DB-Verbindung mit Passwort-Eingabe funktioniert
- [ ] `make devtools-down` stoppt Container sauber
- [ ] Dokumentation aktualisieren: DOCKER_REFERENCE.md, SYSTEM_OPERATIONS_REFERENCE.md

---

## 9. Diskrepanz-Hinweis fuer TM

Der TM-Auftrag erwaehnte: "`.env.example` – `PGADMIN_EMAIL` und `PGADMIN_PASSWORD` definiert (aber verwaist)". **Diese Variablen existieren NICHT in `.env.example`.** Moeglicherweise waren sie in einer frueheren Version vorhanden oder befinden sich in der tatsaechlichen `.env` (nicht im Repo). Die Analyse basiert auf dem aktuellen Stand der `.env.example`.

---

## 8. pgadmin-impl-plan.md

# pgAdmin DevTools - Verifizierter Implementierungsplan

**Agent:** verify-plan + system-control
**Datum:** 2026-02-09
**Auftrag:** 4.1 - pgAdmin DevTools Verifikation & Implementierungsplan
**Status:** VERIFIZIERT - Bereit zur Implementierung

---

## Phase A: Spezifikations-Verifikation

### A1: servers.json - BESTAETIGT mit Korrektur

**Datei:** `docker/pgadmin/servers.json` (14 Zeilen)

| Feld | Wert | docker-compose.yml / .env | Status |
|------|------|---------------------------|--------|
| Host | `postgres` | Service-Name `postgres:` | OK |
| Port | `5432` | `ports: "5432:5432"` | OK |
| MaintenanceDB | `god_kaiser_db` | `POSTGRES_DB=god_kaiser_db` | OK |
| Username | `god_kaiser` | `POSTGRES_USER=god_kaiser` | OK |
| SSLMode | `prefer` | n/a (Docker-intern) | OK (harmlos) |
| PassFile | `/pgpass` | **Datei existiert nicht** | ENTFERNEN |

**Aenderung:** Zeile 10 Komma entfernen, Zeile 11 (`PassFile`) loeschen.

### A2: .env.example - BESTAETIGT

**Datei:** `.env.example` (72 Zeilen)

- **KEINE** pgAdmin-Variablen vorhanden (TM-Erstannahme war falsch, bereits korrigiert)
- Letzte Sektion: `GRAFANA_ADMIN_PASSWORD=changeme` (Zeile 55)
- Naechste Sektion: Wokwi CI (Zeile 57)
- **Einfuegepunkt:** Nach Zeile 55, vor Zeile 57

### A3: docker-compose.yml Service-Platzierung - BESTAETIGT

**Datei:** `docker-compose.yml` (328 Zeilen)

| Zeile | Inhalt |
|-------|--------|
| 283-306 | `postgres-exporter` (letzter profiled Service) |
| 307 | (leer) |
| 308-310 | Volumes-Header-Kommentar |
| 311 | `volumes:` |

**Einfuegepunkt:** Nach Zeile 306, vor Zeile 308. Zwischen postgres-exporter und Volumes-Sektion.

### A4: docker-compose.yml Volume-Platzierung - BESTAETIGT

| Zeile | Inhalt |
|-------|--------|
| 318 | `automationone-grafana-data:` |
| 319 | `automationone-promtail-positions:` |
| 320 | (leer) |

**Einfuegepunkt:** Nach Zeile 319 (letzte bestehende Volume-Deklaration).

**Konvention:** Monitoring-Volumes nutzen Format `automationone-{service}-data:` ohne explizite `name:` Property (anders als Core-Volumes postgres_data/mosquitto_data). pgAdmin folgt dem Monitoring-Pattern.

### A5: Makefile - BESTAETIGT

**Datei:** `Makefile` (150 Zeilen)

| Zeile | Inhalt |
|-------|--------|
| 7 | `.PHONY:` Deklaration (1 Zeile, alle Targets) |
| 47-51 | Monitoring Help-Sektion (letzte Help-Gruppe) |
| 52 | (leer, Ende help-Target) |
| 136-149 | Monitoring Targets (letzte Targets) |
| 150 | (leer, Ende der Datei) |

**Einfuegepunkte:**
1. Zeile 7: `.PHONY` erweitern um `devtools-up devtools-down devtools-logs devtools-status`
2. Nach Zeile 51: DevTools Help-Sektion einfuegen
3. Nach Zeile 149: DevTools Targets einfuegen

### A6: Profile `devtools` - BESTAETIGT

Profile `devtools` wird bereits in Kommentaren referenziert:
- `docker-compose.ci.yml:87-88`: `"pgadmin, loki, promtail, prometheus, grafana are excluded via their profiles (devtools, monitoring) which are not activated in CI"`
- `docker-compose.e2e.yml:106`: `"pgadmin, loki, promtail, prometheus, grafana excluded via profiles"`

**Keine Aenderungen** an CI/E2E-Dateien noetig. Die Kommentare sind bereits korrekt.

---

## Phase B: Image & Healthcheck Validierung

### B1: Image-Version - KORREKTUR ERFORDERLICH

| Aspekt | Original-Plan | Verifiziert | Quelle |
|--------|--------------|-------------|--------|
| Geplante Version | `dpage/pgadmin4:9.3` | **VERALTET** | Docker Hub, pgadmin.org |
| Aktuelle Version | - | `dpage/pgadmin4:9.12` | pgadmin.org Release Notes (05.02.2026) |

**KRITISCH - Sicherheitsluecken in 9.3:**
- **CVE-2025-12762** (9.10): Remote Code Execution bei PLAIN-Format SQL Restore
- **CVE-2025-12763** (9.10): Command Injection auf Windows
- **CVE-2026-1707** (9.12): Secret Key Exposure im Process Watcher

**Empfehlung:** Version auf `9.12` aendern. Zwingend fuer industrielles Niveau.

### B2: Healthcheck-Pfad - BESTAETIGT

| Aspekt | Wert | Status |
|--------|------|--------|
| Endpoint | `/misc/ping` | OK - Offizieller pgAdmin Healthcheck-Endpoint |
| Response | HTTP 200, Body: "PING" | OK - Leichtgewichtig, keine Session-Erstellung |
| Tool | `wget` | OK - In Alpine (pgAdmin Base-Image) verfuegbar |
| Interner Port | 80 | OK - pgAdmin Default (PGADMIN_LISTEN_PORT=80) |

**Healthcheck-Befehl (final):**
```
wget --no-verbose --tries=1 --spider http://localhost:80/misc/ping || exit 1
```

Konsistent mit Monitoring-Pattern (Loki: `/ready`, Prometheus: `/-/healthy`, Grafana: `/api/health`).

### B3: Port-Mapping - BESTAETIGT

| Aspekt | Wert |
|--------|------|
| Intern (Container) | 80 |
| Extern (Host) | 5050 |
| Kollidiert mit | Nichts (kein Service auf 5050) |

---

## Phase C: Implementierungsplan

### Schritt 1: servers.json bearbeiten

**Datei:** `docker/pgadmin/servers.json`

```diff
  {
    "Servers": {
      "1": {
        "Name": "AutomationOne",
        "Group": "Servers",
        "Host": "postgres",
        "Port": 5432,
        "MaintenanceDB": "god_kaiser_db",
        "Username": "god_kaiser",
-       "SSLMode": "prefer",
-       "PassFile": "/pgpass"
+       "SSLMode": "prefer"
      }
    }
  }
```

### Schritt 2: .env.example erweitern

**Datei:** `.env.example`
**Einfuegen nach Zeile 55** (nach `GRAFANA_ADMIN_PASSWORD=changeme`):

```env

# =======================
# pgAdmin (Profile: devtools)
# SECURITY: Change this password! Default fallback in docker-compose: 'admin' - INSECURE!
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(16))"
# =======================
PGADMIN_DEFAULT_EMAIL=admin@automationone.local
PGADMIN_DEFAULT_PASSWORD=changeme
```

### Schritt 3: docker-compose.yml Service einfuegen

**Datei:** `docker-compose.yml`
**Einfuegen nach Zeile 306** (nach postgres-exporter logging-Block, vor Volumes-Header):

```yaml

  # ============================================
  # pgAdmin (Database Management) - Profile: devtools
  # ============================================
  pgadmin:
    image: dpage/pgadmin4:9.12
    container_name: automationone-pgadmin
    profiles: ["devtools"]
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL:-admin@automationone.local}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD:-admin}
    volumes:
      - ./docker/pgadmin/servers.json:/pgadmin4/servers.json:ro
      - automationone-pgadmin-data:/var/lib/pgadmin
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:80/misc/ping || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks:
      - automationone-net
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

**Pattern-Konsistenz mit bestehenden Services:**
- Image-Pinning: Exakte Version wie Grafana (11.5.2), Prometheus (v3.2.1)
- Container-Name: `automationone-pgadmin` (automationone-{service} Pattern)
- Healthcheck: `wget --no-verbose --tries=1 --spider` (identisch mit Loki, Prometheus, Grafana, postgres-exporter)
- Healthcheck-Timing: interval 15s, timeout 5s, retries 5 (identisch mit allen Monitoring-Services)
- Logging: json-file, 5m/3 (identisch mit allen Monitoring-Services)
- Restart: unless-stopped (identisch mit allen Services)
- Network: automationone-net (identisch mit allen Services)
- depends_on: postgres healthy (wie postgres-exporter)

### Schritt 4: docker-compose.yml Volume einfuegen

**Datei:** `docker-compose.yml`
**Einfuegen nach Zeile 319** (nach `automationone-promtail-positions:`):

```yaml
  automationone-pgadmin-data:
```

### Schritt 5: Makefile aktualisieren

**Datei:** `Makefile`

**5a: .PHONY erweitern (Zeile 7)**

```diff
- .PHONY: help up down dev dev-down test test-down build clean e2e-up e2e-down e2e-test e2e-test-ui logs logs-server logs-mqtt logs-frontend logs-db shell-server shell-db db-migrate db-rollback db-status db-backup db-restore mqtt-sub status health monitor-up monitor-down monitor-logs monitor-status
+ .PHONY: help up down dev dev-down test test-down build clean e2e-up e2e-down e2e-test e2e-test-ui logs logs-server logs-mqtt logs-frontend logs-db shell-server shell-db db-migrate db-rollback db-status db-backup db-restore mqtt-sub status health monitor-up monitor-down monitor-logs monitor-status devtools-up devtools-down devtools-logs devtools-status
```

**5b: Help-Sektion einfuegen (nach Zeile 51)**

```makefile
	@echo ""
	@echo "DevTools Stack:"
	@echo "  make devtools-up     - Start devtools (pgAdmin)"
	@echo "  make devtools-down   - Stop devtools stack"
	@echo "  make devtools-logs   - Follow devtools logs"
	@echo "  make devtools-status - DevTools container status"
```

**5c: Targets einfuegen (nach Zeile 149, Ende der Datei)**

```makefile

# ============================================
# DevTools Stack (Profile: devtools)
# ============================================
devtools-up:
	$(COMPOSE) --profile devtools up -d

devtools-down:
	$(COMPOSE) --profile devtools down

devtools-logs:
	$(COMPOSE) --profile devtools logs -f --tail=100

devtools-status:
	$(COMPOSE) --profile devtools ps
```

---

## Implementierungsreihenfolge

| # | Datei | Aenderung | Abhaengigkeit |
|---|-------|-----------|---------------|
| 1 | `docker/pgadmin/servers.json` | PassFile entfernen | Keine |
| 2 | `.env.example` | pgAdmin-Sektion hinzufuegen | Keine |
| 3 | `docker-compose.yml` | pgadmin Service-Block | servers.json (Schritt 1) |
| 4 | `docker-compose.yml` | Volume hinzufuegen | Service-Block (Schritt 3) |
| 5 | `Makefile` | .PHONY + Help + Targets | docker-compose.yml (Schritt 3-4) |

Schritte 1+2 sind unabhaengig und koennen parallel erfolgen. Schritte 3+4 gehoeren zusammen (eine Edit-Session). Schritt 5 nach 3+4.

---

## Verifikations-Checkliste

### Syntax-Validierung (vor Start)
```bash
docker compose --profile devtools config --quiet
```
Muss ohne Fehler durchlaufen.

### Funktions-Test
```bash
# 1. pgAdmin starten
make devtools-up

# 2. Container-Status pruefen
make devtools-status
# Erwartung: pgadmin Up (healthy)

# 3. Healthcheck pruefen
docker inspect automationone-pgadmin --format='{{json .State.Health.Status}}'
# Erwartung: "healthy"

# 4. Browser-Test
# http://localhost:5050
# Login: admin@automationone.local / changeme (oder Werte aus .env)
# AutomationOne-Server muss in Server-Liste sichtbar sein

# 5. DB-Verbindung testen
# Im Browser: Klick auf AutomationOne Server
# Passwort eingeben (POSTGRES_PASSWORD aus .env)
# god_kaiser_db muss sichtbar sein mit allen Tabellen

# 6. Sauberer Shutdown
make devtools-down
```

### Keine Seiteneffekte
```bash
# Core-Stack darf nicht betroffen sein
make status
# Erwartung: Alle Core-Services unveraendert

# Monitoring-Stack darf nicht betroffen sein
make monitor-status
# Erwartung: Wie zuvor (laufend oder gestoppt)
```

---

## Dokumentations-Updates (nach Implementation)

| Datei | Aenderung |
|-------|-----------|
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | pgAdmin Service, Volume, Makefile-Targets, Port 5050 |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | DevTools-Commands |
| `.claude/CLAUDE.md` | Falls Service-Zaehlung erwaehnt wird |

---

## Zusammenfassung der Korrekturen gegenueber Erstanalyse

| Punkt | Erstanalyse | Korrektur | Grund |
|-------|------------|-----------|-------|
| Image-Version | `9.3` | **`9.12`** | 3 CVEs gefixt (RCE, Command Injection, Secret Exposure) |
| .env-Kommentar | Fehlte | `Generate with: python -c ...` hinzugefuegt | Konsistenz mit Grafana-Sektion |
| Alle anderen Punkte | Korrekt | Bestaetigt | Exakte Zeilennummern verifiziert |

---

*Quellen: [pgAdmin Release Notes](https://www.pgadmin.org/docs/pgadmin4/latest/release_notes.html), [pgAdmin Container Deployment](https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment.html), [Docker Hub dpage/pgadmin4](https://hub.docker.com/r/dpage/pgadmin4)*

---

## Priorisierte Problemliste

### KRITISCH
- **mosquitto-exporter (Report 6):** Image-Tag `v0.8.0` existiert nicht auf Docker Hub; korrekt ist `0.8.0` (ohne `v`). Verwendung von `v0.8.0` würde `docker pull` fehlschlagen lassen.
- **pgAdmin (Report 8):** Image-Version `9.3` weist Sicherheitslücken auf (CVE-2025-12762 RCE, CVE-2025-12763 Command Injection, CVE-2026-1707 Secret Exposure). Implementierungsplan korrigiert auf **9.12**.

### WARNUNG
- **Frontend Logging (Reports 1–2):** Kein Log-Level-Gate; alle 241 Console-Calls laufen in Production. `VITE_LOG_LEVEL` definiert, aber nicht genutzt. 6 `[DEBUG]`-Artefakte in SystemMonitorView.vue sollten entfernt werden.
- **Frontend Logging:** `window.onerror` fehlt (Runtime-Errors außerhalb Vue/Promise werden nicht erfasst).
- **pgAdmin (Report 7):** `servers.json` referenziert `PassFile: /pgpass` – Datei existiert nicht. Impl-Plan: Zeile entfernen.
- **Grafana Alerting (Report 4):** SMTP nicht konfiguriert; Grafana loggt Default-Email-Fehler (in Phase 1 UI-only harmlos).

### INFO
- **Grafana Alerting:** Phase 1 implementiert (5 Alert-Rules, File-Provisioning). Phase 2 (Webhook → Server, Audit-Log, WebSocket) nicht umgesetzt.
- **Mosquitto Exporter:** Message-Rate ~300 msg/s ist stabile Server-Baseline (kein Artefakt). Healthcheck für Exporter bewusst weggelassen (scratch-Image).
- **pgAdmin:** `.env.example` enthielt keine pgAdmin-Variablen; Sektion wurde im Plan ergänzt.
- **Frontend Logging:** Detailplan in `.claude/plans/vivid-wobbling-wilkinson.md`. Migration in 4 Batches empfohlen.
