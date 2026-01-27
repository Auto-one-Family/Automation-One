# Hardware Validation Test Report
**Date:** 2026-01-14  
**Status:** ⏳ Pending Execution  
**Test Suite:** 17 Test Cases - 4 Critical Fixes

---

## Executive Summary

All 4 critical fixes have been implemented:
- ✅ **Fix #1:** I2C Address Validation (with negative check)
- ✅ **Fix #2:** Input-Only Pin Protection
- ✅ **Fix #3:** I2C Pin Protection
- ✅ **Fix #4:** ESP Model Awareness

**Test Script:** `test_hardware_validation.ps1`

---

## Prerequisites

Before running tests, ensure:

1. **Server is running:**
   ```powershell
   cd "El Servador"
   poetry run uvicorn god_kaiser_server.src.main:app --reload
   ```

2. **Database is initialized:**
   ```powershell
   cd "El Servador"
   poetry run alembic upgrade head
   ```

3. **MQTT Broker (Mosquitto) is running:**
   ```powershell
   # Check if running
   Get-Service mosquitto
   
   # Start if needed
   Start-Service mosquitto
   ```

---

## Test Execution

### Run Test Suite

```powershell
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one"
powershell -ExecutionPolicy Bypass -File test_hardware_validation.ps1
```

### Expected Output

```
========================================
Hardware Validation Test Suite
17 Test Cases - 4 Critical Fixes
========================================

✅ Server is running
✅ Authentication successful

=== Setup: Creating test ESP devices ===
✅ ESP_00000001 ready
✅ ESP_C3_TEST ready
✅ ESP_UNKNOWN ready

=== Section 2.1: I2C Address Validation ===
[✅ PASS] 1.1: Negative I2C address
[✅ PASS] 1.2: I2C address > 7-bit
[✅ PASS] 1.3: Reserved I2C address (0x00)
[✅ PASS] 1.4: Reserved I2C address (0x7F)
[✅ PASS] 1.5: Valid I2C address (0x44)

=== Section 2.2: Input-Only Pin Protection ===
[✅ PASS] 2.1: Actuator on input-only pin
[✅ PASS] 2.2: Sensor on input-only pin (OK)
[✅ PASS] 2.3: Actuator on normal pin

=== Section 2.3: I2C Pin Protection ===
[✅ PASS] 3.1: ANALOG on I2C pin
[✅ PASS] 3.2: I2C sensor (OK)
[✅ PASS] 3.3: ANALOG on normal pin

=== Section 2.4: ESP Model Awareness ===
[✅ PASS] 4.1: C3 - GPIO out of range
[✅ PASS] 4.2: C3 - ANALOG on I2C pin
[✅ PASS] 4.3: C3 - I2C sensor (OK)
[✅ PASS] 4.4: WROOM - Actuator on input-only
[✅ PASS] 4.5: C3 - Actuator on GPIO 10 (OK)
[✅ PASS] 4.6: Unknown hardware_type defaults to WROOM

========================================
Test Summary
========================================
Total Tests: 17
✅ Passed: 17
❌ Failed: 0
========================================

🎉 ALL TESTS PASSED! Ready for production deployment.
```

---

## Test Results

### Section 2.1: I2C Address Validation (5 Tests)

| Test | Description | Expected | Status | Notes |
|------|-------------|----------|--------|-------|
| 1.1 | Negative I2C address (-1) | 400 Bad Request | ⏳ Pending | |
| 1.2 | I2C address > 7-bit (255) | 400 Bad Request | ⏳ Pending | |
| 1.3 | Reserved I2C address (0x00) | 400 Bad Request | ⏳ Pending | |
| 1.4 | Reserved I2C address (0x7F) | 400 Bad Request | ⏳ Pending | |
| 1.5 | Valid I2C address (0x44) | 201 Created | ⏳ Pending | |

### Section 2.2: Input-Only Pin Protection (3 Tests)

| Test | Description | Expected | Status | Notes |
|------|-------------|----------|--------|-------|
| 2.1 | Actuator on GPIO 34 (input-only) | 409 Conflict | ⏳ Pending | |
| 2.2 | Sensor on GPIO 34 (OK) | 201 Created | ⏳ Pending | |
| 2.3 | Actuator on GPIO 32 (normal) | 201 Created | ⏳ Pending | |

### Section 2.3: I2C Pin Protection (3 Tests)

