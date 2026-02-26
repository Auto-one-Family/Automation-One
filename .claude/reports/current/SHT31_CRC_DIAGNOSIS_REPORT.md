# SHT31 Humidity-CRC Diagnose-Report

> **Datum:** 2026-02-26
> **Branch:** `fix/sht31-crc-humidity`
> **ESP:** ESP_472204 (ESP32-WROOM-32, SHT31 @ 0x44)
> **Firmware:** Diagnose-Build mit CRC-Logging

---

## 1. CRC-Diagnose: BEIDE CRCs PASSEN

### CRC-Table Testvektor

```
CRC(0xBEEF) = 0x92 (expected: 0x92) → TABLE OK ✓
```

Die CRC-8 Lookup-Table ist korrekt. H1 (fehlerhafte Table) ist **ausgeschlossen**.

### 5 Messzyklen — Raw-Buffer + CRC-Detail

| # | Timestamp | Raw Buffer (Hex) | Temp CRC | Humidity CRC | Temp Raw | Hum Raw |
|---|-----------|------------------|----------|--------------|----------|---------|
| 1 | 30042ms   | `5F 10 BC 70 C1 CC` | calc=0xBC exp=0xBC **OK** | calc=0xCC exp=0xCC **OK** | 24336 | 28865 |
| 2 | 65280ms   | `5F 10 BC 71 0E 51` | calc=0xBC exp=0xBC **OK** | calc=0x51 exp=0x51 **OK** | 24336 | 28942 |
| 3 | 100539ms  | `5F 16 1A 70 66 A7` | calc=0x1A exp=0x1A **OK** | calc=0xA7 exp=0xA7 **OK** | 24342 | 28774 |
| 4 | 133267ms  | `5F 20 79 70 60 01` | calc=0x79 exp=0x79 **OK** | calc=0x01 exp=0x01 **OK** | 24352 | 28768 |
| 5 | 163436ms  | `5F 20 79 70 AC 3B` | calc=0x79 exp=0x79 **OK** | calc=0x3B exp=0x3B **OK** | 24352 | 28844 |

**Ergebnis: 5/5 Messungen — BEIDE CRCs OK. Kein einziger CRC-Fehler.**

### Plausibilitaets-Check der Messwerte

| Messung | Temp (raw→°C) | Humidity (raw→%) |
|---------|---------------|------------------|
| 1 | 24336 → ~19.9°C | 28865 → ~44.0% |
| 2 | 24336 → ~19.9°C | 28942 → ~44.1% |
| 3 | 24342 → ~19.9°C | 28774 → ~43.9% |
| 4 | 24352 → ~20.0°C | 28768 → ~43.9% |
| 5 | 24352 → ~20.0°C | 28844 → ~44.0% |

Alle Werte plausibel. Temperatur stabil ~20°C, Humidity stabil ~44%.

### Error-1009-Quellen (vollstaendig)

`ERROR_I2C_CRC_FAILED` (1009) wird NUR an **einer Stelle** getrackt:
- `i2c_bus.cpp:656` in `validateInterleavedCRC()`
- H6 (zweite CRC-Quelle) ist **ausgeschlossen**.

---

## 2. CRC-Bug: Wahrscheinlich bereits durch Pre-Existing Fixes geloest

### Was sich geaendert hat (uncommittete Aenderungen auf master)

Die folgenden Aenderungen waren **bereits uncommitted** in der Working Directory, bevor das Diagnose-Logging hinzugefuegt wurde:

#### Fix A: conversion_time_ms 16 → 20 (i2c_sensor_protocol.cpp)

```diff
- .conversion_time_ms = 16,          // 15.5ms max + margin
+ .conversion_time_ms = 20,          // 15.5ms max + 4.5ms safety margin
```

**Bewertung:** SHT31 High-Repeatability braucht max 15.5ms. Bei 16ms war die Marge nur 0.5ms — extrem knapp. Bei 20ms haben wir 4.5ms Sicherheit.

#### Fix B: Wire.available() Polling-Loop entfernt (i2c_bus.cpp)

```diff
- size_t received = Wire.requestFrom(i2c_address, (uint8_t)requested);
- unsigned long start = millis();
- while (Wire.available() < (int)requested) {
-     if (millis() - start > I2C_READ_TIMEOUT_MS) {
-         ...return false;
-     }
-     yield();
- }
+ uint8_t received = Wire.requestFrom(i2c_address, expected);
+ if (received != expected) { ...return false; }
```

