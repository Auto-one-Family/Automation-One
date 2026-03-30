# MULTI-SENSOR-FIX — Konsolidierter Analyse- und Fix-Auftrag (v2 korrigiert)

> **Datum:** 2026-03-28 (v2: Korrekturen nach Verifikation eingearbeitet)
> **Grundlage:** IST-Zustand-Analyse vom 2026-03-28 (4-Block-Volldiagnose aller 3 Schichten)
> **ESP:** ESP_EA5484 | **Zone:** Zelt Wohnzimmer
> **Hardware:** 2x SHT31 (I2C 0x44 + 0x45), 2x DS18B20 (OneWire GPIO 4)
> **Subzones:** Keine konfiguriert (kein Blocker fuer diesen Auftrag)
> **Agents:** esp32-dev (Phase 1), server-dev (Phase 2+4), frontend-dev (Phase 3)

---

## Zusammenfassung der Analyse-Ergebnisse

Die IST-Analyse hat die Root Causes praezisiert und einige bisherige Annahmen KORRIGIERT:

### Was KORREKT funktioniert (kein Fix noetig)
- **DB-Struktur:** 7 sensor_configs vollstaendig und korrekt (4x SHT31 fuer 0x44+0x45, 2x DS18B20 mit ROM-Codes, 1x VPD VIRTUAL)
- **Config-Builder:** Sendet alle 6 Non-VIRTUAL Configs mit korrekter i2c_address/onewire_address im Payload
- **Frontend AddSensorModal:** I2C-Adress-Dropdown (0x44/0x45), ROM-Code-Uebernahme bei OneWire — P3-Fix funktioniert
- **Frontend Sensor-Karten:** Differenzierung per config_id korrekt
- **DS18B20 Firmware-Auslese:** Bereits ROM-Code-basiert (`onewire_bus.cpp:247` — `onewire_->select(rom_code)`). **DS18B20-A Auftrag ist OBSOLET.**
- **VIRTUAL-Filter:** VPD wird korrekt vom Config-Push ausgeschlossen
- **sensor_handler.py Lookup (P1-Fix):** `sensor_handler.py:205-236` nutzt BEREITS korrekt `get_by_esp_gpio_type_and_i2c()` / `get_by_esp_gpio_type_and_onewire()` mit Fallback auf `get_by_esp_gpio_and_type()`

### Was KAPUTT ist (4 Bugs, 3 Schichten)

| # | Bug | Schicht | Root Cause | Schwere |
|---|-----|---------|-----------|---------|
| BUG-1 | SHT31: Zweiter Sensor (0x45) wird nie angesprochen | **Firmware** | `sensor_registry.cpp:13` hardcoded 0x44, `configureSensor()` Zeilen ~232, 353, 411 + `performMultiValueMeasurement()` Zeile 1061 nutzen `capability->i2c_address` statt `config.i2c_address` | **CRITICAL** |
| BUG-2 | SHT31: NVS verliert i2c_address nach Reboot + Dedup-Kollision | **Firmware** | NVS-Schema hat keinen Key fuer i2c_address (`sen_{i}_i2c` fehlt). `saveSensorConfig()` Dedup (Zeile 1646-1657) prueft GPIO+type+onewire aber NICHT i2c_address — zwei SHT31 ueberschreiben sich in NVS | **CRITICAL** |
| BUG-3 | DS18B20: Werte "vermischen" sich im Frontend Live-Update | **Frontend + Backend** | `sensor.store.ts:121-123` UND `:246` matchen via `gpio + sensor_type` ohne Adresse. `SensorDataEvent` fehlt `config_id`/Adressen. WS-Broadcast-Payload enthaelt keine Adressen | **HIGH** |
| BUG-4 | sensor_data: Adressen nicht in Metadata gespeichert → DB-Werte nicht unterscheidbar | **Backend** | `sensor_handler.py:390-392` speichert nur `{"raw_mode": raw_mode}` in sensor_metadata | **HIGH** |

---

## Phase 1: Firmware — SHT31 Multi-Address (CRITICAL)

**Aufwand:** ~2-3h | **Agent:** esp32-dev
**Blockiert:** Alles SHT31-bezogene. Ohne diesen Fix sendet die Firmware nur Daten von 0x44.

### Kontext: Wie SHT31 in der Firmware funktioniert

