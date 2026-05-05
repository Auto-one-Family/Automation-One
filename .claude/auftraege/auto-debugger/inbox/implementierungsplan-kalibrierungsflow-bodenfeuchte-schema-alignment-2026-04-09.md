# Implementierungsplan — Kalibrierungsflow Bodenfeuchte: Schema-Alignment (`linear_2point` vs `MoistureSensorProcessor`)

**Datum:** 2026-04-09  
**Typ:** Umsetzungsauftrag für den Agenten **`auto-debugger`** (mit Delegation an Frontend-/Backend-Spezialisten nach **verify-plan**-Gate)  
**Gültigkeit:** Strategie-Repository (Life) — **Ausführung** im AutomationOne-Checkout; **Zielkopie:**  
`Auto-one\.claude\auftraege\implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md`  
**Referenz-IST:** `docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md` (Branch `auto-debugger/work`, Commit `00deff9` zum Zeitpunkt der Analyse; bei neuerem HEAD Pfade/Zeilen verifizieren)

---

## 0. Produktentscheid (verbindlich für die Umsetzung)

| Frage | Entscheidung |
|--------|----------------|
| Was ist die **Root Cause**? | Semantische Lücke: Kalibrier-Session liefert nach `finalize` typischerweise **`linear_2point`** mit **`slope`/`offset`** in `derived`, während **`MoistureSensorProcessor`** nur **`dry_value`/`wet_value`** nutzt — fehlen diese, greifen **Defaults 3200/1500 ADC**. |
| Welcher Laufzeitpfad ist für **Prozent-Anzeige** maßgeblich? | **`sensor_config.pi_enhanced` und `raw_mode`:** erst dann `resolve_calibration_for_processor` + `processor.process(...)`. Ohne Pi-Enhanced wird Roh-ADC oft **direkt** als numerischer Wert weiterverwendet (Fallback im Handler) — **anderes Symptom** (Roh statt Prozent), nicht derselbe Bug, aber für Operator-Verständnis dokumentieren. |
| Nebenbefund **invert** | `MoistureSensorProcessor` liest **`invert` nur aus `params`**, nicht aus `calibration`. Persistiertes `invert` in `derived` wirkt auf `process()` **nicht** — mit **Option (a)** über `_compute_moisture` wird `invert` wieder konsistent in `derived` geführt. |
| Nebenbefund **Legacy** | `useCalibration` hat **keine** produktiven Imports; `useCalibrationWizard` importiert es **nicht**. Kopfkommentar in `useCalibrationWizard.ts` ist **irreführend** — bereinigen. |

---

## 1. Zielbild (messbar)

Nach Umsetzung gilt:

1. Schließt der Operator eine Kalibrierung für **`sensor_type`** Bodenfeuchte (`moisture` / normalisierter Alias `soil_moisture`) ab, enthält die in der DB gespeicherte **`calibration_data.derived`** (bzw. das, was `resolve_calibration_for_processor` liefert) **immer** die Schlüssel, die **`MoistureSensorProcessor.process`** für die **kalibrierte** Umrechnung benötigt — mindestens **`dry_value` und `wet_value`** (Typ **`moisture_2point`**), sofern die Session als Zwei-Punkt-Feuchte-Kalibrierung gedacht ist.

2. Der **Pi-Enhanced-Pfad** produziert **keine** stille Fallback-Kennlinie 3200/1500 mehr, **wenn** der Operator eine gültige Feuchte-Kalibrierung abgeschlossen hat.

3. **Regression:** Bestehende Tests (`test_moisture_mqtt_flow` o. ä.) grün; neue Tests decken **Finalize → derived Keys → Processor** ab.

4. **Dokumentation:** Kurzvermerk im Bericht oder `docs/` — Operator versteht, dass Prozent **nur** im Pi-Enhanced-Roh-Pfad wie bisher Sinn ergibt (kein Scope-Wechsel für Nicht-Pi-Enhanced außer klar benannter Follow-up).

---

## 2. Nicht-Ziele (verbindlich)

- Kein Umbau des **gesamten** Kalibrier-Frameworks für alle Sensortypen.
- Keine Änderung der **MQTT-Topic-Schemas** ohne separates Gate.
- **Kein** vollständiges Observability-Redesign (Abschnitt 7 IST-Bericht) — höchstens **eine** optionale strukturierte Debug-Zeile in einem späteren Mini-Paket.
- **Firmware:** Kein Pflicht-Change; Einzel-ADC bleibt — optional später Median (separater Auftrag).

---

## 3. Optionsentscheidung (IST-Abschnitt 8) — **Empfehlung**

