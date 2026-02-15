# MQTT Debug Fullstack Analysis

**Erstellt:** 2026-02-08
**Zweck:** Vollstaendige Bestandsaufnahme des mqtt-debug Bereichs fuer Agent-Neuerstellung
**Methode:** Codebase-Analyse aller MQTT-Komponenten (Broker, ESP32-Client, Server-Client, Handler, Tests)

---

## 1. Ist-Zustand: Aktueller Agent + Skill

### 1.1 Agent-Profil (`mqtt-debug-agent.md`)

| Aspekt | Wert |
|--------|------|
| **Name** | mqtt-debug |
| **Model** | sonnet |
| **Tools** | Read, Grep, Glob, Bash |
| **Primaere Quelle** | `logs/mqtt/mqtt_traffic.log` |
| **Report-Output** | `.claude/reports/current/MQTT_DEBUG_REPORT.md` |

**Zwei Modi:**
- **Modus A** (Allgemeine Analyse): Vollstaendige Traffic-Analyse ohne spezifisches Problem
- **Modus B** (Spezifisches Problem): Fokussiert auf konkreten Bug, erweitert eigenstaendig

**Staerken des aktuellen Agenten:**
- Klare Abgrenzung (nur MQTT-Protokoll-Ebene)
- Eigenstaendige Extended Checks (Broker, Server-Health, DB-Lookup)
- Sicherheitsregeln (nur subscribe, nie publish)
- Strukturiertes Report-Format

**Schwaechen / Luecken:**
- Keine Dokumentation der Broker-Config-Details im Agenten selbst
- Kein Wissen ueber docker-compose.ci.yml/e2e.yml Unterschiede
- Timing-Erwartungen nur als Tabelle, nicht als ausfuehrbare Analyse-Logik
- Keine Anleitung fuer Retained-Message-Cleanup
- Kein Wissen ueber Mock-ESP-Handler-Routing (Paket G)

### 1.2 Skill (`mqtt-debug/SKILL.md`)

**Inhalt:** 16 Sektionen, 589 Zeilen. Umfassende Wissensbasis mit:
- Quick Reference Tabelle
- 5 Diagnose-Patterns (A-E)
- Error-Code Referenz (ESP32: 3010-3016, Server: 5101-5107)
- Circuit Breaker Details (ESP32 + Server)
- Offline-Buffer Details (ESP32 + Server)
- Registration Gate Erklaerung
- Mosquitto-Config Referenz
- Topic-Kurzreferenz
- Sequenz-Erwartungen mit Timing
- Code-Referenzen (Zeilen-Nummern)
- Quick-Commands

**Bewertung:** Der Skill ist bereits sehr gut. Er enthaelt die wichtigsten Informationen kompakt. Einige Zeilen-Referenzen koennten veraltet sein.

### 1.3 Optimierungsplan

**Datei `DEBUG_AGENTS_OPTIMIZATION_PLAN.md` wurde NICHT gefunden.** Weder unter `.claude/reports/current/` noch anderswo. Der Abschnitt kann nicht dokumentiert werden.

---

## 2. Broker-Konfiguration

### 2.1 Mosquitto Config-Dateien

Es existieren **3 Konfigurationen** fuer verschiedene Umgebungen:

| Umgebung | Pfad | Persistenz | WebSocket | Auth |
|----------|------|-----------|-----------|------|
| **Development** | `docker/mosquitto/mosquitto.conf` | true | Port 9001 | anonymous |
| **CI** | `.github/mosquitto/mosquitto.conf` | false | - | anonymous |
| **Lokal (inaktiv)** | `El Servador/god_kaiser_server/mosquitto_*.conf` | varies | - | varies |

### 2.2 Development Config (Produktiv)

**Pfad:** `docker/mosquitto/mosquitto.conf`

| Setting | Wert | Bedeutung |
|---------|------|-----------|
| listener 1883 | MQTT Protocol | Standard MQTT Port |
| listener 9001 | WebSocket Protocol | Fuer Frontend/Browser-Clients |
| allow_anonymous | true | **DEV ONLY** - keine Auth |
| persistence | true | Messages ueberleben Restart |
| persistence_location | /mosquitto/data/ | Named Volume |
| max_inflight_messages | 20 | Parallele QoS 1/2 Messages |
| max_queued_messages | 1000 | Queue-Groesse pro Client |
| message_size_limit | 262144 | 256KB max Payload |
| max_keepalive | 65535 | Unlimited |
| max_connections | -1 | Unlimited |
| connection_messages | true | Log connects/disconnects |

**Logging:**
```
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type error, warning, notice, information, subscribe, unsubscribe
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
```

### 2.3 CI Config

**Pfad:** `.github/mosquitto/mosquitto.conf`

| Unterschied zu Dev | Wert |
|--------------------|------|
| Persistence | false (stateless) |
| Listener | Nur 1883 (kein WebSocket) |
| Logging | Nur stderr (GitHub Actions Capture) |
| Bind | `0.0.0.0:1883` (alle Interfaces) |

### 2.4 Docker-Compose Setup

**docker-compose.yml (Development):**
```yaml
mqtt-broker:
  image: eclipse-mosquitto:2
  container_name: automationone-mqtt
  ports:
    - "1883:1883"   # MQTT
    - "9001:9001"   # WebSocket
  volumes:
    - ./docker/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    - mosquitto_data:/mosquitto/data          # Named Volume (Persistence)
    - ./logs/mqtt:/mosquitto/log               # Bind Mount (Logs)
  healthcheck:
    test: ["CMD", "mosquitto_sub", "-t", "$$SYS/#", "-C", "1", "-i", "healthcheck", "-W", "3"]
    interval: 30s
    timeout: 10s
    retries: 3
  networks:
    - automationone-net
  restart: unless-stopped
```

**Healthcheck-Varianten:**

| Umgebung | Test-Methode | Interval | Timeout | Retries |
|----------|-------------|----------|---------|---------|
| Development | `mosquitto_sub -t $SYS/#` | 30s | 10s | 3 |
| CI | `mosquitto_pub -t health/check` | 5s | 3s | 10 |
| E2E | `mosquitto_pub -t health/check` | 3s | 2s | 15 |

**Server-Dependency:**
```yaml
el-servador:
  depends_on:
    mqtt-broker:
      condition: service_healthy
```

### 2.5 Netzwerk

| Aspekt | Wert |
|--------|------|
| Docker Network | `automationone-net` (bridge) |
| Server-Verbindung | `mqtt-broker:1883` (Docker DNS) |
| ESP32-Verbindung | `<host-ip>:1883` (extern) |
| Frontend WebSocket | `mqtt-broker:9001` (optional) |

### 2.6 Umgebungsvariablen