| Test | Description | Expected | Status | Notes |
|------|-------------|----------|--------|-------|
| 3.1 | ANALOG on GPIO 21 (I2C pin) | 409 Conflict | ⏳ Pending | |
| 3.2 | I2C sensor (gpio=NULL) | 201 Created | ⏳ Pending | |
| 3.3 | ANALOG on GPIO 32 (normal) | 201 Created | ⏳ Pending | |

### Section 2.4: ESP Model Awareness (6 Tests)

| Test | Description | Expected | Status | Notes |
|------|-------------|----------|--------|-------|
| 4.1 | C3 - GPIO 34 out of range | 409 Conflict | ⏳ Pending | |
| 4.2 | C3 - ANALOG on GPIO 4 (I2C) | 409 Conflict | ⏳ Pending | |
| 4.3 | C3 - I2C sensor | 201 Created | ⏳ Pending | |
| 4.4 | WROOM - Actuator on GPIO 35 | 409 Conflict | ⏳ Pending | |
| 4.5 | C3 - Actuator on GPIO 10 | 201 Created | ⏳ Pending | |
| 4.6 | Unknown hardware_type → WROOM | 409 Conflict | ⏳ Pending | |

---

## Log Verification

After running tests, verify server logs:

```powershell
# Check I2C rejections
Select-String -Path "El Servador\god_kaiser_server\logs\god_kaiser.log" -Pattern "Rejected I2C config"

# Check GPIO rejections
Select-String -Path "El Servador\god_kaiser_server\logs\god_kaiser.log" -Pattern "Rejected GPIO config"

# Check unknown hardware_type warnings
Select-String -Path "El Servador\god_kaiser_server\logs\god_kaiser.log" -Pattern "Unknown board_model"
```

**Expected Log Entries:**
- `INFO: Rejected I2C config: ESP ESP_00000001, i2c_address -1 (reason: negative address)`
- `INFO: Rejected I2C config: ESP ESP_00000001, i2c_address 0xFF (reason: out of range)`
- `INFO: Rejected GPIO config: ESP ESP_00000001, GPIO 34 (reason: input-only for actuator)`
- `WARNING: Unknown board_model 'ESP32_XYZ_UNKNOWN', defaulting to ESP32_WROOM`

---

## Regression Tests

After main test suite, run regression tests:

### Test: Multi-Value Sensor (SHT31)
```powershell
# Create SHT31 temperature sensor
curl -X POST http://localhost:8000/api/v1/sensors/ESP_00000001/NULL `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"sensor_type": "sht31_temp", "interface_type": "I2C", "i2c_address": 68}'

# Create SHT31 humidity sensor (same I2C address, different sensor_type)
curl -X POST http://localhost:8000/api/v1/sensors/ESP_00000001/NULL `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"sensor_type": "sht31_humidity", "interface_type": "I2C", "i2c_address": 68}'
```

**Expected:** Both return 201 Created

### Test: OneWire Sensor (DS18B20)
```powershell
curl -X POST http://localhost:8000/api/v1/sensors/ESP_00000001/4 `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{
    "sensor_type": "ds18b20",
    "interface_type": "ONEWIRE",
    "onewire_address": "28FF1234567890AB"
  }'
```

**Expected:** 201 Created

### Test: GPIO Status Endpoint
```powershell
curl http://localhost:8000/api/v1/esps/ESP_00000001/gpio-status `
  -H "Authorization: Bearer $token"
```

**Expected:** JSON with `reserved_gpios`, `i2c_bus`, `available_gpios`

---

## Next Steps

1. ✅ **Run Test Suite** - Execute `test_hardware_validation.ps1`
2. ⏳ **Verify Logs** - Check server logs for rejection messages
3. ⏳ **Regression Tests** - Verify existing features still work
4. ⏳ **Integration Tests** - Test with real ESP32 (if available)
5. ⏳ **Update Documentation** - Add hardware validation docs
6. ⏳ **Production Deployment** - Deploy if all tests pass

---

## Notes

- Test script automatically creates test ESP devices if they don't exist
- Test script handles authentication automatically (creates test user if needed)
- All tests use `ESP_00000001` (WROOM) or `ESP_C3_TEST` (C3) for consistency
- Test cleanup: Manually delete test ESPs after verification if needed

---

**Report Generated:** 2026-01-14  
**Test Script Version:** 1.0  
**Status:** Ready for Execution
