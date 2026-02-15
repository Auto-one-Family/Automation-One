# Debug-Agenten Konsolidierungsplan

**Erstellt:** 2026-02-13
**Status:** Plan (Genehmigung ausstehend)
**Grundlage:** `docs/plans/Debug.md` (Phase 5)

**Stack-Referenz:** `.claude/reference/ROADMAP_KI_MONITORING.md` (Monitoring-Labels, Alert Rules, PATTERNS.yaml-Pfad). Alle Loki-Queries und Labels an ROADMAP §1.1 (Promtail) und §2.4 (Label-Taxonomie) ausrichten.

---

## 1. Zusammenfassung

Die 5 Debug-Agenten + db-inspector + system-control + meta-analyst werden **NICHT geloescht**, sondern ihr Wissen wird in das bestehende `auto-ops` Plugin konsolidiert. auto-ops bekommt 3 spezialisierte Rollen (Backend Inspector, Frontend Inspector, Driver) die den gesamten Stack cross-layer abdecken. Die alten Agenten bleiben als Fallback erhalten.

**KI-effiziente Tools (priorisiert):** Loki als zentrale Log-Quelle (kein grep auf Bind-Mounts), Playwright MCP fuer echten Browser-Zustand (kein Blind Spot), MCP database-server statt `docker exec psql`, `debug-status.ps1` als Einstieg fuer Gesamtzustand, Fehlermuster-Referenz aus `.claude/reference/errors/PATTERNS.yaml` (ROADMAP Phase 2.3) statt neu zu beschreiben. Grafana Alert Rules (ROADMAP §2.1) und Log-Panels (§1.3) fuer Kontext nutzen.

---

## 2. Zielarchitektur: 3 Rollen in auto-ops

### Rolle 1: Backend Inspector (`/ops-inspect-backend`)

**Datenpfad:** ESP32 Serial → MQTT Traffic → Server Handler → Database

**Absorbiert Wissen aus:**
- `esp32-debug` (Boot-Sequenz, Error-Codes 1000-4999, Circuit Breaker, SafeMode)
- `mqtt-debug` (Topic-Schema, Timing, LWT, Retained, QoS, Payload-Validierung)
- `server-debug` (Handler-Logs, Error-Codes 5000-5699, Startup-Sequenz, Resilience)
- `db-inspector` (Schema, Device-Status, Sensor-Data, Orphans, Alembic)

**Neue Faehigkeiten (die alte Agenten NICHT hatten):**
- Loki-API als primaere Datenquelle (Labels: compose_service, ROADMAP §1.1) statt Bind-Mount-Files
- Historischer MQTT-Kontext via Loki: el-servador (Handler-Logs), mqtt-broker (Broker-Events)
- MCP database-server statt docker exec psql
- debug-status.ps1 als Einstiegspunkt
- Automatische Cross-Layer-Korrelation (statt nachtraeglicher meta-analyst)
- Fehlermuster-Referenz aus PATTERNS.yaml (ROADMAP Phase 2.3)

**Arbeitsweise:**
```
1. debug-status.ps1 → Gesamtzustand (JSON mit overall: ok|degraded|critical)
2. Loki: Server-Errors → {compose_service="el-servador"} |~ "ERROR|CRITICAL" (Labels: ROADMAP §1.1)
3. Loki: MQTT-Handler/ Broker → {compose_service="el-servador"} |~ "mqtt|kaiser" bzw. {compose_service="mqtt-broker"} fuer Broker-Events
4. Falls ESP Serial verfuegbar → logs/current/esp32_serial.log oder Loki {compose_service="esp32-serial-logger"}
5. MCP DB: SELECT esp_devices, sensor_data, heartbeat_logs
6. Korrelation: Timestamps ueber alle Layer abgleichen; Pattern-IDs aus PATTERNS.yaml referenzieren
7. Report: BACKEND_INSPECTION.md (EINE Datei, cross-layer)
```

### Rolle 2: Frontend Inspector (`/ops-inspect-frontend`)

**Datenpfad:** Browser → Vue Components → Pinia Stores → API Client → Server Response → Database

**Absorbiert Wissen aus:**
- `frontend-debug` (Build-Errors, WebSocket-Events, Store-Analyse, Auth-Flow)
- `server-debug` (Teilweise: API-Responses, WS-Manager-Verhalten)

