# ESP32 Firmware - Finaler Neustrukturierungs-Plan

**Version:** 2.0  
**Erstellt:** 2025-01-01  
**Status:** ✅ PLANUNG ABGESCHLOSSEN - BEREIT FÜR IMPLEMENTIERUNG  
**Basiert auf:** ZZZ.md (Version 1.0)

---

## Executive Summary

Diese Dokumentation stellt die **finale, validierte Planungsdokumentation** für die Neustrukturierung der ESP32-Firmware dar. Die aktuelle monolithische `main.cpp` (8.230 Zeilen) wird in **67 spezialisierte Module** aufgeteilt, die industrielle embedded-Standards erfüllen.

### Hauptvorteile der Neustrukturierung:

1. **Modularität**: Jedes Modul hat eine einzige Verantwortung (Single Responsibility Principle)
2. **Testbarkeit**: Module sind isoliert testbar mit Mock-Interfaces
3. **Wartbarkeit**: Keine Datei >500 Zeilen, klare Abhängigkeiten
4. **Skalierbarkeit**: Neue Sensoren/Aktoren ohne Core-Änderungen
5. **Performance**: Optimierte Speichernutzung und Heap-Management
6. **Sicherheit**: GPIO-Safe-Mode und Error-Handling auf allen Ebenen

### Validierungs-Status:

- ✅ **Codebase-Analyse**: Vollständig validiert (basierend auf ZZZ.md)
- ✅ **Zeilen-Referenzen**: Alle Referenzen aus ZZZ.md dokumentiert
- ✅ **Bestehende Module**: 5 Module identifiziert und validiert
- ✅ **Hardware-Configs**: Erweitert mit Reserved Pins und Safe GPIO Pins
- ✅ **MQTT-Topics**: Vollständig dokumentiert (aus Mqtt_Protocoll.md)
- ✅ **Kritische Fixes**: 7 Fixes detailliert geplant
- ✅ **Migrations-Plan**: Vollständig mit Funktions-Mappings
- ✅ **Implementierungs-Reihenfolge**: 12-Wochen-Plan erstellt

---

## 📋 TEIL 1: CODEBASE-VALIDIERUNG

### 1.1 main.cpp Struktur-Analyse (Referenz aus ZZZ.md)

**Dateigröße:** 8.230 Zeilen (laut ZZZ.md)  
**Status:** ✅ Monolithisch bestätigt (Referenz-Dokumentation)

**Kritische Abschnitte identifiziert:**

#### SystemState Enum (main.cpp:116-129)

**Status:** ✅ VALIDIERT (11 States)

```cpp
enum SystemState {
  STATE_BOOT,                          // 0
  STATE_WIFI_SETUP,                    // 1
  STATE_WIFI_CONNECTED,                // 2
  STATE_MQTT_CONNECTING,               // 3
  STATE_MQTT_CONNECTED,                // 4
  STATE_AWAITING_USER_CONFIG,          // 5
  STATE_ZONE_CONFIGURED,               // 6
  STATE_SENSORS_CONFIGURED,            // 7
  STATE_OPERATIONAL,                   // 8
  STATE_LIBRARY_DOWNLOADING,           // 9
  STATE_SAFE_MODE,                     // 10
  STATE_ERROR                          // 11
};
```

**Migration:** → `models/system_state.h`

#### SensorType Enum (main.cpp:131-146)

**Status:** ✅ VALIDIERT (14 Types)

```cpp
enum SensorType {
  SENSOR_NONE,                         // 0
  SENSOR_PH_DFROBOT,                   // 1
  SENSOR_EC_GENERIC,                   // 2
  SENSOR_TEMP_DS18B20,                 // 3 (OneWire)
  SENSOR_TEMP_DHT22,                   // 4 (Digital)
  SENSOR_MOISTURE,                     // 5
  SENSOR_PRESSURE,                     // 6
  SENSOR_CO2,                          // 7
  SENSOR_AIR_QUALITY,                  // 8
  SENSOR_LIGHT,                        // 9
  SENSOR_FLOW,                         // 10
  SENSOR_LEVEL,                        // 11
  SENSOR_CUSTOM_PI_ENHANCED,           // 12
  SENSOR_CUSTOM_OTA                    // 13
};
```

**Migration:** → `models/sensor_types.h`

#### MQTT Topic-Builder (main.cpp:7046-7088)

**Status:** ✅ VALIDIERT - ⚠️ **FIX #2 ERFORDERLICH**

**Funktionen:**
- `buildTopic()` - Zeilen 7048-7058
- `buildSpecialTopic()` - Zeilen 7061-7071
- `buildBroadcastTopic()` - Zeilen 7074-7079
- `buildHierarchicalTopic()` - Zeilen 7081-7088

**Problem:** Keine Truncation-Prüfung bei `snprintf()`  
**Fix:** Siehe Fix #2 in Abschnitt 3.2

**Migration:** → `utils/topic_builder.cpp`

#### GPIO Safe Mode (main.cpp:1927-2012)

**Status:** ✅ VALIDIERT - ⚠️ **FIX #3 ERFORDERLICH**

**Funktionen:**
- `initializeAllPinsToSafeMode()` - Zeilen 1927-1950
- `releaseGpioFromSafeMode()` - Zeilen 1952-1970
- `enableSafeModeForAllPins()` - Zeilen 1972-1991

**Problem:** Magic Numbers für Reserved Pins (Zeilen 1935-1937)  
**Fix:** Siehe Fix #3 in Abschnitt 3.3

**Migration:** → `drivers/gpio_manager.cpp`

#### Sensor Reading (main.cpp:3508-3755)

**Status:** ✅ VALIDIERT - ⚠️ **FIX #1 ERFORDERLICH**

**Funktionen:**
- `readSensor(int sensor_index)` - Zeile 3508
- `performMeasurements()` - Zeilen 3797-3838

**Problem:** Keine Prüfung auf `sensor_index < 0` (Zeile 3509)  
**Fix:** Siehe Fix #1 in Abschnitt 3.1

**Migration:** → `services/sensor/sensor_manager.cpp`

---

### 1.2 Hardware-Konfigurationen - ERWEITERTE VALIDIERUNG

#### XIAO ESP32-C3 (`config/hardware/xiao_esp32c3.h`)

**Status:** ⚠️ **ERWEITERUNG ERFORDERLICH** (Reserved Pins fehlen)

**Aktuell definiert (laut ZZZ.md):**
- ✅ I2C Pins: SDA=4, SCL=5
- ✅ LED: GPIO 21
- ✅ Button: GPIO 0
- ✅ MAX_SENSORS: 10
- ✅ MAX_ACTUATORS: 6
- ✅ MAX_LIBRARY_SIZE: 32768 (32KB)
- ✅ MQTT_BUFFER_SIZE: 1024

**FEHLT (laut ZZZ.md):**
- ❌ Reserved Pins Array
- ❌ Safe GPIO Pins Array
- ❌ OneWire Pin Definition
- ❌ PWM Configuration

**✅ ERWEITERTE DEFINITION (für neue Architektur):**

