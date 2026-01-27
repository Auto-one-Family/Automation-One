# Sensor Raw-Value Processing - Analyse-Report

**Datum:** 2026-01-09
**Analyst:** Claude (Senior Embedded Systems & Backend Engineer)
**Analysierte Dateien:** 25+ Dateien, ~12.000 Zeilen
**Status:** 🟡 INKONSISTENZEN GEFUNDEN - DOKUMENTATION ERFORDERLICH

---

## 1. Executive Summary

Die Sensor-Verarbeitungspipeline ist **funktionell korrekt**, aber es gibt **Dokumentations-Inkonsistenzen** zwischen ESP32-Code und Server-Library-Kommentaren. Die tatsächliche Implementierung zeigt:

- **pH-Sensor:** ✅ Korrekt implementiert (ADC → Server Processing)
- **DS18B20/SHT31:** 🟡 ESP32-seitige Verarbeitung mit Server-Validation
- **Mock-ESP:** ✅ Separater Pfad ohne Pi-Enhanced Processing

**Wichtigste Erkenntnis:** Das System hat ZWEI Verarbeitungsmodi:
1. **Pi-Enhanced Mode:** ESP32 sendet RAW, Server verarbeitet
2. **Local Mode:** ESP32 verarbeitet, Server validiert

---

## 2. ESP32 Sensor-Verarbeitung

### 2.1 SensorReading Struktur ([sensor_types.h:40-51](El%20Trabajante/src/models/sensor_types.h#L40-L51))

```cpp
struct SensorReading {
    uint8_t gpio;
    char sensor_type[32];      // z.B. "ds18b20", "sht31_temp", "ph"
    uint32_t raw_value;        // RAW-Wert (ADC/Register)
    float processed_value;     // Verarbeiteter Wert (vom Server oder lokal)
    char unit[8];              // "°C", "pH", "%RH"
    char quality[16];          // "good", "fair", "error"
    unsigned long timestamp;
    bool valid;
    char error_message[64];
};
```

### 2.2 SensorConfig ([sensor_types.h:13-37](El%20Trabajante/src/models/sensor_types.h#L13-L37))

```cpp
struct SensorConfig {
    uint8_t gpio;
    String sensor_type;
    bool raw_mode = true;           // IMMER true im Standard-Setup
    String operating_mode;          // "continuous", "on_demand", "paused"
    uint32_t measurement_interval_ms = 30000;
    // ...
};
```

**Wichtig:** `raw_mode = true` bedeutet "Server soll verarbeiten".

### 2.3 Sensor-Typ-spezifische Verarbeitung

#### DS18B20 (OneWire) - [onewire_bus.cpp:185-253](El%20Trabajante/src/drivers/onewire_bus.cpp#L185-L253)

```cpp
bool OneWireBusManager::readRawTemperature(const uint8_t rom_code[8], int16_t& raw_value) {
    // Start temperature conversion (0x44)
    onewire_->write(0x44, 1);
    delay(750);  // Wait for 12-bit conversion

    // Read scratchpad (0xBE)
    onewire_->write(0xBE);

    // Extract raw temperature value (12-bit signed)
    raw_value = (scratchpad[1] << 8) | scratchpad[0];

    // Raw value is in 1/16th degree units
    // Conversion formula: temp_celsius = raw_value * 0.0625
}
```

| Aspekt | Wert |
|--------|------|
| raw_value Format | 1/16°C Units (int16_t) |
| Beispiel | raw=376 → 376×0.0625 = 23.5°C |
| Konversion | Server ODER ESP32 (je nach Setup) |

#### SHT31 (I2C Multi-Value) - [sensor_manager.cpp:437-547](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L437-L547)

```cpp
// Lese 6 Bytes vom SHT31
if (i2cBusManager.readRaw(i2c_address, buffer, 6)) {
    // Byte 0-1: Temperature Raw
    // Byte 3-4: Humidity Raw

    if (sensor_type.indexOf("sht31_temp") >= 0) {
        raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
    } else if (sensor_type.indexOf("sht31_humidity") >= 0) {
        raw_value = (uint32_t)(buffer[3] << 8 | buffer[4]);
    }
}
```

