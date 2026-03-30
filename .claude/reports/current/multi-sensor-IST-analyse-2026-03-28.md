# Multi-Sensor IST-Zustand — Analysebericht (2026-03-28)

> **ESP:** ESP_EA5484 | **Zone:** Zelt Wohnzimmer | **Status:** online
> **Hardware:** 2x SHT31 (I2C 0x44 + 0x45), 2x DS18B20 (OneWire GPIO 4)
> **Quellen:** ESP32-Firmware, Server-Backend, Frontend, DB, Loki-Logs, Serial-Log

---

## 1. DB-Zustand

### 1.1 sensor_configs (7 Eintraege)

| GPIO | sensor_type    | interface | Adresse              | sensor_name      | enabled |
|------|----------------|-----------|----------------------|------------------|---------|
| 0    | sht31_temp     | I2C       | 0x44 (68)            | (leer)           | true    |
| 0    | sht31_temp     | I2C       | 0x45 (69)            | (leer)           | true    |
| 0    | sht31_humidity | I2C       | 0x44 (68)            | (leer)           | true    |
| 0    | sht31_humidity | I2C       | 0x45 (69)            | (leer)           | true    |
| 0    | vpd            | VIRTUAL   | —                    | VPD (berechnet)  | true    |
| 4    | ds18b20        | ONEWIRE   | 28FF641F7FCCBAE1     | Temp BAE1        | true    |
| 4    | ds18b20        | ONEWIRE   | 28FF641F7C58B083     | Temp B083        | true    |

**Alle `assigned_subzones = []`**. Keine Subzonen konfiguriert.

**DB-Bewertung:** Die Konfiguration ist vollstaendig und korrekt. Beide SHT31-Adressen und beide DS18B20-ROM-Codes sind erfasst. Der VIRTUAL-VPD-Sensor ist korrekt als berechneter Wert markiert.

### 1.2 sensor_data Stichprobe (letzte 10 Min)

| GPIO | sensor_type    | Zeilen | Wertebereich          | Intervall |
|------|----------------|--------|-----------------------|-----------|
| 0    | sht31_temp     | ~85    | 20.6 C                | ~7-10s    |
| 0    | sht31_humidity | ~85    | 41.3 – 41.5 %RH       | ~7-10s    |
| 0    | vpd            | ~86    | 1.4195 – 1.4244 kPa   | berechnet |
| 4    | ds18b20        | ~37    | 20.44 – 21.38 C       | ~30s      |

**KRITISCH:** `sensor_metadata` in sensor_data enthaelt **keine** `i2c_address` oder `onewire_address`. Nur `{"raw_mode": true}`. Die zwei DS18B20-Werte sind in der DB **nicht unterscheidbar**.

### 1.3 Subzone-Zustand

**Keine Subzonen konfiguriert.** `sensor_data.subzone_id` ist ueberall NULL.

### 1.4 device_metadata

- `simulation_config.sensors = {}` — Real-Hardware-Modus
- `last_sensor_count = 11` (ESP intern meldet 11, DB hat 7 configs)
- GPIO-Status: GPIO 4 (OneWireBus), GPIO 21 (I2C_SDA), GPIO 22 (I2C_SCL)

---

## 2. Config-Builder Output

**Quelle:** `El Servador/god_kaiser_server/src/core/config_builder.py:156`

### Verhalten
- Ladet alle sensor_configs via `sensor_repo.get_by_esp(esp_id)`
- Filtert: `enabled == True` UND `interface_type != "VIRTUAL"` (VPD wird korrekt ausgeschlossen)
- Ergebnis: **6 Sensor-Configs** werden gepusht (4x SHT31 + 2x DS18B20)

### Payload-Format pro Sensor (11 Felder)
```json
{
  "gpio": 0,
  "sensor_type": "sht31_temp",
  "interface_type": "I2C",
  "i2c_address": 68,
  "onewire_address": "",
  "active": true,
  "sample_interval_ms": 10000,
  "raw_mode": false,
  "operating_mode": "normal",
  "measurement_interval_seconds": 30,
  "subzone_id": null
}
```

**i2c_address und onewire_address werden korrekt mitgesendet.** Mapping in `config_mapping.py:261-275`.

### Problem: Vier SHT31-Configs statt zwei

