# Paket 07 - Server-Integrationsbild und Contract-Ownership

Stand: 2026-04-03  
System: `El Servador` (Backend)  
Typ: Reine Analyse (kein Code-Aendern)

---

## 1. Integrations-Scope und Boundary-Modell

### 1.1 Scope
Dieses Dokument definiert das verbindliche serverzentrierte Integrationsmodell fuer:
- `Server <-> Firmware (ESP32)`
- `Server <-> Datenbank (PostgreSQL via SQLAlchemy)`
- `Server <-> Frontend (REST + WebSocket)`

Ziel ist eine klare Trennung von:
- fachlicher Autoritaet,
- technischem Contract-Owner,
- beobachtbarer Wahrheit im Fehlerfall.

### 1.2 Boundary A: Server <-> Firmware

| Aspekt | Festlegung |
|---|---|
| Datenarten | Sensor- und Aktor-Status, Heartbeats, LWT, Config-ACK, Zone/Subzone-ACK, System-Errors |
| Richtung | Bidirektional (ESP->Server fuer Status/Telemetry/ACK, Server->ESP fuer Commands/Config) |
| Protokoll | MQTT |
| Prim. Contract-Artefakte | Topics, Payload-Schemas, QoS, Korrelation (`correlation_id`) |
| Autoritaet | **Server ist fachliche Autoritaet** fuer Sollzustand und Regeln; **ESP ist Ausfuehrungsautoritaet** fuer tatsaechliche lokale Ausfuehrung und Runtime-Status |
| Owner | Topic-/Payload-Kontrakt: **Shared Ownership**, final freigabepflichtig durch **Server-Team** (da Server zentrale Integrationsinstanz ist) |

Kernprinzip:
- Server entscheidet, was passieren soll.
- ESP bestaetigt, was real passiert ist.
- Persistierte Endsicht entsteht im Server durch ACK/Status-Ingestion.

### 1.3 Boundary B: Server <-> Datenbank

| Aspekt | Festlegung |
|---|---|
| Datenarten | Device-State, Sensorzeitreihen, Aktorzustand/History, Regeldefinitionen, Ausfuehrungshistorie, Audit, Notifications |
| Richtung | Praktisch Server->DB (Writes) und Server<-DB (Reads), keine direkte externe DB-Nutzung als Integrationspfad |
| Protokoll | SQL (SQLAlchemy async + Repository-Layer) |
| Prim. Contract-Artefakte | DB-Schema, Constraints, Repository-Schnittstellen, Session-/Commit-Semantik |
| Autoritaet | **DB ist persistente Wahrheit**, aber **nur ueber Server-Write-Pfade** |
| Owner | **Server-Team** (Datenmodell, Migrations- und Persistenzlogik); Paket 3 ist Nachschaerfung/Absicherung |

Kernprinzip:
- Keine direkte Frontend- oder Firmware-DB-Autoritaet.
- Server ist einziges Schreib-Gateway.

### 1.4 Boundary C: Server <-> Frontend

| Aspekt | Festlegung |
|---|---|
| Datenarten | Read-Modelle, Commands, Konfiguration, Realtime Events |
| Richtung | Frontend->Server (REST Commands), Server->Frontend (REST Responses + WebSocket Events) |
| Protokoll | HTTP/JSON + WebSocket |
| Prim. Contract-Artefakte | REST Endpoint- und Schema-Contracts, WebSocket Event-Typen/Payloads |
| Autoritaet | **Server ist alleinige Fach- und Statusautoritaet** fuer Frontend-Sicht |
| Owner | **Server-Team** fuer API/WS-Vertraege; Frontend-Team Owner fuer Darstellung/UX-Reaktion |

Kernprinzip:
- Frontend ist kein Truth-Writer fuer Runtime-State.
- Frontend konsumiert serverautorisierte Sicht (inkl. eventual consistency via WS).

---

## 2. Contract-Ownership-Matrix

### 2.1 Verbindliche Ownership je Vertragstyp

