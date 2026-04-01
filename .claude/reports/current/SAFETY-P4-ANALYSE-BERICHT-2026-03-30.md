# SAFETY-P4 Analyse-Bericht: Lokale Offline-Hysterese-Regeln

**Modus:** A (Analyse)
**Datum:** 2026-03-30
**Auftrag:** Analyse-Blöcke A-E für SAFETY-P4 Implementierung
**Basis:** `auftrag-SAFETY-P4-lokale-offline-hysterese-2026-03-30.md`

---

## Zusammenfassung

**Go/No-Go: GO.** Alle Annahmen aus dem Auftragsdokument sind korrekt oder weichen nur in Details ab, die dokumentiert werden. Die Implementierung kann wie geplant durchgeführt werden.

---

## Block A — Sensor-Zugriff + Value-Cache-Design

### A1: `sensors_[MAX_SENSORS]` Struktur

Datei: `El Trabajante/src/sensor_manager.h`, Zeile 139

```
SensorConfig sensors_[MAX_SENSORS];
uint8_t sensor_count_;
```

`MAX_SENSORS` ist in `platformio.ini` konfiguriert:
- `esp32_dev`: `MAX_SENSORS=20` (Zeile 89)
- `seeed_xiao_esp32c3`: `MAX_SENSORS=10` (Zeile 27)

`SensorConfig` Struct (`sensor_types.h`, Zeilen 27–76):
- `gpio` (uint8_t), `sensor_type` (String), `sensor_name` (String), `subzone_id` (String)
- `active` (bool), `operating_mode` (String), `measurement_interval_ms` (uint32_t)
- `raw_mode` (bool, immer true), `last_raw_value` (uint32_t), `last_reading` (unsigned long)
- `onewire_address` (String), `i2c_address` (uint8_t)
- Circuit-Breaker State: `cb_state` (SensorCBState), `cb_open_since_ms`, `consecutive_failures`
- Kommentar an Zeile 71: `// ❌ NICHT NÖTIG in Server-Centric Architektur: - float last_value`

**Bestätigung:** Es gibt KEINEN float-Cache für gemessene Werte. Exakt wie im Auftrag beschrieben.

### A2: `SensorReading` Struct

Datei: `El Trabajante/src/models/sensor_types.h`, Zeilen 81–117

```cpp
struct SensorReading {
  uint8_t gpio;
  String sensor_type;    // ← HIER: value_type wird als sensor_type gesetzt
  String subzone_id;
  uint32_t raw_value;
  float processed_value;
  String unit;
  String quality;
  unsigned long timestamp;
  bool valid;
  String error_message;
  bool raw_mode = true;
  String onewire_address = "";
  uint8_t i2c_address = 0;
};
```

**KRITISCHE ABWEICHUNG — Feld heisst `sensor_type`, nicht `value_type`:**

Das Auftragsdokument spricht durchgängig von `reading.value_type`. Im Code heisst das Feld `reading.sensor_type`. Bei Multi-Value-Sensoren wird dieses Feld mit dem **value_type** befüllt — `"sht31_humidity"`, `"sht31_temp"` etc. (siehe `sensor_manager.cpp` Zeile 1111: `reading.sensor_type = server_sensor_type`).

Das Feld ist vom Typ `String` (dynamisch, Arduino-String).

**Empfehlung für Implementierung:** In allen P4-Funktionen `reading.sensor_type` verwenden, nicht `reading.value_type`.

### A3: Einfügepunkt für `updateValueCache()`

`performAllMeasurements()` läuft von Zeile 1147 bis 1318 in `sensor_manager.cpp`.

**Zwei Codepfade pro Sensor-Typ:**

**Pfad 1 — Multi-Value-Sensoren (SHT31, BMP280, BME280):**
```
sensor_manager.cpp Zeile 1255-1265:
  SensorReading readings[4];
  uint8_t count = performMultiValueMeasurement(sensors_[i].gpio, readings, 4);
  // ← EINFÜGEPUNKT: nach count > 0, für jedes readings[j] wo j < count
  measured_i2c_addrs[measured_i2c_count++] = addr;
  measurement_ok = (count > 0);
```

Der Aufruf `performMultiValueMeasurement()` erzeugt readings und published via `publishSensorReading()` intern (Zeile 1128). Die readings werden NACH dem Publish in das Array zurückgegeben. Korrekt: Value-Cache befüllen NACH `performMultiValueMeasurement()`, aus dem zurückgegebenen Array.

