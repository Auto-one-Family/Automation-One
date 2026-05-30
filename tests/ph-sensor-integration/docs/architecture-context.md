# Architecture Context for pH Sensor Tests

Source: AUT-305, AUT-306, AUT-320, IST-Analysis 2026-05-12

## pH Measurement Pipeline

```
ESP32 ADC (GPIO 32)
  → RAW value (applyLocalConversion: passthrough for ph, sensor_manager.cpp:60-87)
  → MQTT publish
  → sensor_handler.py receives raw_value
  → pH ATC block (lines 369-414, AUT-320)
  → _try_get_atc_temperature() (line 1026, shared with EC)
  → _trigger_pi_enhanced_processing()
  → calibration applied (CalibrationService)
  → sensor_data persisted
  → WebSocket broadcast → Frontend
```

## Calibration System

States: `PENDING` → `COLLECTING` → `FINALIZING` → `APPLIED` / `REJECTED` / `EXPIRED` / `FAILED`

- Session TTL: 24h from `updated_at` (lazy expiry, no background job)
- P4-GUARD: `CALIBRATION_REQUIRED_SENSOR_TYPES = {"ph", "ec", "moisture", "soil_moisture"}`
- CalibrationService in server, CalibrationWizard.vue in frontend
- Wizard access: `/calibration` route → `CalibrationView.vue` (requiresAdmin: true)

## Temperature Compensation (ATC)

- Field: `temp_sensor_config_id` (UUID FK → sensor_configs.id, ON DELETE SET NULL)
- Migration: `aut299_temp_sensor_config_id` (2026-05-08, AUT-299)
- Logic: `_try_get_atc_temperature()` — 3-tier cache policy:
  - Fresh (<5s): use cached value, source=`cached`
  - Stale (5–90s): use with warning, source=`cached_stale`
  - Expired (>90s) or read_failed: abort measurement, emit WS event
  - No sensor configured: fallback 25.0°C, source=`default_25c`
- Priority 1: explicit `temp_sensor_config_id` link
- Priority 2: auto-discovery (same ESP, same GPIO bus)

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/auth/login` | POST | - | Login, returns JWT |
| `/api/v1/sensors/{esp_id}` | GET | Operator | List sensor configs for ESP |
| `/api/v1/sensors/{esp_id}/{gpio}` | POST | Operator | Create or update sensor config (upsert) |
| `/api/v1/sensors/{esp_id}/{gpio}/measure` | POST | Operator | Trigger on-demand measurement (fire-and-forget) |
| `/api/v1/sensors/data` | GET | Operator | Query sensor_data (params: esp_id, gpio, sensor_type, limit) |

## WebSocket

- **Endpoint:** `ws://<host>/ws/realtime/{client_id}?token=<jwt>`
- **Auth:** JWT access token as query param
- **Subscribe:** `{"action": "subscribe", "filters": {"types": ["sensor_data"], "esp_ids": ["ESP_XXXXXX"]}}`
- **Message format:** `{"type": "sensor_data", "timestamp": <unix_s>, "data": {...}, "correlation_id": "..."}`
- **Relevant types for S3:** `sensor_data`, `error_event`
- **ATC abort event (3c):** `{"type": "error_event", "data": {"error_type": "atc_read_failed", ...}}`

## Known UX Gap D4

When `temp_sensor_config_id = null`: SensorCard.vue shows **no badge, no warning**.
25°C fallback is treated as normal state. ATC-inactive state is not communicated to user.
See AUT-373 for documented gap.
