# Auto-Ops Operations Log

## Session: 2026-02-26 — Sensor Cleanup for ESP_472204

Branch: fix/sht31-crc-humidity

---

### Auftrag

Delete all configured sensors for ESP_472204 while preserving the device registration.
Requirements:
1. ESP stays registered (DO NOT delete)
2. All sensor configs removed from DB
3. All sensor data removed from DB
4. NVS on ESP should have no sensors stored

---

### [13:00:00] [INFO] [System] Pre-state assessment
- Command: `curl -sf http://localhost:8000/api/v1/esp/devices`
- Result: 1 ESP device found: ESP_472204 (UUID: 3c4c4130-95a7-44c6-b0e7-9069bd4e9d31), status=online
- Sensors: 2 (sht31_temp, sht31_humidity on GPIO 0, I2C)
- Status: OK

### [13:00:05] [INFO] [Database] Pre-state record counts
- Command: `SELECT COUNT(*) FROM sensor_configs / sensor_data WHERE esp_id = '...'`
- Result: sensor_configs=2, sensor_data=520
- Status: OK

### [13:00:10] [WARN] [API] DELETE endpoint bug discovered
- Command: `curl -X DELETE http://localhost:8000/api/v1/sensors/ESP_472204/0`
- Result: HTTP 500 — `sqlalchemy.exc.MultipleResultsFound`
- Root Cause: `SensorRepository.get_by_esp_and_gpio()` uses `scalar_one_or_none()` which fails when 2 sensors share GPIO 0 (SHT31 multi-value: temp + humidity)
- Impact: REST API DELETE endpoint broken for multi-value sensors
- Workaround: Direct DB cleanup via Python asyncpg script
- Status: NEEDS_ATTENTION (API bug to fix later)

### [13:00:30] [DESTRUCTIVE] [Database] Delete sensor_configs
- **Pre-State:** 2 rows in sensor_configs for ESP_472204
- **Command:** `scripts/cleanup_sensors.py` → `DELETE FROM sensor_configs WHERE esp_id = '3c4c4130-...'`
- **Post-State:** 0 rows in sensor_configs
- **Result:** DELETE 2
- **Reversible:** Yes (re-add sensors via API)
- **Rollback:** POST /api/v1/sensors/ESP_472204/0 with SHT31 config

### [13:00:31] [DESTRUCTIVE] [Database] Delete sensor_data
- **Pre-State:** 524 rows in sensor_data for ESP_472204
- **Command:** `scripts/cleanup_sensors.py` → `DELETE FROM sensor_data WHERE esp_id = '3c4c4130-...'`
- **Post-State:** 0 rows in sensor_data
- **Result:** DELETE 524
- **Reversible:** No (historical data lost)
- **Rollback:** N/A

### [13:01:00] [ACTION] [MQTT] Config push attempt (empty config)
- Command: `mosquitto_pub -t "kaiser/god/esp/ESP_472204/config" -m '{"sensors":[],"actuators":[],...}'`
- Result: Published, but ESP firmware rejects empty sensors array (handleSensorConfig line 2346: "Sensor config array is empty")
- Status: EXPECTED — ESP firmware does not process empty sensor arrays

### [13:01:30] [ACTION] [API] Restart command sent
- Command: `POST /api/v1/esp/devices/ESP_472204/restart`
- Result: HTTP 200, command_sent=true
- Issue: ESP firmware has NO handler for "REBOOT" command. Server sends `command: "REBOOT"` but ESP only handles `factory_reset`, `onewire/scan`, `status`, `diagnostics`, `get_config`, `safe_mode`, etc.
- Status: FAILED — ESP did not reboot (uptime continued at 2343s, boot_count=1)

### [13:03:00] [DESTRUCTIVE] [Database] Delete remaining sensor_data (accumulated during verification)
- **Pre-State:** 24 rows (new data from ESP still sending)
- **Command:** `scripts/cleanup_sensors_data.py` → `DELETE FROM sensor_data WHERE esp_id = '3c4c4130-...'`
- **Post-State:** 0 rows
- **Result:** DELETE 24
- **Reversible:** No
- **Rollback:** N/A

### [13:04:00] [INFO] [System] Final verification
- DB sensor_configs: **0** (clean)
- DB sensor_data: **0** (clean)
- DB esp_devices: ESP_472204 still registered, status=online (preserved)
- API sensor_count: **0**, actuator_count: **0**
- Zone: Echt (preserved)

---

### Summary

| Component | Status | Detail |
|-----------|--------|--------|
| DB sensor_configs | CLEAN | 2 rows deleted |
| DB sensor_data | CLEAN | 548 rows deleted total (524 + 24 accumulated) |
| ESP registration | PRESERVED | ESP_472204, online, zone=Echt |
| ESP NVS sensors | STILL PRESENT | ESP has 2 sensors in NVS (sensor_count=2 in heartbeat) |
| Data accumulation | ONGOING | Server saves data even without sensor_config ("Saving data without config") |

### Open Issues

1. **ESP NVS not cleared:** The ESP still has 2 sensors in NVS. Options to resolve:
   - Physical reset button on ESP (simplest)
   - Add `REBOOT` command handler to ESP firmware (missing feature)
   - Next config push (when adding new sensors) will overwrite NVS
   - `factory_reset` command works but also clears WiFi (too aggressive)

2. **API DELETE bug for multi-value sensors:** `DELETE /api/v1/sensors/{esp_id}/{gpio}` fails with HTTP 500 when multiple sensors share the same GPIO (SHT31 temp+humidity). Root cause: `get_by_esp_and_gpio()` returns multiple rows but `scalar_one_or_none()` expects one.

3. **Server saves data without config:** `sensor_handler.py` line 222 logs "Saving data without config" and still persists data. This means sensor_data will accumulate again until ESP stops sending.

### Cleanup Scripts Created
- `scripts/cleanup_sensors.py` — Deletes sensor_configs + sensor_data for a given ESP UUID
- `scripts/cleanup_sensors_data.py` — Deletes only sensor_data for a given ESP UUID
