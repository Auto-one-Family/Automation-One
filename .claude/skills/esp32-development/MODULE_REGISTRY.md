---
name: esp32-module-registry
description: Vollständige API-Referenz aller ESP32-Module. Laden bei Bedarf für Details zu Methodensignaturen, Dependencies und Konfigurationsstrukturen.
---

# ESP32 Module Registry

> **Zweck:** Nachschlagewerk für alle ESP32-Module mit vollständigen APIs
> **Laden:** Nur bei Bedarf für spezifische Implementierungsdetails

---

## Manager-Übersicht

| Manager | Pfad | Singleton | main.cpp STEP |
|---------|------|-----------|---------------|
| GPIOManager | `drivers/gpio_manager.h` | ✅ | STEP 3 (FIRST!) |
| Logger | `utils/logger.h` | ✅ | STEP 4 |
| StorageManager | `services/config/storage_manager.h` | ✅ | STEP 5 |
| Logger (NVS restore) | `utils/logger.h` | — | STEP 5.1 (log_level from NVS) |
| ConfigManager | `services/config/config_manager.h` | ✅ | STEP 6 |
| ProvisionManager | `services/provisioning/provision_manager.h` | ✅ | STEP 6.6 |
| ErrorTracker | `error_handling/error_tracker.h` | ✅ | STEP 7 |
| WiFiManager | `services/communication/wifi_manager.h` | ✅ | STEP 9 |
| TimeManager | `utils/time_manager.h` | ✅ | Nach WiFi (NTP) |
| MQTTClient | `services/communication/mqtt_client.h` | ✅ | STEP 10 |
| HealthMonitor | `error_handling/health_monitor.h` | ✅ | STEP 10.5 |
| I2CBusManager | `drivers/i2c_bus.h` | ✅ | STEP 11 |
| OneWireBusManager | `drivers/onewire_bus.h` | ✅ | STEP 11 |
| PWMController | `drivers/pwm_controller.h` | ✅ | STEP 11 |
| SensorManager | `services/sensor/sensor_manager.h` | ✅ | STEP 12 |
| SafetyController | `services/actuator/safety_controller.h` | ✅ | STEP 13 (vor Actuator!) |
| ActuatorManager | `services/actuator/actuator_manager.h` | ✅ | STEP 14 |

---

## 1. GPIOManager

**Pfad:** `src/drivers/gpio_manager.h/.cpp`
```cpp
class GPIOManager {
public:
    static GPIOManager& getInstance();
    
    // CRITICAL - Must be called FIRST in setup()!
    void initializeAllPinsToSafeMode();
    
    // Pin Reservation
    bool requestPin(uint8_t gpio, const char* owner, const char* component_name);
    bool releasePin(uint8_t gpio);
    bool isPinAvailable(uint8_t gpio) const;
    bool isPinReserved(uint8_t gpio) const;
    bool isPinInSafeMode(uint8_t gpio) const;
    
    // Configuration
    bool configurePinMode(uint8_t gpio, uint8_t mode);
    void enableSafeModeForAllPins();
    
    // Info
    GPIOPinInfo getPinInfo(uint8_t gpio) const;
    String getPinOwner(uint8_t gpio) const;
    String getPinComponent(uint8_t gpio) const;
    uint8_t getAvailablePinCount() const;
    uint8_t getReservedPinCount() const;
    std::vector<GPIOPinInfo> getReservedPinsList() const;
    
    // Subzone (Phase 9)
    bool assignPinToSubzone(uint8_t gpio, const String& subzone_id);
    bool removePinFromSubzone(uint8_t gpio);
    std::vector<uint8_t> getSubzonePins(const String& subzone_id) const;
    bool enableSafeModeForSubzone(const String& subzone_id);
};

extern GPIOManager& gpioManager;
```

### HAL Abstraction (GPIO)

**Pfad:** `src/drivers/hal/`

GPIOManager delegiert alle Hardware-Zugriffe an ein `IGPIOHal`-Interface. In Production wird `ESP32GPIOHal` (thin Arduino wrapper) verwendet, in Native Unit Tests `MockGPIOHal` (in-memory state).

| Datei | Rolle |
|-------|-------|
| `hal/igpio_hal.h` | Pure virtual interface (`IGPIOHal`) |
| `hal/esp32_gpio_hal.h` | Production: Low-Level GPIO via Arduino API, High-Level Ops = No-ops |

