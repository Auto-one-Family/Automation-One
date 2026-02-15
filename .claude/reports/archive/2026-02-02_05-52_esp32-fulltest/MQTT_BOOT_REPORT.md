# MQTT Debug Report - BOOT Sequence

> **Session:** 2026-02-02_05-52_esp32-fulltest
> **Modus:** BOOT
> **Analysiert:** 2026-02-02
> **Traffic-Log:** `logs/current/mqtt_traffic.log`

---

## 1. Executive Summary

| Aspekt | Status |
|--------|--------|
| **MQTT Broker** | NOT RUNNING (currently offline) |
| **Captured Traffic** | 29 Messages (from previous session) |
| **Zone Assignment** | NO zone/assign messages observed |
| **Heartbeat Flow** | WORKING (ESP_472204 active) |
| **Overall Health** | PARTIAL - Broker requires restart |

---

## 2. Infrastructure Status

### 2.1 Mosquitto Broker

| Check | Result |
|-------|--------|
| mosquitto_sub.exe | FOUND at `C:\Program Files\mosquitto\` |
| Port 1883 listening | NO (broker not running) |
| mosquitto.exe process | NOT FOUND in task list |

**Recommendation:** Start Mosquitto broker before continuing debug session.

```cmd
# To start broker:
cd "C:\Program Files\mosquitto"
mosquitto.exe -c mosquitto.conf -v
```

### 2.2 Previous MQTT Capture

Session had active capture (PID: 328164 per STATUS.md), but broker is currently offline.

---

## 3. Message Flow Analysis (Captured Traffic)

### 3.1 Device Overview

| ESP ID | Messages | Status |
|--------|----------|--------|
| ESP_00000001 | 6 | Last Will (offline), Actuator responses |
| ESP_D0B19C | 1 | Last Will (offline) |
| ESP_472204 | 21 | Active (heartbeats + diagnostics) |
| Broadcast | 1 | Emergency stop command |

### 3.2 Message Flow Table

| # | Topic | Direction | Status | Notes |
|---|-------|-----------|--------|-------|
| 1 | `.../ESP_00000001/system/will` | ESP->Broker | LWT | Device disconnected unexpectedly |
| 2 | `.../ESP_00000001/system/command/response` | ESP->Server | OK | OneWire scan: 0 devices found |
| 3 | `.../ESP_00000001/onewire/scan_result` | ESP->Server | OK | Empty devices array |
| 4 | `.../ESP_00000001/actuator/5/response` | ESP->Server | FAILED | `success: false` |
| 5 | `.../ESP_00000001/actuator/26/response` | ESP->Server | OK | OFF command successful |
| 6 | `.../ESP_00000001/actuator/13/response` | ESP->Server | FAILED | `success: false` |
| 7 | `.../ESP_D0B19C/system/will` | ESP->Broker | LWT | Device disconnected |
| 8 | `.../ESP_472204/system/will` | ESP->Broker | LWT | Device disconnected |
| 9 | `kaiser/broadcast/emergency` | Server->ALL | OK | Emergency stop issued |
| 10 | `.../ESP_472204/system/will` | ESP->Broker | LWT | Second disconnect |
| 11-28 | `.../ESP_472204/system/heartbeat` | ESP->Server | OK | 9 heartbeats captured |
| 11-28 | `.../ESP_472204/system/heartbeat/ack` | Server->ESP | OK | All ACKed |
| 13,24 | `.../ESP_472204/system/diagnostics` | ESP->Server | OK | 2 diagnostic reports |

### 3.3 Heartbeat Sequence Detail (ESP_472204)

| Time (ts) | Uptime (s) | heap_free | wifi_rssi | ACK Status |
|-----------|------------|-----------|-----------|------------|
| 1770008158 | 8 | 210940 | -59 | pending_approval |
| 1770008218 | 68 | 209848 | -53 | pending_approval |
| 1770008278 | 129 | 207924 | -59 | pending_approval |
| 1770008338 | 189 | 207924 | -61 | pending_approval |
| 1770008398 | 249 | 208060 | -59 | pending_approval |
| 1770008458 | 309 | 208060 | -53 | **online** |
| 1770008518 | 369 | 209848 | -67 | online |
| 1770008578 | 429 | 209848 | -53 | online |

**Observation:** Device transitioned from `pending_approval` to `online` after ~5 minutes (309s uptime).

---

## 4. Zone Assignment Analysis

### 4.1 Expected Zone Flow

Per STATUS.md Phase 4, the expected sequence is:

```
1. Server->ESP: kaiser/god/esp/{esp_id}/zone/assign
2. ESP->Server: kaiser/god/esp/{esp_id}/zone/ack
```

### 4.2 Observed Zone Messages

| Topic Pattern | Count | Status |
|---------------|-------|--------|
| `zone/assign` | 0 | NOT OBSERVED |
| `zone/ack` | 0 | NOT OBSERVED |
| `subzone/*` | 0 | NOT OBSERVED |

### 4.3 Zone Status in Heartbeats

All captured heartbeats show:
```json
{
  "zone_id": "",
  "master_zone_id": "",
  "zone_assigned": false
}
```

**Finding:** ESP_472204 is **NOT assigned to any zone**. No zone assignment messages were sent by the server during the capture period.

---

## 5. Payload Validation

### 5.1 Heartbeat Payload (ESP_472204)

| Field | Expected | Observed | Valid |
|-------|----------|----------|-------|
| `esp_id` | string | "ESP_472204" | YES |
| `ts` | int (unix) | 1770008158 | YES |
| `uptime` | int | 8-429 | YES |
| `heap_free` | int | 207924-210940 | YES |
| `wifi_rssi` | int (dBm) | -53 to -67 | YES |
| `zone_id` | string | "" | YES (empty = unassigned) |
| `zone_assigned` | bool | false | YES |
| `gpio_status` | array | Present | YES |
| `config_status` | object | Present | YES |

### 5.2 Heartbeat ACK Payload

| Field | Expected | Observed | Valid |
|-------|----------|----------|-------|
| `status` | string | "pending_approval"/"online" | YES |
| `config_available` | bool | false | YES |
| `server_time` | int (unix) | Present | YES |

### 5.3 Actuator Response Payloads

| ESP | GPIO | Command | Success | Issue |
|-----|------|---------|---------|-------|
| ESP_00000001 | 5 | ON | false | "Command failed" |
| ESP_00000001 | 26 | OFF | true | None |
| ESP_00000001 | 13 | OFF | false | "Command failed" |

**Anomaly:** 2 of 3 actuator commands failed on ESP_00000001.

### 5.4 Emergency Broadcast Payload

```json
{
  "command": "EMERGENCY_STOP",
  "reason": "Phase 2 Test",
  "issued_by": "Robin",
  "timestamp": "2026-01-30T03:42:17.420950+00:00",
  "devices_stopped": 1,
  "actuators_stopped": 3
}
```

All required fields present. Valid JSON.

---

## 6. Timing Analysis

### 6.1 Heartbeat Interval

| Metric | Value |
|--------|-------|
| Expected Interval | 60s |
| Observed Intervals | 60s (consistent) |
| Status | CORRECT |

### 6.2 ACK Response Time

Cannot calculate precisely without timestamps on messages, but all heartbeats received corresponding ACKs in the log sequence (no missing ACKs).

### 6.3 Diagnostics Interval

| Metric | Value |
|--------|-------|
| Diagnostic 1 | uptime: 60s |
| Diagnostic 2 | uptime: 360s |
| Interval | 300s (5 min) |
| Status | EXPECTED |

---

## 7. Issues Found

### 7.1 Critical Issues

| ID | Issue | Severity | Topic |
|----|-------|----------|-------|
| C1 | MQTT Broker not running | HIGH | Infrastructure |
| C2 | No zone/assign messages observed | MEDIUM | Zone Flow |

### 7.2 Warnings

| ID | Issue | Severity | Topic |
|----|-------|----------|-------|
| W1 | 2/3 actuator commands failed | MEDIUM | ESP_00000001 |
| W2 | ESP_00000001 disconnected unexpectedly (LWT) | LOW | Device |
| W3 | ESP_D0B19C disconnected unexpectedly (LWT) | LOW | Device |
| W4 | ESP_472204 double LWT (restart?) | LOW | Device |

### 7.3 Malformed Payloads

None detected. All payloads are valid JSON with expected fields.

---

## 8. Validation Checklist

### Boot Sequence (per STATUS.md)

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| Boot Banner | ESP32 Serial | N/A (MQTT only) | - |
| WiFi Connected | ESP32 Serial | wifi_rssi in heartbeats | INFERRED |
| MQTT Connected | Heartbeats arrive | YES | PASS |
| Heartbeat sent | ESP->Server | YES (9x) | PASS |
| Heartbeat ACK | Server->ESP | YES (9x) | PASS |
| Device Online | ACK status=online | YES (after 5 min) | PASS |

### Zone Assignment Flow

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| zone/assign sent | Server->ESP | NO | FAIL |
| zone/ack response | ESP->Server | NO | N/A |
| zone_id in heartbeat | Non-empty | "" (empty) | EXPECTED (no assign) |

---

## 9. Recommendations

1. **Start MQTT Broker**
   ```cmd
   cd "C:\Program Files\mosquitto"
   .\mosquitto.exe -c mosquitto.conf -v
   ```

2. **Start ESP32 device** to generate new heartbeat traffic

3. **Trigger Zone Assignment** via server/frontend to observe zone/assign flow

4. **Investigate Actuator Failures** on ESP_00000001 (GPIO 5, 13)

5. **Re-run MQTT capture** with:
   ```cmd
   "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/#" -v >> logs\current\mqtt_traffic.log
   ```

---

## 10. Appendix: Topic Schema Reference

### Observed Topics

| Topic Pattern | Count | Schema Match |
|---------------|-------|--------------|
| `kaiser/god/esp/+/system/will` | 4 | YES |
| `kaiser/god/esp/+/system/heartbeat` | 9 | YES |
| `kaiser/god/esp/+/system/heartbeat/ack` | 9 | YES |
| `kaiser/god/esp/+/system/diagnostics` | 2 | YES |
| `kaiser/god/esp/+/system/command/response` | 1 | YES |
| `kaiser/god/esp/+/onewire/scan_result` | 1 | YES |
| `kaiser/god/esp/+/actuator/+/response` | 3 | YES |
| `kaiser/broadcast/emergency` | 1 | YES |

All observed topics match the expected schema from `.claude/reference/api/MQTT_TOPICS.md`.

---

*Generated by MQTT_DEBUG_AGENT*
*Session: 2026-02-02_05-52_esp32-fulltest*
