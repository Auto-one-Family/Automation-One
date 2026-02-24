# Test-Workflow für AutomationOne

> **Version:** 4.3 | **Aktualisiert:** 2026-02-23
> **Zweck:** Vollständige Test-Infrastruktur Dokumentation
> **Themengebiet:** Test-Workflows (Server pytest + Wokwi Simulation)

> ⚠️ **HINWEIS FÜR KI-AGENTEN:**
> Tests werden **NUR auf explizite Anfrage** durchgeführt.
> Bei normalen Entwicklungsaufgaben: Code implementieren → User entscheidet über Tests.
> Diese Dokumentation nur lesen, wenn User Tests anfordert.

---

## 1. Übersicht Test-Systeme

AutomationOne verfügt über zwei getrennte Test-Systeme:

| System | Framework | Pfad | Status | Beschreibung |
|--------|-----------|------|--------|--------------|
| **Server-Tests** | pytest (Python) | `El Servador/god_kaiser_server/tests/` | ✅ Produktiv | Hauptsystem: Unit, Integration, ESP32 Mock Tests |
| **Wokwi-Simulation** | Wokwi CLI | `El Trabajante/tests/wokwi/` | ⚠️ Manuell | Echte Firmware in virtueller Umgebung |
| ~~PlatformIO Unity~~ | ~~Unity (C++)~~ | ~~`El Trabajante/test/_archive/`~~ | ❌ Archiviert | PlatformIO Linker-Probleme |

### 1.1 Test-Dateien Anzahl (Stand: 2026-02-01)

| Kategorie | Anzahl Dateien | Pfad |
|-----------|----------------|------|
| **Unit Tests** | 38 | `tests/unit/` |
| **Integration Tests** | 44 | `tests/integration/` |
| **ESP32 Mock Tests** | 19 | `tests/esp32/` |
| **E2E Tests** | 9 | `tests/e2e/` |
| **GESAMT** | **110** | - |

---

## 2. Server-Tests (pytest) - Hauptsystem

### 2.1 Architektur

```
┌─────────────────────────────────────────────────────────────┐
│ God-Kaiser Server Test-Infrastruktur                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  pytest 8.0+ (Python 3.11+)                                │
│    ├─ SQLite In-Memory (aiosqlite) - StaticPool            │
│    ├─ MockESP32Client - Hardware-Simulation                │
│    ├─ Mocked MQTT Publisher (kein Broker nötig)            │
│    └─ Auto-use Fixtures für DB + MQTT                      │
│                                                             │
│  Tests: 110 Dateien (ohne echte Hardware lauffähig)        │
│    ├─ Unit Tests (38) - Repositories, Services, Processors │
│    ├─ Integration Tests (44) - API, Handler, Logic Engine  │
│    ├─ ESP32 Mock Tests (19) - MockESP32Client Szenarien    │
│    └─ E2E Tests (9) - Full Server Scenarios                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Test-Kategorien

| Kategorie | Pfad | Tests | Beschreibung |
|-----------|------|-------|--------------|
| **Unit** | `tests/unit/` | 38 | Isolierte Modul-Tests |
| **Integration** | `tests/integration/` | 44 | API-Endpoints, MQTT-Handler, Logic Engine |
| **ESP32** | `tests/esp32/` | 19 | MockESP32Client Szenarien |
| **E2E** | `tests/e2e/` | 9 | Full-Stack Server Scenarios |

### 2.3 Pytest Marker (aus pyproject.toml + conftest.py)

```python
# Standard Marker
@pytest.mark.unit           # Unit Tests
@pytest.mark.integration    # Integration Tests
@pytest.mark.esp32          # ESP32 Mock Tests
@pytest.mark.e2e            # End-to-End Tests
@pytest.mark.hardware       # Tests mit echter Hardware (skip in CI)
@pytest.mark.performance    # Performance Benchmarks
@pytest.mark.slow           # Langsame Tests

