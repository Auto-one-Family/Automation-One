# AutomationOne - Agent Instructions

> **Projekt:** IoT-Framework fuer Gewaechshausautomation
> **Prinzip:** Server-Zentrisch. ESP32 = dumme Agenten. ALLE Logik auf Server.

```
El Frontend (Vue 3) <-HTTP/WS-> El Servador (FastAPI) <-MQTT-> El Trabajante (ESP32)
```

---

## Cursor Cloud specific instructions

### Architecture Overview

AutomationOne ist ein IoT-Framework mit 3 Schichten:

| Service | Stack | Port |
|---------|-------|------|
| **El Servador** (Backend) | Python 3.11+, FastAPI, SQLAlchemy, Alembic | 8000 |
| **El Frontend** (Dashboard) | Vue 3, TypeScript, Vite, Tailwind CSS | 5173 |
| **PostgreSQL** | Docker: `postgres:16-alpine` | 5432 |
| **Mosquitto MQTT** | Docker: `eclipse-mosquitto:2` | 1883, 9001 |

### Domain-Wissen (Compact)

- 9 Sensortypen: pH, EC, Temp, Humidity, Soil, Pressure, CO2, Light, Flow
- 4 Aktortypen: Pump, Valve, PWM, Relay
- PostgreSQL (32 Tabellen), MQTT (Mosquitto), Grafana+Prometheus Monitoring
- HardwareView: 3-Level-Zoom (L1 Uebersicht → L2 Orbital/Device → L3 Modals), Route-basiert
- Sensor-Konfiguration NUR in HardwareView (SensorConfigPanel). Komponenten-Tab (/sensors) = Wissensdatenbank
- Mock vs. Real ESP klar trennen. Zone auf Geraetebene, Subzone pro Sensor
- Datenfluss Sensor: ESP32 → MQTT → Handler → SensorLibrary → DB → WebSocket → Frontend
- Datenfluss Aktor: Frontend → REST API → SafetyCheck → MQTT → ESP32

### Starting Services

1. **Start Docker daemon** (required in Cloud VM):
   ```bash
   sudo dockerd &>/tmp/dockerd.log &
   sleep 3
   sudo chmod 666 /var/run/docker.sock
   docker network create shared-infra-net 2>/dev/null || true
   ```

2. **Start infrastructure** (PostgreSQL + Mosquitto):
   ```bash
   cd /workspace && docker compose up -d postgres mqtt-broker
   ```
   Wait for containers to be healthy before starting the backend.

3. **Start backend** (El Servador):
   ```bash
   cd "/workspace/El Servador/god_kaiser_server"
   export DATABASE_URL="postgresql+asyncpg://god_kaiser:CHANGE_ME_USE_STRONG_PASSWORD@localhost:5432/god_kaiser_db"
   export DATABASE_AUTO_INIT=true
   export MQTT_BROKER_HOST=localhost
   export MQTT_BROKER_PORT=1883
   export JWT_SECRET_KEY=dev-secret-key-for-testing-only
   export ENVIRONMENT=development
   export LOG_LEVEL=INFO
   poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Start frontend** (El Frontend):
   ```bash
   cd "/workspace/El Frontend"
   VITE_API_URL=http://localhost:8000 VITE_WS_URL=ws://localhost:8000 npx vite --host 0.0.0.0 --port 5173
   ```

### Running Tests

- **Backend tests**: `cd "/workspace/El Servador/god_kaiser_server" && poetry run pytest tests/ --timeout=120`
  - 1820+ unit/integration tests; E2E tests need `--e2e` flag and running stack
- **Backend lint**: `cd "/workspace/El Servador/god_kaiser_server" && poetry run ruff check src/`
- **Frontend tests**: `cd "/workspace/El Frontend" && npx vitest run`
  - 1581+ unit tests (47 test files)
- **Frontend type-check**: `cd "/workspace/El Frontend" && npx vue-tsc --noEmit`
- **Frontend build**: `cd "/workspace/El Frontend" && npx vite build`

### Gotchas

- `docker-compose.yml` references external network `shared-infra-net` — must create with `docker network create shared-infra-net` before starting services
- Docker daemon in Cloud VM needs `fuse-overlayfs` storage driver and `iptables-legacy` for nested container support
- Backend env vars use `DATABASE_URL` with `postgresql+asyncpg://` scheme (async driver), not plain `postgresql://`
- Default dev password is `CHANGE_ME_USE_STRONG_PASSWORD` — Docker PostgreSQL container is created with it
- First-time setup requires admin user via `POST /api/v1/auth/setup` with `{"username":"admin","password":"Admin123!","email":"admin@automationone.dev"}`
- Backend Poetry virtualenv is in-project at `El Servador/god_kaiser_server/.venv`
- `Makefile` provides Docker Compose shortcuts; see `make help`
- ESP32 firmware (`El Trabajante/`) is optional for dev — Mock ESPs via Debug API

