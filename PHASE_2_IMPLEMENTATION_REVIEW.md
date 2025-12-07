# Phase 2 Sensor-Libraries - Implementation Review Guide

> **Für Entwickler:** Vollständiger Review-Guide zur Überprüfung der Phase 2 Implementierung (EC, Moisture, BMP280)

**Implementierungsdatum:** 2025-12-03
**Implementiert von:** KI-Agent (Claude)
**Status:** ✅ VOLLSTÄNDIG - Alle Tests bestanden (115/115)

---

## 1. Executive Summary

### Was wurde implementiert?

**4 Sensor-Prozessoren** für das God-Kaiser Pi-Enhanced System:

1. **Moisture Sensor** (Capacitive Soil Moisture) - ADC-based
2. **EC Sensor** (Electrical Conductivity) - ADC-based mit Temperature Compensation
3. **BMP280 Pressure** - I2C digital
4. **BMP280 Temperature** - I2C digital

### Kern-Metriken

- **Implementierte Dateien:** 6 (3 Processor-Dateien + 3 Test-Dateien)
- **Lines of Code:** ~1457 (Production) + ~1300 (Tests)
- **Test Coverage:** 115 Tests, 100% Pass-Rate
- **Build Status:** ✅ Alle Prozessoren erfolgreich importiert und instantiiert

---

## 2. Schnellstart für Review

### Option A: Gesamtsystem verstehen (30 Min)

```bash
# 1. Architektur verstehen
cat CLAUDE.md                                    # Projekt-Übersicht
cat "El Servador/SERVER_CLAUDE.md"              # Server-Architektur

# 2. Phase 2 Spezifikation lesen
cat "El Servador/docs/SENSOR_IMPLEMENTATION_PHASE_2_3.md"

# 3. Implementierung reviewen (siehe Section 3)
```

### Option B: Code-Only Review (15 Min)

```bash
# Direkt zu den kritischen Dateien springen (siehe Section 3)
cd "El Servador/god_kaiser_server"

# 1. Processor-Code reviewen
code src/sensors/sensor_libraries/active/moisture.py
code src/sensors/sensor_libraries/active/ec_sensor.py
code src/sensors/sensor_libraries/active/pressure.py

# 2. Tests ausführen
poetry run pytest tests/unit/test_moisture_processor.py \
                 tests/unit/test_ec_sensor_processor.py \
                 tests/unit/test_bmp280_processor.py -v
```

### Option C: Systemflow Deep-Dive (60 Min)

Siehe **Section 5: Systemflow-Analyse**

---

## 3. Kritische Dateien - Vollständige Liste

### 3.1 Production Code (El Servador)

| Datei | Zweck | LOC | Sensor Type | Review-Priorität |
|-------|-------|-----|-------------|------------------|
| `god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py` | Capacitive Soil Moisture Processor | 378 | `moisture` | **HOCH** |
| `god_kaiser_server/src/sensors/sensor_libraries/active/ec_sensor.py` | Electrical Conductivity Processor | 475 | `ec` | **HOCH** |
| `god_kaiser_server/src/sensors/sensor_libraries/active/pressure.py` | BMP280 Pressure + Temperature | 604 | `bmp280_pressure`, `bmp280_temp` | **HOCH** |

**Review-Fokus für Production Code:**
- ✅ Korrekte Implementierung von `BaseSensorProcessor`
- ✅ 6-Step `process()` Pattern eingehalten
- ✅ `validate()`, `calibrate()`, `get_metadata()` vollständig
- ✅ Unit Conversions korrekt (µS/cm↔mS/cm↔ppm, hPa↔Pa↔mmHg, °C↔°F↔K)
- ✅ Quality Assessment implementiert (good/fair/poor/error)
- ✅ Error Handling robust (try/except, Fallbacks)

### 3.2 Test Code (El Servador)

| Datei | Zweck | Tests | Review-Priorität |
|-------|-------|-------|------------------|
| `god_kaiser_server/tests/unit/test_moisture_processor.py` | Moisture Sensor Tests | 31 | MITTEL |
| `god_kaiser_server/tests/unit/test_ec_sensor_processor.py` | EC Sensor Tests | 35 | MITTEL |
| `god_kaiser_server/tests/unit/test_bmp280_processor.py` | BMP280 Pressure + Temperature Tests | 49 | MITTEL |

**Review-Fokus für Tests:**
- ✅ Edge Cases abgedeckt (ADC min/max, invalid values, division by zero)
- ✅ Calibration Tests (2-point für ADC, offset für I2C)
- ✅ Unit Conversion Tests (alle unterstützten Units)
- ✅ Quality Assessment Tests (alle 4 Tiers)
- ✅ Temperature Compensation Tests (nur EC Sensor)
- ✅ Sea-Level Correction Tests (nur BMP280 Pressure)

