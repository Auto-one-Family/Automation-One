# ESP32 Native Unit Tests - Implementierungsplan

## Executive Summary

Integration von nativen Unit Tests für ESP32-Firmware (El Trabajante) im AutomationOne-Projekt. **Ziel:** 132 archivierte Unity-Tests strukturiert reaktivieren und nachhaltige Test-Infrastruktur ohne Hardware-Abhängigkeit etablieren.

**Projektstatus:**
- 21 archivierte Test-Dateien in `El Trabajante/test/_archive/` (nicht kompilierbar, PlatformIO Linker-Probleme)
- Unity Framework NICHT vorhanden - muss zu lib_deps hinzugefügt werden
- Keine aktive Test-Konfiguration in `platformio.ini`
- 163 Wokwi-Szenarien aktiv (13 Kategorien, siehe `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`)
- 115 Server pytest-Tests produktiv (siehe `.claude/reference/testing/TEST_WORKFLOW.md`)

**Strategische Ziele:**
1. **Phase 1 (Foundation):** 57 Tests OHNE Production-Code-Änderungen + Unity Framework Integration
2. **Phase 2 (HAL-Design):** 90 Tests mit Dependency Injection + HAL-Interfaces
3. **Phase 3 (CI-Integration):** Automatisierte Tests in GitHub Actions

**Bekannte Hindernisse (aus TEST_WORKFLOW.md):**
- PlatformIO Unity Tests wurden wegen "Linker-Problemen" archiviert
- Phase 1 muss Linker-Strategie klären (test_build_src vs. separate Builds)

**Erfolgsmetriken:**
- Phase 1: 50+ Tests reaktiviert (sofort lauffähig)
- Phase 2: 100+ Tests mit Mocks
- Phase 3: CI grün mit Coverage-Reporting >70%
- Rückwärtskompatibilität zu allen 3 bestehenden Environments

---

## Context

### Warum native Unit Tests?

**Bestehende Lücken:**
- **Wokwi-Tests:** Functional Testing, aber langsam (~90 Min CI), limitierte Coverage
- **Server-Tests:** Testen nur MQTT-Schnittstelle, nicht Firmware-Interna
- **Keine Unit Tests:** 0% Code-Coverage für Pure-Logic-Module (TopicBuilder, OneWireUtils, etc.)

**Vorteile nativer Tests:**
- **Schnell:** ~2-5 Sekunden für 50+ Tests
- **Hardware-unabhängig:** Auf jedem Entwickler-PC lauffähig
- **Granular:** Einzelne Funktionen testbar
- **CI-freundlich:** Parallele Ausführung, schnelles Feedback

### Architektur-Übersicht

```
Test-Pyramide (nach Implementierung):

┌─────────────────────────────────────┐
│  Server E2E Tests (pytest)          │  19 Tests
│  ↑ MockESP32Client                  │
└─────────────────────────────────────┘
           ↑
┌─────────────────────────────────────┐
│  Wokwi Simulation                   │  165 Szenarien
│  ↑ Echte Firmware, virtuelle HW     │
└─────────────────────────────────────┘
           ↑
┌─────────────────────────────────────┐
│  Native Unit Tests (NEU)            │  147 Tests geplant
│  ↑ Pure Logic + HAL-Mocks           │  (57 Phase 1 + 90 Phase 2)
└─────────────────────────────────────┘
```

**Test-Pattern:**
- **Pattern A:** Pure Logic (TopicBuilder, OneWireUtils) - 57 Tests Phase 1
- **Pattern B/C/E:** Manager mit HAL-Mocks (SensorManager, ConfigManager) - 90 Tests Phase 2

---

## Phase 1: Foundation (Sofort lauffähig - KEINE Code-Änderungen)

### Ziele

✅ Native Test-Environment konfigurieren (`[env:native]` in platformio.ini)
✅ 23 Pattern-A-Tests reaktivieren (aus `_archive/`)
✅ 34 neue Pattern-A-Tests schreiben (Pure-Logic-Module)
✅ `pio test -e native` funktionsfähig
✅ CI-Proof-of-Concept

**Kritischer Constraint:** KEINE Änderungen an Production-Code (`src/`), nur Test-Setup!

### Dateien zu erstellen/ändern

#### 1. platformio.ini - Neue Environments

**Datei:** `El Trabajante/platformio.ini`

**Änderung:** Am Ende anfügen (nach `[env:wokwi_simulation]`)

```ini
; =============================================================================
; NATIVE TEST ENVIRONMENT - x86_64 Host (KEINE Hardware)
; =============================================================================
; Purpose: Unit tests für Pure-Logic-Module ohne Hardware-Dependencies
;
; Usage:
;   pio test -e native                    # Alle nativen Tests
;   pio test -e native -f test_topic_*    # Nur TopicBuilder
;   pio test -e native -v                 # Verbose

[env:native]
platform = native
build_flags =
    -std=c++17
    ; Test-Mode aktivieren
    -DNATIVE_TEST=1
    -DUNIT_TEST=1

    ; Disable Hardware
    -DESP_PLATFORM=0
    -DARDUINO=0

    ; Mock-Konfiguration
    -DMOCK_ARDUINO=1

    ; Konstanten für Tests
    -DMAX_SENSORS=20
    -DMAX_ACTUATORS=12
    -DMQTT_MAX_PACKET_SIZE=2048

    ; Include-Paths
    -I src/
    -I test/mocks/

; Test-Konfiguration
test_framework = unity
test_build_src = yes           ; Production-Code mit Tests kompilieren
test_ignore =
    test/esp32_hardware/*       ; Hardware-Tests überspringen
    test/integration/*
    test/_archive/*

; Welche Tests ausführen
test_filter =
    test/unit/infra/*
    test/unit/utils/*
    test/unit/models/*

; =============================================================================
; ESP32 HARDWARE TEST ENVIRONMENT - Unity auf ESP32 (optional)
; =============================================================================

[env:esp32dev_test]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200

build_flags =
    ${env:esp32_dev.build_flags}
    -DUNIT_TEST=1
    -DESP32_HARDWARE_TEST=1

test_framework = unity
test_build_src = yes
test_ignore =
    test/unit/native_only/*
    test/_archive/*

lib_deps =
    ${env:esp32_dev.lib_deps}
```

**KRITISCHE ERGÄNZUNG:**
Unity Framework muss in **[env:esp32_dev] lib_deps** hinzugefügt werden:
```ini
; In [env:esp32_dev] HINZUFÜGEN:
lib_deps =
    ; ... bestehende libs ...
    throwtheswitch/Unity@^2.6.0  ; NEU: Test Framework für Phase 1
```

**Warum so?**
- `test_build_src = yes`: Production-Code wird mit Tests kompiliert (PlatformIO-Standard)
- `test_ignore`: Archiv und Hardware-Tests getrennt
- `test_filter`: Nur spezifische Kategorien für native
- Unity muss in esp32_dev sein damit ${env:esp32_dev.lib_deps} es erbt