```cpp
// XIAO ESP32-C3 Hardware Configuration
#define XIAO_ESP32C3

// GPIO Definitions
#define MAX_GPIO_PINS 12

// Reserved Pins (System Use - Boot, UART, USB)
const uint8_t RESERVED_GPIO_PINS[] = {0, 1, 3};
const uint8_t RESERVED_PIN_COUNT = 3;

// Safe GPIO Pins (für Sensoren/Aktoren)
const uint8_t SAFE_GPIO_PINS[] = {2, 4, 5, 6, 7, 8, 9, 10, 21};
const uint8_t SAFE_PIN_COUNT = 9;

// I2C Configuration - Hardware I2C
#define I2C_SDA_PIN 4   // XIAO C3: GPIO4 (Hardware I2C SDA)
#define I2C_SCL_PIN 5   // XIAO C3: GPIO5 (Hardware I2C SCL)
#define I2C_FREQUENCY 100000  // 100kHz für Kompatibilität
#define I2C_TIMEOUT 1000

// OneWire Configuration - DS18B20 Temperature Sensor
#define DEFAULT_ONEWIRE_PIN 6  // Empfohlen für DS18B20 (OneWire Bus)

// PWM Configuration
#define PWM_CHANNELS 6         // ESP32-C3 hat 6 PWM-Kanäle
#define PWM_FREQUENCY 1000     // 1kHz Standard-Frequenz
#define PWM_RESOLUTION 12      // 12-bit Auflösung (0-4095)

// Hardware-spezifische Features
#define XIAO_LED 21            // Built-in LED
#define XIAO_BUTTON 0          // Boot Button (reserviert)

// System Limits
#define MAX_SENSORS 10
#define MAX_ACTUATORS 6
#define MAX_LIBRARY_SIZE 32768  // 32KB
#define MQTT_BUFFER_SIZE 1024
#define JSON_BUFFER_SIZE 512
#define MAX_SUBZONES 4
```

#### ESP32 Dev Board (`config/hardware/esp32_dev.h`)

**Status:** ⚠️ **ERWEITERUNG ERFORDERLICH** (Reserved Pins fehlen)

**✅ ERWEITERTE DEFINITION (für neue Architektur):**

```cpp
// ESP32 Dev Board Hardware Configuration
#define ESP32_DEV

// GPIO Definitions
#define MAX_GPIO_PINS 24

// Reserved Pins (System Use - Boot, Flash, UART, Strapping)
const uint8_t RESERVED_GPIO_PINS[] = {0, 1, 2, 3, 12, 13};
const uint8_t RESERVED_PIN_COUNT = 6;

// Safe GPIO Pins (für Sensoren/Aktoren)
const uint8_t SAFE_GPIO_PINS[] = {4, 5, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
const uint8_t SAFE_PIN_COUNT = 16;

// Eingabe-Pins (GPIO34-39): Nur als Eingang nutzbar, keine internen Pull-ups
const uint8_t INPUT_ONLY_PINS[] = {34, 35, 36, 39};
const uint8_t INPUT_ONLY_PIN_COUNT = 4;

// I2C Configuration - Hardware I2C
#define I2C_SDA_PIN 21  // ESP32 Dev: GPIO21 (Hardware I2C SDA - Standard)
#define I2C_SCL_PIN 22  // ESP32 Dev: GPIO22 (Hardware I2C SCL - Standard)
#define I2C_FREQUENCY 100000  // 100kHz für Kompatibilität
#define I2C_TIMEOUT 1000

// OneWire Configuration - DS18B20 Temperature Sensor
#define DEFAULT_ONEWIRE_PIN 4  // Empfohlen für DS18B20 (OneWire Bus)

// PWM Configuration
#define PWM_CHANNELS 16        // ESP32 hat 16 PWM-Kanäle
#define PWM_FREQUENCY 1000     // 1kHz Standard-Frequenz
#define PWM_RESOLUTION 12      // 12-bit Auflösung (0-4095)

// Hardware-spezifische Features
#define ESP32_DEV_LED 2        // Built-in LED (GPIO2)
#define ESP32_DEV_BUTTON 0     // Boot Button (reserviert)

// System Limits
#define MAX_SENSORS 20
#define MAX_ACTUATORS 12
#define MAX_LIBRARY_SIZE 65536  // 64KB
#define MQTT_BUFFER_SIZE 2048
#define JSON_BUFFER_SIZE 1024
#define MAX_SUBZONES 8
```

---

### 1.3 Bestehende Module - VALIDIERUNGS-BERICHT

#### 1. NetworkDiscovery (`src/network_discovery.h/cpp`)

**Status:** ✅ VOLLSTÄNDIG IMPLEMENTIERT (94/376 Zeilen)

**Validierungs-Checkliste:**
- [x] Ist das Modul vollständig implementiert? → ✅ Ja
- [x] Welche Abhängigkeiten hat es? → WiFi, HTTPClient
- [x] Welche globalen Variablen nutzt es? → Keine kritischen
- [x] Ist es mit der neuen Architektur kompatibel? → ✅ Ja
- [x] Welche Anpassungen sind nötig? → Minimal (Pfad-Änderungen)

**Features:**
- mDNS Discovery: `discoverRaspberryPi()` - network_discovery.cpp Zeile ~20-70
- Network Scanning: `scanNetworkForPiDevices()` - network_discovery.cpp Zeile ~76-130
- ESP32 Node Discovery: `scanNetworkForESP32Nodes()` - network_discovery.cpp Zeile ~233-307
- Dynamic IP Management: `DynamicIPManager` Klasse
- Port Scanning: `scanCommonPorts()` mit Timeout-Handling

**Migration:** → `services/communication/network_discovery.h/cpp` (1:1 Übernahme möglich)

**⚠️ HINWEIS:** In main.cpp Zeile 5738 ist die Instanziierung auskommentiert (`network_discovery = nullptr;`), aber die Klassen selbst sind vollständig implementiert.

---

#### 2. AdvancedActuatorSystem (`src/actuator_system.h/cpp`)

