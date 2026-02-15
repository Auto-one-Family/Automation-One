# MQTT-Debug Infrastruktur-Analyse

**Erstellt:** 2026-02-04
**Zweck:** Vollständige Dokumentation der mqtt-debug Arbeitsumgebung
**Verifiziert gegen:** Quellcode-Analyse (topics.py, topic_builder.cpp, sensor_handler.py, heartbeat_handler.py, mqtt_client.cpp, publisher.py)

---

## 1. Log-Format

### 1.1 mosquitto_sub -v Output

Der Debug-Traffic wird erfasst durch:
```bash
mosquitto_sub -h localhost -t "kaiser/#" -v > logs/current/mqtt_traffic.log
```

**Ausgabe-Format (eine Zeile pro Message):**
```
kaiser/god/esp/ESP_12AB34CD/system/heartbeat {"esp_id":"ESP_12AB34CD","ts":1735818000,"uptime":3600,"heap_free":245760,"wifi_rssi":-65}
```

| Teil | Beschreibung | Parsing-Regel |
|------|--------------|---------------|
| **Topic** | Von Zeilenanfang bis erstes Leerzeichen | `line.split(' ', 1)[0]` |
| **Payload** | Alles nach dem ersten Leerzeichen | `line.split(' ', 1)[1]` |

### 1.2 Besonderheiten

- **Keine mehrzeiligen Payloads:** JSON ist immer kompakt (einzeilig)
- **Timestamp im Payload:** `ts` ist Unix-Timestamp (Sekunden oder Millisekunden)
- **ESP32 sendet Millisekunden:** Erkennung via `ts > 1e10`
- **Keine Retain-Messages im Live-Traffic** (außer LWT)

---

## 2. Topic-Schema

### 2.1 Hierarchie

```
kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio?}/{aktion?}
```

| Segment | Werte | Beschreibung |
|---------|-------|--------------|
| `kaiser_id` | `"god"` | God-Kaiser Server (einziger Wert aktuell) |
| `esp_id` | `ESP_[6-8 hex]` | ESP32 Device ID (z.B. `ESP_12AB34CD`) |
| `kategorie` | siehe 2.2 | Message-Kategorie |
| `gpio` | `0-39` | GPIO Pin (optional) |
| `aktion` | siehe 2.3 | Aktion/Subtype (optional) |

### 2.2 Topic-Kategorien

| Kategorie | Beispiel-Topic | Richtung | QoS | Code-Referenz |
|-----------|----------------|----------|-----|---------------|
| `sensor` | `.../sensor/{gpio}/data` | ESP→Server | 1 | topic_builder.cpp:53 |
| `sensor` | `.../sensor/{gpio}/command` | Server→ESP | 2 | topic_builder.cpp:70 |
| `sensor` | `.../sensor/{gpio}/response` | ESP→Server | 1 | topic_builder.cpp:79 |
| `sensor` | `.../sensor/batch` | ESP→Server | 1 | topic_builder.cpp:61 |
| `actuator` | `.../actuator/{gpio}/command` | Server→ESP | 2 | topic_builder.cpp:87 |
| `actuator` | `.../actuator/{gpio}/status` | ESP→Server | 1 | topic_builder.cpp:95 |
| `actuator` | `.../actuator/{gpio}/response` | ESP→Server | 1 | topic_builder.cpp:103 |
| `actuator` | `.../actuator/{gpio}/alert` | ESP→Server | 1 | topic_builder.cpp:111 |
| `actuator` | `.../actuator/emergency` | Server→ESP | 1 | topic_builder.cpp:119 |
| `system` | `.../system/heartbeat` | ESP→Server | 0 | topic_builder.cpp:127 |
| `system` | `.../system/heartbeat/ack` | Server→ESP | 0 | topic_builder.cpp:136 |
| `system` | `.../system/command` | Server→ESP | 2 | topic_builder.cpp:144 |
| `system` | `.../system/diagnostics` | ESP→Server | 0 | topic_builder.cpp:152 |
| `system` | `.../system/error` | ESP→Server | 1 | topic_builder.cpp:160 |
| `system` | `.../system/will` (LWT) | Broker→Server | 1 | mqtt_client.cpp:181 |
| `config` | `.../config` | Server→ESP | 2 | topic_builder.cpp:168 |
| `config_response` | `.../config_response` | ESP→Server | 2 | topic_builder.cpp:176 |
| `zone` | `.../zone/assign` | Server→ESP | 1 | topics.py:214 |
| `zone` | `.../zone/ack` | ESP→Server | 1 | topic_builder.cpp:170 |
| `subzone` | `.../subzone/assign` | Server→ESP | 1 | topic_builder.cpp:192 |
| `subzone` | `.../subzone/remove` | Server→ESP | 1 | topic_builder.cpp:199 |
| `subzone` | `.../subzone/ack` | ESP→Server | 1 | topic_builder.cpp:206 |
| `subzone` | `.../subzone/status` | ESP→Server | 1 | topic_builder.cpp:213 |
| `broadcast` | `kaiser/broadcast/emergency` | Server→ALL | 2 | topic_builder.cpp:184 |

