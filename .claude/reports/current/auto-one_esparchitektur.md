# AutomationOne – ESP32 Firmware-Architektur (El Trabajante)

> **Version:** 1.0 | **Stand:** 2026-02-14
> **Grundlage:** Vollständige Code-Analyse von `El Trabajante/src/` (75 Source-Dateien)
> **Referenzen:** ARCHITECTURE_DEPENDENCIES, COMMUNICATION_FLOWS, MQTT_TOPICS, ERROR_CODES
> **Übergeordnet:** `auto-one_systemarchitektur.md` (Schicht 1)

---

## 1. Überblick

El Trabajante ist die ESP32-Firmware des AutomationOne IoT-Frameworks. Sie implementiert das Kernprinzip des Systems: **der ESP32 ist ein dummer Agent** – er erfasst Rohdaten, führt Befehle aus und meldet seinen Zustand. Alle Logik, Verarbeitung und Entscheidungen liegen auf dem Server (El Servador). Dieses Prinzip garantiert, dass Firmware-Updates auf den ESP32s fast nie nötig sind.

### Firmware-Kennzahlen

| Eigenschaft | Wert |
|-------------|------|
| **Sprache** | C++ (Arduino Framework, PlatformIO) |
| **Source-Dateien** | 75 (30 `.cpp` + 45 `.h`) |
| **Einstiegspunkt** | `main.cpp` (~2.637 Zeilen) |
| **Architektur-Pattern** | Singleton für alle Manager-Klassen |
| **Hardware-Targets** | ESP32-WROOM-32 (GPIO 0–39), XIAO ESP32-C3 (GPIO 0–10, 21) |
| **Pfad** | `El Trabajante/src/` |
| **Build** | `pio run` (Production), `pio run -e wokwi_simulation` (Test) |

### Hardware-Abstraktion

Die Firmware unterstützt zwei Hardware-Varianten über Compile-Time-Konfiguration:

| Board | Config-Datei | Safe Pins | I2C (SDA/SCL) | Max GPIO |
|-------|-------------|-----------|----------------|----------|
| ESP32-WROOM-32 | `config/hardware/esp32_dev.h` | 4,5,14–19,21–23,25–27,32–35 | 21/22 | 24 |
| XIAO ESP32-C3 | `config/hardware/xiao_esp32c3.h` | 2,4–10,21 | 4/5 | 12 |

Die Board-Auswahl erfolgt über PlatformIO Build-Flags (`-DXIAO_ESP32C3`).

---

## 2. Dateistruktur

Die Firmware ist modular in sieben Bereiche gegliedert. Jede Datei hat eine klar abgegrenzte Verantwortung.

```
El Trabajante/src/
├── main.cpp                                    # Entry-Point: Boot-Sequenz, MQTT-Routing, loop()
│
├── core/
│   ├── system_controller.h                     # System-State-Machine (Enum + Transitions)
│   └── system_controller.cpp                   # State-Transition-Logik
│
├── config/
│   └── hardware/
│       ├── esp32_dev.h                         # ESP32-WROOM Hardware-Konstanten
│       ├── xiao_esp32c3.h                      # XIAO ESP32-C3 Hardware-Konstanten
│       └── feature_flags.h                     # Compile-Time Feature-Toggles
│
├── drivers/                                    # Hardware-Abstraktions-Schicht
│   ├── gpio_manager.h/cpp                      # GPIO Safe-Mode, Pin-Reservierung, Subzone-Pins
│   ├── i2c_bus.h/cpp                           # I2C-Bus: Scan, Read/Write, Recovery
│   ├── i2c_sensor_protocol.h/cpp               # I2C Sensor-Protokoll (SHT31, BMP280, BME280)
│   ├── onewire_bus.h/cpp                       # OneWire-Bus: DS18B20 Discovery + Reading
│   ├── pwm_controller.h/cpp                    # PWM-Kanal-Management (Frequenz, Duty Cycle)
│   └── hal/
│       ├── igpio_hal.h                         # GPIO Hardware-Abstraction Interface
│       └── esp32_gpio_hal.h                    # ESP32-spezifische GPIO-Implementierung
│
├── services/
│   ├── communication/
│   │   ├── mqtt_client.h/cpp                   # MQTT: Connect, Publish, Subscribe, Circuit Breaker
│   │   ├── wifi_manager.h/cpp                  # WiFi: Connect, Reconnect, Circuit Breaker
│   │   └── http_client.h/cpp                   # HTTP-Client für Pi-Enhanced Processing
│   │
│   ├── sensor/
│   │   ├── sensor_manager.h/cpp                # Sensor-Registry, Mess-Zyklen, Multi-Bus
│   │   ├── pi_enhanced_processor.h/cpp         # Rohdaten an Server senden, Fallback-Konvertierung
│   │   ├── sensor_factory.h/cpp                # Factory-Pattern für Sensor-Erstellung
│   │   └── sensor_drivers/
│   │       └── isensor_driver.h                # Sensor-Driver Interface (aktuell nicht genutzt)
│   │
│   ├── actuator/
│   │   ├── actuator_manager.h/cpp              # Aktor-Registry, Command-Handling, Factory
│   │   ├── safety_controller.h/cpp             # Emergency-Stop, Subzone-Isolation, Recovery
│   │   └── actuator_drivers/
│   │       ├── iactuator_driver.h              # IActuatorDriver Interface (polymorphe Basis)
│   │       ├── pump_actuator.h/cpp             # Pumpen-Driver: Binary + Runtime-Protection
│   │       ├── valve_actuator.h/cpp            # Ventil-Driver: Binary ON/OFF
│   │       └── pwm_actuator.h/cpp              # PWM-Driver: 0–255 Duty Cycle
│   │
│   ├── config/
│   │   ├── config_manager.h/cpp                # NVS-Orchestrierung: Load/Save aller Configs
│   │   ├── storage_manager.h/cpp               # NVS-Zugriffs-Layer (Namespace-Management)
│   │   └── config_response.h/cpp               # Config-Response-Builder (MQTT ACK)
│   │
│   └── provisioning/
│       ├── provision_manager.h/cpp             # AP-Mode Captive Portal (Ersteinrichtung)
│
├── error_handling/
│   ├── error_tracker.h/cpp                     # Error-Logging, Severity, MQTT-Publishing
│   ├── circuit_breaker.h/cpp                   # State-Machine: CLOSED → OPEN → HALF_OPEN
│   └── health_monitor.h/cpp                    # Heartbeat-Snapshots, Heap/RSSI-Monitoring
│
├── utils/
│   ├── topic_builder.h/cpp                     # Statische MQTT-Topic-Konstruktion
│   ├── logger.h/cpp                            # Log-System (DEBUG/INFO/WARNING/ERROR/CRITICAL)
│   ├── time_manager.h/cpp                      # NTP-Zeitsynchronisation
│   ├── json_helpers.h                          # JSON-Hilfs-Funktionen (ArduinoJson)
│   └── onewire_utils.h/cpp                     # OneWire ROM-Code Konvertierung + Validierung
│
└── models/                                     # Datenstrukturen (Structs, Enums, Konstanten)
    ├── error_codes.h                           # Error-Codes 1000–4999 mit Beschreibungen
    ├── sensor_types.h                          # SensorConfig, SensorReading
    ├── actuator_types.h                        # ActuatorConfig, ActuatorCommand, EmergencyState
    ├── config_types.h                          # ConfigStatus, ConfigFailureItem
    ├── system_types.h                          # SystemState, WiFiConfig, SystemConfig, KaiserZone
    ├── system_state.h                          # (leer – SystemState ist in system_types.h)
    ├── watchdog_types.h                        # WatchdogMode, WatchdogConfig, Diagnostics
    ├── mqtt_messages.h                         # MQTTMessage-Struct (Topic, Payload, QoS)
    └── sensor_registry.h/cpp                   # I2C Sensor-Typ-Registry
```

---

## 3. Boot-Sequenz

Die Firmware durchläuft beim Start eine definierte 16-Schritt-Sequenz in `main.cpp setup()`. Jeder Schritt ist mit STEP-Kommentaren dokumentiert. Die Reihenfolge ist sicherheitskritisch – GPIO Safe-Mode kommt absichtlich vor dem Config-Laden.

