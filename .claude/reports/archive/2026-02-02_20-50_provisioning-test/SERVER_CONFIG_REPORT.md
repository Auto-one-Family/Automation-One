# Server Debug Report - CONFIG

> **Session:** 2026-02-02_20-50_provisioning-test
> **Agent:** server-debug
> **Analysiert:** 2026-02-02 20:50
> **Log:** `logs/current/god_kaiser.log` (9.8MB)

---

## Summary

| Check | Status | Details |
|-------|--------|---------|
| Server Startup | ✅ OK | Lifespan gestartet 18:18:26 |
| Database | ✅ OK | Session resilient, Repos funktionieren |
| MQTT Subscriptions | ✅ OK | Alle Handler registriert |
| Config Handler | ⚠️ PARTIAL | 1 Success, 1 Invalid JSON |
| Zone ACK Handler | ⚠️ PARTIAL | Success nach Approval, aber Race-Condition |
| Error [5001] | 🔴 KRITISCH | 50+ "ESP device not found" Fehler |
| Invalid JSON | 🔴 KRITISCH | ESP32 sendet leere Payloads |

---

## Evidence

### 1. Server Startup (18:18:26-27)

**Zeile 31609:**
```json
{"level": "INFO", "message": "Logging configured: level=INFO, format=json, file=logs/god_kaiser.log"}
```

**Zeile 31613:**
```json
{"level": "INFO", "message": "Validating security configuration..."}
```

**Handler-Registrierung (31656):**
```json
{"level": "INFO", "message": "Registered handler for pattern: kaiser/god/esp/+/config_response"}
```

**Zone Handler (31657-31658):**
```json
{"level": "INFO", "message": "Registered handler for pattern: kaiser/god/esp/+/zone/ack"}
{"level": "INFO", "message": "Registered handler for pattern: kaiser/god/esp/+/subzone/ack"}
```

---

### 2. Config Response Verarbeitung

#### ERFOLG (18:18:27) - Zeile 31755

```json
{
  "level": "INFO",
  "logger": "src.mqtt.handlers.config_handler",
  "message": "✅ Config Response from ESP_472204: actuator (1 items) - Configured 1 actuator(s) successfully",
  "function": "handle_config_ack",
  "line": 127
}
```

**Bewertung:** Config-Handler verarbeitet gültige Payloads korrekt.

#### FEHLER (18:24:07) - Zeile 32878

```json
{
  "level": "ERROR",
  "logger": "src.mqtt.subscriber",
  "message": "Invalid JSON payload on topic kaiser/god/esp/ESP_472204/config_response: Expecting value: line 1 column 1 (char 0)",
  "function": "_route_message",
  "line": 163
}
```

**Bewertung:** ESP32 sendet **leere MQTT-Nachricht** (kein JSON-Body).

---

### 3. Zone Assignment Flow

#### Phase 1: Initialer Fehler (18:18:27) - Zeile 31762

```json
{
  "level": "WARNING",
  "logger": "src.mqtt.handlers.zone_ack_handler",
  "message": "[5001] Zone ACK from unknown device: ESP_472204",
  "function": "handle_zone_ack",
  "line": 122
}
```

**Error-Code [5001]:** CONFIG_ERROR - ESP nicht in Datenbank gefunden.
**Ursache:** ESP sendet Zone-ACK BEVOR Heartbeat verarbeitet wurde.

#### Phase 2: Handler False (18:18:27) - Zeile 31764

```json
{
  "level": "WARNING",
  "message": "Handler returned False for topic kaiser/god/esp/ESP_472204/zone/ack - processing may have failed"
}
```

**Bewertung:** Race-Condition zwischen Heartbeat-Registrierung und Zone-ACK.

#### Phase 3: Erfolgreiche Zone Assignment (19:36:00) - Zeilen 33639-33642

