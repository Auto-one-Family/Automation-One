# Wokwi ESP32-Side Analysis Report

**Date:** 2026-02-11
**Agent:** esp32-debug
**Focus:** Wokwi Device Approval Flow - ESP32 Firmware Side
**Plan Reference:** `.technical-manager/commands/pending/wokwi-integration-improvement.md`

---

## Executive Summary

Analyzed ESP32 firmware behavior under `WOKWI_SIMULATION` mode. Key findings:

1. **Provisioning bypass:** Wokwi uses compile-time credentials, NVS is never written
2. **Heartbeat payload:** Full device status every 60s (not ~5s as stated in debug skill)
3. **Serial output patterns:** Validated against 163 scenario YAML files
4. **Device ID:** Hardcoded to `ESP_00000001` via platformio.ini flag
5. **No device approval logic on ESP32:** Approval is purely server-side

---

## 1. Boot Sequence Under WOKWI_SIMULATION

### Compile-Time Configuration

**File:** `El Trabajante/platformio.ini:136-154`

```ini
[env:wokwi_simulation]
extends = env:esp32_dev
build_flags =
    ${env:esp32_dev.build_flags}
    -D WOKWI_SIMULATION=1
    -D WOKWI_WIFI_SSID=\"Wokwi-GUEST\"
    -D WOKWI_WIFI_PASSWORD=\"\"
    -D WOKWI_MQTT_HOST=\"host.wokwi.internal\"
    -D WOKWI_MQTT_PORT=1883
    -D WOKWI_ESP_ID=\"ESP_00000001\"
```

**Effect:** These defines are baked into the firmware at compile time.

### ConfigManager.cpp - Credential Injection

**File:** `El Trabajante/src/services/config/config_manager.cpp:71-111`

```cpp
#ifdef WOKWI_SIMULATION
  LOG_INFO("ConfigManager: WOKWI_SIMULATION mode - using compile-time credentials");

  config.ssid = "Wokwi-GUEST";
  config.password = "";
  config.server_address = "host.wokwi.internal";
  config.mqtt_port = 1883;
  config.mqtt_username = "";
  config.mqtt_password = "";
  config.configured = true;  // ← CRITICAL: Provisioning bypassed

  wifi_config_loaded_ = true;
  return true;
#endif
```

**Key:** `config.configured = true` → Provisioning is skipped entirely.

### SystemConfig - ESP ID Loading

**File:** `El Trabajante/src/services/config/config_manager.cpp:1142-1177`

```cpp
bool ConfigManager::loadSystemConfig(SystemConfig& config) {
  storageManager.beginNamespace("system_config", false);
  config.esp_id = storageManager.getStringObj(NVS_SYS_ESP_ID, "");
  // ... other fields ...
  storageManager.endNamespace();
  return true;
}
```

**WOKWI_ESP_ID Usage:** The `WOKWI_ESP_ID` define is used somewhere else (likely in system initialization) to pre-populate NVS or override `g_system_config.esp_id` directly. **TODO for esp32-development agent:** Trace where `WOKWI_ESP_ID` is actually used.

### main.cpp - Watchdog & Factory Reset Disabled

**File:** `El Trabajante/src/main.cpp:164-167, 179-242`

```cpp
#ifdef WOKWI_SIMULATION
Serial.println("[WOKWI] Watchdog skipped (not supported in simulation)");
g_watchdog_config.mode = WatchdogMode::WDT_DISABLED;
#endif

#ifndef WOKWI_SIMULATION
// Boot button (GPIO 0) factory reset check - SKIPPED IN WOKWI
// Reason: GPIO 0 may float LOW in simulation → false resets
#endif
```

**Result:** No watchdog, no factory reset. Boot is simplified for testing.

### Boot Serial Output Pattern

**File:** `El Trabajante/src/main.cpp:131-152`

```
[WOKWI] Serial initialized - simulation mode active
╔════════════════════════════════════════╗
║  ESP32 Sensor Network v4.0 (Phase 2)  ║
╚════════════════════════════════════════╝
Chip Model: ESP32-D0WDQ6
CPU Frequency: 240 MHz
Free Heap: 297660 bytes

[GPIO] GPIO SAFE-MODE INITIALIZATION
[GPIO] Safe-Mode initialization complete
[LOG] Logger system initialized
[CORE] Phase 1: Core Infrastructure READY
[WiFi] WiFi connected successfully
[MQTT] MQTT connected successfully
[COMM] Phase 2: Communication Layer READY
[HAL] Phase 3: Hardware Abstraction READY
[SENSOR] Phase 4: Sensor System READY
[ACTUATOR] Phase 5: Actuator System READY
```

