# Phase 4: Sensor System - Implementierungsplan

**Version:** 1.1  
**Datum:** 2025-01-28  
**Status:** 📋 PLANUNG (✅ Vollständig überarbeitet, konsistent mit ZZZ.md & Roadmap.md)  
**Abhängig von:** Phase 0 (GPIO Manager ✅), Phase 1 (Logger, ConfigManager ✅), Phase 2 (MQTTClient, WiFiManager ✅), Phase 3 (I2CBusManager, OneWireBusManager ✅)  
**Wird benötigt von:** Phase 5 (Actuator System), Phase 8 (Integration Tests)

---

## 📊 Executive Summary

Phase 4 implementiert das **Sensor System** für das El Trabajante ESP32-Firmware-Projekt. Basierend auf der **Server-Centric Architektur** (Pi-Enhanced Mode) werden Sensoren über Rohdaten-Reading und Server-seitige Verarbeitung realisiert.

### Kernziele:
- ✅ **SensorManager**: Vollständige Implementierung für Rohdaten-Reading
- ✅ **PiEnhancedProcessor**: HTTP-Kommunikation mit God-Kaiser Server
- ✅ **Sensor-Konfiguration**: Dynamische Sensor-Registrierung via MQTT
- ✅ **MQTT-Publishing**: Sensor-Daten automatisch alle 30s publizieren
- ✅ **I2C/OneWire Integration**: Nutzung der Phase 3 Bus-Manager

### Architektur-Prinzip:
**Server-Centric (Pi-Enhanced Mode)** - ESP sendet Rohdaten, Server verarbeitet:
```
ESP32 → analogRead/digitalRead → Raw Value → HTTP/MQTT → God-Kaiser
God-Kaiser → Python Library → Processed Value → MQTT → ESP32 (optional)
```

---

## 🎯 Codebase-Analyse: Bestehende Implementierungen

### ✅ Phase 0-3: Bereits implementiert

#### Phase 0: GPIO Safe Mode ✅
- **GPIOManager** (`src/drivers/gpio_manager.h/cpp`) - 426 Zeilen
- Pin-Reservation, Conflict-Detection, Safe-Mode
- Hardware-Configs: XIAO ESP32-C3, ESP32-WROOM-32

#### Phase 1: Core Infrastructure ✅
- **Logger** (`src/utils/logger.h/cpp`) - 250 Zeilen
- **StorageManager** (`src/services/config/storage_manager.h/cpp`) - 200 Zeilen
- **ConfigManager** (`src/services/config/config_manager.h/cpp`) - 250 Zeilen
- **TopicBuilder** (`src/utils/topic_builder.h/cpp`) - 114 Zeilen (8/8 Phase-1-Patterns)
- **ErrorTracker** (`src/error_handling/error_tracker.h/cpp`) - 200 Zeilen

#### Phase 2: Communication Layer ✅
- **WiFiManager** (`src/services/communication/wifi_manager.h/cpp`) - 222 Zeilen
- **MQTTClient** (`src/services/communication/mqtt_client.h/cpp`) - 622 Zeilen
  - Offline-Buffer (100 Messages)
  - Heartbeat-System (60s)
  - Exponential Backoff Reconnection
- **HTTPClient** (`src/services/communication/http_client.h/cpp`) - ⚠️ **SKELETON** (muss implementiert werden)

#### Phase 3: Hardware Abstraction ✅
- **I2CBusManager** (`src/drivers/i2c_bus.h/cpp`) - 200 Zeilen
  - `begin()`, `end()`, `scanBus()`, `readRaw()`, `writeRaw()`
- **OneWireBusManager** (`src/drivers/onewire_bus.h/cpp`) - 150 Zeilen
  - `begin()`, `end()`, `scanDevices()`, `readRawTemperature()`
- **PWMController** (`src/drivers/pwm_controller.h/cpp`) - 150 Zeilen

### ⚠️ Phase 4: Vorhandene Skelette

#### SensorManager (`src/services/sensor/sensor_manager.h/cpp`)
**Status:** Skeleton vorhanden (90 Zeilen Header)
**Bestehende API:**
```cpp
class SensorManager {
    static SensorManager& getInstance();
    bool begin();
    void end();
    bool performI2CMeasurement(uint8_t device_address, uint8_t reg, uint8_t* buffer, size_t len);
    bool performOneWireMeasurement(const uint8_t rom[8], int16_t& raw_value);
    bool isInitialized() const;
};
```
**Zu implementieren:**
- Sensor-Registry (SensorConfig Array)
- GPIO-basierte Sensor-Verwaltung
- `configureSensor()`, `removeSensor()`, `getSensorConfig()`
- `performAllMeasurements()` - Liest alle Sensoren und publiziert via MQTT
- Integration mit PiEnhancedProcessor

#### PiEnhancedProcessor (`src/services/sensor/pi_enhanced_processor.h/cpp`)
**Status:** ⚠️ **LEER** (muss vollständig implementiert werden)
**Zu implementieren:**
- HTTP-Kommunikation mit God-Kaiser Server (Port 8000)
- `sendRawData()` - POST Request mit RawSensorData
- `receiveProcessedData()` - Response-Parsing
- Circuit-Breaker-Pattern (bei Server-Ausfall)
- Integration mit HTTPClient

