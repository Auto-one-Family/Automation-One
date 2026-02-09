# Technical Manager – Skills Blueprint

> **Projekt:** AutomationOne Framework
> **Datum:** 2026-02-07
> **Ziel:** 9 fokussierte Skills für den Technical Manager (Claude Desktop / Claude Project)
> **Prinzip:** Vollständiger Systemüberblick OHNE Code-Zugriff

---

## Systemkontext

### AutomationOne Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                    TECHNICAL MANAGER (Claude)                    │
│         Sieht: Infrastruktur, Git, CI/CD, Monitoring, APIs      │
│         Sieht NICHT: Quellcode (El Servador/src, etc.)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ El Trabajante │  │ El Servador  │  │ El Frontend          │   │
│  │ ESP32 C++     │  │ FastAPI Py   │  │ Vue 3 / TypeScript   │   │
│  │ PlatformIO    │  │ PostgreSQL   │  │ Vite + Tailwind      │   │
│  │ MQTT Client   │  │ MQTT + REST  │  │ Pinia State          │   │
│  └──────┬────────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                  │                     │               │
│         └──── MQTT ────────┴──── HTTP/WS ────────┘               │
│                                                                  │
│  Docker Stack (9 Container):                                     │
│  Core: postgres, mqtt-broker, el-servador, el-frontend           │
│  DevTools: pgadmin                                               │
│  Monitoring: loki, promtail, prometheus, grafana                 │
│                                                                  │
│  VS Code Agents (.claude/):                                      │
│  System: system-control                                          │
│  Debug: esp32-debug, server-debug, mqtt-debug, db-inspector,     │
│         meta-analyst                                             │
│  Dev: esp32-dev, server-dev, mqtt-dev, frontend-dev              │
│                                                                  │
│  CI/CD: GitHub Actions + Wokwi ESP32 Simulation                  │
│  Tests: 105 Backend-Files, 10 Frontend, 163 Wokwi Szenarien     │
└─────────────────────────────────────────────────────────────────┘
```

### Zugriffsgrenzen des TM

| Zugriff | Erlaubt | Verboten |
|---------|---------|----------|
| Docker | `docker ps`, `docker stats`, `docker logs`, `docker inspect` | `docker exec` mit Code-Änderungen |
| Git | Status, Log, Diff-Stats, Branch-Übersicht | Dateiinhalte aus Diffs lesen |
| Dateisystem | `.technical-manager/`, Config-Dateien (compose, .env.example, Makefile), `.claude/reports/` | `El Servador/src/`, `El Frontend/src/`, `El Trabajante/src/` |
| Netzwerk | Health-Endpoints, API-Probing, Monitoring-APIs | - |
| Browser | Playwright UI-Tests via MCP | - |
| GitHub | Actions, Issues, PRs, Security Alerts | - |
| Referenz-Doku | `.claude/reference/api/`, `.claude/reference/errors/`, `.claude/reference/patterns/` | `.claude/agents/`, `.claude/skills/` (VS Code Territorium) |

### Kommunikation mit VS Code Agents

```
TM schreibt Command  →  .technical-manager/commands/pending/
Robin leitet weiter   →  VS Code Agent führt aus
Agent schreibt Report →  .technical-manager/inbox/agent-reports/
TM liest Report       →  Kombiniert mit eigenen Checks
```

---

## Die 9 Skills im Überblick

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   ┌─────────────────────┐     ┌──────────────────────────────┐  │
│   │ 8. STRATEGIC PLAN   │     │ 9. REPORT VERIFICATION       │  │
│   │ IST/SOLL Analyse    │     │ Gegenprüfung aller Berichte  │  │
│   │ + Internetrecherche  │     │ + Dev-Agent Microtasks       │  │
│   └─────────┬───────────┘     └──────────────┬───────────────┘  │
│             │                                │                  │
│   ┌─────────┴───────────────────────────────┴───────────────┐   │
│   │              7. REPORT COORDINATION                      │   │
│   │              Meta-Skill: Alles zusammenführen            │   │
│   └────────┬──────────┬──────────┬──────────┬───────────────┘   │
│            │          │          │          │                    │
│   ┌────────┴──┐ ┌─────┴────┐ ┌──┴───────┐ ┌┴────────────┐     │
│   │ 1. DOCKER │ │ 3. GIT   │ │ 4. CI/CD │ │ 5. API      │     │
│   │ Infra     │ │ Repo     │ │ GitHub   │ │ Probing     │     │
│   └─────┬─────┘ └──────────┘ └──────────┘ └─────────────┘     │
│         │                                                       │
│   ┌─────┴─────┐                            ┌────────────┐      │
│   │ 2. MONIT. │                            │ 6. BROWSER │      │
│   │ Observ.   │                            │ Playwright │      │
│   └───────────┘                            └────────────┘      │
│                                                                  │
│   Ebene 1: Infrastruktur-Checks (Skills 1-6)                   │
│   Ebene 2: Koordination & Synthese (Skill 7)                   │
│   Ebene 3: Strategie & Qualitätssicherung (Skills 8-9)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Skill 1: Docker & Infrastructure Health

### Zweck
Basischeck des gesamten Docker-Stacks. Beantwortet: "Läuft alles? Was ist kaputt?"

### Fokusbereich

**Container-Status:**
- `docker ps -a` → Welche Container laufen, welche sind gestoppt/crashed
- `docker stats --no-stream` → CPU, Memory, Net I/O pro Container
- `docker inspect` → Health-Status, Restart-Count, Started-At
- Erwartung: 4 Core + optional 1 DevTools + optional 4 Monitoring = max 9

**Service Health Endpoints:**
- `el-servador:8000/api/v1/health/live` (Healthcheck)
- `el-frontend:5173` (Vite Dev Server)
- `mqtt-broker:1883` (MQTT TCP) + `:9001` (WebSocket)
- `postgres:5432` (pg_isready)
- Optional: `grafana:3000`, `prometheus:9090`, `loki:3100`

**Netzwerk:**
- Bridge-Network `automationone-net` verifizieren
- DNS-Resolution zwischen Containern prüfen
- Port-Mapping validieren (Host ↔ Container)

**Ressourcen:**
- Resource Limits vs. tatsächliche Nutzung
- Volume-Status (Named Volumes existieren?)
- Disk-Usage der Volumes

**Docker Compose Konfiguration (lesen, nicht ändern):**
- `docker-compose.yml` → Aktive Services, Profiles
- `docker-compose.ci.yml` → CI-Overrides verstehen
- `docker-compose.e2e.yml` → E2E-Overrides verstehen
- Aktive Profiles erkennen (core / devtools / monitoring)

### Referenzdaten aus dem System

| Service | Container Name | Port | Healthcheck |
|---------|---------------|------|-------------|
| PostgreSQL | automationone-postgres | 5432 | pg_isready |
| Mosquitto | automationone-mqtt | 1883, 9001 | mosquitto_sub |
| El Servador | automationone-server | 8000 | curl /health/live |
| El Frontend | automationone-frontend | 5173 | node fetch |
| pgAdmin | automationone-pgadmin | 5050 | - |
| Loki | automationone-loki | 3100 | /ready |
| Promtail | automationone-promtail | - | - |
| Prometheus | automationone-prometheus | 9090 | /-/healthy |
| Grafana | automationone-grafana | 3000 | /api/health |

### Output
`reports/system-health/docker-status-YYYY-MM-DD-HHMM.md`

### Wann einsetzen
- Session-Start (immer zuerst)
- Nach Docker-Änderungen
- Wenn ein anderer Skill unerwartete Fehler meldet

---

## Skill 2: Monitoring & Observability

### Zweck
Auswertung des Grafana/Prometheus/Loki-Stacks. Beantwortet: "Was sagen die Metriken und Logs?"

### Fokusbereich

**Prometheus (Metriken):**
- `/api/v1/query` → Key Metrics abfragen
- Scrape Targets Status: `up{job="el-servador"}` → 1 oder 0
- Selbst-Monitoring: `prometheus_tsdb_head_series`
- Server-Metriken: Request Rate, Error Rate, Latenz (falls `/metrics` Endpoint exponiert)
- Scrape Config: `el-servador:8000/metrics` alle 15s

**Loki (Logs):**
- LogQL Queries über HTTP API (`/loki/api/v1/query_range`)
- Error-Rate: `rate({service=~".+"} |~ "error|exception|fail|critical" [5m])`
- Log-Volume pro Service: `sum(rate({service=~".+"} [1h])) by (service)`
- WICHTIG: Labels sind `service` oder `compose_service` (Compose-Service-Name: `el-servador`, `mqtt-broker`, `el-frontend`). Das Label `service_name` existiert NICHT in dieser Promtail-Config. Frontend hat KEINE direkte Loki-Integration (0 Queries).

**Grafana (Dashboards):**
- `/api/health` → Grafana selbst erreichbar?
- `/api/datasources` → Prometheus + Loki connected?
- Pre-provisioned Dashboard: "AutomationOne - System Health" mit 6 Panels
- Alert Rules Status (falls konfiguriert)

**Log-Dateien auf Host (Bind Mounts):**
- `logs/server/` → El Servador Logs
- `logs/mqtt/` → Mosquitto Logs
- `logs/postgres/` → PostgreSQL Logs (nur mod-Statements, Slow Queries >100ms)

### Kritische Label-Referenz

| Loki Label | Beispielwert | Quelle |
|------------|-------------|--------|
| `service` | `el-servador` | Promtail relabel (compose service) |
| `compose_service` | `el-servador` | Promtail relabel (identisch mit service) |
| `compose_project` | `auto-one` | Promtail relabel (compose project) |
| `container` | `automationone-server` | Promtail relabel (container name) |
| `stream` | `stdout` / `stderr` | Docker Log Stream |

### Output
`reports/monitoring/monitoring-check-YYYY-MM-DD-HHMM.md`

### Wann einsetzen
- Nach Skill 1 (nur wenn Container laufen)
- Bei Performance-Problemen
- Zur Error-Analyse vor Debug-Sessions

---

## Skill 3: Git & Repository Health

### Zweck
Repository-Zustand ohne Code-Inhalte. Beantwortet: "Wo steht das Projekt?"

### Fokusbereich

**Branch-Status:**
- Aktueller Branch (zuletzt: `feature/docs-cleanup`)
- Uncommitted Changes (staged / unstaged / untracked)
- Ahead/Behind Remote (origin)
- Aktive Feature-Branches auflisten

**Commit-History:**
- Letzte N Commits (Hash, Author, Date, Message)
- Commit-Frequenz (Commits pro Tag/Woche)
- Conventional Commits prüfen (feat/fix/docs/chore/test Pattern)

**Diff-Statistiken (Metadaten, NICHT Code):**
- `git diff --stat` → Welche Dateien geändert, Insertions/Deletions
- `git diff --name-only` → Nur Dateinamen
- Änderungen pro Layer kategorisieren (El Servador / El Frontend / El Trabajante / Docker / CI)

**Repository-Hygiene:**
- `.gitignore` vollständig? (`.env`, `node_modules`, `__pycache__`, `logs/`)
- Große Dateien im Repo? (`git rev-list --objects --all | sort -k 2`)
- Stale Branches (älter als 2 Wochen ohne Commits)

**Tags & Releases:**
- Aktuelle Tags
- Versionierung (Semantic Versioning?)

### Output
`reports/git-status/git-health-YYYY-MM-DD-HHMM.md`

### Wann einsetzen
- Vor CI/CD-Analyse (Skill 4)
- Vor Merge-Entscheidungen
- Als Teil der Session-Eröffnung

---

## Skill 4: CI/CD & GitHub Operations

### Zweck
GitHub Actions, Issues, PRs, Security. Beantwortet: "Ist CI grün? Was ist offen?"

### Fokusbereich

**GitHub Actions Workflows:**
- Workflow-Dateien in `.github/workflows/` lesen und verstehen
- Letzte Runs pro Workflow: Status (success/failure/running)
- Failed Jobs analysieren: Welcher Step, welcher Fehler (aus CI-Logs, nicht aus Code)
- Bekannte Workflows: `server-tests.yml`, `esp32-tests.yml`, `backend-e2e-tests.yml`, `playwright-tests.yml`

**Wokwi CI-Integration:**
- 163 aktive Szenarien
- Hobby-Plan: 200 Minuten/Monat Budget-Tracking
- Scenario-Kategorien: Actuator, Emergency, Config, Zone, PWM, Combined
- `set-control` YAML Steps (nicht externe `mosquitto_pub`)

**Pull Requests:**
- Offene PRs mit Review-Status
- Merge-Konflikte identifizieren
- PR-Labels und zugewiesene Reviewer

**Issues & Milestones:**
- Offene Issues nach Label (bug, feature, priority)
- Milestone Progress (% done)
- Stale Issues (keine Aktivität >2 Wochen)

**Security:**
- Dependabot Alerts
- Secret Scanning Alerts
- Bekannte Dev-Only Warnings: MQTT `allow_anonymous`, JWT Placeholder

**Makefile Targets:**
- Verfügbare Make-Targets auflisten (`make help` oder Makefile parsen)
- 15+ Targets für Docker-Operationen

### Output
`reports/github-status/ci-cd-status-YYYY-MM-DD-HHMM.md`

### Wann einsetzen
- Vor Code-Änderungen (ist CI aktuell grün?)
- Nach Pushes (sind Tests durchgelaufen?)
- Wöchentliches Issue-Review

---

## Skill 5: Service & API Probing

### Zweck
Black-Box-Test aller Service-Endpoints. Beantwortet: "Antworten die Services korrekt?"

### Fokusbereich

**REST API (El Servador :8000):**
- `/api/v1/health/live` → Basis-Healthcheck
- `/api/v1/docs` → Swagger UI erreichbar?
- Key Endpoints aus `.claude/reference/api/REST_ENDPOINTS.md` proben
- Response-Codes validieren (200, 401, 404 wie erwartet?)
- Response-Zeiten messen

**WebSocket (El Servador :8000):**
- WS-Verbindung aufbauen
- Event-Subscription testen
- Referenz: `.claude/reference/api/WEBSOCKET_EVENTS.md`

**MQTT Broker (:1883 / :9001):**
- TCP-Verbindung auf Port 1883
- WebSocket-Verbindung auf Port 9001
- Topic-Struktur validieren gegen `.claude/reference/api/MQTT_TOPICS.md`
- Publish/Subscribe Roundtrip testen

**Datenbank (PostgreSQL :5432):**
- Erreichbarkeit (pg_isready)
- Migrations-Status: HEAD bei `950ad9ce87bb`?
- Tabellen-Anzahl plausibel?

**Error-Code Validierung:**
- Bekannte Error-Responses gegen `.claude/reference/errors/ERROR_CODES.md` prüfen
- ESP32 Codes: 1000-4999
- Server Codes: 5000-5999

### Erlaubte Referenz-Dokumente

| Dokument | Pfad | Zweck |
|----------|------|-------|
| REST Endpoints | `.claude/reference/api/REST_ENDPOINTS.md` | Welche Endpoints existieren |
| MQTT Topics | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Struktur |
| WebSocket Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` | WS Event-Typen |
| Error Codes | `.claude/reference/errors/ERROR_CODES.md` | Erwartete Fehler-Responses |
| Communication Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Request-Ketten |
| Architecture | `.claude/reference/patterns/ARCHITECTURE.md` | Systemdesign |

