# TASK-PACKAGES — Kalibrierungsflow Bodenfeuchte (Schema-Alignment)

**Run-ID:** `kalibrierung-schema-alignment-impl-2026-04-09`  
**Planquelle:** `.claude/auftraege/auto-debugger/inbox/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md`  
**Aktueller Git-Branch (Stand Orchestrierung):** `auto-debugger/work` — **Soll-Branch:** `auto-debugger/work`  
**Verify-Gate:** `VERIFY-PLAN-REPORT.md` (dieser Run)

---

## PKG-1 — IST-Verifikation & Schnittstellen-Inventar (lesend)

**Owner:** Analyse (vor Delegation erledigt; siehe `VERIFY-PLAN-REPORT.md` § PKG-1 Fundstellen)

**Inhalt:**

- Pfade verifiziert: `useCalibrationWizard.ts` (`startSession` mit `linear_2point` Zeilen ~357–361 und ~556–560), `calibration_service.py` (`finalize` → `_compute_calibration` Zeilen ~510–568, `_compute_linear_2point` / `_compute_moisture` ~760–826), `moisture.py` (`process` dry/wet vs. Defaults ~143–152, `invert` nur `params` ~154–159), `calibration_payloads.py` (`resolve_calibration_for_processor` merged `derived` ~122–124), `sensor_handler.py` (Pi-Enhanced ~269, `resolve_calibration_for_processor` ~1299), `sensor_type_registry.py`, API `calibration_sessions.py` (`method: str`, Default `linear_2point`, `max_length=30`).
- Entscheidungsmatrix: **Reine Frontend-Umstellung auf `moisture_2point` ist ausreichend**, sofern `start_session` das `method` persistiert — `finalize` nutzt `cal_session.method` und ruft bei `moisture_2point` bereits `_compute_moisture` auf (kein Enum, der `moisture_2point` verbietet).

**Akzeptanzkriterien:**

- [x] Inventar in `VERIFY-PLAN-REPORT.md` mit repo-echten Zeilen/Entscheidung.
- [x] Matrix: primär Frontend **`moisture_2point`**; Backend-Fallback **3B** nur nötig, falls weiterhin `linear_2point`-Sessions für Moisture existieren müssen.

**Verify:** Lesend erledigt.

---

## PKG-2 — Frontend: Session-Method für Bodenfeuchte

**Owner:** `frontend-dev`

**Inhalt:**

- `El Frontend/src/composables/useCalibrationWizard.ts`: für normalisierten Typ **`moisture`** / **`soil_moisture`** bei `calibrationApi.startSession` **`method: 'moisture_2point'`** statt `'linear_2point'` — beide Aufrufe (aktuell ~357–361, ~556–560).
- Kopfkommentar bereinigen: **kein** irreführender Verweis auf Delegation an `useCalibration` ohne Import — entweder Kommentar korrigieren oder minimale Nutzung nur bei echterm Code-Share (IST: **kein** `useCalibration`-Import).

**Akzeptanzkriterien:**

- [ ] Test: bei Moisture-Typ wird `moisture_2point` an `calibrationApi.startSession` übergeben (Mock/Unit-Test wie im Plan).
- [ ] `cd "El Frontend" && npx vue-tsc --noEmit` — Exit 0 für betroffene Dateien/Projekt.
- [ ] Änderungen und Commits nur auf Branch `auto-debugger/work`.

**Verify-Befehl:**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend" && npx vue-tsc --noEmit
```

Optional ergänzend:

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend" && npx vitest run --reporter=dot
```

**Abhängigkeit:** Vor PKG-3, wenn nur Frontend — PKG-3 dann auf Regression/3B-Fallback prüfen.

---

## PKG-3 — Backend: `finalize` / `_compute_calibration` (Feuchte + `linear_2point`)

**Owner:** `server-dev`

**Inhalt:**

- **Variante 3A (Primär):** Mit PKG-2 reicht bestehende Logik: `method == moisture_2point` → `_compute_moisture`, `derived` mit `dry_value`/`wet_value`/`type`/`invert`.
- **Variante 3B (Fallback):** Wenn `cal_session.method == linear_2point` **und** `sensor_type` (normalisiert) moisture — nach `_compute_linear_2point` **`dry_value`/`wet_value`** aus denselben Punkten in `derived` mergen **oder** kanonisch nur `_compute_moisture`-Ergebnis (Plan: eine Quelle, keine widersprüchlichen Typen).

**Akzeptanzkriterien:**

- [ ] Unit-Tests: Session mit zwei Punkten (dry/wet-Rollen) → `derived` enthält `dry_value`, `wet_value` bei moisture-Pfad; ggf. 3B-Test falls implementiert.
- [ ] Kein Breaking für andere Sensortypen mit `linear_2point`.
- [ ] `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/test_calibration_payloads.py tests/unit/test_mqtt_correlation.py` (min.) bzw. erweiterte Pfade aus Verify — grün.
- [ ] Commits nur auf `auto-debugger/work`.

**Verify-Befehl (Vorschlag):**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server" && poetry run pytest tests/unit/test_calibration_payloads.py tests/unit/test_moisture_processor.py -q --tb=short
```

---

## PKG-4 — Backend: `MoistureSensorProcessor` + `invert`

**Owner:** `server-dev`

**Inhalt:**

- `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py`: `invert` auch aus **`calibration`** lesen, wenn nicht in `params` — **eine** klare Prioritätsregel (z. B. `params` überschreibt `calibration`).

**Akzeptanzkriterien:**

- [ ] Erweiterung in `tests/unit/test_moisture_processor.py`: invert true/false mit Kalibrierung.
- [ ] Gleicher pytest-Scope wie PKG-3 grün.

**Verify-Befehl:**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server" && poetry run pytest tests/unit/test_moisture_processor.py -q --tb=short
```

---

## PKG-5 — Integration: Pi-Enhanced MQTT-Pfad

**Owner:** `server-dev`

**Inhalt:**

- `tests/integration/test_moisture_mqtt_flow.py` o. ä. erweitern: `pi_enhanced`, `raw_mode`, `calibration_data` mit `derived` aus moisture-Session → Prozent **nicht** Default-Kennlinie; `resolve_calibration_for_processor` → Processor sieht `dry_value`/`wet_value`.

**Akzeptanzkriterien:**

- [ ] Integrationstest grün.
- [ ] `poetry run pytest tests/integration/test_moisture_mqtt_flow.py -q --tb=short`

---

## PKG-6 — Doku & Hygiene

**Owner:** `server-dev` / `frontend-dev` (Koordination)

**Inhalt:**

- Kurzes Addendum: `docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-2026-04-09.md` **oder** Addendum-Abschnitt am IST-Bericht — Operator-Hinweis Pi-Enhanced für sinnvolle Prozent-Anzeige.
- `useCalibration.ts`: Deprecation-Kommentar/Issue-Hinweis, falls weiterhin ohne produktive Imports.

**Akzeptanzkriterien:**

- [ ] Ein nachvollziehbarer Release-/QA-Eintrag.
- [ ] Keine Secrets.

---

## Post-Verify

Nach Umsetzung: `FEHLER-REGISTER.md` schließen; Merge `auto-debugger/work` → `master` nur durch Robin.
