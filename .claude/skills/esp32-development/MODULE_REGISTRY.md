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
| PortalAuthority | `services/provisioning/portal_authority.h` | ✅ | STEP 6.7 (nach ProvisionManager) |
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
| OfflineModeManager | `services/safety/offline_mode_manager.h` | ✅ | STEP 14.5 (nach Actuator, loadNVS vor MQTT) |
| Watchdog NVS (utility) | `utils/watchdog_storage.h` | — | Nach `storageManager.begin()`; Finalize nach NTP (`WiFiManager` / `loop`) |

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
    uint8_t countSensorsWithSubzone(const String& subzone_id) const;  // Phase 9
    
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
    uint8_t countActuatorsWithSubzone(const String& subzone_id) const;  // Phase 9
    
    // Control
    bool controlActuator(uint8_t gpio, float value);      // 0.0-1.0
    bool controlActuatorBinary(uint8_t gpio, bool state); // ON/OFF
    void processActuatorLoops();
    
    // Safety
    bool emergencyStopAll();
    bool emergencyStopActuator(uint8_t gpio);
    bool clearEmergencyStop();
    bool resumeOperation();
    void setAllActuatorsToSafeState(); // SAFETY: default_state — unmittelbar bei Disconnect/P1 nur wenn keine Offline-Rules (sonst P4)
    
    // MQTT
    bool handleActuatorCommand(const String& topic, const String& payload);
    bool handleActuatorConfig(JsonArray actuators, const String& correlation_id = "");  // CP-B1: pre-parsed
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

**Backends:** **Standard (ohne Define, `esp32_dev`):** ESP-IDF MQTT (`esp_mqtt_client_handle_t`, `g_mqtt_connected`, Event-Handler `MQTT_EVENT_*`). **`MQTT_USE_PUBSUBCLIENT=1`** (seeed_xiao, Wokwi): PubSubClient + `offline_buffer_`, `setCallback`. Partition/SDK: optional `sdkconfig.defaults` (`CONFIG_MQTT_TASK_CORE_SELECTION_*`) für MQTT-Task auf Core 0.

**SAFETY-RTOS M3 (nur ESP-IDF):** `void processPublishQueue()` leert `g_publish_queue` (Core 1 → Core 0); Aufruf aus `communication_task.cpp` nach `loop()`. `publish()` auf Core 1 enqueued.

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
    void setOnConnectCallback(std::function<void()> callback); // SAFETY-P1: fired after every connect/reconnect
    
    // Heartbeat
    void publishHeartbeat(bool force = false);
    
    // Status / Monitoring (loop(): siehe Communication-Task nach M3)
    void loop();
#ifndef MQTT_USE_PUBSUBCLIENT
    void processPublishQueue();  // M3: nur ESP-IDF
#endif
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

## 6.1 Watchdog NVS (utility)

**Pfad:** `src/utils/watchdog_storage.h/.cpp`

**NVS:** Namespace `wdt_diag` — Keys `hist` (24h-Rolling), `snap` (letzter Snapshot). Details: `El Trabajante/docs/NVS_KEYS.md`.

**API (Free Functions):** `watchdogStorageInitEarly()`, `watchdogStorageTryFinalizeBootRecord()`, `watchdogStorageGetCountLast24h()`, `watchdogStorageGetHistNotFoundExpectedCount()`, `watchdogStorageGetHistNotFoundUnexpectedCount()`, `watchdogStorageSaveDiagnosticsSnapshot()`, `watchdogStorageLogLastSnapshotIfAny()`.

**Firmware-Version (Build):** `src/config/firmware_version.h` — Makro `KAISER_FIRMWARE_VERSION_STRING`; Override in `platformio.ini` z. B. `'-DKAISER_FIRMWARE_VERSION_STRING="4.0.0"'`.

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
    
    // MQTT Integration (rate-limited: max 1 publish per error code per 60s)
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

## 14. ProvisionManager

**Pfad:** `src/services/provisioning/provision_manager.h/.cpp`

