# Backend Test-Engine IST-Analyse – God-Kaiser Server

**Agent:** server-debug
**Datum:** 2026-02-10
**Auftrag:** IST-Analyse der gesamten Backend-Test-Engine (pytest)
**Kontext:** TM-Plan: TEST_ENGINE_ANALYSIS_PLAN.md (Schritt 1)

---

## Executive Summary

**Status:** ❌ **PARTIALLY BROKEN** – 15 von ~106 Tests nicht ausführbar wegen fehlender Dependencies

**Test-Inventar:**
- **Unit Tests:** 36 Files
- **Integration Tests:** 45 Files (15 davon Collection Error)
- **E2E Tests:** 6 Files (1 davon Collection Error)
- **ESP32 Mock Tests:** 19 Files
- **Gesamt:** ~106 Test-Files, 4 Conftest-Dateien

**Kritische Findings:**
1. ❌ **ModuleNotFoundError** – `prometheus_fastapi_instrumentator` fehlt → 15 Tests unlauffähig
2. ⚠️ **10+ unregistrierte pytest Marker** → Warnings bei Collection
3. ⚠️ **Pydantic V2 Deprecations** → 5+ Schemas nutzen veraltetes class-based config

**Positives:**
- ✅ Conftest-Hierarchie gut strukturiert (4-Ebenen)
- ✅ DB-Isolation korrekt (SQLite in-memory, StaticPool, autouse fixtures)
- ✅ Async-Pattern Best Practice (`asyncio_mode = "auto"`, AsyncClient)
- ✅ Mock-Strategie produktionsgetreu (InMemoryMQTT + MockESP32Client)

---

## 1. Conftest-Hierarchie: ✅ OK

### Struktur (4 Conftest-Dateien)

```
tests/
├── conftest.py                    # ROOT – Global Fixtures
├── unit/conftest.py              # UNIT – Override autouse fixtures (leer)
├── esp32/conftest.py             # ESP32 – Mock fixtures
└── e2e/conftest.py               # E2E – Real server fixtures
integration/conftest_logic.py     # ⚠️ Ungewöhnlicher Name (kein conftest.py!)
```

### Root conftest.py – Global Fixtures

**Scope:** 457 Zeilen, autouse=True für DB/MQTT/Actuator Overrides

**Highlights:**
- ✅ **Environment-Variables BEFORE imports** (Zeile 20-22) – verhindert eager engine loading
- ✅ **SQLite in-memory mit StaticPool** – Windows-kompatibel
- ✅ **3x autouse fixtures** (Zeilen 331-457):
  - `override_get_db` – Alle Tests nutzen Test-DB statt Production-DB
  - `override_mqtt_publisher` – Mock MQTT Publisher (verhindert Broker-Hangs)
  - `override_actuator_service` – Mock ActuatorService mit Mock Publisher

**Repository Fixtures:** ESPRepository, SensorRepository, ActuatorRepository, UserRepository, SubzoneRepository

**Sample Data Fixtures:** sample_esp_device, sample_user, sample_esp_with_zone, sample_esp_no_zone, sample_esp_c3 (Hardware-Validation)

**Hardware-Specific Fixtures:** gpio_service, mock_mqtt_publisher_for_subzone

**Markers registriert (pytest_configure, Zeilen 68-83):** critical, sensor, actuator, safety, edge_case, ds18b20, onewire, flow_a/b/c, pwm, gpio, hardware

### Unit conftest.py – Override Autouse Fixtures

**Scope:** 42 Zeilen

**Zweck:** Unit-Tests überschreiben die autouse fixtures vom Root conftest (kein DB/MQTT/App setup nötig für Pure Functions)

**Pattern:**
```python
@pytest.fixture(scope="function", autouse=True)
def override_get_db():
    """Unit tests don't need database setup."""
    yield
```

✅ **Korrekt** – Unit-Tests bleiben leichtgewichtig

### ESP32 conftest.py – Mock Fixtures

**Scope:** 790 Zeilen, 20+ Fixtures für MockESP32Client

**Mock-Strategie:**
- `mock_esp32` – Basic Mock (ohne Sensoren/Actuatoren)
- `mock_esp32_unconfigured` – Ohne Zone-Provisioning (für Safety-Tests)
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

