# Bericht: Offline-Mode Loganalyse (letzte 10 Minuten)

**Datum:** 2026-04-20  
**Adressat:** Technical Manager  
**Scope:** Docker-Stack (Server, MQTT, MQTT-Logger, Frontend, Monitoring) mit Fokus auf Offline-Mode, Reconnect, State-/Config-Sync und gefuehlte UI-Verzoegerung.

## Executive Summary

Der Offline-Mode ist funktional stabil und der Reconnect-Pfad arbeitet grundsaetzlich wie gewuenscht (ESP bleibt aktiv, reconnectt, Session-Reconciliation erfolgreich). Die aktuell relevanten Luecken sind **nicht** ein grundlegender Ausfall, sondern ein Zusammenspiel aus:

1. **Konfliktverhalten bei gleichzeitigen Regeln** (`first_wins`) auf demselben Aktor.
2. **Kurzzeitiger Publish-Queue-Engpass** auf ESP-Seite (`error_code=4062`, "Publish queue full"), inklusive nachweisbarer Queue-Shed/Drop-Inkremente.
3. **Monitoring-/UX-Signalproblem**: mehrere Logs sehen wie Fehler aus, sind aber normal (Healthcheck-Disconnects, stale-Guard, Alerting-Queries mit "ERROR" im Query-Text).

Wichtig: In den Server-/MQTT-Logs sind die zwei Aktor-Status bei simultanem Trigger meist innerhalb derselben Sekunde vorhanden; die wahrgenommene 5-10s Differenz ist damit eher **Darstellungs-/Propagationsverhalten** als ein eindeutiger Core-State-Write-Delay.

Zusatz aus dieser Revision: Neben den bereits benannten Befunden gibt es zwei praezise Cross-Layer-Kanten, die fuer "wirkt instabil"-Wahrnehmung sorgen koennen, obwohl der Kernpfad laeuft: (a) Finalisierungszuordnung bei Config-Responses mit fehlender/ersetzter Korrelation und (b) zu grobe Error-Semantik fuer `4062` zwischen Firmware/Server/UI.

## Methodik

- Laufende Container geprueft (`docker ps`) und auf Health evaluiert.
- Logs der letzten 10 Minuten aus allen relevanten Services gezogen.
- Korrelation nach Zeitstempel zwischen:
  - `automationone-server`
  - `automationone-mqtt`
  - `automationone-mqtt-logger`
  - `automationone-frontend`
  - Monitoring/DB-Container (Loki/Grafana/Postgres) zur Abgrenzung von "echtem Fehler" vs "Signalrauschen".

## Befunde mit Belegen

### 1) Gleichzeitige Regeltrigger erzeugen Aktor-Konflikt (WARN), nicht Systemabsturz

**Evidenz (Server):**
- `2026-04-20 16:59:51` `Conflict on ESP_EA5484:14 ... blocked ... (lower priority 50 vs 10)`
- `2026-04-20 16:59:51` `Actuator conflict for rule TestTimmsRegen ... first_wins`

**Bewertung:**
- Das ist fachlich konsistent mit Prioritaets-/Konfliktlogik.
- Fuer Operator-Wahrnehmung wirkt es aber wie Instabilitaet, wenn nicht klar als "deterministische Konfliktaufloesung" markiert.

**Codebeleg (Server):**
- `El Servador/god_kaiser_server/src/services/logic/safety/conflict_manager.py`
  - Gleichstand wird deterministisch per `rule_id` aufgeloest (nicht FIFO-Zufall).
  - Bei niedrigerer Prioritaet bleibt `ConflictResolution.FIRST_WINS` und es wird genau die Warnung emittiert, die im Log erscheint (`Conflict on ... blocked ...`).
  - Damit ist der Konfliktpfad erwartetes Arbitration-Verhalten, kein Deadlock-/Crash-Indikator.

### 2) Queue-Engpass im gleichen Zeitfenster wie Doppel-Trigger

**Evidenz (MQTT-Logger + Server + DB):**
- `2026-04-20T17:02:40+0000` `system/error` mit `error_code=4062`, `message="Publish queue full"`.
- Parallel im Server: `Error event saved ... error_code=4062`.
- Postgres schreibt den Event als `mqtt_error` mit `failed`/Warntext.
- Nachfolgender Heartbeat zeigt Queue-Auswirkungen:
  - `publish_queue_shed_count` von `0` auf `1`
  - `publish_queue_drop_count` von `0` auf `1`
  - `publish_queue_hwm` steigt auf `9`.

