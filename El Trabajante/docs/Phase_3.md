# Phase 3: Hardware Abstraction Layer - Implementierungsplan
**Version:** 1.0  
**Datum:** 2025-01-27  
**Status:** PLANUNG  
**Abhängig von:** Phase 0 (GPIO Manager ✅), Phase 1 (Logger ✅), Phase 2 (WiFi/MQTT ✅)  
**Wird benötigt von:** Phase 4 (Sensor System), Phase 5 (Actuator System)

---

## 📋 Inhaltsverzeichnis
1. [Übersicht](#übersicht)
2. [Abgleich Roadmap.md ↔ ZZZ.md](#abgleich-roadmapmd--zzzmd)
3. [Codebase-Analyse](#codebase-analyse)
4. [Implementierungsplan](#implementierungsplan)
5. [Module die nicht ins Projekt gehören](#module-die-nicht-ins-projekt-gehören)
6. [Pi-Enhanced Mode Integration](#pi-enhanced-mode-integration)
7. [Erfolgs-Kriterien](#erfolgs-kriterien)

---

## 📊 Übersicht

### Zielsetzung Phase 3
Implementierung der Hardware-Abstraktionsschicht für I2C, OneWire und PWM. Diese Module bilden die Grundlage für Phase 4 (Sensor System) und Phase 5 (Actuator System).

**Kern-Prinzip:** Server-Centric Architektur (Pi-Enhanced Mode)
- ESP32 sendet **Rohdaten** (Raw ADC-Werte) an God-Kaiser Server
- Server verarbeitet mit Python-Libraries (90% der Anwendungen)
- Hardware-Abstraktion dient primär der **Rohdaten-Auslesung**, nicht der lokalen Verarbeitung

### Phase 3 Module (3 kritische Module, ~500 Zeilen)

| Modul | Zeilen | Status | Priorität | Abhängigkeiten |
|-------|--------|--------|-----------|----------------|
| **I2CBusManager** | ~200 | ⚠️ Skeleton | 🔴 KRITISCH | GPIOManager, Logger |
| **OneWireBusManager** | ~150 | ⚠️ Skeleton | 🔴 KRITISCH | GPIOManager, Logger |
| **PWMController** | ~150 | ⚠️ Skeleton | 🔴 KRITISCH | GPIOManager, Logger |

**Gesamt:** ~500 Zeilen Production Code

---

## 🔍 Abgleich Roadmap.md ↔ ZZZ.md

### Roadmap.md Phase 3 (Zeilen 729-768)
**Fokus:** Hardware Abstraction Layer
- I2C Bus Manager
- OneWire Bus Manager  
- PWM Controller
- **Status:** PENDING (0%)

### ZZZ.md Phase 3 (Zeilen 2229-2235)
**Hinweis:** ZZZ.md Phase 3 = Communication Layer (MQTT, HTTP, WiFi)
- **Roadmap Phase 2** entspricht **ZZZ.md Phase 3** ✅ (bereits implementiert)
- **Roadmap Phase 3** entspricht **ZZZ.md Hardware Abstraction** (Zeilen 465-469)

### ZZZ.md Hardware Abstraction Requirements (Zeilen 465-469)

| Modul | Verantwortung | Input | Output | Abhängigkeiten | Größe | Priorität |
|-------|---------------|-------|--------|----------------|-------|-----------|
| **GPIOManager** | GPIO Safe Mode | Pin Requests | Pin Assignments | Hardware Config | 300 Z | ✅ COMPLETE |
| **I2CBusManager** | I2C Bus Control | Sensor Requests | I2C Transactions | GPIOManager | 200 Z | 🔴 KRITISCH |
| **OneWireBusManager** | OneWire Bus Control | DS18B20 Requests | OneWire Transactions | GPIOManager | 150 Z | 🔴 KRITISCH |
| **PWMController** | PWM Generation | Actuator Commands | PWM Signals | GPIOManager | 150 Z | 🔴 KRITISCH |

**✅ Konsistenz:** Roadmap Phase 3 deckt sich mit ZZZ.md Hardware Abstraction Requirements

### ZZZ.md Pi-Enhanced Mode Requirements (Zeilen 1605-1645)

**Kritische Anforderung:** Hardware-Abstraktion muss **Rohdaten-Auslesung** unterstützen:

```
Flow: Sensor-Reading → Pi-Processing → MQTT Publish (Pi-Enhanced Mode - Standard)

1. SensorManager.performAllMeasurements() - Startet alle Messungen
2. SensorManager.readRawAnalog(gpio) - ✅ Liest ADC-Wert (0-4095)
3. PiEnhancedProcessor.sendRawData() - ✅ Sendet Raw an God-Kaiser (HTTP)
4. God-Kaiser verarbeitet mit Python-Libraries
5. PiEnhancedProcessor.receiveProcessedData() - ✅ Empfängt Processed-Wert
6. MQTTClient.safePublish(topic, payload) - Publiziert Processed-Wert
```

**Implikation für Phase 3:**
- I2C/OneWire Bus Manager müssen **Raw-Readings** ermöglichen
- Keine lokale Sensor-Verarbeitung erforderlich (Server-Centric)
- PWM Controller für Aktoren (Phase 5)

---

## 🔬 Codebase-Analyse

### Aktuelle Struktur (El Trabajante, ohne SensorNetwork_Esp32_Dev)

#### ✅ Bereits implementiert (Phase 0-2):

**Phase 0: GPIO Foundation**
- ✅ `src/drivers/gpio_manager.h/cpp` (426 Zeilen) - Production-Ready
- ✅ `src/config/hardware/xiao_esp32c3.h` (94 Zeilen) - Hardware Config
- ✅ `src/config/hardware/esp32_dev.h` (110 Zeilen) - Hardware Config

**Phase 1: Core Infrastructure**
- ✅ `src/utils/logger.h/cpp` (~250 Zeilen) - Logging System
- ✅ `src/services/config/storage_manager.h/cpp` (~200 Zeilen) - NVS Abstraction
- ✅ `src/services/config/config_manager.h/cpp` (~250 Zeilen) - Config Orchestration
- ✅ `src/utils/topic_builder.h/cpp` (~114 Zeilen) - MQTT Topics
- ✅ `src/error_handling/error_tracker.h/cpp` (~200 Zeilen) - Error Tracking

**Phase 2: Communication Layer**
- ✅ `src/services/communication/wifi_manager.h/cpp` (~222 Zeilen) - WiFi Management
- ✅ `src/services/communication/mqtt_client.h/cpp` (~622 Zeilen) - MQTT Client
- ✅ `src/main.cpp` - Integration (WiFi + MQTT)

#### ⚠️ Phase 3 Module (Skeleton vorhanden, Implementierung erforderlich):

**Hardware Abstraction Layer:**
- ⚠️ `src/drivers/i2c_bus.h/cpp` - **LEER** (Skeleton)
- ⚠️ `src/drivers/onewire_bus.h/cpp` - **LEER** (Skeleton)
- ⚠️ `src/drivers/pwm_controller.h/cpp` - **LEER** (Skeleton)

**Hardware Config (bereits vorhanden):**
- ✅ `src/config/hardware/xiao_esp32c3.h` - I2C: GPIO 4/5, OneWire: GPIO 6, PWM: 6 Channels
- ✅ `src/config/hardware/esp32_dev.h` - I2C: GPIO 21/22, OneWire: GPIO 4, PWM: 16 Channels

#### 📁 Abhängige Module (Phase 4+):

**Sensor System (Phase 4):**
- ⚠️ `src/services/sensor/sensor_manager.h/cpp` - Skeleton vorhanden
- ⚠️ `src/services/sensor/pi_enhanced_processor.h/cpp` - Skeleton vorhanden
- ⚠️ `src/services/sensor/sensor_drivers/` - Skeleton vorhanden

**Actuator System (Phase 5):**
- ⚠️ `src/services/actuator/actuator_manager.h/cpp` - Skeleton vorhanden
- ⚠️ `src/services/actuator/actuator_drivers/` - Skeleton vorhanden

### Codebase-Statistiken

**Gesamt-Struktur:**
- **38 .cpp Dateien** (inkl. Skeletons)
- **49 .h Dateien** (inkl. Skeletons)
- **Phase 0-2:** ~2.223 Zeilen Production Code ✅
- **Phase 3:** 0 Zeilen (Skeletons leer)

**Memory Usage (aktuell):**
- Phase 0-2: ~25 KB Heap (7.8% von 320 KB ESP32)
- Phase 3 (geplant): +~2 KB Heap (Gesamt: ~27 KB, 8.4%)

---

## 📝 Implementierungsplan

### Modul 1: I2CBusManager (~200 Zeilen)

**Dateien:**
- `src/drivers/i2c_bus.h` (~80 Zeilen)
- `src/drivers/i2c_bus.cpp` (~120 Zeilen)

**Zweck:**
- I2C Bus Initialisierung und Management
- Multi-Device Support (SHT31, BMP280, etc.)
- Board-spezifische Pin-Konfiguration (XIAO vs WROOM)
- Raw-Readings für Pi-Enhanced Mode

**API-Spezifikation:**

```cpp
class I2CBusManager {
public:
    static I2CBusManager& getInstance();  // Singleton Pattern
    
    // Lifecycle
    bool begin();  // Initialisiert I2C Bus mit Hardware Config
    void end();   // Deinitialisiert I2C Bus
    
    // Bus Control
    bool scanBus(uint8_t addresses[], uint8_t max_addresses, uint8_t& found_count);
    bool isDevicePresent(uint8_t address);
    
    // Raw Data Reading (für Pi-Enhanced Mode)
    bool readRaw(uint8_t device_address, uint8_t register_address, uint8_t* buffer, size_t length);
    bool writeRaw(uint8_t device_address, uint8_t register_address, const uint8_t* data, size_t length);
    
    // Status
    bool isInitialized() const;
    String getBusStatus() const;  // Für Debugging
    
private:
    bool initialized_;
    uint8_t sda_pin_;
    uint8_t scl_pin_;
    uint32_t frequency_;
    
    // Hardware Config Integration
    void loadHardwareConfig();  // Lädt Pins aus Hardware Config
};
```

**Hardware-Integration:**

**XIAO ESP32-C3:**
```cpp
// Aus xiao_esp32c3.h
constexpr uint8_t I2C_SDA_PIN = 4;
constexpr uint8_t I2C_SCL_PIN = 5;
constexpr uint32_t I2C_FREQUENCY = 100000;  // 100kHz
```

**ESP32-WROOM-32:**
```cpp
// Aus esp32_dev.h
constexpr uint8_t I2C_SDA_PIN = 21;
constexpr uint8_t I2C_SCL_PIN = 22;
constexpr uint32_t I2C_FREQUENCY = 100000;  // 100kHz
```

**GPIO Manager Integration:**
- I2C Pins müssen via `gpioManager.requestPin()` reserviert werden
- Auto-Reservation bei `begin()` (wie in Phase 0 implementiert)

**Logger Integration:**
```cpp
LOG_DEBUG("I2C Bus initialized on SDA=" + String(sda_pin_) + ", SCL=" + String(scl_pin_));
LOG_ERROR("I2C device not found at address 0x" + String(device_address, HEX));
```

**Error Handling:**
- I2C Fehler → `errorTracker.trackError(ERROR_I2C_*, ...)`
- Device nicht gefunden → Log Warning, return false

**Dependencies:**
- `Wire.h` (Arduino I2C Library)
- `drivers/gpio_manager.h` (Pin Reservation)
- `utils/logger.h` (Logging)
- `error_handling/error_tracker.h` (Error Tracking)
- `config/hardware/xiao_esp32c3.h` oder `esp32_dev.h` (Hardware Config)

---

### Modul 2: OneWireBusManager (~150 Zeilen)

**Dateien:**
- `src/drivers/onewire_bus.h` (~60 Zeilen)
- `src/drivers/onewire_bus.cpp` (~90 Zeilen)

**Zweck:**
- OneWire Bus Initialisierung (DS18B20 Temperatursensoren)
- Device Discovery (ROM-Codes)
- Raw-Temperature-Readings für Pi-Enhanced Mode

**API-Spezifikation:**

```cpp
class OneWireBusManager {
public:
    static OneWireBusManager& getInstance();  // Singleton Pattern
    
    // Lifecycle
    bool begin();  // Initialisiert OneWire Bus
    void end();    // Deinitialisiert OneWire Bus
    
    // Device Discovery
    bool scanDevices(uint8_t rom_codes[][8], uint8_t max_devices, uint8_t& found_count);
    bool isDevicePresent(const uint8_t rom_code[8]);
    
    // Raw Temperature Reading (für Pi-Enhanced Mode)
    bool readRawTemperature(const uint8_t rom_code[8], int16_t& raw_value);
    // raw_value: 12-bit signed integer (-55°C bis +125°C, 0.0625°C Auflösung)
    
    // Status
    bool isInitialized() const;
    String getBusStatus() const;
    
private:
    bool initialized_;
    uint8_t onewire_pin_;
    
    // Hardware Config Integration
    void loadHardwareConfig();  // Lädt Pin aus Hardware Config
};
```

**Hardware-Integration:**

**XIAO ESP32-C3:**
```cpp
// Aus xiao_esp32c3.h
constexpr uint8_t DEFAULT_ONEWIRE_PIN = 6;
```

**ESP32-WROOM-32:**
```cpp
// Aus esp32_dev.h
constexpr uint8_t DEFAULT_ONEWIRE_PIN = 4;
```

**GPIO Manager Integration:**
- OneWire Pin muss via `gpioManager.requestPin()` reserviert werden
- Auto-Reservation bei `begin()`

**Logger Integration:**
```cpp
LOG_DEBUG("OneWire Bus initialized on GPIO " + String(onewire_pin_));
LOG_INFO("Found " + String(found_count) + " OneWire devices");
```

**Error Handling:**
- OneWire Fehler → `errorTracker.trackError(ERROR_ONEWIRE_*, ...)`
- Device nicht gefunden → Log Warning, return false

**Dependencies:**
- `OneWire.h` (DallasTemperature Library - OneWire Teil)
- `drivers/gpio_manager.h` (Pin Reservation)
- `utils/logger.h` (Logging)
- `error_handling/error_tracker.h` (Error Tracking)
- `config/hardware/xiao_esp32c3.h` oder `esp32_dev.h` (Hardware Config)

**Hinweis:** 
- **KEINE** lokale Temperatur-Konvertierung (Server-Centric!)
- Raw-Werte werden an Pi-Enhanced Processor weitergegeben
- Server verarbeitet mit Python-Libraries

---

### Modul 3: PWMController (~150 Zeilen)

**Dateien:**
- `src/drivers/pwm_controller.h` (~60 Zeilen)
- `src/drivers/pwm_controller.cpp` (~90 Zeilen)

**Zweck:**
- PWM Signal Generation für Aktoren (Pumpen, Dimmer, Servos)
- Channel Management (6 Channels XIAO, 16 Channels WROOM)
- Frequency und Resolution Control

**API-Spezifikation:**

```cpp
class PWMController {
public:
    static PWMController& getInstance();  // Singleton Pattern
    
    // Lifecycle
    bool begin();  // Initialisiert PWM System
    void end();    // Deinitialisiert PWM System
    
    // Channel Management
    bool attachChannel(uint8_t gpio, uint8_t& channel);  // Reserviert Channel für GPIO
    bool detachChannel(uint8_t channel);  // Gibt Channel frei
    
    // PWM Control
    bool setFrequency(uint8_t channel, uint32_t frequency);  // 1Hz - 40MHz
    bool setResolution(uint8_t channel, uint8_t resolution_bits);  // 1-16 bits
    bool write(uint8_t channel, uint32_t duty_cycle);  // 0 - (2^resolution - 1)
    bool writePercent(uint8_t channel, float percent);  // 0.0 - 100.0%
    
    // Status
    bool isChannelAttached(uint8_t channel) const;
    uint8_t getChannelForGPIO(uint8_t gpio) const;
    String getChannelStatus() const;
    
private:
    bool initialized_;
    uint8_t max_channels_;
    uint8_t default_frequency_;
    uint8_t default_resolution_;
    
    struct ChannelInfo {
        bool attached;
        uint8_t gpio;
        uint32_t frequency;
        uint8_t resolution;
    };
    ChannelInfo channels_[16];  // Max 16 Channels (WROOM)
    
    // Hardware Config Integration
    void loadHardwareConfig();  // Lädt Config aus Hardware Config
};
```

**Hardware-Integration:**

**XIAO ESP32-C3:**
```cpp
// Aus xiao_esp32c3.h
constexpr uint8_t PWM_CHANNELS = 6;
constexpr uint32_t PWM_FREQUENCY = 1000;  // 1kHz
constexpr uint8_t PWM_RESOLUTION = 12;    // 12-bit (0-4095)
```

**ESP32-WROOM-32:**
```cpp
// Aus esp32_dev.h
constexpr uint8_t PWM_CHANNELS = 16;
constexpr uint32_t PWM_FREQUENCY = 1000;  // 1kHz
constexpr uint8_t PWM_RESOLUTION = 12;    // 12-bit (0-4095)
```

**GPIO Manager Integration:**
- PWM GPIOs müssen via `gpioManager.requestPin()` reserviert werden
- `attachChannel()` reserviert automatisch GPIO

**Logger Integration:**
```cpp
LOG_DEBUG("PWM Channel " + String(channel) + " attached to GPIO " + String(gpio));
LOG_INFO("PWM Controller initialized with " + String(max_channels_) + " channels");
```

**Error Handling:**
- Channel-Limit erreicht → `errorTracker.trackError(ERROR_PWM_CHANNEL_LIMIT, ...)`
- Ungültiger GPIO → Log Error, return false

**Dependencies:**
- `driver/ledc.h` (ESP32 LEDC PWM Library)
- `drivers/gpio_manager.h` (Pin Reservation)
- `utils/logger.h` (Logging)
- `error_handling/error_tracker.h` (Error Tracking)
- `config/hardware/xiao_esp32c3.h` oder `esp32_dev.h` (Hardware Config)

**Hinweis:**
- PWM wird für Phase 5 (Actuator System) benötigt
- Aktoren nutzen PWM für Geschwindigkeits-/Intensitäts-Kontrolle

---

## 🔗 Pi-Enhanced Mode Integration

### Server-Centric Architektur (Standard - 90%)

**Hardware-Abstraktion unterstützt Rohdaten-Auslesung:**

```
┌─────────────────┐
│  Sensor (I2C)  │
└────────┬────────┘
         │ Raw I2C Bytes
         ▼
┌─────────────────┐
│ I2CBusManager   │──readRaw()──► Raw Data Buffer
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ SensorManager   │──performMeasurement()──► Raw ADC/Value
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│PiEnhancedProc.  │──sendRawData()──► HTTP POST → God-Kaiser
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  God-Kaiser     │──Python Library──► Processed Value
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│PiEnhancedProc.  │──receiveProcessedData()──► Processed Value
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   MQTTClient    │──publish()──► MQTT Topic
└─────────────────┘
```

**Implikation für Phase 3:**
- ✅ I2CBusManager: `readRaw()` liefert unverarbeitete Bytes
- ✅ OneWireBusManager: `readRawTemperature()` liefert 12-bit Integer
- ✅ **KEINE** lokale Sensor-Verarbeitung (keine Kalibrierung, keine Konvertierung)
- ✅ Raw-Daten werden direkt an PiEnhancedProcessor weitergegeben

### Beispiel: DS18B20 Temperatursensor

**OneWireBusManager (Phase 3):**
```cpp
int16_t raw_temp;
if (oneWireBusManager.readRawTemperature(rom_code, raw_temp)) {
    // raw_temp: -550 bis +1250 (0.0625°C Auflösung)
    // Wird an PiEnhancedProcessor weitergegeben
}
```

**PiEnhancedProcessor (Phase 4):**
```cpp
// Sendet Raw-Wert an Server
piEnhancedProcessor.sendRawData(gpio, "DS18B20", raw_temp);
```

**God-Kaiser Server (Python):**
```python
def process_ds18b20(raw_value: int, metadata: dict) -> dict:
    # Konvertierung: Raw → °C
    temperature = raw_value * 0.0625
    return {
        "processed_value": temperature,
        "unit": "°C",
        "quality": "good" if -55 <= temperature <= 125 else "poor"
    }
```

---

## 🚫 Module die nicht ins Projekt gehören

### Identifizierte Module (Codebase-Analyse):

#### 1. **SensorNetwork_Esp32_Dev/** (Explizit ausgeschlossen)
- **Status:** ✅ Bereits ausgeschlossen (User-Anforderung)
- **Grund:** Separate Entwicklungsumgebung, nicht Teil von El Trabajante

#### 2. **Potentiell überflüssige Module (zu prüfen):**

**⚠️ Zu prüfen - möglicherweise nicht benötigt:**

**a) `src/services/communication/webserver.h/cpp`**
- **Status:** Skeleton vorhanden
- **Roadmap:** Phase 2 OPTIONAL (Zeile 58)
- **ZZZ.md:** Phase 3 OPTIONAL (Config-Portal)
- **Empfehlung:** **BEHALTEN** (für WiFi-Setup Portal, aber niedrige Priorität)

**b) `src/services/communication/network_discovery.h/cpp`**
- **Status:** Skeleton vorhanden
- **Roadmap:** Phase 2 OPTIONAL (Zeile 59)
- **ZZZ.md:** Phase 3 OPTIONAL (mDNS Discovery)
- **Empfehlung:** **BEHALTEN** (Nice-to-have, Server-IP via NVS Config)

**c) `src/services/config/library_manager.h/cpp`**
- **Status:** Skeleton vorhanden
- **Roadmap:** Phase 8 OPTIONAL (Zeile 56)
- **ZZZ.md:** OPTIONAL (10% Power-User, OTA Library Mode)
- **Empfehlung:** **BEHALTEN** (für OTA Library Mode, aber OPTIONAL)

**d) `src/error_handling/pi_circuit_breaker.h/cpp`**
- **Status:** Skeleton vorhanden
- **Zweck:** Circuit Breaker für Pi-Server Failover
- **Empfehlung:** **BEHALTEN** (wichtig für Pi-Enhanced Mode Robustheit)

**e) `src/error_handling/mqtt_connection_manager.h/cpp`**
- **Status:** Skeleton vorhanden
- **Zweck:** MQTT Connection Recovery (Backoff Logic)
- **Empfehlung:** **BEHALTEN** (wichtig für Phase 2+ Robustheit)

**f) `src/error_handling/health_monitor.h/cpp`**
- **Status:** Skeleton vorhanden
- **Zweck:** System Health Monitoring
- **Empfehlung:** **BEHALTEN** (wichtig für Phase 7)

**g) `src/utils/data_buffer.h/cpp`**
- **Status:** Skeleton vorhanden
- **Zweck:** Offline Data Buffering
- **Empfehlung:** **BEHALTEN** (wichtig für Sensor-Daten bei Netzwerkausfall)

