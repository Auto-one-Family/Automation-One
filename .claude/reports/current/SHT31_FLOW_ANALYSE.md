# SHT31 End-to-End Flow-Analyse

**Datum:** 2026-02-25
**Analyst:** Claude Code (Opus 4.6)
**Kontext:** ESP_472204 + SHT31-D, erster Hardware-Test, 0 Sensordaten, Error 1007 (I2C_TIMEOUT)
**Status:** ANALYSE ABGESCHLOSSEN — Exakter Bruchpunkt identifiziert

---

## 1. Flow-Diagramm (Kompletter Datenpfad)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SHT31 DATENFLUSS                                │
│                                                                        │
│  [SHT31 Chip]                                                          │
│      │                                                                 │
│      │ I2C (0x44)                                                      │
│      ▼                                                                 │
│  [i2c_bus.cpp] executeCommandBasedProtocol()                           │
│      │  1. Wire.beginTransmission(0x44)                                │
│      │  2. Wire.write(0x24); Wire.write(0x00)  ← Command: High Rep.   │
│      │  3. Wire.endTransmission()              ← Returns 0 (ACK!) ✅  │
│      │  4. delay(16)                           ← Conversion wait       │
│      │  5. Wire.requestFrom(0x44, 6)           ← Request 6 bytes      │
│      │  6. Wire.available() polling loop       ← ❌ TIMEOUT HERE ❌   │
│      │     → ERROR_I2C_TIMEOUT (1007)                                  │
│      │     → attemptRecoveryIfNeeded(5)                                │
│      │     → return false                                              │
│      ▼                                                                 │
│  [sensor_manager.cpp] performMultiValueMeasurement()                   │
│      │  readSensorRaw() returned false → return 0                      │
│      │  → NO readings created                                          │
│      │  → NO MQTT publish                                              │
│      │  → NO HTTP to PiEnhancedProcessor                               │
│      ▼                                                                 │
│  ════════════════ FLOW ENDET HIER ══════════════════                   │
│                                                                        │
│  --- Was DANACH passieren WÜRDE (bei Erfolg): ---                      │
│                                                                        │
│  [sensor_manager.cpp] performMultiValueMeasurement()                   │
│      │  extractRawValue("sht31", "sht31_temp", buffer, 6)             │
│      │  extractRawValue("sht31", "sht31_humidity", buffer, 6)         │
│      ▼                                                                 │
│  [pi_enhanced_processor.cpp] sendRawData()                             │
│      │  HTTP POST → http://<server>:8000/api/v1/sensors/process        │
│      │  Payload: {esp_id, gpio, sensor_type:"sht31_temp", raw_value}   │
│      ▼                                                                 │
│  [sensor_processing.py] POST /api/v1/sensors/process                   │
│      │  LibraryLoader.get_processor("sht31_temp")                      │
│      │  → SHT31TemperatureProcessor.process(raw, raw_mode=True)        │
│      │  → temp = -45 + (175 * raw / 65535)                             │
│      │  Response: {processed_value, unit:"°C", quality:"good"}         │
│      ▼                                                                 │
│  [sensor_manager.cpp] buildMQTTPayload() → publishSensorReading()      │
│      │  Topic: kaiser/god/esp/ESP_472204/sensor/{gpio}/data            │
│      │  Payload: {esp_id, sensor_type, raw, value, unit, quality, ts}  │
│      ▼                                                                 │
│  [sensor_handler.py] handle_sensor_data()                              │
│      │  1. Parse topic → esp_id, gpio                                  │
│      │  2. Validate payload (incl. raw_mode=true check)                │
│      │  3. Lookup ESP device + sensor config (I2C 4-way lookup)        │
│      │  4. Pi-Enhanced processing (server-side, redundant)             │
│      │  5. Physical range validation (-40°C to 125°C)                  │
│      │  6. Save to sensor_data table                                   │
│      │  7. WebSocket broadcast ("sensor_data" event)                   │
│      │  8. Logic Engine trigger (non-blocking)                         │
│      ▼                                                                 │
│  [PostgreSQL] sensor_data INSERT                                       │
│  [WebSocket] broadcast to Dashboard                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Exakter Bruchpunkt

### Lokation

**Datei:** `El Trabajante/src/drivers/i2c_bus.cpp`, Zeilen 822-837
**Funktion:** `executeCommandBasedProtocol()`
**Schritt:** Step 3 — Nach `Wire.requestFrom()`, im `Wire.available()` Polling-Loop

