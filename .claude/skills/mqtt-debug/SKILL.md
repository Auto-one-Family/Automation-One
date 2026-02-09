---
name: mqtt-debug
description: |
  MQTT-Debug Skill fuer AutomationOne IoT-Framework.
  Wissensbasis fuer MQTT-Traffic-Analyse, Broker-Health,
  Message-Flow-Debugging, Circuit Breaker Diagnose,
  Offline-Buffer-Status, Client-Disconnect-Analyse.
  Fokus: Was passiert auf MQTT-Protokoll-Ebene.
allowed-tools: Read, Grep, Glob, Bash
context: inline
---

# MQTT Debug Skill

> **Fokus:** MQTT-Protokoll-Ebene - Traffic, Broker, Message-Flow
> **NICHT:** Handler-Verarbeitung (server-debug), Hardware (esp32-debug)

---

## 1. Topic-Hierarchie

**Schema:** `kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}`

| # | Topic-Pattern | Richtung | QoS | Retain |
|---|---------------|----------|-----|--------|
| 1 | `.../sensor/{gpio}/data` | ESP→Server | 1 | false |
| 2 | `.../sensor/batch` | ESP→Server | 1 | false |
| 3 | `.../sensor/{gpio}/command` | Server→ESP | 2 | false |
| 4 | `.../sensor/{gpio}/response` | ESP→Server | 1 | false |
| 5 | `.../actuator/{gpio}/command` | Server→ESP | 2 | false |
| 6 | `.../actuator/{gpio}/status` | ESP→Server | 1 | false |
| 7 | `.../actuator/{gpio}/response` | ESP→Server | 1 | false |
| 8 | `.../actuator/{gpio}/alert` | ESP→Server | 1 | false |
| 9 | `.../actuator/emergency` | Server→ESP | 1 | false |
| 10 | `.../system/heartbeat` | ESP→Server | 0 | false |
| 11 | `.../system/heartbeat/ack` | Server→ESP | 0 | false |
| 12 | `.../system/command` | Server→ESP | 2 | false |
| 13 | `.../system/response` | ESP→Server | 1 | false |
| 14 | `.../system/diagnostics` | ESP→Server | 0 | false |
| 15 | `.../system/will` | Broker→Server | 1 | **true** |
| 16 | `.../system/error` | ESP→Server | 1 | false |
| 17 | `.../status` | ESP→Server | 1 | false |
| 18 | `.../safe_mode` | ESP→Server | 1 | false |
| 19 | `.../config` | Server→ESP | 2 | false |
| 20 | `.../config_response` | ESP→Server | 2 | false |
| 21 | `.../zone/assign` | Server→ESP | 1 | false |
| 22 | `.../zone/ack` | ESP→Server | 1 | false |
| 23 | `.../subzone/assign` | Server→ESP | 1 | false |
| 24 | `.../subzone/remove` | Server→ESP | 1 | false |
| 25 | `.../subzone/ack` | ESP→Server | 1 | false |
| 26 | `.../subzone/status` | ESP→Server | 1 | false |
| 27 | `.../subzone/safe` | Server→ESP | 1 | false |
| 28 | `.../library/*` | bidirektional | 1 | false |
| 29 | `.../mqtt/auth_update` | Server→ESP | 1 | false |
| 30 | `.../mqtt/auth_status` | ESP→Server | 1 | false |
| 31 | `kaiser/broadcast/emergency` | Server→ALL | 2 | false |
| 32 | `kaiser/broadcast/system_update` | Server→ALL | 1 | false |

**QoS-Strategie:** QoS 0 = Latenz-optimiert (Heartbeat), QoS 1 = At-least-once (Daten), QoS 2 = Exactly-once (Commands)

---

## 2. Communication Flows

| Flow | Beschreibung | Latenz | Kern-Topics |
|------|-------------|--------|-------------|
| **A** | Sensor-Daten (ESP→Server→Frontend) | 50-230ms | sensor/{gpio}/data → WS: sensor_data |
| **B** | Actuator-Steuerung (Frontend→Server→ESP) | 100-290ms | actuator/{gpio}/command → response + status |
| **C** | Emergency Stop (Server→ALL) | <100ms | broadcast/emergency → safe_mode + alert |
| **D** | Heartbeat (ESP→Server→Frontend) | <1s | system/heartbeat → heartbeat/ack, WS: esp_health |
| **E** | Config Update (Server→ESP) | <5s | config (QoS 2) → config_response (QoS 2) |
| **F** | Zone Assignment (Server→ESP) | <5s | zone/assign → zone/ack |
| **G** | Logic Engine (Sensor→Server→Actuator) | varies | sensor/data → Logic Engine → actuator/command (Cross-ESP) |

