# Test-Workflow für KI-Agenten

> **Zweck:** Test-Ausführung und Auswertung für AutoOne-Projekt
> **Themengebiet:** Test-Workflows (ESP32 + Server)
> **Verwandte Dokumente:**
> - `El Servador/docs/ESP32_TESTING.md` - Server-Test-Dokumentation
> - `El Trabajante/test/_archive/README.md` - Legacy PlatformIO Tests
> - **`.claude/Test_PLAN.md`** - Test-Infrastruktur Roadmap (Phase 3-6)

---

## Übersicht: Zwei Test-Systeme

**AutoOne hat zwei getrennte Test-Systeme:**

### 1. Server-Orchestrierte Tests (EMPFOHLEN)
- **Location:** `El Servador/god_kaiser_server/tests/esp32/`
- **Framework:** pytest (Python)
- **Zweck:** ESP32-Funktionalität via MQTT testen
- **Vorteile:** Hardware-unabhängig, CI/CD-ready, schnell
- **Dokumentation:** `El Servador/docs/ESP32_TESTING.md` 👈 **VOLLSTÄNDIGE TEST-DOKU HIER**

### 2. Legacy PlatformIO Tests (ARCHIVIERT)
- **Location:** `El Trabajante/test/_archive/`
- **Framework:** Unity (C++)
- **Status:** Archiviert (PlatformIO-Linker-Probleme)
- **Dokumentation:** `El Trabajante/test/_archive/README.md`

**Dieser Workflow fokussiert auf PlatformIO Test-Management und verweist für Server-Tests auf `ESP32_TESTING.md`.**

---

## 1. Server-Tests (pytest) - Produktionsreif ✅

**Vollständige Dokumentation:** `El Servador/docs/ESP32_TESTING.md`

### 1.1 Aktuelles Setup (Stand: 2025-12-08)

**Status:** ✅ **VOLLSTÄNDIG GETESTET & PRODUKTIONSREIF**

> **Letzte Änderungen (2025-12-08):**
> - `db_session` Fixture für Konsistenz umbenannt
> - Heartbeat-Handler: Unbekannte Geräte werden abgelehnt
> - Sensor-Validierung: `raw_mode` ist jetzt Required
> - Test-Payloads auf ESP32-Standard aktualisiert (`heap_free` statt `free_heap`)

Das Server-Test-System ist **ohne Hardware, ohne PostgreSQL, ohne MQTT-Broker** lauffähig:

```
┌─────────────────────────────────────────────────────────┐
│ God-Kaiser Server Test-Infrastruktur (Mock-Basiert)    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  pytest (Python 3.13+)                                  │
│    ├─ SQLite (aiosqlite) - In-Memory Database         │
│    ├─ MockESP32Client - Hardware-Simulation           │
│    ├─ NO PostgreSQL needed                             │
│    └─ NO MQTT Broker needed                            │
│                                                         │
│  Tests: 170+ (alle ohne Hardware)                      │
│    ├─ ESP32 Mock Tests (~100)                          │
│    ├─ Unit Tests (~20)                                 │
│    ├─ Integration Tests (34) ← NEU 2025-12-03          │
│    └─ Sonstige Tests (~20)                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

> **Letzte Änderungen (2025-12-03):**
> - 34 neue Integration-Tests für ESP32-Server-Handler
> - Tests decken SensorHandler, ActuatorHandler, HeartbeatHandler ab
> - Bug-Fixes in Handler-Code durch Tests entdeckt

### 1.2 Test-Ausführung (Schritt für Schritt)

**Voraussetzungen prüfen:**
```bash
cd "El Servador/god_kaiser_server"

# 1. Python-Imports testen
python -c "from src.db.base import Base; print('✅ Imports OK')"

# 2. Dependencies validieren
python -c "import pytest, sqlalchemy, aiosqlite, fastapi; print('✅ Dependencies OK')"
```

**Tests ausführen:**
```bash
# Option A: Schnelltest (nur kritische ESP32-Tests)
python run_tests_batch.py

# Option B: Alle Tests mit pytest
python -m pytest tests/ --no-cov -q

# Option C: Nur ESP32 Mock-Tests
python -m pytest tests/esp32/ -m "not hardware" --no-cov -v

# Option D: Integration Tests (Handler-Tests)
python -m pytest tests/integration/test_server_esp32_integration.py -v --no-cov

# Option E: Mit Coverage Report
python -m pytest tests/ --cov=src --cov-report=html
```

**Integration Tests (34 Tests) - was sie testen:**
- `TestTopicParsing` - MQTT Topic-Parser
- `TestSensorHandlerValidation` - Payload-Validierung
- `TestSensorHandlerProcessing` - Sensor-Datenverarbeitung
- `TestActuatorHandlerProcessing` - Actuator-Status-Verarbeitung
- `TestHeartbeatHandlerProcessing` - Heartbeat-Verarbeitung
- `TestPiEnhancedProcessing` - Pi-Enhanced Flow
- `TestCompleteWorkflows` - End-to-End Szenarien

### 1.3 Wichtige Implementation-Details für KI-Agenten

#### A. Import-System (KRITISCH!)

**Problem:** Tests importieren `src.*`, aber das ist kein installiertes Package.

**Lösung:** `tests/conftest.py` fügt Projekt-Root zu `sys.path` hinzu:

```python
# tests/conftest.py (Zeile 6-12)
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Danach funktionieren Imports:
from src.db.base import Base
from src.db.models import sensor, actuator
```

**Warum kein `pip install -e .`?**
- Komplexe Package-Struktur (Poetry-basiert)
- sys.path-Ansatz ist portabler
- Funktioniert in allen Umgebungen

#### B. Database Backend (SQLite für Tests)

**Production:** `postgresql+asyncpg://...`  
**Tests:** `sqlite+aiosqlite:///:memory:`

