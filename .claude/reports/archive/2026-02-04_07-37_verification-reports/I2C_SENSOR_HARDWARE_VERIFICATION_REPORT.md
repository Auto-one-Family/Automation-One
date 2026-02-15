# I2C-Sensor Hardware-Verifikation Report

**Datum:** 2026-02-04
**Analyst:** Claude Code
**Status:** ABGESCHLOSSEN - KRITISCHE FINDINGS

---

## Executive Summary

Die Verifikation der I2C-Sensor Hardware-Charakteristiken hat **3 kritische Findings** ergeben:

1. **i2c_address fehlt im MQTT-Payload** - Zwei gleiche I2C-Sensoren auf verschiedenen Adressen können nicht unterschieden werden
2. **i2c_address fehlt im DB Unique Constraint** - Potenzielle Datenkonflikte bei mehreren gleichen I2C-Sensoren
3. **BMP280/BME280 haben keinen RAW-Mode** - ESP32 macht Kompensation lokal (Architektur-Entscheidung, kein Bug)

---

## 1. SHT31 Verifikation

### 1.1 ESP32 Protokoll (i2c_sensor_protocol.cpp)

| Aspekt | Erwartet | Implementiert | Status |
|--------|----------|---------------|--------|
| Command | 0x2400 | `{0x24, 0x00}` (Zeile 24) | ✅ KORREKT |
| Timing | 16ms | `conversion_time_ms = 16` (Zeile 27) | ✅ KORREKT |
| Expected Bytes | 6 | `expected_bytes = 6` (Zeile 28) | ✅ KORREKT |
| CRC Polynomial | 0x31 | `polynomial = 0x31` (Zeile 30) | ✅ KORREKT |
| CRC Init | 0xFF | `init_value = 0xFF` (Zeile 31) | ✅ KORREKT |
| CRC Interleaved | true | `interleaved = true` (Zeile 32) | ✅ KORREKT |
| Temp Bytes | 0-1 BE | `byte_offset = 0, byte_count = 2, big_endian = true` | ✅ KORREKT |
| Hum Bytes | 3-4 BE | `byte_offset = 3, byte_count = 2, big_endian = true` | ✅ KORREKT |
| I2C Adressen | 0x44, 0x45 | `default = 0x44, alternate = 0x45` | ✅ KORREKT |

### 1.2 Server Konvertierung (temperature.py, humidity.py)

**SHT31 Temperatur (Zeile 517-518):**
```python
# Implementiert:
raw_value = self.RAW_CONVERSION_OFFSET + (
    self.RAW_CONVERSION_SCALE * float(raw_int) / self.RAW_MAX_VALUE
)
# Konstanten: OFFSET = -45.0, SCALE = 175.0, MAX = 65535.0
# Ergibt: -45 + (175 * raw / 65535)
```
**Status:** ✅ KORREKT - Exakt Sensirion Datenblatt Formel

**SHT31 Humidity (Zeile 157-158):**
```python
# Implementiert:
raw_value = self.RAW_CONVERSION_SCALE * float(raw_int) / self.RAW_MAX_VALUE
# Konstanten: SCALE = 100.0, MAX = 65535.0
# Ergibt: 100 * raw / 65535
```
**Status:** ✅ KORREKT - Exakt Sensirion Datenblatt Formel

### 1.3 Messbereiche

| Wert | Erwartet | Implementiert | Status |
|------|----------|---------------|--------|
| Temp Min | -40°C | `TEMP_MIN = -40.0` | ✅ |
| Temp Max | +125°C | `TEMP_MAX = 125.0` | ✅ |
| Hum Min | 0% | `HUMIDITY_MIN = 0.0` | ✅ |
| Hum Max | 100% | `HUMIDITY_MAX = 100.0` | ✅ |
| Hum Clamping | Ja | Zeile 183: `max(MIN, min(MAX, humidity))` | ✅ |

### 1.4 Einheiten

| Sensor | Erwartet | Implementiert | Status |
|--------|----------|---------------|--------|
| Temperatur | °C | `unit_str = "°C"` | ✅ |
| Humidity | %RH | `unit="%RH"` | ✅ |

**SHT31 Fazit:** ✅ **VOLLSTÄNDIG KORREKT**

---

## 2. BMP280/BME280 Verifikation

### 2.1 ESP32 Protokoll (i2c_sensor_protocol.cpp)

