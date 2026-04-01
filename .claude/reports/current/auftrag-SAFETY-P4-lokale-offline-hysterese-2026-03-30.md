# Auftrag SAFETY-P4: Lokale Offline-Hysterese-Regeln auf ESP32

**Ziel-Repo:** auto-one (Schwerpunkt: El Trabajante Firmware + El Servador Backend fuer Config-Push)
**Typ:** Analyse + Implementierung
**Prioritaet:** HIGH
**Datum:** 2026-03-30 (korrigiert)
**Geschaetzter Aufwand:** ~14-20h (Analyse ~3h, Value-Cache ~2h, Implementierung ~9-15h)
**Abhaengigkeit:** SAFETY-P1 MUSS vorher implementiert sein — P4 braucht:
  - Mechanismus A (Re-Subscribe, `main.cpp:146`) fuer `heartbeat/ack` Subscription
  - Mechanismus D (Server-ACK-Timeout, `main.cpp:2587`) als Trigger fuer Offline-Mode
  - Mechanismus E (Reconnect State-Sync, `main.cpp:173`) fuer Rueckmeldung nach Offline-Mode
**Blockiert:** Nichts — P4 ist eine Erweiterung

---

## WICHTIG: Firmware-Regel-Ausnahme

> **Diese Implementierung ist eine TM-autorisierte Ausnahme zur Server-Centric-Regel
> ("NIEMALS Logik-Auswertung auf ESP32" in firmware-rules.md).**
>
> **Begruendung:** SAFETY-P4 implementiert eine **minimale Sicherheits-Hysterese** die NUR
> bei Netzwerkverlust aktiv wird. Im Normalbetrieb steuert weiterhin der Server.
> **Precedent:** SAFETY-P1 hat bereits `setAllActuatorsToSafeState()` als lokale
> Sicherheitslogik auf dem ESP32 implementiert — P4 erweitert dieses Pattern um
> regelbasierte Fallback-Steuerung statt reinem Abschalten.
>
> Dies ist KEIN Ersatz fuer die Server-Logic-Engine. Es sind heruntergeladene,
> server-definierte Regeln die lokal als Fallback ausgefuehrt werden.

---

## Auftragsziel

Implementiere eine **lokale Minimal-Logik** auf dem ESP32, die bei Netzwerkverlust einfache Hysterese-Regeln autonom ausfuehrt. Im Normalbetrieb steuert der Server wie bisher. Wenn die Verbindung laenger als der konfigurierte Timeout abbricht, wechselt der ESP in einen **Offline-Mode** und fuehrt heruntergeladene Offline-Regeln lokal aus. Bei Reconnect uebernimmt der Server wieder.

**Zweck:** SAFETY-P1 schuetzt vor Schaeden (Aktoren gehen AUS). SAFETY-P4 haelt den **Normalbetrieb** aufrecht — der Befeuchter regelt weiter auf 45-55% Luftfeuchte, auch wenn der Server 10 Minuten weg ist.

**KEIN BREAKING CHANGE.** Alles ist additiv. Ohne Offline-Regeln vom Server verhaelt sich der ESP exakt wie nach P1 (Aktoren gehen bei Disconnect in Safe State). Offline-Regeln sind ein Upgrade — kein Ersatz.

---

## System-Kontext (komplett — kein externes Repo noetig)

### Architektur-Ueberblick

AutomationOne hat eine klare Arbeitsteilung: Der ESP32 (El Trabajante) liest Sensoren aus und schaltet Aktoren. Der Server (El Servador, FastAPI + Python) entscheidet wann welcher Aktor geschaltet wird — ueber die Logic Engine, einen Background-Service der Sensor-Daten via MQTT empfaengt, Regeln evaluiert und Aktor-Befehle zuruecksendet.

Diese Architektur funktioniert solange die Verbindung steht. Bei Netzwerkverlust fehlt dem ESP jede Entscheidungsgrundlage. SAFETY-P1 sichert den ESP ab (Aktoren AUS). SAFETY-P4 gibt dem ESP die Faehigkeit, die wichtigsten Regeln lokal weiterzufuehren.

### Wie die Logic Engine heute funktioniert

Auf dem Server laeuft folgender Datenfluss (aus der Deep-Dive-Analyse verifiziert):

```
ESP32 publiziert Sensor-Daten:
  kaiser/{k}/esp/{e}/sensor/{gpio}/data
  Payload: {"sensor_type": "sht31_humidity", "value": 43.0, "gpio": 0, ...}

Server empfaengt via SensorHandler:
  → sensor_repo.save_data()
  → logic_engine.evaluate_sensor_data() (asyncio.create_task)

Logic Engine evaluiert alle aktivierten Regeln:
  → Fuer jede Regel: Conditions pruefen
  → HysteresisConditionEvaluator:
      - _matches_sensor(): Passt der Sensor zur Regel? (esp_id, gpio, sensor_type)
      - _get_state(): In-memory HysteresisState (is_active, last_value)
      - Heating-Modus (Befeuchter):
          value < activate_below (45%) AND NOT is_active → is_active = True → Return True
          value > deactivate_above (55%) AND is_active → is_active = False → Return False
          Dazwischen: Return aktuellen is_active Wert (Hysterese-Band)
  → Wenn Conditions True: ActuatorActionExecutor sendet MQTT
      kaiser/{k}/esp/{e}/actuator/14/command
      {"command": "ON", "value": 1.0, "duration": 15, "correlation_id": "..."}
  → Wenn Hysterese deaktiviert: Automatisch OFF senden (Bypass Cooldown)

ESP32 empfaengt Aktor-Command:
  → ActuatorManager.handleActuatorCommand()
  → controlActuatorBinary(14, true/false)
```

Die Hysterese-Logik selbst ist einfach: Zwei Schwellwerte, ein Boolean-State, ein Vergleich. Das Komplexe ist der Rahmen drumherum (Safety-Checks, Cooldown, RateLimiter, History-Logging, WebSocket-Broadcast). Fuer den Offline-Mode brauchen wir NUR die Kern-Hysterese — nicht den ganzen Rahmen.

### Wie Sensoren auf dem ESP ausgelesen werden

