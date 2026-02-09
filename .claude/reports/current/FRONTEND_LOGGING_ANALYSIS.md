# Frontend Logging Analyse

**Erstellt:** 2026-02-09
**Analysierte Quellen:** 15 Dateien (Source-Code, Docker-Config, Agent-Doku, Infra-Config)
**Methode:** Codebase-Exploration mit 3 parallelen Agents, manuelle Verifikation aller Pfade

---

## 1. Log-Quellen-Inventar

### 1.1 Existierende Log-Quellen

| # | Log-Quelle | Existiert | Format | Pfad / Zugriff | Inhalt |
|---|------------|-----------|--------|----------------|--------|
| 1 | **Docker Container stdout/stderr** | Ja | json-file (Docker-Driver) | `docker compose logs el-frontend` | Vite HMR, Compile-Output, console.* vom App-Code |
| 2 | **Loki (via Promtail)** | Ja | Auto-ingested via Docker Socket | `curl http://localhost:3100/loki/api/v1/query_range` oder Grafana UI | Selber Inhalt wie #1, aber durchsuchbar + 7 Tage Retention |
| 3 | **Grafana Dashboard** | Ja | Visualisierung | `http://localhost:3000` (Panel 5: Log Volume, Panel 6: Error Logs) | Aggregierte Sicht auf alle Container-Logs inkl. Frontend |
| 4 | **Browser Console** | Ja (immer) | Unstrukturiert | Nur Browser DevTools (F12) | Runtime-Errors, Vue Warnings, console.* Aufrufe |
| 5 | **Vitest Coverage** | Ja | HTML + JSON + Text | `logs/frontend/vitest/coverage/` | Code-Coverage nach Unit-Test-Runs |
| 6 | **Playwright Reports** | Ja | HTML + Screenshots + Video | `logs/frontend/playwright/playwright-report/` | E2E-Test-Ergebnisse, Failure-Screenshots |
| 7 | **Playwright Artefakte** | Ja | Trace + Video + Screenshots | `logs/frontend/playwright/test-results/` | Test-Artefakte (bei Retry/Failure) |

### 1.2 Nicht-existierende Log-Quellen

| # | Log-Quelle | Status | Detail |
|---|------------|--------|--------|
| 8 | **`logs/frontend/` App-Log-Datei** | Verzeichnis existiert, **LEER** | Kein Volume-Mount vom Container, keine App schreibt dorthin |
| 9 | **`logs/current/frontend_container.log`** | Nur nach `session.sh` | Wird von `scripts/debug/start_session.sh` via `docker compose logs` Snapshot erstellt |
| 10 | **`logs/current/frontend_loki.log`** | Nur mit Monitoring-Profil | Wird von `session.sh` nur erstellt wenn Loki erreichbar ist |
| 11 | **Prometheus Frontend-Metriken** | Panel konfiguriert, **kein Exporter** | Grafana Panel 4 zeigt `up{job="el-frontend"}` - aber kein Prometheus-Target konfiguriert |

### 1.3 Docker Logging-Konfiguration

**Quelle:** `docker-compose.yml` (Zeile 125-129)

```yaml
el-frontend:
  logging:
    driver: json-file
    options:
      max-size: "5m"
      max-file: "3"
```

- **Driver:** `json-file` (Docker-Standard)
- **Rotation:** 5 MB pro Datei, max 3 Dateien = **15 MB max**
- **Physischer Pfad:** `/var/lib/docker/containers/<container-id>/` (Docker-verwaltet)
- **Zugriff:** `docker compose logs el-frontend` oder Promtail Auto-Ingestion

### 1.4 Promtail/Loki Pipeline

**Quelle:** `docker/promtail/config.yml`

```
Docker Socket → Promtail (Service Discovery) → Loki (HTTP Push :3100)
                Label: service=el-frontend       Retention: 168h (7 Tage)
                Label: container=automationone-frontend
                Label: stream=stdout|stderr
```

**Wichtig:** Promtail erfasst **automatisch alle Container** mit Label `com.docker.compose.project=auto-one`. Das Frontend ist inkludiert - die Logs sind in Loki verfuegbar und ueber Grafana durchsuchbar.

---

## 2. IST vs SOLL: Vergleich mit Server-Pattern

