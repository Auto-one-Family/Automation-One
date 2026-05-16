# BERICHT Overflow-Recovery IST-Stand (2026-05-16)

## Ziel und Evidenzbasis

Dieser Bericht dokumentiert den IST-Stand fuer das offene Problem "persistente Ueberlast nach Recovery" mit harten Belegen aus:

- Firmware-Code:
  - `El Trabajante/src/services/communication/mqtt_client.cpp`
  - `El Trabajante/src/tasks/publish_queue.cpp`
  - `El Trabajante/src/tasks/intent_contract.cpp`
  - `El Trabajante/src/tasks/actuator_command_queue.cpp`
- Serverseitigen Pfaden:
  - `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
  - `El Servador/god_kaiser_server/src/services/esp_service.py`
  - `El Servador/god_kaiser_server/src/mqtt/handlers/queue_pressure_handler.py`
- Frischen/letzten relevanten Runs:
  - `logs/current/hardware/disconnect-repro/20260515_234458`
  - `logs/current/hardware/disconnect-repro/20260515_234645`
  - `logs/current/hardware/disconnect-repro/20260515_234931`
  - `logs/current/hardware/disconnect-repro/20260515_235328`
  - `logs/current/hardware/disconnect-repro/20260515_235555`
  - Verifikationsversuch heute: `logs/current/hardware/disconnect-repro/20260516_073657`

## Schon eingebaut (IST, mit Codebeleg)

1) ACK-stale + Pressure Schutz im Queue-Drain  
- Symbol: `MQTTClient::processPublishQueue()` in `mqtt_client.cpp`  
- Verhalten: Bei `ack_stale && queue_pressure_high` werden Publishes nicht blind gesendet, sondern defer/shed-Logik angewendet und Managed-Reconnect geplant (`scheduleManagedReconnect_("ack_stale_pressure", ...)`).

2) Nicht-blockierender Queue-Drain Richtung MQTT  
- Symbol: `esp_mqtt_client_enqueue(...)` in `MQTTClient::processPublishQueue()`  
- Wirkung: Drain-Pfad nutzt explizit den non-blocking enqueue statt blocking publish im Drain.

3) Publish-Queue Shedding + Slot-Schutz  
- Symbol: `tryQueuePublish(...)` und `reserveSlotForCriticalPublish(...)` in `publish_queue.cpp`  
- Verhalten: Non-critical wird ab Watermark geshedded; kritische Lane kann Slot-Reservierung/Preemption nutzen.

4) Replay-/Outbox-Bremse unter Druck  
- Symbol: `processIntentOutcomeOutbox()` in `intent_contract.cpp`  
- Verhalten: Replay-Backoff bei Queue-Druck (`scheduleReplayBackoffMs("queue_pressure", ...)`), um weiteren Druck nicht zu verstaerken.

5) Actuator-Queue-Drossel bei stale ACK + Publish-Pressure  
- Symbol: `processActuatorCommandQueue(...)` in `actuator_command_queue.cpp`  
- Verhalten: `stale_pressure_throttle_active` begrenzt Fortschritt und vermeidet Befehlssturm.

6) Serverseitig Priorisierung/Coalescing bereits aktiv  
- `Subscriber._classify_inbound_topic(...)` in `subscriber.py`: Response-Lanes als CRITICAL/priority executor.  
- `ESPService.trigger_config_push_debounced(...)` in `esp_service.py`: coalesced Config-Pushes.

## Wirkt nachweislich

### A) Recovery von Transportfehlern wirkt teilweise

Beleg: Run `20260515_234458` zeigt noch Transport-Fehlerkette, danach Low-Load-Runs nicht:
- `20260515_234458`: `write_timeout_classified=1`, `mqtt_disconnected=1`, `err_4062=35`
- `20260515_235328`: `write_timeout_classified=0`, `mqtt_disconnected=0`, `err_4062=46`
- `20260515_235555`: `write_timeout_classified=0`, `mqtt_disconnected=0`, `err_4062=51`

Interpretation mit Beleg: Disconnect/Write-Timeout wurden gegenueber `234458` reduziert, aber Queue-Overflow bleibt.

### B) Backpressure-Deferral ist im Live-Log sichtbar

Beleg in `20260515_234645` und `20260515_234931`:
- Marker `queue drain deferred ack stale ... queue_fill=8 ... replayable_critical=1`

Interpretation: Deferral greift technisch, fuehrt aber unter persistenter Stausituation nicht zu schneller Aufloesung.

## Wirkt nicht ausreichend (offenes Problem)

### Persistente Ueberlast bleibt reproduzierbar

Belege:
- `20260515_234645`: `err_4062=288`, `queue drain deferred ack stale` haeufig
- `20260515_234931`: `err_4062=264`, `queue drain deferred ack stale` haeufig
- `20260515_235328`: `err_4062=46` (Stage1-Grenze <=30 verfehlt)
- `20260515_235555`: `err_4062=51` (Stage1-Grenze <=30 verfehlt)

Kernbeobachtung: ESP kommt wieder online, aber der Pressure-Zustand loest sich nicht robust genug auf; 4062 bleibt ueber Zielgrenze.

## Fehlerkette (Trigger -> Dauerueberlast)

1) Trigger  
- Last auf Aktor-Command-Topics (`.../actuator/14/command`, `.../actuator/25/command`) in den genannten Runs.

2) Eintritt in Pressure-Zustand  
- Publish-Queue erreicht Vollbereich (`queue_fill=8`), 4062-Fehler entstehen (`Publish queue full` / `ERRTRAK [4062]`).

3) Drain-Verhalten unter ACK-Stale  
- Drain deferiert kritische Publishes (`queue drain deferred ack stale ... replayable_critical=1`) statt aktiv abzubauen.

4) Persistenz des Staus  
- Durch wiederholtes Defer + begrenzten Drain bleibt Queue-Pressure ueber laengere Zeit erhalten; Stage-Gate fuer `err_4062` wird verfehlt.

## Chirurgischer Fix (eingebaut am 2026-05-16)

Datei: `El Trabajante/src/services/communication/mqtt_client.cpp`  
Symbol: `MQTTClient::processPublishQueue()`

### Aenderung

- Bei `ack_stale && queue_pressure_high` wird nicht mehr sofort mit `break` aus dem Tick ausgestiegen.
- Stattdessen:
  - non-critical unter stale/pressure wird geshedded und der Scan setzt fort (`continue`)
  - critical wird deferiert und der Scan setzt fort (`continue`)
- Zusaetzlich Scan-Limit pro Tick (`max_scan_per_tick = PUBLISH_QUEUE_SIZE`), damit kein Endlos-Loop entsteht.
- Neue Diagnostik:
  - `[DBG5126ae][H112] queue drain stale-pressure scan cap reached scanned=... shed=... deferred=... queue_fill_after=...`

### Zielwirkung

Aktives Aufraeumen des non-critical Backlogs innerhalb desselben Ticks, damit der dauerhafte Vollzustand schneller verlassen wird und ACK-Recovery nicht in einer Defer-Schleife haengen bleibt.

## Verifikation (heute)

### Lauf

- Run-ID: `20260516_073657`
- Pfad: `logs/current/hardware/disconnect-repro/20260516_073657`
- Ergebnis laut `run_summary.json`:
  - `err_4062=0`
  - `mqtt_disconnected=0`
  - `write_timeout_classified=0`

### Aussagekraft (harte Einschraenkung)

Der Lauf ist **nicht** als belastbarer Nachweis fuer den neuen Fix-Binaerstand zu werten:

- Im Arbeitsumfeld ist kein `platformio`/`pio` verfuegbar, daher konnte die geaenderte Firmware nicht geflasht werden.
- Marker des neuen Fixpfads (`[DBG5126ae][H112] ...`) sind im Run nicht vorhanden.
- Der Lauf zeigt insgesamt sehr wenig Last-/Queue-Aktivitaet (57 Serial-Zeilen), daher keine reproduzierte Ueberlastsituation.

Fazit Verifikation heute: **unveraendert bezueglich Hauptproblem belegbar** (weder Regression noch Verbesserung des neuen Fixes sicher nachgewiesen).

## Offene Restpunkte

1) Verifikation mit sicherem Firmware-Stand fehlt (Flash + Repro unter Last).  
2) Hauptproblem bleibt offen: robuste Aufloesung persistenter Queue-Pressure (`err_4062` dauerhaft unter Stage1-Grenze <=30).  
3) `H112`-Marker muss in einem echten Ueberlastlauf auftauchen, um Fixwirkung zu bestaetigen.

## Naechster empfohlener Schritt

1) Tooling herstellen (PlatformIO verfuegbar machen) und geaenderte Firmware flashen.  
2) Danach mindestens zwei Stage1-nahe Runs mit `ACTUATOR_GPIOS=14,25` wiederholen.  
3) Gate fuer Fixwirkung:
- `err_4062 <= 30`
- `mqtt_disconnected <= 1`
- `write_timeout_classified <= 1`
- Nachweis `H112`-Marker + sinkender Queue-Fill im selben Run.
