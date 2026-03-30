# ESP32 Dev Report: SHT31 Multi-I2C-Address Fix (Phase 1)

## Modus: B (Implementierung)

## Datum: 2026-03-28

## Auftrag
Zwei SHT31-Sensoren am I2C-Bus (0x44 und 0x45) konnten nicht gleichzeitig aktiv sein.
Firmware verwendete ueberall `capability->i2c_address` (statisch 0x44 aus sensor_registry.cpp)
statt `config.i2c_address` aus dem MQTT-Payload. Resultat: Ping-Pong-Schleife, "Active Sensors: 1".

## Codebase-Analyse

Analysierte Dateien:
- `El Trabajante/src/services/sensor/sensor_manager.cpp` — vollstaendig gelesen
- `El Trabajante/src/services/config/config_manager.cpp` — saveSensorConfig/loadSensorConfig/Dedup gelesen
- `El Trabajante/src/services/config/storage_manager.h` — API-Verfuegbarkeit geprueft (putUInt8/getUInt8)

Gefundene Patterns:
- NVS-Schluessel-Schema `sen_%d_*` (max 15 Zeichen, Pattern aus NVS_SEN_OW uebernommen)
- `effective_i2c_address`-Idiom analog zum OneWire-Muster (`config.addr || fallback`)
- Dedup-Logik in saveSensorConfig: GPIO + sensor_type + onewire_address → erweitert um i2c_address
- I2C-Dedup-Array `measured_i2c_addrs[]` in performAllMeasurements → fixiert auf stored address

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | Nur bestehende Dateien geaendert, keine neuen Includes noetig |
| 2 | Namenskonvention | `effective_i2c_address` snake_case, `NVS_SEN_I2C` UPPER_SNAKE — konform |
| 3 | Rueckwaertskompatibilitaet | NVS-Load default=0 → capability-Fallback greift fuer alte Eintraege — kein Breaking Change |
| 4 | Wiederverwendbarkeit | Existierende Manager-Patterns erweitert, kein paralleler Code eingefuehrt |
| 5 | Speicher & Ressourcen | +1 uint8_t NVS pro I2C-Sensor (vernachlaessigbar), kein Heap-Impact |
| 6 | Fehlertoleranz | Fallback auf capability->i2c_address bleibt wenn config.i2c_address == 0 |
| 7 | Seiteneffekte | I2C-Dedup nutzt jetzt sensors_[i].i2c_address (gesetzt zum Configure-Zeitpunkt) — korrekt |
| 8 | Industrielles Niveau | Kein Blocking, NVS-Key sen_0_i2c = 10 Zeichen (Limit 15 Zeichen eingehalten) |

## Cross-Layer Impact

| Bereich | Aenderung | Ergebnis |
|---------|-----------|----------|
| MQTT-Payload | Keine — i2c_address wurde bereits gesendet wenn != 0 | kein Eingriff noetig |
| Error-Codes | Keine neuen Error-Codes | kein Eingriff noetig |
| Server | Kein Eingriff — Server sendet bereits i2c_address im Config-Push | kein Eingriff noetig |
| sensor_registry.cpp | Unveraendert — Default 0x44 bleibt als Fallback | kein Eingriff noetig |

## Implementierte Aenderungen

### sensor_manager.cpp — 6 Fix-Stellen

**Fix 1 (Z.~232): findSensorConfig Lookup — effective_i2c_address einfuehren**
```cpp
uint8_t effective_i2c_address = config.i2c_address;
if (effective_i2c_address == 0 && capability != nullptr && capability->i2c_address != 0) {
    effective_i2c_address = capability->i2c_address;  // Fallback zur Registry-Default
}
SensorConfig* existing = findSensorConfig(config.gpio, config.onewire_address, effective_i2c_address);
```

**Fix 2 (Z.~247-292): Multi-value Match-Block**
`existing_cap->i2c_address` → `sensors_[k].i2c_address` (gespeicherte statt Registry-Adresse)
`capability->i2c_address` → `effective_i2c_address` in allen Vergleichen und Speicheroperationen