```python
# tests/conftest.py - Test-DB-Config
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()
```

**Warum SQLite?**
- ✅ Keine Installation nötig
- ✅ In-Memory = ultraschnell
- ✅ Keine Cleanup nötig
- ✅ CI/CD-ready
- ❌ PostgreSQL benötigt C++ Compiler (asyncpg)

#### C. MockESP32Client API (Hardware-Simulation)

**Location:** `tests/esp32/mocks/mock_esp32_client.py`

**Zweck:** Simuliert ESP32 auf Server-Seite (Python), NICHT auf Hardware.

```python
# Fixture in tests/esp32/conftest.py
@pytest.fixture
def mock_esp32():
    mock = MockESP32Client(
        esp_id="test-esp-001",
        kaiser_id="test-kaiser-001"
    )
    yield mock
    mock.reset()

# Usage im Test
def test_actuator_control(mock_esp32):
    response = mock_esp32.handle_command("actuator_set", {
        "gpio": 5,
        "value": 1,
        "mode": "digital"
    })
    
    assert response["status"] == "ok"
    assert response["data"]["state"] is True
    
    # MQTT-Nachricht validieren
    messages = mock_esp32.get_published_messages()
    assert messages[0]["topic"] == "kaiser/god/esp/test-esp-001/actuator/5/status"
```

**Wichtige Mock-Methoden:**
- `handle_command(cmd, params)` - Command ausführen, Response zurückgeben
- `get_published_messages()` - MQTT-Nachrichten die Mock "publiziert" hat
- `set_sensor_value(gpio, raw_value, type)` - Sensor-Wert setzen
- `get_actuator_state(gpio)` - Actuator-Status abfragen
- `reset()` - Zustand zurücksetzen

#### D. Response-Struktur (Dual-Format)

**Problem:** Alte Tests erwarten flache Struktur, neue Tests erwarten `data`-Feld.

**Lösung:** MockESP32Client gibt BEIDE Formate zurück:

```python
{
    "status": "ok",
    "command": "sensor_read",
    
    # Top-Level (Backwards Compatibility)
    "gpio": 34,
    "state": True,
    "pwm_value": 0.75,
    
    # Nested (Modern Standard)
    "data": {
        "gpio": 34,
        "state": True,
        "pwm_value": 0.75,
        "raw_value": 2048.0,
        "type": "analog"
    },
    
    "timestamp": 1735818000
}
```

**Warum dual?**
- Test-Migration läuft schrittweise
- Alte Tests brechen nicht
- Neue Tests nutzen `data`-Struktur
- Production-Code nutzt nur `data`

### 1.4 Test-Kategorien & Dateien

**ESP32 Mock-Tests:** `tests/esp32/`

| Datei | Tests | Status | Beschreibung |
|-------|-------|--------|-------------|
| `test_communication.py` | 19 | ✅ PASS | MQTT ping/pong, command/response |
| `test_actuator.py` | ~35 | ✅ PASS | Digital/PWM actuators, emergency stop |
| `test_sensor.py` | ~25 | ✅ PASS | Sensor reading, data publishing |
| `test_infrastructure.py` | ~20 | ✅ PASS | Config management, system status |
| `test_integration.py` | ~15 | ⏸️ TODO | Cross-ESP orchestration |
| `test_performance.py` | ~10 | ⏸️ TODO | Response time benchmarks |

**Unit-Tests:** `tests/unit/`
- `test_core_security.py` - Password hashing, JWT
- `test_repositories_*.py` - Database access layers
- `test_services_*.py` - Business logic

**Integration-Tests:** `tests/integration/`
- `test_api_auth.py` - API authentication flow
- `test_mqtt_flow.py` - Full MQTT message flow

### 1.5 Pytest Konfiguration

**Location:** `pyproject.toml`

```toml
[tool.pytest.ini_options]
minversion = "8.0"
testpaths = ["tests"]
python_files = ["test_*.py"]
asyncio_mode = "auto"

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

**Test-Ausführung mit Markers:**
```bash
# Nur Unit-Tests
pytest -m unit

# ESP32-Tests OHNE Hardware
pytest -m "esp32 and not hardware"

# Alles außer Performance-Tests
pytest -m "not performance"
```

### 1.6 Troubleshooting

#### Problem: `ModuleNotFoundError: No module named 'src'`

**Ursache:** `sys.path` nicht richtig gesetzt.

**Lösung:**
```bash
# Prüfen: tests/conftest.py muss sys.path setzen
grep -A 5 "sys.path" tests/conftest.py