**Registration Gate Flow:** ESP connect → Gate CLOSED → Heartbeat (bypass) → ACK → Gate OPEN → alle Publishes erlaubt. Fallback: Gate oeffnet nach 10s.

---

## 3. ESP32 MQTT-Client

**Dateien:** `El Trabajante/src/services/communication/mqtt_client.cpp` (~940 LOC), `topic_builder.cpp` (~225 LOC)

### Circuit Breaker

| Parameter | Wert |
|-----------|------|
| Failure Threshold | 5 → OPEN |
| Recovery Timeout | 30s → HALF_OPEN |
| Half-Open Test | 10s |
| States | CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN |

### Offline Buffer

| Parameter | Wert |
|-----------|------|
| MAX_OFFLINE_MESSAGES | 100 |
| Verhalten bei voll | Neue Messages verworfen |
| Flush | Nach Reconnect, alle Messages |

### Registration Gate

| Parameter | Wert |
|-----------|------|
| Timeout | 10s (REGISTRATION_TIMEOUT_MS) |
| Heartbeat | Bypass (immer erlaubt) |
| Alle anderen Publishes | Blockiert bis ACK oder Timeout |

### Reconnect

| Parameter | Wert |
|-----------|------|
| Base Delay | 1s |
| Max Delay | 60s |
| Berechnung | BASE * 2^attempts, capped |

### LWT Setup

- Topic: `kaiser/{id}/esp/{esp_id}/system/will`
- Payload: `{"status":"offline","reason":"unexpected_disconnect","timestamp":...}`
- QoS: 1, **Retain: true**

---

## 4. Server MQTT-Client

**Core:** `El Servador/god_kaiser_server/src/mqtt/` (client.py, publisher.py, subscriber.py, topics.py, offline_buffer.py)

### Client

- Singleton Pattern (`get_instance()`)
- paho-mqtt, Auto-Reconnect (`reconnect_delay_set(min=1, max=60)`)
- Circuit Breaker (configurable via settings)
- Disconnect-Logging rate-limited (max 1 msg/60s)

### Publisher

- Retry mit Exponential Backoff + Jitter
- Failed messages → Offline-Buffer
- Actuator-Commands: QoS 2, Config: QoS 2

### Subscriber

- Handler Registry, Thread Pool (max_workers=10)
- Wildcard Matching via `TopicBuilder.matches_subscription()`
- Async handlers im MAIN event loop (SQLAlchemy AsyncEngine Binding)

### Offline Buffer

- `collections.deque` (bounded), `asyncio.Lock` (Thread-Safety)
- Auto-flush nach Reconnect, batch-weise mit 0.1s Delay
- Failed messages werden vorne re-queued

### 13 Handler

| Handler | Topic-Pattern |
|---------|---------------|
| sensor_handler | `.../sensor/+/data` |
| actuator_handler | `.../actuator/+/status` |
| actuator_response_handler | `.../actuator/+/response` |
| actuator_alert_handler | `.../actuator/+/alert` |
| heartbeat_handler | `.../system/heartbeat` |
| lwt_handler | `.../system/will` |
| config_handler | `.../config_response` |
| discovery_handler | `.../discovery/esp32_nodes` |
| error_handler | `.../system/error` |
| zone_ack_handler | `.../zone/ack` |
| subzone_ack_handler | `.../subzone/ack` |
| kaiser_handler | `.../actuator/+/command` (Mock-ESP, Paket G) |

---

## 5. Error-Codes Cross-Reference

### ESP32 (3010-3016)

