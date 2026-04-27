# Auftrag AUT-188 — Firmware-Verifikation FW-01 / FW-02 / FW-03

**Auftragstyp:** Verifikations-Analyse (KEINE Implementierung)
**Empfaenger:** technical manager (Auto-one)
**Schicht:** Firmware (El Trabajante — C++, ESP32, PlatformIO)
**Linear-Referenz:** AUT-188
**Datum:** 2026-04-26
**Prioritaet:** Hoch (FW-01/FW-02), Mittel (FW-03)
**Berichts-Ablage:** Dieser Ordner — Datei `bericht-AUT-188-firmware-fw01-fw02-fw03-2026-04-26.md`
**Anhang-Unterordner (falls noetig):** `bericht-AUT-188-anhang/` in diesem Ordner

---

## Problem

Beim Aufbau des Architektur-Hubs (Cluster C2: NVS / Safety / Offline) wurden drei
Firmware-Luecken als Folge-Auftraege identifiziert. Die Funde stammen aus einer
Bestandsaufnahme (AUT-175 E0), die einzelne Code-Stellen mit Verhalten beschreibt.

Moeglicherweise sind Teile dieser Befunde laengst gefixt. Der TM prueft den aktuellen
Code-Stand jedes Punktes und liefert pro Punkt eindeutige Evidenz (Datei, Zeile, Snippet,
Commit-Hash).

---

## IST — Behauptungen, die zu pruefen sind

### FW-01 — SHT31 Dual-Adress-Problem

**Behauptung A (sensor_registry.cpp):**
`src/models/sensor_registry.cpp` Zeile 13 setzt die i2c_address des SHT31-Capability-Eintrags
hartkodiert auf `0x44`. Die Funktionen `configureSensor()` und `performMultiValueMeasurement()`
greifen auf `capability->i2c_address` zu anstatt auf `config.i2c_address`. Ein zweiter SHT31
auf Adresse `0x45` wird damit nie angesprochen, weil die Capability immer `0x44` zurueckgibt.

**Behauptung B (NVS-Schema):**
Der NVS-Key `sen_{i}_i2c` soll bereits existieren (verifiziert AUT-175 E0). Das Problem liegt
nicht im NVS-Key selbst, sondern darin, dass `configureSensor()` den persistierten Wert
ignoriert und stattdessen auf die Hardware-Capability zurueckgreift, die immer `0x44` liefert.

**Kern-Frage FW-01:** Existiert in `configureSensor()` und/oder `performMultiValueMeasurement()`
bereits ein Fallback-Mechanismus der `config.i2c_address` priorisiert, wenn != 0?

---

### FW-02 — I2C-Guard / GPIO-0 / OneWire-Pin-Auswahl

**Behauptung A (gpio=0 I2C-Guard):**
Im AutomationOne-Firmware-Kontext gilt `gpio=0` als I2C-Konvention — d. h. kein dedizierter
GPIO, sondern Routing ueber den I2C-Bus via I2CBusManager. Firmware darf `analogRead(0)` NICHT
aufrufen, wenn gpio=0 vorliegt (wuerde GPIO 0 als ADC missbrauchen). ADC2-Pins koennen bei
aktivem WiFi sowieso nicht verwendet werden.

**Behauptung B (ArduinoJson containsKey fix):**
Ein frueherer Bug-Fix (intern als "FW-02 Fix C" bezeichnet) sollte das ArduinoJson-Pattern
bei OneWire-Config-Parsing von einem OR-Fallback auf `containsKey("pin")` umstellen, um
zu verhindern, dass ein fehlender `pin`-Key im JSON silently den Default-Pin verwendet.

**Kern-Frage FW-02:**
- Ist die GPIO-0-Guard in allen Sensor-Handler-Pfaden umgesetzt (kein analogRead bei gpio=0)?
- Ist das `containsKey("pin")` Pattern in `onewire_bus.cpp` oder aequivalenter Datei vorhanden?

---

### FW-03 — removeActuatorConfig() — fehlender Loesch-Pfad im NVS

**Behauptung:**
Fuer Sensoren existiert bereits eine `removeSensor()` + `removeSensorConfig()`-Funktion.
Fuer Aktoren gibt es keinen analogen `removeActuatorConfig(gpio)`-Pfad. Stattdessen wird
ein Actuator-Delete als Re-Save mit leerem oder Default-Config durchgefuehrt (`saveActuatorConfig`).
Das hinterlaesst "leere" NVS-Eintraege unter `act_{i}_*`-Keys anstatt echter Bereinigung.

