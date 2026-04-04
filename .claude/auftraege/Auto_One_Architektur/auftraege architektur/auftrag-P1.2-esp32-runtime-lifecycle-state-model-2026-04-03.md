# Auftrag P1.2: ESP32 Runtime-Lifecycle und State-Model Tiefenanalyse

**Ziel-Repo:** auto-one (El Trabajante Firmware)  
**Bereich:** AutomationOne Architektur-Komplettanalyse (`architektur-autoone`)  
**Roadmap-Bezug:** `roadmap-komplettanalyse.md` -> Paket 1, Schritt P1.2  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~5-9h  
**Abhaengigkeit:** P1.1 muss abgeschlossen sein

---

## Ausgangsbasis (Pflicht-Input)

Folgende Artefakte sind verbindliche Grundlage:

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-01-esp32-modul-inventar.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-01-esp32-abhaengigkeitskarte.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-01-esp32-contract-seedlist.md`

---

## Auftragsziel

Erzeuge ein **vollstaendiges, nachvollziehbares Runtime-Lifecycle-Modell** der ESP32-Firmware:

1. Alle relevanten Zustaende von Boot bis Normalbetrieb und Fehlerbetrieb
2. Alle Trigger, die Zustandswechsel ausloesen
3. Die Interaktion zwischen Core 0 (Communication) und Core 1 (Safety)
4. Die Verzahnung von Netzwerkstatus, ACK-Status, Offline-Mode und Safety-Reaktionen
5. Eine Trigger-Matrix als Grundlage fuer P1.3, P1.5 und P1.6

**Regel:** Nur lesen, analysieren, dokumentieren. Keine Implementierung.

---

## Muss-Ergebnis (Deliverables)

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-runtime-lifecycle-state-model.md`  
   -> Hauptdokument mit State-Definitionen und Uebergangslogik
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-trigger-matrix.md`  
   -> Trigger -> Guard -> Action -> Next-State
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-core-interaktionsbild.md`  
   -> Core0/Core1 Interaktions- und Queue-Disziplin

Optional:
- `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-degraded-recovery-szenarien.md`

---

## Analyse-Rahmen (verpflichtend)

Jeder State muss mindestens enthalten:

1. **State-ID:** `FW-STATE-XXX`
2. **Name:** z. B. `BOOT_SAFE_GPIO`, `MQTT_CONNECTING`, `OFFLINE_ACTIVE`
3. **Owner-Kontext:** Core0, Core1 oder Shared
4. **Eintrittsbedingung (Entry)**
5. **Austrittsbedingung (Exit)**
6. **Zulaessige Trigger**
7. **Safety-Relevanz**
8. **Verweise auf beteiligte Module**

Jeder Trigger muss mindestens enthalten:

1. **Trigger-ID:** `FW-TRIG-XXX`
2. **Quelle:** MQTT, WiFi, Queue, Timer, Watchdog, Local Rule
3. **Guard-Condition**
4. **Action**
5. **Next State**
6. **Failure-Path**

---

## Arbeitsschritte

## Block A - State-Inventar aus Code ableiten

1. State-Quellen in den Kernmodulen identifizieren:
   - `main.cpp`
   - `tasks/communication_task.*`
   - `tasks/safety_task.*`
   - `services/communication/mqtt_client.*`
   - `services/communication/wifi_manager.*`
   - `services/safety/offline_mode_manager.*`
   - `tasks/config_update_queue.*`
2. Alle expliziten und impliziten States erfassen:
   - Boot-/Init-States
   - Connectivity-States
   - Config-Apply-States
   - Offline-/Safety-States
   - Recovery-/Degraded-States

Output Block A:
- Vollstaendige State-Liste mit State-IDs

---

## Block B - Trigger und Uebergaenge modellieren

1. Triggerquellen klassifizieren:
   - Event-getrieben (MQTT callback, WiFi callbacks)
   - Timer-getrieben (Heartbeat, Timeout, Retry)
   - Queue-getrieben (Command/Config/Pub)
   - Safety-getrieben (Emergency, ACK timeout)
2. Pro Trigger Uebergang dokumentieren:
   - Current State -> Trigger -> Guard -> Action -> Next State

Output Block B:
- Vollstaendige Trigger-Matrix

---

## Block C - Core0/Core1 Interaktionsmodell

1. Core-Grenzen dokumentieren:
   - Welche Aktionen duerfen nur auf Core0?
   - Welche nur auf Core1?
2. Queue-Disziplin pruefen:
   - command/config/publish queues
   - Umgehungspfade und potentielle Race-Risiken
3. Kritische Interlocks markieren:
   - ACK vs Disconnect
   - Config apply vs laufende Sensor/Aktor-Loops

Output Block C:
- Core-Interaktionsbild inkl. kritischer Uebergabepunkte

---

## Block D - Degraded/Recovery-Pfade

1. Analyse der Fehlerzustaende:
   - WiFi down
   - MQTT down
   - ACK timeout
   - Queue overflow
   - NVS read/write failure
2. Recovery-Pfade dokumentieren:
   - Reconnect
   - Re-Sync
   - Safe-State hold/release

Output Block D:
- Degraded/Recovery-Abschnitt im Hauptdokument

---

## Block E - Hand-off fuer Folgepakete

Aus P1.2 muessen explizite Inputs fuer folgende Pakete entstehen:

- **P1.3 Sensorhandling:** relevante States/Trigger fuer Messung, Validierung, Publish
- **P1.5 Safety:** relevante States/Trigger fuer Emergency/Fallback/Recovery
- **P1.6 Netzwerk:** relevante States/Trigger fuer WiFi/MQTT/Reconnect/ACK

Output Block E:
- Hand-off-Abschnitt mit 10-15 priorisierten Analysefragen

---

## Akzeptanzkriterien

- [ ] Alle relevanten Runtime-States sind mit ID, Entry/Exit und Owner dokumentiert
- [ ] Trigger-Matrix deckt Normal-, Fehler- und Recovery-Pfade ab
- [ ] Core0/Core1 Interaktionsregeln inkl. Queue-Disziplin sind klar dokumentiert
- [ ] Kritische Interlocks (ACK/Disconnect/Offline/Safety) sind explizit modelliert
- [ ] Hand-off fuer P1.3, P1.5 und P1.6 ist vorhanden
- [ ] Keine Code-Aenderung im Firmware-Repo vorgenommen

---

## Nicht Teil dieses Auftrags

- Keine feldgenaue Sensor-Datenpfadanalyse (P1.3)
- Keine RAM/NVS-Feldzuordnung (P1.4)
- Keine Safety-Wirksamkeitsbewertung pro Fehlerklasse (P1.5)
- Keine vollstaendige Topic-/QoS-/Backoff-Tiefenanalyse (P1.6)

---

## Erfolgskriterium fuer Robin

Nach P1.2 ist klar und belastbar beantwortbar:

- "In welchem Zustand ist die Firmware gerade?"
- "Welches Event fuehrt warum in welchen naechsten Zustand?"
- "Wie greifen Core0, Core1, Queues und Safety logisch ineinander?"
- "Wo liegen die kritischsten Uebergangs- und Race-Risiken?"