**Pfad 2 — Single-Value-Sensoren (DS18B20, ADC):**
```
sensor_manager.cpp Zeile 1270-1277:
  SensorReading reading;
  if (performMeasurementForConfig(&sensors_[i], reading)) {
    publishSensorReading(reading);
    // ← EINFÜGEPUNKT: hier, nach publishSensorReading
    measurement_ok = true;
  }
```

**Exakter Einfügepunkt (beide Pfade zusammen):**

```
Pfad Multi-Value: Zeile 1262 (nach measurement_ok = (count > 0);)
  for (uint8_t j = 0; j < count; j++) {
      updateValueCache(readings[j].gpio, readings[j].sensor_type.c_str(), readings[j].processed_value);
  }

Pfad Single-Value: Zeile 1273 (nach publishSensorReading(reading);)
  updateValueCache(reading.gpio, reading.sensor_type.c_str(), reading.processed_value);
```

**Wichtig:** Es wird `reading.processed_value` (float) verwendet, nicht `raw_value`. Das ist korrekt — die Offline-Regel vergleicht mit menschlichen Werten (45% Luftfeuchte, nicht 0-65535 Raw).

### A4: Multi-Value-Sensoren (SHT31)

**Befund:** Ein SHT31 ist als EIN SensorConfig-Eintrag gespeichert mit `sensor_type = "sht31"`. In `performAllMeasurements()` erkennt die Dedup-Logik (Zeile 1232–1260): Wenn `capability->is_multi_value` true ist, wird `performMultiValueMeasurement()` NUR EINMAL aufgerufen — und das nur für die ERSTE Config mit dieser I2C-Adresse. Alle weiteren Configs mit gleicher Adresse werden übersprungen (`continue`).

`performMultiValueMeasurement()` erzeugt beide Readings (sht31_temp + sht31_humidity) in einem Aufruf und published beide sofort (Zeile 1128). Das zurückgegebene `count` ist 2 für SHT31.

**Konsequenz für Value-Cache:** Der Cache muss BEIDE readings aus dem Array nehmen (Index 0 und 1). Das ist wie oben im Einfügepunkt beschrieben.

### A5: value_type Strings — statisch oder dynamisch?

`i2c_sensor_protocol.cpp` definiert die Protocol-Registry mit `PROGMEM`-Konstanten:
- SHT31: `value_type = "sht31_temp"` (Zeile 37), `value_type = "sht31_humidity"` (Zeile 44)
- BMP280: `value_type = "bmp280_pressure"` (Zeile 83), `value_type = "bmp280_temp"` (Zeile 89)
- BME280: entsprechend

`sensor_manager.cpp` Zeile 1097–1101:
```cpp
String value_type = value_types[i];  // Kopiert aus Protocol-Tabelle
String server_sensor_type = getServerSensorType(value_type);
// server_sensor_type wird dann in reading.sensor_type kopiert (Zeile 1111)
```

Die Werte in `reading.sensor_type` sind Arduino-Strings — dynamisch auf dem Heap. Für den Value-Cache: `.c_str()` liefert temporären const-char-Pointer. **Im Cache als `char[24]` kopieren** (wie im Auftrag vorgesehen).

### Empfehlungen Block A

**MAX_CACHED_VALUES:** Auftrag schlägt 20 vor (10 Sensoren × 2 Values). Mit `MAX_SENSORS=20` (esp32_dev) und Multi-Value-Sensoren realistisch: 20 × 2 = 40 mögliche Values. Da aber maximal ~10 aktive Sensoren im Praxiseinsatz vorhanden sind und die meisten Single-Value sind, ist **20 ausreichend**. Mit einem Overwrite-Last-If-Full Fallback (bei overflow ältesten Eintrag überschreiben).

**Stale-Timeout:** 60 Sekunden (wie vorgesehen). Bei `measurement_interval_ms` von 30s ist 60s ein sinnvoller 2x-Faktor. Konfigurierbar als Compile-Time-Konstante `OFFLINE_VALUE_STALE_TIMEOUT_MS = 60000`.

---

## Block B — NVS

### B1: Bestehende NVS-Namespaces

