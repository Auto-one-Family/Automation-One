# Report S0 — Bootstrap, Lifespan, globale Verdrahtung (El Servador)

**Datum:** 2026-04-05  
**Code-Wurzel:** `El Servador/god_kaiser_server/`  
**Primärquelle:** `src/main.py` (`lifespan`), `src/mqtt/subscriber.py`, `src/services/inbound_inbox_service.py`

---

## Hypothese (Verifikation)

**Behauptung:** `src/main.py` ist der zentrale Lifespan-/Wiring-SPOF für DB, MQTT, Handler, WebSocket, Logic/Scheduler, Simulation/Maintenance.

**Befund:** **bestätigt.** Es gibt keine parallele zweite App-Factory: FastAPI-`app` wird mit `lifespan=lifespan` erzeugt; sämtliche genannten Subsysteme werden in `lifespan` (Startup vor `yield`, Shutdown danach) verdrahtet oder über dort erzeugte Singletons/Global-Handles (`_subscriber_instance`, `_logic_engine`, `_central_scheduler` via `init_central_scheduler`, usw.).

---

## 1. Startkette (nummeriert)

Reihenfolge vom Eintritt in `lifespan` bis „ready for traffic“ (HTTP akzeptiert nach erfolgreichem Startup). Anker: `src/main.py` in der Funktion `lifespan`, sofern nicht anders vermerkt.

| # | Schritt | Ort | Kurzbegründung |
|---|---------|-----|----------------|
| 0 | Runtime-State → `WARMING_UP` | `main.py:lifespan` → `get_runtime_state_service().transition` | Sichtbarkeit/Betriebsmodus vor Subsystemen. |
| 0a | JWT-Secret-Check (Prod: `SystemExit`) | `main.py:lifespan` (~113–126) | Harte Security-Sperre vor Netzwerk/DB. |
| 0b | MQTT-TLS-Warnung | `main.py:lifespan` (~135–139) | Konfig-Hinweis, kein Blocker. |
| 0.5 | `ResilienceRegistry` + `external_api` CircuitBreaker | `main.py:lifespan` (~143–161), `core/resilience.py` | Globale Resilience-Registry vor I/O. |
| 1 | `init_db()` oder `get_engine()` | `main.py:lifespan` (~168–176), `db/session.py:init_db` | DB als SSoT; Retries bei Connect, danach `raise` wenn final fehlschlägt. |
| 1b | Emergency-States in DB clearen | `main.py:lifespan` (~178–193), `ActuatorRepository` | Non-fatal; verhindert stale Not-Aus nach Restart. |
| 1c | `init_db_circuit_breaker()` | `main.py:lifespan` (~195–197) | DB-Breaker nach erreichbarer DB. |
| 2 | `MQTTClient.get_instance().connect()` | `main.py:lifespan` (~199–211), `mqtt/client.py:connect` | Sync-Connect + `loop_start()` (Paho-Thread); bei Fehler **non-fatal**, Server startet degraded. |
| 2b | Retained Emergency auf Broker leeren | `main.py:lifespan` (~213–227) | Nur wenn connected; verhindert Replay-Noise. |
| 3 | `Subscriber`-Instanz, `set_main_loop`, `mqtt_client.set_subscriber` | `main.py:lifespan` (~229–246), `mqtt/subscriber.py:__init__` | Handler-Registry + ThreadPool; Main-Loop-Binding für Async-DB in Handlern. |
| 3.1–3.2 | Alle MQTT-Handler registrieren (`register_handler`) | `main.py:lifespan` (~254–317) | Wildcards `kaiser/+/esp/...`; Reihenfolge egal für Matching, aber vor Subscribe muss Registry voll sein. |
| 3.1b | `MQTTCommandBridge` + Setter in ACK-/Heartbeat-Handlern | `main.py:lifespan` (~321–332) | ACK-Warten für Zone/Subzone-Pfade. |
| 3.4 | `init_central_scheduler()` | `main.py:lifespan` (~334–339), `core/scheduler.py:init_central_scheduler` | Startet `AsyncIOScheduler` (APScheduler). |
| 3.4.1 | `init_simulation_scheduler` | `main.py:lifespan` (~341–351) | Mock-ESP-Publishing; Jobs später über CentralScheduler. |
| 3.4.x | Mock-Actuator-Handler registrieren | `main.py:lifespan` (~353–388) | Async-Handler für Simulationsziele. |
| 3.4.2 | `MaintenanceService.start()` | `main.py:lifespan` (~391–402), `services/maintenance/service.py` | Registriert Cron/Interval-Jobs am CentralScheduler. |
| 3.4.3–3.4.6 | Metriken, Digest, Email-Retry, Alert-Suppression, optional DB-Backup | `main.py:lifespan` (~404–508) | Interval/Cron am selben Scheduler. |
| 3.5 | Mock-Recovery, `simulation_config`-Rebuild | `main.py:lifespan` (~510–552) | DB-first; non-fatal bei Fehler. |
| 3.5b | God-Kaiser `ensure` / Orphans / Zones | `main.py:lifespan` (~554–571) | Non-fatal. |
| 3.6 | Sensor-Type Auto-Registration | `main.py:lifespan` (~573–592) | Non-fatal. |
| 3.7 | Sensor-Schedule-Recovery | `main.py:lifespan` (~594–620) | **Kein Catch-up** verpasster Läufe (Kommentar in `main.py`); non-fatal. |
| 4 | `subscribe_all()` | `main.py:lifespan` (~622–630), `mqtt/subscriber.py:subscribe_all` | Nur wenn MQTT connected; sonst Reconnect-Pfad in Client. |
| 5 | `WebSocketManager.get_instance()` + `initialize()` | `main.py:lifespan` (~632–638), `websocket/manager.py` | Loop-Referenz für thread-sichere Broadcasts. |
| 6 | Safety, Actuator, Publisher, LogicEngine + `start()`, LogicScheduler + `start()`, `set_logic_engine` | `main.py:lifespan` (~640–762), `services/logic_engine.py`, `services/logic_scheduler.py` | Eine DB-Session-Iteration; Engine/Scheduler starten `asyncio.create_task`-Loops. |
| 6.0 | Inbound-Replay (einmalig) + `RuntimeMode.RECOVERY_SYNC` | `main.py:lifespan` (~764–775) | Kritische Inbox abarbeiten (`replay_pending_events(limit=500)`). |
| 6.0b | `_inbound_replay_worker` via `asyncio.create_task` | `main.py:lifespan` (~777–795) | Endlosschleife alle 5s, `replay_pending_events(limit=200)`. |
| 6.1–6.3 | Plugin-Sync, Daily Diagnostic (optional), Plugin-Cron aus DB | `main.py:lifespan` (~797–942) | Non-fatal bei Teilfehlern. |
| 7 | Resilience-Status loggen, `transition(NORMAL_OPERATION \| DEGRADED_OPERATION)` | `main.py:lifespan` (~944–965) | Degraded wenn MQTT nicht connected. |
| — | `yield` | `main.py:lifespan` (~967) | Ab hier akzeptiert ASGI Traffic; Middleware/Router bereits am `app`-Objekt angehängt. |

