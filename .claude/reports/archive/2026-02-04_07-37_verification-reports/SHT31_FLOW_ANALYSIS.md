# SHT31 End-to-End Flow Analyse

> **Analyst:** Claude Code
> **Datum:** 2026-02-04
> **Projekt:** AutomationOne Framework
> **Komponente:** SHT31 I2C Temperature & Humidity Sensor

---

## 1. Executive Summary

### Status-Übersicht

| Komponente | Status | Details |
|------------|--------|---------|
| **ESP32 I2C Bus** | ✅ VOLLSTÄNDIG | Hardware Abstraction Layer implementiert |
| **ESP32 SHT31 Registry** | ✅ REGISTRIERT | `sht31_temp`, `sht31_humidity` mit Multi-Value Support |
| **ESP32 SHT31 Driver** | ❌ NICHT IMPLEMENTIERT | `temp_sensor_sht31.cpp` ist LEER |
| **Server Sensor Libraries** | ✅ VOLLSTÄNDIG | `SHT31TemperatureProcessor`, `SHT31HumidityProcessor` |
| **Server Type Registry** | ✅ VOLLSTÄNDIG | Multi-Value Mapping implementiert |
| **MQTT Integration** | ✅ BEREIT | Topic-Format und Handler vorhanden |
| **Datenbank-Schema** | ✅ VOLLSTÄNDIG | Multi-Value Support mit separaten Einträgen |
| **Adafruit_SHT31 Library** | ❌ FEHLT | Nicht in `platformio.ini` |

### Ist ein Quick-Test möglich?

**NEIN** - Der ESP32 SHT31-Driver ist nicht implementiert. Die Firmware kann SHT31-Hardware nicht auslesen.

### Kritische Lücken

1. **ESP32 Driver Code fehlt** - `temp_sensor_sht31.cpp/h` sind leere Dateien
2. **Library-Abhängigkeit fehlt** - `Adafruit_SHT31` nicht in `platformio.ini`
3. **Kein I2C-Sensor-Reading-Code** - `performI2CMeasurement()` ist nur Skeleton

---

## 2. ESP32 Firmware Findings

### 2.1 I2C-Bus Management

**Status:** ✅ VOLLSTÄNDIG IMPLEMENTIERT

| Aspekt | ESP32-WROOM-32 | XIAO ESP32-C3 |
|--------|----------------|---------------|
| **SDA Pin** | GPIO 21 | GPIO 4 |
| **SCL Pin** | GPIO 22 | GPIO 5 |
| **Frequenz** | 100 kHz | 100 kHz |
| **Initialisierung** | `Wire.begin(21, 22, 100000)` | `Wire.begin(4, 5, 100000)` |

**Dateien:**
- [i2c_bus.h](El%20Trabajante/src/drivers/i2c_bus.h)
- [i2c_bus.cpp](El%20Trabajante/src/drivers/i2c_bus.cpp)
- [esp32_dev.h](El%20Trabajante/src/config/hardware/esp32_dev.h)
- [xiao_esp32c3.h](El%20Trabajante/src/config/hardware/xiao_esp32c3.h)

**I2C Bus Manager Features:**
```cpp
bool begin()                              // Init mit GPIO-Reservierung
void end()                                // Deinitialisierung + Pin-Release
bool scanBus(uint8_t[], size_t)           // I2C Adress-Scan (0x08-0x77)
bool isDevicePresent(uint8_t address)     // Einzelgeräte-Prüfung
bool readRaw(addr, reg, buffer, len)      // Raw-Daten lesen
bool writeRaw(addr, reg, data, len)       // Raw-Daten schreiben
bool recoverBus()                         // Bus Recovery (9 Clock Pulses)
```

**Bus Recovery:**
- Max 3 Versuche pro 60-Sekunden-Fenster
- Prozedur: `Wire.end()` → 9 SCL Pulses → STOP Condition → `Wire.begin()`

### 2.2 SHT31 Driver

**Status:** ❌ NICHT IMPLEMENTIERT

| Datei | Status | Zeilen |
|-------|--------|--------|
| `temp_sensor_sht31.h` | LEER | 1 |
| `temp_sensor_sht31.cpp` | LEER | 1 |
| `i2c_sensor_generic.h` | LEER | 1 |
| `i2c_sensor_generic.cpp` | LEER | 1 |
| `isensor_driver.h` | LEER | 1 |

**Fazit:** ALLE Sensor-Driver-Dateien in `El Trabajante/src/services/sensor/sensor_drivers/` sind LEER.

### 2.3 Sensor-Type String Mapping

**ESP32 Registry** ([sensor_registry.cpp](El%20Trabajante/src/models/sensor_registry.cpp)):

| ESP32 sensor_type | Server sensor_type | Device Type | I2C Address | Multi-Value |
|-------------------|-------------------|-------------|-------------|-------------|
| `temperature_sht31` | `sht31_temp` | `sht31` | 0x44 | ✓ |
| `humidity_sht31` | `sht31_humidity` | `sht31` | 0x44 | ✓ |
| `sht31_temp` | `sht31_temp` | `sht31` | 0x44 | ✓ |
| `sht31_humidity` | `sht31_humidity` | `sht31` | 0x44 | ✓ |

**Multi-Value Device Definition:**
```cpp
MultiValueDevice MULTI_VALUE_DEVICES[] = {
    {
        device_type: "sht31",
        value_types: {"sht31_temp", "sht31_humidity", nullptr, nullptr},
        value_count: 2
    }
}
```

### 2.4 SensorConfig Struktur (ESP32)

**Datei:** [sensor_types.h](El%20Trabajante/src/models/sensor_types.h)

```cpp
struct SensorConfig {
  uint8_t gpio = 255;                       // GPIO-Pin (SDA für I2C)
  String sensor_type = "";                  // "sht31_temp" oder "sht31_humidity"
  String sensor_name = "";                  // User-definierter Name
  String subzone_id = "";                   // Subzone-Zuordnung
  bool active = false;                      // Sensor aktiv?
  String operating_mode = "continuous";     // "continuous", "on_demand", etc.
  uint32_t measurement_interval_ms = 30000; // 30 Sekunden Default
  bool raw_mode = true;                     // IMMER true (Server-Centric)
  uint32_t last_raw_value = 0;              // Letzter Rohdaten-Wert
  unsigned long last_reading = 0;           // Timestamp
  String onewire_address = "";              // Leer für I2C
};
```

**WICHTIG:** `i2c_address` wird NICHT in SensorConfig gespeichert - es wird aus der Registry abgerufen!

### 2.5 Fehlende Dependencies

**platformio.ini aktuell:**
```ini
lib_deps =
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.3
    arduino-libraries/NTPClient@^3.2.1
    paulstoffregen/OneWire@^2.3.7
    milesburton/DallasTemperature@^3.11.0
    WebServer
    DNSServer
    adafruit/Adafruit Unified Sensor@^1.1.9    # ESP32_DEV only
    adafruit/Adafruit BME280 Library@^2.2.2    # ESP32_DEV only
```

**FEHLT:**
```ini
    adafruit/Adafruit SHT31 Library@^2.2.0     # <-- MUSS HINZUGEFÜGT WERDEN
```

---

## 3. Server-Side Findings

### 3.1 Sensor Libraries