### Output
`reports/api-probing/api-status-YYYY-MM-DD-HHMM.md`

### Wann einsetzen
- Nach Docker-Start (Skill 1 war OK, aber antworten die Services auch richtig?)
- Vor Frontend-Tests (Skill 6)
- Nach Server-Deployments

---

## Skill 6: Browser & UI Testing (Playwright)

### Zweck
Frontend aus User-Perspektive testen. Beantwortet: "Funktioniert die UI?"

### Fokusbereich

**Kritische User Journeys:**
- Login Flow (Auth + JWT)
- Device Discovery (neue ESP32 Geräte erkennen)
- Sensor Live Data (Echtzeit-Updates via WebSocket)
- Actuator Control (Befehle an ESP32 senden)
- Emergency Stop (Sicherheitskritisch!)

**UI-Qualität:**
- Console Errors im Browser erfassen
- Broken Links / 404-Responses
- Responsive Layout (Desktop, Tablet-Breakpoints)
- Loading States (Spinner, Skeleton Screens)

**Visual Documentation:**
- Screenshots der Hauptseiten
- Vorher/Nachher bei UI-Änderungen

**Tooling:**
- Playwright via MCP_DOCKER (Browser Automation)
- Ziel: `http://localhost:5173`
- Backend muss laufen (Skill 1 + Skill 5 zuerst!)

