# SYSTEM_AGENTS_COMMANDS_REPORT

**Erstellt:** 2026-02-08  
**Zweck:** Audit aller dokumentierten Befehle und Operationen von system-control und system-manager  
**Regel:** Nicht-destruktiv, keine Systemänderungen

---

## A) system-control – Befehle

### A.1 Make-Targets (Vollreferenz)

| Befehl | Dokumentiert wo | Getestet | Ergebnis |
|--------|-----------------|----------|----------|
| `make up` | system-control SKILL, Makefile | Ja | Nicht getestet – `make` nicht im PATH (Windows: "Die Benennung 'make' wurde nicht erkannt") |
| `make down` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make dev` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make dev-down` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make test` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make test-down` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make build` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make clean` | system-control SKILL, Makefile | Ja | Nicht getestet – kritisch – Syntax geprüft: `docker compose down -v --remove-orphans` |
| `make status` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make health` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make logs` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make logs-server` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make logs-mqtt` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make mqtt-sub` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make shell-server` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make shell-db` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make db-migrate` | system-control SKILL, Makefile | Ja | Nicht getestet – make fehlt |
| `make db-rollback` | system-control SKILL, Makefile | Ja | Nicht getestet – kritisch – Syntax geprüft: `alembic downgrade -1` |
| `make db-backup` | system-control SKILL, Makefile | Ja | Nicht getestet – macht Änderungen |
| `make db-restore FILE=…` | system-control SKILL, Makefile | Ja | Nicht getestet – kritisch – Syntax geprüft: `./scripts/docker/restore.sh $(FILE)` korrekt |

**Makefile-Syntax:** Alle Targets korrekt. `db-restore` erfordert `FILE=backups/…` (z.B. `FILE=backups/2026-02-05.sql.gz`).

### A.2 Direkte Docker-Befehle (SYSTEM_OPERATIONS_REFERENCE, system-control Agent)

| Befehl | Dokumentiert wo | Getestet | Ergebnis |
|--------|-----------------|----------|----------|
| `docker compose ps` | SYSTEM_OPERATIONS_REFERENCE | Ja | OK – läuft, zeigt Container (grafana, loki, prometheus, promtail im aktuellen Lauf) |
| `docker compose up -d` | SYSTEM_OPERATIONS_REFERENCE | Nein | Nicht getestet – würde Stack starten |
| `docker compose down` | SYSTEM_OPERATIONS_REFERENCE | Nein | Nicht getestet – würde Stack stoppen |
| `docker compose logs -f el-servador` | SYSTEM_OPERATIONS_REFERENCE | Nein | Nicht getestet – harmlos |
| `docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v` | SYSTEM_OPERATIONS_REFERENCE | Nein | Nicht getestet – würde interaktiv blockieren |

### A.3 Health-Checks

| Befehl | Dokumentiert wo | Getestet | Ergebnis |
|--------|-----------------|----------|----------|
| `curl http://localhost:8000/health` | system-control Agent, SYSTEM_OPERATIONS_REFERENCE | Ja | Nicht erreichbar – Server (Port 8000) antwort nicht; Endpoint existiert in main.py |
| `curl http://localhost:8000/api/v1/health/live` | system-control SKILL, Makefile health | Ja | Nicht erreichbar – Server lief nicht |
| `curl http://localhost:8000/api/v1/health/ready` | SYSTEM_OPERATIONS_REFERENCE | Ja | Nicht erreichbar – Server lief nicht |
| `docker exec automationone-server curl …/health/live` | Makefile health | Nein | Nicht getestet – Container automationone-server läuft nicht im aktuellen docker compose ps |

### A.4 MQTT-Befehle

| Befehl | Dokumentiert wo | Getestet | Ergebnis |
|--------|-----------------|----------|----------|
| `mosquitto_sub -h localhost -t "kaiser/#" -v` | system-control Agent, SYSTEM_OPERATIONS_REFERENCE | Ja | OK – Nachricht empfangen; Broker auf 1883 erreichbar |
| `mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v` | SYSTEM_OPERATIONS_REFERENCE | Nein | Nicht getestet – harmlos, gleiche Syntax |
| `docker exec -it automationone-mqtt mosquitto_sub -h localhost -t "#" -v` | Makefile mqtt-sub | Nein | Nicht getestet – automationone-mqtt nicht in aktuellem Stack |

### A.5 Session-Scripts

| Befehl | Dokumentiert wo | Getestet | Ergebnis |
|--------|-----------------|----------|----------|
| `./scripts/debug/start_session.sh [name] [--with-server] [--mode MODE]` | system-control SKILL, SYSTEM_OPERATIONS_REFERENCE | Nein | Nicht getestet – würde Session starten; Pfad existiert |
| `./scripts/debug/stop_session.sh` | system-control SKILL, SYSTEM_OPERATIONS_REFERENCE | Nein | Nicht getestet – würde Session beenden; Pfad existiert |

