# MQTT Client API Specification
## services/communication/mqtt_client.cpp

**Version:** 1.0  
**Zweck:** MQTT-Client-Wrapper für ESP32 mit Auto-Reconnect, Offline-Buffering und QoS-Handling

---

## Abhängigkeiten

```cpp
#include <PubSubClient.h>           // Arduino MQTT Library
#include <WiFi.h>                   // ESP32 WiFi
#include <ArduinoJson.h>            // JSON Serialization
#include "utils/logger.h"           // Logging
#include "utils/time_manager.h"     // Timestamps
#include "utils/data_buffer.h"      // Offline Message Buffer
```

---

## Datenstrukturen

### MQTTConfig
```cpp
struct MQTTConfig {
    String server;              // Broker IP/Hostname
    uint16_t port;              // Broker Port (default: 1883)
    String client_id;           // ESP32 Client ID
    String username;            // Optional: MQTT Username
    String password;            // Optional: MQTT Password
    bool use_tls;               // TLS Support (default: false)
    uint16_t keepalive;         // Keepalive Interval (default: 60s)
    uint16_t buffer_size;       // Max Message Size (default: 2048)
};
```

### MQTTMessage
```cpp
struct MQTTMessage {
    String topic;               // MQTT Topic
    String payload;             // JSON Payload
    uint8_t qos;                // QoS Level (0, 1, 2)
    bool retain;                // Retain Flag
    uint32_t timestamp;         // Creation Timestamp
};
```

### ConnectionState
```cpp
enum class ConnectionState {
    DISCONNECTED,               // Nicht verbunden
    CONNECTING,                 // Verbindung läuft
    CONNECTED,                  // Verbunden
    RECONNECTING,               // Reconnect läuft
    ERROR                       // Fehler-Zustand
};
```

---

## Public API

### Initialisierung

#### `bool initialize(const MQTTConfig& config)`
**Beschreibung:** Initialisiert MQTT-Client mit Konfiguration  
**Parameter:**
- `config`: MQTT-Konfiguration

**Rückgabe:** `true` bei Erfolg  
**Fehlerbehandlung:**
- Validiert Server-Adresse (nicht leer)
- Validiert Port (1-65535)
- Validiert Buffer-Size (128-8192)
- Loggt Fehler bei ungültiger Config

**Verhalten:**
- Setzt WiFiClient als Transport
- Konfiguriert PubSubClient
- Setzt Callback-Handler
- Initialisiert Offline-Buffer (max 100 Messages)

---

### Verbindungsmanagement

#### `bool connect()`
**Beschreibung:** Stellt Verbindung zum MQTT-Broker her  
**Rückgabe:** `true` bei erfolgreicher Verbindung  
**Fehlerbehandlung:**
- Prüft WiFi-Verbindung (REQUIRED)
- Versucht MQTT-Connect (3 Retries)
- Bei Fehler: Wechsel zu RECONNECTING-State
- Loggt Connection-Errors mit Code

**Verhalten:**
- Verwendet Client-ID aus Config
- Sendet Last-Will-Message: `kaiser/god/esp/{esp_id}/status` (offline)
- Bei Erfolg: ConnectionState → CONNECTED
- Triggert `onConnected()` Callback
- Subscribed zu konfigurierten Topics

---

#### `void disconnect()`
**Beschreibung:** Trennt MQTT-Verbindung (Graceful Shutdown)  
**Verhalten:**
- Sendet Offline-Status (QoS 1)
- Wartet auf Acknowledge (max 2s)
- Unsubscribed alle Topics
- Schließt Socket
- ConnectionState → DISCONNECTED

---

#### `bool isConnected()`
**Beschreibung:** Prüft MQTT-Verbindungsstatus  
**Rückgabe:** `true` wenn CONNECTED  
**Verhalten:**
- Prüft PubSubClient::connected()
- Prüft WiFi-Status
- Bei Diskrepanz: Trigger Reconnect

---

#### `void loop()`
**Beschreibung:** MUSS in main loop() aufgerufen werden  
**Frequenz:** Jede Iteration (non-blocking)  
**Verhalten:**
- Ruft PubSubClient::loop() auf
- Prüft Connection-Status
- Führt Reconnect durch (wenn nötig)
- Sendet gepufferte Messages (wenn verbunden)
- Updated Connection-Metrics

---

### Publishing

#### `bool publish(const String& topic, const String& payload, uint8_t qos = 1, bool retain = false)`
**Beschreibung:** Publiziert MQTT-Message  
**Parameter:**
- `topic`: MQTT Topic (REQUIRED, max 256 chars)
- `payload`: JSON Payload (REQUIRED, max buffer_size)
- `qos`: QoS Level (default: 1)
- `retain`: Retain Flag (default: false)

**Rückgabe:** `true` bei erfolgreicher Übertragung  
**Fehlerbehandlung:**
- Topic leer → return false, LOG_ERROR
- Payload zu groß → return false, LOG_ERROR
- Nicht verbunden → Buffer Message, return true
- QoS invalid (nicht 0,1,2) → default zu 1