Verifiziert in `config_manager.cpp`:
- `wifi_config` (Zeile 119) — WiFi-Zugangsdaten
- `zone_config` (Zeile 262) — Zone/Kaiser-Zuordnung
- `system_config` (Zeile ~320) — Systemkonfiguration, Boot-Counter
- `sensor_config` (Zeile 1609) — Sensor-Configs (Schema: `sen_{i}_gpio`, `sen_{i}_type`, etc.)
- `actuator_config` (Zeile 2188) — Aktor-Configs

Der sechste erwartete Namespace `subzone_config` wurde nicht direkt in config_manager.cpp gefunden, existiert aber (aus dem Auftragsdokument bestätigt).

**Bestätigung:** Namespace `"offline"` (7 Zeichen, Limit 15) hat keinen Konflikt mit bestehenden Namespaces.

### B2: NVS-Partition-Größe

`platformio.ini` Zeile 99 und 37: `board_build.partitions = default.csv` — Standard-Partitionierung für beide Boards.

Standard `default.csv` für ESP32: NVS-Partition = 0x5000 Bytes = 20KB. Übereinstimmend mit SAFETY-MEM Analyse (~12KB nutzbar nach Overhead).

### B3: NVS-Zugriffsmuster

Kein generisches `nvsWrite()/nvsRead()`. Jeder Namespace hat ein eigenes Muster:
```cpp
if (!storageManager.beginNamespace("sensor_config", false)) { return false; }
storageManager.putUInt8("key", value);
storageManager.getString("key", default_value);
storageManager.endNamespace();
```

Pattern ist konsistent über alle Namespaces. `storageManager` ist der NVS-Wrapper (StorageManager-Singleton). `false` = read/write-Modus. `true` = read-only.

### B4: NVS-Ladereihenfolge im Boot

`config_manager.cpp` Zeile 47–53, `loadAllConfigs()`:
1. `loadWiFiConfig()` → Namespace `wifi_config`
2. `loadZoneConfig()` → Namespace `zone_config`
3. `loadSystemConfig()` → Namespace `system_config`

Sensor/Aktor-Configs werden NICHT in `loadAllConfigs()` geladen. Sie werden in `main.cpp` setup() separat geladen (nach SensorManager/ActuatorManager Initialisierung). Offline-Regeln sollten **NACH Sensor-/Aktor-Config** geladen werden — also nach `sensorManager.begin()` und `actuatorManager.begin()`.

**Angepasste Boot-Position für Offline-Regeln:** Zwischen Schritt 13 (ActuatorManager.begin()) und Schritt 14 (noch nicht vorhanden) im Init-Guide.

### B5: NVS-Namespace-Konflikt

**Bestätigt:** Kein Konflikt. Namespace `"offline"` ist frei.

---

## Block C — Loop-Integration

### C1: Vollständige Loop-Reihenfolge

Datei: `main.cpp`. Vollständige Reihenfolge der relevanten Calls in `loop()`:

| Zeile | Aufruf |
|-------|--------|
| ~2472 | `wifiManager.loop()` |
| ~2502 | `mqttClient.loop()` |
| ~2510–2571 | Disconnect-Debounce + MQTT Persistent-Failure-Timer |
| **2575** | `sensorManager.performAllMeasurements()` |
| **2580** | `actuatorManager.processActuatorLoops()` |
| 2581–2585 | Actuator-Status-Publish (alle 30s) |
| **2587–2597** | SAFETY-P1 Mechanism D: Server-ACK-Timeout-Check |
| 2604–2606 | `healthMonitor.loop()` |
| 2609 | `delay(10)` |

### C2: Bestätigung der Zeilen aus Auftragsdokument

| Auftrag behauptet | Tatsächliche Zeile | Status |
|-------------------|-------------------|--------|
| `performAllMeasurements()` bei 2575 | **Zeile 2575** | Exakt korrekt |
| `processActuatorLoops()` bei 2580 | **Zeile 2580** | Exakt korrekt |
| SAFETY-P1-D-Check bei 2587 | **Zeile 2587** | Exakt korrekt |

### C3: Bereits implementierter SAFETY-P1-D-Check

Zeilen 2587–2597: Der Check prüft `g_last_server_ack_ms` gegen `SERVER_ACK_TIMEOUT_MS` (2 Minuten). Bei Timeout: `actuatorManager.setAllActuatorsToSafeState()`. P4 muss diesen Check kennen und ergänzen — nach `setAllActuatorsToSafeState()` auch den Offline-Mode aktivieren (wenn Offline-Regeln vorhanden).