**Neue Faehigkeiten (die alte Agenten NICHT hatten):**
- **Playwright MCP** fuer Browser-Zugang (ELIMINIERT den Blind Spot von frontend-debug)
  - DOM-Zustand inspizieren (browser_snapshot)
  - Console-Messages lesen (browser_console_messages)
  - Network-Requests sehen (browser_network_requests)
  - Screenshots machen (browser_take_screenshot)
  - Login automatisiert durchfuehren
- Loki: Frontend-Container-Errors, Vue Error Handler Output, API-Fehler
- Cross-Layer bis zum Server und zur DB

**Arbeitsweise:**
```
1. debug-status.ps1 → Gesamtzustand
2. Playwright: browser_navigate → http://localhost:5173
3. Playwright: browser_snapshot → DOM-Zustand
4. Playwright: browser_console_messages → Vue Errors, Warnings
5. Playwright: browser_network_requests → Failed API Calls, WS Status
6. Loki: Frontend-Errors → {compose_service="el-frontend"} |~ "error" (Labels: ROADMAP §1.1)
7. Loki: Server WS-Events → {compose_service="el-servador"} |~ "websocket|broadcast"
8. Source-Code: Betroffene Components/Stores analysieren
9. MCP DB: Datenkonsistenz pruefen
10. Report: FRONTEND_INSPECTION.md (EINE Datei, cross-layer)
```

### Rolle 3: Driver (`/ops-drive`)

**Zweck:** Traffic generieren, User-Flows durchspielen, Zustand provozieren den die Inspektoren analysieren koennen.

**Neue Faehigkeiten (komplett neu):**
- Playwright: Login, Navigation, Interaktion
- REST-API: Endpoints aufrufen, Mock-ESPs erstellen
- MQTT: Test-Messages publishen (mit User-Bestaetigung)
- Screenshots und Network-Dumps speichern

**Arbeitsweise:**
```
1. Login via Playwright (admin / Admin123#)
2. Dashboard navigieren, Screenshots
3. ESP-Devices auflisten (API)
4. Sensor-Daten provozieren (Mock-ESP oder MQTT publish)
5. Frontend-Reaktion beobachten (Playwright snapshot nach Aktion)
6. Log: DRIVER_LOG.md
```

---

## 3. Neue Plugin-Struktur

```
auto-ops/
├── .claude-plugin/plugin.json          # ERWEITERT (neue agents, commands, skills)
├── README.md                           # ERWEITERT
├── agents/
│   ├── auto-ops.md                     # ERWEITERT (3 Rollen)
│   ├── backend-inspector.md            # NEU
│   └── frontend-inspector.md           # NEU
├── commands/
│   ├── ops.md                          # BESTEHEND
│   ├── ops-diagnose.md                 # ERWEITERT (nutzt Inspektoren)
│   ├── ops-cleanup.md                  # BESTEHEND
│   ├── ops-inspect-backend.md          # NEU
│   ├── ops-inspect-frontend.md         # NEU
│   └── ops-drive.md                    # NEU
├── skills/
│   ├── system-health/SKILL.md          # ERWEITERT (Loki-Queries, debug-status.ps1)
│   ├── docker-operations/SKILL.md      # BESTEHEND
│   ├── esp32-operations/SKILL.md       # BESTEHEND
│   ├── database-operations/SKILL.md    # ERWEITERT (MCP database-server Hinweise)
│   ├── loki-queries/SKILL.md           # NEU - Zentrale Loki-Query-Bibliothek
│   ├── error-codes/SKILL.md            # NEU - ESP32 (1000-4999) + Server (5000-5699)
│   ├── mqtt-analysis/SKILL.md          # NEU - Topic-Schema, Timing, Payload-Validierung
│   ├── boot-sequences/SKILL.md         # NEU - ESP32 Boot (16 Steps), Server Startup (20+ Steps)
│   ├── frontend-patterns/SKILL.md      # NEU - 26 WS-Events, 9 Stores, Auth-Flow, Playwright-Patterns
│   └── cross-layer-correlation/SKILL.md # NEU - Timestamp-Korrelation, Kaskaden-Muster
├── hooks/hooks.json                    # ERWEITERT (Playwright-Safety, mosquitto_sub Timeout)
└── scripts/
    └── loki-helpers.sh                 # NEU - Wiederverwendbare Loki-Query-Funktionen
```

