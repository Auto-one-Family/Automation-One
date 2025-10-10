# MQTT Protocol Specification - ESP32 Sensor Network System

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                   God-Kaiser (Raspberry Pi 5)               │
│                   MQTT Broker: Mosquitto                    │
│                   Topics: kaiser/god/*                      │
└─────────────────────────────────────────────────────────────┘
                            ↕
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
┌──────────────────┐                  ┌──────────────────┐
│ ESP32 Agent 1    │                  │ ESP32 Agent N    │
│ ID: ESP_XXXXXXXX │                  │ ID: ESP_YYYYYYYY │
└──────────────────┘                  └──────────────────┘
```

**Kommunikations-Prinzipien:**
1. **Alle ESP32-Agenten kommunizieren NUR mit God-Kaiser**
2. **God-Kaiser Topic-Prefix:** `kaiser/god/...`
3. **Broadcast-Topics:** `kaiser/broadcast/...` (alle ESPs empfangen)
4. **ESP32-spezifische Topics:** `kaiser/god/esp/{esp_id}/...`
5. **Zone-Master-Topics (optional):** `kaiser/god/zone/{master_zone_id}/...`

---

## Topic-Hierarchie

### Struktur-Pattern

```
kaiser/
├── god/                           # God-Kaiser (zentrale Instanz)
│   ├── esp/
│   │   └── {esp_id}/             # Spezifischer ESP32
│   │       ├── sensor/
│   │       │   ├── {gpio}/
│   │       │   │   └── data       # Sensor-Daten (einzeln)
│   │       │   └── batch          # Sensor-Daten (batch)
│   │       ├── actuator/
│   │       │   ├── {gpio}/
│   │       │   │   ├── command    # Aktor-Befehle (subscribe)
│   │       │   │   ├── status     # Aktor-Status (publish)
│   │       │   │   ├── response   # Command-Response (publish)
│   │       │   │   └── alert      # Aktor-Alerts (publish)
│   │       │   └── emergency      # Emergency-Stop (subscribe)
│   │       ├── system/
│   │       │   ├── command        # System-Befehle (subscribe)
│   │       │   ├── response       # System-Response (publish)
│   │       │   ├── heartbeat      # Health-Heartbeat (publish)
│   │       │   └── diagnostics    # Diagnostik (publish)
│   │       ├── library/
│   │       │   ├── ready          # Download-Ready (publish)
│   │       │   ├── request        # Library-Request (publish)
│   │       │   ├── installed      # Installation-OK (publish)
│   │       │   └── error          # Library-Error (publish)
│   │       ├── config             # Konfiguration (bidirektional)
│   │       ├── status             # System-Status (publish)
│   │       └── safe_mode          # Safe-Mode-Status (publish)
│   └── zone/                      # Zone-Master (optional)
│       └── {master_zone_id}/
│           └── esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data
└── broadcast/                     # Broadcast an alle ESPs
    ├── emergency                  # Globaler Emergency-Stop
    └── system_update              # System-Updates
```

---

## PUBLISH Topics (ESP32 → God-Kaiser)

### 1. Sensor-Daten (Einzeln)

**Topic:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`

**QoS:** 1 (at least once)  
**Retain:** false  
**Frequency:** Alle 30s (konfigurierbar: 2s - 5min)  
**Module:** `services/sensor/sensor_manager.cpp` → `services/communication/mqtt_client.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,                    // Unix timestamp (seconds) - REQUIRED
  "esp_id": "ESP_12AB34CD",            // ESP32 ID - REQUIRED
  "gpio": 4,                           // GPIO Pin - REQUIRED
  "sensor_type": "DS18B20",            // Sensor-Typ - REQUIRED
  "raw": 2150,                         // Raw ADC/Sensor-Wert - REQUIRED
  "value": 21.5,                       // Processed Value - REQUIRED
  "unit": "°C",                        // Einheit - REQUIRED
  "quality": "good",                   // "excellent", "good", "fair", "poor", "bad", "stale" - REQUIRED
  "subzone_id": "zone_a",              // Subzone-Zuordnung - OPTIONAL
  "sensor_name": "Boden Temp",         // Display-Name - REQUIRED
  "library_name": "dallas_temp",       // Library-Name - OPTIONAL
  "library_version": "1.0.0",          // Library-Version - OPTIONAL
  "raw_mode": false,                   // Nur Rohdaten senden - REQUIRED
  "meta": {                            // Metadaten - OPTIONAL
    "vref": 3300,                      // ADC Reference (mV)
    "samples": 10,                     // Anzahl Samples
    "calibration": {                   // Kalibrierungsdaten
      "offset": 0.5,
      "multiplier": 1.0
    }
  }
}
```

**Payload-Beispiel:**
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
  "raw_mode": false
}
```

**Quality-Levels:**
- `excellent`: Wert perfekt, keine Abweichungen
- `good`: Wert gut, minimale Abweichungen
- `fair`: Wert akzeptabel, moderate Abweichungen
- `poor`: Wert grenzwertig, hohe Abweichungen
- `bad`: Wert außerhalb gültiger Range
- `stale`: Wert zu alt (Sensor antwortet nicht)

---

### 2. Sensor-Batch (Mehrere Sensoren)

**Topic:** `kaiser/god/esp/{esp_id}/sensor_batch`

**QoS:** 1  
**Retain:** false  
**Frequency:** Alle 60s (optional)  
**Module:** `services/sensor/sensor_manager.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "sensors": [                         // Array von Sensor-Readings
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

---

### 3. Heartbeat (System-Health)

**Topic:** `kaiser/god/esp/{esp_id}/system/heartbeat`

**QoS:** 0 (at most once, Latency-optimiert)  
**Retain:** false  
**Frequency:** Alle 60s + bei Zustandsänderung  
**Module:** `core/main_loop.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "uptime": 3600,                      // Sekunden seit Boot - REQUIRED
  "state": "OPERATIONAL",              // SystemState - REQUIRED
  "heap": 245760,                      // Freier Heap (Bytes) - REQUIRED
  "wifi_rssi": -65,                    // WiFi Signal (dBm) - REQUIRED
  "mqtt_connected": true,              // MQTT-Status - REQUIRED
  "safe_mode": false,                  // Safe-Mode aktiv - REQUIRED
  "zone_id": "greenhouse",             // Zone-Zuordnung - OPTIONAL
  "sensors_active": 3,                 // Anzahl aktive Sensoren - REQUIRED
  "actuators_active": 2                // Anzahl aktive Aktoren - REQUIRED
}
```

**State-Values:**
- `BOOT`: System startet
- `WIFI_SETUP`: Captive Portal aktiv
- `WIFI_CONNECTED`: WiFi verbunden
- `MQTT_CONNECTING`: MQTT-Verbindung läuft
- `MQTT_CONNECTED`: MQTT verbunden
- `AWAITING_USER_CONFIG`: Wartet auf Konfiguration
- `ZONE_CONFIGURED`: Zone konfiguriert
- `SENSORS_CONFIGURED`: Sensoren konfiguriert
- `OPERATIONAL`: Normal-Betrieb
- `LIBRARY_DOWNLOADING`: Library-Download läuft
- `SAFE_MODE`: Safe-Mode aktiv
- `ERROR`: Fehler-Zustand

---

### 4. System-Status (Detailliert)

**Topic:** `kaiser/god/esp/{esp_id}/status`

**QoS:** 1  
**Retain:** false  
**Frequency:** Bei Zustandsänderung + alle 5min  
**Module:** `core/system_controller.cpp`

**Payload-Schema:**
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

---

### 5. Actuator-Status

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/status`

**QoS:** 1  
**Retain:** false  
**Frequency:** Bei Zustandsänderung  
**Module:** `services/actuator/actuator_manager.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 5,
  "actuator_type": "RELAY",           // "RELAY", "PWM", "VALVE", etc.
  "state": "ON",                       // "ON", "OFF", "PWM"
  "value": 1.0,                        // 0.0-1.0 (1.0 = 100%)
  "last_command": 1735817950           // Unix timestamp
}
```

---

### 6. Actuator-Command-Response

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/response`

**QoS:** 1  
**Retain:** false  
**Frequency:** Nach jedem Command  
**Module:** `services/actuator/actuator_manager.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 5,
  "command": "ON",                     // Original Command
  "value": 1.0,                        // Angeforderter Wert
  "success": true,                     // Command erfolgreich
  "message": "Actuator activated"      // Optional: Fehlermeldung
}
```

---

### 7. Actuator-Alert

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert`

**QoS:** 1  
**Retain:** false  
**Frequency:** Bei Alert-Ereignis  
**Module:** `services/actuator/actuator_manager.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 5,
  "alert_type": "overrun",             // "overrun", "fault", "emergency"
  "severity": "critical",              // "warning", "critical"
  "message": "Max runtime exceeded"
}
```

---

### 8. System-Diagnostics

**Topic:** `kaiser/god/esp/{esp_id}/system/diagnostics`

**QoS:** 1  
**Retain:** false  
**Frequency:** Auf Anfrage oder alle 10min  
**Module:** `error_handling/health_monitor.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "heap_free": 245760,
  "heap_min": 200000,                  // Minimum Heap seit Boot
  "uptime": 3600,
  "wifi_rssi": -65,
  "mqtt_reconnects": 2,                // Anzahl Reconnects
  "error_count": 0                     // Fehler seit Boot
}
```

---

### 9. System-Command-Response

**Topic:** `kaiser/god/esp/{esp_id}/system/response`

**QoS:** 1  
**Retain:** false  
**Frequency:** Nach jedem System-Command  
**Module:** `core/system_controller.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "command": "reboot",                 // Original Command
  "success": true,
  "message": "Reboot initiated"
}
```

---

### 10. Safe-Mode-Status

**Topic:** `kaiser/god/esp/{esp_id}/safe_mode`

**QoS:** 1  
**Retain:** false  
**Frequency:** Bei Safe-Mode-Änderung  
**Module:** `core/system_controller.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "safe_mode_active": true,
  "reason": "Emergency stop triggered"
}
```

---

### 11. Library-Ready

**Topic:** `kaiser/god/esp/{esp_id}/library/ready`

**QoS:** 1  
**Retain:** false  
**Frequency:** Nach erfolgreicher Library-Installation  
**Module:** `services/sensor/sensor_manager.cpp` (optional)

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "ready": true,
  "message": "Library installation successful"
}
```

---

### 12. Library-Request

**Topic:** `kaiser/god/esp/{esp_id}/library/request`

**QoS:** 1  
**Retain:** false  
**Frequency:** Bei Library-Bedarf  
**Module:** `services/sensor/sensor_manager.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "library_name": "ph_dfrobot",
  "request_id": "req_12345"
}
```

---

### 13. Library-Installed

**Topic:** `kaiser/god/esp/{esp_id}/library/installed`

**QoS:** 1  
**Retain:** false  
**Frequency:** Nach Library-Installation  
**Module:** `services/sensor/sensor_manager.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "library_name": "ph_dfrobot",
  "version": "1.0.0",
  "success": true
}
```

---

### 14. Library-Error

**Topic:** `kaiser/god/esp/{esp_id}/library/error`

**QoS:** 1  
**Retain:** false  
**Frequency:** Bei Library-Fehler  
**Module:** `services/sensor/sensor_manager.cpp`

**Payload-Schema:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "error_type": "download_failed",
  "error_message": "Connection timeout"
}
```

---

## SUBSCRIBE Topics (ESP32 ← God-Kaiser)

### 1. System-Commands

**Topic:** `kaiser/god/esp/{esp_id}/system/command`

**QoS:** 1  
**Handler:** `core/system_controller.cpp::handleSystemCommand()`

**Payload-Schema:**
```json
{
  "command": "reboot",                 // "reboot", "safe_mode", "diagnostics", "reset_config", "exit_safe_mode", "resume_operation"
  "params": {                          // Optional
    "delay": 5000                      // Millisekunden
  }
}
```

**Unterstützte Commands:**
- `reboot`: System-Neustart
- `safe_mode`: Safe-Mode aktivieren
- `exit_safe_mode`: Safe-Mode verlassen (Flags zurücksetzen, Aktoren bleiben AUS)
- `resume_operation`: Schrittweise Reaktivierung (nach `exit_safe_mode`)
- `diagnostics`: Diagnostik-Report senden
- `reset_config`: Konfiguration zurücksetzen

**Response:** → `kaiser/god/esp/{esp_id}/system/response`

---

### 2. Actuator-Commands

**Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/command`

**QoS:** 1  
**Handler:** `services/actuator/actuator_manager.cpp::handleActuatorCommand()`

**Payload-Schema:**
```json
{
  "command": "ON",                     // "ON", "OFF", "PWM", "TOGGLE"
  "value": 1.0,                        // 0.0-1.0 (nur bei PWM)
  "duration": 0                        // Sekunden (0 = unbegrenzt)
}
```

**Unterstützte Commands:**
- `ON`: Aktor einschalten (Binary)
- `OFF`: Aktor ausschalten (Binary)
- `PWM`: PWM-Wert setzen (value: 0.0-1.0)
- `TOGGLE`: Zustand umschalten

**Response:** → `kaiser/god/esp/{esp_id}/actuator/{gpio}/response`

---

### 3. Emergency-Stop (spezifisch)

**Topic:** `kaiser/god/esp/{esp_id}/actuator/emergency`

**QoS:** 1  
**Handler:** `services/actuator/actuator_manager.cpp::handleEmergency()`

**Payload-Schema:**
```json
{
  "action": "stop_all",                // "stop_all", "stop_actuator", "safe_mode"
  "gpio": 5,                           // Nur bei "stop_actuator"
  "reason": "User request"
}
```

**Unterstützte Actions:**
- `stop_all`: Alle Aktoren stoppen
- `stop_actuator`: Einzelnen Aktor stoppen
- `safe_mode`: Safe-Mode aktivieren

**Response:** → `kaiser/god/esp/{esp_id}/safe_mode`

---

### 4. Emergency-Stop (Broadcast)

**Topic:** `kaiser/broadcast/emergency`

**QoS:** 1  
**Handler:** `services/actuator/actuator_manager.cpp::handleBroadcastEmergency()`

**Payload-Schema:**
```json
{
  "action": "stop_all",
  "reason": "Global emergency triggered"
}
```

**Verhalten:** Alle ESPs führen Emergency-Stop aus

---

### 5. System-Update (Broadcast)

**Topic:** `kaiser/broadcast/system_update`

**QoS:** 1  
**Handler:** `core/system_controller.cpp::handleSystemUpdate()`

**Payload-Schema:**
```json
{
  "update_type": "config_change",      // "config_change", "maintenance", "firmware_update"
  "message": "Configuration updated"
}
```

---

### 6. Config-Update

**Topic:** `kaiser/god/esp/{esp_id}/config`

**QoS:** 1  
**Handler:** `services/config/config_manager.cpp::handleConfigUpdate()`

**Payload-Schema:**
```json
{
  "wifi": {                            // Optional
    "ssid": "NewNetwork",
    "password": "NewPassword"
  },
  "server": {                          // Optional
    "address": "192.168.0.100",
    "mqtt_port": 1883,
    "http_port": 80
  },
  "device": {                          // Optional
    "name": "ESP_12AB34CD",
    "friendly_name": "Greenhouse Sensor",
    "zone": "greenhouse"
  },
  "sensors": [                         // Optional
    {
      "gpio": 4,
      "type": "DS18B20",
      "name": "Boden Temp",
      "subzone_id": "zone_a",
      "active": true,
      "raw_mode": false
    }
  ],
  "actuators": [                       // Optional
    {
      "gpio": 5,
      "type": "RELAY",
      "name": "Pumpe 1",
      "subzone_id": "zone_a",
      "active": true
    }
  ]
}
```

**Response:** → `kaiser/god/esp/{esp_id}/config` (Echo mit applied status)

---

## Hierarchische Topics (Optional, Zone-Master)

### Sensor-Daten (Hierarchisch)

**Topic:** `kaiser/god/zone/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data`

**QoS:** 1  
**Retain:** false  
**Frequency:** Alle 30s  
**Module:** `services/sensor/sensor_manager.cpp`

**Verwendung:** Nur wenn ESP32 als Zone-Master konfiguriert ist

**Payload-Schema:** Identisch zu Standard-Sensor-Data

---

## Topic-Zuordnung zu Modulen

| Modul | Publish Topics | Subscribe Topics | Priorität |
|-------|----------------|------------------|-----------|
| `core/main_loop.cpp` | `heartbeat` | - | 🔴 KRITISCH |
| `core/system_controller.cpp` | `status`, `safe_mode`, `system/response` | `system/command`, `config`, `broadcast/system_update` | 🔴 KRITISCH |
| `services/communication/mqtt_client.cpp` | (alle) | (alle) | 🔴 KRITISCH |
| `services/sensor/sensor_manager.cpp` | `sensor/data`, `sensor_batch`, `library/*` | - | 🔴 KRITISCH |
| `services/actuator/actuator_manager.cpp` | `actuator/status`, `actuator/response`, `actuator/alert` | `actuator/command`, `actuator/emergency`, `broadcast/emergency` | 🔴 KRITISCH |
| `error_handling/health_monitor.cpp` | `system/diagnostics` | - | 🟡 HOCH |

---

## QoS-Strategie

| QoS-Level | Verwendung | Topics |
|-----------|------------|--------|
| **0** (at most once) | Heartbeat, nicht-kritische Daten | `heartbeat` |
| **1** (at least once) | Standard für alle Sensor/Actuator-Daten | Alle anderen Topics |
| **2** (exactly once) | Aktuell nicht verwendet | - |

**Begründung:**
- QoS 0 für Heartbeat: Latency-Optimierung, nächster Heartbeat kommt in 60s
- QoS 1 für Sensor/Actuator: Balance zwischen Zuverlässigkeit und Performance
- QoS 2 vermieden: Zu hoher Overhead für ESP32

---

## Timing & Frequency

| Topic | Frequency | Trigger | Adjustable |
|-------|-----------|---------|------------|
| `sensor/data` | 30s | Timer | ✅ (2s - 5min) |
| `sensor_batch` | 60s | Timer | ✅ |
| `heartbeat` | 60s | Timer + Change | ❌ |
| `status` | 5min | Timer + Change | ❌ |
| `actuator/status` | - | On Change | ❌ |
| `actuator/response` | - | After Command | ❌ |
| `system/diagnostics` | 10min | Timer + Request | ✅ |

**Adaptive Timing (Sensoren):**
- Base Interval: 30s
- Min Interval: 2s (High-Frequency-Mode)
- Max Interval: 5min (Low-Priority-Mode)
- Adaptive Factor: Load-basiert (CPU, Heap, MQTT-Queue)

---

## Error-Handling

### Connection Loss

**Scenario:** MQTT-Verbindung verloren

**ESP32-Verhalten:**
1. Lokaler Offline-Buffer (max 100 Messages)
2. Exponential-Backoff-Reconnect (1s → 2s → 4s → ... → max 60s)
3. Weiterhin Sensor-Readings (im Buffer)
4. Heartbeat-Status → `mqtt_connected: false`

**Recovery:**
1. Reconnect erfolgreich
2. Buffered Messages senden (FIFO)
3. Heartbeat-Status → `mqtt_connected: true`
4. Normal-Operation

---

### Topic-Subscription-Fehler

**Scenario:** Subscription fehlgeschlagen

**ESP32-Verhalten:**
1. Log Error: `LOG_ERROR("Failed to subscribe to topic: ...")`
2. Retry Subscription (max 3x)
3. Falls weiterhin Fehler: Safe-Mode

---

### Invalid-Payload

**Scenario:** Ungültiges JSON empfangen

**ESP32-Verhalten:**
1. Parse-Error loggen
2. Payload ignorieren
3. NICHT in Safe-Mode wechseln
4. Continue Normal-Operation

---

## Message-Flow-Diagramme

### Flow 1: Sensor-Reading → Server

```
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: Sensor-Manager                                           │
│ └─> Timer-Trigger (30s)                                         │
│     └─> performAllMeasurements()                                │
│         └─> ISensorDriver::read()                               │
│             └─> Sensor-Hardware (I2C/OneWire/ADC)               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: MQTT-Client                                              │
│ └─> publish()                                                   │
│     └─> Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data      │
│     └─> Payload: {ts, gpio, value, quality, ...}               │
│     └─> QoS: 1                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ MQTT Broker (Mosquitto)                                         │
│ └─> Route to Subscribers                                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ God-Kaiser Server: MQTT-Subscriber                              │
│ └─> mqtt/subscriber.py                                          │
│     └─> mqtt/handlers/sensor_handler.py                         │
│         └─> services/sensor_service.py (Processing)             │
│             └─> db/repositories/sensor_repo.py (Save)           │
└─────────────────────────────────────────────────────────────────┘
```

---

### Flow 2: Server-Command → Actuator

```
┌─────────────────────────────────────────────────────────────────┐
│ God-Kaiser Server: MQTT-Publisher                               │
│ └─> mqtt/publisher.py                                           │
│     └─> publish()                                               │
│         └─> Topic: kaiser/god/esp/{esp_id}/actuator/{gpio}/cmd  │
│         └─> Payload: {command: "ON", value: 1.0}               │
│         └─> QoS: 1                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ MQTT Broker (Mosquitto)                                         │
│ └─> Route to ESP32                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: MQTT-Client                                              │
│ └─> onMessage()                                                 │
│     └─> handleMqttMessage()                                     │
│         └─> ActuatorManager::handleActuatorCommand()            │
│             └─> Validate Command (GPIO, Value, Safety)          │
│                 └─> IActuatorDriver::setValue()                 │
│                     └─> Hardware (GPIO/PWM)                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: MQTT-Client                                              │
│ └─> publish()                                                   │
│     └─> Topic: kaiser/god/esp/{esp_id}/actuator/{gpio}/response│
│     └─> Payload: {success: true, message: "Actuator ON"}       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Flow 3: Emergency-Stop → Recovery

```
┌─────────────────────────────────────────────────────────────────┐
│ God-Kaiser Server: Emergency-Trigger                            │
│ └─> mqtt/publisher.py                                           │
│     └─> Topic: kaiser/god/esp/{esp_id}/actuator/emergency      │
│     └─> Payload: {action: "stop_all", reason: "user_request"}  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: Actuator-Manager                                         │
│ └─> emergencyStopAll()                                          │
│     ├─> Alle Aktoren → LOW (GPIO)                               │
│     ├─> Alle PWM → 0                                            │
│     ├─> Emergency-Flags setzen                                  │
│     └─> SystemController::enterSafeMode()                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: MQTT-Client                                              │
│ └─> publish()                                                   │
│     └─> Topic: kaiser/god/esp/{esp_id}/safe_mode               │
│     └─> Payload: {safe_mode_active: true, reason: "..."}       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
[User/Server sendet: exit_safe_mode]
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: Actuator-Manager                                         │
│ └─> clearEmergencyStop()                                        │
│     ├─> Emergency-Flags zurücksetzen                            │
│     ├─> ABER: Aktoren bleiben AUS!                              │
│     └─> SystemState → OPERATIONAL                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
[User/Server sendet: resume_operation]
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ESP32: Actuator-Manager                                         │
│ └─> resumeOperation()                                           │
│     ├─> Schrittweise Reaktivierung (2s Delays)                  │
│     ├─> Safety-Checks pro Aktor                                 │
│     └─> Status-Updates nach jedem Aktor                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementierungs-Checkliste

### MQTT-Client-Module

**services/communication/mqtt_client.cpp:**

- [ ] `connect(const MQTTConfig& config)` → TLS-Support optional
- [ ] `disconnect()` → Graceful shutdown
- [ ] `isConnected()` → Status-Check
- [ ] `publish(topic, payload, qos)` → Standard-Publish
- [ ] `safePublish(topic, payload, qos, retries)` → Mit Retry-Logic
- [ ] `subscribe(topic)` → Wildcard-Support (+, #)
- [ ] `setCallback(MQTT_CALLBACK_SIGNATURE)` → Message-Handler
- [ ] `transitionToAuthenticated(username, password)` → Anonymous → Auth
- [ ] Offline-Buffer implementieren (100 Messages)
- [ ] Exponential-Backoff-Reconnect
- [ ] QoS-Handling (0, 1, 2)

---

### Topic-Builder-Module

**utils/topic_builder.cpp:**

- [ ] `buildSensorDataTopic(esp_id, gpio)` → Standard-Sensor-Topic
- [ ] `buildActuatorCommandTopic(esp_id, gpio)` → Aktor-Command-Topic
- [ ] `buildActuatorStatusTopic(esp_id, gpio)` → Aktor-Status-Topic
- [ ] `buildHeartbeatTopic(esp_id)` → Heartbeat-Topic
- [ ] `buildConfigTopic(esp_id)` → Config-Topic
- [ ] `buildSystemCommandTopic(esp_id)` → System-Command-Topic
- [ ] `buildEmergencyTopic(esp_id)` → Emergency-Topic
- [ ] `buildHierarchicalSensorTopic(esp_id, master_zone_id, subzone_id, gpio)` → Zone-Master-Topic
- [ ] `buildBroadcastEmergency()` → Broadcast-Emergency-Topic
- [ ] Topic-Validation (Länge, Zeichen, Struktur)

---

### Message-Handler

**core/system_controller.cpp:**

- [ ] `handleSystemCommand(payload)` → Dispatcher für System-Commands
- [ ] `handleConfigUpdate(payload)` → Config-Update
- [ ] `handleSystemUpdate(payload)` → Broadcast-Update

**services/actuator/actuator_manager.cpp:**

- [ ] `handleActuatorCommand(gpio, payload)` → Aktor-Command
- [ ] `handleEmergency(payload)` → Emergency-Stop
- [ ] `handleBroadcastEmergency(payload)` → Broadcast-Emergency

---

## Testing

### Unit-Tests

**Test-Case 1: MQTT-Client-Connect**
```cpp
TEST(MQTTClient, ConnectSuccess) {
    MQTTConfig config;
    config.server = "localhost";
    config.port = 1883;
    
    MQTTClient client;
    EXPECT_TRUE(client.connect(config));
    EXPECT_TRUE(client.isConnected());
}
```

**Test-Case 2: Topic-Builder**
```cpp
TEST(TopicBuilder, BuildSensorDataTopic) {
    String topic = TopicBuilder::buildSensorDataTopic("ESP_12AB34CD", 4);
    EXPECT_EQ(topic, "kaiser/god/esp/ESP_12AB34CD/sensor/4/data");
}
```

**Test-Case 3: Payload-Parsing**
```cpp
TEST(MessageHandler, ParseActuatorCommand) {
    String payload = "{\"command\":\"ON\",\"value\":1.0}";
    ActuatorCommand cmd = parseActuatorCommand(payload);
    EXPECT_EQ(cmd.command, "ON");
    EXPECT_EQ(cmd.value, 1.0);
}
```

---

### Integration-Tests

**Test 1: Sensor-Reading-Flow**
```
Setup:
- Mock MQTT-Broker (Mosquitto Test-Instance)
- ESP32 mit DS18B20 auf GPIO 4

Test:
1. ESP32 startet
2. Sensor-Manager liest DS18B20
3. MQTT-Client published Sensor-Data
4. Server empfängt Message

Expected:
- Topic: kaiser/god/esp/{esp_id}/sensor/4/data
- Payload enthält: ts, gpio=4, sensor_type="DS18B20", value, quality
```

---

**Test 2: Actuator-Command-Flow**
```
Setup:
- Mock MQTT-Broker
- ESP32 mit Relay auf GPIO 5

Test:
1. Server sendet Command: {"command":"ON","value":1.0}
2. ESP32 empfängt Message
3. Actuator-Manager aktiviert Relay
4. ESP32 sendet Response

Expected:
- Relay aktiviert (GPIO HIGH)
- Response-Topic: kaiser/god/esp/{esp_id}/actuator/5/response
- Payload: {success: true}
```

---

**Test 3: Emergency-Stop-Flow**
```
Setup:
- ESP32 mit 2 aktiven Aktoren (GPIO 5, 6)

Test:
1. Server sendet Emergency: {action: "stop_all"}
2. ESP32 stoppt alle Aktoren
3. ESP32 wechselt zu Safe-Mode
4. ESP32 sendet Safe-Mode-Status

Expected:
- Alle Aktoren AUS (GPIO LOW)
- SystemState = SAFE_MODE
- Safe-Mode-Topic published
```

---

## Referenzen

- **Migration-Map:** `docs/migration_map.md`
- **System-Architektur:** `docs/systemarchitektur.md`
- **God-Kaiser Server:** `docs/server_struktur.md`
- **MQTT Broker Config:** `config/mosquitto.conf`

---

**Status:** ✅ Spezifikation vollständig  
**Version:** 1.0  
**Last Updated:** 2025-01-02  
**Author:** System-Architektur-Team