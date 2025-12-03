# Test-Workflow für KI-Agenten

> **Zweck:** Test-Ausführung und Auswertung für AutoOne-Projekt  
> **Themengebiet:** Test-Workflows (ESP32 + Server)  
> **Verwandte Dokumente:** `El Servador/docs/ESP32_TESTING.md`, `El Trabajante/test/_archive/README.md`

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

### 1.1 Aktuelles Setup (Stand: 2025-12-03)

**Status:** ✅ **VOLLSTÄNDIG GETESTET & PRODUKTIONSREIF**

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

**Letzte Aktualisierung:** 2025-01  
**Version:** 2.2 (Legacy PlatformIO Tests, verweist auf `/full-test` für empfohlene Tests)