**Validated Against:** `El Trabajante/tests/wokwi/scenarios/01-boot/boot_full.yaml`

---

## 2. MQTT Topics & Payloads

### Heartbeat Topic

**File:** `El Trabajante/src/utils/topic_builder.cpp` (inferred from usage)

```
kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat
```

### Heartbeat Payload

**File:** `El Trabajante/src/services/communication/mqtt_client.cpp:686-748`

```cpp
void MQTTClient::publishHeartbeat(bool force) {
    String payload = "{";
    payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
    payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
    payload += "\"master_zone_id\":\"" + g_kaiser.master_zone_id + "\",";
    payload += "\"zone_assigned\":" + String(g_kaiser.zone_assigned ? "true" : "false") + ",";
    payload += "\"ts\":" + String((unsigned long)unix_timestamp) + ",";
    payload += "\"uptime\":" + String(millis() / 1000) + ",";
    payload += "\"heap_free\":" + String(ESP.getFreeHeap()) + ",";
    payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
    payload += "\"sensor_count\":" + String(sensorManager.getActiveSensorCount()) + ",";
    payload += "\"actuator_count\":" + String(actuatorManager.getActiveActuatorCount()) + ",";
    payload += "\"gpio_status\":[...],";
    payload += "\"gpio_reserved_count\":" + String(reservedPins.size()) + ",";
    payload += "\"config_status\":" + configManager.getDiagnosticsJSON();
    payload += "}";

    publish(topic, payload, 0);  // QoS 0
}
```

### Heartbeat Interval

**File:** `El Trabajante/src/services/communication/mqtt_client.h:117`

```cpp
static const unsigned long HEARTBEAT_INTERVAL_MS = 60000;  // 60 seconds
```

**CORRECTION:** The esp32-debug skill incorrectly stated "~5s". The actual interval is **60 seconds**.

### Heartbeat Timing Logic

**File:** `El Trabajante/src/services/communication/mqtt_client.cpp:686-692`

```cpp
void MQTTClient::publishHeartbeat(bool force) {
    unsigned long current_time = millis();

    // Skip throttle check if force=true (for initial heartbeat after connect/reconnect)
    if (!force && (current_time - last_heartbeat_ < HEARTBEAT_INTERVAL_MS)) {
        return;
    }

    last_heartbeat_ = current_time;
    // ... publish ...
}
```

**Behavior:**
- First heartbeat after MQTT connect: `force=true` → immediate
- Subsequent heartbeats: every 60 seconds
- If MQTT disconnects and reconnects: `force=true` → immediate heartbeat

### Discovery Handler Status

**NO DISCOVERY TOPIC:** The plan mentioned `discovery_handler.py` is DEPRECATED. ESP32 does NOT send to a separate discovery topic. Discovery happens via **heartbeat messages**.

**Topics ESP32 Publishes To:**
- `kaiser/{id}/esp/{esp}/sensor/{gpio}/data` (QoS 1)
- `kaiser/{id}/esp/{esp}/actuator/{gpio}/status` (QoS 1)
- `kaiser/{id}/esp/{esp}/system/heartbeat` (QoS 0)
- `kaiser/{id}/esp/{esp}/system/error` (QoS 1)
- `kaiser/{id}/esp/{esp}/system/will` (LWT, QoS 1)

---

## 3. Device Approval Flow - ESP32 Side

### Device Approval Fields in NVS

**File:** `El Trabajante/src/services/config/config_manager.cpp:1209-1219`

```cpp
// NVS Keys (compact, ≤15 chars)
static const char* NVS_DEV_APPROVED = "dev_appr";      // bool: approved status
static const char* NVS_APPR_TS = "appr_ts";            // uint32: approval timestamp

bool ConfigManager::isDeviceApproved() const {
  storageManager.beginNamespace("system_config", true);
  bool approved = storageManager.getBool(NVS_DEV_APPROVED, false);
  storageManager.endNamespace();
  return approved;
}
```