### Abhängigkeiten
- Skill 1 bestätigt: Container laufen
- Skill 5 bestätigt: APIs antworten
- Dann erst Skill 6 für UI-Tests

### Output
`reports/ui-tests/browser-test-YYYY-MM-DD-HHMM.md` + Screenshots

### Wann einsetzen
- Nach Frontend-Änderungen
- Vor Releases
- Als Teil der vollständigen System-Validierung

---

## Skill 7: Report Coordination & Command Dispatch

### Zweck
Meta-Skill: Alle Ergebnisse zusammenführen, Aufgaben delegieren. Beantwortet: "Was ist der Gesamtzustand? Was muss passieren?"

### Fokusbereich

**Report-Konsolidierung:**
- Alle Reports aus Skills 1-6 einlesen
- VS Code Agent Reports aus `.technical-manager/inbox/agent-reports/` einlesen
- Session Reports aus `.claude/reports/current/` einlesen (SESSION_BRIEFING, CONSOLIDATED_REPORT)
- Cross-Referencing: Stimmen Docker-Status (Skill 1) mit API-Responses (Skill 5) überein?
- Widersprüche identifizieren

**Prioritäten-Matrix erstellen:**
- Kritisch: Service down, Tests rot, Security Alerts
- Hoch: Performance-Degradation, Stale Branches mit Konflikten
- Mittel: Offene Issues, fehlende Tests
- Niedrig: Doku-Updates, Refactoring-Opportunities