**Verzeichnis:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`

| Datei | Processor Klasse | Sensor Type | Status |
|-------|------------------|-------------|--------|
| `temperature.py` | `DS18B20Processor` | `ds18b20` | ✅ |
| `temperature.py` | `SHT31TemperatureProcessor` | `sht31_temp` | ✅ |
| `humidity.py` | `SHT31HumidityProcessor` | `sht31_humidity` | ✅ |
| `pressure.py` | `BMP280PressureProcessor` | `bmp280_pressure` | ✅ |
| `pressure.py` | `BMP280TemperatureProcessor` | `bmp280_temp` | ✅ |
| `ph_sensor.py` | `PHSensorProcessor` | `ph` | ✅ |
| `ec_sensor.py` | `ECSensorProcessor` | `ec` | ✅ |
| `moisture.py` | `MoistureSensorProcessor` | `moisture` | ✅ |
| `co2.py` | `CO2Processor` | `mhz19_co2`, `scd30_co2` | ✅ |
| `light.py` | `LightProcessor` | `light` | ✅ |
| `flow.py` | `FlowProcessor` | `flow` | ✅ |

**SHT31 Temperature Processor Specs:**
- Range: -40°C bis +125°C
- Auflösung: 0.01°C
- Genauigkeit: ±0.2°C (0-65°C)
- Operating Mode: `continuous` (30s Intervall)

**SHT31 Humidity Processor Specs:**
- Range: 0-100% RH
- Auflösung: 0.01% RH
- Genauigkeit: ±2% RH (20-80% @ 25°C)
- Kondensations-Warnung: >95% RH
- Operating Mode: `continuous` (30s Intervall)

### 3.2 Type-Registry

**Datei:** [sensor_type_registry.py](El%20Servador/god_kaiser_server/src/sensors/sensor_type_registry.py)

**SENSOR_TYPE_MAPPING (vollständig):**
```python
SENSOR_TYPE_MAPPING = {
    # SHT31 variants
    "temperature_sht31": "sht31_temp",
    "humidity_sht31": "sht31_humidity",
    "sht31_temp": "sht31_temp",          # Already normalized
    "sht31_humidity": "sht31_humidity",  # Already normalized

    # DS18B20 variants
    "temperature_ds18b20": "ds18b20",
    "ds18b20": "ds18b20",                # Already normalized

    # BMP280 variants
    "pressure_bmp280": "bmp280_pressure",
    "temperature_bmp280": "bmp280_temp",
    "bmp280_pressure": "bmp280_pressure",
    "bmp280_temp": "bmp280_temp",

    # pH sensor
    "ph_sensor": "ph",
    "ph": "ph",

    # EC sensor
    "ec_sensor": "ec",
    "ec": "ec",

    # Moisture sensor
    "moisture": "moisture",

    # CO2 sensors
    "mhz19_co2": "mhz19_co2",
    "scd30_co2": "scd30_co2",

    # Light sensor
    "light": "light",
    "tsl2561": "light",
    "bh1750": "light",

    # Flow sensor
    "flow": "flow",
    "yfs201": "flow",
}
```

**MULTI_VALUE_SENSORS:**
```python
{
    "sht31": {
        "device_type": "i2c",
        "device_address": 0x44,              # oder 0x45
        "values": [
            {"sensor_type": "sht31_temp", "name": "Temperature", "unit": "°C"},
            {"sensor_type": "sht31_humidity", "name": "Humidity", "unit": "%RH"},
        ],
        "i2c_pins": {"sda": 21, "scl": 22},
    },
}
```

**Normalisierungsfunktion:**
```python
def normalize_sensor_type(sensor_type: str) -> str:
    return SENSOR_TYPE_MAPPING.get(sensor_type, sensor_type)
```

---

## 4. MQTT Communication

### 4.1 Topic-Format

**Sensor-Daten (ESP32 → Server):**
```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
```

**Beispiel:**
```
kaiser/god/esp/ESP_12AB34CD/sensor/21/data
```

**Pi-Enhanced Response (Server → ESP32):**
```
kaiser/{kaiser_id}/esp/{esp_id}/pi_enhanced/response
```

### 4.2 Payload-Beispiel (basierend auf Code)

> **WICHTIG:** SHT31 sendet **bereits konvertierte Werte** (°C und %RH), KEINE skalierten Integer!
> Die Adafruit_SHT31 Library auf dem ESP32 konvertiert die Rohdaten bereits.
> Dies unterscheidet sich von DS18B20, das optional 12-bit RAW-Werte senden kann.

**SHT31 Temperature Payload:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "zone_id": "zone_greenhouse_a",
  "subzone_id": "subzone_01",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "raw": 23.5,
  "ts": 1735818000,
  "raw_mode": true
}
```

**SHT31 Humidity Payload:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "zone_id": "zone_greenhouse_a",
  "subzone_id": "subzone_01",
  "gpio": 21,
  "sensor_type": "sht31_humidity",
  "raw": 65.0,
  "ts": 1735818000,
  "raw_mode": true
}
```

**WICHTIG:**
1. Zwei separate MQTT-Nachrichten pro SHT31-Messung!
2. `raw` enthält bereits °C bzw. %RH (NICHT skalierte Integer wie 2350)
3. Server-Processor erwartet `raw_value` als float in physikalischer Einheit

### 4.3 Multi-Value Topic Handling

```
SHT31 auf GPIO 21:
├─ Topic: kaiser/god/esp/ESP_12AB34CD/sensor/21/data
│  └─ Payload mit sensor_type="sht31_temp"
│
└─ Topic: kaiser/god/esp/ESP_12AB34CD/sensor/21/data  (gleiches Topic!)
   └─ Payload mit sensor_type="sht31_humidity"
```

**Server-seitiger Lookup:**
```python
# 3-way lookup für I2C Multi-Value Sensoren:
sensor_config = await sensor_repo.get_by_esp_gpio_and_type(
    esp_device.id, gpio, sensor_type  # Unterscheidung durch sensor_type!
)
```

### 4.4 Pi-Enhanced Trigger

**Bedingungen (alle müssen erfüllt sein):**
1. `sensor_config` existiert in DB
2. `sensor_config.pi_enhanced = True`
3. `payload.raw_mode = True`

**Processing Flow:**
```
ESP32                              Server
  │                                   │
  ├─► MQTT Publish ──────────────────►│
  │   (raw_mode=true)                 │
  │                                   ├─► normalize_sensor_type()
  │                                   ├─► LibraryLoader.get_processor()
  │                                   ├─► processor.process(raw_value)
  │                                   ├─► Save to SensorData
  │                                   ├─► WebSocket Broadcast
  │                                   └─► Logic Engine Trigger
  │                                   │
  │◄── MQTT Publish (optional) ───────┤
  │   pi_enhanced/response            │
```

---

## 5. Konfiguration-Schritte

### 5.1 Server-seitig

**API-Endpoint:** `POST /api/v1/sensors/{esp_id}/{gpio}`

**Payload für SHT31 Temperature:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "name": "Gewächshaus Temperatur",
  "enabled": true,
  "interval_ms": 30000,
  "processing_mode": "pi_enhanced",
  "interface_type": "I2C",
  "i2c_address": 68,
  "provides_values": ["sht31_temp", "sht31_humidity"],
  "threshold_min": -40.0,
  "threshold_max": 125.0,
  "warning_min": 15.0,
  "warning_max": 35.0
}
```

**Payload für SHT31 Humidity (zweiter API-Call):**
```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 21,
  "sensor_type": "sht31_humidity",
  "name": "Gewächshaus Luftfeuchtigkeit",
  "enabled": true,
  "interval_ms": 30000,
  "processing_mode": "pi_enhanced",
  "interface_type": "I2C",
  "i2c_address": 68,
  "provides_values": ["sht31_temp", "sht31_humidity"],
  "threshold_min": 0.0,
  "threshold_max": 100.0,
  "warning_min": 40.0,
  "warning_max": 80.0
}
```

### 5.2 ESP32-seitig

**Aktuell nicht möglich** - Driver nicht implementiert.

**Erwarteter Flow (wenn implementiert):**
1. Config empfangen via MQTT (`kaiser/god/esp/{esp_id}/config/sensor/{gpio}`)
2. SensorManager registriert Sensor-Config
3. SensorManager ruft `I2CBus::begin()` auf
4. Periodisches Reading mit `performMultiValueMeasurement()`
5. MQTT Publish mit zwei Payloads (Temp + Humidity)

---

## 6. Identifizierte Lücken

### Lücke 1: ESP32 SHT31 Driver

**Was fehlt:**
- Implementation von `temp_sensor_sht31.cpp/h`
- I2C-Kommunikation mit SHT31 (Register 0x2C06 für Single-Shot)
- Conversion von Raw-Daten zu physikalischen Werten

**Wo implementieren:**
- `El Trabajante/src/services/sensor/sensor_drivers/temp_sensor_sht31.cpp`
- `El Trabajante/src/services/sensor/sensor_drivers/temp_sensor_sht31.h`

**Aufwand:** ~200-300 Zeilen Code

### Lücke 2: Adafruit_SHT31 Library

**Was fehlt:**
- Library-Abhängigkeit in `platformio.ini`

**Fix:**
```ini
lib_deps =
    ...
    adafruit/Adafruit SHT31 Library@^2.2.0
```

**Aufwand:** 1 Zeile

### Lücke 3: SensorManager I2C Integration

**Was fehlt:**
- `performI2CMeasurement()` ruft keine Driver auf
- Multi-Value Reading für I2C nicht vollständig

**Wo implementieren:**
- `El Trabajante/src/services/sensor/sensor_manager.cpp`
- Methode `performMultiValueMeasurement()` erweitern

**Aufwand:** ~50-100 Zeilen Code

### Lücke 4: ISensorDriver Interface

**Was fehlt:**
- Abstraktes Interface für alle Sensor-Driver

**Wo implementieren:**
- `El Trabajante/src/services/sensor/sensor_drivers/isensor_driver.h`

**Aufwand:** ~30 Zeilen Code

---

## 7. Hardware-Verkabelung (für Robin)

### ESP32-WROOM-32

