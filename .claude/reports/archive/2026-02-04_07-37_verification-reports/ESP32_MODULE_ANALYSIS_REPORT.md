# ESP32 El Trabajante - Vollst\u00e4ndige Modul-Analyse

> **Erstellt:** 2026-02-04
> **Zweck:** Spezialisierter ESP32-Development-Skill f\u00fcr Claude Code
> **Architektur:** Server-Zentrisch (Pi-Enhanced Mode)

---

## \u00dcbersicht

| Metrik | Wert |
|--------|------|
| Gesamt C++/H Dateien | 82 |
| Core-Manager/Services | 12 |
| Sensor-Drivers | 5 |
| Actuator-Drivers | 3 |
| Error-Handling Modules | 3 |
| Hardware-Drivers | 4 |
| Utils | 8 |

### Ordnerstruktur

```
El Trabajante/
\u251c\u2500\u2500 src/
\u2502   \u251c\u2500\u2500 config/                    # Build-Konfiguration
\u2502   \u2502   \u251c\u2500\u2500 feature_flags.h
\u2502   \u2502   \u251c\u2500\u2500 system_config.h
\u2502   \u2502   \u2514\u2500\u2500 hardware/              # Board-spezifische Configs
\u2502   \u2502       \u251c\u2500\u2500 esp32_dev.h
\u2502   \u2502       \u2514\u2500\u2500 xiao_esp32c3.h
\u2502   \u251c\u2500\u2500 core/                      # Application-Kern (Stubs)
\u2502   \u2502   \u251c\u2500\u2500 application.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 main_loop.h/.cpp
\u2502   \u2502   \u2514\u2500\u2500 system_controller.h/.cpp
\u2502   \u251c\u2500\u2500 drivers/                   # Hardware Abstraction Layer
\u2502   \u2502   \u251c\u2500\u2500 gpio_manager.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 i2c_bus.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 i2c_sensor_protocol.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 onewire_bus.h/.cpp
\u2502   \u2502   \u2514\u2500\u2500 pwm_controller.h/.cpp
\u2502   \u251c\u2500\u2500 error_handling/            # Fehler-Management
\u2502   \u2502   \u251c\u2500\u2500 circuit_breaker.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 error_tracker.h/.cpp
\u2502   \u2502   \u2514\u2500\u2500 health_monitor.h/.cpp
\u2502   \u251c\u2500\u2500 models/                    # Datenstrukturen & Types
\u2502   \u2502   \u251c\u2500\u2500 actuator_types.h
\u2502   \u2502   \u251c\u2500\u2500 config_types.h
\u2502   \u2502   \u251c\u2500\u2500 error_codes.h
\u2502   \u2502   \u251c\u2500\u2500 mqtt_messages.h
\u2502   \u2502   \u251c\u2500\u2500 sensor_registry.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 sensor_types.h
\u2502   \u2502   \u251c\u2500\u2500 system_state.h
\u2502   \u2502   \u251c\u2500\u2500 system_types.h
\u2502   \u2502   \u2514\u2500\u2500 watchdog_types.h
\u2502   \u251c\u2500\u2500 services/                  # Business-Logic Services
\u2502   \u2502   \u251c\u2500\u2500 actuator/
\u2502   \u2502   \u2502   \u251c\u2500\u2500 actuator_manager.h/.cpp
\u2502   \u2502   \u2502   \u251c\u2500\u2500 safety_controller.h/.cpp
\u2502   \u2502   \u2502   \u2514\u2500\u2500 actuator_drivers/
\u2502   \u2502   \u2502       \u251c\u2500\u2500 iactuator_driver.h
\u2502   \u2502   \u2502       \u251c\u2500\u2500 pump_actuator.h/.cpp
\u2502   \u2502   \u2502       \u251c\u2500\u2500 pwm_actuator.h/.cpp
\u2502   \u2502   \u2502       \u2514\u2500\u2500 valve_actuator.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 communication/
\u2502   \u2502   \u2502   \u251c\u2500\u2500 http_client.h/.cpp
\u2502   \u2502   \u2502   \u251c\u2500\u2500 mqtt_client.h/.cpp
\u2502   \u2502   \u2502   \u251c\u2500\u2500 network_discovery.h/.cpp
\u2502   \u2502   \u2502   \u251c\u2500\u2500 webserver.h/.cpp
\u2502   \u2502   \u2502   \u2514\u2500\u2500 wifi_manager.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 config/
\u2502   \u2502   \u2502   \u251c\u2500\u2500 config_manager.h/.cpp
\u2502   \u2502   \u2502   \u251c\u2500\u2500 config_response.h/.cpp
\u2502   \u2502   \u2502   \u251c\u2500\u2500 library_manager.h/.cpp
\u2502   \u2502   \u2502   \u251c\u2500\u2500 storage_manager.h/.cpp
\u2502   \u2502   \u2502   \u2514\u2500\u2500 wifi_config.h/.cpp
\u2502   \u2502   \u251c\u2500\u2500 provisioning/
\u2502   \u2502   \u2502   \u2514\u2500\u2500 provision_manager.h/.cpp
\u2502   \u2502   \u2514\u2500\u2500 sensor/
\u2502   \u2502       \u251c\u2500\u2500 pi_enhanced_processor.h/.cpp
\u2502   \u2502       \u251c\u2500\u2500 sensor_factory.h/.cpp
\u2502   \u2502       \u251c\u2500\u2500 sensor_manager.h/.cpp
\u2502   \u2502       \u2514\u2500\u2500 sensor_drivers/
\u2502   \u2502           \u251c\u2500\u2500 isensor_driver.h (STUB)
\u2502   \u2502           \u251c\u2500\u2500 i2c_sensor_generic.h/.cpp
\u2502   \u2502           \u251c\u2500\u2500 ph_sensor.h/.cpp
\u2502   \u2502           \u251c\u2500\u2500 temp_sensor_ds18b20.h/.cpp (STUB)
\u2502   \u2502           \u2514\u2500\u2500 temp_sensor_sht31.h/.cpp (STUB)
\u2502   \u2514\u2500\u2500 utils/
\u2502       \u251c\u2500\u2500 data_buffer.h/.cpp
\u2502       \u251c\u2500\u2500 json_helpers.h
\u2502       \u251c\u2500\u2500 logger.h/.cpp
\u2502       \u251c\u2500\u2500 onewire_utils.h/.cpp
\u2502       \u251c\u2500\u2500 string_helpers.h/.cpp
\u2502       \u251c\u2500\u2500 time_manager.h/.cpp
\u2502       \u2514\u2500\u2500 topic_builder.h/.cpp
\u251c\u2500\u2500 main.cpp                       # ~1500 Zeilen, Hauptlogik
\u2514\u2500\u2500 platformio.ini                 # 4 Environments
```

