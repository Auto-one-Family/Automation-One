# Bericht AUT-188 — Firmware-Verifikation FW-01/02/03

**Datum:** 2026-04-26
**Erstellt von:** Firmware-Spezialist (esp32-debug Agent)
**Commit-Stand:** ac5ca7b5f32766eea255b1d3a35dbb566a793ba4 (Fri Apr 24 02:05:55 2026 +0200)

---

## Executive Summary

- FW-01-A: IMPLEMENTIERT — `configureSensor()` priorisiert `config.i2c_address` via `effective_i2c_address`; `performMultiValueMeasurement()` liest direkt von `config->i2c_address`. Kein hartkodierter 0x44-Zugriff mehr auf Mess-Pfaden.
- FW-01-B: IMPLEMENTIERT — NVS-Key `sen_%d_i2c` existiert, wird bei Save und Load vollstaendig bedient; `configureSensor()` benutzt den geladenen Wert ueber `SensorConfig.i2c_address`.
- FW-02-A: IMPLEMENTIERT — GPIO-0-Guard ist zweifach umgesetzt: in `configureSensor()` (Registrierungsblock) und in `readRawAnalog()` (Mess-Block). Kein ungeschuetztes `analogRead` bei gpio=0 moeglich.
- FW-02-B: IMPLEMENTIERT — `containsKey("pin")` Pattern ist im OneWire-Scan-Command-Handler (main.cpp) vorhanden; kein OR-Fallback auf ungeprüften Default.
- FW-03: TEILWEISE — `removeActuator()` in actuator_manager.cpp loescht den Eintrag aus dem RAM und ruft `saveActuatorConfig()` mit dem verbleibenden Array (ohne das entfernte Element). `saveActuatorConfig()` schreibt nur neue Indizes mit neuen Keys, loescht aber **keine** alten NVS-Keys des letzten Slots explizit (kein `nvs_erase_key`). Bei Verkleinerung bleibt der ehemals letzte Slot als orphaned Key in NVS.

---

## FW-01-A — configureSensor() I2C-Adress-Priorisierung

### Status
IMPLEMENTIERT

### Code-Evidenz

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`
**Zeilen:** 285–299 (configureSensor — effective_i2c_address Logik)
**Commit:** 84a70ac3b3e7eb329bc16cf1789d35e1b6e8233d (Mon Apr 20 09:32:34 2026)

```cpp
// Use config.i2c_address if provided (multi-device support), fall back to capability default.
// This allows two SHT31 at 0x44 and 0x45 to be distinguished correctly.
uint8_t effective_i2c_address = config.i2c_address;
if (effective_i2c_address == 0 && capability != nullptr && capability->i2c_address != 0) {
    effective_i2c_address = capability->i2c_address;  // Fallback to registry default
}
```

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`
**Zeilen:** 1169–1177 (performMultiValueMeasurement — I2C-Adress-Nutzung)
**Commit:** 84a70ac3b3e7eb329bc16cf1789d35e1b6e8233d

```cpp
// Use config->i2c_address (stored at configure-time from MQTT payload) so that
// two SHT31 sensors at 0x44 and 0x45 each read from their correct physical device.
uint8_t device_addr = config->i2c_address;
size_t bytes_read = 0;

if (!i2c_bus_->readSensorRaw(device_type, device_addr, buffer, sizeof(buffer), bytes_read)) {
    LOG_E(TAG, "Sensor Manager: I2C read failed for " + device_type);
    return 0;
}
```

**Einschraenkung (performMeasurementForConfig — single-value Pfad):**
**Zeilen:** 826–832

```cpp
if (capability->is_i2c) {
    uint8_t buffer[6] = {0};
    uint8_t device_addr = capability->i2c_address;  // ← greift auf Capability-Default zurueck
    if (readRawI2C(gpio, device_addr, 0x00, buffer, 6)) {
```

Der Single-Value-I2C-Pfad in `performMeasurementForConfig()` (Zeile 828) verwendet noch `capability->i2c_address` statt `config->i2c_address`. Dieser Pfad wird fuer SHT31 im normalen Betrieb nicht durchlaufen (SHT31 ist `is_multi_value = true` und laeuft ueber `performMultiValueMeasurement()`), stellt aber ein latentes Risiko fuer zukuenftige Single-Value-I2C-Sensortypen dar.

