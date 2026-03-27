# Auftrag FW-01: NVS-Delete-Bug + OneWire-Scan-Fix (Rev. 2 — korrigiert nach Review)

> **Bereich:** El Trabajante (ESP32 Firmware, C++ / Arduino Framework)
> **Prio:** KRITISCH — verhindert funktionierendes Sensor/Aktor-Lifecycle
> **Datum:** 2026-03-26 (Rev. 2)
> **Agent:** Firmware-Agent (El Trabajante)
> **Einschaetzung:** 3-4 Stunden — Debug-First, dann chirurgische Fixes

---

## Kontext: Was das System macht

AutomationOne hat eine 3-Schichten-Architektur:
- **El Servador** (FastAPI-Server): Zentrale Datenbank (PostgreSQL). Autoritativ ueber welche Sensoren/Aktoren existieren.
- **El Trabajante** (ESP32-Firmware): Laedt Konfiguration beim Boot aus NVS (Non-Volatile Storage im Flash). NVS ist der persistente Speicher des ESP32 ueber Reboots hinweg.
- **Synchronisationsregel:** Was in der Backend-DB steht, muss im ESP-NVS widergespiegelt werden. Diskrepanz fuehrt zu Geist-Sensoren.

**Delete-Pipeline (Soll):**
1. User loescht Sensor/Aktor im Frontend
2. Backend loescht den Eintrag aus `sensor_configs` / `actuator_configs` (Hard-Delete, CASCADE)
3. Backend sendet MQTT-Command mit `config.active = false` an ESP
4. ESP empfaengt Command, entfernt aus RAM UND loescht aus NVS
5. Backend broadcastet per WebSocket an Frontend

**Betroffene Dateien:**
- `src/main.cpp` — MQTT-Command-Handler (Sensor-Config ab Zeile ~2741, OneWire-Scan ab Zeile ~1016)
- `src/services/sensor/sensor_manager.cpp` / `.h` — `removeSensor(gpio)`
- `src/services/actuator/actuator_manager.cpp` / `.h` — `removeActuator(gpio)`
- `src/services/config/config_manager.cpp` / `.h` — `removeSensorConfig(gpio)`, `saveActuatorConfig()`, NVS-Key-Definitionen
- `src/services/onewire/onewire_bus.cpp` / `.h` — OneWireBusManager (Single-Bus-Design)
- `src/services/gpio/gpio_manager.cpp` / `.h` — `requestPin()`, `releasePin()`

---

## Bug 1: Sensor/Aktor taucht nach Reboot wieder auf (KRITISCH)

### Symptome
- Sensor/Aktor wird geloescht (Backend OK, Frontend zeigt nichts mehr)
- Nach ESP-Reboot ist Sensor/Aktor wieder da
- Frontend kann den wiederaufgetauchten Sensor/Aktor nicht neu konfigurieren (GPIO intern belegt)
- Backend und ESP sind asynchron: DB sagt "geloescht", ESP sagt "aktiv"

### Wichtig: NVS-Delete-Code EXISTIERT bereits

Die Review des bestehenden Codes zeigt, dass NVS-Bereinigung beim Delete bereits implementiert ist:

**Sensor-Delete (main.cpp:2741-2749):**
Wenn `!config.active` empfangen wird, ruft der Code BEIDE Funktionen auf:
- `sensorManager.removeSensor(gpio)` — entfernt aus RAM. **Intern** ruft `removeSensor()` nochmal `configManager.removeSensorConfig(gpio)` auf (sensor_manager.cpp:609)
- `configManager.removeSensorConfig(gpio)` — loescht aus NVS (wird SEPARAT nochmal aufgerufen)
- **Ergebnis:** Doppelter NVS-Delete-Aufruf (main.cpp + intern in removeSensor). Redundant, aber nicht per se schaedlich.

