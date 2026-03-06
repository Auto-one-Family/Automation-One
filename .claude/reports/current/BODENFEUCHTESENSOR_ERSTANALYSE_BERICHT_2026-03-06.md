# Bodenfeuchtesensor — Erstanalyse Bericht

**Datum:** 2026-03-06  
**Repo:** auto-one (Commit `9f8bf83`)  
**Ausgeführt von:** Agent (Code-Zugriff)  
**Hardware-Referenz:** DFRobot SEN0193 V1.0 (kapazitiv, 0–3V analog, 3.3V)

---

## Executive Summary

- **Gesamtstatus:** ~95% vorhanden — Bodenfeuchtesensor ist in allen drei Schichten integriert.
- **Blocker:** Keine kritischen Blocker.
- **Kleinere Lücken:** CalibrationWizard `soil_moisture` → Preset-Mapping; SENSOR_PHYSICAL_LIMITS `soil_moisture` fehlt (nur `moisture`).
- **Geschätzter Implementierungsaufwand:** 1–2h für verbleibende Feinschliffe.

---

## Schritt 0: Pfad-Discovery (Ergebnis)

| Komponente | Gefundener Pfad |
|------------|-----------------|
| sensor_registry | `El Trabajante/src/models/sensor_registry.cpp`, `.h` |
| moisture.py | `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py` |
| sensor_type_registry.py | `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` |
| sensorDefaults.ts | `El Frontend/src/utils/sensorDefaults.ts` |
| AddSensorModal | `El Frontend/src/components/esp/AddSensorModal.vue` |
| SensorConfigPanel | `El Frontend/src/components/esp/SensorConfigPanel.vue` |
| useCalibration.ts | `El Frontend/src/composables/useCalibration.ts` |
| CalibrationWizard | `El Frontend/src/components/calibration/CalibrationWizard.vue` |
| platformio.ini | `El Trabajante/platformio.ini` |

---

## Teil A: Firmware (El Trabajante) — IST

### A1: Sensor-Registry — MOISTURE_CAP und SENSOR_TYPE_MAP

| Prüfpunkt | Erwartung | Ergebnis (IST) |
|-----------|-----------|----------------|
| MOISTURE_CAP existiert | static const SensorCapability | ✅ Zeile 125–130 |
| server_sensor_type | "moisture" | ✅ |
| is_i2c | false | ✅ |
| is_multi_value | false | ✅ |
| {"moisture", &MOISTURE_CAP} in Map | Vorhanden | ✅ Zeile 179 |
| {"soil_moisture", &MOISTURE_CAP} Alias | Vorhanden | ✅ Zeile 180 |

### A2: Analog-Leselogik — readRawAnalog, ADC-Attenuation

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| readRawAnalog() Methode | Vorhanden | ✅ `sensor_manager.cpp:1281` |
| analogSetPinAttenuation / ADC_11db | Explizit gesetzt | ✅ Zeile 1297: `analogSetPinAttenuation(gpio, ADC_11db)` |
| Arduino-ESP32 Version | platform = espressif32 | ✅ platformio.ini |
| ADC-Default | 11dB = 100–3100mV | ✅ DFRobot SEN0193 0–3V passt |

**Hinweis:** ADC2/WiFi-Konflikt wird geprüft (`isADC2Pin`); ADC1-Pins (32–39) werden empfohlen.

### A3: MQTT-Payload — sensor_type, raw_mode

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| Topic | esp32/{esp_id}/sensor/data (äquivalent) | ✅ kaiser/god/esp/{esp_id}/sensor/{gpio}/data |
| Payload enthält sensor_type | "moisture" oder "soil_moisture" | ✅ getServerSensorType() normalisiert |
| raw_mode: true bei Analog | Server verarbeitet Rohwert | ✅ Zeile 1462: `payload += (reading.raw_mode ? "true" : "false")` |
| unit: "raw" bei unbekanntem Typ | ADC 0–4095 | ✅ applyLocalConversion: moisture → "raw" (kein lokales Mapping) |

**Hinweis:** `applyLocalConversion()` hat keinen moisture-Fall; Firmware sendet raw, Server verarbeitet.

### A4: GPIO — ADC1-Safe-Pins

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| SAFE_GPIO_PINS | 32, 33, 34, 35, 36, 39 enthalten | ✅ esp32_dev.h:46–48 |
| ADC2-Blacklist | Dokumentiert | ✅ ADC2_GPIO_PINS: 0,2,4,12,13,14,15,25,26,27 |
| moisture-Pins nicht blockiert | — | ✅ 32–39 in SAFE_GPIO_PINS |

---

## Teil B: Backend (El Servador) — IST

