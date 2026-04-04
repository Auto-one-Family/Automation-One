# Analyseauftrag: Server-End-to-End-Vollpruefung, Korrektheit und Vollstaendigkeit

**Datum:** 2026-04-03  
**Typ:** Tiefenanalyseauftrag (ohne Codeaenderung in diesem Auftrag)  
**Zielsystem:** El Servador (Backend) im Zusammenspiel mit El Trabajante (Firmware) und El Frontend

---

## 1) Auftrag und Zielbild

Du fuehrst eine vollstaendige, beweisbasierte End-to-End-Pruefung der Serverseite durch.  
Die Pruefung muss beantworten:

1. **Wo laufen die Pfade wirklich entlang?**  
2. **Sind die Pfade korrekt, robust und konsistent bei Last und Stoerung?**  
3. **Ist der Server-Vertrag vollstaendig umgesetzt oder gibt es verdeckte Luecken?**  
4. **Sind Ownership und Autoritaet je Schnittstelle eindeutig und operational testbar?**

Die Analyse ist nur dann erfolgreich, wenn sie nicht nur "happy path" bestaetigt, sondern die harten Kanten (Timeout, Reorder, Retry, Degradation, Recovery, Drift) reproduzierbar nachweist.

---

## 2) Ausgangslage (verbindlich als Pruefkontext)

Die Firmware wurde auf einen formalen Intent-/Outcome-Vertrag gehaertet. Serverseitig muss nun nachgewiesen werden, ob diese Haertung durchgaengig aufgenommen wird.

Ausgangsannahmen fuer die Server-Pruefung:

- Es existiert ein terminales Outcome-Modell fuer Intents (`accepted`, `rejected`, `applied`, `failed`, `expired`).
- Kritische Kommunikationspfade wurden auf sichtbare Admission-/Failure-Semantik gehaertet.
- Emergency arbeitet mit deterministischer Invalidierung veralteter Intents.
- Config-Reconciliation ist als persistenter Pending-/Replay-Gedanke angelegt.
- Kritische Publish-Ereignisse duerfen nicht still verloren gehen.

Serverseitig ist zu pruefen, ob diese Semantik:

- technisch konsumiert,
- fachlich korrekt auf Server-States gemappt,
- in Persistenz/Realtime sichtbar gemacht,
- und bei Fehlern widerspruchsfrei zu Ende gefuehrt wird.

---

## 3) Harte Pruefziele (Must-Haves)

### G1 - End-to-End-Pfadklarheit
Fuer alle kritischen Fluesse ist ein belastbarer Ist-Pfad nachzuweisen:
`Entry -> Validation -> Normalisierung -> Fachlogik -> Persistenz -> Realtime/Ausgabe -> terminaler Zustand`.

### G2 - Keine stillen Verluste in kritischen Kanaelen
Kritische Ereignisse duerfen nicht "verschwinden", ohne dass ein Status/Outcome/Fehler nachweisbar ist.

### G3 - Korrelation und Finalitaet
`correlation_id` und fachliche Zuordnung muessen unter Parallelitaet robust sein.  
Dispatch-Erfolg darf nie als physische Finalitaet verkauft werden.

### G4 - Degraded- und Recovery-Konsistenz
Bei Teilausfaellen muss das System kontrolliert degradieren, sauber recovern und den Statuswechsel sichtbar machen.

### G5 - Contract-Ownership ohne Grauzone
Je Grenze (Firmware, DB, Frontend) sind Contract-Owner, State-Owner, Failure-Owner und Konfliktregeln explizit und testbar.

---

## 4) Verbindliche Leitfragen

1. Wo ist die serverseitige Autoritaet fuer Sollzustand, und wo endet sie?
2. Welche Ereignisse gelten als "accepted", welche als "confirmed", welche als "final"?
3. Welche Inputs werden tolerant akzeptiert (Legacy/Aliase), und wo kippt Toleranz in Drift-Risiko?
4. Welche Inbound-Pfade verlieren Daten bei DB-/Broker-Problemen?
5. Welche ACK-/Response-Pfade koennen bei hoher Parallelitaet falsch zugeordnet werden?
6. Wo fehlt eine harte, persistierte terminale State-Maschine?
7. Wie werden `RECOVERY_SYNC` und `DEGRADED_OPERATION` operational unterschieden?
8. Ist `intent_outcome` ueberall technisch verdrahtet, persistiert, visualisiert?

---

## 5) Pruefbereich A - Device- und Sensor-Ingestion

### A1 - Pfadnachweis
Pruefe alle produktiven Ingestion-Klassen:

- Sensor-Daten
- Heartbeat
- LWT (Offline-Signal)
- Diagnostics
- Error-Events
- Config-Responses
- Legacy-Discovery (falls noch aktiv)
- HTTP-basierte Sensor-Processing-/Calibration-Intakes

### A2 - Contract-Haertung
Nachzuweisen:

- Pflichtfelder/Optionals/Legacy-Aliase sind explizit.
- Normalisierung ist konsistent (Zeit, Feldnamen, Units, Defaults).
- Es gibt keine stillen Schema-Drifts ohne Erkennbarkeit.
- Fehlende explizite `schema_version` wird als Governance-Luecke bewertet.

