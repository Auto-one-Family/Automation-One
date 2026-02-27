# Server Dev Report: Vollständige Analyse soil_moisture Integration

## Modus: A (Analyse)
## Auftrag: Vollständige Server-Codebase-Analyse für Bodenfeuchtesensor (soil_moisture) Integration

---

## Codebase-Analyse: Gelesene Dateien

| Datei | Zweck |
|-------|-------|
| `src/sensors/sensor_libraries/active/moisture.py` | Processing-Library Hauptdatei |
| `src/sensors/sensor_libraries/active/ph_sensor.py` | Referenz-Implementierung (analog) |
| `src/sensors/sensor_libraries/active/ec_sensor.py` | Referenz-Implementierung (analog) |
| `src/sensors/base_processor.py` | ABC für alle Sensor-Prozessoren |
| `src/sensors/sensor_type_registry.py` | Sensor-Type-Mapping und Registry |
| `src/sensors/library_loader.py` | Dynamischer Library-Loader |
| `src/mqtt/handlers/sensor_handler.py` | MQTT-Handler für Sensordaten |
| `src/db/models/sensor.py` | SensorConfig + SensorData Models |
| `src/api/v1/sensors.py` | REST-Endpoints (Create/List/Get) |
| `src/api/sensor_processing.py` | /process + /calibrate Endpoints |
| `src/services/gpio_validation_service.py` | GPIO-Validierung inkl. ADC-Pins |
| `src/schemas/sensor.py` | Pydantic-Schemas für Sensor-Config |
| `src/utils/sensor_formatters.py` | Display-Namen + Severity |
| `tests/unit/test_moisture_processor.py` | Unit-Tests für moisture.py |
| `tests/unit/test_ec_sensor_processor.py` | Referenz-Tests (EC) |
| `tests/unit/test_sensor_calibration.py` | Kalibrierungs-Tests (alle Typen) |

---

## B1: moisture.py Processing-Library

### VORHANDEN

