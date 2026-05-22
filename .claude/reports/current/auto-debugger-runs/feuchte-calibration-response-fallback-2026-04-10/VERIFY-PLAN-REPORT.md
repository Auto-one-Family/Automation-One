# VERIFY-PLAN-REPORT — feuchte-calibration-response-fallback-2026-04-10

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-calibration-response-fallback-2026-04-10.md`  
**Datum:** 2026-04-10

## Reality-Check

| Referenz | Status | Bemerkung |
|----------|--------|-----------|
| `calibration_response_handler.py` | OK | DB-Fallback (`get_latest_reading` + Retry) entfernt — Option C |
| `El Trabajante/src/main.cpp` `handleSensorCommand` | OK | Bei `measure` + `request_id` wird `raw` bereits gesetzt (`measurement.raw_value`, Zeile ~4051) |
| `useCalibrationWizard.ts` | OK | `request_id` bereits in `measurementCorrelationCandidates`; WS-Payload ergänzt um `request_id` |
| `tests/unit/test_calibration_response_handler.py` | OK | Neuer Fall: fehlendes `raw` → `calibration_measurement_failed` |

**BLOCKER:** keine

## OUTPUT FÜR ORCHESTRATOR

- **Strategie:** C (kein blindes „latest“ bei fehlendem Rohwert); A im Repo bereits abgedeckt für den Standard-`measure`-Pfad mit `request_id`.
- **WS:** Erfolgs- und Fehler-Events tragen optional `request_id` (String) mit, wenn die MQTT-Payload es liefert.