| Code | Name | Debug-Aktion |
|------|------|--------------|
| 3010 | MQTT_INIT_FAILED | WiFi-Status pruefen |
| 3011 | MQTT_CONNECT_FAILED | Broker erreichbar? |
| 3012 | MQTT_PUBLISH_FAILED | Circuit Breaker? |
| 3013 | MQTT_SUBSCRIBE_FAILED | Topic-Format? |
| 3014 | MQTT_DISCONNECT | Netzwerk? Broker restart? |
| 3015 | MQTT_BUFFER_FULL | 100 Messages erreicht |
| 3016 | MQTT_PAYLOAD_INVALID | JSON-Format pruefen |

### Server (5101-5107)

| Code | Name | Debug-Aktion |
|------|------|--------------|
| 5101 | PUBLISH_FAILED | Broker-Connection? |
| 5102 | TOPIC_BUILD_FAILED | Template-Variablen? |
| 5103 | PAYLOAD_SERIALIZATION | JSON-Schema? |
| 5104 | CONNECTION_LOST | Reconnect-Status? |
| 5105 | RETRY_EXHAUSTED | Circuit Breaker? |
| 5106 | BROKER_UNAVAILABLE | Container running? |
| 5107 | AUTHENTICATION_FAILED | mosquitto.conf? |

### Cross-Reference

| ESP32 Error | Server Pendant | Bruchstelle |
|-------------|---------------|-------------|
| 3011 (Connect) | 5104 (Connection Lost) | Broker oder Netzwerk |
| 3012 (Publish) | - | ESP-seitig |
| 3015 (Buffer Full) | - | ESP Offline-Buffer |
| - | 5101 (Publish) | Server-seitig |
| - | 5106 (Broker Unavailable) | Docker/Container |

Vollstaendige Referenz: `.claude/reference/errors/ERROR_CODES.md`

---

## 6. Broker-Konfiguration

### Development (`docker/mosquitto/mosquitto.conf`)

| Setting | Wert |
|---------|------|
| Listener | 1883 (MQTT), 9001 (WebSocket) |
| Auth | anonymous (DEV ONLY) |
| Persistence | true (Named Volume) |
| max_inflight | 20 |
| max_queued | 1000 |
| message_size_limit | 256KB |
| Logging | file + stdout, error/warning/notice/info/subscribe/unsubscribe |

### CI (`.github/mosquitto/mosquitto.conf`)

| Unterschied | Wert |
|-------------|------|
| Persistence | false (stateless) |
| Listener | Nur 1883 (kein WebSocket) |
| Logging | Nur stderr |

### Healthcheck

| Umgebung | Methode | Interval |
|----------|---------|----------|
| Dev | `mosquitto_sub -t $SYS/#` | 30s |
| CI | `mosquitto_pub -t health/check` | 5s |
| E2E | `mosquitto_pub -t health/check` | 3s |

---

## 7. LWT + Retained Messages

### LWT Verhalten

- ESP32 setzt LWT bei Connect (retain=true)
- Broker sendet LWT bei unerwartetem Disconnect
- Server `lwt_handler.py` setzt Device status="offline", Audit-Log, WS-Broadcast

### Stale-LWT Problem

- Nach ESP-Reconnect bleibt alte LWT-Message retained im Broker
- ESP sendet keinen "online" retained → alte "offline" LWT bleibt
- **Diagnose:** `mosquitto_sub -t "kaiser/god/esp/ESP_XXX/system/will" -v -C 1 -W 5 --retained-only`

### Retained-Cleanup

- Nur `system/will` sollte retained sein (alle anderen Topics retain=false)
- Loeschen: `mosquitto_pub -t "kaiser/god/esp/ESP_XXX/system/will" -n -r`
- **ACHTUNG:** Schreibende Operation, User-Bestaetigung erforderlich!

---

## 8. Timing-Erwartungen

| Sequenz | Erwartung | Alarm | Kritisch |
|---------|-----------|-------|----------|
| Heartbeat-Intervall | 60s | Gap >90s | 300s = offline |
| Heartbeat → ACK | <1s | >5s | - |
| Command → Response | <500ms | >2s | - |
| Config → Response | <1s | >5s | - |
| Emergency → Stop | <100ms | >500ms | **SAFETY** |
| Sensor-Daten | 30s default | Gap >45s | - |

---

## 9. Payload-Pflichtfelder

