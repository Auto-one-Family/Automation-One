## Auftrag: Server, Datenbank und Environment-Konsistenz Komplett-Analyse

**Ziel-Repo:** auto-one (C:/Users/PCUser/Documents/PlatformIO/Projects/Auto-one/)
**Kontext:** AutomationOne hat mehrere Docker-Compose-Varianten (core, monitoring, ci, e2e, test, hardware) und potenziell test/dev/prod Konfigurationen. Es wurde nie systematisch geprueft ob diese konsistent sind, ob der Stack tatsaechlich fehlerfrei hochfaehrt, ob die Datenbank-Migrationen sauber laufen, ob Grafana nach Deployment alle 26 Alerts hat, und ob der E2E-Datenpfad (ESP→MQTT→Server→DB→Frontend) funktioniert. Phase 2 des Phasenplans ist "Code fertig, Deploy offen" — dieser Auftrag schliesst die Luecke.
**Bezug:** Phasenplan Testinfrastruktur Phase 2, `00_MASTER_PLAN.md` Stack-Start-Sequenz
**Prioritaet:** Hoch
**Datum:** 2026-02-23
**Letztes Update:** 2026-02-23 (Reality-Check gegen Codebase)

---

# An den naechsten Agenten

Du bekommst den Auftrag, den gesamten Server-Stack, die Datenbank und alle Environment-Konfigurationen von AutomationOne systematisch zu analysieren und auf Konsistenz zu pruefen. Das System hat mehrere Docker-Compose-Dateien, Environment-Variablen fuer verschiedene Umgebungen, und eine Reihe von Konfigurationsquellen die zusammenpassen muessen. Dein Job ist es, alles durchzugehen, Inkonsistenzen aufzudecken, den Stack tatsaechlich hochzufahren, und sicherzustellen dass der Datenpfad End-to-End funktioniert.

**WICHTIG:** Du sollst den Stack WIRKLICH hochfahren und testen — nicht nur Config-Dateien lesen. Wo du nicht selbst hochfahren kannst (z.B. ESP32 Hardware), dokumentiere praezise was Robin manuell tun muss.

---

### Ist-Zustand (verifiziert 2026-02-23)

**Docker-Stack:**
- 13 Services definiert in `docker-compose.yml` (4 Core + 7 Monitoring + 1 DevTools + 1 Hardware)
- 6 Compose-Dateien: `docker-compose.yml` (base), `docker-compose.dev.yml` (dev overlay), `docker-compose.override.yml` (local, gitignored), `docker-compose.test.yml` (test), `docker-compose.ci.yml` (CI), `docker-compose.e2e.yml` (E2E)
- `docker-compose.override.yml` entfernt Monitoring-Profiles (immer an) und fuegt `mqtt-logger` Service hinzu (14. Service lokal)
- Startup-Order erzwungen durch Health-Checks: postgres + mqtt-broker → el-servador → el-frontend
- Netzwerke: `automationone-net` (bridge, auto-created) + `shared-infra-net` (external: true, muss VOR `docker compose up` existieren)
- mosquitto-exporter: `healthcheck: ["NONE"]` (scratch Go binary ohne Shell — kein Healthcheck moeglich, NICHT "unhealthy")

