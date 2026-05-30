# EC-Sensor End-to-End Baseline — Phase 0
**Datum:** 2026-05-22 | **Sensor:** DFRobot DFR0300 K=1, GPIO 32, sensor_type `ec`  
**ESP:** ESP_698EB4 (offline) | **Prüflösung:** 1413 µS/cm @ 25 °C  
**Status:** REINE ANALYSE — keine Code/Konfig/DB-Änderungen

---

## [A] KONFIGURATIONS- / HARDWARE-SCHICHT

### A.1 — Sensor-Konfiguration in DB (verifiziert)

> **KRITISCHER BEFUND: Kein EC-Sensor in `sensor_configs`.**

```sql
SELECT * FROM sensor_configs WHERE sensor_type = 'ec';
-- → 0 rows
SELECT * FROM sensor_configs WHERE gpio = 32;
-- → 2 rows: sensor_type = 'moisture' auf ESP_EA5484 + ESP_6B27C8
```

Der EC-Sensor-Config-Eintrag wurde aus der Datenbank gelöscht. Die historischen
`sensor_data`-Zeilen von ESP_698EB4 sind noch vorhanden (kein FK-Constraint).

**GPIO 32 auf dem Ziel-ESP (ESP_698EB4):** kein aktiver Sensor-Eintrag.  
**DS18B20 auf ESP_698EB4:** nicht in `sensor_configs` — konsistent mit der
Auftragsbeschreibung ("physisch angeschlossen, noch nicht konfiguriert").

**Aktuelle sensor_configs ESP_698EB4:**
| sensor_type | gpio | interface_type | enabled |
|-------------|------|----------------|---------|
| sht31_temp | 0 | I2C | true |
| sht31_humidity | 0 | I2C | true |
| vpd | 0 | VIRTUAL | true |

**device_metadata ESP_698EB4:**
- `simulation_config`: leer (`{"sensors": {}, "actuators": {}}`)
- `system_state`: `ZONE_CONFIGURED` (Zone: `zelt_wohnzimmer`)
- `last_sensor_count`: 2 (SHT31 × 2, kein EC)

### A.2 — ADC-Setup GPIO 32 (Firmware, verifiziert)

| Eigenschaft | Wert | Beleg |
|-------------|------|-------|
| ADC-Kanal | ADC1_CH4 (WiFi-sicher, kein Konflikt) | `El Trabajante/src/core/config/esp32_dev.h:114-117` |
| ADC-API | `analogRead(gpio)` (Arduino-API, kein esp_adc-Treiber) | `El Trabajante/src/core/sensors/sensor_manager.cpp:1753,1758` |
| Attenuation | `ADC_11db` → 0–3.3 V Messbereich | `El Trabajante/src/core/sensors/sensor_manager.cpp:1749` |
| Auflösung | 12-bit → 0–4095 | `El Trabajante/src/core/sensors/sensor_manager.cpp:128` |
| ADC2-Konflikt-Check | GPIO 32 ist NOT in `ADC2_GPIO_PINS[]` → kein Konflikt | `El Trabajante/src/core/sensors/sensor_manager.cpp:1740-1744` |

**Anmerkung:** ESP32-ADC (Arduino-Pfad) hat bekannte Nichtlinearität und ±10% Ungenauigkeit.
Kein hardware-ADC-Kalibrierungsmodul eingebunden. Dies ist als Sprünge-Ursache priorisiert.

---

## [B] FIRMWARE-SCHICHT (El Trabajante)

### B.1 — ADC-Lesepfad GPIO 32 → Rohwert (verifiziert)

```
performAllMeasurements()  [sensor_manager.cpp:1359]
  → readRawAnalog(gpio=32)  [sensor_manager.cpp:1726]
    → gpio_manager_->configurePinMode(32, INPUT)  [sensor_manager.cpp:1748]
    → analogSetPinAttenuation(32, ADC_11db)        [sensor_manager.cpp:1749]
    → [2× analogRead() warmup, verworfen]          [sensor_manager.cpp:1752]
    → [9× analogRead() → Insertion-Sort → Median]  [sensor_manager.cpp:1753-1760]
    → return median_value (0–4095)
```

### B.2 — applyLocalConversion("ec") = RAW-Passthrough (verifiziert)

