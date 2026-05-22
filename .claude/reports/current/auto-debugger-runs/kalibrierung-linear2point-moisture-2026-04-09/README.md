# Run `kalibrierung-linear2point-moisture-2026-04-09`

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-kalibrierungsflow-bodenfeuchte-linear2point-mismatch-2026-04-09.md`  
**Zieldokument:** `docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md`

## Verifikations-Checkliste (Repo-Read, Stand 2026-04-09)

- [x] Git-Branch `auto-debugger/work`, Referenz-Commit `00deff9` = HEAD zum Verifikationszeitpunkt
- [x] `useCalibrationWizard`: `method: 'linear_2point'` bei `calibrationApi.startSession` — `El Frontend/src/composables/useCalibrationWizard.ts`
- [x] `calibration_service`: `moisture_2point` → `_compute_moisture` (dry/wet); `linear_2point` → `_compute_linear_2point` (slope/offset) — `El Servador/god_kaiser_server/src/services/calibration_service.py`
- [x] `resolve_calibration_for_processor`: flaches `derived` — `El Servador/god_kaiser_server/src/services/calibration_payloads.py`
- [x] `MoistureSensorProcessor.process`: nur `dry_value`/`wet_value` sonst Default — `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py`
- [x] `sensor_handler`: `resolve_calibration_for_processor` nur im Pi-Enhanced-Zweig (`pi_enhanced and raw_mode`) — `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- [x] `sensor_manager.cpp`: `applyLocalConversion` ohne Feuchte-Zweig → Roh-Passthrough
- [x] Kein `import` von `useCalibration` außerhalb `useCalibration.ts` (Kommentar in Wizard behauptet Delegation, Import fehlt)
- [x] `normalize_sensor_type`: `soil_moisture` → `moisture` — `sensor_type_registry.py`

**Nicht in diesem Run:** Produktcode-Fix; nur IST-Bericht + diese Checkliste.
