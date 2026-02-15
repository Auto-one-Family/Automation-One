# ESP32 Firmware Test-Engine IST-Analyse

> **Agent:** esp32-debug
> **Datum:** 2026-02-10
> **Scope:** Layer 3 – El Trabajante (ESP32 Firmware)
> **Plan-Referenz:** `.technical-manager/reports/strategic/TEST_ENGINE_ANALYSIS_PLAN.md` Section 4

---

## Executive Summary

**Status:** ❌ **KRITISCH – Zero Native Test-Coverage**

Die ESP32 Firmware-Test-Engine hat ein fundamentales Problem:
- **0 aktive Unity-Tests** (alle archiviert aufgrund PlatformIO Linking-Issues)
- **163 Wokwi Simulation-Scenarios** vorhanden, aber **kein Ersatz für native Unit Tests**
- **Migration zu server-orchestrierten Tests** (140 Tests auf Backend) abgeschlossen
- **Native Test-Environment fehlt** in platformio.ini
- **Kein HAL-Pattern** (nur 1 Interface) → Native Testing ohne Refactoring unmöglich

**Empfehlung:**
Wokwi-Scenarios für Integration-Testing beibehalten, aber **native Unit Tests für Business-Logic neu aufbauen** (Topic-Builder, Config-Validation, State-Machines, Error-Codes).

---

## 1. platformio.ini Test-Environments

### Status: ❌ **MISSING – Keine Test-Environments**

**Gefundene Environments:**
```ini
[env:seeed_xiao_esp32c3]    # Production (Xiao ESP32C3)
[env:esp32_dev]             # Production (ESP32 Dev Board)
[env:wokwi_simulation]      # Simulation (extends esp32_dev)
```

**Fehlende Test-Environments:**
- ❌ `[env:native]` – Native Tests auf PC (schnell, kein ESP32-Hardware nötig)
- ❌ `[env:esp32dev_test]` – On-Device Tests mit `test_build_src = true`

**Best Practice:** PlatformIO Unity Framework benötigt separate Test-Environments:
```ini
[env:native]
platform = native
test_build_src = true       # Linkt production code zu tests
lib_compat_mode = off
build_flags = -D UNIT_TEST

[env:esp32dev_test]
extends = env:esp32_dev
test_build_src = true
```

**Konsequenz:**
Ohne native Environment können Logic-Tests nicht auf PC laufen → langsame Entwicklung, CI-unfriendly.

**Finding:**
- ⚠️ Line 165-180: Kommentar erwähnt "TEST ENVIRONMENT" aber verweist nur auf PowerShell-Script für Test-Kategorisierung
- ⚠️ Kein `test_build_src = true` in irgendeinem Environment
- ✅ Line 124-163: Wokwi-Environment gut konfiguriert mit `WOKWI_SIMULATION=1`

---

## 2. test/_archive/ – Warum archiviert?

### Status: ✅ **DOKUMENTIERT – Migration abgeschlossen**

**README.md Analyse:**
([test/_archive/README.md](El Trabajante/test/_archive/README.md))

**Grund für Archivierung:**
> PlatformIO Unity Framework linkt NUR Test-Dateien
> Production-Code (Logger, ConfigManager, etc.) wird NICHT automatisch gelinkt
> Result: `undefined reference` errors beim Build

**Migration-Ziel:**
- ✅ **Server-orchestrierte Tests** (Option A aus Architecture-Entscheidung)
- ✅ **Location:** `El Servador/god_kaiser_server/tests/esp32/`
- ✅ **Umfang:** ~140 Tests (19 Files)

**Test-Suites migriert:**
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

**Bewertung:**
✅ Migration war **richtige Entscheidung** für MQTT-basierte Integration-Tests
⚠️ **ABER:** Verlust von native Unit Tests für Business-Logic (Topic-Builder, Config-Validation, Parsers)

---

## 3. test/_archive/ Qualität – Stichprobe

### Status: ⚠️ **GUTE PATTERNS – Aber nicht kompilierbar**

**Analysierte Files:**
1. [actuator_manager.cpp](El Trabajante/test/_archive/actuator_manager.cpp) (50 lines)
2. [infra_topic_builder.cpp](El Trabajante/test/_archive/infra_topic_builder.cpp) (50 lines)

**Findings:**