Da die DB 4 SHT31-Eintraege hat (temp+humidity jeweils fuer 0x44 UND 0x45), werden **alle 4 gepusht**. Das ist aber fuer die Firmware kein Problem wenn sie die i2c_address aus dem Payload verwenden wuerde — was sie NICHT tut (siehe Abschnitt 5).

---

## 3. Config-Push Trigger

### 6 Aufrufer identifiziert

| Aufrufer | Datei:Zeile | Cooldown |
|----------|------------|----------|
| Sensor Create (Multi-Value) | `api/v1/sensors.py:766` | NEIN |
| Sensor Create/Update | `api/v1/sensors.py:1058` | NEIN |
| Sensor Delete | `api/v1/sensors.py:1203` | NEIN |
| Actuator Create/Update | `api/v1/actuators.py:628` | NEIN |
| Actuator Delete | `api/v1/actuators.py:1170` | NEIN |
| Heartbeat `_auto_push_config` | `heartbeat_handler.py:1312` | JA, 120s |

### Warum variiert die Sensor-Anzahl?

**Loki-Timeline beweist:** Robin hat waehrend der Session mehrfach Sensoren angelegt und geloescht. **Jede CRUD-Operation triggert sofort einen Config-Push.** Beispiel:

```
10:09:48  sensor delete → push (3 items)
10:09:51  sensor create → push (3 items)
10:09:55  sensor delete → push (WARNING: config not found)
10:09:59  sensor delete → push (1 item)
10:10:03  sensor delete → push (ERROR: empty array)
10:10:12  sensor delete → push (ERROR: empty array)
10:10:45  sensor create → push (2 items)
10:11:30  sensor create → push (4 items)
```

**Zusaetzlich:** Bei LWT-Disconnect meldet der ESP beim Reconnect `sensors=0`, was `_has_pending_config()` triggert → Auto-Push. Drei LWT-Events um 10:06 (15s Abstand) = 3 zusaetzliche Auto-Pushes.

**Root Cause der 8+ Pushes:** Kombination aus CRUD-Pushes (kein Debounce) + LWT-Reconnect-Cascaden + Heartbeat-Mismatch-Detection.

---

## 4. Firmware SensorManager

### Interne Datenstruktur
- **Typ:** Statisches Array `SensorConfig sensors_[MAX_SENSORS]` (10 Slots) — `sensor_manager.h:139`
- **Kein fester Key.** Lookup via `findSensorConfig()` — lineare Suche mit optionalen Filtern
- **Mehrere Sensoren pro GPIO grundsaetzlich moeglich** (Array, nicht Map)

### findSensorConfig() — `sensor_manager.cpp:1474-1492`

Drei Varianten:
1. GPIO allein → erster Treffer
2. GPIO + `onewire_address` → OneWire-spezifisch
3. GPIO + `i2c_address` → I2C-spezifisch

### configureSensor() — Das Kernproblem

`configureSensor()` (Zeile ~230) ruft `findSensorConfig()` auf, um zu entscheiden ob ADD oder UPDATE.

**KRITISCH:** Der Lookup verwendet `capability->i2c_address` aus dem **Sensor-Registry** (`sensor_registry.cpp:13`), **NICHT** `config.i2c_address` aus dem MQTT-Payload!

**Im Registry ist SHT31 hardcoded auf 0x44.** Es gibt keinen Eintrag fuer 0x45.

### Konsequenz fuer Multi-Value (SHT31)

Ablauf beim Config-Empfang (4 Configs: sht31_temp@0x44, sht31_humidity@0x44, sht31_temp@0x45, sht31_humidity@0x45):

1. `sht31_temp` kommt → Lookup mit `capability->i2c_address = 0x44` → nicht gefunden → **ADD** ✅
2. `sht31_humidity` kommt → Lookup mit `capability->i2c_address = 0x44` → findet Slot von sht31_temp → **UPDATE** (ueberschreibt!) ❌
3. `sht31_temp` kommt (0x45) → Lookup mit `capability->i2c_address = 0x44` → findet Slot → **UPDATE** (ueberschreibt zurueck!) ❌
4. `sht31_humidity` kommt (0x45) → gleicher Loop → **UPDATE** ❌

**Das erklaert exakt das Serial-Log-Verhalten:** `Added → Updating → type changed → Updating → type changed...`

### NVS-Schema

