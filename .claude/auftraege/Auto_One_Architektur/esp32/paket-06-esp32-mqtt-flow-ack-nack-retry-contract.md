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
| Sensor Command | Server->ESP | `.../sensor/{gpio}/command` | 1 (subscribe) | Queue Core0->Core1, Queue-full aktuell ohne expliziten NACK |
| Sensor Response | ESP->Server | `.../sensor/{gpio}/response` | 1 | nur wenn `request_id` im Command enthalten |
| Actuator Command | Server->ESP | `.../actuator/{gpio}/command` | 1 (subscribe) | Queue Core0->Core1, server_override in OFFLINE_ACTIVE |
| Actuator Response | ESP->Server | `.../actuator/{gpio}/response` | 1 | `correlation_id` wird gespiegelt falls vorhanden |
| Actuator Status/Alert | ESP->Server | `.../actuator/{gpio}/status|alert` | 1 | `safePublish`, nicht strikt exactly-once |
| Config Push | Server->ESP | `.../config` | Subscribe 1 (effektiv min(pub,sub)) | Payload-Grenze 4096, dann ERROR-Response |
| Config Response | ESP->Server | `.../config_response` | 1 (safePublish mit qos=1) | kontrastiert zu Dokuangaben QoS2 |
| Heartbeat | ESP->Server | `.../system/heartbeat` | 0 | best effort |
| Heartbeat ACK | Server->ESP | `.../system/heartbeat/ack` | subscribe default 0 | im Code ohne QoS-Argument subscribe() |
| Server Status (LWT) | Server->ESP | `.../server/status` | 1 | fruehes offline/online Signal fuer P4/P1 |
| Zone/Subzone ACK | ESP->Server | `.../zone/ack`, `.../subzone/ack` | meist 1 | mit optional `correlation_id` |

## 3) MQTT-/Queue-Flow-Matrix (FW-NET-FLOW-XXX)

| ID | Pfad | Queue/Outbox | Vollstand-/Fehlerverhalten | Verlustsemantik |
|---|---|---|---|---|
| FW-NET-FLOW-001 | Core1 Publish -> Core0 -> Broker (ESP-IDF) | `g_publish_queue` (15) + ESP-IDF outbox | Queue full: Drop + warn + CB fail; Queue-Drain (`processPublishQueue`) wertet `esp_mqtt_client_publish` Rueckgabe derzeit nicht aus | **drop, bei Outbox-Fehler im Drain-Pfad teil-silent** |
| FW-NET-FLOW-002 | Config inbound -> Core0 Router -> Core1 ConfigQueue | `g_config_update_queue` (5, 100ms wait) | queue full: `queueConfigUpdate` false; Router sendet `config_response` error (`UNKNOWN_ERROR`) mit best-effort correlation | **drop + error-response (teilweise deterministisch)** |
| FW-NET-FLOW-003 | ConfigQueue drain -> JSON parse -> Handler | kein zusaetzlicher Puffer | parse fail: Handler nicht aufgerufen, aktuell kein garantiertes error `config_response` | **drop ohne deterministischen NACK** |
| FW-NET-FLOW-004 | Actuator command inbound | `g_actuator_cmd_queue` (10, non-blocking send) | xQueueSend Rueckgabe ungenutzt | **silent drop moeglich** |
| FW-NET-FLOW-005 | Sensor command inbound | `g_sensor_cmd_queue` (10, non-blocking send) | xQueueSend Rueckgabe ungenutzt | **silent drop moeglich** |
| FW-NET-FLOW-006 | Sensor command response | direkt publish QoS1 | nur bei `request_id`; publish kann an Gate/Queue/Outbox scheitern | **best effort mit response-intent** |
| FW-NET-FLOW-007 | Actuator response | `safePublish` QoS1 | ein Retry-Versuch, danach fail | **retry(1) dann drop** |
| FW-NET-FLOW-008 | Config response | `safePublish` QoS1 | ein Retry-Versuch, danach fail | **retry(1) dann drop** |
| FW-NET-FLOW-009 | Heartbeat publish | direkt QoS0 | bei Disconnect/Gate blockbar | **best effort** |
| FW-NET-FLOW-010 | Registration Gate vor Publish | interner gate flag | blockiert Nicht-Heartbeat bis ACK oder 10s timeout | **skip/block bis Gate offen** |
| FW-NET-FLOW-011 | PubSubClient fallback (seeed/wokwi) | offline_buffer (25) | buffer full -> `ERROR_MQTT_BUFFER_FULL` | **buffer+retry/backoff, dann drop** |

## 4) Effektive Backoff-/Retry-Regeln

| Bereich | Regel IST | Bewertung |
|---|---|---|
| WiFi reconnect | 30s Intervall + CircuitBreaker (10 fail -> 60s open) | stabil, deterministisch |
| MQTT reconnect (ESP-IDF) | auto-reconnect in Client, CB zaehlt Fehler | solide, aber outbox opaque |
| MQTT reconnect (PubSubClient) | exponentieller Backoff 1s..60s, max durch CB | klar |
| `safePublish` | max 1 Wiederholversuch (yield-basiert, kein delay) | begrenzt robust |
| Config Queue | 100ms enqueue wait, danach drop | nicht deterministisch ohne NACK |

## 5) ACK/NACK-Contract (FW-NET-CON-XXX)

### 5.1 Config Contract