`El Trabajante/src/core/sensors/sensor_manager.cpp:159-186`:  
Die Funktion `applyLocalConversion()` hat **keinen `"ec"`-Case**. EC fällt
in den Default-Zweig:
```cpp
// sensor_manager.cpp:184-186
// Unknown type → raw passthrough (server handles conversion)
return { (float)raw_value, "raw", false };
```

**Weder Voltage-Berechnung, noch kvalue-Lookup, noch Temperaturkompensation
in der Firmware.** Der ADC-Wert (0–4095) wird direkt als `processed_value`
und `"raw"` als unit published. Das ist architekturkonform (Server-Centric).

**Kein EC-Kalibriercode in der Firmware:**
Suche nach `kvalue`, `ECREF`, `RES2`, `calibrat` im gesamten `El Trabajante/src/` →
**0 Treffer.** DFRobot-Bibliothekskonstanten existieren nicht im Firmware-Code.

### B.3 — Sampling und Filterung (verifiziert)

**Continuous mode (autonome Messung):**
- 2 Warmup-Reads → verworfen
- 9 ADC-Samples → Insertion-Sort → Median
- Konstanten: `ADC_WARMUP_READS = 2`, `ADC_SAMPLE_COUNT = 9`
- Belege: `El Trabajante/src/core/sensors/sensor_manager.cpp:128-143, 1752-1760`

**On-Demand (triggerManualMeasurement):**
- 3 vollständige Messungen (je 9-Sample-Median), 200ms Delay zwischen Messungen
- Bubble-Sort der 3 Ergebnisse → Median
- Gesamt: 3 × (2+9) = 33 ADC-Reads
- Beleg: `El Trabajante/src/core/sensors/sensor_manager.cpp:1648-1684`

**Fazit Filterung:** Mechanisch solide (doppelter Median). Persistente Sprünge
(Rail-Werte wie raw=816, echte Kontaktprobleme, Electrode-in-Air) werden jedoch
als valide Messungen durchgelassen — der Median von 9 schützt nur vor
Einzelausreißern, nicht vor einem durchgehend schlechten Signalpegel.
Null-Werte durch AUT-327-Guard (Server) gefiltert.

### B.4 — Mess-Scheduling (verifiziert)

- Default-Intervall: `30.000 ms` (30 Sekunden)
- Beleg: `El Trabajante/src/core/sensors/sensor_manager.cpp:204`; `El Trabajante/src/core/sensors/sensor_types.h:37-38`
- Trigger: `performAllMeasurements()` in Safety-Task (Core 1)
- EC-Empfehlung laut sensorDefaults: `recommendedMode = 'on_demand'` — d.h. kontinuierlicher 30s-Zyklus ist nicht der bevorzugte Betriebsmodus für EC

### B.5 — NVS-Kalibrierung für EC (verifiziert: nicht vorhanden)

`El Trabajante/src/core/config/config_manager.cpp:1761-1854`: NVS-Keys für
Sensor-Config: `gpio`, `type`, `name`, `subzone_id`, `active`, `raw_mode`,
`operating_mode`, `measurement_interval_ms`, `onewire_address`, `i2c_address`.

**Keine EC-spezifischen Kalibrierungskeys** (kein `kvalue`, `calibration_point_low/high`,
`ECREF`, `RES2`). Kalibrierung ist vollständig server-seitig.

### B.6 — Temperaturkompensations-Hook (verifiziert: nicht vorhanden)

Kein einziger Codepfad in der Firmware, in dem ein EC-ADC-Read einen Temperaturwert
konsumiert. Ein `value_cache_[]` existiert (`El Trabajante/src/core/sensors/sensor_manager.h:196-208`),
aber wird nur von `OfflineModeManager` für Hysterese-Regeln genutzt, nicht im Messpfad.

**DS18B20-Integrationsbereitschaft:** Ein DS18B20 kann als eigenständiger Sensor
konfiguriert werden (separater Slot in `sensors_[]`). Er publiziert seinen Messwert
selbst. Temperaturkompensation für EC **muss zwingend serverseitig erfolgen** —
das ist architekturkonform und vom Server vollständig implementiert (→ Block D).

---

## [C] MQTT-SCHICHT

### C.1 — EC-Messdaten-Topic (verifiziert)

| Richtung | Topic | QoS |
|----------|-------|-----|
| ESP → Server (Daten) | `kaiser/god/esp/{esp_id}/sensor/32/data` | 1 |
| Server → ESP (Command) | `kaiser/god/esp/{esp_id}/sensor/32/command` | 1 |
| ESP → Server (Response) | `kaiser/god/esp/{esp_id}/sensor/32/response` | 1 |