**Bewertung:**
- Kein Komplettausfall, aber realer Last-/Burst-Indikator.
- Dieser Punkt ist der wichtigste technische Kandidat fuer sporadisch "verzoegert wirkende" State-Sichtbarkeit.

**Zusatz-Evidenz (gleiches Sekundenfenster, Server 17:02:40):**
- Im selben Fenster sind beide Aktor-Intents (`accepted` -> `applied`) und beide Aktor-Responses (`GPIO14`, `GPIO25`) vorhanden.
- Gleichzeitig schreibt der Server `Error event saved ... error_code=4062`.
- Das spricht fuer: **System arbeitet weiter, aber Publish-Pfad laeuft in Backpressure** statt "Hard-Fail".

**Codebeleg (ESP32/Firmware):**
- `El Trabajante/src/tasks/publish_queue.cpp`
  - `g_pq_shed_count` und `g_pq_drop_count` werden explizit gezaehlt.
  - Bei voller Queue: `Publish queue full — dropping` + `ERROR_TASK_QUEUE_FULL (4062)`.
- `El Trabajante/src/services/communication/mqtt_client.cpp`
  - Bei `msg_id == -2` wird `MQTT Outbox full, message dropped` verarbeitet.
  - Heartbeat payload publisht die Telemetrie (`publish_queue_fill/hwm/shed/drop`, `critical_outcome_drop_count`, `publish_outbox_drop_count`) und macht den Druckzustand sichtbar.

### 3) Config-/State-Pfad ist aktiv, stale-Guard greift sichtbar

**Evidenz (Server):**
- `2026-04-20 17:00:38` Config gebaut und publiziert (`2 offline_rules`).
- `2026-04-20 17:00:39` `flow=config outcome=accepted` und spaeter `outcome=persisted`.
- `2026-04-20 17:00:39` `Skipping stale config_response due to terminal authority guard`.

**Bewertung:**
- Das spricht fuer vorhandene Schutzmechanik gegen stale Antworten (grundsaetzlich positiv).
- Ohne klarere Operator-Logs wirkt "Skipping stale ..." wie Fehler, obwohl es oft korrektes Verhalten ist.

**Codebeleg (Server):**
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`
  - Terminal-Authority-Key wird gebaut und ueber `upsert_terminal_event_authority(...)` dedupliziert.
  - Bei `was_stale=True` folgt ein fruehes `return True` **vor** dem WebSocket-Broadcast-Teil.
  - Das Verhalten ist korrekt fuer Idempotenz, kann aber aus UI-Sicht wie "fehlende Antwort" wirken, wenn ein Frontend-Intent auf ein exakt korreliertes Terminal-Event wartet.

### 4) Reconnect-/Reconciliation-Verhalten ist stabil

**Evidenz (Server + MQTT-Logger):**
- `reconciliation_session_start ... pending=1`
- `reconciliation_session_end ... replayed=1 failed=0`
- Wiederholte `heartbeat/ack` mit `status=online`.
- Heartbeats zeigen stabile Connectivity (`wifi_connected=true`, `mqtt_connected=true`, `network_degraded=false`, `runtime_state_degraded=false`).

**Bewertung:**
- Deckt die Aussage "Reconnect funktioniert auch nach Docker-Neustart" technisch.
- Offline/Online-Transition wirkt robust; Optimierung liegt eher bei Transparenz und Latenzspitzen.

### 5) "Fehler", die in diesem Fenster als normales Verhalten zu klassifizieren sind

1. **Mosquitto healthcheck disconnected** im 30s-Takt  
   - Technisch erwartbar (Healthcheck-Client trennt aktiv die Verbindung).
2. **Frontend-Container ohne eigene Fehlerzeilen**  
   - Keine direkten Crash-/Exception-Hinweise in den letzten 10 Minuten.
3. **Loki/Grafana Logs mit `ERROR` im Query-String**  
   - Das sind Alert-Queries auf Fehler-Muster, nicht selbst ein Servicefehler.

**Zusatzbelege (Stack):**
- `automationone-mqtt`:
  - Wiederholte Sequenz `New client connected ... as healthcheck` gefolgt von `Client healthcheck ... disconnected: connection closed by client` im 30s-Rhythmus.
- `automationone-grafana`:
  - Loki-Alertqueries enthalten regulare Ausdruecke wie `level=\"ERROR\"|Traceback|Exception` als Suchmuster.
  - `statusCode=200` bei den Requests bestaetigt: Query-Ausfuehrung ok, kein Grafana/Loki-Fehler.
