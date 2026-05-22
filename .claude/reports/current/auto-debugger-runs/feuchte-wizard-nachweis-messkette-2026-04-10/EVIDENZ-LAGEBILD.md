# Evidenz-Lagebild — Feuchte-Wizard Messkette (Nachweis)

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-wizard-nachweis-messkette-2026-04-10.md`  
**Run-ID:** `feuchte-wizard-nachweis-messkette-2026-04-10`  
**Bezugs-Analyse:** `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md`  
**Incident-Referenz (Kontext):** `INC-2026-04-10-feuchte-wizard-messwert-streuung`  
**Zeitstempel Orchestrierung:** 2026-04-10  

## Git (Pflicht)

- **Aktueller Branch:** `auto-debugger/work`  
- **Soll-Branch:** `auto-debugger/work`  

## Symptom (aus BERICHT §2)

Mehrfaches „Messung starten“ im Kalibrierwizard → schwankende Roh-ADC-Werte; subjektiv trocken/nass vertauscht.

## IST Repo vs. BERICHT (Drift — vor Laufzeit-Nachweis)

| Thema | BERICHT §3–5 (Stand Analyse-Commit) | Repo-IST (verifiziert im Nachweis-Lauf) |
|--------|-------------------------------------|----------------------------------------|
| **H1 Frontend** | Kein Abgleich `intent_id`/`correlation_id` ↔ `measurementRequestId` | `useCalibrationWizard.ts`: `matchesActiveMeasurementRequest` + `measurementCorrelationCandidates` (message/top-level `correlation_id`, `intent_id`, `request_id`) |
| **H2 Backend** | `get_latest_reading`-Fallback bei fehlendem `raw` | `calibration_response_handler.py`: bei fehlendem `raw` **kein** DB-Fallback; Warnlog + `calibration_measurement_failed` (Docstring Zeilen 27–29) |
| **Messpunkt-BERICHT §8** | weiterhin sinnvoll | Laufzeit-Traces fehlen im Orchestrator-Workspace — **BLOCKER für „echte“ Zeilen/IDs** bis lokaler Repro |

**Risiko:** Runtime-Symptom kann an **älterem** Deployment liegen; Abnahme immer gegen **deployten** Commit + denselben Repro.

## Hypothesen-Cluster — empfohlene Fix-Reihenfolge (nach Laufzeit-Evidenz)

Ohne MQTT/Serial/WS-Zeilen bleibt die Priorisierung **provisorisch**:

1. **Nachweis zuerst** (dieser Run): Korrelation `request_id` über Server-Log → MQTT → WS (siehe `CORRELATION-MAP.md`).  
2. **Wenn Serial Mutex-Überlappung (H3):** `STEUER-feuchte-esp32-manual-measure-mutex-2026-04-10.md` vor weiteren UI-Änderungen.  
3. **Wenn WS zeigt noch Cross-Talk trotz Match-Logik:** `STEUER-feuchte-wizard-frontend-messkorrelation-2026-04-10.md` (Regression/Edge-Case).  
4. **Backend-Fallback:** BERICHT-H2 ist im aktuellen Handler obsolet; `STEUER-feuchte-calibration-response-fallback-2026-04-10.md` nur prüfen, wenn weiterhin `calibration_measurement_failed` ohne erkennbaren ESP-Fehler auftritt.

## Eingebrachte Erkenntnisse

- 2026-04-10 — Orchestrierung: Lagebild angelegt; Drift BERICHT↔Repo dokumentiert; kein Laufzeit-Trace durch Agent erzeugt (BLOCKER: ausführende Umgebung).