```
SHT31          ESP32-WROOM-32
-----          --------------
VCC    ───────► 3.3V
GND    ───────► GND
SDA    ───────► GPIO 21 (I2C SDA)
SCL    ───────► GPIO 22 (I2C SCL)
ADDR   ───────► GND (Adresse 0x44) oder VCC (Adresse 0x45)
```

### XIAO ESP32-C3

```
SHT31          XIAO ESP32-C3
-----          -------------
VCC    ───────► 3.3V
GND    ───────► GND
SDA    ───────► GPIO 4 (I2C SDA)
SCL    ───────► GPIO 5 (I2C SCL)
ADDR   ───────► GND (Adresse 0x44) oder VCC (Adresse 0x45)
```

### I2C Pull-Up Resistoren

**Standard:** 4.7kΩ Pull-Up auf SDA und SCL zu 3.3V

> **Hinweis:** Viele SHT31 Breakout-Boards haben bereits Pull-Ups integriert. Bei mehreren I2C-Geräten am Bus ggf. externe Pull-Ups entfernen.

---

## 8. Quick-Test Anleitung

### Aktueller Status: NICHT MÖGLICH

**Grund:** ESP32 SHT31-Driver nicht implementiert.

### Nach Driver-Implementierung:

1. **Hardware anschließen:**
   - SHT31 an I2C-Bus (SDA/SCL wie oben)
   - ADDR-Pin auf GND für Adresse 0x44

2. **Firmware flashen:**
   ```bash
   cd "El Trabajante"
   pio run -t upload
   ```

3. **I2C-Scan prüfen (Serial Monitor):**
   ```
   I2C Bus Scan:
     Device found at 0x44 (SHT31)
   ```

4. **Server-Sensor-Konfiguration:**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/sensors/ESP_XXXXXX/21" \
     -H "Content-Type: application/json" \
     -d '{"sensor_type":"sht31_temp","name":"Test SHT31","interface_type":"I2C","i2c_address":68}'
   ```

5. **MQTT Daten beobachten:**
   ```bash
   mosquitto_sub -t "kaiser/god/esp/+/sensor/21/data" -v
   ```

6. **Erwartete Ausgabe:**
   ```json
   {"esp_id":"ESP_XXXXXX","gpio":21,"sensor_type":"sht31_temp","raw":23.5,"ts":1735818000,"raw_mode":true}
   {"esp_id":"ESP_XXXXXX","gpio":21,"sensor_type":"sht31_humidity","raw":65.0,"ts":1735818000,"raw_mode":true}
   ```
   > **Hinweis:** `raw` enthält bereits °C bzw. %RH (konvertiert durch Adafruit_SHT31 Library)

---

## 9. Datenbank-Schema

### SensorConfig Tabelle (Multi-Value)

```sql
-- Zwei Einträge für einen SHT31 Sensor:

-- Eintrag 1: Temperature
INSERT INTO sensor_config (
  id, esp_id, gpio, sensor_type, sensor_name,
  interface_type, i2c_address, provides_values,
  pi_enhanced, sample_interval_ms
) VALUES (
  'uuid-1', 'esp-uuid', 21, 'sht31_temp', 'GH Temp',
  'I2C', 68, '["sht31_temp", "sht31_humidity"]',
  true, 30000
);

-- Eintrag 2: Humidity
INSERT INTO sensor_config (
  id, esp_id, gpio, sensor_type, sensor_name,
  interface_type, i2c_address, provides_values,
  pi_enhanced, sample_interval_ms
) VALUES (
  'uuid-2', 'esp-uuid', 21, 'sht31_humidity', 'GH Humidity',
  'I2C', 68, '["sht31_temp", "sht31_humidity"]',
  true, 30000
);
```

### SensorData Tabelle (Time-Series)

```sql
-- Zwei Rows pro SHT31-Messung:
-- HINWEIS: raw_value = processed_value für SHT31 (bereits konvertiert durch Adafruit Library)

INSERT INTO sensor_data (
  esp_id, gpio, sensor_type, raw_value, processed_value, unit, quality, timestamp
) VALUES
  ('esp-uuid', 21, 'sht31_temp', 23.5, 23.5, '°C', 'good', NOW()),
  ('esp-uuid', 21, 'sht31_humidity', 65.0, 65.0, '%RH', 'good', NOW());
```

### Unique Constraint

```sql
UNIQUE (esp_id, gpio, sensor_type, onewire_address)
```

Erlaubt:
- Mehrere `sensor_type` auf gleichem GPIO (Multi-Value)
- Gleicher `sensor_type` auf verschiedenen GPIOs

---

## 10. Architektur-Diagramm

```
┌─────────────────────────────────────────────────────────────────────┐
│                           HARDWARE                                   │
├─────────────────────────────────────────────────────────────────────┤
│  SHT31 Sensor (I2C Address 0x44)                                    │
│  ├─ Temperature: -40°C to +125°C                                    │
│  └─ Humidity: 0% to 100% RH                                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ I2C (SDA/SCL)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ESP32 (El Trabajante)                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────┐                       │
│  │   I2C Bus       │◄───│  SensorManager   │                       │
│  │   Manager       │    │                  │                       │
│  │  (GPIO 21/22)   │    │  Multi-Value:    │                       │
│  └────────┬────────┘    │  ├─ sht31_temp   │                       │
│           │             │  └─ sht31_humidity                       │
│           │             └────────┬─────────┘                       │
│           │                      │                                  │
│           │  ❌ MISSING:         │                                  │
│           │  SHT31 Driver        ▼                                  │
│           │                ┌──────────────┐                        │
│           │                │ MQTT Client  │                        │
│           │                │              │                        │
│           │                │ Topic:       │                        │
│           │                │ .../sensor/21/data                    │
│           │                └──────┬───────┘                        │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │
                                    │ MQTT (raw_mode=true)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Server (El Servador)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  MQTT Subscriber │───►│  Sensor Handler  │───►│  DB Write    │  │
│  │  .../sensor/+/data    │                  │    │  SensorData  │  │
│  └──────────────────┘    │  Pi-Enhanced:    │    └──────────────┘  │
│                          │  ├─ SHT31TempProc│                      │
│                          │  └─ SHT31HumProc │    ┌──────────────┐  │
│                          └─────────┬────────┘───►│  WebSocket   │  │
│                                    │             │  Broadcast   │  │
│                                    │             └──────────────┘  │
│                                    ▼                               │
│                          ┌──────────────────┐                      │
│                          │  Logic Engine    │                      │
│                          │  (Automation)    │                      │
│                          └──────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket / REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Frontend (El Frontend)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐                      │
│  │  Sensor Cards    │◄───│  WebSocket       │                      │
│  │  ├─ Temperature  │    │  Real-time       │                      │
│  │  └─ Humidity     │    │  Updates         │                      │
│  └──────────────────┘    └──────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Nächste Schritte (Priorisiert)

### Prio 1: Adafruit Library hinzufügen
```ini
# platformio.ini
lib_deps =
    ...
    adafruit/Adafruit SHT31 Library@^2.2.0
```

### Prio 2: SHT31 Driver implementieren
- `temp_sensor_sht31.h` - Interface definieren
- `temp_sensor_sht31.cpp` - I2C-Kommunikation implementieren
- Methoden: `begin()`, `readTemperature()`, `readHumidity()`, `readBoth()`

### Prio 3: SensorManager Integration
- `performI2CMeasurement()` für SHT31 erweitern
- Multi-Value MQTT Publishing implementieren

### Prio 4: Testing
- Unit-Tests für Driver
- Integration-Test mit echter Hardware
- End-to-End Test mit Server

---

## 12. Referenz-Dateien

| Komponente | Dateipfad |
|------------|-----------|
| I2C Bus | `El Trabajante/src/drivers/i2c_bus.cpp` |
| Sensor Registry | `El Trabajante/src/models/sensor_registry.cpp` |
| Sensor Manager | `El Trabajante/src/services/sensor/sensor_manager.cpp` |
| SHT31 Driver (LEER) | `El Trabajante/src/services/sensor/sensor_drivers/temp_sensor_sht31.cpp` |
| Server Type Registry | `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` |
| Temperature Processor | `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py` |
| Humidity Processor | `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/humidity.py` |
| Sensor Handler | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| DB Model | `El Servador/god_kaiser_server/src/db/models/sensor.py` |
| API Endpoints | `El Servador/god_kaiser_server/src/api/v1/sensors.py` |

---

*Initiale Analyse abgeschlossen am 2026-02-04*

---

## 13. Vertiefungsanalyse: Datenbank-Schema (Komplett)

> **Aktualisiert:** 2026-02-04 | **Phase:** Vertiefung

### 13.1 sensor_configs Tabelle - Vollständige Spalten

