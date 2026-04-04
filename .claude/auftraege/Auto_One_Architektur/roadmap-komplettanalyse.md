# Roadmap: Komplettanalyse AutomationOne-Architektur

> **Typ:** Architektur-Analyse-Roadmap
> **Erstellt:** 2026-04-03
> **Bereich:** AutomationOne
> **Status:** In Bearbeitung

---

## Ziel und Vorgehen

Wir analysieren AutomationOne in zusammenhaengenden Paketen:
1. **ESP32/Firmware komplett**
2. **Server/Backend komplett**
3. **Datenbank komplett**
4. **Frontend komplett**
5. **Systemweite Zusammenhaenge und End-to-End-Handling**

Jedes Paket endet mit klaren Artefakten:
- Komponentenkarte (Welche Module gibt es?)
- Datenflusskarte (Wer liest/schreibt was?)
- Zustandskarte (Welche States und Uebergaenge gibt es?)
- Sicherheitskarte (Welche Safeties greifen wann?)
- Offene Risiken + konkrete Folgeaufgaben

---

## Arbeitsprinzipien

- **Schritt fuer Schritt:** Erst lokal verstehen, dann Querverbindungen ziehen.
- **Single Source pro Paket:** Ein Hauptdokument je Paket, keine fragmentierte Analyse.
- **Fakten vor Annahmen:** Aussagen immer auf konkrete Module, Topics, Endpoints, Tabellen oder UI-Flows beziehen.
- **Speicherklarheit erzwingen:** Fuer jede Komponente explizit dokumentieren: RAM, persistenter Speicher, Wiederanlaufverhalten.
- **Safety first:** Jede Komponente hat einen eigenen Safety-Checkblock.
- **Contracts explizit machen:** Alle Uebergaben zwischen Schichten (Topic, Payload, API, DB-Feld, UI-State) werden als pruefbare Contracts dokumentiert.
- **Observability als Architekturteil:** Jede Kernkette muss ueber Logs/Metriken/Tracing nachvollziehbar sein.

---

## Entscheidende Schlagwoerter (Leitvokabular)

Dieses Leitvokabular wird in allen Paketen aktiv verwendet:

- **Systemgrenzen:** System Boundary, Responsibility Split, Source of Truth, Contract Ownership
- **Datenfluss:** Telemetry Ingestion, Command Path, ACK Path, Correlation ID, Topic Taxonomy
- **Zustand:** Lifecycle State Machine, Pending/Confirmed/Rollback, Degraded Mode, Recovery Mode
- **Persistenz:** RAM vs NVS vs DB, Write Timing, Boot Restore, Version Counter
- **Safety:** Fail-Safe Policy, Watchdog, Circuit Breaker, Heartbeat Timeout, Emergency Stop
- **Diagnose:** Structured Logging, Trace-Log Correlation, Error Taxonomy, End-to-End Traceability
- **Skalierung/Betrieb:** Backpressure, Capacity Limits, Rollout Safety, HA/Failover

---

## Querschnitts-Checkliste (gilt fuer jedes Paket)

Fuer jede untersuchte Komponente muessen folgende Punkte beantwortet werden:

1. **Rolle und Verantwortung:** Wofuer ist die Komponente zustaendig, wofuer explizit nicht?
2. **Input/Output Contracts:** Welche Daten rein/raus, mit welchem Schema und welcher Version?
3. **Zustandsmodell:** Welche States und Trigger existieren?
4. **Persistenzmodell:** Welche Daten in RAM, welche persistent, wann wird geschrieben?
5. **Safety/Fallback:** Was passiert bei Fehler, Timeout, Reboot, Verbindungsverlust?
6. **Recovery/Resync:** Wie kommt die Komponente wieder in konsistenten Zustand?
7. **Observability:** Wie wird ein Fehlerfall in Logs/Metriken/Tracing sichtbar?
8. **Risiko:** Welche Top-3 Ausfallbilder bleiben offen?

---

## Gesamtstruktur der Analysepakete

