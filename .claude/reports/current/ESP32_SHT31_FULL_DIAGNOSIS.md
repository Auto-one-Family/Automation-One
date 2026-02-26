# ESP32 SHT31 Full Stack Diagnosis

**Date:** 2026-02-25
**Device:** ESP_472204 (ESP32_WROOM, IP: 192.168.0.148)
**Sensor:** SHT31 at I2C address 0x44 (68 decimal)
**Author:** auto-ops (Hardware-Test Orchestrator)
**Status:** 6 bugs identified, 3 critical

---

## Executive Summary

The ESP32 (ESP_472204) is online and connected to MQTT, but produces ZERO sensor data. Instead, it generates a continuous flood of Error 1007 (I2C read timeout) at approximately 1 error per second per sensor config. This error flood eventually crashes the MQTT connection (LWT disconnect observed during analysis).

**Root Cause Chain:**
1. SHT31 I2C read fails (hardware or timing issue)
2. Failed measurement does NOT update `last_reading` timestamp
3. Next loop iteration (10ms later) immediately retries
4. Error tracker publishes every failure to MQTT without rate limiting
5. Server stores every error in `audit_logs` without deduplication
6. Error flood overloads MQTT client -> ESP disconnects

---

## Bug Inventory

| # | Severity | Component | Description | Impact |
|---|----------|-----------|-------------|--------|
| **B1** | CRITICAL | ESP32 Firmware | I2C read timeout on SHT31 - Error 1007 flooding | No sensor data, DB flood |
| **B2** | CRITICAL | ESP32 Firmware | Missing backoff on measurement failure | ~2 errors/sec instead of 1/30s |
| **B3** | HIGH | ESP32 Firmware | Duplicate multi-value measurement for separate sensor configs | Double I2C transactions |
| **B4** | MEDIUM | ESP32 Firmware | Empty actuator config treated as error | Spurious config_response errors |
| **B5** | MEDIUM | Server Schema | GpioStatusItem owner pattern too restrictive | Heartbeat validation warnings |
| **B6** | LOW | ESP32 Firmware | OneWire bus initialized unconditionally | Unnecessary GPIO 4 reservation |

---

## Bug B1: I2C Read Timeout (CRITICAL)

### Symptoms
```
kaiser/god/esp/ESP_472204/system/error {
  "error_code": 1007,
  "severity": 2,
  "category": "HARDWARE",
  "message": "sht31 read timeout",
  "context": {"esp_id": "ESP_472204", "uptime_ms": ...}
}
```
- Errors arrive at ~1/second continuously
- 506 Error-1007 entries in `audit_logs` in the last hour alone
- ZERO entries in `sensor_data` table for ESP_472204

### Code Path
```
performAllMeasurements() [sensor_manager.cpp:1006]
  -> performMultiValueMeasurement(gpio=0) [sensor_manager.cpp:883]
    -> i2c_bus_->readSensorRaw("sht31", 0x44, ...) [i2c_bus.cpp:649]
      -> executeCommandBasedProtocol() [i2c_bus.cpp:763]
        -> Wire.beginTransmission(0x44) + Wire.write({0x24, 0x00}) [line 769-775]
        -> Wire.endTransmission() [line 775] -> error=0 (ACK received!)
        -> delay(16ms) [line 812] (conversion time)
        -> Wire.requestFrom(0x44, 6) [line 819]
        -> while(Wire.available() < 6) [line 825]
          -> millis() - start > 100ms -> TIMEOUT! [line 826-830]
          -> trackError(ERROR_I2C_TIMEOUT) -> publishErrorToMqtt()
```

### Analysis
The command write (`0x2400`) succeeds (endTransmission returns 0), meaning the SHT31 ACKs its address. But after the 16ms conversion delay, `Wire.requestFrom()` does not receive 6 bytes. This indicates:

**Possible Hardware Causes:**
1. **Wiring issue:** SDA/SCL pull-up resistors missing or wrong value (need 4.7k-10k to 3.3V)
2. **Bus contention:** Another device pulling the bus (unlikely - only SHT31 on bus)
3. **Power issue:** SHT31 VCC not stable (needs 2.15V-5.5V)
4. **Broken sensor:** SHT31 responds to address but fails measurement