### C4: millis()-Timer Pattern

Etabliertes Pattern in der Codebase:
```cpp
static unsigned long last_xyz = 0;
if (millis() - last_xyz > INTERVAL_MS) {
    last_xyz = millis();
    // ... do work
}
```

Referenz-Instanz direkt über dem Offline-Einfügepunkt (Zeile 2581–2585):
```cpp
static unsigned long last_actuator_status = 0;
if (millis() - last_actuator_status > 30000) {
    actuatorManager.publishAllActuatorStatus();
    last_actuator_status = millis();
}
```

Für Offline-Regelauswertung (5s-Intervall) exakt dieses Pattern übernehmen:
```cpp
static unsigned long last_offline_eval = 0;
if (millis() - last_offline_eval > OFFLINE_EVAL_INTERVAL_MS) {  // 5000ms
    last_offline_eval = millis();
    offlineModeManager.evaluateOfflineRules();
}
```

### C5: Exakter Einfügepunkt für Offline-Regelauswertung

**NACH Zeile 2575** (`performAllMeasurements()`) und **NACH Zeile 2580** (`processActuatorLoops()`), **VOR dem SAFETY-P1-D-Check** bei Zeile 2587.

Idealposition: zwischen Zeile 2585 und 2587.

```
2585: }                                          // Ende actuator_status Timer
2586:                                            // ← NEU: Offline-Regelauswertung
NEW:  if (offlineModeManager.isOfflineActive()) {
NEW:      static unsigned long last_offline_eval = 0;
NEW:      if (millis() - last_offline_eval > OFFLINE_EVAL_INTERVAL_MS) {
NEW:          last_offline_eval = millis();
NEW:          offlineModeManager.evaluateOfflineRules();
NEW:      }
NEW:  }
2587:  // SAFETY-P1 Mechanism D: Server-ACK-Timeout
```

---

## Block D — Backend Config-Builder

### D1: `build_combined_config()` Top-Level-Keys

Datei: `config_builder.py` Zeilen 239–258.

Aktuelles Return-Dict:
```python
config = {
    "sensors": sensor_payloads,   # Array von SensorConfig-Dicts
    "actuators": actuator_payloads,  # Array von ActuatorConfig-Dicts
}
```

Nur `sensors` und `actuators`. **P4 fügt `offline_rules` als dritten Top-Level-Key hinzu.**

### D2: DB-Session und Repositories in `build_combined_config()`

Zeilen 177–192: Folgende Repositories werden initialisiert und genutzt:
- `ESPRepository(db)` — `esp_repo.get_by_device_id(esp_device_id)` → ESP-Objekt
- `SensorRepository(db)` — `sensor_repo.get_by_esp(esp_device.id)` → Sensor-Liste
- `ActuatorRepository(db)` — `actuator_repo.get_by_esp(esp_device.id)` → Aktor-Liste

Der Parameter `db: AsyncSession` ist bereits vorhanden. Für `offline_rules` kann direkt ein zusätzliches SQLAlchemy-Query auf `CrossESPLogic` ausgeführt werden — ohne neues Repository.

### D3: `cross_esp_logic` Tabellenstruktur

Datei: `db/models/logic.py`, Zeilen 29–180+.

Relevante Felder:
- `id` (UUID)
- `rule_name` (String, unique)
- `enabled` (bool)
- `trigger_conditions` (JSON) — Beispiel aus Kommentar: `{'type': 'sensor_threshold', 'esp_id': 'ESP_12AB34', 'gpio': 34, 'sensor_type': 'temperature', 'operator': '>', 'value': 25.0}`
- `actions` (JSON) — Beispiel: `[{'type': 'actuator_command', 'esp_id': 'ESP_12AB34', 'gpio': 18, ...}]`

**WICHTIGE ABWEICHUNG — Kein explizites `type: 'hysteresis'` in `trigger_conditions`:**

Das Auftragsdokument beschreibt Hysterese-Conditions als `type: 'hysteresis'`. Die DB-Doku zeigt aber `type: 'sensor_threshold'` mit Operator-Feldern. Die Logic-Engine verwendet einen `HysteresisConditionEvaluator` — aber wie wird in der DB eine Hysterese-Regel identifiziert?

