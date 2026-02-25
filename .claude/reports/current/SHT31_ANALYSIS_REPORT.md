# SHT31 Bug Analysis + Hardware Verification Report

**Date:** 2026-02-24
**Branch:** fix/sht31-hardware-analysis (from master)
**Author:** Auto-Ops (esp32-debug + server-debug)
**Status:** Analysis complete — Fixes ready to implement

---

## Executive Summary

Two independent issues were found:

1. **GPIO-0 Persistence Bug** — Root cause identified: `AddSensorModal.vue` deliberately sets `gpio=0` as placeholder for I2C sensors. The server's `GpioValidationService` correctly skips GPIO validation for I2C sensors (line 407-414 in `sensors.py`), so `gpio=0` is accepted without error. The DB stores `gpio=0` with `i2c_address=68` — this is technically correct I2C storage but `gpio=0` (Boot-Strapping pin) is a misleading value.

2. **SHT31 Dual-Value Bug** — The bug is **architecture-level**: the server sends a single config entry with `sensor_type="sht31"` to the ESP32. The ESP32 `performAllMeasurements()` calls `findSensorCapability("sht31")` → finds `is_multi_value=true` → uses `performMultiValueMeasurement()` which correctly reads both temp AND humidity via `readSensorRaw()`. However, `sensor_type="sht31"` is NOT in the `SENSOR_TYPE_MAP` lookup table (only `"sht31_temp"` and `"sht31_humidity"` are registered). This means `findSensorCapability("sht31")` returns `nullptr`, falling back to the **single-value codepath** (lines 596-603), which reads ONLY temperature bytes.

---

## Part A: GPIO-0 Persistence Bug

### A1 — Database State

**Current DB state (queried 2026-02-24):**

```sql
SELECT sc.id, sc.esp_id, sc.sensor_type, sc.gpio, sc.i2c_address,
       sc.interface_type, sc.enabled, e.device_id, e.name, e.status
FROM sensor_configs sc JOIN esp_devices e ON sc.esp_id = e.id
WHERE sc.gpio = 0;
```

| id | sensor_type | gpio | i2c_address | interface_type | enabled | device_id | status |
|----|-------------|------|-------------|----------------|---------|-----------|--------|
| 53546d12-... | sht31 | 0 | 68 | I2C | true | ESP_472204 | offline |

**Count:** 1 entry with `gpio=0` from Robin's first connection on 2026-02-20.

### A2 — Root Cause (Backend Validation)

**File:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` lines 407-414

```python
if interface_type == "I2C":
    # I2C: Check i2c_address conflict, NOT GPIO conflict
    await _validate_i2c_config(...)
    # I2C sensors can share GPIO (bus pins 21/22)
    # No GPIO validation needed         <-- GPIO validation deliberately skipped