- `automationone-alloy`:
  - Start/Reload stabil, einmaliges `error inspecting Docker container ... connection reset by peer` beim Docker-Socket-Reset waehrend Container-Neustart beobachtet.
  - Das ist ein transienter Collecting-Fehler zur Restart-Zeit, kein dauerhafter Pipeline-Ausfall.

### 6) Neue Inkonsistenz: Config-Finalitaet kann bei Korrelationsabweichung im Frontend entkoppeln

**Codebeleg (Server -> Frontend Contract):**
- `El Servador/god_kaiser_server/src/services/device_response_contract.py`
  - Wenn `correlation_id` fehlt, wird sie aus `request_id` abgeleitet oder als synthetischer Fallback (`missing-corr:cfg:...`) erzeugt.
- `El Frontend/src/shared/stores/actuator.store.ts`
  - `handleConfigResponse` erwartet matchbares Intent via `correlation_id` (Fallback auf `request_id` nur wenn zuordenbar).
  - Ohne Match wird `notifyContractIssue(...)` ausgelost und nicht terminal finalisiert.
  - Parallel existiert Timeout-Finalisierung (`CONFIG_RESPONSE_TIMEOUT_MS` / `CONFIG_RESPONSE_TIMEOUT_WITH_OFFLINE_RULES_MS`).

**Risiko fuer Wahrnehmung:**
- Fachlich kann der Server schon terminal verarbeitet haben (inkl. stale-Guard), waehrend die UI bei Korrelationsabweichung auf `terminal_timeout` laeuft oder Contract-Issue meldet.
- Ergebnisbild fuer Operator: "Config war erfolgreich, UI wirkt spaet/unklar".

### 7) Neue Inkonsistenz: Error-Semantik 4062 ist fachlich zu grob fuer schnelle Diagnose

**Codebeleg:**
- `El Trabajante/src/tasks/publish_queue.cpp` erzeugt `ERROR_TASK_QUEUE_FULL (4062)` konkret aus Publish-Queue-Druck.
- `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py` mappt `4062` generisch als `FreeRTOS Task-Queue voll`.

**Auswirkung:**
- Im Betrieb ist die eigentliche Ursache "MQTT Publish-Pfad unter Burst-Druck", die dargestellte Ursache aber "allgemeine Task-Queue voll".
- Das verlangsamt Root-Cause-Einordnung in Richtung MQTT/Outbox/Backpressure.

## Zeitliche Korrelation der kritischen Stelle (17:02:40)

Im selben Sekundenfenster passieren:
- Zwei Aktor-Kommandos (GPIO 14 und 25) werden publiziert.
- Beide Intent-Ketten laufen (`accepted` -> `applied`).
- Gleichzeitig wird `system/error 4062 Publish queue full` emittiert.
- Danach folgen weiterhin regulaere Statusupdates (u. a. beide Aktoren um `17:02:51`).

**Interpretation fuer Management:**
- Das System bleibt handlungsfaehig, aber in Burst-Momenten ist die Telemetrie-/Publish-Strecke am Limit.
- Genau dort entsteht die "wirkt wie Fehler, ist aber noch lauffaehig"-Wahrnehmung.

## Konkrete Luecken (nicht implementiert, nur benannt)

1. **Fehlende Operator-Semantik in Logs**
   - Warnungen/Guards sind technisch korrekt, aber nicht klar als "normaler Schutzpfad" gekennzeichnet.

2. **Queue-Druck ohne sichtbaren Ursache-Wirkung-Kontext**
   - `Publish queue full` steht isoliert; relationale Felder fehlen fuer schnelle Diagnose.

3. **Konfliktlogik nicht als erwartbares Regel-Arbitration-Event markiert**
   - `first_wins` ist korrekt, wird aber im Betrieb als "Regel kaputt" gelesen.