Der ESP liest Sensoren unabhaengig von der Serververbindung aus. Der SensorManager hat ein statisches Array `SensorConfig sensors_[MAX_SENSORS]` (`sensor_manager.h:139`). `MAX_SENSORS` ist plattformabhaengig: **20** auf esp32_dev (`platformio.ini:89`), 10 auf xiao. In der `loop()` wird `sensorManager.performAllMeasurements()` regelmaessig aufgerufen (`main.cpp:2575`). Jeder Sensor hat ein Leseintervall (typisch: alle 5-30 Sekunden).

Fuer den SHT31 (I2C):
- GPIO 0 (I2C-Konvention, kein physischer Pin)
- I2C-Adresse 0x44
- Direktes I2C-Protokoll via `i2c_sensor_protocol.cpp` (Command 0x2400, 6-Byte Response)
- Ergebnis: `temperature` und `humidity` als float
- Wird via MQTT an Server publiziert: `sensor/{gpio}/data`

**KRITISCH — Kein persistenter Wert-Cache vorhanden:**

Der SensorManager hat derzeit **KEINEN float-Cache fuer gemessene Werte**. In `sensor_types.h:71` steht explizit:
```cpp
// NICHT NOETIG in Server-Centric Architektur:
// - float last_value (Server verarbeitet)
```

`SensorReading`-Objekte werden in `performAllMeasurements()` lokal erzeugt, per MQTT publiziert und **verworfen**. Es gibt keinen persistenten Zugriff auf den letzten Messwert.

**Konsequenz:** Fuer SAFETY-P4 muss ein expliziter Value-Cache gebaut werden (→ Komponente 0).

### sensor_type vs. value_type — Wichtige Unterscheidung

In der Firmware gibt es zwei verschiedene Type-Bezeichnungen:

1. **sensor_type (Device-Typ):** Gespeichert in `SensorConfig.sensor_type`. Beispiel: `"sht31"`. Kommt aus `sensor_registry.cpp:12`. Das Array `sensors_[MAX_SENSORS]` enthaelt diesen Typ.

2. **value_type (Mess-Typ):** Pro Messwert bei Multi-Value-Sensoren. Beispiel: `"sht31_humidity"`, `"sht31_temp"`. Definiert in `i2c_sensor_protocol.cpp:44`. Dies ist der Typ der im MQTT-Payload als `sensor_type` gesendet wird und den der Server in der Logic Engine matcht.

**Fuer Offline-Regeln ist der value_type entscheidend**, weil eine Regel sich auf einen konkreten Messwert bezieht (Luftfeuchte, nicht "den SHT31"). Der Value-Cache (Komponente 0) muss deshalb mit `value_type` als Key arbeiten — NICHT mit dem `SensorConfig.sensor_type`.

### Wie NVS-Persistierung heute funktioniert

Der ESP speichert Sensor- und Aktor-Konfigurationen im Non-Volatile Storage (NVS) des ESP32. NVS ueberlebt Reboot und Stromausfall.

**Sensor-NVS-Schema (pro Sensor, Index i):**
```
sen_{i}_gpio    → uint8_t
sen_{i}_type    → String (z.B. "sht31")
sen_{i}_name    → String
sen_{i}_sz      → String (Subzone)
sen_{i}_act     → bool (active)
sen_{i}_raw     → bool (raw_mode)
sen_{i}_mode    → uint8_t (operating_mode)
sen_{i}_int     → uint32_t (interval_ms)
sen_{i}_ow      → String (onewire_address)
```

**Aktor-NVS-Schema (pro Aktor):** Ueber `saveActuatorConfig()` — speichert GPIO, Typ, Safety-Constraints.

**NVS-Budget (aus SAFETY-MEM Analyse):**
- Gesamt nutzbar: ~12KB
- Aktuell belegt: ~8KB
- Frei: ~4KB
- Nach P4 (73 Keys, ~2.3KB): ~1.7KB frei (~86%). **Passt.**

**Bestehende NVS-Namespaces:** `sensor_config`, `actuator_config`, `wifi_config`, `zone_config`, `subzone_config`, `system_config`. Der Namespace `"offline"` (7 Chars, Limit 15) hat keinen Konflikt.

### Wie der Config-Push funktioniert

Der Server sendet bei Aenderungen oder nach ESP-Reconnect (wenn `offline_seconds > 60`) einen Full-State-Push auf:
```
kaiser/{k}/esp/{e}/config
```

Payload ist ein JSON-Objekt mit Sensor-Configs, Aktor-Configs und System-Settings. Der `config_manager.cpp` parst das JSON und wendet die Konfiguration an. Aktor-Configs werden in NVS gespeichert.

Die Config-Push-Funktion wird an 6 Stellen aufgerufen:
- `src/api/v1/sensors.py:766/1058/1203` (Sensor CRUD)
- `src/api/v1/actuators.py:630/1172` (Actuator CRUD)
- `src/mqtt/handlers/heartbeat_handler.py:1334` (Heartbeat mit 120s Cooldown)

Server-seitig baut `config_builder.py` → `build_combined_config()` das JSON zusammen. Hier muss das neue Feld `offline_rules` ergaenzt werden.

**MQTT_MAX_PACKET_SIZE = 2048** (`main.cpp:2618`). Ein Config-Push mit 8 Offline-Rules (~300 Bytes JSON) passt locker rein — kein Problem.

### Wie die loop() Funktion aufgebaut ist

In `main.cpp` werden in `loop()` folgende Funktionen in dieser Reihenfolge aufgerufen:

```
loop():
  ...
  main.cpp:2575  sensorManager.performAllMeasurements()   // Sensoren auslesen
  main.cpp:2580  processActuatorLoops()                    // Runtime Protection + Duration Timer
  main.cpp:2587  SAFETY-P1-D Check (Server-ACK-Timeout)    // P1 Mechanismus D
  ...
```

**`processActuatorLoops()`** (`main.cpp:2580`) wird in JEDEM `loop()`-Zyklus aufgerufen. Sie iteriert ueber alle registrierten Aktoren und prueft:
1. **Runtime Protection:** Wenn `millis() > runtime_start_ms + max_runtime_ms` → Emergency-Stop
2. **Duration Timer:** Wenn `command_duration_end_ms > 0 && millis() > command_duration_end_ms` → Clean OFF