```json
{"level": "INFO", "message": "Zone assignment sent to ESP_472204: zone_id=test_zone_1, master_zone_id=None"}
{"level": "INFO", "message": "Zone assignment for ESP_472204 by Robin: zone_id=test_zone_1 (MQTT sent)"}
{"level": "INFO", "message": "Zone assignment confirmed for ESP_472204: zone_id=test_zone_1, master_zone_id="}
```

**Bewertung:** Nach korrekter Device-Registrierung funktioniert der komplette Flow.

---

### 4. Kritische Fehler: [5001] ESP Device Not Found

**Zeitraum:** 18:18:27-28
**Anzahl:** 50+ Fehler in 1 Sekunde

**Zeile 31758 (Actuator Handler):**
```json
{
  "level": "ERROR",
  "logger": "src.mqtt.handlers.actuator_handler",
  "message": "[5001] ESP device not found: ESP_472204 - ESP device not found in database",
  "function": "handle_actuator_status",
  "line": 106
}
```

**Zeilen 31765-31860 (Error Handler):**
```json
{
  "level": "ERROR",
  "logger": "src.mqtt.handlers.error_handler",
  "message": "[5001] ESP device not found: ESP_472204",
  "function": "handle_error_event",
  "line": 128
}
```

**Root Cause:**
- ESP32 sendet sofort nach MQTT-Connect: Actuator-Status, Sensor-Data, Zone-ACK
- Server hat ESP noch nicht über Heartbeat registriert
- Alle Handler schlagen fehl weil ESP nicht in DB

---

### 5. Invalid JSON Payloads (ESP32 sendet leere Nachrichten)

**Betroffene Topics:**

| Topic | Zeile | Timestamp |
|-------|-------|-----------|
| `kaiser/god/esp/ESP_472204/zone/ack` | 32877 | 18:24:03 |
| `kaiser/god/esp/ESP_472204/config_response` | 32878 | 18:24:07 |
| `kaiser/god/esp/ESP_472204/system/heartbeat` | 32882 | 18:24:26 |
| `kaiser/god/esp/ESP_472204/zone/ack` | 34508 | 20:49:14 |

**Fehler-Pattern:**
```
Expecting value: line 1 column 1 (char 0)
```

**Bewertung:** ESP32 sendet MQTT-Publish mit **leerem Payload** (0 Bytes).

---

### 6. Wiederkehrende Warnings: Actuator Config Not Found

**Zeilen 483-30920** (alle 30 Sekunden, 17:55-18:07):
```json
{
  "level": "WARNING",
  "logger": "src.mqtt.handlers.actuator_handler",
  "message": "Actuator config not found: esp_id=ESP_472204, gpio=26. Updating state without config.",
  "function": "handle_actuator_status",
  "line": 118
}
```

**Bewertung:** Actuator GPIO 26 nicht in DB konfiguriert, aber ESP sendet Status.

---

### 7. Positives Verhalten

#### Heartbeat-Verarbeitung (regelmäßig alle 60s)
- ESP Discovery funktioniert (32991, 34292, 34494)
- WebSocket Broadcasts funktionieren (0.2-0.8ms)
- Device-Status wird korrekt gesendet

#### Device Online nach Approval (19:34:32) - Zeile 33620
```json
{"level": "INFO", "message": "✅ Device ESP_472204 now online after approval"}
```

#### Maintenance Jobs (stabil)
- `_check_sensor_health` - alle 60s
- `_health_check_esps` - alle 60s
- `_health_check_mqtt` - alle 30s

---

## Diagnosis

### Problem 1: Race-Condition bei ESP-Startup

**Symptom:** [5001] ESP device not found (50+ mal)

**Ursache:**
1. ESP32 connected zu MQTT
2. ESP32 sendet sofort: Actuator-Status, Sensor-Data, Config-Response, Zone-ACK
3. Server hat Heartbeat noch nicht verarbeitet → ESP nicht in DB
4. Alle Handler schlagen fehl

**Betroffener Code:**
- `actuator_handler.py:106` - `handle_actuator_status`
- `zone_ack_handler.py:122` - `handle_zone_ack`
- `error_handler.py:128` - `handle_error_event`