**Actuator-Delete (actuator_manager.cpp:198-201, 311-323):**
Wenn `!config.active`, ruft `removeActuator(gpio)` auf. Diese Funktion sammelt die **verbleibenden** Aktoren und speichert die komplette Liste via `configManager.saveActuatorConfig(actuators, count)` — also Re-Save statt einzelnem Key-Delete. **Es gibt keine** `removeActuatorConfig()` Funktion.

### Root Cause: Unbekannt — Debug-First-Ansatz

Da der NVS-Delete-Code vorhanden ist, aber der Bug trotzdem auftritt, gibt es **4 moegliche echte Ursachen** die systematisch geprueft werden muessen:

#### Verdacht 1: NVS-Key-Schema-Mismatch zwischen Save und Remove

`config_manager.cpp:1430-1456` definiert NVS-Keys. **NVS hat ein 15-Zeichen-Key-Limit.** Legacy-Keys wie `sensor_0_subzone` (16 Zeichen) ueberschreiten dieses Limit und werden abgeschnitten oder schlagen fehl.

**Pruefschritte:**
1. Alle NVS-Key-Definitionen in `config_manager.cpp` auflisten (save UND remove)
2. Pruefen ob Save und Remove **identische Key-Strings** verwenden
3. Pruefen ob Keys laenger als 15 Zeichen sind (NVS-Limit)
4. Falls Mismatch: Keys angleichen und auf ≤15 Zeichen kuerzen

#### Verdacht 2: MQTT-Delete-Command erreicht den `!config.active` Branch nicht

Der Config-Push sendet JSON mit einem `active`-Feld. Wenn das Payload-Format zwischen Server und Firmware nicht uebereinstimmt (z.B. Feldname `active` vs. `enabled`, Boolean vs. Integer), kommt der Code nie in den Delete-Branch.

**Pruefschritte:**
1. Im Backend pruefen: Wie sieht das MQTT-Delete-Payload aus? Welches Topic, welche JSON-Felder?
2. In `main.cpp` pruefen: Wie wird `config.active` aus dem JSON gelesen?
3. ArduinoJson-Parsing checken: Wird `active` als bool gelesen? Was passiert bei fehlendem Feld? (ArduinoJson gibt `false` fuer fehlende bools — das waere ein False-Positive-Delete!)
4. **Serial-Debug:** Beim naechsten Delete-Versuch pruefen ob die Log-Meldung aus dem `!config.active`-Branch im Serial Monitor erscheint

#### Verdacht 3: Boot-Config laedt den Sensor sofort nach Delete wieder an

Ablauf: Delete-Command → NVS bereinigt → aber der Config-Push vom Server schickt unmittelbar danach einen Full-State-Push → ESP legt den Sensor sofort wieder an. Beim naechsten Reboot laedt er die neue NVS-Config.

**Pruefschritte:**
1. MQTT-Logs am Server pruefen: Wird nach einem Delete sofort ein Config-Push gesendet?
2. Config-Push Cooldown beachten: Cooldown ist 120s, aber Full-State-Push nutzt CommandBridge mit ACK-Wait und koennte den Cooldown umgehen
3. Falls Full-State-Push den geloeschten Sensor wieder mitschickt: Das ist ein Backend-Bug (Delete nicht in der Push-Liste reflektiert)

#### Verdacht 4: Doppelter NVS-Delete verursacht Seiteneffekt

In `main.cpp` wird `removeSensor(gpio)` aufgerufen (ruft intern `removeSensorConfig()` auf), und danach nochmal separat `removeSensorConfig(gpio)`. Wenn der erste Aufruf den NVS-Index verschiebt, koennte der zweite Aufruf ein **benachbartes** Config-Entry erwischen oder einen Fehler verursachen.

**Pruefschritte:**
1. `removeSensorConfig()` Code lesen: Wie funktioniert das NVS-Delete intern? Einzelner Key oder Index-basiert?
2. Falls Index-basiert: Den doppelten Aufruf eliminieren (nur EINEN Pfad: entweder main.cpp ruft configManager direkt auf, ODER removeSensor() macht es intern — nicht beides)
3. Serial-Debug: Beide Aufrufe loggen und pruefen ob der zweite einen Fehler wirft