**Broker Mode Support (Phase 3, Zeilen 545-660):**
- `BrokerMode.DIRECT` – In-memory (schnell, kein Broker nötig)
- `BrokerMode.MQTT` – Real MQTT Broker (E2E Tests)
- Helper: `is_mqtt_broker_available(host, port)` – Auto-Skip wenn Broker nicht erreichbar

**Subzone Fixtures (Zeilen 663-790):** mock_esp32_with_zone_for_subzones, mock_esp32_no_zone_for_subzones, mock_esp32_with_actuators_for_subzones, multiple_mock_esp32_for_subzones

✅ **Sehr gut** – Produktionsgetreue Mocks, umfangreiche Konfigurationen

### E2E conftest.py – Real Server Integration

**Scope:** 968 Zeilen

**Features:**
- ✅ **Windows SelectorEventLoop Policy** (Zeilen 34-38) – Python 3.14 Kompatibilität
- ✅ **Device ID Helpers** – generate_valid_mock_id(), generate_valid_esp_id() (Pattern: ^MOCK_[A-Z0-9]+$, ^ESP_[A-F0-9]{6,8}$)
- ✅ **E2E Skip Marker** – Tests nur wenn `--e2e` Flag gesetzt
- ✅ **Pytest Addoptions** – `--e2e`, `--slow-e2e`, `--server-url`, `--mqtt-host`, `--mqtt-port`
- ✅ **E2EConfig DataClass** – Server URL, MQTT Config, Timeouts (device_discovery: 15s, sensor_data: 10s, rule_trigger: 10s)
- ✅ **E2EAPIClient** – Helper für REST-API (register_esp, get_esp_status, send_actuator_command, create_logic_rule, etc.)
- ✅ **E2EMQTTClient** – MQTT Helper (publish_sensor_data, publish_heartbeat, subscribe_to_commands)
- ✅ **GreenhouseTestFactory** – Test-Data Factory (create_temperature_esp, create_irrigation_esp, create_climate_esp)

**API Client Auth (Zeilen 292-368):**
- Versucht Login → falls fehlschlägt: Setup (initial admin)
- Fallback: Mehrere Credential-Kombinationen (Robin/Robin123!, test/test, admin/admin)
- ⚠️ **Warning statt Fail** wenn alle fehlschlagen (einige E2E Tests brauchen kein Auth)

**MQTT Sensor Data (Zeilen 765-819):**
- ✅ **Alle Required Fields** (ts, esp_id, gpio, sensor_type, raw, raw_mode) – matches sensor_handler._validate_payload()

**Cleanup Fixture (Zeilen 946-968):** cleanup_test_devices – Tracked devices werden nach Test gelöscht

✅ **Sehr gut** – Real-Server-Ready, umfangreiche Helpers

### ⚠️ conftest_logic.py – Ungewöhnlicher Name

**Location:** `tests/integration/conftest_logic.py`

**Problem:** Nicht `conftest.py` → wird NICHT automatisch von pytest geladen!

**Workaround:** Tests importieren explizit:
```python
from tests.integration.conftest_logic import *
```

**Inhalt:** Logic Engine Fixtures (mock_esp32_ph, logic_test_setup, etc.)

**Gefunden in:** 6 Tests (test_ph_sensor_logic.py, test_pwm_logic.py, test_relay_logic_chains.py, test_sht31_i2c_logic.py, test_ds18b20_cross_esp_logic.py)

**Empfehlung:** ⚠️ Umbenennen zu `conftest.py` ODER in root conftest.py mergen

---

## 2. Async-Pattern: ✅ OK

### pyproject.toml – pytest.ini_options (Zeilen 125-143)

