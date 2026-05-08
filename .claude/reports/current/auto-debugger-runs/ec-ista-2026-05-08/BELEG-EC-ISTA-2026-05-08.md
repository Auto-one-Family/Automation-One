# EC-Sensor IST-Analyse (DFR0300) — 2026-05-08

**Typ:** Reine Analyse — kein Code geändert  
**Hardware:** DFRobot DFR0300 V2 (K=1.0), ESP32  
**Analysiert:** Server / Frontend / Firmware (Pi-Enhanced-Pfad)

---

## Block 1 — Server

### 1.1 EC-Konvertierungspfad

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ec_sensor.py`

Die vollständige Pipeline in `ECSensorProcessor.process()` (Zeilen ca. 102–212):

```
Schritt 1: validate(raw_value)                  — ADC 0–4095 (12-bit) oder 0–32767 (16-bit)
Schritt 2: _adc_to_voltage(raw_value, adc_type)  — 12-bit: (raw / 4095) * 3.3 V
Schritt 3: Kalibrierung anwenden
           MIT  Kalibrierung (slope+offset): ec = slope * voltage + offset
           OHNE Kalibrierung (Default):      ec = 6060.0 * voltage + 0.0
Schritt 4: Temperaturkompensation (OPTIONAL)
           Wenn params["temperature_compensation"] vorhanden:
             ec_25C = ec / (1 + 0.02 * (T - 25))