### 2.3 Wildcard-Patterns (Server Subscriptions)

```python
# subscriber.py - Server lauscht auf:
"kaiser/god/esp/+/sensor/+/data"          # Sensor-Daten
"kaiser/god/esp/+/sensor/batch"           # Batch Sensor-Daten
"kaiser/god/esp/+/actuator/+/status"      # Actuator-Status
"kaiser/god/esp/+/actuator/+/response"    # Command-Response
"kaiser/god/esp/+/actuator/+/alert"       # Alerts
"kaiser/god/esp/+/system/heartbeat"       # Heartbeats
"kaiser/god/esp/+/config_response"        # Config ACKs
"kaiser/god/esp/+/zone/ack"               # Zone ACKs
"kaiser/god/esp/+/subzone/ack"            # Subzone ACKs
"kaiser/god/esp/+/system/will"            # LWT Messages
"kaiser/god/esp/+/system/error"           # Error Events
```

**ESP32 Wildcard-Subscriptions:**
```cpp
// main.cpp - ESP32 lauscht auf:
"kaiser/god/esp/{esp_id}/actuator/+/command"   // Actuator-Befehle
"kaiser/god/esp/{esp_id}/sensor/+/command"     // Sensor-Befehle
"kaiser/god/esp/{esp_id}/config"               // Config-Updates
"kaiser/god/esp/{esp_id}/system/command"       // System-Befehle
"kaiser/god/esp/{esp_id}/zone/assign"          // Zone-Assignment
"kaiser/god/esp/{esp_id}/subzone/assign"       // Subzone-Assignment
"kaiser/broadcast/emergency"                    // Global Emergency
```

---

## 3. Payload-Schemas

### 3.1 Heartbeat (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/system/heartbeat`
**QoS:** 0 | **Interval:** 60s (forced)

```json
{
  "esp_id": "ESP_12AB34CD",       // Pflicht
  "zone_id": "greenhouse",        // Optional
  "master_zone_id": "main_zone",  // Optional
  "zone_assigned": true,          // Optional
  "ts": 1735818000,               // Pflicht (Unix timestamp)
  "uptime": 3600,                 // Pflicht (Sekunden seit Boot)
  "heap_free": 245760,            // Pflicht (Bytes)
  "wifi_rssi": -65,               // Pflicht (dBm)
  "sensor_count": 3,              // Optional
  "actuator_count": 2,            // Optional
  "gpio_status": [                // Optional (Phase 1)
    {
      "gpio": 4,
      "owner": "sensor",
      "component": "DS18B20",
      "mode": 1,
      "safe": false
    }
  ],
  "gpio_reserved_count": 4        // Optional
}
```

**Validierung (heartbeat_handler.py:660-733):**
| Feld | Required | Typ | Validierung |
|------|----------|-----|-------------|
| `ts` | ✅ | int | Unix timestamp |
| `uptime` | ✅ | int | Sekunden |
| `heap_free` / `free_heap` | ✅ | int | Bytes (einer von beiden) |
| `wifi_rssi` | ✅ | int | dBm |

### 3.2 Heartbeat ACK (Server→ESP)

**Topic:** `kaiser/god/esp/{esp_id}/system/heartbeat/ack`
**QoS:** 0

```json
{
  "status": "online",            // pending_approval|approved|online|rejected
  "config_available": false,     // True wenn Config pending
  "server_time": 1735818000      // Unix timestamp
}
```

### 3.3 Sensor Data (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`
**QoS:** 1

