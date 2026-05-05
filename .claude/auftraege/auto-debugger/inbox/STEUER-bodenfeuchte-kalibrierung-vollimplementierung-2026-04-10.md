---
run_mode: artefact_improvement
incident_id: ""
run_id: bodenfeuchte-kalibrierung-followup-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md
scope: |
  Folgelauf nach abgeschlossener IST/SOLL-Verifikation (2026-04-10): Der Kernpfad Option (a)
  (Frontend moisture_2point, Backend linear_2point+moisture → moisture_2point-derived, Resolver,
  Processor) ist im Repo unter auto-debugger/work umgesetzt. Diese STEUER adressiert **Restarbeit**:
  (1) harte Test-Assertion Finalize→Apply→persistierte calibration_data, (2) Operator-/DB-Hinweise
  für Altbefunde ohne Neu-Kalibrierung, (3) Frontend: JWT-Fallback `calibrationApi.calibrate()` startet
  Sessions fuer Feuchte mit `moisture_2point` (wie Wizard; siehe VERIFIKATION Matrix 2.2), (4) optionale
  Typschärfe Client, (5) kurze Doku-Ergänzung.
  Keine MQTT-Topic-Änderungen, keine SafetyController/Logic-Engine-Eingriffe.
forbidden: |
  Keine Secrets, Tokens, Passwörter oder produktiven Connection-Strings in Artefakten oder SQL-Beispielen.
  Branch auto-debugger/work für alle Produktänderungen; kein git push / --force durch Agenten.
  Keine Breaking Changes an REST-Response-Schemas ohne separates Review-Gate.
  Bash nur: git status, branch, checkout, diff (read-only) wie in Projektregeln.
done_criteria: |
  - PKG-01: Test erweitert; pytest für betroffene Datei grün; ruff für src/ unverändert grün oder nur erwartete Fixes.
  - PKG-02: Operator-Abschnitt (SQL SELECT-Template + Handlungsempfehlung) in docs/analysen eingecheckt.
  - PKG-03: `calibrate()` setzt fuer Feuchte `moisture_2point` ODER im Run-README begründet ausgespart; optional TS-Union dokumentiert.
  - Alle Referenztests aus Regressionstests-Liste grün nach Änderung.
  - verify-plan-OUTPUT für Orchestrator vor erster Code-Delegation dokumentiert (VERIFY-PLAN-REPORT im Run-Ordner).
no_chat_questions: true
allow_user_escalation: false
---

# STEUER — Bodenfeuchte Kalibrierung: Implementierungs-Folgelauf (Restarbeit)

**Bezug:** `docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md`  
**Agent (Orchestrierung):** `auto-debugger` → Delegation `server-dev` / `frontend-dev` / Doku  
**Modus:** `artefact_improvement` (kein separates Incident)

---

## Executive Summary (eine kanonische Methode)

Die **kanonische** Produktentscheidung bleibt **Option (a)** aus dem Implementierungsplan 2026-04-09: Nach Feuchte-Kalibrierung muss die gespeicherte bzw. aufgelöste Kalibrierung **`dry_value`/`wet_value`** für den **`MoistureSensorProcessor`** liefern. Im aktuellen Code geschieht das über **`moisture_2point`** und den Backend-Fallback **`linear_2point` + `sensor_type` moisture → `_compute_moisture_from_role_points`**. Diese STEUER ergänzt **Absicherung und Betrieb**, nicht die Kernlogik — außer **Persistenz-Assertion** in Tests und **JWT-`calibrate()`-Konsistenz** (Matrix 2.2 im IST-Dokument).

---

## IST→SOLL-Delta (Rest)

| Komponente | Änderung | Risiko |
|------------|----------|--------|
| `tests/unit/test_calibration_service.py` | Nach `apply`: **`SensorConfig.calibration_data`** muss **`derived`** mit **`dry_value`/`wet_value`** (und `type: moisture_2point`) enthalten — Assertion + ggf. `resolve_calibration_for_processor`-Check. | Niedrig — rein Test. |
| `docs/analysen/` | Kurzes Addendum: SQL zur Erkennung von Legacy-Rows (`derived.type = linear_2point` ohne dry/wet bei Feuchte); Empfehlung **Neu-Kalibrierung**. | Kein technisches Risiko. |
| `El Frontend/src/api/calibration.ts` | JWT-Fallback (`calibrate` ohne API-Key): `startSession` nutzt noch `linear_2point` für Nicht-offset — für Feuchte auf **`moisture_2point`** umstellen (Normalisierung `soil_moisture` → `moisture` wie `useCalibrationWizard` `173:176`). Optional danach: `method` als Union typisieren. | Niedrig — Server mappt Legacy zwar; Konsistenz + Klarheit. |