### Was genau passiert

```
Schritt 1: Wire.beginTransmission(0x44)     → OK
Schritt 2: Wire.write(0x24, 0x00)           → OK (Command gesendet)
Schritt 3: Wire.endTransmission()           → Returns 0 (ACK!) ✅
Schritt 4: delay(16)                        → 16ms Wartezeit
Schritt 5: Wire.requestFrom(0x44, 6)        → received = ??? (vermutlich 0)
Schritt 6: Wire.available() < 6 polling     → Timeout nach 100ms → ERROR 1007
```

### Kritische Code-Stelle (i2c_bus.cpp:819-837)

```cpp
// Step 3: Read data directly (no register address)
size_t received = Wire.requestFrom(i2c_address, (uint8_t)requested);  // Line 819

// Timeout handling for slow sensors
unsigned long start = millis();
while (Wire.available() < (int)requested) {                           // Line 825
    if (millis() - start > I2C_READ_TIMEOUT_MS) {                     // 100ms timeout
        LOG_E(TAG, "I2C: Read timeout for " + String(protocol->sensor_type));
        errorTracker.trackError(ERROR_I2C_TIMEOUT, ...);
        attemptRecoveryIfNeeded(5);
        return false;                                                  // ❌ HERE
    }
    yield();
}
```

### Warum `Wire.available()` Polling NACH `Wire.requestFrom()` problematisch ist

`Wire.requestFrom()` ist **synchron** in der Arduino/ESP32 Wire-Library. Wenn es returniert, sind die Daten entweder:
- **Vollständig im Buffer** (received == 6) → `Wire.available()` wäre sofort 6
- **NICHT vollständig** (received < 6) → `Wire.available()` wird NIEMALS 6 erreichen

Das bedeutet: Der `while (Wire.available() < requested)` Loop ist **sinnlos** wenn `received != requested`. Die Daten kommen NICHT "nachträglich" an.

**Die eigentliche Prüfung `if (received != requested)` in Zeile 841 wird erst NACH dem Timeout-Loop ausgeführt.**

### Race Condition / Logic Bug

```
received = Wire.requestFrom(0x44, 6);  // Returns z.B. 0
// Jetzt: Wire.available() == 0
// Loop wartet 100ms auf Wire.available() >= 6
// → Das wird NIEMALS passieren, weil requestFrom synchron ist
// → Timeout nach 100ms → ERROR_I2C_TIMEOUT (1007)
```

Aber: Die Check `if (received != requested)` in Zeile 841 hätte `ERROR_I2C_READ_FAILED` geworfen — eine **genauere** Fehlermeldung. Der Timeout-Error verschleiert das eigentliche Problem.

---

## 3. MQTT Payload-Dokumentation (ESP → Server)

### MQTT Topic-Pattern
```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
```
Beispiel: `kaiser/god/esp/ESP_472204/sensor/21/data`

### Payload-Format (JSON)
```json
{
  "esp_id": "ESP_472204",
  "seq": 42,
  "zone_id": "greenhouse-zone-a",
  "subzone_id": "section-1",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "raw": 27445,
  "value": 23.5,
  "unit": "°C",
  "quality": "good",
  "ts": 1740500000,
  "raw_mode": true,
  "i2c_address": 68
}
```

### Felder-Referenz

| Feld | Typ | Quelle | Beschreibung |
|------|-----|--------|--------------|
| `esp_id` | string | ConfigManager | ESP-Identifikator |
| `seq` | int | MQTTClient | Correlation-Sequenz |
| `zone_id` | string | KaiserZone (main.cpp) | Zone-ID |
| `subzone_id` | string | SensorConfig | Subzone-Zuordnung |
| `gpio` | int | SensorConfig | GPIO-Pin des Sensors |
| `sensor_type` | string | getServerSensorType() | Normalisierter Typ (sht31_temp/sht31_humidity) |
| `raw` | uint32 | extractRawValue() | 16-bit RAW-Wert (0-65535) |
| `value` | float | PiEnhancedProcessor | Server-verarbeiteter Wert |
| `unit` | string | PiEnhancedProcessor | Einheit (°C, %RH) |
| `quality` | string | PiEnhancedProcessor | Qualitätsbewertung |
| `ts` | uint32 | TimeManager (NTP) | Unix-Timestamp |
| `raw_mode` | bool | SensorReading | Immer `true` (Server-Centric) |
| `i2c_address` | int | SensorConfig | I2C-Adresse (0x44 = 68 dezimal) |