```env
MQTT_BROKER_HOST=mqtt-broker      # Docker Service-Name
MQTT_BROKER_PORT=1883
MQTT_WEBSOCKET_PORT=9001
```

### 2.7 Authentifizierung

**Aktuell (Development):** Anonymous - keine Auth
**Production-Ready:** Config-Kommentare dokumentieren:
```
# allow_anonymous false
# password_file /mosquitto/config/passwd
# acl_file /mosquitto/config/acl
```
**Keine passwd/acl-Dateien vorhanden** - muessen fuer Production erstellt werden.

---

## 3. Komplette Topic-Hierarchie

### 3.1 Topic-Schema

```
kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}
```

- `kaiser_id` = `"god"` (einziger Wert aktuell)
- `esp_id` = ESP32 Device ID (z.B. `ESP_12AB34CD`)

### 3.2 Alle Topics

| # | Topic-Pattern | Richtung | QoS | Retain | Beschreibung |
|---|---------------|----------|-----|--------|-------------|
| 1 | `.../sensor/{gpio}/data` | ESP->Server | 1 | false | Sensor Rohdaten |
| 2 | `.../sensor/batch` | ESP->Server | 1 | false | Batch Sensor-Daten |
| 3 | `.../sensor/{gpio}/command` | Server->ESP | 2 | false | On-Demand Measurement |
| 4 | `.../sensor/{gpio}/response` | ESP->Server | 1 | false | Sensor-Command Response |
| 5 | `.../actuator/{gpio}/command` | Server->ESP | 2 | false | Actuator-Befehl |
| 6 | `.../actuator/{gpio}/status` | ESP->Server | 1 | false | Actuator-Zustand |
| 7 | `.../actuator/{gpio}/response` | ESP->Server | 1 | false | Command-ACK |
| 8 | `.../actuator/{gpio}/alert` | ESP->Server | 1 | false | Actuator-Alert |
| 9 | `.../actuator/emergency` | Server->ESP | 1 | false | ESP-spezifischer Emergency |
| 10 | `.../system/heartbeat` | ESP->Server | 0 | false | Heartbeat (60s) |
| 11 | `.../system/heartbeat/ack` | Server->ESP | 0 | false | Heartbeat-ACK |
| 12 | `.../system/command` | Server->ESP | 2 | false | System-Befehle |
| 13 | `.../system/response` | ESP->Server | 1 | false | System-Response |
| 14 | `.../system/diagnostics` | ESP->Server | 0 | false | Diagnostics |
| 15 | `.../system/will` | Broker->Server | 1 | **true** | LWT (Offline) |
| 16 | `.../system/error` | ESP->Server | 1 | false | Error Event |
| 17 | `.../status` | ESP->Server | 1 | false | System-Status |
| 18 | `.../safe_mode` | ESP->Server | 1 | false | Safe-Mode Status |
| 19 | `.../config` | Server->ESP | 2 | false | Config Update |
| 20 | `.../config_response` | ESP->Server | 2 | false | Config ACK |
| 21 | `.../zone/assign` | Server->ESP | 1 | false | Zone Assignment |
| 22 | `.../zone/ack` | ESP->Server | 1 | false | Zone ACK |
| 23 | `.../subzone/assign` | Server->ESP | 1 | false | Subzone Assignment |
| 24 | `.../subzone/remove` | Server->ESP | 1 | false | Subzone Removal |
| 25 | `.../subzone/ack` | ESP->Server | 1 | false | Subzone ACK |
| 26 | `.../subzone/status` | ESP->Server | 1 | false | Subzone Status |
| 27 | `.../subzone/safe` | Server->ESP | 1 | false | Subzone Safe-Mode |
| 28 | `.../library/*` | bidirektional | 1 | false | Library Download |
| 29 | `.../mqtt/auth_update` | Server->ESP | 1 | false | Auth Transition |
| 30 | `.../mqtt/auth_status` | ESP->Server | 1 | false | Auth Status |
| 31 | `kaiser/broadcast/emergency` | Server->ALL | 2 | false | Global Emergency |
| 32 | `kaiser/broadcast/system_update` | Server->ALL | 1 | false | System-Updates |

**Retained Messages:** Nur LWT (`system/will`) ist retained=true. Alle anderen Topics sind retain=false.

### 3.3 QoS-Strategie

| QoS | Verwendung | Garantie |
|-----|------------|----------|
| **0** | Heartbeat, Diagnostics | Best effort (Latenz-optimiert) |
| **1** | Sensor-Daten, Status, Alerts | At least once |
| **2** | Commands, Config | Exactly once |

---

## 4. Communication Flows (Sequenzen)

### 4.1 Flow A: Sensor-Daten (ESP -> Server -> Frontend)

**Latenz:** 50-230ms

```
ESP32 SensorManager                  Server sensor_handler              Frontend espStore
       |                                    |                                  |
       | 1. performAllMeasurements()        |                                  |
       |    [sensor_manager.cpp:985]        |                                  |
       |                                    |                                  |
       | 2. MQTT: sensor/{gpio}/data QoS1   |                                  |
       |----------------------------------->|                                  |
       |    [sensor_manager.cpp:1226]       |                                  |
       |                                    |                                  |
       |                                    | 3. handle_sensor_data()          |
       |                                    |    [sensor_handler.py:79]        |
       |                                    |                                  |
       |                                    | 4. Validate + Parse              |
       |                                    | 5. DB Save [sensor_handler:259]  |
       |                                    | 6. Logic Engine (async) [:332]   |
       |                                    |                                  |
       |                                    | 7. WS: "sensor_data"            |
       |                                    |--------------------------------->|
       |                                    |    [sensor_handler.py:297]       |
       |                                    |                                  |
       |                                    |                                  | 8. handleSensorData()
       |                                    |                                  |    [esp.ts:1482]
```

**Timing-Breakdown:**

| Phase | Operation | Dauer |
|-------|-----------|-------|
| Sensor Read | ADC/I2C/OneWire | 10-750ms |
| MQTT Publish (QoS 1) | ESP -> Broker | 20-100ms |
| Server Handler | Parse + Validate | 5-20ms |
| DB Write | PostgreSQL | 10-50ms |
| WebSocket Broadcast | Server -> Frontend | 5-10ms |
| Vue Render | Frontend | ~16ms |

### 4.2 Flow B: Actuator-Steuerung (Frontend -> Server -> ESP)

**Latenz:** 100-290ms

