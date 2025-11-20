# MQTT Client API Specification
## services/communication/mqtt_client.h/cpp

**Version:** 2.0 (Updated for Phase 2 Implementation)  
**Zweck:** MQTT-Client-Wrapper für ESP32 mit Auto-Reconnect, Offline-Buffering und Heartbeat-System  
**Status:** ✅ IMPLEMENTED (Phase 2)

---

## Abhängigkeiten

```cpp
#include <PubSubClient.h>           // Arduino MQTT Library
#include <WiFiClient.h>             // ESP32 WiFi Client
#include <Arduino.h>
#include <functional>               // std::function for callbacks
#include "utils/logger.h"           // Logging (Phase 1)
#include "utils/topic_builder.h"   // Topic Generation (Phase 1)
#include "error_handling/error_tracker.h"  // Error Tracking (Phase 1)
#include "models/system_types.h"    // WiFiConfig (Phase 1)
```

---

## Datenstrukturen

### MQTTConfig
```cpp
struct MQTTConfig {
    String server;              // Broker IP/Hostname (REQUIRED)
    uint16_t port;             // Broker Port (default: 1883/8883)
    String client_id;           // ESP32 Client ID (REQUIRED)
    String username;            // Optional: MQTT Username (empty = Anonymous Mode)
    String password;            // Optional: MQTT Password (empty = Anonymous Mode)
    int keepalive;              // Keepalive Interval (default: 60s)
    int timeout;                // Connection Timeout (default: 10s)
};
```

**Hinweise:**
- `username` und `password` können leer sein → Anonymous Mode
- Transition von Anonymous → Authenticated via `transitionToAuthenticated()`

### MQTTMessage (Offline Buffer)
```cpp
struct MQTTMessage {
    String topic;               // MQTT Topic
    String payload;             // Message Payload
    uint8_t qos;                // QoS Level (0 or 1)
    unsigned long timestamp;    // Creation Timestamp (millis())
};
```

**Offline Buffer:**
- Fixed Array: `MQTTMessage offline_buffer_[100]`
- Circular Buffer (FIFO)
- Max 100 Messages
- Processed on reconnection

---

## Public API

### Singleton Pattern

#### `static MQTTClient& getInstance()`
**Beschreibung:** Singleton-Zugriff auf MQTTClient  
**Rückgabe:** Referenz auf globale Instanz  
**Verwendung:**
```cpp
MQTTClient& mqtt = mqttClient;  // Global instance
```

---

### Initialisierung

#### `bool begin()`
**Beschreibung:** Initialisiert MQTT-Client  
**Rückgabe:** `true` bei Erfolg  
**Fehlerbehandlung:**
- Double-init wird ignoriert (LOG_WARNING)
- Setzt PubSubClient Callback

**Verhalten:**
- Setzt static callback für PubSubClient
- Initialisiert interne Zustandsvariablen
- Setzt `initialized_` Flag

**Beispiel:**
```cpp
if (!mqttClient.begin()) {
    LOG_ERROR("MQTTClient initialization failed");
    return;
}
```

---

### Verbindungsmanagement

#### `bool connect(const MQTTConfig& config)`
**Beschreibung:** Stellt Verbindung zum MQTT-Broker her  
**Parameter:**
- `config`: MQTT-Konfiguration (REQUIRED)

**Rückgabe:** `true` bei erfolgreicher Verbindung  
**Fehlerbehandlung:**
- Validiert Server-Adresse (nicht leer)
- Loggt Fehler via ErrorTracker (ERROR_MQTT_INIT_FAILED, ERROR_MQTT_CONNECT_FAILED)
- Bei Fehler: Exponential Backoff wird gestartet

**Verhalten:**
- Prüft Anonymous vs. Authenticated Mode (username leer?)
- Setzt PubSubClient Server und Port
- Ruft `connectToBroker()` auf
- Bei Erfolg: Verarbeitet Offline-Buffer
- Reset Reconnect-Counter

**Beispiel:**
```cpp
MQTTConfig config;
config.server = "192.168.1.100";
config.port = 1883;
config.client_id = "ESP_12AB34CD";
config.username = "";  // Anonymous mode
config.password = "";
config.keepalive = 60;
config.timeout = 10;

if (!mqttClient.connect(config)) {
    LOG_ERROR("MQTT connection failed");
}
```

