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