| ID | Contract | IST-Status |
|---|---|---|
| FW-NET-CON-001 | Jeder gueltig empfangene Config-Push endet in `config_response` (`success|partial_success|error`) | **teilweise** |
| FW-NET-CON-002 | `correlation_id` aus Push wird in Response gespiegelt | **sicher** (wenn parse erfolgreich) |
| FW-NET-CON-003 | Payload >4096 erzeugt deterministisches Error-Response (`PAYLOAD_TOO_LARGE`) | **sicher** |
| FW-NET-CON-004 | Queue-full im Config-Ingress erzeugt expliziten Error-Response | **teilweise** (Response wird gesendet, Error-Code aktuell generisch `UNKNOWN_ERROR`) |
| FW-NET-CON-005 | Parse-Fail im Core1-Queue-Worker erzeugt expliziten Error-Response | **offen** (TODO vorhanden) |
| FW-NET-CON-006 | Config-Response-Delivery ist mindestens-at-least-once | **teilweise** (`safePublish` 1 retry, sonst drop) |

### 5.2 Command Contract

| ID | Contract | IST-Status |
|---|---|---|
| FW-NET-CON-020 | Actuator command hat deterministische Success/Error-Response | **teilweise** (bei Queue-Drop keine Response) |
| FW-NET-CON-021 | Actuator response spiegelt `correlation_id` | **sicher** |
| FW-NET-CON-022 | Sensor command `measure` hat Response mit `request_id`, falls angefordert | **sicher** |
| FW-NET-CON-023 | Queue-full fuer sensor/actuator command wird als NACK telemetriert | **offen** |
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

1. `FW-NET-CON-SOLL-001`: `queueConfigUpdate()==false` MUSS sofort `config_response{status:error,error_code:QUEUE_FULL,correlation_id}` publizieren (statt generischem `UNKNOWN_ERROR`).
2. `FW-NET-CON-SOLL-002`: JSON-Parse-Fail im Config-Worker MUSS deterministisch `config_response{status:error,error_code:PARSE_FAIL}` senden.
3. `FW-NET-CON-SOLL-003`: Sensor-/Actuator-Command-Queue-Full MUSS NACK-Event/Response mit `request_id` oder synthetic correlation erzeugen.
4. `FW-NET-CON-SOLL-004`: ONLINE_ACKED gilt erst nach positivem ACK plus dokumentiertem Persistenzresultat des Offline-Resets.
5. `FW-NET-CON-SOLL-005`: QoS-Truth (Code vs Doku) MUSS auf eine normierte, testbare Tabelle vereinheitlicht werden.

## 8) Hauptrisiken aus Block B/C

| ID | Risiko | Prioritaet | Evidenz |
|---|---|---|---|
| FW-NET-CON-901 | Config parse/queue Fail ohne garantierten NACK | kritisch | sicher |
| FW-NET-CON-902 | Silent command drops bei Queue-full | hoch | sicher |
| FW-NET-CON-903 | Publish queue/outbox drops ohne Ende-zu-Ende ACK; Outbox-Fehler im Queue-Drain derzeit nur begrenzt sichtbar | hoch | sicher |
| FW-NET-CON-904 | QoS-Drift zwischen Referenzdoku und effective subscription (z. B. heartbeat/ack) | hoch | sicher |
| FW-NET-CON-905 | ACK-Ersatz ueber `server/status=online` semantisch nicht strikt vom Heartbeat-ACK getrennt | mittel | teilweise |

## 9) Kurzfazit Block B/C

Die Firmware besitzt robuste Grundmuster (Core-Trennung, ACK-gesteuerter Offline-Exit, Korrelation). Der kritische Rest liegt in deterministischen Negativpfaden: Queue-full/Parse-fail/Outbox-full sind heute nicht ueberall als harter ACK/NACK-Contract abgesichert.

## 10) Direkte Antwort auf Leitfragen 2 und 3

Frage 2: **Welche MQTT-Topicfamilien, QoS-, Queue-, Timeout- und Backoff-Regeln gelten effektiv?**
- Topicfamilien sind in Abschnitt 2 vollstaendig klassifiziert (Sensor, Command, Config, Heartbeat, Status, Response).
- Effektive QoS folgt dem Firmwarepfad: Sensor/Commands/Responses ueberwiegend QoS1, Heartbeat QoS0, `heartbeat/ack` Subscription aktuell Default-QoS0.
- Queuepfade sind strikt Core-uebergreifend getrennt (Core0->Core1 fuer Config/Commands, Core1->Core0 fuer Publish) mit dokumentierten Vollstandsfolgen.
- Zeit-/Backoff-Regeln sind belegt: ACK-timeout 120s, Offline-Grace 30s, Registration-Gate 10s, WiFi-Reconnect 30s, MQTT persistent-failure 5min.

Frage 3: **Welche ACK/NACK- und Retry-Vertraege sind fuer Config/Command/Publish wirklich garantiert?**
- Garantiert: positive Config-/Command-Responses nur wenn Nachricht verarbeitet und Publish erfolgreich genug ist (best effort mit `safePublish` retry=1).
- Teilweise garantiert: Config-Queue-Full erzeugt bereits Error-Response, aber mit generischem `UNKNOWN_ERROR`.
- Nicht garantiert: Parse-Fail im Core1-Config-Worker hat keinen verpflichtenden negativen Response-Pfad.
- Nicht garantiert: Queue-full bei Sensor-/Actuator-Commands hat keinen harten NACK-Contract (nur lokales Logging/ErrorTracker).
- Nicht garantiert: End-to-end Delivery fuer Core1-Publishes bei Outbox-Problemen, da Queue-Drain-Rueckgabecodes derzeit nicht ausgewertet werden.