| Vertragstyp | Contract-Beispiele | Primary Owner | Co-Owner | Autoritaetsregel |
|---|---|---|---|---|
| API Contracts | `/api/v1/actuators/{esp_id}/{gpio}/command`, `/api/v1/logic/rules` | Server | Frontend (Consumer) | Server definiert Request/Response-Semantik und Fehlercodes |
| MQTT Topic/Payload Contracts | `.../actuator/{gpio}/command`, `.../heartbeat/ack`, `.../config_response`, `.../zone/ack` | Shared, Freigabe durch Server | Firmware | Server ist Integrations-Gate fuer Parsing/Validierung/Seiteneffekte |
| Event/Queue Contracts | Subscriber-Dispatch, WebSocket Eventtypen, ACK-Futures (`MQTTCommandBridge`) | Server | Frontend/Firmware indirekt | Eventsemantik wird durch Server-Handler und Broadcast-Layer festgelegt |
| Status-/ACK-/Error-Code Contracts | `status`-Felder, `success`, `error_code`, `config_status`, HTTP 4xx/5xx | Server | Firmware (producer fuer ESP-Errors) | Konfliktentscheidung laeuft immer ueber serverseitige Autoritaetsregeln |

### 2.2 Contract Ownership nach Boundary

| Boundary | Contract | Owner | Bemerkung |
|---|---|---|---|
| Server<->Firmware | Command-Intent (MQTT command/config topics) | Server | Server erzeugt Soll-Intents inkl. Korrelation |
| Server<->Firmware | Execution-ACK/Runtime-Status (`response`, `status`, `heartbeat`, `lwt`) | Shared (Produktion ESP, Interpretation Server) | ESP meldet Realzustand, Server interpretiert und persistiert |
| Server<->DB | Tabellen, Constraints, Statusfelder, Historien | Server | DB ist persistentes Ziel, nicht eigenstaendige Integrationsinstanz |
| Server<->Frontend | REST/WS Payloads | Server | Frontend darf nur konsumieren und Commands anstossen |

### 2.3 Explizite Contract-Luecken (Owner unklar/fragil)

1. `system/intent_outcome` ist referenziert, aber nicht als aktiver Subscriber-Handler registriert -> Ownership technisch definiert, aber Integrationspfad unvollstaendig.
2. ACK-Korrelation hat Fallback-Matching (FIFO pro ESP/command_type), was bei Parallelitaet Kollisionen verdecken kann.
3. QoS- und ACK-Erwartung zwischen Doku und Runtime kann driften (relevantes Governance-Thema fuer Paket 5).

---

## 3. End-to-End-Katalog (mind. 4 Kernketten)

## SRV-E2E-001: Sensorwert entsteht -> landet im Monitoring

1. ESP publiziert Sensorwert (`sensor/{gpio}/data`)  
   - Contract: MQTT Topic + Payload (`ts`, `esp_id`, `gpio`, `sensor_type`, `raw/raw_value`)  
   - Fehlerstellen: Invalid Topic/JSON/Pflichtfeld -> Drop  
2. Server validiert, normalisiert, loest SensorConfig auf  
   - Contract: Server-Validation- und Mapping-Regeln  
   - Fehlerstellen: ESP unbekannt, Config fehlt, Plausibilitaetswarnungen  
3. Persistenz in `sensor_data` (dedup ueber Unique-Constraint)  
   - Contract: DB Write-Semantik, QoS1-Dedup  
   - Fehlerstellen: DB unavailable -> Drop (kein inbound durable Retry)  
4. Folgeausgaben: WebSocket `sensor_data`, Threshold/Notification, Logic-Trigger  
   - Contract: WS Eventschema + Logic-Trigger-API intern  
   - Fehlerstellen: WS Best-Effort, Logic async task failure

Beobachtbarkeit:
- Logs je Schritt, DB-Zeile als Ground Truth, WS Event als Realtime-Sicht.

## SRV-E2E-002: User sendet Command -> Aktoraktion -> Rueckmeldung

1. Frontend sendet REST Command (`POST /actuators/{esp_id}/{gpio}/command`)  
   - Contract: API Request/Response, JWT/Auth, 409 bei offline ESP  
2. `ActuatorService.send_command()` fuehrt Safety-Check aus  
   - Contract: Safety-Validation als Gate vor MQTT Publish  
   - Fehlerstellen: Safety-Reject, MQTT publish fail  
3. Server publiziert MQTT Command mit `correlation_id`  
   - Contract: MQTT command payload  
4. ESP meldet `actuator/{gpio}/response` (Command-Ergebnis) und/oder `actuator/{gpio}/status` (Ist-Zustand)  
   - Contract: Response-/Status-Payload  
5. Server persistiert History/State und broadcastet WS `actuator_response`/`actuator_status`  
   - Contract: DB + WS

