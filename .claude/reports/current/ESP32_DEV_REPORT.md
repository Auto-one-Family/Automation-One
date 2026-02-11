# ESP32 Dev Report: Bug 2 - Case-Sensitivity in sensor_manager.cpp

## Modus: A (Analyse & Plan)
## Auftrag: Analyse case-sensitive sensor_type Vergleiche und Implementierungsplan fuer Fix
## Datum: 2026-02-11

---

## Codebase-Analyse

### Dateien analysiert

| Datei | Zweck | Zeilen gelesen |
|-------|-------|----------------|
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | Hauptfehlerquelle (1352 Zeilen komplett) | 1-1352 |
| `El Trabajante/src/models/sensor_registry.cpp` | Referenz-Pattern mit korrektem `toLowerCase()` | 1-305 |
| `El Trabajante/src/drivers/i2c_sensor_protocol.cpp` | Referenz-Pattern mit korrektem `toLowerCase()` | 1-250 |
| `El Trabajante/src/services/config/config_manager.cpp` | NVS Load/Save/Validate (Zeilen 1760-2054) | Partiell |
| `El Trabajante/src/main.cpp` | MQTT Config Parser `parseAndConfigureSensorWithTracking()` | 2299-2498 |
| `El Servador/.../config_builder.py` | Server Config Builder (sensor_type = direct from DB) | 110-155 |
| `El Servador/.../MOCK_ESP_SENSOR_SIMULATION.md` | Server sendet "DS18B20" uppercase | Grep |

### Patterns gefunden

**KORREKTES Pattern (sensor_registry.cpp Zeile 190-196):**
```cpp
const SensorCapability* findSensorCapability(const String& sensor_type) {
    if (sensor_type.length() == 0) {
        return nullptr;
    }

    // Case-insensitive lookup
    String lower_type = sensor_type;
    lower_type.toLowerCase();

    for (uint8_t i = 0; SENSOR_TYPE_MAP[i].esp32_type != nullptr; i++) {
        if (lower_type == String(SENSOR_TYPE_MAP[i].esp32_type)) {
            return SENSOR_TYPE_MAP[i].capability;
        }
    }
    return nullptr;
}
```

**KORREKTES Pattern (i2c_sensor_protocol.cpp Zeile 172-173):**
```cpp
const I2CSensorProtocol* findI2CSensorProtocol(const String& sensor_type) {
    String lower_type = sensor_type;
    lower_type.toLowerCase();
    // ... lookup mit lower_type
}
```

**FEHLERHAFTES Pattern (sensor_manager.cpp):** Direkte `.indexOf()` ohne `toLowerCase()`.

---

## Vollstaendige Bug-Inventur: Alle case-sensitiven Vergleiche in sensor_manager.cpp

### BUG 2a: Zeile 319 - OneWire Detection (KRITISCH)

```cpp
bool is_onewire = (capability && !capability->is_i2c &&
                   config.sensor_type.indexOf("ds18b20") >= 0);
```

**Impact:** Server sendet `"DS18B20"` uppercase. `indexOf("ds18b20")` matcht NICHT auf `"DS18B20"`. Ergebnis: `is_onewire = false`, Sensor wird als "Standard GPIO Sensor" behandelt, GPIO-Reservation schlaegt fehl wenn OneWire-Bus den Pin bereits besitzt --> `ERROR_GPIO_CONFLICT`.

**Schweregrad:** KRITISCH. Verhindert OneWire-Sensor-Konfiguration komplett.

### BUG 2b: Zeile 586 - SHT31 Raw Value Extraction

```cpp
if (config->sensor_type.indexOf("sht31") >= 0) {
    raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
} else {
    raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
}
```

**Impact:** Wenn Server `"SHT31"` oder `"temperature_SHT31"` sendet, matcht `indexOf("sht31")` NICHT. Allerdings: Der else-Branch macht exakt dasselbe (generic I2C: first 2 bytes). Funktional ist das Ergebnis identisch.