---

#### `bool disconnect()`
**Beschreibung:** Trennt MQTT-Verbindung (Graceful Shutdown)  
**Rückgabe:** `true` bei Erfolg  
**Verhalten:**
- Ruft `mqtt_.disconnect()` auf
- Loggt Disconnection

---

#### `bool isConnected() const`
**Beschreibung:** Prüft MQTT-Verbindungsstatus  
**Rückgabe:** `true` wenn verbunden  
**Verhalten:**
- Prüft `mqtt_.connected()` Status

---

#### `void reconnect()`
**Beschreibung:** Versucht MQTT-Reconnection mit Exponential Backoff  
**Verhalten:**
- Prüft ob bereits verbunden → return
- Prüft ob Reconnect erlaubt (`shouldAttemptReconnect()`)
- Incrementiert Reconnect-Counter
- Ruft `connectToBroker()` auf
- Bei Fehler: Berechnet neuen Backoff-Delay
- Bei Max Attempts: Loggt Critical Error

**Exponential Backoff:**
- Base Delay: 1000ms (1s)
- Max Delay: 60000ms (60s)
- Formula: `delay = base * (2^attempts)`, capped at max

---

#### `bool transitionToAuthenticated(const String& username, const String& password)`
**Beschreibung:** Wechselt von Anonymous zu Authenticated Mode  
**Parameter:**
- `username`: MQTT Username (REQUIRED)
- `password`: MQTT Password (REQUIRED)

**Rückgabe:** `true` bei Erfolg  
**Verhalten:**
- Prüft ob bereits authenticated → return true
- Aktualisiert Config mit Credentials
- Setzt `anonymous_mode_` Flag
- Disconnect + Reconnect mit Authentication

**Beispiel:**
```cpp
if (mqttClient.isAnonymousMode()) {
    mqttClient.transitionToAuthenticated("user", "pass");
}
```

---

#### `bool isAnonymousMode() const`
**Beschreibung:** Prüft ob Anonymous Mode aktiv ist  
**Rückgabe:** `true` wenn Anonymous Mode

---

### Publishing

#### `bool publish(const String& topic, const String& payload, uint8_t qos = 1)`
**Beschreibung:** Publiziert MQTT-Message  
**Parameter:**
- `topic`: MQTT Topic (REQUIRED)
- `payload`: Message Payload (REQUIRED)
- `qos`: QoS Level (default: 1, supported: 0 or 1)

**Rückgabe:** `true` bei erfolgreicher Übertragung oder Buffering  
**Fehlerbehandlung:**
- Nicht verbunden → Message in Offline-Buffer
- Publish fehlgeschlagen → Message in Offline-Buffer
- Loggt Fehler via ErrorTracker (ERROR_MQTT_PUBLISH_FAILED)

**Verhalten:**
- Wenn verbunden: Sofort senden via `mqtt_.publish()`
- Wenn nicht verbunden: In Offline-Buffer speichern
- QoS 1 wird als `mqtt_.publish(topic, payload, true)` gesendet
- QoS 0 wird als `mqtt_.publish(topic, payload, false)` gesendet

**Beispiel:**
```cpp
String topic = "kaiser/god/esp/ESP_12AB34CD/sensor/4/data";
String payload = "{\"value\":21.5}";
mqttClient.publish(topic, payload, 1);
```

---

#### `bool safePublish(const String& topic, const String& payload, uint8_t qos = 1, uint8_t retries = 3)`
**Beschreibung:** Publiziert mit Retry-Logic  
**Parameter:**
- `topic`: MQTT Topic (REQUIRED)
- `payload`: Message Payload (REQUIRED)
- `qos`: QoS Level (default: 1)
- `retries`: Anzahl Wiederholungen (default: 3)

**Rückgabe:** `true` wenn erfolgreich (auch nach Retry)  
**Verhalten:**
- Versucht `publish()` `retries` mal
- Wartet 100ms zwischen Versuchen
- Bei Erfolg: return true
- Nach allen Retries: return false

---

### Config JSON-Schemas