```

The `GpioValidationService` with its `SYSTEM_RESERVED_PINS = {0, 1, 2, ...}` is **only called for ANALOG/DIGITAL interface types**. For I2C sensors, only the `i2c_address` is validated for conflicts, not the GPIO.

**File:** `El Frontend/src/components/esp/AddSensorModal.vue` line 166

```typescript
if (isI2CSensor.value && selectedI2CAddress.value !== null) {
    sensorData.interface_type = 'I2C'
    sensorData.i2c_address = selectedI2CAddress.value
    sensorData.gpio = 0    // <-- deliberately set to 0 as placeholder
}
```

The frontend intentionally sends `gpio=0` for all I2C sensors because the real identifier is `i2c_address`. This is by design, not a bug per se — BUT `gpio=0` is a Boot-Strapping pin and visually misleading in the UI.

**Root cause assessment:** NOT a validation bypass — it is a design decision where `gpio=0` is used as a null-placeholder for I2C sensors. The server correctly stores it. The displayed "error messages" Robin saw likely came from the ESP32 serial log (which correctly rejects GPIO 0 for non-I2C configs), not from the API.

**Schema note:** `sensor_configs` has a `UNIQUE CONSTRAINT btree (esp_id, gpio, sensor_type, onewire_address, i2c_address)`. For I2C sensors, uniqueness is enforced on `(esp_id, gpio=0, sensor_type, i2c_address)` — this means two SHT31 configs on the same ESP would conflict. That's acceptable.

### A3 — Frontend Display Root Cause

Frontend shows GPIO 0 because:
- DB correctly stores `gpio=0` for the SHT31 I2C config
- Frontend reads from DB → correctly displays what DB contains
- **Frontend is NOT the problem** — the display is accurate

**Conclusion:** The `gpio=0` for I2C sensors is **intentional design** but potentially confusing. No "bug" to fix here per se, but the UX can be improved.

### A4 — Fix Recommendations

| Priority | Fix | File | Type |
|----------|-----|------|------|
| HIGH | Replace `gpio=0` placeholder with `NULL` in DB for I2C sensors | Alembic migration | Schema change |
| HIGH | Frontend: Show "I2C (Adresse 0x44)" instead of "GPIO 0" for I2C sensors | `SensorSatellite.vue`, `ESPConfigPanel.vue` | UI display |
| MEDIUM | Config builder: GPIO-conflict check must skip `gpio=NULL` or `gpio=0` for I2C | `config_builder.py` lines 204-212 | Logic fix |
| LOW | Add DB constraint: `CHECK (interface_type = 'I2C' OR gpio NOT IN (0,1,2,3,6,7,8,9,10,11,12))` | Alembic migration | DB constraint |

**Important:** For I2C sensors, `i2c_address` is the real identifier. A DB constraint blocking `gpio=0` for I2C would break the current design. The correct fix is to store `NULL` in the `gpio` column for I2C sensors and add a constraint `CHECK (interface_type = 'I2C' AND gpio IS NULL OR interface_type != 'I2C' AND gpio IS NOT NULL AND gpio NOT IN (0,1,2,3,6,7,8,9,10,11,12))`.

### A5 — Checklist A

- [x] **DB-Abfrage:** 1 sensor_config mit gpio=0 (sht31, ESP_472204, i2c_address=68)
- [x] **Root Cause identifiziert:** Frontend setzt GPIO=0 bewusst als Platzhalter für I2C (AddSensorModal.vue:166). API skippt GPIO-Validierung für I2C korrekt (sensors.py:407-414)
- [ ] **DB bereinigen:** `UPDATE sensor_configs SET gpio = NULL WHERE interface_type = 'I2C' AND gpio = 0;` (needs schema change first)
- [ ] **Schema ändern:** `gpio` column für I2C sensors auf NULL erlauben (Alembic migration)
- [ ] **Config builder fix:** GPIO-conflict check für NULL-GPIO überspringen
- [ ] **Frontend UX fix:** "GPIO 0" → "I2C 0x44" für I2C sensors in Anzeige
- [ ] **DB Constraint hinzufügen:** CHECK-Constraint für non-I2C sensors
- [x] **Frontend Reload:** Zeigt korrekt was in DB steht — kein Frontend-Bug

---

## Part B: SHT31 Dual-Value Bug

### B1 — Firmware Version and Library

**Verified files:**
- `El Trabajante/src/drivers/i2c_sensor_protocol.cpp` — uses command `{0x24, 0x00}` (High Repeatability, **Clock Stretch Disabled**)
- `El Trabajante/src/config/hardware/esp32_dev.h` — `I2C_FREQUENCY = 100000` (100kHz, Standard Mode)
- `El Trabajante/src/drivers/i2c_bus.cpp:114` — `Wire.setTimeOut(100)` (100ms)
- Protocol `conversion_time_ms = 16` (15.5ms max + 0.5ms margin)

**Clock Stretching:** DISABLED via command `0x2400`. The original timing problem from the bug report (Wire timeout 12.5ms < SHT31 15.5ms) **does NOT apply** here because the firmware correctly uses the non-clock-stretching variant. This was already fixed.

The `I2C_READ_TIMEOUT_MS = 100` (100ms, defined in `i2c_bus.cpp:568`) is well above the 16ms conversion time.

### B2 — CRITICAL BUG: sensor_type Lookup Failure

**Root cause of humidity not being published:**

**File:** `El Trabajante/src/models/sensor_registry.cpp` lines 114-118

```cpp
// SENSOR_TYPE_MAP — maps ESP32 received type to SensorCapability
static const SensorTypeMapping SENSOR_TYPE_MAP[] = {
    {"temperature_sht31", &SHT31_TEMP_CAP},
    {"humidity_sht31",    &SHT31_HUMIDITY_CAP},
    {"sht31_temp",        &SHT31_TEMP_CAP},     // Already normalized
    {"sht31_humidity",    &SHT31_HUMIDITY_CAP},  // Already normalized
    // ...
};
```

**Missing entry: `"sht31"` is NOT in the lookup table.**

**Server sends:** `sensor_type = "sht31"` (from DB `sensor_configs.sensor_type`)
**ESP32 lookup:** `findSensorCapability("sht31")` → returns `nullptr`
**Fallback path:** `performMeasurement()` single-value path (lines 580-607)
**Fallback behavior:** Uses `readRawI2C()` with direct 6-byte read, extracts ONLY `buffer[0]<<8 | buffer[1]` (temperature bytes), discards humidity bytes

**Expected path:** `findSensorCapability("sht31")` should return the SHT31 multi-value capability, triggering `performMultiValueMeasurement()` which correctly reads all 6 bytes and publishes both `sht31_temp` AND `sht31_humidity`.

### B3 — MQTT Output Analysis

When the ESP32 falls back to the single-value path:
- It calls `getServerSensorType("sht31")` which is also not in the map → returns `"sht31"` unchanged
- It publishes ONE message with `sensor_type="sht31"` and `raw_value = temp_bytes_only`
- **Humidity is never published**

When the ESP32 uses the multi-value path (after fix):
- `performMultiValueMeasurement()` iterates `value_types = ["sht31_temp", "sht31_humidity"]`
- `extractRawValue("sht31", "sht31_temp", buffer, 6)` → `raw = buffer[0]<<8 | buffer[1]` (correct)
- `extractRawValue("sht31", "sht31_humidity", buffer, 6)` → `raw = buffer[3]<<8 | buffer[4]` (correct)
- Two separate MQTT publishes: one for `sht31_temp`, one for `sht31_humidity`

### B4 — NaN Handling

No explicit `isnan()` checks found in the firmware. The system handles missing data via:
1. `readSensorRaw()` returning `false` on I2C error → `performMultiValueMeasurement()` returns 0
2. `pi_processor_->sendRawData()` validates values server-side
3. Invalid readings: `processed.valid = false` → skipped in publish loop (line 988: `if (success && processed.valid)`)

**Assessment:** NaN handling is adequate via the success/valid flags.

### B5 — Backend Processing (Server-Side)

**File:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/humidity.py`
- SHT31 humidity library exists and processes `sensor_type = "sht31_humidity"`
- Formula: `humidity_rh = 100 * raw_value / 65535.0` (correct)
- Plausibility check: 0-100% RH range

