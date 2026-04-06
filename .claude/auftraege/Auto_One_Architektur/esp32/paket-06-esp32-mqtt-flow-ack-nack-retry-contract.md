# Paket 06: ESP32 MQTT-Flow sowie ACK/NACK- und Retry-Contract (P1.6)

## 1) Ziel

Dieses Dokument deckt Block B und C ab:
- MQTT-Topicfamilien und effektives Delivery-Verhalten.
- Queue-/Outbox-Pfade inkl. Verlustsemantik.
- Verbindlicher ACK/NACK-, Retry- und Korrelation-Contract fuer Config/Command/Publish.

ID-Schema:
- Flow-Matrix: `FW-NET-FLOW-XXX`
- Contract: `FW-NET-CON-XXX`

## 2) Topicfamilien und effektive QoS-Sicht

| Familie | Richtung | Beispieltopic | Effektive QoS in Firmware | Bemerkung |
|---|---|---|---|---|
| Sensor Data | ESP->Server | `.../sensor/{gpio}/data` | 1 | Core1 erzeugt, ueber Publish-Queue zu Core0 |
| Sensor Command | Server->ESP | `.../sensor/{gpio}/command` | 1 (Subscribe-IST in `main.cpp`; Referenz `.claude/reference/api/MQTT_TOPICS.md` v2.13: Server-Publish QoS 2) | Queue Core0->Core1; bei Queue-full `publishIntentOutcome` rejected `QUEUE_FULL` (Topic `.../system/intent_outcome`), kein klassischer `/response`-NACK |
| Sensor Response | ESP->Server | `.../sensor/{gpio}/response` | 1 | nur wenn `request_id` im Command enthalten |
| Actuator Command | Server->ESP | `.../actuator/{gpio}/command` | 1 (Subscribe-IST; Referenz MQTT_TOPICS: QoS 2) | Queue Core0->Core1, server_override in OFFLINE_ACTIVE; Queue-full → `intent_outcome` rejected `QUEUE_FULL` am Ingress |
| Actuator Response | ESP->Server | `.../actuator/{gpio}/response` | 1 | `correlation_id` wird gespiegelt falls vorhanden |
| Actuator Status/Alert | ESP->Server | `.../actuator/{gpio}/status|alert` | 1 | `safePublish`, nicht strikt exactly-once |
| Config Push | Server->ESP | `.../config` | Subscribe QoS 1 in Firmware (`subscribeToAllTopics`; Referenz MQTT_TOPICS: QoS 2) | Payload-Grenze `CONFIG_PAYLOAD_MAX_LEN` 4096 (Enqueue ab `>=4096` abgewiesen), dann ERROR-Response + Intent-Outcome |
| Config Response | ESP->Server | `.../config_response` | 1 (`ConfigResponseBuilder`/`safePublish` mit qos=1) | Referenz MQTT_TOPICS v2.13: QoS 2 — Drift bewusst zwischen Referenz und IST-Publish |
| Heartbeat | ESP->Server | `.../system/heartbeat` | 0 | best effort |
| Heartbeat ACK | Server->ESP | `kaiser/god/esp/{esp_id}/system/heartbeat/ack` | Subscribe-IST: Aufruf ohne QoS-Arg → Default 0 (`mqtt_client.h`); Referenz: Server-Publish QoS 1 — effektive Delivery gemaess Broker min(pub,sub) | Drift-Punkt bleibt bis explizites `subscribe(..., 1)` |
| Server Status (LWT) | Server->ESP | `kaiser/god/server/status` (global, nicht pro ESP) | 1 | fruehes offline/online Signal fuer P4/P1 |
| Zone/Subzone ACK | ESP->Server | `.../zone/ack`, `.../subzone/ack` | meist 1 | mit optional `correlation_id` |

## 3) MQTT-/Queue-Flow-Matrix (FW-NET-FLOW-XXX)

