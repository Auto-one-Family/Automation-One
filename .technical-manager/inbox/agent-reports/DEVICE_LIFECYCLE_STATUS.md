# Device Lifecycle & Resilience - Consolidated Status

**Date:** 2026-02-11 (consolidated from 5 reports, 2026-02-10)
**Source Reports:** phase1-captive-portal-recovery, phase2-db-state-consistency, phase3-wokwi-bypass, server-development-lifecycle, server-debug-resilience
**Agents:** esp32-dev, server-dev, frontend-dev, server-debug, db-inspector, system-control

---

## Executive Summary

The Device Lifecycle Professionalization was a 3-phase TM initiative. **Phases 1-3 are COMPLETE** (2 implemented, 1 was already implemented). However, a deep resilience analysis revealed **12 structural gaps** in cascade deletion, Cross-ESP Logic awareness, multi-config push sequencing, and frontend transparency. These gaps require ~46h of implementation work across 3 priority phases.

| Phase | Status | Summary |
|-------|--------|---------|
| Phase 1: Captive Portal Recovery | DONE | MQTT failure at startup + runtime → Portal re-opens |
| Phase 2: DB State Consistency | DONE | Discovery-Handler fixed, config_status tracking, status guards |
| Phase 3: Wokwi Provisioning Bypass | ALREADY IMPLEMENTED | Compile-time credentials bypass portal automatically |
| Resilience Gaps | ANALYSIS COMPLETE | 12 gaps identified (5 Critical, 4 High, 3 Medium) |

---

## Phase 1: Captive Portal Recovery (DONE)

**Agent:** esp32-dev | **Build:** All 3 environments verified

### What was implemented

1. **MQTT failure at startup → Portal Recovery** (`main.cpp` ~691-750)
   - When `mqttClient.connect()` fails: set `STATE_SAFE_MODE_PROVISIONING`, clear NVS WiFi config, start AP mode
   - LED blink code: 6x = MQTT failure (distinct from WiFi=5x, AP=4x, Init=3x)

2. **Runtime MQTT persistent failure → Portal Recovery** (`main.cpp` ~2023-2055)
   - When Circuit Breaker stays OPEN for 5 continuous minutes (matches server heartbeat timeout)
   - Reboots into provisioning mode

### Error Matrix (all scenarios covered)

| Scenario | Before | After |
|----------|--------|-------|
| WiFi wrong | Portal re-opens (existing) | Unchanged |
| WiFi OK, MQTT port wrong | LOG_WARNING only, ESP stuck | Portal re-opens |
| WiFi OK, Server IP unreachable | LOG_WARNING only, ESP stuck | Portal re-opens |
| WiFi OK, MQTT OK, broker dies at runtime | Infinite Circuit Breaker retry | After 5 min → portal recovery |

### Build Impact

| Environment | Status | RAM | Flash |
|-------------|--------|-----|-------|
| esp32_dev | SUCCESS | 22.4% | 90.3% |
| seeed_xiao_esp32c3 | SUCCESS | 19.5% | 88.6% |
| wokwi_simulation | SUCCESS | 22.4% | 89.6% |

---

## Phase 2: DB State Consistency (DONE)

**Agents:** server-dev, frontend-dev

### What was implemented

1. **Discovery-Handler Approval-Flow** (`discovery_handler.py`)
   - New devices: `status="online"` → `status="pending_approval"` (matching heartbeat-handler behavior)
   - Existing devices: status update only if already `approved` or `online`
   - TM plan incorrectly stated "Heartbeat sets online immediately" — heartbeat was already correct; the real bug was in the legacy Discovery-Handler

2. **Config-Endpoint Status-Guards** (`sensors.py`, `actuators.py`)
   - Guard: `if esp_device.status not in ("approved", "online"): raise 403`
   - Prevents configuration of unapproved devices

3. **Write-after-Verification** (`sensors.py`, `actuators.py`, `config_handler.py`)
   - On create/update: `config_status = "pending"`, error fields cleared
   - On config ACK success: `config_status = "applied"` via new `_mark_config_applied()`
   - On config ACK failure: `config_status = "failed"` with error details

4. **Response-Schemas** (`schemas/sensor.py`, `schemas/actuator.py`)
   - `config_status`, `config_error`, `config_error_detail` added to API responses

5. **Frontend-Types** (`types/index.ts`)
   - `MockSensor`/`MockActuator`: config_status fields added
   - `MockESP.status`: extended with `pending_approval | approved | rejected`

### New State Flows

**Device Lifecycle:**
```
NEW DEVICE (Heartbeat or Discovery) → pending_approval → ADMIN APPROVES → approved → NEXT HEARTBEAT → online
                                                       → ADMIN REJECTS → rejected (5-min cooldown → rediscovery)
```

**Config Lifecycle:**
```
CREATE/UPDATE → pending → ESP ACK success → applied
                        → ESP ACK error → failed (with error details)
                        → ESP ACK partial → applied + failed (per config)
```