| Option | Kurz | Bewertung |
|--------|------|-----------|
| **(a)** Wizard/Backend: Feuchte immer **`moisture_2point`** finalisieren **oder** bei `finalize` für `moisture` + `linear_2point` explizit **`dry_value`/`wet_value`** in `derived` schreiben (aus denselben Roh-/Referenzpunkten wie die lineare Rechnung) | Geringe Änderung in **`MoistureSensorProcessor`**; nutzt bestehende `_compute_moisture`-Logik | **Empfohlen (Primär)** |
| **(b)** `MoistureSensorProcessor` um **`slope`/`offset`** aus `linear_2point` erweitern | Dupliziert physikalisches Modell; mehr Fehlerflächen, invert-Mapping komplexer | Nur wenn (a) scheitert |
| **(c)** Nur `resolve_calibration_for_processor`: Rekonstruktion dry/wet aus gespeicherten Punkten | Magisch, schwer testbar wenn Rohpunkte nicht persistiert | Fallback-Idee, nicht erste Wahl |

**Festlegung:** Umsetzung beginnt mit **(a)**. Wenn API-Verträge verhindern, dass der Wizard `method: 'moisture_2point'` sendet, dann **Backend-intern** bei `sensor_type in (moisture, soil_moisture)` und `method == linear_2point` nach `_compute_linear_2point` eine **zweite Ableitung** `_compute_moisture(points)` aufrufen oder die Punkte an `_compute_moisture` übergeben — **ein** konsistentes `derived` mit `type: moisture_2point` **oder** `dry_value`/`wet_value` zusätzlich zu den linearen Metadaten (letzteres nur wenn Downstream eindeutig dokumentiert).

---

## 4. Umsetzungsreihenfolge (Arbeitspakete für `auto-debugger`)

Jedes Paket: **verify-plan**-Skill **vor** Code-Delegation; Arbeit auf Branch **`auto-debugger/work`** (von `master`); nach Paket **Verify-Befehle** aus TASK-PACKAGES.

### PKG-1 — IST-Verifikation und Schnittstellen-Inventar (nur lesend)

**Inhalt:**

- Pfade und Zeilen zu: `useCalibrationWizard.ts` (`startSession` mit `linear_2point`), `calibration_service.py` (`_compute_calibration`, `_compute_linear_2point`, `_compute_moisture`), `moisture.py`, `calibration_payloads.py`, `sensor_handler.py` (Pi-Enhanced-Zweig, Zeilen ~269–307, ~1297–1307), `sensor_type_registry.py` (Alias), `sensor_manager.cpp` (Roh-Passthrough).
- Feststellung: Welche **`method`**-Werte akzeptiert die **öffentliche** Calibration-API laut OpenAPI/Schema?

**Akzeptanzkriterien:**

- [ ] Kurzes Inventar-Markdown im Run-Ordner oder als Kommentar-Block im TASK-PACKAGES (keine Secrets).
- [ ] Entscheidungsmatrix: reicht **reine Frontend-Änderung** `method: 'moisture_2point'` oder braucht es **Backend-Sonderlogik**?

---

### PKG-2 — Frontend: Session-Method für Bodenfeuchte

**Inhalt:**

- In `useCalibrationWizard.ts`: für `selectedSensorType` / normalisierten Typ **`moisture`** (und ggf. **`soil_moisture`** falls der Wizard Roh-Typ so liefert) **`method: 'moisture_2point'`** statt `'linear_2point'` bei `startSession` — **beide** Stellen (ca. 357–362 und zweiter Aufruf ~556–561 laut IST-Bericht).
- `expected_points: 2` beibehalten, sofern API das erwartet.
- Kopfkommentar **korrigieren**: kein Verweis auf „delegiert an useCalibration“, solange kein Import existiert — oder **Minimalimport** nur wenn wirklich Code geteilt wird (Vermeidung bevorzugt).

**Akzeptanzkriterien:**

- [ ] Vitest/Component-Tests oder minimaler Composable-Test: bei Moisture-Typ wird `moisture_2point` gesendet (mock `calibrationApi.startSession`).
- [ ] `vue-tsc` clean für betroffene Dateien.

**Risiko:** Backend lehnt `moisture_2point` ab → dann PKG-3 zuerst.

---

### PKG-3 — Backend: `finalize` / `_compute_calibration` — Feuchte + linear_2point

**Inhalt (eine der Varianten — im verify-plan festlegen):**

- **Variante 3A:** Wenn nur Frontend auf `moisture_2point` umstellt: sicherstellen, dass `_compute_calibration` für `method == moisture_2point` und `sensor_type` moisture **immer** `_compute_moisture` aufruft und `derived` speichert wie in IST §6.2.
- **Variante 3B:** Wenn Frontend vorerst `linear_2point` bleiben muss: In `_compute_calibration` nach `_compute_linear_2point` für **`sensor_type` moisture** zusätzlich **`dry_value`/`wet_value`** aus `points` in `derived` mergen **oder** `derived` durch `_compute_moisture` ersetzen (nur eine kanonische Quelle — keine doppelten widersprüchlichen Typen).

**Akzeptanzkriterien:**

- [ ] Unit-Tests in `calibration_service` / bestehende Testdatei: Session mit zwei Punkten → `derived` enthält `dry_value`, `wet_value`, `type` konsistent.
- [ ] Kein Breaking der JSON-Form für **andere** Sensortypen, die `linear_2point` nutzen.

