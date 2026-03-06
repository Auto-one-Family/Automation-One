# Phase D — Kalibrierung pro Sensortyp IST-Analyse

**Erstellt:** 2026-03-06  
**Ziel-Repo:** auto-one (El Frontend + El Servador)  
**Reihe:** Roadmap Alert-Kalibrierung-Sensortypen, Phase D  
**Typ:** Analyse (kein Code, nur Inventar + Gap-Analyse)  
**Basis:** verify-plan Reality-Check + Codebase-Analyse

---

## 1. Executive Summary

Es existieren **zwei getrennte Kalibrierungs-Flows** im Projekt:

| Flow | Ort | API | Auth |
|------|-----|-----|------|
| **CalibrationWizard** | Route `/calibration`, CalibrationView | POST `/api/v1/sensors/calibrate` | API-Key (VITE_CALIBRATION_API_KEY) oder JWT |
| **SensorConfigPanel inline** | HardwareView L2 → SensorConfigPanel | POST via `sensorsApi.createOrUpdate` (calibration in config) | JWT |

**Kalibrierungs-fähige Typen:** ph, ec, moisture, soil_moisture (SensorConfigPanel) bzw. ph, ec, moisture, temperature (CalibrationWizard Presets). Temperatur im Wizard nutzt 2-Punkt-Linear; Backend unterstützt 1-Punkt-Offset für DS18B20/SHT31.

**Gap:** Retry pro Step fehlt, Abbruch nur via Zurück-Button (kein expliziter "Abbrechen"), keine Wert-Stabilitätsprüfung, keine Timeout-Validierung. **D2 implementiert (2026-03-06):** Expliziter "Abbrechen"-Button in CalibrationWizard + SensorConfigPanel.

---

## 2. Block A: Kalibrierung pro sensor_type (IST)

### A1: Inventar — Welche Typen haben Kalibrierung?

| sensor_type | CalibrationWizard | SensorConfigPanel | calibration_data Felder | Backend-Verarbeitung |
|-------------|-------------------|-------------------|-------------------------|----------------------|
| **ph** | ✓ 2-Punkt (Preset 4.0/7.0) | ✓ 2-Punkt (4.0/7.0) | slope, offset, point1_raw/ref, point2_raw/ref, calibrated_at | ph_sensor.py: slope/offset |
| **ec** | ✓ 2-Punkt (1413/12880) | ✓ 2-Punkt (0/1413) | slope, offset, points[] | ec_sensor.py: slope/offset |
| **moisture** | ✓ 2-Punkt (0%/100%) | ✓ dry/wet ADC | dry_value, wet_value, invert, calibrated_at | moisture.py: dry_value, wet_value |
| **soil_moisture** | — | ✓ (wie moisture) | dry_value, wet_value | moisture.py (gleicher Processor) |
| **temperature** | ✓ Preset (0°C/100°C) | — | offset (1-Punkt) | temperature.py: offset |
| **sht31_temp, ds18b20, bme280_*** | — | — | offset | humidity.py, temperature.py |

**Hinweis:** CalibrationWizard zeigt temperature als Preset mit 2-Punkt-Linear; Backend temperature.py unterstützt nur 1-Punkt-Offset. Potenzieller Konflikt.

### A2: pH — Detaillierter Flow (IST)

**CalibrationWizard:**
- **Steps:** 1. Select (Typ + ESP + GPIO), 2. Punkt 1 (pH 4.0), 3. Punkt 2 (pH 7.0), 4. Confirm, 5. Done/Error
- **Retry:** [x] Ja (CalibrationStep: expliziter "Erneut versuchen"-Button bei readError, D1 implementiert)
- **Abbruch:** [x] Expliziter "Abbrechen"-Button in point1/point2/confirm, optional ConfirmDialog (D2)
- **Validierung:** [ ] Keine Wert-Stabilität; [ ] Kein Timeout
- **API-Call:** Nach Step 4 (Confirm) — `calibrationApi.calibrate()` mit save_to_config: true

**SensorConfigPanel inline:**
- **Steps:** 1. pH 4.0, 2. pH 7.0, 3. Complete → Save
- **Retry:** [ ] Fehlt
- **Abbruch:** [x] "Abbrechen" in point1/point2 (D2); "Zurücksetzen" bei complete
- **Validierung:** [ ] Keine Wert-Stabilität; currentRawValue aus WebSocket/Live-Store
- **API-Call:** handleSave → sensorsApi.createOrUpdate mit calibration in config

### A3: EC — Analog zu A2

**CalibrationWizard:** 2-Punkt (1413/12880 µS/cm), gleicher Flow wie pH.  
**SensorConfigPanel:** 2-Punkt (0/1413) — "Trockene Elektrode" + "Kalibrierlosung".  
EC-Backend nutzt slope/offset; beide Flows kompatibel.

### A4: Bodenfeuchte (moisture)

**CalibrationWizard:** 2-Punkt (0%/100%) — Preset mit Referenz 0 und 100.

