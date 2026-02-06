# ESP32 Debug Report: SHT31 Config Verification

**Agent:** esp32-debug
**Datum:** 2026-02-05 19:16 UTC
**ESP32:** ESP_472204
**Status:** APPROVED (operational)
**Log-Quelle:** `El Trabajante/logs/device-monitor-260205-181100.log`

---

## 1. Executive Summary

| Aspekt | Status | Detail |
|--------|--------|--------|
| **Erster Config (gpio: 21)** | FAILED | Error 1002 GPIO_CONFLICT - I2C SDA reserviert |
| **Zweiter Config (gpio: 0)** | FAILED | Error 1002 GPIO_CONFLICT - Bootstrap-Pin reserviert |
| **SHT31-Sensor aktiv** | NEIN | 0 Sensoren in NVS |
| **Sensor-Daten gesendet** | NEIN | Kein Sensor konfiguriert |

---

## 2. Serial-Log Analyse

### 2.1 Boot-Sequenz (erfolgreich)
```
18:49:22.084 > [INFO] Subscribed to: kaiser/god/esp/ESP_472204/config
18:54:22.372 > [INFO] DEVICE APPROVED BY SERVER
18:54:22.394 > Transitioning from PENDING_APPROVAL to OPERATIONAL
```
**ESP ist online und approved.**

### 2.2 Erster Config-Versuch (18:55:55) - gpio: 21
```
18:55:55.391 > [INFO] MQTT message received: kaiser/god/esp/ESP_472204/config
18:55:55.402 > [INFO] Handling sensor configuration from MQTT
18:55:55.404 > [ERROR] Sensor Manager: GPIO 21 not available
18:55:55.412 > [ERROR] [1002] [HARDWARE] GPIO conflict for sensor
18:55:55.414 > [ERROR] Failed to configure sensor on GPIO 21
18:55:55.422 > [INFO] ConfigResponse published [sensor] status=error success=0 failed=1
```

**Root-Cause:** GPIO 21 ist beim Boot als I2C SDA reserviert:
```
18:49:22.254 > [esp32-hal-i2c.c:75] i2cInit(): Initialising I2C Master: sda=21 scl=22
18:49:22.271 > [INFO] I2C Bus Manager initialized successfully
```

### 2.3 Zweiter Config-Versuch (19:03:36) - gpio: 0
```
19:03:36.085 > [INFO] MQTT message received: kaiser/god/esp/ESP_472204/config
19:03:36.090 > [INFO] Handling sensor configuration from MQTT
19:03:36.096 > [ERROR] Sensor Manager: GPIO 0 not available
19:03:36.102 > [ERROR] [1002] [HARDWARE] GPIO conflict for sensor
19:03:36.108 > [ERROR] Failed to configure sensor on GPIO 0
19:03:36.117 > [INFO] ConfigResponse published [sensor] status=error success=0 failed=1
```

**Root-Cause:** GPIO 0 ist ein ESP32 Bootstrap-Pin (Boot Mode Selection) und wird vom System reserviert.

### 2.4 Aktueller Sensor-Status
```
18:49:22.516 > [INFO] ConfigManager: Found 0 sensor(s) in NVS
18:49:22.521 > [INFO] Loaded 0 sensor configs from NVS
```
**KEIN Sensor konfiguriert - daher keine Sensor-Daten.**

---

## 3. Code-Analyse: I2C-Sensor Handling

### 3.1 SensorManager::configureSensor() Logik

Aus `El Trabajante/src/services/sensor/sensor_manager.cpp`:

```cpp
// I2C Sensor: Use I2C bus, NO GPIO reservation needed
// GPIO 21/22 are already reserved by I2CBusManager as "system"/"I2C_SDA"/"I2C_SCL"

if (is_i2c_sensor) {
    // Check 1: I2C bus must be initialized
    if (!i2c_bus_->isInitialized()) {
        LOG_ERROR("Sensor Manager: I2C bus not initialized");
        return false;
    }

    // Add I2C sensor (NO GPIO reservation!)
    sensors_[sensor_count_] = config;
    sensors_[sensor_count_].active = true;
    sensors_[sensor_count_].i2c_address = i2c_address;  // Store I2C address
    sensor_count_++;

    LOG_INFO("Sensor Manager: Configured I2C sensor '" + config.sensor_type +
             "' at address 0x" + String(i2c_address, HEX));
    return true;
}
```

### 3.2 Problem: GPIO-Prüfung VOR I2C-Check

Der Code in `main.cpp:parseAndConfigureSensorWithTracking()` prüft GPIO-Verfügbarkeit via `configManager.validateSensorConfig()` **BEVOR** der SensorManager entscheidet, ob es ein I2C-Sensor ist:

