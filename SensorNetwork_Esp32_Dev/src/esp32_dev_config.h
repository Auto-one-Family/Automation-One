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
