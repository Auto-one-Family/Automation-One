# Paket 07: ESP32 End-to-End Integrationskatalog (P1.7)

## 1) Ziel

Dieses Dokument finalisiert Block B von P1.7:
- E2E-Contract-Mapping fuer die kritischen Ketten ESP32 -> Server -> DB -> UI,
- klare Zuordnung von Ownern, Garantien und Korrelation,
- sichtbare QoS-/Semantik-Drifts als Integrationsrisiken.

ID-Schema:
- End-to-End Contracts: `FW-INT-CON-XXX`

## 2) E2E-Kette 1 - Sensor-Telemetrie

### 2.1 Flussbild

`Core1 Measurement -> g_publish_queue -> Core0 MQTT publish -> Broker -> Server sensor handler -> DB persist -> UI stream/update`

### 2.2 Contract-Tabelle

| ID | Schritt | Owner | Garantiert | Nicht garantiert | Korrelation |
|---|---|---|---|---|---|
| FW-INT-CON-001 | Sensorwert wird lokal erhoben und Payload gebaut | Firmware/Core1 | Payloadstruktur inkl. `seq`, `ts`, `raw_mode` | keine globale Persistenz | `seq` (Firmware) |
| FW-INT-CON-002 | Queue-Transfer Core1->Core0 | Firmware | Reihenfolge innerhalb Queue bei Kapazitaet | Queue-full kann Drop erzeugen | `seq`, topic key |
| FW-INT-CON-003 | MQTT Publish Richtung Broker | Firmware/Core0 | Publish-Versuch | erfolgreiche Zustellung bis Server nicht strikt garantiert | `seq` |
| FW-INT-CON-004 | Server Ingestion + Validierung | Server | Verarbeitung bei ankommender Nachricht | keine Nachricht ohne Empfang | `seq`, `esp_id`, `gpio` |
| FW-INT-CON-005 | Persistenz in DB | Server+DB | Persistierte Historie bei erfolgreicher Verarbeitung | E2E-Ack an Firmware fuer Telemetrie standardmaessig nicht vorhanden | DB timestamp + `seq` |
| FW-INT-CON-006 | UI Darstellung | Server->UI | Anzeige des serverseitig bekannten Zustands | keine Aussage ueber nicht empfangene Publishes | abgeleitet aus DB/WS |

### 2.3 Integrationsbewertung

- QoS-Praxis: Sensorpfad ueberwiegend QoS1-orientiert, aber nicht exakt einmal.
- Kritischer Driftpunkt: Queue-/Outbox-Drops koennen serverseitig als Datenluecke erscheinen.

## 3) E2E-Kette 2 - Config-Push und Config-Response

### 3.1 Flussbild

`Server config request -> MQTT config topic -> Core0 router -> g_config_update_queue -> Core1 parse/apply -> config_response -> Server -> DB/UI status`

### 3.2 Contract-Tabelle

| ID | Schritt | Owner | Garantiert | Nicht garantiert | Korrelation |
|---|---|---|---|---|---|
| FW-INT-CON-020 | Server sendet config mit `correlation_id` | Server | Request-Schema und Korrelation | erfolgreiche Apply auf Firmware | `correlation_id` |
| FW-INT-CON-021 | Core0 nimmt Config an und queued | Firmware/Core0 | Queue-Versuch inkl. Size-Check | Queue-full-freiheit | `correlation_id` |
| FW-INT-CON-022 | Core1 parse/apply | Firmware/Core1 | deterministischer Apply bei gueltiger Payload | parse-fail ist in IST nicht ueberall mit hartem NACK abgeschlossen | `correlation_id` |
| FW-INT-CON-023 | Firmware sendet `config_response` | Firmware | success/error response bei vielen Pfaden | garantierte response in allen Negativpfaden bisher lueckenhaft | `correlation_id` gespiegelt |
| FW-INT-CON-024 | Server korreliert response und aktualisiert Zustand | Server | Zustand pro Push als success/error klassifizierbar (wenn response empfangen) | Abschluss bei fehlender response nur timeout-basiert | `correlation_id` |
| FW-INT-CON-025 | DB/UI zeigen config status | Server+DB+UI | sichtbarer Status bei bekanntem Outcome | Unsicherheit bei Timeout ohne NACK | Request timeline |

### 3.3 Integrationsbewertung

- Dominanter Bruchpunkt: Parse-Fail/Queue-Full ohne durchgaengig normierten `error_code`.
- Verbindliche P1.7-Lesart: Jeder Config-Request braucht terminalen Ausgang `success|error|timeout`.

## 4) E2E-Kette 3 - Command/Response (Actuator und Sensor Measure)

### 4.1 Flussbild

`Server command -> MQTT command topic -> Core0 routing -> command queue -> Core1 execute -> response publish -> Server ingest -> DB/UI feedback`

### 4.2 Contract-Tabelle