#### Sensor-Config Payload

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`  
**Direction:** Server → ESP (PUBLISH)  
**QoS:** 1 (Guaranteed Delivery)  
**Retention:** false

**JSON-Schema:**
```json
{
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "ph_sensor",
      "sensor_name": "Boden pH Zone 1",
      "subzone_id": "zone_1",
      "active": true,
      "raw_mode": true
    },
    {
      "gpio": 5,
      "sensor_type": "temperature_ds18b20",
      "sensor_name": "Wasser Temp",
      "subzone_id": "zone_1",
      "active": true,
      "raw_mode": false
    }
  ]
}
```

**Field-Beschreibungen:**
- `gpio`: GPIO Pin für Sensor (ADC: 32-39, Digital: 0-39)
- `sensor_type`: Sensor-Typ-Identifier (Server-definiert)
- `sensor_name`: Human-Readable Name für Logging/UI
- `subzone_id`: Zuordnung zu Subzone (Optional)
- `active`: Sensor aktiv (true) oder deaktiviert (false)
- `raw_mode`: Raw ADC-Werte (true) oder kalibrierte Werte (false)

**Validation-Rules:**
- GPIO 0-39 (ESP32-Standard)
- `sensor_type` nicht leer
- `sensor_name` nicht leer
- Kein GPIO-Konflikt mit anderen Sensoren/Aktoren

---

#### Actuator-Config Payload

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`  
**Direction:** Server → ESP (PUBLISH)  
**QoS:** 1 (Guaranteed Delivery)  
**Retention:** false

**JSON-Schema:**
```json
{
  "actuators": [
    {
      "gpio": 5,
      "aux_gpio": 255,
      "actuator_type": "pump",
      "actuator_name": "Haupt-Pumpe A",
      "subzone_id": "zone_1",
      "active": true,
      "critical": true,
      "inverted_logic": false,
      "default_state": false,
      "default_pwm": 0
    },
    {
      "gpio": 18,
      "aux_gpio": 19,
      "actuator_type": "pwm",
      "actuator_name": "Lüfter PWM",
      "subzone_id": "zone_2",
      "active": true,
      "critical": false,
      "inverted_logic": false,
      "default_state": false,
      "default_pwm": 128
    }
  ]
}
```

**Field-Beschreibungen:**
- `gpio`: Primary GPIO Pin (Output)
- `aux_gpio`: Secondary GPIO Pin (z.B. H-Bridge Direction, 255=unused)
- `actuator_type`: Actuator-Type (`"pump"`, `"pwm"`, `"valve"`, `"relay"`)
- `actuator_name`: Human-Readable Name
- `subzone_id`: Subzone-Zuordnung
- `active`: Aktor aktiv (true) oder deaktiviert (false)
- `critical`: Kritischer Aktor (true) → Safe-Mode bevorzugt
- `inverted_logic`: LOW=ON (true) oder HIGH=ON (false)
- `default_state`: Default Boot-State (ON/OFF)
- `default_pwm`: Default PWM Duty-Cycle (0-255, nur für PWM)

**Validation-Rules:**
- GPIO 0-39
- `actuator_type` ∈ {pump, pwm, valve, relay}
- `actuator_name` nicht leer
- Kein GPIO-Konflikt
- `aux_gpio` ≠ `gpio` (falls verwendet)

---

#### Config-Update-Flow

