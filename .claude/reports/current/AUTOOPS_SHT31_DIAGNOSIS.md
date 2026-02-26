# AutoOps Cross-Layer Diagnosis: ESP_472204 SHT31 Failure

**Date:** 2026-02-25 20:28 UTC
**Device:** ESP_472204 (ESP32 dev board)
**Sensor:** SHT31 (Temperature + Humidity, I2C address 0x44 / 68 decimal)
**Zone:** Echt
**UUID:** 3c4c4130-95a7-44c6-b0e7-9069bd4e9d31

---

## 1. MQTT Traffic Analysis

### Error Rate (ACTIVE - errors still flowing)

| Error Code | Count | Duration | Rate | Pattern |
|------------|-------|----------|------|---------|
| **1007** (I2C_TIMEOUT) | 1091+ | 22+ min (ongoing) | **~51/min** (1 per 1.17s) | Continuous, steady |
| **1011** (I2C_DEVICE_NOT_FOUND) | 730 | 34 sec burst | **~1288/min** (21.5/s) | Single burst at 20:15:26 |
| **1009** (CRC_FAILURE) | 1 | Single event | - | Once at 20:06:40 |

### Per-Minute Distribution (Error 1007)

```
20:05  ........7   (startup, ramp-up)
20:06  .......51
20:07  .......53
20:08  .......52
20:09-20:14   51-54/min (steady state)
20:15  .......23   (dip: 1011 burst started)
20:16  .......28   (recovery)
20:17-20:26   51-53/min (steady state, ongoing)
```

### Payload Structure (Error 1007)

```json
{
  "error_code": 1007,
  "severity": 2,
  "category": "HARDWARE",
  "message": "sht31 read timeout",
  "context": {"esp_id": "ESP_472204", "uptime_ms": 707966},
  "ts": 1772051277
}
```

### Error Timeline Reconstruction

1. **20:05:48** - First error 1007 (I2C timeout). ESP uptime ~0ms (fresh boot)
2. **20:06:40** - Single error 1009 (CRC failure on sht31_humidity). Sensor briefly responded but data corrupted
3. **20:15:26-20:16:01** - Error 1011 burst (730 events in 34s). ESP tried I2C scan, device not found
4. **20:16:18** - LWT received (ESP briefly disconnected)
5. **After 20:17** - Back to steady 1007 errors (~1/sec)

### Interpretation

The SHT31 sensor **never successfully delivered data**. The error sequence suggests:
- Hardware connection issue (bad wiring, wrong address, or defective sensor)
- The single CRC failure (1009) at 20:06:40 indicates the sensor was momentarily responsive
- The 1011 burst (device not found) suggests a complete I2C bus failure during that 34-second window

---

## 2. Database Analysis

### Device Status

| Field | Value |
|-------|-------|
| Status | online |
| Approved | 2026-02-20 22:24:45 |
| Last Seen | 2026-02-25 20:24:23 |
| Health Status | (null) |
| Zone | Echt |

### Sensor Configs (2 rows, BOTH active)

| Sensor Type | GPIO | I2C Addr | Interface | Enabled | Interval | Config Status |
|-------------|------|----------|-----------|---------|----------|---------------|
| sht31_temp | 0 | 68 (0x44) | I2C | true | 30000ms | applied |
| sht31_humidity | 0 | 68 (0x44) | I2C | true | 30000ms | applied |

**BUG CONFIRMED:** Both sensor configs share I2C address 68. This is the root cause of the `MultipleResultsFound` exception in `sensor_repo.py:757`. The `get_by_i2c_address()` method uses `scalar_one_or_none()` but finds 2 rows.

### Sensor Data

**ZERO rows** in sensor_data for ESP_472204. The sensor has never successfully delivered any data.

### Sensor Type Defaults

| Type | Description | Interval | Timeout |
|------|-------------|----------|---------|
| sht31_temp | Auto-registered from SHT31TemperatureProcessor | 30s | 180s |
| sht31_humidity | Auto-registered from SHT31HumidityProcessor | 30s | 180s |

### Maintenance Health Checks

