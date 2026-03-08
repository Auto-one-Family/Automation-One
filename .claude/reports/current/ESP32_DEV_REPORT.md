# ESP32 Dev Report: DS18B20 Konfigurationsfehler Analyse

## Modus: A (Analyse)
## Auftrag: NVS-Fehler bei DS18B20-Konfiguration auf Wokwi-ESP analysieren

## Codebase-Analyse

Analysierte Dateien:
- `El Trabajante/src/services/config/config_manager.h` + `.cpp`
- `El Trabajante/src/services/sensor/sensor_manager.cpp`
- `El Trabajante/src/main.cpp` (MQTT-Callbacks, OneWire-Scan-Handler, Subzone-Handler)
- `El Trabajante/src/drivers/gpio_manager.cpp` (Safe-Mode Implementierung)

---

## Diagnose 1: NVS-Fehler `sz_idx_map NOT_FOUND` und `subzone_ids NOT_FOUND`

### Befund: KEIN Bug, normales First-Boot-Verhalten

**Ursache:** Diese Fehler kommen aus `ESP32 Preferences.cpp` intern (Arduino Framework), wenn
`getString()` auf einen NVS-Key zugreift der noch nicht existiert. Das ist bei einem frisch
gesetzten Wokwi-ESP immer der Fall.

**Code-Pfad der Ausloesung** (`config_manager.cpp` Zeile 1097-1110):
```cpp
// Fallback: Parse index map
String index_map = storageManager.getStringObj(NVS_SZ_INDEX_MAP, "");  // "sz_idx_map" -> NOT_FOUND
// Legacy fallback
String subzone_ids_str = storageManager.getStringObj(NVS_SZ_IDS_OLD, "");  // "subzone_ids" -> NOT_FOUND
```

Beide Keys existieren auf einem frischen ESP nicht. Die `Preferences`-Bibliothek loggt intern
`nvs_get_str len fail` auf ERROR-Level, auch wenn ein Default-Wert zurueckgegeben wird. Das ist
ein bekanntes Verhalten des Arduino-Frameworks — kein ESP32-Firmware-Bug.

**Beweis aus dem Code:** Die `getSubzoneCount()`-Funktion hat einen expliziten Kommentar dazu
(`config_manager.cpp` Zeile 1064-1070):
> "The ESP32 Preferences library logs an ERROR when opening a non-existent namespace in read-only
> mode (expected for new devices without subzones)."

Der Cache-Fix (`subzone_count_initialized_`) verhindert wiederholte NVS-Zugriffe, aber der erste
Zugriff beim Heartbeat (oder Zone-Assignment-Cascade) erzeugt diese Fehler unvermeidlich.

**Ausloeser-Zeitpunkt:** Timestamp `[126784]` deutet auf den ersten Heartbeat hin, der
`getDiagnosticsJSON()` aufruft, welches `getSubzoneCount()` aufruft.

**Fazit: Die NVS-Fehler sind harmlos. Kein Bug. Kein Blocker fuer die DS18B20-Konfiguration.**

---

## Diagnose 2: Subzone-Config-Save danach erfolgreich

Der Log zeigt nach den NVS-Fehlern:
```
[126830] [INFO] [CONFIG] ConfigManager: Subzone config saved successfully (index 0)
```

Die Subzone wurde also **erfolgreich gespeichert**. Der Timestamp-Warning danach
(`[175678] TimeManager: No valid timestamp available`) ist ein separates Wokwi-spezifisches
Problem (kein NTP in Wokwi-Simulator) und kein Konfigurationsfehler.

**Fazit: Der vorliegende Log zeigt keinen echten Fehler. Subzone-Assignment lief durch.**

---

## Diagnose 3: OneWire-Scan-Flow (vollstaendig dokumentiert)

### Subscribe-Topic
```
kaiser/{kaiser_id}/esp/{esp_id}/system/command
```
Alle System-Befehle laufen ueber diesen einen Topic.

### Trigger-Payload
```json
{ "command": "onewire/scan", "pin": 4 }
```
`pin` ist optional; Default ist `HardwareConfig::DEFAULT_ONEWIRE_PIN`.

