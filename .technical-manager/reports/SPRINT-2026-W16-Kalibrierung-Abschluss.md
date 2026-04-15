# Sprint W16/2026: Bodenfeuchte-Kalibrierung Abschluss

> **Zeitraum:** 14.–18. April 2026 (1 Woche)
> **Team:** KI-Agents (esp32-dev, server-dev, frontend-dev)
> **Sprint-Ziel:** Alle P0-Pakete der Bodenfeuchte-Kalibrierung abschließen, E2E-testbar, Feature-Flag-Ready

---

## IST-Stand (Codebase-Verifizierung 13.04.2026)

| Paket | Status | Notiz |
|-------|--------|-------|
| E-P1 Queue 10→20 | **PARTIAL** | Queue auf 20 erhöht, Overflow-Telemetrie-Event fehlt |
| E-P2 Outbox-Retry | **PARTIAL** | PublishOutbox vorhanden, 3x Retry-Logik unklar |
| E-P3 Timeout-Guard | **DONE** | 5s Timeout mit errorTracker implementiert |
| E-P8 Systemtest | **PARTIAL** | Calibration-Response-Handling da, Integration-Tests fehlen |
| S-P1 Type-Norm | **DONE** | normalize_sensor_type in sensor_type_registry.py |
| S-P2 Session-Tabelle | **DONE** | Alembic-Migration + Model vorhanden |
| S-P3 Session-Endpoints | **DONE** | 7 Endpoints (start/get/points/finalize/apply/reject/history) |
| S-P4 CalibrationService | **DONE** | Vollständig mit start/add_point/finalize/apply |
| S-P5 Intent/Outcome | **DONE** | intent_outcome_contract.py mit Lifecycle-Handler |
| S-P7 Measurement-ACK | **DONE** | trigger_measurement + calibration_response_handler |
| S-P10 Integration-Tests | **DONE** | 10+ Szenarien in test_calibration_session_routes.py |
| F-P1 State-Refactor | **DONE** | useCalibrationWizard.ts (182+ Zeilen) |
| F-P2 trigger-measure | **DONE** | triggerLiveMeasurement() + sensorsApi Integration |
| F-P4 Intent-Outcome UI | **PARTIAL** | Phase-Machine hat confirm→done, explizites "finalizing"-UI fehlt |
| F-P7 Inline entfernen | **PARTIAL** | CalibrationWizard noch in SensorConfigPanel importiert |
| F-P8 E2E Tests | **PARTIAL** | Unit-Tests da (8 Cases), Playwright E2E fehlt |

**Ergebnis:** 9 DONE, 6 PARTIAL, 0 OPEN → Sprint schließt die 6 PARTIAL-Pakete ab.

---

## Sprint-Backlog (6 Items)

### ESP32 — 2 Items

| # | Paket | Aufgabe | Aufwand | Agent |
|---|-------|---------|---------|-------|
| 1 | E-P1 | Overflow-Telemetrie-Event ins MQTT-Publish einfügen (queue_overflow_count in Status-Payload) | 0.25T | esp32-dev |
| 2 | E-P2 | Expliziter 3x Retry mit Backoff in PublishOutbox für sensor_data Topics | 0.5T | esp32-dev |

**Verifikation:** `cd "El Trabajante" && pio run -e seeed` → Exit-Code 0

### Frontend — 3 Items

| # | Paket | Aufgabe | Aufwand | Agent |
|---|-------|---------|---------|-------|
| 3 | F-P4 | "Finalizing"-Phase in CalibrationWizard.vue: Spinner + Status-Text während Intent-Outcome-Roundtrip | 1T | frontend-dev |
| 4 | F-P7 | Inline-Calibration aus SensorConfigPanel entfernen, nur noch Wizard-Pfad über HardwareView | 0.5T | frontend-dev |
| 5 | F-P8 | Playwright E2E: Happy Path, Timeout-Path, Resume-Path (3 Testfälle) | 1.5T | frontend-dev |

**Verifikation:** `cd "El Frontend" && npm run build && npx vue-tsc --noEmit` → keine Errors

### Cross-Layer — 1 Item

