# Analyse: ESP32 Disconnect unter Last (IST 2026-05-15)

## Ziel und Scope

Dieses Dokument rekonstruiert den letzten Fixablauf und beschreibt den aktuellen IST-Zustand fuer das Problem:

- Bei hoher Last (insbesondere `actuator save` + parallele Aktor-Kommandos) laufen Publish-/Command-Queues voll.
- ESP32 verliert MQTT-Verbindung, reconnectet teilweise, verarbeitet danach aber zeitweise sehr langsam.
- Gewuenscht ist eine robuste, schnelle Weiterleitung mit klaren Backpressure-Mechanismen und belastbarer End-to-End-Contract-Dokumentation.

Quellen:

- Firmware/Server-Quellcode (aktueller Working Tree + letzte Commits)
- Repro-Logs unter `logs/current/hardware/disconnect-repro/*`
- Fokus-Run: `20260515_181347`
- Zusatzabgleich fuer Transport-Disconnect-Kette: `20260515_183406`

---

## 1) Rekonstruktion des Fixverlaufs (Git + aktuelle uncommitted Aenderungen)

### 1.1 Relevante Commit-Kette vor dem aktuellen WIP

1. `b04a2d1f`  
   OUTBOX vergroessert + QoS-Reduktionen + OOM-sichere String-Pfade.

2. `470bcaf2`  
   MQTT Publish-Zwei-Pfad-Architektur (direkt + Queue), Circuit-Breaker-Drain-Symmetrie.

3. `8a230182` (HEAD)  
   AUT-117 Disconnect-under-load: gezielte Haertungen inkl. Diagnoseinstrumentierung.

4. Danach im Working Tree (`git status`):  
   zusaetzliche, noch nicht committete Haertungen in Server + Firmware (11 geaenderte Files, ca. 858 Insertions).

### 1.2 Aktueller uncommitted Fixstand (wesentliche Delta-Pakete)

#### A) Firmware Transport/Backpressure

- `El Trabajante/src/services/communication/mqtt_client.cpp`
  - ACK-Stale-Schwellen eingefuehrt (`QUEUE_DRAIN_ACK_STALE_MS=10s`, `HEARTBEAT_RECONNECT_ACK_STALE_MS=30s`).
  - Direkter Publish-Pfad deferiert bei `ack_stale && queue_pressure_high` in lokale Queue.
  - Queue-Drain nutzt `esp_mqtt_client_enqueue()` statt blocking `esp_mqtt_client_publish()`.
  - `safePublish()` bricht Retries hart ab, sobald MQTT/WiFi disconnected ist.
  - Heartbeat-Fail + stale ACK triggert proaktives `esp_mqtt_client_reconnect()`.

- `El Trabajante/src/tasks/publish_queue.cpp`
  - Trennung `isRealtimeResponseTopic()` vs. replaybare kritische Topics.
  - Bei Queue-Saturation darf realtime-kritisch replaybare critical (Intent-Outcomes) preempten.

- `El Trabajante/src/tasks/actuator_command_queue.cpp`
  - Throttle bei `ack_stale + publish_pressure`: maximal 1 Command pro Tick, non-recovery wird zurueckgestellt.
  - `REGISTRATION_PENDING`-Outcomes werden unter Druck suppressiert (Storm-Vermeidung).

#### B) Firmware NVS/Replay-Vertrag

- `El Trabajante/src/tasks/intent_contract.cpp`
  - `OUTCOME_OUTBOX_CAPACITY` reduziert auf 24 (NVS-Budgetschutz).
  - Write-Checks fuer NVS put* mit expliziter Fehlerdiagnose.
  - Replay wird bei Queue-Druck gebackoffed.
  - Kritische Outcomes koennen bei stale ACK + Druck auf replay-only umgeschaltet werden.

#### C) Firmware Telemetrie-/Fehlerrauschen