**Pattern:** GPIOManager handles all pin tracking internally. ESP32GPIOHal only delegates `::pinMode()`, `::digitalWrite()`, `::digitalRead()` to Arduino API. Pin queries (read-only) delegate back to GPIOManager safely (no circular risk).

**Native Test Mock:** `test/mocks/mock_gpio_hal.h` - Full in-memory GPIO state tracking.

---

## 2. SensorManager

**Pfad:** `src/services/sensor/sensor_manager.h/.cpp`

**Dependencies:** GPIOManager, MQTTClient, I2CBusManager, OneWireBusManager, PiEnhancedProcessor
```cpp
class SensorManager {
public:
    static SensorManager& getInstance();
    
    bool begin();
    void end();
    
    // Configuration
    bool configureSensor(const SensorConfig& config);
    bool removeSensor(uint8_t gpio);
    bool hasSensorOnGPIO(uint8_t gpio) const;
    SensorConfig getSensorConfig(uint8_t gpio) const;
    uint8_t getActiveSensorCount() const;
    
    // Measurement
    bool performMeasurement(uint8_t gpio, SensorReading& reading_out);
    uint8_t performMultiValueMeasurement(uint8_t gpio, SensorReading* readings_out, uint8_t max);
    void performAllMeasurements();
    void setMeasurementInterval(unsigned long interval_ms);
    bool triggerManualMeasurement(uint8_t gpio);  // Phase 2C On-Demand
};

extern SensorManager& sensorManager;
```

---

## 3. ActuatorManager

**Pfad:** `src/services/actuator/actuator_manager.h/.cpp`

**Dependencies:** GPIOManager, SafetyController
```cpp
class ActuatorManager {
public:
    static ActuatorManager& getInstance();
    
    bool begin();
    void end();
    
    // Configuration
    bool configureActuator(const ActuatorConfig& config);
    bool removeActuator(uint8_t gpio);
    bool hasActuatorOnGPIO(uint8_t gpio) const;
    ActuatorConfig getActuatorConfig(uint8_t gpio) const;
    uint8_t getActiveActuatorCount() const;
    
    // Control
    bool controlActuator(uint8_t gpio, float value);      // 0.0-1.0
    bool controlActuatorBinary(uint8_t gpio, bool state); // ON/OFF
    void processActuatorLoops();
    
    // Safety
    bool emergencyStopAll();
    bool emergencyStopActuator(uint8_t gpio);
    bool clearEmergencyStop();
    bool resumeOperation();
    
    // MQTT
    bool handleActuatorCommand(const String& topic, const String& payload);
    bool handleActuatorConfig(const String& payload, const String& correlation_id = "");
    void publishActuatorStatus(uint8_t gpio);
    void publishAllActuatorStatus();
};

extern ActuatorManager& actuatorManager;
```

---

## 4. ConfigManager

**Pfad:** `src/services/config/config_manager.h/.cpp`

**Dependencies:** StorageManager
```cpp
class ConfigManager {
public:
    static ConfigManager& getInstance();
    
    bool begin();
    bool loadAllConfigs();
    
    // WiFi
    bool loadWiFiConfig(WiFiConfig& config);
    bool saveWiFiConfig(const WiFiConfig& config);
    bool validateWiFiConfig(const WiFiConfig& config) const;
    void resetWiFiConfig();
    
    // Zone
    bool loadZoneConfig(KaiserZone& kaiser, MasterZone& master);
    bool saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master);
    bool updateZoneAssignment(const String& zone_id, const String& master_zone_id,
                              const String& zone_name, const String& kaiser_id);
    
    // Subzone
    bool saveSubzoneConfig(const SubzoneConfig& config);
    bool loadSubzoneConfig(const String& subzone_id, SubzoneConfig& config);
    bool loadAllSubzoneConfigs(SubzoneConfig configs[], uint8_t max, uint8_t& count);
    bool removeSubzoneConfig(const String& subzone_id);
    
    // System
    bool loadSystemConfig(SystemConfig& config);
    bool saveSystemConfig(const SystemConfig& config);
    bool isDeviceApproved() const;
    void setDeviceApproved(bool approved, time_t timestamp = 0);
    
    // Sensor/Actuator
    bool saveSensorConfig(const SensorConfig& config);
    bool loadSensorConfig(SensorConfig sensors[], uint8_t max, uint8_t& count);
    bool loadActuatorConfig(ActuatorConfig actuators[], uint8_t max, uint8_t& count);
    bool saveActuatorConfig(const ActuatorConfig actuators[], uint8_t count);
    
    // Getters
    const WiFiConfig& getWiFiConfig() const;
    const KaiserZone& getKaiser() const;
    String getKaiserId() const;
    String getESPId() const;
    String getDiagnosticsJSON() const;
};

extern ConfigManager& configManager;
```

