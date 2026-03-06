# Phase B — Sensortypen IST-Analyse (Code-Inventar)

**Ziel-Repo:** auto-one (El Frontend + El Servador + El Trabajante)  
**Erstellt:** 2026-03-06  
**Reihe:** Roadmap Alert-Kalibrierung-Sensortypen, Phase B  
**Priorität:** HOCH  
**Typ:** Analyse (kein Code, nur Inventar + Bericht)

---

## 1. Executive Summary

Diese IST-Analyse dokumentiert das vollständige Inventar aller Sensortypen, Aktortypen, Konfigurationen und typ-spezifischen Felder im auto-one Repo. Der Bericht dient als Referenz für Phase C (Darstellungs-Optimierung) und Phase D (Kalibrierung pro Sensortyp).

**Ergebnisse im Überblick:**

- **Frontend SENSOR_TYPE_CONFIG:** 28 Keys (inkl. Duplikate DS18B20/ds18b20, pH/EC, SHT31/SHT31_humidity etc.)
- **MULTI_VALUE_DEVICES:** 3 Geräte (sht31, bmp280, bme280) — **Phase C (2026-03-06):** getSensorTypeOptions dedupliziert, alle 3 im Add-Sensor-Dropdown
- **Backend sensor_type_registry:** 25+ Mappings; SENSOR_TYPE_MAPPING + MULTI_VALUE_SENSORS (sht31, bmp280) — BME280 fehlt in MULTI_VALUE_SENSORS
- **Firmware SENSOR_TYPE_MAP:** 22 Einträge; unterstützt sht31, bmp280, bme280, ds18b20, ph, ec, moisture
- **Kalibrierung:** ph, ec, moisture — 2-Punkt-Kalibrierung (pH/EC), Dry/Wet-Preset (moisture)

**Kritische Lücken:**

1. **BME280:** Frontend MULTI_VALUE_DEVICES hat bme280, Backend MULTI_VALUE_SENSORS nicht. **Phase C behoben:** bme280 im Add-Sensor-Dropdown
2. **getSensorTypeOptions:** **Phase C behoben:** Dedupliziert; Device-Liste; Value-Types ausgeblendet
3. **Backend SENSOR_TYPES (schema):** ph, temperature, humidity, ec, moisture, pressure, co2, light, flow, analog, digital — keine granularen Typen (sht31_temp, bmp280_pressure etc.)
4. **Backend actuator_type:** constants.ACTUATOR_TYPES = digital, pwm, servo, pump, valve, relay — Frontend actuatorDefaults hat pump, valve, relay, pwm (kein servo, kein fan)

---

## 2. Block A: SENSOR_TYPE_CONFIG & sensorDefaults.ts

### A1: SENSOR_TYPE_CONFIG Inventar

**Definition:** `El Frontend/src/utils/sensorDefaults.ts` Zeile 89–318

| Key | unit | min | max | decimals | category | Verwendet in |
|-----|------|-----|-----|----------|----------|--------------|
| DS18B20 | °C | -55 | 125 | 1 | temperature | LiveLineChart, SensorConfigPanel, AddSensorModal, … |
| ds18b20 | °C | -55 | 125 | 1 | temperature | (Duplikat) |
| pH | pH | 0 | 14 | 2 | water | MultiSensorChart, WidgetConfigPanel, … |
| EC | µS/cm | 0 | 5000 | 0 | water | |
| SHT31 | °C | -40 | 125 | 1 | temperature | |
| sht31 | °C | -40 | 125 | 1 | temperature | |
| sht31_temp | °C | -40 | 125 | 1 | temperature | |
| sht31_humidity | %RH | 0 | 100 | 1 | air | |
| SHT31_humidity | %RH | 0 | 100 | 1 | air | |
| BME280 | °C | -40 | 85 | 1 | temperature | |
| BME280_humidity | %RH | 0 | 100 | 1 | air | |
| BME280_pressure | hPa | 300 | 1100 | 1 | air | |
| analog | raw | 0 | 4095 | 0 | other | |
| digital | — | 0 | 1 | 0 | other | |
| flow | L/min | 0 | 100 | 2 | water | |
| level | % | 0 | 100 | 1 | water | |
| light | lux | 0 | 100000 | 0 | light | |
| co2 | ppm | 400 | 5000 | 0 | air | |
| moisture | % | 0 | 100 | 0 | soil | |
| soil_moisture | % | 0 | 100 | 0 | soil | |