```
┌──────────────┐                      ┌─────────────┐                      ┌──────────────┐
│   Server     │                      │    MQTT     │                      │    ESP32     │
│ (God-Kaiser) │                      │   Broker    │                      │   (Client)   │
└──────┬───────┘                      └──────┬──────┘                      └──────┬───────┘
       │                                     │                                     │
       │ 1. Config ändern (UI/Logic)         │                                     │
       │                                     │                                     │
       │ 2. PUBLISH /config (JSON)           │                                     │
       ├────────────────────────────────────>│                                     │
       │    QoS: 1, Retain: false            │                                     │
       │                                     │                                     │
       │                                     │ 3. DELIVER /config (QoS 1)          │
       │                                     ├────────────────────────────────────>│
       │                                     │                                     │
       │                                     │                 4. Parse JSON       │
       │                                     │                 5. Validate Config  │
       │                                     │                    ├─> GPIO Range   │
       │                                     │                    ├─> Type Check   │
       │                                     │                    └─> Conflict Det │
       │                                     │                                     │
       │                                     │                 6. Apply Config     │
       │                                     │                    ├─> sensorManager│
       │                                     │                    └─> actuatorMgr  │
       │                                     │                                     │
       │                                     │                 7. NVS Save         │
       │                                     │                    (Nur Sensors!)   │
       │                                     │                                     │
       │                                     │                 8. Register HAL     │
       │                                     │                    (GPIO-Setup)     │
       │                                     │                                     │
       │                                     │ 9. PUBLISH /config_response (ACK)   │
       │                                     │<────────────────────────────────────┤
       │                                     │    {"status":"success","count":2}   │
       │                                     │                                     │
       │ 10. RECEIVE /config_response        │                                     │
       │<────────────────────────────────────┤                                     │
       │                                     │                                     │
       │ 11. UI Update (Success Notification)│                                     │
       │                                     │                                     │
```

**Timing:**
- Step 2-3: <100ms (MQTT-Latency)
- Step 4-8: <500ms (Parse + Validate + Apply + NVS)
- Step 9-10: <100ms (MQTT-Latency)
- **Total:** <700ms (Server → ESP → Response)

---