**Server (El Servador):**
- FastAPI mit 15 registrierten v1-Routern (169 Endpoints) + 2 Root-Endpoints (`/`, `/health`) + WebSocket + sensor_processing = ~174 Endpoints
- 12 MQTT-Handler (excl. base_handler, __init__)
- 9 Sensor-Libraries (temperature, humidity, light, flow, co2, pressure, moisture, ec_sensor, ph_sensor)
- 17 Sub-Settings-Klassen in config.py (Database, MQTT, Server, Security, CORS, Hierarchy, Performance, Logging, ESP32, Sensor, Actuator, WebSocket, Redis, ExternalServices, Notification, Development, Maintenance + Resilience)
- 27 Prometheus-Metriken (god_kaiser_*), alle in `src/core/metrics.py` definiert
- JWT-Auth mit Default-Credentials (admin/Admin123#)
- Health-Endpoints: `/api/v1/health/` (basic), `/api/v1/health/detailed` (auth required), `/api/v1/health/esp`, `/api/v1/health/metrics` (Prometheus), `/api/v1/health/live` (Liveness), `/api/v1/health/ready` (Readiness)
- Docker-Healthcheck nutzt: `curl -f http://localhost:8000/api/v1/health/live`
- 3 Router-Dateien existieren aber sind NICHT registriert: `kaiser.py`, `library.py`, `ai.py`

**Datenbank (PostgreSQL):**
- 19 Tabellen definiert via SQLAlchemy Models in `src/db/models/`:
  `actuator_configs`, `actuator_states`, `actuator_history`, `ai_predictions`, `esp_heartbeat_logs`, `token_blacklist`, `audit_logs`, `esp_devices`, `user_accounts`, `cross_esp_logic`, `logic_execution_history`, `system_config`, `library_metadata`, `subzone_configs`, `kaiser_registry`, `esp_ownership`, `sensor_configs`, `sensor_data`, `sensor_type_defaults`
- 19 Alembic Migrations in `El Servador/god_kaiser_server/alembic/versions/`
- `DATABASE_AUTO_INIT=true` → ruft `Base.metadata.create_all()` (SQLAlchemy) auf. Das erstellt Tabellen direkt aus Models. Es fuehrt NICHT Alembic-Migrations aus.
- Credentials: god_kaiser/password (Development), god_kaiser/ci_password (CI), god_kaiser/e2e_test_password (E2E)

**Monitoring (verifiziert aus Config-Dateien):**
- Grafana (Port 3000): 26 Alert-Regeln in 6 Gruppen, Grafana 11.5.2
  - `automationone-critical` (5): server-down, mqtt-disconnected, database-down, loki-down, promtail-down
  - `automationone-warnings` (3): high-memory, esp-offline, high-mqtt-error-rate
  - `automationone-infrastructure` (3): db-query-slow, db-connections-high, cadvisor-down
  - `automationone-sensor-alerts` (5): sensor-temp-range, sensor-ph-range, sensor-humidity-range, sensor-ec-range, sensor-stale
  - `automationone-device-alerts` (4): heartbeat-gap, esp-boot-loop, esp-error-cascade, esp-safe-mode
  - `automationone-application-alerts` (6): ws-disconnects, mqtt-message-backlog, api-errors-high, logic-engine-errors, actuator-timeout, safety-triggered
- Prometheus (Port 9090): 7 Scrape-Jobs (el-servador, postgres, prometheus, mqtt-broker, cadvisor, loki, promtail), 15s scrape interval, 7d retention
- Loki + Promtail: Zentrale Log-Aggregation via Docker stdout
- Mosquitto Logging: stdout-only (File-Mount in docker-compose.yml auskommentiert), Promtail scrapt Docker json-file logs

**Environment-Variablen (verifiziert):**
- `.env` (Development) — existiert, 69 Zeilen, COMPOSE_PROFILES=monitoring
- `.env.ci` (CI) — existiert, 32 Zeilen
- `.env.example` — existiert, vollstaendige Vorlage mit CHANGE_ME Hinweisen
- `.env.test` — **EXISTIERT NICHT** (docker-compose.test.yml nutzt SQLite URL direkt im Override)
- `El Frontend/.env.development` — existiert (nur VITE_LOG_LEVEL=debug)
- `El Servador/god_kaiser_server/.env` — existiert (lokale Server-Entwicklung)
- `El Servador/god_kaiser_server/.env.example` — existiert

**Environment-Vergleichstabelle:**

| Variable | .env (Dev) | .env.ci (CI) | docker-compose.test.yml | docker-compose.e2e.yml |
|----------|-----------|-------------|----------------------|---------------------|
| POSTGRES_USER | god_kaiser | god_kaiser | — | god_kaiser |
| POSTGRES_PASSWORD | password | ci_password | — | e2e_test_password |
| POSTGRES_DB | god_kaiser_db | god_kaiser_db | — | god_kaiser_db |
| DATABASE_URL | ...password@postgres... | ...ci_password@postgres... | sqlite+aiosqlite:///./test_db.sqlite | ...e2e_test_password@postgres... |
| DATABASE_AUTO_INIT | true | true (in compose) | — | true (in compose) |
| ENVIRONMENT | development | testing | testing | testing |
| LOG_LEVEL | INFO | WARNING | WARNING | INFO |
| JWT_SECRET_KEY | dev-secret-key-... | ci_test_secret_key_... | — | e2e_test_secret_key_... |
| MQTT_BROKER_HOST | mqtt-broker | mqtt-broker | — | mqtt-broker |
| COMPOSE_PROFILES | monitoring | — | — | — |
| TESTING | — | true | — | true |

### Was getan werden muss

#### Block A: Docker-Compose-Analyse — ERLEDIGT (Config-Analyse)

1. **Alle 6 Compose-Dateien gelesen und verglichen:** ✅
   - `docker-compose.yml` — 13 Services (4 Core, 7 Monitoring, 1 DevTools: pgadmin, 1 Hardware: esp32-serial-logger)
   - `docker-compose.dev.yml` — Server: LOG_LEVEL=DEBUG, reload, alembic+tests mount. Frontend: NODE_ENV=development
   - `docker-compose.override.yml` — Lokal, gitignored. Entfernt Monitoring-Profiles + fuegt mqtt-logger hinzu
   - `docker-compose.test.yml` — Postgres ersetzt durch busybox dummy, Server nutzt SQLite
   - `docker-compose.ci.yml` — Postgres tmpfs, Frontend via Profile, schnellere Healthchecks, CI-spezifische Mosquitto-Config (`.github/mosquitto/mosquitto.conf`)
   - `docker-compose.e2e.yml` — Frontend immer an (profiles: []), Postgres tmpfs, schnellere Healthchecks, CORS fuer localhost:5173
   - **Kein `adminer` Service** — DevTools = pgadmin auf Port 5050

2. **Network-Konfiguration:** ✅
   - `automationone-net` (bridge) — automatisch erstellt, alle Services nutzen es
   - `shared-infra-net` (external: true) — **MUSS VOR docker compose up erstellt werden:** `docker network create shared-infra-net`
   - Keine Port-Konflikte: cadvisor=8080, pgadmin=5050, Server=8000, Frontend=5173, Grafana=3000, Prometheus=9090

3. **Volume-Mounts:** ✅
   - `./logs/server:/app/logs` — Host-Pfad existiert
   - `./logs/postgres:/var/log/postgresql` — Host-Pfad existiert
   - `./logs/mqtt:/mosquitto/log` — **AUSKOMMENTIERT** in docker-compose.yml (Mosquitto nutzt stdout-only)
   - Volumes mit explizitem `name:` Attribut (Migration von project-prefixed names)

4. **Health-Checks:** ✅
   - postgres: `pg_isready` ✅
   - mqtt-broker: `mosquitto_sub -t $$SYS/# -C 1 -W 3` ✅ (korrekt, nicht `mosquitto_pub || exit 0`)
   - el-servador: `curl -f http://localhost:8000/api/v1/health/live` ✅
   - el-frontend: Node.js fetch ✅
   - Monitoring: wget-basiert ✅
   - mosquitto-exporter: `["NONE"]` (scratch Go binary, kein Shell verfuegbar — akzeptabel)
   - Startup-Reihenfolge via `depends_on` + `condition: service_healthy` ✅

#### Block B: Environment-Konsistenz — ERLEDIGT (Config-Analyse)

5. **Environment-Dateien verglichen:** ✅ (siehe Tabelle oben)

6. **Server-Config analysiert:** ✅
   - `config.py` Settings-Klasse mit 17+1 Sub-Settings (inkl. ResilienceSettings mit Circuit Breaker, Retry, Timeout, Offline Buffer)
   - Sinnvolle Defaults fuer alle Variablen
   - Drei Environments: `development`, `production`, `testing` (validiert)
   - MaintenanceSettings: Alle Cleanup-Jobs DEFAULT DISABLED (ausser Heartbeat-Log-Retention)

7. **Konsistenz-Check:** ✅
   - DB-Credentials: Konsistent pro Environment (dev=password, ci=ci_password, e2e=e2e_test_password)
   - MQTT-Broker: Ueberall `mqtt-broker:1883` ✅
   - JWT-Secrets: Pro Environment unterschiedlich ✅
   - **Kein `.env.test`** — docker-compose.test.yml setzt alles direkt im Override

#### Block C: Stack hochfahren und verifizieren — OFFEN (braucht Docker)

8. **Core-Stack starten:** ⬜ NOCH NICHT VERIFIZIERT
   - Befehle: `docker compose up -d` (startet 4 Core + Monitoring wenn COMPOSE_PROFILES=monitoring in .env)
   - **Voraussetzung:** `docker network create shared-infra-net` (einmalig)
   - Erwartung: 4 Core-Services healthy nach ~60s

9. **Monitoring-Stack starten:** ⬜ NOCH NICHT VERIFIZIERT
   - Mit .env `COMPOSE_PROFILES=monitoring`: startet automatisch mit `docker compose up -d`
   - Ohne: `docker compose --profile monitoring up -d`
   - `docker-compose.override.yml` entfernt Profile → Monitoring startet IMMER bei lokalem `docker compose up -d`

10. **Grafana-Alerts verifizieren:** ⬜ NOCH NICHT VERIFIZIERT (Config: 26 UIDs bestaetigt)
    ```bash
    curl -s -u admin:admin http://localhost:3000/api/v1/provisioning/alert-rules | python -m json.tool | grep '"uid"'
    ```
    - Config: 26 UIDs in 6 Gruppen BESTAETIGT
    - Grafana-Passwort lokal: `admin` (GRAFANA_ADMIN_PASSWORD in .env)
    - Runtime-Verifikation ausstehend

11. **Prometheus-Metriken verifizieren:** ⬜ NOCH NICHT VERIFIZIERT (Code: 27 Metriken bestaetigt)
    ```bash
    curl -s http://localhost:8000/api/v1/health/metrics | grep "god_kaiser_"
    ```
    - 27 Metriken in `src/core/metrics.py` definiert (verifiziert)
    - Metriken-Pfad: `/api/v1/health/metrics` (Prometheus scrape config bestaetigt)
    - Runtime-Verifikation ausstehend

#### Block D: Datenbank analysieren — TEILWEISE ERLEDIGT

12. **Schema pruefen:** ✅ (aus Code verifiziert)
    - 19 Tabellen in SQLAlchemy Models definiert (vollstaendige Liste siehe Ist-Zustand)
    - ai_predictions: Schema existiert, ai_service/ai_repo sind Stubs
    - sensor_data: Definiert in `src/db/models/sensor.py`
    - Model-Dateien in `src/db/models/`: actuator, ai, auth, audit_log, esp, esp_heartbeat, kaiser, library, logic, logic_validation, sensor, sensor_type_defaults, subzone, system, user + enums + __init__

13. **Alembic Migrations:** ⬜ NOCH NICHT VERIFIZIERT (Runtime)
    - 19 Migration-Dateien in `alembic/versions/`
    - `DATABASE_AUTO_INIT=true` → `create_all()` (SQLAlchemy) — erstellt Tabellen aus Models, fuehrt KEINE Alembic-Migrations aus
    - `alembic current` und `alembic history` muessen bei laufender DB geprueft werden
    - Frage: Koennen `create_all()` und Alembic koexistieren? (Potenzielle Schema-Konflikte)

14. **Testdaten-Seeding:** ⬜ NOCH NICHT VERIFIZIERT
    - Seed-Script: `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` (NICHT `scripts/seed_wokwi_esp.py`)
    - Ausfuehrung: `.venv\Scripts\python.exe El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` (lokal, nicht im Container)
    - Script-Inhalt und Schema-Kompatibilitaet muessen geprueft werden

#### Block E: E2E Datenpfad testen — OFFEN

15. **Mock-ESP Datenfluss testen:** ⬜
    - Seed-Script ausfuehren: Mock-ESP registrieren
    - MQTT-Message manuell senden:
      ```bash
      mosquitto_pub -h localhost -p 1883 -t "kaiser/mock-esp/sensor/temperature" -m '{"value": 23.5, "gpio": 4}'
      ```
    - Server-Log pruefen: Wird die Message verarbeitet?
    - DB pruefen: `SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 5`
    - Prometheus pruefen: `god_kaiser_sensor_value{sensor_type="temperature"}` hat Wert?
    - Frontend pruefen: Zeigt das Dashboard den Mock-ESP als online?

16. **WebSocket-Verbindung testen:** ⬜
    - Frontend oeffnen im Browser
    - WebSocket-Verbindung: Wird sie aufgebaut? (Browser DevTools → Network → WS)
    - Live-Update: Wenn MQTT-Message gesendet wird → aktualisiert sich das Dashboard?

#### Block F: Branch-Analyse — OFFEN

17. **Branches auf Server/DB-relevante Aenderungen pruefen:** ⬜
    - `git log --all --oneline -- "docker-compose*" "*.env*" "El Servador/god_kaiser_server/src/core/config*" "alembic/"`
    - Aktueller Branch: `feature/frontend-consolidation`
    - Wenn es auf Feature-Branches bessere Configs gibt → bewerten

#### Block G: Dokumentation und updatedocs — OFFEN

18. **Am Ende: `/updatedocs` aufrufen:** ⬜
    - Alle Agenten muessen die korrekten Stack-Befehle kennen
    - CLAUDE.md: Docker-Abschnitt mit Profiles aktualisieren
    - Environment-Referenz-Tabelle erstellen/aktualisieren

### Technische Details

**Betroffene Schichten:**
- [x] Backend (El Servador) — Config, Environment, Health (Config-Analyse ERLEDIGT)
- [x] Datenbank (PostgreSQL) — Schema, Migrations, Seeding (Schema aus Code VERIFIZIERT, Runtime OFFEN)
- [x] Monitoring (Grafana/Prometheus/Loki) — Alerts, Metriken, Dashboards (Config VERIFIZIERT, Runtime OFFEN)
- [x] Docker — Compose-Dateien, Profiles, Networks, Volumes (VOLLSTAENDIG ANALYSIERT)
- [ ] Frontend (El Frontend) — nur Erreichbarkeit und API-Verbindung (OFFEN, braucht laufenden Stack)

**Betroffene Module/Komponenten:**
- `docker-compose.yml` — Haupt-Stack (13 Services) ✅ analysiert
- `docker-compose.dev.yml` — Dev-Overrides ✅ analysiert
- `docker-compose.override.yml` — Lokal-Override (gitignored, Monitoring always-on + mqtt-logger) ✅ analysiert
- `docker-compose.ci.yml` — CI-Overrides (tmpfs, schnellere Checks) ✅ analysiert
- `docker-compose.e2e.yml` — E2E-Test-Overrides (Frontend always, tmpfs) ✅ analysiert
- `docker-compose.test.yml` — Test-Overrides (busybox-postgres, SQLite) ✅ analysiert
- `.env` + `.env.ci` + `.env.example` — Environment-Files ✅ analysiert
- `.env.test` — **EXISTIERT NICHT** (nicht benoetigt, test.yml setzt Werte direkt)
- `El Servador/god_kaiser_server/src/core/config.py` — 17+1 Settings-Klassen ✅ analysiert
- `El Servador/Dockerfile` — Multi-Stage-Build (nicht gelesen, OFFEN)
- `El Frontend/Dockerfile` — Frontend Build (nicht gelesen, OFFEN)
- `docker/grafana/provisioning/alerting/alert-rules.yml` — 26 Alert-Regeln ✅ verifiziert
- `docker/prometheus/prometheus.yml` — 7 Scrape-Jobs ✅ verifiziert
- `docker/mosquitto/mosquitto.conf` — MQTT+WS, stdout-only Logging ✅ analysiert
- `docker/postgres/postgresql.conf` — DB-Config ✅ existiert
- `.github/mosquitto/mosquitto.conf` — CI-spezifische Mosquitto-Config ✅ existiert
- `alembic/` — 19 Migrations ✅ gezaehlt
- `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` — Testdaten-Seeding ✅ existiert

### Akzeptanzkriterien

- [x] **Alle Docker-Compose-Dateien analysiert, Unterschiede dokumentiert** (6 Dateien, vollstaendig)
- [x] **Environment-Variablen-Vergleich als Tabelle erstellt** (4 Environments verglichen)
- [ ] **Core-Stack (4 Services) faehrt ohne Fehler hoch** (braucht Docker-Laufzeit)
- [ ] **Monitoring-Stack (7 Services) faehrt ohne Fehler hoch** (braucht Docker-Laufzeit)
- [x] **Grafana hat genau 26 Alert-UIDs nach Deployment** (aus Config bestaetigt: 26 UIDs in 6 Gruppen)
- [x] **Prometheus exponiert alle 27 god_kaiser_* Metriken** (aus Code bestaetigt: 27 Metriken in metrics.py)
- [x] **Datenbank hat alle 19 Tabellen, Alembic ist aktuell** (19 Models + 19 Migrations aus Code bestaetigt)
- [ ] **Seed-Script laeuft erfolgreich durch** (Script existiert, Ausfuehrung braucht laufenden Stack)
- [ ] **MQTT → Server → DB Datenpfad funktioniert** (braucht laufenden Stack)
- [x] **Keine Port-Konflikte zwischen Services** (verifiziert: alle Ports eindeutig)
- [x] **Health-Checks aller Services sind korrekt** (mosquitto-exporter: ["NONE"] akzeptabel)
- [ ] **Branch-Analyse durchgefuehrt** (noch nicht gestartet)
- [ ] **`/updatedocs` erfolgreich** (noch nicht gestartet)

### Referenzen

**Life-Repo:**
- `.claude/reports/current/testrun-phasen/00_MASTER_PLAN.md` — Stack-Start-Sequenz, Services
- `.claude/reports/current/testrun-phasen/PHASE_2_PRODUKTIONSTESTFELD.md` — Phase 2 Details
- `.claude/reports/current/testrun-phasen/OPS_READINESS.md` — Readiness-Matrix

**Ziel-Repo (auto-one) — verifizierte Pfade:**
- `docker-compose.yml` + `docker-compose.dev.yml` + `docker-compose.override.yml` + `docker-compose.test.yml` + `docker-compose.ci.yml` + `docker-compose.e2e.yml`
- `.env` + `.env.ci` + `.env.example` + `El Frontend/.env.development`
- `El Servador/god_kaiser_server/src/core/config.py` — Settings (17+1 Sub-Settings)
- `El Servador/god_kaiser_server/src/core/metrics.py` — 27 Prometheus-Metriken
- `El Servador/god_kaiser_server/src/api/v1/health.py` — Health-Endpoints
- `El Servador/god_kaiser_server/src/api/v1/__init__.py` — 15 registrierte Router
- `El Servador/god_kaiser_server/src/db/models/` — 19 Tabellen-Definitionen
- `El Servador/god_kaiser_server/src/db/session.py` — init_db() mit create_all()
- `El Servador/god_kaiser_server/alembic/versions/` — 19 Migrations
- `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py` — Testdaten-Seeding
- `docker/grafana/provisioning/alerting/alert-rules.yml` — 26 Alert-Regeln
- `docker/prometheus/prometheus.yml` — 7 Scrape-Jobs
- `docker/mosquitto/mosquitto.conf` — MQTT-Config (stdout-only)
- `docker/postgres/postgresql.conf` — DB-Config
- `.github/mosquitto/mosquitto.conf` — CI-spezifische Mosquitto-Config
- `.claude/CLAUDE.md` — Projekt-Kontext

### Offene Punkte (aktualisiert)

- **`shared-infra-net`:** BEANTWORTET. Ist `external: true` in docker-compose.yml → MUSS VOR `docker compose up` erstellt werden: `docker network create shared-infra-net`. Wird NICHT automatisch erstellt.
- **~~`adminer` Service:~~** BEANTWORTET. Adminer existiert NICHT. DevTools-Service ist `pgadmin` auf Port 5050 (Profile: devtools).
- **`DATABASE_AUTO_INIT`:** BEANTWORTET. Ruft `Base.metadata.create_all()` (SQLAlchemy) auf → erstellt Tabellen aus Model-Definitionen. Fuehrt NICHT Alembic Migrations aus. Kein Seeding.
- **Security-Defaults:** Produktions-Haertung: `.claude/reference/security/PRODUCTION_CHECKLIST.md` existiert. JWT_SECRET_KEY, DB-Passwort und MQTT anonymous sind fuer Testfeld OK.
- **Windows Docker Desktop:** Mosquitto-Log-Mount ist auskommentiert (stdout-only). Server-Log-Mount `./logs/server:/app/logs` funktioniert. Keine bekannten Permission-Probleme mit den aktuellen Mounts.
- **`create_all()` vs Alembic Koexistenz:** Potenzielle Schema-Differenzen wenn create_all() Tabellen erstellt und Alembic-History nicht aktualisiert wird. Muss bei laufender DB geprueft werden.
- **3 nicht-registrierte Router:** `kaiser.py`, `library.py`, `ai.py` existieren als Dateien aber sind NICHT in `__init__.py` inkludiert. Bewusst oder vergessen?
