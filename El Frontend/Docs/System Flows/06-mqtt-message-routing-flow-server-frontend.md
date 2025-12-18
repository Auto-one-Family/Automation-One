# MQTT Message Routing Flow - Server & Frontend Perspektive

## Overview

Wie der Server eingehende MQTT-Messages von ESP32s empfängt, routet und verarbeitet.
Das zentrale Nervensystem der Server-Kommunikation.

**Korrespondiert mit:** `El Trabajante/docs/system-flows/06-mqtt-message-routing-flow.md`

---

## Voraussetzungen

- [ ] Server läuft (`localhost:8000`)
- [ ] MQTT Broker erreichbar und verbunden
- [ ] WebSocket-Endpoint aktiv (`/api/v1/ws/realtime`)
- [ ] Mindestens ein ESP32 registriert

---

## Teil 1: Server MQTT-Architektur

### 1.1 MQTT-Client Initialisierung

**Startup-Sequenz:** (in `main.py` lifespan)

1. MQTT-Client erstellen
2. Broker-Verbindung herstellen
3. Topic-Subscriptions registrieren
4. Handler-Callbacks registrieren
5. Message-Loop starten

**Code-Location:** [main.py:122-130]

### 1.2 Topic-Subscriptions

| Topic-Pattern | Konstante | Handler | Zweck |
|---------------|-----------|---------|-------|
| `kaiser/{kaiser_id}/esp/+/sensor/+/data` | `MQTT_SUBSCRIBE_ESP_SENSORS` | `sensor_handler` | Sensor-Messwerte |
| `kaiser/{kaiser_id}/esp/+/actuator/+/status` | `MQTT_SUBSCRIBE_ESP_ACTUATORS` | `actuator_handler` | Actuator-Zustand |
| `kaiser/{kaiser_id}/esp/+/actuator/+/response` | - | `actuator_response_handler` | Command-Response |
| `kaiser/{kaiser_id}/esp/+/actuator/+/alert` | - | `actuator_alert_handler` | Safety-Alerts |
| `kaiser/{kaiser_id}/esp/+/system/heartbeat` | `MQTT_SUBSCRIBE_ESP_HEALTH` | `heartbeat_handler` | Heartbeats |
| `kaiser/{kaiser_id}/discovery/esp32_nodes` | `MQTT_SUBSCRIBE_ESP_DISCOVERY` | `discovery_handler` | Discovery (deprecated) |
| `kaiser/{kaiser_id}/esp/+/config_response` | - | `config_handler` | Config-Responses |

**Code-Location:** [subscriber.py:76-109] oder [main.py:144-181]

---

## Teil 2: Message-Dispatch

### 2.1 Dispatch-Flow
```
ESP32 publishes → MQTT Broker → Server receives
                                    ↓
                            on_message(topic, payload)
                                    ↓
                            Topic-Pattern-Matching
                                    ↓
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
              sensor_handler  actuator_handler  heartbeat_handler
                    ↓               ↓               ↓
                 DB Save        DB Save         DB Update
                    ↓               ↓               ↓
              WebSocket ←───────────┴───────────────┘
                    ↓
                Frontend
```

### 2.2 Topic-Pattern-Matching

**Mechanismus:** Dictionary-Lookup mit Regex-Wildcard-Matching

**Code-Location:** [subscriber.py:203-217]
```python
def _find_handler(self, topic: str) -> Optional[Callable]:
    for pattern, handler in self.handlers.items():
        if TopicBuilder.matches_subscription(topic, pattern):
            return handler
    return None
```

---

## Teil 3: Handler-Übersicht

### 3.1 sensor_handler

**Topic:** `kaiser/{kaiser_id}/esp/+/sensor/+/data`
**Funktion:** `handle_sensor_data()`
**Datei:** [sensor_handler.py:57-277]

**Verarbeitung:**
1. Topic parsen → `esp_id`, `gpio`
2. Payload validieren (ts, esp_id, gpio, sensor_type, raw/raw_value, raw_mode)
3. ESP-Device lookup
4. Sensor-Config lookup (für Pi-Enhanced)
5. Wert verarbeiten (raw oder Pi-Enhanced)
6. In DB speichern (`sensor_data` Tabelle)
7. WebSocket broadcast (`sensor_data` Event)
8. Logic Engine triggern (non-blocking)