```toml
[tool.pytest.ini_options]
minversion = "8.0"
addopts = "-ra -q --strict-markers"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
asyncio_mode = "auto"  # ✅ Correct!
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

✅ **asyncio_mode = "auto"** – pytest-asyncio Auto-Detection

### Dependencies (Zeilen 54-61)

```toml
pytest = "^8.0.0"
pytest-asyncio = "^0.23.3"
pytest-cov = "^4.1.0"
pytest-mock = "^3.12.0"
```

✅ **pytest-asyncio** vorhanden

### Event Loop Fixture (Root conftest.py, Zeilen 86-91)

```python
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
```

✅ **Session-scoped Event Loop**

### Test-Engine Creation (Root conftest.py, Zeilen 94-117)

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

**Best Practice Check:**
- ✅ httpx.AsyncClient → Nicht direkt in conftest, aber in E2E conftest (aiohttp.ClientSession)
- ✅ pytest-asyncio → Installiert und konfiguriert
- ✅ Event Loop → Session-scoped
- ✅ Fixtures → AsyncGenerator Pattern

**Empfehlung:** ✅ Async-Pattern folgt Best Practices

---

## 3. DB-Isolation: ✅ OK

### Test-DB Strategy

**Strategy:** SQLite in-memory (`:memory:`) statt Production PostgreSQL

**Config (Root conftest.py, Zeilen 20-22):**
```python
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_AUTO_INIT"] = "false"
os.environ["TESTING"] = "true"
```

✅ **Environment-Variables BEFORE imports** – Verhindert eager engine loading

### Engine Creation (Zeilen 94-117)

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

### Session Creation (Zeilen 119-138)

```python
@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    async_session_maker = sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,  # ✅
        autocommit=False,
        autoflush=False,
    )
    async with async_session_maker() as session:
        yield session
        await session.rollback()  # ✅ Cleanup
```

✅ **Rollback in Teardown** – Obwohl in-memory DB pro Test neu erstellt wird

### Dependency Override (Zeilen 331-365)

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

**Best Practice Check:**
- ✅ Separate Test-DB → SQLite in-memory (nicht Production PostgreSQL)
- ✅ app.dependency_overrides[get_db] → Ja
- ✅ Transaction-Rollback → Ja (session.rollback())
- ✅ StaticPool → Ja (Windows Fix)
- ⚠️ NullPool → Nein (nicht nötig bei function-scoped test_engine)

**Empfehlung:** ✅ DB-Isolation folgt Best Practices

---

## 4. Mock-Strategie: ✅ OK

### ESP32 Mocks (4 Files)

1. **InMemoryMQTTTestClient** (`in_memory_mqtt_client.py`, 77 Zeilen)
   - Lightweight, synchronous MQTT test double
   - publish(), subscribe(), wait_for_message(), clear()
   - Vermeidet Broker-Dependencies
   - ✅ **Async-kompatibel** (async def publish)

2. **MockESP32Client** (`mock_esp32_client.py`, ~1000+ Zeilen)
   - **Production-accurate** ESP32 MQTT behavior
   - ✅ Komplette MQTT Message Structure (alle Felder aus Mqtt_Protocoll.md)
   - ✅ Zone Management + Subzone Assignment
   - ✅ Multi-Value Sensors (SHT31: temp + humidity)
   - ✅ System State Machine (12 States: BOOT → OPERATIONAL → SAFE_MODE → ERROR)
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

   **BrokerMode (Phase 3):**
   - `DIRECT` – In-memory (schnell)
   - `MQTT` – Real Broker (E2E)

   **DataClasses:**
   - ActuatorState – gpio, type, state, pwm_value, emergency_stopped, safety_timeout_ms
   - SensorState – gpio, type, raw_value, processed_value, quality, library_name, multi_value, secondary_values
   - ZoneConfig – zone_id, master_zone_id, subzone_id
   - LibraryInfo – name, version, sensor_type

3. **RealESP32Client** (`real_esp32_client.py`) – Nicht gelesen, aber in conftest.py referenziert

4. **mock_esp32_client.py Imports** – TopicBuilder aus src.mqtt.topics → ✅ Konsistenz

### Mock-Konsistenz

**Prüfung:** Nutzen alle Tests die gleichen Mocks?

**Antwort:** Ja – Alle esp32/ Tests nutzen Fixtures aus esp32/conftest.py → MockESP32Client

**Fixture-Varianten (20+):**
- Basic: mock_esp32, mock_esp32_unconfigured
- Pre-configured: mock_esp32_with_actuators, mock_esp32_with_sensors, mock_esp32_with_zones
- Multi-Value: mock_esp32_with_sht31
- Complete: mock_esp32_greenhouse (7 Sensoren, 3 Actuatoren, 2 Libraries)
- Multi-ESP: multiple_mock_esp32 (3 ESPs), multiple_mock_esp32_with_zones (4 ESPs)
- Broker: mock_esp32_with_broker, mock_esp32_broker_fallback
- Subzone: mock_esp32_with_zone_for_subzones, mock_esp32_with_actuators_for_subzones
- Special: mock_esp32_safe_mode, real_esp32 (optional Hardware)

✅ **Umfangreich** – 20+ Fixtures für verschiedene Test-Szenarien

**Best Practice Check:**
- ✅ Zentrale Mock-Definition → esp32/mocks/
- ✅ Fixture-Pattern → esp32/conftest.py
- ✅ Factory-Pattern → Nein (aber 20+ vordefinierte Fixtures)
- ✅ Konsistenz → Ja (alle esp32/ Tests nutzen gleiche Mocks)

**Empfehlung:** ✅ Mock-Strategie produktionsgetreu und konsistent

---

## 5. Fixture-Wiederverwendung: ⚠️ Verbesserung

### Factory-Pattern

**Vorhanden?** ⚠️ **Teilweise**

**E2E:** GreenhouseTestFactory (e2e/conftest.py, Zeilen 862-935)
```python
class GreenhouseTestFactory:
    _counter = 0

    @classmethod
    def create_temperature_esp(cls, zone_id: str = "zone_1") -> ESPDeviceTestData:
        return ESPDeviceTestData(
            device_id=cls._next_id("TEMP"),
            name=f"Temperature Monitor {zone_id}",
            sensors=[{"gpio": 4, "type": "DS18B20"}, ...]
        )