**Possible Firmware Causes:**
1. `Wire.requestFrom()` returns fewer bytes than 6 but `Wire.available()` never reaches 6
2. The `delay(16)` may not be enough if the SHT31 is at the edge of timing

### Verification Commands
```bash
# Check if ACK is received (would show error != 0 if NACK)
# The error logs only show "read timeout", not "not responding"
# -> Confirms: SHT31 ACKs address but fails on data read
```

### DB State
```sql
-- Zero sensor data
SELECT COUNT(*) FROM sensor_data sd
JOIN esp_devices e ON sd.esp_id = e.id
WHERE e.device_id = 'ESP_472204';
-- Result: 0

-- 506 error events in last hour
SELECT COUNT(*) FROM audit_logs
WHERE source_id = 'ESP_472204' AND error_code = '1007'
AND created_at > NOW() - INTERVAL '1 hour';
-- Result: 506
```

### Fix Options
1. **Hardware check:** Verify pull-up resistors, power supply, wiring
2. **Increase conversion delay:** Change `conversion_time_ms` from 16 to 20 or 25
3. **Add retry in protocol:** Retry the `requestFrom` once before reporting error
4. **Add I2C scan at startup:** `Wire.beginTransmission(0x44); Wire.endTransmission()` should return 0

---

## Bug B2: Missing Backoff on Measurement Failure (CRITICAL)

### Code
```cpp
// sensor_manager.cpp:1063-1075
if (capability && capability->is_multi_value) {
    SensorReading readings[4];
    uint8_t count = performMultiValueMeasurement(sensors_[i].gpio, readings, 4);

    if (count == 0) {
        LOG_W(TAG, "Multi-value measurement failed for GPIO ...");
        // BUG: last_reading NOT updated!
    } else {
        sensors_[i].last_reading = now;  // Only on success
    }
}
```

### Problem
When a measurement fails (`count == 0`), `last_reading` is NOT updated. The interval check:
```cpp
if (now - sensors_[i].last_reading < sensor_interval) {
    continue;  // Not time yet
}
```
...immediately passes on the next loop iteration (~10ms later + 100ms I2C timeout = ~110ms cycle).

**Result:** Instead of measuring every 30 seconds (configured `sample_interval_ms = 30000`), the ESP retries every ~110ms on failure, producing ~9 errors/second per sensor config.

### Fix
```cpp
if (count == 0) {
    LOG_W(TAG, "Multi-value measurement failed for GPIO ...");
    sensors_[i].last_reading = now;  // UPDATE EVEN ON FAILURE
    // OR: Implement exponential backoff
}
```

**Better fix:** Exponential backoff with max retry interval:
```cpp
if (count == 0) {
    // Backoff: double the wait time, max 5 minutes
    uint32_t backoff = min(sensor_interval * (1 << sensors_[i].consecutive_failures), 300000UL);
    sensors_[i].last_reading = now - sensor_interval + backoff;
    sensors_[i].consecutive_failures++;
} else {
    sensors_[i].last_reading = now;
    sensors_[i].consecutive_failures = 0;
}
```

---

## Bug B3: Duplicate Multi-Value Measurement (HIGH)

### Problem
DB has TWO sensor configs for ESP_472204:
```
| sensor_type    | gpio | i2c_address | interface_type |
|----------------|------|-------------|----------------|
| sht31_humidity |    0 |          68 | I2C            |
| sht31_temp     |    0 |          68 | I2C            |
```

`performAllMeasurements()` iterates ALL sensor configs. Both `sht31_temp` and `sht31_humidity` resolve to `is_multi_value = true`. So `performMultiValueMeasurement(gpio=0)` is called TWICE per measurement cycle -- once for each config entry.

Each call reads the SAME I2C device (0x44), reads BOTH values (temp + humidity), and publishes BOTH values. So with 2 configs, you get 2x I2C reads and potentially 4x MQTT publishes (2 duplicates).