Die Offline-Regelauswertung wird als **separater Aufruf** eingehaengt — zwischen Zeile 2585 (Ende Actuator-Status-Timer) und Zeile 2587 (SAFETY-P1-D-Check). Exakter Einfuegepunkt aus Analyse:

```
2575: sensorManager.performAllMeasurements()     // Value-Cache wird hier befuellt
2580: actuatorManager.processActuatorLoops()      // Runtime Protection + Duration Timer
2581-2585: Actuator-Status-Publish (30s Timer)
---- NEU: Offline-Regelauswertung (5s Timer, nur wenn OFFLINE_ACTIVE) ----
2587: SAFETY-P1 Mechanism D: Server-ACK-Timeout-Check
```

NICHT innerhalb von `processActuatorLoops()` (saubere Trennung).

---

## SOLL-Zustand

### Uebersicht

```
                    NORMAL-MODE                           OFFLINE-MODE
                    -----------                           ------------
Sensor lesen:       Ja (wie bisher)                       Ja (wie bisher)
MQTT publizieren:   Ja (sensor/data)                      Nein (kein MQTT)
Server evaluiert:   Ja (Logic Engine)                     Nein (Server weg)
Lokal evaluieren:   Nein (Server steuert)                 JA — Offline-Regeln
Aktor schalten:     Via MQTT-Command vom Server           Direkt lokal
Status publizieren: Ja (actuator/status)                  Nein (kein MQTT)

Uebergang Normal→Offline:
  - MQTT-Disconnect (handleDisconnection)
  - ODER Server-ACK-Timeout (P1 Mechanismus D)
  → Wenn offline_rules vorhanden: Offline-Mode
  → Wenn keine offline_rules: Safe-State (P1 Mechanismus B)

Uebergang Offline→Normal:
  - MQTT-Reconnect erfolgreich
  - Re-Subscribe (P1 Mechanismus A)
  - Status-Sync (P1 Mechanismus E)
  - Server-ACK empfangen
  → Offline-Mode deaktivieren, Server steuert wieder
```

### Empfohlene Implementierungs-Reihenfolge

```
Phase 1 — Analyse (Block A-E)
  ↓
Phase 2 — Komponente 0: SensorManager Value-Cache
  ↓  (MUSS vor allen anderen Firmware-Komponenten stehen)
Phase 3 — Komponente 1+2: OfflineRule Struct + NVS-Persistierung
  ↓
Phase 4 — Komponente 3+3b: Server config_builder + Firmware config_manager Parsing
  ↓  (Server-Teil kann parallel zu Phase 3 laufen)
Phase 5 — Komponente 4+5: OfflineManager State-Machine + Loop-Integration
  ↓
Phase 6 — Komponente 6: Reconnect-Transition
```

---

### Komponente 0: SensorManager Value-Cache (NEU — Vorbedingung)

**Problem:** `performAllMeasurements()` erzeugt `SensorReading`-Objekte, publiziert sie via MQTT und verwirft sie. Es gibt keinen persistenten Cache. `sensor_types.h:71` sagt explizit: kein `last_value` im SensorConfig Struct.

**Loesung:** Ein separates, leichtgewichtiges Cache-Array im SensorManager:

```cpp
// In sensor_manager.h — neues Struct + Cache
struct LastSensorValue {
    uint8_t  gpio;
    char     value_type[24];    // z.B. "sht31_humidity", "sht31_temp", "ds18b20"
    float    value;
    uint32_t timestamp_ms;      // millis() zum Zeitpunkt der Messung
    bool     valid;             // Wurde mindestens einmal gemessen?
};

static const uint8_t MAX_CACHED_VALUES = 20;  // Grosszuegig: 10 Sensoren * 2 Values
LastSensorValue valueCache_[MAX_CACHED_VALUES];
uint8_t valueCacheCount_ = 0;
```

**Befuellung — Zwei Codepfade in `performAllMeasurements()`:**

Das `SensorReading`-Struct hat ein Feld `sensor_type` (Typ: `String`, Arduino-Heap). Bei Multi-Value-Sensoren enthaelt dieses Feld den **value_type** (z.B. `"sht31_humidity"`), nicht den Device-Typ. Deshalb: `reading.sensor_type.c_str()` liefert den korrekten Cache-Key.

**Pfad 1 — Multi-Value (SHT31, BMP280, BME280):** Nach `sensor_manager.cpp:1262`:
```cpp
for (uint8_t j = 0; j < count; j++) {
    updateValueCache(readings[j].gpio, readings[j].sensor_type.c_str(), readings[j].processed_value);
}
```

**Pfad 2 — Single-Value (DS18B20, ADC):** Nach `sensor_manager.cpp:1273` (nach `publishSensorReading`):
```cpp
updateValueCache(reading.gpio, reading.sensor_type.c_str(), reading.processed_value);
```

**WICHTIG — Feld heisst `reading.sensor_type`, NICHT `reading.value_type`:**
Das `SensorReading` Struct (`sensor_types.h:81-117`) hat das Feld `String sensor_type`. Obwohl es konzeptionell ein value_type ist (z.B. `"sht31_humidity"`), heisst das Feld im Code `sensor_type`. Im Value-Cache speichern wir es als `char value_type[24]` (per `.c_str()` kopiert) — der interne Cache-Feldname bleibt `value_type` um die Unterscheidung zu `SensorConfig.sensor_type` (Device-Typ, z.B. `"sht31"`) klar zu halten.

- `SensorConfig.sensor_type` = `"sht31"` (Device-Typ aus `sensor_registry.cpp:12`)
- `SensorReading.sensor_type` = `"sht31_humidity"` (value_type aus `i2c_sensor_protocol.cpp:44`)
- Die Offline-Rule referenziert den **value_type** (z.B. `"sht31_humidity"`)
- Der Cache nutzt `value_type` als Schluessel (Kopie von `reading.sensor_type`)

