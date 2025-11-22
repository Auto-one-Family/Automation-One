# Zone Assignment Flow

## Overview

Hierarchical zone management (Phase 7) allows God-Kaiser to organize ESPs into logical zones representing physical locations (greenhouses, sections, rows). This enables zone-based automation, monitoring, and control across large deployments.

## Files Analyzed

- `src/main.cpp` (lines 415-489) - Zone assignment handler
- `src/services/config/config_manager.cpp` - updateZoneAssignment()
- `src/models/system_types.h` - Zone data structures
- `src/utils/topic_builder.cpp` - Topic reconfiguration
- `docs/NVS_KEYS.md` - Zone configuration keys

## Prerequisites

- MQTT client connected
- Config Manager operational
- ESP successfully provisioned
- Initial heartbeat sent

## Trigger

MQTT message on: `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

---

## Zone Hierarchy

```
God-Kaiser (Top Level)
  │
  ├─► Kaiser Instance (e.g., "kaiser_production_001")
  │     │
  │     ├─► Master Zone (e.g., "greenhouse_master")
  │     │     │
  │     │     ├─► Zone (e.g., "greenhouse_zone_1")
  │     │     │     │
  │     │     │     └─► Subzone (e.g., "section_A")
  │     │     │           └─► Sensor/Actuator
  │     │     │
  │     │     └─► Zone (e.g., "greenhouse_zone_2")
  │     │
  │     └─► Master Zone (e.g., "irrigation_master")
  │
  └─► Default: "god" (Unassigned ESPs)
```

---

## Zone Data Structures

**File:** `src/models/system_types.h`

```cpp
struct KaiserZone {
  String kaiser_id = "";          // Kaiser instance ID
  String kaiser_name = "";        // Kaiser instance name
  String zone_id = "";            // Current zone ID
  String zone_name = "";          // Zone human-readable name
  String master_zone_id = "";     // Parent master zone
  String master_zone_name = "";   // Master zone name
  bool zone_assigned = false;     // Zone assignment status
  bool connected = false;         // Connected to Kaiser
};

struct MasterZone {
  String zone_id = "";            // Master zone ID
  String zone_name = "";          // Master zone name
  bool is_master_esp = false;     // Is this ESP the master?
  String master_esp_id = "";      // Master ESP ID (if not this)
  uint8_t connected_esps = 0;     // ESPs in this master zone
};
```

---

## Zone Assignment Payload

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

**Example:** `kaiser/god/esp/ESP_AB12CD/zone/assign`

**Payload:**

```json
{
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "zone_name": "Greenhouse Section 1",
  "kaiser_id": "kaiser_production_001",
  "timestamp": 1234567890
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `zone_id` | String | Yes | Unique zone identifier |
| `master_zone_id` | String | Yes | Parent master zone ID |
| `zone_name` | String | Yes | Human-readable zone name |
| `kaiser_id` | String | Yes | Kaiser instance ID |
| `timestamp` | Number | No | Assignment timestamp |

---

## Flow Steps

### STEP 1: MQTT Message Reception

**File:** `src/main.cpp` (lines 415-421)

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
  // ...
}
```

**Topic Matching:**
- Unassigned ESP: `kaiser/god/esp/{esp_id}/zone/assign`
- Assigned ESP: `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

---

### STEP 2: Parse Zone Information

**File:** `src/main.cpp` (lines 426-440)

**Code:**

```cpp
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
  
  // Update zone configuration...
} else {
  LOG_ERROR("Failed to parse zone assignment JSON");
}
```

**JSON Buffer:** 512 bytes

---

### STEP 3: Update Configuration

**File:** `src/main.cpp` (lines 442-476)

**Code:**

```cpp
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
```

**Operations:**
1. Persist zone config to NVS
2. Update global zone variables
3. Reconfigure TopicBuilder
4. Update system state
5. Send acknowledgment
6. Send updated heartbeat

---

### STEP 4: Persist to NVS

**File:** `src/services/config/config_manager.cpp`

**Code:**

```cpp
bool ConfigManager::updateZoneAssignment(const String& zone_id,
                                        const String& master_zone_id,
                                        const String& zone_name,
                                        const String& kaiser_id) {
  if (!storageManager.beginNamespace("zone_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open zone_config namespace");
    return false;
  }
  
  // Save zone information
  storageManager.putString("zone_id", zone_id);
  storageManager.putString("master_zone_id", master_zone_id);
  storageManager.putString("zone_name", zone_name);
  storageManager.putBool("zone_assigned", true);
  
  // Update kaiser if provided
  if (kaiser_id.length() > 0) {
    storageManager.putString("kaiser_id", kaiser_id);
    storageManager.putBool("connected", true);
  }
  
  storageManager.endNamespace();
  
  LOG_INFO("ConfigManager: Zone assignment saved to NVS");
  return true;
}
```