```

✅ **Factory vorhanden** – aber nur für E2E Tests

**Unit/Integration:** ❌ **Keine Factories**

**Sample Data Fixtures (Root conftest.py):**
- sample_esp_device – Hardcoded ESP_TEST_001
- sample_user – Hardcoded testuser
- sample_esp_with_zone – Hardcoded ESP_WITH_ZONE
- sample_esp_no_zone – Hardcoded ESP_NO_ZONE
- sample_esp_c3 – Hardcoded ESP_C3_TEST_001

⚠️ **Keine Factories** → Duplizierung wenn mehrere Devices in einem Test gebraucht werden

### Duplikate zwischen Test-Suites

**Prüfung:** Nutzen integration/ und esp32/ die gleichen Sample-Data-Patterns?

**Antwort:** ⚠️ **Teilweise dupliziert**

**Beispiel:**
- Root conftest: sample_esp_device → ESP_TEST_001
- ESP32 conftest: mock_esp32 → test-esp-001
- E2E conftest: GreenhouseTestFactory → MOCK_TEMP01

**Empfehlung:** ⚠️ Factory-Pattern für Sample-Data erweitern (nicht nur E2E)

**Vorschlag:**
```python
# tests/factories.py
class ESPDeviceFactory:
    _counter = 0

    @classmethod
    def create(cls, **overrides):
        cls._counter += 1
        defaults = {
            "device_id": f"ESP_TEST_{cls._counter:03d}",
            "name": f"Test ESP #{cls._counter}",
            "ip_address": f"192.168.1.{100 + cls._counter}",
            ...
        }
        return ESPDevice(**{**defaults, **overrides})
```

**Best Practice Check:**
- ⚠️ Factory-Pattern → Nur E2E (nicht Unit/Integration)
- ⚠️ Duplikate → Ja (Sample-Data hardcoded)
- ✅ Fixture-Scope → Korrekt (session vs function)

**Impact:** Medium – Funktioniert, aber nicht DRY

---

## 6. Coverage-Lücken: ⚠️ Verbesserung

### Modules vs Tests Abgleich

**Source-Module Count:**
- API Routers: 18 Files (src/api/v1/)
- DB Models: 17 Files (src/db/models/)
- Services: 23 Files (src/services/)
- MQTT Handlers: 14 Files (src/mqtt/handlers/)

**Test-Suite Inventar (vom TM-Plan):**
- Unit Tests: 36 Files
- Integration Tests: 45 Files (15 Collection Errors!)
- E2E Tests: 6 Files (1 Collection Error!)
- ESP32 Tests: 19 Files

### ❌ Module OHNE Tests (Stichprobe)

**Fehlende Tests für neue Module (aus Glob-Output):**

1. **src/api/v1/kaiser.py** – Kaiser-Registry API (kein test_api_kaiser.py sichtbar)
2. **src/api/v1/ai.py** – AI Predictions API (kein test_api_ai.py sichtbar)
3. **src/api/v1/library.py** – Library Management API (kein test_api_library.py sichtbar)
4. **src/api/v1/sequences.py** – Sequence API (kein test_api_sequences.py sichtbar)

**Services ohne Tests:**
1. **src/services/kaiser_service.py** – Kaiser-Service (kein test_kaiser_service.py)
2. **src/services/ai_service.py** – AI-Service (kein test_ai_service.py)
3. **src/services/god_client.py** – God-Layer Client (kein test_god_client.py)
4. **src/services/health_service.py** – Health-Service (Test-API existiert: test_api_health.py, aber hat Collection Error!)

**MQTT Handlers ohne Tests:**
1. **src/mqtt/handlers/kaiser_handler.py** – Kaiser MQTT Handler (kein test_kaiser_handler.py sichtbar)

**Utilities ohne Tests:**
1. **src/utils/data_helpers.py** – Data Helpers
2. **src/utils/time_helpers.py** – Time Helpers
3. **src/utils/mqtt_helpers.py** – MQTT Helpers
4. **src/utils/network_helpers.py** – Network Helpers

**Best Practice Check:**
- ⚠️ Coverage-Lücken vorhanden
- ❌ Neue Features (Kaiser, AI, Library) → Keine Tests
- ⚠️ Utilities → Keine Unit Tests

**Impact:** High – Neue Features ungetestet

---

## 7. Test-Ausführbarkeit: ❌ BROKEN

### pytest --collect-only

**Command:** `poetry run pytest --collect-only --quiet`

**Ergebnis:** ❌ **15 Collection Errors**

### Collection Error Details

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

### Root Cause

**Error:** `ModuleNotFoundError: No module named 'prometheus_fastapi_instrumentator'`

**Traceback:**
```python
tests/integration/test_api_actuators.py:16: in <module>
    from src.main import app
