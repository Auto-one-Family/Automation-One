# Changelog

All notable changes to ESP32 Sensor Network v4.0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - Phase 1 Core Infrastructure - 2025-11-14

### Added

#### Core Modules

- **Logger System** (`src/utils/logger.*`)
  - 5 log levels (DEBUG, INFO, WARNING, ERROR, CRITICAL)
  - Circular buffer for log history (50 entries)
  - Serial output with timestamps
  - Log level filtering
  - const char* Primary API + String wrappers

- **StorageManager** (`src/services/config/storage_manager.*`)
  - NVS abstraction layer
  - Namespace management (begin/end)
  - Type-safe read/write (String, int, uint8/16, bool, ulong)
  - const char* Primary API + String wrappers
  - Static buffer for zero-copy getString()

- **ConfigManager** (`src/services/config/config_manager.*`)
  - Configuration orchestration (WiFi/Zone/System)
  - loadAllConfigs() orchestration
  - Validation logic for all configs
  - isConfigurationComplete() status check
  - Server-Centric scope (no Sensor/Actuator arrays in Phase 1)

- **TopicBuilder** (`src/utils/topic_builder.*`)
  - 8 critical MQTT topic patterns
  - Static buffers (no heap allocation)
  - ESP ID / Kaiser ID substitution
  - setEspId() / setKaiserId() configuration

- **ErrorTracker** (`src/error_handling/error_tracker.*`)
  - Error history with circular buffer (50 entries)
  - 4 error categories (HARDWARE, SERVICE, COMMUNICATION, APPLICATION)
  - 3 severity levels (WARNING, ERROR, CRITICAL)
  - Occurrence counting for duplicate errors
  - Automatic Logger integration

#### Models

- **Error Codes** (`src/models/error_codes.h`)
  - 76 error codes defined (1000-4999)
  - 4 categories with 1000-value ranges

- **System Types** (`src/models/system_types.h`)
  - SystemConfig structure
  - WiFiConfig, KaiserZone, MasterZone structures

#### Integration

- **GPIO Manager Logger Integration** (`src/drivers/gpio_manager.cpp`)
  - 26 Serial.print* calls migrated to LOG_* macros
  - Boot banner retained as Serial (lines 32-33)
  - Complete structured logging integration

- **main.cpp Initialization Order** (`src/main.cpp`)
  - Correct initialization sequence implemented
  - GPIO Safe-Mode FIRST (hardware safety)
  - Logger AFTER GPIO (dependency correct)
  - Config BEFORE TopicBuilder (esp_id/kaiser_id needed)

#### Testing

- **Unit Tests** (`test/`)
  - test_logger.cpp (6 tests)
  - test_storage_manager.cpp (6 tests)
  - test_config_manager.cpp (6 tests)
  - test_topic_builder.cpp (9 tests)
  - test_error_tracker.cpp (8 tests)
  - test_integration.cpp (6 integration tests)
  - **Total: 41 tests**

### Changed

- GPIO Manager: Migrated from Serial output to structured logging
- main.cpp: Implemented complete Phase 1 initialization order
- Memory Strategy: Stack > Heap (fixed arrays, static buffers)

### Removed

- None (Phase 1 initial implementation)

### Known Issues

- TopicBuilder: Buffer-overflow checks missing (non-blocking, see #XX)
- Doxygen documentation incomplete (work in progress)

### Performance

- Logger::log() disabled: ~0.5 µs
- Logger::log() enabled: ~5 µs
- TopicBuilder::buildTopic(): ~2 µs
- Memory usage: ~19 KB / 320 KB (5.9%)

### Dependencies

- PlatformIO
- Arduino Framework for ESP32
- No external libraries (Phase 1)

---

## [Unreleased] - Phase 2 Communication Layer

### Planned

- WiFiManager
- MQTTClient
- HTTPClient
- WebConfigServer
- NetworkDiscovery

---

## Version History

- **1.0.0** - Phase 1 Core Infrastructure (2025-11-14)
- **0.0.0** - Project initialization (2025-11-13)

---

**Changelog Format:** [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
**Versioning:** [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