**Developer Commands formulieren:**
- Präzise Anweisungen für VS Code Agents
- Format: Agent-Name, Modus (Plan/Edit), exakte Aufgabe, Erfolgskriterien
- Ablage in `.technical-manager/commands/pending/`
- Ziel-Agents: system-control, esp32-dev, server-dev, mqtt-dev, frontend-dev, und alle Debug-Agents

**Architektur-Entscheidungen dokumentieren:**
- ADRs (Architecture Decision Records) bei größeren Änderungen
- Trade-off Analyse
- Referenz auf bestehende Patterns in `.claude/reference/patterns/`

### Workflow

```
1. Skill 1-6 Reports lesen
2. Inbox-Reports lesen
3. Gesamtbild erstellen
4. Probleme priorisieren
5. Commands für VS Code Agents schreiben
6. Entscheidungs-Log aktualisieren
```

### Output
- `reports/consolidated/session-summary-YYYY-MM-DD-HHMM.md`
- `commands/pending/*.md` (Aufgaben für VS Code Agents)

### Wann einsetzen
- Am Ende jeder Analyse-Session
- Wenn Robin "Was ist der Stand?" fragt
- Als Brücke zwischen Analyse und Implementierung

---

## Skill 8: Strategic Planning (IST/SOLL-Analyse)

