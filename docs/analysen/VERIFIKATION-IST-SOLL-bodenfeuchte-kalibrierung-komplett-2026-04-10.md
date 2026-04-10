# VERIFIKATION IST/SOLL — Bodenfeuchte-Kalibrierung (End-to-End)

**Datum:** 2026-04-10  
**Repo-Stand:** Git `HEAD` **`5fba29a`**, Branch empfohlen: `auto-debugger/work`  
**Normative Ziele:** `MoistureSensorProcessor` erhält nach abgeschlossener Feuchte-Kalibrierung im Pi-Enhanced-Pfad **`dry_value`/`wet_value`** aus persistierter Kette — keine stille Default-Kennlinie **3200/1500**, außer dokumentiertem Ausnahmepfad (keine Kalibrierung / leeres `derived`).

**Quellen (Kontext):**

- Live-/Codebase-Bericht: `docs/analysen/BERICHT-bodenfeuchte-live-verify-SEN0193-codebase-2026-04-10.md`
- Implementierungsplan (Option a): `.claude/auftraege/auto-debugger/inbox/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md`

---

## 1. Executive Summary — kanonische Fix-Strategie

**Empfehlung (Option a, zum IST passend):** Kanonisch ist ein **`derived`-Block**, der für Feuchte **`type: moisture_2point`** mit **`dry_value`/`wet_value`** (und ggf. **`invert`**) enthält — so liefert `resolve_calibration_for_processor` exakt die Keys, die `MoistureSensorProcessor.process` für die kalibrierte Kennlinie braucht.

**IST (HEAD):**

- **Frontend** (`useCalibrationWizard.ts`): `calibrationApiMethodForSensorType` setzt für normalisierten Typ **`moisture`** → **`moisture_2point`**; `startSession` an beiden Stellen (Zeilen **363–368** und **562–568**).
- **Backend** (`calibration_service._compute_calibration`): **`moisture_2point`** → `_compute_moisture`; **`linear_2point`/`linear`** + **`sensor_type`** nach Normalisierung **`moisture`** → **`_compute_moisture_from_role_points`** (gleiches `derived` wie `moisture_2point`, **kein** reines `slope`/`offset` für Feuchte).
- **`resolve_calibration_for_processor`:** liefert **`dict(derived)`**, wenn `derived` nicht leer — enthält damit `dry_value`/`wet_value`, sobald Finalize **`moisture_2point`-Shape** geschrieben hat.
- **`MoistureSensorProcessor.process`:** kalibriert nur, wenn **`dry_value` und `wet_value`** im `calibration`-Dict; sonst **`_adc_to_moisture_default`** (3200/1500).

**SOLL:** Nach **Finalize + Apply** muss in **`sensor_configs.calibration_data`** (kanonisch) **`derived`** die Feuchte-Physik-Keys tragen. Alte Zeilen mit **`derived.type: linear_2point`** und nur **`slope`/`offset`** sind **nicht** processor-kompatibel → Operator: **neu kalibrieren** oder datengetriebene Nachmigration (siehe Regressionsanalyse).

---

## 2. Verifikations-Matrix

### 2.1 Frontend — Kalibrierung

| # | Datei / Symbol | IST (HEAD) | SOLL | Evidence | Risiko |
|---|----------------|------------|------|----------|--------|
| F1 | `El Frontend/src/composables/useCalibrationWizard.ts` — `normalizeCalibrationSensorType` | `soil_moisture` → `moisture` | Alias konsistent mit Server-Registry | Zeilen **173–176** | Niedrig |
| F2 | `calibrationApiMethodForSensorType` | `moisture` → **`moisture_2point`**, sonst `linear_2point` | Feuchte immer API-Methode mit Server-Mapping auf `moisture_2point`-Pfad | Zeilen **178–181** | Niedrig |
| F3 | `ensureSessionStarted` / `triggerLiveMeasurement` — `calibrationApi.startSession` | **`method: calibrationApiMethodForSensorType(selectedSensorType)`**, `expected_points: 2` | Beide Aufrufe gleiche Semantik | **361–369**, **561–568** | Niedrig |
| F4 | `El Frontend/src/api/calibration.ts` — `StartSessionRequest` | `method?: string` (unspezifisch) | Ausreichend für Server (`max_length` 30); Wizard setzt konkrete Strings | Zeilen **53–59** | Mittel: TS nicht eng an Server-Enum gebunden |
| F5 | `El Frontend/tests/unit/composables/useCalibrationWizard.test.ts` | Mocks erwarten **`moisture_2point`** für Feuchte-Szenarien | Regressionsschutz für Session-Method | `expect(… method: 'moisture_2point')` | Niedrig |

### 2.2 Backend — Finalize und Derived