```
Frontend                    Server                      ESP32
   |                           |                           |
   | 1. POST /actuators/cmd    |                           |
   |-------------------------->|                           |
   |                           |                           |
   |                           | 2. Safety Validation      |
   |                           |                           |
   |                           | 3. MQTT: actuator/command |
   |                           |    QoS 2                  |
   |                           |-------------------------->|
   |                           |                           |
   | 4. HTTP 202 Accepted      |                           |
   |<--------------------------|                           |
   |                           |                           |
   |                           |                           | 5. handleActuatorCommand()
   |                           |                           |    [actuator_manager.cpp:537]
   |                           |                           |
   |                           |                           | 6. Safety Check + GPIO Set
   |                           |                           |
   |                           | 7. MQTT: .../response     |
   |                           |<--------------------------|
   |                           |                           |
   |                           | 8. MQTT: .../status       |
   |                           |<--------------------------|
   |                           |                           |
   | 9. WS: actuator_response  |                           |
   |<--------------------------|                           |
```

### 4.3 Flow C: Emergency Stop (Server -> ALL ESPs)

**Latenz:** <100ms (Safety-Critical)

```
Server                          ALL ESP32s
   |                                |
   | 1. MQTT: broadcast/emergency   |
   |    QoS 2                       |
   |------------------------------->| (ALL)
   |                                |
   |                                | 2. emergencyStopAll() <50ms
   |                                |    [safety_controller.cpp:37]
   |                                |
   |                                | 3. All GPIOs -> INPUT_PULLUP
   |                                |
   | 4. MQTT: .../alert             |
   |<-------------------------------|
   |                                |
   | 5. MQTT: .../safe_mode         |
   |<-------------------------------|
```

**Timing-Garantie:** Alle Aktoren OFF in <50ms nach Empfang.

### 4.4 Flow D: Heartbeat (ESP -> Server -> Frontend)

**Intervall:** 60s | **Timeout:** 300s (5min = offline)

```
ESP32 MQTTClient                Server heartbeat_handler           Frontend espStore
       |                               |                                 |
       | 1. publishHeartbeat()         |                                 |
       |    [mqtt_client.cpp:659]      |                                 |
       |    QoS 0, Interval 60s        |                                 |
       |------------------------------>|                                 |
       |                               |                                 |
       |                               | 2. handle_heartbeat()          |
       |                               |    [heartbeat_handler.py:61]   |
       |                               |                                 |
       |                               | 3. Validate ESP (Auto-Discovery)|
       |                               | 4. Update last_seen + metadata |
       |                               |                                 |
       |                               | 5. WS: "esp_health"            |
       |                               |-------------------------------->|
       |                               |                                 |
       | 6. MQTT: heartbeat/ack QoS 0  |                                 |
       |<------------------------------|                                 |
       |    [heartbeat_handler.py:303] |                                 |
```

**Registration Gate Flow:**
1. ESP connect -> Gate CLOSED
2. ESP sends Heartbeat (erlaubt trotz Gate)
3. Server sends Heartbeat-ACK
4. ESP receives ACK -> Gate OPEN -> alle Publishes erlaubt
5. Fallback: Gate oeffnet automatisch nach 10s

### 4.5 Flow E: Config Update (Server -> ESP)

```
Server -> ESP: config (QoS 2)
ESP validates, applies sections, stores to NVS
ESP -> Server: config_response (QoS 2)
```

**Config Sections:** wifi, server, device, sensors, actuators

### 4.6 Flow F: Zone Assignment

```
Server -> ESP: zone/assign (QoS 1)
ESP stores to NVS
ESP -> Server: zone/ack (QoS 1)
```

### 4.7 Flow G: Logic Engine Rule Execution

```
ESP Sensor -> MQTT sensor/data -> Server sensor_handler
  -> Logic Engine evaluate_sensor_data() [logic_engine.py:135]
  -> Rule match -> ActuatorActionExecutor
  -> MQTT actuator/command -> ESP Actuator
  -> MQTT actuator/response -> Server
```

**Cross-ESP Support:** Sensor auf ESP_A triggert Actuator auf ESP_B.

---

## 5. ESP32 MQTT-Client (Code-Analyse)

### 5.1 Dateien

| Datei | Pfad | Zeilen | Funktion |
|-------|------|--------|----------|
| mqtt_client.h | `El Trabajante/src/services/communication/mqtt_client.h` | ~140 | Header |
| mqtt_client.cpp | `El Trabajante/src/services/communication/mqtt_client.cpp` | ~940 | Implementation |
| topic_builder.h | `El Trabajante/src/utils/topic_builder.h` | ~42 | Topic Builder Header |
| topic_builder.cpp | `El Trabajante/src/utils/topic_builder.cpp` | ~225 | Topic Builder Impl |
| main.cpp | `El Trabajante/src/main.cpp` | ~800+ | Integration |

### 5.2 Connection Setup

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Server Address | Aus WiFi-Config | main.cpp:682 |
| MQTT Port | Aus WiFi-Config | main.cpp:683 |
| Client ID | ESP Device-ID | main.cpp:685 |
| Username | Optional (leer = anonym) | main.cpp:686 |
| Password | Optional (leer = anonym) | main.cpp:687 |
| Keepalive | 60s | mqtt_client.cpp:136 |
| Timeout | 10s | main.cpp:689 |
| Port Fallback | 8883 -> 1883 | mqtt_client.cpp:209-227 |

### 5.3 LWT-Konfiguration

| Aspekt | Wert | Zeile |
|--------|------|-------|
| Topic | `kaiser/{id}/esp/{esp_id}/system/will` | mqtt_client.cpp:181-182 |
| Payload | `{"status":"offline","reason":"unexpected_disconnect","timestamp":...}` | mqtt_client.cpp:186-188 |
| QoS | 1 | mqtt_client.cpp:315 |
| Retain | **true** | mqtt_client.cpp:316 |

### 5.4 Subscriptions (main.cpp:724-749)

| Topic | Zeile | Beschreibung |
|-------|-------|-------------|
| `.../system/command` | 724 | System-Befehle |
| `.../config` | 725 | Config-Updates |
| `kaiser/broadcast/emergency` | 726 | Global Emergency |
| `.../actuator/+/command` | 727 | Actuator Commands (Wildcard) |
| `.../actuator/emergency` | 728 | ESP-spezifischer Emergency |
| `.../zone/assign` | 729 | Zone-Zuweisung |
| `.../subzone/assign` | 734 | Subzone-Zuweisung |
| `.../subzone/remove` | 735 | Subzone-Entfernung |
| `.../sensor/+/command` | 745 | Sensor Commands (Wildcard) |
| `.../system/heartbeat/ack` | 749 | Heartbeat-ACK |

### 5.5 Circuit Breaker

**Initialisierung (mqtt_client.cpp:55):**
```cpp
circuit_breaker_("MQTT", 5, 30000, 10000)
```

| Parameter | Wert |
|-----------|------|
| Failure Threshold | 5 Fehler -> OPEN |
| Recovery Timeout | 30s |
| Half-Open Test | 10s |