| ID | Pfad | Queue/Outbox | Vollstand-/Fehlerverhalten | Verlustsemantik |
|---|---|---|---|---|
| FW-NET-FLOW-001 | Core1 Publish -> Core0 -> Broker (ESP-IDF) | `g_publish_queue` (15) + ESP-IDF outbox | Queue full: Drop + ggf. `publishIntentOutcome` (`publish_queue.cpp`); Drain (`processPublishQueue`) wertet `esp_mqtt_client_publish` aus: msg_id<0 → `OUTBOX_FULL`/`EXECUTE_FAIL`, kritische Messages bis 3x re-queue, sonst `publishIntentOutcome` | **Drop nur nach definiertem Retry/Outcome-Pfad (nicht mehr teil-silent)** |
| FW-NET-FLOW-002 | Config inbound -> Core0 Router -> Core1 ConfigQueue | `g_config_update_queue` (5, 100ms wait) | queue full: `queueConfigUpdateWithMetadata` false → `ConfigResponseBuilder::publishError(..., ConfigErrorCode::QUEUE_FULL, ...)` + `publishIntentOutcome` rejected `QUEUE_FULL` | **deterministischer Error-Response + Intent-Stream** |
| FW-NET-FLOW-003 | ConfigQueue drain -> JSON parse -> Handler | kein zusaetzlicher Puffer | parse fail: `ConfigResponseBuilder::publishError(..., JSON_PARSE_ERROR, ...)` + `publishIntentOutcome` failed `JSON_PARSE_ERROR` | **deterministischer NACK ueber config_response + intent_outcome** |
| FW-NET-FLOW-004 | Actuator command inbound | `g_actuator_cmd_queue` (10) | Enqueue fail: Router `publishIntentOutcome` rejected `QUEUE_FULL`; bei Verarbeitung Drop/Expiry zusaetzliche Outcomes in `actuator_command_queue.cpp` | **kein stilles Drop auf Ingress; kein klassisches actuator/response fuer reines Queue-full** |
| FW-NET-FLOW-005 | Sensor command inbound | `g_sensor_cmd_queue` (10) | analog Actuator: Ingress `publishIntentOutcome` bei Queue-full; weitere Outcomes in `sensor_command_queue.cpp` | **analog FW-NET-FLOW-004** |
| FW-NET-FLOW-006 | Sensor command response | direkt publish QoS1 | nur bei `request_id`; publish kann an Gate/Queue/Outbox scheitern | **best effort mit response-intent** |
| FW-NET-FLOW-007 | Actuator response | `safePublish` QoS1 | Implementierung: hoechstens zwei Publish-Versuche (zweiter nach `yield()`); Parameter `retries` in Signatur derzeit ungenutzt | **begrenztes Retry, dann fail** |
| FW-NET-FLOW-008 | Config response | `safePublish` QoS1 | wie FW-NET-FLOW-007 | **begrenztes Retry, dann fail** |
| FW-NET-FLOW-009 | Heartbeat publish | direkt QoS0 | bei Disconnect/Gate blockbar | **best effort** |
| FW-NET-FLOW-010 | Registration Gate vor Publish | interner gate flag | blockiert Nicht-Heartbeat bis ACK oder 10s timeout | **skip/block bis Gate offen** |
| FW-NET-FLOW-011 | PubSubClient fallback (seeed/wokwi) | offline_buffer (25) | buffer full -> `ERROR_MQTT_BUFFER_FULL` | **buffer+retry/backoff, dann drop** |

## 4) Effektive Backoff-/Retry-Regeln

| Bereich | Regel IST | Bewertung |
|---|---|---|
| WiFi reconnect | 30s Intervall + CircuitBreaker (10 fail -> 60s open) | stabil, deterministisch |
| MQTT reconnect (ESP-IDF) | auto-reconnect in Client, CB zaehlt Fehler | solide, aber outbox opaque |
| MQTT reconnect (PubSubClient) | exponentieller Backoff 1s..60s, max durch CB | klar |
| `safePublish` | bis zu zwei Publish-Versuche (zweiter nach `yield()`); `retries`-Argument in API ungenutzt | begrenzt robust; Signatur irrefuehrend |
| Config Queue | 100ms enqueue wait, danach drop | nicht deterministisch ohne NACK |

## 5) ACK/NACK-Contract (FW-NET-CON-XXX)

### 5.1 Config Contract

