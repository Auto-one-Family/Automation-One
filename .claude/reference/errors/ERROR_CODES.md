---
name: error-codes-reference
description: Error Codes Fehler Debug ESP32 Server Hardware MQTT Validation
  Database 1000 2000 3000 4000 5000 Troubleshooting
allowed-tools: Read
---

# Error-Code Referenz

> **Version:** 1.1 | **Aktualisiert:** 2026-02-01
> **Quellen:** `El Trabajante/src/models/error_codes.h`, `El Servador/god_kaiser_server/src/core/error_codes.py`
> **Letzte Verifizierung:** AGENT 3 Error-Code Spezialist

---

## 0. Quick-Lookup

### Häufige Fehler mit Lösungen

| Code | System | Kategorie | Bedeutung | Lösung |
|------|--------|-----------|-----------|--------|
| 1002 | ESP32 | HARDWARE | GPIO bereits belegt | Anderen GPIO wählen |
| 1011 | ESP32 | HARDWARE | I2C Device nicht gefunden | Verkabelung prüfen |
| 1021 | ESP32 | HARDWARE | OneWire keine Devices | DS18B20 Verkabelung prüfen |
| 1040 | ESP32 | HARDWARE | Sensor Read fehlgeschlagen | Sensor prüfen |
| 1050 | ESP32 | HARDWARE | Actuator Set fehlgeschlagen | GPIO/Verdrahtung prüfen |
| 2001 | ESP32 | SERVICE | NVS Initialisierung fehlgeschlagen | Flash löschen |
| 3011 | ESP32 | COMMUNICATION | MQTT Connect failed | Broker prüfen |
| 3012 | ESP32 | COMMUNICATION | MQTT Publish failed | Verbindung prüfen |
| 4001 | ESP32 | APPLICATION | State Transition ungültig | Logs prüfen |
| 5001 | Server | CONFIG | ESP nicht gefunden | ESP registrieren |
| 5202 | Server | VALIDATION | Ungültiger GPIO | Gültigen GPIO verwenden |
| 5301 | Server | DATABASE | DB Connection failed | PostgreSQL prüfen |
| 5640 | Server | SEQUENCE | Actuator locked | Warten oder Force-Release |

---

## 1. Code-Ranges Übersicht

| Range | System | Kategorie |
|-------|--------|-----------|
| **1000-1999** | ESP32 | HARDWARE (GPIO, I2C, OneWire, Sensor, Actuator) |
| **2000-2999** | ESP32 | SERVICE (NVS, Config, Logger, Storage) |
| **3000-3999** | ESP32 | COMMUNICATION (WiFi, MQTT, HTTP) |
| **4000-4999** | ESP32 | APPLICATION (State, Operation, Command, Watchdog) |
| **5000-5099** | Server | CONFIG_ERROR |
| **5100-5199** | Server | MQTT_ERROR |
| **5200-5299** | Server | VALIDATION_ERROR |
| **5300-5399** | Server | DATABASE_ERROR |
| **5400-5499** | Server | SERVICE_ERROR |
| **5500-5599** | Server | AUDIT_ERROR |
| **5600-5699** | Server | SEQUENCE_ERROR |
| **6000-6099** | Test | TEST (Testinfrastruktur-Fehler) |

**MQTT Error Publishing Rate-Limiting (F8):** ESP32 ErrorTracker throttles MQTT error publishes to max 1 per error code per 60s window. Suppressed occurrences are counted and logged on next publish. Implementation: `error_tracker.cpp` — `shouldPublishError()` with modulo-hashed 32-slot static table.

---

## 2. ESP32 Hardware Errors (1000-1999)

### GPIO Errors (1001-1006)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1001 | `GPIO_RESERVED` | GPIO pin is reserved by system |
| 1002 | `GPIO_CONFLICT` | GPIO pin already in use by another component |
| 1003 | `GPIO_INIT_FAILED` | Failed to initialize GPIO pin |
| 1004 | `GPIO_INVALID_MODE` | Invalid GPIO pin mode specified |
| 1005 | `GPIO_READ_FAILED` | Failed to read GPIO pin value |
| 1006 | `GPIO_WRITE_FAILED` | Failed to write GPIO pin value |

### I2C Errors (1010-1018)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1010 | `I2C_INIT_FAILED` | Failed to initialize I2C bus |
| 1011 | `I2C_DEVICE_NOT_FOUND` | I2C device not found on bus |
| 1012 | `I2C_READ_FAILED` | Failed to read from I2C device |
| 1013 | `I2C_WRITE_FAILED` | Failed to write to I2C device |
| 1014 | `I2C_BUS_ERROR` | I2C bus error (SDA/SCL stuck or timeout) |
| 1015 | `I2C_BUS_STUCK` | I2C bus stuck (SDA or SCL held low by slave device) |
| 1016 | `I2C_BUS_RECOVERY_STARTED` | I2C bus recovery initiated |
| 1017 | `I2C_BUS_RECOVERY_FAILED` | I2C bus recovery failed after max attempts |
| 1018 | `I2C_BUS_RECOVERED` | I2C bus recovered successfully |

### I2C Protocol-Layer Errors (1007, 1009, 1019)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1007 | `I2C_TIMEOUT` | I2C operation timed out (sensor not responding) |
| 1009 | `I2C_CRC_FAILED` | I2C sensor data CRC validation failed |
| 1019 | `I2C_PROTOCOL_UNSUPPORTED` | I2C sensor type has no registered communication protocol |