**Dependencies:** ConfigManager, WebServer, DNSServer, WiFi
```cpp
class ProvisionManager {
public:
    static ProvisionManager& getInstance();

    bool begin();
    bool needsProvisioning() const;

    // AP-Mode: WIFI_AP (STA trennt)
    bool startAPMode();

    // AP+STA-Mode: Paralleler Reconnect bei MQTT-Disconnect, Config bleibt
    bool startAPModeForReconfig();

    bool waitForConfig(uint32_t timeout_ms);
    void stop();
    void loop();

    bool isConfigReceived() const;
    // ... weitere Getter
};
```

**Verwendung:** `startAPMode()` fuer initiale Konfiguration; `startAPModeForReconfig()` bei MQTT-Disconnect (main.cpp setup/loop).

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
    uint8_t i2c_address = 0;          // 7-bit I2C address (0x00-0x7F)
    // Circuit Breaker (F7 — per-sensor runtime state)
    SensorCBState cb_state = SensorCBState::CLOSED;  // CLOSED/OPEN/HALF_OPEN
    uint32_t cb_open_since_ms = 0;     // millis() when entering OPEN
    uint8_t consecutive_failures = 0;  // Consecutive measurement failures
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

## OfflineModeManager (SAFETY-P4)

**Pfad:** `src/services/safety/offline_mode_manager.h/.cpp`
```cpp
enum class OfflineMode : uint8_t { ONLINE, DISCONNECTED, OFFLINE_ACTIVE, RECONNECTING };

class OfflineModeManager {
public:
    static OfflineModeManager& getInstance();

    // State-Machine Hooks (in mqtt_client.cpp, safety_controller.cpp, main.cpp)
    void onDisconnect();           // ONLINE → DISCONNECTED, starts 30s timer (no-op in DISCONNECTED/OFFLINE_ACTIVE/RECONNECTING)
    void onReconnect();            // OFFLINE_ACTIVE → RECONNECTING (rules keep running)
    void onServerAckReceived();    // RECONNECTING → ONLINE (deactivates rules)
    void onEmergencyStop();        // Any → ONLINE (clears all rules)

    // Integration: Safety-Task (checkDelayTimer + evaluateOfflineRules); Legacy-loop ohne RTOS-Tasks wie früher main.cpp
    void checkDelayTimer();        // DISCONNECTED → OFFLINE_ACTIVE nach 30s
    void evaluateOfflineRules();   // Hysterese-Auswertung, 5s-Intervall extern; ph/ec/moisture-Rules werden via requiresCalibration()-Guard gefiltert (ADC-Rohwert != phys. Einheit)

    // Config (via handleOfflineRulesConfig in main.cpp)
    void parseOfflineRules(JsonObject obj);   // 3-Semantiken: fehlt/leer/Inhalt; LE-01: parst time_filter (start_hour/start_minute/end_hour/end_minute UTC + enabled)
    void loadOfflineRulesFromNVS();           // Boot: nach actuatorManager.begin(); v1 = Blob-Format; v0 → v1 Migration via _deleteOldIndividualKeys()
    void saveOfflineRulesToNVS();             // memcmp-Shadow: schreibt NVS nur bei echten Änderungen (Blob v1)

    // Server-Override (in actuator_manager.cpp::handleActuatorCommand)
    void setServerOverride(uint8_t actuator_gpio);

    // Status
    bool isOfflineActive() const;  // true wenn OFFLINE_ACTIVE oder RECONNECTING
    OfflineMode getMode() const;
    uint8_t getOfflineRuleCount() const;  // NVS/Config: 0 → Disconnect-Pfade dürfen sofort safe setzen
};

extern OfflineModeManager& offlineModeManager;
```

**State-Transitions:**

| Von | Nach | Trigger |
|-----|------|---------|
| ONLINE | DISCONNECTED | `onDisconnect()` |
| DISCONNECTED | OFFLINE_ACTIVE | `checkDelayTimer()` nach 30s + min. 1 Regel |
| OFFLINE_ACTIVE | RECONNECTING | `onReconnect()` |
| RECONNECTING | ONLINE | `onServerAckReceived()` |
| Any | ONLINE | `onEmergencyStop()` |

**Delay-Konstante:** `OFFLINE_ACTIVATION_DELAY_MS = 30000UL`