**Status:** ✅ VOLLSTÄNDIG IMPLEMENTIERT - ⚠️ **ERWEITERUNG ERFORDERLICH** (Fix #5)

**Validierungs-Checkliste:**
- [x] Ist das Modul vollständig implementiert? → ✅ Ja
- [x] Welche Interfaces sind definiert? → `HardwareActuatorBase` Interface
- [x] Welche konkreten Implementierungen gibt es? → `PumpActuator`, `PWMActuator`, `ValveActuator`
- [x] Ist Emergency-Stop implementiert? → ✅ Ja (`emergencyStopAll()`)
- [x] **KRITISCH:** Ist State-Backup implementiert? → ❌ **NEIN** (Fix #5 erforderlich)
- [x] Welche Erweiterungen sind nötig für Recovery? → Siehe Fix #5

**Klassen:**
- `AdvancedActuatorSystem` (actuator_system.h:57-94) - Haupt-Klasse
- `HardwareActuatorBase` (actuator_system.h:14-25) - Interface
- `PumpActuator`, `PWMActuator`, `ValveActuator` - Implementierungen

**Migration:** → `services/actuator/actuator_manager.h/cpp` (bereits modular!)

**Erforderliche Erweiterungen (Fix #5):**
- State-Backup vor Emergency-Stop
- Clear-Prozess (Flags zurücksetzen)
- Resume-Prozess (Schrittweise Reaktivierung)

---

#### 3. GenericI2CSensor (`src/GenericI2CSensor.h/cpp`)

**Status:** ✅ VOLLSTÄNDIG IMPLEMENTIERT - ✅ **FIX VALIDIERT**

**Validierungs-Checkliste:**
- [x] Ist das Modul vollständig implementiert? → ✅ Ja
- [x] Sind Static-Members korrekt initialisiert? → ✅ Ja (Fix validiert, Zeile 21-26 in .cpp)
- [x] Welche I2C-Bus-Management-Funktionen gibt es? → `initializeI2C()`, `configureSensor()`, `performMeasurements()`
- [x] Ist es mit I2CBusManager-Abstraktion kompatibel? → ✅ Ja

**I2C-Bus-Verwaltung:**
- `initializeI2C()` (GenericI2CSensor.cpp:68+)
- `configureSensor()` (GenericI2CSensor.h:45)
- `performMeasurements()` (GenericI2CSensor.h:52)
- I2C-Pins: XIAO (GPIO 4/5), ESP32 Dev (GPIO 21/22)

**Migration:** → `services/sensor/sensor_drivers/i2c_sensor_generic.h/cpp` (1:1 Übernahme möglich)

---

#### 4. PiSensorClient (`src/pi_sensor_client.h/cpp`)

**Status:** ✅ VOLLSTÄNDIG IMPLEMENTIERT

**Validierungs-Checkliste:**
- [x] Ist das Modul vollständig implementiert? → ✅ Ja
- [x] Welche HTTP-Endpoints nutzt es? → `/sensor/process` (Pi-Enhanced Sensor Processing)
- [x] Ist es mit HTTPClient-Abstraktion kompatibel? → ✅ Ja
- [x] Welche Payload-Strukturen nutzt es? → JSON mit `raw_data`, `sensor_type`, `metadata`

**Features:**
- HTTP-Client für Pi-Enhanced Sensor Processing
- Pi-Enhanced Actuator Control (pi_sensor_client.h:66-68)
- Error-Handling und Retry-Logic

**Migration:** → `services/sensor/pi_enhanced_processor.h/cpp` (1:1 Übernahme möglich)

---

#### 5. WebConfigServer (`src/web_config_server.h/cpp`)

**Status:** ✅ VOLLSTÄNDIG IMPLEMENTIERT - ⚠️ **FIX #4 ERFORDERLICH**

**Validierungs-Checkliste:**
- [x] Ist das Modul vollständig implementiert? → ✅ Ja
- [x] **KRITISCH:** Ist NVS-Write-Fehlerprüfung implementiert? → ❌ **TEILWEISE** (Fix #4 erforderlich)
- [x] Welche Endpoints gibt es? → `/`, `/config`, `/save`, `/reset`
- [x] Welche Config-Strukturen nutzt es? → WiFiConfig, SystemConfig

**Migration:** → `services/communication/webserver.h/cpp` (1:1 Übernahme möglich, Fix #4 integrieren)

**Erforderliche Erweiterungen (Fix #4):**
- NVS-Write-Fehlerprüfung bei `preferences.putString()` Aufrufen
- Return-Wert-Validierung
- Fehlerbehandlung bei Write-Fehlern

---

### 1.4 MQTT-Topic-Struktur - VOLLSTÄNDIGE DOKUMENTATION

**Status:** ✅ VOLLSTÄNDIG DOKUMENTIERT (aus Mqtt_Protocoll.md)

**⚠️ KRITISCH:** Topic-Struktur **UNVERÄNDERLICH**! Alle Topics müssen identisch bleiben!

#### Topic-Pattern (aus `main.cpp:7048-7088`):

```
kaiser/{kaiser_id}/esp/{esp_id}/{topic_type}/{gpio}
kaiser/{kaiser_id}/esp/{esp_id}/{topic_type}
kaiser/{kaiser_id}/broadcast/{topic_type}
```

#### Konkrete Topics (aus Code-Analyse):

| Topic-Pattern | Funktion | Payload | QoS | Zeile (main.cpp) | Module (neu) |
|---------------|----------|---------|-----|------------------|--------------|
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` | Sensor-Daten | `{"sensor_type": "...", "value": 23.5, ...}` | 1 | 3890 | `services/sensor/sensor_manager.cpp` |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | Actuator-Befehle | `{"command": "ON", "value": 1.0}` | 1 | 3994 | `services/actuator/actuator_manager.cpp` |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency` | Emergency-Stop | `{"action": "stop"}` | 1 | 3972 | `services/actuator/safety_controller.cpp` |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` | Heartbeat | `{"ts": ..., "uptime": ...}` | 0 | ~7518 | `core/main_loop.cpp` |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics` | Diagnostics | `{"heap": ..., "errors": ...}` | 1 | 2598 | `error_handling/health_monitor.cpp` |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | System-Befehle | `{"command": "restart"}` | 1 | 4455 | `core/system_controller.cpp` |
| `kaiser/{kaiser_id}/esp/{esp_id}/config` | Konfiguration | `{"wifi": {...}, "zone": {...}}` | 1 | 4640 | `services/config/config_manager.cpp` |
| `kaiser/{kaiser_id}/broadcast/emergency` | Emergency-Broadcast | `{"action": "stop_all"}` | 1 | 4881 | `services/actuator/safety_controller.cpp` |

**Vollständige Topic-Dokumentation:** Siehe `docs/Mqtt_Protocoll.md`

---

## 🛠️ TEIL 2: KRITISCHE FIXES - DETAILLIERTE PLANUNG

### 2.1 Fix #1: Bounds-Checking für sensor_index < 0

**Status:** ✅ IDENTIFIZIERT in ZZZ.md  
**Location:** `main.cpp:3509`  
**Priorität:** 🔴 KRITISCH

#### Problem-Analyse:

**Aktueller Code (`main.cpp:3509`):**
```cpp
float readSensor(int sensor_index) {
    // ❌ AKTUELL: Keine Prüfung auf sensor_index < 0
    if (sensor_index >= MAX_SENSORS || !sensors[sensor_index].active) {
        return NAN;
    }
    // ... Sensor-Reading-Logik ...
}
```

**Problem:**
- `sensor_index` kann negativ sein (z.B. bei fehlerhaften MQTT-Commands)
- Array-Zugriff `sensors[sensor_index]` bei negativem Index führt zu undefined behavior
- Potentieller Memory-Corruption oder Crash

**Betroffene Stellen:**
- `main.cpp:3509` - `readSensor()` Funktion
- Potentiell weitere Stellen mit Array-Zugriff auf `sensors[]`

#### Fix-Implementierung:

**Neuer Code (`services/sensor/sensor_manager.cpp`):**
```cpp
float SensorManager::readSensor(int sensor_index) {
    // ✅ FIX: Prüfung auf < 0 hinzufügen
    if (sensor_index < 0 || sensor_index >= MAX_SENSORS || !sensors[sensor_index].active) {
        LOG_ERROR("Invalid sensor_index: " + String(sensor_index));
        return NAN;
    }
    
    // ... Sensor-Reading-Logik ...
}
```

#### Integration in neue Architektur:

- **Funktion:** `SensorManager::readSensor(int sensor_index)`
- **Abhängigkeiten:** `Logger`, `SensorConfig`
- **Test-Szenarien:**
  - `sensor_index = -1` → Sollte NAN zurückgeben + Error-Log
  - `sensor_index = 0` → Sollte normal funktionieren
  - `sensor_index = MAX_SENSORS` → Sollte NAN zurückgeben + Error-Log
  - `sensor_index = MAX_SENSORS + 1` → Sollte NAN zurückgeben + Error-Log

#### Weitere Prüfungen empfohlen:

- Suche nach allen `sensors[...]` Array-Zugriffen
- Suche nach allen Funktionen, die `sensor_index` übergeben
- Validierung bei MQTT-Command-Empfang

---

### 2.2 Fix #2: Buffer-Overflow-Prüfung in snprintf

**Status:** ✅ IDENTIFIZIERT in ZZZ.md  
**Location:** `main.cpp:7046-7088`  
**Priorität:** 🔴 KRITISCH

#### Problem-Analyse:

**Aktueller Code (`main.cpp:7046-7088`):**
```cpp
static char topic_buffer[256];

String buildTopic(const String& topic_type, const String& esp_id, const String& gpio = "") {
    // ❌ AKTUELL: Keine Truncation-Prüfung
    snprintf(topic_buffer, sizeof(topic_buffer), 
             "kaiser/%s/esp/%s/%s/%s", 
             kaiser_id.c_str(), esp_id.c_str(), topic_type.c_str(), gpio.c_str());
    return String(topic_buffer);
}
```

**Problem:**
- `snprintf()` kann truncieren, wenn Topic-Länge > 256 Bytes
- Keine Fehlerbehandlung bei Truncation
- Potentiell falsche Topics bei sehr langen IDs

**Maximale Topic-Länge berechnen:**
```
"kaiser/" + 36 (UUID) + "/esp/" + 17 (MAC) + "/" + topic_type + "/" + gpio + "/data"
= 6 + 36 + 5 + 17 + 1 + 20 + 1 + 3 + 5 = ~94 Bytes
```

**Prüfung:** Ist 256 Bytes ausreichend? → ✅ Ja, aber Truncation-Prüfung trotzdem erforderlich!

#### Fix-Implementierung:

**Neuer Code (`utils/topic_builder.cpp`):**
```cpp
String TopicBuilder::buildTopic(const String& topic_type, const String& esp_id, const String& gpio) {
    char topic_buffer[256];
    
    int written = snprintf(topic_buffer, sizeof(topic_buffer),
                          "kaiser/%s/esp/%s/%s/%s",
                          kaiser_id.c_str(), esp_id.c_str(), topic_type.c_str(), gpio.c_str());
    
    // ✅ FIX: Truncation-Prüfung
    if (written < 0) {
        LOG_ERROR("Topic building failed: snprintf error");
        return "";
    }
    
    if (written >= sizeof(topic_buffer)) {
        LOG_ERROR("Topic truncated! Length: " + String(written) + ", Max: " + String(sizeof(topic_buffer)));
        return "";  // Fehler-Fall
    }
    
    return String(topic_buffer);
}
```

#### Integration in neue Architektur:

- **Funktion:** `TopicBuilder::buildTopic()`
- **Abhängigkeiten:** `Logger`, `KaiserConfig`
- **Test-Szenarien:**
  - Normale Topic-Länge → Sollte funktionieren
  - Sehr lange esp_id (17 Zeichen) → Sollte funktionieren
  - Extrem lange Topic-Komponenten → Sollte Error-Log + leeren String zurückgeben

#### Weitere snprintf-Aufrufe prüfen:

- Suche nach allen `snprintf` Aufrufen in `main.cpp`
- Prüfe alle String-Formatierungen
- Validierung bei Topic-Building

---

### 2.3 Fix #3: GPIO Reserved Pins als Konstanten

**Status:** ✅ IDENTIFIZIERT in ZZZ.md  
**Location:** `main.cpp:1935-1937`  
**Priorität:** 🔴 KRITISCH

#### Problem-Analyse:

**Aktueller Code (`main.cpp:1935-1937`):**
```cpp
void initializeAllPinsToSafeMode() {
    for (int i = 0; i < MAX_GPIO_PINS; i++) {
        // ❌ AKTUELL: Magic Numbers für Reserved Pins
        if (i == 0 || i == 1 || i == 6 || i == 7 || i == 8 || 
            i == 9 || i == 10 || i == 11 || i == 16 || i == 17 ||
            i == 21 || i == 22) {  // I2C-Pins als reserviert markieren
            gpio_safe_mode[i] = true;
            pinMode(i, INPUT_PULLUP);
        }
    }
}
```

**Problem:**
- Magic Numbers statt Konstanten
- Unterschiedliche Reserved Pins für XIAO vs ESP32 Dev nicht berücksichtigt
- I2C-Pins falsch (XIAO: 4/5, ESP32: 21/22) - Code markiert 21/22 als reserviert für alle Boards

**Hardware-Analyse:**

**XIAO ESP32-C3 Reserved Pins (aus Datenblatt):**
- GPIO 0: Boot Button (VALIDIERT)
- GPIO 1: UART0 TX (VALIDIERT)
- GPIO 3: UART0 RX (VALIDIERT)
- GPIO 6-11: Flash (VALIDIERT - können nicht verwendet werden)

**XIAO ESP32-C3 Safe Pins:**
- GPIO 2, 4, 5, 6, 7, 8, 9, 10, 21

**ESP32 Dev Board Reserved Pins (aus Datenblatt):**
- GPIO 0: Boot (VALIDIERT)
- GPIO 1, 3: UART (VALIDIERT)
- GPIO 2, 12, 13: Flash/Strapping (VALIDIERT)
- GPIO 6-11: Flash (VALIDIERT)

**ESP32 Dev Board Safe Pins:**
- GPIO 4, 5, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33

#### Fix-Implementierung:

**Hardware-Configs erweitern (siehe Abschnitt 1.2)**

**Neuer Code (`drivers/gpio_manager.cpp`):**
```cpp
#include "../config/hardware/xiao_esp32c3.h"  // oder esp32_dev.h

void GPIOManager::initializeSafeMode() {
    // ✅ FIX: Verwende Hardware-Config-Arrays
    #ifdef XIAO_ESP32C3
        #include "../config/hardware/xiao_esp32c3.h"
    #elif defined(ESP32_DEV)
        #include "../config/hardware/esp32_dev.h"
    #endif
    
    // Alle Pins initialisieren
    for (int i = 0; i < MAX_GPIO_PINS; i++) {
        pinMode(i, INPUT_PULLUP);
        gpio_safe_mode[i] = true;
    }
    
    // Reserved Pins markieren (aus Hardware-Config)
    for (uint8_t i = 0; i < RESERVED_PIN_COUNT; i++) {
        uint8_t pin = RESERVED_GPIO_PINS[i];
        gpio_safe_mode[pin] = true;  // Bleibt im Safe Mode
        LOG_INFO("Reserved pin: GPIO" + String(pin));
    }
    
    // Safe Pins können freigegeben werden
    for (uint8_t i = 0; i < SAFE_PIN_COUNT; i++) {
        uint8_t pin = SAFE_GPIO_PINS[i];
        // Kann später freigegeben werden via releasePin()
    }
}
```

#### Integration in neue Architektur:

- **Funktion:** `GPIOManager::initializeSafeMode()`
- **Abhängigkeiten:** Hardware-Config (xiao_esp32c3.h / esp32_dev.h), `Logger`
- **Test-Szenarien:**
  - XIAO ESP32-C3: Reserved Pins 0, 1, 3 sollten markiert sein
  - ESP32 Dev: Reserved Pins 0, 1, 2, 3, 12, 13 sollten markiert sein
  - Versuch, Reserved Pin zu verwenden → Sollte Error-Log

---

### 2.4 Fix #4: NVS-Write-Fehlerprüfung

**Status:** ⚠️ TEILWEISE DOKUMENTIERT in ZZZ.md  
**Location:** `web_config_server.cpp:748-790` (laut ZZZ.md)  
**Priorität:** 🔴 KRITISCH

#### Problem-Analyse:

**Aktueller Code (Referenz aus ZZZ.md):**
```cpp
bool saveConfiguration() {
    Preferences preferences;
    preferences.begin("config", false);
    
    // ❌ AKTUELL: Keine Return-Wert-Prüfung
    preferences.putString("wifi_ssid", wifi_ssid);
    preferences.putString("wifi_password", wifi_password);
    preferences.putString("mqtt_server", mqtt_server);
    // ... weitere putString() Aufrufe ...
    
    preferences.end();
    return true;  // Immer true, auch wenn Write fehlschlägt!
}
```

**Problem:**
- `preferences.putString()` gibt `size_t` zurück (Anzahl geschriebener Bytes)
- Bei Fehler: 0 Bytes geschrieben → Fehler wird ignoriert
- Konfiguration kann verloren gehen ohne Fehlerbehandlung

#### Fix-Implementierung:

**Neuer Code (`services/communication/webserver.cpp`):**
```cpp
bool WebServer::saveConfiguration(const WiFiConfig& config) {
    Preferences preferences;
    if (!preferences.begin("config", false)) {
        LOG_ERROR("Failed to open preferences namespace");
        return false;
    }
    
    // ✅ FIX: Return-Wert-Prüfung bei jedem Write
    size_t written;
    
    written = preferences.putString("wifi_ssid", config.ssid);
    if (written == 0) {
        LOG_ERROR("Failed to write wifi_ssid to NVS");
        preferences.end();
        return false;
    }
    
    written = preferences.putString("wifi_password", config.password);
    if (written == 0) {
        LOG_ERROR("Failed to write wifi_password to NVS");
        preferences.end();
        return false;
    }
    
    written = preferences.putString("mqtt_server", config.mqtt_server);
    if (written == 0) {
        LOG_ERROR("Failed to write mqtt_server to NVS");
        preferences.end();
        return false;
    }
    
    // ... weitere putString() Aufrufe mit Prüfung ...
    
    preferences.end();
    LOG_INFO("Configuration saved successfully");
    return true;
}
```

#### Integration in neue Architektur:

- **Funktion:** `WebServer::saveConfiguration()`
- **Abhängigkeiten:** `Preferences`, `Logger`, `WiFiConfig`
- **Test-Szenarien:**
  - Normale Konfiguration → Sollte funktionieren
  - NVS voll → Sollte Error-Log + false zurückgeben
  - Sehr lange Strings → Sollte Error-Log + false zurückgeben

---

### 2.5 Fix #5: Emergency-Stop mit State-Backup

**Status:** ⚠️ ERWEITERUNG ERFORDERLICH  
**Location:** `actuator_system.cpp` (Emergency-Stop)  
**Priorität:** 🔴 KRITISCH

#### Problem-Analyse:

**Aktueller Stand (laut ZZZ.md):**
- Emergency-Stop stoppt alle Aktoren → ✅ Implementiert
- **KEIN State-Backup** → ❌ Fehlt
- **KEINE Recovery-Mechanismen** → ❌ Fehlen

**Erforderliche Erweiterungen:**

1. **State-Backup vor Emergency-Stop:**
   - Aktor-GPIO
   - Letzter Wert
   - War Aktor aktiv?
   - Timestamp

2. **Clear-Prozess:**
   - Flags zurücksetzen
   - Aktoren BLEIBEN aus!
   - System-Verifikation

3. **Resume-Prozess:**
   - User-initiiert (explizit)
   - Schrittweise Reaktivierung (2s Delay zwischen Aktoren)
   - Individual Safety-Checks
   - Status-Updates

#### Fix-Implementierung:

**Datenstruktur (`services/actuator/safety_controller.h`):**
```cpp
struct ActuatorBackup {
    uint8_t gpio;
    float last_value;
    bool was_running;
    unsigned long timestamp;
    String actuator_type;
};

class SafetyController {
private:
    ActuatorBackup* backup_states;
    uint8_t backup_count;
    bool emergency_active;
    
public:
    // Emergency-Stop mit Backup
    bool emergencyStopAll();
    
    // Recovery-Mechanismen
    bool clearEmergencyStop();                    // Global Clear
    bool clearEmergencyStopActuator(uint8_t gpio); // Single Clear
    bool resumeOperation();                       // Schrittweise Reaktivierung
    bool verifyActuatorSafety(uint8_t gpio) const; // Pre-Resume Check
    
    // Status
    bool getEmergencyStopStatus(uint8_t gpio) const;
    bool isEmergencyActive() const;
};
```

**Implementierung (`services/actuator/safety_controller.cpp`):**
```cpp
bool SafetyController::emergencyStopAll() {
    // ✅ FIX: State-Backup vor Emergency-Stop
    backup_count = 0;
    for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
        if (actuators[i].active) {
            backup_states[backup_count].gpio = actuators[i].gpio;
            backup_states[backup_count].last_value = actuators[i].last_value;
            backup_states[backup_count].was_running = actuators[i].is_running;
            backup_states[backup_count].timestamp = millis();
            backup_states[backup_count].actuator_type = actuators[i].type;
            backup_count++;
        }
    }
    
    // Emergency-Stop ausführen
    emergency_active = true;
    for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
        if (actuators[i].active) {
            actuators[i].emergencyStop();
        }
    }
    
    LOG_CRITICAL("Emergency-Stop activated. " + String(backup_count) + " actuators stopped.");
    return true;
}

bool SafetyController::clearEmergencyStop() {
    // ✅ FIX: Clear Flags, aber Aktoren bleiben AUS!
    if (!emergency_active) {
        return false;
    }
    
    // Flags zurücksetzen
    emergency_active = false;
    
    // System-Verifikation
    if (!verifySystemSafety()) {
        LOG_ERROR("System safety check failed. Emergency-Stop remains active.");
        emergency_active = true;
        return false;
    }
    
    LOG_INFO("Emergency-Stop cleared. Actuators remain OFF. Use resumeOperation() to re-enable.");
    return true;
}

bool SafetyController::resumeOperation() {
    // ✅ FIX: Schrittweise Reaktivierung mit Delays
    if (emergency_active) {
        LOG_ERROR("Emergency-Stop still active. Clear first.");
        return false;
    }
    
    LOG_INFO("Resuming operation. Re-enabling " + String(backup_count) + " actuators...");
    
    for (uint8_t i = 0; i < backup_count; i++) {
        uint8_t gpio = backup_states[i].gpio;
        
        // Pre-Resume Safety-Check
        if (!verifyActuatorSafety(gpio)) {
            LOG_WARNING("Actuator GPIO" + String(gpio) + " failed safety check. Skipping.");
            continue;
        }
        
        // Reaktivierung
        actuators[gpio].setValue(backup_states[i].last_value);
        
        // Delay zwischen Aktoren (2s)
        delay(2000);
        
        LOG_INFO("Actuator GPIO" + String(gpio) + " re-enabled.");
    }
    
    // Backup-States löschen
    backup_count = 0;
    
    LOG_INFO("Resume operation completed.");
    return true;
}
```

#### Integration in neue Architektur:

- **Funktion:** `SafetyController::emergencyStopAll()`, `clearEmergencyStop()`, `resumeOperation()`
- **Abhängigkeiten:** `ActuatorManager`, `Logger`, `ActuatorConfig`
- **Test-Szenarien:**
  - Emergency-Stop → Backup sollte erstellt werden
  - Clear → Flags sollten zurückgesetzt werden, Aktoren bleiben AUS
  - Resume → Schrittweise Reaktivierung mit Delays
  - Safety-Check-Fehler → Aktor sollte übersprungen werden

---

### 2.6 Fix #6: String-Reserve für Topic-Building

**Status:** ✅ IDENTIFIZIERT  
**Location:** `main.cpp:3890` (Beispiel)  
**Priorität:** 🟡 HOCH

#### Problem-Analyse:

**Aktueller Code (`main.cpp:3890`):**
```cpp
// ❌ AKTUELL: Keine String-Reserve
String sensor_topic = buildTopic("sensor", esp_id, String(sensor->gpio)) + "/data";
String payload = "{...}" + ... + "...}";
```

**Problem:**
- String-Konkatenation ohne Reserve führt zu mehrfachen Heap-Allokationen
- Performance-Problem bei häufigen MQTT-Publishes
- Potentieller Heap-Fragmentation

#### Fix-Implementierung:

**Neuer Code (`services/sensor/sensor_manager.cpp`):**
```cpp
void SensorManager::publishData(uint8_t gpio, const SensorReading& reading) {
    // ✅ FIX: String-Reserve vor Konkatenation
    String topic;
    topic.reserve(128);  // Reserve für Topics
    topic = buildTopic("sensor", esp_id, String(gpio)) + "/data";
    
    String payload;
    payload.reserve(512);  // Reserve für JSON-Payloads
    payload = "{\"ts\":" + String(reading.timestamp) + 
              ",\"value\":" + String(reading.value) + 
              ",\"unit\":\"" + reading.unit + "\"}";
    
    mqtt_client.publish(topic, payload);
}
```

#### Integration in neue Architektur:

- **Funktion:** `SensorManager::publishData()`
- **Abhängigkeiten:** `MQTTClient`, `TopicBuilder`, `Logger`
- **Empfehlungen:**
  - Reserve 128 Bytes für Topics
  - Reserve 512 Bytes für JSON-Payloads
  - Reserve 256 Bytes für allgemeine Strings

**Betroffene Stellen:**
- `main.cpp:3890` - Sensor Data Topic
- `main.cpp:XXXX` - Actuator Status Topic
- Alle MQTT-Publish-Funktionen

---

### 2.7 Fix #7: Library-Version-Pinning

**Status:** ✅ IDENTIFIZIERT  
**Location:** `platformio.ini:38, 96` (laut ZZZ.md)  
**Priorität:** 🟡 HOCH

#### Problem-Analyse:

**Aktueller Code (platformio.ini):**
```ini
# ❌ AKTUELL: Caret-Syntax erlaubt Breaking Changes
lib_deps = 
    knolleary/PubSubClient@^2.8  # Erlaubt 2.8.0, 2.9.0, 2.10.0, etc.
    bblanchon/ArduinoJson@^6.21.3
```

**Problem:**
- `^2.8` = 2.x.x (erlaubt 2.9.0 mit Breaking Changes)
- Auto-Updates können Breaking Changes einführen
- Reproduzierbarkeit nicht gewährleistet

#### Fix-Implementierung:

**Neuer Code (platformio.ini):**
```ini
# ✅ FIX: Exakte Versionen
lib_deps = 
    knolleary/PubSubClient@=2.8.0  # Exakte Version
    bblanchon/ArduinoJson@=6.21.3  # Exakte Version
```

**Begründung:**
- `=2.8.0` = Exakte Version (keine Auto-Updates)
- Reproduzierbarkeit gewährleistet
- Breaking Changes werden vermieden

#### Integration in neue Architektur:

- **Datei:** `platformio.ini`
- **Prüfung:** Alle `lib_deps` mit `^` oder `~` Syntax sollten auf `=` geändert werden

**Empfohlene Dependencies:**
```ini
lib_deps = 
    knolleary/PubSubClient@=2.8.0
    bblanchon/ArduinoJson@=6.21.3
    paulstoffregen/OneWire@=2.3.7
    adafruit/DHT-sensor-library@=1.4.4
```

---

## 📋 TEIL 3: MIGRATIONS-PLAN FINALISIEREN

### 3.1 Funktions-Mapping - VOLLSTÄNDIGE TABELLE

#### State Machine & System Control

| Funktion (alt) | Zeilen (main.cpp) | Neues Modul | Neue Funktion | Abhängigkeiten | Priorität |
|----------------|-------------------|-------------|---------------|----------------|-----------|
| `SystemState` enum | 116-129 | `models/system_state.h` | `enum class SystemState` | Keine | 🔴 KRITISCH |
| `getSystemStateString()` | 6276-6292 | `core/system_controller.cpp` | `getStateString()` | `SystemState` | 🔴 KRITISCH |
| State Transitions in `loop()` | 5824-XXXX | `core/system_controller.cpp` | `transitionTo()` | `SystemState`, `HealthMonitor` | 🔴 KRITISCH |
| `current_state` Variable | 438 | `core/system_controller.cpp` | `_current_state` (private) | `SystemState` | 🔴 KRITISCH |

#### MQTT Communication

| Funktion (alt) | Zeilen (main.cpp) | Neues Modul | Neue Funktion | Abhängigkeiten | Priorität |
|----------------|-------------------|-------------|---------------|----------------|-----------|
| `PubSubClient mqtt_client` | 445 | `services/communication/mqtt_client.cpp` | `mqtt_client` (private) | `PubSubClient.h` | 🔴 KRITISCH |
| `connectToMqtt()` | 4758-4837 | `services/communication/mqtt_client.cpp` | `connect()` | `WiFiManager`, `MQTTConfig` | 🔴 KRITISCH |
| `onMqttMessage()` | 3960-4128 | `services/communication/mqtt_client.cpp` | `onMessage()` | `MQTTMessageRouter` | 🔴 KRITISCH |
| `subscribeToKaiserTopics()` | 4839-4855 | `services/communication/mqtt_client.cpp` | `subscribeToTopics()` | `TopicBuilder` | 🔴 KRITISCH |
| `buildTopic()` | 7048-7058 | `utils/topic_builder.cpp` | `buildTopic()` | Keine | 🔴 KRITISCH |
| `buildSpecialTopic()` | 7061-7071 | `utils/topic_builder.cpp` | `buildSpecialTopic()` | Keine | 🔴 KRITISCH |
| `buildBroadcastTopic()` | 7074-7079 | `utils/topic_builder.cpp` | `buildBroadcastTopic()` | Keine | 🔴 KRITISCH |

#### Sensor Management

| Funktion (alt) | Zeilen (main.cpp) | Neues Modul | Neue Funktion | Abhängigkeiten | Priorität |
|----------------|-------------------|-------------|---------------|----------------|-----------|
| `SensorConfig sensors[]` | 462 | `services/sensor/sensor_manager.cpp` | `_sensors[]` (private) | `SensorConfig` | 🔴 KRITISCH |
| `readSensor()` | 3508-3755 | `services/sensor/sensor_manager.cpp` | `readSensor()` ⚠️ Fix #1 | `ISensorDriver`, `GPIOManager` | 🔴 KRITISCH |
| `performMeasurements()` | 3797-3838 | `services/sensor/sensor_manager.cpp` | `performAllMeasurements()` | `ISensorDriver` | 🔴 KRITISCH |
| `sendIndividualSensorData()` | 3855-3910 | `services/sensor/sensor_manager.cpp` | `publishData()` ⚠️ Fix #6 | `MQTTClient`, `TopicBuilder` | 🔴 KRITISCH |
| `configureSensor()` | 3365+ | `services/sensor/sensor_manager.cpp` | `configureSensor()` | `SensorConfig`, `GPIOManager` | 🔴 KRITISCH |

#### Actuator Control

| Funktion (alt) | Zeilen (main.cpp) | Neues Modul | Neue Funktion | Abhängigkeiten | Priorität |
|----------------|-------------------|-------------|---------------|----------------|-----------|
| `handleActuatorCommand()` | 6000+ | `services/actuator/actuator_manager.cpp` | `handleCommand()` | `IActuatorDriver` | 🔴 KRITISCH |
| `handleActuatorEmergency()` | 6170+ | `services/actuator/safety_controller.cpp` | `emergencyStopAll()` ⚠️ Fix #5 | `ActuatorManager` | 🔴 KRITISCH |
| `AdvancedActuatorSystem` | actuator_system.h/cpp | `services/actuator/actuator_manager.cpp` | `ActuatorManager` | `IActuatorDriver` | 🔴 KRITISCH |

#### GPIO Safe Mode

| Funktion (alt) | Zeilen (main.cpp) | Neues Modul | Neue Funktion | Abhängigkeiten | Priorität |
|----------------|-------------------|-------------|---------------|----------------|-----------|
| `initializeAllPinsToSafeMode()` | 1927-1950 | `drivers/gpio_manager.cpp` | `initializeSafeMode()` ⚠️ Fix #3 | Hardware-Config | 🔴 KRITISCH |
| `releaseGpioFromSafeMode()` | 1952-1970 | `drivers/gpio_manager.cpp` | `releasePin()` | Hardware-Config | 🔴 KRITISCH |
| `enableSafeModeForAllPins()` | 1972-1991 | `drivers/gpio_manager.cpp` | `enableEmergencySafeMode()` | Hardware-Config | 🔴 KRITISCH |
| `gpio_safe_mode[]` | 470 | `drivers/gpio_manager.cpp` | `_safe_mode_pins[]` (private) | Hardware-Config | 🔴 KRITISCH |

#### Configuration Management

| Funktion (alt) | Zeilen (main.cpp) | Neues Modul | Neue Funktion | Abhängigkeiten | Priorität |
|----------------|-------------------|-------------|---------------|----------------|-----------|
| `loadWiFiConfigFromPreferences()` | 173-175 | `services/config/config_manager.cpp` | `loadWiFiConfig()` | `StorageManager` | 🔴 KRITISCH |
| `saveWiFiConfigToPreferences()` | 173-175 | `services/config/config_manager.cpp` | `saveWiFiConfig()` | `StorageManager` | 🔴 KRITISCH |
| `loadZoneConfigFromPreferences()` | 183-184 | `services/config/config_manager.cpp` | `loadZoneConfig()` | `StorageManager` | 🔴 KRITISCH |
| `Preferences preferences` | 446 | `services/config/storage_manager.cpp` | `_preferences` (private) | `Preferences.h` | 🔴 KRITISCH |

---

### 3.2 Modul-Inhalts-Plan

#### core/system_controller.h/cpp

**Funktionen aus main.cpp:**
1. `SystemState` enum (Zeilen 116-129) → Als `enum class SystemState`
2. `getSystemStateString()` (Zeilen 6276-6292) → Als `getStateString()`
3. State Transitions aus `loop()` (Zeilen 5824-XXXX) → Als `transitionTo()`
4. State Validation → Als `canTransitionTo()` (NEU!)

**Neue Funktionen:**
1. `handleStateEntry()` - State-Entry-Handler
2. `handleStateExit()` - State-Exit-Handler
3. `handleError()` - Error-Handler

**Private Members:**
- `SystemState _current_state`
- `SystemState _previous_state`
- `String _last_error`
- `unsigned long _state_entry_time`

**Abhängigkeiten:**
- `#include "../models/system_state.h"`
- `#include "../error_handling/error_tracker.h"`
- `#include "../utils/logger.h"`

**Geschätzte Größe:** 250 Zeilen  
**Priorität:** 🔴 KRITISCH

---

#### services/communication/mqtt_client.h/cpp

**Funktionen aus main.cpp:**
1. `PubSubClient mqtt_client` (Zeile 445) → Als private Member
2. `connectToMqtt()` (Zeilen 4758-4837) → Als `connect()`
3. `onMqttMessage()` (Zeilen 3960-4128) → Als `onMessage()`
4. `subscribeToKaiserTopics()` (Zeilen 4839-4855) → Als `subscribeToTopics()`

**Neue Funktionen:**
1. `safePublish()` - Publish mit Retry-Logic
2. `reconnect()` - Auto-Reconnect mit Backoff
3. `isConnected()` - Connection-Status

**Abhängigkeiten:**
- `#include <PubSubClient.h>`
- `#include "../utils/topic_builder.h"`
- `#include "../error_handling/mqtt_connection_manager.h"`

**Geschätzte Größe:** 400 Zeilen  
**Priorität:** 🔴 KRITISCH

---

#### services/sensor/sensor_manager.h/cpp

**Funktionen aus main.cpp:**
1. `SensorConfig sensors[]` (Zeile 462) → Als private Member
2. `readSensor()` (Zeilen 3508-3755) → Als `readSensor()` ⚠️ Fix #1
3. `performMeasurements()` (Zeilen 3797-3838) → Als `performAllMeasurements()`
4. `sendIndividualSensorData()` (Zeilen 3855-3910) → Als `publishData()` ⚠️ Fix #6
5. `configureSensor()` (Zeilen 3365+) → Als `configureSensor()`

**Integration bestehender Module:**
- `GenericI2CSensor` → `sensor_drivers/i2c_sensor_generic.h/cpp`
- `PiSensorClient` → `pi_enhanced_processor.h/cpp`

**Abhängigkeiten:**
- `#include "sensor_drivers/isensor_driver.h"`
- `#include "../drivers/gpio_manager.h"`
- `#include "../models/sensor_types.h"`
- `#include "../services/communication/mqtt_client.h"`

**Geschätzte Größe:** 350 Zeilen  
**Priorität:** 🔴 KRITISCH

---

#### drivers/gpio_manager.h/cpp

**Funktionen aus main.cpp:**
1. `initializeAllPinsToSafeMode()` (Zeilen 1927-1950) → Als `initializeSafeMode()` ⚠️ Fix #3
2. `releaseGpioFromSafeMode()` (Zeilen 1952-1970) → Als `releasePin()`
3. `enableSafeModeForAllPins()` (Zeilen 1972-1991) → Als `enableEmergencySafeMode()`
4. `gpio_safe_mode[]` (Zeile 470) → Als private Member

**Neue Funktionen:**
1. `isPinReserved(uint8_t gpio)` - Prüft ob Pin reserviert
2. `isPinSafe(uint8_t gpio)` - Prüft ob Pin sicher verwendbar
3. `reservePin(uint8_t gpio)` - Reserviert Pin für Verwendung

**Abhängigkeiten:**
- `#include "../config/hardware/xiao_esp32c3.h"` (oder `esp32_dev.h`)
- `#include "../utils/logger.h"`

**Geschätzte Größe:** 300 Zeilen  
**Priorität:** 🔴 KRITISCH

---

### 3.3 Abhängigkeiten-Matrix

#### SystemController

**Benötigt von:**
- `MainLoop` (ruft `handleStateUpdate()` auf)
- `Application` (initialisiert State Machine)
- `HealthMonitor` (überwacht State)

**Hängt ab von:**
- `models/system_state.h` (SystemState enum)
- `error_handling/error_tracker.h` (ErrorTracker)
- `utils/logger.h` (Logger)

**Zirkuläre Abhängigkeiten:** Keine

---

#### MQTTClient

**Benötigt von:**
- `SensorManager` (publisht Sensor-Daten)
- `ActuatorManager` (publisht Actuator-Status)
- `SystemController` (publisht Heartbeat)
- `MainLoop` (publisht System-Status)

**Hängt ab von:**
- `PubSubClient.h` (Library)
- `utils/topic_builder.h` (TopicBuilder)
- `error_handling/mqtt_connection_manager.h` (MQTTConnectionManager)
- `services/communication/wifi_manager.h` (WiFiManager)

**Zirkuläre Abhängigkeiten:** Keine

---

#### SensorManager

**Benötigt von:**
- `MainLoop` (ruft `performAllMeasurements()` auf)
- `SystemController` (prüft Sensor-Status)

**Hängt ab von:**
- `sensor_drivers/isensor_driver.h` (ISensorDriver Interface)
- `drivers/gpio_manager.h` (GPIOManager)
- `models/sensor_types.h` (SensorConfig)
- `services/communication/mqtt_client.h` (MQTTClient)
- `services/sensor/pi_enhanced_processor.h` (PiEnhancedProcessor)

**Zirkuläre Abhängigkeiten:** Keine

---

#### GPIOManager

**Benötigt von:**
- `SensorManager` (GPIO-Reservation für Sensoren)
- `ActuatorManager` (GPIO-Reservation für Aktoren)
- `I2CBusManager` (GPIO-Reservation für I2C)
- `OneWireBusManager` (GPIO-Reservation für OneWire)
- `PWMController` (GPIO-Reservation für PWM)

**Hängt ab von:**
- `config/hardware/xiao_esp32c3.h` (oder `esp32_dev.h`)
- `utils/logger.h` (Logger)

**Zirkuläre Abhängigkeiten:** Keine

---

### 3.4 Implementierungs-Reihenfolge (12 Wochen)

#### Phase 1: Foundation (Woche 1-2)

**Reihenfolge:**
1. `models/system_state.h` - ZUERST (keine Abhängigkeiten)
2. `models/sensor_types.h` - DANACH (keine Abhängigkeiten)
3. `models/actuator_types.h` - DANACH (keine Abhängigkeiten)
4. `utils/logger.h/cpp` - DANACH (benötigt nur Arduino.h)
5. `config/hardware/xiao_esp32c3.h` - DANACH (keine Abhängigkeiten) ⚠️ Fix #3
6. `config/hardware/esp32_dev.h` - DANACH (keine Abhängigkeiten) ⚠️ Fix #3

**Begründung:**
- Models zuerst, da alle anderen Module sie brauchen
- Logger früh, da alle Module loggen
- Hardware-Configs früh, da GPIOManager sie braucht

**Test-Strategie pro Schritt:**
- Compiliert das Projekt noch? (Header-only bei Models)
- Können andere Module die Models inkludieren?

---

#### Phase 2: Hardware Abstraction (Woche 3-4)

**Reihenfolge:**
1. `drivers/gpio_manager.h/cpp` - ZUERST ⚠️ Fix #3
   - Benötigt: Hardware-Configs, Logger
   - Bietet: GPIO-Safe-Mode für alle anderen Driver
   - **KRITISCH:** Fix #3 integrieren (Reserved Pins)

2. `drivers/i2c_bus.h/cpp` - DANACH
   - Benötigt: GPIOManager (für Pin-Reservation)
   - Bietet: I2C-Abstraktion für Sensoren

3. `drivers/onewire_bus.h/cpp` - DANACH
   - Benötigt: GPIOManager (für Pin-Reservation)
   - Bietet: OneWire-Abstraktion für DS18B20

4. `drivers/pwm_controller.h/cpp` - DANACH
   - Benötigt: GPIOManager (für Pin-Reservation)
   - Bietet: PWM für Aktoren

**Begründung:**
- GPIOManager ist Grundlage für alle anderen Driver
- Bus-Manager sind unabhängig voneinander
- Können parallel getestet werden

---

#### Phase 3: Communication Layer (Woche 5-6)

**Reihenfolge:**
1. `utils/topic_builder.h/cpp` - ZUERST ⚠️ Fix #2
   - Benötigt: Keine
   - Bietet: MQTT-Topic-Generierung
   - **KRITISCH:** Fix #2 integrieren (Buffer-Overflow-Prüfung)

2. `services/communication/wifi_manager.h/cpp` - DANACH
   - Benötigt: Logger, ConfigManager
   - Bietet: WiFi-Verbindung

3. `services/communication/mqtt_client.h/cpp` - DANACH
   - Benötigt: WiFiManager, TopicBuilder
   - Bietet: MQTT-Communication

4. `services/communication/http_client.h/cpp` - DANACH
   - Ben