---

## 4. Detailplan pro Datei

### 4.1 Neue Agent-Definitionen

#### `agents/backend-inspector.md`
- **Frontmatter:** name, description (mit "MUST BE USED when: Daten kommen nicht an, ESP offline, MQTT-Problem, Server-Error, DB-Inkonsistenz"), tools: [Bash, Read, Grep, Glob, Write], model: sonnet
- **Inhalt:**
  - Identitaet: "Du bist der Backend Inspector fuer AutomationOne"
  - 2 Modi: A (allgemeine Cross-Layer) / B (spezifisches Problem)
  - Arbeitsreihenfolge mit Loki-first-Strategie
  - 3 Referenz-Szenarien (aus den alten Agenten uebernommen und erweitert):
    1. "Sensor-Daten kommen nicht an" (esp32-debug Szenario 1 + mqtt-debug + server-debug + DB)
    2. "ESP ist offline" (esp32-debug Szenario 3 + MQTT LWT + Server Heartbeat + DB Status)
    3. "Server-Handler crashed" (server-debug Szenario 1 + MQTT-Payload + DB-Schema)
  - Cross-Layer-Checks-Tabelle (konsolidiert aus allen 4 alten Agenten)
  - Error-Code Interpretation (1000-4999 + 5000-5699 zusammen)
  - Loki-Query-Patterns fuer jeden Layer (Label: compose_service, siehe ROADMAP §1.1; skill loki-queries)
  - MCP database-server Queries
  - Report-Format: `BACKEND_INSPECTION.md`
  - Sicherheitsregeln (konsolidiert)
  - Quick-Commands (konsolidiert, Loki-first)

#### `agents/frontend-inspector.md`
- **Frontmatter:** name, description (mit "MUST BE USED when: UI zeigt nichts, Build-Fehler, WebSocket-Problem, Auth-Fehler"), tools: [Bash, Read, Grep, Glob, Write], model: sonnet
- **Inhalt:**
  - Identitaet: "Du bist der Frontend Inspector fuer AutomationOne"
  - **KEIN Blind Spot mehr** - Playwright MCP verfuegbar
  - 2 Modi: A (allgemeine UI-Analyse) / B (spezifisches Problem)
  - Arbeitsreihenfolge mit Playwright-first-Strategie
  - 3 Referenz-Szenarien:
    1. "Dashboard zeigt keine Live-Daten" (Playwright → WS → Server → DB)
    2. "Build failed" (Docker-Logs → TS-Errors → Source-Code)
    3. "401 nach Login" (Playwright Console → Auth Store → API Interceptor → Server)
  - Playwright-Patterns (navigate, snapshot, console_messages, network_requests)
  - Loki-Queries fuer Frontend-Container-Logs
  - Source-Code-Analyse-Patterns (aus frontend-debug uebernommen)
  - Report-Format: `FRONTEND_INSPECTION.md`
  - Sicherheitsregeln (Playwright: Lesen frei, Klicken mit Bestaetigung)

### 4.2 Neue Skills

#### `skills/loki-queries/SKILL.md`
Zentrale Referenz fuer alle Loki-Queries im System. **Labels wie in ROADMAP_KI_MONITORING.md §1.1 / §2.4:** `compose_service`, `container`, `level`, `logger`, `component` (Promtail Docker SD + Parser).

```
## Server-Errors
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={compose_service="el-servador"} |~ "ERROR|CRITICAL"' \
  --data-urlencode 'limit=50'

## MQTT-Handler-Logs (Server) / Broker-Events
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={compose_service="el-servador"} |~ "mqtt|kaiser"' --data-urlencode 'limit=30'
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={compose_service="mqtt-broker"} |~ "New connection|Client .* disconnected"' \
  --data-urlencode 'limit=20'

## Frontend-Errors
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={compose_service="el-frontend"} |~ "error"' \
  --data-urlencode 'limit=20'

## PostgreSQL-Errors
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={compose_service="postgres"} |~ "ERROR|FATAL"' \
  --data-urlencode 'limit=20'

## ESP32 Serial (wenn Profile hardware aktiv)
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={compose_service="esp32-serial-logger"}' --data-urlencode 'limit=50'

## Zeitfenster (letzte N Minuten)
  --data-urlencode "start=$(date -d '-30 minutes' +%s)000000000"
  --data-urlencode "end=$(date +%s)000000000"
```