**Hinweis Router/Middleware:** `FastAPI`-App, CORS, `RequestIdMiddleware`, Prometheus-Instrumentator, `include_router` erfolgen **auf Modulebene** nach Definition von `lifespan` (`main.py` ab ~1098). Das ist beim Import des Moduls gesetzt, unabhängig davon ob `lifespan` schon durchlief.

---

## 2. Shutdown / Drain

Anker: `main.py:lifespan` ab „SHUTDOWN“ (~973 ff.).

| Phase | Aktion | Flush vs. hart | Timeouts / Warteverhalten |
|-------|--------|----------------|---------------------------|
| State | `RuntimeMode.SHUTDOWN_DRAIN`, `set_logic_liveness(False)` | — | — |
| 1 | `LogicScheduler.stop()` | Cancel des Scheduler-Tasks, `await` mit `CancelledError`-Fangen | Task-Cancel |
| 2 | `LogicEngine.stop()` | Cancel `_evaluation_loop`-Task | Task-Cancel |
| 2.1 | `SequenceActionExecutor.shutdown()` | Cleanup-Task des Executors | `sequence_executor.py` |
| 2.2 | `MQTTCommandBridge.shutdown()` | `cancel()` auf pending `Future`s | — |
| 2.2b | `_inbound_replay_task.cancel()` + `await` | Cooperative cancel | `CancelledError` verschluckt |
| 2.3 | `MaintenanceService.stop()` | Entfernt Maintenance-Jobs vom Scheduler | Exceptions non-fatal geloggt |
| 2.4 | `SimulationScheduler.stop_all_mocks()` | Mock-Simulationen stoppen | try/except logged |
| 2.5 | `shutdown_central_scheduler()` | `CentralScheduler.shutdown(wait=True)` — Default **timeout=30s** in `core/scheduler.py:shutdown` wird an `APScheduler.shutdown(wait=...)` übergeben (kein explizites asyncio-Timeout im Aufruf aus `main`) | APScheduler-internes Wait |
| 3 | `WebSocketManager.shutdown()` | Schließt alle WS-Verbindungen | Pro Connection `close()` |
| 4 | `Subscriber.shutdown(wait=True, timeout=30.0)` | `ThreadPoolExecutor.shutdown(wait=..., cancel_futures=True)` | **30s** (siehe `subscriber.py:shutdown`); bei älterem Python ohne `cancel_futures` Fallback |
| 5 | MQTT: Server-Status retained publish „offline“, dann `mqtt_client.disconnect()` | `loop_stop` + `disconnect` | — |
| 6 | `dispose_engine()` | Async Engine dispose | — |