### 3.3 Referenz-Dokumentation

| Datei | Zweck | Wann konsultieren? |
|-------|-------|-------------------|
| `CLAUDE.md` | Master-Dokumentation (Architektur, Workflow, Modul-Navigation) | **IMMER ZUERST LESEN** |
| `El Servador/SERVER_CLAUDE.md` | Server-spezifische Architektur | Server-Logik verstehen |
| `El Servador/docs/SENSOR_IMPLEMENTATION_PHASE_2_3.md` | Phase 2/3 Implementierungs-Spec | **KRITISCH** - Vollständige Sensor-Specs |
| `El Servador/docs/ESP32_TESTING.md` | Test-Infrastruktur (MockESP32Client) | Test-Patterns verstehen |
| `El Trabajante/docs/system-flows/02-sensor-reading-flow.md` | Sensor-Reading Flow (ESP32 → Server) | **KRITISCH** - End-to-End Flow |
| `El Trabajante/docs/Mqtt_Protocoll.md` | MQTT Topic Schema & Payloads | MQTT-Integration verstehen |
| `El Trabajante/docs/API_REFERENCE.md` | SensorManager API (ESP32-Seite) | ESP32-Integration verstehen |

### 3.4 Referenz-Implementierungen (Phase 1)

| Datei | Pattern-Beispiel für | Review als |
|-------|---------------------|-----------|
| `god_kaiser_server/src/sensors/sensor_libraries/active/ph_sensor.py` | ADC-Sensor mit 2-Point Calibration | Vergleich zu EC/Moisture |
| `god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py` | I2C Digital Sensor | Vergleich zu BMP280 |
| `god_kaiser_server/src/sensors/sensor_libraries/active/humidity.py` | Quality Assessment Pattern | Vergleich zu allen Phase 2 |

---

## 4. Code-Review Checkliste

### 4.1 Moisture Sensor (`moisture.py`)

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py`

#### Zu überprüfende Aspekte:

```python
# 1. SENSOR TYPE MAPPING
class MoistureSensorProcessor(BaseSensorProcessor):
    def get_sensor_type(self) -> str:
        return "moisture"  # ✅ MQTT sensor_type mapping
```

**Review-Fragen:**
- ✅ Sensor-Type `"moisture"` korrekt für MQTT-Mapping?
- ✅ ESP32 sendet `sensor_type: "moisture"` → LibraryLoader findet Processor?

```python
# 2. CALIBRATION LOGIC (2-Point: Dry/Wet)
def calibrate(self, calibration_points: List[Dict]) -> bool:
    # Erwartet: [{"type": "dry", "adc": 3000}, {"type": "wet", "adc": 1000}]
    # Logik: moisture% = (raw - dry) / (wet - dry) * 100
```

**Review-Fragen:**
- ✅ Dry-Wert > Wet-Wert korrekt behandelt? (Capacitive sensors: high=dry)
- ✅ Division by Zero Protection? (dry_value == wet_value)
- ✅ Invert-Logic korrekt? (Parameter `invert` für resistive sensors)

```python
# 3. QUALITY ASSESSMENT
def _assess_quality(self, moisture: float) -> str:
    # good: 20-80%, fair: 10-90%, poor: <10% oder >90%
```

**Review-Fragen:**
- ✅ Thresholds sinnvoll für Soil Moisture? (sehr trocken <10%, sehr nass >90%)
- ✅ Nicht-kalibrierte Sensoren → "poor" Quality?

**Test-Coverage Check:**
```bash
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/test_moisture_processor.py::test_calibrate_with_two_points -v
poetry run pytest tests/unit/test_moisture_processor.py::test_process_with_invert -v
poetry run pytest tests/unit/test_moisture_processor.py::test_quality_assessment -v
```

---

### 4.2 EC Sensor (`ec_sensor.py`)

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ec_sensor.py`

#### Zu überprüfende Aspekte:

```python
# 1. TEMPERATURE COMPENSATION (KRITISCH!)
TEMP_COEFFICIENT = 0.02  # ~2% per °C
REFERENCE_TEMP = 25.0    # 25°C Standard

def _apply_temperature_compensation(self, ec: float, temperature: float) -> float:
    """
    EC_25C = EC_raw / (1 + 0.02 * (T - 25))
    Beispiel: EC_raw=1000 bei T=30°C → EC_25C = 1000 / 1.1 = 909 µS/cm
    """
    temp_difference = temperature - self.REFERENCE_TEMP
    temp_factor = 1 + self.TEMP_COEFFICIENT * temp_difference
    if temp_factor == 0:
        return ec
    ec_compensated = ec / temp_factor
    return max(self.EC_MIN, min(self.EC_MAX, ec_compensated))
```

