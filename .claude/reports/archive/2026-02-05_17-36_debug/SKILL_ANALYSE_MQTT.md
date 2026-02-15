# Skill-Analyse: mqtt-dev / mqtt-debug

**Datum:** 2026-02-05 21:00 UTC
**Skills:** `mqtt-dev`, `mqtt-debug`
**Fragen:** 1-4
**Status:** VOLLSTÄNDIG

---

## 1. Tatsächlich verwendete Topics

### ESP32-Side (El Trabajante)

**Datei:** `El Trabajante/src/utils/topic_builder.cpp`

| Topic-Pattern | Methode | Zeile | QoS |
|---------------|---------|-------|-----|
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` | `buildSensorDataTopic()` | 53 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch` | `buildSensorBatchTopic()` | 61 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` | `buildSensorCommandTopic()` | 70 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response` | `buildSensorResponseTopic()` | 79 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | `buildActuatorCommandTopic()` | 87 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` | `buildActuatorStatusTopic()` | 95 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response` | `buildActuatorResponseTopic()` | 103 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert` | `buildActuatorAlertTopic()` | 111 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency` | `buildActuatorEmergencyTopic()` | 119 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` | `buildSystemHeartbeatTopic()` | 127 | 0 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack` | `buildSystemHeartbeatAckTopic()` | 136 | 0 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | `buildSystemCommandTopic()` | 144 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics` | `buildSystemDiagnosticsTopic()` | 152 | 0 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/error` | `buildSystemErrorTopic()` | 160 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/config` | `buildConfigTopic()` | 168 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/config_response` | `buildConfigResponseTopic()` | 176 | 2 |
| `kaiser/broadcast/emergency` | `buildBroadcastEmergencyTopic()` | 184 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign` | `buildSubzoneAssignTopic()` | 192 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove` | `buildSubzoneRemoveTopic()` | 199 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack` | `buildSubzoneAckTopic()` | 206 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/status` | `buildSubzoneStatusTopic()` | 213 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe` | `buildSubzoneSafeTopic()` | 220 | 1 |

**Code-Ausschnitt (topic_builder.cpp:52-58):**
```cpp
// Pattern 1: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
const char* TopicBuilder::buildSensorDataTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/sensor/%d/data",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}
```

### Server-Side (El Servador)

**Datei:** `El Servador/god_kaiser_server/src/core/constants.py:14-56`

```python
MQTT_TOPIC_ESP_SENSOR_DATA = "kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data"
MQTT_TOPIC_ESP_ACTUATOR_STATUS = "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status"
MQTT_TOPIC_ESP_CONFIG_RESPONSE = "kaiser/{kaiser_id}/esp/{esp_id}/config_response"
MQTT_TOPIC_ESP_HEARTBEAT = "kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat"
MQTT_TOPIC_ESP_ACTUATOR_COMMAND = "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command"
MQTT_TOPIC_ESP_SENSOR_COMMAND = "kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command"
MQTT_TOPIC_ESP_CONFIG = "kaiser/{kaiser_id}/esp/{esp_id}/config"
MQTT_TOPIC_ESP_SYSTEM_COMMAND = "kaiser/{kaiser_id}/esp/{esp_id}/system/command"
MQTT_TOPIC_ESP_HEARTBEAT_ACK = "kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack"
```

### Doku vs Code Vergleich

**Datei:** `.claude/reference/api/MQTT_TOPICS.md`

| Aspekt | Status | Detail |
|--------|--------|--------|
| Topic-Struktur | ✅ SYNCHRON | Alle Topics dokumentiert |
| Payload-Beschreibungen | ✅ VOLLSTÄNDIG | JSON-Schemas vorhanden |
| QoS-Levels | ✅ KORREKT | Zeile 29-62 |
| **Zeilennummern** | ⚠️ VERSETZT | ~13 Zeilen Offset zu topic_builder.cpp |

**Fehler in MQTT_TOPICS.md:**
- Zeile 126: referenziert `topic_builder.cpp:38` → tatsächlich **Zeile 53**
- Zeile 172: referenziert `topic_builder.cpp:50` → tatsächlich **Zeile 61**

---

## 2. Mosquitto-Konfiguration

**Datei:** `docker/mosquitto/mosquitto.conf` (71 Zeilen)

### Listener-Konfiguration (Zeile 13-20)
```conf
# Listener: MQTT (Port 1883)
listener 1883
protocol mqtt