**Störfall Startup bricht vor `yield`:** Bei Exception im großen `try` vor `yield` führt `except` zu `raise` (`main.py` ~969–971). Der Shutdown-Block **danach** wird in diesem Ausführungspfad **nicht** erreicht (kein umschließendes `finally`). Folge: bei teilweise initialisiertem MQTT/DB kann Aufräumen ausbleiben — **Lücke** (siehe Gap-Liste).

---

## 3. Background-Arbeit (Tabelle)

| Background-Task / Mechanismus | Owner-Modul | Trigger | Shutdown |
|------------------------------|-------------|---------|----------|
| Paho-MQTT `loop_start()` Netzwerk-Thread | `mqtt/client.py` (`MQTTClient.connect`) | Dauerhaft ab Connect | `disconnect()` → `loop_stop()` |
| MQTT-Handler-Dispatch `ThreadPoolExecutor` | `mqtt/subscriber.py` | Pro eingehender Message `executor.submit` | `Subscriber.shutdown(...)` |
| Async-Handler auf Main-Loop via `run_coroutine_threadsafe` | `mqtt/subscriber.py:_execute_handler` | Pro Message | Executor-Shutdown wartet auf Worker |
| Handler-Timeout (async) | `mqtt/subscriber.py` | `future.result(timeout=30.0)` | — |
| Logic Engine `_evaluation_loop` | `services/logic_engine.py` | `create_task` in `start()`, Sleep 1s | `stop()` cancel |
| Logic Scheduler `_scheduler_loop` | `services/logic_scheduler.py` | `create_task` in `start()`, Intervall `settings.performance.logic_scheduler_interval_seconds` | `stop()` cancel |
| SequenceActionExecutor: laufende Sequenzen + `_cleanup_loop` | `services/logic/actions/sequence_executor.py` | `create_task` bei Sequenzstart / Cleanup | `shutdown()` |
| CentralScheduler (APScheduler) alle Jobs | `core/scheduler.py` + Registranten in `main.py`, `maintenance/service.py`, … | Cron/Interval | `shutdown_central_scheduler` |
| `_inbound_replay_worker` | `main.py:lifespan` | Alle 5s | Cancel in Shutdown |
| Inbox append/mark (kritische Topics) | `subscriber.py` + `services/inbound_inbox_service.py` | Live-Messages | Persistenz Datei; kein separater Task |

Simulation/Mock: Läufe hängen an CentralScheduler-Jobs (`SimulationScheduler`); Shutdown über `stop_all_mocks` vor Scheduler-Stop.

---

## 4. Replay / Inbound-Queues

| Mechanismus | Persistent? | Wo im Code | Grenzen |
|-------------|-------------|------------|---------|
| **Durable Inbound Inbox** (kritische MQTT-Klassen) | Ja, Datei JSONL unter `%TEMP%/god-kaiser-inbox/critical-inbound.jsonl` | `services/inbound_inbox_service.py`; Anbindung in `mqtt/subscriber.py` (`_is_critical_topic`, `append`, `replay_pending_events`) | Kapazität **20000** Events; bei Overflow wird ältestes acked oder ältestes Event gedroppt (**Warn-Log**). |
| **Kritische Topics** (Inbox) | — | `subscriber.py:_is_critical_topic` | Sensor `.../sensor/+/data`, `.../system/error`, `.../config_response`, `.../intent_outcome`, `.../intent_outcome/lifecycle`. |
| **Startup-Replay** | — | `main.py` ruft `replay_pending_events(limit=500)` auf; Worker `limit=200` alle 5s | Kein unbegrenztes Nachholen pro Tick; fehlgeschlagene Events bleiben `pending` / `attempts++`. |
| **MQTT QoS / Broker** | Broker-seitig | Subscribe in `subscriber.py:subscribe_all` | Heartbeat QoS 0 (kein At-least-once); andere Defaults meist QoS 1; Config Response QoS 2. |
| **MQTT Offline-Buffer (Publish)** | RAM (Client) | `mqtt/client.py` (Docstring/Init `_init_offline_buffer`) | Entkoppelt von Inbound-Inbox; betrifft ausgehende Publishes bei Disconnect. |
| **HTTP** | Kein generelles Replay | — | Keine persistente HTTP-Inbound-Queue im Lifespan. |
| **Sensor-Schedules nach Ausfall** | Nein (laut Kommentar) | `main.py` Step 3.7 | Verpasste Cron-Läufe werden nicht nachgeholt. |