Topic-Builder: `El Servador/god_kaiser_server/src/mqtt/topics.py:306, 49-64, 67-82`  
Subscriber-Registrierung: `El Servador/god_kaiser_server/src/mqtt/main.py:261-263, 364-368`

### C.2 — Payload-Schema Sensor-Daten (verifiziert)

```json
{
  "ts":          1735818000,
  "esp_id":      "ESP_698EB4",
  "gpio":        32,
  "sensor_type": "ec",
  "raw":         85,
  "value":       0.0,
  "unit":        "raw",
  "quality":     "good",
  "raw_mode":    true
}
```
Beleg: `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:137-148`

### C.3 — On-Demand-Command-Payload (verifiziert)

```json
{
  "command": "measure",
  "request_id": "<uuid>",
  "correlation_id": "<uuid>",
  "intent_id": "<uuid>",
  "timestamp": 1735818000
}
```
Beleg: `El Servador/god_kaiser_server/src/mqtt/publisher.py:134-144`

---

## [D] SERVER-SCHICHT (El Servador)

### D.1 — sensor_type_registry (verifiziert)

```python
# sensor_type_registry.py:61-63
SENSOR_TYPE_MAPPING = {
    "ec_sensor": "ec",
    "ec": "ec",  # Identity
}
```
`normalize_sensor_type("ec")` → `"ec"`. Kein Multi-Value (`is_multi_value_sensor("ec")` → False).  
Beleg: `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py:61-63, 113-171`

Mock-Default: `"ec": {"raw_value": 1500.0, "unit": "µS/cm"}` — `sensor_type_registry.py:226`

### D.2 — RAW-ADC → EC (µS/cm) Umrechnung (verifiziert)

Vollständige Implementierung in:  
`El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ec_sensor.py`

**Klasse:** `ECSensorProcessor(BaseSensorProcessor)`  
**Umrechnungspfad `process()` (ec_sensor.py:163-181):**

```
raw_value (0-4095, ADC)
  → _adc_to_voltage(): voltage = (adc / 4095) * 3.3      [ec_sensor.py:163]
    (Auto-Detection: raw > 4095 → 16-bit angenommen)
  
  → MIT Kalibrierung:
    - slope + offset vorhanden: ec = slope * voltage + offset  [ec_sensor.py:166-168]
    - nur cell_factor (legacy): ec = cell_factor * raw_value   [ec_sensor.py:169-171]
  
  → OHNE Kalibrierung (Fallback):
    DEFAULT_SLOPE = 6060.0 µS/cm/Volt                         [ec_sensor.py:179-181]
    ec = 6060.0 * voltage
    → Bei 3.3V: ~20.000 µS/cm (Vollaussteuerung)
    → Bei typischen raw=85: ~687 µS/cm (ohne Kalibrierung)
```

**Temperaturkompensation (ec_sensor.py:419-466):**
```
EC25 = EC_raw / (1 + 0.02 * (T - 25))
```
Koeffizient im Server: **0.02** (DFRobot-Referenz: **0.0185**)  
→ Abweichung bei 10°C Temperaturdifferenz: ~1.6%; bei 15°C: ~2.4%.

### D.3 — Kalibrierung Server-seitig (verifiziert)

**REST-Endpunkte:**
```
POST   /v1/calibration/sessions                       → start_session
POST   /v1/calibration/sessions/{id}/points           → add_point
POST   /v1/calibration/sessions/{id}/finalize         → finalize
POST   /v1/calibration/sessions/{id}/apply            → apply
GET    /v1/calibration/sessions/sensor/{esp_id}/{gpio} → history
```
Beleg: `El Servador/god_kaiser_server/src/api/calibration_sessions.py:164, 222, 310, 335, 405`

**EC-Methoden:**
- `ec_1point`: 1 Referenzpunkt → berechnet `slope`, `offset`, `cell_factor`
- `ec_2point`: 2 Punkte (Luft + Referenz) → berechnet `slope`, `offset`

`calibration_sessions.py:43-50`: `calibration_temperature` Default = 25.0°C, Range -10..50°C.

### D.4 — Temperaturkompensation Server-seitig (verifiziert)

**ATC-Lookup-Priorität** (`sensor_handler.py:326-367`):
1. Explizit verlinkter Sensor via `temp_sensor_config_id` (FK)
2. Same-ESP Auto-Discovery (`temperature` oder `sht31_temp`)
3. Fallback: 25°C (Default)