**States:** CLOSED -> OPEN (5 failures) -> HALF_OPEN (30s) -> CLOSED/OPEN

**Check-Points:**
- `reconnect()`: mqtt_client.cpp:380-396
- `publish()`: mqtt_client.cpp:487-493
- `safePublish()`: mqtt_client.cpp:573-576

### 5.6 Offline Buffer

| Parameter | Wert |
|-----------|------|
| MAX_OFFLINE_MESSAGES | 100 |
| Verhalten bei voll | Neue Messages verworfen |
| Flush | Nach Reconnect (mqtt_client.cpp:256) |

**Struct:** `MQTTMessage { topic, payload, qos, timestamp }` (mqtt_client.cpp:30-35)
**Buffer-Array:** mqtt_client.cpp:104-106
**Add:** mqtt_client.cpp:856-868
**Process:** mqtt_client.cpp:824-854

### 5.7 Registration Gate

| Parameter | Wert |
|-----------|------|
| Timeout | 10s (REGISTRATION_TIMEOUT_MS) |
| Gate-Variable | `registration_confirmed_` (mqtt_client.cpp:128) |

**Logik (mqtt_client.cpp:496-512):**
- Heartbeat immer erlaubt (bypass Gate)
- Andere Publishes blockiert bis ACK empfangen
- Fallback: Gate oeffnet nach 10s automatisch
- Reset bei Connect (mqtt_client.cpp:251) und Disconnect (mqtt_client.cpp:769)

### 5.8 Reconnect mit Exponential Backoff

**Berechnung (mqtt_client.cpp:883-893):**
```
Delay = BASE * 2^attempts, capped at MAX
1s -> 2s -> 4s -> 8s -> 16s -> 32s -> 60s (cap)
```

| Parameter | Wert |
|-----------|------|
| Base Delay | 1s (mqtt_client.cpp:19) |
| Max Delay | 60s (mqtt_client.cpp:20) |
| Max Attempts | Unbegrenzt (Circuit Breaker uebernimmt Schutz) |

### 5.9 Topic Builder Methoden

| Methode | Zeile | Output-Pattern |
|---------|-------|----------------|
| `buildSensorDataTopic()` | 53 | `.../sensor/{gpio}/data` |
| `buildSensorBatchTopic()` | 61 | `.../sensor/batch` |
| `buildSensorCommandTopic()` | 70 | `.../sensor/{gpio}/command` |
| `buildSensorResponseTopic()` | 79 | `.../sensor/{gpio}/response` |
| `buildActuatorCommandTopic()` | 87 | `.../actuator/{gpio}/command` |
| `buildActuatorStatusTopic()` | 95 | `.../actuator/{gpio}/status` |
| `buildActuatorResponseTopic()` | 103 | `.../actuator/{gpio}/response` |
| `buildActuatorAlertTopic()` | 111 | `.../actuator/{gpio}/alert` |
| `buildActuatorEmergencyTopic()` | 119 | `.../actuator/emergency` |
| `buildSystemHeartbeatTopic()` | 127 | `.../system/heartbeat` |
| `buildSystemHeartbeatAckTopic()` | 136 | `.../system/heartbeat/ack` |
| `buildSystemCommandTopic()` | 144 | `.../system/command` |
| `buildSystemDiagnosticsTopic()` | 152 | `.../system/diagnostics` |
| `buildSystemErrorTopic()` | 160 | `.../system/error` |
| `buildConfigTopic()` | 168 | `.../config` |
| `buildConfigResponseTopic()` | 176 | `.../config_response` |
| `buildBroadcastEmergencyTopic()` | 184 | `kaiser/broadcast/emergency` |
| `buildSubzoneAssignTopic()` | 192 | `.../subzone/assign` |
| `buildSubzoneRemoveTopic()` | 199 | `.../subzone/remove` |
| `buildSubzoneAckTopic()` | 206 | `.../subzone/ack` |
| `buildSubzoneStatusTopic()` | 213 | `.../subzone/status` |
| `buildSubzoneSafeTopic()` | 220 | `.../subzone/safe` |

### 5.10 Error Codes (ESP32 MQTT)

| Code | Name | Zeile |
|------|------|-------|
| 3010 | MQTT_INIT_FAILED | mqtt_client.cpp:104 |
| 3011 | MQTT_CONNECT_FAILED | mqtt_client.cpp:276 |
| 3012 | MQTT_PUBLISH_FAILED | mqtt_client.cpp:554 |
| 3013 | MQTT_SUBSCRIBE_FAILED | mqtt_client.cpp:606 |
| 3014 | MQTT_DISCONNECT | mqtt_client.cpp:775 |
| 3015 | MQTT_BUFFER_FULL | mqtt_client.cpp:865 |
| 3016 | MQTT_PAYLOAD_INVALID | mqtt_client.cpp:519 |

---

## 6. Server MQTT-Client (Code-Analyse)

### 6.1 Dateien

**Core Module** (`El Servador/god_kaiser_server/src/mqtt/`):

| Datei | Funktion |
|-------|----------|
| `client.py` | Singleton MQTT Client, Connection, Reconnect, Circuit Breaker |
| `publisher.py` | High-level Publishing mit Retry + Exponential Backoff |
| `subscriber.py` | Handler-Registry, Message Routing, Async Execution |
| `topics.py` | Topic Builder + Parser (Build: 33-216, Parse: 306-893) |
| `offline_buffer.py` | Deque-basierter Buffer mit Thread-Safety |
| `websocket_utils.py` | WebSocket Broadcast Helpers |

**Handler** (`El Servador/god_kaiser_server/src/mqtt/handlers/`):

| Datei | Handler-Funktion | Topic-Pattern |
|-------|-----------------|---------------|
| `base_handler.py` | Abstract Base (parse/validate/process) | - |
| `sensor_handler.py` | `handle_sensor_data()` | `.../sensor/+/data` |
| `actuator_handler.py` | `handle_actuator_status()` | `.../actuator/+/status` |
| `actuator_response_handler.py` | `handle_actuator_response()` | `.../actuator/+/response` |
| `actuator_alert_handler.py` | `handle_actuator_alert()` | `.../actuator/+/alert` |
| `heartbeat_handler.py` | `handle_heartbeat()` | `.../system/heartbeat` |
| `lwt_handler.py` | `handle_lwt()` | `.../system/will` |
| `config_handler.py` | `handle_config_ack()` | `.../config_response` |
| `discovery_handler.py` | `handle_discovery()` | `.../discovery/esp32_nodes` |
| `error_handler.py` | `handle_error_event()` | `.../system/error` |
| `zone_ack_handler.py` | `handle_zone_ack()` | `.../zone/ack` |
| `subzone_ack_handler.py` | `handle_subzone_ack()` | `.../subzone/ack` |
| `kaiser_handler.py` | Mock-ESP Command Routing | `.../actuator/+/command` |