#### 2. Test-Ordnerstruktur

**Neue Struktur:**

```
El Trabajante/
├── test/
│   ├── _archive/                      # UNVERÄNDERT (132 alte Tests)
│   │
│   ├── mocks/                         # NEU: Mock-Implementierungen
│   │   ├── Arduino.h                  # Arduino-API-Mock (String, millis)
│   │   ├── mock_arduino.cpp           # String-Implementierung
│   │   └── README.md
│   │
│   ├── helpers/                       # NEU: Test-Utilities (Phase 1: basic, Phase 2: Manager-Helper)
│   │   └── test_helpers.h             # Phase 1: Allgemeine Utilities
│   │
│   └── unit/                          # NEU: Kategorisierte Tests
│       ├── infra/                     # Infrastructure Tests
│       │   ├── test_topic_builder.cpp       # 12 Tests
│       │   ├── test_logger.cpp              # 5 Tests
│       │   ├── test_error_tracker.cpp       # 3 Tests
│       │   └── test_config_manager.cpp      # 3 Tests
│       │
│       ├── utils/                     # Utility Tests
│       │   ├── test_onewire_utils.cpp       # 8 Tests (NEU)
│       │   ├── test_string_helpers.cpp      # 6 Tests (NEU)
│       │   └── test_data_buffer.cpp         # 4 Tests (NEU)
│       │
│       └── models/                    # Model Tests
│           ├── test_actuator_models.cpp     # 3 Tests
│           ├── test_sensor_registry.cpp     # 8 Tests (NEU)
│           └── test_error_codes.cpp         # 5 Tests (NEU)
```

**Gesamt Phase 1:** 10 Test-Dateien, 57 Tests

#### 3. Arduino-Mock (Minimal)

**Datei:** `test/mocks/Arduino.h` (NEU)

```cpp
#ifndef MOCK_ARDUINO_H
#define MOCK_ARDUINO_H

#ifdef NATIVE_TEST

#include <cstdint>
#include <cstring>
#include <string>

// Arduino String-Klasse Mock
class String {
public:
    String() : data_("") {}
    String(const char* str) : data_(str ? str : "") {}
    String(int val);
    String(float val);

    const char* c_str() const { return data_.c_str(); }
    size_t length() const { return data_.length(); }

    bool operator==(const String& other) const { return data_ == other.data_; }
    bool operator==(const char* other) const { return data_ == other; }
    String operator+(const String& other) const {
        return String((data_ + other.data_).c_str());
    }

private:
    std::string data_;
};

// Mock-Funktionen
inline unsigned long millis() { return 0; }
inline void delay(unsigned long ms) { (void)ms; }

// Serial Mock (no-op)
class SerialMock {
public:
    void begin(unsigned long baud) { (void)baud; }
    void println(const char* str) { (void)str; }
};
extern SerialMock Serial;

#endif // NATIVE_TEST
#endif // MOCK_ARDUINO_H
```

**Datei:** `test/mocks/mock_arduino.cpp` (NEU)

```cpp
#ifdef NATIVE_TEST

#include "Arduino.h"
#include <sstream>
#include <iomanip>

String::String(int val) {
    std::ostringstream oss;
    oss << val;
    data_ = oss.str();
}

String::String(float val) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2) << val;
    data_ = oss.str();
}

SerialMock Serial;

#endif // NATIVE_TEST
```

**Warum so minimal?**
- TopicBuilder braucht nur `String` und `snprintf` (C-Standard)
- Keine GPIO/I2C/OneWire in Phase 1 nötig

#### 4. Erster Test: TopicBuilder

**Datei:** `test/unit/infra/test_topic_builder.cpp` (NEU, reaktiviert aus `_archive/infra_topic_builder.cpp`)

```cpp
#include <unity.h>

#ifdef NATIVE_TEST
    #include "Arduino.h"  // Mock
#else
    #include <Arduino.h>  // Echte Arduino-API
#endif

#include "utils/topic_builder.h"

void setUp(void) {
    // Setup vor jedem Test
}

void tearDown(void) {
    // Cleanup nach jedem Test
}

void test_topic_builder_sensor_data() {
    TopicBuilder::setEspId("esp32_001");
    TopicBuilder::setKaiserId("god");

    const char* topic = TopicBuilder::buildSensorDataTopic(4);
    TEST_ASSERT_EQUAL_STRING("kaiser/god/esp/esp32_001/sensor/4/data", topic);
}

void test_topic_builder_sensor_batch() {
    TopicBuilder::setEspId("esp32_002");
    TopicBuilder::setKaiserId("god");

    const char* topic = TopicBuilder::buildSensorBatchTopic();
    TEST_ASSERT_EQUAL_STRING("kaiser/god/esp/esp32_002/sensor/batch", topic);
}

void test_topic_builder_actuator_command() {
    TopicBuilder::setEspId("esp32_001");
    TopicBuilder::setKaiserId("god");

    const char* topic = TopicBuilder::buildActuatorCommandTopic(21);
    TEST_ASSERT_EQUAL_STRING("kaiser/god/esp/esp32_001/actuator/21/command", topic);
}

void test_topic_builder_system_heartbeat() {
    TopicBuilder::setEspId("esp32_003");
    TopicBuilder::setKaiserId("god");

    const char* topic = TopicBuilder::buildSystemHeartbeatTopic();
    TEST_ASSERT_EQUAL_STRING("kaiser/god/esp/esp32_003/system/heartbeat", topic);
}

void test_topic_builder_broadcast_emergency() {
    TopicBuilder::setKaiserId("god");

    const char* topic = TopicBuilder::buildBroadcastEmergencyTopic();
    TEST_ASSERT_EQUAL_STRING("kaiser/god/broadcast/emergency", topic);
}

// ... weitere 7 Tests aus _archive/infra_topic_builder.cpp

void setup() {
    delay(2000);  // ESP32: Wait for serial, Native: no-op
    UNITY_BEGIN();

    RUN_TEST(test_topic_builder_sensor_data);
    RUN_TEST(test_topic_builder_sensor_batch);
    RUN_TEST(test_topic_builder_actuator_command);
    RUN_TEST(test_topic_builder_system_heartbeat);
    RUN_TEST(test_topic_builder_broadcast_emergency);
    // ... weitere Tests registrieren

    UNITY_END();
}

void loop() {}
```

**Test-Strategie:**
- 12 Tests für alle Topic-Pattern (sensor/actuator/system/config/broadcast)
- Parameter-Validierung (IDs, GPIO-Nummern)
- Format-Konsistenz ("kaiser/{id}/esp/{id}/...")

#### 5. Weitere Tests (Struktur identisch)