Server maintenance job reports both sensors as **stale**:
```
Sensor stale: ESP ESP_472204 GPIO 0 (sht31_humidity) - no data for never (timeout: 30s)
Sensor stale: ESP ESP_472204 GPIO 0 (sht31_temp) - no data for never (timeout: 30s)
Sensor health check: 2 checked, 2 stale, 0 healthy
```

### Audit Logs Impact

| Metric | Value |
|--------|-------|
| Total audit_logs rows | 1784 |
| ESP_472204 entries | 1756 |
| **% from ESP_472204** | **98.4%** |
| Error severity entries | 1746 (97.9% of all) |

### Request ID Analysis

- `request_id` column: VARCHAR(255) (already fixed from earlier VARCHAR(36))
- Max request_id length: 44 chars (e.g., `unknown:config_response:no-seq:1772018900213`)
- No truncation errors found in current session

---

## 3. Docker Health

### Service Status

| Service | Status | Notes |
|---------|--------|-------|
| automationone-server | Up (healthy) | 152 MB RAM, 1.65% CPU |
| automationone-postgres | Up (healthy) | 80 MB RAM, **34.67% CPU** |
| automationone-mqtt | Up (healthy) | 21 MB RAM, 0.07% CPU |
| automationone-frontend | Up (healthy) | 155 MB RAM, **49.75% CPU** |
| automationone-loki | Up (healthy) | 110 MB RAM |
| automationone-prometheus | Up (healthy) | 84 MB RAM |
| automationone-grafana | Up (healthy) | 99 MB RAM |
| automationone-alloy | Up (healthy) | 106 MB RAM |
| automationone-pgadmin | **Restarting** | Crash loop (not SHT31 related) |

### Resource Concerns

- **PostgreSQL 34.67% CPU** - Elevated. Likely caused by continuous INSERT of error events (~51/min)
- **Postgres Exporter 16.19% CPU** - Higher than expected, possibly related to audit_log growth
- **Frontend 49.75% CPU** - High, may be related to WebSocket broadcasts of error events
- MQTT broker handles the load fine (0.07% CPU)
- Total messages received: 3042, 4 clients connected

### Heartbeat Status

- Heartbeat interval: **~59s** (within normal range of 30-60s)
- 153 heartbeats logged total, 31 in last 30 minutes
- ESP is alive and connected, just sensor is failing

---

## 4. Loki Log Analysis

### MultipleResultsFound Exception (CONFIRMED)

Full stack trace captured in Loki at **20:11:36**:
```
sensors.py:533 create_or_update_sensor
  -> sensors.py:1575 _validate_i2c_config
    -> sensor_repo.py:757 get_by_i2c_address
      -> scalar_one_or_none() FAILS
sqlalchemy.exc.MultipleResultsFound: Multiple rows were found when one or none was required
```

**Root Cause:** `get_by_i2c_address(esp_id, i2c_address=68)` finds both `sht31_temp` AND `sht31_humidity` because they share the same I2C address (0x44). The query filters only on `esp_id + interface_type + i2c_address` but does NOT filter by `sensor_type`.

### DBAPIError (offset-naive vs offset-aware)

- **NOT found** in current session Loki logs
- May have occurred in earlier sessions (pre-restart)

### StringDataRightTruncation

- **NOT found** in current session
- `request_id` column is now VARCHAR(255), max observed length is 44 chars
- Previously was VARCHAR(36), now fixed

---

## 5. Impact Assessment

### Severity: HIGH

| Impact Area | Level | Detail |
|-------------|-------|--------|
| **DB Growth** | HIGH | ~73,440 error rows/day projected. 1960 KB in ~22 min. **~144 MB/day** audit_log growth |
| **PostgreSQL CPU** | MEDIUM | 34.67% CPU from continuous INSERTs |
| **MQTT Bandwidth** | MEDIUM | ~51 error messages/min + DB writes + WebSocket broadcasts |
| **Frontend** | MEDIUM | 49.75% CPU, likely from WebSocket error broadcasts |
| **Log Volume** | HIGH | 98.4% of ALL audit_logs come from this single ESP |
| **Sensor Data** | TOTAL LOSS | Zero data collected, zero insight from SHT31 |
| **Sensor API** | BROKEN | `create_or_update_sensor` endpoint crashes with MultipleResultsFound |

### Cascading Effects