**h) `src/utils/time_manager.h/cpp`**
- **Status:** Skeleton vorhanden
- **Zweck:** RTC & NTP Time Management
- **Empfehlung:** **BEHALTEN** (wichtig für Timestamp-Generierung)

**i) `src/utils/string_helpers.h/cpp`**
- **Status:** Skeleton vorhanden
- **Zweck:** String Utilities
- **Empfehlung:** **BEHALTEN** (Hilfsfunktionen, geringer Overhead)

#### ✅ Alle Module gehören ins Projekt

**Fazit:** Alle identifizierten Module sind Teil der geplanten Architektur. Keine Module müssen entfernt werden.

**Optional-Module (können später implementiert werden):**
- WebServer (WiFi-Setup Portal)
- NetworkDiscovery (mDNS)
- LibraryManager (OTA Library Mode)

---

## ✅ Erfolgs-Kriterien

### Funktionale Anforderungen

#### I2CBusManager:
- ✅ I2C Bus initialisiert sich korrekt (XIAO: GPIO 4/5, WROOM: GPIO 21/22)
- ✅ `scanBus()` findet alle I2C-Devices
- ✅ `readRaw()` liest unverarbeitete Bytes von I2C-Devices
- ✅ `writeRaw()` schreibt Bytes zu I2C-Devices
- ✅ GPIO Pins werden automatisch via GPIOManager reserviert
- ✅ Fehler werden via ErrorTracker geloggt