**Lookup-Funktion (public):**
```cpp
// In sensor_manager.h — public, nach Zeile 100 (nach triggerManualMeasurement)
float getSensorValue(uint8_t gpio, const char* valueType) const;
// Iteriert ueber valueCache_, matcht gpio + strcmp(value_type)
// Gibt NAN zurueck wenn kein Eintrag oder aelter als 60s (Stale-Schutz)
```

**Stale-Timeout:** `OFFLINE_VALUE_STALE_TIMEOUT_MS = 60000` (Compile-Time-Konstante). Bei typischem `measurement_interval_ms` von 30s ist 60s ein sinnvoller 2x-Faktor.

**Overwrite-Strategie:** Bei vollem Cache (count == MAX_CACHED_VALUES) den aeltesten Eintrag ueberschreiben (kleinster `timestamp_ms`).

**RAM-Overhead:** 20 Entries * ~32 Bytes = ~640 Bytes. Unkritisch bei ~259KB freiem RAM (Build-Baseline: 20.9%).

**Warum separates Array statt SensorConfig erweitern?** Weil ein SHT31 (sensor_type="sht31") ZWEI value_types produziert ("sht31_humidity" + "sht31_temp"). `sensors_[MAX_SENSORS]` hat nur einen Eintrag pro SensorConfig — da passen zwei Cache-Werte nicht rein. Zudem: `performMultiValueMeasurement()` wird pro I2C-Adresse nur EINMAL aufgerufen (Dedup-Logik `sensor_manager.cpp:1232-1260`), erzeugt aber 2 Readings.

---

### Komponente 1: Offline-Rule Struct (Firmware)

**Neues Struct in eigener Header-Datei `src/models/offline_rule.h`:**

```cpp
#pragma once
#include <cstdint>
#include <cmath>

static const uint8_t MAX_OFFLINE_RULES = 8;

struct OfflineRule {
    bool     enabled;                    // Regel aktiv?
    uint8_t  actuator_gpio;              // Welcher Aktor (z.B. 14)
    uint8_t  sensor_gpio;               // Welcher Sensor-GPIO (z.B. 0 fuer I2C)
    char     sensor_value_type[24];     // NICHT sensor_type! z.B. "sht31_humidity"
    float    activate_below;            // Heizung/Befeuchter: AN wenn Wert < X
    float    deactivate_above;          // Heizung/Befeuchter: AUS wenn Wert > Y
    float    activate_above;            // Kuehlung/Luefter: AN wenn Wert > X
    float    deactivate_below;          // Kuehlung/Luefter: AUS wenn Wert < Y
    bool     is_active;                 // Runtime-State (AN oder AUS)
    bool     server_override;           // Server-Command hat diesen GPIO uebernommen
};
// Sizeof ~ 36 Bytes pro Regel, 8 Regeln = 288 Bytes
```

**Feld `sensor_value_type` (NICHT `sensor_type`):** Bewusste Namensgebung um Verwechslung mit `SensorConfig.sensor_type` zu vermeiden. Dieses Feld enthaelt den **value_type** (z.B. `"sht31_humidity"`), der im Value-Cache (Komponente 0) als Schluessel dient.

**Feld `server_override`:** Wird `true` gesetzt wenn waehrend OFFLINE_ACTIVE ein Server-Command fuer denselben `actuator_gpio` empfangen wird. Dann hat der Server Vorrang fuer diesen GPIO (Komponente 6).

**Zwei Modi (identisch zur Server-Hysterese):**
- **Heating-Modus** (Befeuchter, Heizung): `activate_below` + `deactivate_above` gesetzt
  - Wert < activate_below AND NOT is_active → AN
  - Wert > deactivate_above AND is_active → AUS
- **Cooling-Modus** (Luefter, Kuehlung): `activate_above` + `deactivate_below` gesetzt
  - Wert > activate_above AND NOT is_active → AN
  - Wert < deactivate_below AND is_active → AUS

**Nullwerte (0.0) bedeuten "nicht gesetzt":** Wenn `activate_below == 0.0 && deactivate_above == 0.0` → Heating-Modus nicht konfiguriert. Wenn `activate_above == 0.0 && deactivate_below == 0.0` → Cooling-Modus nicht konfiguriert.

### Komponente 2: NVS-Persistierung

**NVS-Namespace:** `offline` (7 Chars, separater Namespace, kollidiert nicht mit bestehenden: `sensor_config`, `actuator_config`, `wifi_config`, `zone_config`, `subzone_config`, `system_config`)

**NVS-Schema (pro Regel, Index i = 0..7):**
```
ofr_{i}_en     → uint8_t (enabled: 0/1)
ofr_{i}_agpio  → uint8_t (actuator_gpio)
ofr_{i}_sgpio  → uint8_t (sensor_gpio)
ofr_{i}_svtyp  → String  (sensor_value_type, max 24 chars)
ofr_{i}_actb   → float   (activate_below)
ofr_{i}_deaa   → float   (deactivate_above)
ofr_{i}_acta   → float   (activate_above)
ofr_{i}_deab   → float   (deactivate_below)
ofr_count      → uint8_t (Anzahl gespeicherter Regeln)
```

**NVS-Key-Aenderung vs. Original:** `ofr_{i}_stype` → `ofr_{i}_svtyp` (Konsistenz mit umbenanntem Struct-Feld).

**Laden:** Beim Boot in `setup()` — nach Sensor/Aktor-Init, vor MQTT-Connect. Offline-Regeln sind sofort verfuegbar (fuer den Fall dass MQTT nie verbunden wird).

**Speichern:** Wenn Config-Push mit `offline_rules` empfangen wird → NVS schreiben. NVS-Write nur wenn sich etwas geaendert hat (Vergleich mit RAM-Kopie, NVS-Schreibzyklen schonen).

### Komponente 3: Config-Push Erweiterung (Server-Seite)

**Server baut `offline_rules` Array im Config-Push JSON:**

```json
{
  "sensors": [...],
  "actuators": [...],
  "offline_rules": [
    {
      "actuator_gpio": 14,
      "sensor_gpio": 0,
      "sensor_value_type": "sht31_humidity",
      "activate_below": 45.0,
      "deactivate_above": 55.0,
      "activate_above": 0,
      "deactivate_below": 0
    }
  ]
}
```