```cpp
if (!configManager.validateSensorConfig(config)) {
    // GPIO conflict check happens HERE
    String pin_owner = gpioManager.getPinOwner(config.gpio);
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_GPIO_CONFLICT, ...);
}
```

Bei I2C-Sensoren sollte der GPIO-Wert **IGNORIERT** werden, da die I2C-Adresse entscheidend ist.

---

## 4. SHT31 Sensor-Registry

Aus `El Trabajante/src/models/sensor_registry.h`:

```cpp
// SHT31: Multi-value sensor (temp + humidity)
// I2C Address: 0x44
// device_type: "sht31"
// server_sensor_type: "sht31_temp" / "sht31_humidity"
```

### 4.1 Sensor-Data MQTT Topic
```
kaiser/god/esp/ESP_472204/sensor/{gpio}/data
```

### 4.2 Sensor-Data Payload Format (aus sensor_manager.cpp)
```json
{
  "esp_id": "ESP_472204",
  "zone_id": "",
  "subzone_id": "",
  "gpio": 0,
  "sensor_type": "sht31_temp",
  "raw": 12345,
  "value": 23.5,
  "unit": "°C",
  "quality": "good",
  "ts": 1770313761,
  "raw_mode": true,
  "i2c_address": 68
}
```

---

## 5. Diagnose

### 5.1 Warum gpio: 21 fehlschlug
| Check | Ergebnis |
|-------|----------|
| GPIO 21 Owner | `I2C_SDA` (vom I2CBusManager reserviert) |
| Konflikt-Typ | System-Reservierung beim Boot |
| Error-Code | 1002 GPIO_CONFLICT |

### 5.2 Warum gpio: 0 fehlschlug
| Check | Ergebnis |
|-------|----------|
| GPIO 0 Typ | ESP32 Bootstrap-Pin (Strapping Pin) |
| Problem | Boot Mode Selection - nicht für User-Sensoren |
| Error-Code | 1002 GPIO_CONFLICT |

### 5.3 Korrekte Lösung für SHT31

Für I2C-Sensoren wie SHT31:
1. **GPIO sollte NICHT für I2C-Sensoren spezifiziert werden** (oder ein Dummy-Wert)
2. **Die I2C-Adresse (0x44 für SHT31) ist entscheidend**
3. Der Code erkennt `is_i2c=true` aus der SensorCapability Registry

**Empfohlene Config-Payload:**
```json
{
  "sensors": [
    {
      "gpio": 21,  // I2C Bus GPIO (SDA) - wird NUR als Referenz verwendet
      "sensor_type": "temperature_sht31",
      "sensor_name": "SHT31 Temperature",
      "active": true
    }
  ]
}
```

**ABER:** Der aktuelle Code prüft GPIO-Verfügbarkeit VOR dem I2C-Check, was zu dem Fehler führt.

---

## 6. Bewertung

### 6.1 Firmware-Bug Identifiziert
**BUG-I2C-CONFIG-001:** GPIO-Validierung schlägt fehl für I2C-Sensoren

**Location:** `El Trabajante/src/main.cpp:2115-2131`

**Problem:** `configManager.validateSensorConfig()` prüft GPIO-Verfügbarkeit, bevor bekannt ist, ob es ein I2C-Sensor ist.

**Impact:** I2C-Sensoren können nicht via MQTT konfiguriert werden.

### 6.2 Sensor-Status
| Aspekt | Status |
|--------|--------|
| SHT31 konfiguriert | NEIN |
| Sensor-Daten gesendet | NEIN |
| I2C-Bus aktiv | JA (SDA=21, SCL=22, 100kHz) |
| I2C-Device-Scan | Nicht durchgeführt |

---

## 7. Empfehlungen

### 7.1 Kurzfristig (Workaround)
1. **I2C-Scan ausführen** um SHT31-Gerät zu verifizieren:
   ```json
   {"command": "i2c/scan", "params": {}, "timestamp": ...}
   ```

2. **Alternative GPIO-Werte testen:**
   - GPIO 99 oder 255 als "Dummy" für I2C-Sensoren
   - Prüfen ob validateSensorConfig() dies akzeptiert

### 7.2 Langfristig (Fix)
**Fix in `configManager.validateSensorConfig()`:**
- I2C-Sensoren von GPIO-Validierung ausnehmen
- Prüfung basierend auf `sensor_type` und SensorCapability Registry

---

## 8. Nächste Schritte

1. **Server-Side:** Config mit korrektem GPIO-Handling senden
2. **Firmware:** Bug BUG-I2C-CONFIG-001 beheben
3. **Test:** I2C-Scan durchführen um SHT31 Hardware zu verifizieren

---

**Report Ende**

*Erstellt von esp32-debug Agent*