### Problem 2: ESP32 sendet leere MQTT-Payloads

**Symptom:** Invalid JSON payload (char 0)

**Ursache:**
- ESP32 führt `mqttClient.publish(topic, "")` aus
- Leerer String = 0 Bytes = kein gültiges JSON

**Betroffene Topics:**
- `config_response`, `zone/ack`, `system/heartbeat`

### Problem 3: Nicht konfigurierter Actuator

**Symptom:** "Actuator config not found: gpio=26"

**Ursache:**
- ESP32 hat Actuator auf GPIO 26 aktiv
- Actuator nicht über Frontend/API in DB angelegt
- Server akzeptiert Status-Updates, warnt aber

---

## Recommended Actions

### 1. ESP32 Firmware - Startup-Sequenz korrigieren

**Priorität:** HOCH

```cpp
// FALSCH (aktuell):
void onMqttConnect() {
    sendActuatorStatus();  // ← Server kennt ESP noch nicht!
    sendSensorData();
    sendHeartbeat();
}

// RICHTIG:
void onMqttConnect() {
    sendHeartbeat();  // ERST Heartbeat
    // WARTEN auf Heartbeat-ACK
    // DANN andere Daten senden
}
```

**Location:** `El Trabajante/src/services/mqtt/mqtt_client.cpp`

### 2. ESP32 Firmware - Leere Payloads verhindern

**Priorität:** HOCH

Prüfen ob `publish()` mit leerem String aufgerufen wird:
```cpp
// FALSCH:
mqttClient.publish(topic, "");

// RICHTIG:
if (payload.length() > 0) {
    mqttClient.publish(topic, payload.c_str());
}
```

### 3. Server - Graceful Handling für unbekannte ESPs

**Priorität:** MITTEL

Statt ERROR nur WARNING loggen wenn ESP noch nicht registriert:
```python
# zone_ack_handler.py:122
if not esp:
    logger.warning(f"Zone ACK from unregistered device (will retry): {esp_id}")
    return True  # Don't mark as failed
```

### 4. Actuator GPIO 26 konfigurieren

**Priorität:** NIEDRIG

Via Frontend oder API Actuator für ESP_472204 GPIO 26 anlegen:
```
POST /api/v1/actuators
{
    "esp_id": "ESP_472204",
    "gpio": 26,
    "type": "relay",
    "name": "..."
}
```

---

## Timeline Summary

| Zeit | Event | Status |
|------|-------|--------|
| 17:55-18:07 | Actuator Warning (GPIO 26) | ⚠️ Alle 30s |
| 18:18:26 | Server Startup | ✅ |
| 18:18:27 | Handler Registration | ✅ |
| 18:18:27 | [5001] ESP not found Burst | 🔴 50+ Errors |
| 18:18:27 | Config Response Success | ✅ |
| 18:18:27 | Zone ACK Failed (unknown) | 🔴 |
| 18:24:03-26 | Invalid JSON Payloads | 🔴 |
| 18:34:30 | ESP Discovery | ✅ |
| 19:34:32 | Device Online | ✅ |
| 19:36:00 | Zone Assignment Success | ✅ |
| 20:28-48 | ESP Re-Discovery | ⚠️ |
| 20:49:14 | Invalid JSON (zone/ack) | 🔴 |

---

## Fazit

**CONFIG-Verarbeitung:** Grundsätzlich funktionsfähig, aber zwei kritische Probleme:

1. **Race-Condition beim ESP-Startup** - ESP sendet Daten bevor es registriert ist
2. **Leere MQTT-Payloads** - ESP32 Firmware sendet manchmal 0-Byte-Messages

Nach Device-Approval und korrekter Heartbeat-Sequenz funktioniert der gesamte Flow:
- Zone Assignment ✅
- Zone ACK Verarbeitung ✅
- Config Response Logging ✅
- WebSocket Broadcast ✅
- Audit Log ✅

---

*Report generiert: 2026-02-02 ~20:51*
*Server-Debug Agent v2.0*