**Schweregrad:** NIEDRIG. Aktuell kein funktionaler Impact weil beide Branches denselben Code ausfuehren. Trotzdem fixen fuer Konsistenz und zukuenftige Aenderungen.

### Korrekt: Zeile 786-819 (Fallback-Pfad)

```cpp
String lower_type = config->sensor_type;
lower_type.toLowerCase();
if (lower_type.indexOf("ds18b20") >= 0 || lower_type.indexOf("onewire") >= 0) {
```

Dieser Fallback-Pfad fuer unbekannte Sensor-Typen (wenn `findSensorCapability()` null zurueckgibt) ist KORREKT implementiert. Er verwendet `toLowerCase()` vor den `indexOf()`-Aufrufen.

### Korrekt: findSensorCapability() (sensor_registry.cpp)

Die Lookup-Funktion `findSensorCapability()` ist bereits case-insensitive (Zeile 190-196). Das heisst: Der `capability`-Pointer in Zeile 173 und 318 wird KORREKT aufgeloest, auch wenn der Server `"DS18B20"` sendet. Das Problem liegt ausschliesslich in den direkten `indexOf()`-Aufrufen auf `config.sensor_type`.

---

## Analyse: Wo findet (keine) Normalisierung statt?

### Datenfluss: MQTT -> ESP32 Config

```
Server DB (sensor_type: "DS18B20")
  └── config_builder.py: build_sensor_payload() → sensor_type "direct" mapping
       └── MQTT Payload: {"sensor_type": "DS18B20", ...}
            └── main.cpp: parseAndConfigureSensorWithTracking()
                 └── JsonHelpers::extractString() → config.sensor_type = "DS18B20"
                      └── NO NORMALIZATION! String goes through as-is
                           └── sensorManager.configureSensor(config)
```

### Datenfluss: NVS Load

```
NVS Storage (sensor_type: was gespeichert wurde)
  └── config_manager.cpp: loadSensorConfig() Zeile 1832
       └── migrateReadString() → config.sensor_type = was in NVS steht
            └── NO NORMALIZATION! String goes through as-is
```

### Wo existiert BEREITS Normalisierung?

| Komponente | Normalisierung? | Details |
|------------|----------------|---------|
| `findSensorCapability()` | JA | `toLowerCase()` vor Registry-Lookup (sensor_registry.cpp:190) |
| `findI2CSensorProtocol()` | JA | `toLowerCase()` vor Protocol-Lookup (i2c_sensor_protocol.cpp:172) |
| `isMultiValueDevice()` | JA | `toLowerCase()` (sensor_registry.cpp:207) |
| `getI2CAddress()` | JA | `toLowerCase()` (sensor_registry.cpp:226) |
| `getMultiValueTypes()` | JA | `toLowerCase()` (sensor_registry.cpp:259) |
| `performMeasurement() Fallback` | JA | `toLowerCase()` vor indexOf (sensor_manager.cpp:786) |
| `configureSensor() is_onewire` | **NEIN** | BUG 2a - Zeile 319 |
| `performMeasurement() SHT31` | **NEIN** | BUG 2b - Zeile 586 |
| `config_manager.cpp` Load/Save | **NEIN** | Keine Normalisierung |
| `main.cpp` MQTT Parse | **NEIN** | Keine Normalisierung |

---

## Options-Analyse fuer den Fix

### Option A: Lokale Fixes in sensor_manager.cpp

**Ansatz:** `toLowerCase()` direkt vor den betroffenen `indexOf()`-Aufrufen.

**Vorteile:**
- Minimale Aenderung (2 Zeilen)
- Kein Risiko fuer andere Codepfade
- Konsistent mit dem Fallback-Pattern (Zeile 786-787)

**Nachteile:**
- Symptom-Behandlung, nicht Ursache
- Zukuenftige `indexOf()`-Aufrufe auf `sensor_type` haben dasselbe Problem
- Kein DRY-Prinzip (toLowerCase() muss an jeder Stelle einzeln eingefuegt werden)