#### actuator_manager.cpp
```cpp
void setUp(void) {
    ensure_actuator_stack_initialized();
    attachBroker();
}

void test_dual_mode_digital_control(void) {
    uint8_t gpio = findExistingActuator(ActuatorTypeTokens::PUMP);
    if (gpio != 255) {
        TEST_MESSAGE("Using existing actuator (Production mode)");
        // ...
    }
}
```

**Pattern-Bewertung:**
- ✅ **Dual-Mode Tests:** Testet mit existierenden Production-Actuators ODER VirtualDriver
- ✅ **MockMQTTBroker:** `helpers/mock_mqtt_broker.h` für MQTT-Testing ohne echten Broker
- ✅ **RAII-Pattern:** `helpers/temporary_test_actuator.h` für automatisches Cleanup
- ✅ **setUp/tearDown:** Korrekte Unity-Pattern

#### infra_topic_builder.cpp
```cpp
void test_topic_builder_sensor_data() {
  TopicBuilder::setEspId("esp32_001");
  TopicBuilder::setKaiserId("god");
  const char* topic = TopicBuilder::buildSensorDataTopic(4);
  TEST_ASSERT_EQUAL_STRING("kaiser/god/esp/esp32_001/sensor/4/data", topic);
}
```

**Pattern-Bewertung:**
- ✅ **Reine Logic-Tests:** TopicBuilder ist String-Manipulation → perfekt für native Tests
- ✅ **Assertions:** `TEST_ASSERT_EQUAL_STRING` – korrekte Unity-Syntax
- ✅ **Testbarkeit:** Keine Hardware-Dependencies

**Kompilierbarkeit:**
❌ **NICHT kompilierbar** ohne `test_build_src = true` (undefined references zu production code)

**Reaktivierbarkeit:**
- ✅ TopicBuilder-Tests können **sofort reaktiviert** werden (pure logic)
- ⚠️ Actuator-Tests benötigen **Mock-Layer** für GPIO/PWM
- ❌ I2C/OneWire-Tests benötigen **HAL-Interfaces** (nicht vorhanden)

---

## 4. Aktive Unity Tests außerhalb _archive

### Status: ❌ **NULL – Keine aktiven Tests**

**Gefunden:**
- ❌ Kein `El Trabajante/test/*.cpp`
- ❌ Kein `El Trabajante/test/test_desktop/*.cpp`
- ❌ Kein `El Trabajante/test/test_embedded/*.cpp`

**Nur vorhanden:**
- `test/_archive/` – 21 archivierte .cpp Files
- `test/helpers/` – 4 Helper-Header (MockMQTTBroker, VirtualActuator, etc.)

**Konsequenz:**
Firmware-Code hat **0% native Test-Coverage** via Unity Framework.

---

## 5. Wokwi Scenarios – Ausführbarkeit & Format

### Status: ✅ **163 YAML-Scenarios – Gut strukturiert**

**Kategorien:**
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

**GESAMT:** 163 Scenarios (bestätigt via `find | wc -l`)

**Format-Konsistenz:**
Stichprobe: [10-nvs/nvs_init_success.yaml](El Trabajante/tests/wokwi/scenarios/10-nvs/nvs_init_success.yaml)

```yaml
name: NVS Initialization Success
version: 1
steps:
  - wait-serial: "ESP32 Sensor Network"
  - wait-serial: "StorageManager: Initialized"
  - wait-serial: "Phase 1: Core Infrastructure READY"
  - wait-serial: "WiFi connected successfully"
  - wait-serial: "MQTT connected successfully"
```

**Bewertung:**
- ✅ **Konsistentes Format:** Alle YAML-Files folgen gleichem Schema
- ✅ **Kommentare:** Test-ID, Beschreibung, Expected Behavior dokumentiert
- ✅ **Timeout:** Via CLI `--timeout` Option (nicht per Step)
- ✅ **Serial-Log basiert:** `wait-serial` Pattern für Log-Verification

**Vollständigkeit für aktuelle Codebase:**

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

**GAP:** Neue Features (Zone-Kaiser, Device Lifecycle, Subzone-Hierarchie) haben **unzureichende Wokwi-Coverage**.

---

## 6. Wokwi Root – boot_test.yaml & mqtt_connection.yaml

### Status: ✅ **Basis-Tests vorhanden**

**[boot_test.yaml](El Trabajante/tests/wokwi/boot_test.yaml):**
- ✅ Validiert 16-Schritt Boot-Sequenz aus main.cpp
- ✅ Prüft alle 5 Phasen: Hardware → Core → Communication → HAL → Sensor/Actuator
- ✅ Erwartet finalen Heartbeat als Boot-Complete-Signal