#### OneWireBusManager:
- ✅ OneWire Bus initialisiert sich korrekt (XIAO: GPIO 6, WROOM: GPIO 4)
- ✅ `scanDevices()` findet alle OneWire-Devices (ROM-Codes)
- ✅ `readRawTemperature()` liest 12-bit Raw-Temperatur-Wert
- ✅ GPIO Pin wird automatisch via GPIOManager reserviert
- ✅ Fehler werden via ErrorTracker geloggt

#### PWMController:
- ✅ PWM System initialisiert sich korrekt (XIAO: 6 Channels, WROOM: 16 Channels)
- ✅ `attachChannel()` reserviert Channel für GPIO
- ✅ `write()` und `writePercent()` setzen PWM-Duty-Cycle korrekt
- ✅ `setFrequency()` und `setResolution()` funktionieren
- ✅ GPIO Pins werden automatisch via GPIOManager reserviert
- ✅ Fehler werden via ErrorTracker geloggt

### Nicht-Funktionale Anforderungen

#### Code-Qualität:
- ✅ Keine Linter-Fehler
- ✅ Konsistente API (Singleton Pattern wie Phase 1-2)
- ✅ Logger-Integration (LOG_* Macros)
- ✅ ErrorTracker-Integration (ERROR_* Codes)
- ✅ Hardware Config Integration (xiao_esp32c3.h / esp32_dev.h)