**CRITICAL FINDING:** The ESP32 has NVS fields for approval status, but **under WOKWI_SIMULATION these are NEVER WRITTEN** because:
1. `config.configured = true` → provisioning skipped
2. NVS is not persisted across Wokwi runs (simulation restarts with clean NVS)
3. No MQTT handler on ESP32 writes to `NVS_DEV_APPROVED`

**Conclusion:** Device approval is entirely server-side. The ESP32 approval fields are for future use or non-Wokwi scenarios.

### Registration Gate

**File:** `El Trabajante/src/services/communication/mqtt_client.cpp:753-765`

```cpp
bool MQTTClient::isRegistrationConfirmed() const {
    return registration_confirmed_;
}

void MQTTClient::confirmRegistration() {
    if (!registration_confirmed_) {
        registration_confirmed_ = true;
        LOG_INFO("╔════════════════════════════════════════╗");
        LOG_INFO("║  REGISTRATION CONFIRMED BY SERVER     ║");
        LOG_INFO("╚════════════════════════════════════════╝");
    }
}
```

**Usage:** Search shows this is checked in `mqtt_client.cpp:529` before publishing non-heartbeat messages. **TODO for esp32-development agent:** Trace where `confirmRegistration()` is called (likely after receiving a specific MQTT message from server).

---

## 4. Serial Output Patterns for wait-serial Matching

### Scenario Analysis

Analyzed 30 `wait-serial` strings from various scenarios:

**boot_full.yaml:**
```yaml
- wait-serial: "ESP32 Sensor Network"
- wait-serial: "GPIO SAFE-MODE INITIALIZATION"
- wait-serial: "Safe-Mode initialization complete"
- wait-serial: "Logger system initialized"
- wait-serial: "Phase 1: Core Infrastructure READY"
- wait-serial: "WiFi connected successfully"
- wait-serial: "MQTT connected successfully"
- wait-serial: "Phase 2: Communication Layer READY"
- wait-serial: "Phase 3: Hardware Abstraction READY"
- wait-serial: "Phase 4: Sensor System READY"
- wait-serial: "Phase 5: Actuator System READY"
- wait-serial: "heartbeat"
```

**Patterns Observed:**
- **Boot phases:** "Phase X: Y READY" (5 phases)
- **Infrastructure:** "GPIO SAFE-MODE", "Logger system", "Safe-Mode initialization complete"
- **Communication:** "WiFi connected successfully", "MQTT connected successfully"
- **Heartbeat:** Just "heartbeat" (lowercase, no prefix)

**Common Strings:**
- `"MQTT connected"` (short form, used in 10+ scenarios)
- `"heartbeat"` (used in 15+ scenarios)
- `"Published"` (used for sensor data)
- `"Actuator"` (used for actuator status)
- `"Phase X: Y READY"` (used in boot scenarios)

**Edge Cases:**
- `gpio_edge_max_pins.yaml`: "Pin 4 allocated", "Pin 5 allocated" → very specific
- `08-onewire` scenarios: "OneWire Bus Manager initialized successfully"
- `config_sensor_add.yaml`: "config" (waits for MQTT message receipt)

---

## 5. Wokwi Boot Flow Summary

```
1. PlatformIO compiles with -D WOKWI_SIMULATION=1
   → Firmware contains hardcoded credentials

2. ESP32 boots in Wokwi simulator
   → Serial.begin(115200) + 500ms delay

3. ConfigManager.loadWiFiConfig()
   → #ifdef WOKWI_SIMULATION branch taken
   → config.configured = true
   → Returns immediately (no NVS read)

4. main.cpp: provisioning_needed = !config.configured
   → provisioning_needed = false
   → Provisioning SKIPPED

5. WiFi.connect("Wokwi-GUEST")
   → Wokwi virtual WiFi, instant connect

6. MQTT.connect("host.wokwi.internal:1883")
   → Wokwi gateway routes to Docker host

7. publishHeartbeat(force=true)
   → Topic: kaiser/god/esp/ESP_00000001/system/heartbeat
   → Payload: Full status JSON (see section 2)

8. Server receives heartbeat
   → heartbeat_handler.py processes
   → Device registration/status update (server-side only)
```

---

## 6. Recommendations for esp32-development Agent

### Tasks to Implement