4. **State-Sync wahrgenommen verzögert, aber ohne eindeutiges End-to-End-Latenzsignal**
   - Es fehlt ein konsistenter "command->applied->published->rendered"-Kettenmarker fuer sofortiges Troubleshooting.

5. **Config-Terminalisierung hat Cross-Layer-Kante bei Korrelationsabweichung**
   - Server kann terminal entscheiden, Frontend kann mangels matchbarer `correlation_id` in `contract_issue`/`timeout` laufen.

6. **Error-Code 4062 ist observability-seitig unterdifferenziert**
   - Firmware-Signal ist Publish-Queue/Outbox-nah, Server-Mapping ist generisch "Task-Queue voll".

7. **Observability-Randfehler bei Restart nicht als transient markiert**
   - Alloy-Docker-Socket-Reset erscheint als Error, obwohl Ursache ein Neustartfenster ist.

8. **Broker-Konfig-Hinweis im Startlog ungepflegt**
   - Mosquitto empfiehlt `message_size_limit` -> `max_packet_size`; verbleibt aktuell als technischer Debt-Hinweis im Runtime-Log.

## Empfehlungen fuer Serial-Monitor-Observability (ohne Funktionsaenderung)

Ziel: gleiches Verhalten, aber sauberer, ruhiger und fuer Betriebspersonal als "normaler Runtime-Pfad" lesbar.

1. **Event-Klassen fuer Normalbetrieb einfuehren**
   - `MODE_TRANSITION` (OFFLINE_ENTER/ONLINE_REJOIN/ADOPT_START/ADOPT_DONE)
   - `RULE_ARBITRATION` (WINNER_RULE_ID, LOSER_RULE_ID, policy=first_wins)
   - `QUEUE_PRESSURE` (fill, hwm, shed_count, drop_count, burst_window_ms)
   - `STATE_EMIT` (gpio, state, source_rule, intent_id, correlation_id)

2. **Jede Zeile mit stabilen Korrelationsfeldern**
   - `esp_id`, `session_id`, `handover_epoch`, `intent_id`, `correlation_id`, `rule_id`, `gpio`, `seq`.

3. **Normalfall explizit positiv markieren**
   - Beispiel:
     - `QUEUE_PRESSURE level=INFO status=RECOVERED fill=0 hwm=9 shed=1 drop=1`
     - `RECONNECT level=INFO status=OK replayed=1 failed=0`
   - Dadurch wirkt der Betrieb weniger wie "stilles Scheitern".

4. **Konfliktlogs um Business-Satz erweitern**
   - Statt nur "blocked by ...":  
     `RULE_ARBITRATION result=expected policy=first_wins winner_priority=10 loser_priority=50 actuator=14`

5. **Config-Guard als Schutz statt Fehler kommunizieren**
   - `CONFIG_GUARD action=skip_stale_response reason=terminal_authority status=expected`.

## Priorisierte Verbesserungspunkte fuer Runde 2

1. **P1:** Queue-Pressure sichtbar und als Betriebszustand klassifizieren (nicht nur Error-Event).
2. **P1:** Konfliktauflosung als deterministisches Verhalten im Operator-Log labeln.
3. **P1:** End-to-End-Latenzmarker je Aktor-/State-Event (bis Frontend-Anzeige) erfassbar machen.
4. **P1:** Config-Korrelation robust machen (Server-Canonicalisierung, Frontend-Finalisierung, Guard-Meldung in ein gemeinsames Contract-Bild bringen).
5. **P2:** Healthcheck-Disconnects in Monitoring filtern/downgraden (Rauschreduktion).
6. **P2:** Stale-Guard-Meldungen als `expected_guard` standardisieren.
7. **P2:** `4062` in UI/Alerting als Publish-Queue-Druck semantisch schaerfen (nicht nur generische Task-Queue).
8. **P3:** Mosquitto-Config-Hinweis (`max_packet_size`) als Repo-Drift/TODO sauber aufloesen.

## Abschlussbewertung

Das System ist **nicht instabil**, sondern in einem fortgeschrittenen, nahezu produktionsfaehigen Zustand mit klar identifizierbaren Observability-Luecken unter Last-/Gleichzeitigkeitsbedingungen.  
Der Kern fuer Runde 2 ist daher: **Signalqualitaet und Latenztransparenz verbessern**, nicht Grundarchitektur neu bauen.