---

## 5. MQTTClient

**Pfad:** `src/services/communication/mqtt_client.h/.cpp`

**Dependencies:** WiFiManager, CircuitBreaker, TopicBuilder
```cpp
class MQTTClient {
public:
    static MQTTClient& getInstance();
    
    bool begin();
    bool connect(const MQTTConfig& config);
    bool disconnect();
    bool isConnected();
    void reconnect();
    
    // Auth Transition
    bool transitionToAuthenticated(const String& username, const String& password);
    bool isAnonymousMode() const;
    
    // Pub/Sub
    bool publish(const String& topic, const String& payload, uint8_t qos = 1);
    bool safePublish(const String& topic, const String& payload, uint8_t qos = 1, uint8_t retries = 3);
    bool subscribe(const String& topic);
    void setCallback(std::function<void(const String&, const String&)> callback);
    
    // Heartbeat
    void publishHeartbeat(bool force = false);
    
    // Status
    void loop();
    CircuitState getCircuitBreakerState() const;
    bool isRegistrationConfirmed() const;
    void confirmRegistration();
};

extern MQTTClient& mqttClient;
```

---

## 6. TimeManager

**Pfad:** `src/utils/time_manager.h/.cpp`

**Dependencies:** WiFiManager (NTP benötigt WiFi)
```cpp
class TimeManager {
public:
    static TimeManager& getInstance();

    // Lifecycle
    bool begin();                              // Nach WiFi-Connect aufrufen
    void loop();                               // Für Auto-Resync

    // Timestamp Access
    time_t getUnixTimestamp() const;           // Sekunden seit 1970
    uint64_t getUnixTimestampMs() const;       // Millisekunden-Präzision
    String getFormattedTime(const char* format = "%Y-%m-%dT%H:%M:%SZ") const;

    // Status
    bool isSynchronized() const;               // NTP sync erfolgreich?
    bool isSyncFresh() const;                  // Sync noch aktuell? (<1h)
    unsigned long getTimeSinceSync() const;    // ms seit letztem Sync
    String getSyncStatus() const;              // Debug-String

    // Manual Control
    bool forceResync();                        // Erzwingt neuen NTP-Sync
    void setNTPServers(const char* primary, const char* secondary = nullptr,
                       const char* tertiary = nullptr);
};

extern TimeManager& timeManager;
```

**Wichtige Konstanten:**
- `NTP_SYNC_TIMEOUT_MS`: 10000 (10s max für Initial-Sync)
- `NTP_RESYNC_INTERVAL_MS`: 3600000 (Re-Sync alle Stunde)
- `NTP_MIN_VALID_TIMESTAMP`: 1700000000 (~2023-11)

---

## 7. SafetyController

**Pfad:** `src/services/actuator/safety_controller.h/.cpp`
```cpp
enum class EmergencyState : uint8_t {
    EMERGENCY_NORMAL = 0,
    EMERGENCY_ACTIVE,
    EMERGENCY_CLEARING,
    EMERGENCY_RESUMING
};

class SafetyController {
public:
    static SafetyController& getInstance();
    
    bool begin();
    void end();
    
    // Emergency Control
    bool emergencyStopAll(const String& reason);
    bool emergencyStopActuator(uint8_t gpio, const String& reason);
    bool isolateSubzone(const String& subzone_id, const String& reason);  // Phase 9
    bool clearEmergencyStop();
    bool clearEmergencyStopActuator(uint8_t gpio);
    bool resumeOperation();
    
    // Status
    bool isEmergencyActive() const;
    bool isEmergencyActive(uint8_t gpio) const;
    EmergencyState getEmergencyState() const;
    String getEmergencyReason() const;
    String getRecoveryProgress() const;
    
    // Config
    void setRecoveryConfig(const RecoveryConfig& config);
};

extern SafetyController& safetyController;
```