**Aenderungen:**
```
Zeile 319: 2 Zeilen hinzufuegen (toLowerCase vor indexOf)
Zeile 586: 2 Zeilen hinzufuegen (toLowerCase vor indexOf)
```

### Option B: Normalisierung in config_manager.cpp beim Laden

**Ansatz:** `config.sensor_type.toLowerCase()` nach dem Laden aus NVS in `loadSensorConfig()`.

**Vorteile:**
- Zentraler Fix fuer NVS-geladene Configs
- Alle nachgelagerten Stellen profitieren

**Nachteile:**
- Loest das Problem NICHT fuer MQTT-geladene Configs (Hauptpfad bei Wokwi!)
- Benoetigt zusaetzlich Fix in main.cpp (MQTT-Parser)
- Aendert gespeicherte Daten nicht (NVS enthaelt weiterhin Originalschreibweise)
- Risiko: Wenn Server die Original-Schreibweise zurueckerwartet (MQTT Payload sensor_type Feld)

### Option C: Normalisierung beim MQTT-Config-Empfang (main.cpp)

**Ansatz:** `config.sensor_type.toLowerCase()` in `parseAndConfigureSensorWithTracking()` direkt nach dem JSON-Parsing.

**Vorteile:**
- Einmaliger Fix am Eintrittspunkt (MQTT ist der Hauptpfad)
- Alle nachgelagerten Stellen profitieren automatisch
- Konsistent: Jeder Sensor-Type der in SensorManager ankommt ist lowercase

**Nachteile:**
- Loest das Problem NICHT fuer NVS-geladene Configs (benoetigt zusaetzlich Option B)
- Veraendert den Wert der in NVS gespeichert wird (lowercase statt Original)
- MQTT-Payload `sensor_type` Feld wird auch lowercase gesendet (bereits der Fall durch `getServerSensorType()` in Zeile 837)

### Option D: Kombination C + B + A (Empfehlung)

**Ansatz:** Defense-in-Depth - Normalisierung an ALLEN Eintrittspunkten.

**Umsetzung:**
1. **main.cpp** (MQTT-Eintrittspunkt): `config.sensor_type.toLowerCase()` nach JSON-Parsing
2. **config_manager.cpp** (NVS-Eintrittspunkt): `config.sensor_type.toLowerCase()` nach NVS-Laden
3. **sensor_manager.cpp** (Defense-in-Depth): Lokale Fixes an den 2 betroffenen Stellen

**Vorteile:**
- Kein Pfad kann ein uppercase sensor_type durchlassen
- Defense-in-Depth (gleiche Philosophie wie GPIO Safety Checks)
- Zukunftssicher

**Nachteile:**
- 3 Aenderungspunkte statt 1
- Marginal mehr Code

---

## EMPFEHLUNG: Option D (Defense-in-Depth)

Begruendung: Das Projekt verwendet bereits Defense-in-Depth bei GPIO-Checks (Server-Centric Deviation Kommentar in sensor_manager.cpp Zeile 311-312). Dasselbe Prinzip auf Case-Normalisierung anwenden.

Die MQTT-Payload-Kompatibilitaet ist gesichert weil:
1. `getServerSensorType()` (Zeile 837) normalisiert den Typ sowieso schon via `findSensorCapability()` (case-insensitive) und gibt den `server_sensor_type` aus der Registry zurueck (immer lowercase)
2. Der Server speichert `sensor_type` case-insensitiv in der DB (Python-seitig gibt es keine case-sensitive Logik)

---

## Qualitaetspruefung: 8-Dimensionen-Checkliste

