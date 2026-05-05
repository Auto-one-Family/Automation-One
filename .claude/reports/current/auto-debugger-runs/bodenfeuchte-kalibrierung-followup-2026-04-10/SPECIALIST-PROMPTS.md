# SPECIALIST-PROMPTS — bodenfeuchte-kalibrierung-followup-2026-04-10

**Git:** Nur `auto-debugger/work`; kein Push durch Agenten.

## server-dev (PKG-01, PKG-04)

- **Pattern-Reuse:** `test_calibration_service.py` — bestehende `_create_bound_sensor` + `select`/`join` wie andere DB-Tests.
- **Verify:** `.\.venv\Scripts\python.exe -m pytest tests/unit/test_calibration_service.py tests/unit/test_moisture_processor.py tests/unit/test_calibration_payloads.py tests/integration/test_moisture_mqtt_flow.py --tb=short`
- **Fehler-Register:** `FEHLER-REGISTER.md` bei rotem pytest.

## frontend-dev (PKG-03)

- **Pattern-Reuse:** `normalizeCalibrationSensorType` / `moisture_2point` wie `useCalibrationWizard.ts`.
- **Verify:** `npx vue-tsc --noEmit`, `npx vitest run tests/unit/api/calibration.test.ts`, optional `npx vitest run tests/unit/composables/useCalibrationWizard.test.ts`

## Doku (PKG-02)

- `docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-operator-hinweis-2026-04-10.md` — SQL-Template nur, keine Secrets.

**Alert-Pfad:** nicht zentral (Kalibrierung).
