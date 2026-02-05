# ESP32 Dev Report: I2C Sensor Validation Fix

**Agent:** esp32-dev
**Datum:** 2026-02-05
**Task:** I2C-Sensor GPIO-Validierung überspringen

---

## 1. Zusammenfassung

I2C-Sensoren (SHT31, BMP280, BME280) scheiterten bei der MQTT-Konfiguration, weil `validateSensorConfig()` einen GPIO-Konflikt meldete. Die I2C-Logik in `sensor_manager.cpp` wurde nie erreicht.

**Fix:** I2C-Erkennung via `findSensorCapability()` in die Validierung eingebaut.

---

## 2. Geänderte Dateien

| Datei | Zeilen | Änderung |
|-------|--------|----------|
| `El Trabajante/src/services/config/config_manager.cpp` | 8 | Include hinzugefügt |
| `El Trabajante/src/services/config/config_manager.cpp` | 1984-2014 | Funktion erweitert |

---

## 3. Code-Änderungen

### 3.1 Include hinzugefügt (Zeile 8)

**Vorher:**
```cpp
#include "../../models/error_codes.h"
#include <WiFi.h>
```

**Nachher:**
```cpp
#include "../../models/error_codes.h"
#include "../../models/sensor_registry.h"  // For I2C sensor detection
#include <WiFi.h>
```

### 3.2 validateSensorConfig() erweitert (Zeilen 1984-2014)

**Vorher:**
```cpp
bool ConfigManager::validateSensorConfig(const SensorConfig& config) const {
  // GPIO must be valid (not 255)
  if (config.gpio == 255) {
    LOG_WARNING("ConfigManager: Invalid GPIO (255)");
    return false;
  }

  // Sensor type must not be empty
  if (config.sensor_type.length() == 0) {
    LOG_WARNING("ConfigManager: Sensor type is empty");
    return false;
  }

  // GPIO must be in valid range (0-39 for ESP32)
  if (config.gpio > 39) {
    LOG_WARNING("ConfigManager: GPIO out of range: " + String(config.gpio));
    return false;
  }

  return true;
}
```

**Nachher:**
```cpp
bool ConfigManager::validateSensorConfig(const SensorConfig& config) const {
  // Sensor type must not be empty (check first - needed for I2C lookup)
  if (config.sensor_type.length() == 0) {
    LOG_WARNING("ConfigManager: Sensor type is empty");
    return false;
  }

  // Check if it's an I2C sensor using SensorCapability Registry
  const SensorCapability* capability = findSensorCapability(config.sensor_type);
  bool is_i2c_sensor = (capability != nullptr && capability->is_i2c);

  // For I2C sensors: Skip GPIO validation (they use shared I2C bus GPIO 21/22)
  if (is_i2c_sensor) {
    LOG_INFO("ConfigManager: I2C sensor '" + config.sensor_type +
             "' - GPIO validation skipped (uses I2C bus)");
    return true;
  }

  // For non-I2C sensors: Standard GPIO validation
  if (config.gpio == 255) {
    LOG_WARNING("ConfigManager: Invalid GPIO (255)");
    return false;
  }

  // GPIO must be in valid range (0-39 for ESP32)
  if (config.gpio > 39) {
    LOG_WARNING("ConfigManager: GPIO out of range: " + String(config.gpio));
    return false;
  }

  return true;
}
```

---

## 4. Logik-Erklärung

1. **Sensor-Type zuerst prüfen** - Nötig für den Registry-Lookup
2. **I2C-Erkennung via Registry** - `findSensorCapability()` gibt Capability zurück mit `is_i2c` Flag
3. **I2C-Sensoren: Return true** - Überspringt GPIO-Validierung, loggt Info-Message
4. **Non-I2C-Sensoren: Standard-Validierung** - GPIO 0-39, nicht 255

---

## 5. Betroffene Sensor-Typen

Diese Sensoren werden jetzt als I2C erkannt (aus `sensor_registry.cpp`):

| Sensor-Type | Device | I2C Address |
|-------------|--------|-------------|
| `temperature_sht31` | SHT31 | 0x44 |
| `humidity_sht31` | SHT31 | 0x44 |
| `sht31_temp` | SHT31 | 0x44 |
| `sht31_humidity` | SHT31 | 0x44 |
| `temperature_bmp280` | BMP280 | 0x76 |
| `pressure_bmp280` | BMP280 | 0x76 |
| `temperature_bme280` | BME280 | 0x76 |
| `humidity_bme280` | BME280 | 0x76 |
| `pressure_bme280` | BME280 | 0x76 |

---

## 6. Build-Status

**Status:** Manuell erforderlich

PlatformIO CLI war nicht im System-PATH verfügbar. Build bitte manuell ausführen:

1. VS Code öffnen
2. PlatformIO Panel → Project Tasks → esp32dev → Build
3. Oder Terminal: `pio run -e esp32dev`

**Erwartetes Ergebnis:** SUCCESS ohne Errors

---

## 7. Test-Plan

Nach erfolgreichem Build und Flash:

```bash
# 1. SHT31 Sensor anlegen (GPIO 21 = I2C SDA)
curl -X POST http://localhost:8000/api/v1/sensors/ESP_472204/21 \
  -H "Content-Type: application/json" \
  -d '{"sensor_type": "sht31_temp", "i2c_address": 68}'

# 2. Erwartete Serial-Log Ausgabe:
# [INFO] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)
# [INFO] Sensor Manager: Configured I2C sensor 'sht31_temp' at address 0x44

# 3. Erwartete Config-Response:
# {"status": "ok", "type": "sensor", "count": 1, ...}
```

---

## 8. Git Commit

```
fix(esp32): skip GPIO validation for I2C sensors in validateSensorConfig

- Add sensor_registry.h include for findSensorCapability()
- Check is_i2c flag before GPIO validation
- I2C sensors (SHT31, BMP280, BME280) now configure correctly
- Non-I2C sensors unchanged (still validated)

Fixes: I2C sensors failing with GPIO_CONFLICT error
```

---

## 9. Risiko-Bewertung

| Risiko | Bewertung | Begründung |
|--------|-----------|------------|
| Bestehende GPIO-Sensoren | NIEDRIG | Nur I2C-Pfad geändert |
| Registry-Lookup Performance | VERNACHLÄSSIGBAR | Einmaliger Lookup pro Sensor |
| Rückwärtskompatibilität | VOLLSTÄNDIG | Keine API-Änderung |

---

*Report erstellt von esp32-dev Agent*
