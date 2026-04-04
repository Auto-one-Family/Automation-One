# Auftrag P1.3: ESP32 Sensorhandling End-to-End Tiefenanalyse

**Ziel-Repo:** auto-one (El Trabajante Firmware)  
**Bereich:** AutomationOne Architektur-Komplettanalyse (`architektur-autoone`)  
**Roadmap-Bezug:** `roadmap-komplettanalyse.md` -> Paket 1, Schritt P1.3  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-10h  
**Abhaengigkeit:** P1.1 und P1.2 abgeschlossen

---

## Ausgangsbasis (Pflicht-Input)

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-01-esp32-modul-inventar.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-01-esp32-abhaengigkeitskarte.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-01-esp32-contract-seedlist.md`
4. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-runtime-lifecycle-state-model.md`
5. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-trigger-matrix.md`
6. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-core-interaktionsbild.md`
7. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-degraded-recovery-szenarien.md`

## P1.2-Delta-Schwerpunkte (verbindlich in P1.3 beachten)

1. Queue-Overflow ist in Sensor-/Publish-Pfaden aktuell moeglich (non-blocking Sends, Drop-Risiko).
2. Config-Parse-Fehler haben nicht in jedem Pfad eine durchgaengige negative Server-Rueckmeldung.
3. Legacy-No-Task-Pfad besitzt andere Timing-/Isolationseigenschaften als der normale Dual-Core-Betrieb.
4. OFFLINE_ACTIVE + `server_override` muss fuer Sensorwert-Guete und Rule-Eval sauber nachvollzogen werden.

---

## Auftragsziel

Analysiere den kompletten Sensorpfad von der Registrierung bis zum Publish und Fehler-/Recovery-Verhalten.

Zu beantworten:
1. Wo und wie werden Sensoren registriert, initialisiert und getaktet?
2. Wie laufen Messung, Validierung, Normalisierung und Publish je Sensortyp?
3. Wann werden Werte verworfen, gecached, retried oder als fehlerhaft markiert?
4. Welche Fehlerpfade gibt es (Timeout, CRC, NaN, Bus-Fehler, Queue full)?
5. Wie sehen die Contracts vom Sensorwert bis zur Server-Ingestion aus?

**Regel:** Nur lesen, analysieren, dokumentieren. Keine Implementierung.

---

## Muss-Ergebnis (Deliverables)

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensorhandling-end-to-end.md`  
   -> Hauptdokument mit End-to-End-Datenfluss je Sensorklasse
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-fehler-recovery-matrix.md`  
   -> Fehlerbild -> Detection -> Fallback -> Recovery
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-contract-matrix.md`  
   -> Topic/Payload/Felder/Einheiten/QoS/Guards

Optional:
- `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-timing-und-lastprofil.md`

---

## Analyse-Rahmen (verpflichtend)

Pro analysiertem Sensorpfad dokumentieren:

1. **Sensorpfad-ID:** `FW-SENSOR-FLOW-XXX`
2. **Sensorklasse:** analog, digital, I2C, OneWire (ggf. Multi-Value)
3. **Registrierung/Init:** Wer erstellt, wer validiert, wer aktiviert?
4. **Messzyklus:** Trigger/Intervalle/Event- oder Polling-basiert
5. **Datenverarbeitung:** raw, lokal normalisiert, qualitaetsmarkiert
6. **Publish:** Topic, QoS, Pflicht-/Optionalfelder
7. **Cache/Persistenz:** RAM-Cache, Lebensdauer, Zugriff im Offline-Mode
8. **Fehlerpfade:** Detection, Retry, Backoff, fallback/safe behavior
9. **Folgen fuer Safety/Offline:** Einfluss auf Rule-Eval und Aktorik

---

## Arbeitsschritte

## Block A - Sensorinventar und Pfadklassifikation

1. Alle Sensor-Entry-Points identifizieren:
   - `sensor_manager.*`
   - `sensor_factory.*`
   - relevante Treiber (`i2c_*`, `onewire_*`, analoge Pfade)
   - `models/sensor_types*`, `sensor_registry*`
2. Sensoren in Klassen clustern:
   - analog (z. B. ADC-basiert)
   - digital
   - I2C
   - OneWire
   - Multi-Value-Sensoren
3. Pro Klasse den nominalen Datenpfad festhalten.