**Payload (ESP32 sendet):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 4,
  "sensor_type": "ph_sensor",
  "raw": 2048,
  "raw_mode": true,
  "value": 0.0,
  "unit": "",
  "quality": "stale"
}
```

### 3.2 actuator_handler

**Topic:** `kaiser/{kaiser_id}/esp/+/actuator/+/status`
**Funktion:** `handle_actuator_status()`
**Datei:** [actuator_handler.py:43-203]

**Verarbeitung:**
1. Topic parsen → `esp_id`, `gpio`
2. Payload validieren (ts, esp_id, gpio, actuator_type, state, value/pwm)
3. ESP-Device lookup
4. Actuator-Status in DB speichern
5. Command-History loggen (falls last_command vorhanden)
6. WebSocket broadcast (`actuator_status` Event)

**Payload (ESP32 sendet):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 5,
  "actuator_type": "pump",
  "state": true,
  "value": 0.75,
  "last_command": "on",
  "runtime_ms": 3600000,
  "error": null
}
```

### 3.3 heartbeat_handler

**Topic:** `kaiser/{kaiser_id}/esp/+/system/heartbeat`
**Funktion:** `handle_heartbeat()`
**Datei:** [heartbeat_handler.py:54-175]

**Verarbeitung:**
1. Topic parsen → `esp_id`
2. Payload validieren (ts, uptime, heap_free/free_heap, wifi_rssi)
3. ESP-Device lookup (Auto-Discovery derzeit deaktiviert)
4. `last_seen` aktualisieren
5. Health-Status in DB aktualisieren
6. Metadata aktualisieren (heap, wifi, uptime, etc.)
7. WebSocket broadcast (`esp_health` Event)

**Payload (ESP32 sendet):**
```json
{
  "esp_id": "ESP_12AB34CD",
  "ts": 1735818000,
  "uptime": 3600,
  "heap_free": 45000,
  "wifi_rssi": -45,
  "sensor_count": 3,
  "actuator_count": 2
}
```

### 3.4 config_handler

**Topic:** `kaiser/{kaiser_id}/esp/+/config_response`
**Funktion:** `handle_config_ack()`
**Datei:** [config_handler.py:66-183]

**Verarbeitung:**
1. Topic parsen → `esp_id`
2. Payload validieren (status, type, count, message)
3. Success/Error unterscheiden
4. Audit-Log erstellen (`audit_logs` Tabelle)
5. WebSocket broadcast (`config_response` Event)

**Payload (ESP32 sendet):**
```json
{
  "status": "success",
  "type": "sensor",
  "count": 2,
  "message": "Configured 2 sensor(s) successfully"
}
```

### 3.5 actuator_response_handler

**Topic:** `kaiser/{kaiser_id}/esp/+/actuator/+/response`
**Funktion:** `handle_actuator_response()`
**Datei:** [actuator_response_handler.py:54-153]

**Verarbeitung:**
1. Topic parsen → `esp_id`, `gpio`
2. Payload validieren (ts, esp_id, gpio, command, success)
3. Pending-Command als abgeschlossen markieren
4. Command-Response in History loggen
5. WebSocket broadcast (`actuator_response` Event)

**Payload (ESP32 sendet):**
```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 25,
  "command": "ON",
  "value": 1.0,
  "success": true,
  "message": "Command executed"
}
```

### 3.6 actuator_alert_handler

**Topic:** `kaiser/{kaiser_id}/esp/+/actuator/+/alert`
**Funktion:** `handle_actuator_alert()`
**Datei:** [actuator_alert_handler.py:66-190]

**Verarbeitung:**
1. Topic parsen → `esp_id`, `gpio`
2. Payload validieren (ts, esp_id, gpio, alert_type)
3. Alert-Typ identifizieren (emergency_stop, runtime_protection, safety_violation, hardware_error)
4. Safety-Maßnahmen einleiten (State auf OFF setzen bei kritischen Alerts)
5. Alert in Command-History loggen
6. WebSocket broadcast (`actuator_alert` Event, high priority)