#### `skills/error-codes/SKILL.md`
Konsolidiert aus esp32-debug + server-debug. **Single Source fuer Fehlermuster:** `.claude/reference/errors/PATTERNS.yaml` (ROADMAP Phase 2.3); neue Patterns dort eintragen, Inspektoren referenzieren Pattern-IDs.

```
## ESP32 Error-Codes (1000-4999)
| Range | Kategorie | Haeufigste |
|-------|-----------|-----------|
| 1000-1999 | HARDWARE | GPIO_CONFLICT (1002), I2C_ERROR (1011), SENSOR_READ_FAILED (1040) |
| 2000-2999 | SERVICE | NVS_ERROR (2001), CONFIG_INVALID (2010) |
| 3000-3999 | COMMUNICATION | WIFI_TIMEOUT (3002), MQTT_CONNECT_FAILED (3011) |
| 4000-4999 | APPLICATION | WATCHDOG_TIMEOUT (4070), DEVICE_REJECTED (4200) |

## Server Error-Codes (5000-5699)
| Range | Kategorie | Haeufigste |
|-------|-----------|-----------|
| 5000-5099 | CONFIG | Server-Config-Fehler |
| 5100-5199 | MQTT | MQTT-Handler-Fehler |
| 5200-5299 | VALIDATION | Payload-Validierung |
| 5300-5399 | DATABASE | DB-Query-Fehler |
| 5400-5499 | SERVICE | Service-Layer-Fehler |
| 5500-5599 | WEBSOCKET | WS-Manager-Fehler |
| 5600-5699 | INTEGRATION | Cross-Service-Fehler |

## Cross-Layer Kaskaden
ESP (1040 Sensor Read Failed) → Missing MQTT Data → Server Timeout → Frontend stale
ESP (3011 MQTT Connect Failed) → LWT → Server offline-marking → Frontend stale
Server (5304 DB Connection) → Circuit Breaker OPEN → Handler fail → ESP status stale
```

#### `skills/mqtt-analysis/SKILL.md`
Konsolidiert aus mqtt-debug:
- 32 Topics mit Schema
- Payload-Pflichtfelder pro Topic-Typ
- Timing-Erwartungen (Heartbeat <90s, Response <2s, Sensor <45s)
- QoS-Zuordnung (0: Heartbeat, 1: Sensor/Status, 2: Commands)
- LWT-Verhalten, Retained-Message-Regeln
- Registration Gate (ESP blockiert bis Heartbeat-ACK)
- Mock-ESP Routing (kaiser_handler.py)

#### `skills/boot-sequences/SKILL.md`
Konsolidiert aus esp32-debug + server-debug:
- ESP32 Boot: 5 Phasen (16 Steps)
- Server Startup: 20+ Steps
- SafeMode-Trigger (5 Ausloeser)
- Circuit Breaker (MQTT: 5 failures → 30s OPEN, WiFi: 10 → 60s)
- Watchdog-Events (4070-4072)
- NVS-Keys (wifi_config, zone_config, sensors_config, actuators_config)

#### `skills/frontend-patterns/SKILL.md`
Konsolidiert aus frontend-debug:
- 26 WebSocket-Event-Typen
- 9 Pinia Stores (5 original + 4 shared)
- Auth-Flow (localStorage Keys, JWT, Refresh-Loop)
- API-Client (Axios Interceptors, Token-Refresh, 401-Handler)
- Component-Hierarchie (DashboardView → ESPCard → SensorSatellite)
- Playwright-Patterns fuer Frontend-Inspektion:
  - Login-Flow (navigate → fill form → submit → wait for dashboard)
  - DOM-Inspection (snapshot → suche nach Komponenten)
  - Console-Messages (level: error → Vue Errors finden)
  - Network-Requests (includeStatic: false → API Calls sehen)

