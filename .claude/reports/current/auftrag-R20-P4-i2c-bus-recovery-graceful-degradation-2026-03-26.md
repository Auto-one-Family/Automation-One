# Auftrag R20-P4 — I2C-Bus Recovery und Graceful Degradation

**Typ:** Bugfix / Robustheit — Firmware (El Trabajante)
**Schwere:** HIGH
**Erstellt:** 2026-03-26 | **Aktualisiert:** 2026-03-27
**Ziel-Agent:** esp32-dev (Skill: esp32-development)
**Aufwand:** ~1h (Schritt 1 und 2 bereits implementiert, Kern-Fix ist Schritt 3)
**Abhaengigkeit:** Unabhaengig — kann parallel zu P1+P2 gestartet werden

---

## Hintergrund

AutomationOne ESP32-Firmware liest I2C-Sensoren (SHT31 Temperatur+Luftfeuchte, BMP280
Luftdruck) ueber den I2C-Bus. I2C ist ein geteiltes Bus-Protokoll: Mehrere Geraete teilen
sich SDA und SCL. Wenn ein Geraet am Bus haengt aber nicht korrekt angesprochen wird oder
eine laufende Transaktion unterbrochen wird, kann es den Bus blockieren. Konkret: Das
SDA-Signal bleibt auf LOW haengen (SDA-stuck-LOW). Der Bus ist dann fuer alle Geraete
gesperrt bis eine Recovery durchgefuehrt wird.

Die I2C-Adressen des SHT31 sind hardwareseitig konfigurierbar: ADDR-Pin offen oder GND
ergibt 0x44, ADDR-Pin an 3.3V ergibt 0x45. Der Bus kann maximal zwei SHT31 gleichzeitig
haben. Die GPIO-Pins fuer SDA und SCL sind board-abhaengig: XIAO-Board nutzt SDA=GPIO 4
und SCL=GPIO 5, WROOM-Board nutzt SDA=GPIO 21 und SCL=GPIO 22. In der Firmware werden
diese ueber HardwareConfig::I2C_SDA_PIN und HardwareConfig::I2C_SCL_PIN referenziert —
niemals als hardcodierte Werte.

**Dokumentierte Fehler-Kaskade (Loki-Logs, 3 Zyklen am 2026-03-26, ESP_EA5484):**

```
16:41 → Error 1016 (I2C_BUS_RECOVERY_STARTED)
      → Error 1018 (I2C_BUS_RECOVERED)
      → Error 1013 (I2C_WRITE_FAILED)
      → Error 1014 (I2C_BUS_ERROR — SDA stuck LOW)
      → Error 4070 (ERROR_WATCHDOG_TIMEOUT in error_codes.h:160)
16:52 → gleiche Kaskade
16:58 → gleiche Kaskade → LWT disconnect → Reboot → wieder online
17:00 → Stabiler Betrieb
```

**Physische Ursache:** Ein zweiter SHT31 an I2C-Adresse 0x45 haengt physisch am Bus,
ist aber nicht in der Firmware konfiguriert. Wenn die Firmware an 0x44 schreibt, kann
der unkonfigurierte 0x45 den Bus durch NACK-Ketten stoeren. Das ist ein bekanntes
I2C-Verhalten: Jedes Geraet am Bus kann eine laufende Transaktion beeinflussen.

**Das strukturelle Problem:** Die Recovery-Logik (Code 1016 → 1018) laeuft zwar ab,
reicht aber alleine nicht aus. Nach der Recovery schlaegt der naechste Write sofort
wieder fehl weil der stoerende Sensor noch am Bus haengt. Waehrend dieser Fehler-Kaskade
wird der Watchdog-Timer nicht gefuettert — nach drei Zyklen laeuft er ab (Error 4070)
und loest einen ESP-Reboot aus. Alle Sensoren verlieren ihre Datenkontinuitaet, obwohl
DS18B20, Analog- und Digitalsensoren mit dem I2C-Fehler nichts zu tun haben.