### OneWire Errors (1020-1029)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1020 | `ONEWIRE_INIT_FAILED` | Failed to initialize OneWire bus |
| 1021 | `ONEWIRE_NO_DEVICES` | No OneWire devices found on bus |
| 1022 | `ONEWIRE_READ_FAILED` | Failed to read from OneWire device |
| 1023 | `ONEWIRE_INVALID_ROM_LENGTH` | OneWire ROM-Code must be 16 hex characters |
| 1024 | `ONEWIRE_INVALID_ROM_FORMAT` | OneWire ROM-Code contains invalid characters (expected 0-9, A-F) |
| 1025 | `ONEWIRE_INVALID_ROM_CRC` | OneWire ROM-Code CRC validation failed (corrupted or fake ROM) |
| 1026 | `ONEWIRE_DEVICE_NOT_FOUND` | OneWire device not present on bus (check wiring) |
| 1027 | `ONEWIRE_BUS_NOT_INITIALIZED` | OneWire bus not initialized (call begin() first) |
| 1028 | `ONEWIRE_READ_TIMEOUT` | OneWire device read timeout (device not responding) |
| 1029 | `ONEWIRE_DUPLICATE_ROM` | OneWire ROM-Code already registered for another sensor |

### PWM Errors (1030-1032)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1030 | `PWM_INIT_FAILED` | Failed to initialize PWM controller |
| 1031 | `PWM_CHANNEL_FULL` | All PWM channels already in use |
| 1032 | `PWM_SET_FAILED` | Failed to set PWM duty cycle |

### Sensor Errors (1040-1043)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1040 | `SENSOR_READ_FAILED` | Failed to read sensor data |
| 1041 | `SENSOR_INIT_FAILED` | Failed to initialize sensor |
| 1042 | `SENSOR_NOT_FOUND` | Sensor not configured or not found |
| 1043 | `SENSOR_TIMEOUT` | Sensor read timeout (device not responding) |

### Actuator Errors (1050-1053)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1050 | `ACTUATOR_SET_FAILED` | Failed to set actuator state |
| 1051 | `ACTUATOR_INIT_FAILED` | Failed to initialize actuator |
| 1052 | `ACTUATOR_NOT_FOUND` | Actuator not configured or not found |
| 1053 | `ACTUATOR_CONFLICT` | Actuator GPIO conflict with sensor |

### DS18B20-specific Errors (1060-1069)

| Code | Name | Beschreibung |
|------|------|--------------|
| 1060 | `DS18B20_SENSOR_FAULT` | DS18B20 sensor fault: -127°C indicates disconnected sensor or CRC failure |
| 1061 | `DS18B20_POWER_ON_RESET` | DS18B20 power-on reset: 85°C indicates no conversion was performed |
| 1062 | `DS18B20_OUT_OF_RANGE` | DS18B20 temperature outside valid range (-55°C to +125°C) |
| 1063 | `DS18B20_DISCONNECTED_RUNTIME` | DS18B20 device was present but is now disconnected |

---

## 3. ESP32 Service Errors (2000-2999)

### NVS Errors (2001-2005)

| Code | Name | Beschreibung |
|------|------|--------------|
| 2001 | `NVS_INIT_FAILED` | Failed to initialize NVS (Non-Volatile Storage) |
| 2002 | `NVS_READ_FAILED` | Failed to read from NVS |
| 2003 | `NVS_WRITE_FAILED` | Failed to write to NVS (storage full or corrupted) |
| 2004 | `NVS_NAMESPACE_FAILED` | Failed to open NVS namespace |
| 2005 | `NVS_CLEAR_FAILED` | Failed to clear NVS namespace |

### Config Errors (2010-2014)

| Code | Name | Beschreibung |
|------|------|--------------|
| 2010 | `CONFIG_INVALID` | Configuration data is invalid |
| 2011 | `CONFIG_MISSING` | Required configuration is missing |
| 2012 | `CONFIG_LOAD_FAILED` | Failed to load configuration from NVS |
| 2013 | `CONFIG_SAVE_FAILED` | Failed to save configuration to NVS |
| 2014 | `CONFIG_VALIDATION` | Configuration validation failed |

### Logger Errors (2020-2021)

| Code | Name | Beschreibung |
|------|------|--------------|
| 2020 | `LOGGER_INIT_FAILED` | Failed to initialize logger system |
| 2021 | `LOGGER_BUFFER_FULL` | Logger buffer is full (messages dropped) |

### Storage Errors (2030-2032)

| Code | Name | Beschreibung |
|------|------|--------------|
| 2030 | `STORAGE_INIT_FAILED` | Failed to initialize storage manager |
| 2031 | `STORAGE_READ_FAILED` | Failed to read from storage |
| 2032 | `STORAGE_WRITE_FAILED` | Failed to write to storage |

### Subzone Errors (2500-2506)

| Code | Name | Beschreibung |
|------|------|--------------|
| 2500 | `SUBZONE_INVALID_ID` | Invalid subzone_id format (must be 1-32 chars, alphanumeric + underscore) |
| 2501 | `SUBZONE_GPIO_CONFLICT` | GPIO already assigned to different subzone |
| 2502 | `SUBZONE_PARENT_MISMATCH` | parent_zone_id doesn't match ESP zone assignment |
| 2503 | `SUBZONE_NOT_FOUND` | Subzone doesn't exist |
| 2504 | `SUBZONE_GPIO_INVALID` | GPIO not in safe pins list |
| 2505 | `SUBZONE_SAFE_MODE_FAILED` | Safe-mode activation failed for subzone |
| 2506 | `SUBZONE_CONFIG_SAVE_FAILED` | Failed to save subzone configuration to NVS |

---

## 4. ESP32 Communication Errors (3000-3999)

### WiFi Errors (3001-3005)