| Aspekt | BMP280 | BME280 | Status |
|--------|--------|--------|--------|
| Protocol Type | REGISTER_BASED | REGISTER_BASED | ✅ |
| Data Register | 0xF7 | 0xF7 | ✅ |
| Expected Bytes | 6 | 8 | ✅ |
| CRC | None | None | ✅ (Bosch hat kein CRC) |
| I2C Adressen | 0x76, 0x77 | 0x76, 0x77 | ✅ |

### 2.2 Kalibrierungsdaten - KRITISCHE ANALYSE

**Frage:** Werden die Bosch-Kalibrierungsdaten (dig_T1-T3, dig_P1-P9, dig_H1-H6) irgendwo verarbeitet?

**Antwort:** Die Kalibrierung erfolgt **ESP32-seitig** durch die Adafruit_BMP280 Library!

**Evidenz aus pressure.py (Zeile 11-12):**
```python
# ESP32-side processing (Adafruit_BMP280 library) already converts raw sensor
# data to hPa and °C, so server processors focus on: Validation, Calibration offset, Unit conversion
```

**Architektur-Entscheidung:**
```
BMP280/BME280 Flow:
┌──────────────┐    hPa, °C     ┌──────────────┐
│   ESP32      │  ──────────>   │   Server     │
│ Adafruit Lib │  (pre-conv.)   │  Validation  │
│ (Kompens.)   │                │  Unit Conv.  │
└──────────────┘                └──────────────┘
     ▲
     │ Liest Kalibrierungsregister
     │ 0x88-0x9F (Temp), 0xA1, 0xE1-0xE7 (Druck/Hum)
     ▼
┌──────────────┐
│  BMP280/     │
│  BME280      │
│  EEPROM      │
└──────────────┘
```

**Status:** ⚠️ **ARCHITEKTUR-ABWEICHUNG** - Aber funktional korrekt!
- BMP280/BME280 arbeiten NICHT im RAW-Mode (Pi-Enhanced)
- ESP32 macht die Bosch-Kompensation lokal
- Server empfängt bereits konvertierte Werte

### 2.3 Server Konvertierung (pressure.py)

**BMP280PressureProcessor:** ✅ Vorhanden (Zeile 50-421)
- Erwartet bereits konvertierte Werte in hPa
- Kein `raw_mode` Parameter
- Offset-Kalibrierung unterstützt
- Sea-Level Correction unterstützt

**BMP280TemperatureProcessor:** ✅ Vorhanden (Zeile 423-672)
- Erwartet bereits konvertierte Werte in °C
- Kein `raw_mode` Parameter
- Offset-Kalibrierung unterstützt

### 2.4 Messbereiche

| Wert | Erwartet | Implementiert | Status |
|------|----------|---------------|--------|
| Druck Min | 300 hPa | `PRESSURE_MIN = 300.0` | ✅ |
| Druck Max | 1100 hPa | `PRESSURE_MAX = 1100.0` | ✅ |
| Temp Min | -40°C | `TEMP_MIN = -40.0` | ✅ |
| Temp Max | +85°C | `TEMP_MAX = 85.0` | ✅ |

### 2.5 Einheiten

| Sensor | Standard | Unterstützt | Status |
|--------|----------|-------------|--------|
| Druck | hPa | hPa, Pa, mmHg, inHg | ✅ |
| Temperatur | °C | °C, °F, K | ✅ |

**BMP280/BME280 Fazit:** ⚠️ **FUNKTIONAL KORREKT, ABER ABWEICHENDE ARCHITEKTUR**

---

## 3. I2C-Adress-Handling - KRITISCHE FINDINGS

### 3.1 Unique Constraint (sensor.py Zeile 226)

```python
UniqueConstraint("esp_id", "gpio", "sensor_type", "onewire_address",
                 name="unique_esp_gpio_sensor_type_onewire")
```

**Problem:** `i2c_address` ist NICHT Teil des Unique Constraints!

**Implikation:**
- Zwei SHT31 auf 0x44 und 0x45 am selben GPIO können nicht als separate Sensoren gespeichert werden
- Der Constraint erlaubt nur (esp_id, gpio, sensor_type, onewire_address)

### 3.2 MQTT Payload (sensor_manager.cpp Zeile 1242-1310)

**Analyse des buildMQTTPayload():**