### Debug-Vorgehensweise

**Schritt 1: Serial-Debug hinzufuegen**

An folgenden Stellen Debug-Logs einfuegen (Serial.printf mit Prefix `[DELETE-DEBUG]`):
- `main.cpp` beim Empfang des Config-Commands: Payload loggen, `config.active` Wert loggen
- Eintritt in den `!config.active` Branch: GPIO und Typ loggen
- `removeSensor()` Eintritt und Rueckgabe
- `removeSensorConfig()` Eintritt, NVS-Key der geloescht wird, Erfolg/Misserfolg
- `removeActuator()` Eintritt und Rueckgabe
- `saveActuatorConfig()` Anzahl verbleibender Aktoren und Erfolg/Misserfolg

**Schritt 2: Delete-Test**

1. Sensor/Aktor ueber Frontend loeschen
2. Serial-Logs auswerten: Wird der Delete-Branch erreicht? NVS-Delete erfolgreich?
3. ESP rebooten
4. Boot-Logs pruefen: Wird der Sensor/Aktor aus NVS geladen?

**Schritt 3: Fix basierend auf Ergebnis**

- Falls Verdacht 1 (Key-Mismatch): Keys korrigieren
- Falls Verdacht 2 (Payload): Parsing fixen
- Falls Verdacht 3 (Re-Push): Backend-Config-Push nach Delete anpassen
- Falls Verdacht 4 (Doppelt): Einen der beiden Delete-Aufrufe entfernen

### Akzeptanzkriterien Bug 1

- [ ] Serial-Debug zeigt: Delete-Command erreicht `!config.active` Branch
- [ ] Serial-Debug zeigt: NVS-Delete-Funktion wird aufgerufen und meldet Erfolg
- [ ] Nach Reboot: Geloeschter Sensor/Aktor taucht NICHT mehr auf
- [ ] Bestehende Konfigurationen (SHT31 gpio=0, Relay gpio=27) bleiben nach Reboot erhalten
- [ ] Kein doppelter NVS-Delete-Aufruf mehr (nur EIN Pfad)

---

## Bug 2: OneWire-Scan findet DS18B20 auf nicht-Standard-Pins nicht (MITTEL)

### Bestaetigt: OneWire funktioniert auf GPIO 4 (Default-Pin)

DS18B20 wird auf `DEFAULT_ONEWIRE_PIN` (GPIO 4) korrekt gefunden und gemeldet. Das bestaetigt:
- **Hardware OK:** Sensor, Verkabelung, Pull-up-Widerstand (4.7kOhm) funktionieren
- **OneWire-Library OK:** DallasTemperature findet Geraete, MQTT-Publish funktioniert
- **Problem ist spezifisch fuer GPIO 13/14** — nicht OneWire generell

### Symptome
- DS18B20 auf GPIO 13 wird beim Scan NICHT gefunden (gleiche Hardware, nur Pin gewechselt)
- Auf GPIO 14 ebenfalls nicht
- GPIO 14 war zuvor fuer einen Aktor konfiguriert (DB geloescht, NVS moeglicherweise nicht — siehe Bug 1)
- Auf GPIO 4 funktioniert derselbe Sensor einwandfrei

### Architektur-Constraint: Single-Bus-Design

Der `OneWireBusManager` ist ein Singleton mit **Single-Bus-Design**. Es kann nur EIN OneWire-Bus auf EINEM GPIO gleichzeitig aktiv sein. Das ist gewolltes Design.

