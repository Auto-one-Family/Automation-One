---
run_mode: artefact_improvement
incident_id: ""
run_id: bodenfeuchte-vollimpl-2026-04-10
order: artefact_first
target_docs:
  - docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md
scope: |
  Vollständige Nachverfolgung der IST/SOLL-Verifikation Bodenfeuchte: (1) Operator-Pfad für bestehende
  defekte calibration_data-Zeilen (Re-Kalibrierung); optional (2) Backend-Legacy-Shim in
  resolve_calibration_for_processor für alte linear_2point-Derived mit point1_raw/point2_raw und
  Referenzen 0/100 — nur nach verify-plan und eigenem PKG-02; (3) Tests erweitern; (4) Verifikation
  pytest/vue-tsc/ruff wie unten. Branch auto-debugger/work; keine MQTT-Topic-Änderung.
forbidden: |
  Keine Secrets in Artefakten oder SQL-Beispielen. Keine Breaking Changes an öffentlichen REST-Response-Schemata
  ohne explizite API-Versionierung. Keine Änderung der MQTT-Topic-Namen. Kein git push --force.
  Firmware nur bei eigenem Scope-PKG und verify-plan. DB: keine DROP/TRUNCATE; Migrationen nur reviewbar.
done_criteria: |
  - PKG-01: Betriebs-Checkliste für betroffene Sensoren ausgeführt oder dokumentiert (kein Treffer = OK).
  - PKG-02 (falls gewählt): resolve_calibration_for_processor mappt dokumentierte Legacy-Form → flaches
    dry_value/wet_value für moisture; pytest src-Tests grün.
  - PKG-03: test_calibration_payloads + ggf. test_moisture_mqtt_flow erweitert; alle genannten Verify-Befehle Exit 0.
  - Dokument: Kurzvermerk in docs/analysen/ oder Verifikationsdatei „Operator abgeschlossen“ — oder Verweis auf Ticket.
---

# STEUER — Bodenfeuchte-Kalibrierung: Vollimplementierung (Nachlauf zur Verifikation 2026-04-10)

**Bezug:** `docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md` (HEAD-Stand bei Erstellung: `5fba29a`).  
**Agent (Ausführung):** nach **`/verify-plan`**-Gate: `server-dev` / `frontend-dev` nur bei Code-PKG; sonst Operator.

---

## Executive Summary

Die **kanonische Methode** bleibt **Option (a)**: Feuchte-Kalibrierung liefert **`derived`** mit **`type: moisture_2point`** und **`dry_value`/`wet_value`** (Finalize über `CalibrationService._compute_calibration`). Der **MoistureSensorProcessor** nutzt genau diese Keys; **ältere DB-Zeilen** mit **`linear_2point`**-Derived ohne dry/wet müssen **betrieblich nachgezogen** werden (Re-Kalibrierung) **und/oder** durch einen **kleinen Legacy-Adapter** in `resolve_calibration_for_processor` entschärft werden — letzteres nur nach **verify-plan** und **PKG-02**.

---

## IST → SOLL — Delta-Tabelle

| Komponente | Änderung | Risiko |
|------------|----------|--------|
| `sensor_configs.calibration_data` (Prod) | Alte `linear_2point`-Derived für moisture → neue Session + Apply **oder** Adapter | Mittel (Daten) |
| `calibration_payloads.py` | Optional: Legacy-Mapping linear_2point → dry/wet für moisture | Niedrig–Mittel (Semantik) |
| Tests | Neue Fälle für Legacy-Shape + Resolver | Niedrig |
| Operator | Anleitung Re-Kalibrierung GPIO/ESP | Niedrig |

---

## Arbeitspakete (Reihenfolge)

### PKG-01 — Betrieb: Bestand prüfen & Re-Kalibrierung (kein Code)

**Ziel:** Alle Produktions-Sensoren `sensor_type` moisture (bzw. normalisiert), bei denen `calibration_data->derived->type` = `linear_2point` **und** keine `dry_value`/`wet_value` im flachen Resolver-Ergebnis wirken, **neu kalibrieren** (Wizard durchlaufen, Finalize, Apply).

**Schritte (checkbox):**

- [ ] Read-only: SQL-Stichprobe (PostgreSQL) — `sensor_configs` join/filter auf `calibration_data::jsonb`, Feuchte-Sensoren; Shape dokumentieren (keine Secrets).
- [ ] Pro betroffenem Eintrag: ESP/GPIO notieren; Operator kalibriert nach UI-Standard.
- [ ] Nach Apply: Stichprobe `sensor_configs.calibration_data` — `derived.type` = `moisture_2point` oder Resolver liefert dry/wet.

**Verify:** Kein Repo-Befehl — dokumentierter Nachweis in Ticket/Notiz.

**Abhängigkeit:** Keine — **zuerst** ausführen, wenn Datenzugriff möglich.

---