---

## 8. TopicBuilder

**Pfad:** `src/utils/topic_builder.h/.cpp`
```cpp
class TopicBuilder {
public:
    static void setEspId(const char* esp_id);
    static void setKaiserId(const char* kaiser_id);
    
    // Sensor Topics
    static const char* buildSensorDataTopic(uint8_t gpio);
    static const char* buildSensorBatchTopic();
    static const char* buildSensorCommandTopic(uint8_t gpio);
    static const char* buildSensorResponseTopic(uint8_t gpio);
    
    // Actuator Topics
    static const char* buildActuatorCommandTopic(uint8_t gpio);
    static const char* buildActuatorStatusTopic(uint8_t gpio);
    static const char* buildActuatorResponseTopic(uint8_t gpio);
    static const char* buildActuatorAlertTopic(uint8_t gpio);
    static const char* buildActuatorEmergencyTopic();
    
    // System Topics
    static const char* buildSystemHeartbeatTopic();
    static const char* buildSystemHeartbeatAckTopic();  // Server → ESP
    static const char* buildSystemCommandTopic();
    static const char* buildSystemDiagnosticsTopic();
    static const char* buildSystemErrorTopic();

    // Config Topics
    static const char* buildConfigTopic();
    static const char* buildConfigResponseTopic();

    // Zone Topics (WP3)
    static const char* buildZoneAssignTopic();
    static const char* buildZoneAckTopic();

    // Subzone Topics (Phase 9)
    static const char* buildSubzoneAssignTopic();
    static const char* buildSubzoneRemoveTopic();
    static const char* buildSubzoneAckTopic();
    static const char* buildSubzoneStatusTopic();
    static const char* buildSubzoneSafeTopic();

    // Broadcast
    static const char* buildBroadcastEmergencyTopic();
};
```

**Topic-Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/...`

---

## 9. ErrorTracker

**Pfad:** `src/error_handling/error_tracker.h/.cpp`
```cpp
class ErrorTracker {
public:
    static ErrorTracker& getInstance();
    
    bool begin();
    
    // Tracking
    void trackError(uint16_t error_code, ErrorSeverity severity, const char* message);
    void trackError(uint16_t error_code, const char* message);  // Default: ERROR
    
    // Category-specific
    void logHardwareError(uint16_t code, const char* message);
    void logServiceError(uint16_t code, const char* message);
    void logCommunicationError(uint16_t code, const char* message);
    void logApplicationError(uint16_t code, const char* message);
    
    // MQTT Integration
    void setMqttPublishCallback(MqttErrorPublishCallback callback, const String& esp_id);
    
    // Status
    String getErrorHistory(uint8_t max_entries = 20) const;
    bool hasActiveErrors() const;
    bool hasCriticalErrors() const;
};

extern ErrorTracker& errorTracker;
```

---

## 10. HealthMonitor

**Pfad:** `src/error_handling/health_monitor.h/.cpp`

**Dependencies:** ErrorTracker, MQTTClient
```cpp
class HealthMonitor {
public:
    static HealthMonitor& getInstance();

    bool begin();
    void end();

    // Snapshots
    HealthSnapshot getCurrentSnapshot() const;
    String getSnapshotJSON() const;

    // Publishing
    void publishSnapshot();
    void publishSnapshotIfChanged();

    // Metrics
    uint32_t getHeapFree() const;
    uint32_t getHeapMinFree() const;
    uint8_t getHeapFragmentation() const;
    unsigned long getUptimeSeconds() const;

    // Configuration
    void setPublishInterval(unsigned long interval_ms);
    void setChangeDetectionEnabled(bool enabled);

    void loop();
};

extern HealthMonitor& healthMonitor;
```

**Veröffentlicht via MQTT:** `kaiser/{id}/esp/{esp_id}/system/diagnostics`

---

## 11. CircuitBreaker

**Pfad:** `src/error_handling/circuit_breaker.h/.cpp`
```cpp
enum class CircuitState { CLOSED, OPEN, HALF_OPEN };

class CircuitBreaker {
public:
    CircuitBreaker(const char* service_name,
                   uint8_t failure_threshold = 5,
                   unsigned long recovery_timeout_ms = 30000,
                   unsigned long halfopen_timeout_ms = 10000);
    