| ID | Contract | IST-Status |
|---|---|---|
| FW-NET-CON-001 | Jeder gueltig empfangene Config-Push endet in `config_response` (`success|partial_success|error`) | **teilweise** |
| FW-NET-CON-002 | `correlation_id` aus Push wird in Response gespiegelt | **sicher** (wenn parse erfolgreich) |
| FW-NET-CON-003 | Payload >4096 erzeugt deterministisches Error-Response (`PAYLOAD_TOO_LARGE`) | **sicher** |
| FW-NET-CON-004 | Queue-full im Config-Ingress erzeugt expliziten Error-Response | **sicher** (`ConfigErrorCode::QUEUE_FULL` + `publishIntentOutcome`) |
| FW-NET-CON-005 | Parse-Fail im Core1-Queue-Worker erzeugt expliziten Error-Response | **sicher** (`JSON_PARSE_ERROR` + Intent-Outcome) |
| FW-NET-CON-006 | Config-Response-Delivery ist mindestens-at-least-once | **teilweise** (`safePublish` 1 retry, sonst drop) |

### 5.2 Command Contract

| ID | Contract | IST-Status |
|---|---|---|
| FW-NET-CON-020 | Actuator command hat deterministische Success/Error-Response | **teilweise** (Ingress Queue-full: `intent_outcome`, kein `/response`; nach Enqueue weiterhin handler-abhaengig) |
| FW-NET-CON-021 | Actuator response spiegelt `correlation_id` | **sicher** |
| FW-NET-CON-022 | Sensor command `measure` hat Response mit `request_id`, falls angefordert | **sicher** |
| FW-NET-CON-023 | Queue-full fuer sensor/actuator command wird als NACK telemetriert | **teilweise** (`system/intent_outcome` rejected `QUEUE_FULL` am Ingress; nicht gleichbedeutend mit dediziertem Sensor-/Actuator-Response-Topic) |
| FW-NET-CON-024 | Unbekannter Command wird explizit als Error geantwortet | **teilweise** (Handler-abh.) |

### 5.3 Reconnect-/ONLINE Contract

| ID | Contract | IST-Status |
|---|---|---|
| FW-NET-CON-040 | OFFLINE endet nur bei ACK-Signal (`heartbeat/ack` oder `server/status=online`) | **sicher** |
| FW-NET-CON-041 | Reconnect ohne ACK bleibt in `RECONNECTING/OFFLINE_ACTIVE` | **sicher** |
| FW-NET-CON-042 | Offline-Rule-Reset wird beim ACK persistiert | **sicher**, aber NVS-fail nur geloggt |
| FW-NET-CON-043 | NVS-Write-Fail bei Rule-Reset erzeugt hartes Drift-Event/NACK | **offen** |

## 6) Korrelation, Idempotenz, Fehlercodes

| Thema | IST | Bewertung |
|---|---|---|
| `correlation_id` (Config/Actuator/Zone/Subzone) | weitgehend durchgezogen | gut |
| `request_id` (Sensor measure) | vorhanden | gut |
| Publish-`seq` | monotone Sequenz ueber `getNextSeq()` | gut |
| Idempotente Config-Replays | weitgehend moeglich (full-state push), aber queue/parse-fail ohne harten NACK | teilweise |
| Dedizierte Fehlercodes | vorhanden (ConfigErrorCode + `error_codes.h`) | gut, aber nicht in allen Fail-Pfaden gesendet |

## 7) Verbindlicher P1.6-Soll-Contract (zur Schliessung der Luecken)

**IST-Abgleich (Firmware, Stand geprueft gegen Repo):** `FW-NET-CON-SOLL-001` und `FW-NET-CON-SOLL-002` sind im Config-Pfad umgesetzt (`QUEUE_FULL`, `JSON_PARSE_ERROR`). `FW-NET-CON-SOLL-003` ist teilweise umgesetzt ueber `publishIntentOutcome` am Command-Ingress; verbleibende Luecke: kanonische Korrelation/Spiegelung im gleichen Kanal wie klassische Command-Responses.

1. `FW-NET-CON-SOLL-001`: `queueConfigUpdate()==false` MUSS sofort `config_response{status:error,error_code:QUEUE_FULL,correlation_id}` publizieren (statt generischem `UNKNOWN_ERROR`). — **Firmware: erfuellt**
2. `FW-NET-CON-SOLL-002`: JSON-Parse-Fail im Config-Worker MUSS deterministisch `config_response{status:error,error_code:PARSE_FAIL}` senden. — **Firmware: erfuellt** (Code `JSON_PARSE_ERROR`)
3. `FW-NET-CON-SOLL-003`: Sensor-/Actuator-Command-Queue-Full MUSS NACK-Event/Response mit `request_id` oder synthetic correlation erzeugen. — **teilweise** (Intent-Outcome-Stream)
4. `FW-NET-CON-SOLL-004`: ONLINE_ACKED gilt erst nach positivem ACK plus dokumentiertem Persistenzresultat des Offline-Resets.
5. `FW-NET-CON-SOLL-005`: QoS-Truth (Code vs Doku, inkl. `.claude/reference/api/MQTT_TOPICS.md`) MUSS auf eine normierte, testbare Tabelle vereinheitlicht werden.