| Message-Typ | Pflichtfelder |
|-------------|---------------|
| **Heartbeat** | `ts`, `uptime`, `heap_free`/`free_heap`, `wifi_rssi` |
| **Sensor-Data** | `ts`/`timestamp`, `esp_id`, `gpio`, `sensor_type`, `raw`/`raw_value`, `raw_mode` |
| **Actuator-Status** | `ts`, `gpio`, `type`/`actuator_type`, `state`, `pwm`/`value`, `runtime_ms`, `emergency` |
| **Config-Response** | `ts`, `esp_id`, `config_id`, `config_applied` |
| **LWT** | `status` ("offline"), `reason`, `timestamp` |

---

## 10. Diagnose-Patterns

### A: Message fehlt

1. Topic korrekt? (Schema: `kaiser/{kaiser_id}/esp/{esp_id}/...`)
2. QoS passend? (QoS 0 kann verloren gehen)
3. Broker running? (`docker compose ps mqtt-broker`)
4. Client connected? (Circuit Breaker Status)
5. Subscription aktiv? (Broker-Log: "subscribe")
6. Registration Gate blockiert? (10s Fallback)

### B: Duplicate Messages

- QoS 1: Duplikate erlaubt (At Least Once)
- QoS 2: Duplikate = Bug
- ESP32 `safePublish()` hat 1 Retry
- Offline-Buffer Replay nach Reconnect

### C: Client Disconnect

- ESP32: Circuit Breaker Serial-Log, WiFi-Errors (3001-3005), Exponential Backoff
- Server: Resilience-Log `[resilience]`, paho.mqtt Logger, Offline-Buffer Status

### D: Config Push fehlgeschlagen

- Flow: Server → config (QoS 2) → ESP → config_response (QoS 2)
- Fehler: Topic nicht subscribed, JSON ungueltig (3016), GPIO-Conflict (1002)

### E: Heartbeat-Gaps

- Erwartung: 60s Intervall, Alarm >90s, Offline >300s
- Ursachen: WiFi-Disconnect (3004), Circuit Breaker OPEN, Watchdog-Reboot

### F: Stale-LWT nach Reconnect

- ESP online, aber alte "offline" LWT retained im Broker
- Pruefe: `mosquitto_sub --retained-only` auf `system/will`
- Loesung: Retained-Cleanup (mit User-Bestaetigung)

### G: Mock-ESP Routing

- `kaiser_handler.py` routet Actuator-Commands fuer Mock-ESPs
- Mock-ESP simuliert Response ohne echte Hardware
- Relevant bei Server-Tests mit SimulationScheduler

---

## 11. Docker Quick-Reference

| Service | Container | Port(s) | Healthcheck |
|---------|-----------|---------|-------------|
| mqtt-broker | automationone-mqtt | 1883, 9001 | `mosquitto_sub -t $SYS/#` |
| el-servador | automationone-server | 8000 | `curl /api/v1/health/live` |
| postgres | automationone-postgres | 5432 | `pg_isready` |

**Netzwerk:** `automationone-net` (bridge). Server verbindet via `mqtt-broker:1883` (Docker DNS).

---

## 12. Code-Locations

### ESP32

| Datei | Pfad |
|-------|------|
| mqtt_client.cpp | `El Trabajante/src/services/communication/mqtt_client.cpp` |
| topic_builder.cpp | `El Trabajante/src/utils/topic_builder.cpp` |
| main.cpp | `El Trabajante/src/main.cpp` |

### Server Core

| Datei | Pfad |
|-------|------|
| client.py | `El Servador/god_kaiser_server/src/mqtt/client.py` |
| publisher.py | `El Servador/god_kaiser_server/src/mqtt/publisher.py` |
| subscriber.py | `El Servador/god_kaiser_server/src/mqtt/subscriber.py` |
| topics.py | `El Servador/god_kaiser_server/src/mqtt/topics.py` |
| offline_buffer.py | `El Servador/god_kaiser_server/src/mqtt/offline_buffer.py` |

### Server Handler

`El Servador/god_kaiser_server/src/mqtt/handlers/` – 13 Handler (siehe Sektion 4)

### Broker Config

| Umgebung | Pfad |
|----------|------|
| Development | `docker/mosquitto/mosquitto.conf` |
| CI | `.github/mosquitto/mosquitto.conf` |

---

*Kompakte Wissensbasis fuer MQTT-Debug. Details in MQTT_TOPICS.md und COMMUNICATION_FLOWS.md*