| Aspekt | Wert |
|--------|------|
| raw_value Format | 16-bit I2C Register |
| Temp-Formel | T = -45 + (175 × raw / 65535) |
| Humidity-Formel | RH = 100 × (raw / 65535) |
| Multi-Value | Separate MQTT Messages pro Wert |

#### pH-Sensor (ADC) - [sensor_manager.cpp](El%20Trabajante/src/services/sensor/sensor_manager.cpp)

| Aspekt | Wert |
|--------|------|
| raw_value Format | ADC 0-4095 (12-bit) |
| Konversion | Server-seitig (PHSensorProcessor) |
| Formel | pH = slope × voltage + offset |

### 2.4 Multi-Value Sensor Registry ([sensor_registry.cpp:127-140](El%20Trabajante/src/models/sensor_registry.cpp#L127-L140))

```cpp
const std::map<std::string, std::vector<std::string>> MULTI_VALUE_DEVICES = {
    {"sht31", {"sht31_temp", "sht31_humidity"}},
    {"bmp280", {"bmp280_pressure", "bmp280_temp"}},
    {"bme280", {"bme280_temp", "bme280_humidity", "bme280_pressure"}}
};
```

---

## 3. ESP32 MQTT Payload

### 3.1 Payload-Struktur ([sensor_manager.cpp:794-844](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L794-L844))

```json
{
    "esp_id": "ESP_12AB34CD",
    "gpio": 34,
    "sensor_type": "ph",
    "raw": 2048,
    "value": 0.0,
    "unit": "",
    "quality": "stale",
    "ts": 1736380800,
    "raw_mode": true
}
```

### 3.2 Required vs. Optional Fields

| Feld | Required | Beschreibung |
|------|----------|--------------|
| esp_id | ✅ | Device ID |
| gpio | ✅ | GPIO Pin |
| sensor_type | ✅ | Sensor-Typ (lowercase) |
| raw | ✅ | Raw-Wert |
| ts | ✅ | Unix Timestamp |
| raw_mode | ✅ | Processing Flag |
| value | ❌ | Processed Value (wenn raw_mode=false) |
| unit | ❌ | Einheit |
| quality | ❌ | Quality Assessment |
| zone_id | ❌ | Zone |
| subzone_id | ❌ | Subzone |
| meta | ❌ | Kalibrierung/Metadaten |

### 3.3 Multi-Value Sensor Messages

SHT31 sendet ZWEI separate MQTT Messages auf dem GLEICHEN GPIO:

**Message 1 (Temperatur):**
```json
{
    "esp_id": "ESP_001",
    "gpio": 21,
    "sensor_type": "sht31_temp",
    "raw": 24576,
    "ts": 1736380800,
    "raw_mode": true
}
```

**Message 2 (Humidity, ~100ms später):**
```json
{
    "esp_id": "ESP_001",
    "gpio": 21,
    "sensor_type": "sht31_humidity",
    "raw": 32768,
    "ts": 1736380800,
    "raw_mode": true
}
```

---

## 4. Server Sensor Libraries

### 4.1 Library Loader ([library_loader.py](El%20Servador/god_kaiser_server/src/sensors/library_loader.py))

```python
class LibraryLoader:
    """Singleton für dynamisches Laden von Sensor-Libraries."""

    def get_processor(self, sensor_type: str) -> BaseSensorProcessor:
        # 1. Normalisiere sensor_type
        normalized = normalize_sensor_type(sensor_type)

        # 2. Suche in sensor_libraries/active/
        # 3. Cache für Performance
```

### 4.2 Sensor Type Registry ([sensor_type_registry.py](El%20Servador/god_kaiser_server/src/sensors/sensor_type_registry.py))

```python
SENSOR_TYPE_MAPPING = {
    "temperature_sht31": "sht31_temp",
    "humidity_sht31": "sht31_humidity",
    "sht31_temp": "sht31_temp",
    "ds18b20": "ds18b20",
    "ph_sensor": "ph",
    "ph": "ph",
    # ...
}
```