## 8) Hauptrisiken aus Block B/C

| ID | Risiko | Prioritaet | Evidenz |
|---|---|---|---|
| FW-NET-CON-901 | Config parse/queue Fail ohne garantierten NACK | mittel | historisch kritisch; Parse/Queue-full jetzt mit Response+Outcome abgedeckt |
| FW-NET-CON-902 | Command drops bei Queue-full ohne serverseitig einheitlichen Response-Kanal | mittel | Ingress: Intent-Outcome `QUEUE_FULL`; Schwelle zu klassischem Command-Response bleibt |
| FW-NET-CON-903 | Publish queue/outbox drops ohne Ende-zu-Ende ACK; Sichtbarkeit verbessert durch Drain-Auswertung und `publishIntentOutcome` | mittel | Rest-Risiko: Delivery-Garantie Broker/Server |
| FW-NET-CON-904 | QoS-Drift zwischen Referenzdoku und effective subscription (z. B. heartbeat/ack) | hoch | sicher |
| FW-NET-CON-905 | ACK-Ersatz ueber `server/status=online` semantisch nicht strikt vom Heartbeat-ACK getrennt | mittel | teilweise |

## 9) Kurzfazit Block B/C

Die Firmware besitzt robuste Grundmuster (Core-Trennung, ACK-gesteuerter Offline-Exit, Korrelation). Config-Negativpfade (Queue-full, Parse-Fail, Payload-Limits) sind inzwischen ueber `config_response` und `system/intent_outcome` weitgehend terminalisiert. Der kritische Rest liegt in Schichten-Bruecken: Command-Queue-full vs klassischer Response-Kanal, Outbox-/Broker-Endgueltigkeit, QoS-Referenz vs Subscribe/Publish-IST, und Persistenzresultat beim Offline-Reset.

## 10) Direkte Antwort auf Leitfragen 2 und 3

Frage 2: **Welche MQTT-Topicfamilien, QoS-, Queue-, Timeout- und Backoff-Regeln gelten effektiv?**
- Topicfamilien sind in Abschnitt 2 vollstaendig klassifiziert (Sensor, Command, Config, Heartbeat, Status, Response).
- Effektive QoS folgt dem Firmwarepfad: Sensor/Commands/Config-Subscribe ueberwiegend QoS1 im `subscribeToAllTopics`-IST; Heartbeat QoS0; `heartbeat/ack` Subscribe ohne explizites QoS → Default 0 (Referenzdoku sieht haeufig QoS2/1 fuer Server-Publish vor — Abgleich siehe MQTT_TOPICS.md).
- Queuepfade sind strikt Core-uebergreifend getrennt (Core0->Core1 fuer Config/Commands, Core1->Core0 fuer Publish) mit dokumentierten Vollstandsfolgen.
- Zeit-/Backoff-Regeln sind belegt: ACK-timeout 120s, Offline-Grace 30s, Registration-Gate 10s, WiFi-Reconnect 30s, MQTT persistent-failure 5min.

Frage 3: **Welche ACK/NACK- und Retry-Vertraege sind fuer Config/Command/Publish wirklich garantiert?**
- Garantiert: positive Config-/Command-Responses nur wenn Nachricht verarbeitet und Publish erfolgreich genug ist (best effort mit `safePublish` retry=1).
- Garantiert (Config): Queue-full und Parse-Fail terminieren mit spezifischen Error-Codes und Intent-Outcome.
- Teilweise garantiert (Command): Queue-full am Ingress erzeugt `publishIntentOutcome` rejected `QUEUE_FULL`; Abgleich mit Server-Ingestion und klassischem Command-Response ist integrationsabhaengig.
- Nicht garantiert: End-to-end Delivery bis Server/DB fuer alle Pfade; Broker- und Handler-Semantik bleiben ausserhalb Firmware.
- Nicht garantiert: `safePublish`-Endgueltigkeit nach Retry-Limit; Parameter `retries` in der API spiegelt das IST-Verhalten nicht wider.