**Langfristiger Fix:** R20-P1+P2 loesen das grundlegende Problem (beide SHT31 korrekt
konfigurieren). Dieser Auftrag (P4) stellt sicher dass physische Bus-Probleme nie mehr
zum ESP-Reboot fuehren — auch bei defektem Sensor oder unkonfiguriertem Geraet am Bus.

---

## IST-Zustand

### Was bereits implementiert ist

**I2C Bus Recovery (i2c_bus.cpp):**
- `I2CBusManager::recoverBus()` in `i2c_bus.cpp:398-476` ist vollstaendig implementiert.
  Ablauf: Wire.end() → 9 manuelle Clock-Pulse auf SCL → SDA-Zustand pruefen nach jedem
  Puls → STOP-Condition generieren → Wire.begin() → Bus-Verifikation.
- `I2CBusManager::attemptRecoveryIfNeeded()` in `i2c_bus.cpp:478-510` begrenzt Recovery-
  Versuche auf I2C_MAX_RECOVERY_ATTEMPTS=3 mit I2C_RECOVERY_COOLDOWN_MS=60000 (60s).
- Die Klasse heisst `I2CBusManager` (nicht I2CManager).
- `Wire.setTimeOut(100ms)` ist bereits gesetzt — verhindert unendliches Blockieren.
- AutomationOne nutzt Command 0x2400 (kein Clock Stretching) + 20ms Wartezeit. Das
  entspricht der Sensirion-Empfehlung fuer High-Repeatability Single-Shot Mode.

**Sensor-Level Circuit Breaker (sensor_manager.cpp):**
- Circuit Breaker ist bereits implementiert mit:
  - CB_MAX_CONSECUTIVE_FAILURES = 10
  - CB_PROBE_INTERVAL_MS = 300000 (5 Minuten)
  - States: CLOSED → OPEN → HALF_OPEN → CLOSED
  - consecutive_failures Tracking pro Sensor

### Was fehlt (der eigentliche Bug)

In `sensor_manager.cpp:1296-1298` ruft die Sensor-Mess-Schleife (`performAllMeasurements()`)
nur `yield()` auf — aber nicht `feedWatchdog()`. Der Watchdog-Timer wird somit waehrend
der gesamten Fehler-Kaskade (Fehler → Recovery → erneuter Fehler) nicht zurueckgesetzt.
Nach drei Zyklen laeuft der WDT ab und loest den Reboot aus.

Die korrekte Signatur ist: `feedWatchdog(const char* component_id) → bool`
(deklariert in `watchdog_types.h:79`).

---

## SOLL-Zustand

### Schritt 1 — I2C Recovery VERIFIZIEREN (bereits implementiert, kein Aenderungsbedarf)

Pruefe ob `I2CBusManager::recoverBus()` und `attemptRecoveryIfNeeded()` korrekt
aufgerufen werden wenn ein I2C-Fehler auftritt. Stichpunkte:

- Wird `attemptRecoveryIfNeeded()` nach `I2C_WRITE_FAILED` (Error 1013) aufgerufen?
- Werden I2C_MAX_RECOVERY_ATTEMPTS=3 und I2C_RECOVERY_COOLDOWN_MS=60000 eingehalten?
- Wird nach erschoepfter Recovery der betroffene Sensor als error markiert und pausiert?

Optional: Pruefe ob ein SHT31 Soft Reset (I2C-Kommando 0x30A2, dann 1.5ms warten, dann
neu initialisieren) vor der vollen Clock-Pulse-Recovery hilfreich waere. Der Soft Reset
setzt den Sensor-internen Zustand zurueck ohne den Bus zu belasten.

Kein Code schreiben wenn alles korrekt laeuft — Schritt 1 ist reine Verifikation.

### Schritt 2 — Circuit Breaker PARAMETER ENTSCHEIDEN (bereits implementiert)

Die bestehenden Werte sind konservativ:
- 10 Failures bevor der Breaker oeffnet (IST)
- 5 Minuten Probe-Interval (IST)

Fuer schnellere Reaktion auf Bus-Probleme waeren aggressivere Werte denkbar:
- 3 Failures → Breaker oeffnet
- 60s Probe-Interval