### B1: moisture.py — Processing-Library

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| Datei existiert | Ja | ✅ 324 Zeilen |
| Klasse MoistureSensorProcessor | Erbt BaseSensorProcessor | ✅ |
| sensor_type() | "moisture" | ✅ |
| 2-Punkt-Kalibrierung | dry_value, wet_value → % | ✅ |
| calibrate() Methode | Vorhanden | ✅ |
| Quality-Checks | ADC 0/4095 → error, Bereiche good/fair/poor | ✅ |
| Default dry/wet | Trocken ~3200, Nass ~1500 | ✅ DEFAULT_DRY_VALUE=3200, DEFAULT_WET_VALUE=1500 |

### B2: sensor_type_registry.py — Alias soil_moisture

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| "moisture": "moisture" | Vorhanden | ✅ Zeile 65 |
| "soil_moisture": "moisture" | Alias | ✅ Zeile 66 |

### B3: MQTT-Handler — moisture/soil_moisture Routing

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| sensor_handler kennt moisture | Plausibilitätsgrenzen 0–100 | ✅ SENSOR_PHYSICAL_LIMITS["moisture"] |
| calibration_data wird gelesen | dry_value, wet_value | ✅ Zeile 958: `calibration=sensor_config.calibration_data` |
| raw_mode Verarbeitung | raw_mode=true bei Analog | ✅ processing_params["raw_mode"] |

**Hinweis:** SENSOR_PHYSICAL_LIMITS enthält `"moisture"` (0–100), nicht `"soil_moisture"`. Bei `soil_moisture`-Payload ist limits=None → Check wird übersprungen (kein Fehler).

### B4: API — Sensor-Create, Calibration

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| moisture in SENSOR_TYPES / Schema | Erlaubter sensor_type | ✅ schema_registry.py, schemas/sensor.py |
| calibration_data JSON-Struktur | { dry_value, wet_value, invert? } | ✅ moisture.py erwartet genau das |
| createOrUpdate speichert calibration_data | Bei moisture/soil_moisture | ✅ sensor_repo.update_calibration() |
| POST /calibrate | Unterstützt moisture | ✅ processor.calibrate() → calibration_result |

### B5: Tests

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| test_moisture_processor.py | Vorhanden | ✅ tests/unit/test_moisture_processor.py |
| test_moisture_mqtt_flow.py | MQTT soil_moisture | ✅ test_soil_moisture_alias_normalizes_to_moisture |
| Integration-Tests | Mehrere Szenarien | ✅ test_library_e2e_integration, test_greenhouse_scenarios |

---

## Teil C: Frontend (El Frontend) — IST

### C1: sensorDefaults.ts — SENSOR_TYPE_CONFIG

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| 'moisture' Key | label: "Bodenfeuchte", unit: "%", min: 0, max: 100, category: soil | ✅ |
| 'soil_moisture' Key | Eigenständig (Phase B: beide Keys) | ✅ Identische Config wie moisture |
| inferInterfaceType('moisture') | → 'ANALOG' | ✅ Default-Fall (nicht I2C/OneWire) |
| defaultIntervalSeconds / getDefaultInterval | 60 | ✅ moisture + soil_moisture: 60 |
| recommendedGpios | [32, 33, 34, 35, 36, 39] | ✅ ADC1-Pins |

### C2: AddSensorModal — Analog-Flow für moisture

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| moisture in Typ-Auswahl | Über getSensorTypeOptions | ✅ SENSOR_TYPE_CONFIG enthält beide |
| inferInterfaceType('moisture') | → 'ANALOG' | ✅ |
| GpioPicker bei ANALOG | ADC1-Pins | ✅ getRecommendedGpios('moisture') → [32,33,34,35,36,39] |
| dry_value/wet_value beim Erstellen | Optional (Config-Panel) | ✅ Nachträglich über SensorConfigPanel |

### C3: SensorConfigPanel — needsCalibration, Dry/Wet

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| needsCalibration | Enthält 'moisture' und 'soil_moisture' | ✅ Zeile 125 |
| Dry/Wet-Felder | Sichtbar für moisture/soil_moisture | ✅ Zeile 651: calibrationType === 'moisture' |
| calibration_data Speicherung | createOrUpdate, API | ✅ handleSave |
| invert-Option | Optional | ✅ useCalibration: invert in getCalibrationData |
| Preset dry ~3200, wet ~1500 | — | ✅ useCalibration: dryValue=3200, wetValue=1500 |

### C4: CalibrationWizard — moisture-Preset

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| moisture-Preset | 2-Punkt (0%/100%), dry_value, wet_value | ✅ sensorTypePresets.moisture |
| soil_moisture-Preset | Gleicher Inhalt wie moisture | ⚠️ **Lücke:** sensorTypePresets hat nur `moisture`, nicht `soil_moisture` |
| suggestedReference | 0, 100 für Trocken/Nass | ✅ point1Ref: 0, point2Ref: 100 |