# Domänen-spezifische Marker
@pytest.mark.sensor         # SensorManager Tests
@pytest.mark.actuator       # ActuatorManager Tests
@pytest.mark.safety         # SafetyController Tests
@pytest.mark.critical       # Safety-kritisch (muss immer grün sein)
@pytest.mark.ds18b20        # DS18B20 spezifische Tests
@pytest.mark.onewire        # OneWire Tests
@pytest.mark.pwm            # PWM Actuator Tests
@pytest.mark.gpio           # GPIO Conflict Tests

# Flow-basierte Marker
@pytest.mark.flow_a         # Sensor data flow (ESP→Server→DB)
@pytest.mark.flow_b         # Actuator command flow (Server→ESP)
@pytest.mark.flow_c         # Emergency stop flow
```

### 2.4 Ausführungs-Commands

```bash
cd "El Servador/god_kaiser_server"

# ============================================
# ALLE TESTS
# ============================================
.venv/Scripts/pytest.exe tests/ -v --no-cov             # Ohne Coverage
.venv/Scripts/pytest.exe tests/ -v                       # Mit Coverage (default)

# ============================================
# NACH KATEGORIE
# ============================================
.venv/Scripts/pytest.exe tests/unit/ -v                  # Nur Unit Tests
.venv/Scripts/pytest.exe tests/integration/ -v           # Nur Integration Tests
.venv/Scripts/pytest.exe tests/esp32/ -v                 # Nur ESP32 Mock Tests
.venv/Scripts/pytest.exe tests/e2e/ -v                   # Nur E2E Tests

# ============================================
# NACH MARKER
# ============================================
.venv/Scripts/pytest.exe -m "sensor" -v                  # Nur Sensor Tests
.venv/Scripts/pytest.exe -m "critical" -v                # Nur kritische Tests
.venv/Scripts/pytest.exe -m "not hardware" -v            # Ohne Hardware-Tests
.venv/Scripts/pytest.exe -m "not slow" -v                # Ohne langsame Tests

# ============================================
# EINZELNE TESTS
# ============================================
.venv/Scripts/pytest.exe tests/unit/test_temperature_processor.py -v
.venv/Scripts/pytest.exe tests/integration/test_logic_engine.py::TestLogicEngine -v
.venv/Scripts/pytest.exe tests/esp32/test_actuator.py::test_pwm_control -xvs

# ============================================
# OPTIONEN
# ============================================
# -v          Verbose output
# -x          Stop on first failure
# -s          Show print/log output
# --no-cov    Disable coverage (faster)
# --tb=short  Shorter traceback
# -k "name"   Filter by test name pattern
```

### 2.5 Wichtige Fixtures (tests/conftest.py)

```python
# ============================================
# DATABASE FIXTURES
# ============================================
@pytest_asyncio.fixture
async def test_engine():
    """In-Memory SQLite Engine (StaticPool für Windows)."""

@pytest_asyncio.fixture
async def db_session(test_engine):
    """Database Session für Tests."""

# ============================================
# REPOSITORY FIXTURES
# ============================================
@pytest_asyncio.fixture
async def esp_repo(db_session) -> ESPRepository
@pytest_asyncio.fixture
async def sensor_repo(db_session) -> SensorRepository
@pytest_asyncio.fixture
async def actuator_repo(db_session) -> ActuatorRepository
@pytest_asyncio.fixture
async def user_repo(db_session) -> UserRepository
@pytest_asyncio.fixture
async def subzone_repo(db_session) -> SubzoneRepository

# ============================================
# TEST DATA FIXTURES
# ============================================
@pytest_asyncio.fixture
async def sample_esp_device(db_session):
    """ESP32 WROOM Test Device (ESP_TEST_001)."""

@pytest_asyncio.fixture
async def sample_esp_c3(db_session):
    """ESP32-C3 (XIAO) Test Device."""

@pytest_asyncio.fixture
async def sample_user(db_session):
    """Test User (testuser@example.com)."""