---

## Core-Manager (Singletons)

### 1. SensorManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/sensor/sensor_manager.h` |
| **Implementation** | `src/services/sensor/sensor_manager.cpp` |
| **Singleton** | \u2705 `SensorManager::getInstance()` |
| **Global Ref** | `extern SensorManager& sensorManager;` |
| **Initialisierung** | `main.cpp` Phase 4 (nach MQTT connect) |

**Dependencies:**
- GPIOManager
- MQTTClient
- I2CBusManager
- OneWireBusManager
- PiEnhancedProcessor

**Public API:**
```cpp
bool begin();
void end();
bool configureSensor(const SensorConfig& config);
bool removeSensor(uint8_t gpio);
bool hasSensorOnGPIO(uint8_t gpio) const;
SensorConfig getSensorConfig(uint8_t gpio) const;
uint8_t getActiveSensorCount() const;
bool performMeasurement(uint8_t gpio, SensorReading& reading_out);
uint8_t performMultiValueMeasurement(uint8_t gpio, SensorReading* readings_out, uint8_t max);
void performAllMeasurements();
void setMeasurementInterval(unsigned long interval_ms);
bool triggerManualMeasurement(uint8_t gpio);  // Phase 2C: On-Demand
```

---

### 2. ActuatorManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/actuator/actuator_manager.h` |
| **Implementation** | `src/services/actuator/actuator_manager.cpp` |
| **Singleton** | \u2705 `ActuatorManager::getInstance()` |
| **Global Ref** | `extern ActuatorManager& actuatorManager;` |
| **Initialisierung** | `main.cpp` Phase 5 (nach SensorManager) |

**Dependencies:**
- GPIOManager
- SafetyController

**Public API:**
```cpp
bool begin();
void end();
bool configureActuator(const ActuatorConfig& config);
bool removeActuator(uint8_t gpio);
bool hasActuatorOnGPIO(uint8_t gpio) const;
ActuatorConfig getActuatorConfig(uint8_t gpio) const;
uint8_t getActiveActuatorCount() const;
bool controlActuator(uint8_t gpio, float value);
bool controlActuatorBinary(uint8_t gpio, bool state);
bool emergencyStopAll();
bool emergencyStopActuator(uint8_t gpio);
bool clearEmergencyStop();
bool resumeOperation();
void processActuatorLoops();
bool handleActuatorCommand(const String& topic, const String& payload);
bool handleActuatorConfig(const String& payload, const String& correlation_id = "");
void publishActuatorStatus(uint8_t gpio);
void publishAllActuatorStatus();
```

---

### 3. ConfigManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/config/config_manager.h` |
| **Implementation** | `src/services/config/config_manager.cpp` |
| **Singleton** | \u2705 `ConfigManager::getInstance()` |
| **Global Ref** | `extern ConfigManager& configManager;` |
| **Initialisierung** | `main.cpp` STEP 6, Zeile ~268 |

**Dependencies:**
- StorageManager

**Public API:**
```cpp
bool begin();
bool loadAllConfigs();
bool loadWiFiConfig(WiFiConfig& config);
bool saveWiFiConfig(const WiFiConfig& config);
bool validateWiFiConfig(const WiFiConfig& config) const;
void resetWiFiConfig();
bool loadZoneConfig(KaiserZone& kaiser, MasterZone& master);
bool saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master);
bool updateZoneAssignment(const String& zone_id, const String& master_zone_id,
                          const String& zone_name, const String& kaiser_id);
bool saveSubzoneConfig(const SubzoneConfig& config);
bool loadSubzoneConfig(const String& subzone_id, SubzoneConfig& config);
bool loadAllSubzoneConfigs(SubzoneConfig configs[], uint8_t max_configs, uint8_t& loaded_count);
bool removeSubzoneConfig(const String& subzone_id);
bool loadSystemConfig(SystemConfig& config);
bool saveSystemConfig(const SystemConfig& config);
bool isDeviceApproved() const;
void setDeviceApproved(bool approved, time_t timestamp = 0);
bool saveSensorConfig(const SensorConfig& config);
bool loadSensorConfig(SensorConfig sensors[], uint8_t max_sensors, uint8_t& loaded_count);
bool loadActuatorConfig(ActuatorConfig actuators[], uint8_t max_actuators, uint8_t& loaded_count);
bool saveActuatorConfig(const ActuatorConfig actuators[], uint8_t actuator_count);
String getDiagnosticsJSON() const;
const WiFiConfig& getWiFiConfig() const;
const KaiserZone& getKaiser() const;
String getKaiserId() const;
String getESPId() const;
```

