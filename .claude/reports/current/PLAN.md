# Plan: Technical Manager (Claude Desktop) & IST-Stand-Skills

> **Erstellt:** 2026-02-07
> **Aktualisiert:** 2026-02-07 (verify-plan Korrektur)
> **Status:** Phase 1.1 abgeschlossen, Phase 1.2 ausstehend

---

## 0. IST-Stand (Verifiziert 2026-02-07)

```yaml
Claude Desktop Status:
  Läuft: EXTERN (kein Docker-Container)
  MCP-Server: Noch nicht bekannt (Config außerhalb Projekt)
  Rolle: Technical Manager mit ALLEN Tools

VS Code Claude Status:
  MCP-Server: MCP_DOCKER aktiv (Browser-Automation, Git-Tools, Gateway)
  Agents: 13 (5 Debug, 4 Dev, 4 System)
  Skills: 19 (user-invocable)

Docker Stack (seit 15h stabil):
  HEALTHY: postgres, mqtt-broker, el-servador, el-frontend,
           loki, promtail, prometheus, grafana (8 Container)
  GESTOPPT: pgadmin (Exit 127 - nicht kritisch)
  Monitoring: AKTIV (Loki, Prometheus, Grafana, Promtail)

Projekt-Struktur:
  .claude/: EXISTS (13 Agents, 19 Skills, 16 Reports in current/)
  .technical-manager/: EXISTS (Ordnerstruktur angelegt, noch leer)
  Compose-Dateien: 5 (yml, dev, test, ci, e2e)
  Docker Services: 9 (4 Core + 1 DevTools + 4 Monitoring)

Code-Zahlen (verifiziert):
  Backend Routers: 18 (14 registriert + 4 weitere)
  Backend Models: 17
  Frontend Components: 68
  Frontend Views: 11
  Frontend Stores: 5
  GitHub Workflows: 8
  Makefile Targets: 54
```

---

## 1. Ordnerstruktur (ANGELEGT)

```
Auto-one/
├── .claude/                         # VS Code Agents (BESTEHT)
│   ├── agents/                      # 13 Agents
│   ├── skills/                      # 19 Skills
│   ├── reference/                   # Pattern-Dokumentation
│   └── reports/                     # Agent Reports
│       └── current/                 # 16 aktuelle Reports
│
├── .technical-manager/              # Claude Desktop Zone (ANGELEGT)
│   ├── skills/                      # TM-spezifische Skills
│   │   ├── 01-system-status/        # IST-Stand erforschen
│   │   ├── 02-github-ops/           # GitHub Integration
│   │   ├── 03-monitoring-ops/       # Grafana/Prometheus/Loki
│   │   └── 04-browser-tests/        # Playwright UI-Tests
│   │
│   ├── reports/                     # TM generiert hier
│   │   ├── system-health/           # Docker + Service Status
│   │   ├── github-status/           # CI/CD + Issues
│   │   ├── monitoring/              # Metrics + Logs
│   │   └── ui-tests/                # Playwright Results
│   │
│   ├── commands/                    # TM schreibt Commands fuer VS Code
│   │   ├── pending/                 # VS Code liest hier
│   │   └── completed/               # Archiv
│   │
│   ├── inbox/                       # VS Code schreibt hier rein
│   │   ├── agent-reports/           # Kopien von .claude/reports/
│   │   └── system-logs/             # Status-Updates
│   │
│   └── config/                      # TM Configuration
│       ├── mcp-access-rules.md      # Welche Pfade darf TM lesen?
│       └── tool-permissions.md      # Welche Tools sind erlaubt?
│
└── ... (Rest des Projekts)
```

---

## 2. Kern-Skills fuer Claude Desktop (Technical Manager)

### **Skill 1: `system-status` - IST-Stand erforschen**

**Zweck:** Complete System Status ohne Code-Details
**Tools:** filesystem (read-only), bash (docker commands), git (status)

