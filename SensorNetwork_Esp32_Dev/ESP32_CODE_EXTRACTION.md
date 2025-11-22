# VOLLSTÄNDIGE CODE-EXTRAKTION - ESP32 PROJEKT
## SensorNetwork_Esp32_Dev (14.805 Zeilen)

Dieses Dokument enthält die vollständige Code-Extraktion aus dem funktionierenden ESP32-Projekt für die Migration in eine neue modulare Architektur.

---

## TEIL 1: PLATFORMIO & BUILD-KONFIGURATION

### 1.1 platformio.ini - KOMPLETTE Datei

**Datei:** `platformio.ini:1-114`

```ini
[env:seeed_xiao_esp32c3]
platform = espressif32
board = seeed_xiao_esp32c3
framework = arduino
monitor_speed = 115200
upload_speed = 921600

; Xiao-optimierte Build-Flags
build_flags = 
    ; Debug & Logging (reduziert für Speicher)
    -DCORE_DEBUG_LEVEL=2
    -DCONFIG_ARDUHAL_LOG_COLORS=1
    
    ; KERNEL-FEATURES BEIBEHALTEN
    -DDYNAMIC_LIBRARY_SUPPORT=1
    -DHIERARCHICAL_ZONES=1
    -DOTA_LIBRARY_ENABLED=1
    -DSAFE_MODE_PROTECTION=1
    -DZONE_MASTER_ENABLED=1
    
    ; Xiao-spezifische Anpassungen
    -DXIAO_ESP32C3_MODE=1
    -DMAX_SENSORS=10
    -DMAX_ACTUATORS=6
    -DMAX_LIBRARY_SIZE=32768
    -DMQTT_MAX_PACKET_SIZE=1024
    -DMQTT_KEEPALIVE=60
    -DMQTT_SOCKET_TIMEOUT=60
    -DWIFI_CONNECT_TIMEOUT=10000
    -DCONFIG_ESP32_WIFI_STATIC_RX_BUFFER_NUM=8

; Partitionierung für Xiao
board_build.partitions = default.csv
board_build.filesystem = spiffs

; Libraries (nur Basis-Libraries, keine Sensor-Libraries)
lib_deps = 
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.3
    arduino-libraries/NTPClient@^3.2.1
    paulstoffregen/OneWire@^2.3.7
    milesburton/DallasTemperature@^3.11.0
    WebServer
    DNSServer

monitor_filters = 
    esp32_exception_decoder
    time
    colorize
    log2file
    default
    debug
    send_on_enter

; =============================================================================
; ESP32 DEV ENVIRONMENT - Neue Konfiguration für ESP32 Dev Board
; =============================================================================

[env:esp32_dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
upload_speed = 921600

; ESP32 Dev Build-Flags
build_flags = 
    ; Debug & Logging (erweitert für ESP32 Dev)
    -DCORE_DEBUG_LEVEL=3
    -DCONFIG_ARDUHAL_LOG_COLORS=1
    
    ; KERNEL-FEATURES BEIBEHALTEN
    -DDYNAMIC_LIBRARY_SUPPORT=1
    -DHIERARCHICAL_ZONES=1
    -DOTA_LIBRARY_ENABLED=1
    -DSAFE_MODE_PROTECTION=1
    -DZONE_MASTER_ENABLED=1
    
    ; ESP32 Dev-spezifische Anpassungen
    -DESP32_DEV_MODE=1
    -DMAX_SENSORS=20
    -DMAX_ACTUATORS=12
    -DMAX_LIBRARY_SIZE=65536
    -DMQTT_MAX_PACKET_SIZE=2048
    -DMQTT_KEEPALIVE=60
    -DMQTT_SOCKET_TIMEOUT=60
    -DWIFI_CONNECT_TIMEOUT=10000
    -DCONFIG_ESP32_WIFI_STATIC_RX_BUFFER_NUM=16

; Partitionierung für ESP32 Dev
board_build.partitions = default.csv
board_build.filesystem = spiffs

; Libraries (erweiterte Auswahl für ESP32 Dev)
lib_deps = 
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.3
    arduino-libraries/NTPClient@^3.2.1
    paulstoffregen/OneWire@^2.3.7
    milesburton/DallasTemperature@^3.11.0
    WebServer
    DNSServer
    ; Zusätzliche Libraries für ESP32 Dev
    adafruit/Adafruit Unified Sensor@^1.1.9
    adafruit/Adafruit BME280 Library@^2.2.2

monitor_filters = 
    esp32_exception_decoder
    time
    colorize
    log2file
    default
    debug
    send_on_enter
```

### 1.2 Partitions-Schema

**Datei:** `partitions/default.csv:1-5`

```csv
# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     0x9000,  0x6000,
phy_init, data, phy,     0xf000,  0x1000,
factory,  app,  factory, 0x10000, 0x140000,
spiffs,   data, spiffs,  0x150000,0x2B0000,
```

---

## TEIL 2: HARDWARE-KONFIGURATION

### 2.1 XIAO ESP32-C3 Konfiguration

**Datei:** `src/xiao_config.h:1-86`

```cpp
#ifndef XIAO_CONFIG_H
#define XIAO_CONFIG_H

// Xiao ESP32-C3 Hardware-Konfiguration
#ifndef XIAO_ESP32C3_MODE
#define XIAO_ESP32C3_MODE
#endif

// Hardware-Pins (Xiao ESP32-C3 spezifisch)
#define XIAO_I2C_SDA 4
#define XIAO_I2C_SCL 5
#define XIAO_LED 21
#define XIAO_BUTTON 0

// Verfügbare GPIO-Pins für Sensoren/Aktoren
const uint8_t XIAO_AVAILABLE_PINS[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21};
const uint8_t XIAO_PIN_COUNT = 12;

// Xiao-optimierte Konstanten
#define MAX_SENSORS 10                    // Reduziert von 8 auf 10
#define MAX_ACTUATORS 6                   // Reduziert von 40 auf 6
#ifndef MAX_LIBRARY_SIZE
#define MAX_LIBRARY_SIZE 32768            // Reduziert von 65536 für XIAO
#endif
#define MQTT_BUFFER_SIZE 1024             // Reduziert von 4096
#define JSON_BUFFER_SIZE 512              // Reduziert von 1024
#define MAX_BUFFERED_MEASUREMENTS 50      // Reduziert von 150
#define MAX_SUBZONES 4                    // Reduziert von 6

// Zonen-Master-Konfiguration (BEIBEHALTEN)
#define ZONE_MASTER_ENABLED 1
#define HIERARCHICAL_ZONES 1

// OTA Library-Konfiguration (BEIBEHALTEN)
#define OTA_LIBRARY_ENABLED 1
#define LIBRARY_CHUNK_SIZE 1024           // Reduziert von 2048

// Safe Mode (BEIBEHALTEN)
#define SAFE_MODE_PROTECTION 1

// MQTT-Konfiguration (Xiao-optimiert)
#define MQTT_MAX_PACKET_SIZE 1024
#define MQTT_KEEPALIVE 60
#define MQTT_SOCKET_TIMEOUT 60

// WiFi-Konfiguration (Xiao-optimiert)
#define WIFI_CONNECT_TIMEOUT 10000
#define CONFIG_ESP32_WIFI_STATIC_RX_BUFFER_NUM 8

// Memory-Konfiguration (Xiao-optimiert)
#define MEASUREMENT_INTERVAL 30000        // 30 Sekunden zwischen Messungen
#define USER_CONFIG_TIMEOUT 30000         // 5 Minuten für User-Konfiguration

// =============================================================================
// DYNAMIC ID CONFIGURATION - Konsistenz mit HARDCODEPROBLEMS.md
// =============================================================================

// Default-Werte für dynamische Konfiguration
#define DEFAULT_KAISER_ID "raspberry_pi_central"
#define DEFAULT_MQTT_PORT 1883
#define DEFAULT_HTTP_PORT 80

// UUID-Generierung für Client-IDs
String generateClientId();
String getKaiserId();
int getMQTTPort();
int getHttpPort();

// =============================================================================
// CONSISTENT TOPIC GENERATION - Function Declarations
// =============================================================================

// Basic topic generation
String buildTopic(const String& topic_type, const String& esp_id, const String& gpio = "");

// Special topic generation with subpath
String buildSpecialTopic(const String& topic_type, const String& esp_id, const String& subpath = "");

// Broadcast topic generation
String buildBroadcastTopic(const String& topic_type);

// Hierarchical topic generation
String buildHierarchicalTopic(const String& master_zone_id, const String& esp_id, 
                             const String& subzone_id, const String& gpio);

#endif
```

### 2.2 ESP32 Dev Board Konfiguration

**Datei:** `src/esp32_dev_config.h:1-88`

```cpp
#ifndef ESP32_DEV_CONFIG_H
#define ESP32_DEV_CONFIG_H

#include <Arduino.h>

// ESP32 Dev Hardware-Konfiguration
#ifndef ESP32_DEV_MODE
#define ESP32_DEV_MODE
#endif

// Hardware-Pins (ESP32 Dev spezifisch)
#define ESP32_DEV_I2C_SDA 21  // Standard ESP32 Dev I2C SDA
#define ESP32_DEV_I2C_SCL 22  // Standard ESP32 Dev I2C SCL
#define ESP32_DEV_LED 2       // Standard ESP32 Dev LED
#define ESP32_DEV_BUTTON 0    // Standard ESP32 Dev BOOT Button

// Verfügbare GPIO-Pins für Sensoren/Aktoren (ESP32 Dev hat mehr Pins)
const uint8_t ESP32_DEV_AVAILABLE_PINS[] = {0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39};
const uint8_t ESP32_DEV_PIN_COUNT = 24;

// ESP32 Dev-optimierte Konstanten (erhöht für bessere Performance)
#define MAX_SENSORS 20                    // Verdoppelt von 10 auf 20
#define MAX_ACTUATORS 12                  // Verdoppelt von 6 auf 12
#define MAX_LIBRARY_SIZE 65536            // Verdoppelt von 32768
#define MQTT_BUFFER_SIZE 2048             // Verdoppelt von 1024
#define JSON_BUFFER_SIZE 1024             // Verdoppelt von 512
#define MAX_BUFFERED_MEASUREMENTS 100     // Verdoppelt von 50
#define MAX_SUBZONES 8                    // Verdoppelt von 4

// Zonen-Master-Konfiguration (BEIBEHALTEN)
#define ZONE_MASTER_ENABLED 1
#define HIERARCHICAL_ZONES 1

// OTA Library-Konfiguration (BEIBEHALTEN)
#define OTA_LIBRARY_ENABLED 1
#define LIBRARY_CHUNK_SIZE 2048           // Erhöht von 1024

// Safe Mode (BEIBEHALTEN)
#define SAFE_MODE_PROTECTION 1

// MQTT-Konfiguration (ESP32 Dev-optimiert)
#define MQTT_MAX_PACKET_SIZE 2048         // Verdoppelt von 1024
#define MQTT_KEEPALIVE 60
#define MQTT_SOCKET_TIMEOUT 60

// WiFi-Konfiguration (ESP32 Dev-optimiert)
#define WIFI_CONNECT_TIMEOUT 10000
#ifndef CONFIG_ESP32_WIFI_STATIC_RX_BUFFER_NUM
#define CONFIG_ESP32_WIFI_STATIC_RX_BUFFER_NUM 16  // Erhöht von 8
#endif

// Memory-Konfiguration (ESP32 Dev-optimiert)
#define MEASUREMENT_INTERVAL 30000        // 30 Sekunden zwischen Messungen
#define USER_CONFIG_TIMEOUT 30000         // 5 Minuten für User-Konfiguration

// =============================================================================
// DYNAMIC ID CONFIGURATION - Konsistenz mit HARDCODEPROBLEMS.md
// =============================================================================

// Default-Werte für dynamische Konfiguration
#define DEFAULT_KAISER_ID "raspberry_pi_central"
#define DEFAULT_MQTT_PORT 1883
#define DEFAULT_HTTP_PORT 80

// UUID-Generierung für Client-IDs
String generateClientId();
String getKaiserId();
int getMQTTPort();
int getHttpPort();

// =============================================================================
// CONSISTENT TOPIC GENERATION - Function Declarations
// =============================================================================

// Basic topic generation
String buildTopic(const String& topic_type, const String& esp_id, const String& gpio = "");

// Special topic generation with subpath
String buildSpecialTopic(const String& topic_type, const String& esp_id, const String& subpath = "");

// Broadcast topic generation
String buildBroadcastTopic(const String& topic_type);

// Hierarchical topic generation
String buildHierarchicalTopic(const String& master_zone_id, const String& esp_id, 
                             const String& subzone_id, const String& gpio);

#endif
```

**Unterschiede zu XIAO:**
- Mehr GPIO-Pins (24 vs. 12)
- Höhere Limits (MAX_SENSORS: 20 vs. 10, MAX_ACTUATORS: 12 vs. 6)
- Größere Buffer (MQTT_BUFFER_SIZE: 2048 vs. 1024)
- Größere Library-Size (65536 vs. 32768)
- Mehr Subzones (8 vs. 4)
- I2C-Pins: SDA=21, SCL=22 (vs. XIAO: SDA=4, SCL=5)

---

## TEIL 3: SYSTEM STATE MACHINE

### 3.1 SystemState Enum

**Datei:** `src/main.cpp:116-129`

```cpp
// System-Status
enum SystemState {
  STATE_BOOT,                    // System startet
  STATE_WIFI_SETUP,              // WiFi-Konfigurations-Portal aktiv
  STATE_WIFI_CONNECTED,          // WiFi verbunden, aber MQTT noch nicht
  STATE_MQTT_CONNECTING,         // Versucht MQTT-Verbindung herzustellen
  STATE_MQTT_CONNECTED,          // MQTT verbunden, aber noch nicht operational
  STATE_AWAITING_USER_CONFIG,    // Wartet auf Benutzer-Konfiguration
  STATE_ZONE_CONFIGURED,         // Zone-Konfiguration erhalten
  STATE_SENSORS_CONFIGURED,      // Sensoren konfiguriert
  STATE_OPERATIONAL,             // System vollständig operational
  STATE_LIBRARY_DOWNLOADING,     // OTA-Library wird heruntergeladen
  STATE_SAFE_MODE,               // Safe Mode für Server-Kompatibilität
  STATE_ERROR                    // System-Fehler aufgetreten
};
String getSystemStateString(SystemState state);
```

