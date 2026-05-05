# TASK-PACKAGES — bodenfeuchte-kalibrierung-followup-2026-04-10

Nach **verify-plan:** Pfade und Befehle aus STEUER bestätigt; keine Pfadkorrektur nötig.

## PKG-01 — Backend-Test Persistenz `derived` nach `apply`

- **Datei:** `El Servador/god_kaiser_server/tests/unit/test_calibration_service.py`
- **Verify:** `cd "El Servador/god_kaiser_server" && .\.venv\Scripts\python.exe -m pytest tests/unit/test_calibration_service.py -q --tb=short`

## PKG-02 — Doku Operator / Altdaten

- **Datei:** `docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-operator-hinweis-2026-04-10.md`

## PKG-03 — Frontend `calibrationApi.calibrate` JWT

- **Datei:** `El Frontend/src/api/calibration.ts`
- **Optional:** `El Frontend/tests/unit/api/calibration.test.ts`
- **Verify:** `npx vue-tsc --noEmit`, `npx vitest run tests/unit/api/calibration.test.ts -q` (falls Test angelegt)

## PKG-04 — Regression

- Wie STEUER PKG-04 (pytest-Liste + ruff + vue-tsc)
