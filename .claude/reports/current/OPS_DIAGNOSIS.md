# Auto-Ops Full System Diagnosis

## Session: 2026-02-15 16:12 (CET)
**Agent:** auto-ops v2.0 (Operations + Driver + Frontend/Backend Inspector)
**Method:** Playwright Browser Inspection + Docker CLI + DB Queries + MQTT Capture + Console Analysis
**Duration:** ~12 minutes continuous

---

## 1. Executive Summary

| Layer | Status | Issues |
|-------|--------|--------|
| **Docker Stack** | ✅ HEALTHY | 12/12 containers up, 1 unhealthy (mosquitto-exporter) |
| **Server (FastAPI)** | ✅ HEALTHY | alive + ready, DB + MQTT connected |
| **Database (PostgreSQL)** | ✅ HEALTHY | 39 MB, 19 tables, no errors |
| **MQTT (Mosquitto)** | ⚠️ DEGRADED | Retained stale messages from ESP_00000001, Invalid LWT JSON |
| **Frontend (Vue 3)** | ⚠️ DEGRADED | Vue error caught, orphaned mock ESP, null device name |
| **Mock-ESP Simulation** | ⚠️ DEGRADED | ZONE_MISMATCH on both ESPs, sensors not in config |

**Overall:** DEGRADED - System functional but with recurring warnings that indicate config drift.

---

## 2. Infrastructure Layer

### 2.1 Docker Container Status

| Container | Status | Uptime | Notes |
|-----------|--------|--------|-------|
| automationone-server | ✅ Up (healthy) | 4h | Port 8000 |
| automationone-frontend | ✅ Up (healthy) | 4h | Port 5173 |
| automationone-postgres | ✅ Up (healthy) | 4h | Port 5432 |
| automationone-mqtt | ✅ Up (healthy) | 4h | Port 1883/9001 |
| automationone-loki | ✅ Up (healthy) | 4h | Port 3100 |
| automationone-prometheus | ✅ Up (healthy) | 4h | Port 9090 |
| automationone-grafana | ✅ Up (healthy) | 4h | Port 3000 |
| automationone-promtail | ✅ Up (healthy) | 4h | - |
| automationone-cadvisor | ✅ Up (healthy) | 4h | Port 8080 |
| automationone-postgres-exporter | ✅ Up (healthy) | 4h | Port 9187 |
| automationone-mqtt-logger | ✅ Up | 4h | No healthcheck |
| automationone-mosquitto-exporter | ❌ Up (unhealthy) | 4h | Port 9234, unhealthy |

### 2.2 Health Endpoints

| Endpoint | Response | Status |
|----------|----------|--------|
| `/api/v1/health/live` | `{"alive": true}` | ✅ |
| `/api/v1/health/ready` | `{"ready": true, "checks": {"database": true, "mqtt": true, "disk_space": true}}` | ✅ |
| Loki `/ready` | `ready` | ✅ |

### 2.3 Issue: mosquitto-exporter UNHEALTHY

- **Container:** automationone-mosquitto-exporter
- **Port:** 9234 (not exposed to host)
- **Impact:** Prometheus cannot scrape MQTT metrics
- **Priority:** LOW (monitoring only, not affecting core function)

---

## 3. Database Layer

### 3.1 Overview

| Metric | Value |
|--------|-------|
| DB Size | 39 MB |
| Tables | 19 |
| ESP Devices | 2 (both online) |
| Sensor Configs | 1 |
| Actuator Configs | 0 |
| Sensor Data Points | 218 (120 in last hour) |
| Heartbeat Logs | 130 |
| Audit Logs | 6 |
| Token Blacklist | 7 |

### 3.2 ESP Devices

| device_id | status | firmware | zone_id | last_seen |
|-----------|--------|----------|---------|-----------|
| MOCK_E1BD1447 | online | _(null)_ | _(null)_ | 2026-02-15 15:07:37 |
| MOCK_25045525 | online | MOCK_1.0.0 | test | 2026-02-15 15:07:17 |

### 3.3 Sensor Configs

| device_id | GPIO | Type | Name | Enabled |
|-----------|------|------|------|---------|
| MOCK_25045525 | 4 | DS18B20 | Temp 0C79 | ✅ |

### 3.4 Issues Found

1. **MOCK_E1BD1447 has no zone_id** in DB, but simulation sends `zone_id='greenhouse'` → ZONE_MISMATCH
2. **MOCK_E1BD1447 has no firmware_version** → null in DB
3. **No sensor configs for MOCK_E1BD1447** → Server warns "Sensor X not in config" every 30s
4. **0 actuator configs** for any ESP → Actuator section empty in UI

---

## 4. Server Layer (God-Kaiser)

### 4.1 Startup: SUCCESSFUL
All 20+ startup steps completed. Server running with Mock-ESP simulation.

### 4.2 Recurring Errors (every ~60s)