| Code | Name | Beschreibung |
|------|------|--------------|
| 3001 | `WIFI_INIT_FAILED` | Failed to initialize WiFi module |
| 3002 | `WIFI_CONNECT_TIMEOUT` | WiFi connection timeout |
| 3003 | `WIFI_CONNECT_FAILED` | WiFi connection failed (wrong password or SSID not found) |
| 3004 | `WIFI_DISCONNECT` | WiFi disconnected unexpectedly |
| 3005 | `WIFI_NO_SSID` | WiFi SSID not configured |

### MQTT Errors (3010-3016)

| Code | Name | Beschreibung |
|------|------|--------------|
| 3010 | `MQTT_INIT_FAILED` | Failed to initialize MQTT client |
| 3011 | `MQTT_CONNECT_FAILED` | MQTT broker connection failed |
| 3012 | `MQTT_PUBLISH_FAILED` | Failed to publish MQTT message |
| 3013 | `MQTT_SUBSCRIBE_FAILED` | Failed to subscribe to MQTT topic |
| 3014 | `MQTT_DISCONNECT` | MQTT disconnected from broker |
| 3015 | `MQTT_BUFFER_FULL` | MQTT offline buffer is full (messages dropped) |
| 3016 | `MQTT_PAYLOAD_INVALID` | MQTT payload is invalid or malformed |

### HTTP Errors (3020-3023)

| Code | Name | Beschreibung |
|------|------|--------------|
| 3020 | `HTTP_INIT_FAILED` | Failed to initialize HTTP client |
| 3021 | `HTTP_REQUEST_FAILED` | HTTP request failed (server unreachable) |
| 3022 | `HTTP_RESPONSE_INVALID` | HTTP response is invalid or malformed |
| 3023 | `HTTP_TIMEOUT` | HTTP request timeout |

### Network Errors (3030-3032)

| Code | Name | Beschreibung |
|------|------|--------------|
| 3030 | `NETWORK_UNREACHABLE` | Network is unreachable |
| 3031 | `DNS_FAILED` | DNS lookup failed (hostname not resolved) |
| 3032 | `CONNECTION_LOST` | Network connection lost |

---

## 5. ESP32 Application Errors (4000-4999)

### State Errors (4001-4003)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4001 | `STATE_INVALID` | Invalid system state |
| 4002 | `STATE_TRANSITION` | Invalid state transition |
| 4003 | `STATE_MACHINE_STUCK` | State machine is stuck (no valid transitions) |

### Operation Errors (4010-4012)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4010 | `OPERATION_TIMEOUT` | Operation timeout |
| 4011 | `OPERATION_FAILED` | Operation failed |
| 4012 | `OPERATION_CANCELLED` | Operation cancelled by user or system |

### Command Errors (4020-4022)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4020 | `COMMAND_INVALID` | Command is invalid or unknown |
| 4021 | `COMMAND_PARSE_FAILED` | Failed to parse command |
| 4022 | `COMMAND_EXEC_FAILED` | Command execution failed |

### Payload Errors (4030-4032)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4030 | `PAYLOAD_INVALID` | Payload is invalid or malformed |
| 4031 | `PAYLOAD_TOO_LARGE` | Payload size exceeds maximum allowed |
| 4032 | `PAYLOAD_PARSE_FAILED` | Failed to parse payload (JSON syntax error) |

### Memory Errors (4040-4042)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4040 | `MEMORY_FULL` | Memory is full (heap exhausted) |
| 4041 | `MEMORY_ALLOCATION` | Failed to allocate memory |
| 4042 | `MEMORY_LEAK` | Memory leak detected |

### System Errors (4050-4052)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4050 | `SYSTEM_INIT_FAILED` | System initialization failed |
| 4051 | `SYSTEM_RESTART` | System restart requested |
| 4052 | `SYSTEM_SAFE_MODE` | System entered safe mode (errors detected) |

### Task Errors (4060-4062)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4060 | `TASK_FAILED` | FreeRTOS task failed |
| 4061 | `TASK_TIMEOUT` | FreeRTOS task timeout |
| 4062 | `TASK_QUEUE_FULL` | FreeRTOS task queue is full |

### Watchdog Errors (4070-4072)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4070 | `WATCHDOG_TIMEOUT` | Watchdog timeout detected (system hang) |
| 4071 | `WATCHDOG_FEED_BLOCKED` | Watchdog feed blocked: Circuit breakers open |
| 4072 | `WATCHDOG_FEED_BLOCKED_CRITICAL` | Watchdog feed blocked: Critical errors active |

### Device Discovery Errors (4200-4202)

| Code | Name | Beschreibung |
|------|------|--------------|
| 4200 | `DEVICE_REJECTED` | Device rejected by server administrator |
| 4201 | `APPROVAL_TIMEOUT` | Timeout waiting for server approval |
| 4202 | `APPROVAL_REVOKED` | Previously approved device was revoked |

---

## 6. Server Config Errors (5000-5099)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5001 | `ESP_DEVICE_NOT_FOUND` | ESP device not found in database |
| 5002 | `CONFIG_BUILD_FAILED` | Failed to build configuration payload |
| 5003 | `CONFIG_PAYLOAD_INVALID` | Configuration payload is invalid |
| 5004 | `CONFIG_PUBLISH_FAILED` | Failed to publish configuration via MQTT |
| 5005 | `FIELD_MAPPING_FAILED` | Failed to map fields between server and ESP32 format |
| 5006 | `CONFIG_TIMEOUT` | Configuration response timeout |
| 5007 | `ESP_OFFLINE` | ESP device is offline |

---