| # | Dimension | Pruefung | Status |
|---|-----------|----------|--------|
| 1 | **Struktur & Einbindung** | Keine neuen Dateien, keine neuen Includes. Aenderungen in 3 existierenden Dateien. | OK |
| 2 | **Namenskonvention** | `lower_type` Variable folgt existierendem Pattern (Zeile 786, sensor_registry.cpp:190) | OK |
| 3 | **Rueckwaertskompatibilitaet** | MQTT-Payloads: `sensor_type` im Payload wird via `getServerSensorType()` normalisiert (Zeile 837). NVS: lowercase wird gespeichert, findSensorCapability() ist case-insensitive. | OK |
| 4 | **Wiederverwendbarkeit** | Nutzt exakt das gleiche Pattern wie sensor_registry.cpp und i2c_sensor_protocol.cpp | OK |
| 5 | **Speicher & Ressourcen** | 1 temporaerer String pro Normalisierung (max 20 Bytes auf Stack). Kein Heap-Impact. | OK |
| 6 | **Fehlertoleranz** | Fix verhindert GPIO_CONFLICT Fehler der durch Case-Mismatch entsteht | OK |
| 7 | **Seiteneffekte** | NVS speichert jetzt lowercase sensor_type statt Original. findSensorCapability() ist case-insensitive, kein Impact. | OK |
| 8 | **Industrielles Niveau** | Defense-in-Depth Pattern. Case-Normalisierung am Eintrittspunkt ist Standard-Practice. | OK |

---

## Cross-Layer Impact

| Bereich | Betroffen? | Details |
|---------|-----------|---------|
| Server | NEIN | Server empfaengt sensor_type via `getServerSensorType()` welches bereits normalisiert (sensor_registry.cpp). Kein Change am MQTT-Payload. |
| Frontend | NEIN | Frontend empfaengt Sensor-Daten via Server WebSocket, nicht direkt von ESP32. |
| MQTT Topics | NEIN | Topics enthalten keinen sensor_type (nur GPIO-Nummer). |
| Error Codes | NEIN | Keine neuen Error Codes. |
| NVS Keys | NEIN | Keine neuen Keys. Wert-Format aendert sich (lowercase statt mixed-case). |

---

## Konkreter Implementierungsplan

### Schritt 1: main.cpp - MQTT Eintrittspunkt normalisieren

**Datei:** `El Trabajante/src/main.cpp`
**Stelle:** In `parseAndConfigureSensorWithTracking()`, nach Zeile 2402 (nach `extractString(sensor_obj, "sensor_type", config.sensor_type)`)

**Vorher:**
```cpp
  if (!JsonHelpers::extractString(sensor_obj, "sensor_type", config.sensor_type)) {
    LOG_ERROR("Sensor field 'sensor_type' must be a string");
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_CONFIG_INVALID, "TYPE_MISMATCH", "Field 'sensor_type' must be a string");
  }
```

**Nachher:**
```cpp
  if (!JsonHelpers::extractString(sensor_obj, "sensor_type", config.sensor_type)) {
    LOG_ERROR("Sensor field 'sensor_type' must be a string");
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_CONFIG_INVALID, "TYPE_MISMATCH", "Field 'sensor_type' must be a string");
  }
  // Normalize sensor_type to lowercase (Defense-in-Depth)
  // Server may send "DS18B20" or "SHT31" - registry lookups are case-insensitive
  // but direct indexOf() checks in sensor_manager.cpp need lowercase
  config.sensor_type.toLowerCase();
```

**Pattern-Referenz:** sensor_registry.cpp:190-191 (`lower_type.toLowerCase()`)

### Schritt 2: config_manager.cpp - NVS Eintrittspunkt normalisieren

**Datei:** `El Trabajante/src/services/config/config_manager.cpp`
**Stelle:** In `loadSensorConfig()`, nach Zeile 1832 (nach `config.sensor_type = migrateReadString(...)`)

**Vorher:**
```cpp
    config.sensor_type = migrateReadString(new_key, old_key, "");
```

