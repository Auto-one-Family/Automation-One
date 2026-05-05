# TASK-PACKAGES — feuchte-calibration-response-fallback-2026-04-10

**Status:** PKG-BE-01 / PKG-BE-02 umgesetzt (Code + Tests).

## PKG-BE-01 — Handler (server-dev)

- [x] `get_latest_reading`-Fallback entfernt; klare Fehlermeldung bei fehlendem `raw`/`raw_value`
- [x] `request_id` in WebSocket-Broadcasts durchgereicht (wo in MQTT vorhanden)
- [x] Imports bereinigt (`ESPRepository`, `SensorRepository`, `asyncio` Retry entfallen)

## PKG-BE-02 — Tests

- [x] `test_missing_raw_emits_failure_without_db_fallback` — erwartet `calibration_measurement_failed` + `request_id`

## Follow-up (optional)

- `.claude/reference/api/WEBSOCKET_EVENTS.md`: Eintrag `request_id` bei Kalibrierungs-WS-Events nur bei Bedarf nachziehen (nicht Teil des Minimal-Diffs).
