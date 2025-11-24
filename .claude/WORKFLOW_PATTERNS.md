# Development Workflow Patterns

> **Zweck:** Step-by-Step Workflows für häufige Entwicklungsaufgaben (verifiziert gegen Code)

---

## 1. Adding New Actuator Driver

### Übersicht
- **Betroffene Module:** ActuatorManager, IActuatorDriver, ActuatorTypes
- **Dateien:** 3-4 Dateien (Driver, Factory, Types, optional Safety)
- **Test-Pattern:** VirtualActuatorDriver für Mock-Tests

### Step-by-Step

#### Step 1: Driver-Klasse erstellen

**Datei:** `El Trabajante/src/services/actuator/actuator_drivers/your_actuator.h`

```cpp
#ifndef SERVICES_ACTUATOR_DRIVERS_YOUR_ACTUATOR_H
#define SERVICES_ACTUATOR_DRIVERS_YOUR_ACTUATOR_H

#include "iactuator_driver.h"

class GPIOManager;

class YourActuator : public IActuatorDriver {
public:
  YourActuator();
  ~YourActuator() override;

  // IActuatorDriver interface (iactuator_driver.h:10-32)
  bool begin(const ActuatorConfig& config) override;
  void end() override;
  bool isInitialized() const override { return initialized_; }

  bool setValue(float normalized_value) override;
  bool setBinary(bool state) override;

  bool emergencyStop(const String& reason) override;
  bool clearEmergency() override;
  void loop() override;

  ActuatorStatus getStatus() const override;
  const ActuatorConfig& getConfig() const override { return config_; }
  String getType() const override { return String(ActuatorTypeTokens::YOUR_TYPE); }

private:
  ActuatorConfig config_;
  bool initialized_;
  bool emergency_stopped_;
  GPIOManager* gpio_manager_;
};

#endif  // SERVICES_ACTUATOR_DRIVERS_YOUR_ACTUATOR_H
```

**Datei:** `El Trabajante/src/services/actuator/actuator_drivers/your_actuator.cpp`

```cpp
#include "your_actuator.h"
#include "../../core/gpio_manager.h"

YourActuator::YourActuator()
    : initialized_(false), emergency_stopped_(false), gpio_manager_(nullptr) {}

YourActuator::~YourActuator() {
    end();
}

bool YourActuator::begin(const ActuatorConfig& config) {
    config_ = config;
    gpio_manager_ = &GPIOManager::getInstance();

    // GPIO-Setup
    if (!gpio_manager_->isPinAvailable(config_.gpio)) {
        return false;
    }

    gpio_manager_->reservePin(config_.gpio, PinMode::OUTPUT);
    pinMode(config_.gpio, OUTPUT);
    digitalWrite(config_.gpio, LOW);

    initialized_ = true;
    return true;
}

void YourActuator::end() {
    if (initialized_) {
        digitalWrite(config_.gpio, LOW);
        gpio_manager_->releasePin(config_.gpio);
        initialized_ = false;
    }
}

bool YourActuator::setValue(float normalized_value) {
    if (!initialized_ || emergency_stopped_) return false;

    // Ihre Logik hier (z.B. PWM setzen)
    normalized_value = constrain(normalized_value, 0.0f, 1.0f);
    // ... implementation ...

    return true;
}

bool YourActuator::setBinary(bool state) {
    if (!initialized_ || emergency_stopped_) return false;

    digitalWrite(config_.gpio, state ? HIGH : LOW);
    return true;
}

bool YourActuator::emergencyStop(const String& reason) {
    if (!initialized_) return false;

    emergency_stopped_ = true;
    digitalWrite(config_.gpio, LOW);  // Safe state
    return true;
}

bool YourActuator::clearEmergency() {
    emergency_stopped_ = false;
    return true;
}

void YourActuator::loop() {
    // Optional: Periodic checks
}

ActuatorStatus YourActuator::getStatus() const {
    ActuatorStatus status;
    status.gpio = config_.gpio;
    status.actuator_type = String(ActuatorTypeTokens::YOUR_TYPE);
    status.current_state = digitalRead(config_.gpio) == HIGH;
    status.emergency_state = emergency_stopped_
        ? EmergencyState::EMERGENCY_ACTIVE
        : EmergencyState::EMERGENCY_NORMAL;
    return status;
}
```

---

#### Step 2: Type Token definieren

**Datei:** `El Trabajante/src/models/actuator_types.h`

```cpp
namespace ActuatorTypeTokens {
    constexpr const char* PUMP = "pump";
    constexpr const char* VALVE = "valve";
    constexpr const char* PWM = "pwm";
    constexpr const char* YOUR_TYPE = "your_type";  // ← Add here
}
```