#### Config-Response Topic

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`  
**Direction:** ESP → Server (PUBLISH)  
**QoS:** 1  
**Retention:** false  
**Implementation:** `ConfigResponseBuilder` (`src/services/config/config_response.*`)  
**Verwendet von:** Sensor- und Actuator-Konfiguration (Phase 6)

**Success Response:**
```json
{
  "status": "success",
  "type": "sensor",
  "count": 2,
  "message": "Configured 2 sensors successfully"
}
```

**Error Response (Validation-Fehler):**
```json
{
  "status": "error",
  "type": "sensor",
  "error_code": "VALIDATION_FAILED",
  "message": "Sensor validation failed: GPIO 50 out of range (max 39)",
  "failed_item": {
    "gpio": 50,
    "sensor_type": "ph_sensor"
  }
}
```

**Error Response (GPIO-Conflict):**
```json
{
  "status": "error",
  "type": "actuator",
  "error_code": "GPIO_CONFLICT",
  "message": "GPIO 5 already used by Sensor 'Boden pH'",
  "failed_item": {
    "gpio": 5,
    "actuator_type": "pump"
  }
}
```

**Error Response (JSON-Parse-Fehler):**
```json
{
  "status": "error",
  "type": "unknown",
  "error_code": "JSON_PARSE_ERROR",
  "message": "Failed to parse JSON: Missing closing brace"
}
```

---

**Standardisierte Config-Error-Codes (`ConfigErrorCode`):**

- `JSON_PARSE_ERROR` – JSON konnte nicht deserialisiert werden
- `VALIDATION_FAILED` – Feldvalidierung fehlgeschlagen (Range, Pflichtfeld, etc.)
- `GPIO_CONFLICT` – GPIO bereits durch Sensor oder Actuator belegt
- `NVS_WRITE_FAILED` – Preferences/NVS Schreibvorgang fehlgeschlagen
- `TYPE_MISMATCH` – Datentyp stimmt nicht mit Erwartung überein
- `MISSING_FIELD` – Pflichtfeld fehlt im Payload
- `OUT_OF_RANGE` – Wert außerhalb zulässigem Bereich
- `UNKNOWN_ERROR` – Fallback für nicht spezifizierte Fehler
- `NONE` – Platzhalter bei Erfolgsnachrichten

---

#### Error-Handling-Matrix

| Error-Type | ESP-Action | Response | Server-Action |
|------------|------------|----------|---------------|
| **JSON-Parse-Fehler** | `LOG_ERROR`, Abort | NACK (`JSON_PARSE_ERROR`) | Retry mit korrigiertem JSON |
| **Validation-Fehler** | `LOG_WARNING`, Abort | NACK (`VALIDATION_FAILED`) | Fix Config, Retry |
| **GPIO-Conflict** | `LOG_ERROR`, Abort | NACK (`GPIO_CONFLICT`) | Resolve Conflict, Retry |
| **NVS-Write-Fehler** | `LOG_ERROR`, Abort | NACK (`NVS_WRITE_FAILED`) | Retry oder Factory-Reset |
| **Success** | `LOG_INFO`, Apply | ACK (`success`) | UI-Update, Continue |

**Note:** Bei NACK wird **keine Config angewendet** (Transactional Semantics).

---

### Subscription

#### `bool subscribe(const String& topic)`
**Beschreibung:** Subscribed zu MQTT-Topic  
**Parameter:**
- `topic`: MQTT Topic (REQUIRED)

**Rückgabe:** `true` bei Erfolg  
**Fehlerbehandlung:**
- Nicht verbunden → Loggt Fehler (ERROR_MQTT_SUBSCRIBE_FAILED)
- Subscribe fehlgeschlagen → Loggt Fehler

**Verhalten:**
- Prüft Verbindungsstatus
- Subscribed via `mqtt_.subscribe(topic.c_str())`
- Loggt Subscription

**Beispiel:**
```cpp
mqttClient.subscribe("kaiser/god/esp/ESP_12AB34CD/system/command");
mqttClient.subscribe("kaiser/broadcast/emergency");
```

---

#### `bool unsubscribe(const String& topic)`
**Beschreibung:** Unsubscribed von Topic  
**Parameter:**
- `topic`: MQTT Topic (REQUIRED)

**Rückgabe:** `true` bei Erfolg  
**Verhalten:**
- Prüft Verbindungsstatus
- Unsubscribed via `mqtt_.unsubscribe(topic.c_str())`
- Loggt Unsubscription

---

#### `void setCallback(std::function<void(const String&, const String&)> callback)`
**Beschreibung:** Setzt Callback für eingehende Messages  
**Parameter:**
- `callback`: Lambda/Function mit (topic, payload)

**Verhalten:**
- Callback wird bei jedem empfangenen Message aufgerufen
- WICHTIG: Callback MUSS schnell sein (nicht blockierend)
- Lange Verarbeitung → in Task auslagern

**Beispiel:**
```cpp
mqttClient.setCallback([](const String& topic, const String& payload) {
    LOG_INFO("MQTT message received: " + topic);
    LOG_DEBUG("Payload: " + payload);
    // Parse payload...
});
```

---

### Heartbeat System

#### `void publishHeartbeat()`
**Beschreibung:** Publiziert System-Heartbeat (automatisch alle 60s)  
**Verhalten:**
- Prüft ob 60s seit letztem Heartbeat vergangen
- Baut Heartbeat-Topic via `TopicBuilder::buildSystemHeartbeatTopic()`
- Baut JSON Payload:
  ```json
  {
    "ts": 1735818000,
    "uptime": 3600,
    "heap_free": 245760,
    "wifi_rssi": -65
  }
  ```
- Publiziert mit QoS 0 (heartbeat doesn't need guaranteed delivery)
- Wird automatisch in `loop()` aufgerufen

**Heartbeat Interval:** 60 Sekunden (HEARTBEAT_INTERVAL_MS)

---

### Monitoring

#### `void loop()`
**Beschreibung:** MUSS in main loop() aufgerufen werden  
**Frequenz:** Jede Iteration (non-blocking)  
**Verhalten:**
- Ruft `mqtt_.loop()` auf (verarbeitet eingehende Messages)
- Wenn verbunden: Ruft `publishHeartbeat()` auf
- Wenn nicht verbunden: Versucht Reconnection

**Beispiel:**
```cpp
void loop() {
    wifiManager.loop();
    mqttClient.loop();  // REQUIRED!
    // ... other code
}
```

---

### Status & Monitoring

#### `String getConnectionStatus() const`
**Beschreibung:** Gibt Verbindungsstatus als String zurück  
**Rückgabe:** Status-String ("Connected", "Disconnected", "Connection timeout", etc.)  
**Verhalten:**
- Prüft `mqtt_.connected()`
- Bei Disconnected: Gibt PubSubClient State-String zurück

**Mögliche Werte:**
- "Connected"
- "Connection timeout"
- "Connection lost"
- "Connect failed"
- "Disconnected"
- "Bad protocol"
- "Bad client ID"
- "Server unavailable"
- "Bad credentials"
- "Unauthorized"

---

#### `uint16_t getConnectionAttempts() const`
**Beschreibung:** Gibt Anzahl Reconnect-Versuche zurück  
**Rückgabe:** Anzahl Versuche seit letztem erfolgreichen Connect

---

#### `bool hasOfflineMessages() const`
**Beschreibung:** Prüft ob Messages im Offline-Buffer sind  
**Rückgabe:** `true` wenn Buffer nicht leer

---

#### `uint16_t getOfflineMessageCount() const`
**Beschreibung:** Gibt Anzahl Messages im Offline-Buffer zurück  
**Rückgabe:** Anzahl gepufferter Messages (0-100)

---

## Private Methoden (Intern)

### `bool connectToBroker()`
**Beschreibung:** Interne Methode für Broker-Connection  
**Verhalten:**
- Prüft Anonymous vs. Authenticated Mode
- Ruft `mqtt_.connect()` mit entsprechenden Parametern auf
- Bei Erfolg: Verarbeitet Offline-Buffer
- Bei Fehler: Loggt Fehler mit State-Code

---

### `void handleDisconnection()`
**Beschreibung:** Behandelt Verbindungsabbruch  
**Verhalten:**
- Loggt Disconnection (nur einmal)
- Triggert Reconnection

---

### `bool shouldAttemptReconnect() const`
**Beschreibung:** Prüft ob Reconnect erlaubt ist  
**Rückgabe:** `true` wenn Reconnect erlaubt  
**Verhalten:**
- Prüft Max Attempts (10)
- Prüft Backoff-Delay (exponential)

---

### `void processOfflineBuffer()`
**Beschreibung:** Verarbeitet Offline-Buffer nach Reconnection  
**Verhalten:**
- Sendet gepufferte Messages in FIFO-Reihenfolge
- Entfernt erfolgreich gesendete Messages
- Behält fehlgeschlagene Messages im Buffer

---

### `bool addToOfflineBuffer(const String& topic, const String& payload, uint8_t qos)`
**Beschreibung:** Fügt Message zu Offline-Buffer hinzu  
**Rückgabe:** `true` bei Erfolg  
**Fehlerbehandlung:**
- Buffer voll → Loggt Fehler (ERROR_MQTT_BUFFER_FULL)
- Verwirft älteste Message (FIFO)

---

### `unsigned long calculateBackoffDelay() const`
**Beschreibung:** Berechnet Exponential Backoff Delay  
**Rückgabe:** Delay in Millisekunden  
**Formel:** `delay = base * (2^attempts)`, capped at max (60s)

---

### `static void staticCallback(char* topic, byte* payload, unsigned int length)`
**Beschreibung:** Static Callback für PubSubClient  
**Verhalten:**
- Konvertiert Topic und Payload zu String
- Ruft User-Callback auf (wenn gesetzt)

---

## Error-Handling

### Connection-Loss
```
1. mqtt_.connected() → false
2. Neue Messages → Offline-Buffer
3. loop() erkennt Disconnection
4. reconnect() wird aufgerufen (Exponential Backoff)
5. Nach Reconnect: processOfflineBuffer()
```

### Publish-Fehler
```
1. publish() fehlgeschlagen
2. LOG_ERROR mit Fehlercode (ERROR_MQTT_PUBLISH_FAILED)
3. Message in Offline-Buffer
```

### Buffer-Overflow
```
1. Offline-Buffer voll (100 Messages)
2. LOG_ERROR (ERROR_MQTT_BUFFER_FULL)
3. Message wird verworfen (return false)
```

### Subscribe-Fehler
```
1. subscribe() fehlgeschlagen
2. LOG_ERROR (ERROR_MQTT_SUBSCRIBE_FAILED)
3. Subscribe wird nicht wiederholt (muss manuell retry)
```

---

## QoS-Handling

| QoS | PubSubClient | ESP32 Verhalten |
|-----|--------------|-----------------|
| 0 | At most once | Fire-and-forget, keine ACK (Heartbeat) |
| 1 | At least once | Wartet auf PUBACK (Sensor Data, Commands) |

**Wichtig:** QoS 2 wird NICHT unterstützt (PubSubClient-Limit)

---

## Thread-Safety

**NICHT Thread-Safe!**
- Alle Methoden müssen vom selben Task aufgerufen werden
- Bei FreeRTOS: Verwende Mutex für Multi-Task-Zugriff
- Callbacks laufen im MQTT-Task-Context

---

## Memory-Management

### Heap-Usage
- Offline-Buffer: ~20KB (100 Messages à ~200 Bytes durchschnittlich)
- PubSubClient-Buffer: Konfigurierbar (default: 256 bytes)
- WiFiClient: ~4KB
- **Gesamt: ~25KB Heap**

### Buffer-Size-Empfehlungen
- Standard (Sensor-Data): PubSubClient default (256 bytes) ist ausreichend
- Große Messages: PubSubClient Buffer kann erhöht werden (nicht in Phase 2)

---

## Verwendungsbeispiel

```cpp
#include "services/communication/mqtt_client.h"
#include "services/communication/wifi_manager.h"
#include "services/config/config_manager.h"

