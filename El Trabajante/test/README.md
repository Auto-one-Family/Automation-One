# Phase 1 Unit Tests - Refactored (Industrial Grade)

Minimalistic, functional, hardware-observable test suite for Phase 1 modules.

## Philosophy

**Principles:**

- ✅ Only critical, hardware-relevant tests

- ✅ Hardware-observable via integration tests

- ✅ No redundant API tests

- ✅ Optimized for industrial environments

- ✅ Foundation for server-side test orchestration

---

## Test Files

### Unit Tests (Minimalistic)

1. **test_logger.cpp** - Logger System Tests (1 test)

   - ✅ Circular buffer behavior (hardware RAM)

2. **test_storage_manager.cpp** - StorageManager Tests (2 tests)

   - ✅ NVS initialization

   - ✅ Namespace isolation (critical for config separation)

3. **test_config_manager.cpp** - ConfigManager Tests (3 tests)

   - ✅ Initialization

   - ✅ WiFi config validation (security-critical)

   - ✅ Load all configs orchestration

4. **test_topic_builder.cpp** - TopicBuilder Tests (9 tests)

   - ✅ All 8 critical MQTT topic patterns

   - ✅ ESP ID / Kaiser ID substitution

   - ✅ Foundation for server-side validation

5. **test_error_tracker.cpp** - ErrorTracker Tests (4 tests)

   - ✅ Initialization

   - ✅ Circular buffer (hardware RAM)

   - ✅ Critical error detection (safety-critical)

   - ✅ Error categorization (server analysis)

### Integration Tests (Hardware Observability)

6. **test_integration.cpp** - Integration Tests (9 tests)

   - ✅ Boot sequence validation

   - ✅ Memory usage verification (<15KB)

   - ✅ Cross-module integration

   - ✅ Config persistence across reboot

   - ✅ **NEW:** System health MQTT export

   - ✅ **NEW:** Boot time measurement (<2s)

   - ✅ **NEW:** Memory fragmentation under load

**Total: 28 Tests** (reduced from 41)

---

## Running Tests

### Run All Tests

```bash
cd "El Trabajante"
pio test -e esp32dev
```

### Run Specific Test

```bash
pio test -e esp32dev -f test_logger
pio test -e esp32dev -f test_storage_manager
pio test -e esp32dev -f test_config_manager
pio test -e esp32dev -f test_topic_builder
pio test -e esp32dev -f test_error_tracker
pio test -e esp32dev -f test_integration
```

### Run with Verbose Output

```bash
pio test -e esp32dev -v
```

---

## Expected Results

All 28 tests should PASS:

```
Test Summary:
✅ test_logger: 1/1 PASS
✅ test_storage_manager: 2/2 PASS
✅ test_config_manager: 3/3 PASS
✅ test_topic_builder: 9/9 PASS
✅ test_error_tracker: 4/4 PASS
✅ test_integration: 9/9 PASS

Total: 28/28 PASS
```

---

## Test Coverage

**Hardware-Critical Components:**

- **Logger:** Circular buffer (RAM management)

- **StorageManager:** NVS initialization + namespace isolation

- **ConfigManager:** WiFi validation + orchestration

- **TopicBuilder:** MQTT topic correctness (100% coverage)

- **ErrorTracker:** Critical error detection + categorization

- **Integration:** Boot time, memory fragmentation, health export

**What was removed:**

- ❌ Trivial API tests (e.g., string wrappers)

- ❌ Redundant unit tests (covered by integration)

- ❌ Non-critical edge cases

**What was added:**

- ✅ System health MQTT export (Phase 2 preparation)

- ✅ Boot time measurement (watchdog relevance)

- ✅ Memory fragmentation under load (industrial stability)

---

## Hardware Tests

Unit tests run on ESP32 hardware. For full integration testing:

1. Upload firmware: `pio run -t upload`

2. Monitor serial output: `pio device monitor`

3. Run tests: `pio test -e esp32dev`

4. Verify boot sequence < 2s

5. Check memory usage < 15KB

6. Test config persistence across reboot

---

## Server-Side Integration (Phase 2+)

**Hardware Observability:**

- ESP32 exports system health via MQTT (tested in `test_system_health_mqtt_export`)

- Server can validate MQTT topics using `test_topic_builder` patterns

- Boot time and memory metrics available for load testing

**Future Extensions:**

- Server-side test scenario engine (JSON-based)

- ESP32 simulator for load testing (100+ virtual ESPs)

- AI-orchestrated test scenario generation

---

## Notes

- Tests require Unity framework (included in PlatformIO)

- Some tests modify NVS (non-volatile storage)

- Integration tests may take longer to run

- Memory fragmentation test simulates 100 log + 50 error entries

- Boot time test must complete < 2000ms (industrial requirement)

---

**Last Updated:** 2025-11-14  
**Test Suite Version:** 2.0 (Industrial Refactor)  
**Total Tests:** 28 (down from 41)  
**Status:** Production-Ready
