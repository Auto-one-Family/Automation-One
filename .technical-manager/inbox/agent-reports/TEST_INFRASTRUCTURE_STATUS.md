# Test Infrastructure Status (Cross-Layer)

**Erstellt:** 2026-02-11
**Branch:** feature/docs-cleanup
**Quellordner:** `.technical-manager/inbox/agent-reports/`
**Anzahl Reports:** 3

---

## Einbezogene Reports

| # | Report | Layer | Agent | Datum | Zeilen |
|---|--------|-------|-------|-------|--------|
| 1 | esp32-debug-test-engine-2026-02-10.md | ESP32 Firmware | esp32-debug | 2026-02-10 | 538 |
| 2 | frontend-debug-test-engine-2026-02-10.md | Vue 3 Frontend | frontend-debug | 2026-02-10 | 810 |
| 3 | server-debug-test-engine-2026-02-10.md | FastAPI Backend | server-debug | 2026-02-10 | 968 |

---

## Executive Summary

**Gesamt-Status:** ❌ **CRITICAL – Tests existieren, aber Test-Infrastruktur hat kritische Blocker**

### Cross-Layer Test Coverage

| Layer | Status | Tests Vorhanden | Ausführbarkeit | Coverage |
|-------|--------|----------------|----------------|----------|
| **ESP32 Firmware** | ⚠️ **PARTIAL** | 163 Wokwi Scenarios + 2 Native Tests | ✅ OK (Wokwi), ⚠️ Native möglich | **~9% Native (2 von 23)** |
| **Backend (FastAPI)** | ⚠️ **PARTIALLY BROKEN** | ~109 Test-Files | ❌ 15 Tests broken (Installation fehlt) | Unbekannt |
| **Frontend (Vue 3)** | ❌ **KRITISCH** | Tests vorhanden | ❌ Dependencies fehlen | **Store 40%, Composable 25%, Component 0%** |

**VERIFY-PLAN KORREKTUR (2026-02-11):**
- ESP32: Native Tests EXISTIEREN bereits (2 aktive, 21 archiviert)
- Backend: ~109 Test-Files (verify-plan Zählung), Report sagte ~106

---

## SYSTEM REALITY CHECK (2026-02-11 by verify-plan)

### Docker-Infrastruktur (VERIFIZIERT)

**Compose-Dateien:**
- ✅ docker-compose.yml (Base: 451 Zeilen, 12 Services total)
- ✅ docker-compose.dev.yml (Dev-Overlay, Makefile Referenz)
- ✅ docker-compose.test.yml (Test-Overlay, Makefile Referenz)
- ✅ docker-compose.e2e.yml (E2E-Overlay, Makefile Referenz)
- ⚠️ docker-compose.ci.yml (CI-Overlay, NICHT im Makefile)

**Docker Services (docker-compose.yml, 12 Services):**

| Service | Container | Port(s) | Profile | Health-Check | Bind-Mounts |
|---------|-----------|---------|---------|--------------|-------------|
| postgres | automationone-postgres | 5432 | (default) | pg_isready | logs/postgres/ |
| mqtt-broker | automationone-mqtt | 1883, 9001 | (default) | mosquitto_sub | (stdout-only) |
| el-servador | automationone-server | 8000 | (default) | curl /health/live | logs/server/ |
| el-frontend | automationone-frontend | 5173 | (default) | fetch localhost:5173 | (none) |
| loki | automationone-loki | 3100 | **monitoring** | wget /ready | (none) |
| promtail | automationone-promtail | - | **monitoring** | tcp check | (none) |
| prometheus | automationone-prometheus | 9090 | **monitoring** | wget /-/healthy | (none) |
| grafana | automationone-grafana | 3000 | **monitoring** | wget /api/health | (none) |
| postgres-exporter | automationone-postgres-exporter | 9187 | **monitoring** | wget /metrics | (none) |
| mosquitto-exporter | automationone-mosquitto-exporter | 9234 | **monitoring** | wget /metrics | (none) |
| pgadmin | automationone-pgadmin | 5050 | **devtools** | wget /misc/ping | (none) |
| esp32-serial-logger | automationone-esp32-serial | - | **hardware** | (none) | (none) |

**Docker Profiles:**
- **monitoring:** 6 Services (loki, promtail, prometheus, grafana, postgres-exporter, mosquitto-exporter)
- **devtools:** 1 Service (pgadmin)
- **hardware:** 1 Service (esp32-serial-logger)
- **(default):** 4 Services (postgres, mqtt-broker, el-servador, el-frontend)

**Docker Volumes (docker volume ls):**
- **Alte Naming** (auto-one_*): 6 Volumes (grafana, loki, pgadmin, postgres, prometheus, promtail-positions)
- **Neue Naming** (automationone-*): 7 Volumes (grafana, loki, mosquitto-data, mosquitto-log, postgres, prometheus, promtail-positions)
- **Migration-Hinweis:** docker-compose.yml Zeile 418-427 enthält Migration-Commands (docker run --rm -v from:/from -v to:/to alpine cp -a)

**Docker Commands (PowerShell-Kompatibilität):**
- ✅ `docker compose ps` (v2-Syntax, kein Bindestrich)
- ✅ `docker compose up -d`, `docker compose down`, `docker compose logs -f`
- ✅ `docker compose --profile monitoring up -d` (Monitoring-Stack)
- ✅ `docker compose --profile devtools up -d` (DevTools-Stack)
- ❌ `make <target>` funktioniert NICHT in PowerShell (benötigt GNU make via Git Bash/WSL)
- ⚠️ `mosquitto_sub` benötigt vollständigen Pfad in PowerShell: `& "C:\Program Files\mosquitto\mosquitto_sub.exe"`

**Environment-Variablen (.env.example - 90 Zeilen):**

| Variable | Services | Default | Notizen |
|----------|----------|---------|---------|
| POSTGRES_USER | postgres, el-servador | god_kaiser | |
| POSTGRES_PASSWORD | postgres, el-servador | CHANGE_ME | ⚠️ Sicherheit |
| POSTGRES_DB | postgres, el-servador | god_kaiser_db | |
| DATABASE_URL | el-servador | (konstruiert) | Aus POSTGRES_* |
| DATABASE_AUTO_INIT | el-servador | true | DB-Migration |
| JWT_SECRET_KEY | el-servador | CHANGE_ME | ⚠️ Sicherheit |
| MQTT_BROKER_HOST | el-servador | mqtt-broker | Docker-Service |
| MQTT_BROKER_PORT | el-servador | 1883 | |
| MQTT_WEBSOCKET_PORT | el-servador | 9001 | |
| VITE_API_URL | el-frontend | http://localhost:8000 | |
| VITE_WS_URL | el-frontend | ws://localhost:8000 | |
| VITE_LOG_LEVEL | el-frontend | debug | |
| GRAFANA_ADMIN_PASSWORD | grafana | admin | ⚠️ Profil: monitoring |
| PGADMIN_DEFAULT_EMAIL | pgadmin | admin@automationone.dev | ⚠️ Profil: devtools |
| PGADMIN_DEFAULT_PASSWORD | pgadmin | admin | ⚠️ Profil: devtools |
| ESP32_SERIAL_HOST | esp32-serial-logger | host.docker.internal | ⚠️ Profil: hardware |
| ESP32_SERIAL_PORT | esp32-serial-logger | 3333 | TCP-Bridge (ser2net) |
| ESP32_DEVICE_ID | esp32-serial-logger | esp32-xiao-01 | |
| WOKWI_CLI_TOKEN | (Host, nicht Docker) | (leer) | Optional |

### Makefile-Targets (296 Zeilen, VERIFIZIERT)

**Stack Lifecycle:**
```bash
make up/down               # Production-Stack
make dev/dev-down          # Dev-Stack (hot-reload)
make test/test-down        # Test-Stack
make e2e-up/e2e-down       # E2E Full-Stack
make build                 # Rebuild Images
make clean                 # Stop + remove Volumes (DESTRUCTIVE)
```

**Logs & Status:**
```bash
make logs                  # Alle Logs
make logs-server           # Server-Logs
make logs-mqtt             # MQTT-Logs
make logs-frontend         # Frontend-Logs
make logs-db               # PostgreSQL-Logs
make status                # = docker compose ps
make health                # = curl http://localhost:8000/api/v1/health/live
make mqtt-sub              # = mosquitto_sub -h localhost -t "kaiser/#" -v
```

**Database:**
```bash
make shell-db              # PostgreSQL CLI
make db-migrate            # Alembic upgrade head
make db-rollback           # Alembic downgrade -1
make db-status             # Alembic current + history
make db-backup             # Backup via script
make db-restore FILE=path  # Restore via script
```

**Monitoring-Stack (Profile: monitoring):**
```bash
make monitor-up            # Starte Loki, Promtail, Prometheus, Grafana, Exporter
make monitor-down          # Stoppe Monitoring-Stack
make monitor-logs          # Folge Monitoring-Logs
make monitor-status        # = docker compose --profile monitoring ps
```

**DevTools-Stack (Profile: devtools):**
```bash
make devtools-up           # Starte pgAdmin
make devtools-down         # Stoppe DevTools-Stack
make devtools-logs         # Folge DevTools-Logs
make devtools-status       # = docker compose --profile devtools ps
```

**Wokwi ESP32 Simulation (8 neue Targets seit 2026-02-11):**
```bash
make wokwi-build                    # Parallel 3 ESPs (wokwi_esp01/02/03)
make wokwi-build-esp01/02/03        # Einzelne ESP-Builds
make wokwi-seed                     # DB seeden mit 3 Wokwi-Devices
make wokwi-list                     # 163 Scenarios auflisten
make wokwi-test-quick               # 3 Tests (boot_full, boot_safe_mode, sensor_heartbeat)
make wokwi-test-full                # 23 CI Scenarios
make wokwi-test-scenario SCENARIO=path
make wokwi-test-category CAT=01-boot
make wokwi-run                      # Interaktiv ESP_00000001
make wokwi-run-esp01/02/03          # Interaktiv spezifischer ESP
```

**Wokwi-Scenario-Count (Makefile-Korrekturen nötig):**
- Makefile Zeile 64: sagt "23 tests" für wokwi-test-full
- **REALITÄT:** 163 Scenarios in tests/wokwi/scenarios/
- **Makefile-Bug:** wokwi-test-full ruft nur 23 ausgewählte CI-Scenarios auf (nicht alle 163)

### Loki-Integration (VERIFIZIERT)

**Promtail Config (docker/promtail/config.yml - 140 Zeilen):**

**Service-Discovery:** Docker socket (`unix:///var/run/docker.sock`)
**Filter:** `com.docker.compose.project=auto-one`

**Pipeline-Stages:**