### Zweck
Neue Ideen und Vorhaben systematisch durchdenken, recherchieren und gegen den IST-Zustand abgleichen. Beantwortet: "Was muss passieren, um von hier nach dort zu kommen?"

### Ablauf

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ 1. IDEE      │────▶│ 2. RECHERCHE │────▶│ 3. IST-ANALYSE   │
│ Robin erklärt│     │ Web + Doku   │     │ System erkunden  │
│ sein Ziel    │     │ Best Practices│    │ Was gibt es schon│
└──────────────┘     └──────────────┘     └────────┬─────────┘
                                                    │
┌──────────────┐     ┌──────────────┐     ┌────────┴─────────┐
│ 6. ROADMAP   │◀────│ 5. GAP-      │◀────│ 4. SOLL-ZUSTAND  │
│ Schritte +   │     │ ANALYSE      │     │ Ziel definieren  │
│ Reihenfolge  │     │ Was fehlt?   │     │ mit Recherche    │
└──────────────┘     └──────────────┘     └──────────────────┘
```

### Phase 1: Idee erfassen
- Robin beschreibt eine Idee, ein Feature, eine Architekturänderung
- TM stellt gezielte Rückfragen zum Scope und zur Priorität
- Klärung: Ist das eine Erweiterung des bestehenden Systems oder etwas komplett Neues?

### Phase 2: Gezielte Recherche
- Internetrecherche NUR wenn nötig und NUR gezielt
- Beispiele: Neue Technologie evaluieren, Best Practices für ein Pattern, Pricing/Limits eines Services
- Quellen priorisieren: Offizielle Docs > GitHub Repos > Blog Posts > Foren
- Ergebnis: Kompakte Zusammenfassung der relevanten Erkenntnisse

### Phase 3: IST-Zustand erfassen
- Bestehende System-Komponenten die betroffen sind identifizieren
- Relevante Skills (1-6) gezielt einsetzen um aktuellen Stand zu ermitteln
- Bestehende Doku lesen: `.claude/reference/`, Docker-Configs, CI-Workflows
- KEINE Code-Analyse – wenn Code-Details nötig sind, wird ein kurzer VS Code Agent Command formuliert

### Phase 4: SOLL-Zustand definieren
- Recherche-Ergebnisse + Robins Vision → konkretes Zielbild
- Was soll am Ende stehen?
- Welche neuen Komponenten/Services/Configs sind nötig?
- Welche bestehenden Teile müssen angepasst werden?

### Phase 5: Gap-Analyse (IST vs. SOLL)
- Tabellarische Gegenüberstellung:

```
| Bereich          | IST-Zustand              | SOLL-Zustand             | Gap/Aufwand     |
|------------------|--------------------------|--------------------------|-----------------|
| Docker Services  | 9 Container              | 11 Container (+InfluxDB, | 2 neue Services |
|                  |                          | +Telegraf)               | + Compose-Update|
| CI/CD            | 4 Workflows              | 5 Workflows (+deploy)    | 1 neuer Workflow|
| ...              | ...                      | ...                      | ...             |
```

- Abhängigkeiten zwischen Gaps identifizieren
- Risiken benennen (Breaking Changes, Performance Impact, Budget)

### Phase 6: Roadmap erstellen
- Phasenplan mit klarer Reihenfolge
- Pro Phase: Betroffene Komponenten, zuständiger VS Code Agent, Erfolgskriterien
- Zeitschätzung (grob: Stunden/Tage, nicht Minuten)
- Checkpoints für Review

### Regeln
- Recherche ist OPTIONAL – nur wenn Robin oder der TM echtes Wissenslücken haben
- IST-Zustand kommt primär aus eigenen Skills und vorhandener Doku
- Wenn Code-Details nötig: Kurzer, präziser VS Code Agent Command (max 5 Zeilen Auftrag)
- Output ist ein PLAN, keine Implementierung
- Robin entscheidet am Ende ob und wie der Plan umgesetzt wird

### Output
`reports/strategic/plan-[thema]-YYYY-MM-DD.md`

### Wann einsetzen
- Robin sagt: "Ich hab eine Idee..."
- Robin sagt: "Ich will X einbauen/ändern/hinzufügen"
- Vor größeren Architekturänderungen
- Bei Technologie-Evaluierungen

---

## Skill 9: Report Verification (Gegenprüfung)

### Zweck
Jeden TM-Bericht systematisch auf Korrektheit prüfen. Beantwortet: "Stimmt das alles auch wirklich?"

### Kernprinzip
Der TM arbeitet mit indirektem Wissen – Reports, Metriken, API-Responses. Fehler schleichen sich ein: veraltete Annahmen, falsche Pfade, nicht mehr existierende Endpoints. Dieser Skill prüft NACH der Berichterstellung gezielt die kritischen Behauptungen.

### Ablauf

```
┌────────────────┐     ┌──────────────────┐     ┌──────────────┐
│ 1. BERICHT     │────▶│ 2. CLAIMS        │────▶│ 3. VERIFY    │
│ lesen          │     │ extrahieren      │     │ Each Claim   │
│ (neuester)     │     │ (nur kritische!) │     │              │
└────────────────┘     └──────────────────┘     └──────┬───────┘
                                                        │
                       ┌──────────────────┐     ┌───────┴──────┐
                       │ 5. CORRECTIONS   │◀────│ 4. RESULT    │
                       │ ausgeben         │     │ sammeln      │
                       └──────────────────┘     └──────────────┘