### PKG-02 — Backend (optional): Legacy in `resolve_calibration_for_processor`

**Ziel:** Wenn `derived` **`type: linear_2point`** enthält **und** `sensor_type` moisture erkennbar aus Payload/Metadaten **oder** Heuristik über `point1_ref`/`point2_ref` ∈ {0,100} und vorhandene `point*_raw`: flaches **`dry_value`/`wet_value`** für den Processor ableiten (ein klarer, kommentierter Zweig — kein Umbau der Finalize-Logik).

**Dateien:** `El Servador/god_kaiser_server/src/services/calibration_payloads.py` (primär).

**Akzeptanz:**

- [ ] Neue Unit-Tests in `tests/unit/test_calibration_payloads.py`: mindestens ein JSON-Fixture wie historisches `linear_2point`-Derived mit `point1_raw`/`point2_raw` → `resolve_calibration_for_processor` liefert `dry_value`/`wet_value`.
- [ ] Bestehende Tests unverändert grün.

**Verify (exakt):**

```text
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/test_calibration_payloads.py -q --tb=short
poetry run ruff check src/services/calibration_payloads.py
```

**Abhängigkeit:** Nach PKG-01 **oder** parallel wenn DB nicht blockiert — **nach** verify-plan-Freigabe für dieses PKG.

---

### PKG-03 — Tests: Regression Finalize → derived → Processor

**Ziel:** Absicherung der Kette wie in Verifikationsmatrix §6.

**Dateien:** ggf. `tests/unit/test_calibration_service.py`, `tests/integration/test_moisture_mqtt_flow.py`.

**Akzeptanz:**

- [ ] Mindestens ein Test, der explizit **`finalize`-nahe** canonical payload (aus `build_canonical_calibration_result`) + `resolve` + `MoistureSensorProcessor.process` verbindet — falls nicht schon vollständig durch bestehende Tests abgedeckt (siehe `test_moisture_mqtt_flow.py` „Canonical calibration → Processor“).

**Verify:**

```text
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/test_calibration_service.py tests/integration/test_moisture_mqtt_flow.py -q --tb=short
```

**Abhängigkeit:** Nach PKG-02 **oder** überspringen wenn nur PKG-01 (nur dann Test-Erweiterung optional streichen).

---

### PKG-04 — Frontend-Sanity (nur bei Änderung)

**Ziel:** Keine Regression in `useCalibrationWizard.ts`.

**Verify:**

```text
cd "El Frontend"
npx vue-tsc --noEmit
```

**Abhängigkeit:** Nur wenn Frontend in diesem Lauf geändert wird — sonst **optional** einmalig CI-nah.

---

## Daten-Migration / Operator

**Primär:** Kein automatisches SQL-Update von Produktionsdaten ohne Review. **Empfohlen:** Re-Kalibrierung (PKG-01).

**Rollback:** Vor manueller JSON-Manipulation Backup-Row exportieren (`COPY`/`SELECT` in gesicherte Tabelle).

**Optional (nur mit DBA-Review):** Einmal-`UPDATE` von `calibration_data` **nur**, wenn identische Punkte bereits im JSON stehen und Ziel-Shape validiert wurde — **nicht** Teil des Mindestumfangs.

---

## Regressionstests-Liste (müssen grün sein)

- `tests/unit/test_calibration_service.py` (insb. `test_compute_calibration_linear_moisture_maps_to_moisture_2point_derived`)
- `tests/unit/test_moisture_processor.py`
- `tests/unit/test_calibration_payloads.py` (nach PKG-02 erweitert)
- `tests/integration/test_moisture_mqtt_flow.py` (Canonical-Pfad)

**Gesamt-Verify (Backend):**

```text
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/test_calibration_service.py tests/unit/test_moisture_processor.py tests/unit/test_calibration_payloads.py tests/integration/test_moisture_mqtt_flow.py -q --tb=short
```

---

## forbidden / done_criteria

Siehe YAML-Frontmatter oben — für Implementierungsläufe **kopieren**.

---

## SPECIALIST-PROMPTS (Kurzblock)

Jeder Dev-Block muss enthalten: **Git (`auto-debugger/work`)**, **Pattern-Reuse** (closest: `resolve_calibration_for_processor`, `test_calibration_payloads`), **Verify-Befehl** wie oben, **Fehler-Register** bei Code-PKGs (Mikrozirkular). Vollständiges Gerüst: `.claude/agents/auto-debugger.md` §0a.

**verify-plan OUTPUT:** Vor PKG-02/03 Skill `verify-plan` auf diese Datei + betroffene Pfade anwenden; Ergebnis in `.claude/reports/current/auto-debugger-runs/bodenfeuchte-vollimpl-2026-04-10/VERIFY-PLAN-REPORT.md` ablegen.

---

## Aktivierung (Robin)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md
Bitte PKG-01ff. nach verify-plan; Branch auto-debugger/work; kein Scope-Drift.
```