## Paket 0 - Analyse-Setup und Methodik
**Ziel:** Einheitlichen Rahmen fuer alle folgenden Pakete schaffen.

**Inhalte:**
- Analysefragen-Template festlegen (Inputs, Outputs, State, Persistence, Safety, Failure Modes)
- Namenskonventionen festlegen (Modul-ID, Datenfluss-ID, State-ID)
- Dokumentstruktur fuer alle Pakete vorbereiten
- Contract-Katalog-Struktur festlegen (Topic-Contracts, API-Contracts, DB-Contracts, UI-Contracts)
- End-to-End-ID-Strategie festlegen (z. B. correlation_id/request_id) fuer spaetere Nachvollziehbarkeit

**Deliverables:**
- `paket-00-methodik.md`
- Einheitliche Checklisten fuer alle Schichten
- `paket-00-contract-katalog-template.md`

**Abnahme:** Methodik deckt alle Schichten gleichartig ab und ist auf ESP32 sofort anwendbar.

---

## Paket 1 - ESP32/Firmware Tiefenanalyse (Startpaket)
**Ziel:** Firmware vollstaendig verstehen, beginnend mit Modul-Inventar und danach Sensorhandling, Speicherverhalten, Safety und Netzwerk.

### P1.1 - Modul-Inventar ESP32 (dein Startpunkt)
**Fragen:**
- Welche Firmware-Module existieren?
- Welche Verantwortungen haben sie?
- Welche Module sind kritisch fuer Sensorik, Netzwerk, Config, Safety?

**Ergebnis:**
- Vollstaendige Modulliste mit Rollen
- Abhaengigkeitskarte (welches Modul nutzt welches)
- Markierung der Kernmodule fuer Folgepakete

### P1.2 - Runtime-Lifecycle und State-Model
**Fragen:**
- Welche Boot-/Init-/Run-/Error-States gibt es?
- Welche Trigger verursachen State-Wechsel?
- Welche States sind fuer Sensoren, MQTT, Config und Aktoren relevant?

**Ergebnis:**
- Zustandsdiagramm Firmware-Lifecycle
- Trigger-Matrix (Event -> Zustand -> Aktion)

### P1.3 - Sensorhandling End-to-End
**Fragen:**
- Wo werden Sensoren registriert, initialisiert, gelesen, validiert, normalisiert?
- Welche Takte/Intervalle gelten pro Sensortyp?
- Wann werden Werte verworfen, gecached, publiziert, retried?
- Welche Fehlerpfade existieren (Timeout, CRC, NaN, Outlier)?
- Wie sind die Contracts vom Sensorwert bis zur Server-Ingestion (Topic, Payload, Feldnamen, Einheiten)?

**Ergebnis:**
- Sensor-Datenfluss pro Sensortyp
- Zeitverhalten (Polling, Event, Debounce, Retry)
- Fehlerbehandlungs- und Recovery-Matrix
- Contract-Matrix Sensor -> MQTT -> Server

### P1.4 - Speicheranalyse RAM vs. NVS
**Fragen:**
- Welche Daten liegen nur in RAM (Session/Runtime)?
- Welche Daten sind in NVS persistiert?
- Wann wird von RAM nach NVS geschrieben?
- Welche Wiederherstellung passiert nach Reboot/Power-Loss?
- Welche Versionierungs-/Gueltigkeitsregeln gibt es fuer persistierte Daten?

**Ergebnis:**
- Speicherkarte je Datentyp (RAM/NVS/abgeleitet)
- Schreibstrategie (wann, wie oft, Guardrails)
- Reboot-Konsistenzanalyse

### P1.5 - Safety-Operationen Firmware
**Fragen:**
- Welche lokalen Safeties sichern Sensorik/Aktorik ab?
- Welche Hard-Limits, Watchdogs, Default-Fallbacks existieren?
- Wie werden unsafe Zustaende erkannt und entschraerft?

**Ergebnis:**
- Safety-Katalog mit Priorisierung (kritisch/hoch/mittel)
- Mapping Safety -> abgedeckter Fehlerfall