# Listener: WebSocket (Port 9001)
listener 9001
protocol websockets
```

| Listener | Port | Protokoll |
|----------|------|-----------|
| MQTT | 1883 | mqtt |
| WebSocket | 9001 | websockets |

### Security Settings (Zeile 23-31)
```conf
allow_anonymous true
# allow_anonymous false
# password_file /mosquitto/config/passwd
# acl_file /mosquitto/config/acl
```

**Status:** ENTWICKLUNGS-MODUS - Auth deaktiviert, keine ACL

### Persistence & Logging (Zeile 35-52)
```conf
persistence true
persistence_location /mosquitto/data/

log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
```

### Connection Limits (Zeile 57-70)
```conf
max_keepalive 65535          # Unlimited
max_connections -1           # Unlimited
max_inflight_messages 20     # In-flight message buffer
max_queued_messages 1000     # Offline message queue
message_size_limit 262144    # 256KB max payload
```

### Bridge/ACL
**NICHT IMPLEMENTIERT** - Keine Bridge-Config, keine ACL-Datei vorhanden

---

## 3. MQTT Error-Handling

### Error-Codes (aus .claude/reference/errors/ERROR_CODES.md)

**ESP32 MQTT Errors (3010-3016):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 3010 | MQTT_INIT_FAILED | Failed to initialize MQTT client |
| 3011 | MQTT_CONNECT_FAILED | MQTT broker connection failed |
| 3012 | MQTT_PUBLISH_FAILED | Failed to publish MQTT message |
| 3013 | MQTT_SUBSCRIBE_FAILED | Failed to subscribe to MQTT topic |
| 3014 | MQTT_DISCONNECT | MQTT disconnected from broker |
| 3015 | MQTT_BUFFER_FULL | MQTT offline buffer is full |
| 3016 | MQTT_PAYLOAD_INVALID | MQTT payload is invalid or malformed |

**Server MQTT Errors (5101-5107):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 5101 | PUBLISH_FAILED | MQTT publish operation failed |
| 5102 | TOPIC_BUILD_FAILED | Failed to build MQTT topic |
| 5103 | PAYLOAD_SERIALIZATION_FAILED | Failed to serialize MQTT payload |
| 5104 | CONNECTION_LOST | MQTT connection lost |
| 5105 | RETRY_EXHAUSTED | MQTT retry attempts exhausted |
| 5106 | BROKER_UNAVAILABLE | MQTT broker is unavailable |
| 5107 | AUTHENTICATION_FAILED | MQTT authentication failed |

### ESP32 Reconnect-Logic

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp:46-62`

```cpp
MQTTClient::MQTTClient()
    : mqtt_(wifi_client_),
      offline_buffer_count_(0),
      last_reconnect_attempt_(0),
      reconnect_attempts_(0),
      reconnect_delay_ms_(RECONNECT_BASE_DELAY_MS),
      circuit_breaker_("MQTT", 5, 30000, 10000),  // 5 Failures → OPEN
      // ...
{
  // Circuit Breaker configured:
  // - 5 failures → OPEN state
  // - 30s recovery timeout
  // - 10s half-open test timeout
}
```

**safePublish() mit Retry (mqtt_client.cpp:569-600):**
```cpp
bool MQTTClient::safePublish(const String& topic, const String& payload,
                              uint8_t qos, uint8_t retries) {
  if (circuit_breaker_.isOpen()) {
    return false;  // Circuit breaker blocks publish
  }

  if (publish(topic, payload, qos)) {
    return true;  // Success on first attempt
  }

  // Retry logic with exponential backoff
  for (uint8_t i = 1; i < retries; i++) {
    delay(50 * i);
    if (publish(topic, payload, qos)) {
      return true;
    }
  }
  return false;
}
```