**Script-Verzeichnisse:** `scripts/debug/start_session.sh`, `scripts/debug/stop_session.sh` existieren.

### A.6 Kritische Befehle (nur Syntax-Prüfung)

| Befehl | Dokumentiert wo | Syntax geprüft | Ziel-Pfad/Endpoint existiert |
|--------|-----------------|----------------|-----------------------------|
| `make clean` | system-control SKILL | `docker compose down -v --remove-orphans` | Ja |
| `make db-rollback` | system-control SKILL | `alembic downgrade -1` | Ja (im Container) |
| `make db-restore FILE=…` | system-control SKILL | `./scripts/docker/restore.sh $(FILE)` | Ja – restore.sh existiert |
| `curl -X DELETE …/esp/devices/ESP_XXX` | SYSTEM_OPERATIONS_REFERENCE | Endpoint korrekt | Ja |
| `curl -X POST …/actuators/emergency_stop` | SYSTEM_OPERATIONS_REFERENCE | Endpoint korrekt | Ja |
| `mosquitto_pub -t "kaiser/broadcast/emergency" …` | SYSTEM_OPERATIONS_REFERENCE | Topic korrekt | Ja |
| `pio run -e esp32_dev -t erase` | SYSTEM_OPERATIONS_REFERENCE | PlatformIO | Ja – El Trabajante existiert |

### A.7 Docker-Compose-Struktur

| Dokumentiert | Tatsächlich (docker-compose.yml) | Übereinstimmung |
|--------------|----------------------------------|-----------------|
| postgres: automationone-postgres | postgres, container_name: automationone-postgres | OK |
| mqtt-broker: automationone-mqtt | mqtt-broker, container_name: automationone-mqtt | OK |
| el-servador: automationone-server | el-servador, container_name: automationone-server | OK |
| el-frontend: automationone-frontend | el-frontend, container_name: automationone-frontend | OK |
| Port 8000 (Server) | 8000:8000 | OK |
| Port 1883 (MQTT) | 1883:1883 | OK |
| Port 5432 (PostgreSQL) | 5432:5432 | OK |

**Hinweis:** `docker compose ps` zeigte aktuell nur grafana, loki, prometheus, promtail – nicht den Haupt-Stack (postgres, mqtt, el-servador, el-frontend). Stack möglicherweise gestoppt oder anders konfiguriert.

### A.8 Log-Pfade

| Dokumentiert | Existiert | Anmerkung |
|--------------|-----------|-----------|
| `logs/server/god_kaiser.log` | logs/server/ | Verzeichnis existiert (Bind-Mount für Docker) |
| `logs/mqtt/mosquitto.log` | logs/mqtt/ | Verzeichnis existiert |
| `logs/postgres/postgresql.log` | logs/postgres/ | Verzeichnis existiert |
| `logs/current/` | logs/current/ | Verzeichnis existiert |
| `logs/archive/` | logs/archive/ | Verzeichnis existiert |
| `El Servador/god_kaiser_server/logs/god_kaiser.log` | – | Lokaler Poetry-Pfad; bei Docker: logs/server/ |

---

## B) system-manager – Operationen

### B.1 Dateien die der system-manager liest

| Pfad | Existiert | Anmerkung |
|------|-----------|-----------|
| `logs/current/STATUS.md` | Nein | Wird von start_session.sh erstellt; bei fehlender Session nicht vorhanden |
| `git status --short` | N/A | Befehl |
| `git branch --show-current` | N/A | Befehl |
| `git log --oneline -3` | N/A | Befehl |
| `.claude/reports/BugsFound/Bug_Katalog.md` | **Nein** | Verzeichnis: `.claude/reports/BugsFound/` existiert; Datei `Bug_Katalog.md` existiert nicht; stattdessen: `Userbeobachtungen.md` |
| `.claude/reports/current/` | Ja | Verzeichnis existiert |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Ja | Existiert |
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Ja | Existiert |
| `.claude/reference/errors/ERROR_CODES.md` | Ja | Existiert |
| `.claude/reference/api/MQTT_TOPICS.md` | Ja | Existiert |
| `.claude/reference/api/REST_ENDPOINTS.md` | Ja | Existiert |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | Ja | Existiert |

### B.2 Dateien die der system-manager schreibt

| Pfad | Existiert (Zielverzeichnis) | Anmerkung |
|------|-----------------------------|-----------|
| `.claude/reports/current/SESSION_BRIEFING.md` | Ja | Verzeichnis `.claude/reports/current/` existiert |

### B.3 Referenzdokumente

| Referenz | Pfad | Existiert |
|----------|------|-----------|
| SYSTEM_OPERATIONS | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Ja |
| COMMUNICATION_FLOWS | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Ja |
| ERROR_CODES | `.claude/reference/errors/ERROR_CODES.md` | Ja |
| MQTT_TOPICS | `.claude/reference/api/MQTT_TOPICS.md` | Ja |
| REST_ENDPOINTS | `.claude/reference/api/REST_ENDPOINTS.md` | Ja |
| WEBSOCKET_EVENTS | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Ja |
| LOG_LOCATIONS | `.claude/reference/debugging/LOG_LOCATIONS.md` | Ja |