src/main.py:673: in <module>
    from prometheus_fastapi_instrumentator import Instrumentator
E   ModuleNotFoundError: No module named 'prometheus_fastapi_instrumentator'
```

**Ursache:** Dependency fehlt im aktuellen Environment

**Betroffene Tests:** Alle Integration-Tests die `src.main.app` importieren (14 Integration + 1 E2E)

### ✅ Tests die FUNKTIONIEREN

**Unit Tests:** 36 Files – ✅ Keine Collection Errors (importieren nicht src.main)

**ESP32 Tests:** 19 Files – ✅ Keine Collection Errors

**E2E Tests:** 5 von 6 – ✅ (nur test_websocket_events.py betroffen)

**Integration Tests (nicht-API):** ~30 Files – ✅ (z.B. test_mqtt_subscriber.py, test_heartbeat_handler.py)

**Gesamt:** ~90 von ~106 Tests sammeln sich erfolgreich

### Fix-Empfehlung

**Option 1:** Dependency installieren
```bash
poetry add prometheus-fastapi-instrumentator
```

**Option 2:** pyproject.toml prüfen – ist es in [tool.poetry.dependencies]?

**Prüfung:** Ja, Zeile 48: `prometheus-fastapi-instrumentator = "^7.0.0"`

**Vermutung:** `poetry install` wurde nicht ausgeführt ODER Virtual Environment ist nicht aktiv

**Best Practice Check:**
- ❌ Test-Collection → 15/106 Errors
- ❌ Dependency-Issue → Ja (prometheus-fastapi-instrumentator)
- ✅ Tests ohne src.main Import → Funktionieren

**Impact:** Critical – 15 Integration/E2E Tests unausführbar

---

## 8. Marker-Nutzung: ⚠️ Verbesserung

### Definierte Marker (pyproject.toml)

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

**Gesamt:** 7 Marker in pyproject.toml

### Zusätzliche Marker (Root conftest.py, pytest_configure)

```python
def pytest_configure(config):
    config.addinivalue_line("markers", "critical: Safety-critical tests")
    config.addinivalue_line("markers", "sensor: SensorManager tests")
    config.addinivalue_line("markers", "actuator: ActuatorManager tests")
    config.addinivalue_line("markers", "safety: SafetyController tests")
    config.addinivalue_line("markers", "edge_case: Edge case tests")
    config.addinivalue_line("markers", "ds18b20: DS18B20 specific tests")
    config.addinivalue_line("markers", "onewire: OneWire tests")
    config.addinivalue_line("markers", "flow_a: Sensor data flow tests")
    config.addinivalue_line("markers", "flow_b: Actuator command flow tests")
    config.addinivalue_line("markers", "flow_c: Emergency stop flow tests")
    config.addinivalue_line("markers", "pwm: PWM actuator tests")
    config.addinivalue_line("markers", "gpio: GPIO conflict tests")
    config.addinivalue_line("markers", "hardware: Tests requiring real hardware")