void setup() {
    // ... Phase 1 initialization ...
    
    // WiFi Connection
    wifiManager.begin();
    WiFiConfig wifi_config = configManager.getWiFiConfig();
    wifiManager.connect(wifi_config);
    
    // MQTT Connection
    mqttClient.begin();
    MQTTConfig mqtt_config;
    mqtt_config.server = wifi_config.server_address;
    mqtt_config.port = wifi_config.mqtt_port;
    mqtt_config.client_id = configManager.getESPId();
    mqtt_config.username = wifi_config.mqtt_username;  // Can be empty
    mqtt_config.password = wifi_config.mqtt_password;  // Can be empty
    mqtt_config.keepalive = 60;
    mqtt_config.timeout = 10;
    
    mqttClient.connect(mqtt_config);
    
    // Subscribe to topics
    mqttClient.subscribe(TopicBuilder::buildSystemCommandTopic());
    mqttClient.subscribe(TopicBuilder::buildConfigTopic());
    mqttClient.subscribe(TopicBuilder::buildBroadcastEmergencyTopic());
    
    // Set callback
    mqttClient.setCallback([](const String& topic, const String& payload) {
        LOG_INFO("MQTT message received: " + topic);
        // Handle message...
    });
}

void loop() {
    wifiManager.loop();
    mqttClient.loop();  // REQUIRED - processes messages + heartbeat
    
    // Publish sensor data
    String topic = TopicBuilder::buildSensorDataTopic(4);
    String payload = "{\"value\":21.5}";
    mqttClient.publish(topic, payload, 1);
}
```

---

## Integration mit System

### Verwendet von
- `src/main.cpp` → Initialisierung und `loop()` Aufruf
- `services/sensor/sensor_manager.cpp` → Sensor-Data publishing (Phase 4)
- `services/actuator/actuator_manager.cpp` → Actuator-Status/-Response/-Alert publishing + Command subscription (Phase 5)

### Verwendet
- `utils/logger.h` → Logging (Phase 1)
- `utils/topic_builder.h` → Topic-Generierung (Phase 1)
- `error_handling/error_tracker.h` → Error-Logging (Phase 1)
- `services/communication/wifi_manager.h` → WiFi-Verbindung (Phase 2)

---

## Testing-Anforderungen

### Unit-Tests (Phase 2)
1. ✅ `begin()` Initialisierung
2. ✅ `connect()` mit valider Config (Anonymous Mode)
3. ✅ `connect()` mit Authentication
4. ✅ `publish()` bei verbunden → sofort senden
5. ✅ `publish()` bei getrennt → Buffer
6. ✅ `subscribe()` mit Topic
7. ✅ Reconnect nach Connection-Loss
8. ✅ Offline-Buffer Flush nach Reconnect
9. ✅ Buffer-Overflow Handling
10. ✅ Heartbeat Publishing (60s interval)

### Integration-Tests (Phase 2)
1. ✅ End-to-End WiFi → MQTT Flow
2. ✅ Heartbeat Publishing Verification
3. ✅ Message Reception via Callback

---

## Logging

Alle Logs verwenden `utils/logger.h`:

```cpp
LOG_DEBUG("MQTT: Connecting to " + server);
LOG_INFO("MQTT: Connected!");
LOG_WARNING("MQTT: Reconnecting...");
LOG_ERROR("MQTT: Publish failed: " + topic);
LOG_CRITICAL("MQTT: Max reconnection attempts reached");
```

---

## Error Codes (from error_codes.h)

```cpp
ERROR_MQTT_INIT_FAILED = 3010       // MQTT initialization failed
ERROR_MQTT_CONNECT_FAILED = 3011    // MQTT connection failed
ERROR_MQTT_PUBLISH_FAILED = 3012    // MQTT publish failed
ERROR_MQTT_SUBSCRIBE_FAILED = 3013  // MQTT subscribe failed
ERROR_MQTT_DISCONNECT = 3014        // MQTT disconnected
ERROR_MQTT_BUFFER_FULL = 3015       // MQTT buffer overflow
ERROR_MQTT_PAYLOAD_INVALID = 3016   // MQTT payload invalid
```

---

**Status:** ✅ API vollständig implementiert (Phase 2) - Verwendet in Phase 4 & 5  
**Implementierungszeit:** ~10 Tage (wie geplant)  
**Komplexität:** Mittel-Hoch (PubSubClient + Offline-Buffer + Heartbeat)  
**Code-Qualität:** Industrial-Grade (follows Phase 1 patterns)  
**Phase 5 Integration:** Wird für Actuator-MQTT-Communication verwendet (keine API-Änderungen)

---

## Performance Guidelines

### Loop-Call Requirements

**CRITICAL:** `mqttClient.loop()` MUSS in `main.cpp::loop()` aufgerufen werden.

**Frequenz-Requirements:**
- **Minimum:** 10 Hz (alle 100ms) für reliable Message-Processing
- **Empfohlen:** 20-50 Hz (alle 20-50ms) für responsive Command-Handling
- **Maximum:** 100+ Hz (alle 10ms) möglich, aber unnötig (kein Performance-Vorteil)

**Timing-Verhalten:**
- **QoS 0:** Non-blocking, sofortiger Return (~<1ms)
- **QoS 1:** Wartet auf PUBACK (typisch 5-50ms, max 5s Timeout)
- **Callback:** Läuft im loop()-Context (MUSS schnell sein, nicht blockierend!)

**Best Practice:**
```cpp
void loop() {
    mqttClient.loop();         // Process MQTT (non-blocking)
    sensorManager.loop();      // Sensor measurements
    actuatorManager.processActuatorLoops();  // Actuator processing
    delay(20);                 // 50 Hz loop frequency
}
```

**Warnung:** Lange Callback-Operationen (>100ms) blockieren MQTT-Processing! Lagere in FreeRTOS-Tasks aus wenn nötig.

---

### Payload-Size Limits

**PubSubClient Default:** 256 bytes max payload size (MQTT_MAX_PACKET_SIZE)

**Praktische Payload-Größen (Phase 5):**

| Message-Type | Typical Size | Max Size | Status |
|--------------|--------------|----------|--------|
| `sensor/data` | 150-200 bytes | 256 bytes | ✅ OK |
| `actuator/status` | 120-180 bytes | 256 bytes | ✅ OK |
| `actuator/response` | 150 bytes | 256 bytes | ✅ OK |
| `actuator/alert` | 100 bytes | 256 bytes | ✅ OK |
| `heartbeat` | 180 bytes | 256 bytes | ✅ OK |
| `config` (5 actuators) | 800+ bytes | 256 bytes | ❌ OVERFLOW |

**Config-Overflow-Problem:**
- Config mit >3 Aktoren überschreitet 256 bytes
- **Workaround (Phase 5):** Max 2-3 Aktoren pro Config-Message
- **Lösung (Phase 6+):** `MQTT_MAX_PACKET_SIZE` erhöhen oder Config fragmentieren

**Buffer-Size-Erhöhung (Optional):**
```cpp
// In platformio.ini:
build_flags = 
    -DMQTT_MAX_PACKET_SIZE=1024    // 1KB Payload-Limit (nicht in Phase 5)
```

**Memory-Impact:** +768 bytes Heap pro vergrößertes Paket

**Empfehlung Phase 5:** Behalte 256 bytes, fragmentiere große Configs manuell.
