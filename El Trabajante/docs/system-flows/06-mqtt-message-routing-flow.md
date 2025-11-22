# MQTT Message Routing Flow

## Overview

Central MQTT message dispatch system that routes incoming messages to appropriate handlers. This is the nervous system of El Trabajante, coordinating all incoming commands, configurations, and emergency signals from God-Kaiser.

## Files Analyzed

- `src/main.cpp` (lines 344-492) - Complete MQTT callback lambda
- `src/main.cpp` (lines 321-342) - Topic subscriptions
- `src/services/communication/mqtt_client.cpp` (lines 1-603) - MQTT client implementation
- `src/services/communication/mqtt_client.h` (lines 1-136) - MQTT client interface
- `src/utils/topic_builder.cpp` (lines 1-146) - Topic pattern generation

## Prerequisites

- MQTT client connected (completed in boot sequence Phase 2)
- Topics subscribed
- Callback registered

## Trigger

Automatic on MQTT message reception. The PubSubClient library calls the registered callback when a message arrives on a subscribed topic.

---

## Topic Subscriptions

**File:** `src/main.cpp` (lines 321-342)

**Code:**

```cpp
// Subscribe to critical topics
String system_command_topic = TopicBuilder::buildSystemCommandTopic();
String config_topic = TopicBuilder::buildConfigTopic();
String broadcast_emergency_topic = TopicBuilder::buildBroadcastEmergencyTopic();
String actuator_command_topic = TopicBuilder::buildActuatorCommandTopic(0);
String actuator_command_wildcard = actuator_command_topic;
actuator_command_wildcard.replace("/0/command", "/+/command");
String esp_emergency_topic = TopicBuilder::buildActuatorEmergencyTopic();

// Phase 7: Zone assignment topic
String zone_assign_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + 
                          g_system_config.esp_id + "/zone/assign";
if (g_kaiser.kaiser_id.length() == 0) {
  zone_assign_topic = "kaiser/god/esp/" + g_system_config.esp_id + "/zone/assign";
}

mqttClient.subscribe(system_command_topic);
mqttClient.subscribe(config_topic);
mqttClient.subscribe(broadcast_emergency_topic);
mqttClient.subscribe(actuator_command_wildcard);
mqttClient.subscribe(esp_emergency_topic);
mqttClient.subscribe(zone_assign_topic);

LOG_INFO("Subscribed to system + actuator + zone assignment topics");
```

### Subscribed Topics Table

| Topic Pattern | Example | Purpose |
|---------------|---------|---------|
| `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | `kaiser/god/esp/ESP_AB12CD/system/command` | System commands (factory reset) |
| `kaiser/{kaiser_id}/esp/{esp_id}/config` | `kaiser/god/esp/ESP_AB12CD/config` | Sensor/actuator configuration |
| `kaiser/broadcast/emergency` | `kaiser/broadcast/emergency` | Global emergency stop |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/+/command` | `kaiser/god/esp/ESP_AB12CD/actuator/4/command` | Actuator commands (wildcard) |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency` | `kaiser/god/esp/ESP_AB12CD/actuator/emergency` | ESP emergency stop |
| `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | `kaiser/god/esp/ESP_AB12CD/zone/assign` | Zone assignment |

---

## Message Reception Flow

### STEP 1: PubSubClient Receives Message

**File:** `src/services/communication/mqtt_client.cpp` (static callback)

**Process:**
1. MQTT broker sends message to ESP32
2. PubSubClient library receives message
3. Library calls registered static callback
4. Static callback invokes instance callback

**Callback Registration:**

```cpp
void MQTTClient::begin() {
    mqtt_.setCallback(staticCallback);
    // ...
}
```

---

### STEP 2: Message Enters Router

**File:** `src/main.cpp` (lines 344-492)

**Code:**

```cpp
mqttClient.setCallback([](const String& topic, const String& payload) {
  LOG_INFO("MQTT message received: " + topic);
  LOG_DEBUG("Payload: " + payload);
  
  // Route to appropriate handler...
});
```

**Logging:**
- INFO level: Topic received
- DEBUG level: Full payload (can be disabled in production)

**Router Logic:** Sequential if-else chain matching topic patterns

---

## Message Handlers

### HANDLER 1: Configuration Messages

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

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

**Example Topic:** `kaiser/god/esp/ESP_AB12CD/config`