### B.4 Befehle die der system-manager ausführt (Phase 1)

| Befehl | Dokumentiert wo | Getestet | Ergebnis |
|--------|-----------------|----------|----------|
| `docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"` | SKILL (Schritt 1) | Ja | OK – docker compose ps funktioniert |
| `netstat -ano \| findstr "8000"` | SKILL (alternativ) | Nein | Nicht getestet |
| `powershell -Command "if (Get-NetTCPConnection -LocalPort 8000 …)"` | system-manager Agent | Nein | Nicht getestet |
| `powershell -Command "if (Get-NetTCPConnection -LocalPort 1883 …)"` | system-manager Agent | Nein | Nicht getestet |
| `curl -s http://localhost:8000/health` | system-manager Agent | Ja | Nicht erreichbar – Server lief nicht |

---

## C) Befehlsabdeckung

### C.1 Fehlende Befehle

| Fähigkeit | Dokumentiert | Konkreter Befehl hinterlegt |
|-----------|--------------|-----------------------------|
| "Server starten" (Poetry) | Ja | `cd "El Servador/god_kaiser_server" && poetry run uvicorn src.main:app --reload` |
| "Server starten" (Docker) | Ja | `docker compose up -d` / `make up` |
| "Logs lesen" | Ja | `make logs`, `make logs-server`, `tail -f logs/server/god_kaiser.log` |
| "MQTT beobachten" | Ja | `make mqtt-sub`, `mosquitto_sub -h localhost -t "kaiser/#" -v` |
| "ESP flashen" | Ja | `pio run -e esp32_dev -t upload` |
| "Emergency-Stop" | Ja | curl + mosquitto_pub in SYSTEM_OPERATIONS_REFERENCE |
| Windows-spezifisch: Make-Alternative | Nein | Kein dokumentierter Ersatz für `make` bei fehlender Make-Installation |

### C.2 Befehle ohne existierendes Ziel

| Befehl | Ziel | Problem |
|--------|------|---------|
| `cat ".claude/reports/BugsFound/Bug_Katalog.md"` | Bug_Katalog.md | Datei existiert nicht; nur `Userbeobachtungen.md` vorhanden |

### C.3 Kontextuelle Anleitung

| Thema | Anleitung vorhanden | Wo |
|-------|---------------------|-----|
| Diagnose-Reihenfolge | Ja | system-control SKILL: "1. make status → 2. make health → 3. curl /health/ready → 4. curl /health/detailed" |
| Wann welcher Agent | Ja | system-manager Agent: Agent-Kompendium, "Aktivieren wenn" pro Agent |
| Debug-Agent Auswahl nach Log-Quelle | Ja | system-manager Agent: Tabelle esp32_serial vs god_kaiser vs mqtt_traffic |
| Agent-Reihenfolge im Test-Flow | Ja | CLAUDE.md, system-manager: "system-control ZUERST" |
| Reihenfolge bei Stack-Start | Ja | system-control SKILL: "1. make build → 2. make up → 3. make status → 4. make health → 5. make db-migrate" |
| Wann make clean vs make down | Nein | Nur Auflistung; keine explizite Entscheidungshilfe |
| Wann Poetry vs Docker | Teilweise | SYSTEM_OPERATIONS_REFERENCE markiert Docker als "EMPFOHLEN" |
| Windows: make fehlt | Nein | Keine Anleitung für Windows ohne make |

---

## Zusammenfassung

| Kategorie | Status |
|-----------|--------|
| **Make-Targets** | Syntax korrekt; `make` auf Windows nicht verfügbar – alle Targets nicht ausführbar |
| **Docker-Befehle** | `docker compose ps` funktioniert; Container-Namen stimmen mit docker-compose.yml überein |
| **Health-Endpoints** | In Code vorhanden; Server war während Tests nicht erreichbar |
| **MQTT** | `mosquitto_sub` funktioniert; Broker erreichbar |
| **Session-Scripts** | Pfade existieren; nicht ausgeführt |
| **Backup/Restore** | Scripts existieren; Syntax geprüft |
| **system-manager Referenzen** | Alle Referenz-Dateien existieren außer `Bug_Katalog.md` |
| **system-manager Output** | Zielverzeichnis `.claude/reports/current/` existiert |

### Kritische Befehle (nur Syntax-Prüfung, nicht ausgeführt)

- `make clean` – Syntax korrekt
- `make db-rollback` – Syntax korrekt
- `make db-restore FILE=…` – Syntax korrekt
- Emergency-Stop API – Endpoint existiert
- ESP erase – Befehl existiert

---

*Ende des Berichts – keine Änderungen am System vorgenommen*
