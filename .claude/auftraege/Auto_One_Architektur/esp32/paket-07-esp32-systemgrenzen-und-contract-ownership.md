# Paket 07: ESP32 Systemgrenzen und Contract-Ownership (P1.7)

## 1) Ziel und Scope

Dieses Dokument finalisiert Block A von P1.7:
- verbindliche Systemgrenzen zwischen Firmware, Server, DB und UI,
- eindeutige Owner je Integrationsvertrag,
- klare Autoritaet fuer ACK, ONLINE, Error-Codes und Drift-Entscheidungen.

ID-Schema:
- Systemgrenzen und Ownership: `FW-INT-BOUND-XXX`

Hinweis zur Evidenz:
- Die Pflichtdatei `roadmap-komplettanalyse.md` war im Workspace nicht auffindbar.
- Die Konsolidierung basiert auf den vorhandenen Pflichtinputs aus Paket 02-06.

## 2) Verbindliches Schichtenmodell

| Schicht | Primaere Rolle | Verbindliche Verantwortung | Nicht-Verantwortung |
|---|---|---|---|
| ESP32 Firmware (`El Trabajante`) | Edge Execution | Sensorerfassung, lokale Safety im Disconnect-Fall, ACK-getriebener Offline-Exit, NACK-Erzeugung fuer lokale Verarbeitungsfehler | Keine globale Wahrheit ueber Gesamtsystem-ONLINE |
| Server (`El Servador`) | Control Plane + Contract-Autoritaet | Annahme/Bestaetigung von Device-Zustaenden, Korrelation, Reconciliation-Steuerung, Error-Code-Normalisierung | Keine direkte Hardwareausfuehrung |
| DB | Persistenz-Autoritaet | Persistierte Historie, letzte bestaetigte Zustandskette, Querybare Auditierbarkeit | Keine Runtime-Entscheidung ueber Live-Steuerung |
| Frontend (`El Frontend`) | Operative Sicht + Bedienung | Darstellung von `link_online` vs `ack_online`, Sichtbarkeit von Drift/Risiko, Bedienpfade mit klarer Unsicherheit | Keine Autoritaet fuer ACK oder Recovery-Entscheidung |

## 3) Systemgrenzenkarte (FW-INT-BOUND-XXX)

| ID | Grenze | Inbound | Outbound | Contract-Owner | Verbindliche Regel |
|---|---|---|---|---|---|
| FW-INT-BOUND-001 | Firmware Runtime -> MQTT Transport | Queue-Drain / direct publish | MQTT publish | Firmware | Jeder Publish-Fail (queue/outbox) muss als Fehlergrund klassifizierbar sein |
| FW-INT-BOUND-002 | MQTT Transport -> Server Ingestion | topic/payload | persist/route/ack | Server | Server bewertet Nachricht als angenommen oder fehlgeschlagen; kein "stilles" Erfolgsmodell |
| FW-INT-BOUND-003 | Server Ingestion -> DB Persistenz | normalisierte Events/Antworten | persistierte Timeline | Server+DB | Persistenzstatus muss fuer Reconciliation referenzierbar sein |
| FW-INT-BOUND-004 | Server State -> UI State | websocket/rest view models | Operator-Statusbild | Server | UI erbt den Serverstatus, darf ihn nicht reinterpretieren |
| FW-INT-BOUND-005 | Server Command -> Firmware Command Queue | actuator/sensor/config command | response/nack | Server+Firmware | Jeder command/config request braucht einen terminierenden Ausgang (`success|error|timeout`) |
| FW-INT-BOUND-006 | Firmware Offline Runtime -> Server Reconnect | heartbeat/status/config_response | reconciliation start | Firmware+Server | Reconnect beendet OFFLINE nur mit ACK-Autoritaet plus Sync-Kriterien |
| FW-INT-BOUND-007 | Firmware NVS <-> Runtime | persist/load/reset | drift signal | Firmware | NVS-Write-Fail in safety-relevanten Pfaden erzeugt Drift-Status statt stiller Fortsetzung |
| FW-INT-BOUND-008 | Server Liveness Signal -> Firmware Recovery | `server/status` | pre-ack hint | Server | `server/status=online` ist nur Liveness-Hinweis, nicht finale ACK-Autoritaet |

## 4) SSoT- und Ableitungsmodell

| ID | Fachobjekt | SSoT | Abgeleitet in | Konsequenz |
|---|---|---|---|---|
| FW-INT-BOUND-020 | Lokaler Rule-Execution-Zustand (`OFFLINE_ACTIVE`, `server_override`, Guard-Skips) | Firmware Runtime | Server/UI nur als Event-Sicht | Server darf lokal laufende Rule-Zyklen nicht "raten" |
| FW-INT-BOUND-021 | Device Connectivity `link_online` | Firmware + Broker-Sicht | Server/UI | Link online ist nicht gleich ack online |
| FW-INT-BOUND-022 | `ack_online`/`ONLINE_ACKED` | Server-Antwort + Firmware ACK-Verarbeitung | DB/UI | Nur ACK-validierter Zustand gilt als synchronisiert |
| FW-INT-BOUND-023 | Persistierte Konfiguration | DB (global) und NVS (lokale Kopie) | Firmware Runtime | Drift-Detektion zwischen desired (Server/DB) und local applied (Firmware) ist Pflicht |
| FW-INT-BOUND-024 | Error-Codes (Queue/Parse/Outbox/NVS) | Server Contract-Katalog | Firmware erzeugt, UI zeigt | Einheitliche Codes ueber alle Schichten, keine lokalen Sonderbegriffe |
| FW-INT-BOUND-025 | Reconciliation-Fortschritt | Server (Session-Owner) | Firmware/UI | Abschlusskriterien serverseitig kontrolliert, firmwareseitig telemetriert |

