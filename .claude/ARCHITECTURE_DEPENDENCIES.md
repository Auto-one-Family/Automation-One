# Architecture Dependencies Reference

> **Zweck:** Modul-Abhängigkeiten verstehen für sichere Code-Änderungen

---

## Core Managers (El Trabajante/src/services/)

### SensorManager
**Location:** `El Trabajante/src/services/sensor/sensor_manager.h`

**Dependencies (Member Variables - Lines 133-138):**
- `GPIOManager*` - GPIO reservation/conflict checking
- `MQTTClient*` - Publishing sensor readings
- `PiEnhancedProcessor*` - Processing raw sensor data
- `I2CBusManager*` - I2C sensor communication
- `OneWireBusManager*` - OneWire sensor communication

**Initialization Pattern:**
```cpp
// sensor_manager.cpp:47-51
pi_processor_ = &PiEnhancedProcessor::getInstance();
mqtt_client_ = &MQTTClient::getInstance();
i2c_bus_ = &I2CBusManager::getInstance();
onewire_bus_ = &OneWireBusManager::getInstance();
gpio_manager_ = &GPIOManager::getInstance();
```

**Key Responsibilities:**
- Sensor configuration management (MAX_SENSORS limit)
- Raw data acquisition (analogRead, digitalRead, I2C, OneWire)
- Coordination with PiEnhancedProcessor for server-side processing
- MQTT publishing of sensor readings

---

### ActuatorManager
**Location:** `El Trabajante/src/services/actuator/actuator_manager.h`

**Dependencies (Member Variable - Line 94):**
- `GPIOManager*` - GPIO validation/reservation (acquired in constructor line 91)

**Driver Pattern (Lines 166-174):**
```cpp
// actuator_manager.cpp:createDriver()
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
  return nullptr;
}
```

**Registry Structure (Lines 62-68):**
```cpp
struct RegisteredActuator {
    bool in_use = false;
    uint8_t gpio = 255;
    std::unique_ptr<IActuatorDriver> driver;  // Factory-created
    ActuatorConfig config;
    bool emergency_stopped = false;  // Per-actuator safety state
};
```

**Key Responsibilities:**
- Actuator registry management (MAX_ACTUATORS limit)
- Factory-based driver instantiation
- Per-actuator emergency stop tracking
- GPIO conflict prevention via GPIOManager

---

### ConfigManager
**Location:** `El Trabajante/src/services/config/config_manager.h`

**Dependencies:**
- `StorageManager` - NVS persistence operations (config_manager.cpp:2)
- `WiFi` library - ESP ID generation (config_manager.cpp:4)
- `Logger` - Error tracking

**Cached Configurations (Lines 83-86):**
```cpp
WiFiConfig wifi_config_;
KaiserZone kaiser_;
MasterZone master_;
SystemConfig system_config_;
```

**Data Models:**
- `WiFiConfig` (SSID, password, static IP)
- `KaiserZone` (zone_id, zone_name)
- `MasterZone` (zone hierarchy)
- `SystemConfig` (system-wide settings)
- `SensorConfig` (per-sensor configuration)
- `ActuatorConfig` (per-actuator configuration)

**Key Responsibilities:**
- Configuration loading from NVS via `loadAllConfigs()`
- Configuration persistence to NVS via StorageManager
- Validation of configurations before saving
- ESP ID generation for MQTT topics

---

## Dependency Graph

```
Application Layer
└─> MainLoop / SystemController
    │
    ├─> SensorManager
    │   ├─> GPIOManager (singleton)
    │   ├─> MQTTClient (singleton)
    │   ├─> PiEnhancedProcessor (singleton)
    │   ├─> I2CBusManager (singleton)
    │   └─> OneWireBusManager (singleton)
    │
    ├─> ActuatorManager
    │   ├─> GPIOManager (singleton)
    │   └─> IActuatorDriver (factory-created)
    │       ├─> PumpActuator
    │       │   └─> GPIOManager (each driver holds reference)
    │       ├─> ValveActuator
    │       │   └─> GPIOManager
    │       └─> PWMActuator
    │           └─> GPIOManager
    │
    └─> ConfigManager
        └─> StorageManager (singleton)
            └─> NVS (ESP32 hardware)

Communication Layer (Singletons)
├─> MQTTClient
│   └─> WiFiManager
├─> WiFiManager
└─> HTTPClient (für Pi-Enhanced Processing)
```

---

## Adding New Components

### New Actuator Driver