**Handlungsempfehlung:** Vor der Implementierung `logic_validation.py` und den Logic-Engine-Handler lesen um das exakte Schema zu bestätigen. Das ist ein offener Punkt der vor Block D3-Implementierung geklärt werden muss.

Für Hysterese-Filterung (P4 Anforderung: nur Hysterese-Regeln senden):
- Wenn `type: 'hysteresis'` vorhanden: `trigger_conditions.get('type') == 'hysteresis'`
- Wenn stattdessen `activate_below`/`deactivate_above` Felder existieren: direkt prüfen

### D4: Bestehendes Repository für ESP-ID-Filter

Datei: `config_builder.py` verwendet `ESPRepository` und `SensorRepository`. Ein direktes "Logic-Repository" existiert nicht. Für P4 empfehle ich **direktes SQLAlchemy-Query** in `build_combined_config()`, da der Scope klein ist (ein ESP, max 8 Regeln):

```python
from sqlalchemy import select, and_
from ..db.models.logic import CrossESPLogic

stmt = select(CrossESPLogic).where(
    and_(
        CrossESPLogic.enabled == True,
        # Zusätzlich filtern nach ESP-ID in trigger_conditions und actions
    )
)
```

JSON-Feld-Queries in PostgreSQL (SQLAlchemy):
```python
CrossESPLogic.trigger_conditions["esp_id"].astext == esp_device_id
```

### D5: config_manager.cpp Parsing — Einfügepunkt für `parseOfflineRules()`

Der Config-Push-Topic wird in `main.cpp` Zeile 882–886 verarbeitet:
```cpp
if (topic == config_topic) {
    handleSensorConfig(payload);   // Zeile 884
    handleActuatorConfig(payload); // Zeile 885
    return;
}
```

`handleSensorConfig()` und `handleActuatorConfig()` sind in `main.cpp` implementiert — sie delegieren an `sensorManager` und `actuatorManager`.

**Einfügepunkt:** Zeile 885.5 — nach `handleActuatorConfig()`, vor `return`:
```cpp
if (topic == config_topic) {
    handleSensorConfig(payload);
    handleActuatorConfig(payload);
    handleOfflineRulesConfig(payload);  // ← NEU: P4
    return;
}
```

`handleOfflineRulesConfig()` wird als neue Free Function in `main.cpp` definiert (analog zu `handleActuatorConfig()`), die den Payload weiterreicht an `offlineModeManager.parseOfflineRules(doc)`.

Alternativ: `config_manager.cpp` erhält eine neue `parseOfflineRules(const JsonObject& config)` Methode — aber da der OfflineModeManager (neues Modul) Eigentümer der Daten ist, sollte er selbst parsen. `ConfigManager` bleibt für persönliche Config-Daten (WiFi, Zone, Sensor-Configs).

---

## Block E — Sicherheitsanalyse

### E1: Thread-Safety von `controlActuatorBinary()`

Datei: `actuator_manager.cpp`, Zeile 427:
```cpp
bool ActuatorManager::controlActuatorBinary(uint8_t gpio, bool state) {
    RegisteredActuator* actuator = findActuator(gpio);
    ...
}
```

**Kein Mutex, kein ISR-Callback gefunden.** Der ESP32 läuft im Arduino-Framework mit Single-Threaded-Loop. Die Firmware nutzt `CONFIG_ENABLE_THREAD_SAFETY` (in `platformio.ini` Zeile 23/84) nur für `StorageManager` (NVS-Zugriffe).

Actuator-Commands kommen entweder aus:
1. MQTT-Callback (läuft im `mqttClient.loop()` Kontext, also innerhalb von `loop()`)
2. `processActuatorLoops()` (Runtime Protection + Duration Timer)
3. Zukünftig: Offline-Regelauswertung (ebenfalls in `loop()`)

**Fazit:** Kein echtes Race-Condition-Problem. ESP32 ist single-threaded loop. Alle drei Quellen laufen sequentiell. ABER: MQTT-Callbacks werden innerhalb von `mqttClient.loop()` aufgerufen — das bedeutet ein Server-Command kann während der Offline-Regelauswertung NICHT ankommen (er würde erst beim nächsten `mqttClient.loop()` verarbeitet). Keine Interleaving-Probleme.

### E2: RAM-Budget

