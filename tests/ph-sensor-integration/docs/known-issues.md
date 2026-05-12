# Known Issues for pH Sensor Tests

## Active Issues (affect test results)

### AUT-325 — On-Demand Incident 2026-05-10
MQTT Outbox Crash + Pipeline Fixes F1–F8. Some fixes may be only partially deployed.
**Impact on S3/S4/S6:** If on-demand measurement returns 429 (MeasurementBusyError), wait 10s and retry.

### D4 Gap — No ATC Badge When temp_sensor_config_id = null
SensorCard.vue shows no warning when temperature compensation is inactive.
**Documented in:** S1 Gap-Test Step 7. Not a test failure — expected behavior per AUT-373.

### AUT-303 — (reference TBD)
Check Linear for current status before S7/S8.

## Resolved Issues (context only)

### AUT-315 — ADC2 Pin Risk
GPIO verification for pH/EC: GPIO 32 confirmed as ADC1. Resolved 2026-05-09.

### AUT-308 — applyLocalConversion Inventory
pH = RAW passthrough confirmed. Resolved 2026-05-09.

### AUT-310 — ValueCache Cross-Sensor
pH code can read temp sensor cache slot. Resolved 2026-05-09.

## Notes

- AUT-316 / AUT-320 (pH ATC Server block): **merged** — `sensor_handler.py:369–414`, commit `7795f3fe`.
  S3 can test ATC directly.