**Betroffene Server-Datei:** `god_kaiser_server/src/services/config_builder.py` → `build_combined_config()`

**Woher kommen die Daten?** Aus der `cross_esp_logic` Tabelle (`god_kaiser_server/src/db/models/logic.py:51`). Der Config-Builder filtert:
1. Regeln die `enabled = true` sind
2. Regeln die den betreffenden ESP als Trigger-Sensor UND als Ziel-Aktor haben (nur lokale Regeln — Cross-ESP-Regeln koennen nicht lokal ausgefuehrt werden)
3. Regeln die Hysterese-Schwellwerte in `trigger_conditions` haben
4. Maximal 8 Regeln (ESP-Speicherlimit)

**ANALYSE-HINWEIS — Logic-Schema verifizieren:** Die `trigger_conditions` JSON-Struktur muss vom Backend-Agent geprueft werden. Die DB-Doku zeigt `type: 'sensor_threshold'` mit Operator-Feldern. Es ist noch offen ob Hysterese-Regeln als `type: 'hysteresis'` gespeichert werden oder ob Schwellwerte (`activate_below`, `deactivate_above`) direkt in `trigger_conditions` stehen. **Vor der Implementierung:** `logic_validation.py`, `logic_engine.py` und den `HysteresisConditionEvaluator` lesen um das exakte Schema zu bestimmen.

**Wichtig — sensor_type Mapping auf value_type:** Die `cross_esp_logic` Tabelle speichert in `trigger_conditions` den `sensor_type` als **value_type** (z.B. `"sht31_humidity"`), weil die Logic Engine auf MQTT-Payloads matcht die den value_type enthalten. Deshalb passt der Wert aus der DB direkt als `sensor_value_type` in die Offline-Rule — kein Mapping noetig.

**Zugriff auf cross_esp_logic:** Pruefen ob ein bestehendes Repository/Service existiert das Regeln nach ESP-ID filtern kann. Falls nicht: Direktes SQLAlchemy-Query in `build_combined_config()` (Session wird dort bereits genutzt).

**Wenn keine passenden Regeln existieren:** `offline_rules` Array ist leer `[]` oder fehlt komplett. ESP nutzt dann den P1-Fallback (Aktoren in Safe State bei Disconnect).

**Kein Breaking Change:** Das Feld `offline_rules` ist optional im JSON. Alter ESP ohne P4-Code ignoriert es (ArduinoJson ueberspringt unbekannte Keys). Alter Server ohne P4-Code sendet es nicht → ESP hat keine Offline-Regeln → P1-Fallback greift.

### Komponente 3b: Config-Push Parsing auf Firmware-Seite

**ANALYSE-KORREKTUR:** Der Config-Push wird NICHT in `config_manager.cpp` geparst, sondern in `main.cpp` als Free Function. Die Config-Topic-Verarbeitung ist in `main.cpp:882-886`:

```cpp
if (topic == config_topic) {
    handleSensorConfig(payload);    // Zeile 884
    handleActuatorConfig(payload);  // Zeile 885
    return;                         // Zeile 886
}
```

Hier muss eine neue Free Function `handleOfflineRulesConfig()` eingefuegt werden:

```cpp
if (topic == config_topic) {
    handleSensorConfig(payload);
    handleActuatorConfig(payload);
    handleOfflineRulesConfig(payload);  // ← NEU: P4 (Zeile 885.5)
    return;
}
```

`handleOfflineRulesConfig()` wird als neue Free Function in `main.cpp` definiert (analog zu `handleActuatorConfig()`). Sie parst den JSON-Payload und delegiert an den `OfflineModeManager`:

```cpp
void handleOfflineRulesConfig(const String& payload) {
    DynamicJsonDocument doc(2048);  // MQTT_MAX_PACKET_SIZE
    if (deserializeJson(doc, payload) != DeserializationOk) return;
    offlineModeManager.parseOfflineRules(doc.as<JsonObject>());
}
```

Die eigentliche Parse-Logik lebt im `OfflineModeManager` (Komponente 4), weil dieser Eigentuemer der Offline-Rules ist:

```cpp
// In offline_mode_manager.cpp
void OfflineModeManager::parseOfflineRules(const JsonObject& config) {
    if (!config.containsKey("offline_rules")) return;  // Kein Feld = nichts aendern

    JsonArray rules = config["offline_rules"];
    // Leeres Array = alle Regeln loeschen
    // Array mit Inhalt = bestehende Regeln komplett ersetzen
    // Pro JSON-Objekt: actuator_gpio, sensor_gpio, sensor_value_type, Schwellwerte
    // → OfflineRule befuellen, enabled=true, is_active=false, server_override=false
    // saveOfflineRulesToNVS() aufrufen (mit Change-Detection)
    // Log: "[CONFIG] Received %d offline rules"
}
```

**Semantik:**
- `offline_rules` Feld fehlt im JSON → Bestehende Offline-Regeln BEHALTEN (kein Loeschen)
- `offline_rules: []` (leeres Array) → Alle Offline-Regeln LOESCHEN + NVS leeren
- `offline_rules: [...]` (mit Inhalt) → Bestehende ersetzen + NVS aktualisieren

### Komponente 4: Offline-Mode Manager (Firmware-Kern)

**Neues Modul:** `src/services/safety/offline_mode_manager.h/.cpp`

**State-Machine:**
```
ONLINE → DISCONNECTED → OFFLINE_ACTIVE → RECONNECTING → ONLINE
  |                         |
  | Server-ACK-Timeout      | MQTT oder WiFi lost
  | oder MQTT Disconnect    |
  v                         |
  OFFLINE_ACTIVE <----------+

Uebergaenge:
  ONLINE → DISCONNECTED:
    Trigger: handleDisconnection() ODER Server-ACK-Timeout (P1 Mech. D)
    Aktion: P1 Mechanismus B (Aktoren in Safe State) — sofort als Sicherheit
    Timer starten: offline_activation_delay_ms (Default: 30s)

  DISCONNECTED → OFFLINE_ACTIVE:
    Trigger: Timer abgelaufen UND offline_rules vorhanden
    Aktion: Offline-Regeln aktivieren, Aktoren initial evaluieren
    Log: "[SAFETY] Entering OFFLINE mode — local rules active"

  OFFLINE_ACTIVE → RECONNECTING:
    Trigger: MQTT reconnect() erfolgreich
    Aktion: Offline-Regeln pausieren (nicht sofort deaktivieren)

  RECONNECTING → ONLINE:
    Trigger: Server-ACK empfangen (bestaetigt Server ist wirklich da)
    Aktion: Offline-Regeln deaktivieren, server_override Flags zuruecksetzen, Status-Sync (P1 Mech. E)
    Log: "[SAFETY] Server confirmed — exiting OFFLINE mode"
```