# ============================================
# AUTO-USE FIXTURES (für alle Tests aktiv)
# ============================================
@pytest_asyncio.fixture(autouse=True)
async def override_get_db(test_engine):
    """Ersetzt Production-DB durch Test-DB."""

@pytest_asyncio.fixture(autouse=True)
async def override_mqtt_publisher():
    """Mockt MQTT Publisher (kein Broker nötig)."""

@pytest_asyncio.fixture(autouse=True)
async def override_actuator_service():
    """Mockt ActuatorService mit Test-DB."""
```

### 2.6 MockESP32Client (tests/esp32/mocks/mock_esp32_client.py)

```python
from tests.esp32.mocks.mock_esp32_client import MockESP32Client, BrokerMode

# Standard Nutzung (In-Memory, kein Broker)
mock = MockESP32Client(
    esp_id="ESP_TEST_001",
    kaiser_id="god",
    broker_mode=BrokerMode.DIRECT  # Default
)

# Konfiguration
mock.configure_zone("greenhouse", "master_zone", "zone_a")
mock.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="DS18B20")

# Command ausführen
response = mock.handle_command("actuator_set", {
    "gpio": 5,
    "value": 1,
    "mode": "digital"
})

# Messages prüfen
messages = mock.get_published_messages()
assert messages[0]["topic"] == "kaiser/god/esp/ESP_TEST_001/actuator/5/status"

# Reset
mock.reset()

# Mit echtem MQTT Broker (für E2E Tests)
mock = MockESP32Client(
    esp_id="ESP_E2E_001",
    broker_mode=BrokerMode.MQTT,
    mqtt_config={
        "host": "localhost",
        "port": 1883
    }
)
```

**MockESP32Client Features:**
- SystemState Machine (12 States wie echte Firmware)
- Sensor/Actuator State Management
- Zone/Subzone Konfiguration
- Multi-Value Sensors (SHT31 mit Temp + Humidity)
- Heartbeat Simulation
- Command/Response Pattern
- Published Messages Tracking

---

## 3. Wokwi-Simulation

### 3.1 Übersicht

Wokwi ermöglicht das Testen der echten C++ Firmware in einer virtuellen Umgebung.

**Key Differences zu Server Tests:**
- Server Tests = Python tests gegen Mock-ESPs
- Wokwi Tests = Echte C++ Firmware in virtueller Hardware

### 3.2 Konfigurationsdateien

| Datei | Pfad | Zweck |
|-------|------|-------|
| `wokwi.toml` | `El Trabajante/wokwi.toml` | Wokwi CLI Config (Firmware, Network) |
| `diagram.json` | `El Trabajante/diagram.json` | Virtuelle Hardware-Konfiguration |
| `platformio.ini` | `El Trabajante/platformio.ini` | Build-Environment `wokwi_simulation` |

### 3.3 Virtuelle Hardware (diagram.json)

```
┌─────────────────────────────────────────────────────────────┐
│ ESP32 DevKit V1                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GPIO 4  → DS18B20 Temperature Sensor (22.5°C konstant)    │
│  GPIO 5  → LED Green (mit 220Ω Widerstand)                 │
│  GPIO 13 → LED Red                                          │
│  GPIO 14 → LED Blue                                         │
│  GPIO 15 → DHT22 Sensor (23.5°C, 65% Humidity)            │
│  GPIO 27 → Emergency Button                                 │
│  GPIO 34 → Potentiometer (Analog Input)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Test-Szenarien