#### Memory Usage:
- ✅ Heap-Usage < 2 KB zusätzlich (Gesamt: ~27 KB, 8.4% von 320 KB)
- ✅ Keine Memory-Leaks (10.000 Alloc/Release Zyklen)

#### Performance:
- ✅ I2C Read: < 10ms pro Device
- ✅ OneWire Scan: < 500ms für 10 Devices
- ✅ PWM Write: < 1ms pro Channel

#### Integration:
- ✅ GPIOManager Integration (Pin Reservation)
- ✅ Logger Integration (strukturiertes Logging)
- ✅ ErrorTracker Integration (Fehler-Logging)
- ✅ Hardware Config Integration (Board-spezifische Pins)

### Tests

#### Unit-Tests:
- ✅ I2CBusManager: Initialisierung, Scan, Read/Write
- ✅ OneWireBusManager: Initialisierung, Scan, Read Temperature
- ✅ PWMController: Initialisierung, Channel Management, Write

#### Integration-Tests:
- ✅ GPIOManager Integration (Pin Reservation)
- ✅ Logger Integration (Log-Output)
- ✅ ErrorTracker Integration (Error-Logging)

#### Hardware-Tests:
- ✅ I2C: SHT31 Sensor lesen (Raw-Bytes)
- ✅ OneWire: DS18B20 Sensor lesen (Raw-Temperature)
- ✅ PWM: LED Dimmen (0-100%)