**Analysiert:**
```yaml
- Docker Stack Status:
  ✓ Welche Container laufen? (docker ps)
  ✓ Resource Usage (docker stats)
  ✓ Health Checks (docker inspect)

- Git Repository:
  ✓ Current Branch
  ✓ Uncommitted Changes
  ✓ Last 5 Commits

- Projekt-Struktur:
  ✓ Top-Level Ordner (ls -la)
  ✓ File Counts pro Layer
  ✓ Letzte Aenderungen (find + mtime)

- Service Endpoints:
  ✓ Backend: curl localhost:8000/api/v1/health/live
  ✓ Frontend: curl localhost:5173
  ✓ Grafana: curl localhost:3000/api/health
  ✓ Prometheus: curl localhost:9090/-/healthy
  ✓ Loki: curl localhost:3100/ready

- Reports Verfuegbarkeit:
  ✓ .claude/reports/current/ Liste
  ✓ .technical-manager/inbox/ Neue Reports
```

**Output:** `system-status-YYYY-MM-DD-HHMM.md` in `.technical-manager/reports/system-health/`

---

### **Skill 2: `github-status` - GitHub Integration**

**Zweck:** Repository Health & CI/CD Status
**Tools:** web_search, web_fetch, bash (git, gh CLI)

**Analysiert:**
```yaml
- GitHub Actions (8 Workflows):
  ✓ server-tests.yml - Backend Unit/Integration
  ✓ esp32-tests.yml - ESP32/Wokwi Tests
  ✓ frontend-tests.yml - Frontend Unit Tests
  ✓ backend-e2e-tests.yml - Backend E2E
  ✓ playwright-tests.yml - Playwright E2E
  ✓ pr-checks.yml - Pull Request Checks
  ✓ security-scan.yml - Security Scanning
  ✓ wokwi-tests.yml - Wokwi Simulation

- Pull Requests:
  ✓ Offene PRs
  ✓ Review-Status
  ✓ Merge-Konflikte

- Issues & Milestones:
  ✓ Offene Issues nach Label
  ✓ Milestone Progress

- Security:
  ✓ Dependabot Alerts
  ✓ Secret Scanning (wenn aktiviert)
```

**Output:** `github-status-YYYY-MM-DD-HHMM.md` in `.technical-manager/reports/github-status/`

---

### **Skill 3: `monitoring-check` - Monitoring Stack**

**Zweck:** Grafana/Prometheus/Loki Status
**Tools:** web_fetch (HTTP requests), bash

**Voraussetzung:** Monitoring-Profile muss laufen (`docker compose --profile monitoring up -d`)
**Aktueller Status:** LAEUFT (alle 4 Services healthy)

**Analysiert:**
```yaml
- Prometheus (localhost:9090):
  ✓ /api/v1/query fuer Key Metrics
  ✓ Scrape Targets: el-servador:8000/metrics (15s), self (15s)
  ✓ Alert Rules Status
  ✓ Retention: 7 Tage

- Grafana (localhost:3000):
  ✓ Dashboard: "AutomationOne - System Health" (6 Panels)
  ✓ Datasources: Prometheus (default) + Loki
  ✓ Login: admin / ${GRAFANA_ADMIN_PASSWORD}

- Loki (localhost:3100):
  ✓ Log Volume letzte 1h
  ✓ Error Rate
  ✓ Service-wise Breakdown
  ✓ Retention: 7 Tage (168h)

- Promtail:
  ✓ Docker Socket scraping (auto-discovery)
  ✓ Labels: container, stream, service
```

**Output:** `monitoring-check-YYYY-MM-DD-HHMM.md` in `.technical-manager/reports/monitoring/`

---

### **Skill 4: `browser-test` - Playwright UI-Tests**

**Zweck:** Frontend E2E Tests ausfuehren
**Tools:** MCP_DOCKER (browser automation) oder Playwright CLI

**Hinweis:** VS Code Claude hat bereits MCP_DOCKER mit Browser-Automation.
Claude Desktop braucht eigenen Browser-Zugriff oder delegiert an VS Code.

**Testet:**
```yaml
- Login Flow (localhost:5173)
- Device Discovery
- Sensor Live Data
- Actuator Control
- Emergency Stop
```

**Bestehende Playwright-Infrastruktur:**
```yaml
- Config: El Frontend/playwright.config.ts
- Tests: El Frontend/tests/
- Makefile: make e2e-test, make e2e-test-ui, make e2e-debug
- Stack: make e2e-up (startet docker-compose.e2e.yml)
```