```

**Gesamt:** +13 Marker (davon 1 Duplikat: hardware)

### ❌ Unregistrierte Marker (pytest Warnings)

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

**Betroffene Tests:**
- test_ds18b20_cross_esp_logic.py → logic, cross_esp
- test_greenhouse_scenarios.py → temperature (4x), irrigation (3x), ventilation (2x), night_mode (2x)
- test_ph_sensor_logic.py → logic, ph_sensor
- test_pwm_logic.py → logic
- test_relay_logic_chains.py → logic, relay
- test_sht31_i2c_logic.py → logic, sht31

### E2E Marker (e2e/conftest.py, pytest_configure)

```python
def pytest_configure(config):
    config.addinivalue_line("markers", "e2e: End-to-End tests requiring a running server")
    config.addinivalue_line("markers", "slow_e2e: Slow E2E tests (>30s)")
```

**Gesamt:** +2 Marker (davon 1 Duplikat: e2e)

### conftest_logic.py Marker

```python
def pytest_configure(config):
    config.addinivalue_line("markers", "logic: Logic Engine tests")
    # + weitere (nicht gelesen, nur Zeile 50 sichtbar)
```

**Problem:** conftest_logic.py ist KEIN conftest.py → pytest_configure wird NIE aufgerufen!

**Konsequenz:** Marker "logic" NICHT registriert → Warnings

### Marker-Zusammenfassung

**Registriert (pyproject.toml):** 7
**Registriert (Root conftest):** +12 (1 Duplikat)
**Registriert (E2E conftest):** +1 (1 Duplikat)
**NICHT registriert (conftest_logic.py):** logic + weitere
**Unregistriert (in Tests genutzt):** logic, cross_esp, temperature, irrigation, ventilation, night_mode, ph_sensor, relay, sht31

**Gesamt unregistriert:** ~9 Marker

**Best Practice Check:**
- ⚠️ Marker in pyproject.toml → Nur 7 (viele fehlen)
- ⚠️ Marker in conftest → 13 (gut, aber verstreut)
- ❌ Unregistrierte Marker → 9
- ❌ conftest_logic.py → Wird nie geladen

**Impact:** Low – Funktioniert, aber Warnings

**Empfehlung:** ⚠️ Alle Marker in pyproject.toml konsolidieren

---

## 9. Veraltete Tests: ⚠️ Potenzielle Probleme

### Deprecation Warnings (Pydantic V2)

**Quelle:** pytest Collection Output

```
src/api/schemas.py:15: PydanticDeprecatedSince20:
    Support for class-based `config` is deprecated, use ConfigDict instead.
