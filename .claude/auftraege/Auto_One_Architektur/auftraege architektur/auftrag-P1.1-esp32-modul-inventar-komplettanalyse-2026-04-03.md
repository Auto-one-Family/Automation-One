# Auftrag P1.1: ESP32 Modul-Inventar fuer die Komplettanalyse

**Ziel-Repo:** auto-one (El Trabajante Firmware)  
**Bereich:** AutomationOne Architektur-Komplettanalyse (`architektur-autoone`)  
**Roadmap-Bezug:** `roadmap-komplettanalyse.md` -> Paket 1, Schritt P1.1  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL (Startpunkt fuer alle weiteren ESP32-Pakete)  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~4-8h (abh. von Tiefe und Modulanzahl)  
**Abhaengigkeiten:** Keine - kann sofort starten

---

## Auftragsziel

Erstelle ein **vollstaendiges und belastbares Modul-Inventar** der ESP32-Firmware als Grundlage fuer die folgenden Schritte:
- P1.2 Runtime-Lifecycle
- P1.3 Sensorhandling End-to-End
- P1.4 RAM/NVS-Speicheranalyse
- P1.5 Safety-Operationen
- P1.6 Netzwerk-/MQTT-Handling
- P1.7 Integrationsbild

Dieser Auftrag liefert die erste "Komponentenkarte" der Firmware inklusive:
1. Alle relevanten Module
2. Rollen und Verantwortungsgrenzen
3. Erste Abhaengigkeiten zwischen Modulen
4. Kritikalitaet im Gesamtsystem
5. Erste Contract-Liste fuer die wichtigsten Firmware-Schnittstellen

**Regel:** Nur lesen, analysieren, dokumentieren. Keine Implementierung.

---

## Muss-Ergebnis (Deliverables)

Nach Abschluss muessen folgende Artefakte vorliegen:

1. `architektur-autoone/paket-01-esp32-modul-inventar.md`  
   -> Hauptdokument mit kompletter Modulliste und Klassifizierung
2. `architektur-autoone/paket-01-esp32-abhaengigkeitskarte.md`  
   -> Modul-zu-Modul Abhaengigkeiten (wer nutzt wen)
3. `architektur-autoone/paket-01-esp32-contract-seedlist.md`  
   -> Erste Contract-Liste (Sensor-MQTT, Command-ACK, Config-Push, Heartbeat)

Wenn gewuenscht als Zusatz:
- `architektur-autoone/paket-01-esp32-offene-risiken.md` (Top-10 Risiken aus Inventarsicht)

---

## Analyse-Rahmen (aus Roadmap verpflichtend)

Pro Modul muessen mindestens diese Felder dokumentiert werden:

1. **Modul-ID:** z. B. `FW-MOD-001`
2. **Name/Pfad:** Datei oder Modulbereich im Firmware-Repo
3. **Verantwortung:** Wofuer zustaendig (und nicht zustaendig)
4. **Input/Output:** Welche Daten gehen rein/raus
5. **Persistenzbezug:** RAM / NVS / kein Persistenzbezug
6. **Safety-Bezug:** Welche Safety-/Fallback-Rolle hat das Modul
7. **Kritikalitaet:** kritisch / hoch / mittel / niedrig
8. **Folgepaket-Relevanz:** P1.2, P1.3, P1.4, P1.5, P1.6, P1.7

---

## Arbeitsschritte

## Block A - Scope und Architekturgrenzen festziehen

1. Firmware-Hauptstruktur erfassen (Core, Sensor, Aktor, Config, Netzwerk, Safety, Runtime, Utilities).
2. Klare Abgrenzung dokumentieren:
   - Was gehoert zur Firmware (ESP32)?
   - Was liegt im Server und darf hier nur als Interface betrachtet werden?
3. Analyse-ID-Schema festlegen:
   - Module: `FW-MOD-XXX`
   - Datenfluesse: `FW-FLOW-XXX`
   - Contracts: `FW-CON-XXX`

Output Block A:
- Abschnitt "Systemgrenze ESP32" im Hauptdokument
- Einheitliches ID-Schema fuer alle Folgepakete

---

## Block B - Vollstaendige Modulliste erstellen

1. Alle firmware-relevanten Module erfassen (auch Querschnittsmodule wie Logging, Error-Handling, Storage-Helfer, Scheduler/Tasking).
2. Module in diese Cluster einsortieren:
   - Runtime/Boot
   - Sensorik
   - Aktorik
   - Netzwerk/MQTT/WiFi
   - Config/Provisioning
   - Persistenz (NVS)
   - Safety/Watchdog/Failsafe
   - Diagnostics/Observability
   - Utilities/Basisinfrastruktur