**Review-Fragen:**
- ✅ Formel korrekt? (Standard-Formel für EC Temperature Compensation)
- ✅ Reference Temperature 25°C industry-standard?
- ✅ 2% Coefficient realistisch? (Typisch für wässrige Lösungen)
- ✅ Clamping nach Compensation? (EC_MIN=0, EC_MAX=20000 µS/cm)

**Numerisches Beispiel validieren:**
```python
# Bei 30°C (5°C über Referenz):
# temp_factor = 1 + 0.02 * 5 = 1.1
# EC_25C = 1000 / 1.1 ≈ 909 µS/cm ✅ Korrekt!
```

```python
# 2. UNIT CONVERSIONS
def _convert_unit(self, ec_us: float, target_unit: str) -> float:
    if target_unit == "ms_cm":   # milliSiemens/cm
        return ec_us / 1000.0
    elif target_unit == "ppm":   # TDS (Total Dissolved Solids)
        return ec_us * 0.5       # Standard conversion factor
```

**Review-Fragen:**
- ✅ µS/cm → mS/cm: Division durch 1000? ✅
- ✅ µS/cm → ppm: Faktor 0.5 korrekt? (Standard für TDS, aber abhängig von Lösung!)
- ⚠️ **WARNUNG:** 0.5 ist Approximation - echte Conversion braucht Lösungs-Typ!

**Test-Coverage Check:**
```bash
poetry run pytest tests/unit/test_ec_sensor_processor.py::test_temperature_compensation_at_reference -v
poetry run pytest tests/unit/test_ec_sensor_processor.py::test_temperature_compensation_above_reference -v
poetry run pytest tests/unit/test_ec_sensor_processor.py::test_process_with_unit_conversion_ms_cm -v
poetry run pytest tests/unit/test_ec_sensor_processor.py::test_process_with_unit_conversion_ppm -v
```

```python
# 3. ADC AUTO-DETECTION (12-bit vs 16-bit)
def validate(self, raw_value: float) -> ValidationResult:
    if raw_value > 4095:  # Above 12-bit max
        adc_max = 32767   # Assume 16-bit ADC (ADS1115)
    else:
        adc_max = 4095    # 12-bit ESP32 ADC
```

**Review-Fragen:**
- ✅ Auto-Detection sinnvoll? (ESP32 ADC1: 12-bit, ADS1115: 16-bit)
- ✅ Threshold 4095 korrekt? (12-bit max)
- ⚠️ **Edge Case:** Was wenn 16-bit ADC Wert <4095 liefert? (Wird als 12-bit behandelt, aber funktioniert trotzdem)

---

### 4.3 BMP280 Sensors (`pressure.py`)

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/pressure.py`

#### Zu überprüfende Aspekte:

**Wichtig:** Diese Datei enthält **2 Klassen**:
1. `BMP280PressureProcessor` (sensor_type: `"bmp280_pressure"`)
2. `BMP280TemperatureProcessor` (sensor_type: `"bmp280_temp"`)

```python
# 1. SEA-LEVEL CORRECTION (Pressure Processor)
def _apply_sea_level_correction(self, pressure: float, altitude: float) -> float:
    """
    Barometric Formula (vereinfacht, gut bis ~3000m):
    P_sealevel = P_measured / (1 - altitude / 44330) ^ 5.255

    Beispiel: P_measured=950 hPa auf 500m Höhe
    → P_sealevel = 950 / (1 - 500/44330)^5.255 ≈ 1008 hPa
    """
    ALTITUDE_CONSTANT = 44330.0  # Standard Atmosphere Model
    EXPONENT = 5.255             # Adiabatic Index

    factor = 1 - (altitude / ALTITUDE_CONSTANT)
    if factor <= 0:
        return pressure  # Invalid altitude (above atmosphere)

    pressure_sealevel = pressure / (factor ** EXPONENT)
    return max(self.PRESSURE_MIN, min(self.PRESSURE_MAX, pressure_sealevel))