### 2.1 Server-Referenz-Pattern (SOLL-Standard)

**Quelle:** `El Servador/god_kaiser_server/src/core/logging_config.py`

| Aspekt | Server-Implementierung |
|--------|----------------------|
| **Library** | Python `logging` mit custom `JSONFormatter` |
| **File-Format** | JSON: `timestamp`, `level`, `logger`, `message`, `module`, `function`, `line`, `request_id` |
| **Console-Format** | Text: `%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] - %(message)s` |
| **File-Handler** | `RotatingFileHandler`: 10 MB, 10 Backups → `logs/server/god_kaiser.log` |
| **Request-Tracing** | `RequestIdFilter` fuegt `request_id` zu jedem Log-Record hinzu |
| **Level-Control** | Via Env-Var `LOG_LEVEL` (Default: INFO) |
| **Noise-Reduction** | Externe Libraries (paho.mqtt, urllib3, asyncio) auf WARNING gesetzt |
| **Volume-Mount** | `./logs/server:/app/logs` im docker-compose.yml |

### 2.2 Frontend IST-Zustand

| Aspekt | Frontend-Implementierung | Gap |
|--------|-------------------------|-----|
| **Logger-Service** | Keiner - 242 verteilte `console.*` Aufrufe | Kein zentraler Logger |
| **File-Format** | Kein Log-File (nur Docker stdout) | Keine persistente Datei |
| **Console-Format** | Gemischt: Teils JSON-Objekte, teils Klartext, teils CSS-styled | Inkonsistent |
| **File-Handler** | Nicht vorhanden | Kein Volume-Mount, kein Schreib-Ziel |
| **Request-Tracing** | Nicht vorhanden | Keine Korrelations-IDs |
| **Level-Control** | Hartcodiert - kein Runtime-Toggle | Keine Env-Var fuer Log-Level |
| **Noise-Reduction** | Nicht vorhanden | Alle 242 Aufrufe immer aktiv |
| **Volume-Mount** | Nicht vorhanden | `logs/frontend/` existiert aber leer |

### 2.3 Was das Frontend bereits gut macht

1. **Global Error Handler** (`El Frontend/src/main.ts`, Zeile 14-41):
   - `app.config.errorHandler` gibt JSON-Objekte mit `timestamp`, `component`, `stack` aus
   - `app.config.warnHandler` gibt JSON-Objekte mit `timestamp`, `component`, `trace` aus
   - `window.unhandledrejection` gibt JSON-Objekte mit `timestamp`, `reason`, `stack` aus
   - **Format-Beispiel:** `[Vue Error] { error: "...", stack: "...", component: "...", timestamp: "2026-..." }`

2. **WebSocket-Service Debug-Flag** (`El Frontend/src/services/websocket.ts`):
   - 25+ Logging-Stellen mit `[WebSocket]` Prefix
   - Eingebautes DEBUG-Flag fuer detailliertes Message-Logging
   - Rate-Limiting-Tracking (>10 msg/s Warnung)
   - Token-Lifecycle-Logging (Refresh, Expiry, Reconnect)

3. **DragState Store Debug-Logger** (`El Frontend/src/stores/dragState.ts`):
   - Custom `log()` Funktion mit CSS-Styling und DEBUG-Flag
   - Prefix: `[DragState]` mit violettem Hintergrund

### 2.4 Console-Nutzung Aufschluesselung

**Gesamtanzahl: 242 Aufrufe**

| Typ | Anzahl | Hauptquellen |
|-----|--------|-------------|
| `console.error()` | 84 | WebSocket (9), Stores (15+), Composables (10+), main.ts (3) |
| `console.log()` | 71 | WebSocket (15+), DragState (10+), esp Store (5+) |
| `console.warn()` | 35 | WebSocket (2), DragState (1), Stores (5+) |
| `console.debug()` | 28 | WebSocket (3+), DragState (5+) |
| **Total** | **242** | |

---

## 3. Agent-IST-Vergleich

### 3.1 Was der frontend-debug Agent aktuell ueber Log-Quellen weiss

**Quellen:** `.claude/agents/frontend/frontend-debug-agent.md` + `.claude/skills/frontend-debug/SKILL.md`

