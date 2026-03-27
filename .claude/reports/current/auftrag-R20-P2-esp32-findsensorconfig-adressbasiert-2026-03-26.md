# Auftrag R20-P2 — ESP32 findSensorConfig() Adress-basiert erweitern

**Typ:** Bugfix — Firmware (El Trabajante)
**Schwere:** CRITICAL
**Erstellt:** 2026-03-26
**Ziel-Agent:** esp32-dev (`.claude/agents/esp32/esp32-dev-agent.md`)
**Aufwand:** ~4h (8 betroffene Stellen, nicht nur findSensorConfig)
**Abhaengigkeit:** Kann parallel zu R20-P1 (Server-Fix) ausgefuehrt werden

---

## Hintergrund und Root Cause

AutomationOne speichert Sensor-Konfigurationen auf dem ESP32 in einem Array `sensors_[]`
der Klasse `SensorManager`. Jeder Eintrag hat u.a. `gpio`, `onewire_address` (ROM-Code)
und `i2c_address`. Wenn ein Config-Push vom Server kommt (MQTT-Command "configure_sensor"),
wird `configureSensor()` aufgerufen. Darin wird via `findSensorConfig()` geprueft ob der
Sensor bereits existiert (Update-Pfad) oder neu angelegt werden muss (Create-Pfad).

**Der Bug (RC3):**

```cpp
// sensor_manager.cpp:1438-1444 — AKTUELL (fehlerhaft):
SensorConfig* SensorManager::findSensorConfig(uint8_t gpio) {
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio == gpio) {   // NUR GPIO-Lookup!
            return &sensors_[i];
        }
    }
    return nullptr;
}
```

Der Lookup prueft nur den GPIO. Bei OneWire (mehrere DS18B20 auf GPIO 4) oder I2C (zwei
SHT31 auf GPIO 0) gibt es mehrere Sensoren auf demselben GPIO. Die Funktion gibt immer
den **ersten** zurueck. Der Config-Push fuer einen zweiten Sensor ueberschreibt immer
den ersten — auch wenn der Server bereits korrekt zwei separate Sensoren sendet.

**Konsequenz:** Selbst wenn R20-P1 (Server-Fix) implementiert ist und der Server zwei
Sensoren korrekt in der DB hat und beide per Config-Push sendet, versteht der ESP die
zweite Konfiguration falsch und ueberschreibt den ersten Sensor.

---

## IST-Zustand

**Datei:** `src/services/sensor/sensor_manager.cpp`

`findSensorConfig(uint8_t gpio)` matcht ausschliesslich auf GPIO-Nummer. Kein Unterschied
zwischen zwei Sensoren auf demselben GPIO.

Im `configureSensor()`-Aufruf:
```cpp
SensorConfig* existing = findSensorConfig(config.gpio);
if (existing) {
    // Update-Pfad — ueberschreibt IMMER den ersten Sensor auf diesem GPIO
    *existing = config;
} else {
    // Create-Pfad — neuer Sensor im Array
    sensors_[sensor_count_++] = config;
}
```

---

## SOLL-Zustand

### Schritt 1 — findSensorConfig() erweitern (BEIDE Overloads)

Es existieren **zwei Overloads** in `sensor_manager.cpp`:
- Non-const: Zeile 1438 — `SensorConfig* findSensorConfig(uint8_t gpio)`
- Const: Zeile 1447 — `const SensorConfig* findSensorConfig(uint8_t gpio) const`

**Beide** muessen die neue Signatur bekommen.

**Typ-Info:** `onewire_address` ist ein Arduino `String` (definiert in `sensor_types.h:51`),
NICHT `const char*`. Vergleich mit `!=` Operator, Laengenpruefung mit `.length()`.

```cpp
// BEIDE Overloads so anpassen:
SensorConfig* SensorManager::findSensorConfig(
    uint8_t gpio,
    const String& onewire_address,  // leer wenn nicht OneWire
    uint8_t i2c_address             // 0 wenn nicht I2C
) {
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio != gpio) continue;

        // OneWire: zusaetzlich ROM-Code vergleichen
        if (onewire_address.length() > 0) {
            if (sensors_[i].onewire_address != onewire_address) continue;
        }

        // I2C: zusaetzlich Adresse vergleichen (i2c_address > 0 = I2C-Sensor)
        if (i2c_address > 0) {
            if (sensors_[i].i2c_address != i2c_address) continue;
        }

        return &sensors_[i];
    }
    return nullptr;
}
```