**Pfad:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py`
**Umfang:** 430 Zeilen — vollständige Implementierung (KEIN Stub)

| Feature | Status | Details |
|---------|--------|---------|
| 2-Punkt-Kalibrierung | VORHANDEN | Zeilen 143-152: `dry_value/wet_value → Prozent` via `_adc_to_moisture_calibrated()` |
| Default-Mapping ohne Kalibrierung | VORHANDEN | Zeile 151: `DEFAULT_DRY_VALUE=3200, DEFAULT_WET_VALUE=1500` |
| Quality-Checks | VORHANDEN | Zeilen 380-429: `_assess_quality()` → "good"/"fair"/"poor"/"error" |
| ADC=0 Warnung | VORHANDEN | Zeile 207-208: Warning bei `raw_value < 100` (nicht Error) |
| ADC=4095 Warnung | VORHANDEN | Zeile 209-210: Warning bei `raw_value > 4000` |
| ADC out-of-range Error | VORHANDEN | Zeile 199-202: `validate()` → Error bei `< 0` oder `> 4095` |
| Division-by-Zero Schutz | VORHANDEN | Zeilen 341-349: Fallback 50% bei `dry_value == wet_value` |
| Invert-Logic | VORHANDEN | Zeilen 155-159: `params["invert"]` → `100 - moisture` |
| Decimal-Places param | VORHANDEN | Zeilen 165-168: konfigurierbar, Default=1 |
| `calibrate()` Methode | VORHANDEN | Zeilen 214-276: 2-Punkt-Kalibrierung, returned `{dry_value, wet_value, method, points}` |
| Voltage-Metadaten | VORHANDEN | Zeile 140: `_adc_to_voltage()` in Metadata |
| ADC1-Hinweis | VORHANDEN | Zeilen 21-22 + 73: ESP32 ADC1 (GPIO32-39) Warnung im Docstring |
| RECOMMENDED_MODE | VORHANDEN | Zeile 67: `"continuous"` (60s interval) |
| Substrat-Profile | FEHLT | Keine substrate_type-Unterstützung (bewusst weggelassen?) |
| Temperaturkompensation | FEHLT | moisture.py hat KEINE Temperaturkompensation (pH/EC haben es) |

### Vergleich mit anderen Libraries

**Identisches Pattern** in allen Sensor-Libraries:
- Erben von `BaseSensorProcessor` (ABC)
- Implementieren: `process()`, `validate()`, `get_sensor_type()`
- Optional: `calibrate()`, `get_default_params()`, `get_value_range()`, `get_raw_value_range()`
- `ProcessingResult` + `ValidationResult` DataClasses aus `base_processor.py`

**Unterschied moisture.py vs. ph_sensor.py/ec_sensor.py:**
- pH/EC: Kalibrierung produziert `{slope, offset}` → Volt-basierte Formel
- moisture: Kalibrierung produziert `{dry_value, wet_value}` → ADC-direkte Formel (kein Volt-Zwischenschritt bei der Berechnung)
- EC hat Temperaturkompensation, pH hat Temperaturkompensation — moisture hat KEINE

**Sensor-Type-String:**
- `moisture.py` → `get_sensor_type()` gibt `"moisture"` zurück (Zeile 88)
- NICHT `"soil_moisture"` — das ist ein Alias-Name der nicht registriert ist!

---

## B2: sensor_type_registry.py

### VORHANDEN

**Pfad:** `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`

| Aspekt | Status | Zeile | Details |
|--------|--------|-------|---------|
| `"moisture"` in SENSOR_TYPE_MAPPING | VORHANDEN | 64 | `"moisture": "moisture"` |
| `"soil_moisture"` als Alias | FEHLT | — | `"soil_moisture"` ist NICHT im SENSOR_TYPE_MAPPING registriert! |
| moisture in MULTI_VALUE_SENSORS | KORREKT NICHT DRIN | — | Single-Value-Sensor, gehört nicht rein |
| normalize_sensor_type() | VORHANDEN | 120-146 | Normalisierung via SENSOR_TYPE_MAPPING |

### Kritischer Befund

Der Sensor-Type `"soil_moisture"` existiert in `sensor_formatters.py` (Zeile 36, 64, 83) als bekannter Typ für Display-Namen und Severity — aber **NICHT in `SENSOR_TYPE_MAPPING`**. Das bedeutet:

- ESP32 sendet `sensor_type="soil_moisture"` → `normalize_sensor_type("soil_moisture")` gibt `"soil_moisture"` zurück (passthrough)
- `LibraryLoader.get_processor("soil_moisture")` findet KEINEN Prozessor (nur `"moisture"` ist registriert)
- Pi-Enhanced Processing für einen Sensor mit type `"soil_moisture"` würde **SCHEITERN**

**Handlungsbedarf:** Entweder in `sensor_type_registry.py` eintragen:
```python
"soil_moisture": "moisture",  # Alias für capacitive soil moisture
```
...oder ESP32 sendet direkt `"moisture"`.

---

## B3: API-Endpoints für Sensor-Erstellung

### VORHANDEN

**Pfad:** `El Servador/god_kaiser_server/src/api/v1/sensors.py`

| Aspekt | Status | Zeile | Details |
|--------|--------|-------|---------|
| POST `/{esp_id}/{gpio}` | VORHANDEN | 345-570 | Create/Update sensor config |
| `"moisture"` in SENSOR_TYPES Schema | VORHANDEN | `schemas/sensor.py:48` | Gültig im Validator |
| `"soil_moisture"` in SENSOR_TYPES | FEHLT | — | Nicht in der Whitelist |
| interface_type="ANALOG" | VORHANDEN | `schemas/sensor.py:135-139` | Pattern `^(I2C|ONEWIRE|ANALOG|DIGITAL)$` |
| interface_type auto-inferenz | VORHANDEN | `sensors.py:162` | `_infer_interface_type()` |
| calibration_data in Create | VORHANDEN | `schemas/sensor.py:161-164` | `Optional[Dict[str, Any]]` |
| GPIO-Validierung | VORHANDEN | `schemas/sensor.py:71-75` | `ge=0, le=39` |
| GpioValidationService | VORHANDEN | `gpio_validation_service.py` | Vollständige ADC1/ADC2-Prüfung |
| ADC2-WiFi-Konflikt-Warning | VORHANDEN | `gpio_validation_service.py:440-448` | Warning für GPIO 0,2,4,12-15,25-27 |
| GPIO 32 explizit erlaubt | KORREKT | `gpio_validation_service.py:120` | ADC1_SAFE_PINS = {32, 33, 34, 35, 36, 39} |

### Befund zur GPIO-Validierung für Moisture (GPIO 32)

GPIO 32 wird **korrekt durchgelassen**:
- Kein System-Reserviert-Pin (SYSTEM_RESERVED_PINS_WROOM enthält 32 nicht)
- Kein input-only Pin (INPUT_ONLY_PINS = {34, 35, 36, 39})
- Liegt in ADC1_SAFE_PINS → Keine ADC2-Warnung
- Maximum GPIO für ESP32 WROOM = 39 → 32 ist valid

### Befund zur sensor_type Validierung

In `schemas/sensor.py` Zeilen 88-96: Der `validate_sensor_type`-Validator normalisiert auf lowercase, prüft gegen `SENSOR_TYPES` — aber löst bei unbekannten Types **keinen Fehler** aus (nur `pass`). Das bedeutet: `"soil_moisture"` würde im Schema durchkommen, aber im LibraryLoader keinen Prozessor finden.

---

## B4: calibration_data Struktur

### VORHANDEN

**Pfad:** `src/db/models/sensor.py` Zeile 144-148

```python
calibration_data: Mapped[Optional[dict]] = mapped_column(
    JSON,
    nullable=True,
    doc="Calibration parameters (offset, scale, etc.)",
)
```

| Aspekt | Status | Details |
|--------|--------|---------|
| calibration_data Feld im Model | VORHANDEN | JSON/JSONB, nullable, beliebige Struktur |
| Für moisture erwartete Struktur | DEFINIERT | `{"dry_value": int, "wet_value": int}` (aus moisture.py Zeilen 143-146) |
| substrate_type in Kalibrierung | FEHLT | moisture.py unterstützt kein substrate_type |
| Kalibrierungs-Endpoint /calibrate | VORHANDEN | `src/api/sensor_processing.py` Zeilen 232-390 |
| Kalibrierungs-Workflow | VORHANDEN | POST /api/v1/sensors/calibrate → berechnet + optional save_to_config |
| calibration_data in Processing-Pipeline gelesen | VORHANDEN | `sensor_handler.py:769` → `sensor_config.calibration_data` |

**Kalibrierungsstruktur für moisture:**
```json
{
    "dry_value": 3200,
    "wet_value": 1500,
    "method": "linear",
    "points": 2
}
```

**Kalibrierungsstruktur für pH (zum Vergleich):**
```json
{
    "slope": -3.5,
    "offset": 21.34,
    "method": "linear",
    "points": 2
}
```

---

## B5: MQTT-Handler für Sensor-Daten

### VORHANDEN

**Pfad:** `src/mqtt/handlers/sensor_handler.py`

| Aspekt | Status | Zeile | Details |
|--------|--------|-------|---------|
| Eingehende Sensor-Daten verarbeiten | VORHANDEN | 103-439 | `handle_sensor_data()` |
| sensor_type Routing | VORHANDEN | 731-740 | `normalize_sensor_type()` + `loader.get_processor()` |
| `"moisture"` → `moisture.py` | VORHANDEN | — | Via LibraryLoader + SENSOR_TYPE_MAPPING |
| `"soil_moisture"` → kein Prozessor | PROBLEM | — | Kein Eintrag in SENSOR_TYPE_MAPPING |
| raw_mode Unterstützung | VORHANDEN | 229: `raw_mode = payload.get("raw_mode", True)` | |
| ADC-Rohwert Verarbeitung | VORHANDEN | 238-280 | Pi-Enhanced wenn `sensor_config.pi_enhanced and raw_mode` |
| calibration_data in Processing | VORHANDEN | 768-769 | `calibration=sensor_config.calibration_data if sensor_config else None` |
| physikalische Limits für moisture | VORHANDEN | 84: `"moisture": {"min": 0.0, "max": 100.0}` | Implausible-Check |
| DB-Speicherung | VORHANDEN | 321-335 | `sensor_repo.save_data()` mit raw + processed |
| WebSocket-Broadcast | VORHANDEN | 349-382 | Format via `format_sensor_message()` |
| Logic-Engine Trigger | VORHANDEN | 384-422 | Non-blocking asyncio.create_task |

### Payload-Format für moisture (was ESP32 senden muss):
```json
{
    "ts": 1735818000,
    "esp_id": "ESP_12AB34CD",
    "gpio": 32,
    "sensor_type": "moisture",
    "raw": 2350,
    "raw_mode": true,
    "value": 0.0,
    "unit": "",
    "quality": "unknown"
}
```

---

## B6: Database Models

### VORHANDEN (vollständig)

**Pfad:** `src/db/models/sensor.py`

| Feld | Relevanz für moisture | Status | Zeile |
|------|----------------------|--------|-------|
| `interface_type` | "ANALOG" für capacitive | VORHANDEN | 94-99 |
| `gpio` | 32 (ADC1-Pin) | VORHANDEN | 69-73, nullable |
| `calibration_data` | `{dry_value, wet_value}` | VORHANDEN | 144-148 |
| `pi_enhanced` | True → Server verarbeitet | VORHANDEN | 128-133 |
| `sensor_type` | "moisture" | VORHANDEN | 76-81 |
| `sensor_name` | z.B. "Bodenfeuchte Zone 1" | VORHANDEN | 83-87 |
| SensorData.raw_value | ADC-Rohwert (0-4095) | VORHANDEN | 309-312 |
| SensorData.processed_value | % (0-100) | VORHANDEN | 315-318 |
| SensorData.unit | "%" | VORHANDEN | 321-324 |

**UNIQUE Constraint:** `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` — Zeile 237-246

Für moisture ohne I2C/OneWire: `onewire_address=NULL, i2c_address=NULL` → korrekt eindeutig per `(esp_id, gpio, "moisture")`.

---

## B7: pH/EC als Referenz (analog)

### Vorhanden und vollständig einsatzfähig

**ph_sensor.py:** 325 Zeilen — VOLLSTÄNDIG
- 2-Punkt-Kalibrierung: `{slope, offset}` (Volt-basiert)
- Temperaturkompensation: `_apply_temperature_compensation()` (0.003 pH/°C)
- Quality-Assessment: calibrated + range-based
- SUPPORTS_ON_DEMAND = True (Unterschied zu moisture!)

**ec_sensor.py:** 541 Zeilen — VOLLSTÄNDIG
- 2-Punkt-Kalibrierung: `{slope, offset, adc_type}` (12bit/16bit)
- Temperaturkompensation: `_apply_temperature_compensation()` (2% per °C)
- Unit-Konversion: µS/cm, mS/cm, ppm
- 16-bit ADC Unterstützung (ADS1115)

**Kann moisture.py als 1:1 Vorlage dienen?**
- Struktur: JA — identisches Pattern
- Kalibrierung: NEIN — pH/EC nutzen `{slope, offset}`, moisture nutzt `{dry_value, wet_value}`
- Gemeinsamkeiten: validate(), process(), get_sensor_type(), quality-logic, metadata-format
- Sensor-spezifisch: Kalibrierungsformel, physikalische Konstanten, Quality-Thresholds

**Fazit:** moisture.py ist bereits vollständig implementiert und folgt exakt dem pH/EC-Pattern. Es ist KEINE Referenz-Implementierung mehr notwendig.

---

## B8: Tests

### VORHANDEN

**Unit-Test für moisture:**
`tests/unit/test_moisture_processor.py` — **254 Zeilen, 26 Test-Cases**

| Test-Kategorie | Anzahl | Status |
|----------------|--------|--------|
| Basis-Processing | 3 | VORHANDEN |
| Kalibrierung | 5 | VORHANDEN |
| Invert-Logic | 2 | VORHANDEN |
| Validierung | 5 | VORHANDEN |
| Quality-Assessment | 5 | VORHANDEN |
| Metadaten | 2 | VORHANDEN |
| Edge-Cases | 4 | VORHANDEN |

**Test in test_sensor_calibration.py:**
`test_moisture_calibration_dry_wet()` + `test_moisture_calibration_affects_processing()` — VORHANDEN

**Kein Integration-Test für moisture-spezifischen MQTT-Flow** vorhanden — nur der generische sensor_handler-Flow.

---

## Zusammenfassung: Was VORHANDEN ist

| Komponente | Status | Vollständigkeit |
|------------|--------|-----------------|
| `moisture.py` Processing-Library | VORHANDEN | Vollständig (430 Zeilen) |
| `"moisture"` in sensor_type_registry | VORHANDEN | Zeile 64 |
| `"moisture"` in SENSOR_TYPES Schema | VORHANDEN | schemas/sensor.py:48 |
| MQTT-Handler Routing zu moisture.py | VORHANDEN | Via LibraryLoader |
| calibration_data Feld (DB) | VORHANDEN | JSON, nullable |
| /calibrate Endpoint | VORHANDEN | sensor_processing.py:232 |
| GPIO-Validierung (ADC1 aware) | VORHANDEN | gpio_validation_service.py |
| Physical Limits moisture in Handler | VORHANDEN | sensor_handler.py:84 |
| Unit-Tests moisture | VORHANDEN | 26 Tests |
| sensor_formatters.py soil_moisture | VORHANDEN | Display-Namen |

---

## Zusammenfassung: Was FEHLT

| Lücke | Schwere | Datei | Zeile | Details |
|-------|---------|-------|-------|---------|
| `"soil_moisture"` Alias fehlt in Registry | KRITISCH | `sensor_type_registry.py` | 43-75 | ESP32 kann `"soil_moisture"` senden, Prozessor wird nicht gefunden |
| `"soil_moisture"` in SENSOR_TYPES | MINOR | `schemas/sensor.py` | 43-55 | Validator würde `"soil_moisture"` akzeptieren aber warnen |
| Substrat-Profile | LOW | `moisture.py` | — | Keine substrate_type-Differenzierung (Sand vs. Lehm vs. Ton) |
| Temperaturkompensation | LOW | `moisture.py` | — | Fehlt komplett (pH/EC haben es, moisture nicht) |
| Integration-Test moisture MQTT-Flow | LOW | `tests/integration/` | — | Kein dedizierter Test für moisture End-to-End |
| `"soil_moisture"` Severity in formatters | INFORMELL | `sensor_formatters.py` | 287-291 | `"soil_moisture"` in default_thresholds, aber `"moisture"` fehlt dort |

---

## Detail-Analyse: Kritischer Befund — soil_moisture Alias

**Problem:**
`sensor_formatters.py` kennt `"soil_moisture"` (Zeilen 36, 64, 83), aber `sensor_type_registry.py` hat **KEINEN Eintrag** für diesen Typ.

**Konsequenz:**
```
ESP32 sendet: sensor_type="soil_moisture"
normalize_sensor_type("soil_moisture") → "soil_moisture" (passthrough, nicht gefunden)
LibraryLoader.get_processor("soil_moisture") → None
Pi-Enhanced Processing → schlägt fehl
quality = "error" (sensor_handler.py:273)
```

**Lösung (1 Zeile in sensor_type_registry.py):**
```python
# Moisture sensor (Phase 2)
"moisture": "moisture",           # Zeile 64 — VORHANDEN
"soil_moisture": "moisture",      # FEHLT — muss hinzugefügt werden
"capacitive_soil": "moisture",    # FEHLT — weiterer möglicher Alias
```

---

## Detail-Analyse: sensor_formatters.py Inkonsistenz

`determine_sensor_severity()` hat Default-Thresholds für `"capacitive_soil"` (Zeilen 287-291):
```python
"capacitive_soil": {
    "critical_low": 10,
    "warning_low": 30,
},
```

Aber **NICHT für** `"moisture"`. Das bedeutet: Bei `sensor_type="moisture"` gibt es keine Severity-Differenzierung — immer "info". Sollte ergänzt werden.

---

## Cross-Layer Impact

| Layer | Was betroffen | Prüfung nötig |
|-------|--------------|----------------|
| ESP32 | sensor_type im Payload | Muss `"moisture"` (nicht `"soil_moisture"`) senden |
| Server Registry | soil_moisture Alias fehlt | sensor_type_registry.py:63-75 |
| Server Formatters | moisture Severity fehlt | sensor_formatters.py:287 |
| Frontend | sensor_type bekannt? | Prüfen ob TypeScript-Types `"moisture"` kennen |

---

## Verifikation

Keine Code-Änderungen — reine Analyse. Kein pytest-Lauf durchgeführt.

---

## Empfehlung: Nächste Schritte

### Sofort (Kritisch)
1. `sensor_type_registry.py` Zeile 64: `"soil_moisture": "moisture"` hinzufügen
2. Testen ob ESP32 `"moisture"` oder `"soil_moisture"` sendet (MQTT Protokoll prüfen)

### Optional (Low Priority)
3. `sensor_formatters.py`: `"moisture"` zu `default_thresholds` hinzufügen (warning_low: 30, critical_low: 10)
4. Integration-Test für moisture MQTT-Flow hinzufügen
5. Substrat-Profile und Temperaturkompensation in moisture.py (für Präzisionsanwendungen)

### Nächster Agent
- Falls ESP32-Payload-Anpassung nötig: `esp32-dev`
- Falls Frontend-Types fehlen: `frontend-dev`
- Für Implementierung: `server-dev` (Implementierung der 2 kritischen Fixes)