### Handler-Ablauf (`main.cpp` Zeile 1013-1088)

1. Falls `oneWireBusManager` noch nicht initialisiert: `begin(pin)` aufrufen.
2. Falls Bus bereits auf ANDEREM GPIO aktiv: Fehler-Response, kein Scan.
3. Scan: `oneWireBusManager.scanDevices(rom_codes, 10, found_count)`
4. Response-Format (JSON):
   ```json
   {
     "devices": [
       { "rom_code": "28FF641E8D3C0C79", "device_type": "DS18B20", "pin": 4 }
     ],
     "found_count": 1,
     "seq": 42
   }
   ```
5. Publish-Topics:
   - Scan-Ergebnis: `kaiser/god/esp/{esp_id}/onewire/scan_result` (HARDCODED "god")
   - ACK: `kaiser/{kaiser_id}/esp/{esp_id}/system/command/response`

### Kritischer Befund: Hardcodiertes Scan-Result-Topic

`main.cpp` Zeile 1075:
```cpp
String scan_result_topic = "kaiser/god/esp/" + g_system_config.esp_id + "/onewire/scan_result";
```

Der `TopicBuilder` wird hier NICHT verwendet. Kaiser-ID ist hardcoded als `"god"`. Falls der
ESP einem anderen Kaiser zugewiesen ist, empfaengt der Server das Scan-Ergebnis auf dem falschen
Topic. Das ist eine Abweichung vom Pattern und ein potenzieller echter Bug.

---

## Diagnose 4: DS18B20-Konfigurationsflow (MQTT Config-Push)

### Config-Topic
```
kaiser/{kaiser_id}/esp/{esp_id}/config
```

### Minimal-Payload fuer DS18B20
```json
{
  "sensors": [{
    "gpio": 4,
    "sensor_type": "ds18b20",
    "sensor_name": "Temp1",
    "onewire_address": "28FF641E8D3C0C79",
    "active": true,
    "raw_mode": true,
    "operating_mode": "continuous",
    "measurement_interval_seconds": 30
  }]
}
```

### Konfigurationsschritte (`sensor_manager.cpp` Zeile 200-546)

1. `sensor_type` -> lowercase -> `indexOf("ds18b20")` prueft ob OneWire-Sensor.
2. **HART-STOP**: `onewire_address.length() != 16` -> Fehler + return false.
3. **HART-STOP**: `OneWireUtils::hexStringToRom()` schlaegt fehl -> Fehler + return false.
4. CRC invalid -> nur WARNING, kein harter Fehler (Konfiguration laeuft weiter).
5. **HART-STOP**: Gleiche ROM-Code bereits registriert -> Duplikat-Fehler + return false.
6. GPIO-Sharing-Logik (3 Faelle):
   - Pin frei: Bus reserviert beim `begin()` unten.
   - Pin `bus/onewire/{gpio}`: Sharing erlaubt, kein `requestPin()` noetig.
   - Pin anderweitig belegt: GPIO-Konflikt, HART-STOP.
7. Falls Bus noch nicht aktiv: `onewire_bus_->begin(config.gpio)`.
8. Falls Bus auf anderem GPIO bereits aktiv: Single-Bus-Fehler, HART-STOP.
9. **HART-STOP**: `onewire_bus_->isDevicePresent(rom)` -> false = Geraet nicht auf Bus.

Schritt 9 ist der wahrscheinlichste Stopp-Punkt in Wokwi wenn der DS18B20 nicht korrekt im
`diagram.json` verdrahtet ist oder die Simulation ihn nicht antwortet.

---

## Diagnose 5: Safe-Mode und Sensor-Konfiguration

### Was Safe-Mode macht (`gpio_manager.cpp` Zeile 763-803)
- Setzt alle Subzone-GPIOs auf `INPUT_PULLUP`.
- Setzt `pin_info.in_safe_mode = true`.

### Blockiert Safe-Mode die DS18B20-Konfiguration?

**Nein.** Der OneWire-Pfad in `configureSensor()` umgeht `isPinAvailable()` komplett (Zeile 447).
Er prueft nur den `owner`-String direkt. `INPUT_PULLUP` ist ausserdem eine korrekte initiale
Konfiguration fuer OneWire — der `OneWireBusManager` konfiguriert den Pin selbst beim `begin()`.