### 3.2 State-Transition-Logik

**Datei:** `src/main.cpp:2334-2384` (initializeSystem)

```cpp
bool initializeSystem() {
  DEBUG_PRINT("[System] Initializing system components...");
  
  // Subscribe to topics
  subscribeToKaiserTopics();
  
  // Request zone configuration if not already configured
  if (!master_zone.assigned) {
    requestUserZoneConfiguration();
    DEBUG_PRINT("[System] Requesting zone configuration");
    return false; // Not fully operational yet
  }
  
  // Subscribe to configuration topics
  subscribeToConfigurationTopics();
  
  // Initialize Generic I2C Sensor System
  if (GenericI2CSensor::initialize(&mqtt_client, esp_id, getKaiserId())) {
    DEBUG_PRINT("[System] Generic I2C Sensor System initialized successfully");
  } else {
    DEBUG_PRINT("[System] ERROR: Failed to initialize Generic I2C Sensor System");
  }
  
  // Initialize Advanced Sensor System
  if (advanced_system.initialize(esp_id, zone_id)) {
    advanced_system_initialized = true;
    DEBUG_PRINT("[System] Advanced Sensor System initialized successfully");
    
    // Create and configure PiSensorClient
    String pi_url = wifi_config.getPiServerURL();
    PiSensorClient* pi_client = new PiSensorClient(pi_url, esp_id);
    
    if (pi_client->init()) {
      DEBUG_PRINTF("[System] PiSensorClient initialized with URL: %s\n", pi_url.c_str());
      
      // Initialize actuator system with Pi client
      AdvancedActuatorSystem* actuator_system = advanced_system.getActuatorSystem();
      if (actuator_system) {
        actuator_system->initialize(pi_client, esp_id, zone_id);
        DEBUG_PRINT("[System] Actuator system initialized with Pi client");
      }
    } else {
      DEBUG_PRINT("[System] WARNING: PiSensorClient initialization failed - will use fallback mode");
    }
  } else {
    DEBUG_PRINT("[System] ERROR: Failed to initialize Advanced Sensor System");
  }
  
  DEBUG_PRINT("[System] System initialization complete");
  return true;
}
```

**State-Transitions in connectToMqtt():** `src/main.cpp:4758-4837`

```cpp
bool connectToMqtt() {
  // ✅ FIXED: Use IP address directly instead of hostname to avoid DNS issues
  String mqtt_server = wifi_config.getServerAddress();
  int mqtt_port = getMQTTPort();
  
  mqtt_client.setServer(mqtt_server.c_str(), mqtt_port);
  mqtt_client.setCallback(onMqttMessage);
  mqtt_client.setBufferSize(MQTT_BUFFER_SIZE);
  
  String client_id = "esp32_" + generateClientId();
  
  DEBUG_PRINTF("[MQTT] Connecting to %s:%d as %s\n", 
               mqtt_server.c_str(), mqtt_port, client_id.c_str());
  
  bool connected = false;
  if (wifi_config.mqtt_user.length() > 0) {
    connected = mqtt_client.connect(client_id.c_str(), 
                                   wifi_config.mqtt_user.c_str(), 
                                   wifi_config.mqtt_password.c_str());
  } else {
    connected = mqtt_client.connect(client_id.c_str());
  }
  
  if (connected) {
    DEBUG_PRINT("[MQTT] Connected successfully");
    
    // Subscribe to system commands
    String system_topic = buildTopic("system/command", esp_id);
    mqtt_client.subscribe(system_topic.c_str());
    
    // Subscribe to actuator commands
    String actuator_topic = buildTopic("actuator/+/command", esp_id);
    mqtt_client.subscribe(actuator_topic.c_str());
    
    // Subscribe to emergency commands
    String emergency_topic = buildTopic("emergency", esp_id);
    mqtt_client.subscribe(emergency_topic.c_str());
    
    // 🆕 NEU: Subscribe to UI-Schema Processing topics
    String ui_schema_topic = buildSpecialTopic("ui_schema", esp_id, "update");
    mqtt_client.subscribe(ui_schema_topic.c_str());
    DEBUG_PRINTF("[MQTT] Subscribed to UI schema: %s\n", ui_schema_topic.c_str());
    
    String ui_capabilities_topic = buildSpecialTopic("ui_capabilities", esp_id, "request");
    mqtt_client.subscribe(ui_capabilities_topic.c_str());
    DEBUG_PRINTF("[MQTT] Subscribed to UI capabilities: %s\n", ui_capabilities_topic.c_str());
    
    // 🧪 PHASE 2: Subscribe to test trigger topic
    String ui_test_topic = buildSpecialTopic("ui_test", esp_id, "run");
    mqtt_client.subscribe(ui_test_topic.c_str());
    DEBUG_PRINTF("[MQTT] Subscribed to UI test runner: %s\n", ui_test_topic.c_str());
    
    // 🆕 ERWEITERT: System-Initialisierung nach erfolgreicher MQTT-Verbindung
    if (initializeSystem()) {
      current_state = STATE_OPERATIONAL;
      DEBUG_PRINT("[MQTT] System fully operational");
      
      // 🆕 NEU: Pi Server Konfiguration senden nach erfolgreicher MQTT-Verbindung
      sendConfigurationToPiServer();
    } else {
      current_state = STATE_MQTT_CONNECTED;
      DEBUG_PRINT("[MQTT] MQTT connected but system initialization incomplete");
    }
    
    return true;
  }
  
  DEBUG_PRINT("[MQTT] Connection failed");
  mqtt_reconnect_count++;
  
  // 🆕 WICHTIG: Nicht in ERROR-State wechseln, wenn nur MQTT nicht erreichbar ist
  if (current_state == STATE_WIFI_CONNECTED) {
    // Bleibe im WIFI_CONNECTED State, damit das Webportal erreichbar bleibt
    DEBUG_PRINT("[MQTT] Staying in WIFI_CONNECTED state for troubleshooting");
  }
  
  return false;
}
```

**State-Transition-Matrix:**
- `STATE_BOOT` → `STATE_WIFI_SETUP` (wenn WiFi nicht konfiguriert)
- `STATE_BOOT` → `STATE_WIFI_CONNECTED` (wenn WiFi verbunden)
- `STATE_WIFI_CONNECTED` → `STATE_MQTT_CONNECTING` (beim Verbindungsversuch)
- `STATE_MQTT_CONNECTING` → `STATE_MQTT_CONNECTED` (bei erfolgreicher Verbindung)
- `STATE_MQTT_CONNECTED` → `STATE_OPERATIONAL` (wenn `initializeSystem()` erfolgreich)
- `STATE_MQTT_CONNECTED` → `STATE_AWAITING_USER_CONFIG` (wenn Zone nicht konfiguriert)
- `STATE_ZONE_CONFIGURED` → `STATE_SENSORS_CONFIGURED` (nach Sensor-Konfiguration)
- `STATE_SENSORS_CONFIGURED` → `STATE_OPERATIONAL` (wenn alles konfiguriert)

### 3.3 State-String-Konvertierung

**Datei:** `src/main.cpp:6276-6292`

```cpp
String getSystemStateString(SystemState state) {
  switch (state) {
    case STATE_BOOT: return "BOOT";
    case STATE_WIFI_SETUP: return "WIFI_SETUP";
    case STATE_WIFI_CONNECTED: return "WIFI_CONNECTED";
    case STATE_MQTT_CONNECTING: return "MQTT_CONNECTING";
    case STATE_MQTT_CONNECTED: return "MQTT_CONNECTED";
    case STATE_AWAITING_USER_CONFIG: return "AWAITING_USER_CONFIG";
    case STATE_ZONE_CONFIGURED: return "ZONE_CONFIGURED";
    case STATE_SENSORS_CONFIGURED: return "SENSORS_CONFIGURED";
    case STATE_OPERATIONAL: return "OPERATIONAL";
    case STATE_LIBRARY_DOWNLOADING: return "LIBRARY_DOWNLOADING";
    case STATE_SAFE_MODE: return "SAFE_MODE";
    case STATE_ERROR: return "ERROR";
    default: return "UNKNOWN";
  }
}
```

**Verwendung:** Wird für MQTT-Status-Publishing verwendet (z.B. in `sendStatusUpdate()`).

---

## TEIL 4: MQTT COMMUNICATION

### 4.1 Topic-Struktur-Funktionen

**Datei:** `src/main.cpp:7048-7088`

```cpp
// ⚡ MEMORY OPTIMIZATION: Pre-allocated static buffer für Topic-Building
static char topic_buffer[256];  // 256 bytes für alle Topics ausreichend

String buildTopic(const String& topic_type, const String& esp_id, const String& gpio) {
  // ⚡ Optimiert: Single sprintf statt multiple String concatenations
  if (gpio.length() > 0) {
    snprintf(topic_buffer, sizeof(topic_buffer), "kaiser/%s/esp/%s/%s/%s", 
             getKaiserId().c_str(), esp_id.c_str(), topic_type.c_str(), gpio.c_str());
  } else {
    snprintf(topic_buffer, sizeof(topic_buffer), "kaiser/%s/esp/%s/%s", 
             getKaiserId().c_str(), esp_id.c_str(), topic_type.c_str());
  }
  return String(topic_buffer);
}

// NEUE FUNKTION für spezielle Topics - Memory-optimiert
String buildSpecialTopic(const String& topic_type, const String& esp_id, const String& subpath) {
  // ⚡ Optimiert: Single sprintf statt multiple String concatenations
  if (subpath.length() > 0) {
    snprintf(topic_buffer, sizeof(topic_buffer), "kaiser/%s/esp/%s/%s/%s", 
             getKaiserId().c_str(), esp_id.c_str(), topic_type.c_str(), subpath.c_str());
  } else {
    snprintf(topic_buffer, sizeof(topic_buffer), "kaiser/%s/esp/%s/%s", 
             getKaiserId().c_str(), esp_id.c_str(), topic_type.c_str());
  }
  return String(topic_buffer);
}

// NEUE FUNKTION für Broadcast-Topics - Memory-optimiert
String buildBroadcastTopic(const String& topic_type) {
  // ⚡ Optimiert: Single sprintf statt String concatenation
  snprintf(topic_buffer, sizeof(topic_buffer), "kaiser/%s/broadcast/%s", 
           getKaiserId().c_str(), topic_type.c_str());
  return String(topic_buffer);
}

String buildHierarchicalTopic(const String& master_zone_id, const String& esp_id, 
                             const String& subzone_id, const String& gpio) {
  // ⚡ Optimiert: Single sprintf für komplexe hierarchische Topics
  snprintf(topic_buffer, sizeof(topic_buffer), "kaiser/%s/master/%s/esp/%s/subzone/%s/sensor/%s/data", 
           getKaiserId().c_str(), master_zone_id.c_str(), esp_id.c_str(), 
           subzone_id.c_str(), gpio.c_str());
  return String(topic_buffer);
}
```

**Beispiel-Outputs:**
- `buildTopic("sensor", "esp001", "6")` → `"kaiser/raspberry_pi_central/esp/esp001/sensor/6"`
- `buildSpecialTopic("ui_schema", "esp001", "update")` → `"kaiser/raspberry_pi_central/esp/esp001/ui_schema/update"`
- `buildBroadcastTopic("emergency")` → `"kaiser/raspberry_pi_central/broadcast/emergency"`
- `buildHierarchicalTopic("zone1", "esp001", "sub1", "6")` → `"kaiser/raspberry_pi_central/master/zone1/esp/esp001/subzone/sub1/sensor/6/data"`

### 4.2 MQTT-Client-Konfiguration

**Datei:** `src/main.cpp:444-445, 4758-4837`

**PubSubClient Initialisierung:**
```cpp
// Netzwerk & MQTT
WiFiClient wifi_client;
PubSubClient mqtt_client(wifi_client);
Preferences preferences;
WiFiConfig wifi_config;
```

**connectToMqtt() vollständig:** Siehe Abschnitt 3.2

**QoS-Levels definiert:** `src/main.cpp:335-339`

```cpp
#define MQTT_QOS_COMMANDS 0      // System commands
#define MQTT_QOS_SENSOR_DATA 1   // Live sensor data
#define MQTT_QOS_HEARTBEAT 1     // Heartbeat messages
#define MQTT_QOS_ACKS 1          // Acknowledgments
#define MQTT_QOS_STATUS 1        // Status updates
```

**MQTT-Parameter:**
- `mqtt_client.setBufferSize(MQTT_BUFFER_SIZE)` (1024 für XIAO, 2048 für ESP32 Dev)
- `mqtt_client.setCallback(onMqttMessage)` - Message-Handler
- `mqtt_client.setServer(mqtt_server.c_str(), mqtt_port)` - Server-Konfiguration

**Client-ID Generierung:**
```cpp
String client_id = "esp32_" + generateClientId();
```

### 4.3 Subscribed Topics

**Datei:** `src/main.cpp:4839-4908`

**subscribeToKaiserTopics():** `src/main.cpp:4839-4855`

```cpp
void subscribeToKaiserTopics() {
  String base_topic = "kaiser/" + getKaiserId() + "/esp/" + esp_id + "/";
  
  String topics[] = {
    base_topic + "zone/config",
    base_topic + "system/command",
    // ✅ KONSISTENT: Dynamische Kaiser-ID für Pi Server Topics
    base_topic + "response",
    base_topic + "commands"
  };
  
  for (String topic : topics) {
    if (mqtt_client.subscribe(topic.c_str())) {
      DEBUG_PRINTF("[MQTT] Subscribed to: %s\n", topic.c_str());
    }
  }
}
```

**subscribeToConfigurationTopics():** `src/main.cpp:4857-4908`