**Fix 3 (Z.~353): Conflict-Detection**
`uint8_t i2c_address = capability->i2c_address` entfernt.
`existing_cap->i2c_address == i2c_address` → `sensors_[i].i2c_address == effective_i2c_address`

**Fix 4 (Z.~411): Speicherung im sensors_[]-Array**
`sensors_[sensor_count_].i2c_address = i2c_address` → `= effective_i2c_address`
NVS-Save korrigiert: `saveSensorConfig(sensors_[sensor_count_ - 1])` (nach Eintragen der Adresse)

**Fix 5 (Z.~1061): performMultiValueMeasurement I2C-Read**
`uint8_t device_addr = capability->i2c_address` → `= config->i2c_address`
Liest jetzt vom physischen Geraet an der gespeicherten Adresse.

**Fix 6 (Z.~1224): I2C-Dedup in performAllMeasurements**
`uint8_t addr = capability->i2c_address` → `= sensors_[i].i2c_address`
Ohne diesen Fix wuerden 0x44 und 0x45 beide als "schon gemessen bei 0x44" markiert.

### config_manager.cpp — 3 Teile

**Neuer NVS-Key:**
```cpp
#define NVS_SEN_I2C "sen_%d_i2c"  // sen_0_i2c = 10 Zeichen (NVS-Limit 15 eingehalten)
```

**saveSensorConfig — Dedup-Erweiterung:**
Fuer I2C-Sensoren mit i2c_address != 0 wird der gespeicherte NVS-Wert geprueft.
Zwei SHT31 (0x44 vs 0x45) landen in verschiedenen NVS-Slots.

**saveSensorConfig — NVS-Write nach OneWire-Block:**
```cpp
if (config.i2c_address != 0) {
    snprintf(key, sizeof(key), NVS_SEN_I2C, index);
    success &= storageManager.putUInt8(key, config.i2c_address);
}
```

**loadSensorConfig — NVS-Read nach OneWire-Block:**
```cpp
snprintf(new_key, sizeof(new_key), NVS_SEN_I2C, i);
config.i2c_address = storageManager.getUInt8(new_key, 0);
```
Default 0 = rueckwaertskompatibel. Alter Eintrag ohne i2c_address → Fallback auf capability.

## Verifikation

```
Environment    Status    Duration
esp32_dev      SUCCESS   00:00:07.340

RAM:   25.0% (81764 / 327680 bytes)
Flash: 92.2% (1208197 / 1310720 bytes)
```

Exit-Code 0, keine Errors, keine Warnings.

## Empfehlung

**NVS-Reset nach Flash noetig:** Alte NVS-Eintraege enthalten kein `sen_X_i2c`. Beim Laden
wird i2c_address=0 geladen, Fallback greift auf capability (0x44) — beide SHT31 wuerden
wieder auf 0x44 zeigen. Loesung: Factory Reset / NVS-Erase vor erstem Start mit neuer Firmware.

**Kein weiterer Agent noetig.** Server-Config-Push muss beide SHT31 mit korrekten Adressen senden:
`"i2c_address": 68` (0x44) und `"i2c_address": 69` (0x45) — ist serverseitig bereits implementiert.

---

*Vorheriger Inhalt (Multi-Sensor IST-Analyse) ist ueberschrieben. Bei Bedarf in git-History.*
Exakte Dokumentation des IST-Zustands der ESP32-Firmware bezueglich Multi-Sensor-Support.
Alle Ergebnisse mit Datei + Zeilennummer.

---

## 1. SensorManager Datenstruktur

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.h`, Zeilen 136-141

```
SensorConfig sensors_[MAX_SENSORS];
uint8_t sensor_count_;
```

**Datenstruktur:** Statisches **Array** (`SensorConfig sensors_[MAX_SENSORS]`), kein std::map, kein std::vector.

**MAX_SENSORS:** Default 10, definierbar ueber `platformio.ini` Build-Flag.

**Key/Index:** Es gibt keinen expliziten Key. Sensoren werden per linearer Suche ueber `sensor_count_` gefunden.

**findSensorConfig() — Lookup-Logik** (`sensor_manager.cpp`, Zeilen 1474-1492):
```
for i in 0..sensor_count_:
  if sensors_[i].gpio != gpio: continue
  if onewire_address != "": if sensors_[i].onewire_address != onewire_address: continue
  if i2c_address > 0:        if sensors_[i].i2c_address != i2c_address: continue
  return &sensors_[i]