- `El Trabajante/src/services/sensor/sensor_manager.cpp`
- `El Trabajante/src/error_handling/health_monitor.cpp`
  - 3012-Unterdrueckung bei lokaler Backpressure/Transient-Disconnect, damit Root-Cause-Reihenfolge klar bleibt.

#### D) Server Verarbeitungslatenz / Trace

- `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
  - `priority_executor` fuer latenzkritische Topics (`.../response`, `config_response`, `zone/subzone ack`, `system/command/response`).
  - sensor_data und intent_outcome/lifecycle aus synchroner kritischer Inbox-Haertung herausgenommen.

- `El Servador/god_kaiser_server/src/services/actuator_service.py`
  - No-op Guard differenziert: manuelle `user:*` Commands werden nicht mehr no-op-suppressiert.

- `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_response_handler.py`
  - End-to-end OFF-Latency-Diagnosepunkte (Entry, post-commit, post-WS).

---

## 2) Praezises IST-Problem mit Logbelegen

## 2.1 Was funktioniert bereits

- Backpressure-Mechanismen greifen sichtbar:
  - `actuator queue throttle ack/backpressure ...`
  - `queue drain deferred ack stale ...`
  - `outcome publish deferred to replay ...`
  - `managed reconnect scheduled ... write_timeouts=1`

- Reconnect-Haertung greift:
  - Write-timeout wird klassifiziert (`sock_errno=11 ... classified=write_timeout`)
  - Disconnect-Handling boostet reconnect delay (`reconnect delay boosted to 5000ms`).

- Nach Reconnect wird Registration-Gate sauber wieder aufgebaut:
  - ACK-Topic subscribe
  - Bootstrap heartbeat
  - `REGISTRATION CONFIRMED BY SERVER`
  - danach Resume Queue / Replay.

## 2.2 Wo es weiterhin kippt

### (A) Druckphase bleibt zu lang -> Queue-Kaskade

Im Run `20260515_181347`:

- ACK-Alter laeuft auf ~30-40s hoch.
- Gleichzeitig `publish_fill=8` (Queue voll) und wiederholtes:
  - `actuator queue throttle ack/backpressure ...`
  - `Critical outcome outbox full — evicted oldest NVS slot ...`
  - `Publish queue full` / `Actuator command queue full` (4062)

Interpretation: Mechanismen verhindern Totalabsturz teilweise, aber das System verbleibt zu lange in einem gesaettigten Recovery-Korridor.

### (B) Transport bricht trotz Defers weiterhin weg

Run `20260515_181347`:

- `ack stale pressure reconnect request ... rc=-1 rc_name=ESP_FAIL`
- kurz danach:
  - `tcp_write error, errno=11`
  - `MQTT_EVENT_ERROR ... classified=write_timeout`
  - `MQTT_EVENT_DISCONNECTED`

Run `20260515_183406` bestaetigt das Muster:

- Wiederholt `sock_errno=11 ... classified=write_timeout`
- disconnect context + boosted reconnect delay + recovery hold.

### (C) Server-Ingress zeigt Sekundaersymptome

`20260515_181347/server.log`:

- `Inbound inbox capacity reached ... dropping oldest event`
- `Queue pressure event ... fill_level=7`
- `LWT ... unexpected_disconnect`
- `Invalid JSON payload on topic .../system/heartbeat ...`

Interpretation: Neben dem eigentlichen Transport-/Druckproblem gibt es unter Last fragmentierte/inkonsistente Payload-Frames oder abgeschnittene Nutzdaten am Servereingang.

---

## 3) End-to-End Architektur (Send/Receive/Processing/NVS/Handshake/State)

## 3.1 Save-Flow: API -> Config-Push -> ESP Apply -> Persist -> State-Exit

1. **API Save**  
   `actuators.py` / `sensors.py` speichern DB-Aenderung und triggern immer:
   - `ConfigPayloadBuilder.build_combined_config(...)`
   - `ESPService.send_config(...)`

2. **Server Build** (`config_builder.py`)  
   - sammelt aktive Sensoren/Aktuatoren
   - validiert GPIO-Konflikte (I2C/OneWire ausgenommen)
   - baut `offline_rules` + consistency-strip (`AUT-59`)
   - liefert `offline_rules_diagnostics`.

3. **Server Send** (`esp_service.py`)  
   - injiziert `correlation_id`, `request_id`, `intent_id`, `generation`, `config_fingerprint`
   - prueft Wire-Groesse gegen `ESP_COMBINED_CONFIG_MQTT_MAX_BYTES=4352`
   - publiziert auf MQTT und schreibt Audit/WS-Ereignisse.

4. **ESP Ingress** (`main.cpp` -> `queueConfigUpdateWithMetadata`)  
   - Admission-Check (`shouldAcceptCommand`)
   - Pflichtfeld `correlation_id`
   - Persist in `cfg_pending`-Ring (NVS), damit Reconnect/Reboot-Replay moeglich.

5. **ESP Apply** (`processConfigUpdateQueue`)  
   - JSON parse (einmalig in static doc)
   - generation guards (global + scope-spezifisch)
   - lockte `g_config_lane_mutex`
   - ruft `handleSensorConfig`, `handleActuatorConfig`, `handleOfflineRulesConfig`.

6. **ESP Persist** (`ConfigManager` + `StorageManager`)  
   - Sensor/Aktor/System in NVS via Namespace + Transaction
   - kurze Schluessel (<=15) + Migrationspfade fuer Altkeys
   - Quota-Checks (`NVS FULL`/near full Warnungen).

7. **State-Exit**  
   Wenn Config persisted und Zustand `STATE_CONFIG_PENDING_AFTER_RESET`, dann:
   - `evaluatePendingExit("config_commit")`
   - Wechsel zu `STATE_OPERATIONAL` oder `STATE_PENDING_APPROVAL` je nach Approval.

## 3.2 Command-Flow: MQTT Command -> Queue -> Actuator -> Response/Outcome

1. Ingress auf Topic `.../actuator/{gpio}/command` in `main.cpp`.
2. Admission durch `CommandAdmissionContext`:
   - Registration confirmed?
   - Config pending?
   - approval pending / runtime degraded / safety locked?
3. Queue in `actuator_command_queue`.
4. Verarbeitung in `processActuatorCommandQueue()`:
   - bei stale ACK + Druck: harte Drosselung.
5. Ausfuehrung durch `ActuatorManager`.
6. Rueckkanal:
   - `actuator/.../response` (realtime lane)
   - `system/intent_outcome` (critical/replayable, NVS-gestuetzt).

## 3.3 Backpressure- und Replay-Contract

- **Publish Queue (`g_publish_queue`)**
  - non-critical shedding ab Watermark
  - Reserve-Slot fuer critical
  - realtime darf replayable critical preempten.

- **MQTT-Client**
  - direct publish admission + defers bei `ack_stale && pressure`
  - drain mit non-blocking enqueue
  - reconnect management inkl. grace/boost.

- **Intent-Outbox (NVS)**
  - kritische Outcomes werden durable gehalten
  - bei Druck replay-backoff
  - bei Vollstand eviction oldest (aktuell sichtbar in Logs).

## 3.4 Handshakes und Contracts

- **Registration Gate**: publish lanes bleiben fail-closed bis gueltige heartbeat ACK.
- **ACK Contract** in `main.cpp`:
  - `status` + `handover_epoch` Pflicht
  - Typvalidierung + mismatch reject fail-closed.
- **Intent metadata**:
  - `correlation_id`, `intent_id`, `generation`, `epoch_at_accept` durch den gesamten Pfad.

## 3.5 NVS Read/Write: Wann was passiert

- **Systemzustand** (`system_config`):
  - beim Boot geladen, bei State-Transition gespeichert.
- **Sensor/Aktor-Config**:
  - bei Config-Apply und teilweise bei Runtime-Reconfiguration sofort persistiert.
- **Config Pending Ring** (`cfg_pending`):
  - jeder angenommene Config-Push wird gespeichert und bei Boot/Reconnect replayed.
- **Intent-Outbox** (`io_outbox`):
  - kritische publish-fail Outcomes werden persistent gepuffert und spaeter replayed.

---

## 4) Root-Cause Bild im IST

Der aktuelle Stand zeigt **kein Fehlen von Schutzmechanismen**, sondern ein **Sättigungsproblem unter kombinierter Last**:

1. Massive gleichzeitige Last aus Config-Push + Command-Burst erzeugt sustained queue pressure.
2. ACK-Progress bleibt aus -> stale-ACK-Regeln aktivieren Defers und Throttles.
3. Trotz Defers werden write-timeouts (`errno=11`) erreicht -> Disconnect.
4. Nach Reconnect muss ein grosser backlog (inkl. NVS-outbox) abgebaut werden.
5. Dadurch entsteht die wahrgenommene Langsamkeit nach reconnect.

---

## 5) Offene Problemzonen (konkret)

1. **Outbox-Saturation mit Evictions**  
   `Critical outcome outbox full — evicted oldest ...` ist weiterhin haeufig.

2. **Queue bleibt lange am Maximum (8/8)**  
   Schutzpfade arbeiten, aber Durchsatz-Recovery ist zu langsam fuer Burstprofil.

3. **Reconnect request im stale-ACK-Pfad liefert `ESP_FAIL`**  
   deutet auf Timing/State-Race zwischen manual reconnect und laufendem IDF-Autoreconnect.

4. **Server sieht Invalid-JSON auf Heartbeat**
   vermutlich fragmentierte oder beschaedigte Payload unter hoher Last; muss separat gehartet werden.

5. **Inbox-Capacity auf Server wird erreicht**
   Folge von Bursts + Handlerstau, auch wenn priority lane bereits eingefuehrt wurde.

---

## 6) Konkrete naechste Schritte (technisch priorisiert)

1. **Replay-/Outbox-Stabilisierung**
   - replay budget pro tick deckeln (hart)
   - eviction policy fuer outbox nach Ursache differenzieren (z.B. lifecycle zuerst).

2. **Drain-Ratensteuerung adaptiv**
   - realtime lanes priorisieren, lifecycle/diagnostics noch strikter limitieren.
   - eigene low-prio lane fuer observability-only payloads.

3. **Reconnect-Race klaeren**
   - bei `ESP_FAIL` im manual reconnect explizit auf auto-reconnect-only umschalten (mit cooldown) statt wiederholter Requests.

4. **Server JSON Robustness**
   - Subscriber-Pfad fuer heartbeat payload defensiver machen (fragment/partial guards + bounded raw dump fuer Diagnose).

5. **Config-Push Burst begrenzen**
   - Debounce/Coalesce fuer kurz hintereinander folgende Save-Operationen (Actuator/Sensor/Subzone), um Payload-Flut zu reduzieren.

---

## 7) Relevante Codepfade (Index)

- Server:
  - `El Servador/god_kaiser_server/src/api/v1/actuators.py`
  - `El Servador/god_kaiser_server/src/api/v1/sensors.py`
  - `El Servador/god_kaiser_server/src/services/config_builder.py`
  - `El Servador/god_kaiser_server/src/services/esp_service.py`
  - `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
  - `El Servador/god_kaiser_server/src/services/actuator_service.py`
  - `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_response_handler.py`