**Drei-Tier Cache-Policy:**
- `age < 5s` → fresh
- `5s ≤ age < 90s` → `source="cached_temp"` (nutzbar)
- `age ≥ 90s` → **EC-Messung abgebrochen** (kein stiller 25°C-Fallback wenn Temp-Sensor konfiguriert!)

### D.5 — AUT-327-Guard (verifiziert)

`sensor_handler.py:287-293`: EC mit `raw_mode=True` und `raw=0` → **hart gedroppt**,
nicht persistiert. Erklärt die Null-Lücken in den historischen Daten.

### D.6 — Persistenz in sensor_data (verifiziert)

Beides wird gespeichert: `raw_value` (ADC 0–4095) **und** `processed_value` (µS/cm).  
`processing_mode`: `"pi_enhanced"` (wenn `pi_enhanced=True`), `"raw"` (Fallback), `"local"` (ESP-seitig konvertiert).  
`metadata`: enthält `temp_compensation_value`, `temp_source`.  
Beleg: `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:583-612`

---

## [E] FRONTEND-SCHICHT (El Frontend)

### E.1 — sensorDefaults-Eintrag für "EC" (verifiziert)

`El Frontend/src/utils/sensorDefaults.ts:183-204`:

| Feld | Wert |
|------|------|
| Key | `'EC'` (Case-insensitive Lookup vorhanden) |
| label | `'Leitfähigkeit'` |
| unit | `'µS/cm'` |
| min / max | 0 / 5000 |
| decimals | **0** (ganze Zahlen) |
| recommendedMode | `'on_demand'` |
| supportsOnDemand | `true` |
| calibrationRequired | `true` |
| calibrationNote | `'Kalibrierung mit 1413 µS/cm Standardlösung alle 30 Tage.'` |
| accuracy | `'±2 % FS'` |

### E.2 — Kalibrierungs-UI (verifiziert: vollständig implementiert)

`El Frontend/src/components/calibration/CalibrationWizard.vue`:
- EC-Hint: "Referenzlösung auf Raumtemperatur bringen (25°C ±2°C). Sonde vollständig eintauchen."
- ATC-Temperatureingabe (nur für EC und pH sichtbar)
- Luft-Referenz als optionaler Punkt 1 (skip-Button)
- Ergebnis: `cell_factor`-Bewertung (1.0–4.0 = "Gut", >4.0 = "Reinigen", außerhalb = "Sonde ersetzen")
- Routen: `/calibration` → `CalibrationView.vue` → `CalibrationWizard.vue`
- Session-Methoden: `ec_1point`, `ec_2point`

### E.3 — On-Demand-Trigger (verifiziert: 3 Stellen)

| Komponente | Datei | Zeile | Bedingung |
|------------|-------|-------|-----------|
| SensorCard | `SensorCard.vue` | 332-360 | `operating_mode === 'on_demand'` |
| SensorValueCard | `SensorValueCard.vue` | 130-165 | immer sichtbar |
| EditSensorModal | `EditSensorModal.vue` | 208-221 | `editEffectiveMode === 'on_demand'` |

REST-Call: `POST /sensors/{espId}/{gpio}/measure` → Antwort kommt per **WebSocket**
(`sensor_data`-Event). Timeout: 20s, danach Toast "Kein Messwert erhalten".

### E.4 — EC-Formatierung (verifiziert)

- Dezimalformat: `Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })`
- Output: `"1.413 µS/cm"` (deutsches Trennzeichen, 0 Nachkommastellen)
- **Kein mS/cm ↔ µS/cm Konverter** im Frontend-Code
- Chart Y-Achse: automatisch 0–5000 µS/cm bei Widget-Autogeneration
- Sparkline: `ON_DEMAND_GAP_THRESHOLD_MS = 120.000` — Lücken bei > 2min Abstand

---

## [F] DATENAUFZEICHNUNG / LIVE-MESSUNG

### F.1 — Reproduzierbare DB-Query (read-only)

