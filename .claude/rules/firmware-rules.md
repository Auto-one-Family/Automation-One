---
paths:
  - "El Trabajante/**"
---

# ESP32 Firmware Rules (El Trabajante)

> **Scope:** Nur fuer Dateien in `El Trabajante/`

---

## 1. Architektur-Constraints

### Server-Centric (UNVERAENDERLICH)

```
ESP32 = Rohdaten senden + Befehle empfangen
ESP32 != Business-Logic, Datenverarbeitung, Entscheidungen
```

- **NIEMALS** Sensor-Kalibrierung auf ESP32 (nur RAW-Werte)
- **NIEMALS** Logik-Auswertung auf ESP32
- **NIEMALS** State-Management ueber Reboots (ausser NVS Config)

### Memory-Constraints

| Resource | Limit | Regel |
|----------|-------|-------|
| **Heap** | ~160KB | Keine dynamischen Allokationen in Loops |
| **Stack** | 8KB/Task | Keine grossen lokalen Arrays, keine Rekursion |
| **Flash** | ~1.2MB Code | PROGMEM fuer konstante Strings |

---

## 2. C++ Konventionen

### Naming

| Element | Convention | Beispiel |
|---------|------------|----------|
| Klassen | PascalCase | `SensorManager`, `ActuatorDriver` |
| Methoden | camelCase | `begin()`, `getValue()`, `handleMessage()` |
| Member-Variablen | snake_case mit `_` Suffix | `sensor_count_`, `is_initialized_` |
| Konstanten | UPPER_SNAKE_CASE | `MAX_SENSORS`, `DEFAULT_TIMEOUT` |
| Macros | UPPER_SNAKE_CASE | `LOG_INFO`, `ERROR_CODE` |

### Include-Reihenfolge

```cpp
// 1. Zugehoeriger Header
#include "sensor_manager.h"

// 2. C/C++ Standard
#include <Arduino.h>
#include <memory>
#include <vector>

// 3. Externe Libraries
#include <ArduinoJson.h>
#include <PubSubClient.h>

// 4. Projekt-Header (alphabetisch)
#include "drivers/gpio_manager.h"
#include "models/sensor_types.h"
#include "utils/logger.h"
```

### Memory-Management

```cpp
// RICHTIG: RAII mit std::unique_ptr
std::unique_ptr<Driver> driver = std::make_unique<PumpDriver>();

// FALSCH: raw new/delete
Driver* driver = new PumpDriver();  // NIEMALS!
delete driver;                       // NIEMALS!
```

---

## 3. Pattern-Anforderungen

### Singleton-Pattern (Manager-Klassen)

```cpp
class XManager {
public:
    static XManager& getInstance() {
        static XManager instance;
        return instance;
    }

    XManager(const XManager&) = delete;
    XManager& operator=(const XManager&) = delete;

    bool begin();
    void end();

private:
    XManager() = default;
    ~XManager() = default;

    bool initialized_ = false;
};
```

### Driver-Interface

```cpp
class IDriver {
public:
    virtual ~IDriver() = default;
    virtual bool begin(const Config& config) = 0;
    virtual void end() = 0;
    virtual bool isInitialized() const = 0;
};
```

### Error-Handling

```cpp
if (!precondition) {
    errorTracker.trackError(ERROR_CODE, "Human readable message");
    return false;
}
```

---

## 4. GPIO-Regeln

### Pin-Reservation (IMMER ZUERST)

```cpp
// VOR jeder GPIO-Nutzung pruefen und reservieren
if (!gpioManager.isPinAvailable(gpio)) {
    return ERROR_GPIO_CONFLICT;
}
gpioManager.requestPin(gpio, "sensor", "DS18B20");
```

### Safe-Mode (KRITISCH)

```cpp
// MUSS als ERSTES in setup() stehen!
gpioManager.initializeAllPinsToSafeMode();
```

### Pin-Freigabe

```cpp
// Bei Sensor/Actuator Entfernung
gpioManager.releasePin(gpio);
```

---

## 5. MQTT-Regeln

### Topic-Building (IMMER TopicBuilder)

```cpp
// RICHTIG
char topic[128];
TopicBuilder::buildSensorDataTopic(gpio, topic, sizeof(topic));

// FALSCH
String topic = "kaiser/" + kaiserId + "/esp/" + espId + "/sensor/...";
```

### QoS-Verwendung

| Message-Typ | QoS | Grund |
|-------------|-----|-------|
| Sensor Data | 1 | Wichtig, aber nicht kritisch |
| Actuator Command | 1 | Muss ankommen |
| Heartbeat | 0 | Regelmaessig, Verlust OK |
| Emergency Stop | 1 | MUSS ankommen |

### Payload-Format (JSON)

```cpp
DynamicJsonDocument doc(256);
doc["gpio"] = gpio;
doc["value"] = value;
doc["timestamp"] = TimeManager::getTimestamp();
doc["raw_mode"] = true;  // IMMER true fuer Sensor-Daten
```

---

## 6. Fehlerbehandlung

### Error-Codes (1000-4999)

| Range | Category |
|-------|----------|
| 1000-1999 | HARDWARE (GPIO, I2C, OneWire, SPI) |
| 2000-2999 | SERVICE (NVS, Config, Watchdog) |
| 3000-3999 | COMMUNICATION (WiFi, MQTT) |
| 4000-4999 | APPLICATION (State, Logic) |

### Logging

```cpp
LOG_INFO("SensorManager: Started with %d sensors", count);
LOG_WARNING("SensorManager: Sensor timeout on GPIO %d", gpio);
LOG_ERROR("SensorManager: Failed to initialize - %s", errorMsg);
```

---

## 7. Build-Verifikation

### Vor jedem Commit

```bash
cd "El Trabajante" && pio run -e esp32_dev
```

### Erwartetes Ergebnis

- 0 Errors
- 0 Warnings (idealerweise)
- RAM/Flash unter Limit

---

## 8. Verbotene Aktionen

| Aktion | Grund |
|--------|-------|
| Business-Logic auf ESP32 | Server-Centric Architektur |
| `new`/`delete` | Memory-Leaks, Fragmentation |
| Blocking Calls in Loop | Watchdog Timeout |
| Hardcoded MQTT Topics | TopicBuilder verwenden |
| Magic Numbers | Konstanten definieren |
| Rekursion | Stack Overflow Risk |