Build-Output (soeben durchgeführt):
```
RAM:   [==        ]  20.9% (used 68508 bytes from 327680 bytes)
Flash: [========= ]  92.2% (used 1208989 bytes from 1310720 bytes)
```

Freier RAM: 327680 - 68508 = **259172 Bytes** (~253 KB)
Davon statisch reserviert und für Heap verfügbar: Arduino-ESP32 typischerweise ~180KB Heap.

P4 RAM-Overhead:
- Value-Cache: 20 × ~32 Bytes = 640 Bytes
- OfflineRule Array: 8 × ~36 Bytes = 288 Bytes
- OfflineModeManager State: ~50 Bytes
- Gesamt: ~980 Bytes

**Budget: Komfortabel.** ~1KB bei >250KB freiem RAM = 0.4% Overhead.

### E3: Flash-Budget

Aktuell: 92.2% = 1208989 / 1310720 Bytes.
Freies Flash: 1310720 - 1208989 = **101731 Bytes** (~99 KB)

P4 Code-Zuwachs (Schätzung):
- OfflineModeManager.h/.cpp: ~5–8 KB
- sensor_manager.cpp Erweiterung (Value-Cache): ~2 KB
- config_manager.cpp Erweiterung (parseOfflineRules): ~1 KB
- main.cpp Erweiterungen: ~1 KB
- config_builder.py: kein Flash-Einfluss
- Gesamt: ~9–12 KB

**Budget:** 99 KB frei, ~12 KB Zuwachs = verbleibt ~87 KB frei. **Kein Problem.**

Hinweis: 92.2% Flash ist bereits knapp für weitere große Features, aber P4 ist klein genug.

---

## Abweichungen vom Auftragsdokument

| # | Auftrag-Annahme | Tatsächlicher Befund | Impact |
|---|-----------------|---------------------|--------|
| 1 | `reading.value_type` | Feld heisst `reading.sensor_type` | **Hoch** — alle P4 Value-Cache-Calls müssen `.sensor_type` verwenden |
| 2 | `MAX_SENSORS = 10` | esp32_dev hat `MAX_SENSORS=20`, xiao hat 10 | Niedrig — Value-Cache mit MAX=20 ist auf beiden ausreichend |
| 3 | `type: 'hysteresis'` in trigger_conditions | Schema noch zu verifizieren | **Mittel** — Block D3 Implementierung braucht Verifikation des Logic-Schemas |
| 4 | Config-Push geparst in `config_manager.cpp` | Config-Handler ist in `main.cpp` als Free Function, delegiert an Manager | Niedrig — `handleOfflineRulesConfig()` als Free Function in main.cpp |
| 5 | `MQTT_MAX_PACKET_SIZE=2048` | esp32_dev: 2048 korrekt; xiao: nur 1024 | Niedrig — auf xiao etwas weniger Raum, aber 8 Regeln passen locker in ~400 Bytes |

---

## Empfehlungen für die Implementierung

### Value-Cache-Design (Komponente 0)

```cpp
struct LastSensorValue {
    uint8_t  gpio;
    char     value_type[24];    // Kopie von reading.sensor_type.c_str()
    float    value;             // reading.processed_value (NICHT raw_value)
    uint32_t timestamp_ms;
    bool     valid;
};

static const uint8_t MAX_CACHED_VALUES = 20;
static const uint32_t OFFLINE_VALUE_STALE_TIMEOUT_MS = 60000;
LastSensorValue valueCache_[MAX_CACHED_VALUES];
uint8_t valueCacheCount_ = 0;
```

**Update-Aufruf in `performAllMeasurements()`:**

Pfad 1 (Multi-Value, nach Zeile 1262):
```cpp
for (uint8_t j = 0; j < count; j++) {
    updateValueCache(readings[j].gpio,
                     readings[j].sensor_type.c_str(),
                     readings[j].processed_value);
}
```

Pfad 2 (Single-Value, nach Zeile 1273, nach `publishSensorReading(reading)`):
```cpp
updateValueCache(reading.gpio,
                 reading.sensor_type.c_str(),
                 reading.processed_value);
```

**Lookup:** `getSensorValue()` gibt `NAN` zurück wenn:
- Kein Eintrag für gpio + value_type gefunden
- `millis() - entry.timestamp_ms > OFFLINE_VALUE_STALE_TIMEOUT_MS`
- `entry.valid == false`