---

## Verifikationskriterien

Nach JEDER Code-Aenderung die passenden Checks ausfuehren:

| Bereich | Befehl | Erfolgskriterium |
|---------|--------|-----------------|
| ESP32 Firmware | `cd "El Trabajante" && pio run -e seeed` | Exit-Code 0, keine Errors |
| Server Backend | `cd "/workspace/El Servador/god_kaiser_server" && poetry run pytest tests/ --timeout=120 --tb=short -q` | Alle Tests gruen |
| Server Lint | `cd "/workspace/El Servador/god_kaiser_server" && poetry run ruff check src/` | Keine Errors |
| Frontend Build | `cd "/workspace/El Frontend" && npx vite build` | Exit-Code 0, keine TS-Errors |
| Frontend Types | `cd "/workspace/El Frontend" && npx vue-tsc --noEmit` | Keine Type-Errors |
| Docker | `docker compose ps` | Alle Services "healthy" oder "running" |

**Regel:** Kein Commit ohne gruene Verifikation im betroffenen Bereich. Bei Failures: zuerst fixen, dann committen.

---

## Sub-Agent Routing

### Wann parallel dispatchen
- 3+ unabhaengige Tasks ODER unabhaengige Domaenen (ESP32/Server/Frontend/MQTT)
- Kein geteilter State, klare Datei-Grenzen

### Wann sequentiell dispatchen
- Tasks haben Abhaengigkeiten (Output A = Input B)
- Geteilte Dateien oder State
- Unklarer Scope — erst analysieren, dann implementieren

### Sub-Agent Qualitaet (PFLICHT)
Jede Sub-Agent-Invocation muss enthalten:
1. **Scope:** Welche Dateien/Module betroffen
2. **Kontext:** Aktueller Zustand, was wurde bereits getan
3. **Deliverables:** Was genau soll geliefert werden
4. **Erfolgs-Kriterien:** Woran erkennt man Fertigstellung

### Basis-Regeln
- OHNE PAUSE durcharbeiten — NIEMALS "Soll ich fortfahren?" fragen
- Conventional Commits: feat/fix/chore/refactor/docs/test
- Eine logische Aenderung pro Commit

---

## Skill-Routing

Skills unter `.claude/skills/` enthalten tiefes Domainwissen. Bei passenden Trigger-Keywords den Skill lesen.

