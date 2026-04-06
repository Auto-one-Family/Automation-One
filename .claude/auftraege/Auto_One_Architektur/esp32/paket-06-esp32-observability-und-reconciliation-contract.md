# Paket 06: ESP32 Observability- und Reconciliation-Contract (P1.6)

## 1) Ziel

Dieses Dokument deckt Block D und E ab:
- Pflichtmetriken und Pflicht-Events fuer Netzwerk-/Queue-/Persistenz-Failure.
- Reconciliation-Vertrag nach Disconnect/Reboot inkl. Drift-Behandlung.
- Priorisierte Risiken und Integrationsfragen fuer P1.7.

ID-Schema:
- Observability: `FW-NET-OBS-XXX`
- Reconciliation/Rest-Risiken: `FW-NET-REC-XXX`

## 2) Pflichtmetriken (FW-NET-OBS-XXX)

| ID | Metrik | Quelle im IST | Soll-Definition (verbindlich) | Safety-Bezug |
|---|---|---|---|---|
| FW-NET-OBS-001 | `queue_fill_rate_config` | Queue depth bekannt, kein kontinuierliches Metric | periodisch `% belegt` fuer `g_config_update_queue` | fruehe Erkennung Config-Stau |
| FW-NET-OBS-002 | `queue_fill_rate_cmd_actuator` | keine Metrik | `% belegt` fuer `g_actuator_cmd_queue` | Kommandoverlust-Risiko |
| FW-NET-OBS-003 | `queue_fill_rate_cmd_sensor` | keine Metrik | `% belegt` fuer `g_sensor_cmd_queue` | Mess-Trigger-Verlust |
| FW-NET-OBS-004 | `queue_fill_rate_publish` | keine Metrik | `% belegt` fuer `g_publish_queue` | Telemetrieverlust/Backpressure |
| FW-NET-OBS-005 | `queue_drop_config_total` | Log + `config_response`/`intent_outcome` bei full (kein reines Warn-only) | monotone Counter + reason (`FULL`,`TIMEOUT`) | Config-Determinismus |
| FW-NET-OBS-006 | `queue_drop_cmd_total` | Ingress: `intent_outcome` rejected `QUEUE_FULL`; weitere Outcomes in Command-Queues | Counter je command-queue + topic family | Command-Contract |
| FW-NET-OBS-007 | `publish_outbox_full_total` | Log + `publishIntentOutcome` im Drain bei msg_id<0; kritische Re-Queue bis 3 Versuche | Counter + topic family + qos | Delivery-Luecken sichtbar |
| FW-NET-OBS-008 | `nvs_write_fail_total` | teils Logs | Counter je Namespace/Key-Gruppe (`offline`,`system`,`sensor`) | Persistenzdrift |
| FW-NET-OBS-009 | `guard_skip_total` | Log-basiert | Counter pro Grund: `nan`,`stale`,`suspect`,`time_invalid`,`calibration_required` | lokale Rule-Sicherheit |
| FW-NET-OBS-010 | `ack_timeout_total` | Trigger vorhanden | Counter + letzter Ack-Alterwert | Connectivity-Degradation |
| FW-NET-OBS-011 | `registration_timeout_open_total` | vorhanden (log) | Counter fuer Gate-open ohne ACK | Online ohne harte Bestaetigung |

## 3) Pflicht-Events (FW-NET-OBS-1XX)

| ID | Event | Trigger | Pflichtfelder |
|---|---|---|---|
| FW-NET-OBS-101 | `DISCONNECTED` | MQTT disconnect, server offline, ACK-timeout | `reason`,`source_path`,`ts`,`seq`,`offline_rule_count` |
| FW-NET-OBS-102 | `OFFLINE_ACTIVE` | Grace abgelaufen | `grace_ms`,`rule_count`,`active_actuator_snapshot` |
| FW-NET-OBS-103 | `RECONNECTING` | reconnect waehrend OFFLINE_ACTIVE | `ts`,`seq`,`prev_mode` |
| FW-NET-OBS-104 | `ONLINE_ACKED` | valider ACK beendet OFFLINE/RECONNECTING | `ack_source`,`ts`,`seq`,`reset_persist_result` |
| FW-NET-OBS-105 | `PERSISTENCE_DRIFT` | Runtime!=persisted vermutet oder NVS-write fail in safety-kritischem Pfad | `namespace`,`field_group`,`runtime_state`,`persist_state_known`,`ts` |
| FW-NET-OBS-106 | `CONFIG_PUSH_FAILED` | queue full, parse fail, payload too large | `correlation_id`,`reason`,`error_code`,`ts` |
| FW-NET-OBS-107 | `COMMAND_DROPPED` | command queue full/drop | `topic_family`,`gpio`,`request_id|correlation_id`,`ts` |
| FW-NET-OBS-108 | `PUBLISH_DROPPED` | publish queue full oder outbox full | `topic_family`,`qos`,`path`(`queue|outbox`),`ts`,`detection_source` (`queue_enqueue|direct_publish|queue_drain`) |