**Warum ein `offline_activation_delay_ms` (30s)?** Um nicht bei jedem kurzen WiFi-Flapping sofort in Offline-Mode zu wechseln. Der Ablauf bei kurzem Disconnect:
1. WiFi bricht ab → DISCONNECTED → Aktoren sofort in Safe State (P1)
2. Timer laeuft (30s)
3. WiFi kommt nach 5s zurueck → MQTT Reconnect → Timer wird abgebrochen
4. Kein Offline-Mode noetig — Server uebernimmt sofort wieder

Bei laengerem Disconnect:
1. WiFi/Server weg → DISCONNECTED → Aktoren sofort in Safe State (P1)
2. Timer laeuft (30s)
3. Timer laeuft ab → OFFLINE_ACTIVE → Offline-Regeln starten
4. Befeuchter reguliert wieder lokal auf 45-55%

### Komponente 5: Offline-Regelauswertung in `loop()`

**Separater Aufruf in `loop()` — NACH `performAllMeasurements()` (main.cpp:2575):**

```
Pseudocode (alle 5 Sekunden, nicht jeden loop-Zyklus):

if (offlineMode != OFFLINE_ACTIVE) return;

for (int i = 0; i < offlineRuleCount; i++) {
    OfflineRule& rule = offlineRules[i];
    if (!rule.enabled) continue;
    if (rule.server_override) continue;  // Server hat diesen GPIO uebernommen

    // Sensor-Wert aus Value-Cache holen (Komponente 0)
    float sensorValue = sensorManager.getSensorValue(
        rule.sensor_gpio, rule.sensor_value_type
    );
    if (isnan(sensorValue)) continue;  // Sensor nicht verfuegbar oder stale (>60s)

    bool shouldBeActive = rule.is_active;  // Aktueller State

    // Heating-Modus (Befeuchter, Heizung)
    if (rule.activate_below > 0 && rule.deactivate_above > 0) {
        if (!rule.is_active && sensorValue < rule.activate_below) {
            shouldBeActive = true;
        }
        if (rule.is_active && sensorValue > rule.deactivate_above) {
            shouldBeActive = false;
        }
    }

    // Cooling-Modus (Luefter, Kuehlung)
    if (rule.activate_above > 0 && rule.deactivate_below > 0) {
        if (!rule.is_active && sensorValue > rule.activate_above) {
            shouldBeActive = true;
        }
        if (rule.is_active && sensorValue < rule.deactivate_below) {
            shouldBeActive = false;
        }
    }

    // State geaendert?
    if (shouldBeActive != rule.is_active) {
        rule.is_active = shouldBeActive;
        controlActuatorBinary(rule.actuator_gpio, shouldBeActive);
        log("[OFFLINE] Rule %d: GPIO %d -> %s (sensor=%.1f)",
            i, rule.actuator_gpio, shouldBeActive ? "ON" : "OFF", sensorValue);
    }
}
```

**`getSensorValue()` nutzt den Value-Cache aus Komponente 0.** Die Funktion gibt `NAN` zurueck wenn kein Cache-Eintrag fuer `gpio + value_type` existiert oder der Eintrag aelter als 60s ist (Stale-Schutz — Sensor ausgefallen).

**Wichtig:** Die Offline-Regelauswertung darf NICHT in jedem `loop()`-Zyklus laufen (das waere alle paar Millisekunden). Ein Intervall von 5 Sekunden ist ausreichend und verhindert GPIO-Flattern. Implementierung via `millis()`-basiertem Timer.

### Komponente 6: Reconnect-Transition

Wenn die MQTT-Verbindung wiederhergestellt wird:

1. **Re-Subscribe** (P1 Mechanismus A) — ESP empfaengt wieder Server-Commands
2. **Status-Sync** (P1 Mechanismus E) — ESP meldet aktuellen Aktor-Status
3. **Warte auf Server-ACK** — Bestaetigt dass Server wirklich laeuft
4. **Offline-Mode deaktivieren** — Erst wenn ACK empfangen
5. **Server uebernimmt** — Naechster Sensor-Wert triggert Logic Engine, Server sendet Command

**Warum auf ACK warten?** Wenn nur der Broker zurueck ist aber der Server noch down, wuerde sofortiges Deaktivieren der Offline-Regeln den ESP ungeschuetzt lassen. Der ACK bestaetigt: Server-Logic-Engine laeuft.

**Potentieller Konflikt:** Server sendet ON, Offline-Regel sagt OFF (oder umgekehrt) waehrend der Transition. Loesung: Ab dem Moment wo ein Server-Command empfangen wird (via `handleActuatorCommand()` in `actuator_manager.cpp`), wird das `server_override` Flag der Offline-Rule fuer diesen `actuator_gpio` auf `true` gesetzt — der Server hat Vorrang. Bei vollstaendigem Uebergang zu ONLINE werden alle `server_override` Flags zurueckgesetzt.

---

## Analyse-Teil — ERLEDIGT (2026-03-30)