---

### 4. StorageManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/config/storage_manager.h` |
| **Implementation** | `src/services/config/storage_manager.cpp` |
| **Singleton** | \u2705 `StorageManager::getInstance()` |
| **Global Ref** | `extern StorageManager& storageManager;` |
| **Initialisierung** | `main.cpp` STEP 5, Zeile ~260 |

**Features:**
- NVS (Non-Volatile Storage) Wrapper
- Thread-Safety via Mutex (`CONFIG_ENABLE_THREAD_SAFETY`)
- Namespace Management

**Public API:**
```cpp
bool begin();
bool beginNamespace(const char* namespace_name, bool read_only = false);
void endNamespace();
bool putString(const char* key, const char* value);
const char* getString(const char* key, const char* default_value = nullptr);
bool putInt(const char* key, int value);
int getInt(const char* key, int default_value = 0);
bool putUInt8(const char* key, uint8_t value);
bool putBool(const char* key, bool value);
bool getBool(const char* key, bool default_value = false);
bool putFloat(const char* key, float value);
float getFloat(const char* key, float default_value = 0.0f);
bool clearNamespace();
bool eraseKey(const char* key);
bool keyExists(const char* key);
size_t getFreeEntries();
String getStringObj(const char* key, const String& default_value = "");
```

---

### 5. ProvisionManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/provisioning/provision_manager.h` |
| **Implementation** | `src/services/provisioning/provision_manager.cpp` |
| **Singleton** | \u2705 `ProvisionManager::getInstance()` |
| **Global Ref** | `extern ProvisionManager& provisionManager;` |
| **Initialisierung** | `main.cpp` STEP 6.6 (nur wenn Config fehlt) |

**Features:**
- ESP-AP-basiertes Zero-Touch Provisioning
- Captive Portal mit DNS-Server
- HTTP-Endpoints: `/`, `/provision`, `/status`, `/reset`
- State Machine: IDLE \u2192 AP_MODE \u2192 WAITING_CONFIG \u2192 CONFIG_RECEIVED \u2192 COMPLETE

**Public API:**
```cpp
bool begin();
bool needsProvisioning() const;
bool startAPMode();
bool waitForConfig(uint32_t timeout_ms);
void stop();
ProvisionState getState() const;
String getStateString() const;
bool isConfigReceived() const;
void loop();
```

---

### 6. MQTTClient

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/communication/mqtt_client.h` |
| **Implementation** | `src/services/communication/mqtt_client.cpp` |
| **Singleton** | \u2705 `MQTTClient::getInstance()` |
| **Global Ref** | `extern MQTTClient& mqttClient;` |
| **Initialisierung** | `main.cpp` STEP 10, Zeile ~677 |

**Dependencies:**
- WiFiManager
- CircuitBreaker
- TopicBuilder

**Features:**
- Offline-Buffer (100 Messages)
- Circuit Breaker Pattern
- Anonymous + Authenticated Mode
- Heartbeat (60s Interval)

**Public API:**
```cpp
bool begin();
bool connect(const MQTTConfig& config);
bool disconnect();
bool isConnected();
void reconnect();
bool transitionToAuthenticated(const String& username, const String& password);
bool isAnonymousMode() const;
bool publish(const String& topic, const String& payload, uint8_t qos = 1);
bool safePublish(const String& topic, const String& payload, uint8_t qos = 1, uint8_t retries = 3);
bool subscribe(const String& topic);
void setCallback(std::function<void(const String&, const String&)> callback);
void publishHeartbeat(bool force = false);
void loop();
CircuitState getCircuitBreakerState() const;
bool isRegistrationConfirmed() const;
void confirmRegistration();
```

---

### 7. WiFiManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/communication/wifi_manager.h` |
| **Implementation** | `src/services/communication/wifi_manager.cpp` |
| **Singleton** | \u2705 `WiFiManager::getInstance()` |
| **Global Ref** | `extern WiFiManager& wifiManager;` |
| **Initialisierung** | `main.cpp` STEP 10, Zeile ~609 |

**Features:**
- Circuit Breaker Pattern
- Reconnection-Management

**Public API:**
```cpp
bool begin();
bool connect(const WiFiConfig& config);
bool disconnect();
bool isConnected() const;
void reconnect();
String getConnectionStatus() const;
int8_t getRSSI() const;
IPAddress getLocalIP() const;
String getSSID() const;
void loop();
CircuitState getCircuitBreakerState() const;
```

---

### 8. SafetyController

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/services/actuator/safety_controller.h` |
| **Implementation** | `src/services/actuator/safety_controller.cpp` |
| **Singleton** | \u2705 `SafetyController::getInstance()` |
| **Global Ref** | `extern SafetyController& safetyController;` |
| **Initialisierung** | Nach ActuatorManager |

**Public API:**
```cpp
bool begin();
void end();
bool emergencyStopAll(const String& reason);
bool emergencyStopActuator(uint8_t gpio, const String& reason);
bool isolateSubzone(const String& subzone_id, const String& reason);  // Phase 9
bool clearEmergencyStop();
bool clearEmergencyStopActuator(uint8_t gpio);
bool resumeOperation();
bool isEmergencyActive() const;
bool isEmergencyActive(uint8_t gpio) const;
EmergencyState getEmergencyState() const;
void setRecoveryConfig(const RecoveryConfig& config);
String getEmergencyReason() const;
String getRecoveryProgress() const;
```

---

### 9. GPIOManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/drivers/gpio_manager.h` |
| **Implementation** | `src/drivers/gpio_manager.cpp` |
| **Singleton** | \u2705 `GPIOManager::getInstance()` |
| **Global Ref** | `extern GPIOManager& gpioManager;` |
| **Initialisierung** | `main.cpp` STEP 3, Zeile ~248 (ERSTE Initialisierung!) |