- Firmware:
  - `El Trabajante/src/main.cpp`
  - `El Trabajante/src/services/communication/mqtt_client.cpp`
  - `El Trabajante/src/tasks/publish_queue.cpp`
  - `El Trabajante/src/tasks/actuator_command_queue.cpp`
  - `El Trabajante/src/tasks/intent_contract.cpp`
  - `El Trabajante/src/tasks/config_update_queue.cpp`
  - `El Trabajante/src/services/config/config_manager.cpp`
  - `El Trabajante/src/services/config/storage_manager.cpp`
  - `El Trabajante/src/services/sensor/sensor_manager.cpp`
  - `El Trabajante/src/services/actuator/actuator_manager.cpp`
  - `El Trabajante/src/tasks/command_admission.cpp`

---

## 8) Artefakte

- Analyse-Dokument:  
  `docs/analysen/ANALYSE-esp32-disconnect-under-load-ist-2026-05-15.md`

- Hauptlogs fuer diese Auswertung:
  - `logs/current/hardware/disconnect-repro/20260515_181347/esp32_serial.log`
  - `logs/current/hardware/disconnect-repro/20260515_181347/server.log`
  - `logs/current/hardware/disconnect-repro/20260515_154217/mqtt_broker.log`
  - `logs/current/hardware/disconnect-repro/20260515_183406/esp32_serial.log`