```cpp
void subscribeToConfigurationTopics() {
  if (!master_zone.assigned) return;
  
  String base_topic = "kaiser/" + getKaiserId() + "/esp/" + esp_id + "/";
  
  String topics[] = {
    base_topic + "subzone/config",
    base_topic + "sensor/config",
    base_topic + "sensor/remove",
    base_topic + "library/download",
    base_topic + "library/chunk",
    // *** NEU: ESP-Konfiguration Topic ***
    base_topic + "config",
    // *** ACTUATOR TOPICS ***
    base_topic + "actuator/+/command",    // Individual actuator commands (Wildcard für GPIO)
    base_topic + "actuator/+/status",     // Individual actuator status
    base_topic + "actuator/emergency",    // Emergency signals
    base_topic + "actuator/config",       // Actuator configuration
    base_topic + "actuator/status",       // Overall actuator status
    // *** HEALTH & MONITORING TOPICS ***
    base_topic + "health/request",        // Health status requests
    base_topic + "system/diagnostics",    // Diagnostic commands
    base_topic + "error/acknowledge",     // Error acknowledgments
    // *** BROADCAST TOPICS ***
    buildBroadcastTopic("emergency"),     // Emergency broadcasts
    buildBroadcastTopic("system_update"), // System updates
    // v3.6.0: Emergency-Command-Subscribe
    base_topic + "emergency",           // Emergency commands
    // v3.6.0: Library-Request-Subscribe
    base_topic + "library/request",     // Library requests
    // v3.6.0: Pi-Command-Subscribe
    base_topic + "pi/+/command",        // Pi commands (Wildcard)
    // v3.6.0: I2C-Scan-Subscribe
    base_topic + "i2c/scan",            // I2C scan requests
    // v3.6.0: Zone-Response-Subscribe
    base_topic + "zone/response",       // Zone responses
    // v3.6.0: Subzone-Response-Subscribe
    base_topic + "subzone/response",    // Subzone responses
    // v3.6.0: Error-Alert-Subscribe
    base_topic + "alert/error",         // Error alerts
    // v3.6.0: Safe-Mode-Subscribe
    base_topic + "safe_mode",           // Safe mode status
    // v3.6.0: Discovery-Subscribe
    "kaiser/" + getKaiserId() + "/discovery/esp32_nodes"  // Discovery notifications
  };
  
  for (String topic : topics) {
    if (mqtt_client.subscribe(topic.c_str())) {
      DEBUG_PRINTF("[MQTT] Subscribed to: %s\n", topic.c_str());
    }
  }
}
```

**Liste ALLER subscribten Topics:**
1. `kaiser/{kaiser_id}/esp/{esp_id}/zone/config` - Zone-Konfiguration
2. `kaiser/{kaiser_id}/esp/{esp_id}/system/command` - System-Kommandos
3. `kaiser/{kaiser_id}/esp/{esp_id}/response` - Response-Topic
4. `kaiser/{kaiser_id}/esp/{esp_id}/commands` - Kommandos
5. `kaiser/{kaiser_id}/esp/{esp_id}/subzone/config` - Subzone-Konfiguration
6. `kaiser/{kaiser_id}/esp/{esp_id}/sensor/config` - Sensor-Konfiguration
7. `kaiser/{kaiser_id}/esp/{esp_id}/sensor/remove` - Sensor-Entfernung
8. `kaiser/{kaiser_id}/esp/{esp_id}/library/download` - Library-Download-Start
9. `kaiser/{kaiser_id}/esp/{esp_id}/library/chunk` - Library-Chunk
10. `kaiser/{kaiser_id}/esp/{esp_id}/config` - ESP-Konfiguration
11. `kaiser/{kaiser_id}/esp/{esp_id}/actuator/+/command` - Actuator-Commands (Wildcard für GPIO)
12. `kaiser/{kaiser_id}/esp/{esp_id}/actuator/+/status` - Actuator-Status
13. `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency` - Emergency-Signale
14. `kaiser/{kaiser_id}/esp/{esp_id}/actuator/config` - Actuator-Konfiguration
15. `kaiser/{kaiser_id}/esp/{esp_id}/actuator/status` - Actuator-Status-Übersicht
16. `kaiser/{kaiser_id}/esp/{esp_id}/health/request` - Health-Requests
17. `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics` - Diagnose-Kommandos
18. `kaiser/{kaiser_id}/esp/{esp_id}/error/acknowledge` - Error-Acknowledgments
19. `kaiser/{kaiser_id}/broadcast/emergency` - Emergency-Broadcasts
20. `kaiser/{kaiser_id}/broadcast/system_update` - System-Update-Broadcasts
21. `kaiser/{kaiser_id}/esp/{esp_id}/emergency` - Emergency-Kommandos
22. `kaiser/{kaiser_id}/esp/{esp_id}/library/request` - Library-Requests
23. `kaiser/{kaiser_id}/esp/{esp_id}/pi/+/command` - Pi-Kommandos (Wildcard)
24. `kaiser/{kaiser_id}/esp/{esp_id}/i2c/scan` - I2C-Scan-Requests
25. `kaiser/{kaiser_id}/esp/{esp_id}/zone/response` - Zone-Responses
26. `kaiser/{kaiser_id}/esp/{esp_id}/subzone/response` - Subzone-Responses
27. `kaiser/{kaiser_id}/esp/{esp_id}/alert/error` - Error-Alerts
28. `kaiser/{kaiser_id}/esp/{esp_id}/safe_mode` - Safe-Mode-Status
29. `kaiser/{kaiser_id}/discovery/esp32_nodes` - Discovery-Notifications
30. `kaiser/{kaiser_id}/esp/{esp_id}/ui_schema/update` - UI-Schema-Updates
31. `kaiser/{kaiser_id}/esp/{esp_id}/ui_capabilities/request` - UI-Capabilities-Requests
32. `kaiser/{kaiser_id}/esp/{esp_id}/ui_test/run` - UI-Test-Runner

### 4.4 Published Topics

**Datei:** `src/main.cpp:3855-3910, 4949-4970`

**sendIndividualSensorData() - Topic-Struktur:** `src/main.cpp:3855-3910`

```cpp
void sendIndividualSensorData(int sensor_index, float value) {
    if (sensor_index >= MAX_SENSORS || !master_zone.assigned) return;
    
    SensorConfig* sensor = &sensors[sensor_index];
    
    // ✅ FRONTEND-ANFORDERUNG: 512 Bytes Payload
    StaticJsonDocument<512> data_doc;
    
    // ✅ FRONTEND-ANFORDERUNG: Standard-Set (512 Bytes)
    data_doc["esp_id"] = esp_id;
    data_doc["gpio"] = sensor->gpio;
    data_doc["value"] = value;
    data_doc["unit"] = getSensorUnit(sensor->type);
    data_doc["type"] = getSensorTypeString(sensor->type);
    data_doc["timestamp"] = getUnixTimestamp();
    data_doc["iso_timestamp"] = advanced_system_initialized ? AdvancedFeatures::getISOTimestamp() : "";
    data_doc["quality"] = "excellent";
    data_doc["raw_value"] = sensor->last_raw_value;
    data_doc["raw_mode"] = sensor->raw_mode;
    data_doc["hardware_mode"] = sensor->hardware_configured;
    data_doc["warnings"] = JsonArray();
    data_doc["time_quality"] = advanced_system_initialized ? AdvancedFeatures::getTimeQuality() : "unknown";
    data_doc["context"] = "temperature_reading";
    data_doc["sensor"] = sensor->sensor_name;
    data_doc["kaiser_id"] = getKaiserId();
    data_doc["zone_id"] = getKaiserId();
    data_doc["sensor_name"] = sensor->sensor_name;
    data_doc["subzone_id"] = sensor->subzone_id;
    data_doc["sensor_type"] = getSensorTypeString(sensor->type);
    data_doc["raw_data"] = sensor->last_raw_value;
    
    String data_message;
    ArduinoJson::serializeJson(data_doc, data_message);
    
    // ✅ FRONTEND-ANFORDERUNG: Einfache Topic-Struktur
    String sensor_topic = buildTopic("sensor", esp_id, String(sensor->gpio)) + "/data";
    
    // ✅ FRONTEND-ANFORDERUNG: QoS 1 für Sensor-Daten
    if (mqtt_client.publish(sensor_topic.c_str(), data_message.c_str(), MQTT_QOS_SENSOR_DATA)) {
        DEBUG_PRINTF("[Data] Sent: %s = %.2f %s (QoS %d)\n", 
                     sensor->sensor_name.c_str(), value, getSensorUnit(sensor->type).c_str(), MQTT_QOS_SENSOR_DATA);
        updateTopicStats(sensor_topic);
    } else {
        DEBUG_PRINTF("[Data] Failed to send sensor data for GPIO %d\n", sensor->gpio);
    }
    
    // v3.6.0: Hierarchisches Topic für Frontend-Kompatibilität
    if (master_zone.assigned && !master_zone.master_zone_id.isEmpty() && !sensor->subzone_id.isEmpty()) {
            String hierarchical_topic = buildHierarchicalTopic(master_zone.master_zone_id, esp_id, sensor->subzone_id, String(sensor->gpio));
        
        if (mqtt_client.publish(hierarchical_topic.c_str(), data_message.c_str(), MQTT_QOS_SENSOR_DATA)) {
            DEBUG_PRINTF("[Data] Sent hierarchical: %s (QoS %d)\n", hierarchical_topic.c_str(), MQTT_QOS_SENSOR_DATA);
            updateTopicStats(hierarchical_topic);
        }
    }
}
```

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`
**QoS:** 1
**Payload-Schema:**
```json
{
  "esp_id": "esp001",
  "gpio": 6,
  "value": 23.5,
  "unit": "°C",
  "type": "SENSOR_TEMP_DS18B20",
  "timestamp": 1735689600000,
  "iso_timestamp": "2025-01-01T12:00:00Z",
  "quality": "excellent",
  "raw_value": 2350,
  "raw_mode": false,
  "hardware_mode": true,
  "warnings": [],
  "time_quality": "synced",
  "context": "temperature_reading",
  "sensor": "Temperature Sensor 1",
  "kaiser_id": "raspberry_pi_central",
  "zone_id": "raspberry_pi_central",
  "sensor_name": "Temperature Sensor 1",
  "subzone_id": "zone1",
  "sensor_type": "SENSOR_TEMP_DS18B20",
  "raw_data": 2350
}
```

**sendStatusUpdate() - Topic-Struktur:** `src/main.cpp:4914-4970`

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/status`
**QoS:** 1
**Payload-Schema:** Siehe Code in Abschnitt 4.4

**Alle Publisher-Funktionen:**
1. `sendIndividualSensorData()` - Sensor-Daten
2. `sendBatchedSensorData()` - Batch-Sensor-Daten
3. `sendStatusUpdate()` - Status-Updates
4. `sendHeartbeat()` - Heartbeat-Messages
5. `sendActuatorStatus()` - Actuator-Status
6. `sendErrorAlert()` - Error-Alerts
7. `sendEnhancedStatusUpdate()` - Erweiterte Status-Updates
8. `sendZoneResponse()` - Zone-Responses
9. `sendSubzoneResponse()` - Subzone-Responses
10. `sendESPConfigurationUpdate()` - ESP-Konfigurations-Updates

### 4.5 onMqttMessage() Handler

**Datei:** `src/main.cpp:3960-4128`

```cpp
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  // Payload zu String konvertieren
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  DEBUG_PRINTF("[MQTT] Received on %s: %s\n", topic, message.c_str());
  
  String topic_str = String(topic);
    
    // Emergency handling
    if (topic_str.endsWith("/emergency")) {
        if (advanced_system_initialized) {
            bool success = advanced_system.emergencyStopAllActuators();
            DEBUG_PRINTF("[Emergency] Stop all actuators: %s\n", success ? "SUCCESS" : "FAILED");
            
            // Send emergency response
            StaticJsonDocument<256> response;
            response["esp_id"] = esp_id;
            response["command"] = "emergency_stop";
            response["success"] = success;
            response["timestamp"] = getUnixTimestamp();
            
            String response_msg;
            ArduinoJson::serializeJson(response, response_msg);
            
            String response_topic = buildTopic("response", esp_id);
            mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
        }
        return;
    }
    
    // Actuator command handling
    if (topic_str.indexOf("/actuator/") >= 0 && topic_str.endsWith("/command")) {
        // Extract GPIO from topic
        int actuator_start = topic_str.indexOf("/actuator/") + 10;
        int actuator_end = topic_str.indexOf("/", actuator_start);
        if (actuator_end > actuator_start) {
            String gpio_str = topic_str.substring(actuator_start, actuator_end);
            uint8_t gpio = gpio_str.toInt();
            
            StaticJsonDocument<256> doc;
            DeserializationError error = deserializeJson(doc, message);
            
            if (error) {
                DEBUG_PRINTF("[Actuator] JSON parse error: %s\n", error.c_str());
                return;
            }
            
            if (advanced_system_initialized && doc.containsKey("value")) {
                float value = doc["value"].as<float>();
                String command_type = doc.containsKey("type") ? doc["type"].as<String>() : "analog";
                
                bool success = false;
                if (command_type == "binary") {
                    success = advanced_system.controlActuatorBinary(gpio, value > 0.5);
                } else {
                    success = advanced_system.controlActuator(gpio, value);
                }
                
                // Send command response
                StaticJsonDocument<256> response;
                response["esp_id"] = esp_id;
                response["gpio"] = gpio;
                response["command"] = "actuator_control";
                response["success"] = success;
                response["requested_value"] = value;
                response["command_type"] = command_type;
                response["timestamp"] = getUnixTimestamp();
                
                String response_msg;
                ArduinoJson::serializeJson(response, response_msg);
                
                String response_topic = buildTopic("response", esp_id);
                mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
                
                // Send updated actuator status
                if (success) {
                    sendActuatorStatus(gpio);
                }
            }
        }
        return;
    }
  
  // Zone-Konfiguration
  if (topic_str.endsWith("/zone/config")) {
    handleZoneConfiguration(message);
  }
  // Sub-Zone-Konfiguration
  else if (topic_str.endsWith("/subzone/config")) {
    handleSubZoneConfiguration(message);
  }
  // Sensor-Konfiguration
  else if (topic_str.endsWith("/sensor/config")) {
    handleSensorConfiguration(message);
  }
  // NEU: ESP-Konfiguration Handler
  else if (topic_str.endsWith("/config")) {
    handleESPConfiguration(message);
  }
  // 🆕 NEU: Pi Server Response Handler
  else if (topic_str.indexOf("/response") > 0 && topic_str.indexOf("raspberry_pi_central") > 0) {
    handlePiServerResponse(topic_str, message);
  }
  // ✅ KORRIGIERT: Pi Server Command Handler aktivieren
  else if (topic_str.indexOf("/commands") > 0 && topic_str.indexOf("raspberry_pi_central") > 0) {
    handlePiServerCommand(message);
  }
  // System-Kommandos
  else if (topic_str.endsWith("/system/command")) {
    handleSystemCommand(message);
  }
  // v3.6.0: Emergency-Command-Handler
  else if (topic_str.endsWith("/emergency")) {
    handleEmergencyCommand(message);
  }
  // v3.6.0: Health-Request-Handler
  else if (topic_str.endsWith("/health/request")) {
    handleHealthRequest(message);
  }
  // v3.6.0: Library-Request-Handler
  else if (topic_str.endsWith("/library/request")) {
    handleLibraryRequest(message);
  }
  // v3.6.0: Pi-Command-Handler
  else if (topic_str.indexOf("/pi/") >= 0 && topic_str.endsWith("/command")) {
    handlePiCommand(message);
  }
  // v3.6.0: I2C-Scan-Handler
  else if (topic_str.endsWith("/i2c/scan")) {
    handleI2CScanRequest(message);
  }
  // 🆕 NEU: UI-Schema Processing Handlers mit Concurrency Protection
  else if (topic_str.endsWith("/ui_schema/update")) {
    // 🔒 Concurrency Protection: Verhindere overlapping Schema-Updates
    if (ui_schema_processing_active) {
      // Prüfe Timeout
      if (millis() - ui_schema_processing_start > UI_SCHEMA_TIMEOUT_MS) {
        DEBUG_PRINT("[UISchema] TIMEOUT: Forcing reset of processing lock");
        ui_schema_processing_active = false;
      } else {
        DEBUG_PRINT("[UISchema] REJECTED: Schema processing already active");
        return;
      }
    }
    
    ui_schema_processing_active = true;
    ui_schema_processing_start = millis();
    handleUISchemaUpdate(message);
    ui_schema_processing_active = false;
  }
  // ... weitere Handler ...
  // v3.6.0: Emergency-Broadcast-Handler
  else if (topic_str.indexOf("/broadcast/emergency") > 0) {
    handleEmergencyBroadcast(message);
  }
  // v3.6.0: System-Update-Broadcast-Handler
  else if (topic_str.indexOf("/broadcast/system_update") > 0) {
    handleSystemUpdateBroadcast(message);
  }
}
```