**KRITISCH:** Muss als erstes initialisiert werden f\u00fcr Hardware-Safety!

**Public API:**
```cpp
void initializeAllPinsToSafeMode();  // CRITICAL - FIRST!
bool requestPin(uint8_t gpio, const char* owner, const char* component_name);
bool releasePin(uint8_t gpio);
bool configurePinMode(uint8_t gpio, uint8_t mode);
bool isPinAvailable(uint8_t gpio) const;
bool isPinReserved(uint8_t gpio) const;
bool isPinInSafeMode(uint8_t gpio) const;
void enableSafeModeForAllPins();
GPIOPinInfo getPinInfo(uint8_t gpio) const;
String getPinOwner(uint8_t gpio) const;
String getPinComponent(uint8_t gpio) const;
void printPinStatus() const;
uint8_t getAvailablePinCount() const;
std::vector<GPIOPinInfo> getReservedPinsList() const;
uint8_t getReservedPinCount() const;
void releaseI2CPins();
// Phase 9: Subzone
bool assignPinToSubzone(uint8_t gpio, const String& subzone_id);
bool removePinFromSubzone(uint8_t gpio);
std::vector<uint8_t> getSubzonePins(const String& subzone_id) const;
bool isPinAssignedToSubzone(uint8_t gpio, const String& subzone_id = "") const;
bool isSubzoneSafe(const String& subzone_id) const;
bool enableSafeModeForSubzone(const String& subzone_id);
```

---

### 10. I2CBusManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/drivers/i2c_bus.h` |
| **Implementation** | `src/drivers/i2c_bus.cpp` |
| **Singleton** | \u2705 `I2CBusManager::getInstance()` |
| **Global Ref** | `extern I2CBusManager& i2cBusManager;` |

**Features:**
- Protocol-Registry f\u00fcr I2C-Sensoren
- CRC-Validierung
- Bus-Recovery

**Public API:**
```cpp
bool begin();
void end();
bool scanBus(uint8_t addresses[], uint8_t max_addresses, uint8_t& found_count);
bool isDevicePresent(uint8_t address);
bool readRaw(uint8_t device_address, uint8_t register_address, uint8_t* buffer, size_t length);
bool writeRaw(uint8_t device_address, uint8_t register_address, const uint8_t* data, size_t length);
bool readSensorRaw(const String& sensor_type, uint8_t i2c_address, uint8_t* buffer, size_t buffer_size, size_t& bytes_read);
bool isSensorTypeSupported(const String& sensor_type) const;
void getSupportedI2CSensorTypes(String types[], uint8_t max_count, uint8_t& count) const;
bool isInitialized() const;
String getBusStatus() const;
bool recoverBus();
bool attemptRecoveryIfNeeded(uint8_t error_code);
```

---

### 11. OneWireBusManager

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/drivers/onewire_bus.h` |
| **Implementation** | `src/drivers/onewire_bus.cpp` |
| **Singleton** | \u2705 `OneWireBusManager::getInstance()` |
| **Global Ref** | `extern OneWireBusManager& oneWireBusManager;` |

**Public API:**
```cpp
bool begin(uint8_t pin = 0);
void end();
bool scanDevices(uint8_t rom_codes[][8], uint8_t max_devices, uint8_t& found_count);
bool isDevicePresent(const uint8_t rom_code[8]);
bool readRawTemperature(const uint8_t rom_code[8], int16_t& raw_value);
bool isInitialized() const;
uint8_t getPin() const;
String getBusStatus() const;
```

---

### 12. PWMController

| Eigenschaft | Wert |
|-------------|------|
| **Header** | `src/drivers/pwm_controller.h` |
| **Implementation** | `src/drivers/pwm_controller.cpp` |
| **Singleton** | \u2705 `PWMController::getInstance()` |
| **Global Ref** | `extern PWMController& pwmController;` |

**Features:**
- 16 Kan\u00e4le (ESP32 Dev) / 6 Kan\u00e4le (XIAO)
- Konfigurierbare Frequenz & Resolution

**Public API:**
```cpp
bool begin();
void end();
bool attachChannel(uint8_t gpio, uint8_t& channel_out);
bool detachChannel(uint8_t channel);
bool setFrequency(uint8_t channel, uint32_t frequency);
bool setResolution(uint8_t channel, uint8_t resolution_bits);
bool write(uint8_t channel, uint32_t duty_cycle);
bool writePercent(uint8_t channel, float percent);
bool isInitialized() const;
bool isChannelAttached(uint8_t channel) const;
uint8_t getChannelForGPIO(uint8_t gpio) const;
String getChannelStatus() const;
```

---

## Sensor-Ecosystem

### SensorRegistry Mapping

| ESP32 sensor_type | Server sensor_type | Device | I2C Addr | Multi-Value |
|-------------------|-------------------|--------|----------|-------------|
| `ds18b20` | `ds18b20` | OneWire | - | Nein |
| `temperature_sht31` | `sht31_temp` | sht31 | 0x44 | Ja |
| `humidity_sht31` | `sht31_humidity` | sht31 | 0x44 | Ja |
| `ph_sensor` | `ph_sensor` | ADC | - | Nein |
| `ec_sensor` | `ec_sensor` | ADC | - | Nein |

**Sensor-Types (String-basiert f\u00fcr Server-Centric):**
- Keine Enums auf ESP32-Seite
- Server definiert Processing-Rules
- ESP sendet nur `raw_value` (ADC 0-4095 oder OneWire-Raw)

### Sensor-Drivers

| Datei | Status | Interface |
|-------|--------|-----------|
| `isensor_driver.h` | STUB (1 Zeile) | - |
| `i2c_sensor_generic.h/.cpp` | Implementiert | ISensorDriver |
| `ph_sensor.h/.cpp` | Implementiert | ISensorDriver |
| `temp_sensor_ds18b20.h/.cpp` | STUB (1 Zeile) | - |
| `temp_sensor_sht31.h/.cpp` | STUB (1 Zeile) | - |

**Hinweis:** Sensor-Measurement erfolgt \u00fcber `SensorManager` direkt, nicht \u00fcber dedizierte Driver-Klassen. Driver-Stubs sind vorbereitet f\u00fcr zuk\u00fcnftige Erweiterung.

### Pi-Enhanced Processing

| Komponente | Pfad |
|------------|------|
| **PiEnhancedProcessor** | `src/services/sensor/pi_enhanced_processor.h/.cpp` |
| **HTTP-Client** | `src/services/communication/http_client.h/.cpp` |

**Flow:**
1. SensorManager liest RAW-Daten (ADC/OneWire)
2. RAW-Daten \u2192 MQTT \u2192 God-Kaiser Server
3. Server verarbeitet mit Sensor-Library
4. Processed Data zur\u00fcck an ESP (optional)

**WICHTIG:** ESP32 macht KEINE lokale Sensor-Verarbeitung!

---

## Aktor-Ecosystem

### Actuator-Drivers

| Datei | Actuator-Type | Interface |
|-------|---------------|-----------|
| `pump_actuator.h/.cpp` | pump, relay | IActuatorDriver |
| `pwm_actuator.h/.cpp` | pwm | IActuatorDriver |
| `valve_actuator.h/.cpp` | valve | IActuatorDriver |

### IActuatorDriver Interface

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

  // Safety
  virtual bool emergencyStop(const String& reason) = 0;
  virtual bool clearEmergency() = 0;
  virtual void loop() = 0;

  // Status
  virtual ActuatorStatus getStatus() const = 0;
  virtual const ActuatorConfig& getConfig() const = 0;
  virtual String getType() const = 0;
};
```