> **Ergebnis: GO.** Alle Annahmen korrekt oder korrigiert. 5 Abweichungen dokumentiert.
> Vollstaendiger Bericht: separat im auto-one Repo.
>
> **Korrigierte Abweichungen (bereits oben eingearbeitet):**
> 1. `SensorReading.sensor_type` (NICHT `.value_type`) — Feld heisst im Code `sensor_type`
> 2. `MAX_SENSORS=20` auf esp32_dev (nicht 10) — Value-Cache mit 20 reicht
> 3. Config-Handler ist Free Function in `main.cpp:882-886` (nicht in config_manager.cpp)
> 4. Logic-Schema (`trigger_conditions` Struktur) muss vom Backend-Agent verifiziert werden
> 5. `MQTT_MAX_PACKET_SIZE`: esp32_dev=2048, xiao=1024 — beides reicht fuer 8 Rules
>
> **Build-Baseline:** RAM 20.9%, Flash 92.2% (68508/327680, 1208989/1310720)
>
> **Exakte Einfuegepunkte (Analyse-verifiziert):**
> - Value-Cache Struct: `sensor_manager.h` nach Zeile 169
> - `getSensorValue()`: `sensor_manager.h` nach Zeile 100
> - Update Multi-Value: `sensor_manager.cpp` nach Zeile 1262
> - Update Single-Value: `sensor_manager.cpp` nach Zeile 1273
> - Config-Topic Handler: `main.cpp` Zeile 885 (nach handleActuatorConfig)
> - Loop-Integration: `main.cpp` zwischen Zeile 2585 und 2587
> - P1-D-Check Ergaenzung: `main.cpp` Zeile 2594 (nach setAllActuatorsToSafeState)

### Analyse-Fragen (Referenz — beantwortet)

### Block A: Firmware-Analyse (Sensor-Zugriff + Value-Cache-Design)

1. **`sensor_manager.h/.cpp` lesen** — Fokus auf:
   - `sensors_[MAX_SENSORS]` Array: Wie sind die Eintraege strukturiert?
   - **Bestaetigen:** Es gibt KEINEN float-Cache fuer Messwerte (erwartet: kein `last_value`)
   - Wo genau in `performAllMeasurements()` werden `SensorReading`-Objekte erzeugt? VOR oder NACH MQTT-Publish?
   - Wo ist der beste Einfuegepunkt fuer `updateValueCache()`?
   - Wie werden Multi-Value-Sensoren (SHT31 → temp + humidity) im Messzyklus behandelt? Kommt pro SensorConfig EIN Aufruf der ZWEI SensorReadings erzeugt?

2. **`sensor_types.h` und `i2c_sensor_protocol.cpp` lesen** — Fokus auf:
   - Bestaetigen: `SensorReading` hat ein `value_type` Feld (oder wie heisst es genau?)
   - Welcher Typ hat das value_type Feld? (char[], String, const char*?)
   - Sind die value_type Strings statisch (aus `sensor_registry`) oder dynamisch erzeugt?

3. **Value-Cache-Design festlegen** — basierend auf Analyse 1+2:
   - Array-Groesse bestimmen (MAX_CACHED_VALUES)
   - Lookup-Strategie: Linearer Scan ueber Array (bei 20 Entries OK) oder HashMap?
   - Stale-Timeout festlegen (Vorschlag: 60s, konfigurierbar)

### Block B: Firmware-Analyse (NVS)

4. **NVS-Nutzung analysieren** — Fokus auf:
   - Welche Namespaces existieren? (Erwartet: `sensor_config`, `actuator_config`, `wifi_config`, `zone_config`, `subzone_config`, `system_config`)
   - Wieviel NVS-Partition-Groesse ist konfiguriert? (Standard: 20KB, Custom?)
   - Wie werden bestehende Sensor/Aktor-Configs gespeichert und geladen?
   - Gibt es eine generische `nvsWrite()`/`nvsRead()` Funktion oder ist es pro Modul individuell?
   - Wo im Boot-Prozess werden NVS-Daten geladen? (Reihenfolge pruefen)

### Block C: Firmware-Analyse (Loop-Integration)

5. **`main.cpp` loop() Funktion lesen** — Fokus auf:
   - Alle Aufrufe in `loop()` mit Reihenfolge dokumentieren
   - **Bestaetigen:** `processActuatorLoops()` bei `main.cpp:2580`
   - **Bestaetigen:** `sensorManager.performAllMeasurements()` bei `main.cpp:2575`
   - **Bestaetigen:** SAFETY-P1-D-Check bei `main.cpp:2587`
   - Wo ist der beste Einfuegepunkt fuer die Offline-Regelauswertung? (NACH `performAllMeasurements`, damit Value-Cache aktuell ist)
   - Wie sind millis()-basierte Timer implementiert? (Pattern fuer 5s-Intervall uebernehmen)

### Block D: Backend-Analyse (Config-Builder)

6. **`god_kaiser_server/src/services/config_builder.py` lesen** — Fokus auf:
   - `build_combined_config()` Funktion: Welche Daten werden zusammengebaut?
   - Wie werden Aktor-Configs serialisiert?
   - Wo passt `offline_rules` Array hin?
   - Welche Session/DB-Zugriffe sind bereits vorhanden?

7. **`cross_esp_logic` Tabelle und Logic-Repos lesen** — Fokus auf:
   - `god_kaiser_server/src/db/models/logic.py:51` — Tabellenstruktur
   - Wie kann man Regeln filtern die NUR lokale Sensoren/Aktoren betreffen?
   - Wie erkennt man Hysterese-Regeln? (type = 'hysteresis' in trigger_conditions JSON)
   - Welche Felder werden gebraucht? (rule_id, trigger_conditions, actions)
   - Gibt es ein bestehendes Repository/Service das nach ESP-ID filtern kann?

8. **Config-Push JSON-Schema pruefen** — Fokus auf:
   - `src/services/config/config_manager.cpp` lesen — wie werden Sensor/Aktor-Configs geparst?
   - Wo ist der Einfuegepunkt fuer `parseOfflineRules()`?
   - Welche Top-Level-Keys existieren im Config-Push?
   - Wie werden unbekannte Keys auf der ESP-Seite behandelt? (ArduinoJson: ignoriert)

### Block E: Sicherheitsanalyse

9. **Race-Conditions pruefen:**
   - Was passiert wenn Server-Command und Offline-Regel gleichzeitig den selben GPIO schalten? (ESP32: single-threaded loop → kein echtes Race, aber Callback-Kontext pruefen)
   - Was passiert wenn Offline-Mode aktiviert wird waehrend `processActuatorLoops()` laeuft?
   - Ist `controlActuatorBinary()` thread-safe? (ESP32: single-threaded loop, aber ISR-Callbacks?)