Beobachtbarkeit:
- REST synchronous acceptance != physische Ausfuehrung.
- Finale Laufzeit-Wahrheit kommt ueber Status/Response von ESP.

## SRV-E2E-003: Regel feuert serverseitig -> Action wird dispatcht -> Status wird sichtbar

1. Trigger via Sensor-Event oder Timer  
   - Contract: interne Logic-Triggerdaten  
2. Rule-Evaluation inkl. Condition Evaluators und Safety (Conflict/Rate Limiter)  
   - Contract: Rule Schema + Evaluator-/Limiter-Verhalten  
3. Action-Execution (typisch actuator_command)  
   - Contract: Executor-API + ActuatorService  
4. MQTT Command Dispatch zu ESP  
   - Contract: Command topic/payload  
5. Rueckkanal via ESP status/response + WS `logic_execution` + `actuator_*`  
   - Contract: WS Eventtypen + Aktor-MQTT-Kontrakte

Fehlerstellen:
- Offline ESP Backoff-Skip,
- Konflikt-Lock,
- asynchroner WS/Executor-Fehler.

Beobachtbarkeit:
- `logic_execution` Event zeigt Intent und Executor-Result,
- finale physische Wirkung aus `actuator_status`/`actuator_response`.

## SRV-E2E-004: Offline/Recovery: Reconnect -> Reconciliation -> konsistenter Endzustand

1. Disconnect via LWT oder Timeout -> Server markiert ESP offline  
   - Contract: `system/will` + Timeout-Job  
2. Heartbeat nach Reconnect trifft ein, fruehes `heartbeat/ack` wird gesendet  
   - Contract: ACK vor DB-Write (P1-Reset-Schutz)  
3. Reconnect erkannt (`offline > threshold`) -> Full-State-Push (zone/subzone) via ACK-Bridge  
   - Contract: `zone/assign`/`subzone/assign` + jeweilige ACKs + `correlation_id`  
4. Parallel/anschliessend Config-Mismatch-Pruefung -> Auto Config Push  
   - Contract: Count-basierter Reconciliation-Contract (ESP count vs DB count)  
5. Logic reconnect reevaluation + WS Aktualisierung  
   - Contract: interne Logic-API + WS `esp_health`/Folgeevents

Fehlerstellen:
- ACK timeout in Bridge,
- fehlende durable Replays bei Inbound-Verlust,
- race zwischen Reconnect-Pfaden.

Beobachtbarkeit:
- Logs zu reconnect/state-push/config-push,
- DB Statusfelder und Metadata-Zeitstempel,
- WS `esp_health` als Frontend-Live-Signal.

---

## 4. Autoritaetsregeln bei Konflikt

### 4.1 Verbindliche Gewinner-Regeln

| Konfliktfeld | Gewinnerquelle | Regel |
|---|---|---|
| Statusquelle (online/offline) | Server-Statusmodell (`esp_devices.status`) gespeist aus Heartbeat/LWT/Timeout | LWT/Timeout duerfen offline markieren; Heartbeat kann online wiederherstellen |
| ACK-Autoritaet (Befehl angekommen?) | ESP-ACK/Response (`actuator_response`, `zone/subzone ack`, `config_response`) | REST-200 bedeutet nur Dispatch-Erfolg, nicht Ausfuehrungsfinalitaet |
| Error-Code-Autoritaet | Producer-spezifisch: ESP fuer Hardware-/Runtime-Errors, Server fuer API/Validation/Service-Fehler | Cross-Layer Darstellung wird serverseitig normalisiert, Ursprung bleibt erhalten |
| Finaler Ausfuehrungszustand Aktor | ESP Status (`actuator/{gpio}/status`) persistiert als `actuator_states` | Command-Response allein ist nicht ausreichend fuer finalen Zustand |

### 4.2 Konfliktszenarien und Entscheidungsregeln

1. REST Command success, aber kein ESP Response  
   - Entscheidung: Zustand bleibt "unbestaetigt", kein finaler Erfolg ohne Rueckkanal.

2. ESP Response success, aber spaeterer Status widerspricht  
   - Entscheidung: letzter valider Status gewinnt (Runtime-Realitaet vor frueherem Response).

3. LWT offline kurz vor Heartbeat online  
   - Entscheidung: juengstes Event gewinnt; Heartbeat mit erfolgreichem Processing setzt wieder online.

4. Config-Response success, aber Heartbeat zeigt weiter 0 Komponenten  
   - Entscheidung: Reconciliation-Logik (count mismatch) triggert erneuten Config Push.