**File:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` line 1360
```python
if any(s in sensor_lower for s in ["sht31", "bmp280", ...]):
    return "I2C"
```
Backend correctly infers `interface_type = "I2C"` for SHT31.

**Current DB config issue:** The DB stores `sensor_type = "sht31"` (not `"sht31_temp"` or `"sht31_humidity"`). This means:
- Config builder sends `sensor_type = "sht31"` to ESP32
- ESP32 cannot find this type in its registry
- Multi-value measurement path is never triggered

### B6 — Frontend Display

Frontend has both `sht31_temp` and `sht31_humidity` display options in `sensorDefaults.ts`. However, because the DB only has ONE config entry with `sensor_type="sht31"` (not two separate entries), the frontend can only display one widget. After the fix, two separate DB entries would exist, and the frontend would correctly show both.

### B7 — Fix (Critical)

**Option A (Minimal — ESP32 only):** Add `"sht31"` to the `SENSOR_TYPE_MAP` in firmware, pointing to a new multi-value "base" capability. This lets the ESP32 handle `sensor_type="sht31"` as a multi-value sensor.

**Option B (Correct — Full Stack):** Change the server to store and send TWO separate sensor configs per SHT31 device: one with `sensor_type="sht31_temp"` and one with `sensor_type="sht31_humidity"`. Both share the same `i2c_address=68`, `interface_type="I2C"`. The ESP32 already supports this via the multi-value I2C sensor stacking (sensor_manager.cpp lines 184-212).

**Recommendation: Option B** — aligns with the ESP32 registry design and the two-entry SENSOR_TYPE_MAP pattern. Option A adds technical debt.

### B8 — Checklist B

- [x] **Library-Version:** Custom protocol driver (not Adafruit_SHT31), uses `0x2400` (no clock stretch) — timing bug does NOT apply
- [x] **Wire Timeout:** `Wire.setTimeOut(100)` = 100ms, well above 16ms conversion time — adequate
- [x] **Critical Bug found:** `"sht31"` missing from `SENSOR_TYPE_MAP` → `findSensorCapability("sht31")` returns nullptr → falls to single-value path → only temperature published
- [x] **NaN handling:** Adequate via success/valid flags, no raw NaN published
- [x] **Backend processing:** `sht31_humidity` library exists and correct
- [x] **Frontend display:** Has both `sht31_temp`/`sht31_humidity` options but DB only has one config entry currently

---

## Part C: SHT31 Hardware Verification

### C1 — Sensor Initialization

```cpp
// File: El Trabajante/src/drivers/i2c_bus.cpp lines 100-114
Wire.begin(sda_pin_, scl_pin_, frequency_);
Wire.setTimeOut(100);  // 100ms
```

No explicit `heater(false)` call found — the `0x2400` command (single-shot measurement) does not activate the heater. The heater is controlled by commands `0x306D` (on) / `0x3066` (off). Since the firmware only sends `0x2400` measurement commands, the heater stays in default-off state. **Acceptable.**

**Plausibility checks:** Performed server-side in the sensor library processors, not on ESP32 (correct — server-centric design).

### C2 — Soft Reset

No `0x30A2` (soft reset) command found in the firmware. I2C bus recovery (9 clock pulses, SCL toggling) is implemented in `i2c_bus.cpp` lines 407-451 for bus recovery after errors. This is a lower-level recovery than a sensor soft reset.

**Recommendation:** Add soft reset attempt before bus recovery for persistent I2C errors.

### C3 — Measurement Interval and I2C Bus Recovery

- `measurement_interval_ms` is configurable per sensor via `sample_interval_ms` DB field
- Default fallback: `measurement_interval_` (global)
- I2C bus recovery implemented: 9 clock pulses on SDA/SCL if bus error detected
- Recovery only triggers for `error == 4` (bus error) or `error == 5` (timeout) from `Wire.endTransmission()`

**I2C Pins:** `esp32_dev.h` defines `I2C_SDA` and `I2C_SCL` (standard ESP32 = GPIO21/22).

**Assessment:** Adequate for hardware testrun.

---

## Part D: Database State Documentation

### ESP Devices

| device_id | hardware_type | status | ip_address | last_seen |
|-----------|---------------|--------|------------|-----------|
| ESP_472204 | ESP32_WROOM | offline | 192.168.0.148 | 2026-02-21 10:48 |
| MOCK_0954B2B1 | MOCK_ESP32 | online | 127.0.0.1 | 2026-02-24 15:50 |
| MOCK_5D5ADA49 | MOCK_ESP32 | offline | 127.0.0.1 | 2026-02-23 23:48 |

**Real ESP32 (ESP_472204):** offline since 2026-02-21. Approved at 2026-02-20 22:24.

### All Sensor Configs

| id | esp_id | sensor_type | gpio | i2c_address | interface_type | enabled |
|----|--------|-------------|------|-------------|----------------|---------|
| 53546d12-... | 3c4c4130 (ESP_472204) | sht31 | 0 | 68 | I2C | true |

**Only 1 sensor config exists** — for the real ESP32's SHT31 at I2C address 0x44 (=68 decimal).

---

## Critical Fixes Required Before Hardware Testrun

### Fix 1 — CRITICAL: Add "sht31" to ESP32 Sensor Registry

**File:** `El Trabajante/src/models/sensor_registry.cpp`

Add `{"sht31", &SHT31_TEMP_CAP}` to `SENSOR_TYPE_MAP` with `is_multi_value = true`.

Alternatively, create a new base capability struct:
```cpp
static const SensorCapability SHT31_BASE_CAP = {
    .server_sensor_type = "sht31",
    .device_type = "sht31",
    .i2c_address = 0x44,
    .is_multi_value = true,
    .is_i2c = true,
};
// In SENSOR_TYPE_MAP:
{"sht31", &SHT31_BASE_CAP},
```

This allows `findSensorCapability("sht31")` → `is_multi_value=true` → `performMultiValueMeasurement()`.

**OR (preferred):** Migrate to Option B (two separate DB entries, `sht31_temp` + `sht31_humidity`).

### Fix 2 — HIGH: DB Migration for I2C Sensors (gpio=NULL)

**File:** New Alembic migration

```sql
-- Allow NULL gpio for I2C sensors
ALTER TABLE sensor_configs ALTER COLUMN gpio DROP NOT NULL;