# Manuell testen:
cd god_kaiser_server
python -c "import sys; from pathlib import Path; sys.path.insert(0, str(Path.cwd())); from src.db.base import Base; print('OK')"
```

#### Problem: `ModuleNotFoundError: No module named 'asyncpg'`

**Ursache:** Server versucht PostgreSQL zu nutzen, aber `asyncpg` fehlt.

**Lösung:** `.env` Datei mit SQLite-Config erstellen:
```bash
# .env erstellen
echo 'DATABASE_URL=sqlite+aiosqlite:///./god_kaiser_dev.db' > .env
echo 'MQTT_BROKER_HOST=localhost' >> .env
```

#### Problem: Tests hängen bei MQTT-Operations

**Ursache:** MockESP32Client hat async-Probleme.

**Lösung:**
```python
# pytest.ini - asyncio_mode auf "auto" setzen
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

### 1.7 Production vs. Test vs. Dev

**Test-Umgebung (pytest):**
```python
DATABASE_URL = "sqlite+aiosqlite:///:memory:"  # In-Memory
MQTT_BROKER = None  # MockESP32Client simuliert
```

**Dev-Umgebung (lokaler Server):**
```bash
# .env
DATABASE_URL=sqlite+aiosqlite:///./god_kaiser_dev.db  # File-based
MQTT_BROKER_HOST=localhost  # Optional: Mosquitto lokal
```

**Production-Umgebung (Raspberry Pi 5):**
```bash
# .env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/god_kaiser
MQTT_BROKER_HOST=192.168.1.100  # Raspberry Pi
MQTT_USERNAME=god_kaiser_server
MQTT_PASSWORD=<secure>
```

### 1.8 Schnellreferenz für KI-Agenten

**Projekt-Setup:**
```bash
cd "El Servador/god_kaiser_server"

# Dependencies prüfen
python -c "import pytest, sqlalchemy, aiosqlite; print('OK')"

# Imports validieren
python -c "from src.db.base import Base; print('OK')"
```

**Tests ausführen:**
```bash
# Schnelltest (wichtigste ESP32-Tests)
python run_tests_batch.py

# Alle Tests
pytest tests/ --no-cov -q

# Mit Coverage
pytest tests/ --cov=src --cov-report=html
```

**Test-Ergebnis interpretieren:**
```
# ✅ SUCCESS:
============ 4/4 test files passed ============

# ❌ FAILURE:
[FAIL] Actuator Control Tests
  - Check test output above for details

# ⏸️ SKIPPED:
SKIPPED [2] tests: Real ESP32 hardware required
  - OK: Hardware-Tests werden übersprungen
```

**Bei Problemen:**
1. `grep "FAIL" test_output.log` - Zeigt fehlgeschlagene Tests
2. `pytest <file>::<test> -xvs` - Einzelnen Test debuggen
3. Prüfe `conftest.py` für sys.path-Setup
4. Prüfe `.env` für Database-URL (SQLite!)

**Test-Kategorien:**
- Communication Tests (~20)
- Infrastructure Tests (~30)
- Actuator Tests (~40)
- Sensor Tests (~30)
- Integration Tests (~20)

**GESAMT: ~140 Tests** (alle ohne Hardware lauffähig)

---

## 2. Legacy PlatformIO Tests - Archiviert

### Voraussetzungen

**Hardware:**
- ESP32 via USB verbunden (optional - Tests laufen auch ohne!)
- Serial Port verfügbar (für Live-Output)

**Software:**
- PlatformIO installiert (`pio --version`)
- **KEIN Server nötig** - MockMQTTBroker simuliert alles lokal

**Warum Server-unabhängig:**
- CI/CD läuft ohne physische Infrastruktur
- Server-Entwickler können ESP-Code testen
- Schneller Feedback-Loop (keine MQTT-Broker-Setup)

---

## 2. Test-Ausführung

### Von Root-Verzeichnis (empfohlen für KI-Agenten)

```bash
# Alle Tests mit Output-Logging
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | tee test_output.log

# Einzelne Test-Datei
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev -f test_sensor_manager

# Mit Serial-Monitor (Live-Output)
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev && ~/.platformio/penv/Scripts/platformio.exe device monitor
```

**Was passiert:**
- Flash ESP32 mit Test-Firmware
- Führt alle `test_*.cpp` Dateien aus
- Output geht nach STDOUT + `test_output.log`
- Exit Code: 0 = OK, 1 = Fehler

### Innerhalb El Trabajante Ordner

```bash
cd "El Trabajante"

# Alle Tests
pio test -e esp32_dev 2>&1 | tee test_output.log

# Einzelne Test-Datei
pio test -e esp32_dev -f test_sensor_manager
```

---

## 3. Test-Kategorien (Dynamic File Management)

### Problem: Multiple-Definition-Errors

**Fundamentales PlatformIO-Limit:**
- PlatformIO kompiliert ALLE `.cpp` Dateien im `test/` Ordner zusammen in EINE Firmware
- Jeder Test hat eigene `setup()`/`loop()` Funktionen → Multiple-Definition-Error
- `--filter` Parameter filtert nur AUSFÜHRUNG, nicht BUILD
- `test_ignore` Parameter funktioniert NICHT (verhindert nur Test-Discovery, nicht Kompilierung)

**Konsequenz:** Alle Tests gleichzeitig im `test/` Ordner funktioniert NICHT.

### Lösung: Option C - Dynamic File Management Script