## 7. Server MQTT Errors (5100-5199)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5101 | `PUBLISH_FAILED` | MQTT publish operation failed |
| 5102 | `TOPIC_BUILD_FAILED` | Failed to build MQTT topic |
| 5103 | `PAYLOAD_SERIALIZATION_FAILED` | Failed to serialize MQTT payload |
| 5104 | `CONNECTION_LOST` | MQTT connection lost |
| 5105 | `RETRY_EXHAUSTED` | MQTT retry attempts exhausted |
| 5106 | `BROKER_UNAVAILABLE` | MQTT broker is unavailable |
| 5107 | `AUTHENTICATION_FAILED` | MQTT authentication failed |

---

## 8. Server Validation Errors (5200-5299)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5201 | `INVALID_ESP_ID` | Invalid ESP device ID format |
| 5202 | `INVALID_GPIO` | Invalid GPIO pin number |
| 5203 | `INVALID_SENSOR_TYPE` | Invalid sensor type |
| 5204 | `INVALID_ACTUATOR_TYPE` | Invalid actuator type |
| 5205 | `MISSING_REQUIRED_FIELD` | Missing required field in request |
| 5206 | `FIELD_TYPE_MISMATCH` | Field type mismatch |
| 5207 | `VALUE_OUT_OF_RANGE` | Value out of allowed range |
| 5208 | `DUPLICATE_ENTRY` | Duplicate entry (already exists) |

---

## 9. Server Database Errors (5300-5399)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5301 | `QUERY_FAILED` | Database query failed |
| 5302 | `COMMIT_FAILED` | Database commit failed |
| 5303 | `ROLLBACK_FAILED` | Database rollback failed |
| 5304 | `CONNECTION_FAILED` | Database connection failed |
| 5305 | `INTEGRITY_ERROR` | Database integrity constraint violated |
| 5306 | `MIGRATION_FAILED` | Database migration failed |

---

## 10. Server Service Errors (5400-5499)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5401 | `SERVICE_INITIALIZATION_FAILED` | Service initialization failed |
| 5402 | `DEPENDENCY_MISSING` | Required dependency missing |
| 5403 | `OPERATION_TIMEOUT` | Service operation timed out |
| 5404 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| 5405 | `PERMISSION_DENIED` | Permission denied |

---

## 11. Server Audit Errors (5500-5599)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5501 | `AUDIT_LOG_FAILED` | Failed to write audit log |
| 5502 | `RETENTION_CLEANUP_FAILED` | Retention cleanup failed |
| 5503 | `STATISTICS_FAILED` | Failed to compute audit statistics |

---

## 12. Server Sequence Errors (5600-5699)

### Validation Errors (5600-5609)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5600 | `SEQ_INVALID_DEFINITION` | Invalid sequence definition |
| 5601 | `SEQ_EMPTY_STEPS` | Sequence must have at least one step |
| 5602 | `SEQ_INVALID_STEP` | Invalid step configuration |
| 5603 | `SEQ_INVALID_ACTION_TYPE` | Unknown action type in step |
| 5604 | `SEQ_STEP_MISSING_ACTION` | Step requires either 'action' or 'delay_seconds' |
| 5605 | `SEQ_INVALID_DELAY` | Invalid delay value (must be 0-3600 seconds) |
| 5606 | `SEQ_TOO_MANY_STEPS` | Too many steps (max 50) |
| 5607 | `SEQ_DURATION_EXCEEDED` | Sequence duration exceeds maximum allowed |

### Runtime Errors (5610-5629)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5610 | `SEQ_ALREADY_RUNNING` | Sequence with this ID is already running |
| 5611 | `SEQ_NOT_FOUND` | Sequence not found |
| 5612 | `SEQ_CANCELLED` | Sequence was cancelled |
| 5613 | `SEQ_TIMEOUT` | Sequence timed out |
| 5614 | `SEQ_STEP_FAILED` | Step execution failed |
| 5615 | `SEQ_STEP_TIMEOUT` | Step timed out |
| 5616 | `SEQ_MAX_DURATION_EXCEEDED` | Maximum sequence duration exceeded |
| 5617 | `SEQ_EXECUTOR_NOT_FOUND` | No executor found for action type |
| 5618 | `SEQ_CIRCULAR_REFERENCE` | Circular sequence reference detected |

### System Errors (5630-5639)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5630 | `SEQ_TASK_CREATION_FAILED` | Failed to create sequence task |
| 5631 | `SEQ_INTERNAL_ERROR` | Internal sequence error |
| 5632 | `SEQ_CLEANUP_FAILED` | Failed to cleanup completed sequence |
| 5633 | `SEQ_STATE_CORRUPTION` | Sequence state corruption detected |

### Conflict Errors (5640-5649)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5640 | `SEQ_ACTUATOR_LOCKED` | Actuator locked by another sequence/rule |
| 5641 | `SEQ_RATE_LIMITED` | Rate limit exceeded |
| 5642 | `SEQ_SAFETY_BLOCKED` | Action blocked by safety system |

---

## 13. ESP32 Config Error Codes (String-based)

Diese Codes werden in `config_response` Payloads verwendet:

| Code | Beschreibung |
|------|--------------|
| `NONE` | No error |
| `JSON_PARSE_ERROR` | Failed to parse JSON configuration |
| `VALIDATION_FAILED` | Configuration validation failed |
| `GPIO_CONFLICT` | GPIO pin conflict detected |
| `NVS_WRITE_FAILED` | Failed to save configuration to NVS |
| `TYPE_MISMATCH` | Field type mismatch in configuration |
| `MISSING_FIELD` | Required field missing in configuration |
| `OUT_OF_RANGE` | Value out of allowed range |
| `UNKNOWN_ERROR` | Unknown configuration error |