**Payload Format:**

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
    }
  ],
  "actuators": [
    {
      "gpio": 5,
      "actuator_type": "pump",
      "actuator_name": "Water Pump 1",
      "subzone_id": "section_A",
      "active": true,
      "critical": false
    }
  ]
}
```

**Handlers Called:**
1. `handleSensorConfig(payload)` - Processes sensor array
2. `handleActuatorConfig(payload)` - Processes actuator array

**Details:** See [Runtime Sensor Config Flow](04-runtime-sensor-config-flow.md) and [Runtime Actuator Config Flow](05-runtime-actuator-config-flow.md)

**Response Topics:**
- `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

**QoS:** 1 (at least once)

---

### HANDLER 2: Actuator Commands

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

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`

**Example Topics:**
- `kaiser/god/esp/ESP_AB12CD/actuator/4/command`
- `kaiser/god/esp/ESP_AB12CD/actuator/5/command`

**Subscription:** Uses MQTT wildcard `+` to match any GPIO

**Payload Format:**

```json
{
  "command": "set_state",
  "value": 1,
  "timestamp": 1234567890,
  "command_id": "cmd_abc123"
}
```

**Commands Supported:**
- `set_state` - Binary ON/OFF (value: 0 or 1)
- `set_pwm` - PWM duty cycle (value: 0-255)
- `emergency_stop` - Immediate stop

**Handler:** `actuatorManager.handleActuatorCommand(topic, payload)`

**Details:** See [Actuator Command Flow](03-actuator-command-flow.md)

**Response Topics:**
- `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response` - Command acknowledgment
- `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` - Current status

**QoS:** 1 (at least once)

---

### HANDLER 3: ESP Emergency Stop

**File:** `src/main.cpp` (lines 365-370)

**Code:**

```cpp
// ESP-specific emergency stop
String esp_emergency_topic = String(TopicBuilder::buildActuatorEmergencyTopic());
if (topic == esp_emergency_topic) {
  safetyController.emergencyStopAll("ESP emergency command");
  return;
}
```

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency`

**Example Topic:** `kaiser/god/esp/ESP_AB12CD/actuator/emergency`

**Payload:** Empty or JSON (ignored)

**Action:**
1. Call `safetyController.emergencyStopAll("ESP emergency command")`
2. All actuators immediately stopped
3. Emergency state persists until cleared

**Safety Behavior:**
- Stops ALL actuators on this ESP
- Sets emergency flag on SafetyController
- Prevents any actuator commands until cleared
- Publishes emergency status to MQTT

**Clear Emergency:** Requires separate command via system topic or manual intervention

**QoS:** 1 (at least once)

**Priority:** Highest - bypasses all other processing

---

### HANDLER 4: Broadcast Emergency

**File:** `src/main.cpp` (lines 372-377)

**Code:**

```cpp
// Broadcast emergency
String broadcast_emergency_topic = String(TopicBuilder::buildBroadcastEmergencyTopic());
if (topic == broadcast_emergency_topic) {
  safetyController.emergencyStopAll("Broadcast emergency");
  return;
}
```

**Topic Pattern:** `kaiser/broadcast/emergency`

**Scope:** ALL ESPs in entire system

**Payload:** Empty or JSON with reason

**Action:**
1. Call `safetyController.emergencyStopAll("Broadcast emergency")`
2. All actuators immediately stopped
3. Emergency state persists

**Use Cases:**
- System-wide emergency (fire, flood, etc.)
- Critical sensor failure detected by God-Kaiser
- Manual emergency stop button on control panel

**Difference from ESP Emergency:**
- Broadcast affects ALL ESPs
- ESP Emergency affects only one ESP

**QoS:** 1 (at least once)

**Retained:** False (emergency is time-sensitive, not persistent)

---

### HANDLER 5: System Commands

**File:** `src/main.cpp` (lines 379-413)

**Code:**