-- Update existing I2C entries
UPDATE sensor_configs SET gpio = NULL WHERE interface_type = 'I2C' AND gpio = 0;

-- Add constraint for non-I2C sensors
ALTER TABLE sensor_configs ADD CONSTRAINT check_gpio_for_non_i2c
    CHECK (interface_type = 'I2C' OR (gpio IS NOT NULL AND gpio NOT IN (0,1,3,6,7,8,9,10,11,12)));
```

**Important:** `config_builder.py` GPIO conflict detection (lines 204-212) must skip NULL gpio values.

### Fix 3 — MEDIUM: Frontend UX for I2C Sensors

**File:** `El Frontend/src/components/esp/ESPConfigPanel.vue` or `SensorSatellite.vue`

Display I2C sensors as "I2C — 0x44 (SHT31)" instead of "GPIO 0" in the pin usage list.

### Fix 4 — LOW: Soft Reset for Persistent SHT31 Errors

**File:** `El Trabajante/src/drivers/i2c_bus.cpp`

Add soft reset command `{0x30, 0xA2}` attempt before bus recovery for `ERROR_I2C_TIMEOUT`.

---

## Hardware Testrun Readiness Assessment

| Check | Status | Notes |
|-------|--------|-------|
| I2C timing (clock stretch) | OK | Uses 0x2400 (no CS), 16ms conversion, 100ms timeout |
| Wire timeout adequate | OK | 100ms >> 16ms conversion |
| SHT31 read logic (6 bytes) | OK | extractRawValue correctly parses bytes 0-1 (temp) and 3-4 (humidity) |
| Multi-value publish path | BLOCKED | "sht31" missing from SENSOR_TYPE_MAP — Fix 1 required |
| GPIO-0 in DB | WARNING | Design-accepted but misleading — Fix 2 recommended |
| Backend humidity processing | OK | sht31_humidity library correct |
| CRC validation | VERIFY | CRC check implemented in i2c_sensor_protocol but test needed |
| Heater disabled | OK | No heater command in firmware, default=off |
| Bus recovery | OK | 9-pulse recovery implemented |

**Verdict:** The hardware testrun can start for temperature-only reading. For humidity, **Fix 1 must be applied first**. The ESP32 will currently publish only temperature because it falls back to the single-value codepath.

---

## Next Steps

1. **Implement Fix 1** (ESP32 registry) — add `"sht31"` to SENSOR_TYPE_MAP OR migrate to two-entry DB design
2. **Rebuild firmware** — `cd "El Trabajante" && pio run -e esp32_dev`
3. **Flash ESP32** — `pio run -e esp32_dev -t upload` (requires user confirmation)
4. **Verify MQTT output** — subscribe to `automationone/#` and confirm both `sht31_temp` and `sht31_humidity` messages arrive
5. **Implement Fix 2** (DB migration for gpio=NULL) — after verifying the firmware fix works
6. **Implement Fix 3** (Frontend UX) — low priority, cosmetic

---

*Report written to: `.claude/reports/current/SHT31_ANALYSIS_REPORT.md`*
*Branch: `fix/sht31-hardware-analysis`*