**Konzept:** PowerShell-Script verschiebt Tests temporär in/aus dem `test/` Verzeichnis.

**Workflow:**
1. Script archiviert alle Tests nach `test/_archive/`
2. Kopiert nur gewünschte Kategorie zurück nach `test/`
3. Führt Tests aus mit `pio test -e esp32_dev`
4. Räumt auf - alle Tests zurück ins Archiv
5. Zeigt klare PASS/FAIL/IGNORE Zusammenfassung

**Tests sind prefix-kategorisiert:**
- `actuator_*.cpp` - Actuator-System (6 Tests)
- `sensor_*.cpp` - Sensor-System (5 Tests)
- `comm_*.cpp` - Communication (3 Tests)
- `infra_*.cpp` - Infrastructure (5 Tests)
- `integration_*.cpp` - Integration (2 Tests)

### Test-Ausführung mit Script (EMPFOHLEN)

**Via Slash-Command (einfachste Methode für KI-Agenten):**

```bash
/esp-test-category infra
/esp-test-category actuator
/esp-test-category sensor
/esp-test-category comm
/esp-test-category integration
/esp-test-category all
```

**Direkter Script-Aufruf:**

```powershell
cd "El Trabajante"

# Infrastructure-Tests (Error-Tracking, Config, Storage, Logger, Topics)
.\scripts\run-test-category.ps1 -Category infra

# Actuator-Tests (Manager, Safety, PWM, Integration)
.\scripts\run-test-category.ps1 -Category actuator

# Sensor-Tests (Manager, Pi-Enhanced, I2C, OneWire, Integration)
.\scripts\run-test-category.ps1 -Category sensor

# Communication-Tests (MQTT, WiFi, HTTP)
.\scripts\run-test-category.ps1 -Category comm

# Integration-Tests (Full-System, Phase2)
.\scripts\run-test-category.ps1 -Category integration

# ALLE Kategorien sequentiell
.\scripts\run-test-category.ps1 -Category all
```

### Was das Script macht

```
┌─────────────────────────────────────────┐
│ 1. Initialize Archive                   │
│    test/_archive/ erstellen             │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 2. Move all *.cpp to _archive/          │
│    (helpers/ bleibt unberührt)          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 3. Copy category tests back             │
│    z.B. infra_*.cpp → test/             │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 4. Run PlatformIO tests                 │
│    pio test -e esp32_dev                │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 5. Cleanup - Move back to archive       │
│    test/*.cpp → _archive/               │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 6. Report Results                        │
│    PASS/FAIL/IGNORE Summary             │
└─────────────────────────────────────────┘
```

### Script-Features

- ✅ **Automatische Cleanup**: Tests werden IMMER zurück ins Archiv verschoben
- ✅ **Fehler-Handling**: Emergency-Cleanup bei Script-Abbruch
- ✅ **Colored Output**: Grün=PASS, Rot=FAIL, Gelb=IGNORE
- ✅ **Logging**: Output geht nach `test/test_output.log`
- ✅ **Summary**: Klare Zusammenfassung am Ende
- ✅ **Exit Codes**: 0=Success, 1=Failure (CI/CD-ready)

### Test-Mapping (Referenz für KI)

| Kategorie | Slash-Command | Script Parameter | Test-Dateien |
|-----------|---------------|------------------|--------------|
| **Infrastructure** | `/esp-test-category infra` | `-Category infra` | `infra_config_manager.cpp`, `infra_storage_manager.cpp`, `infra_error_tracker.cpp`, `infra_logger.cpp`, `infra_topic_builder.cpp` |
| **Actuator** | `/esp-test-category actuator` | `-Category actuator` | `actuator_config.cpp`, `actuator_manager.cpp`, `actuator_integration.cpp`, `actuator_models.cpp`, `actuator_safety_controller.cpp`, `actuator_pwm_controller.cpp` |
| **Sensor** | `/esp-test-category sensor` | `-Category sensor` | `sensor_manager.cpp`, `sensor_integration.cpp`, `sensor_pi_enhanced.cpp`, `sensor_i2c_bus.cpp`, `sensor_onewire_bus.cpp` |
| **Communication** | `/esp-test-category comm` | `-Category comm` | `comm_mqtt_client.cpp`, `comm_wifi_manager.cpp`, `comm_http_client.cpp` |
| **Integration** | `/esp-test-category integration` | `-Category integration` | `integration_full.cpp`, `integration_phase2.cpp` |
| **Alle** | `/esp-test-category all` | `-Category all` | Alle Kategorien sequentiell |

### WICHTIG für KI-Agenten

1. **IMMER Script nutzen** - Nicht direkt `pio test` ohne File-Management
2. **Slash-Command bevorzugen** - Einfachster Workflow
3. **ONE FILE AT A TIME** - Script läuft jeden Test einzeln (verhindert multiple-definition errors)
4. **Archive-State prüfen** - Bei Problemen: `ls test/_archive/*.cpp` sollte alle Tests enthalten
5. **IGNORE ist OK** - Fehlende Hardware ist graceful degradation, kein Fehler

### Server-Tests Status ✅

**Status:** ✅ Produktionsreif - Vollständig dokumentiert in `El Servador/docs/ESP32_TESTING.md`