**Output:** `browser-test-YYYY-MM-DD-HHMM.md` + Screenshots in `.technical-manager/reports/ui-tests/`

---

## 3. VS Code Skill: `collect-system-status` (NEUER Skill)

**Zweck:** IST-Stand aus Code-Perspektive sammeln
**Allowed-Tools:** `Read`, `Glob`, `Grep`, `Bash` (read-only commands)

**Sammelt:**
```yaml
1. Docker-Compose Analyse:
   ✓ 5 Compose-Dateien parsen (yml, dev, test, ci, e2e)
   ✓ 9 Services + 3 Profiles (default, devtools, monitoring)
   ✓ Volume Mounts (5 Named + 16 Bind)
   ✓ Network Config (automationone-net, bridge)

2. Backend Struktur:
   ✓ El Servador/god_kaiser_server/src/ Tree
   ✓ Routers: 18 (14 registriert in __init__.py + 4 weitere)
   ✓ Models: 17 (in src/db/models/)
   ✓ Tests: 105 Dateien (36 unit, 44 integration, 19 esp32, 6 e2e)

3. Frontend Struktur:
   ✓ El Frontend/src/ Tree
   ✓ Components: 68 Vue-Dateien
   ✓ Views: 11 Vue-Dateien
   ✓ Stores: 5 Pinia-Stores (auth, database, dragState, esp, logic)

4. ESP32 Firmware:
   ✓ El Trabajante/src/ Tree
   ✓ PlatformIO Environments
   ✓ Build Flags
   ✓ Wokwi Scenarios: 163 total (13 Kategorien)

5. Agent System:
   ✓ .claude/agents/ Liste (13 Agents)
   ✓ .claude/skills/ Liste (19 Skills)
   ✓ .claude/reports/current/ Liste

6. CI/CD:
   ✓ .github/workflows/ Liste (8 Workflows)
   ✓ Makefile Targets: 54
```

**Output:** `.technical-manager/inbox/agent-reports/system-status-from-code.md`

---

## 4. Workflow-Integration (Wie arbeiten beide zusammen?)

### **Scenario 1: TM will Gesamtstatus**

```
+-------------------------------------------------------------+
| Claude Desktop (TM)                                         |
| Skill: system-status                                        |
+-------------------------------------------------------------+
       |
       +-> docker ps (Container Status)
       +-> git status (Branch, Changes)
       +-> curl localhost:8000/api/v1/health/live
       +-> curl localhost:3000/api/health (Grafana)
       +-> ls .claude/reports/current/ (Neue Reports?)
       +-> ls .technical-manager/inbox/ (VS Code Updates?)
       |
       +-> Report: .technical-manager/reports/system-health/
```

### **Scenario 2: TM braucht Code-Details**

```
+-------------------------------------------------------------+
| Claude Desktop (TM)                                         |
| Erstellt Command fuer VS Code                               |
+-------------------------------------------------------------+
       |
       +-> Schreibt in: .technical-manager/commands/pending/
           "request-system-status.md"

                              |

+-------------------------------------------------------------+
| VS Code Claude (User ruft auf)                              |
| Skill: collect-system-status                                |
+-------------------------------------------------------------+
       |
       +-> Analysiert Code-Struktur
       +-> Zaehlt Files
       +-> Parsed Configs
       |
       +-> Report: .technical-manager/inbox/agent-reports/
           "system-status-from-code.md"

                              |

+-------------------------------------------------------------+
| Claude Desktop (TM)                                         |
| Liest Report, kombiniert mit eigenen Checks                 |
+-------------------------------------------------------------+
```

---

## 5. Skill-Prioritaeten (Reihenfolge der Implementierung)

### **Phase 1: Grundlagen**
```
1.1 Ordnerstruktur anlegen (.technical-manager/)              [DONE]
1.2 Skill: system-status (Claude Desktop)                     [TODO]
1.3 Skill: collect-system-status (VS Code)                    [TODO]
1.4 Test: Beide Skills ausfuehren, Reports vergleichen        [TODO]
```

### **Phase 2: GitHub Integration**
```
2.1 Skill: github-status (Claude Desktop)                     [TODO]
2.2 Test: GitHub API Zugriff, CI/CD Status                    [TODO]
```