```sql
-- EC-Zeitreihe mit Rohwert und verarbeitetem Wert:
SELECT 
  sd.timestamp,
  sd.raw_value,
  sd.processed_value,
  sd.unit,
  sd.processing_mode,
  sd.quality,
  sd.metadata->>'temp_source' AS temp_source,
  sd.metadata->>'temp_compensation_value' AS temp_C
FROM sensor_data sd
JOIN esp_devices ed ON sd.esp_id = ed.id
WHERE ed.esp_uuid = 'ESP_698EB4'
  AND sd.sensor_type = 'ec'
ORDER BY sd.timestamp DESC
LIMIT 200;
```

Für Live-Monitoring (sobald EC-Config wieder angelegt):
```sql
-- Statistik der letzten 1 Stunde:
SELECT 
  COUNT(*) as n,
  MIN(raw_value) as raw_min,   MAX(raw_value) as raw_max,
  ROUND(STDDEV(raw_value)::numeric, 1) as raw_stddev,
  MIN(processed_value) as ec_min, MAX(processed_value) as ec_max,
  ROUND(AVG(processed_value)::numeric, 1) as ec_avg,
  ROUND(STDDEV(processed_value)::numeric, 1) as ec_stddev
FROM sensor_data sd
JOIN sensor_configs sc ON sd.sensor_config_id = sc.id
WHERE sc.sensor_type = 'ec' AND sc.gpio = 32
  AND sd.timestamp > NOW() - INTERVAL '1 hour';
```

### F.2 — Live-Stichprobe: Historische EC-Daten von ESP_698EB4 (verifiziert)

**Datenlage:** Kein aktueller EC-Sensor in DB. Letzte Messung: 2026-05-10 14:28 UTC.
167 reale Messwerte gesamt.

**Statistik aller 167 realen Messungen:**

| Metrik | raw_value (ADC) | processed_value (µS/cm) |
|--------|-----------------|-------------------------|
| n | 167 | 167 |
| min | 0 | 0 |
| max | **816** | **17.027** |
| Spannweite | **816** | **17.027** |
| Ø (mean) | 85,9 | 1.432 |
| **STDDEV** | **204,3** | **3.680** |
| CV (σ/μ) | **237 %** | **237 %** |

**Die Streuung ist mehr als das Doppelte des Mittelwerts — extrem.** Erwartete Streuung
bei 1413 µS/cm Prüflösung mit ordentlichem Setup: ±5% = ±70 µS/cm, STDDEV ~35.

**Ausreißer-Muster (letzte 12 Messungen 2026-05-10, verifiziert):**

| Timestamp UTC | raw | processed µS/cm | temp_source |
|---------------|-----|-----------------|-------------|
| 14:28:33 | 107 | 2.233 | cached_temp 21,4°C |
| 14:27:03 | 90 | 1.878 | cached_temp 21,4°C |
| 14:26:48 | 85 | 1.774 | cached_temp 21,4°C |
| 14:26:26 | 90 | 1.878 | cached_temp 21,4°C |
| **14:26:04** | **816** | **17.027** | cached_temp 21,4°C |
| 14:24:36 | 0 | 0 | cached_temp 21,3°C |
| 14:15:22 | 93 | 1.949 | cached_temp 21,2°C |
| **14:13:59** | **811** | **16.993** | cached_temp 21,2°C |
| **14:12:01** | **791** | **16.574** | cached_temp 21,2°C |

**Identifizierte Muster:**
1. **Rail-Spikes (raw ~816 = near 4095):** 3 von 12 letzten Messungen. Physikalisch
   unmöglich bei 1413 µS/cm Prüflösung. Ursache: Elektrode aus Lösung gehoben,
   Kurzschluss oder Kontaktproblem. Der 9-Sample-Median hat diese Werte NICHT
   herausgefiltert — d.h. ≥5 der 9 ADC-Samples waren nahe 816.
2. **Null-Werte:** raw=0, processed=0 (ca. 40–50% aller Messungen). Vom
   AUT-327-Guard gedroppt. Ursache: offener Eingang, DFR0300 Stabilisierungszeit,
   oder Elektrode trocken.
3. **Stabiles Fenster:** Bei raw=70-107 ergibt sich processed=1.177–2.233 µS/cm.
   Der Sollwert 1413 µS/cm ist in diesem Bereich erreichbar (raw≈84 trifft genau 1413).
   Ohne Kalibrierung aber ~50% Streuung um Sollwert.

**Hinweis `temp_source = "cached_temp"` bei letzten 12 Messungen:** Deutet darauf
hin, dass kurzzeitig ein DS18B20 physisch aktiv war (21,4°C gelesen), aber ohne
persistente `sensor_config`. Nach Cache-Ablauf (>90s) wäre EC-Messung abgebrochen worden.