**Sofort reaktivierbar (aus `_archive/`):**
- `test_actuator_models.cpp` - 3 Tests (Value-Validierung)
- `test_logger.cpp` - 5 Tests (Circular Buffer)
- `test_error_tracker.cpp` - 3 Tests (Error Reporting)
- `test_config_manager.cpp` - 3 Tests (Init, Validation) - braucht NVS-Mock (minimal)

**Neu zu schreiben:**
- `test_onewire_utils.cpp` - 8 Tests (ROM-Konversion, CRC8-Validation) - Basis: `src/utils/onewire_utils.h` (EXISTIERT)
- `test_sensor_registry.cpp` - 8 Tests (Lookup-Tabellen, Type-Mapping)
- `test_string_helpers.cpp` - 6 Tests (Trim, Split, etc.)
- `test_data_buffer.cpp` - 4 Tests (Ring-Buffer)
- `test_error_codes.cpp` - 5 Tests (Error-Code-Mapping)

**Archiv-Dateien (IST-Zustand):**
21 .cpp Dateien in `test/_archive/` vorhanden (nicht 132 "Tests" - das ist die Anzahl der Test-Cases):
- infra_topic_builder.cpp (KANN reaktiviert werden)
- actuator_models.cpp, infra_logger.cpp, infra_error_tracker.cpp, infra_config_manager.cpp
- actuator_manager.cpp, sensor_manager.cpp (NICHT für Phase 1 - brauchen HAL-Mocks)
- comm_mqtt_client.cpp, comm_wifi_manager.cpp (NICHT für Phase 1 - Hardware-abhängig)
- integration_*.cpp (NICHT für Phase 1 - brauchen komplettes System)

### Verifikation Phase 1

```bash
cd "El Trabajante"

# 1. Native Tests bauen und ausführen
pio test -e native --verbose

# Erwartetes Ergebnis:
# - 57 Tests PASSED
# - 0 Tests FAILED
# - Laufzeit: ~2-5 Sekunden

# 2. Spezifische Test-Suite
pio test -e native -f test_topic_builder

# 3. Bestehende Environments unverändert
pio run -e esp32_dev           # Muss weiterhin bauen
pio run -e wokwi_simulation    # Muss weiterhin bauen
```

**Akzeptanzkriterien Phase 1:**
- ✅ `pio test -e native` läuft ohne Fehler
- ✅ Mindestens 50 Tests grün
- ✅ `pio run -e esp32_dev` baut unverändert
- ✅ `pio run -e wokwi_simulation` baut unverändert
- ✅ Keine Breaking Changes in Production-Code

### Risiken Phase 1

| Risiko | Mitigation |
|--------|------------|
| Arduino-Mock unvollständig | Inkrementell erweitern, nur genutzte Features |
| PlatformIO Linker-Fehler | Guards `#ifndef UNIT_TEST` in src/ falls nötig |
| String-Inkompatibilität | std::string Wrapper, nur benötigte Methoden |

### Aufwand Phase 1: ~20h

---

## Phase 2: HAL-Design (Friend-Helper-Pattern für Singleton-Tests)

### Ziele

✅ HAL-Interfaces für Hardware-Abstraktion definieren (6 Interfaces)
✅ Manager-Klassen mit **Friend-Helper-Pattern** testbar machen (NICHT Constructor-DI!)
✅ Mock-basierte Tests für Business-Logic (Pattern E)
✅ 90 zusätzliche Tests reaktivieren

**Constraint:** Production-Code-Änderungen ERLAUBT, aber rückwärtskompatibel

**Architektur-Entscheidung:**
- **KEIN Constructor-DI** - alle Manager sind Singletons (privater Constructor)
- **Friend-Helper-Pattern nutzen** - analog zu `ActuatorManagerTestHelper` (existiert bereits)
- **Singleton-Pattern bleibt intakt** - keine Breaking Changes

### HAL-Interface-Architektur

#### Bestehende Vorlage: IActuatorDriver

```cpp
// src/services/actuator/actuator_drivers/iactuator_driver.h (EXISTIERT)
class IActuatorDriver {
public:
    virtual ~IActuatorDriver() = default;

    virtual bool begin(const ActuatorConfig& config) = 0;
    virtual void end() = 0;
    virtual bool isInitialized() const = 0;
    virtual bool setValue(float normalized_value) = 0;
    virtual bool setBinary(bool state) = 0;
    virtual bool emergencyStop(const String& reason) = 0;
    virtual bool clearEmergency() = 0;
    virtual void loop() = 0;
    virtual ActuatorStatus getStatus() const = 0;
    virtual const ActuatorConfig& getConfig() const = 0;
    virtual String getType() const = 0;
};
```

**Pattern:** Pure Virtual, Factory-Instanziierung, Lifecycle-Methoden

#### Neue Interfaces (6x)

**1. IGPIOHal** - `src/drivers/hal/igpio_hal.h` (NEU)

```cpp
enum class GPIOMode : uint8_t {
    INPUT = 0x01,
    OUTPUT = 0x02,
    INPUT_PULLUP = 0x05,
    INPUT_PULLDOWN = 0x09
};

class IGPIOHal {
public:
    virtual ~IGPIOHal() = default;

    virtual bool pinMode(uint8_t pin, GPIOMode mode) = 0;
    virtual bool digitalWrite(uint8_t pin, bool value) = 0;
    virtual bool digitalRead(uint8_t pin) = 0;
    virtual uint16_t analogRead(uint8_t pin) = 0;
    virtual bool isPinAvailable(uint8_t pin) const = 0;
    virtual bool reservePin(uint8_t pin, const String& owner) = 0;
    virtual bool releasePin(uint8_t pin) = 0;
    virtual void initializeAllPinsToSafeMode() = 0;
};
```

**2. IHALI2C** - `src/drivers/hal/ihali2c.h` (NEU)

```cpp
class IHALI2C {
public:
    virtual ~IHALI2C() = default;

    virtual bool begin(uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency = 100000) = 0;
    virtual void end() = 0;
    virtual bool isInitialized() const = 0;
    virtual bool deviceExists(uint8_t address) = 0;
    virtual bool writeBytes(uint8_t address, const uint8_t* data, size_t length) = 0;
    virtual bool readBytes(uint8_t address, uint8_t* buffer, size_t length) = 0;
    virtual bool writeRegister(uint8_t address, uint8_t reg, uint8_t value) = 0;
    virtual uint8_t readRegister(uint8_t address, uint8_t reg) = 0;
    virtual bool recoverBus() = 0;
};
```

**3. IHALOneWire** - `src/drivers/hal/ihal_onewire.h` (NEU)
**4. IHALNVStorage** - `src/drivers/hal/ihal_nvstorage.h` (NEU)
**5. IHALTime** - `src/drivers/hal/ihal_time.h` (NEU)

(Vollständige Signaturen siehe Agent-Report)

