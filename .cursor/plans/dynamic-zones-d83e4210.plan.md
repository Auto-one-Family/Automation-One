<!-- d83e4210-e4f9-4cba-8fde-fd82d6c3c930 7745e02d-1f34-48c0-9c99-492131e0b6b0 -->
# Dynamic Runtime Configuration & Zone System

## Overview

Transform El Trabajante into a fully dynamic system where:

- Sensors/actuators can be added/removed/reconfigured at runtime (no reboot)
- ESPs automatically announce themselves via MQTT and get registered
- Hierarchical zone system (ESP→zone→master_zone, sensors/actuators→subzone)
- Zone information included in heartbeat for God-Kaiser tracking

## Phase 1: Enhanced Zone System

### 1.1 Extend Zone Data Structures

**File:** `El Trabajante/src/models/system_types.h`

Update zone structures to support hierarchical model:

```cpp
struct KaiserZone {
  String kaiser_id = "";           // Existing
  String zone_id = "";              // NEW: Primary zone identifier
  String master_zone_id = "";       // NEW: Parent zone (hierarchical)
  String zone_name = "";            // NEW: Human-readable name
  bool zone_assigned = false;       // NEW: Zone configuration status
  // Keep existing fields
  String kaiser_name = "";
  String system_name = "";
  bool connected = false;
  bool id_generated = false;
};
```

**Rationale:** ESP has zone_id (e.g., "greenhouse_zone_1") which can belong to master_zone_id (e.g., "greenhouse"). Sensors/actuators already have subzone_id field.

### 1.2 Update ConfigManager for Zones

**File:** `El Trabajante/src/services/config/config_manager.cpp`

Add methods to save/load zone_id and master_zone_id:

- Extend `loadZoneConfig()` to include new fields
- Extend `saveZoneConfig()` to persist zone_id, master_zone_id, zone_name
- Add `updateZoneAssignment()` method for runtime zone changes

### 1.3 Enhanced Heartbeat with Zone Info

**File:** `El Trabajante/src/services/communication/mqtt_client.cpp`

Modify `publishHeartbeat()` (line 371) to include:

```cpp
String payload = "{";
payload += "\"esp_id\":\"" + configManager.getESPId() + "\",";
payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
payload += "\"master_zone_id\":\"" + g_kaiser.master_zone_id + "\",";
payload += "\"ts\":" + String(current_time) + ",";
payload += "\"uptime\":" + String(millis() / 1000) + ",";
payload += "\"heap_free\":" + String(ESP.getFreeHeap()) + ",";
payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
payload += "\"sensor_count\":" + String(sensorManager.getActiveSensorCount()) + ",";
payload += "\"actuator_count\":" + String(actuatorManager.getActiveActuatorCount()) + ",";
payload += "\"zone_assigned\":" + String(g_kaiser.zone_assigned ? "true" : "false");
payload += "}";
```

**Purpose:** God-Kaiser can track which ESP is in which zone, detect new ESPs, and monitor zone health.

## Phase 2: Dynamic Sensor/Actuator Runtime Configuration

### 2.1 Enhanced SensorManager Runtime Config

**File:** `El Trabajante/src/services/sensor/sensor_manager.cpp`

Implement full runtime reconfiguration in `configureSensor()`:

**Logic:**

1. Check if sensor exists on GPIO
2. If exists and GPIO changed → release old GPIO, allocate new GPIO
3. If sensor type changed → destroy old sensor, create new one
4. Update internal registry
5. Save to NVS immediately
6. Publish confirmation via MQTT

**Key additions:**

- `reconfigureSensor(old_gpio, new_config)` - handles GPIO changes
- GPIO conflict detection with GPIOManager
- Graceful sensor teardown before reconfiguration

### 2.2 Enhanced ActuatorManager Runtime Config

**File:** `El Trabajante/src/services/actuator/actuator_manager.cpp`

Implement full runtime reconfiguration in `configureActuator()`:

**Logic:**

1. Check if actuator exists on GPIO
2. If exists → stop actuator safely, release GPIO
3. If GPIO/type changed → create new driver instance
4. Register in new slot
5. Save to NVS immediately
6. Publish confirmation via MQTT