Die Firmware nutzt KEINE Adafruit_SHT31-Library. Stattdessen wird das SHT31-Protokoll direkt implementiert:
- `I2CBusManager` fuer Bus-Kommunikation — **Datei:** `src/drivers/i2c_bus.cpp` (Klasse heisst I2CBusManager, Datei heisst i2c_bus.cpp)
- `i2c_sensor_protocol.cpp` fuer SHT31-spezifische Commands
- SHT31-Command: `0x2400` (Single-Shot, High Repeatability), 6 Bytes Response (2 Temp + CRC + 2 Hum + CRC)
- `performMultiValueMeasurement()` in `sensor_manager.cpp:1061` liest BEIDE Werte (temp + humidity) in einem I2C-Read

Die `sensor_registry.cpp:13` (Pfad: `src/models/sensor_registry.cpp`) definiert SHT31 als "Capability" mit einer festen i2c_address (0x44). Diese Capability wird von `configureSensor()` und `performMultiValueMeasurement()` verwendet — anstatt der tatsaechlichen `config.i2c_address` aus dem MQTT-Payload.

### Vorbedingung pruefen

**MQTT-Config-Parse:** Bevor `configureSensor()` aufgerufen wird, muss `config.i2c_address` aus dem MQTT-Payload in die `SensorConfig`-Struct geladen werden. Pruefen wo der MQTT-Config-Parse stattfindet (Referenz: `main.cpp:2692` im grep). Sicherstellen dass `i2c_address` aus dem JSON-Payload (`"i2c_address": 69`) korrekt in `config.i2c_address` (uint8_t) uebernommen wird. Falls das NICHT passiert, muss der Parse-Code ZUERST gefixt werden.

### IST-Zustand (6 Stellen)

**Stelle 1 — sensor_registry.cpp:13** (`src/models/sensor_registry.cpp`)
```cpp
// SHT31 capability hardcoded mit i2c_address = 0x44
// Es gibt keinen Eintrag fuer 0x45
```
Das Sensor-Registry definiert pro Sensor-Typ eine "Capability" mit Default-Parametern. Fuer SHT31 ist `i2c_address = 0x44` fest verdrahtet. Diese Capability wird als Lookup-Key und als Mess-Adresse verwendet.

**Stelle 2 — sensor_manager.cpp:~232 (configureSensor Lookup)**
```cpp
// Ruft findSensorConfig() mit capability->i2c_address auf
// Nicht mit config.i2c_address aus dem MQTT-Payload
lookup_i2c_addr = capability->i2c_address;  // IMMER 0x44
```

**Stelle 3 — sensor_manager.cpp:353 (configureSensor Conflict-Detection)**
```cpp
// Conflict-Detection nutzt ebenfalls capability->i2c_address
// Muss config.i2c_address verwenden
```

**Stelle 4 — sensor_manager.cpp:411 (configureSensor Config-Speicherung)**
```cpp
// Speichert capability->i2c_address in sensors_[]
sensors_[idx].i2c_address = capability->i2c_address;  // IMMER 0x44
// Muss config.i2c_address verwenden
```

**Stelle 5 — sensor_manager.cpp:1061 (performMultiValueMeasurement)**
```cpp
// I2C-Read verwendet capability->i2c_address (immer 0x44)
device_addr = capability->i2c_address;
readI2CSensor(device_addr, 0x2400, ...);
```

**Stelle 6 — config_manager.cpp: NVS-Schema + Dedup**
```
Key-Schema fuer Sensoren in NVS:
sen_{i}_gpio, sen_{i}_type, sen_{i}_name, sen_{i}_sz, sen_{i}_act,
sen_{i}_raw, sen_{i}_mode, sen_{i}_int, sen_{i}_ow

FEHLT: sen_{i}_i2c → I2C-Adresse

Dedup in saveSensorConfig() (Zeile 1646-1657):
Prueft GPIO + sensor_type + onewire_address — aber NICHT i2c_address!
Zwei SHT31 mit GPIO=0, type=sht31_temp, ow="" aber verschiedenen i2c_address
wuerden sich gegenseitig in NVS UEBERSCHREIBEN.
```

### SOLL-Zustand + Fix

**Fix 1 — sensor_registry.cpp bleibt unveraendert**

Die Capability in `sensor_registry.cpp` behaelt den Default 0x44 — sie dient als Fallback wenn keine Adresse angegeben wird. Der Fix sitzt in den Stellen die `capability->i2c_address` verwenden.