**Verhalten:**
- Wenn CONNECTED: Sofort senden via PubSubClient
- Wenn DISCONNECTED: In Offline-Buffer (FIFO, max 100)
- Bei vollem Buffer: Älteste Message verwerfen (LOG_WARNING)
- Zählt gesendete Messages (Statistik)

---

#### `bool safePublish(const String& topic, const String& payload, uint8_t qos = 1, uint8_t retries = 3)`
**Beschreibung:** Publiziert mit Retry-Logic  
**Parameter:**
- `retries`: Anzahl Wiederholungen (default: 3)

**Rückgabe:** `true` wenn erfolgreich (auch nach Retry)  
**Verhalten:**
- Versucht publish() `retries` mal
- Wartet zwischen Versuchen (100ms exponential backoff)
- Bei Erfolg: return true
- Nach allen Retries: Buffer Message, return false

---

### Subscription

#### `bool subscribe(const String& topic, uint8_t qos = 1)`
**Beschreibung:** Subscribed zu MQTT-Topic  
**Parameter:**
- `topic`: MQTT Topic (wildcards: +, # erlaubt)
- `qos`: QoS Level (default: 1)

**Rückgabe:** `true` bei Erfolg  
**Fehlerbehandlung:**
- Nicht verbunden → Speichert für späteren Subscribe
- Topic invalid → return false, LOG_ERROR
- Subscribe fehlgeschlagen → Retry (max 3x)

**Verhalten:**
- Fügt Topic zu Subscription-Liste hinzu
- Subscribed via PubSubClient
- Bei Reconnect: Re-Subscribe automatisch

---

#### `bool unsubscribe(const String& topic)`
**Beschreibung:** Unsubscribed von Topic  
**Rückgabe:** `true` bei Erfolg  
**Verhalten:**
- Entfernt Topic aus Subscription-Liste
- Unsubscribed via PubSubClient

---

### Callbacks

#### `void setMessageCallback(std::function<void(const String& topic, const String& payload)> callback)`
**Beschreibung:** Setzt Callback für eingehende Messages  
**Parameter:**
- `callback`: Lambda/Function mit (topic, payload)

**Verhalten:**
- Callback wird bei jedem empfangenen Message aufgerufen
- WICHTIG: Callback MUSS schnell sein (nicht blockierend)
- Lange Verarbeitung → in Task auslagern

**Beispiel:**
```cpp
mqttClient.setMessageCallback([](const String& topic, const String& payload) {
    LOG_INFO("Received: " + topic);
    // Parse payload...
});
```

---

#### `void setConnectedCallback(std::function<void()> callback)`
**Beschreibung:** Wird aufgerufen wenn MQTT verbunden  
**Verwendung:** Für Post-Connect-Aktionen (z.B. Subscribe, Status senden)

---

#### `void setDisconnectedCallback(std::function<void()> callback)`
**Beschreibung:** Wird aufgerufen wenn Verbindung verloren  
**Verwendung:** Für Cleanup, State-Reset

---

### Reconnect-Strategie

#### `void enableAutoReconnect(bool enable)`
**Beschreibung:** Aktiviert/Deaktiviert Auto-Reconnect  
**Default:** enabled  
**Verhalten:**
- Wenn enabled: loop() führt automatisch Reconnect durch
- Wenn disabled: Manuelles connect() nötig

---

#### `void setReconnectDelay(uint32_t minDelay, uint32_t maxDelay)`
**Beschreibung:** Konfiguriert Exponential-Backoff  
**Parameter:**
- `minDelay`: Start-Delay (default: 1000ms)
- `maxDelay`: Max-Delay (default: 60000ms)

**Verhalten:**
- Bei Reconnect: Wartet `currentDelay` ms
- Nach Fehler: `currentDelay = min(currentDelay * 2, maxDelay)`
- Bei Erfolg: `currentDelay = minDelay`

---

### Statistik & Monitoring

#### `uint32_t getSentMessageCount()`
**Rückgabe:** Anzahl erfolgreich gesendeter Messages seit Boot

#### `uint32_t getReceivedMessageCount()`
**Rückgabe:** Anzahl empfangener Messages seit Boot

#### `uint32_t getBufferedMessageCount()`
**Rückgabe:** Anzahl Messages im Offline-Buffer

#### `uint32_t getReconnectCount()`
**Rückgabe:** Anzahl Reconnects seit Boot

#### `ConnectionState getConnectionState()`
**Rückgabe:** Aktueller Verbindungsstatus

---

## Private Methoden (Intern)

### `void handleReconnect()`
**Beschreibung:** Interne Reconnect-Logic mit Exponential-Backoff

### `void flushOfflineBuffer()`
**Beschreibung:** Sendet gepufferte Messages nach Reconnect (FIFO)

### `void onPubSubMessage(char* topic, byte* payload, unsigned int length)`
**Beschreibung:** PubSubClient Callback-Handler (intern)

### `bool validateTopic(const String& topic)`
**Beschreibung:** Validiert Topic-Format (Länge, Zeichen)

### `bool validatePayload(const String& payload)`
**Beschreibung:** Validiert Payload (JSON-Format, Größe)

---

## Error-Handling

### Connection-Loss
```
1. PubSubClient::connected() → false
2. ConnectionState → RECONNECTING
3. Neue Messages → Offline-Buffer
4. loop() führt Reconnect durch (Exponential-Backoff)
5. Nach Reconnect: flushOfflineBuffer()
```

### Publish-Fehler
```
1. publish() fehlgeschlagen
2. LOG_ERROR mit Fehlercode
3. Message in Offline-Buffer
4. Statistik aktualisieren
```

### Buffer-Overflow
```
1. Offline-Buffer voll (100 Messages)
2. Älteste Message verwerfen (FIFO)
3. LOG_WARNING("Offline buffer overflow, dropping oldest message")
4. Neue Message hinzufügen
```

### Subscribe-Fehler
```
1. subscribe() fehlgeschlagen
2. Retry 3x (500ms delay)
3. Bei weiterem Fehler: Topic in Pending-Liste
4. Re-Subscribe bei nächstem Reconnect
```

---

## QoS-Handling

| QoS | PubSubClient | ESP32 Verhalten |
|-----|--------------|-----------------|
| 0 | At most once | Fire-and-forget, keine ACK |
| 1 | At least once | Wartet auf PUBACK |
| 2 | Exactly once | NICHT unterstützt (PubSubClient-Limit) |

**Wichtig:** QoS 2 wird automatisch auf QoS 1 degradiert (mit LOG_WARNING)

---

## Thread-Safety

**NICHT Thread-Safe!**
- Alle Methoden müssen vom selben Task aufgerufen werden
- Bei FreeRTOS: Verwende Mutex für Multi-Task-Zugriff
- Callbacks laufen im MQTT-Task-Context

---

## Memory-Management

### Heap-Usage
- Offline-Buffer: ~20KB (100 Messages à 200 Bytes durchschnittlich)
- PubSubClient-Buffer: Konfigurierbar (default: 2048 Bytes)
- WiFiClient: ~4KB

**Gesamt: ~26KB Heap**

### Buffer-Size-Empfehlungen
- Kleine Messages (<512 Bytes): buffer_size = 1024
- Standard (Sensor-Data): buffer_size = 2048 (DEFAULT)
- Große Messages (Batch): buffer_size = 4096

---

## Verwendungsbeispiel (Pseudo-Code)

```cpp
// Initialisierung
MQTTConfig config;
config.server = "192.168.0.100";
config.port = 1883;
config.client_id = "ESP_12AB34CD";

MQTTClient mqtt;
mqtt.initialize(config);

// Callbacks setzen
mqtt.setMessageCallback([](const String& topic, const String& payload) {
    // Handle incoming messages
});

mqtt.setConnectedCallback([]() {
    // Subscribe to topics
    mqtt.subscribe("kaiser/god/esp/ESP_12AB34CD/+/command");
});

// Verbinden
mqtt.connect();

// In loop()
void loop() {
    mqtt.loop();  // REQUIRED!
    
    // Publish sensor data
    String topic = "kaiser/god/esp/ESP_12AB34CD/sensor/4/data";
    String payload = "{\"value\":21.5}";
    mqtt.publish(topic, payload, 1);
}
```

---

## Integration mit System

### Verwendet von
- `core/main_loop.cpp` → loop() Aufruf
- `services/sensor/sensor_manager.cpp` → Sensor-Data publishing
- `services/actuator/actuator_manager.cpp` → Command subscription
- `core/system_controller.cpp` → System-Commands, Status

### Verwendet
- `utils/logger.h` → Logging
- `utils/time_manager.h` → Timestamps
- `utils/data_buffer.h` → Offline-Buffer
- `utils/topic_builder.h` → Topic-Generierung

---

## Testing-Anforderungen

### Unit-Tests
1. `connect()` mit valider Config
2. `connect()` ohne WiFi → Fehler
3. `publish()` bei verbunden → sofort senden
4. `publish()` bei getrennt → Buffer
5. `subscribe()` mit Wildcard
6. Reconnect nach Connection-Loss
7. Offline-Buffer Flush nach Reconnect
8. Buffer-Overflow Handling

### Integration-Tests
1. End-to-End Message-Flow (ESP → Broker → Server)
2. Reconnect bei Broker-Neustart
3. QoS 1 Delivery-Garantie
4. Last-Will-Message bei Crash

---

## Logging

Alle Logs verwenden `utils/logger.h`:

```cpp
LOG_DEBUG("MQTT: Connecting to " + server);
LOG_INFO("MQTT: Connected to broker");
LOG_WARNING("MQTT: Reconnecting...");
LOG_ERROR("MQTT: Publish failed, code: " + String(error));
```

---

**Status:** ✅ API-Spezifikation vollständig  
**Implementierungszeit:** ~4-6 Stunden (erfahrener Entwickler)  
**Komplexität:** Mittel (PubSubClient bekannt)