```json
{
  "ts": 1735818000,              // Pflicht
  "esp_id": "ESP_12AB34CD",      // Pflicht
  "gpio": 4,                     // Pflicht
  "sensor_type": "DS18B20",      // Pflicht
  "raw": 2150,                   // Pflicht (oder "raw_value")
  "raw_mode": true,              // Pflicht
  "value": 21.5,                 // Optional (wenn raw_mode=false)
  "unit": "°C",                  // Optional
  "quality": "good",             // Optional
  "subzone_id": "zone_a",        // Optional
  "onewire_address": "28FF...",  // Optional (OneWire)
  "i2c_address": 68              // Optional (I2C: 0-127)
}
```

**Validierung (sensor_handler.py:370-516):**
| Feld | Required | Typ | Validierung |
|------|----------|-----|-------------|
| `ts` / `timestamp` | ✅ | int | Unix timestamp |
| `esp_id` | ✅ | string | ESP Device ID |
| `gpio` | ✅ | int | GPIO Pin |
| `sensor_type` | ✅ | string | Sensor-Typ |
| `raw` / `raw_value` | ✅ | numeric | Raw-Wert |
| `raw_mode` | ✅ | bool | Pi-Enhanced Flag |
| `quality` | ❌ | string | good/fair/poor/suspect/error/unknown |
| `i2c_address` | ❌ | int | 0-127 |

### 3.4 Actuator Command (Server→ESP)

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/command`
**QoS:** 2

```json
{
  "command": "ON",               // ON|OFF|PWM|TOGGLE
  "value": 1.0,                  // 0.0-1.0
  "duration": 0,                 // Sekunden (0=unbegrenzt)
  "timestamp": 1735818000,
  "correlation_id": "cmd_abc123" // Optional (Tracking)
}
```

### 3.5 Actuator Response (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/response`
**QoS:** 1

```json
{
  "ts": 1735818000,
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "success": true,
  "message": "Command executed",
  "correlation_id": "cmd_abc123"
}
```

### 3.6 Actuator Status (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/status`
**QoS:** 1

```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "subzone_id": "zone_a",
  "gpio": 5,
  "type": "pump",                // pump|pwm|valve|relay
  "state": true,                 // oder "on"/"off"
  "pwm": 128,                    // 0-255
  "runtime_ms": 3600000,         // Akkumulierte Laufzeit
  "emergency": "normal"          // normal|active|clearing|resuming
}
```

### 3.7 Actuator Alert (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert`
**QoS:** 1

```json
{
  "ts": 1735818000,
  "gpio": 5,                     // 255 = System-weit
  "type": "emergency_stop",      // emergency_stop|config_invalid|runtime_protection|overrun|fault
  "message": "Actuator stopped"
}
```

### 3.8 Config (Server→ESP)

**Topic:** `kaiser/god/esp/{esp_id}/config`
**QoS:** 2

```json
{
  "config_id": "cfg_12345",
  "sensors": [
    {
      "gpio": 4,
      "type": "DS18B20",
      "name": "Boden Temp",
      "subzone_id": "zone_a",
      "active": true,
      "raw_mode": true,
      "operating_mode": "continuous",
      "measurement_interval_seconds": 30
    }
  ],
  "actuators": [
    {
      "gpio": 5,
      "type": "pump",
      "name": "Pumpe 1",
      "subzone_id": "zone_a",
      "active": true,
      "critical": false,
      "inverted": false,
      "default_state": false
    }
  ]
}
```

### 3.9 Config Response (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/config_response`
**QoS:** 2

**Success:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "config_id": "cfg_12345",
  "config_applied": true,
  "applied_sections": ["sensors", "actuators"],
  "skipped_sections": [],
  "restart_required": false
}
```

**Failure:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "config_id": "cfg_12345",
  "config_applied": false,
  "error": "Invalid GPIO configuration",
  "failed_section": "sensors",
  "error_details": {
    "gpio": 4,
    "reason": "GPIO already in use"
  }
}
```

### 3.10 Zone Assignment (Server→ESP)

**Topic:** `kaiser/god/esp/{esp_id}/zone/assign`
**QoS:** 1

```json
{
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus",
  "master_zone_id": "main_zone"
}
```

### 3.11 Zone ACK (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/zone/ack`
**QoS:** 1

```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus",
  "success": true,
  "message": "Zone assigned successfully"
}
```