**Fix 2 — sensor_manager.cpp: config.i2c_address statt capability->i2c_address (4 Stellen)**

An ALLEN 4 Stellen (Zeilen ~232, 353, 411, 1061) das gleiche Muster:

```cpp
// Effektive I2C-Adresse bestimmen: Config hat Vorrang, Capability ist Fallback
uint8_t effective_i2c_address = config.i2c_address;
if (effective_i2c_address == 0 && capability->i2c_address != 0) {
    effective_i2c_address = capability->i2c_address;  // Fallback auf Registry-Default
}
```

**Zeile ~232 (Lookup):**
```cpp
// IST:  findSensorConfig(gpio, capability->i2c_address)
// SOLL: findSensorConfig(gpio, effective_i2c_address)
```

**Zeile 353 (Conflict-Detection):**
```cpp
// IST:  Conflict-Check mit capability->i2c_address
// SOLL: Conflict-Check mit effective_i2c_address
```

**Zeile 411 (Config-Speicherung):**
```cpp
// IST:  sensors_[idx].i2c_address = capability->i2c_address
// SOLL: sensors_[idx].i2c_address = effective_i2c_address
```

**Zeile 1061 (Measurement):**
```cpp
// IST:  device_addr = capability->i2c_address
// SOLL: device_addr = config.i2c_address  (hier direkt aus der gespeicherten Config)
```

So wird fuer 0x44 der bestehende Sensor gefunden (Update), und fuer 0x45 kein Treffer → neuer Sensor (Add). Beide koexistieren im `sensors_[]`-Array (10 Slots).

**Fix 3 — config_manager.cpp: i2c_address in NVS — DREI Teile**

**(a) Speichern** — in `saveSensorConfig()`:
```cpp
// Neuer Key: sen_{i}_i2c
preferences.putUInt(key_i2c, config.i2c_address);
```

**(b) Laden** — in `loadSensorConfig()`:
```cpp
config.i2c_address = preferences.getUInt(key_i2c, 0);
// Wenn 0 und interface_type == I2C: Fallback auf capability->i2c_address
```

**(c) Dedup-Logik erweitern** — in `saveSensorConfig()` Zeile 1646-1657:
```cpp
// IST: Dedup prueft GPIO + sensor_type + onewire_address
// SOLL: Dedup prueft GPIO + sensor_type + onewire_address + i2c_address

// Analog zu onewire_address at line 1649:
if (existing.gpio == config.gpio &&
    existing.sensor_type == config.sensor_type &&
    existing.onewire_address == config.onewire_address &&
    existing.i2c_address == config.i2c_address) {  // NEU
    // Duplikat gefunden → Update statt Add
}
```

**OHNE Teil (c) ueberleben die Multi-SHT31-Configs KEINEN Reboot** — zwei SHT31 mit GPIO=0, type=sht31_temp, ow="" wuerden als Duplikat erkannt und der zweite ueberschreibt den ersten.

### MQTT-Payload — Bereits korrekt

Der MQTT-Sensor-Daten-Payload enthaelt bereits `i2c_address` wenn `!= 0` (`sensor_manager.cpp:1596-1599`):
```json
{"sensor_type": "sht31_temp", "value": 20.6, "unit": "C", "i2c_address": 68, "gpio": 0}
```

Nach Fix 2 (Zeile 1061) wird der Sensor auf 0x45 korrekt lesen und im Payload `"i2c_address": 69` senden. Keine Aenderung am Payload-Code noetig.

### Akzeptanzkriterien Phase 1

- [ ] Serial Log zeigt: `Configured I2C sensor 'sht31_temp' at address 0x44` UND `Configured I2C sensor 'sht31_temp' at address 0x45` — zwei separate Eintraege, KEIN "Updating existing"
- [ ] Serial Log zeigt: `Configured I2C sensor 'sht31_humidity' at address 0x44` UND `Configured I2C sensor 'sht31_humidity' at address 0x45` — analog
- [ ] "Active Sensors" in POST-SETUP DIAGNOSTICS zeigt mindestens 4 (2x temp + 2x humidity) statt 1
- [ ] MQTT-Monitor zeigt Payloads mit SOWOHL `"i2c_address": 68` ALS AUCH `"i2c_address": 69`
- [ ] Die Temperatur-/Feuchtigkeitswerte von 0x44 und 0x45 sind unterschiedlich
- [ ] Nach Reboot (Power-Cycle): Beide SHT31-Adressen werden aus NVS geladen und beide Sensoren messen korrekt
- [ ] Kein "Sensor type changed" Ping-Pong mehr im Log
- [ ] Kein CRC-Error-Anstieg gegenueber Single-SHT31-Betrieb