### P1.6 - Netzwerk- und Kommunikationshandling
**Fragen:**
- Wie laufen WLAN-Provisioning, Connect, Reconnect, Offline-Verhalten?
- Welche MQTT-Topics werden gelesen/geschrieben?
- Welche QoS-, Queue-, Backoff- und Timeout-Strategien gelten?
- Was passiert bei Broker-Ausfall, Netzverlust, Teilverbindung?
- Wie werden ACKs korreliert (correlation_id/pending-state) und wie erfolgt Reconciliation nach Reconnect?

**Ergebnis:**
- Netzwerk-State-Machine
- MQTT-Flow inkl. Offline/Recovery
- Robustheitsbewertung pro Ausfallszenario
- ACK/Timeout/Reconciliation-Designbild

### P1.7 - ESP32-Integrationsbild
**Fragen:**
- Wie interagiert die Firmware mit Server, DB, Frontend indirekt?
- Welche Contract-Punkte sind stabil, welche fragil?

**Ergebnis:**
- ESP32-Systemgrenzen (Contracts, Topics, Payloads, Befehle)
- Liste potenzieller Inkompatibilitaetsrisiken

**Abnahme Paket 1:** Die Firmware ist als geschlossenes System vollstaendig erklaert; Sensorhandling, RAM/NVS, Safety und Netzwerk sind nachvollziehbar dokumentiert.

---

## Paket 2 - Server/Backend Tiefenanalyse
**Ziel:** Backend als Steuerzentrale verstehen (API, Orchestrierung, Device-Handling, Logic/Safety).

### P2.1 - Modul- und Service-Inventar
**Fragen:**
- Welche Server-Module existieren in API, Service-, Messaging-, Persistence- und Runtime-Layern?
- Welche Ownership hat jedes Modul (Source of Truth, Zustandsowner, Contract-Owner)?
- Wo liegen kritische Kopplungen und Single-Point-of-Failure-Risiken?

**Ergebnis:**
- Vollstaendige Server-Modulkarte
- Kritikalitaetsranking je Modul
- Hand-off-Liste fuer P2.2 bis P2.7

### P2.2 - Device- und Sensor-Ingestion-Pipeline
**Fragen:**
- Wie laufen die End-to-End-Ingestion-Pfade von MQTT/HTTP bis Persistenz und Weitergabe?
- Welche Validierungs-/Normalisierungsregeln gelten je Eingangstyp?
- Welche Schema- und Versionsregeln sichern Rueckwaertskompatibilitaet?
- Wie sehen Fehlerpfade (Parse-Fehler, Timeout, Queue-Backpressure, Drop) aus?

**Ergebnis:**
- Ingestion-Datenflusskarte (Entry -> Guard -> Persist -> Publish)
- Contract-Matrix der Eingangspayloads
- Fehler-/Recovery-Matrix fuer Ingestion

### P2.3 - Command/Actuator-Pipeline
**Fragen:**
- Wie ist der Command-Lifecycle von Erzeugung bis terminalem Zustand modelliert?
- Wo und wie werden Safety-Pruefung, Dispatch und ACK/NACK korreliert?
- Welche Pending/Confirmed/Rollback- und Idempotenzregeln gelten?
- Welche Retry-/Timeout-/Reconciliation-Pfade greifen bei Teilausfall?

**Ergebnis:**
- Command-Lifecycle- und Statusmodell
- ACK/NACK- und Korrelation-Contract
- Fehlerszenario-Katalog mit Recovery-Regeln

### P2.4 - Logic Engine und Regel-Lebenszyklus
**Fragen:**
- Wie laufen Rule Create/Update/Delete und Laufzeit-Evaluation technisch ab?
- Welche Trigger- und Priorisierungslogik gilt bei konkurrierenden Regeln?
- Wie wird Loop-Prevention umgesetzt?
- Wo entstehen Drift-Risiken zwischen Regeldefinition, Runtime und UI?