Schritt 5: Clamp zu [0, 20000] µS/cm
Schritt 6: Unit-Konvertierung (us_cm / ms_cm / ppm)
Schritt 7: Runden (default 1 Dezimalstelle)
Schritt 8: Quality-Assessment
```

**α-Koeffizient im Code:** `TEMP_COEFFICIENT = 0.02` — **nicht** 0.0185 (DFRobot-Library-Wert).

**Reihenfolge:** Erst Kalibrierung (slope/offset auf Spannungsbasis), dann Temperaturkompensation.

**kvalue-Quelle:** Kommt indirekt als `slope` aus DB (`sensor_configs.calibration_data`), pro Sensor.

---

### 1.2 Kalibrier-Datenmodell — KRITISCHER BEFUND

**Datei:** `El Servador/god_kaiser_server/src/services/calibration_service.py` (ca. Zeile 1046)

Das 1-Punkt-Kalibrierverfahren `_compute_ec_1point()` liefert:
```python
{
    "type": "ec_1point",
    "cell_factor": round(cell_factor, 6),   # = reference / raw
    "point_raw": raw,
    "point_reference": reference,
    "calibrated_at": "..."
}
```

**Datei:** `El Servador/god_kaiser_server/src/services/calibration_payloads.py` (ca. Zeile 118)

`resolve_calibration_for_processor()` übergibt das `derived`-Dict flach an den Prozessor.  
`ECSensorProcessor.process()` prüft auf `"slope"` und `"offset"` — diese Keys fehlen im `ec_1point`-Ergebnis.

**Konsequenz:** Nach erfolgter 1-Punkt-Kalibrierung läuft der Prozessor weiter auf dem unkalibriertem Default-Pfad (`6060 µS/cm * voltage`). Der `cell_factor` ist gespeichert aber **wird nicht angewendet**.

Gespeichertes `calibration_data`-JSON in `sensor_configs`:
```json
{
  "method": "ec_1point",
  "points": [...],
  "derived": {
    "type": "ec_1point",
    "cell_factor": 0.XXXXXX,
    "point_raw": ...,
    "point_reference": ...,
    "calibrated_at": "..."
  },
  "metadata": { "schema_version": 1 }
}
```

Kein `kvalue_low`/`kvalue_high` (DFRobot-Konzept), kein `buffer_temp`, kein Buffer-Standard-Feld.

---

### 1.3 Kalibrier-API

**Datei:** `El Servador/god_kaiser_server/src/api/v1/calibration_sessions.py`

Session-basierter Lifecycle:

| Methode | Pfad | Funktion |
|---------|------|----------|
| POST | `/v1/calibration/sessions` | Session starten |
| GET | `/v1/calibration/sessions/{id}` | Session lesen |
| POST | `/v1/calibration/sessions/{id}/points` | Punkt hinzufügen |
| PUT | `/v1/calibration/sessions/{id}/points/{point_id}` | Punkt überschreiben |
| DELETE | `/v1/calibration/sessions/{id}/points/{point_id}` | Punkt löschen |
| POST | `/v1/calibration/sessions/{id}/finalize` | Berechnen |
| POST | `/v1/calibration/sessions/{id}/apply` | Auf Sensor anwenden |
| POST | `/v1/calibration/sessions/{id}/reject` | Abbrechen |
| GET | `/v1/calibration/sessions/sensor/{esp_id}/{gpio}` | Historie |

**1-Punkt-Kalibrierung:** Ja, explizit unterstützt über `method: "ec_1point"` mit `expected_points: 1`.

**Sample-Mittelwert-Fenster:** Keines. Jeder Punkt ist ein Einzelwert. Der Wizard triggert eine MQTT-Messung, der ESP sendet einen Raw-ADC-Wert, dieser wird als Punkt gespeichert.

---

### 1.4 Temperaturquelle für ATC

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (ca. Zeile 1394)

Die Temperaturkompensation kommt aus `sensor_config.sensor_metadata.get("processing_params")` — einem **statisch gespeicherten** JSON-Feld.

**Kein automatischer Lookup eines zeitnahen Temperaturwerts.**  
Kein DS18B20-Lookup in Echtzeit, kein Cross-Sensor-Cache für EC-Messung.

**Fallback bei fehlender Temperatur:** Keine Kompensation (Zeile ca. 177). Kein 25°C-Fallback — die Kompensation wird übersprungen, wenn `"temperature_compensation"` nicht in params vorhanden ist.

---

### 1.5 RAW-ADC-Pfad (Pi-Enhanced bestätigt)

- `El Trabajante/src/models/sensor_types.h`: `bool raw_mode = true` (Default für alle Sensoren)
- `sensor_handler.py` ca. Zeile 304: `if sensor_config and sensor_config.pi_enhanced and raw_mode:` → EC Pi-Enhanced wenn `pi_enhanced=True`

**MQTT-Topic:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`  
**Payload-Typ:** `{"raw": <int ADC 0-4095>, "raw_mode": true, "sensor_type": "ec", ...}`

**Voraussetzung:** `sensor_config.pi_enhanced` muss `True` sein. Sonst wird Raw-ADC unkonvertiert als `processed_value` gespeichert.

---

## Block 2 — Frontend

### 2.1 Kalibrier-Wizard für EC

**Hauptkomponente:** `El Frontend/src/components/calibration/CalibrationWizard.vue`  
**State-Management:** `El Frontend/src/composables/useCalibrationWizard.ts`  
**Route:** `/calibration` → `CalibrationView.vue`

EC-Preset in `useCalibrationWizard.ts` (ca. Zeile 126):
```typescript
ec: {
  label: 'EC-Sensor',
  point1Label: 'Referenzloesung (z.B. 1413 µS/cm)',
  point1Ref: 1413,
  expectedPoints: 1,
  calibrationMethod: 'ec_1point',
}
```

**Wizard-Schritte für EC:**
1. `select` — Sensor-Typ "EC-Sensor" wählen, Gerät + GPIO auswählen
2. `point1` — Hinweis "Referenzlösung auf 25°C ±2°C bringen, Sonde eintauchen" + Live-Messung triggern + RAW-Wert annehmen + Referenzwert (vorgefüllt: 1413) bestätigen
3. `confirm` — Zusammenfassung: "EC 1-Punkt", RAW → Ref 1413
4. `finalizing` — Session finalize + apply
5. `done` — Zeigt `cell_factor` aus Ergebnis