---

## 14. Code-Locations

### ESP32 Firmware

| Datei | Beschreibung |
|-------|--------------|
| `El Trabajante/src/models/error_codes.h` | Error Code Definitionen + Beschreibungen |

### Server

| Datei | Beschreibung |
|-------|--------------|
| `El Servador/god_kaiser_server/src/core/error_codes.py` | Error Code Enums + Helper-Funktionen |

### Helper-Funktionen (Python)

```python
from src.core.error_codes import (
    get_error_code_description,  # Code → Beschreibung
    get_error_code_range,        # Code → Kategorie
    get_error_code_source,       # Code → "esp32" oder "server"
    get_all_error_codes,         # Liste aller Codes
)
```

### Helper-Funktionen (C++)

```cpp
#include "models/error_codes.h"

const char* desc = getErrorDescription(1002);  // → "GPIO pin already in use..."
const char* range = getErrorCodeRange(1002);   // → "HARDWARE"
```

---

## 15. Synchronisations-Analyse (ESP32 ↔ Server)

> **Letzte Prüfung:** 2026-02-01

### ✅ Vollständig synchronisiert

| Range | ESP32 (error_codes.h) | Server (error_codes.py) | Status |
|-------|----------------------|-------------------------|--------|
| GPIO (1001-1006) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| I2C (1007-1019) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| OneWire (1020-1029) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| PWM (1030-1032) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Sensor (1040-1043) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Actuator (1050-1053) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| NVS (2001-2005) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Config (2010-2014) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Logger (2020-2021) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Storage (2030-2032) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Subzone (2500-2506) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| WiFi (3001-3005) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| MQTT (3010-3016) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| HTTP (3020-3023) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Network (3030-3032) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| State (4001-4003) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Operation (4010-4012) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Command (4020-4022) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Payload (4030-4032) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Memory (4040-4042) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| System (4050-4052) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Task (4060-4062) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Watchdog (4070-4072) | ✅ Vollständig | ✅ Vollständig | ✅ OK |
| Discovery (4200-4202) | ✅ Vollständig | ✅ Vollständig | ✅ OK |

### ✅ Korrigiert in Phase 0

#### 1. I2C Bus Recovery Codes (1015-1018) — KORRIGIERT

| Code | Name | Status |
|------|------|--------|
| 1015 | `I2C_BUS_STUCK` | ✅ In ESP32HardwareError enum + Descriptions |
| 1016 | `I2C_BUS_RECOVERY_STARTED` | ✅ In ESP32HardwareError enum + Descriptions |
| 1017 | `I2C_BUS_RECOVERY_FAILED` | ✅ In ESP32HardwareError enum + Descriptions |
| 1018 | `I2C_BUS_RECOVERED` | ✅ In ESP32HardwareError enum + Descriptions |

#### 2. DS18B20 Codes (1060-1063) — KORRIGIERT

| Code | Name | Status |
|------|------|--------|
| 1060 | `DS18B20_SENSOR_FAULT` | ✅ In ESP32HardwareError enum + Descriptions |
| 1061 | `DS18B20_POWER_ON_RESET` | ✅ In ESP32HardwareError enum + Descriptions |
| 1062 | `DS18B20_OUT_OF_RANGE` | ✅ In ESP32HardwareError enum + Descriptions |
| 1063 | `DS18B20_DISCONNECTED_RUNTIME` | ✅ In ESP32HardwareError enum + Descriptions |

### ⚠️ Offene Lücken

#### 3. ValidationErrorCode - INVALID_PAYLOAD_FORMAT ✅ BEHOBEN

`INVALID_PAYLOAD_FORMAT = 5209` wurde zum `ValidationErrorCode` Enum hinzugefügt.
Beschreibung "Invalid payload format" in SERVER_ERROR_DESCRIPTIONS ergänzt.

---

## 16. Detailliertes Troubleshooting

### GPIO_CONFLICT (1002)

**System:** ESP32
**Kategorie:** HARDWARE

**Beschreibung:** GPIO-Pin wird bereits von einer anderen Komponente verwendet.

**Ausgelöst in:**
- `sensor_manager.cpp:384` - `addSensor()`
- `sensor_manager.cpp:435` - `addSensor()`
- `actuator_manager.cpp:207` - `addActuator()`
- `main.cpp:1924` - `handleSensorConfig()`

**Symptom:**
```
ESP32 Log: [ERROR] GPIO 4 already in use by sensor_name
Server Log: Error 1002 received from ESP32
```

**Diagnose:**
```bash
# Aktuelle GPIO-Belegung prüfen
GET /api/v1/esp/{esp_id}/gpio-status

# ESP32 Serial Monitor: GPIO-Status beim Boot
[INFO] GPIO 4: SENSOR (ds18b20_temp)
[INFO] GPIO 5: ACTUATOR (relay_pump)
```

**Lösung:**
1. Anderen GPIO-Pin in der Konfiguration wählen
2. Konfliktierende Komponente (Sensor/Aktor) entfernen
3. Bei OneWire: Mehrere DS18B20 können denselben Bus-Pin teilen

**Verwandte Codes:**
- 1001: GPIO_RESERVED
- 1053: ACTUATOR_CONFLICT

---

### I2C_DEVICE_NOT_FOUND (1011)

**System:** ESP32
**Kategorie:** HARDWARE

**Beschreibung:** I2C-Gerät antwortet nicht auf der konfigurierten Adresse.

**Ausgelöst in:**
- `sensor_manager.cpp:273` - `initializeI2CSensor()`
- `i2c_bus.cpp` - `scan()`