```
tests/wokwi/
├── boot_test.yaml               # Legacy Boot Test
├── mqtt_connection.yaml         # Legacy MQTT Test
│
├── scenarios/
│   ├── 01-boot/
│   │   ├── boot_full.yaml       # 5-Phase Boot Sequence
│   │   └── boot_safe_mode.yaml  # GPIO Safe-Mode Test
│   │
│   ├── 02-sensor/
│   │   ├── sensor_heartbeat.yaml
│   │   ├── sensor_ds18b20_read.yaml
│   │   ├── sensor_ds18b20_full_flow.yaml
│   │   ├── sensor_dht22_full_flow.yaml
│   │   └── sensor_analog_flow.yaml
│   │
│   ├── 03-actuator/
│   │   ├── actuator_led_on.yaml
│   │   ├── actuator_pwm.yaml
│   │   ├── actuator_pwm_full_flow.yaml
│   │   ├── actuator_binary_full_flow.yaml
│   │   ├── actuator_status_publish.yaml
│   │   ├── actuator_emergency_clear.yaml
│   │   └── actuator_timeout_e2e.yaml
│   │
│   ├── 04-zone/
│   │   ├── zone_assignment.yaml
│   │   └── subzone_assignment.yaml
│   │
│   ├── 05-emergency/
│   │   ├── emergency_broadcast.yaml
│   │   ├── emergency_esp_stop.yaml
│   │   └── emergency_stop_full_flow.yaml
│   │
│   └── 06-config/
│       ├── config_sensor_add.yaml
│       └── config_actuator_add.yaml
```

### 3.5 Ausführung

```bash
cd "El Trabajante"

# 1. Firmware bauen
pio run -e wokwi_simulation

# 2. Wokwi CLI Token setzen
export WOKWI_CLI_TOKEN=your_token  # Linux/Mac
set WOKWI_CLI_TOKEN=your_token     # Windows

# 3. Test ausführen
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/02-sensor/sensor_heartbeat.yaml
```

**WICHTIG:**
- Projektverzeichnis (`.`) ist optional - wenn weggelassen, wird cwd genutzt (v0.19.1+)
- Timeout wird via CLI gesetzt, NICHT im YAML
- `wokwi-cli run` existiert NICHT (v0.19.1) - `run` wird als Pfad interpretiert
- Konvention: `wokwi-cli . --timeout 90000 --scenario ...` (Pfad explizit, wie in Makefile/CI)

### 3.6 Bekannte Limitationen

| Limitation | Impact | Workaround |
|------------|--------|------------|
| **SHT31 nicht unterstützt** | I2C Sensor fehlt in Wokwi | DHT22 als Alternative, Server Tests |
| **DS18B20 konstant 22.5°C** | Temp-basierte Logik nicht testbar | Server Mock Tests |
| **LED Helligkeit nicht messbar** | PWM nicht verifizierbar | Serial Log Verification |
| **Timeout konfigurierbar** | CI nutzt 120-210s, 0=unbegrenzt | `--timeout 0` für Interactive |
| **MQTT nicht direkt prüfbar** | Messages nur via Serial | Serial Confirmation |
| **WiFi Drop nicht simulierbar** | Error Recovery begrenzt | Server Mock Tests |
| **Button nur via MQTT** | Kein physischer Druck | MQTT Alternative |

### 3.7 Coverage-Schätzung

| System Flow | Coverage | Grund |
|-------------|----------|-------|
| Boot Sequence | 85% | Provisioning nicht testbar |
| Sensor Reading | 50% | Konstante Werte |
| Actuator Command | 70% | PWM nicht messbar |
| Runtime Config | 60% | Mit MQTT Injection |
| MQTT Routing | 65% | Nur Serial Verification |
| Error Recovery | 30% | WiFi Drop nicht simulierbar |
| Zone Assignment | 70% | Mit MQTT Injection |

**Overall: ~55-60% Coverage**

### 3.8 Manueller Workflow (für Robin)

Da Wokwi nicht vollständig automatisierbar ist:

1. **KI startet Services** (Server, MQTT Broker)
2. **User startet Wokwi** manuell (VS Code Extension oder wokwi-cli)
3. **User liest Serial Monitor** für Verifizierung
4. **User gibt Feedback** an KI

---

## 4. Log-System

### 4.1 Log-Speicherorte