```cpp
// Felder die übertragen werden:
payload += "\"esp_id\":\"" + esp_id + "\",";
payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
payload += "\"subzone_id\":\"" + reading.subzone_id + "\",";
payload += "\"gpio\":" + String(reading.gpio) + ",";
payload += "\"sensor_type\":\"" + reading.sensor_type + "\",";
payload += "\"raw\":" + String(reading.raw_value) + ",";
// ...

// OneWire Address (nur für DS18B20)
if (!reading.onewire_address.isEmpty()) {
    payload += ",\"onewire_address\":\"" + reading.onewire_address + "\"";
}

// FEHLT: i2c_address wird NICHT übertragen!
```

**Status:** ❌ **KRITISCHER FEHLER** - `i2c_address` fehlt im MQTT-Payload!

### 3.3 Server Sensor Lookup (sensor_handler.py Zeile 156-184)

```python
if onewire_address:
    # OneWire: 4-way lookup
    sensor_config = await sensor_repo.get_by_esp_gpio_type_and_onewire(
        esp_device.id, gpio, sensor_type, onewire_address
    )
else:
    # Standard (inkl. I2C): 3-way lookup - KEIN i2c_address!
    sensor_config = await sensor_repo.get_by_esp_gpio_and_type(
        esp_device.id, gpio, sensor_type
    )
```

**Status:** ❌ **KRITISCHER FEHLER** - Server nutzt `i2c_address` nicht für Lookup!

### 3.4 Szenario-Test: 2× SHT31 auf 0x44 + 0x45

**Aktuelle Situation:**
1. ESP hat SHT31 auf 0x44 (sht31_temp) auf GPIO 21
2. ESP hat SHT31 auf 0x45 (sht31_temp) auf GPIO 21
3. Beide senden Daten mit identischem (esp_id, gpio, sensor_type)
4. Server kann diese NICHT unterscheiden!

**Ergebnis:**
- ❌ Können NICHT beide konfiguriert werden (DB Constraint Verletzung bei gleichem sensor_type)
- ❌ Daten werden NICHT korrekt unterschieden

---

## 4. Kritische Findings Zusammenfassung

### Finding #1: i2c_address fehlt im MQTT-Payload

**Schweregrad:** KRITISCH
**Betroffene Dateien:**
- `El Trabajante/src/services/sensor/sensor_manager.cpp` (buildMQTTPayload)
- `El Servador/.../mqtt/handlers/sensor_handler.py`

**Problem:**
Der ESP32 überträgt keine `i2c_address` im Sensor-Data MQTT-Payload. Der Server kann daher nicht zwischen zwei identischen I2C-Sensoren auf verschiedenen Adressen unterscheiden.

**Empfehlung:**
```cpp
// In buildMQTTPayload() hinzufügen:
if (reading.i2c_address != 0) {
    payload += ",\"i2c_address\":" + String(reading.i2c_address);
}
```

### Finding #2: i2c_address fehlt im DB Unique Constraint

**Schweregrad:** KRITISCH
**Betroffene Datei:** `El Servador/.../db/models/sensor.py`

**Problem:**
Der Unique Constraint `(esp_id, gpio, sensor_type, onewire_address)` enthält kein `i2c_address`. Zwei identische I2C-Sensoren auf verschiedenen Adressen können nicht koexistieren.

**Empfehlung:**
```python
# Option A: Separater I2C Constraint
UniqueConstraint("esp_id", "gpio", "sensor_type", "i2c_address",
                 name="unique_esp_gpio_sensor_type_i2c"),

# Option B: Kombinierter Constraint mit Partial Index
# (PostgreSQL specific - erlaubt NULL != NULL)
```

### Finding #3: BMP280/BME280 Architektur-Abweichung

**Schweregrad:** NIEDRIG (dokumentiert, funktional korrekt)
**Betroffene Dateien:**
- `El Servador/.../sensors/sensor_libraries/active/pressure.py`

**Problem:**
BMP280/BME280 arbeiten NICHT im Pi-Enhanced RAW-Mode. Die Bosch-Kompensation erfolgt ESP32-seitig durch die Adafruit-Library.

**Bewertung:**
- Architektonisch abweichend vom "Server-Centric" Prinzip
- ABER: Praktisch sinnvoll, da Bosch-Kompensation komplex ist
- Kalibrierungsdaten bleiben lokal auf ESP32
- Kein Änderungsbedarf, aber dokumentieren!

---

## 5. Vollständige Checkliste

### SHT31