**Ergebnis:**
- Regel-Lifecycle inkl. Zustandsuebergaenge
- Trigger-/Conflict-/Loop-Policy-Matrix
- Konsistenzanalyse Rule-Definition vs Runtime vs UI

### P2.5 - Safety- und Failure-Handling
**Fragen:**
- Welche Safety-Barrieren greifen im Server bei Last, Fehlern und Teilausfaellen?
- Wie funktionieren Circuit Breaker, Rate Limits, Idempotenz und Retries im Zusammenspiel?
- Welche Degraded-Mode-Strategien gelten bei MQTT/DB/Service-Ausfall?
- Welche Failure-Klassen sind ausreichend sichtbar (Logs/Metriken/Alerts)?

**Ergebnis:**
- Safety-Katalog mit Trigger und Prioritaet
- Failure-Matrix fuer kritische Ausfallbilder
- Recovery-Regeln und Exit-Kriterien aus Degraded Mode

### P2.6 - Runtime States und Betriebsmodi
**Fragen:**
- Welche Betriebszustaende hat der Server (Normal, Degraded, Recovery, Cold Start)?
- Welche Trigger/Guards/Actions definieren Zustandswechsel?
- Wie verhalten sich Background-Services, Scheduler und Worker im Zustandstransfer?
- Welche Risiken entstehen bei Teilwiederanlauf oder inkonsistentem Rejoin?

**Ergebnis:**
- Runtime-State-Machine fuer den Server
- Trigger-Matrix je Betriebsmodus
- Betriebsregeln fuer Restart, Wiederanlauf und Stabilisierung

### P2.7 - Server-Integrationsbild und Contract-Ownership
**Fragen:**
- Wo liegen die verbindlichen Server-Grenzen zu Firmware, Datenbank und Frontend?
- Welche Contracts gehoeren welchem Owner (API, MQTT, Eventing, Statusquellen)?
- Welche E2E-Ketten sind stabil, welche fragil und warum?
- Welche priorisierten Folgeaufgaben gehen in Paket 3/4/5?

**Ergebnis:**
- Integrationsbild mit klarer Contract-Ownership
- E2E-Flow-Katalog Server-zentriert
- Priorisierte Hand-off-Liste fuer DB, Frontend, Gesamtintegration

**Abnahme Paket 2:** Das Backend ist entlang aller Kernpfade (Ingestion, Command, Logic, Safety, Runtime, Integrationsgrenzen) konsistent und hand-off-faehig erklaert.

---

## Paket 3 - Datenbank Tiefenanalyse
**Ziel:** Datenmodell, Datenlebenszyklus und Konsistenzverhalten vollstaendig verstehen.

### P3.1 - Tabellen- und Schema-Inventar
- Entitaeten, Beziehungen, Constraints, Indizes

### P3.2 - Schreibpfade und Lesepfade
- Wer schreibt wann welche Tabelle, wer liest fuer welche Funktion
- Welche Felder sind "authoritative" und welche abgeleitet?

### P3.3 - Zeitreihen- und Historisierungskonzept
- Sampling, Retention, Aggregation, Archivierung
- Genauigkeit vs. Kosten vs. Diagnosefaehigkeit (Downsampling-Risiken)

### P3.4 - Konsistenz und Transaktionsgrenzen
- Atomare Updates, Race Conditions, Konfliktfaelle

### P3.5 - Recovery und Datenintegritaet
- Backup/Restore, Migration, Rebuild aus Events/Telemetry

**Abnahme Paket 3:** Fuer jede zentrale Tabelle sind Owner, Schreib-/Lesepfade und Integritaetsregeln dokumentiert.

---

## Paket 4 - Frontend Tiefenanalyse
**Ziel:** Bedienlogik, State-Management und Echtzeitverhalten der UI nachvollziehbar machen.

### P4.1 - Modul-Inventar UI
- Views, Komponentenfamilien, Stores, API/Socket-Clients