---

#### Step 3: Factory registrieren

**Datei:** `El Trabajante/src/services/actuator/actuator_manager.cpp`

**Lines 166-174 - `createDriver()` method:**

```cpp
std::unique_ptr<IActuatorDriver> ActuatorManager::createDriver(const String& actuator_type) const {
  if (actuator_type == ActuatorTypeTokens::PUMP) {
    return std::unique_ptr<IActuatorDriver>(new PumpActuator());
  }
  if (actuator_type == ActuatorTypeTokens::PWM) {
    return std::unique_ptr<IActuatorDriver>(new PWMActuator());
  }
  if (actuator_type == ActuatorTypeTokens::VALVE) {
    return std::unique_ptr<IActuatorDriver>(new ValveActuator());
  }
  // ↓ Add here
  if (actuator_type == ActuatorTypeTokens::YOUR_TYPE) {
    return std::unique_ptr<IActuatorDriver>(new YourActuator());
  }
  return nullptr;
}
```

**Auch Include hinzufügen:**
```cpp
#include "actuator_drivers/your_actuator.h"
```

---

#### Step 4: Test schreiben

**Datei:** `El Trabajante/test/test_actuator_manager.cpp`

```cpp
void test_your_actuator_control(void) {
    uint8_t gpio = findFreeTestGPIO("your_type");
    if (gpio == 255) {
        TEST_IGNORE_MESSAGE("No free GPIO");
        return;
    }

    // RAII: Auto-Cleanup
    TemporaryTestActuator temp(gpio, ActuatorTypeTokens::YOUR_TYPE);
    TEST_ASSERT_TRUE(temp.isValid());

    VirtualActuatorDriver* driver = temp.getVirtualDriver();
    TEST_ASSERT_NOT_NULL(driver);

    // Test ON command
    TEST_ASSERT_TRUE(actuatorManager.controlActuatorBinary(gpio, true));
    TEST_ASSERT_TRUE(driver->wasCommandCalled("SET_BINARY:ON"));

    // Test OFF command
    TEST_ASSERT_TRUE(actuatorManager.controlActuatorBinary(gpio, false));
    TEST_ASSERT_TRUE(driver->wasCommandCalled("SET_BINARY:OFF"));
}
```

---

#### Step 5: Dokumentation aktualisieren

**Dateien:**
- `El Trabajante/docs/API_REFERENCE.md` - ActuatorManager Section
- `El Trabajante/docs/system-flows/03-actuator-command-flow.md` (falls Verhalten ändert)

---

## 2. Adding New Sensor Type (Pi-Enhanced)

### Übersicht
- **Server-Side:** Python Sensor Library (empfohlen)
- **ESP-Side:** Nur für custom Protocols nötig
- **Vorteil:** ESP-Code bleibt unverändert für Standard-Sensoren

### Step-by-Step (Server-Side)

#### Step 1: Server Processor erstellen

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/your_sensor.py`

```python
from .base_processor import BaseSensorProcessor

class YourSensorProcessor(BaseSensorProcessor):
    """
    Processor für YourSensor - Konvertiert RAW ADC-Werte zu physikalischer Einheit
    """

    def __init__(self, sensor_config: dict):
        super().__init__(sensor_config)
        self.calibration_offset = sensor_config.get("calibration_offset", 0.0)
        self.calibration_factor = sensor_config.get("calibration_factor", 1.0)

    def process_raw_data(self, raw_value: int, sensor_config: dict) -> dict:
        """
        Convert raw ADC value (0-4095) to physical unit

        Args:
            raw_value: ADC reading from ESP32 (12-bit: 0-4095)
            sensor_config: Sensor configuration from ESP32

        Returns:
            dict with 'value', 'unit', 'quality'
        """
        # Example conversion logic
        voltage = (raw_value / 4095.0) * 3.3  # ADC to voltage
        physical_value = (voltage - self.calibration_offset) * self.calibration_factor

        return {
            "value": round(physical_value, 2),
            "unit": "your_unit",
            "quality": self._assess_quality(physical_value),
            "metadata": {
                "raw_adc": raw_value,
                "voltage": voltage
            }
        }

    def validate(self, processed_data: dict) -> bool:
        """Validate processed data is within acceptable range"""
        value = processed_data.get("value", 0)
        return 0 <= value <= 100  # Example range

    def _assess_quality(self, value: float) -> str:
        """Assess data quality based on value"""
        if value < 0 or value > 100:
            return "INVALID"
        elif 10 <= value <= 90:
            return "GOOD"
        else:
            return "MARGINAL"