### Multi-Value: ZWEI separate MQTT Messages

Für SHT31 werden ZWEI Messages publiziert:
1. `sensor_type: "sht31_temp"` mit `raw: <16-bit Temp-RAW>`
2. `sensor_type: "sht31_humidity"` mit `raw: <16-bit Hum-RAW>`

Beide auf dem gleichen Topic (gleicher GPIO).

---

## 4. Server-Erwartung

### Pfad 1: MQTT Sensor Data Handler (Hauptpfad)

**Datei:** `El Servador/.../mqtt/handlers/sensor_handler.py`
**Funktion:** `handle_sensor_data(topic, payload)`

**Pflichtfelder:** `ts` (oder `timestamp`), `esp_id`, `gpio`, `sensor_type`, `raw` (oder `raw_value`), `raw_mode`

**Validierung:**
- `ts/timestamp`: int (Unix)
- `gpio`: int
- `raw_mode`: bool (PFLICHT!)
- `raw/raw_value`: numeric
- `quality`: optional, muss in `["good", "fair", "poor", "suspect", "error", "unknown"]` sein

### Pfad 2: HTTP Sensor Processing (ESP → Server vor MQTT)

**Datei:** `El Servador/.../api/sensor_processing.py`
**Endpoint:** `POST /api/v1/sensors/process`
**Auth:** X-API-Key Header (PFLICHT)

**Request:**
```json
{
  "esp_id": "ESP_472204",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "raw_value": 27445,
  "timestamp": 12345678,
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "processed_value": 23.5,
  "unit": "°C",
  "quality": "good",
  "processing_time_ms": 0.45,
  "metadata": {...}
}
```

### Dualer Verarbeitungspfad (WICHTIG)

Der SHT31-Wert wird **ZWEIMAL** verarbeitet:
1. **HTTP (ESP→Server):** `PiEnhancedProcessor.sendRawData()` → `POST /api/v1/sensors/process`
   - ESP bekommt `processed_value` zurück, setzt es in `SensorReading.processed_value`
2. **MQTT (ESP→Server):** `publishSensorReading()` → MQTT-Topic → `SensorDataHandler`
   - Server verarbeitet RAW nochmal via `_trigger_pi_enhanced_processing()`
   - Speichert in DB, broadcastet via WebSocket

---

## 5. Mismatch-Analyse (ESP-Output vs. Server-Input)

### Ergebnis: KEIN Payload-Mismatch

Die ESP-MQTT-Payload und die Server-Erwartung sind **kompatibel**:

| ESP sendet | Server erwartet | Match? |
|------------|-----------------|--------|
| `"ts": <unix>` | `ts` oder `timestamp` (int) | ✅ |
| `"esp_id": "ESP_472204"` | `esp_id` (string) | ✅ |
| `"gpio": 21` | `gpio` (int) | ✅ |
| `"sensor_type": "sht31_temp"` | `sensor_type` (string) | ✅ |
| `"raw": 27445` | `raw` oder `raw_value` (numeric) | ✅ |
| `"raw_mode": true` | `raw_mode` (bool, PFLICHT) | ✅ |
| `"quality": "good"` | `quality` (optional, valid values) | ✅ |
| `"i2c_address": 68` | `i2c_address` (optional, int 0-127) | ✅ |

### Sensor-Type-Normalisierung: KORREKT

```
ESP sendet:                    Server normalisiert zu:
"sht31_temp"          →       "sht31_temp"        → SHT31TemperatureProcessor ✅
"sht31_humidity"      →       "sht31_humidity"     → SHT31HumidityProcessor   ✅
```

### Processing-Libraries: VORHANDEN und KORREKT

- `SHT31TemperatureProcessor`: `temp = -45 + (175 * raw / 65535)` ✅
- `SHT31HumidityProcessor`: `hum = 100 * raw / 65535` ✅
- Local Fallback (Circuit Breaker OPEN): Identische Formeln ✅

**Fazit:** Der gesamte Server-Pfad ist korrekt implementiert. Das Problem ist ausschließlich auf dem ESP32.

---

## 6. Vergleich mit funktionierendem Script

### Separates Script: NICHT im Repo