### 3.12 LWT - Last Will Testament (Broker→Server)

**Topic:** `kaiser/god/esp/{esp_id}/system/will`
**QoS:** 1 | **Retain:** true

```json
{
  "status": "offline",
  "reason": "unexpected_disconnect",
  "timestamp": 1735818000
}
```

### 3.13 System Error (ESP→Server)

**Topic:** `kaiser/god/esp/{esp_id}/system/error`
**QoS:** 1

```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "error_code": "GPIO_CONFLICT",
  "severity": "critical",         // warning|error|critical
  "message": "GPIO 5 already in use",
  "module": "GPIOManager",
  "function": "initializeGPIO",
  "context": {
    "gpio": 5,
    "requested_mode": "OUTPUT",
    "current_mode": "INPUT"
  }
}
```

### 3.14 Emergency Broadcast (Server→ALL)

**Topic:** `kaiser/broadcast/emergency`
**QoS:** 2

```json
{
  "action": "stop_all",           // stop_all|stop_actuator|safe_mode
  "gpio": 5,                      // Optional (nur bei stop_actuator)
  "reason": "User emergency stop",
  "timestamp": 1735818000
}
```

---

## 4. Message-Sequenzen

### 4.1 Boot-Sequenz (New Device Discovery)

```
T+0s     ESP → Server:  system/heartbeat
                        {"esp_id":"ESP_NEW","ts":...,"uptime":0,...}

T+0.1s   Server:        Auto-Discovery (status: pending_approval)

T+0.2s   Server → ESP:  system/heartbeat/ack
                        {"status":"pending_approval","config_available":false}

T+60s    ESP → Server:  system/heartbeat (wiederholt alle 60s)
         Server → ESP:  system/heartbeat/ack {"status":"pending_approval"}

         [Admin genehmigt Gerät via REST-API]

T+Xs     ESP → Server:  system/heartbeat
T+Xs     Server → ESP:  system/heartbeat/ack {"status":"online","config_available":true}
T+Xs     Server → ESP:  config {...}
T+Xs     ESP → Server:  config_response {"config_applied":true}
```

### 4.2 Boot-Sequenz (Known Device)

```
T+0s     ESP → Server:  system/heartbeat
                        {"esp_id":"ESP_12AB34CD",...}

T+0.1s   Server → ESP:  system/heartbeat/ack
                        {"status":"online","config_available":false}

T+0.5s   Server → ESP:  config (falls pending)
T+1s     ESP → Server:  config_response

T+60s    ESP → Server:  system/heartbeat (Intervall)
```

### 4.3 Sensor Data Flow

```
T+0s     ESP → Server:  sensor/4/data
                        {"gpio":4,"sensor_type":"DS18B20","raw":2150,"raw_mode":true,...}

T+20ms   Server:        Parse → Validate → Pi-Enhanced Processing
T+50ms   Server:        DB Save → WebSocket Broadcast
T+70ms   Server:        Logic Engine Trigger (async)
```

### 4.4 Actuator Command Flow

```
T+0s     Server → ESP:  actuator/5/command
                        {"command":"ON","value":1.0,"duration":0}

T+10ms   ESP:           Safety Check → GPIO Set

T+50ms   ESP → Server:  actuator/5/response
                        {"success":true,"message":"Command executed"}

T+100ms  ESP → Server:  actuator/5/status
                        {"state":true,"pwm":255,"runtime_ms":0}
```

### 4.5 Zone Assignment Flow

```
T+0s     Server → ESP:  zone/assign
                        {"zone_id":"greenhouse","zone_name":"Gewächshaus"}

T+100ms  ESP:           NVS Store

T+200ms  ESP → Server:  zone/ack
                        {"success":true,"zone_id":"greenhouse"}
```

### 4.6 Emergency Stop Flow

```
T+0s     Server → ALL:  kaiser/broadcast/emergency
                        {"action":"stop_all","reason":"User request"}

T+10ms   ESP:           stopAllActuators() → Safe-Mode aktiviert
                        (<50ms garantiert!)

T+50ms   ESP → Server:  actuator/255/alert
                        {"type":"emergency_stop","gpio":255}

T+60ms   ESP → Server:  safe_mode
                        {"safe_mode_active":true}
```

### 4.7 Unexpected Disconnect (LWT)

