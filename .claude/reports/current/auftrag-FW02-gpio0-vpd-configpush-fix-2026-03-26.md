# Auftrag FW-02: GPIO-0-I2C-Handling + VPD-VIRTUAL-Filter + OneWire-Pin-Parsing (Rev. 2)

> **Bereich:** El Trabajante (ESP32 Firmware, C++ / Arduino) + El Servador (FastAPI, Python)
> **Prio:** KRITISCH — ADC2-Error-Spam jede Sekunde, VPD zerstoert SHT31-Multi-Value-Kette
> **Datum:** 2026-03-26 (Rev. 2 — Pfade und Codebeispiele korrigiert nach Review)
> **Agent:** Firmware-Agent (El Trabajante) + Backend-Agent (El Servador)
> **Einschaetzung:** 3-5 Stunden, 1 Backend-Fix + 2 Firmware-Fixes
> **Abhaengigkeit:** Keiner (unabhaengig von FW-01)

---

## Kontext: Das AutomationOne-System

AutomationOne hat 3 Schichten:
- **El Servador** (FastAPI, Python): Zentrale Datenbank (PostgreSQL). Sendet Sensor/Aktor-Konfiguration per MQTT an ESPs.
- **El Trabajante** (ESP32, C++/Arduino): Empfaengt Konfiguration per MQTT, liest Sensoren aus, publiziert Daten.
- Synchronisationsregel: Der ESP konfiguriert sich dynamisch per MQTT-Push vom Server.

### Betroffenes Hardware-Setup

Das reale Testsystem besteht aus:
- **ESP_472204** ("Zelt Agent")
- **SHT31** (I2C-Sensor, Adresse 0x44, SDA=GPIO 21, SCL=GPIO 22)
- **Relay** (GPIO 27)

Der SHT31 ist ein I2C-Sensor. Im Backend wird er mit `gpio=0` gespeichert, weil I2C-Sensoren keinen dedizierten GPIO haben — sie kommunizieren ueber den gemeinsamen I2C-Bus (SDA/SCL). gpio=0 ist die Backend-Konvention fuer "kein dedizierter GPIO".

---

## Drei Root Causes aus dem Serial-Debug-Report

Dieser Auftrag adressiert drei Fehler, die im Serial-Debug-Report identifiziert wurden. Sie stammen aus zwei Fehlerquellen: dem Config-Push-Filter im Backend und dem GPIO-Handling in der Firmware.

---

## Root Cause A — Config-Push sendet VIRTUAL-Sensoren an ESP (KRITISCH)

### IST-Zustand

VPD ist ein serverseitig berechneter Wert. Der Server speichert ihn als `sensor_config`-Eintrag mit `interface_type='VIRTUAL'` in der Datenbank. Das ist korrekt — VPD wird event-driven im Backend berechnet (nach jeder SHT31-Messung), nicht vom ESP gemessen.

**Das Problem:** Der Config-Push-Mechanismus filtert `interface_type='VIRTUAL'` nicht heraus. Er sendet ALLE `sensor_configs` an den ESP — inklusive die VPD-Config.

Konkrete Auswirkung auf ESP_472204:
1. ESP empfaengt die VPD-Config mit `sensor_type='vpd'`, `gpio=0`, `interface_type='VIRTUAL'`
2. ESP kennt "vpd" nicht als gueltige Sensor-Schnittstelle in seiner Sensor-Registry
3. Die Firmware behandelt `vpd` als nicht-I2C-Sensor und versucht ihn auf gpio=0 zu registrieren
4. Das ueberschreibt den bereits konfigurierten `sht31_humidity`-Eintrag auf gpio=0
5. Die SHT31 Multi-Value-Kette (`sht31_temp` + `sht31_humidity`) ist zerstoert — `sht31_humidity` fehlt

Das ist **Fehler 2 (HOCH)** aus dem Serial-Debug-Report: "vpd ueberschreibt sht31_humidity".

### SOLL-Zustand

Sensoren mit `interface_type='VIRTUAL'` werden niemals an den ESP gesendet. Sie existieren nur im Backend und werden ausschliesslich server-seitig berechnet. Der Config-Push filtert sie explizit heraus.

### Fix: Backend — Config-Push VIRTUAL-Filter

**Betroffene Stelle:** Die Config-Push-Payload wird in `config_builder.py` gebaut — Methode `build_combined_config()` (ab Zeile ~195). Diese Funktion liest `sensor_configs` aus der DB und baut die JSON-Payload fuer den ESP.