## 4) Mapping Fehlerbilder -> Metrik/Event -> Safety-Wirkung

| Fehlerbild | Pflichtmetriken/Events | Erwartete Safety-Wirkung |
|---|---|---|
| Config-Queue full | OBS-001/005 + OBS-106 | kein stiller Config-Verlust: `QUEUE_FULL` auf `config_response` + `intent_outcome` |
| Config-Parse fail | OBS-106 + CON error response | deterministischer Re-Push: `JSON_PARSE_ERROR` + Intent-Outcome |
| Command-Queue full | OBS-002/003/006 + OBS-107 | Ingress sichtbar ueber `intent_outcome`; klassischer Response-Pfad kann fehlen — Server-Ingestion muss Stream konsumieren |
| Publish-Queue/Outbox full | OBS-004/007 + OBS-108 | Drain wertet Publish-Rueckgabe aus; kritische Publishes mit Re-Queue/Outcome — nicht-kritische ohne Outcome moeglich |
| NVS write fail (rule reset/state) | OBS-008 + OBS-105 | Drift wird als Degraded behandelt statt hidden |
| ACK timeout | OBS-010 + OBS-101 | reproduzierbarer Einstieg in P4 |
| ONLINE ohne ACK (Gate timeout) | OBS-011 + OBS-104 mit `ack_source=timeout` | klare Trennung zwischen "operativ" und "ack-bestaetigt" |
| Guard-skip (NaN/stale/suspect/time) | OBS-009 | Rule-Entscheidungen nachvollziehbar und auditierbar |

## 5) Reconciliation-Contract nach Stoerung (FW-NET-REC-XXX)

### 5.1 Verbindliche Reconciliation-Regeln

| ID | Regel | Status |
|---|---|---|
| FW-NET-REC-001 | Volatile Queues gelten nach Reboot als verloren und muessen serverseitig idempotent neu ausgespielt werden | sicher |
| FW-NET-REC-002 | Runtime-Cacheverlust (Sensor values, overrides) ist erwartet; OFFLINE-Rules duerfen nur mit frischen/gueltigen Guards aktivieren | sicher |
| FW-NET-REC-003 | OFFLINE->ONLINE Uebergang erst bei ACK plus Rule-Reset-Resultat | teilweise (ACK ja, Persistenzresultat nicht contractuell) |
| FW-NET-REC-004 | Bei NVS-Write-Fail safety-kritischer Felder wird Drift-Event erzeugt und Zustand als degraded markiert | offen |
| FW-NET-REC-005 | Config Pushes sind idempotent per `correlation_id`; duplicate push darf keinen unsafe Seiteneffekt erzeugen | teilweise |
| FW-NET-REC-006 | Queue-full/parse-fail erzeugen harte negative Antwort fuer kontrollierten Retry | teilweise (Config: erfuellt; Command: Intent-Outcome, nicht immer gleichwertig zum Response-Topic) |

### 5.2 Reconciliation-Sequenz (Sollbild)

1. **Disconnect erkannt** -> `DISCONNECTED` Event + Eintritt in Grace.
2. **Grace abgelaufen** -> `OFFLINE_ACTIVE` Event; lokale Rules nur mit Guard-Validitaet.
3. **Reconnect erkannt** -> `RECONNECTING` Event; lokale Rules bleiben aktiv.
4. **Server-ACK erhalten** -> Rule cleanup + Persistenzversuch.
5. **Persistenzresultat auswerten**:
   - success -> `ONLINE_ACKED`.
   - fail -> `PERSISTENCE_DRIFT`, degradierter ONLINE-Status bis Config/State-Repair.
6. **Server Delta-Replay** fuer volatile Verluste (commands/config confirmations) via idempotente Pushes.

## 6) Priorisierte Risiken (Block E)

| ID | Risiko | Prioritaet | Evidenzgrad | Impact |
|---|---|---|---|---|
| FW-NET-REC-901 | Config queue-full/parse-fail ohne deterministischen NACK | mittel | historisch kritisch; jetzt Response+Outcome | Rest: Server muss Stream/Timeouts alignen |
| FW-NET-REC-902 | Persistenzfail beim Offline-Reset ohne Drift-Event | kritisch | sicher | falscher Startzustand nach Reboot moeglich |
| FW-NET-REC-903 | Command-Verlust ohne serverseitig einheitliches Korrelationsbild | mittel | Ingress-Outcome vorhanden | Luecke: Response-Topic vs `intent_outcome` |
| FW-NET-REC-904 | Publish drops ohne vollstaendige E2E-Sicht | mittel | Drain+Outcome verbessert | nicht-kritische Publishes ohne Outcome |
| FW-NET-REC-905 | Gate-open via Timeout ohne ACK kann "online" semantisch ueberdehnen | hoch | teilweise | inkonsistente Online-Interpretation |
| FW-NET-REC-906 | QoS-Diskrepanz Doku vs Firmware (u. a. heartbeat/ack, config_response) | mittel | sicher | Fehlannahmen in Server-/Test-Vertrag |
| FW-NET-REC-907 | Legacy-No-Task Modus nicht timing-aequivalent zum RTOS-Pfad | mittel | sicher | reproduzierbarkeit reduziert |