10. **Speicher-Budget verifizieren:**
    - RAM: Value-Cache ~640 Bytes + 8 OfflineRules a 36 Bytes = ~930 Bytes. Wieviel freier Heap?
    - Flash: ~3-5KB Code-Zuwachs. Aktuell 92.2% = ~101KB frei. Genug Marge.
    - NVS: 8 Regeln a ~9 Keys = 73 NVS-Eintraege. Laut SAFETY-MEM: ~1.7KB frei nach P4.

---

## Akzeptanzkriterien

### Funktional

- [ ] Value-Cache in SensorManager speichert letzte Messwerte per `value_type` (nicht `sensor_type`)
- [ ] `getSensorValue(gpio, value_type)` gibt `NAN` zurueck bei fehlendem oder stale (>60s) Eintrag
- [ ] ESP speichert Offline-Regeln aus Config-Push in NVS (ueberleben Reboot)
- [ ] `config_manager.cpp` parst `offline_rules` aus Config-Push JSON
- [ ] Bei MQTT-Disconnect + Offline-Regeln vorhanden: ESP wechselt nach 30s in Offline-Mode
- [ ] Im Offline-Mode: Hysterese-Regel fuer Befeuchter funktioniert (AN < 45%, AUS > 55%)
- [ ] Im Offline-Mode: Sensor-Werte werden alle 5 Sekunden gegen Regeln geprueft
- [ ] Bei Reconnect + Server-ACK: ESP kehrt in Normal-Mode zurueck, Server steuert
- [ ] Server-Command hat IMMER Vorrang ueber Offline-Regel (`server_override`)
- [ ] Ohne Offline-Regeln: Verhalten identisch zu P1 (Aktoren in Safe State)
- [ ] Config-Push ohne `offline_rules` Feld: ESP behaelt bestehende Offline-Regeln (kein Loeschen)
- [ ] Config-Push mit leerem `offline_rules: []`: ESP loescht alle Offline-Regeln

### Sicherheit

- [ ] Kein Breaking Change: Alter Server ohne P4-Code + neuer ESP mit P4-Code funktioniert (P1-Fallback)
- [ ] Kein Breaking Change: Neuer Server mit P4-Code + alter ESP ohne P4-Code funktioniert (ignoriert offline_rules Key)
- [ ] Runtime Protection greift weiterhin — Offline-Regeln koennen maximal `config.runtime_protection.max_runtime_ms` lang einen Aktor AN lassen
- [ ] Emergency-Stop hat IMMER Vorrang ueber Offline-Regeln
- [ ] Kein GPIO-Flattern: Mindestens 5 Sekunden zwischen Offline-Regelauswertungen
- [ ] Kein Speicher-Overflow: MAX_OFFLINE_RULES = 8, Harte Grenze
- [ ] Value-Cache Stale-Schutz: Offline-Regel deaktiviert Aktor wenn Sensorwert > 60s alt

### Performance

- [ ] Offline-Regelauswertung braucht < 1ms pro Zyklus (kein spuerbarer Impact auf loop())
- [ ] NVS-Write nur bei Config-Push (nicht bei jedem loop()-Zyklus)
- [ ] RAM-Overhead < 1KB (640 Bytes Cache + 288 Bytes Regeln + Flags/Timer)

---

## Einschraenkungen — Was NICHT gemacht wird

- **Keine vollstaendige Logic Engine auf dem ESP.** Nur Hysterese (Schwellwerte). Keine Compound-Rules, keine Zeitfenster, keine Sequences, kein Cooldown, kein RateLimiter.
- **Keine Cross-ESP-Regeln offline.** Nur Regeln wo Sensor UND Aktor auf dem GLEICHEN ESP sind.
- **Kein Offline-Rule-Editor auf dem ESP.** Regeln kommen NUR via Config-Push vom Server.
- **Keine History/Logging offline.** Keine Speicherung von Ausfuehrungen waehrend Offline-Mode. Nur ein Log-Eintrag beim Mode-Wechsel und bei Aktor-Schaltungen.
- **Kein PWM in Offline-Regeln.** Nur binary ON/OFF. PWM-Proportionalsteuerung ist zu komplex fuer die Offline-Logik.
- **Kein Frontend fuer Offline-Regeln.** Die UI zum Konfigurieren von Offline-Regeln ist ein separater Auftrag. Der Server generiert sie automatisch aus bestehenden Hysterese-Regeln.
- **Kein SensorConfig-Struct erweitern.** Value-Cache ist bewusst separiert (Multi-Value-Problem, siehe Komponente 0).

---

## Empfohlener Agent

**Firmware-Agent (Hauptarbeit):** Komponenten 0-2, 3b, 4-6 — Value-Cache, OfflineRule Struct, NVS, Config-Push Parsing (main.cpp Free Function → OfflineModeManager), Offline-Mode-Manager, Loop-Integration, Reconnect-Transition.

**Backend-Agent (Config-Push):** Komponente 3 — `config_builder.py` erweitern, `cross_esp_logic` filtern. Muss zuerst Logic-Schema verifizieren (`logic_validation.py`, `HysteresisConditionEvaluator`). Kann parallel zur Firmware-Arbeit (ab Phase 3) laufen.

**Reihenfolge fuer Firmware-Agent:**
1. ~~Analyse Block A-E durchfuehren~~ **ERLEDIGT** (2026-03-30)
2. Komponente 0 (Value-Cache) implementieren + testen
3. Komponenten 1+2 (Struct + NVS) implementieren
4. Komponente 3b (main.cpp Free Function + OfflineModeManager.parseOfflineRules) implementieren
5. Komponenten 4+5 (State-Machine + Loop) implementieren
6. Komponente 6 (Reconnect) implementieren
7. Integration-Test: Disconnect simulieren → Offline-Regeln greifen → Reconnect → Server uebernimmt

**Geschaetzter Aufwand (nach Analyse aktualisiert):** ~15h gesamt
- Komponente 0: 2h | Komponente 1+2: 3h | Komponente 3 (Server): 2h
- Komponente 3b: 1h | Komponente 4+5: 5h | Komponente 6: 2h
