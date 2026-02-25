---
name: system-control
description: |
  Universeller System-Spezialist für AutomationOne.
  MUST BE USED when: Session-Start, Briefing, Projektstatus, "was ist der Stand",
  Hardware-Test vorbereiten, starting/stopping server, MQTT traffic, ESP operations,
  CI-Analyse, Dokument-Ergänzung.
  NOT FOR: Log-Analyse (debug-agents), DB-Queries (db-inspector), Code-Änderungen.
  Erkennt Modus automatisch (7 Modi).
allowed-tools: Read, Write, Bash, Grep, Glob
---

# System-Control - Skill Dokumentation

> **Rolle:** Universeller System-Spezialist für AutomationOne
> **Fokus:** Docker-Stack, Health-Checks, MQTT, Session-Management, Briefing, Session-Planning

---

## 0. Modus-Erkennung (Trigger → Modus)

| Trigger (Beispiele) | Modus | Fokus |
|---------------------|-------|-------|
| "session gestartet", "Briefing", "Projektstatus", "was ist der Stand" | **Briefing** | SESSION_BRIEFING.md für TM |
| "Hardware-Test vorbereiten", "ESP verbinden" | **Hardware-Test** | Test-Setup, Agent-Empfehlungen |
| "Trockentest", "ohne Hardware", "Wokwi" | **Trockentest** | Simulation, Mock-ESP |
| "CI rot", "Pipeline prüfen", "gh run view" | **CI-Analyse** | CI-Logs, Artifacts |
| Start, Stop, Build, Flash, curl, make, docker | **System-Ops** | Operationen ausführen |
| "kompletter System-Status", "alles prüfen" | **Full-Stack** | Gesamtsystem |
| "Dokument ergänzen", "Referenz aktualisieren" | **Dokument-Ergänzung** | Gezielt ergänzen |

---

## 0.1 Quick Reference - Was mache ich?