5. ACK ohne bekannte Korrelation  
   - Entscheidung: Bridge versucht Fallback-FIFO; bei Unsicherheit als fragiler Zustand markieren und observability erhoehen.

### 4.3 Testbare Autoritaetskriterien

- Jeder Command-Pfad muss zwischen "dispatch accepted" und "execution confirmed" unterscheiden.
- Jeder Offline/Online-Wechsel muss in DB und WS nachvollziehbar sein.
- Konfliktentscheidungen duerfen nicht implizit sein, sondern ueber Log-/Audit-Signale pruefbar.

---

## 5. Fragilitaetsanalyse (Top 10 Risiken)

Bewertungsskala:
- Impact 1..5
- Eintritt 1..5
- Risiko-Score = Impact x Eintritt
- Klasse: stabil / stabil aber degradierbar / fragil

| Rang | Risiko | Impact | Eintritt | Score | Klasse | Warum kritisch |
|---|---|---:|---:|---:|---|---|
| 1 | Inbound MQTT bei DB-Ausfall wird gedroppt (kein durable ingest replay) | 5 | 4 | 20 | fragil | Zeitreihen- und Statusluecken in Stoerphasen |
| 2 | `system/intent_outcome` Contract nicht aktiv im Subscriber verdrahtet | 4 | 4 | 16 | fragil | Outcome-Kette formal vorhanden, praktisch unvollstaendig |
| 3 | ACK-Fallback ohne harte Korrelation (FIFO fallback) | 4 | 4 | 16 | fragil | Falsche ACK-Zuordnung bei Parallelkommandos moeglich |
| 4 | Reconnect-Reconciliation ueber mehrere asynchrone Pfade (state push, config push, logic reeval) | 5 | 3 | 15 | stabil aber degradierbar | race conditions/temporale Inkonsistenz moeglich |
| 5 | WS ist best-effort, kein garantierter Zustellvertrag | 3 | 5 | 15 | stabil aber degradierbar | UI kann kurzfristig inkonsistent sein trotz korrekter DB |
| 6 | Dokumentation vs Runtime drift bei QoS/Topic-Details | 4 | 3 | 12 | stabil aber degradierbar | Fehlannahmen in Betrieb/Tests und bei Changes |
| 7 | Fruehes Heartbeat-ACK vor voller DB-Verarbeitung | 3 | 4 | 12 | stabil aber degradierbar | liveness robust, aber "ACK=vollstaendig verarbeitet" waere falsch |
| 8 | Status-/Response-Doppelpfad fuer Aktorfinalitaet ohne klare UI-Normierung | 4 | 3 | 12 | stabil aber degradierbar | Frontend kann falschen Endzustand anzeigen, wenn Quelle unklar |
| 9 | Legacy-/Aliasfelder in Payloads erhoehen semantische Drift-Gefahr | 3 | 4 | 12 | stabil aber degradierbar | Langfristig schwer testbar und migrationsfehleranfaellig |
| 10 | Threadpool + Timeout-Handling ohne durable compensation fuer Langlaeufer | 3 | 3 | 9 | stabil aber degradierbar | sporadische Inkonsistenz unter Last |

Kurzfazit Stabilitaet:
- **Stabil:** Kerndatenpfade bei normalem Betrieb (sensor ingest, actuator command dispatch).
- **Degradierbar:** WS/Realtime-Sicht, Reconnect-Komplexitaet, temporaere Inkonsistenz.
- **Fragil:** Inbound-Durability, unvollstaendige Outcome-Integration, ACK-Zuordnung in Edge-Cases.

---

## 6. Priorisierte Hand-off-Liste fuer Paket 3/4/5

### 6.1 Paket 3 (DB) - Prioritaet CRITICAL/HIGH

1. **CRITICAL:** Durable Ingest-Strategie fuer DB-Ausfall (journaling/spool/replay) fuer MQTT Inbound.
2. **CRITICAL:** Persistentes Command/ACK Correlation Ledger (statt primar in-memory Future-Mapping).
3. **HIGH:** Konsistente Zustandsableitung fuer Aktor-Endzustand (response vs status) als DB-View/Projection.
4. **HIGH:** DB-Invarianten fuer Reconciliation-Pfade (state-push/config-push timestamps, idempotenz-safe).
5. **HIGH:** Audit-Konsolidierung fuer Cross-Layer-Korrelation (request_id + correlation_id durchgaengig querybar).