#### `skills/cross-layer-correlation/SKILL.md`
Konsolidiert aus meta-analyst + Debug-Agenten Cross-Layer Checks. Korrelationen und Kaskaden mit Pattern-IDs aus PATTERNS.yaml verknuepfen (ROADMAP §2.3).
- Timestamp-Korrelation: Events <5s = wahrscheinlich korreliert
- Propagation-Delay: ESP → MQTT ~0ms, MQTT → Server ~1s, Server → Frontend ~1s
- Standard-Kaskaden-Muster (3 haeufigste dokumentiert)
- Widerspruchs-Erkennung-Patterns
- Debug-Pfade:
  - Pfad A "User sieht nichts": Browser → Console → Network → API → Server → DB
  - Pfad B "Daten kommen nicht an": ESP Serial → MQTT → Server Handler → DB

### 4.3 Erweiterte bestehende Skills

#### `skills/system-health/SKILL.md` (erweitert)
- Loki-basierte Health-Checks hinzufuegen (statt nur Docker + curl)
- debug-status.ps1 Integration
- Loki-Verfuegbarkeits-Check als ersten Schritt

#### `skills/database-operations/SKILL.md` (erweitert)
- Hinweis auf MCP database-server als primaere Option
- Korrekte Credentials (god_kaiser / god_kaiser_db statt automationone)

### 4.4 Neue Commands

#### `commands/ops-inspect-backend.md`
```
Invoke the `auto-ops:backend-inspector` agent with:
"Perform a cross-layer backend inspection:
1. Run debug-status.ps1 for overall health
2. Query Loki for server errors, MQTT traffic, broker events
3. Check ESP32 serial log if available
4. Query database for device status, sensor data freshness
5. Correlate timestamps across all layers
6. Write report to .claude/reports/current/BACKEND_INSPECTION.md"
```

#### `commands/ops-inspect-frontend.md`
```
Invoke the `auto-ops:frontend-inspector` agent with:
"Perform a cross-layer frontend inspection:
1. Run debug-status.ps1 for overall health
2. Open browser via Playwright, navigate to frontend
3. Check console messages, DOM state, network requests
4. Query Loki for frontend errors, server WS events
5. Analyze affected components/stores in source code
6. Write report to .claude/reports/current/FRONTEND_INSPECTION.md"
```

#### `commands/ops-drive.md`
```
Invoke the `auto-ops:auto-ops` agent with:
"Act as Driver:
1. Login via Playwright (admin / Admin123#)
2. Navigate through dashboard
3. Take screenshots at each step
4. Call REST API to list devices
5. Document all observations in .claude/reports/current/DRIVER_LOG.md"
```