| Trigger-Keywords | Skill-Pfad |
|------------------|------------|
| ESP32, C++, Sensor, Aktor, GPIO, PlatformIO, Wokwi | `.claude/skills/esp32-development/SKILL.md` |
| Python, FastAPI, MQTT-Handler, Database, API, Endpoint | `.claude/skills/server-development/SKILL.md` |
| Vue 3, TypeScript, Pinia, WebSocket, Dashboard, Komponente | `.claude/skills/frontend-development/SKILL.md` |
| MQTT Topic, Publisher, Subscriber, Payload-Schema, QoS | `.claude/skills/mqtt-development/SKILL.md` |
| DB, Schema, Query, Migration, Alembic, PostgreSQL | `.claude/skills/db-inspector/SKILL.md` |
| ESP32 Serial, Boot, NVS, GPIO-Fehler, Watchdog, Crash | `.claude/skills/esp32-debug/SKILL.md` |
| FastAPI Logs, Handler-Error, Error 5xxx | `.claude/skills/server-debug/SKILL.md` |
| MQTT Traffic, Broker, Topic-Analyse, QoS-Problem | `.claude/skills/mqtt-debug/SKILL.md` |
| Frontend Build-Error, Vue-Component, Vite, WebSocket-Bug | `.claude/skills/frontend-debug/SKILL.md` |
| Test-Failures, CI rot, pytest/Vitest/Playwright Logs | `.claude/skills/test-log-analyst/SKILL.md` |
| Cross-System Analyse, Pattern-Konsistenz, Dev-Handoff | `.claude/skills/meta-analyst/SKILL.md` |
| Agent-Flow pruefen, IST-SOLL, Agent-Korrektur | `.claude/skills/agent-manager/SKILL.md` |
| KI-Audit, Bereich auf KI-Fehler pruefen | `.claude/skills/ki-audit/SKILL.md` |
| Docs aktualisieren nach Code-Aenderung | `.claude/skills/updatedocs/SKILL.md` |
| Git-Commit vorbereiten, Changes analysieren | `.claude/skills/git-commit/SKILL.md` |
| Plan Reality-Check gegen Codebase | `.claude/skills/verify-plan/SKILL.md` |
| Hardware-Test, Sensor testen | `.claude/skills/hardware-test/SKILL.md` |
| Reports sammeln, konsolidieren, archivieren | `.claude/skills/collect-reports/SKILL.md` |
| System-Status, Session-Start, Briefing, Ops | `.claude/skills/system-control/SKILL.md` |
| Plan praezise ausfuehren | `.claude/skills/do/SKILL.md` |
| Git/GitHub Analyse, Repo-Health | `.claude/skills/git-health/SKILL.md` |

---

## Referenz-Dokumente

Tiefe technische Referenzen unter `.claude/reference/`:

| Pfad | Inhalt |
|------|--------|
| `.claude/reference/api/MQTT_TOPICS.md` | MQTT Topic-Katalog mit Schema |
| `.claude/reference/api/REST_ENDPOINTS.md` | ~170 REST-Endpoints |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | 26+ WebSocket Events |
| `.claude/reference/errors/ERROR_CODES.md` | Error-Codes: ESP32 1000-4999, Server 5000-5699 |
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | End-to-End Datenfluesse |
| `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | Abhaengigkeitsgraph |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Log-Pfade aller Services |
| `.claude/reference/testing/TEST_WORKFLOW.md` | Test-Strategie |
| `.claude/reference/security/PRODUCTION_CHECKLIST.md` | Security-Hardening |
| `.claude/reference/TM_WORKFLOW.md` | Technical-Manager Workflow |

---

## Globale Regeln

1. **Server-Zentrisch** — Logic NIEMALS auf ESP32. ESP32 = dumme Agenten.
2. **Patterns erweitern** — Bestehenden Code analysieren, existierende Patterns befolgen.
3. **Build verifizieren** — Verifikationskriterien-Tabelle oben nutzen.
4. **Safety-First** — Alle Aktor-Befehle durch Safety-Check. Emergency-Stop immer sichtbar.
5. **Keine Secrets im Code** — JWT, DB-Passwoerter, API-Keys nie hardcoden.

---

## Orchestrator: auto-debugger (optional, Claude Code)

Fuer strukturierte Incident-Laeufe oder additive Verbesserung von Markdown-Artefakten.
Steuerdatei unter `.claude/auftraege/auto-debugger/inbox/` (Vorlage: `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md`).
Branch: `auto-debugger/work` (von `master`).
Kette: `TASK-PACKAGES.md` → `verify-plan` → `VERIFY-PLAN-REPORT.md` → Plan-Anpassung → `SPECIALIST-PROMPTS.md` → Dev-Umsetzung.
Skill: `.claude/skills/auto-debugger/SKILL.md`.