### Begründung
Der Mess-Hauptpfad fuer Multi-Value-I2C-Sensoren (SHT31, BMP280, BME280) benutzt korrekt `config->i2c_address`. Die `configureSensor()`-Logik priorisiert `config.i2c_address` und faellt nur bei Wert 0 auf den Registry-Default zurueck. Ein zweiter SHT31 auf 0x45 wird korrekt angesprochen, sofern der MQTT-Payload `i2c_address: 69` mitliefert.

---

## FW-01-B — NVS-Key sen_{i}_i2c

### Status
IMPLEMENTIERT

### Code-Evidenz

**Datei:** `El Trabajante/src/services/config/config_manager.cpp`
**Zeile:** 1529 (Key-Definition)
**Commit:** 84a70ac3b3e7eb329bc16cf1789d35e1b6e8233d

```cpp
#define NVS_SEN_I2C        "sen_%d_i2c"      // sen_0_i2c = 10 chars ✅ (I2C device address)
```

**Zeilen:** 1859–1863 (Save-Pfad)

```cpp
// I2C Address: always write to NVS (including 0) to clear stale values pushed from server.
// A config-push with i2c_address=0 (non-I2C sensor) must overwrite any stale NVS value
// left from a previous I2C sensor on the same GPIO (e.g. SHT31 -> DS18B20 reconfiguration).
snprintf(key, sizeof(key), NVS_SEN_I2C, index);
success &= storageManager.putUInt8(key, config.i2c_address);
```

**Zeilen:** 2037–2040 (Load-Pfad)

```cpp
// I2C Address (SHT31-FIX: load persisted address for multi-device support)
// No legacy key — new feature. Default 0 = no I2C address stored (pre-fix firmware).
snprintf(new_key, sizeof(new_key), NVS_SEN_I2C, i);
config.i2c_address = storageManager.getUInt8(new_key, 0);
```

**Zeilen:** 1757–1766 (Dedup-Check in saveSensorConfig — i2c_address matching)

```cpp
// SHT31-FIX: For I2C sensors, additionally match i2c_address to distinguish
// multiple devices of same type at different addresses (e.g. 2x SHT31 at 0x44 and 0x45).
if (config.i2c_address != 0) {
    char i2cKey[16];
    snprintf(i2cKey, sizeof(i2cKey), NVS_SEN_I2C, i);
    uint8_t stored_i2c = storageManager.getUInt8(i2cKey, 0);
    if (stored_i2c != config.i2c_address) {
        continue;  // Different I2C device — skip
    }
}
```

### Begründung
Der Key `sen_%d_i2c` ist vollstaendig implementiert: Definition (Zeile 1529), Schreiben bei jedem saveSensorConfig-Aufruf (Zeile 1863), Lesen beim loadSensorConfig (Zeile 2040), und Verwendung beim Dedup-Match (Zeilen 1759-1765). Der geladene Wert landet in `config.i2c_address`, welcher in `configureSensor()` als `effective_i2c_address` aufgenommen wird. Die urspruengliche Behauptung (persistierter Wert wird ignoriert) ist im aktuellen Stand widerlegt.

---

## FW-02-A — GPIO-0-Guard (kein analogRead bei gpio=0)

### Status
IMPLEMENTIERT

### Code-Evidenz

**Guard 1 — Registrierungspfad in configureSensor():**
**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`
**Zeilen:** 273–283
**Commit:** 84a70ac3b3e7eb329bc16cf1789d35e1b6e8233d

```cpp
// Guard: gpio=0 is the backend convention for "no dedicated GPIO" (I2C bus sensors).
// Non-I2C sensors must NOT use gpio=0 — it is a boot strap pin and would trigger
// analogRead(0) on ADC2, which fails when WiFi is active.
if (config.gpio == 0 && !is_i2c_sensor) {
    LOG_E(TAG, "Sensor Manager: GPIO 0 rejected for non-I2C sensor '" +
          config.sensor_type + "' (boot strap pin, reserved for I2C bus convention)");
    errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                           "GPIO 0 invalid for non-I2C sensor");
    xSemaphoreGive(g_sensor_mutex);
    return false;
}
```

**Guard 2 — Messpfad in readRawAnalog():**
**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`
**Zeilen:** 1551–1556
**Commit:** 84a70ac3b3e7eb329bc16cf1789d35e1b6e8233d