| Schritt | Zeile | Modul | Was passiert | Fehler-Reaktion |
|---------|-------|-------|-------------|-----------------|
| 1 | 131–142 | Serial | `Serial.begin(115200)`, Wokwi: +500ms Delay | Kein Output möglich |
| 2 | 147–152 | Boot Banner | Chip-Model, CPU-Frequenz, Heap ausgeben | – |
| 3 | 179–242 | Boot-Button | GPIO 0 long-press 10s → Factory Reset (NVS löschen) | NVS gelöscht, Neustart |
| 4 | **245–248** | **GPIO Safe-Mode** | **`gpioManager.initializeAllPinsToSafeMode()`** | Error 1001–1006 |
| 5 | 251–255 | Logger | `logger.begin()`, `setLogLevel(LOG_INFO)` | – |
| 5.1 | 269–275 | Log-Level Restore | Log-Level aus NVS wiederherstellen (`system_config`) | Default: LOG_INFO |
| 6 | 258–263 | Storage | `storageManager.begin()` | Warnung, Weiterlaufen |
| 7 | 282–286 | Config | `configManager.loadAllConfigs()` | Defaults verwendet |
| 8 | 292–308 | Defensive Repair | Provisioning-Flag + gültige Config → State reparieren | State zurückgesetzt |
| 9 | 324–357 | Boot-Loop Detect | 5× Reboot in <60s → SafeMode (Endlosschleife) | SafeMode, kein WiFi/MQTT |
| 10 | 373–416 | Watchdog | Provisioning: 300s, no-panic / Production: 60s, panic | 4070 bei Timeout |
| 11 | 433–546 | Provisioning | Keine Config → AP-Mode (`provisionManager.startAPMode()`) | LED-Blink-Pattern |
| 12 | 552–562 | Skip Check | `STATE_SAFE_MODE_PROVISIONING` → `return` (loop() übernimmt) | – |
| 13 | 567–577 | Error Tracker | `errorTracker.begin()`, TopicBuilder Init mit ESP-ID | – |
| 14 | 622–687 | WiFi | `wifiManager.connect()` (Circuit Breaker: 10 Failures → 60s) | Provisioning-Portal |
| 15 | 690–776 | MQTT | `mqttClient.connect()`, Subscriptions, Initial Heartbeat | Provisioning-Portal |
| 16 | 1818–1961 | Phase 3–5 | HealthMonitor, I2C, OneWire, PWM, SensorManager, SafetyController, ActuatorManager | Error-Tracking |

**Sicherheits-Design:** Schritt 4 (GPIO Safe-Mode) kommt absichtlich **vor** dem Config-Laden (Schritt 7). Alle Pins starten in einem sicheren Zustand (`INPUT_PULLUP`) – unabhängig davon, was die Konfiguration vorschreibt. Erst nach vollständiger Validierung werden Pins für Sensoren oder Aktoren freigegeben.

**Phase-Einteilung im Boot:**

| Phase | Schritte | Beschreibung |
|-------|----------|-------------|
| Phase 1: Core Infrastructure | 1–13 | Serial, GPIO, Logger, NVS, Config, Error Tracker |
| Phase 2: Communication | 14–15 | WiFi, MQTT, Subscriptions |
| Phase 3: Hardware Abstraction | 16 (Teil 1) | I2C Bus, OneWire Bus, PWM Controller |
| Phase 4: Sensor System | 16 (Teil 2) | SensorManager, NVS-Sensor-Configs laden |
| Phase 5: Actuator System | 16 (Teil 3) | SafetyController, ActuatorManager |

Nach jedem Phase-Abschluss werden Memory-Statistiken geloggt (`ESP.getFreeHeap()`, `ESP.getMinFreeHeap()`).

---

## 4. Modul-Architektur (Detail)

Alle Manager-Klassen verwenden das Singleton-Pattern mit `getInstance()`. Globale Instanzen werden als `extern`-Referenzen in den Header-Dateien deklariert und in den `.cpp`-Dateien initialisiert.

### 4.1 SensorManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/sensor/sensor_manager.h/cpp` |
| **LOC** | ~1.300 |
| **Pattern** | Singleton |
| **Instanz** | `extern SensorManager& sensorManager` |

**Verantwortung:** Sensor-Registry, Messzyklen, Multi-Bus-Koordination (Analog, Digital, I2C, OneWire), Rohdaten-Publishing via MQTT.

**Öffentliche API:**

```cpp
bool begin();
void end();
bool configureSensor(const SensorConfig& config);
bool removeSensor(uint8_t gpio);
void performAllMeasurements();                    // Hauptmethode: Alle Sensoren auslesen
bool performMeasurement(uint8_t gpio, SensorReading& reading_out);
uint8_t performMultiValueMeasurement(uint8_t gpio, SensorReading* readings_out, uint8_t max_readings);
void setMeasurementInterval(unsigned long interval_ms);
bool triggerManualMeasurement(uint8_t gpio);       // On-Demand via MQTT-Command
uint8_t getActiveSensorCount() const;
bool hasSensorOnGPIO(uint8_t gpio) const;
```

**Abhängigkeiten** (erworben in `begin()`, `sensor_manager.cpp:67–72`):

```cpp
pi_processor_ = &PiEnhancedProcessor::getInstance();
mqtt_client_  = &MQTTClient::getInstance();
i2c_bus_      = &I2CBusManager::getInstance();
onewire_bus_  = &OneWireBusManager::getInstance();
gpio_manager_ = &GPIOManager::getInstance();
```

**Konstante:** `MAX_SENSORS = 10` (überschreibbar via `platformio.ini`).

---

### 4.2 ActuatorManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/actuator/actuator_manager.h/cpp` |
| **LOC** | ~900 |
| **Pattern** | Singleton |
| **Instanz** | `extern ActuatorManager& actuatorManager` |

**Verantwortung:** Aktor-Registry, Factory-basierte Driver-Instanziierung, Command-Handling via MQTT, Emergency-Stop-Tracking pro Aktor.

**Öffentliche API:**

```cpp
bool begin();
void end();
bool configureActuator(const ActuatorConfig& config);
bool removeActuator(uint8_t gpio);
bool controlActuator(uint8_t gpio, float value);
bool controlActuatorBinary(uint8_t gpio, bool state);
bool emergencyStopAll();
bool emergencyStopActuator(uint8_t gpio);
bool clearEmergencyStop();
bool resumeOperation();
void processActuatorLoops();                       // loop()-Aufrufe an alle Driver
bool handleActuatorCommand(const String& topic, const String& payload);  // MQTT-Routing
void publishActuatorStatus(uint8_t gpio);
void publishAllActuatorStatus();
void publishActuatorResponse(const ActuatorCommand& cmd, bool success, const String& msg);
void publishActuatorAlert(uint8_t gpio, const String& type, const String& msg);
```

**Abhängigkeit:** `GPIOManager* gpio_manager_` (erworben im Constructor, `actuator_manager.cpp:92`).

**Konstante:** `MAX_ACTUATORS = 12` (überschreibbar via `platformio.ini`).

**Registry-Struktur** (`actuator_manager.h:62–68`):

```cpp
struct RegisteredActuator {
    bool in_use = false;
    uint8_t gpio = 255;
    std::unique_ptr<IActuatorDriver> driver;  // Factory-erzeugt
    ActuatorConfig config;
    bool emergency_stopped = false;           // Per-Aktor Emergency-State
};
```

**Factory-Pattern** (`actuator_manager.cpp:167–182`):

```cpp
std::unique_ptr<IActuatorDriver> createDriver(const String& actuator_type) const {
    if (actuator_type == "pump")  return std::unique_ptr<IActuatorDriver>(new PumpActuator());
    if (actuator_type == "pwm")   return std::unique_ptr<IActuatorDriver>(new PWMActuator());
    if (actuator_type == "valve") return std::unique_ptr<IActuatorDriver>(new ValveActuator());
    if (actuator_type == "relay") return std::unique_ptr<IActuatorDriver>(new PumpActuator());
    return nullptr;
}
```

Der Typ `relay` verwendet den `PumpActuator`-Driver, da beide binäre Aktoren sind.

---