## 5) Contract-Ownership je Schnittstelle

| ID | Schnittstelle | Topic/Payload Owner | ACK/NACK Owner | Error-Code Owner | Kommentar |
|---|---|---|---|---|---|
| FW-INT-BOUND-040 | Sensor `.../sensor/{gpio}/data` | Firmware (Schema) + Server (Ingestion-Vertrag) | implizit ueber serverseitige Verarbeitung | Server-Normalbild | Delivery ist at-least-once-nah, nicht exactly-once |
| FW-INT-BOUND-041 | Config `.../config` / `.../config_response` | Server (request schema), Firmware (response schema) | Firmware terminiert Request mit success/error | Server-Normalbild | Parse/Queue-Fehler muessen deterministisch als error enden |
| FW-INT-BOUND-042 | Command `.../actuator|sensor/.../command|response` | Server (command), Firmware (response) | Firmware fuer command execution response | Server-Normalbild | Queue-full braucht harten NACK statt nur Log |
| FW-INT-BOUND-043 | Heartbeat/ACK | Firmware sendet heartbeat, Server sendet ACK | Server-Autoritaet fuer ACK | Server | ACK ist finale Bestaetigung fuer ONLINE_ACKED |
| FW-INT-BOUND-044 | `server/status` | Server | Server (Liveness) | Server | Nur Vor-Signal fuer Recovery, kein Ersatz fuer Heartbeat-ACK |
| FW-INT-BOUND-045 | Drift-/Persistence-Events | Firmware emittiert | Server bewertet/klassifiziert | Server-Normalbild | UI muss Drift sichtbar machen, nicht kaschieren |

## 6) Grenzfaelle und verbindliche Entscheidung

| ID | Grenzfall | Ist-Spannung | Verbindliche P1.7-Entscheidung |
|---|---|---|---|
| FW-INT-BOUND-070 | ONLINE ohne Heartbeat-ACK (Gate timeout) | Betrieb moeglich, semantisch unscharf | Zustand wird als `LINK_ONLINE_UNACKED` gefuehrt, nicht als `ONLINE_ACKED` |
| FW-INT-BOUND-071 | `server/status=online` vor Heartbeat-ACK | kann Offline-Exit triggern | Darf nur `reconnecting_hint` setzen; finale ACK-Bestaetigung bleibt Heartbeat-ACK |
| FW-INT-BOUND-072 | Queue-full in command/config | heute teils ohne harten NACK | Jede abgewiesene Request muss dedizierte negative Antwort mit Korrelation erzeugen |
| FW-INT-BOUND-073 | Parse-Fail im Config-Worker | potenziell stiller Drop | Parse-Fail ist verpflichtend `error`-Terminalzustand fuer die Request |
| FW-INT-BOUND-074 | Runtime-vs-NVS Drift bei Write-Fail | bisher teils nur Log | Drift erzeugt expliziten Degraded-Zustand und operatives Signal bis Repair |

## 7) Autoritaetsmodell (ACK, ONLINE, Error, Reconciliation)

1. `FW-INT-BOUND-090` - **ACK-Autoritaet:** Nur Heartbeat-ACK mit gueltiger Payload beendet `OFFLINE_ACTIVE/RECONNECTING` final.
2. `FW-INT-BOUND-091` - **ONLINE-Autoritaet:** `ONLINE_ACKED` erfordert `ACK_OK` plus erfolgreich klassifiziertes Reset/Persistenzresultat.
3. `FW-INT-BOUND-092` - **Error-Code-Autoritaet:** Canonical Codes werden serverseitig normiert; Firmware emittiert exakt diese Codes.
4. `FW-INT-BOUND-093` - **Reconciliation-Autoritaet:** Server steuert Session-Lebenszyklus (start/running/done/failed), Firmware liefert reproduzierbare Fortschrittssignale.

## 8) Abschluss Block A

Die Systemgrenzen sind fuer P1.7 verbindlich: Firmware bleibt Safety-/Execution-Owner am Rand, Server ist Vertrags- und Reconciliation-Autoritaet, DB ist Persistenzwahrheit, UI ist abgeleitete Operationssicht. Die bisherigen Grenzfaelle (ACK-Ersatz, stille Drops, Drift ohne Signal) sind damit eindeutig aufgeloest und in nachfolgenden Paketen testbar umsetzbar.
