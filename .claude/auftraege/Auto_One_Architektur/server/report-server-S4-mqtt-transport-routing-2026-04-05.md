# Report S4 — MQTT: Transport, Subscription-Routing, Publishing (El Servador)

**Datum:** 2026-04-05  
**Auftrag:** `auftrag-server-S4-mqtt-transport-routing-publishing-2026-04-05.md`  
**Code-Wurzel:** `El Servador/god_kaiser_server/src/mqtt/` (+ `main.py` Registrierung)

---

## 1. Textdiagramm: Ein- und Ausgang

### Inbound (Broker → Handler)

```
Mosquitto
  → paho Client (network thread, loop_start)
      → MQTTClient._on_message(topic, utf-8 payload)
          → increment_mqtt_received
          → globales Callback: Subscriber._route_message(topic, payload_str)
              → leerer Payload: DEBUG + return (retain-clear)
              → json.loads → bei Fehler: ERROR, messages_failed++
              → Correlation: generate_mqtt_correlation_id(esp_id, topic_suffix, seq)
              → _find_handler: erstes Pattern mit TopicBuilder.matches_subscription()
              → optional: InboundInbox.append für „critical topics“
              → ThreadPoolExecutor.submit(_execute_handler, …)
                    → async Handler: asyncio.run_coroutine_threadsafe(
                          _run_handler_with_cid → handler, MAIN LOOP)
                          → Timeout 30s / Fehler → ERROR + messages_failed++
                    → sync Handler: direkt im Worker-Thread + ContextVar set_request_id
              → kein Handler: WARNING „No handler registered“
```

**Hinweis:** Die **QoS der Subscription** (0/1/2) steuert nur die Broker-Zustellgarantie an den Client, nicht die Handler-Logik. Zuordnung erfolgt ausschließlich über registrierte Patterns + `matches_subscription`.

### Outbound (Entscheidung → Broker)

```
Domain (API / Service / Handler / Simulation / Bridge)
  → typisch TopicBuilder.build_* oder fester Topic-String
  → entweder:
        A) Publisher.* → _publish_with_retry → MQTTClient.publish (JSON-String)
        B) MQTTClient.publish direkt (Heartbeat-ACK, LWT-Clear, Simulation, Zone fire-and-forget, …)
        C) MQTTCommandBridge.send_and_wait_ack → MQTTClient.publish (QoS 1, Future auf ACK)
  → MQTTClient.publish:
        → CircuitBreaker.allow_request? nein → _schedule_buffer_add + WARNING + return False
        → nicht connected → ERROR + record_failure + Buffer + return False
        → paho publish → rc OK → record_success, increment_mqtt_published
        → sonst ERROR + record_failure + increment_mqtt_publish_error
```

---

## 2. Parallelität und gemeinsame Strukturen

| Mechanismus | Ort | Zweck |
|-------------|-----|--------|
| `ThreadPoolExecutor` (`max_workers` = `MQTT_SUBSCRIBER_MAX_WORKERS`, Default 10) | `subscriber.py` | MQTT-Callback blockiert nicht; Worker triggert Async auf Main-Loop |
| Main-Event-Loop | `Subscriber.set_main_loop()` aus `main.py` | SQLAlchemy AsyncEngine / DB nur auf diesem Loop |
| `asyncio.run_coroutine_threadsafe` | `subscriber.py`, `client.py` (Buffer/Flush) | Thread-sicheres Scheduling auf Main-Loop |
| `asyncio.Lock` | `offline_buffer.py` | Serialisiert Buffer-Zugriff |
| `threading.Lock` | `client.py` (Disconnect-Log-Throttling), `_MQTTDisconnectRateLimiter` | Rate-Limit / Spam-Schutz |
| `deque(maxlen)` | `MQTTOfflineBuffer` | Bounded buffer; bei Voll: älteste Einträge fallen implizit weg |
| `CircuitBreaker` (Registry `mqtt`) | `client.py` | Publish bei OPEN → Buffer statt sofortiger Sendung |

**Wichtig:** `Publisher._publish_with_retry` nutzt **`time.sleep`** im Retry-Pfad — läuft synchron im aufrufenden Thread (meist FastAPI Worker). Das blockiert den HTTP-Worker, nicht den MQTT-Netzwerk-Thread.

---

## 3. Resilience: Reconnect, Offline-Puffer, Ausfall

| Aspekt | Verhalten (Ist-Code) |
|--------|----------------------|
| Reconnect | paho `reconnect_delay_set(1, 60)` + `loop_start`; bei Erfolg `MQTTClient._on_connect`: `connected=True`, CircuitBreaker reset, **Server-Status online** (retain), **`subscribe_all()`** erneut |
| Disconnect | `_on_disconnect`: `connected=False`, Grund-Metrik, **zeitbasiertes Log-Throttling** (max. ca. 1×/Minute für „broker unavailable“) |
| Offline-Buffer | Aktiv wenn CB OPEN **oder** nicht connected: `_schedule_buffer_add` (über gespeicherten Event-Loop oder `create_task`) |
| Buffer voll | `deque(maxlen)` → neues `append` verwirft älteste Nachricht; `_messages_dropped++`, WARNING mit „oldest message dropped“ |
| Flush nach Reconnect | `_flush_offline_buffer` → `flush_all` in Batches (`OFFLINE_BUFFER_FLUSH_BATCH_SIZE`, Default 50), Pause 0.1s zwischen Batches |
| Flush-Fehler | Pro Nachricht bis 3 Versuche, danach DROP + WARNING |
| Konfiguration | `OFFLINE_BUFFER_MAX_SIZE` (Default 1000), `OFFLINE_BUFFER_FLUSH_BATCH_SIZE` (Default 50) |