**Overwrite-Strategie:** Beim vollständigen Cache (count = MAX_CACHED_VALUES) überschreibt `updateValueCache()` den ältesten Eintrag (kleinster `timestamp_ms`).

### OfflineRule Struct — Feldname-Anpassung

Das Auftrag-Dokument definiert `sensor_value_type[24]`. Da `SensorReading.sensor_type` das relevante Feld ist, ist der Name `sensor_value_type` im OfflineRule-Struct korrekt gewählt — er entspricht dem "value_type"-Konzept, nicht dem `SensorConfig.sensor_type`.

### Einfügepunkte (konkrete Dateien + Zeilen)

| Komponente | Datei | Zeile | Art |
|------------|-------|-------|-----|
| Value-Cache Struct + Array | `sensor_manager.h` | nach Zeile 169 (nach `buildMQTTPayload`) | NEU im private-Bereich |
| `getSensorValue()` Public API | `sensor_manager.h` | nach Zeile 100 (`triggerManualMeasurement`) | NEU im public-Bereich |
| `updateValueCache()` Private | `sensor_manager.h` | nach Value-Cache-Deklaration | NEU private |
| Update in performAllMeasurements | `sensor_manager.cpp` | nach Zeile 1262 + nach Zeile 1273 | EINFÜGUNG |
| OfflineRule Struct | `src/models/offline_rule.h` | NEW FILE | NEU |
| OfflineModeManager | `src/services/safety/offline_mode_manager.h/.cpp` | NEW FILES | NEU |
| handleOfflineRulesConfig() | `main.cpp` | nach Zeile 2884 (nach handleActuatorConfig) | NEU Free Function |
| Config-Topic Handler | `main.cpp` | Zeile 885 (nach handleActuatorConfig Aufruf) | EINFÜGUNG |
| Loop-Integration | `main.cpp` | zwischen Zeile 2585 und 2587 | EINFÜGUNG |
| P1-D-Check Ergänzung | `main.cpp` | Zeile 2594 (nach setAllActuatorsToSafeState) | EINFÜGUNG |
| offline_rules in Config-Push | `config_builder.py` | Zeile 247 (nach actuators in config dict) | ERWEITERUNG |

---

## Offene Punkte vor Implementierung

1. **Logic-Schema verifizieren:** `cross_esp_logic.trigger_conditions` JSON-Schema muss geprüft werden um Hysterese-Regeln korrekt zu filtern. Konkret: `logic_validation.py` und einen Handler-Code lesen (z.B. `logic_engine.py`).

2. **`SAFETY-P1` vollständige Implementierung:** Das Auftragsdokument setzt SAFETY-P1 als Voraussetzung. Die P1-Mechanismen A, D und E sind bereits implementiert (Zeilen 146–194 in main.cpp bestätigt). P4 kann direkt auf diesen aufbauen.

---

## Go/No-Go Empfehlung

**GO** — mit folgenden Bedingungen:

1. Alle 5 Abweichungen sind bekannt und adressierbar.
2. `reading.sensor_type` statt `reading.value_type` ist die korrekte Benennung.
3. Logic-Schema (`trigger_conditions` Struktur) vor Block D3 verifizieren.
4. Implementierungsreihenfolge wie im Auftrag beschrieben (Komponente 0 zuerst).

**Geschätzter Aufwand (aktualisiert nach Analyse):**
- Komponente 0 (Value-Cache): 2h
- Komponente 1+2 (OfflineRule + NVS): 3h
- Komponente 3 (config_builder Server): 2h (inkl. Logic-Schema-Verifikation)
- Komponente 3b (config_manager Parsing): 1h
- Komponente 4+5 (OfflineModeManager + Loop): 5h
- Komponente 6 (Reconnect-Transition): 2h
- **Gesamt: ~15h** (innerhalb der geplanten 14–20h)

---

## Build-Verifikation Baseline

```
RAM:   [==        ]  20.9% (used 68508 bytes from 327680 bytes)
Flash: [========= ]  92.2% (used 1208989 bytes from 1310720 bytes)
Build: SUCCESS (4.64 seconds)
Datum: 2026-03-30
```

Diese Baseline wird nach der Implementierung erneut geprüft. Erwartete Änderung: RAM ~+1KB, Flash ~+12KB.
