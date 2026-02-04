---
name: mqtt-reference
description: MQTT Topics Payloads publish subscribe Sensor Actuator Heartbeat
  Emergency Zone Config ESP32 Server Kommunikation QoS
allowed-tools: Read
---

# MQTT Topic Referenz

> **Version:** 2.0 | **Aktualisiert:** 2026-02-01
> **Quellen:** `El Trabajante/docs/Mqtt_Protocoll.md`, `CLAUDE_SERVER.md` Section 4
> **Verifiziert gegen:** `topic_builder.cpp`, `main.py`, `constants.py`

---

## 0. Quick-Lookup

### Topic-Struktur

```
kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}
```

- **kaiser_id:** `"god"` (God-Kaiser Server) - aktuell einziger Wert
- **esp_id:** ESP32 Device ID (z.B. `ESP_12AB34CD`)

### Alle Topics auf einen Blick

| Topic-Pattern | Richtung | QoS | Beschreibung |
|---------------|----------|-----|--------------|
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` | ESP→Server | 1 | Sensor sendet Rohdaten |
| `kaiser/god/esp/{esp_id}/sensor/batch` | ESP→Server | 1 | Batch Sensor-Daten |
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/command` | Server→ESP | 2 | Sensor-Befehl (on-demand) |
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/response` | ESP→Server | 1 | Sensor-Command Response |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` | Server→ESP | 2 | Server steuert Actuator |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/status` | ESP→Server | 1 | Actuator meldet Status |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/response` | ESP→Server | 1 | Command Response |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert` | ESP→Server | 1 | Actuator Alert |
| `kaiser/god/esp/{esp_id}/actuator/emergency` | Server→ESP | 1 | ESP-spezifischer Emergency |
| `kaiser/god/esp/{esp_id}/system/heartbeat` | ESP→Server | 0 | Heartbeat |
| `kaiser/god/esp/{esp_id}/system/heartbeat/ack` | Server→ESP | 0 | Heartbeat ACK (Phase 2) |
| `kaiser/god/esp/{esp_id}/system/command` | Server→ESP | 2 | System-Befehle |
| `kaiser/god/esp/{esp_id}/system/response` | ESP→Server | 1 | System-Response |
| `kaiser/god/esp/{esp_id}/system/diagnostics` | ESP→Server | 0 | Diagnostics |
| `kaiser/god/esp/{esp_id}/system/will` | ESP→Server | 1 | LWT (Last Will) |
| `kaiser/god/esp/{esp_id}/system/error` | ESP→Server | 1 | Error Event |
| `kaiser/god/esp/{esp_id}/status` | ESP→Server | 1 | System-Status |
| `kaiser/god/esp/{esp_id}/safe_mode` | ESP→Server | 1 | Safe-Mode Status |
| `kaiser/god/esp/{esp_id}/config` | Server→ESP | 2 | Config Update |
| `kaiser/god/esp/{esp_id}/config_response` | ESP→Server | 2 | Config ACK |
| `kaiser/god/esp/{esp_id}/zone/assign` | Server→ESP | 1 | Zone Assignment |
| `kaiser/god/esp/{esp_id}/zone/ack` | ESP→Server | 1 | Zone Assignment ACK |
| `kaiser/god/esp/{esp_id}/subzone/assign` | Server→ESP | 1 | Subzone Assignment (Phase 9) |
| `kaiser/god/esp/{esp_id}/subzone/remove` | Server→ESP | 1 | Subzone Removal (Phase 9) |
| `kaiser/god/esp/{esp_id}/subzone/ack` | ESP→Server | 1 | Subzone ACK |
| `kaiser/god/esp/{esp_id}/subzone/status` | ESP→Server | 1 | Subzone Status (Phase 9) |
| `kaiser/god/esp/{esp_id}/subzone/safe` | Server→ESP | 1 | Subzone Safe-Mode (Phase 9) |
| `kaiser/god/esp/{esp_id}/library/*` | bidirektional | 1 | Library Download Protocol |
| `kaiser/god/esp/{esp_id}/mqtt/auth_update` | Server→ESP | 1 | MQTT Auth Transition |
| `kaiser/god/esp/{esp_id}/mqtt/auth_status` | ESP→Server | 1 | MQTT Auth Status |
| `kaiser/broadcast/emergency` | Server→ALL | 2 | Global Emergency Stop |
| `kaiser/broadcast/system_update` | Server→ALL | 1 | System-Updates |

---

## 1. Sensor Topics

### 1.1 sensor/{gpio}/data (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**QoS:** 1 (at least once)
**Retain:** false
**Frequency:** Alle 30s (konfigurierbar: 2s - 5min)

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 4,
  "sensor_type": "DS18B20",
  "raw": 2150,
  "value": 21.5,
  "unit": "°C",
  "quality": "good",
  "subzone_id": "zone_a",
  "sensor_name": "Boden Temp",
  "library_name": "dallas_temp",
  "library_version": "1.0.0",
  "raw_mode": true,
  "meta": {
    "vref": 3300,
    "samples": 10,
    "calibration": {
      "offset": 0.5,
      "multiplier": 1.0
    }
  }
}
```

**Required Fields:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `ts` / `timestamp` | int | Unix Timestamp (seconds) |
| `esp_id` | string | ESP32 Device ID |
| `gpio` | int | GPIO Pin Nummer |
| `sensor_type` | string | Sensor-Typ (DS18B20, pH, etc.) |
| `raw` / `raw_value` | float | Raw ADC/Sensor-Wert |
| `raw_mode` | bool | **REQUIRED** - true = Server verarbeitet |

**Optional Fields:** `value`, `unit`, `quality`, `subzone_id`, `sensor_name`, `library_name`, `library_version`, `meta`

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSensorDataTopic()` (Zeile 38)
- **Server:** `sensor_handler.py:handle_sensor_data()` (Zeile 77)

**Quality-Levels:**
- `excellent`: Wert perfekt, keine Abweichungen
- `good`: Wert gut, minimale Abweichungen
- `fair`: Wert akzeptabel, moderate Abweichungen
- `poor`: Wert grenzwertig, hohe Abweichungen
- `bad`: Wert außerhalb gültiger Range
- `stale`: Wert zu alt (Sensor antwortet nicht)

---

### 1.2 sensor/batch (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch`

**QoS:** 1
**Frequency:** Alle 60s (optional)

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "DS18B20",
      "value": 21.5,
      "unit": "°C",
      "quality": "good"
    },
    {
      "gpio": 34,
      "sensor_type": "pH",
      "value": 7.2,
      "unit": "pH",
      "quality": "excellent"
    }
  ]
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSensorBatchTopic()` (Zeile 50)
- **Server:** `sensor_handler.py:handle_sensor_batch()` (Zeile 285)

---

### 1.3 sensor/{gpio}/command (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command`

**QoS:** 2 (exactly once)
**Verwendung:** On-Demand Measurement (Phase 2C)

**Payload:**
```json
{
  "command": "measure",
  "request_id": "req_12345"
}
```

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 740 (Subscription via Wildcard)
- **Server:** `publisher.py:publish_sensor_command()` (Zeile 104)

---

### 1.4 sensor/{gpio}/response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response`

**QoS:** 1

**Payload:**
```json
{
  "request_id": "req_12345",
  "gpio": 4,
  "command": "measure",
  "success": true,
  "ts": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSensorResponseTopic()` (Zeile 58)
- **Server:** `main.py` Zeile 254 (Handler Registration)

---

## 2. Actuator Topics

### 2.1 actuator/{gpio}/command (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`

**QoS:** 2 (exactly once)

**Payload:**
```json
{
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "timestamp": 1234567890
}
```

**Commands:**

| Command | Beschreibung | value-Bereich |
|---------|--------------|---------------|
| `ON` | Binary Actuator einschalten | - |
| `OFF` | Binary Actuator ausschalten | - |
| `PWM` | PWM-Wert setzen | 0.0 - 1.0 |
| `TOGGLE` | Zustand umschalten | - |

**duration:** Sekunden (0 = unbegrenzt)

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 731 (Subscription via Wildcard)
- **Server:** `publisher.py:publish_actuator_command()` (Zeile 64)

---

### 2.2 actuator/{gpio}/status (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`

**QoS:** 1
**Frequency:** Bei Zustandsänderung

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "subzone_id": "zone_a",
  "gpio": 5,
  "type": "pump",
  "state": true,
  "pwm": 128,
  "runtime_ms": 3600000,
  "emergency": "normal"
}
```

**Required Fields:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `ts` | int | Timestamp (millis) |
| `gpio` | int | GPIO Pin |
| `type` / `actuator_type` | string | pump, pwm, valve, relay |
| `state` | bool/string | true/false oder "on"/"off" |
| `pwm` / `value` | int | PWM-Wert (0-255) |
| `runtime_ms` | int | Akkumulierte Laufzeit in ms |
| `emergency` | string | normal, active, clearing, resuming |

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildActuatorStatusTopic()` (Zeile 72)
- **Server:** `actuator_handler.py:handle_actuator_status()` (Zeile 45)

---

### 2.3 actuator/{gpio}/response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response`

**QoS:** 1
**Frequency:** Nach jedem Command

**Payload (Success):**
```json
{
  "ts": 1735818000,
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "success": true,
  "message": "Command executed"
}
```

**Payload (Failure):**
```json
{
  "ts": 1735818000,
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "duration": 0,
  "success": false,
  "message": "Actuator GPIO 5 is emergency stopped"
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildActuatorResponseTopic()` (Zeile 80)
- **Server:** `main.py` Zeile 239 (Handler Registration)

---

### 2.4 actuator/{gpio}/alert (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "gpio": 5,
  "type": "emergency_stop",
  "message": "Actuator stopped"
}
```

**Alert-Types:**
- `emergency_stop`: Actuator wurde notgestoppt
- `config_invalid`: Ungültige Actuator-Konfiguration
- `runtime_protection`: Runtime-Schutz aktiviert (nur Pump)
- `overrun`: Max-Laufzeit überschritten
- `fault`: Hardware-Fehler
- `verification_failed`: Safety-Verification fehlgeschlagen

**Hinweis:** `gpio: 255` = System-weiter Alert

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildActuatorAlertTopic()` (Zeile 88)
- **Server:** `main.py` Zeile 244 (Handler Registration)

---

### 2.5 actuator/emergency (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency`

**QoS:** 1

**Payload:**
```json
{
  "action": "stop_all",
  "gpio": 5,
  "reason": "User request"
}
```

**Actions:**
- `stop_all`: Alle Aktoren stoppen
- `stop_actuator`: Einzelnen Aktor stoppen (gpio erforderlich)
- `safe_mode`: Safe-Mode aktivieren

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 729 (Subscription: broadcast/emergency)
- **Server:** `topics.py:build_actuator_emergency_topic()` (Zeile 96)

---

## 3. System Topics

### 3.1 system/heartbeat (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`

**QoS:** 0 (Latency-optimiert)
**Frequency:** Alle 60s (forced)

**Payload:**
```json
{
  "esp_id": "ESP_12AB34CD",
  "zone_id": "greenhouse",
  "master_zone_id": "greenhouse-master",
  "zone_assigned": true,
  "ts": 1735818000,
  "uptime": 3600,
  "heap_free": 245760,
  "wifi_rssi": -65,
  "sensor_count": 3,
  "actuator_count": 2,
  "gpio_status": [
    {
      "gpio": 4,
      "owner": "sensor",
      "component": "DS18B20",
      "mode": 1,
      "safe": false
    }
  ],
  "gpio_reserved_count": 4
}
```

**Required Fields:** `ts`, `uptime`, `heap_free` / `free_heap`, `wifi_rssi`

**WICHTIG:** Unbekannte Geräte werden abgelehnt. ESPs müssen via REST-API registriert werden!

**Code-Referenzen:**
- **ESP32:** `mqtt_client.cpp:publishHeartbeat()` (Zeile ~435)
- **Server:** `heartbeat_handler.py:handle_heartbeat()` (Zeile 61)

---

### 3.2 system/heartbeat/ack (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack`

**QoS:** 0 (fire-and-forget)
**Frequency:** Nach jedem empfangenen Heartbeat

**Payload:**
```json
{
  "status": "online",
  "config_available": false,
  "server_time": 1735818000
}
```

**Status-Werte:**
- `pending_approval`: Gerät wartet auf Admin-Genehmigung
- `approved`: Gerät genehmigt, noch nicht online
- `online`: Gerät ist online und aktiv
- `rejected`: Gerät wurde abgelehnt

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemHeartbeatAckTopic()` (Zeile 136)
- **Server:** `heartbeat_handler.py:_send_heartbeat_ack()` (Zeile 912)

---

### 3.3 system/command (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/command`

**QoS:** 2 (exactly once)

**Payload:**
```json
{
  "command": "reboot",
  "params": {
    "delay": 5000
  }
}
```

**Commands:**
| Command | Beschreibung |
|---------|--------------|
| `reboot` | System-Neustart |
| `safe_mode` | Safe-Mode aktivieren |
| `exit_safe_mode` | Safe-Mode verlassen (Flags zurücksetzen) |
| `resume_operation` | Schrittweise Reaktivierung |
| `diagnostics` | Diagnostik-Report senden |
| `reset_config` | Konfiguration zurücksetzen |

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 720 (Subscription)
- **Server:** `publisher.py:publish_system_command()` (Zeile 273)

---

### 3.4 system/response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/response`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "command": "reboot",
  "success": true,
  "message": "Reboot initiated"
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemResponseTopic()` (Zeile 118)
- **Server:** `main.py` Zeile 269 (Handler Registration)

---

### 3.5 system/diagnostics (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics`

**QoS:** 0
**Frequency:** Alle 60s + bei signifikanten Änderungen

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "heap_free": 150000,
  "heap_min_free": 120000,
  "heap_fragmentation": 15,
  "uptime_seconds": 3600,
  "error_count": 3,
  "wifi_connected": true,
  "wifi_rssi": -65,
  "mqtt_connected": true,
  "sensor_count": 4,
  "actuator_count": 2,
  "system_state": "OPERATIONAL"
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemDiagnosticsTopic()` (Zeile 124)
- **Server:** `main.py` Zeile 274 (Handler Registration)

---

### 3.6 system/error (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/error`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "error_code": "GPIO_CONFLICT",
  "severity": "critical",
  "message": "GPIO 5 already in use",
  "module": "GPIOManager",
  "function": "initializeGPIO",
  "stack_trace": "...",
  "context": {
    "gpio": 5,
    "requested_mode": "OUTPUT",
    "current_mode": "INPUT"
  }
}
```

**Severity-Levels:**
- `warning`: Nicht-kritisch, System läuft weiter
- `error`: Fehler, aber System funktional
- `critical`: Kritischer Fehler, Safe-Mode oder Reboot erforderlich

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSystemErrorTopic()` (Zeile 130)
- **Server:** `main.py` Zeile 293 (Handler Registration)

---

### 3.7 status (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/status`

**QoS:** 1
**Frequency:** Bei Zustandsänderung + alle 5min

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "system_state": "OPERATIONAL",
  "webserver_active": false,
  "wifi_connected": true,
  "wifi_ssid": "MyNetwork",
  "mqtt_connected": true,
  "zone_configured": true,
  "zone_id": "greenhouse",
  "master_zone_id": "main_zone",
  "sensors_configured": 3,
  "actuators_configured": 2,
  "heap_free": 245760,
  "uptime": 3600
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildStatusTopic()` (Zeile 142)
- **Server:** `main.py` Zeile 298 (Handler Registration)

---

### 3.8 safe_mode (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/safe_mode`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "safe_mode_active": true,
  "reason": "Emergency stop triggered"
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSafeModeTopic()` (Zeile 148)
- **Server:** `main.py` Zeile 303 (Handler Registration)

---

### 3.9 system/will (LWT)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/will`

**QoS:** 1
**Retain:** true
**Wird vom Broker gesendet bei unerwartetem Disconnect**

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "status": "offline",
  "reason": "unexpected_disconnect"
}
```

**Code-Referenzen:**
- **ESP32:** `mqtt_client.cpp:connect()` - LWT wird bei Verbindungsaufbau gesetzt
- **Server:** `lwt_handler.py:handle_lwt()` (Zeile 35)

---

## 4. Config Topics

### 4.1 config (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

**QoS:** 2

**Payload:**
```json
{
  "config_id": "cfg_12345",
  "wifi": {
    "ssid": "NewNetwork",
    "password": "NewPassword"
  },
  "server": {
    "address": "192.168.0.100",
    "mqtt_port": 1883,
    "http_port": 80
  },
  "device": {
    "name": "ESP_12AB34CD",
    "friendly_name": "Greenhouse Sensor",
    "zone": "greenhouse"
  },
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
      "aux_gpio": 255,
      "type": "pump",
      "name": "Pumpe 1",
      "subzone_id": "zone_a",
      "active": true,
      "critical": false,
      "inverted": false,
      "default_state": false,
      "default_pwm": 0
    }
  ]
}
```

**Operating Modes (Phase 2C):**
- `continuous`: Regelmäßige Messungen (Standard)
- `on_demand`: Nur auf Anfrage
- `paused`: Pausiert
- `scheduled`: Nach Zeitplan

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 723 (Subscription)
- **Server:** `publisher.py:publish_config()` (Zeile 211)

---

### 4.2 config_response (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

**QoS:** 2

**Payload (Success):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "config_id": "cfg_12345",
  "config_applied": true,
  "applied_sections": ["wifi", "sensors", "actuators"],
  "skipped_sections": [],
  "restart_required": false,
  "restart_scheduled": false,
  "restart_delay": 0
}
```

**Payload (Failure):**
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
    "reason": "GPIO already in use by actuator"
  },
  "applied_sections": []
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildConfigResponseTopic()` (Zeile 102)
- **Server:** `main.py` Zeile 260 (Handler Registration)

---

## 5. Zone Topics

### 5.1 zone/assign (Server→ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`

**QoS:** 1

**Payload:**
```json
{
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus",
  "master_zone_id": "main_zone"
}
```

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 726 (Subscription)
- **Server:** `topics.py:build_zone_assign_topic()` (Zeile 142)

---

### 5.2 zone/ack (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack`

**QoS:** 1

**Payload:**
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

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildZoneAckTopic()` (Zeile 170)
- **Server:** `main.py` Zeile 275 (Handler Registration)

---

### 5.3 subzone/assign (Server→ESP) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign`

**QoS:** 1

**Payload:**
```json
{
  "subzone_id": "zone_a",
  "subzone_name": "Bewässerung Sektor A",
  "gpio_pins": [4, 5, 15],
  "timestamp": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 734 (Subscription)
- **Server:** `topics.py:build_subzone_assign_topic()` (Zeile 178)

---

### 5.4 subzone/remove (Server→ESP) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove`

**QoS:** 1

**Payload:**
```json
{
  "subzone_id": "zone_a",
  "reason": "reconfiguration",
  "timestamp": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `main.cpp` Zeile 736 (Subscription)
- **Server:** `topics.py:build_subzone_remove_topic()` (Zeile 185)

---

### 5.5 subzone/ack (ESP→Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "subzone_id": "zone_a",
  "action": "assigned",
  "success": true,
  "message": "Subzone assigned successfully"
}
```

**action-Werte:** `assigned`, `removed`

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSubzoneAckTopic()` (Zeile 186)
- **Server:** `main.py` Zeile 280 (Handler Registration)

---

### 5.6 subzone/status (ESP→Server) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/status`

**QoS:** 1

**Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "subzone_id": "zone_a",
  "active": true,
  "sensors_active": 2,
  "actuators_active": 1,
  "safe_mode": false
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSubzoneStatusTopic()` (Zeile 193)
- **Server:** Noch nicht implementiert (Phase 9)

---

### 5.7 subzone/safe (Server→ESP) - Phase 9

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe`

**QoS:** 1

**Payload:**
```json
{
  "subzone_id": "zone_a",
  "safe_mode": true,
  "reason": "Sensor anomaly detected",
  "affected_gpios": [4, 5],
  "timestamp": 1735818000
}
```

**Code-Referenzen:**
- **ESP32:** `topic_builder.cpp:buildSubzoneSafeTopic()` (Zeile 200)
- **Server:** `topics.py:build_subzone_safe_topic()` (Zeile 192)

---

## 6. Broadcast Topics

### 6.1 broadcast/emergency (Server→ALL)

**Topic:** `kaiser/broadcast/emergency`

**QoS:** 2

**Payload:**
```json
{
  "action": "stop_all",
  "reason": "Global emergency triggered"
}
```

---

### 6.2 broadcast/system_update (Server→ALL)

**Topic:** `kaiser/broadcast/system_update`

**QoS:** 1

**Payload:**
```json
{
  "update_type": "config_change",
  "message": "Configuration updated"
}
```

---

## 7. Server Topic Subscriptions

Der Server subscribed zu folgenden Topic-Patterns:

| Pattern | Handler | Datei:Zeile |
|---------|---------|-------------|
| `kaiser/god/esp/+/sensor/+/data` | `handle_sensor_data` | `sensor_handler.py:77` |
| `kaiser/god/esp/+/sensor/batch` | `handle_sensor_batch` | `sensor_handler.py:285` |
| `kaiser/god/esp/+/actuator/+/status` | `handle_actuator_status` | `actuator_handler.py:45` |
| `kaiser/god/esp/+/actuator/+/response` | `handle_actuator_response` | `main.py:239` |
| `kaiser/god/esp/+/actuator/+/alert` | `handle_actuator_alert` | `main.py:244` |
| `kaiser/god/esp/+/system/heartbeat` | `handle_heartbeat` | `heartbeat_handler.py:61` |
| `kaiser/god/esp/+/config_response` | `handle_config_response` | `config_handler.py:52` |
| `kaiser/god/esp/+/zone/ack` | `handle_zone_ack` | `main.py:275` |
| `kaiser/god/esp/+/subzone/ack` | `handle_subzone_ack` | `main.py:280` |
| `kaiser/god/esp/+/system/will` | `handle_lwt` | `lwt_handler.py:35` |
| `kaiser/god/esp/+/system/error` | `handle_system_error` | `main.py:293` |
| `kaiser/god/esp/+/status` | `handle_status` | `main.py:298` |
| `kaiser/god/esp/+/safe_mode` | `handle_safe_mode` | `main.py:303` |

**Handler-Registrierung:** `main.py:201-307`

---

## 7.1 Wildcard-Pattern Referenz

MQTT Wildcards für Topic-Subscriptions:

| Wildcard | Bedeutung | Beispiel |
|----------|-----------|----------|
| `+` | Single-Level (ein Segment) | `esp/+/sensor` matcht `esp/ABC/sensor` |
| `#` | Multi-Level (alle folgenden) | `esp/#` matcht `esp/ABC/sensor/data` |

**ESP32 Wildcard-Subscriptions:**

```cpp
// main.cpp Zeile 731
topic_builder.buildActuatorCommandWildcard(topic, sizeof(topic));
// → kaiser/god/esp/{esp_id}/actuator/+/command

// main.cpp Zeile 740
topic_builder.buildSensorCommandWildcard(topic, sizeof(topic));
// → kaiser/god/esp/{esp_id}/sensor/+/command
```

**Server Subscription-Pattern:**
```python
# subscriber.py:subscribe_all()
# QoS wird automatisch bestimmt:
# - heartbeat → QoS 0
# - config_response/config/ack → QoS 2
# - alle anderen → QoS 1
```

---

## 8. QoS-Übersicht

| QoS | Verwendung | Garantie |
|-----|------------|----------|
| **0** | Heartbeat, Diagnostics | At most once (best effort) |
| **1** | Sensor-Daten, Alerts, Status | At least once |
| **2** | Commands, Config | Exactly once |

---

## 9. Vollständige Dokumentation

Für detaillierte Informationen zu jedem Topic:
- **MQTT-Protokoll-Spezifikation:** `El Trabajante/docs/Mqtt_Protocoll.md` (~3.600 Zeilen)
- **Server MQTT-Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/`
- **Topic-Builder:** `El Trabajante/src/utils/topic_builder.cpp`