| # | Datei / Symbol | IST (HEAD) | SOLL | Evidence | Risiko |
|---|----------------|------------|------|----------|--------|
| B1 | `calibration_service._compute_calibration` | `moisture_2point` → `_compute_moisture`; `linear_2point`+`moisture` → `_compute_moisture_from_role_points`; sonst `_compute_linear_2point` | Feuchte niemals „nur linear“ ohne dry/wet | **769–775** | Niedrig am HEAD |
| B2 | `_compute_moisture_from_role_points` | `derived`: **`type: moisture_2point`**, **`dry_value`/`wet_value`**, **`invert`** | Processor-tauglich | **817–845** | Niedrig |
| B3 | `_compute_linear_2point` | `type: linear_2point`, slope/offset — **nicht** für Feuchte, wenn B1 greift | EC/pH etc. unverändert | **782–809** | Niedrig |
| B4 | `finalize` → `build_canonical_calibration_result(method=cal_session.method, derived=result)` | Top-Level **`method`** bleibt Session-String (z. B. `linear_2point`); **`derived`** enthält Physik | Resolver nutzt **`derived`**; Processor sieht dry/wet | **564–568** | Mittel: JSON zeigt ggf. `method: linear_2point` obwohl `derived.type: moisture_2point` — **kein Bug**, solange `derived` voll ist |
| B5 | `El Servador/.../api/v1/calibration_sessions.py` — `StartSessionRequest.method` | `str`, default `linear_2point`, `max_length=30` | Kein serverseitiges Enum — Clients können beliebigen String senden | **36–41** | Mittel |

### 2.3 Backend — Processor-Kette

| # | Datei / Symbol | IST (HEAD) | SOLL | Evidence | Risiko |
|---|----------------|------------|------|----------|--------|
| P1 | `moisture.py` — `process` | Kalibriert nur mit **`dry_value`+`wet_value`** in `calibration`; sonst Default 3200/1500 | Persistenz muss diese Keys liefern | **143–153**, **361–381** | **Hoch**, wenn DB `derived` linear ohne dry/wet |
| P2 | `invert` | `params["invert"]` **vor** `calibration["invert"]` | Konsistent zu Tests | **156–162** | Niedrig |
| P3 | `calibration_payloads.resolve_calibration_for_processor` | Gibt **`dict(derived)`** zurück, wenn `derived` nicht leer; **`linear_2point`** mit slope/offset würde 1:1 durchgereicht — **ohne** dry/wet nutzt Processor Default | Alte DB-Shape → Symptom | **108–131** | Hoch für Altbestand |
| P4 | `test_calibration_payloads` | Canonical `moisture_2point` + derived → Processor kalibriert | Golden path abgedeckt | `tests/unit/test_calibration_payloads.py` | Niedrig |

### 2.4 Backend — Ingest (Pi-Enhanced)

| # | Datei / Symbol | IST (HEAD) | SOLL | Evidence | Risiko |
|---|----------------|------------|------|----------|--------|
| I1 | `sensor_handler._trigger_pi_enhanced_processing` | `proc_calibration = resolve_calibration_for_processor(sensor_config.calibration_data)` → `processor.process(..., calibration=proc_calibration)` | Gleiche Kette wie Matrix P3/P1 | **1298–1307** | Niedrig bei korrektem DB-Shape |

### 2.5 Registry und Alias

| # | Datei / Symbol | IST (HEAD) | SOLL | Evidence | Risiko |
|---|----------------|------------|------|----------|--------|
| R1 | `sensor_type_registry.py` | **`soil_moisture` → `moisture`** | Einheitlicher Processor-Pfad | Zeilen **64–65** | Niedrig |

### 2.6 Tests — Abdeckung und Lücken

| # | Artefakt | IST | SOLL / Lücke | Evidence |
|---|----------|-----|---------------|----------|
| T1 | `test_moisture_processor.py` | Default + kalibriert + invert | Unit-OK; **kein** DB-Apply | — |
| T2 | `test_calibration_service.py` | `test_compute_calibration_linear_moisture_maps_to_moisture_2point_derived` | **`linear_2point`+Feuchte → `moisture_2point`-Derived** | **227–238** |
| T3 | `test_calibration_service_add_finalize_apply_flow` | Session mit **`method="linear_2point"`** | Prüft Status, nicht explizit JSON-Shape von `calibration_result.derived` | **32–65** |
| T4 | `test_calibration_session_routes.py` | Integration mit **`method: linear_2point`** | Route-Flow grün; **keine Assertion** auf `dry_value` in Response/DB | **105–150** |
| T5 | `test_moisture_mqtt_flow.py` | Normalisierung, Resolver, Processor | **Kein** vollständiger **Finalize→Apply→sensor_configs** E2E in dieser Datei (Fokus Library/Resolver) | Kopfkommentar |

**Lücke (messbar):** End-to-End-Test **„REST: finalize für moisture mit `linear_2point` → `calibration_data.derived` enthält `dry_value`/`wet_value`“** optional als Verstärkung; bestehende Tests decken **Compute** (T2) ab, nicht zwingend **persistierte Sensor-Zeile** nach Apply.