| Error | Frequency | Impact | Root Cause |
|-------|-----------|--------|------------|
| `Invalid JSON payload on topic .../system/will` | Every heartbeat (~60s per ESP) | ERROR log spam | SimulationScheduler publishes empty/invalid LWT message |
| `ZONE_MISMATCH [MOCK_E1BD1447]` | Every heartbeat | WARNING | ESP sends zone_id='greenhouse', DB has NULL |
| `ZONE_MISMATCH [MOCK_25045525]` | Every heartbeat | WARNING | ESP lost zone config (zone_assigned=false), DB has 'test' |
| `Sensor X not in config [MOCK_E1BD1447]` | Every 30s | WARNING | 3 sensors (DS18B20, pH, sht31_temp) not registered in sensor_configs |
| `JWT verification failed: Signature expired` | Sporadic | WARNING | Normal - token refresh handles it |

### 4.3 Error Classification

| Category | Count | Severity |
|----------|-------|----------|
| LWT JSON Parse | ~2/min | ERROR - but non-fatal |
| Zone Mismatch | ~2/min | WARNING |
| Sensor Not In Config | ~6/min (3 sensors × 2/min) | WARNING |
| JWT Expired | Sporadic | WARNING (expected) |
| Unhandled Exceptions | 0 | - |
| Circuit Breaker Events | 0 | - |
| Database Errors | 0 | - |

### 4.4 MQTT Traffic Analysis

Captured retained messages from **ESP_00000001** (no longer in DB!):
- `kaiser/god/esp/ESP_00000001/system/command/response` - OneWire scan response
- `kaiser/god/esp/ESP_00000001/system/will` - Offline status
- `kaiser/god/esp/ESP_00000001/zone/ack` - Zone 'greenhouse' assigned
- `kaiser/god/esp/ESP_00000001/config_response` - Error: "Actuator config array is empty"
- `kaiser/god/esp/ESP_00000001/actuator/5/status` - Actuator status
- `kaiser/god/esp/ESP_00000001/actuator/5/response` - Command response
- `kaiser/god/esp/ESP_00000001/actuator/5/alert` - Emergency stop alert
- `kaiser/god/esp/ESP_00000001/onewire/scan_result` - DS18B20 found

**Issue:** Stale retained messages from a deleted device pollute MQTT traffic.

---

## 5. Frontend Layer (Playwright Browser Inspection)

### 5.1 Authentication

| Check | Result |
|-------|--------|
| Login State | ✅ Already authenticated as admin |
| Auth Status API | ✅ 200 OK |
| Auth/me API | ✅ 200 OK |
| Token Refresh | ✅ Working (POST /auth/refresh → 200) |
| WebSocket Connection | ✅ Connected |

### 5.2 Dashboard View

| Element | Status | Notes |
|---------|--------|-------|
| Zone "test" | ✅ Visible | 1/1 Online |
| Mock #5525 | ✅ Displayed | MOCK badge, zone test |
| MOCK_E1BD1447 | ⚠️ "NICHT ZUGEWIESEN" | SIM badge, no zone, name="null" |
| NOT-AUS Button | ✅ Visible | Red, accessible |
| Server Connection | ✅ "Server verbunden" | Green dot |
| Zoom Navigation | ✅ Working | Dashboard → Zone → Device |

### 5.3 Device Detail (Mock #5525)

| Element | Status |
|---------|--------|
| Sensor TEMP 0C79 | ✅ Visible, value 0.0°C |
| Zone dropdown | ✅ Working (options: test, remove) |
| Komponenten sidebar | ✅ Visible (Temp, T+H) |
| Aktoren section | Empty (0 actuators configured) |

### 5.4 System Monitor

| Tab | Status | Notes |
|-----|--------|-------|
| Live | ✅ Working | "Alle 2 Geräte online", sources selectable |
| Ereignisse | ✅ Accessible | - |
| Server Logs | ✅ Working | "100 von 10,000 Einträgen", filters available |
| Datenbank | ✅ Accessible | - |
| MQTT Traffic | ✅ Working | 341+ messages counted |
| Health | ✅ Working | 2/2 Geräte Online, 100% erreichbar |

### 5.5 Other Views

| View | URL | Status |
|------|-----|--------|
| Komponenten | /sensors | ✅ 1 Sensor (Temp 0C79, 0.00, "good"), 0 Aktoren |
| Regeln | /logic | ✅ Automatisierung editor, "Neue Regel erstellen" |
| Einstellungen | /settings | ✅ User admin, API/WS URLs correct |

### 5.6 Console Messages Analysis

| Category | Count | Details |
|----------|-------|---------|
| Vue Error | 1 | `[Global] Vue error [object Object]` - unspecified error during render |
| WebSocket | OK | Connected, visibility handling enabled |
| ESP Store | OK | Handlers registered, 2 devices loaded |
| Auth Flow | OK | auth/status → auth/me → refresh cycle working |
| API Calls | All 200 | esp/devices, debug/mock-esp, logic/rules, auth/me, esp/devices/pending |