```

### Phase 1: Bericht einlesen
- Den neuesten Report aus `.technical-manager/reports/` identifizieren
- Oder: Robin gibt explizit an welchen Bericht prüfen

### Phase 2: Kritische Claims extrahieren
- NUR prüfbare Faktenbehauptungen, KEINE Meinungen oder Einschätzungen
- Priorisierung nach Kritikalität:

| Kategorie | Beispiel | Priorität |
|-----------|----------|-----------|
| Service-Status | "PostgreSQL läuft auf Port 5432" | KRITISCH – sofort prüfen |
| Konfiguration | "Loki Retention ist 7 Tage" | KRITISCH – Config lesen |
| Zahlen/Counts | "163 Wokwi-Szenarien aktiv" | HOCH – verifizierbar |
| Pfadangaben | "Report liegt in .claude/reports/current/" | HOCH – Filesystem prüfen |
| Versionsnummern | "Prometheus v3.2.1" | MITTEL – docker inspect |
| Architektur-Claims | "Frontend verbindet über Host-Port" | NIEDRIG – aus Doku |

- Nur KRITISCH und HOCH werden aktiv gegengeprüft
- MITTEL nur wenn schnell überprüfbar (ein Befehl)
- NIEDRIG wird übersprungen außer bei explizitem Verdacht

### Phase 3: Gegenprüfung durchführen
**Mit eigenen Tools (bevorzugt):**
- Docker-Befehle: `docker ps`, `docker inspect`, `docker stats`
- Filesystem: Config-Dateien lesen (compose, prometheus.yml, loki-config.yml)
- Git: `git log`, `git status`, `git branch`
- HTTP: Health-Endpoints, API-Queries, Monitoring-APIs
- Referenz-Doku: `.claude/reference/` Dateien

**Wenn Code-Details nötig sind (Ausnahme):**
- KURZE und PRÄZISE Entwickleranweisungen formulieren
- Direkt an spezifischen VS Code Agent adressiert
- Format:

```
@[agent-name] – Kurz-Verifizierung (Edit Mode)