    bool allowRequest();
    void recordSuccess();
    void recordFailure();
    void reset();
    
    bool isOpen() const;
    bool isClosed() const;
    CircuitState getState() const;
};
```

---

## 12. I2CBusManager

**Pfad:** `src/drivers/i2c_bus.h/.cpp`
```cpp
class I2CBusManager {
public:
    static I2CBusManager& getInstance();
    
    bool begin();
    void end();
    
    // Scan
    bool scanBus(uint8_t addresses[], uint8_t max, uint8_t& found_count);
    bool isDevicePresent(uint8_t address);
    
    // Raw I/O
    bool readRaw(uint8_t device_addr, uint8_t reg_addr, uint8_t* buffer, size_t length);
    bool writeRaw(uint8_t device_addr, uint8_t reg_addr, const uint8_t* data, size_t length);
    
    // Protocol-based
    bool readSensorRaw(const String& sensor_type, uint8_t i2c_addr, 
                       uint8_t* buffer, size_t buffer_size, size_t& bytes_read);
    bool isSensorTypeSupported(const String& sensor_type) const;
    
    // Recovery
    bool recoverBus();
    bool attemptRecoveryIfNeeded(uint8_t error_code);
    
    // Status
    bool isInitialized() const;
    String getBusStatus() const;
};

extern I2CBusManager& i2cBusManager;
```

---

## 13. OneWireBusManager

**Pfad:** `src/drivers/onewire_bus.h/.cpp`
```cpp
class OneWireBusManager {
public:
    static OneWireBusManager& getInstance();
    
    bool begin(uint8_t pin = 0);
    void end();
    
    bool scanDevices(uint8_t rom_codes[][8], uint8_t max_devices, uint8_t& found_count);
    bool isDevicePresent(const uint8_t rom_code[8]);
    bool readRawTemperature(const uint8_t rom_code[8], int16_t& raw_value);
    
    bool isInitialized() const;
    uint8_t getPin() const;
    String getBusStatus() const;
};

extern OneWireBusManager& oneWireBusManager;
```

---

## Sensor-Registry

**Pfad:** `src/models/sensor_registry.cpp`

| ESP32 Type | Server Type | Device | I2C Addr | Multi-Value |
|------------|-------------|--------|----------|-------------|
| `ds18b20` | `ds18b20` | OneWire | - | Nein |
| `temperature_sht31` | `sht31_temp` | SHT31 | 0x44 | Ja |
| `humidity_sht31` | `sht31_humidity` | SHT31 | 0x44 | Ja |
| `temperature_bmp280` | `bmp280_temp` | BMP280 | 0x76 | Ja |
| `pressure_bmp280` | `bmp280_pressure` | BMP280 | 0x76 | Ja |
| `temperature_bme280` | `bme280_temp` | BME280 | 0x76 | Ja |
| `humidity_bme280` | `bme280_humidity` | BME280 | 0x76 | Ja |
| `pressure_bme280` | `bme280_pressure` | BME280 | 0x76 | Ja |
| `ph_sensor` | `ph` | ADC | - | Nein |
| `ec_sensor` | `ec` | ADC | - | Nein |
| `moisture` | `moisture` | ADC | - | Nein |

**Hinweis:** Multi-Value bedeutet, dass ein physisches Device mehrere Sensor-Typen liefert (z.B. SHT31 → Temperatur + Humidity).

---

## IActuatorDriver Interface

**Pfad:** `src/services/actuator/actuator_drivers/iactuator_driver.h`
```cpp
class IActuatorDriver {
public:
    virtual ~IActuatorDriver() = default;

    // Lifecycle
    virtual bool begin(const ActuatorConfig& config) = 0;
    virtual void end() = 0;
    virtual bool isInitialized() const = 0;

    // Control
    virtual bool setValue(float normalized_value) = 0;  // 0.0 - 1.0
    virtual bool setBinary(bool state) = 0;             // ON/OFF
    virtual void loop() = 0;                            // Periodic updates

    // Safety
    virtual bool emergencyStop(const String& reason) = 0;
    virtual bool clearEmergency() = 0;