**Unterstützt 1-Punkt explizit:** Ja. Nach Punkt 1 direkt zu `confirm` (ca. Zeile 536: `if preset?.expectedPoints === 1`).

**Buffer-Temperatur-Eingabefeld:** **Nicht vorhanden.** Nur Hinweistext, keine Abfrage.

**Sample-Mittelwert:** Kein Fenster. Eine Messung = ein Point.

---

### 2.2 Kalibrier-Stand-Anzeige

**Nicht vorhanden.** Kein dediziertes UI-Element für letzten `cell_factor`, letztes Kalibrierungsdatum, verwendeten Buffer-Standard — weder in HardwareView noch in SensorConfigPanel.

Session-Historie ist über API abrufbar, aber keine UI-Komponente zeigt sie an.

---

### 2.3 Sensor-Anlage für EC

EC ist im Sensor-Type-Dropdown registriert (`sensorDefaults.ts`). Anlage über HardwareView / SensorConfigPanel. **Kritisch:** `pi_enhanced: true` muss beim Anlegen gesetzt sein, sonst kein Server-seitiges Converting.

---

## Block 3 — Firmware

### 3.1 Raw-Passthrough für EC

Bestätigt. `sensor_types.h`: `bool raw_mode = true` (Hardcode-Default für alle Sensoren). Keine sensor-typ-spezifische Konvertierung in der Firmware. Keine `applyLocalConversion()`-Logik für EC.

### 3.2 Sample-Rate / Median-Filter

`measurement_interval_ms = 30000` (30 Sekunden Default). On-Demand-Messungen (Kalibrierungs-Trigger) = Einzelmessung, kein Median-Filter über mehrere Samples. Für stabile Kalibrierung müsste Wizard mehrfach triggern und mitteln — aktuell nicht automatisiert.

### 3.3 Fazit Firmware

**Firmware unauffällig, Pi-Enhanced-Pfad bestätigt.** Kein Fehler in der ESP32-Schicht für EC.

---

## Block 4 — Step-by-Step Kalibrier-Plan (aktueller Stand)

### Voraussetzung
Sensor in HardwareView angelegt, `pi_enhanced=True`, ESP online, 1413 µS/cm Buffer-Lösung auf ~25°C.

### UI-Schritte
1. `/calibration` aufrufen
2. "EC-Sensor" auswählen
3. Gerät + GPIO des DFR0300 auswählen
4. Hinweis lesen: Sonde vollständig in 1413 µS/cm eintauchen, 25°C ±2°C
5. "Frische Messung starten" → MQTT-Trigger → ESP liest ADC → RAW-Wert erscheint
6. Referenzwert 1413 bestätigen → Punkt persistiert
7. "Kalibrierung ausführen" → Server berechnet `cell_factor`, schreibt in DB

### Was im Backend ankommt
- `POST /v1/calibration/sessions` (`method: "ec_1point"`, `expected_points: 1`)
- `POST /v1/calibration/sessions/{id}/points` (`raw_value: <ADC>`, `reference_value: 1413`)
- `POST /v1/calibration/sessions/{id}/finalize` → `cell_factor = 1413 / raw`
- `POST /v1/calibration/sessions/{id}/apply` → schreibt in `sensor_configs.calibration_data`

### Ehrliche Lücken

**Lücke A — KRITISCH: cell_factor wird beim Processing nicht angewendet.**  
Der größte Bug. Nach Apply enthält `calibration_data.derived` nur `cell_factor`. Der `ECSensorProcessor` erwartet `slope`+`offset`, findet sie nicht, fällt auf Default `6060 * voltage` zurück. Die Kalibrierung hat null messbaren Effekt auf die Sensorwerte.