**Fazit: Safe-Mode blockiert DS18B20-Konfiguration NICHT.**

---

## Gesamtbefund: Warum schlaegt DS18B20-Konfiguration fehl?

Der vorliegende Log endet bei `[126830]` nach dem Subzone-Save. Was danach beim Config-Push
passiert ist NICHT im Log sichtbar. Die NVS-Fehler selbst sind keine Ursache.

**Drei wahrscheinliche Ursachen (Prioritaet):**

### Prioritaet 1: `onewire_address` fehlt oder hat falsche Laenge im Config-Push
Fehlermeldung im Log: `"Invalid OneWire ROM-Code length (expected 16, got X)"`
Das Feld ist Pflicht und muss exakt 16 Hex-Zeichen haben (`28FF641E8D3C0C79`).

### Prioritaet 2: DS18B20 antwortet nicht auf Wokwi-Bus (`isDevicePresent` = false)
Fehlermeldung im Log: `"OneWire device ... not found on bus"`
Pruefe ob DS18B20 im `diagram.json` korrekt auf dem GPIO-Pin verdrahtet ist und der Wokwi-Simulator ihn unterstuetzt.

### Prioritaet 3: Scan-Ergebnis kommt nicht beim Server an
Hardcoded Topic `kaiser/god/esp/{esp_id}/onewire/scan_result` — wenn Server auf anderem Topic
subscribed, bekommt er den ROM-Code nicht und kann keinen validen Config-Push senden.

---

## Cross-Layer Impact

| Problem | Datei | Zeile | Einfluss |
|---------|-------|-------|---------|
| Scan-Result-Topic hardcoded als "god" | `main.cpp` | 1075 | Server empfaengt ROM-Code nicht wenn Kaiser-ID != "god" |
| `onewire_address` Pflichtfeld | `sensor_manager.cpp` | 408 | Server-seitiger Config-Builder muss Feld setzen |
| `isDevicePresent` Wokwi-Check | `sensor_manager.cpp` | 497 | Wokwi muss DS18B20 auf richtiger GPIO haben |

---

## Naechste Schritte (keine Implementierung ohne Bestaetigung)

1. **Vollstaendiges Serial-Log anfordern** — Suche nach:
   - `"Invalid OneWire ROM-Code length"` -> Prioritaet 1
   - `"not found on bus"` -> Prioritaet 2
   - `"Failed to configure sensor"` -> allgemeiner Fehlerpfad

2. **Falls Prioritaet 3 bestaetigt:** Fix in `main.cpp` Zeile 1075 + `topic_builder.h/cpp`
   (neues `buildOneWireScanResultTopic()`). `mqtt-dev` beauftragen fuer synchronen ESP32+Server-Fix.

3. **Falls Prioritaet 2:** Wokwi `diagram.json` pruefen ob DS18B20 auf korrektem GPIO liegt.

---

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Befund |
|---|-----------|--------|
| 1 | Struktur & Einbindung | Keine Code-Aenderungen — nur Analyse |
| 2 | Namenskonvention | Nicht anwendbar |
| 3 | Rueckwaertskompatibilitaet | Nicht anwendbar |
| 4 | Wiederverwendbarkeit | Nicht anwendbar |
| 5 | Speicher & Ressourcen | Nicht anwendbar |
| 6 | Fehlertoleranz | NVS-Fehler sind handled, kein Crash |
| 7 | Seiteneffekte | Scan-Result-Topic Hardcoding ist potenzieller Bug (Prio 3) |
| 8 | Industrielles Niveau | Safe-Mode korrekt implementiert |

## Verifikation
Kein Code geaendert — Analyse-Modus. Kein Build noetig.

## Empfehlung
Vollstaendiges Serial-Log analysieren (ab dem Zeitpunkt des Config-Pushes). Bei Prio-1/2-Befund:
kein ESP32-Code-Fix noetig. Bei Prio-3-Befund: `mqtt-dev` fuer Topic-Synchronisation beauftragen.