---

### PKG-4 — Backend: `MoistureSensorProcessor` + `invert`

**Inhalt:**

- `moisture.py`: `invert` **auch** aus `calibration` lesen, wenn in `params` nicht gesetzt — Priorität dokumentieren (params überschreibt calibration oder umgekehrt: **ein** klares Regelwerk).
- Sicherstellen, dass nach PKG-2/3 `calibration` an `process()` die Keys aus `resolve_calibration_for_processor` trägt.

**Akzeptanzkriterien:**

- [ ] `test_moisture_processor.py` (oder Erweiterung): kalibriert mit invert true/false; erwartete Prozent.

---

### PKG-5 — Integration: Pi-Enhanced MQTT-Pfad

**Inhalt:**

- Grep-gestützter Test oder Integrationstest: MQTT-Sensor-Message mit `pi_enhanced=True`, `raw_mode=True`, `calibration_data` wie nach echter Session → **processed** Prozent **nicht** Default-Kennlinie.
- Optional: einen bestehenden Flow-Test (`test_moisture_mqtt_flow.py`) erweitern.

**Akzeptanzkriterien:**

- [ ] Test belegt: `resolve_calibration_for_processor` → `dry_value`/`wet_value` ankommen bei `processor.process`.

---

### PKG-6 — Doku & Hygiene (Pflicht, klein)

**Inhalt:**

- `docs/analysen/`: kurzer **Addendum-Abschnitt** zum IST-Bericht oder neue Datei `FIX-kalibrierungsflow-bodenfeuchte-2026-04-09.md` mit **was** geändert wurde und **Operator-Hinweis** (Pi-Enhanced für Prozent).
- `useCalibration.ts`: Deprecation-Kommentar oder Issue-Verweis, wenn weiterhin ungenutzt.

**Akzeptanzkriterien:**

- [ ] Ein nachvollziehbarer Eintrag für Release-Notes / interne QA.

---

## 5. verify-plan und Delegation

1. **`auto-debugger`** erstellt aus diesem Plan **`TASK-PACKAGES.md`** und **`SPECIALIST-PROMPTS.md`** (Skill **verify-plan**), Branch-Hinweis und Verify-Befehle pro Paket (`pytest`, `vue-tsc`, relevante Module).
2. Kein Paket **N+1** starten, bevor Paket **N** verifiziert ist.
3. **`FEHLER-REGISTER.md`** im Run-Ordner führen, wenn der Skill das vorschreibt.

---

## 6. Git-Policy (einbetten)

- Branch: **`auto-debugger/work`**.
- Kein `git push` / `force` durch Agenten ohne Robin.
- Bash nur: `status`, `branch`, `checkout`, `diff` (read-only), wo erlaubt.

---

## 7. STEUER-YAML-Vorschlag (optional, für separaten Implementierungs-Lauf)

Kann als **`STEUER-kalibrierungsflow-bodenfeuchte-implementierung-2026-04-09.md`** unter  
`.claude/auftraege/auto-debugger/inbox/` im Auto-one-Checkout abgelegt werden:

```yaml
---
run_mode: artefact_improvement
incident_id: ""
run_id: kalibrierung-schema-alignment-impl-2026-04-09
order: incident_first
target_docs:
  - docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-2026-04-09.md
scope: |
  Umsetzung Implementierungsplan Bodenfeuchte Schema-Alignment (PKG-1 bis PKG-6).
  Primaer Option (a): derived enthaelt dry_value/wet_value fuer Moisture nach Kalibrierung;
  Frontend moisture_2point wo moeglich; Backend-Fallback wenn API linear_2point erzwingt.
  invert aus calibration in moisture.py. Keine MQTT-Breaks.
forbidden: |
  Keine Secrets. Branch auto-debugger/work. Kein push/force. Breaking REST nur mit Gate.
done_criteria: |
  Alle PKG-AK erfuellt; pytest/vue-tsc wie in TASK-PACKAGES gruen; Doku-Addendum existiert.
---
```

---

## 8. Agent-Prompt (Copy-Paste, Auto-one)

```text
Du bist auto-debugger. Arbeite nach:
.claude/auftraege/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md

Ziel: Kalibrierung Bodenfeuchte so ausrichten, dass MoistureSensorProcessor nach finalize
dry_value/wet_value sieht (Option a), invert konsistent, Pi-Enhanced-Pfad getestet.
Reihenfolge PKG-1–6, verify-plan vor jeder Implementierungsdelegation, Branch auto-debugger/work.
```

---

## 9. Qualitätstor vor „Kopieren nach Auto-one“

- [ ] Volltextsuche: keine Treffer auf `arbeitsbereiche/`, `wissen/`, Life-Pfade im **eingebetteten** YAML-Block — Pfade nur als `Auto-one\.claude\...` in dieser Meta-Zeile erlaubt.
- [ ] Alle fachlichen Fakten stehen **im** Implementierungsplan (kein „siehe IST-Bericht“ ohne Kurzfassung — hier erledigt in §0 und §3).