**Kern-Frage FW-03:**
- Existiert eine `removeActuatorConfig()`-Funktion oder ein aequivalenter Loesch-Pfad?
- Falls nur Re-Save: Werden alle `act_{i}_*`-Keys wirklich ueberschrieben / als leer markiert?
- Besteht bei vollem NVS-Namespace ein Risiko durch persistierte Leerschluesse?

---

## SOLL — Was der TM liefern soll

Der TM verteilt die Pruefung an den Firmware-Spezialisten. Pro Unterpunkt:

1. **Status-Pruefung im Code:** Existiert der Fix / das beschriebene Verhalten? Wo? Seit wann?
2. **Code-Evidenz (Pflicht, siehe unten):** Datei-Pfad, Zeilennummer, Snippet, Commit-Hash.
3. **Erklaerung:** 1-3 Saetze, warum der Snippet die Behauptung bestaetigt oder widerlegt.
4. **Falls nicht implementiert:** Genaue Lueckenbeschreibung + Implementierungsempfehlung.

**Code-Beweis-Anforderung — JEDER Unterpunkt MUSS enthalten:**
- **Datei-Pfad** (Auto-one-relativ, z. B. `src/models/sensor_registry.cpp`)
- **Zeilennummer(n)**
- **Code-Snippet** (relevante 3-15 Zeilen in Markdown-Codeblock)
- **Commit-Hash oder -Datum** (via `git log -1 --pretty="%H %ad" -- <datei>`)
- **Begruendung** in 1-3 Saetzen

---

## Eingebetteter Fachkontext

### Firmware-Architektur (fuer den Firmware-Spezialisten)

**Sensorik-Schicht:**
- `SensorManager` nutzt ein statisches Array `SensorConfig sensors_[MAX_SENSORS]` (10 Slots),
  definiert in `src/services/sensor/sensor_manager.h:139`.
- `findSensorConfig()` existiert in 3 Varianten: nach GPIO, GPIO+OneWire-Adresse, GPIO+I2C-Adresse.
- `sensor_registry.cpp` und `sensor_registry.h` liegen unter `src/models/` (NICHT unter
  `src/services/sensor/`).
- SHT31 nutzt KEINE Adafruit-Library — direktes I2C-Protokoll via `I2CBusManager` und
  `i2c_sensor_protocol.cpp` (Command `0x2400`, 6-Byte-Response).
- NVS-Schema Sensoren: `sen_{i}_gpio`, `sen_{i}_type`, `sen_{i}_name`, `sen_{i}_sz`,
  `sen_{i}_act`, `sen_{i}_raw`, `sen_{i}_mode`, `sen_{i}_int`, `sen_{i}_ow`.
  Key `sen_{i}_i2c` SOLL gemaess Bestandsaufnahme existieren — pruefe dies als erstes.

**Aktorik-Schicht:**
- Aktor-Typen: `src/models/actuator_types.h` (NICHT `src/services/actuator/`).
- Aktor-Manager: `src/services/actuator/actuator_manager.cpp`.
- NVS-Schema Aktoren: `act_{i}_*`-Keys — genaue Key-Liste im Code verifizieren.

**I2C-Bus:**
- `I2CBusManager` ist Singleton, verwaltet alle I2C-Geraete.
- `gpio=0` ist die AutomationOne-Konvention fuer "Sensor hat keinen dedizierten GPIO,
  nutzt I2C-Bus". Kein `analogRead(0)` darf bei gpio=0 erfolgen.
- ADC2-Pins sind bei aktivem WiFi gesperrt (ESP-IDF Hardware-Einschraenkung).

**OneWire:**
- `OneWireBusManager` Singleton, nur EIN GPIO gleichzeitig.
- `DEFAULT_ONEWIRE_PIN=4` auf esp32_dev.
- `begin(pin)` ruft `gpioManager.requestPin()` auf.

**Main-Einstieg MQTT:** `src/main.cpp` — 11 Subscriptions in Zeile 823-846.
**Config-Manager:** `src/services/config/config_manager.cpp`.
**MQTT-Client:** `src/services/communication/mqtt_client.cpp` (NICHT `src/communication/`).