#### SensorFactory (`src/services/sensor/sensor_factory.h/cpp`)
**Status:** Skeleton vorhanden
**Hinweis:** ⚠️ **OPTIONAL** - Nur für OTA Library Mode (10% Power-User)
**Für Phase 4:** Nicht erforderlich (Server-Centric Architektur)

#### Sensor Drivers (`src/services/sensor/sensor_drivers/`)
**Status:** Verzeichnis vorhanden
**Hinweis:** ⚠️ **OPTIONAL** - Nur für OTA Library Mode
**Für Phase 4:** Nicht erforderlich (Server verarbeitet Rohdaten)

### 📋 Models: Bereits definiert

#### SensorConfig (`src/models/sensor_types.h`)
```cpp
struct SensorConfig {
    uint8_t gpio = 255;
    String sensor_type = "";              // String-basiert ("ph_sensor", "temperature_ds18b20")
    String sensor_name = "";
    String subzone_id = "";
    bool active = false;
    bool raw_mode = true;                 // IMMER true (Server-Centric)
    uint32_t last_raw_value = 0;
    unsigned long last_reading = 0;
};

struct SensorReading {
    uint8_t gpio;
    String sensor_type;
    uint32_t raw_value;
    float processed_value;
    String unit;
    String quality;
    unsigned long timestamp;
    bool valid;
    String error_message;
};
```

---

## 🏗️ Phase 4: Detaillierte Implementierungs-Spezifikation

### Modul 1: HTTPClient (KRITISCH - Voraussetzung für PiEnhancedProcessor)

**Pfad:** `src/services/communication/http_client.h/cpp`  
**Status:** ⚠️ Skeleton vorhanden, muss implementiert werden  
**Geschätzte Größe:** ~300 Zeilen  
**Priorität:** 🔴 **BLOCK** (wird von PiEnhancedProcessor benötigt)

#### API-Spezifikation:

```cpp
class HTTPClient {
public:
    // Singleton Pattern (konsistent mit Phase 1-3)
    static HTTPClient& getInstance();
    
    // Lifecycle
    bool begin();
    void end();
    
    // HTTP Response Structure
    struct HTTPResponse {
        int status_code;
        String body;                    // Max 1KB für Sensor-Responses
        bool success;
        char error_message[128];        // Fixed size (konsistent mit Logger)
    };
    
    // POST Request (Primary API - const char*)
    HTTPResponse post(const char* url, const char* payload, 
                     const char* content_type = "application/json",
                     int timeout_ms = 5000);
    
    // Convenience Wrapper: String (Kompatibilität)
    inline HTTPResponse post(const String& url, const String& payload,
                            const String& content_type = "application/json",
                            int timeout_ms = 5000) {
        return post(url.c_str(), payload.c_str(), content_type.c_str(), timeout_ms);
    }
    
    // GET Request (optional, für Library-Download in Phase 8)
    HTTPResponse get(const char* url, int timeout_ms = 5000);
    inline HTTPResponse get(const String& url, int timeout_ms = 5000) {
        return get(url.c_str(), timeout_ms);
    }
    
    // Status
    bool isInitialized() const { return initialized_; }
    void setTimeout(int timeout_ms) { timeout_ms_ = timeout_ms; }
    
private:
    // Private Constructor (Singleton)
    HTTPClient();
    ~HTTPClient();
    
    // Prevent copy
    HTTPClient(const HTTPClient&) = delete;
    HTTPClient& operator=(const HTTPClient&) = delete;
    
    // Private members
    WiFiClient wifi_client_;
    int timeout_ms_ = 5000;
    bool initialized_ = false;
    
    // Helper methods
    bool parseUrl(const char* url, char* host, size_t host_len, 
                  uint16_t& port, char* path, size_t path_len);
};
```

#### Implementierungs-Details:

1. **WiFiClient Integration:**
   - Nutzt `WiFiManager::getInstance()` für WiFi-Verbindung
   - Prüft `WiFiManager::isConnected()` vor jedem Request
   - Timeout-Handling (default: 5s)

2. **POST Request:**
   - URL-Parsing (IP:Port oder Hostname)
   - JSON-Payload-Encoding
   - Content-Type Header setzen
   - Response-Parsing (Status-Code, Body)
   - Error-Handling (Connection-Failed, Timeout, HTTP-Error)

3. **Error-Handling:**
   - Connection-Failed → LOG_ERROR, return HTTPResponse mit success=false
   - Timeout → LOG_WARNING, return HTTPResponse mit success=false
   - HTTP-Error (4xx/5xx) → LOG_ERROR, return HTTPResponse mit status_code

4. **Memory-Management:**
   - Response-Body als String (max 1KB für Sensor-Responses)
   - Keine Heap-Fragmentation (String.reserve() verwenden)

#### Abhängigkeiten:
```cpp
#include <WiFiClient.h>  // ESP32 Core
#include "wifi_manager.h"
#include "../../utils/logger.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"
```

#### Tests:
- Unit-Test: POST Request mit Mock-Server
- Integration-Test: POST zu God-Kaiser Server
- Error-Test: Timeout, Connection-Failed, HTTP-Error

---

### Modul 2: PiEnhancedProcessor (KRITISCH - Server-Centric Core)