1. **docker: {}** - Unwrap Docker json-file log driver
2. **el-servador match:**
   - Drop: Health-Checks (GET /api/v1/health/*)
   - Multiline: Python tracebacks (3s max, 50 Zeilen)
   - Regex: Structured log parsing (`level`, `logger`, `request_id`, `message`)
   - Labels: `level`, `logger`
3. **el-frontend match:**
   - JSON parser: `level`, `component`
   - Labels: `level`, `component`
4. **esp32-serial-logger match:**
   - JSON parser: `level`, `device_id`, `component`, `format`
   - Labels: `level`, `device`, `component`

**Loki-Labels (low-cardinality):**
- **service** (compose_service): el-servador, mqtt-broker, el-frontend, postgres, esp32-serial-logger
- **container**: automationone-server, automationone-mqtt, automationone-frontend, automationone-postgres, automationone-esp32-serial
- **stream**: stdout, stderr
- **level**: INFO, WARNING, ERROR, DEBUG
- **logger**: z.B. `src.mqtt.handlers.sensor_handler` (el-servador only)
- **component**: z.B. `ESPCard` (el-frontend), `mqtt/sensor/logger` (esp32-serial-logger)
- **device**: z.B. `esp32-xiao-01` (esp32-serial-logger only)

**Loki-API (Port 3100, Profil: monitoring):**
```bash
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service="el-servador"}' \
  --data-urlencode 'limit=100'

curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service="el-servador"} |= "ERROR"' \
  --data-urlencode 'limit=50'

curl -s "http://localhost:3100/loki/api/v1/label/service/values"
```

**Grafana (Port 3000, Profil: monitoring):**
- **Login:** admin / ${GRAFANA_ADMIN_PASSWORD} (aus .env, Default: admin)
- **Datasources:** Prometheus (default), Loki
- **Dashboard:** AutomationOne - System Health (provisioned via docker/grafana/provisioning/)

**Prometheus (Port 9090, Profil: monitoring):**
- **Scrape-Targets:**
  - el-servador: http://el-servador:8000/api/v1/health/metrics (15s)
  - postgres-exporter: http://postgres-exporter:9187/metrics
  - mosquitto-exporter: http://mosquitto-exporter:9234/metrics
- **Config:** docker/prometheus/prometheus.yml
- **Retention:** 7d (via command: --storage.tsdb.retention.time=7d)

### Log-Pfade (VERIFIZIERT via LOG_LOCATIONS.md + Glob)

| Quelle | Pfad | Format | Native File-Option | Notizen |
|--------|------|--------|-------------------|---------|
| **Server** | logs/server/god_kaiser.log | JSON | ✅ Automatisch | Rotation 10MB × 10 |
| **pytest** | stdout + junit-*.xml | Text/XML | ✅ --junitxml | |
| **Coverage** | htmlcov/index.html | HTML | ✅ --cov-report | |
| **Wokwi Serial** | logs/wokwi/serial/<cat>/<scenario>_<ts>.log | Text | ✅ wokwi-cli --serial-log-file | ✅ verifiziert |
| **Wokwi MQTT** | logs/wokwi/mqtt/<cat>/<scenario>_<ts>.log | Text | ✅ mosquitto_sub redirect | ✅ verifiziert |
| **Wokwi Reports** | logs/wokwi/reports/test_report_<ts>.json | JSON | ✅ Script-generiert | ✅ verifiziert |
| **Wokwi JUnit** | logs/wokwi/reports/junit_<ts>.xml | XML | ✅ Script-generiert | ✅ verifiziert |
| **ESP32 Serial (HW)** | logs/esp32/serial.log | Text | ⚠️ log2file unzuverlässig | > redirect empfohlen |
| **MQTT Traffic** | (stdout) | Text | ❌ Capture nötig | mosquitto_sub > mqtt.log |
| **PostgreSQL** | logs/postgres/postgresql-*.log | Text | ✅ Automatisch | docker bind-mount |
| **MQTT Broker** | (stdout-only) | Text | ✅ docker compose logs | Profil-Abhängigkeit: Standard |
| **Frontend** | (stdout-only) | JSON | ✅ docker compose logs | Profil-Abhängigkeit: Standard |
| **Loki** | http://localhost:3100/loki/api/v1/query_range | JSON | ✅ API | Profil-Abhängigkeit: monitoring |

**Wokwi-Log-Struktur (verifiziert via Glob - 90+ Log-Dateien):**
```
logs/wokwi/
├── serial/<category>/<scenario>_<timestamp>.log      # Wokwi stdout
├── mqtt/<category>/<scenario>_<timestamp>.log        # mosquitto_sub capture
├── reports/test_report_<timestamp>.json              # Test-Ergebnisse
└── reports/junit_<timestamp>.xml                     # JUnit XML
```

**Beispiel-Kategorien (13 total):** 01-boot, 02-sensor, 03-actuator, 04-zone, 05-emergency, 06-config, 07-combined, 08-i2c, 08-onewire, 09-hardware, 09-pwm, 10-nvs, gpio

### ESP32 Native Tests (VERIFIZIERT)

**platformio.ini [env:native] (Zeile 209-259, 51 Zeilen):**

```ini
[env:native]
platform = native
build_flags = -std=c++17 -DNATIVE_TEST=1 -DUNIT_TEST=1 -DESP_PLATFORM=0 -I src/ -I test/mocks/
test_framework = unity
test_build_src = yes           # ✅ Production-Code mit Tests kompilieren
test_ignore = test/esp32_hardware/*, test/integration/*, test/_archive/*
test_filter = test/unit/infra/*, test/unit/utils/*, test/unit/models/*, test/unit/managers/*
```

**Aktive Tests (verifiziert via Glob - 2 Files):**
- ✅ test/unit/infra/test_topic_builder.cpp
- ✅ test/unit/managers/test_gpio_manager_mock.cpp

**Archivierte Tests:**
- 21 .cpp Files in test/_archive/ (noch nicht migriert)

**Test-Befehl (PowerShell/CMD empfohlen, NICHT Git Bash):**
```bash
cd "El Trabajante"
pio test -e native                    # Alle nativen Tests
pio test -e native -f test_topic_*    # Nur TopicBuilder
pio test -e native -v                 # Verbose
```

**Git Bash Problem (dokumentiert in platformio.ini Zeile 207):**
- ⚠️ Git Bash hat bekannte Probleme mit `pio test`
- ✅ Verwende PowerShell oder CMD für native Tests

### PowerShell-Kompatibilität (KRITISCH für Windows-User)

**Funktioniert direkt:**
- ✅ `docker compose` (alle Befehle, v2-Syntax)
- ✅ `pio` (PlatformIO, alle Befehle)
- ✅ `git` (alle Befehle)
- ✅ `gh` (GitHub CLI, alle Befehle)
- ✅ `curl` (mit JSON-Escaping oder Here-String)

**Funktioniert NICHT direkt:**
- ❌ `make <target>` (benötigt GNU make via Git Bash/WSL)
- ❌ `mosquitto_sub` (wenn nicht im PATH, vollständigen Pfad benötigt)
- ❌ `tee` (PowerShell hat `Tee-Object`, andere Syntax)
- ❌ `tail -f` (PowerShell hat `Get-Content -Wait`, andere Syntax)

**PowerShell-Workarounds:**
```powershell
# mosquitto_sub mit vollständigem Pfad
& "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/#" -v

# tee
command | Tee-Object -FilePath "output.log"

# tail -f
Get-Content "path/to/file.log" -Wait -Tail 50

# JSON für curl (Variante 1: Escaping)
curl -X POST http://localhost:8000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\": \"Robin\", \"password\": \"Robin123!\"}'

# JSON für curl (Variante 2: Here-String, EMPFOHLEN)
$body = @{username="Robin"; password="Robin123!"} | ConvertTo-Json
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" `
  -Method POST -ContentType "application/json" -Body $body
$TOKEN = $response.access_token
```

**Workflow-Empfehlung:**
- **Docker-Operationen:** PowerShell OK ✅
- **Makefile-Targets:** Git Bash verwenden ⚠️
- **PlatformIO native Tests:** PowerShell oder CMD (NICHT Git Bash) ✅
- **MQTT-Tools:** Vollständigen Pfad verwenden oder PATH setzen ⚠️
- **Wokwi-Tests:** PowerShell OK (wokwi-cli ist Python-basiert) ✅

---

### Kritische Blocker (P0)

| Layer | Blocker | Impact | Fix |
|-------|---------|--------|-----|
| **ESP32** | ⚠️ Nur 2 von 23 Tests aktiv | Geringe native Test-Coverage (~9%) | Restliche 21 Tests aus _archive/ nach test/unit/ migrieren |
| **Backend** | ❌ 15 Tests unausführbar | Virtual Environment fehlt Dependency | `poetry install` ausführen |
| **Frontend** | ❌ Tests nicht ausführbar | package.json fehlt vitest/msw/playwright | Dependencies + Scripts hinzufügen |

**VERIFY-PLAN KORREKTUR (2026-02-11) – MAJOR:**
- ✅ ESP32: [env:native] IST VORHANDEN (platformio.ini Zeile 209-244)
- ✅ ESP32: test/unit/ IST VORHANDEN (infra, managers, models, utils)
- ✅ ESP32: 2 AKTIVE TESTS (test_topic_builder.cpp, test_gpio_manager_mock.cpp)
- ✅ Backend: prometheus-fastapi-instrumentator IST DEFINIERT (pyproject.toml Zeile 47)
- ⚠️ Report vom 2026-02-10 war VERALTET – Native Test-Infrastruktur war bereits implementiert

### Positive Findings

| Layer | Stärke |
|-------|--------|
| **ESP32** | ✅ 163 Wokwi Scenarios (gut strukturiert, 13 Kategorien) |
| **Backend** | ✅ Conftest-Hierarchie Best Practice, MockESP32Client produktionsgetreu |
| **Frontend** | ✅ Existierende Tests exzellent (auth, esp, useToast, useWebSocket), Config Best Practice |

---

## 1. ESP32 Firmware Test-Engine

> **Source:** `esp32-debug-test-engine-2026-02-10.md` (538 Zeilen)
> **Agent:** esp32-debug
> **Datum:** 2026-02-10

### Status: ⚠️ **PARTIAL – Native Test-Infrastruktur vorhanden, aber minimal**

#### Kern-Problem

- ✅ **2 aktive Unity-Tests** in `test/unit/` (test_topic_builder.cpp, test_gpio_manager_mock.cpp)
- ❌ **21 archivierte Tests** in `test/_archive/` (noch nicht migriert)
- **163 Wokwi Simulation-Scenarios** vorhanden, aber **kein Ersatz für native Unit Tests**
- **Migration zu server-orchestrierten Tests** (140 Tests auf Backend) abgeschlossen
- ✅ **Native Test-Environment vorhanden** in platformio.ini (Zeile 209-244) mit `test_build_src = yes`
- ✅ **Native Test-Ordner vorhanden:** `test/unit/infra/`, `test/unit/managers/`, `test/unit/models/`, `test/unit/utils/`
- **Kein HAL-Pattern** (nur 1 Interface: IActuatorDriver) → Native Testing für Hardware-nahe Module erschwert

**VERIFY-PLAN KORREKTUR (2026-02-11) – MAJOR DISKREPANZ:**
- ❌ Report-Datum 2026-02-10 war VERALTET oder unvollständig
- ✅ [env:native] IST KONFIGURIERT (platformio.ini Zeile 209-244)
- ✅ test/unit/ ORDNERSTRUKTUR IST VORHANDEN (infra, managers, models, utils)
- ✅ 2 AKTIVE TESTS (nicht 0!): test_topic_builder.cpp (Unity-basiert), test_gpio_manager_mock.cpp
- ⚠️ 21 Tests noch in test/_archive/ → Migration in Gange, aber nicht abgeschlossen
- 📊 Native Test-Coverage: ~9% (2 von 23 Tests aktiv)

#### Test-Inventar

**platformio.ini Test-Environments:** ✅ **VORHANDEN (7 Environments)**

```ini
# Production (2 Environments):
[env:seeed_xiao_esp32c3]    # Xiao ESP32-C3 Board
[env:esp32_dev]             # ESP32 Dev Board

# Simulation (4 Environments):
[env:wokwi_simulation]      # Basis Wokwi
[env:wokwi_esp01]           # Wokwi Multi-Device ESP_00000001
[env:wokwi_esp02]           # Wokwi Multi-Device ESP_00000002
[env:wokwi_esp03]           # Wokwi Multi-Device ESP_00000003

# Native Testing (1 Environment): ✅ SEIT 2026-02-11
[env:native]                # Native x86_64 Tests (test_build_src = yes)
                            # test_framework = unity
                            # test_filter = test/unit/infra/*, test/unit/utils/*
                            # test_ignore = test/_archive/*, test/integration/*
```

**VERIFY-PLAN KORREKTUR (2026-02-11):** Das [env:native] Environment ist bereits implementiert (platformio.ini Zeile 209-244). Dokument behauptete fälschlicherweise es fehle.

**Archivierte Unity Tests:** ✅ **21 .cpp Files** in `test/_archive/`

**Grund für Archivierung:** PlatformIO Unity Framework linkt nur Test-Dateien, Production-Code (Logger, ConfigManager, etc.) wird nicht automatisch gelinkt → `undefined reference` errors

**Migrierte Test-Suites:**

| ESP32 Unity Test | Server pytest Test | Status |
|------------------|-------------------|--------|
| `comm_mqtt_client.cpp` | `test_communication.py::TestMQTTConnectivity` | ✅ |
| `infra_config_manager.cpp` | `test_infrastructure.py::TestConfigManagement` | ✅ |
| `infra_topic_builder.cpp` | `test_infrastructure.py::TestTopicFormats` | ✅ |
| `actuator_manager.cpp` | `test_actuator.py::TestDigitalActuatorControl` | ✅ |
| `sensor_manager.cpp` | `test_sensor.py::TestSensorReading` | ✅ |
| `integration_full.cpp` | `test_integration.py::TestCompleteSensorActuatorFlow` | ✅ |

**Nicht migriert (Hardware-spezifisch):**
- `comm_wifi_manager.cpp` – WiFi-Stack nur auf echtem Device testbar
- `sensor_i2c_bus.cpp` – I2C-Hardware-Interaktion
- `sensor_onewire_bus.cpp` – OneWire-Hardware-Interaktion
- `infra_storage_manager.cpp`, `infra_logger.cpp` – Internal, nicht via MQTT testbar

**Wokwi Scenarios:** ✅ **163 YAML-Scenarios**

```
01-boot/             2 scenarios   (Boot-Sequenz, SafeMode)
02-sensor/           5 scenarios   (Heartbeat, DS18B20, DHT22, Analog)
03-actuator/         7 scenarios   (Status, Digital, PWM, Emergency)
04-zone/             2 scenarios   (Zone, Subzone Assignment)
05-emergency/        3 scenarios   (Emergency-Stop Flows)
06-config/           2 scenarios   (Config-Push, Validation)
07-combined/         2 scenarios   (Sensor+Actuator Combined)
08-i2c/             20 scenarios   (I2C Init, Read, Write, Errors, Recovery)
08-onewire/         30 scenarios   (OneWire Discovery, ROM-Validation, DS18B20)
09-hardware/        10 scenarios   (Board-Type, I2C-Config)
09-pwm/             18 scenarios   (PWM Init, Duty, Frequency, Emergency)
10-nvs/             40 scenarios   (NVS Init, Key-Ops, Namespaces, Integration)
gpio/               25 scenarios   (GPIO Init, Safe-Mode, Conflicts)
```

**Coverage-Gaps (Wokwi):**

| Feature | Wokwi-Coverage | Status |
|---------|---------------|--------|
| Boot-Sequenz (16 Steps) | 2 scenarios | ✅ |
| MQTT Connection | 1 scenario (root) | ✅ |
| NVS Operations | 40 scenarios | ✅ |
| I2C Bus | 20 scenarios | ✅ |
| OneWire Bus | 30 scenarios | ✅ |
| PWM Controller | 18 scenarios | ✅ |
| GPIO Manager | 25 scenarios | ✅ |
| **Zone-Kaiser Features** | 2 scenarios (04-zone/) | ⚠️ **DÜNN** |
| **Device Lifecycle** | – | ❌ **FEHLT** |
| **Subzone Management** | 1 scenario | ⚠️ **DÜNN** |

#### Testbare Firmware-Logic (Native Test-Kandidaten)

**Kategorie A: Pure Logic (keine Hardware-Dependencies)**

| Modul | Pfad | Testbarkeit | Priorität |
|-------|------|------------|-----------|
| **TopicBuilder** | `utils/topic_builder.cpp` | ✅ 100% | **P0** |
| **ErrorCodes** | `models/error_codes.h` | ✅ 100% (Constants) | P1 |
| **StringHelpers** | `utils/string_helpers.cpp` | ✅ 100% | P1 |
| **DataBuffer** | `utils/data_buffer.cpp` | ✅ 100% | P1 |
| **SensorRegistry** | `models/sensor_registry.cpp` | ✅ 100% | P1 |
| **ConfigResponse** | `services/config/config_response.cpp` | ✅ Parsing-Logic | P2 |
| **OnewireUtils** | `utils/onewire_utils.cpp` | ⚠️ ROM-Validation (CRC) | P2 |

**TopicBuilder Beispiel:**
```cpp
// Reine String-Manipulation – perfekt für native Tests
static const char* buildSensorDataTopic(uint8_t gpio);
static const char* buildActuatorCommandTopic(uint8_t gpio);
static const char* buildSubzoneAssignTopic();
static const char* buildZoneAckTopic();
```

**Test-Potential:** 20+ Topic-Builder-Funktionen × 3 Edge-Cases = **60+ Unit Tests** ohne Hardware.

**Kategorie B: Business-Logic mit Hardware-Abstraktion möglich**

| Modul | Pfad | Abstraction needed | Priorität |
|-------|------|-------------------|-----------|
| **ConfigManager** | `services/config/config_manager.cpp` | Mock NVS | P2 |
| **SafetyController** | `services/actuator/safety_controller.cpp` | Mock GPIO | P3 |
| **CircuitBreaker** | `error_handling/circuit_breaker.cpp` | Mock Time | P2 |
| **HealthMonitor** | `error_handling/health_monitor.cpp` | Mock Sensors | P3 |

#### Hardware-Abstraction Layer (HAL)

**Status:** ⚠️ **UNZUREICHEND – Nur 1 Interface**

**Gefundene Interfaces:**
```cpp
El Trabajante/src/services/actuator/actuator_drivers/iactuator_driver.h
```

**IActuatorDriver Interface:**
```cpp
class IActuatorDriver {
public:
    virtual ~IActuatorDriver() = default;
    virtual bool initialize() = 0;
    virtual bool set(float value) = 0;
    virtual bool setDigital(bool state) = 0;
    // ...
};
```

**Implementierungen:**
- ✅ `pwm_actuator.cpp` (implements IActuatorDriver)
- ✅ `pump_actuator.cpp`
- ✅ `valve_actuator.cpp`

**Fehlende Interfaces:**
- ❌ **IGPIODriver** – GPIO-Operations abstrahieren
- ❌ **II2CBus** – I2C-Operations abstrahieren
- ❌ **IOneWireBus** – OneWire-Operations abstrahieren
- ❌ **IStorageManager** (NVS) – Persistence abstrahieren
- ❌ **IWiFiManager** – WiFi-Operations abstrahieren

**Konsequenz:** Ohne HAL-Interfaces können Module wie `ConfigManager`, `SensorManager`, `ActuatorManager` **nicht nativ getestet** werden → Dependencies zu Hardware sind hart verdrahtet.

#### Qualität der archivierten Tests (Stichprobe)

**Analysierte Files:**
1. `actuator_manager.cpp` (50 lines)
2. `infra_topic_builder.cpp` (50 lines)

**Pattern-Bewertung:**
- ✅ **Dual-Mode Tests:** Testet mit existierenden Production-Actuators ODER VirtualDriver
- ✅ **MockMQTTBroker:** `helpers/mock_mqtt_broker.h` für MQTT-Testing ohne echten Broker
- ✅ **RAII-Pattern:** `helpers/temporary_test_actuator.h` für automatisches Cleanup
- ✅ **setUp/tearDown:** Korrekte Unity-Pattern
- ✅ **Reine Logic-Tests:** TopicBuilder ist String-Manipulation → perfekt für native Tests
- ✅ **Assertions:** `TEST_ASSERT_EQUAL_STRING` – korrekte Unity-Syntax
- ✅ **Testbarkeit:** Keine Hardware-Dependencies (TopicBuilder)

**Kompilierbarkeit:** ❌ **NICHT kompilierbar** ohne `test_build_src = true` (undefined references zu production code)

**Reaktivierbarkeit:**
- ✅ TopicBuilder-Tests können **sofort reaktiviert** werden (pure logic)
- ⚠️ Actuator-Tests benötigen **Mock-Layer** für GPIO/PWM
- ❌ I2C/OneWire-Tests benötigen **HAL-Interfaces** (nicht vorhanden)

#### Empfehlungen (ESP32)

**P0 – Kritisch (sofort angehen):**

1. **Native Test-Migration abschließen**
   - ✅ `[env:native]` bereits vorhanden (platformio.ini Zeile 209-244)
   - ✅ `test/unit/` Ordnerstruktur vorhanden (infra, managers, models, utils)
   - ✅ 2 Tests bereits aktiv (test_topic_builder.cpp, test_gpio_manager_mock.cpp)
   - ❌ 21 Tests noch in `test/_archive/` → nach `test/unit/` migrieren
   - Ziel: ~100% Native Test-Coverage für Pure-Logic-Module

   **VERIFY-PLAN KORREKTUR (2026-02-11):** Native Infrastruktur ist bereits implementiert, Migration läuft bereits (~9% done).

2. **TopicBuilder-Tests reaktivieren**
   - Archivierte Tests aus `test/_archive/infra_topic_builder.cpp` als Basis
   - ~60+ Tests für alle Topic-Funktionen
   - Pure Logic → sofort testbar

**P1 – Hoch (nächste Iteration):**

3. **Weitere Pure-Logic-Tests**
   - StringHelpers, DataBuffer, ErrorCodes
   - SensorRegistry, ConfigResponse-Parser
   - OnewireUtils (ROM-CRC-Validation)

4. **HAL-Interfaces einführen**
   - IGPIODriver, II2CBus, IOneWireBus, IStorageManager
   - Dependency-Injection in Managers
   - Mock-Implementierungen für Tests

**P2 – Mittel (nach HAL-Refactoring):**

5. **Business-Logic-Tests mit Mocks**
   - ConfigManager (mit NVS-Mock)
   - SafetyController (mit GPIO-Mock)
   - CircuitBreaker (mit Time-Mock)

6. **Wokwi-Scenarios erweitern**
   - Zone-Kaiser: Vollständiger Flow (Assign → Validate → ACK)
   - Device Lifecycle: Alle States & Transitions
   - Subzone-Hierarchie: Cascading, Conflicts, Safe-Mode

#### Datei-Referenzen (ESP32)

| Kategorie | Pfade |
|-----------|-------|
| **platformio.ini** | `El Trabajante/platformio.ini` |
| **Archivierte Tests** | `El Trabajante/test/_archive/*.cpp` (21 files) |
| **Wokwi Scenarios** | `El Trabajante/tests/wokwi/scenarios/` (163 YAML) |
| **Wokwi Root Tests** | `El Trabajante/tests/wokwi/boot_test.yaml`, `mqtt_connection.yaml` |
| **MQTT Helper** | `El Trabajante/tests/wokwi/helpers/mqtt_inject.py` |
| **Source Code** | `El Trabajante/src/**/*.cpp` (42 files) |
| **Interface** | `El Trabajante/src/services/actuator/actuator_drivers/iactuator_driver.h` |
| **Server-Tests** | `El Servador/god_kaiser_server/tests/esp32/` (140 tests) |
| **Test-Doku** | `El Servador/docs/ESP32_TESTING.md`, `MQTT_TEST_PROTOCOL.md` |

---

## 2. Backend (FastAPI) Test-Engine

> **Source:** `server-debug-test-engine-2026-02-10.md` (968 Zeilen)
> **Agent:** server-debug
> **Datum:** 2026-02-10

### Status: ❌ **PARTIALLY BROKEN – 15 von ~106 Tests nicht ausführbar**

#### Kern-Problem

- **ModuleNotFoundError:** `prometheus_fastapi_instrumentator` fehlt → 15 Tests unlauffähig
- ⚠️ **10+ unregistrierte pytest Marker** → Warnings bei Collection
- ⚠️ **Pydantic V2 Deprecations** → 5+ Schemas nutzen veraltetes class-based config

#### Test-Inventar

- **Unit Tests:** 36 Files
- **Integration Tests:** 45 Files (15 davon Collection Error)
- **E2E Tests:** 6 Files (1 davon Collection Error)
- **ESP32 Mock Tests:** 19 Files
- **Gesamt:** ~106 Test-Files, 4 Conftest-Dateien

#### Conftest-Hierarchie: ✅ OK

**Struktur (4 Conftest-Dateien):**

```
tests/
├── conftest.py                    # ROOT – Global Fixtures (457 Zeilen)
├── unit/conftest.py              # UNIT – Override autouse fixtures (42 Zeilen)
├── esp32/conftest.py             # ESP32 – Mock fixtures (790 Zeilen)
└── e2e/conftest.py               # E2E – Real server fixtures (968 Zeilen)
integration/conftest_logic.py     # ⚠️ Ungewöhnlicher Name (kein conftest.py!)
```

**Root conftest.py Highlights:**
- ✅ **Environment-Variables BEFORE imports** (Zeile 20-22) – verhindert eager engine loading
- ✅ **SQLite in-memory mit StaticPool** – Windows-kompatibel
- ✅ **3x autouse fixtures** (Zeilen 331-457):
  - `override_get_db` – Alle Tests nutzen Test-DB statt Production-DB
  - `override_mqtt_publisher` – Mock MQTT Publisher (verhindert Broker-Hangs)
  - `override_actuator_service` – Mock ActuatorService mit Mock Publisher
- ✅ **Markers registriert** (pytest_configure, Zeilen 68-83): critical, sensor, actuator, safety, edge_case, ds18b20, onewire, flow_a/b/c, pwm, gpio, hardware

**Unit conftest.py:** ✅ Korrekt – Unit-Tests überschreiben autouse fixtures (kein DB/MQTT/App setup nötig)

**ESP32 conftest.py:** ✅ Sehr gut – Mock-Strategie produktionsgetreu

**Mock-Fixtures (20+):**
- `mock_esp32` – Basic Mock
- `mock_esp32_unconfigured` – Ohne Zone-Provisioning
- `mock_esp32_with_actuators` – Pre-configured (GPIO 5/6/7)
- `mock_esp32_with_sensors` – Pre-configured (GPIO 34/35/36)
- `mock_esp32_with_zones` – Zone-Management
- `mock_esp32_with_sht31` – Multi-Value Sensor
- `mock_esp32_greenhouse` – Complete Greenhouse Setup (DS18B20, SHT31, Moisture, Pump, Valve, Fan)
- `multiple_mock_esp32` – 3 ESPs für Cross-ESP Testing
- `multiple_mock_esp32_with_zones` – 4 ESPs (Zone A Sensors/Actuators, Zone B Sensors/Actuators)
- `mock_esp32_safe_mode` – Safe-Mode Testing
- `real_esp32` – Echte ESP32-Hardware (optional, via ENV)
- `mock_esp32_with_broker` – Real MQTT Broker Connection (skips if broker unavailable)
- `mqtt_test_client` – InMemoryMQTTTestClient

**Broker Mode Support (Phase 3):**
- `BrokerMode.DIRECT` – In-memory (schnell, kein Broker nötig)
- `BrokerMode.MQTT` – Real MQTT Broker (E2E Tests)
- Helper: `is_mqtt_broker_available(host, port)` – Auto-Skip wenn Broker nicht erreichbar

**E2E conftest.py:** ✅ Sehr gut – Real-Server-Ready

**Features:**
- ✅ **Windows SelectorEventLoop Policy** (Zeilen 34-38) – Python 3.14 Kompatibilität
- ✅ **Device ID Helpers** – generate_valid_mock_id(), generate_valid_esp_id()
- ✅ **E2E Skip Marker** – Tests nur wenn `--e2e` Flag gesetzt
- ✅ **Pytest Addoptions** – `--e2e`, `--slow-e2e`, `--server-url`, `--mqtt-host`, `--mqtt-port`
- ✅ **E2EConfig DataClass** – Server URL, MQTT Config, Timeouts
- ✅ **E2EAPIClient** – Helper für REST-API
- ✅ **E2EMQTTClient** – MQTT Helper
- ✅ **GreenhouseTestFactory** – Test-Data Factory

**⚠️ conftest_logic.py:** Ungewöhnlicher Name (nicht `conftest.py`) → wird NICHT automatisch von pytest geladen!

**Workaround:** Tests importieren explizit:
```python
from tests.integration.conftest_logic import *
```

**Empfehlung:** ⚠️ Umbenennen zu `conftest.py` ODER in root conftest.py mergen

#### Async-Pattern: ✅ OK

**pyproject.toml:**
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"  # ✅ Correct!
```

**Dependencies:**
```toml
pytest = "^8.0.0"
pytest-asyncio = "^0.23.3"
pytest-cov = "^4.1.0"
pytest-mock = "^3.12.0"
```

**Event Loop Fixture (Root conftest.py):**
```python
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
```

✅ **Session-scoped Event Loop**

**Test-Engine Creation:**
```python
@pytest_asyncio.fixture(scope="function")
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # ✅ Windows-kompatibel
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()
```

✅ **Async Engine korrekt**

#### DB-Isolation: ✅ OK

**Strategy:** SQLite in-memory (`:memory:`) statt Production PostgreSQL

**Config (Root conftest.py):**
```python
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_AUTO_INIT"] = "false"
os.environ["TESTING"] = "true"
```

✅ **Environment-Variables BEFORE imports**

**Engine Creation:**
```python
engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # ✅ Windows-kompatibel!
)
```

✅ **StaticPool** – Alle Connections teilen sich die gleiche in-memory DB (Windows Fix)

**Dependency Override:**
```python
@pytest_asyncio.fixture(scope="function", autouse=True)
async def override_get_db(test_engine: AsyncEngine):
    """Override app's get_db with test database. AUTOUSE=True!"""
    from src.main import app
    from src.api.deps import get_db

    test_session_maker = sessionmaker(...)

    async def override_get_db_func():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db_func
    yield
    app.dependency_overrides.pop(get_db, None)
```

✅ **autouse=True** – ALLE Tests nutzen automatisch Test-DB

#### Mock-Strategie: ✅ OK

**ESP32 Mocks (4 Files):**

1. **InMemoryMQTTTestClient** (`in_memory_mqtt_client.py`, 77 Zeilen)
   - Lightweight, synchronous MQTT test double
   - publish(), subscribe(), wait_for_message(), clear()
   - Vermeidet Broker-Dependencies
   - ✅ **Async-kompatibel** (async def publish)

2. **MockESP32Client** (`mock_esp32_client.py`, ~1000+ Zeilen)
   - **Production-accurate** ESP32 MQTT behavior
   - ✅ Komplette MQTT Message Structure
   - ✅ Zone Management + Subzone Assignment
   - ✅ Multi-Value Sensors (SHT31: temp + humidity)
   - ✅ System State Machine (12 States)
   - ✅ Actuator Response/Alert Topics
   - ✅ Batch Sensor Publishing
   - ✅ Library Management System
   - ✅ Heartbeat mit System Metrics
   - ✅ Bidirectional Config Topics

   **Topic Structure (Production-getreu):**
   ```
   kaiser/god/esp/{esp_id}/sensor/{gpio}/data
   kaiser/god/esp/{esp_id}/actuator/{gpio}/command
   kaiser/god/esp/{esp_id}/system/heartbeat
   kaiser/god/zone/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data
   ```

3. **RealESP32Client** (`real_esp32_client.py`) – Nicht gelesen, aber in conftest.py referenziert

#### Test-Ausführbarkeit: ❌ BROKEN

**Command:** `poetry run pytest --collect-only --quiet`

**Ergebnis:** ❌ **15 Collection Errors**

**Betroffene Tests:**
```
ERROR tests/e2e/test_websocket_events.py
ERROR tests/integration/test_api_actuators.py
ERROR tests/integration/test_api_audit.py
ERROR tests/integration/test_api_auth.py
ERROR tests/integration/test_api_esp.py
ERROR tests/integration/test_api_health.py
ERROR tests/integration/test_api_logic.py
ERROR tests/integration/test_api_sensors.py
ERROR tests/integration/test_api_subzones.py
ERROR tests/integration/test_api_zone.py
ERROR tests/integration/test_auth_security_features.py
ERROR tests/integration/test_data_validation.py
ERROR tests/integration/test_token_blacklist.py
ERROR tests/integration/test_user_workflows.py
ERROR tests/integration/test_websocket_auth.py
```

**Root Cause:** `ModuleNotFoundError: No module named 'prometheus_fastapi_instrumentator'`

**Traceback:**
```python
tests/integration/test_api_actuators.py:16: in <module>
    from src.main import app
src/main.py:673: in <module>
    from prometheus_fastapi_instrumentator import Instrumentator
E   ModuleNotFoundError: No module named 'prometheus_fastapi_instrumentator'
```

**Ursache:** Dependency ist in pyproject.toml definiert (Zeile 47), aber nicht im aktuellen Virtual Environment installiert

**VERIFY-PLAN KORREKTUR (2026-02-11):**
- ✅ pyproject.toml Zeile 47: `prometheus-fastapi-instrumentator = "^7.0.0"` ist DEFINIERT
- ❌ Problem: Dependency nicht installiert → `poetry install` ausführen

**Betroffene Tests:** Alle Integration-Tests die `src.main.app` importieren (14 Integration + 1 E2E)

**✅ Tests die FUNKTIONIEREN:**
- **Unit Tests:** 36 Files – ✅ Keine Collection Errors (importieren nicht src.main)
- **ESP32 Tests:** 19 Files – ✅ Keine Collection Errors
- **E2E Tests:** 5 von 6 – ✅ (nur test_websocket_events.py betroffen)
- **Integration Tests (nicht-API):** ~30 Files – ✅

**Gesamt:** ~90 von ~106 Tests sammeln sich erfolgreich

**Fix:** `poetry install` ausführen (prometheus-fastapi-instrumentator ist in pyproject.toml Zeile 47 definiert)

**VERIFY-PLAN KORREKTUR:** Zeile 47, nicht 48

#### Marker-Nutzung: ⚠️ Verbesserung

**Definierte Marker (pyproject.toml):** 7 Marker

```toml
markers = [
    "unit: Unit tests",
    "integration: Integration tests",
    "esp32: ESP32 mock tests",
    "e2e: End-to-end tests",
    "hardware: Tests requiring real ESP32 hardware",
    "performance: Performance benchmarking tests",
    "slow: Slow-running tests",
]
```

**Zusätzliche Marker (Root conftest.py):** +12 Marker (1 Duplikat: hardware)

**❌ Unregistrierte Marker (pytest Warnings):**
```
PytestUnknownMarkWarning: Unknown pytest.mark.logic
PytestUnknownMarkWarning: Unknown pytest.mark.cross_esp
PytestUnknownMarkWarning: Unknown pytest.mark.temperature
PytestUnknownMarkWarning: Unknown pytest.mark.irrigation
PytestUnknownMarkWarning: Unknown pytest.mark.ventilation
PytestUnknownMarkWarning: Unknown pytest.mark.night_mode
PytestUnknownMarkWarning: Unknown pytest.mark.ph_sensor
PytestUnknownMarkWarning: Unknown pytest.mark.relay
PytestUnknownMarkWarning: Unknown pytest.mark.sht31
```

**Problem:** conftest_logic.py ist KEIN conftest.py → pytest_configure wird NIE aufgerufen → Marker "logic" NICHT registriert

#### Coverage-Lücken: ⚠️ Verbesserung

**❌ Module OHNE Tests (Stichprobe):**

**Fehlende Tests für neue Module:**
1. **src/api/v1/kaiser.py** – Kaiser-Registry API
2. **src/api/v1/ai.py** – AI Predictions API
3. **src/api/v1/library.py** – Library Management API
4. **src/api/v1/sequences.py** – Sequence API

**Services ohne Tests:**
1. **src/services/kaiser_service.py**
2. **src/services/ai_service.py**
3. **src/services/god_client.py**
4. **src/services/health_service.py** (Test-API existiert, hat Collection Error!)

**MQTT Handlers ohne Tests:**
1. **src/mqtt/handlers/kaiser_handler.py**

**Utilities ohne Tests:**
1. **src/utils/data_helpers.py**
2. **src/utils/time_helpers.py**
3. **src/utils/mqtt_helpers.py**
4. **src/utils/network_helpers.py**

**Impact:** High – Neue Features (Kaiser, AI, Library) ungetestet

#### Veraltete Tests: ⚠️ Potenzielle Probleme

**Pydantic V2 Deprecation Warnings:**

```
src/api/schemas.py:15: PydanticDeprecatedSince20:
    Support for class-based `config` is deprecated, use ConfigDict instead.
```

**Betroffene Dateien:**
1. src/api/schemas.py (5x)
   - SensorProcessRequest, SensorProcessResponse, ErrorResponse, SensorCalibrateRequest, SensorCalibrateResponse
2. src/api/v1/audit.py (1x)
   - AuditLogResponse

**Pattern (alt):**
```python
class SensorProcessRequest(BaseModel):
    class Config:
        from_attributes = True
```

**Pattern (neu):**
```python
from pydantic import BaseModel, ConfigDict

class SensorProcessRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)
```

**Status:** ⚠️ Deprecated (funktioniert noch, aber wird in Pydantic V3 entfernt)

#### Empfehlungen (Backend)

**🔴 P0 – CRITICAL (Must Fix):**

1. **Dependency-Issue beheben**
   - Problem: 15 Tests unausführbar
   - ✅ Config korrekt: pyproject.toml Zeile 47 definiert prometheus-fastapi-instrumentator
   - ❌ Installation fehlt: Virtual Environment hat Dependency nicht
   - Fix: `poetry install` ausführen (installiert alle definierten Dependencies)
   - Verification: `poetry run pytest --collect-only` → 0 Errors

   **VERIFY-PLAN KORREKTUR:** Dependency ist definiert, nur Installation fehlt.

**🟠 P1 – HIGH (Should Fix):**

2. **Coverage-Lücken schließen**
   - Neue Features: kaiser.py, ai.py, library.py, sequences.py
   - Services: kaiser_service.py, ai_service.py
   - Handlers: kaiser_handler.py
   - Utilities: data_helpers.py, time_helpers.py, mqtt_helpers.py

3. **Marker konsolidieren**
   - Problem: 9+ unregistrierte Marker → Warnings
   - Fix: Alle Marker in pyproject.toml registrieren
   - Liste: logic, cross_esp, temperature, irrigation, ventilation, night_mode, ph_sensor, relay, sht31

**🟡 P2 – MEDIUM (Could Fix):**

4. **conftest_logic.py umbenennen**
   - Option 1: Umbenennen zu conftest.py
   - Option 2: In root conftest.py mergen

5. **Pydantic V2 Migration**
   - 6+ Schemas: Migrieren zu model_config = ConfigDict(...)

6. **Factory-Pattern erweitern**
   - ESPDeviceFactory, UserFactory, SensorConfigFactory

**🟢 P3 – LOW (Nice to Have):**

7. **Coverage-Threshold hinzufügen**
   ```toml
   [tool.coverage.report]
   fail_under = 80
   ```

#### Datei-Referenzen (Backend)

**Conftest-Dateien:**
- [tests/conftest.py](El Servador/god_kaiser_server/tests/conftest.py) – Root (457 Zeilen)
- [tests/unit/conftest.py](El Servador/god_kaiser_server/tests/unit/conftest.py) – Unit (42 Zeilen)
- [tests/esp32/conftest.py](El Servador/god_kaiser_server/tests/esp32/conftest.py) – ESP32 (790 Zeilen)
- [tests/e2e/conftest.py](El Servador/god_kaiser_server/tests/e2e/conftest.py) – E2E (968 Zeilen)
- [tests/integration/conftest_logic.py](El Servador/god_kaiser_server/tests/integration/conftest_logic.py) – Logic (⚠️ ungewöhnlicher Name)

**Mock-Dateien:**
- [tests/esp32/mocks/in_memory_mqtt_client.py](El Servador/god_kaiser_server/tests/esp32/mocks/in_memory_mqtt_client.py) – 77 Zeilen
- [tests/esp32/mocks/mock_esp32_client.py](El Servador/god_kaiser_server/tests/esp32/mocks/mock_esp32_client.py) – 1000+ Zeilen

**Config-Dateien:**
- [god_kaiser_server/pyproject.toml](El Servador/god_kaiser_server/pyproject.toml) – Zeilen 125-166 (pytest + coverage)

---

## 3. Frontend (Vue 3) Test-Engine

> **Source:** `frontend-debug-test-engine-2026-02-10.md` (810 Zeilen)
> **Agent:** frontend-debug
> **Datum:** 2026-02-10

### Status: ⚠️ **KRITISCH – Tests existieren, aber Test-Infrastruktur fehlt**

#### Kern-Problem

**Kritisches Blocker-Problem:** Tests können **NICHT ausgeführt werden** – Vitest und Test-Utils fehlen in package.json!

Die Frontend-Test-Suite hat **hochwertige Unit-Tests**, aber **kritische Lücken:**

| Kategorie | Befund | Coverage |
|-----------|--------|----------|
| **Test-Infrastruktur** | ❌ Keine Dependencies in package.json | N/A |
| **Store Tests** | ⚠️ 2 von 5 Stores getestet | **40%** |
| **Composable Tests** | ⚠️ 2 von 8 Composables getestet | **25%** |
| **Component Tests** | ❌ 0 von 67 Components getestet | **0%** |
| **Integration Tests** | ❌ Ordner leer | **0%** |
| **E2E Tests** | ✅ 5 Playwright Scenarios | ✅ OK |
| **Mocks** | ✅ MSW-basiert, comprehensive | ✅ OK |
| **Config** | ✅ vitest.config.ts + playwright.config.ts | ✅ OK |

#### Test-Inventar

**vitest.config.ts (43 Zeilen):** ✅ **OK – Vollständig konfiguriert**

```typescript
test: {
  globals: true,                        // ✅ Globale Test-APIs
  environment: 'jsdom',                 // ✅ DOM-Simulation
  setupFiles: ['./tests/setup.ts'],    // ✅ Setup-File definiert
  include: ['tests/**/*.test.ts'],     // ✅ Pattern korrekt
  coverage: {
    provider: 'v8',                     // ✅ Modern (v8 statt istanbul)
    reporter: ['text', 'json', 'html'], // ✅ Multiple Formate
    reportsDirectory: '../../logs/frontend/vitest/coverage',
    include: ['src/**/*.{ts,vue}'],
    exclude: ['src/**/*.d.ts', 'src/main.ts', 'src/vite-env.d.ts']
  },
  testTimeout: 10000,
  hookTimeout: 10000,
  pool: 'forks',
  poolOptions: { forks: { singleFork: true } }
}
```

**Bewertung:** Config ist **Best Practice 2025**

**setup.ts (156 Zeilen):** ✅ **OK – Sehr gut strukturiert**

```typescript
// MSW Server Setup
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => { server.resetHandlers(); localStorage.clear(); sessionStorage.clear() })
afterAll(() => server.close())

// Pinia Setup (fresh store per test)
beforeEach(() => setActivePinia(createPinia()))

// Vue Test Utils Global Config
config.global.stubs = { RouterLink: true, RouterView: true, teleport: true }

// Global Mocks (jsdom-Lücken)
- window.matchMedia ✅
- ResizeObserver ✅
- IntersectionObserver ✅
- window.scrollTo ✅
- HTMLCanvasElement.getContext ✅ (für Chart.js)
```

**Bewertung:**
- **MSW:** ✅ Korrekt (listen, resetHandlers, close)
- **Pinia:** ✅ **PERFEKT** – Fresh Pinia in beforeEach (verhindert State-Pollution)
- **Vue Stubs:** ✅ Router + Teleport gestubbed
- **Global Mocks:** ✅ Alle jsdom-Lücken geschlossen
- **Chart.js Mock:** ✅ Umfassend (Canvas Context mit 20+ Methoden)

**Store Tests:** ⚠️ **2 von 5 Stores getestet (40% Coverage)**

**Getestete Stores:**

| Store | Test-File | Zeilen | Qualität |
|-------|-----------|--------|----------|
| **auth** | `tests/unit/stores/auth.test.ts` | 520 | ✅ **Exzellent** (10/10) |
| **esp** | `tests/unit/stores/esp.test.ts` | 989 | ✅ **Exzellent** (10/10) |

**Nicht getestete Stores:**

| Store | Pfad | Geschätzte Complexity |
|-------|------|----------------------|
| ❌ **database** | `src/stores/database.ts` | Mittel (DB Explorer State) |
| ❌ **logic** | `src/stores/logic.ts` | Hoch (Cross-ESP Automation) |
| ❌ **dragState** | `src/stores/dragState.ts` | Niedrig (Drag&Drop State) |

**auth.test.ts Highlights:**
- ✅ 9 Test-Suites, 520 Zeilen
- ✅ Initial State (7 Tests)
- ✅ Computed Getters (isAuthenticated, isAdmin, isOperator)
- ✅ checkAuthStatus (6 Tests)
- ✅ login (5 Tests: success, localStorage, error, loading)
- ✅ setup (3 Tests: admin creation)
- ✅ logout (4 Tests: clear state, disconnect WS, API failure resilience)
- ✅ refreshTokens (3 Tests)
- ✅ clearAuth (2 Tests)

**esp.test.ts Highlights:**
- ✅ 12 Test-Suites, 989 Zeilen
- ✅ Initial State (8 Tests)
- ✅ fetchAll (4 Tests: success, isLoading, error, deduplication)
- ✅ CRUD Operations (fetchDevice, createDevice, updateDevice, deleteDevice)
- ✅ Pending Devices (fetchPendingDevices, approveDevice, rejectDevice)
- ✅ Computed Getters (9x: selectedDevice, deviceCount, onlineDevices, offlineDevices, mockDevices, realDevices, devicesByZone, pendingCount, isMock)
- ✅ GPIO Status (fetch + cache, loading state)
- ✅ Mock ESP Actions (5x: triggerHeartbeat, setState, addSensor, removeSensor, addActuator)
- ✅ Actuator Commands (sendActuatorCommand, emergencyStopAll)
- ✅ Edge Cases (timeout, validation errors)

**Composable Tests:** ⚠️ **2 von 8 Composables getestet (25% Coverage)**

**Getestete Composables:**

| Composable | Test-File | Zeilen | Qualität |
|------------|-----------|--------|----------|
| **useToast** | `tests/unit/composables/useToast.test.ts` | 378 | ✅ **Exzellent** (10/10) |
| **useWebSocket** | `tests/unit/composables/useWebSocket.test.ts` | 943 | ✅ **Exzellent** (10/10) |

**Nicht getestete Composables:**

| Composable | Pfad | Geschätzte Complexity |
|------------|------|----------------------|
| ❌ **useModal** | `src/composables/useModal.ts` | Niedrig |
| ❌ **useSwipeNavigation** | `src/composables/useSwipeNavigation.ts` | Mittel |
| ❌ **useGpioStatus** | `src/composables/useGpioStatus.ts` | Mittel |
| ❌ **useQueryFilters** | `src/composables/useQueryFilters.ts` | Mittel |
| ❌ **useZoneDragDrop** | `src/composables/useZoneDragDrop.ts` | Hoch |
| ❌ **useConfigResponse** | `src/composables/useConfigResponse.ts` | Mittel |

**useToast.test.ts Highlights:**
- ✅ 9 Test-Suites, 378 Zeilen
- ✅ Basic Show (4 Tests: API vollständig, ID unique, createdAt timestamp)
- ✅ Convenience Methods (success/error/warning/info)
- ✅ Duration (5 Tests: default 5s, error 8s, custom, auto-dismiss, persistent)
- ✅ Dismiss & Clear
- ✅ Deduplication (3 Tests: 2s window, different types, window expiry)
- ✅ Max Limits (3 Tests: 20 total, oldest removed, 10 persistent)
- ✅ Singleton State (2 Tests: shared state, clear())
- ✅ Timer-Handling korrekt (`vi.useFakeTimers()` + `vi.advanceTimersByTime()`)

**useWebSocket.test.ts Highlights:**
- ✅ 10 Test-Suites, 943 Zeilen
- ✅ Basic API (returns expected properties)
- ✅ Connection (4x: Initial State, connect(), disconnect())
- ✅ Subscriptions (3x: subscribe(), on(), unsubscribe())
- ✅ Messages (4 Tests: lastMessage, messageCount, dispatch, all handlers)
- ✅ Filter Updates
- ✅ Status Monitor (1s interval, watchStatus)
- ✅ Cleanup (5 Tests: stop interval, clear handlers, multiple calls, singleton)
- ✅ Options (autoConnect, initial filters)
- ✅ Errors (connectionError, status=error, retry)
- ✅ Integration Scenarios (full lifecycle, multiple handlers)
- ✅ Custom WebSocket Mock (`tests/mocks/websocket.ts`)

**Mocks:** ✅ **OK – MSW-basiert, comprehensive**

**Mock-Dateien:**

| File | Zeilen | Zweck |
|------|--------|-------|
| `handlers.ts` | 799 | MSW Request Handlers (alle API-Endpoints) |
| `server.ts` | ~ | MSW Server Setup |
| `websocket.ts` | ~ | Custom WebSocket Service Mock |

**handlers.ts API-Handler-Gruppen (799 Zeilen):**

| Gruppe | Endpoints | Zeilen | Coverage |
|--------|-----------|--------|----------|
| **Auth** | 5 Endpoints (status, login, setup, refresh, me, logout) | 90 | ✅ Vollständig |
| **ESP Devices** | 6 Endpoints + approve/reject | 100 | ✅ Vollständig |
| **Sensors** | 2 Endpoints (data, create/update) | 50 | ⚠️ Partial |
| **Actuators** | 2 Endpoints (command, emergency_stop) | 35 | ✅ OK |
| **OneWire** | 1 Endpoint (scan) | 25 | ✅ OK |
| **Zones** | 2 Endpoints (assign, remove) | 30 | ⚠️ Partial (keine subzones) |
| **Database** | 1 Endpoint (tables) | 15 | ⚠️ Minimal |
| **Audit** | 1 Endpoint (statistics) | 15 | ⚠️ Minimal |
| **Debug/Mock ESP** | 14 Endpoints (CRUD + sensors/actuators/state/heartbeat) | 260 | ✅ Umfassend |

**Findings:**
- ✅ MSW-Handlers decken **~80% der Server-API** ab
- ❌ **Gap:** Keine Mocks für Subzones, Logic, Logs, Errors, Health (detailed), Users, Loadtest
- ✅ Debug/Mock-ESP Handlers sind **sehr umfassend** (14 Endpoints)

**E2E Tests:** ✅ **OK – 5 Scenarios vorhanden**

**E2E Scenarios:**

| File | Scope |
|------|-------|
| `auth.spec.ts` | Login/Logout Flow |
| `actuator.spec.ts` | Actuator Control |
| `device-discovery.spec.ts` | Pending Device Approval |
| `emergency.spec.ts` | Emergency Stop via UI |
| `sensor-live.spec.ts` | Live Sensor Updates (WebSocket) |

**playwright.config.ts (107 Zeilen):** ✅ **Best Practice 2025**

```typescript
testDir: './tests/e2e/scenarios'
testMatch: '**/*.spec.ts'
fullyParallel: true
forbidOnly: !!process.env.CI
retries: process.env.CI ? 1 : 0
workers: process.env.CI ? 2 : undefined

reporter: [
  ['html', { outputFolder: '../../logs/frontend/playwright/playwright-report' }],
  ['list'],
  ...(process.env.CI ? [['github']] : [])
]

globalSetup: './tests/e2e/global-setup.ts'        // ✅ Auth-Setup
globalTeardown: './tests/e2e/global-teardown.ts'  // ✅ Cleanup

use: {
  baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
  storageState: '.playwright/auth-state.json',    // ✅ Auth-State-Reuse
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'on-first-retry',
  viewport: { width: 1280, height: 720 },
  actionTimeout: 10000,
  navigationTimeout: 30000
}

timeout: 30000
expect: { timeout: 10000 }

projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
]
```

**Findings:**
- ✅ Global Setup für Auth (Login einmal, Token in `.playwright/auth-state.json`)
- ✅ storageState reused (jeder Test startet authenticated)
- ✅ Trace + Screenshot + Video bei Failures
- ✅ CI-Optimierungen (GitHub Reporter, Retries, Workers)
- ⚠️ **Gap:** Keine Zone-Kaiser E2E Scenarios

**Integration Tests:** ❌ **LEER – Nur .gitkeep vorhanden**

**Verzeichnis:** `El Frontend/tests/integration/`

**Was sollte in Integration-Tests stehen?**
- **Store + API Mock:** `espStore.fetchAll()` → MSW Response → Store aktualisiert
- **WebSocket + Store:** WS-Message `sensor_data` → ESP Store-Handler → UI-Update
- **Router Guards + Auth:** Navigate `/dashboard` ohne Token → Redirect `/login`
- **Pinia Store-Interaktion:** `authStore.logout()` → `espStore.cleanupWebSocket()` aufgerufen

**Component Tests:** ❌ **0 von 67 Components getestet**

**Gesamt:** 67 `.vue`-Files in `src/components/`

**Kritische Components ohne Tests:**

| Component | Pfad | Geschätzte Complexity |
|-----------|------|----------------------|
| ESPCard | `components/esp/ESPCard.vue` | ⭐⭐⭐ Hoch |
| SensorSatellite | `components/esp/SensorSatellite.vue` | ⭐⭐ Mittel |
| ActuatorSatellite | `components/esp/ActuatorSatellite.vue` | ⭐⭐ Mittel |
| PendingDevicesPanel | `components/esp/PendingDevicesPanel.vue` | ⭐⭐ Mittel |
| ZoneGroup | `components/zones/ZoneGroup.vue` | ⭐⭐⭐ Hoch |
| EventTimeline | `components/system-monitor/EventTimeline.vue` | ⭐⭐ Mittel |

**package.json Scripts:** ❌ **KRITISCH – Keine Test-Dependencies, keine Test-Scripts**

**Aktueller Stand:**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "type-check": "vue-tsc --noEmit"
    // ❌ KEINE Test-Scripts!
  },
  "dependencies": {
    "vue": "^3.5.13",
    "pinia": "^2.3.0",
    // ... weitere Runtime-Dependencies
  },
  "devDependencies": {
    "vite": "^6.2.4",
    "typescript": "~5.7.2"
    // ❌ KEINE Test-Dependencies!
  }
}
```

**Fehlende Test-Dependencies:**

| Package | Zweck | Empfohlene Version |
|---------|-------|-------------------|
| ❌ **vitest** | Test-Runner | `^3.0.0` |
| ❌ **@vitest/coverage-v8** | Coverage-Provider | `^3.0.0` |
| ❌ **@vue/test-utils** | Vue Component Testing | `^2.4.6` |
| ❌ **jsdom** | DOM-Simulation | `^25.0.0` |
| ❌ **msw** | Mock Service Worker | `^2.6.9` |
| ❌ **@playwright/test** | E2E Testing | `^1.50.0` |

**Fehlende Test-Scripts:**

| Script | Befehl |
|--------|--------|
| ❌ `"test"` | `"vitest"` |
| ❌ `"test:unit"` | `"vitest run tests/unit"` |
| ❌ `"test:integration"` | `"vitest run tests/integration"` |
| ❌ `"test:watch"` | `"vitest watch"` |
| ❌ `"test:ui"` | `"vitest --ui"` |
| ❌ `"test:coverage"` | `"vitest run --coverage"` |
| ❌ `"e2e"` | `"playwright test"` |
| ❌ `"e2e:ui"` | `"playwright test --ui"` |

**Impact:** Tests können NICHT ausgeführt werden!

```bash
$ npm test
# Error: Missing script: "test"