return nullptr
```

- GPIO allein = erster Treffer auf diesem GPIO (kein weiterer Filter)
- GPIO + onewire_address = adressbasierter OneWire-Lookup
- GPIO + i2c_address = adressbasierter I2C-Lookup

**Mehrere Sensoren pro GPIO:** JA, moeglich. Der Array kann mehrere Eintraege mit gleichem GPIO haben (jeder hat eigenen `sensor_count_`-Slot). Eintraege werden iterativ gespeichert.

---

## 2. configureSensor() — add vs. update Logik

**Datei:** `sensor_manager.cpp`, Zeilen 201-586

### Phase 1: Lookup-Schluessel bestimmen (Zeilen 230-234)
```cpp
uint8_t lookup_i2c_addr = (capability != nullptr) ? capability->i2c_address : 0;
SensorConfig* existing = findSensorConfig(config.gpio, config.onewire_address, lookup_i2c_addr);
```
**KRITISCH:** `lookup_i2c_addr` kommt aus dem Sensor-Registry (`capability->i2c_address`), NICHT aus `config.i2c_address`. Fuer SHT31 ist das immer **0x44** (hartkodiert im Registry). Ein SHT31 an 0x45 wuerde denselben Lookup-Schluessel bekommen wie ein SHT31 an 0x44.

### Phase 2: Multi-Value-Erkennung (Zeilen 236-291)
Wenn `existing == nullptr && is_i2c_sensor`:
- Sucht ob ein **anderer value_type des gleichen I2C-Geraets** bereits im Array ist
- Prueft: gleiche GPIO + gleiche i2c_address aus Registry + gleicher device_type + ANDERER sensor_type
- Wenn gefunden: neuer Eintrag wird hinzugefuegt (sensor_count_++) — das ermoeglicht `sht31_temp` + `sht31_humidity` als separate Slots

### Phase 3: Update-Pfad (Zeilen 293-326)
Wenn `existing != nullptr`:
- Log: `"Updating existing sensor on GPIO X"`
- `*existing = config` — vollstaendige In-place-Ueberschreibung
- Circuit Breaker Reset

### Phase 4: Neu-Hinzufuegen (Zeilen 328-585)
Wenn kein existing und kein multi-value-Kontext:
- Log: Kein explizites "Added" / "Updating existing" — es gibt **keinen `addSensor()`/`updateSensor()` Call im Log**
- Das Logging aus dem Serial-Log ("Added"/"Updating existing") kommt nicht aus sensor_manager.cpp

**Suche in main.cpp:** `handleSensorConfig` (Zeile 2568) -> `parseAndConfigureSensorWithTracking` (Zeile 2638) -> `sensorManager.configureSensor()` (Zeile 2771). Kein "Added"/"Updating existing" im main.cpp-Pfad.

**Schlussfolgerung "Added"/"Updating existing":** Dieses Logging stammt aus `sensor_manager.cpp` selbst:
- Zeile 295: `"Updating existing sensor on GPIO " + String(config.gpio)`
- Zeile 323: `"Updated sensor on GPIO " + String(config.gpio) + " (" + config.sensor_type + ")"`
- Zeile 420: `"Configured I2C sensor '..." (Neu-Pfad)`
- Zeile 582: `"Configured OneWire/GPIO sensor '..."` (Neu-Pfad)

**Wie viele Sensoren pro GPIO?** Theoretisch bis zu MAX_SENSORS (10) auf einem GPIO, aber praktisch begrenzt durch:
- OneWire: beliebig viele DS18B20 auf dem Bus (unterschiedliche ROM-Codes)
- I2C: maximal 2 SHT31 (0x44 + 0x45), BMP280 nur 1 pro Adresse
- Die Multi-Value-Erkennung in `configureSensor()` sorgt dafuer, dass sht31_temp + sht31_humidity als ZWEI separate Array-Eintraege gespeichert werden

---

## 3. SHT31 — Wie wird "multi-value" behandelt?

**Design-Entscheidung:** Ein SHT31-Geraet wird als ZWEI separate `SensorConfig`-Eintraege gespeichert:
- Eintrag 1: `sensor_type = "sht31_temp"`, `i2c_address = 0x44`
- Eintrag 2: `sensor_type = "sht31_humidity"`, `i2c_address = 0x44`

**Der Server sendet SEPARATE Configs** (je eine fuer `sht31_temp` und `sht31_humidity`). Das ist beabsichtigt.

**Beim Messen:** `performAllMeasurements()` (Zeilen 1135-1306) erkennt multi-value Sensoren:
- Erkennung via `capability->is_multi_value` (Zeile 1219)
- Dedup-Mechanismus (Zeilen 1220-1237): Wenn `sht31_temp` gemessen wird, wird `i2c_address = 0x44` in `measured_i2c_addrs[]` eingetragen
- Wenn `sht31_humidity` dran ist, wird der Eintrag bei 0x44 gefunden → `already_measured = true` → **skip**
- `performMultiValueMeasurement()` liest BEIDE Werte in EINEM I2C-Read und published BEIDE per MQTT

**Adressierung beim Messen:** `performMultiValueMeasurement()` (Zeile 1061) verwendet `capability->i2c_address` = 0x44 (hardkodiert aus Registry). Es gibt KEINE Unterscheidung zwischen zwei SHT31 an 0x44 vs 0x45 beim Messen.

---

## 4. SHT31-Initialisierung — i2c_address-Verwendung

**Registry** (`sensor_registry.cpp`, Zeilen 10-24):
```cpp
static const SensorCapability SHT31_TEMP_CAP = {
    .i2c_address = 0x44,  // Default SHT31 address (0x45 if ADR pin to VIN)
    ...
};
```
**SHT31_HUMIDITY_CAP:** ebenfalls 0x44 (Zeile 21).

**IST-ZUSTAND KRITISCH:** Die Registry kennt NUR die **Default-Adresse 0x44**. Es gibt kein `SHT31_TEMP_CAP_0x45`.

**configureSensor() I2C-Block** (Zeile 353):
```cpp
uint8_t i2c_address = capability->i2c_address;  // Immer 0x44 fuer SHT31!
```
`config.i2c_address` (der aus dem MQTT-Payload extrahierte Wert) wird IGNORIERT bei der tatsaechlichen Geraetekommunikation. Er wird zwar in `sensors_[].i2c_address` gespeichert (Zeile 411), aber beim Messen ist `capability->i2c_address` massgeblich.

**Kein Adafruit_SHT31:** Die Firmware verwendet KEINE Adafruit-Library. Sie implementiert das SHT31-Protokoll direkt via `I2CBusManager` und `i2c_sensor_protocol.cpp`:
- SHT31-Protokoll: Command-based (0x2400), 6 Bytes Response (`i2c_sensor_protocol.cpp`, Zeilen 21-56)
- Die Methode `i2c_bus_->readSensorRaw("sht31", device_addr, buffer, ...)` wird mit der Adresse aus `capability->i2c_address` aufgerufen

**Zwei SHT31 an 0x44 + 0x45:** Bei zwei Config-Eintraegen mit `sensor_type="sht31_temp"` aber unterschiedlichen `i2c_address`-Werten:
- Der `findSensorConfig()`-Lookup mit `lookup_i2c_addr = capability->i2c_address = 0x44` findet den ERSTEN Eintrag mit 0x44
- Ein zweiter SHT31 an 0x45 wuerde denselben `lookup_i2c_addr=0x44` verwenden -> matched den 0x44-Eintrag -> treated as "update"
- **Bug:** Zwei SHT31 an unterschiedlichen I2C-Adressen koennen NICHT gleichzeitig korrekt adressiert werden

---

## 5. DS18B20 — Auslese-Methode

**Datei:** `onewire_bus.cpp`, Zeilen 228-297

**Methode:** ROM-Code-basiert (`getTempC(deviceAddress)`-Aequivalent), NICHT Index-basiert.

Der Ablauf in `readRawTemperature()`:
1. `onewire_->reset()` — Bus reset
2. `onewire_->select(rom_code)` — Spezifisches Geraet auswaehlen via 8-Byte ROM-Code (Zeile 247)
3. `onewire_->write(0x44, 1)` — Convert T-Befehl
4. `delay(750)` — Warte auf Konversion (12-bit, max 750ms)
5. `onewire_->reset()` + `onewire_->select(rom_code)` — Geraet erneut selektieren
6. `onewire_->write(0xBE)` — Read Scratchpad
7. 9 Bytes lesen, CRC pruefen
8. `raw_value = (scratchpad[1] << 8) | scratchpad[0]` — RAW 12-bit Wert

**Der ROM-Code wird beim Auslesen benutzt** (`onewire_->select(rom_code)` Zeile 247 + 265). Kein Index-basiertes Lesen. Korrekte Implementierung fuer Multi-Sensor-OneWire.

**OneWire-Bus-Initialisierung:**
- Einzelner Bus (Single-Bus-Architektur): Zeilen 510-533 in `sensor_manager.cpp`
- `onewire_bus_->begin(config.gpio)` beim ersten DS18B20-Sensor
- Weitere DS18B20 nutzen den bestehenden Bus (CASE B: `owner.startsWith("bus/onewire/")`)
- Bus-Owner: `"bus/onewire/{gpio}"` (onewire_bus.cpp Zeile 81)

---

## 6. NVS-Speicherung

**Namespace:** `"sensor_config"` (config_manager.cpp, Zeile 1608)

**Key-Schema** (config_manager.h, Zeilen 1430-1439):
```
sen_count          → Anzahl gespeicherter Sensoren (uint8)
sen_{i}_gpio       → GPIO (uint8)
sen_{i}_type       → sensor_type (string)
sen_{i}_name       → sensor_name (string)
sen_{i}_sz         → subzone_id (string)
sen_{i}_act        → active (bool)
sen_{i}_raw        → raw_mode (bool)
sen_{i}_mode       → operating_mode (string)
sen_{i}_int        → measurement_interval_ms (uint32)
sen_{i}_ow         → onewire_address (string, optional)
```

**i2c_address wird NICHT in NVS gespeichert!** (Weder in `saveSensorConfig()` noch in `loadSensorConfig()` gibt es einen `NVS_SEN_I2C`-Key). Nach einem Reboot wird `i2c_address` auf den Default-Wert 0 gesetzt (`SensorConfig`-Struct-Default).

**Multi-Value-Dedup in NVS** (config_manager.cpp, Zeilen 1621-1659):
- Match: `stored_gpio == config.gpio && stored_type == config.sensor_type`
- Fuer OneWire zusaetzlich: ROM-Code-Match
- Fuer I2C: **Kein i2c_address-Match** (weil i2c_address nicht gespeichert wird)
- `sht31_temp` und `sht31_humidity` sind unterschiedliche `sensor_type`-Werte → zwei separate NVS-Eintraege

**Beim Laden** (`loadSensorConfig()`, Zeilen 1911-1914): `onewire_address` wird geladen, `i2c_address` wird NICHT geladen (kein NVS-Key dafuer). Nach Reboot gilt `config.i2c_address = 0`, was dann in `configureSensor()` durch `capability->i2c_address` aus dem Registry ueberschrieben wird (Zeile 411: `sensors_[sensor_count_].i2c_address = i2c_address`).

---

## 7. MQTT-Publish bei Sensor-Daten

**Topic-Format** (`sensor_manager.cpp`, Zeile 1521):
```cpp
const char* topic = TopicBuilder::buildSensorDataTopic(reading.gpio);
```
Format: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**JSON-Payload** (`buildMQTTPayload()`, Zeilen 1534-1603):
```json
{
  "esp_id": "...",
  "seq": 123,
  "zone_id": "...",
  "subzone_id": "...",
  "gpio": 0,
  "sensor_type": "sht31_temp",
  "raw": 12345,
  "value": 23.5,
  "unit": "°C",
  "quality": "good",
  "ts": 1700000000,
  "raw_mode": true,
  "i2c_address": 68        // nur wenn i2c_address != 0 (Zeile 1596-1599)
}
```
Fuer OneWire (Zeilen 1589-1593): `"onewire_address": "28FF641E8D3C0C79"` wird hinzugefuegt wenn nicht leer.

**SHT31: ZWEI separate MQTT-Messages.** `performMultiValueMeasurement()` (Zeile 1116) ruft `publishSensorReading()` einmal fuer `sht31_temp` und einmal fuer `sht31_humidity` auf. Topic ist identisch (beide auf GPIO 0), aber `sensor_type` unterscheidet.

---

## 8. handleSensorConfig() — Config-Empfang

**Datei:** `main.cpp`, Zeile 2568

**Ablauf:**
1. JSON parsen: `doc["sensors"]` Array (Zeile 2587)
2. Fuer jeden Sensor-Eintrag: `parseAndConfigureSensorWithTracking()` (Zeile 2614)
3. Diese Funktion: `sensorManager.configureSensor(config)` (Zeile 2771)

**Pro Config-Eintrag wird `configureSensor()` aufgerufen.** Wenn der Server zwei Configs sendet (sht31_temp, sht31_humidity), werden zwei separate `configureSensor()`-Calls ausgefuehrt.

**i2c_address-Extraktion** (main.cpp, Zeilen 2692-2696):
```cpp
int i2c_addr_int = 0;
if (JsonHelpers::extractInt(sensor_obj, "i2c_address", i2c_addr_int, 0)) {
    config.i2c_address = static_cast<uint8_t>(i2c_addr_int);
}
```
Der Wert wird in `config.i2c_address` gespeichert, aber wie unter Punkt 4 beschrieben: `configureSensor()` verwendet `capability->i2c_address` aus dem Registry (immer 0x44 fuer SHT31) statt `config.i2c_address` fuer den Lookup.

**add vs. update Entscheidung:**
- `configureSensor()` entscheidet intern via `findSensorConfig(gpio, onewire_addr, lookup_i2c_addr)`
- Wenn `existing != nullptr` → Update (Zeile 293)
- Wenn `existing == nullptr && is_i2c && gleicher device_type anderer sensor_type` → Multi-Value-Add (Zeile 285)
- Sonst → Neu-Hinzufuegen (Zeile 570)

---

## Zusammenfassung kritischer Befunde

| # | Befund | Schweregrad | Betroffene Dateien |
|---|--------|-------------|-------------------|
| B1 | i2c_address wird nicht in NVS gespeichert/geladen | MITTEL | config_manager.cpp |
| B2 | SHT31-Registry kennt nur 0x44 (kein 0x45-Eintrag) | HOCH | sensor_registry.cpp |
| B3 | configureSensor() verwendet capability->i2c_address fuer Lookup, nicht config.i2c_address | HOCH | sensor_manager.cpp:232 |
| B4 | Zwei SHT31 an 0x44+0x45 koennen nicht gleichzeitig unterschieden werden | HOCH | sensor_manager.cpp, sensor_registry.cpp |
| B5 | performMultiValueMeasurement() hardkodiert capability->i2c_address ohne Config-Override | MITTEL | sensor_manager.cpp:1061 |
| B6 | i2c_address aus MQTT-Config-Payload wird zwar in sensors_[].i2c_address gespeichert, aber bei Reboot verloren | MITTEL | config_manager.cpp (NVS fehlt) |

**DS18B20 (Positiv):** Korrekte ROM-Code-basierte Adressierung. Multi-Sensor auf einem OneWire-Bus funktioniert korrekt.

**Verifikation:** Keine Code-Aenderung, daher kein Build-Lauf noetig.