**Pfad:** `src/services/sensor/pi_enhanced_processor.h/cpp`  
**Status:** ⚠️ **LEER** - Muss vollständig implementiert werden  
**Geschätzte Größe:** ~250 Zeilen  
**Priorität:** 🔴 **BLOCK** (wird von SensorManager benötigt)

#### API-Spezifikation:

```cpp
class PiEnhancedProcessor {
public:
    static PiEnhancedProcessor& getInstance();
    
    // Lifecycle
    bool begin();
    void end();
    
    // Raw Sensor Data Structure
    struct RawSensorData {
        uint8_t gpio;
        String sensor_type;              // "ph_sensor", "temperature_ds18b20", etc.
        uint32_t raw_value;              // ADC-Wert (0-4095) oder OneWire-Raw
        unsigned long timestamp;
        String metadata;                 // Optional: JSON mit zusätzlichen Infos
    };
    
    // Processed Sensor Data Structure
    struct ProcessedSensorData {
        float value;                     // Verarbeiteter Wert (z.B. 7.2 pH)
        String unit;                     // "pH", "°C", "ppm", etc.
        String quality;                  // "excellent", "good", "fair", "poor", "bad", "stale"
        unsigned long timestamp;
        bool valid;
        String error_message;
    };
    
    // Send raw data to God-Kaiser Server
    // Returns true if request successful, false otherwise
    bool sendRawData(const RawSensorData& data, ProcessedSensorData& processed_out);
    
    // Server Status
    bool isPiAvailable() const;
    String getPiServerAddress() const;
    uint16_t getPiServerPort() const;
    unsigned long getLastResponseTime() const;
    
    // Circuit-Breaker-Pattern
    bool isCircuitOpen() const;          // Server nicht erreichbar
    void resetCircuitBreaker();
    uint8_t getConsecutiveFailures() const;
    
private:
    HTTPClient* http_client_;
    String pi_server_address_ = "";      // Aus ConfigManager
    uint16_t pi_server_port_ = 8000;     // God-Kaiser HTTP Port
    unsigned long last_response_time_ = 0;
    
    // Circuit-Breaker
    uint8_t consecutive_failures_ = 0;
    uint8_t max_failures_ = 5;
    bool circuit_open_ = false;
    unsigned long circuit_open_time_ = 0;
    unsigned long circuit_timeout_ = 60000;  // 1 min
};
```

#### Implementierungs-Details:

1. **God-Kaiser Server API-Spezifikation:**

   **Endpoint:**
   - URL: `http://{pi_server_address}:{pi_server_port}/api/v1/sensors/process`
   - Method: POST
   - Content-Type: `application/json`
   - Timeout: 5000ms (default)

   **Request-Payload:**
   ```json
   {
       "esp_id": "esp_001",
       "gpio": 4,
       "sensor_type": "ph_sensor",
       "raw_value": 2048,
       "timestamp": 1735818000,
       "metadata": "{}"
   }
   ```

   **Response-Payload (HTTP 200):**
   ```json
   {
       "processed_value": 7.2,
       "unit": "pH",
       "quality": "good",
       "timestamp": 1735818000
   }
   ```

   **Error-Response (HTTP 4xx/5xx):**
   ```json
   {
       "error": "Processing failed",
       "message": "Sensor calibration required"
   }
   ```

   **Server-Adresse-Konfiguration:**
   - Default: `"192.168.1.100"` (Hardcoded Fallback)
   - Config: `ConfigManager::getWiFiConfig().server_address` (aus NVS)
   - NVS-Key: `"server_address"` (Namespace: `"wifi_config"`)

2. **Circuit-Breaker-Logik:**
   - Bei HTTP-Fehler: `consecutive_failures_++`
   - Bei `consecutive_failures_ >= max_failures_`: `circuit_open_ = true`
   - Bei `circuit_open_`: Keine Requests für `circuit_timeout_` (60s)
   - Nach Timeout: Automatisches Reset, `consecutive_failures_ = 0`
   - Bei erfolgreichem Request: `consecutive_failures_ = 0`, `circuit_open_ = false`

3. **Response-Parsing:**
   - JSON-Parsing mit ArduinoJson (falls verfügbar) oder String-Manipulation
   - Validierung: `processed_value`, `unit`, `quality` vorhanden
   - Error-Handling: Invalid JSON → `processed_out.valid = false`

4. **Config-Integration:**
   - `pi_server_address_` aus `ConfigManager::getWiFiConfig().server_address` laden
   - Fallback: Hardcoded Default (z.B. "192.168.1.100")
   - **WICHTIG:** ConfigManager hat bereits `getWiFiConfig()` mit `server_address` Feld

5. **Error-Handling:**
   - Circuit-Open → LOG_WARNING, return false (kein Request)
   - HTTP-Fehler → LOG_ERROR, Circuit-Breaker-Update
   - JSON-Parse-Error → LOG_ERROR, `processed_out.valid = false`

#### Abhängigkeiten:
```cpp
#include "../communication/http_client.h"
#include "../config/config_manager.h"
#include "../../utils/logger.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"
#include "../../models/sensor_types.h"
```

#### Tests:
- Unit-Test: Mock HTTPClient, Circuit-Breaker-Logik
- Integration-Test: POST zu God-Kaiser Server, Response-Parsing
- Error-Test: Circuit-Breaker bei Server-Ausfall