```
T+0s     ESP:           WiFi/MQTT Disconnect (ungeplant)

T+0.1s   Broker:        Keepalive Timeout erreicht

T+1s     Broker → Server: system/will (retained)
                         {"status":"offline","reason":"unexpected_disconnect"}
```

---

## 5. QoS-Übersicht

### 5.1 QoS-Level Zuordnung

| QoS | Garantie | Verwendung |
|-----|----------|------------|
| **0** | At most once (best effort) | Heartbeat, Diagnostics, ACKs |
| **1** | At least once | Sensor-Daten, Alerts, Status, Zone-Ops |
| **2** | Exactly once | Commands, Config (kritisch) |

### 5.2 Topic-zu-QoS Mapping

| Topic-Pattern | QoS | Grund |
|---------------|-----|-------|
| `system/heartbeat` | 0 | Periodisch, unkritisch |
| `system/heartbeat/ack` | 0 | Fire-and-forget |
| `system/diagnostics` | 0 | Monitoring, unkritisch |
| `sensor/+/data` | 1 | Datenverlust vermeiden |
| `sensor/batch` | 1 | Datenverlust vermeiden |
| `actuator/+/status` | 1 | Status wichtig |
| `actuator/+/response` | 1 | Command-Bestätigung |
| `actuator/+/alert` | 1 | Alerts wichtig |
| `system/will` | 1 | LWT wichtig |
| `system/error` | 1 | Fehler-Tracking |
| `actuator/+/command` | 2 | Exakte Ausführung |
| `sensor/+/command` | 2 | Exakte Ausführung |
| `system/command` | 2 | Kritische Befehle |
| `config` | 2 | Config-Konsistenz |
| `config_response` | 2 | Config-Bestätigung |
| `broadcast/emergency` | 2 | Safety-kritisch |

---

## 6. Timing-Erwartungen

### 6.1 Intervalle

| Metrik | Wert | Konfigurierbar | Code-Referenz |
|--------|------|----------------|---------------|
| Heartbeat-Intervall | 60s | Nein (forced) | mqtt_client.cpp:663 |
| Sensor-Messung | 30s | Ja (2s-5min) | MQTT_TOPICS.md:74 |
| Diagnostics | 60s | Nein | MQTT_TOPICS.md:526 |

### 6.2 Timeouts

| Metrik | Wert | Alarm wenn | Code-Referenz |
|--------|------|------------|---------------|
| Device-Timeout | 300s (5min) | Kein Heartbeat | heartbeat_handler.py:44 |
| Registration-Gate | 10s | Kein ACK | mqtt_client.cpp:505 |
| MQTT Keepalive | 60s | Connection lost | mqtt_client.cpp:136 |
| Circuit Breaker Open | 30s | 5 Failures | mqtt_client.cpp:55-61 |
| Half-Open Test | 10s | Nach Recovery | mqtt_client.cpp:55-61 |

### 6.3 Latenz-Erwartungen

| Flow | Gesamt-Latenz | Kritisch |
|------|---------------|----------|
| Sensor-Daten (ESP→DB) | 50-230ms | Nein |
| Actuator-Command (E2E) | 100-290ms | Nein |
| Emergency Stop | <100ms | **JA** |
| Heartbeat-Verarbeitung | 20-80ms | Nein |

### 6.4 Reconnect-Timing (Exponential Backoff)

```
Attempt 1:  1s    (2^0 × 1000ms)
Attempt 2:  2s    (2^1 × 1000ms)
Attempt 3:  4s    (2^2 × 1000ms)
Attempt 4:  8s    (2^3 × 1000ms)
Attempt 5:  16s   (2^4 × 1000ms)
Attempt 6+: 60s   (capped)
```

---

## 7. Fehler-Patterns

### 7.1 Fehlendes ACK (Heartbeat)

**Erwartung:**
```
ESP → Server:  system/heartbeat
Server → ESP:  system/heartbeat/ack (innerhalb 1s)
```

**Fehler-Indikator:**
- Heartbeat ohne folgendes ACK im Log
- ESP verbleibt in PENDING_APPROVAL-Modus
- Nach 10s: Registration-Gate öffnet automatisch (Fallback)

**Debug:**
```bash
grep -E "heartbeat|heartbeat/ack" mqtt_traffic.log | head -20
```

### 7.2 Malformed Payload

