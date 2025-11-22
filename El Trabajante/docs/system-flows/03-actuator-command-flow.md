# Actuator Command Flow

## Overview

Complete actuator command reception, validation, execution, and status reporting flow. This demonstrates how El Trabajante receives commands from God-Kaiser via MQTT, validates safety requirements, controls physical actuators, and reports results.

## Files Analyzed

- `src/main.cpp` (lines 357-363) - MQTT callback actuator routing
- `src/services/actuator/actuator_manager.cpp` (lines 1-778) - Actuator management
- `src/services/actuator/actuator_manager.h` (lines 1-101) - Actuator manager interface
- `src/services/actuator/safety_controller.cpp` - Safety interlocks
- `src/services/actuator/safety_controller.h` (lines 1-51) - Safety controller interface
- `src/models/actuator_types.h` (lines 1-138) - Actuator data structures
- `src/services/actuator/actuator_drivers/` - Actuator driver implementations
- `src/utils/topic_builder.cpp` - Topic generation

## Prerequisites

- Actuator Manager initialized (boot sequence Phase 5)
- At least one actuator configured
- MQTT client connected
- Safety Controller operational

## Trigger

MQTT message received on actuator command topic with wildcard subscription.

---

## MQTT Topics

### Command Topic (Subscribed)

**Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/+/command`

**Wildcard:** `+` matches any GPIO number

**Example:** `kaiser/god/esp/ESP_AB12CD/actuator/5/command`

### Response Topics (Published)

| Topic Pattern | Purpose |
|---------------|---------|
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response` | Command acknowledgment |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` | Current actuator state |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert` | Safety alerts |

---

## Command Payload Format