### Fix
Add multi-value deduplication in `performAllMeasurements()`:
```cpp
// Track already-measured multi-value device types per GPIO
bool multi_value_measured[MAX_SENSORS] = {false};

for (uint8_t i = 0; i < sensor_count_; i++) {
    // ... existing checks ...

    if (capability && capability->is_multi_value) {
        // Check if another config for same GPIO already triggered measurement
        if (multi_value_measured[config->gpio]) {
            continue; // Already measured this multi-value device
        }

        SensorReading readings[4];
        uint8_t count = performMultiValueMeasurement(sensors_[i].gpio, readings, 4);

        if (count > 0) {
            multi_value_measured[config->gpio] = true;
            // Update last_reading for ALL configs on this GPIO
            for (uint8_t j = 0; j < sensor_count_; j++) {
                if (sensors_[j].gpio == config->gpio) {
                    sensors_[j].last_reading = now;
                }
            }
        }
    }
}
```

---

## Bug B4: Empty Actuator Config Error (MEDIUM)

### Problem
When server pushes combined config `{"sensors": [...], "actuators": []}`, the ESP32 processes both:
```cpp
// main.cpp:838-840
if (topic == config_topic) {
    handleSensorConfig(payload);     // Processes sensors array
    handleActuatorConfig(payload);   // Processes actuators array -> ERROR
    return;
}
```

`handleActuatorConfig` (actuator_manager.cpp:740-748) treats empty array as error:
```cpp
if (total == 0) {
    String message = "Actuator config array is empty";
    ConfigResponseBuilder::publishError(ConfigType::ACTUATOR,
        ConfigErrorCode::MISSING_FIELD, message);
    return false;
}
```

This produces:
```json
{"seq":45,"status":"error","type":"actuator","count":0,
 "message":"Actuator config array is empty","error_code":"MISSING_FIELD"}
```

### Fix
Empty actuator array is valid (no actuators configured):
```cpp
if (total == 0) {
    LOG_I(TAG, "No actuators configured - skipping");
    ConfigResponseBuilder::publishSuccess(ConfigType::ACTUATOR, 0);
    return true;  // Not an error
}
```

---

## Bug B5: GpioStatusItem Owner Pattern (MEDIUM)

### Problem
Server schema:
```python
# schemas/esp.py:289-292
owner: str = Field(
    ...,
    pattern=r"^(sensor|actuator|system)$",
)
```

ESP32 sends `"bus/onewire/4"` as owner for OneWire bus reservation.

Server logs:
```
GPIO status item 0 validation failed for ESP_472204:
1 validation error for GpioStatusItem
owner: String should match pattern '^(sensor|actuator|system)$'
```

### Fix
Extend pattern to accept bus owners:
```python
owner: str = Field(
    ...,
    pattern=r"^(sensor|actuator|system|bus/[a-z]+/\d+)$",
)
```

---

## Bug B6: Unconditional OneWire Init (LOW)

### Problem
`main.cpp:1868` always calls `oneWireBusManager.begin()` regardless of whether any OneWire sensors are configured. This reserves GPIO 4 unnecessarily.

From heartbeat:
```json
{"gpio":4,"owner":"bus/onewire/4","component":"OneWireBus","mode":2,"safe":false}
```

### Fix
Only initialize OneWire if sensors require it:
```cpp
// Check if any configured sensor uses OneWire
bool needs_onewire = false;
for (uint8_t i = 0; i < sensorManager.getSensorCount(); i++) {
    auto config = sensorManager.getSensorConfig(i);
    auto cap = findSensorCapability(config.sensor_type);
    if (cap && !cap->is_i2c && String(cap->device_type) == "ds18b20") {
        needs_onewire = true;
        break;
    }
}
if (needs_onewire) {
    oneWireBusManager.begin();
}
```

---

## Stack Health Summary

### Docker Services
| Service | Status | Notes |
|---------|--------|-------|
| PostgreSQL | Healthy | Running, 20 tables |
| Mosquitto MQTT | Healthy | 4 clients connected |
| FastAPI Server | Healthy | Processing errors, health OK |
| Vue Frontend | Healthy | Up 4 minutes |
| Monitoring Stack | Healthy | All 7 services running |
| pgAdmin | Restarting | Restart loop (non-critical) |