**SensorConfigPanel:** **Preset** — manuelle Eingabe von dry_value und wet_value (ADC). Keine 2-Punkt-Erfassung im Wizard-Style; User gibt typische ADC-Werte ein (z.B. 3200/1500).

**Substrat-spezifisch:** Referenz `auftrag-bodenfeuchtesensor.md` existiert; `kapazitiver-bodenfeuchtesensor-esp32-integration.md` (Plan-Referenz) existiert nicht.

**Backend:** moisture.py nutzt dry_value, wet_value; calibrate() liefert diese Keys.

### A5: Temperatur (Offset-Kalibrierung)

**Backend:** temperature.py (DS18B20, SHT31) unterstützt `calibration: {"offset": float}`.  
**Humidity:** humidity.py unterstützt offset-Kalibrierung.

**UI:** Weder CalibrationWizard noch SensorConfigPanel zeigen Kalibrierung für ds18b20, sht31_temp, sht31_humidity. SensorConfigPanel.needsCalibration = nur ph, ec, moisture, soil_moisture.

**Lücke:** Temperatur-Offset-Kalibrierung hat keine UI.

---

## 3. Block B: CalibrationWizard Komponenten-Struktur

### B1: Komponenten-Hierarchie

| Komponente | Pfad | Rolle |
|------------|------|-------|
| CalibrationWizard.vue | `El Frontend/src/components/calibration/CalibrationWizard.vue` | Haupt-Wizard |
| CalibrationStep.vue | `El Frontend/src/components/calibration/CalibrationStep.vue` | Einzelner Kalibrierpunkt |
| useCalibration.ts | `El Frontend/src/composables/useCalibration.ts` | State (nur SensorConfigPanel) |
| CalibrationView.vue | `El Frontend/src/views/CalibrationView.vue` | Wrapper für CalibrationWizard |

**Hinweis:** CalibrationWizard nutzt **nicht** useCalibration — eigener State (phase, points, selectedEspId, etc.). useCalibration wird nur für SensorConfigPanel inline verwendet.

**Props:** CalibrationWizard hat keine Props; CalibrationStep: stepNumber, totalSteps, espId, gpio, sensorType, suggestedReference, referenceLabel.

**Events:** CalibrationStep @captured → { raw, reference }.

**State:** CalibrationWizard: phase ref, points ref, selectedEspId/Gpio/SensorType, calibrationResult; API-Call erst bei submitCalibration (Confirm-Phase).

### B2: Retry & Abbruch

| Aspekt | CalibrationWizard | SensorConfigPanel |
|--------|-------------------|-------------------|
| **Retry pro Step** | [x] Ja (via CalibrationStep, D1) | [ ] Nein |
| **Abbruch-Button** | [x] Ja (D2: point1/point2/confirm, optional ConfirmDialog) | [x] Ja (D2: pH/EC point1/point2, resetCalibration) |
| **Teilweise gespeichert** | Nein — API-Call erst am Ende | Ja — handleSave sendet calibration nur wenn getCalibrationData() liefert; bei Abbruch vor Save kein API-Call |

**CalibrationStep:** "Wert lesen" → sensorsApi.queryData(limit: 1); bei Fehler readError. Expliziter "Erneut versuchen"-Button erscheint bei readError (D1 implementiert).

---

## 4. Block C: Backend calibration_data

### C1: Schema & API

**API:** POST `/api/v1/sensors/calibrate` (sensor_processing.py)  
**Auth:** X-API-Key (verify_api_key) oder JWT (calibration.ts Fallback).

**Request:** SensorCalibrateRequest — esp_id, gpio, sensor_type, calibration_points[], method?, save_to_config.

**DB:** sensor_configs.calibration_data — JSON/JSONB, nullable. Keys: sensor-spezifisch (slope, offset, dry_value, wet_value, points, method, calibrated_at, etc.).

**Verarbeitung:**
- ph_sensor: slope, offset
- ec_sensor: slope, offset
- moisture: dry_value, wet_value (via calibrate(calibration_points, method="linear"))
- temperature/humidity: offset (1-Punkt)

**SensorRepository:** update_calibration(esp_id, gpio, calibration_data) — überschreibt calibration_data.

### C2: Validierung

**Server-seitig:** processor.calibrate() wirft ValueError bei ungültigen Punkten (z.B. identische Punkte, zu wenige Punkte). Keine explizite slope > 0 oder points-Länge-Validierung im Schema; Library-spezifisch.

**Fehlerbehandlung:** HTTP 400 bei ValueError, 401 bei Auth-Fehler, 404 bei unbekanntem sensor_type.

---

## 5. Block D: Gap-Analyse (IST vs. SOLL)

**SOLL aus Roadmap:** Retry-Flow, einheitliches UI/UX, User-freundlich, Wiederholung möglich, kein "alles oder nichts".

