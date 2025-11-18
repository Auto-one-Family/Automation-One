# ESP32 Firmware Test Suite Documentation
**Version:** 2.2 (Phase 5 Complete)  
**Target Audience:** God-Kaiser Server Developers  
**Last Updated:** November 18, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Test Philosophy](#test-philosophy)
3. [MQTT Topic Reference](#mqtt-topic-reference)
4. [JSON Payload Specifications](#json-payload-specifications)
5. [Phase 1: Core Infrastructure Tests](#phase-1-core-infrastructure-tests)
6. [Phase 2-3: Communication & HAL Tests](#phase-2-3-communication--hal-tests)
7. [Phase 4: Sensor System Tests](#phase-4-sensor-system-tests)
8. [Phase 5: Actuator System Tests](#phase-5-actuator-system-tests)
9. [Server Integration Guide](#server-integration-guide)
10. [Test Helpers Reference](#test-helpers-reference)

---

## Overview

This test suite validates the **ESP32 ↔ God-Kaiser Server contract**. Each test specifies:
- MQTT topics published by ESP
- MQTT topics subscribed by ESP
- JSON payload structures
- Expected server responses
- Error handling behavior

**Total Tests:** 140+ tests across 21 test files

**Key Metrics:**
- Boot Time: <3s with 10 sensors/actuators
- Memory Usage: <40KB for 10 devices
- MQTT QoS: 1 for all critical messages

---

## Test Philosophy

### Production-Safe Testing

- **Dual-Mode Operation:** Tests detect Production vs. New System
- **No Config Disruption:** Production sensors/actuators never modified
- **Graceful Degradation:** Tests skip if hardware unavailable
- **Memory-Safe:** RAII pattern prevents leaks

### Server Developer Benefits

- **MQTT Contract Validation:** Every topic + payload documented
- **Integration Test Blueprint:** Copy test patterns to server-side tests
- **Error Scenario Coverage:** All failure modes tested
- **Cross-Device Automation:** Multi-ESP scenarios validated

---

## MQTT Topic Reference

### MQTT Wildcard Guide

Before diving into topic patterns, it's essential to understand MQTT wildcards:

#### Single-Level Wildcard (`+`)

**Purpose:** Matches exactly ONE topic level

**Syntax:** Can appear at any level, multiple times in a pattern

**Examples:**

```
Pattern: kaiser/+/esp/+/sensor/+/data

✅ Matches:
  - kaiser/god/esp/ESP_ABC/sensor/4/data
  - kaiser/admin/esp/ESP_XYZ/sensor/12/data
  - kaiser/test/esp/ESP_001/sensor/1/data

❌ Does NOT match:
  - kaiser/god/sensor/4/data (missing /esp/ level)
  - kaiser/god/esp/ESP_ABC/sensor/4/data/extra (too many levels)
```

#### Multi-Level Wildcard (`#`)

**Purpose:** Matches ZERO or more topic levels

**Syntax:** MUST be the last character in the pattern

**Examples:**

```
Pattern: kaiser/god/esp/ESP_ABC/#

✅ Matches:
  - kaiser/god/esp/ESP_ABC/sensor/4/data
  - kaiser/god/esp/ESP_ABC/actuator/12/command
  - kaiser/god/esp/ESP_ABC/system/heartbeat
  - kaiser/god/esp/ESP_ABC/ (zero levels after ESP_ABC)

❌ Does NOT match:
  - kaiser/god/esp/ESP_XYZ/sensor/4/data (wrong ESP ID)
```

#### Best Practices for Server Subscriptions

**✅ Recommended Patterns:**

```python
# Receive ALL sensor data from ALL ESPs
client.subscribe("kaiser/+/esp/+/sensor/+/data")

# Receive ALL messages from specific ESP
client.subscribe("kaiser/god/esp/ESP_ABC/#")

# Receive status from GPIO 12 on ALL ESPs
client.subscribe("kaiser/+/esp/+/actuator/12/status")

# Receive ALL heartbeats
client.subscribe("kaiser/+/esp/+/system/heartbeat")
```

**⚠️ Use with Caution:**

```python
# Receives EVERY message from broker (high load!)
client.subscribe("#")

# Receives all Kaiser messages (can be thousands per second)
client.subscribe("kaiser/#")
```

**❌ Invalid Patterns:**

```python
# Multi-level wildcard must be last
client.subscribe("kaiser/#/esp/+/sensor/+/data")  # ERROR

# Cannot mix + and # in same level
client.subscribe("kaiser/+#/esp/+/sensor/+/data")  # ERROR
```

#### Subscription Strategy for God-Kaiser Server

**Option 1: Broad Subscriptions (Recommended for small deployments <10 ESPs)**

```python
# Subscribe to all topics with wildcard
client.subscribe("kaiser/+/esp/+/sensor/+/data")
client.subscribe("kaiser/+/esp/+/actuator/+/status")
client.subscribe("kaiser/+/esp/+/system/heartbeat")

# Filter in callback
def on_message(client, userdata, msg):
    if '/sensor/' in msg.topic and '/data' in msg.topic:
        handle_sensor_data(msg.topic, json.loads(msg.payload))
```

**Option 2: Specific Subscriptions (Recommended for large deployments >10 ESPs)**

```python
# Subscribe to specific ESPs only
esp_ids = get_managed_esp_ids()  # ['ESP_ABC', 'ESP_XYZ', ...]

for esp_id in esp_ids:
    client.subscribe(f"kaiser/god/esp/{esp_id}/#")

# More targeted, less message filtering needed
```

**Option 3: Topic-Specific Subscriptions (Recommended for specialized services)**

```python
# Service only handles emergencies
client.subscribe("kaiser/+/esp/+/actuator/+/alert")
client.subscribe("kaiser/broadcast/emergency")

# Service only monitors health
client.subscribe("kaiser/+/esp/+/system/heartbeat")
```

---

### Topics Published by ESP (Server must subscribe)

| Topic Pattern | Test File | Payload Type | QoS | Description |
|---------------|-----------|--------------|-----|-------------|
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` | test_sensor_integration.cpp | SensorData | 1 | Raw + processed sensor readings |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch` | test_topic_builder.cpp | BatchData | 1 | Multiple sensor readings in one message |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` | test_actuator_manager.cpp | ActuatorStatus | 1 | Current actuator state (ON/OFF/PWM) |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response` | test_actuator_manager.cpp | ActuatorResponse | 1 | Response to server command |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert` | test_safety_controller.cpp | ActuatorAlert | 1 | Emergency stop, runtime exceeded, etc. |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency` | test_safety_controller.cpp | EmergencyEvent | 1 | ESP-wide emergency stop |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` | test_phase2_integration.cpp | Heartbeat | 1 | ESP health check (every 60s) |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/status` | test_integration.cpp | SystemStatus | 1 | Boot count, uptime, memory, errors |
| `kaiser/{kaiser_id}/esp/{esp_id}/config_response` | test_actuator_config.cpp | ConfigResponse | 1 | Result of config command |

### Topics Subscribed by ESP (Server must publish)

| Topic Pattern | Test File | Payload Type | QoS | Description |
|---------------|-----------|--------------|-----|-------------|
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` | test_sensor_manager.cpp | SensorCommand | 1 | Configure measurement interval |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | test_actuator_manager.cpp | ActuatorCommand | 1 | Control actuator (ON/OFF/PWM) |
| `kaiser/{kaiser_id}/esp/{esp_id}/config` | test_actuator_config.cpp | ConfigPayload | 1 | Add/remove/update sensor/actuator |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | test_phase2_integration.cpp | SystemCommand | 1 | Reboot, safe-mode, firmware update |
| `kaiser/broadcast/emergency` | test_safety_controller.cpp | EmergencyBroadcast | 1 | Emergency stop all ESPs |

**Note:** `{kaiser_id}` is typically `"god"` in current architecture.

---

## JSON Payload Specifications

### SensorData (ESP → Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Test Reference:** test_sensor_integration.cpp::test_sensor_to_mqtt_flow()

**Example Payload:**

```json
{
  "gpio": 4,
  "sensor_type": "ph_sensor",
  "sensor_name": "Tank pH",
  "raw_value": 2048,
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "good",
  "timestamp": 1234567890,
  "metadata": {}
}
```

**Server Validation Requirements:**

- ✅ `gpio` must be valid (0-39 for ESP32)
- ✅ `sensor_type` must match server library registry
- ✅ `raw_value` must be in ADC range (0-4095 for 12-bit)
- ✅ `processed_value` must be plausible for sensor type
- ✅ `timestamp` must be recent (within 5 minutes)
- ✅ `quality` must be one of: "good", "warning", "error"

**Server Actions:**

1. Store reading in time-series database
2. Check if automation rules triggered
3. Update ESP health status
4. Respond with acknowledgment (optional)

---

### ActuatorCommand (Server → ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`

**Test Reference:** test_actuator_manager.cpp::test_mqtt_command_handling()

**Example Payloads:**

```json
// Binary ON
{
  "command": "ON",
  "reason": "Automation Rule: pH too low",
  "rule_id": "rule_ph_correction",
  "timestamp": 1234567890
}

// Binary OFF
{
  "command": "OFF",
  "reason": "Manual control",
  "timestamp": 1234567890
}

// PWM Control
{
  "command": "PWM",
  "value": 0.75,
  "reason": "Gradual adjustment",
  "timestamp": 1234567890
}

// Toggle
{
  "command": "TOGGLE",
  "reason": "Manual control",
  "timestamp": 1234567890
}
```

**ESP Validation:**

- ✅ `command` must be one of: "ON", "OFF", "PWM", "TOGGLE"
- ✅ `value` required for PWM (0.0-1.0 range)
- ✅ `reason` is optional but recommended for auditing
- ✅ `rule_id` is optional, used for automation tracking

**ESP Response (Published to `/response` topic):**

```json
{
  "gpio": 12,
  "command": "ON",
  "success": true,
  "error": null,
  "timestamp": 1234567891
}
```

---

### ActuatorStatus (ESP → Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

**Test Reference:** test_actuator_manager.cpp::test_status_publishing_contract()

**Example Payload:**

```json
{
  "gpio": 12,
  "type": "pump",
  "state": true,
  "pwm": 0,
  "emergency": "normal",
  "runtime_ms": 12345,
  "timestamp": 1234567890
}
```

**Status Fields:**

- `state`: true (ON) / false (OFF)
- `pwm`: 0-255 (0 for binary actuators)
- `emergency`: "normal", "active", "clearing", "resuming"
- `runtime_ms`: Total runtime since boot

**Server Actions:**

- Subscribe to `kaiser/+/esp/+/actuator/+/status` to monitor all actuators
- Track actuator runtime for maintenance scheduling
- Alert if emergency state detected
- Update dashboard with real-time actuator states

---

### EmergencyBroadcast (Server → All ESPs)

**Topic:** `kaiser/broadcast/emergency`

**Test Reference:** test_safety_controller.cpp::test_emergency_stop_all()

**Example Payload:**

```json
{
  "action": "stop_all",
  "reason": "Emergency triggered by ESP_ABC",
  "source_esp": "ESP_ABC",
  "affected_gpio": 12,
  "timestamp": 1234567890
}
```

**ESP Behavior:**

- ✅ Immediately stop ALL actuators
- ✅ Publish emergency alert to own `/actuator/emergency` topic
- ✅ Enter emergency state (block all commands)
- ✅ Wait for `clear_emergency` command before resuming

**Server Requirements:**

- ✅ Broadcast to ALL ESPs within 100ms
- ✅ Log emergency event with full context
- ✅ Notify administrators via alert system
- ✅ Track which ESPs acknowledged emergency

---

### SystemHeartbeat (ESP → Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`

**Test Reference:** test_integration.cpp::test_system_health_mqtt_export()

**Full Payload Example:**

```json
{
  "esp_id": "ESP_ABC123",
  "uptime_ms": 3600000,
  "free_heap_kb": 245,
  "boot_count": 42,
  "error_count": 3,
  "has_critical_errors": false,
  "sensor_count": 5,
  "actuator_count": 3,
  "wifi_rssi": -45,
  "mqtt_connected": true,
  "timestamp": 1234567890
}
```

**Server Requirements:**

- Subscribe to `kaiser/+/esp/+/system/heartbeat`
- Store heartbeat every 60s
- Alert if no heartbeat for 180s (3 missed)
- Track RSSI for connectivity issues
- Monitor heap for memory leaks

---

### ConfigPayload (Server → ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

**Test Reference:** test_actuator_config.cpp::test_user_adds_new_actuator_via_mqtt()

**Example Payload (Add Actuator):**

```json
{
  "actuators": [
    {
      "gpio": 12,
      "type": "pump",
      "name": "Main Pump",
      "active": true
    }
  ]
}
```

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

**Response Payload (Success):**

```json
{
  "success": true,
  "message": "Actuator configured on GPIO 12",
  "gpio": 12
}
```

**Response Payload (Conflict):**

```json
{
  "success": false,
  "message": "GPIO 12 already used by sensor",
  "gpio": 12
}
```

---

## Phase 1: Core Infrastructure Tests

### test_logger.cpp (1 Test)

**Purpose:** Validate circular buffer memory management

#### Test: test_logger_circular_buffer()

**What it does:**

1. Logs 60 messages (exceeds MAX_LOG_ENTRIES = 50)
2. Verifies only 50 most recent entries retained
3. Confirms no memory leaks

**Server Relevance:**

- ESP may send log dumps via MQTT (future feature)
- Server should expect max 50 log entries per request
- Circular buffer prevents ESP memory exhaustion

**No MQTT topics involved** (internal logging only)

---

### test_storage_manager.cpp (2 Tests)

**Purpose:** Validate NVS (Non-Volatile Storage) persistence

#### Test 1: test_storage_manager_initialization()

**What it does:**

- Initializes NVS partition
- Verifies storage available

**Server Relevance:**

- ESP persists config across reboots
- Server can send config updates at any time
- Config survives power loss

#### Test 2: test_storage_manager_namespace_isolation()

**What it does:**

1. Writes "value1" to namespace "ns1"
2. Writes "value2" to namespace "ns2"
3. Verifies both values persist independently

**Server Relevance:**

- Sensor configs stored separately from actuator configs
- WiFi credentials isolated from zone configs
- Server config updates won't corrupt other data

**No MQTT topics involved** (internal storage only)

---

### test_config_manager.cpp (3 Tests)

**Purpose:** Validate configuration orchestration

#### Test 1: test_config_manager_initialization()

**What it does:**

- Loads all configs from NVS
- Verifies default values if no config exists

**Server Relevance:**

- ESP sends current config on heartbeat
- Server can detect unconfigured ESPs
- First-boot ESPs request config automatically

#### Test 2: test_config_manager_wifi_validation()

**What it does:**

1. Validates WiFi config with SSID + server address
2. Rejects empty SSID

**Server Relevance:**

- Server must provide valid WiFi credentials
- ESP validates before attempting connection
- Invalid config rejected with error message

#### Test 3: test_config_manager_load_all()

**What it does:**

- Orchestrates loading of WiFi, system, zone, sensor, actuator configs
- Verifies load sequence (dependencies respected)

**Server Relevance:**

- Config loading order matters for server commands
- Server must send zone config before sensor config
- Actuator configs depend on zone + sensor configs

---

### test_topic_builder.cpp (12 Tests)

**Purpose:** Validate ALL MQTT topic patterns

**CRITICAL FOR SERVER:** This test defines the **exact MQTT topic structure** the server MUST use.

#### Test 1: test_topic_builder_sensor_data()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Example:** `kaiser/god/esp/ESP_ABC123/sensor/4/data`

**Server Action:** Subscribe to `kaiser/+/esp/+/sensor/+/data` to receive all sensor data

---

#### Test 2: test_topic_builder_sensor_batch()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch`

**Example:** `kaiser/god/esp/ESP_ABC123/sensor/batch`

**Server Action:** Subscribe to `kaiser/+/esp/+/sensor/batch` for batch readings (multiple sensors in one message)

---

#### Test 3: test_topic_builder_actuator_command()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`

**Example:** `kaiser/god/esp/ESP_ABC123/actuator/12/command`

**Server Action:** Publish to this topic to control actuators

---

#### Test 4: test_topic_builder_actuator_status()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

**Example:** `kaiser/god/esp/ESP_ABC123/actuator/12/status`

**Server Action:** Subscribe to `kaiser/+/esp/+/actuator/+/status` to monitor actuator states

---

#### Test 5: test_topic_builder_actuator_response()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response`

**Example:** `kaiser/god/esp/ESP_ABC123/actuator/12/response`

**Server Action:** Subscribe to receive command acknowledgments (success/failure)

---

#### Test 6: test_topic_builder_actuator_alert()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert`

**Example:** `kaiser/god/esp/ESP_ABC123/actuator/7/alert`

**Server Action:** Subscribe to `kaiser/+/esp/+/actuator/+/alert` for emergency alerts

---

#### Test 7: test_topic_builder_actuator_emergency()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency`

**Example:** `kaiser/god/esp/ESP_ABC123/actuator/emergency`

**Server Action:** Subscribe to detect ESP-wide emergencies

---

#### Test 8: test_topic_builder_heartbeat()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`

**Example:** `kaiser/god/esp/ESP_ABC123/system/heartbeat`

**Server Action:** Subscribe to `kaiser/+/esp/+/system/heartbeat` to detect offline ESPs (expect message every 60s)

---

#### Test 9: test_topic_builder_system_command()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/system/command`

**Example:** `kaiser/god/esp/ESP_ABC123/system/command`

**Server Action:** Publish to send reboot/update commands

---

#### Test 10: test_topic_builder_config()

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

**Example:** `kaiser/god/esp/ESP_ABC123/config`

**Server Action:** Publish to send sensor/actuator configurations

---

#### Test 11: test_topic_builder_broadcast_emergency()

**Topic Pattern:** `kaiser/broadcast/emergency`

**Example:** `kaiser/broadcast/emergency` (no ESP-specific suffix!)

**Server Action:** Publish to trigger emergency stop on ALL ESPs

---

#### Test 12: test_topic_builder_id_substitution()

**What it does:**

- Tests dynamic ESP ID + Kaiser ID substitution
- Verifies topics update when IDs change

**Server Relevance:**

- Server must extract ESP ID from topics
- Kaiser ID is always "god" in current architecture
- Future: Multi-Kaiser support

---

### test_error_tracker.cpp (4 Tests)

**Purpose:** Validate error categorization and history

#### Test 1: test_error_tracker_initialization()

**What it does:**

- Verifies error tracker starts empty
- No active errors on boot

**Server Relevance:**

- ESP sends error count in heartbeat
- Server can query error history via MQTT

#### Test 2: test_error_tracker_categories()

**What it does:**

- Tracks errors by category (Hardware, Service, Communication, Application)
- Verifies category counts accurate

**Server Relevance:**

- ESP reports error breakdown in system status
- Server can prioritize alerts by category
- Communication errors may indicate network issues

**MQTT Payload (in heartbeat):**

```json
{
  "error_count": 4,
  "errors": {
    "hardware": 1,
    "service": 1,
    "communication": 1,
    "application": 1
  }
}
```

#### Test 3: test_error_tracker_circular_buffer()

**What it does:**

- Logs 60 errors (exceeds MAX = 50)
- Verifies only 50 most recent retained

**Server Relevance:**

- Server can request error dump via MQTT
- Max 50 error entries per request
- Circular buffer prevents memory exhaustion

#### Test 4: test_error_tracker_critical_errors()

**What it does:**

- Detects critical vs. normal errors
- Flags ESP as critical if any critical error present

**Server Relevance:**

- ESP marks critical errors in heartbeat
- Server must alert administrators immediately
- Critical errors block some operations

**MQTT Payload (in heartbeat):**

```json
{
  "has_critical_errors": true,
  "last_critical_error": "Sensor communication failure",
  "timestamp": 1234567890
}
```

---

### test_integration.cpp (9 Tests)

**Purpose:** Validate full system integration

#### Test 1: test_boot_sequence()

**What it does:**

1. Initializes all Phase 1 modules in order
2. Measures memory usage
3. Verifies boot completes without errors

**Server Relevance:**

- ESP publishes boot complete message
- Server tracks boot count for stability monitoring
- Frequent reboots indicate hardware issues

**MQTT Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/status`

**Payload:**

```json
{
  "boot_count": 42,
  "boot_time_ms": 1523,
  "uptime_ms": 1523
}
```

#### Test 2: test_memory_usage()

**What it does:**

- Measures total heap usage
- Verifies Phase 1 modules use <15KB

**Server Relevance:**

- ESP sends memory stats in heartbeat
- Server can detect memory leaks (increasing usage)
- Low memory triggers alerts

**MQTT Payload (in heartbeat):**

```json
{
  "free_heap_kb": 245,
  "heap_size_kb": 320,
  "min_free_heap_kb": 220
}
```

#### Test 3-6: Logger, Config, Error Tracking, Topic Builder Integration

**Server Relevance:**

- Verifies all subsystems work together
- Config persists across reboots
- Topics match protocol specification

#### Test 7: test_system_health_mqtt_export()

**What it does:**

- Collects all health metrics (heap, uptime, boot count, errors)
- Simulates MQTT JSON payload construction

**Server Relevance:**

- **THIS IS THE MAIN HEARTBEAT PAYLOAD**
- Server must parse this exact structure

**MQTT Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`

**Full Payload Example:**

```json
{
  "esp_id": "ESP_ABC123",
  "uptime_ms": 3600000,
  "free_heap_kb": 245,
  "boot_count": 42,
  "error_count": 3,
  "has_critical_errors": false,
  "sensor_count": 5,
  "actuator_count": 3,
  "wifi_rssi": -45,
  "mqtt_connected": true,
  "timestamp": 1234567890
}
```

#### Test 8: test_boot_time_measurement()

**What it does:**

- Measures time from power-on to operational
- Verifies boot time <2s

**Server Relevance:**

- Slow boots indicate hardware issues
- Server tracks boot time trends

#### Test 9: test_memory_fragmentation()

**What it does:**

1. Logs 100 messages + tracks 50 errors (simulated load)
2. Measures memory fragmentation
3. Verifies fragmentation <10KB

**Server Relevance:**

- Heavy logging doesn't crash ESP
- Server can safely request large data dumps

---

## Phase 2-3: Communication & HAL Tests

### test_wifi_manager.cpp (4 Tests)

**Purpose:** Validate WiFi connection management

#### Test 1-2: Initialization & Connection

**What it does:**

- Initializes WiFi hardware
- Connects to WiFi using credentials
- Measures RSSI

**Server Relevance:**

- ESP sends WiFi status in heartbeat
- RSSI indicates connection quality

#### Test 3: test_wifi_manager_status_getters()

**What it does:**

- Tests connection status queries
- RSSI, IP address, SSID getters

**Server Relevance:**

- Status info included in heartbeat

#### Test 4: test_wifi_manager_reconnection()

**What it does:**

- Tests automatic reconnection after disconnect

**Server Relevance:**

- ESP reconnects automatically
- Server may see brief offline period

**No direct MQTT topics** (WiFi layer below MQTT)

---

### test_mqtt_client.cpp (7 Tests)

**Purpose:** Validate MQTT client behavior

#### Test 1-4: Initialization, Connection, Publish, Subscribe

**What it does:**

- Connects to MQTT broker
- Publishes test messages
- Subscribes to topics

**Server Relevance:**

- All ESP messages use this publish path
- ESP subscribes to command topics on boot

#### Test 5: test_mqtt_client_offline_buffer()

**What it does:**

1. Disconnects MQTT
2. Publishes messages (buffered)
3. Reconnects
4. Verifies buffered messages sent

**Server Relevance:**

- ESP buffers messages during network issues
- Server may receive burst of messages after reconnect
- Messages arrive in chronological order

#### Test 6-7: Status Getters & Heartbeat

**What it does:**

- Verifies heartbeat published every 60s

**Server Relevance:**

- CRITICAL: Server must expect heartbeat every 60s
- Missing heartbeats indicate offline ESP

---

### test_http_client.cpp (2 Tests)

**Purpose:** Validate HTTP client for Pi-Enhanced mode

#### Test 1: test_http_post_request()

**What it does:**

1. POSTs JSON to httpbin.org
2. Verifies 200 response

**Server Relevance:**

- ESP uses HTTP for Pi-Enhanced sensor processing
- Server must provide HTTP endpoint

#### Test 2: test_http_connection_retry()

**What it does:**

1. Attempts POST to unreachable server (fails)
2. Attempts POST to reachable server (succeeds)

**Server Relevance:**

- ESP retries failed HTTP requests
- Server may see duplicate requests

**HTTP Endpoint:** `POST /api/v1/sensors/process`

**Request Payload:**

```json
{
  "esp_id": "ESP_ABC",
  "gpio": 4,
  "sensor_type": "ph_sensor",
  "raw_value": 2048.0,
  "timestamp": 1234567890,
  "metadata": {}
}
```

**Expected Response:**

```json
{
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "good",
  "timestamp": 1234567890
}
```

---

### test_i2c_bus.cpp, test_onewire_bus.cpp, test_pwm_controller.cpp

**Purpose:** Hardware abstraction layer tests

**Server Relevance:**

- Tests validate hardware drivers work correctly
- Server doesn't interact with HAL directly
- No MQTT topics involved

**HAL Coverage:**

- **I2C Bus:** Device scanning, read/write operations (12 tests)
- **OneWire Bus:** DS18B20 temperature sensor support (8 tests)
- **PWM Controller:** Channel management, frequency/resolution config (28 tests)

---

### test_phase2_integration.cpp (3 Tests)

**Purpose:** Validate Phase 2 full stack

#### Test 1: test_phase2_integration()

**What it does:**

1. Connects WiFi
2. Connects MQTT
3. Subscribes to command topics
4. Verifies heartbeat published

**Server Relevance:**

- Validates ESP can connect to server
- Tests complete communication stack

#### Test 2: test_heartbeat_publishing()

**What it does:**

- Verifies heartbeat published on schedule

**Server Relevance:**

- Confirms heartbeat interval (60s)

#### Test 3: test_message_reception()

**What it does:**

- Tests callback mechanism for incoming messages

**Server Relevance:**

- ESP can receive commands from server

---

## Phase 4: Sensor System Tests

### test_sensor_manager.cpp (4 Tests)

**Purpose:** Validate sensor orchestration

#### Test 1: test_analog_sensor_raw_reading()

**What it does:**

1. MODE 1 (Production): Uses existing sensor if available
2. MODE 2 (New System): Creates temporary test sensor
3. Reads raw ADC value (0-4095)
4. Verifies value in expected range

**Server Relevance:**

- ESP sends raw_value in sensor data payload
- Server must validate raw_value range (0-4095 for 12-bit ADC)

**MQTT Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Payload:**

```json
{
  "gpio": 4,
  "sensor_type": "ph_sensor",
  "raw_value": 2048,
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "good",
  "timestamp": 1234567890
}
```

**Server Validation:**

- ✅ `raw_value` must be 0-4095 (12-bit ADC)
- ✅ Out-of-range values indicate hardware failure

#### Test 2: test_digital_sensor_plausibility()

**What it does:**

1. Reads digital sensor (HIGH/LOW)
2. Verifies reading is plausible (not stuck)

**Server Relevance:**

- Digital sensors report binary state
- Server can detect stuck sensors (always HIGH or always LOW)

**MQTT Payload (digital sensor):**

```json
{
  "gpio": 5,
  "sensor_type": "float_switch",
  "raw_value": 1,
  "processed_value": 1,
  "unit": "binary",
  "quality": "good",
  "timestamp": 1234567890
}
```

#### Test 3: test_mqtt_topic_generation()

**What it does:**

- Verifies sensor data topic matches protocol spec
- Tests with different GPIOs

**Server Relevance:**

- CRITICAL: Server must subscribe to exact topic pattern
- Topic: `kaiser/+/esp/+/sensor/+/data`

#### Test 4: test_measurement_interval_enforcement()

**What it does:**

1. Sets measurement interval to 1s (test mode)
2. Triggers multiple measurements
3. Verifies measurements only occur at interval

**Server Relevance:**

- Default interval: 30s (production)
- Test mode: 1s
- Server can change interval via command

**MQTT Command to change interval:**

```json
{
  "command": "SET_INTERVAL",
  "interval_ms": 5000
}
```

---

### test_pi_enhanced_processor.cpp (3 Tests)

**Purpose:** Validate HTTP sensor processing

#### Test 1: test_http_post_raw_data()

**What it does:**

1. POSTs raw sensor data to Pi server
2. Receives processed value
3. Verifies HTTP response structure

**Server Relevance:**

- **THIS IS THE PI-ENHANCED MODE WORKFLOW**
- Server MUST provide this HTTP endpoint

**HTTP Endpoint:** `POST /api/v1/sensors/process`

**Request Payload:**

```json
{
  "esp_id": "ESP_ABC",
  "gpio": 4,
  "sensor_type": "ph_sensor",
  "raw_value": 2048.0,
  "timestamp": 1234567890,
  "metadata": {}
}
```

**Response (200 OK):**

```json
{
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "good",
  "timestamp": 1234567890,
  "esp_id": "ESP_ABC",
  "gpio": 4
}
```

**Response (400 Bad Request - Unknown sensor):**

```json
{
  "error": "Unknown sensor type",
  "sensor_type": "unknown_sensor",
  "timestamp": 1234567890
}
```

#### Test 2: test_http_timeout_handling()

**What it does:**

1. POSTs to unreachable server (timeout)
2. Verifies circuit breaker logic

**Server Relevance:**

- ESP marks server unreachable after 3 failures
- ESP falls back to raw MQTT mode (future feature)

#### Test 3: test_http_failure_sets_error()

**What it does:**

- Verifies HTTP failures tracked in error history

**Server Relevance:**

- Server can detect Pi-Enhanced failures in heartbeat

---

### test_sensor_integration.cpp (3 Tests)

**Purpose:** Validate sensor system integration

#### Test 1: test_sensor_to_mqtt_flow()

**What it does:**

1. Performs sensor measurement
2. Constructs MQTT payload
3. Verifies payload structure
4. Validates topic matches spec

**Server Relevance:**

- **THIS TEST DEFINES THE EXACT PAYLOAD SERVER RECEIVES**
- All sensor data follows this structure

**MQTT Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Payload (Full Structure):**

```json
{
  "gpio": 4,
  "sensor_type": "ph_sensor",
  "sensor_name": "Tank pH",
  "raw_value": 2048,
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "good",
  "timestamp": 1234567890,
  "metadata": {
    "calibration_date": "2025-01-15",
    "sensor_model": "DFRobot pH V2"
  }
}
```

**Server Validation Checklist:**

- ✅ `gpio` exists (0-39)
- ✅ `sensor_type` matches registry
- ✅ `raw_value` in ADC range (0-4095)
- ✅ `processed_value` plausible for sensor type
- ✅ `unit` matches sensor type
- ✅ `quality` is "good", "warning", or "error"
- ✅ `timestamp` recent (within 5 minutes)

#### Test 2: test_boot_time_with_10_sensors()

**What it does:**

1. Creates 10 sensors
2. Measures boot time
3. Verifies boot time <3s

**Server Relevance:**

- ESP with 10 sensors boots in <3s
- Server can safely add sensors without impacting boot time

#### Test 3: test_memory_usage_10_sensors()

**What it does:**

1. Creates 10 sensors
2. Measures memory usage
3. Verifies memory <20KB
4. Tests for memory leaks

**Server Relevance:**

- ESP can support 10+ sensors without memory issues
- Server can configure large sensor arrays

---

## Phase 5: Actuator System Tests

### test_actuator_manager.cpp (6 Tests)

**Purpose:** Validate actuator control

#### Test 1: test_dual_mode_digital_control()

**What it does:**

1. MODE 1 (Production): Uses existing actuator if available
2. MODE 2 (New System): Creates temporary virtual actuator
3. Tests ON/OFF control
4. Verifies command execution

**Server Relevance:**

- Server sends ON/OFF commands via MQTT
- ESP confirms command execution

**MQTT Command Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`

**Command Payload (ON):**

```json
{
  "command": "ON",
  "reason": "Manual control",
  "timestamp": 1234567890
}
```

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response`

**Response Payload:**

```json
{
  "gpio": 12,
  "command": "ON",
  "success": true,
  "error": null,
  "timestamp": 1234567891
}
```

#### Test 2: test_pwm_percentage_control()

**What it does:**

1. Creates PWM actuator
2. Tests PWM control (0.0-1.0 range)
3. Verifies values clamped (>1.0 → 1.0)

**Server Relevance:**

- Server can send PWM commands (0.0-1.0)
- ESP clamps out-of-range values

**MQTT Command:**

```json
{
  "command": "PWM",
  "value": 0.75,
  "reason": "Gradual adjustment",
  "timestamp": 1234567890
}
```

**Response:**

```json
{
  "gpio": 12,
  "command": "PWM",
  "value": 0.75,
  "success": true,
  "current_pwm": 191,
  "timestamp": 1234567891
}
```

#### Test 3: test_mqtt_command_handling()

**What it does:**

1. Sends ON command via MQTT
2. Sends OFF command
3. Sends PWM command
4. Sends TOGGLE command
5. Sends invalid command (rejected)

**Server Relevance:**

- **DEFINES ALL VALID ACTUATOR COMMANDS**
- Invalid commands return error response

**Valid Commands:**

- `"ON"` - Turn actuator on
- `"OFF"` - Turn actuator off
- `"PWM"` - Set PWM value (requires `value` field)
- `"TOGGLE"` - Toggle current state

**Invalid Command Response:**

```json
{
  "gpio": 12,
  "command": "INVALID",
  "success": false,
  "error": "Unknown command",
  "timestamp": 1234567891
}
```

#### Test 4: test_gpio_conflict_detection()

**What it does:**

1. Creates sensor on GPIO 12
2. Attempts to create actuator on GPIO 12 (fails)
3. Verifies conflict detected

**Server Relevance:**

- Server must validate GPIO conflicts before sending config
- ESP rejects conflicting configs

**Config Response (Conflict):**

```json
{
  "success": false,
  "error": "GPIO 12 already used by sensor",
  "gpio": 12
}
```

#### Test 5: test_emergency_stop_propagation()

**What it does:**

1. Turns actuator ON
2. Triggers emergency stop
3. Verifies actuator stopped
4. Verifies alert published
5. Tests emergency clear + resume

**Server Relevance:**

- **CRITICAL FOR SAFETY SYSTEMS**
- Server receives emergency alert
- Server must broadcast emergency to all ESPs

**MQTT Alert Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert`

**Alert Payload:**

```json
{
  "alert_type": "emergency_stop",
  "gpio": 12,
  "reason": "Runtime exceeded",
  "timestamp": 1234567890
}
```

**Server Actions:**

1. Receive alert from ESP_A
2. Broadcast emergency to ALL ESPs: `kaiser/broadcast/emergency`
3. Log emergency event
4. Notify administrators

**Broadcast Payload:**

```json
{
  "action": "stop_all",
  "reason": "Emergency triggered by ESP_A",
  "source_esp": "ESP_A",
  "affected_gpio": 12,
  "timestamp": 1234567890
}
```

#### Test 6: test_status_publishing_contract()

**What it does:**

1. Turns actuator ON
2. Publishes status
3. Verifies status payload structure

**Server Relevance:**

- Server subscribes to status topic to monitor actuators

**MQTT Status Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

**Status Payload:**

```json
{
  "gpio": 12,
  "type": "pump",
  "state": true,
  "pwm": 0,
  "emergency": "normal",
  "runtime_ms": 12345,
  "timestamp": 1234567890
}
```

---

### test_actuator_config.cpp (3 Tests)

**Purpose:** Validate actuator configuration via MQTT

#### Test 1: test_user_adds_new_actuator_via_mqtt()

**What it does:**

1. Sends config payload via MQTT
2. Verifies actuator created
3. Checks config response published

**Server Relevance:**

- Server sends actuator configs to ESP
- ESP confirms config applied

**MQTT Config Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

**Config Payload (Add Actuator):**

```json
{
  "actuators": [
    {
      "gpio": 12,
      "type": "pump",
      "name": "Main Pump",
      "active": true
    }
  ]
}
```

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

**Response Payload (Success):**

```json
{
  "success": true,
  "message": "Actuator configured on GPIO 12",
  "gpio": 12
}
```

#### Test 2: test_gpio_conflict_rejection_via_config()

**What it does:**

1. Creates sensor on GPIO 12
2. Attempts to add actuator on GPIO 12 (rejected)
3. Verifies error response

**Server Relevance:**

- ESP validates configs before applying
- Server receives error response

**Response Payload (Conflict):**

```json
{
  "success": false,
  "message": "GPIO 12 already used by sensor",
  "gpio": 12
}
```

#### Test 3: test_payload_validation_and_sanitization()

**What it does:**

1. Sends invalid JSON payload
2. Verifies ESP rejects payload
3. Checks error response + alert published

**Server Relevance:**

- ESP validates all incoming configs
- Invalid configs trigger alerts

**Invalid Payload Example:**

```json
{
  "actuator": {}
}
```

**Response:**

```json
{
  "success": false,
  "message": "Invalid config payload",
  "error": "Missing 'actuators' array"
}
```

---

### test_actuator_models.cpp (3 Tests)

**Purpose:** Validate actuator data models

**Server Relevance:**

- Tests validate data structures used in MQTT payloads
- No direct MQTT topics involved

**Coverage:**

- Actuator value validation (binary/PWM ranges)
- Emergency state conversion (string ↔ enum)
- Type validation (pump, valve, pwm, relay)

---

### test_safety_controller.cpp (4 Tests)

**Purpose:** Validate emergency stop system

#### Test 1: test_emergency_stop_all()

**What it does:**

1. Creates multiple actuators
2. Triggers emergency stop ALL
3. Verifies all actuators stopped
4. Checks alert published

**Server Relevance:**

- Server can trigger emergency stop on single ESP
- ESP stops ALL actuators immediately

**MQTT Emergency Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency`

**Emergency Payload:**

```json
{
  "action": "stop_all",
  "reason": "Server commanded emergency stop",
  "timestamp": 1234567890
}
```

#### Test 2: test_emergency_stop_single()

**What it does:**

1. Creates 2 actuators
2. Stops only one actuator
3. Verifies other actuators unaffected

**Server Relevance:**

- Server can selectively stop individual actuators

**MQTT Command:**

```json
{
  "command": "EMERGENCY_STOP",
  "gpio": 12,
  "reason": "Runtime exceeded"
}
```

#### Test 3: test_clear_emergency_verification_failure()

**What it does:**

1. Triggers emergency stop
2. Attempts to clear emergency (fails verification)
3. Verifies ESP remains in emergency state

**Server Relevance:**

- ESP requires safety verification before resuming
- Server receives verification failure alert

**Clear Command:**

```json
{
  "command": "CLEAR_EMERGENCY"
}
```

**Response (Verification Failure):**

```json
{
  "success": false,
  "error": "Safety verification failed",
  "emergency_state": "active"
}
```

#### Test 4: test_resume_operation_sequencing()

**What it does:**

1. Emergency stop all actuators
2. Clear emergency
3. Resume operation (gradual, with delays)
4. Verifies actuators restarted sequentially

**Server Relevance:**

- Resume is NOT immediate (safety feature)
- **TIMING CALCULATION:**
  - Base delay: 50ms per actuator (configurable via `RecoveryConfig`)
  - With 10 actuators: 10 × 50ms = 500ms minimum
  - Safety margin: Add 500ms buffer for network latency
  - **Recommended:** Wait 1-2s after `CLEAR_EMERGENCY` before sending commands

**Resume Command:**

```json
{
  "command": "RESUME"
}
```

**Resume Process:**

1. ESP clears emergency state
2. Waits 50ms per actuator (configurable)
3. Reactivates actuators one by one
4. Publishes status updates for each

**Server Implementation Example:**

```python
def resume_operations(esp_id: str) -> None:
    """Safely resume ESP operations after emergency stop"""
    
    # Step 1: Send CLEAR_EMERGENCY
    mqtt_client.publish(
        f"kaiser/god/esp/{esp_id}/actuator/emergency",
        json.dumps({"command": "CLEAR_EMERGENCY"}),
        qos=1
    )
    
    # Step 2: Wait for safety verification (1s for verification + margin)
    time.sleep(1.0)
    
    # Step 3: Send RESUME command
    mqtt_client.publish(
        f"kaiser/god/esp/{esp_id}/actuator/emergency",
        json.dumps({"command": "RESUME"}),
        qos=1
    )
    
    # Step 4: Wait for sequential restart
    # Formula: (actuator_count × 50ms) + 500ms buffer
    actuator_count = get_actuator_count(esp_id)
    wait_time = (actuator_count * 0.05) + 0.5  # seconds
    time.sleep(wait_time)
    
    # Step 5: Verify all actuators resumed successfully
    if not verify_resume_complete(esp_id):
        logger.error(f"Resume failed for {esp_id}")
        # Retry or alert
```

**Timing Examples:**

| Actuator Count | Resume Time | Total Wait Time |
|----------------|-------------|-----------------|
| 1 actuator | 50ms | 1.0s + 0.5s = 1.5s |
| 5 actuators | 250ms | 1.0s + 0.75s = 1.75s |
| 10 actuators | 500ms | 1.0s + 1.0s = 2.0s |
| 20 actuators | 1000ms | 1.0s + 1.5s = 2.5s |

---

### test_actuator_integration.cpp (8 Tests)

**Purpose:** Validate full actuator system integration

#### Test 1: test_mqtt_command_response_flow_mock()

**What it does:**

1. Sends MQTT command
2. Verifies response published
3. Tests ON/OFF sequence

**Server Relevance:**

- Validates complete command → response flow

#### Test 2: test_boot_time_with_10_actuators()

**What it does:**

1. Creates 10 actuators
2. Measures boot time
3. Verifies boot time <3s

**Server Relevance:**

- ESP with 10 actuators boots in <3s
- Server can configure large actuator arrays

#### Test 3: test_memory_impact_10_actuators()

**What it does:**

1. Creates 10 actuators
2. Measures memory usage
3. Verifies memory <40KB
4. Tests for memory leaks

**Server Relevance:**

- ESP can support 10+ actuators without memory issues

#### Test 4: test_cross_device_simulation_mock()

**What it does:**

1. Simulates God-Kaiser automation rule
2. Sensor data triggers actuator command
3. Verifies cross-device automation

**Server Relevance:**

- **THIS TEST SHOWS HOW SERVER AUTOMATION WORKS**
- Server listens to sensor data
- Server sends actuator commands based on rules

**Automation Example (Python):**

```python
# God-Kaiser Rule
if sensor_data["sensor_type"] == "ph_sensor":
    ph = sensor_data["raw_value"] / 4095.0 * 14.0
    if ph < 6.0:
        send_actuator_command(
            esp_id="ESP_BBB",
            gpio=12,
            command="ON",
            reason="Automation Rule: pH too low"
        )
```

#### Test 5: test_concurrent_commands_race_handling()

**What it does:**

1. Sends 3 rapid commands (no delay)
2. Verifies all commands executed
3. Confirms final state correct

**Server Relevance:**

- ESP handles rapid commands without crashes
- Server can send burst commands

#### Test 6-8: Docker Tests

**What they do:**

- Test ESP integration with real God-Kaiser Mock server
- Validate cross-device automation
- Test emergency coordination

**Server Relevance:**

- **USE THESE AS INTEGRATION TEST TEMPLATES**
- Copy patterns to server-side tests

---

## Server Integration Guide

### 1. MQTT Broker Setup

**Required Topics (Subscribe):**

```
kaiser/+/esp/+/sensor/+/data        # Sensor readings
kaiser/+/esp/+/actuator/+/status    # Actuator states
kaiser/+/esp/+/actuator/+/response  # Command acknowledgments
kaiser/+/esp/+/actuator/+/alert     # Emergency alerts
kaiser/+/esp/+/actuator/emergency   # ESP-wide emergencies
kaiser/+/esp/+/system/heartbeat     # ESP health checks
kaiser/+/esp/+/system/status        # System status
kaiser/+/esp/+/config_response      # Config confirmations
```

**Required Topics (Publish):**

```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command  # Sensor commands
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command # Actuator commands
kaiser/{kaiser_id}/esp/{esp_id}/config                  # Configuration
kaiser/{kaiser_id}/esp/{esp_id}/system/command          # System commands
kaiser/broadcast/emergency                              # Emergency broadcast
```

---

### 2. HTTP Endpoint (Pi-Enhanced Mode)

**Endpoint:** `POST /api/v1/sensors/process`

**Request:**

```json
{
  "esp_id": "ESP_ABC",
  "gpio": 4,
  "sensor_type": "ph_sensor",
  "raw_value": 2048.0,
  "timestamp": 1234567890,
  "metadata": {}
}
```

**Response (Success):**

```json
{
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "good",
  "timestamp": 1234567890,
  "esp_id": "ESP_ABC",
  "gpio": 4
}
```

**Response (Error):**

```json
{
  "error": "Unknown sensor type",
  "sensor_type": "unknown_sensor",
  "timestamp": 1234567890
}
```

---

### 3. Automation Rule Example (Python)

```python
import paho.mqtt.client as mqtt
import json
import time

def on_sensor_data(client, userdata, msg):
    """Handle incoming sensor data"""
    payload = json.loads(msg.payload)
    
    # Extract info
    sensor_type = payload.get("sensor_type")
    raw_value = payload.get("raw_value")
    esp_id = msg.topic.split("/")[3]
    
    # Example Rule: pH too low
    if sensor_type == "ph_sensor":
        ph = (raw_value / 4095.0) * 14.0
        
        if ph < 6.0:
            # Send command to actuator
            command = {
                "command": "ON",
                "reason": "Automation Rule: pH too low",
                "rule_id": "rule_ph_correction",
                "timestamp": int(time.time())
            }
            
            target_topic = f"kaiser/god/esp/ESP_BBB/actuator/12/command"
            client.publish(target_topic, json.dumps(command), qos=1)

# Setup MQTT client
client = mqtt.Client()
client.on_message = on_sensor_data
client.connect("localhost", 1883, 60)
client.subscribe("kaiser/+/esp/+/sensor/+/data")
client.loop_forever()
```

---

### 4. Emergency Handling (Server-Side)

```python
def on_emergency_alert(client, userdata, msg):
    """Handle actuator emergency alerts"""
    payload = json.loads(msg.payload)
    
    alert_type = payload.get("alert_type")
    source_esp = msg.topic.split("/")[3]
    affected_gpio = payload.get("gpio")
    
    if alert_type == "emergency_stop":
        # Log emergency
        log_emergency(source_esp, affected_gpio, payload.get("reason"))
        
        # Broadcast to all ESPs
        broadcast = {
            "action": "stop_all",
            "reason": f"Emergency triggered by {source_esp}",
            "source_esp": source_esp,
            "timestamp": int(time.time())
        }
        
        client.publish("kaiser/broadcast/emergency", 
                      json.dumps(broadcast), qos=1)
        
        # Notify administrators
        send_alert_to_admins(f"EMERGENCY: {source_esp} GPIO {affected_gpio}")

# Subscribe to alerts
client.subscribe("kaiser/+/esp/+/actuator/+/alert")
```

---

### 5. ESP Health Monitoring

```python
esp_last_seen = {}  # Track last heartbeat per ESP

def on_heartbeat(client, userdata, msg):
    """Handle ESP heartbeats"""
    payload = json.loads(msg.payload)
    esp_id = payload.get("esp_id")
    
    # Update last seen
    esp_last_seen[esp_id] = time.time()
    
    # Check for issues
    if payload.get("has_critical_errors"):
        alert_admin(f"ESP {esp_id} has critical errors")
    
    if payload.get("free_heap_kb") < 50:
        alert_admin(f"ESP {esp_id} low memory: {payload['free_heap_kb']}KB")
    
    if payload.get("wifi_rssi") < -80:
        alert_admin(f"ESP {esp_id} poor WiFi: {payload['wifi_rssi']}dBm")

# Periodic check for offline ESPs
def check_offline_esps():
    """Detect ESPs that haven't sent heartbeat in 3 minutes"""
    now = time.time()
    for esp_id, last_seen in esp_last_seen.items():
        if now - last_seen > 180:  # 3 minutes
            alert_admin(f"ESP {esp_id} OFFLINE (last seen: {int(now - last_seen)}s ago)")

# Subscribe to heartbeats
client.subscribe("kaiser/+/esp/+/system/heartbeat")
```

---

### 6. Config Validation (Server-Side)

**Purpose:** Validate configurations before sending to ESP to prevent unnecessary round-trips and errors

#### Why Server-Side Validation?

While ESPs validate all incoming configurations, server-side validation provides:

✅ **Faster Feedback** - Reject invalid configs immediately without MQTT round-trip  
✅ **Better UX** - User gets instant error message in dashboard  
✅ **Reduced Network Load** - No unnecessary MQTT messages  
✅ **Audit Trail** - Track validation failures for debugging  

#### Validation Checklist

**Before sending actuator config to ESP:**

1. ✅ **GPIO Conflict Check** - Verify GPIO not already used by sensor/actuator
2. ✅ **GPIO Capability** - Verify GPIO supports requested mode (INPUT/OUTPUT/PWM)
3. ✅ **Board Compatibility** - Check ESP board type (ESP32 Dev vs XIAO C3)
4. ✅ **Value Ranges** - Validate PWM values, intervals, etc.
5. ✅ **Required Fields** - Ensure all mandatory fields present

#### Python Implementation

```python
from typing import Dict, Tuple, Optional
from enum import Enum

class ESPBoardType(Enum):
    ESP32_DEV = "esp32dev"
    XIAO_ESP32C3 = "xiao_esp32c3"

class GPIOCapability(Enum):
    INPUT = "input"
    OUTPUT = "output"
    PWM = "pwm"
    ADC = "adc"

# GPIO capability matrix per board type
GPIO_CAPABILITIES = {
    ESPBoardType.ESP32_DEV: {
        # ADC-capable GPIOs (input mode)
        "adc": [32, 33, 34, 35, 36, 39],
        # PWM-capable GPIOs (output mode)
        "pwm": [12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27],
        # General output GPIOs
        "output": [12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27],
        # Reserved (cannot use)
        "reserved": [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11]  # Boot pins, flash, etc.
    },
    ESPBoardType.XIAO_ESP32C3: {
        "adc": [2, 3, 4],
        "pwm": [2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21],
        "output": [2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21],
        "reserved": [11, 12, 13, 18, 19]  # USB, boot pins
    }
}

class ConfigValidator:
    def __init__(self, esp_id: str):
        self.esp_id = esp_id
        self.board_type = self._get_board_type(esp_id)
        self.used_gpios = self._get_used_gpios(esp_id)
    
    def _get_board_type(self, esp_id: str) -> ESPBoardType:
        """Query database for ESP board type"""
        # Example: Query from database
        esp_info = db.query_esp_info(esp_id)
        return ESPBoardType(esp_info.get("board_type", "esp32dev"))
    
    def _get_used_gpios(self, esp_id: str) -> Dict[int, str]:
        """Get currently used GPIOs and their usage (sensor/actuator)"""
        config = db.query_esp_config(esp_id)
        used = {}
        
        # Map used GPIOs
        for sensor in config.get("sensors", []):
            used[sensor["gpio"]] = f"sensor:{sensor['sensor_type']}"
        
        for actuator in config.get("actuators", []):
            used[actuator["gpio"]] = f"actuator:{actuator['actuator_type']}"
        
        return used
    
    def validate_actuator_config(self, config: Dict) -> Tuple[bool, Optional[str]]:
        """
        Validate actuator configuration before sending to ESP
        
        Returns:
            (valid, error_message)
        """
        gpio = config.get("gpio")
        actuator_type = config.get("type")
        
        # 1. Check required fields
        if gpio is None:
            return False, "Missing required field: gpio"
        if not actuator_type:
            return False, "Missing required field: type"
        
        # 2. Check GPIO range
        if not (0 <= gpio <= 39):
            return False, f"GPIO {gpio} out of valid range (0-39)"
        
        # 3. Check reserved GPIOs
        reserved = GPIO_CAPABILITIES[self.board_type]["reserved"]
        if gpio in reserved:
            return False, f"GPIO {gpio} is reserved on {self.board_type.value}"
        
        # 4. Check GPIO conflict
        if gpio in self.used_gpios:
            usage = self.used_gpios[gpio]
            return False, f"GPIO {gpio} already in use by {usage}"
        
        # 5. Check GPIO capability
        if actuator_type in ["pump", "valve", "relay"]:
            # Binary actuators need OUTPUT capability
            if gpio not in GPIO_CAPABILITIES[self.board_type]["output"]:
                return False, f"GPIO {gpio} does not support OUTPUT mode"
        
        elif actuator_type == "pwm":
            # PWM actuators need PWM capability
            if gpio not in GPIO_CAPABILITIES[self.board_type]["pwm"]:
                return False, f"GPIO {gpio} does not support PWM mode"
        
        else:
            return False, f"Unknown actuator type: {actuator_type}"
        
        # 6. Validate PWM value range (if provided)
        if "default_value" in config:
            value = config["default_value"]
            if not (0.0 <= value <= 1.0):
                return False, f"PWM value {value} out of range (0.0-1.0)"
        
        # All checks passed
        return True, None
    
    def validate_sensor_config(self, config: Dict) -> Tuple[bool, Optional[str]]:
        """
        Validate sensor configuration before sending to ESP
        
        Returns:
            (valid, error_message)
        """
        gpio = config.get("gpio")
        sensor_type = config.get("sensor_type")
        
        # 1. Check required fields
        if gpio is None:
            return False, "Missing required field: gpio"
        if not sensor_type:
            return False, "Missing required field: sensor_type"
        
        # 2. Check GPIO range
        if not (0 <= gpio <= 39):
            return False, f"GPIO {gpio} out of valid range (0-39)"
        
        # 3. Check reserved GPIOs
        reserved = GPIO_CAPABILITIES[self.board_type]["reserved"]
        if gpio in reserved:
            return False, f"GPIO {gpio} is reserved on {self.board_type.value}"
        
        # 4. Check GPIO conflict
        if gpio in self.used_gpios:
            usage = self.used_gpios[gpio]
            return False, f"GPIO {gpio} already in use by {usage}"
        
        # 5. Check ADC capability for analog sensors
        if sensor_type in ["ph_sensor", "ec_sensor", "orp_sensor"]:
            if gpio not in GPIO_CAPABILITIES[self.board_type]["adc"]:
                return False, f"GPIO {gpio} does not support ADC (analog input)"
        
        # 6. Validate measurement interval
        if "interval_ms" in config:
            interval = config["interval_ms"]
            if not (1000 <= interval <= 3600000):  # 1s to 1 hour
                return False, f"Interval {interval}ms out of range (1000-3600000)"
        
        # All checks passed
        return True, None

# Usage in Flask/FastAPI endpoint
validator = ConfigValidator(esp_id="ESP_ABC")

@app.post("/api/v1/esp/{esp_id}/actuator/configure")
def configure_actuator(esp_id: str, config: Dict):
    """Configure actuator with server-side validation"""
    
    # Validate before sending to ESP
    validator = ConfigValidator(esp_id)
    valid, error = validator.validate_actuator_config(config)
    
    if not valid:
        logger.warning(f"Config validation failed for {esp_id}: {error}")
        return {"success": False, "error": error}, 400
    
    # Validation passed - send to ESP via MQTT
    topic = f"kaiser/god/esp/{esp_id}/config"
    payload = {"actuators": [config]}
    
    mqtt_client.publish(topic, json.dumps(payload), qos=1)
    
    # Wait for ESP response (with timeout)
    response = wait_for_esp_response(esp_id, timeout=5.0)
    
    if response and response.get("success"):
        # Update database with new config
        db.update_esp_config(esp_id, config)
        return {"success": True, "message": "Actuator configured successfully"}
    else:
        error_msg = response.get("error", "ESP did not respond") if response else "Timeout"
        return {"success": False, "error": error_msg}, 500
```

#### Validation Flow Diagram

```
┌─────────────┐
│ Dashboard   │
│ (UI)        │
└──────┬──────┘
       │ 1. Configure Actuator
       │    {"gpio": 12, "type": "pump"}
       ▼
┌─────────────┐
│ God-Kaiser  │
│ Server      │
└──────┬──────┘
       │ 2. Server-Side Validation
       │    ✅ GPIO not reserved (12 OK)
       │    ✅ GPIO not in use (no conflict)
       │    ✅ GPIO supports OUTPUT (yes)
       ▼
┌─────────────┐
│ MQTT Broker │
└──────┬──────┘
       │ 3. Send config via MQTT
       │    Topic: kaiser/god/esp/ESP_ABC/config
       ▼
┌─────────────┐
│ ESP32       │
│ ESP_ABC     │
└──────┬──────┘
       │ 4. ESP-Side Validation (double-check)
       │    ✅ All checks pass
       │    ✅ Configure actuator
       ▼
┌─────────────┐
│ MQTT Broker │
└──────┬──────┘
       │ 5. Response
       │    Topic: kaiser/god/esp/ESP_ABC/config_response
       │    {"success": true}
       ▼
┌─────────────┐
│ God-Kaiser  │
│ Server      │
└──────┬──────┘
       │ 6. Update database
       │    Store actuator config
       ▼
┌─────────────┐
│ Dashboard   │
│ (UI)        │
└─────────────┘
   7. Show success message
```

#### Error Scenarios

**Scenario 1: GPIO Conflict**

```python
# User tries to add actuator on GPIO 12
# But GPIO 12 already has a sensor

validator = ConfigValidator("ESP_ABC")
valid, error = validator.validate_actuator_config({
    "gpio": 12,
    "type": "pump",
    "name": "Main Pump"
})

# Result:
# valid = False
# error = "GPIO 12 already in use by sensor:ph_sensor"

# Dashboard shows error immediately (no MQTT needed)
```

**Scenario 2: Invalid GPIO Capability**

```python
# User tries to add PWM actuator on GPIO 34
# But GPIO 34 is input-only (ADC) on ESP32

validator = ConfigValidator("ESP_DEV_001")
valid, error = validator.validate_actuator_config({
    "gpio": 34,
    "type": "pwm",
    "name": "LED Dimmer"
})

# Result:
# valid = False
# error = "GPIO 34 does not support PWM mode"
```

**Scenario 3: Reserved GPIO**

```python
# User tries to use GPIO 0 (boot pin)

validator = ConfigValidator("ESP_ABC")
valid, error = validator.validate_actuator_config({
    "gpio": 0,
    "type": "relay",
    "name": "Heater"
})

# Result:
# valid = False
# error = "GPIO 0 is reserved on esp32dev"
```

#### Benefits

**For Users:**
- ⚡ Instant feedback (no waiting for ESP response)
- 🎯 Clear error messages
- 🚫 Prevents invalid configurations

**For System:**
- 📉 Reduced MQTT traffic
- 🔄 Fewer failed transactions
- 📊 Better audit trail (track validation failures)

**For Developers:**
- 🧪 Test validation logic separately from ESP
- 🐛 Easier debugging (validation errors in server logs)
- 📝 Centralized validation rules

---

### 7. God-Kaiser Mock Server (Local Development & Testing)

**Location:** `god_kaiser_test_server/`

This directory contains a **complete mock God-Kaiser server** for local development and integration testing. It simulates the real God-Kaiser server behavior without requiring the full production stack.

#### 📦 What's Included

**Files:**
- `main.py` - FastAPI server with HTTP endpoints + MQTT automation logic
- `mqtt_client.py` - MQTT wrapper with decorator-based subscriptions
- `docker-compose.yml` - Orchestrates MQTT broker + FastAPI server
- `Dockerfile` - Builds Python server image
- `mosquitto.conf` - MQTT broker configuration (port 1883, anonymous)
- `requirements.txt` - Python dependencies (fastapi, uvicorn, paho-mqtt)

#### 🎯 Purpose

1. **End-to-End Integration Tests** - Docker tests (6-8) in `test_actuator_integration.cpp` require this
2. **Local Development** - Test ESP firmware against a working server without deploying God-Kaiser
3. **CI/CD Pipeline** - Automated tests run against this mock in GitHub Actions
4. **Server Development** - Prototype God-Kaiser features before implementing in production

#### 🚀 Quick Start

**Start the Mock Server:**

```bash
cd god_kaiser_test_server
docker-compose up -d
```

**Verify it's running:**

```bash
# Check MQTT broker
mosquitto_sub -h localhost -t 'kaiser/#' -v

# Check HTTP endpoint
curl http://localhost:8000/api/v1/sensors/process \
  -H "Content-Type: application/json" \
  -d '{"esp_id":"ESP_TEST","gpio":4,"sensor_type":"ph_sensor","raw_value":2048.0,"timestamp":1234567890}'
```

**Stop the Mock Server:**

```bash
docker-compose down
```

#### 🔌 Services

**1. Mosquitto MQTT Broker**
- **Port:** 1883 (MQTT), 9001 (WebSocket)
- **Authentication:** Anonymous (for testing only)
- **Max Connections:** 100
- **Configuration:** `mosquitto.conf`

**2. FastAPI Mock Server**
- **Port:** 8000 (HTTP)
- **Endpoints:** 
  - `POST /api/v1/sensors/process` - Pi-Enhanced sensor processing
  - Health check available at root

#### 📡 Implemented Automation Rules

The mock server implements these God-Kaiser automation rules:

**Rule 1: pH Correction**

```python
# In main.py
if sensor_type == "ph_sensor":
    ph = (raw_value / 4095.0) * 14.0
    if ph < 6.0:
        # Send command to actuator
        command_topic = f"kaiser/god/esp/{target_esp}/actuator/12/command"
        command_payload = {
            "command": "ON",
            "reason": "Automation Rule: pH too low",
            "rule_id": "rule_ph_low",
            "timestamp": int(time.time())
        }
        mqtt_client.publish(command_topic, command_payload, qos=1)
```

**Listens to:** `kaiser/god/esp/+/sensor/+/data`  
**Publishes to:** `kaiser/god/esp/{target_esp}/actuator/12/command`  
**Trigger:** pH < 6.0 → Turn ON actuator on GPIO 12

**Rule 2: Emergency Broadcast**

```python
# In main.py
@mqtt_client.subscribe("kaiser/god/esp/+/actuator/+/alert")
def handle_actuator_alert(topic: str, payload: Dict[str, Any]) -> None:
    if payload.get("alert_type") == "emergency_stop":
        broadcast_payload = {
            "action": "stop_all",
            "reason": payload.get("reason"),
            "source_esp": payload.get("esp_id"),
            "timestamp": int(time.time())
        }
        mqtt_client.publish("kaiser/broadcast/emergency", broadcast_payload, qos=1)
```

**Listens to:** `kaiser/god/esp/+/actuator/+/alert`  
**Publishes to:** `kaiser/broadcast/emergency`  
**Trigger:** Emergency alert from any ESP → Broadcast to all ESPs

#### 🧑‍💻 Usage Scenarios

**Scenario 1: ESP Firmware Developer**

```bash
# Terminal 1: Start mock server
cd god_kaiser_test_server
docker-compose up

# Terminal 2: Flash ESP and monitor
cd ..
pio run -t upload
pio device monitor

# Terminal 3: Monitor MQTT traffic
mosquitto_sub -h localhost -t 'kaiser/#' -v
```

**What you'll see:**
- ESP connects to MQTT broker
- Publishes heartbeat every 60s
- Sends sensor data
- Receives actuator commands from automation rules

**Scenario 2: Server Developer (Prototyping)**

You want to add a new automation rule before implementing it in production God-Kaiser:

1. Edit `main.py` and add your rule:

```python
@mqtt_client.subscribe("kaiser/god/esp/+/sensor/+/data")
def handle_new_rule(topic: str, payload: Dict[str, Any]) -> None:
    # Your new automation logic here
    pass
```

2. Restart the mock server:

```bash
docker-compose restart god_kaiser_mock
```

3. Test with a real ESP or MQTT simulator:

```bash
# Simulate sensor data
mosquitto_pub -h localhost -t 'kaiser/god/esp/ESP_TEST/sensor/4/data' \
  -m '{"sensor_type":"ph_sensor","raw_value":1500.0,"timestamp":1234567890}'

# Watch for automation command
mosquitto_sub -h localhost -t 'kaiser/god/esp/+/actuator/+/command' -v
```

**Scenario 3: UI/Interface Developer**

You're building the God-Kaiser dashboard and need to test UI without real hardware:

**Step 1: Start Mock Server**

```bash
cd god_kaiser_test_server
docker-compose up -d
```

**Step 2: Simulate ESP Data**

Use Python script to generate fake sensor data:

```python
# simulate_esp.py
import paho.mqtt.client as mqtt
import json
import time
import random

client = mqtt.Client()
client.connect("localhost", 1883, 60)

while True:
    # Simulate pH sensor
    sensor_data = {
        "gpio": 4,
        "sensor_type": "ph_sensor",
        "sensor_name": "Tank pH",
        "raw_value": random.randint(1800, 2500),  # pH 6.0-8.5
        "processed_value": random.uniform(6.0, 8.5),
        "unit": "pH",
        "quality": "good",
        "timestamp": int(time.time())
    }
    
    topic = "kaiser/god/esp/ESP_TEST/sensor/4/data"
    client.publish(topic, json.dumps(sensor_data), qos=1)
    print(f"Published: {sensor_data['processed_value']:.2f} pH")
    time.sleep(5)
```

**Step 3: Subscribe to All Topics in Your UI**

```javascript
// React/Vue/Angular example
const mqtt = require('mqtt');
const client = mqtt.connect('ws://localhost:9001');

client.on('connect', () => {
  // Subscribe to all topics
  client.subscribe('kaiser/#');
});

client.on('message', (topic, message) => {
  const payload = JSON.parse(message.toString());
  
  // Update UI based on topic
  if (topic.includes('/sensor/') && topic.includes('/data')) {
    updateSensorDisplay(payload);
  }
  else if (topic.includes('/actuator/') && topic.includes('/status')) {
    updateActuatorDisplay(payload);
  }
  else if (topic.includes('/system/heartbeat')) {
    updateESPStatus(payload);
  }
});
```

**Step 4: Send Commands from UI**

```javascript
// Send actuator command from dashboard
function turnOnPump(espId, gpio) {
  const command = {
    command: 'ON',
    reason: 'Manual control from dashboard',
    timestamp: Math.floor(Date.now() / 1000)
  };
  
  const topic = `kaiser/god/esp/${espId}/actuator/${gpio}/command`;
  client.publish(topic, JSON.stringify(command), { qos: 1 });
}
```

**Scenario 4: Integration Testing**

Run ESP integration tests against mock server:

```bash
# Start mock server
cd god_kaiser_test_server
docker-compose up -d

# Run ESP integration tests
cd ..
pio test -e esp32dev --filter "test_actuator_integration"

# Check test results
# Tests 6-8 (Docker tests) will now pass!
```

#### 🔍 Monitoring & Debugging

**View MQTT Traffic:**

```bash
# Subscribe to all topics
mosquitto_sub -h localhost -t 'kaiser/#' -v

# Subscribe to specific ESP
mosquitto_sub -h localhost -t 'kaiser/god/esp/ESP_ABC/#' -v

# Subscribe to all sensor data
mosquitto_sub -h localhost -t 'kaiser/+/esp/+/sensor/+/data' -v

# Subscribe to all actuator commands
mosquitto_sub -h localhost -t 'kaiser/+/esp/+/actuator/+/command' -v
```

**View Mock Server Logs:**

```bash
# Follow logs
docker-compose logs -f god_kaiser_mock

# View MQTT broker logs
docker-compose logs -f mosquitto
```

**HTTP Endpoint Testing:**

```bash
# Test Pi-Enhanced endpoint with curl
curl -X POST http://localhost:8000/api/v1/sensors/process \
  -H "Content-Type: application/json" \
  -d '{
    "esp_id": "ESP_TEST",
    "gpio": 4,
    "sensor_type": "ph_sensor",
    "raw_value": 2048.0,
    "timestamp": 1234567890
  }'

# Expected response:
# {
#   "processed_value": 7.0,
#   "unit": "pH",
#   "quality": "good",
#   "timestamp": 1234567890,
#   "esp_id": "ESP_TEST",
#   "gpio": 4
# }
```

#### 🎓 For Server Developers

**How to use this as a blueprint for production God-Kaiser:**

1. **MQTT Subscription Pattern:**

The mock uses a decorator pattern for clean subscription handling:

```python
@mqtt_client.subscribe("kaiser/god/esp/+/sensor/+/data")
def handle_sensor_data(topic: str, payload: Dict[str, Any]) -> None:
    # Your automation logic here
    pass
```

**Copy this pattern to production God-Kaiser:**
- Clean separation of concerns
- Easy to add new rules
- Type-safe with Python type hints
- Error handling per subscription

2. **Automation Rule Structure:**

Each rule should follow this pattern:

```python
def automation_rule(topic: str, payload: Dict[str, Any]) -> None:
    # 1. Extract data
    sensor_type = payload.get("sensor_type")
    raw_value = payload.get("raw_value")
    
    # 2. Apply business logic
    if condition_met(raw_value):
        # 3. Determine target
        target_esp = determine_target_esp(topic)
        target_gpio = determine_target_gpio(sensor_type)
        
        # 4. Build command
        command = {
            "command": "ON",
            "reason": "Automation Rule: <description>",
            "rule_id": "rule_<name>",
            "timestamp": int(time.time())
        }
        
        # 5. Publish command
        command_topic = f"kaiser/god/esp/{target_esp}/actuator/{target_gpio}/command"
        mqtt_client.publish(command_topic, command, qos=1)
        
        # 6. Log action
        logger.info("Rule triggered: %s", command["rule_id"])
```

3. **HTTP Endpoint Pattern:**

The Pi-Enhanced endpoint demonstrates the contract:

```python
@app.post("/api/v1/sensors/process")
async def process_sensor(request: SensorProcessRequest):
    # 1. Validate sensor type
    if request.sensor_type not in SUPPORTED_SENSORS:
        raise HTTPException(status_code=400, detail="Unknown sensor type")
    
    # 2. Process raw value
    processed_value = process_sensor_value(
        request.sensor_type,
        request.raw_value
    )
    
    # 3. Determine quality
    quality = assess_quality(processed_value, request.sensor_type)
    
    # 4. Return structured response
    return {
        "processed_value": processed_value,
        "unit": get_unit(request.sensor_type),
        "quality": quality,
        "timestamp": request.timestamp,
        "esp_id": request.esp_id,
        "gpio": request.gpio
    }
```

4. **Emergency Handling Pattern:**

The emergency broadcast demonstrates critical safety features:

```python
@mqtt_client.subscribe("kaiser/god/esp/+/actuator/+/alert")
def handle_actuator_alert(topic: str, payload: Dict[str, Any]) -> None:
    alert_type = payload.get("alert_type")
    
    if alert_type == "emergency_stop":
        # 1. Log emergency (CRITICAL)
        logger.critical("Emergency alert received: %s", payload)
        
        # 2. Broadcast to ALL ESPs (within 100ms)
        broadcast_payload = {
            "action": "stop_all",
            "reason": payload.get("reason"),
            "source_esp": payload.get("esp_id"),
            "timestamp": int(time.time())
        }
        mqtt_client.publish("kaiser/broadcast/emergency", broadcast_payload, qos=1)
        
        # 3. Notify administrators
        send_alert(priority="CRITICAL", message=f"Emergency: {payload}")
        
        # 4. Store in database for audit
        db.log_emergency_event(payload)
```

#### 🖥️ For UI/Interface Developers

**Complete WebSocket Integration Example:**

```javascript
// dashboard.js - Complete God-Kaiser Dashboard Integration

import mqtt from 'mqtt';

class GodKaiserDashboard {
  constructor() {
    // Connect to MQTT broker via WebSocket
    this.client = mqtt.connect('ws://localhost:9001', {
      clientId: 'dashboard_' + Math.random().toString(16).substr(2, 8),
      clean: true,
      reconnectPeriod: 1000
    });
    
    this.espDevices = new Map();
    this.sensors = new Map();
    this.actuators = new Map();
    
    this.setupMQTTHandlers();
  }
  
  setupMQTTHandlers() {
    this.client.on('connect', () => {
      console.log('Connected to God-Kaiser Mock Server');
      
      // Subscribe to all relevant topics
      this.client.subscribe('kaiser/+/esp/+/sensor/+/data');
      this.client.subscribe('kaiser/+/esp/+/actuator/+/status');
      this.client.subscribe('kaiser/+/esp/+/actuator/+/response');
      this.client.subscribe('kaiser/+/esp/+/actuator/+/alert');
      this.client.subscribe('kaiser/+/esp/+/system/heartbeat');
      this.client.subscribe('kaiser/broadcast/emergency');
    });
    
    this.client.on('message', (topic, message) => {
      const payload = JSON.parse(message.toString());
      this.routeMessage(topic, payload);
    });
  }
  
  routeMessage(topic, payload) {
    if (topic.includes('/sensor/') && topic.includes('/data')) {
      this.handleSensorData(topic, payload);
    }
    else if (topic.includes('/actuator/') && topic.includes('/status')) {
      this.handleActuatorStatus(topic, payload);
    }
    else if (topic.includes('/actuator/') && topic.includes('/alert')) {
      this.handleActuatorAlert(topic, payload);
    }
    else if (topic.includes('/system/heartbeat')) {
      this.handleHeartbeat(topic, payload);
    }
    else if (topic.includes('/broadcast/emergency')) {
      this.handleEmergencyBroadcast(payload);
    }
  }
  
  handleSensorData(topic, payload) {
    // Update sensor display
    const sensorId = `${payload.gpio}`;
    this.sensors.set(sensorId, {
      ...payload,
      lastUpdate: Date.now()
    });
    
    // Update UI
    this.updateSensorCard(sensorId, payload);
    
    // Add to chart
    this.addToChart(sensorId, payload.processed_value, payload.timestamp);
  }
  
  handleActuatorStatus(topic, payload) {
    const actuatorId = `${payload.gpio}`;
    this.actuators.set(actuatorId, {
      ...payload,
      lastUpdate: Date.now()
    });
    
    // Update UI switch/slider
    this.updateActuatorControl(actuatorId, payload);
  }
  
  handleHeartbeat(topic, payload) {
    const espId = payload.esp_id;
    this.espDevices.set(espId, {
      ...payload,
      status: 'online',
      lastSeen: Date.now()
    });
    
    // Update ESP status indicator
    this.updateESPStatus(espId, payload);
  }
  
  handleActuatorAlert(topic, payload) {
    // Show alert banner
    this.showAlert({
      type: 'warning',
      title: 'Actuator Alert',
      message: `${payload.alert_type} on GPIO ${payload.gpio}`,
      payload: payload
    });
  }
  
  handleEmergencyBroadcast(payload) {
    // Show critical alert
    this.showAlert({
      type: 'critical',
      title: 'EMERGENCY BROADCAST',
      message: `${payload.reason} from ${payload.source_esp}`,
      payload: payload
    });
    
    // Disable all controls
    this.disableAllControls();
  }
  
  // Control methods (call these from UI buttons)
  turnOnActuator(espId, gpio) {
    const topic = `kaiser/god/esp/${espId}/actuator/${gpio}/command`;
    const command = {
      command: 'ON',
      reason: 'Manual control from dashboard',
      timestamp: Math.floor(Date.now() / 1000)
    };
    this.client.publish(topic, JSON.stringify(command), { qos: 1 });
  }
  
  turnOffActuator(espId, gpio) {
    const topic = `kaiser/god/esp/${espId}/actuator/${gpio}/command`;
    const command = {
      command: 'OFF',
      reason: 'Manual control from dashboard',
      timestamp: Math.floor(Date.now() / 1000)
    };
    this.client.publish(topic, JSON.stringify(command), { qos: 1 });
  }
  
  setPWM(espId, gpio, value) {
    const topic = `kaiser/god/esp/${espId}/actuator/${gpio}/command`;
    const command = {
      command: 'PWM',
      value: value,  // 0.0 - 1.0
      reason: 'Manual PWM control from dashboard',
      timestamp: Math.floor(Date.now() / 1000)
    };
    this.client.publish(topic, JSON.stringify(command), { qos: 1 });
  }
  
  triggerEmergencyStop(espId) {
    const topic = `kaiser/god/esp/${espId}/actuator/emergency`;
    const command = {
      action: 'stop_all',
      reason: 'Emergency triggered from dashboard',
      timestamp: Math.floor(Date.now() / 1000)
    };
    this.client.publish(topic, JSON.stringify(command), { qos: 1 });
  }
}

// Usage in React/Vue/Angular
const dashboard = new GodKaiserDashboard();

// Example: Wire up button click
document.getElementById('pump-on-btn').addEventListener('click', () => {
  dashboard.turnOnActuator('ESP_TEST', 12);
});
```

**Testing Your UI:**

1. Start mock server: `docker-compose up -d`
2. Run simulation script (above) to generate sensor data
3. Open your dashboard/UI
4. Verify:
   - ✅ Sensor values update in real-time
   - ✅ Actuator controls send commands
   - ✅ Status indicators show ESP health
   - ✅ Alerts appear when emergency triggered
   - ✅ Charts/graphs display historical data

#### ⚙️ Configuration

**Environment Variables:**

Edit `docker-compose.yml` to customize behavior:

```yaml
environment:
  - MQTT_BROKER=mosquitto          # MQTT broker hostname
  - MQTT_PORT=1883                 # MQTT port
  - LOG_LEVEL=DEBUG                # Logging: DEBUG, INFO, WARNING, ERROR
  - GK_TARGET_ACTUATOR_ESP=ESP_BBB # Target ESP for automation rules
```

**Adding New Automation Rules:**

Edit `main.py` and add your subscription handler:

```python
@mqtt_client.subscribe("kaiser/god/esp/+/sensor/+/data")
def handle_temperature_rule(topic: str, payload: Dict[str, Any]) -> None:
    if payload.get("sensor_type") == "temperature":
        temp = payload.get("processed_value", 0)
        if temp > 30.0:
            # Send cooling command
            pass
```

#### 🐛 Troubleshooting

**MQTT Connection Fails:**

```bash
# Check if broker is running
docker-compose ps

# Check broker logs
docker-compose logs mosquitto

# Test connection
mosquitto_pub -h localhost -t 'test' -m 'hello'
```

**HTTP Endpoint Not Responding:**

```bash
# Check if FastAPI server is running
curl http://localhost:8000

# Check server logs
docker-compose logs god_kaiser_mock

# Restart server
docker-compose restart god_kaiser_mock
```

**No Automation Rules Triggering:**

```bash
# Check server logs for subscription confirmation
docker-compose logs god_kaiser_mock | grep "Subscribed"

# Verify sensor data format
mosquitto_pub -h localhost \
  -t 'kaiser/god/esp/ESP_TEST/sensor/4/data' \
  -m '{"sensor_type":"ph_sensor","raw_value":1000.0,"timestamp":1234567890}'

# Watch for commands
mosquitto_sub -h localhost -t 'kaiser/+/esp/+/actuator/+/command' -v
```

#### 📚 Further Reading

- **FastAPI Documentation:** https://fastapi.tiangolo.com/
- **Paho MQTT Python:** https://www.eclipse.org/paho/clients/python/
- **Mosquitto MQTT Broker:** https://mosquitto.org/man/mosquitto-conf-5.html
- **MQTT.js (Browser):** https://github.com/mqttjs/MQTT.js

---

### 7. Load Testing & Performance Validation

**Purpose:** Validate God-Kaiser server performance under realistic production load

#### 🎯 Load Testing Scenarios

**Scenario 1: Multi-ESP Heartbeat Simulation (100 ESPs)**

Simulate 100 ESPs sending heartbeats every 60 seconds:

```bash
#!/bin/bash
# simulate_100_esps.sh

for i in {1..100}; do
  (
    ESP_ID="ESP_$(printf '%03d' $i)"
    while true; do
      # Generate realistic heartbeat
      UPTIME=$((RANDOM * 1000))
      FREE_HEAP=$((200 + RANDOM % 100))
      RSSI=$((-40 - RANDOM % 40))
      
      mosquitto_pub -h localhost -t "kaiser/god/esp/$ESP_ID/system/heartbeat" \
        -m "{
          \"esp_id\":\"$ESP_ID\",
          \"uptime_ms\":$UPTIME,
          \"free_heap_kb\":$FREE_HEAP,
          \"boot_count\":1,
          \"error_count\":0,
          \"has_critical_errors\":false,
          \"sensor_count\":5,
          \"actuator_count\":3,
          \"wifi_rssi\":$RSSI,
          \"mqtt_connected\":true,
          \"timestamp\":$(date +%s)
        }" \
        -q 1
      
      sleep 60
    done
  ) &
done

echo "Started 100 ESP simulators"
echo "Press Ctrl+C to stop"
wait
```

**Expected Load:**
- 100 messages every 60 seconds = ~1.67 msg/s
- Payload size: ~250 bytes
- Bandwidth: ~400 bytes/s

**Scenario 2: High-Frequency Sensor Data (1000 msg/s)**

Simulate 20 ESPs with 5 sensors each, measuring every 2 seconds:

```bash
#!/bin/bash
# simulate_sensor_burst.sh

for esp in {1..20}; do
  for sensor in {1..5}; do
    (
      ESP_ID="ESP_$(printf '%03d' $esp)"
      GPIO=$((4 + sensor - 1))
      
      while true; do
        RAW_VALUE=$((1500 + RANDOM % 1000))
        PROCESSED=$(echo "scale=2; $RAW_VALUE / 4095.0 * 14.0" | bc)
        
        mosquitto_pub -h localhost \
          -t "kaiser/god/esp/$ESP_ID/sensor/$GPIO/data" \
          -m "{
            \"gpio\":$GPIO,
            \"sensor_type\":\"ph_sensor\",
            \"sensor_name\":\"pH Sensor $sensor\",
            \"raw_value\":$RAW_VALUE,
            \"processed_value\":$PROCESSED,
            \"unit\":\"pH\",
            \"quality\":\"good\",
            \"timestamp\":$(date +%s)
          }" \
          -q 1
        
        sleep 2
      done
    ) &
  done
done

echo "Started 100 sensor simulators (20 ESPs × 5 sensors)"
echo "Message rate: ~50 msg/s"
wait
```

**Expected Load:**
- 100 sensors, 1 message per 2 seconds = 50 msg/s
- Payload size: ~200 bytes
- Bandwidth: ~10 KB/s

**Scenario 3: Emergency Cascade (Stress Test)**

Simulate emergency stop cascade across all ESPs:

```bash
#!/bin/bash
# simulate_emergency_cascade.sh

# 1. Trigger emergency on ESP_001
mosquitto_pub -h localhost \
  -t "kaiser/god/esp/ESP_001/actuator/12/alert" \
  -m "{
    \"alert_type\":\"emergency_stop\",
    \"gpio\":12,
    \"reason\":\"Load test emergency cascade\",
    \"esp_id\":\"ESP_001\",
    \"timestamp\":$(date +%s)
  }" \
  -q 1

echo "Emergency triggered on ESP_001"
echo "Waiting for God-Kaiser to broadcast..."

# 2. Wait for broadcast to propagate
sleep 1

# 3. Verify all ESPs received emergency
for i in {1..100}; do
  ESP_ID="ESP_$(printf '%03d' $i)"
  
  # Each ESP publishes acknowledgment
  mosquitto_pub -h localhost \
    -t "kaiser/god/esp/$ESP_ID/actuator/emergency" \
    -m "{
      \"action\":\"acknowledged\",
      \"source_esp\":\"ESP_001\",
      \"timestamp\":$(date +%s)
    }" \
    -q 1
  
  # Small delay to avoid overwhelming broker
  sleep 0.01
done

echo "All 100 ESPs acknowledged emergency"
```

**Expected Load:**
- 1 alert + 1 broadcast + 100 acknowledgments = 102 messages
- Time window: <2 seconds
- Peak rate: ~50 msg/s

#### 📊 MQTT Broker Monitoring

**Monitor Broker Health:**

```bash
# Monitor connection count
mosquitto_sub -h localhost -t '$SYS/broker/clients/connected' -v

# Monitor message rate (sent)
mosquitto_sub -h localhost -t '$SYS/broker/messages/sent' -v

# Monitor message rate (received)
mosquitto_sub -h localhost -t '$SYS/broker/messages/received' -v

# Monitor queue depth
mosquitto_sub -h localhost -t '$SYS/broker/store/messages/count' -v

# Monitor subscription count
mosquitto_sub -h localhost -t '$SYS/broker/subscriptions/count' -v

# Monitor all $SYS topics
mosquitto_sub -h localhost -t '$SYS/#' -v
```

**Expected Metrics (Healthy Broker):**

```
Clients connected: 1-150 (100 ESPs + server + monitors)
Messages sent/min: 6000-10000 (depends on scenario)
Messages received/min: 6000-10000
Queue depth: <100 messages (good)
             100-1000 (warning)
             >1000 (critical - broker overloaded)
```

#### 🔥 HTTP Load Testing (Pi-Enhanced Mode)

**Using `hey` (lightweight HTTP load tester):**

```bash
# Install hey
go install github.com/rakyll/hey@latest

# Test Pi-Enhanced endpoint with 100 requests/second for 60 seconds
hey -z 60s -q 100 -m POST \
  -H "Content-Type: application/json" \
  -d '{"esp_id":"ESP_LOAD","gpio":4,"sensor_type":"ph_sensor","raw_value":2048.0,"timestamp":1234567890}' \
  http://localhost:8000/api/v1/sensors/process

# Expected output:
# Summary:
#   Total: 60.0052 secs
#   Requests/sec: 99.9913
#   
#   Response time histogram:
#     0.002 [1]     |
#     0.010 [5821]  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
#     0.018 [12]    |
#   
#   Latency distribution:
#     50% in 0.0048 secs
#     95% in 0.0092 secs
#     99% in 0.0156 secs
```

**Using Python `locust`:**

```python
# locustfile.py
from locust import HttpUser, task, between
import random

class GodKaiserUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def process_sensor(self):
        payload = {
            "esp_id": f"ESP_{random.randint(1, 100):03d}",
            "gpio": random.randint(1, 39),
            "sensor_type": "ph_sensor",
            "raw_value": random.uniform(1500, 2500),
            "timestamp": int(time.time())
        }
        self.client.post("/api/v1/sensors/process", json=payload)

# Run load test:
# locust -f locustfile.py --host http://localhost:8000 --users 100 --spawn-rate 10
```

#### 📈 Performance Benchmarks

**Target Metrics (Production-Ready System):**

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| **MQTT Message Rate** | <10,000 msg/s | 10k-50k | >50k |
| **MQTT Latency (P95)** | <50ms | 50-200ms | >200ms |
| **HTTP Response Time (P95)** | <100ms | 100-500ms | >500ms |
| **Broker CPU Usage** | <50% | 50-80% | >80% |
| **Broker Memory Usage** | <1GB | 1-2GB | >2GB |
| **Message Queue Depth** | <100 | 100-1000 | >1000 |
| **Connection Stability** | >99.9% | 99-99.9% | <99% |

**Scaling Guidelines:**

| ESP Count | Expected Load | Recommended Hardware |
|-----------|---------------|----------------------|
| 1-10 ESPs | ~100 msg/min | Raspberry Pi 4 (4GB) |
| 10-50 ESPs | ~500 msg/min | VPS (2 vCPU, 4GB RAM) |
| 50-100 ESPs | ~2000 msg/min | VPS (4 vCPU, 8GB RAM) |
| 100-500 ESPs | ~10k msg/min | Dedicated (8 vCPU, 16GB RAM) |
| 500+ ESPs | ~50k+ msg/min | Cluster + Load Balancer |

#### 🔍 Profiling God-Kaiser Server

**Enable Python profiling:**

```python
# Add to main.py
import cProfile
import pstats

profiler = cProfile.Profile()

@app.on_event("startup")
async def startup_event():
    profiler.enable()
    mqtt_client.connect()
    register_subscriptions()

@app.on_event("shutdown")
async def shutdown_event():
    profiler.disable()
    stats = pstats.Stats(profiler)
    stats.sort_stats('cumulative')
    stats.print_stats(20)  # Print top 20 functions

# Run load test, then check output for bottlenecks
```

**Monitor with `htop` or `glances`:**

```bash
# Install glances (better than htop)
pip install glances

# Monitor in real-time
glances

# Watch for:
# - CPU spikes during message processing
# - Memory leaks (increasing RAM usage)
# - I/O wait (slow disk/database)
```

#### ⚡ Optimization Tips

**For Server Developers:**

1. **Batch Database Writes:**
```python
# Bad: Individual writes
for msg in messages:
    db.insert_sensor_data(msg)

# Good: Batch writes
db.bulk_insert_sensor_data(messages)
```

2. **Use Connection Pooling:**
```python
# Use connection pool for database
from sqlalchemy import create_engine
engine = create_engine(
    'postgresql://...',
    pool_size=20,
    max_overflow=40
)
```

3. **Async MQTT Callbacks:**
```python
# Process messages asynchronously
import asyncio

@mqtt_client.subscribe("kaiser/+/esp/+/sensor/+/data")
async def handle_sensor_data(topic: str, payload: Dict) -> None:
    # Non-blocking processing
    await process_async(payload)
```

4. **Cache Frequently Accessed Data:**
```python
# Cache ESP configs in memory
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_esp_config(esp_id: str) -> Dict:
    return db.query_esp_config(esp_id)
```

#### 🎯 Load Test Checklist

Before production deployment:

- [ ] Run 100 ESP heartbeat simulation for 24 hours
- [ ] Verify MQTT broker queue depth stays <100
- [ ] Test emergency cascade with 100 ESPs (<2s propagation)
- [ ] HTTP endpoint handles 100 req/s with <100ms P95 latency
- [ ] Memory usage stable (no leaks over 24 hours)
- [ ] Database can handle 10k writes/minute
- [ ] Server recovers gracefully from broker restart
- [ ] Logging doesn't fill disk (log rotation configured)

---

## Test Helpers Reference

### VirtualActuatorDriver

**Purpose:** Simulates actuator hardware for testing

**Key Methods:**

- `begin(config)` - Initialize virtual actuator
- `setValue(value)` - Set PWM value (0.0-1.0)
- `setBinary(state)` - Set ON/OFF state
- `emergencyStop()` - Trigger emergency stop
- `wasCommandCalled(cmd)` - Check if command was executed
- `getCommandCount(cmd)` - Count specific commands

**Server Relevance:**

- Use this pattern for server-side actuator mocking
- Copy `wasCommandCalled()` pattern to verify server commands sent

---

### MockMQTTBroker

**Purpose:** Simulates MQTT broker for testing

**Key Methods:**

- `publish(topic, payload)` - Publish message
- `subscribe(client_id, topic_pattern, callback)` - Subscribe to topic
- `wasPublished(topic_substring)` - Check if topic was published
- `getLastPayload(topic_substring)` - Get most recent payload
- `clearPublished()` - Clear message history

**Server Relevance:**

- **CRITICAL FOR SERVER INTEGRATION TESTS**
- Copy this class to server-side tests
- Use to validate ESP → Server message flow

**Example Server-Side Test (Python):**

```python
# Python equivalent of MockMQTTBroker
class MockMQTTBroker:
    def __init__(self):
        self.published = []
        
    def publish(self, topic, payload):
        self.published.append({
            "topic": topic,
            "payload": payload,
            "timestamp": time.time()
        })
    
    def was_published(self, topic_substring):
        return any(topic_substring in msg["topic"] 
                  for msg in self.published)
    
    def get_last_payload(self, topic_substring):
        for msg in reversed(self.published):
            if topic_substring in msg["topic"]:
                return msg["payload"]
        return None
```

---

### TemporaryTestActuator

**Purpose:** RAII wrapper for test actuators (auto-cleanup)

**Server Relevance:**

- Use this pattern for server-side resource management
- Ensures cleanup even if test fails

**Python Equivalent:**

```python
class TemporaryTestActuator:
    def __init__(self, esp_id, gpio):
        self.esp_id = esp_id
        self.gpio = gpio
        # Create virtual actuator
        
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Cleanup (remove actuator)
        pass

# Usage
with TemporaryTestActuator("ESP_TEST", 12) as actuator:
    # Test code
    pass
# Automatic cleanup when exiting with-block
```

---

## Running Tests Locally

### Prerequisites

```bash
# Install PlatformIO
pip install platformio

# Clone repository
git clone [repo_url]
cd "El Trabajante"
```

### Run All Tests

```bash
pio test -e esp32dev
```

### Run Specific Test Suite

```bash
pio test -e esp32dev --filter "test_actuator_integration"
```

### Run with Docker (God-Kaiser Mock)

```bash
# Start Docker services
cd god_kaiser_test_server
docker-compose up -d

# Run tests
cd ..
pio test -e esp32dev --filter "test_actuator_integration"

# Stop Docker
cd god_kaiser_test_server
docker-compose down
```

---

## Server-Side Test Template

```python
import pytest
import paho.mqtt.client as mqtt
import json
import time

@pytest.fixture
def mqtt_client():
    """Setup MQTT client for testing"""
    client = mqtt.Client()
    client.connect("localhost", 1883, 60)
    client.loop_start()
    yield client
    client.loop_stop()
    client.disconnect()

def test_sensor_data_reception(mqtt_client):
    """Test server receives sensor data from ESP"""
    received = []
    
    def on_message(client, userdata, msg):
        received.append(json.loads(msg.payload))
    
    mqtt_client.on_message = on_message
    mqtt_client.subscribe("kaiser/+/esp/+/sensor/+/data")
    
    # Wait for message (or simulate ESP publishing)
    time.sleep(2)
    
    # Verify message received
    assert len(received) > 0
    assert "gpio" in received[0]
    assert "sensor_type" in received[0]
    assert "raw_value" in received[0]

def test_actuator_command_response(mqtt_client):
    """Test ESP responds to actuator command"""
    response_received = False
    
    def on_message(client, userdata, msg):
        nonlocal response_received
        payload = json.loads(msg.payload)
        if payload.get("success"):
            response_received = True
    
    mqtt_client.on_message = on_message
    mqtt_client.subscribe("kaiser/+/esp/+/actuator/+/response")
    
    # Send command
    command = {
        "command": "ON",
        "reason": "Test command",
        "timestamp": int(time.time())
    }
    mqtt_client.publish("kaiser/god/esp/ESP_TEST/actuator/12/command", 
                       json.dumps(command), qos=1)
    
    # Wait for response
    time.sleep(2)
    
    # Verify response
    assert response_received, "ESP did not respond to command"
```

---

## Troubleshooting

### ESP Not Publishing Messages

1. Check WiFi connection: `pio device monitor`
2. Verify MQTT broker running: `mosquitto -v`
3. Check topic subscriptions: `mosquitto_sub -h localhost -t 'kaiser/#' -v`

### Tests Failing

1. Check GPIO availability: Some tests skip if no free GPIOs
2. Verify Docker running: `docker-compose ps` (for Docker tests)
3. Check test output: `pio test -e esp32dev -v`

### Server Not Receiving Messages

1. Verify MQTT broker address correct in ESP config
2. Check firewall rules (port 1883)
3. Subscribe to wildcard: `mosquitto_sub -h localhost -t '#' -v`

---

## Summary

This test suite provides a complete validation of the ESP32 ↔ God-Kaiser Server contract. All MQTT topics, payloads, and integration patterns are documented with working examples. Server developers can use these tests as blueprints for server-side integration tests.

**Key Takeaways:**

✅ 140+ tests across 21 test files  
✅ Complete MQTT topic reference  
✅ Full JSON payload specifications  
✅ Server validation requirements  
✅ Python integration templates  
✅ Emergency handling patterns  
✅ Cross-device automation examples  

**Last Updated:** November 18, 2025  
**Test Suite Version:** 2.2  
**Status:** Production-Ready ✅