3. Pro Modul die Mindestfelder aus "Analyse-Rahmen" ausfuellen.

Output Block B:
- Vollstaendige Modulliste als Tabelle
- Cluster-Ansicht fuer schnelle Navigation

---

## Block C - Abhaengigkeitskarte aufbauen

1. Fuer jedes kritische Modul dokumentieren:
   - direkte Abhaengigkeiten (welche Module werden aufgerufen/benoetigt)
   - Richtung (A -> B)
   - Art der Kopplung (hart/locker)
2. Markiere zentrale Knoten (High-Coupling-Module).
3. Markiere Fragilitaetsstellen:
   - Einzelmodule mit hoher Auswirkung bei Ausfall
   - Module mit vielen Seiteneffekten

Output Block C:
- `paket-01-esp32-abhaengigkeitskarte.md` mit Knotenliste + Kantenliste

---

## Block D - Contract-Seedlist (P1.1 Pflicht)

Erstelle die erste Contract-Liste fuer diese vier Kernketten:

1. **Sensor -> MQTT Publish**
2. **Server Command -> ESP32 Command Handling**
3. **Config-Push -> Firmware Config-Verarbeitung**
4. **Heartbeat/Status -> Server-Rueckkanal**

Pro Contract-Seed:
- Contract-ID
- Topic/Kanal
- Erwartetes Payload-Schema (grob)
- Fehlerfall bei Verletzung
- Folgepaket fuer Detailanalyse

Output Block D:
- `paket-01-esp32-contract-seedlist.md`

---

## Block E - Uebergabe in P1.2/P1.3 vorbereiten

1. Liste "Kernmodule fuer Lifecycle-Analyse (P1.2)" erstellen.
2. Liste "Kernmodule fuer Sensorhandling (P1.3)" erstellen.
3. Offene Fragen markieren, die in P1.2/P1.3 beantwortet werden muessen.

Output Block E:
- Abschnitt "Hand-off in Folgepakete" im Hauptdokument

---

## Akzeptanzkriterien

- [ ] Die Modulliste deckt die Firmware vollstaendig ab (keine offensichtlichen Luecken in Kernbereichen)
- [ ] Jedes Modul hat Verantwortung, I/O, Persistenzbezug, Safety-Bezug und Kritikalitaet
- [ ] Es gibt eine explizite Cluster-Struktur (Runtime, Sensorik, Aktorik, Netzwerk, Config, Persistenz, Safety, Diagnostics, Utilities)
- [ ] Eine Abhaengigkeitskarte mit zentralen Knoten und Fragilitaetsstellen liegt vor
- [ ] Die Contract-Seedlist fuer Sensor-MQTT, Command-ACK, Config-Push, Heartbeat ist vorhanden
- [ ] Hand-off-Abschnitt fuer P1.2 und P1.3 ist dokumentiert
- [ ] Keine Code-Aenderung im Firmware-Repo vorgenommen (reine Analyse)

---

## Dokumentvorlage fuer das Hauptartefakt

Empfohlener Aufbau fuer `paket-01-esp32-modul-inventar.md`:

1. Ziel und Scope
2. Systemgrenze ESP32
3. Modulcluster-Uebersicht
4. Vollstaendige Modultabelle
5. Kritikalitaets-Ranking (Top-10)
6. Verweise auf Abhaengigkeitskarte und Contract-Seedlist
7. Hand-off in P1.2/P1.3

---

## Nicht Teil dieses Auftrags

- Kein detailliertes State-Machine-Design (das ist P1.2)
- Kein tiefes Sensor-Datenfluss-Tracking je Sensortyp (das ist P1.3)
- Keine RAM/NVS Tiefenzuordnung auf Feldebene (das ist P1.4)
- Keine Safety-Wirksamkeitsbewertung auf Fehlerbild-Ebene (das ist P1.5)
- Keine vollstaendige Netzwerk-Robustheitsanalyse (das ist P1.6)

---

## Erfolgskriterium fuer Robin

Nach diesem Auftrag kann man die Firmware als strukturierte Modul-Landkarte sehen und gezielt sagen:
- "Das sind die Kernmodule."
- "Das sind ihre Verantwortungen und Abhaengigkeiten."
- "Das sind die vier kritischen Contract-Ketten."
- "Hier steigen wir in P1.2 und P1.3 als naechstes ein."