Fuer Analog-/Digital-Sensoren (ein Sensor pro GPIO) bleibt die alte Signatur
als Overload mit Default-Parametern erhalten:
```cpp
SensorConfig* findSensorConfig(uint8_t gpio,
    const String& onewire_address = "", uint8_t i2c_address = 0);
```

### Schritt 2 — configureSensor() anpassen

`configureSensor()` (Zeile 200) muss die neue findSensorConfig-Signatur nutzen.

**Zwei wichtige Besonderheiten beachten:**

1. **Bestehender Multi-Value-I2C-Code (Zeilen 232-283):** `configureSensor()` hat bereits
   einen Branch fuer I2C-Multi-Value-Sensoren (z.B. SHT31 temp + humidity auf derselben
   i2c_address). Dieser Code behandelt Sub-Types desselben physischen Sensors. Die neue
   Adress-Logik muss sich **in** diesen bestehenden Code integrieren — nicht daran vorbei.
   Der Multi-Value-Branch bleibt fuer Sensoren **gleicher** Adresse; der neue Adress-Lookup
   unterscheidet Sensoren **verschiedener** Adressen.

2. **i2c_address kommt NICHT aus dem MQTT-Payload!** Der Config-Push-Parser in `main.cpp`
   (Zeile 2670-2731) extrahiert `onewire_address` aber NICHT `i2c_address`. Die i2c_address
   wird intern aus der SensorCapability-Registry abgeleitet (Zeilen 249, 269, 402 in
   sensor_manager.cpp). Deshalb: `capability->i2c_address` verwenden, NICHT `config.i2c_address`.

```cpp
// Zeile 230 — Statt:
SensorConfig* existing = findSensorConfig(config.gpio);

// SOLL:
SensorConfig* existing = findSensorConfig(
    config.gpio,
    config.onewire_address,         // ROM-Code oder leer (kommt aus MQTT-Payload)
    capability->i2c_address         // Adresse oder 0 (aus Registry, NICHT aus Payload)
);
```

### Schritt 3 — saveSensorConfig() Dedup erweitern

**Datei:** `config_manager.cpp`, Zeile 1646

**NVS-Key-Schema (aktuell, Phase 1E-B):**
- `sen_0_gpio`, `sen_0_type`, `sen_0_ow`, `sen_1_gpio`, `sen_1_type`, `sen_1_ow` etc.
- Legacy-Format (pre-Phase 1E-B): `sensor_0_gpio`, `sensor_0_type` etc.
- Index ist global (0, 1, 2 fuer alle Sensoren)
- `loadSensorConfig()` (Zeile 1792) laedt OneWire-Adresse korrekt (`NVS_SEN_OW` Key)

**Bug:** Die Dedup-Logik in `saveSensorConfig()` matcht nur `gpio + sensor_type`.
Bei 2x DS18B20 auf GPIO 4 (gleicher `sensor_type = "ds18b20"`) wird der erste immer
ueberschrieben. Fix: `onewire_address` in Dedup einbeziehen.

```cpp
// Zeile 1646 — Statt:
if (stored_gpio == config.gpio && stored_type == config.sensor_type) {
    // Update bestehenden Index
}

// SOLL:
if (stored_gpio == config.gpio && stored_type == config.sensor_type) {
    String stored_ow = prefs.getString(owKey);
    // OneWire: nur matchen wenn auch ROM-Code passt
    if (config.onewire_address.length() > 0 && stored_ow != config.onewire_address) {
        continue;  // anderer Sensor auf gleichem GPIO
    }
    // Update bestehenden Index
}
```