**Symptom:**
```
ESP32 Log: [ERROR] I2C device at 0x44 not found on bus
Server Log: Sensor initialization failed - error_code: 1011
```

**Diagnose:**
```bash
# I2C-Scan auf ESP ausführen
POST /api/v1/sensors/esp/{esp_id}/i2c/scan

# Typische I2C-Adressen:
# SHT31: 0x44 oder 0x45
# BME280: 0x76 oder 0x77
# ADS1115: 0x48-0x4B
```

**Lösung:**
1. Kabelverbindung SDA/SCL/VCC/GND prüfen
2. Pull-up Widerstände (4.7kΩ) an SDA und SCL anschließen
3. I2C-Adresse in Konfiguration prüfen
4. Sensor-Stromversorgung prüfen (3.3V vs 5V)

**Verwandte Codes:**
- 1010: I2C_INIT_FAILED
- 1012: I2C_READ_FAILED
- 1014: I2C_BUS_ERROR

---

### ONEWIRE_NO_DEVICES (1021)

**System:** ESP32
**Kategorie:** HARDWARE

**Beschreibung:** Kein OneWire-Gerät auf dem Bus gefunden.

**Ausgelöst in:**
- `sensor_manager.cpp:418` - `initializeOneWireSensor()`

**Symptom:**
```
ESP32 Log: [WARNING] No OneWire devices found on GPIO 4
Server Log: Sensor scan returned 0 devices
```

**Diagnose:**
```bash
# OneWire-Scan ausführen
POST /api/v1/sensors/esp/{esp_id}/onewire/scan?gpio=4
```

**Lösung:**
1. Sensor-Verkabelung prüfen (VCC, GND, Data)
2. Pull-up Widerstand (4.7kΩ) zwischen Data und VCC anschließen
3. Bei langen Kabeln (>5m): Stärkeren Pull-up (2.2kΩ) verwenden
4. Bei parasitärer Versorgung: Externe 3.3V verwenden

**Verwandte Codes:**
- 1020: ONEWIRE_INIT_FAILED
- 1022: ONEWIRE_READ_FAILED
- 1026: ONEWIRE_DEVICE_NOT_FOUND

---

### DS18B20_SENSOR_FAULT (1060)

**System:** ESP32
**Kategorie:** HARDWARE

**Beschreibung:** DS18B20 liefert -127°C (Disconnected oder CRC-Fehler).

**Ausgelöst in:**
- `sensor_manager.cpp:687` - `readDS18B20Sensor()`
- `sensor_manager.cpp:723` - `readDS18B20Sensor()`

**Symptom:**
```
ESP32 Log: [ERROR] DS18B20 sensor fault: -127°C (disconnected or CRC failure)
Server Log: Temperature value -127 indicates sensor disconnection
```

**Diagnose:**
```bash
# Sensor-Rohdaten prüfen (sollte nicht -127 sein)
GET /api/v1/sensors/{sensor_id}/readings?limit=10
```

**Lösung:**
1. Kabelverbindung zum DS18B20 prüfen
2. Pull-up Widerstand prüfen
3. Sensor könnte defekt sein
4. Bei Hitzeeinwirkung: Sensor ersetzen

**Verwandte Codes:**
- 1061: DS18B20_POWER_ON_RESET
- 1062: DS18B20_OUT_OF_RANGE
- 1063: DS18B20_DISCONNECTED_RUNTIME

---

### DS18B20_POWER_ON_RESET (1061)

**System:** ESP32
**Kategorie:** HARDWARE

**Beschreibung:** DS18B20 liefert 85°C (Power-On Reset, keine Konversion).

**Ausgelöst in:**
- `sensor_manager.cpp:741` - `readDS18B20Sensor()`

**Symptom:**
```
ESP32 Log: [WARNING] DS18B20 power-on reset: 85°C indicates no conversion
```

**Lösung:**
1. Warten - erster Wert nach Boot ist oft 85°C
2. Nach 750ms sollte echter Wert kommen
3. Bei wiederholtem 85°C: Timing-Problem prüfen

---

### MQTT_CONNECT_FAILED (3011)

**System:** ESP32
**Kategorie:** COMMUNICATION

**Beschreibung:** Verbindung zum MQTT-Broker fehlgeschlagen.

**Ausgelöst in:**
- `mqtt_client.cpp` - `connect()`

**Symptom:**
```
ESP32 Log: [ERROR] MQTT connection failed: broker unreachable
Server Log: ESP {esp_id} went offline (LWT received)
```

**Diagnose:**
```bash
# Broker erreichbar?
mosquitto_sub -h broker-ip -t "#" -v

# ESP32 Status prüfen
GET /api/v1/esp/{esp_id}
# → online_status sollte false sein
```

**Lösung:**
1. MQTT-Broker IP/Port in Konfiguration prüfen
2. Broker-Dienst läuft? (`systemctl status mosquitto`)
3. Firewall-Regeln prüfen (Port 1883/8883)
4. WiFi-Verbindung des ESP32 prüfen

**Verwandte Codes:**
- 3010: MQTT_INIT_FAILED
- 3012: MQTT_PUBLISH_FAILED
- 3014: MQTT_DISCONNECT

---

### WATCHDOG_TIMEOUT (4070)

**System:** ESP32
**Kategorie:** APPLICATION

**Beschreibung:** Watchdog-Timeout erkannt (System-Hang).

**Ausgelöst in:**
- `main.cpp:1764` - `feedWatchdog()`

**Symptom:**
```
ESP32 Log: [CRITICAL] Watchdog timeout detected - system hang suspected
Server Log: ESP {esp_id} unresponsive, last heartbeat > 30s ago
```