**Wichtig:** `config_handler.py` ist fuer Config-RESPONSE-Empfang (ESP→Server), NICHT fuer Config-Push (Server→ESP). Die Push-Logik liegt ausschliesslich in `config_builder.py`. Alle 6 Callpoints (sensors.py x3, actuators.py x2, heartbeat_handler.py x1) nutzen `build_combined_config()` als einzigen Einstiegspunkt — der Filter muss nur an EINER Stelle sitzen.

**Implementierung (Python):**

```python
# In config_builder.py, build_combined_config(), nach dem Laden der aktiven Sensoren:
active_sensors = [s for s in sensors if s.enabled]
# VIRTUAL-Filter — serverseitig berechnete Sensoren (z.B. VPD) nie an ESP senden:
active_sensors = [s for s in active_sensors
                  if not (getattr(s, "interface_type", None) or "").upper() == "VIRTUAL"]
```

Da ALLE Config-Push-Pfade (Full-State + inkrementell + auto-push bei Heartbeat) durch `build_combined_config()` gehen, reicht EIN Filter an dieser Stelle.

**Verifikation:** Nach dem Fix per MQTT-Monitor pruefen, ob VPD-Configs in der Config-Push-Payload erscheinen. Sie duerfen nicht vorkommen.

---

## Root Cause B — ESP ruft analogRead() fuer gpio=0 I2C-Sensoren auf (KRITISCH)

### IST-Zustand

Der ESP empfaengt eine Sensor-Config mit `gpio=0` und `sensor_type='sht31_temp'` (oder `sht31_humidity`). Die Firmware muss jetzt entscheiden: Wie lese ich diesen Sensor?

Das Problem: GPIO 0 ist auf dem ESP32 ein ADC2-Pin. Die Firmware koennte bei falscher Routing-Logik versuchen, diesen Pin via analogRead() auszulesen, statt den I2C-Bus zu nutzen. ESP32 ADC2 ist nicht verwendbar wenn WiFi aktiv ist — was bei ESP_472204 immer der Fall ist.

**Fehler 3 (KRITISCH)** aus dem Serial-Debug-Report: "ADC2-Error-Spam jede Sekunde" — genau dieses Symptom.

### Hintergrund: gpio=0 als I2C-Konvention

Das Backend speichert I2C-Sensoren mit `gpio=0` weil I2C-Sensoren keinen eigenen dedizierten GPIO haben. Sie kommunizieren ueber den gemeinsamen I2C-Bus mit SDA=GPIO 21 und SCL=GPIO 22 (festgelegt in `esp32_dev.h`). Der Wert `gpio=0` bedeutet im Backend: "kein dedizierter GPIO, Kommunikation ueber I2C-Bus".

Der ESP muss diese Konvention kennen und korrekt umsetzen: Ein Sensor mit `gpio=0` wird NICHT per ADC/Digital/OneWire gelesen, sondern ueber den I2C-Bus.

### SOLL-Zustand

Wenn die Firmware eine Sensor-Config mit `gpio=0` empfaengt, darf sie NIEMALS `analogRead(0)` oder `digitalRead(0)` aufrufen. Stattdessen muss sie den Sensor als I2C-Geraet behandeln und ueber den I2C-Bus lesen.

### Fix: Firmware — gpio=0 I2C-Guard

**Betroffene Stellen:**

1. **Sensor-Routing-Logik** in `src/services/sensor/sensor_manager.cpp` (Zeile ~200-420) — Die Funktion, die anhand von `gpio` und `sensor_type` entscheidet, wie ein Sensor gelesen wird. Hier muss geprueft werden:

```cpp
// Vor dem Lesen eines Sensors — pseudocode:
if (gpio == 0 && isI2CSensor(sensorType)) {
    // I2C-Pfad: Sensor ueber I2C-Bus lesen (SDA=21, SCL=22)
    return readI2CSensor(sensorType, i2cAddress);
}
// Kein analogRead(0) fuer I2C-Sensoren!
```

2. **Sensor-Initialisierung** — Wo Sensoren beim Empfang einer Config registriert werden. Falls die Firmware gpio=0 als "Analog-GPIO 0" interpretiert und so initialisiert, muss diese Stelle korrigiert werden.

**Konkrete Pruef-Reihenfolge:**
1. Wo wird beim Empfang einer Sensor-Config entschieden ob Analog/Digital/I2C/OneWire?
2. Gibt es eine Bedingung `if (gpio == 0)` oder `if (gpio < 1)` die falsch routet?
3. Wird `analogRead(gpio)` aufgerufen OHNE vorher `isI2CSensor()` zu pruefen?
4. I2C-Sensoren erkennen: Alle Sensoren mit `interface_type='I2C'` ODER durch Lookup in der Firmware-Sensor-Registry ob `sensor_type` ein bekannter I2C-Typ ist (sht31, bmp280, etc.)