## 7) Restluecken fuer P1.7 (integrationsabhaengig)

| ID | Restluecke | Warum erst P1.7 |
|---|---|---|
| FW-NET-REC-950 | Endgueltige ACK-Quelle/Autoritaet (`heartbeat/ack` vs `server/status=online`) | braucht schichtuebergreifenden Vertrag Server<->ESP |
| FW-NET-REC-951 | Globales QoS-Normalbild (pub/sub + effective QoS) | braucht Firmware+Broker+Server Handler Alignment |
| FW-NET-REC-952 | Einheitliche Error-Code-Mappings fuer Queue/Parse/Outbox ueber API/DB/UI | braucht End-to-End Fehlerkanal bis Frontend |
| FW-NET-REC-953 | Delta-Replay Strategie fuer verlorene volatile Befehle nach Reboot | braucht Server-Queueing/Replay-Policy |
| FW-NET-REC-954 | Persistenzdrift-Warnungen in UI/Operations | braucht WebSocket/Event-Vertrag (Server-Ingestion fuer `system/intent_outcome` inkl.) |

## 8) Integrationsfragen an Server/DB/UI

1. Soll `server/status=online` nur Liveness signalisieren oder gleichwertig als ACK fuer OFFLINE-Exit gelten?
2. Welcher Error-Code-Katalog wird fuer `QUEUE_FULL`, `PARSE_FAIL`, `OUTBOX_FULL`, `NVS_WRITE_FAIL` endgueltig schichtuebergreifend genutzt?
3. Muss der Server Config-Push bei fehlendem `config_response` nach Timeout zwingend retryen, und mit welchem Backoff?
4. Wie werden command drops (`request_id` fehlt Response) serverseitig erkannt und erneut gesendet?
5. Welches UI-/Ops-Signal zeigt `PERSISTENCE_DRIFT` an, damit kein falsches ONLINE-Vertrauen entsteht?
6. Soll ONLINE in der UI zweistufig sein (`link_online` vs `ack_online`)?

## 9) Kurzfazit Block D/E

Die Firmware hat bereits starke Safety-Mechanismen fuer Offline-Betrieb und ACK-gesteuerten Re-Entry. Config-Negativpfade und ein Grossteil der Publish-Fehlerpfade sind ueber `config_response` und `system/intent_outcome` deutlich besser sichtbar als frueher. Fuer deterministische Reconciliation fehlen vor allem: einheitliche Server-/UI-Auswertung dieses Streams, Persistenzresultat beim Offline-Reset, und die strikte Trennung Liveness vs ACK. Genau diese Punkte bleiben die kritischen Uebergaben in P1.7.

## 10) Direkte Antwort auf Leitfragen 4 und 5

Frage 4: **Wie werden Queue-full, Parse-Fail und Outbox-Full beobachtbar und reproduzierbar behandelt?**
- Config-Queue-full und Parse-Fail terminieren mit spezifischen `config_response`-Codes und `system/intent_outcome`.
- Command-Queue-full am Ingress erzeugt `intent_outcome` rejected `QUEUE_FULL`; gleichwertigkeit zum klassischen Command-Response ist schichtuebergreifend zu vertraglich festzulegen.
- Publish: Queue-full loggt und markiert kritische Publishes per Intent-Outcome; Drain wertet `esp_mqtt_client_publish` aus und erzeugt bei Fehlschlag Outcomes nach Retry-Policy.
- Der Observability-Contract in Abschnitt 2/3 bleibt relevant fuer kanonische Counter und UI/DB-Spiegelung dieser Ereignisse.

Frage 5: **Wie wird ONLINE nach Stoerung nur mit konsistentem ACK-/Sync-Stand erreicht?**
- Ist-Regel: OFFLINE wird erst durch ACK beendet (`heartbeat/ack` oder aktuell auch `server/status=online` als Trigger).
- Soll-Regel: `ONLINE_ACKED` gilt erst, wenn ACK plus Persistenzresultat des Rule-Resets explizit erfolgreich sind; sonst `PERSISTENCE_DRIFT`.
- Reconciliation verlangt serverseitiges Delta-Replay fuer verlorene volatile Queues nach Reboot/Disconnect.
- P1.7 muss dafuer die ACK-Autoritaet, Error-Code-Mappings und Replay-Vertraege schichtuebergreifend finalisieren.