```json
{
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "timestamp": 1234567890,
  "command_id": "cmd_abc123"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | String | Yes | Command type: ON, OFF, PWM, TOGGLE |
| `value` | Number | No | For PWM: 0.0-1.0, For binary: 0.0 or 1.0 |
| `duration` | Number | No | Duration in seconds (0 = indefinite) |
| `timestamp` | Number | No | Unix timestamp |
| `command_id` | String | No | Unique command identifier |

---

## Flow Steps

### STEP 1: MQTT Message Reception

**File:** `src/main.cpp` (lines 357-363)

**Code:**

```cpp
// Actuator commands
String actuator_command_prefix = String(TopicBuilder::buildActuatorCommandTopic(0));
actuator_command_prefix.replace("/0/command", "/");
if (topic.startsWith(actuator_command_prefix)) {
  actuatorManager.handleActuatorCommand(topic, payload);
  return;
}
```

**Topic Matching:**
1. Build prefix: `kaiser/{kaiser_id}/esp/{esp_id}/actuator/`
2. Check if incoming topic starts with prefix
3. If match → Route to ActuatorManager

**Example Match:**
- Subscription: `kaiser/god/esp/ESP_AB12CD/actuator/+/command`
- Incoming: `kaiser/god/esp/ESP_AB12CD/actuator/5/command`
- Result: ✅ Match → Handle command

---

### STEP 2: Extract GPIO from Topic

**File:** `src/services/actuator/actuator_manager.cpp` (lines 485-490)

**Code:**

```cpp
bool ActuatorManager::handleActuatorCommand(const String& topic, const String& payload) {
  uint8_t gpio = extractGPIOFromTopic(topic);
  if (gpio == 255) {
    LOG_ERROR("Invalid actuator command topic: " + topic);
    return false;
  }
  // ...
}
```

**GPIO Extraction Logic:**

```cpp
uint8_t ActuatorManager::extractGPIOFromTopic(const String& topic) const {
  // Find "/actuator/" and extract number after it
  int actuator_pos = topic.indexOf("/actuator/");
  if (actuator_pos == -1) {
    return 255;
  }
  
  int gpio_start = actuator_pos + 10;  // Length of "/actuator/"
  int gpio_end = topic.indexOf('/', gpio_start);
  if (gpio_end == -1) {
    gpio_end = topic.length();
  }
  
  String gpio_str = topic.substring(gpio_start, gpio_end);
  return (uint8_t)gpio_str.toInt();
}
```

**Example:**
- Topic: `kaiser/god/esp/ESP_AB12CD/actuator/5/command`
- Extracted GPIO: `5`

---

### STEP 3: Parse Command Payload

**File:** `src/services/actuator/actuator_manager.cpp` (lines 492-497)

**Code:**

```cpp
ActuatorCommand command;
command.gpio = gpio;
command.command = extractJSONString(payload, "command");
command.value = extractJSONFloat(payload, "value", 0.0f);
command.duration_s = extractJSONUInt32(payload, "duration", 0);
command.timestamp = millis();
```

**JSON Parsing:**

Uses lightweight string parsing (not ArduinoJson) for performance:

```cpp
String extractJSONString(const String& json, const String& key) {
  String pattern = "\"" + key + "\":";
  int key_pos = json.indexOf(pattern);
  if (key_pos == -1) {
    return "";
  }
  // ... extract value between quotes or until comma/}
  return value;
}
```

**Parsed Command Structure:**

```cpp
struct ActuatorCommand {
  uint8_t gpio = 255;
  String command = "";        // "ON","OFF","PWM","TOGGLE","STOP"
  float value = 0.0f;         // 0.0 - 1.0 (PWM) or binary (>=0.5)
  uint32_t duration_s = 0;    // Optional hold duration
  unsigned long timestamp = 0;
};
```

---

### STEP 4: Command Routing

**File:** `src/services/actuator/actuator_manager.cpp` (lines 499-513)

**Code:**

```cpp
bool success = false;
if (command.command.equalsIgnoreCase("ON")) {
  success = controlActuatorBinary(gpio, true);
} else if (command.command.equalsIgnoreCase("OFF")) {
  success = controlActuatorBinary(gpio, false);
} else if (command.command.equalsIgnoreCase("PWM")) {
  success = controlActuator(gpio, command.value);
} else if (command.command.equalsIgnoreCase("TOGGLE")) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (actuator) {
    success = controlActuatorBinary(gpio, !actuator->config.current_state);
  }
} else {
  LOG_ERROR("Unknown actuator command: " + command.command);
}
```

### Supported Commands

| Command | Description | Value Range | Actuator Types |
|---------|-------------|-------------|----------------|
| `ON` | Turn on | Ignored | Pump, Valve, Relay |
| `OFF` | Turn off | Ignored | Pump, Valve, Relay |
| `PWM` | Set PWM | 0.0 - 1.0 | PWM |
| `TOGGLE` | Toggle state | Ignored | Pump, Valve, Relay |

---

### STEP 5a: Binary Control (ON/OFF)

**File:** `src/services/actuator/actuator_manager.cpp`

**Code:**

```cpp
bool ActuatorManager::controlActuatorBinary(uint8_t gpio, bool state) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    LOG_ERROR("Actuator not found on GPIO " + String(gpio));
    return false;
  }
  
  // Check emergency stop
  if (actuator->emergency_stopped) {
    LOG_WARNING("Actuator GPIO " + String(gpio) + " is emergency stopped");
    publishActuatorAlert(gpio, "emergency_stop", "Actuator under emergency stop");
    return false;
  }
  
  // Execute via driver
  bool result = actuator->driver->setState(state);
  
  if (result) {
    // Update state
    actuator->config.current_state = state;
    actuator->config.last_command_ts = millis();
    
    LOG_INFO("Actuator GPIO " + String(gpio) + " set to " + (state ? "ON" : "OFF"));
  } else {
    LOG_ERROR("Failed to control actuator GPIO " + String(gpio));
    errorTracker.trackError(ERROR_ACTUATOR_CONTROL_FAILED, 
                           ERROR_SEVERITY_ERROR,
                           "Actuator control failed");
  }
  
  return result;
}
```

**Safety Checks:**
1. Actuator exists and has driver
2. Not in emergency stop state
3. Driver executes command

**State Update:**
- `current_state` = requested state
- `last_command_ts` = current time
- `accumulated_runtime_ms` += duration (when turning off)

---

### STEP 5b: PWM Control

**File:** `src/services/actuator/actuator_manager.cpp`

**Code:**

```cpp
bool ActuatorManager::controlActuator(uint8_t gpio, float value) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    LOG_ERROR("Actuator not found on GPIO " + String(gpio));
    return false;
  }
  
  // Validate value range
  if (value < 0.0f || value > 1.0f) {
    LOG_ERROR("Invalid actuator value: " + String(value));
    return false;
  }
  
  // Check emergency stop
  if (actuator->emergency_stopped) {
    LOG_WARNING("Actuator GPIO " + String(gpio) + " is emergency stopped");
    return false;
  }
  
  // Convert to PWM duty cycle (0-255)
  uint8_t pwm_value = (uint8_t)(value * 255.0f);
  
  // Execute via driver
  bool result = actuator->driver->setPWM(pwm_value);
  
  if (result) {
    // Update state
    actuator->config.current_pwm = pwm_value;
    actuator->config.current_state = (pwm_value > 0);
    actuator->config.last_command_ts = millis();
    
    LOG_INFO("Actuator GPIO " + String(gpio) + " PWM set to " + String(pwm_value));
  }
  
  return result;
}
```

**PWM Conversion:**
- Input: 0.0 - 1.0 (float)
- Output: 0 - 255 (uint8_t)
- Formula: `pwm_duty = value × 255`

**Examples:**
- 0.0 → 0 (0% duty)
- 0.5 → 127 (50% duty)
- 1.0 → 255 (100% duty)

---

### STEP 6: Driver Execution

**Actuator Driver Interface:**

```cpp
class IActuatorDriver {
public:
  virtual bool begin(const ActuatorConfig& config) = 0;
  virtual void end() = 0;
  
