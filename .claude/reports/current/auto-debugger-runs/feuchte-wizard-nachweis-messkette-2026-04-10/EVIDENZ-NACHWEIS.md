# EVIDENZ-NACHWEIS — Kurzaddendum (Run-Ordner)

**Zweck:** Ergänzung zu `docs/analysen/BERICHT-…` ohne Änderung an `docs/` (Steuer: optional).

## Priorisierung Fix-STEUER nach diesem Nachweis

1. **Laufzeit-Traces vollständig** aus `CORRELATION-MAP.md` — ohne diese bleibt jede Priorisierung hypothetisch.  
2. **H3 Firmware (Mutex):** bei Serial-Nachweis paralleler Pfade → `STEUER-feuchte-esp32-manual-measure-mutex-2026-04-10.md`.  
3. **Frontend:** nur wenn WS-IDs **trotz** aktueller `matchesActiveMeasurementRequest`-Logik nicht passen → `STEUER-feuchte-wizard-frontend-messkorrelation-2026-04-10.md`.  
4. **Backend-Fallback:** BERICHT-H2 ist gegen aktuellen `calibration_response_handler` zu **aktualisieren**; separates PKG nur bei wiederkehrendem `calibration_measurement_failed` ohne ESP-Fehler → `STEUER-feuchte-calibration-response-fallback-2026-04-10.md`.

## Offen (BLOCKER Orchestrator)

Keine echten MQTT-/Serial-/WS-Zeilen in der Agenten-Umgebung erzeugt — **Robin** führt PKG-01–05 lokal aus und trägt Ergebnisse in `CORRELATION-MAP.md` ein.