| Spalte | Typ | Nullable | Default | Beschreibung |
|--------|-----|----------|---------|--------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary Key |
| `esp_id` | UUID | NO | - | Foreign Key → `esp_devices.id` (CASCADE DELETE) |
| `gpio` | INTEGER | YES | - | GPIO-Pin (nullable für I2C/OneWire Bus-Devices) |
| `sensor_type` | VARCHAR(50) | NO | - | Sensor-Typ (z.B. `sht31_temp`, `sht31_humidity`) |
| `sensor_name` | VARCHAR(100) | NO | - | Menschenlesbarer Name |
| `interface_type` | VARCHAR(20) | NO | `'ANALOG'` | Interface: `I2C`, `ONEWIRE`, `ANALOG`, `DIGITAL` |
| `i2c_address` | INTEGER | YES | - | I2C-Adresse (0x08-0x77, dezimal 8-119) |
| `onewire_address` | VARCHAR(16) | YES | - | OneWire ROM-Code (16 Hex-Chars) |
| `provides_values` | JSON | YES | - | Multi-Value Types: `["sht31_temp", "sht31_humidity"]` |
| `enabled` | BOOLEAN | NO | `TRUE` | Sensor aktiv |
| `pi_enhanced` | BOOLEAN | NO | `TRUE` | Server-seitige Verarbeitung aktiviert |
| `sample_interval_ms` | INTEGER | NO | `1000` | Abtastintervall (ms) |
| `calibration_data` | JSON | YES | - | Kalibrier-Parameter |
| `thresholds` | JSON | YES | - | Alert-Schwellwerte |
| `sensor_metadata` | JSON | NO | `{}` | Zusätzliche Metadaten |
| `operating_mode` | VARCHAR(20) | YES | - | Override: `continuous`, `on_demand`, `scheduled`, `paused` |
| `timeout_seconds` | INTEGER | YES | - | Timeout Override |
| `timeout_warning_enabled` | BOOLEAN | YES | - | Timeout-Warnung Override |
| `schedule_config` | JSON | YES | - | Scheduled Mode Config |
| `last_manual_request` | DATETIME | YES | - | Letzter On-Demand-Request |
| `config_status` | VARCHAR(20) | YES | `'pending'` | ESP32 Config-Status: `pending`, `applied`, `failed` |
| `config_error` | VARCHAR(50) | YES | - | Error-Code bei Failure |
| `config_error_detail` | VARCHAR(200) | YES | - | Detaillierte Fehlermeldung |
| `created_at` | DATETIME | NO | - | Erstellungszeitpunkt |
| `updated_at` | DATETIME | NO | - | Aktualisierungszeitpunkt |

**Unique Constraint:**
```sql
UNIQUE (esp_id, gpio, sensor_type, onewire_address)
```

**Indizes:**
- `idx_sensor_type_enabled` auf `(sensor_type, enabled)`
- `idx_i2c_address` auf `i2c_address`
- Standard FK-Index auf `esp_id`

### 13.2 sensor_data Tabelle - Time-Series

| Spalte | Typ | Nullable | Default | Beschreibung |
|--------|-----|----------|---------|--------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary Key |
| `esp_id` | UUID | NO | - | Foreign Key → `esp_devices.id` (CASCADE DELETE) |
| `gpio` | INTEGER | NO | - | GPIO-Pin |
| `sensor_type` | VARCHAR(50) | NO | - | Sensor-Typ |
| `raw_value` | FLOAT | NO | - | Rohwert (z.B. 2350 für 23.5°C) |
| `processed_value` | FLOAT | YES | - | Verarbeiteter Wert (z.B. 23.5) |
| `unit` | VARCHAR(20) | YES | - | Einheit (`°C`, `%RH`, etc.) |
| `processing_mode` | VARCHAR(20) | NO | - | `raw`, `pi_enhanced`, `local` |
| `quality` | VARCHAR(20) | YES | - | `good`, `fair`, `poor`, `error` |
| `timestamp` | DATETIME | NO | `now()` | Messzeitpunkt |
| `sensor_metadata` | JSON | YES | - | Zusätzliche Metadaten |
| `data_source` | VARCHAR(20) | NO | `'production'` | `production`, `mock`, `test`, `simulation` |

**Time-Series Indizes:**
```sql
idx_esp_gpio_timestamp (esp_id, gpio, timestamp)
idx_sensor_type_timestamp (sensor_type, timestamp)
idx_timestamp_desc (timestamp DESC)
idx_data_source_timestamp (data_source, timestamp)
```

### 13.3 Relevante Alembic Migrations

| Migration | Beschreibung |
|-----------|--------------|
| `001_add_multi_value_sensor_support.py` | Interface-Type, I2C-Adresse, OneWire-Adresse, provides_values |
| `fix_sensor_unique_constraint_multivalue.py` | Unique Constraint für Multi-Value |
| `fix_sensor_unique_constraint_onewire.py` | Unique Constraint für OneWire |
| `add_sensor_operating_modes.py` | Operating Mode Felder |
| `ee8733fb484d_add_config_status_fields...` | Config Status, Error, Error Detail |
| `add_data_source_field.py` | Data Source Tracking |

---

## 14. Config-Push Mechanismus (Server → ESP32)

### 14.1 Trigger-Punkte (Code-Referenzen)

