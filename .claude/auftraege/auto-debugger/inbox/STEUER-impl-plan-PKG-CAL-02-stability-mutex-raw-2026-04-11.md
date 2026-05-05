---
run_mode: artefact_improvement
incident_id: ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11
run_id: impl-plan-pkg-cal-02-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-CAL-02-stability-mutex-raw-2026-04-11.md
scope: |
  **Auftrag:** Einen **einzigen**, **repo-verifizierten** Implementierungsplan für **PKG-CAL-02** erstellen
  (Stabilität: kontinuierlich vs. Wizard, Mutex, Rohwert-Kette, STDDEV-Regression vs. Referenz-ESP).

  **Quellen (Pflichtlektüre):**
  - `TASK-PACKAGES.md` (Abschnitt PKG-CAL-02)
  - `BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md` (STDDEV-Evidenz)
  - `docs/analysen/BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md` (GPIO32/33, zweiter Kanal)
  - Code: `calibration_response_handler.py` (kein DB-Fallback für `raw`), `sensor_handler.py` (Pi-Enhanced vs. raw),
    Scheduler-Sensorjobs (per Grep), optional Firmware-Steuerdatei `.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-esp32-manual-measure-mutex-2026-04-10.md` nur als **Referenz**, nicht doppelt implementieren ohne Abgleich.

  **Deliverable-Datei (exakt):**
  `.claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-CAL-02-stability-mutex-raw-2026-04-11.md`

  **Pflichtgliederung des Implementierungsplans:**
  1. Titel, Datum, Branch, Bezug PKG-CAL-02.
  2. **Vorbedingung:** PKG-HW-01/02 abgeschlossen oder dokumentierte Ausnahme („nur Server“, „nur FW“).
  3. **Hypothesen-Liste** mit je einer **messbaren** Verifikation (SQL STDDEV-Fenster, pytest, oder Serial-Trace — ohne erfundene Logs).
  4. **Schritte nummeriert:** Server vs. Firmware klar getrennte Teil-Pfade; Firmware: kein `delay()` in Hauptloop, kein Arduino-`String` (`.cursor/rules/firmware.mdc`).
  5. **Regression-Metrik:** definierter STDDEV-Schwellwert oder expliziter BLOCKER (Hardware).
  6. **Verify:** `pytest -k "calibration or moisture"` wie in TASK-PACKAGES; `pio run -e esp32_dev` wenn FW betroffen (WROOM; XIAO: `seeed_xiao_esp32c3`).
  7. **Abgrenzung:** keine erneute Änderung an `derived`-Schema wenn PKG-CAL-01 das bereits löst — stattdessen Verweis.

  **Gate:** verify-plan vor Delegation; bei Cross-Layer (ESP+Server) Reihenfolge im Plan festlegen.
forbidden: |
  Keine Secrets. Kein Watchdog-Disable in Firmware. Keine GPIO-Zugriffe ohne GPIOManager-Pattern (Firmware).
  Keine Commits auf `master`.
done_criteria: |
  `implementierungsplan-PKG-CAL-02-stability-mutex-raw-2026-04-11.md` existiert unter `target_docs[0]`.
  Plan nennt mindestens zwei Schichten (Server **und/oder** Firmware) mit **verifizierten** Pfaden.
  Metrik/Verify aus TASK-PACKAGES PKG-CAL-02 übernommen oder begründet abgewichen.
---

# STEUER — Implementierungsplan PKG-CAL-02 (Stabilität / Mutex / Rohwert)

**Paket-ID:** `PKG-CAL-02`

## Aktivierung

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-PKG-CAL-02-stability-mutex-raw-2026-04-11.md
```

## Reihenfolge

Nach **PKG-HW-01** (und sinnvoll nach **PKG-CAL-01**), sofern nicht im Plan explizit anders begründet.