**Diagnose:**
```bash
# Heartbeat-Status prüfen
GET /api/v1/esp/{esp_id}/health

# Letzte Error-Events
GET /api/v1/errors?esp_id={esp_id}&limit=10
```

**Lösung:**
1. ESP32 Neustart (Hardware-Reset)
2. Heap-Speicher prüfen (Memory Leak?)
3. Tasks prüfen (Task blockiert?)
4. Bei wiederholtem Auftreten: Firmware-Bug

**Verwandte Codes:**
- 4071: WATCHDOG_FEED_BLOCKED
- 4072: WATCHDOG_FEED_BLOCKED_CRITICAL

---

### ESP_DEVICE_NOT_FOUND (5001)

**System:** Server
**Kategorie:** CONFIG_ERROR

**Beschreibung:** ESP-Gerät nicht in der Datenbank gefunden.

**Ausgelöst in:**
- `config_handler.py` - `handle_config_request()`
- `sensor_handler.py:143` - `handle_sensor_data()`

**Symptom:**
```
Server Log: [5001] ESP device not found: esp_id=ABC123
```

**Diagnose:**
```bash
# ESP in DB prüfen
GET /api/v1/esp/

# Spezifisches ESP suchen
GET /api/v1/esp/{esp_id}
```

**Lösung:**
1. ESP im Server registrieren: `POST /api/v1/esp/`
2. ESP-ID Format prüfen (12-stellig, Hex)
3. ESP muss sich einmal mit Heartbeat melden

**Verwandte Codes:**
- 5007: ESP_OFFLINE

---

### SEQ_ACTUATOR_LOCKED (5640)

**System:** Server
**Kategorie:** SEQUENCE_ERROR

**Beschreibung:** Aktor ist durch eine andere Sequenz oder Regel gesperrt.

**Ausgelöst in:**
- `sequence_executor.py` - `execute_step()`

**Symptom:**
```
Server Log: [5640] Actuator pump_main locked by sequence watering_cycle
```

**Diagnose:**
```bash
# Aktive Sequenzen prüfen
GET /api/v1/sequences/running

# Aktor-Locks prüfen
GET /api/v1/actuators/{actuator_id}/locks
```

**Lösung:**
1. Warten bis aktive Sequenz beendet ist
2. Sequenz manuell stoppen: `DELETE /api/v1/sequences/{seq_id}/stop`
3. Force-Release des Locks (nur im Notfall)

**Verwandte Codes:**
- 5610: SEQ_ALREADY_RUNNING
- 5642: SEQ_SAFETY_BLOCKED

---

## 17. Code-Verwendungs-Matrix

### ESP32 Error Codes - Verwendung im Firmware-Code

| Code | Name | Dateien (El Trabajante/src/) |
|------|------|------------------------------|
| 1001 | GPIO_RESERVED | sensor_manager.cpp:369, :443 |
| 1002 | GPIO_CONFLICT | sensor_manager.cpp:384, :435, actuator_manager.cpp:207, main.cpp:1924, :1954 |
| 1010 | I2C_INIT_FAILED | sensor_manager.cpp:254, main.cpp:1370 |
| 1011 | I2C_DEVICE_NOT_FOUND | sensor_manager.cpp:273 |
| 1020 | ONEWIRE_INIT_FAILED | sensor_manager.cpp:396, :407, main.cpp:1380 |
| 1021 | ONEWIRE_NO_DEVICES | sensor_manager.cpp:418 |
| 1023 | ONEWIRE_INVALID_ROM_LENGTH | sensor_manager.cpp:612 |
| 1024 | ONEWIRE_INVALID_ROM_FORMAT | sensor_manager.cpp:623 |
| 1025 | ONEWIRE_INVALID_ROM_CRC | sensor_manager.cpp:344 |
| 1027 | ONEWIRE_BUS_NOT_INITIALIZED | sensor_manager.cpp:633 |
| 1028 | ONEWIRE_READ_TIMEOUT | sensor_manager.cpp:666 |
| 1029 | ONEWIRE_DUPLICATE_ROM | sensor_manager.cpp:354 |
| 1030 | PWM_INIT_FAILED | pwm_controller.cpp:99, :134, main.cpp:1390 |
| 1031 | PWM_CHANNEL_FULL | pwm_controller.cpp:125 |
| 1032 | PWM_SET_FAILED | pwm_controller.cpp:273, :294 |
| 1041 | SENSOR_INIT_FAILED | sensor_manager.cpp:76, :166, :239, :324, :334, main.cpp:1423, :1956 |
| 1051 | ACTUATOR_INIT_FAILED | actuator_manager.cpp:237, :250, main.cpp:1466, :1475 |
| 1052 | ACTUATOR_NOT_FOUND | actuator_manager.cpp:342 |
| 1060 | DS18B20_SENSOR_FAULT | sensor_manager.cpp:687, :723 |
| 1061 | DS18B20_POWER_ON_RESET | sensor_manager.cpp:741 |
| 1062 | DS18B20_OUT_OF_RANGE | sensor_manager.cpp:760 |
| 2003 | NVS_WRITE_FAILED | main.cpp:1937, :1963 |
| 2010 | CONFIG_INVALID | main.cpp:1846, :1856, :1865, :1926 |
| 2011 | CONFIG_MISSING | main.cpp:1840, :1852, :1861 |
| 2505 | SUBZONE_SAFE_MODE_FAILED | safety_controller.cpp:73, :80 |
| 2506 | SUBZONE_CONFIG_SAVE_FAILED | main.cpp:108 |
| 3012 | MQTT_PUBLISH_FAILED | sensor_manager.cpp:1243, health_monitor.cpp:272 |
| 3020 | HTTP_INIT_FAILED | pi_enhanced_processor.cpp:52 |
| 4020 | COMMAND_INVALID | actuator_manager.cpp:358 |
| 4050 | SYSTEM_INIT_FAILED | main.cpp:1352 |
| 4070 | WATCHDOG_TIMEOUT | main.cpp:1764 |
| 4071 | WATCHDOG_FEED_BLOCKED | main.cpp:1504 |
| 4072 | WATCHDOG_FEED_BLOCKED_CRITICAL | main.cpp:1528 |
| 4200 | DEVICE_REJECTED | main.cpp:1288 |