### PumpActuator Runtime Protection

```cpp
struct RuntimeProtection {
  unsigned long max_runtime_ms = 3600000UL;      // 1h continuous runtime cap
  uint16_t max_activations_per_hour = 60;        // Duty-cycle protection
  unsigned long cooldown_ms = 30000UL;           // 30s cooldown after cutoff
  unsigned long activation_window_ms = 3600000UL;
};
```

### Factory-Pattern

ActuatorManager verwendet `createDriver()`:
```cpp
std::unique_ptr<IActuatorDriver> ActuatorManager::createDriver(const String& actuator_type) const {
  if (actuator_type == ActuatorTypeTokens::PUMP || actuator_type == ActuatorTypeTokens::RELAY) {
    return std::make_unique<PumpActuator>();
  }
  if (actuator_type == ActuatorTypeTokens::PWM) {
    return std::make_unique<PWMActuator>();
  }
  if (actuator_type == ActuatorTypeTokens::VALVE) {
    return std::make_unique<ValveActuator>();
  }
  return nullptr;
}
```

---

## Safety-Patterns

### Emergency-Stop Sequenz

```
1. SafetyController.emergencyStopAll(reason)
2. F\u00fcr jeden Actuator:
   \u251c\u2500 driver->emergencyStop(reason)
   \u2514\u2500 emergency_stopped = true
3. GPIO auf INPUT_PULLUP (safe mode)
4. MQTT Alert published: kaiser/{id}/esp/{esp_id}/actuator/{gpio}/alert
5. EmergencyState \u2192 EMERGENCY_ACTIVE
```

### EmergencyState Enum

```cpp
enum class EmergencyState : uint8_t {
  EMERGENCY_NORMAL = 0,
  EMERGENCY_ACTIVE,
  EMERGENCY_CLEARING,
  EMERGENCY_RESUMING
};
```

### GPIO Safe-Mode

```cpp
// main.cpp STEP 3 (FIRST!)
gpioManager.initializeAllPinsToSafeMode();
```

Alle GPIO-Pins werden auf `INPUT_PULLUP` gesetzt, um Hardware-Sch\u00e4den zu verhindern.

### Runtime-Protection (Pumps)

- Max 1h kontinuierliche Laufzeit
- Max 60 Aktivierungen pro Stunde
- 30s Cooldown nach Cutoff
- `canActivate()` pr\u00fcft Limits

---

## MQTT-Layer

### TopicBuilder

**Pfad:** `src/utils/topic_builder.h/.cpp`

**Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/...`

```cpp
class TopicBuilder {
public:
  static void setEspId(const char* esp_id);
  static void setKaiserId(const char* kaiser_id);

  // 8 Critical Topic Patterns
  static const char* buildSensorDataTopic(uint8_t gpio);       // kaiser/{id}/esp/{esp}/sensor/{gpio}/data
  static const char* buildSensorBatchTopic();                  // kaiser/{id}/esp/{esp}/sensor/batch
  static const char* buildSensorCommandTopic(uint8_t gpio);    // Phase 2C
  static const char* buildSensorResponseTopic(uint8_t gpio);   // Phase 2C
  static const char* buildActuatorCommandTopic(uint8_t gpio);  // kaiser/{id}/esp/{esp}/actuator/{gpio}/command
  static const char* buildActuatorStatusTopic(uint8_t gpio);
  static const char* buildActuatorResponseTopic(uint8_t gpio);
  static const char* buildActuatorAlertTopic(uint8_t gpio);
  static const char* buildActuatorEmergencyTopic();
  static const char* buildSystemHeartbeatTopic();              // kaiser/{id}/esp/{esp}/system/heartbeat
  static const char* buildSystemHeartbeatAckTopic();           // Phase 2
  static const char* buildSystemCommandTopic();
  static const char* buildSystemDiagnosticsTopic();
  static const char* buildSystemErrorTopic();
  static const char* buildConfigTopic();                       // kaiser/{id}/esp/{esp}/config
  static const char* buildConfigResponseTopic();
  static const char* buildBroadcastEmergencyTopic();           // kaiser/{id}/emergency

