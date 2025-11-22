# Runtime Sensor Configuration Flow

## Overview

Dynamic sensor configuration via MQTT allows God-Kaiser to add, modify, or remove sensors without reflashing the ESP32 firmware. This enables flexible sensor deployment and runtime reconfiguration for changing greenhouse/farm layouts.

## Files Analyzed

- `src/main.cpp` (lines 674-826) - handleSensorConfig() and parseAndConfigureSensor()
- `src/services/sensor/sensor_manager.cpp` (lines 114-240) - configureSensor() and removeSensor()
- `src/services/sensor/sensor_manager.h` - Sensor manager interface
- `src/services/config/config_manager.cpp` - saveSensorConfig() and removeSensorConfig()
- `src/services/config/storage_manager.cpp` - NVS operations
- `src/services/config/config_response.cpp` - Response publishing
- `src/models/sensor_types.h` - Sensor data structures

## Prerequisites

- MQTT client connected
- Sensor Manager initialized
- Config Manager operational
- NVS accessible

## Trigger

MQTT message received on configuration topic: `kaiser/{kaiser_id}/esp/{esp_id}/config`

---

## MQTT Topics

**Input Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

---

## Configuration Payload Format

```json
{
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "temp_ds18b20",
      "sensor_name": "Greenhouse Temperature",
      "subzone_id": "section_A",
      "active": true,
      "raw_mode": true
    },
    {
      "gpio": 34,
      "sensor_type": "ph_sensor",
      "sensor_name": "Water pH",
      "subzone_id": "irrigation",
      "active": true,
      "raw_mode": true
    }
  ],
  "actuators": []
}
```

**Note:** Same topic handles both sensors and actuators. This flow focuses on sensors only.

---

## Flow Steps

### STEP 1: MQTT Callback Routing

**File:** `src/main.cpp` (lines 349-355)

**Code:**

```cpp
// Handle sensor configuration
String config_topic = String(TopicBuilder::buildConfigTopic());
if (topic == config_topic) {
  handleSensorConfig(payload);
  handleActuatorConfig(payload);
  return;
}
```

**Routing:** Both handlers called - each processes relevant array

---

### STEP 2: Parse Configuration JSON

**File:** `src/main.cpp` (lines 674-715)

**Code:**

```cpp
void handleSensorConfig(const String& payload) {
  LOG_INFO("Handling sensor configuration from MQTT");

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    String message = "Failed to parse sensor config JSON: " + String(error.c_str());
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::JSON_PARSE_ERROR, message);
    return;
  }

  JsonArray sensors = doc["sensors"].as<JsonArray>();
  if (sensors.isNull()) {
    String message = "Sensor config missing 'sensors' array";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message);
    return;
  }

  size_t total = sensors.size();
  if (total == 0) {
    String message = "Sensor config array is empty";
    LOG_WARNING(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message);
    return;
  }

  uint8_t success_count = 0;
  for (JsonObject sensorObj : sensors) {
    if (parseAndConfigureSensor(sensorObj)) {
      success_count++;
    }
  }

  if (success_count == total) {
    String message = "Configured " + String(success_count) + " sensor(s) successfully";
    ConfigResponseBuilder::publishSuccess(ConfigType::SENSOR, success_count, message);
  }
}
```

**JSON Buffer:** 4096 bytes (supports up to ~10 sensors per message)

**Error Handling:**
- JSON parse error → Publish error response, abort
- Missing 'sensors' array → Publish error, abort
- Empty array → Warning, abort
- Individual sensor errors → Continue with next sensor

---

### STEP 3: Parse Individual Sensor

**File:** `src/main.cpp` (lines 718-825)

**Code:**

