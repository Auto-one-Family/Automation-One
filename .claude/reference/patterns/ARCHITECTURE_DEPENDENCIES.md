# Architecture Dependencies Reference

> **Zweck:** Modul-Abhängigkeiten verstehen für sichere Code-Änderungen

---

## Core Managers (El Trabajante/src/services/)

### SensorManager
**Location:** `El Trabajante/src/services/sensor/sensor_manager.h`

**Dependencies (Member Variables - Lines 145-149):**
- `PiEnhancedProcessor*` - Processing raw sensor data
- `MQTTClient*` - Publishing sensor readings
- `I2CBusManager*` - I2C sensor communication
- `OneWireBusManager*` - OneWire sensor communication
- `GPIOManager*` - GPIO reservation/conflict checking

**Initialization Pattern:**
```cpp
// sensor_manager.cpp:67-71
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
- `GPIOManager*` - GPIO validation/reservation (acquired in constructor line 92)

**Driver Pattern (Lines 167-182):**
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
  if (actuator_type == ActuatorTypeTokens::RELAY) {
    return std::unique_ptr<IActuatorDriver>(new PumpActuator());  // Relay handled like pump (binary)
  }
  LOG_ERROR("Unknown actuator type: " + actuator_type);
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
- `Logger` - Error tracking (config_manager.cpp:3)
- `GPIOManager` - For OneWire ROM validation (config_manager.cpp:5)
- `ErrorTracker` - Error tracking (config_manager.cpp:6)
- `WiFi` library - ESP ID generation (config_manager.cpp:8)

**Cached Configurations (Lines 137-140):**
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

### SafetyController
**Location:** `El Trabajante/src/services/actuator/safety_controller.h`

**Dependencies:**
- `ActuatorManager` - Emergency stop execution (implicit via actuatorManager global)

**Key Responsibilities:**
- Global and per-actuator emergency stop management
- Subzone isolation (Phase 9)
- Recovery orchestration with verification
- Emergency event logging

**State Machine:**
```cpp
enum class EmergencyState : uint8_t {
  EMERGENCY_NORMAL = 0,     // Normal operation
  EMERGENCY_ACTIVE,         // Emergency stop active
  EMERGENCY_CLEARING,       // Clearing emergency
  EMERGENCY_RESUMING        // Resuming operation
};
```

---

### HealthMonitor
**Location:** `El Trabajante/src/error_handling/health_monitor.h`

**Dependencies:**
- `MQTTClient` - Publishing health status
- `ErrorTracker` - Error state queries

**Key Responsibilities:**
- Periodic system health publishing (configurable interval)
- Change detection for state transitions
- Memory and CPU monitoring

---

### ErrorTracker
**Location:** `El Trabajante/src/error_handling/error_tracker.h`

**Dependencies:**
- `MQTTClient` - Publishing errors to server (via callback)
- `StorageManager` - Error persistence (optional)

**Key Responsibilities:**
- Error tracking and severity classification
- MQTT publishing of errors for server observability
- Critical error detection

---

### ProvisionManager
**Location:** `El Trabajante/src/services/provisioning/provision_manager.h`

**Dependencies:**
- `ConfigManager` - Configuration storage
- `WebServer` - HTTP endpoints
- `DNSServer` - Captive portal DNS
- `WiFi` - AP mode

**Key Responsibilities:**
- AP-mode Zero-Touch Provisioning
- Captive portal with HTTP endpoints
- Configuration validation and NVS storage
- Factory reset support

---

## Dependency Graph

```
Application Layer (main.cpp setup())
└─> Main Application
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
    │   ├─> SensorManager (for GPIO conflict check)
    │   └─> IActuatorDriver (factory-created)
    │       ├─> PumpActuator
    │       │   └─> GPIOManager (each driver holds reference)
    │       ├─> ValveActuator
    │       │   └─> GPIOManager
    │       ├─> PWMActuator
    │       │   └─> GPIOManager
    │       └─> (RELAY uses PumpActuator)
    │
    ├─> SafetyController
    │   └─> ActuatorManager (implicit)
    │
    ├─> ConfigManager
    │   ├─> StorageManager (singleton)
    │   │   └─> NVS (ESP32 hardware)
    │   └─> ErrorTracker (singleton)
    │
    └─> ProvisionManager (conditional - only when !configured)
        ├─> ConfigManager
        ├─> WebServer
        └─> DNSServer

Communication Layer (Singletons)
├─> MQTTClient
│   └─> WiFiManager
├─> WiFiManager
│   └─> CircuitBreaker
└─> HTTPClient (für Pi-Enhanced Processing)