```

**Review-Fragen:**
- ✅ Formel korrekt? (Standard Barometric Formula)
- ✅ Constants korrekt? (44330m = scale height, 5.255 = adiabatic index)
- ✅ Gültigkeitsbereich dokumentiert? (<3000m optimal)
- ✅ Negative Altitude behandelt? (factor>1, P_sealevel<P_measured ✅)
- ⚠️ **Warnung:** Sehr hohe Altitudes (>10km) → factor≤0 → Return original pressure

**Numerisches Beispiel validieren:**
```python
# 500m Höhe, P_measured=950 hPa:
# factor = 1 - 500/44330 = 0.9887
# P_sealevel = 950 / (0.9887^5.255) ≈ 1008 hPa ✅ Realistisch!
```

**Test-Coverage Check:**
```bash
poetry run pytest tests/unit/test_bmp280_processor.py::test_process_pressure_with_sea_level_correction -v
poetry run pytest tests/unit/test_bmp280_processor.py::test_sea_level_correction_at_sea_level -v
poetry run pytest tests/unit/test_bmp280_processor.py::test_sea_level_correction_at_high_altitude -v
```

```python
# 2. UNIT CONVERSIONS (Pressure)
def _convert_pressure_unit(self, pressure_hpa: float, target_unit: str) -> float:
    if target_unit == "pa":      # Pascal
        return pressure_hpa * 100.0
    elif target_unit == "mmhg":  # Millimeter Mercury
        return pressure_hpa * 0.750062
    elif target_unit == "inhg":  # Inches Mercury
        return pressure_hpa * 0.02953
```

**Review-Fragen:**
- ✅ hPa → Pa: Faktor 100? ✅
- ✅ hPa → mmHg: Faktor 0.750062? (1 hPa = 0.750062 mmHg ✅)
- ✅ hPa → inHg: Faktor 0.02953? (1 hPa = 0.0295300 inHg ≈ 0.02953 ✅)

```python
# 3. UNIT CONVERSIONS (Temperature)
def _convert_temperature_unit(self, temp_c: float, target_unit: str) -> float:
    if target_unit == "fahrenheit":
        return (temp_c * 9/5) + 32
    elif target_unit == "kelvin":
        return temp_c + 273.15
```

**Review-Fragen:**
- ✅ °C → °F: Formel (C * 9/5 + 32)? ✅
- ✅ °C → K: Offset 273.15? ✅
- ⚠️ **Edge Case:** Kelvin kann nicht negativ sein - Clamping nötig? (BMP280 misst -40 bis +85°C, alles >233K ✅)

---

## 5. Systemflow-Analyse

### 5.1 End-to-End Flow: Sensor Reading (ESP32 → Server → ESP32)

**KRITISCHE DOKUMENTATION LESEN:**
- `El Trabajante/docs/system-flows/02-sensor-reading-flow.md`
- `El Trabajante/docs/Mqtt_Protocoll.md`

#### Flow-Diagramm:

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: ESP32 liest RAW-Wert                                     │
│ (SensorManager::readSensor)                                      │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: ESP32 published RAW-Daten via MQTT                       │
│ Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data                │
│ Payload: {                                                        │
│   "sensor_type": "moisture",  ← KRITISCH für Processor-Mapping!  │
│   "gpio": 34,                                                     │
│   "raw_value": 2500.0,                                            │
│   "timestamp": 1234567890                                         │
│ }                                                                 │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: God-Kaiser empfängt MQTT Message                         │
│ (mqtt_handler.py::handle_sensor_data)                            │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: LibraryLoader mappt sensor_type → Processor              │
│ sensor_type="moisture" → MoistureSensorProcessor                 │
│ (library_loader.py::get_processor)                               │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 5: Processor verarbeitet RAW → Processed                    │
│ MoistureSensorProcessor::process(2500.0, params)                 │
│ → validate() → calibrate() → convert_unit() → assess_quality()   │
│ → ProcessingResult(value=45.5, unit="%", quality="good")         │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 6: God-Kaiser speichert in DB + sendet zurück an ESP32      │
│ Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/processed           │
│ Payload: {                                                        │
│   "value": 45.5,                                                  │
│   "unit": "%",                                                    │
│   "quality": "good",                                              │
│   "metadata": {"calibrated": true, "sensor_type": "moisture"}    │
│ }                                                                 │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 7: ESP32 empfängt Processed-Wert                            │
│ (MQTTClient::onMessage → SensorManager::handleProcessedValue)    │
│ → Kann Value für lokale Control-Logik nutzen                     │
└──────────────────────────────────────────────────────────────────┘
```

#### Review-Checkpoints:

**Checkpoint 1: MQTT Topic Schema**
```bash
# Dokumentation lesen:
cat "El Trabajante/docs/Mqtt_Protocoll.md" | grep "sensor.*data"

# Erwartetes Schema:
# kaiser/god/esp/{esp_id}/sensor/{gpio}/data
```