**Bemerkung:** `suggestedMin`/`suggestedMax` existieren nicht in der Config — `min`/`max` werden verwendet.

**Verwendungsorte:**
- `MultiSensorChart.vue`, `SensorConfigPanel.vue`, `WidgetConfigPanel.vue`, `SensorCard.vue`, `ComponentSidebar.vue`, `dashboard.store.ts`, `SensorSatellite.vue`, `SensorValueCard.vue`, `EditSensorModal.vue`, `AddSensorModal.vue`, `LiveLineChart.vue`, `MonitorView.vue`

**Lücken:** Keys im Backend aber nicht im Frontend: `bmp280_temp`, `bmp280_pressure`, `bme280_temp`, `bme280_humidity`, `bme280_pressure` (Frontend hat BME280_*, aber keine bmp280_* in SENSOR_TYPE_CONFIG)

### A2: sensorDefaults.ts Vollständiger Inhalt

**Pfad:** `El Frontend/src/utils/sensorDefaults.ts`

**Exporte:**
- `SENSOR_TYPE_CONFIG` — Record<string, SensorTypeConfig>
- `SENSOR_CATEGORIES` — Record<SensorCategoryId, SensorCategory>
- `getSensorUnit(sensorType)`
- `getSensorDefault(sensorType)`
- `getSensorConfig(sensorType)`
- `getSensorLabel(sensorType)`
- `isValidSensorValue(sensorType, value)`
- `getSensorTypeOptions()` — Array<{value, label}>
- `formatSensorValueWithUnit(value, sensorType)`
- `getDefaultInterval(sensorType)`
- `getSensorTypeAwareSummary(sensorType)`
- `MULTI_VALUE_DEVICES` — Record<string, MultiValueDeviceConfig>
- `isMultiValueSensorType(sensorType)`
- `getDeviceTypeFromSensorType(sensorType)`
- `getSensorTypesForDevice(deviceType)`
- `getMultiValueDeviceConfig(deviceType)`
- `getMultiValueDeviceConfigBySensorType(sensorType)`
- `getValueConfigForSensorType(sensorType)`
- `inferInterfaceType(sensorType)`
- `getDefaultI2CAddress(sensorType)`
- `getI2CAddressOptions(sensorType)`
- `groupSensorsByBaseType(sensors)`
- `aggregateZoneSensors(devices)`
- `formatAggregatedValue(agg, deviceCount)`

**getSensorTypeOptions():**
- **Phase C (2026-03-06) umgesetzt:** Liefert DEVICE-Liste — ein Eintrag pro Multi-Value-Device (sht31, bmp280, bme280) + Single-Value-Sensoren; Value-Types und Duplikate ausgeblendet; AddSensorModal defaultSensorType: ds18b20
- Verwendet in: `AddSensorModal.vue` Zeile 59

**MULTI_VALUE_DEVICES:**

| Key | sensorTypes | interface | i2cAddress |
|-----|-------------|-----------|------------|
| sht31 | ['sht31_temp','sht31_humidity'] | i2c | 0x44 |
| bmp280 | ['bmp280_pressure','bmp280_temp'] | i2c | 0x76 |
| bme280 | ['bme280_pressure','bme280_temp','bme280_humidity','BME280'] | i2c | 0x76 |

**Lücken (Phase C behoben):**
- Add-Flow nutzt MULTI_VALUE_DEVICES für Toast-Meldung nach Add (Zeile 230 AddSensorModal). **Phase C:** getSensorTypeOptions liefert jetzt deviceOptions aus MULTI_VALUE_DEVICES — bme280, sht31, bmp280 alle im Dropdown.