Es gibt **kein separates SHT31-Script** im Auto-One Repo. Die ESP32 SHT31-Driver-Dateien sind **leer** (0 Bytes):
- `El Trabajante/src/services/sensor/sensor_drivers/temp_sensor_sht31.cpp` → LEER
- `El Trabajante/src/services/sensor/sensor_drivers/temp_sensor_sht31.h` → LEER

Diese Dateien werden **nicht verwendet**. Der gesamte SHT31-Read läuft über den generischen `i2c_bus.cpp` + `i2c_sensor_protocol.cpp` Pfad.

### Was ein funktionierendes Arduino-Script typischerweise anders macht

Ein typisches Adafruit SHT31 Arduino-Script:

```cpp
// Typisches funktionierendes Pattern:
Wire.beginTransmission(0x44);
Wire.write(0x24);
Wire.write(0x00);
Wire.endTransmission(true);    // ← true = STOP condition!
delay(20);                      // ← 20ms statt 16ms
uint8_t n = Wire.requestFrom(0x44, 6);
if (n == 6) {
    // Sofort lesen, KEIN polling loop
    for (int i = 0; i < 6; i++) {
        buf[i] = Wire.read();
    }
}
```

### Unterschiede zum AutomationOne-Code

| Aspekt | AutomationOne | Typisches Script | Relevant? |
|--------|--------------|------------------|-----------|
| `endTransmission()` Parameter | Kein Parameter (default=true) | `true` explizit | ❌ Gleich |
| Conversion Delay | 16ms | 20ms | ⚠️ Möglich |
| Nach `requestFrom` | `Wire.available()` Polling Loop (100ms) | Sofortiges Lesen basierend auf Return-Wert | ⚠️ |
| Fehlerbehandlung | Recovery + Timeout | Einfaches if/else | ❌ Nicht relevant |
| `Wire.setTimeOut()` | 100ms (Zeile 114) | Nicht gesetzt (default) | ⚠️ MÖGLICH |

---

## 7. Root-Cause-Analyse & Fix-Empfehlung

### Primärer Verdacht: `Wire.requestFrom()` liefert 0 Bytes

**Bekannter Stand aus Hardware-Test:**
- `Wire.endTransmission()` returns 0 → SHT31 ist erreichbar, ACK empfangen ✅
- `Wire.requestFrom(0x44, 6)` liefert NICHT 6 Bytes → ❌

**Warum?** Drei Hypothesen:

#### Hypothese A: Timing-Problem (WAHRSCHEINLICHSTE)
- 16ms Conversion-Delay könnte zu knapp sein
- SHT31 Datasheet: 15.5ms **max** für High Repeatability
- ESP32 `delay()` ist nicht exakt — kann kürzer als erwartet sein
- **Fix:** `conversion_time_ms` von 16 auf 20 erhöhen

#### Hypothese B: `Wire.setTimeOut(100)` interferiert
- Zeile 114: `Wire.setTimeOut(100)` setzt globalen Wire-Timeout auf 100ms
- Bei ESP32 Arduino Core kann `setTimeOut` das Verhalten von `requestFrom` beeinflussen
- Wenn der SHT31 minimal langsamer als erwartet antwortet, könnte ein interner Timeout greifen
- **Fix:** `Wire.setTimeOut(200)` oder `Wire.setTimeOut(0)` testen

#### Hypothese C: I2C-Bus-Zustand nach `endTransmission()`
- `endTransmission()` ohne Parameter = `endTransmission(true)` = STOP condition
- Manche SHT31-Clones/Varianten brauchen eine kurze Pause nach STOP vor dem Read
- **Fix:** 1ms `delay()` zwischen `endTransmission()` und `requestFrom()` einfügen

### Empfohlene Fixes (Prioritätsreihenfolge)

#### Fix 1: Conversion Time erhöhen (LOW RISK)
**Datei:** `El Trabajante/src/drivers/i2c_sensor_protocol.cpp`, Zeile 27
```cpp
// VORHER:
.conversion_time_ms = 16,          // 15.5ms max + margin
// NACHHER:
.conversion_time_ms = 20,          // 15.5ms max + safety margin
```

#### Fix 2: Wire.available() Polling-Loop entfernen (MEDIUM RISK)
**Datei:** `El Trabajante/src/drivers/i2c_bus.cpp`, Zeilen 822-837

Der Polling-Loop ist logisch falsch: `Wire.requestFrom()` ist synchron. Wenn `received < requested`, werden die fehlenden Bytes NIE ankommen.

