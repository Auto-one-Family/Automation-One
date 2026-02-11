# Wokwi Live Interaction Log - Session 2

> **Date:** 2026-02-11
> **Session:** 08:02 - 08:12 UTC
> **ESP Device:** ESP_00000001 (ESP32-D0WDQ6-V3, Wokwi Simulator)
> **Server:** FastAPI God-Kaiser (http://localhost:8000)
> **MQTT Broker:** Mosquitto 2.0.22 (automationone-mqtt)
> **Focus:** Complete Device Lifecycle from scratch (approval/pending flow)

---

## Pre-Session Setup

| Action | Result |
|--------|--------|
| Delete ESP_00000001 from DB | `DELETE 1`, 0 devices remaining |
| Clear retained MQTT messages | 9 retained messages cleared (zone/ack, will, diagnostics, etc.) |
| Server health check | `ready=true`, DB + MQTT connected |
| JWT authentication | Token obtained for admin user |
| MQTT + Server log monitors | Started in background |

---

## Phase 1: Discovery (Device Auto-Registration)

### 08:02:33 - First Heartbeat (Discovery)
- **MQTT:** `system/heartbeat` - uptime=6, heap=211748, RSSI=-86, zone_assigned=false
- **Server Response:** `system/heartbeat/ack` - `status: "pending_approval"`, `config_available: false`
- **DB:** New record created: `status=pending_approval`, `discovery_source=heartbeat`, `hardware_type=ESP32_WROOM`

### 08:02:33 - Pending API Verification
- **GET** `/v1/esp/devices/pending` -> 1 device
  ```json
  {"device_id":"ESP_00000001","discovered_at":"2026-02-11T08:02:33Z",
   "heap_free":211748,"wifi_rssi":-86,"sensor_count":0,"actuator_count":0,"heartbeat_count":1}
  ```

### Subsequent Heartbeats While Pending
| Heartbeat | Uptime | ACK Status | Notes |
|-----------|--------|------------|-------|
| #1 | 6s | `pending_approval` | Discovery, first registration |
| #2 | 66s | `pending_approval` | GPIO 4 now claimed by OneWire bus |
| #3 | 126s | **`online`** | First heartbeat AFTER approval |

### 08:02:33 - 08:03:59 - ESP Diagnostics While Pending
- `system/diagnostics` at 60s: `system_state: "PENDING_APPROVAL"`, heap=210848, error_count=0
- ESP keeps functioning normally in pending state, just no config pushed

---

## Phase 2: Admin Approval

### 08:03:59 - Approve Device
- **POST** `/v1/esp/devices/ESP_00000001/approve`
- **Payload:** `{"name":"Wokwi Greenhouse Node"}`
- **Response:**
  ```json
  {"success":true,"device_id":"ESP_00000001","status":"approved",
   "approved_by":"admin","approved_at":"2026-02-11T08:03:59.304974Z"}
  ```

### 08:04:35 - Status Transition (approved -> online)
- Next heartbeat after approval: ACK status changed to `"online"`
- **DB confirmed:** `status=online`, `name=Wokwi Greenhouse Node`, `approved_by=admin`

### State Machine Verified
```
[First Heartbeat] -> pending_approval
[Admin Approves]  -> approved (DB only, ESP doesn't know yet)
[Next Heartbeat]  -> online (ESP gets ACK with status=online)
```

---

## Phase 3: Zone Assignment Round-Trip

### First Attempt (08:05:21) - ESP Offline
- **POST** `/v1/zone/devices/ESP_00000001/assign` -> `mqtt_sent: true`
- **Problem:** ESP disconnected (Wokwi stopped) before receiving message
- **DB:** `zone_id=greenhouse` set optimistically, but ESP never ACK'd
- **FINDING:** No zone/ack received, `pending_zone_assignment` NOT persisted (see Bug 4)

### ESP Reboot (08:10:39)
- Fresh boot: `zone_assigned=false`, `zone_id=""`
- **Server Warning:** `ZONE_MISMATCH [ESP_00000001]: ESP reports no zone but DB has zone_id='greenhouse'`
- Server correctly detects DB/ESP inconsistency

### Second Attempt (08:11:21) - ESP Online - SUCCESS!
- **POST** `/v1/zone/devices/ESP_00000001/assign` -> `mqtt_sent: true`
- **MQTT Sequence:**
  ```
  1. Server -> ESP: zone/assign {"zone_id":"greenhouse","master_zone_id":"main","zone_name":"Gewaechshaus"}
  2. ESP -> Server: zone/ack   {"status":"zone_assigned","zone_id":"greenhouse","master_zone_id":"main"}
  3. ESP -> Server: heartbeat  {"zone_id":"greenhouse","zone_assigned":true,"state":6}
  4. Server -> ESP: heartbeat/ack {"status":"online"}
  ```
- **Full round-trip verified in < 1 second**

---

## Phase 4: Debug Commands

### Diagnostics (08:11:28)
- **Command:** `{"command":"diagnostics","params":{}}`
- **Response:** SUCCESS
  ```json
  {"state":6,"uptime":98,"heap_free":208060,"zone_id":"greenhouse",
   "zone_assigned":true,"sensor_count":0,"actuator_count":1,"boot_count":1}
  ```

### Set Log Level - Flat Format (08:11:36)
- **Command:** `{"command":"set_log_level","level":"DEBUG"}`
- **Response:** SUCCESS - `{"level":"DEBUG","message":"Log level changed to DEBUG"}`

### Set Log Level - Params Format (08:11:47) - BUG CONFIRMED
- **Command:** `{"command":"set_log_level","params":{"level":"INFO"}}`
- **Response:** FAILED
  ```json
  {"success":false,"error":"Invalid log level","requested_level":"NULL"}
  ```
- ESP reads only top-level `level` key, ignores `params` object

---

## Phase 5: Actuator Configuration & Control

### Actuator Config (08:11:58)
- **Config:** `{"type":"full","actuators":[{"gpio":5,"type":"relay","name":"Bewaesserung","subzone_id":"zone_a"}]}`
- **Response:** SUCCESS - 1 actuator configured
- **Status:** `gpio:5, type:relay, state:false, emergency:normal`

### Sensor Config - GPIO Conflict (08:12:12)
- **Config:** `{"sensor_type":"DS18B20","sensor_name":"Boden Temperatur","gpio":4}`
- **Response:** FAILED - `GPIO_CONFLICT: GPIO 4 already used by bus/onewire/4 (OneWireBus)`
- OneWire bus claims GPIO 4 during boot scan, blocks dynamic sensor config

### Actuator ON (08:12:23)
- **Command:** `{"command":"ON","value":1.0,"duration":15,"correlation_id":"session2_cmd_001"}`
- **Response:** SUCCESS - `state:true, pwm:255, runtime_ms:0`

### Broadcast Emergency Stop (08:12:32)
- **MQTT:** `kaiser/broadcast/emergency` -> `{"action":"stop_all","reason":"Session 2 global emergency test"}`
- **Alert:** `{"alert_type":"emergency_stop","message":"Actuator stopped"}`
- Broadcast emergency correctly stopped all actuators

### Final Diagnostics (08:12:47)
- **State:** uptime=177, heap=207620, zone_assigned=true, sensor_count=0, actuator_count=1
- **Error count:** 1 (from GPIO conflict attempt)
- **System state:** `ZONE_CONFIGURED`

---

## System State at Session End

| Component | Status | Change |
|-----------|--------|--------|
| ESP_00000001 | **online** | Full lifecycle: deleted -> discovered -> pending -> approved -> online |
| Zone | `greenhouse` (Gewaechshaus) | Assigned, ACK'd, confirmed in heartbeat |
| Master Zone | `main` | Assigned with zone |
| Actuators | 1 (GPIO 5 Relay "Bewaesserung") | Configured, ON/OFF/Emergency tested |
| Sensors | 0 | Config failed - GPIO conflict with OneWire bus |
| Log Level | INFO | Was DEBUG temporarily |
| Emergency | Tested broadcast + alert | Working correctly |
| Uptime | 177s | Fresh boot during session |
| Heap | 207620 free (min: 198652) | Stable |
| WiFi RSSI | -87 dBm | Wokwi simulated weak signal |

---

## Bug Findings

### BUG 1: `set_log_level` ignores `params` object (CONFIRMED from Session 1)
- **Severity:** Medium
- **Location:** ESP32 firmware `main.cpp` system command handler
- **Expected:** `{"command":"set_log_level","params":{"level":"DEBUG"}}` should work
- **Actual:** Only `{"command":"set_log_level","level":"DEBUG"}` (top-level) works
- **Response:** `requested_level: "NULL"` when using `params` format

### BUG 2: Sensor config GPIO conflict with OneWire bus (CONFIRMED from Session 1)
- **Severity:** Medium
- **Location:** ESP32 firmware GPIO manager / config handler
- **Error:** `GPIO_CONFLICT: GPIO 4 already used by bus/onewire/4 (OneWireBus)`
- **Impact:** Cannot dynamically configure sensors on GPIOs already claimed by OneWire bus at boot

### BUG 3: ZONE_MISMATCH not auto-resolved (NEW)
- **Severity:** Low
- **Location:** `heartbeat_handler.py`
- **Behavior:** Server detects DB has zone but ESP reports no zone (after reboot), logs WARNING but does NOT automatically re-send zone assignment
- **Expected:** Server should re-send `zone/assign` when mismatch detected
- **Impact:** Admin must manually re-assign zone after ESP reboot

### BUG 4: SQLAlchemy JSON mutation tracking - `pending_zone_assignment` (NEW)
- **Severity:** High
- **Location:** `zone_service.py:140`, `zone_ack_handler.py:135-152`
- **Root Cause:** `device_metadata` column uses plain `JSON` type without `MutableDict`. SQLAlchemy doesn't detect in-place dict mutations.
- **Evidence:** After zone assignment, `pending_zone_assignment` is NOT in DB despite code setting it at line 140
- **Impact:** Zone assignment tracking is broken - `pending_zone_assignment` is never persisted, never deleted
- **Comparison:** `esp_repo.py` correctly uses `flag_modified(device, "device_metadata")` for simulation metadata (7 instances)
- **Files needing fix:**
  - `zone_service.py:140` (SET) - add `flag_modified(device, "device_metadata")`
  - `zone_service.py:229,308` (DELETE) - add `flag_modified(device, "device_metadata")`
  - `zone_ack_handler.py:136,152` (DELETE) - add `flag_modified(device, "device_metadata")`

### BUG 5: Retained LWT not cleared on reconnect (CONFIRMED from Session 1)
- **Severity:** Medium
- **Location:** `heartbeat_handler.py`
- **Behavior:** `system/will` retained message persists after ESP reconnects
- **Impact:** MQTT subscribers see stale "offline" message alongside live heartbeats

---

## Successful Operations Summary

| Operation | Method | Result | Latency |
|-----------|--------|--------|---------|
| Auto-Discovery | MQTT Heartbeat | Device registered as pending_approval | Instant |
| Pending List | REST GET | Device shown with health metrics | 18.7ms |
| Admin Approval | REST POST | Status -> approved | Instant |
| Online Transition | MQTT Heartbeat | approved -> online on next heartbeat | ~60s (heartbeat interval) |
| Zone Assignment | REST + MQTT | Full round-trip with ACK | < 1s |
| Zone Mismatch Detection | Heartbeat Handler | WARNING logged | Instant |
| Diagnostics | MQTT Command | Full hardware + config info | < 1s |
| Set Log Level (flat) | MQTT Command | Level changed successfully | < 1s |
| Actuator Config | MQTT Config | Relay configured on GPIO 5 | < 1s |
| Actuator ON | MQTT Command | Relay turned on with correlation_id | < 1s |
| Broadcast Emergency | MQTT Broadcast | All actuators stopped, alert raised | < 1s |

---

## Complete State Machine (Verified)

```
[New Device Heartbeat]
        |
  pending_approval <-> [Heartbeats continue, ACK says "pending_approval"]
        |
  [Admin POST /approve]
        |
     approved (DB only - ESP still thinks "pending_approval")
        |
  [Next Heartbeat - ACK now says "online"]
        |
      online <-> [Heartbeats every ~60s]
        |                    |
  [Zone Assign]      [No heartbeat 5min+]
        |                    |
  zone/ack received     offline (via LWT or maintenance)
        |
  [ESP Reboot - NVS zone lost]
        |
  ZONE_MISMATCH warning (not auto-resolved)
```

---

## MQTT Commands Reference (All Tested)

| Command Topic | Payload | Works |
|--------------|---------|-------|
| `system/command` diagnostics | `{"command":"diagnostics","params":{}}` | YES |
| `system/command` set_log_level (flat) | `{"command":"set_log_level","level":"DEBUG"}` | YES |
| `system/command` set_log_level (params) | `{"command":"set_log_level","params":{"level":"DEBUG"}}` | **NO** (Bug 1) |
| `config` (actuator) | `{"type":"full","actuators":[...],"sensors":[]}` | YES |
| `config` (sensor on OneWire GPIO) | `{"type":"sensor","sensors":[{"gpio":4,...}]}` | **NO** (Bug 2) |
| `actuator/{gpio}/command` ON | `{"command":"ON","value":1.0,"duration":15}` | YES |
| `broadcast/emergency` | `{"action":"stop_all","reason":"..."}` | YES |
| `zone/assign` (via REST) | `{"zone_id":"...","zone_name":"..."}` | YES |