  virtual bool setState(bool state) = 0;
  virtual bool setPWM(uint8_t value) = 0;
  virtual bool getState() const = 0;
  virtual uint8_t getPWM() const = 0;
  
  virtual void loop() = 0;
  virtual ~IActuatorDriver() = default;
};
```

### Driver Implementations

#### Pump Actuator (Binary)

**File:** `src/services/actuator/actuator_drivers/pump_actuator.cpp`

```cpp
bool PumpActuator::setState(bool state) {
  if (!initialized_) {
    return false;
  }
  
  // Write to GPIO
  digitalWrite(gpio_, state ? HIGH : LOW);
  current_state_ = state;
  
  // Track runtime
  if (state) {
    last_on_time_ = millis();
  } else {
    if (last_on_time_ > 0) {
      runtime_ms_ += millis() - last_on_time_;
    }
  }
  
  return true;
}
```

**Hardware:** Simple GPIO HIGH/LOW control

---

#### Valve Actuator (Binary with 2 GPIOs)

**File:** `src/services/actuator/actuator_drivers/valve_actuator.cpp`

```cpp
bool ValveActuator::setState(bool state) {
  if (!initialized_) {
    return false;
  }
  
  if (state) {
    // Open valve: Pulse open pin
    digitalWrite(open_gpio_, HIGH);
    delay(pulse_duration_ms_);
    digitalWrite(open_gpio_, LOW);
  } else {
    // Close valve: Pulse close pin
    digitalWrite(close_gpio_, HIGH);
    delay(pulse_duration_ms_);
    digitalWrite(close_gpio_, LOW);
  }
  
  current_state_ = state;
  return true;
}
```

**Hardware:** Dual GPIO for open/close control (latching valve)

---

#### PWM Actuator (Variable Speed)

**File:** `src/services/actuator/actuator_drivers/pwm_actuator.cpp`

```cpp
bool PWMActuator::setPWM(uint8_t value) {
  if (!initialized_ || pwm_channel_ == 255) {
    return false;
  }
  
  // Use ESP32 LEDC peripheral
  ledcWrite(pwm_channel_, value);
  
  current_pwm_ = value;
  current_state_ = (value > 0);
  
  return true;
}
```

**Hardware:** ESP32 LEDC PWM peripheral (16 channels, 8-bit resolution)

---

### STEP 7: Publish Response

**File:** `src/services/actuator/actuator_manager.cpp` (lines 515-520)

**Code:**

```cpp
publishActuatorResponse(command,
                        success,
                        success ? "Command executed" : "Command failed");
if (success) {
  publishActuatorStatus(gpio);
}
```

**Response Payload Builder:**

```cpp
String ActuatorManager::buildResponsePayload(const ActuatorCommand& command, 
                                             bool success, 
                                             const String& message) const {
  String payload;
  payload.reserve(256);
  
  payload = "{";
  payload += "\"esp_id\":\"" + configManager.getESPId() + "\",";
  payload += "\"gpio\":" + String(command.gpio) + ",";
  payload += "\"command\":\"" + command.command + "\",";
  payload += "\"value\":" + String(command.value) + ",";
  payload += "\"success\":" + String(success ? "true" : "false") + ",";
  payload += "\"message\":\"" + message + "\",";
  payload += "\"timestamp\":" + String(millis());
  payload += "}";
  
  return payload;
}
```

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response`

