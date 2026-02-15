# Docker & Network Diagnosis Report

**Date:** 2026-02-12
**Branch:** `feature/phase2-wokwi-ci`
**Trigger:** Systematic debugging after git branch switch
**Method:** Phase 1-3 Systematic Debugging + system-control + mqtt-dev analysis

---

## Executive Summary

4 core Docker services running. **2 critical issues**, 3 moderate, 3 low-priority findings.
The main system (Server + MQTT + DB) works **internally**, but external MQTT access is broken.

---

## Issue #1: MQTT Port 1883 NOT Published to Host [CRITICAL]

### Evidence

```
# docker compose ps (MQTT):
1883/tcp, 0.0.0.0:9001->9001/tcp   ← 1883 NOT published!

# docker inspect (HostConfig vs NetworkSettings):
HostConfig.PortBindings:  {"1883/tcp":[{"HostIp":"","HostPort":"1883"}]}  ← CONFIGURED
NetworkSettings.Ports:    {"1883/tcp":[]}                                  ← RUNTIME EMPTY!

# docker port automationone-mqtt:
9001/tcp -> 0.0.0.0:9001   ← Only WebSocket published
```

### Root Cause

Local Mosquitto Windows Service blocks port 1883 BEFORE Docker can bind it:

```
Get-Service mosquitto → Status: Running, StartType: Automatic
Get-NetTCPConnection -LocalPort 1883 → PID 4912, State: Listen
```

Docker silently fails to bind the port and continues without it.

### Impact

- External MQTT clients (Wokwi, local `mosquitto_sub`, hardware ESPs) CANNOT connect
- Internal Docker network WORKS (Server connects to `mqtt-broker:1883` via container DNS)
- SimulationScheduler, MaintenanceService, all handlers function correctly internally

### Fix

```powershell
# 1. Stop and disable local Mosquitto
Stop-Service mosquitto
Set-Service mosquitto -StartupType Disabled

# 2. Restart MQTT container to rebind port
docker restart automationone-mqtt

# 3. Verify
docker port automationone-mqtt
# Expected: 1883/tcp -> 0.0.0.0:1883 AND 9001/tcp -> 0.0.0.0:9001
```

---

## Issue #2: Actuator Response Handler DateTime Bug [CRITICAL]

### Evidence

```
src.mqtt.handlers.actuator_response_handler - ERROR:
asyncpg.exceptions.DataError: invalid input for query argument $10:
datetime.datetime(2026, 2, 11, 8, 13, 5,...
(can't subtract offset-naive and offset-aware datetimes)
```

### Root Cause

`ActuatorHistory.timestamp` column missing `timezone=True`:

**File:** `El Servador/god_kaiser_server/src/db/models/actuator.py:388-394`
```python
# BUG: DateTime without timezone=True
timestamp: Mapped[datetime] = mapped_column(
    DateTime,              # ← Missing timezone=True!
    nullable=False,
    ...
)
```

The handler creates timezone-aware datetimes (`datetime.now(timezone.utc)`) but the
DB column expects naive datetimes. Same bug exists in `ActuatorState.last_command_timestamp` (line 245).

**Correct pattern** (from TimestampMixin in base.py):
```python
DateTime(timezone=True),  # ← This is what it should be
```

### Impact

- Actuator command history NOT recorded in DB
- Actuator commands still EXECUTE (MQTT publish works), but response tracking breaks

### Fix

Two columns in `actuator.py` need `DateTime(timezone=True)`:
1. `ActuatorHistory.timestamp` (line 388)
2. `ActuatorState.last_command_timestamp` (line 245)

Requires Alembic migration after code fix.

---

## Issue #3: Frontend Healthcheck Flaky [MODERATE]

### Evidence

```json
// docker inspect health log:
{"ExitCode": 0, "Output": ""}              // OK
{"ExitCode": -1, "Output": "Health check exceeded timeout (10s)"}  // TIMEOUT
{"ExitCode": -1, "Output": "Health check exceeded timeout (10s)"}  // TIMEOUT
{"ExitCode": 0, "Output": ""}              // OK
```

### Root Cause

Docker-compose healthcheck uses Node fetch (`node -e "fetch('http://localhost:5173')..."`).
Vite dev server occasionally takes >10s to respond (HMR compilation, hot reload).

Note: Dockerfile healthcheck (`wget`) would ALWAYS fail (connection refused to Vite),
but docker-compose healthcheck overrides it.

### Impact

Container continues running. Status flips between healthy/unhealthy.
No functional impact but confusing for monitoring.

### Fix Options

1. Increase healthcheck timeout: `timeout: 30s` (recommended)
2. Increase start_period: `start_period: 60s`
3. Align Dockerfile healthcheck with docker-compose (consistency)

---

## Issue #4: Orphaned Docker Volumes [MODERATE]

### Evidence

```
# Old prefix-style volumes (ORPHANED):
auto-one_automationone-postgres-data
auto-one_automationone-grafana-data
auto-one_automationone-loki-data
auto-one_automationone-pgadmin-data
auto-one_automationone-promtail-positions

# New explicit-name volumes (ACTIVE):
automationone-postgres-data
automationone-grafana-data
automationone-loki-data
automationone-mosquitto-data
automationone-prometheus-data
automationone-promtail-positions

# Extra orphan:
automationone-mosquitto-log    ← Not in docker-compose.yml
```