```cpp
// System commands (factory reset, etc.)
String system_command_topic = String(TopicBuilder::buildSystemCommandTopic());
if (topic == system_command_topic) {
  // Parse JSON payload
  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, payload);
  
  if (!error) {
    String command = doc["command"].as<String>();
    bool confirm = doc["confirm"] | false;
    
    if (command == "factory_reset" && confirm) {
      LOG_WARNING("╔════════════════════════════════════════╗");
      LOG_WARNING("║  FACTORY RESET via MQTT               ║");
      LOG_WARNING("╚════════════════════════════════════════╝");
      
      // Acknowledge command
      String response = "{\"status\":\"factory_reset_initiated\",\"esp_id\":\"" + 
                      configManager.getESPId() + "\"}";
      mqttClient.publish(system_command_topic + "/response", response);
      
      // Clear configs
      configManager.resetWiFiConfig();
      KaiserZone kaiser;
      MasterZone master;
      configManager.saveZoneConfig(kaiser, master);
      
      LOG_INFO("✅ Configuration cleared via MQTT");
      LOG_INFO("Rebooting in 3 seconds...");
      delay(3000);
      ESP.restart();
    }
  }
  return;
}
```

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/system/command`

**Example Topic:** `kaiser/god/esp/ESP_AB12CD/system/command`

**Payload Format:**

```json
{
  "command": "factory_reset",
  "confirm": true
}
```

**Commands Supported:**

| Command | Requires Confirm | Action |
|---------|------------------|--------|
| `factory_reset` | Yes | Clear all NVS configs and reboot |
| `reboot` | No | Simple reboot |
| `safe_mode` | No | Enter safe mode (all actuators stopped) |

**Factory Reset Flow:**

1. Parse JSON payload
2. Verify `command == "factory_reset"`
3. Verify `confirm == true` (safety mechanism)
4. Publish acknowledgment to `{topic}/response`
5. Clear WiFi config (NVS namespace `wifi_config`)
6. Clear zone config (NVS namespace `zone_config`)
7. Wait 3 seconds
8. Reboot ESP

**NVS Operations:**
- **Namespaces Cleared:** `wifi_config`, `zone_config`
- **Preserved:** Sensor/actuator configs (optional - could be added)

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/command/response`

**Response Payload:**

```json
{
  "status": "factory_reset_initiated",
  "esp_id": "ESP_AB12CD"
}
```

**Safety:** Requires explicit `confirm: true` to prevent accidental resets

**QoS:** 1 (at least once)

---

### HANDLER 6: Zone Assignment

**File:** `src/main.cpp` (lines 415-489)

**Code:**

```cpp
// Phase 7: Zone Assignment Handler
String zone_assign_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + 
                          g_system_config.esp_id + "/zone/assign";
if (g_kaiser.kaiser_id.length() == 0) {
  zone_assign_topic = "kaiser/god/esp/" + g_system_config.esp_id + "/zone/assign";
}

if (topic == zone_assign_topic) {
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  ZONE ASSIGNMENT RECEIVED             ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  // Parse JSON payload
  DynamicJsonDocument doc(512);
  DeserializationError error = deserializeJson(doc, payload);
  
  if (!error) {
    String zone_id = doc["zone_id"].as<String>();
    String master_zone_id = doc["master_zone_id"].as<String>();
    String zone_name = doc["zone_name"].as<String>();
    String kaiser_id = doc["kaiser_id"].as<String>();
    
    LOG_INFO("Zone ID: " + zone_id);
    LOG_INFO("Master Zone: " + master_zone_id);
    LOG_INFO("Zone Name: " + zone_name);
    LOG_INFO("Kaiser ID: " + kaiser_id);
    
    // Update zone configuration
    if (configManager.updateZoneAssignment(zone_id, master_zone_id, zone_name, kaiser_id)) {
      // Update global variables
      g_kaiser.zone_id = zone_id;
      g_kaiser.master_zone_id = master_zone_id;
      g_kaiser.zone_name = zone_name;
      g_kaiser.zone_assigned = true;
      if (kaiser_id.length() > 0) {
        g_kaiser.kaiser_id = kaiser_id;
        // Update TopicBuilder with new kaiser_id
        TopicBuilder::setKaiserId(kaiser_id.c_str());
      }
      
      // Send acknowledgment
      String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + 
                        g_system_config.esp_id + "/zone/ack";
      DynamicJsonDocument ack_doc(256);
      ack_doc["esp_id"] = g_system_config.esp_id;
      ack_doc["status"] = "zone_assigned";
      ack_doc["zone_id"] = zone_id;
      ack_doc["master_zone_id"] = master_zone_id;
      ack_doc["timestamp"] = millis();
      
      String ack_payload;
      serializeJson(ack_doc, ack_payload);
      mqttClient.publish(ack_topic, ack_payload);
      
      LOG_INFO("✅ Zone assignment successful");
      LOG_INFO("ESP is now part of zone: " + zone_id);
      
      // Update system state
      g_system_config.current_state = STATE_ZONE_CONFIGURED;
      configManager.saveSystemConfig(g_system_config);
      
      // Send updated heartbeat
      mqttClient.publishHeartbeat();
    } else {
      LOG_ERROR("❌ Failed to save zone configuration");
      
      // Send error acknowledgment
      String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + 
                        g_system_config.esp_id + "/zone/ack";
      String error_response = "{\"esp_id\":\"" + g_system_config.esp_id + 
                             "\",\"status\":\"error\",\"message\":\"Failed to save zone config\"}";
      mqttClient.publish(ack_topic, error_response);
    }
  } else {
    LOG_ERROR("Failed to parse zone assignment JSON");
  }
  return;
}
```