| Komponente | Log-Pfad | Format | Zugriff |
|------------|----------|--------|---------|
| **Server** | `El Servador/god_kaiser_server/logs/god_kaiser.log` | JSON | `tail -f`, Read Tool |
| **Server (Console)** | stdout | Text | Terminal |
| **ESP32 Serial** | UART (kein File) | Text | `pio device monitor` |
| **ESP32 MQTT Diagnostics** | Topic `...system/diagnostics` | JSON | `mosquitto_sub` |
| **pytest** | stdout + `junit-*.xml` | Text/XML | Terminal, CI Artifacts |
| **Coverage** | `htmlcov/`, `coverage*.xml` | HTML/XML | Browser, CI |

### 4.2 Server Logging Konfiguration

```python
# src/core/logging_config.py

# Log-Format
LOG_FORMAT=json         # "json" oder "text"
LOG_LEVEL=INFO          # DEBUG, INFO, WARNING, ERROR

# File Rotation
LOG_FILE_MAX_BYTES=10485760  # 10MB
LOG_FILE_BACKUP_COUNT=5       # 5 Backup-Dateien

# JSON Log Struktur
{
    "timestamp": "2026-02-01 10:23:45",
    "level": "INFO",
    "logger": "src.mqtt.handlers.sensor_handler",
    "message": "Sensor data received",
    "module": "sensor_handler",
    "function": "handle_sensor_data",
    "line": 123,
    "request_id": "abc123"  # Optional
}
```

### 4.3 Log-Zugriff für KI

```bash
# Server Logs
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"
tail -100 "El Servador/god_kaiser_server/logs/god_kaiser.log" | grep -i error

# MQTT Traffic
mosquitto_sub -h localhost -t "kaiser/#" -v
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/diagnostics" -v

# ESP32 Serial Monitor
cd "El Trabajante" && pio device monitor
```

---

## 5. Error-Codes

### 5.1 Übersicht

Error-Codes sind zwischen ESP32 und Server synchronisiert:

| Range | System | Kategorie |
|-------|--------|-----------|
| 1000-1999 | ESP32 | HARDWARE (GPIO, I2C, OneWire, Sensor, Actuator) |
| 2000-2999 | ESP32 | SERVICE (NVS, Config, Logger, Storage, Subzone) |
| 3000-3999 | ESP32 | COMMUNICATION (WiFi, MQTT, HTTP, Network) |
| 4000-4999 | ESP32 | APPLICATION (State, Operation, Command, Watchdog) |
| 5000-5099 | Server | CONFIG_ERROR |
| 5100-5199 | Server | MQTT_ERROR |
| 5200-5299 | Server | VALIDATION_ERROR |
| 5300-5399 | Server | DATABASE_ERROR |
| 5400-5499 | Server | SERVICE_ERROR |
| 5500-5599 | Server | AUDIT_ERROR |
| 5600-5699 | Server | SEQUENCE_ERROR |

### 5.2 Quell-Dateien

| System | Datei |
|--------|-------|
| **ESP32** | `El Trabajante/src/models/error_codes.h` |
| **Server** | `El Servador/god_kaiser_server/src/core/error_codes.py` |

### 5.3 Häufige Error-Codes

```python
# Hardware
ERROR_GPIO_CONFLICT = 1002      # GPIO bereits belegt
ERROR_I2C_DEVICE_NOT_FOUND = 1011
ERROR_ONEWIRE_NO_DEVICES = 1021
ERROR_SENSOR_READ_FAILED = 1040
ERROR_ACTUATOR_SET_FAILED = 1050

# Communication
ERROR_MQTT_CONNECT_FAILED = 3011
ERROR_MQTT_PUBLISH_FAILED = 3012

# Server
ESP_DEVICE_NOT_FOUND = 5001
INVALID_GPIO = 5202
ACTUATOR_LOCKED = 5640  # Sequence conflict
```

---

## 6. Database Test System

### 6.1 Test-Datenbank Konfiguration