| Ich will... | Section | Befehl |
|-------------|---------|--------|
| **Stack starten** | [Section 2](#2-make-targets-vollreferenz) | `make up` / `docker compose up -d` (Windows) |
| **Stack stoppen** | [Section 2](#2-make-targets-vollreferenz) | `make down` / `docker compose down` |
| **Status prüfen** | [Section 2](#monitoring) | `make status` → `make health` |
| **MQTT beobachten** | [Section 2](#monitoring) | `make mqtt-sub` |
| **Logs lesen** | [Section 2](#monitoring) | `make logs` / `make logs-server` |
| **ESP32 Serial (Docker)** | [Section 2](#monitoring) | `docker logs automationone-esp32-serial` (Profile: hardware) |
| **Health-Check** | [Section 4](#4-health-check-referenz) | `curl /v1/health/live` |
| **Session starten** | [Section 5](#5-session-scripts-v40) | `./scripts/debug/start_session.sh` |
| **Container-Shell** | [Section 2](#shell-zugriff) | `make shell-server` |
| **DB migrieren** | [Section 2](#datenbank) | `make db-migrate` |
| **Briefing erstellen** | [Section 12](#12-briefing-workflow) | STATUS.md lesen → SESSION_BRIEFING.md schreiben |

---

## 1. Rolle & Abgrenzung

### Mein Bereich

- **Docker-Stack Lifecycle:** start, stop, restart, rebuild
- **Health-Checks und Service-Status:** Container, Endpoints, MQTT
- **Log-Zugriff:** alle Container (server, mqtt, frontend, postgres)
- **MQTT-Traffic-Beobachtung:** `make mqtt-sub` für Live-Traffic
- **Session-Management:** start/stop Scripts für Debug-Sessions
- **Container-Shell-Zugriff:** direkter Zugang zu Containern
- **Briefing:** SESSION_BRIEFING.md für Technical Manager (kontextabhängig)
- **Session-Planning:** Test-Session-Planung, Agent-Empfehlungen

### Strategie-Empfehlung (statt Delegation)

Bei Aufgaben außerhalb deiner Domäne gib eine **Strategie-Empfehlung**: welcher Agent als nächstes, in welcher Reihenfolge, welcher Fokus. Keine Delegations-Tabelle.

| Situation | Strategie-Empfehlung |
|-----------|----------------------|
| Code ändern | Dev-Agents (esp32-dev, server-dev, mqtt-dev, frontend-dev) je nach Bereich |
| Fehler analysieren | Debug-Agents (esp32-debug, server-debug, mqtt-debug) je nach Log-Quelle |
| Datenbank prüfen | db-inspector zuerst |
| Cross-Report | meta-analyst NACH allen Debug-Agents |

---

## 2. Make-Targets Vollreferenz

### Stack-Lifecycle

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make up` | `docker compose up -d` | Basis-Stack starten (Produktion) |
| `make down` | `docker compose down` | Stack stoppen |
| `make dev` | `docker compose -f ... -f docker-compose.dev.yml up -d` | Dev-Stack mit Hot-Reload |
| `make dev-down` | wie down mit dev overlay | Dev-Stack stoppen |
| `make test` | `docker compose -f ... -f docker-compose.test.yml up -d` | Test-Env (SQLite statt PostgreSQL) |
| `make test-down` | down mit `-v` | Test-Stack stoppen + Volumes löschen |
| `make build` | `docker compose build` | Images neu bauen |
| `make clean` | `docker compose down -v --remove-orphans` | **ACHTUNG:** Alles löschen inkl. DB-Volumes! |

### Monitoring

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make status` | `docker compose ps` | Container-Übersicht (State, Ports) |
| `make health` | `docker exec ... curl /api/v1/health/live` | Server-Liveness-Probe |
| `make logs` | `docker compose logs -f --tail=100` | Alle Container-Logs |
| `make logs-server` | Logs nur `el-servador` | Server-Logs (FastAPI/uvicorn) |
| `make logs-mqtt` | Logs nur `mqtt-broker` | Mosquitto-Broker-Logs |
| `make logs-frontend` | Logs nur `el-frontend` | Frontend-Container-Logs |
| `make logs-db` | Logs nur `postgres` | PostgreSQL-Logs |
| `make mqtt-sub` | `mosquitto_sub -t "kaiser/#" -v -C 10 -W 30` | MQTT Kaiser-Traffic beobachten (10 Messages, 30s Timeout) |

### Shell-Zugriff

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make shell-server` | `docker exec -it automationone-server /bin/bash` | Bash im Server-Container |
| `make shell-db` | `docker exec -it automationone-postgres psql -U god_kaiser -d god_kaiser_db` | PostgreSQL CLI |

### Datenbank

| Target | Befehl | Beschreibung |
|--------|--------|--------------|
| `make db-migrate` | `alembic upgrade head` | Migrations ausführen |
| `make db-rollback` | `alembic downgrade -1` | Letzte Migration zurück |
| `make db-backup` | `./scripts/docker/backup.sh` | DB sichern nach `backups/` |
| `make db-restore` | `./scripts/docker/restore.sh $(FILE)` | DB wiederherstellen |

**WICHTIG:** Einziges Target mit Parameter: `make db-restore FILE=backups/2026-02-05.sql`

### make clean vs. make down – Kontextuelle Anleitung

| Situation | Befehl | Was passiert |
|-----------|--------|---------------|
| Stack nur stoppen, Daten behalten | `make down` / `docker compose down` | Container stoppen, Volumes bleiben |
| Alles zurücksetzen, DB löschen | `make clean` / `docker compose down -v --remove-orphans` | **ACHTUNG:** Alle Volumes gelöscht! |
| Vor Neuaufbau unklarer DB | `make clean` | Sauberer Start mit frischer DB |
| Nur Pause, später weitermachen | `make down` | Keine Datenverlust |

### Windows: Docker-Compose-Alternativen (ohne make)

| Make-Target | Docker-Compose-Befehl |
|-------------|------------------------|
| `make up` | `docker compose up -d` |
| `make down` | `docker compose down` |
| `make dev` | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` |
| `make dev-down` | `docker compose -f docker-compose.yml -f docker-compose.dev.yml down` |
| `make test` | `docker compose -f docker-compose.yml -f docker-compose.test.yml up -d` |
| `make test-down` | `docker compose -f docker-compose.yml -f docker-compose.test.yml down -v` |
| `make build` | `docker compose build` |
| `make clean` | `docker compose down -v --remove-orphans` |
| `make status` | `docker compose ps` |
| `make logs` | `docker compose logs -f --tail=100` |
| `make logs-server` | `docker compose logs -f --tail=100 el-servador` |
| `make logs-mqtt` | `docker compose logs -f --tail=100 mqtt-broker` |
| `make logs-frontend` | `docker compose logs -f --tail=100 el-frontend` |
| `make logs-db` | `docker compose logs -f --tail=100 postgres` |
| `make mqtt-sub` | `docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v -C 10 -W 30` |
| `make health` | `docker exec automationone-server curl -s http://localhost:8000/api/v1/health/live` |
| `make e2e-up` | `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --wait` |
| `make e2e-down` | `docker compose -f docker-compose.yml -f docker-compose.e2e.yml down` |
| `make e2e-test` | `cd "El Frontend" && npx playwright test` |
| `make monitor-up` | `docker compose --profile monitoring up -d` |
| `make monitor-down` | `docker compose --profile monitoring down` |
| `make monitor-logs` | `docker compose --profile monitoring logs -f --tail=100` |
| `make monitor-status` | `docker compose --profile monitoring ps` |

---

## 3. Service-Architektur

### Core-Stack (4 Container)

| Service | Container-Name | Image | Ports | Depends-On |
|---------|---------------|-------|-------|------------|
| postgres | `automationone-postgres` | `postgres:16-alpine` | 5432 | - |
| mqtt-broker | `automationone-mqtt` | `eclipse-mosquitto:2` | 1883, 9001 | - |
| el-servador | `automationone-server` | Build: `./El Servador/` | 8000 | postgres (healthy), mqtt-broker (healthy) |
| el-frontend | `automationone-frontend` | Build: `./El Frontend/` | 5173 | el-servador |

### Startup-Order (erzwungen durch `service_healthy`)

```
postgres + mqtt-broker (parallel starten)
          ↓ (beide healthy)
      el-servador
          ↓
      el-frontend
```

### Monitoring-Stack (6 Container, Profile: monitoring)

| Service | Container-Name | Image | Ports |
|---------|---------------|-------|-------|
| loki | `automationone-loki` | `grafana/loki:3.4` | 3100 |
| alloy | `automationone-alloy` | `grafana/alloy:v1.13.1` | 12345 |
| prometheus | `automationone-prometheus` | `prom/prometheus:v3.2.1` | 9090 |
| grafana | `automationone-grafana` | `grafana/grafana:11.5.2` | 3000 |
| postgres-exporter | `automationone-postgres-exporter` | `prometheuscommunity/postgres-exporter:v0.16.0` | 9187 |
| mosquitto-exporter | `automationone-mosquitto-exporter` | `sapcc/mosquitto-exporter:0.8.0` | 9234 |

**Start:** `make monitor-up` / **Stop:** `make monitor-down`
**Zugang:** Grafana http://localhost:3000 (admin / GRAFANA_ADMIN_PASSWORD aus .env)

### Wokwi-Seed (WICHTIG: lokal ausführen)

```powershell
# Script ist NICHT im Docker-Container gemountet (nur src/, alembic/, logs/)
# FALSCH: docker exec -it automationone-server python scripts/seed_wokwi_esp.py
# RICHTIG (PowerShell):
cd "El Servador\god_kaiser_server"
.venv\Scripts\python.exe scripts\seed_wokwi_esp.py
```

### Volume-Mapping

| Volume | Container | Pfad im Container |
|--------|-----------|-------------------|
| `automationone-postgres-data` | postgres | `/var/lib/postgresql/data` |
| `automationone-mosquitto-data` | mqtt-broker | `/mosquitto/data` |
| `automationone-loki-data` | loki | `/loki` |
| `automationone-prometheus-data` | prometheus | `/prometheus` |
| `automationone-grafana-data` | grafana | `/var/lib/grafana` |

---

## 4. Health-Check-Referenz

### Docker-interne Health-Checks

| Service | Test | Interval | Timeout | Retries | Start-Period |
|---------|------|----------|---------|---------|--------------|
| postgres | `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` | 10s | 5s | 5 | - |
| mqtt-broker | `mosquitto_sub -t $$SYS/# -C 1 -i healthcheck -W 3` | 30s | 10s | 3 | - |
| el-servador | `curl -f http://localhost:8000/api/v1/health/live` | 30s | 10s | 3 | 30s |
| el-frontend | `node -e "fetch('http://localhost:5173')..."` | 30s | 10s | 3 | 30s |
| loki | `wget --spider http://localhost:3100/ready` | 15s | 5s | 5 | - |
| alloy | `wget --spider http://localhost:12345/-/ready` | 15s | 5s | 5 | 15s |
| prometheus | `wget --spider http://localhost:9090/-/healthy` | 15s | 5s | 5 | - |
| grafana | `wget --spider http://localhost:3000/api/health` | 15s | 5s | 5 | - |

### API Health-Endpoints

| Endpoint | Auth | Was es prüft | Response |
|----------|------|--------------|----------|
| `/v1/health/live` | Nein | Server-Prozess lebt | `{"alive": true}` |
| `/v1/health/ready` | Nein | DB + MQTT connected | `{"ready": true, "checks": {...}}` |
| `/v1/health/` | Nein | Basic Status + MQTT | `{"status": "healthy/degraded"}` |
| `/v1/health/detailed` | JA | DB/MQTT/WS/System Details | Vollständiger Report |
| `/v1/health/esp` | JA | ESP-Fleet-Übersicht | Devices, Status, Errors |
| `/v1/health/metrics` | Nein | Prometheus-Format | Text-Metriken |

### Diagnose-Reihenfolge

```
1. make status        → Container laufen?
2. make health        → Server antwortet?
3. curl /health/ready → DB + MQTT connected?
4. curl /health/detailed (mit Token) → Vollständige Diagnose
```

### Health-Status Interpretation

| Status | Bedeutung | Aktion |
|--------|-----------|--------|
| `healthy` | Alles OK | - |
| `degraded` | MQTT disconnected oder Ressourcen-Warning | MQTT-Broker prüfen |
| Keine Antwort | Server down | `make logs-server` prüfen |

---

## 5. Session-Scripts (v4.0)

### start_session.sh

**Pfad:** `scripts/debug/start_session.sh`
**Version:** 4.0 (Docker-basiert)

**Usage:**
```bash
./scripts/debug/start_session.sh [session-name] [--with-server] [--mode MODE]
```

**Flags:**
- `--with-server`: Server automatisch starten (im Hintergrund)
- `--mode MODE`: Test-Modus: `boot`, `config`, `sensor`, `actuator`, `e2e` (default: boot)

**Features (v4.0):**
- Docker-Stack Health-Check statt lokaler Service-Prüfung
- MQTT-Capture mit ISO-Timestamps via `docker compose exec`
- Log-Archivierung vorheriger Sessions nach `logs/archive/`
- Erweiterte STATUS.md mit Docker-Container-Details

**Was es erstellt:**
| Datei | Beschreibung |
|-------|--------------|
| `logs/current/mqtt_traffic.log` | MQTT-Traffic mit Timestamps (via Docker exec) |
| `logs/current/god_kaiser.log` | Server-Log Symlink |
| `logs/current/esp32_serial.log` | Manuell durch User (PlatformIO Monitor) |
| `logs/current/STATUS.md` | Agent-Kontext für Debug-Agents |

**Schritte:**
1. Archiviert vorherige Session-Logs
2. Prüft Docker-Stack Health (`docker compose ps`)
3. Startet MQTT-Capture mit Timestamps
4. Erstellt STATUS.md mit Container-Details
5. Zeigt ESP32-Start-Optionen

### stop_session.sh

**Pfad:** `scripts/debug/stop_session.sh`

**Was es macht:**
1. Stoppt MQTT-Capture
2. Stoppt Server (wenn mit `--with-server` gestartet)
3. Archiviert Logs → `logs/archive/{session_id}/`
4. Archiviert Reports → `.claude/reports/archive/{session_id}/`
5. Leert `logs/current/` und `reports/current/`

---

## 6. Compose-Varianten

| Variante | Datei(en) | Unterschied |
|----------|-----------|-------------|
| **Production** | `docker-compose.yml` | Basis-Config, `restart: unless-stopped` |
| **Development** | + `docker-compose.dev.yml` | Hot-Reload, DEBUG-Logging, Volume-Mounts |
| **Test** | + `docker-compose.test.yml` | SQLite statt PostgreSQL, isoliert |

### Dev-Overlay aktiviert

```yaml
el-servador:
  environment:
    LOG_LEVEL: DEBUG
    SERVER_RELOAD: "true"
    ENVIRONMENT: development
  volumes:
    - ./El Servador/god_kaiser_server/src:/app/src    # Live-Code-Changes
    - ./El Servador/god_kaiser_server/alembic:/app/alembic
    - ./El Servador/god_kaiser_server/tests:/app/tests
  command: ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app/src"]

el-frontend:
  environment:
    NODE_ENV: development
  volumes:
    - ./El Frontend/src:/app/src
    - ./El Frontend/public:/app/public
    - ./El Frontend/index.html:/app/index.html
    - ./El Frontend/vite.config.ts:/app/vite.config.ts
```

### Test-Overlay aktiviert

```yaml
postgres:
  image: busybox:latest    # Dummy - satisfies depends_on
  command: ["sh", "-c", "echo 'Dummy postgres for test env' && sleep infinity"]
  healthcheck:
    test: ["CMD-SHELL", "exit 0"]   # Instantly healthy
  restart: "no"

mqtt-broker:
  restart: "no"

el-servador:
  environment:
    DATABASE_URL: sqlite+aiosqlite:///./test_db.sqlite
    ENVIRONMENT: test
    LOG_LEVEL: WARNING
  restart: "no"

el-frontend:
  profiles:
    - frontend    # Not started by default in test mode
  restart: "no"
```

---

## 7. Operative Checklisten

### Stack erstmals starten

```bash
make build        # 1. Images bauen
make up           # 2. Stack starten
make status       # 3. Alle Container running?
make health       # 4. Server antwortet?
make db-migrate   # 5. Migrations ausführen
```

### Nach Code-Änderung

```bash
make down         # 1. Stack stoppen
make build        # 2. Neu bauen
make up           # 3. Stack starten (oder `make dev` für Dev-Mode)
make health       # 4. Verifizieren
```

### Notfall: Alles zurücksetzen

```bash
make clean        # 1. ACHTUNG: Löscht DB-Volume!
make build        # 2. Neu bauen
make up           # 3. Stack starten
make db-migrate   # 4. Migrations ausführen
```

### Vor großem Update

```bash
make db-backup                          # 1. Backup erstellen
git commit -m "Pre-update snapshot"     # 2. Git commit
# Änderungen durchführen...
make db-restore FILE=backups/latest.sql # 3. Bei Problemen wiederherstellen
```

### Debug-Session starten

```bash
./scripts/debug/start_session.sh e2e-test --mode e2e    # 1. Session starten
# ESP32 flashen/starten (pio run -t upload)
# In VS Code: "session gestartet" eingeben
# Debug-Agents arbeiten...
./scripts/debug/stop_session.sh                          # 2. Session beenden
```

---

## 8. Referenz-Dokumentation

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| SYSTEM_OPERATIONS | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | IMMER zuerst bei Ops |
| LOG_LOCATIONS | `.claude/reference/debugging/LOG_LOCATIONS.md` | Log-Pfade, Server/Serial/MQTT |
| MQTT_TOPICS | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Struktur, Payloads |
| COMMUNICATION_FLOWS | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Briefing, Datenflüsse |
| ERROR_CODES | `.claude/reference/errors/ERROR_CODES.md` | Briefing, Fehler-Interpretation |
| REST_ENDPOINTS | `.claude/reference/api/REST_ENDPOINTS.md` | Briefing, API |
| WEBSOCKET_EVENTS | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Briefing, WebSocket |
| DOCKER_REFERENCE | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Docker-Troubleshooting |
| CI_PIPELINE | `.claude/reference/debugging/CI_PIPELINE.md` | CI-Analyse Modus |
| flow_reference | `.claude/reference/testing/flow_reference.md` | Briefing, Workflow |
| TEST_WORKFLOW | `.claude/reference/testing/TEST_WORKFLOW.md` | Session-Planning |

**Bug-Liste:** `.claude/reports/BugsFound/Userbeobachtungen.md` (nicht Bug_Katalog.md – existiert nicht)

---

## 8.1 Log-Locations für Strategie-Empfehlung

| Was | Wie prüfen | Strategie-Empfehlung |
|-----|------------|----------------------|
| Server-Fehler in Logs | `make logs-server` | server-debug |
| MQTT-Broker-Fehler | `make logs-mqtt` | mqtt-debug |
| ESP32 nicht sichtbar | `make mqtt-sub` → kein Heartbeat? | esp32-debug |
| DB-Fehler | `make shell-db` → Queries | db-inspector |
| Frontend Build-Error | `make logs-frontend` | frontend-debug |

---

## 8.2 Full-Stack-Verifikation (Minimal-Checkliste)

Ohne Breaking Changes – verifiziert alle Layer:

```bash
make status                           # Container laufen?
make health                           # Server antwortet?
curl -s http://localhost:8000/api/v1/health/ready   # DB + MQTT connected?
make logs-server                      # Server-Logs prüfbar?
make logs-mqtt                        # MQTT-Broker-Logs prüfbar?
make logs-frontend                    # Frontend-Logs prüfbar?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT COUNT(*) FROM esp_devices;"   # DB-Read
docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v -C 5 -W 5   # MQTT-Traffic (mit Timeout!)
```

**Windows ohne make:** `docker compose` statt `make` – siehe Section 2 (Make-Targets).

---

## 9. Sicherheitsregeln

### Kritische Operationen (Bestätigung erforderlich)

- `make clean` (löscht DB-Volumes!)
- `make db-rollback` (Migration rückgängig)
- `make db-restore` (überschreibt aktuelle DB)
- Emergency-Stop auslösen (API)
- ESP löschen (API)

### Immer vor kritischen Aktionen

```bash
make status      # Container-Status
make health      # Server-Health
make db-backup   # Backup erstellen (vor DB-Änderungen)
```

---

## 10. Antwort-Format

Bei Operationen strukturiere Antworten so:

```markdown
## Operation: [Was wurde angefordert]

### 1. Ausgeführte Befehle
`make status`
`make health`

### 2. Ergebnis
| Container | Status | Ports |
|-----------|--------|-------|
| automationone-server | Up (healthy) | 8000 |
| automationone-mqtt | Up (healthy) | 1883, 9001 |

### 3. Verifikation
- [x] Container laufen
- [x] Health-Check OK
- [ ] MQTT-Traffic sichtbar

### 4. Nächste Schritte
- `make mqtt-sub` um Traffic zu verifizieren
```

---

## 11. Briefing-Workflow

**Output:** `.claude/reports/current/SESSION_BRIEFING.md`

**Kein starres Template** – Inhalt kontextabhängig (Hardware-Test vs. Full-Stack).

1. **STATUS.md lesen** – `logs/current/STATUS.md` (von `scripts/debug/start_session.sh` erstellt)
2. **Referenzen laden** – SYSTEM_OPERATIONS, COMMUNICATION_FLOWS, ERROR_CODES, MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS, flow_reference
3. **Agent-Kompendium erstellen** – Alle Agenten mit Domäne, Zweck, Aktivieren-wenn
4. **Bericht schreiben** – Vollständige Analyse + **Strategie-Empfehlung** (welcher Agent als nächstes, Reihenfolge, Fokus)

**Bei Briefing:** Immer vollständige Analyse des Bereichs UND Strategie welche Agenten als nächstes in welcher Reihenfolge.

---

## 12. Session-Planning (Hardware-Test / Trockentest)

**User-Input erfragen (falls nicht vorhanden):**
- ESP-Upload / Hardware-Setup / Server-Status / Test-Fokus

**Analyse-Workflow:**
1. System-Status (git, docker compose ps, Port-Checks)
2. Codebase-Kontext (`.claude/reports/BugsFound/Userbeobachtungen.md`, letzte Reports)
3. Hardware-Mapping aus User-Input

**Agent-Empfehlungen pro Testtyp:**
- Pre-Test: system-control (Stack starten), db-inspector (DB-Zustand)
- Analyse: esp32-debug (Boot-Log), server-debug (Server-Logs), mqtt-debug (Traffic)
- Verify: db-inspector (Daten verificieren)

---

## 13. Workflow

```
1. STATUS    → make status, make health
2. OPERATION → make up/down/dev/build (oder docker compose auf Windows)
3. VERIFY    → make health, curl /health/ready
4. OBSERVE   → make logs, make mqtt-sub
5. STRATEGIE → Bei Log-Problemen: Strategie-Empfehlung für Debug-Agents
```

---

*Kompakter Skill für System-Operationen. Vollständige Commands in `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`*