**Bekannte I2C-Sensor-Types in der Firmware:** sht31, sht31_temp, sht31_humidity, bmp280 und andere. Diese duerfen bei gpio=0 niemals per ADC gelesen werden.

**Verifikation:** Nach dem Fix darf im Serial-Log kein "ADC2 not supported" oder aequivalenter Fehler mehr erscheinen wenn der SHT31 konfiguriert ist und WiFi aktiv ist.

---

## Root Cause C — ArduinoJson behandelt 0 als falsy beim OneWire-Pin-Parsing (MITTEL)

### IST-Zustand

Beim Parsen von OneWire-Scan-Commands aus JSON verwendet die Firmware einen ArduinoJson OR-Fallback in `src/main.cpp` Zeile 1023:

```cpp
// IST — problematisch:
uint8_t pin = doc["pin"] | HardwareConfig::DEFAULT_ONEWIRE_PIN;
```

Es gibt nur EINEN Fallback (`doc["pin"]` → `DEFAULT_ONEWIRE_PIN`). Es gibt kein verschachteltes `doc["params"]["pin"]` in der OneWire-Scan-Logik.

ArduinoJson v6 behandelt den Wert `0` als falsy — identisch zu einem fehlenden Feld. Das bedeutet: Wenn der Server `pin=0` sendet (was er bei I2C-Fallback-Konvention tun koennte), faellt die Firmware auf `DEFAULT_ONEWIRE_PIN` (GPIO 4 bei esp32_dev, GPIO 6 bei xiao_esp32c3) zurueck, statt GPIO 0 zu nutzen.

Dies ist **Fehler 6** aus dem Serial-Debug-Report: "Scan laeuft auf GPIO 4 statt auf dem gewuenschten Pin".

### SOLL-Zustand

Der Pin-Wert wird explizit auf Vorhandensein geprueft, nicht auf Wahrheitswert. Falls `pin=0` explizit gesendet wird, wird GPIO 0 genutzt. Falls das Feld fehlt, wird DEFAULT_ONEWIRE_PIN verwendet.

### Fix: Firmware — Explizites Pin-Parsing

**Datei:** `src/main.cpp` Zeile 1023.

```cpp
// SOLL — korrekt:
uint8_t pin = HardwareConfig::DEFAULT_ONEWIRE_PIN;  // Fallback
if (doc.containsKey("pin")) {
    pin = doc["pin"].as<uint8_t>();
}
// Ergebnis: pin=0 wird korrekt als Wert 0 behandelt, nicht als "fehlt"
```

**Hinweis:** Diese Aenderung betrifft ausschliesslich das OneWire-Scan-Command-Parsing in `main.cpp`. Andere JSON-Parsing-Stellen in der Firmware sind davon unberuehrt und sollen nicht veraendert werden. `containsKey()` ist in ArduinoJson v6.21 (im Projekt verwendet) verfuegbar.

**Verifikation:** OneWire-Scan-Command mit `pin=0` senden, pruefen ob der Scan auf GPIO 0 laeuft (nicht GPIO 4).

---

## Entscheidungsfrage vor Beginn

**Frage an Robin / auto-one:** Soll gpio=0 als I2C-Konvention BEIBEHALTEN werden (d.h. Firmware lernt damit umzugehen), oder soll der Server zukuenftig die echten I2C-Pins (SDA=21, SCL=22) in der Config mitsenden?

**Empfehlung:** gpio=0 als Konvention beibehalten. Gruende:
1. I2C-Sensoren haben keinen "eigenen" GPIO — SDA/SCL sind Bus-Pins, kein Sensor-PIN
2. Mehrere I2C-Sensoren teilen sich denselben Bus → kein eindeutiger Pin pro Sensor
3. Die I2C-Adresse (z.B. 0x44 fuer SHT31) ist die eindeutige Kennung, nicht der GPIO
4. Aenderung des DB-Schemas wuerde alle bestehenden sensor_configs betreffen

Falls Robin eine andere Entscheidung trifft: Fix B (Firmware-Guard) muss entsprechend angepasst werden. Aber Fix A (Config-Push VIRTUAL-Filter) und Fix C (OneWire Pin-Parsing) sind davon unabhaengig und koennen sofort umgesetzt werden.

---

## Reihenfolge der Fixes

| Schritt | Root Cause | Fix | Aufwand | Schicht |
|---------|------------|-----|---------|---------|
| 1 | A | Config-Push VIRTUAL-Filter (Backend) | ~30min | El Servador |
| 2 | B | gpio=0 I2C-Guard in Sensor-Routing (Firmware) | ~1-2h | El Trabajante |
| 3 | C | OneWire Pin-Parsing 0-is-falsy (Firmware) | ~30min | El Trabajante |
| 4 | — | Verifikation (Serial-Log + MQTT-Monitor) | ~30min | — |