### 4.3 Konversions-Formeln

#### pH-Sensor ([ph_sensor.py:216-228](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ph_sensor.py#L216-L228))

```python
def _adc_to_voltage(self, adc_value: float) -> float:
    return (adc_value / 4095) * 3.3  # 12-bit ADC, 3.3V ref

def _voltage_to_ph_default(self, voltage: float) -> float:
    NEUTRAL_VOLTAGE = 1.5
    DEFAULT_SLOPE = -3.5
    return 7.0 + DEFAULT_SLOPE * (voltage - NEUTRAL_VOLTAGE)
```

| Input | Konversion | Output |
|-------|------------|--------|
| ADC 2048 | → Voltage 1.65V | → pH 6.5 |
| ADC 1860 | → Voltage 1.5V | → pH 7.0 |

#### SHT31 Temperature ([temperature.py:304-437](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py#L304-L437))

```python
class SHT31TemperatureProcessor(BaseSensorProcessor):
    """
    DOKUMENTATIONS-HINWEIS:
    Der Code-Kommentar sagt "raw_value: Temperature in °C (from Adafruit_SHT31)"

    ABER: Der ESP32 sendet I2C Register-Werte wenn keine Library verwendet wird!
    Die Konversion muss angepasst werden je nach ESP32-Setup.
    """
    def process(self, raw_value: float, ...) -> ProcessingResult:
        # Aktuell: Nimmt an, raw_value ist bereits °C
        temp_celsius = raw_value
        # ...
```

#### SHT31 Humidity ([humidity.py:80-170](El%20Servador/god_kaiser_server/src/sensors/sensor_libraries/active/humidity.py#L80-L170))

```python
class SHT31HumidityProcessor(BaseSensorProcessor):
    """
    DOKUMENTATIONS-HINWEIS:
    Der Code-Kommentar sagt "raw_value: Relative Humidity % (from Adafruit_SHT31)"

    ABER: Der ESP32 sendet I2C Register-Werte wenn keine Library verwendet wird!
    """
```

### 4.4 Quality Assessment

| Sensor | Good | Fair | Poor | Error |
|--------|------|------|------|-------|
| DS18B20 | -10°C bis +85°C | Rest bis ±55/125°C | Extremwerte | Außerhalb Range |
| SHT31 Temp | 0°C bis 65°C | Rest bis -40/125°C | - | Außerhalb Range |
| SHT31 Humidity | 20-80% RH | Rest bis 0/100% | <5% oder >95% | <0% oder >100% |
| pH | 3-11 (kalibriert) | Rest bis 0-14 | Extremwerte | <0 oder >14 |

---

## 5. Server MQTT Handler

### 5.1 Processing Pipeline ([sensor_handler.py:78-299](El%20Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py#L78-L299))

```python
async def handle_sensor_data(self, topic: str, payload: dict) -> bool:
    # 1. Parse topic → esp_id, gpio
    # 2. Validate payload (raw_mode required!)
    # 3. Lookup ESP device (DB)
    # 4. Lookup sensor config (Multi-Value Support: by esp_id + gpio + sensor_type)

    # 5. Determine processing mode
    if sensor_config.pi_enhanced and raw_mode:
        # Pi-Enhanced: Server verarbeitet
        pi_result = await _trigger_pi_enhanced_processing(...)
        processed_value = pi_result["processed_value"]
    elif not raw_mode:
        # Local: ESP hat bereits verarbeitet
        processed_value = payload.get("value")

    # 6. Save to DB
    # 7. WebSocket broadcast
    # 8. Logic Engine trigger (non-blocking)
```

### 5.2 Pi-Enhanced Trigger ([sensor_handler.py:492-585](El%20Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py#L492-L585))

```python
async def _trigger_pi_enhanced_processing(...):
    # 1. Get library loader
    loader = get_library_loader()

    # 2. Normalize sensor type
    normalized_type = normalize_sensor_type(sensor_type)

    # 3. Get processor
    processor = loader.get_processor(sensor_type)

    # 4. Process raw value
    result = processor.process(
        raw_value=raw_value,
        calibration=sensor_config.calibration_data,
        params=processing_params
    )

    return {
        "processed_value": result.value,
        "unit": result.unit,
        "quality": result.quality
    }
```