**Lücke B — Temperaturkompensation ist inaktiv.**  
Kein automatischer DS18B20-Lookup. Ohne manuellen Eintrag in `sensor_metadata.processing_params.temperature_compensation` wird keine Kompensation durchgeführt.

**Lücke C — Kein Sample-Mittelwert.**  
Ein ADC-Read kann durch Rauschen verfälscht sein. Für stabile Kalibrierung: Wizard mehrfach triggern und stabilsten Wert nehmen (manuell).

**Lücke D — Kein Kalibrierstand in der UI.**  
Nach Kalibrierung keine Anzeige von `cell_factor` oder Zeitpunkt der letzten Kalibrierung.

---

## Bewertung: 1-Punkt-Kalibrierung heute möglich?

**Ja-mit-Workaround — aber Workaround hebt Kern-Bug nicht auf.**

Der Wizard läuft durch, die Session wird mit Status `applied` gespeichert. Aber der `cell_factor` wird beim Processing **stumm ignoriert**. Erst nach Patch 1 (cell_factor → EC-Prozessor) hat die Kalibrierung einen messbaren Effekt.

**Kann Robin sofort kalibrieren?** Nein sinnvoll. Patch 1 muss zuerst.

---

## α-Koeffizient-Status

| | Wert | Quelle |
|--|------|--------|
| Im Code | `0.02` | `TEMP_COEFFICIENT = 0.02` in `ec_sensor.py` |
| DFRobot-Library | `0.0185` | DFRobot_EC library, für deren Probe optimiert |
| Differenz | ~8% des Kompensationsbetrags | Bei 20°C: 0.02 → -9.1%, 0.0185 → -8.5% |

**Empfehlung:** 0.02 ist für Hydroponik/Cannabis akzeptabel (Unterschied <0.05 mS/cm im üblichen Bereich). Wenn Präzision mit DFRobot-Hardware gewünscht: als konfigurierbares Feld in `sensor_metadata.processing_params` führen.

---

## Offene Punkte / Patch-Kandidaten

### KRITISCH — Patch 1: cell_factor → EC-Prozessor

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ec_sensor.py`, ca. Zeile 166

`ECSensorProcessor.process()` muss `cell_factor` erkennen und anwenden:
- **Option A (minimal-invasiv):** Branch hinzufügen: wenn `cell_factor` in calibration → `ec = ec_default * cell_factor`
- **Option B (konsistentes Datenmodell):** In `_compute_ec_1point()` slope/offset ableiten: `slope = cell_factor * DEFAULT_SLOPE`, `offset = 0` → als slope/offset schreiben

### HOCH — Patch 2: ATC-Mechanismus

Analog VPD-Berechner: beim EC-Processing letzten bekannten DS18B20/SHT31-Wert aus DB holen und als `temperature_compensation` übergeben.

### MITTEL — Patch 3: Sample-Mittelwert im Wizard

Wizard sollte N Messungen aggregieren (z.B. 5 Samples, Mittelwert) für stabile Kalibrierung.

### NIEDRIG — Patch 4: Kalibrierstand in UI

In SensorConfigPanel oder Wizard-Done-Screen letzten `cell_factor` + Zeitpunkt der letzten Kalibrierung anzeigen.

---

## Relevante Dateipfade

| Datei | Bedeutung |
|-------|-----------|
| `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ec_sensor.py` | Bug-Ort (slope/offset Check) |
| `El Servador/god_kaiser_server/src/services/calibration_service.py` | `_compute_ec_1point()` |
| `El Servador/god_kaiser_server/src/services/calibration_payloads.py` | `resolve_calibration_for_processor()` |
| `El Frontend/src/composables/useCalibrationWizard.ts` | EC-Preset |
| `El Frontend/src/components/calibration/CalibrationWizard.vue` | UI-Wizard |
| `El Trabajante/src/models/sensor_types.h` | raw_mode = true Default |
| `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` | Pi-Enhanced-Branch + ATC-Lookup |