Entscheidung: Sollen die Schwellwerte geaendert werden? Wenn ja, die Konstanten
CB_MAX_CONSECUTIVE_FAILURES und CB_PROBE_INTERVAL_MS in sensor_manager.cpp anpassen.
Wenn nein, Schritt 2 ueberspringen.

Begruendung fuer Beibehaltung der konservativen Werte: I2C-Fehler koennen durch
kurzzeitige Bus-Stoerungen entstehen (EMV, langer Kabel), nicht nur durch defekte
Sensoren. 10 Failures gibt mehr Toleranz fuer transiente Fehler.

### Schritt 3 — feedWatchdog in Sensor-Loop (KERN-FIX — MUSS implementiert werden)

**Datei:** `src/services/sensor/sensor_manager.cpp`
**Stelle:** `performAllMeasurements()` Zeilen 1296-1298

**IST:**
```cpp
// Derzeit: nur yield(), kein Watchdog-Fuettern
yield();
```

**SOLL:**
```cpp
// Nach jeder Sensor-Messung (Erfolg oder Fehler):
feedWatchdog("SENSOR_LOOP");
yield();
```

Der `feedWatchdog()`-Aufruf muss an allen Stellen in `performAllMeasurements()` eingebaut
werden wo der Code laengere Zeit in Schleifen oder Fehler-Pfaden verbringen kann:

1. Nach jedem einzelnen Sensor-Messzyklus (Haupt-Schleife ueber alle Sensoren)
2. Nach fehlgeschlagenen I2C-Reads und Recovery-Versuchen
3. Nach Warte-Delays die laenger als ~100ms dauern (z.B. nach Wire.requestFrom)

Begruendung: Der Watchdog ueberwacht ob der ESP32 "lebt" und normal verarbeitet.
Bei einer Fehler-Kaskade kann die Sensor-Loop mehrere Sekunden in Retry-/Recovery-Pfaden
haengen ohne dass der Watchdog gefuettert wird. Das ist kein Haaenger sondern legitime
Arbeit — der Watchdog muss das wissen. `feedWatchdog("SENSOR_LOOP")` signalisiert:
"Ich lebe, ich arbeite, nur ein Sensor macht Probleme".

### Schritt 4 — Error-Codes dokumentieren (Referenz, kein Code-Aenderungsbedarf)

Die folgenden Error-Codes sind in den Logs dokumentiert und in error_codes.h definiert.
Als Kommentar an den relevanten Stellen in i2c_bus.cpp und sensor_manager.cpp einfuegen:

| Code | Name | Bedeutung |
|------|------|-----------|
| 1013 | I2C_WRITE_FAILED | Wire.endTransmission() schlug fehl |
| 1014 | I2C_BUS_ERROR | SDA stuck LOW — Bus blockiert |
| 1016 | I2C_BUS_RECOVERY_STARTED | recoverBus() wurde aufgerufen |
| 1018 | I2C_BUS_RECOVERED | Recovery erfolgreich — Bus wieder frei |
| 4070 | ERROR_WATCHDOG_TIMEOUT | WDT-Ablauf (error_codes.h:160) — NICHT aendern |

---

## Was NICHT geaendert werden darf

- MQTT-Kommunikation und Topic-Struktur
- OneWire-Sensor-Logik (laeuft auf anderem GPIO, kein Zusammenhang)
- Boot-Sequenz und GPIO Safe-Mode
- SafetyController und Emergency-Stop
- Die I2C-Pin-Belegung — ausschliesslich HardwareConfig::I2C_SDA_PIN und
  HardwareConfig::I2C_SCL_PIN verwenden, niemals hardcodierte GPIO-Nummern
- Error-Code 4070 (ERROR_WATCHDOG_TIMEOUT) — ist bestehende Definition, nur referenzieren
- Das MQTT-Topic-Schema `kaiser/{id}/esp/{id}/sensor/{gpio}/data`
- NVS-Persistenz-Logik

---

## Akzeptanzkriterien