Schritt 1 zuerst, weil er verhindert dass VPD-Configs ueberhaupt beim ESP ankommen. Dann Schritt 2, damit gpio=0 korrekt als I2C-Bus interpretiert wird.

---

## Abgrenzung — Was dieser Auftrag NICHT enthaelt

- VPD-Backend-Datenintegritaet (Scheduler VIRTUAL-Filter, Pi-Enhanced, Quality-Guard, DB-Cleanup) → separater Auftrag
- NVS-Delete-Bug und OneWire-Scan fuer DS18B20 → separater Auftrag `auftrag-FW01-nvs-delete-onewire-scan-fix-2026-03-26.md`
- Aenderungen am MQTT-Topic-Schema oder an der DB-Struktur (sensor_configs)
- Aenderungen an vpd_calculator.py oder der VPD-Berechnungslogik
- Neue Sensor-Typen oder neue Aktor-Typen

---

## Akzeptanzkriterien

### Fix A — Config-Push VIRTUAL-Filter (Backend)
- [ ] MQTT-Config-Push-Payload enthaelt keine Eintraege mit `interface_type='VIRTUAL'`
- [ ] VPD-SensorConfig (sensor_type='vpd') wird nicht an ESP gesendet
- [ ] Physische Sensoren (SHT31, Relay) werden weiterhin korrekt gepusht
- [ ] Filter gilt fuer Full-State-Push UND inkrementellen Push (alles via `build_combined_config()`)

### Fix B — gpio=0 I2C-Guard (Firmware)
- [ ] Serial-Log zeigt KEINE "ADC2 not supported" oder "cannot use ADC2" Fehler mehr
- [ ] SHT31 auf ESP_472204 sendet weiterhin korrekte sht31_temp + sht31_humidity Werte per MQTT
- [ ] Kein analogRead(0) im Hot-Path wenn WiFi aktiv ist
- [ ] I2C-Bus-Initialisierung (SDA=21, SCL=22) laeuft einmalig beim Boot — nicht pro Sensor-Read

### Fix C — OneWire Pin-Parsing (Firmware)
- [ ] OneWire-Scan-Command mit `pin=0` im JSON -> Scan laeuft auf GPIO 0 (nicht GPIO 4)
- [ ] OneWire-Scan-Command ohne `pin`-Feld -> Scan laeuft auf DEFAULT_ONEWIRE_PIN (GPIO 4)
- [ ] OneWire-Scan-Command mit `pin=13` -> Scan laeuft auf GPIO 13

### Keine Regression
- [ ] SHT31 sht31_temp und sht31_humidity kommen nach Reboot korrekt an (NVS bleibt intakt)
- [ ] Relay auf GPIO 27 funktioniert unveraendert
- [ ] Bestehende pytest-Tests im Backend laufen ohne neue Fehler

---

## Relevante Dateien

### Backend (El Servador)
| Datei | Relevanz |
|-------|----------|
| `god_kaiser_server/src/services/config_builder.py` | Config-Push-Payload-Builder — VIRTUAL-Filter einbauen in `build_combined_config()` (Zeile ~195) |
| `god_kaiser_server/src/sensors/sensor_type_registry.py` | `VIRTUAL_SENSOR_TYPES` Set (Zeile 89) — nutzen |
| `god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` | Auto-Config-Push bei Reboot (nutzt build_combined_config) — kein separater Fix noetig |

**Nicht betroffen:**
- `config_handler.py` — empfaengt Config-RESPONSES (ESP→Server), nicht Config-Push
- `esp_repo.py` → `rebuild_simulation_config` betrifft `device_metadata.simulation_config` JSON-Spalte, nicht den MQTT-Config-Push (separates Thema: Dual-Storage-Desync)

### Firmware (El Trabajante)
| Datei | Relevanz |
|-------|----------|
| `src/services/sensor/sensor_manager.cpp` | Sensor-Routing-Logik — gpio=0 I2C-Guard (Zeile ~200-420) |
| `src/main.cpp` | MQTT-Command-Handler: Config-Empfang + OneWire-Scan-Parsing (Zeile 1023) |
| `src/config/hardware/esp32_dev.h` | I2C-Pin-Definitionen (SDA=21, SCL=22), ADC2-Pins, DEFAULT_ONEWIRE_PIN=4 |
| `src/models/sensor_registry.cpp` | Sensor-Capability-Registry — "vpd" ist NICHT registriert (bestaetigt) |
