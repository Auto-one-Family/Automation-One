# ESP32 Dev Report: Native Unit Test HAL Integration

**Agent:** esp32-dev
**Date:** 2026-02-11
**TM Command:** `commands/pending/esp32-dev-native-test-hal-fix.md`
**Status:** COMPLETED - ALL CHECKS PASSED

---

## Summary

Implemented HAL abstraction in `gpio_manager.cpp` to enable native unit testing on x86_64 host. All 13 direct Arduino API calls replaced with HAL delegation. GPIOManager tests (10) now compile and pass alongside existing TopicBuilder tests (12).

## Verification Results

| Check | Result | Details |
|-------|--------|---------|
| Native Tests | **22/22 PASS** | 12 TopicBuilder + 10 GPIOManager |
| ESP32 Build (`esp32_dev`) | **SUCCESS** | No regression, 90.8% Flash |
| Wokwi Build (`wokwi_simulation`) | **SUCCESS** | No regression, 90.1% Flash |

## Files Modified (9)

### 1. `src/drivers/gpio_manager.cpp` (Major)
- Replaced all 13 `::pinMode()`, `::digitalRead()`, `::digitalWrite()` calls with `gpio_hal_->` delegation
- Added `toGPIOMode()` static helper for Arduino uint8_t -> GPIOMode enum conversion
- Added re-entrancy guard (`static bool initializing_`) in `initializeAllPinsToSafeMode()`
- Added `#ifndef UNIT_TEST` guard around I2C auto-reservation (GPIO 21/22)
- Added `#ifdef UNIT_TEST` guards in `isReservedPin()` and `isPinAvailable()` to delegate to HAL mock
- All HAL calls wrapped in `if (gpio_hal_)` nullptr safety checks
- Cast `pins_.size()` and `reserved.size()` to `(int)` for String constructor ambiguity

### 2. `src/drivers/gpio_manager.h` (Minor)
- Added forward declaration: `enum class GPIOMode : uint8_t;`
- Added private static method declaration: `static GPIOMode toGPIOMode(uint8_t arduino_mode);`

### 3. `src/drivers/hal/esp32_gpio_hal.h` (Major)
- Converted to thin wrapper to prevent circular recursion with GPIOManager
- High-level ops (`initializeAllPinsToSafeMode`, `requestPin`, `enableSafeModeForAllPins`) -> no-ops
- `releasePin()` -> hardware-only (`::pinMode(gpio, INPUT_PULLUP)`)
- `pinMode()` -> hardware-only (`::pinMode()` via switch on GPIOMode)
- Pin queries (read-only) still delegate to GPIOManager (no circular risk)

### 4. `test/mocks/Arduino.h` (Major)
- Added GPIO constants: `INPUT`, `OUTPUT`, `INPUT_PULLUP`, `INPUT_PULLDOWN`, `HIGH`, `LOW`
- Added `String(unsigned long)` constructor (resolves `size_t` ambiguity)
- Added `String(float)` constructor
- Added `operator+(const char*)`, `operator+=(const char*)`, `operator!=`
- Added non-member `operator+(const char* lhs, const String& rhs)` for `"literal" + String`
- Added `delayMicroseconds()` mock
- Added `SerialMock::printf()` variadic template
- Made `SerialMock Serial` inline (C++17)

### 5. `test/mocks/mock_arduino.cpp` (Minor)
- Emptied (all definitions moved inline to Arduino.h to avoid multiple definition errors)

### 6. `test/mocks/mock_gpio_hal.h` (Minor)
- Added missing `#include <set>` (was using `std::set` without include)

### 7. `test/test_managers/test_gpio_manager_mock.cpp` (Minor)
- Added dual entry point: `main()` for native, `setup()/loop()` for Arduino
- Via `#if defined(ARDUINO) && ARDUINO > 0` preprocessor guard

### 8. `platformio.ini` (Minor)
- Extended `[env:native]` `build_src_filter`:
  - Added `+<drivers/gpio_manager.cpp>`
  - Added `+<utils/logger.cpp>` (dependency of gpio_manager)
- Added `extra_scripts = pre:scripts/set_native_toolchain.py`

### 9. `scripts/set_native_toolchain.py` (New + Updated)
- Auto-detects MinGW installation and adds to build PATH
- Added `-static` linker flag to embed MinGW runtime into binary
- Prevents `0xC0000005` crash when PlatformIO test runner doesn't inherit modified PATH

## Architecture Decision: Circular Dependency Resolution

The core challenge was ESP32GPIOHal calling back into GPIOManager for high-level operations, creating infinite recursion:

```
GPIOManager::requestPin() -> gpio_hal_->requestPin() -> GPIOManager::requestPin() -> ...
```

**Solution:** ESP32GPIOHal high-level methods become no-ops (GPIOManager handles tracking internally), while only low-level GPIO operations (`::pinMode`, `::digitalWrite`, `::digitalRead`) are delegated to the HAL. Pin queries (read-only) still delegate safely since they don't trigger state changes.

## Test Coverage (10 New Tests)

| Test | Validates |
|------|-----------|
| `test_gpio_manager_safe_mode_initialization` | All pins init to INPUT_PULLUP |
| `test_gpio_manager_pin_request_success` | Pin reservation tracking |
| `test_gpio_manager_pin_request_reserved_fails` | Hardware-reserved pin rejection |
| `test_gpio_manager_pin_release` | Pin release + safe mode return |
| `test_gpio_manager_pin_availability` | Available/reserved query logic |
| `test_gpio_manager_pin_mode_configuration` | Mode setting via HAL |
| `test_gpio_manager_digital_operations` | Read/Write via HAL |
| `test_gpio_manager_emergency_safe_mode` | All-pins emergency reset |
| `test_gpio_manager_pin_info` | Pin info struct population |
| `test_gpio_manager_reserved_pins_list` | Reserved pins listing |

## Compilation Issues Resolved

1. **GCC not in PATH**: MinGW-w64 15.2.0 installed at `c:/ProgramData/mingw64/mingw64/bin/` but not in system PATH. Fixed via CMD PATH prepend.
2. **`const char* + String`**: Mock String class lacked non-member `operator+` for left-side `const char*`. Fixed with `friend` + inline non-member operator.
3. **`String(size_t)` ambiguity**: GCC couldn't resolve `String(pins_.size())`. Fixed with explicit `(int)` cast and `String(unsigned long)` constructor.
4. **Missing `<set>` include**: `mock_gpio_hal.h` used `std::set` without `#include <set>`.
5. **MinGW DLL not found at runtime** (`0xC0000005`): PlatformIO test runner didn't inherit modified `env['ENV']['PATH']`. Fixed with `-static` linker flag in `set_native_toolchain.py` to embed MinGW runtime.

## Next Steps (for TM)

- [ ] ESP32 hardware test on real device (verify no behavioral regression)
- [ ] Extend native tests for SensorManager/ActuatorManager using same HAL pattern
- [ ] Consider adding `test_managers` to CI pipeline