### Server Error Codes - Verwendung im Python-Code

| Code | Name | Dateien (El Servador/god_kaiser_server/src/) |
|------|------|----------------------------------------------|
| 5001 | ESP_DEVICE_NOT_FOUND | mqtt/handlers/sensor_handler.py:143, mqtt/handlers/zone_ack_handler.py:123 |
| 5201 | INVALID_ESP_ID | mqtt/handlers/sensor_handler.py:378 |
| 5202 | INVALID_GPIO | mqtt/handlers/sensor_handler.py:385 |
| 5203 | INVALID_SENSOR_TYPE | mqtt/handlers/sensor_handler.py:392 |
| 5205 | MISSING_REQUIRED_FIELD | mqtt/handlers/sensor_handler.py:371, :400, :408, zone_ack_handler.py:87, :201, :208 |
| 5206 | FIELD_TYPE_MISMATCH | mqtt/handlers/sensor_handler.py:417, :424, :432, :443, :454, :472 |
| 5403 | OPERATION_TIMEOUT | mqtt/handlers/sensor_handler.py:236 |

---

## 18. Empfohlene Korrekturen

> **Status:** Korrektur 1 und 3 wurden in Phase 0 umgesetzt (I2C 1015-1018, DS18B20 1060-1063 in Python-Mirror eingefuegt).

### 1. Server error_codes.py - ESP32HardwareError erweitern (ERLEDIGT)

```python
class ESP32HardwareError(IntEnum):
    # ... bestehende Codes ...

    # I2C Bus Recovery (1015-1018) - HINZUFÜGEN
    I2C_BUS_STUCK = 1015
    I2C_BUS_RECOVERY_STARTED = 1016
    I2C_BUS_RECOVERY_FAILED = 1017
    I2C_BUS_RECOVERED = 1018

    # DS18B20-specific (1060-1063) - HINZUFÜGEN
    DS18B20_SENSOR_FAULT = 1060
    DS18B20_POWER_ON_RESET = 1061
    DS18B20_OUT_OF_RANGE = 1062
    DS18B20_DISCONNECTED_RUNTIME = 1063
```

### 2. Server error_codes.py - ValidationErrorCode erweitern

```python
class ValidationErrorCode(IntEnum):
    # ... bestehende Codes ...

    # HINZUFÜGEN
    INVALID_PAYLOAD_FORMAT = 5209  # Wird in zone_ack_handler.py verwendet
```

### 3. ESP32_ERROR_DESCRIPTIONS erweitern

```python
ESP32_ERROR_DESCRIPTIONS: Dict[int, str] = {
    # ... bestehende Codes ...

    # DS18B20-specific (1060-1063) - HINZUFÜGEN
    1060: "DS18B20 sensor fault: -127°C indicates disconnected sensor or CRC failure",
    1061: "DS18B20 power-on reset: 85°C indicates no conversion was performed",
    1062: "DS18B20 temperature outside valid range (-55°C to +125°C)",
    1063: "DS18B20 device was present but is now disconnected",
}
```

---

## 19. Test Infrastructure Errors (6000-6099)

> **Hinzugefuegt:** Phase 0 Testinfrastruktur-Phasenplan
> **Quellen:** `error_codes.h` (C++), `error_codes.py` (Python)
> **Zweck:** Nur in Test-Reports, NICHT in Produktion

| Code | Name | Beschreibung | Kontext |
|------|------|-------------|---------|
| 6000 | `WOKWI_TIMEOUT` | Wokwi-Simulation Timeout ueberschritten | CI/CD + Lokal |
| 6001 | `WOKWI_BOOT_INCOMPLETE` | ESP32-Boot in Simulation unvollstaendig | CI/CD |
| 6002 | `MOCK_ESP_CONFIG_INVALID` | Mock-ESP Konfiguration ungueltig | Seed-Script |
| 6010 | `SCENARIO_ASSERTION_FAILED` | Wokwi-Szenario Assertion fehlgeschlagen | pytest |
| 6011 | `SCENARIO_NOT_FOUND` | Referenziertes Szenario existiert nicht | CI/CD |
| 6020 | `MQTT_INJECTION_FAILED` | MQTT-Inject im Test fehlgeschlagen | Wokwi CI |
| 6021 | `MQTT_BROKER_UNAVAILABLE` | Test-Broker nicht erreichbar | CI/CD |
| 6030 | `DOCKER_SERVICE_UNHEALTHY` | Docker-Service unhealthy waehrend Test | E2E |
| 6031 | `DB_SEED_FAILED` | Testdaten-Seeding fehlgeschlagen | E2E |
| 6040 | `PLAYWRIGHT_TIMEOUT` | Frontend E2E Test Timeout | Playwright |
| 6041 | `PLAYWRIGHT_ELEMENT_NOT_FOUND` | UI-Element nicht gefunden | Playwright |
| 6050 | `SERIAL_LOG_MISSING` | Expected Serial-Log Pattern nicht gefunden | Wokwi |