### 4.5 Erweiterte Hooks

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check the Bash command. BLOCK (respond with warning) if it contains: 'docker compose down', 'docker compose restart', 'docker compose stop', 'docker system prune', 'docker volume rm', 'rm -rf', 'DROP TABLE', 'TRUNCATE', 'DELETE FROM', 'pio run -t upload', 'alembic downgrade', 'git reset', 'git clean', 'git push --force', 'mosquitto_pub'. Also WARN if mosquitto_sub is used WITHOUT both '-C' and '-W' flags (agent will hang). Otherwise allow."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "If the Bash command output contains 'error', 'Error', 'ERROR', 'fatal', 'FATAL', 'failed', or 'FAILED', respond with: 'OPS-ALERT: Command returned errors. Log this finding.' Otherwise respond empty."
          }
        ]
      }
    ]
  }
}
```

Aenderung: `mosquitto_pub` in Block-Liste, `mosquitto_sub` Timeout-Warnung hinzugefuegt.

### 4.6 plugin.json Update

```json
{
  "name": "auto-ops",
  "description": "Autonomous Operations & Debug Agent for AutomationOne IoT Framework. Full-stack diagnosis with Backend Inspector (ESP32→MQTT→Server→DB) and Frontend Inspector (Browser→Vue→API→Server). Controlled autonomy: reads freely, asks before destructive actions.",
  "version": "2.0.0",
  "author": {
    "name": "Robin",
    "email": "robin@automationone.local"
  },
  "license": "MIT",
  "keywords": [
    "operations", "debugging", "inspection", "esp32", "docker",
    "postgresql", "mqtt", "iot", "automation", "devops",
    "loki", "playwright", "cross-layer"
  ]
}
```

---

## 5. Was NICHT geaendert wird

| Element | Grund |
|---------|-------|
| `.claude/agents/esp32-debug.md` | Bleibt als Fallback, wird nicht geloescht |
| `.claude/agents/server-debug.md` | Bleibt als Fallback, wird nicht geloescht |
| `.claude/agents/mqtt-debug.md` | Bleibt als Fallback, wird nicht geloescht |
| `.claude/agents/frontend-debug.md` | Bleibt als Fallback, wird nicht geloescht |
| `.claude/agents/meta-analyst.md` | Bleibt als Fallback, wird nicht geloescht |
| `.claude/agents/db-inspector.md` | Bleibt als Fallback, wird nicht geloescht |
| `.claude/agents/system-control.md` | Bleibt (Briefing + Ops Rolle bleibt eigenstaendig) |
| `.claude/agents/test-log-analyst.md` | Bleibt (anderer Workflow, nicht Debug-Runtime) |
| `.claude/agents/agent-manager.md` | Bleibt (Meta-Management-Rolle) |
| Alle Dev-Agenten | Bleibt (Implementierung ≠ Debugging) |
| `.claude/skills/*` | Bleiben (projekt-skills sind getrennt von plugin-skills) |

---

## 6. Was die Konsolidierung bringt

### Vorher (5+ Agenten-Aufrufe, seriell)

```
1. system-control → SESSION_BRIEFING.md              (~2 min)
2. esp32-debug → ESP32_DEBUG_REPORT.md                (~3 min)
3. server-debug → SERVER_DEBUG_REPORT.md              (~3 min)
4. mqtt-debug → MQTT_DEBUG_REPORT.md                  (~3 min)
5. frontend-debug → FRONTEND_DEBUG_REPORT.md          (~3 min)
6. /collect-reports → CONSOLIDATED_REPORT.md           (~1 min)
7. meta-analyst → META_ANALYSIS.md                    (~3 min)
                                                       ~18 min, 7 Reports
```

### Nachher (2 Inspektor-Aufrufe, optional parallel)

```
1. /ops-inspect-backend → BACKEND_INSPECTION.md        (~5 min, cross-layer)
2. /ops-inspect-frontend → FRONTEND_INSPECTION.md      (~5 min, cross-layer)
                                                        ~10 min, 2 Reports
                                                        (oder ~5 min parallel)
```

### Qualitaetsverbesserungen

| Aspekt | Vorher | Nachher |
|--------|--------|---------|
| Cross-Layer | Nachtraeglich (meta-analyst) | Eingebaut (jeder Inspektor folgt dem Datenpfad) |
| Loki-Nutzung | Keine (Bind-Mount grep) | Primaere Datenquelle |
| Browser-Zugang | Blind Spot (frontend-debug) | Playwright MCP integriert |
| DB-Zugang | docker exec psql | MCP database-server |
| MQTT-History | Nur live (mosquitto_sub) | Historisch via Loki (el-servador, mqtt-broker) |
| Gesamtzustand | Manuell | debug-status.ps1 als erster Schritt |
| Fehlermuster | Pro Agent neu beschrieben | PATTERNS.yaml als Single Source (ROADMAP §2.3) |
| Reports | 7 einzelne, redundant | 2 fokussierte, cross-layer |
| Error-Codes | Aufgeteilt (1000-4999 / 5000-5699) | Zusammen in einem Skill |

---

## 7. Implementierungsreihenfolge

### Phase A: Skills erstellen (Wissen konsolidieren)
0. **Abgleich Stack:** ROADMAP_KI_MONITORING.md Phase 1 (Loki/Promtail/Grafana) als laufend voraussetzen; optional Phase 2.3 (PATTERNS.yaml) fuer Fehlermuster-Referenz pruefen.
1. `skills/loki-queries/SKILL.md` - Loki-Query-Bibliothek (Labels: compose_service etc. wie ROADMAP §1.1)
2. `skills/error-codes/SKILL.md` - Alle Error-Codes konsolidiert
3. `skills/mqtt-analysis/SKILL.md` - MQTT-Analyse-Wissen
4. `skills/boot-sequences/SKILL.md` - Boot/Startup-Sequenzen
5. `skills/frontend-patterns/SKILL.md` - Frontend + Playwright Patterns
6. `skills/cross-layer-correlation/SKILL.md` - Korrelations-Patterns
7. `skills/system-health/SKILL.md` erweitern (Loki, debug-status.ps1)
8. `skills/database-operations/SKILL.md` erweitern (MCP, korrekte Credentials)

### Phase B: Agenten erstellen
1. `agents/backend-inspector.md` - Backend-Inspector-Agent
2. `agents/frontend-inspector.md` - Frontend-Inspector-Agent
3. `agents/auto-ops.md` erweitern (Rollen-Erkennung, Inspektor-Delegation)

### Phase C: Commands erstellen
1. `commands/ops-inspect-backend.md`
2. `commands/ops-inspect-frontend.md`
3. `commands/ops-drive.md`
4. `commands/ops-diagnose.md` erweitern (nutzt Inspektoren)

### Phase D: Plugin-Konfiguration
1. `plugin.json` Update (Version 2.0.0, neue Agents)
2. `hooks/hooks.json` Update (mosquitto_pub Block, mosquitto_sub Warnung)
3. `README.md` Update

### Phase E: Dokumentation
1. `.claude/CLAUDE.md` aktualisieren (neue Commands, Rollen)
2. `.claude/agents/Readme.md` aktualisieren
3. `docs/plans/Debug.md` Status auf "Phase 5 implementiert" setzen
4. MEMORY.md aktualisieren

### Phase F: Verifikation
1. `/ops-inspect-backend` auf laufendem System testen
2. `/ops-inspect-frontend` auf laufendem System testen
3. `/ops-drive` testen
4. Alte Agenten einzeln testen (Fallback funktioniert noch)

---

## 8. Offene Entscheidungen fuer Robin

1. **Alte Agenten im CLAUDE.md Router:**
   - Option A: Alte Debug-Agenten aus dem Router entfernen, nur auto-ops Commands listen
   - Option B: Beide listen (alt + neu), User waehlt
   - **Empfehlung:** Option A - Neue Commands als Default, alte Agenten bleiben als Dateien aber nicht im Router

2. **system-control Rolle:**
   - Option A: Briefing-Modus bleibt bei system-control, Ops-Modus geht zu auto-ops
   - Option B: Alles zu auto-ops konsolidieren
   - **Empfehlung:** Option A - system-control behalt Briefing (TM-Workflow), auto-ops macht Ops + Debug

3. **Parallele Ausfuehrung:**
   - Backend Inspector und Frontend Inspector koennen parallel laufen ("zusammen")
   - **Empfehlung:** Default sequenziell, "zusammen" moeglich

4. **Driver als eigener Agent oder Modus:**
   - Option A: Eigener Agent `driver.md`
   - Option B: Modus im auto-ops Agent
   - **Empfehlung:** Option B - Driver ist kein eigenstaendiger Debug-Agent, sondern ein Modus von auto-ops

---

## 9. Risiken und Mitigierung

| Risiko | Wahrscheinlichkeit | Mitigierung |
|--------|-------------------|-------------|
| Inspektoren zu gross (>Skill-Limit) | Mittel | Skills halten Wissen, Agent-Definition bleibt schlank |
| Loki nicht verfuegbar | Niedrig (jetzt Default) | Fallback auf Bind-Mount-Files dokumentiert |
| Playwright-MCP Verbindung instabil | Mittel | Graceful Degradation: Source-Code-Analyse als Fallback |
| alte Agenten werden versehentlich geloescht | Niedrig | Regeln verbieten Loeschung, agent-manager prueft |
| Kontext-Overflow bei Cross-Layer | Mittel | Skills als externe Referenz, Agent-Definition fokussiert |
| Loki-Labels abweichend vom Stack | Niedrig | Alle Queries ueber loki-queries-Skill mit compose_service (ROADMAP §1.1) |

---

## 10. Schaetzung

| Phase | Aufwand |
|-------|---------|
| A: Skills | 6 neue + 2 erweiterte Skills |
| B: Agenten | 2 neue + 1 erweiterte Agent-Definition |
| C: Commands | 3 neue + 1 erweiterte Command |
| D: Plugin-Config | 3 Dateien |
| E: Dokumentation | 4 Dateien |
| F: Verifikation | Manuell auf laufendem System |
| **Gesamt** | ~20 Dateien erstellen/anpassen |
