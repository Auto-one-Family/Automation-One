#ifndef MODELS_SYSTEM_TYPES_H
#define MODELS_SYSTEM_TYPES_H

#include <Arduino.h>

// ✅ System States - UNVERÄNDERT
// Migration aus: main.cpp:96-113 (SystemState Enum)
enum SystemState {
  STATE_BOOT = 0,
  STATE_WIFI_SETUP,
  STATE_WIFI_CONNECTED,
  STATE_MQTT_CONNECTING,
  STATE_MQTT_CONNECTED,
  STATE_AWAITING_USER_CONFIG,
  STATE_ZONE_CONFIGURED,
  STATE_SENSORS_CONFIGURED,
  STATE_OPERATIONAL,
  STATE_LIBRARY_DOWNLOADING,               // ⚠️ OPTIONAL - nur für OTA Library Mode (10%)
  STATE_SAFE_MODE,
  STATE_ERROR
};

// Kaiser Zone - UNVERÄNDERT
// Migration aus: main.cpp:390-413
struct KaiserZone {
  String kaiser_id = "";
  String kaiser_name = "";
  String system_name = "";
  bool connected = false;
  bool id_generated = false;
};

// Master Zone - UNVERÄNDERT
// Migration aus: main.cpp:390-413
struct MasterZone {
  String master_zone_id = "";
  String master_zone_name = "";
  bool assigned = false;
  bool is_master_esp = false;
};

// Sub Zone - UNVERÄNDERT
// Migration aus: main.cpp:390-413
struct SubZone {
  String subzone_id = "";
  String subzone_name = "";
  String description = "";
  bool active = false;
  uint8_t sensor_count = 0;
};

// WiFi Configuration - UNVERÄNDERT
// Migration aus: wifi_config.h
struct WiFiConfig {
  String ssid = "";
  String password = "";
  String server_address = "";            // God-Kaiser Server IP
  uint16_t mqtt_port = 8883;             // MQTT Port (default: 8883 für TLS)
  String mqtt_username = "";             // ✅ OPTIONAL (kann leer sein - Anonymous Mode)
  String mqtt_password = "";             // ✅ OPTIONAL (kann leer sein - Anonymous Mode)
};

// Utility Functions (Deklaration, Implementierung in .cpp später)
String getSystemStateString(SystemState state);

#endif