| Agent-Wissen | Korrekt? | Detail |
|-------------|----------|--------|
| Browser Console ist Blind Spot | **Korrekt** | Ehrlich dokumentiert mit Kompensations-Strategien |
| Docker-Logs via `docker compose logs` | **Korrekt** | Korrekte Befehle dokumentiert |
| Health-Endpoints als Proxy | **Korrekt** | `curl` Befehle fuer `/health/live` und `/health/detailed` |
| Server-Log Grep-Patterns | **Korrekt** | `grep "broadcast\|websocket" logs/server/god_kaiser.log` |
| Lastintensive Ops mit Bestaetigung | **Korrekt** | `vue-tsc`, `npm run build`, `vitest` korrekt als lastintensiv markiert |

### 3.2 Was der Agent NICHT weiss (Gaps)

| # | Gap | Schwere | Detail |
|---|-----|---------|--------|
| **G1** | **Loki-Integration unbekannt** | **Hoch** | Frontend-Logs sind via Promtail in Loki verfuegbar. Agent koennte `curl` auf Loki API nutzen statt nur `docker compose logs`. Loki bietet: Label-Filter, Regex-Suche, Zeitfenster-Queries, Log-Aggregation |
| **G2** | **Grafana-Dashboard unbekannt** | **Hoch** | Panel 5 zeigt "Log Volume by Service" (inkl. Frontend), Panel 6 zeigt "Recent Error Logs" mit Regex `error\|exception\|fail\|critical`. Agent koennte Grafana-API nutzen |
| **G3** | **Vue Error Handler JSON-Format** | **Mittel** | Der Agent weiss DASS es einen Error Handler gibt, betont aber nicht dass der Output JSON-strukturiert ist. Fuer Docker-Log-Analyse relevant: `docker compose logs el-frontend \| grep "\[Vue Error\]"` liefert parseable JSON |
| **G4** | **`logs/current/` Dateien ephemer** | **Mittel** | Agent referenziert `logs/current/frontend_container.log` (via LOG_ACCESS_REFERENCE.md), aber diese Datei existiert NUR nach `session.sh` Ausfuehrung. Ohne `session.sh` gibt es diese Datei nicht |
| **G5** | **Test-Output-Pfade nicht dokumentiert** | **Niedrig** | Vitest Coverage → `logs/frontend/vitest/coverage/`, Playwright → `logs/frontend/playwright/`. Im Skill nicht explizit als Log-Quelle erwaehnt |
| **G6** | **Prometheus-Panel ohne Exporter** | **Niedrig** | Grafana Dashboard Panel 4 zeigt `up{job="el-frontend"}`, aber kein Prometheus scrape_config fuer Frontend existiert → Panel ist leer |

### 3.3 Agent-Befehle: Optimierungspotential

| Aktueller Befehl | Problem | Besser |
|------------------|---------|--------|
| `docker compose logs --tail=30 el-frontend` | Begrenzt auf letzte 30 Zeilen, kein Zeitfilter | Loki-Query mit Zeitfenster + Label-Filter |
| `grep "error" logs/server/god_kaiser.log` | Server-Logs sind JSON - Grep funktioniert aber Output ist schwer lesbar | `jq` fuer JSON-Parsing oder Loki-Query |
| (nicht vorhanden) | Kein Loki-Zugriff dokumentiert | `curl -G http://localhost:3100/loki/api/v1/query_range --data-urlencode 'query={service="el-frontend"} \|~ "error"'` |

---

## 4. Gap-Analyse

### Sortiert nach Prioritaet

| Prio | Gap | Kategorie | Auswirkung | Betroffene Dateien |
|------|-----|-----------|------------|-------------------|
| **1** | Loki-Zugang nicht im Agent | Agent-Wissen | Agent nutzt nur 1 von 3 verfuegbaren Log-Zugangs-Wegen | `frontend-debug-agent.md`, `SKILL.md` |
| **2** | Kein zentraler Logger-Service | Code-Architektur | 242 verteilte console-Aufrufe, inkonsistente Formate, kein Level-Control | `El Frontend/src/` (global) |
| **3** | Kein API Request/Response-Logging | Code-Luecke | Axios Interceptor (`api/index.ts`) loggt keine Requests - nur Token-Refresh. Bei API-Problemen fehlt jede Spur | `El Frontend/src/api/index.ts` |
| **4** | `logs/frontend/` leer, kein Volume-Mount | Infrastruktur | Frontend-Container hat keinen Mount zu `logs/frontend/`. Selbst wenn ein Logger existierte, wuerde er nirgendwo persistent schreiben | `docker-compose.yml` |
| **5** | Kein Prometheus-Exporter | Monitoring | Grafana-Panel konfiguriert aber leer. Keine Frontend-Metriken (Request-Count, Error-Rate, WS-Reconnects) | `docker/prometheus/prometheus.yml` |
| **6** | Production-Logging nicht kontrollierbar | DevOps | Alle 242 console-Aufrufe sind immer aktiv. Kein `LOG_LEVEL` Environment-Variable. In Production waeren die Logs ueberflutet | `El Frontend/src/` (global) |