---

## Arbeitspakete (reihenfolgetreu; PKG-N+1 nach grünem Verify von PKG-N)

### PKG-01 — Backend-Test: Apply persistiert brauchbare Feuchte-`derived`

**Owner:** server-dev  
**Dateien (verifiziert):**

- `El Servador/god_kaiser_server/tests/unit/test_calibration_service.py`
- bei Bedarf Hilfsimport: `src.services.calibration_payloads.resolve_calibration_for_processor`
- DB-Model: `SensorConfig` laden nach `apply` (gleiche Session `esp_id`/`gpio`)

**Inhalt:**

1. Erweitere **`test_calibration_service_add_finalize_apply_flow`** oder füge **`test_moisture_finalize_apply_persists_moisture_2point_derived`** hinzu:
   - Nach `await service.apply(session.id)` die **`SensorConfig`** für `ESP_TEST_001` / `gpio=4` aus der DB lesen.
   - Assert: `calibration_data["derived"]["type"] == "moisture_2point"` (oder äquivalent kanonisch).
   - Assert: `resolve_calibration_for_processor(sensor_config.calibration_data)` liefert Dict mit **`dry_value`** und **`wet_value`** (Floats wie in Session-Punkten).
2. Optional zweiter Fall: Session mit `method="moisture_2point"` starten — gleiche Assertions (Regression gegen API-Variante).

**Akzeptanzkriterien:**

- [ ] Neuer/erweiterter Test faellt auf **main** nicht durch absichtliche Logikänderung ohne Anpassung.
- [ ] Keine Änderung an Produktcode außerhalb von `tests/` in PKG-01.

**Verify (exakt):**

```text
cd "El Servador/god_kaiser_server"
.\.venv\Scripts\python.exe -m pytest tests/unit/test_calibration_service.py -q --tb=short
```

**Windows-Hinweis:** Falls `poetry` im PATH fehlt, venv wie oben nutzen (siehe VERIFIKATION-README REF-03).

---

### PKG-02 — Doku: Operator & „Altdaten“

**Owner:** server-dev oder Technical Writer (Markdown-only)  
**Dateien:**

- Neu oder Erweiterung: `docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-operator-hinweis-2026-04-10.md` **oder** Abschnitt in bestehender Analyse-Datei mit klarem Datum.

**Inhalt:**

1. **SQL-SELECT (read-only):** Beispiel, das `sensor_configs` mit `sensor_type` in (`moisture`,`soil_moisture`) und JSON-Pfad `calibration_data->derived->type` = `linear_2point` **ohne** `dry_value` listet (Dialect PostgreSQL; **keine** echten ESP-IDs aus Prod nennen — Platzhalter).
2. **Handlung:** Neu-Kalibrierung über UI-Wizard **oder** dokumentiertes Risiko manueller JSON-Korrektur (nicht empfohlen ohne Review).
3. Verweis auf Pi-Enhanced: Prozent nur mit **`pi_enhanced`** + Rohdatenpfad.

**Verify:** rein menschlich / Markdown-Review; optional `ruff` nicht betroffen.

**Akzeptanzkriterien:**

- [ ] Keine Secrets; SQL nur als Template.
- [ ] Konsistent mit `VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md`.

---

### PKG-03 — Frontend: `calibrationApi.calibrate()` Feuchte-Session + optionale Typen

**Owner:** frontend-dev  
**Dateien:**

- `El Frontend/src/api/calibration.ts` (JWT-Zweig `startSession`, ca. Zeilen 125–137)

**Inhalt:**

1. **Runtime (empfohlen):** Vor `calibrationApi.startSession` den `sensor_type` wie im Wizard normalisieren (`soil_moisture` → `moisture`). Wenn Ergebnis `moisture`, **`sessionMethod = 'moisture_2point'`** statt pauschal `linear_2point` (Offset-Branch unverändert).
2. **Optional:** `StartSessionRequest` / lokale Typen so schärfen, dass `'moisture_2point'` explizit vorkommt (Union mit `'linear_2point'`, `'offset'`, … — mit Backend `StartSessionRequest` abgleichen).
3. **Optional:** Kleiner Vitest-Mock-Test: bei `calibrate` mit `sensor_type: 'moisture'` wird `moisture_2point` an `startSession` übergeben.