$ npx vitest
# Error: Cannot find module 'vitest'
```

#### Empfehlungen (Frontend)

**P0 – Blocker (MUST FIX):**

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P0-1** | **package.json erweitern:** Vitest + Coverage + Test-Utils + MSW + Playwright Dependencies hinzufügen | ❌ Tests nicht ausführbar | 10 min |
| **P0-2** | **Test-Scripts hinzufügen:** `test`, `test:unit`, `test:coverage`, `e2e` | ❌ Tests nicht ausführbar | 5 min |

**Empfohlene package.json Ergänzung:**

```json
"scripts": {
  "test": "vitest",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:watch": "vitest watch",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest run --coverage",
  "e2e": "playwright test",
  "e2e:ui": "playwright test --ui",
  "e2e:debug": "playwright test --debug"
},
"devDependencies": {
  "vitest": "^3.0.0",
  "@vitest/coverage-v8": "^3.0.0",
  "@vitest/ui": "^3.0.0",
  "@vue/test-utils": "^2.4.6",
  "jsdom": "^25.0.0",
  "msw": "^2.6.9",
  "@playwright/test": "^1.50.0"
}
```

**P1 – Critical Gaps (HIGH PRIORITY):**

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P1-1** | **Store-Tests erweitern:** Tests für `database`, `logic`, `dragState` Stores | ⚠️ Stores ungetestet | 2-4 Std |
| **P1-2** | **Integration-Tests erstellen:** Store ↔ API Mock Zusammenspiel | ⚠️ Keine Integration-Tests | 3-5 Std |
| **P1-3** | **Component-Tests für kritische Components:** ESPCard, ZoneGroup, PendingDevicesPanel | ⚠️ UI-Rendering ungetestet | 5-8 Std |

**P2 – Nice-to-Have (MEDIUM PRIORITY):**

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P2-1** | **Composable-Tests erweitern:** useModal, useGpioStatus, useQueryFilters, useZoneDragDrop, useConfigResponse, useSwipeNavigation | ⚠️ Composables ungetestet | 3-6 Std |
| **P2-2** | **MSW-Handlers erweitern:** Subzones, Logic, Logs, Health, Users | ⚠️ Partial API-Coverage | 2-3 Std |
| **P2-3** | **E2E-Scenarios erweitern:** Zone-Kaiser Workflows (zone assignment, subzone, drag-drop) | ⚠️ Neue Features ungetestet | 3-5 Std |

**P3 – Optimization (LOW PRIORITY):**

| Prio | Empfehlung | Impact | Aufwand |
|------|------------|--------|---------|
| **P3-1** | **CI-Integration:** GitHub Actions Workflow für Tests | ℹ️ Tests nur lokal | 1-2 Std |
| **P3-2** | **Coverage-Thresholds:** Minimum Coverage in vitest.config.ts (z.B. 60% Statements) | ℹ️ Kein Quality-Gate | 15 min |

#### Datei-Referenzen (Frontend)

**Config-Dateien:**
- [vitest.config.ts](El Frontend/vitest.config.ts) – 43 Zeilen
- [playwright.config.ts](El Frontend/playwright.config.ts) – 107 Zeilen
- [tests/setup.ts](El Frontend/tests/setup.ts) – 156 Zeilen

**Test-Dateien (exzellent):**
- [tests/unit/stores/auth.test.ts](El Frontend/tests/unit/stores/auth.test.ts) – 520 Zeilen
- [tests/unit/stores/esp.test.ts](El Frontend/tests/unit/stores/esp.test.ts) – 989 Zeilen
- [tests/unit/composables/useToast.test.ts](El Frontend/tests/unit/composables/useToast.test.ts) – 378 Zeilen
- [tests/unit/composables/useWebSocket.test.ts](El Frontend/tests/unit/composables/useWebSocket.test.ts) – 943 Zeilen

**Mock-Dateien:**
- [tests/mocks/handlers.ts](El Frontend/tests/mocks/handlers.ts) – 799 Zeilen
- [tests/mocks/server.ts](El Frontend/tests/mocks/server.ts)
- [tests/mocks/websocket.ts](El Frontend/tests/mocks/websocket.ts)

**E2E-Dateien:**
- [tests/e2e/scenarios/auth.spec.ts](El Frontend/tests/e2e/scenarios/auth.spec.ts)
- [tests/e2e/scenarios/actuator.spec.ts](El Frontend/tests/e2e/scenarios/actuator.spec.ts)
- [tests/e2e/scenarios/device-discovery.spec.ts](El Frontend/tests/e2e/scenarios/device-discovery.spec.ts)
- [tests/e2e/scenarios/emergency.spec.ts](El Frontend/tests/e2e/scenarios/emergency.spec.ts)
- [tests/e2e/scenarios/sensor-live.spec.ts](El Frontend/tests/e2e/scenarios/sensor-live.spec.ts)

---

## Priorisierte Problemliste

### KRITISCH

**ESP32:**
- ⚠️ **Nur 2 von 23 Unity-Tests aktiv** (21 noch in test/_archive/, Migration läuft)
- ✅ **Native Test-Environment vollständig konfiguriert** (platformio.ini + test/unit/ Ordnerstruktur)
- ❌ **Kein HAL-Pattern** (nur 1 Interface: IActuatorDriver)

**VERIFY-PLAN KORREKTUR (2026-02-11):**
- ✅ [env:native] ist vorhanden (platformio.ini Zeile 209-244)
- ✅ test/unit/ Struktur ist vorhanden (infra, managers, models, utils)
- ✅ 2 aktive Tests: test_topic_builder.cpp, test_gpio_manager_mock.cpp
- ⚠️ Report vom 2026-02-10 war VERALTET

**Backend:**
- ❌ **15 von ~106 Tests unausführbar** (ModuleNotFoundError: prometheus_fastapi_instrumentator)

**Frontend:**
- ❌ **Tests nicht ausführbar** (package.json fehlt vitest/msw/playwright Dependencies)
- ❌ **Keine Test-Scripts** in package.json

### WARNUNG

**ESP32:**
- ⚠️ **Zone-Kaiser Wokwi-Coverage dünn** (2 scenarios für 04-zone/)
- ⚠️ **Device Lifecycle nicht in Wokwi**
- ⚠️ **Subzone-Hierarchie unzureichend** (1 scenario)

**Backend:**
- ⚠️ **10+ unregistrierte pytest Marker** → Warnings
- ⚠️ **Pydantic V2 Deprecations** (6+ Schemas)
- ⚠️ **conftest_logic.py** ungewöhnlicher Name (nicht conftest.py)
- ⚠️ **Coverage-Lücken:** Neue Features (Kaiser, AI, Library) ohne Tests

**Frontend:**
- ⚠️ **Store Coverage 40%** (2 von 5 getestet)
- ⚠️ **Composable Coverage 25%** (2 von 8 getestet)
- ⚠️ **Component Coverage 0%** (0 von 67 getestet)
- ⚠️ **Integration-Tests komplett fehlend**

### INFO

**ESP32:**
- ✅ **163 Wokwi Scenarios vorhanden** (gut strukturiert, 13 Kategorien)
- ✅ **Migration zu server-orchestrierten Tests abgeschlossen** (140 Tests auf Backend)
- ✅ **Archivierte Tests haben gute Patterns** (Dual-Mode, MockMQTT, RAII)

**Backend:**
- ✅ **Conftest-Hierarchie Best Practice** (4 conftest.py gut strukturiert)
- ✅ **MockESP32Client produktionsgetreu** (1000+ Zeilen, 20+ Fixtures)
- ✅ **DB-Isolation korrekt** (SQLite in-memory, StaticPool, autouse)
- ✅ **~90 von ~106 Tests funktionieren** (Unit, ESP32, E2E ohne src.main Import)

**Frontend:**
- ✅ **Existierende Tests exzellent** (auth 520 Zeilen, esp 989 Zeilen, useToast 378 Zeilen, useWebSocket 943 Zeilen)
- ✅ **vitest.config.ts Best Practice 2025**
- ✅ **playwright.config.ts Best Practice 2025**
- ✅ **MSW-Mocks comprehensive** (799 Zeilen, 80% API abgedeckt)
- ✅ **setup.ts Best Practice** (MSW + Pinia + Global Mocks)

---

## Nächste Schritte

### Sofort (P0 – Critical Blocker beheben)

1. **Backend:** `poetry install` ausführen → prometheus-fastapi-instrumentator installieren
2. **Frontend:** package.json erweitern (Dependencies + Scripts hinzufügen)
3. **ESP32:** Restliche 21 Tests aus `test/_archive/` nach `test/unit/` migrieren

**VERIFY-PLAN KORREKTUR (2026-02-11):**
- ✅ [env:native] ist bereits konfiguriert (platformio.ini Zeile 209-244)
- ✅ test/unit/ Ordner sind bereits vorhanden (infra, managers, models, utils)
- ✅ 2 Tests sind bereits aktiv (test_topic_builder.cpp, test_gpio_manager_mock.cpp)
- ⚠️ Migration ist in Gange, aber noch nicht abgeschlossen (~9% Coverage)

### Kurz darauf (P1 – High Priority Gaps schließen)

4. **Backend:** Tests für neue Features (Kaiser, AI, Library)
5. **Backend:** Marker konsolidieren (9+ unregistrierte)
6. **Frontend:** Store-Tests erweitern (database, logic, dragState)
7. **Frontend:** Integration-Tests erstellen
8. **Frontend:** Component-Tests für ESPCard, ZoneGroup, PendingDevicesPanel
9. **ESP32:** TopicBuilder-Tests reaktivieren

### Mittelfristig (P2 – Medium Priority)

10. **Backend:** conftest_logic.py umbenennen/mergen
11. **Backend:** Pydantic V2 Migration (ConfigDict)
12. **Frontend:** Composable-Tests erweitern
13. **Frontend:** E2E-Scenarios für Zone-Kaiser
14. **ESP32:** HAL-Interfaces einführen

---

## verify-plan Reality-Check (2026-02-11)

**Durchgeführt von:** /verify-plan Skill
**Zeitpunkt:** 2026-02-11 (nach Report-Erstellung 2026-02-10)
**Methode:** System-Validierung via Read/Glob/Bash gegen echte Codebase

### Zusammenfassung der Korrekturen

**✅ BESTÄTIGT (korrekt im Report):**
- Branch: feature/docs-cleanup
- Wokwi Scenarios: 163 YAML-Files
- Frontend Components: 67 .vue Files
- Frontend package.json: Keine Test-Dependencies, keine Test-Scripts
- Backend: 15 Collection Errors (prometheus_fastapi_instrumentator)
- Frontend Integration-Tests: Ordner leer

**❌ KORRIGIERT (Diskrepanzen gefunden):**

| Bereich | Report-Aussage (2026-02-10) | Realität (2026-02-11) |
|---------|---------------------------|---------------------|
| **ESP32 Environments** | 3 Environments (seeed, esp32_dev, wokwi) | ✅ 7 Environments (+ wokwi_esp01/02/03 + **native**) |
| **ESP32 Native Env** | ❌ "Fehlt in platformio.ini" | ✅ Vorhanden (Zeile 209-244), seit 2026-02-11 |
| **ESP32 test/unit/** | ❌ "Ordner fehlen" | ✅ Vorhanden (infra, managers, models, utils) |
| **ESP32 Aktive Tests** | ❌ "0 aktive Unity-Tests" | ✅ 2 aktive (test_topic_builder.cpp, test_gpio_manager_mock.cpp) |
| **ESP32 Native Coverage** | 0% | ~9% (2 von 23 Tests aktiv, 21 noch in _archive/) |
| **Backend Test-Files** | ~106 | ✅ ~109 (verify-plan Zählung) |
| **Backend pyproject.toml** | "prometheus...instrumentator fehlt" | ✅ Definiert in Zeile 47, nur nicht installiert |

### Haupt-Erkenntnis

Der esp32-debug-test-engine Report vom 2026-02-10 war **VERALTET**. Die native Test-Infrastruktur für ESP32 wurde zwischen Report-Erstellung und verify-plan-Ausführung implementiert:

- **[env:native]** wurde in platformio.ini hinzugefügt (Zeile 209-244)
- **test/unit/** Ordnerstruktur wurde erstellt
- **2 Tests** wurden aus test/_archive/ migriert und sind aktiv
- **Migration ist in Gange** (~9% abgeschlossen)

### Impact auf Priorisierung

**ALT (basierend auf Report 2026-02-10):**
- P0: Native Environment hinzufügen, Ordner erstellen, Tests migrieren

**NEU (nach verify-plan 2026-02-11):**
- P0: ~~Native Environment hinzufügen~~ (ERLEDIGT)
- P0: ~~Ordner erstellen~~ (ERLEDIGT)
- P0: Test-Migration **abschließen** (21 von 23 Tests noch zu migrieren)

Die Arbeit ist zu ~9% erledigt, nicht bei 0%.

---

## system-control Infrastruktur-Analyse (konsolidiert aus separatem Report)

> **Durchgeführt von:** /system-control Skill, 2026-02-11
> **Methode:** Docker-Stack-Analyse, Health-Checks, CI/CD-Prüfung, Makefile-Audit

### Docker-Stack Live-Status

**Gesamtsystem:** ✅ **OPERATIONAL** (10/11 healthy)

| Service | Container | Uptime | Health | Ports |
|---------|-----------|--------|--------|-------|
| postgres | automationone-postgres | 16h | ✅ healthy | 5432 |
| mqtt-broker | automationone-mqtt | 16h | ✅ healthy | 1883, 9001 |
| el-servador | automationone-server | 16h | ✅ healthy | 8000 |
| el-frontend | automationone-frontend | 16h | ✅ healthy | 5173 |
| loki | automationone-loki | 16h | ✅ healthy | 3100 |
| promtail | automationone-promtail | 16h | ✅ healthy | - |
| prometheus | automationone-prometheus | 16h | ✅ healthy | 9090 |
| grafana | automationone-grafana | 16h | ✅ healthy | 3000 |
| postgres-exporter | automationone-postgres-exporter | 16h | ✅ healthy | 9187 |
| mosquitto-exporter | automationone-mosquitto-exporter | 16h | ❌ **unhealthy** | 9234 |
| pgadmin | automationone-pgadmin | 16h | ✅ healthy | 5050 |

```json
/api/v1/health/live:  {"success":true,"alive":true}
/api/v1/health/ready: {"success":true,"ready":true,"checks":{"database":true,"mqtt":true,"disk_space":true}}
```

### CI/CD-Pipeline-Status (8 Workflows)

| Workflow | Datei | Trigger | Zweck |
|----------|-------|---------|-------|
| server-tests | server-tests.yml | push/PR (El Servador) | pytest (Unit, Integration, ESP32) |
| wokwi-tests | wokwi-tests.yml | push/PR (El Trabajante) | Wokwi Simulation (15 Scenarios) |
| esp32-tests | esp32-tests.yml | push/PR | ESP32 PlatformIO Build |
| frontend-tests | frontend-tests.yml | push/PR (El Frontend) | Vitest Unit Tests |
| playwright-tests | playwright-tests.yml | push/PR | E2E Playwright |
| backend-e2e-tests | backend-e2e-tests.yml | push/PR | Backend E2E |
| pr-checks | pr-checks.yml | PR | Lint, Format, Type-Check |
| security-scan | security-scan.yml | schedule | Dependency Scanning |

**CI-Features:** Concurrency-Groups, Path-Filters, Poetry/PlatformIO Cache, Artifact-Upload, WOKWI_CLI_TOKEN Secret

### Test-Ausführbarkeits-Matrix

| Test-Typ | Status | Ausführbar via |
|----------|--------|----------------|
| Backend Unit | ✅ Ready | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit` |
| Backend Integration | ⚠️ 15 broken | Nach `poetry install` ausführbar |
| Backend ESP32 Mock | ✅ Ready | `poetry run pytest tests/esp32` |
| Backend E2E | ✅ Ready | `make e2e-up && poetry run pytest tests/e2e` |
| ESP32 Native | ⚠️ Partial (2/23) | `cd "El Trabajante" && pio test -e native` |
| ESP32 Wokwi | ✅ Ready | `make wokwi-test-quick` / `make wokwi-test-full` |
| Frontend Unit | ❌ Blocked | Nach package.json-Fix: `npm test` |
| Frontend E2E | ❌ Blocked | Nach package.json-Fix: `make e2e-test` |

