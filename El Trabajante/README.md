# El Trabajante - ESP32 Firmware

**Modulare Firmware-Architektur für ESP32-basierte Sensor-/Aktor-Knoten**

## 📊 Statistiken

- **Module**: 67 spezialisierte Module
- **Dateien**: 85 (42 Header + 39 Implementation + 4 Config + main.cpp)
- **Architektur**: Layered Architecture (Core → Drivers → Services → Utils)
- **Linien Code**: ~14.000 (nach Refactoring aus 7.966 Zeilen main.cpp)

## 📁 Dateistruktur

```
src/
├── core/                  # Kern-System (State Machine, Main Loop)
├── drivers/               # Hardware-Treiber (GPIO, I2C, OneWire, PWM)
├── services/              # Business Logic
│   ├── communication/    # MQTT, HTTP, WebServer
│   ├── sensor/           # Sensor-Manager + Drivers
│   ├── actuator/         # Actuator-Manager + Drivers
│   └── config/           # Configuration Management
├── utils/                 # Utilities (Logger, Time, Buffer)
├── models/                # Datenstrukturen (Enums, Structs)
├── error_handling/        # Error Tracking & Recovery
├── config/                # System-Konfiguration
│   └── hardware/         # Hardware-spezifisch (XIAO, WROOM)
└── main.cpp               # Entry Point
```

## 🎯 Prioritäten

### 🔴 KRITISCH (20 Module)
- SystemController, MainLoop, Application
- MQTTClient, WiFiManager, HTTPClient, WebServer
- SensorManager, ActuatorManager
- GPIOManager, I2CBusManager

### 🟡 HOCH (32 Module)
- Alle Sensor-/Actuator-Drivers
- Configuration & Error Handling
- Hardware Abstraction

### 🟢 MITTEL (15 Module)
- Utilities, Logger, TimeManager
- LibraryManager (Optional)

## 🔧 Hardware Support

### XIAO ESP32-C3
- GPIO: 0-21 (12 nutzbar)
- Reserved: 0, 1, 3 (Boot, USB)
- I2C: GPIO 4 (SDA), GPIO 5 (SCL)
- OneWire: GPIO 6 (empfohlen)

### ESP32-WROOM-32
- GPIO: 0-39 (24 nutzbar)
- Reserved: 0, 1, 2, 3, 12, 13
- I2C: GPIO 21 (SDA), GPIO 22 (SCL)
- OneWire: GPIO 4 (empfohlen)

## 🚀 Installation

### PlatformIO
```ini
[env:esp32]
platform = espressif32
board = esp32dev  ; oder seeed_xiao_esp32c3
framework = arduino
lib_deps = 
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.3
```

## 📖 Module-Übersicht

### Core System
- **SystemController**: State Machine (12 States)
- **MainLoop**: Loop Orchestration
- **Application**: Entry Point & Initialization

### Communication
- **MQTTClient**: MQTT mit Auto-Reconnect
- **HTTPClient**: Pi-Server Integration
- **WebServer**: Config-Portal (WiFi-Setup)

### Sensor System
- **SensorManager**: Orchestration
- **SensorFactory**: Factory Pattern
- **Drivers**: pH, DS18B20, SHT31, Generic I2C

### Actuator System
- **ActuatorManager**: Orchestration
- **SafetyController**: Emergency Stop
- **Drivers**: Pump, PWM, Valve

## 🔍 Status: STRUKTUR KOMPLETT ✓

Alle 85 Dateien wurden angelegt. Bereit für Implementation!

## 📝 Nächste Schritte

1. PlatformIO-Projekt initialisieren
2. Module implementieren (siehe docs/)
3. Unit-Tests schreiben
4. Integration testen
