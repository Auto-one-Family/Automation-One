# Analyse Task 1: ESP32 → Server Data Flow (Multi-Value Sensoren)

**Datum:** 2026-01-14
**Entwickler:** Claude (Senior Backend Developer)
**Briefing:** [nifty-baking-grove.md](.claude/plans/nifty-baking-grove.md)
**Aufgabe:** Verstehe wie Multi-Value Sensoren aktuell vom ESP zum Server kommunizieren.

---

## Executive Summary

✅ **Analyse abgeschlossen** - Multi-Value Sensor Data Flow vollständig verstanden.

**Kernerkenntnisse:**
1. ESP32 sendet **separate MQTT Messages** für jeden Wert eines Multi-Value Sensors
2. Alle Messages verwenden **denselben GPIO** (z.B. GPIO 21 für SHT31)
3. Messages unterscheiden sich nur im `sensor_type` Field (`"sht31_temp"` vs. `"sht31_humidity"`)
4. Server hat **partiellen Multi-Value Support** (Sensor-Handler), aber **kein DB-Schema-Support**
5. API Endpoint blockiert Multi-Value Sensoren weil `get_by_esp_and_gpio()` nur **einen Sensor** zurückgibt

---

## 1. ESP32 Multi-Value Sensor Registry

### 1.1 Sensor Capability Definition