```cpp
bool parseAndConfigureSensor(const JsonObjectConst& sensor_obj) {
  SensorConfig config;
  JsonVariantConst failed_variant = sensor_obj;

  // Validate 'gpio' field (required)
  if (!sensor_obj.containsKey("gpio")) {
    String message = "Sensor config missing required field 'gpio'";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message, failed_variant);
    return false;
  }

  int gpio_value = 255;
  if (!JsonHelpers::extractInt(sensor_obj, "gpio", gpio_value)) {
    String message = "Sensor field 'gpio' must be an integer";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::TYPE_MISMATCH, message, failed_variant);
    return false;
  }
  config.gpio = static_cast<uint8_t>(gpio_value);

  // Validate 'sensor_type' field (required)
  if (!sensor_obj.containsKey("sensor_type")) {
    String message = "Sensor config missing required field 'sensor_type'";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message, failed_variant);
    return false;
  }
  if (!JsonHelpers::extractString(sensor_obj, "sensor_type", config.sensor_type)) {
    String message = "Sensor field 'sensor_type' must be a string";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::TYPE_MISMATCH, message, failed_variant);
    return false;
  }

  // Validate 'sensor_name' field (required)
  if (!sensor_obj.containsKey("sensor_name")) {
    String message = "Sensor config missing required field 'sensor_name'";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message, failed_variant);
    return false;
  }
  if (!JsonHelpers::extractString(sensor_obj, "sensor_name", config.sensor_name)) {
    String message = "Sensor field 'sensor_name' must be a string";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::TYPE_MISMATCH, message, failed_variant);
    return false;
  }

  // Optional fields
  JsonHelpers::extractString(sensor_obj, "subzone_id", config.subzone_id, "");

  bool bool_value = true;
  if (JsonHelpers::extractBool(sensor_obj, "active", bool_value, true)) {
    config.active = bool_value;
  } else {
    config.active = true;
  }

  if (JsonHelpers::extractBool(sensor_obj, "raw_mode", bool_value, true)) {
    config.raw_mode = bool_value;
  } else {
    config.raw_mode = true;
  }

  // Validate config
  if (!configManager.validateSensorConfig(config)) {
    String message = "Sensor validation failed for GPIO " + String(config.gpio);
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::VALIDATION_FAILED, message, failed_variant);
    return false;
  }

  // Handle deactivation (removal)
  if (!config.active) {
    if (!sensorManager.removeSensor(config.gpio)) {
      LOG_WARNING("Sensor removal requested, but no sensor on GPIO " + String(config.gpio));
    }
    if (!configManager.removeSensorConfig(config.gpio)) {
      String message = "Failed to remove sensor config from NVS for GPIO " + String(config.gpio);
      LOG_ERROR(message);
      ConfigResponseBuilder::publishError(
          ConfigType::SENSOR, ConfigErrorCode::NVS_WRITE_FAILED, message, failed_variant);
      return false;
    }
    LOG_INFO("Sensor removed: GPIO " + String(config.gpio));
    return true;
  }

  // Configure sensor
  if (!sensorManager.configureSensor(config)) {
    String message = "Failed to configure sensor on GPIO " + String(config.gpio);
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::UNKNOWN_ERROR, message, failed_variant);
    return false;
  }

  // Persist to NVS
  if (!configManager.saveSensorConfig(config)) {
    String message = "Failed to save sensor config to NVS for GPIO " + String(config.gpio);
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::NVS_WRITE_FAILED, message, failed_variant);
    return false;
  }

  LOG_INFO("Sensor configured: GPIO " + String(config.gpio) + " (" + config.sensor_type + ")");
  return true;
}
```

### Required Fields

| Field | Type | Validation |
|-------|------|------------|
| `gpio` | Number | 0-39, not reserved |
| `sensor_type` | String | Non-empty |
| `sensor_name` | String | Non-empty |

### Optional Fields

| Field | Type | Default |
|-------|------|---------|
| `subzone_id` | String | "" |
| `active` | Boolean | true |
| `raw_mode` | Boolean | true |

---

### STEP 4: Configure Sensor in Manager

**File:** `src/services/sensor/sensor_manager.cpp` (lines 114-197)

**Code:**