---

## 📅 Implementierungs-Reihenfolge

### Tag 1-2: I2CBusManager
1. `i2c_bus.h` implementieren (API-Definition)
2. `i2c_bus.cpp` implementieren (Singleton, begin(), scanBus(), readRaw(), writeRaw())
3. Hardware Config Integration (loadHardwareConfig())
4. GPIOManager Integration (Pin Reservation)
5. Logger Integration (LOG_* Macros)
6. ErrorTracker Integration (ERROR_I2C_* Codes)
7. Unit-Tests schreiben

### Tag 3-4: OneWireBusManager
1. `onewire_bus.h` implementieren (API-Definition)
2. `onewire_bus.cpp` implementieren (Singleton, begin(), scanDevices(), readRawTemperature())
3. Hardware Config Integration (loadHardwareConfig())
4. GPIOManager Integration (Pin Reservation)
5. Logger Integration (LOG_* Macros)
6. ErrorTracker Integration (ERROR_ONEWIRE_* Codes)
7. Unit-Tests schreiben

### Tag 5-6: PWMController
1. `pwm_controller.h` implementieren (API-Definition)
2. `pwm_controller.cpp` implementieren (Singleton, begin(), attachChannel(), write(), etc.)
3. Hardware Config Integration (loadHardwareConfig())
4. GPIOManager Integration (Pin Reservation)
5. Logger Integration (LOG_* Macros)
6. ErrorTracker Integration (ERROR_PWM_* Codes)
7. Unit-Tests schreiben