```
ESP_472204 SHT31 I2C Failure (Hardware)
  -> ~1 error/sec MQTT messages (Error 1007)
    -> Error Handler saves to audit_logs (~51 rows/min)
      -> PostgreSQL CPU elevated (34.67%)
        -> Postgres Exporter elevated (16.19%)
    -> WebSocket broadcast per error event
      -> Frontend CPU elevated (49.75%)
    -> Loki log ingestion
      -> Log volume dominated by error events
```

---

## 6. Server Bugs (Cross-Referenced)

### Bug 1: MultipleResultsFound in sensor_repo.py:757 (CONFIRMED ACTIVE)

- **File:** `src/db/repositories/sensor_repo.py:757`
- **Method:** `get_by_i2c_address(esp_id, i2c_address)`
- **Problem:** Query returns 2 rows (sht31_temp + sht31_humidity) for same I2C address 68
- **Fix Required:** Either use `scalars().first()` instead of `scalar_one_or_none()`, or add `sensor_type` filter
- **Triggered By:** `POST /api/v1/sensors/...` -> `_validate_i2c_config()`
- **Impact:** Creating/updating sensors on this ESP crashes the API

### Bug 2: DBAPIError (offset-naive vs offset-aware)

- **NOT reproduced** in current session
- Likely fixed or not triggered since last restart

### Bug 3: StringDataRightTruncation

- **FIXED.** `request_id` column widened to VARCHAR(255). Max observed: 44 chars
- No truncation errors found

### Bug 4: Config Response MISSING_FIELD

- **17 occurrences** across sessions
- Message: "Actuator config array is empty"
- ESP receives config push but no actuators are configured (expected behavior, not a bug)

---

## 7. Recommendations

### Immediate Actions (Priority Order)

1. **HARDWARE CHECK** - SHT31 wiring (SDA/SCL/VCC/GND). The single CRC success at 20:06:40 suggests intermittent contact
2. **Error Rate Limiting** - ESP firmware should implement exponential backoff for repeated I2C errors (currently 1/sec indefinitely)
3. **Server-Side Dedup** - Error handler should deduplicate identical errors (e.g., max 1 per minute per error_code per device)
4. **Fix `get_by_i2c_address()`** - Use `scalars().first()` or add `sensor_type` filter to handle multi-value sensors sharing one I2C address

### Medium-Term

5. **Sensor Health Auto-Disable** - After N consecutive failures, server should auto-disable sensor config and alert user
6. **Audit Log Rotation** - Implement TTL or partition strategy for audit_logs (currently unbounded)
7. **Error Budget** - Implement per-device error budgets to prevent single device from dominating system resources

### Hardware Troubleshooting Checklist

```
[ ] Check SDA/SCL wiring to GPIO pins (SHT31 default: SDA=4, SCL=5 on XIAO C3)
[ ] Verify VCC = 3.3V (not 5V)
[ ] Check pull-up resistors on I2C bus (4.7k ohm)
[ ] Run I2C scan: POST /api/v1/sensors/esp/{esp_id}/i2c/scan
[ ] Try different I2C address (0x45 if ADDR pin high)
[ ] Test with different SHT31 module
```

---

## 8. Session Summary

| Component | Status | Finding |
|-----------|--------|---------|
| **Hardware** | FAILED | SHT31 not responding on I2C bus. Never delivered data |
| **MQTT** | DEGRADED | ~51 error messages/min flooding system |
| **Server** | BUG | MultipleResultsFound in sensor_repo.py, sensor API broken |
| **Database** | STRESSED | 98.4% of audit_logs from single ESP, ~144 MB/day projected growth |
| **Docker** | OK-ish | All core services healthy, but elevated CPU on Postgres + Frontend |
| **Loki** | OK | Logging works, captured full stack traces |
| **Frontend** | DEGRADED | Elevated CPU from WebSocket error broadcasts |

**Overall Assessment:** The SHT31 hardware failure triggers a cascading performance degradation across the entire stack. The missing error deduplication and rate limiting turns a simple I2C wiring issue into a system-wide resource drain.

---

*Report generated by auto-ops Cross-Layer Diagnosis*
*Data sources: MQTT live capture, PostgreSQL audit_logs/sensor_configs/sensor_data/heartbeat_logs, Docker stats, Loki query_range, Server logs*