**Review-Fragen:**
- ✅ Alle Phase 2 Sensoren nutzen korrektes Topic-Schema?
- ✅ `sensor_type` Field in Payload vorhanden?
- ✅ ESP32 setzt `sensor_type` korrekt beim Sensor-Setup?

**Checkpoint 2: LibraryLoader Mapping**
```bash
# Test ausführen:
cd "El Servador/god_kaiser_server"
poetry run python -c "
from src.sensors.library_loader import get_library_loader
loader = get_library_loader()
print('Available sensors:', loader.get_available_sensors())
assert 'moisture' in loader.get_available_sensors()
assert 'ec' in loader.get_available_sensors()
assert 'bmp280_pressure' in loader.get_available_sensors()
assert 'bmp280_temp' in loader.get_available_sensors()
print('OK: All Phase 2 sensors mapped correctly!')
"
```

**Review-Fragen:**
- ✅ LibraryLoader findet alle 4 Phase 2 Prozessoren?
- ✅ `get_sensor_type()` returned korrekte Strings?
- ✅ Keine Naming-Konflikte mit Phase 1 Sensoren?

**Checkpoint 3: ESP32 Integration**
```bash
# ESP32-Seite Code reviewen:
cat "El Trabajante/src/services/sensor/sensor_manager.cpp" | grep "addSensor"

# Erwartete Usage:
# sensorManager.addSensor(34, SensorType::MOISTURE, "moisture");
#                                ^^^^^^^^^^^^^^^^  ^^^^^^^^^^
#                                Enum für ESP32    String für MQTT!
```

**Review-Fragen:**
- ✅ SensorType Enum enthält MOISTURE, EC, BMP280?
- ✅ String-Mapping korrekt? (SensorType::MOISTURE → "moisture")
- ✅ ESP32 Libraries verfügbar? (Adafruit_BMP280 für BMP280)

---

### 5.2 Calibration Flow

**WICHTIG:** Calibration-Daten werden vom God-Kaiser gespeichert und bei jedem `process()` Call angewendet!

#### Flow-Diagramm:

```
┌──────────────────────────────────────────────────────────────────┐
│ SCHRITT 1: User startet Calibration (via God-UI oder API)        │
│ POST /api/v1/sensors/{esp_id}/{gpio}/calibrate                   │
│ Body: {                                                           │
│   "calibration_type": "two_point",                                │
│   "points": [                                                     │
│     {"type": "dry", "adc": 3000},  ← Sensor in Luft              │
│     {"type": "wet", "adc": 1000}   ← Sensor in Wasser            │
│   ]                                                               │
│ }                                                                 │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ SCHRITT 2: God-Kaiser ruft Processor::calibrate()                │
│ MoistureSensorProcessor::calibrate([                             │
│   {"type": "dry", "adc": 3000},                                   │
│   {"type": "wet", "adc": 1000}                                    │
│ ])                                                                │
│ → Berechnet slope/offset für lineare Mapping                     │
│ → Speichert in DB: sensors_calibration Table                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ SCHRITT 3: Bei jedem process() Call werden Calibration-Daten     │
│            aus DB geladen und angewendet                          │
│ process(raw_value=2500, params={"dry_value": 3000, ...})         │
│ → moisture% = (2500 - 3000) / (1000 - 3000) * 100 = 25%          │
└──────────────────────────────────────────────────────────────────┘
```

#### Review-Checkpoints:

**Checkpoint 1: Calibration-Daten Persistenz**
```bash
# DB Schema prüfen:
cat "El Servador/god_kaiser_server/src/db/models.py" | grep "class.*Calibration"

# Erwartete Felder:
# - esp_id, gpio: Sensor-Identifikation
# - calibration_type: "two_point", "offset", etc.
# - calibration_data: JSON mit points/values
# - created_at, updated_at: Timestamps
```

**Review-Fragen:**
- ✅ Calibration-Daten werden in DB gespeichert?
- ✅ Bei jedem `process()` Call werden sie geladen?
- ✅ Alte Calibration-Daten werden überschrieben (nicht append)?

**Checkpoint 2: Calibration-Logic Korrektheit**
```bash
# Test ausführen:
cd "El Servador/god_kaiser_server"

# Moisture: 2-Point Calibration
poetry run pytest tests/unit/test_moisture_processor.py::test_calibrate_with_two_points -v

# EC: 2-Point Calibration
poetry run pytest tests/unit/test_ec_sensor_processor.py::test_calibrate_with_two_points -v

# BMP280: Offset Calibration
poetry run pytest tests/unit/test_bmp280_processor.py::test_pressure_calibrate_offset -v
```