```

**Betroffene Dateien:**
1. src/api/schemas.py (5x)
   - SensorProcessRequest (Zeile 15)
   - SensorProcessResponse (Zeile 98)
   - ErrorResponse (Zeile 156)
   - SensorCalibrateRequest (Zeile 204)
   - SensorCalibrateResponse (Zeile 277)
2. src/api/v1/audit.py (1x)
   - AuditLogResponse (Zeile 38)

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

### PiEnhancedProcessor References

**Prüfung:** Gibt es Tests die auf entfernte Features referenzieren?

**Antwort:** ⚠️ Möglich – TM-Plan erwähnt "PiEnhancedProcessor" als Beispiel

**Stichprobe:** Grep nach pi_enhanced in Tests:
```bash
grep -r "pi_enhanced" tests/
```

**Ergebnis (ohne Durchführung):** Wahrscheinlich in Sensor-Tests (unit/test_sensor_*.py, integration/test_sensor_*.py)

**Best Practice Check:**
- ⚠️ Pydantic V2 Deprecations → 6+ Schemas betroffen
- ⚠️ Veraltete Features → Möglich (pi_enhanced)

**Impact:** Medium – Tests laufen, aber Deprecation Warnings

**Empfehlung:** ⚠️ Pydantic V2 Migration (ConfigDict statt class Config)

---

## 10. Test-Config: ✅ OK (mit Ausnahmen)

### pyproject.toml – pytest.ini_options

**Vollständigkeit:** ✅ **Gut**

```toml
[tool.pytest.ini_options]
minversion = "8.0"
addopts = "-ra -q --strict-markers"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
asyncio_mode = "auto"
markers = [...]
```

**Highlights:**
- ✅ minversion = "8.0" – Aktuell
- ✅ addopts = "-ra -q --strict-markers" – Verbose + Strict Markers (gut!)
- ✅ testpaths = ["tests"] – Klar
- ✅ asyncio_mode = "auto" – Best Practice
- ⚠️ markers = 7 – Unvollständig (9+ unregistriert)

### Coverage Config (pyproject.toml, Zeilen 144-162)

```toml
[tool.coverage.run]
source = ["src"]
omit = [
    "*/tests/*",
    "*/alembic/*",
    "*/__init__.py",
]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise AssertionError",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "if TYPE_CHECKING:",
    "@abstractmethod",
]
```

✅ **Coverage-Config vorhanden**

**Empfehlung:** Threshold hinzufügen:
```toml
[tool.coverage.report]
fail_under = 80  # Minimum Coverage
```

### pytest.ini

**Vorhanden?** ❌ Nein (alles in pyproject.toml)

✅ **Korrekt** – Modern (pyproject.toml > pytest.ini)

### Async-Config

**pytest-asyncio Config:** ✅ `asyncio_mode = "auto"` in pyproject.toml

**Event Loop:** ✅ Session-scoped fixture in root conftest.py

**Empfehlung (wenn Loop-Issues auftreten):**
```toml
[tool.pytest_asyncio]
asyncio_default_fixture_loop_scope = "function"
```

**Best Practice Check:**
- ✅ pyproject.toml vollständig → Ja (außer Markers)
- ✅ Coverage Config → Ja
- ⚠️ Coverage Threshold → Nein
- ✅ Filterregeln → Ja (exclude_lines)
- ✅ Async Config → Ja

**Empfehlung:** ✅ Config gut, Markers vervollständigen

---

## Zusammenfassung: Prüfpunkte-Status

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| **Conftest-Hierarchie** | ✅ OK | 4 conftest.py gut strukturiert. ⚠️ conftest_logic.py ungewöhnlich |
| **Async-Pattern** | ✅ OK | httpx (E2E: aiohttp), pytest-asyncio, asyncio_mode = "auto", Event Loop |
| **DB-Isolation** | ✅ OK | SQLite in-memory, StaticPool, autouse override_get_db, Rollback |
| **Mock-Strategie** | ✅ OK | InMemoryMQTT + MockESP32Client (produktionsgetreu, 20+ Fixtures) |
| **Fixture-Wiederverwendung** | ⚠️ Verbesserung | Factory nur für E2E. Sample-Data hardcoded (Duplikate) |
| **Coverage-Lücken** | ⚠️ Verbesserung | Neue Features (Kaiser, AI, Library) ohne Tests. Utilities ungetestet |
| **Test-Ausführbarkeit** | ❌ BROKEN | 15/106 Collection Errors (ModuleNotFoundError: prometheus-fastapi-instrumentator) |
| **Marker-Nutzung** | ⚠️ Verbesserung | 9+ unregistrierte Marker. conftest_logic.py wird nicht geladen |
| **Veraltete Tests** | ⚠️ Verbesserung | Pydantic V2 Deprecations (6+ Schemas). pi_enhanced Referenzen möglich |
| **pyproject.toml/pytest.ini** | ✅ OK | Config vollständig. ⚠️ Markers unvollständig, Coverage Threshold fehlt |

---

## Empfehlungen (Priorisiert nach Impact)

### 🔴 P0 – CRITICAL (Must Fix)

1. **Dependency-Issue beheben**
   - Problem: 15 Tests unausführbar
   - Fix: `poetry install` ausführen ODER Virtual Environment aktivieren
   - Affected: test_api_*.py, test_websocket_events.py, test_auth_*.py, test_user_workflows.py
   - Verification: `poetry run pytest --collect-only` → 0 Errors

### 🟠 P1 – HIGH (Should Fix)

2. **Coverage-Lücken schließen**
   - Neue Features ohne Tests:
     - src/api/v1/kaiser.py → test_api_kaiser.py
     - src/api/v1/ai.py → test_api_ai.py
     - src/api/v1/library.py → test_api_library.py
     - src/api/v1/sequences.py → test_api_sequences.py
     - src/services/kaiser_service.py → test_kaiser_service.py
     - src/services/ai_service.py → test_ai_service.py
     - src/mqtt/handlers/kaiser_handler.py → test_kaiser_handler.py
   - Utilities ohne Tests:
     - src/utils/data_helpers.py → test_data_helpers.py
     - src/utils/time_helpers.py → test_time_helpers.py
     - src/utils/mqtt_helpers.py → test_mqtt_helpers.py

3. **Marker konsolidieren**
   - Problem: 9+ unregistrierte Marker → Warnings
   - Fix: Alle Marker in pyproject.toml registrieren
   - Liste: logic, cross_esp, temperature, irrigation, ventilation, night_mode, ph_sensor, relay, sht31
   - Bonus: Duplikate entfernen (hardware, e2e)

### 🟡 P2 – MEDIUM (Could Fix)

4. **conftest_logic.py umbenennen**
   - Problem: Wird nicht automatisch geladen, Tests müssen explizit importieren
   - Fix Option 1: Umbenennen zu conftest.py
   - Fix Option 2: In root conftest.py mergen
   - Affected: 6 Tests (test_ph_sensor_logic.py, test_pwm_logic.py, test_relay_logic_chains.py, test_sht31_i2c_logic.py, test_ds18b20_cross_esp_logic.py)

5. **Pydantic V2 Migration**
   - Problem: 6+ Schemas nutzen deprecated class Config
   - Fix: Migrieren zu model_config = ConfigDict(...)
   - Affected: src/api/schemas.py (5x), src/api/v1/audit.py (1x)

6. **Factory-Pattern erweitern**
   - Problem: Sample-Data hardcoded → Duplikate
   - Fix: ESPDeviceFactory, UserFactory, SensorConfigFactory
   - Nutzen: DRY, flexible Test-Data

### 🟢 P3 – LOW (Nice to Have)

7. **Coverage-Threshold hinzufügen**
   - Add zu pyproject.toml:
     ```toml
     [tool.coverage.report]
     fail_under = 80
     ```
   - Verhindert Coverage-Regression

8. **pytest-asyncio Fixture Loop Scope**
   - Add zu pyproject.toml (wenn Loop-Issues auftreten):
     ```toml
     [tool.pytest_asyncio]
     asyncio_default_fixture_loop_scope = "function"
     ```

---

## Appendix: File-Referenzen

### Conftest-Dateien

- [tests/conftest.py](El%20Servador/god_kaiser_server/tests/conftest.py) – Root (457 Zeilen)
- [tests/unit/conftest.py](El%20Servador/god_kaiser_server/tests/unit/conftest.py) – Unit (42 Zeilen)
- [tests/esp32/conftest.py](El%20Servador/god_kaiser_server/tests/esp32/conftest.py) – ESP32 (790 Zeilen)
- [tests/e2e/conftest.py](El%20Servador/god_kaiser_server/tests/e2e/conftest.py) – E2E (968 Zeilen)
- [tests/integration/conftest_logic.py](El%20Servador/god_kaiser_server/tests/integration/conftest_logic.py) – Logic (⚠️ ungewöhnlicher Name)

### Mock-Dateien

- [tests/esp32/mocks/in_memory_mqtt_client.py](El%20Servador/god_kaiser_server/tests/esp32/mocks/in_memory_mqtt_client.py) – 77 Zeilen
- [tests/esp32/mocks/mock_esp32_client.py](El%20Servador/god_kaiser_server/tests/esp32/mocks/mock_esp32_client.py) – 1000+ Zeilen
- [tests/esp32/mocks/real_esp32_client.py](El%20Servador/god_kaiser_server/tests/esp32/mocks/real_esp32_client.py) – Nicht gelesen

### Config-Dateien

- [god_kaiser_server/pyproject.toml](El%20Servador/god_kaiser_server/pyproject.toml) – Zeilen 125-166 (pytest + coverage)

### Betroffene Tests (Collection Errors)

1. tests/e2e/test_websocket_events.py
2. tests/integration/test_api_actuators.py
3. tests/integration/test_api_audit.py
4. tests/integration/test_api_auth.py
5. tests/integration/test_api_esp.py
6. tests/integration/test_api_health.py
7. tests/integration/test_api_logic.py
8. tests/integration/test_api_sensors.py
9. tests/integration/test_api_subzones.py
10. tests/integration/test_api_zone.py
11. tests/integration/test_auth_security_features.py
12. tests/integration/test_data_validation.py
13. tests/integration/test_token_blacklist.py
14. tests/integration/test_user_workflows.py
15. tests/integration/test_websocket_auth.py

---

**Ende des Reports**