### 6.2 Client Setup (client.py)

| Aspekt | Details | Zeilen |
|--------|---------|--------|
| Pattern | Singleton (`get_instance()`) | 103-109 |
| Connection | TLS optional, Keepalive, Auto-reconnect | 188-276 |
| Client ID | `{base_id}_{os.getpid()}` (unique by process) | 220-221 |
| Auto-Reconnect | `reconnect_delay_set(min=1, max=60)` | 251 |
| Circuit Breaker | Threshold + Recovery from settings | 130-136, 141-174 |
| Disconnect Logging | Rate-limiter (max 1 msg/60s) | 34-82, 514-574 |

**Callbacks (client.py):**
- `_on_connect` (462-501): Status=True, reset delay, resubscribe, flush buffer
- `_on_disconnect` (514-574): Rate-limited warning logs
- `_on_message` (routing to subscriber)

### 6.3 Publisher (publisher.py)

| Methode | QoS | Zeilen |
|---------|-----|--------|
| `publish_actuator_command()` | 2 | 64-102 |
| `publish_sensor_command()` | from constants | 104-149 |
| `publish_sensor_config()` | 2 | 151-179 |
| `publish_actuator_config()` | 2 | 181-209 |
| `publish_config()` | 2 | 211-271 |
| `publish_system_command()` | 2 | 273-316 |
| `publish_pi_enhanced_response()` | 1 | 318-352 |

**Retry-Logik (publisher.py:354-418):**
- Exponential Backoff mit Jitter
- max_retries, base_delay, max_delay aus Settings
- Failed messages -> Offline-Buffer

### 6.4 Subscriber (subscriber.py)

| Feature | Zeilen |
|---------|--------|
| Handler Registry | 43, 82-97 |
| Thread Pool | max_workers=10, Zeile 58-61 |
| Message Routing | `_route_message()`, 147-182 |
| Async Handler Execution | `asyncio.run_coroutine_threadsafe()`, 213-287 |
| Wildcard Matching | `TopicBuilder.matches_subscription()`, topics.py:969-991 |

**Kritischer Fix:** Async handlers muessen im MAIN event loop laufen wegen SQLAlchemy AsyncEngine Binding (Zeile 218-227).

### 6.5 Offline Buffer (offline_buffer.py)

| Feature | Details |
|---------|---------|
| Basis | `collections.deque` (bounded) |
| Thread-Safety | `asyncio.Lock` |
| Overflow | Aelteste Messages verworfen |
| Flush | Batch-weise (flush_batch_size), 0.1s Delay |
| Re-Queue | Failed messages werden vorne eingefuegt |
| Trigger | Auto-flush nach Reconnect (client.py:488-512) |

### 6.6 Handler-Registrierung (main.py:202-260)

| Topic-Pattern | Handler | Zeilen |
|---------------|---------|--------|
| `.../sensor/+/data` | `sensor_handler.handle_sensor_data` | 202-205 |
| `.../actuator/+/status` | `actuator_handler.handle_actuator_status` | 207-210 |
| `.../actuator/+/response` | `actuator_response_handler.handle_actuator_response` | 212-215 |
| `.../actuator/+/alert` | `actuator_alert_handler.handle_actuator_alert` | 217-220 |
| `.../system/heartbeat` | `heartbeat_handler.handle_heartbeat` | 221-224 |
| `.../discovery/esp32_nodes` | `discovery_handler.handle_discovery` | 225-228 |
| `.../config_response` | `config_handler.handle_config_ack` | 229-232 |
| `.../zone/ack` | `zone_ack_handler.handle_zone_ack` | 234-237 |
| `.../subzone/ack` | `subzone_ack_handler.handle_subzone_ack` | 239-242 |
| `.../system/will` | `lwt_handler.handle_lwt` | 248-251 |
| `.../system/error` | `error_handler.handle_error_event` | 256-260 |
| `.../actuator/+/command` | mock_actuator_command_handler (Paket G) | 297-310 |

### 6.7 Error Codes (Server MQTT)

| Code | Name | Datei |
|------|------|-------|
| 5101 | PUBLISH_FAILED | publisher.py |
| 5102 | TOPIC_BUILD_FAILED | publisher.py |
| 5103 | PAYLOAD_SERIALIZATION | publisher.py |
| 5104 | CONNECTION_LOST | client.py |
| 5105 | RETRY_EXHAUSTED | publisher.py |
| 5106 | BROKER_UNAVAILABLE | client.py |
| 5107 | AUTHENTICATION_FAILED | client.py |

---

## 7. Retained Messages

### 7.1 Verwendung

| Komponente | Retain-Nutzung |
|------------|---------------|
| ESP32 LWT | **retain=true** (mqtt_client.cpp:316) |
| ESP32 Publishes | Kein Retain (alle false) |
| Server Publishes | Kein Retain (publisher.py default=false) |
| Offline Buffer | Retain-Flag wird gespeichert + geflusht |

### 7.2 Implikation

- Nur `system/will` bleibt als Retained Message im Broker
- Bei ESP-Reconnect wird LWT-Retained NICHT automatisch geloescht
- **Potenzielles Problem:** Stale "offline" LWT-Messages nach ESP-Neuverbindung

### 7.3 Debug-Commands fuer Retained

```bash
# Retained Messages pruefen
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 5 --retained-only

# Retained Message loeschen (ACHTUNG: Schreibend!)
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXX/system/will" -n -r
```

---

## 8. LWT (Last Will and Testament)

### 8.1 ESP32-Seite (Sender)

**Konfiguration bei Connect (mqtt_client.cpp:176-192):**
- Topic: `kaiser/{id}/esp/{esp_id}/system/will`
- Payload: `{"status":"offline","reason":"unexpected_disconnect","timestamp":...}`
- QoS: 1
- Retain: true

**Wann ausgeloest:** Broker sendet LWT wenn ESP unerwartet disconnected (kein DISCONNECT-Paket).

### 8.2 Server-Seite (Empfaenger)

**LWT Handler (lwt_handler.py:50-183):**
1. Parse Topic -> extract esp_id
2. Lookup ESP in DB
3. Update Status = "offline" (nur wenn aktuell "online")
4. Store disconnect_reason + timestamp in metadata
5. Audit Log: `AuditEventType.LWT_RECEIVED` (severity=WARNING)
6. WebSocket Broadcast: `esp_health` Event mit `status="offline"`, `source="lwt"`

