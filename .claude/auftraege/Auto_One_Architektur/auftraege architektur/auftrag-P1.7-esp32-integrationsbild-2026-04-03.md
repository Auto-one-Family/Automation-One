# Auftrag P1.7: ESP32-Integrationsbild und Systemgrenzen

**Ziel-Repo:** auto-one (El Trabajante Firmware + Schnittstellen zu El Servador/El Frontend)  
**Bereich:** AutomationOne Architektur-Komplettanalyse (`architektur-autoone`)  
**Roadmap-Bezug:** `roadmap-komplettanalyse.md` -> Paket 1, Schritt P1.7  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~7-11h  
**Abhaengigkeit:** P1.1 bis P1.6 abgeschlossen

---

## Ziel

Erstelle das verbindliche ESP32-Integrationsbild als Abschluss von Paket 1:

1. Klare Systemgrenzen zwischen Firmware, Server, DB und UI.
2. Verbindliche Contract-Autoritaet fuer ACK, ONLINE-Zustand, Error-Codes und Reconciliation.
3. Stabilitaetsbewertung der Uebergabepunkte inkl. fragiler Schnittstellen.
4. Priorisierte Integrationsrisiken mit umsetzbaren Folgeaufgaben fuer Paket 2/3/4/5.

---

## Pflichtinputs

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-06-esp32-netzwerk-state-machine-und-betriebsmodi.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-06-esp32-mqtt-flow-ack-nack-retry-contract.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-06-esp32-observability-und-reconciliation-contract.md`
4. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-katalog-und-priorisierung.md`
5. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-policy-und-entscheidungsregeln.md`
6. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-wirksamkeit-fehlerbilder.md`
7. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-speicherkarte-ram-vs-nvs.md`
8. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-schreib-und-restore-strategie.md`
9. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-reboot-powerloss-konsistenzanalyse.md`
10. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-contract-matrix.md`
11. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-runtime-lifecycle-state-model.md`
12. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-trigger-matrix.md`
13. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-core-interaktionsbild.md`
14. `arbeitsbereiche/automation-one/architektur-autoone/roadmap-komplettanalyse.md`

Ergaenzende Inputs (falls vorhanden, read-only):
- `arbeitsbereiche/automation-one/architektur-autoone/esp32/Fehleranalyse/`

Regeln:
- Keine `copy.md` als Wahrheit.
- Keine Parallelstruktur erstellen.
- Nur Analyse und Architekturkonsolidierung, kein Firmware-Implementieren.

---

## Arbeitsschritte

## Block A - Systemgrenzen und Verantwortungsmodell

1. Responsibility-Split finalisieren:
   - Was ist SSoT auf ESP32, was auf Server, was abgeleitet im UI?
2. Contract-Ownership je Schnittstelle zuweisen:
   - Topic/Payload,
   - ACK-/NACK-Semantik,
   - Error-Code-Owner.
3. Grenzfaelle markieren:
   - ONLINE ohne ACK,
   - `server/status=online` vs Heartbeat-ACK,
   - Persistenzdrift Runtime vs NVS.

Output Block A:
- Systemgrenzenkarte mit IDs `FW-INT-BOUND-XXX`.

---

## Block B - End-to-End Contract-Mapping ESP32 -> Server -> DB -> UI

1. Kritische E2E-Ketten modellieren:
   - Sensor-Telemetrie,
   - Config-Push/Config-Response,
   - Command/Response,
   - Offline->Reconnect->ONLINE_ACKED.
2. Je Kette dokumentieren:
   - Owner je Schritt,
   - garantierte vs nicht garantierte Zustellungen,
   - Korrelation (`correlation_id`, `request_id`, `seq`).
3. QoS- und Semantik-Drift als Integrationsrisiko markieren.

Output Block B:
- E2E-Contract-Katalog mit IDs `FW-INT-CON-XXX`.

---

## Block C - Integrationsstabilitaet und Fragilitaetsanalyse

1. Pro Schnittstelle Stabilitaet bewerten:
   - stabil,
   - stabil aber degradierbar,
   - fragil.
2. Fragile Punkte priorisieren:
   - Parse-Fail ohne harten NACK,
   - Queue-full silent drops,
   - Outbox-/Drain-Sichtbarkeit,
   - Persistenz-Atomik,
   - ACK-Autoritaet.
3. Verifizierbarkeit festlegen:
   - notwendige Metriken/Events,
   - notwendige Testfaelle.

Output Block C:
- Fragilitaetsmatrix mit IDs `FW-INT-RISK-XXX`.

---

## Block D - Verbindlicher Integrationsvertrag (Sollbild)

1. Endgueltige Regeln definieren:
   - wann `ONLINE_ACKED` gilt,
   - wann `PERSISTENCE_DRIFT` gilt,
   - wie NACK-Pfade verpflichtend aussehen.
2. Error-Code-Normalbild festlegen:
   - `QUEUE_FULL`,
   - `PARSE_FAIL`,
   - `OUTBOX_FULL`,
   - `NVS_WRITE_FAIL`.
3. Delta-Replay-/Reconciliation-Regeln festlegen:
   - idempotente Wiederholung,
   - Timeout-/Backoff-Vertrag,
   - Abschlusskriterien fuer Re-Sync.

Output Block D:
- Integrationsvertrag mit IDs `FW-INT-SOLL-XXX`.

---

## Block E - Hand-off in Paket 2 bis 5

1. Konkrete Folgeaufgaben aus dem Integrationsbild ableiten fuer:
   - Paket 2 (Server),
   - Paket 3 (DB),
   - Paket 4 (Frontend),
   - Paket 5 (Gesamtintegration).
2. Sofortmassnahmen vs mittelfristige Architekturtrennung kennzeichnen.
3. Klare Reihenfolge fuer Umsetzung/Verifikation definieren.

Output Block E:
- Priorisierte Hand-off-Liste mit Abhaengigkeiten.

---

## Deliverables

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-07-esp32-systemgrenzen-und-contract-ownership.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-07-esp32-end-to-end-integrationskatalog.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-07-esp32-integrationsrisiken-und-umsetzungsfahrplan.md`

---

## Akzeptanzkriterien

- [ ] Systemgrenzen und Owner pro Schnittstelle sind eindeutig dokumentiert
- [ ] ACK-Autoritaet (`heartbeat/ack` vs `server/status`) ist klar und testbar festgelegt
- [ ] E2E-Ketten fuer Sensor, Config, Command und Reconnect sind vollstaendig beschrieben
- [ ] Fragile Integrationspunkte sind priorisiert und evidenzbasiert begruendet
- [ ] Verbindlicher Soll-Vertrag fuer NACK/Retry/Drift ist definiert
- [ ] Hand-off-Aufgaben fuer Paket 2-5 sind konkret und in Reihenfolge beschrieben
- [ ] Keine Code-Aenderung im Firmware-Repo vorgenommen

---

## Nicht-Scope

- Keine Implementierung im Firmware-/Server-/Frontend-Code
- Keine Datenbankmigrationen
- Keine Betriebsumstellung im laufenden Produktivsystem
- Keine finale Release-Entscheidung

---

## Erfolgskriterium fuer Robin

Nach P1.7 ist praezise beantwortbar:
- welche ESP32-Schnittstellen heute belastbar sind,
- wo die echten Integrationsrisiken fuer den Gesamtsystembetrieb liegen,
- welche konkreten Folgeaufgaben in Server/DB/UI zuerst umgesetzt werden muessen, um End-to-End-Konsistenz und Safety dauerhaft sicherzustellen.