```cpp
bool SensorManager::configureSensor(const SensorConfig& config) {
    if (!initialized_) {
        LOG_ERROR("Sensor Manager not initialized");
        return false;
    }
    
    // Validate GPIO
    if (config.gpio == 255) {
        LOG_ERROR("Sensor Manager: Invalid GPIO (255)");
        errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "Invalid GPIO for sensor");
        return false;
    }
    
    // Phase 7: Check if sensor already exists (runtime reconfiguration support)
    SensorConfig* existing = findSensorConfig(config.gpio);
    if (existing) {
        // Runtime reconfiguration: Update existing sensor
        LOG_INFO("Sensor Manager: Updating existing sensor on GPIO " + String(config.gpio));
        
        // Check if sensor type changed
        bool type_changed = (existing->sensor_type != config.sensor_type);
        if (type_changed) {
            LOG_INFO("  Sensor type changed: " + existing->sensor_type + " → " + config.sensor_type);
        }
        
        // Update configuration
        *existing = config;
        existing->active = true;
        
        // Phase 7: Persist to NVS immediately
        if (!configManager.saveSensorConfig(config)) {
            LOG_ERROR("Sensor Manager: Failed to persist sensor config to NVS");
        } else {
            LOG_INFO("  ✅ Configuration persisted to NVS");
        }
        
        LOG_INFO("Sensor Manager: Updated sensor on GPIO " + String(config.gpio) + 
                 " (" + config.sensor_type + ")");
        return true;
    }
    
    // New sensor: Check if we have space
    if (sensor_count_ >= MAX_SENSORS) {
        LOG_ERROR("Sensor Manager: Maximum sensor count reached");
        errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "Maximum sensor count reached");
        return false;
    }
    
    // Check GPIO availability
    if (!gpio_manager_->isPinAvailable(config.gpio)) {
        LOG_ERROR("Sensor Manager: GPIO " + String(config.gpio) + " not available");
        errorTracker.trackError(ERROR_GPIO_CONFLICT, ERROR_SEVERITY_ERROR,
                               "GPIO conflict for sensor");
        return false;
    }
    
    // Reserve GPIO
    if (!gpio_manager_->requestPin(config.gpio, "sensor", config.sensor_name.c_str())) {
        LOG_ERROR("Sensor Manager: Failed to reserve GPIO " + String(config.gpio));
        errorTracker.trackError(ERROR_GPIO_RESERVED, ERROR_SEVERITY_ERROR,
                               "Failed to reserve GPIO");
        return false;
    }
    
    // Add sensor
    sensors_[sensor_count_] = config;
    sensors_[sensor_count_].active = true;
    sensor_count_++;
    
    // Phase 7: Persist to NVS immediately
    if (!configManager.saveSensorConfig(config)) {
        LOG_ERROR("Sensor Manager: Failed to persist sensor config to NVS");
    } else {
        LOG_INFO("  ✅ Configuration persisted to NVS");
    }
    
    LOG_INFO("Sensor Manager: Configured new sensor on GPIO " + String(config.gpio) + 
             " (" + config.sensor_type + ")");
    
    return true;
}
```

**Operations:**
1. Check for existing sensor (reconfiguration)
2. Check sensor array capacity (max 10)
3. Validate GPIO availability
4. Reserve GPIO pin
5. Add to sensor registry
6. Persist to NVS

---

### STEP 5: Persist to NVS

**File:** `src/services/config/config_manager.cpp`

**Code:**

```cpp
bool ConfigManager::saveSensorConfig(const SensorConfig& config) {
  if (!storageManager.beginNamespace("sensor_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open sensor_config namespace");
    return false;
  }
  
  // Find or create sensor index
  uint8_t sensor_count = storageManager.getUInt8("sensor_count", 0);
  int8_t index = findSensorIndex(config.gpio);
  
  if (index == -1) {
    // New sensor
    index = sensor_count;
    sensor_count++;
    storageManager.putUInt8("sensor_count", sensor_count);
  }
  
  // Save sensor data
  String prefix = "sensor_" + String(index) + "_";
  storageManager.putUInt8((prefix + "gpio").c_str(), config.gpio);
  storageManager.putString((prefix + "type").c_str(), config.sensor_type);
  storageManager.putString((prefix + "name").c_str(), config.sensor_name);
  storageManager.putString((prefix + "subzone").c_str(), config.subzone_id);
  storageManager.putBool((prefix + "active").c_str(), config.active);
  storageManager.putBool((prefix + "raw_mode").c_str(), config.raw_mode);
  
  storageManager.endNamespace();
  
  LOG_INFO("ConfigManager: Saved sensor config for GPIO " + String(config.gpio));
  return true;
}
```

