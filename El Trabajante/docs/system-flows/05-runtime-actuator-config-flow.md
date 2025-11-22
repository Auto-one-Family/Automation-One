# Runtime Actuator Configuration Flow

## Overview

Dynamic actuator configuration via MQTT allows God-Kaiser to add, modify, or remove actuators without reflashing firmware. Similar to sensor configuration but with additional safety validations and emergency stop integration.

## Files Analyzed

- `src/main.cpp` (line 830) - handleActuatorConfig()
- `src/services/actuator/actuator_manager.cpp` - handleActuatorConfig(), configureActuator()
- `src/services/config/config_manager.cpp` - saveActuatorConfig(), removeActuatorConfig()
- `src/models/actuator_types.h` - Actuator data structures
- `src/services/actuator/safety_controller.h` - Safety system
- `src/services/config/config_response.cpp` - Response publishing

## Prerequisites

- MQTT client connected
- Actuator Manager initialized
- Safety Controller operational
- Config Manager operational
- NVS accessible

## Trigger

MQTT message on: `kaiser/{kaiser_id}/esp/{esp_id}/config`

---

## Configuration Payload Format

```json
{
  "sensors": [],
  "actuators": [
    {
      "gpio": 5,
      "actuator_type": "pump",
      "actuator_name": "Water Pump 1",
      "subzone_id": "irrigation",
      "active": true,
      "critical": false,
      "inverted_logic": false,
      "default_state": false
    },
    {
      "gpio": 18,
      "actuator_type": "pwm",
      "actuator_name": "Exhaust Fan",
      "subzone_id": "ventilation",
      "active": true,
      "default_pwm": 128
    }
  ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `gpio` | Number | Primary GPIO pin (0-39) |
| `actuator_type` | String | "pump", "valve", "pwm", "relay" |
| `actuator_name` | String | Human-readable name |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `aux_gpio` | Number | 255 | Secondary GPIO (valves) |
| `subzone_id` | String | "" | Subzone identifier |
| `active` | Boolean | true | Enable/disable |
| `critical` | Boolean | false | Critical actuator flag |
| `inverted_logic` | Boolean | false | LOW=ON for relays |
| `default_state` | Boolean | false | Failsafe state |
| `default_pwm` | Number | 0 | Default PWM (0-255) |

---

## Flow Steps

### STEP 1: MQTT Callback

**File:** `src/main.cpp` (line 830)

```cpp
void handleActuatorConfig(const String& payload) {
  LOG_INFO("Handling actuator configuration from MQTT");
  actuatorManager.handleActuatorConfig(payload);
}
```

---

### STEP 2: Parse and Configure

**File:** `src/services/actuator/actuator_manager.cpp`

```cpp
bool ActuatorManager::handleActuatorConfig(const String& payload) {
  LOG_INFO("Processing actuator configuration");

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    String message = "Failed to parse actuator config JSON: " + String(error.c_str());
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(ConfigType::ACTUATOR, 
                                       ConfigErrorCode::JSON_PARSE_ERROR, 
                                       message);
    return false;
  }

  JsonArray actuators = doc["actuators"].as<JsonArray>();
  if (actuators.isNull() || actuators.size() == 0) {
    LOG_INFO("No actuators in config");
    return true;
  }

  uint8_t success_count = 0;
  uint8_t total = actuators.size();

  for (JsonObject actuator_obj : actuators) {
    ActuatorConfig config;
    String error_message;
    ConfigErrorCode error_code;

    if (parseActuatorDefinition(actuator_obj, config, error_message, error_code)) {
      if (configureActuator(config)) {
        success_count++;
      } else {
        ConfigResponseBuilder::publishError(ConfigType::ACTUATOR, 
                                           ConfigErrorCode::UNKNOWN_ERROR,
                                           "Failed to configure actuator GPIO " + String(config.gpio),
                                           actuator_obj);
      }
    } else {
      ConfigResponseBuilder::publishError(ConfigType::ACTUATOR, 
                                         error_code, 
                                         error_message, 
                                         actuator_obj);
    }
  }

  if (success_count == total) {
    String message = "Configured " + String(success_count) + " actuator(s) successfully";
    ConfigResponseBuilder::publishSuccess(ConfigType::ACTUATOR, success_count, message);
  }

  return success_count > 0;
}
```

---

### STEP 3: Configure Actuator

**File:** `src/services/actuator/actuator_manager.cpp`

```cpp
bool ActuatorManager::configureActuator(const ActuatorConfig& incoming_config) {
  if (!initialized_ && !begin()) {
    return false;
  }

  ActuatorConfig config = incoming_config;
  if (!validateActuatorConfig(config)) {
    return false;
  }

  // Phase 7: Handle deactivation/removal
  if (!config.active) {
    LOG_INFO("Actuator config deactivating GPIO " + String(config.gpio));
    removeActuator(config.gpio);
    return true;
  }

  // Check for existing actuator (reconfiguration)
  RegisteredActuator* existing = findActuator(config.gpio);
  if (existing) {
    LOG_INFO("Actuator Manager: Updating existing actuator on GPIO " + String(config.gpio));
    
    // Stop actuator before reconfiguration
    if (existing->driver) {
      existing->driver->setState(false);
      existing->driver->end();
    }
    
    // Create new driver
    auto driver = createDriver(config.actuator_type);
    if (!driver) {
      LOG_ERROR("Failed to create driver for " + config.actuator_type);
      return false;
    }
    
    // Initialize driver
    if (!driver->begin(config)) {
      LOG_ERROR("Driver initialization failed for GPIO " + String(config.gpio));
      return false;
    }
    
    // Update config and driver
    existing->config = config;
    existing->driver = std::move(driver);
    
    // Persist to NVS
    configManager.saveActuatorConfig(config);
    
    LOG_INFO("Actuator updated: GPIO " + String(config.gpio));
    return true;
  }

  // New actuator: Check capacity
  RegisteredActuator* slot = getFreeSlot();
  if (!slot) {
    LOG_ERROR("Actuator Manager: Maximum actuator count reached");
    return false;
  }

  // GPIO conflict check
  if (!gpio_manager_->isPinAvailable(config.gpio)) {
    LOG_ERROR("Actuator Manager: GPIO " + String(config.gpio) + " not available");
    return false;
  }

  // Reserve GPIO
  if (!gpio_manager_->requestPin(config.gpio, "actuator", config.actuator_name.c_str())) {
    LOG_ERROR("Actuator Manager: Failed to reserve GPIO " + String(config.gpio));
    return false;
  }

  // Create and initialize driver
  auto driver = createDriver(config.actuator_type);
  if (!driver || !driver->begin(config)) {
    gpio_manager_->releasePin(config.gpio);
    return false;
  }

  // Register actuator
  slot->in_use = true;
  slot->gpio = config.gpio;
  slot->config = config;
  slot->driver = std::move(driver);
  slot->emergency_stopped = false;
  actuator_count_++;

  // Persist to NVS
  configManager.saveActuatorConfig(config);

  LOG_INFO("Actuator configured: GPIO " + String(config.gpio) + " (" + config.actuator_type + ")");
  return true;
}
```

**Key Operations:**
1. Validate configuration
2. Handle deactivation (removal)
3. Check for existing actuator (reconfiguration)
4. Check GPIO availability
5. Create actuator driver
6. Initialize driver with config
7. Reserve GPIO
8. Register in array
9. Persist to NVS

---

## NVS Persistence

**Namespace:** `actuator_config`

**Keys:**
- `actuator_count` (uint8_t)
- `actuator_{i}_gpio` (uint8_t)
- `actuator_{i}_aux_gpio` (uint8_t)
- `actuator_{i}_type` (String)
- `actuator_{i}_name` (String)
- `actuator_{i}_subzone` (String)
- `actuator_{i}_active` (bool)
- `actuator_{i}_critical` (bool)
- `actuator_{i}_inverted` (bool)
- `actuator_{i}_default_state` (bool)
- `actuator_{i}_default_pwm` (uint8_t)

---

## Safety Considerations

### Emergency Stop Integration

Newly configured actuators:
- Start in safe state (OFF)
- Inherit current emergency stop status
- Cannot be activated if emergency stop active

### GPIO Conflicts

Additional checks vs sensors:
- Verify GPIO not used by sensor
- Verify GPIO not used by another actuator
- Verify GPIO not reserved (Boot, UART, etc.)

### Critical Actuators

```cpp
config.critical = true;  // Priority in recovery
```

Critical actuators:
- Restored first after emergency stop
- Higher priority in power management
- Extra logging/monitoring

---

## Driver Types

### Pump Driver (Binary)

```cpp
std::unique_ptr<IActuatorDriver> ActuatorManager::createDriver(const String& actuator_type) const {
  if (actuator_type == ActuatorTypeTokens::PUMP) {
    return std::unique_ptr<IActuatorDriver>(new PumpActuator());
  }
  // ...
}
```

**Supports:** ON/OFF, runtime tracking

### Valve Driver (Dual GPIO)

**Supports:** Open/Close with pulse control, latching valves

### PWM Driver (Variable)

**Supports:** 0-255 duty cycle, smooth transitions

### Relay Driver (Binary)

**Supports:** Inverted logic, bounce protection

---

## Response Messages

**Success:**

```json
{
  "type": "actuator",
  "success": true,
  "count": 2,
  "message": "Configured 2 actuator(s) successfully",
  "timestamp": 1234567890
}
```

**Error:**

```json
{
  "type": "actuator",
  "success": false,
  "error_code": 1,
  "message": "Actuator config missing required field 'gpio'",
  "failed_config": { "actuator_type": "pump", "actuator_name": "Pump1" },
  "timestamp": 1234567890
}
```

---

## Timing & Memory

**Timing:** 100-300ms per actuator (driver init overhead)

**Memory:**
- JSON buffer: 4096 bytes
- ActuatorConfig: ~128 bytes
- Driver instance: ~64 bytes

---

## Error Handling

### Configuration Errors

- Missing fields → Publish error, continue with next
- Invalid GPIO → Publish error, continue
- Driver init failure → Publish error, release GPIO

### Runtime Errors

- NVS write failure → Actuator configured but not persisted
- GPIO conflict → Publish error, skip actuator

---

## Integration with God-Kaiser

**Workflow:**
1. User adds actuator in UI
2. God-Kaiser validates config
3. Publishes to ESP
4. ESP configures and responds
5. God-Kaiser confirms in UI
6. Actuator ready for commands

---

## Next Flows

→ [Actuator Command Flow](03-actuator-command-flow.md) - Control configured actuators  
→ [Error Recovery Flow](07-error-recovery-flow.md) - Emergency stop handling  

---

**End of Runtime Actuator Configuration Flow Documentation**

