# Phase 1 Unit Tests

This directory contains unit and integration tests for Phase 1 modules.

## Test Files

### Unit Tests

1. **test_logger.cpp** - Logger System Tests (6 tests)
   - Initialization, log levels, circular buffer
   - const char* API, String wrapper API

2. **test_storage_manager.cpp** - StorageManager Tests (6 tests)
   - String/Int operations, namespace isolation
   - const char* API, String wrapper API

3. **test_config_manager.cpp** - ConfigManager Tests (6 tests)
   - WiFi/Zone/System config load/save
   - Validation, orchestration

4. **test_topic_builder.cpp** - TopicBuilder Tests (9 tests)
   - All 8 critical topic patterns
   - ESP ID / Kaiser ID substitution

5. **test_error_tracker.cpp** - ErrorTracker Tests (8 tests)
   - Error tracking, categories
   - Circular buffer, occurrence counting

### Integration Tests

6. **test_integration.cpp** - Integration Tests (6 tests)
   - Boot sequence validation
   - Memory usage verification
   - Cross-module integration

**Total: 41 Tests**

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

## Expected Results

All 41 tests should PASS:

```
Test Summary:
✅ test_logger: 6/6 PASS
✅ test_storage_manager: 6/6 PASS
✅ test_config_manager: 6/6 PASS
✅ test_topic_builder: 9/9 PASS
✅ test_error_tracker: 8/8 PASS
✅ test_integration: 6/6 PASS

Total: 41/41 PASS
```

## Test Coverage

- **Logger:** 90%+ coverage
- **StorageManager:** 85%+ coverage
- **ConfigManager:** 80%+ coverage
- **TopicBuilder:** 95%+ coverage
- **ErrorTracker:** 85%+ coverage

## Hardware Tests

Unit tests run on ESP32 hardware. For full integration testing:

1. Upload firmware
2. Monitor serial output
3. Verify boot sequence
4. Check memory usage
5. Test config persistence across reboot

## Notes

- Tests require Unity framework (included in PlatformIO)
- Some tests modify NVS (non-volatile storage)
- Integration tests may take longer to run
- Memory usage test has 15KB threshold (Phase 1 target: ~8KB)