### Open follow-up tasks (not blocking)

- Frontend visualization of `config_status` (spinner for pending, error badge for failed)
- `useGpioStatus` should filter configs with `config_status=failed` (GPIOs shown as occupied incorrectly)
- Legacy Discovery-Handler could be fully removed (all ESPs use heartbeat)

---

## Phase 3: Wokwi Provisioning Bypass (ALREADY IMPLEMENTED)

**Agent:** esp32-dev | **Result:** No code changes needed

The TM plan assumed Wokwi ESPs go through the provisioning flow. Analysis showed this was **already bypassed**:

- `ConfigManager::loadWiFiConfig()` under `#ifdef WOKWI_SIMULATION` sets `config.configured = true` with compile-time credentials
- `provisioning_needed` check evaluates to `false` → portal never starts
- Build flag `-D WOKWI_SIMULATION=1` in `platformio.ini` activates the path
- 9 additional `#ifdef WOKWI_SIMULATION` guards exist across the codebase (watchdog, boot-button, serial delay, OneWire timing, etc.)

**Wokwi Boot Flow:** Serial init → Config from build flags → WiFi "Wokwi-GUEST" → MQTT "host.wokwi.internal:1883" → Heartbeat → pending_approval → normal operation

---

## Resilience Analysis: 12 Structural Gaps

Two independent analyses (server-development-lifecycle + server-debug-resilience) identified overlapping gaps. Below is the deduplicated, prioritized list.

### Critical (5 issues — immediate risk)

**C1: Logic Engine has no ESP-Online check**
- `logic_engine.py:135-189` — `evaluate_sensor_data()` fires rules without checking if source/target ESP is online
- Impact: Rules fire with stale data → wrong actuator commands
- Fix: Check ESP status BEFORE evaluation

**C2: Logic Engine has no dependency deactivation**
- When sensor/actuator is deleted, referencing CrossESPLogic rules stay `enabled=true`
- Next rule evaluation → Runtime-Error (deleted entity)
- Fix: Hooks in sensor_service, actuator_service → `logic_service.disable_rules_for_dependency()`

**C3: Service-Layer cascade gaps**
- `zone_service.remove_zone()` (L178-249): Sets zone fields to NULL, does NOT delete SubzoneConfig entries
- `subzone_service.remove_subzone()` (L198-245): Sends MQTT removal, does NOT delete SubzoneConfig from DB
- `esp_service.unregister_device()` (L226-245): FK cascade works, but doesn't clean scheduler/mock/logic state
- `sensor_service.delete_config()` (L168-193): FK cascade works, but doesn't cancel APScheduler jobs

**C4: Config-Push is fire-and-forget**
- All config pushes (zone, subzone, sensor, actuator) are published to MQTT without ACK tracking
- No retry on failure, no timeout detection, configs can remain "pending" forever

**C5: ESP32 MQTT messages processed inline (race conditions)**
- `mqtt_client.cpp`: Messages processed directly in callback — no queue
- 4 configs arriving within milliseconds → parallel NVS writes → potential corruption
- `config_manager.cpp`: NVS writes have no mutex protection
- PubSubClient buffer default 128 bytes — insufficient for config bursts

### High (4 issues — degraded experience)

**H1: No cascade-awareness in service layer**
- Zone delete cascades via DB FK, but service layer doesn't count affected entities
- User has no idea what was deleted, no WebSocket event with summary

**H2: No Logic-Rule status events**
- No WebSocket events for `logic_rule_degraded`, `logic_rule_paused`, `logic_rule_broken`
- Frontend shows rules as "active" even when dependencies are missing

**H3: DB model missing status fields for Logic-Rules**
- `CrossESPLogic` has `enabled` (boolean) but no `status`, `degraded_reason`, `paused_reason`, `broken_reason`
- Cannot persist rule degradation states
- Requires Alembic migration

**H4: MQTT ACK handlers have no retry limits**
- `zone_ack_handler.py`, `subzone_ack_handler.py`: Accept infinite retries on failures
- No timeout for pending configs

### Medium (3 issues — nice to have)

**M1: Sensor/Actuator use hard-delete instead of soft-delete**
- History preserved via cascade, but config is permanently deleted
- No possibility to re-activate; could use `enabled=false` instead

**M2: No confirmation dialogs for destructive actions**
- Zone-Remove, Subzone-Remove have no frontend confirmation
- Only ESP-Reject has a confirmation dialog

**M3: No zone-delete preview endpoint**
- No REST endpoint to preview what would be affected by a zone deletion
- Would improve UX with "This will delete 3 subzones, 12 sensors, 5 actuators"

---

## Recommended Implementation Plan

### Phase 1: Critical Logic Engine Safety (~13h)