### Root Cause

Volume naming migration (docker-compose.yml added `name:` attributes).
Old volumes still exist. Also `automationone-pgadmin-data` missing (devtools profile never started since migration).

### Impact

Wasted disk space. No functional impact.

### Fix

```bash
# Remove orphaned volumes (after verifying data migration)
docker volume rm auto-one_automationone-postgres-data
docker volume rm auto-one_automationone-grafana-data
docker volume rm auto-one_automationone-loki-data
docker volume rm auto-one_automationone-pgadmin-data
docker volume rm auto-one_automationone-promtail-positions
docker volume rm automationone-mosquitto-log
```

---

## Issue #5: pgAdmin Environment Variable Mismatch [MODERATE]

### Evidence

**.env file:**
```
PGADMIN_EMAIL=admin@automationone.local
PGADMIN_PASSWORD=admin
```

**docker-compose.yml:**
```yaml
PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL:-admin@automationone.dev}
PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD:-admin}
```

### Root Cause

Variable names don't match. `.env` defines `PGADMIN_EMAIL` but compose uses `PGADMIN_DEFAULT_EMAIL`.
Compose falls back to defaults: `admin@automationone.dev` / `admin`.

### Impact

pgAdmin would use compose defaults instead of .env values. Minor - only affects devtools profile.

### Fix

Rename in `.env`:
```
PGADMIN_DEFAULT_EMAIL=admin@automationone.local
PGADMIN_DEFAULT_PASSWORD=admin
```

---

## Low Priority / Expected Behavior

### LWT Empty Payload Warning
```
Invalid JSON payload on topic kaiser/god/esp/MOCK_E1BD1447/system/will
```
Empty LWT is expected behavior for mock ESPs. No action needed.

### ESP_00000001 Sensor Stale
```
Sensor stale: ESP ESP_00000001 GPIO 4 (ds18b20) - no data for never
```
Seeded Wokwi ESP is offline (not running). Expected.

### 5 Rejected Mock ESPs in DB
MOCK_TEST002B, MOCK_TEST003C, MOCK_EMG* - test artifacts from previous session.
Consider cleanup via API or DB.

---

## System Health Matrix

| Component | Status | Details |
|-----------|--------|---------|
| **Docker Network** | OK | `automationone-net` 172.18.0.0/16, all 4 containers connected |
| **PostgreSQL** | HEALTHY | Port 5432 published, responding |
| **MQTT Broker** | PARTIAL | Healthy internally. Port 1883 NOT published to host |
| **Server** | HEALTHY | Port 8000 published. 12 MQTT handlers registered |
| **Frontend** | FLAKY | Vite running. Healthcheck intermittently timing out |
| **Server→MQTT** | OK | Connected via `mqtt-broker:1883` (Docker DNS) |
| **SimulationScheduler** | OK | Heartbeats + sensor data for MOCK_E1BD1447 |
| **MaintenanceService** | OK | ESP, MQTT, sensor health checks running |
| **Auth** | OK | JWT login working (admin / Admin123#) |
| **ESP Devices** | 7 total | 1 online (MOCK), 1 offline (Wokwi seed), 5 rejected (test) |

### MQTT Handler Registration (12 handlers)

| # | Pattern | Handler |
|---|---------|---------|
| 1 | `kaiser/+/esp/+/sensor/+/data` | sensor_handler |
| 2 | `kaiser/+/esp/+/actuator/+/status` | actuator_handler |
| 3 | `kaiser/+/esp/+/actuator/+/response` | actuator_response_handler |
| 4 | `kaiser/+/esp/+/actuator/+/alert` | actuator_alert_handler |
| 5 | `kaiser/+/esp/+/system/heartbeat` | heartbeat_handler |
| 6 | `kaiser/+/discovery/esp32_nodes` | discovery_handler |
| 7 | `kaiser/+/esp/+/config_response` | config_handler |
| 8 | `kaiser/+/esp/+/zone/ack` | zone_ack_handler |
| 9 | `kaiser/+/esp/+/subzone/ack` | subzone_ack_handler |
| 10 | `kaiser/+/esp/+/system/will` | lwt_handler |
| 11 | `kaiser/+/esp/+/system/diagnostics` | diagnostics_handler |
| 12 | `kaiser/+/esp/+/system/error` | error_handler |

### Docker Container IPs

| Container | IP | Service |
|-----------|------|---------|
| automationone-postgres | 172.18.0.2 | PostgreSQL |
| automationone-mqtt | 172.18.0.3 | Mosquitto MQTT |
| automationone-server | 172.18.0.4 | FastAPI Backend |
| automationone-frontend | 172.18.0.5 | Vue 3 Frontend |

---

## Priority Action List

1. **[NOW]** Stop local Mosquitto service → restart MQTT container → verify port 1883
2. **[CODE FIX]** Fix `DateTime(timezone=True)` in actuator.py + Alembic migration
3. **[MINOR]** Increase frontend healthcheck timeout to 30s
4. **[CLEANUP]** Remove orphaned `auto-one_automationone-*` volumes
5. **[CLEANUP]** Fix pgAdmin env variable names in `.env`
6. **[CLEANUP]** Remove rejected test mock ESPs from DB