**Nachher:**
```cpp
    config.sensor_type = migrateReadString(new_key, old_key, "");
    // Normalize sensor_type to lowercase (Defense-in-Depth)
    // Ensures consistent casing regardless of what was stored in NVS
    config.sensor_type.toLowerCase();
```

**Pattern-Referenz:** sensor_registry.cpp:190-191

### Schritt 3: sensor_manager.cpp - Lokale Defense-in-Depth Fixes

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`

#### Fix 3a: Zeile 318-319 (OneWire Detection)

**Vorher:**
```cpp
    bool is_onewire = (capability && !capability->is_i2c &&
                       config.sensor_type.indexOf("ds18b20") >= 0);
```

**Nachher:**
```cpp
    // Defense-in-Depth: case-insensitive check (main entry points normalize,
    // but direct indexOf needs protection against mixed-case sensor_type)
    String lower_sensor_type = config.sensor_type;
    lower_sensor_type.toLowerCase();
    bool is_onewire = (capability && !capability->is_i2c &&
                       lower_sensor_type.indexOf("ds18b20") >= 0);
```

**Pattern-Referenz:** sensor_manager.cpp:786-787 (identisches Pattern im Fallback-Pfad)

#### Fix 3b: Zeile 586 (SHT31 Raw Value Extraction)

**Vorher:**
```cpp
                if (config->sensor_type.indexOf("sht31") >= 0) {
```

**Nachher:**
```cpp
                // Defense-in-Depth: case-insensitive check
                String lower_type_check = config->sensor_type;
                lower_type_check.toLowerCase();
                if (lower_type_check.indexOf("sht31") >= 0) {
```

**Pattern-Referenz:** sensor_manager.cpp:786-787

### Schritt 4: Build-Verifikation

```bash
cd "El Trabajante" && pio run -e wokwi_esp01
cd "El Trabajante" && pio test -e native -vvv
```

### Zusammenfassung der Aenderungen

| Datei | Stelle | Aenderung | Kategorie |
|-------|--------|-----------|-----------|
| `main.cpp` | Zeile ~2402 | `config.sensor_type.toLowerCase()` nach JSON-Parsing | Eintrittspunkt |
| `config_manager.cpp` | Zeile ~1832 | `config.sensor_type.toLowerCase()` nach NVS-Laden | Eintrittspunkt |
| `sensor_manager.cpp` | Zeile ~318 | `toLowerCase()` vor `indexOf("ds18b20")` | Defense-in-Depth |
| `sensor_manager.cpp` | Zeile ~586 | `toLowerCase()` vor `indexOf("sht31")` | Defense-in-Depth |

**Gesamt:** 4 Stellen, ~12 Zeilen neuer Code (inkl. Kommentare), 0 neue Dateien, 0 neue Includes.

---

## Bug 3: ZONE_MISMATCH (ESP32-seitige Analyse)

### ESP32-Befund

Das ESP32-Verhalten ist KORREKT:
- Nach Reboot reportet ESP `zone_assigned: false` im Heartbeat weil Wokwi kein persistentes NVS hat
- ESP wartet auf Zone-Assignment via MQTT (`zone/assign` Topic)
- Sobald Server Zone-Assignment sendet, setzt ESP `zone_assigned: true`

### Kein ESP32-Fix noetig

Das Problem liegt im Server-Flow:
- Server muss nach ESP-Discovery automatisch ein Zone-Assignment senden
- Oder Server muss `zone_assigned: false` im Heartbeat als normal akzeptieren fuer frisch gebootete ESPs

**Empfehlung:** `server-dev` Agent fuer den Server-seitigen Fix beauftragen.

---

## Empfehlung

1. **Bug 2 Fix:** `esp32-dev` Agent mit dem obigen Plan beauftragen (Modus B: Implementierung)
2. **Bug 3 Fix:** `server-dev` Agent beauftragen (rein Server-seitig)
3. **Nach Implementierung:** Wokwi Full-Boot-Test mit DS18B20 Sensor-Config die der Server mit uppercase `"DS18B20"` sendet