Prüfe: [exakte Frage]
Antwort als Chat-Nachricht: [was genau zurückmelden]
Max 5 Zeilen Output.
```

- Beispiel:

```
@server-dev – Kurz-Verifizierung (Edit Mode)

Prüfe: Existiert der Endpoint /api/v1/health/live in den Routers?
Antwort als Chat-Nachricht: "Ja, in [Datei]" oder "Nein, nicht gefunden"
Max 5 Zeilen Output.
```

- Diese Micro-Commands werden von Robin an VS Code weitergeleitet
- Antwort fließt zurück in die Verifizierung

### Phase 4: Ergebnisse sammeln

```
| Claim | Quelle | Verifiziert? | Korrekt? | Korrektur |
|-------|--------|-------------|----------|-----------|
| PostgreSQL Port 5432 | docker ps | ✅ | ✅ | - |
| Loki Retention 7d | loki-config.yml | ✅ | ✅ | - |
| 163 Wokwi Szenarien | Needs VS Code | ⏳ | - | Micro-Command formuliert |
| Migration HEAD 950ad... | alembic current | ✅ | ❌ | Aktuell: abc123... |
```

### Phase 5: Korrekturen ausgeben
- Nur tatsächliche Fehler melden (nicht alles was geprüft wurde)
- Pro Fehler: Was steht im Bericht, was ist die Realität, wie korrigieren
- Wenn Micro-Commands nötig waren: Diese als Block zum Kopieren bereitstellen

### Regeln
- Verifizierung ist NICHT erschöpfend – nur kritische und prüfbare Claims
- Verhältnismäßigkeit: 5-Minuten-Report bekommt keine 30-Minuten-Verifizierung
- Code-Checks sind die AUSNAHME, nicht die Regel
- Micro-Commands an VS Code Agents: Maximal 3 pro Verifizierung
- Wenn ein Bericht grundsätzlich fragwürdig erscheint → Skill 1-6 komplett neu ausführen statt einzelne Claims zu prüfen

### Output
`reports/verification/verify-[original-report]-YYYY-MM-DD.md`

### Wann einsetzen
- Automatisch nach jedem Skill 7 (Report Coordination) Output
- Vor Übergabe von Plänen an VS Code Agents
- Wenn Robin sagt: "Prüf das nochmal"
- Bei widersprüchlichen Informationen zwischen Reports

---

## Skill-Abhängigkeiten und Reihenfolge

### Typische Session-Reihenfolge

```
Session Start
│
├─▶ Skill 1 (Docker)          ← IMMER zuerst
│   └─▶ Skill 2 (Monitoring)  ← nur wenn Monitoring-Profile aktiv
│
├─▶ Skill 3 (Git)             ← parallel zu Skill 1 möglich
│
├─▶ Skill 4 (CI/CD)           ← nach Skill 3 (braucht Branch-Kontext)
│
├─▶ Skill 5 (API Probing)     ← nach Skill 1 (Container müssen laufen)
│   └─▶ Skill 6 (Browser)     ← nach Skill 5 (APIs müssen antworten)
│
├─▶ Skill 7 (Coordination)    ← IMMER am Ende, fasst alles zusammen
│   └─▶ Skill 9 (Verification)← nach Skill 7, prüft den Output
│
└─▶ Skill 8 (Strategic Plan)  ← on demand, wenn Robin eine Idee hat
    └─▶ Skill 9 (Verification)← prüft den Plan gegen Realität