**Payload (ESP32 sendet):**
```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 25,
  "alert_type": "emergency_stop",
  "message": "Actuator stopped due to safety constraint"
}
```

---

## Teil 4: Frontend WebSocket-Integration

### 4.1 WebSocket-Verbindung

**Endpoint:** `ws://{host}:8000/api/v1/ws/realtime/{client_id}?token={jwt}`

**Code-Location:** [MqttLogView.vue:56-123]

### 4.2 Event-Handling

| Event-Type | Handler/Store | UI-Reaktion |
|------------|---------------|-------------|
| `sensor_data` | MqttLogView | Log-Eintrag |
| `actuator_status` | MqttLogView | Log-Eintrag |
| `esp_health` | MqttLogView | Log-Eintrag |
| `config_response` | MqttLogView | Log-Eintrag |
| `actuator_response` | MqttLogView | Log-Eintrag |
| `actuator_alert` | MqttLogView | Log-Eintrag |

**Bekannte Event-Types (aus Handler-Analyse):**
- `sensor_data` - Sensor-Messwerte
- `actuator_status` - Actuator-Zustandsänderungen
- `esp_health` - Heartbeat/Health-Updates
- `config_response` - Config-Bestätigungen
- `actuator_response` - Command-Responses
- `actuator_alert` - Safety-Alerts

**MqttLogView Filter (Zeile 35):**
```typescript
const messageTypes: MessageType[] = [
  'sensor_data', 
  'actuator_status', 
  'logic_execution', 
  'esp_health', 
  'system_event'
]
```

### 4.3 MqttLogView (Debug-Ansicht)

**Route:** `/mqtt-log`
**Funktion:** Zeigt alle WebSocket-Events in Echtzeit

**Features:**
- Real-time Message Stream
- Filter nach Type, ESP-ID, Topic
- Pause/Resume Funktionalität
- JSON Payload Inspection
- Message Limit (500 Messages)

---

## Teil 5: Error-Handling & Robustheit

### 5.1 Handler-Level Errors

| Error-Typ | Behandlung | Logging |
|-----------|------------|---------|
| JSON Parse Error | Message verwerfen | ERROR |
| Invalid Payload | Message verwerfen | WARNING |
| Unknown ESP | Message verwerfen | WARNING |
| DB Error | Log, continue | ERROR |
| WebSocket Error | Log, continue | WARNING |

### 5.2 Connection-Level Errors

| Error-Typ | Behandlung |
|-----------|------------|
| MQTT Disconnect | Auto-Reconnect (exp. backoff) |
| Broker Unavailable | Retry mit Backoff |
| Subscription Failed | Log, Retry |
| Handler Exception | Isolate, continue processing |

---

## Teil 6: Performance & Metriken

### 6.1 Message-Durchsatz

| Metrik | Erwarteter Wert |
|--------|-----------------|
| Messages/Sekunde | 100-500 |
| Handler-Latenz | < 50ms |
| DB-Write-Latenz | < 20ms |
| WebSocket-Broadcast-Latenz | < 10ms |

### 6.2 Monitoring

**Subscriber Stats:**
- `messages_processed`: Erfolgreich verarbeitete Messages
- `messages_failed`: Fehlgeschlagene Messages
- `success_rate`: Erfolgsrate

**Code-Location:** [subscriber.py:243-261]

---

## Teil 7: Troubleshooting

### 7.1 Messages werden nicht verarbeitet

| Symptom | Ursache | Lösung |
|---------|---------|--------|
| Keine Logs im Server | MQTT nicht verbunden | Broker-Connection prüfen |
| Log: "No handler registered" | Subscription fehlt | Topic-Pattern prüfen |
| Log: "Invalid payload" | ESP32 sendet falsches Format | ESP32-Code prüfen |
| Log: "Unknown ESP" | Gerät nicht registriert | POST /api/v1/esp/devices |

### 7.2 Debugging-Befehle
```bash
# Alle MQTT-Messages auf Broker sehen
mosquitto_sub -h localhost -t "kaiser/#" -v

# Server-Logs mit DEBUG-Level
export LOG_LEVEL=DEBUG
poetry run uvicorn ...

# WebSocket-Events im Browser
# MqttLogView öffnen: /mqtt-log
```

---

## Teil 8: Code-Locations Referenz