| Trigger | Datei:Zeile | Automatisch |
|---------|-------------|-------------|
| Sensor-Erstellung | [sensors.py:485-500](El%20Servador/god_kaiser_server/src/api/v1/sensors.py#L485-L500) | ✅ JA |
| Sensor-Update | [sensors.py:485-500](El%20Servador/god_kaiser_server/src/api/v1/sensors.py#L485-L500) | ✅ JA |
| Sensor-Löschung | [sensors.py:572-586](El%20Servador/god_kaiser_server/src/api/v1/sensors.py#L572-L586) | ✅ JA |
| Manueller Push | **EXISTIERT NICHT** | ❌ NEIN |

**Flow bei Sensor-Erstellung:**
```
1. POST /api/v1/sensors/{esp_id}/{gpio}
2. → sensors.py:create_or_update_sensor()
3.   → DB Insert/Update
4.   → config_builder.build_combined_config(esp_id, db)
5.   → esp_service.send_config(esp_id, combined_config)
6.     → publisher.publish_config(esp_id, config)
7.       → MQTT Publish: kaiser/god/esp/{esp_id}/config
```

### 14.2 Config-Topic & Payload Format

**Topic:**
```
kaiser/{kaiser_id}/esp/{esp_id}/config
```

**Beispiel:**
```
kaiser/god/esp/ESP_12AB34CD/config
```

**Payload (aus [config_builder.py](El%20Servador/god_kaiser_server/src/services/config_builder.py)):**
```json
{
  "sensors": [
    {
      "sensor_name": "GH Temperatur",
      "sensor_type": "sht31_temp",
      "gpio": 21,
      "active": true,
      "sample_interval_ms": 30000,
      "subzone_id": "subzone_01",
      "raw_mode": true
    },
    {
      "sensor_name": "GH Luftfeuchtigkeit",
      "sensor_type": "sht31_humidity",
      "gpio": 21,
      "active": true,
      "sample_interval_ms": 30000,
      "subzone_id": "subzone_01",
      "raw_mode": true
    }
  ],
  "actuators": [],
  "timestamp": 1735818000,
  "correlation_id": "uuid-xxx"
}
```

**WICHTIG:** Multi-Value Sensoren werden als **separate Einträge** im `sensors`-Array gepusht!

### 14.3 ESP32 Config-Subscription

**Datei:** [main.cpp:724-725](El%20Trabajante/src/main.cpp#L724-L725)

```cpp
String config_topic = TopicBuilder::buildConfigTopic();
mqttClient.subscribe(config_topic);
```

**Config-Callback:** [main.cpp:758-764](El%20Trabajante/src/main.cpp#L758-L764)

```cpp
String config_topic = String(TopicBuilder::buildConfigTopic());
if (topic == config_topic) {
  handleSensorConfig(payload);
  handleActuatorConfig(payload);
  return;
}
```

### 14.4 Config-Response (ESP32 → Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config/response`

**Payload:**
```json
{
  "status": "applied",
  "correlation_id": "uuid-xxx",
  "sensor_count": 2,
  "actuator_count": 0,
  "errors": []
}
```

Oder bei Fehler:
```json
{
  "status": "failed",
  "correlation_id": "uuid-xxx",
  "error_code": "GPIO_CONFLICT",
  "error_detail": "GPIO 21 already used by actuator"
}
```

---

## 15. Sensor-Handler & Pi-Enhanced Processing (Vertieft)

### 15.1 Handler-Flow im Detail

**Datei:** [sensor_handler.py](El%20Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py)

```
ESP32 MQTT Publish (sensor/21/data)
          │
          ▼
┌─────────────────────────────────┐
│  SensorDataHandler.handle_sensor_data()  │
│  [sensor_handler.py:79]         │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  1. Topic parsen               │
│  2. Payload validieren         │
│  3. ESP Device lookup          │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  4. Sensor-Config Lookup       │
│  sensor_repo.get_by_esp_gpio_and_type()  │
│  [sensor_handler.py:177-179]    │
│  → 3-way lookup (esp_id, gpio, sensor_type)  │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  5. Pi-Enhanced Check          │
│  if sensor_config.pi_enhanced AND raw_mode:  │
│  [sensor_handler.py:199]        │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  6. Processor Aufruf           │
│  _trigger_pi_enhanced_processing()  │
│  [sensor_handler.py:565-666]    │
│  → LibraryLoader.get_processor() │
│  → processor.process(raw_value)  │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  7. DB Save                    │
│  sensor_repo.save_data()       │
│  [sensor_handler.py:259-273]    │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  8. WebSocket Broadcast        │
│  ws_manager.broadcast("sensor_data", {...})  │
│  [sensor_handler.py:297-308]    │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  9. Logic Engine Trigger       │
│  (async, non-blocking)         │
│  [sensor_handler.py:312-334]    │
└─────────────────────────────────┘
```

### 15.2 Library-Loader Details

**Datei:** [library_loader.py](El%20Servador/god_kaiser_server/src/sensors/library_loader.py)

**Processor-Lookup:**
```python
def get_processor(self, sensor_type: str) -> Optional[BaseSensorProcessor]:
    # Normalize sensor type (ESP32 → Server Processor)
    normalized_type = normalize_sensor_type(sensor_type)  # "sht31_temp" → "sht31_temp"

    processor = self.processors.get(normalized_type)
    return processor
```

**Registrierte Prozessoren (aus [temperature.py](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py)):**

| Klasse | sensor_type | Unit | Range |
|--------|-------------|------|-------|
| `DS18B20Processor` | `ds18b20` | °C | -55 bis +125 |
| `SHT31TemperatureProcessor` | `sht31_temp` | °C | -40 bis +125 |

**Aus [humidity.py](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/humidity.py):**

| Klasse | sensor_type | Unit | Range |
|--------|-------------|------|-------|
| `SHT31HumidityProcessor` | `sht31_humidity` | %RH | 0 bis 100 |

### 15.3 Sensor-Type Registry

**Datei:** [sensor_type_registry.py](El%20Servador/god_kaiser_server/src/sensors/sensor_type_registry.py)

**Type-Mapping (ESP32 → Server) - Vollständig:**
```python
# Siehe Sektion 3.2 für vollständiges SENSOR_TYPE_MAPPING
# SHT31-relevante Einträge:
SENSOR_TYPE_MAPPING = {
    "temperature_sht31": "sht31_temp",   # ESP32 format → Server processor
    "humidity_sht31": "sht31_humidity",  # ESP32 format → Server processor
    "sht31_temp": "sht31_temp",          # Already normalized
    "sht31_humidity": "sht31_humidity",  # Already normalized
    # ... (37 Einträge insgesamt, siehe sensor_type_registry.py)
}
```

**Multi-Value Definition:**
```python
MULTI_VALUE_SENSORS = {
    "sht31": {
        "device_type": "i2c",
        "device_address": 0x44,
        "values": [
            {"sensor_type": "sht31_temp", "name": "Temperature", "unit": "°C"},
            {"sensor_type": "sht31_humidity", "name": "Humidity", "unit": "%RH"},
        ],
        "i2c_pins": {"sda": 21, "scl": 22},
    },
}
```

---

## 16. Sensor Repository - Query Methoden

**Datei:** [sensor_repo.py](El%20Servador/god_kaiser_server/src/db/repositories/sensor_repo.py)

### 16.1 Multi-Value Sensor Lookup

```python
# Standard 3-way lookup für Multi-Value
async def get_by_esp_gpio_and_type(
    self, esp_id: uuid.UUID, gpio: int, sensor_type: str
) -> Optional[SensorConfig]:
    """
    Get sensor by ESP ID, GPIO, AND sensor_type.
    For SHT31: distinguishes sht31_temp from sht31_humidity on same GPIO.
    """
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio,
        SensorConfig.sensor_type == sensor_type  # ← KRITISCH!
    )
```

### 16.2 I2C-Adress Lookup

```python
async def get_by_i2c_address(
    self, esp_id: uuid.UUID, i2c_address: int
) -> Optional[SensorConfig]:
    """Check for I2C address conflicts."""
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.interface_type == "I2C",
        SensorConfig.i2c_address == i2c_address
    )
```

---

## 17. Frontend sensorDefaults.ts - SHT31 Status

**Datei:** [sensorDefaults.ts](El%20Frontend/src/utils/sensorDefaults.ts)

### 17.1 Vorhandene SHT31 Einträge

✅ **`sht31_temp`** (Zeile 191-204):
```typescript
'sht31_temp': {
  label: 'Temperatur',
  unit: '°C',
  min: -40,
  max: 125,
  decimals: 1,
  icon: 'Thermometer',
  defaultValue: 22.0,
  category: 'temperature',
  recommendedMode: 'continuous',
  recommendedTimeout: 180,
}
```

⚠️ **`sht31_humidity`** FEHLT! Nur `SHT31_humidity` (Großbuchstaben) vorhanden (Zeile 206-220):
```typescript
'SHT31_humidity': {  // ← Großschreibung!
  label: 'Luftfeuchtigkeit (SHT31)',
  unit: '% RH',
  ...
}
```

### 17.2 MULTI_VALUE_DEVICES Registry

✅ Vollständig vorhanden (Zeile 505-517):
```typescript
MULTI_VALUE_DEVICES = {
  sht31: {
    deviceType: 'sht31',
    label: 'SHT31 (Temp + Humidity)',
    sensorTypes: ['sht31_temp', 'sht31_humidity'],
    values: [
      { key: 'temp', sensorType: 'sht31_temp', label: 'Temperatur', unit: '°C', order: 1 },
      { key: 'humidity', sensorType: 'sht31_humidity', label: 'Luftfeuchtigkeit', unit: '% RH', order: 2 }
    ],
    icon: 'Thermometer',
    interface: 'i2c',
    i2cAddress: '0x44'
  }
}
```

---

## 18. Kritische Checkpunkte - Ergebnisse

| Checkpoint | Status | Details |
|------------|--------|---------|
| DB Unique Constraint | ✅ | `(esp_id, gpio, sensor_type, onewire_address)` - Multi-Value erlaubt |
| Config-Push Timing | ✅ | Automatisch nach API-Call (create/update/delete) |
| Multi-Value Handling | ✅ | 2 separate API-Calls für SHT31 (temp + humidity) |
| ESP32 Config-Subscription | ✅ | [main.cpp:725](El%20Trabajante/src/main.cpp#L725) subscribes auf config topic |
| I2C-Address in Config | ❓ | NICHT im Config-Payload (wird aus Registry geholt) |
| Frontend sensor_type | ⚠️ | `sht31_humidity` fehlt (nur `SHT31_humidity` uppercase) |

---

## 19. Vervollständigte Implementierungs-Checkliste

### ESP32 (El Trabajante) - KRITISCH

- [ ] **`platformio.ini`**: Adafruit SHT31 Library hinzufügen
  ```ini
  lib_deps =
      adafruit/Adafruit SHT31 Library@^2.2.0
  ```

- [ ] **`temp_sensor_sht31.h/cpp`**: SHT31 Driver implementieren
  - Methoden: `begin()`, `readTemperatureRaw()`, `readHumidityRaw()`, `readBoth()`
  - Rohdaten-Konvertierung für `raw_mode=true`

- [ ] **`sensor_manager.cpp`**: I2C-Sensor Reading integrieren
  - `performI2CMeasurement()` erweitern
  - Multi-Value MQTT Publish (2 Messages für SHT31)

- [ ] **Config-Handler**: I2C-Adresse aus Server-Config extrahieren
  - Aktuell: I2C-Adresse aus Registry (hardcoded 0x44)
  - Verbesserung: I2C-Adresse aus Config-Payload nutzen

### Server (El Servador) - KEINE ÄNDERUNGEN NÖTIG ✅

- [x] **Sensor Models**: Multi-Value Support vorhanden
- [x] **Sensor Repository**: 3-way Lookup implementiert
- [x] **Config Builder**: Multi-Value Config Push
- [x] **Sensor Handler**: Pi-Enhanced Processing
- [x] **Library Loader**: SHT31 Processors registriert
- [x] **Type Registry**: SHT31 Mapping definiert

### Frontend (El Frontend) - MINOR

- [ ] **`sensorDefaults.ts`**: `sht31_humidity` (lowercase) hinzufügen
  ```typescript
  'sht31_humidity': {
    label: 'Luftfeuchtigkeit (SHT31)',
    unit: '% RH',
    min: 0,
    max: 100,
    decimals: 1,
    icon: 'Droplets',
    defaultValue: 50.0,
    category: 'air',
    recommendedMode: 'continuous',
    recommendedTimeout: 180,
  }
  ```

---

## 20. Test-Szenario (Manueller End-to-End Test)

### 20.1 Voraussetzungen
- Server läuft auf `localhost:8000`
- MQTT Broker läuft auf `localhost:1883`
- ESP32 mit SHT31 auf GPIO 21/22 angeschlossen
- Hardware-Test bestätigt: I2C-Scan findet 0x44

### 20.2 Schritt 1: Sensoren via API anlegen

**SHT31 Temperature:**
```bash
curl -X POST "http://localhost:8000/api/v1/sensors/ESP_12AB34CD/21" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "esp_id": "ESP_12AB34CD",
    "gpio": 21,
    "sensor_type": "sht31_temp",
    "name": "GH Temperatur",
    "enabled": true,
    "interval_ms": 30000,
    "processing_mode": "pi_enhanced",
    "interface_type": "I2C",
    "i2c_address": 68,
    "provides_values": ["sht31_temp", "sht31_humidity"]
  }'
```

**SHT31 Humidity (2. API-Call!):**
```bash
curl -X POST "http://localhost:8000/api/v1/sensors/ESP_12AB34CD/21" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "esp_id": "ESP_12AB34CD",
    "gpio": 21,
    "sensor_type": "sht31_humidity",
    "name": "GH Luftfeuchtigkeit",
    "enabled": true,
    "interval_ms": 30000,
    "processing_mode": "pi_enhanced",
    "interface_type": "I2C",
    "i2c_address": 68,
    "provides_values": ["sht31_temp", "sht31_humidity"]
  }'
```

### 20.3 Schritt 2: MQTT Config-Push beobachten

```bash
mosquitto_sub -h localhost -t "kaiser/god/esp/ESP_12AB34CD/config" -v
```

**Erwartete Ausgabe:**
```json
{
  "sensors": [
    {"sensor_type": "sht31_temp", "gpio": 21, "active": true, ...},
    {"sensor_type": "sht31_humidity", "gpio": 21, "active": true, ...}
  ],
  "actuators": [],
  "timestamp": 1735818000
}
```

### 20.4 Schritt 3: Sensor-Daten beobachten

```bash
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/21/data" -v
```

**Erwartete Ausgabe (nach ESP32 Driver-Implementierung):**
```json
{"esp_id":"ESP_12AB34CD","gpio":21,"sensor_type":"sht31_temp","raw":23.5,"raw_mode":true,"ts":1735818000}
{"esp_id":"ESP_12AB34CD","gpio":21,"sensor_type":"sht31_humidity","raw":65.0,"raw_mode":true,"ts":1735818000}
```
> **Hinweis:** `raw` enthält bereits °C bzw. %RH - Adafruit_SHT31 Library konvertiert die Werte

### 20.5 Schritt 4: DB-Einträge prüfen

```sql
-- Sensor Configs
SELECT id, gpio, sensor_type, interface_type, i2c_address
FROM sensor_configs
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'ESP_12AB34CD');

-- Sensor Data
SELECT sensor_type, raw_value, processed_value, unit, quality, timestamp
FROM sensor_data
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'ESP_12AB34CD')
ORDER BY timestamp DESC LIMIT 10;
```

---

*Vertiefungsanalyse abgeschlossen am 2026-02-04*

---

## 21. Server-seitige Library-Implementierung (Vollständig)

> **Aktualisiert:** 2026-02-04 | **Phase:** Vertiefung - Library Details

### 21.1 Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Pi-Enhanced Processing Pipeline                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  sensor_handler.py                                                       │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  library_loader.py                                               │    │
│  │       │                                                          │    │
│  │       ├─► normalize_sensor_type("temperature_sht31")             │    │
│  │       │       → sensor_type_registry.py                          │    │
│  │       │       → Returns: "sht31_temp"                            │    │
│  │       │                                                          │    │
│  │       └─► self.processors.get("sht31_temp")                      │    │
│  │               → Returns: SHT31TemperatureProcessor instance      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  base_processor.py                                               │    │
│  │       │                                                          │    │
│  │       ├─► ProcessingResult (Dataclass)                           │    │
│  │       ├─► ValidationResult (Dataclass)                           │    │
│  │       └─► BaseSensorProcessor (ABC)                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  sensor_libraries/active/                                        │    │
│  │       │                                                          │    │
│  │       ├─► temperature.py                                         │    │
│  │       │       └─► SHT31TemperatureProcessor                      │    │
│  │       │                                                          │    │
│  │       └─► humidity.py                                            │    │
│  │               └─► SHT31HumidityProcessor                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 21.2 Base Processor Abstract Class

**Datei:** [base_processor.py](El%20Servador/god_kaiser_server/src/sensors/base_processor.py)

```python
@dataclass
class ProcessingResult:
    """Result of sensor data processing."""
    value: float           # Processed value (e.g., 23.5 für Temperatur)
    unit: str              # Unit (e.g., "°C", "%RH")
    quality: str           # "good", "fair", "poor", "error"
    metadata: Optional[Dict[str, Any]] = None  # Warnings, calibration info

@dataclass
class ValidationResult:
    """Result of sensor data validation."""
    valid: bool                          # Value within range?
    error: Optional[str] = None          # Error message
    warnings: Optional[list[str]] = None # Non-fatal warnings


class BaseSensorProcessor(ABC):
    """Abstract Base Class für alle Sensor-Prozessoren."""

    # Operating Mode Recommendations (überschreibbar)
    RECOMMENDED_MODE: str = "continuous"
    RECOMMENDED_TIMEOUT_SECONDS: int = 180
    RECOMMENDED_INTERVAL_SECONDS: int = 30
    SUPPORTS_ON_DEMAND: bool = False

    @abstractmethod
    def process(self, raw_value, calibration, params) -> ProcessingResult:
        """Convert raw value to physical measurement."""
        pass

    @abstractmethod
    def validate(self, raw_value) -> ValidationResult:
        """Check if raw value is within acceptable range."""
        pass

    @abstractmethod
    def get_sensor_type(self) -> str:
        """Return sensor type identifier (e.g., 'sht31_temp')."""
        pass

    def calibrate(self, calibration_points, method="linear") -> Dict[str, Any]:
        """Perform sensor calibration (optional)."""
        raise NotImplementedError()

    def get_default_params(self) -> Dict[str, Any]:
        """Get default processing parameters."""
        return {}

    def get_value_range(self) -> Dict[str, float]:
        """Get expected physical value range."""
        return {"min": float("-inf"), "max": float("inf")}
```

### 21.3 SHT31TemperatureProcessor (Vollständig)

**Datei:** [temperature.py:392-647](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py#L392-L647)

| Attribut | Wert | Beschreibung |
|----------|------|--------------|
| **sensor_type** | `sht31_temp` | LibraryLoader Lookup Key |
| **TEMP_MIN** | -40.0 | °C (physikalisches Minimum) |
| **TEMP_MAX** | 125.0 | °C (physikalisches Maximum) |
| **TEMP_TYPICAL_MIN** | 0.0 | °C (Genauigkeitsbereich Start) |
| **TEMP_TYPICAL_MAX** | 65.0 | °C (Genauigkeitsbereich Ende) |
| **RESOLUTION** | 0.01 | °C (typische Auflösung) |
| **RECOMMENDED_MODE** | `continuous` | Automatische Messungen |
| **RECOMMENDED_TIMEOUT_SECONDS** | 180 | Sekunden (3 Minuten) |
| **RECOMMENDED_INTERVAL_SECONDS** | 30 | Sekunden |
| **SUPPORTS_ON_DEMAND** | `False` | Kein manueller Trigger |

> **Hinweis:** Genauigkeit ±0.2°C (0-65°C) ist im Docstring dokumentiert, aber KEIN Klassenattribut.

**Processing Flow:**
```python
def process(self, raw_value, calibration=None, params=None) -> ProcessingResult:
    # 1. Validate raw value
    validation = self.validate(raw_value)
    if not validation.valid:
        return ProcessingResult(value=0.0, unit="°C", quality="error", ...)

    # 2. Apply calibration offset (if provided)
    temp_celsius = raw_value
    if calibration and "offset" in calibration:
        temp_celsius += calibration["offset"]

    # 3. Unit conversion (optional: Celsius → Fahrenheit)
    unit_type = params.get("unit", "celsius").lower() if params else "celsius"
    if unit_type == "fahrenheit":
        value = temp_celsius * 9/5 + 32
        unit_str = "°F"
    else:
        value = temp_celsius
        unit_str = "°C"

    # 4. Round to decimal places (default: 1)
    decimal_places = params.get("decimal_places", 1) if params else 1
    value = round(value, decimal_places)

    # 5. Quality assessment
    quality = self._assess_quality(temp_celsius, calibrated)

    return ProcessingResult(value=value, unit=unit_str, quality=quality, ...)
```

**Quality Assessment (VERIFIZIERT):**
```python
def _assess_quality(self, temp_celsius: float, calibrated: bool) -> str:
    # Error: Außerhalb physikalischer Grenzen (-40 bis +125°C)
    if temp_celsius < self.TEMP_MIN or temp_celsius > self.TEMP_MAX:
        return "error"

    # Good: Innerhalb typischer Genauigkeit (0-65°C)
    if self.TEMP_TYPICAL_MIN <= temp_celsius <= self.TEMP_TYPICAL_MAX:
        return "good"

    # Fair: Außerhalb typischem Bereich aber innerhalb absoluter Grenzen
    return "fair"
```

**Quality-Levels (nur 3!):**
| Temperatur | Quality |
|------------|---------|
| < -40°C oder > 125°C | `error` |
| -40°C bis 0°C | `fair` |
| 0°C bis 65°C | `good` |
| 65°C bis 125°C | `fair` |

### 21.4 SHT31HumidityProcessor (Vollständig)

**Datei:** [humidity.py:22-328](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/humidity.py#L22-L328)

| Attribut | Wert | Beschreibung |
|----------|------|--------------|
| **sensor_type** | `sht31_humidity` | LibraryLoader Lookup Key |
| **HUMIDITY_MIN** | 0.0 | %RH (physikalisches Minimum) |
| **HUMIDITY_MAX** | 100.0 | %RH (physikalisches Maximum) |
| **HUMIDITY_TYPICAL_MIN** | 20.0 | %RH (Genauigkeitsbereich Start) |
| **HUMIDITY_TYPICAL_MAX** | 80.0 | %RH (Genauigkeitsbereich Ende) |
| **RESOLUTION** | 0.01 | %RH (typische Auflösung) |
| **CONDENSATION_THRESHOLD** | 95.0 | %RH (Kondensations-Warnung) |
| **LOW_THRESHOLD** | 5.0 | %RH (Verdächtig niedrig) |
| **RECOMMENDED_MODE** | `continuous` | Automatische Messungen |
| **RECOMMENDED_TIMEOUT_SECONDS** | 180 | Sekunden (3 Minuten) |
| **RECOMMENDED_INTERVAL_SECONDS** | 30 | Sekunden |
| **SUPPORTS_ON_DEMAND** | `False` | Kein manueller Trigger |

> **Hinweis:** Genauigkeit ±2% RH (20-80% @ 25°C) ist im Docstring dokumentiert, aber KEIN Klassenattribut.

**Processing Flow:**
```python
def process(self, raw_value, calibration=None, params=None) -> ProcessingResult:
    # 1. Validate raw value (0-100% RH)
    validation = self.validate(raw_value)
    if not validation.valid:
        return ProcessingResult(value=0.0, unit="%RH", quality="error", ...)

    # 2. Apply calibration offset (if provided)
    humidity = raw_value
    if calibration and "offset" in calibration:
        humidity += calibration["offset"]

    # 3. Clamp to valid range (0-100%)
    humidity = max(0.0, min(100.0, humidity))

    # 4. Round to decimal places (default: 1)
    humidity = round(humidity, params.get("decimal_places", 1))

    # 5. Quality assessment
    quality = self._assess_quality(humidity)

    # 6. Condensation warning (>95% RH)
    if humidity > 95.0:
        metadata["warnings"].append("High humidity may indicate condensation")

    return ProcessingResult(value=humidity, unit="%RH", quality=quality, ...)
```

**Quality Assessment (VERIFIZIERT):**
```python
def _assess_quality(self, humidity: float, calibrated: bool) -> str:
    # Error: Außerhalb physikalischer Grenzen (0-100%)
    if humidity < self.HUMIDITY_MIN or humidity > self.HUMIDITY_MAX:
        return "error"

    # Poor: Extremwerte (<5% oder >95%)
    if humidity < self.LOW_THRESHOLD or humidity > self.CONDENSATION_THRESHOLD:
        return "poor"

    # Good: Innerhalb typischer Genauigkeit (20-80% RH)
    if self.HUMIDITY_TYPICAL_MIN <= humidity <= self.HUMIDITY_TYPICAL_MAX:
        return "good"

    # Fair: Außerhalb typischer Genauigkeit aber akzeptabel
    return "fair"
```

**Quality-Levels (4 Stufen):**
| Luftfeuchtigkeit | Quality |
|------------------|---------|
| < 0% oder > 100% | `error` |
| 0-5% oder 95-100% | `poor` |
| 5-20% oder 80-95% | `fair` |
| 20-80% | `good` |

**Calibration (Salt Solutions):**
```python
def calibrate(self, calibration_points, method="offset") -> Dict[str, Any]:
    """
    Salt solution calibration:
    - MgCl2: 33% RH @ 25°C
    - NaCl:  75% RH @ 25°C
    - KCl:   85% RH @ 25°C
    """
    if method != "offset":
        raise ValueError("Only 'offset' method supported for SHT31 humidity")

    # Calculate average offset from calibration points
    total_offset = sum(p["reference"] - p["raw"] for p in calibration_points)
    average_offset = total_offset / len(calibration_points)

    return {"offset": average_offset, "method": "offset"}
```

### 21.5 LibraryLoader - Dynamisches Laden

**Datei:** [library_loader.py](El%20Servador/god_kaiser_server/src/sensors/library_loader.py)

**Initialisierung (Singleton):**
```python
class LibraryLoader:
    _instance = None
    _initialized = False

    def __init__(self):
        if self._initialized:
            return

        self.processors: Dict[str, BaseSensorProcessor] = {}
        self.library_path = Path(__file__).parent / "sensor_libraries" / "active"

        # Dynamisches Laden aller Prozessoren
        self._discover_libraries()

        # Log: "LibraryLoader initialized with 12 processors:
        #       [bmp280_pressure, bmp280_temp, ds18b20, ec, flow, light,
        #        mhz19_co2, moisture, ph, scd30_co2, sht31_humidity, sht31_temp]"
```

**Processor Lookup (mit Type-Normalisierung):**
```python
def get_processor(self, sensor_type: str) -> Optional[BaseSensorProcessor]:
    # 1. Normalize: "temperature_sht31" → "sht31_temp"
    normalized_type = normalize_sensor_type(sensor_type)

    # 2. Lookup in processor dict
    processor = self.processors.get(normalized_type)

    if processor is None:
        logger.warning(f"No processor for: {sensor_type} (normalized: {normalized_type})")

    return processor
```

**Verfügbare SHT31 Prozessoren nach Init:**

| sensor_type | Processor Klasse | Modul |
|-------------|------------------|-------|
| `sht31_temp` | `SHT31TemperatureProcessor` | `temperature.py` |
| `sht31_humidity` | `SHT31HumidityProcessor` | `humidity.py` |

### 21.6 Integration im Sensor-Handler

**Datei:** [sensor_handler.py:565-666](El%20Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py#L565-L666)

```python
async def _trigger_pi_enhanced_processing(
    self,
    sensor_config: SensorConfig,
    raw_value: float
) -> Optional[ProcessingResult]:
    """
    Pi-Enhanced Verarbeitung für eingehende Rohdaten.
    """
    # 1. Get LibraryLoader instance (Singleton)
    loader = LibraryLoader.get_instance()

    # 2. Get processor for sensor type
    processor = loader.get_processor(sensor_config.sensor_type)
    if not processor:
        logger.error(f"No processor for {sensor_config.sensor_type}")
        return None

    # 3. Get calibration from DB config
    calibration = sensor_config.calibration_data  # JSON field

    # 4. Process raw value
    result = processor.process(
        raw_value=raw_value,
        calibration=calibration,
        params=processor.get_default_params()
    )

    # 5. Log result
    logger.info(
        f"Pi-Enhanced: {sensor_config.sensor_type} "
        f"raw={raw_value} → {result.value} {result.unit} ({result.quality})"
    )

    return result
```

### 21.7 Server-seitige Implementierung - Status

| Komponente | Status | Bemerkung |
|------------|--------|-----------|
| `BaseSensorProcessor` | ✅ VOLLSTÄNDIG | ABC mit allen Methoden |
| `ProcessingResult` | ✅ VOLLSTÄNDIG | Dataclass für Ergebnisse |
| `ValidationResult` | ✅ VOLLSTÄNDIG | Dataclass für Validierung |
| `SHT31TemperatureProcessor` | ✅ VOLLSTÄNDIG | -40°C bis +125°C |
| `SHT31HumidityProcessor` | ✅ VOLLSTÄNDIG | 0-100% RH, Kondensations-Warnung |
| `sensor_type_registry.py` | ✅ VOLLSTÄNDIG | Type-Normalisierung + Multi-Value |
| `library_loader.py` | ✅ VOLLSTÄNDIG | Dynamisches Laden, Singleton |
| `sensor_handler.py` | ✅ VOLLSTÄNDIG | Pi-Enhanced Trigger |

**FAZIT:** Die Server-seitige Library-Implementierung für SHT31 ist **100% vollständig**.
Der einzige Blocker für End-to-End-Tests ist der **fehlende ESP32 SHT31-Driver**.

---

## 22. Code-Review Verifizierung

> **Datum:** 2026-02-04 | **Reviewer:** Claude Code

### 22.1 Geprüfte Dateien

| Datei | Zeilen | Status | Notizen |
|-------|--------|--------|---------|
| [temperature.py](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py) | 647 | ✅ VERIFIZIERT | DS18B20 + SHT31Temperature |
| [humidity.py](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/humidity.py) | 328 | ✅ VERIFIZIERT | SHT31Humidity |
| [base_processor.py](El%20Servador/god_kaiser_server/src/sensors/base_processor.py) | 250 | ✅ VERIFIZIERT | ABC + Dataclasses |
| [library_loader.py](El%20Servador/god_kaiser_server/src/sensors/library_loader.py) | 311 | ✅ VERIFIZIERT | Singleton + Dynamic Loading |
| [sensor_type_registry.py](El%20Servador/god_kaiser_server/src/sensors/sensor_type_registry.py) | 294 | ✅ VERIFIZIERT | Type Mapping + Multi-Value |

### 22.2 Korrigierte Fehler in dieser Dokumentation

| Sektion | Fehler | Korrektur |
|---------|--------|-----------|
| 21.3 | `ACCURACY` als Klassenattribut | Entfernt - nur Docstring |
| 21.3 | Quality `"poor"` für SHT31Temp | Entfernt - nur 3 Levels: error/good/fair |
| 21.3 | Attribut-Namen inkonsistent | `RECOMMENDED_TIMEOUT_SECONDS` statt `RECOMMENDED_TIMEOUT` |
| 21.4 | `ACCURACY` als Klassenattribut | Entfernt - nur Docstring |
| 21.4 | Attribut-Namen inkonsistent | `RECOMMENDED_TIMEOUT_SECONDS` statt `RECOMMENDED_TIMEOUT` |

### 22.3 Verifizierte Klassenattribute

**SHT31TemperatureProcessor (temperature.py:392-647):**
```python
RECOMMENDED_MODE = "continuous"
RECOMMENDED_TIMEOUT_SECONDS = 180
RECOMMENDED_INTERVAL_SECONDS = 30
SUPPORTS_ON_DEMAND = False
TEMP_MIN = -40.0
TEMP_MAX = 125.0
TEMP_TYPICAL_MIN = 0.0
TEMP_TYPICAL_MAX = 65.0
RESOLUTION = 0.01
```

**SHT31HumidityProcessor (humidity.py:22-328):**
```python
RECOMMENDED_MODE = "continuous"
RECOMMENDED_TIMEOUT_SECONDS = 180
RECOMMENDED_INTERVAL_SECONDS = 30
SUPPORTS_ON_DEMAND = False
HUMIDITY_MIN = 0.0
HUMIDITY_MAX = 100.0
HUMIDITY_TYPICAL_MIN = 20.0
HUMIDITY_TYPICAL_MAX = 80.0
RESOLUTION = 0.01
CONDENSATION_THRESHOLD = 95.0
LOW_THRESHOLD = 5.0
```

### 22.4 Implementierungs-Unterschiede (Temp vs Humidity)

| Aspekt | SHT31Temperature | SHT31Humidity |
|--------|------------------|---------------|
| Quality Levels | 3 (error, good, fair) | 4 (error, poor, good, fair) |
| Extremwert-Erkennung | Nein | Ja (LOW_THRESHOLD, CONDENSATION_THRESHOLD) |
| Unit Conversion | Ja (°C → °F) | Nein |
| Kelvin Support | Nein (nur Celsius/Fahrenheit) | N/A |
| Condensation Warning | Nein | Ja (>95% RH) |

---

*Code-Review Verifizierung abgeschlossen am 2026-02-04*

---

## 23. ESP32-Kompatibilität - Raw-Format Anforderungen

> **Aktualisiert:** 2026-02-04 | **Phase:** Code-Review Verifizierung

### 23.1 Kritischer Unterschied: SHT31 vs. DS18B20

| Aspekt | SHT31 (Temp/Humidity) | DS18B20 |
|--------|----------------------|---------|
| **ESP32 Library** | Adafruit_SHT31 | DallasTemperature |
| **Raw-Format** | Bereits in °C / %RH | Optional: 12-bit signed integer |
| **Konvertierung auf ESP32** | JA (durch Library) | Optional (raw_mode) |
| **Server raw_mode Parameter** | NEIN (nicht unterstützt) | JA (params["raw_mode"]) |
| **Server Konvertierungsformel** | Keine (1:1 Durchreichung) | raw × 0.0625 = °C |

### 23.2 Erwartetes Raw-Format für SHT31

**SHT31TemperatureProcessor erwartet:**
```python
# ESP32 sendet:
raw_value = 23.5  # Bereits in °C (float)

# Server verarbeitet:
# - Keine Konvertierung nötig
# - Optional: Calibration Offset
# - Optional: Unit Conversion (°C → °F)
# - Quality Assessment basierend auf °C-Wert
```

**SHT31HumidityProcessor erwartet:**
```python
# ESP32 sendet:
raw_value = 65.0  # Bereits in %RH (float)

# Server verarbeitet:
# - Keine Konvertierung nötig
# - Optional: Calibration Offset
# - Clamping auf 0-100%
# - Quality Assessment + Kondensations-Warnung (>95%)
```

### 23.3 ESP32-Driver MUSS liefern:

```json
// SHT31 Temperature
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "raw": 23.5,           // °C (float) - NICHT skalierter Integer!
  "ts": 1735818000,
  "raw_mode": true
}

// SHT31 Humidity (separate Nachricht)
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 21,
  "sensor_type": "sht31_humidity",
  "raw": 65.0,           // %RH (float) - NICHT skalierter Integer!
  "ts": 1735818000,
  "raw_mode": true
}
```

### 23.4 ESP32-Driver Implementierung (Pseudocode)

```cpp
// In temp_sensor_sht31.cpp
#include <Adafruit_SHT31.h>

Adafruit_SHT31 sht31 = Adafruit_SHT31();

void readSHT31AndPublish() {
    if (!sht31.begin(0x44)) {
        // Error: Sensor nicht gefunden
        return;
    }

    // Adafruit Library gibt bereits °C und %RH zurück!
    float temperature = sht31.readTemperature();  // °C
    float humidity = sht31.readHumidity();        // %RH

    // Validierung
    if (isnan(temperature) || isnan(humidity)) {
        // Error: Lesefehler
        return;
    }

    // MQTT Publish - Temperature
    JsonDocument doc;
    doc["esp_id"] = espId;
    doc["gpio"] = 21;
    doc["sensor_type"] = "sht31_temp";
    doc["raw"] = temperature;  // Bereits °C!
    doc["ts"] = getTimestamp();
    doc["raw_mode"] = true;
    publishMQTT(sensorTopic, doc);

    // MQTT Publish - Humidity (separate Nachricht!)
    doc.clear();
    doc["esp_id"] = espId;
    doc["gpio"] = 21;
    doc["sensor_type"] = "sht31_humidity";
    doc["raw"] = humidity;  // Bereits %RH!
    doc["ts"] = getTimestamp();
    doc["raw_mode"] = true;
    publishMQTT(sensorTopic, doc);
}
```

### 23.5 FEHLER zu vermeiden

❌ **FALSCH:** Skalierte Integer senden
```json
{"raw": 2350}  // FALSCH! Server erwartet 23.5, nicht 2350
```

❌ **FALSCH:** Datasheet-Rohdaten senden
```json
{"raw": 27445}  // FALSCH! Das ist der 16-bit ADC-Wert
```

✅ **RICHTIG:** Konvertierte Werte senden
```json
{"raw": 23.5}  // RICHTIG! °C als float
```

---

*ESP32-Kompatibilität Dokumentation hinzugefügt am 2026-02-04*