- [x] Command korrekt: 0x2400
- [x] Timing korrekt: 16ms
- [x] CRC korrekt: 0x31, Init 0xFF
- [x] RAW-Extraktion: Temp Bytes 0-1, Hum Bytes 3-4
- [x] Temp-Formel: -45 + 175 × raw / 65535
- [x] Hum-Formel: 100 × raw / 65535
- [x] Einheiten: °C, %RH
- [x] Temp-Bereich: -40 bis +125°C validiert
- [x] Hum-Bereich: 0 bis 100% validiert + Clamping

### BMP280/BME280

- [x] Werden ausgelesen: JA (ESP32-seitig durch Adafruit-Library)
- [x] Wo verarbeitet: ESP32 (Adafruit_BMP280 Library)
- [ ] Server RAW-Mode: NEIN (nicht implementiert, nicht benötigt)
- [x] Einheiten: Druck = hPa, Temp = °C
- [x] Druck-Bereich: 300-1100 hPa validiert
- [x] Temp-Bereich: -40 bis +85°C validiert

### I2C-Adress-Handling

- [ ] i2c_address ist Teil des Keys: **NEIN**
- [ ] Aktueller Constraint: `(esp_id, gpio, sensor_type, onewire_address)`
- [ ] i2c_address wird übertragen: **NEIN**
- [ ] Server nutzt i2c_address für Lookup: **NEIN**
- [ ] Szenario 2× SHT31 funktioniert: **NEIN**

---

## 6. Empfehlungen nach Priorität

### Priorität 1: MQTT-Payload erweitern (KRITISCH)

**Änderung in sensor_manager.cpp:**
```cpp
// In SensorReading struct hinzufügen:
uint8_t i2c_address;  // I2C address (0 if not I2C)

// In buildMQTTPayload() hinzufügen:
if (reading.i2c_address != 0) {
    payload += ",\"i2c_address\":" + String(reading.i2c_address);
}
```

### Priorität 2: DB Schema erweitern (KRITISCH)

**Änderung in sensor.py:**
```python
# Neuer Constraint (beachte: separate Constraints für I2C und OneWire)
__table_args__ = (
    # OneWire: Unique per (esp, gpio, type, onewire_address)
    UniqueConstraint("esp_id", "gpio", "sensor_type", "onewire_address",
                     name="unique_esp_gpio_sensor_type_onewire"),
    # I2C: Unique per (esp, gpio, type, i2c_address) - nur wenn i2c_address NOT NULL
    # Benötigt PostgreSQL Partial Index oder CHECK Constraint
    Index("idx_sensor_type_enabled", "sensor_type", "enabled"),
)
```

### Priorität 3: Server Lookup erweitern (KRITISCH)

**Änderung in sensor_handler.py:**
```python
# I2C-Adresse aus Payload extrahieren
i2c_address = payload.get("i2c_address")

if i2c_address:
    # I2C Sensor: 4-way lookup
    sensor_config = await sensor_repo.get_by_esp_gpio_type_and_i2c(
        esp_device.id, gpio, sensor_type, i2c_address
    )
elif onewire_address:
    # OneWire: 4-way lookup
    sensor_config = await sensor_repo.get_by_esp_gpio_type_and_onewire(...)
else:
    # Analog/Digital: 3-way lookup
    sensor_config = await sensor_repo.get_by_esp_gpio_and_type(...)
```

### Priorität 4: Dokumentation (NIEDRIG)

Die BMP280/BME280 Architektur-Entscheidung sollte dokumentiert werden:
- In CLAUDE.md oder separater Architektur-Dokumentation
- Hinweis dass Bosch-Sensoren ESP32-seitig kompensiert werden
- Begründung: Komplexität der Bosch-Formeln

---

## Anhang: Referenzdaten

### SHT31 Datenblatt-Werte
- Sensirion SHT3x-DIS Datasheet, Version 6, March 2020
- Temperatur: T[°C] = -45 + 175 × (raw / 65535)
- Humidity: RH[%] = 100 × (raw / 65535)
- CRC-8 Polynomial: 0x31, Init: 0xFF

### BMP280 Datenblatt-Werte
- Bosch BMP280 Datasheet BST-BMP280-DS001-26
- Kalibrierungsregister: 0x88-0x9F (Temp: dig_T1-T3), 0xA1, 0xE1-0xE7 (Pressure: dig_P1-P9)
- Kompensationsformel: Section 3.11.3 (ca. 50 Zeilen C-Code)

### BME280 Datenblatt-Werte
- Bosch BME280 Datasheet BST-BME280-DS002-15
- Zusätzliche Humidity-Kalibrierung: dig_H1-H6
- Kompensationsformel: Section 4.2

---

**Report Ende**