### Einschraenkungen Phase 1

- NUR SHT31-spezifischen Code aendern. Kein Refactoring anderer Sensor-Typen.
- Die `sensor_registry.cpp` Capability fuer SHT31 behaelt 0x44 als Default.
- DS18B20-Code NICHT anfassen — funktioniert bereits korrekt.
- `findSensorConfig()` selbst NICHT aendern — P2-Fix ist korrekt. Nur die AUFRUFER muessen die richtige Adresse uebergeben.

---

## Phase 2: Backend — sensor_data Metadata + WS-Broadcast + config_handler Fix (HIGH)

**Aufwand:** ~2-3h | **Agent:** server-dev
**Blockiert:** Korrekte Datenzuordnung in der DB, historische Auswertungen, Frontend Live-Update

### Kontext

Wenn Phase 1 implementiert ist, sendet die Firmware korrekte MQTT-Payloads fuer beide SHT31 (mit `i2c_address: 68` bzw. `69`) und beide DS18B20 (mit `onewire_address: "28FF641F7FCCBAE1"` bzw. `"28FF641F7C58B083"`).

Der Backend `sensor_handler.py` muss diese Adressen korrekt in Metadata speichern und im WebSocket-Broadcast weitergeben. Ausserdem muss `config_handler.py:369` den neuen Adress-Lookup verwenden.

### BEREITS KORREKT (kein Fix noetig)

**sensor_handler.py:205-236 — Sensor-Config-Lookup ist BEREITS korrekt** (P1-Fix). Nutzt `get_by_esp_gpio_type_and_i2c()` / `get_by_esp_gpio_type_and_onewire()` mit Fallback auf `get_by_esp_gpio_and_type()`. ~~Fix 6 aus der Originalversion ist GESTRICHEN.~~

### IST-Zustand (3 Stellen)

**Stelle 1 — sensor_handler.py:390-392 (sensor_metadata)**

Aktuell wird nur `{"raw_mode": raw_mode}` gespeichert. Die `i2c_address` und `onewire_address` aus dem MQTT-Payload werden NICHT in sensor_data persistiert.

**Stelle 2 — sensor_handler.py:476-492 (WebSocket-Broadcast)**

Der WS-Broadcast-Dict enthaelt aktuell: `esp_id`, `gpio`, `sensor_type`, `value`, `unit`, `timestamp`, `message`, `device_id`, `severity`, `zone_id`, `subzone_id`. Es fehlen: `config_id`, `i2c_address`, `onewire_address`.

Die Variablen `i2c_address` und `onewire_address` sind bereits als lokale Variablen verfuegbar (Zeilen 198-200). `config_id` ist verfuegbar wenn `sensor_config` gefunden wurde (`sensor_config.config_id`).

**Stelle 3 — config_handler.py:369 (alter Lookup)**

`config_handler.py:369` nutzt noch den alten `get_by_esp_gpio_and_type()` ohne Adress-Parameter. Das ist die vermutliche Quelle der verbleibenden "Multiple configs... Returning first match" Warnungen im Loki-Log.

### SOLL-Zustand + Fix

**Fix 5 — sensor_handler.py:390-392: Adressen in sensor_metadata speichern**

```python
# IST (Zeile 390-392):
metadata = {"raw_mode": raw_mode}

# SOLL:
metadata = {"raw_mode": raw_mode}
if i2c_address:
    metadata["i2c_address"] = i2c_address
if onewire_address:
    metadata["onewire_address"] = onewire_address
```

**Fix 6 — sensor_handler.py:476-492: Adress-Felder in WS-Broadcast einfuegen**

Die neuen Felder in den BESTEHENDEN Broadcast-Dict einfuegen (KEIN neues Dict bauen):

```python
# In den bestehenden Dict bei Zeile 478-491 einfuegen:
broadcast_data = {
    # ... bestehende Felder (esp_id, gpio, sensor_type, value, etc.) ...
    # NEU — am Ende einfuegen:
    "config_id": sensor_config.config_id if sensor_config else None,
    "i2c_address": i2c_address if i2c_address else None,
    "onewire_address": onewire_address if onewire_address else None,
}
```