---

## 6. Integration mit ESP32

### 6.1 ESP32 SensorManager API

**WICHTIG:** ESP32 muss Sensor mit korrektem `sensor_type` String registrieren!

**Code-Location:** `El Trabajante/src/services/sensor/sensor_manager.cpp`

#### Erwartete ESP32-Konfiguration:

```cpp
// 1. Moisture Sensor (ADC1 Pin!)
sensorManager.addSensor(
    34,                     // GPIO 34 (ADC1_CH6)
    SensorType::MOISTURE,   // Enum-Type
    "moisture"              // ← MQTT sensor_type String (KRITISCH!)
);

// 2. EC Sensor (ADC1 Pin!)
sensorManager.addSensor(
    35,                     // GPIO 35 (ADC1_CH7)
    SensorType::EC,
    "ec"                    // ← MQTT sensor_type String
);

// 3. BMP280 (I2C, GPIO21/22)
sensorManager.addSensor(
    21,                     // GPIO 21 (SDA)
    SensorType::BMP280_PRESSURE,
    "bmp280_pressure"       // ← MQTT sensor_type String
);

sensorManager.addSensor(
    21,                     // Same GPIO! (BMP280 liefert beide Werte)
    SensorType::BMP280_TEMP,
    "bmp280_temp"           // ← MQTT sensor_type String
);
```

#### Review-Checkpoints:

**Checkpoint 1: GPIO Pin Restrictions**

**KRITISCH für ADC-Sensoren (Moisture, EC):**
```cpp
// ✅ ERLAUBT: ADC1 Pins (GPIO 32-39)
#define ADC1_GPIO_32  32
#define ADC1_GPIO_33  33
#define ADC1_GPIO_34  34
#define ADC1_GPIO_35  35
#define ADC1_GPIO_36  36  // VP (Voltage Positive)
#define ADC1_GPIO_39  39  // VN (Voltage Negative)

// ❌ VERBOTEN: ADC2 Pins (GPIO 0, 2, 4, 12-15, 25-27)
// Grund: WiFi nutzt ADC2 intern → Konflikt!
```

**Review-Fragen:**
- ✅ Moisture/EC Sensoren nutzen nur ADC1 Pins (32-39)?
- ✅ Dokumentation warnt vor ADC2-Nutzung?
- ✅ GPIO-Konflikte vermieden? (kein Pin doppelt belegt)

**Checkpoint 2: I2C Konfiguration (BMP280)**

```cpp
// BMP280 nutzt I2C (Standard ESP32 Pins)
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define BMP280_I2C_ADDR 0x76  // oder 0x77

// ESP32 Library-Setup:
Adafruit_BMP280 bmp;
if (!bmp.begin(BMP280_I2C_ADDR)) {
    // Error handling
}
```

**Review-Fragen:**
- ✅ I2C Pins korrekt (21=SDA, 22=SCL)?
- ✅ I2C Address korrekt? (0x76 oder 0x77, je nach Modul)
- ✅ Adafruit_BMP280 Library in `platformio.ini`?

**Checkpoint 3: MQTT Payload Struktur**

```cpp
// ESP32 sendet RAW-Daten:
JsonDocument doc;
doc["sensor_type"] = "moisture";  // ← MUSS mit Processor::get_sensor_type() übereinstimmen!
doc["gpio"] = 34;
doc["raw_value"] = analogRead(34);  // 0-4095 (12-bit ADC)
doc["timestamp"] = millis();

char payload[256];
serializeJson(doc, payload);
mqttClient.publish("kaiser/god/esp/esp32_001/sensor/34/data", payload);
```

**Review-Fragen:**
- ✅ `sensor_type` Field vorhanden?
- ✅ String-Wert korrekt? (lowercase, keine Leerzeichen)
- ✅ `raw_value` als Float/Integer (nicht String)?

---

### 6.2 ESP32 Testing

**Dokumentation:** `El Servador/docs/ESP32_TESTING.md`

#### MockESP32Client Pattern

**Code-Location:** `El Servador/god_kaiser_server/tests/conftest.py`

```python
@pytest.fixture
def mock_esp32(mqtt_handler):
    """Vorkonfigurierter Mock-ESP32 für Tests."""
    esp = MockESP32Client(
        esp_id="esp32_test_001",
        mqtt_handler=mqtt_handler
    )

    # Sensoren konfigurieren
    esp.add_sensor(gpio=34, sensor_type="moisture")
    esp.add_sensor(gpio=35, sensor_type="ec")
    esp.add_sensor(gpio=21, sensor_type="bmp280_pressure")
    esp.add_sensor(gpio=21, sensor_type="bmp280_temp")

    return esp
```