**i2c_address in NVS:** Wird aktuell NICHT persistiert (kein `NVS_SEN_I2C` Key).
Die i2c_address wird bei jedem Boot aus der SensorCapability-Registry abgeleitet.
Fuer I2C-Multi-Device (2x SHT31 auf 0x44 + 0x45) muss entweder:
- (a) i2c_address in NVS persistieren (neuer Key `sen_X_i2c`, empfohlen), oder
- (b) saveSensorConfig-Dedup um `sensor_type + sensor_name` erweitern (Workaround)

### Schritt 4 — removeSensor() adressbasiert erweitern

**Datei:** `sensor_manager.cpp`, Zeile 579

Gleicher GPIO-only Bug wie findSensorConfig:
- Zeile 585: `findSensorConfig(gpio)` → findet nur ersten Sensor auf dem GPIO
- Zeile 607: `if (sensors_[i].gpio == gpio) { ... break; }` → loescht nur ersten

Signatur erweitern:
```cpp
// Statt:
bool SensorManager::removeSensor(uint8_t gpio)

// SOLL:
bool SensorManager::removeSensor(uint8_t gpio,
    const String& onewire_address = "", uint8_t i2c_address = 0)
```

Der Aufrufer ist `main.cpp` (Zeile 2755-2762): Config-Push mit `active: false` ruft
`removeSensor(gpio)` auf. Dort muessen `onewire_address` und `i2c_address` aus dem
Payload durchgereicht werden.

### Schritt 5 — removeSensorConfig() adressbasiert erweitern

**Datei:** `config_manager.cpp`, Zeile 1931

`removeSensorConfig(uint8_t gpio)` matcht NVS-Index nur per GPIO:
- Zeile 1958: `if (stored_gpio == gpio) { found_index = i; break; }` → findet nur ersten

Fix: Zusaetzlich `onewire_address` und/oder `sensor_type` pruefen:
```cpp
bool ConfigManager::removeSensorConfig(uint8_t gpio,
    const String& onewire_address = "", const String& sensor_type = "")
```

### Schritt 6 — OneWire-Messung: ROM-Code-basiert (teilweise erledigt)

Die OneWire-Messung (Zeile 724-900) arbeitet BEREITS ROM-Code-basiert — das ist korrekt.
`hexStringToRom()` existiert in `src/utils/onewire_utils.cpp`.

**Was noch fehlt:** Die Mess-Trigger-Funktionen nutzen `findSensorConfig(gpio)` und
finden bei Multi-Sensor-GPIO nur den ersten:

| Funktion | Zeile | Bug |
|----------|-------|-----|
| `performMeasurement(gpio)` | 676 | findet nur ersten Sensor auf GPIO |
| `triggerManualMeasurement(gpio)` | 1290 | findet nur ersten Sensor auf GPIO |
| `performMultiValueMeasurement(gpio)` | 991 | findet nur ersten Sensor auf GPIO |
| `getSensorConfig(gpio)` | 638 | gibt nur ersten zurueck |
| `getSensorInfo(gpio)` | 1423 | zeigt nur ersten Sensor |
| `hasSensorOnGPIO(gpio)` | 647 | OK (prueft nur Existenz, kein Adress-Match noetig) |

Diese Funktionen muessen entweder:
- Die erweiterte `findSensorConfig(gpio, ow_addr, i2c_addr)` nutzen, oder
- Ueber `sensors_[]` iterieren statt Lookup (fuer Mess-Loop)

### Schritt 7 — MQTT-Payload-Handler: i2c_address extrahieren

**Datei:** `main.cpp`, Zeile 2670-2731

Der Config-Push-Parser extrahiert `onewire_address` (Zeile 2690) aber NICHT `i2c_address`.
Fuer I2C-Multi-Device (2x SHT31 auf verschiedenen Adressen) muss `i2c_address` auch
aus dem JSON-Payload extrahiert werden:

```cpp
// Zeile ~2690 — nach onewire_address Extraktion hinzufuegen:
uint8_t i2c_address = 0;
if (sensor_obj.containsKey("i2c_address")) {
    i2c_address = sensor_obj["i2c_address"].as<uint8_t>();
}
config.i2c_address = i2c_address;
```