| Komponente | Pfad | Zeilen |
|------------|------|--------|
| **Haupt-Einstieg** | `god_kaiser_server/src/main.py` | 1-405 |
| **MQTT Client** | `god_kaiser_server/src/mqtt/client.py` | 1-376 |
| **Subscriber** | `god_kaiser_server/src/mqtt/subscriber.py` | 1-274 |
| **Topic Constants** | `god_kaiser_server/src/core/constants.py` | 1-306 |
| **Topic Builder** | `god_kaiser_server/src/mqtt/topics.py` | 1-506 |
| **Base Handler** | `god_kaiser_server/src/mqtt/handlers/base_handler.py` | 1-567 |
| **sensor_handler** | `god_kaiser_server/src/mqtt/handlers/sensor_handler.py` | 1-491 |
| **actuator_handler** | `god_kaiser_server/src/mqtt/handlers/actuator_handler.py` | 1-349 |
| **heartbeat_handler** | `god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` | 1-175 |
| **config_handler** | `god_kaiser_server/src/mqtt/handlers/config_handler.py` | 1-183 |
| **actuator_response_handler** | `god_kaiser_server/src/mqtt/handlers/actuator_response_handler.py` | 1-153 |
| **actuator_alert_handler** | `god_kaiser_server/src/mqtt/handlers/actuator_alert_handler.py` | 1-190 |
| **discovery_handler** | `god_kaiser_server/src/mqtt/handlers/discovery_handler.py` | - |
| **kaiser_handler** | `god_kaiser_server/src/mqtt/handlers/kaiser_handler.py` | - |
| **WebSocket Manager** | `god_kaiser_server/src/websocket/manager.py` | 1-291 |
| **MqttLogView** | `frontend/src/views/MqttLogView.vue` | 1-423 |

---

## Verifizierungscheckliste

### MQTT-Setup
- [x] MQTT-Client-Initialisierung dokumentiert
- [x] Alle Topic-Subscriptions aufgelistet
- [x] Handler-Registration dokumentiert

### Handler
- [x] Alle 6 Handler identifiziert und dokumentiert
- [x] Jeder Handler hat: Topic, Funktion, Datei, Verarbeitung, Payload
- [x] Konsistentes Pattern über alle Handler

### WebSocket
- [x] Alle 6 Event-Types dokumentiert (sensor_data, actuator_status, esp_health, config_response, actuator_response, actuator_alert)
- [x] Frontend-Handling dokumentiert (MqttLogView)
- [x] WebSocket-Manager implementiert (singleton, thread-safe, rate-limiting)
- [x] Real-time Broadcasting für alle Handler implementiert

### Error-Handling
- [x] Handler-Level Errors dokumentiert
- [x] Connection-Level Errors dokumentiert

---

**Letzte Verifizierung:** Dezember 2025
**Verifiziert gegen Code-Version:** Git master branch

**Anmerkungen:**
- **BaseMQTTHandler-Pattern implementiert**: Alle Handler erben von BaseMQTTHandler für konsistente Validierung, Logging und WebSocket-Broadcasting
- **WebSocket-Manager vollständig implementiert**: Thread-safe singleton mit Rate-Limiting und Filter-Unterstützung
- **Logic Engine Integration**: Sensor-Handler triggert Logic Engine nach Daten-Speicherung (non-blocking)
- **Auto-Discovery deaktiviert**: Heartbeat-Handler aktualisiert ESP-Status ohne Auto-Discovery (ESPs müssen via REST API registriert werden)
- **Topic-Konsistenz**: Alle Topics in constants.py definiert, actuator_response und actuator_alert werden dynamisch gebaut
- **Error-Handling**: Strukturiertes Error-Code-System (ValidationErrorCode, ConfigErrorCode, ServiceErrorCode)
- **Performance**: Thread-Pool für Handler-Ausführung, DB-Verbindungs-Pooling, MQTT QoS-Optimierung
- **Frontend-Konsistenz**: Nutzt ausschließlich vorhandene APIs, Patterns und Topic-Strukturen
- **System-Konsistenz**: 100% konform mit Hierarchie.md und Server-Vorgaben (God-Kaiser steuert ESPs direkt via kaiser_id="god")