**Für Server-Test-Details siehe:**
- 📄 `El Servador/docs/ESP32_TESTING.md` - Vollständige Test-Dokumentation
- 📄 `El Servador/docs/MQTT_TEST_PROTOCOL.md` - MQTT Command-Spezifikation
- 📄 `El Trabajante/test/_archive/README.md` - Legacy Test Migration-Mapping

---

## 4. Output-Analyse

### Unity-Format verstehen

**Standard-Format:**
```
<datei>:<zeile>:<test_name>:<status>
```

**Beispiel-Output:**
```
test/test_sensor_manager.cpp:365:test_analog_sensor_raw_reading:PASS
test/test_sensor_manager.cpp:457:test_digital_sensor_plausibility:PASS
test/test_actuator_manager.cpp:123:test_pump_control:IGNORE (No free actuator GPIO available)
-----------------------
3 Tests 0 Failures 1 Ignored
OK
```

### Status-Codes

| Status | Bedeutung | Aktion für KI |
|--------|-----------|---------------|
| **PASS** | Test erfolgreich | Keine Aktion nötig |
| **FAIL** | Test fehlgeschlagen | **Fehler analysieren!** |
| **IGNORE** | Ressource fehlt | OK - Graceful Degradation |

**WICHTIG:** IGNORE ist **KEIN Fehler**!
- Production-System: GPIO bereits belegt → IGNORE
- New System: Kein freier GPIO → IGNORE
- CI/CD: Keine Hardware → IGNORE (trotzdem OK)

### Fehler-Analyse (automatisiert)

```bash
# Nur Fehler extrahieren
grep ":FAIL" test_output.log

# Zusammenfassung (letzte 5 Zeilen)
tail -5 test_output.log

# Ignorierte Tests prüfen (optional)
grep ":IGNORE" test_output.log

# Anzahl Fehler zählen
grep -c ":FAIL" test_output.log
```

**KI-Workflow:**
1. `grep ":FAIL"` ausführen
2. Falls Output leer → ✅ Alles OK
3. Falls Output vorhanden → ❌ Fehler analysieren:
   - Datei + Zeile extrahieren
   - Test-Code lesen
   - Fehler-Message analysieren
   - Fix vorschlagen

---

## 4. Typische Szenarien

### Szenario A: Perfekt - Alle Tests PASS

**Output:**
```
-----------------------
10 Tests 0 Failures 0 Ignored
OK
```

**Interpretation:**
- ✅ Code ist produktionsreif
- ✅ Kann committed werden
- ✅ Keine weitere Aktion nötig

### Szenario B: OK - Einige IGNORE

**Output:**
```
test/test_sensor_manager.cpp:234:test_sht31_temperature:IGNORE (No free I2C sensor available)
test/test_actuator_manager.cpp:567:test_pump_runtime:IGNORE (No free actuator GPIO)
-----------------------
8 Tests 0 Failures 2 Ignored
OK
```

**Interpretation:**
- ✅ Code ist OK
- ✅ IGNORE = fehlende GPIOs/Hardware (erwartet!)
- ✅ Kann committed werden

### Szenario C: FEHLER - FAIL vorhanden

**Output:**
```
test/test_sensor_manager.cpp:345:test_analog_sensor_reading:FAIL
Expected 0 Was 1001
-----------------------
7 Tests 1 Failures 2 Ignored
FAIL
```

**Interpretation:**
- ❌ Code ist kaputt!
- ❌ NICHT committen!
- ❌ Fehler analysieren + fixen

---

## 5. Test-Pattern Referenzen

**Server-Tests (pytest):**
- 📄 `El Servador/docs/ESP32_TESTING.md` - MockESP32Client API, Fixtures, Best Practices

**Legacy Unity-Tests (archiviert):**
- 📄 `El Trabajante/test/_archive/README.md` - Historische Test-Patterns, Migration-Mapping

---

## 6. Troubleshooting

### Problem: "No free GPIO"

**Lösung:**
- ✅ TEST_IGNORE ist OK - **kein Fehler**!
- Production-System: GPIOs sind belegt (erwartet)
- **Nicht tun:** ❌ Production-Config ändern (Tests dürfen Config nicht modifizieren!)

### Problem: Timeout beim Flash

**Lösung:**
```bash
# Verfügbare Ports prüfen
pio device list

# ESP neu verbinden (USB-Kabel)
```

### Problem: Tests hängen

**Lösung:**
```bash
# Serial-Monitor starten (Live-Output)
pio device monitor

# Prüfen wo Test hängt
# → Letzte Log-Message zeigt Stelle
```

### Problem: Random Test-Failures

**Lösung:**
- `setUp()`/`tearDown()` nutzen für Clean State
- Mock-Hardware nutzen (nicht echte Sensoren)
- Delays für Timing-kritische Tests

---

## 7. Best Practices für KI-Agenten

### Workflow nach Code-Änderungen

```bash
# 1. Tests ausführen
cd "El Trabajante"
pio test -e esp32_dev 2>&1 | tee test_output.log

# 2. Fehler prüfen
grep ":FAIL" test_output.log

# 3. Entscheidung:
# - Keine Fehler (leer) → Commit OK
# - Fehler vorhanden → Analysieren + Fixen
```

### Test-Analyse automatisieren