---

## 9) Umgesetzte Fixes seit dieser IST-Analyse (Code-Delta)

### 9.1 MQTT reconnect path entkoppelt (kein direct reconnect aus Hotpath)

- Datei: `El Trabajante/src/services/communication/mqtt_client.cpp`
- Umgesetzt:
  - stale-pressure-Pfad nutzt nun managed schedule statt direktem `esp_mqtt_client_reconnect(...)`
    - `ack stale pressure reconnect scheduled` (Code-Marker)
  - heartbeat-fail stale-ack-Pfad nutzt nun ebenfalls `scheduleManagedReconnect_("heartbeat_ack_stale", ...)`
    statt direktem reconnect request.
- Relevante Stellen:
  - `isReplayableCriticalTopic(...)` + stale-pressure branch / schedule-logik
  - `heartbeat fail triggers managed reconnect schedule`

### 9.2 Deterministischer pressure drain in publish lane

- Datei: `El Trabajante/src/services/communication/mqtt_client.cpp`
- Umgesetzt:
  - Topic-Klasse `replayable critical` explizit (`/system/intent_outcome`)
  - Bei `ack_stale && pressure_high`:
    - non-critical wird aktiv geshedded (`queue drain shed non-critical under ack/pressure`)
    - critical/realtime werden deferiert mit differenziertem backoff

