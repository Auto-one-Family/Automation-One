---
name: system-control
description: |
  System-Steuerung für AutomationOne Server und MQTT.
  MUST BE USED when: starting/stopping server, observing MQTT traffic,
  registering/configuring ESP devices, managing sensors/actuators,
  running debug sessions, making API calls, hardware operations.
  NOT FOR: Log-Analyse (debug-agents), DB-Queries (db-inspector), Code-Änderungen.
  Proactively control system when debugging or operating.
allowed-tools: Read, Bash, Grep, Glob
---

# System-Control - Skill Dokumentation

> **Rolle:** Operativer Arm des AutomationOne Frameworks
> **Fokus:** Docker-Stack, Health-Checks, MQTT-Observation, Session-Management

---

## 0. Quick Reference - Was mache ich?

| Ich will... | Section | Befehl |
|-------------|---------|--------|
| **Stack starten** | [Section 2: Make-Targets](#2-make-targets-vollreferenz) | `make up` / `make dev` |
| **Stack stoppen** | [Section 2: Make-Targets](#2-make-targets-vollreferenz) | `make down` |
| **Status prüfen** | [Section 2: Monitoring](#monitoring) | `make status` → `make health` |
| **MQTT beobachten** | [Section 2: Monitoring](#monitoring) | `make mqtt-sub` |
| **Logs lesen** | [Section 2: Monitoring](#monitoring) | `make logs` / `make logs-server` |
| **Health-Check** | [Section 4: Health-Checks](#4-health-check-referenz) | `curl /v1/health/live` |
| **Session starten** | [Section 5: Session-Scripts](#5-session-scripts) | `./scripts/debug/start_session.sh` |
| **Container-Shell** | [Section 2: Shell-Zugriff](#shell-zugriff) | `make shell-server` |
| **DB migrieren** | [Section 2: Datenbank](#datenbank) | `make db-migrate` |

---

## 1. Rolle & Abgrenzung

### Mein Bereich

- **Docker-Stack Lifecycle:** start, stop, restart, rebuild
- **Health-Checks und Service-Status:** Container, Endpoints, MQTT
- **Log-Zugriff:** alle Container (server, mqtt, frontend, postgres)
- **MQTT-Traffic-Beobachtung:** `make mqtt-sub` für Live-Traffic
- **Session-Management:** start/stop Scripts für Debug-Sessions
- **Container-Shell-Zugriff:** direkter Zugang zu Containern

### NICHT mein Bereich (delegieren an)

| Situation | Delegieren an | Grund |
|-----------|---------------|-------|
| Code ändern | Dev-Agents | `esp32-dev`, `server-dev`, `frontend-dev` |
| Fehler analysieren | Debug-Agents | `esp32-debug`, `server-debug`, `mqtt-debug` |
| Datenbank-Schema | `db-inspector` | SQL-Queries, Alembic-Migrations |
| Reports schreiben | `meta-analyst` | Cross-Report-Analyse |

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
| `make health` | `curl .../health/live` | Server-Liveness-Probe |
| `make logs` | `docker compose logs -f --tail=100` | Alle Container-Logs |
| `make logs-server` | Logs nur `el-servador` | Server-Logs (FastAPI/uvicorn) |
| `make logs-mqtt` | Logs nur `mqtt-broker` | Mosquitto-Broker-Logs |
| `make mqtt-sub` | `mosquitto_sub -t "#" -v` | MQTT-Traffic live beobachten |

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

---

## 3. Service-Architektur (4 Container)

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

### Volume-Mapping

| Volume | Container | Pfad im Container |
|--------|-----------|-------------------|
| `automationone-postgres-data` | postgres | `/var/lib/postgresql/data` |
| `automationone-mosquitto-data` | mqtt-broker | `/mosquitto/data` |
| `automationone-mosquitto-log` | mqtt-broker | `/mosquitto/log` |

---

## 4. Health-Check-Referenz

### Docker-interne Health-Checks

| Service | Test | Interval | Timeout | Retries | Start-Period |
|---------|------|----------|---------|---------|--------------|
| postgres | `pg_isready -U god_kaiser` | 10s | 5s | 5 | - |
| mqtt-broker | `mosquitto_sub -t $SYS/# -C 1` | 30s | 10s | 3 | - |
| el-servador | `curl /api/v1/health/live` | 30s | 10s | 3 | 30s |
| el-frontend | `fetch localhost:5173` | 30s | 10s | 3 | 30s |

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

## 8. Log-Locations für Weiterleitung

| Was | Wie prüfen | Weiterleiten an |
|-----|------------|-----------------|
| Server-Fehler in Logs | `make logs-server` | `server-debug` |
| MQTT-Broker-Fehler | `make logs-mqtt` | `mqtt-debug` |
| ESP32 nicht sichtbar | `make mqtt-sub` → kein Heartbeat? | `esp32-debug` |
| DB-Fehler | `make shell-db` → Queries | `db-inspector` |
| Frontend Build-Error | `make logs` (el-frontend) | `frontend-debug` |

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

## 11. Workflow

```
1. STATUS    → make status, make health
2. OPERATION → make up/down/dev/build
3. VERIFY    → make health, curl /health/ready
4. OBSERVE   → make logs, make mqtt-sub
5. DELEGATE  → Debug-Agents für Analyse
```

---

*Kompakter Skill für System-Operationen. Vollständige Commands in `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`*