**Safety considerations:**

- Emergency stop before removal
- Cooldown period enforcement
- Critical actuator protection (cannot be removed while active)

### 2.3 MQTT Config Handler Updates

**File:** `El Trabajante/src/main.cpp` (MQTT callback)

Update existing `handleSensorConfig()` and `handleActuatorConfig()` callbacks:

**Current behavior:** Configure sensors/actuators (requires inspection of current implementation)

**New behavior:**

- Support full reconfiguration (GPIO change, type change)
- Parse `"action"` field: `"add"`, `"update"`, `"remove"`
- Send detailed acknowledgment (success/failure per sensor/actuator)
- No reboot required

**Example payload:**

```json
{
  "esp_id": "ESP_AB12CD",
  "action": "update",
  "sensors": [{
    "gpio": 4,
    "new_gpio": 5,  // Optional: GPIO reallocation
    "sensor_type": "temp_ds18b20",
    "sensor_name": "Temperature A",
    "subzone_id": "section_A",
    "active": true
  }]
}
```

## Phase 3: ESP Discovery & Auto-Registration

### 3.1 Enhanced Initial Heartbeat

**File:** `El Trabajante/src/main.cpp`

After MQTT connection (around line 175), send initial registration heartbeat:

```cpp
if (mqttClient.connect(mqtt_config)) {
  LOG_INFO("MQTT connected!");
  
  // Send initial registration heartbeat immediately
  mqttClient.publishHeartbeat();
  
  // Subscribe to topics
  // ...
}
```

**Purpose:** God-Kaiser detects new ESP via this first heartbeat.

### 3.2 Zone Assignment MQTT Handler

**File:** `El Trabajante/src/main.cpp` (MQTT callback)

Add new MQTT subscription and handler for zone assignment:

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

**Payload:**

```json
{
  "esp_id": "ESP_AB12CD",
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse",
  "zone_name": "Greenhouse Zone 1",
  "kaiser_id": "kaiser_01"
}
```

**Handler logic:**

1. Validate payload
2. Update `g_kaiser` structure
3. Save to NVS via `configManager.saveZoneConfig()`
4. Send acknowledgment
5. Update system state to `STATE_ZONE_CONFIGURED`

### 3.3 Discovery Handshake Flow

**ESP Side:**

1. ESP boots, connects to WiFi/MQTT
2. Sends heartbeat with `zone_assigned: false`
3. Waits for zone assignment from God-Kaiser
4. Receives zone assignment via MQTT
5. Saves zone config, sends ACK
6. Continues to operational state

**God-Kaiser Side (for reference, not in this codebase):**

1. Receives heartbeat from unknown ESP
2. Creates ESP record in database
3. Applies zone assignment rules (or prompts user)
4. Sends zone assignment via MQTT
5. Waits for ACK
6. Sends sensor/actuator configs if any

## Phase 4: Live Config Persistence & Recovery

### 4.1 Immediate NVS Writes

**Files:** `SensorManager`, `ActuatorManager`, `ConfigManager`

**Current behavior:** Some configs saved to NVS, some only in RAM

**New behavior:**

- Every config change immediately persisted to NVS
- ConfigManager provides transactional writes
- Rollback on failure

**Implementation:**

- `configManager.saveSensorConfig()` called after every sensor change
- `configManager.saveActuatorConfig()` called after every actuator change
- `configManager.saveZoneConfig()` called after zone assignment

### 4.2 Config Acknowledgment Protocol

**File:** `El Trabajante/src/main.cpp`