`i2c_address` und `onewire_address` sind lokale Variablen (Zeilen 198-200), direkt verfuegbar. `config_id` nur wenn `sensor_config` gefunden wurde.

**Fix 7 — config_handler.py:369: Adress-Lookup verwenden**

```python
# IST (Zeile 369):
config = sensor_repo.get_by_esp_gpio_and_type(esp_id, gpio, sensor_type)

# SOLL:
if i2c_address:
    config = sensor_repo.get_by_esp_gpio_type_and_i2c(esp_id, gpio, sensor_type, i2c_address)
elif onewire_address:
    config = sensor_repo.get_by_esp_gpio_type_and_onewire(esp_id, gpio, sensor_type, onewire_address)
else:
    config = sensor_repo.get_by_esp_gpio_and_type(esp_id, gpio, sensor_type)
```

Analog zum Pattern in `sensor_handler.py:205-236` (das bereits korrekt ist). Die "Multiple configs" Warnung darf danach NUR noch bei Legacy-Payloads ohne Adresse erscheinen.

### Akzeptanzkriterien Phase 2

- [ ] sensor_data-Eintraege fuer SHT31 enthalten `sensor_metadata.i2c_address` (68 oder 69)
- [ ] sensor_data-Eintraege fuer DS18B20 enthalten `sensor_metadata.onewire_address` (ROM-Code)
- [ ] WS-Broadcast fuer sensor_data enthaelt `config_id`, `i2c_address`, `onewire_address`
- [ ] "Multiple configs" Warnung erscheint NICHT mehr fuer Payloads die eine Adresse enthalten
- [ ] Bestehende sensor_data ohne Adresse in metadata funktionieren weiterhin (kein Breaking Change)

### Einschraenkungen Phase 2

- Keine Schema-Aenderung an der sensor_data-Tabelle (metadata ist JSONB — flexibel).
- Keine DB-Migration fuer bestehende Daten. Alte Eintraege bleiben ohne Adresse.
- Bestehende WS-Broadcast-Felder NICHT aendern — nur hinzufuegen.

---

## Phase 3: Frontend — WebSocket Live-Update Differenzierung (HIGH)

**Aufwand:** ~1-2h | **Agent:** frontend-dev
**Abhaengigkeit:** Phase 2 muss abgeschlossen sein (WS-Broadcast enthaelt Adress-Felder)

### Kontext

Das Frontend empfaengt Sensor-Daten ueber WebSocket-Events. Das `SensorDataEvent`-Interface und der `sensor.store.ts` matchen eingehende Daten ausschliesslich via `gpio + sensor_type`. Bei zwei DS18B20 auf GPIO 4 oder zwei SHT31 auf GPIO 0 trifft das Update immer den ERSTEN Treffer — die Werte "vermischen" sich.

### IST-Zustand (3 Stellen)

**Stelle 1 — websocket-events.ts:47-55 (SensorDataEvent Interface)**

Das Interface enthaelt die Felder unter einem `data`-Block (NICHT flach). Es hat KEIN `config_id`, KEIN `onewire_address`, KEIN `i2c_address`. `processed_value` existiert NICHT. `quality` (string) existiert aber fehlt im bisherigen Plan. `timestamp` ist `number` (Unix), NICHT `string`.

**Stelle 2 — sensor.store.ts:121-123 (WebSocket-Handler — erster Match)**

```typescript
// IST: Matcht NUR via gpio + sensor_type
const sensor = sensors.find(s => s.gpio === event.data.gpio && s.sensor_type === event.data.sensor_type);
```

**Stelle 3 — sensor.store.ts:246 (handleSingleValueSensorData — ZWEITER Match, IDENTISCH)**

```typescript
// IST: Gleiches Matching-Pattern wie Zeile 121
// MUSS ebenfalls gefixt werden!
```

### SOLL-Zustand + Fix

**Fix 8 — websocket-events.ts: SensorDataEvent Interface erweitern**

Die neuen Felder im `data`-Block hinzufuegen:

```typescript
interface SensorDataEvent {
    type: "sensor_data";
    data: {
        esp_id: string;
        gpio: number;
        sensor_type: string;
        value: number;
        unit: string;
        quality: string;
        timestamp: number;        // Unix timestamp, NICHT string
        message: string;
        device_id: string;
        severity: string;
        zone_id: string | null;
        subzone_id: string | null;
        // NEU:
        config_id?: string;
        i2c_address?: number;
        onewire_address?: string;
    };
}
```

**Kein `processed_value`** — das Feld existiert nicht im WS-Event.

**Fix 9 — sensor.store.ts: Matching erweitern — BEIDE Stellen (Zeile 121 UND 246)**

Eine gemeinsame Match-Funktion extrahieren und an BEIDEN Stellen verwenden:

```typescript
// Match-Funktion (kann als lokale Helper oder importierte Utility):
function matchSensorToEvent(sensor: SensorConfig, eventData: SensorDataEvent['data']): boolean {
    // Primaer: config_id Match (sicherster Key)
    if (eventData.config_id && sensor.config_id) {
        return sensor.config_id === eventData.config_id;
    }
    // Basis: gpio + sensor_type muessen stimmen
    if (sensor.gpio !== eventData.gpio || sensor.sensor_type !== eventData.sensor_type) return false;
    // Adress-Differenzierung wenn vorhanden
    if (eventData.i2c_address && sensor.i2c_address) return sensor.i2c_address === eventData.i2c_address;
    if (eventData.onewire_address && sensor.onewire_address) return sensor.onewire_address === eventData.onewire_address;
    // Legacy: kein Adress-Feld → erster Treffer (Rueckwaertskompatibilitaet)
    return true;
}

// Zeile 121:
const sensor = sensors.find(s => matchSensorToEvent(s, event.data));

// Zeile 246 (handleSingleValueSensorData):
const sensor = sensors.find(s => matchSensorToEvent(s, event.data));
```

### Akzeptanzkriterien Phase 3

- [ ] Zwei DS18B20 auf GPIO 4 zeigen im Frontend VERSCHIEDENE Live-Werte (nicht mehr den gleichen Wert)
- [ ] Aenderung am einen DS18B20-Sensor blinkt NICHT beim anderen auf (kein "Vermischen")
- [ ] Zwei SHT31 (0x44 + 0x45) zeigen separate Temperatur- und Feuchtigkeitswerte
- [ ] TypeScript-Compiler (`vue-tsc --noEmit`): Keine Fehler nach Interface-Erweiterung
- [ ] Legacy-Sensoren (ohne config_id im Event) funktionieren weiterhin

### Einschraenkungen Phase 3

- Nur das Matching im WebSocket-Handler aendern. Keine Aenderung an REST-API-Responses.
- SensorDataEvent-Erweiterung ist ADDITIV — neue optionale Felder, kein Breaking Change.
- Dashboard-Widgets (HistoricalChart, etc.) die via `sensorId = espId:gpio:sensorType` arbeiten, brauchen hier KEINEN Fix — die nutzen REST-API, nicht WebSocket Live-Updates.
- BEIDE Match-Stellen (121 + 246) muessen gefixt werden.

---

## Phase 4: Config-Push Debounce (MEDIUM)

**Aufwand:** ~1h | **Agent:** server-dev
**Unabhaengig** von Phase 1-3, kann parallel oder spaeter gemacht werden

### Kontext

Die Analyse hat gezeigt dass es 6 Aufrufer fuer Config-Pushes gibt, aber nur der Heartbeat-Trigger (120s Cooldown) einen Throttle hat. CRUD-Operationen (Sensor Create/Update/Delete, Actuator Create/Update/Delete) triggern SOFORT einen Config-Push.

### IST-Zustand

6 Aufrufer, 5 davon ohne Cooldown:

| Aufrufer | Datei:Zeile | Cooldown |
|----------|------------|----------|
| Sensor Create (Multi-Value) | `api/v1/sensors.py:766` | NEIN |
| Sensor Create/Update | `api/v1/sensors.py:1058` | NEIN |
| Sensor Delete | `api/v1/sensors.py:1203` | NEIN |
| Actuator Create/Update | `api/v1/actuators.py:628` | NEIN |
| Actuator Delete | `api/v1/actuators.py:1170` | NEIN |
| Heartbeat `_auto_push_config` | `heartbeat_handler.py:1312` | JA, 120s |

### SOLL-Zustand + Fix

**Fix 10 — Config-Push Debounce fuer CRUD-Operationen**