---

## 5. Optionen & Bewertung

### 5.1 Sofort umsetzbar (0 Code-Aenderungen)

| # | Option | Aufwand | Nutzen | Pattern-Kompatibilitaet |
|---|--------|---------|--------|------------------------|
| S1 | **Agent-Doku um Loki-Queries erweitern** | 0 (nur Doku) | Hoch - Agent bekommt durchsuchbare Logs mit Zeitfilter statt nur `docker compose logs --tail=N` | Voll kompatibel |
| S2 | **Grafana-Dashboard-Zugang dokumentieren** | 0 (nur Doku) | Mittel - Visuelle Log-Analyse ueber Browser | Voll kompatibel |
| S3 | **`session.sh` um Frontend-Snapshot erweitern** | Minimal (1 Zeile) | Mittel - `docker compose logs --since=1h el-frontend > logs/current/frontend_container.log` zuverlaessiger | Voll kompatibel |

### 5.2 Quick Wins (minimaler Code-Aufwand)

| # | Option | Aufwand | Nutzen | Pattern-Kompatibilitaet |
|---|--------|---------|--------|------------------------|
| Q1 | **Axios Interceptor Request-Logging** | Klein (10 Zeilen in `api/index.ts`) | Hoch - Jeder API-Call wird geloggt: URL, Methode, Status, Dauer | Server-Pattern: aehnlich wie `request_id` Tracking |
| Q2 | **Log-Level via Env-Var** | Klein (Vite `import.meta.env.VITE_LOG_LEVEL`) | Mittel - Console-Noise in Production kontrollierbar | Server-Pattern: `LOG_LEVEL` Env-Var |
| Q3 | **Docker Volume-Mount fuer `logs/frontend/`** | Klein (2 Zeilen in `docker-compose.yml`) | Mittel - Basis fuer zukuenftiges File-Logging | Server-Pattern: `./logs/server:/app/logs` |

### 5.3 Professionelle Loesung (mittlerer Aufwand)

| # | Option | Aufwand | Nutzen | Pattern-Kompatibilitaet |
|---|--------|---------|--------|------------------------|
| P1 | **Zentraler LoggerService** | Mittel (neue Datei `src/services/logger.ts`, ~80 Zeilen) | Hoch - Einheitliches Format, Level-Control, Prefix-Tags | Direkte Uebertragung des Server-Patterns (JSONFormatter + get_logger) |
| P2 | **Error-Reporting-Endpoint** | Mittel (Server-Endpoint + Frontend-Handler) | Hoch - Browser-Errors landen im Server-Log, Agent kann sie lesen | Erweitert Server-Pattern um Frontend-Fehler |
| P3 | **Prometheus-Exporter** | Mittel (Vite-Plugin oder Custom-Middleware) | Mittel - Frontend-Metriken im Grafana-Dashboard | Ergaenzt bestehendes Prometheus-Setup |

---

## 6. Empfehlung

### Stufe 1: Sofort (0 Code-Aufwand)

**Agent-Dokumentation erweitern:**

1. **Loki-Queries in frontend-debug Agent aufnehmen:**
   ```bash
   # Frontend-Errors der letzten Stunde (Loki)
   curl -sG http://localhost:3100/loki/api/v1/query_range \
     --data-urlencode 'query={service="el-frontend"} |~ "(?i)error"' \
     --data-urlencode 'start='$(date -d '1 hour ago' +%s)'000000000' \
     --data-urlencode 'end='$(date +%s)'000000000' \
     --data-urlencode 'limit=50'

   # Vue Error Handler Output (strukturiert)
   curl -sG http://localhost:3100/loki/api/v1/query_range \
     --data-urlencode 'query={service="el-frontend"} |~ "\\[Vue Error\\]"' \
     --data-urlencode 'limit=20'

   # WebSocket-Events im Frontend
   curl -sG http://localhost:3100/loki/api/v1/query_range \
     --data-urlencode 'query={service="el-frontend"} |~ "\\[WebSocket\\]"' \
     --data-urlencode 'limit=30'
   ```