---

### Modul 3: SensorManager (Vollständige Implementierung)

**Pfad:** `src/services/sensor/sensor_manager.h/cpp`  
**Status:** Skeleton vorhanden, muss erweitert werden  
**Geschätzte Größe:** ~350 Zeilen (erweitert von 90 auf 350)  
**Priorität:** 🔴 **BLOCK**

#### Erweiterte API-Spezifikation:

```cpp
class SensorManager {
public:
    static SensorManager& getInstance();
    
    // Lifecycle
    bool begin();
    void end();
    
    // Sensor Configuration
    bool configureSensor(const SensorConfig& config);
    bool removeSensor(uint8_t gpio);
    SensorConfig getSensorConfig(uint8_t gpio) const;
    bool hasSensorOnGPIO(uint8_t gpio) const;
    uint8_t getActiveSensorCount() const;
    
    // Sensor Reading
    // Phase 3 Methods (bereits im Skeleton):
    bool performI2CMeasurement(uint8_t device_address, uint8_t reg, 
                               uint8_t* buffer, size_t len);
    bool performOneWireMeasurement(const uint8_t rom[8], int16_t& raw_value);
    
    // Phase 4 Methods (NEU):
    // Perform measurement for a specific GPIO-based sensor
    bool performMeasurement(uint8_t gpio, SensorReading& reading_out);
    
    // Perform measurements for all active sensors
    // Publishes results via MQTT automatically
    void performAllMeasurements();
    
    // Raw Data Reading (für verschiedene Sensor-Typen)
    uint32_t readRawAnalog(uint8_t gpio);        // analogRead()
    uint32_t readRawDigital(uint8_t gpio);       // digitalRead()
    bool readRawI2C(uint8_t gpio, uint8_t device_address, 
                    uint8_t reg, uint8_t* buffer, size_t len);
    bool readRawOneWire(uint8_t gpio, const uint8_t rom[8], int16_t& raw_value);
    
    // Status
    bool isInitialized() const;
    String getSensorInfo(uint8_t gpio) const;
    
private:
    static const uint8_t MAX_SENSORS = 10;
    SensorConfig sensors_[MAX_SENSORS];
    uint8_t sensor_count_ = 0;
    PiEnhancedProcessor* pi_processor_;
    MQTTClient* mqtt_client_;
    I2CBusManager* i2c_bus_;
    OneWireBusManager* onewire_bus_;
    GPIOManager* gpio_manager_;
    unsigned long last_measurement_time_ = 0;
    unsigned long measurement_interval_ = 30000;  // 30s default
    bool initialized_ = false;
};
```

#### Implementierungs-Details:

1. **Sensor-Registry:**
   - Fixed Array: `SensorConfig sensors_[MAX_SENSORS]` (10 Sensoren max)
   - `sensor_count_` trackt aktive Sensoren
   - `configureSensor()`: Prüft GPIO-Konflikte, fügt Sensor hinzu
   - `removeSensor()`: Entfernt Sensor, gibt GPIO frei

2. **Sensor-Typ-Erkennung:**
   - String-basierte `sensor_type` (z.B. "ph_sensor", "temperature_ds18b20")
   - Mapping zu Reading-Methode:
     - `"ph_sensor"` → `readRawAnalog(gpio)`
     - `"temperature_ds18b20"` → `readRawOneWire(gpio, rom)`
     - `"temperature_sht31"` → `readRawI2C(gpio, 0x44, 0x00, buffer, 6)`
     - `"ec_sensor"` → `readRawAnalog(gpio)`

3. **performMeasurement() - Einzelne Sensor-Messung:**
   ```cpp
   bool SensorManager::performMeasurement(uint8_t gpio, SensorReading& reading_out) {
       // 1. Sensor-Config finden
       SensorConfig* config = findSensorConfig(gpio);
       if (!config || !config->active) return false;
       
       // 2. Raw-Value lesen (abhängig von sensor_type)
       uint32_t raw_value = 0;
       if (config->sensor_type == "ph_sensor") {
           raw_value = readRawAnalog(gpio);
       } else if (config->sensor_type == "temperature_ds18b20") {
           // OneWire ROM-Code aus Config (später)
           int16_t raw_temp;
           if (readRawOneWire(gpio, rom_code, raw_temp)) {
               raw_value = (uint32_t)raw_temp;
           }
       }
       // ... weitere Sensor-Typen
       
       // 3. Raw-Value an Pi senden
       PiEnhancedProcessor::RawSensorData raw_data;
       raw_data.gpio = gpio;
       raw_data.sensor_type = config->sensor_type;
       raw_data.raw_value = raw_value;
       raw_data.timestamp = millis();
       
       PiEnhancedProcessor::ProcessedSensorData processed;
       bool success = pi_processor_->sendRawData(raw_data, processed);
       
       // 4. SensorReading füllen
       reading_out.gpio = gpio;
       reading_out.sensor_type = config->sensor_type;
       reading_out.raw_value = raw_value;
       reading_out.processed_value = processed.value;
       reading_out.unit = processed.unit;
       reading_out.quality = processed.quality;
       reading_out.timestamp = millis();
       reading_out.valid = processed.valid;
       
       // 5. Config aktualisieren
       config->last_raw_value = raw_value;
       config->last_reading = millis();
       
       return success;
   }
   ```