Error Handling Layer (Singletons)
├─> ErrorTracker
│   └─> MQTTClient (via callback)
├─> HealthMonitor
│   ├─> MQTTClient
│   └─> ErrorTracker
└─> CircuitBreaker
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

    // IActuatorDriver interface (iactuator_driver.h:10-32) - VERIFIED
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
// El Trabajante/src/models/actuator_types.h (Lines 18-23)
namespace ActuatorTypeTokens {
    static const char* const PUMP = "pump";
    static const char* const VALVE = "valve";
    static const char* const PWM = "pwm";
    static const char* const RELAY = "relay";       // Binary actuator (uses PumpActuator driver)
    // static const char* const YOUR_TYPE = "your_type";  // Add new types here
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

## Initialization Order (main.cpp setup())

**Critical Order (El Trabajante/src/main.cpp):**

1. **Hardware Layer (STEP 1-3):**
   - Serial.begin() (UART)
   - gpioManager.initializeAllPinsToSafeMode() (GPIO Safe-Mode - CRITICAL FIRST!)

2. **Foundation Layer (STEP 4-5):**
   - logger.begin() (Logger System)
   - storageManager.begin() (NVS-Zugriff)

3. **Configuration Layer (STEP 6):**
   - configManager.begin() + loadAllConfigs() (lädt Configs aus NVS)
   - Boot-Loop-Detection + Watchdog Configuration

4. **Provisioning Check (STEP 6.6):**
   - provisionManager.begin() + startAPMode() (nur wenn !configured)
   - Wenn Provisioning aktiv: return early, loop() handled provisioning

5. **Error Handling Layer (STEP 7):**
   - errorTracker.begin() (Error History)
   - TopicBuilder setup (MQTT Topic Configuration)

6. **Communication Layer (STEP 10):**
   - wifiManager.begin() + connect() (WiFi mit Circuit Breaker)
   - mqttClient.begin() + connect() (MQTT mit Circuit Breaker)
   - errorTracker.setMqttPublishCallback() (MQTT-Observability aktivieren)

7. **Health Monitoring (STEP 10.5):**
   - healthMonitor.begin() (System Health Publishing)

8. **Hardware Abstraction Layer (STEP 11):**
   - i2cBusManager.begin() (I2C Bus)
   - oneWireBusManager.begin() (OneWire Bus)
   - pwmController.begin() (PWM Controller)

9. **Service Layer (STEP 12-13):**
   - sensorManager.begin() (abhängig von GPIO, MQTT, I2C, OneWire)
   - safetyController.begin() (Safety System)
   - actuatorManager.begin() (abhängig von GPIO, MQTT, Config)

**Warum diese Reihenfolge?**
- gpioManager.initializeAllPinsToSafeMode() MUSS als erstes laufen (Hardware-Schutz)
- Logger vor allem anderen (Error-Tracking verfügbar)
- ConfigManager vor Services (Services laden ihre Configs)
- Provisioning BLOCKIERT normale Boot-Flow wenn Config fehlt
- WiFi/MQTT vor Services (Services publishen via MQTT)
- I2C/OneWire Bus Manager vor SensorManager (Sensor-Kommunikation)
- SafetyController vor ActuatorManager (Safety-System bereit)

---

## Server-Side Sensor Libraries

**Location:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`

Verfügbare Sensor-Prozessoren:
- `temperature.py` - DS18B20, SHT31 Temperatur
- `humidity.py` - SHT31 Luftfeuchtigkeit
- `ph_sensor.py` - pH-Wert Analog
- `ec_sensor.py` - EC/TDS Leitfähigkeit
- `moisture.py` - Bodenfeuchtigkeit
- `pressure.py` - BMP280 Luftdruck
- `co2.py` - CO2-Konzentration
- `flow.py` - Durchflussmessung
- `light.py` - Lichtstärke/PAR

---

**Letzte Aktualisierung:** 2026-02-01
**Version:** 1.1 (Code-Verifizierung + Ergänzungen)

**Änderungen in Version 1.1:**
- SensorManager: Zeilennummern korrigiert (145-149 statt 133-138, 67-71 statt 47-51)
- ActuatorManager: createDriver Pattern erweitert (167-182), RELAY-Typ hinzugefügt
- ConfigManager: Zeilennummern korrigiert (137-140 statt 83-86), Dependencies erweitert
- NEU: SafetyController, HealthMonitor, ErrorTracker, ProvisionManager dokumentiert
- Dependency Graph erweitert (Error Handling Layer, SafetyController)
- Initialization Order komplett überarbeitet (main.cpp statt main_loop.cpp)
- Server-Side Sensor Libraries hinzugefügt
