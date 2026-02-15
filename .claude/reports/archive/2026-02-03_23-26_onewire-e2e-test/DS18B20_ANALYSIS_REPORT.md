# DS18B20 End-to-End Analyse Report

> **Erstellt:** 2026-02-03
> **Analyst:** Claude Code (Opus 4.5)
> **Scope:** Vollständiger Datenfluss DS18B20 → ESP32 → MQTT → Server → Processing

---

## 1. Executive Summary

### Funktioniert der Flow theoretisch? ✅ JA

Der DS18B20 End-to-End Flow ist **vollständig implementiert und funktionsfähig**. Die Architektur folgt konsequent dem Server-Centric Design mit Pi-Enhanced Processing.

### Kritische Findings

| Kategorie | Status | Details |
|-----------|--------|---------|
| **OneWire Bus** | ✅ Implementiert | `onewire_bus.cpp` mit vollständiger Arduino OneWire Integration |
| **DS18B20 Driver** | ⚠️ Leer | `temp_sensor_ds18b20.h/cpp` sind leer - Funktionalität in OneWireBusManager |
| **Sensor Registry** | ✅ Korrekt | `"ds18b20"` → DS18B20_CAP Mapping vorhanden |
| **Server Library** | ✅ Vorhanden | `temperature.py` mit `DS18B20Processor` Klasse |
| **ROM-Code Handling** | ✅ Implementiert | 16-Hex-Char Validierung, 4-way DB Lookup |
| **Raw-Mode** | ✅ Korrekt | ESP sendet 12-bit RAW, Server konvertiert |

### Warum findet der Hardware-Scan keine Geräte?

**Mögliche Ursachen (in Reihenfolge der Wahrscheinlichkeit):**

1. **Hardware-Problem:** Pull-up Widerstand falsch oder fehlend
2. **GPIO-Reservierung:** Pin bereits von anderem Modul belegt
3. **Timing:** Bus-Reset schlägt fehl (elektrisches Problem)
4. **Sensor defekt:** DS18B20 nicht funktionsfähig

**NICHT** ein Softwareproblem - der Code ist korrekt implementiert.

---

## 2. ESP32 Firmware Findings

### 2.1 Konfigurationsfluss

#### Woher kommt die Sensor-Konfiguration?

**Primär: MQTT vom Server** → **Sekundär: NVS (Flash)**

```
Server (DB) → ConfigPayloadBuilder → MQTT → ESP32 → ConfigManager → NVS
                                                           ↓
                                                    SensorManager.configureSensor()
```