4. **performAllMeasurements() - Alle Sensoren messen:**
   ```cpp
   void SensorManager::performAllMeasurements() {
       if (!initialized_) return;
       
       unsigned long now = millis();
       if (now - last_measurement_time_ < measurement_interval_) return;
       
       for (uint8_t i = 0; i < sensor_count_; i++) {
           if (!sensors_[i].active) continue;
           
           SensorReading reading;
           if (performMeasurement(sensors_[i].gpio, reading)) {
               // MQTT-Publish
               publishSensorReading(reading);
           }
       }
       
       last_measurement_time_ = now;
   }
   ```

5. **MQTT-Publishing:**

   **MQTT-Topic-Struktur für Sensor-Daten:**
   
   **Publish-Topic (Sensor-Daten):**
   - Pattern: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`
   - Beispiel: `kaiser/god/esp/esp_001/sensor/4/data`
   - QoS: 1 (Zuverlässigkeit)
   - Frequency: Alle 30s (konfigurierbar)
   
   **TopicBuilder-Erweiterung erforderlich:**
   ```cpp
   // In topic_builder.h hinzufügen:
   const char* buildSensorDataTopic(uint8_t gpio);
   ```
   - Nutzt `static char topic_buffer[256]` (konsistent mit Phase 1)
   - snprintf mit Truncation-Check (konsistent mit Phase 1 Buffer-Overflow-Protection)
   - Buffer-Size: 256 Bytes (ausreichend für max. ~94 Bytes Topic-Länge)

   **Payload (JSON):**
   ```json
   {
     "esp_id": "esp_001",
     "gpio": 4,
     "sensor_type": "ph_sensor",
     "raw_value": 2048,
     "processed_value": 7.2,
     "unit": "pH",
     "quality": "good",
     "timestamp": 1735818000
   }
   ```

6. **GPIO-Integration:**
   - `configureSensor()`: Prüft GPIO-Availability via `GPIOManager::isPinAvailable()`
   - Reserviert GPIO via `GPIOManager::reservePin()`
   - `removeSensor()`: Gibt GPIO frei via `GPIOManager::releasePin()`

7. **Bus-Integration:**
   - I2C-Sensoren: Nutzt `I2CBusManager::readRaw()`
   - OneWire-Sensoren: Nutzt `OneWireBusManager::readRawTemperature()`
   - Analog-Sensoren: Direkt `analogRead(gpio)`

#### Abhängigkeiten:
```cpp
#include "pi_enhanced_processor.h"
#include "../communication/mqtt_client.h"
#include "../drivers/gpio_manager.h"
#include "../drivers/i2c_bus.h"
#include "../drivers/onewire_bus.h"
#include "../../utils/topic_builder.h"
#include "../../utils/logger.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"
#include "../../models/sensor_types.h"
```

#### Tests:
- Unit-Test: Sensor-Registry, GPIO-Konflikte, Reading-Methoden
- Integration-Test: performAllMeasurements(), MQTT-Publishing
- Error-Test: Pi-Server-Ausfall, MQTT-Disconnect

---

### Modul 4: Sensor-Konfiguration via MQTT

**Pfad:** Integration in `main.cpp` MQTT-Callback  
**Status:** Muss implementiert werden  
**Geschätzte Größe:** ~100 Zeilen (in main.cpp)  
**Priorität:** 🟡 **HIGH**

#### MQTT-Topic:

**Subscribe-Topic (Sensor-Config):**
- Pattern: `kaiser/{kaiser_id}/esp/{esp_id}/config`
- Beispiel: `kaiser/god/esp/esp_001/config`
- QoS: 1 (Zuverlässigkeit)

**HINWEIS:** `buildConfigTopic()` ist bereits in TopicBuilder implementiert (Phase 1, Pattern 7)
- Verwendung: `TopicBuilder::buildConfigTopic()` (bereits vorhanden)

#### Payload-Format:
```json
{
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "ph_sensor",
      "sensor_name": "Boden pH",
      "subzone_id": "zone_1",
      "active": true
    },
    {
      "gpio": 6,
      "sensor_type": "temperature_ds18b20",
      "sensor_name": "Luft Temperatur",
      "subzone_id": "zone_1",
      "active": true
    }
  ]
}
```

#### Implementierung in main.cpp:

```cpp
void onMqttMessage(const String& topic, const String& payload) {
    // ... bestehende Handler ...
    
    // Sensor-Config Handler
    if (topic == TopicBuilder::buildConfigTopic()) {
        handleSensorConfig(payload);
    }
}

void handleSensorConfig(const String& payload) {
    // JSON-Parsing (ArduinoJson oder String-Manipulation)
    // Für jedes Sensor-Config:
    SensorConfig config;
    config.gpio = json["gpio"];
    config.sensor_type = json["sensor_type"];
    config.sensor_name = json["sensor_name"];
    config.subzone_id = json["subzone_id"];
    config.active = json["active"];
    config.raw_mode = true;  // IMMER true (Server-Centric)
    
    // SensorManager konfigurieren
    if (config.active) {
        sensorManager.configureSensor(config);
    } else {
        sensorManager.removeSensor(config.gpio);
    }
    
    // Config in NVS speichern (via ConfigManager)
    configManager.saveSensorConfig(config);
}
```

#### Abhängigkeiten:
```cpp
#include "services/sensor/sensor_manager.h"
#include "services/config/config_manager.h"
#include "utils/topic_builder.h"
#include "utils/logger.h"
#include "error_handling/error_tracker.h"
#include "models/error_codes.h"
```

#### ⚠️ ConfigManager-Erweiterung erforderlich:

**ConfigManager muss erweitert werden um Sensor-Config-Methoden:**

**API-Spezifikation:**

```cpp
// In config_manager.h hinzufügen:
class ConfigManager {
public:
    // 1. Einzelner Sensor (für MQTT-Config-Update)
    bool saveSensorConfig(const SensorConfig& config);
    