Output Block A:
- Klassifizierte Sensorlandkarte inkl. Owner-Module

---

## Block B - Mess-/Verarbeitungszyklus im Detail

1. Triggerquellen dokumentieren:
   - zyklisch in Safety-Loop
   - explizite Sensor-Commands aus Queue
   - Sondertrigger (Reinit, Config-Update)
2. Pro Sensorklasse erfassen:
   - Messstart
   - Rohdatenaufnahme
   - lokale Guard-/Plausibilitaetspruefung
   - Normalisierung/Umrechnung (falls vorhanden)
   - Value-Cache-Update
3. Timingaspekte dokumentieren:
   - Intervalle
   - Guard-Zeiten
   - potenzielle Lastspitzen

Output Block B:
- End-to-End-Ablauf pro Sensorklasse

---

## Block C - Publish- und Contract-Analyse

1. Publish-Stellen identifizieren (Core1 -> publish queue -> Core0 MQTT send).
2. Vertragsrelevante Punkte erfassen:
   - Topic-Schema (`TopicBuilder`)
   - QoS
   - Pflicht-/Optionalfelder
   - Einheiten/Feldnamen
   - raw_mode/quality/timestamp-Semantik
3. Zuordnen zur Server-Ingestion-Schnittstelle (Seed-Fortschreibung aus P1.1).

Output Block C:
- `paket-03-esp32-sensor-contract-matrix.md`

---

## Block D - Fehler-, Retry- und Recovery-Matrix

Pro Fehlerklasse dokumentieren:

1. **Detection:** Wo wird der Fehler erkannt?
2. **Lokalreaktion:** Retry, Drop, Fallback, Error-Flag
3. **Auswirkung auf Publish:** ausgesetzt, fehlerhaft, unvollstaendig, gedroppt
4. **Auswirkung auf Offline-Mode/Safety:** Rule-Eval moeglich oder blockiert?
5. **Recovery-Bedingung:** Wann gilt Fehler als behoben?

Mindest-Fehlerklassen:
- Timeout
- CRC/Bus-Fehler
- NaN/ungueltiger Wert
- Queue full (publish/sensor command)
- Config-Inkonsistenz

Output Block D:
- `paket-03-esp32-sensor-fehler-recovery-matrix.md`

---

## Block E - Hand-off in Folgepakete

1. Input fuer P1.4 (RAM/NVS):
   - Welche Sensorzustandsdaten nur RAM?
   - Welche Felder persistenzrelevant?
2. Input fuer P1.5 (Safety):
   - Welche Sensorfehler beeinflussen direkte Aktorsicherheit?
3. Input fuer P1.6 (Netzwerk):
   - Welche Sensorpublishes sind besonders verlustkritisch?

Output Block E:
- Priorisierte Fragenliste (10-15 Punkte) fuer P1.4/P1.5/P1.6

---

## Akzeptanzkriterien

- [ ] Alle aktiven Sensorpfade sind nach Klasse und Ablauf dokumentiert
- [ ] Mess-, Validierungs-, Cache- und Publish-Schritte sind pro Klasse nachvollziehbar
- [ ] Contract-Matrix umfasst Topic/QoS/Felder/Einheiten/Guards
- [ ] Fehler- und Recovery-Matrix deckt die Mindest-Fehlerklassen ab
- [ ] Auswirkungen auf Offline-Mode und Safety sind pro Fehlerklasse bewertet
- [ ] Hand-off fuer P1.4, P1.5 und P1.6 ist vorhanden
- [ ] Keine Code-Aenderung im Firmware-Repo vorgenommen

---

## Nicht Teil dieses Auftrags

- Keine vollstaendige RAM/NVS-Feldzuordnung (P1.4)
- Keine umfassende Safety-Wirksamkeitsbewertung aller Barrieren (P1.5)
- Keine komplette WiFi/MQTT-Backoff-/QoS-Haertung (P1.6)
- Keine API-/DB-Analyse des Servers (Paket 2/3)

---

## Erfolgskriterium fuer Robin

Nach P1.3 ist praezise beantwortbar:

- "Wie entsteht jeder Sensorwert technisch?"
- "Wo kann die Kette brechen und wie reagiert die Firmware?"
- "Welche Daten kommen mit welchen Contracts am Server an?"
- "Welche Sensorpfade sind fuer Safety und Offline-Regeln kritisch?"