**Response Payload:**

```json
{
  "esp_id": "ESP_AB12CD",
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "success": true,
  "message": "Command executed",
  "timestamp": 1234567890
}
```

**QoS:** 1 (at least once)

---

### STEP 8: Publish Status

**File:** `src/services/actuator/actuator_manager.cpp`

**Code:**

```cpp
void ActuatorManager::publishActuatorStatus(uint8_t gpio) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    return;
  }
  
  // Build status
  ActuatorStatus status;
  status.gpio = gpio;
  status.actuator_type = actuator->config.actuator_type;
  status.current_state = actuator->config.current_state;
  status.current_pwm = actuator->config.current_pwm;
  status.runtime_ms = actuator->config.accumulated_runtime_ms;
  status.emergency_state = actuator->emergency_stopped ? 
                          EmergencyState::EMERGENCY_ACTIVE : 
                          EmergencyState::EMERGENCY_NORMAL;
  
  // Build payload
  String payload = buildStatusPayload(status, actuator->config);
  
  // Publish
  const char* topic = TopicBuilder::buildActuatorStatusTopic(gpio);
  mqttClient.publish(topic, payload, 1);
}
```

**Status Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

**Status Payload:**

```json
{
  "esp_id": "ESP_AB12CD",
  "gpio": 5,
  "actuator_type": "pump",
  "current_state": true,
  "current_pwm": 0,
  "runtime_ms": 123456,
  "emergency_state": "normal",
  "timestamp": 1234567890
}
```

**Publish Frequency:**
- After every command execution
- Periodic (every 30 seconds via main loop)
- On state change

---

## Safety Mechanisms

### Emergency Stop Check

**Every command** checks emergency stop status:

```cpp
if (actuator->emergency_stopped) {
  LOG_WARNING("Actuator GPIO " + String(gpio) + " is emergency stopped");
  publishActuatorAlert(gpio, "emergency_stop", "Actuator under emergency stop");
  return false;
}
```

**Emergency Stop Sources:**
1. ESP-specific emergency: `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency`
2. Broadcast emergency: `kaiser/broadcast/emergency`
3. SafetyController manual trigger

---

### GPIO Conflict Detection

**Before configuration:**

```cpp
if (!gpio_manager_->isPinAvailable(config.gpio)) {
  LOG_ERROR("ActuatorManager: GPIO " + String(config.gpio) + " not available");
  return false;
}
```

**Prevents:**
- Multiple actuators on same GPIO
- Actuator on sensor GPIO
- Actuator on reserved GPIO (UART, Boot, etc.)

---

### Runtime Protection

**Pump/Valve Runtime Limits:**

```cpp
if (actuator->config.accumulated_runtime_ms > MAX_RUNTIME_MS) {
  LOG_WARNING("Actuator runtime limit reached");
  publishActuatorAlert(gpio, "runtime_protection", "Max runtime exceeded");
  emergencyStopActuator(gpio);
}
```

**Configurable Limits:**
- Max continuous runtime
- Max daily runtime
- Cooldown period

---

## Error Handling

### Command Failures

**Causes:**
- Actuator not configured
- GPIO not available
- Driver initialization failed
- Emergency stop active
- Invalid command/value

**Behavior:**
1. Log error
2. Track via ErrorTracker
3. Publish error response
4. **Do not crash** - continue operation

**Error Response Example:**

```json
{
  "esp_id": "ESP_AB12CD",
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "success": false,
  "message": "Actuator not found",
  "timestamp": 1234567890
}
```

---

### Driver Failures

**Hardware Issues:**
- GPIO write failure (rare)
- PWM channel not available
- Valve pulse timeout

**Recovery:**
1. Retry once (immediate)
2. If still failing → Mark actuator error state
3. Publish alert
4. Continue with other actuators

---

### MQTT Publish Failures

**Behavior:**
- Log warning
- Track error
- **Command still executed** locally
- Retry on next status publish cycle

**Offline Buffer:** Response/status messages buffered if broker unavailable

---

## Performance Metrics

### Command Processing Time

| Operation | Duration |
|-----------|----------|
| Topic parsing | <1ms |
| JSON parsing | 1-5ms |
| Safety checks | <1ms |
| GPIO write | <1µs |
| PWM write | ~10µs |
| Response publish | 10-20ms |
| Status publish | 10-20ms |

