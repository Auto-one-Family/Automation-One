# E9 — Observability, Tests und CI/CD

> **Sprint:** AUT-175 Architektur-Wissensausbau
> **Erstellt:** 2026-04-26
> **Quellen:** Repo-Analyse (docker-compose.yml, .github/workflows/, docker/*, El Servador/tests/, El Frontend/tests/, El Trabajante/tests/wokwi/, .claude/reference/debugging/)
> **Status:** Vollständig verifiziert gegen Repository-Stand 2026-04-26

---

## 1. Überblick Monitoring-Architektur

AutomationOne nutzt einen vollständigen Observability-Stack, der als optionales Docker-Compose-Profile (`--profile monitoring`) zugeschaltet wird. Der Stack besteht aus vier Komponenten: Grafana Alloy als Log-Shipper (migriert von Promtail am 2026-02-24), Loki als Log-Aggregation, Prometheus als Metriken-Datenbank und Grafana als Visualisierungs- und Alerting-Frontend.

```
Container-Logs (json-file Driver)
    -> Grafana Alloy (Docker-Socket-Discovery, River-Config)
        -> Loki 3.4 (TSDB-Schema v13, 7-Tage-Retention)
            -> Grafana 11.5.2 (Dashboards + Alerting)

el-servador /api/v1/health/metrics
postgres-exporter :9187/metrics
mosquitto-exporter :9234/metrics
cadvisor :8080/metrics
    -> Prometheus v3.2.1 (15s Scrape, 7-Tage-Retention)
        -> Grafana 11.5.2
```

Alle Monitoring-Services sind vom Kernsystem entkoppelt: `docker compose up -d` startet nur Kernservices; `docker compose --profile monitoring up -d` ergänzt den Observability-Stack.

---

## 2. Docker-Compose-Services (Tabelle)

Basis-Datei: `docker-compose.yml`. Override-Dateien für CI: `docker-compose.ci.yml`, E2E: `docker-compose.e2e.yml`, Dev: `docker-compose.dev.yml`, Test: `docker-compose.test.yml`.

### 2.1 Kern-Services (immer aktiv)

| Service | Container | Image | Host-Port | Health-Check-Endpoint | Abhängigkeiten |
|---------|-----------|-------|-----------|----------------------|----------------|
| `postgres` | `automationone-postgres` | `postgres:16-alpine` | 5432 | `pg_isready -U $POSTGRES_USER` | - |
| `mqtt-broker` | `automationone-mqtt` | `eclipse-mosquitto:2` | 1883, 9001 (WS) | `mosquitto_sub -t $$SYS/# -C 1 -W 5` | - |
| `ntp` | `automationone_ntp` | `cturra/ntp:latest` | 123/UDP | (kein Health-Check definiert) | - |
| `el-servador` | `automationone-server` | Build `El Servador/Dockerfile` | 8000 | `GET /api/v1/health/live` | postgres healthy, mqtt-broker healthy |
| `el-frontend` | `automationone-frontend` | Build `El Frontend/Dockerfile` (target: development) | 5173 | Node.js `fetch('http://localhost:5173')` | el-servador healthy |

### 2.2 Monitoring-Services (Profile: `monitoring`)

| Service | Container | Image | Host-Port | Health-Check-Endpoint | Abhängigkeiten |
|---------|-----------|-------|-----------|----------------------|----------------|
| `loki` | `automationone-loki` | `grafana/loki:3.4` | 3100 | `GET /ready` | - |
| `alloy` | `automationone-alloy` | `grafana/alloy:v1.13.1` | 12345 (UI) | TCP-Connect :12345 | loki healthy |
| `prometheus` | `automationone-prometheus` | `prom/prometheus:v3.2.1` | 9090 | `GET /-/healthy` | el-servador healthy |
| `grafana` | `automationone-grafana` | `grafana/grafana:11.5.2` | 3000 | `GET /api/health` | loki healthy, prometheus healthy |
| `cadvisor` | `automationone-cadvisor` | `gcr.io/cadvisor/cadvisor:v0.49.1` | 8080 | `GET /healthz` | - |
| `postgres-exporter` | `automationone-postgres-exporter` | `prometheuscommunity/postgres-exporter:v0.16.0` | 9187 (intern) | `GET /metrics` | postgres healthy |
| `mosquitto-exporter` | `automationone-mosquitto-exporter` | `sapcc/mosquitto-exporter:0.8.0` | 9234 | Health-Check deaktiviert (scratch-Image, kein Shell) | mqtt-broker healthy |

### 2.3 Optionale Profile-Services

| Service | Profile | Port | Zweck |
|---------|---------|------|-------|
| `pgadmin` | `devtools` | 5050 | PostgreSQL-Verwaltung im Browser |
| `esp32-serial-logger` | `hardware` | - | TCP-Serial-Bridge für ESP32-Hardware-Logs |

### 2.4 Volumes und Netzwerk

Alle persistenten Volumes tragen explizite `name:`-Attribute, um den Docker-Compose-v2-Projektpräfix (`auto-one_`) zu vermeiden:
`automationone-postgres-data`, `automationone-mosquitto-data`, `automationone-loki-data`, `automationone-prometheus-data`, `automationone-grafana-data`, `automationone-alloy-data`, `automationone-pgadmin-data`.

Netzwerk: `automationone-net` (bridge). Externes Netzwerk: `shared-infra-net` (für Cross-Stack-Kommunikation).

### 2.5 CI-Overrides (docker-compose.ci.yml)

- PostgreSQL: `tmpfs` (512 MB RAM-Disk) statt persistentem Volume, schnellere Health-Checks (5s interval)
- MQTT: CI-spezifische `mosquitto.conf` aus `.github/mosquitto/` (kein WebSocket, keine Persistenz)
- el-servador: `ENVIRONMENT=testing`, `LOG_LEVEL=WARNING`, keine Host-Volume-Mounts für Logs
- el-frontend: hinter `profiles: [frontend]` (opt-in via `--profile frontend`)
- Monitoring-Services nicht gestartet (Profile werden nicht aktiviert)

---

## 3. Observability-Stack

### 3.1 Prometheus (Metriken)

**Konfiguration:** `docker/prometheus/prometheus.yml`

**Scrape-Konfiguration:**

| Job | Target | Port | Metriken-Pfad | Label |
|-----|--------|------|----------------|-------|
| `el-servador` | `el-servador:8000` | 8000 | `/api/v1/health/metrics` | `service=el-servador` |
| `postgres` | `postgres-exporter:9187` | 9187 | `/metrics` | `service=postgres` |
| `mqtt-broker` | `mosquitto-exporter:9234` | 9234 | `/metrics` | `service=mqtt-broker` |
| `cadvisor` | `cadvisor:8080` | 8080 | `/metrics` | `service=cadvisor` |
| `loki` | `loki:3100` | 3100 | `/metrics` | `service=loki` |
| `alloy` | `alloy:12345` | 12345 | `/metrics` | `service=alloy` |
| `prometheus` | `localhost:9090` | 9090 | `/metrics` | - |

**Globale Einstellungen:** `scrape_interval: 15s`, `evaluation_interval: 15s`, Retention: `7d` (via CLI-Flag `--storage.tsdb.retention.time=7d`).

**Wichtig:** Der Server-Metriken-Endpunkt liegt unter `/api/v1/health/metrics`, nicht unter dem Prometheus-Standard `/metrics`. Dependency: `prometheus-client ^0.19.0` und `prometheus-fastapi-instrumentator ^7.0.0` sind in `pyproject.toml` deklariert.

### 3.2 Grafana (Dashboards)

**Version:** Grafana 11.5.2, Port 3000.

**Datasources (file-provisioned via `docker/grafana/provisioning/datasources/datasources.yml`):**

| Name | Typ | URL | UID | Default |
|------|-----|-----|-----|---------|
| Prometheus | prometheus | `http://prometheus:9090` | `prometheus` | ja |
| Loki | loki | `http://loki:3100` | `loki` | nein |

Loki-Datasource hat `manageAlerts: false`, da die Alert-Verwaltung file-provisioned erfolgt (nicht über Loki-Ruler-API, die "GetRuleGroup unsupported in rule local store" zurückgäbe).

**Dashboards (file-provisioned via `docker/grafana/provisioning/dashboards/`):**

| Dashboard | Datei | Zweck |
|-----------|-------|-------|
| System Health | `system-health.json` | Server-/MQTT-/DB-/Loki-Status, `up{job=...}` Panels |
| Debug Console | `debug-console.json` | Error-Rate, Log-Streams, Correlation-Trace |

Beide Dashboards liegen im Grafana-Ordner `AutomationOne` (via `dashboards.yml`: `folder: 'AutomationOne'`). Dashboard-Deletion ist deaktiviert (`disableDeletion: true`), Bearbeitung erlaubt (`editable: true`).

**Grafana-Konfiguration:** Anonymous Viewer-Zugang aktiv (`GF_AUTH_ANONYMOUS_ENABLED=true`), Iframe-Embedding erlaubt (`GF_SECURITY_ALLOW_EMBEDDING=true`) — für eine `GrafanaPanelEmbed`-Komponente im Frontend.

**Alerting (file-provisioned via `docker/grafana/provisioning/alerting/`):**

37 Alert-Rules in 8 Gruppen (Quelle: `alert-rules.yml` + `loki-alert-rules.yml`):

| Gruppe | Interval | Beispiel-Rules |
|--------|----------|----------------|
| `automationone-critical` | 10s | Server Down, MQTT Disconnected, Database Down, Loki Down, Alloy Down, Prometheus Down |
| Warning | 1min | High Memory, ESP Devices Offline, High MQTT Error Rate |
| Infrastructure | 1min | DB Query Slow, DB Connections High, cAdvisor Down, Container Restart Loop, Database Size High, Loki Ingestion Failure |
| Sensor/ESP | 1min | Sensor Range (temp/pH/humidity/EC), Sensor Stale, Heartbeat Gap, ESP Boot Loop, ESP Error Cascade, ESP Safe Mode |
| Application | 1min | WS Disconnects, MQTT Message Backlog, API Errors High, Logic Engine Errors, Actuator Timeout, Safety Triggered |
| MQTT Broker | 30s | MQTT Broker No Clients, MQTT Broker Messages Stored |
| Notification Pipeline | 1min | Notification Rate High, Email Failure Rate, Webhook Reception Stopped, High Suppression Ratio, Digest Backlog |
| Loki (aus loki-alert-rules.yml) | variabel | Loki-basierte Log-Alerts |

Alle Evaluation-Intervalle sind Vielfache von 10 s (Grafana-Scheduler-Anforderung). cAdvisor auf Docker Desktop exportiert kein `name`-Label — Container-Restart-Alerts nutzen `changes(container_start_time_seconds)` statt `container_restart_count`.

### 3.3 Loki (Logs)

**Version:** Loki 3.4, Port 3100.

**Konfiguration:** `docker/loki/loki-config.yml`

| Parameter | Wert | Bedeutung |
|-----------|------|-----------|
| `auth_enabled` | false | Keine Authentifizierung (Dev-Only) |
| `store` | tsdb | TSDB-Index-Backend |
| `schema` | v13 | Loki-Schema-Version |
| `replication_factor` | 1 | Single-Node |
| `retention_period` | 168h (7 Tage) | Log-Aufbewahrung |
| `allow_structured_metadata` | true | Ermöglicht Alloy Structured Metadata |

**Grafana Alloy als Log-Shipper (nicht mehr Promtail):**

Konfiguration: `docker/alloy/config.alloy` (nativer River-Format, migriert 2026-02-24).

Pipeline-Stufen:

1. `discovery.docker` — Docker-Socket-Discovery, filtert auf Label `com.docker.compose.project=auto-one`
2. `discovery.relabel` — Extraktion von `compose_service`, `container`, `stream`, `compose_project`
3. `loki.source.docker` — Liest Container-Logs via Docker Socket
4. `loki.process` — Per-Service-Pipelines (Details unten)
5. `loki.write` — Push nach `http://loki:3100/loki/api/v1/push`

**Per-Service-Verarbeitung:**

| Service | Format | Labels (indexiert) | Structured Metadata |
|---------|--------|-------------------|---------------------|
| `el-servador` | Text (Regex: `YYYY-MM-DD HH:MM:SS - logger - LEVEL - [request_id] - message`) | `level` (uppercase) | `logger`, `request_id` |
| `el-frontend` | JSON (`{level, component, message, timestamp}`) | `level` (normalisiert uppercase) | `component` |
| `esp32-serial-logger` | JSON + Regex-Fallback für Plain-Text `[millis][LEVEL][TAG]` | `level` | `device`, `component`, `error_code` |
| `mqtt-broker` | Mosquitto Plaintext | `level` (ERROR/WARNING) | - |
| `loki` | logfmt | `level` | - |
| `postgres` | Postgres-Format (`LOG/WARNING/ERROR/FATAL/PANIC`) | `level` (LOG→INFO, FATAL/PANIC→CRITICAL) | `query_duration_ms` |

**Drop-Filter (zur Rauschreduzierung):**

- el-servador: Health-Check-Zugriffe auf `/api/v1/health/` (Prometheus scrapet alle 15 s, Docker-Healthcheck alle 30 s)
- mqtt-broker: `healthcheck`-Verbindungen/Trennungen (~4320 Zeilen/Tag)
- loki: Query-Stats-Logs (`caller=metrics.go`, `engine.go`, `roundtrip.go`) — verhindert False-Positive-Feedback-Loop
- postgres: Checkpoint-Logs (`checkpoint starting`, `checkpoint complete`)

Log-Volumen nach Drop-Optimierung: ca. 24 MB/Tag (vorher 57 MB/Tag, Stand v4.7).

**Loki-Labels (vollständige Tabelle):**

| Label | Werte-Beispiele | Typ |
|-------|-----------------|-----|
| `compose_service` | `el-servador`, `mqtt-broker`, `el-frontend`, `postgres`, `esp32-serial-logger` | Primärer Query-Key |
| `container` | `automationone-server`, `automationone-mqtt` | Container-Name |
| `level` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` | Normalisiert uppercase (alle Services) |
| `service` | wie compose_service | Alias (Alloy setzt beide) |
| `compose_project` | `auto-one` | Projekt-Isolation |
| `stream` | `stdout`, `stderr` | Docker-Stream |

**Structured Metadata** (nicht indexiert, via `| filter` abfragbar):
`logger` (Python-Modul), `request_id` (UUID), `component` (Vue-/ESP-Komponente), `device` (ESP-ID), `error_code`, `query_duration_ms`.

**Strukturierte `event_class`-Labels (ab 2026-04-20, Welle 1):**

| `event_class` | Quelle | Semantik |
|---------------|--------|----------|
| `rule_arbitration` | `services/logic/safety/conflict_manager.py` | `first_wins`-Policy mit Felder `result`, `policy`, `actuator_key`, `winner_rule_id`, `loser_rule_id` |
| `CONFIG_GUARD` | `mqtt/handlers/config_handler.py:168` | Idempotenz-Schutz: stale `config_response` verworfen; Felder `action=skip_stale_response`, `reason=terminal_authority` |

---

## 4. Log-Strategie (Server, ESP32, Frontend)

### 4.1 Server-Log-Strategie

**Format:** Text-Format (nicht JSON-File), strukturiert als:
```
YYYY-MM-DD HH:MM:SS - src.module.name - LEVEL - [request_id] - message
```
(Uvicorn-Access-Logs abweichend: `INFO:     172.18.0.3 - "GET /path HTTP/1.1" 200 OK`)

**Konfiguration:** `src/core/config.py` (LoggingSettings):

| Einstellung | Default | Env-Variable |
|------------|---------|--------------|
| `level` | INFO | `LOG_LEVEL` |
| `format` | json | `LOG_FORMAT` |
| `file_path` | `logs/god_kaiser.log` | `LOG_FILE_PATH` |
| `file_max_bytes` | 10 MB | `LOG_FILE_MAX_BYTES` |
| `file_backup_count` | 10 | `LOG_FILE_BACKUP_COUNT` |

**Pfade:**
- Lokal (Poetry): `El Servador/god_kaiser_server/logs/god_kaiser.log`
- Docker (Bind-Mount): `./logs/server/god_kaiser.log` → `/app/logs/god_kaiser.log`

**Rotation:** RotatingFileHandler, max 10 Backup-Dateien.

**Loki-Integration:** Alloy liest über Docker-Socket, Regex-Parser extrahiert `logger`, `level`, `request_id` als Labels/Metadata; Health-Endpoint-Zugriffe werden gedroppt.

### 4.2 ESP32-Log-Strategie

**Firmware-Logger:** `El Trabajante/src/utils/logger.h` — Singleton mit Circular Buffer (50 Einträge).

**Log-Levels:** `LOG_DEBUG`, `LOG_INFO`, `LOG_WARNING`, `LOG_ERROR`, `LOG_CRITICAL` (Makros).

**Output-Format (Serial):**
```
[millis] [LEVEL   ] [TAG     ] message [E:error_code]
```

**Capture-Methoden:**
- Wokwi-Simulation: `wokwi-cli . --serial-log-file <path>` (empfohlen)
- Echte Hardware: `pio device monitor` + Umleitung/tee
- Docker-Hardware-Profile: `esp32-serial-logger`-Container über TCP-Bridge (ser2net/socat)
- Loki: Nur wenn Profile `hardware` aktiv und TCP-Bridge läuft (`compose_service=esp32-serial-logger`)

**Baud-Rate:** 115200, RFC2217-Port 4000 (Wokwi).

### 4.3 Frontend-Log-Strategie

**Logger-Utility:** `El Frontend/src/utils/logger.ts` — `createLogger(namespace)`.

**Output-Format (JSON für Container):**
```json
{"level": "info", "component": "SensorCard", "message": "...", "timestamp": "2026-..."}
```

**Dev-Modus:** Zusätzlich lesbare Ausgabe in Browser-Konsole; Level-Filter via `VITE_LOG_LEVEL` (default: `debug`).

**Vue Error Handler** (`main.ts`): Globale Vue-Fehler als JSON zu `console.error`.

**Container-Logs:** Docker `json-file`-Driver (max 5 MB, 3 Dateien). Alloy liest via Docker-Socket, JSON-Parser extrahiert `level` (normalisiert zu uppercase) und `component`. Kein Bind-Mount — nur stdout.

> [!ANNAHME] Frontend Vite-Dev-Server schreibt kein Dauer-Log
>
> **Basis:** Kommentar in `LOG_LOCATIONS.md` v4.11: "Vite-Dev-Server schreibt nur beim Start eine Zeile; kein Dauer-Log. Loki-Alert 'Frontend Down' (keine Logs seit 5 Min.) ist deaktiviert (False Positives)."
> **Zu verifizieren:** E11-Agent soll prüfen, ob der deaktivierte Alert in `loki-alert-rules.yml` tatsächlich auskommentiert ist oder nur dokumentarisch erwähnt wird.

---

## 5. Test-Strategie

### 5.1 pytest (Server)

**Framework:** pytest 8.0+, pytest-asyncio 0.23+, pytest-cov 4.1+, pytest-mock 3.12+, pytest-timeout 2.3+.

**Konfiguration:** `El Servador/god_kaiser_server/pyproject.toml`, Abschnitt `[tool.pytest.ini_options]`:

| Parameter | Wert |
|-----------|------|
| `testpaths` | `["tests"]` |
| `asyncio_mode` | `auto` |
| `addopts` | `-ra -q --strict-markers` |
| `python_files` | `test_*.py` |
| `python_classes` | `Test*` |
| `python_functions` | `test_*` |

**Test-Verzeichnisstruktur:**

```
El Servador/god_kaiser_server/tests/
├── unit/           # Isolierte Unit Tests (kein Netzwerk, kein DB)
│   ├── conftest.py
│   ├── test_sensor_calibration.py
│   ├── test_circuit_breaker_unit.py
│   ├── test_repositories_*.py
│   ├── test_temperature_processor.py
│   └── ... (insgesamt ~20 Unit-Test-Dateien)
│
├── integration/    # Integration Tests (SQLite + Mosquitto)
│   ├── conftest.py
│   ├── test_mqtt_flow.py
│   ├── test_circuit_breaker.py
│   ├── test_data_buffer.py
│   ├── test_resilience_integration.py
│   └── ... (~10 Dateien)
│
├── esp32/          # ESP32-Mock-Tests (Python gegen MQTT-Mock)
│   ├── conftest.py
│   ├── mocks/
│   │   ├── in_memory_mqtt_client.py
│   │   └── real_esp32_client.py
│   ├── test_sensor.py
│   ├── test_actuator.py
│   ├── test_boot_loop.py
│   ├── test_gpio_conflict.py
│   ├── test_mqtt_last_will.py
│   └── ... (~14 Dateien)
│
└── e2e/            # Server-E2E-Tests gegen echten Docker-Stack
    ├── test_e2e_smoke.py
    ├── test_e2e_emergency.py
    ├── test_sensor_workflow.py
    ├── test_websocket_events.py
    └── ... (~8 Dateien)
```

**pytest-Marker (vollständige Liste aus pyproject.toml):**
`unit`, `integration`, `esp32`, `e2e`, `hardware`, `performance`, `slow`, `slow_e2e`, `logic`, `temperature`, `critical`, `daily_ops`, `irrigation`, `ventilation`, `night_mode`, `edge_case`, `gpio`, `onewire`, `pwm`, `safety`, `sensor`, `ds18b20`, `cross_esp`, `ph_sensor`, `relay`, `sht31`.

**Coverage-Konfiguration:** Source: `src/`, omit: `*/tests/*`, `*/alembic/*`, `*/__init__.py`. HTML-Report via `--cov-report=html`.

**Besonderheit:** Im CI nutzen Integration-Tests SQLite (`sqlite+aiosqlite:///./test.db`) statt PostgreSQL. Backend-E2E-Tests (`tests/e2e/`) laufen gegen echten Docker-Stack mit PostgreSQL und Mosquitto.

**Linting:** Ruff (`ruff check src/ tests/`) + Black (`black --check src/ tests/`), beide via Poetry-Env.

### 5.2 Vitest (Frontend)

**Framework:** Vitest mit `happy-dom`-Environment.

**Konfiguration:** `El Frontend/vitest.config.ts`:

| Parameter | Wert |
|-----------|------|
| `environment` | `happy-dom` |
| `include` | `tests/**/*.test.ts` |
| `setupFiles` | `tests/setup.ts` |
| `globals` | `true` |
| `css` | `false` (kein CSS-Parsing in Tests) |

**Test-Verzeichnisstruktur:**

```
El Frontend/tests/
├── unit/
│   ├── components/     # Komponenten-Tests
│   │   ├── AccordionSection.test.ts
│   │   ├── AddActuatorModal.test.ts
│   │   ├── AddSensorModal.test.ts
│   │   ├── CommandPalette.test.ts
│   │   ├── ESPSettingsSheet.test.ts
│   │   ├── PendingDevicesPanel.test.ts
│   │   ├── RuleCard.test.ts
│   │   ├── ZonePlate.test.ts
│   │   └── ... (~15 Komponenten-Tests)
│   ├── stores/         # Pinia-Store-Tests
│   │   ├── auth.test.ts
│   │   ├── esp.test.ts
│   │   ├── logic.test.ts
│   │   ├── actuator.store.test.ts
│   │   ├── intentSignals.test.ts
│   │   ├── notification-inbox.test.ts
│   │   ├── ops-lifecycle.test.ts
│   │   └── ... (~12 Store-Tests)
│   ├── composables/    # Composable-Tests
│   │   ├── useWebSocket.test.ts
│   │   ├── useESPStatus.test.ts
│   │   ├── useCalibrationWizard.test.ts
│   │   ├── useFertigationKPIs.ws.test.ts
│   │   └── ... (~7 Composable-Tests)
│   ├── utils/          # Utility-Funktions-Tests
│   │   ├── formatters.test.ts
│   │   ├── sensorDefaults.test.ts
│   │   ├── errorCodeTranslator.test.ts
│   │   ├── labels.test.ts
│   │   └── ... (~15 Utils-Tests)
│   ├── api/            # API-Client-Tests
│   │   ├── uiApiError.test.ts
│   │   └── tokenRefreshConcurrency.test.ts
│   ├── config/         # Konfigurations-Tests
│   ├── domain/         # Domain-Logik-Tests
│   └── router/         # Router-Guard-Tests
├── mocks/
│   ├── server.ts       # Mock-Server (MSW oder ähnliches)
│   └── websocket.ts    # WebSocket-Mock
├── setup.ts            # Globale Test-Setup-Datei
├── e2e/                # Playwright-Specs (s. 5.3)
└── integration/        # (leer, .gitkeep)
```

Insgesamt ca. 65 Unit-Test-Dateien (Zählung aus Glob-Ergebnis).

**CI-Befehl:** `npm run test -- --reporter=default --reporter=junit --outputFile.junit=junit-results.xml`

### 5.3 Playwright (E2E)

**Framework:** Playwright, Konfiguration in `El Frontend/playwright.config.ts`.

**Browser-Projekte:** Chromium, Firefox, WebKit (Desktop), Mobile Chrome (Pixel 7), Mobile Safari (iPhone 14), Tablet (iPad Gen 7).

**Wichtige Konfigurationsparameter:**

| Parameter | Wert | Bedeutung |
|-----------|------|-----------|
| `testDir` | `./tests/e2e` | Alle E2E-Specs |
| `testMatch` | `**/*.spec.ts` | Alle .spec.ts |
| `testIgnore` (CI) | `**/visual-regression.spec.ts` | Visual Regression braucht Baseline-Screenshots |
| `retries` | 1 (CI), 0 (lokal) | Flaky-Test-Wiederholung |
| `workers` | 2 (CI), auto (lokal) | Parallele Worker |
| `baseURL` | `PLAYWRIGHT_BASE_URL` oder `http://localhost:5173` | Frontend-Adresse |
| `storageState` | `.playwright/auth-state.json` | Auth-Wiederverwendung |
| `actionTimeout` | 10000 ms | WebSocket-Tests brauchen mehr Zeit |
| `navigationTimeout` | 30000 ms | |
| `maxDiffPixelRatio` | 0.01 (1%) | Screenshot-Toleranz |

**Auth-Flow:** `globalSetup` (`tests/e2e/global-setup.ts`) loggt einmalig ein und speichert Token in `.playwright/auth-state.json`. Alle Tests nutzen diesen auth state.

**Test-Kategorien:**

```
tests/e2e/
├── scenarios/          # Funktionale E2E-Flows
│   ├── auth.spec.ts
│   ├── device-discovery.spec.ts
│   ├── esp-registration-flow.spec.ts
│   ├── sensor-live.spec.ts
│   ├── actuator.spec.ts
│   └── emergency.spec.ts
│
└── css/                # CSS/Design-System-Tests (5-Layer-Architektur)
    ├── design-tokens.spec.ts      # Layer 1: Token-Werte korrekt
    ├── responsive-layout.spec.ts  # Layer 3: Multi-Viewport
    ├── accessibility.spec.ts      # Layer 4: axe-core + WCAG 2.1 AA
    ├── visual-regression.spec.ts  # Layer 5: Screenshot-Baselines
    ├── buttons.spec.ts
    ├── badges.spec.ts
    ├── cards.spec.ts
    ├── forms.spec.ts
    ├── glass-effects.spec.ts
    └── ...
```

**Visueller Regressions-Test:** Separates Konfigurationsfile `playwright.visual.config.ts` mit `testDir: ./tests/e2e/visual`, single-worker (nicht parallel), eigenes Output-Verzeichnis `playwright-report-visual/`. In CI via `npx playwright test --config=playwright.visual.config.ts --project=visual`.

**Basis-Infrastruktur:** Playwright läuft auf dem Host-Rechner, alle Backend-Services laufen in Docker (Entscheidung TM 2026-02-06). Frontend wird über Port 5173, Backend über Port 8000 erreicht.

**Hilfsfunktionen:** `tests/e2e/helpers/` enthält `css.ts`, `format.ts`, `mqtt.ts`, `websocket.ts`.

**Screenshot-Baselines:** Existieren für Chromium, Firefox, WebKit unter `tests/e2e/css/__screenshots__/`.

### 5.4 Wokwi (ESP32-Simulation)

**Konzept:** Echte C++-Firmware läuft im Wokwi-Simulator — kein Code-Mock, sondern Hardware-in-the-Loop-Simulation.

**Unterschied zu Server-ESP32-Tests:** Die Tests unter `El Servador/tests/esp32/` sind Python-Tests gegen einen Python-MQTT-Mock des ESP32-Verhaltens. Wokwi-Tests führen die kompilierte Firmware in einem virtuellen ESP32 aus.

**Konfiguration:** `El Trabajante/wokwi.toml`:

```toml
[wokwi]
version = 1
firmware = ".pio/build/wokwi_simulation/firmware.bin"
elf = ".pio/build/wokwi_simulation/firmware.elf"
rfc2217ServerPort = 4000

[wokwi.serial]
baud = 115200
```

**Build-Target:** `pio run -e wokwi_simulation` (spezifisches PlatformIO-Environment).

**Szenarien-Struktur:**

```
El Trabajante/tests/wokwi/scenarios/
├── 01-boot/          (2 Szenarien: boot_full, boot_safe_mode)
├── 02-sensor/        (heartbeat, DS18B20)
├── 03-actuator/      (LED ON, PWM, Status, Emergency Clear)
├── 04-zone/          (Zone, Subzone)
├── 05-emergency/     (Broadcast, ESP-Stop)
├── 06-config/        (Sensor Add, Actuator Add)
├── 08-i2c/           (15 Szenarien: init, scan, read, write, errors)
├── 08-onewire/       (29 Szenarien: Discovery, ROM, CRC, Error-Cases)
├── 09-hardware/      (9 Szenarien)
├── 09-pwm/           (15 Szenarien)
├── 10-nvs/           (35 Szenarien: init, persistence, types, namespaces)
└── 11-gpio/          (19 Szenarien) + 11-error-injection/ (10 Szenarien)
```

**Gesamtabdeckung:** 191 Szenarien in 15 Kategorien.

**CI-Strategie:**
- PR/Push: 52 Core-Szenarien + 1 Legacy-MQTT-Test (16 parallele Jobs, schnelles Feedback)
- Nightly (Mo+Do, 02:00 UTC): alle 191 Szenarien (24 Jobs gesamt)

**Wokwi-CLI-Version:** `0.26.1` (pinned via `WOKWI_CLI_VERSION`-Env).

**Voraussetzung:** GitHub-Secret `WOKWI_CLI_TOKEN` (Enterprise-Token für CI-Nutzung).

**MQTT-Injektion:** Tests mit Actuator-Commands nutzen `mosquitto_pub` im Hintergrund nach definiertem Delay. Hilfsskripte: `tests/wokwi/helpers/mqtt_inject.py`, `emergency_cascade.sh`, `wait_for_mqtt.sh`.

**Diagramme:** `tests/wokwi/diagrams/diagram_extended.json` (Standard), `diagram_i2c.json` (für I2C-Tests mit BMP280/SHT31).

---

## 6. CI/CD-Pipeline

### 6.1 Workflow-Übersicht

| Workflow | Datei | Trigger | Schicht |
|----------|-------|---------|---------|
| Server Tests | `server-tests.yml` | Push/PR `El Servador/**` | Server |
| ESP32 Tests | `esp32-tests.yml` | Push/PR `tests/esp32/**`, `src/mqtt/**`, `src/services/**` | Server+ESP32 |
| Frontend Tests | `frontend-tests.yml` | Push/PR `El Frontend/**` | Frontend |
| Wokwi ESP32 Tests | `wokwi-tests.yml` | Push/PR `El Trabajante/**` + Nightly Mo+Do 02:00 UTC | ESP32-Firmware |
| Backend E2E Tests | `backend-e2e-tests.yml` | Push/PR `El Servador/**` + Docker-Compose-Dateien | Server+Infra |
| Playwright E2E | `playwright-tests.yml` | Push/PR `El Frontend/**` + `El Servador/**` | Frontend+Server |
| Security Scan | `security-scan.yml` | Dockerfile/Deps-Änderungen + Mo 06:00 UTC | Sicherheit |
| PR Checks | `pr-checks.yml` | Jeder Pull Request | Querschnitt |
| Wokwi Release Gate | `wokwi-release-gate.yml` | Manuell (workflow_dispatch) | Release |

Alle Workflows: `concurrency.cancel-in-progress: true` — bei mehreren Pushes wird der laufende Workflow abgebrochen.

### 6.2 Server Tests (server-tests.yml)

**Laufzeit-Budget:** 15 min pro Job.

**Job-Kette:** `lint` → [`unit-tests`, `integration-tests`] → `test-summary` (auf `always()`).

| Job | Abhängigkeit | Services | Befehl |
|-----|--------------|----------|--------|
| `lint` | - | - | `ruff check src/ tests/` + `black --check src/ tests/` |
| `unit-tests` | lint | - | `pytest tests/unit/ --cov=src --cov-report=xml` |
| `integration-tests` | lint | Mosquitto Docker | `pytest tests/integration/ --timeout=30` |
| `test-summary` | unit+integration | - | `publish-unit-test-result-action` |

Integration-Tests nutzen SQLite (`sqlite+aiosqlite:///./test.db`) und laufen gegen einen Mosquitto-Docker-Service-Container.

### 6.3 Frontend Tests (frontend-tests.yml)

**Node.js-Version:** 20, `npm ci` (reproducible installs).

**Job-Kette:** `type-check` → [`unit-tests`, `build`] → `test-summary`.

| Job | Befehl | Output |
|-----|--------|--------|
| `type-check` | `npm run type-check` (vue-tsc --noEmit) | TypeScript-Fehler |
| `unit-tests` | `npm run test -- --reporter=junit` | `junit-results.xml` |
| `build` | `npm run build` | Bundle-Size-Report in `GITHUB_STEP_SUMMARY` |

### 6.4 Wokwi Tests (wokwi-tests.yml)

**Quota-Optimierung:** Nightly nur Mo+Do (`cron: '0 2 * * 1,4'`) — ca. 720 Wokwi-Minuten/Woche statt 2520 bei täglich.

**Firmware-Build:** Shared Artifact `wokwi-firmware` (1 Tag Retention), von allen Test-Jobs wiederverwendet.

**Preflight:** `scripts/wokwi/wokwi_preflight.py` prüft CLI-Version gegen pinned `WOKWI_CLI_VERSION` als Hard-Gate.

**Test-Ausführung:** Jeder Szenario-Job lädt Firmware-Artifact, startet Mosquitto-Service-Container, führt `wokwi-cli . --timeout X --scenario <path>` aus.

### 6.5 Backend E2E Tests (backend-e2e-tests.yml)

Docker-Stack: `docker-compose.yml` + `docker-compose.ci.yml` + `docker-compose.e2e.yml`.

`docker compose up` läuft **ohne** `--wait` (historisch dokumentierte Entscheidung: vermeidet sofortigen Fehler ohne Log-Output). Stattdessen Health-Polling in separatem Step.

**Health-Check-Sequenz:** PostgreSQL (20 Versuche, 1s Delay) → MQTT (20 Versuche, 1s) → Server (60 Versuche, 3s).

**Test-Befehl:** `pytest tests/e2e/ --e2e -v --timeout=120 --junitxml=../../logs/server/e2e-results.xml`

### 6.6 Playwright E2E (playwright-tests.yml)

Docker-Stack wie Backend E2E plus Frontend (via `--profile frontend` und `profiles: !reset []` aus `docker-compose.e2e.yml`).

**Test-Befehl:** `npx playwright test --project=chromium --reporter=html,list,junit` + separater visueller Regressions-Run mit `playwright.visual.config.ts`.

Playwright-Traces und -Videos werden bei Failure als Artifact gespeichert (7 Tage).

### 6.7 PR Checks (pr-checks.yml)

| Job | Aktion |
|-----|--------|
| `label-pr` | Automatisches Labeling nach `.github/labeler.yml` basierend auf geänderten Dateipfaden |
| `pr-validation` | Prüft: Dateien >5 MB, sensitive Dateien (`.env`, `*.pem`, `*.key`, ...), Contract-Governance-Gate |

**Contract Governance Gate:** `python .github/scripts/contract_governance_gate.py` — blockiert PRs bei neuen `CONTRACT_*`-Error-Codes ohne Eintrag in `ERROR_CODES.md` oder fehlenden Heilungs-Tests.

### 6.8 Security Scan (security-scan.yml)

Tool: Trivy (Aqua Security). Scannt `el-servador:scan`-Image, `el-frontend:scan`-Image (target: development) und Docker-Configs (`scan-type: config`). Severity: `CRITICAL,HIGH`, `ignore-unfixed: true`. Exit-Code 1 bei Images (blockierend), Exit-Code 0 bei Config-Scan (Warn-only). `.trivyignore` für bekannte nicht-ausnutzbare CVEs.

**Schedule:** Wöchentlich Montag 06:00 UTC.

### 6.9 Wokwi Release Gate (wokwi-release-gate.yml)

Manueller Workflow (`workflow_dispatch`) mit zwei Jobs:
1. `sil-gate`: Führt `scripts/verify_top3_gaps.py --skip-exec` aus, lädt SIL-Reports als Artifact.
2. `hardware-sanity-gate` (opt-in, `runs-on: windows-latest`): PowerShell-Skript `scripts/tests/test_hardware_validation.ps1`.

---

## 7. Health-Checks und Readiness

### 7.1 Service-Health-Check-Übersicht

| Service | Health-Check-Methode | Intervall | Timeout | Retries | Start-Period |
|---------|---------------------|-----------|---------|---------|--------------|
| `postgres` | `pg_isready -U $USER -d $DB` | 10s | 5s | 5 | 15s |
| `mqtt-broker` | `mosquitto_sub -t $$SYS/# -C 1 -W 5` | 30s | 10s | 5 | 15s |
| `el-servador` | `curl -f http://localhost:8000/api/v1/health/live` | 30s | 10s | 3 | 30s |
| `el-frontend` | Node.js `fetch('http://localhost:5173')` (exit 0/1) | 30s | 10s | 3 | 30s |
| `loki` | `wget --spider http://localhost:3100/ready` | 15s | 5s | 5 | 20s |
| `alloy` | TCP-Connect `bash -c '</dev/tcp/localhost/12345'` | 15s | 5s | 5 | 15s |
| `prometheus` | `wget --spider http://localhost:9090/-/healthy` | 15s | 5s | 5 | 15s |
| `grafana` | `wget --spider http://localhost:3000/api/health` | 15s | 5s | 5 | 20s |
| `cadvisor` | `wget --spider http://localhost:8080/healthz` | 15s | 5s | 5 | 15s |
| `postgres-exporter` | `wget --spider http://localhost:9187/metrics` | 15s | 5s | 5 | 10s |
| `mosquitto-exporter` | **deaktiviert** (scratch-Image ohne Shell) | - | - | - | - |
| `pgadmin` | `wget --spider http://localhost:80/misc/ping` | 15s | 5s | 5 | 20s |

### 7.2 Server-Health-Endpunkte

Aus dem Health-Check-Test (`curl -f http://localhost:8000/api/v1/health/live`) und der Prometheus-Konfiguration (`metrics_path: '/api/v1/health/metrics'`) sind folgende Endpunkte ableitbar:

| Endpunkt | Zweck | Genutzt von |
|----------|-------|-------------|
| `/api/v1/health/live` | Liveness-Probe | Docker Health-Check, CI-Health-Polling |
| `/api/v1/health/metrics` | Prometheus-Metriken | Prometheus (Scrape alle 15s) |

> [!ANNAHME] Readiness-Endpunkt
>
> **Basis:** Nur `/api/v1/health/live` und `/api/v1/health/metrics` sind in docker-compose und prometheus.yml explizit referenziert. Ein separater `/api/v1/health/ready`-Endpunkt ist nicht in den analysierten Dateien verifiziert.
> **Zu verifizieren:** E11-Agent soll `El Servador/god_kaiser_server/src/api/v1/` auf das vollständige Health-Router-File prüfen.

### 7.3 Dependency-Graph (Hochfahrreihenfolge)

```
postgres (healthy)    mqtt-broker (healthy)
        \                    /
         \                  /
          el-servador (healthy)
              |              \
              |               \
        el-frontend    prometheus (healthy)
                              |
                              |
                   loki (healthy) + prometheus (healthy)
                              |
                           grafana
```

Alloy hängt nur von Loki ab, nicht von el-servador.

---

## 8. Bekannte Inkonsistenzen

> [!INKONSISTENZ] Server-Tests: pyproject.toml-addopts vs. CI-Befehl
>
> **Beobachtung:** `pyproject.toml [tool.pytest.ini_options] addopts` enthält `-ra -q --strict-markers` (ohne `--cov`), aber der Kommentar darüber sagt "Coverage separat: `poetry run pytest --cov=src ...`". Der CI-Workflow `server-tests.yml` übergibt `--cov=src --cov-report=xml:coverage-unit.xml` explizit. Lokal würde `pytest tests/unit/` ohne explizites `--cov` keine Coverage-Berichte erzeugen, was Verwirrung erzeugen kann.
>
> **Korrekte Stelle:** `El Servador/god_kaiser_server/pyproject.toml` Zeile 157-161, `server-tests.yml` Zeilen 105-112
> **Empfehlung:** Coverage-Flags entweder in `addopts` integrieren oder den Kommentar klarer als "Opt-in" kennzeichnen
> **Erst-Erkennung:** E9, 2026-04-26

> [!INKONSISTENZ] mosquitto-exporter hat keinen Health-Check
>
> **Beobachtung:** In `docker-compose.yml` ist für `mosquitto-exporter` `healthcheck: disable: true` gesetzt mit Begründung "Image is a scratch Go binary - no shell, wget, or curl available". Allerdings hängt kein anderer Service via `depends_on` von mosquitto-exporter ab. Prometheus scrapt mosquitto-exporter direkt, sodass ein Ausfall des Exporters in Grafana als "job=mqtt-broker: down" sichtbar wäre, nicht als Container-Start-Fehler.
>
> **Korrekte Stelle:** `docker-compose.yml` Zeilen 421-426
> **Empfehlung:** Dokumentieren, dass mosquitto-exporter Health via Prometheus-Target-Status verifiziert wird, nicht via Container-Health-Check
> **Erst-Erkennung:** E9, 2026-04-26

> [!INKONSISTENZ] CI_PIPELINE.md nennt falsche Nightly-Szenario-Zahlen
>
> **Beobachtung:** `CI_PIPELINE.md` v1.5 nennt "173 Szenarien (52 core + 121 extended)" für Nightly, während der Workflow-Kommentar in `wokwi-tests.yml` (Zeilen 16-28) "191 Szenarien" als Gesamtzahl und "139 additional scenarios" (nicht 121) für Nightly-Extended nennt. 52 + 139 = 191, nicht 173.
>
> **Korrekte Stelle:** `.claude/reference/debugging/CI_PIPELINE.md` Abschnitt 2.3, `wokwi-tests.yml` Kommentar-Block
> **Empfehlung:** CI_PIPELINE.md auf 191 Szenarien / 139 extended korrigieren
> **Erst-Erkennung:** E9, 2026-04-26

> [!INKONSISTENZ] docker-compose.yml nutzt Alloy-Compose-Project-Filter "auto-one", aber Alloy-Container selbst läuft auch im Projekt
>
> **Beobachtung:** In `docker/alloy/config.alloy` filtert `discovery.docker` auf `com.docker.compose.project=auto-one`. Der Alloy-Container selbst läuft in demselben Compose-Projekt. Dies bedeutet, dass Alloy seine eigenen Logs an sich selbst schickt (Selbst-Referenz), was zu Loki-Query-Stats-Rückkopplungen führt (der Drop-Filter für `caller=metrics.go` etc. ist bereits eine Reaktion darauf).
>
> **Korrekte Stelle:** `docker/alloy/config.alloy` Zeile 38-41, Drop-Filter Zeilen 315-329
> **Empfehlung:** Architekturentscheidung dokumentieren: Selbstreferenz ist bewusst akzeptiert, Drop-Filter reduzieren Rauschen auf 24 MB/Tag
> **Erst-Erkennung:** E9, 2026-04-26

> [!ANNAHME] Visual Regression Baselines sind im Repository eingecheckt
>
> **Basis:** Unter `El Frontend/tests/e2e/css/__screenshots__/chromium/`, `/firefox/`, `/webkit/` existieren PNG-Baselines (aus Glob-Ergebnis verifiziert). Der playwright.config.ts-Kommentar "Exclude visual-regression tests in CI: no baseline screenshots available" suggeriert aber, dass in CI keine Baselines vorhanden sind.
> **Zu verifizieren:** E11-Agent soll prüfen, ob die Baselines in `.gitignore` ausgeschlossen sind oder tatsächlich committed wurden — der Widerspruch zwischen vorhandenen Screenshot-Dateien und dem CI-Ausschluss-Kommentar bedarf Klärung.

---

## 9. Lokale Entwicklungs-Kommandos (Kurzreferenz)

| Aktion | Befehl |
|--------|--------|
| Kern-Stack starten | `docker compose up -d` |
| Monitoring hinzuschalten | `docker compose --profile monitoring up -d` |
| Dev-Overrides | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` |
| Server-Tests (Unit) | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/ -v --no-cov` |
| Server-Tests (Integration) | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/integration/ -v` |
| Server-Lint | `cd "El Servador/god_kaiser_server" && poetry run ruff check src/` |
| Frontend-Tests | `cd "El Frontend" && npm run test` |
| Frontend-Build | `cd "El Frontend" && npm run build` |
| ESP32-Build | `cd "El Trabajante" && pio run -e seeed` |
| Wokwi-Build | `cd "El Trabajante" && pio run -e wokwi_simulation` |
| Wokwi-Test lokal | `cd "El Trabajante" && wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml` |
| Playwright lokal | `cd "El Frontend" && npx playwright test --project=chromium` |
| Loki-Errors | `make loki-errors` (Windows: `powershell -File scripts/loki-query.ps1 errors 5`) |
| CI-Status | `gh run list --status=failure --limit=5` |