#### Produktions-Wrapper

**ESP32GPIOHal** - `src/drivers/hal/esp32_gpio_hal.h` (NEU)

```cpp
#include "igpio_hal.h"
#include "../gpio/gpio_manager.h"

class ESP32GPIOHal : public IGPIOHal {
public:
    ESP32GPIOHal() : gpio_manager_(&GPIOManager::getInstance()) {}

    bool pinMode(uint8_t pin, GPIOMode mode) override {
        ::pinMode(pin, static_cast<uint8_t>(mode));
        return true;
    }

    bool digitalWrite(uint8_t pin, bool value) override {
        ::digitalWrite(pin, value ? HIGH : LOW);
        return true;
    }

    // ... weitere Methoden (pure Delegation)

private:
    GPIOManager* gpio_manager_;
};
```

**Pattern:** Thin Wrapper, keine Business-Logic, nur Delegation

#### Mock-Implementierungen

**MockGPIOHal** - `test/mocks/mock_gpio_hal.h` (NEU)

```cpp
class MockGPIOHal : public IGPIOHal {
public:
    void reset() {
        pin_modes_.clear();
        pin_values_.clear();
        reserved_pins_.clear();
    }

    bool pinMode(uint8_t pin, GPIOMode mode) override {
        pin_modes_[pin] = mode;
        return true;
    }

    bool digitalWrite(uint8_t pin, bool value) override {
        pin_values_[pin] = value;
        return true;
    }

    // ... weitere Methoden + Test-Helper

    GPIOMode getPinMode(uint8_t pin) const { return pin_modes_[pin]; }
    bool wasSafeModeInitialized() const { return safe_mode_called_; }

private:
    std::map<uint8_t, GPIOMode> pin_modes_;
    std::map<uint8_t, bool> pin_values_;
    std::map<uint8_t, std::string> reserved_pins_;
    bool safe_mode_called_;
};
```

**Ähnlich:** `MockI2CHal`, `MockOneWireHal`, `MockNVStorageHal`, `MockTimeHal`

---

### Manager-Refactoring (Friend-Helper-Pattern)

#### Bestehende Vorlage: ActuatorManagerTestHelper

**IST-Zustand:** `src/services/actuator/actuator_manager.h` (Zeile 61)

```cpp
class ActuatorManager {
public:
  static ActuatorManager& getInstance();
  // ... Singleton-Pattern mit privatem Constructor

private:
  friend class ActuatorManagerTestHelper;  // ← EXISTIERT BEREITS!
  // ... private Members
};
```

**Pattern:** Singleton bleibt, Test-Helper erhält friend-Zugriff für Mock-Injection

---

#### Neue Test-Helper (in `test/helpers/`)

**1. SensorManagerTestHelper** - `test/helpers/sensor_manager_test_helper.h` (NEU)

```cpp
#ifndef TEST_HELPERS_SENSOR_MANAGER_TEST_HELPER_H
#define TEST_HELPERS_SENSOR_MANAGER_TEST_HELPER_H

#include "services/sensor/sensor_manager.h"
#include "drivers/hal/igpio_hal.h"
#include "drivers/hal/ihali2c.h"
#include "drivers/hal/ihal_onewire.h"

// Test-Helper für Singleton-Manipulation
class SensorManagerTestHelper {
public:
    // Mock-Injection für Tests
    static void injectMocks(
        SensorManager& mgr,
        IGPIOHal* gpio_hal,
        IHALI2C* i2c_hal,
        IHALOneWire* onewire_hal
    ) {
        // Direkter Zugriff via friend
        mgr.gpio_hal_ = gpio_hal;
        mgr.i2c_hal_ = i2c_hal;
        mgr.onewire_hal_ = onewire_hal;
    }

    // Reset für Clean State zwischen Tests
    static void reset(SensorManager& mgr) {
        mgr.sensor_count_ = 0;
        mgr.initialized_ = false;
        // Sensors-Array clearen
        for (uint8_t i = 0; i < MAX_SENSORS; ++i) {
            mgr.sensors_[i] = SensorConfig();
        }
    }

    // Test-Utilities
    static uint8_t getSensorCount(const SensorManager& mgr) {
        return mgr.sensor_count_;
    }

    static const SensorConfig* getSensorAt(const SensorManager& mgr, uint8_t index) {
        return &mgr.sensors_[index];
    }
};

#endif // TEST_HELPERS_SENSOR_MANAGER_TEST_HELPER_H
```

**2. ConfigManagerTestHelper** - `test/helpers/config_manager_test_helper.h` (NEU)

```cpp
// Analog zu SensorManagerTestHelper
class ConfigManagerTestHelper {
public:
    static void injectNVStorageMock(ConfigManager& mgr, IHALNVStorage* nvs_hal);
    static void reset(ConfigManager& mgr);
    // ... weitere Test-Utilities
};
```

---

#### Manager-Änderungen (minimal invasiv)

**SensorManager** - `src/services/sensor/sensor_manager.h` (ÄNDERN)

```cpp
// Forward-Declaration
class SensorManagerTestHelper;

class SensorManager {
public:
    // Singleton bleibt UNVERÄNDERT
    static SensorManager& getInstance() {
        static SensorManager instance;
        return instance;
    }

    // Delete Copy/Move (UNVERÄNDERT)
    SensorManager(const SensorManager&) = delete;
    SensorManager& operator=(const SensorManager&) = delete;
    SensorManager(SensorManager&&) = delete;
    SensorManager& operator=(SensorManager&&) = delete;

    // Public API UNVERÄNDERT
    bool begin();
    // ... restliche Methoden

private:
    // ⭐ NEU: Friend-Deklaration
    friend class SensorManagerTestHelper;

    // Private Constructor (UNVERÄNDERT)
    SensorManager();
    ~SensorManager();

    // ⭐ NEU: HAL-Pointer für Testbarkeit
    IGPIOHal* gpio_hal_;
    IHALI2C* i2c_hal_;
    IHALOneWire* onewire_hal_;

    // Production HAL-Instanzen (Stack-alloziert in .cpp)
    #ifndef UNIT_TEST
    static ESP32GPIOHal production_gpio_hal_;
    static ESP32I2CHal production_i2c_hal_;
    static ESP32OneWireHal production_onewire_hal_;
    #endif

    // Bestehende Member UNVERÄNDERT
    SensorConfig sensors_[MAX_SENSORS];
    uint8_t sensor_count_;
    bool initialized_;
    // ... weitere Member
};
```

**SensorManager** - `src/services/sensor/sensor_manager.cpp` (ÄNDERN)