**Total:** 20-50ms per command

---

### Throughput

**Tested:** 100 commands/second per actuator

**Practical:** 10-20 commands/second typical

**Limit:** MQTT QoS 1 + network latency

---

## Memory Usage

### Per Command

| Allocation | Size |
|------------|------|
| ActuatorCommand struct | ~48 bytes |
| JSON parsing buffers | ~256 bytes |
| Response payload | ~256 bytes |
| Status payload | ~384 bytes |

**Total:** ~950 bytes per command (stack, temporary)

---

### Per Actuator

| Allocation | Size |
|------------|------|
| ActuatorConfig | ~128 bytes |
| Driver instance | ~64 bytes |
| RegisteredActuator | ~200 bytes |

**Total:** ~400 bytes per actuator

**Max Actuators:**
- ESP32 WROOM: 12 actuators
- XIAO ESP32C3: 8 actuators

**Total Memory:** ~4.8KB (12 actuators)

---

## Integration with God-Kaiser

### Command Flow (God-Kaiser → ESP)

```
User/Automation → God-Kaiser → MQTT Broker → ESP32 → Actuator
```

### Status Flow (ESP → God-Kaiser)

```
Actuator → ESP32 → MQTT Broker → God-Kaiser → Database/UI
```

### Automation Example

**Scenario:** Turn on irrigation pump based on soil moisture

1. ESP publishes soil moisture sensor reading
2. God-Kaiser receives sensor data
3. God-Kaiser automation rule triggered (moisture < 30%)
4. God-Kaiser publishes pump ON command
5. ESP receives command
6. ESP validates and executes
7. ESP publishes response + status
8. God-Kaiser confirms pump is running

---

## Debugging

### Enable Debug Logging

```cpp
logger.setLogLevel(LOG_DEBUG);
```

**Output:** Full command details, driver operations

### Serial Monitor Example

```
[INFO] MQTT message received: kaiser/god/esp/ESP_AB12CD/actuator/5/command
[DEBUG] Payload: {"command":"ON","value":1.0}
[DEBUG] Extracted GPIO: 5
[DEBUG] Command: ON
[DEBUG] Actuator found: Pump (GPIO 5)
[DEBUG] Emergency stop: inactive
[DEBUG] Executing: digitalWrite(5, HIGH)
[INFO] Actuator GPIO 5 set to ON
[INFO] Published response: kaiser/god/esp/ESP_AB12CD/actuator/5/response
[INFO] Published status: kaiser/god/esp/ESP_AB12CD/actuator/5/status
```

### MQTT Monitoring

**Subscribe to all actuator topics:**

```bash
mosquitto_sub -h 192.168.0.198 -p 8883 -t "kaiser/+/esp/+/actuator/#" -v
```

---

## Common Issues

### Command Not Executed

**Symptoms:** Response shows `success: false`

**Diagnosis:**
1. Check emergency stop status
2. Verify actuator configured
3. Check GPIO availability
4. Enable debug logging

**Solutions:**
- Clear emergency stop
- Configure actuator via MQTT
- Verify GPIO wiring

---

### Actuator Not Responding

**Symptoms:** Command succeeds but actuator doesn't activate

**Diagnosis:**
1. Check physical wiring
2. Check GPIO pin number
3. Check inverted logic setting
4. Test with multimeter

**Solutions:**
- Verify connections
- Check power supply
- Reconfigure with correct GPIO/invert

---

### Slow Command Response

**Symptoms:** Delays between command and execution

**Diagnosis:**
1. Check network latency
2. Check MQTT QoS settings
3. Check WiFi signal strength

**Solutions:**
- Move closer to access point
- Reduce QoS to 0 (testing only)
- Check broker load

---

## Next Flows

From actuator commands:

→ [Runtime Actuator Config Flow](05-runtime-actuator-config-flow.md) - For adding/modifying actuators  
→ [Error Recovery Flow](07-error-recovery-flow.md) - For emergency stop handling  
→ [MQTT Message Routing](06-mqtt-message-routing-flow.md) - For message dispatch  

---

## Related Documentation

- [Boot Sequence](01-boot-sequence.md) - Actuator Manager initialization
- `docs/API_REFERENCE.md` - ActuatorManager API
- `src/models/actuator_types.h` - Actuator data structures
- `src/services/actuator/safety_controller.h` - Safety system

---

**End of Actuator Command Flow Documentation**