    // Status
    virtual ActuatorStatus getStatus() const = 0;
    virtual const ActuatorConfig& getConfig() const = 0;
    virtual String getType() const = 0;
};
```

**Implementierungen:**
- `PumpActuator` - pump, relay (mit RuntimeProtection)
- `PWMActuator` - pwm (0.0-1.0 → 0-255)
- `ValveActuator` - valve (Binary)

---

## Data Structures

### SensorConfig
```cpp
struct SensorConfig {
    uint8_t gpio = 255;
    String sensor_type = "";           // "ph_sensor", "ds18b20"
    String sensor_name = "";
    String subzone_id = "";
    bool active = false;
    String operating_mode = "continuous";  // "on_demand", "paused", "scheduled"
    uint32_t measurement_interval_ms = 30000;
    bool raw_mode = true;              // ALWAYS true (Server-Centric)
    uint32_t last_raw_value = 0;
    unsigned long last_reading = 0;
    String onewire_address = "";       // ROM-Code for DS18B20
};
```

### ActuatorConfig
```cpp
struct ActuatorConfig {
    uint8_t gpio = 255;
    uint8_t aux_gpio = 255;
    String actuator_type = "";         // "pump", "valve", "pwm", "relay"
    String actuator_name = "";
    String subzone_id = "";
    bool active = false;
    bool critical = false;
    uint8_t pwm_channel = 255;
    bool inverted_logic = false;
    uint8_t default_pwm = 0;
    bool default_state = false;
    bool current_state = false;
    uint8_t current_pwm = 0;
    unsigned long last_command_ts = 0;
    unsigned long accumulated_runtime_ms = 0;
    RuntimeProtection runtime_protection;
};
```

### RuntimeProtection
```cpp
struct RuntimeProtection {
    unsigned long max_runtime_ms = 3600000UL;      // 1h cap
    uint16_t max_activations_per_hour = 60;
    unsigned long cooldown_ms = 30000UL;           // 30s after cutoff
    unsigned long activation_window_ms = 3600000UL;
};
```

---

## Error-Code Ranges

| Range | Category | Examples |
|-------|----------|----------|
| 1000-1999 | HARDWARE | GPIO, I2C, PWM, OneWire |
| 2000-2999 | SERVICE | NVS, Config, Logger, Subzone |
| 3000-3999 | COMMUNICATION | WiFi, MQTT, HTTP |
| 4000-4999 | APPLICATION | State, Memory, Watchdog |

### Critical Codes
```cpp
#define ERROR_GPIO_CONFLICT         1002
#define ERROR_I2C_DEVICE_NOT_FOUND  1011
#define ERROR_I2C_BUS_STUCK         1015
#define ERROR_ONEWIRE_NO_DEVICES    1021
#define ERROR_DS18B20_SENSOR_FAULT  1060
#define ERROR_SUBZONE_GPIO_CONFLICT 2501
#define ERROR_MQTT_CONNECT_FAILED   3011
#define ERROR_WIFI_CONNECT_TIMEOUT  3002
#define ERROR_WATCHDOG_TIMEOUT      4070
#define ERROR_DEVICE_REJECTED       4200
```

---

## NVS Keys Reference

| Namespace | Key | Type | Description |
|-----------|-----|------|-------------|
| `wifi` | `ssid` | String | WiFi SSID |
| `wifi` | `password` | String | WiFi Password |
| `wifi` | `server` | String | Server Address |
| `wifi` | `mqtt_port` | uint16 | MQTT Port |
| `wifi` | `configured` | bool | Config Status |
| `zone` | `zone_id` | String | Primary Zone ID |
| `zone` | `master_id` | String | Master Zone ID |
| `zone` | `zone_name` | String | Zone Name |
| `zone` | `kaiser_id` | String | Kaiser ID |
| `system` | `esp_id` | String | ESP Identifier |
| `system` | `state` | uint8 | System State |
| `system` | `boot_cnt` | uint16 | Boot Counter |

---

## QoS Reference

| Message Type | QoS | Reason |
|--------------|-----|--------|
| Sensor Data | 1 | At-least-once |
| Actuator Commands | 1 | Must arrive |
| Heartbeat | 0 | Fire-and-forget |
| Error Reports | 0 | Non-blocking |
| Emergency Stop | 1 | Safety-critical |

---

*Vollständige API-Referenz für ESP32-Entwicklung*