**Vorteil gegenueber Heartbeat-Timeout:** Sofortige Offline-Erkennung (Millisekunden) statt 300s Heartbeat-Timeout.

---

## 9. Code-Locations (Vollstaendige Referenz)

### 9.1 ESP32 MQTT-Client

| Datei | Pfad |
|-------|------|
| mqtt_client.h | `El Trabajante/src/services/communication/mqtt_client.h` |
| mqtt_client.cpp | `El Trabajante/src/services/communication/mqtt_client.cpp` |
| topic_builder.h | `El Trabajante/src/utils/topic_builder.h` |
| topic_builder.cpp | `El Trabajante/src/utils/topic_builder.cpp` |
| main.cpp | `El Trabajante/src/main.cpp` |

### 9.2 Server MQTT-Client

| Datei | Pfad |
|-------|------|
| client.py | `El Servador/god_kaiser_server/src/mqtt/client.py` |
| publisher.py | `El Servador/god_kaiser_server/src/mqtt/publisher.py` |
| subscriber.py | `El Servador/god_kaiser_server/src/mqtt/subscriber.py` |
| topics.py | `El Servador/god_kaiser_server/src/mqtt/topics.py` |
| offline_buffer.py | `El Servador/god_kaiser_server/src/mqtt/offline_buffer.py` |
| websocket_utils.py | `El Servador/god_kaiser_server/src/mqtt/websocket_utils.py` |

### 9.3 Server MQTT-Handler

| Datei | Pfad |
|-------|------|
| base_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/base_handler.py` |
| sensor_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| actuator_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py` |
| actuator_response_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_response_handler.py` |
| actuator_alert_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_alert_handler.py` |
| heartbeat_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` |
| lwt_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` |
| config_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` |
| discovery_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/discovery_handler.py` |
| error_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py` |
| zone_ack_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py` |
| subzone_ack_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/subzone_ack_handler.py` |
| kaiser_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/kaiser_handler.py` |

### 9.4 Mosquitto Config

| Datei | Pfad | Zweck |
|-------|------|-------|
| mosquitto.conf | `docker/mosquitto/mosquitto.conf` | Development (produktiv) |
| mosquitto.conf | `.github/mosquitto/mosquitto.conf` | CI/E2E |

### 9.5 MQTT-relevante Tests

**Unit/ESP32 Tests:**

| Datei | Pfad |
|-------|------|
| test_mqtt_auth_service.py | `El Servador/god_kaiser_server/tests/unit/test_mqtt_auth_service.py` |
| test_mqtt_fallback.py | `El Servador/god_kaiser_server/tests/esp32/test_mqtt_fallback.py` |
| test_mqtt_last_will.py | `El Servador/god_kaiser_server/tests/esp32/test_mqtt_last_will.py` |

**Integration Tests:**

| Datei | Pfad |
|-------|------|
| test_mqtt_flow.py | `El Servador/god_kaiser_server/tests/integration/test_mqtt_flow.py` (TODO) |
| test_mqtt_subscriber.py | `El Servador/god_kaiser_server/tests/integration/test_mqtt_subscriber.py` |
| test_config_handler.py | `El Servador/god_kaiser_server/tests/integration/test_config_handler.py` |
| test_lwt_handler.py | `El Servador/god_kaiser_server/tests/integration/test_lwt_handler.py` |
| test_heartbeat_handler.py | `El Servador/god_kaiser_server/tests/integration/test_heartbeat_handler.py` |

**Weitere Integration Tests mit MQTT-Bezug:**
- `test_emergency_stop.py`, `test_failure_recovery.py`
- `test_logic_automation.py`, `test_sensor_anomalies.py`
- `test_resilience_integration.py`, `test_server_esp32_integration.py`
- `test_modular_esp_integration.py`, `test_api_esp.py`
- `test_websocket_broadcasts.py`, `test_heartbeat_gpio.py`

**E2E Tests:**

| Datei | Pfad |
|-------|------|
| test_actuator_direct_control.py | `El Servador/god_kaiser_server/tests/e2e/test_actuator_direct_control.py` |
| test_websocket_events.py | `El Servador/god_kaiser_server/tests/e2e/test_websocket_events.py` |
| test_logic_engine_real_server.py | `El Servador/god_kaiser_server/tests/e2e/test_logic_engine_real_server.py` |

### 9.6 Wokwi-Szenarien mit MQTT-Bezug

**Hauptkategorien:**
- `tests/wokwi/scenarios/02-sensor/` - Sensor MQTT Publishing
- `tests/wokwi/scenarios/03-actuator/` - Actuator MQTT Commands
- `tests/wokwi/scenarios/04-zone/` - Zone Assignment MQTT
- `tests/wokwi/scenarios/05-emergency/` - Emergency Broadcast
- `tests/wokwi/scenarios/06-config/` - Config MQTT Commands
- `tests/wokwi/scenarios/07-combined/` - Multi-Flow Szenarien
- `tests/wokwi/scenarios/08-onewire/` - OneWire MQTT Commands
- `tests/wokwi/scenarios/gpio/` - GPIO+Heartbeat Integration

**Geschaetzte Anzahl MQTT-relevanter Szenarien:** ~50-60

---

## 10. Architektur-Abhaengigkeiten (MQTT-Perspektive)

### 10.1 Dependency Graph

```
ESP32 Boot-Sequenz:
  WiFiManager.connect() -> MQTTClient.connect() -> TopicBuilder.setup()
  -> Subscribe Topics -> Initial Heartbeat -> Registration Gate
  -> SensorManager.begin() -> ActuatorManager.begin()

Server Boot-Sequenz:
  MQTTClient.get_instance() -> Circuit Breaker init -> Offline Buffer init
  -> Subscriber.register_handlers() -> MQTTClient.connect()
  -> Auto-subscribe all topics -> Ready for messages
```

### 10.2 Message-Flow Abhaengigkeiten

| Flow | Abhaengigkeit | Auswirkung bei Ausfall |
|------|---------------|----------------------|
| Sensor -> DB | MQTT + PostgreSQL | Daten verloren (ESP buffert 100 msg) |
| Actuator Command | REST + MQTT | Command nicht zugestellt |
| Emergency Stop | MQTT Broadcast | **SAFETY CRITICAL** - muss immer funktionieren |
| Heartbeat | MQTT QoS 0 | Kann verloren gehen, Timeout nach 300s |
| Config Push | MQTT QoS 2 | Guaranteed Delivery |
| LWT | Broker-Feature | Sofortige Offline-Erkennung |

### 10.3 Timing-Anforderungen