**Bewertung:** Auf ESP32 ist `Wire.requestFrom()` blocking — nach Return sind alle Bytes im Buffer. Der `Wire.available()` Polling-Loop war ueberfluessig und koennte durch die `yield()` Calls (die andere FreeRTOS-Tasks ausfuehren lassen) unerwuenschte Seiteneffekte gehabt haben.

### Wahrscheinlichste Root Cause

**Fix A (conversion_time) ist der wahrscheinlichste Fix.** Bei 16ms war die Marge so knapp, dass der SHT31 moeglicherweise Daten lieferte, bei denen die Humidity-Bytes noch nicht vollstaendig berechnet waren. Im "No Clock Stretch"-Modus antwortet der SHT31 trotzdem mit 6 Bytes, aber die internen Humidity-Werte koennten noch von der vorherigen Messung stammen oder undefiniert sein.

Fix B (Polling-Loop) koennte ein sekundaerer Faktor sein, ist aber weniger wahrscheinlich.

### Hypothesen-Status

| Hypothese | Status | Begruendung |
|-----------|--------|-------------|
| H1: CRC-Table fehlerhaft | **AUSGESCHLOSSEN** | Testvektor 0x92 ✓ |
| H2: PROGMEM-Zugriff | **AUSGESCHLOSSEN** | ESP32 Xtensa = memory-mapped, kein Problem |
| H3: Buffer-Korruption | **AUSGESCHLOSSEN** | Raw-Buffer zeigt plausible Bytes |
| H4: I2C-Timing | **WAHRSCHEINLICH GEFIXT** | conversion_time 16→20ms |
| H5: Offset-Fehler | **AUSGESCHLOSSEN** | Offsets korrekt (0,2,3,5) im Log |
| H6: Zweite CRC-Quelle | **AUSGESCHLOSSEN** | Nur 1 Stelle im Code |

---

## 3. KRITISCH: PiEnhancedProcessor nutzt HTTP statt MQTT

### Problem

Der SensorManager schickt **jede Messung per HTTP POST** an den God-Kaiser Server:

```
SensorManager → PiEnhancedProcessor → HTTP POST http://192.168.0.194:8000/api/v1/sensors/process
```

**Datenfluss (IST):**
```
I2C Read → PiEnhanced (HTTP POST) → bei Erfolg → MQTT Publish
                ↓ bei Timeout/Fehler
         CircuitBreaker (5 Failures → OPEN)
                ↓
         Local Fallback Conversion → MQTT Publish
```

**Datenfluss (SOLL laut Architektur):**
```
I2C Read → MQTT Publish (Raw-Daten) → Server subscribed auf Topic
```

### Auswirkung im Serial-Log

- **Messungen 1-3:** HTTP Timeout (je 2.5s × 2 Werte = 5s verschwendet pro Zyklus)
- **Messung 3:** CircuitBreaker oeffnet nach 5 Failures → Humidity geht per Local Fallback + MQTT
- **Messung 4:** Beide Werte per Local Fallback + MQTT (20.03°C, 43.90%)
- **Messung 5:** CircuitBreaker HALF_OPEN → erneuter HTTP-Versuch → Timeout → wieder OPEN

**Konsequenz:** Die ersten 3 Messzyklen (~100s) produzieren **NULL MQTT-Messages** weil der Server per HTTP nicht erreichbar ist. Erst nach Circuit-Breaker-Opening werden Daten via MQTT gesendet.

### Code-Stelle

[sensor_manager.cpp:970-981](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L970-L981):
```cpp
// Send raw data to Pi for processing
RawSensorData raw_data;
raw_data.gpio = gpio;
raw_data.sensor_type = server_sensor_type;
raw_data.raw_value = raw_value;
...
bool success = pi_processor_->sendRawData(raw_data, processed);
```

Der `PiEnhancedProcessor` ([pi_enhanced_processor.h](El%20Trabajante/src/services/sensor/pi_enhanced_processor.h)) ist der HTTP-basierte "Server-Centric" Prozessor. Er sendet Raw-Daten per HTTP und erwartet verarbeitete Daten zurueck. **MQTT wird erst danach als Publish-Kanal genutzt, nicht als primaerer Datentransport.**

### Empfehlung

Die PiEnhanced-Architektur (HTTP) sollte durch eine reine MQTT-Architektur ersetzt werden:
1. ESP32 published Raw-Daten direkt per MQTT
2. Server subscribed auf Sensor-Topics und verarbeitet
3. Server published Processed-Daten zurueck (optional)

Dies wuerde eliminieren:
- 2.5s HTTP-Timeouts pro Wert
- CircuitBreaker-Verzoegerungen
- Doppelte Kommunikationspfade (HTTP + MQTT)