```cpp
// Defense-in-depth: gpio=0 is the I2C bus convention, never a valid analog pin.
// Catches sensors stored in NVS from before the configureSensor() guard was added.
if (gpio == 0) {
    LOG_E(TAG, "readRawAnalog: GPIO 0 rejected (boot strap pin, I2C bus convention)");
    return 0;
}
```

**Einziger analogRead-Aufruf im Projekt:**
**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`
**Zeile:** 1572

```cpp
return analogRead(gpio);
```

Dieser Aufruf liegt ausschliesslich in `readRawAnalog()`, das durch den Guard auf Zeile 1553–1556 abgesichert ist. Der HAL-Layer (`esp32_gpio_hal.h:105`) definiert ebenfalls `::analogRead(gpio)`, wird aber nur ueber den HAL-Aufrufpfad erreicht, nicht direkt aus Sensor-Mess-Pfaden.

### Begründung
Der GPIO-0-Guard ist zweifach implementiert: am Eingang (Registrierung) und am Mess-Pfad (Defense-in-Depth fuer Legacy-NVS-Eintraege). Es gibt keinen erreichbaren `analogRead`-Aufruf ohne diese Guards. Alle Analog-Sensor-Typen (pH, EC, Moisture) werden vor dem `analogRead` ueber `readRawAnalog()` geleitet.

---

## FW-02-B — containsKey("pin") Pattern in OneWire-Config-Parsing

### Status
IMPLEMENTIERT

### Code-Evidenz

**Datei:** `El Trabajante/src/main.cpp`
**Zeilen:** 1303–1308
**Commit:** 705a060acb24c8d97eac19c4404d2835c3ea2094 (Tue Apr 21 10:28:56 2026)

```cpp
uint8_t pin = HardwareConfig::DEFAULT_ONEWIRE_PIN;
if (doc["params"].containsKey("pin")) {
    pin = doc["params"]["pin"].as<uint8_t>();
} else if (doc.containsKey("pin")) {
    pin = doc["pin"].as<uint8_t>();
}
```

### Begründung
Das Pattern verwendet `containsKey("pin")` in zwei Ebenen: zuerst in `doc["params"]` (der bevorzugte, strukturierte Pfad), dann als Fallback in `doc` selbst (Legacy-Kompatibilitaet). Nur wenn kein Key gefunden wird, bleibt `pin` auf dem sicheren Default `HardwareConfig::DEFAULT_ONEWIRE_PIN`. Ein stilles Fallback auf einen falschen GPIO durch fehlendes `pin`-Feld im JSON ist damit ausgeschlossen. Das OR-Fallback-Pattern (das den Default auch bei ungueltigem Payload verwendet haette) ist nicht mehr vorhanden.

---

## FW-03 — removeActuatorConfig() NVS-Loesch-Pfad

### Status
TEILWEISE

### Code-Evidenz

**Datei:** `El Trabajante/src/services/actuator/actuator_manager.cpp`
**Zeilen:** 363–400 (removeActuator — vollstaendige Funktion)
**Commit:** 84a70ac3b3e7eb329bc16cf1789d35e1b6e8233d

```cpp
bool ActuatorManager::removeActuator(uint8_t gpio) {
    RegisteredActuator* actuator = findActuator(gpio);
    if (!actuator) { return false; }

    // ... stop driver, zero-out in RAM ...
    actuator->in_use = false;
    actuator->gpio = 255;
    actuator->config = ActuatorConfig();
    actuator_count_ = actuator_count_ > 0 ? actuator_count_ - 1 : 0;

    // Phase 7: Persist removal to NVS immediately (save remaining actuators)
    ActuatorConfig actuators[MAX_ACTUATORS];
    uint8_t count = 0;
    for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
        if (actuators_[i].in_use) {
            actuators[count++] = actuators_[i].config;
        }
    }
    if (!configManager.saveActuatorConfig(actuators, count)) {
        LOG_E(TAG, "Actuator Manager: Failed to persist config to NVS");
    }
    return true;
}
```

**Datei:** `El Trabajante/src/services/config/config_manager.cpp`
**Zeilen:** 2300–2366 (saveActuatorConfig — Schreib-Logik)

```cpp
bool success = storageManager.putUInt8(NVS_ACT_COUNT, actuator_count);
// ...
for (uint8_t i = 0; i < actuator_count; i++) {
    snprintf(key, sizeof(key), NVS_ACT_GPIO, i);
    success &= storageManager.putUInt8(key, config.gpio);
    // ... weitere Keys act_%d_* fuer i = 0 bis actuator_count-1 ...
}
// KEIN nvs_erase_key / eraseKey fuer den letzten Slot
```

### Begründung
`removeActuator()` baut ein kompaktiertes Array aus verbleibenden Aktoren und schreibt es via `saveActuatorConfig()` neu. Der NVS-Count wird korrekt auf `count` (= alter Count minus 1) gesetzt. Die Werte fuer Slots `0` bis `count-1` werden ueberschrieben. Jedoch werden die Keys des letzten Slots (`act_{count}_gpio`, `act_{count}_type`, usw.) — also genau des entfernten Aktors — nicht explizit geloescht. Da NVS-Keys persistent sind bis zum expliziten Loeschen, bleibt der Slot als orphaned Entry im Flash. Beim naechsten `loadActuatorConfig()` wird der Count korrekt eingelesen (kleiner als zuvor), sodass der verwaiste Slot nie geladen wird. Das Problem ist daher funktional zunaechst unsichtbar, akkumuliert sich aber bei wiederholten Add/Remove-Zyklen und kann den NVS-Namespace voll schreiben.

### Empfehlung
Nach dem Re-Save der verbleibenden Aktoren den letzten Slot explizit loeschen:
```cpp
// Nach saveActuatorConfig(actuators, count):
// Loesche Keys des ehemals letzten Slots um NVS-Akkumulation zu verhindern
char cleanup_key[16];
const char* act_keys[] = {
    NVS_ACT_GPIO, NVS_ACT_AUX, NVS_ACT_TYPE, NVS_ACT_NAME,
    NVS_ACT_SZ, NVS_ACT_ACTIVE, NVS_ACT_CRIT, NVS_ACT_INV,
    NVS_ACT_DEF_ST, NVS_ACT_DEF_PWM
};
for (auto& fmt : act_keys) {
    snprintf(cleanup_key, sizeof(cleanup_key), fmt, count);  // count = neuer Count = alter letzter Index
    storageManager.eraseKey(cleanup_key);
}
```
Prio: MEDIUM (funktionale Korrektheit gewahrt, NVS-Wachstum bei vielen Cycles problematisch).

---

## Anhang: Konsultierte Dateien

| Pfad | Zweck |
|------|-------|
| `El Trabajante/src/models/sensor_registry.cpp` | SHT31/BMP280/BME280 Capability-Definitionen (i2c_address 0x44) |
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | configureSensor(), performMultiValueMeasurement(), readRawAnalog(), GPIO-Guards |
| `El Trabajante/src/services/config/config_manager.cpp` | NVS-Key-Definitionen (NVS_SEN_I2C, NVS_ACT_*), saveSensorConfig(), loadSensorConfig(), saveActuatorConfig() |
| `El Trabajante/src/services/actuator/actuator_manager.cpp` | removeActuator() |
| `El Trabajante/src/main.cpp` | OneWire-Scan-Command-Handler (containsKey-Pattern) |

---

## Folge-Empfehlungen

- FW-01-A: Zeile 828 in `performMeasurementForConfig()` (Single-Value-I2C-Pfad) sollte `config->i2c_address` verwenden statt `capability->i2c_address` — Prio MEDIUM (kein SHT31-Impact heute, aber Risiko fuer neue Single-Value-I2C-Typen)
- FW-03: Explizites Loeschen des letzten NVS-Slots nach `saveActuatorConfig()` bei Aktor-Entfernung implementieren — Prio MEDIUM (NVS-Akkumulation verhindert langfristig stabile Deployments)