### MQTT Traffic Analysis
| Topic | Status | Rate |
|-------|--------|------|
| `system/heartbeat` | Working | ~1/minute |
| `system/error` | FLOODING | ~1/second (Error 1007) |
| `sensor/+/data` | EMPTY | No sensor data published |
| `config_response` | Error | "Actuator config array is empty" |
| `zone/ack` | Working | Zone "echt" assigned |

### Database State
| Table | ESP_472204 Records | Notes |
|-------|-------------------|-------|
| `esp_devices` | 1 | Status: online (was offline during analysis) |
| `sensor_configs` | 2 | sht31_temp + sht31_humidity (correct) |
| `sensor_data` | 0 | ZERO readings ever recorded |
| `audit_logs` | 1266 total (506 error_1007) | Error flood since connection |
| `esp_heartbeat_logs` | 140 | Since 13:48 UTC today |
| `actuator_configs` | 0 | None configured (correct) |

### ESP32 Heartbeat Data
```json
{
  "sensor_count": 2,
  "actuator_count": 0,
  "heap_free": 201308,
  "wifi_rssi": -53,
  "gpio_status": [
    {"gpio": 4,  "owner": "bus/onewire/4", "component": "OneWireBus"},
    {"gpio": 21, "owner": "system", "component": "I2C_SDA"},
    {"gpio": 22, "owner": "system", "component": "I2C_SCL"}
  ]
}
```

- WiFi signal: -53 dBm (good)
- Free heap: 201KB (healthy)
- I2C bus: GPIO 21/22 reserved (correct)
- OneWire bus: GPIO 4 reserved (unnecessary, Bug B6)
- Uptime: ~47 minutes at time of analysis

---

## Priority Fix Order

### Phase 1: Stop the Bleeding (Firmware)
1. **B2 Fix** - Add `last_reading = now` on measurement failure (stops error flood)
2. **B4 Fix** - Accept empty actuator array as valid (stops config error)

### Phase 2: Root Cause (Hardware + Firmware)
3. **B1 Investigate** - Hardware check: pull-ups, wiring, power
4. **B1 Fix** - Increase conversion delay / add retry in I2C protocol

### Phase 3: Architecture (Firmware)
5. **B3 Fix** - Add multi-value dedup in performAllMeasurements()
6. **B5 Fix** - Extend GpioStatusItem owner pattern
7. **B6 Fix** - Conditional OneWire initialization

### Additional Recommendations
- **Error Rate Limiting (ESP32):** Add deduplication in `ErrorTracker::trackError()` - suppress repeated identical errors within configurable window (e.g., 30 seconds)
- **Error Rate Limiting (Server):** Add deduplication in `ErrorEventHandler` - store latest error per device+code, update count instead of creating new rows
- **Audit Log Cleanup:** DELETE old Error 1007 entries to reduce DB bloat:
  ```sql
  -- NEEDS PERMISSION: 506+ error entries in last hour alone
  DELETE FROM audit_logs
  WHERE source_id = 'ESP_472204' AND error_code = '1007';
  ```

---

## Previous Report Comparison (SHT31_ANALYSIS_REPORT.md, 2026-02-24)

The previous report identified:
- **Fix 1 (SENSOR_TYPE_MAP):** ALREADY FIXED in current code. `"sht31"` entry exists at line 148.
- **Fix 2 (GPIO=NULL for I2C):** NOT yet implemented. DB still stores `gpio=0`.
- **Fix 3 (Frontend UX):** NOT yet implemented.
- **Fix 4 (Soft Reset):** NOT yet implemented.

The previous report did NOT identify:
- B2: Missing backoff on failure (error flood)
- B3: Duplicate multi-value measurement
- B4: Empty actuator config error
- B5: GpioStatusItem owner pattern mismatch
- B6: Unconditional OneWire init

---

*Report written to: `.claude/reports/current/ESP32_SHT31_FULL_DIAGNOSIS.md`*
*Analysis performed: 2026-02-25 ~20:10-20:25 UTC*