    // 2. Array von Sensoren (für Bulk-Save bei Startup)
    bool saveSensorConfig(const SensorConfig* sensors, uint8_t count);
    
    // 3. Laden aller Sensoren
    bool loadSensorConfig(SensorConfig sensors[], uint8_t max_sensors, 
                         uint8_t& loaded_count);
    
    // 4. Sensor entfernen
    bool removeSensorConfig(uint8_t gpio);
    
    // 5. Validierung
    bool validateSensorConfig(const SensorConfig& config);
};
```

**NVS-Keys:**
- Namespace: `"sensor_config"`
- Key-Pattern: `"sensor_{gpio}_{field}"` (z.B. `"sensor_4_type"`, `"sensor_4_name"`)
- Fields: `type`, `name`, `subzone`, `active`, `raw_mode`
- Zusätzlich: `"sensor_count"` (Anzahl konfigurierter Sensoren)

**Implementierung in config_manager.cpp:**
- Nutzt `StorageManager` für NVS-Persistenz
- `saveSensorConfig(single)`: Speichert einzelnen Sensor (für MQTT-Updates)
- `saveSensorConfig(array)`: Iteriert über Array, speichert jeden Sensor (für Bulk-Save)
- `loadSensorConfig()`: Lädt alle Sensoren aus NVS, gibt `loaded_count` zurück
- `removeSensorConfig()`: Löscht Sensor aus NVS, aktualisiert `sensor_count`
- `validateSensorConfig()`: Prüft GPIO-Bereich, sensor_type nicht leer, etc.

**Abhängigkeiten:**
```cpp
#include "../utils/storage_manager.h"
#include "../../models/sensor_types.h"
```

---

## 📋 Implementierungs-Reihenfolge

### Tag 1-2: HTTPClient (KRITISCH)
1. **http_client.h** - Header-Datei mit API-Definition
2. **http_client.cpp** - POST/GET Implementation
3. **Unit-Tests** - Mock-Server-Tests
4. **Integration-Test** - POST zu God-Kaiser Server

### Tag 3-4: PiEnhancedProcessor (KRITISCH)
1. **pi_enhanced_processor.h** - Header-Datei mit API-Definition
2. **pi_enhanced_processor.cpp** - HTTP-Request, Circuit-Breaker
3. **Unit-Tests** - Mock HTTPClient, Circuit-Breaker-Logik
4. **Integration-Test** - POST zu God-Kaiser, Response-Parsing

### Tag 5-7: SensorManager (Vollständige Implementierung)
1. **sensor_manager.h** - API erweitern (configureSensor, performAllMeasurements)
2. **sensor_manager.cpp** - Sensor-Registry, Reading-Methoden, MQTT-Publishing
3. **Integration** - I2CBusManager, OneWireBusManager, GPIOManager
4. **Unit-Tests** - Sensor-Registry, Reading-Methoden
5. **Integration-Test** - performAllMeasurements(), MQTT-Publishing

### Tag 8: Sensor-Konfiguration via MQTT
1. **main.cpp** - MQTT-Callback erweitern (handleSensorConfig)
2. **JSON-Parsing** - Sensor-Config aus MQTT-Payload
3. **ConfigManager-Integration** - Sensor-Config in NVS speichern
4. **Integration-Test** - MQTT-Config-Update, Sensor-Registrierung

### Tag 9-10: Integration & Tests
1. **End-to-End-Test** - Sensor-Reading → Pi → MQTT-Publish
2. **Error-Handling-Test** - Pi-Server-Ausfall, MQTT-Disconnect
3. **Performance-Test** - 10 Sensoren, 30s Intervall
4. **Memory-Test** - Heap-Usage, keine Leaks

---

## ✅ Erfolgs-Kriterien Phase 4

### Funktionale Anforderungen:
- ✅ **HTTPClient funktioniert** (POST zu God-Kaiser Server)
- ✅ **PiEnhancedProcessor funktioniert** (Raw-Data → Processed-Data)
- ✅ **SensorManager funktioniert** (Sensor-Registry, Reading, MQTT-Publish)
- ✅ **Sensor-Konfiguration funktioniert** (via MQTT, NVS-Persistenz)
- ✅ **MQTT-Publishing funktioniert** (alle 30s, QoS 1)
- ✅ **Circuit-Breaker funktioniert** (bei Server-Ausfall)

### Technische Anforderungen:
- ✅ **Keine Linter-Fehler**
- ✅ **Memory-Usage < 30KB** (Phase 1-3: ~25KB + Phase 4: ~5KB)
- ✅ **Performance:** Sensor-Reading < 1s, MQTT-Publish < 100ms
- ✅ **Error-Handling:** Alle Fehler werden geloggt (via ErrorTracker)
- ✅ **Code-Qualität:** Konsistent mit Phase 1-3 Patterns

### Integration-Anforderungen:
- ✅ **I2CBusManager Integration** (I2C-Sensoren funktionieren)
- ✅ **OneWireBusManager Integration** (DS18B20 funktioniert)
- ✅ **GPIOManager Integration** (Pin-Reservation funktioniert)
- ✅ **MQTTClient Integration** (Publishing funktioniert)
- ✅ **ConfigManager Integration** (Sensor-Config-Persistenz)

---

## 🧪 Test-Spezifikation

### Unit-Tests:

#### HTTPClient Tests:
- `test_http_client_initialization()` - begin() funktioniert
- `test_http_client_post_success()` - POST Request erfolgreich
- `test_http_client_post_timeout()` - Timeout-Handling
- `test_http_client_post_connection_failed()` - Connection-Failed-Handling

#### PiEnhancedProcessor Tests:
- `test_pi_processor_initialization()` - begin() funktioniert
- `test_pi_processor_send_raw_data()` - sendRawData() erfolgreich
- `test_pi_processor_circuit_breaker()` - Circuit-Breaker bei Fehlern
- `test_pi_processor_circuit_reset()` - Circuit-Breaker-Reset nach Timeout

#### SensorManager Tests:
- `test_sensor_manager_configure_sensor()` - Sensor-Registrierung
- `test_sensor_manager_gpio_conflict()` - GPIO-Konflikt-Erkennung
- `test_sensor_manager_perform_measurement()` - Einzelne Messung
- `test_sensor_manager_perform_all_measurements()` - Alle Sensoren
- `test_sensor_manager_mqtt_publish()` - MQTT-Publishing

### Integration-Tests:

#### End-to-End Sensor-Reading:
1. Sensor-Config via MQTT empfangen
2. SensorManager konfiguriert Sensor
3. `performAllMeasurements()` liest Sensor
4. PiEnhancedProcessor sendet Raw-Data zu Server
5. Server antwortet mit Processed-Data
6. SensorManager publiziert via MQTT
7. MQTT-Message wird empfangen (Mosquitto)

#### Error-Handling:
1. Pi-Server-Ausfall → Circuit-Breaker öffnet
2. MQTT-Disconnect → Offline-Buffer speichert Messages
3. GPIO-Konflikt → Sensor-Registrierung schlägt fehl (geloggt)

### Performance-Tests:
- **10 Sensoren:** Alle 30s messen → Memory-Usage < 30KB
- **MQTT-Publish-Latency:** < 100ms
- **Sensor-Reading-Latency:** < 1s (inkl. Pi-Request)

---

## 📝 Code-Qualitäts-Standards

### Konsistenz mit Phase 1-3:

1. **Singleton-Pattern:**
   ```cpp
   static SensorManager& getInstance() {
       static SensorManager instance;
       return instance;
   }
   ```

2. **Logger-Integration (const char* Primary API):**
   ```cpp
   LOG_INFO("SensorManager initialized");  // const char* bevorzugt
   LOG_ERROR("Failed to configure sensor");  // const char* bevorzugt
   // String-Wrapper für Kompatibilität (wenn nötig):
   LOG_INFO(String("GPIO ") + String(gpio) + " configured");  // OK, aber nicht optimal
   ```

3. **Error-Handling (konsistent mit ErrorTracker):**
   ```cpp
   if (!success) {
       errorTracker.trackError(ERROR_SENSOR_READ_FAILED, ERROR_SEVERITY_ERROR, 
                              "Sensor read failed");
       return false;
   }
   ```

4. **Memory-Management (konsistent mit Phase 1-3):**
   - Fixed Arrays statt dynamic allocation: `SensorConfig sensors_[MAX_SENSORS]`
   - String.reserve() für bekannte Größen: `payload.reserve(256)`
   - char[] statt String für Fixed-Size: `char error_message[128]`
   - Keine Heap-Fragmentation

5. **TopicBuilder-Integration (const char* return):**
   ```cpp
   const char* topic = TopicBuilder::buildSensorDataTopic(gpio);
   mqttClient.publish(topic, payload, 1);  // Direkt verwenden, kein String()
   ```

6. **Doxygen-Dokumentation (konsistent mit Phase 1-3):**
   ```cpp
   /// @brief Perform measurement for a specific GPIO-based sensor
   /// @param gpio GPIO pin number (0-39)
   /// @param reading_out Output parameter with sensor reading
   /// @return true if measurement successful, false otherwise
   /// @note Requires PiEnhancedProcessor to be initialized
   bool performMeasurement(uint8_t gpio, SensorReading& reading_out);
   ```

7. **Include-Pfade (konsistent mit Projektstruktur):**
   ```cpp
   // Relative Pfade von src/services/sensor/
   #include "../communication/http_client.h"
   #include "../../utils/logger.h"
   #include "../../error_handling/error_tracker.h"
   #include "../../models/error_codes.h"
   ```

---

## 🔗 Abhängigkeiten & Integration

### Abhängigkeiten von Phase 0-3:
- ✅ **GPIOManager** - Pin-Reservation, Conflict-Detection
- ✅ **I2CBusManager** - I2C-Sensor-Reading
- ✅ **OneWireBusManager** - DS18B20-Reading
- ✅ **MQTTClient** - Sensor-Daten-Publishing
- ✅ **WiFiManager** - WiFi-Verbindung (für HTTPClient)
- ✅ **Logger** - Strukturiertes Logging
- ✅ **ConfigManager** - Sensor-Config-Persistenz
- ✅ **TopicBuilder** - MQTT-Topic-Generierung
- ✅ **ErrorTracker** - Error-Logging

### Wird benötigt von Phase 5:
- **ActuatorManager** - Kann Sensor-Werte für Automationen nutzen

---

## 📚 Referenzen

### Dokumentation:
- **Roadmap.md** - Phase 4 Übersicht (Zeilen 792-837)
- **ZZZ.md** - Phase 4 Detaillierte Spezifikation (Zeilen 787-943)
- **Phase_3.md** - Hardware Abstraction Layer (I2C, OneWire)
- **PHASE_1_Code_Review.md** - Code-Qualitäts-Standards
- **PHASE_2_CODEBASE_ANALYSE.md** - MQTTClient-Integration

### Code-Referenzen (Patterns aus Phase 1-3):
- `src/services/communication/mqtt_client.h/cpp` - MQTT-Publishing-Pattern, Singleton
- `src/drivers/i2c_bus.h/cpp` - I2C-Reading-Pattern, Error-Handling
- `src/drivers/onewire_bus.h/cpp` - OneWire-Reading-Pattern
- `src/utils/logger.h/cpp` - Logging-Pattern (const char* Primary API)
- `src/utils/topic_builder.h/cpp` - Topic-Building (const char* return, static buffer)
- `src/services/config/config_manager.h/cpp` - Config-Persistenz-Pattern, Singleton
- `src/error_handling/error_tracker.h/cpp` - Error-Tracking-Pattern
- `src/models/error_codes.h` - Error-Code-Definitionen

### Wichtige Patterns für Konsistenz:

1. **Singleton-Pattern:**
   ```cpp
   static HTTPClient& getInstance() {
       static HTTPClient instance;
       return instance;
   }
   ```

2. **Logger-Integration (const char* Primary):**
   ```cpp
   LOG_INFO("Message");  // const char* wird bevorzugt
   LOG_ERROR("Error occurred");
   ```

3. **TopicBuilder (const char* return):**
   ```cpp
   const char* topic = TopicBuilder::buildSensorDataTopic(gpio);
   mqttClient.publish(topic, payload);  // Nicht: String(topic)
   ```

4. **Error-Handling:**
   ```cpp
   errorTracker.trackError(ERROR_HTTP_REQUEST_FAILED, ERROR_SEVERITY_ERROR, "Message");
   ```

5. **Memory-Management:**
   ```cpp
   String payload;
   payload.reserve(256);  // Verhindert Heap-Fragmentation
   // ... payload aufbauen
   ```

---

## 🚀 Nächste Schritte nach Phase 4

### Phase 5: Actuator System
- ActuatorManager vollständige Implementierung
- SafetyController (Emergency-Stop)
- MQTT-Subscription für Actuator-Commands
- Integration mit SensorManager (Automationen)

### Phase 6: Configuration & Storage
- ConfigManager erweitern (Sensor/Actuator-Config)
- WiFiConfig (Captive Portal)
- LibraryManager (OTA Library-Download)

---

**Dokument erstellt:** 2025-01-28  
**Version:** 1.1  
**Status:** 📋 PLANUNG - ✅ Vollständig überarbeitet, konsistent mit ZZZ.md & Roadmap.md  
**Qualität:** 🟢 9/10 - Bereit für Implementierung  
**Nächste Überprüfung:** Nach Phase 4 Fertigstellung

---

## ✅ Vollständigkeits-Checkliste

### ✅ Codebase-Analyse:
- [x] Phase 0-3 Implementierungen dokumentiert
- [x] Vorhandene Skelette identifiziert
- [x] Abhängigkeiten aufgelistet

### ✅ Modul-Spezifikationen:
- [x] HTTPClient API vollständig spezifiziert
- [x] PiEnhancedProcessor API vollständig spezifiziert
- [x] SensorManager API vollständig spezifiziert
- [x] MQTT-Integration spezifiziert

### ✅ Konsistenz-Checks:
- [x] Singleton-Pattern konsistent
- [x] Logger-Integration konsistent (const char* Primary)
- [x] Error-Handling konsistent (ErrorTracker, Error-Codes)
- [x] Memory-Management konsistent (Fixed Arrays, String.reserve())
- [x] TopicBuilder-Integration spezifiziert
- [x] ConfigManager-Erweiterung spezifiziert

### ✅ Ergänzungen (Version 1.1):
- [x] MQTT-Topic-Struktur präzisiert
- [x] TopicBuilder-Erweiterung dokumentiert (buildSensorDataTopic)
- [x] ConfigManager API präzisiert (5 Methoden)
- [x] God-Kaiser Server API detailliert (Endpoint, Payload, Error-Response)

### ✅ Implementierungs-Plan:
- [x] 10-Tage-Plan mit klaren Meilensteinen
- [x] Test-Spezifikation vollständig
- [x] Erfolgs-Kriterien definiert