| # | Paket | Aufgabe | Aufwand | Agent |
|---|-------|---------|---------|-------|
| 6 | E-P8 | Cross-Layer Systemtest: Server triggert → ESP liefert → Server persistiert → Frontend zeigt "persisted" | 1T | esp32-dev + server-dev |

**Verifikation:** Alle Bereichs-Checks grün + E2E-Testlog dokumentiert

---

## Tagesplan

### Montag 14.04 — Foundation Fixes (parallel)

| Slot | ESP32 | Frontend |
|------|-------|----------|
| VM | #1 E-P1 Overflow-Telemetrie | #3 F-P4 Finalizing-Phase (Start) |
| NM | #2 E-P2 Outbox-Retry | #3 F-P4 (Fortsetzung) |

**Tages-Gate:** `pio run -e seeed` grün, F-P4 Grundstruktur steht

### Dienstag 15.04 — Frontend Cleanup

| Slot | ESP32 | Frontend |
|------|-------|----------|
| VM | ESP32-Verifikation + Docs | #3 F-P4 (Abschluss + Tests) |
| NM | — | #4 F-P7 Inline entfernen |

**Tages-Gate:** `npm run build` + `vue-tsc --noEmit` grün, Inline-Pfad entfernt

### Mittwoch 16.04 — E2E Tests

| Slot | ESP32 | Frontend |
|------|-------|----------|
| VM | — | #5 F-P8 Playwright Happy Path |
| NM | — | #5 F-P8 Timeout + Resume Path |

**Tages-Gate:** 3 Playwright-Tests grün

### Donnerstag 17.04 — Cross-Layer Integration

| Slot | Wer | Aufgabe |
|------|-----|---------|
| VM | esp32-dev + server-dev | #6 E-P8 Cross-Layer Systemtest aufsetzen |
| NM | esp32-dev + server-dev | #6 E-P8 Testdurchlauf + Fixes |

**Tages-Gate:** Cross-Layer Flow End-to-End verifiziert

### Freitag 18.04 — Sprint-Abschluss

| Slot | Aufgabe |
|------|---------|
| VM | Regressionstest: alle Verifikationsbefehle durchlaufen |
| NM | Sprint-Review-Doku, Carryover-Assessment |

**Sprint-Gate:**
- `cd "El Trabajante" && pio run -e seeed` ✅
- `cd "El Servador/god_kaiser_server" && pytest --tb=short -q` ✅
- `cd "El Servador/god_kaiser_server" && ruff check .` ✅
- `cd "El Frontend" && npm run build` ✅
- `cd "El Frontend" && npx vue-tsc --noEmit` ✅

---

## Sprint-Ziele (Definition of Done)

1. **Kalibrierflow E2E:** User kann Wizard starten → Messpunkte sammeln (Live!) → Finalize → Apply, mit sichtbarem Finalizing-Status
2. **Kein Inline-Pfad:** SensorConfigPanel hat keine eigene Kalibrierlogik mehr
3. **Testabdeckung:** 3 Playwright E2E-Tests + Cross-Layer Systemtest dokumentiert
4. **ESP32 Robustheit:** Queue-Overflow gemeldet, Outbox-Retry aktiv
5. **Alle Verifikationsbefehle grün** (siehe Sprint-Gate)

---

## Risiken

| Risiko | Wahrsch. | Impact | Mitigation |
|--------|----------|--------|------------|
| F-P7 Entfernung bricht andere Flows | Mittel | Mittel | Feature-Flag lässt alten Pfad erreichbar |
| Playwright-Setup braucht länger | Niedrig | Niedrig | Falls nötig: Vitest component tests als Fallback |
| Cross-Layer-Test scheitert an Docker-Setup | Mittel | Hoch | Lokaler Mock-ESP als Fallback |

---

## Kapazitätsübersicht

| Gesamt-Aufwand | Verfügbar (5 Tage) | Puffer |
|----------------|---------------------|--------|
| ~4.75T | 5T (parallel-fähig) | ~0.25T |

Sprint ist machbar in 1 Woche mit paralleler Agent-Arbeit. Freitag dient als Puffer + Verifikation.

---

*Basis: SYNTHESE-P0-Implementierungsplan.md (06.04.2026), Codebase-Verifizierung 13.04.2026*