```python
import asyncio

class ConfigPushDebouncer:
    """Sammelt Config-Push-Anfragen und fuehrt sie nach einem Fenster aus."""

    def __init__(self, delay_seconds: float = 3.0):
        self._pending: dict[str, asyncio.TimerHandle] = {}
        self._delay = delay_seconds

    def schedule_push(self, esp_id: str):
        """Plant einen Config-Push. Bei erneutem Aufruf innerhalb von
        delay_seconds wird der Timer zurueckgesetzt (Debounce)."""
        if esp_id in self._pending:
            self._pending[esp_id].cancel()
        loop = asyncio.get_running_loop()  # NICHT get_event_loop() (deprecated seit 3.10)
        self._pending[esp_id] = loop.call_later(
            self._delay,
            lambda eid=esp_id: asyncio.create_task(self._execute_push(eid))
        )

    async def _execute_push(self, esp_id: str):
        self._pending.pop(esp_id, None)
        await config_push_service.push_config(esp_id)
```

Die 5 CRUD-Aufrufer rufen `debouncer.schedule_push(esp_id)` statt direkt `push_config()`. Heartbeat-Trigger bleibt UNVERAENDERT.

### Akzeptanzkriterien Phase 4

- [ ] 3 Sensoren schnell hintereinander anlegen → nur 1 Config-Push
- [ ] Config-Push erfolgt spaetestens 3s nach letzter CRUD-Operation
- [ ] Heartbeat-basierter Config-Push funktioniert unabhaengig
- [ ] Loeschen + Neuanlage = 1 finaler Push mit korrektem Zustand

---

## Gesamte Fix-Reihenfolge

```
Phase 1 (Firmware SHT31)       ← CRITICAL, blockiert SHT31-Funktion
    ↓
Phase 2 (Backend Metadata+WS)  ← HIGH, blockiert DB-Differenzierung + WS-Events
    ↓
Phase 3 (Frontend WS-Match)    ← HIGH, blockiert Live-Anzeige
    ↓
Phase 4 (Config Debounce)      ← MEDIUM, unabhaengig, jederzeit
```

---

## Korrektur bisheriger Auftraege

| Auftrag | Alt | Neu |
|---------|-----|-----|
| **DS18B20-A** (Firmware) | "Auslesen per ROM-Code statt Index" | **OBSOLET** — ROM-Code-basiert korrekt |
| **SHT31-A** (Firmware) | "Adafruit_SHT31 mit begin(0x45)" | **KORRIGIERT** — Kein Adafruit. 6 Stellen: registry + configureSensor (4x) + NVS (3 Teile) |
| **DS18B20-B, SHT31-B, SUBZONE-FW** | Subzone-Fixes | **ZURUECKGESTELLT** — nach Phase 1-3 |

**NEU:** BUG-3 (FE WS-Match, 2 Stellen), BUG-4 (BE Metadata), config_handler.py Lookup, Config-Push Debounce

---

## v2 Aenderungsprotokoll

| Korrektur | Was geaendert |
|-----------|--------------|
| Agent-Namen | firmware-agent → esp32-dev, backend-agent → server-dev, frontend-agent → frontend-dev |
| I2C-Bus-Datei | `src/services/i2c/i2c_bus_manager.cpp` → `src/drivers/i2c_bus.cpp` |
| Fix 2 erweitert | +Zeile 353 (Conflict-Detection) + Zeile 411 (Config-Speicherung) |
| Fix 3 → Fix 3(a/b/c) | NVS-Dedup-Logik hinzugefuegt (Zeile 1646-1657) — KRITISCH fuer Reboot-Persistenz |
| Fix 6 alt GESTRICHEN | sensor_handler Lookup ist BEREITS korrekt (P1-Fix). Stattdessen config_handler.py:369 |
| Fix 7 korrigiert | In BESTEHENDEN Broadcast-Dict einfuegen, nicht neues Dict bauen |
| Fix 8 korrigiert | Felder unter `data: {}` genested, kein `processed_value`, `timestamp: number`, `quality` ergaenzt |
| Fix 9 erweitert | ZWEITE Match-Stelle sensor.store.ts:246 (handleSingleValueSensorData) hinzugefuegt |
| Vorbedingung | MQTT-Config-Parse pruefen (main.cpp:2692) — config.i2c_address muss geladen werden |
| Phase 4 | `asyncio.get_event_loop()` → `asyncio.get_running_loop()` |