### Session-Management (v4.0)

| Script | Pfad | Features |
|--------|------|----------|
| start_session.sh | `scripts/debug/start_session.sh` | Docker Health-Check, MQTT-Capture, Log-Archivierung, STATUS.md, `--with-server`, `--mode MODE` |
| stop_session.sh | `scripts/debug/stop_session.sh` | Archivierung nach `logs/archive/` |

### Monitoring-Infrastruktur

- **Loki 3.4:** Log-Aggregation (healthy, Port 3100)
- **Promtail 3.4:** Log-Collector (scraping `/logs/server/`, `/logs/mqtt/`, `/logs/postgres/`)
- **Prometheus 3.2.1:** Metrics (healthy, Port 9090)
- **Grafana 11.5.2:** Dashboards (healthy, Port 3000)
- ❌ **mosquitto-exporter:** unhealthy → mqtt-debug Agent für Diagnose

### Agent-Aktivierungs-Empfehlung

**P0:** `poetry install` (Backend), package.json erweitern (Frontend), mosquitto-exporter diagnostizieren
**P1:** esp32-dev (Native Test-Migration), server-dev (Tests für Kaiser/AI/Library), frontend-dev (Store/Composable/Component-Tests)
**Danach:** test-log-analyst (Backend → Wokwi → Frontend Logs analysieren)

---

**Ende des konsolidierten Reports + verify-plan Reality-Check + system-control Infrastruktur**
**Erstellt:** 2026-02-11
**Aktualisiert:** 2026-02-11 (verify-plan + system-control konsolidiert)
**Branch:** feature/docs-cleanup
**Quellordner:** `.technical-manager/inbox/agent-reports/`