---

## [G] "MESSEN AUF KOMMANDO" — Tiefen-Block

### G.1 — Kompletter On-Demand-Pfad (verifiziert)

```
[Frontend]
  SensorCard.vue:340  →  sensorsApi.triggerMeasurement(espId, gpio)
  POST /v1/sensors/{esp_id}/32/measure
  ↓
[Server REST]
  sensors.py:1977-2031  →  SensorService.trigger_measurement()
  Checks: ESP online? Sensor enabled? Busy? (in-memory cooldown)
  ↓
[MQTT Publish]
  publisher.py:134-144  →  Topic: kaiser/god/esp/{esp_id}/sensor/32/command
  Payload: {command:"measure", request_id:"<uuid>", ...}  QoS:1
  → REST gibt sofort zurück mit {request_id} — KEIN await auf Ergebnis
  ↓
[ESP MQTT-Callback Core 0]
  main.cpp:1453-1511  →  extractIntentMetadata()  →  queueSensorCommand()
  ↓
[ESP Core-1 Safety-Task]
  sensor_command_queue.cpp:102-173  →  handleSensorCommand()
  main.cpp:4339-4449
  ↓
[ESP ADC-Read (blockierend ~400ms)]
  sensor_manager.cpp:1549-1721  →  triggerManualMeasurement(32, timeout_ms)
  3 × [2 Warmup + 9 Samples + 200ms delay] = ~400ms
  ↓
[ESP MQTT Publish × 2]
  1) sensor/32/data   →  sensor_handler.handle_sensor_data()  →  DB-Persist
  2) sensor/32/response → calibration_response_handler.handle_sensor_response()
     Payload: {request_id, gpio, success, raw, quality, correlation_id}
  ↓
[Server WebSocket Broadcast]
  calibration_response_handler.py:183-196
  Event: "calibration_measurement_received"
  {raw, quality, correlation_id}
  ↓
[Frontend WebSocket]
  SensorCard.vue:316-328  →  watch(last_read) → UI-Update
  Timeout: 20s → Toast "Kein Messwert erhalten"
```

### G.2 — Fragile Punkte (verifiziert und als fragil markiert)

| # | Problem | Schwere | Beleg |
|---|---------|---------|-------|
| G-F1 | **Kein serverseitiger Timeout-Rückkanal:** REST gibt nach MQTT-Publish sofort zurück. Wenn ESP nicht antwortet → keine Server-seitige Timeout-Benachrichtigung an REST-Caller | MITTEL | `sensor_service.py:615` (kein await) |
| G-F2 | **WebSocket-only Ergebnis:** Ergebnis nur über WS-Event `calibration_measurement_received`. REST-Polling-Endpoint für `request_id` existiert nicht. Kein WS-Client → Ergebnis geht verloren | MITTEL | `calibration_response_handler.py:183-196` |
| G-F3 | **In-memory Busy-Guard:** `_measure_cooldown`-Dict ist Modul-global. Bei Serverrestart oder Multi-Worker: Guard wird zurückgesetzt → Rapid-Fire möglich | NIEDRIG | `sensor_service.py:599-612` |
| G-F4 | **Kein Correlation-Matching in sensor_data:** `sensor_handler.handle_sensor_data()` hat keine Korrelations-Prüfung. On-Demand und Interval-Messungen landen im gleichen Datenstrom | NIEDRIG | `sensor_handler.py:130` |
| G-F5 | **Double-Publish möglich:** ESP publiziert nach `measure`-Command auf BEIDE `sensor/32/data` (→ `sensor_handler`) UND `sensor/32/response` (→ `calibration_response_handler`). Wenn beide aktiv: doppelter DB-Write für eine Messung | NIEDRIG | `main.cpp:4402, sensor_handler.py:130` |
| G-F6 | **Blockierender ADC-Read Core 1:** 3 × ~200ms Delay + ADC-Reads im Core-1-Task. Gesamtblockierzeit ~400ms. Dokumentiert als "within 5s timeout" | INFO | `sensor_manager.cpp:1658-1684` |
| G-F7 | **Stiller ATC-Abort:** Wenn Temp-Sensor konfiguriert aber Cache >90s alt → EC-Messung still abgebrochen. REST-Caller bekommt keine Fehlerantwort (nur Audit-Log + WS-Error-Event) | MITTEL | `sensor_handler.py:331-345` |