### 4.3 MQTTClient

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/communication/mqtt_client.h/cpp` |
| **LOC** | ~980 |
| **Pattern** | Singleton |
| **Instanz** | `extern MQTTClient& mqttClient` |

**Verantwortung:** MQTT-Verbindung, Publish/Subscribe, Heartbeat, Offline-Buffer, Circuit Breaker, Registration Gate.

**Öffentliche API:**

```cpp
bool begin();
bool connect(const MQTTConfig& config);
bool disconnect();
bool isConnected();
bool publish(const String& topic, const String& payload, int qos = 1);
bool safePublish(const String& topic, const String& payload, int qos = 1, int retries = 3);
bool subscribe(const String& topic);
void setCallback(std::function<void(const String&, const String&)> callback);
void publishHeartbeat(bool force = false);
void loop();                                       // Reconnect, Heartbeat, Offline-Flush
CircuitState getCircuitBreakerState() const;
bool isRegistrationConfirmed() const;
void confirmRegistration();
```

**Konfiguration** (`MQTTConfig`-Struct):

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `server` | String | Broker-Adresse (aus WiFiConfig) |
| `port` | uint16_t | Broker-Port (Default: 1883) |
| `client_id` | String | ESP-ID als Client-ID |
| `username` | String | MQTT-Username (leer = anonym) |
| `password` | String | MQTT-Passwort (leer = anonym) |
| `keepalive` | int | Keep-Alive in Sekunden (60) |
| `timeout` | int | Verbindungs-Timeout (10) |

**Konstanten:**

| Konstante | Wert | Beschreibung |
|-----------|------|-------------|
| `MAX_OFFLINE_MESSAGES` | 100 | Maximale Offline-Buffer-Größe |
| `HEARTBEAT_INTERVAL_MS` | 60.000 | Heartbeat alle 60 Sekunden |
| `REGISTRATION_TIMEOUT_MS` | 10.000 | 10s Timeout für Registration Gate |

**Circuit Breaker:** 5 Failures → OPEN, 30s Recovery Timeout, 10s Half-Open Test (`mqtt_client.cpp:56`).

**LWT (Last Will and Testament):** Wird bei `connect()` gesetzt. Topic: `kaiser/{id}/esp/{esp_id}/system/will`, Retain: true. Der Broker sendet diese Nachricht automatisch bei unerwartetem Disconnect.

---

### 4.4 WiFiManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/communication/wifi_manager.h/cpp` |
| **LOC** | ~335 |
| **Pattern** | Singleton |
| **Instanz** | `extern WiFiManager& wifiManager` |

**Verantwortung:** WiFi-Verbindung, Reconnect-Logik, Circuit Breaker, NTP-Zeitsynchronisation nach Connect.

**Öffentliche API:**

```cpp
bool begin();
bool connect(const WiFiConfig& config);
void disconnect();
bool isConnected();
void loop();                                       // Reconnect-Überwachung
CircuitState getCircuitBreakerState() const;
```

**Circuit Breaker:** 10 Failures → OPEN, 60s Recovery Timeout, 15s Half-Open Test (`wifi_manager.cpp:36`).

---

### 4.5 ConfigManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/config/config_manager.h/cpp` |
| **LOC** | ~2.300 |
| **Pattern** | Singleton |
| **Instanz** | `extern ConfigManager& configManager` |

**Verantwortung:** Orchestrierung aller Konfigurationen. Lädt und speichert WiFi-, Zone-, System-, Sensor-, Aktor- und Subzone-Configs aus NVS via StorageManager.

**Öffentliche API (Auszug):**

```cpp
bool begin();
bool loadAllConfigs();
// WiFi
bool loadWiFiConfig(WiFiConfig& config);
bool saveWiFiConfig(const WiFiConfig& config);
bool validateWiFiConfig(const WiFiConfig& config);
void resetWiFiConfig();
// Zone
bool loadZoneConfig(KaiserZone& kaiser, MasterZone& master);
bool saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master);
// Subzone
bool saveSubzoneConfig(const SubzoneConfig& config);
bool loadAllSubzoneConfigs(SubzoneConfig* configs, uint8_t max_count, uint8_t& loaded_count);
// System
bool loadSystemConfig(SystemConfig& config);
bool saveSystemConfig(const SystemConfig& config);
// Sensor
bool saveSensorConfig(const SensorConfig& config);
bool loadSensorConfig(SensorConfig* configs, uint8_t max_count, uint8_t& loaded_count);
// Actuator
bool loadActuatorConfig(ActuatorConfig* configs, uint8_t max_count, uint8_t& loaded_count);
bool saveActuatorConfig(const ActuatorConfig& config);
// ESP-ID
String getESPId();
```

**Abhängigkeiten:** StorageManager, ErrorTracker, GPIOManager (OneWire ROM-Validierung), WiFi-Library (ESP-ID-Generierung).

**Wokwi-Modus:** Unter `WOKWI_SIMULATION` werden WiFi-Credentials per Compile-Time-Define gesetzt (`config_manager.cpp:79–113`), NVS wird umgangen.

---

### 4.6 GPIOManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `drivers/gpio_manager.h/cpp` |
| **LOC** | ~720 |
| **Pattern** | Singleton |
| **Instanz** | `extern GPIOManager& gpioManager` |

**Verantwortung:** GPIO Safe-Mode, Pin-Reservierung mit Owner-Tracking, Subzone-Pin-Zuordnung, Konflikt-Vermeidung.

**Öffentliche API (Auszug):**

```cpp
void initializeAllPinsToSafeMode();                // Boot-Schritt 4: Alle Pins auf INPUT_PULLUP
bool requestPin(uint8_t pin, const char* owner, const char* component, uint8_t mode);
bool releasePin(uint8_t pin);
bool isPinAvailable(uint8_t pin) const;
bool isPinReserved(uint8_t pin) const;
void enableSafeModeForAllPins();                   // Emergency: Alle Outputs → INPUT
GPIOPinInfo getPinInfo(uint8_t pin) const;
// Subzone-Management
bool assignPinToSubzone(uint8_t pin, const String& subzone_id);
void enableSafeModeForSubzone(const String& subzone_id);
```

**GPIOPinInfo-Struct:** Jeder Pin hat einen Owner (z.B. "sensor"), einen Component-Namen (z.B. "DS18B20"), den aktuellen Mode und einen Safe-Mode-Flag.

---

### 4.7 I2CBusManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `drivers/i2c_bus.h/cpp` |
| **LOC** | ~450 |
| **Pattern** | Singleton |
| **Instanz** | `extern I2CBusManager& i2cBusManager` |

**Verantwortung:** I2C-Bus-Verwaltung, Device-Scan, Rohwert-Lesen/Schreiben, Bus-Recovery bei Stuck-Zuständen.

**Öffentliche API:**

```cpp
bool begin();
void end();
bool scanBus();                                    // Alle Adressen 0x01–0x7F prüfen
bool isDevicePresent(uint8_t address);
bool readRaw(uint8_t address, uint8_t reg, uint8_t* buffer, size_t len);
bool writeRaw(uint8_t address, uint8_t reg, const uint8_t* data, size_t len);
bool readSensorRaw(uint8_t address, const String& sensor_type, uint8_t* buffer, size_t& len);
bool recoverBus();                                 // SDA/SCL Clock-Cycling zur Bus-Rettung
```

**Unterstützte I2C-Adressen:**

| Sensor | Adresse(n) |
|--------|-----------|
| SHT31 | 0x44 (ADDR→GND), 0x45 (ADDR→VCC) |
| BMP280 | 0x76 (SDO→GND), 0x77 (SDO→VCC) |
| BME280 | 0x76 (SDO→GND), 0x77 (SDO→VCC) |

---

### 4.8 OneWireBusManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `drivers/onewire_bus.h/cpp` |
| **LOC** | ~200 |
| **Pattern** | Singleton |
| **Instanz** | `extern OneWireBusManager& oneWireBusManager` |

**Verantwortung:** OneWire-Bus-Verwaltung, DS18B20-Discovery, Temperatur-Rohwert-Lesen.

**Öffentliche API:**

```cpp
bool begin(uint8_t pin = 0);                       // Default-Pin aus Hardware-Config
void end();
bool scanDevices();                                 // Alle ROM-Codes auf dem Bus finden
bool isDevicePresent(const uint8_t rom[8]);
bool readRawTemperature(const uint8_t rom[8], int16_t& raw_value);  // 12-bit Rohwert
```

**OneWire-Adressierung:** Jeder DS18B20 hat einen eindeutigen 64-bit ROM-Code. Auf einem einzigen GPIO-Pin können beliebig viele DS18B20-Sensoren betrieben werden, adressiert über ihren ROM-Code.

---