---

## 4. Störfall mit sichtbarem Log (Abnahmekriterium)

**Publish-Fehler (Broker da, Rückgabe ≠ SUCCESS):**  
`MQTTClient.publish` → `logger.error(f"Publish failed for topic {topic}: {result.rc}")` + `increment_mqtt_publish_error` + CircuitBreaker `record_failure`.

**Publish bei getrenntem Client:**  
`logger.error("Cannot publish: MQTT client not connected")` + optional Buffer + CB-Failure.

**Ungültiges JSON inbound:**  
`logger.error(f"Invalid JSON payload on topic {topic}: …")`.

---

## 5. Registrierte Subscriptions (`main.py` → `Subscriber.subscribe_all`)

Jede Zeile = ein `register_handler`-Pattern; QoS aus `subscribe_all()`-Heuristik.

| # | Pattern | QoS | Handler (Kurz) |
|---|---------|-----|----------------|
| 1 | `kaiser/+/esp/+/sensor/+/data` | 1 | Sensor |
| 2 | `kaiser/+/esp/+/actuator/+/status` | 1 | Actuator Status |
| 3 | `kaiser/+/esp/+/actuator/+/response` | 1 | Actuator Response |
| 4 | `kaiser/+/esp/+/actuator/+/alert` | 1 | Actuator Alert |
| 5 | `kaiser/+/esp/+/system/heartbeat` | 0 | Heartbeat |
| 6 | `kaiser/+/discovery/esp32_nodes` | 1 | Discovery |
| 7 | `kaiser/+/esp/+/config_response` | 2 | Config ACK |
| 8 | `kaiser/+/esp/+/zone/ack` | 1 | Zone ACK |
| 9 | `kaiser/+/esp/+/subzone/ack` | 1 | Subzone ACK |
| 10 | `kaiser/+/esp/+/system/will` | 1 | LWT |
| 11 | `kaiser/+/esp/+/system/error` | 1 | Error Event |
| 12 | `kaiser/+/esp/+/system/intent_outcome` | 1 | Intent Outcome |
| 13 | `kaiser/+/esp/+/system/intent_outcome/lifecycle` | 1 | Intent Lifecycle |
| 14 | `kaiser/+/esp/+/system/diagnostics` | 1 | Diagnostics |
| 15 | `kaiser/+/esp/+/actuator/+/command` | 1 | Mock Actuator Command |
| 16 | `kaiser/+/esp/+/actuator/emergency` | 1 | Mock Emergency |
| 17 | `kaiser/broadcast/emergency` | 1 | Mock Broadcast Emergency |

**Verweis S5:** Semantik, Validierung und Persistenz der Payloads liegen in den jeweiligen Handlern unter `src/mqtt/handlers/` — dort ist die fachliche Vollständigkeit zu prüfen.

**Zusatz (nicht über `subscribe_all`, sondern Mock-Simulation):** `simulation/scheduler.py` abonniert u. a. Emergency-Patterns separat mit **QoS 2** für Mock-Clients — parallel zur Server-Subscription (Mock-Pfad).

---

## 6. Tabelle: Topic-Klasse | Pattern / Builder | QoS | Retain | Producer-Typ

*Outbound-Seite: typische Server-Publishes. QoS aus `constants` / Aufrufstelle.*