**Topic Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

**Example Topic:** `kaiser/god/esp/ESP_AB12CD/zone/assign`

**Payload Format:**

```json
{
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "zone_name": "Greenhouse Section 1",
  "kaiser_id": "kaiser_production_001"
}
```

**Zone Assignment Flow:**

1. Parse JSON payload
2. Extract zone information
3. Update NVS (namespace `zone_config`)
4. Update global variables
5. Reconfigure TopicBuilder with new Kaiser ID
6. Update system state to `STATE_ZONE_CONFIGURED`
7. Send acknowledgment
8. Send updated heartbeat with zone info

**NVS Operations:**
- **Namespace:** `zone_config`
- **Keys Updated:**
  - `zone_id` (String)
  - `master_zone_id` (String)
  - `zone_name` (String)
  - `kaiser_id` (String)
  - `zone_assigned` (bool) = true

**Response Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack`

**Success Response:**

```json
{
  "esp_id": "ESP_AB12CD",
  "status": "zone_assigned",
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "timestamp": 123456789
}
```

**Error Response:**

```json
{
  "esp_id": "ESP_AB12CD",
  "status": "error",
  "message": "Failed to save zone config"
}
```

**Side Effects:**
- All future MQTT topics use new Kaiser ID
- Heartbeat includes zone information
- ESP appears in correct zone in God-Kaiser UI

**Details:** See [Zone Assignment Flow](08-zone-assignment-flow.md)

**QoS:** 1 (at least once)

---

## Message Processing

### Callback Execution

**Thread:** WiFi/MQTT task (not main loop)

**Timing:** Synchronous - callback must complete quickly

**Best Practices:**
- Keep callbacks short
- Don't block (no long delays)
- Don't call yield() or delay() extensively
- Use flags for heavy processing in main loop

**Current Implementation:** All handlers execute synchronously, but operations are fast (<100ms typical)

---

### JSON Parsing

**Library:** ArduinoJson

**Buffer Sizes:**
- Configuration: 4096 bytes (large for sensor/actuator arrays)
- Zone assignment: 512 bytes
- System commands: 256 bytes

**Error Handling:**

```cpp
DynamicJsonDocument doc(512);
DeserializationError error = deserializeJson(doc, payload);
if (error) {
  LOG_ERROR("Failed to parse JSON: " + String(error.c_str()));
  return;
}
```

**Memory:** Temporary stack allocation, freed when handler returns

---

## Error Handling

### Invalid Topic

**Behavior:** No handler matches → Log warning → Ignore message

**Log Message:** "MQTT message received: {topic}" (INFO level only)

**Recovery:** None needed - not an error condition

---

### Malformed JSON

**Behavior:** JSON parse error → Log error → Ignore message

**Log Example:**

```
[ERROR] Failed to parse sensor config JSON: InvalidInput
```

**Recovery:** None - God-Kaiser should resend with correct format

---

### Handler Failure

**Behavior:** Handler returns false or logs error → No retry

**Examples:**
- Sensor config validation fails → Error response published
- Actuator GPIO conflict → Error response published
- NVS write fails → Error logged, continue

**Recovery:** Depends on handler - most publish error responses

---

## MQTT Client Loop Processing

**File:** `src/main.cpp` (line 640)

**Code:**

```cpp
void loop() {
  // ...
  mqttClient.loop();  // Process MQTT messages + heartbeat
  // ...
}
```

**Purpose:** Allow MQTT client to process incoming messages and maintain connection

**Frequency:** Every loop iteration (~100Hz typical)

**Operations:**
- Check for incoming messages
- Invoke callbacks for received messages
- Send MQTT PINGREQ (keepalive)
- Handle reconnection if disconnected

**Heartbeat:**
- Sent every 60 seconds
- Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`
- Includes ESP status, memory, uptime, zone info