**Koordination SAFETY-P1 (Server-ACK-Timeout in `main.cpp::checkServerAckTimeout`) / MQTT-Disconnect:** `onDisconnect()` wird immer aufgerufen. Unmittelbares `setAllActuatorsToSafeState()` nur bei `getOfflineRuleCount() == 0`; sonst Delegation an P4 (kein „falsches AUS” in der Grace-Phase). `activateOfflineMode()` bestätigt bei 0 Rules zusätzlich safe state (Defense-in-Depth). `activateOfflineMode()` initialisiert `is_active` jeder Regel aus dem echten Aktor-Hardware-State (`actuatorManager.getActuatorConfig(gpio).current_state`) — verhindert falsches Doppel-AN bei Mehrfach-Regeln, wenn ein Aktor vor Disconnect bereits AN war. `g_last_server_ack_ms` ist global (`std::atomic<uint32_t>`, nicht `static`) und wird im ESP-IDF `MQTT_EVENT_CONNECTED`-Handler sofort zurückgesetzt — vor Aufruf der `on_connect_callback_` — um die Race-Condition zwischen Core 0 (MQTT-Event) und Safety-Task Core 1 zu schließen.

---

## PortalAuthority (Provisioning)

**Pfad:** `src/services/provisioning/portal_authority.h/.cpp`

Zuständig für die Entscheidungslogik, ob und wann der ESP32 in den Captive-Portal-Modus wechselt. Trennt die Entscheidungslogik von der WiFi-Verbindungslogik (`ProvisionManager`).

```cpp
class PortalAuthority {
public:
    static PortalAuthority& getInstance();
    bool shouldStartPortal() const;
    void notifyConnectFailed();
    void notifyConnectSuccess();
    void reset();
};
```

---

## IntentContract (Task-Layer)

**Pfad:** `src/tasks/intent_contract.h/.cpp`

Client-seitiger Intent/Outcome-Vertrag für Paket 09. ESP32 meldet Ergebnisse von Command- und Config-Intents via MQTT zurück an den Server.

```cpp
struct IntentMetadata {
    char intent_id[64];
    char correlation_id[64];
    uint32_t generation;
    uint32_t created_at_ms;
    uint32_t ttl_ms;
    uint32_t epoch_at_accept;
};

void initIntentMetadata(IntentMetadata* metadata);
IntentMetadata extractIntentMetadataFromPayload(const char* payload, const char* fallback_prefix);
bool isIntentExpired(const IntentMetadata& metadata, uint32_t current_epoch);
bool isRecoveryIntentAllowed(const char* topic, const char* payload);

// Publish outcome to kaiser/{id}/esp/{esp_id}/system/intent_outcome
bool publishIntentOutcome(const char* flow, const IntentMetadata& metadata,
                          const char* outcome, const char* code,
                          const String& reason, bool retryable);
void processIntentOutcomeOutbox();

uint32_t getSafetyEpoch();
uint32_t bumpSafetyEpoch(const char* reason);
```

**Outcome-Werte:** `accepted` | `rejected` | `applied` | `persisted` | `failed` | `expired`
**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome` (QoS 1)
**Outbox-NVS:** Namespace `io_outbox` mit Ringbuffer (`head`, `count`, `s{idx}_*`) und Stats (`retry_total`, `recovered_total`, `drop_total`, `fin_ok_total`).
`fin_ok_total` ist absichtlich kurz benannt (NVS key length limit).

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
| `offline` | `ofr_ver` | uint8 | Schema-Version (0 = legacy, 1 = Blob v1) |
| `offline` | `ofr_count` | uint8 | Anzahl Offline-Regeln (max 8) |
| `offline` | `ofr_blob` | Blob | Packed `OfflineRule[]` (56 Bytes/Regel) + CRC8 Trailer (SAFETY-P4 + LE-01) |
| `io_outbox` | `head` / `count` / `s{idx}_*` | mixed | Pending Intent-Outcome Replay-Ringbuffer |
| `io_outbox` | `retry_total` / `recovered_total` / `drop_total` / `fin_ok_total` | uint32 | Outcome-Replay/Finalitäts-Stats |

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