```python
# tests/conftest.py

# Environment Variables (gesetzt BEVOR imports)
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_AUTO_INIT"] = "false"
os.environ["TESTING"] = "true"

# Engine mit StaticPool (Windows Kompatibilität)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # Alle Connections teilen gleiche DB
)
```

### 6.2 Test vs. Production

| Aspekt | Test | Production |
|--------|------|------------|
| **Driver** | `sqlite+aiosqlite` | `postgresql+asyncpg` |
| **Storage** | In-Memory (`:memory:`) | File/Server |
| **Isolation** | Pro Test-Function neue DB | Persistent |
| **Cleanup** | Automatisch (Engine dispose) | Manual/Migration |

### 6.3 Daten-Isolation

```python
@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine):
    """Jeder Test bekommt eigene Session."""
    async with async_session_maker() as session:
        yield session
        await session.rollback()  # Cleanup
```

---

## 7. CI/CD Integration

### 7.1 GitHub Actions Workflows

| Workflow | Datei | Trigger | Jobs |
|----------|-------|---------|------|
| **Server Tests** | `server-tests.yml` | Push/PR zu `El Servador/**` | lint, unit, integration, summary |
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR zu `tests/esp32/**` | esp32-tests, summary |
| **Frontend Tests** | `frontend-tests.yml` | Push/PR zu `El Frontend/**` | type-check, unit, build, summary |
| **Wokwi Tests** | `wokwi-tests.yml` | Push/PR zu `El Trabajante/**` | build + 16 PR core + 6 nightly + summary |
| **Backend E2E** | `backend-e2e-tests.yml` | Push/PR zu `El Servador/**` | e2e (Docker stack), summary |
| **Playwright** | `playwright-tests.yml` | Push/PR zu `El Frontend/**` | e2e (Docker stack), summary |
| **Security Scan** | `security-scan.yml` | Dockerfile/deps + weekly | trivy server, frontend, config |
| **PR Checks** | `pr-checks.yml` | Pull Requests | label, large-file-check |

### 7.2 CI Umgebung

```yaml
# Server Tests
services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports: [1883:1883]

env:
  MQTT_BROKER_HOST: localhost
  DATABASE_URL: sqlite+aiosqlite:///./test.db
  PYTHON_VERSION: '3.11'
```

### 7.3 GitHub CLI Log-Befehle

```bash
# Workflow Runs auflisten
gh run list --workflow=server-tests.yml --limit=10
gh run list --status=failure --limit=5

# Logs abrufen
gh run view <run-id> --log
gh run view <run-id> --log-failed

# Artifacts herunterladen
gh run download <run-id>
gh run download <run-id> --name=unit-test-results

# Workflow manuell starten
gh workflow run server-tests.yml
gh workflow run wokwi-tests.yml
```

### 7.4 Artifacts

| Workflow | Artifact | Inhalt | Retention |
|----------|----------|--------|-----------|
| server-tests | `unit-test-results` | `junit-unit.xml`, `coverage-unit.xml` | 7 Tage |
| server-tests | `integration-test-results` | `junit-integration.xml`, `coverage-integration.xml` | 7 Tage |
| esp32-tests | `esp32-test-results` | `junit-esp32.xml` | 7 Tage |
| frontend-tests | `frontend-test-results` | `junit-results.xml`, Coverage | 7 Tage |
| backend-e2e-tests | `backend-e2e-results` | `e2e-results.xml`, Server/DB/MQTT Logs | 7 Tage |
| playwright-tests | `playwright-report` | JUnit XML, HTML Report, Traces | 7 Tage |
| wokwi-tests | `wokwi-firmware` | Build Output | 1 Tag |
| wokwi-tests | `*-test-logs` | Serial Logs per Kategorie | 7 Tage |

### 7.5 Test-Reporting Pipeline

Alle Workflows nutzen dasselbe Pattern: JUnit XML → upload-artifact → `EnricoMi/publish-unit-test-result-action@v2` → PR-Kommentar.