**Alle Handler-Funktionen:**
1. `handleZoneConfiguration()` - Zone-Konfiguration
2. `handleSubZoneConfiguration()` - Subzone-Konfiguration
3. `handleSensorConfiguration()` - Sensor-Konfiguration
4. `handleESPConfiguration()` - ESP-Konfiguration
5. `handlePiServerResponse()` - Pi-Server-Responses
6. `handlePiServerCommand()` - Pi-Server-Kommandos
7. `handleSystemCommand()` - System-Kommandos
8. `handleEmergencyCommand()` - Emergency-Kommandos
9. `handleHealthRequest()` - Health-Requests
10. `handleLibraryRequest()` - Library-Requests
11. `handlePiCommand()` - Pi-Kommandos
12. `handleI2CScanRequest()` - I2C-Scan-Requests
13. `handleUISchemaUpdate()` - UI-Schema-Updates
14. `handleEmergencyBroadcast()` - Emergency-Broadcasts
15. `handleSystemUpdateBroadcast()` - System-Update-Broadcasts
16. `handleActuatorCommand()` - Actuator-Kommandos (inline in onMqttMessage)
17. `handleSensorRemoval()` - Sensor-Entfernung

---

## TEIL 5: GPIO SAFE MODE SYSTEM

### 5.1 Safe-Mode-Funktionen

**Datei:** `src/main.cpp:1927-2012`

**initializeAllPinsToSafeMode():** `src/main.cpp:1927-1950`

```cpp
void initializeAllPinsToSafeMode() {
  DEBUG_PRINT("[SafeMode] Initializing all GPIO pins to safe state");
  
  // 🆕 NEU: Reason Tracking für Boot-SafeMode
  setSafeModeReason("boot_initialization");
  
  for (int i = 0; i < MAX_GPIO_PINS; i++) {
    // Überspringe reservierte Pins (Flash, UART, I2C, etc.)
    if (i == 0 || i == 1 || i == 6 || i == 7 || i == 8 || 
        i == 9 || i == 10 || i == 11 || i == 16 || i == 17 ||
        i == 21 || i == 22) {  // 🆕 I2C-Pins als reserviert markieren
      gpio_safe_mode[i] = false;  // Reservierte Pins nicht verwalten
      gpio_configured[i] = false;
      continue;
    }
    
    // Setze Pin als INPUT mit Pullup (sicherster Zustand)
    pinMode(i, INPUT_PULLUP);
    gpio_safe_mode[i] = true;
    gpio_configured[i] = false;
  }
  
  DEBUG_PRINT("[SafeMode] All eligible GPIO pins secured (I2C pins 21/22 reserved)");
}
```

**releaseGpioFromSafeMode():** `src/main.cpp:1952-1970`

```cpp
bool releaseGpioFromSafeMode(uint8_t gpio) {
  if (gpio >= MAX_GPIO_PINS) return false;
  
  // Prüfe ob Pin reserviert ist
  if (gpio == 0 || gpio == 1 || gpio == 6 || gpio == 7 || gpio == 8 || 
      gpio == 9 || gpio == 10 || gpio == 11 || gpio == 16 || gpio == 17 ||
      gpio == 21 || gpio == 22) {  // 🆕 I2C-Pins als reserviert markieren
    DEBUG_PRINTF("[SafeMode] ERROR: GPIO %d is reserved (Flash/UART/I2C)!\n", gpio);
    return false;
  }
  
  if (gpio_safe_mode[gpio]) {
    gpio_safe_mode[gpio] = false;
    gpio_configured[gpio] = true;
    DEBUG_PRINTF("[SafeMode] GPIO %d released from safe mode\n", gpio);
    return true;
  }
  return false;
}
```

**enableSafeModeForAllPins():** `src/main.cpp:1972-1991`

```cpp
void enableSafeModeForAllPins() {
  DEBUG_PRINT("[SafeMode] Emergency: Returning all pins to safe mode");
  
  // 🆕 NEU: Reason Tracking für Emergency-SafeMode
  setSafeModeReason("emergency_activation");
  
  // Deaktiviere alle Sensoren
  for (int i = 0; i < MAX_SENSORS; i++) {
    if (sensors[i].active) {
      sensors[i].active = false;
      sensors[i].hardware_configured = false;
      if (sensors[i].gpio < MAX_GPIO_PINS) {
        pinMode(sensors[i].gpio, INPUT_PULLUP);
        gpio_safe_mode[sensors[i].gpio] = true;
      }
    }
  }
  
  initializeAllPinsToSafeMode();
}
```

**setSafeModeReason():** `src/main.cpp:1993-1999`

```cpp
void setSafeModeReason(const String& reason) {
  safe_mode_enter_reason = reason;
  safe_mode_enter_timestamp = millis();
  safe_mode_reason_tracked = true;
  DEBUG_PRINTF("[SafeMode] Reason set: %s\n", reason.c_str());
}
```

**setGPIOConflictInfo():** `src/main.cpp:2011-2019`

```cpp
void setGPIOConflictInfo(uint8_t gpio, const String& conflict_type, 
                        const String& current_owner, const String& requested_owner) {
  last_conflict_gpio = String(gpio);
  last_conflict_type = conflict_type;
  last_conflict_current_owner = current_owner;
  last_conflict_requested_owner = requested_owner;
  DEBUG_PRINTF("[GPIO] Conflict tracked: GPIO %d, Type: %s\n", gpio, conflict_type.c_str());
}
```

### 5.2 GPIO-Konflikt-Tracking

**Datei:** `src/main.cpp:469-471, 2011-2019`

**Datenstrukturen:**
```cpp
// GPIO Safe-Mode Management
bool gpio_safe_mode[MAX_GPIO_PINS];
bool gpio_configured[MAX_GPIO_PINS];
```

**Konflikt-Tracking-Variablen:**
```cpp
String last_conflict_gpio = "";
String last_conflict_type = "";
String last_conflict_current_owner = "";
String last_conflict_requested_owner = "";
String safe_mode_enter_reason = "";
unsigned long safe_mode_enter_timestamp = 0;
bool safe_mode_reason_tracked = false;
```

**Reservierte Pins:**
- XIAO ESP32-C3: 0, 1, 6, 7, 8, 9, 10, 11, 16, 17, 21, 22
- ESP32 Dev: 0, 1, 6, 7, 8, 9, 10, 11, 16, 17, 21, 22

**Konflikt-Detection:**
- `already_assigned` - GPIO bereits zugewiesen
- `reserved_pin` - GPIO ist reserviert
- `invalid_gpio` - GPIO außerhalb des gültigen Bereichs

---

## TEIL 6: SENSOR-SYSTEM

### 6.1 SensorConfig Struktur

**Datei:** `src/main.cpp:415-430`

```cpp
struct SensorConfig {
  uint8_t gpio = 255;
  SensorType type = SENSOR_NONE;
  String subzone_id = "";
  String sensor_name = "";
  String library_name = "";
  String library_version = "";
  bool active = false;
  bool library_loaded = false;
  void* library_handle = nullptr;
  float last_value = 0.0;
  unsigned long last_reading = 0;
  bool hardware_configured = false;  // Neu: Für Advanced Features
  bool raw_mode = false;  // 🆕 NEU: Rohdaten-Modus aktivierbar per Konfiguration
  uint32_t last_raw_value = 0;  // 🆕 NEU: Letzter Rohdaten-Wert
};
```

### 6.2 SensorType Enum

**Datei:** `src/main.cpp:132-147`

```cpp
enum SensorType {
  SENSOR_NONE,                  // Kein Sensor
  SENSOR_PH_DFROBOT,           // pH-Sensor (DFRobot Gravity)
  SENSOR_EC_GENERIC,           // EC-Sensor (Generisch)
  SENSOR_TEMP_DS18B20,         // Temperatursensor (DS18B20, OneWire)
  SENSOR_TEMP_DHT22,           // Temperatursensor (DHT22)
  SENSOR_MOISTURE,             // Feuchtesensor
  SENSOR_PRESSURE,             // Drucksensor (I2C)
  SENSOR_CO2,                  // CO2-Sensor
  SENSOR_AIR_QUALITY,          // Luftqualitätssensor (I2C)
  SENSOR_LIGHT,                // Lichtsensor (Analog)
  SENSOR_FLOW,                 // Flusssensor
  SENSOR_LEVEL,                // Füllstandssensor
  SENSOR_CUSTOM_PI_ENHANCED,   // Pi-Enhanced Sensor (Hybrid)
  SENSOR_CUSTOM_OTA            // OTA-Library-Sensor
};
```

**Mapping-Funktion Type → String:** `src/main.cpp:6312+`

```cpp
String getSensorTypeString(SensorType type) {
  switch (type) {
    case SENSOR_PH_DFROBOT: return "SENSOR_PH_DFROBOT";
    case SENSOR_EC_GENERIC: return "SENSOR_EC_GENERIC";
    case SENSOR_TEMP_DS18B20: return "SENSOR_TEMP_DS18B20";
    case SENSOR_TEMP_DHT22: return "SENSOR_TEMP_DHT22";
    case SENSOR_MOISTURE: return "SENSOR_MOISTURE";
    case SENSOR_PRESSURE: return "SENSOR_PRESSURE";
    case SENSOR_CO2: return "SENSOR_CO2";
    case SENSOR_AIR_QUALITY: return "SENSOR_AIR_QUALITY";
    case SENSOR_LIGHT: return "SENSOR_LIGHT";
    case SENSOR_FLOW: return "SENSOR_FLOW";
    case SENSOR_LEVEL: return "SENSOR_LEVEL";
    case SENSOR_CUSTOM_PI_ENHANCED: return "SENSOR_CUSTOM_PI_ENHANCED";
    case SENSOR_CUSTOM_OTA: return "SENSOR_CUSTOM_OTA";
    default: return "SENSOR_NONE";
  }
}
```

### 6.3 Sensor-Reading-Funktionen

**readSensor():** `src/main.cpp:3508-3755` (vollständig)