### Tag 7: Integration & Tests
1. Alle Module zusammen testen
2. Integration mit GPIOManager validieren
3. Memory-Leak-Tests (10.000 Zyklen)
4. Performance-Tests (Timing-Messungen)
5. Hardware-Tests (echte Sensoren/Aktoren)
6. Code-Review durchführen

---

## 📚 Referenzen

### Dokumentation:
- **Roadmap.md:** Zeilen 729-768 (Phase 3 Übersicht)
- **ZZZ.md:** Zeilen 465-469 (Hardware Abstraction Requirements)
- **ZZZ.md:** Zeilen 1605-1645 (Pi-Enhanced Mode Flow)
- **ZZZ.md:** Zeilen 1883-1950 (Hardware Config Spezifikation)

### Code-Referenzen:
- **Phase 0:** `src/drivers/gpio_manager.h/cpp` (Pin Reservation Pattern)
- **Phase 1:** `src/utils/logger.h/cpp` (Logging Pattern)
- **Phase 1:** `src/error_handling/error_tracker.h/cpp` (Error Tracking Pattern)
- **Hardware Config:** `src/config/hardware/xiao_esp32c3.h`, `esp32_dev.h`

### Arduino Libraries:
- **I2C:** `Wire.h` (ESP32 Core)
- **OneWire:** `OneWire.h` (DallasTemperature Library)
- **PWM:** `driver/ledc.h` (ESP32 LEDC)