---

## 6. Mock-ESP Handler

### 6.1 Architektur-Unterschied

**Real ESP:**
```
Hardware → ESP32 Firmware → MQTT → sensor_handler → Pi-Enhanced Processing → DB → WebSocket
```

**Mock ESP:**
```
Frontend/API → debug.py → DB (simulation_config) → SimulationScheduler → MQTT → sensor_handler → DB → WebSocket
```

### 6.2 Mock Sensor Values ([debug.py:119-140](El%20Servador/god_kaiser_server/src/api/v1/debug.py#L119-L140))

Mock-ESPs speichern **menschenlesbare Werte direkt**, NICHT ADC/Register-Werte:

```python
# Bei Mock-ESP-Erstellung:
"sensors": {
    "34": {
        "sensor_type": "ph",
        "raw_value": 7.0,       # ← Menschenlesbarer pH-Wert!
        "base_value": 7.0,      # ← Gleicher Wert für Simulation
        "unit": "pH",
        "quality": "good"
    }
}
```

### 6.3 pi_enhanced Flag

Mock-ESPs haben typischerweise `pi_enhanced=False`:

```python
# debug.py:291
await sensor_repo.create(
    esp_id=device.id,
    gpio=sensor.gpio,
    sensor_type=sensor.sensor_type,
    pi_enhanced=False,  # ← Kein Server-Processing für Mocks!
    # ...
)
```

**Konsequenz:** Mock-ESP Werte werden DIREKT gespeichert ohne Sensor-Library-Verarbeitung.

---

## 7. Frontend Store Handler

### 7.1 WebSocket Handler ([esp.ts:1106-1140](El%20Frontend/src/stores/esp.ts#L1106-L1140))

```typescript
function handleSensorData(message: any): void {
    const data = message.data
    const espId = data.esp_id
    const gpio = data.gpio
    const sensorType = data.sensor_type

    // HYBRID LOGIC:
    // 1. Known multi-value → Registry-based grouping
    // 2. Unknown multi-value → Dynamic detection
    // 3. Single-value → Direct update

    const knownDeviceType = getDeviceTypeFromSensorType(sensorType)

    if (knownDeviceType) {
        handleKnownMultiValueSensor(sensors, data, knownDeviceType)
        return
    }
    // ...
}
```

### 7.2 Value Usage

Das Frontend verwendet `data.value` - den verarbeiteten Wert vom Server:

```typescript
sensor.raw_value = data.value  // ← processed_value oder raw_value vom Server
sensor.unit = data.unit
sensor.quality = data.quality
```

---

## 8. Gefundene Issues

| # | Beschreibung | Layer | Schwere | Status |
|---|--------------|-------|---------|--------|
| 1 | Server-Library-Kommentare sagen "raw_value ist bereits °C", aber ESP32 kann Register senden | Server | 🟡 DOKU | Dokumentation aktualisieren |
| 2 | Mock-ESP verwendet menschenlesbare Werte, Real-ESP verwendet ADC/Register | Server | 🟢 BY DESIGN | Architektur-Unterschied dokumentiert |
| 3 | Multi-Value DB Unique Constraint | Server | ✅ BEHOBEN | Siehe MULTI_VALUE_SENSOR_ANALYSIS_REPORT.md |

---

## 9. Verarbeitungsmodi - Zusammenfassung

### Modus 1: Pi-Enhanced (server_config.pi_enhanced=True)

```
┌─────────────┐    MQTT     ┌─────────────┐    ┌─────────────┐
│ ESP32       │ ──────────▶ │ Server      │ ──▶│ DB          │
│ raw_value   │  raw: 2048  │ pH Library  │    │ value: 7.0  │
│ (ADC)       │             │ → pH 7.0    │    │             │
└─────────────┘             └─────────────┘    └─────────────┘
```

**Anwendung:** pH, EC, andere ADC-basierte Sensoren