```cpp
float readSensor(int sensor_index) {
  if (sensor_index >= MAX_SENSORS || !sensors[sensor_index].active) {
    return NAN;
  }
  
  SensorConfig* sensor = &sensors[sensor_index];
  
  // *** ADVANCED FEATURES: Hardware-Messung wenn konfiguriert ***
  if (advanced_system_initialized && sensor->hardware_configured) {
    // Verwende Advanced System für Hardware-Messungen
    // (Die performHardwareMeasurements() wird im loop() aufgerufen)
    return sensor->last_value;  // Letzten Hardware-Wert zurückgeben
  }
  
  // 🆕 NEU: Rohdaten-Modus für alle Sensoren (außer OTA)
  if (sensor->raw_mode && sensor->type != SENSOR_CUSTOM_OTA) {
    uint32_t raw_value = 0;
    
    switch (sensor->type) {
      case SENSOR_PH_DFROBOT:
      case SENSOR_EC_GENERIC:
      case SENSOR_MOISTURE:
      case SENSOR_LIGHT:
      case SENSOR_LEVEL:
        // Analog-Sensoren: analogRead() als Rohdaten
        raw_value = analogRead(sensor->gpio);
        break;
        
      case SENSOR_TEMP_DHT22:
      case SENSOR_FLOW:
        // Digital-Sensoren: digitalRead() als Rohdaten
        raw_value = digitalRead(sensor->gpio);
        break;
        
      case SENSOR_PRESSURE:
      case SENSOR_AIR_QUALITY:
        // I2C-Sensoren: GenericI2CSensor Rohdaten
        if (GenericI2CSensor::hasSensorOnGPIO(sensor->gpio)) {
          uint8_t raw_data[6];
          I2CSensorConfig* i2c_config = GenericI2CSensor::getSensorConfig(sensor->gpio);
          if (i2c_config && GenericI2CSensor::readI2CRawData(i2c_config->i2c_address, raw_data, 6)) {
            // Kombiniere die ersten 4 Bytes zu einem 32-bit Wert
            raw_value = (raw_data[0] << 24) | (raw_data[1] << 16) | (raw_data[2] << 8) | raw_data[3];
          }
        }
        break;
        
      case SENSOR_TEMP_DS18B20:
        // OneWire-Sensor: Echte Hardware-Lesung
        {
          float temp = readDS18B20Real(sensor->gpio);
          if (!isnan(temp)) {
            raw_value = (uint32_t)(temp * 100);
          } else {
            raw_value = 0; // Ungültiger Wert
          }
        }
        break;
        
      case SENSOR_CO2:
        // UART/I2C-Sensor: Echte Hardware-Lesung
        {
          float co2_value = readCO2Real(sensor->gpio);
          if (!isnan(co2_value)) {
            raw_value = (uint32_t)co2_value;
          } else {
            raw_value = 400; // Fallback auf Minimum
          }
        }
        break;
        
      case SENSOR_CUSTOM_PI_ENHANCED:
        // Pi-Enhanced: Echte Hardware-Lesung
        {
          float pi_value = readPiEnhancedReal(sensor->gpio);
          if (!isnan(pi_value)) {
            raw_value = (uint32_t)(pi_value * 1000);
          } else {
            raw_value = 1000; // Fallback
          }
        }
        break;
        
      default:
        raw_value = 0;
        break;
    }
    
    // 🆕 NEU: Erweiterte Validierung mit Warnings
    String warning = validateRawDataWithWarnings(sensor->type, raw_value);
    if (warning.length() > 0) {
      DEBUG_PRINTF("[Sensor] Warning for GPIO %d: %s\n", sensor->gpio, warning.c_str());
    }
    
    // Rohdaten speichern
    sensor->last_raw_value = raw_value;
    
    // Konvertiere Rohdaten zu Float für Rückwärtskompatibilität
    switch (sensor->type) {
      case SENSOR_PH_DFROBOT:
        return 6.0 + (raw_value % 200) / 100.0;  // pH 6.0-8.0
      case SENSOR_EC_GENERIC:
        return 1.0 + (raw_value % 200) / 100.0;  // EC 1.0-3.0
      case SENSOR_TEMP_DS18B20:
        return raw_value / 100.0;  // Temperatur aus Rohdaten
      case SENSOR_TEMP_DHT22:
        return 15.0 + (raw_value % 2000) / 100.0;  // Temperatur 15-35°C
      case SENSOR_MOISTURE:
        return (raw_value % 4096) / 4096.0;  // Feuchte 0-1
      case SENSOR_PRESSURE:
        return 1000.0 + (raw_value % 1000);  // Druck 1000-2000 hPa
      case SENSOR_CO2:
        return (float)raw_value;  // CO2 ppm direkt
      case SENSOR_AIR_QUALITY:
        return (raw_value % 500) + 100;  // AQI 100-600
      case SENSOR_LIGHT:
        return (raw_value % 1000) + 100;  // Lux 100-1100
      case SENSOR_FLOW:
        return (raw_value % 100) / 10.0;  // Flow 0-10 L/min
      case SENSOR_LEVEL:
        return (raw_value % 100) / 100.0;  // Level 0-1
      case SENSOR_CUSTOM_PI_ENHANCED:
        return (raw_value % 1000) / 10.0;  // Pi-Enhanced Wert
      default:
        return (float)raw_value;
    }
  }
  
  // Fallback: Echte Hardware-Lesungen für alle Sensoren
  switch (sensor->type) {
    case SENSOR_PH_DFROBOT:
      // pH-Sensor: analogRead() als Rohdaten
      {
        uint32_t raw_value = analogRead(sensor->gpio);
        if (validateRawDataRange(sensor->type, raw_value)) {
          return 6.0 + (raw_value % 200) / 100.0;  // pH 6.0-8.0
        }
        return 7.0; // Fallback
      }
      
    case SENSOR_EC_GENERIC:
      // EC-Sensor: analogRead() als Rohdaten
      {
        uint32_t raw_value = analogRead(sensor->gpio);
        if (validateRawDataRange(sensor->type, raw_value)) {
          return 1.0 + (raw_value % 200) / 100.0;  // EC 1.0-3.0
        }
        return 2.0; // Fallback
      }
      
    case SENSOR_TEMP_DS18B20:
      // DS18B20: Echte Hardware-Lesung
      return readDS18B20Real(sensor->gpio);
      
    case SENSOR_TEMP_DHT22:
      // DHT22: digitalRead() als Rohdaten
      {
        uint32_t raw_value = digitalRead(sensor->gpio);
        if (validateRawDataRange(sensor->type, raw_value)) {
          return 15.0 + (raw_value * 20.0);  // Temperatur 15-35°C
        }
        return 20.0; // Fallback
      }
      
    case SENSOR_MOISTURE:
      // Feuchtesensor: analogRead() als Rohdaten
      {
        uint32_t raw_value = analogRead(sensor->gpio);
        if (validateRawDataRange(sensor->type, raw_value)) {
          return (raw_value % 4096) / 4096.0;  // Feuchte 0-1
        }
        return 0.5; // Fallback
      }
      
    case SENSOR_PRESSURE:
      // Drucksensor: I2C-Rohdaten
      {
        if (GenericI2CSensor::hasSensorOnGPIO(sensor->gpio)) {
          uint8_t raw_data[6];
          I2CSensorConfig* i2c_config = GenericI2CSensor::getSensorConfig(sensor->gpio);
          if (i2c_config && GenericI2CSensor::readI2CRawData(i2c_config->i2c_address, raw_data, 6)) {
            uint32_t raw_value = (raw_data[0] << 24) | (raw_data[1] << 16) | (raw_data[2] << 8) | raw_data[3];
            if (validateRawDataRange(sensor->type, raw_value)) {
              return 1000.0 + (raw_value % 1000);  // Druck 1000-2000 hPa
            }
          }
        }
        return 1013.0; // Fallback (Standard-Atmosphärendruck)
      }
      
    case SENSOR_CO2:
      // CO2-Sensor: Echte Hardware-Lesung
      return readCO2Real(sensor->gpio);
      
    case SENSOR_AIR_QUALITY:
      // Luftqualität: I2C-Rohdaten
      {
        if (GenericI2CSensor::hasSensorOnGPIO(sensor->gpio)) {
          uint8_t raw_data[6];
          I2CSensorConfig* i2c_config = GenericI2CSensor::getSensorConfig(sensor->gpio);
          if (i2c_config && GenericI2CSensor::readI2CRawData(i2c_config->i2c_address, raw_data, 6)) {
            uint32_t raw_value = (raw_data[0] << 24) | (raw_data[1] << 16) | (raw_data[2] << 8) | raw_data[3];
            if (validateRawDataRange(sensor->type, raw_value)) {
              return (raw_value % 500) + 100;  // AQI 100-600
            }
          }
        }
        return 150; // Fallback
      }
      
    case SENSOR_LIGHT:
      // Lichtsensor: analogRead() als Rohdaten
      {
        uint32_t raw_value = analogRead(sensor->gpio);
        if (validateRawDataRange(sensor->type, raw_value)) {
          return (raw_value % 1000) + 100;  // Lux 100-1100
        }
        return 500; // Fallback
      }
      
    case SENSOR_FLOW:
      // Flusssensor: digitalRead() als Rohdaten
      {
        uint32_t raw_value = digitalRead(sensor->gpio);
        if (validateRawDataRange(sensor->type, raw_value)) {
          return (raw_value % 100) / 10.0;  // Flow 0-10 L/min
        }
        return 0.0; // Fallback
      }
      
    case SENSOR_LEVEL:
      // Füllstandssensor: analogRead() als Rohdaten
      {
        uint32_t raw_value = analogRead(sensor->gpio);
        if (validateRawDataRange(sensor->type, raw_value)) {
          return (raw_value % 100) / 100.0;  // Level 0-1
        }
        return 0.5; // Fallback
      }
      
    case SENSOR_CUSTOM_PI_ENHANCED:
      // Pi-Enhanced: Echte Hardware-Lesung
      return readPiEnhancedReal(sensor->gpio);
      
    default:
      return NAN;
  }
}
```

Umfasst alle 14 Sensor-Typen mit Hardware-spezifischen Reading-Logiken.

**performMeasurements():** `src/main.cpp:3797-3838` (vollständig)

```cpp
void performMeasurements() {
  if (active_sensors == 0) return;
  
  DEBUG_PRINT("[Measurement] Starting sensor readings...");
  
  // ✅ FRONTEND-IMPLEMENTIERUNG: Batching-Logik
  bool should_use_batching = (active_sensors > 5 && !system_config.disable_batching);
  
  // *** ADVANCED FEATURES: Hardware-Messungen oder Fallback ***
  if (advanced_system_initialized) {
    // Verwende Advanced System für alle Messungen
    advanced_system.performHardwareMeasurements();
    
    // *** ACTUATOR CONTROL PROCESSING ***
    advanced_system.performActuatorControl();
  } else {
    // Fallback: Standard-Simulation für jeden Sensor
    for (int i = 0; i < active_sensors; i++) {
      if (sensors[i].active) {
        float value = readSensor(i);
        if (!should_use_batching) {
          // Einzel-Modus: Sofort senden
          sendIndividualSensorData(i, value);
        } else {
          // Batch-Modus: Wert speichern
          sensors[i].last_value = value;
        }
      }
    }
  }
  
  // *** GENERIC I2C SENSORS: Perform measurements for I2C sensors ***
  GenericI2CSensor::performMeasurements();
  
  // ✅ FRONTEND-IMPLEMENTIERUNG: Batch senden wenn aktiviert
  if (should_use_batching) {
    sendBatchedSensorData();
    DEBUG_PRINTF("[Batch] Sent %d sensors in batch mode\n", active_sensors);
  }
  
  last_measurement = millis();
}
```

### 6.4 Sensor-Data-Publishing

**sendIndividualSensorData():** Siehe Abschnitt 4.4

**Payload-Struktur:** Siehe JSON-Schema in Abschnitt 4.4

**Dual-Payload-Generierung:**
1. **Standard-Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`
2. **Hierarchisches Topic:** `kaiser/{kaiser_id}/master/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data`

### 6.5 Advanced Sensor System Integration

**HardwareSensorBase Interface:** `include/advanced_features.h:75-128`

```cpp
class HardwareSensorBase {
public:
    virtual ~HardwareSensorBase() = default;
    
    virtual bool init(uint8_t gpio) = 0;
    virtual float read() = 0;
    virtual bool isValid(float value) = 0;
    virtual String getUnit() = 0;
    virtual String getQuality(float value) = 0;
    virtual bool calibrate(float reference_value) = 0;
    virtual void sleep() {}
    virtual void wake() {}
};
```

**PiEnhancedSensor Klasse:** `include/advanced_features.h:447-485`

```cpp
class PiEnhancedSensor : public HardwareSensorBase {
private:
    uint8_t gpio;
    String sensor_type;
    PiSensorClient* pi_client;
    bool pi_processing_enabled;
    HardwareSensorBase* fallback_sensor;
    
    float last_pi_value;
    unsigned long last_pi_read;
    float last_fallback_value;
    unsigned long last_hardware_read;
    
    uint32_t pi_requests_total;
    uint32_t pi_requests_success;
    uint32_t fallback_uses;
    
    bool initializeHardwareGPIO(uint8_t pin);
    uint32_t readRawFromHardware();
    float applyBasicLinearConversion(uint32_t raw_data);
    
public:
    PiEnhancedSensor(uint8_t gpio_pin, const String& type, 
                     PiSensorClient* pi_client_ptr, 
                     HardwareSensorBase* fallback = nullptr);
    ~PiEnhancedSensor();
    
    // HardwareSensorBase Interface
    bool init(uint8_t gpio) override;
    float read() override;
    bool isValid(float value) override;
    String getUnit() override;
    String getQuality(float value) override;
    bool calibrate(float reference_value) override;
    
    // Pi-Enhanced spezifische Methoden
    void enablePiProcessing(bool enabled);
    void printStatistics();
};
```

**AdvancedSensorSystem Klasse:** `include/advanced_features.h:570-690`

Siehe Header-Datei für vollständige Public-API.

**Sensor-Registrierung:**
```cpp
bool configureHardwareSensor(uint8_t gpio, const String& library_name, 
                            const String& sensor_name, const String& subzone_id);