**Step 1: Implement IActuatorDriver Interface**
```cpp
// El Trabajante/src/services/actuator/actuator_drivers/your_actuator.h
#include "iactuator_driver.h"

class YourActuator : public IActuatorDriver {
public:
    YourActuator();
    ~YourActuator() override;

    // IActuatorDriver interface (iactuator_driver.h:10-32)
    bool begin(const ActuatorConfig& config) override;
    void end() override;
    bool isInitialized() const override;
    bool setValue(float normalized_value) override;
    bool setBinary(bool state) override;
    bool emergencyStop(const String& reason) override;
    bool clearEmergency() override;
    void loop() override;
    ActuatorStatus getStatus() const override;
    const ActuatorConfig& getConfig() const override;
    String getType() const override;

private:
    ActuatorConfig config_;
    bool initialized_;
    bool emergency_stopped_;
    GPIOManager* gpio_manager_;  // Typical pattern
};
```

**Step 2: Register in Factory**
```cpp
// actuator_manager.cpp:createDriver() - Add new if-branch
if (actuator_type == ActuatorTypeTokens::YOUR_TYPE) {
    return std::unique_ptr<IActuatorDriver>(new YourActuator());
}
```

**Step 3: Define Type Token**
```cpp
// El Trabajante/src/models/actuator_types.h
namespace ActuatorTypeTokens {
    constexpr const char* PUMP = "pump";
    constexpr const char* VALVE = "valve";
    constexpr const char* PWM = "pwm";
    constexpr const char* YOUR_TYPE = "your_type";  // Add here
}
```

---

### New Sensor Type (Pi-Enhanced Mode)

**Server-Side Processing (Recommended):**
```python
# El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/your_sensor.py
from .base_processor import BaseSensorProcessor

class YourSensorProcessor(BaseSensorProcessor):
    def process_raw_data(self, raw_value: int, sensor_config: dict) -> dict:
        # Convert raw ADC/digital value to meaningful unit
        processed_value = self.your_conversion_logic(raw_value)

        return {
            "value": processed_value,
            "unit": "your_unit",
            "quality": self.assess_quality(processed_value)
        }
```

**ESP Code Changes:** NONE required if sensor uses:
- Analog GPIO (analogRead)
- Digital GPIO (digitalRead)
- I2C protocol (I2CBusManager)
- OneWire protocol (OneWireBusManager)

**ESP sends RAW data automatically when `raw_mode = true` in SensorConfig**

---

### New Manager/Service

**Singleton Pattern (if needed):**
```cpp
class YourManager {
public:
    static YourManager& getInstance() {
        static YourManager instance;
        return instance;
    }

    bool begin();
    void end();

private:
    YourManager() = default;  // Private constructor
    ~YourManager() = default;

    // Delete copy/move
    YourManager(const YourManager&) = delete;
    YourManager& operator=(const YourManager&) = delete;
};
```

**Integration Pattern:**
1. Add `#include "your_manager.h"` to dependent modules
2. Acquire reference: `YourManager& mgr = YourManager::getInstance();`
3. Initialize in MainLoop: `mgr.begin();` (after dependencies initialized)
4. Clean up in MainLoop: `mgr.end();` (before dependencies shut down)

---

## Common Patterns

### Singleton Access
```cpp
// Good: Acquire reference in begin()
bool SensorManager::begin() {
    gpio_manager_ = &GPIOManager::getInstance();  // Store reference
    mqtt_client_ = &MQTTClient::getInstance();
    // ... use references throughout class lifetime
}
```

### Factory Pattern
```cpp
// Good: Factory method for polymorphic objects
std::unique_ptr<IActuatorDriver> createDriver(const String& type) {
    if (type == "pump") return std::make_unique<PumpActuator>();
    if (type == "valve") return std::make_unique<ValveActuator>();
    return nullptr;
}
```

### RAII for Resources
```cpp
// Good: Automatic cleanup
class TemporaryResource {
public:
    TemporaryResource(uint8_t gpio) : gpio_(gpio) {
        gpioManager.reservePin(gpio_);
    }
    ~TemporaryResource() {
        gpioManager.releasePin(gpio_);  // Auto-cleanup
    }
private:
    uint8_t gpio_;
};
```

---

## Initialization Order (MainLoop)

**Critical Order (El Trabajante/src/core/main_loop.cpp):**

1. **Foundation Layer:**
   - Logger (für Error-Tracking)
   - GPIOManager (Safe-Mode initialisierung)
   - StorageManager (NVS-Zugriff)

2. **Configuration Layer:**
   - ConfigManager (lädt Configs aus NVS)

3. **Communication Layer:**
   - WiFiManager (WiFi-Verbindung)
   - MQTTClient (MQTT-Broker-Verbindung)

4. **Service Layer:**
   - SensorManager (abhängig von GPIO, MQTT, Config)
   - ActuatorManager (abhängig von GPIO, MQTT, Config)
   - ProvisionManager (abhängig von Config, MQTT)

**Warum diese Reihenfolge?**
- GPIOManager muss vor allen GPIO-nutzenden Services laufen
- ConfigManager muss vor Services laufen (Services laden ihre Configs)
- MQTTClient muss vor Services laufen (Services publishen via MQTT)

---

**Letzte Aktualisierung:** 2025-11-24
**Version:** 1.0 (Basiert auf Code-Verifikation)
