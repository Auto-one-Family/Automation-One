# Wokwi Session 3 - Sensor Configuration & Data Test

> **Date:** 2026-02-11
> **Session:** ~08:30 - 08:38 UTC
> **ESP Device:** ESP_00000001 (ESP32-D0WDQ6-V3, Wokwi Simulator)
> **Server:** FastAPI God-Kaiser (http://localhost:8000)
> **MQTT Broker:** Mosquitto 2.0.22 (automationone-mqtt)
> **Focus:** Sensor configuration, data readout, Bug 2 root cause analysis

---

## Wokwi Diagram - Available Hardware

| Component | GPIO | Type | Wokwi Default |
|-----------|------|------|---------------|
| DS18B20 (temp1) | 4 | OneWire Temperature | 22.5 C |
| DHT22 | 15 | Digital Temp/Humidity | 23.5 C / 65% |
| Potentiometer | 34 | Analog Input | 50% |
| LED green | 5 | Output (Relay/Actuator) | - |
| LED red | 13 | Output | - |
| LED blue | 14 | Output | - |
| Emergency Button | 27 | Input (Pull-down) | - |

**Firmware sensor support:** DS18B20 (OneWire), SHT31 (I2C), BMP280 (I2C), Analog. **No DHT22 support.**

---

## Pre-Session State

| Component | Status |
|-----------|--------|
| ESP_00000001 | **offline** (from Session 2, last_seen 08:17 UTC) |
| Zone | `greenhouse` (in DB from Session 2) |
| Sensors registered | **0** |
| Sensor data in DB | **none** |
| Server sensor processors | 11 loaded (ds18b20, sht31_temp, sht31_humidity, bmp280_temp, bmp280_pressure, co2, ec, flow, light, moisture, ph) |

---

## Phase 1: ESP Boot & Status Check

### Heartbeat Received (uptime 68s)
```json
{"esp_id":"ESP_00000001","zone_assigned":false,"uptime":68,"heap_free":210772,
 "wifi_rssi":-97,"sensor_count":0,"actuator_count":0,
 "gpio_status":[
   {"gpio":4,"owner":"bus/onewire/4","component":"OneWireBus","mode":2},
   {"gpio":21,"owner":"system","component":"I2C_SDA","mode":2},
   {"gpio":22,"owner":"system","component":"I2C_SCL","mode":2}
 ]}
```

**Key observation:** GPIO 4 already claimed by `bus/onewire/4` (OneWireBus) at boot.

### DB Status
- Status: **online** (re-registered after reboot)
- Zone: `greenhouse` (from DB, but ESP reports `zone_assigned: false` - Bug 3 ZONE_MISMATCH)

---

## Phase 2: OneWire Bus Scan

### REST API Scan
- **POST** `/api/v1/sensors/esp/ESP_00000001/onewire/scan`
- **Response:**
  ```json
  {"success":true,"message":"Found 1 OneWire device(s) on GPIO 4 (1 new)",
   "devices":[{"rom_code":"280102030405069E","device_type":"ds18b20","pin":4,
               "already_configured":false,"sensor_name":null}],
   "found_count":1,"new_count":1,"pin":4,"scan_duration_ms":63}
  ```
- **ROM-Code:** `280102030405069E` (DS18B20 family 0x28)

---

## Phase 3: Sensor Configuration Attempts

### Attempt 1 - Uppercase DS18B20 with onewire_address (FAILED)

**MQTT Config:**
```json
{"type":"full",
 "sensors":[{"gpio":4,"sensor_type":"DS18B20","sensor_name":"Boden Temperatur",
             "subzone_id":"zone_a","onewire_address":"280102030405069E",
             "raw_mode":true,"operating_mode":"continuous","measurement_interval_seconds":5}],
 "actuators":[{"gpio":5,"type":"relay","name":"Bewaesserung","subzone_id":"zone_a"}]}
```

**Result:** Actuator SUCCESS, **Sensor: no response at all** (silently dropped).

**Serial Log (119650ms):**
```
[ERROR] Sensor Manager: GPIO 4 not available
[ERROR] [1002] [HARDWARE] GPIO conflict for sensor
[ERROR] Failed to configure sensor on GPIO 4
ConfigResponse published [sensor] status=error success=0 failed=1
```

### Attempt 2 - Sensor-only, Uppercase (FAILED)

Same payload without actuators, same error.

**Config Response:**
```json
{"status":"error","type":"sensor","count":0,"failed_count":1,
 "message":"All 1 item(s) failed to configure",
 "failures":[{"type":"sensor","gpio":4,"error_code":1041,
              "error":"CONFIG_FAILED","detail":"Failed to configure sensor on GPIO 4"}]}
```

### Attempt 3 - Lowercase ds18b20 with onewire_address (SUCCESS!)

**MQTT Config:**
```json
{"sensors":[{"gpio":4,"sensor_type":"ds18b20","sensor_name":"Boden Temperatur",
             "subzone_id":"zone_a","onewire_address":"280102030405069E",
             "raw_mode":true,"operating_mode":"continuous","measurement_interval_seconds":5}]}
```

**Config Response:**
```json
{"status":"success","type":"sensor","count":1,"failed_count":0,
 "message":"Configured 1 item(s) successfully"}
```

**Serial Log (170277ms):**
```
[INFO] SensorManager: Using existing OneWire bus on GPIO 4 (owner: bus/onewire/4)
[INFO] SensorManager: OneWire device 280102030405069E verified on GPIO 4 (type: ds18b20)
[INFO] ConfigManager: WOKWI mode - sensor config stored in RAM only (NVS not supported)
[INFO] Sensor Manager: Configured OneWire sensor 'ds18b20' on GPIO 4
[INFO] Sensor configured: GPIO 4 (ds18b20)
[INFO] ConfigResponse published [sensor] status=success success=1 failed=0
```

---

## Phase 4: Sensor Data Flow (Partial)

### PiEnhancedProcessor HTTP POST (171164ms)
```
PiEnhancedProcessor: HTTP POST START url=http://host.wokwi.internal:8000/api/v1/sensors/process
PiEnhancedProcessor: HTTP POST payload={"esp_id":"ESP_00000001","gpio":4,
  "sensor_type":"ds18b20","raw_value":360,"timestamp":171163,"metada...
```

- **raw_value: 360** = DS18B20 raw (360/16 = **22.5 C** - matches Wokwi diagram default!)
- **Data path:** ESP → HTTP POST → Server `/api/v1/sensors/process` (Pi-Enhanced Processing)
- **ESP went offline** before POST completed (Wokwi session ended)
- **No sensor data reached the server DB**

---

## Bug 2 Root Cause Found: Case-Sensitivity

### Location
`El Trabajante/src/services/sensor/sensor_manager.cpp:318-319`

```cpp
bool is_onewire = (capability && !capability->is_i2c &&
                   config.sensor_type.indexOf("ds18b20") >= 0);  // LOWERCASE CHECK!
```

### Root Cause
`String::indexOf()` in Arduino is **case-sensitive**. The check looks for lowercase `"ds18b20"`, but the Server ConfigPayloadBuilder and MQTT documentation use uppercase `"DS18B20"`.

### Impact
- `"sensor_type":"DS18B20"` → `is_onewire = false` → Falls through to standard GPIO check → **GPIO_CONFLICT**
- `"sensor_type":"ds18b20"` → `is_onewire = true` → Uses existing OneWire bus → **SUCCESS**

### Fix Options

**Option A (ESP32 - recommended):** Case-insensitive comparison
```cpp
String type_lower = config.sensor_type;
type_lower.toLowerCase();
bool is_onewire = (capability && !capability->is_i2c &&
                   type_lower.indexOf("ds18b20") >= 0);
```

**Option B (Server):** Send lowercase sensor_type in ConfigPayloadBuilder
- Would break consistency with other code that uses uppercase "DS18B20"
- Not recommended

### Previous Understanding (Session 1 & 2)
Bug 2 was documented as "OneWire bus claims GPIO 4, blocks dynamic config". This was the **symptom**, not the root cause. The real issue is the case-sensitive OneWire detection in `configureSensor()`.

---

## Sensor Data API Issues

| Endpoint | Result | Issue |
|----------|--------|-------|
| `GET /api/v1/sensors/` | `data: []` | No sensors registered (ESP offline before heartbeat update) |
| `GET /api/v1/sensors/data` | `INTERNAL_ERROR` | SQL timestamp query fails (no data + possible SQL issue) |
| `GET /api/v1/sensors/health` | 11 processors loaded | Server-side processing ready |
| `POST /api/v1/sensors/esp/ESP_00000001/onewire/scan` | 1 device found | Works (sends MQTT scan command to ESP) |

### `/sensors/data` INTERNAL_ERROR
Server log shows SQL query issue:
```
File "/app/src/db/repositories/sensor_repo.py", line 421, in query_data
SELECT sensor_data.id, sensor_data.esp_id, ... FROM sensor_data
WHERE sensor_data.timestamp >= $1::TIMESTAMP ...
```
Possible issue with timestamp parameter handling when no data exists.

---

## Findings Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | **Bug 2 Root Cause: Case-sensitivity** in `sensor_manager.cpp:319` | High | **NEW - Root cause identified** |
| 2 | DS18B20 config works with lowercase `ds18b20` + `onewire_address` | - | **Workaround verified** |
| 3 | Sensor data uses HTTP POST (PiEnhancedProcessor), not MQTT publish | - | **Architecture clarified** |
| 4 | `raw_value: 360` = 22.5 C (correct DS18B20 reading) | - | **Sensor hardware works** |
| 5 | `/sensors/data` endpoint throws INTERNAL_ERROR | Medium | **NEW - needs investigation** |
| 6 | ESP went offline before sensor data reached server | - | Wokwi session timeout |

---

## Successful Sensor Config Payload (Reference)

```json
{
  "sensors": [{
    "gpio": 4,
    "sensor_type": "ds18b20",         // MUST be lowercase!
    "sensor_name": "Boden Temperatur",
    "subzone_id": "zone_a",
    "onewire_address": "280102030405069E",  // From OneWire scan
    "raw_mode": true,
    "operating_mode": "continuous",
    "measurement_interval_seconds": 5
  }],
  "actuators": [{
    "gpio": 5,
    "type": "relay",
    "name": "Bewaesserung",
    "subzone_id": "zone_a"
  }]
}
```

---

## Next Steps for Full Sensor Data Flow

1. **Fix Bug 2:** Apply case-insensitive comparison in `sensor_manager.cpp:319`
2. **Start Wokwi with longer session** to allow full data flow:
   - ESP boot → Heartbeat → Approve → Zone assign → Sensor config → Wait for HTTP POST → Verify data in DB
3. **Investigate `/sensors/data` INTERNAL_ERROR** - may be timestamp handling when no data exists
4. **Test analog sensor on GPIO 34** (potentiometer) as additional sensor type