**Befund:** Inbound-Replay für **definierte kritische MQTT-Typen** ist **ja (persistent + periodischer Worker)**. Für übrige Topics und HTTP **nein**. Sensor-Schedules **teilweise** (Recovery der Jobs, aber kein Catch-up).

---

## 5. Trace-Beispiel (Happy Path, kurz)

1. ASGI ruft `lifespan` Startup auf — `main.py:lifespan` Eintritt.  
2. `MQTTClient.connect` — `mqtt/client.py:connect` → `loop_start()`, Callbacks gesetzt.  
3. `Subscriber(...)` — `mqtt/subscriber.py:__init__` registriert `set_on_message_callback(self._route_message)`.  
4. `register_handler("kaiser/+/esp/+/sensor/+/data", sensor_handler.handle_sensor_data)` — `main.py` + `subscriber.py:register_handler`.  
5. `subscribe_all()` — `subscriber.py:subscribe_all` → `MQTTClient.subscribe` pro Pattern.  
6. Broker liefert Message → Paho-Thread → `_route_message` → JSON-Parse → `_find_handler` (`TopicBuilder.matches_subscription`) → `executor.submit(_execute_handler, ...)`.  
7. `_execute_handler` erkennt async Handler → `run_coroutine_threadsafe(_run_handler_with_cid(...), main_loop)` — `subscriber.py`.  

Kopplung **main.py ↔ Handler-Paket:** Handler werden in `main.py` **direkt** als Submodule importiert (`from .mqtt.handlers import sensor_handler, ...`, Zeilen ~39–54); das Paket `mqtt/handlers/__init__.py` exportiert die Module-Namen für saubere Imports, die **Registrierung** erfolgt aber ausschließlich in `main.py` (Detailtiefe S5).

---

## 6. Störfall (codebasiert)

### 6.1 MQTT-Connect fehlgeschlagen oder verzögert

- `connect()` gibt `False` bei Timeout (**10s** Busy-Wait in `mqtt/client.py` ~303–307) oder Exception.  
- `main.py` loggt Warning, setzt `degraded_reason`, **kein** `subscribe_all()`.  
- Handler sind trotzdem registriert; `mqtt_client.set_subscriber` ermöglicht Re-Subscribe auf Reconnect (Client-seitig, siehe Subscriber an Client).  
- `RuntimeMode`: am Ende `DEGRADED_OPERATION` wenn nicht connected (`main.py` ~964–965).

### 6.2 DB-Init final fehlgeschlagen

- `init_db` retry mit Backoff, dann `raise` (`db/session.py` ~199–209).  
- Propagiert aus `lifespan`-`try`; `yield` wird nicht erreicht → **kein** regulärer Shutdown-Block der Lifespan-Funktion (siehe Abschnitt 2).  
- MQTT könnte bereits verbunden sein → **Risiko hängender Ressourcen** ohne symmetrisches Cleanup in diesem Pfad.

---

## 7. Gap-Liste (P0 / P1 / P2) — Bezug G2 / G4

*Hinweis: Primärdokument G1–G5 war in der Auftragsreferenz nicht mehr im Workspace; G2/G4 hier als „stille Verluste / Recovery-Sichtbarkeit“ interpretiert.*

| ID | Schwere | Bezug | Befund |
|----|---------|-------|--------|
| P1 | P1 | G4 Recovery / Ressourcen | Startup-Exception vor `yield`: kein `finally`-Shutdown in `lifespan` — MQTT-Thread/Pool können ohne symmetrisches Dispose bleiben (`main.py` Struktur). |
| P2 | P2 | G2 Stille Verluste | Inbox bei Kapazität 20k: Drop ältester Einträge mit Warnung — für kritische Events nachvollziehbar geloggt, operativ aber Datenverlust möglich (`inbound_inbox_service.py:append`). |
| P2 | P2 | G2 | Nicht-kritische MQTT-Messages ohne Inbox: kein Server-Replay nach Crash (by design). |
| P2 | P2 | Wartbarkeit | `ESPRepository` in `main.py` Step 6: kein expliziter Top-Level-Import; Abhängigkeit von vorherigem `import` innerhalb Step 3.7 im gleichen Funktionsblock (funktioniert bei normalem Ablauf, schwer lesbar/fragil). |

---

## 8. Abnahmekriterien (Selbstcheck)

- [x] Jeder genannte Background-Task hat einen Codeanker (Modul/Funktion).  
- [x] MQTT-Handler-Registrierung mit `main.py` + `mqtt/handlers/__init__.py` verknüpft (Export vs. Registrierungsort benannt).  
- [x] Keine unbelegten „vermutlich“-Aussagen ohne Dateiangabe.

---

*Ende Report S0.*