### 2.7 Firmware — nur IST/SOLL-Übersicht

| # | Datei / Thema | IST | SOLL |
|---|---------------|-----|------|
| FW1 | `sensor_manager.cpp` — ADC | Median über **9** Samples, 12-Bit-Rohwert; Qualität/Rails | Server erwartet Roh-ADC 0–4095 — konsistent zu `MoistureSensorProcessor.ADC_MAX` | Evidence: **ADC_SAMPLE_COUNT**, **medianOddSamples** (ca. **52–57**, **1557–1561**) |

### 2.8 Datenbank / Betrieb — IST-Shape (Evidenz aus Bericht, nicht aus diesem Lauf live abgefragt)

| # | Thema | IST (Bericht) | SOLL |
|---|-------|---------------|------|
| D1 | `sensor_configs.calibration_data` Pi-Enhanced ESP | **`derived.type: linear_2point`**, slope/offset, **ohne** `dry_value`/`wet_value`; `calibrated_at` 2026-04-09 | Nach Fix/Neu-Kalibrierung: **`derived`** mit **`moisture_2point`** + dry/wet **oder** Re-Kalibrierung mit HEAD-Server |
| D2 | Parallel-ESP | Zwei `esp_id` gleicher GPIO — Aggregation irreführend | Auswertung immer **`esp_id` + `processing_mode`** trennen |

*Hinweis:* Verifikation der **laufenden** Produktions-DB war in diesem Dokumentlauf **nicht** vorgesehen (`forbidden`: SQL nur read-only für IST-Analyse; keine Zugangsdaten hier). Der IST-Shape stützt sich auf **`BERICHT-bodenfeuchte-live-verify-SEN0193-codebase-2026-04-10.md` §3.**

---

## 3. Regressionsanalyse — warum frühere Fixes „nicht gehalten“ haben können

Mindestens **fünf** plausible Vektoren; jeweils **Evidence-Status**:

| # | Vektor | Plausibilität | Evidence-Status | Kurzbegründung |
|---|--------|----------------|-----------------|----------------|
| V1 | **Deploy-Zeit vs. Finalize-Zeit** | Hoch | **Bestätigt (indirekt)** | BERICHT: Kalibrierung **2026-04-09**, `derived` noch **linear_2point** ohne dry/wet; aktueller Code mappt **linear_2point+moisture** auf **moisture_2point** (B1/B2). Alte Server-Version vor diesem Mapping erklärt persistiertes **slope/offset**. |
| V2 | **Nur Code aktualisiert, DB nicht neu kalibriert** | Hoch | **Bestätigt (logisch)** | Processor liest **persistiertes** `calibration_data`. Neuer Wizard/Server hilft erst bei **neuer** Session + Apply. |
| V3 | **Zweites Gerät / Mock parallel (gleicher GPIO)** | Mittel | **Bestätigt (Bericht)** | BERICHT §2.2: zwei ESPs — globale Min/Max verwischen; kein Code-Bug, falsche Diagnose möglich. |
| V4 | **Tests grün, Produktions-DB alt** | Hoch | **Bestätigt** | Unit/Integration testen **Compute** und Routen; **kein** zwingender Test „nach Apply DB-Zeile hat dry/wet“ (T3/T4). |
| V5 | **`resolve_calibration` + `derived` mit nur slope/offset** | Hoch | **Bestätigt (Code)** | `resolve` gibt **`dict(derived)`** durch — bei **linear_2point** ohne dry/wet sieht Processor kein Kalibrierpaar → **Default 3200/1500** (P1/P3). |
| V6 | **OpenAPI `method` als freier String** | Niedrig | **Unklar ohne Missbrauch** | Kein Enum in `StartSessionRequest`; fehlerhafte Clients denkbar — in der Praxis setzt Wizard korrekte Methoden (F2). |

**Explizite Frage (Deploy vs DB):** „Ist der aktuell gepushte Code in `calibration_service` (linear_2point → Feuchte-Mapping) identisch mit dem, was in der DB steht?“ — **Nein:** Die **DB** ist ein **Zeitpunkt-Snapshot** (Finalize/Apply); der **Code** ist **HEAD**. Identität entsteht erst nach **neuer Kalibrierung** (oder Migration) mit dem aktuellen Server.

---

## 4. Kanonische Strategie (eine)

**Option (a)** aus dem Implementierungsplan ist mit **HEAD** bereits **im Backend** für **`linear_2point` + `moisture`** und im **Frontend** für **`moisture_2point`** umgesetzt. **Verbleibend:** **Alt-Daten** in `sensor_configs` (linear-`derived` ohne dry/wet), **Test-Lücken** (explizite Asserts nach Apply), **Operator-Kommunikation** (Re-Kalibrierung).

---

## 5. Abgleich Artefakt STUFE B

Die ausführbare STEUER-Datei **`.claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md`** muss dieselbe Strategie und PKG-Reihenfolge tragen — **kein Widerspruch** zu diesem Dokument.