### 4.9 SafetyController

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/actuator/safety_controller.h/cpp` |
| **LOC** | ~150 |
| **Pattern** | Singleton |
| **Instanz** | `extern SafetyController& safetyController` |

**Verantwortung:** Emergency-Stop-Management (global und per Aktor), Subzone-Isolation, Recovery-Orchestrierung.

**Öffentliche API:**

```cpp
bool begin();
bool emergencyStopAll(const String& reason);       // ALLE Aktoren stoppen
bool emergencyStopActuator(uint8_t gpio, const String& reason);
bool isolateSubzone(const String& subzone_id, const String& reason);
bool clearEmergencyStop();                         // Flags zurücksetzen (Aktoren bleiben AUS)
bool resumeOperation();                            // Schrittweise Reaktivierung
bool isEmergencyActive() const;
EmergencyState getEmergencyState() const;
```

**Emergency State Machine** (`models/actuator_types.h`):

```
EMERGENCY_NORMAL → EMERGENCY_ACTIVE → EMERGENCY_CLEARING → EMERGENCY_RESUMING → EMERGENCY_NORMAL
```

| State | Bedeutung |
|-------|-----------|
| `EMERGENCY_NORMAL` | Normalbetrieb |
| `EMERGENCY_ACTIVE` | Emergency-Stop aktiv, alle Outputs deaktiviert |
| `EMERGENCY_CLEARING` | Flags werden zurückgesetzt, Aktoren noch AUS |
| `EMERGENCY_RESUMING` | Schrittweise Reaktivierung mit Delays |

**Recovery-Konfiguration** (`RecoveryConfig`): `inter_actuator_delay_ms` (2.000ms), `critical_first` (true), `verification_timeout_ms` (5.000ms), `max_retry_attempts` (3).

---

### 4.10 HealthMonitor

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `error_handling/health_monitor.h/cpp` |
| **LOC** | ~280 |
| **Pattern** | Singleton |
| **Instanz** | `extern HealthMonitor& healthMonitor` |

**Verantwortung:** Periodische System-Health-Snapshots, Heap/RSSI-Monitoring, Change-Detection für Diagnostics-Publishing.

**Öffentliche API:**

```cpp
bool begin();
void loop();                                       // Periodisches Snapshot + Publish
HealthSnapshot getCurrentSnapshot();
String getSnapshotJSON();                          // JSON für MQTT Diagnostics-Topic
void publishSnapshot();                            // Sofort publizieren (QoS 0)
void setPublishInterval(unsigned long ms);         // Default: 60.000ms
void setChangeDetectionEnabled(bool enabled);
```

**HealthSnapshot** enthält: `heap_free`, `heap_min_free`, `heap_fragmentation_percent`, `uptime_seconds`, `error_count`, `wifi_connected`, `wifi_rssi`, `mqtt_connected`, `sensor_count`, `actuator_count`, `system_state`, `boot_reason`, `mqtt_circuit_state`, `mqtt_failure_count`, Watchdog-Status.

---

### 4.11 ErrorTracker

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `error_handling/error_tracker.h/cpp` |
| **LOC** | ~200 |
| **Pattern** | Singleton |
| **Instanz** | `extern ErrorTracker& errorTracker` |

**Verantwortung:** Error-Logging mit Severity, Kategorie-Zuordnung, MQTT-Publishing an Server (Fire-and-Forget).

**Öffentliche API:**

```cpp
void begin();
void trackError(uint16_t error_code, ErrorSeverity severity, const char* message);
void logHardwareError(uint16_t code, const char* msg);
void logServiceError(uint16_t code, const char* msg);
void logCommunicationError(uint16_t code, const char* msg);
void logApplicationError(uint16_t code, const char* msg);
bool hasCriticalErrors();
void setMqttPublishCallback(MqttErrorPublishCallback cb, const String& esp_id);
```

**Error-Kategorien:**

| Kategorie | Range | Konstante |
|-----------|-------|-----------|
| Hardware | 1000–1999 | `ERROR_HARDWARE` |
| Service | 2000–2999 | `ERROR_SERVICE` |
| Communication | 3000–3999 | `ERROR_COMMUNICATION` |
| Application | 4000–4999 | `ERROR_APPLICATION` |

**MQTT-Callback:** Nach `mqttClient.connect()` wird der Callback gesetzt (`main.cpp:780`). Errors werden als QoS 0 Fire-and-Forget an `system/error` publiziert.

---

### 4.12 CircuitBreaker

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `error_handling/circuit_breaker.h/cpp` |
| **LOC** | ~180 |
| **Pattern** | Klasse (keine Singleton – mehrere Instanzen) |

**Verantwortung:** Service-Protection-Pattern. Verhindert Retry-Spam bei Ausfällen.

**Öffentliche API:**

```cpp
CircuitBreaker(const char* service_name, uint8_t failure_threshold = 5,
               unsigned long recovery_timeout_ms = 30000,
               unsigned long halfopen_timeout_ms = 10000);
bool allowRequest();                               // Prüft ob Request erlaubt
void recordSuccess();                              // HALF_OPEN → CLOSED
void recordFailure();                              // CLOSED → OPEN bei Threshold
void reset();                                      // Manuelles Reset zu CLOSED
CircuitState getState() const;                     // CLOSED, OPEN, HALF_OPEN
uint8_t getFailureCount() const;
```

**State Machine:**

```
CLOSED ─── N Failures ───► OPEN ─── Recovery Timeout ───► HALF_OPEN
  ▲                                                          │
  └───── Test Success ◄────────────────────────────────────┘
                           Test Failure → zurück zu OPEN
```

**Instanzen im System:**

| Instanz | Owner | Threshold | Recovery | Half-Open |
|---------|-------|-----------|----------|-----------|
| MQTT | `mqtt_client.cpp:56` | 5 Failures | 30s | 10s |
| WiFi | `wifi_manager.cpp:36` | 10 Failures | 60s | 15s |
| Pi-Enhanced | `pi_enhanced_processor.cpp:30` | 5 Failures | 30s | 10s |

---

### 4.13 ProvisionManager

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/provisioning/provision_manager.h/cpp` |
| **LOC** | ~530 |
| **Pattern** | Singleton |
| **Instanz** | `extern ProvisionManager& provisionManager` |

**Verantwortung:** Zero-Touch-Provisioning über AP-Mode Captive Portal. Ersteinrichtung neuer ESP32-Geräte.

**Öffentliche API:**

```cpp
bool begin();
bool needsProvisioning();
bool startAPMode();                                // AP erstellen, DNS + HTTP starten
bool waitForConfig(unsigned long timeout_ms = 600000);  // 10 Minuten Default
void stop();
void loop();                                       // DNS + HTTP verarbeiten
ProvisionState getState();
```

**Provisioning-Ablauf:**

1. ESP erkennt: keine WiFi-Config in NVS → `needsProvisioning() == true`
2. AP-Mode: SSID `AutoOne-{esp_id}`, Passwort `provision`
3. Captive Portal unter `http://192.168.4.1`
4. User gibt WiFi-SSID, Passwort, Server-Adresse ein
5. Config wird in NVS gespeichert
6. ESP startet neu → normaler Boot mit gespeicherter Config

**States:** `PROVISION_IDLE` → `PROVISION_AP_MODE` → `PROVISION_WAITING_CONFIG` → `PROVISION_CONFIG_RECEIVED` → `PROVISION_COMPLETE`.

---

### 4.14 PiEnhancedProcessor

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `services/sensor/pi_enhanced_processor.h/cpp` |
| **LOC** | ~360 |
| **Pattern** | Singleton |
| **Instanz** | `extern PiEnhancedProcessor& piEnhancedProcessor` |

**Verantwortung:** Rohdaten an Server senden (HTTP POST), Server verarbeitet mit Python Sensor-Library, verarbeitete Werte zurückgeben. Eigener Circuit Breaker bei Server-Ausfall mit lokalem Fallback.

**Öffentliche API:**

```cpp
bool begin();
bool sendRawData(const RawSensorData& raw, ProcessedSensorData& result);
bool isPiAvailable();
bool isCircuitOpen();
void resetCircuitBreaker();
```

**Datenstrukturen:**

- `RawSensorData`: `gpio`, `sensor_type`, `raw_value`, `timestamp`, `metadata`
- `ProcessedSensorData`: `value`, `unit`, `quality`, `timestamp`, `valid`, `error_message`

---

### 4.15 TopicBuilder

| Eigenschaft | Wert |
|-------------|------|
| **Pfad** | `utils/topic_builder.h/cpp` |
| **LOC** | ~250 |
| **Pattern** | Static Class (kein Singleton, nur statische Methoden) |

**Verantwortung:** Konstruktion aller MQTT-Topics nach dem Schema `kaiser/{kaiser_id}/esp/{esp_id}/{...}`.

**Öffentliche API (Auszug):**

```cpp
static void setEspId(const char* esp_id);
static void setKaiserId(const char* kaiser_id);
// Sensor
static const char* buildSensorDataTopic(uint8_t gpio);
static const char* buildSensorBatchTopic();
static const char* buildSensorCommandTopic(uint8_t gpio);
static const char* buildSensorResponseTopic(uint8_t gpio);
// Actuator
static const char* buildActuatorCommandTopic(uint8_t gpio);
static const char* buildActuatorStatusTopic(uint8_t gpio);
static const char* buildActuatorResponseTopic(uint8_t gpio);
static const char* buildActuatorAlertTopic(uint8_t gpio);
static const char* buildActuatorEmergencyTopic();
// System
static const char* buildSystemHeartbeatTopic();
static const char* buildSystemHeartbeatAckTopic();
static const char* buildSystemCommandTopic();
static const char* buildSystemDiagnosticsTopic();
static const char* buildSystemErrorTopic();
// Config
static const char* buildConfigTopic();
static const char* buildConfigResponseTopic();
// Zone/Subzone
static const char* buildZoneAssignTopic();
static const char* buildZoneAckTopic();
static const char* buildSubzoneAssignTopic();
static const char* buildSubzoneRemoveTopic();
static const char* buildSubzoneAckTopic();
// Broadcast
static const char* buildBroadcastEmergencyTopic();
```