### **Phase 3: Monitoring**
```
3.1 Skill: monitoring-check (Claude Desktop)                  [TODO]
3.2 Test: Prometheus/Grafana/Loki Queries                     [TODO]
    Voraussetzung: Monitoring-Stack laeuft (aktuell: JA)
```

### **Phase 4: UI-Tests**
```
4.1 Skill: browser-test (Claude Desktop)                      [TODO]
4.2 Test: Playwright gegen localhost:5173                      [TODO]
    Voraussetzung: Entscheidung ob TM eigenen Browser hat
                   oder an VS Code delegiert
```

---

## 6. Kritische Entscheidungen

### **A) Claude Desktop Container oder externes Tool?**

**ENTSCHIEDEN: Option 2 (Externes Tool)**

```
Verifiziert: docker ps zeigt KEINEN Claude-Container.
Claude Desktop laeuft EXTERN auf dem Windows-Host.

Vorteile:
  ✓ Einfach zu starten
  ✓ Keine Docker-Komplexitaet
  ✓ Unabhaengig vom Stack
  ✓ Kann Stack von aussen beobachten

Naechster Schritt:
  -> MCP-Config von Claude Desktop ermitteln
  -> Welche MCP-Server sind dort aktiv?
  -> Filesystem-Zugriff konfigurieren
```

### **B) Filesystem-Zugriff fuer Claude Desktop**

```yaml
Vorgeschlagene MCP Config:
  Read-Write Zugriff:
    ✓ .technical-manager/        (Full Access - TM-eigene Zone)

  Read-Only Zugriff:
    ✓ .claude/reports/current/   (Agent-Reports lesen)
    ✓ docker-compose.yml         (Stack-Config verstehen)
    ✓ docker-compose.*.yml       (Alle 5 Overlays)
    ✓ Makefile                   (Verfuegbare Targets)
    ✓ .env.example               (Config-Template, KEINE .env!)

  KEIN Zugriff:
    ✗ El Servador/src/           (Source-Code)
    ✗ El Frontend/src/           (Source-Code)
    ✗ El Trabajante/src/         (Source-Code)
    ✗ .env                       (Secrets!)
    ✗ .claude/agents/            (VS Code intern)
    ✗ .claude/skills/            (VS Code intern)

Grund: TM analysiert, VS Code implementiert.
       TM braucht keinen Source-Code-Zugriff.
```

### **C) Tool-Evaluierung**

```
Verifiziert: KEINE dieser Tools im Projekt vorhanden:
  - Redis     -> Nicht noetig (kein Caching-Bottleneck)
  - Celery    -> Nicht noetig (APScheduler reicht)
  - InfluxDB  -> Nicht noetig (PostgreSQL reicht fuer Sensor-Data)

Entscheidung: NICHT JETZT einbauen.
Erst wenn system-status zeigt: "APScheduler ist Bottleneck"
oder Sensor-Data zu langsam in PostgreSQL.
```

---

## 7. Naechste konkrete Schritte

**Phase 1.1 ist abgeschlossen** (Ordnerstruktur angelegt).

**Jetzt: Phase 1.2 vorbereiten**

Bevor Skills geschrieben werden, muss geklaert werden:

### Offene Fragen an User

1. **Claude Desktop MCP-Config:** Welche MCP-Server hat Claude Desktop?
   - Filesystem-Server? (fuer Dateizugriff)
   - Docker-MCP? (fuer Container-Befehle)
   - Git-MCP? (fuer Repository-Status)
   - Browser-MCP? (fuer Playwright/UI-Tests)

2. **Kommunikationsweg:** Wie soll TM mit VS Code kommunizieren?
   - Option A: Nur ueber `.technical-manager/commands/pending/` (async, Dateisystem)
   - Option B: User kopiert Reports manuell (wie bisher im TM-Workflow)
   - Option C: Beides (Dateisystem fuer automatisierbare Tasks, Copy-Paste fuer Analyse)

3. **Skill-Format:** Sollen TM-Skills das gleiche Format wie VS Code Skills haben?
   - `.technical-manager/skills/01-system-status/SKILL.md`
   - Oder ein eigenes Format fuer Claude Desktop?