  // Phase 9: Subzone
  static const char* buildSubzoneAssignTopic();
  static const char* buildSubzoneRemoveTopic();
  static const char* buildSubzoneAckTopic();
  static const char* buildSubzoneStatusTopic();
  static const char* buildSubzoneSafeTopic();
};
```

### QoS-Verwendung

| Message-Type | QoS | Grund |
|--------------|-----|-------|
| Sensor Data | 1 | At-least-once (Datenverlust kritisch) |
| Actuator Commands | 1 | At-least-once (Befehl muss ankommen) |
| Heartbeat | 0 | Fire-and-forget (regelm\u00e4\u00dfig) |
| Error Reports | 0 | Fire-and-forget (nicht blockierend) |
| Emergency Stop | 1 | At-least-once (Safety-critical) |

---

## Config-System

### NVS-Keys

| Namespace | Key | Typ | Beschreibung |
|-----------|-----|-----|--------------|
| `wifi` | `ssid` | String | WiFi SSID |
| `wifi` | `password` | String | WiFi Passwort |
| `wifi` | `server` | String | Server-Adresse |
| `wifi` | `mqtt_port` | uint16 | MQTT Port |
| `wifi` | `mqtt_user` | String | MQTT Username |
| `wifi` | `mqtt_pass` | String | MQTT Passwort |
| `wifi` | `configured` | bool | Config-Status |
| `zone` | `zone_id` | String | Primary Zone ID |
| `zone` | `master_id` | String | Master Zone ID |
| `zone` | `zone_name` | String | Zone Name |
| `zone` | `kaiser_id` | String | Kaiser ID |
| `zone` | `assigned` | bool | Zone assigned? |
| `system` | `esp_id` | String | ESP Identifier |
| `system` | `state` | uint8 | System State |
| `system` | `boot_cnt` | uint16 | Boot Counter |
| `sensor_X` | ... | ... | Per-Sensor Config |
| `actuator_X` | ... | ... | Per-Actuator Config |
| `subzone_idx` | `map` | String | Subzone Index Map |
| `subzone_N` | ... | ... | Per-Subzone Config |

---

## Error-Handling

### Error-Code Ranges (Guide-konform)

| Range | Kategorie | Beispiele |
|-------|-----------|-----------|
| 1000-1999 | HARDWARE | GPIO, I2C, PWM, OneWire |
| 2000-2999 | SERVICE | NVS, Config, Logger, Subzone |
| 3000-3999 | COMMUNICATION | WiFi, MQTT, HTTP |
| 4000-4999 | APPLICATION | State, Memory, Watchdog |

### Wichtige Error-Codes

```cpp
// HARDWARE
#define ERROR_GPIO_CONFLICT         1002
#define ERROR_I2C_DEVICE_NOT_FOUND  1011
#define ERROR_I2C_BUS_STUCK         1015
#define ERROR_I2C_CRC_FAILED        1009
#define ERROR_ONEWIRE_NO_DEVICES    1021
#define ERROR_DS18B20_SENSOR_FAULT  1060  // -127\u00b0C

// SERVICE
#define ERROR_SUBZONE_GPIO_CONFLICT 2501

// COMMUNICATION
#define ERROR_MQTT_CONNECT_FAILED   3011
#define ERROR_WIFI_CONNECT_TIMEOUT  3002

// APPLICATION
#define ERROR_WATCHDOG_TIMEOUT      4070
#define ERROR_DEVICE_REJECTED       4200
```

### ErrorTracker

```cpp
class ErrorTracker {
  void trackError(uint16_t error_code, ErrorSeverity severity, const char* message);
  void trackError(uint16_t error_code, const char* message);  // Default: ERROR

  void logHardwareError(uint16_t code, const char* message);
  void logServiceError(uint16_t code, const char* message);
  void logCommunicationError(uint16_t code, const char* message);
  void logApplicationError(uint16_t code, const char* message);

  void setMqttPublishCallback(MqttErrorPublishCallback callback, const String& esp_id);