---

## 🎯 Zusammenfassung

**Phase 3: Hardware Abstraction Layer** implementiert die Grundlage für Phase 4 (Sensor System) und Phase 5 (Actuator System).

**Kern-Module (3 Module, ~500 Zeilen):**
1. **I2CBusManager** (~200 Zeilen) - I2C Bus Control
2. **OneWireBusManager** (~150 Zeilen) - OneWire Bus Control
3. **PWMController** (~150 Zeilen) - PWM Signal Generation

**Architektur-Prinzip:**
- **Server-Centric (Pi-Enhanced Mode):** Hardware-Abstraktion liefert **Rohdaten**, keine lokale Verarbeitung
- **GPIO Manager Integration:** Automatische Pin-Reservation
- **Logger Integration:** Strukturiertes Logging
- **ErrorTracker Integration:** Fehler-Logging

**Erfolgs-Kriterien:**
- ✅ Alle 3 Module funktionieren (I2C, OneWire, PWM)
- ✅ GPIO-Konflikte werden verhindert
- ✅ Raw-Daten können ausgelesen werden (für Pi-Enhanced Mode)
- ✅ Keine Linter-Fehler
- ✅ Memory Usage < 2 KB zusätzlich

**Nächste Phase:**
- **Phase 4:** Sensor System (nutzt I2CBusManager + OneWireBusManager)

---

**Dokument erstellt:** 2025-01-27  
**Version:** 1.0  
**Status:** PLANUNG  
**Nächste Überprüfung:** Nach Phase 3 Implementierung