---

## Anhang A: Docker Services (IST-Zustand verifiziert)

### Compose-Dateien (5 Stueck)

| Datei | Zweck | Makefile-Variable |
|-------|-------|-------------------|
| `docker-compose.yml` | Base/Production (9 Services) | `COMPOSE` |
| `docker-compose.dev.yml` | Dev-Overlay (src-mounts, --reload, DEBUG) | `COMPOSE_DEV` |
| `docker-compose.test.yml` | Test-Overlay (SQLite, dummy postgres) | `COMPOSE_TEST` |
| `docker-compose.ci.yml` | CI (GitHub Actions, tmpfs, keine Persistenz) | `COMPOSE_CI` |
| `docker-compose.e2e.yml` | E2E (Playwright, Frontend always, schnelle HC) | `COMPOSE_E2E` |

### Services (Default-Profil: 4 Services)

| Service | Container | Port(s) | Health-Check |
|---------|-----------|---------|--------------|
| `postgres` | `automationone-postgres` | 5432 | `pg_isready` (10s) |
| `mqtt-broker` | `automationone-mqtt` | 1883, 9001 | `mosquitto_sub` (30s) |
| `el-servador` | `automationone-server` | 8000 | `curl /api/v1/health/live` (30s) |
| `el-frontend` | `automationone-frontend` | 5173 | `node fetch` (30s) |

### Services (Profil: devtools)

| Service | Container | Port(s) |
|---------|-----------|---------|
| `pgadmin` | `automationone-pgadmin` | 5050 |

### Services (Profil: monitoring)

| Service | Container | Port(s) |
|---------|-----------|---------|
| `loki` | `automationone-loki` | 3100 |
| `promtail` | `automationone-promtail` | - |
| `prometheus` | `automationone-prometheus` | 9090 |
| `grafana` | `automationone-grafana` | 3000 |

### Profile-Uebersicht (3 Profile)

| Profile | Services | Aktivierung |
|---------|----------|-------------|
| *(default)* | postgres, mqtt-broker, el-servador, el-frontend | `docker compose up -d` |
| `devtools` | + pgadmin | `--profile devtools` |
| `monitoring` | + loki, promtail, prometheus, grafana | `--profile monitoring` |
| `frontend` | el-frontend (in test/CI, wo Frontend optional) | `--profile frontend` |

### Makefile Quick Reference (TM-relevant)

| Befehl | Aktion |
|--------|--------|
| `make status` | `docker compose ps` |
| `make health` | `curl /api/v1/health/live` |
| `make up` | Start production stack (4 Services) |
| `make dev` | Start mit hot-reload (dev overlay) |
| `make down` | Stop all containers |
| `make logs` | Follow all logs |
| `make mqtt-sub` | Subscribe all MQTT topics |
| `make devtools-up` | Core + pgAdmin |
| `make wokwi-status` | Wokwi test runner status |

---

## Anhang B: Korrektur-Log

| Datum | Was | Vorher | Nachher | Quelle |
|-------|-----|--------|---------|--------|
| 2026-02-07 | Compose-Dateien | 3 | 5 | verify-plan (docker-compose.dev.yml + test.yml fehlten) |
| 2026-02-07 | Docker Services | 10 | 9 | verify-plan (gezaehlt in docker-compose.yml) |
| 2026-02-07 | Profile | 2 | 3 | verify-plan (frontend-Profile in test/CI) |
| 2026-02-07 | Health-Endpoint | /api/v1/health | /api/v1/health/live | verify-plan (docker-compose.yml:131) |
| 2026-02-07 | Backend Routers | 14 | 18 | verify-plan (14 reg. + ai, kaiser, library, ws/realtime) |
| 2026-02-07 | Backend Models | 16 | 17 | verify-plan (17 Dateien in src/db/models/) |
| 2026-02-07 | VS Code Tool-Namen | view, bash_tool | Read, Glob, Grep, Bash | verify-plan (Claude Code Tool-API) |
| 2026-02-07 | Phase 1.1 | TODO | DONE | Ordnerstruktur angelegt |
| 2026-02-07 | .technical-manager/ | NOT EXISTS | EXISTS (leer) | User bestaetigt |