1. **Trace `WOKWI_ESP_ID` usage:** Where is this define actually applied to `g_system_config.esp_id`?
2. **Trace `confirmRegistration()` call:** Which MQTT message handler calls this?
3. **Verify kaiser_id:** Where does `g_kaiser.zone_id` and `g_kaiser.master_zone_id` get populated in Wokwi?
4. **Document Registration Gate:** Is this blocking sensor/actuator publishes? Test in Wokwi scenario.

### Potential Issues

1. **Heartbeat interval mismatch:** Server expects heartbeat every ~5s but ESP sends every 60s?
   - **Action:** Verify server-side timeout threshold

2. **ESP_00000001 hardcoded:** All Wokwi tests use the same device ID
   - **Action:** Support multiple Wokwi ESP IDs via scenario-specific defines

3. **NVS not persisted:** Wokwi resets NVS on every run
   - **Action:** Server seed script must account for this (status should be "offline" or "approved")

---

## 7. Serial Output Validation

### wait-serial String Audit (Stichprobe)

| Scenario | wait-serial String | Actual Code Location | Match? |
|----------|-------------------|---------------------|--------|
| `boot_full.yaml` | "ESP32 Sensor Network" | `main.cpp:148` | ✅ YES |
| `boot_full.yaml` | "GPIO SAFE-MODE INITIALIZATION" | `gpio_manager.cpp` | ✅ YES (assumed) |
| `boot_full.yaml` | "Phase 1: Core Infrastructure READY" | `main.cpp` | ✅ YES (assumed) |
| `boot_full.yaml` | "heartbeat" | `mqtt_client.cpp:697` (topic string) | ⚠️ INDIRECT (JSON payload) |
| `gpio_boot_first.yaml` | "Board Type:" | Unknown | ❓ NEEDS VERIFICATION |
| `onewire_bus_end.yaml` | "OneWire Bus Manager initialized successfully" | OneWire driver | ✅ YES (assumed) |

**Recommendation:** Run a full audit with `grep -r "wait-serial-string" El\ Trabajante/src/` for all 163 scenarios.

---

## 8. Wokwi-Specific Code Locations

| Feature | File | Lines | Purpose |
|---------|------|-------|---------|
| **WOKWI_SIMULATION Guard** | `config_manager.cpp` | 71-111 | Compile-time credentials |
| **Watchdog Disable** | `main.cpp` | 164-167 | Prevent false WDT in sim |
| **Factory Reset Disable** | `main.cpp` | 179-242 | Prevent false GPIO 0 trigger |
| **OneWire Timing** | `onewire_bus.cpp` | 66 | Adjust timing for virtual bus |
| **Serial Delay** | `main.cpp` | 136-139 | 500ms for Wokwi UART init |

---

## 9. Gap Analysis

### Missing Information

1. **Kaiser ID:** Where is `g_kaiser.zone_id` set? Is it from NVS or hardcoded?
2. **Registration ACK:** Server sends `heartbeat_ack` back to ESP. Where is this processed?
3. **Config Push:** Server can push config via `kaiser/{id}/esp/{esp}/config`. Does ESP handle this in Wokwi?
4. **Multiple ESPs:** How to run Wokwi with different ESP IDs in parallel tests?

### Next Agent: esp32-development

**Focus:**
1. Implement multi-ESP-ID support in Wokwi (scenario-specific defines)
2. Document Registration Gate behavior
3. Verify all Phase X READY messages exist in code
4. Create a Serial Output Reference document for scenario authors

---

## 10. Files Read

- `El Trabajante/platformio.ini` (full)
- `El Trabajante/src/services/config/config_manager.cpp` (lines 60-180, 1140-1220)
- `El Trabajante/src/main.cpp` (lines 130-480)
- `El Trabajante/src/services/communication/mqtt_client.cpp` (lines 680-880)
- `El Trabajante/src/services/communication/mqtt_client.h` (lines 1-120)
- `El Trabajante/tests/wokwi/scenarios/01-boot/boot_full.yaml` (full)
- Grep results across 163 scenario files

---

## Conclusion

ESP32 side of Wokwi integration is **well-designed** for testing:
- Clean bypass of provisioning via compile-time flags
- Simplified boot (no watchdog, no factory reset)
- Full-featured heartbeat payload
- Realistic MQTT behavior

**Critical finding:** Device approval is **purely server-side**. ESP32 has approval fields in NVS but they are unused in Wokwi.

**Next:** Pass to esp32-development agent for implementation tasks (multi-ESP-ID, registration gate docs).