### P4.2 - State-Management und Datenquellen
- Welche States sind lokal/store/server-abhaengig?
- Welche UI-States sind rein praesentational und welche business-kritisch?

### P4.3 - Realtime- und Update-Handling
- Socket-Events, Polling, Stale-Data-Strategien, Error-UI
- Reihenfolge-/Deduplizierungsregeln bei schnellen Updates

### P4.4 - User-Flows fuer Sensor/Aktor/Regel
- Config -> Speichern -> Rueckmeldung -> Monitoring
- Fehler-/Rollback-UX bei fehlendem ACK oder Timeout

### P4.5 - Frontend-Safety und Guardrails
- Validierungen, Plausibilitaetschecks, Race/Double-Submit-Vermeidung

**Abnahme Paket 4:** UI-Verhalten ist vom User-Event bis zur Rueckmeldung technisch durchdekliniert.

---

## Paket 5 - Systemweite Gesamtintegration
**Ziel:** Alle Einzelanalysen zu einem konsistenten Gesamtmodell zusammenfuehren.

### P5.1 - End-to-End-Flows
- Sensorwert entsteht -> landet im Monitoring
- User-Aktion -> Aktor schaltet sicher
- Regel feuert -> Aktion wird ausgefuehrt -> Zustand wird sichtbar

### P5.2 - Daten- und Zustandskonsistenz ueber alle Schichten
- Wo koennen Drift, Delay, Lost Update, Double Action entstehen?
- Welche Drift-Klassen sind tolerierbar und welche sind kritisch?

### P5.3 - Globales Safety-Modell
- Welche Safety liegt auf welcher Schicht?
- Welche Luecken bleiben ungesichert?
- Welche Safety-Barrieren sind single-point-of-failure?

### P5.4 - Priorisierte Verbesserungsroadmap
- Sofortmassnahmen (kritisch)
- Kurzfristig (Stabilitaet)
- Mittelfristig (Skalierung/Wartbarkeit)

**Abnahme Paket 5:** Es gibt ein belastbares Gesamtarchitektur-Bild inkl. Risiken, Schutzmassnahmen und priorisierten naechsten Schritten.

---

## Empfohlene Reihenfolge (operativ)

1. Paket 0 abschliessen
2. Paket 1 komplett durchziehen (ESP32 zuerst)
3. Paket 2, danach Paket 3
4. Paket 4
5. Paket 5 als Integrationsabschluss

---

## Startplan fuer den naechsten Schritt (Server jetzt)

**Direkter Start mit P2.1 Modul- und Service-Inventar:**
- Alle Server-Module erfassen
- Module in Gruppen clustern: API, Domain-Services, Ingestion, Messaging, Logic Engine, Persistence, Runtime/Betrieb
- Pro Modul kurz dokumentieren:
  - Verantwortung
  - Eingaben/Ausgaben
  - Persistenzbezug (RAM/DB/Cache/kein Speicher)
  - Kritikalitaet im Gesamtsystem

**Output nach dem ersten Arbeitsschritt:**
- Vollstaendige Modulliste als Basis fuer P2.2 bis P2.7
- Erste Abhaengigkeitskarte fuer das weitere Deep-Dive
- Erste Contract-Liste fuer kritische Server-Schnittstellen (Ingestion, Command-ACK, Rule-Trigger, Runtime-Status)

---

## Neue Artefakte fuer diese Roadmap-Runde (Recherche 2026-04-03)

- Wissensausbau: `wissen/iot-automation/iot-systemarchitektur-analyse-schlagwoerter-2026-04.md`
- Link-Sammlung: `wissen/iot-automation/link-sammlung-iot-systemarchitektur-analyse-2026-04-03.md`
- Startstruktur Server-Tiefenanalyse: `arbeitsbereiche/automation-one/architektur-autoone/server/`
- Auftragsserie Paket 2: `auftrag-P2.1-server-modul-und-service-inventar-2026-04-03.md` bis `auftrag-P2.7-server-integrationsbild-und-contract-ownership-2026-04-03.md`