**Sensor-Daten ohne Pflichtfelder:**
```
[ERROR] Invalid sensor data payload from ESP_12AB34CD: Missing required field: raw_mode
```

**Heartbeat ohne ts:**
```
[ERROR] Invalid heartbeat payload from ESP_12AB34CD: Missing required field: ts
```

**Debug:**
```bash
grep "ERROR.*Invalid.*payload" god_kaiser.log
```

### 7.3 Unbekanntes Gerät

**Pattern im Log:**
```
ESP → Server:  system/heartbeat {"esp_id":"ESP_UNKNOWN",...}
Server:        [INFO] New ESP discovered: ESP_UNKNOWN (pending_approval)
Server → ESP:  system/heartbeat/ack {"status":"pending_approval"}
```

**Kein weiterer Traffic** (außer heartbeat) bis Admin-Genehmigung.

### 7.4 Rejected Device

**Pattern:**
```
ESP → Server:  system/heartbeat {"esp_id":"ESP_REJECTED",...}
Server → ESP:  system/heartbeat/ack {"status":"rejected"}
```

**Kein Config, keine Commands** - nur Heartbeat-ACK mit "rejected".

### 7.5 LWT (Unexpected Disconnect)

**Pattern im Log:**
```
kaiser/god/esp/ESP_12AB34CD/system/will {"status":"offline","reason":"unexpected_disconnect"}
```

**Trigger:** ESP verliert Verbindung ohne `disconnect()` aufzurufen.

### 7.6 Config-Rejection

**Pattern:**
```
Server → ESP:  config {...}
ESP → Server:  config_response {"config_applied":false,"error":"GPIO conflict"}
```

**Fehler-Details in `error_details` Feld.**

### 7.7 Command-Rejection (Emergency Stop)

**Pattern:**
```
Server → ESP:  actuator/5/command {"command":"ON",...}
ESP → Server:  actuator/5/response {"success":false,"message":"Actuator emergency stopped"}
```

### 7.8 Circuit Breaker Open (ESP-seitig)

**ESP Serial Log:**
```
[WARNING] MQTT publish blocked by Circuit Breaker (Service DOWN)
```

**Im MQTT-Traffic:** Keine Messages vom betroffenen ESP für 30s.

---

## 8. Debug-Strategien für mqtt-debug Agent

### 8.1 Topic-Extraktion

```python
def parse_log_line(line: str) -> tuple[str, dict]:
    """Parse mosquitto_sub -v output line."""
    parts = line.split(' ', 1)
    topic = parts[0]
    payload = json.loads(parts[1]) if len(parts) > 1 else {}
    return topic, payload
```

### 8.2 ESP-ID Extraktion aus Topic

```python
def extract_esp_id(topic: str) -> str | None:
    """Extract ESP ID from topic."""
    # Pattern: kaiser/god/esp/{esp_id}/...
    match = re.match(r"kaiser/\w+/esp/([A-Z0-9_]+)/", topic)
    return match.group(1) if match else None
```

### 8.3 Message-Kategorisierung

```python
def categorize_message(topic: str) -> str:
    """Kategorisiere Message nach Topic."""
    if "/system/heartbeat" in topic and "/ack" not in topic:
        return "heartbeat_request"
    if "/heartbeat/ack" in topic:
        return "heartbeat_ack"
    if "/sensor/" in topic and "/data" in topic:
        return "sensor_data"
    if "/actuator/" in topic and "/command" in topic:
        return "actuator_command"
    if "/actuator/" in topic and "/response" in topic:
        return "actuator_response"
    if "/actuator/" in topic and "/status" in topic:
        return "actuator_status"
    if "/actuator/" in topic and "/alert" in topic:
        return "actuator_alert"
    if "/config" in topic and "_response" not in topic:
        return "config_push"
    if "/config_response" in topic:
        return "config_response"
    if "/zone/assign" in topic:
        return "zone_assign"
    if "/zone/ack" in topic:
        return "zone_ack"
    if "/system/will" in topic:
        return "lwt"
    if "/system/error" in topic:
        return "error_event"
    if "/broadcast/emergency" in topic:
        return "emergency_broadcast"
    return "unknown"
```

### 8.4 Sequenz-Validierung