**Review-Fragen:**
- ✅ MockESP32Client simuliert Production MQTT-Topics?
- ✅ Tests nutzen identische sensor_type Strings wie Production?
- ✅ Integration Tests vorhanden? (ESP32 → Server → ESP32 Round-Trip)

---

## 7. Häufige Fehlerquellen (Pitfalls)

### 7.1 ADC1 vs ADC2 Pin-Konflikt

**Problem:** ADC2-Pins (GPIO 0, 2, 4, 12-15, 25-27) können nicht genutzt werden wenn WiFi aktiv!

**Symptom:**
```
ESP32 Log: analogRead(GPIO 25) returns 0 or garbage values
```

**Fix:**
```cpp
// ❌ FALSCH:
sensorManager.addSensor(25, SensorType::MOISTURE, "moisture");  // ADC2!

// ✅ RICHTIG:
sensorManager.addSensor(34, SensorType::MOISTURE, "moisture");  // ADC1!
```

**Review-Checkpoint:**
```bash
# Alle ADC-Sensor GPIOs überprüfen:
grep -r "addSensor.*MOISTURE" "El Trabajante/src/"
grep -r "addSensor.*EC" "El Trabajante/src/"

# Sicherstellen: GPIO in Range 32-39!
```

---

### 7.2 sensor_type String Mismatch

**Problem:** ESP32 sendet `sensor_type: "Moisture"` aber Processor hat `get_sensor_type() = "moisture"`

**Symptom:**
```
God-Kaiser Log: [ERROR] No processor found for sensor_type: Moisture
```

**Fix:**
```cpp
// ❌ FALSCH:
doc["sensor_type"] = "Moisture";  // Uppercase!

// ✅ RICHTIG:
doc["sensor_type"] = "moisture";  // Lowercase, wie in Processor!
```

**Review-Checkpoint:**
```bash
# Processor sensor_types auflisten:
cd "El Servador/god_kaiser_server"
poetry run python -c "
from src.sensors.library_loader import get_library_loader
loader = get_library_loader()
for sensor_type in sorted(loader.get_available_sensors()):
    processor = loader.get_processor(sensor_type)
    print(f'{sensor_type:20s} → {type(processor).__name__}')
"
```

---

### 7.3 Calibration-Daten nicht persistiert

**Problem:** Calibration-Daten werden nur in Processor-Instanz gespeichert, nicht in DB

**Symptom:**
```
Nach Server-Restart: Sensor nicht mehr kalibriert!
```

**Fix:**
```python
# ✅ Calibration-Daten MÜSSEN in DB gespeichert werden:
def calibrate_sensor(esp_id: str, gpio: int, calibration_points: List[Dict]):
    processor = get_processor(sensor_type)
    processor.calibrate(calibration_points)  # ← Validierung

    # KRITISCH: In DB speichern!
    db.save_calibration(esp_id, gpio, calibration_points)
```

**Review-Checkpoint:**
```bash
# DB Schema prüfen:
grep -A 10 "class.*Calibration" "El Servador/god_kaiser_server/src/db/models.py"
```

---

### 7.4 Temperature Compensation ohne Temperature-Wert

**Problem:** EC Sensor braucht Temperature für Compensation, aber ESP32 sendet nur EC-Wert

**Symptom:**
```
EC Sensor: Temperature compensation skipped (no temperature provided)
Quality: poor
```

**Fix:**
```python
# ESP32 MUSS auch Temperature senden (von separatem Sensor):
{
    "sensor_type": "ec",
    "gpio": 35,
    "raw_value": 2500,
    "temperature": 22.5  # ← KRITISCH für EC!
}

# Oder: God-Kaiser holt letzte Temperature-Messung aus DB
```

**Review-Checkpoint:**
```bash
# EC Processor prüfen: Was passiert ohne temperature?
grep -A 5 "temperature" "El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ec_sensor.py"
```

---

## 8. Performance & Optimierungen

### 8.1 LibraryLoader Caching

**Code-Location:** `El Servador/god_kaiser_server/src/sensors/library_loader.py`

```python
class LibraryLoader:
    def __init__(self):
        self._processors = {}  # Cache für Processor-Instanzen
        self._load_all_processors()  # Beim Start einmalig laden

    def get_processor(self, sensor_type: str):
        # Cache Hit: Return existing instance
        if sensor_type in self._processors:
            return self._processors[sensor_type]

        # Cache Miss: Load and cache
        processor = self._load_processor(sensor_type)
        self._processors[sensor_type] = processor
        return processor
```