| Fix | Effort | Files |
|-----|--------|-------|
| DB Migration: `status`, `degraded_reason` fields on CrossESPLogic | 1h | Alembic migration |
| Logic-Service: `pause_rules_for_esp()`, `disable_rules_for_esp()`, `resume_rules_for_esp()` | 4h | logic_service.py (new methods) |
| Hooks: esp_service → logic_service, sensor_service → logic_service | 2h | esp_service.py, sensor_service.py, actuator_service.py |
| ESP32: FreeRTOS Queue for MQTT messages | 6h | mqtt_client.cpp, mqtt_client.h |

### Phase 2: Config Reliability & Cascade Awareness (~16h)

| Fix | Effort | Files |
|-----|--------|-------|
| Config-Queue-Service (new): sequencing + ACK-tracking + retry | 8h | config_queue_service.py (new), config_push_queue table |
| Zone-Delete cascade-awareness + WebSocket event | 4h | zone_service.py, websocket_manager.py |
| ESP32: NVS-Write Mutex + Buffer increase to 512 bytes | 3h | config_manager.cpp, mqtt_client.cpp |
| MQTT ACK retry limits (max 3) | 1h | zone_ack_handler.py, subzone_ack_handler.py |

### Phase 3: Frontend UX & Soft-Delete (~17h)

| Fix | Effort | Files |
|-----|--------|-------|
| Soft-Delete for Sensor/Actuator (enabled=false instead of DELETE) | 6h | sensor.py, actuator.py models + services |
| Frontend: Logic-Rule status display | 4h | Logic dashboard view |
| Frontend: Confirmation dialogs (zone, subzone delete) | 3h | ZoneAssignmentPanel.vue, SubzoneService |
| Frontend: config_status visualization (pending spinner, failed badge) | 2h | SensorSatellite.vue, ActuatorSatellite.vue |
| REST: `/zone/{id}/preview-delete` endpoint | 2h | zone.py router |

**Total estimated effort:** ~46h (~6 work days)

---

## Architecture Recommendations

### Config-Queue-Service (new)
- DB table `config_push_queue` with `status` (pending/sent/acked/failed/timeout), `retry_count`, `priority`
- Processes configs sequentially per ESP, ordered by priority (zone > subzone > sensor > actuator)
- 30s ACK timeout, max 3 retries, WebSocket notification on failure
- Detailed design in source report (server-debug-resilience)

### Logic-Service Extensions
- New methods: `pause_rules_for_esp()`, `resume_rules_for_esp()`, `disable_rules_for_dependency()`
- Called from hooks in esp_service (offline/rejected), sensor_service (delete), actuator_service (delete/disable)
- WebSocket broadcasts `logic_rule_status_changed` with reason

### ESP32 Queue System
- FreeRTOS Queue (`xQueueCreate(10, sizeof(MQTTMessage))`) replaces inline callback processing
- Separate task processes messages sequentially
- NVS-Write protected by `xSemaphoreTake()` mutex

---

## Test Scenarios (for verification after implementation)

1. **Zone-Delete Cascade:** Delete zone with 3 subzones, 12 sensors, 5 actuators, 1 logic rule → verify cascade-awareness, logic rule disabled, WebSocket event
2. **ESP-Offline Logic Pause:** ESP-A goes offline → logic rules paused → ESP-A returns → rules resumed
3. **Multi-Config Push:** Assign zone + subzone + sensor + actuator in sequence → verify sequential delivery, ACK tracking, no race conditions

---

## Files Modified (Phases 1-3)

| File | Phase | Change |
|------|-------|--------|
| `El Trabajante/src/main.cpp` (~691-750) | P1 | MQTT startup failure → Portal Recovery |
| `El Trabajante/src/main.cpp` (~2023-2055) | P1 | Runtime MQTT persistent failure → Portal Recovery |
| `El Servador/.../mqtt/handlers/discovery_handler.py` | P2 | Status pending_approval, approval-flow enforcement |
| `El Servador/.../mqtt/handlers/config_handler.py` | P2 | New `_mark_config_applied()` method |
| `El Servador/.../api/v1/sensors.py` | P2 | Status-Guard (403 for unapproved), config_status reset |
| `El Servador/.../api/v1/actuators.py` | P2 | Status-Guard (403 for unapproved), config_status reset |
| `El Servador/.../schemas/sensor.py` | P2 | config_status in SensorConfigResponse |
| `El Servador/.../schemas/actuator.py` | P2 | config_status in ActuatorConfigResponse |
| `El Frontend/src/types/index.ts` | P2 | config_status fields, ESP status types |
| Phase 3 | P3 | No changes (already implemented) |

---

## Key Correction to TM Assumptions

1. **"Heartbeat sets online immediately"** — FALSE. Heartbeat-Handler was already correct with `pending_approval`. The real bug was the legacy Discovery-Handler.
2. **"Wokwi needs provisioning bypass"** — FALSE. Wokwi already bypasses provisioning via compile-time credentials (`WOKWI_SIMULATION` build flag).

---

*Consolidated from 5 reports by collect-reports session. Original reports archived.*