### 9.3 Actuator queue Vollstand: kontrollierte Slot-Reservierung statt blind drop

- Datei: `El Trabajante/src/tasks/actuator_command_queue.cpp`
- Umgesetzt:
  - `reserveSlotForActuatorCommand(...)`
  - bei queue-full: zielgerichtete Verdraengung eines nicht-recovery commands
  - throttle nur aktiv bei `ack_stale && publish_pressure && mqtt_connected`
    (`stale_pressure_throttle_active`)

### 9.4 Replay/Outbox pressure drosselung erweitert

- Datei: `El Trabajante/src/tasks/intent_contract.cpp`
- Umgesetzt:
  - Inline-Replay bei stale ACK seltener (`INLINE_REPLAY_INTERVAL_STALE_MS=5000`)
  - Sustained-pressure counter (`s_sustained_pressure_hits`) fuer progressiven replay-backoff

### 9.5 Server diagnose fuer JSON-Fehler erweitert

- Datei: `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
- Umgesetzt:
  - JSON-Error-Log enthaelt `topic_class`, `payload_len`, `pos/line/col`, preview
  - weiterhin fail-fast (keine heuristische payload-reparatur)

---

## 10) Neue Evidenz aus aktuellen Logs (Run `20260515_190305`)

### 10.1 Was besser ist (gegenueber Fokus-IST `20260515_181347`)

- `ack stale pressure reconnect request`:  
  - `181347`: 6 Treffer  
  - `190305`: 0 Treffer
- `Actuator command queue full`:  
  - `181347`: 136 Treffer  
  - `190305`: 0 Treffer
- `sock_errno=11`:  
  - `181347`: 8 Treffer  
  - `190305`: 3 Treffer (reduziert, aber nicht weg)
- Server-Heartbeat JSON Fehler:
  - `190305/server.log`: keine `Invalid JSON payload ... /system/heartbeat` Treffer

### 10.2 Was weiterhin klar offen ist

- Publish pressure bleibt dominant:
  - `Publish queue full` in `190305`: 13 Treffer (`err_4062=13` in SUMMARY)
  - `Publish defer queue full while ACK stale, dropping ...` mehrfach
- Queue pressure + replay backoff weiter aktiv:
  - `replay backoff scheduled reason=queue_pressure ...` mehrfach
  - `queue drain deferred ack stale ...` mehrfach
- Disconnects weiterhin vorhanden:
  - `MQTT_EVENT_DISCONNECTED` Marker in SUMMARY: 25
  - write-timeout klassifiziert: 2
- Server-Inbox bleibt unter Last im drop-mode:
  - `Inbound inbox capacity reached, dropping oldest event ...` mehrfach in `190305/server.log`

### 10.3 Wichtiger Abgleich: Marker der neuen Codepfade im aktuellen Run

Im aktuellen Run `190305` fehlen die neuen Marker aus den zuletzt eingebauten Aenderungen:

- kein `ack stale pressure reconnect scheduled`
- kein `queue drain shed non-critical under ack/pressure`
- kein `Actuator queue full -> reserved slot for latest command`
- kein erweitertes JSON-Error-Format mit `topic_class=... payload_len=...`

Das ist ein starker Hinweis, dass `190305` nicht mit genau diesem neuesten Code-Stand gelaufen ist
(oder die neuen Branches in diesem Laufprofil nicht gegriffen haben).

---

## 11) Offene Fehlerbilder nach aktuellem Lauf (mit direkter Zuordnung)

1. **FreeRTOS-Queue-Druck weiterhin regelmaessig (dein beobachtetes "full")**  
   Evidenz:
   - `ERRTRAK 4062 Publish queue full` + `Publish queue full - dropping` mehrfach in `190305`.
   Codebezug:
   - `El Trabajante/src/tasks/publish_queue.cpp`
   - `El Trabajante/src/services/communication/mqtt_client.cpp` (stale-pressure defer + retry queue-full)

2. **Sustained pressure noch nicht sauber aufgeloest**  
   Evidenz:
   - wiederholte `queue drain deferred ack stale ...`
   - wiederholte `replay backoff scheduled reason=queue_pressure`
   Codebezug:
   - `mqtt_client.cpp` drain branch
   - `intent_contract.cpp` replay backoff path

3. **Transport instabil unter Last bleibt vorhanden**  
   Evidenz:
   - `sock_errno=11 ... classified=write_timeout` weiterhin vorhanden
   - `MQTT_EVENT_DISCONNECTED` weiterhin vorhanden
   Codebezug:
   - `mqtt_client.cpp` transport error / managed reconnect / hold

4. **Serverseitige Ingress-Queue weiter am Limit**  
   Evidenz:
   - `Inbound inbox capacity reached, dropping oldest event ...` in `190305/server.log`
   Codebezug:
   - `El Servador/god_kaiser_server/src/services/inbound_inbox_service.py`
   - `El Servador/god_kaiser_server/src/mqtt/subscriber.py`

---

## 12) Direkt anschliessende, kleine Folgeaufgaben (aus den neuen Logs abgeleitet)

1. **Sicherstellen, dass naechster Repro wirklich den neuesten Firmware/Server-Stand faehrt**  
   (Marker-Check auf neue Strings als Gate im Repro-Skript).

2. **Publish queue full (4062) weiter entchaerfen**  
   - queue-pressure observability publish (`/system/queue_pressure`) im pressure-mode nicht direct senden,
     sondern strikt low-prio/sheddable behandeln.

3. **Server inbound inbox drops separat begrenzen**  
   - retention/priority fuer critical inbound events schaerfen,
   - acked-oldest-drop Last im pressure-fall deduplizieren.