**Interner Buffer:** Statischer `topic_buffer_[256]` mit Overflow-Protection via `validateTopicBuffer()`.

---

## 5. Sensor-System

### 5.1 Vier Sensor-Schnittstellen

Der ESP32 unterstützt vier Hardware-Schnittstellen für Sensoren:

| Schnittstelle | Hardware | Sensoren | Identifikation |
|---------------|----------|----------|----------------|
| **Analog** (ADC) | GPIO mit ADC-Fähigkeit | pH, EC, Bodenfeuchte | `esp_id` + `gpio` + `sensor_type` |
| **Digital** | Beliebiger GPIO | Digitale Eingänge | `esp_id` + `gpio` + `sensor_type` |
| **I2C** | SDA/SCL-Pins | SHT31, BMP280, BME280 | + `i2c_address` (z.B. 0x44) |
| **OneWire** | Beliebiger GPIO | DS18B20 | + `onewire_address` (64-bit ROM) |

**Mehrere Sensoren pro GPIO** sind möglich: Auf einem I2C-Bus können mehrere Geräte mit unterschiedlichen Adressen hängen. Auf einem OneWire-Pin können beliebig viele DS18B20 mit eindeutigen ROM-Codes betrieben werden.

### 5.2 SensorConfig und SensorReading

**SensorConfig** (`models/sensor_types.h`) – Konfiguration eines Sensors:

| Feld | Typ | Default | Beschreibung |
|------|-----|---------|-------------|
| `gpio` | uint8_t | 255 | GPIO-Pin |
| `sensor_type` | String | "" | Sensor-Typ (z.B. "DS18B20", "pH") |
| `sensor_name` | String | "" | Benutzerfreundlicher Name |
| `subzone_id` | String | "" | Subzone-Zuordnung |
| `active` | bool | false | Aktiv/Inaktiv |
| `operating_mode` | String | "continuous" | continuous, on_demand, paused |
| `measurement_interval_ms` | uint32_t | 30.000 | Messintervall |
| `raw_mode` | bool | true | true = Server verarbeitet |
| `onewire_address` | String | "" | 64-bit ROM-Code (16 Hex-Zeichen) |
| `i2c_address` | uint8_t | 0 | 7-bit I2C-Adresse |

**SensorReading** – Ergebnis einer Messung:

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `gpio` | uint8_t | GPIO-Pin |
| `sensor_type` | String | Sensor-Typ |
| `raw_value` | uint32_t | Rohwert |
| `processed_value` | float | Verarbeiteter Wert |
| `unit` | String | Einheit (°C, pH, %) |
| `quality` | String | excellent/good/fair/poor/bad/stale |
| `valid` | bool | Gültiger Messwert |
| `raw_mode` | bool | true = Rohwert-Modus |
| `onewire_address` | String | ROM-Code (bei OneWire) |
| `i2c_address` | uint8_t | Adresse (bei I2C) |

### 5.3 Pi-Enhanced vs. Lokale Verarbeitung

| Modus | Bedingung | Verarbeitung | Sensor-Typen |
|-------|-----------|-------------|-------------|
| **Pi-Enhanced** | `raw_mode: true` | ESP sendet Rohwert → Server verarbeitet mit Python-Library | pH, EC, SHT31, DS18B20, Feuchte, CO2, Licht, Druck, Durchfluss |
| **Lokal** | `raw_mode: false` | ESP verarbeitet selbst (Adafruit-Library) | BMP280, BME280 |

**Warum BMP280/BME280 lokal?** Die Bosch-Kompensationsformel benötigt 12–18 Kalibrierungswerte aus dem Sensor-EEPROM. Diese werden von der Adafruit-Library beim `begin()` ausgelesen. Eine Server-seitige Kompensation würde erfordern, diese Daten via MQTT zu übertragen – unnötige Komplexität.

### 5.4 Messablauf: performAllMeasurements()

Wird alle 5 Sekunden aus `loop()` aufgerufen (`main.cpp:2272`):

```
loop() → sensorManager.performAllMeasurements()        [sensor_manager.cpp:1003]
  ├── Für jeden aktiven Sensor (MAX_SENSORS = 10):
  │   ├── performMeasurement(gpio, reading)             [sensor_manager.cpp:280–430]
  │   │   ├── Analog:  analogRead(gpio)
  │   │   ├── Digital: digitalRead(gpio)
  │   │   ├── I2C:     i2c_bus_->readSensorRaw(address, type, buffer, len)
  │   │   └── OneWire: onewire_bus_->readRawTemperature(rom, raw_value)
  │   │
  │   ├── Pi-Enhanced? → pi_processor_->sendRawData()   [pi_enhanced_processor.cpp:86]
  │   │
  │   └── publishSensorReading(reading)                 [sensor_manager.cpp:1226]
  │       ├── buildMQTTPayload() → JSON                 [sensor_manager.cpp:1246]
  │       ├── TopicBuilder::buildSensorDataTopic(gpio)  [topic_builder.cpp:53]
  │       └── mqtt_client_->publish(topic, payload, 1)  [mqtt_client.cpp:469]
```

---

## 6. Aktor-System

### 6.1 IActuatorDriver Interface

Alle Aktor-Treiber implementieren dieses Interface (`services/actuator/actuator_drivers/iactuator_driver.h`):

```cpp
class IActuatorDriver {
public:
    virtual ~IActuatorDriver() = default;
    // Lifecycle
    virtual bool begin(const ActuatorConfig& config) = 0;
    virtual void end() = 0;
    virtual bool isInitialized() const = 0;
    // Control
    virtual bool setValue(float normalized_value) = 0;     // 0.0 – 1.0
    virtual bool setBinary(bool state) = 0;                // true = ON/OPEN
    // Safety
    virtual bool emergencyStop(const String& reason) = 0;
    virtual bool clearEmergency() = 0;
    virtual void loop() = 0;                               // Periodische Verarbeitung
    // Status
    virtual ActuatorStatus getStatus() const = 0;
    virtual const ActuatorConfig& getConfig() const = 0;
    virtual String getType() const = 0;
};
```

### 6.2 Aktor-Typen und Driver

| Typ-Token | Driver-Klasse | Steuerung | Besonderheit |
|-----------|---------------|-----------|--------------|
| `"pump"` | `PumpActuator` | Binary (ON/OFF) | Runtime-Protection (`RuntimeProtection`-Struct) |
| `"valve"` | `ValveActuator` | Binary (ON/OFF) | – |
| `"pwm"` | `PWMActuator` | 0.0–1.0 (PWM Duty Cycle) | Nutzt `PWMController` |
| `"relay"` | `PumpActuator` | Binary (ON/OFF) | Nutzt Pump-Driver (identisches Verhalten) |

Jeder Driver hält eine Referenz auf `GPIOManager` für Pin-Reservierung.

### 6.3 ActuatorConfig

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `gpio` | uint8_t | Primärer GPIO-Pin |
| `aux_gpio` | uint8_t | Hilfs-GPIO (255 = nicht genutzt) |
| `actuator_type` | String | pump, valve, pwm, relay |
| `actuator_name` | String | Benutzerfreundlicher Name |
| `subzone_id` | String | Subzone-Zuordnung |
| `active` | bool | Aktiv/Inaktiv |
| `critical` | bool | Kritischer Aktor (Recovery-Priorität) |
| `inverted_logic` | bool | Invertierte Logik |
| `default_state` | bool | Default-Zustand nach Boot |
| `default_pwm` | uint8_t | Default PWM-Wert |
| `runtime_protection` | RuntimeProtection | Max-Laufzeit-Schutz (nur Pumpen) |

### 6.4 Emergency-Stop-Ablauf

```
Server: POST /actuators/emergency-stop
  │
  ▼ MQTT QoS 2: kaiser/broadcast/emergency
  │
ESP: main.cpp (MQTT Callback) → safetyController.emergencyStopAll()  [safety_controller.cpp:37]
  ├── Für jeden registrierten Aktor:
  │   └── driver->emergencyStop(reason)              → GPIO auf INPUT
  ├── gpioManager.enableSafeModeForAllPins()         [gpio_manager.cpp:169]
  └── Publish: actuator/{gpio}/alert                 (für jeden Aktor)
      Publish: safe_mode                             (System-Status)

Timing-Garantie: Alle Outputs OFF in <50ms
```