| Key | Inhalt |
|-----|--------|
| `sen_{i}_gpio` | GPIO-Nummer |
| `sen_{i}_type` | sensor_type String |
| `sen_{i}_name` | Sensor-Name |
| `sen_{i}_sz` | Subzone |
| `sen_{i}_act` | Active |
| `sen_{i}_raw` | Raw-Mode |
| `sen_{i}_mode` | Operating-Mode |
| `sen_{i}_int` | Interface-Type |
| `sen_{i}_ow` | OneWire-Adresse (nur OneWire) |

**`i2c_address` wird NICHT in NVS gespeichert.** Nach Reboot: `config.i2c_address = 0`. Wird aus Registry wiederhergestellt (immer 0x44).

---

## 5. SHT31-Initialisierung

### I2C-Kommunikation
- **Kein Adafruit_SHT31.** Firmware implementiert SHT31-Protokoll direkt via `I2CBusManager` + `i2c_sensor_protocol.cpp`
- Command: 0x2400 (Single-Shot, High Repeatability), 6 Bytes Response

### Adress-Verwendung
- `performMultiValueMeasurement()` verwendet `capability->i2c_address` — **immer 0x44** (`sensor_manager.cpp:1061`)
- `config.i2c_address` aus dem MQTT-Payload wird zwar gespeichert, aber **nie zum Messen verwendet**
- **Ergebnis:** Zweiter SHT31 an 0x45 kann nicht angesprochen werden

### CRC-Fehler im Log
```
[360106] [ERROR] [I2C] I2C: CRC failed for sht31_temp (calc=0xFB exp=0x01 data=[61,0A])
```
**Interpretation:** Die Firmware liest von 0x44 (erster SHT31) korrekt. Die CRC-Fehler deuten auf I2C-Bus-Stoerungen hin (moeglicherweise der zweite SHT31 an 0x45 der gleichzeitig auf den Bus reagiert). Wahrscheinlich Timing-Issue bei zwei Devices auf dem Bus.

---

## 6. DS18B20-Auslese

### ROM-Code-basiert — KORREKT
- `onewire_bus.cpp:247`: `onewire_->select(rom_code)` adressiert spezifisches Geraet
- **Kein Index-basiertes Lesen.** Jeder Sensor wird ueber seinen 8-Byte ROM-Code adressiert.
- OneWire-Bus wird einmal `requestTemperatures()` aufgerufen, dann individuell gelesen

### OneWire-Scan-Ergebnisse
```
[615497] Found device: Family=0x28 Serial=bacc       → 28FF641F7FCCBAE1 (Temp BAE1)
[1024298] Found device: Family=0x28 Serial=b058      → 28FF641F7C58B083 (Temp B083)
[1024313] Found device: Family=0x28 Serial=bacc      → 28FF641F7FCCBAE1
```

**Erster Scan:** Nur 1 Device gefunden (b058 nicht erkannt — moeglicherweise Kontaktproblem).
**Zweiter Scan:** Beide Devices gefunden. Hardware ist OK.

### OneWire Multi-Sensor auf Firmware-Ebene: FUNKTIONIERT
Die Firmware speichert jeden DS18B20 als separaten Sensor-Eintrag mit eigenem ROM-Code. Mehrere DS18B20 auf einem GPIO werden korrekt unterstuetzt.

---

## 7. MQTT-Payload-Struktur

### Sensor-Daten Topic
```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
```

### SHT31 Payload (2 separate Messages)
```json
// Message 1:
{"sensor_type": "sht31_temp", "value": 20.6, "unit": "C", "i2c_address": 68, "gpio": 0}

// Message 2:
{"sensor_type": "sht31_humidity", "value": 41.4, "unit": "%RH", "i2c_address": 68, "gpio": 0}
```

- `i2c_address` wird mitgesendet wenn `!= 0` (`sensor_manager.cpp:1596-1599`)
- **Aktuell immer 0x44 (68)** da Registry hardcoded

### DS18B20 Payload
```json
{"sensor_type": "ds18b20", "value": 20.5, "unit": "C", "onewire_address": "28FF641F7FCCBAE1", "gpio": 4}
```

- `onewire_address` wird mitgesendet wenn nicht leer (`sensor_manager.cpp:1589-1593`)

---

## 8. Frontend-Zustand

### 8.1 AddSensorModal — P3-Fix FUNKTIONIERT