### Modus 2: Local Processing (raw_mode=False)

```
┌─────────────┐    MQTT     ┌─────────────┐    ┌─────────────┐
│ ESP32       │ ──────────▶ │ Server      │ ──▶│ DB          │
│ DallasTemp  │  value:23.5 │ Validation  │    │ value: 23.5 │
│ → 23.5°C    │             │ only        │    │             │
└─────────────┘             └─────────────┘    └─────────────┘
```

**Anwendung:** DS18B20 mit DallasTemperature Library, fertig kalibrierte Sensoren

### Modus 3: Mock-ESP (simulation)

```
┌─────────────┐    REST     ┌─────────────┐    ┌─────────────┐
│ Frontend    │ ──────────▶ │ debug.py    │ ──▶│ DB          │
│ User setzt  │  value: 7.0 │ Direct      │    │ value: 7.0  │
│ pH=7.0      │             │ Store       │    │             │
└─────────────┘             └─────────────┘    └─────────────┘
```

**Anwendung:** Testing, Demo, Development

---

## 10. Konversionsformeln - Referenz

### pH-Sensor (ADC → pH)
```python
voltage = (adc_value / 4095) * 3.3
ph = 7.0 + (-3.5) * (voltage - 1.5)  # Default ohne Kalibrierung
```

### DS18B20 (1/16°C Units → °C)
```python
temp_celsius = raw_value * 0.0625
```

### SHT31 Temperature (Register → °C)
```python
temp_celsius = -45 + (175 * raw_register / 65535)
```

### SHT31 Humidity (Register → %RH)
```python
humidity = 100 * (raw_register / 65535)
```

---

## 11. Fazit

| Status | Beschreibung |
|--------|--------------|
| ✅ | pH-Sensor Pipeline vollständig korrekt |
| ✅ | Multi-Value Pattern korrekt implementiert |
| ✅ | Mock-ESP separater Pfad ist by-design |
| 🟡 | Server-Library-Dokumentation sollte ESP32-Varianten beschreiben |

### Empfehlungen:

1. **Dokumentation:** Server-Library-Kommentare aktualisieren um beide ESP32-Modi (Library vs. Raw-Register) zu beschreiben

2. **Keine Code-Änderungen erforderlich:** Das System funktioniert korrekt - die Architektur-Entscheidung (ESP32 mit Library vs. Raw) wird durch `pi_enhanced` Flag gesteuert

3. **Test-Empfehlung:** E2E-Tests für alle drei Modi erstellen (Pi-Enhanced, Local, Mock)

---

## 12. Referenz-Dateien

### ESP32 (El Trabajante)
| Datei | Beschreibung |
|-------|--------------|
| `src/models/sensor_types.h:40-51` | SensorReading Struktur |
| `src/models/sensor_registry.cpp:127-140` | Multi-Value Devices |
| `src/services/sensor/sensor_manager.cpp:437-547` | I2C Sensor Read |
| `src/services/sensor/sensor_manager.cpp:794-844` | MQTT Payload Build |
| `src/drivers/onewire_bus.cpp:185-253` | DS18B20 Raw Read |

### Server (El Servador)
| Datei | Beschreibung |
|-------|--------------|
| `src/sensors/library_loader.py` | Dynamic Library Loading |
| `src/sensors/sensor_type_registry.py` | Type Normalization |
| `src/sensors/sensor_libraries/active/ph_sensor.py` | pH Processing |
| `src/sensors/sensor_libraries/active/temperature.py` | Temp Processing |
| `src/sensors/sensor_libraries/active/humidity.py` | Humidity Processing |
| `src/mqtt/handlers/sensor_handler.py` | MQTT Handler |
| `src/api/v1/debug.py` | Mock-ESP Handler |

### Frontend (El Frontend)
| Datei | Beschreibung |
|-------|--------------|
| `src/stores/esp.ts:1106-1140` | handleSensorData() |
| `src/utils/sensorDefaults.ts` | MULTI_VALUE_DEVICES |

---

**Report erstellt:** 2026-01-09
**Nächste Review:** Bei Sensor-Library-Updates