### A3: AddSensorModal — Typ-Auswahl

- **Quelle:** `getSensorTypeOptions()` aus sensorDefaults.ts
- **initialSensorType:** Prop vorhanden (Zeile 41); Durchreichung von ESPOrbitalLayout/DnD-Drop
- **Typ-spezifische Sektionen:**
  - **OneWire (DS18B20):** oneWireScanPin, Bus scannen, rom_code-Auswahl, bulk-add
  - **I2C:** selectedI2CAddress (Dropdown aus getI2CAddressOptions), gpio=0
  - **Analog/Digital:** GpioPicker (gpio)
- **Phase C (2026-03-06):** BME280, sht31, bmp280 im Dropdown; Duplikate dedupliziert

### A4: AddActuatorModal — Typ-Auswahl

- **Quelle:** `getActuatorTypeOptions()` aus `actuatorDefaults.ts`
- **Optionen:** pump, valve, relay, pwm (aus ACTUATOR_TYPE_CONFIG)
- **Typ-spezifisch:**
  - `valve` → aux_gpio (Direction-Pin)
  - `pump` → max_runtime_seconds, cooldown_seconds
  - `relay` / `valve` → inverted_logic (Normal-Closed)
  - `pwm` → pwm_value (Slider)
- **initialActuatorType:** Prop vorhanden; DnD-Durchreichung
- **Lücken:** Backend hat `digital`, `servo`, `fan` — Frontend nicht

---

## 3. Block B: Config-Panel typ-spezifische Felder

### B1: SensorConfigPanel — Welche Felder pro sensor_type?

| sensor_type | gpio | i2c_address | measure_range | calibration | Schwellwerte |
|-------------|------|-------------|---------------|-------------|--------------|
| ph | ✓ (Analog) | — | ✓ | ✓ (2-Punkt) | ✓ |
| ec | ✓ | — | ✓ | ✓ | ✓ |
| moisture | ✓ | — | ✓ | ✓ (Dry/Wet) | ✓ |
| soil_moisture | ✓ | — | ✓ | ✓ | ✓ |
| sht31_temp | — | ✓ (gpio=0) | — | — | ✓ |
| sht31_humidity | — | ✓ | — | — | ✓ |
| bmp280_* | — | ✓ | — | — | ✓ |
| bme280_* | — | ✓ | — | — | ✓ |
| ds18b20 | ✓ (OneWire) | — | — | — | ✓ |
| flow | ✓ (Digital) | — | — | ✓ pulses_per_liter | ✓ |
| analog | ✓ | — | ✓ | — | ✓ |
| light, co2 | ✓ | — | ✓ | — | ✓ |

**Bedingungen:**
- `interfaceType` = inferInterfaceType(sensorType): I2C → i2c_address, i2c_bus; ONEWIRE → gpio; ANALOG → gpio + measure_range; DIGITAL (flow) → gpio + pulses_per_liter
- `needsCalibration` = ph, ec, moisture, soil_moisture

### B2: ActuatorConfigPanel — Welche Felder pro actuator_type?

| actuator_type | max_runtime | cooldown | aux_gpio | inverted_logic | pwm_frequency | duty_max | switch_delay |
|---------------|-------------|----------|----------|--------------|--------------|----------|--------------|
| pump | ✓ | ✓ | — | — | — | — | — |
| valve | ✓ (max_open_time) | — | ✓ | ✓ (NC) | — | — | — |
| relay | — | — | — | ✓ | — | — | ✓ (ms) |
| pwm | — | — | — | — | ✓ | ✓ | — |

---

## 4. Block C: Backend Registry