```cpp
#ifndef UNIT_TEST
// Production HAL-Instanzen (nur einmal, als static)
ESP32GPIOHal SensorManager::production_gpio_hal_;
ESP32I2CHal SensorManager::production_i2c_hal_;
ESP32OneWireHal SensorManager::production_onewire_hal_;
#endif

SensorManager::SensorManager()
    : sensor_count_(0),
      initialized_(false) {

    #ifndef UNIT_TEST
    // Production: HAL-Pointer auf statische Instanzen
    gpio_hal_ = &production_gpio_hal_;
    i2c_hal_ = &production_i2c_hal_;
    onewire_hal_ = &production_onewire_hal_;
    #else
    // Unit-Test: HAL-Pointer bleiben nullptr (werden via TestHelper injected)
    gpio_hal_ = nullptr;
    i2c_hal_ = nullptr;
    onewire_hal_ = nullptr;
    #endif

    // Restlicher Constructor-Code UNVERÄNDERT
}
```

**Vorteile:**
- ✅ Singleton-Pattern 100% intakt - keine Breaking Changes
- ✅ Testbar via Friend-Helper - analog zu ActuatorManagerTestHelper
- ✅ Production-Code unverändert in main.cpp
- ✅ Kein Heap-Allokation (new/delete) - Stack-basiert

---

### Test-Beispiel mit Friend-Helper-Pattern

**test/unit/managers/test_sensor_manager_mock.cpp** (NEU)

```cpp
#include <unity.h>
#include "mocks/mock_gpio_hal.h"
#include "mocks/mock_i2c_hal.h"
#include "mocks/mock_onewire_hal.h"
#include "helpers/sensor_manager_test_helper.h"
#include "services/sensor/sensor_manager.h"

// Mocks (Stack-basiert, kein new/delete)
MockGPIOHal gpio_mock;
MockI2CHal i2c_mock;
MockOneWireHal onewire_mock;

void setUp() {
    // Reset Mocks
    gpio_mock.reset();
    i2c_mock.reset();
    onewire_mock.reset();

    // Singleton holen und Mocks injizieren via Friend-Helper
    SensorManager& mgr = SensorManager::getInstance();
    SensorManagerTestHelper::reset(mgr);
    SensorManagerTestHelper::injectMocks(mgr, &gpio_mock, &i2c_mock, &onewire_mock);

    // Manager initialisieren
    mgr.begin();
}

void tearDown() {
    // Singleton cleanup
    SensorManager& mgr = SensorManager::getInstance();
    mgr.end();
    SensorManagerTestHelper::reset(mgr);
}

void test_sensor_manager_gpio_conflict_detection() {
    // GPIO 5 bereits durch "actuator" reserviert (im Mock)
    gpio_mock.reservePin(5, "actuator");

    SensorManager& mgr = SensorManager::getInstance();
    SensorConfig config;
    config.gpio = 5;
    config.sensor_type = "ds18b20";

    bool ok = mgr.configureSensor(config);
    TEST_ASSERT_FALSE(ok);  // Sollte fehlschlagen wegen GPIO-Konflikt

    // Verifiziere: Pin-Reservation wurde geprüft
    TEST_ASSERT_TRUE(gpio_mock.wasPinAvailabilityChecked(5));
}

void test_sensor_manager_i2c_initialization() {
    // I2C-Device 0x44 (SHT31) als vorhanden mocken
    i2c_mock.setDevicePresent(0x44, true);

    SensorManager& mgr = SensorManager::getInstance();
    SensorConfig config;
    config.sensor_type = "temperature_sht31";  // ESP32 Type (siehe Sensor-Registry)
    config.i2c_address = 0x44;
    config.gpio = 0;  // I2C nutzt kein GPIO direkt

    bool ok = mgr.configureSensor(config);
    TEST_ASSERT_TRUE(ok);

    // Verifiziere: I2C-Device-Scan wurde aufgerufen
    TEST_ASSERT_TRUE(i2c_mock.wasDeviceScanned(0x44));

    // Verifiziere: Sensor wurde registriert
    TEST_ASSERT_EQUAL(1, SensorManagerTestHelper::getSensorCount(mgr));
}

void test_sensor_manager_onewire_rom_validation() {
    // OneWire ROM-Code (64-bit) mocken
    uint8_t rom[8] = {0x28, 0xFF, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC};
    onewire_mock.setDevicePresent(rom, true);

    SensorManager& mgr = SensorManager::getInstance();
    SensorConfig config;
    config.sensor_type = "ds18b20";
    config.gpio = 4;  // OneWire-Bus auf GPIO 4
    config.onewire_address = "28FF12345678XXXX";  // Hex-String (CRC wird ignoriert)

    bool ok = mgr.configureSensor(config);
    TEST_ASSERT_TRUE(ok);

    // Verifiziere: OneWire-Bus-Search wurde aufgerufen
    TEST_ASSERT_TRUE(onewire_mock.wasSearchPerformed(4));
}

// ... weitere 22 Tests

void setup() {
    UNITY_BEGIN();
    RUN_TEST(test_sensor_manager_gpio_conflict_detection);
    RUN_TEST(test_sensor_manager_i2c_initialization);
    RUN_TEST(test_sensor_manager_onewire_rom_validation);
    // ...
    UNITY_END();
}

void loop() {}
```

**Unterschiede zum alten Ansatz:**
- ✅ Kein `new`/`delete` - Stack-Allokation für Mocks
- ✅ Singleton-Pattern intakt - `getInstance()` statt Constructor
- ✅ Friend-Helper für Mock-Injection - `SensorManagerTestHelper::injectMocks()`
- ✅ Clean State zwischen Tests - `SensorManagerTestHelper::reset()`

---

### Manager-Refactoring-Reihenfolge (nach Dependency-Tiefe)

**Wichtig:** Manager müssen in der richtigen Reihenfolge refactoriert werden, da sie voneinander abhängen.

| Schritt | Manager | Dependencies | HAL-Interfaces | Aufwand |
|---------|---------|--------------|----------------|---------|
| **1** | GPIOManager | Keine | IGPIOHal | 4h |
| **2** | I2CBusManager | GPIOManager | IHALI2C | 3h |
| **3** | OneWireBusManager | GPIOManager | IHALOneWire | 3h |
| **4** | ConfigManager | StorageManager | IHALNVStorage | 5h |
| **5** | SensorManager | GPIO + I2C + OneWire | (nutzt 1-3) | 8h |
| **6** | ActuatorManager | GPIOManager | (nutzt 1) | 6h |
| **7** | SafetyController | ActuatorManager | IHALTime | 4h |

**Dependency-Graph:**
```
GPIOManager (1)
├─→ I2CBusManager (2)
├─→ OneWireBusManager (3)
├─→ ActuatorManager (6)
│   └─→ SafetyController (7)
└─→ SensorManager (5)
    ├─ nutzt I2CBusManager
    └─ nutzt OneWireBusManager

ConfigManager (4) ─→ StorageManager (IHALNVStorage)
```

---

### Erweiterte Ordnerstruktur Phase 2