**Hinweis:** Wenn User einen `soil_moisture`-Sensor im CalibrationWizard auswählt, ist `currentPreset = sensorTypePresets['soil_moisture']` → `undefined`. Label/Referenz würden fehlen. Fix: `soil_moisture` in Presets oder Fallback `sensorTypePresets[type] ?? sensorTypePresets['moisture']`.

### C5: useCalibration.ts — moisture-Unterstützung

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| Type-Union | 'pH' \| 'EC' \| 'moisture' \| null | ✅ |
| getCalibrationData() | moisture-Case mit dry_value, wet_value | ✅ Zeile 111–118 |
| Return-Shape moisture | { dry_value, wet_value, type, invert } | ✅ |

### C6: Weitere Stellen — soil_moisture vs moisture

| Datei | Verwendung |
|-------|------------|
| sensorDefaults.ts | moisture + soil_moisture (beide Keys) |
| SensorConfigPanel.vue | needsCalibration: beide; calibrationType: beide → 'moisture' |
| useCalibration.ts | Nur 'moisture' (soil_moisture wird in Panel zu 'moisture' gemappt) |
| CalibrationWizard.vue | Nur moisture-Preset |
| ComponentSidebar.vue | 'moisture' |
| ComponentCard.vue | soil_moisture: Droplets |
| rule-templates.ts | sensor_type: 'soil_moisture' |
| RuleNodePalette.vue | defaults: sensorType: 'moisture' |
| RuleConfigPanel.vue | value: 'moisture' |
| eventTransformer.ts | 'soil_moisture': 'Bodenfeuchte' |
| gpioConfig.ts | Beide: [32,33,34,35,36,39] |
| databaseColumnTranslator.ts | moisture: 'Bodenfeuchtigkeit' |

**Fazit:** Konsistente Verwendung; beide Keys werden unterstützt, moisture ist kanonisch.

---

## Teil D: Cross-Cutting — IST

### D1: Naming-Konsistenz (alle Schichten)

| Schicht | Registrierter Key | Alias soil_moisture | Status |
|---------|-------------------|---------------------|--------|
| Firmware | moisture | ✅ soil_moisture → MOISTURE_CAP | OK |
| Backend | moisture | ✅ soil_moisture → moisture | OK |
| Frontend | moisture | ✅ soil_moisture (eigener Key, gleiche Config) | OK |

### D2: Kalibrierungs-Datenfluss

| Schritt | Ort | Erwartung | Ergebnis |
|---------|-----|-----------|----------|
| 1 | SensorConfigPanel / CalibrationWizard | dry_value, wet_value erfasst | ✅ |
| 2 | sensorsApi.createOrUpdate / calibrationApi.calibrate | calibration_data an API | ✅ |
| 3 | sensor_configs.calibration_data | JSON { dry_value, wet_value, invert? } | ✅ |
| 4 | MQTT-Handler / sensor_handler | calibration_data aus DB geladen | ✅ |
| 5 | moisture.py calibrate() | Umrechnung raw → % | ✅ |

**Roundtrip:** Vollständig.

### D3: DB-Schema

| Prüfpunkt | Erwartung | Ergebnis |
|-----------|-----------|----------|
| calibration_data Spalte | JSON, nullable | ✅ sensor.py:144 |
| Struktur | { dry_value, wet_value, invert? } | ✅ moisture.py kompatibel |

---

## Priorisierte Fix-Liste

| # | Blocker/Lücke | Schicht | Aufwand |
|---|---------------|---------|---------|
| 1 | CalibrationWizard: soil_moisture → Preset-Mapping (currentPreset undefined) | Frontend | 0.5h |
| 2 | SENSOR_PHYSICAL_LIMITS: soil_moisture hinzufügen (optional, für Konsistenz) | Backend | 0.25h |
| 3 | getSensorTypeOptions: Reduktion auf einen Eintrag "Bodenfeuchte" (moisture vs soil_moisture) | Frontend | Optional |

---

## Akzeptanzkriterien für Implementierungs-Auftrag

- [x] Naming-Konsistenz: moisture als kanonischer Key, soil_moisture als Alias (alle Schichten)
- [x] Kalibrierungs-Roundtrip: Frontend → API → DB → MQTT-Handler → moisture.py
- [x] inferInterfaceType('moisture') → 'ANALOG'; GpioPicker ADC1-Pins
- [x] needsCalibration enthält moisture + soil_moisture
- [x] ADC: 11dB Attenuation explizit gesetzt (sensor_manager.cpp:1297)

---

## Referenzen

- `wissen/iot-automation/kapazitiver-bodenfeuchtesensor-esp32-integration.md` — Technische Referenz
- `.claude/reports/current/PHASE_B_SENSORTYPEN_IST_ANALYSE_BERICHT.md` — Sensortypen-Inventar
- `.claude/reports/current/PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md` — Kalibrierung pro Typ