| Topic-Klasse | Gebäude / Topic | QoS | Retain | Producer-Typ |
|--------------|-----------------|-----|--------|----------------|
| Actuator Command | `TopicBuilder.build_actuator_command_topic` | 2 (`QOS_ACTUATOR_COMMAND`) | false | `Publisher.publish_actuator_command` → Services (z. B. ActuatorService) |
| Sensor Command | `build_sensor_command_topic` | 2 (`QOS_SENSOR_COMMAND`) | false | `Publisher.publish_sensor_command` |
| Config (kombiniert) | `build_config_topic` | 2 (`QOS_CONFIG`) | false | `Publisher.publish_config` → ESPService o. ä. |
| Sensor/Actuator Config (GPIO) | `build_sensor_config_topic` / `build_actuator_config_topic` | 2 | false | `Publisher` |
| System Command | `build_system_command_topic` | 2 (`QOS_CONFIG`) | false | `Publisher.publish_system_command` |
| Pi-Enhanced Response | `build_pi_enhanced_response_topic` → **`…/sensor/{gpio}/processed`** | 1 (`QOS_SENSOR_DATA`) | false | `Publisher.publish_pi_enhanced_response` (aus Sensor-Handler) |
| Zone Assign | `build_zone_assign_topic` + `client.publish` | 1 (`QOS_SENSOR_DATA` in Zone-Service) | false | ZoneService / Bridge-Kombinationen |
| Subzone assign/remove/safe | `TopicBuilder` + `SubzoneService` | 1 | false | SubzoneService |
| Zone/Subzone **ACK-wartend** | Bridge baut Topic; `send_and_wait_ack` | 1 (`QOS_SENSOR_DATA`) | false | MQTTCommandBridge |
| Heartbeat ACK | dynamisch + `MQTTClient.publish` | 1 | false | HeartbeatHandler |
| LWT Clear (ESP) | `build_lwt_topic` + leerer Payload | 1 | **true** | HeartbeatHandler |
| Server Status (online) | `build_server_status_topic` | 1 | **true** | `MQTTClient._on_connect` |
| Server LWT | `will_set` | 1 | **true** | `MQTTClient.connect` |
| Simulation | Callback `mqtt_publish_for_simulation` | meist 1 | false | `main.py` → `mqtt_client.publish` |
| Emergency Broadcast | `kaiser/broadcast/emergency` | **1** | false | `api/v1/actuators.py` (direkt `client.publish`) |
| Clear Emergency (pro ESP) | `build_actuator_emergency_topic` | 1 | false | `actuators.py` clear_emergency |
| Retained Emergency löschen | `kaiser/broadcast/emergency` leer | **0** | **true** | `main.py` Startup |

---

## 7. Drift: `MQTT_TOPICS.md` ↔ Ist-Code (Priorität)

| Priorität | Befund |
|-----------|--------|
| **P0** | **`sensor/batch`:** Referenz listet Topic + Handler `handle_sensor_batch`; im Repo **keine** `register_handler`-Zeile und **kein** Batch-Handler unter `mqtt/handlers/`. ESP-Batch erreicht den Server **nicht** über die dokumentierte Pipeline. |
| **P1** | **`pi_enhanced/response` vs. `sensor/.../processed`:** `constants.MQTT_TOPIC_ESP_PI_ENHANCED_RESPONSE` = `…/pi_enhanced/response`, aber `TopicBuilder.build_pi_enhanced_response_topic` publiziert **`…/sensor/{gpio}/processed`**. Doku/Constants vs. effektiver Publish-Pfad. |
| **P1** | **Subscriptions nicht abgedeckt:** `MQTT_SUBSCRIBE_ESP_HEALTH` (`…/health/status`) und **`pi_enhanced/request`** sind in `constants.py` definiert, aber in **`main.py` nicht registriert**. |
| **P1** | **`subzone/status` (ESP→Server):** in `constants` als Topic vorhanden, **kein** Subscriber-Pattern in `main.py`. |
| **P2** | **Global Emergency QoS:** `MQTT_TOPICS.md` nennt für `kaiser/broadcast/emergency` oft **QoS 2**; **`actuators.py` emergency_stop** nutzt **`qos=1`**. |
| **P2** | **Diagnostics:** Doku nennt häufig ESP-Publish QoS 0; Server subscribt mit **QoS 1** (Default-Zweig in `subscribe_all`) — fachlich ok, aber Doku sollte „Subscription-QoS Server“ vs. „Publish-QoS ESP“ trennen. |
| **P2** | **`TopicBuilder.parse_topic`:** enthält **keinen** Eintrag für `parse_system_diagnostics_topic`, obwohl Parser existiert — kleine interne Inkonsistenz. |

---

## 8. Gap-Liste G2 / G3 (nur MQTT-Transport-Schicht)

### G2 — stiller / leiser Verlust

- **Kein Handler:** nur `WARNING`, keine Dead-Letter-Queue.
- **OfflineBuffer voll:** älteste Nachrichten fallen still aus dem `deque` (zusätzlich explizite Drop-Zähler + Log bei „full“).
- **Buffer-Flush:** nach 3 fehlgeschlagenen Publish-Versuchen **Drop** mit WARNING.
- **Publisher Retry erschöpft:** `False` + ERROR-Log; **kein** automatischer persistenter Outbox-Ersatz auf dieser Schicht (außerhalb Inbound-Inbox für definierte „critical“ Topics).

### G3 — Korrelation

- **Inbound:** `generate_mqtt_correlation_id` + `set_request_id` / `_run_handler_with_cid` für Logs und nachgelagerte Services.
- **Critical Inbound:** optionale durable `InboundInbox`-Zeile vor Handler (Sensor data, config_response, system/error, intent_outcome(+lifecycle)).
- **Outbound Notfall:** `incident_correlation_id` im Emergency-Stop-MQTT-Payload und Audit (API-Schicht, nicht im reinen `Publisher`).

---

## 9. Abnahme: „Jede Subscription … in S4 oder S5“

- **S4 (diese Datei):** sämtliche über `Subscriber.subscribe_all()` aktiven Patterns sind in Abschnitt 5 gelistet; Transport, QoS-Heuristik, Routing und Publish-Pfade sind abgedeckt.
- **S5:** Verhalten bei validem/invalidem Payload, DB-Seiteneffekte und fachliche ACK-Semantik pro Handler.

---

*Ende Report S4*