Damit kann der Server (nach P1-Fix) die Ziel-Adresse im Config-Push mitgeben.
Ohne diesen Schritt funktioniert I2C-Multi-Device nicht Ende-zu-Ende.

---

## Was NICHT geaendert werden darf

- MQTT-Topic-Struktur (`kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`)
- Boot-Sequenz (16 Schritte)
- SafetyController und Emergency-Stop
- WiFi-Provisioning (Captive Portal)
- Die Grundstruktur der SensorConfig-Struct (neue Felder nur wenn unbedingt noetig)

---

## Kontext fuer den Agenten

**OneWire-Protokoll:** Mehrere Geraete auf einem Bus (einem GPIO). Jedes Geraet hat einen
einzigartigen 64-bit ROM-Code (8 Bytes, hex: "28FF641F7FCCBAE1"). Die DallasTemperature-
Bibliothek unterstuetzt ROM-Code-Adressierung nativ. `hexStringToRom()` in
`src/utils/onewire_utils.cpp` konvertiert den Hex-String zum DeviceAddress-Array.

Default-OneWire-Pin ist plattformabhaengig:
- ESP32-dev (Build-Target `esp32dev`): GPIO 4 (`esp32_dev.h:78`)
- Seeed XIAO ESP32-C3 (Build-Target `seeed`): GPIO 6 (`xiao_esp32c3.h:63`)

**I2C-Protokoll:** Mehrere Geraete auf einem Bus (SDA GPIO 21, SCL GPIO 22). Jedes Geraet
hat eine 7-bit I2C-Adresse (SHT31: 0x44=68 oder 0x45=69). In AutomationOne wird GPIO 0
als Konvention fuer I2C-Sensor-Konfigurationen genutzt — NICHT als physischer Pin.
Der I2C-Guard (FW-02) stellt sicher dass kein analogRead(0) aufgerufen wird.

**Fuer Analog- und Digital-Sensoren:** GPIO allein ist eindeutig (ein Sensor pro GPIO).
Der alte Lookup `findSensorConfig(gpio)` bleibt fuer diese Typen korrekt.

**Hardware-Zustand (ESP_EA5484, 2026-03-26):**
Aktuell laufen stabil: SHT31 (0x44) auf GPIO 0 (I2C), DS18B20 (28FF...BAE1) auf GPIO 4.
Der zweite DS18B20 und SHT31 (0x45) sind physisch abgeklemmt bis der Bug gefixt ist.

---

## Akzeptanzkriterien

- [ ] 2 DS18B20 auf GPIO 4 werden als 2 separate Sensoren konfiguriert (verschiedene ROM-Codes)
- [ ] 2 SHT31 (0x44 + 0x45) werden als 2 separate Sensoren konfiguriert (verschiedene I2C-Adressen)
- [ ] NVS speichert beide Sensoren persistent ueber Reboot hinweg (saveSensorConfig Dedup korrekt)
- [ ] Config-Push mit 2 Sensoren auf einem GPIO verarbeitet beide korrekt — kein Ueberschreiben
- [ ] Config-Push mit `active: false` loescht NUR den adressierten Sensor (removeSensor + removeSensorConfig adressbasiert)
- [ ] Messung adressiert den richtigen Sensor (ROM-Code-basiert fuer OneWire — bereits implementiert, Trigger-Funktionen pruefen)
- [ ] i2c_address wird aus MQTT-Payload extrahiert (main.cpp Config-Push-Parser)
- [ ] Analog-/Digital-Sensoren (1 Sensor pro GPIO) funktionieren weiterhin — Default-Parameter
- [ ] Wokwi-Tests fuer Single-Sensor-Szenarien weiterhin PASS (keine Regression)
- [ ] Firmware kompiliert ohne Errors und ohne neue Warnings

---

> Erstellt von: automation-experte Agent
> Roadmap-Referenz: R20-P2 in `auftraege/roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
> Begleitender Server-Fix: R20-P1 (`auftrag-R20-P1-server-sensor-crud-adress-lookup-2026-03-26.md`)
> Frontend-Ergaenzung: R20-P3 (`auftrag-R20-P3-frontend-adressmodal-2026-03-26.md`)