### clean_session-Kontext (relevant fuer FW-03 Timing)
`disable_clean_session = 0` in `mqtt_client.cpp:172` → clean_session = true.
Nach einem Disconnect loescht der Broker ausstehende QoS-2-Nachrichten. Der naechste
Heartbeat-Push (ca. 120s Cooldown) korrigiert den Zustand. Das beeinflusst nicht FW-03
direkt, ist aber bei Tests relevant (Aktor-Config kann nach Reboot-Test verspaetest ankommen).

---

## Akzeptanzkriterien

Der Bericht ist nur akzeptiert, wenn JEDER der folgenden Punkte drei Felder hat:
`STATUS` (IMPLEMENTIERT | TEILWEISE | OFFEN) + `Code-Evidenz` (Datei:Zeile+Snippet) + `Begruendung`.

| Punkt | Pruef-Frage | Erwartetes Feld |
|-------|-------------|-----------------|
| FW-01-A | Nutzt `configureSensor()` `config.i2c_address` mit Fallback auf capability? | STATUS + Evidenz + Begruendung |
| FW-01-B | Ist `sen_{i}_i2c` Key in NVS-Load-Pfad verwendet? | STATUS + Evidenz + Begruendung |
| FW-02-A | GPIO-0-Guard vorhanden in allen Sensor-Handler-Pfaden (kein analogRead bei gpio=0)? | STATUS + Evidenz + Begruendung |
| FW-02-B | `containsKey("pin")` Pattern in OneWire-Config-Parsing vorhanden? | STATUS + Evidenz + Begruendung |
| FW-03 | Existiert `removeActuatorConfig()` oder aequivalenter Loesch-Pfad? | STATUS + Evidenz + Begruendung |

---

## Berichts-Struktur (verbindlich fuer den TM)

Datei: `bericht-AUT-188-firmware-fw01-fw02-fw03-2026-04-26.md` (in diesem Ordner)

```
# Bericht AUT-188 — Firmware-Verifikation FW-01/02/03

**Datum:** 2026-04-26
**Erstellt von:** [TM + Firmware-Spezialist]
**Commit-Stand:** [git log HEAD --format="%H %ad" -1]

## Executive Summary

- FW-01-A: [STATUS] — [Kernbefund in 1 Satz]
- FW-01-B: [STATUS] — [Kernbefund in 1 Satz]
- FW-02-A: [STATUS] — [Kernbefund in 1 Satz]
- FW-02-B: [STATUS] — [Kernbefund in 1 Satz]
- FW-03:   [STATUS] — [Kernbefund in 1 Satz]

## FW-01-A — configureSensor() I2C-Adress-Priorisierung

### Status
[IMPLEMENTIERT | TEILWEISE | OFFEN]

### Code-Evidenz
Datei: `src/...`
Zeile: X-Y
Commit: [hash] ([datum])

```cpp
[snippet]
```

### Erklaerung
[1-3 Saetze]

### Empfehlung
[falls OFFEN oder TEILWEISE: konkreter naechster Schritt]

## FW-01-B — NVS-Key sen_{i}_i2c
[gleiche Struktur]

## FW-02-A — GPIO-0-Guard analogRead
[gleiche Struktur]

## FW-02-B — containsKey("pin") OneWire
[gleiche Struktur]

## FW-03 — removeActuatorConfig() NVS-Loesch-Pfad
[gleiche Struktur]

## Anhang: Konsultierte Spezialisten-Agenten
- [Agent-Name]: [Teilaufgabe] — [Sub-Befund in 1 Satz]

## Folge-Empfehlungen
[Liste: Was muesste als naechstes als Implementierungs-Issue raus?
 Format: "FW-0X-[A/B]: [Empfehlung] — Prio [HIGH/MEDIUM/LOW]"]
```

---

## Hinweise fuer den TM

- **Kein Lesen von Life-Repo-Pfaden** — alle Evidenz aus dem Auto-one-Checkout.
- **Klaerungspunkte:** Falls ein Unterpunkt im Code nicht auffindbar ist (Datei geloescht,
  umbenannt, komplett anders strukturiert), explizit als "Quelle nicht auffindbar — Konkretisierung
  durch Robin noetig" markieren. Kein Raten.
- **Keine Implementierung** in diesem Auftrag — nur Analyse. Falls TM einen Fix fuer trivial
  haelt (z. B. FW-02-B Kommentar-Korrektur), Empfehlung in "Folge-Empfehlungen" aufnehmen,
  nicht selbst ausfuehren.
- **Git-Befehl fuer Commit-Stand:** `git log -1 --pretty="%H %ad" -- <datei>`
