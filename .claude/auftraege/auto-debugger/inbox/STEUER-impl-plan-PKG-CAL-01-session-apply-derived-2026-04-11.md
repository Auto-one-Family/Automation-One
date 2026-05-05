---
run_mode: artefact_improvement
incident_id: ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11
run_id: impl-plan-pkg-cal-01-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-CAL-01-session-apply-derived-2026-04-11.md
scope: |
  **Auftrag:** Einen **einzigen**, **repo-verifizierten** Implementierungsplan für **PKG-CAL-01** erstellen
  (Session → Finalize/Apply → `sensor_configs.calibration_data` → `resolve_calibration_for_processor` → Pi-Enhanced Moisture).

  **Quellen (Pflichtlektüre):**
  - `TASK-PACKAGES.md` (Abschnitt PKG-CAL-01) + Post-Verify-Hinweis **GPIO 32 vs. 33** für ESP_EA5484
  - `BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`
  - Code: `El Servador/god_kaiser_server/src/services/calibration_payloads.py`,
    Calibration-Session-Routen/Services (per Grep `finalize`, `apply`, `CalibrationSession`),
    `sensor_service.py` (`process_reading`, `resolve_calibration_for_processor`),
    `tests/integration/test_calibration_session_routes.py`
  - Optional Querverweis (kein Doppel-Implementieren): `implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md` nur für **bereits** beschlossene Muster.

  **Deliverable-Datei (exakt):**
  `.claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-CAL-01-session-apply-derived-2026-04-11.md`

  **Pflichtgliederung des Implementierungsplans:**
  1. Titel, Datum, Branch, Bezug PKG-CAL-01.
  2. **Vorbedingung:** expliziter Abschnitt „Ziel-GPIO EA5484“ — Plan darf **keine** Implementierung starten ohne dokumentierte Entscheidung 32/33 oder „BLOCKER: nur nach HW-01“.
  3. **IST:** Datenfluss Session-Points → gespeicherte `calibration_data`-Form (mit Verweis auf echte Serializer/Models).
  4. **SOLL:** `derived` enthält Keys, die `MoistureSensorProcessor.process` erwarten; Verhalten von `resolve_calibration_for_processor` berücksichtigen.
  5. **Schritte nummeriert:** Backend-only im Scope; Pydantic v2, `async def` für I/O, Exceptions in MQTT-Handlern (`.cursor/rules/backend.mdc`).
  6. **Tests:** konkrete pytest-Dateien/Funktionen erweitern.
  7. **Verify:** `pytest tests/integration/test_calibration_session_routes.py`, `ruff check` auf geänderte Pfade.
  8. **Abgrenzung:** kein Mutex/Wizard-Rohwert-Fix (das ist PKG-CAL-02).

  **Gate:** Vor Code-Delegation verify-plan ausführen; OUTPUT-BLOCK für Orchestrator bei PKG-Änderungen.
forbidden: |
  Keine Secrets. Keine Breaking Changes an öffentlichen REST-Verträgen ohne Gate.
  Kein `time.sleep` in async Code. Keine Schema-Drops in DB ohne Alembic-Disziplin.
  Keine Commits auf `master`.
done_criteria: |
  `implementierungsplan-PKG-CAL-01-session-apply-derived-2026-04-11.md` existiert unter `target_docs[0]`.
  Plan enthält Vorbedingung GPIO und mindestens drei **verifizierte** Backend-Dateipfade.
  Verify-Befehle stimmen mit TASK-PACKAGES PKG-CAL-01 überein (oder dokumentierte Abweichung mit Begründung).
---

# STEUER — Implementierungsplan PKG-CAL-01 (Session → derived → Processor)

**Paket-ID:** `PKG-CAL-01`

## Aktivierung

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-PKG-CAL-01-session-apply-derived-2026-04-11.md
```

## Abhängigkeit

Empfohlen nach **PKG-HW-01** (Config-Telemetrie-Kohärenz); im Plan als BLOCKER/Vorbedingung klar markieren, wenn parallel nicht sinnvoll.