- [ ] `feedWatchdog("SENSOR_LOOP")` wird in `performAllMeasurements()` nach jeder
      Sensor-Messung aufgerufen (Erfolg und Fehler-Pfad)
- [ ] Ein fehlerhafter I2C-Sensor fuehrt NICHT mehr zum ESP-Reboot (kein WDT-Timeout
      durch I2C-Fehler-Kaskade)
- [ ] Gesunde Sensoren (DS18B20 OneWire, Analog, Digital) liefern weiter Daten waehrend
      ein I2C-Sensor im Error-State ist
- [ ] SDA-stuck-LOW wird per Clock-Pulse-Recovery behoben (max 3 Versuche gemaess
      I2C_MAX_RECOVERY_ATTEMPTS, dann Sensor als error markiert)
- [ ] Nach Behebung des physischen Problems erholt sich der Sensor automatisch
      (Circuit Breaker HALF_OPEN → CLOSED nach Probe-Interval)
- [ ] Error-Rate wird per ErrorTracker gemeldet (bestehendes Reporting nutzen)
- [ ] Firmware kompiliert ohne Errors (kein neuer Compiler-Warning)
- [ ] Wokwi-Tests gruен:
      - `08-i2c/i2c_bus_recovery.yaml`
      - `11-error-injection/error_i2c_bus_stuck.yaml`

---

## Kontext fuer den Agenten

**Warum 3 Recovery-Zyklen in den Logs:** `recoverBus()` lief ab, erzeugte Error 1018
(Recovery scheinbar erfolgreich), aber der naechste `Wire.endTransmission()` schlug
sofort wieder fehl weil der unkonfigurierte SHT31@0x45 weiterhin am Bus hing und
NACK-Ketten produzierte. Nach dem dritten Zyklus war der WDT-Zaehler abgelaufen.

**Warum feedWatchdog statt nur yield():** `yield()` gibt dem ESP32-RTOS kurz die
Kontrolle ab (kooperatives Scheduling), setzt aber den Hardware-Watchdog nicht zurueck.
`feedWatchdog()` tut beides: es signalisiert dem WDT "System laeuft" UND gibt optional
dem RTOS Rechenzeit. In einer Fehler-Schleife die mehrere Sekunden dauert ist yield()
allein nicht ausreichend.

**I2C Bus-Mechanismus:** SDA-stuck-LOW entsteht wenn ein I2C-Slave mitten in einer
Transaktion unterbrochen wird und seinen SDA-LOW-Pegel haelt. Der Standard-Fix sind
9 manuelle SCL-Pulse: Jeder Puls gibt dem Slave die Chance seinen internen Byte-Zaehler
weiterzuzaehlen und SDA loszulassen. Danach eine STOP-Condition und Wire.begin() neu
aufrufen. Das ist genau was `recoverBus()` bereits tut.

**Soft Reset als zusaetzliche Massnahme:** SHT31 Command 0x30A2 setzt den Sensor-internen
Zustand zurueck (1.5ms warten danach). Das kann hilfreich sein wenn der Sensor in einem
undefinierten Zustand steckt aber nicht SDA blockiert. Ist optional — nur wenn Schritt 1
zeigt dass recoverBus() allein nicht genuegt.

**Circuit Breaker Logik:** CLOSED = normaler Betrieb, misst jeden Zyklus. Nach
CB_MAX_CONSECUTIVE_FAILURES aufeinanderfolgenden Fehlern wechselt er zu OPEN = Sensor
pausiert. Nach CB_PROBE_INTERVAL_MS (300s) wechselt er zu HALF_OPEN = ein Probe-Versuch.
Bei Erfolg: zurueck zu CLOSED. Bei Fehler: wieder OPEN. Das ist das Standard-Pattern
fuer Sensor-Degradation in IoT-Systemen.

---

> Erstellt von: automation-experte Agent
> Roadmap-Referenz: R20-P4 in `auftraege/roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
> Zusammenhang: Physisch ausgeloest durch R20-02 (zweiter SHT31 am Bus)
> Letzte Aktualisierung: 2026-03-27 (verify-plan Annotationen eingearbeitet, Dokument bereinigt)