**Recovery (manuell):**
1. Server sendet `exit_safe_mode` → Flags zurückgesetzt (Aktoren bleiben AUS)
2. Server sendet `resume_operation` → Schrittweise Reaktivierung (2s Delay pro Aktor)

---

## 7. MQTT-Integration

### 7.1 Topic-Schema

```
kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}
```

- `kaiser_id`: Aktuell `"god"` (vorbereitet für Multi-Kaiser)
- `esp_id`: Eindeutige ESP32-ID (z.B. `ESP_12AB34CD`)

### 7.2 Topics die der ESP publiziert (→ Server)

| Topic-Pattern | QoS | Beschreibung |
|---------------|-----|-------------|
| `.../sensor/{gpio}/data` | 1 | Sensor-Messwert |
| `.../sensor/batch` | 1 | Batch-Sensor-Daten |
| `.../sensor/{gpio}/response` | 1 | Sensor-Command-Response |
| `.../actuator/{gpio}/status` | 1 | Aktor-Zustand |
| `.../actuator/{gpio}/response` | 1 | Command-ACK |
| `.../actuator/{gpio}/alert` | 1 | Aktor-Alert |
| `.../system/heartbeat` | 0 | Health alle 60s |
| `.../system/error` | 1 | Error-Report |
| `.../system/will` | 1 | LWT (retain: true, Broker sendet bei Disconnect) |
| `.../system/diagnostics` | 0 | Health-Snapshot |
| `.../system/response` | 1 | System-Command-Response |
| `.../config_response` | 2 | Config-ACK |
| `.../zone/ack` | 1 | Zone-Assignment-ACK |
| `.../subzone/ack` | 1 | Subzone-Assignment-ACK |

### 7.3 Topics die der ESP abonniert (← Server)

Subscriptions aus `main.cpp:787–821`:

| Topic-Pattern | QoS | Beschreibung |
|---------------|-----|-------------|
| `.../config` | 2 | Config-Push (Sensor + Aktor) |
| `.../system/command` | 2 | System-Befehle |
| `.../actuator/+/command` | 2 | Aktor-Befehle (Wildcard) |
| `.../actuator/emergency` | 1 | ESP-spezifischer Emergency |
| `.../sensor/+/command` | 1 | Sensor-Befehle (Wildcard) |
| `.../zone/assign` | 1 | Zone-Zuweisung |
| `.../subzone/assign` | 1 | Subzone-Zuweisung |
| `.../subzone/remove` | 1 | Subzone-Entfernung |
| `.../system/heartbeat/ack` | 0 | Heartbeat-Bestätigung (Approval-Status) |
| `kaiser/broadcast/emergency` | 2 | Globaler Emergency-Stop |

### 7.4 Message-Routing in main.cpp

Das MQTT-Callback (`main.cpp:827–1634`) routet eingehende Nachrichten:

| Topic | Handler |
|-------|---------|
| `config` | `handleSensorConfig()` + `handleActuatorConfig()` |
| `actuator/+/command` | `actuatorManager.handleActuatorCommand()` |
| `sensor/+/command` | `handleSensorCommand()` (On-Demand Measurement) |
| `actuator/emergency` | Inline: Parse JSON, `emergencyStopAll()` oder `clearEmergencyStop()` |
| `broadcast/emergency` | Inline: `safetyController.emergencyStopAll()` |
| `system/command` | Inline: `factory_reset`, `status`, `diagnostics`, `get_config`, `safe_mode`, `exit_safe_mode`, `set_log_level`, `onewire/scan` |
| `zone/assign` | Inline: Zone-Zuweisung → NVS speichern → ACK |
| `subzone/assign` | Inline: Subzone-Zuweisung → GPIO-Pins zuordnen → ACK |
| `subzone/remove` | Inline: Subzone entfernen → ACK |
| `heartbeat/ack` | Inline: Approval-Status prüfen (approved/pending/rejected) |

### 7.5 Registration Gate

Neue ESP32-Geräte werden beim ersten Heartbeat vom Server erkannt (Status: `pending_approval`). Bis zur Genehmigung durch einen Admin blockiert das Registration Gate weitere Publishes:

- `registration_confirmed_` (bool): Wird auf `true` gesetzt wenn Heartbeat-ACK `status: "approved"` oder `"online"` enthält
- `registration_start_ms_`: Timeout-Tracking (10s Fallback – Gate öffnet automatisch)
- Heartbeats werden immer gesendet, unabhängig vom Gate-Status

### 7.6 Offline-Buffer

Bei MQTT-Disconnect werden Nachrichten in einem Ring-Buffer gespeichert:

| Eigenschaft | Wert |
|-------------|------|
| **Max. Größe** | 100 Messages (`MAX_OFFLINE_MESSAGES`) |
| **Verhalten bei voll** | Älteste Nachricht wird überschrieben |
| **Auto-Flush** | Bei Reconnect werden alle Nachrichten gesendet |
| **Implementierung** | `MQTTMessage offline_buffer_[100]` in `mqtt_client.h:106` |

### 7.7 QoS-Strategie

| QoS | Verwendung | Garantie |
|-----|------------|----------|
| **0** | Heartbeat, Diagnostics | Best Effort (Verlust tolerierbar) |
| **1** | Sensor-Daten, Alerts, Status | At Least Once (Duplikate erlaubt) |
| **2** | Commands, Config | Exactly Once (exakt eine Ausführung) |

---

## 8. NVS-Persistenz (Non-Volatile Storage)

Der ESP32 speichert seine Konfiguration im Flash-Speicher über die NVS-API (Non-Volatile Storage). Der `StorageManager` kapselt den Zugriff, der `ConfigManager` orchestriert das Laden und Speichern.

### 8.1 Namespaces und Inhalt

| Namespace | Schlüssel (Auszug) | Beschreibung |
|-----------|-------------------|-------------|
| `wifi_config` | ssid, password, server_address, mqtt_port, mqtt_username, mqtt_password, configured | WiFi + MQTT-Verbindung |
| `zone_config` | zone_id, zone_name, master_zone_id, kaiser_id | Zone-Zuordnung |
| `system_config` | esp_id, current_state, boot_count, last_boot_time, safe_mode_reason, log_level, approval_status | System-Status |
| `sensor_config` | Sensor-Array (GPIO, Typ, Intervall, raw_mode, OneWire/I2C-Adresse) | Sensor-Konfigurationen |
| `actuator_config` | Aktor-Array (GPIO, Typ, Safety-Config, default_state) | Aktor-Konfigurationen |
| `subzone_config` | Subzone-Array (ID, Name, parent_zone_id, assigned_gpios) | Subzone-Zuordnungen |

### 8.2 Was NICHT persistiert wird

- **Sensor-Messwerte** – flüchtig, existieren nur auf dem Server
- **Aktor-Zustände** – flüchtig, werden nach Reboot durch Server-Config wiederhergestellt
- **Error-History** – flüchtig (im RAM, max. 50 Einträge)

### 8.3 StorageManager-API

Der `StorageManager` (`services/config/storage_manager.h`) bietet typsichere Getter/Setter für alle NVS-Datentypen:

```cpp
bool beginNamespace(const char* name, bool read_only = false);
void endNamespace();
// String, Int, UInt8, UInt16, Bool, Float, ULong
bool putString(const char* key, const String& value);
String getStringObj(const char* key, const char* default_value);
bool putBool(const char* key, bool value);
bool getBool(const char* key, bool default_value);
// ... weitere Typen
bool clearNamespace();
bool eraseKey(const char* key);
```

---

## 9. SafeMode und Error-Handling

### 9.1 SafeMode-Auslöser (5 Szenarien)

| Auslöser | Bedingung | Zeile | Verhalten |
|----------|-----------|-------|-----------|
| **Boot-Button 10s** | GPIO 0 gedrückt halten | 179–242 | NVS löschen, Neustart (Factory Reset) |
| **Boot-Loop** | 5× Reboot in <60 Sekunden | 338–357 | Endlosschleife, kein WiFi/MQTT |
| **Inkonsistenter State** | Provisioning-Flag + gültige Config | 292–308 | State reparieren oder SafeMode |
| **WiFi-Failure** | Verbindung fehlgeschlagen | 631–671 | Provisioning-Portal (AP-Mode) |
| **AP-Mode-Failure** | Portal kann nicht starten | 516–545 | LED-Blink → Halt |
| **MQTT 5min Failure** | Circuit Breaker OPEN > 5 Minuten | 2233–2265 | Config löschen, Provisioning-Portal |

### 9.2 LED-Blink-Patterns