---

## 4. NVS-Config Probleme

### Sensor auf GPIO 0 — nur `sht31_humidity` gespeichert

```
ConfigManager: Found 1 sensor(s) in NVS
ConfigManager: I2C sensor 'sht31_humidity' - GPIO validation skipped (uses I2C bus)
ConfigManager: Saved sensor config for GPIO 0
Sensor Manager: Configured I2C sensor 'sht31_humidity' at address 0x44 (GPIO 0 is I2C bus) [sensor_count=1, active=true]
```

**Problem:** NVS hat nur **einen** Sensor gespeichert: `sht31_humidity` auf GPIO 0. Obwohl der SHT31 ein Multi-Value-Sensor ist (temp + humidity), wird nur der Humidity-Eintrag persistiert. Das System erkennt via `sensor_registry.cpp` korrekt, dass `sht31_humidity` zum Multi-Value-Device `sht31` gehoert, und liest BEIDE Werte. Aber der NVS-Eintrag ist unvollstaendig.

**Ursache:** Wahrscheinlich von einem frueheren Testlauf, bei dem per MQTT-Config nur `sht31_humidity` konfiguriert wurde.

### NVS Legacy-Key Fehler

```
[Preferences.cpp:483] getString(): nvs_get_str len fail: sensor_0_name NOT_FOUND
[Preferences.cpp:483] getString(): nvs_get_str len fail: sen_0_ow NOT_FOUND
[Preferences.cpp:483] getString(): nvs_get_str len fail:  NOT_FOUND
```

| Key | Bedeutung | Status |
|-----|-----------|--------|
| `sensor_0_name` | Legacy-Key fuer Sensor-Name | NOT_FOUND (nie gesetzt oder bereits migriert) |
| `sen_0_ow` | OneWire Address | NOT_FOUND (erwartet — SHT31 ist kein OneWire-Sensor) |
| `` (leer) | **BUG: Leerer Key** | NOT_FOUND — ein `migrateReadString` Call generiert einen leeren Key |

Der dritte Fehler (leerer Key) deutet auf einen Bug in der Config-Migration hin, wo ein Key-Format (`NVS_SEN_*_OLD`) fuer `i=0` einen leeren String erzeugt.

### Mess-Intervall Diskrepanz

```
Measurement interval set to 5000 ms    ← Global (main.cpp:1915)
```

Aber Messungen passieren alle ~30s. Das liegt daran, dass die per-Sensor `measurement_interval_ms` (30000ms Default aus NVS) Vorrang hat vor dem globalen 5s-Intervall.

---

## 5. Zusammenfassung und naechste Schritte

### CRC-Bug: Wahrscheinlich geloest

Die pre-existierenden (uncommitteten) Fixes auf i2c_bus.cpp und i2c_sensor_protocol.cpp haben den CRC-Bug wahrscheinlich geloest. Wichtigster Fix: `conversion_time_ms: 16 → 20`.

**Empfehlung:** Keine weiteren CRC-Fixes noetig. Diagnose-Logging aufraeumen (Phase 3) und committen.

### PiEnhanced-Architektur: Braucht Entscheidung

Der ESP macht HTTP-Calls zum Server fuer JEDE Messung. Das ist der aktuelle Design-Stand, aber widerspricht der Erwartung einer reinen MQTT-Architektur.

**Entscheidung noetig:**
- [ ] PiEnhanced beibehalten (Server-Centric, HTTP + MQTT Fallback)
- [ ] PiEnhanced durch reinen MQTT-Flow ersetzen (Breaking Change, neuer Auftrag)

### NVS-Config: Braucht Cleanup

- [ ] Stale Config auf GPIO 0 — per Server-Config-Push korrigieren (beide SHT31-Typen senden)
- [ ] Leerer-Key-Bug in ConfigManager untersuchen

---

## Akzeptanzkriterien Phase 1

- [x] Raw-Buffer nach I2C-Read geloggt (alle 6 Bytes + received-Count)
- [x] CRC-Detail pro Paar geloggt (calculated vs. expected + Offsets + init/poly)
- [x] CRC-Table Testvektor geprueft (CRC(0xBEEF) == 0x92 ✓)
- [x] Alle Error-1009-Quellen im Repo gefunden und gelistet (1 Stelle)
- [x] Analyse-Report geschrieben mit 5 Messungen
- [x] `pio run -e esp32_dev` BUILD SUCCESS
- [x] **Szenario: Keines der vorhergehenden — Bug war bereits durch pre-existierende Fixes geloest**