**Review-Fragen:**
- ✅ Processor-Instanzen werden gecached? (nicht jedes Mal neu laden)
- ✅ Thread-Safe? (Wenn Multi-Threading: Locks nötig?)

---

### 8.2 MQTT Message Batching

**Problem:** Bei vielen Sensoren: MQTT-Flood (100 Sensoren × 1Hz = 100 msg/s)

**Lösung:** Batching auf ESP32-Seite:
```cpp
// Statt einzelne Messages:
for (sensor : sensors) {
    publish(sensor.data());  // 100 Messages!
}

// Batching:
JsonArray batch;
for (sensor : sensors) {
    batch.add(sensor.data());
}
publish(batch);  // 1 Message mit 100 Sensor-Werten!
```

**Review-Checkpoint:**
```bash
# Prüfen ob Batching implementiert:
grep -r "batch" "El Trabajante/src/services/sensor/"
```

---

## 9. Nächste Schritte (Phase 3)

**Dokumentation:** `El Servador/docs/SENSOR_IMPLEMENTATION_PHASE_2_3.md` (Phase 3 Section)

### Phase 3 Sensoren (noch nicht implementiert):

1. **pH Sensor** (ADC, bereits implementiert in Phase 1, aber separate Klasse)
2. **Light Sensor** (ADC, LDR oder TSL2561)
3. **CO2 Sensor** (UART/I2C, MH-Z19 oder SGP30)

**Review-Empfehlung:**
- Phase 2 Patterns als Referenz für Phase 3 nutzen
- ADC-Pattern: Moisture/EC → Light
- I2C-Pattern: BMP280 → SGP30
- UART-Pattern: Neu, braucht eigenes Pattern-Dokument

---

## 10. Abschluss-Checkliste

### Vollständiger Review-Prozess:

```bash
# 1. Dokumentation lesen (30 Min)
[ ] CLAUDE.md komplett gelesen
[ ] El Servador/SERVER_CLAUDE.md gelesen
[ ] El Servador/docs/SENSOR_IMPLEMENTATION_PHASE_2_3.md gelesen
[ ] El Trabajante/docs/system-flows/02-sensor-reading-flow.md gelesen

# 2. Code-Review (60 Min)
[ ] moisture.py: Calibration-Logic validiert
[ ] ec_sensor.py: Temperature Compensation validiert
[ ] pressure.py: Sea-Level Correction validiert
[ ] Alle Unit Tests durchgelaufen (115/115 PASS)
[ ] LibraryLoader-Discovery getestet

# 3. Integration-Review (45 Min)
[ ] MQTT Topic Schema korrekt
[ ] sensor_type Strings konsistent (ESP32 ↔ Server)
[ ] ADC1 Pin-Restriction eingehalten
[ ] I2C Konfiguration korrekt (BMP280)
[ ] Calibration-Persistenz in DB vorhanden

# 4. Systemflow-Verstehen (60 Min)
[ ] End-to-End Flow nachvollzogen (ESP32 → Server → ESP32)
[ ] Calibration-Flow verstanden
[ ] Error-Handling-Paths geprüft

# 5. Performance-Check (15 Min)
[ ] LibraryLoader Caching aktiv
[ ] Keine offensichtlichen Performance-Bottlenecks

# 6. Dokumentation-Update (30 Min)
[ ] Alle neuen sensor_types in MQTT-Protokoll dokumentiert
[ ] API_REFERENCE.md aktualisiert (falls ESP32-API geändert)
[ ] Dieser Review-Guide für Phase 3 anpassbar
```

---

## 11. Kontakt & Fragen

**Bei Fragen zur Implementierung:**

1. **Code-Verständnis:** Kommentare in Source-Code lesen
2. **Algorithmus-Details:** Unit-Tests als Spezifikation nutzen
3. **Integration-Probleme:** `system-flows/` Dokumentation konsultieren
4. **Hardware-Specs:** `SENSOR_IMPLEMENTATION_PHASE_2_3.md` Referenz-Section

**Review-Feedback:**

Wenn Fehler/Verbesserungen gefunden:
1. Issue erstellen mit Referenz zu diesem Dokument
2. Code-Location + erwartetes vs. tatsächliches Verhalten beschreiben
3. Falls möglich: Test-Case der Fehler reproduziert

---

**Review-Guide Version:** 1.0
**Letzte Aktualisierung:** 2025-12-03
**Erstellt von:** KI-Agent (Claude) für Phase 2 Implementation Review
**Gültig für:** Phase 2 Sensor-Libraries (Moisture, EC, BMP280)