| Metrik | Erwartung | Alarm-Schwelle | Kritisch |
|--------|-----------|---------------|----------|
| Heartbeat-Intervall | 60s | Gap > 90s | 300s = offline |
| Heartbeat -> ACK | <1s | >5s | - |
| Command -> Response | <500ms | >2s | - |
| Config -> Response | <1s | >5s | - |
| Emergency -> Stop | <100ms | >500ms | **SAFETY** |
| Sensor-Daten | 30s (default) | Gap > 45s | - |

### 10.4 Fehlerszenarien pro Flow

**Disconnect:**
1. ESP Circuit Breaker OPEN (5 failures -> 30s pause)
2. ESP Offline Buffer (max 100 messages)
3. Server Circuit Breaker OPEN
4. Server Offline Buffer (deque, bounded)
5. LWT sofortige Offline-Erkennung
6. Heartbeat-Timeout nach 300s

**Payload-Error:**
1. ESP: Error 3016 (MQTT_PAYLOAD_INVALID)
2. Server: Validation in BaseMQTTHandler -> reject + log

**Timeout:**
1. Registration Gate: 10s Fallback
2. Reconnect: Exponential Backoff 1s-60s
3. Device Timeout: 300s (5min)

---

## 11. Modus A - Allgemeine MQTT-Analyse (Vorgehensweise)

### Schritt 1: Traffic-Log erfassen

```bash
# Option A: Aus Datei (wenn Session-Logs existieren)
# Pfad: logs/mqtt/mqtt_traffic.log ODER logs/current/mqtt_traffic.log
cat logs/mqtt/mqtt_traffic.log

# Option B: Live-Traffic (10 Messages, 15s Timeout)
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 15

# Option C: Docker exec (wenn mosquitto_sub nicht lokal installiert)
docker compose exec mqtt-broker mosquitto_sub -t '#' -v -C 10 -W 15
```

**Formatierung:** Eine Zeile pro Message: `{topic} {json_payload}`

### Schritt 2: Traffic nach ESP-ID gruppieren

Fuer jede ESP-ID im Traffic:
- Welche Topics werden published?
- Heartbeat-Frequenz (60s erwartet)
- Sensor-Daten-Frequenz (30s default)
- Actuator-Status vorhanden?

### Schritt 3: Request-Response-Paare matchen

| Request | Response | Max Latenz |
|---------|----------|-----------|
| system/heartbeat | system/heartbeat/ack | 1s |
| actuator/{gpio}/command | actuator/{gpio}/response | 500ms |
| config | config_response | 5s |
| zone/assign | zone/ack | 5s |
| system/command | system/response | 2s |

**Dokumentiere:** Fehlende Responses, ueberschrittene Latenzen.

### Schritt 4: Timing-Gaps identifizieren

- Heartbeat Gap > 90s -> Warnung
- Heartbeat Gap > 300s -> Device offline
- Sensor-Daten Gap > 45s -> Warnung

### Schritt 5: Payload-Pflichtfelder validieren

**Heartbeat:** `ts`, `uptime`, `heap_free`/`free_heap`, `wifi_rssi`
**Sensor-Data:** `ts`/`timestamp`, `esp_id`, `gpio`, `sensor_type`, `raw`/`raw_value`, `raw_mode`
**Actuator-Status:** `ts`, `gpio`, `type`/`actuator_type`, `state`, `pwm`/`value`, `runtime_ms`, `emergency`
**Config-Response:** `ts`, `esp_id`, `config_id`, `config_applied`

### Schritt 6: LWT Messages dokumentieren

Jede LWT Message (`system/will`) ist ein unerwarteter Disconnect. IMMER dokumentieren.

### Schritt 7: Erweitern bei Auffaelligkeiten

| Auffaelligkeit | Naechster Check | Command |
|----------------|----------------|---------|
| Kein Traffic | Broker laeuft? | `docker compose ps mqtt-broker` |
| Broker down | Broker-Logs | `docker compose logs --tail=30 mqtt-broker` |
| Server verarbeitet nicht | Server-Health | `curl -s http://localhost:8000/api/v1/health/live` |
| Device unbekannt | DB-Lookup | `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT device_id, status FROM esp_devices WHERE device_id = 'ESP_XXX'"` |
| Messages kommen, DB leer | Server-Handler-Error | `grep "sensor_handler\|ERROR" logs/server/god_kaiser.log` |

### Schritt 8: Report schreiben

Output: `.claude/reports/current/MQTT_DEBUG_REPORT.md`

---

## 12. Modus B - Spezifisches Problem (3 Szenarien)

### Szenario 1: "Heartbeat-ACK fehlt"

**Diagnose-Kette:**

```
1. Traffic mitschneiden - Heartbeat vorhanden?
   mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v -C 5 -W 30

2. ACK-Topic monitoren - kommt ACK?
   mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat/ack" -v -C 5 -W 30

3. Server-Handler pruefen
   grep "heartbeat" logs/server/god_kaiser.log | tail -20

4. Device registriert?
   docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db \
     -c "SELECT device_id, status, last_seen FROM esp_devices WHERE device_id = 'ESP_XXX'"

5. Server-Health
   curl -s http://localhost:8000/api/v1/health/live

6. Heartbeat-Handler-Code pruefen
   # heartbeat_handler.py:61 - handle_heartbeat()
   # heartbeat_handler.py:303 - _send_heartbeat_ack()
   # Pruefe: Wird ACK nur bei status="online" gesendet?
   # Neue Devices bekommen status="pending_approval" -> kein ACK!
```

**Haeufigste Ursachen:**
- Device nicht registriert (REST-API Registration erforderlich)
- Device-Status = "pending_approval" oder "rejected"
- Server-Handler wirft Exception (DB-Error)
- Broker leitet ACK nicht weiter (Subscription-Problem)

### Szenario 2: "Retained Messages nicht geloescht nach ESP-Loeschung"

**Diagnose-Kette:**

```
1. Retained Messages pruefen
   mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 5 --retained-only

2. Welche Topics sind retained?
   # Nur system/will sollte retained sein (LWT)
   # Andere retained Messages = Bug oder manuell gesetzt

3. Broker-Persistence pruefen
   # Volume: mosquitto_data -> /mosquitto/data/
   docker compose exec mqtt-broker ls -la /mosquitto/data/

4. Server-Cleanup pruefen
   # Gibt es einen Cleanup-Handler beim Device-Delete?
   grep -rn "retain\|retained\|clean" El\ Servador/god_kaiser_server/src/mqtt/ --include="*.py"

5. Retained Message manuell loeschen (NUR mit Bestaetigung!)
   # Leer-Payload mit retain=true loescht retained Message
   mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXX/system/will" -n -r
```

**Wichtig:** Das Loeschen von Retained Messages ist eine **schreibende Operation** und erfordert User-Bestaetigung!

### Szenario 3: "MQTT-Messages kommen doppelt an"

**Diagnose-Kette:**