```

### Abhängigkeitsmatrix

| Skill | Benötigt vorher | Kann parallel zu |
|-------|----------------|-----------------|
| 1. Docker | - | 3. Git |
| 2. Monitoring | 1. Docker (Container laufen) | - |
| 3. Git | - | 1. Docker |
| 4. CI/CD | 3. Git (Branch-Kontext) | 2. Monitoring |
| 5. API Probing | 1. Docker (Services up) | 4. CI/CD |
| 6. Browser | 5. API Probing (Backend OK) | - |
| 7. Coordination | 1-6 (alle verfügbaren) | - |
| 8. Strategic Plan | Situationsabhängig | - |
| 9. Verification | 7 oder 8 (Bericht existiert) | - |

---

## Ordnerstruktur für den TM

```
.technical-manager/
├── skills/
│   ├── 01-docker-health/
│   │   └── SKILL.md
│   ├── 02-monitoring/
│   │   └── SKILL.md
│   ├── 03-git-health/
│   │   └── SKILL.md
│   ├── 04-ci-cd-github/
│   │   └── SKILL.md
│   ├── 05-api-probing/
│   │   └── SKILL.md
│   ├── 06-browser-testing/
│   │   └── SKILL.md
│   ├── 07-report-coordination/
│   │   └── SKILL.md
│   ├── 08-strategic-planning/
│   │   └── SKILL.md
│   └── 09-report-verification/
│       └── SKILL.md
│
├── reports/
│   ├── system-health/          ← Skill 1 Output
│   ├── monitoring/             ← Skill 2 Output
│   ├── git-status/             ← Skill 3 Output
│   ├── github-status/          ← Skill 4 Output
│   ├── api-probing/            ← Skill 5 Output
│   ├── ui-tests/               ← Skill 6 Output
│   ├── consolidated/           ← Skill 7 Output
│   ├── strategic/              ← Skill 8 Output
│   └── verification/           ← Skill 9 Output
│
├── commands/
│   ├── pending/                ← Commands für VS Code Agents
│   └── completed/              ← Archiv erledigter Commands
│
├── inbox/
│   ├── agent-reports/          ← VS Code schreibt hier rein
│   └── system-logs/            ← Automatische Status-Updates
│
├── config/
│   ├── mcp-access-rules.md     ← Welche Pfade/Tools erlaubt
│   └── tool-permissions.md     ← Tool-spezifische Regeln
│
└── README.md                   ← Übersicht für den TM
```

---

## MCP-Tool-Zuordnung pro Skill

| Skill | Filesystem (read) | Bash (docker/git) | Web (search/fetch) | Browser (Playwright) |
|-------|:-:|:-:|:-:|:-:|
| 1. Docker Health | ✅ compose, .env.example | ✅ docker ps/stats/inspect | – | – |
| 2. Monitoring | ✅ monitoring configs | ✅ docker logs | ✅ Prometheus/Loki/Grafana APIs | – |
| 3. Git Health | ✅ .gitignore | ✅ git status/log/branch | – | – |
| 4. CI/CD GitHub | ✅ .github/workflows/, Makefile | ✅ git | ✅ GitHub API/Web | – |
| 5. API Probing | ✅ .claude/reference/api/ | ✅ curl | – | – |
| 6. Browser Testing | – | – | – | ✅ Playwright |
| 7. Coordination | ✅ reports, inbox, .claude/reports/ | – | – | – |
| 8. Strategic Plan | ✅ alle erlaubten Pfade | ✅ docker, git | ✅ Recherche | – |
| 9. Verification | ✅ alle erlaubten Pfade | ✅ docker, git, curl | ✅ bei Bedarf | ✅ bei Bedarf |