### A3 - Verlust- und Driftpruefung
Pruefe explizit:

- Inbound-Verhalten bei DB-Breaker offen
- Verhalten bei malformed JSON/Topic/Payload
- Verhalten bei QoS-redelivery und dedup
- Verhalten bei Burst-Last ohne harte Inbound-Backpressure

Beweisziel: klarer Nachweis, welche Daten garantiert persistiert werden und welche unter Stoerung verloren gehen koennen.

---

## 6) Pruefbereich B - Command- und Actuator-Pipeline

### B1 - Lifecycle-Pruefung
Der Server muss fuer jeden Command sauber trennen:

- Dispatch angenommen
- Dispatch gesendet
- ACK/NACK verarbeitet
- finaler Hardware-Zustand bestaetigt

### B2 - Terminale Zustandsautoritaet
Pruefe, ob ein deterministisches Endmodell erzwungen wird:

- `CONFIRMED`
- `REJECTED`
- `TIMED_OUT`
- `ROLLED_BACK`

Falls kein persistiertes, eindeutiges Endmodell existiert: als kritische Luecke markieren.

### B3 - Korrelation unter Parallelitaet
Pruefe gezielt:

- Verhalten bei fehlender/verspaeteter ACK-Korrelation
- Fallback-Zuordnung bei mehreren parallelen Commands
- Out-of-order ACK/Status

Beweisziel: kein falsches "Command bestaetigt", wenn nur heuristische Zuordnung vorliegt.

### B4 - Emergency-Flow
Pruefe:

- Not-Aus-Sperrwirkung systemweit
- Freigabe-Logik (`clear_emergency`) nur entlang definierter Recovery-Regeln
- Auditierbarkeit der gesamten Emergency-Kette

---

## 7) Pruefbereich C - Logic Engine und Regel-Lebenszyklus

### C1 - Triggerquellen vollstaendig
Validiere Triggerarten:

- Sensor-getrieben
- Zeit-getrieben
- Reconnect-getrieben
- Rule-Update-getrieben
- Manuelle Testausloesung

### C2 - Konflikt- und Loop-Schutz
Nachzuweisen:

- Konfliktaufloesung am selben Aktor ist deterministisch
- Cooldown/RateLimit/Hysterese greifen reproduzierbar
- Es gibt keine verdeckten Endlosschleifen im Laufzeitbetrieb

### C3 - Prioritaetssemantik
Pruefe, ob dokumentierte Prioritaetsaussage und Laufzeitverhalten identisch sind.  
Jede Abweichung ist als Drift-Risiko mit Impact zu bewerten.

### C4 - Rule-Success vs Hardware-Success
Pruefe explizit, ob "Rule erfolgreich ausgefuehrt" sauber von "Aktorwirkung final bestaetigt" getrennt wird.

---

## 8) Pruefbereich D - Safety, Failure-Handling und Degraded-Betrieb

### D1 - Failure-Klassen (verbindlich pruefen)

- `MQTT_UNAVAILABLE`
- `DB_UNAVAILABLE`
- `SERVICE_DEPENDENCY_DOWN`
- `QUEUE_OVERFLOW`
- `WORKER_STALL`
- `HIGH_LATENCY`
- `PARTIAL_PARTITION`

### D2 - Pro Klasse nachzuweisen

1. Detection (wie erkannt?)  
2. Containment (wie begrenzt?)  
3. Recovery (wie stabil zurueck?)  
4. Visibility (welche Metrik/Logs/Alerts?)  
5. Fehlklassifikationsrisiko (welche falsche Diagnose ist naheliegend?)

### D3 - Kritische Sicherheitsfrage
Gibt es einen Pfad, in dem bei Stoerung ein unsicherer Aktorzustand entstehen kann, ohne harte serverseitige Blockade?  
Wenn ja: als P0 markieren.

---

## 9) Pruefbereich E - Runtime States und Betriebsmodi

### E1 - Kanonische Runtime-Maschine pruefen
Pruefe operationale Trennschaerfe der Zustaende:

- `COLD_START`
- `WARMING_UP`
- `NORMAL_OPERATION`
- `DEGRADED_OPERATION`
- `RECOVERY_SYNC`
- `SHUTDOWN_DRAIN`

### E2 - Gefaehrliche Transitionen
Pruefe insbesondere:

- "False Normal" nach Reconnect
- Promotion nach `NORMAL_OPERATION` ohne abgeschlossene Reconciliation
- Teilwiederanlauf einzelner Worker ohne globales Mode-Gate

### E3 - Health vs Realzustand
Pruefe, ob Health-Signale nur Snapshot sind oder zurecht als Betriebsfreigabe verwendet werden.  
Abweichungen zwischen "healthy" und realer Betriebsfaehigkeit dokumentieren.

---

## 10) Pruefbereich F - Integrationsbild und Contract-Ownership

### F1 - Boundary A (Server <-> Firmware)
Nachzuweisen:

- Server ist Sollzustandsautoritaet
- Firmware ist Ausfuehrungsautoritaet fuer physische Realitaet
- Finale Sicht entsteht nur durch Rueckkanal + Persistenz

### F2 - Boundary B (Server <-> DB)
Nachzuweisen:

- DB ist persistente Wahrheit
- Server ist einziges produktives Schreib-Gateway
- Recovery/Retry/Idempotenz sind konsistent mit dieser Rolle

### F3 - Boundary C (Server <-> Frontend)
Nachzuweisen:

- Frontend schreibt keine Wahrheit in Runtime-State
- Frontend unterscheidet `accepted` vs `confirmed` vs finalen Zustand
- Realtime-Ausfall wird sichtbar und nicht als "alles grün" maskiert

### F4 - Contract-Luecken
Explizit suchen und priorisieren:

- unvollstaendig verdrahtete Outcome-Kanaele
- unklare ACK-Ownership bei Fallback
- Legacy-Contracts ohne Sunset-Strategie

---

## 11) Pruefmethodik (verbindlich)

### M1 - Trace-first statt Meinung
Jede Aussage mit Traces belegen:

- Input-Event
- Zwischenzustand
- Persistenzbeleg
- Ausgabe-/Eventbeleg
- finaler Status

### M2 - Happy-Path + Failure-Paare
Jeder Kernpfad braucht mindestens:

- 1x Happy-Path
- 1x Stoerfall mit kontrollierter Wiederherstellung

### M3 - Parallelitaetsfaelle erzwingen
Pflichtfaelle:

- Gleichzeitige Commands auf gleiches Ziel
- ACK-Reihenfolge invertiert
- Reconnect waehrend laufender Commands/Rules

### M4 - Drift-Detektion
Pflicht:

- Contract-Drift zwischen Producer-Realitaet und Server-Interpretation aufdecken
- Alias-/Legacy-Toleranz gegen langfristige Wartbarkeit bewerten

---

## 12) Erwartete Deliverables

1. **Pfadatlas**  
   End-to-End-Landkarte aller kritischen Fluesse mit Entry, Guard, Persistenz, Exit, terminalem Zustand.

2. **Contract-Matrix**  
   Pro Fluss: Pflichtfelder, Aliase, Defaults, Versionierungsstand, Drift-Risiko.

3. **Failure-/Recovery-Matrix**  
   Pro Fehlerklasse: Detection, Containment, Recovery, Visibility, Restrisiko.

4. **Ownership-Matrix**  
   SSoT-Owner, Contract-Owner, State-Owner, Failure-Owner je Boundary.

5. **Gap-Liste (priorisiert P0/P1/P2)**  
   Mit Ursache, Auswirkung, Reproduktionsmuster, Vorschlag fuer technische Schliessung.

6. **Go/No-Go-Einschaetzung**  
   Ob die aktuelle Serverseite den gehaerteten Firmware-Vertrag bereits tragfaehig abbildet.

---

## 13) Akzeptanzkriterien (nur bestanden, wenn alle erfuellt)

- [ ] Alle kritischen End-to-End-Pfade sind belegbar und widerspruchsfrei.
- [ ] Kritische Kanaele enthalten keinen stillen Verlustpfad ohne Sichtbarkeit.
- [ ] Korrelation ist unter Parallelitaet robust oder verbleibende Luecken sind klar begrenzt und priorisiert.
- [ ] Degraded-/Recovery-Uebergaenge sind operational eindeutig und "false normal" ist ausgeschlossen.
- [ ] Contract-Ownership ist je Boundary eindeutig und konfliktfest.
- [ ] Outcome-Semantik (`accepted`, `rejected`, `applied`, `failed`, `expired`) ist serverseitig konsistent konsumierbar.
- [ ] Ergebnis ist selbsttragend und ohne externe Verweisdokumente handlungsfaehig.

---

## 14) Priorisierte Pruefschwerpunkte (Top-Risiken zuerst)

1. Inbound-Verlust bei DB-Ausfall (fehlende durable Ingest-Replay-Strategie)  
2. Unvollstaendige End-to-End-Nutzung des Intent-Outcome-Kanals  
3. ACK-Fallback unter Parallelitaet ohne harte Korrelation  
4. Reconnect-Races zwischen Heartbeat, LWT, Config-/State-Resync  
5. "Dispatch accepted" wird operativ mit "hardwareseitig bestaetigt" verwechselt

---

## 15) Abschlussformat

Der Abschluss muss enthalten:

1. **Kurzurteil (max 12 Bullet-Points)** - Ist das System korrekt und vollstaendig genug?  
2. **Pfadbeweise** - pro Kernfluss ein kompakter Beweislauf.  
3. **Top-Findings** - sortiert nach P0/P1/P2.  
4. **Konkrete Folgeauftraege** - klar getrennt nach:
   - Server-Hardening,
   - Datenbank-/Persistenz-Hardening,
   - Frontend-Vertragsklarstellung,
   - Gesamtintegrations- und Betriebstests.

Ein Ergebnis ohne harte Beweise, ohne Priorisierung oder ohne klare Ownership gilt als nicht abgenommen.