```
1. Traffic mitschneiden und Duplikate identifizieren
   mosquitto_sub -h localhost -t "kaiser/#" -v -C 20 -W 30
   # Gleiche Payload + gleiches Topic innerhalb kurzer Zeit?

2. QoS-Level pruefen
   # QoS 1 = "At Least Once" -> Duplikate sind ERLAUBT!
   # QoS 2 = "Exactly Once" -> Duplikate sind BUG
   # Pruefe welcher QoS auf dem betroffenen Topic verwendet wird

3. ESP32 Publish-Logik pruefen
   # mqtt_client.cpp:569-598 - safePublish() hat 1 Retry
   # Pruefe ob Retry trotz erfolgreichem Publish ausgeloest wird

4. Broker-Deduplizierung
   # QoS 2 hat built-in Dedup (MQTT Protocol)
   # QoS 1 hat KEINE Dedup (by design)

5. Server-Handler-Deduplizierung pruefen
   # Gibt es Dedup im Handler? (Timestamp-basiert?)
   grep -rn "dedup\|duplicate\|already.*processed" \
     El\ Servador/god_kaiser_server/src/mqtt/handlers/ --include="*.py"

6. Offline-Buffer Duplikate
   # ESP32: Buffer-Replay nach Reconnect kann Duplikate erzeugen
   # mqtt_client.cpp:824-854 - processOfflineBuffer()
   # Pruefe: Werden bereits zugestellte Messages nochmal gesendet?
```

**Haeufigste Ursachen:**
- QoS 1 Retry bei Netzwerk-Fluktuationen (normal, kein Bug)
- Offline-Buffer Replay nach Reconnect
- ESP32 safePublish() Retry (mqtt_client.cpp:569-598)
- Server Publisher Retry (publisher.py:354-418)

---

## 13. Empfehlungen fuer den neuen Agenten

### 13.1 Beizubehalten

1. **Zwei-Modi-System** (A: Allgemein, B: Spezifisch) - funktioniert gut
2. **Eigenstaendige Extended Checks** - Cross-Layer-Analyse ohne Delegation
3. **Sicherheitsregeln** - Nur subscribe, nie publish; immer -C und -W
4. **Strukturiertes Report-Format** - Klar und konsistent
5. **Quick-Commands Sektion** - Sofort nutzbare Befehle

### 13.2 Zu verbessern

1. **Broker-Config-Wissen:** Agent sollte wissen, dass es 2 aktive Configs gibt (Dev vs CI)
2. **Mock-ESP Awareness:** Agent sollte wissen, dass `kaiser_handler.py` Mock-ESP-Commands routet (Paket G)
3. **Retained-Message-Cleanup:** Klare Anleitung fuer das Loeschen von stale Retained Messages
4. **Multi-Value Sensor Lookup:** Agent sollte wissen, dass OneWire/I2C-Sensoren 4-way Lookup brauchen
5. **Registration Gate:** Agent sollte das Gate-Verhalten bei Debug kennen (10s Timeout-Fallback)
6. **Stale LWT Problem:** Nach ESP-Reconnect bleibt alte LWT retained -> Agent sollte das pruefen
7. **Error-Code Mapping:** Direkte Zuordnung ESP-Error-Code -> Server-Error-Code fuer Cross-Layer-Analyse

### 13.3 Neue Features

1. **Automated Timing Analysis:** Statt nur Timing-Tabellen -> ausfuehrbare Logik die Timestamps parsed und Gaps automatisch berechnet
2. **Flow Validation:** Pruefe ob Request-Response-Paare komplett sind (Heartbeat->ACK, Command->Response)
3. **ESP-spezifische Analyse:** Traffic nach ESP-ID gruppieren und pro Device analysieren
4. **Live vs Log Mode:** Klare Unterscheidung ob Live-Traffic oder Log-Datei analysiert wird
5. **Docker-Stack-Check:** Vor jeder Analyse pruefen ob Broker, Server, DB laufen

### 13.4 Zeilen-Referenzen die verifiziert werden sollten

Die folgenden Code-Referenzen im Skill koennten durch Code-Aenderungen veraltet sein:

| Referenz | Datei | Aktuelle Zeile (ca.) |
|----------|-------|---------------------|
| Connection Management | mqtt_client.cpp | 87-280 |
| Reconnect + Circuit Breaker | mqtt_client.cpp | 370-448 |
| Publish + Registration Gate | mqtt_client.cpp | 478-567 |
| safePublish() | mqtt_client.cpp | 569-598 |
| Heartbeat Publishing | mqtt_client.cpp | 659-721 |
| Offline Buffer | mqtt_client.cpp | 824-878 |
| Handler Registration | main.py | 202-260 |

---

## 14. Zusammenfassung

### Stack-Uebersicht

```
                     +-----------------------+
                     |   Mosquitto Broker     |
                     |   eclipse-mosquitto:2  |
                     |   Ports: 1883, 9001    |
                     |   Container: automationone-mqtt |
                     +----------+------------+
                                |
                   +------------+------------+
                   |                         |
          +--------v--------+      +---------v--------+
          |   ESP32 Client   |      |   Server Client   |
          |   PubSubClient   |      |   paho-mqtt       |
          |   mqtt_client.cpp|      |   client.py        |
          +--------+---------+      +---------+---------+
                   |                          |
          +--------v---------+      +---------v---------+
          | Circuit Breaker   |      | Circuit Breaker    |
          | 5 fail -> 30s     |      | Configurable       |
          +---------+---------+      +---------+----------+
                    |                          |
          +---------v---------+      +---------v----------+
          | Offline Buffer    |      | Offline Buffer      |
          | 100 messages max  |      | Deque (bounded)     |
          +---------+---------+      +---------+----------+
                    |                          |
          +---------v---------+      +---------v----------+
          | Registration Gate |      | 13 Handlers         |
          | 10s timeout       |      | BaseMQTTHandler     |
          +-------------------+      +--------------------+
```

### Zahlen

| Metrik | Wert |
|--------|------|
| Topics gesamt | 32 |
| ESP32 Subscriptions | 10 |
| Server Handler | 13 |
| Communication Flows | 7 (A-G) |
| ESP32 MQTT Error Codes | 7 (3010-3016) |
| Server MQTT Error Codes | 7 (5101-5107) |
| Topic Builder Methoden (ESP32) | 22 |
| Topic Builder/Parser Methoden (Server) | ~25+ |
| MQTT Unit/ESP32 Tests | 3 |
| MQTT Integration Tests | 5+ |
| MQTT-relevante Wokwi Szenarien | ~50-60 |
| Broker Configs | 2 aktive (Dev, CI) |

---

**Ende der MQTT Debug Fullstack Analysis**
