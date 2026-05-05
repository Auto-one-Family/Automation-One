---
run_mode: artefact_improvement
incident_id: ""
run_id: feuchte-calibration-response-fallback-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md
scope: |
  **Schicht:** El Servador — MQTT `CalibrationResponseHandler` (Kalibrier-Live-Messung).

  **Root-Cause-Cluster (aus BERICHT):** H2 — wenn die ESP-**Response** auf `…/sensor/{gpio}/response`
  kein `raw`/`raw_value` enthält, lädt der Handler per Retry `sensor_repo.get_latest_reading(...)`.
  Der „latest“-Datensatz kann von einem **periodischen** Messzyklus (z. B. 30s `continuous`) stammen
  und nicht vom manuellen `measure`-Kommando — dadurch falsche Rohwerte im WS
  `calibration_measurement_received`.

  **IST (repo-verifiziert):** `calibration_response_handler.py` Zeilen ~125–158: Retry-Schleife mit
  `get_latest_reading`; Kommentar „Firmware measure-ACK currently omits raw value“.

  **SOLL (Richtung, im verify-plan konkretisieren):** Kein blindes „latest“ für Kalibrier-Kontext
  ohne Bezug zur aktuellen `request_id`/`intent_id`. Mögliche Optionen (eine oder kombiniert, nach
  Machbarkeit im Repo):
  - **A)** Firmware/ESP liefert `raw` in der Response zuverlässig (bevorzugt mit STEUER Firmware;
    Handler dann seltener Fallback).
  - **B)** Request-scoped Zwischenstand: z. B. nach MQTT-Command bekannte `request_id` mit dem
    nächsten persistierten Reading für genau dieses GPIO verknüpfen (Zeitfenster + Korrelation), statt
    schlicht „latest“.
  - **C)** Wenn kein `raw` in der Payload: **kein** DB-Fallback für aktive Kalibrier-Session —
    stattdessen `calibration_measurement_failed` mit verständlicher Ursache (Operator sieht klares
    Feedback statt falschem Wert).

  **Abgrenzung:** Keine Änderung an SafetyService/LogicEngine; keine MQTT-Topic-Schema-Breaks ohne
  separates Gate; Pydantic v2 / async-Patterns des Projekts einhalten.
forbidden: |
  Keine Secrets, keine SQL-String-Interpolation. Keine `time.sleep` in async Code.
  Branch auto-debugger/work. Keine neuen Error-Codes ohne Eintrag in models/error_codes und
  ERROR_CODES.md falls öffentlich exponiert.
  Bash nur erlaubte Git-Kommandos.
done_criteria: |
  - `poetry run pytest` für betroffene Module + neuer/geänderter Tests grün (mindestens Handler-Tests:
    valide Message, fehlendes raw, fehlende Felder laut Backend-Regeln).
  - `poetry run ruff check src/` ohne neue Verstöße im geänderten Bereich.
  - VERIFY-PLAN-REPORT und mutierte TASK-PACKAGES unter
    `.claude/reports/current/auto-debugger-runs/feuchte-calibration-response-fallback-2026-04-10/`.
no_chat_questions: true
allow_user_escalation: false
---

# STEUER — Feuchte-Kalibrierung: CalibrationResponseHandler DB-Fallback

**Bezugs-Analyse:** `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md` (§3–5, H2, Tabelle §5)  
**Incident-Referenz:** `INC-2026-04-10-feuchte-wizard-messwert-streuung`  
**Orchestrierung:** `auto-debugger` → `server-dev` / bei MQTT-Vertrag `mqtt-dev` reviewen  
**Modus:** `artefact_improvement`

---

## 1. Problem-Lagebild

Der Wizard zeigt Rohwerte aus dem Pfad: **MQTT Response → CalibrationResponseHandler → WS**. Fehlt
`raw` in der Payload, wird der Wert aus der DB abgeleitet. Unter parallelem **Intervall-Messbetrieb**
ist „neuester DB-Eintrag“ nicht notwendigerweise die **manuelle** Messung — das erklärt Streuung
unabhängig vom Frontend-ID-Match (BERICHT §3 Schritt 4).

---

## 2. Pattern-Scan (Pflicht)

- **Analogfall:** Andere MQTT-Handler unter `src/mqtt/handlers/` mit `BaseHandler`, Exception-
  Logging, Tests in `tests/unit/` oder `tests/integration/`.
- **Repos:** `SensorRepository.get_latest_reading` — Signatur und Semantik per `Read`/`Grep` verifizieren
  vor Entwurf einer Alternative.
- **Publisher:** `publish_sensor_command` in `mqtt/publisher.py` — `request_id`/`intent_id` für
  End-to-End-Korrelation dokumentieren.

---

## 3. Arbeitspakete (Vorschlag)

### PKG-BE-01 — Analyse + minimal-invasive Strategie

**Owner:** server-dev  
**Dateien:**

- `El Servador/god_kaiser_server/src/mqtt/handlers/calibration_response_handler.py`
- ggf. `src/db/repositories/sensor_repo.py`
- optional: Abgleich mit ESP-Response-Shape (`El Trabajante` — nur lesen)

**Inhalt:**

1. Feststellen, **wann** `raw` in Produktion fehlt (Log-Evidenz aus STEUER Nachweis oder bestehende Logs).
2. Entscheidung A/B/C aus `scope` mit kleinstem risikoreichem Diff — **verify-plan** bestätigt Pfade.
3. Wenn Fallback bleibt: Einschränkung z. B. nur wenn `timestamp`/Reihenfolge zur `request_id` passt
   (konkret im Plan festlegen).

**Verify:**

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --tb=short -k "calibration_response"
```

(ggf. Pfad anpassen wenn Tests anders heißen — nach `Grep` auf `CalibrationResponseHandler`.)

### PKG-BE-02 — Unit-Tests

**Inhalt:** Handler-Test: Payload ohne `raw`, DB liefert älteren Intervallwert — **erwartetes**
Verhalten nach neuer Strategie (Failure oder korreliert); invalide Payload weiterhin abgefangen.

---

## 4. Schnittstellen

- **Frontend-STEUER:** WS broadcast kann um `request_id` erweitert werden, wenn Backend es mitschickt —
  gemeinsame Benennung im VERIFY-PLAN-REPORT abstimmen.
- **Firmware-STEUER:** Wenn ESP `raw` zuverlässig setzt, reduziert das Backend-Risiko — Reihenfolge:
  parallel möglich, Abnahme gesamt sinnvoll nach beiden.

---

## 5. Akzeptanz

- Kein stiller Erfolg mit fremdem Messwert im Kalibrier-Wizard-Kontext: entweder korrekter Rohwert
  oder klares `calibration_measurement_failed` / Logging.
- Alle Exceptions im Handler geloggt (Projektregel MQTT-Handler).