2. **Grafana-Dashboard als Analyse-Tool erwaehnen** (Port 3000, Login admin/admin)

3. **`logs/current/frontend_container.log` als ephemer markieren** - existiert nur nach `session.sh`

### Stufe 2: Quick Win (1-2 Stunden Aufwand)

**Axios Request-Logging in `api/index.ts`:**
- Request-Interceptor erweitern: URL, Methode, Timestamp loggen
- Response-Interceptor erweitern: Status-Code, Dauer loggen
- Error-Interceptor: Vollstaendige Fehler-Details loggen
- Prefix `[API]` fuer Docker-Log-Filterung

**Log-Level via Environment:**
- `VITE_LOG_LEVEL` in `.env` / docker-compose.yml
- Einfache Pruefung: `if (import.meta.env.VITE_LOG_LEVEL !== 'DEBUG') return`
- Bestehende DEBUG-Flags in WebSocket-Service und DragState harmonisieren

### Stufe 3: Professionell (1-2 Tage Aufwand)

**Zentraler LoggerService (`src/services/logger.ts`):**
- Pattern direkt vom Server uebernommen: `createLogger(name)` analog zu `get_logger(name)`
- JSON-Output mit: `timestamp`, `level`, `logger`, `message`, `context`
- Level-Hierarchie: DEBUG < INFO < WARN < ERROR
- Runtime-konfigurierbar via `VITE_LOG_LEVEL`
- Alle 242 bestehenden `console.*` Aufrufe schrittweise migrieren
- Optional: Log-Shipping via POST an Server-Endpoint fuer persistente Speicherung

---

## 7. Auswirkungen auf frontend-debug Agent

### 7.1 Sofort-Aenderungen (Agent-Doku)

**Datei: `.claude/agents/frontend/frontend-debug-agent.md`**

Ergaenzen in Section 4 (Erweiterte Faehigkeiten):

| Auffaelligkeit | Eigenstaendige Pruefung | Command |
|---------------|----------------------|---------|
| Frontend-Errors (Loki) | Log-Suche mit Zeitfenster | `curl -sG http://localhost:3100/loki/api/v1/query_range --data-urlencode 'query={service="el-frontend"} \|~ "error"' --data-urlencode 'limit=30'` |
| Vue Error Handler | Strukturierte Fehler | `curl -sG http://localhost:3100/loki/api/v1/query_range --data-urlencode 'query={service="el-frontend"} \|~ "\\[Vue Error\\]"' --data-urlencode 'limit=20'` |
| WebSocket-Events | WS-Lifecycle | `curl -sG http://localhost:3100/loki/api/v1/query_range --data-urlencode 'query={service="el-frontend"} \|~ "\\[WebSocket\\]"' --data-urlencode 'limit=30'` |
| Grafana Dashboard | Visuelle Analyse | `http://localhost:3000` (Panel 5: Log Volume, Panel 6: Errors) |

Ergaenzen in Section 3 (Blind Spots) - Abschwaechen des Browser-Console Blind Spots:

> **Update:** Waehrend die Browser Console direkt nicht lesbar ist, werden alle `console.*` Aufrufe des Vue-Codes ueber Docker stdout an Promtail/Loki weitergeleitet. Der Global Error Handler (`main.ts`) gibt strukturierte JSON-Objekte aus. Diese sind via Loki-API durchsuchbar - ein **partieller Workaround** fuer den Browser-Console Blind Spot.

**Datei: `.claude/skills/frontend-debug/SKILL.md`**

Ergaenzen in Section 7 (Docker-Setup) unter "Logging":