```bash
#!/bin/bash
# test_check.sh - Automatische Test-Auswertung

cd "El Trabajante"
pio test -e esp32_dev 2>&1 | tee test_output.log

FAILURES=$(grep -c ":FAIL" test_output.log || echo "0")

if [ "$FAILURES" -gt 0 ]; then
    echo "❌ $FAILURES Test(s) fehlgeschlagen:"
    grep ":FAIL" test_output.log
    exit 1
else
    echo "✅ Alle Tests erfolgreich (IGNORE ist OK)"
    tail -5 test_output.log
    exit 0
fi
```

---

## 8. Schnellreferenz

### Ein-Zeilen-Commands

```bash
# Tests ausführen + Fehler anzeigen
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | tee test_output.log && grep ":FAIL" test_output.log

# Tests ausführen + nur Zusammenfassung
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | tail -5

# Nur fehlgeschlagene Tests
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | grep -E ":(FAIL|Expected)"
```

---

---

## Dokumentations-Hierarchie

**Dieser Workflow beschreibt:** PlatformIO Test-Ausführung und -Management (Legacy)

**⚠️ HINWEIS:** Dieser Workflow beschreibt die **Legacy PlatformIO Tests**, die archiviert wurden.  
**✅ EMPFOHLEN:** Nutze die **Server-orchestrierten Tests** (pytest) - siehe `/full-test`

**Für detaillierte Test-Dokumentation siehe:**
1. 📄 `/full-test` - **EMPFOHLEN: Kompletter Test-Workflow** (ESP32 + Server)
2. 📄 `El Servador/docs/ESP32_TESTING.md` - **Server-Tests (VOLLSTÄNDIG)**
   - MockESP32Client API
   - Test-Kategorien (140+ Tests)
   - Fixtures, Best Practices
   - pytest Kommandos
3. 📄 `El Trabajante/test/_archive/README.md` - Legacy Tests
   - Migrations-Mapping
   - Warum archiviert
   - Historische Test-Patterns

---

---

## 9. Test-Infrastruktur (Phase 1-6 COMPLETE ✅)

**Status:** Alle 6 Phasen erfolgreich implementiert (2025-12-24)

### Phase 1-2: Data Source Tracking ✅

- **DataSource Enum:** `production`, `mock`, `test`, `simulation`
- **data_source Spalten:** SensorData, ActuatorState, ActuatorHistory
- **Detection-Logic:** In allen MQTT-Handlern implementiert
- **MockESP32Client:** Vollständige ESP32-Simulation (1433 Zeilen)
- **Debug API:** Mock ESP CRUD mit DB-Registration

### Phase 3: MockESP32Client MQTT Broker-Mode ✅

**Neue Features in `tests/esp32/mocks/mock_esp32_client.py`:**

```python
from tests.esp32.mocks.mock_esp32_client import MockESP32Client, BrokerMode

# Standard: In-Memory (schnell, keine Dependencies)
mock = MockESP32Client(esp_id="MOCK_TEST_001")
assert mock.broker_mode == BrokerMode.DIRECT

# Optional: Echte MQTT-Messages an Broker senden
mock = MockESP32Client(
    esp_id="MOCK_TEST_001",
    broker_mode=BrokerMode.MQTT,
    mqtt_config={
        "host": "localhost",
        "port": 1883,
        "username": None,
        "password": None
    }
)

# Prüfen ob verbunden
if mock.is_broker_connected():
    mock.handle_command("heartbeat", {})  # Wird an echten Broker gesendet
```

**Neue Fixtures in `tests/esp32/conftest.py`:**

```python
@pytest.fixture
def mock_esp32_with_broker(mqtt_test_config):
    """Mock ESP mit echter MQTT-Verbindung (skippt wenn kein Broker)."""
    # Skippt automatisch wenn kein Broker erreichbar

@pytest.fixture
def mock_esp32_broker_fallback(mqtt_test_config):
    """Mock ESP - MQTT wenn möglich, sonst DIRECT-Modus."""
    # Fällt auf DIRECT zurück wenn kein Broker
```

**Helper-Funktion:**
```python
from tests.esp32.conftest import is_mqtt_broker_available

if is_mqtt_broker_available("localhost", 1883):
    # Broker-Tests laufen
else:
    # Fallback auf In-Memory
```

### Phase 4: Repository Data Source Filtering ✅

**SensorRepository (`src/db/repositories/sensor_repo.py`):**

```python
from src.db.models.enums import DataSource

# query_data() mit data_source Filter
data = await sensor_repo.query_data(
    esp_id=esp_uuid,
    data_source=DataSource.PRODUCTION,  # Neu!
    limit=100
)

# Neue Methoden:
await sensor_repo.get_by_source(DataSource.MOCK, limit=50)
await sensor_repo.get_production_only(limit=100)
deleted = await sensor_repo.cleanup_test_data(older_than_hours=24)
stats = await sensor_repo.count_by_source()  # {"production": 1000, "mock": 50, ...}
```

**ActuatorRepository (`src/db/repositories/actuator_repo.py`):**