**Neue Dateien zusätzlich zu Phase 1:**

```
El Trabajante/
├── src/
│   └── drivers/
│       └── hal/                          # NEU: HAL-Abstraktion
│           ├── igpio_hal.h               # GPIO-Interface
│           ├── ihali2c.h                 # I2C-Interface
│           ├── ihal_onewire.h            # OneWire-Interface
│           ├── ihal_nvstorage.h          # NVS-Interface
│           ├── ihal_time.h               # Time-Interface
│           ├── esp32_gpio_hal.h/.cpp     # Production GPIO-Wrapper
│           ├── esp32_i2c_hal.h/.cpp      # Production I2C-Wrapper
│           ├── esp32_onewire_hal.h/.cpp  # Production OneWire-Wrapper
│           ├── esp32_nvstorage_hal.h/.cpp # Production NVS-Wrapper
│           └── esp32_time_hal.h/.cpp     # Production Time-Wrapper
│
├── test/
│   ├── mocks/                            # Erweitert aus Phase 1
│   │   ├── Arduino.h                     # Phase 1: Arduino-API-Mock
│   │   ├── mock_arduino.cpp              # Phase 1: String-Implementierung
│   │   ├── mock_gpio_hal.h/.cpp          # Phase 2: GPIO-HAL-Mock
│   │   ├── mock_i2c_hal.h/.cpp           # Phase 2: I2C-HAL-Mock
│   │   ├── mock_onewire_hal.h/.cpp       # Phase 2: OneWire-HAL-Mock
│   │   ├── mock_nvstorage_hal.h/.cpp     # Phase 2: NVS-HAL-Mock
│   │   ├── mock_time_hal.h/.cpp          # Phase 2: Time-HAL-Mock
│   │   └── README.md
│   │
│   ├── helpers/                          # Erweitert aus Phase 1
│   │   ├── test_helpers.h                # Phase 1: Allgemeine Utilities
│   │   ├── sensor_manager_test_helper.h  # Phase 2: SensorManager Friend-Helper
│   │   ├── actuator_manager_test_helper.h # Phase 2: ActuatorManager Friend-Helper (ergänzen)
│   │   ├── config_manager_test_helper.h  # Phase 2: ConfigManager Friend-Helper
│   │   ├── gpio_manager_test_helper.h    # Phase 2: GPIOManager Friend-Helper
│   │   ├── i2c_bus_test_helper.h         # Phase 2: I2CBusManager Friend-Helper
│   │   ├── onewire_bus_test_helper.h     # Phase 2: OneWireBusManager Friend-Helper
│   │   └── safety_controller_test_helper.h # Phase 2: SafetyController Friend-Helper
│   │
│   └── unit/
│       ├── infra/                        # Phase 1 Tests
│       ├── utils/                        # Phase 1 Tests
│       ├── models/                       # Phase 1 Tests
│       └── managers/                     # NEU: Phase 2 Tests
│           ├── test_gpio_manager_mock.cpp
│           ├── test_i2c_bus_mock.cpp
│           ├── test_onewire_bus_mock.cpp
│           ├── test_config_manager_mock.cpp
│           ├── test_sensor_manager_mock.cpp
│           ├── test_actuator_manager_mock.cpp
│           └── test_safety_controller_mock.cpp
```

**Gesamt Phase 2:**
- **10 HAL-Interfaces/Wrapper** (src/drivers/hal/)
- **5 Mock-Implementierungen** (test/mocks/)
- **7 Test-Helper** (test/helpers/)
- **7 Test-Dateien** (test/unit/managers/)
- **90 Test-Cases**

---

### Test-Anzahl Phase 2

| Kategorie | Tests | Aufwand |
|-----------|-------|---------|
| GPIOManager mit Mock | 10 | 4h |
| I2CBusManager mit Mock | 8 | 3h |
| OneWireBusManager mit Mock | 8 | 3h |
| ConfigManager mit NVS-Mock | 15 | 5h |
| SensorManager mit Mocks | 25 | 8h |
| ActuatorManager mit Mocks | 12 | 6h |
| SafetyController mit Time-Mock | 12 | 4h |
| **Total** | **90** | **33h** |

**Hinweis:** ActuatorManager bereits 20 Tests in `_archive/actuator_manager.cpp` vorhanden - nur 12 neue für Mock-basierte Tests nötig.

### Verifikation Phase 2

**VOR Phase 2 Start - Baseline messen:**

```bash
cd "El Trabajante"

# Baseline Binary-Size dokumentieren
pio run -e esp32_dev --target size > ../baseline_esp32_size.txt

# Baseline für Vergleich
grep "RAM:" ../baseline_esp32_size.txt
grep "Flash:" ../baseline_esp32_size.txt
```

**NACH Phase 2 Completion:**

```bash
cd "El Trabajante"

# 1. Native Tests mit Mocks (einzelner Manager)
pio test -e native -f test_sensor_manager_mock
pio test -e native -f test_actuator_manager_mock

# 2. Alle Phase 2 Tests
pio test -e native -f test_*_manager_mock

# 3. Production-Build prüfen
pio run -e esp32_dev

# 4. Binary-Size-Diff prüfen (MUSS <5% sein)
pio run -e esp32_dev --target size > ../phase2_esp32_size.txt
diff ../baseline_esp32_size.txt ../phase2_esp32_size.txt

# 5. Bestehende Environments unverändert
pio run -e seeed_xiao_esp32c3      # Muss bauen
pio run -e wokwi_simulation        # Muss bauen
```

**Akzeptanzkriterien:**
- ✅ 90 neue Tests grün (7 Manager, je ~10-25 Tests)
- ✅ Production-Build unverändert (Binary-Size-Diff < 5%)
- ✅ HAL-Interfaces folgen IActuatorDriver-Pattern (pure virtual, Lifecycle-Methoden)
- ✅ Friend-Helper-Pattern konsistent für alle 7 Manager
- ✅ Singleton-Pattern 100% intakt - keine Breaking Changes
- ✅ `pio run -e esp32_dev` baut unverändert
- ✅ `main.cpp` KEINE Änderungen nötig

### Risiken Phase 2

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| Friend-Helper-Pattern bricht Encapsulation | Niedrig | Nur für Tests, `#ifndef UNIT_TEST` Guards, Test-Helper in separatem Namespace |
| Mock-Komplexität explodiert | Mittel | Nur genutzte Methoden implementieren, Inkrementell erweitern |
| HAL-Overhead in Production | Niedrig | Statische HAL-Instanzen (Stack), Pointer-Indirektion minimal (<1% Overhead) |
| Singleton-Tests interferieren | Mittel | `SensorManagerTestHelper::reset()` in `setUp()`, Clean State garantieren |
| Bestehende Manager-Tests brechen | Sehr niedrig | Friend-Deklaration ist non-invasive Erweiterung |

