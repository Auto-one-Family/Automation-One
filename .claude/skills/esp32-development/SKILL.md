---
name: esp32-development
description: |
  ESP32 El Trabajante Firmware-Entwicklung für AutomationOne IoT-Framework.
  Verwenden bei: C++, PlatformIO, Sensor hinzufügen, Actuator erstellen,
  Driver implementieren, Service erweitern, NVS-Key hinzufügen, MQTT erweitern,
  Error-Code definieren, GPIO-Logik, Config-Struktur, Pattern finden,
  Manager erweitern, Safety-Controller, HealthMonitor, ErrorTracker,
  I2C-Protokoll, OneWire-Bus, PWM-Controller, Wokwi-Simulation.
  NICHT verwenden für: Server-seitige Logic, Python-Code, Log-Analyse.
  Abgrenzung: esp32-debug für Log-Analyse, server-dev für Server-Code.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# ESP32 Development Skill

> **Architektur:** Server-Centric. ESP32 = dumme Agenten. ALLE Logik auf Server.
> **Codebase:** `El Trabajante/` (~13.300 Zeilen C++)

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Sensor hinzufügen** | [Sensor-Workflow](#sensor-workflow) | `services/sensor/sensor_manager.h` |
| **Actuator hinzufügen** | [Actuator-Workflow](#actuator-workflow) | `services/actuator/actuator_manager.h` |
| **MQTT Topic erweitern** | [MQTT-Patterns](#mqtt-patterns) | `utils/topic_builder.h` |
| **Error-Code definieren** | [Error-Handling](#error-handling) | `models/error_codes.h` |
| **Config/NVS Key** | MODULE_REGISTRY.md | `services/config/config_manager.h` |
| **GPIO reservieren** | MODULE_REGISTRY.md | `drivers/gpio_manager.h` |
| **Safety implementieren** | [Safety-Patterns](#safety-patterns) | `services/actuator/safety_controller.h` |
| **Driver erstellen** | [Actuator-Workflow](#actuator-workflow) | `services/actuator/actuator_drivers/` |
| **Build verifizieren** | [Build Commands](#build-commands) | `platformio.ini` |
| **Startup verstehen** | [Init-Reihenfolge](#initialisierungs-reihenfolge-maincpp) | `src/main.cpp` |

---

## Ordnerstruktur
```
El Trabajante/
├── src/
│   ├── main.cpp              ← Hauptlogik (~1500 Zeilen)
│   ├── drivers/              ← GPIO, I2C, OneWire, PWM
│   ├── services/
│   │   ├── sensor/           ← SensorManager, PiEnhancedProcessor
│   │   ├── actuator/         ← ActuatorManager, SafetyController
│   │   ├── communication/    ← MQTTClient, WiFiManager
│   │   ├── config/           ← ConfigManager, StorageManager
│   │   └── provisioning/     ← ProvisionManager
│   ├── models/               ← Types, Error-Codes
│   ├── error_handling/       ← ErrorTracker, CircuitBreaker, HealthMonitor
│   ├── utils/                ← Logger, TopicBuilder
│   └── config/               ← Feature Flags, Hardware-Configs
│       └── hardware/         ← esp32_dev.h, xiao_esp32c3.h
└── platformio.ini
```

| Aufgabe | Datei |
|---------|-------|
| Sensor hinzufügen | `services/sensor/sensor_manager.h` |
| Actuator hinzufügen | `services/actuator/actuator_manager.h` |
| MQTT Topic | `utils/topic_builder.h` |
| Config/NVS | `services/config/config_manager.h` |
| Safety | `services/actuator/safety_controller.h` |
| GPIO reservieren | `drivers/gpio_manager.h` |
| Error tracken | `error_handling/error_tracker.h` |
| Health/Diagnostics | `error_handling/health_monitor.h` |
| Board-Config | `config/hardware/esp32_dev.h` |

**API-Details:** Siehe `MODULE_REGISTRY.md`

---

## Build Commands

**Wichtig:** PlatformIO-Befehle muessen aus `El Trabajante/` ausgefuehrt werden (dort liegt `platformio.ini`).

- **Git Bash (Agent):** `pio` nicht im PATH → `~/.platformio/penv/Scripts/pio.exe`. Build funktioniert, aber Upload/Monitor NICHT (COM-Port nicht erreichbar)
- **PowerShell (User):** `&&` geht NICHT in PS 5.x → Befehle einzeln oder mit `;` trennen

### Git Bash (Agent-Befehle, nur Build/Test)

```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev
~/.platformio/penv/Scripts/pio.exe run -e seeed_xiao_esp32c3
~/.platformio/penv/Scripts/pio.exe run -e wokwi_esp01   # ESP_00000001
~/.platformio/penv/Scripts/pio.exe run -e wokwi_esp02   # ESP_00000002
~/.platformio/penv/Scripts/pio.exe run -e wokwi_esp03   # ESP_00000003
~/.platformio/penv/Scripts/pio.exe test -e native -vvv   # 22 Native Unit Tests
```

### PowerShell (User-Befehle, Flash + Monitor)

```powershell
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"

# Build
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev

# Flash
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev -t upload

# Serial Monitor
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev

# Flash + Monitor (nacheinander, ; statt &&)
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev -t upload; C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev
```

---

## Initialisierungs-Reihenfolge (main.cpp)

> Konzeptuelle Reihenfolge. Exakte Zeilen siehe main.cpp STEP-Kommentare.

```
1. GPIOManager.initializeAllPinsToSafeMode()  ← MUST BE FIRST!
2. Logger.begin()
3. StorageManager.begin()
3.1 Logger: Restore log_level from NVS (system_config namespace)
4. ConfigManager.begin() + loadAllConfigs()
5. [Watchdog Configuration]
6. [Provisioning Check - wenn Config fehlt]
7. ErrorTracker.begin()
8. TopicBuilder::setEspId/setKaiserId
9. WiFiManager.begin() + connect()
10. MQTTClient.begin() + connect()
10.5 HealthMonitor.begin()  ← Nach MQTT, vor Hardware-Init
11. I2CBusManager.begin() + OneWireBusManager.begin() + PWMController.begin()
12. SensorManager.begin()
13. SafetyController.begin()  ← VOR ActuatorManager!
14. ActuatorManager.begin()
```

**KRITISCH:** GPIOManager MUSS als erstes initialisiert werden!

---

## Sensor-Workflow

### Architektur (Server-Centric)
```
ESP32: analogRead(gpio) → RAW (0-4095)
       ↓ MQTT
Server: Python Library → Processed Value
       ↓ MQTT (optional)
ESP32: Display/Log
```

**ESP32 macht KEINE lokale Sensor-Verarbeitung!** `raw_mode = true` ist IMMER gesetzt.

### Neuen Sensor hinzufügen

1. **Server:** Library in `El Servador/.../sensor_libraries/active/` erstellen
2. **ESP32:** Nur wenn neuer Bus-Typ (I2C/OneWire):
   - I2C: Protocol in `drivers/i2c_sensor_protocol.cpp` registrieren
   - OneWire: ROM-Code in Config angeben
3. **Config via MQTT:** Server sendet SensorConfig

### SensorConfig Struktur
```cpp
SensorConfig config;
config.gpio = 4;
config.sensor_type = "ds18b20";     // Server-definiert
config.sensor_name = "Temp1";
config.raw_mode = true;             // IMMER true
config.measurement_interval_ms = 30000;
config.onewire_address = "28FF..."; // Für OneWire (64-bit ROM)
config.i2c_address = 0x44;          // Für I2C (7-bit Adresse)
```

**Interface-spezifische Felder:**

| Interface | Config-Feld | MQTT-Payload | Beschreibung |
|-----------|-------------|--------------|--------------|
| OneWire | `onewire_address` | `onewire_address` | 64-bit ROM-Code (16 Hex-Zeichen) |
| I2C | `i2c_address` | `i2c_address` | 7-bit Adresse (0-127) |

### Sensor-Registry Mapping

| ESP32 Type | Server Type | Bus | I2C Addr |
|------------|-------------|-----|----------|
| `ds18b20` | `ds18b20` | OneWire | - |
| `temperature_sht31` | `sht31_temp` | I2C | 0x44 |
| `humidity_sht31` | `sht31_humidity` | I2C | 0x44 |
| `temperature_bmp280` | `bmp280_temp` | I2C | 0x76 |
| `pressure_bmp280` | `bmp280_pressure` | I2C | 0x76 |
| `temperature_bme280` | `bme280_temp` | I2C | 0x76 |
| `humidity_bme280` | `bme280_humidity` | I2C | 0x76 |
| `pressure_bme280` | `bme280_pressure` | I2C | 0x76 |
| `ph_sensor` | `ph` | ADC | - |
| `ec_sensor` | `ec` | ADC | - |
| `moisture` | `moisture` | ADC | - |

---

## Actuator-Workflow

### IActuatorDriver Interface
```cpp
class IActuatorDriver {
    // Lifecycle
    virtual bool begin(const ActuatorConfig& config) = 0;
    virtual void end() = 0;
    virtual bool isInitialized() const = 0;

    // Control
    virtual bool setValue(float normalized_value) = 0;  // 0.0-1.0
    virtual bool setBinary(bool state) = 0;
    virtual void loop() = 0;

    // Safety
    virtual bool emergencyStop(const String& reason) = 0;
    virtual bool clearEmergency() = 0;

    // Status
    virtual ActuatorStatus getStatus() const = 0;
    virtual const ActuatorConfig& getConfig() const = 0;
    virtual String getType() const = 0;
};
```

### Verfügbare Driver

| Type | Driver | Features |
|------|--------|----------|
| `pump`, `relay` | PumpActuator | Runtime-Protection |
| `pwm` | PWMActuator | 0.0-1.0 Normalisierung |
| `valve` | ValveActuator | Binary ON/OFF |

### Neuen Actuator-Typ hinzufügen

1. Driver erstellen in `services/actuator/actuator_drivers/`
2. Interface `IActuatorDriver` implementieren
3. Factory erweitern in `ActuatorManager::createDriver()`
4. Type-Token in `models/actuator_types.h` definieren

### Factory-Pattern
```cpp
// actuator_manager.cpp
std::unique_ptr<IActuatorDriver> createDriver(const String& type) {
    if (type == "pump" || type == "relay") return std::make_unique<PumpActuator>();
    if (type == "pwm") return std::make_unique<PWMActuator>();
    if (type == "valve") return std::make_unique<ValveActuator>();
    return nullptr;
}
```

---

## MQTT-Patterns

### Topic-Builder
```cpp
// Pattern: kaiser/{kaiser_id}/esp/{esp_id}/...
TopicBuilder::buildSensorDataTopic(gpio);      // .../sensor/{gpio}/data
TopicBuilder::buildActuatorCommandTopic(gpio); // .../actuator/{gpio}/command
TopicBuilder::buildSystemHeartbeatTopic();     // .../system/heartbeat
TopicBuilder::buildZoneAssignTopic();          // .../zone/assign
TopicBuilder::buildZoneAckTopic();             // .../zone/ack
```

### Standard Publish-Pattern
```cpp
void publishSensorReading(const SensorReading& reading) {
    if (!mqttClient.isConnected()) return;
    
    const char* topic = TopicBuilder::buildSensorDataTopic(reading.gpio);
    
    DynamicJsonDocument doc(512);
    doc["gpio"] = reading.gpio;
    doc["sensor_type"] = reading.sensor_type;
    doc["raw_value"] = reading.raw_value;
    doc["timestamp"] = reading.timestamp;
    doc["raw_mode"] = true;
    
    String payload;
    serializeJson(doc, payload);
    mqttClient.publish(topic, payload, 1);  // QoS 1
}
```

### QoS-Verwendung

| Message | QoS |
|---------|-----|
| Sensor Data | 1 |
| Actuator Commands | 1 |
| Heartbeat | 0 |
| Emergency Stop | 1 |

---

## Safety-Patterns

### Emergency-Stop Sequenz
```
1. SafetyController.emergencyStopAll(reason)
2. Für jeden Actuator: driver->emergencyStop()
3. GPIO → INPUT_PULLUP (safe mode)
4. MQTT Alert published
5. State → EMERGENCY_ACTIVE
```

**Garantierte Zeit:** <50ms bis alle Aktoren OFF

### GPIO Safe-Mode
```cpp
// MUSS als ERSTES in setup() aufgerufen werden!
gpioManager.initializeAllPinsToSafeMode();
```

### Pin-Reservation
```cpp
// VOR jeder GPIO-Nutzung
if (!gpioManager.isPinAvailable(gpio)) {
    return ERROR_GPIO_CONFLICT;
}
gpioManager.requestPin(gpio, "sensor", "DS18B20");
```

### Runtime-Protection (Pumps)

- Max 1h kontinuierliche Laufzeit
- Max 60 Aktivierungen/Stunde
- 30s Cooldown nach Cutoff

---

## Error-Handling

### Error-Code Ranges

| Range | Category |
|-------|----------|
| 1000-1999 | HARDWARE (GPIO, I2C, OneWire) |
| 2000-2999 | SERVICE (NVS, Config) |
| 3000-3999 | COMMUNICATION (WiFi, MQTT) |
| 4000-4999 | APPLICATION (State, Watchdog) |

### Standard Error-Pattern
```cpp
bool SomeManager::doOperation() {
    if (!initialized_) {
        errorTracker.trackError(ERROR_INIT_FAILED, "Not initialized");
        return false;
    }
    // ... operation
    return true;
}
```

### Circuit-Breaker
```cpp
CircuitBreaker cb("MQTT", 5, 30000, 10000);

if (!cb.allowRequest()) {
    LOG_WARNING("Circuit breaker OPEN");
    return false;
}

bool success = actualOperation();
success ? cb.recordSuccess() : cb.recordFailure();
```

---

## Singleton-Pattern (Standard)
```cpp
class XManager {
public:
    static XManager& getInstance() {
        static XManager instance;
        return instance;
    }
    
    XManager(const XManager&) = delete;
    XManager& operator=(const XManager&) = delete;

private:
    XManager() = default;
};

// In .cpp
extern XManager& xManager;
XManager& xManager = XManager::getInstance();
```

---

## Referenz-Dokumentation

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | MQTT Topic hinzufügen/erweitern |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | Fehlerbehandlung implementieren (1000-4999) |
| **Architecture** | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | Manager erweitern, Dependencies verstehen |
| **Communication Flows** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Datenfluss ESP32↔Server verstehen |
| **Module APIs** | `MODULE_REGISTRY.md` | Vollständige API-Details, Method-Signaturen |

> **Progressive Disclosure:** Referenzen NUR laden wenn die spezifische Aufgabe es erfordert.

---

## Regeln

1. **Server-Centric:** KEINE Business-Logic auf ESP32
2. **GPIO Safe-Mode:** IMMER `initializeAllPinsToSafeMode()` zuerst
3. **Pin-Reservation:** IMMER `gpioManager.requestPin()` vor GPIO-Nutzung
4. **Error-Codes:** IMMER aus `error_codes.h` verwenden
5. **RAII:** KEINE `new`/`delete`, nur `std::unique_ptr`
6. **Build verifizieren:** `pio run` vor Abschluss

---

## Workflow
```
1. ANALYSE      → Modul in Quick Reference finden
2. API PRÜFEN   → MODULE_REGISTRY.md für Details
3. PATTERN      → Bestehenden Code als Vorlage
4. IMPLEMENT    → Singleton/Factory/RAII beachten
5. VERIFY       → pio run -e esp32_dev
```

---

*Kompakter Skill für ESP32-Entwicklung. Details in MODULE_REGISTRY.md*
```