---
name: mqtt-development
description: |
  MQTT Pattern-konformer Code-Analyst und Implementierer.
  Analysiert existierende Patterns auf Server UND ESP32, garantiert Protokoll-Konsistenz.
  Aktivieren bei: Topic hinzufuegen, Handler erstellen, Publisher erweitern,
  Subscriber erweitern, Payload-Schema definieren, QoS festlegen.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
argument-hint: "[Beschreibe was implementiert werden soll]"
---

# MQTT Development Skill

> **Architektur:** Server-Centric. ESP32 = dumme Agenten. ALLE Logik auf Server.
> **Protokoll:** MQTT 3.1.1 via Mosquitto Broker (Docker)
> **Topic-Schema:** `kaiser/{kaiser_id}/esp/{esp_id}/{category}/{gpio}/{action}`

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Topic hinzufügen (ESP32)** | [Section 3: Topics ESP32](#3-topic-builder-esp32) | `El Trabajante/src/utils/topic_builder.cpp` |
| **Topic hinzufügen (Server)** | [Section 4: Topics Server](#4-topics-server) | `El Servador/.../core/constants.py` |
| **Handler hinzufügen** | [Section 5: Handler Pattern](#5-handler-pattern) | `El Servador/.../mqtt/handlers/` |
| **Publisher erweitern** | [Section 6: Publisher](#6-publisher-pattern) | `El Servador/.../mqtt/publisher.py` |
| **QoS-Strategie verstehen** | [Section 2: QoS](#2-qos-strategie) | Diese Datei |
| **Offline-Verhalten** | [Section 7: Offline Buffer](#7-offline-buffer--circuit-breaker) | `mqtt_client.cpp`, `offline_buffer.py` |
| **Mosquitto Config** | [Section 8: Broker](#8-mosquitto-broker-config) | `docker/mosquitto/mosquitto.conf` |
| **Error-Codes** | [Section 9: Errors](#9-mqtt-error-codes) | `error_codes.h`, `error_codes.py` |

### Ordnerstruktur

```
ESP32 (El Trabajante/src/)
├── utils/topic_builder.cpp       ← Topic-Builder (snprintf-basiert)
├── utils/topic_builder.h         ← Topic-Builder Header
├── services/communication/
│   └── mqtt_client.cpp           ← MQTT Client (ESP-IDF default; PubSubClient wenn MQTT_USE_PUBSUBCLIENT=1)
│       - Circuit Breaker Pattern
│       - Offline Buffer (10 Messages)
│       - Registration Gate
│       - Last-Will (LWT)
└── models/error_codes.h          ← Error-Codes 3010-3016

Server (El Servador/god_kaiser_server/src/)
├── mqtt/
│   ├── client.py                 ← MQTT Client (paho-mqtt)
│   ├── publisher.py              ← High-Level Publisher
│   ├── subscriber.py             ← Subscriber mit Handler-Registry
│   ├── offline_buffer.py         ← Offline Buffer (asyncio)
│   ├── topics.py                 ← TopicBuilder (Python)
│   └── handlers/                 ← 15 Message-Handler
│       ├── sensor_handler.py
│       ├── actuator_handler.py
│       ├── heartbeat_handler.py
│       └── ...
├── core/
│   ├── constants.py              ← Topic-Konstanten
│   └── error_codes.py            ← Error-Codes 5101-5107
└── main.py                       ← Handler-Registrierung (Zeile 201-307)

Docker
└── docker/mosquitto/mosquitto.conf  ← Broker-Konfiguration
```

---

## 1. Topic-Architektur

### Basis-Schema

```
kaiser/{kaiser_id}/esp/{esp_id}/{category}/{gpio}/{action}
```

- **kaiser_id:** `"god"` (aktuell einziger Wert)
- **esp_id:** ESP32 Device ID (z.B. `ESP_12AB34CD`)
- **category:** `sensor`, `actuator`, `system`, `config`, `subzone`
- **gpio:** Pin-Nummer (0-39) oder weggelassen bei System-Topics
- **action:** `data`, `command`, `status`, `response`, etc.

### Vollständiges Topic-Schema (26+ Topics)

| # | Topic | Richtung | QoS | ESP32 Builder | Server Konstante |
|---|-------|----------|-----|---------------|------------------|
| 1 | `sensor/{gpio}/data` | ESP→Server | 1 | `buildSensorDataTopic()` | `MQTT_TOPIC_ESP_SENSOR_DATA` |
| 2 | `sensor/batch` | ESP→Server | 1 | `buildSensorBatchTopic()` | - |
| 3 | `sensor/{gpio}/command` | Server→ESP | 2 | `buildSensorCommandTopic()` | `MQTT_TOPIC_ESP_SENSOR_COMMAND` |
| 4 | `sensor/{gpio}/response` | ESP→Server | 1 | `buildSensorResponseTopic()` | `MQTT_TOPIC_ESP_SENSOR_RESPONSE` |
| 5 | `actuator/{gpio}/command` | Server→ESP | 2 | `buildActuatorCommandTopic()` | `MQTT_TOPIC_ESP_ACTUATOR_COMMAND` |
| 6 | `actuator/{gpio}/status` | ESP→Server | 1 | `buildActuatorStatusTopic()` | `MQTT_TOPIC_ESP_ACTUATOR_STATUS` |
| 7 | `actuator/{gpio}/response` | ESP→Server | 1 | `buildActuatorResponseTopic()` | - |
| 8 | `actuator/{gpio}/alert` | ESP→Server | 1 | `buildActuatorAlertTopic()` | - |
| 9 | `actuator/emergency` | Server→ESP | 1 | `buildActuatorEmergencyTopic()` | - |
| 10 | `system/heartbeat` | ESP→Server | 0 | `buildSystemHeartbeatTopic()` | `MQTT_TOPIC_ESP_HEARTBEAT` |
| 11 | `system/heartbeat/ack` | Server→ESP | 0 | `buildSystemHeartbeatAckTopic()` | `MQTT_TOPIC_ESP_HEARTBEAT_ACK` |
| 12 | `system/command` | Server→ESP | 2 | `buildSystemCommandTopic()` | `MQTT_TOPIC_ESP_SYSTEM_COMMAND` |
| 13 | `system/diagnostics` | ESP→Server | 0 | `buildSystemDiagnosticsTopic()` | - |
| 14 | `system/error` | ESP→Server | 1 | `buildSystemErrorTopic()` | - |
| 15 | `system/intent_outcome` | ESP→Server | 1 | `buildIntentOutcomeTopic()` | - |
| 15b | `system/intent_outcome/lifecycle` | ESP→Server | 1 | `buildIntentOutcomeLifecycleTopic()` | `intent_outcome_lifecycle_handler.py` |
| 16 | `system/will` | ESP→Server | 1 | (LWT bei connect) | - |
| 17 | `config` | Server→ESP | 2 | `buildConfigTopic()` | `MQTT_TOPIC_ESP_CONFIG` |
| 18 | `config_response` | ESP→Server | 2 | `buildConfigResponseTopic()` | `MQTT_TOPIC_ESP_CONFIG_RESPONSE` |
| 19 | `subzone/assign` | Server→ESP | 1 | `buildSubzoneAssignTopic()` | `MQTT_TOPIC_SUBZONE_ASSIGN` |
| 20 | `subzone/remove` | Server→ESP | 1 | `buildSubzoneRemoveTopic()` | `MQTT_TOPIC_SUBZONE_REMOVE` |
| 21 | `subzone/ack` | ESP→Server | 1 | `buildSubzoneAckTopic()` | `MQTT_TOPIC_SUBZONE_ACK` |
| 22 | `subzone/status` | ESP→Server | 1 | `buildSubzoneStatusTopic()` | `MQTT_TOPIC_SUBZONE_STATUS` |
| 23 | `subzone/safe` | Server→ESP | 1 | `buildSubzoneSafeTopic()` | `MQTT_TOPIC_SUBZONE_SAFE` |
| 24 | `zone/assign` | Server→ESP | 1 | `buildZoneAssignTopic()` | - |
| 25 | `zone/ack` | ESP→Server | 1 | `buildZoneAckTopic()` | - |
| B1 | `kaiser/broadcast/emergency` | Server→ALL | 2 | `buildBroadcastEmergencyTopic()` | - |

---

## 2. QoS-Strategie

### Pattern: QoS steigt mit Kritikalität

```
QoS 0: Fire-and-Forget     → Heartbeat, Diagnostics (kein Verlust-Risiko)
QoS 1: At Least Once       → Sensor-Daten, Status (Duplikate harmlos)
QoS 2: Exactly Once        → Commands (Duplikate = gefährlich!)
```

### Vollständige QoS-Zuordnung

| QoS | Topics | Grund |
|-----|--------|-------|
| **0** | `system/heartbeat`, `system/heartbeat/ack`, `system/diagnostics` | Regelmäßig, nächste Nachricht überschreibt |
| **1** | `sensor/data`, `sensor/batch`, `sensor/response`, `actuator/status`, `actuator/response`, `actuator/alert`, `system/error`, `system/intent_outcome`, `system/intent_outcome/lifecycle`, `system/will`, alle `subzone/*` | Daten-Loss unerwünscht, Duplikate verarbeitbar |
| **2** | `sensor/command`, `actuator/command`, `system/command`, `config`, `config_response`, `broadcast/emergency` | Duplikate können Schaden verursachen |

### Server-Konstanten (constants.py:193-199)

```python
QOS_SENSOR_DATA = 1       # At least once
QOS_ACTUATOR_COMMAND = 2  # Exactly once
QOS_SENSOR_COMMAND = 2    # Exactly once
QOS_HEARTBEAT = 0         # At most once
QOS_CONFIG = 2            # Exactly once
```

---

## 3. Topic-Builder (ESP32)

**Dateien:**
- `El Trabajante/src/utils/topic_builder.h` (Interface)
- `El Trabajante/src/utils/topic_builder.cpp` (Implementation)

### Architektur

```cpp
class TopicBuilder {
public:
  // Konfiguration
  static void setEspId(const char* esp_id);
  static void setKaiserId(const char* kaiser_id);

  // Topic-Methoden (geben Pointer auf internen Buffer zurück)
  static const char* buildSensorDataTopic(uint8_t gpio);
  static const char* buildActuatorCommandTopic(uint8_t gpio);
  // ... 20 weitere Methoden

private:
  static char topic_buffer_[256];  // Shared buffer
  static char esp_id_[32];
  static char kaiser_id_[64];
};
```

### Implementation-Pattern (topic_builder.cpp)

```cpp
// Pattern: snprintf → validateTopicBuffer
const char* TopicBuilder::buildSensorDataTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/sensor/%d/data",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}

// Buffer-Validation gegen Overflow und Encoding-Errors
const char* TopicBuilder::validateTopicBuffer(int snprintf_result) {
  if (snprintf_result < 0) {
    LOG_ERROR("TopicBuilder: snprintf encoding error!");
    return "";
  }
  if (snprintf_result >= (int)sizeof(topic_buffer_)) {
    LOG_ERROR("TopicBuilder: Topic truncated!");
    return "";
  }
  return topic_buffer_;
}
```

### Neuen Topic hinzufügen (ESP32)

1. **Header erweitern** (`topic_builder.h`):
```cpp
static const char* buildYourNewTopic(uint8_t gpio);
```

2. **Implementation hinzufügen** (`topic_builder.cpp`):
```cpp
const char* TopicBuilder::buildYourNewTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/your/new/%d/topic",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}
```

3. **Synchron halten:** Server-Konstante + MQTT_TOPICS.md aktualisieren!

---

## 4. Topics (Server)

**Dateien:**
- `El Servador/god_kaiser_server/src/core/constants.py` (Konstanten)
- `El Servador/god_kaiser_server/src/mqtt/topics.py` (TopicBuilder)

### Konstanten-Pattern (constants.py)

```python
# Topic-Pattern mit Placeholder
MQTT_TOPIC_ESP_SENSOR_DATA = "kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data"
MQTT_TOPIC_ESP_ACTUATOR_COMMAND = "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command"

# Subscription-Pattern (Wildcards)
MQTT_SUBSCRIBE_ESP_SENSORS = "kaiser/{kaiser_id}/esp/+/sensor/+/data"
MQTT_SUBSCRIBE_ESP_ALL = "kaiser/{kaiser_id}/esp/+/#"

# Helper-Funktion
def get_topic_with_kaiser_id(topic_template: str, **kwargs) -> str:
    kaiser_id = get_kaiser_id()  # Default: "god"
    return topic_template.format(kaiser_id=kaiser_id, **kwargs)
```

### Neuen Topic hinzufügen (Server)

1. **Konstante definieren** (`constants.py`):
```python
MQTT_TOPIC_YOUR_NEW = "kaiser/{kaiser_id}/esp/{esp_id}/your/new/{gpio}/topic"
```

2. **TopicBuilder erweitern** (`topics.py`):
```python
@staticmethod
def build_your_new_topic(esp_id: str, gpio: int) -> str:
    return constants.get_topic_with_kaiser_id(
        constants.MQTT_TOPIC_YOUR_NEW,
        esp_id=esp_id,
        gpio=gpio
    )
```

3. **Synchron halten:** ESP32 TopicBuilder + MQTT_TOPICS.md aktualisieren!

---

## 5. Handler-Pattern

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/`

### Handler-Registrierung (main.py lifespan, u. a. 203–310)

```python
# lifespan() Funktion
subscriber.register_handler(
    "kaiser/+/esp/+/sensor/+/data",  # Pattern mit Wildcard (multi-Kaiser support)
    sensor_handler.handle_sensor_data   # Handler-Funktion
)
```

### Handler-Übersicht

| Pattern | Handler | QoS | Zeile |
|---------|---------|-----|-------|
| `+/sensor/+/data` | SensorDataHandler | 1 | 203 |
| `+/actuator/+/status` | ActuatorStatusHandler | 1 | 207 |
| `+/actuator/+/response` | ActuatorResponseHandler | 1 | 212 |
| `+/actuator/+/alert` | ActuatorAlertHandler | 1 | 217 |
| `+/system/heartbeat` | HeartbeatHandler | 0 | 221 |
| `+/config_response` | ConfigHandler | 2 | 229 |
| `+/zone/ack` | ZoneAckHandler | 1 | 234 |
| `+/subzone/ack` | SubzoneAckHandler | 1 | 239 |
| `+/system/will` | LWTHandler | 1 | 248 |
| `+/system/error` | ErrorEventHandler | 1 | 256 |
| `+/system/intent_outcome` | IntentOutcomeHandler | 1 | ~299 |
| `+/system/intent_outcome/lifecycle` | IntentOutcomeLifecycleHandler | 1 | ~306 |

### Neuen Handler hinzufügen

1. **Handler-Datei erstellen** (`mqtt/handlers/your_handler.py`):
```python
from ..core.logging_config import get_logger
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

async def handle_your_event(topic: str, payload: dict) -> bool:
    """
    Handle incoming your_event messages.

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload

    Returns:
        True if successful, False otherwise
    """
    try:
        # Extract esp_id from topic
        parts = topic.split("/")
        esp_id = parts[3]  # kaiser/{kaiser_id}/esp/{esp_id}/...

        # Process payload
        logger.info(f"Processing your_event from {esp_id}")

        # DB operation with session
        async with async_session_maker() as session:
            # ... your logic
            await session.commit()

        return True

    except Exception as e:
        logger.error(f"Handle your_event failed: {e}", exc_info=True)
        return False
```

2. **In main.py registrieren** (~Zeile 260):
```python
from .mqtt.handlers.your_handler import handle_your_event

subscriber.register_handler(
    f"kaiser/{kaiser_id}/esp/+/your/new/topic",
    handle_your_event
)
```

3. **Topic zu constants.py hinzufügen**

---

## 6. Publisher-Pattern

**Datei:** `El Servador/god_kaiser_server/src/mqtt/publisher.py`

### Publisher-Klasse

```python
class Publisher:
    def __init__(self, mqtt_client: Optional[MQTTClient] = None):
        self.client = mqtt_client or MQTTClient.get_instance()

        # Resilience Settings
        self.max_retries = settings.resilience.retry_max_attempts
        self.base_delay = settings.resilience.retry_base_delay

    def publish_actuator_command(
        self,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        duration: int = 0,
        retry: bool = True,
        correlation_id: Optional[str] = None,
    ) -> bool:
        topic = TopicBuilder.build_actuator_command_topic(esp_id, gpio)
        payload = {
            "command": command.upper(),
            "value": value,
            "duration": duration,
            "timestamp": int(time.time()),
        }
        if correlation_id:
            payload["correlation_id"] = correlation_id
            payload["intent_id"] = correlation_id  # IntentMetadata + command_intents.sent (Epic1-05)

        return self._publish_with_retry(topic, payload, QOS_ACTUATOR_COMMAND, retry)
```

**Not-Aus (REST):** `api/v1/actuators.py` setzt `correlation_id` über `build_emergency_actuator_correlation_id(incident_correlation_id, esp_id, gpio)` (Format `{incident}:{esp_id}:{gpio}`). Bei erfolgreichem Publish: `actuator_history.command_metadata` enthält `incident_correlation_id`, `correlation_id` und `mqtt_correlation_id` (letztere beiden = MQTT-Wert). `incident_correlation_id` zusätzlich in REST `EmergencyStopResponse`. Referenz: `El Servador/god_kaiser_server/docs/emergency-stop-mqtt-correlation.md`; Finalität: `El Servador/god_kaiser_server/docs/finalitaet-http-mqtt-ws.md`.

### Retry-Pattern mit Exponential Backoff

```python
def _publish_with_retry(self, topic, payload, qos, retry) -> bool:
    attempts = self.max_retries if retry else 1

    for attempt in range(1, attempts + 1):
        success = self.client.publish(topic, json.dumps(payload), qos)

        if success:
            return True

        if attempt < attempts:
            delay = calculate_backoff_delay(
                attempt=attempt - 1,
                base_delay=self.base_delay,
                max_delay=self.max_delay,
                exponential_base=self.exponential_base,
                jitter=self.jitter_enabled,
            )
            time.sleep(delay)

    return False
```

### Neue Publish-Methode hinzufügen

```python
def publish_your_command(
    self,
    esp_id: str,
    gpio: int,
    data: Dict[str, Any],
    retry: bool = True,
) -> bool:
    topic = TopicBuilder.build_your_topic(esp_id, gpio)
    payload = {
        **data,
        "timestamp": int(time.time()),
    }

    qos = constants.QOS_YOUR_COMMAND  # 0, 1, oder 2

    logger.info(f"Publishing your command to {esp_id} GPIO {gpio}")
    return self._publish_with_retry(topic, payload, qos, retry)
```

---

## 7. Offline Buffer & Circuit Breaker

### ESP32 Circuit Breaker (mqtt_client.cpp)

```cpp
// Konstruktor: CircuitBreaker-Konfiguration
circuit_breaker_("MQTT", 5, 30000, 10000)
// Parameter: name, failure_threshold, recovery_timeout_ms, half_open_timeout_ms

// 5 Failures → OPEN state
// 30s recovery timeout
// 10s half-open test timeout
```

**Publish mit Circuit Breaker:**

```cpp
bool MQTTClient::publish(const String& topic, const String& payload, uint8_t qos) {
    // Circuit Breaker Check
    if (!circuit_breaker_.allowRequest()) {
        LOG_WARNING("MQTT publish blocked by Circuit Breaker (Service DOWN)");
        return false;
    }

    // Registration Gate Check (verhindert Publish vor Heartbeat-ACK)
    // Whitelisted: heartbeat, config_response, zone/ack, subzone/ack
    bool is_system_response = topic.indexOf("/config_response") != -1 ||
                              topic.indexOf("/zone/ack") != -1 ||
                              topic.indexOf("/subzone/ack") != -1;
    if (!registration_confirmed_ && !is_heartbeat && !is_system_response) {
        LOG_DEBUG("Publish blocked (awaiting registration)");
        return false;
    }

    // Empty Payload Guard
    if (payload.length() == 0) {
        LOG_ERROR("Empty payload blocked");
        return false;
    }

    // Actual publish
    bool success = mqtt_.publish(topic.c_str(), payload.c_str(), qos == 1);

    success ? circuit_breaker_.recordSuccess() : circuit_breaker_.recordFailure();

    if (!success) {
        addToOfflineBuffer(topic, payload, qos);
    }

    return success;
}
```

**ESP32 Offline Buffer:**

```cpp
// Max 100 messages (Speicher-limitiert)
static const uint16_t MAX_OFFLINE_MESSAGES = 100;

struct OfflineMessage {
    String topic;
    String payload;
    uint8_t qos;
    unsigned long timestamp;
};

OfflineMessage offline_buffer_[MAX_OFFLINE_MESSAGES];
```

### Server Offline Buffer (offline_buffer.py)

```python
@dataclass
class BufferedMessage:
    topic: str
    payload: str  # JSON string
    qos: int
    retain: bool
    timestamp: float = field(default_factory=time.time)
    attempts: int = 0

class MQTTOfflineBuffer:
    def __init__(self, max_size=1000, flush_batch_size=50):
        self._buffer: Deque[BufferedMessage] = deque(maxlen=max_size)
        self._lock = asyncio.Lock()

    async def add(self, topic, payload, qos=1, retain=False) -> bool:
        async with self._lock:
            message = BufferedMessage(topic=topic, payload=payload, qos=qos, retain=retain)
            self._buffer.append(message)
            return True

    async def flush(self, mqtt_client) -> int:
        """Flush messages when connection restored."""
        flushed_count = 0
        async with self._lock:
            while self._buffer:
                message = self._buffer.popleft()
                success = mqtt_client.publish(message.topic, message.payload, message.qos)
                if success:
                    flushed_count += 1
                else:
                    # Re-queue failed (max 3 attempts)
                    if message.attempts < 3:
                        message.attempts += 1
                        self._buffer.appendleft(message)
                    break
        return flushed_count
```

---

## 8. Mosquitto Broker Config

**Datei:** `docker/mosquitto/mosquitto.conf`

### Dual-Listener

```conf
# MQTT (für ESP32)
listener 1883
protocol mqtt

# WebSocket (für Frontend)
listener 9001
protocol websockets
```

### Development-Mode

```conf
# WARNING: Only for development!
allow_anonymous true

# Production würde aktivieren:
# allow_anonymous false
# password_file /mosquitto/config/passwd
# acl_file /mosquitto/config/acl
```

### Limits

| Setting | Wert | Beschreibung |
|---------|------|--------------|
| `max_inflight_messages` | 20 | Gleichzeitig unbestätigte QoS 1/2 |
| `max_queued_messages` | 1000 | Queue pro Client |
| `message_size_limit` | 262144 | 256KB max Payload |
| `max_keepalive` | 65535 | Max Keepalive-Interval |

### Persistence

```conf
persistence true
persistence_location /mosquitto/data/
```

---

## 9. MQTT Error-Codes

### ESP32 MQTT Errors (3010-3016)

| Code | Name | Beschreibung |
|------|------|--------------|
| 3010 | `MQTT_INIT_FAILED` | Failed to initialize MQTT client |
| 3011 | `MQTT_CONNECT_FAILED` | MQTT broker connection failed |
| 3012 | `MQTT_PUBLISH_FAILED` | Failed to publish MQTT message |
| 3013 | `MQTT_SUBSCRIBE_FAILED` | Failed to subscribe to topic |
| 3014 | `MQTT_DISCONNECT` | MQTT disconnected from broker |
| 3015 | `MQTT_BUFFER_FULL` | Offline buffer is full |
| 3016 | `MQTT_PAYLOAD_INVALID` | Payload is invalid or malformed |

### Server MQTT Errors (5101-5107)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5101 | `PUBLISH_FAILED` | MQTT publish operation failed |
| 5102 | `TOPIC_BUILD_FAILED` | Failed to build MQTT topic |
| 5103 | `PAYLOAD_SERIALIZATION_FAILED` | Failed to serialize payload |
| 5104 | `CONNECTION_LOST` | MQTT connection lost |
| 5105 | `RETRY_EXHAUSTED` | Retry attempts exhausted |
| 5106 | `BROKER_UNAVAILABLE` | Broker is unavailable |
| 5107 | `AUTHENTICATION_FAILED` | Authentication failed |

---

## 10. Kritische Dateipfade

### ESP32

| Datei | Beschreibung |
|-------|--------------|
| `El Trabajante/src/utils/topic_builder.cpp` | Topic-Builder Implementation |
| `El Trabajante/src/utils/topic_builder.h` | Topic-Builder Header |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | MQTT Client mit Circuit Breaker |
| `El Trabajante/src/services/communication/mqtt_client.h` | MQTT Client Header |
| `El Trabajante/src/models/error_codes.h` | Error-Codes 3010-3016 |

### Server

| Datei | Beschreibung |
|-------|--------------|
| `El Servador/god_kaiser_server/src/core/constants.py` | Topic-Konstanten, QoS |
| `El Servador/god_kaiser_server/src/mqtt/topics.py` | TopicBuilder Python |
| `El Servador/god_kaiser_server/src/mqtt/publisher.py` | Publisher mit Retry |
| `El Servador/god_kaiser_server/src/mqtt/subscriber.py` | Subscriber + Handler-Routing |
| `El Servador/god_kaiser_server/src/mqtt/client.py` | MQTT Client Wrapper |
| `El Servador/god_kaiser_server/src/mqtt/offline_buffer.py` | Async Offline Buffer |
| `El Servador/god_kaiser_server/src/mqtt/handlers/` | 15 Message-Handler |
| `El Servador/god_kaiser_server/src/main.py` | Handler-Registrierung (lifespan, u. a. intent_outcome + lifecycle) |
| `El Servador/god_kaiser_server/src/core/error_codes.py` | Error-Codes 5101-5107 |

### Docker

| Datei | Beschreibung |
|-------|--------------|
| `docker/mosquitto/mosquitto.conf` | Broker-Konfiguration |
| `docker-compose.yml` | Service-Definition `mqtt-broker` |

### Referenzen

| Datei | Beschreibung |
|-------|--------------|
| `.claude/reference/api/MQTT_TOPICS.md` | Vollständige Topic-Dokumentation |
| `.claude/reference/errors/ERROR_CODES.md` | Error-Code Referenz |

---

## 11. Make-Targets

```bash
# MQTT-Traffic beobachten (alle kaiser Topics)
make mqtt-sub
# → docker exec -it automationone-mqtt mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30

# Broker-Logs anzeigen
make logs-mqtt
# → docker compose logs mqtt-broker

# Broker neustarten
make restart-mqtt
# → docker compose restart mqtt-broker
```

---

## 12. QoS-Entscheidung Flowchart

```
Neuer Topic/Message?
       │
       ▼
Kann ein Duplikat Schaden anrichten?
(Actuator wird zweimal aktiviert, Config wird doppelt angewendet)
       │
  ┌────┴────┐
  │ JA      │ NEIN
  ▼         ▼
QoS 2      Ist Message-Loss kritisch?
           │
      ┌────┴────┐
      │ JA      │ NEIN
      ▼         ▼
    QoS 1     QoS 0
```

---

## 13. Bekannte Lücken / TODOs

### Synchronisations-Issues

1. **MQTT_TOPICS.md Zeilennummern**
   - Zeilennummern in Code-Referenzen teilweise veraltet nach Refactoring
   - Empfehlung: Bei Änderungen MQTT_TOPICS.md aktualisieren

2. **Bridge/ACL nicht implementiert**
   - Mosquitto läuft im anonymous-Mode
   - Production benötigt `password_file` + `acl_file`
   - Siehe: `.claude/reference/security/PRODUCTION_CHECKLIST.md`

3. **Keine trace-id in MQTT-Payloads**
   - Korrelation nur via `esp_id` + `gpio` + `timestamp`
   - End-to-End-Tracking nur über `correlation_id` in Actuator-Commands

### Fehlende Server-Enum-Einträge

- I2C Bus Recovery Codes (1015-1018) nicht in `ESP32HardwareError` enum
- DS18B20 Codes (1060-1063) nicht in `ESP32HardwareError` enum
- `INVALID_PAYLOAD_FORMAT` fehlt in `ValidationErrorCode`

---

## 14. Workflow

```
1. ANALYSE      → Topic-Schema + QoS bestimmen
2. ESP32        → topic_builder.cpp/h erweitern
3. SERVER       → constants.py + topics.py + Handler
4. SYNCHRON     → MQTT_TOPICS.md aktualisieren
5. VERIFY       → make mqtt-sub, Logs prüfen
```

---

## 15. Regeln

### NIEMALS

- Topics ohne Synchronisation zwischen ESP32/Server ändern
- QoS für Actuator-Commands unter 2 setzen
- Empty-Payloads publishen (werden blockiert)
- Handler ohne Error-Handling implementieren
- Blocking-Code in async Handlers

### IMMER

- Topic-Schema `kaiser/{kaiser_id}/esp/{esp_id}/...` einhalten
- QoS-Strategie befolgen (Section 2)
- Offline-Verhalten berücksichtigen
- Error-Codes aus Ranges verwenden (ESP32: 3010-3016, Server: 5101-5107)
- MQTT_TOPICS.md bei Topic-Änderungen aktualisieren

---

*Kompakter Skill für MQTT-Entwicklung. Details in MQTT_TOPICS.md und ERROR_CODES.md*