### Aufwand Phase 2: ~67h

**Breakdown:**
- HAL-Interfaces erstellen (6x): ~12h
- Production-Wrapper (5x): ~10h
- Mock-Implementierungen (5x): ~10h
- Test-Helper (7x): ~7h
- Manager-Refactoring (7x): ~5h
- Tests schreiben: ~33h
- **Total: ~77h** (konservative Schätzung inkl. Debugging)

---

### Zusammenfassung Architektur-Änderungen Phase 2

**Was ist NEU:**
✅ HAL-Abstraktion - Hardware-unabhängige Interfaces (6x)
✅ Friend-Helper-Pattern - Testbarkeit für Singletons ohne DI
✅ Mock-Infrastruktur - 5 Mock-Implementierungen für Hardware-Layer
✅ Test-Helper - 7 Manager-spezifische Test-Utilities

**Was bleibt UNVERÄNDERT:**
✅ Singleton-Pattern - alle Manager behalten privaten Constructor
✅ main.cpp - keine Änderungen in Initialisierung
✅ Public APIs - keine Breaking Changes in Manager-Interfaces
✅ Production-Verhalten - HAL-Overhead <1%, Stack-basiert

**Unterschied zum ursprünglichen Plan:**
- ❌ **Kein Constructor-DI** (würde Singleton brechen)
- ✅ **Friend-Helper-Pattern** (folgt ActuatorManagerTestHelper)
- ✅ **Statische HAL-Instanzen** (statt dynamisch alloziert)
- ✅ **Manager-Refactoring-Reihenfolge** (nach Dependencies)

**Vorteil dieses Ansatzes:**
- ✅ Rückwärtskompatibilität 100% garantiert
- ✅ Testbarkeit ohne Architektur-Bruch
- ✅ Bestehender Code (ActuatorManagerTestHelper) als Vorlage
- ✅ Kein Heap-Allokation-Overhead

---

## Phase 3: CI-Integration

### Ziele

✅ GitHub Actions Workflow für native Tests
✅ Coverage-Reporting (gcov/lcov)
✅ Automatische Test-Ausführung bei Code-Änderungen
✅ Dokumentation: TEST_STRATEGY.md

### GitHub Actions Workflow

**Datei:** `.github/workflows/esp32-native-tests.yml` (NEU)

```yaml
name: ESP32 Native Tests

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

on:
  workflow_dispatch:
  push:
    branches: [main, master, develop]
    paths:
      - 'El Trabajante/src/**'
      - 'El Trabajante/test/**'
      - 'El Trabajante/platformio.ini'
  pull_request:
    branches: [main, master, develop]
    paths:
      - 'El Trabajante/src/**'
      - 'El Trabajante/test/**'

env:
  PLATFORMIO_VERSION: '6.1.11'

jobs:
  native-unit-tests:
    name: Native Unit Tests (x86_64)
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Cache PlatformIO
        uses: actions/cache@v4
        with:
          path: ~/.platformio
          key: platformio-${{ runner.os }}-${{ hashFiles('El Trabajante/platformio.ini') }}

      - name: Install PlatformIO Core
        run: pip install -U platformio==${{ env.PLATFORMIO_VERSION }}

      - name: Run Native Tests
        working-directory: El Trabajante
        run: pio test -e native --verbose --junit-output-path=test-results.xml

      - name: Upload Test Results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: native-test-results
          path: El Trabajante/test-results.xml

      - name: Generate Coverage Report
        if: success()
        working-directory: El Trabajante
        run: |
          lcov --capture --directory .pio/build/native --output-file coverage.info
          lcov --remove coverage.info '*/test/*' '*/mocks/*' --output-file coverage_filtered.info
          genhtml coverage_filtered.info --output-directory coverage_html

      - name: Upload Coverage HTML
        uses: actions/upload-artifact@v4
        if: success()
        with:
          name: coverage-report
          path: El Trabajante/coverage_html

      - name: Comment Coverage on PR
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          lcov-file: El Trabajante/coverage_filtered.info
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Coverage-Konfiguration

**platformio.ini erweitern:**

```ini
[env:native]
# ... bestehende Konfiguration ...

; Coverage-Flags
build_flags =
    ${env:native.build_flags}
    -fprofile-arcs
    -ftest-coverage
    --coverage

build_unflags =
    -O2    ; Optimierung deaktivieren

extra_scripts =
    post:scripts/generate_coverage.py
```

**Datei:** `El Trabajante/scripts/generate_coverage.py` (NEU)

```python
Import("env")

def post_test_callback(source, target, env):
    print("Generating coverage report...")
    env.Execute("lcov --capture --directory .pio/build/native --output-file coverage.info")
    env.Execute("lcov --remove coverage.info '*/test/*' '*/mocks/*' --output-file coverage_filtered.info")
    env.Execute("lcov --list coverage_filtered.info")

env.AddPostAction("test", post_test_callback)
```

### Coverage-Ziele

| Modul | Ziel | Strategie |
|-------|------|-----------|
| TopicBuilder | 100% | Pattern A Tests |
| OneWireUtils | 100% | Pattern A Tests |
| SensorRegistry | 95% | Pattern A Tests |
| ErrorCodes | 90% | Pattern A Tests |
| SensorManager | 75% | Pattern E (Mocks) |
| ActuatorManager | 75% | Pattern E (Mocks) |
| ConfigManager | 70% | Pattern E (NVS-Mock) |
| **GESAMT** | **70%** | Native + Hardware |

### Dokumentation: TEST_STRATEGY.md

**Datei:** `El Trabajante/docs/TEST_STRATEGY.md` oder `test/README.md` (NEU)

Enthält:
- Test-Pyramide Übersicht
- Native vs. Wokwi vs. Server-Tests
- HAL-Interface-Erklärung
- Test-Ausführung (Befehle)
- CI-Integration
- Contribution-Guidelines
- Troubleshooting

(Vollständiger Inhalt siehe Agent-Report)

### Verifikation Phase 3

```bash
# 1. Lokale CI-Simulation
act -j native-unit-tests

# 2. Coverage prüfen
pio test -e native --coverage
lcov --list coverage_filtered.info

# 3. PR erstellen und CI beobachten
gh pr create --title "feat: ESP32 Native Unit Tests"
gh run watch
```

**Akzeptanzkriterien:**
- ✅ CI-Workflow grün
- ✅ Coverage-Report als Artifact
- ✅ Coverage >70% für testbare Module
- ✅ CI-Laufzeit <10 Min

### Aufwand Phase 3: ~16h

---

## Critical Files für Implementierung

### Phase 1 (sofort):

1. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\platformio.ini**
   → `[env:native]` + `[env:esp32dev_test]` Konfiguration

2. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\test\mocks\Arduino.h** (NEU)
   → Zentrale Mock-Implementierung (String, millis, delay)

3. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\test\unit\infra\test_topic_builder.cpp** (NEU)
   → Erste Test-Suite (12 Tests), Template für Pattern-A

4. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\utils\topic_builder.h**
   → Analyse für Guards (`#ifdef NATIVE_TEST` falls nötig)

5. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\utils\onewire_utils.h**
   → Pure-Logic-Modul für neue Tests

### Phase 2 (Friend-Helper-Pattern):

6. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\services\actuator\actuator_manager.h** (Zeile 61)
   → Bestehende Vorlage: `friend class ActuatorManagerTestHelper`

7. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\services\actuator\actuator_drivers\iactuator_driver.h**
   → Bestehende Interface-Vorlage für HAL-Pattern

8. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\drivers\hal\igpio_hal.h** (NEU)
   → GPIO-HAL-Interface, Template für alle HAL-Interfaces

9. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\test\mocks\mock_gpio_hal.h** (NEU)
   → GPIO-Mock, Template für alle Mock-Implementierungen

10. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\test\helpers\sensor_manager_test_helper.h** (NEU)
    → Friend-Helper für SensorManager, Template für alle Test-Helper

11. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\services\sensor\sensor_manager.h**
    → Erste Manager-Klasse für Friend-Helper-Refactoring (Zeile ~730: `friend class SensorManagerTestHelper`)

12. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante\test\unit\managers\test_sensor_manager_mock.cpp** (NEU)
    → Erste Manager-Test-Suite mit Friend-Helper-Pattern

### Phase 3:

9. **c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\.github\workflows\esp32-native-tests.yml** (NEU)
   → GitHub Actions Workflow

---

## Gesamtaufwand

| Phase | Aufwand | Deliverables |
|-------|---------|--------------|
| **Phase 1: Foundation** | 20h | 57 Tests, platformio.ini, Arduino-Mock, 10 Test-Dateien, Unity-Framework-Integration |
| **Phase 2: Friend-Helper** | 77h | 90 Tests, 6 HAL-Interfaces, 5 Production-Wrapper, 5 Mocks, 7 Test-Helper, 7 Manager mit Friend |
| **Phase 3: CI-Integration** | 16h | GitHub Actions, Coverage-Config, TEST_STRATEGY.md |
| **TOTAL** | **113h** | ~3 Wochen Vollzeit |

---

## Risiko-Matrix

| Risiko | Phase | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------|-------------------|--------|------------|
| Arduino-Mock zu komplex | 1 | Mittel | Hoch | Inkrementell erweitern, nur genutzte Features |
| PlatformIO Linker-Fehler | 1 | Niedrig | Kritisch | Guards `#ifndef UNIT_TEST` + `test_build_src = yes` |
| Unity Framework fehlt | 1 | Sehr niedrig | Kritisch | `lib_deps = throwtheswitch/Unity@^2.6.0` in esp32_dev |
| Friend-Helper bricht Encapsulation | 2 | Niedrig | Mittel | Nur für Tests, separater Namespace, Code-Review |
| Mock-Komplexität explodiert | 2 | Mittel | Mittel | Nur genutzte Methoden, Inkrementell erweitern |
| HAL-Overhead in Production | 2 | Sehr niedrig | Mittel | Statische HAL-Instanzen (Stack), <1% Overhead |
| Singleton-Tests interferieren | 2 | Mittel | Hoch | `TestHelper::reset()` in setUp(), Clean State garantieren |
| CI-Laufzeit explodiert | 3 | Niedrig | Mittel | Relevante Tests, Caching, Parallele Ausführung |
| Wokwi-Tests beeinträchtigt | 1-2 | Sehr niedrig | Hoch | Separate Environments (`test_ignore = test/_archive/*`) |

---

## Erfolgs-Kriterien

**Phase 1 (Foundation):**
- [ ] `pio test -e native` läuft grün (50+ Tests)
- [ ] Unity Framework integriert (`lib_deps = throwtheswitch/Unity@^2.6.0`)
- [ ] Arduino-Mock funktionsfähig (String, millis, delay)
- [ ] Bestehende Environments unverändert (esp32_dev, wokwi_simulation)
- [ ] Keine Production-Code-Änderungen

**Phase 2 (Friend-Helper):**
- [ ] 90 neue Tests mit HAL-Mocks (7 Manager, je ~10-25 Tests)
- [ ] 6 HAL-Interfaces definiert (GPIO, I2C, OneWire, NVStorage, Time)
- [ ] 5 Production-Wrapper implementiert (ESP32*Hal)
- [ ] 7 Test-Helper erstellt (*ManagerTestHelper)
- [ ] Friend-Deklarationen in allen 7 Managern
- [ ] Production-Build unverändert (Binary-Diff <5%)
- [ ] Singleton-Pattern 100% intakt
- [ ] HAL-Pattern konsistent mit IActuatorDriver

**Phase 3 (CI):**
- [ ] GitHub Actions Workflow funktioniert
- [ ] Coverage-Report als Artifact verfügbar
- [ ] Coverage >70% für testbare Module (TopicBuilder 100%, Manager 75%)
- [ ] TEST_STRATEGY.md dokumentiert (Test-Pyramide, Patterns, Befehle)
- [ ] CI-Laufzeit <10 Min

**Gesamt:**
- [ ] 147 Tests (57 Phase 1 + 90 Phase 2)
- [ ] Rückwärtskompatibilität zu allen 3 Environments (esp32_dev, xiao, wokwi)
- [ ] Server-zentrische Architektur bewahrt (ESP32 = dumme Agenten)
- [ ] Keine Breaking Changes in Public APIs oder main.cpp
- [ ] Friend-Helper-Pattern konsistent über alle Manager

---

## Nächste Schritte (für esp32-dev Agent)

### Sofort nach Freigabe:

1. **Phase 1 starten:**
   ```bash
   # 1. platformio.ini erweitern
   # 2. test/mocks/Arduino.h erstellen
   # 3. test/unit/infra/test_topic_builder.cpp reaktivieren
   # 4. pio test -e native -f test_topic_builder
   ```

2. **Erste Verifikation:**
   - TopicBuilder-Tests grün (12 Tests)
   - `pio run -e esp32_dev` unverändert
   - `pio run -e wokwi_simulation` unverändert

3. **Pattern-A-Tests fortsetzen:**
   - ActuatorModels, Logger, ErrorTracker
   - OneWireUtils (neu), SensorRegistry (neu)

### Nach Phase 1 Completion:

- TM-Review der Coverage
- Entscheidung: Phase 2 starten oder optimieren
- HAL-Interface-Design finalisieren

---

**Ende des Implementierungsplans**

*Dieser Plan respektiert die server-zentrische Architektur, folgt bestehenden Patterns (IActuatorDriver), ist rückwärtskompatibel und von verify-plan prüfbar.*