| ID | Schritt | Owner | Garantiert | Nicht garantiert | Korrelation |
|---|---|---|---|---|---|
| FW-INT-CON-040 | Command wird serverseitig erzeugt | Server | definierter command payload | erfolgreiche Ausfuehrung am Geraet | `correlation_id` oder `request_id` |
| FW-INT-CON-041 | Ingress und Queue auf ESP | Firmware/Core0 | Routing nach Topicfamilie | Queue-full-freiheit | request key |
| FW-INT-CON-042 | Ausfuehrung auf Core1 | Firmware/Core1 | serialisierte Verarbeitung im Owner-Kontext | Response in jedem Failure-Pfad bei Queue-Drop | request key |
| FW-INT-CON-043 | Response-Publish | Firmware/Core0/Core1 | Response-Intent, Korrelation wird gespiegelt | Delivery-Endgueltigkeit bei Publish-Fail | `correlation_id`/`request_id` |
| FW-INT-CON-044 | Server Response-Korrelation | Server | Zuordnung bei empfangener response | stiller Verlust ohne expliziten NACK | gleiche ID |
| FW-INT-CON-045 | UI Bedienfeedback | Server->UI | Sicht auf bekannte command outcomes | kausale Sicherheit bei fehlender response | request timeline |

### 4.3 Integrationsbewertung

- Kritische Luecke: Command-Queue-Drop braucht harten NACK statt nur lokaler Telemetrie.
- OFFLINE_ACTIVE-Sonderfall bleibt stabil: server override priorisiert pro Aktor.

## 5) E2E-Kette 4 - Offline -> Reconnect -> ONLINE_ACKED

### 5.1 Flussbild

`Disconnect/ACK-timeout -> OFFLINE_GRACE -> OFFLINE_ACTIVE -> reconnect detected -> wait ACK -> offline reset + persist result -> ONLINE_ACKED -> server reconciliation complete`

### 5.2 Contract-Tabelle

| ID | Schritt | Owner | Garantiert | Nicht garantiert | Korrelation |
|---|---|---|---|---|---|
| FW-INT-CON-060 | Disconnect erkannt | Firmware | deterministischer Einstieg in Grace/Offline-Flow | eindeutige Root-Cause ohne Telemetrieerweiterung | `seq`, event type |
| FW-INT-CON-061 | Lokaler Offline-Betrieb aktiv | Firmware/Core1 | safety guards + Rule-Eval-Zyklus | Vollstaendige Transparenz ohne Pflichtevents | rule cycle counters |
| FW-INT-CON-062 | Reconnect erkannt | Firmware/Core0 | Uebergang in reconnect-wait | finaler Online-Exit ohne ACK | reconnect event |
| FW-INT-CON-063 | ACK-Verarbeitung | Server+Firmware | ACK kann Offline final beenden | Semantikgleichheit zwischen `server/status=online` und Heartbeat-ACK (soll nicht gleich sein) | ack source |
| FW-INT-CON-064 | Rule-Reset + Persistenzversuch | Firmware | Resetlogik vorhanden | driftfreie Persistenz bei Write-Fail | reset result |
| FW-INT-CON-065 | Reconciliation und Delta-Abschluss | Server | serverseitige Nachfuehrung moeglich | einheitlicher Abschlussvertrag ohne definierte Session-Regeln | reconciliation session id |
| FW-INT-CON-066 | UI Statuswechsel | Server->UI | Anzeige von online/offline | klare Trennung `link_online` vs `ack_online` falls nicht modelliert | status channel |

### 5.3 Integrationsbewertung

- ACK-Autoritaet muss final auf Heartbeat-ACK normiert bleiben.
- `server/status=online` bleibt Vor-Signal, nicht finales Konsistenzsignal.

## 6) Garantien vs Nicht-Garantien (querschnittlich)

| ID | Bereich | Garantiert | Nicht garantiert (ohne Folgearbeit) |
|---|---|---|---|
| FW-INT-CON-080 | Korrelation | `correlation_id`/`request_id` in Kernpfaden vorhanden | lueckenlose Korrelation bei Queue-Drop/Parse-Fail |
| FW-INT-CON-081 | Retry | einzelne Retry-Muster vorhanden (`safePublish` etc.) | global einheitlicher Retry-Vertrag mit NACK-Pflicht |
| FW-INT-CON-082 | QoS | Topicfamilien und effektive QoS weitgehend bekannt | dokumentationskonsistente QoS-Wahrheit fuer alle Pfade |
| FW-INT-CON-083 | Offline-Recovery | ACK-gesteuerter Rueckweg als Muster vorhanden | driftfreie Rueckfuehrung ohne Persistenz-/Signal-Luecken |

## 7) QoS- und Semantik-Drift (Risiko-Marker)

| ID | Driftpunkt | Auswirkung |
|---|---|---|
| FW-INT-CON-090 | `heartbeat/ack` Dokumentation vs effektive Subscription | falsche Erwartung zu Delivery-Sicherheit |
| FW-INT-CON-091 | `config_response` QoS-Darstellung uneinheitlich | Server-Retry kann falsch dimensioniert sein |
| FW-INT-CON-092 | `server/status=online` als ACK-Ersatz interpretiert | vorzeitiger ONLINE-Eindruck ohne echte Bestaetigung |
| FW-INT-CON-093 | Queue/Outbox-Drop nur teilbeobachtbar | fehlende Ende-zu-Ende Erklaerbarkeit bei Luecken |

## 8) Abschluss Block B

Die vier kritischen E2E-Ketten sind fuer P1.7 verbindlich modelliert. Die Stabilitaet ist im Positivpfad gut, die Integrationsschuld liegt in negativen Terminierungsfaellen (Queue-full, Parse-Fail, Outbox-Full) und in semantischer Trennung von Liveness vs ACK-Konsistenz.