| Pattern | Bedeutung | Zeile |
|---------|-----------|-------|
| 3× schnell, 2s Pause | ProvisionManager init fehlgeschlagen | 484–491 |
| 4× schnell, 2s Pause | AP-Mode Start fehlgeschlagen | 536–543 |
| 5× schnell, 2s Pause | WiFi-Failure → Provisioning | 649–656 |
| 6× schnell, 2s Pause | MQTT-Failure → Provisioning | 744–751 |

### 9.3 Error-Code-Ranges (ESP32: 1000–4999)

| Range | Kategorie | Häufigste Codes |
|-------|-----------|----------------|
| 1001–1006 | GPIO | GPIO_RESERVED (1001), GPIO_CONFLICT (1002), GPIO_INIT_FAILED (1003) |
| 1010–1018 | I2C | I2C_INIT_FAILED (1010), DEVICE_NOT_FOUND (1011), BUS_STUCK (1015), BUS_RECOVERED (1018) |
| 1020–1029 | OneWire | NO_DEVICES (1021), INVALID_ROM_LENGTH (1023), INVALID_ROM_CRC (1025), DUPLICATE_ROM (1029) |
| 1030–1032 | PWM | PWM_INIT_FAILED (1030), CHANNEL_FULL (1031) |
| 1040–1043 | Sensor | READ_FAILED (1040), INIT_FAILED (1041), TIMEOUT (1043) |
| 1050–1053 | Actuator | SET_FAILED (1050), INIT_FAILED (1051), CONFLICT (1053) |
| 1060–1063 | DS18B20 | SENSOR_FAULT (1060, -127°C), POWER_ON_RESET (1061, 85°C), OUT_OF_RANGE (1062) |
| 2001–2005 | NVS | INIT_FAILED (2001), WRITE_FAILED (2003) |
| 2010–2014 | Config | CONFIG_INVALID (2010), LOAD_FAILED (2012) |
| 2500–2506 | Subzone | INVALID_ID (2500), GPIO_CONFLICT (2501), SAFE_MODE_FAILED (2505) |
| 3001–3005 | WiFi | CONNECT_TIMEOUT (3002), CONNECT_FAILED (3003), NO_SSID (3005) |
| 3010–3016 | MQTT | CONNECT_FAILED (3011), PUBLISH_FAILED (3012), BUFFER_FULL (3015) |
| 3020–3023 | HTTP | REQUEST_FAILED (3021), TIMEOUT (3023) |
| 4001–4003 | State | INVALID_TRANSITION (4002), STATE_STUCK (4003) |
| 4040–4042 | Memory | MEMORY_FULL (4040), ALLOCATION (4041) |
| 4070–4072 | Watchdog | WDT_TIMEOUT (4070), FEED_BLOCKED (4071), FEED_BLOCKED_CRITICAL (4072) |
| 4200–4202 | Discovery | DEVICE_REJECTED (4200), APPROVAL_TIMEOUT (4201) |

### 9.4 Error-Reporting an Server

Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/error` (QoS 1)

```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "error_code": 1002,
  "severity": "error",
  "message": "GPIO 5 already in use by sensor",
  "module": "SensorManager",
  "function": "addSensor"
}
```

**Severity-Stufen:** `warning` (degradiert, funktional), `error` (Feature nicht verfügbar), `critical` (Safe-Mode oder Reboot nötig).

---

## 10. Provisioning

### 10.1 Ersteinrichtung

Neue ESP32-Geräte haben keine WiFi-Konfiguration in NVS. Beim ersten Boot erkennt die Firmware dies und startet automatisch ein Captive Portal:

| Eigenschaft | Wert |
|-------------|------|
| **AP-SSID** | `AutoOne-{esp_id}` |
| **AP-Passwort** | `provision` |
| **Portal-URL** | `http://192.168.4.1` |
| **Timeout** | 10 Minuten (`AP_MODE_TIMEOUT_MS = 600000`) |
| **DNS-Port** | 53 (Captive Portal Redirect) |

### 10.2 Provisioning-Ablauf

1. ESP erkennt: `g_wifi_config.configured == false` oder `g_wifi_config.ssid` leer
2. `provisionManager.begin()` → NVS + HTTP-Server initialisieren
3. `provisionManager.startAPMode()` → WiFi AP starten, DNS starten
4. User verbindet sich mit AP → Browser öffnet Captive Portal
5. User gibt ein: WiFi-SSID, WiFi-Passwort, Server-IP-Adresse, MQTT-Port
6. HTTP POST → Config validieren → In NVS speichern
7. `ESP.restart()` → normaler Boot mit gespeicherter Config

### 10.3 Provisioning-Trigger bei Laufzeit-Fehlern

Nicht nur beim ersten Boot – auch bei Verbindungsfehlern wird das Portal geöffnet:

- **WiFi-Failure:** WiFi-Verbindung schlägt fehl → Provisioning-Portal (`main.cpp:631`)
- **MQTT-Failure:** MQTT-Broker nicht erreichbar → Config löschen → Provisioning-Portal (`main.cpp:714`)
- **5-Minuten MQTT-Failure:** Circuit Breaker bleibt 5 Minuten OPEN → Config löschen → Neustart mit Provisioning (`main.cpp:2233`)

---

## 11. Watchdog-System

### 11.1 Modi

| Modus | Timeout | Panic | Beschreibung |
|-------|---------|-------|-------------|
| `WDT_DISABLED` | – | – | Wokwi-Simulation |
| `PROVISIONING` | 300s | Nein | Firmware-Hangs erkennen, kein Auto-Reboot |
| `PRODUCTION` | 60s | Ja | Auto-Reboot bei Hang |
| `SAFE_MODE` | – | – | Reduzierter Betrieb |

### 11.2 Feed-Logik

Der Watchdog wird alle `feed_interval_ms` (Provisioning: 60s, Production: 10s) aus `loop()` gefüttert (`main.cpp:1972–2032`):

1. **WiFi Circuit Breaker OPEN?** → Feed blockiert (Error 4071)
2. **MQTT Circuit Breaker OPEN?** → Warnung, Feed erlaubt (degradierter Betrieb)
3. **Kritische Errors aktiv?** → Feed blockiert (Error 4072)
4. **STATE_ERROR?** → Feed blockiert
5. **Alle Checks bestanden:** → `esp_task_wdt_reset()`

**Design-Entscheidung:** MQTT-Ausfall blockiert den Watchdog **nicht** – der ESP kann lokal weiterarbeiten (Sensoren, Aktoren). Nur WiFi-Ausfall ist kritisch (ohne WiFi kann der ESP nichts tun).

---

## 12. Dependency-Graph

```
Application Layer (main.cpp setup())
└─► Main Application
    │
    ├─► SensorManager
    │   ├─► GPIOManager (singleton)
    │   ├─► MQTTClient (singleton)
    │   ├─► PiEnhancedProcessor (singleton)
    │   │   ├─► HTTPClient (singleton)
    │   │   └─► CircuitBreaker ("Pi-Enhanced")
    │   ├─► I2CBusManager (singleton)
    │   └─► OneWireBusManager (singleton)
    │
    ├─► ActuatorManager
    │   ├─► GPIOManager (singleton)
    │   └─► IActuatorDriver (factory-created)
    │       ├─► PumpActuator → GPIOManager
    │       ├─► ValveActuator → GPIOManager
    │       ├─► PWMActuator → GPIOManager + PWMController
    │       └─► (relay → PumpActuator)
    │
    ├─► SafetyController
    │   └─► ActuatorManager (implicit)
    │
    ├─► ConfigManager
    │   ├─► StorageManager (singleton) → NVS (ESP32 Hardware)
    │   ├─► ErrorTracker (singleton)
    │   └─► GPIOManager (ROM-Validierung)
    │
    ├─► ProvisionManager (nur wenn !configured)
    │   ├─► ConfigManager
    │   ├─► WebServer (ESP32 Library)
    │   └─► DNSServer (ESP32 Library)
    │
    ├─► HealthMonitor
    │   ├─► MQTTClient
    │   └─► ErrorTracker
    │
    └─► ErrorTracker
        └─► MQTTClient (via Callback, fire-and-forget)

Communication Layer (Singletons)
├─► MQTTClient → WiFiClient + PubSubClient + CircuitBreaker ("MQTT")
├─► WiFiManager → WiFi Library + CircuitBreaker ("WiFi")
└─► HTTPClient → WiFiManager

Hardware Abstraction Layer (Singletons)
├─► GPIOManager (keine Abhängigkeiten)
├─► I2CBusManager → Wire Library
├─► OneWireBusManager → OneWire + DallasTemperature Libraries
└─► PWMController → ESP32 LEDC API
```

---

## 13. Datenflüsse

### 13.1 Sensor-Reading (ESP → Server → Frontend)

**Latenz:** 50–230ms End-to-End