```python
# update_state() mit data_source
await actuator_repo.update_state(
    actuator_id=uuid,
    state=True,
    data_source=DataSource.MOCK.value  # Neu!
)

# get_history() mit Filter
history = await actuator_repo.get_history(
    actuator_id=uuid,
    data_source=DataSource.PRODUCTION
)

# Neue Methoden (analog zu SensorRepository):
await actuator_repo.get_history_by_source(DataSource.TEST)
await actuator_repo.cleanup_test_history(older_than_hours=48)
await actuator_repo.count_history_by_source()
```

**API Endpoints (`src/api/v1/sensors.py`):**

```bash
# Sensor-Daten nach Source filtern
GET /api/v1/sensors/data/by-source/mock?limit=50&esp_id=<uuid>

# Statistiken abrufen
GET /api/v1/sensors/data/stats/by-source
# Response: {"production": 1234, "mock": 56, "test": 12, "simulation": 0}
```

### Phase 5: Modulare Integration Tests ✅

**Neue Test-Datei:** `tests/integration/test_modular_esp_integration.py`

```python
from tests.esp32.mocks.mock_esp32_client import MockESP32Client, BrokerMode

class TestModularSensorIntegration:
    def test_add_sensor_and_publish(self):
        mock = MockESP32Client(esp_id="MOCK_MODULAR_001")
        mock.configure_zone("test_zone", "master_zone", "subzone_a")

        mock.set_sensor_value(
            gpio=4, raw_value=23.5, sensor_type="DS18B20",
            name="Boden Temperatur", unit="C", quality="good"
        )

        response = mock.handle_command("sensor_read", {"gpio": 4})
        assert response["data"]["value"] == 23.5

class TestModularActuatorIntegration:
    def test_actuator_with_sensor_feedback(self):
        mock = MockESP32Client(esp_id="MOCK_FEEDBACK")
        mock.configure_actuator(gpio=5, actuator_type="pump", name="Pump")

        response = mock.handle_command("actuator_set", {
            "gpio": 5, "value": 1, "mode": "digital"
        })
        assert response["data"]["state"] is True

class TestDataSourceTracking:
    def test_mock_esp_id_prefix(self):
        # MOCK_, TEST_, SIM_ Prefixes werden erkannt
        mock = MockESP32Client(esp_id="MOCK_TEST_001")
        assert mock.esp_id.startswith("MOCK_")
```

**Test-Kategorien:**
- `TestModularSensorIntegration` - Dynamische Sensor-Erstellung
- `TestModularActuatorIntegration` - PWM, Emergency Stop
- `TestDataSourceTracking` - Prefix-Erkennung
- `TestMessageTracking` - Published Messages prüfen
- `TestZoneConfiguration` - Zone-Config in Payloads

### Phase 6: Test Data Cleanup Service ✅

**AuditRetentionService erweitert (`src/services/audit_retention_service.py`):**

```python
# Retention-Policies:
# TEST: 24 Stunden
# MOCK: 7 Tage
# SIMULATION: 30 Tage
# PRODUCTION: Nie löschen

from src.services.audit_retention_service import AuditRetentionService

service = AuditRetentionService(db_session)

# Sensor-Daten cleanup
result = await service.cleanup_test_sensor_data(
    dry_run=True,  # Preview ohne Löschen
    include_mock=True,
    include_simulation=False
)
# {"deleted_count": 123, "by_source": {"test": 100, "mock": 23}}

# Actuator-History cleanup
result = await service.cleanup_test_actuator_data(dry_run=False)

# Kompletter Cleanup
result = await service.run_full_test_cleanup(
    dry_run=False,
    include_mock=True,
    include_simulation=True
)
```

**Debug API Endpoint (`src/api/v1/debug.py`):**

```bash
# Preview (dry_run=true ist default)
DELETE /api/v1/debug/test-data/cleanup?dry_run=true&include_mock=true

# Tatsächlich löschen
DELETE /api/v1/debug/test-data/cleanup?dry_run=false&include_mock=true&include_simulation=false

# Response:
{
  "success": true,
  "dry_run": false,
  "sensor_data": {"deleted_count": 150, "by_source": {...}},
  "actuator_data": {"deleted_count": 25, "by_source": {...}},
  "total_deleted": 175,
  "message": "Deleted 175 test data records"
}
```

### Zusammenfassung der Änderungen

| Phase | Dateien | Neue Features |
|-------|---------|---------------|
| 3 | `mock_esp32_client.py`, `conftest.py` | BrokerMode, MQTT-Verbindung, Fixtures |
| 4 | `sensor_repo.py`, `actuator_repo.py`, `sensors.py` | data_source Filter, Cleanup-Methoden, API |
| 5 | `test_modular_esp_integration.py` (NEU) | 5 Test-Klassen, 20+ Tests |
| 6 | `audit_retention_service.py`, `debug.py` | Retention-Policies, Cleanup-Endpoint |

---

---

## 10. CI/CD Integration (GitHub Actions)

### Übersicht aller Test-Workflows

| Workflow | Datei | Trigger | Tests | Artifacts |
|----------|-------|---------|-------|-----------|
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR auf ESP32-Pfade | MockESP32 (~100 Tests) | `esp32-test-results` |
| **Server Tests** | `server-tests.yml` | Push/PR auf Server-Pfade | Unit + Integration (~70 Tests) | `unit-test-results`, `integration-test-results` |
| **Wokwi Tests** | `wokwi-tests.yml` | Push/PR auf Firmware-Pfade | ESP32 Firmware Simulation | `wokwi-logs` |
| **PR Checks** | `pr-checks.yml` | Pull Requests | Build-Validierung | - |