### NVS Keys

**Namespace:** `zone_config`

**Keys:**
- `zone_id` (String) - Zone identifier
- `master_zone_id` (String) - Master zone ID
- `zone_name` (String) - Zone name
- `zone_assigned` (bool) - Assignment status
- `kaiser_id` (String) - Kaiser instance ID
- `kaiser_name` (String) - Kaiser name
- `connected` (bool) - Connection status

---

### STEP 5: Reconfigure Topic Builder

**File:** `src/utils/topic_builder.cpp`

**Code:**

```cpp
void TopicBuilder::setKaiserId(const char* kaiser_id) {
  strncpy(kaiser_id_, kaiser_id, sizeof(kaiser_id_) - 1);
  kaiser_id_[sizeof(kaiser_id_) - 1] = '\0';
}
```

**Effect:** All subsequent MQTT topics use new Kaiser ID

**Example:**

Before:
```
kaiser/god/esp/ESP_AB12CD/sensor/4/data
```

After:
```
kaiser/kaiser_production_001/esp/ESP_AB12CD/sensor/4/data
```

---

### STEP 6: Publish Acknowledgment

**Acknowledgment Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack`

**Success Payload:**

```json
{
  "esp_id": "ESP_AB12CD",
  "status": "zone_assigned",
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "timestamp": 1234567890
}
```

**Error Payload:**

```json
{
  "esp_id": "ESP_AB12CD",
  "status": "error",
  "message": "Failed to save zone config"
}
```

**QoS:** 1 (at least once)

---

### STEP 7: Publish Updated Heartbeat

**File:** `src/services/communication/mqtt_client.cpp`

**Code:**

```cpp
void MQTTClient::publishHeartbeat() {
  String topic = TopicBuilder::buildSystemHeartbeatTopic();
  
  DynamicJsonDocument doc(512);
  doc["esp_id"] = configManager.getESPId();
  doc["zone_id"] = g_kaiser.zone_id;
  doc["master_zone_id"] = g_kaiser.master_zone_id;
  doc["zone_name"] = g_kaiser.zone_name;
  doc["zone_assigned"] = g_kaiser.zone_assigned;
  doc["uptime"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  publish(topic, payload, 1);
}
```

**Heartbeat Includes Zone Information:**

```json
{
  "esp_id": "ESP_AB12CD",
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "zone_name": "Greenhouse Section 1",
  "zone_assigned": true,
  "uptime": 12345,
  "free_heap": 250000,
  "wifi_rssi": -45,
  "timestamp": 1234567890
}
```

---

## Zone Assignment Workflow

### Initial Assignment

1. ESP boots with no zone assignment
2. ESP subscribes to: `kaiser/god/esp/{esp_id}/zone/assign`
3. ESP publishes heartbeat with `zone_assigned: false`
4. God-Kaiser detects new ESP
5. User assigns ESP to zone in UI
6. God-Kaiser publishes zone assignment
7. ESP receives, configures, and acknowledges
8. ESP republishes heartbeat with zone info
9. God-Kaiser confirms in UI

### Reassignment

1. User changes ESP zone in God-Kaiser UI
2. God-Kaiser publishes new zone assignment
3. ESP receives on current Kaiser topic
4. ESP updates configuration
5. ESP resubscribes to new topics
6. ESP acknowledges
7. ESP starts publishing to new zone topics

---

## MQTT Topic Migration

### Before Zone Assignment

| Topic Type | Pattern |
|------------|---------|
| Sensor Data | `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` |
| Actuator Command | `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` |
| Config | `kaiser/god/esp/{esp_id}/config` |
| Heartbeat | `kaiser/god/esp/{esp_id}/system/heartbeat` |

### After Zone Assignment

| Topic Type | Pattern |
|------------|---------|
| Sensor Data | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` |
| Actuator Command | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` |
| Config | `kaiser/{kaiser_id}/esp/{esp_id}/config` |
| Heartbeat | `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` |

---

## Sensor/Actuator Subzone Integration

### Sensor with Subzone

**Configuration:**

```json
{
  "gpio": 4,
  "sensor_type": "temp_ds18b20",
  "sensor_name": "Temperature",
  "subzone_id": "section_A"
}
```

**Published Data:**

```json
{
  "esp_id": "ESP_AB12CD",
  "zone_id": "greenhouse_zone_1",
  "subzone_id": "section_A",
  "gpio": 4,
  "sensor_type": "temp_ds18b20",
  "value": 23.5,
  "unit": "°C"
}
```

**Hierarchy:**

```
Kaiser: kaiser_production_001
  └─► Master Zone: greenhouse_master
      └─► Zone: greenhouse_zone_1
          └─► ESP: ESP_AB12CD
              └─► Subzone: section_A
                  └─► Sensor: GPIO 4 (Temperature)
```

---

## State Machine

### Zone Assignment States

```
STATE_BOOT
  │
  └─► STATE_PROVISIONED (WiFi configured)
      │
      └─► STATE_CONNECTED (MQTT connected)
          │
          └─► STATE_ZONE_CONFIGURED (Zone assigned)
              │
              └─► STATE_OPERATIONAL (Normal operation)
```

**State Tracking:**

```cpp
enum SystemState {
  STATE_BOOT = 0,
  STATE_PROVISIONED,
  STATE_CONNECTED,
  STATE_ZONE_CONFIGURED,
  STATE_OPERATIONAL,
  STATE_SAFE_MODE = 10,
  STATE_ERROR = 11
};
```

---

## God-Kaiser Integration

### Zone Management Features

1. **Automatic Discovery**
   - God-Kaiser subscribes to `kaiser/god/esp/+/system/heartbeat`
   - Detects new ESPs automatically
   - Displays unassigned ESPs in UI

2. **Zone Assignment UI**
   - Drag-and-drop ESP assignment
   - Hierarchical zone tree
   - Bulk zone operations

3. **Zone-Based Monitoring**
   - Filter by zone/master zone
   - Zone-level dashboards
   - Zone aggregation (avg temp per zone)

4. **Zone-Based Automation**
   - Rules apply to entire zone
   - Zone emergency stop
   - Zone-level schedules

---

## Benefits of Zone Organization

### Scalability

- **100 ESPs:** Organize by greenhouse/section
- **1000 ESPs:** Multi-site deployments
- **Hierarchical:** Easy to navigate large installations

### Automation

- **Zone Rules:** "Turn on fans in greenhouse_zone_1 if avg temp > 28°C"
- **Master Zone Rules:** "Emergency stop all actuators in greenhouse_master"

### Monitoring

- **Zone Dashboards:** View all sensors in a zone
- **Zone Alerts:** Alert if any sensor in zone fails
- **Zone Reports:** Daily/weekly reports per zone

### Maintenance

- **Zone Filtering:** Show only ESPs in specific zone
- **Batch Updates:** Update config for all ESPs in zone
- **Zone Isolation:** Test new features in test zone

---

## Error Handling

### Zone Assignment Failures

**Causes:**
- NVS write failure
- Invalid zone ID format
- Network timeout

**Recovery:**
- ESP remains in previous state
- Publishes error acknowledgment
- Can be retried by God-Kaiser

### Topic Migration Issues

**Causes:**
- MQTT broker ACL restrictions
- Topic buffer overflow

**Mitigation:**
- Gradual topic migration
- Unsubscribe old topics after success
- Fallback to "god" kaiser if migration fails

---

## Performance Impact

**Zone Assignment Operation:**
- Duration: 50-100ms
- NVS Writes: ~5 keys
- MQTT Messages: 2 (ack + heartbeat)
- Memory: ~1KB temporary

**Ongoing Impact:**
- None - zone info cached in memory
- Topic strings pre-built
- No additional MQTT traffic

---

## Debugging

### Enable Debug Logging

```cpp
logger.setLogLevel(LOG_DEBUG);
```

### MQTT Monitoring

```bash
# Monitor zone assignments
mosquitto_sub -h 192.168.0.198 -p 8883 \
  -t "kaiser/+/esp/+/zone/assign" \
  -t "kaiser/+/esp/+/zone/ack" \
  -v

# Monitor heartbeats for zone info
mosquitto_sub -h 192.168.0.198 -p 8883 \
  -t "kaiser/+/esp/+/system/heartbeat" \
  -v
```

---

## Next Flows

→ [Boot Sequence](01-boot-sequence.md) - Zone loading during boot  
→ [Sensor Reading Flow](02-sensor-reading-flow.md) - Zone info in sensor data  
→ [MQTT Message Routing](06-mqtt-message-routing-flow.md) - Zone assignment handler  

---

**End of Zone Assignment Flow Documentation**

