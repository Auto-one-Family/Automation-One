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
  STATE_SAFE_MODE_PROVISIONING,            // ✅ FIX #1: Safe-Mode mit aktivem Provisioning (Timeout)
  STATE_ERROR
};

// Kaiser Zone - ENHANCED (Phase 7: Dynamic Zones)
// Migration aus: main.cpp:390-413
// Enhanced with hierarchical zone support
struct KaiserZone {
  // Primary Zone Identification (NEW - Phase 7)
  String zone_id = "";              // Primary zone identifier (e.g., "greenhouse_zone_1")
  String master_zone_id = "";       // Parent zone for hierarchy (e.g., "greenhouse")
  String zone_name = "";            // Human-readable zone name
  bool zone_assigned = false;       // Zone configuration status
  
  // Kaiser Communication (Existing)
  String kaiser_id = "";            // God-Kaiser identifier
  String kaiser_name = "";          // Kaiser name (optional)
  String system_name = "";          // System name (optional)
  bool connected = false;           // MQTT connection status
  bool id_generated = false;        // Kaiser ID generation flag
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
  bool configured = false;               // ✅ Konfigurationsstatus
};

// System Configuration (Phase 1 - NEU)
struct SystemConfig {
  String esp_id = "";
  String device_name = "ESP32";
  SystemState current_state = STATE_BOOT;
  String safe_mode_reason = "";
  uint16_t boot_count = 0;
  unsigned long last_boot_time = 0;  // Phase 2: Millis bei letztem Boot (overflow-safe)
};

// Utility Functions (Deklaration, Implementierung in .cpp später)
String getSystemStateString(SystemState state);

#endif