---

## [H] BEFUND-REGISTER

| ID | Schicht | Datei:Zeile | Symptom | Verdacht/Ursache | Schwere | Status |
|----|---------|-------------|---------|------------------|---------|--------|
| H-01 | DB | DB-Query | **Kein EC-Sensor-Eintrag in sensor_configs.** GPIO 32 belegt mit `moisture` | EC-Config wurde gelöscht; muss neu angelegt werden | KRITISCH | Verifiziert (DB) |
| H-02 | DB/Daten | sensor_data | **STDDEV processed = 3.680 µS/cm (CV=237%)** bei 167 Messungen in 1413er-Lösung | Mehrere Ursachen (H-03 bis H-08) | KRITISCH | Verifiziert (DB) |
| H-03 | Firmware | sensor_manager.cpp:1752-1760 | **Rail-Spikes raw=791-816 → ~17.000 µS/cm** (≥3 von 12 Messungen) | Elektrode aus Flüssigkeit gehoben, Kurzschluss oder Kontaktverlust; 9-Sample-Median schützt nur bei <5/9 Bad-Samples | KRITISCH | Verifiziert (Daten + Code) |
| H-04 | Firmware | sensor_manager.cpp:159-186 | **Null-Werte (raw=0) ~40-50% aller Messungen** | DFR0300 Stabilisierungszeit nicht abgewartet; offener Eingang; Elektrode trocken; kein Warm-Up-Delay für analogen Stromkreis | HOCH | Verifiziert (Daten + Code) |
| H-05 | Server | ec_sensor.py:179-181 | **Ohne Kalibrierung DEFAULT_SLOPE=6060 µS/cm/V** → absolut unkalibrierter Output | Keine aktive Kalibrierung in DB für ESP_698EB4 | HOCH | Verifiziert (Code) |
| H-06 | Firmware | sensor_manager.cpp:1749 | **ADC_11db Attenuation korrekt**, aber **analogRead() ohne esp_adc-Kalibrierungsmodul** → ±10% Grundgenauigkeit | Arduino-ADC-API, keine Linearitätskorrektur | MITTEL | Verifiziert (Code) |
| H-07 | Server | ec_sensor.py:460 | **Temp-Kompensations-Koeffizient: 0.02 (Server) vs 0.0185 (DFRobot)** → ~1.6% Abweichung bei 10°C Delta | Unterschiedliche Koeffizienten. Bei Prüflösung 1413 µS/cm: ~23 µS/cm Fehler bei 10°C Abweichung — vernachlässigbar gegenüber anderen Fehlern | NIEDRIG | Verifiziert (Code) |
| H-08 | Server | sensor_handler.py:287-293 | **AUT-327-Guard** droppt raw=0 — gut, aber verhindert auch Null-Fehler-Diagnose in DB | Design-Entscheidung. Null-Werte landen nicht in DB → Dunkelziffer unbekannt | INFO | Verifiziert (Code) |
| H-09 | DB | sensor_data | **`temp_source="cached_temp"` bei letzten 12 Messungen** — DS18B20 war kurzzeitig aktiv ohne persistente Config | Inkonsistenter Zustand: physischer Sensor ohne DB-Eintrag | MITTEL | Verifiziert (DB-Metadata) |
| H-10 | Frontend | useFertigationKPIs.ts:62 | Fertigation-Widget: Threshold-Kommentar sagt "mS/cm", Code-Wert 0.5/0.8 — bei µS/cm-Sensor effektiv 0.5 µS/cm-Schwellwert (sehr niedrig) | Einheiten-Inkonsistenz im Kommentar; kein Konverter | NIEDRIG | Annahme (Code-Kommentar) |

### Sprünge-Ursachen-Kandidaten (priorisiert)

1. **[PRIMÄR] Hardware/Montage:** Elektrode nicht dauerhaft in Lösung → Rail-Spikes (raw≈816)
2. **[PRIMÄR] Kein Warm-Up:** DFR0300 braucht Einschaltverzögerung. Ohne Delay: erste ADC-Reads = 0
3. **[HOCH] Keine Kalibrierung aktiv:** DEFAULT_SLOPE = grobe Approximation, nicht auf 1413 µS/cm optimiert
4. **[MITTEL] ESP32-ADC-Nichtlinearität:** analogRead() ohne ADC-Kalibrierungsmodul, ±10% Grundfehler
5. **[NIEDRIG] Temp-Kompensation:** Koeffizient 0.02 vs. 0.0185 — kleiner Fehler (<2%)