```cpp
// VORHER (Zeilen 819-837):
size_t received = Wire.requestFrom(i2c_address, (uint8_t)requested);

// Timeout handling for slow sensors
unsigned long start = millis();
while (Wire.available() < (int)requested) {
    if (millis() - start > I2C_READ_TIMEOUT_MS) { ... return false; }
    yield();
}

// NACHHER:
size_t received = Wire.requestFrom(i2c_address, (uint8_t)requested);

// Wire.requestFrom() is synchronous - data is either in buffer or not
if (received != requested) {
    LOG_E(TAG, "I2C: Incomplete read from " + String(protocol->sensor_type) +
              " (expected " + String(requested) + ", got " + String(received) + ")");
    errorTracker.trackError(ERROR_I2C_READ_FAILED, ERROR_SEVERITY_ERROR,
                           ("Incomplete read: " + String(protocol->sensor_type)).c_str());
    attemptRecoveryIfNeeded(4);
    return false;
}
```

#### Fix 3: Wire Timeout anpassen (LOW RISK)
**Datei:** `El Trabajante/src/drivers/i2c_bus.cpp`, Zeile 114
```cpp
// VORHER:
Wire.setTimeOut(100);  // 100ms timeout for Wire operations
// NACHHER:
Wire.setTimeOut(200);  // 200ms timeout for Wire operations (SHT31 needs 15.5ms conversion + read)
```

### Test-Reihenfolge

1. **Nur Fix 1** anwenden (Conversion Time 16→20ms), flashen, testen
2. Falls noch Fehler: **Fix 2** dazu (Polling-Loop entfernen)
3. Falls noch Fehler: **Fix 3** dazu (Wire Timeout 100→200ms)

### Warum Fix 2 das Debugging verbessert

Der aktuelle Code erzeugt `ERROR_I2C_TIMEOUT (1007)` auch wenn das eigentliche Problem `ERROR_I2C_READ_FAILED` ist. Nach Fix 2 würde der Error-Code korrekt `ERROR_I2C_READ_FAILED` sein, wenn `Wire.requestFrom()` weniger als 6 Bytes liefert.

---

## 8. Zusammenfassung

| Aspekt | Status | Detail |
|--------|--------|--------|
| **I2C Protokoll-Definition** | ✅ KORREKT | 0x24,0x00, 6 Bytes, CRC-8 Sensirion |
| **I2C Command Senden** | ✅ OK | endTransmission() returns 0 (ACK) |
| **I2C Data Read** | ❌ FEHLER | requestFrom() liefert nicht 6 Bytes |
| **Conversion Delay** | ⚠️ KNAPP | 16ms bei 15.5ms max Spezifikation |
| **Wire.available() Loop** | ⚠️ LOGIK-BUG | Polling nach synchronem requestFrom sinnlos |
| **Rohdaten-Verarbeitung ESP** | ✅ KORREKT | extractRawValue() + Protocol-Registry |
| **MQTT Publish** | ✅ KORREKT | Topic + Payload vollständig, raw_mode=true |
| **HTTP PiEnhanced** | ✅ KORREKT | POST /api/v1/sensors/process |
| **Server Processing** | ✅ KORREKT | SHT31Temp/HumidityProcessor vorhanden |
| **Server MQTT Handler** | ✅ KORREKT | Validierung, I2C-Lookup, DB-Save, WS-Broadcast |
| **Payload-Kompatibilität** | ✅ MATCH | ESP-Output == Server-Input |
| **SHT31 Driver Files** | ⚠️ LEER | temp_sensor_sht31.cpp/h sind 0 Bytes (nicht verwendet) |
| **Separates Script** | ❓ NICHT IM REPO | User hat extern verifiziert, Script nicht verfügbar |

### Fazit

**Der Bruchpunkt liegt ausschließlich auf dem ESP32**, in der I2C-Bus-Kommunikation (`i2c_bus.cpp:819-837`). Der SHT31 empfängt und ACKt den Messbefehl, liefert aber die 6 Datenbytes nicht rechtzeitig. Wahrscheinlichste Ursache: Conversion-Delay zu knapp (16ms bei 15.5ms max) und/oder `Wire.setTimeOut(100)` beeinflusst `requestFrom()`.

Der gesamte Server-Pfad (MQTT-Handler, Processing-Libraries, DB-Schema, WebSocket) ist korrekt implementiert und bereit für Daten.