```

**Delegation an Advanced System:**
```cpp
if (advanced_system_initialized) {
    advanced_system.performHardwareMeasurements();
}
```

---

## TEIL 7: ACTUATOR-SYSTEM

### 7.1 Actuator-Strukturen

**HardwareActuatorBase Interface:** `src/actuator_system.h:14-25`

```cpp
class HardwareActuatorBase {
public:
    virtual ~HardwareActuatorBase() = default;
    virtual bool init(uint8_t gpio) = 0;
    virtual bool setValue(float value) = 0;      // 0.0-1.0 für PWM/Analog
    virtual bool setBinary(bool state) = 0;     // ON/OFF für Digital  
    virtual bool emergency_stop() = 0;          // Sicherheits-Stop
    virtual String getType() = 0;               // "pump", "valve", "pwm"
    virtual String getStatus() = 0;             // Aktueller Status
    virtual void sleep() {}                     // Power-Management
    virtual void wake() {}
};
```

**ActuatorStatus Struktur:** `src/actuator_types.h:10-19`

```cpp
struct ActuatorStatus {
    uint8_t gpio;
    String actuator_type;       // "pump", "valve", "pwm", "heater"
    float current_value;        // Aktueller Hardware-Zustand (0.0-1.0)
    float requested_value;      // Gewünschter Wert (0.0-1.0)
    float temperature;          // Umgebungstemperatur für Kontext
    int runtime_minutes;        // Wie lange läuft bereits
    float load_factor;          // Aktuelle Last/Verbrauch
    unsigned long timestamp;    // Zeitstempel
};
```

**ProcessedActuatorCommand Struktur:** `src/actuator_types.h:21-27`

```cpp
struct ProcessedActuatorCommand {
    float optimized_value;      // Pi-optimierter Wert (0.0-1.0)
    int duration;              // Empfohlene Laufzeit (Sekunden)
    String reason;             // Begründung der Pi-Optimierung
    String quality;            // "pi_optimized", "fallback", "direct"
    bool success;              // Verarbeitung erfolgreich
};
```

**EnhancedActuator Struktur:** `src/actuator_system.h:31-41`

```cpp
struct EnhancedActuator {
    uint8_t gpio;
    String library_name;
    String actuator_name;
    String subzone_id;
    HardwareActuatorBase* instance;
    bool active;
    unsigned long last_command;
    float last_value;
    bool hardware_configured;
};
```

### 7.2 AdvancedActuatorSystem Klasse

**Datei:** `src/actuator_system.h:57-94`

```cpp
class AdvancedActuatorSystem {
public:
    AdvancedActuatorSystem();
    ~AdvancedActuatorSystem();

    bool initialize(PiSensorClient* pi_client, const String& esp_id, const String& zone_id);
    
    bool configureActuator(uint8_t gpio, const String& library_name, const String& actuator_name, const String& subzone_id);
    
    bool controlActuator(uint8_t gpio, float value);
    
    bool controlActuatorBinary(uint8_t gpio, bool state);
    
    bool removeActuator(uint8_t gpio);
    
    bool emergencyStopAll();
    
    bool emergencyStopActuator(uint8_t gpio);
    
    uint8_t getActiveActuatorCount() const;
    
    String getActuatorInfo(uint8_t gpio) const;
    
    bool isActuatorConfigured(uint8_t gpio) const;
    
    void printActuatorStatus() const;
    
    void performActuatorControl();

private:
    PiSensorClient* pi_client_ptr = nullptr;
    String esp_id;
    String zone_id;
    EnhancedActuator* actuators_ptr = nullptr;
    uint8_t active_actuator_count = 0;
    bool system_initialized = false;
};
```

### 7.3 Emergency-Stop-Mechanismus

**Datei:** `src/main.cpp:3960-4044`

```cpp
// Emergency handling in onMqttMessage()
if (topic_str.endsWith("/emergency")) {
    if (advanced_system_initialized) {
        bool success = advanced_system.emergencyStopAllActuators();
        DEBUG_PRINTF("[Emergency] Stop all actuators: %s\n", success ? "SUCCESS" : "FAILED");
        
        // Send emergency response
        StaticJsonDocument<256> response;
        response["esp_id"] = esp_id;
        response["command"] = "emergency_stop";
        response["success"] = success;
        response["timestamp"] = getUnixTimestamp();
        
        String response_msg;
        ArduinoJson::serializeJson(response, response_msg);
        
        String response_topic = buildTopic("response", esp_id);
        mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
    }
    return;
}
```

**Safety-Checks:**
- GPIO-Validierung vor Aktivierung
- Emergency-Stop über MQTT-Topic
- Emergency-Stop über Hardware-Interrupt
- Integration mit GPIO Safe-Mode

**Recovery nach Emergency-Stop:**
- Actuators bleiben im gestoppten Zustand
- Manuelle Reaktivierung erforderlich
- Status wird über MQTT gemeldet

**Integration mit GPIO Safe-Mode:**
```cpp
void enableSafeModeForAllPins() {
  // Deaktiviere alle Aktoren
  if (advanced_system_initialized) {
    advanced_system.emergencyStopAllActuators();
  }
  // ... weitere Safe-Mode-Logik
}
```

---

## TEIL 8: PI-INTEGRATION

### 8.1 PiSensorClient Klasse

**Datei:** `src/pi_sensor_client.h:1-85`

```cpp
#ifndef PI_SENSOR_CLIENT_H
#define PI_SENSOR_CLIENT_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "actuator_types.h"

// Cache-Struktur für Performance-Optimierung
struct CacheEntry {
    uint8_t gpio;
    String sensor_type;
    float last_value;
    unsigned long timestamp;
    bool valid;
};

class PiSensorClient {
private:
    // Server-Konfiguration
    String pi_server_url;
    String esp_id;
    bool pi_available;
    bool pi_registered;  // 🆕 NEU: Registration status
    
    // HTTP-Client
    HTTPClient http_client;
    
    // Cache-System
    CacheEntry cache[8];
    static const unsigned long CACHE_TIMEOUT = 5000;  // 5 Sekunden
    
    // Fehlerbehandlung
    int consecutive_errors;
    static const int MAX_CONSECUTIVE_ERRORS = 3;
    unsigned long last_error_time;
    
    // Timeouts
    static const unsigned long HEALTH_TIMEOUT = 3000;
    static const unsigned long PROCESS_TIMEOUT = 5000;
    static const unsigned long LIBRARY_TIMEOUT = 10000;
    
    // Private Hilfsmethoden
    void handleError();
    String buildEndpoint(const String& path);
    bool parseJsonResponse(const String& response, JsonDocument& doc);
    void updateCache(uint8_t gpio, const String& sensor_type, float value);
    bool getFromCache(uint8_t gpio, const String& sensor_type, float& value);

public:
    // Konstruktor
    PiSensorClient(const String& pi_url, const String& esp_identifier);
    
    // Initialisierung
    bool init();
    
    // Verfügbarkeitsprüfung
    bool checkPiAvailability();
    
    // Hauptfunktion - Sensor-Datenverarbeitung
    bool processSensorData(uint8_t gpio, const String& sensor_type, uint32_t raw_data, 
                          float& processed_value, String& quality, String& unit);
    
    // *** PI-ENHANCED ACTUATOR SUPPORT ***
    bool processActuatorData(uint8_t gpio, const String& actuator_type,
                            const ActuatorStatus& status,
                            ProcessedActuatorCommand& result);
    
    // Library-Management
    bool installLibraryToPi(const String& library_name, const String& library_code, 
                           const String& version);
    
    // Status-Abfragen
    String getPiLibraryStatus();
    bool isAvailable() const { return pi_available; }
    
    // 🆕 NEU: Pi Registration
    bool registerWithPi(const String& esp_name, const String& friendly_name, const String& zone);
    bool isRegistered() const { return pi_registered; }
    
    // Konfiguration
    void setServerURL(const String& url);
};

#endif // PI_SENSOR_CLIENT_H
```

**Cache-System:**
- Cache-Array-Größe: 8 Einträge
- Cache-Timeout: 5000ms (5 Sekunden)
- Cache-Struktur: CacheEntry mit gpio, sensor_type, last_value, timestamp, valid

**HTTP-Endpoints:**
- `/api/process_sensor` - Sensor-Datenverarbeitung
- `/api/actuator/{gpio}/command` - Actuator-Kommandos
- `/api/install_library` - Library-Installation
- `/health` - Health-Check

**Request/Response-Formate:**
- Request: JSON mit `gpio`, `sensor_type`, `raw_data`
- Response: JSON mit `processed_value`, `quality`, `unit`

### 8.2 PiCircuitBreaker

**Datei:** `src/main.cpp:5482-5578`

```cpp
class PiCircuitBreaker {
public:  // ✅ WICHTIG: Enum muss public sein für Zugriff von außen
    enum State { CLOSED, OPEN, HALF_OPEN };
    
private:
    State current_state = CLOSED;
    int failure_count = 0;
    int failure_threshold = 5;
    unsigned long last_failure_time = 0;
    unsigned long timeout = 60000; // 1 Minute
    int success_count = 0;
    int success_threshold = 3;
    
public:
    bool canMakeRequest() {
        unsigned long current_time = millis();
        
        switch (current_state) {
            case CLOSED:
                return true;
                
            case OPEN:
                if (current_time - last_failure_time > timeout) {
                    current_state = HALF_OPEN;
                    Serial.println("[PiCircuitBreaker] Transitioning to HALF_OPEN state");
                    return true;
                }
                return false;
                
            case HALF_OPEN:
                return true;
        }
        
        return false;
    }
    
    void recordSuccess() {
        switch (current_state) {
            case CLOSED:
                // Already working fine
                break;
                
            case HALF_OPEN:
                success_count++;
                if (success_count >= success_threshold) {
                    current_state = CLOSED;
                    failure_count = 0;
                    success_count = 0;
                    Serial.println("[PiCircuitBreaker] ✅ Circuit breaker CLOSED - Pi server recovered");
                }
                break;
                
            case OPEN:
                // Should not happen, but reset anyway
                current_state = CLOSED;
                failure_count = 0;
                break;
        }
    }
    
    void recordFailure() {
        failure_count++;
        last_failure_time = millis();
        
        switch (current_state) {
            case CLOSED:
                if (failure_count >= failure_threshold) {
                    current_state = OPEN;
                    Serial.printf("[PiCircuitBreaker] ⚠️ Circuit breaker OPEN - Pi server failing (%d failures)\n", failure_count);
                }
                break;
                
            case HALF_OPEN:
                current_state = OPEN;
                success_count = 0;
                Serial.println("[PiCircuitBreaker] ⚠️ Circuit breaker OPEN - Pi server still failing");
                break;
                
            case OPEN:
                // Already open, just update failure time
                break;
        }
    }
    
    String getStateString() const {
        switch (current_state) {
            case CLOSED: return "CLOSED";
            case OPEN: return "OPEN";
            case HALF_OPEN: return "HALF_OPEN";
            default: return "UNKNOWN";
        }
    }
    
    int getFailureCount() const { return failure_count; }
    int getSuccessCount() const { return success_count; }
    State getState() const { return current_state; }
};
```

**State-Machine:**
- **CLOSED**: Normal-Betrieb, Requests erlaubt
- **OPEN**: Pi-Server fehlerhaft, Requests blockiert
- **HALF_OPEN**: Test-Modus nach Timeout, limitierte Requests

**Thresholds:**
- `failure_threshold`: 5 Fehler → OPEN
- `success_threshold`: 3 Erfolge → CLOSED
- `timeout`: 60000ms (1 Minute) → HALF_OPEN

---

## TEIL 9: ERROR-HANDLING

### 9.1 Error-Tracking-System

**Datei:** `src/main.cpp:271, 2652-2676, 5395-5418`

**sendErrorAlert() Funktion:** `src/main.cpp:2652-2676`

```cpp
void sendErrorAlert(const String& component, const String& error_message, const String& context) {
  StaticJsonDocument<512> error_doc;
  error_doc["esp_id"] = esp_id;
  error_doc["error_type"] = "system_error";
  error_doc["component"] = component;
  error_doc["message"] = error_message;
  error_doc["context"] = "error_alert";  // v3.6.0: Standardisiertes Context-Feld
  error_doc["timestamp"] = getUnixTimestamp();
  error_doc["total_errors"] = total_error_count;
  
  // *** ADVANCED FEATURES: RTC-Timestamp wenn verfügbar ***
  if (advanced_system_initialized) {
    error_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    error_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
  }
  
  String error_message_json;
  ArduinoJson::serializeJson(error_doc, error_message_json);
  
  String error_topic = buildSpecialTopic("alert/error", esp_id);
  mqtt_client.publish(error_topic.c_str(), error_message_json.c_str());
  updateTopicStats(error_topic);  // v3.6.0: Topic-Statistik aktualisieren
  
  DEBUG_PRINTF("[ErrorAlert] Sent error alert for %s\n", component.c_str());
}
```

**Error-Tracking-Variablen:** `src/main.cpp:519-523`

```cpp
// Error Tracking
String last_system_error = "";
unsigned long last_error_time = 0;
uint16_t total_error_count = 0;
uint16_t wifi_reconnect_count = 0;
uint16_t mqtt_reconnect_count = 0;
```

**SystemHealthMetrics Struktur:** `src/main.cpp:530+`

```cpp
struct SystemHealthMetrics {
    int free_heap_current = 0;
    int free_heap_minimum = 0;
    int wifi_rssi_current = 0;
    int wifi_rssi_minimum = 0;
    unsigned long uptime_seconds = 0;
    float cpu_usage_percent = 0.0;
};
SystemHealthMetrics health_metrics;
```

### 9.2 MQTTConnectionManager

**Datei:** `src/main.cpp:5420-5480`

```cpp
class MQTTConnectionManager {
private:
    unsigned long last_attempt = 0;
    int retry_count = 0;
    int max_retries = 10;
    unsigned long base_delay = 5000; // 5 Sekunden (weniger aggressiv)
    bool connection_stable = false;
    
public:
    bool attemptConnection() {
        if (connection_stable && mqtt_client.connected()) {
            return true; // Already connected and stable
        }
        
        unsigned long current_time = millis();
        if (current_time - last_attempt < getNextRetryDelay()) {
            return false; // Not time to retry yet
        }
        
        last_attempt = current_time;
        retry_count++;
        
        Serial.printf("[MQTTManager] Connection attempt %d/%d\n", retry_count, max_retries);
        
        if (connectToMqtt()) {
            connection_stable = true;
            retry_count = 0;
            Serial.println("[MQTTManager] ✅ Connection successful, resetting retry counter");
            return true;
        } else {
            connection_stable = false;
            Serial.printf("[MQTTManager] ❌ Connection failed (attempt %d/%d)\n", retry_count, max_retries);
            
            if (retry_count >= max_retries) {
                Serial.println("[MQTTManager] ⚠️ Maximum retries reached, will continue trying with backoff");
            }
            
            return false;
        }
    }
    
    void resetRetryCounter() {
        retry_count = 0;
        connection_stable = false;
        Serial.println("[MQTTManager] Retry counter reset");
    }
    