### NVS Keys

**Namespace:** `sensor_config`

**Keys:**
- `sensor_count` (uint8_t) - Total sensor count
- `sensor_{i}_gpio` (uint8_t) - GPIO pin
- `sensor_{i}_type` (String) - Sensor type
- `sensor_{i}_name` (String) - Sensor name
- `sensor_{i}_subzone` (String) - Subzone ID
- `sensor_{i}_active` (bool) - Active flag
- `sensor_{i}_raw_mode` (bool) - Raw mode flag

**Example NVS Layout:**

```
Namespace: sensor_config
  sensor_count = 2
  sensor_0_gpio = 4
  sensor_0_type = "temp_ds18b20"
  sensor_0_name = "Greenhouse Temperature"
  sensor_0_subzone = "section_A"
  sensor_0_active = true
  sensor_0_raw_mode = true
  sensor_1_gpio = 34
  sensor_1_type = "ph_sensor"
  sensor_1_name = "Water pH"
  sensor_1_subzone = "irrigation"
  sensor_1_active = true
  sensor_1_raw_mode = true
```

---

### STEP 6: Remove Sensor

**File:** `src/services/sensor/sensor_manager.cpp` (lines 200-240)

**Code:**

```cpp
bool SensorManager::removeSensor(uint8_t gpio) {
    if (!initialized_) {
        LOG_ERROR("Sensor Manager not initialized");
        return false;
    }
    
    SensorConfig* config = findSensorConfig(gpio);
    if (!config) {
        LOG_WARNING("Sensor Manager: Sensor on GPIO " + String(gpio) + " not found");
        return false;
    }
    
    LOG_INFO("Sensor Manager: Removing sensor on GPIO " + String(gpio));
    
    // Release GPIO
    gpio_manager_->releasePin(gpio);
    LOG_INFO("  ✅ GPIO " + String(gpio) + " released");
    
    // Remove sensor (shift array)
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio == gpio) {
            // Shift remaining sensors
            for (uint8_t j = i; j < sensor_count_ - 1; j++) {
                sensors_[j] = sensors_[j + 1];
            }
            sensor_count_--;
            sensors_[sensor_count_].gpio = 255;
            sensors_[sensor_count_].active = false;
            break;
        }
    }
    
    // Phase 7: Persist removal to NVS immediately
    if (!configManager.removeSensorConfig(gpio)) {
        LOG_ERROR("Sensor Manager: Failed to remove sensor config from NVS");
    } else {
        LOG_INFO("  ✅ Configuration removed from NVS");
    }
    
    LOG_INFO("Sensor Manager: Removed sensor on GPIO " + String(gpio));
    return true;
}
```

**Operations:**
1. Find sensor in registry
2. Release GPIO pin
3. Shift array (remove gap)
4. Decrement sensor count
5. Remove from NVS

---

### STEP 7: Publish Response

**File:** `src/services/config/config_response.cpp`

**Success Response:**

```cpp
void ConfigResponseBuilder::publishSuccess(ConfigType type, 
                                          uint8_t count, 
                                          const String& message) {
  String payload = "{";
  payload += "\"type\":\"" + getConfigTypeString(type) + "\",";
  payload += "\"success\":true,";
  payload += "\"count\":" + String(count) + ",";
  payload += "\"message\":\"" + message + "\",";
  payload += "\"timestamp\":" + String(millis());
  payload += "}";
  
  const char* topic = TopicBuilder::buildConfigResponseTopic();
  mqttClient.publish(topic, payload, 1);
}
```

**Success Payload:**

```json
{
  "type": "sensor",
  "success": true,
  "count": 2,
  "message": "Configured 2 sensor(s) successfully",
  "timestamp": 1234567890
}
```

**Error Response:**