### C1: Sensor-Typ-Registry (Python)

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`

**SENSOR_TYPE_MAPPING (ESP32 → Server):**
- temperature_sht31 → sht31_temp
- humidity_sht31 → sht31_humidity
- sht31_temp, sht31_humidity (pass-through)
- temperature_ds18b20, ds18b20 → ds18b20
- pressure_bmp280 → bmp280_pressure, temperature_bmp280 → bmp280_temp
- ph_sensor, ph → ph
- ec_sensor, ec → ec
- moisture, soil_moisture → moisture
- mhz19_co2, scd30_co2 → (co2-Varianten)
- light, tsl2561, bh1750 → light
- flow, yfs201 → flow

**MULTI_VALUE_SENSORS:**
- sht31: values [sht31_temp, sht31_humidity], device_address 0x44
- bmp280: values [bmp280_pressure, bmp280_temp], device_address 0x76
- **BME280 fehlt**

**Processing-Libraries (sensor_libraries/active/):**

| sensor_type | Library | Multi-Value? |
|-------------|---------|--------------|
| ph | ph_sensor.py | Nein |
| ec | ec_sensor.py | Nein |
| moisture | moisture.py | Nein |
| ds18b20 | temperature.py (DS18B20Processor) | Nein |
| sht31_temp | temperature.py (SHT31TemperatureProcessor) | Ja (SHT31) |
| sht31_humidity | humidity.py (SHT31HumidityProcessor) | Ja |
| bmp280_pressure | pressure.py (BMP280PressureProcessor) | Ja (BMP280) |
| bmp280_temp | pressure.py (BMP280TempProcessor) | Ja |
| flow | flow.py | Nein |
| light | light.py | Nein |
| co2 | co2.py | Nein |

**BME280:** Kein eigener Processor; sensor_handler hat Plausibilitätsgrenzen für bme280_temp, bme280_pressure, bme280_humidity.

### C2: Actuator-Typ (Backend)

**constants.ACTUATOR_TYPES:** digital, pwm, servo, pump, valve, relay

**schema_registry.ACTUATOR_TYPES:** relay, pwm (reduziert)

**API/Debug:** pump, valve, relay, pwm, fan, heater, motor, etc. (flexibel)

**ConfigBuilder:** sendet actuator_type an ESP32; `map_actuator_type_for_esp32()` mappt digital/binary/switch → relay.

---

## 5. Block D: Firmware SENSOR_TYPE_MAP

**Datei:** `El Trabajante/src/models/sensor_registry.cpp`

**SENSOR_TYPE_MAP (Auszug):**

| esp32_type | server_sensor_type | device_type | is_multi_value | is_i2c |
|------------|--------------------|-------------|----------------|--------|
| temperature_sht31 | sht31_temp | sht31 | true | true |
| humidity_sht31 | sht31_humidity | sht31 | true | true |
| sht31 | sht31 (BASE) | sht31 | true | true |
| temperature_ds18b20, ds18b20 | ds18b20 | ds18b20 | false | false |
| pressure_bmp280, bmp280_pressure | bmp280_pressure | bmp280 | true | true |
| temperature_bmp280, bmp280_temp | bmp280_temp | bmp280 | true | true |
| bmp280 | bmp280 (BASE) | bmp280 | true | true |
| pressure_bme280, bme280_pressure | bme280_pressure | bme280 | true | true |
| temperature_bme280, bme280_temp | bme280_temp | bme280 | true | true |
| humidity_bme280, bme280_humidity | bme280_humidity | bme280 | true | true |
| bme280 | bme280 (BASE) | bme280 | true | true |
| ph_sensor, ph | ph | ph_sensor | false | false |
| ec_sensor, ec | ec | ec_sensor | false | false |
| moisture, soil_moisture | moisture | moisture | false | false |

**MULTI_VALUE_DEVICES (Firmware):**
- sht31: sht31_temp, sht31_humidity
- bmp280: bmp280_pressure, bmp280_temp
- bme280: bme280_pressure, bme280_temp, bme280_humidity

**Hinweis:** Backend splittet "sht31" → 2 Configs (sht31_temp, sht31_humidity) via API; Firmware erwartet Base- oder Value-Typen.

---

## 6. Block E: Kalibrierung IST

### CalibrationWizard & useCalibration

**CalibrationWizard.vue** (`El Frontend/src/components/calibration/CalibrationWizard.vue`):
- Eigenständiger Wizard (CalibrationView): Sensor auswählen → Punkt 1 → Punkt 2 → Bestätigen
- Presets: ph, ec, moisture, temperature (nur ph/ec/moisture aktiv genutzt)

**useCalibration** (`El Frontend/src/composables/useCalibration.ts`):
- Verwendet in: **SensorConfigPanel.vue** (Inline-Kalibrierung)
- Typen: pH, EC, moisture

**SensorConfigPanel Kalibrierung:**

| sensor_type | CalibrationWizard | useCalibration | calibration_data Felder |
|-------------|-------------------|----------------|--------------------------|
| ph | ✓ (separater Wizard) | ✓ (Inline) | type: linear_2point, slope, offset, point1_raw, point1_ref, point2_raw, point2_ref, calibrated_at |
| ec | ✓ | ✓ | type: linear_2point, slope, offset, point1_raw, point1_ref, point2_raw, point2_ref, calibrated_at |
| moisture | ✓ | ✓ | type: moisture_2point, dry_value, wet_value, invert, calibrated_at |

**pH:** 2-Punkt (pH 4.0, pH 7.0)  
**EC:** 2-Punkt (0 µS/cm, 1413 µS/cm)  
**Moisture:** Dry/Wet ADC-Grenzen (typisch 3200 / 1500)

**Retry-Flow:** resetCalibration() vorhanden; Abbruch durch Schließen des Panels möglich.

---

## 7. Lücken-Matrix (Frontend ↔ Backend ↔ Firmware)

| Aspekt | Frontend | Backend | Firmware |
|--------|----------|---------|----------|
| BME280 Multi-Value | MULTI_VALUE_DEVICES ✓ | MULTI_VALUE_SENSORS ✗ | ✓ |
| SENSOR_TYPE_CONFIG bmp280_* | ✗ | ✓ | ✓ |
| AddSensorModal BME280 | ✗ (nur BME280, BME280_humidity, BME280_pressure) | — | — |
| getSensorTypeOptions Duplikate | ✓ Phase C behoben | — | — |
| actuator_type fan | ✗ | Tests/API nutzen | — |
| actuator_type servo | ✗ | constants ✓ | — |
| calibration DS18B20 | — | — | Offset optional |

---

## 8. Empfehlungen für Phase C (Darstellung) und Phase D (Kalibrierung)

### Phase C (Darstellung)
1. **getSensorTypeOptions deduplizieren:** [x] Phase C 2026-03-06 umgesetzt — Device-Liste, Value-Types ausgeblendet, ds18b20 kanonisch
2. **BME280 in AddSensorModal:** [x] Phase C 2026-03-06 — bme280 aus MULTI_VALUE_DEVICES im Dropdown
3. **SENSOR_TYPE_CONFIG bmp280_*:** bmp280_temp, bmp280_pressure, bme280_temp, bme280_humidity, bme280_pressure ergänzen für konsistente Widgets/Charts

### Phase D (Kalibrierung)
1. **DS18B20 Offset:** Prüfen ob Backend/Firmware Offset-Kalibrierung unterstützt; ggf. UI erweitern
2. **Calibration Presets:** Typ-spezifische Presets (z.B. EC 12880 µS/cm) in CalibrationWizard und useCalibration dokumentieren
3. **Backend MULTI_VALUE_SENSORS:** BME280 ergänzen für konsistente Multi-Value-Splitting-Logik

---

## Akzeptanzkriterien

- [x] Alle SENSOR_TYPE_CONFIG Keys dokumentiert
- [x] sensorDefaults.ts Exporte und MULTI_VALUE_DEVICES vollständig
- [x] AddSensorModal/AddActuatorModal Typ-Auswahl beschrieben
- [x] SensorConfigPanel/ActuatorConfigPanel typ-spezifische Feld-Matrix
- [x] Backend sensor_type_registry inventarisiert
- [x] Firmware SENSOR_TYPE_MAP dokumentiert
- [x] Kalibrierung pro Typ (ph, ec, moisture) beschrieben
- [x] Lücken-Matrix Frontend↔Backend↔Firmware