```python
def validate_request_response(messages: list, timeout_sec: float = 5.0) -> list[str]:
    """Finde fehlende Responses."""
    issues = []

    # Heartbeat → ACK
    for hb in filter(lambda m: m["type"] == "heartbeat_request", messages):
        ack_found = any(
            m["type"] == "heartbeat_ack" and
            m["esp_id"] == hb["esp_id"] and
            m["ts"] - hb["ts"] < timeout_sec
            for m in messages
        )
        if not ack_found:
            issues.append(f"Missing heartbeat/ack for {hb['esp_id']}")

    # Command → Response
    for cmd in filter(lambda m: m["type"] == "actuator_command", messages):
        resp_found = any(
            m["type"] == "actuator_response" and
            m["esp_id"] == cmd["esp_id"] and
            m["gpio"] == cmd["gpio"]
            for m in messages
        )
        if not resp_found:
            issues.append(f"Missing response for actuator command {cmd['esp_id']}/{cmd['gpio']}")

    return issues
```

### 8.5 Timing-Analyse

```python
def analyze_heartbeat_gaps(messages: list, expected_interval_sec: float = 60.0) -> list[str]:
    """Finde ungewöhnliche Lücken zwischen Heartbeats."""
    issues = []

    # Gruppiere nach ESP-ID
    by_esp = defaultdict(list)
    for m in filter(lambda m: m["type"] == "heartbeat_request", messages):
        by_esp[m["esp_id"]].append(m["ts"])

    for esp_id, timestamps in by_esp.items():
        timestamps.sort()
        for i in range(1, len(timestamps)):
            gap = timestamps[i] - timestamps[i-1]
            if gap > expected_interval_sec * 1.5:  # 50% Toleranz
                issues.append(f"Heartbeat gap {gap:.1f}s for {esp_id}")

    return issues
```

---

## 9. Zusammenfassung für Agent-Optimierung

### Der mqtt-debug Agent braucht:

**Input-Dateien:**
1. `logs/current/STATUS.md` - Session-Kontext und Modus
2. `logs/current/mqtt_traffic.log` - MQTT-Traffic (mosquitto_sub -v)
3. `.claude/reference/api/MQTT_TOPICS.md` - Topic-Referenz

**Kernwissen:**
1. Log-Format: `{topic} {json_payload}` (Leerzeichen als Trennzeichen)
2. Topic-Hierarchie: `kaiser/god/esp/{esp_id}/{kategorie}/...`
3. QoS-Levels: 0=Heartbeat, 1=Daten/Status, 2=Commands/Config
4. Pflichtfelder pro Message-Typ (siehe Section 3)
5. Erwartete Sequenzen (siehe Section 4)
6. Timing-Erwartungen (siehe Section 6)

**Pattern-Matching-Regeln:**
1. Topic bis erstes Leerzeichen extrahieren
2. ESP-ID aus Topic extrahieren (Regex: `kaiser/\w+/esp/([A-Z0-9_]+)/`)
3. Payload als JSON parsen
4. Message kategorisieren nach Topic-Pattern
5. Request-Response-Paare validieren
6. Timing zwischen Messages prüfen

**Fehler-Erkennung:**
1. Fehlendes ACK nach Request
2. Malformed Payload (fehlende Pflichtfelder)
3. Unerwartete Gaps in periodischen Messages
4. LWT Messages = Unexpected Disconnect
5. `success: false` in Responses
6. `config_applied: false` in Config-Response

---

## 10. Code-Referenzen (Verifiziert)

| Komponente | Datei | Beschreibung |
|------------|-------|--------------|
| Topic-Builder (ESP32) | topic_builder.cpp:1-226 | Alle buildXXXTopic() Methoden |
| Topic-Builder (Server) | topics.py:1-992 | Build + Parse Methoden |
| Heartbeat Handler | heartbeat_handler.py:1-1113 | Device-Discovery, Timeout, ACK |
| Sensor Handler | sensor_handler.py:1-732 | Validierung, Pi-Enhanced, DB |
| Publisher | publisher.py:1-442 | QoS-Management, Retry-Logic |
| MQTT Client (ESP32) | mqtt_client.cpp:1-964 | Connect, Circuit Breaker, LWT |
| MQTT Topics Referenz | MQTT_TOPICS.md | Vollständige Topic-Dokumentation |
| Communication Flows | COMMUNICATION_FLOWS.md | Sequenz-Diagramme |

---

**Ende der MQTT-Debug Infrastruktur-Analyse**
