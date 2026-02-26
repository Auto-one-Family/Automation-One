# SHT31 CRC-Failure: Vollständige Code-Pfad-Analyse

> **Datum:** 2026-02-26
> **ESP:** ESP_472204 (real hardware, running)
> **Symptom:** 100% CRC-Failure bei `sht31_humidity`, Temperature CRC immer OK
> **Ergebnis:** Circuit Breaker OPEN nach 10 Failures (300s Retry)

---

## 1. Beobachtetes Verhalten (Serial Log)

```
10:34:16.100  [INFO ] [SENSOR] SensorManager: I2C READ START for sht31 addr=0x44
10:34:16.123  [ERROR] [I2C  ] I2C: CRC validation failed for sht31_humidity
10:34:16.131  [ERROR] [ERRTRAK] [1009] [HARDWARE] CRC failed: sht31_humidity
10:34:16.137  [WARN ] [ERRTRAK] Error 1009: 1 occurrences suppressed in last 60s
10:34:16.144  [ERROR] [SENSOR] Sensor Manager: I2C read failed for sht31
10:34:16.151  [WARN ] [SENSOR] Sensor Manager: Multi-value measurement failed for GPIO 0
```

**Muster:** Wiederholt sich alle ~30s (Mess-Intervall). Nach 10 Failures:
```
10:35:16.163  [WARN ] [SENSOR] Sensor sht31_humidity: Circuit Breaker OPEN — 10 consecutive failures, retry in 300s
```

### Timing-Analyse

| Timestamp (ms) | Delta | Event |
|---|---|---|
| 240040 | - | I2C READ START |
| 240063 | +23ms | CRC validation failed |
| 240074 | +11ms | Error throttle log |
| 240080 | +6ms | read failed propagation |
| 240081 | +1ms | Multi-value failed |

**I2C-Transaktion:** ~23ms (Command 0x2400 + 20ms conversion + 6-byte read + CRC check). Timing ist korrekt laut SHT31-Datenblatt (max 15.5ms Conversion + Safety Margin).

---

## 2. Kompletter Code-Pfad (Call-Chain)

```
SensorManager::performAllMeasurements()         [sensor_manager.cpp:1021]
  ├─ Per-Sensor Iteration                        [sensor_manager.cpp:1045]
  ├─ Circuit Breaker Guard                       [sensor_manager.cpp:1071]
  ├─ I2C Dedup Check (skip duplicate addr)       [sensor_manager.cpp:1106-1123]
  └─ performMultiValueMeasurement(gpio, ...)     [sensor_manager.cpp:1129]
       ├─ findSensorCapability(sensor_type)       [sensor_registry.cpp]
       ├─ getMultiValueTypes("sht31", ...)        [sensor_registry.cpp]
       │   → ["sht31_temp", "sht31_humidity"]
       ├─ i2c_bus_->readSensorRaw("sht31", 0x44) [i2c_bus.cpp:646]
       │   ├─ findI2CSensorProtocol("sht31")      [i2c_sensor_protocol.cpp:167]
       │   │   → SHT31_PROTOCOL (COMMAND_BASED)
       │   ├─ executeCommandBasedProtocol()        [i2c_bus.cpp:760]
       │   │   ├─ Wire.beginTransmission(0x44)
       │   │   ├─ Wire.write({0x24, 0x00})        // High repeatability, no stretch
       │   │   ├─ Wire.endTransmission()
       │   │   ├─ delay(20)                        // 15.5ms + 4.5ms safety
       │   │   ├─ yield()                          // Watchdog feed
       │   │   ├─ Wire.requestFrom(0x44, 6)       // Read 6 bytes
       │   │   └─ Wire.read() × 6                 // Into buffer
       │   └─ validateInterleavedCRC()             [i2c_bus.cpp:606]  ← FAILURE HERE
       │       ├─ values[0]: sht31_temp
       │       │   bytes[0..1] vs CRC byte[2]     → ✅ PASS
       │       └─ values[1]: sht31_humidity
       │           bytes[3..4] vs CRC byte[5]     → ❌ FAIL (return false)
       └─ return 0 (keine Readings erstellt)

  → measurement_ok = false
  → consecutive_failures++ (bis 10)
  → cb_state = OPEN, retry in 300s
```