```

---

#### Step 2: ESP-Config erstellen (KEIN Code-Change!)

**ESP32 sendet automatisch RAW-Werte wenn `raw_mode = true`:**

```cpp
// Sensor-Config via MQTT oder ConfigManager
SensorConfig cfg;
cfg.gpio = 34;                    // ADC-capable GPIO
cfg.sensor_type = "your_sensor";  // Server-Processor nutzt diesen String
cfg.sensor_name = "YourSensor_1";
cfg.subzone_id = "zone_1";
cfg.active = true;
cfg.raw_mode = true;              // ← ESP sendet RAW ADC-Werte

sensorManager.configureSensor(cfg);
```

**ESP32 Flow:**
1. SensorManager liest `analogRead(34)` → RAW value (0-4095)
2. MQTT-Publish: `{"gpio": 34, "raw_value": 2048, "sensor_type": "your_sensor"}`
3. Server empfängt → `YourSensorProcessor.process_raw_data(2048)`
4. Server antwortet: `{"value": 42.5, "unit": "your_unit", "quality": "GOOD"}`
5. ESP empfängt processed value via MQTT

**KEIN ESP-Code-Change nötig!**

---

#### Step 3: Server-Side Registrierung

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_registry.py`

```python
from .sensor_libraries.active.your_sensor import YourSensorProcessor

SENSOR_PROCESSORS = {
    "temperature": TemperatureProcessor,
    "humidity": HumidityProcessor,
    "your_sensor": YourSensorProcessor,  # ← Add here
}
```

---

### ESP-Side Implementation (Nur für Custom Protocols)

**Nur nötig wenn:**
- Sensor nutzt weder Analog, Digital, I2C noch OneWire
- Custom Kommunikationsprotokoll erforderlich
- Hardware-spezifische Timing-Anforderungen

**Dann:**
1. `SensorManager` um `readRawYourSensor()` Methode erweitern
2. Hardware-Library einbinden
3. Sensor-Driver-Pattern implementieren

---

## 3. Test Development Pattern (Dual-Mode + RAII)

### Pattern: Production-Safe Testing

**Verifiziert aus:** `test/test_sensor_manager.cpp:365-402`

```cpp
void test_sensor_reading(void) {
    // SCHRITT 1: Versuche Production-Device zu finden
    uint8_t gpio = findExistingSensor("analog");

    // SCHRITT 2: Production-Device gefunden?
    if (gpio != 255) {
        TEST_MESSAGE("Production-Mode: Read-only Test");

        // Nur READ-ONLY! Keine Änderungen an Production-Config
        SensorReading reading;
        sensorManager.performMeasurement(gpio, reading);
        TEST_ASSERT_TRUE(reading.valid);
        TEST_ASSERT_TRUE(reading.raw_value <= 4095);
        return;  // Production-Test beendet
    }

    // SCHRITT 3: Kein Production-Device → Erstelle temporäres
    gpio = findFreeTestGPIO("analog");
    if (gpio == 255) {
        TEST_IGNORE_MESSAGE("Keine freien GPIOs");
        return;
    }

    TEST_MESSAGE("New-System-Mode: Erstelle temporären Sensor");

    // SCHRITT 4: RAII-Cleanup (auto-remove on scope exit)
    TemporaryTestSensor temp(gpio, "TestSensor");
    if (!temp.isValid()) {
        TEST_FAIL_MESSAGE("Sensor creation failed");
        return;
    }

    // SCHRITT 5: Test-Logik
    SensorReading reading;
    sensorManager.performMeasurement(gpio, reading);
    TEST_ASSERT_TRUE(reading.valid);
    TEST_ASSERT_TRUE(reading.raw_value <= 4095);
    TEST_ASSERT_EQUAL_UINT8(gpio, reading.gpio);

}  // SCHRITT 6: temp.~TemporaryTestSensor() → Auto-Cleanup!
```

---

### Pattern: MockMQTT Testing

**Verifiziert aus:** `test/test_actuator_integration.cpp:45-88`

```cpp
namespace {
    MockMQTTBroker broker;  // Namespace-Variable für alle Tests

    void attachBroker() {
        mqttClient.setTestPublishHook([](const String& topic, const String& payload) {
            broker.publish(topic, payload);
        });
    }
}

void setUp(void) {
    ensure_actuator_stack_initialized();
    attachBroker();  // Hook MQTT zu Mock
}

void tearDown(void) {
    actuator_test_teardown(&broker);
    mqttClient.clearTestPublishHook();
}

void test_mqtt_command_response(void) {
    broker.clearPublished();  // Clean state für diesen Test

    uint8_t gpio = findFreeTestGPIO("pump");
    TemporaryTestActuator temp(gpio, ActuatorTypeTokens::PUMP);

    // MQTT Command senden
    String command_topic = TopicBuilder::buildActuatorCommandTopic(gpio);
    String on_payload = R"({"command":"ON"})";

    actuatorManager.handleActuatorCommand(command_topic, on_payload);

    // MQTT Response verifizieren
    TEST_ASSERT_TRUE(broker.wasPublished("/actuator/" + String(gpio) + "/response"));

    String response = broker.getLastPayload("/actuator/" + String(gpio) + "/response");
    TEST_ASSERT_NOT_EQUAL(-1, response.indexOf("\"success\":true"));
}
```