**Key Console Finding:**
```
[ESP-API] Marking MOCK_E1BD1447 as orphaned mock (not in mock store)
[ESPStore] - MOCK_E1BD1447: name="null"
```
MOCK_E1BD1447 exists in DB but is not tracked by the mock store → treated as "orphaned".

---

## 6. Cross-Layer Correlation

### 6.1 MOCK_E1BD1447 Config Drift (Priority: MEDIUM)

```
SimulationScheduler → publishes heartbeat with zone_id='greenhouse'
                    → Server heartbeat_handler detects ZONE_MISMATCH (DB has null)
                    → Server publishes LWT with invalid JSON (empty payload)
                    → mqtt.subscriber logs ERROR: Invalid JSON
                    → Sensors 4_DS18B20, 5_pH, 21_sht31_temp → "not in config" WARNING
                    → Frontend: ESP-API marks as "orphaned mock", name="null"
                    → Dashboard: Shows in "NICHT ZUGEWIESEN" with SIM badge
```

**Root Cause:** SimulationScheduler has stale config for MOCK_E1BD1447 (zone, sensors) that doesn't match DB state.

### 6.2 Stale MQTT Retained Messages (Priority: LOW)

```
ESP_00000001 was previously connected → published retained messages
ESP_00000001 was deleted from DB → retained messages persist on broker
→ MQTT capture shows ghost traffic from non-existent device
```

**Root Cause:** No cleanup of retained messages when ESP is deleted.

### 6.3 Invalid LWT JSON (Priority: MEDIUM)

```
SimulationScheduler._heartbeat_job → publishes heartbeat OK
→ Also publishes LWT on .../system/will topic
→ Payload is empty or malformed (not valid JSON)
→ mqtt.subscriber parses all messages → ERROR on LWT topic
→ Repeats every 60s for each mock ESP = ~2 ERROR/min
```

**Root Cause:** SimulationScheduler sets LWT with empty payload during mock heartbeat.

---

## 7. Prioritized Action Items

### HIGH Priority
_(None - system is functional)_

### MEDIUM Priority

| # | Issue | Fix Location | Effort |
|---|-------|-------------|--------|
| M1 | SimulationScheduler LWT invalid JSON | `El Servador/.../simulation/scheduler.py` | Small - fix LWT payload to valid JSON |
| M2 | MOCK_E1BD1447 zone mismatch | Re-seed mock ESP or clear stale NVS zone from simulation config | Small |
| M3 | MOCK_E1BD1447 missing sensor_configs | Add sensor configs to DB or update simulation to match DB | Small |

### LOW Priority

| # | Issue | Fix Location | Effort |
|---|-------|-------------|--------|
| L1 | mosquitto-exporter unhealthy | Docker healthcheck config or exporter config | Small |
| L2 | Stale retained MQTT messages from ESP_00000001 | `mosquitto_pub -t "topic" -r -n` to clear | Manual |
| L3 | MOCK_E1BD1447 name="null" in frontend | Frontend should handle null name gracefully | Small |
| L4 | Vue error `[object Object]` on dashboard | Debug which component throws (needs console.error details) | Medium |

---

## 8. Database Health Summary

| Table | Rows | Growth Rate | Notes |
|-------|------|-------------|-------|
| sensor_data | 218 | ~120/hour | Only from MOCK_25045525 GPIO 4 |
| esp_heartbeat_logs | 130 | ~60/hour | From both mock ESPs |
| token_blacklist | 7 | Low | JWT refresh tokens |
| audit_logs | 6 | Low | 2 discovered + 2 approved + 2 online |
| esp_devices | 2 | Static | Both online |
| sensor_configs | 1 | Static | Only Temp 0C79 |
| _all others_ | 0 | - | Empty |

**Retention:** Maintenance jobs DISABLED by default (safe). No cleanup needed yet at 39 MB.

---

## 9. Recommendations

### Immediate (fix warning spam):
1. **Fix LWT payload** in SimulationScheduler to publish valid JSON → eliminates ~2 ERROR/min
2. **Re-seed MOCK_E1BD1447** with correct config (zone, sensors) → eliminates ~8 WARNING/min

### Short-term:
3. **Clear stale retained messages** from ESP_00000001 on MQTT broker
4. **Fix mosquitto-exporter** healthcheck for complete monitoring
5. **Handle null device names** in frontend gracefully (fallback to device_id)

### Long-term:
6. **Add retained message cleanup** to ESP deletion flow
7. **Enable maintenance jobs** for sensor_data/heartbeat_logs retention as data grows

---

_Report generated by auto-ops v2.0 | 2026-02-15 16:12 CET_
_Method: Playwright Browser + Docker CLI + PostgreSQL Queries + MQTT Capture + Console Analysis_