**Relevante Dateien:**
- [config_manager.h:70-85](El Trabajante/src/services/config/config_manager.h#L70-L85) - Sensor Config API
- [sensor_manager.cpp:157-460](El Trabajante/src/services/sensor/sensor_manager.cpp#L157-L460) - `configureSensor()`

#### Wie wird ein DS18B20-Sensor registriert?

**Sensor-Type:** `"ds18b20"` oder `"temperature_ds18b20"` (beide werden auf `"ds18b20"` normalisiert)

**Erforderliche Parameter:**
```cpp
SensorConfig config;
config.gpio = 4;                           // OneWire Bus Pin
config.sensor_type = "ds18b20";            // Sensor-Type String
config.sensor_name = "Temp Sensor 1";      // Display Name
config.onewire_address = "28FF641E8D3C0C79"; // 16 Hex-Zeichen ROM-Code
config.raw_mode = true;                    // IMMER true (Server-Centric)
config.active = true;
```

**Referenz:** [sensor_types.h:15-47](El Trabajante/src/models/sensor_types.h#L15-L47)

#### Wann wird der OneWire-Bus initialisiert?

**Lazy Initialization:** Der Bus wird beim ersten Sensor initialisiert, der ihn benötigt.

```cpp
// sensor_manager.cpp:397-407
if (!onewire_bus_->isInitialized()) {
    // First OneWire sensor → Initialize bus
    if (!onewire_bus_->begin(config.gpio)) {
        LOG_ERROR("Failed to initialize OneWire bus on GPIO " + String(config.gpio));
        return false;
    }
}
```

**Reihenfolge:**
1. `SensorManager.configureSensor()` aufgerufen
2. ROM-Code Validierung (16 Hex-Zeichen)
3. GPIO-Verfügbarkeit prüfen
4. **OneWire Bus initialisieren** (wenn noch nicht aktiv)
5. Device-Präsenz prüfen (`isDevicePresent()`)
6. Sensor registrieren

### 2.2 OneWire-Bus Deep Dive

#### Gibt es einen dedizierten DS18B20-Driver?

**NEIN** - Die Dateien `temp_sensor_ds18b20.h` und `temp_sensor_ds18b20.cpp` sind leer (nur 1 Zeile).

Die gesamte DS18B20-Funktionalität ist im **OneWireBusManager** implementiert:
- [onewire_bus.h](El Trabajante/src/drivers/onewire_bus.h) - Header
- [onewire_bus.cpp](El Trabajante/src/drivers/onewire_bus.cpp) - Implementation

Dies ist **beabsichtigt** - der OneWireBusManager abstrahiert alle OneWire-Geräte.

#### ROM-Code Handling

**Speicherung:** Im `SensorConfig.onewire_address` Feld als 16 Hex-Zeichen String

**Validierung:** [sensor_manager.cpp:321-347](El Trabajante/src/services/sensor/sensor_manager.cpp#L321-L347)
```cpp
// 1. Länge prüfen (16 Zeichen)
if (config.onewire_address.length() != 16) {
    LOG_ERROR("Invalid OneWire ROM-Code length");
    return false;
}

// 2. Parse und CRC-Validierung
uint8_t rom[8];
OneWireUtils::hexStringToRom(config.onewire_address, rom);
if (!OneWireUtils::isValidRom(rom)) {
    LOG_WARNING("ROM-Code CRC invalid - continuing anyway");
}
```

**Bei nicht gefundenem ROM-Code:** [sensor_manager.cpp:409-416](El Trabajante/src/services/sensor/sensor_manager.cpp#L409-L416)
```cpp
if (!onewire_bus_->isDevicePresent(rom)) {
    LOG_ERROR("OneWire device not found on bus");
    return false;  // Sensor wird NICHT registriert
}
```

#### Temperatur-Auslese-Flow

**Vollständiger Trace:** [onewire_bus.cpp:225-294](El Trabajante/src/drivers/onewire_bus.cpp#L225-L294)

```
readRawTemperature(rom_code, raw_value)
    ↓
1. onewire_->reset()           // Bus-Reset (Presence Pulse)
    ↓
2. onewire_->select(rom_code)  // Device auswählen (Match ROM: 0x55)
    ↓
3. onewire_->write(0x44, 1)    // Convert T Befehl + Parasitic Power
    ↓
4. delay(750)                  // Warten auf Konversion (12-bit Resolution)
    ↓
5. onewire_->reset()           // Erneuter Reset
    ↓
6. onewire_->select(rom_code)  // Device wieder auswählen
    ↓
7. onewire_->write(0xBE)       // Read Scratchpad Befehl
    ↓
8. Read 9 Bytes (Scratchpad)   // Temp LSB, MSB, TH, TL, Config, Reserved×3, CRC
    ↓
9. CRC8 Validierung            // OneWire::crc8(scratchpad, 8) == scratchpad[8]
    ↓
10. raw_value = (MSB << 8) | LSB  // 12-bit signed Wert extrahieren
```

**OneWire-Befehle:**
| Befehl | Hex | Beschreibung |
|--------|-----|--------------|
| Skip ROM | 0xCC | Broadcast (nicht verwendet) |
| Match ROM | 0x55 | Specific Device (implizit in `select()`) |
| Convert T | 0x44 | Temperatur-Konversion starten |
| Read Scratchpad | 0xBE | Scratchpad auslesen |

**Rohwert-Formel:**
```
temp_celsius = raw_value * 0.0625
```

### 2.3 SensorManager Integration

#### OneWire-Sensor Registrierung

**Unterschied zu anderen Sensoren:** [sensor_manager.cpp:311-442](El Trabajante/src/services/sensor/sensor_manager.cpp#L311-L442)

1. **GPIO-Sharing erlaubt:** Mehrere DS18B20 auf demselben GPIO (Bus)
2. **ROM-Code erforderlich:** Eindeutige Identifikation jedes Sensors
3. **Keine GPIO-Reservierung durch Sensor:** Bus reserviert GPIO
4. **Präsenz-Check vor Registrierung:** Device muss auf Bus antworten

#### Sensor-Registry Mapping

**Datei:** [sensor_registry.cpp:26-33](El Trabajante/src/models/sensor_registry.cpp#L26-L33)

```cpp
static const SensorCapability DS18B20_CAP = {
    .server_sensor_type = "ds18b20",
    .device_type = "ds18b20",
    .i2c_address = 0x00,      // Not I2C
    .is_multi_value = false,  // Single-Value Sensor
    .is_i2c = false,
};
```

**Mapping-Tabelle:** [sensor_registry.cpp:95-97](El Trabajante/src/models/sensor_registry.cpp#L95-L97)
```cpp
{"temperature_ds18b20", &DS18B20_CAP},
{"ds18b20", &DS18B20_CAP},  // Already normalized
```

#### Raw-Mode vs. Processed-Mode

**ESP32 sendet IMMER Rohwerte (`raw_mode: true`)** - Server-Centric Architektur!

- `SensorConfig.raw_mode = true` (Default)
- `SensorReading.raw_mode = true` (Default)
- Konversion `raw * 0.0625 = °C` passiert auf dem **Server**

### 2.4 MQTT Publishing

**Topic-Format:**
```
kaiser/god/esp/{esp_id}/sensor/{gpio}/data
```

**Payload-Format:** [sensor_manager.cpp:1243-1311](El Trabajante/src/services/sensor/sensor_manager.cpp#L1243-L1311)
```json
{
    "esp_id": "ESP_12AB34CD",
    "zone_id": "zone_1",
    "subzone_id": "greenhouse_a",
    "gpio": 4,
    "sensor_type": "ds18b20",
    "raw": 400,
    "value": 0.0,
    "unit": "",
    "quality": "good",
    "ts": 1706968800,
    "raw_mode": true,
    "onewire_address": "28FF641E8D3C0C79"
}
```

---

## 3. Server-Side Findings

### 3.1 Sensor Library

**Existiert? ✅ JA**

**Datei:** [temperature.py](El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py)

**Klasse:** `DS18B20Processor` (Zeilen 23-390)

#### Transformation

**Input:** 12-bit signed integer (RAW)
**Output:** Temperatur in Celsius (oder °F/K)

```python
# temperature.py:177
raw_value = float(raw_value) * self.RESOLUTION  # RESOLUTION = 0.0625
```

#### Special Value Detection (Defense-in-Depth)

| RAW Wert | Celsius | Bedeutung | Handling |
|----------|---------|-----------|----------|
| -2032 | -127°C | Sensor Fault | `quality="error"`, Error Code 1060 |
| 1360 | 85°C | Power-On Reset | `quality="suspect"`, Warning Code 1061 |

```python
# temperature.py:140-151
if raw_int == self.RAW_SENSOR_FAULT:  # -2032
    return ProcessingResult(
        value=0.0,
        quality="error",
        metadata={"error": "DS18B20 sensor fault: -127°C"}
    )
```

### 3.2 Sensor Type Registry

**Datei:** [sensor_type_registry.py](El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py)

**Mapping:** Zeilen 49-50
```python
SENSOR_TYPE_MAPPING = {
    "temperature_ds18b20": "ds18b20",
    "ds18b20": "ds18b20",  # Already normalized
    ...
}
```

**DS18B20 ist NICHT in MULTI_VALUE_SENSORS** (korrekt - Single-Value)

### 3.3 Config-Flow (Server → ESP32)

**Wie wird DS18B20 konfiguriert?**

1. **Frontend/API** erstellt SensorConfig in DB
2. **ConfigPayloadBuilder** baut Payload
3. **MQTT Publisher** sendet an ESP32

**Config-Payload-Builder:** [config_builder.py:110-130](El Servador/god_kaiser_server/src/services/config_builder.py#L110-L130)

**Sensor-Model:** [sensor.py:98-102](El Servador/god_kaiser_server/src/db/models/sensor.py#L98-L102)
```python
onewire_address: Mapped[Optional[str]] = mapped_column(
    String(16),
    nullable=True,
    doc="OneWire device address (required for OneWire sensors)",
)
```

**4-Way Lookup für OneWire:** [sensor_repo.py:728-752](El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py#L728-L752)
```python
async def get_by_esp_gpio_type_and_onewire(
    self, esp_id, gpio, sensor_type, onewire_address
) -> Optional[SensorConfig]:
    # Unique lookup: esp_id + gpio + sensor_type + onewire_address
```

### 3.4 MQTT Handler

**Datei:** [sensor_handler.py](El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py)

**OneWire Support:** Zeilen 154-174
```python
# Extract onewire_address (for OneWire 4-way lookup)
onewire_address = payload.get("onewire_address")

if onewire_address:
    # 4-way lookup
    sensor_config = await sensor_repo.get_by_esp_gpio_type_and_onewire(
        esp_device.id, gpio, sensor_type, onewire_address
    )
```

**Pi-Enhanced Processing Trigger:** Zeilen 199-231
```python
if sensor_config and sensor_config.pi_enhanced and raw_mode:
    processing_params["raw_mode"] = raw_mode  # Pass to processor!
    result = processor.process(
        raw_value=raw_value,
        calibration=sensor_config.calibration_data,
        params=processing_params,
    )
```

---

## 4. Identifizierte Probleme

### Problem 1: Leere DS18B20-Driver Dateien

- **Location:** `El Trabajante/src/services/sensor/sensor_drivers/temp_sensor_ds18b20.h/cpp`
- **Beschreibung:** Dateien existieren aber sind leer (1 Zeile)
- **Impact:** Gering - Funktionalität ist in OneWireBusManager implementiert
- **Empfehlung:** Entweder Dateien löschen oder als Wrapper für OneWireBusManager implementieren

### Problem 2: DallasTemperature Library ungenutzt

- **Location:** `platformio.ini` (lib_deps)
- **Beschreibung:** DallasTemperature ist in Abhängigkeiten, wird aber nicht verwendet
- **Impact:** Keine - funktioniert ohne
- **Empfehlung:** Aus lib_deps entfernen um Verwirrung zu vermeiden

### Problem 3: Presence-Pulse-Fehler nur WARNING

- **Location:** [onewire_bus.cpp:100-103](El Trabajante/src/drivers/onewire_bus.cpp#L100-L103)
- **Beschreibung:**
  ```cpp
  if (!onewire_->reset()) {
      LOG_WARNING("OneWire bus reset failed - no devices present or bus error");
      // This is not necessarily an error - just means no devices connected yet
  }
  ```
- **Impact:** Bus wird als "initialisiert" markiert obwohl kein Device antwortet
- **Empfehlung:** Dies ist **korrekt** - Device-Check passiert bei `configureSensor()`

### Problem 4: 750ms Blocking Delay

- **Location:** [onewire_bus.cpp:251](El Trabajante/src/drivers/onewire_bus.cpp#L251)
- **Beschreibung:** `delay(750)` blockiert Task während Temperatur-Konversion
- **Impact:** Bei vielen Sensoren kann dies die Watchdog-Timeouts beeinflussen
- **Empfehlung:** Für Multi-Sensor-Szenarien asynchrone Konversion mit Skip ROM (0xCC) implementieren

---

## 5. Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DS18B20 END-TO-END FLOW                               │
└─────────────────────────────────────────────────────────────────────────────────┘

[1] SENSOR-KONFIGURATION ERSTELLEN
    ┌─────────────┐         ┌──────────────┐         ┌─────────────┐
    │  Frontend   │ ──API─► │   Server DB  │ ──────► │ SensorConfig│
    │  Dashboard  │         │  PostgreSQL  │         │  (Model)    │
    └─────────────┘         └──────────────┘         └─────────────┘
          │                        │
          │ POST /api/v1/sensors   │ Fields:
          │ {                      │ - esp_id (UUID)
          │   esp_id, gpio,        │ - gpio (4)
          │   sensor_type,         │ - sensor_type ("ds18b20")
          │   onewire_address,     │ - onewire_address ("28FF...")
          │   sensor_name          │ - pi_enhanced (true)
          │ }                      │ - interface_type ("ONEWIRE")
          ▼                        │
                                   ▼
[2] KONFIGURATION AN ESP32 PUSHEN
    ┌─────────────────┐         ┌─────────────┐
    │ ConfigPayload   │ ──────► │    MQTT     │
    │ Builder         │         │  Publisher  │
    └─────────────────┘         └─────────────┘
          │                            │
          │ build_sensor_payload()     │ Topic: kaiser/{kaiser_id}/esp/{esp_id}/config
          │                            │
          ▼                            ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │ Payload:                                                             │
    │ {                                                                    │
    │   "sensors": [{                                                      │
    │     "gpio": 4, "sensor_type": "ds18b20", "sensor_name": "Temp 1",   │
    │     "onewire_address": "28FF641E8D3C0C79", "active": true,          │
    │     "raw_mode": true, "sample_interval_ms": 30000                    │
    │   }]                                                                 │
    │ }                                                                    │
    └─────────────────────────────────────────────────────────────────────┘
          │
          ▼
[3] ESP32 EMPFÄNGT KONFIGURATION
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │ MQTTClient  │ ──────► │ ConfigMgr   │ ──────► │    NVS      │
    │  Handler    │         │  Handler    │         │   Flash     │
    └─────────────┘         └─────────────┘         └─────────────┘
          │                        │
          │ on_message()           │ saveSensorConfig()
          ▼                        │
                                   ▼
[4] ONEWIRE-BUS INITIALISIEREN
    ┌─────────────────┐         ┌─────────────────┐
    │  SensorManager  │ ──────► │ OneWireBusManager│
    │ configureSensor │         │    begin(gpio)   │
    └─────────────────┘         └─────────────────┘
          │                            │
          │ is_onewire = true          │ Steps:
          │                            │ 1. GPIO requestPin()
          ▼                            │ 2. new OneWire(pin)
                                       │ 3. onewire_->reset()
    ┌────────────────────────────────────┐
    │ Validation Steps:                   │
    │ 1. ROM-Code length == 16           │
    │ 2. ROM-Code CRC valid              │
    │ 3. OneWire bus initialized         │
    │ 4. Device present on bus           │
    └────────────────────────────────────┘
          │
          ▼
[5] DS18B20 AUSLESEN (Periodisch alle 30s)
    ┌─────────────────┐         ┌─────────────────┐
    │  SensorManager  │ ──────► │ OneWireBusManager│
    │ performMeasure  │         │ readRawTemp()    │
    └─────────────────┘         └─────────────────┘
          │                            │
          │ performAllMeasurements()   │ OneWire Commands:
          │ (every 30s)                │ 1. reset()
          ▼                            │ 2. select(ROM)
                                       │ 3. write(0x44) - Convert T
    ┌────────────────────────────────────┐ 4. delay(750ms)
    │ Special Value Detection:           │ 5. reset()
    │ -127°C (RAW -2032) → Sensor Fault │ 6. select(ROM)
    │ +85°C (RAW 1360) → Power-On Reset │ 7. write(0xBE) - Read Scratchpad
    │ Out of range → quality="suspect"  │ 8. read 9 bytes
    └────────────────────────────────────┘ 9. CRC8 validate
          │                            │ 10. raw = (MSB<<8)|LSB
          ▼                            │
                                       ▼
[6] DATEN AN SERVER SENDEN
    ┌─────────────────┐         ┌─────────────┐
    │  SensorManager  │ ──────► │    MQTT     │
    │ publishReading  │         │  Publish    │
    └─────────────────┘         └─────────────┘
          │                            │
          │ buildMQTTPayload()         │ Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
          ▼                            │
    ┌─────────────────────────────────────────────────────────────────────┐
    │ Payload:                                                             │
    │ {                                                                    │
    │   "esp_id": "ESP_12AB34CD", "gpio": 4, "sensor_type": "ds18b20",    │
    │   "raw": 400, "ts": 1706968800, "raw_mode": true,                   │
    │   "onewire_address": "28FF641E8D3C0C79", "quality": "good"          │
    │ }                                                                    │
    └─────────────────────────────────────────────────────────────────────┘
          │
          ▼
[7] SERVER VERARBEITET
    ┌─────────────────┐         ┌─────────────────┐
    │ SensorDataHandler│ ──────► │ DS18B20Processor│
    │   (MQTT)         │         │  (temperature.py)│
    └─────────────────┘         └─────────────────┘
          │                            │
          │ 4-way lookup:              │ Processing:
          │ esp_id + gpio +            │ 1. raw_mode=True check
          │ sensor_type +              │ 2. Special value detection
          │ onewire_address            │ 3. raw * 0.0625 = °C
          ▼                            │ 4. Calibration offset
                                       │ 5. Unit conversion (optional)
    ┌────────────────────────────────────┐ 6. Quality assessment
    │ Result:                            │
    │ value=25.0, unit="°C",             │
    │ quality="good"                     │
    └────────────────────────────────────┘
          │
          ▼
[8] DATEN SPEICHERN
    ┌─────────────────┐         ┌─────────────────┐
    │ SensorRepository│ ──────► │  sensor_data    │
    │    save_data()   │         │  (TimeSeries)   │
    └─────────────────┘         └─────────────────┘
          │
          │ Fields: esp_id, gpio, sensor_type, raw_value,
          │         processed_value (25.0), unit (°C),
          │         processing_mode ("pi_enhanced"), quality,
          │         timestamp, data_source
          ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │ Additional Actions:                                                  │
    │ - WebSocket Broadcast (Dashboard Live-Update)                       │
    │ - Logic Engine Trigger (Automation Rules)                           │
    │ - Pi-Enhanced Response zurück an ESP (optional)                     │
    └─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Offene Fragen

### Geklärt ✅

1. **ROM-Code Handling:** Wird als 16-Hex-Char String gespeichert, bei Config validiert
2. **Sensor-Type String:** `"ds18b20"` oder `"temperature_ds18b20"` → beide funktionieren
3. **Raw-Mode:** ESP sendet immer RAW (12-bit signed), Server konvertiert
4. **Server Library:** `DS18B20Processor` in `temperature.py` vorhanden
5. **Config-Push:** Server → ESP via MQTT nach CRUD-Operation
6. **Bus vs. Sensor Init:** Bus wird bei erstem Sensor initialisiert (Lazy Init)

### Offen ❓

1. **Warum findet Hardware-Scan keine Geräte?**
   - Benötigt Debug-Session mit ESP32 Serial Log
   - Prüfen: Pull-up Widerstand, GPIO-Verkabelung, Sensor-Qualität

2. **Wird DallasTemperature Library benötigt?**
   - Aktuell ungenutzt
   - Kann entfernt werden (manuelles Protokoll ist implementiert)

---

## 7. Empfehlungen

### Sofort

1. **Hardware-Debug:** ESP32 Serial-Log analysieren bei Bus-Init
2. **Pull-up prüfen:** 4.7kΩ zwischen Data und VCC korrekt angeschlossen?
3. **Multimeter-Test:** VCC (3.3V), GND, Data-Line-Spannung messen

### Mittelfristig

1. **Leere Driver-Dateien aufräumen:** `temp_sensor_ds18b20.h/cpp` löschen oder implementieren
2. **DallasTemperature entfernen:** Aus lib_deps wenn nicht benötigt
3. **Async Conversion:** Für Multi-Sensor Szenarien Skip ROM + Parallel Conversion

### Langfristig

1. **Wokwi-Test:** OneWire-Szenarien in Simulation testen
2. **Integration-Test:** End-to-End Test mit Mock-ESP32

---

## Anhang: Wichtige Code-Referenzen

| Thema | Datei | Zeilen |
|-------|-------|--------|
| OneWire Bus Header | El Trabajante/src/drivers/onewire_bus.h | 1-132 |
| OneWire Bus Impl | El Trabajante/src/drivers/onewire_bus.cpp | 1-306 |
| SensorManager DS18B20 | El Trabajante/src/services/sensor/sensor_manager.cpp | 597-773 |
| Sensor Registry | El Trabajante/src/models/sensor_registry.cpp | 26-118 |
| DS18B20Processor | El Servador/.../temperature.py | 23-390 |
| Sensor Handler | El Servador/.../sensor_handler.py | 79-697 |
| Sensor Model | El Servador/.../sensor.py | 19-235 |
| Config Builder | El Servador/.../config_builder.py | 48-249 |

---

*Report generiert am 2026-02-03 von Claude Code (Opus 4.5)*