| Feature | Status | Quelle |
|---------|--------|--------|
| I2C-Adress-Dropdown (0x44/0x45) | ✅ vorhanden | `AddSensorModal.vue:462-471` |
| i2c_address im Create-Request | ✅ korrekt | `AddSensorModal.vue:277-280` → `esp.ts:706` |
| DS18B20 via Scan-Flow mit ROM-Code | ✅ funktioniert | `AddSensorModal.vue:322-361` |
| Sensor-Karten differenziert nach config_id | ✅ korrekt | `SensorColumn.vue:54-61` |
| I2C-Adress-Label in SensorSatellite | ✅ angezeigt | `SensorSatellite.vue:157-175` |

### 8.2 WebSocket Live-Update — KRITISCHE LUECKE

**`sensor.store.ts:121-123`** matcht eingehende Sensor-Daten **ausschliesslich via `gpio + sensor_type`**.

`SensorDataEvent` (`types/websocket-events.ts:47-55`) hat **kein `config_id`** und **kein `onewire_address`** Feld.

**Konsequenz:**
- Zwei DS18B20 auf GPIO 4 → Live-Updates treffen immer den **ersten** Treffer
- Das erklaert das "Vermischen" der DS18B20-Werte im Frontend
- Zwei SHT31 mit gleichem sensor_type → gleicher Effekt

---

## 9. Loki-Log Befunde

### Dauerhaft aktive Warnungen
```
sensor_repo - WARNING: Multiple configs for esp=d7df3b7d gpio=0 type=sht31_temp: 2 results.
sensor_repo - WARNING: Multiple configs for esp=d7df3b7d gpio=0 type=sht31_humidity: 2 results.
```
**Frequenz:** Alle ~7-30 Sekunden, bei jedem SHT31-Datenpunkt.
**Ursache:** 2 Configs pro sensor_type (0x44 + 0x45) — Server nimmt ersten Treffer.

### Config-Push Timeline (Kurzfassung)
```
09:50  Push (2 items) — erster SHT31 angelegt
09:53  Push (4 items) — zweiter SHT31 angelegt
09:56  Full-State-Push (Heartbeat Mismatch)
10:03  LWT + Auto-Push (4 items)
10:06  3x LWT + 3x Auto-Push
10:09  4x Delete+Create Zyklen (3→1→0→2→4 items)
10:16  Push (5 items) — DS18B20 #1 angelegt
10:23  Push (6 items) — DS18B20 #2 angelegt
10:35+ Stabil, keine weiteren Config-Pushes
```

---

## 10. Zusammenfassung pro Schicht

### Backend (DB + Config-Builder + Handler)

| Aspekt | Status | Problem |
|--------|--------|---------|
| sensor_configs in DB | ✅ vollstaendig | 7 korrekte Eintraege |
| Config-Builder Push | ✅ korrekt | i2c/onewire_address enthalten |
| VIRTUAL-Filter | ✅ korrekt | VPD wird ausgeschlossen |
| sensor_handler Lookup | ⚠️ Warnung | "Multiple configs" bei gpio+type ohne Adresse |
| sensor_data Differenzierung | ❌ FEHLT | onewire_address nicht in sensor_metadata gespeichert |
| Config-Push Debounce | ❌ FEHLT | Kein Cooldown bei CRUD-Operationen |

### Firmware (ESP32)

| Aspekt | Status | Problem |
|--------|--------|---------|
| SHT31 Multi-Address (0x44+0x45) | ❌ KAPUTT | Registry hardcoded 0x44, capability->i2c_address statt config.i2c_address |
| SHT31 NVS-Persistenz | ❌ FEHLT | i2c_address nicht in NVS gespeichert |
| DS18B20 Multi-Sensor | ✅ KORREKT | ROM-Code-basierte Adressierung funktioniert |
| OneWire-Bus-Scan | ✅ KORREKT | Beide Devices gefunden |
| Multi-Value Dedup | ✅ KORREKT | Ein I2C-Read fuer temp+humidity |
| Config-Empfang GPIO-Key | ❌ KAPUTT | findSensorConfig nutzt Registry-Adresse statt Config-Adresse |

### Frontend