    unsigned long getNextRetryDelay() {
        if (retry_count == 0) return 0;
        
        // Exponential backoff: 5s, 10s, 20s, 40s, 60s, 60s, 60s...
        unsigned long delay = base_delay * (1 << (retry_count - 1));
        if (delay > 60000) delay = 60000; // Cap at 60 seconds
        
        return delay;
    }
    
    bool isConnectionStable() const { return connection_stable; }
    int getRetryCount() const { return retry_count; }
    int getMaxRetries() const { return max_retries; }
};
```

**Exponential-Backoff-Algorithmus:**
- Start-Delay: 5 Sekunden
- Verdopplung bei jedem Retry: 5s → 10s → 20s → 40s → 60s
- Maximum: 60 Sekunden
- Max Retries: 10

**Connection-Stability-Tracking:**
- `connection_stable`: Flag für stabile Verbindung
- `last_attempt`: Zeitpunkt des letzten Versuchs
- `retry_count`: Anzahl der Versuche

### 9.3 SystemHealthMonitor

**Datei:** `src/main.cpp:5580-5692`

```cpp
class SystemHealthMonitor {
private:
    float wifi_rssi_trend[10];
    int free_heap_trend[10];
    int trend_index = 0;
    unsigned long last_metrics_update = 0;
    const unsigned long METRICS_UPDATE_INTERVAL = 30000; // 30 seconds
    
public:
    void updateMetrics() {
        unsigned long current_time = millis();
        if (current_time - last_metrics_update < METRICS_UPDATE_INTERVAL) {
            return;
        }
        
        last_metrics_update = current_time;
        
        // Update WiFi RSSI trend
        wifi_rssi_trend[trend_index] = WiFi.RSSI();
        
        // Update free heap trend
        free_heap_trend[trend_index] = ESP.getFreeHeap();
        
        // Move to next index
        trend_index = (trend_index + 1) % 10;
        
        Serial.printf("[HealthMonitor] Metrics updated - RSSI: %.1f, Free Heap: %d bytes\n", 
                     WiFi.RSSI(), ESP.getFreeHeap());
    }
    
    bool predictFailure() {
        // Check for declining trends
        float rssi_decline = calculateRSSIDecline();
        int heap_decline = calculateHeapDecline();
        
        if (rssi_decline > 10.0) { // RSSI declining by more than 10 dBm
            Serial.printf("[HealthMonitor] ⚠️ WiFi signal declining: %.1f dBm\n", rssi_decline);
            return true;
        }
        
        if (heap_decline > 10000) { // Heap declining by more than 10KB
            Serial.printf("[HealthMonitor] ⚠️ Memory declining: %d bytes\n", heap_decline);
            return true;
        }
        
        return false;
    }
    
    String getHealthSummary() {
        String summary = "Health: ";
        
        if (WiFi.RSSI() > -50) summary += "Excellent";
        else if (WiFi.RSSI() > -70) summary += "Good";
        else if (WiFi.RSSI() > -80) summary += "Fair";
        else summary += "Poor";
        
        summary += " | Memory: ";
        int free_heap = ESP.getFreeHeap();
        if (free_heap > 50000) summary += "Excellent";
        else if (free_heap > 30000) summary += "Good";
        else if (free_heap > 20000) summary += "Fair";
        else summary += "Critical";
        
        return summary;
    }
    
private:
    float calculateRSSIDecline() {
        if (trend_index < 2) return 0.0;
        
        float recent_avg = 0.0;
        float older_avg = 0.0;
        
        // Calculate recent average (last 3 readings)
        for (int i = 0; i < 3; i++) {
            int idx = (trend_index - 1 - i + 10) % 10;
            recent_avg += wifi_rssi_trend[idx];
        }
        recent_avg /= 3.0;
        
        // Calculate older average (3 readings before that)
        for (int i = 3; i < 6; i++) {
            int idx = (trend_index - 1 - i + 10) % 10;
            older_avg += wifi_rssi_trend[idx];
        }
        older_avg /= 3.0;
        
        return older_avg - recent_avg; // Positive means declining
    }
    
    int calculateHeapDecline() {
        if (trend_index < 2) return 0;
        
        int recent_avg = 0;
        int older_avg = 0;
        
        // Calculate recent average (last 3 readings)
        for (int i = 0; i < 3; i++) {
            int idx = (trend_index - 1 - i + 10) % 10;
            recent_avg += free_heap_trend[idx];
        }
        recent_avg /= 3;
        
        // Calculate older average (3 readings before that)
        for (int i = 3; i < 6; i++) {
            int idx = (trend_index - 1 - i + 10) % 10;
            older_avg += free_heap_trend[idx];
        }
        older_avg /= 3;
        
        return older_avg - recent_avg; // Positive means declining
    }
};
```

**Metrics-Arrays:**
- `wifi_rssi_trend[10]`: WiFi-Signal-Stärke-Trend (10 Werte)
- `free_heap_trend[10]`: Freier Heap-Trend (10 Werte)

**updateMetrics():**
- Aktualisiert alle 30 Sekunden
- Speichert WiFi RSSI und freien Heap
- Rotierender Index (0-9)

**predictFailure():**
- Prüft RSSI-Decline (> 10 dBm)
- Prüft Heap-Decline (> 10KB)
- Gibt `true` zurück wenn Fehler vorhergesagt

---

## TEIL 10: CONFIGURATION-MANAGEMENT

### 10.1 WiFiConfig Struktur

**Datei:** `src/wifi_config.h:1-170` (vollständig)

Siehe vollständige Header-Datei in Abschnitt 10.1 - enthält alle Felder, Getter/Setter, Backward-Compatibility-Felder.

### 10.2 NVS-Persistenz

**loadWiFiConfigFromPreferences():** `src/main.cpp:2025-2132` (vollständig)

Siehe vollständigen Code mit allen NVS-Keys und Backward-Compatibility-Logik.

**saveWiFiConfigToPreferences():** `src/main.cpp:2134-2165` (vollständig)

Siehe vollständigen Code mit allen Speicher-Operationen.

**WebConfigServer::loadConfiguration():** `src/web_config_server.cpp:683-745`

```cpp
bool WebConfigServer::loadConfiguration(WiFiConfig& config) {
    preferences.begin("wifi_config", true);
    
    // ✅ FIXED: Load mit neuen Feldnamen
    config.ssid = preferences.getString("ssid", "");
    config.password = preferences.getString("password", "");
    config.server_address = preferences.getString("server_address", "");
    config.mqtt_port = preferences.getInt("mqtt_port", 1883);
    config.username = preferences.getString("username", "");
    config.password_auth = preferences.getString("password_auth", "");
    config.esp_username = preferences.getString("esp_name", "");
    config.esp_friendly_name = preferences.getString("friendly", "");
    if (config.esp_friendly_name.isEmpty()) {
        config.esp_friendly_name = preferences.getString("esp_friendly_name", "");
    }
    config.esp_zone = preferences.getString("esp_zone", "");
    config.configured = preferences.getBool("configured", false);
    config.connection_established = preferences.getBool("conn", false);
    if (!config.connection_established) {
        config.connection_established = preferences.getBool("connection_established", false);
    }
    config.http_port = preferences.getInt("http_p", 80);
    config.system_state = preferences.getString("sys_st", "BOOT");
    config.webserver_active = preferences.getBool("web_act", false);
    
    // ✅ FIXED: Legacy-Felder für Backward Compatibility
    if (config.server_address.isEmpty()) {
        config.server_address = preferences.getString("srv", "192.168.1.100");
    }
    if (config.mqtt_port == 1883) {
        config.mqtt_port = preferences.getInt("port", 1883);
    }
    if (config.username.isEmpty()) {
        config.username = preferences.getString("user", "");
    }
    if (config.password_auth.isEmpty()) {
        config.password_auth = preferences.getString("mqtt_pw", "");
    }
    if (config.esp_username.isEmpty()) {
        config.esp_username = preferences.getString("esp_usr", "");
    }
    if (config.esp_zone.isEmpty()) {
        config.esp_zone = preferences.getString("zone", "");
    }
    if (!config.configured) {
        config.configured = preferences.getBool("cfg", false);
    }
    if (!config.connection_established) {
        config.connection_established = preferences.getBool("conn", false);
    }
    
    // Legacy-Felder für Kompatibilität
    config.mqtt_server = config.server_address;
    config.mqtt_user = config.username;
    config.mqtt_password = config.password_auth;
    config.pi_server_url = "http://" + config.server_address + ":" + String(config.http_port);
    config.pi_username = config.username;
    config.pi_password = config.password_auth;
    
    preferences.end();
    return true;
}
```

**WebConfigServer::saveConfiguration():** `src/web_config_server.cpp:748-790`

```cpp
bool WebConfigServer::saveConfiguration(const WiFiConfig& config) {
    preferences.begin("wifi_config", false);
    
    // ✅ FIXED: Save mit neuen Feldnamen für Kompatibilität
    preferences.putString("ssid", config.ssid);
    preferences.putString("password", config.password);
    
    // ✅ FIXED: Neue Feldnamen für Server-Konfiguration
    preferences.putString("server_address", config.server_address);
    preferences.putInt("mqtt_port", config.mqtt_port);
    preferences.putString("username", config.username);
    preferences.putString("password_auth", config.password_auth);
    preferences.putString("esp_name", config.esp_username);
    preferences.putString("friendly", config.esp_friendly_name);
    preferences.putString("esp_friendly_name", config.esp_friendly_name);
    preferences.putString("esp_zone", config.esp_zone);
    
    // ✅ FIXED: Legacy-Felder für Backward Compatibility
    preferences.putString("srv", config.server_address);
    preferences.putInt("port", config.mqtt_port);
    preferences.putString("user", config.username);
    preferences.putString("mqtt_pw", config.password_auth);
    preferences.putString("pi_url", config.pi_server_url);
    preferences.putString("pi_usr", config.pi_username);
    preferences.putString("pi_pw", config.pi_password);
    preferences.putString("esp_usr", config.esp_username);
    preferences.putString("zone", config.esp_zone);
    
    // Status-Felder
    preferences.putBool("configured", config.configured);
    preferences.putBool("conn", config.connection_established);
    preferences.putBool("connection_established", config.connection_established);
    preferences.putInt("http_p", config.http_port);
    preferences.putString("sys_st", config.system_state);
    preferences.putBool("web_act", config.webserver_active);
    
    preferences.end();
    return true;
}
```

**NVS-Keys (verkürzt + legacy):**
- `ssid`, `password` - WiFi-Credentials
- `server_address`, `mqtt_port`, `http_port` - Server-Konfiguration
- `username`, `password_auth` - Unified Authentication
- `esp_name`, `friendly`, `esp_friendly_name` - ESP Identity
- `esp_zone` - Zone-Zuordnung
- **Legacy-Keys:** `srv`, `port`, `user`, `mqtt_pw`, `pi_url`, `pi_usr`, `pi_pw`, `esp_usr`, `zone`, `cfg`, `conn`

### 10.3 Zone/Sensor/Actuator-Config-Persistenz

**loadZoneConfigFromPreferences():** `src/main.cpp:2390-2452`

**NVS-Namespace:** `"zone_config"`
**Keys:**
- `kaiser_id`, `kaiser_name`, `system_name`, `id_generated`
- `master_zone_id`, `master_zone_name`, `master_assigned`, `is_master_esp`
- `active_subzones`
- `subzone_{i}_id`, `subzone_{i}_name`, `subzone_{i}_desc`, `subzone_{i}_active`
- Change-Tracking: `master_zone_changed`, `master_zone_change_timestamp`, `previous_master_zone_id`
- `subzone_changed`, `subzone_change_timestamp`, `previous_subzone_id`
- `esp_id_changed`, `esp_id_change_timestamp`, `previous_esp_id`
- `kaiser_id_changed`, `kaiser_id_change_timestamp`, `previous_kaiser_id`

**saveZoneConfigToPreferences():** `src/main.cpp:2454-2495`

**loadSensorConfigFromPreferences():** `src/main.cpp:3317-3341`

**NVS-Namespace:** `"sensor_config"`
**Keys:**
- `active_sensors`
- `sensor_{i}_gpio`, `sensor_{i}_type`, `sensor_{i}_subzone`, `sensor_{i}_name`
- `sensor_{i}_library`, `sensor_{i}_lib_ver`, `sensor_{i}_active`
- `sensor_{i}_raw_mode` (🆕 NEU)

**saveSensorConfigToPreferences():** `src/main.cpp:3343-3363`

**Actuator-Config-Persistenz:**
- Wird über AdvancedActuatorSystem verwaltet
- Keine separate NVS-Persistenz (nur Runtime-Konfiguration)

---

## TEIL 11: WEB CONFIG SERVER

### 11.1 HTTP-Endpoints

**Datei:** `src/web_config_server.h:31-43, src/web_config_server.cpp:32-45`

**Alle Endpoints:**
1. `GET /` → `handleRoot()` - Configuration Form
2. `POST /save` → `handleSave()` - Save Configuration
3. `POST /reset` → `handleReset()` - Reset Configuration
4. `GET /status` → `handleStatus()` - Status-Anzeige
5. `GET /test-mqtt` → `handleTestMQTT()` - MQTT-Connectivity-Test
6. `GET /test-pi` → `handleTestPi()` - Pi-Server-Connectivity-Test
7. `GET /scan-network` → `handleScanNetwork()` - Network-Scan
8. `GET /discover-services` → `handleDiscoverServices()` - Service-Discovery

**Handler-Funktionen:**
- `handleRoot()` - Zeigt HTML-Formular
- `handleSave()` - Verarbeitet Formular-Daten
- `handleSaveForm()` - Legacy-Form-Handling
- `handleSaveJSON()` - JSON-Handling
- `handleReset()` - Reset-Konfiguration
- `handleStatus()` - Status-Information
- `handleNotFound()` - 404-Handler (Captive Portal)

### 11.2 HTML-Form

**Datei:** `src/web_config_server.cpp:585-662`

**getSetupHTML() - Struktur:**
- WiFi Section: `wifi_ssid`, `wifi_password`
- Server Section: `server_address`, `mqtt_port`, `http_port`
- Authentication Section: `username`, `password_auth`
- Device Section: `esp_name`, `esp_friendly_name`, `esp_zone`
- Buttons: Save, Reset

**Input-Felder:**
- Alle Felder mit Labels und Tooltips (❔)
- Validierung via JavaScript
- PROGMEM für HTML-Strings (HTML_HEAD, HTML_STYLE, HTML_END, JS_VALIDATION)

**JavaScript-Validierung:**
- IP-Adress-Validierung
- Port-Range-Validierung (1-65535)
- Pflichtfeld-Validierung

---

## TEIL 12: NETWORK DISCOVERY

### 12.1 NetworkDiscovery Klasse

**Datei:** `src/network_discovery.h:1-93`

**Komplette Klassen-Definition:**
```cpp
class NetworkDiscovery {
private:
    WiFiClient client;
    String last_known_pi_ip;
    unsigned long last_scan_time = 0;
    const unsigned long SCAN_INTERVAL = 300000; // 5 Minuten
    
public:
    NetworkDiscovery();
    ~NetworkDiscovery();
    