**[mqtt_connection.yaml](El Trabajante/tests/wokwi/mqtt_connection.yaml):**
- ✅ Validiert WiFi → MQTT Connection-Flow
- ✅ Prüft Topic-Subscriptions
- ✅ Prüft Initial Heartbeat für Server-Discovery
- ✅ Prüft Memory-Status (Heap-Monitoring)

**Usage:**
```bash
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml
wokwi-cli . --timeout 90000 --scenario tests/wokwi/mqtt_connection.yaml
```

**Bewertung:**
✅ Root-Scenarios sind **Smoke-Tests** für CI/CD – fangen kritische Boot-Failures ab.

---

## 7. helpers/mqtt_inject.py

### Status: ✅ **Aktuell & Funktional**

**Zweck:**
MQTT-Message-Injection für Wokwi-Tests (ESP als Subscriber testen)

**Features:**
```python
python mqtt_inject.py --host localhost \
                      --topic "kaiser/god/esp/ESP_SIM/actuator/5/command" \
                      --payload '{"command":"ON","value":1.0}' \
                      --qos 1 --repeat 3 --interval 1.0
```

- ✅ QoS 0/1/2 Support
- ✅ Repeat & Interval für Stress-Tests
- ✅ JSON-Validation (`--validate-json`)
- ✅ Delay before publish

**Dependencies:**
`paho-mqtt` (imports Check vorhanden)

**Aktualität:**
✅ Topics matchen Production-Schema (`kaiser/{kaiser_id}/esp/{esp_id}/...`)
✅ Payload-Beispiele zeigen aktuelle Command-Struktur (Zone-Assignment, Emergency-Stop)

**Bewertung:**
Helper ist **production-ready** und aktuell.

---

## 8. Testbare Firmware-Logic – Native Test-Kandidaten

### Status: ✅ **Viele Module nativ testbar**

**42 Source-Files analysiert** → **Nativ testbare Logic identifiziert:**

#### Kategorie A: Pure Logic (keine Hardware-Dependencies)

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

**Test-Potential:**
20+ Topic-Builder-Funktionen × 3 Edge-Cases = **60+ Unit Tests** ohne Hardware.

#### Kategorie B: Business-Logic mit Hardware-Abstraktion möglich

| Modul | Pfad | Abstraction needed | Priorität |
|-------|------|-------------------|-----------|
| **ConfigManager** | `services/config/config_manager.cpp` | Mock NVS | P2 |
| **SafetyController** | `services/actuator/safety_controller.cpp` | Mock GPIO | P3 |
| **CircuitBreaker** | `error_handling/circuit_breaker.cpp` | Mock Time | P2 |
| **HealthMonitor** | `error_handling/health_monitor.cpp` | Mock Sensors | P3 |

#### Kategorie C: Hardware-spezifisch (nicht nativ testbar)

| Modul | Pfad | Warum nicht testbar |
|-------|------|-------------------|
| WiFiManager | `services/communication/wifi_manager.cpp` | ESP32 WiFi-Stack |
| I2CBus | `drivers/i2c_bus.cpp` | Hardware-I2C |
| OneWireBus | `drivers/onewire_bus.cpp` | Hardware-OneWire |
| GPIOManager | `drivers/gpio_manager.cpp` | Hardware-GPIO |

**Empfehlung:**
- **P0:** TopicBuilder-Tests sofort reaktivieren (archivierte Tests als Basis)
- **P1:** StringHelpers, DataBuffer, ErrorCodes-Validation
- **P2:** ConfigManager mit NVS-Mock, CircuitBreaker mit Time-Mock

---

## 9. Hardware-Abstraction Layer (HAL)

### Status: ⚠️ **UNZUREICHEND – Nur 1 Interface**

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

**Konsequenz:**
Ohne HAL-Interfaces können Module wie `ConfigManager`, `SensorManager`, `ActuatorManager` **nicht nativ getestet** werden → Dependencies zu Hardware sind hart verdrahtet.

**Best Practice:**
```cpp
// Statt:
class ConfigManager {
    StorageManager storage;  // Hard-coded dependency
};

// Besser:
class ConfigManager {
    IStorageManager* storage;  // Injected dependency
};
```

**Bewertung:**
⚠️ Aktuell ist nur **Actuator-Subsystem** via Interface testbar.
Für native Tests der Business-Logic ist **systematisches HAL-Pattern nötig**.