Standardize all config ACKs:

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config/ack`

**Payload:**

```json
{
  "esp_id": "ESP_AB12CD",
  "action": "sensor_update",
  "success": true,
  "changes": [
    {"gpio": 4, "status": "updated"},
    {"gpio": 5, "status": "failed", "error": "GPIO conflict"}
  ],
  "timestamp": 123456789
}
```

## Phase 5: Cross-Zone Logic Support (Foundation)

### 5.1 Sensor/Actuator Zone Metadata

**Files:** Already present in `sensor_types.h`, `actuator_types.h`

**Current:** Both have `subzone_id` field

**Enhancement:** Ensure subzone_id is:

- Included in all MQTT sensor/actuator data publications
- Included in heartbeat summary
- Used in status reports

**Purpose:** God-Kaiser can implement cross-zone logic using zone_id, master_zone_id, and subzone_id.

### 5.2 Zone Info in Sensor Readings

**File:** `El Trabajante/src/services/sensor/sensor_manager.cpp`

Update `buildMQTTPayload()` to include zone context:

```cpp
String buildMQTTPayload(const SensorReading& reading) {
  String payload = "{";
  payload += "\"esp_id\":\"" + configManager.getESPId() + "\",";
  payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
  payload += "\"subzone_id\":\"" + reading.subzone_id + "\",";
  // ... existing sensor data
  payload += "}";
  return payload;
}
```

### 5.3 Zone Info in Actuator Status

**File:** `El Trabajante/src/services/actuator/actuator_manager.cpp`

Update `buildStatusPayload()` to include zone context (similar to sensors).

## Implementation Sequence

1. **Phase 1** (Zone system): Update data structures, ConfigManager, heartbeat
2. **Phase 2** (Runtime config): Enhance SensorManager/ActuatorManager, MQTT handlers
3. **Phase 3** (Discovery): Initial heartbeat, zone assignment handler
4. **Phase 4** (Persistence): NVS writes, ACK protocol
5. **Phase 5** (Cross-zone): Zone metadata in all messages

## Testing Strategy

1. **Zone Assignment**: Boot new ESP, verify zone assigned via MQTT
2. **Runtime Sensor Add**: Add sensor via MQTT, verify no reboot, sensor functional
3. **Runtime GPIO Change**: Change sensor GPIO via MQTT, verify old GPIO released
4. **Runtime Type Change**: Change sensor type, verify new readings
5. **Heartbeat Validation**: Verify zone_id, master_zone_id in heartbeat payload
6. **Multi-ESP Zones**: Multiple ESPs in same zone, verify zone_id consistency

## Files to Modify

### Core Changes

- `El Trabajante/src/models/system_types.h` - Zone structure
- `El Trabajante/src/services/config/config_manager.h/cpp` - Zone persistence
- `El Trabajante/src/services/communication/mqtt_client.cpp` - Heartbeat
- `El Trabajante/src/main.cpp` - MQTT callbacks, zone assignment handler

### Manager Enhancements

- `El Trabajante/src/services/sensor/sensor_manager.h/cpp` - Runtime reconfig
- `El Trabajante/src/services/actuator/actuator_manager.h/cpp` - Runtime reconfig

### Driver Layer (if needed)

- `El Trabajante/src/drivers/gpio_manager.h/cpp` - GPIO reallocation support

## Backward Compatibility

- Existing configs without zone_id continue to work (default to empty)
- Heartbeat compatible with old God-Kaiser (extra fields ignored)
- MQTT handlers support both old and new payload formats

## Success Criteria

- ✅ New ESP auto-registers via MQTT heartbeat
- ✅ God-Kaiser assigns zone, ESP saves to NVS
- ✅ Sensor/actuator added via MQTT, no reboot
- ✅ Sensor GPIO changed via MQTT, no reboot
- ✅ Heartbeat includes zone_id, master_zone_id
- ✅ All sensor/actuator messages include zone metadata
- ✅ Config changes persist across ESP reboots

### To-dos

- [ ] Update zone data structures in system_types.h
- [ ] Extend ConfigManager for zone persistence
- [ ] Add zone info to MQTT heartbeat
- [ ] Implement full runtime sensor reconfiguration
- [ ] Implement full runtime actuator reconfiguration
- [ ] Update MQTT config handlers for full changes
- [ ] Add zone assignment MQTT handler
- [ ] Send initial heartbeat after MQTT connect
- [ ] Ensure immediate NVS writes for all configs
- [ ] Standardize config acknowledgment protocol
- [ ] Add zone info to sensor/actuator messages
- [ ] Test all scenarios (add/remove/reconfig without reboot)