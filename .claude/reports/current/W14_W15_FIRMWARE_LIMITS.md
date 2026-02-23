# W14 / W15 - DS18B20 Firmware Limit Detection & Wokwi Limitations

> **Date:** 2026-02-23
> **Agent:** Implementer Subagent
> **Status:** COMPLETE

---

## W14: DS18B20 -127 C Sensor Fault Detection

### Problem
The DS18B20 returns -127 C (RAW: -2032) when the sensor is disconnected, has a CRC failure, or suffers a bus wiring error. Without detection, the server interprets this as a real measurement and activates emergency heating.

### Firmware Implementation (VERIFIED)
- **File:** `El Trabajante/src/services/sensor/sensor_manager.cpp:689-709`
- **Constant:** `DS18B20_RAW_SENSOR_FAULT = -2032` (line 28)
- **Error Code:** `ERROR_DS18B20_SENSOR_FAULT = 1060` (`error_codes.h:66`)
- **Behavior:**
  1. Detects `raw_temp == DS18B20_RAW_SENSOR_FAULT`
  2. Logs ERROR: `"DS18B20 SENSOR FAULT detected: -127 C (GPIO %d)"`
  3. Tracks via `ErrorTracker` (published to MQTT error topic)
  4. Sets `reading_out.valid = false`, `quality = "error"`
  5. Returns `false` - value is NOT published as valid sensor data

### Test Coverage
| Layer | Test File | Status |
|-------|-----------|--------|
| Firmware (Wokwi) | `08-onewire/onewire_error_minus127.yaml` | LIMITED - Wokwi cannot simulate -127 C |
| Firmware (Native) | none | NOT COVERED - no native ESP32 unit test |
| Backend Unit | `test_services_sensor.py:527` (`test_process_ds18b20_sensor_fault`) | PASS |
| Backend Unit | `test_sensor_edge_cases.py:42` | PASS |
| Backend Integration | `test_ds18b20_cross_esp_logic.py:96,160` | PASS |

### Wokwi Limitation
The Wokwi DS18B20 simulator does NOT return -127 C under any conditions. Setting `temperature=-127` in `diagram.json` does not work because Wokwi simulates a "healthy" sensor that always returns the configured value. The YAML scenario documents expected behavior for code review but cannot actively test fault detection.

**LIMITATION comment added to:** `onewire_error_minus127.yaml` (line 22)

### Gap
No native ESP32 unit test exists for -127 C detection. Recommendation: add a native Unity test that calls the detection logic with RAW -2032 to verify the firmware path independently of Wokwi.

---

## W15: DS18B20 85 C Power-On Reset Detection

### Problem
After power-on, the DS18B20 returns +85 C (RAW: 1360) as factory default BEFORE the first conversion completes. If published as valid data, the server thinks the greenhouse is at 85 C and activates maximum cooling.

### Firmware Implementation (VERIFIED)
- **File:** `El Trabajante/src/services/sensor/sensor_manager.cpp:711-761`
- **Constant:** `DS18B20_RAW_POWER_ON_RESET = 1360` (line 29)
- **Error Code:** `ERROR_DS18B20_POWER_ON_RESET = 1061` (`error_codes.h:67`)
- **Behavior:**
  1. Detects `raw_temp == DS18B20_RAW_POWER_ON_RESET && reading_count == 0` (first reading only)
  2. Logs WARNING: `"DS18B20 power-on reset detected: 85 C (GPIO %d)"`
  3. Triggers retry with conversion delay (100ms)
  4. On retry success: uses new value, logs resolution
  5. On retry still 85 C: accepts as potentially valid (could be actual fire)
  6. On retry returning -127 C: treats as sensor fault
  7. On retry read failure: rejects with error
  8. After first reading, 85 C is treated as normal (to avoid rejecting real temperatures)

### Test Coverage
| Layer | Test File | Status |
|-------|-----------|--------|
| Firmware (Wokwi) | `08-onewire/onewire_error_85c_poweron.yaml` | LIMITED - Wokwi cannot simulate power-on reset |
| Firmware (Native) | none | NOT COVERED - no native ESP32 unit test |
| Backend Unit | `test_ds18b20_errors.py:95,117,156` (RAW 1360 tests) | PASS |
| Backend Integration | `test_ds18b20_cross_esp_logic.py:129` (`test_power_on_reset_ignored`) | PASS |
| Server Processing | `temperature.py:153-164` returns `quality="suspect"` with `warning_code=1061` | VERIFIED |

### Wokwi Limitation
The Wokwi DS18B20 simulator returns the configured temperature immediately. It does NOT simulate the power-on reset behavior where 85 C is returned before the first conversion command completes.

**LIMITATION comment added to:** `onewire_error_85c_poweron.yaml` (line 24)

### Gap
Same as W14 - no native ESP32 unit test. The retry logic (lines 720-760 in `sensor_manager.cpp`) has multiple branches that are untestable in Wokwi and not covered by native tests.

---

## Summary of Changes Made

| File | Change |
|------|--------|
| `El Trabajante/tests/wokwi/scenarios/08-onewire/onewire_error_minus127.yaml` | Added WOKWI LIMITATION comment with verification reference |
| `El Trabajante/tests/wokwi/scenarios/08-onewire/onewire_error_85c_poweron.yaml` | Added WOKWI LIMITATION comment with verification reference |
| `El Trabajante/tests/wokwi/helpers/wait_for_mqtt.sh` | NEW: W16 helper script for MQTT connection polling |
| `El Trabajante/tests/wokwi/helpers/emergency_cascade_stress.sh` | NEW: F3 rapid emergency toggle stress test |

## Recommendations

1. **Native Unit Tests:** Create ESP32 native Unity tests for both -127 C and 85 C detection paths. These can test the detection logic directly without Wokwi.
2. **Retry Branch Coverage:** The 85 C power-on reset retry logic has 4 branches (success, still-85, fault, read-fail). All should be covered by native tests.
3. **Error Code Consistency:** Error codes 1060 (fault) and 1061 (power-on reset) are properly defined and used consistently across firmware and server.