```
ESP32: SensorManager.performAllMeasurements()          [sensor_manager.cpp:1003]
  │
  ├── readRawAnalog/Digital/I2C/OneWire()              [sensor_manager.cpp:280–430]
  │
  ├── (optional) PiEnhancedProcessor.sendRawData()     [pi_enhanced_processor.cpp:86]
  │
  ├── publishSensorReading()                            [sensor_manager.cpp:1226]
  │   ├── buildMQTTPayload() → JSON                    [sensor_manager.cpp:1246]
  │   └── TopicBuilder::buildSensorDataTopic(gpio)     [topic_builder.cpp:53]
  │
  ▼ MQTT QoS 1: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
  │
Server: sensor_handler.handle_sensor_data()            [sensor_handler.py:79]
  ├── Validate & Parse                                 [sensor_handler.py:353]
  ├── Pi-Enhanced Processing (optional)                [sensor_handler.py:217]
  ├── DB: sensor_data speichern                        [sensor_handler.py:259]
  ├── Logic Engine: evaluate_sensor_data()             [logic_engine.py:135]
  └── WebSocket: "sensor_data" broadcast               [sensor_handler.py:297]
```

### 13.2 Actuator-Command (Server → ESP)

**Latenz:** 100–290ms End-to-End

```
Server: MQTT QoS 2: kaiser/god/esp/{esp_id}/actuator/{gpio}/command
  │
ESP32: MQTT Callback → topic matching                  [main.cpp:~854]
  │
  ├── actuatorManager.handleActuatorCommand()          [actuator_manager.cpp:537]
  │   ├── extractGPIOFromTopic()                       [actuator_manager.cpp:467]
  │   ├── Parse JSON (command, value, duration)
  │   ├── Safety Check (emergency_stopped?)            [actuator_manager.cpp:294]
  │   └── controlActuatorBinary() / controlActuator()  [actuator_manager.cpp:382]
  │       └── driver->setBinary(state) / setValue()
  │           └── GPIO digitalWrite/analogWrite        [pump_actuator.cpp:384]
  │
  ├── publishActuatorResponse() → .../response         [actuator_manager.cpp:826]
  └── publishActuatorStatus() → .../status             [actuator_manager.cpp:778]
```

### 13.3 Emergency Stop (Server → ALLE ESPs)

**Latenz:** <100ms, Timing-Garantie: Alle Outputs OFF in <50ms

```
MQTT QoS 2: kaiser/broadcast/emergency
  │
ESP32: MQTT Callback                                   [main.cpp:~910]
  │
  └── safetyController.emergencyStopAll()              [safety_controller.cpp:37]
      ├── Für jeden Aktor: driver->emergencyStop()
      ├── gpioManager.enableSafeModeForAllPins()       [gpio_manager.cpp:169]
      └── Publish: alert + safe_mode Status
```

### 13.4 Heartbeat (ESP → Server)

**Interval:** Alle 60 Sekunden

```
mqttClient.loop()                                      [mqtt_client.cpp]
  └── publishHeartbeat()                               [mqtt_client.cpp:~435]
      ├── TopicBuilder::buildSystemHeartbeatTopic()    [topic_builder.cpp:127]
      └── Publish QoS 0: .../system/heartbeat
          Payload: esp_id, zone_id, uptime, heap_free,
                   wifi_rssi, sensor_count, actuator_count,
                   gpio_status[]
```

---

## 14. loop()-Funktion

Die `loop()`-Funktion (`main.cpp:2110–2294`) ist der Haupt-Zyklus der Firmware. Ausführung alle ~10ms (`delay(10)` am Ende).

**Ablauf:**

| Schritt | Beschreibung |
|---------|-------------|
| 1 | **Watchdog Feed** – Alle `feed_interval_ms`: `feedWatchdog("MAIN_LOOP")` |
| 2 | **Watchdog Timeout Handler** – `handleWatchdogTimeout()` |
| 3 | **Provisioning-Modus** – Wenn `STATE_SAFE_MODE_PROVISIONING`: nur `provisionManager.loop()` |
| 4 | **Pending-Approval** – Wenn `STATE_PENDING_APPROVAL`: nur WiFi/MQTT/Health, `delay(100)` |
| 5 | **Boot-Counter Reset** – Nach 60s Uptime: `boot_count` zurücksetzen |
| 6 | **WiFi-Monitoring** – `wifiManager.loop()` (Reconnect + Circuit Breaker) |
| 7 | **MQTT-Monitoring** – `mqttClient.loop()` (Reconnect + Heartbeat + Offline-Flush) |
| 8 | **MQTT 5-Min-Failure** – Circuit Breaker >5min OPEN → Config löschen, Neustart |
| 9 | **Sensor-Messungen** – `sensorManager.performAllMeasurements()` |
| 10 | **Aktor-Loops** – `actuatorManager.processActuatorLoops()` + alle 30s: Status publizieren |
| 11 | **Health-Monitoring** – `healthMonitor.loop()` (Snapshot + Diagnostics) |
| 12 | **Delay** – `delay(10)` |

---

## 15. System-States

Die Firmware durchläuft verschiedene Zustände (`models/system_types.h`):

| State | Beschreibung |
|-------|-------------|
| `STATE_BOOT` | Boot-Sequenz läuft |
| `STATE_WIFI_SETUP` | WiFi wird initialisiert |
| `STATE_WIFI_CONNECTED` | WiFi verbunden |
| `STATE_MQTT_CONNECTING` | MQTT-Verbindung wird aufgebaut |
| `STATE_MQTT_CONNECTED` | MQTT verbunden |
| `STATE_AWAITING_USER_CONFIG` | Warte auf Config vom Server |
| `STATE_ZONE_CONFIGURED` | Zone zugewiesen |
| `STATE_SENSORS_CONFIGURED` | Sensoren konfiguriert |
| `STATE_OPERATIONAL` | Normalbetrieb |
| `STATE_PENDING_APPROVAL` | Warte auf Admin-Genehmigung |
| `STATE_LIBRARY_DOWNLOADING` | Library-Download (vorbereitet) |
| `STATE_SAFE_MODE` | Safe-Mode (keine Kommunikation) |
| `STATE_SAFE_MODE_PROVISIONING` | Safe-Mode mit aktivem AP-Portal |
| `STATE_ERROR` | Fehler-Zustand |

---

## 16. Wokwi-Testinfrastruktur

Die Firmware wird in einer simulierten Wokwi-Umgebung getestet. Compile-Flag `WOKWI_SIMULATION` aktiviert spezielle Anpassungen (längere UART-Delays, Watchdog deaktiviert, Compile-Time WiFi-Credentials).

### 16.1 Szenarien-Übersicht

165 YAML-Szenarien in 13 Kategorien:

| Kategorie | Szenarien | Beschreibung |
|-----------|-----------|-------------|
| 01-boot | 2 | Boot-Sequenz, Safe Mode |
| 02-sensor | 5 | Heartbeat, DS18B20, DHT22, Analog |
| 03-actuator | 7 | LED, PWM, Status, Emergency, Timeout |
| 04-zone | 2 | Zone + Subzone Assignment |
| 05-emergency | 3 | Broadcast, ESP Stop, Full Flow |
| 06-config | 2 | Sensor + Actuator Config Push |
| 07-combined | 2 | Multi-Device, Sensor+Actuator |
| 08-i2c | ~20 | I2C Bus Operations |
| 08-onewire | ~29 | OneWire Protocol Tests |
| 09-pwm | ~4 | PWM Channel, Duty Cycle |
| 09-hardware | ~6 | Pin Limits, Reserved Pins |
| 10-nvs | ~40 | NVS Type Tests, Persistence |
| gpio | ~24 | GPIO Reservation, Safe Mode, Subzone |

### 16.2 Build

```bash
pio run -e wokwi_simulation
```

**Config:** `El Trabajante/wokwi.toml`, Serial: `rfc2217://localhost:4000`

---

## 17. Referenz-Verzeichnis

| Thema | Dokument | Pfad |
|-------|----------|------|
| **System-Architektur** | Gesamtübersicht (3 Schichten) | `.claude/reports/current/auto-one_systemarchitektur.md` |
| **MQTT-Topics** | Vollständige Topic-Referenz (32 Topics) | `.claude/reference/api/MQTT_TOPICS.md` |
| **Datenflüsse** | Code-Referenzen mit Datei:Zeile | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| **Abhängigkeiten** | Modul-Dependency-Graph | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` |
| **Error-Codes** | ESP32 (1000–4999) + Server (5000–5999) | `.claude/reference/errors/ERROR_CODES.md` |
| **MQTT-Protokoll** | Detaillierte Payload-Spezifikation | `El Trabajante/docs/Mqtt_Protocoll.md` |
| **Hardware-Configs** | Board-spezifische Konstanten | `El Trabajante/src/config/hardware/` |