| Quelle | Zugriff |
|--------|---------|
| Vite Dev Server stdout/stderr | `docker compose logs el-frontend` |
| **Loki (alle Container-Logs)** | `curl Loki API` mit Label `service="el-frontend"` |
| **Grafana Dashboard** | `http://localhost:3000` (Panels 5+6) |
| Build Output | Nur bei manuellem Build |
| Browser Console (DOM-Events, User-Interaktionen) | NICHT lesbar - aber console.* Output geht via Docker → Loki |

### 7.2 Neue Analyse-Strategie fuer den Agent

**Bisherige Reihenfolge:**
1. `docker compose ps el-frontend`
2. `docker compose logs --tail=30 el-frontend`
3. Source-Code-Analyse

**Empfohlene Reihenfolge:**
1. `docker compose ps el-frontend` (Container-Status)
2. **Loki-Query** fuer Errors der letzten Stunde (umfassender als `--tail=30`)
3. **Loki-Query** fuer `[Vue Error]` und `[WebSocket]` Patterns (strukturiert)
4. `docker compose logs --tail=30 el-frontend` (Fallback wenn Loki nicht laeuft)
5. Source-Code-Analyse (unveraendert)

### 7.3 Voraussetzung

Die Loki-Queries funktionieren nur wenn das **Monitoring-Profil** aktiv ist:
```bash
docker compose --profile monitoring up -d
```

Der Agent sollte pruefen ob Loki erreichbar ist bevor er Loki-Queries absetzt:
```bash
curl -sf http://localhost:3100/ready || echo "Loki nicht verfuegbar - Fallback auf docker compose logs"
```

---

## Anhang A: Exakte Dateipfade (verifiziert)

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Frontend/src/main.ts` | 43 | Global Error Handlers (Z.14-41) |
| `El Frontend/src/services/websocket.ts` | 641 | WebSocket-Logging (25+ Stellen) |
| `El Frontend/src/api/index.ts` | 90 | API-Client ohne Request-Logging |
| `El Frontend/src/stores/dragState.ts` | ~350 | Custom Debug-Logger mit CSS-Styling |
| `El Frontend/src/stores/esp.ts` | ~2500 | Kern-Store mit verteiletem Logging |
| `El Frontend/src/stores/auth.ts` | 177 | Auth-Store mit Error-Logging |
| `El Frontend/vitest.config.ts` | 42 | Coverage → `logs/frontend/vitest/coverage/` |
| `El Frontend/playwright.config.ts` | 106 | Reports → `logs/frontend/playwright/` |
| `El Frontend/Dockerfile` | ~20 | node:20-alpine, `npm run dev --host 0.0.0.0` |
| `docker-compose.yml` | Z.120-150 | el-frontend: json-file 5m/3, kein logs/ Mount |
| `docker/promtail/config.yml` | 33 | Docker Socket Discovery → Loki |
| `docker/loki/loki-config.yml` | 33 | 7 Tage Retention, Filesystem-Storage |
| `docker/grafana/provisioning/dashboards/system-health.json` | ~300 | Panel 4: Frontend Status (leer), Panel 5: Log Volume |
| `El Servador/god_kaiser_server/src/core/logging_config.py` | 169 | Server-Referenz-Pattern |
| `.claude/agents/frontend/frontend-debug-agent.md` | 301 | Agent-Doku (Gaps G1-G6) |
| `.claude/skills/frontend-debug/SKILL.md` | 440 | Skill-Doku (Loki nicht erwaehnt) |

## Anhang B: Loki-Query Referenz

```bash
# Alle Frontend-Logs (letzte Stunde)
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service="el-frontend"}' \
  --data-urlencode 'limit=100'

# Nur Errors
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service="el-frontend"} |~ "(?i)(error|exception|fail|critical)"' \
  --data-urlencode 'limit=50'

# Vue Error Handler (JSON-strukturiert)
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service="el-frontend"} |~ "\\[Vue Error\\]"' \
  --data-urlencode 'limit=20'

# WebSocket-Lifecycle
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service="el-frontend"} |~ "\\[WebSocket\\]"' \
  --data-urlencode 'limit=30'

# API-Errors (401, 500, etc.)
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service="el-frontend"} |~ "(?i)(401|403|500|ECONNREFUSED)"' \
  --data-urlencode 'limit=20'

# Verfuegbarkeits-Check
curl -sf http://localhost:3100/ready && echo "Loki OK" || echo "Loki nicht verfuegbar"
```