---

### Pattern: VirtualDriver Testing

```cpp
void test_virtual_driver_pattern(void) {
    uint8_t gpio = findFreeTestGPIO("pump");

    // RAII: Temporärer Actuator mit Virtual Driver
    TemporaryTestActuator temp(gpio, ActuatorTypeTokens::PUMP);
    TEST_ASSERT_TRUE(temp.isValid());

    // Zugriff auf Virtual Driver für Assertions
    VirtualActuatorDriver* driver = temp.getVirtualDriver();
    TEST_ASSERT_NOT_NULL(driver);

    // Aktion ausführen
    actuatorManager.controlActuatorBinary(gpio, true);

    // Virtual Driver State verifizieren
    TEST_ASSERT_TRUE(driver->wasCommandCalled("SET_BINARY:ON"));
    TEST_ASSERT_TRUE(driver->getStatus().current_state);

    // Command-Log prüfen
    const std::vector<String>& log = driver->getCommandLog();
    TEST_ASSERT_EQUAL_INT(1, log.size());
    TEST_ASSERT_TRUE(log[0].startsWith("SET_BINARY:ON"));
}
```

---

## 4. GPIO Conflict Debugging

### Problem-Muster
- `ERROR_GPIO_CONFLICT` (1002)
- Sensor und Actuator auf gleichem GPIO
- GPIO bereits von anderem Service reserviert

### Debug-Workflow

#### Step 1: Error-Code identifizieren

```bash
# Serial-Monitor Output prüfen
pio device monitor

# Suche nach ERROR_GPIO_CONFLICT (1002)
```

#### Step 2: NVS-Config prüfen

**Dateien:**
- `El Trabajante/docs/NVS_KEYS.md` - Liste aller NVS-Keys
- `El Trabajante/src/services/config/config_manager.cpp` - Config-Loading

```cpp
// GPIOManager-Status prüfen
bool isPinAvailable(uint8_t gpio) {
    return gpioManager.isPinAvailable(gpio);
}

// Welcher Service nutzt GPIO?
// → Check ConfigManager.loadSensorConfigs()
// → Check ConfigManager.loadActuatorConfigs()
```

#### Step 3: Boot-Sequence analysieren

**Datei:** `El Trabajante/docs/system-flows/01-boot-sequence.md`

**Initialization Order:**
1. GPIOManager → Safe-Mode (alle Pins INPUT)
2. ConfigManager → Lädt Sensor/Actuator Configs aus NVS
3. SensorManager → Reserviert GPIOs für Sensoren
4. ActuatorManager → Reserviert GPIOs für Aktoren (Konflikt möglich hier!)

#### Step 4: Konflikt auflösen

**Option A: Config ändern (via MQTT oder Serial)**
```cpp
// Sensor/Actuator auf anderen GPIO verschieben
sensorManager.removeSensor(conflicting_gpio);
sensorManager.configureSensor(new_config_with_different_gpio);
```

**Option B: NVS löschen (Factory-Reset)**
```bash
# Alle Configs löschen
storageManager.clearNamespace("sensors");
storageManager.clearNamespace("actuators");
```

---

## Common Pitfalls

### ❌ FALSCH: Manuelles Memory-Management in Tests
```cpp
SensorConfig* cfg = new SensorConfig();
delete cfg;  // Leak-prone!
```

### ✅ RICHTIG: RAII-Pattern
```cpp
TemporaryTestSensor temp(gpio, "Test");  // Auto-cleanup
```

---

### ❌ FALSCH: Production-Config in Test ändern
```cpp
uint8_t gpio = findExistingSensor("analog");
sensorManager.removeSensor(gpio);  // ← Kaputt Production!
```

### ✅ RICHTIG: Read-Only Test
```cpp
uint8_t gpio = findExistingSensor("analog");
if (gpio != 255) {
    // Nur lesen, nicht ändern!
    SensorReading reading;
    sensorManager.performMeasurement(gpio, reading);
    TEST_ASSERT_TRUE(reading.valid);
    return;
}
```

---

**Letzte Aktualisierung:** 2025-11-24
**Version:** 1.0 (Verifiziert gegen Code)