### CI Workflow: ESP32 Tests

**Workflow-Datei:** `.github/workflows/esp32-tests.yml`

**Was wird getestet:**
- MockESP32Client Tests
- MQTT Handler Tests
- Service-Layer Tests

**CI-Umgebung:**
```yaml
services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports: [1883:1883]
env:
  MQTT_BROKER_HOST: localhost
  DATABASE_URL: sqlite+aiosqlite:///./test.db
```

### CI Workflow: Server Tests

**Workflow-Datei:** `.github/workflows/server-tests.yml`

**Jobs:**
1. `lint` - Ruff Linter + Black Format-Check
2. `unit-tests` - Unit Tests mit Coverage
3. `integration-tests` - Integration Tests mit Mosquitto
4. `test-summary` - PR-Kommentar mit Ergebnissen

**Coverage Reports:**
- `coverage-unit.xml` (Unit Tests)
- `coverage-integration.xml` (Integration Tests)

### CI Workflow: Wokwi ESP32 Simulation

**Workflow-Datei:** `.github/workflows/wokwi-tests.yml`

**Was wird getestet:**
- ESP32 Boot-Sequenz
- MQTT-Verbindung
- Sensor/Actuator-Initialisierung

**Voraussetzungen:**
- `WOKWI_CLI_TOKEN` Secret im Repository
- Mosquitto als Docker-Service
- Firmware-Build (`wokwi_simulation` Environment)

**Szenarien:**
- `tests/wokwi/boot_test.yaml` - Boot-Sequenz validieren
- `tests/wokwi/mqtt_connection.yaml` - MQTT-Connectivity

### GitHub CLI - Log-Befehle Schnellreferenz

```bash
# ============================================
# WORKFLOW-STATUS PRÜFEN
# ============================================

# Alle Workflows - letzte 5 Runs
gh run list --limit=5

# Spezifischer Workflow
gh run list --workflow=esp32-tests.yml --limit=10
gh run list --workflow=server-tests.yml --limit=10
gh run list --workflow=wokwi-tests.yml --limit=10

# Nur fehlgeschlagene
gh run list --status=failure --limit=10

# ============================================
# LOGS ABRUFEN
# ============================================

# Vollständige Logs (Run-ID aus obiger Liste)
gh run view <run-id> --log

# Nur fehlgeschlagene Jobs
gh run view <run-id> --log-failed

# Live-Logs eines laufenden Workflows
gh run watch <run-id>

# ============================================
# ARTIFACTS HERUNTERLADEN
# ============================================

# Alle Artifacts eines Runs
gh run download <run-id>

# Spezifisches Artifact
gh run download <run-id> --name=esp32-test-results
gh run download <run-id> --name=wokwi-logs

# ============================================
# WORKFLOW MANUELL STARTEN
# ============================================

gh workflow run esp32-tests.yml
gh workflow run server-tests.yml
gh workflow run wokwi-tests.yml
```

### Typischer Debug-Workflow für KI-Agenten

```bash
# 1. Fehlgeschlagenen Run identifizieren
gh run list --workflow=server-tests.yml --status=failure --limit=3

# Beispiel-Output:
# STATUS  TITLE                      WORKFLOW      BRANCH  EVENT  ID
# X       feat: add new sensor       Server Tests  main    push   20703799000

# 2. Fehler-Logs analysieren
gh run view 20703799000 --log-failed

# 3. JUnit XML für Details herunterladen
gh run download 20703799000 --name=unit-test-results
cat junit-unit.xml | grep -A 10 "<failure"

# 4. Spezifischen fehlgeschlagenen Test lokal debuggen
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/test_xyz.py::test_failed_function -xvs
```

### CI vs. Lokal: Umgebungsunterschiede

| Komponente | CI (GitHub Actions) | Lokal (Development) |
|------------|---------------------|---------------------|
| **Python** | 3.11 (fest) | Poetry-Env |
| **Database** | SQLite In-Memory | PostgreSQL oder SQLite |
| **MQTT Broker** | Mosquitto Docker | Optional lokal |
| **Coverage** | XML Reports | HTML Reports |
| **Parallelität** | `-x` (stop on first) | Alle Tests |
| **Timeouts** | 15 min pro Job | Unbegrenzt |

### Wokwi-Simulation Besonderheiten

**WICHTIG:** Wokwi CLI Syntax:
```bash
# KORREKT: Projekt-Verzeichnis als ERSTES Argument
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml

# FALSCH: --scenario vor Projekt-Verzeichnis
wokwi-cli --scenario tests/wokwi/boot_test.yaml .  # FEHLER!
```

**Scenario-YAML Format:**
```yaml
# KORREKT: Nur wait-serial Steps
steps:
  - wait-serial: "WiFi connected"
  - wait-serial: "MQTT connected"

# FALSCH: timeout pro Step (nicht erlaubt!)
steps:
  - wait-serial: "WiFi connected"
    timeout: 30000  # FEHLER!
```

**Timeout wird NUR via CLI gesetzt:** `--timeout 90000`

---

**Letzte Aktualisierung:** 2026-01-05
**Version:** 3.1 (CI/CD Integration dokumentiert)