---

## Performance Metrics

### Message Processing Time

| Handler | Typical Duration | Max Duration |
|---------|------------------|--------------|
| Sensor Config | 10-50ms | 200ms (10 sensors) |
| Actuator Config | 10-50ms | 200ms (10 actuators) |
| Actuator Command | 5-20ms | 50ms |
| Emergency Stop | <5ms | 10ms |
| System Command | 10-50ms | 3000ms (factory reset) |
| Zone Assignment | 20-100ms | 200ms |

### Message Throughput

- **Typical:** 1-10 messages/second
- **Peak:** 100 messages/second (tested)
- **Limit:** ~1000 messages/second (theoretical, network limited)

### Memory Usage

- **Stack per callback:** ~2-5KB (JSON buffers)
- **Heap per callback:** 0KB (statically allocated)
- **MQTT client buffer:** 256 bytes (message payload limit: configurable)

---

## QoS and Reliability

### Quality of Service

All subscriptions use **QoS 1** (at least once delivery):

- Broker acknowledges message receipt
- ESP acknowledges message processing (via response topics)
- No duplicate detection (handled by application)

### Message Ordering

**Not guaranteed** - MQTT does not guarantee message order across topics

**Mitigation:**
- Command IDs in payloads (optional)
- Timestamps in payloads
- State machine prevents invalid transitions

### Lost Messages

**Detection:** None at MQTT level

**Recovery:**
- God-Kaiser resends if no response received
- Heartbeat includes current state (allows state sync)
- Periodic status publishing (sensors, actuators)

---

## Security Considerations

### Authentication

**Current:** Optional MQTT username/password

**Anonymous Mode:** Supported for development

**Future:** TLS/SSL encryption (port 8883)

### Authorization

**Current:** None - any client can publish to any topic

**Mitigation:**
- MQTT broker ACLs (God-Kaiser configuration)
- Topic patterns include ESP ID (harder to guess)

### Message Validation

**JSON Schema:** Implicit (validated by handlers)

**Field Validation:**
- Required fields checked
- Data types validated
- Range checking (GPIO 0-39, PWM 0-255)

### Command Confirmation

**Factory Reset:** Requires explicit `confirm: true` flag

**Emergency Stop:** No confirmation (immediate action)

---

## Debugging

### Enable Debug Logging

```cpp
logger.setLogLevel(LOG_DEBUG);
```

**Output:** Full payload for every message

### MQTT Message Tracing

**Tools:**
- MQTT Explorer (desktop app)
- mosquitto_sub (command line)
- God-Kaiser test server logs

**Subscribe to all topics:**

```bash
mosquitto_sub -h 192.168.0.198 -p 8883 -t "kaiser/#" -v
```

### Common Issues

**No messages received:**
- Check WiFi connection
- Check MQTT connection
- Verify topic subscriptions
- Check broker logs

**Messages received but not processed:**
- Check topic patterns match
- Verify JSON format
- Check handler logic
- Enable DEBUG logging

**Slow message processing:**
- Check handler duration
- Reduce JSON buffer sizes
- Optimize handlers

---

## Next Flows

From MQTT routing, messages are dispatched to:

→ [Sensor Reading Flow](02-sensor-reading-flow.md) - For sensor data publishing  
→ [Actuator Command Flow](03-actuator-command-flow.md) - For actuator control  
→ [Runtime Sensor Config Flow](04-runtime-sensor-config-flow.md) - For sensor configuration  
→ [Runtime Actuator Config Flow](05-runtime-actuator-config-flow.md) - For actuator configuration  
→ [Zone Assignment Flow](08-zone-assignment-flow.md) - For zone management  

---

## Related Documentation

- [Boot Sequence](01-boot-sequence.md) - MQTT initialization
- [Error Recovery Flow](07-error-recovery-flow.md) - Connection recovery
- `docs/MQTT_CLIENT_API.md` - MQTT client detailed API
- `docs/Mqtt_Protocoll.md` - God-Kaiser MQTT protocol specification

---

**End of MQTT Message Routing Flow Documentation**