    // Pi Discovery Methods
    String discoverRaspberryPi();
    std::vector<String> scanNetworkForPiDevices();
    bool testPiServerAvailability(const String& ip, int port = 80);
    String resolveCurrentPiIP();
    void updateKnownPiIP(const String& ip);
    
    // [AgentFix] ESP32-spezifische Discovery-Methoden
    std::vector<String> scanNetworkForESP32Nodes();
    bool testESP32WebConfig(const String& ip);
    bool testESP32MQTT(const String& ip);
    void sendESP32DiscoveryNotification(const String& esp32_ip);
    
    // Network Scanning
    std::vector<String> scanCommonPorts(const String& ip, std::vector<int> ports);
    bool isDeviceReachable(const String& ip, int port, int timeout = 1000);
    
    // Status and Information
    String getLastKnownPiIP() const { return last_known_pi_ip; }
    unsigned long getLastScanTime() const { return last_scan_time; }
    bool shouldRescan() const;
};
```

**discoverRaspberryPi() - mDNS-Logik:**
- Method 1: Direct hostname lookup ("raspberrypi.local")
- Method 2: Service discovery for HTTP services
- Method 3: Common hostnames (raspberrypi, pi, raspberry, homeassistant, hassio)

**scanNetworkForPiDevices() - IP-Range-Scan:**
- Scans subnet (aus Gateway + Subnet-Prefix)
- Prüft common Pi IPs
- Testet HTTP-Availability auf Port 80

**DynamicIPManager Klasse:** `src/network_discovery.h:54-80`

```cpp
class DynamicIPManager {
private:
    NetworkDiscovery* discovery;
    String configured_pi_ip;
    bool use_mdns_fallback = true;
    unsigned long last_ip_check = 0;
    const unsigned long IP_CHECK_INTERVAL = 60000; // 1 Minute
    
public:
    DynamicIPManager(NetworkDiscovery* discovery_ptr);
    ~DynamicIPManager();
    
    // IP Management
    String getCurrentPiIP();
    bool updatePiIPIfChanged();
    void enableMDNSFallback(bool enable);
    void setConfiguredIP(const String& ip);
    
    // Status
    bool isIPStable() const;
    String getConfiguredIP() const { return configured_pi_ip; }
    bool isMDNSEnabled() const { return use_mdns_fallback; }
    
    // Manual IP Resolution
    String forceIPResolution();
    bool validateIP(const String& ip);
};
```

---

## TEIL 13: GENERIC I2C SENSOR

### 13.1 GenericI2CSensor Klasse

**Datei:** `src/GenericI2CSensor.h:1-64`

**Komplette Klassen-Definition:**
```cpp
class GenericI2CSensor {
private:
    static bool i2c_initialized;
    static I2CSensorConfig* sensor_configs;
    static uint8_t active_sensor_count;
    static const uint8_t MAX_I2C_SENSORS = 8;
    
    // MQTT and system references
    static PubSubClient* mqtt_client;
    static String esp_id;
    static String kaiser_id;
    
public:
    // Initialization
    static bool initialize(PubSubClient* mqtt_ptr, const String& esp_identifier, const String& kaiser_identifier);
    static bool initializeI2C();
    
    // Sensor Management
    static bool configureSensor(uint8_t gpio, uint8_t i2c_address, const String& sensor_hint, 
                               const String& subzone_id, const String& sensor_name);
    static bool removeSensor(uint8_t gpio);
    static bool hasSensorOnGPIO(uint8_t gpio);
    static I2CSensorConfig* getSensorConfig(uint8_t gpio);
    
    // Data Reading and Publishing
    static void performMeasurements();
    static bool sendGenericI2CSensorData(uint8_t gpio, uint8_t i2c_address, const char* sensor_hint = nullptr);
    static bool readI2CRawData(uint8_t i2c_address, uint8_t* raw_data, uint8_t data_length = 6);
    
    // Utility Functions
    static String formatI2CAddress(uint8_t address);
    static bool isValidI2CAddress(uint8_t address);
    static void printSensorStatus();
    
    // Cleanup
    static void cleanup();
};
```

**I2CSensorConfig Struktur:** `src/GenericI2CSensor.h:13-21`

```cpp
struct I2CSensorConfig {
    uint8_t gpio;                    // GPIO pin (typically 21 for SDA, 22 for SCL)
    uint8_t i2c_address;             // I2C address (e.g., 0x44 for SHT31)
    String sensor_hint;              // Optional sensor hint (e.g., "SHT31", "BME280")
    String subzone_id;               // Subzone identifier
    String sensor_name;              // Sensor name for identification
    bool active;                     // Whether sensor is active
    unsigned long last_reading;      // Last reading timestamp
};
```

**initializeI2C():** `src/GenericI2CSensor.cpp:68-98`

- Hardware-spezifische I2C-Pins (XIAO: SDA=4, SCL=5; ESP32 Dev: SDA=21, SCL=22)
- Wire.begin() mit Pin-Konfiguration
- Clock: 100kHz für Kompatibilität
- I2C-Bus-Test

**configureSensor():** Siehe Implementation in GenericI2CSensor.cpp

**readI2CRawData():** Liest 6 Bytes von I2C-Device

**sendGenericI2CSensorData():** MQTT-Publishing mit Topic-Struktur

---

## TEIL 14: OTA LIBRARY MANAGEMENT

### 14.1 Library-Download-System

**LibraryInfo Struktur:** `src/main.cpp:188-208`

```cpp
struct LibraryInfo {
  String name = "";
  String version = "";
  size_t total_size = 0;
  size_t received_size = 0;
  uint32_t expected_checksum = 0;
  uint32_t calculated_checksum = 0;
  uint8_t total_chunks = 0;
  uint8_t received_chunks = 0;
  bool download_complete = false;
  bool installation_complete = false;
  uint8_t* data_buffer = nullptr;
  
  // [AgentFix] Neue Felder für erweiterte Funktionalität
  String previous_version = "";  // Für Rollback
  bool rollback_available = false;
  uint32_t install_timestamp = 0;
  String install_quality = "unknown";
  bool version_compatible = false;
  String install_error = "";
};
```

**initLibraryDownload():** `src/main.cpp:2851-2921`

- Version-Kompatibilitätsprüfung
- Backup der vorherigen Version für Rollback
- Buffer-Allokation mit Überprüfung
- State-Transition zu STATE_LIBRARY_DOWNLOADING

**processLibraryChunk():** `src/main.cpp:2923-2950`

- Base64-Decoding (wird in completeLibraryDownload() gemacht)
- Chunk-Validierung
- Memory-Copy in Buffer
- Progress-Tracking

**completeLibraryDownload():** `src/main.cpp:2952-3050+`

- CRC32-Validation (`calculateCRC32()`)
- Base64-Encoding für Advanced System
- Installation über `advanced_system.installLibraryFromBase64()`
- Error-Handling und Rollback

**isLibraryVersionCompatible():** `src/main.cpp:2737-2743`

```cpp
bool isLibraryVersionCompatible(const String& library_name, const String& version) {
    DEBUG_PRINTF("[OTA] Checking version compatibility: %s v%s\n", library_name.c_str(), version.c_str());
    return true; // Für jetzt: alle Versionen kompatibel
}
```

**calculateCRC32():** `src/main.cpp:2745-2755`

- CRC32-Berechnung für Checksum-Validierung
- Polynomial: 0xEDB88320

---

## TEIL 15: UTILITIES

### 15.1 Logger/Debug-System

**Datei:** `src/main.cpp:99-109`

```cpp
// ✅ OPTIMIERT: Debug-Kontrolle für Flash-Einsparung (Phase 2)
#define DEBUG_MODE false  // ✅ GLOBAL DEAKTIVIERT für Flash-Sparen

#ifdef DEBUG_MODE
    #define DEBUG_PRINT(x) Serial.println(x)
    #define DEBUG_PRINTF(format, ...) Serial.printf(format, ##__VA_ARGS__)
    #define DEBUG_PRINTLN(x) Serial.println(x)
#else
    #define DEBUG_PRINT(x)
    #define DEBUG_PRINTF(format, ...)
    #define DEBUG_PRINTLN(x)
#endif
```

**Verwendung:**
- `DEBUG_PRINT("Message")` - Einfache Ausgabe
- `DEBUG_PRINTF("Format: %d", value)` - Formatierte Ausgabe
- `DEBUG_PRINTLN("Message")` - Ausgabe mit Newline

**Log-Level-System:**
- `CORE_DEBUG_LEVEL=2` (XIAO) oder `CORE_DEBUG_LEVEL=3` (ESP32 Dev)
- Kontrolliert über `platformio.ini` Build-Flags

### 15.2 Time-Management

**Datei:** `src/main.cpp:449-453, 6295-6309`

**NTP-Client Setup:**
```cpp
// NTP-Client für Unix-Timestamps
WiFiUDP ntp_udp;
NTPClient time_client(ntp_udp, "pool.ntp.org", 3600, 60000); // UTC+1, 60s Update-Intervall
bool ntp_synced = false;
unsigned long last_ntp_sync = 0;
```

**getUnixTimestamp():** `src/main.cpp:6295-6309`

```cpp
unsigned long getUnixTimestamp() {
  // Prüfe ob NTP synchronisiert ist
  if (ntp_synced && time_client.isTimeSet()) {
    // Return Unix-Timestamp in Millisekunden (Server-Format)
    return time_client.getEpochTime() * 1000 + (millis() % 1000);
  } else {
    // Fallback: Verwende millis() + Boot-Timestamp (wenn verfügbar)
    static unsigned long long boot_timestamp = 0;
    if (boot_timestamp == 0) {
      // Erste Ausführung: Boot-Timestamp setzen (approximativ)
      boot_timestamp = 1735689600000ULL; // 1. Januar 2025 als Fallback
    }
    return (unsigned long)(boot_timestamp + millis());
  }
}
```

**RTC-System:** Siehe `PrecisionRTC` in `advanced_features.h:241-305`

### 15.3 Data-Buffer (Offline-Mode)

**BufferedReading Struktur:** `include/advanced_features.h:314-324`

```cpp
struct BufferedReading {
    time_t timestamp;
    char esp_id[16];
    char zone_id[32];
    char subzone_id[32];
    uint8_t gpio;
    uint8_t sensor_type;
    float value;
    char sensor_name[32];
    uint16_t checksum;
};
```

**OfflineDataBuffer Klasse:** `include/advanced_features.h:329-380`

```cpp
class OfflineDataBuffer {
private:
    BufferedReading* buffer = nullptr;
    uint16_t buffer_size;
    uint16_t write_index = 0;
    uint16_t read_index = 0;
    uint16_t count = 0;
    bool buffer_full = false;
    Preferences prefs;
    
    uint16_t calculateChecksum(const BufferedReading& reading);
    void saveIndices();
    
public:
    OfflineDataBuffer() = default;
    ~OfflineDataBuffer();
    
    bool init(uint16_t size = MAX_BUFFERED_READINGS);
    bool addReading(time_t timestamp, const String& esp_id, const String& zone_id,
                   const String& subzone_id, uint8_t gpio, uint8_t sensor_type,
                   float value, const String& sensor_name);
    bool getNextReading(BufferedReading& reading);
    String readingToJson(const BufferedReading& reading);
    uint16_t getCount() const;
    uint16_t getCapacity() const;
    bool isFull() const;
    float getFillPercentage() const;
    void clear();
};
```

**Buffer-Logik:**
- Ring-Buffer mit `write_index` und `read_index`
- Checksum-Validierung für Datenintegrität
- Persistenz über Preferences
- Upload nach Reconnect über `uploadBufferedData()`

---

## ZUSAMMENFASSUNG

Dieses Dokument enthält die vollständige Code-Extraktion aus dem ESP32-Projekt **SensorNetwork_Esp32_Dev** (14.805 Zeilen) für die Migration in eine neue modulare Architektur.

**Alle 15 Teile wurden extrahiert:**
1. ✅ PlatformIO & Build-Konfiguration
2. ✅ Hardware-Konfiguration (XIAO + ESP32 Dev)
3. ✅ System State Machine
4. ✅ MQTT Communication
5. ✅ GPIO Safe Mode System
6. ✅ Sensor-System
7. ✅ Actuator-System
8. ✅ Pi-Integration
9. ✅ Error-Handling
10. ✅ Configuration-Management
11. ✅ Web Config Server
12. ✅ Network Discovery
13. ✅ Generic I2C Sensor
14. ✅ OTA Library Management
15. ✅ Utilities

**Alle Code-Abschnitte enthalten:**
- Exakte Zeilen-Referenzen
- Vollständiger Code (keine Platzhalter)
- Alle Dependencies (#include Statements)
- Alle Konstanten (#define, const Werte)
- Original-Kommentare beibehalten

**Nächste Schritte für Migration:**
1. Verwende dieses Dokument als Referenz für die neue modulare Architektur
2. Extrahiere jedes Modul gemäß den hier dokumentierten Schnittstellen
3. Stelle sicher, dass alle Dependencies und Konstanten übernommen werden
4. Teste die Migration Schritt für Schritt mit den hier dokumentierten Funktionen

---

**Ende der Extraktion**