  String getErrorHistory(uint8_t max_entries = 20) const;
  bool hasActiveErrors() const;
  bool hasCriticalErrors() const;
};
```

### CircuitBreaker

```cpp
class CircuitBreaker {
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

**States:**
- `CLOSED`: Normal operation
- `OPEN`: Service failed, requests blocked
- `HALF_OPEN`: Testing recovery

### HealthMonitor

```cpp
class HealthMonitor {
  bool begin();
  HealthSnapshot getCurrentSnapshot() const;
  String getSnapshotJSON() const;
  void publishSnapshot();
  void publishSnapshotIfChanged();
  void loop();

  uint32_t getHeapFree() const;
  uint32_t getHeapMinFree() const;
  uint8_t getHeapFragmentation() const;
  unsigned long getUptimeSeconds() const;
};
```

---

## Models & Types

### sensor_types.h

```cpp
struct SensorConfig {
  uint8_t gpio = 255;
  String sensor_type = "";           // "ph_sensor", "ds18b20"
  String sensor_name = "";
  String subzone_id = "";
  bool active = false;
  String operating_mode = "continuous";  // "on_demand", "paused", "scheduled"
  uint32_t measurement_interval_ms = 30000;
  bool raw_mode = true;              // IMMER true (Server-Centric)
  uint32_t last_raw_value = 0;
  unsigned long last_reading = 0;
  String onewire_address = "";       // ROM-Code f\u00fcr DS18B20
};

struct SensorReading {
  uint8_t gpio;
  String sensor_type;
  String subzone_id;
  uint32_t raw_value;
  float processed_value;             // Vom Server
  String unit;                       // Vom Server
  String quality;                    // "excellent" bis "bad"
  unsigned long timestamp;
  bool valid;
  String error_message;
  bool raw_mode = true;
  String onewire_address = "";
};
```

### actuator_types.h

```cpp
namespace ActuatorTypeTokens {
  static const char* const PUMP = "pump";
  static const char* const VALVE = "valve";
  static const char* const PWM = "pwm";
  static const char* const RELAY = "relay";
}

struct ActuatorConfig {
  uint8_t gpio = 255;
  uint8_t aux_gpio = 255;            // Secondary pin
  String actuator_type = "";
  String actuator_name = "";
  String subzone_id = "";
  bool active = false;
  bool critical = false;             // Safety priority
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

struct ActuatorCommand {
  uint8_t gpio = 255;
  String command = "";               // "ON", "OFF", "PWM", "TOGGLE", "STOP"
  float value = 0.0f;                // 0.0-1.0 f\u00fcr PWM
  uint32_t duration_s = 0;
  unsigned long timestamp = 0;
  String correlation_id = "";        // UUID vom Server
};
```

### system_types.h

```cpp
enum SystemState {
  STATE_BOOT = 0,
  STATE_WIFI_SETUP,
  STATE_WIFI_CONNECTED,
  STATE_MQTT_CONNECTING,
  STATE_MQTT_CONNECTED,
  STATE_AWAITING_USER_CONFIG,
  STATE_ZONE_CONFIGURED,
  STATE_SENSORS_CONFIGURED,
  STATE_OPERATIONAL,
  STATE_PENDING_APPROVAL,
  STATE_LIBRARY_DOWNLOADING,
  STATE_SAFE_MODE,
  STATE_SAFE_MODE_PROVISIONING,
  STATE_ERROR
};

struct SystemConfig {
  String esp_id = "";
  String device_name = "ESP32";
  SystemState current_state = STATE_BOOT;
  String safe_mode_reason = "";
  uint16_t boot_count = 0;
  unsigned long last_boot_time = 0;
};

struct KaiserZone {
  String zone_id = "";
  String master_zone_id = "";
  String zone_name = "";
  bool zone_assigned = false;
  String kaiser_id = "god";
  String kaiser_name = "";
  String system_name = "";
  bool connected = false;
  bool id_generated = false;
};

struct SubzoneConfig {
  String subzone_id = "";
  String subzone_name = "";
  String parent_zone_id = "";
  std::vector<uint8_t> assigned_gpios;
  bool safe_mode_active = true;
  uint32_t created_timestamp = 0;
  uint8_t sensor_count = 0;
  uint8_t actuator_count = 0;
};
```

---

## Initialisierungs-Reihenfolge (main.cpp)

| Step | Zeile | Komponente | Abh\u00e4ngig von |
|------|-------|------------|--------------|
| 1 | 131 | `Serial.begin(115200)` | - |
| 2 | 147 | Boot Banner | Serial |
| 2.3 | 156 | Watchdog Config (conditional) | - |
| 2.5 | 170 | Boot-Button Factory Reset Check | - |
| 3 | 248 | `gpioManager.initializeAllPinsToSafeMode()` | - |
| 4 | 253 | `logger.begin()` | Serial |
| 5 | 260 | `storageManager.begin()` | - |
| 6 | 268 | `configManager.begin()` | StorageManager |
| 6 | 269 | `configManager.loadAllConfigs()` | - |
| 6 | 274-276 | Load WiFi/Zone/System Config | ConfigManager |
| 6.5 | 363 | Watchdog Init (Production/Provisioning) | Config |
| 6.6 | 437 | Provisioning Check | Config |
| 7 | 569 | `errorTracker.begin()` | - |
| 8 | 574 | `TopicBuilder::setEspId/setKaiserId` | Config |
| 10 | 609 | `wifiManager.begin()` | - |
| 10 | 615 | `wifiManager.connect()` | WiFiConfig |
| 10 | 677 | `mqttClient.begin()` | WiFi |
| 10 | 691 | `mqttClient.connect()` | MQTTConfig |
| 10 | 701 | ErrorTracker MQTT Callback | MQTT |
| 10 | 706 | Initial Heartbeat | MQTT |
| 10 | 709+ | MQTT Subscriptions | MQTT |

### Provisioning-Check

**Zeile 363-546:**
```cpp
bool provisioning_needed = !g_wifi_config.configured ||
                           g_wifi_config.ssid.length() == 0;

if (provisioning_needed) {
  provisionManager.begin();
  provisionManager.startAPMode();
  provisionManager.waitForConfig(600000);  // 10 min timeout
}
```

---

## Code-Patterns

### Singleton-Pattern (Standard)

```cpp
class XManager {
public:
    static XManager& getInstance() {
        static XManager instance;
        return instance;
    }

    XManager(const XManager&) = delete;
    XManager& operator=(const XManager&) = delete;
    XManager(XManager&&) = delete;
    XManager& operator=(XManager&&) = delete;

private:
    XManager() = default;
    ~XManager() = default;
};

extern XManager& xManager;
// In .cpp: XManager& xManager = XManager::getInstance();
```

### MQTT-Publish Pattern

```cpp
// Gefunden in: sensor_manager.cpp, actuator_manager.cpp
void publishSensorReading(const SensorReading& reading) {
    if (!mqttClient.isConnected()) return;

    char topic[128];
    snprintf(topic, sizeof(topic), "%s", TopicBuilder::buildSensorDataTopic(reading.gpio));

    DynamicJsonDocument doc(512);
    doc["gpio"] = reading.gpio;
    doc["sensor_type"] = reading.sensor_type;
    doc["raw_value"] = reading.raw_value;
    doc["timestamp"] = reading.timestamp;
    doc["raw_mode"] = reading.raw_mode;

    String payload;
    serializeJson(doc, payload);

    mqttClient.publish(topic, payload, 1);  // QoS 1
}
```

### Error-Handling Pattern

```cpp
bool SomeManager::doOperation() {
    if (!initialized_) {
        errorTracker.trackError(ERROR_SYSTEM_INIT_FAILED, "Manager not initialized");
        return false;
    }

    if (!someCondition) {
        LOG_ERROR("Operation condition not met");
        errorTracker.logServiceError(ERROR_OPERATION_FAILED, "Condition failed");
        return false;
    }

    // Operation...

    return true;
}
```

### Factory-Pattern (Actuator-Drivers)

```cpp
std::unique_ptr<IActuatorDriver> createDriver(const String& actuator_type) const {
    if (actuator_type == ActuatorTypeTokens::PUMP) {
        return std::make_unique<PumpActuator>();
    }
    if (actuator_type == ActuatorTypeTokens::PWM) {
        return std::make_unique<PWMActuator>();
    }
    // ...
    return nullptr;
}
```

### Circuit-Breaker Pattern

```cpp
CircuitBreaker circuit_breaker_("ServiceName", 5, 30000, 10000);

bool performOperation() {
    if (!circuit_breaker_.allowRequest()) {
        LOG_WARNING("Circuit breaker OPEN - request blocked");
        return false;
    }

    bool success = actualOperation();

    if (success) {
        circuit_breaker_.recordSuccess();
    } else {
        circuit_breaker_.recordFailure();
    }

    return success;
}
```

---

## Fehlende/Unvollst\u00e4ndige Module

| Bereich | Status | Beschreibung |
|---------|--------|--------------|
| `isensor_driver.h` | STUB | Interface nicht implementiert |
| `temp_sensor_ds18b20.h` | STUB | Driver-Klasse nicht implementiert |
| `temp_sensor_sht31.h` | STUB | Driver-Klasse nicht implementiert |
| `sensor_factory.h` | STUB | Factory nicht implementiert |
| `core/application.h` | STUB | App-Skeleton nicht implementiert |
| `core/main_loop.h` | STUB | Loop-Abstraktion nicht implementiert |
| `core/system_controller.h` | STUB | Controller nicht implementiert |

**Hinweis:** Sensor-Readings erfolgen direkt \u00fcber `SensorManager` + `I2CBusManager` / `OneWireBusManager`. Driver-Abstraktion ist vorbereitet aber nicht aktiv genutzt.

---

## Empfehlungen f\u00fcr SKILL.md

### 1. Kritische Pfade

- `main.cpp` - Hauptlogik, Setup/Loop
- `services/sensor/sensor_manager.h/.cpp` - Sensor-Koordination
- `services/actuator/actuator_manager.h/.cpp` - Aktor-Kontrolle
- `services/config/config_manager.h/.cpp` - NVS-Orchestrierung
- `drivers/gpio_manager.h/.cpp` - Hardware-Safety

### 2. Standard-Workflows

**Neuen Sensor hinzuf\u00fcgen:**
1. `SensorConfig` in `models/sensor_types.h` pr\u00fcfen
2. `SensorRegistry` in `models/sensor_registry.cpp` erweitern
3. Falls I2C: Protocol in `drivers/i2c_sensor_protocol.cpp` registrieren
4. `SensorManager::configureSensor()` aufrufen

**Neuen Actuator hinzuf\u00fcgen:**
1. `ActuatorConfig` in `models/actuator_types.h` pr\u00fcfen
2. Falls neuer Typ: Driver in `actuator_drivers/` erstellen
3. `ActuatorManager::createDriver()` erweitern
4. `ActuatorManager::configureActuator()` aufrufen

### 3. Build-Flags

```ini
# KERNEL-FEATURES
-DDYNAMIC_LIBRARY_SUPPORT=1
-DHIERARCHICAL_ZONES=1
-DSAFE_MODE_PROTECTION=1
-DZONE_MASTER_ENABLED=1

# BOARD-SPECIFIC
-DXIAO_ESP32C3_MODE=1       # oder ESP32_DEV_MODE=1
-DMAX_SENSORS=10            # 20 f\u00fcr ESP32 Dev
-DMAX_ACTUATORS=6           # 12 f\u00fcr ESP32 Dev

# THREAD-SAFETY
-DCONFIG_ENABLE_THREAD_SAFETY

# SIMULATION
-DWOKWI_SIMULATION=1        # Nur f\u00fcr Wokwi
```

### 4. Debug-Commands (via MQTT)

| Command | Topic | Payload |
|---------|-------|---------|
| Status | `kaiser/{id}/esp/{esp}/system/command` | `{"command":"status"}` |
| Diagnostics | `...` | `{"command":"diagnostics"}` |
| Get Config | `...` | `{"command":"get_config"}` |
| Safe Mode | `...` | `{"command":"safe_mode"}` |
| Exit Safe Mode | `...` | `{"command":"exit_safe_mode"}` |
| OneWire Scan | `...` | `{"command":"onewire/scan","pin":4}` |
| Factory Reset | `...` | `{"command":"factory_reset","confirm":true}` |

---

*Report erstellt f\u00fcr Claude Code ESP32-Development-Skill*