**Verify:**

```text
cd "El Frontend"
npx vue-tsc --noEmit
npx vitest run tests/unit/composables/useCalibrationWizard.test.ts -q
```

*(Zusätzlich ggf. neue Testdatei für `calibration.ts` — siehe Inhalt Punkt 3.)*

**Akzeptanzkriterien:**

- [ ] Kein `startSession` mit `linear_2point` für normalisierte Feuchte über den `calibrate()`-Pfad.
- [ ] `vue-tsc` fehlerfrei.

---

### PKG-04 — Lint + Regressionssuite (nach PKG-01–03)

**Owner:** server-dev / frontend-dev je nach geänderten Dateien  
**Verify:**

```text
cd "El Servador/god_kaiser_server"
.\.venv\Scripts\python.exe -m pytest tests/unit/test_calibration_service.py tests/unit/test_moisture_processor.py tests/unit/test_calibration_payloads.py tests/integration/test_moisture_mqtt_flow.py -q --tb=short
.\.venv\Scripts\python.exe -m ruff check src/
```

```text
cd "El Frontend"
npx vue-tsc --noEmit
```

**Akzeptanzkriterien:**

- [ ] Alle genannten pytest-Dateien Exit-Code 0.
- [ ] `ruff` ohne neue Errors in `src/` (Warnungen nach Projektstandard).

---

## Daten-Migration

**Automatische Migration:** nicht Teil dieses Laufs (kein Alembic ohne separates Gate).  
**Operator:** siehe PKG-02 — **Neu-Kalibrierung** ist der sichere Weg; einmalige SQL-`UPDATE` auf JSON nur mit Produkt-Review und Backup.

**Rollback:** Vor jedem manuellen JSON-Update Backup-Tabelle / Row-Dump; Rollback = Restore des Dumps.

---

## Regressionstests-Liste (müssen grün bleiben)

| Test-Datei / Bereich | Zweck |
|----------------------|-------|
| `tests/unit/test_calibration_service.py` | Finalize/Apply + **neue** Persistenz-Assertions |
| `tests/unit/test_moisture_processor.py` | Processor-Kern |
| `tests/unit/test_calibration_payloads.py` | Resolver |
| `tests/integration/test_moisture_mqtt_flow.py` | Kanonische Payload → Processor |
| `tests/unit/test_calibration_service.py::test_compute_calibration_linear_moisture_*` | linear_2point+Feuchte → moisture_2point |

**Neue Tests:** mindestens die unter PKG-01 beschriebene Persistenz-Assertion ( **`dry_value`/`wet_value` nach apply** ).

---

## verify-plan & SPECIALIST-PROMPTS

**Vor erster Code-Änderung:** Skill **`verify-plan`** (`.claude/skills/verify-plan/SKILL.md`) auf diese STEUER + betroffene Pfade anwenden; Ergebnis in  
`.claude/reports/current/auto-debugger-runs/bodenfeuchte-kalibrierung-followup-2026-04-10/VERIFY-PLAN-REPORT.md`  
und Chat-Block **OUTPUT FÜR ORCHESTRATOR (auto-debugger)** gemäß Skill.

**SPECIALIST-PROMPTS** pro Rolle müssen die Pflichtabschnitte aus `.claude/agents/auto-debugger.md` §0a enthalten: **Git (auto-debugger/work)**, **Pattern-Reuse**, **Alert-Pfad** (hier tangential), **Verify-Befehl**, **Fehler-Register** bei Code.

---

## Aktivierung (Robin)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md
Bitte verify-plan, dann PKG-01–04 auf Branch auto-debugger/work; keine Kernlogik ändern ohne Evidence aus VERIFIKATION-IST-SOLL.
```

---

## Konsistenzcheck

Diese STEUER darf **nicht** dem IST-Dokument widersprechen: Kernpfad ist **bereits implementiert**; dieser Lauf ergänzt **Tests, Betrieb, JWT-`calibrate()`-Konsistenz** (Matrix 2.2), **optionale Typen**.