- `DEFAULT_ONEWIRE_PIN` ist GPIO 4 (esp32_dev) bzw. GPIO 6 (XIAO ESP32-C3)
- Der Scan-Command akzeptiert einen `pin`-Parameter im JSON-Payload
- `oneWireBusManager.begin(pin)` ruft intern `gpioManager.requestPin()` auf
- **Wichtig:** Wenn der Bus bereits auf GPIO 4 laeuft, muss er beim Pin-Wechsel **zuerst freigegeben** werden (alten Pin releasen, neuen Pin requesten). Falls `begin()` das nicht macht, schlaegt `requestPin()` fuer den neuen Pin zwar durch — aber der alte Bus bleibt aktiv und der Scan laeuft auf dem falschen Pin.

### 3 Moegliche Ursachen (in Reihenfolge der Wahrscheinlichkeit)

#### Ursache A — Bus-Wechsel: Alter Bus wird nicht freigegeben

Da OneWire auf GPIO 4 funktioniert, ist der Bus dort beim Boot initialisiert. Wenn ein Scan auf GPIO 13 angefordert wird, muss `begin(13)` den alten Bus auf GPIO 4 **zuerst stoppen** und den GPIO freigeben. Falls `begin()` das nicht tut:
- `gpioManager.requestPin(13)` koennte klappen (GPIO 13 ist frei)
- Aber der OneWire-Bus laeuft intern noch auf GPIO 4
- Oder: `begin()` schlaegt fehl weil der alte Bus noch laeuft

**Pruefen:**
1. `oneWireBusManager.begin()` lesen: Wird bei Pin-Wechsel der alte Pin freigegeben (`releasePin`)? Wird das OneWire-Objekt auf den neuen Pin re-initialisiert?
2. Falls nein: `begin()` muss den alten Bus stoppen, alten Pin releasen, dann neuen Pin requesten und Bus neu starten
3. Serial-Debug: Beim Scan-Command loggen welcher Pin vorher aktiv war und ob der Wechsel klappt

#### Ursache B — GPIO 14 durch NVS-Aktor blockiert (Bug-1-Kopplung)

GPIO 14 war als Aktor konfiguriert (DB geloescht, NVS moeglicherweise nicht). Falls der Aktor beim Boot aus NVS geladen wird, reserviert `gpioManager` den Pin — und `oneWireBusManager.begin(14)` schlaegt fehl.

**Das betrifft nur GPIO 14, nicht GPIO 13.** Wenn GPIO 13 ebenfalls fehlschlaegt, ist Ursache A wahrscheinlicher.

**Pruefen:** Nach Bug-1-Fix: GPIO 14 Scan erneut testen.

#### Ursache C — ArduinoJson Pin-Parsing (Edge Case)

Der Scan-Command-Handler nutzt eine OR-Fallback-Chain:
```cpp
int pin = doc["pin"] | DEFAULT_ONEWIRE_PIN;
```

ArduinoJson behandelt `0` als falsy. Fuer GPIO 13/14 (Werte > 0) ist das kein Problem, aber fuer Code-Qualitaet:

**Fix:** `containsKey("pin")` verwenden:
```cpp
int pin = doc.containsKey("pin") ? doc["pin"].as<int>() : DEFAULT_ONEWIRE_PIN;
```

**Pruefschritt:** Serial-Debug im Scan-Handler: Empfangenen `pin`-Wert loggen. Ist es 13/14 oder doch 4 (Fallback)?

### Debug-Vorgehensweise

**Schritt 1: Serial-Debug im Scan-Command (main.cpp:1016-1094)**

```
[OW-SCAN] Received scan command, raw pin from payload: %d
[OW-SCAN] Current bus pin: %d, requested pin: %d
[OW-SCAN] begin(%d) result: %s
[OW-SCAN] gpioManager.requestPin(%d) result: %s
[OW-SCAN] DallasTemperature deviceCount: %d
[OW-SCAN] Publishing result to MQTT: %s
```

**Schritt 2: Pin-Wechsel testen**

1. Scan auf GPIO 4 (Default) → sollte funktionieren (bestaetigt)
2. Scan auf GPIO 13 → Serial-Logs pruefen: Wird der Pin korrekt empfangen? Klappt `begin(13)`?
3. Scan zurueck auf GPIO 4 → funktioniert es noch? (Testet ob Bus-Wechsel reversibel ist)