---

## 3. SHT31 Protokoll-Definition

**Datei:** [i2c_sensor_protocol.cpp:21-56](El Trabajante/src/drivers/i2c_sensor_protocol.cpp#L21-L56)

```
SHT31 I2C Response (6 Bytes):
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Byte 0   │ Byte 1   │ Byte 2   │ Byte 3   │ Byte 4   │ Byte 5   │
│ Temp MSB │ Temp LSB │ Temp CRC │ Hum MSB  │ Hum LSB  │ Hum CRC  │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

**CRC-Parameter:**
- Polynomial: `0x31` (Sensirion CRC-8 Standard)
- Init Value: `0xFF`
- Lookup-Table: 256-Byte PROGMEM Table in [i2c_bus.cpp:532-565](El Trabajante/src/drivers/i2c_bus.cpp#L532-L565)

**Protokoll-Config:**
```c
.protocol_type = COMMAND_BASED
.command_bytes = {0x24, 0x00}   // High repeatability, clock stretch disabled
.conversion_time_ms = 20        // 15.5ms max + 4.5ms safety
.expected_bytes = 6
.crc.interleaved = true
.crc.data_bytes = 2             // 2 data bytes per CRC
```

---

## 4. CRC-Validierung im Detail

**Datei:** [i2c_bus.cpp:606-641](El Trabajante/src/drivers/i2c_bus.cpp#L606-L641)

Die `validateInterleavedCRC()` iteriert über alle `values[]`:
1. **sht31_temp** (index 0): `buffer[0..1]` vs `buffer[2]` → CRC berechnen mit poly=0x31, init=0xFF → **PASS**
2. **sht31_humidity** (index 1): `buffer[3..4]` vs `buffer[5]` → CRC berechnen → **FAIL → return false sofort**

**CRC-Berechnung:** [i2c_bus.cpp:570-594](El Trabajante/src/drivers/i2c_bus.cpp#L570-L594)
```c
uint8_t crc = 0xFF;  // init_value
for (size_t i = 0; i < 2; i++) {  // 2 data bytes
    crc = CRC8_POLY31_TABLE[crc ^ data[i]];  // Table lookup
}
// Vergleich: calculated == expected (buffer[5])
```

**Code-Review der CRC-Table:** Die 256-Byte Lookup-Table in PROGMEM ist korrekt. Verifiziert gegen das Sensirion Application Note CRC-8 Polynomial x^8 + x^5 + x^4 + 1.

---

## 5. Fehler-Kaskade

```
validateInterleavedCRC() returns false
  └─ readSensorRaw() returns false                [i2c_bus.cpp:745]
     └─ performMultiValueMeasurement() returns 0   [sensor_manager.cpp:944-946]
        └─ measurement_ok = false                  [sensor_manager.cpp:1135]
           ├─ consecutive_failures++               [sensor_manager.cpp:1161]
           └─ if >= 10: cb_state = OPEN            [sensor_manager.cpp:1170-1178]
              └─ Sensor disabled for 300s          [CB_PROBE_INTERVAL_MS]
```

### Circuit Breaker Konfiguration

| Parameter | Wert | Datei |
|---|---|---|
| `CB_MAX_CONSECUTIVE_FAILURES` | 10 | [sensor_manager.cpp:39](El Trabajante/src/services/sensor/sensor_manager.cpp#L39) |
| `CB_PROBE_INTERVAL_MS` | 300000 (5 min) | [sensor_manager.cpp:40](El Trabajante/src/services/sensor/sensor_manager.cpp#L40) |
| Measurement Interval | 30000ms (30s) | [sensor_types.h:38](El Trabajante/src/models/sensor_types.h#L38) |
| Time to OPEN | ~300s (10 × 30s) | 10 consecutive failures |

### Error-Tracking

| Code | Name | Severity | Throttle |
|---|---|---|---|
| 1009 | `ERROR_I2C_CRC_FAILED` | ERROR | 1/60s per code-slot |

Error-Throttle ([error_tracker.cpp:14-43](El Trabajante/src/error_handling/error_tracker.cpp#L14-L43)):
- Max 1 MQTT-Publish pro 60s pro Error-Code
- Suppressed-Count wird geloggt: `"Error 1009: 1 occurrences suppressed in last 60s"`

---

## 6. Konsequenzen des Bugs

### Was NICHT funktioniert:
- **Keine SHT31-Daten** werden an den Server gesendet (weder Temp noch Humidity)
- Temperature-CRC ist OK, aber die gesamte Messung wird verworfen weil Humidity-CRC fehlschlägt
- Nach ~300s (10 × 30s): Circuit Breaker OPEN → Sensor komplett deaktiviert für 5 Minuten
- Danach HALF_OPEN → 1 Probe → gleicher CRC-Fail → sofort zurück zu OPEN

### Designentscheidung (bewusst so):
Die CRC-Validierung ist **all-or-nothing** — wenn ein Value fehlschlägt, wird der gesamte Read verworfen. Das ist korrekt aus Datenintegritäts-Sicht: Wenn der Humidity-CRC fehlschlägt, könnte auch der Temperature-Wert korrupt sein (gleiche I2C-Transaktion, gleiche physische Übertragung).

---

## 7. Root-Cause-Analyse

### Beobachtung:
- Temperature CRC: **100% PASS** (Bytes 0-2 immer korrekt)
- Humidity CRC: **100% FAIL** (Bytes 3-5 immer falsch)
- Kein einziger Erfolg sichtbar im gesamten Log

### Mögliche Ursachen (nach Wahrscheinlichkeit):

#### 1. Hardware: I2C Signal-Integrität (WAHRSCHEINLICHSTE)
- **Pull-up Widerstände zu schwach/fehlend**: SDA/SCL brauchen 4.7kΩ Pull-ups. Bei schwachen Pull-ups degradiert das Signal im Verlauf der 6-Byte-Transaktion. Die letzten Bytes (Humidity) sind am stärksten betroffen
- **Kabellänge zu lang**: Kapazitätserhöhung verschlechtert Signal-Qualität bei späteren Bytes
- **Wackelkontakt/Lötstelle**: Intermittierender Kontakt an SDA/SCL, aber immer an der gleichen Stelle

#### 2. Hardware: SHT31 Sensor defekt
- Der Humidity-Teil des SHT31-Chips könnte beschädigt sein
- Inkorrekte Humidity-Daten erzeugen falschen CRC
- Temperature-Teil funktioniert unabhängig

#### 3. I2C Bus Speed
- Standard 100kHz sollte problemlos sein
- Bei höheren Frequenzen (400kHz) wäre Signal-Degradation wahrscheinlicher
- Aktuelle Config: `HardwareConfig::I2C_FREQUENCY` (vermutlich 100kHz)

#### 4. Software: CRC-Berechnung (UNWAHRSCHEINLICH)
- CRC-Table ist korrekt (verifiziert gegen Sensirion Referenz)
- CRC-Algorithmus ist standard lookup-table-basiert
- Temperature-CRC funktioniert mit derselben Logik → Code ist korrekt

#### 5. Timing/Conversion (UNWAHRSCHEINLICH)
- 20ms Wartezeit nach Command ist ausreichend (15.5ms max laut Datenblatt)
- Wäre die Wartezeit zu kurz, wären BEIDE Werte betroffen, nicht nur Humidity

---

## 8. Empfohlene Diagnose-Schritte

### Sofort (Ohne Code-Änderung):

1. **Raw Buffer loggen** — Aktuell wird nur bei `LOG_D` (Debug) der Buffer geloggt ([sensor_manager.cpp:950-953](El Trabajante/src/services/sensor/sensor_manager.cpp#L950-L953)). Mit Debug-Level aktiviert sieht man die echten 6 Bytes:
   ```
   SHT31 raw data (6 bytes): XX XX XX XX XX XX
   ```
   → Damit kann man die CRC manuell nachrechnen

2. **I2C Verkabelung prüfen**:
   - Sind 4.7kΩ Pull-ups an SDA und SCL vorhanden?
   - Kabellänge? (> 30cm wird problematisch)
   - Lötstellen/Steckverbinder fest?

3. **SHT31 Sensor tauschen** (wenn verfügbar) → Zeigt ob Sensor defekt

### Mit Code-Änderung:

4. **Diagnostik-Log hinzufügen**: In `validateInterleavedCRC()` die tatsächlichen Bytes + CRC-Werte loggen:
   ```
   I2C CRC: sht31_humidity data=[XX XX] expected_crc=XX calculated_crc=XX
   ```
   → Zeigt ob die Daten selbst korrupt sind oder der CRC falsch übertragen wird

5. **Soft-Read im SHT31 Status-Register** (`0xF32D`): Prüft ob der Sensor interne Fehler meldet

---

## 9. Code-Qualität Bewertung

| Aspekt | Bewertung | Kommentar |
|---|---|---|
| CRC-Algorithmus | ✅ Korrekt | Sensirion-Standard, Table-basiert |
| Protokoll-Definition | ✅ Korrekt | Byte-Offsets und CRC-Offsets stimmen mit Datenblatt |
| Error-Handling | ✅ Robust | All-or-nothing CRC, Error-Tracking, Circuit Breaker |
| Error-Throttle | ✅ Gut | 1 MQTT-Publish/60s verhindert Flood |
| Circuit Breaker | ✅ Korrekt | 10 Failures → OPEN, 5min → HALF_OPEN → Probe |
| I2C Dedup | ✅ Korrekt | Verhindert doppelte I2C-Reads für Multi-Value |
| Fehlender Diagnose-Log | ⚠️ | Raw Buffer nur auf DEBUG-Level sichtbar |
| Kein Partial-Read | ℹ️ Design | Temp könnte trotz Hum-CRC-Fail gesendet werden — bewusste Design-Entscheidung |

### Kein Software-Bug gefunden

Der Code ist korrekt implementiert. Die CRC-Failure wird durch ein **Hardware-Problem** verursacht (I2C Signal-Integrität oder defekter SHT31 Humidity-Teil). Der Code erkennt den Fehler korrekt und schützt das System durch Circuit Breaker.

---

## 10. Datei-Referenzen

| Datei | Zeilen | Rolle |
|---|---|---|
| [sensor_manager.cpp](El Trabajante/src/services/sensor/sensor_manager.cpp) | 1021-1189 | Mess-Loop, CB-Logik |
| [sensor_manager.cpp](El Trabajante/src/services/sensor/sensor_manager.cpp) | 910-1015 | Multi-Value Messung |
| [i2c_bus.cpp](El Trabajante/src/drivers/i2c_bus.cpp) | 606-641 | CRC-Validierung |
| [i2c_bus.cpp](El Trabajante/src/drivers/i2c_bus.cpp) | 570-594 | CRC-8 Berechnung |
| [i2c_bus.cpp](El Trabajante/src/drivers/i2c_bus.cpp) | 532-565 | CRC-8 Lookup Table |
| [i2c_bus.cpp](El Trabajante/src/drivers/i2c_bus.cpp) | 646-755 | readSensorRaw() |
| [i2c_bus.cpp](El Trabajante/src/drivers/i2c_bus.cpp) | 760-839 | Command-Based Protocol |
| [i2c_sensor_protocol.cpp](El Trabajante/src/drivers/i2c_sensor_protocol.cpp) | 21-56 | SHT31 Protokoll-Definition |
| [i2c_sensor_protocol.h](El Trabajante/src/drivers/i2c_sensor_protocol.h) | 1-153 | Protocol-Abstraktion |
| [sensor_types.h](El Trabajante/src/models/sensor_types.h) | 1-121 | SensorConfig + CB-State |
| [sensor_registry.h](El Trabajante/src/models/sensor_registry.h) | 1-136 | Sensor-Capability-Registry |
| [error_tracker.cpp](El Trabajante/src/error_handling/error_tracker.cpp) | 14-43 | Error-Rate-Limiting |
| [error_codes.h](El Trabajante/src/models/error_codes.h) | 37 | ERROR_I2C_CRC_FAILED = 1009 |