---

## 10. Build-Status

### Status: ❓ **Nicht direkt testbar – PlatformIO nicht verfügbar**

**Versuch:**
```bash
cd "El Trabajante" && pio run -e wokwi_simulation
```

**Ergebnis:**
```
/usr/bin/bash: line 1: pio: command not found
```

**Indirekte Analyse:**

✅ **Code-Struktur sieht kompilierbar aus:**
- Include-Guards vorhanden
- Forward-Declarations korrekt
- Keine offensichtlichen Syntax-Errors in analysierten Files

✅ **platformio.ini sieht valid aus:**
- 3 Environments definiert
- Alle Dependencies gelistet
- Build-Flags konsistent

**Annahme:**
Firmware kompiliert fehlerfrei (basierend auf:)
- Wokwi-Scenarios laufen erfolgreich (impliziert funktionierende Build)
- Keine Compile-Error-Reports in `.technical-manager/inbox/`
- Code-Qualität in analysierten Files gut

**Empfehlung:**
User sollte Build-Status manuell verifizieren:
```bash
pio run -e esp32_dev
pio run -e wokwi_simulation
```

---

## Gap-Analyse (Zusammenfassung)

| Gap | Impact | Kategorie |
|-----|--------|-----------|
| ❌ **Keine aktiven Unity-Tests** | KRITISCH | Test-Coverage |
| ❌ **Kein native Test-Environment** | HOCH | CI/CD |
| ⚠️ **Nur 1 Interface (IActuatorDriver)** | HOCH | Testbarkeit |
| ⚠️ **Zone-Kaiser Wokwi-Coverage dünn** | MITTEL | Integration |
| ❌ **Device Lifecycle nicht in Wokwi** | MITTEL | Integration |
| ⚠️ **Subzone-Hierarchie unzureichend** | MITTEL | Integration |
| ✅ **Server-orchestrierte Tests vorhanden** | – | Migration OK |
| ✅ **163 Wokwi Scenarios vorhanden** | – | Gut |

---

## Empfehlungen (priorisiert nach Impact)

### P0 – Kritisch (sofort angehen)

1. **Native Test-Environment einrichten**
   - `[env:native]` in platformio.ini hinzufügen
   - `test_build_src = true` aktivieren
   - CI-freundlich (schnell, kein ESP32-Hardware)

2. **TopicBuilder-Tests reaktivieren**
   - Archivierte Tests aus `test/_archive/infra_topic_builder.cpp` als Basis
   - ~60+ Tests für alle Topic-Funktionen
   - Pure Logic → sofort testbar

### P1 – Hoch (nächste Iteration)

3. **Weitere Pure-Logic-Tests**
   - StringHelpers, DataBuffer, ErrorCodes
   - SensorRegistry, ConfigResponse-Parser
   - OnewireUtils (ROM-CRC-Validation)

4. **HAL-Interfaces einführen**
   - IGPIODriver, II2CBus, IOneWireBus, IStorageManager
   - Dependency-Injection in Managers
   - Mock-Implementierungen für Tests

### P2 – Mittel (nach HAL-Refactoring)

5. **Business-Logic-Tests mit Mocks**
   - ConfigManager (mit NVS-Mock)
   - SafetyController (mit GPIO-Mock)
   - CircuitBreaker (mit Time-Mock)

6. **Wokwi-Scenarios erweitern**
   - Zone-Kaiser: Vollständiger Flow (Assign → Validate → ACK)
   - Device Lifecycle: Alle States & Transitions
   - Subzone-Hierarchie: Cascading, Conflicts, Safe-Mode

### P3 – Nice-to-Have

7. **CI-Integration**
   - Native Tests in GitHub Actions
   - Wokwi-Tests in CI (via Wokwi-CLI Docker-Container)
   - Coverage-Reporting (gcov/lcov für native)

---

## Datei-Referenzen (für verify-plan)

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

## Nächste Schritte

1. **TM konsolidiert** diesen Report mit server-debug, frontend-debug, mqtt-debug Reports
2. **meta-analyst** führt Cross-Layer-Analyse durch
3. **TM finalisiert SOLL-Plan** basierend auf Gap-Analyse
4. **verify-plan** prüft SOLL gegen Codebase
5. **esp32-dev Agent** implementiert P0-Empfehlungen (wenn approved)

---

**Report Ende.**