**Wichtig für Docker-basierte E2E Tests:**
- KEIN `--wait` Flag bei `docker compose up` (verbirgt Crash-Logs)
- Health-Polling in separatem Step mit Diagnostik bei Failure
- Server/DB/MQTT Logs werden bei Failure automatisch als Artifacts gespeichert

---

## 8. Quick Reference

### 8.1 Häufige Commands

```bash
# ============================================
# SERVER TESTS
# ============================================
cd "El Servador/god_kaiser_server"

.venv/Scripts/pytest.exe tests/ -v --no-cov            # Alle Tests
.venv/Scripts/pytest.exe tests/unit/ -v                 # Unit Tests
.venv/Scripts/pytest.exe tests/integration/ -v          # Integration Tests
.venv/Scripts/pytest.exe tests/esp32/ -v                # ESP32 Mock Tests
.venv/Scripts/pytest.exe -m "critical" -v               # Kritische Tests
.venv/Scripts/pytest.exe -m "not slow" -v               # Ohne langsame Tests

# ============================================
# WOKWI TESTS
# ============================================
cd "El Trabajante"

pio run -e wokwi_simulation                      # Firmware bauen
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml

# ============================================
# LOGS
# ============================================
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"
mosquitto_sub -h localhost -t "kaiser/#" -v

# ============================================
# CI/CD
# ============================================
gh run list --workflow=server-tests.yml --limit=5
gh run view <id> --log-failed
```

### 8.2 Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| `ModuleNotFoundError: No module named 'src'` | sys.path nicht gesetzt | `conftest.py` fügt Projekt-Root hinzu |
| `asyncpg` import error | PostgreSQL Driver fehlt | Tests nutzen SQLite, kein asyncpg nötig |
| Tests hängen bei MQTT | Kein Mock | `autouse=True` Fixtures mocken MQTT |
| KI stoppt nach Test-Run | PostToolUse:Bash Hook (auto-ops) | `\|\| true` anhängen oder Hook deaktivieren |
| `--timeout` unrecognized | pytest-timeout nicht installiert | Weglassen, ist kein Pflicht-Plugin |
| Wokwi "token not set" | Environment Variable | `export WOKWI_CLI_TOKEN=...` |
| Wokwi "wokwi.toml not found" | Falsches Verzeichnis | `.` als erstes Argument |
| "Invalid scenario step: timeout" | Timeout im YAML | Nur CLI `--timeout` nutzen |
| `poetry run` nutzt Python 3.14 | Poetry env Mapping kaputt | `.venv/Scripts/pytest.exe` direkt nutzen |

---

## 9. Dokumentations-Hierarchie

| Dokument | Zweck | Wann lesen? |
|----------|-------|-------------|
| **Dieses Dokument** | Test-Workflow Übersicht | Test-Ausführung |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | Logs, Serial Capture, MQTT | Bei Log-Analyse |
| `.claude/reference/debugging/CI_PIPELINE.md` | GitHub Actions, Artifacts | Bei CI-Failures |
| `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | KI-Zugriffsgrenzen | Bei Zugriffsproblemen |
| `El Servador/docs/ESP32_TESTING.md` | MockESP32Client Details | Mock-Tests schreiben |
| `El Trabajante/tests/wokwi/README.md` | Wokwi Framework | Wokwi-Tests |
| `.claude/skills/server-development/SKILL.md` | Server Architektur | Server-Code ändern |
| `.claude/skills/esp32-development/SKILL.md` | ESP32 Firmware | Firmware ändern |

**WICHTIG:** Tests werden NUR auf explizite Anfrage durchgeführt, nicht automatisch bei jeder Entwicklungsaufgabe.

---

**Letzte Aktualisierung:** 2026-02-23
**Version:** 4.2 (Zahlen-Korrektur, CI-Workflows ergänzt, poetry→.venv Fix)