**Schritt 3: Bug 1 fixen, dann GPIO 14 testen**

Nach Bug-1-Fix: GPIO 14 sollte nicht mehr durch gpioManager blockiert sein.

### Akzeptanzkriterien Bug 2

- [ ] DS18B20 auf GPIO 13 wird beim Scan gefunden und Adresse per MQTT zurueckgemeldet
- [ ] Bus-Wechsel von GPIO 4 → GPIO 13 → GPIO 4 funktioniert zuverlaessig (begin() gibt alten Pin frei)
- [ ] GPIO 14 (nach Bug-1-Fix) steht fuer OneWire-Scan zur Verfuegung
- [ ] ArduinoJson `pin`-Parsing nutzt `containsKey()` statt OR-Fallback
- [ ] Serial-Debug zeigt den kompletten Scan-Ablauf (Pin-Empfang, Bus-Wechsel, Geraeteanzahl, MQTT-Publish)

---

## Zusammenhang der Bugs

OneWire auf GPIO 4 (Default) funktioniert — das Problem betrifft nur Pin-Wechsel auf nicht-Standard-GPIOs.

```
OneWire auf GPIO 4: ✅ FUNKTIONIERT (Hardware + Library bestaetigt)

Bug 2a (GPIO 13): ◄── Wahrscheinlich Bus-Wechsel-Problem
  oneWireBusManager.begin(13) gibt GPIO 4 nicht frei
  ODER: Bus laeuft intern weiter auf GPIO 4

Bug 1 (NVS-Delete) ──────────────────────┐
  Aktor auf GPIO 14 nicht aus NVS geloescht │
  Boot: gpioManager reserviert GPIO 14       │
                                              ▼
Bug 2b (GPIO 14): ◄── gpioManager.requestPin(14) schlaegt fehl
  Zusaetzlich zum Bus-Wechsel-Problem
```

**Fix-Reihenfolge:**
1. Bug 2a zuerst: Bus-Wechsel in `begin()` fixen (betrifft alle nicht-Standard-Pins)
2. Bug 1 loesen: NVS-Delete korrekt machen
3. Bug 2b verifizieren: GPIO 14 sollte nach Bug-1-Fix + Bus-Wechsel-Fix funktionieren

---

## Was NICHT geaendert wird

- Backend-Loeschlogik (ist korrekt: Hard-Delete, CASCADE)
- Frontend-Delete-Aufruf
- MQTT-Topic-Struktur
- OneWireBusManager Single-Bus-Design (bleibt Singleton)
- NVS-Boot-Loading (Ablauf bleibt gleich — der Inhalt muss korrekt sein)

---

## Gesamte Akzeptanzkriterien

**Bug 1 (NVS-Delete):**
- [ ] Sensor loeschen → nach Reboot NICHT mehr aktiv
- [ ] Aktor loeschen → nach Reboot NICHT mehr aktiv
- [ ] Root Cause identifiziert und dokumentiert (welcher der 4 Verdachte war es?)
- [ ] Kein doppelter NVS-Delete-Aufruf (Redundanz bereinigt)

**Bug 2 (OneWire Pin-Wechsel):**
- [ ] OneWire auf GPIO 4 funktioniert (Baseline — bereits bestaetigt)
- [ ] Bus-Wechsel GPIO 4 → GPIO 13 → GPIO 4 funktioniert zuverlaessig
- [ ] DS18B20 auf GPIO 13 wird beim Scan gefunden
- [ ] GPIO 14 nach Bug-1-Fix + Bus-Wechsel-Fix fuer OneWire nutzbar
- [ ] ArduinoJson Pin-Parsing mit `containsKey()` korrigiert

**Regression:**
- [ ] SHT31 (gpio=0), Relay (gpio=27) bleiben nach Reboot erhalten
- [ ] OneWire auf GPIO 4 funktioniert weiterhin nach allen Fixes