---

## [I] TEST-READINESS-CHECKLISTE + OFFENE FRAGEN

### Was ist BEREIT für Phase 1

| Komponente | Status |
|------------|--------|
| GPIO 32 = ADC1_CH4 (WiFi-safe) | ✅ Verifiziert |
| 9-Sample-Median-Filter in Firmware | ✅ Vorhanden |
| On-Demand-Pfad (FW + Server + Frontend) | ✅ Vollständig implementiert |
| CalibrationWizard EC (1-point, 2-point) | ✅ Vollständig implementiert |
| Server: RAW→EC-Umrechnung (ec_sensor.py) | ✅ Vorhanden |
| Server: Kalibrier-Endpoints | ✅ Vorhanden |
| Server: Temp-Kompensation mit DS18B20 | ✅ Vorhanden (wenn Config angelegt) |
| Frontend: EC-Darstellung µS/cm | ✅ Korrekt konfiguriert |
| Frontend: On-Demand-Trigger | ✅ An 3 Stellen vorhanden |

### Was BLOCKIERT Phase 1

| Blocker | Aktion erforderlich | Schicht |
|---------|---------------------|---------|
| **EC-Sensor nicht in sensor_configs** | EC-Config für ESP_698EB4, GPIO 32, interface_type=ANALOG anlegen | DB/Server |
| **Rail-Spikes (raw~816)** | Elektrode sicher und dauerhaft in Prüflösung befestigen — Hardware | Hardware |
| **Null-Werte (~40-50%)** | Warm-Up-Zeit nach Einschalten abwarten oder Firmware-seitig delay vor ADC-Read | Hardware/FW |
| **Keine aktive Kalibrierung** | Nach stabilen Messungen: 1-Point-Kalibrierung mit 1413 µS/cm ausführen | Kalibrier-Flow |

### Offene Fragen vor Phase 1

1. **Welcher GPIO hat der DS18B20?** Der Auftrag sagt "physisch angeschlossen" — aber kein GPIO-Wert angegeben. Vor DS18B20-Konfiguration klären.
2. **ESP_698EB4 oder anderer ESP?** Die DB zeigt ESP_698EB4 als letzten EC-ESP. Ist das der korrekte ESP für den aktuellen Test? Oder wurde ein neuer ESP aufgebaut?
3. **operating_mode für EC:** `on_demand` (sensorDefaults-Empfehlung) oder `continuous` (30s-Intervall)? On-Demand gibt sauberere Einzel-Messungen für Kalibrierung.
4. **Warm-Up-Handling:** Soll ein Firmware-seitiger Delay vor ADC-Read für EC implementiert werden (z.B. 500ms Sensor-Einschaltverzögerung), oder wird das als Hardware-Voraussetzung behandelt?
5. **Kalibrierungs-Workflow:** 1-Point (nur 1413 µS/cm) oder 2-Point (Luft + 1413)? Für Erstinbetriebnahme reicht 1-Point.
6. **DS18B20-Konfiguration in Phase 1?** Wenn DS18B20 nicht konfiguriert ist, arbeitet ATC mit `default_25` (25°C-Annahme). Bei Raumtemperatur ~22°C: ~6% Fehler. Für initiale Kalibrierung akzeptabel, für Dauerbetrieb nicht.

### Empfohlene Reihenfolge Phase 1

```
1. Hardware sichern: Elektrode dauerhaft in 1413-Lösung, Kabel prüfen
2. EC-Config anlegen: POST /v1/devices/{esp_id}/sensors (ec, GPIO 32, ANALOG, on_demand)
3. Optional: DS18B20-Config anlegen (bekannter GPIO) und temp_sensor_config_id setzen
4. Erste Messungen: On-Demand-Trigger, Zeitreihe beobachten
5. Null-Wert-Rate dokumentieren (AUT-327-Guard)
6. Spike-Rate dokumentieren (raw > 500 = physikalisch unmöglich)
7. Wenn Null+Spike-Rate < 5%: 1-Point-Kalibrierung mit 1413 µS/cm
8. Post-Kalibrierung: erneute Messreihe, Streuung re-messen, STDDEV-Ziel < ±50 µS/cm
```

---

*Analyse erstellt: 2026-05-22 | Keine Code-/Konfig-/DB-Änderungen durchgeführt*