```cpp
void ConfigResponseBuilder::publishError(ConfigType type,
                                        ConfigErrorCode error_code,
                                        const String& message,
                                        JsonVariantConst failed_config) {
  String payload = "{";
  payload += "\"type\":\"" + getConfigTypeString(type) + "\",";
  payload += "\"success\":false,";
  payload += "\"error_code\":" + String((int)error_code) + ",";
  payload += "\"message\":\"" + message + "\"";
  
  if (!failed_config.isNull()) {
    payload += ",\"failed_config\":";
    // Serialize failed config
    String config_str;
    serializeJson(failed_config, config_str);
    payload += config_str;
  }
  
  payload += ",\"timestamp\":" + String(millis());
  payload += "}";
  
  const char* topic = TopicBuilder::buildConfigResponseTopic();
  mqttClient.publish(topic, payload, 1);
}
```

**Error Payload:**

```json
{
  "type": "sensor",
  "success": false,
  "error_code": 1,
  "message": "Sensor config missing required field 'gpio'",
  "failed_config": {
    "sensor_type": "temp_ds18b20",
    "sensor_name": "Test Sensor"
  },
  "timestamp": 1234567890
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| 0 | None |
| 1 | Missing field |
| 2 | Type mismatch |
| 3 | Validation failed |
| 4 | NVS write failed |
| 5 | JSON parse error |
| 99 | Unknown error |

---

## Complete Flow Sequence

```
MQTT Config Message
  │
  ├─► Parse JSON (4096 bytes buffer)
  │
  ├─► Extract sensors array
  │
  ├─► For each sensor:
  │     │
  │     ├─► Validate required fields
  │     ├─► Validate optional fields
  │     ├─► Validate GPIO availability
  │     │
  │     ├─► If active=false:
  │     │     ├─► Remove from sensor manager
  │     │     └─► Remove from NVS
  │     │
  │     └─► If active=true:
  │           ├─► Configure in sensor manager
  │           ├─► Reserve GPIO
  │           └─► Persist to NVS
  │
  └─► Publish response (success/error)
```

---

## Timing Analysis

| Operation | Duration |
|-----------|----------|
| JSON parse | 5-20ms |
| Field validation | <1ms per field |
| GPIO reservation | <1ms |
| NVS write | 10-50ms per sensor |
| Response publish | 10-20ms |

**Total:** 50-200ms for 2-sensor config

---

## Memory Usage

| Allocation | Size |
|------------|------|
| JSON buffer | 4096 bytes (stack) |
| SensorConfig struct | ~128 bytes |
| Temp strings | ~256 bytes |

**Total:** ~4.5KB per config operation

---

## Error Handling

### JSON Parse Errors

**Causes:** Malformed JSON, buffer too small

**Recovery:** Publish error response, abort

### GPIO Conflicts

**Causes:** GPIO already in use by another sensor/actuator

**Recovery:** Publish error for that sensor, continue with others

### NVS Write Failures

**Causes:** NVS full, corruption

**Recovery:** Sensor still configured in RAM, but not persisted (lost on reboot)

---

## Integration with God-Kaiser

### Configuration Workflow

1. User adds sensor in God-Kaiser UI
2. God-Kaiser validates sensor type and GPIO
3. God-Kaiser publishes config to ESP
4. ESP configures sensor and persists
5. ESP publishes response
6. God-Kaiser confirms in UI
7. Sensor immediately starts publishing data

---

## Debugging

### Enable Debug Logging

```cpp
logger.setLogLevel(LOG_DEBUG);
```

### MQTT Monitoring

```bash
mosquitto_sub -h 192.168.0.198 -p 8883 \
  -t "kaiser/+/esp/+/config" \
  -t "kaiser/+/esp/+/config_response" \
  -v
```

---

## Next Flows

→ [Sensor Reading Flow](02-sensor-reading-flow.md) - How configured sensors are read  
→ [Runtime Actuator Config Flow](05-runtime-actuator-config-flow.md) - Similar flow for actuators  
→ [MQTT Message Routing](06-mqtt-message-routing-flow.md) - Message dispatch  

---

**End of Runtime Sensor Configuration Flow Documentation**