| Aspekt | Status | Problem |
|--------|--------|---------|
| AddSensorModal I2C-Adresse | ✅ KORREKT | Dropdown + korrekte API-Calls |
| AddSensorModal OneWire-Scan | ✅ KORREKT | ROM-Code wird uebernommen |
| Sensor-Karten Differenzierung | ✅ KORREKT | config_id als Key |
| WebSocket Live-Update | ❌ KAPUTT | Matcht nur gpio+sensor_type, kein config_id |
| SensorDataEvent Schema | ❌ FEHLT | config_id und onewire_address fehlen |

---

## 11. Root-Cause-Abgleich mit offenen Auftraegen

### SHT31-A: Zweiter SHT31 an 0x45 wird ignoriert

**Bestaetigt.** Root Cause liegt zu 100% in der Firmware:
1. `sensor_registry.cpp:13` — SHT31 capability hardcoded auf 0x44
2. `sensor_manager.cpp:232` — configureSensor() nutzt `capability->i2c_address` statt `config.i2c_address`
3. `sensor_manager.cpp:1061` — performMultiValueMeasurement() nutzt `capability->i2c_address`
4. NVS-Schema — kein Key fuer i2c_address

**Fix-Umfang:** Firmware-only (4 Stellen). Backend und Frontend sind bereits korrekt.

### SHT31-B: Config-Push Ping-Pong (temp↔humidity Overwrite)

**Bestaetigt.** Gleicher Root Cause wie SHT31-A. Da `findSensorConfig()` nur 0x44 kennt, werden alle SHT31-Configs als "gleicher Sensor" erkannt → Update statt Add. Ergebnis: Letzter Config-Eintrag "gewinnt", alle anderen werden ueberschrieben.

### DS18B20-A: Werte "vermischen" sich im Frontend

**Root Cause praezisiert:**
- Firmware-Ebene: **KORREKT** — ROM-Code-basierte Auslese funktioniert
- **Frontend-Ebene:** `sensor.store.ts:121-123` matcht via `gpio + sensor_type` → beide DS18B20 treffen denselben Slot
- **Server-Ebene:** `sensor_metadata` speichert `onewire_address` nicht → Werte in DB nicht unterscheidbar
- **Cross-Layer:** `SensorDataEvent` fehlt `config_id` und `onewire_address`

**Fix-Umfang:** Server (sensor_handler metadata speichern) + Frontend (WS-Event-Schema + Store-Matching) + ggf. Firmware (config_id im MQTT-Payload).

### DS18B20-B: OneWire-Bus-Scan

**Funktioniert.** Beide Devices gefunden. Erster Scan nur 1 Device = wahrscheinlich lockerer Kontakt.

### SUBZONE-FW: Keine Subzonen zugewiesen

**Bestaetigt.** Alle `assigned_subzones = []`, alle `sensor_data.subzone_id = NULL`. Muss nach den Sensor-Fixes konfiguriert werden.

---

## 12. Priorisierte Empfehlung

### Phase 1: Firmware SHT31 Multi-Address (HOECHSTE PRIO)

1. `sensor_registry.cpp` — Zweiten SHT31-Eintrag fuer 0x45 hinzufuegen ODER Registry dynamisch machen
2. `sensor_manager.cpp:232` — `config.i2c_address` statt `capability->i2c_address` im Lookup verwenden
3. `sensor_manager.cpp:1061` — `config.i2c_address` beim Messen verwenden
4. NVS-Schema — `sen_{i}_i2c` Key hinzufuegen

**Blockiert:** Alles andere bei Multi-I2C-Sensoren.

### Phase 2: Cross-Layer DS18B20 Differenzierung (HOCH)

1. Server: `sensor_handler.py` — `onewire_address` in `sensor_metadata` speichern
2. Server: `SensorDataEvent` um `config_id` und `onewire_address` erweitern
3. Frontend: `sensor.store.ts:121` — Matching um `config_id` oder `onewire_address` erweitern
4. Frontend: `websocket-events.ts:47` — Interface erweitern

### Phase 3: Config-Push Debounce (MITTEL)

1. Debounce/Throttle fuer CRUD-getriggerte Config-Pushes (z.B. 5s Sammelfenster)
2. Alternativ: Nur bei letzter Operation in einer Batch-Sequenz pushen

### Phase 4: Subzone-Konfiguration (NIEDRIG)

Erst nach Phase 1+2 sinnvoll, da Subzones auf korrekte sensor_config-Zuordnung angewiesen sind.