**Datei:** [El Trabajante/src/models/sensor_registry.h](El Trabajante/src/models/sensor_registry.h#L21-L27)

```cpp
struct SensorCapability {
    const char* server_sensor_type;  // "sht31_temp"
    const char* device_type;         // "sht31"
    uint8_t i2c_address;            // 0x44
    bool is_multi_value;             // true
    bool is_i2c;                     // true
};
```

**Key Insights:**
- Ein Multi-Value Sensor (wie SHT31) hat **mehrere SensorCapability Structs**
- Jede Capability repräsentiert **einen Wert-Typ** (temp, humidity, etc.)
- Alle Capabilities eines Devices teilen sich:
  - `device_type` (z.B. `"sht31"`)
  - `i2c_address` (z.B. `0x44`)
  - `is_multi_value` Flag (`true`)

---

### 1.2 Multi-Value Device Registry

**Datei:** [El Trabajante/src/models/sensor_registry.cpp](El Trabajante/src/models/sensor_registry.cpp#L127-L140)

```cpp
static const MultiValueDevice MULTI_VALUE_DEVICES[] = {
    {
        .device_type = "sht31",
        .value_types = {"sht31_temp", "sht31_humidity", nullptr, nullptr},
        .value_count = 2,
    },
    {
        .device_type = "bmp280",
        .value_types = {"bmp280_pressure", "bmp280_temp", nullptr, nullptr},
        .value_count = 2,
    },
    // End marker
    {nullptr, {nullptr, nullptr, nullptr, nullptr}, 0}
};
```

**Wichtig:**
- `MULTI_VALUE_DEVICES` verknüpft den `device_type` mit allen `value_types`
- Wird verwendet von `getMultiValueTypes()` um alle Werte eines Devices zu bekommen
- Max. 4 Werte pro Device (Array-Größe)

---

### 1.3 Sensor Capability Beispiele

**Datei:** [El Trabajante/src/models/sensor_registry.cpp](El Trabajante/src/models/sensor_registry.cpp#L10-L24)

**SHT31 Temperature:**
```cpp
static const SensorCapability SHT31_TEMP_CAP = {
    .server_sensor_type = "sht31_temp",
    .device_type = "sht31",
    .i2c_address = 0x44,
    .is_multi_value = true,
    .is_i2c = true,
};
```

**SHT31 Humidity:**
```cpp
static const SensorCapability SHT31_HUMIDITY_CAP = {
    .server_sensor_type = "sht31_humidity",
    .device_type = "sht31",
    .i2c_address = 0x44,  // SAME ADDRESS!
    .is_multi_value = true,
    .is_i2c = true,
};
```

**Observation:**
- Beide Capabilities haben **gleichen** `device_type` und `i2c_address`
- Nur `server_sensor_type` ist unterschiedlich
- Das ist die **logische Verknüpfung** zwischen den beiden Werten

---

## 2. ESP32 Multi-Value Sensor Reading

### 2.1 Measurement Flow

**Datei:** [El Trabajante/src/services/sensor/sensor_manager.cpp](El Trabajante/src/services/sensor/sensor_manager.cpp#L552-L640)

```cpp
uint8_t SensorManager::performMultiValueMeasurement(
    uint8_t gpio,
    SensorReading* readings_out,
    uint8_t max_readings
) {
    // 1. Find sensor config
    SensorConfig* config = findSensorConfig(gpio);

    // 2. Get sensor capability
    const SensorCapability* capability = findSensorCapability(config->sensor_type);
    if (!capability || !capability->is_multi_value) {
        return 0;
    }

    // 3. Get all value types for this device
    String device_type = String(capability->device_type);
    String value_types[4];
    uint8_t value_count = getMultiValueTypes(device_type, value_types, 4);

    // 4. Read raw I2C data ONCE (6 bytes for SHT31)
    uint8_t buffer[6] = {0};
    if (!readRawI2C(gpio, capability->i2c_address, 0x00, buffer, 6)) {
        return 0;
    }

    // 5. Extract different values from buffer
    for (uint8_t i = 0; i < value_count; i++) {
        uint32_t raw_value = 0;
        String value_type = value_types[i];

        if (device_type == "sht31") {
            if (value_type == "sht31_temp") {
                raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);  // Bytes 0-1
            } else if (value_type == "sht31_humidity") {
                raw_value = (uint32_t)(buffer[3] << 8 | buffer[4]);  // Bytes 3-4
            }
        }

        // 6. Create SensorReading for this value
        readings_out[i].gpio = gpio;
        readings_out[i].sensor_type = getServerSensorType(value_type);
        readings_out[i].raw_value = raw_value;
        // ... more fields

        // 7. Publish EACH reading separately
        publishSensorReading(readings_out[i]);
    }

    return value_count;
}
```

**Key Insights:**
1. **Ein I2C-Read** holt alle Daten (6 Bytes für SHT31)
2. **Mehrere SensorReading Objekte** werden erstellt (eines pro value_type)
3. **Jedes Reading wird separat via MQTT publiziert**
4. **Alle Readings verwenden denselben GPIO**

---

### 2.2 Continuous Measurement Loop

**Datei:** [El Trabajante/src/services/sensor/sensor_manager.cpp](El Trabajante/src/services/sensor/sensor_manager.cpp#L714-L727)

```cpp
// Check if this is a multi-value sensor
const SensorCapability* capability = findSensorCapability(sensors_[i].sensor_type);

if (capability && capability->is_multi_value) {
    // Multi-value sensor - create multiple readings
    SensorReading readings[4];  // Max 4 values per sensor
    uint8_t count = performMultiValueMeasurement(sensors_[i].gpio, readings, 4);

    if (count == 0) {
        LOG_WARNING("Sensor Manager: Multi-value measurement failed for GPIO " + String(sensors_[i].gpio));
    } else {
        sensors_[i].last_reading = now;  // Update timestamp
    }
} else {
    // Single-value sensor - standard measurement
    // ...
}
```

**Wichtig:**
- Multi-Value Check erfolgt bei **jedem Measurement-Intervall**
- `performMultiValueMeasurement()` publiziert automatisch alle Werte
- **Keine weiteren Sensor-Configs nötig** - Ein Config triggert alle Werte

---

## 3. MQTT Payload Structure

### 3.1 Topic Format

**Quelle:** [El Trabajante/docs/Mqtt_Protocoll.md](El Trabajante/docs/Mqtt_Protocoll.md#L88-L95)

**Topic:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`

**Beispiel:**
- `kaiser/god/esp/ESP_00000001/sensor/21/data` ← SHT31 Temp
- `kaiser/god/esp/ESP_00000001/sensor/21/data` ← SHT31 Humidity (SAME TOPIC!)

**Problem:**
- Beide Messages gehen an **denselben MQTT Topic**
- Server kann Messages nur durch **Payload-Inhalt** unterscheiden (das `sensor_type` Field)

---

### 3.2 Payload Fields (SHT31 Beispiel)

**Message 1 - Temperature:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_00000001",
  "gpio": 21,
  "sensor_type": "sht31_temp",       // ← Unterscheidet die Messages!
  "raw": 12345,
  "value": 22.5,
  "unit": "°C",
  "quality": "good",
  "raw_mode": true,
  "i2c_address": 68                  // ← 0x44 in decimal
}
```

**Message 2 - Humidity (separate Message!):**
```json
{
  "ts": 1735818001,
  "esp_id": "ESP_00000001",
  "gpio": 21,                        // ← SAME GPIO!
  "sensor_type": "sht31_humidity",   // ← Different sensor_type!
  "raw": 5432,
  "value": 65.0,
  "unit": "%",
  "quality": "good",
  "raw_mode": true,
  "i2c_address": 68                  // ← SAME I2C address!
}
```

**Wichtige Felder:**
- ✅ `sensor_type` - Unterscheidet die Werte
- ✅ `i2c_address` - Identifiziert das physikalische Device
- ✅ `gpio` - Ist bei I2C eigentlich **Bus-Pin** (21 = SDA)
- ✅ `raw_mode` - **REQUIRED** Field (Server validiert das)

---

## 4. Server-seitige Verarbeitung

### 4.1 MQTT Handler

**Datei:** [El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py](El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py#L78-L200)

```python
async def handle_sensor_data(self, topic: str, payload: dict) -> bool:
    # Step 1: Parse topic → extract esp_id, gpio
    parsed_topic = TopicBuilder.parse_sensor_data_topic(topic)
    esp_id_str = parsed_topic["esp_id"]
    gpio = parsed_topic["gpio"]

    # Step 2: Extract sensor_type from PAYLOAD (nicht aus Topic!)
    sensor_type = payload.get("sensor_type", "unknown")

    # Step 3: Lookup sensor config (Multi-Value Support!)
    sensor_config = await sensor_repo.get_by_esp_gpio_and_type(
        esp_device.id, gpio, sensor_type
    )

    # Step 4: Warnung wenn nicht gefunden, ABER speichere Daten trotzdem
    if not sensor_config:
        logger.warning(
            f"Sensor config not found: esp_id={esp_id_str}, gpio={gpio}, "
            f"type={sensor_type}. Saving data without config."
        )

    # Step 5: Save sensor data to DB
    # ...
```

**Key Insights:**
1. **Topic-Parsing** extrahiert nur `esp_id` und `gpio`
2. **sensor_type** kommt aus dem **Payload**, nicht aus dem Topic!
3. **Multi-Value Lookup** via `get_by_esp_gpio_and_type(esp_id, gpio, sensor_type)`
4. **Daten werden immer gespeichert**, auch ohne Config (Warnung wird geloggt)

---

### 4.2 Sensor Repository Lookup

**Datei:** [El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py](El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py#L82-L105)

```python
async def get_by_esp_gpio_and_type(
    self, esp_id: uuid.UUID, gpio: int, sensor_type: str
) -> Optional[SensorConfig]:
    """
    Get sensor by ESP ID, GPIO, and sensor_type (Multi-Value Support).

    For multi-value sensors, this returns the specific sensor_type
    on a GPIO (e.g., only sht31_temp, not sht31_humidity).
    """
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio,
        SensorConfig.sensor_type == sensor_type
    )
    result = await self.session.execute(stmt)
    return result.scalar_one_or_none()
```

**Wichtig:**
- Query verwendet **3 Felder**: (esp_id, gpio, sensor_type)
- Das heißt: **Mehrere sensor_configs** können denselben GPIO haben!
- Das ist der **partielle Multi-Value Support** im Server

---

### 4.3 Problem: API Endpoint blockiert Multi-Value

**Datei:** [El Servador/god_kaiser_server/src/api/v1/sensors.py](El Servador/god_kaiser_server/src/api/v1/sensors.py#L275-L350)

```python
@router.post("/{esp_id}/{gpio}", ...)
async def create_or_update_sensor(
    esp_id: str,
    gpio: int,
    request: SensorConfigCreate,
    ...
) -> SensorConfigResponse:
    # ❌ Problem: Verwendet get_by_esp_and_gpio() statt get_by_esp_gpio_and_type()
    existing = await sensor_repo.get_by_esp_and_gpio(esp_device.id, gpio)

    # GPIO-Validierung
    validation_result = await gpio_validator.validate_gpio_available(
        esp_db_id=esp_device.id,
        gpio=gpio,
        exclude_sensor_id=existing.id if existing else None
    )

    # ❌ Problem: Wenn sensor existiert, wird Konflikt gemeldet!
    if not validation_result.available:
        raise HTTPException(status_code=409, detail="GPIO_CONFLICT")
```

**Das Problem:**
1. **API verwendet `get_by_esp_and_gpio()`** (ohne sensor_type!)
2. **Findet nur EINEN Sensor** pro GPIO
3. **GPIO-Validierung denkt** GPIO ist "belegt"
4. **Zweiter Sensor** (z.B. sht31_humidity) wird als **Konflikt** abgelehnt!

---

## 5. Database Schema (Aktuell)

### 5.1 SensorConfig Model

**Datei:** [El Servador/god_kaiser_server/src/db/models/sensor.py](El Servador/god_kaiser_server/src/db/models/sensor.py#L19-L100)

```python
class SensorConfig(Base, TimestampMixin):
    __tablename__ = "sensor_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True)
    esp_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("esp_devices.id"))

    gpio: Mapped[int] = mapped_column(Integer, nullable=False)  # ❌ NOT NULL
    sensor_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    sensor_name: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    pi_enhanced: Mapped[bool] = mapped_column(Boolean, default=True)
    sample_interval_ms: Mapped[int] = mapped_column(Integer, default=1000)

    # ❌ FEHLENDE FELDER FÜR MULTI-VALUE:
    # - i2c_address (existiert nicht!)
    # - onewire_address (existiert nicht!)
    # - interface_type (existiert nicht!)
    # - provides_values (existiert nicht!)
```

**Probleme:**
1. `gpio` ist `NOT NULL` → I2C Sensoren brauchen NULL oder special handling
2. Kein `i2c_address` Field → Kann I2C Device nicht eindeutig identifizieren
3. Kein `interface_type` Field → Server weiß nicht ob I2C, OneWire oder Analog
4. Kein `provides_values` Field → Server weiß nicht welche Werte ein Sensor liefert

---

### 5.2 Aktuelle Unique Constraint

**Vermutung:** Es gibt wahrscheinlich einen Unique Constraint auf `(esp_id, gpio)`

**Suche nach Constraint:**

```bash
# Prüfe Alembic Migrations für Unique Constraints
grep -r "unique.*constraint\|unique.*index" El\ Servador/alembic/versions/
```

**Falls Constraint existiert:**
- ❌ Multi-Value Sensoren werden **auf DB-Ebene blockiert**
- ✅ Falls KEIN Constraint → DB erlaubt mehrere Sensoren pro GPIO (wie aktuell im Code genutzt)

---

## 6. Antworten auf Briefing-Fragen

### Frage 1: Wie sendet ESP32 Multi-Value Readings?

**Antwort:** ESP32 sendet **separate MQTT Messages** (eine pro Wert).

**Beweis:**
- [sensor_manager.cpp:626-640](El Trabajante/src/services/sensor/sensor_manager.cpp#L626-L640)
- `performMultiValueMeasurement()` ruft `publishSensorReading()` in einer Schleife auf
- Jeder Wert bekommt eine eigene Message

**Anzahl Messages:**
- SHT31: **2 Messages** (temp + humidity)
- BMP280: **2 Messages** (pressure + temp)
- Custom Sensor mit 4 Werten: **4 Messages**

---

### Frage 2: Welche Felder sind im MQTT Payload?

**Antwort:** Siehe Section 3.2 oben.

**Kritische Felder:**
- ✅ `sensor_type` - Unterscheidet Multi-Value Werte
- ✅ `i2c_address` - Identifiziert physikalisches Device (wird aktuell NICHT von Server gespeichert!)
- ✅ `gpio` - Bei I2C ist das der **Bus-Pin** (SDA = 21), nicht ein device-spezifischer Pin
- ✅ `raw_mode` - **REQUIRED** Field (Server validiert)

---

### Frage 3: Wie unterscheidet ESP zwischen sht31_temp und sht31_humidity?

**Antwort:** Via **separaten SensorCapability Structs** und **unterschiedliche Bytes im I2C-Buffer**.

**Prozess:**
1. ESP liest **6 Bytes** von I2C-Adresse 0x44
2. Temp: Verwendet Bytes 0-1
3. Humidity: Verwendet Bytes 3-4
4. Jeder Wert bekommt eigenen `sensor_type` im MQTT Payload

**Code:** [sensor_manager.cpp:606-613](El Trabajante/src/services/sensor/sensor_manager.cpp#L606-L613)

---

### Frage 4: Gibt es ein "parent_device" Konzept?

**Antwort:** **Nicht explizit im Code**, aber **implizit via `device_type`**.

**Verknüpfung:**
- Alle Capabilities eines Devices teilen sich `device_type` (z.B. `"sht31"`)
- `MULTI_VALUE_DEVICES` Array verknüpft `device_type` mit allen `value_types`
- **Kein Parent-ID oder Device-UUID** - nur String-Matching

**Vorschlag:** Ein explizites `device_id` Field würde das robuster machen.

---

## 7. Identifizierte Probleme

### 🔴 Problem 1: API blockiert Multi-Value Sensoren

**Location:** [sensors.py:317](El Servador/god_keizer_server/src/api/v1/sensors.py#L317)

**Code:**
```python
existing = await sensor_repo.get_by_esp_and_gpio(esp_device.id, gpio)
```

**Problem:**
- API verwendet `get_by_esp_and_gpio()` (ohne sensor_type)
- Findet nur ERSTEN Sensor auf GPIO
- Zweiter Sensor wird als Konflikt abgelehnt

**Fix:**
- Verwende `get_by_esp_gpio_and_type()` stattdessen
- Oder: API muss `sensor_type` akzeptieren und validieren

---

### 🔴 Problem 2: DB-Schema fehlt I2C-Adresse

**Location:** [sensor.py:59-78](El Servador/god_kaiser_server/src/db/models/sensor.py#L59-L78)

**Fehlende Felder:**
- `i2c_address` (Integer, nullable)
- `onewire_address` (String, nullable)
- `interface_type` (String: "I2C", "ONEWIRE", "ANALOG", "DIGITAL")
- `provides_values` (JSON Array: ["sht31_temp", "sht31_humidity"])

**Problem:**
- Server kann I2C-Adresse-Konflikte nicht erkennen
- Mehrere Geräte auf selber Adresse = Hardware-Konflikt!
- Frontend kann nicht wissen dass SHT31 = 2 Werte

---

### 🟡 Problem 3: GPIO ist NOT NULL

**Location:** [sensor.py:59-63](El Servador/god_kaiser_server/src/db/models/sensor.py#L59-L63)

**Code:**
```python
gpio: Mapped[int] = mapped_column(Integer, nullable=False)
```

**Problem:**
- I2C Sensoren haben **keinen device-spezifischen GPIO**
- GPIO 21/22 sind **Bus-Pins**, keine Sensor-Pins
- Aktuell wird GPIO 21 für SHT31 verwendet (SDA Pin), aber das ist semantisch falsch

**Vorschlag:**
- `gpio` → nullable für I2C/OneWire
- Oder: Spezielle Werte wie `-1` für "Bus-Device"

---

### 🟡 Problem 4: GPIO-Validierung versteht keine Busses

**Location:** [gpio_validation_service.py](El Servador/god_kaiser_server/src/services/gpio_validation_service.py)

**Problem:**
- Validierung prüft nur "ist GPIO belegt?"
- Versteht nicht dass I2C/OneWire **Busses** sind
- Mehrere Devices auf selber Bus sollten erlaubt sein (unterschiedliche Adressen)

**Fix nötig:**
- Validierung muss `interface_type` prüfen
- I2C: Prüfe I2C-Adresse-Konflikt, nicht GPIO-Konflikt
- OneWire: Prüfe Device-Adresse-Konflikt, nicht GPIO-Konflikt
- Analog: Prüfe GPIO-Konflikt (wie bisher)

---

## 8. Empfehlungen für Implementierung

### 8.1 Minimal-Änderung (Option A)

**DB-Schema:**
```python
class SensorConfig(Base):
    # ... existing fields
    gpio: Mapped[Optional[int]]  # ✅ Make nullable

    # ✅ NEW: Interface type
    interface_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # "I2C", "ONEWIRE", "ANALOG", "DIGITAL"

    # ✅ NEW: Bus addresses
    i2c_address: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    onewire_address: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)

    # ✅ NEW: Multi-value info
    provides_values: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # ["sht31_temp", "sht31_humidity"]
```

**API Endpoint:**
```python
@router.post("/{esp_id}/{gpio}")
async def create_or_update_sensor(esp_id, gpio, request: SensorConfigCreate):
    # ✅ NEW: Include sensor_type in lookup
    existing = await sensor_repo.get_by_esp_gpio_and_type(
        esp_device.id, gpio, request.sensor_type
    )

    # ✅ NEW: Validate based on interface_type
    if request.interface_type == "I2C":
        await validate_i2c_address(esp_device.id, request.i2c_address)
    elif request.interface_type in ["ANALOG", "DIGITAL"]:
        await validate_gpio_exclusive(esp_device.id, gpio)
```

---

### 8.2 Alternative: Bus-Identifier statt GPIO

**Idee:** I2C/OneWire Sensoren haben `gpio = NULL`, aber `bus_id` Field.

**DB-Schema:**
```python
class SensorConfig(Base):
    gpio: Mapped[Optional[int]]  # NULL für Bus-Devices
    bus_id: Mapped[Optional[str]]  # "i2c_0", "onewire_4", etc.
    i2c_address: Mapped[Optional[int]]
    onewire_address: Mapped[Optional[str]]
```

**Vorteile:**
- Semantisch korrekter (I2C ist kein GPIO-Sensor)
- Bus-Identifier kann mehrere Busses unterscheiden (falls ESP32 mehrere I2C-Busses hat)

**Nachteile:**
- Größere Code-Änderungen
- API muss umstrukturiert werden (nicht mehr `/gpio/` im Path)

---

## 9. Verifikation

### ✅ Dokumentierte Findings

- [x] ESP32 sendet separate Messages (Anzahl = Anzahl Werte)
- [x] MQTT Payload-Struktur vollständig dokumentiert
- [x] I2C-Adresse vs. GPIO-Pin Unterscheidung verstanden
- [x] Server hat partiellen Multi-Value Support (Handler, aber nicht API)
- [x] DB-Schema Limitierungen identifiziert
- [x] API-Blocker identifiziert (`get_by_esp_and_gpio()`)

### ❌ Noch zu klären

- [ ] Gibt es DB Unique Constraint auf `(esp_id, gpio)`?
- [ ] Wie verhält sich Frontend bei Multi-Value Sensoren?
- [ ] Wie funktioniert Config-Push via MQTT für Multi-Value?

---

## 10. Nächste Schritte

**Sofort:**
1. **Analyse Task 2:** Server Sensor-Handler & DB-Interaktion
2. **Analyse Task 3:** Frontend GPIO-Status & Sensor-Anzeige
3. **Analyse Task 4:** GPIO-Validierung & Pin-Capabilities

**Nach Analyse:**
1. Mit Robin diskutieren: Option A vs. Option B
2. Design-Entscheidung dokumentieren
3. Alembic Migration erstellen
4. API Endpoints anpassen
5. Tests schreiben

---

**Status:** ✅ COMPLETE - Bereit für Robin's Review und Task 2

**Fragen an Robin:**
1. Option A (Minimal) oder Option B (Bus-Identifier)?
2. Sollen wir `gpio = NULL` verwenden oder spezielle Werte wie `-1`?
3. Wie soll Frontend Multi-Value Sensoren anzeigen? (1 Card oder 2 Cards?)
4. Soll `provides_values` automatisch aus ESP32 Registry gelesen werden?