### Server Offline-Buffer

**Datei:** `El Servador/god_kaiser_server/src/mqtt/offline_buffer.py:120-145`

```python
async def add(self, topic: str, payload: str, qos: int = 1):
    """Add message to offline buffer for later delivery"""
    if self.is_full():
        raise OfflineBufferFullError()

    message = OfflineMessage(
        topic=topic,
        payload=payload,
        timestamp=datetime.now(),
        qos=qos,
    )
    self.messages.append(message)
```

---

## 4. QoS-Levels nach Topic

**Quellen:** `constants.py:195-199`, `MQTT_TOPICS.md:1044-1050`

| Topic-Kategorie | QoS | Grund | Code-Referenz |
|-----------------|-----|-------|---------------|
| **Sensor Daten** | **1** | At Least Once | constants.py:195 |
| sensor/{gpio}/data | 1 | Wichtig, toleriert Duplikate | mqtt_client.cpp:536 |
| sensor/batch | 1 | Batch-Daten | topic_builder.cpp:61 |
| **Actuator Befehle** | **2** | Exactly Once | constants.py:196 |
| actuator/{gpio}/command | 2 | KRITISCH - Duplikate gefährlich | publisher.py:99 |
| actuator/{gpio}/status | 1 | Status-Update | actuator_manager.cpp:822 |
| **System** | **Gemischt** | - | - |
| system/heartbeat | **0** | Fire-and-Forget | constants.py:198 |
| system/heartbeat/ack | **0** | Response zu Heartbeat | topic_builder.cpp:136 |
| system/command | **2** | Exactly Once | constants.py:199 |
| system/diagnostics | **0** | Telemetrie, Verlust OK | topic_builder.cpp:152 |
| system/error | **1** | Fehler-Meldung wichtig | topic_builder.cpp:160 |
| **Config** | **2** | Exactly Once | constants.py:199 |
| config | **2** | KRITISCH - Muss ankommen | publisher.py:176 |
| config_response | **2** | ACK zu Config | config_response.cpp:43 |
| **Subzone** | **1** | At Least Once | topic_builder.cpp:192-225 |
| **Broadcast** | **2** | Exactly Once | topic_builder.cpp:184 |

---

## Kritische Dateien für mqtt-dev / mqtt-debug

| Datei | Zweck |
|-------|-------|
| `El Trabajante/src/utils/topic_builder.cpp` | ESP32 Topic-Builder |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | ESP32 MQTT Client |
| `El Servador/god_kaiser_server/src/core/constants.py` | Server Topic Templates |
| `El Servador/god_kaiser_server/src/mqtt/publisher.py` | Server Publisher |
| `El Servador/god_kaiser_server/src/mqtt/subscriber.py` | Server Subscriber |
| `El Servador/god_kaiser_server/src/mqtt/offline_buffer.py` | Offline Buffer |
| `docker/mosquitto/mosquitto.conf` | Broker Config |
| `.claude/reference/api/MQTT_TOPICS.md` | Topic-Dokumentation |
| `.claude/reference/errors/ERROR_CODES.md` | Error-Codes |

---

## Findings für Skill-Erstellung

### Lücken

| Problem | Empfehlung |
|---------|------------|
| MQTT_TOPICS.md Zeilennummern ~13 versetzt | Aktualisieren |
| Mosquitto Auth deaktiviert | Production-Checklist erstellen |
| Bridge/ACL nicht implementiert | Bei Multi-Instance nötig |

### Stärken

| Aspekt | Detail |
|--------|--------|
| Pattern-Konsistenz | TopicBuilder auf ESP32 + Server identisch |
| Circuit Breaker | Intelligente Fehlerbehandlung auf beiden Seiten |
| QoS-Granularität | Korrekt nach Message-Importance abgestuft |
| Offline-Buffer | Server + ESP32 haben Puffer-Mechanismus |