### 6.2 Paket 4 (Frontend) - Prioritaet HIGH/MEDIUM

1. **HIGH:** UI-Statusmodell strikt trennen in `accepted`, `confirmed`, `final_state`.
2. **HIGH:** Einheitliche Priorisierung von WS Events (`actuator_status` vor `actuator_response` fuer finalen Zustand).
3. **HIGH:** Reconnect-UI-Pattern: "reconciling" Zustand bis state/config sync abgeschlossen.
4. **MEDIUM:** Sichtbare Kennzeichnung bei degradiertem Realtime-Kanal (WS down/lag).
5. **MEDIUM:** Error-Source-Badges (ESP-Hardware vs Server-Validation) fuer klare Operatorentscheidungen.

### 6.3 Paket 5 (Gesamtintegration) - Prioritaet CRITICAL/HIGH

1. **CRITICAL:** End-to-End Contract-Tests fuer alle 4 Kernketten inkl. Stoerfaelle (DB down, MQTT flap, reconnect).
2. **CRITICAL:** Contract-Governance fuer MQTT/API/WS (Versionierung, Breaking-Change-Gate, Drift-Checks).
3. **HIGH:** `system/intent_outcome` vollstaendig integrieren (Subscriber, Persistenz, UI/Event mapping).
4. **HIGH:** ACK-Korrelationshaertung ohne unscharfen FIFO-Fallback als Standardpfad.
5. **HIGH:** SLOs fuer Konsistenzzeit nach Reconnect (z. B. TTR bis "consistent end state").

---

## 7. Verifikationsplan (wie jede Kernaussage getestet werden kann)

### 7.1 Boundary- und Ownership-Verifikation

| Kernaussage | Verifikation |
|---|---|
| Server ist API-Owner | Endpoint-/Schema-Regressionstests + OpenAPI snapshot diff |
| Server ist Integrations-Gateway zur DB | Test: keine externen Direktwrites, alle State-Aenderungen ueber API/MQTT-Handler |
| Firmware liefert Runtime-Wahrheit fuer Ausfuehrung | Test: command accepted ohne status/response darf nicht als final executed gelten |

### 7.2 E2E-Ketten-Verifikation

| Kette | Mindesttest |
|---|---|
| SRV-E2E-001 | Sensor ingest happy-path + malformed payload + DB-down Verhalten + dedup |
| SRV-E2E-002 | Command success/fail + safety reject + missing response + status widerspricht response |
| SRV-E2E-003 | Rule trigger mit actuator action + conflict lock + offline skip + ws event consistency |
| SRV-E2E-004 | LWT offline -> reconnect heartbeat -> full-state-push -> config mismatch auto-push |

### 7.3 Autoritaetsregeln-Verifikation

| Regel | Testfall |
|---|---|
| Statusautoritaet | Erzeuge LWT offline und danach Heartbeat online, pruefe final DB-Status |
| ACK-Autoritaet | REST-200 ohne ACK darf keine "executed"-Markierung setzen |
| Error-Code-Autoritaet | ESP error_code und serverseitiger validation code muessen unterscheidbar bleiben |
| Finaler Aktorzustand | Widerspruch response/status -> letzter gueltiger status in `actuator_states` gewinnt |

### 7.4 Risiko-Verifikation (Top-Risiken)

| Risiko | Testansatz |
|---|---|
| Inbound Drop bei DB-Ausfall | Chaos-Test: DB breaker open waehrend Sensorflut, danach Gap-Analyse |
| ACK-Korrelation fragil | Parallel-Kommandos an ein ESP, ACK-Reihenfolge invertieren, Zuordnung pruefen |
| Reconnect Race | MQTT flap + gleichzeitige config/state pushes, Endzustand und Zeit bis Konsistenz messen |
| WS Best-Effort Drift | WS absichtlich unterbrechen, REST Poll gegen DB als Fallback validieren |

### 7.5 Abnahmekriterien fuer dieses Paket (P2.7)

- [x] Ownership pro kritischem Contract eindeutig benannt  
- [x] Kern-E2E-Ketten vollstaendig und widerspruchsfrei beschrieben  
- [x] Autoritaetsregeln fuer Status/ACK/Error explizit und testbar  
- [x] Risiken priorisiert und mit Folgeaufgaben verknuepft  
- [x] Ergebnis ohne externe Kontextdatei voll verstaendlich