| sensor_type | Retry | Abbruch | Anleitung | Priorität |
|-------------|-------|---------|----------|-----------|
| ph | ✓ (Wizard, D1) | ✓ (D2) | ✓ Anleitung | HOCH |
| ec | ✓ (Wizard, D1) | ✓ (D2) | ✓ | HOCH |
| moisture | ✓ (Wizard, D1) | ✓ (D2) | ✓ (Preset) | MITTEL |
| temp | — | — | — | NIEDRIG (Offset) |

**Pro Komponente:**
- CalibrationWizard: Retry-Button pro Step; expliziter Abbruch-Button; ggf. Wert-Stabilitätsprüfung — [x] Abbruch (D2)
- CalibrationStep: Retry bei "Wert lesen" Fehler — [x] erledigt (expliziter Button "Erneut versuchen", D1)
- SensorConfigPanel: Retry analog; Abbruch klarer — [x] Abbruch (D2)

---

## 6. Block E: Priorisierte Aufträge (Phase D)

### E1: Reihenfolge & Scope

1. **Retry-Flow (gemeinsam):** CalibrationWizard + CalibrationStep um "Erneut versuchen" pro Step erweitern
2. **Abbruch:** Expliziter "Kalibrierung abbrechen" — bei Abbruch: Teilweise-Daten verwerfen (bereits so bei CalibrationWizard)
3. **pH:** Retry + Abbruch (bereits 2-Punkt)
4. **EC:** Analog pH
5. **Bodenfeuchte:** Preset prüfen, ggf. 2-Punkt-Erfassung wie pH/EC (aktuell manuell dry/wet)
6. **Temperatur:** Offset-Kalibrierung — neu oder später? (Backend unterstützt, UI fehlt)

### Empfehlung

- **Retry-Flow zuerst:** Einmal implementieren, für alle Typen nutzen
- **CalibrationWizard vs SensorConfigPanel:** Beide Flows konsolidieren oder einheitliches Pattern? Aktuell: CalibrationWizard nutzt calibrationApi; SensorConfigPanel nutzt createOrUpdate. Beide speichern calibration_data.
- **Temperatur:** Niedrige Priorität; Offset-UI in SensorConfigPanel oder separater Mini-Step

---

## 7. verify-plan Korrekturen & Ergänzungen

### Pfad-Korrekturen

| Plan sagt | System sagt |
|-----------|-------------|
| El Servador/src/ | El Servador/god_kaiser_server/src/ |
| kapazitiver-bodenfeuchtesensor-esp32-integration.md | Existiert nicht; `auftrag-bodenfeuchtesensor.md` existiert |
| ph_processor, ec_processor | ph_sensor.py, ec_sensor.py (Dateinamen) |

### Abgabepfad

**Bericht:** `.claude/reports/current/PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md`

### Zusätzliche Erkenntnisse

- **Zwei Kalibrierungs-Flows:** Plan erwähnte nur SensorConfigPanel + CalibrationWizard; nicht explizit, dass beide unterschiedliche APIs nutzen und useCalibration nur im Panel verwendet wird
- **API-Key:** /sensors/calibrate nutzt X-API-Key; VITE_CALIBRATION_API_KEY optional
- **Firmware:** ESP32 sendet raw_values; Kalibrierung vollständig server-seitig — relevant für Plan nur: Kein ESP32-Code für Kalibrierung

---

## 8. Akzeptanzkriterien

- [x] Kalibrierung pro sensor_type inventarisiert
- [x] pH/EC/moisture Flow detailliert (Steps, Retry, Abbruch)
- [x] CalibrationWizard Komponenten-Struktur
- [x] Backend calibration_data Schema
- [x] Gap-Analyse IST vs. SOLL
- [x] Priorisierte Implementierungs-Empfehlung

---

## 9. DB-Analyse (db-inspector)

**Vollständiger Bericht:** `.claude/reports/current/DB_CALIBRATION_SCHEMA_ANALYSIS.md`

**Kernerkenntnisse:**
- `calibration_data` ist `json` (nicht JSONB), nullable
- Keine Alembic-Migration; Spalte aus initialem Schema
- 0 Sensoren mit echten Kalibrierungsdaten in DB; 4 mit JSON `null`
- **Priorität HOCH:** `update_calibration` muss `sensor_type` berücksichtigen (Multi-Value-Sensoren SHT31/BME280)

## 10. Referenzen für Skills

| Skill | Relevante Dateien |
|-------|-------------------|
| frontend-development | CalibrationWizard.vue, CalibrationStep.vue, useCalibration.ts, SensorConfigPanel.vue, calibration.ts |
| server-development | sensor_processing.py, ph_sensor.py, ec_sensor.py, moisture.py, temperature.py, humidity.py, sensor_repo.py |
| esp32-development | Keine Kalibrierungs-Logik (nur raw senden) |
| db-inspector | sensor_configs.calibration_data (json Schema), DB_CALIBRATION_SCHEMA_ANALYSIS.md |
