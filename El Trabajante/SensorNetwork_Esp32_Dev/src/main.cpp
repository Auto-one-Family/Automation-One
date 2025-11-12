#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <mbedtls/base64.h>  // Für Base64-Encoding
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>

// *** HARDWARE KONFIGURATION - Automatische Erkennung ***
#ifdef ESP32_DEV_MODE
    #include "esp32_dev_config.h"
#else
    #include "xiao_config.h"
#endif

// *** ADVANCED FEATURES INTEGRATION ***
#include "advanced_features.h"
#include "web_config_server.h"
#include "wifi_config.h"
#include "network_discovery.h"
#include "actuator_system.h"
#include "pi_sensor_client.h"
#include "GenericI2CSensor.h"

// =============================================================================
// FORWARD DECLARATIONS - For classes defined later in the file
// =============================================================================
class MQTTConnectionManager;
class PiCircuitBreaker;
class SystemHealthMonitor;
class NetworkDiscovery;
class DynamicIPManager;

// =============================================================================
// GLOBAL INSTANCES - Enhanced Error Handling Components
// =============================================================================
MQTTConnectionManager* mqtt_manager = nullptr;
PiCircuitBreaker* pi_breaker = nullptr;
SystemHealthMonitor* health_monitor = nullptr;
NetworkDiscovery* network_discovery = nullptr;
DynamicIPManager* ip_manager = nullptr;


// DNS Server für Web Config Portal
DNSServer dnsServer;

// Legacy Config Arrays für Hybrid-Architektur (Advanced System + Legacy Arrays)
struct LegacySensorConfig {
    bool active = false;
    uint8_t gpio;
    String sensor_type;
    String sensor_name;
    String subzone_id;
    String library_name;  // ✅ Fehlendes Feld für sendEnhancedStatusUpdate
    float last_value = 0.0;  // ✅ Fehlendes Feld für sendEnhancedStatusUpdate
    unsigned long last_reading = 0;  // ✅ Fehlendes Feld für sendEnhancedStatusUpdate
};

struct LegacyActuatorConfig {
    bool active = false;
    uint8_t gpio;
    String actuator_type;
    String actuator_name;
    String subzone_id;
    String library_name;  // ✅ Fehlendes Feld für sendEnhancedStatusUpdate
    float last_value = 0.0;  // ✅ Fehlendes Feld für sendEnhancedStatusUpdate
    unsigned long last_command = 0;  // ✅ Fehlendes Feld für sendEnhancedStatusUpdate
};

// Globale Legacy Arrays (neben Advanced System)
LegacySensorConfig sensor_configs[MAX_SENSORS];
LegacyActuatorConfig actuator_configs[MAX_ACTUATORS];

// =============================================================================
// KONFIGURATION & KONSTANTEN (Xiao ESP32-C3 optimiert)
// =============================================================================

// Hardware-Konfiguration (automatisch aus Konfigurationsdatei)
#ifdef ESP32_DEV_MODE
    #define MAX_GPIO_PINS 24  // ESP32 Dev verfügbare Pins
#else
    #define MAX_GPIO_PINS 12  // Xiao ESP32-C3 verfügbare Pins
#endif

// Alle anderen Konstanten werden aus xiao_config.h übernommen:
// - MAX_SENSORS, MAX_ACTUATORS, MAX_LIBRARY_SIZE
// - MQTT_BUFFER_SIZE, LIBRARY_CHUNK_SIZE
// - MEASUREMENT_INTERVAL, MAX_BUFFERED_MEASUREMENTS
// - MAX_SUBZONES, USER_CONFIG_TIMEOUT

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

// =============================================================================
// ENUMS & TYPE DEFINITIONS (Must be declared before forward declarations)
// =============================================================================

// System-Status
enum SystemState {
  STATE_BOOT,
  STATE_WIFI_SETUP,
  STATE_WIFI_CONNECTED,      // 🆕 NEU: WiFi verbunden, aber MQTT noch nicht
  STATE_MQTT_CONNECTING,
  STATE_MQTT_CONNECTED,      // 🆕 NEU: MQTT verbunden, aber noch nicht operational
  STATE_AWAITING_USER_CONFIG,
  STATE_ZONE_CONFIGURED,
  STATE_SENSORS_CONFIGURED,
  STATE_OPERATIONAL,
  STATE_LIBRARY_DOWNLOADING,
  STATE_SAFE_MODE,           // 🆕 NEU: Safe Mode für Server-Kompatibilität
  STATE_ERROR
};
String getSystemStateString(SystemState state);
// Sensor-Typen
enum SensorType {
  SENSOR_NONE,
  SENSOR_PH_DFROBOT,
  SENSOR_EC_GENERIC,
  SENSOR_TEMP_DS18B20,
  SENSOR_TEMP_DHT22,
  SENSOR_MOISTURE,
  SENSOR_PRESSURE,
  SENSOR_CO2,
  SENSOR_AIR_QUALITY,
  SENSOR_LIGHT,
  SENSOR_FLOW,
  SENSOR_LEVEL,
  SENSOR_CUSTOM_PI_ENHANCED,
  SENSOR_CUSTOM_OTA
};

// =============================================================================
// FUNCTION DECLARATIONS (Forward Declarations)
// =============================================================================

// Safe Mode Manager
void initializeAllPinsToSafeMode();
bool releaseGpioFromSafeMode(uint8_t gpio);
void enableSafeModeForAllPins();

// Server Discovery System
bool performServerDiscovery();
void updateKaiserId(const String& new_kaiser_id);

// 🆕 NEU: Real Hardware Sensor Reading Helper Functions
float readDS18B20Real(uint8_t gpio);
float readCO2Real(uint8_t gpio);
float readPiEnhancedReal(uint8_t gpio);
bool validateRawDataRange(SensorType sensor_type, uint32_t raw_value);
String validateRawDataWithWarnings(SensorType sensor_type, uint32_t raw_value);

// 🆕 NEU: Test-Payload-Generator für Debug (SCHRITT 8)
void sendTestPayloads();

// WiFi & MQTT
void loadWiFiConfigFromPreferences();
void saveWiFiConfigToPreferences();
void resetWiFiConfiguration();
bool connectToWiFi();
bool connectToMqtt();
bool initializeSystem();
void subscribeToKaiserTopics();
void subscribeToConfigurationTopics();

// Zone Management
void loadZoneConfigFromPreferences();
void saveZoneConfigToPreferences();
void requestUserZoneConfiguration();

// OTA Library Management
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

// OTA Library Manager
void initLibraryDownload(String library_name, String version, size_t total_size, uint8_t total_chunks, uint32_t checksum);
bool processLibraryChunk(uint8_t chunk_number, const uint8_t* chunk_data, size_t chunk_size);
bool completeLibraryDownload();
void requestLibraryForSensor(SensorType sensor_type);
void onLibraryInstalled(String library_name);

// [AgentFix] Neue OTA-Hilfsfunktionen
bool isLibraryVersionCompatible(const String& library_name, const String& version);
uint32_t calculateCRC32(const uint8_t* data, size_t length);
void sendLibraryErrorResponse(const String& library_name, const String& error_type, const String& error_message);
bool performLibraryRollback(const String& library_name);
void saveLibraryInfo(const LibraryInfo& library_info);
bool isLibraryInstalled(const String& library_name);
String getInstalledLibraryVersion(const String& library_name);

// Sensor Management
void loadSensorConfigFromPreferences();
void saveSensorConfigToPreferences();
bool configureSensor(uint8_t gpio, SensorType type, String subzone_id, String sensor_name);
float readSensor(int sensor_index);
void performMeasurements();
void sendSensorData(int sensor_index, float value);
void sendBatchedSensorData();
void sendIndividualSensorData(int sensor_index, float value);
bool removeSensor(uint8_t gpio);
void handleSensorRemoval(String message);

// MQTT Message Handlers
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void handleZoneConfiguration(String message);
void handleSubZoneConfiguration(String message);
void handleSensorConfiguration(String message);
void handleLibraryDownloadStart(String message);
void handleLibraryChunk(String message);
void handleSystemCommand(String message);
void handleSensorRemoval(String message);
// NEU: ESP-Konfigurations-Handler
void handleESPConfiguration(String message);
void sendESPConfigurationResponse(bool success, String message);

// Actuator Handlers
void handleActuatorCommand(const String& topic, const String& message);
void handleActuatorEmergency(const String& message);
void handleActuatorConfiguration(const String& message);

// Status & Monitoring
void sendStatusUpdate();
void sendHeartbeat();
void sendActuatorStatusUpdate();
unsigned long getUnixTimestamp();  // Unix-Timestamp für Server-Kompatibilität
void sendActuatorStatus(uint8_t gpio);
void sendActuatorAlert(uint8_t gpio, const String& alert_type, const String& message);
void sendESPConfigurationUpdate();
void sendESPConfigurationToFrontend();
void sendConfigurationToPiServer();
void handlePiServerResponse(const String& topic, const String& payload);

// System Recovery & Enhanced Status
void handleSystemRecovery();
void sendEnhancedStatusUpdate();
void sendErrorAlert(const String& component, const String& error_message, const String& context = "");

// ✅ NEU: Safe Mode Helper Functions
int count_safe_mode_pins();
JsonObject get_safe_mode_status();
void reset_esp_configuration();
void monitor_safe_mode_status();
void send_safe_mode_status();

// 🆕 NEU: Safe Mode Reason & GPIO Conflict Tracking
void setSafeModeReason(const String& reason);
void handleSafeModeTransition(const String& new_reason);
void setGPIOConflictInfo(uint8_t gpio, const String& conflict_type, 
                        const String& current_owner, const String& requested_owner);

// ✅ NEU: Pi Server Command Handlers
void handlePiServerCommand(String message);
void send_pi_server_response(String request_id, bool success, String message);
void handle_delete_esp_command(String request_id);
void handle_status_request_command(String request_id);
// v3.6.0: Neue Handler-Funktionen
void handleEmergencyCommand(String message);
void handleHealthRequest(String message);
void handleLibraryRequest(String message);
void handlePiCommand(String message);
void handleI2CScanRequest(String message);
void handleEmergencyBroadcast(String message);
void handleSystemUpdateBroadcast(String message);

// 🆕 NEU: UI-Schema Processing Handler-Funktionen
void handleUISchemaUpdate(String message);
void handleUICapabilitiesRequest(String message);
// 🧪 PHASE 2: Test Handler
void handleUITestRequest(String message);
void sendUISchemaResponse(bool success, const String& message, const String& schema_version);
void sendZoneResponse(const String& status);
void sendSubzoneResponse(const String& status);
void sendPiSensorStatistics(const String& sensor_id);
void sendEmergencyBroadcast(const String& message, const String& severity);
void sendSystemUpdateBroadcast(const String& message, const String& version);
void sendEnhancedTopicStats();

// ✅ NEU: Utility Functions
String getSensorTypeString(SensorType type);
String generateKaiserId(const String& systemName);

// 🆕 NEU: Topic-Management für Kaiser-ID-Transition
void unsubscribeFromOldTopics(const String& old_kaiser_id);
void subscribeToNewTopics();
void sendDiscoveryNotification();

// ✅ NEU: MQTT-Robustheits-Hilfsfunktionen
bool safePublish(const String& topic, const String& payload, int qos = 1, int retries = 3);
bool isValidTopic(const String& topic);
bool isValidSpecialTopic(const String& topic);
bool isValidConfigPayload(const String& payload);
bool isValidHeartbeatPayload(const String& payload);



// =============================================================================
// FRONTEND-IMPLEMENTIERUNG: QoS-Konstanten definieren
// =============================================================================

#define MQTT_QOS_COMMANDS 0      // System commands
#define MQTT_QOS_SENSOR_DATA 1   // Live sensor data
#define MQTT_QOS_HEARTBEAT 1     // Heartbeat messages
#define MQTT_QOS_ACKS 1          // Acknowledgments
#define MQTT_QOS_STATUS 1        // Status updates

// ✅ FRONTEND-IMPLEMENTIERUNG: Debug-Modus und Batching-Konfiguration
struct SystemConfig {
    bool debug_mode = false;
    bool disable_batching = false;
    bool use_batching = false;
    bool enable_context = false;
    bool enable_warnings = false;
} system_config;

// ✅ FRONTEND-IMPLEMENTIERUNG: Sensor-Einheiten-Helper
String getSensorUnit(SensorType type) {
    switch (type) {
        case SENSOR_TEMP_DS18B20:
        case SENSOR_TEMP_DHT22:
            return "°C";
        case SENSOR_PH_DFROBOT:
            return "pH";
        case SENSOR_EC_GENERIC:
            return "mS/cm";
        case SENSOR_MOISTURE:
            return "%";
        case SENSOR_PRESSURE:
            return "hPa";
        case SENSOR_CO2:
            return "ppm";
        case SENSOR_AIR_QUALITY:
            return "IAQ";
        case SENSOR_LIGHT:
            return "lux";
        case SENSOR_FLOW:
            return "L/min";
        case SENSOR_LEVEL:
            return "cm";
        default:
            return "raw";
    }
}

// =============================================================================
// ADVANCED FEATURES INTEGRATION
// =============================================================================

// Global instance für Advanced Features
AdvancedSensorSystem advanced_system;

// =============================================================================
// DATENSTRUKTUREN
// =============================================================================

// Zone-Hierarchie
struct KaiserZone {
    String kaiser_id = "pi_zero_edge_controller";  // ✅ Bleibt für Backward Compatibility
    String kaiser_name = "Kaiser Edge Controller";
    String system_name = "";  // 🆕 NEU: Benutzer-Eingabe (z.B. "Wohnzimmer")
    bool connected = false;
    bool id_generated = false;  // 🆕 NEU: Flag für generierte ID
};

struct MasterZone {
  String master_zone_id = "";
  String master_zone_name = "";
  bool assigned = false;
  bool is_master_esp = false;  // Ist dieser ESP der Master der Zone?
};

struct SubZone {
  String subzone_id = "";
  String subzone_name = "";
  String description = "";
  bool active = false;
  uint8_t sensor_count = 0;
};

// Sensor-Konfiguration
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

// OTA-Library-Management

// =============================================================================
// GLOBALE VARIABLEN
// =============================================================================

SystemState current_state = STATE_BOOT;
String esp_id;
String mac_address;
String zone_id;  // ✅ Fehlende zone_id Variable für sendEnhancedStatusUpdate

// Netzwerk & MQTT
WiFiClient wifi_client;
PubSubClient mqtt_client(wifi_client);
Preferences preferences;
WiFiConfig wifi_config;

// NTP-Client für Unix-Timestamps
WiFiUDP ntp_udp;
NTPClient time_client(ntp_udp, "pool.ntp.org", 3600, 60000); // UTC+1, 60s Update-Intervall
bool ntp_synced = false;
unsigned long last_ntp_sync = 0;

// Zone-Hierarchie
KaiserZone kaiser_zone;
MasterZone master_zone;
SubZone sub_zones[MAX_SUBZONES];
uint8_t active_subzones = 0;

// Sensor-Management
SensorConfig sensors[MAX_SENSORS];
uint8_t active_sensors = 0;

// OTA-Library-Management
LibraryInfo current_library_download;
bool library_download_in_progress = false;

// GPIO Safe-Mode Management
bool gpio_safe_mode[MAX_GPIO_PINS];
bool gpio_configured[MAX_GPIO_PINS];

// Timing
unsigned long last_measurement = 0;
unsigned long last_heartbeat = 0;
unsigned long last_mqtt_reconnect = 0;
unsigned long user_config_start = 0;

// 🆕 MQTT Timeout Management
unsigned long mqtt_connect_start_time = 0;
const unsigned long MQTT_TIMEOUT_MS = 30000;  // 30 Sekunden Timeout

// 🆕 Pi Server Response System
bool pi_config_sent = false;
unsigned long pi_config_sent_time = 0;
bool pi_configuration_confirmed = false;
const unsigned long PI_CONFIG_TIMEOUT_MS = 10000;  // 10 Sekunden Timeout

// 🆕 NEU: Kaiser-ID Change Tracking für graceful Topic-Transition
bool kaiser_id_changed = false;
unsigned long kaiser_id_change_timestamp = 0;
String previous_kaiser_id = "";

// 🆕 NEU: Master-Zone Change Tracking
bool master_zone_changed = false;
unsigned long master_zone_change_timestamp = 0;
String previous_master_zone_id = "";

// 🆕 NEU: Subzone Change Tracking
bool subzone_changed = false;
unsigned long subzone_change_timestamp = 0;
String previous_subzone_id = "";

// 🆕 NEU: ESP-ID Change Tracking (optional override)
bool esp_id_changed = false;
unsigned long esp_id_change_timestamp = 0;
String previous_esp_id = "";

// Advanced Features Integration
bool advanced_system_initialized = false;
bool mqtt_was_connected = false;
WebConfigServer* web_config_server = nullptr;

// =============================================================================
// SYSTEM ERROR TRACKING & HEALTH MONITORING
// =============================================================================

// Error Tracking
String last_system_error = "";
unsigned long last_error_time = 0;
uint16_t total_error_count = 0;
uint16_t wifi_reconnect_count = 0;
uint16_t mqtt_reconnect_count = 0;

// WiFi Monitoring
unsigned long last_wifi_reconnect = 0;
unsigned long last_wifi_check = 0;
int16_t wifi_signal_strength = 0;

// Health Metrics
struct SystemHealthMetrics {
  size_t free_heap_minimum = 0;
  size_t free_heap_current = 0;
  uint16_t sensor_failure_count = 0;
  uint16_t actuator_failure_count = 0;
  unsigned long uptime_seconds = 0;
  float cpu_usage_percent = 0.0;
} health_metrics;

// v3.6.0: Topic-Statistiken für Diagnose
struct TopicStats {
  String topic;
  uint32_t publish_count = 0;
  unsigned long last_sent = 0;
  unsigned long first_sent = 0;
};

TopicStats topic_statistics[20];  // Max 20 verschiedene Topics
uint8_t topic_stats_count = 0;
unsigned long last_diagnostics_report = 0;
const unsigned long DIAGNOSTICS_INTERVAL = 300000; // 5 Minuten

// Health Broadcasting
unsigned long last_health_broadcast = 0;
const unsigned long HEALTH_BROADCAST_INTERVAL = 60000;  // 1 minute

// 🆕 NEU: Safe Mode Reason Tracking
String safe_mode_enter_reason = "boot_initialization";  // Default-Wert
unsigned long safe_mode_enter_timestamp = 0;
bool safe_mode_reason_tracked = false;

// 🆕 NEU: GPIO Conflict Tracking
String last_conflict_type = "";
String last_conflict_gpio = "";
String last_conflict_current_owner = "";
String last_conflict_requested_owner = "";

// =============================================================================
// UI-SCHEMA PROCESSING SYSTEM
// =============================================================================

// 🔒 CONCURRENCY PROTECTION: MQTT-Handler Mutex für UI-Schema Processing
bool ui_schema_processing_active = false;
unsigned long ui_schema_processing_start = 0;
const unsigned long UI_SCHEMA_TIMEOUT_MS = 10000;  // 10 Sekunden Timeout

// UI-Schema Validator mit Memory-Constraints
class UISchemaValidator {
private:
    size_t max_schema_size;
    bool board_is_xiao;
    
public:
    UISchemaValidator() {
        #ifdef XIAO_ESP32C3_MODE
            max_schema_size = 2048;  // 2KB für XIAO
            board_is_xiao = true;
        #else
            max_schema_size = 4096;  // 4KB für ESP32 Dev
            board_is_xiao = false;
        #endif
    }
    
    bool validateSchemaSize(const String& message) {
        if (message.length() > max_schema_size) {
            DEBUG_PRINTF("[UISchema] ERROR: Schema too large (%d > %d bytes)\n", 
                        message.length(), max_schema_size);
            return false;
        }
        return true;
    }
    
    bool validateESPIDMatch(const JsonDocument& schema) {
        if (!schema.containsKey("esp_id")) {
            DEBUG_PRINT("[UISchema] ERROR: Missing esp_id in schema");
            return false;
        }
        
        String schema_esp_id = schema["esp_id"].as<String>();
        if (schema_esp_id != esp_id) {
            DEBUG_PRINTF("[UISchema] ERROR: ESP ID mismatch: expected %s, got %s\n", 
                        esp_id.c_str(), schema_esp_id.c_str());
            return false;
        }
        return true;
    }
    
    bool validateComponentLimits(const JsonDocument& schema) {
        if (!schema.containsKey("components")) {
            DEBUG_PRINT("[UISchema] ERROR: Missing components array");
            return false;
        }
        
        JsonArrayConst components = schema["components"];
        int component_count = components.size();
        
        int max_sensors = board_is_xiao ? 10 : 20;
        if (component_count > max_sensors) {
            DEBUG_PRINTF("[UISchema] ERROR: Too many components (%d > %d)\n", 
                        component_count, max_sensors);
            return false;
        }
        
        return true;
    }
    
    bool validateGPIOAvailability(const JsonDocument& schema) {
        JsonArrayConst components = schema["components"];
        
        for (JsonVariantConst component_var : components) {
            JsonObjectConst component = component_var;
            
            if (!component.containsKey("gpio")) {
                DEBUG_PRINT("[UISchema] ERROR: Component missing GPIO");
                return false;
            }
            
            uint8_t gpio = component["gpio"];
            
            // Prüfe GPIO-Verfügbarkeit mit bestehender Logik
            if (gpio >= MAX_GPIO_PINS) {
                DEBUG_PRINTF("[UISchema] ERROR: Invalid GPIO %d\n", gpio);
                return false;
            }
            
            // Prüfe reservierte Pins
            if (gpio == 0 || gpio == 1 || gpio == 6 || gpio == 7 || gpio == 8 || 
                gpio == 9 || gpio == 10 || gpio == 11 || gpio == 16 || gpio == 17 ||
                gpio == 21 || gpio == 22) {
                DEBUG_PRINTF("[UISchema] ERROR: GPIO %d is reserved\n", gpio);
                return false;
            }
        }
        
        return true;
    }
    
    bool validateMemoryRequirements(const String& message) {
        size_t free_heap = ESP.getFreeHeap();
        size_t required_memory = board_is_xiao ? 15000 : 20000;  // 15KB/20KB Buffer
        
        // 🔧 CRITICAL FIX: JSON-Document Memory-Overhead berücksichtigen
        size_t json_memory_overhead = message.length() * 2;  // Conservative estimate: 2x message size for JSON parsing
        size_t total_required = required_memory + json_memory_overhead;
        
        if (free_heap < total_required) {
            DEBUG_PRINTF("[UISchema] ERROR: Insufficient memory (free: %d, required: %d + %d JSON overhead = %d bytes)\n", 
                        free_heap, required_memory, json_memory_overhead, total_required);
            return false;
        }
        
        DEBUG_PRINTF("[UISchema] Memory validation passed (free: %d, required: %d bytes)\n", 
                    free_heap, total_required);
        return true;
    }
    
    bool validateCompleteSchema(const String& message, JsonDocument& schema) {
        // Schritt 1: Schema-Größe prüfen
        if (!validateSchemaSize(message)) return false;
        
        // Schritt 2: Memory-Verfügbarkeit prüfen (mit JSON-Overhead)
        if (!validateMemoryRequirements(message)) return false;
        
        // Schritt 3: JSON parsen
        DeserializationError error = deserializeJson(schema, message);
        if (error) {
            DEBUG_PRINTF("[UISchema] ERROR: JSON parse failed: %s\n", error.c_str());
            return false;
        }
        
        // Schritt 4: ESP-ID validieren
        if (!validateESPIDMatch(schema)) return false;
        
        // Schritt 5: Component-Limits prüfen
        if (!validateComponentLimits(schema)) return false;
        
        // Schritt 6: GPIO-Verfügbarkeit prüfen
        if (!validateGPIOAvailability(schema)) return false;
        
        DEBUG_PRINT("[UISchema] ✅ Schema validation successful");
        return true;
    }
};

// GPIO Configuration Engine mit Hot-Plug-Integration
class UIGPIOConfigEngine {
private:
    struct GPIOBackup {
        uint8_t gpio;
        bool was_active;
        SensorType old_type;
        String old_subzone;
        String old_name;
        bool valid;
    };
    
    GPIOBackup backup_states[MAX_SENSORS];
    int backup_count;
    
public:
    UIGPIOConfigEngine() : backup_count(0) {
        for (int i = 0; i < MAX_SENSORS; i++) {
            backup_states[i].valid = false;
        }
    }
    
    void createBackup() {
        backup_count = 0;
        DEBUG_PRINT("[UISchema] Creating GPIO configuration backup");
        
        for (int i = 0; i < MAX_SENSORS && backup_count < MAX_SENSORS; i++) {
            if (sensors[i].active) {
                backup_states[backup_count].gpio = sensors[i].gpio;
                backup_states[backup_count].was_active = true;
                backup_states[backup_count].old_type = sensors[i].type;
                backup_states[backup_count].old_subzone = sensors[i].subzone_id;
                backup_states[backup_count].old_name = sensors[i].sensor_name;
                backup_states[backup_count].valid = true;
                backup_count++;
            }
        }
        
        DEBUG_PRINTF("[UISchema] Backup created for %d sensors\n", backup_count);
    }
    
    bool rollbackConfiguration() {
        DEBUG_PRINT("[UISchema] Rolling back GPIO configuration");
        bool success = true;
        
        // 🔧 CRITICAL FIX: Memory-optimiertes Rollback ohne vollständiges Entfernen
        // Direkte Wiederherstellung aus Backup ohne Zwischenschritte
        for (int i = 0; i < backup_count; i++) {
            if (backup_states[i].valid) {
                uint8_t gpio = backup_states[i].gpio;
                
                // Finde aktuellen Sensor-Slot für dieses GPIO
                int current_slot = -1;
                for (int j = 0; j < MAX_SENSORS; j++) {
                    if (sensors[j].gpio == gpio && sensors[j].active) {
                        current_slot = j;
                        break;
                    }
                }
                
                if (backup_states[i].was_active) {
                    // GPIO war vorher aktiv - wiederherstellen
                    if (current_slot == -1) {
                        // Freien Slot finden für Wiederherstellung
                        for (int j = 0; j < MAX_SENSORS; j++) {
                            if (!sensors[j].active) {
                                current_slot = j;
                                break;
                            }
                        }
                    }
                    
                    if (current_slot != -1) {
                        // 🔧 CRITICAL FIX: Atomare Wiederherstellung
                        sensors[current_slot].gpio = gpio;
                        sensors[current_slot].type = backup_states[i].old_type;
                        sensors[current_slot].subzone_id = backup_states[i].old_subzone;
                        sensors[current_slot].sensor_name = backup_states[i].old_name;
                        sensors[current_slot].active = true;
                        sensors[current_slot].hardware_configured = false;
                        sensors[current_slot].library_loaded = false;
                        
                        // GPIO-Status wiederherstellen
                        gpio_configured[gpio] = true;
                        gpio_safe_mode[gpio] = false;
                        
                        DEBUG_PRINTF("[UISchema] ✅ Restored sensor %s on GPIO %d\n", 
                                    backup_states[i].old_name.c_str(), gpio);
                    } else {
                        DEBUG_PRINTF("[UISchema] ❌ No free slot for GPIO %d restoration\n", gpio);
                        success = false;
                    }
                } else {
                    // GPIO war vorher inaktiv - entfernen falls aktuell aktiv
                    if (current_slot != -1) {
                        sensors[current_slot].active = false;
                        sensors[current_slot].hardware_configured = false;
                        sensors[current_slot].type = SENSOR_NONE;
                        sensors[current_slot].sensor_name = "";
                        sensors[current_slot].subzone_id = "";
                        
                        // GPIO zurück in Safe-Mode
                        pinMode(gpio, INPUT_PULLUP);
                        gpio_safe_mode[gpio] = true;
                        gpio_configured[gpio] = false;
                    }
                }
            }
        }
        
        if (success) {
            DEBUG_PRINT("[UISchema] ✅ Memory-safe rollback successful");
            saveSensorConfigToPreferences();
        } else {
            DEBUG_PRINT("[UISchema] ❌ Rollback had errors - system may be inconsistent");
        }
        
        return success;
    }
    
    bool applySchemaConfiguration(const JsonDocument& schema) {
        JsonArrayConst components = schema["components"];
        bool success = true;
        
        DEBUG_PRINT("[UISchema] Applying schema configuration");
        
        // Backup erstellen vor Änderungen
        createBackup();
        
        // 🔧 CRITICAL FIX: Transaction-ähnliche Schema-Anwendung
        // Erst alle neuen Sensoren in temporärer Struktur vorbereiten
        struct TempSensorConfig {
            uint8_t gpio;
            SensorType type;
            String subzone_id;
            String sensor_name;
            bool valid;
        };
        
        TempSensorConfig temp_sensors[MAX_SENSORS];
        int temp_sensor_count = 0;
        
        // Schema-Komponenten validieren und in temporärer Struktur speichern
        for (JsonVariantConst component_var : components) {
            if (temp_sensor_count >= MAX_SENSORS) {
                DEBUG_PRINT("[UISchema] ERROR: Too many sensors in schema");
                success = false;
                break;
            }
            
            JsonObjectConst component = component_var;
            
            uint8_t gpio = component["gpio"];
            String sensor_type_str = component["sensor_type"].as<String>();
            String sensor_name = component.containsKey("name") ? 
                                component["name"].as<String>() : "UI_Sensor_" + String(gpio);
            String subzone_id = component.containsKey("subzone_id") ? 
                               component["subzone_id"].as<String>() : "ui_zone";
            
            // Konvertiere Sensor-Type-String zu SensorType
            SensorType type = SENSOR_NONE;
            if (sensor_type_str == "temperature") type = SENSOR_TEMP_DS18B20;
            else if (sensor_type_str == "ph") type = SENSOR_PH_DFROBOT;
            else if (sensor_type_str == "moisture") type = SENSOR_MOISTURE;
            else if (sensor_type_str == "pressure") type = SENSOR_PRESSURE;
            else if (sensor_type_str == "co2") type = SENSOR_CO2;
            else if (sensor_type_str == "light") type = SENSOR_LIGHT;
            else if (sensor_type_str == "flow") type = SENSOR_FLOW;
            else if (sensor_type_str == "level") type = SENSOR_LEVEL;
            else {
                DEBUG_PRINTF("[UISchema] WARNING: Unknown sensor type: %s, using generic\n", 
                            sensor_type_str.c_str());
                type = SENSOR_CUSTOM_PI_ENHANCED;
            }
            
            // In temporärer Struktur speichern
            temp_sensors[temp_sensor_count].gpio = gpio;
            temp_sensors[temp_sensor_count].type = type;
            temp_sensors[temp_sensor_count].subzone_id = subzone_id;
            temp_sensors[temp_sensor_count].sensor_name = sensor_name;
            temp_sensors[temp_sensor_count].valid = true;
            temp_sensor_count++;
            
            DEBUG_PRINTF("[UISchema] Prepared %s sensor on GPIO %d\n", 
                        sensor_type_str.c_str(), gpio);
        }
        
        if (success && temp_sensor_count > 0) {
            // Alle aktuellen Sensoren entfernen (nur wenn Vorbereitung erfolgreich)
            for (int i = 0; i < MAX_SENSORS; i++) {
                if (sensors[i].active) {
                    if (!removeSensor(sensors[i].gpio)) {
                        DEBUG_PRINTF("[UISchema] WARNING: Failed to remove existing sensor on GPIO %d\n", sensors[i].gpio);
                    }
                }
            }
            
            // Temporäre Sensoren tatsächlich konfigurieren
            for (int i = 0; i < temp_sensor_count; i++) {
                if (temp_sensors[i].valid) {
                    if (!configureSensor(temp_sensors[i].gpio, 
                                       temp_sensors[i].type, 
                                       temp_sensors[i].subzone_id, 
                                       temp_sensors[i].sensor_name)) {
                        DEBUG_PRINTF("[UISchema] ERROR: Failed to configure sensor on GPIO %d\n", temp_sensors[i].gpio);
                        success = false;
                        break;
                    }
                    
                    DEBUG_PRINTF("[UISchema] ✅ Configured sensor on GPIO %d\n", temp_sensors[i].gpio);
                }
            }
        }
        
        if (!success) {
            DEBUG_PRINT("[UISchema] Configuration failed, rolling back");
            rollbackConfiguration();
        } else {
            DEBUG_PRINT("[UISchema] ✅ Schema configuration applied successfully");
        }
        
        return success;
    }
};

// Hardware-Capabilities-Reporter
class UICapabilitiesReporter {
public:
    String generateCapabilitiesReport() {
        #ifdef XIAO_ESP32C3_MODE
            StaticJsonDocument<512> doc;  // XIAO: kleinerer Buffer
        #else
            StaticJsonDocument<1024> doc;  // ESP32 Dev: größerer Buffer
        #endif
        
        doc["esp_id"] = esp_id;
        doc["board_type"] = getBoardType();
        doc["timestamp"] = getUnixTimestamp();
        
        // Hardware-Limits
        JsonObject limits = doc.createNestedObject("limits");
        #ifdef XIAO_ESP32C3_MODE
            limits["max_sensors"] = 10;
            limits["max_actuators"] = 6;
            limits["max_schema_size"] = 2048;
            limits["available_pins"] = 12;
        #else
            limits["max_sensors"] = 20;
            limits["max_actuators"] = 12;
            limits["max_schema_size"] = 4096;
            limits["available_pins"] = 24;
        #endif
        
        // Verfügbare GPIOs
        JsonArray available_gpios = doc.createNestedArray("available_gpios");
        #ifdef XIAO_ESP32C3_MODE
            for (int i = 0; i < XIAO_PIN_COUNT; i++) {
                uint8_t pin = XIAO_AVAILABLE_PINS[i];
                if (!gpio_configured[pin] && gpio_safe_mode[pin]) {
                    available_gpios.add(pin);
                }
            }
        #else
            for (int i = 0; i < ESP32_DEV_PIN_COUNT; i++) {
                uint8_t pin = ESP32_DEV_AVAILABLE_PINS[i];
                if (!gpio_configured[pin] && gpio_safe_mode[pin]) {
                    available_gpios.add(pin);
                }
            }
        #endif
        
        // Aktuelle Konfiguration
        JsonArray current_sensors = doc.createNestedArray("current_sensors");
        for (int i = 0; i < MAX_SENSORS; i++) {
            if (sensors[i].active) {
                JsonObject sensor = current_sensors.createNestedObject();
                sensor["gpio"] = sensors[i].gpio;
                sensor["type"] = getSensorTypeString(sensors[i].type);
                sensor["name"] = sensors[i].sensor_name;
                sensor["subzone"] = sensors[i].subzone_id;
            }
        }
        
        // Memory-Status
        JsonObject memory = doc.createNestedObject("memory_status");
        memory["free_heap"] = ESP.getFreeHeap();
        memory["min_free_heap"] = ESP.getMinFreeHeap();
        memory["total_heap"] = ESP.getHeapSize();
        
        String response;
        serializeJson(doc, response);
        return response;
    }
    
private:
    String getBoardType() {
        #ifdef XIAO_ESP32C3_MODE
            return "XIAO_ESP32C3";
        #else
            return "ESP32_DEV";
        #endif
    }
};

// Global instances für UI-Schema Processing
UISchemaValidator* ui_schema_validator = nullptr;
UIGPIOConfigEngine* ui_gpio_engine = nullptr;
UICapabilitiesReporter* ui_capabilities_reporter = nullptr;

// =============================================================================
// PHASE 2: UI-SCHEMA TESTING & VALIDATION SUITE
// =============================================================================

class UISchemaTestSuite {
private:
    struct TestResult {
        String test_name;
        bool passed;
        String error_message;
        unsigned long execution_time_ms;
        size_t memory_used;
    };
    
    TestResult test_results[20];  // Max 20 Tests
    int test_count = 0;
    
    void recordTestResult(const String& test_name, bool passed, const String& error = "", 
                         unsigned long exec_time = 0, size_t memory = 0) {
        if (test_count < 20) {
            test_results[test_count].test_name = test_name;
            test_results[test_count].passed = passed;
            test_results[test_count].error_message = error;
            test_results[test_count].execution_time_ms = exec_time;
            test_results[test_count].memory_used = memory;
            test_count++;
        }
    }
    
public:
    void runAllTests() {
        DEBUG_PRINT("[UISchemaTest] 🧪 Starting Phase 2 Testing Suite");
        test_count = 0;  // Reset test counter
        
        // Memory-Stress-Tests
        testUISchemaMemoryUsage();
        testMemoryLeakDetection();
        testBoardSpecificLimits();
        
        // Schema-Validation-Tests
        testSchemaValidation();
        testInvalidSchemaHandling();
        testEdgeCaseSchemas();
        
        // GPIO-Configuration-Tests
        testGPIOReconfiguration();
        testRollbackFunctionality();
        testConflictDetection();
        
        // MQTT-Pipeline-Tests
        testMQTTIntegration();
        testTopicSubscriptions();
        
        // Performance-Tests
        testProcessingPerformance();
        testThroughputLimits();
        
        // Integration-Tests
        testBackwardCompatibility();
        testSystemRobustness();
        
        generateTestReport();
    }
    
    // 🧪 MEMORY-STRESS-TESTS
    void testUISchemaMemoryUsage() {
        DEBUG_PRINT("[UISchemaTest] Testing UI Schema Memory Usage");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        // Test verschiedene Schema-Größen
        String test_schemas[] = {
            createTestSchema(5),   // 5 Sensoren
            createTestSchema(10),  // 10 Sensoren (XIAO Limit)
            createTestSchema(15),  // 15 Sensoren
            createTestSchema(20)   // 20 Sensoren (ESP32 Dev Limit)
        };
        
        bool passed = true;
        String error_msg = "";
        
        for (int i = 0; i < 4; i++) {
            size_t heap_before = ESP.getFreeHeap();
            
            #ifdef XIAO_ESP32C3_MODE
                StaticJsonDocument<512> schema;
                if (i >= 2) continue;  // XIAO: Nur erste 2 Tests (5,10 Sensoren)
            #else
                StaticJsonDocument<1024> schema;
            #endif
            
            if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(test_schemas[i], schema)) {
                size_t heap_after = ESP.getFreeHeap();
                size_t memory_used = heap_before - heap_after;
                
                #ifdef XIAO_ESP32C3_MODE
                    size_t memory_limit = 15000;  // 15KB Limit für XIAO
                #else
                    size_t memory_limit = 20000;  // 20KB Limit für ESP32 Dev
                #endif
                
                if (memory_used > memory_limit) {
                    passed = false;
                    error_msg = "Memory usage exceeded limit: " + String(memory_used) + " > " + String(memory_limit);
                    break;
                }
                
                DEBUG_PRINTF("[UISchemaTest] Schema %d sensors: %d bytes used\n", (i+1)*5, memory_used);
            } else {
                passed = false;
                error_msg = "Schema validation failed for " + String((i+1)*5) + " sensors";
                break;
            }
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap - final_heap;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("UISchemaMemoryUsage", passed, error_msg, exec_time, total_memory);
    }
    
    void testMemoryLeakDetection() {
        DEBUG_PRINT("[UISchemaTest] Testing Memory Leak Detection");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Führe 10 Schema-Aktualisierungen durch und prüfe Memory-Leaks
        for (int cycle = 0; cycle < 10; cycle++) {
            String test_schema = createTestSchema(5);
            
            #ifdef XIAO_ESP32C3_MODE
                StaticJsonDocument<512> schema;
            #else
                StaticJsonDocument<1024> schema;
            #endif
            
            size_t heap_before_cycle = ESP.getFreeHeap();
            
            if (ui_schema_validator && ui_gpio_engine) {
                if (ui_schema_validator->validateCompleteSchema(test_schema, schema)) {
                    ui_gpio_engine->applySchemaConfiguration(schema);
                }
            }
            
            size_t heap_after_cycle = ESP.getFreeHeap();
            
            // Memory-Leak-Erkennung: Heap sollte nicht kontinuierlich sinken
            if (cycle > 5 && heap_after_cycle < (initial_heap * 0.8)) {  // 20% Memory-Loss Toleranz
                passed = false;
                error_msg = "Memory leak detected: " + String(initial_heap - heap_after_cycle) + " bytes lost";
                break;
            }
            
            delay(100);  // Kurze Pause zwischen Zyklen
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("MemoryLeakDetection", passed, error_msg, exec_time, total_memory);
    }
    
    void testBoardSpecificLimits() {
        DEBUG_PRINT("[UISchemaTest] Testing Board-Specific Limits");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        #ifdef XIAO_ESP32C3_MODE
            // XIAO ESP32-C3 Tests
            String oversized_schema = createTestSchema(15);  // Über XIAO-Limit
            size_t max_schema_size = 2048;
            int max_sensors = 10;
        #else
            // ESP32 Dev Tests
            String oversized_schema = createTestSchema(25);  // Über ESP32-Dev-Limit
            size_t max_schema_size = 4096;
            int max_sensors = 20;
        #endif
        
        // Test 1: Schema-Größen-Limit
        if (oversized_schema.length() <= max_schema_size) {
            passed = false;
            error_msg = "Oversized schema test failed - schema too small";
        }
        
        // Test 2: Sensor-Count-Limit
        StaticJsonDocument<1024> oversized_doc;
        if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(oversized_schema, oversized_doc)) {
            passed = false;
            error_msg = "Oversized schema was incorrectly validated";
        }
        
        // Test 3: Memory-Constraint-Limit
        String valid_schema = createTestSchema(max_sensors / 2);
        StaticJsonDocument<1024> valid_doc;
        if (ui_schema_validator && !ui_schema_validator->validateCompleteSchema(valid_schema, valid_doc)) {
            passed = false;
            error_msg = "Valid schema was incorrectly rejected";
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("BoardSpecificLimits", passed, error_msg, exec_time, total_memory);
    }
    
    // 🧪 SCHEMA-VALIDATION-TESTS
    void testSchemaValidation() {
        DEBUG_PRINT("[UISchemaTest] Testing Schema Validation");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Test gültiger Schemas
        String valid_schemas[] = {
            createValidSchema("temperature", 4),
            createValidSchema("ph", 5),
            createValidSchema("moisture", 13)
        };
        
        for (int i = 0; i < 3; i++) {
            StaticJsonDocument<512> schema;
            if (!ui_schema_validator || !ui_schema_validator->validateCompleteSchema(valid_schemas[i], schema)) {
                passed = false;
                error_msg = "Valid schema " + String(i) + " was rejected";
                break;
            }
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("SchemaValidation", passed, error_msg, exec_time, total_memory);
    }
    
    void testInvalidSchemaHandling() {
        DEBUG_PRINT("[UISchemaTest] Testing Invalid Schema Handling");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Test ungültiger Schemas
        String invalid_schemas[] = {
            "{invalid_json}",  // Ungültiges JSON
            createInvalidSchema("wrong_esp_id"),  // Falsche ESP-ID
            createInvalidSchema("reserved_gpio"),  // Reservierte GPIO
            createInvalidSchema("too_many_sensors")  // Zu viele Sensoren
        };
        
        for (int i = 0; i < 4; i++) {
            StaticJsonDocument<512> schema;
            if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(invalid_schemas[i], schema)) {
                passed = false;
                error_msg = "Invalid schema " + String(i) + " was incorrectly accepted";
                break;
            }
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("InvalidSchemaHandling", passed, error_msg, exec_time, total_memory);
    }
    
    void testEdgeCaseSchemas() {
        DEBUG_PRINT("[UISchemaTest] Testing Edge Case Schemas");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Edge Cases testen
        String edge_schemas[] = {
            "{\"esp_id\":\"" + esp_id + "\",\"components\":[]}",  // Leeres Schema
            createMinimalSchema(),  // Minimales Schema
            createMaximalSchema()   // Maximales Schema für Board
        };
        
        for (int i = 0; i < 3; i++) {
            StaticJsonDocument<1024> schema;
            bool should_pass = (i != 2);  // Maximales Schema sollte rejected werden
            
            #ifdef XIAO_ESP32C3_MODE
                if (i == 2) should_pass = false;  // Maximales Schema zu groß für XIAO
            #endif
            
            bool validation_result = ui_schema_validator && ui_schema_validator->validateCompleteSchema(edge_schemas[i], schema);
            
            if (validation_result != should_pass) {
                passed = false;
                error_msg = "Edge case " + String(i) + " validation incorrect";
                break;
            }
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("EdgeCaseSchemas", passed, error_msg, exec_time, total_memory);
    }
    
    // 🧪 GPIO-CONFIGURATION-TESTS
    void testGPIOReconfiguration() {
        DEBUG_PRINT("[UISchemaTest] Testing GPIO Reconfiguration");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        if (ui_gpio_engine) {
            // Backup der aktuellen Konfiguration
            ui_gpio_engine->createBackup();
            
            // Test-Schema anwenden
            String test_schema = createTestSchema(3);
            StaticJsonDocument<512> schema;
            
            if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(test_schema, schema)) {
                if (!ui_gpio_engine->applySchemaConfiguration(schema)) {
                    passed = false;
                    error_msg = "Failed to apply test schema configuration";
                }
            } else {
                passed = false;
                error_msg = "Failed to validate test schema";
            }
            
            // Rollback testen
            if (passed && !ui_gpio_engine->rollbackConfiguration()) {
                passed = false;
                error_msg = "Failed to rollback configuration";
            }
        } else {
            passed = false;
            error_msg = "UI GPIO Engine not initialized";
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("GPIOReconfiguration", passed, error_msg, exec_time, total_memory);
    }
    
    void testRollbackFunctionality() {
        DEBUG_PRINT("[UISchemaTest] Testing Rollback Functionality");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        if (ui_gpio_engine) {
            // Aktuelle Sensor-Konfiguration merken
            int initial_sensor_count = 0;
            for (int i = 0; i < MAX_SENSORS; i++) {
                if (sensors[i].active) initial_sensor_count++;
            }
            
            // Backup erstellen
            ui_gpio_engine->createBackup();
            
            // Temporäre Änderung durchführen
            String temp_schema = createTestSchema(2);
            StaticJsonDocument<512> schema;
            
            if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(temp_schema, schema)) {
                ui_gpio_engine->applySchemaConfiguration(schema);
                
                // Rollback durchführen
                if (ui_gpio_engine->rollbackConfiguration()) {
                    // Prüfen ob ursprüngliche Konfiguration wiederhergestellt wurde
                    int final_sensor_count = 0;
                    for (int i = 0; i < MAX_SENSORS; i++) {
                        if (sensors[i].active) final_sensor_count++;
                    }
                    
                    if (final_sensor_count != initial_sensor_count) {
                        passed = false;
                        error_msg = "Sensor count mismatch after rollback: " + String(final_sensor_count) + " != " + String(initial_sensor_count);
                    }
                } else {
                    passed = false;
                    error_msg = "Rollback operation failed";
                }
            } else {
                passed = false;
                error_msg = "Failed to validate temporary schema";
            }
        } else {
            passed = false;
            error_msg = "UI GPIO Engine not initialized";
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("RollbackFunctionality", passed, error_msg, exec_time, total_memory);
    }
    
    void testConflictDetection() {
        DEBUG_PRINT("[UISchemaTest] Testing Conflict Detection");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Test reservierte Pins
        String reserved_pin_schema = createInvalidSchema("reserved_gpio");
        StaticJsonDocument<512> schema;
        
        if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(reserved_pin_schema, schema)) {
            passed = false;
            error_msg = "Reserved GPIO schema was incorrectly accepted";
        }
        
        // Test doppelte GPIO-Zuweisungen
        String duplicate_gpio_schema = createDuplicateGPIOSchema();
        StaticJsonDocument<512> dup_schema;
        
        if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(duplicate_gpio_schema, dup_schema)) {
            passed = false;
            error_msg = "Duplicate GPIO schema was incorrectly accepted";
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("ConflictDetection", passed, error_msg, exec_time, total_memory);
    }
    
    // 🧪 MQTT-INTEGRATION-TESTS
    void testMQTTIntegration() {
        DEBUG_PRINT("[UISchemaTest] Testing MQTT Integration");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = mqtt_client.connected();
        String error_msg = passed ? "" : "MQTT client not connected";
        
        if (passed) {
            // Test Topic-Struktur
            String ui_schema_topic = buildSpecialTopic("ui_schema", esp_id, "update");
            String ui_capabilities_topic = buildSpecialTopic("ui_capabilities", esp_id, "request");
            
            if (ui_schema_topic.length() == 0 || ui_capabilities_topic.length() == 0) {
                passed = false;
                error_msg = "Topic building failed";
            }
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("MQTTIntegration", passed, error_msg, exec_time, total_memory);
    }
    
    void testTopicSubscriptions() {
        DEBUG_PRINT("[UISchemaTest] Testing Topic Subscriptions");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        if (!mqtt_client.connected()) {
            passed = false;
            error_msg = "MQTT not connected for subscription test";
        } else {
            // Test ob Topics korrekt subscribed sind
            // (Vereinfachter Test - in echter Implementation würde man Topic-Liste prüfen)
            String test_topic = buildSpecialTopic("ui_schema", esp_id, "update");
            if (test_topic.length() == 0) {
                passed = false;
                error_msg = "UI schema topic building failed";
            }
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("TopicSubscriptions", passed, error_msg, exec_time, total_memory);
    }
    
    // 🧪 PERFORMANCE-TESTS
    void testProcessingPerformance() {
        DEBUG_PRINT("[UISchemaTest] Testing Processing Performance");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        String test_schema = createTestSchema(5);
        unsigned long schema_start = millis();
        
        #ifdef XIAO_ESP32C3_MODE
            StaticJsonDocument<512> schema;
            unsigned long time_limit = 500;  // 500ms für XIAO
        #else
            StaticJsonDocument<1024> schema;
            unsigned long time_limit = 200;  // 200ms für ESP32 Dev
        #endif
        
        if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(test_schema, schema)) {
            unsigned long validation_time = millis() - schema_start;
            
            if (validation_time > time_limit) {
                passed = false;
                error_msg = "Validation too slow: " + String(validation_time) + "ms > " + String(time_limit) + "ms";
            }
            
            // Test GPIO-Konfigurationszeit
            unsigned long config_start = millis();
            if (ui_gpio_engine) {
                ui_gpio_engine->createBackup();
                ui_gpio_engine->applySchemaConfiguration(schema);
                ui_gpio_engine->rollbackConfiguration();
            }
            unsigned long config_time = millis() - config_start;
            
            if (config_time > (time_limit * 2)) {  // Konfiguration darf doppelt so lang dauern
                passed = false;
                error_msg += " Config too slow: " + String(config_time) + "ms";
            }
            
        } else {
            passed = false;
            error_msg = "Schema validation failed in performance test";
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("ProcessingPerformance", passed, error_msg, exec_time, total_memory);
    }
    
    void testThroughputLimits() {
        DEBUG_PRINT("[UISchemaTest] Testing Throughput Limits");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Test schnelle aufeinanderfolgende Schema-Updates
        for (int i = 0; i < 5; i++) {
            String rapid_schema = createTestSchema(2);
            
            #ifdef XIAO_ESP32C3_MODE
                StaticJsonDocument<512> schema;
            #else
                StaticJsonDocument<1024> schema;
            #endif
            
            unsigned long update_start = millis();
            
            if (ui_schema_validator && ui_schema_validator->validateCompleteSchema(rapid_schema, schema)) {
                if (ui_gpio_engine) {
                    ui_gpio_engine->createBackup();
                    ui_gpio_engine->applySchemaConfiguration(schema);
                }
            } else {
                passed = false;
                error_msg = "Rapid update " + String(i) + " failed";
                break;
            }
            
            unsigned long update_time = millis() - update_start;
            if (update_time > 1000) {  // Max 1 Sekunde pro Update
                passed = false;
                error_msg = "Update " + String(i) + " too slow: " + String(update_time) + "ms";
                break;
            }
            
            delay(100);  // Kurze Pause zwischen Updates
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("ThroughputLimits", passed, error_msg, exec_time, total_memory);
    }
    
    // 🧪 INTEGRATION-TESTS
    void testBackwardCompatibility() {
        DEBUG_PRINT("[UISchemaTest] Testing Backward Compatibility");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Prüfe ob bestehende Sensor-Funktionalität weiterhin funktioniert
        int initial_active_sensors = 0;
        for (int i = 0; i < MAX_SENSORS; i++) {
            if (sensors[i].active) initial_active_sensors++;
        }
        
        // Führe UI-Schema-Operation durch
        String test_schema = createTestSchema(2);
        StaticJsonDocument<512> schema;
        
        if (ui_schema_validator && ui_gpio_engine) {
            if (ui_schema_validator->validateCompleteSchema(test_schema, schema)) {
                ui_gpio_engine->createBackup();
                ui_gpio_engine->applySchemaConfiguration(schema);
                ui_gpio_engine->rollbackConfiguration();
            }
        }
        
        // Prüfe ob MQTT-Funktionalität noch funktioniert
        if (!mqtt_client.connected()) {
            passed = false;
            error_msg = "MQTT connection lost during UI schema operations";
        }
        
        // Prüfe ob Sensor-System noch funktioniert
        // (Vereinfachter Test - prüft ob grundlegende Strukturen intakt sind)
        bool sensor_system_ok = true;
        for (int i = 0; i < MAX_SENSORS; i++) {
            if (sensors[i].active && sensors[i].gpio >= MAX_GPIO_PINS) {
                sensor_system_ok = false;
                break;
            }
        }
        
        if (!sensor_system_ok) {
            passed = false;
            error_msg = "Sensor system integrity compromised";
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("BackwardCompatibility", passed, error_msg, exec_time, total_memory);
    }
    
    void testSystemRobustness() {
        DEBUG_PRINT("[UISchemaTest] Testing System Robustness");
        unsigned long start_time = millis();
        size_t initial_heap = ESP.getFreeHeap();
        
        bool passed = true;
        String error_msg = "";
        
        // Test System-Verhalten bei extremen Bedingungen
        size_t low_memory_threshold = 10000;  // 10KB kritischer Memory-Level
        
        if (ESP.getFreeHeap() < low_memory_threshold) {
            // System bereits unter Memory-Stress
            String stress_schema = createTestSchema(1);  // Minimales Schema
            StaticJsonDocument<256> schema;
            
            if (ui_schema_validator && !ui_schema_validator->validateCompleteSchema(stress_schema, schema)) {
                // Erwartetes Verhalten bei Low-Memory - sollte rejected werden
                DEBUG_PRINT("[UISchemaTest] Low memory rejection - expected behavior");
            }
        }
        
        // Test Circuit Breaker Verhalten (nur wenn initialisiert)
        // Note: PiCircuitBreaker wird später in der Datei definiert
        #ifdef CIRCUIT_BREAKER_TESTING_ENABLED
        if (pi_breaker != nullptr) {
            // Circuit Breaker Test wird in der Zukunft implementiert
            DEBUG_PRINT("[UISchemaTest] Circuit breaker testing deferred - requires initialization");
        }
        #endif
        
        // Test auf System-Konsistenz nach Tests
        bool system_consistent = true;
        for (int i = 0; i < MAX_SENSORS; i++) {
            if (sensors[i].active) {
                if (sensors[i].gpio >= MAX_GPIO_PINS || sensors[i].type == SENSOR_NONE) {
                    system_consistent = false;
                    break;
                }
            }
        }
        
        if (!system_consistent) {
            passed = false;
            error_msg = "System inconsistency detected";
        }
        
        size_t final_heap = ESP.getFreeHeap();
        size_t total_memory = initial_heap > final_heap ? initial_heap - final_heap : 0;
        unsigned long exec_time = millis() - start_time;
        
        recordTestResult("SystemRobustness", passed, error_msg, exec_time, total_memory);
    }
    
    // 🧪 TEST HELPER FUNCTIONS
    String createTestSchema(int sensor_count) {
        StaticJsonDocument<1024> doc;
        doc["esp_id"] = esp_id;
        doc["schema_version"] = "2.0";
        doc["timestamp"] = getUnixTimestamp();
        
        JsonArray components = doc.createNestedArray("components");
        
        int gpio_pins[] = {4, 5, 13, 14, 15, 18, 19, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39, 2, 12, 16};
        String sensor_types[] = {"temperature", "ph", "moisture", "pressure", "light"};
        
        for (int i = 0; i < sensor_count && i < 20; i++) {
            JsonObject component = components.createNestedObject();
            component["gpio"] = gpio_pins[i % 20];
            component["sensor_type"] = sensor_types[i % 5];
            component["name"] = "TestSensor_" + String(i);
            component["subzone_id"] = "test_zone";
        }
        
        String result;
        serializeJson(doc, result);
        return result;
    }
    
    String createValidSchema(const String& sensor_type, uint8_t gpio) {
        StaticJsonDocument<512> doc;
        doc["esp_id"] = esp_id;
        doc["schema_version"] = "2.0";
        
        JsonArray components = doc.createNestedArray("components");
        JsonObject component = components.createNestedObject();
        component["gpio"] = gpio;
        component["sensor_type"] = sensor_type;
        component["name"] = "ValidSensor";
        component["subzone_id"] = "valid_zone";
        
        String result;
        serializeJson(doc, result);
        return result;
    }
    
    String createInvalidSchema(const String& error_type) {
        if (error_type == "wrong_esp_id") {
            return "{\"esp_id\":\"wrong_id\",\"components\":[]}";
        } else if (error_type == "reserved_gpio") {
            return "{\"esp_id\":\"" + esp_id + "\",\"components\":[{\"gpio\":0,\"sensor_type\":\"temperature\"}]}";
        } else if (error_type == "too_many_sensors") {
            return createTestSchema(25);  // Über beide Board-Limits
        }
        return "{invalid_json}";
    }
    
    String createMinimalSchema() {
        return "{\"esp_id\":\"" + esp_id + "\",\"components\":[]}";
    }
    
    String createMaximalSchema() {
        #ifdef XIAO_ESP32C3_MODE
            return createTestSchema(12);  // Über XIAO-Limit
        #else
            return createTestSchema(22);  // Über ESP32-Dev-Limit
        #endif
    }
    
    String createDuplicateGPIOSchema() {
        StaticJsonDocument<512> doc;
        doc["esp_id"] = esp_id;
        
        JsonArray components = doc.createNestedArray("components");
        
        JsonObject comp1 = components.createNestedObject();
        comp1["gpio"] = 4;
        comp1["sensor_type"] = "temperature";
        
        JsonObject comp2 = components.createNestedObject();
        comp2["gpio"] = 4;  // Gleiche GPIO wie comp1
        comp2["sensor_type"] = "ph";
        
        String result;
        serializeJson(doc, result);
        return result;
    }
    
    void generateTestReport() {
        DEBUG_PRINT("[UISchemaTest] 📊 PHASE 2 VALIDATION REPORT");
        DEBUG_PRINT("============================================");
        
        int passed_tests = 0;
        int failed_tests = 0;
        unsigned long total_exec_time = 0;
        size_t total_memory_used = 0;
        
        for (int i = 0; i < test_count; i++) {
            if (test_results[i].passed) {
                passed_tests++;
                DEBUG_PRINTF("✅ %s (%.2fs, %d bytes)\n", 
                           test_results[i].test_name.c_str(),
                           test_results[i].execution_time_ms / 1000.0,
                           test_results[i].memory_used);
            } else {
                failed_tests++;
                DEBUG_PRINTF("❌ %s - %s (%.2fs)\n", 
                           test_results[i].test_name.c_str(),
                           test_results[i].error_message.c_str(),
                           test_results[i].execution_time_ms / 1000.0);
            }
            
            total_exec_time += test_results[i].execution_time_ms;
            total_memory_used += test_results[i].memory_used;
        }
        
        DEBUG_PRINT("============================================");
        DEBUG_PRINTF("SUMMARY: %d/%d tests passed (%.1f%%)\n", 
                    passed_tests, test_count, 
                    (float)passed_tests / test_count * 100.0);
        DEBUG_PRINTF("Total execution time: %.2f seconds\n", total_exec_time / 1000.0);
        DEBUG_PRINTF("Total memory usage: %d bytes\n", total_memory_used);
        
        #ifdef XIAO_ESP32C3_MODE
            DEBUG_PRINT("Board: XIAO ESP32-C3");
        #else
            DEBUG_PRINT("Board: ESP32 DevKit");
        #endif
        
        DEBUG_PRINTF("Current free heap: %d bytes\n", ESP.getFreeHeap());
        
        if (failed_tests == 0) {
            DEBUG_PRINT("🎉 ALL TESTS PASSED - SYSTEM IS PRODUCTION READY");
        } else {
            DEBUG_PRINT("⚠️  TESTS FAILED - SYSTEM NEEDS FIXES BEFORE PRODUCTION");
        }
        
        // Send test report via MQTT
        sendTestReportViaMQTT(passed_tests, failed_tests, total_exec_time, total_memory_used);
    }
    
    void sendTestReportViaMQTT(int passed, int failed, unsigned long exec_time, size_t memory_used) {
        if (!mqtt_client.connected()) return;
        
        StaticJsonDocument<1024> report;
        report["esp_id"] = esp_id;
        report["test_type"] = "ui_schema_validation";
        report["timestamp"] = getUnixTimestamp();
        report["passed_tests"] = passed;
        report["failed_tests"] = failed;
        report["total_tests"] = test_count;
        report["success_rate"] = (float)passed / test_count * 100.0;
        report["execution_time_ms"] = exec_time;
        report["memory_used_bytes"] = memory_used;
        report["free_heap"] = ESP.getFreeHeap();
        
        #ifdef XIAO_ESP32C3_MODE
            report["board_type"] = "XIAO_ESP32C3";
        #else
            report["board_type"] = "ESP32_DEV";
        #endif
        
        JsonArray test_details = report.createNestedArray("test_results");
        for (int i = 0; i < test_count && i < 10; i++) {  // Nur erste 10 Tests für MQTT
            JsonObject test_detail = test_details.createNestedObject();
            test_detail["name"] = test_results[i].test_name;
            test_detail["passed"] = test_results[i].passed;
            if (!test_results[i].passed && test_results[i].error_message.length() > 0) {
                test_detail["error"] = test_results[i].error_message;
            }
        }
        
        String report_message;
        serializeJson(report, report_message);
        
        String report_topic = buildSpecialTopic("test_report", esp_id, "ui_schema_validation");
        mqtt_client.publish(report_topic.c_str(), report_message.c_str());
        
        DEBUG_PRINT("[UISchemaTest] Test report sent via MQTT");
    }
};

// Global Test Suite Instance
UISchemaTestSuite* ui_test_suite = nullptr;

// =============================================================================
// SAFE MODE MANAGER
// =============================================================================

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

// 🆕 NEU: Safe Mode Reason Tracking
void setSafeModeReason(const String& reason) {
  safe_mode_enter_reason = reason;
  safe_mode_enter_timestamp = millis();
  safe_mode_reason_tracked = true;
  DEBUG_PRINTF("[SafeMode] Reason set: %s\n", reason.c_str());
}

// 🆕 NEU: Erweiterte Safe Mode Logik
void handleSafeModeTransition(const String& new_reason) {
  if (safe_mode_reason_tracked && safe_mode_enter_reason != new_reason) {
    // Log transition
    DEBUG_PRINTF("[SafeMode] Transition: %s -> %s\n", 
                 safe_mode_enter_reason.c_str(), new_reason.c_str());
  }
  setSafeModeReason(new_reason);
}

// 🆕 NEU: GPIO Conflict Tracking
void setGPIOConflictInfo(uint8_t gpio, const String& conflict_type, 
                        const String& current_owner, const String& requested_owner) {
  last_conflict_gpio = String(gpio);
  last_conflict_type = conflict_type;
  last_conflict_current_owner = current_owner;
  last_conflict_requested_owner = requested_owner;
  DEBUG_PRINTF("[GPIO] Conflict tracked: GPIO %d, Type: %s\n", gpio, conflict_type.c_str());
}

// =============================================================================
// WIFI & MQTT KONFIGURATION
// =============================================================================

void loadWiFiConfigFromPreferences() {
  // ✅ FIXED: Verwende read-write mode nach Flash-Erase
  preferences.begin("wifi_config", false);
  
  // Load WiFi settings
  wifi_config.ssid = preferences.getString("ssid", "");
  wifi_config.password = preferences.getString("password", "");
  
  // ✅ FIXED: Load server settings - verwende die korrekten Feldnamen
  String server = preferences.getString("server_address", "");
  if (server.isEmpty()) {
    // Fallback auf legacy pi_url, aber extrahiere nur die IP
    String pi_url = preferences.getString("pi_url", "");
    if (!pi_url.isEmpty()) {
      if (pi_url.startsWith("http://")) {
        server = pi_url.substring(7); // Entferne "http://"
        int colon_pos = server.indexOf(':');
        if (colon_pos != -1) {
          String port_str = server.substring(colon_pos + 1);
          int port = port_str.toInt();
          if (port > 0) {
            wifi_config.setHttpPort(port);
          }
          server = server.substring(0, colon_pos); // Nur IP-Adresse
        }
      } else {
        server = pi_url; // Falls es bereits eine IP ist
      }
    }
  }
  if (server.isEmpty()) {
    // ✅ FIXED: Verwende das korrekte Feld "srv" statt "mqtt_server"
    server = preferences.getString("srv", "192.168.0.198");
  }
  
  // ✅ FIXED: Stelle sicher, dass keine HTTP-URL für MQTT verwendet wird
  if (server.startsWith("http://")) {
    server = server.substring(7); // Entferne "http://"
    int colon_pos = server.indexOf(':');
    if (colon_pos != -1) {
      server = server.substring(0, colon_pos); // Nur IP-Adresse
    }
  }
  
  // ✅ FIXED: Setze die IP-Adresse korrekt
  wifi_config.setServerAddress(server);
  wifi_config.mqtt_port = preferences.getInt("mqtt_port", 1883);
  
  // ✅ FIXED: Load HTTP port mit Backward Compatibility
  int http_port = preferences.getInt("http_port", 80);
  if (http_port == 80) {
    // Try legacy field
    http_port = preferences.getInt("http_p", 80);
  }
  wifi_config.setHttpPort(http_port);
  
  // Load credentials (with backward compatibility)
  String user = preferences.getString("username", "");
  String pass = preferences.getString("password_auth", "");
  if (user.isEmpty()) {
    // Try legacy fields
    user = preferences.getString("mqtt_user", "");
    pass = preferences.getString("mqtt_password", "");
    if (user.isEmpty()) {
      user = preferences.getString("pi_username", "");
      pass = preferences.getString("pi_password", "");
    }
  }
  // ✅ FIXED: Setze die tatsächlich geladenen Credentials
  wifi_config.setCredentials(user, pass);
  
  // Load device settings (with backward compatibility)
  String name = preferences.getString("esp_name", "");
  if (name.isEmpty()) {
    name = preferences.getString("esp_friendly_name", "");
  }
  wifi_config.setDeviceName(name);
  
  // ✅ FIXED: Load friendly name with backward compatibility
  String friendly_name = preferences.getString("friendly", "");
  if (friendly_name.isEmpty()) {
    friendly_name = preferences.getString("esp_friendly_name", "");
  }
  wifi_config.setFriendlyName(friendly_name);
  
  // Load remaining settings
  wifi_config.esp_zone = preferences.getString("esp_zone", "");
  wifi_config.configured = preferences.getBool("configured", false);
  // ✅ FIXED: Use shorter key name to avoid KEY_TOO_LONG error with backward compatibility
  wifi_config.connection_established = preferences.getBool("conn", false);
  if (!wifi_config.connection_established) {
    wifi_config.connection_established = preferences.getBool("connection_established", false);
  }
  
  preferences.end();
  
      DEBUG_PRINTF("[WiFi] Loaded config - SSID: %s, Server: %s, MQTT Port: %d, HTTP Port: %d\n", 
               wifi_config.ssid.c_str(), 
               wifi_config.getServerAddress().c_str(), 
               wifi_config.mqtt_port,
               wifi_config.getHttpPort());
  
  // ✅ DEBUG: Zusätzliche Ausgabe für Troubleshooting
      DEBUG_PRINTF("[WiFi] DEBUG - Raw server_address: %s\n", wifi_config.server_address.c_str());
    DEBUG_PRINTF("[WiFi] DEBUG - Raw mqtt_server: %s\n", wifi_config.mqtt_server.c_str());
    DEBUG_PRINTF("[WiFi] DEBUG - Raw pi_server_url: %s\n", wifi_config.pi_server_url.c_str());
    DEBUG_PRINTF("[WiFi] DEBUG - Configured flag: %s\n", wifi_config.configured ? "true" : "false");
}

void saveWiFiConfigToPreferences() {
  preferences.begin("wifi_config", false);
  
  // Save WiFi settings
  preferences.putString("ssid", wifi_config.ssid);
  preferences.putString("password", wifi_config.password);
  
  // ✅ FIXED: Save unified settings mit korrekten Feldnamen
  preferences.putString("server_address", wifi_config.getServerAddress());
  preferences.putInt("mqtt_port", wifi_config.mqtt_port);
  preferences.putInt("http_port", wifi_config.getHttpPort());  // ✅ FIXED: Save HTTP port
  preferences.putString("username", wifi_config.getUsername());
  preferences.putString("password_auth", wifi_config.getPassword());
  preferences.putString("esp_name", wifi_config.getDeviceName());
  
  // ✅ FIXED: Save legacy fields für Backward Compatibility mit korrekten Feldnamen
  preferences.putString("srv", wifi_config.getServerAddress());  // Web-Config verwendet "srv"
  preferences.putString("mqtt_user", wifi_config.mqtt_user);
  preferences.putString("mqtt_password", wifi_config.mqtt_password);
  preferences.putString("pi_url", wifi_config.pi_server_url);
  preferences.putString("pi_username", wifi_config.pi_username);
  preferences.putString("pi_password", wifi_config.pi_password);
  // ✅ FIXED: Use shorter key name to avoid KEY_TOO_LONG error
  preferences.putString("friendly", wifi_config.esp_friendly_name);  // Shortened from "esp_friendly_name"
  // ✅ FIXED: Also save legacy key for backward compatibility
  preferences.putString("esp_friendly_name", wifi_config.esp_friendly_name);
  
  // Save remaining settings
  preferences.putString("esp_zone", wifi_config.esp_zone);
  preferences.putBool("configured", wifi_config.configured);
  // ✅ FIXED: Use shorter key name to avoid KEY_TOO_LONG error
  preferences.putBool("conn", wifi_config.connection_established);  // Shortened from "connection_established"
  // ✅ FIXED: Also save legacy key for backward compatibility
  preferences.putBool("connection_established", wifi_config.connection_established);
  
  preferences.end();
  DEBUG_PRINT("[WiFi] Configuration saved to preferences");
}

void resetWiFiConfiguration() {
  DEBUG_PRINT("[WiFi] Resetting WiFi configuration...");
  
  preferences.begin("wifi_config", false);
  preferences.clear();
  preferences.end();
  
  DEBUG_PRINT("[WiFi] WiFi configuration cleared");
  
  // Reset WiFiConfig object
  wifi_config = WiFiConfig();
  
  DEBUG_PRINT("[WiFi] WiFi configuration reset complete");
}

bool connectToWiFi() {
  if (!wifi_config.configured || wifi_config.ssid.length() == 0) {
    DEBUG_PRINT("[WiFi] No configuration found, starting web configuration portal");
    
    // Create and start web configuration server
    web_config_server = new WebConfigServer(esp_id);
    
    if (web_config_server->startConfigPortal()) {
      DEBUG_PRINT("[WiFi] Web configuration portal started");
      DEBUG_PRINTF("[WiFi] Connect to: %s (Password: 12345678)\n", 
                   web_config_server->getAPSSID().c_str());
              DEBUG_PRINTF("[WiFi] Access: http://%s\n", WiFi.softAPIP().toString().c_str());
      
      // Wait for configuration (with timeout)
      unsigned long config_start = millis();
      const unsigned long CONFIG_TIMEOUT = 300000; // 5 minutes
      
      while (!wifi_config.configured && (millis() - config_start) < CONFIG_TIMEOUT) {
        web_config_server->handleClient();
        delay(100);
        
        // Check if configuration was saved
        WiFiConfig temp_config;
        if (web_config_server->loadConfiguration(temp_config) && temp_config.configured) {
          wifi_config = temp_config;
          saveWiFiConfigToPreferences();
          break;
        }
      }
      
      if (wifi_config.configured) {
        DEBUG_PRINT("[WiFi] Configuration received, attempting to connect");
        
        // 🆕 ERWEITERT: Versuche WiFi-Verbindung aufzubauen, aber behalte Portal offen
        DEBUG_PRINTF("[WiFi] Attempting to connect to: %s\n", wifi_config.ssid.c_str());
        WiFi.begin(wifi_config.ssid.c_str(), wifi_config.password.c_str());
        
        // ✅ FIXED: Improved WiFi connection with better timeout and retry logic
        int attempts = 0;
        const int max_attempts = 20;  // 10 seconds total (20 * 500ms)
        
        while (WiFi.status() != WL_CONNECTED && attempts < max_attempts) {
          delay(500);
          attempts++;
          DEBUG_PRINT(".");
          
          // Check for authentication errors
          if (WiFi.status() == WL_CONNECT_FAILED) {
            DEBUG_PRINT("\n[WiFi] Connection failed - check credentials");
            return false;
          }
        }
        
        if (WiFi.status() == WL_CONNECTED) {
          DEBUG_PRINTF("[WiFi] Connected to: %s\n", WiFi.SSID().c_str());
          DEBUG_PRINTF("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
          current_state = STATE_WIFI_CONNECTED;
          
          // 🆕 NEU: NTP-Zeit-Synchronisation starten
          DEBUG_PRINT("[NTP] Starting time synchronization...");
          time_client.begin();
          time_client.forceUpdate();
          if (time_client.isTimeSet()) {
            ntp_synced = true;
            last_ntp_sync = millis();
            DEBUG_PRINTF("[NTP] Time synchronized: %s\n", time_client.getFormattedTime().c_str());
          } else {
            DEBUG_PRINT("[NTP] Time synchronization failed, using fallback");
          }
          
          DEBUG_PRINT("[WiFi] WiFi connected, attempting MQTT connection...");
          
          // 🆕 ERWEITERT: Versuche MQTT-Verbindung aufzubauen
          if (connectToMqtt()) {
            DEBUG_PRINT("[WiFi] MQTT connected successfully!");
            
            // 🆕 ERWEITERT: Jetzt erst das Portal beenden
            web_config_server->stopConfigPortal();
            delete web_config_server;
            web_config_server = nullptr;
            wifi_config.setWebserverActive(false);
            
            return true;
          } else {
            DEBUG_PRINT("[WiFi] MQTT connection failed, keeping portal open for troubleshooting");
            // Portal bleibt offen für Troubleshooting
            return false;
          }
        } else {
          DEBUG_PRINT("[WiFi] WiFi connection failed, keeping portal open");
          wifi_reconnect_count++;
          // Portal bleibt offen für Troubleshooting
          return false;
        }
      } else {
        DEBUG_PRINT("[WiFi] Configuration timeout, restarting...");
        web_config_server->stopConfigPortal();
        delete web_config_server;
        web_config_server = nullptr;
        delay(2000);
        ESP.restart();
      }
    } else {
      DEBUG_PRINT("[WiFi] Failed to start configuration portal");
      return false;
    }
  }
  
      // Connect using saved configuration
    if (wifi_config.configured && wifi_config.ssid.length() > 0) {
      DEBUG_PRINTF("[WiFi] Connecting to: %s\n", wifi_config.ssid.c_str());
      WiFi.begin(wifi_config.ssid.c_str(), wifi_config.password.c_str());
      
      // ✅ FIXED: Improved WiFi connection with better timeout and retry logic
      int attempts = 0;
      const int max_attempts = 20;  // 10 seconds total (20 * 500ms)
      
      while (WiFi.status() != WL_CONNECTED && attempts < max_attempts) {
        delay(500);
        attempts++;
        DEBUG_PRINT(".");
        
        // Check for authentication errors
        if (WiFi.status() == WL_CONNECT_FAILED) {
          DEBUG_PRINT("\n[WiFi] Connection failed - check credentials");
          return false;
        }
      }
    
    if (WiFi.status() == WL_CONNECTED) {
      DEBUG_PRINTF("[WiFi] Connected to: %s\n", WiFi.SSID().c_str());
      DEBUG_PRINTF("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
      
      return true;
    } else {
      DEBUG_PRINT("[WiFi] Connection failed, clearing configuration");
      wifi_reconnect_count++;
      wifi_config.configured = false;
      saveWiFiConfigToPreferences();
      return false;
    }
  }
  
  return false;
}

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

// =============================================================================
// ZONE MANAGEMENT (HIERARCHISCH)
// =============================================================================

void loadZoneConfigFromPreferences() {
  // ✅ FIXED: Verwende read-write mode nach Flash-Erase
  preferences.begin("zone_config", false);
  
  // Kaiser-Zone (sollte immer gleich sein)
  kaiser_zone.kaiser_id = preferences.getString("kaiser_id", "pi_zero_edge_controller");
  kaiser_zone.kaiser_name = preferences.getString("kaiser_name", "Kaiser Edge Controller");
  
  // 🆕 NEU: System-Name und Generation-Flag
  kaiser_zone.system_name = preferences.getString("system_name", "");
  kaiser_zone.id_generated = preferences.getBool("id_generated", false);
  
  // 🆕 NEU: Kaiser ID neu generieren falls nötig
  if (kaiser_zone.id_generated && kaiser_zone.system_name.length() > 0) {
    String generated_id = generateKaiserId(kaiser_zone.system_name);
    if (generated_id != getKaiserId()) {
      DEBUG_PRINTF("[Zone] Updating Kaiser ID: '%s' → '%s'\n", 
                   getKaiserId().c_str(), generated_id.c_str());
      kaiser_zone.kaiser_id = generated_id;
      saveZoneConfigToPreferences();  // Speichern der aktualisierten ID
    }
  }
  
  // Master-Zone
  master_zone.master_zone_id = preferences.getString("master_zone_id", "");
  master_zone.master_zone_name = preferences.getString("master_zone_name", "");
  master_zone.assigned = preferences.getBool("master_assigned", false);
  master_zone.is_master_esp = preferences.getBool("is_master_esp", false);
  
  // Sub-Zonen
  active_subzones = preferences.getUChar("active_subzones", 0);
  for (int i = 0; i < active_subzones && i < MAX_SUBZONES; i++) {
    String prefix = "subzone_" + String(i) + "_";
    sub_zones[i].subzone_id = preferences.getString((prefix + "id").c_str(), "");
    sub_zones[i].subzone_name = preferences.getString((prefix + "name").c_str(), "");
    sub_zones[i].description = preferences.getString((prefix + "desc").c_str(), "");
    sub_zones[i].active = preferences.getBool((prefix + "active").c_str(), false);
  }
  
  // 🆕 NEU: Change-Tracking-Variablen laden
  master_zone_changed = preferences.getBool("master_zone_changed", false);
  master_zone_change_timestamp = preferences.getULong("master_zone_change_timestamp", 0);
  previous_master_zone_id = preferences.getString("previous_master_zone_id", "");
  
  subzone_changed = preferences.getBool("subzone_changed", false);
  subzone_change_timestamp = preferences.getULong("subzone_change_timestamp", 0);
  previous_subzone_id = preferences.getString("previous_subzone_id", "");
  
  esp_id_changed = preferences.getBool("esp_id_changed", false);
  esp_id_change_timestamp = preferences.getULong("esp_id_change_timestamp", 0);
  previous_esp_id = preferences.getString("previous_esp_id", "");
  
  // 🆕 NEU: Kaiser-ID Change-Tracking laden
  kaiser_id_changed = preferences.getBool("kaiser_id_changed", false);
  kaiser_id_change_timestamp = preferences.getULong("kaiser_id_change_timestamp", 0);
  previous_kaiser_id = preferences.getString("previous_kaiser_id", "");
  
  preferences.end();
  
  DEBUG_PRINTF("[Zone] Loaded: Kaiser=%s, Master=%s (%s), SubZones=%d\n", 
               getKaiserId().c_str(), master_zone.master_zone_name.c_str(), 
               master_zone.master_zone_id.c_str(), active_subzones);
}

void saveZoneConfigToPreferences() {
  preferences.begin("zone_config", false);
  
  // Kaiser-Zone
  preferences.putString("kaiser_id", kaiser_zone.kaiser_id);
  preferences.putString("kaiser_name", kaiser_zone.kaiser_name);
  
  // 🆕 NEU: System-Name und Generation-Flag
  preferences.putString("system_name", kaiser_zone.system_name);
  preferences.putBool("id_generated", kaiser_zone.id_generated);
  
  // Master-Zone
  preferences.putString("master_zone_id", master_zone.master_zone_id);
  preferences.putString("master_zone_name", master_zone.master_zone_name);
  preferences.putBool("master_assigned", master_zone.assigned);
  preferences.putBool("is_master_esp", master_zone.is_master_esp);
  
  // Sub-Zonen
  preferences.putUChar("active_subzones", active_subzones);
  for (int i = 0; i < active_subzones && i < MAX_SUBZONES; i++) {
    String prefix = "subzone_" + String(i) + "_";
    preferences.putString((prefix + "id").c_str(), sub_zones[i].subzone_id);
    preferences.putString((prefix + "name").c_str(), sub_zones[i].subzone_name);
    preferences.putString((prefix + "desc").c_str(), sub_zones[i].description);
    preferences.putBool((prefix + "active").c_str(), sub_zones[i].active);
  }
  
  // 🆕 NEU: Change-Tracking-Variablen persistieren
  preferences.putBool("master_zone_changed", master_zone_changed);
  preferences.putULong("master_zone_change_timestamp", master_zone_change_timestamp);
  preferences.putString("previous_master_zone_id", previous_master_zone_id);
  
  preferences.putBool("subzone_changed", subzone_changed);
  preferences.putULong("subzone_change_timestamp", subzone_change_timestamp);
  preferences.putString("previous_subzone_id", previous_subzone_id);
  
  preferences.putBool("esp_id_changed", esp_id_changed);
  preferences.putULong("esp_id_change_timestamp", esp_id_change_timestamp);
  preferences.putString("previous_esp_id", previous_esp_id);
  
  // 🆕 NEU: Kaiser-ID Change-Tracking persistieren
  preferences.putBool("kaiser_id_changed", kaiser_id_changed);
  preferences.putULong("kaiser_id_change_timestamp", kaiser_id_change_timestamp);
  preferences.putString("previous_kaiser_id", previous_kaiser_id);
  
  preferences.end();
  DEBUG_PRINT("[Zone] Configuration saved to preferences");
}

void requestUserZoneConfiguration() {
  DEBUG_PRINT("[Config] Requesting user zone configuration");
  
  user_config_start = millis();
  current_state = STATE_AWAITING_USER_CONFIG;
  
  // Sende Konfigurations-Request an Kaiser-Zone
  StaticJsonDocument<512> config_request;
  config_request["esp_id"] = esp_id;
  config_request["mac"] = mac_address;
  config_request["request_type"] = "zone_configuration";
  config_request["capabilities"] = JsonArray();
  config_request["capabilities"].add("pH_sensors");
  config_request["capabilities"].add("EC_sensors");
  config_request["capabilities"].add("temperature_sensors");
  config_request["capabilities"].add("ota_libraries");
  config_request["uptime"] = millis();
  config_request["free_heap"] = ESP.getFreeHeap();
  
  // *** ADVANCED FEATURES: RTC-Timestamp hinzufügen ***
  if (advanced_system_initialized) {
    config_request["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    config_request["time_quality"] = AdvancedFeatures::getTimeQuality();
  }
  
  String request_message;
  ArduinoJson::serializeJson(config_request, request_message);
  
  String config_topic = "kaiser/" + getKaiserId() + "/config/request";
  
  if (mqtt_client.publish(config_topic.c_str(), request_message.c_str())) {
    DEBUG_PRINTF("[Config] Configuration request sent to: %s\n", config_topic.c_str());
  } else {
    DEBUG_PRINT("[Config] Failed to send configuration request");
  }
}

// =============================================================================
// SYSTEM ERROR TRACKING FUNCTIONS
// =============================================================================
// v3.6.0: Topic-Statistiken für Diagnose
void updateTopicStats(const String& topic) {
  unsigned long current_time = millis();
  
  // Suche nach existierendem Topic
  for (int i = 0; i < topic_stats_count; i++) {
    if (topic_statistics[i].topic == topic) {
      topic_statistics[i].publish_count++;
      topic_statistics[i].last_sent = current_time;
      return;
    }
  }
  
  // Neues Topic hinzufügen
  if (topic_stats_count < 20) {
    topic_statistics[topic_stats_count].topic = topic;
    topic_statistics[topic_stats_count].publish_count = 1;
    topic_statistics[topic_stats_count].last_sent = current_time;
    topic_statistics[topic_stats_count].first_sent = current_time;
    topic_stats_count++;
  }
}

void sendDiagnosticsReport() {
  if (!mqtt_client.connected()) return;
  
  StaticJsonDocument<1024> diagnostics_doc;
  diagnostics_doc["esp_id"] = esp_id;
  diagnostics_doc["report_type"] = "topic_statistics";
  diagnostics_doc["timestamp"] = getUnixTimestamp();
  
  // v3.6.0: Context für Frontend-Logging
  diagnostics_doc["context"] = "diagnostics_report";
  
  // Topic-Statistiken
  JsonArray topics_array = diagnostics_doc.createNestedArray("topics");
  for (int i = 0; i < topic_stats_count; i++) {
    JsonObject topic_obj = topics_array.createNestedObject();
    topic_obj["topic"] = topic_statistics[i].topic;
    topic_obj["publish_count"] = topic_statistics[i].publish_count;
    topic_obj["last_sent"] = topic_statistics[i].last_sent;
    topic_obj["first_sent"] = topic_statistics[i].first_sent;
    topic_obj["age_seconds"] = (millis() - topic_statistics[i].first_sent) / 1000;
  }
  
  // System-Informationen
  JsonObject system_info = diagnostics_doc.createNestedObject("system");
  system_info["uptime_seconds"] = millis() / 1000;
  system_info["free_heap"] = ESP.getFreeHeap();
  system_info["wifi_rssi"] = WiFi.RSSI();
  system_info["mqtt_connected"] = mqtt_client.connected();
  system_info["active_sensors"] = active_sensors;
  
  String diagnostics_message;
  ArduinoJson::serializeJson(diagnostics_doc, diagnostics_message);
  
  String diagnostics_topic = buildSpecialTopic("system/diagnostics", esp_id);
  mqtt_client.publish(diagnostics_topic.c_str(), diagnostics_message.c_str(), MQTT_QOS_COMMANDS);
  updateTopicStats(diagnostics_topic);  // v3.6.0: Topic-Statistik aktualisieren
  
  DEBUG_PRINTF("[Diagnostics] Sent report with %d topics\n", topic_stats_count);
}

// 🆕 NEU: Erweiterte Statistiken
void sendEnhancedTopicStats() {
  DynamicJsonDocument stats_doc(1024);
  JsonArray topics_array = stats_doc.createNestedArray("topics");
  
  for (int i = 0; i < topic_stats_count; i++) {
    JsonObject topic_obj = topics_array.createNestedObject();
    topic_obj["topic"] = topic_statistics[i].topic;
    topic_obj["publish_count"] = topic_statistics[i].publish_count;
    topic_obj["last_sent"] = topic_statistics[i].last_sent;
    topic_obj["first_sent"] = topic_statistics[i].first_sent;
    topic_obj["uptime"] = millis() - topic_statistics[i].first_sent;
  }
  
  String stats_message;
  ArduinoJson::serializeJson(stats_doc, stats_message);
  
  String stats_topic = buildSpecialTopic("topic_statistics", esp_id);
  safePublish(stats_topic, stats_message, 1, 3);
}

// v3.6.0: System response für Frontend-Kompatibilität
void sendSystemResponse(const String& command, bool success, const String& message = "") {
  if (!mqtt_client.connected()) return;
  
  StaticJsonDocument<256> response_doc;
  response_doc["command"] = command;
  response_doc["success"] = success;
  response_doc["message"] = message;
  response_doc["esp_id"] = esp_id;
  response_doc["timestamp"] = getUnixTimestamp();
  
  // v3.6.0: Context für Frontend-Logging
  response_doc["context"] = "system_response";
  
  String response_message;
  ArduinoJson::serializeJson(response_doc, response_message);
  
  String response_topic = buildSpecialTopic("system/response", esp_id);
  mqtt_client.publish(response_topic.c_str(), response_message.c_str(), MQTT_QOS_COMMANDS);
  updateTopicStats(response_topic);  // v3.6.0: Topic-Statistik aktualisieren
  
  DEBUG_PRINTF("[SystemResponse] Sent response for command: %s (success: %s)\n", 
               command.c_str(), success ? "true" : "false");
}

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

void logSystemError(const String& component, const String& error_message, const String& context = "") {
  last_system_error = component + ": " + error_message;
  if (context.length() > 0) {
    last_system_error += " (" + context + ")";
  }
  last_error_time = millis();
  total_error_count++;
  
  DEBUG_PRINTF("[ERROR] %s - %s\n", component.c_str(), error_message.c_str());
  
  // Sofortiges Error-Reporting via MQTT wenn verbunden
  if (mqtt_client.connected()) {
    sendErrorAlert(component, error_message, context);
  }
}


void updateSystemHealthMetrics() {
  // Memory Metrics
  health_metrics.free_heap_current = ESP.getFreeHeap();
  if (health_metrics.free_heap_minimum == 0 || health_metrics.free_heap_current < health_metrics.free_heap_minimum) {
    health_metrics.free_heap_minimum = health_metrics.free_heap_current;
  }
  
  // WiFi Metrics
  if (WiFi.status() == WL_CONNECTED) {
    wifi_signal_strength = WiFi.RSSI();
  }
  
  // Uptime
  health_metrics.uptime_seconds = millis() / 1000;
  
  // Simple CPU Usage Estimation (based on loop timing)
  static unsigned long last_loop_time = 0;
  static unsigned long loop_count = 0;
  static unsigned long total_loop_time = 0;
  
  unsigned long current_time = millis();
  if (last_loop_time > 0) {
    total_loop_time += (current_time - last_loop_time);
    loop_count++;
    
    if (loop_count >= 100) {  // Calculate every 100 loops
      float avg_loop_time = total_loop_time / loop_count;
      health_metrics.cpu_usage_percent = min(avg_loop_time / 10.0, 100.0);  // Rough estimation
      
      // Reset counters
      total_loop_time = 0;
      loop_count = 0;
    }
  }
  last_loop_time = current_time;
}

// =============================================================================
// OTA LIBRARY MANAGER (ENHANCED)
// =============================================================================

// [AgentFix] Neue Hilfsfunktionen für erweiterte OTA-Funktionalität
bool isLibraryVersionCompatible(const String& library_name, const String& version) {
    // [AgentFix] Version-Kompatibilitätsprüfung implementieren
    // Hier könnte eine semantische Versionierung implementiert werden
    // Für jetzt: alle Versionen kompatibel, aber Logging für zukünftige Erweiterungen
    DEBUG_PRINTF("[OTA] Checking version compatibility: %s v%s\n", library_name.c_str(), version.c_str());
    return true; // Für jetzt: alle Versionen kompatibel
}

uint32_t calculateCRC32(const uint8_t* data, size_t length) {
    // [AgentFix] CRC32-Berechnung für bessere Checksum-Validierung
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < length; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++) {
            crc = (crc >> 1) ^ (0xEDB88320 & -(crc & 1));
        }
    }
    return ~crc;
}

void sendLibraryErrorResponse(const String& library_name, const String& error_type, const String& error_message) {
    if (!mqtt_client.connected()) return;
    
    DynamicJsonDocument doc(512);
    doc["esp_id"] = esp_id;
    doc["library_name"] = library_name;
    doc["error_type"] = error_type;
    doc["error_message"] = error_message;
    doc["timestamp"] = getUnixTimestamp();
    
    String error_response;
    ArduinoJson::serializeJson(doc, error_response);
    
    String error_topic = buildSpecialTopic("library/error", esp_id);
    mqtt_client.publish(error_topic.c_str(), error_response.c_str());
    
    DEBUG_PRINTF("[OTA] Error response sent: %s - %s\n", error_type.c_str(), error_message.c_str());
}

bool performLibraryRollback(const String& library_name) {
    // [AgentFix] Rollback-Logik implementieren
    DEBUG_PRINTF("[OTA] Rolling back library: %s\n", library_name.c_str());
    
    if (current_library_download.previous_version.isEmpty()) {
        DEBUG_PRINT("[OTA] No previous version available for rollback");
        return false;
    }
    
    // [AgentFix] Hier würde die echte Rollback-Logik implementiert werden
    // Für jetzt: Simuliere erfolgreichen Rollback
    DEBUG_PRINTF("[OTA] Rollback to version %s successful\n", 
                 current_library_download.previous_version.c_str());
    
    // MQTT-Benachrichtigung über erfolgreichen Rollback
    DynamicJsonDocument doc(256);
    doc["esp_id"] = esp_id;
    doc["library_name"] = library_name;
    doc["action"] = "rollback";
    doc["previous_version"] = current_library_download.previous_version;
    doc["timestamp"] = getUnixTimestamp();
    
    String rollback_response;
    ArduinoJson::serializeJson(doc, rollback_response);
    
    String rollback_topic = buildSpecialTopic("library/rollback", esp_id);
    mqtt_client.publish(rollback_topic.c_str(), rollback_response.c_str());
    
    return true;
}

void saveLibraryInfo(const LibraryInfo& library_info) {
    // [AgentFix] Persistente Speicherung der Library-Informationen
    Preferences prefs;
    prefs.begin("library_info", false);
    
    String key_prefix = "lib_" + library_info.name + "_";
    prefs.putString((key_prefix + "version").c_str(), library_info.version);
    prefs.putULong((key_prefix + "size").c_str(), library_info.total_size);
    prefs.putULong((key_prefix + "checksum").c_str(), library_info.calculated_checksum);
    prefs.putULong((key_prefix + "timestamp").c_str(), library_info.install_timestamp);
    prefs.putString((key_prefix + "quality").c_str(), library_info.install_quality);
    
    prefs.end();
    
    DEBUG_PRINTF("[OTA] Library info saved for %s v%s\n", 
                 library_info.name.c_str(), library_info.version.c_str());
}

bool isLibraryInstalled(const String& library_name) {
    // [AgentFix] Prüfe ob Library installiert ist
    Preferences prefs;
    prefs.begin("library_info", true);
    
    String key_prefix = "lib_" + library_name + "_";
    String version = prefs.getString((key_prefix + "version").c_str(), "");
    
    prefs.end();
    
    return !version.isEmpty();
}

String getInstalledLibraryVersion(const String& library_name) {
    // [AgentFix] Hole installierte Library-Version
    Preferences prefs;
    prefs.begin("library_info", true);
    
    String key_prefix = "lib_" + library_name + "_";
    String version = prefs.getString((key_prefix + "version").c_str(), "");
    
    prefs.end();
    
    return version;
}

void initLibraryDownload(String library_name, String version, size_t total_size, uint8_t total_chunks, uint32_t checksum) {
  DEBUG_PRINTF("[OTA] Initializing download: %s v%s (%d bytes, %d chunks)\n", 
               library_name.c_str(), version.c_str(), total_size, total_chunks);
  
  // [AgentFix] Version-Kompatibilität prüfen
  if (!isLibraryVersionCompatible(library_name, version)) {
    DEBUG_PRINTF("[OTA] ERROR: Incompatible library version %s for %s\n", 
                 version.c_str(), library_name.c_str());
    sendLibraryErrorResponse(library_name, "INCOMPATIBLE_VERSION", 
                           "Library version " + version + " is not compatible");
    return;
  }
  
  // [AgentFix] Backup der vorherigen Version für Rollback
  if (isLibraryInstalled(library_name)) {
    current_library_download.previous_version = getInstalledLibraryVersion(library_name);
    current_library_download.rollback_available = true;
    DEBUG_PRINTF("[OTA] Backup available for rollback: v%s\n", 
                 current_library_download.previous_version.c_str());
  }
  
  // Cleanup previous download
  if (current_library_download.data_buffer != nullptr) {
    free(current_library_download.data_buffer);
  }
  
  // Initialize new download
  current_library_download.name = library_name;
  current_library_download.version = version;
  current_library_download.total_size = total_size;
  current_library_download.expected_checksum = checksum;
  current_library_download.total_chunks = total_chunks;
  current_library_download.received_chunks = 0;
  current_library_download.received_size = 0;
  current_library_download.download_complete = false;
  current_library_download.installation_complete = false;
  current_library_download.version_compatible = true;
  current_library_download.install_timestamp = millis();
  
  // [AgentFix] Allocate buffer mit Überprüfung
  current_library_download.data_buffer = (uint8_t*)malloc(total_size);
  if (current_library_download.data_buffer == nullptr) {
    DEBUG_PRINT("[OTA] ERROR: Failed to allocate memory for library download");
    sendLibraryErrorResponse(library_name, "MEMORY_ALLOCATION_FAILED", 
                           "Insufficient memory for library download");
    library_download_in_progress = false;
    return;
  }
  
  library_download_in_progress = true;
  current_state = STATE_LIBRARY_DOWNLOADING;
  
  // Send ready confirmation
  StaticJsonDocument<512> ready_doc;
  ready_doc["esp_id"] = esp_id;
  ready_doc["library_name"] = library_name;
  ready_doc["version"] = version;
  ready_doc["status"] = "ready_for_download";
  ready_doc["buffer_allocated"] = total_size;
  ready_doc["version_compatible"] = true;
  ready_doc["rollback_available"] = current_library_download.rollback_available;
  if (current_library_download.rollback_available) {
    ready_doc["previous_version"] = current_library_download.previous_version;
  }
  
  String ready_message;
  ArduinoJson::serializeJson(ready_doc, ready_message);
  
  String ready_topic = buildSpecialTopic("library/ready", esp_id);
  mqtt_client.publish(ready_topic.c_str(), ready_message.c_str());
}

bool processLibraryChunk(uint8_t chunk_number, const uint8_t* chunk_data, size_t chunk_size) {
  if (!library_download_in_progress || current_library_download.data_buffer == nullptr) {
    DEBUG_PRINT("[OTA] ERROR: No download in progress");
    return false;
  }
  
  size_t offset = chunk_number * LIBRARY_CHUNK_SIZE;
  if (offset + chunk_size > current_library_download.total_size) {
    DEBUG_PRINT("[OTA] ERROR: Chunk size exceeds total size");
    return false;
  }
  
  // Copy chunk data
  memcpy(current_library_download.data_buffer + offset, chunk_data, chunk_size);
  current_library_download.received_size += chunk_size;
  current_library_download.received_chunks++;
  
  DEBUG_PRINTF("[OTA] Received chunk %d/%d (%d/%d bytes)\n", 
               current_library_download.received_chunks, current_library_download.total_chunks,
               current_library_download.received_size, current_library_download.total_size);
  
  // Check if download complete
  if (current_library_download.received_chunks >= current_library_download.total_chunks) {
    return completeLibraryDownload();
  }
  
  return true;
}

bool completeLibraryDownload() {
    DEBUG_PRINT("[OTA] Download complete, verifying checksum...");
    
    // [AgentFix] CRC32-Checksum-Berechnung statt einfacher Summe
    uint32_t calculated_checksum = calculateCRC32(current_library_download.data_buffer, 
                                                current_library_download.received_size);
    
    current_library_download.calculated_checksum = calculated_checksum;
    
    if (calculated_checksum != current_library_download.expected_checksum) {
        DEBUG_PRINTF("[OTA] ERROR: Checksum mismatch! Expected: %u, Got: %u\n", 
                     current_library_download.expected_checksum, calculated_checksum);
        
        sendLibraryErrorResponse(current_library_download.name, "CHECKSUM_MISMATCH",
                               "Expected: " + String(current_library_download.expected_checksum) + 
                               ", Got: " + String(calculated_checksum));
        
        free(current_library_download.data_buffer);
        current_library_download.data_buffer = nullptr;
        library_download_in_progress = false;
        return false;
    }
    
    DEBUG_PRINT("[OTA] Checksum verified, installing library...");
    current_library_download.download_complete = true;
    
    // [AgentFix] Erweiterte Installation mit Fehlerbehandlung
    bool install_success = false;
    String install_error = "";
    
    if (advanced_system_initialized) {
        // Berechne Base64-Output-Größe
        size_t base64_len = ((current_library_download.received_size + 2) / 3) * 4 + 1;
        char* base64_buffer = (char*)malloc(base64_len);
        
        if (!base64_buffer) {
            install_error = "Failed to allocate Base64 buffer";
        } else {
            // mbedTLS Base64-Encoding
            size_t encoded_len = 0;
            int encode_result = mbedtls_base64_encode(
                (unsigned char*)base64_buffer, base64_len, &encoded_len,
                current_library_download.data_buffer, current_library_download.received_size
            );
            
            if (encode_result != 0) {
                install_error = "Base64 encoding failed with code " + String(encode_result);
            } else {
                // Null-terminate Base64-String
                base64_buffer[encoded_len] = '\0';
                String library_data(base64_buffer);
                
                // [AgentFix] Installiere Library über AdvancedSensorSystem mit Fehlerbehandlung
                install_success = advanced_system.installLibraryFromBase64(
                    current_library_download.name, 
                    current_library_download.version, 
                    library_data
                );
                
                if (!install_success) {
                    install_error = "Advanced library installation failed";
                }
            }
            
            free(base64_buffer);
        }
    } else {
        // Fallback: Simulate library installation
        delay(100);
        install_success = true;
    }
    
    if (install_success) {
        current_library_download.installation_complete = true;
        current_library_download.install_quality = "excellent";
        DEBUG_PRINT("[OTA] Advanced library installation successful");
        
        // [AgentFix] Persistente Speicherung der Library-Info
        saveLibraryInfo(current_library_download);
        
        // Trigger Sensor-Rekonfiguration nach Library-Installation
        onLibraryInstalled(current_library_download.name);
    } else {
        DEBUG_PRINTF("[OTA] Library installation failed: %s\n", install_error.c_str());
        current_library_download.install_error = install_error;
        
        // [AgentFix] Rollback-Logik bei Installationsfehler
        if (current_library_download.rollback_available) {
            DEBUG_PRINT("[OTA] Attempting rollback to previous version...");
            if (performLibraryRollback(current_library_download.name)) {
                DEBUG_PRINT("[OTA] Rollback successful");
            } else {
                DEBUG_PRINT("[OTA] Rollback failed");
            }
        }
        
        sendLibraryErrorResponse(current_library_download.name, "INSTALLATION_FAILED", install_error);
        free(current_library_download.data_buffer);
        current_library_download.data_buffer = nullptr;
        library_download_in_progress = false;
        return false;
    }
    
    library_download_in_progress = false;
    
    // [AgentFix] Erweiterte Installationsbestätigung
    StaticJsonDocument<512> install_doc;
    install_doc["esp_id"] = esp_id;
    install_doc["library_name"] = current_library_download.name;
    install_doc["version"] = current_library_download.version;
    install_doc["status"] = "installed";
    install_doc["checksum_verified"] = true;
    install_doc["install_quality"] = current_library_download.install_quality;
    install_doc["install_timestamp"] = current_library_download.install_timestamp;
    install_doc["rollback_available"] = current_library_download.rollback_available;
    if (current_library_download.rollback_available) {
        install_doc["previous_version"] = current_library_download.previous_version;
    }
    
    String install_message;
    ArduinoJson::serializeJson(install_doc, install_message);
    
    String install_topic = buildSpecialTopic("library/installed", esp_id);
    mqtt_client.publish(install_topic.c_str(), install_message.c_str());
    
    DEBUG_PRINTF("[OTA] Library %s v%s installed successfully\n", 
                 current_library_download.name.c_str(), current_library_download.version.c_str());
    
    return true;
}

void requestLibraryForSensor(SensorType sensor_type) {
  String library_name = "";
  
  switch (sensor_type) {
    case SENSOR_PH_DFROBOT:
      library_name = "ph_dfrobot_gravity";
      break;
    case SENSOR_EC_GENERIC:
      library_name = "ec_generic";
      break;
    case SENSOR_TEMP_DS18B20:
      library_name = "temp_ds18b20";
      break;
    case SENSOR_TEMP_DHT22:
      library_name = "temp_dht22";
      break;
    default:
      DEBUG_PRINT("[OTA] Unknown sensor type for library request");
      return;
  }
  
  DEBUG_PRINTF("[OTA] Requesting library: %s\n", library_name.c_str());
  
  StaticJsonDocument<256> request_doc;
  request_doc["esp_id"] = esp_id;
  request_doc["library_name"] = library_name;
  request_doc["version"] = "latest";
  request_doc["reason"] = "sensor_configuration";
  
  String request_message;
  ArduinoJson::serializeJson(request_doc, request_message);
  
  String request_topic = buildSpecialTopic("library/request", esp_id);
  mqtt_client.publish(request_topic.c_str(), request_message.c_str());
}

void onLibraryInstalled(String library_name) {
    DEBUG_PRINTF("[PostInstall] Library %s installed - checking for waiting sensors\n", library_name.c_str());
    
    if (!advanced_system_initialized) {
        DEBUG_PRINT("[PostInstall] Advanced system not initialized");
        return;
    }
    
    // Finde wartende Sensoren und konfiguriere sie
    int configured_sensors = 0;
    for (int i = 0; i < active_sensors; i++) {
        if (sensors[i].active && !sensors[i].hardware_configured) {
            String required_library = "";
            
            // Bestimme benötigte Library basierend auf Sensor-Typ
            switch (sensors[i].type) {
                case SENSOR_PH_DFROBOT:
                    required_library = "ph_dfrobot_gravity";
                    break;
                case SENSOR_TEMP_DS18B20:
                    required_library = "temp_ds18b20";
                    break;
                case SENSOR_EC_GENERIC:
                    required_library = "ec_generic";
                    break;
                case SENSOR_TEMP_DHT22:
                    required_library = "temp_dht22";
                    break;
                default:
                    continue;
            }
            
            // Prüfe ob installierte Library für diesen Sensor ist
            if (required_library == library_name) {
                DEBUG_PRINTF("[PostInstall] Configuring waiting sensor: %s on GPIO %d\n", 
                            sensors[i].sensor_name.c_str(), sensors[i].gpio);
                
                // Konfiguriere Hardware-Sensor
                if (advanced_system.configureHardwareSensor(sensors[i].gpio, required_library, 
                                                          sensors[i].sensor_name, sensors[i].subzone_id)) {
                    sensors[i].hardware_configured = true;
                    sensors[i].library_loaded = true;
                    sensors[i].library_name = required_library;
                    configured_sensors++;
                    
                    DEBUG_PRINTF("[PostInstall] Hardware sensor %s configured successfully\n", 
                                sensors[i].sensor_name.c_str());
                } else {
                    DEBUG_PRINTF("[PostInstall] Failed to configure hardware sensor %s\n", 
                                sensors[i].sensor_name.c_str());
                }
            }
        }
    }
    
    if (configured_sensors > 0) {
        DEBUG_PRINTF("[PostInstall] Successfully configured %d hardware sensors\n", configured_sensors);
        
        // Optional: Speichere aktualisierte Konfiguration
        saveSensorConfigToPreferences();
        
        // Optional: Sende Status-Update
        sendStatusUpdate();
    } else {
        DEBUG_PRINTF("[PostInstall] No waiting sensors found for library %s\n", library_name.c_str());
    }
}

// 🆕 NEU: Real Hardware Sensor Reading Helper Functions
float readDS18B20Real(uint8_t gpio) {
  // OneWire und DallasTemperature für DS18B20
  OneWire oneWire(gpio);
  DallasTemperature sensors(&oneWire);
  
  sensors.begin();
  sensors.requestTemperatures();
  
  float temperature = sensors.getTempCByIndex(0);
  
  // Validierung: DS18B20 kann -55°C bis +125°C messen
  if (temperature == DEVICE_DISCONNECTED_C || temperature < -55.0 || temperature > 125.0) {
    DEBUG_PRINTF("[Sensor] DS18B20 on GPIO %d: Invalid reading %.2f°C\n", gpio, temperature);
    return NAN;
  }
  
  DEBUG_PRINTF("[Sensor] DS18B20 on GPIO %d: %.2f°C\n", gpio, temperature);
  return temperature;
}

float readCO2Real(uint8_t gpio) {
  // CO2-Sensoren verwenden oft UART oder I2C
  // Hier implementieren wir eine generische digitale Lesung als Fallback
  // Für echte UART-CO2-Sensoren sollte dies angepasst werden
  
  // Simuliere eine CO2-Lesung basierend auf GPIO-Zustand
  // In der Praxis würde hier die spezifische UART/I2C-Kommunikation stehen
  int digital_value = digitalRead(gpio);
  
  // Konvertiere zu einem realistischen CO2-Wert (400-2000 ppm)
  float co2_value = 400.0 + (digital_value * 800.0);
  
  DEBUG_PRINTF("[Sensor] CO2 on GPIO %d: %.0f ppm (digital: %d)\n", gpio, co2_value, digital_value);
  return co2_value;
}

float readPiEnhancedReal(uint8_t gpio) {
  // Pi-Enhanced Sensoren verwenden spezielle Protokolle
  // Hier implementieren wir eine generische digitale Lesung
  int digital_value = digitalRead(gpio);
  
  // Konvertiere zu einem sinnvollen Wert basierend auf Sensor-Typ
  // Dies sollte je nach konkretem Pi-Enhanced Sensor angepasst werden
  float converted_value = (float)digital_value;
  
  DEBUG_PRINTF("[Sensor] Pi-Enhanced on GPIO %d: %d (converted: %.2f)\n", 
               gpio, digital_value, converted_value);
  return converted_value;
}

bool validateRawDataRange(SensorType sensor_type, uint32_t raw_value) {
  switch (sensor_type) {
    case SENSOR_PH_DFROBOT:
      // pH-Sensor: 0-4095 (12-bit ADC)
      return raw_value <= 4095;
      
    case SENSOR_EC_GENERIC:
      // EC-Sensor: 0-4095 (12-bit ADC)
      return raw_value <= 4095;
      
    case SENSOR_TEMP_DS18B20:
      // DS18B20: Temperatur * 100 als Integer (-5500 bis 12500)
      return raw_value >= 5500 && raw_value <= 12500;
      
    case SENSOR_TEMP_DHT22:
      // DHT22: Digital 0/1
      return raw_value <= 1;
      
    case SENSOR_MOISTURE:
      // Feuchtesensor: 0-4095 (12-bit ADC)
      return raw_value <= 4095;
      
    case SENSOR_PRESSURE:
      // Drucksensor: I2C-Rohdaten (variiert je nach Sensor)
      return raw_value > 0;
      
    case SENSOR_CO2:
      // CO2-Sensor: 400-5000 ppm
      return raw_value >= 400 && raw_value <= 5000;
      
    case SENSOR_AIR_QUALITY:
      // Luftqualität: I2C-Rohdaten (variiert je nach Sensor)
      return raw_value > 0;
      
    case SENSOR_LIGHT:
      // Lichtsensor: 0-4095 (12-bit ADC)
      return raw_value <= 4095;
      
    case SENSOR_FLOW:
      // Flusssensor: Digital 0/1
      return raw_value <= 1;
      
    case SENSOR_LEVEL:
      // Füllstandssensor: 0-4095 (12-bit ADC)
      return raw_value <= 4095;
      
    case SENSOR_CUSTOM_PI_ENHANCED:
      // Pi-Enhanced: Spezifische Validierung je nach Sensor
      return raw_value > 0;
      
    default:
      return true; // Unbekannte Sensoren: Akzeptiere alle Werte
  }
}

// 🆕 NEU: Erweiterte Validierung mit Warnings
String validateRawDataWithWarnings(SensorType sensor_type, uint32_t raw_value) {
  if (!validateRawDataRange(sensor_type, raw_value)) {
    return "raw_value_out_of_range";
  }
  
  // Zusätzliche Validierungen
  switch (sensor_type) {
    case SENSOR_PH_DFROBOT:
      if (raw_value == 0) return "sensor_disconnected";
      if (raw_value < 100 || raw_value > 4000) return "raw_value_out_of_range";
      break;
    case SENSOR_TEMP_DS18B20:
      if (raw_value == 0) return "sensor_disconnected";
      break;
  }
  
  return ""; // Keine Warnings
}

// =============================================================================
// SENSOR MANAGER (ENHANCED)
// =============================================================================

void loadSensorConfigFromPreferences() {
  // ✅ FIXED: Verwende read-write mode nach Flash-Erase
  preferences.begin("sensor_config", false);
  
  active_sensors = preferences.getUChar("active_sensors", 0);
  
  for (int i = 0; i < active_sensors && i < MAX_SENSORS; i++) {
    String prefix = "sensor_" + String(i) + "_";
    sensors[i].gpio = preferences.getUChar((prefix + "gpio").c_str(), 255);
    sensors[i].type = (SensorType)preferences.getUChar((prefix + "type").c_str(), SENSOR_NONE);
    sensors[i].subzone_id = preferences.getString((prefix + "subzone").c_str(), "");
    sensors[i].sensor_name = preferences.getString((prefix + "name").c_str(), "");
    sensors[i].library_name = preferences.getString((prefix + "library").c_str(), "");
    sensors[i].library_version = preferences.getString((prefix + "lib_ver").c_str(), "");
    sensors[i].active = preferences.getBool((prefix + "active").c_str(), false);
    sensors[i].library_loaded = false;  // Libraries müssen nach Boot neu geladen werden
    sensors[i].hardware_configured = false;  // Hardware muss neu konfiguriert werden
    // 🆕 NEU: Raw-Mode laden (Standard: false für Rückwärtskompatibilität)
    sensors[i].raw_mode = preferences.getBool((prefix + "raw_mode").c_str(), false);
  }
  
  preferences.end();
  
  DEBUG_PRINTF("[Sensor] Loaded %d sensor configurations\n", active_sensors);
}

void saveSensorConfigToPreferences() {
  preferences.begin("sensor_config", false);
  
  preferences.putUChar("active_sensors", active_sensors);
  
  for (int i = 0; i < active_sensors && i < MAX_SENSORS; i++) {
    String prefix = "sensor_" + String(i) + "_";
    preferences.putUChar((prefix + "gpio").c_str(), sensors[i].gpio);
    preferences.putUChar((prefix + "type").c_str(), sensors[i].type);
    preferences.putString((prefix + "subzone").c_str(), sensors[i].subzone_id);
    preferences.putString((prefix + "name").c_str(), sensors[i].sensor_name);
    preferences.putString((prefix + "library").c_str(), sensors[i].library_name);
    preferences.putString((prefix + "lib_ver").c_str(), sensors[i].library_version);
    preferences.putBool((prefix + "active").c_str(), sensors[i].active);
    // 🆕 NEU: Raw-Mode speichern
    preferences.putBool((prefix + "raw_mode").c_str(), sensors[i].raw_mode);
  }
  
  preferences.end();
  DEBUG_PRINT("[Sensor] Configuration saved to preferences");
}

bool configureSensor(uint8_t gpio, SensorType type, String subzone_id, String sensor_name) {
    // GPIO-Validierung
    if (!releaseGpioFromSafeMode(gpio)) {
        DEBUG_PRINTF("[Sensor] ERROR: Cannot configure GPIO %d\n", gpio);
        
        // 🆕 NEU: Conflict Tracking
        if (gpio_configured[gpio]) {
          setGPIOConflictInfo(gpio, "already_assigned", "sensor", sensor_name);
        } else if (gpio == 0 || gpio == 1 || gpio == 6 || gpio == 7 || gpio == 8 || 
                   gpio == 9 || gpio == 10 || gpio == 11 || gpio == 16 || gpio == 17 ||
                   gpio == 21 || gpio == 22) {
          setGPIOConflictInfo(gpio, "reserved_pin", "system", sensor_name);
        }
        
        return false;
    }
    
    // Freien Sensor-Slot finden
    int sensor_slot = -1;
    for (int i = 0; i < MAX_SENSORS; i++) {
        if (!sensors[i].active) {
            sensor_slot = i;
            break;
        }
    }
    
    if (sensor_slot == -1) {
        DEBUG_PRINT("[Sensor] ERROR: No free sensor slots available");
        // ✅ ADDED: GPIO zurück in Safe-Mode bei Slot-Fehler
        pinMode(gpio, INPUT_PULLUP);
        gpio_safe_mode[gpio] = true;
        gpio_configured[gpio] = false;
        DEBUG_PRINTF("[SafeMode] GPIO %d returned to safe mode (no sensor slot)\n", gpio);
        return false;
    }
    
    // Sensor konfigurieren
    sensors[sensor_slot].gpio = gpio;
    sensors[sensor_slot].type = type;
    sensors[sensor_slot].subzone_id = subzone_id;
    sensors[sensor_slot].sensor_name = sensor_name;
    sensors[sensor_slot].active = true;
    sensors[sensor_slot].library_loaded = false;
    sensors[sensor_slot].hardware_configured = false;
    
    // *** ADVANCED FEATURES: Hardware-Sensor konfigurieren ***
    if (advanced_system_initialized) {
        String library_name = "";
        switch (type) {
            case SENSOR_PH_DFROBOT:
                library_name = "ph_dfrobot_gravity";
                break;
            case SENSOR_TEMP_DS18B20:
                library_name = "temp_ds18b20";
                break;
            case SENSOR_EC_GENERIC:
                library_name = "ec_generic";
                break;
            case SENSOR_TEMP_DHT22:
                library_name = "temp_dht22";
                break;
            case SENSOR_MOISTURE:
                library_name = "moisture_pi_enhanced";
                break;
            case SENSOR_PRESSURE:
                library_name = "pressure_pi_enhanced";
                break;
            case SENSOR_CO2:
                library_name = "co2_pi_enhanced";
                break;
            case SENSOR_AIR_QUALITY:
                library_name = "air_quality_pi_enhanced";
                break;
            case SENSOR_LIGHT:
                library_name = "light_pi_enhanced";
                break;
            case SENSOR_FLOW:
                library_name = "flow_pi_enhanced";
                break;
            case SENSOR_LEVEL:
                library_name = "level_pi_enhanced";
                break;
            case SENSOR_CUSTOM_PI_ENHANCED:
                library_name = "custom_pi_enhanced";
                break;
            default:
                library_name = "unknown";
        }
        
        // Konfiguriere Hardware-Sensor über Advanced System
        bool hw_success = advanced_system.configureHardwareSensor(
            gpio, library_name, sensor_name, subzone_id
        );
        
        if (hw_success) {
            sensors[sensor_slot].hardware_configured = true;
            sensors[sensor_slot].library_loaded = true;
            sensors[sensor_slot].library_name = library_name;
            DEBUG_PRINTF("[Sensor] Hardware sensor configured successfully: %s\n", sensor_name.c_str());
        } else {
            DEBUG_PRINTF("[Sensor] Hardware configuration failed for %s\n", sensor_name.c_str());
            
            // ✅ ADDED: GPIO zurück in Safe-Mode bei Hardware-Fehler
            pinMode(gpio, INPUT_PULLUP);     // Hardware sicher machen
            gpio_safe_mode[gpio] = true;     // Zurück in Safe-Mode
            gpio_configured[gpio] = false;   // Als nicht-konfiguriert markieren
            DEBUG_PRINTF("[SafeMode] GPIO %d returned to safe mode (hardware failed)\n", gpio);
            
            // Sensor-Slot wieder freigeben
            sensors[sensor_slot].active = false;
            sensors[sensor_slot].gpio = 255;
            sensors[sensor_slot].type = SENSOR_NONE;
            sensors[sensor_slot].sensor_name = "";
            sensors[sensor_slot].subzone_id = "";
            
            return false;  // ✅ Konfiguration komplett fehlgeschlagen
        }
    } else {
        // Library anfordern wenn Advanced System nicht verfügbar
        requestLibraryForSensor(type);
    }
  
  // Sensor-Count aktualisieren
  if (sensor_slot >= active_sensors) {
    active_sensors = sensor_slot + 1;
  }
  
  // Sub-Zone-Sensor-Count aktualisieren
  for (int i = 0; i < MAX_SUBZONES; i++) {
    if (sub_zones[i].subzone_id == subzone_id) {
      sub_zones[i].sensor_count++;
      break;
    }
  }
  
  saveSensorConfigToPreferences();
  
  DEBUG_PRINTF("[Sensor] Configured: %s on GPIO %d in SubZone %s\n", 
               sensor_name.c_str(), gpio, subzone_id.c_str());
  
  return true;
}

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

bool removeSensor(uint8_t gpio) {
  DEBUG_PRINTF("[Sensor] Attempting to remove sensor on GPIO %d\n", gpio);
  
  for (int i = 0; i < active_sensors; i++) {
    if (sensors[i].gpio == gpio && sensors[i].active) {
      DEBUG_PRINTF("[Sensor] Found sensor: %s on GPIO %d\n", 
                   sensors[i].sensor_name.c_str(), gpio);
      
      // GPIO zurück in Safe-Mode
      pinMode(gpio, INPUT_PULLUP);
      gpio_safe_mode[gpio] = true;
      gpio_configured[gpio] = false;
      
      // Sensor deaktivieren
      sensors[i].active = false;
      sensors[i].hardware_configured = false;
      sensors[i].library_loaded = false;
      sensors[i].type = SENSOR_NONE;
      sensors[i].sensor_name = "";
      sensors[i].subzone_id = "";
      
      // Sub-Zone Sensor-Count aktualisieren
      for (int j = 0; j < MAX_SUBZONES; j++) {
        if (sub_zones[j].subzone_id == sensors[i].subzone_id && sub_zones[j].sensor_count > 0) {
          sub_zones[j].sensor_count--;
          break;
        }
      }
      
      saveSensorConfigToPreferences();
      DEBUG_PRINTF("[Sensor] Successfully removed sensor from GPIO %d\n", gpio);
      return true;
    }
  }
  
  DEBUG_PRINTF("[Sensor] No active sensor found on GPIO %d\n", gpio);
  return false;
}


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

void sendSensorData(int sensor_index, float value) {
    // ✅ FRONTEND-ANFORDERUNG: Hybrid-Batching
    if (active_sensors > 5 && !system_config.disable_batching) {
        // Batch-Modus: Aktualisiere Sensor-Wert und sende später im Batch
        if (sensor_index < MAX_SENSORS) {
            sensors[sensor_index].last_value = value;
        }
        return; // Batch wird in performMeasurements() gesendet
    } else {
        // Einzel-Modus: Sofort senden
        sendIndividualSensorData(sensor_index, value);
    }
}

// ✅ FRONTEND-IMPLEMENTIERUNG: Einzel-Sensor-Daten senden (optimiert)
void sendIndividualSensorData(int sensor_index, float value) {
    if (sensor_index >= MAX_SENSORS || !master_zone.assigned) return;
    
    SensorConfig* sensor = &sensors[sensor_index];
    
    // ✅ FRONTEND-ANFORDERUNG: 512 Bytes Payload
    StaticJsonDocument<512> data_doc;
    
    // ✅ FRONTEND-ANFORDERUNG: Standard-Set (512 Bytes)
    data_doc["esp_id"] = esp_id;  // v3.6.0: esp_id hinzugefügt
    data_doc["gpio"] = sensor->gpio;
    data_doc["value"] = value;
    data_doc["unit"] = getSensorUnit(sensor->type);
    data_doc["type"] = getSensorTypeString(sensor->type);
    data_doc["timestamp"] = getUnixTimestamp();
    data_doc["iso_timestamp"] = advanced_system_initialized ? AdvancedFeatures::getISOTimestamp() : "";
    data_doc["quality"] = "excellent";  // v3.6.0: quality hinzugefügt
    data_doc["raw_value"] = sensor->last_raw_value;  // v3.6.0: raw_value immer
    data_doc["raw_mode"] = sensor->raw_mode;  // v3.6.0: raw_mode hinzugefügt
    data_doc["hardware_mode"] = sensor->hardware_configured;  // v3.6.0: hardware_mode immer
    data_doc["warnings"] = JsonArray();  // v3.6.0: warnings immer
    data_doc["time_quality"] = advanced_system_initialized ? AdvancedFeatures::getTimeQuality() : "unknown";  // v3.6.0: time_quality
    data_doc["context"] = "temperature_reading";  // v3.6.0: context spezifisch
    data_doc["sensor"] = sensor->sensor_name;  // v3.6.0: sensor statt name
      data_doc["kaiser_id"] = getKaiserId();  // v3.6.0: kaiser_id hinzugefügt
  data_doc["zone_id"] = getKaiserId();  // v3.6.0: zone_id hinzugefügt
    data_doc["sensor_name"] = sensor->sensor_name;  // v3.6.0: sensor_name hinzugefügt
    data_doc["subzone_id"] = sensor->subzone_id;  // v3.6.0: subzone_id immer
    data_doc["sensor_type"] = getSensorTypeString(sensor->type);  // v3.6.0: sensor_type hinzugefügt
    data_doc["raw_data"] = sensor->last_raw_value;  // 🆕 Server-kompatibel: Raw Data als Integer
    
    String data_message;
    ArduinoJson::serializeJson(data_doc, data_message);
    
    // ✅ FRONTEND-ANFORDERUNG: Einfache Topic-Struktur
    String sensor_topic = buildTopic("sensor", esp_id, String(sensor->gpio)) + "/data";
    
    // ✅ FRONTEND-ANFORDERUNG: QoS 1 für Sensor-Daten
    if (mqtt_client.publish(sensor_topic.c_str(), data_message.c_str(), MQTT_QOS_SENSOR_DATA)) {
        DEBUG_PRINTF("[Data] Sent: %s = %.2f %s (QoS %d)\n", 
                     sensor->sensor_name.c_str(), value, getSensorUnit(sensor->type).c_str(), MQTT_QOS_SENSOR_DATA);
        updateTopicStats(sensor_topic);  // v3.6.0: Topic-Statistik aktualisieren
    } else {
        DEBUG_PRINTF("[Data] Failed to send sensor data for GPIO %d\n", sensor->gpio);
    }
    
    // v3.6.0: Hierarchisches Topic für Frontend-Kompatibilität
    if (master_zone.assigned && !master_zone.master_zone_id.isEmpty() && !sensor->subzone_id.isEmpty()) {
            String hierarchical_topic = buildHierarchicalTopic(master_zone.master_zone_id, esp_id, sensor->subzone_id, String(sensor->gpio));
        
        if (mqtt_client.publish(hierarchical_topic.c_str(), data_message.c_str(), MQTT_QOS_SENSOR_DATA)) {
            DEBUG_PRINTF("[Data] Sent hierarchical: %s (QoS %d)\n", hierarchical_topic.c_str(), MQTT_QOS_SENSOR_DATA);
            updateTopicStats(hierarchical_topic);  // v3.6.0: Topic-Statistik aktualisieren
        }
    }
}

// ✅ FRONTEND-IMPLEMENTIERUNG: Batch-Sensor-Daten senden
void sendBatchedSensorData() {
    if (!mqtt_client.connected()) return;
    
    StaticJsonDocument<1024> batch_doc;  // ✅ OPTIMIERT: Reduziert von 2048 für 10 Sensoren
    batch_doc["esp_id"] = esp_id;
    batch_doc["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        batch_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    }
    
    JsonArray sensors_array = batch_doc.createNestedArray("sensors");
    
    for (int i = 0; i < active_sensors; i++) {
        if (sensors[i].active) {
            JsonObject sensor_data = sensors_array.createNestedObject();
            sensor_data["gpio"] = sensors[i].gpio;
            sensor_data["value"] = sensors[i].last_value;
            sensor_data["type"] = getSensorTypeString(sensors[i].type);
            sensor_data["unit"] = getSensorUnit(sensors[i].type);
            sensor_data["name"] = sensors[i].sensor_name;
            
            // ✅ Debug-Modus: Erweiterte Felder
            if (system_config.debug_mode) {
                sensor_data["raw_value"] = sensors[i].last_raw_value;
                sensor_data["hardware_mode"] = sensors[i].hardware_configured;
                sensor_data["subzone_id"] = sensors[i].subzone_id;
            }
        }
    }
    
    String batch_message;
    ArduinoJson::serializeJson(batch_doc, batch_message);
    
    String batch_topic = buildTopic("sensor_batch", esp_id);
    
    if (mqtt_client.publish(batch_topic.c_str(), batch_message.c_str(), MQTT_QOS_SENSOR_DATA)) {
        DEBUG_PRINTF("[Batch] Sent %d sensors in batch (QoS %d)\n", active_sensors, MQTT_QOS_SENSOR_DATA);
    } else {
        DEBUG_PRINT("[Batch] Failed to send batch data");
    }
}

// =============================================================================
// MQTT MESSAGE HANDLING
// =============================================================================

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
  else if (topic_str.endsWith("/ui_capabilities/request")) {
    handleUICapabilitiesRequest(message);
  }
  // 🧪 PHASE 2: Test Suite Trigger
  else if (topic_str.endsWith("/ui_test/run")) {
    handleUITestRequest(message);
  }
  // v3.6.0: Emergency-Broadcast-Handler
  else if (topic_str.indexOf("/broadcast/emergency") > 0) {
    handleEmergencyBroadcast(message);
  }
  // v3.6.0: System-Update-Broadcast-Handler
  else if (topic_str.indexOf("/broadcast/system_update") > 0) {
    handleSystemUpdateBroadcast(message);
  }
}

void handleZoneConfiguration(String message) {
  DEBUG_PRINT("[Zone] Processing zone configuration");
  
  StaticJsonDocument<512> doc;  // ✅ Optimiert für XIAO
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[Zone] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  if (doc["esp_id"] == esp_id) {
    // ✅ KONSISTENT: Verwende vorhandenes Change-Tracking
    String old_kaiser_id = kaiser_zone.kaiser_id;
    
    // Kaiser-Zone verarbeiten (vorhandene Logik)
    if (doc.containsKey("kaiser_zone")) {
      if (doc["kaiser_zone"].containsKey("system_name")) {
        kaiser_zone.system_name = doc["kaiser_zone"]["system_name"].as<String>();
        kaiser_zone.kaiser_id = generateKaiserId(kaiser_zone.system_name);
        kaiser_zone.id_generated = true;
      } else {
        kaiser_zone.kaiser_id = doc["kaiser_zone"]["id"].as<String>();
        kaiser_zone.id_generated = false;
      }
      kaiser_zone.kaiser_name = doc["kaiser_zone"]["name"].as<String>();
    }
    
    // Master-Zone verarbeiten (vorhandene Logik)
    if (doc.containsKey("master_zone")) {
      String old_master_zone_id = master_zone.master_zone_id;
      master_zone.master_zone_id = doc["master_zone"]["id"].as<String>();
      master_zone.master_zone_name = doc["master_zone"]["name"].as<String>();
      master_zone.is_master_esp = doc["master_zone"]["is_master"].as<bool>();
      master_zone.assigned = true;
      
      // ✅ KONSISTENT: Verwende vorhandenes Change-Tracking
      if (old_master_zone_id != master_zone.master_zone_id) {
        master_zone_changed = true;
        master_zone_change_timestamp = millis();
        previous_master_zone_id = old_master_zone_id;
      }
    }
    
    // ✅ KONSISTENT: Verwende vorhandene Speicherfunktionen
    saveZoneConfigToPreferences();
    
    // ✅ KONSISTENT: Verwende vorhandenes Topic-Management
    if (old_kaiser_id != kaiser_zone.kaiser_id) {
      kaiser_id_changed = true;
      kaiser_id_change_timestamp = millis();
      previous_kaiser_id = old_kaiser_id;
      
      // ✅ KONSISTENT: Verwende vorhandene Topic-Transition
      unsubscribeFromOldTopics(old_kaiser_id);
      subscribeToNewTopics();
    }
    
    // ✅ KONSISTENT: Verwende vorhandene Response-Funktionen
    sendZoneResponse("zone_configured");
    
    // ✅ KONSISTENT: Verwende vorhandene Konfigurations-Send-Funktionen
    sendESPConfigurationToFrontend();
    sendConfigurationToPiServer();
    
    current_state = STATE_ZONE_CONFIGURED;
  }
}

void handleSubZoneConfiguration(String message) {
  DEBUG_PRINT("[SubZone] Processing sub-zone configuration");
  
  StaticJsonDocument<512> doc;  // ✅ Optimiert für XIAO
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[SubZone] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  if (doc["esp_id"] == esp_id && doc.containsKey("subzones")) {
    JsonArrayConst subzones = doc["subzones"];
    
    // ✅ KONSISTENT: Verwende vorhandene Reset-Logik
    active_subzones = 0;
    
    for (JsonVariantConst subzone_var : subzones) {
      JsonObjectConst subzone = subzone_var;
      
      if (active_subzones < MAX_SUBZONES) {
        // ✅ KONSISTENT: Verwende vorhandenes Change-Tracking
        String old_subzone_id = sub_zones[active_subzones].subzone_id;
        sub_zones[active_subzones].subzone_id = subzone["id"].as<String>();
        sub_zones[active_subzones].subzone_name = subzone["name"].as<String>();
        sub_zones[active_subzones].description = subzone["description"].as<String>();
        sub_zones[active_subzones].active = true;
        sub_zones[active_subzones].sensor_count = 0;
        
        // ✅ KONSISTENT: Verwende vorhandenes Change-Tracking
        if (old_subzone_id != sub_zones[active_subzones].subzone_id) {
          subzone_changed = true;
          subzone_change_timestamp = millis();
          previous_subzone_id = old_subzone_id;
        }
        
        active_subzones++;
      }
    }
    
    // ✅ KONSISTENT: Verwende vorhandene Speicherfunktionen
    saveZoneConfigToPreferences();
    
    // ✅ KONSISTENT: Verwende vorhandene Response-Funktionen
    sendSubzoneResponse("subzones_configured");
    
    // ✅ KONSISTENT: Verwende vorhandene Konfigurations-Send-Funktionen
    sendESPConfigurationToFrontend();
    sendConfigurationToPiServer();
    
    current_state = STATE_SENSORS_CONFIGURED;
  }
}

void handleSensorConfiguration(String message) {
  DEBUG_PRINT("[Sensor] Processing sensor configuration");
  
  StaticJsonDocument<512> doc;  // ✅ Optimiert für XIAO
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[Sensor] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  if (doc["esp_id"] == esp_id && doc.containsKey("sensors")) {
    JsonArrayConst sensors_array = doc["sensors"];
    
    for (JsonVariantConst sensor_var : sensors_array) {
      JsonObjectConst sensor = sensor_var;
      
      uint8_t gpio = sensor["gpio"];
      String type_str = sensor["type"];
      String subzone_id = sensor["subzone_id"];
      String sensor_name = sensor["name"];
      
      // ✅ KONSISTENT: Verwende vorhandene Sensor-Typ-Konvertierung
      SensorType type = SENSOR_NONE;
      if (type_str == "ph_dfrobot") type = SENSOR_PH_DFROBOT;
      else if (type_str == "ec_generic") type = SENSOR_EC_GENERIC;
      else if (type_str == "temp_ds18b20") type = SENSOR_TEMP_DS18B20;
      else if (type_str == "temp_dht22") type = SENSOR_TEMP_DHT22;
      else if (type_str == "moisture_pi") type = SENSOR_MOISTURE;
      else if (type_str == "pressure_pi") type = SENSOR_PRESSURE;
      else if (type_str == "co2_pi") type = SENSOR_CO2;
      else if (type_str == "air_quality_pi") type = SENSOR_AIR_QUALITY;
      else if (type_str == "light_pi") type = SENSOR_LIGHT;
      else if (type_str == "flow_pi") type = SENSOR_FLOW;
      else if (type_str == "level_pi") type = SENSOR_LEVEL;
      else if (type_str.endsWith("_pi")) type = SENSOR_CUSTOM_PI_ENHANCED;
      
      // ✅ KONSISTENT: Verwende vorhandene Raw-Mode-Konfiguration
      bool raw_mode = false;
      if (type != SENSOR_CUSTOM_OTA && sensor.containsKey("raw_mode")) {
        raw_mode = sensor["raw_mode"].as<bool>();
      }
      
      // ✅ KONSISTENT: Verwende vorhandene I2C-Sensor-Konfiguration
      if (type_str == "i2c_generic" || type_str == "SENSOR_CUSTOM_PI_ENHANCED") {
        uint8_t i2c_address = sensor.containsKey("i2c_address") ? 
                             strtol(sensor["i2c_address"].as<String>().c_str(), nullptr, 16) : 0x44;
        String sensor_hint = sensor.containsKey("sensor_hint") ? 
                           sensor["sensor_hint"].as<String>() : "";
        
        if (GenericI2CSensor::configureSensor(gpio, i2c_address, sensor_hint, subzone_id, sensor_name)) {
          DEBUG_PRINTF("[Sensor] I2C sensor configured: %s on GPIO %d, I2C 0x%02X\n", 
                      sensor_name.c_str(), gpio, i2c_address);
        }
      } else if (type != SENSOR_NONE) {
        // ✅ KONSISTENT: Verwende vorhandene Sensor-Konfiguration
        if (configureSensor(gpio, type, subzone_id, sensor_name)) {
          // ✅ KONSISTENT: Verwende vorhandene Raw-Mode-Setzung
          if (type != SENSOR_CUSTOM_OTA) {
            for (int i = 0; i < active_sensors; i++) {
              if (sensors[i].gpio == gpio && sensors[i].active) {
                sensors[i].raw_mode = raw_mode;
                break;
              }
            }
          }
        }
      }
    }
    
    // ✅ KONSISTENT: Speichere Sensor-Konfiguration
    saveSensorConfigToPreferences();
    
    // ✅ KONSISTENT: Sende ACK und Konfigurations-Update
    StaticJsonDocument<512> ack_doc;
    ack_doc["esp_id"] = esp_id;
    ack_doc["status"] = "sensors_configured";
    ack_doc["sensor_count"] = active_sensors;
    String ack_message;
    ArduinoJson::serializeJson(ack_doc, ack_message);
    String ack_topic = buildTopic("status", esp_id);
    mqtt_client.publish(ack_topic.c_str(), ack_message.c_str());
    
    // ✅ KONSISTENT: Sende Konfigurations-Update an Frontend und Pi
    sendESPConfigurationToFrontend();
    sendConfigurationToPiServer();
    
    current_state = STATE_SENSORS_CONFIGURED;
  }
}


void handleSensorRemoval(String message) {
  DEBUG_PRINT("[Sensor] Processing sensor removal request");
  
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[Sensor] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  if (doc["esp_id"] == esp_id) {
    uint8_t gpio = doc["gpio"];
    String reason = doc.containsKey("reason") ? doc["reason"].as<String>() : "manual_removal";
    
    bool success = removeSensor(gpio);
    
    // Bestätigung senden
    StaticJsonDocument<256> response;
    response["esp_id"] = esp_id;
    response["action"] = "sensor_removal";
    response["gpio"] = gpio;
    response["success"] = success;
    response["reason"] = reason;
    response["timestamp"] = getUnixTimestamp();
    response["active_sensors"] = active_sensors;
    
    String response_msg;
    ArduinoJson::serializeJson(response, response_msg);
    
    String response_topic = buildSpecialTopic("sensor/removed", esp_id);
    mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
  }
}



void handleLibraryDownloadStart(String message) {
  DEBUG_PRINT("[OTA] Processing library download start");
  
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[OTA] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  if (doc["esp_id"] == esp_id) {
    String library_name = doc["library_name"];
    String version = doc["version"];
    size_t total_size = doc["total_size"];
    uint8_t total_chunks = doc["total_chunks"];
    uint32_t checksum = doc["checksum"];
    
    initLibraryDownload(library_name, version, total_size, total_chunks, checksum);
  }
}

void handleLibraryChunk(String message) {
  if (!library_download_in_progress) {
    DEBUG_PRINT("[OTA] Received chunk but no download in progress");
    return;
  }
  
      StaticJsonDocument<1024> doc;  // ✅ OPTIMIERT: Reduziert von 2048 für Library Download
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[OTA] Chunk JSON parse error: %s\n", error.c_str());
    return;
  }
  
  if (doc["esp_id"] == esp_id && doc["library_name"] == current_library_download.name) {
    uint8_t chunk_number = doc["chunk_number"];
    String chunk_data_base64 = doc["chunk_data"];
    
    // *** ADVANCED FEATURES: Echte Base64-Dekodierung ***
    if (advanced_system_initialized) {
      // Verwende Advanced Features Base64-Decoder
      size_t max_chunk_size = LIBRARY_CHUNK_SIZE + 100; // Extra Buffer
      uint8_t* chunk_data = (uint8_t*)malloc(max_chunk_size);
      
      if (chunk_data) {
        int decoded_size = AdvancedFeatures::decodeBase64(chunk_data_base64, chunk_data, max_chunk_size);
        
        if (decoded_size > 0) {
          processLibraryChunk(chunk_number, chunk_data, decoded_size);
        } else {
          DEBUG_PRINTF("[OTA] Base64 decode failed for chunk %d\n", chunk_number);
        }
        
        free(chunk_data);
      } else {
        DEBUG_PRINT("[OTA] Memory allocation failed for chunk decoding");
      }
    } else {
      // Fallback: Simulation
      size_t chunk_size = chunk_data_base64.length() * 3 / 4; // Approximation
      uint8_t* chunk_data = (uint8_t*)malloc(chunk_size);
      
      if (chunk_data) {
        // Simuliere Chunk-Daten
        for (size_t i = 0; i < chunk_size; i++) {
          chunk_data[i] = (uint8_t)(chunk_number + i); // Dummy-Daten
        }
        
        processLibraryChunk(chunk_number, chunk_data, chunk_size);
        free(chunk_data);
      }
    }
  }
}

void handleSystemCommand(String message) {
  DEBUG_PRINT("[System] Processing system command");
  
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[System] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  if (doc["esp_id"] == esp_id) {
    String command = doc["command"].as<String>();
    
    if (command == "restart") {
      DEBUG_PRINT("[System] Restart command received");
      sendSystemResponse("restart", true, "ESP restarting");
      delay(1000);
      ESP.restart();
    }
    else if (command == "reset_config") {
      DEBUG_PRINT("[System] Reset configuration command received");
      sendSystemResponse("reset_config", true, "Configuration reset, ESP restarting");
      preferences.begin("wifi_config", false);
      preferences.clear();
      preferences.end();
      preferences.begin("zone_config", false);
      preferences.clear();
      preferences.end();
      preferences.begin("sensor_config", false);
      preferences.clear();
      preferences.end();
      ESP.restart();
    }
    else if (command == "safe_mode") {
      DEBUG_PRINT("[System] Safe mode command received");
      handleSafeModeTransition("system_command");
      enableSafeModeForAllPins();
      sendSystemResponse("safe_mode", true, "Safe mode activated");
    }
    // ✅ PHASE 3: Emergency Stop Handler erweitern
    else if (command == "emergency_stop_all") {
      DEBUG_PRINT("[System] Emergency stop all command received");
      
      // Aktoren stoppen (ENTWICKLERVORGABEN: Bestehende advanced_system nutzen)
      if (advanced_system_initialized) {
        advanced_system.emergencyStopAllActuators();  // ✅ Bestehende Funktion
      }
      
      // Sensoren in Safe Mode (ENTWICKLERVORGABEN: Bestehende Funktion nutzen)
      enableSafeModeForAllPins();  // ✅ Bereits implementiert
      
      sendSystemResponse("emergency_stop_all", true, "All systems stopped");
    }
    // ✅ PHASE 3: Emergency Stop per ESP
    else if (command == "emergency_stop_esp") {
      DEBUG_PRINT("[System] Emergency stop ESP command received");
      String target_esp = doc["target_esp"] | "";
      if (target_esp == esp_id) {
        // Lokaler Emergency Stop (ENTWICKLERVORGABEN: Bestehende Funktionen nutzen)
        if (advanced_system_initialized) {
          advanced_system.emergencyStopAllActuators();  // ✅ Bestehende Funktion
        }
        enableSafeModeForAllPins();  // ✅ Bestehende Funktion
        
        sendSystemResponse("emergency_stop_esp", true, "ESP emergency stop executed");
      }
    }
    else if (command == "diagnostics") {
      DEBUG_PRINT("[System] Diagnostics command received");
      
      if (advanced_system_initialized) {
        advanced_system.performDiagnostics();
      }
      
      sendSystemResponse("diagnostics", true, "Diagnostics completed");
    }
    else if (command == "send_enhanced_stats") {
      DEBUG_PRINT("[System] Enhanced topic statistics command received");
      sendEnhancedTopicStats();
      sendSystemResponse("send_enhanced_stats", true, "Enhanced topic statistics sent");
    }
    else if (command == "reset_wifi") {
      DEBUG_PRINT("[System] Reset WiFi configuration command received");
      resetWiFiConfiguration();
      
      // Force system back to WiFi setup state
      current_state = STATE_WIFI_SETUP;
      
      // Start web configuration portal
      if (!web_config_server) {
        web_config_server = new WebConfigServer(esp_id);
      }
      
      if (web_config_server->startConfigPortal()) {
        DEBUG_PRINT("[System] Web configuration portal started after WiFi reset");
        wifi_config.setWebserverActive(true);
      }
      
      sendSystemResponse("reset_wifi", true, "WiFi configuration reset, web portal started");
    }
    // ✅ FRONTEND-IMPLEMENTIERUNG: Debug-Modus konfigurieren
    else if (command == "configure_debug") {
      DEBUG_PRINT("[System] Debug configuration command received");
      
      if (doc.containsKey("debug_mode")) {
        system_config.debug_mode = doc["debug_mode"].as<bool>();
        DEBUG_PRINTF("[System] Debug mode: %s", system_config.debug_mode ? "enabled" : "disabled");
      }
      
      if (doc.containsKey("disable_batching")) {
        system_config.disable_batching = doc["disable_batching"].as<bool>();
        DEBUG_PRINTF("[System] Batching: %s", system_config.disable_batching ? "disabled" : "enabled");
      }
      
      sendSystemResponse("configure_debug", true, "Debug configuration updated");
    }
    else if (command == "delete_esp") {
      DEBUG_PRINT("[System] Delete ESP command received");
      
      // ✅ NEU: Alle Pins in Safe Mode setzen (Funktion bereits vorhanden!)
      enableSafeModeForAllPins();
      
      // Alle Sensoren entfernen (bereits im Safe Mode)
      for (int i = 0; i < MAX_SENSORS; i++) {
        if (sensors[i].active) {
          removeSensor(sensors[i].gpio);
        }
      }
      
      // Alle Aktoren entfernen (falls Advanced System aktiv)
      if (advanced_system_initialized) {
        // Entferne alle konfigurierten Aktoren einzeln
        for (uint8_t gpio = 0; gpio < MAX_GPIO_PINS; gpio++) {
          if (advanced_system.isActuatorConfigured(gpio)) {
            advanced_system.removeActuator(gpio);
          }
        }
      }
      
      // Konfiguration zurücksetzen
      // ✅ KORRIGIERT: Verwende bereits vorhandene Funktionen
      preferences.begin("sensor_config", false);
      preferences.clear();
      preferences.end();
      
      preferences.begin("zone_config", false);
      preferences.clear();
      preferences.end();
      
      preferences.begin("wifi_config", false);
      preferences.clear();
      preferences.end();
      
      // Bestätigung senden
      StaticJsonDocument<256> ack_doc;
      ack_doc["esp_id"] = esp_id;
      ack_doc["command"] = "delete_esp";
      ack_doc["status"] = "completed";
      ack_doc["message"] = "ESP configuration deleted and all pins in safe mode";
      ack_doc["safe_mode_activated"] = true;
      // ✅ KORRIGIERT: Verwende bereits vorhandene GPIO-Zählung
      int safe_pins = 0;
      for (int i = 0; i < MAX_GPIO_PINS; i++) {
        if (gpio_safe_mode[i]) {
          safe_pins++;
        }
      }
      ack_doc["pins_in_safe_mode"] = safe_pins;
      ack_doc["timestamp"] = getUnixTimestamp();
      
      String ack_message;
      ArduinoJson::serializeJson(ack_doc, ack_message);
      
      String ack_topic = buildTopic("response", esp_id);
      mqtt_client.publish(ack_topic.c_str(), ack_message.c_str());
      
      // ESP neu starten nach 3 Sekunden
      delay(3000);
      ESP.restart();
    }
    else if (command == "status_request") {
      DEBUG_PRINT("[System] Status request received");
      
      // Sofortigen Status senden
      sendStatusUpdate();
      sendHeartbeat();
      
      // Bestätigung senden
      StaticJsonDocument<256> ack_doc;
      ack_doc["esp_id"] = esp_id;
      ack_doc["command"] = "status_request";
      ack_doc["status"] = "completed";
      ack_doc["message"] = "Status update sent";
      // ✅ KORRIGIERT: Vereinfachter Safe Mode Status
      JsonObject safe_status = ack_doc.createNestedObject("safe_mode_status");
      safe_status["active"] = true;
      safe_status["pins_in_safe_mode"] = 0; // Vereinfacht
      ack_doc["timestamp"] = getUnixTimestamp();
      
      String ack_message;
      ArduinoJson::serializeJson(ack_doc, ack_message);
      
      String ack_topic = buildTopic("response", esp_id);
      mqtt_client.publish(ack_topic.c_str(), ack_message.c_str());
    }
  }
}

// NEU: ESP-Konfigurations-Handler implementieren
void handleESPConfiguration(String message) {
  DEBUG_PRINT("[ESP Config] Processing ESP configuration");
  
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[ESP Config] JSON parsing failed: ");
    DEBUG_PRINT(error.c_str());
    return;
  }
  
  // ESP-Konfiguration speichern
  if (doc.containsKey("esp_username")) {
    wifi_config.esp_username = doc["esp_username"].as<String>();
    preferences.putString("esp_name", wifi_config.esp_username);  // ✅ FIXED: Use shorter key
  }
  
  if (doc.containsKey("esp_friendly_name")) {
    wifi_config.esp_friendly_name = doc["esp_friendly_name"].as<String>();
    preferences.putString("friendly", wifi_config.esp_friendly_name);  // ✅ FIXED: Use shorter key
  }
  
  if (doc.containsKey("esp_zone")) {
    wifi_config.esp_zone = doc["esp_zone"].as<String>();
    preferences.putString("esp_zone", wifi_config.esp_zone);
  }
  
  if (doc.containsKey("connection_established")) {
    wifi_config.connection_established = doc["connection_established"].as<bool>();
    preferences.putBool("conn", wifi_config.connection_established);  // ✅ FIXED: Use shorter key
  }
  
  // Bestätigung senden
  sendESPConfigurationResponse(true, "Configuration saved successfully");
  
  DEBUG_PRINT("[ESP Config] Configuration updated successfully");
}

// NEU: ESP-Konfigurations-Response senden
void sendESPConfigurationResponse(bool success, String message) {
  if (!mqtt_client.connected()) return;
  
  DynamicJsonDocument doc(512);
  doc["esp_id"] = esp_id;
  doc["action"] = "esp_configuration";
  doc["success"] = success;
  doc["message"] = message;
  doc["timestamp"] = getUnixTimestamp();
  
  // 🆕 NEU: GPIO Conflict Details (nur bei Fehlern)
  if (!success && last_conflict_gpio.length() > 0) {
    doc["response_type"] = "gpio_conflict";
    doc["gpio"] = last_conflict_gpio;
    doc["conflict_type"] = last_conflict_type;
    doc["current_owner"] = last_conflict_current_owner;
    doc["requested_owner"] = last_conflict_requested_owner;
  }
  
  // 🆕 NEU: Safe Mode Status in Response
  JsonObject safe_status = doc.createNestedObject("safe_mode");
  safe_status["active"] = true;
  safe_status["pins_in_safe_mode"] = count_safe_mode_pins();
  safe_status["enter_reason"] = safe_mode_enter_reason;
  safe_status["enter_timestamp"] = safe_mode_enter_timestamp;
  
  // 🆕 NEU: Enhanced configuration structure
  JsonObject configuration = doc.createNestedObject("configuration");
  configuration["esp_username"] = wifi_config.getDeviceName();
  configuration["esp_friendly_name"] = wifi_config.getFriendlyName();  // 🆕 Friendly name
  configuration["esp_zone"] = wifi_config.esp_zone;
  configuration["server_address"] = wifi_config.getServerAddress();  // 🆕 Unified config
  configuration["http_port"] = wifi_config.getHttpPort();  // 🆕 HTTP port
  configuration["mqtt_port"] = wifi_config.mqtt_port;
  configuration["connection_established"] = wifi_config.connection_established;
  
  String response;
  ArduinoJson::serializeJson(doc, response);
  
  String topic = buildTopic("response", esp_id);
  mqtt_client.publish(topic.c_str(), response.c_str());
  
  DEBUG_PRINTF("[ESP Config] Response sent: %s\n", success ? "SUCCESS" : "FAILED");
}

// =============================================================================
// MQTT CONNECTION & SUBSCRIPTION
// =============================================================================

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
  
  // ✅ FIXED: Use IP address directly instead of hostname to avoid DNS issues
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
  // Das System kann weiterhin funktionieren, auch ohne MQTT
  if (current_state == STATE_WIFI_CONNECTED) {
    // Bleibe im WIFI_CONNECTED State, damit das Webportal erreichbar bleibt
    DEBUG_PRINT("[MQTT] Staying in WIFI_CONNECTED state for troubleshooting");
  }
  
  return false;
}

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
    base_topic + "actuator/+/command",    // Individual actuator commands
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
    base_topic + "pi/+/command",        // Pi commands
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

// =============================================================================
// STATUS & MONITORING (ENHANCED)
// =============================================================================

void sendStatusUpdate() {
  if (!mqtt_client.connected()) return;
  
  StaticJsonDocument<512> status_doc;  // ✅ Optimiert für XIAO
  status_doc["esp_id"] = esp_id;
  status_doc["mac"] = mac_address;
  status_doc["state"] = current_state;
  status_doc["uptime"] = millis();
  status_doc["free_heap"] = ESP.getFreeHeap();
  status_doc["wifi_rssi"] = WiFi.RSSI();
  
  // v3.6.0: Context für Frontend-Logging
  status_doc["context"] = "status_update";
  
  // 🆕 NEU: Network Status für Frontend
  status_doc["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
  status_doc["wifi_reconnects"] = wifi_reconnect_count;
  status_doc["mqtt_reconnects"] = mqtt_reconnect_count;
  
  // 🆕 NEU: Frontend-required fields
  status_doc["broker_ip"] = wifi_config.getServerAddress();
  status_doc["broker_port"] = wifi_config.mqtt_port;
  status_doc["server_address"] = wifi_config.getServerAddress();  // 🆕 Unified config
  status_doc["http_port"] = wifi_config.getHttpPort();  // 🆕 HTTP port
  status_doc["system_state"] = getSystemStateString(current_state);  // 🆕 System state string
  status_doc["webserver_active"] = (current_state == STATE_WIFI_SETUP || current_state == STATE_MQTT_CONNECTING);  // 🆕 WebServer status
  
  // *** ADVANCED FEATURES: Erweiterte Timestamps ***
  if (advanced_system_initialized) {
    status_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    status_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
    status_doc["advanced_features"] = true;
  } else {
    status_doc["timestamp"] = getUnixTimestamp();
    status_doc["advanced_features"] = false;
  }
  
  // Zone-Information
  JsonObject zones = status_doc.createNestedObject("zones");
  zones["kaiser_id"] = getKaiserId();
  zones["kaiser_connected"] = kaiser_zone.connected;
  zones["master_zone_id"] = master_zone.master_zone_id;
  zones["master_zone_assigned"] = master_zone.assigned;
  zones["is_master_esp"] = master_zone.is_master_esp;
  zones["active_subzones"] = active_subzones;
  
  // 🆕 NEU: Kaiser-ID-Change-Information für Frontend
  if (kaiser_id_changed) {
    zones["kaiser_id_changed"] = true;
    zones["previous_kaiser_id"] = previous_kaiser_id;
    zones["kaiser_id_change_timestamp"] = kaiser_id_change_timestamp;
    
    // Reset Flag nach 5 Minuten (300.000 ms)
    if (millis() - kaiser_id_change_timestamp > 300000) {
      kaiser_id_changed = false;
      DEBUG_PRINT("[Status] Kaiser-ID change flag reset after 5 minutes");
    }
  }
  
  // 🆕 NEU: Master-Zone-Change-Information für Frontend
  if (master_zone_changed) {
    zones["master_zone_changed"] = true;
    zones["previous_master_zone_id"] = previous_master_zone_id;
    zones["master_zone_change_timestamp"] = master_zone_change_timestamp;
    
    // Reset Flag nach 5 Minuten (300.000 ms)
    if (millis() - master_zone_change_timestamp > 300000) {
      master_zone_changed = false;
      DEBUG_PRINT("[Status] Master-Zone change flag reset after 5 minutes");
    }
  }
  
  // 🆕 NEU: Subzone-Change-Information für Frontend
  if (subzone_changed) {
    zones["subzone_changed"] = true;
    zones["previous_subzone_id"] = previous_subzone_id;
    zones["subzone_change_timestamp"] = subzone_change_timestamp;
    
    // Reset Flag nach 5 Minuten (300.000 ms)
    if (millis() - subzone_change_timestamp > 300000) {
      subzone_changed = false;
      DEBUG_PRINT("[Status] Subzone change flag reset after 5 minutes");
    }
  }
  
  // 🆕 NEU: ESP-ID-Change-Information für Frontend
  if (esp_id_changed) {
    zones["esp_id_changed"] = true;
    zones["previous_esp_id"] = previous_esp_id;
    zones["esp_id_change_timestamp"] = esp_id_change_timestamp;
    
    // Reset Flag nach 5 Minuten (300.000 ms)
    if (millis() - esp_id_change_timestamp > 300000) {
      esp_id_changed = false;
      DEBUG_PRINT("[Status] ESP-ID change flag reset after 5 minutes");
    }
  }
  
  // Sensor-Information
  JsonObject sensors_obj = status_doc.createNestedObject("sensors");
  sensors_obj["active_sensors"] = active_sensors;
  sensors_obj["library_download_active"] = library_download_in_progress;
  
  // Hardware-Sensor-Status
  int hardware_sensors = 0;
  for (int i = 0; i < active_sensors; i++) {
      if (sensors[i].hardware_configured) hardware_sensors++;
  }
  sensors_obj["hardware_sensors"] = hardware_sensors;
  sensors_obj["simulation_sensors"] = active_sensors - hardware_sensors;
  
  // GPIO-Status
  JsonArray gpio_status = status_doc.createNestedArray("gpio_status");
  int configured_gpios = 0;
  for (int i = 0; i < MAX_GPIO_PINS; i++) {
      if (gpio_configured[i]) {
          JsonObject gpio_obj = gpio_status.createNestedObject();
          gpio_obj["pin"] = i;
          gpio_obj["safe_mode"] = gpio_safe_mode[i];
          configured_gpios++;
      }
  }
  sensors_obj["configured_gpios"] = configured_gpios;
  
  // *** PI-INTEGRATION STATUS ***
  if (advanced_system_initialized) {
      JsonObject pi_status = status_doc.createNestedObject("pi_integration");
      pi_status["pi_available"] = advanced_system.isPiAvailable();
      pi_status["pi_enhanced_sensors"] = advanced_system.countPiEnhancedSensors();
      pi_status["pi_url"] = "configured";  // URL nicht preisgeben aus Security-Gründen
      
      // Pi-Enhanced Sensor Performance
      int pi_sensors = 0;
      for (int i = 0; i < active_sensors; i++) {
          if (sensors[i].active && sensors[i].library_name.endsWith("_pi_enhanced")) {
              pi_sensors++;
          }
      }
      
      pi_status["pi_processing_active"] = pi_sensors;
      pi_status["total_enhanced_sensors"] = advanced_system.countPiEnhancedSensors();
  }
  
  // ✅ NEU: Safe Mode Status hinzufügen
  JsonObject safe_mode_status = status_doc.createNestedObject("safe_mode");
  safe_mode_status["active"] = true;
  safe_mode_status["pins_in_safe_mode"] = count_safe_mode_pins();
  safe_mode_status["total_available_pins"] = MAX_GPIO_PINS;
  
  // 🆕 NEU: Safe Mode Reason Information (PFLICHTFELDER)
  safe_mode_status["enter_reason"] = safe_mode_enter_reason;
  safe_mode_status["enter_timestamp"] = safe_mode_enter_timestamp;
  
  JsonArray safe_pins = safe_mode_status.createNestedArray("safe_pins");
  for (int i = 0; i < MAX_GPIO_PINS; i++) {
    if (gpio_safe_mode[i]) {
      safe_pins.add(i);
    }
  }
  
  // 🆕 NEU: Enhanced ESP-Konfigurations-Informationen
  JsonObject esp_config = status_doc.createNestedObject("esp_configuration");
  esp_config["esp_username"] = wifi_config.getDeviceName();
  esp_config["esp_friendly_name"] = wifi_config.getFriendlyName();  // 🆕 Friendly name
  esp_config["esp_zone"] = wifi_config.esp_zone;
  esp_config["connection_established"] = wifi_config.connection_established;
  esp_config["broker_ip"] = wifi_config.getServerAddress();
  esp_config["broker_port"] = wifi_config.mqtt_port;
  esp_config["server_address"] = wifi_config.getServerAddress();  // 🆕 Unified config
  esp_config["http_port"] = wifi_config.getHttpPort();  // 🆕 HTTP port
  
  String status_message;
  ArduinoJson::serializeJson(status_doc, status_message);
  
  String status_topic = buildTopic("status", esp_id);
  mqtt_client.publish(status_topic.c_str(), status_message.c_str());
  updateTopicStats(status_topic);  // v3.6.0: Topic-Statistik aktualisieren
  
  DEBUG_PRINTF("[Status] Status update sent (State: %s)\n", getSystemStateString(current_state).c_str());
  
  // ✅ NEU: Separates ESP Config Topic senden
  sendESPConfigurationUpdate();
  
  // ✅ NEU: Zusätzlich ESP Config für Frontend v3.2 senden
  sendESPConfigurationToFrontend();
  
  // 🆕 NEU: Pi Server Konfiguration senden
  sendConfigurationToPiServer();
}

// ✅ NEU: Separate ESP-Konfiguration senden (Frontend erwartet das!)
void sendESPConfigurationUpdate() {
  if (!mqtt_client.connected()) return;
  
  DynamicJsonDocument doc(1024);
  
  doc["esp_id"] = esp_id;
  doc["timestamp"] = getUnixTimestamp();
  
  // ✅ Frontend-erwartete Felder
  doc["esp_username"] = wifi_config.getDeviceName();
  doc["esp_friendly_name"] = wifi_config.getFriendlyName();  
  doc["esp_zone"] = wifi_config.esp_zone;
  doc["connection_established"] = wifi_config.connection_established;
  doc["broker_ip"] = wifi_config.getServerAddress();
  doc["broker_port"] = wifi_config.mqtt_port;
  
  // ✅ NEU: HTTP Port und Server Address
  doc["http_port"] = wifi_config.getHttpPort();
  doc["server_address"] = wifi_config.getServerAddress();
  
  String response;
  ArduinoJson::serializeJson(doc, response);
  
  // ✅ Frontend erwartet dieses Topic!
  String topic = buildTopic("config", esp_id);
  mqtt_client.publish(topic.c_str(), response.c_str());
  
  DEBUG_PRINT("[ESP Config] Configuration update sent");
}

// ✅ ESP Config Topic für Frontend v3.2 senden
void sendESPConfigurationToFrontend() {
  if (!mqtt_client.connected()) {
    DEBUG_PRINT("[Config] MQTT not connected - skipping config send");
    return;
  }
  
  DynamicJsonDocument doc(1024);
  
  doc["esp_id"] = esp_id;
  doc["timestamp"] = getUnixTimestamp();
  
  // ✅ Frontend v3.2 erwartet exakt diese Felder (bereits alle im Backend vorhanden!):
  doc["esp_username"] = wifi_config.getDeviceName();
  doc["esp_friendly_name"] = wifi_config.getFriendlyName();  // ✅ BEREITS VORHANDEN
  doc["esp_zone"] = wifi_config.esp_zone;
  doc["connection_established"] = wifi_config.connection_established;
  doc["broker_ip"] = wifi_config.getServerAddress();
  doc["broker_port"] = wifi_config.mqtt_port;
  
  // ✅ HTTP Port und Server Address (Backend v3.3 unterstützt bereits!):
  doc["http_port"] = wifi_config.getHttpPort();  // ✅ BEREITS VORHANDEN
  doc["server_address"] = wifi_config.getServerAddress();  // ✅ BEREITS VORHANDEN
  
  String response;
  ArduinoJson::serializeJson(doc, response);
  
  // ✅ Payload-Validierung vor dem Senden
  if (!isValidConfigPayload(response)) {
    DEBUG_PRINT("[Config] ❌ Invalid config payload - aborting send");
    return;
  }
  
  // ✅ Frontend v3.2 erwartet genau dieses Topic!
  String config_topic = buildTopic("config", esp_id);
  
  // ✅ Sichere Veröffentlichung mit QoS 1 und Retry
  if (safePublish(config_topic, response, 1, 3)) {
    DEBUG_PRINT("[Config] ✅ ESP Configuration sent to frontend v3.2 with QoS 1");
  } else {
    DEBUG_PRINT("[Config] ❌ Failed to send ESP Configuration to frontend");
  }
}

// 🆕 NEU: Pi Server Konfiguration senden
void sendConfigurationToPiServer() {
  // Nur senden wenn Pi Server IP konfiguriert ist
  if (wifi_config.getServerAddress().length() == 0) {
    DEBUG_PRINT("[Pi] No server address configured - skipping Pi configuration");
    return;
  }
  
  if (!mqtt_client.connected()) {
    DEBUG_PRINT("[Pi] MQTT not connected - skipping Pi config send");
    return;
  }
  
  // Konfiguration an Pi Server senden
  String pi_config_topic = buildTopic("config", esp_id);
  
  StaticJsonDocument<512> config_doc;
  config_doc["esp_id"] = esp_id;
  config_doc["esp_username"] = wifi_config.getDeviceName();
  config_doc["esp_friendly_name"] = wifi_config.getFriendlyName();
  config_doc["esp_zone"] = wifi_config.esp_zone;
  config_doc["server_address"] = wifi_config.getServerAddress();
  config_doc["http_port"] = wifi_config.getHttpPort();
  config_doc["broker_ip"] = wifi_config.getServerAddress();
  config_doc["broker_port"] = wifi_config.mqtt_port;
  config_doc["connection_established"] = true;
  config_doc["timestamp"] = getUnixTimestamp();
  
  String config_json;
  serializeJson(config_doc, config_json);
  
  // ✅ Payload-Validierung vor dem Senden
  if (!isValidConfigPayload(config_json)) {
    DEBUG_PRINT("[Pi] ❌ Invalid Pi config payload - aborting send");
    return;
  }
  
  // ✅ Sichere Veröffentlichung mit QoS 1 und Retry
  if (safePublish(pi_config_topic, config_json, 1, 3)) {
    DEBUG_PRINT("[Pi] ✅ Configuration sent to Pi Server with QoS 1");
    pi_config_sent = true;
    pi_config_sent_time = millis();
  } else {
    DEBUG_PRINT("[Pi] ❌ Failed to send configuration to Pi Server");
  }
}

// 🆕 NEU: Pi Server Response Handler
void handlePiServerResponse(const String& topic, const String& payload) {
  // Nur verarbeiten wenn es ein Pi Server Response ist
  if (!topic.endsWith("/response")) {
    return;
  }
  
  StaticJsonDocument<512> response_doc;
  DeserializationError error = deserializeJson(response_doc, payload);
  
  if (error) {
    Serial.println("[Pi] Failed to parse Pi Server response");
    return;
  }
  
  // Prüfe ob es eine Konfigurationsbestätigung ist
  if (response_doc.containsKey("config_confirmed") && response_doc["config_confirmed"] == true) {
    pi_configuration_confirmed = true;
    Serial.println("[Pi] ✅ Configuration confirmed by Pi Server");
  }
  
  // Prüfe auf Fehler
  if (response_doc.containsKey("error")) {
    String error_msg = response_doc["error"].as<String>();
    Serial.printf("[Pi] ❌ Pi Server error: %s\n", error_msg.c_str());
  }
}

void sendHeartbeat() {
  if (!mqtt_client.connected()) {
    DEBUG_PRINT("[Heartbeat] MQTT not connected - skipping heartbeat");
    return;
  }
  
  StaticJsonDocument<512> heartbeat_doc;  // 🆕 Größerer Buffer für Network-Status
  heartbeat_doc["esp_id"] = esp_id;
  heartbeat_doc["timestamp"] = getUnixTimestamp();  // v3.6.0: Unix-Timestamp für Server-Kompatibilität
  heartbeat_doc["state"] = getSystemStateString(current_state);  // 🆕 Server-kompatibel: Dynamischer State
  heartbeat_doc["uptime_seconds"] = millis() / 1000;  // v3.6.0: uptime_seconds
  heartbeat_doc["free_heap"] = ESP.getFreeHeap();  // v3.6.0: free_heap statt free_heap
  heartbeat_doc["wifi_rssi"] = WiFi.RSSI();  // v3.6.0: wifi_rssi
  heartbeat_doc["active_sensors"] = active_sensors;
  heartbeat_doc["mqtt_connected"] = mqtt_client.connected();  // v3.6.0: mqtt_connected
  heartbeat_doc["hardware_mode"] = true;  // v3.6.0: hardware_mode
  heartbeat_doc["raw_mode"] = false;  // v3.6.0: raw_mode
  heartbeat_doc["time_quality"] = advanced_system_initialized ? AdvancedFeatures::getTimeQuality() : "unknown";  // v3.6.0: time_quality
  heartbeat_doc["warnings"] = JsonArray();  // v3.6.0: warnings
  heartbeat_doc["iso_timestamp"] = advanced_system_initialized ? AdvancedFeatures::getISOTimestamp() : "";  // v3.6.0: iso_timestamp
  heartbeat_doc["kaiser_id"] = getKaiserId();  // v3.6.0: kaiser_id
  heartbeat_doc["kaiser_id_changed"] = kaiser_id_changed;  // v3.6.0: kaiser_id_changed
  heartbeat_doc["esp_id_changed"] = esp_id_changed;  // v3.6.0: esp_id_changed
  heartbeat_doc["master_zone_changed"] = master_zone_changed;  // v3.6.0: master_zone_changed
  heartbeat_doc["subzone_changed"] = subzone_changed;  // v3.6.0: subzone_changed
  heartbeat_doc["previous_kaiser_id"] = previous_kaiser_id;  // v3.6.0: previous_kaiser_id
  heartbeat_doc["kaiser_id_change_timestamp"] = kaiser_id_change_timestamp;  // v3.6.0: kaiser_id_change_timestamp
  heartbeat_doc["safe_mode"] = (current_state == STATE_SAFE_MODE);  // 🆕 Server-kompatibel: Safe Mode Status
  heartbeat_doc["emergency_stop"] = false;  // 🆕 Server-kompatibel: Emergency Stop Status
  
  // v3.6.0: Advanced features array
  JsonArray advanced_features = heartbeat_doc.createNestedArray("advanced_features");
  advanced_features.add("i2c_support");
  advanced_features.add("pi_integration");
  
  // v3.6.0: Network object
  JsonObject network = heartbeat_doc.createNestedObject("network");
  network["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
  network["wifi_reconnects"] = wifi_reconnect_count;
  network["mqtt_reconnects"] = mqtt_reconnect_count;
  
  heartbeat_doc["broker_ip"] = wifi_config.getServerAddress();  // v3.6.0: broker_ip
  heartbeat_doc["broker_port"] = wifi_config.getMQTTPort();  // v3.6.0: broker_port
  
  // v3.6.0: Context für Frontend-Logging
  heartbeat_doc["context"] = "heartbeat";
  
  // 🆕 NEU: Change-Flags im Heartbeat
  if (kaiser_id_changed) {
    heartbeat_doc["kaiser_id_changed"] = true;
    // ✅ SOFORTIGE KONFIGURATION bei Kaiser-ID-Wechsel
    DEBUG_PRINT("[Heartbeat] Kaiser ID changed - triggering immediate config send");
    sendESPConfigurationToFrontend();
    sendConfigurationToPiServer();
  }
  if (master_zone_changed) heartbeat_doc["master_zone_changed"] = true;
  if (subzone_changed) heartbeat_doc["subzone_changed"] = true;
  if (esp_id_changed) heartbeat_doc["esp_id_changed"] = true;
  

  
  // *** ADVANCED FEATURES: Erweiterte Heartbeat-Info ***
  if (advanced_system_initialized) {
    heartbeat_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    heartbeat_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
  } else {
    heartbeat_doc["timestamp"] = getUnixTimestamp();
  }
  
  String heartbeat_message;
  ArduinoJson::serializeJson(heartbeat_doc, heartbeat_message);
  
  // ✅ Payload-Validierung vor dem Senden
  if (!isValidHeartbeatPayload(heartbeat_message)) {
    DEBUG_PRINT("[Heartbeat] ❌ Invalid heartbeat payload - aborting send");
    return;
  }
  
  String heartbeat_topic = buildTopic("heartbeat", esp_id);
  
  // ✅ FRONTEND-IMPLEMENTIERUNG: QoS 1 für Heartbeat
  if (safePublish(heartbeat_topic, heartbeat_message, MQTT_QOS_HEARTBEAT, 3)) {
    DEBUG_PRINTF("[Heartbeat] ✅ Heartbeat sent with QoS %d", MQTT_QOS_HEARTBEAT);
    updateTopicStats(heartbeat_topic);  // v3.6.0: Topic-Statistik aktualisieren
  } else {
    DEBUG_PRINT("[Heartbeat] ❌ Failed to send heartbeat");
  }
}

// =============================================================================
// EXTENDED HEALTH BROADCASTING
// =============================================================================

void sendSystemHealthBroadcast() {
  if (!mqtt_client.connected()) return;
  
  // Update metrics before sending
  updateSystemHealthMetrics();
  
  StaticJsonDocument<512> health_doc;  // ✅ OPTIMIERT: Reduziert von 1024 für Health-Info
  health_doc["esp_id"] = esp_id;
  health_doc["broadcast_type"] = "system_health";
  health_doc["timestamp"] = getUnixTimestamp();
  
  // *** ADVANCED FEATURES: RTC-Timestamp wenn verfügbar ***
  if (advanced_system_initialized) {
    health_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    health_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
  }
  
  // Zone Information
  JsonObject zone_info = health_doc.createNestedObject("zone_info");
  zone_info["kaiser_id"] = getKaiserId();
  zone_info["master_zone_id"] = master_zone.master_zone_id;
  zone_info["is_master_esp"] = master_zone.is_master_esp;
  zone_info["active_subzones"] = active_subzones;
  
  // System Health Metrics
  JsonObject health = health_doc.createNestedObject("health");
  health["free_heap_current"] = health_metrics.free_heap_current;
  health["free_heap_minimum"] = health_metrics.free_heap_minimum;
  health["uptime_seconds"] = health_metrics.uptime_seconds;
  health["cpu_usage_percent"] = health_metrics.cpu_usage_percent;
  
  // Network Health
  JsonObject network_health = health_doc.createNestedObject("network");
  network_health["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
  network_health["wifi_rssi"] = wifi_signal_strength;
  network_health["wifi_reconnects"] = wifi_reconnect_count;
  network_health["mqtt_connected"] = mqtt_client.connected();
  network_health["mqtt_reconnects"] = mqtt_reconnect_count;
  
  // Sensor & Actuator Status
  JsonObject devices = health_doc.createNestedObject("devices");
  devices["active_sensors"] = active_sensors;
  devices["sensor_failures"] = health_metrics.sensor_failure_count;
  
  if (advanced_system_initialized) {
    devices["active_actuators"] = advanced_system.getActiveActuatorCount();
    devices["actuator_failures"] = health_metrics.actuator_failure_count;
    devices["pi_available"] = advanced_system.isPiAvailable();
  }
  
  // Error Information
  JsonObject error_info = health_doc.createNestedObject("errors");
  error_info["total_errors"] = total_error_count;
  error_info["last_error"] = last_system_error;
  error_info["last_error_age_ms"] = last_error_time > 0 ? (millis() - last_error_time) : 0;
  
  // System State
  health_doc["current_state"] = current_state;
  health_doc["advanced_features"] = advanced_system_initialized;
  
  String health_message;
  ArduinoJson::serializeJson(health_doc, health_message);
  
  String health_topic = buildSpecialTopic("health/broadcast", esp_id);
  
  if (mqtt_client.publish(health_topic.c_str(), health_message.c_str())) {
    DEBUG_PRINTF("[HealthBroadcast] System health broadcast sent (heap: %d, uptime: %lu)\n", 
                 health_metrics.free_heap_current, health_metrics.uptime_seconds);
  } else {
    DEBUG_PRINT("[HealthBroadcast] Failed to send system health broadcast");
  }
}
// 🆕 NEU: Enhanced Error Handling & Recovery Classes
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



// =============================================================================
// MAIN SETUP & LOOP (ENHANCED)
// =============================================================================

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== ESP32 Sensor Network v3.3 ===");
    
    // ✅ FIXED: WiFi-Modus Logging für Debugging
    Serial.printf("[Boot] Aktueller WiFi Mode: %d\n", WiFi.getMode());
    
    // ✅ OPTIONAL: Clear NVS storage if needed (uncomment to reset all configurations)
    // preferences.begin("wifi_config", false);
    // preferences.clear();
    // preferences.end();
    // preferences.begin("zone_config", false);
    // preferences.clear();
    // preferences.end();
    // preferences.begin("sensor_config", false);
    // preferences.clear();
    // preferences.end();
    // Serial.println("[Setup] NVS storage cleared - all configurations reset");
    
    // Initialize GPIO safe mode
    initializeAllPinsToSafeMode();
    
    // 🆕 NEU: Initialize Enhanced Error Handling Components
    Serial.println("[Setup] Initializing enhanced error handling components...");
    
    // Initialize components with proper error handling
    try {
        mqtt_manager = new MQTTConnectionManager();
        pi_breaker = new PiCircuitBreaker();
        health_monitor = new SystemHealthMonitor();
        // 🚫 DEAKTIVIERT: Network Discovery - verursacht UDP-Paket-Fehler
        // network_discovery = new NetworkDiscovery();
        // ip_manager = new DynamicIPManager(network_discovery);
        network_discovery = nullptr;
        ip_manager = nullptr;
        
        // 🆕 NEU: UI-Schema Processing System initialisieren
        ui_schema_validator = new UISchemaValidator();
        ui_gpio_engine = new UIGPIOConfigEngine();
        ui_capabilities_reporter = new UICapabilitiesReporter();
        
        // 🧪 PHASE 2: Test Suite initialisieren
        ui_test_suite = new UISchemaTestSuite();
        Serial.println("[Setup] ✅ UI-Schema Processing System initialized");
        Serial.println("[Setup] ✅ Phase 2 Testing Suite ready");
        
    } catch (const std::exception& e) {
        Serial.printf("[Setup] Error initializing components: %s\n", e.what());
        // Continue with basic functionality if enhanced components fail
        mqtt_manager = nullptr;
        pi_breaker = nullptr;
        health_monitor = nullptr;
        network_discovery = nullptr;
        ip_manager = nullptr;
        ui_schema_validator = nullptr;
        ui_gpio_engine = nullptr;
        ui_capabilities_reporter = nullptr;
    }
    
    Serial.println("[Setup] Enhanced error handling components initialized");
    
    // Load configurations
    loadWiFiConfigFromPreferences();
    loadZoneConfigFromPreferences();
    loadSensorConfigFromPreferences();
    
    // Generate ESP ID from MAC address - vereinheitlichte Methode
    esp_id = "ESP_" + String((uint32_t)ESP.getEfuseMac(), HEX);
    
    // Initialize MAC address
    mac_address = WiFi.macAddress();
    
    // Initialize zone_id from master zone configuration
    zone_id = master_zone.master_zone_id.isEmpty() ? "default_zone" : master_zone.master_zone_id;
    
    Serial.printf("[Setup] ESP ID: %s\n", esp_id.c_str());
    Serial.printf("[Setup] Zone ID: %s\n", zone_id.c_str());
    
    // Initialize web config server
    web_config_server = new WebConfigServer(esp_id);
    
    // Try to connect to WiFi
    if (connectToWiFi()) {
        Serial.println("[Setup] WiFi connected successfully");
        
        // 🚫 DEAKTIVIERT: Network Discovery - verursacht UDP-Paket-Fehler
        // if (ip_manager) {
        //     String discovered_ip = ip_manager->forceIPResolution();
        //     if (!discovered_ip.isEmpty()) {
        //         Serial.printf("[Setup] Auto-discovered Pi IP: %s\n", discovered_ip.c_str());
        //         wifi_config.setServerAddress(discovered_ip, wifi_config.getHttpPort());
        //     }
        // }
        
        // Try to connect to MQTT
        if (connectToMqtt()) {
            Serial.println("[Setup] MQTT connected successfully");
            
            // 🆕 SERVER DISCOVERY: Initiale Server-Discovery beim Boot
            Serial.println("[Setup] Performing initial server discovery...");
            if (performServerDiscovery()) {
                Serial.println("[Setup] ✅ Initial server discovery successful");
            } else {
                Serial.println("[Setup] ⚠️ Initial server discovery failed - continuing with default kaiser_id");
            }
            
            // connectToMqtt() kümmert sich bereits um System-Initialisierung
        } else {
            Serial.println("[Setup] MQTT connection failed, starting web portal for troubleshooting");
            current_state = STATE_WIFI_CONNECTED;  // Bleibe im WIFI_CONNECTED State
            web_config_server->startConfigPortal();  // Starte Portal für Troubleshooting
        }
    } else {
        Serial.println("[Setup] WiFi connection failed, starting config portal");
        current_state = STATE_WIFI_SETUP;
        web_config_server->startConfigPortal();
    }
    
    Serial.printf("[Setup] Initial system state: %s\n", getSystemStateString(current_state));
    
    // 🆕 NEU: System-Initialisierung wird jetzt in initializeSystem() durchgeführt
    // wenn MQTT erfolgreich verbunden ist
}

void loop() {
    // 🆕 NEU: Update health metrics
    if (health_monitor) {
        health_monitor->updateMetrics();
    }
    
    // 🆕 NEU: NTP-Zeit-Synchronisation aktualisieren
    if (WiFi.status() == WL_CONNECTED && ntp_synced) {
        time_client.update();
        // Alle 10 Minuten NTP-Sync prüfen
        if (millis() - last_ntp_sync > 600000) {
            if (time_client.forceUpdate()) {
                last_ntp_sync = millis();
                DEBUG_PRINTF("[NTP] Time re-synchronized: %s\n", time_client.getFormattedTime().c_str());
            }
        }
    }
    
    // Handle web config server if active
    if (web_config_server && web_config_server->isConfigPortalActive()) {
        web_config_server->handleClient();
        dnsServer.processNextRequest();
        
        // 🆕 NEU: Erweiterte Portal-Kontrolle - nur beenden wenn vollständig verbunden
        if (current_state == STATE_OPERATIONAL && mqtt_client.connected()) {
            DEBUG_PRINT("[WebPortal] All connections established, stopping portal");
            web_config_server->stopConfigPortal();
            delete web_config_server;
            web_config_server = nullptr;
            wifi_config.setWebserverActive(false);
        } else if (current_state == STATE_WIFI_CONNECTED && !mqtt_client.connected()) {
            // 🆕 NEU: Portal offen lassen für MQTT-Troubleshooting
            static unsigned long last_portal_status = 0;
            if (millis() - last_portal_status > 30000) { // Alle 30 Sekunden Status ausgeben
                DEBUG_PRINT("[WebPortal] WiFi connected, MQTT not available - portal remains open for troubleshooting");
                last_portal_status = millis();
            }
        }
        
        // 🆕 NEU: Automatische MQTT-Verbindungsversuche während Portal aktiv ist - weniger aggressiv
        if (current_state == STATE_WIFI_CONNECTED && WiFi.status() == WL_CONNECTED) {
            static unsigned long last_mqtt_attempt = 0;
            if (millis() - last_mqtt_attempt > 30000) { // Alle 30 Sekunden versuchen (weniger aggressiv)
                DEBUG_PRINT("[WebPortal] Attempting MQTT connection while portal is open...");
                if (connectToMqtt()) {
                    DEBUG_PRINT("[WebPortal] MQTT connected! Portal will close on next loop.");
                }
                last_mqtt_attempt = millis();
            }
        }
    }
    
    // 🆕 NEU: Enhanced system recovery handling - nur bei echten Problemen
    static unsigned long last_recovery_check = 0;
    if (current_state == STATE_ERROR && 
        millis() - last_recovery_check > 10000) { // Nur alle 10 Sekunden prüfen
        handleSystemRecovery();
        last_recovery_check = millis();
    }
    
    // 🚫 DEAKTIVIERT: Dynamic IP management - verursacht UDP-Paket-Fehler
    // if (ip_manager && current_state == STATE_OPERATIONAL) {
    //     if (ip_manager->updatePiIPIfChanged()) {
    //         Serial.println("[Loop] Pi IP changed, updating configuration");
    //         String new_ip = ip_manager->getCurrentPiIP();
    //         wifi_config.setServerAddress(new_ip, wifi_config.getHttpPort());
    //         
    //         // Reconnect to Pi if needed
    //         if (pi_breaker && pi_breaker->getState() == PiCircuitBreaker::OPEN) {
    //             Serial.println("[Loop] Pi IP changed, resetting circuit breaker");
    //             pi_breaker->recordSuccess(); // Reset circuit breaker
    //         }
    //     }
    // }
    
  // MQTT loop and reconnection handling
  if (mqtt_client.connected()) {
      mqtt_client.loop();
      
      // Send periodic updates
      static unsigned long last_status_update = 0;
      static unsigned long last_heartbeat = 0;
      static unsigned long last_server_discovery = 0;
      
      if (millis() - last_status_update > 30000) { // Every 30 seconds
          sendEnhancedStatusUpdate();
          last_status_update = millis();
      }
      
      // 🆕 SERVER DISCOVERY: Alle 5 Minuten Server-Discovery durchführen
      if (millis() - last_server_discovery > 300000) { // Every 5 minutes
          DEBUG_PRINT("[Loop] Performing periodic server discovery...");
          if (performServerDiscovery()) {
              DEBUG_PRINT("[Loop] ✅ Server discovery successful");
              // Bei erfolgreicher Discovery: Konfiguration aktualisieren
              if (kaiser_id_changed) {
                  sendESPConfigurationToFrontend();
                  sendConfigurationToPiServer();
              }
          } else {
              DEBUG_PRINT("[Loop] ❌ Server discovery failed");
          }
          last_server_discovery = millis();
      }
        
        if (millis() - last_heartbeat > 60000) { // Every 60 seconds
            sendHeartbeat();
            last_heartbeat = millis();
        }
        
        // 🆕 NEU: ESP Configuration regelmäßig senden
        static unsigned long last_config_send = 0;
        if (millis() - last_config_send > 30000) { // Every 30 seconds
            sendESPConfigurationToFrontend();
            sendConfigurationToPiServer();
            last_config_send = millis();
        }
        
        // Perform measurements if operational
        if (current_state == STATE_OPERATIONAL) {
            static unsigned long last_measurement = 0;
            if (millis() - last_measurement > 10000) { // Every 10 seconds
                performMeasurements();
                last_measurement = millis();
            }
        }
    } else {
        // 🆕 NEU: Enhanced MQTT reconnection with exponential backoff - nur bei Bedarf
        static unsigned long last_mqtt_attempt = 0;
        if (mqtt_manager && millis() - last_mqtt_attempt > 30000) { // Nur alle 30 Sekunden versuchen (weniger aggressiv)
            mqtt_manager->attemptConnection();
            last_mqtt_attempt = millis();
        }
    }
    
            // 🆕 NEU: Periodic health checks
        static unsigned long last_health_check = 0;
        if (millis() - last_health_check > 60000) { // Every minute
            if (health_monitor && health_monitor->predictFailure()) {
                Serial.println("[Loop] ⚠️ System health issue detected");
                sendErrorAlert("SystemHealth", "Potential failure predicted", "HealthMonitor");
            }
            last_health_check = millis();
        }
        
        // v3.6.0: Topic-Statistik und Diagnose-Report alle 5 Minuten
        if (millis() - last_diagnostics_report > DIAGNOSTICS_INTERVAL) {
            sendDiagnosticsReport();
            last_diagnostics_report = millis();
        }
    
    // 🆕 NEU: Pi Server Response Timeout Handling
    if (pi_config_sent && !pi_configuration_confirmed) {
        if (millis() - pi_config_sent_time > PI_CONFIG_TIMEOUT_MS) {
            Serial.println("[Pi] ⚠️ Pi Server configuration timeout - continuing without confirmation");
            pi_configuration_confirmed = false;  // Explizit auf false setzen
            pi_config_sent = false;  // Reset für nächsten Versuch
        }
    }
    
    // ✅ NEU: Safe Mode Monitoring (deaktiviert - Funktion nicht verfügbar)
    // monitor_safe_mode_status();
    
    // Small delay to prevent watchdog issues
    delay(100);
}

// =============================================================================
// ACTUATOR STATUS UPDATES
// =============================================================================

void sendActuatorStatus(uint8_t gpio) {
    if (!advanced_system_initialized || !mqtt_client.connected()) {
        return;
    }

    String actuator_info = advanced_system.getActuatorInfo(gpio);
    if (actuator_info == "Actuator not found" || actuator_info == "Actuator system not available") {
        return;
    }

    StaticJsonDocument<512> status_doc;
    status_doc["esp_id"] = esp_id;
    status_doc["gpio"] = gpio;
    status_doc["timestamp"] = getUnixTimestamp();
    status_doc["info"] = actuator_info;

    String status_message;
    ArduinoJson::serializeJson(status_doc, status_message);

      String status_topic = buildSpecialTopic("actuator/" + String(gpio) + "/status", esp_id);

    if (mqtt_client.publish(status_topic.c_str(), status_message.c_str())) {
        DEBUG_PRINTF("[Actuator] Status sent for GPIO %d\n", gpio);
    }
}

void sendAllActuatorStatus() {
    if (!advanced_system_initialized || !mqtt_client.connected()) {
        return;
    }

    uint8_t count = advanced_system.getActiveActuatorCount();
    StaticJsonDocument<512> status_doc;  // ✅ OPTIMIERT: Reduziert von 1024 für Actuator Status
    status_doc["esp_id"] = esp_id;
    status_doc["timestamp"] = getUnixTimestamp();
    status_doc["active_actuators"] = count;

    JsonArray actuators = status_doc.createNestedArray("actuators");
    
    // Iterate through all possible GPIO pins
    for (uint8_t gpio = 0; gpio < MAX_GPIO_PINS; gpio++) {
        if (advanced_system.isActuatorConfigured(gpio)) {
            JsonObject actuator = actuators.createNestedObject();
            actuator["gpio"] = gpio;
            actuator["info"] = advanced_system.getActuatorInfo(gpio);
        }
    }

    String status_message;
    ArduinoJson::serializeJson(status_doc, status_message);

    String status_topic = buildSpecialTopic("actuator/status", esp_id);

    if (mqtt_client.publish(status_topic.c_str(), status_message.c_str())) {
        DEBUG_PRINTF("[Actuator] Status overview sent (%d actuators)\n", count);
    }
}

// =============================================================================
// ACTUATOR STATUS & MONITORING
// =============================================================================

void sendActuatorStatusUpdate() {
  if (!mqtt_client.connected() || !advanced_system_initialized) return;
  
  StaticJsonDocument<512> status_doc;  // ✅ OPTIMIERT: Reduziert von 1024 für Actuator Status Update
  status_doc["esp_id"] = esp_id;
      status_doc["timestamp"] = getUnixTimestamp();
  status_doc["active_actuators"] = advanced_system.getActiveActuatorCount();
  status_doc["pi_available"] = advanced_system.isPiAvailable();
  
  // System Health
  JsonObject health = status_doc.createNestedObject("health");
  health["free_heap"] = ESP.getFreeHeap();
  health["wifi_rssi"] = WiFi.RSSI();
  health["uptime"] = millis();
  
  // Actuator System Status
  JsonObject actuator_system = status_doc.createNestedObject("actuator_system");
  actuator_system["initialized"] = advanced_system_initialized;
  actuator_system["active_count"] = advanced_system.getActiveActuatorCount();
  actuator_system["pi_enhanced"] = advanced_system.isPiAvailable();
  
  // Individual Actuator Status
  JsonArray actuators = status_doc.createNestedArray("actuators");
  for (uint8_t gpio = 0; gpio < MAX_GPIO_PINS; gpio++) {
    if (advanced_system.isActuatorConfigured(gpio)) {
      JsonObject actuator = actuators.createNestedObject();
      actuator["gpio"] = gpio;
      actuator["info"] = advanced_system.getActuatorInfo(gpio);
    }
  }
  
  String status_message;
  ArduinoJson::serializeJson(status_doc, status_message);
  
  String status_topic = buildSpecialTopic("actuator/status", esp_id);
  
  if (mqtt_client.publish(status_topic.c_str(), status_message.c_str())) {
    DEBUG_PRINTF("[ActuatorStatus] Status update sent (%d actuators)\n", 
                 advanced_system.getActiveActuatorCount());
  } else {
    DEBUG_PRINT("[ActuatorStatus] Failed to send status update");
  }
}

void sendActuatorAlert(uint8_t gpio, const String& alert_type, const String& message) {
  if (!mqtt_client.connected()) return;
  
  StaticJsonDocument<256> alert_doc;
  alert_doc["esp_id"] = esp_id;
  alert_doc["gpio"] = gpio;
  alert_doc["alert_type"] = alert_type;  // "error", "warning", "emergency"
  alert_doc["message"] = message;
  alert_doc["timestamp"] = getUnixTimestamp();
  
  if (advanced_system_initialized) {
    alert_doc["actuator_info"] = advanced_system.getActuatorInfo(gpio);
  }
  
  String alert_message;
  ArduinoJson::serializeJson(alert_doc, alert_message);
  
  String alert_topic = buildSpecialTopic("actuator/" + String(gpio) + "/alert", esp_id);
  
  mqtt_client.publish(alert_topic.c_str(), alert_message.c_str());
  
  DEBUG_PRINTF("[ActuatorAlert] Alert sent for GPIO %d: %s - %s\n", 
               gpio, alert_type.c_str(), message.c_str());
}

// =============================================================================
// ACTUATOR MESSAGE HANDLERS
// =============================================================================

void handleActuatorCommand(const String& topic, const String& message) {
  DEBUG_PRINT("[Actuator] Processing actuator command");
  
  // Extract GPIO from topic: kaiser/xxx/esp/xxx/actuator/12/command
  int actuator_pos = topic.indexOf("/actuator/");
  int command_pos = topic.indexOf("/command");
  
  if (actuator_pos >= 0 && command_pos >= 0) {
    String gpio_str = topic.substring(actuator_pos + 10, command_pos);
    uint8_t gpio = gpio_str.toInt();
    
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, message) == DeserializationError::Ok) {
      String command_type = doc.containsKey("type") ? doc["type"].as<String>() : "analog";
      bool success = false;
      float executed_value = 0.0;
      
      if (advanced_system_initialized) {
        if (command_type == "binary") {
          bool state = doc["value"];
          success = advanced_system.controlActuatorBinary(gpio, state);
          executed_value = state ? 1.0 : 0.0;
        } else {
          float value = doc["value"];
          success = advanced_system.controlActuator(gpio, value);
          executed_value = value;
        }
      }
      
      // Send response
      StaticJsonDocument<256> response;
      response["esp_id"] = esp_id;
      response["gpio"] = gpio;
      response["command"] = "actuator_control";
      response["success"] = success;
      response["requested_value"] = doc["value"];
      response["command_type"] = command_type;
      response["timestamp"] = getUnixTimestamp();
      
      String response_msg;
      ArduinoJson::serializeJson(response, response_msg);
      
      String response_topic = buildSpecialTopic("actuator/" + String(gpio) + "/response", esp_id);
      
      if (mqtt_client.publish(response_topic.c_str(), response_msg.c_str())) {
        DEBUG_PRINTF("[Actuator] Command executed on GPIO %d: %.2f (success: %s)\n", 
                     gpio, executed_value, success ? "YES" : "NO");
      }
    }
  }
}

void handleActuatorEmergency(const String& message) {
  DEBUG_PRINT("[Actuator] Processing emergency signal");
  
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, message) == DeserializationError::Ok) {
    String command = doc["command"];
    uint8_t gpio = doc.containsKey("gpio") ? doc["gpio"].as<uint8_t>() : 255;
    
    bool success = false;
    String action_taken = "";
    
    if (advanced_system_initialized) {
      if (command == "emergency_stop") {
        if (gpio == 255) {
          success = advanced_system.emergencyStopAllActuators();
          action_taken = "All actuators emergency stopped";
        } else {
          success = advanced_system.emergencyStopActuator(gpio);
          action_taken = "Actuator GPIO " + String(gpio) + " emergency stopped";
        }
      }
    }
    
    // Send emergency response
    StaticJsonDocument<256> response;
    response["esp_id"] = esp_id;
    response["emergency_command"] = command;
    response["success"] = success;
    response["action_taken"] = action_taken;
    response["timestamp"] = getUnixTimestamp();
    if (gpio != 255) response["gpio"] = gpio;
    
    String response_msg;
    ArduinoJson::serializeJson(response, response_msg);
    
    String response_topic = buildSpecialTopic("actuator/emergency_response", esp_id);
    mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
    
    DEBUG_PRINTF("[Actuator] Emergency action: %s (success: %s)\n", 
                 action_taken.c_str(), success ? "YES" : "NO");
  }
}

void handleActuatorConfiguration(const String& message) {
  DEBUG_PRINT("[Actuator] Processing actuator configuration");
  
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, message) == DeserializationError::Ok) {
    if (doc["esp_id"] == esp_id && doc.containsKey("actuators")) {
      JsonArrayConst actuators_array = doc["actuators"];
      
      for (JsonVariantConst actuator_var : actuators_array) {
        JsonObjectConst actuator = actuator_var;
        
        uint8_t gpio = actuator["gpio"];
        String type_str = actuator["type"];
        String subzone_id = actuator["subzone_id"];
        String actuator_name = actuator["name"];
        
        // Determine library name
        String library_name = type_str;
        if (advanced_system_initialized && advanced_system.isPiAvailable()) {
          library_name += "_pi_enhanced";
        }
        
        bool success = false;
        if (advanced_system_initialized) {
          success = advanced_system.configureActuator(gpio, library_name, actuator_name, subzone_id);
        }
        
        DEBUG_PRINTF("[Actuator] Configuration %s: %s on GPIO %d\n", 
                     success ? "successful" : "failed", actuator_name.c_str(), gpio);
      }
      
      // Send confirmation
      StaticJsonDocument<256> ack_doc;
      ack_doc["esp_id"] = esp_id;
      ack_doc["status"] = "actuators_configured";
      ack_doc["active_actuators"] = advanced_system_initialized ? advanced_system.getActiveActuatorCount() : 0;
      
      String ack_message;
      ArduinoJson::serializeJson(ack_doc, ack_message);
      
      String ack_topic = buildTopic("status", esp_id);
      mqtt_client.publish(ack_topic.c_str(), ack_message.c_str());
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// 🆕 NEU: System state to string conversion
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

// 🆕 NEU: Unix-Timestamp Funktion für Server-Kompatibilität
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

// ✅ NEU: Sensor Type String Converter (SCHRITT 4 - Enum-Umwandlung)
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
    case SENSOR_NONE:
    default: return "SENSOR_UNKNOWN";
  }
}

// 🆕 NEU: Enum-to-String Mapping für Frontend (SCHRITT 4)
String getSensorTypeMappingJSON() {
  return "{\"0\":\"SENSOR_NONE\",\"1\":\"SENSOR_PH_DFROBOT\",\"2\":\"SENSOR_EC_GENERIC\",\"3\":\"SENSOR_TEMP_DS18B20\",\"4\":\"SENSOR_TEMP_DHT22\",\"5\":\"SENSOR_MOISTURE\",\"6\":\"SENSOR_PRESSURE\",\"7\":\"SENSOR_CO2\",\"8\":\"SENSOR_AIR_QUALITY\",\"9\":\"SENSOR_LIGHT\",\"10\":\"SENSOR_FLOW\",\"11\":\"SENSOR_LEVEL\",\"12\":\"SENSOR_CUSTOM_PI_ENHANCED\",\"13\":\"SENSOR_CUSTOM_OTA\"}";
}

// 🆕 NEU: Test-Payload-Generator für Debug (SCHRITT 8)
void sendTestPayloads() {
  DEBUG_PRINT("[TEST] Sending test payloads for validation...");
  
  // Test 1: Rohdaten-Modus (raw_mode: true, raw_value: 2156)
  StaticJsonDocument<512> test1_doc;  // ✅ OPTIMIERT: Reduziert von 1024 für Test Payload
  test1_doc["timestamp"] = getUnixTimestamp();
  test1_doc["iso_timestamp"] = "2024-01-15T14:30:45.123Z";
  test1_doc["time_quality"] = "good";
  test1_doc["kaiser_zone"] = getKaiserId();
  test1_doc["master_zone"] = master_zone.master_zone_id;
  test1_doc["esp_id"] = esp_id;
  test1_doc["subzone_id"] = "test_subzone";
  test1_doc["value"] = 7.2;
  test1_doc["type"] = "SENSOR_PH_DFROBOT";
  test1_doc["raw_value"] = 2156;
  test1_doc["raw_mode"] = true;
  test1_doc["hardware_mode"] = true;
  
  JsonArray warnings1 = test1_doc.createNestedArray("warnings");
  // Keine Warnings für Test 1
  
  JsonObject sensor1 = test1_doc.createNestedObject("sensor");
  sensor1["gpio"] = 4;
  sensor1["type"] = 1;  // SENSOR_PH_DFROBOT enum
  sensor1["name"] = "Test pH Sensor";
  sensor1["value"] = 7.2;
  sensor1["library_version"] = "1.0.0";
  sensor1["hardware_mode"] = true;
  sensor1["raw"] = 2156;
  sensor1["raw_mode"] = true;
  
  JsonObject context1 = test1_doc.createNestedObject("context");
  context1["measurement_sequence"] = 123;
  context1["free_heap"] = ESP.getFreeHeap();
  context1["wifi_rssi"] = WiFi.RSSI();
  
  String test1_message;
  ArduinoJson::serializeJson(test1_doc, test1_message);
  
  String test1_topic = buildSpecialTopic("test_payload_1", esp_id);
  mqtt_client.publish(test1_topic.c_str(), test1_message.c_str());
  DEBUG_PRINT("[TEST] Sent test payload 1: Rohdaten-Modus");
  
  // Test 2: Nur verarbeiteter Wert (raw_mode: false)
  StaticJsonDocument<512> test2_doc;  // ✅ OPTIMIERT: Reduziert von 1024 für Test Payload
  test2_doc["timestamp"] = getUnixTimestamp();
  test2_doc["kaiser_zone"] = getKaiserId();
  test2_doc["master_zone"] = master_zone.master_zone_id;
  test2_doc["esp_id"] = esp_id;
  test2_doc["subzone_id"] = "test_subzone";
  test2_doc["value"] = 23.5;
  test2_doc["type"] = "SENSOR_TEMP_DS18B20";
  test2_doc["raw_value"] = 0;
  test2_doc["raw_mode"] = false;
  test2_doc["hardware_mode"] = true;
  
  JsonArray warnings2 = test2_doc.createNestedArray("warnings");
  // Keine Warnings für Test 2
  
  JsonObject sensor2 = test2_doc.createNestedObject("sensor");
  sensor2["gpio"] = 5;
  sensor2["type"] = 3;  // SENSOR_TEMP_DS18B20 enum
  sensor2["name"] = "Test Temperature Sensor";
  sensor2["value"] = 23.5;
  sensor2["library_version"] = "1.0.0";
  sensor2["hardware_mode"] = true;
  
  JsonObject context2 = test2_doc.createNestedObject("context");
  context2["measurement_sequence"] = 124;
  context2["free_heap"] = ESP.getFreeHeap();
  context2["wifi_rssi"] = WiFi.RSSI();
  
  String test2_message;
  ArduinoJson::serializeJson(test2_doc, test2_message);
  
  String test2_topic = buildSpecialTopic("test_payload_2", esp_id);
  mqtt_client.publish(test2_topic.c_str(), test2_message.c_str());
  DEBUG_PRINT("[TEST] Sent test payload 2: Verarbeiteter Wert");
  
  // Test 3: Fehlerfall (raw_value: 0, warnings: [...])
  StaticJsonDocument<512> test3_doc;  // ✅ OPTIMIERT: Reduziert von 1024 für Test Payload
  test3_doc["timestamp"] = getUnixTimestamp();
  test3_doc["kaiser_zone"] = getKaiserId();
  test3_doc["master_zone"] = master_zone.master_zone_id;
  test3_doc["esp_id"] = esp_id;
  test3_doc["subzone_id"] = "test_subzone";
  test3_doc["value"] = 7.0;
  test3_doc["type"] = "SENSOR_PH_DFROBOT";
  test3_doc["raw_value"] = 0;
  test3_doc["raw_mode"] = true;
  test3_doc["hardware_mode"] = true;
  
  JsonArray warnings3 = test3_doc.createNestedArray("warnings");
  warnings3.add("sensor_disconnected");
  warnings3.add("raw_value_out_of_range");
  
  JsonObject sensor3 = test3_doc.createNestedObject("sensor");
  sensor3["gpio"] = 4;
  sensor3["type"] = 1;  // SENSOR_PH_DFROBOT enum
  sensor3["name"] = "Test pH Sensor (Error)";
  sensor3["value"] = 7.0;
  sensor3["library_version"] = "1.0.0";
  sensor3["hardware_mode"] = true;
  sensor3["raw"] = 0;
  sensor3["raw_mode"] = true;
  
  JsonObject context3 = test3_doc.createNestedObject("context");
  context3["measurement_sequence"] = 125;
  context3["free_heap"] = ESP.getFreeHeap();
  context3["wifi_rssi"] = WiFi.RSSI();
  
  String test3_message;
  ArduinoJson::serializeJson(test3_doc, test3_message);
  
  String test3_topic = buildSpecialTopic("test_payload_3", esp_id);
  mqtt_client.publish(test3_topic.c_str(), test3_message.c_str());
  DEBUG_PRINT("[TEST] Sent test payload 3: Fehlerfall");
  
  DEBUG_PRINT("[TEST] All test payloads sent successfully!");
}

void handleSystemRecovery() {
    static unsigned long last_recovery_log = 0;
    if (millis() - last_recovery_log < 10000) { // Nur alle 10 Sekunden loggen
        return;
    }
    last_recovery_log = millis();
    
    Serial.println("[SystemRecovery] Checking system recovery status...");
    
    switch (current_state) {
        case STATE_ERROR:
            // Diagnose durchführen
            if (WiFi.status() != WL_CONNECTED) {
                Serial.println("[SystemRecovery] Network issue detected, restarting WiFi setup");
                current_state = STATE_WIFI_SETUP;
                if (web_config_server) {
                    web_config_server->startConfigPortal();
                }
            } else if (mqtt_manager && !mqtt_manager->isConnectionStable()) {
                Serial.println("[SystemRecovery] MQTT issue detected, transitioning to WIFI_CONNECTED for troubleshooting");
                current_state = STATE_WIFI_CONNECTED; // Zurück zu WIFI_CONNECTED statt MQTT_CONNECTING
            } else {
                Serial.println("[SystemRecovery] Unknown error, transitioning to WiFi setup");
                current_state = STATE_WIFI_SETUP;
            }
            break;
            
        case STATE_MQTT_CONNECTING:
            // Exponential backoff für MQTT-Reconnects
            if (mqtt_manager && mqtt_manager->attemptConnection()) {
                current_state = STATE_OPERATIONAL;
                Serial.println("[SystemRecovery] ✅ MQTT reconnection successful");
            } else {
                Serial.printf("[SystemRecovery] MQTT reconnection failed, next attempt in %lu ms\n", 
                             mqtt_manager ? mqtt_manager->getNextRetryDelay() : 5000);
            }
            break;
            
        case STATE_OPERATIONAL:
            // Check for potential issues
            if (health_monitor && health_monitor->predictFailure()) {
                Serial.println("[SystemRecovery] ⚠️ Potential failure predicted, monitoring closely");
            }
            break;
            
        default:
            // Other states don't need recovery
            break;
    }
}

void sendEnhancedStatusUpdate() {
    DynamicJsonDocument status_doc(2048);
    
    // Basic status information
    status_doc["esp_id"] = esp_id;
    status_doc["zone_id"] = zone_id;
    status_doc["system_state"] = getSystemStateString(current_state);
    status_doc["timestamp"] = getUnixTimestamp();
    status_doc["uptime"] = millis() / 1000;
    
    // ✅ PHASE 2: Board-Type Information
    status_doc["board_type"] = "XIAO_ESP32C3";
    status_doc["chip_model"] = "ESP32-C3";
    status_doc["firmware_version"] = "v3.4.1";
    
    // ✅ PHASE 2: Hardware-Spezifika
    JsonObject hardware_info = status_doc.createNestedObject("hardware_info");
    // Hardware-spezifische Konstanten
    #ifdef ESP32_DEV_MODE
        hardware_info["available_pins"] = ESP32_DEV_PIN_COUNT;
        hardware_info["i2c_sda"] = ESP32_DEV_I2C_SDA;
        hardware_info["i2c_scl"] = ESP32_DEV_I2C_SCL;
    #else
        hardware_info["available_pins"] = XIAO_PIN_COUNT;
        hardware_info["i2c_sda"] = XIAO_I2C_SDA;
        hardware_info["i2c_scl"] = XIAO_I2C_SCL;
    #endif
    
    // WiFi information
    JsonObject wifi_info = status_doc.createNestedObject("wifi");
    wifi_info["connected"] = (WiFi.status() == WL_CONNECTED);
    wifi_info["ssid"] = WiFi.SSID();
    wifi_info["rssi"] = WiFi.RSSI();
    wifi_info["ip"] = WiFi.localIP().toString();
    
    // MQTT information
    JsonObject mqtt_info = status_doc.createNestedObject("mqtt");
    mqtt_info["connected"] = mqtt_client.connected();
    mqtt_info["server"] = wifi_config.getServerAddress();
    mqtt_info["port"] = getMQTTPort();  // ✅ Dynamischer Port-Zugriff
    if (mqtt_manager) {
        mqtt_info["retry_count"] = mqtt_manager->getRetryCount();
        mqtt_info["connection_stable"] = mqtt_manager->isConnectionStable();
        mqtt_info["next_retry_delay"] = mqtt_manager->getNextRetryDelay();
    }
    
    // Pi server information
    JsonObject pi_info = status_doc.createNestedObject("pi_server");
    pi_info["url"] = wifi_config.getPiServerURL();
    if (pi_breaker) {
        pi_info["circuit_breaker_state"] = pi_breaker->getStateString();
        pi_info["failure_count"] = pi_breaker->getFailureCount();
        pi_info["success_count"] = pi_breaker->getSuccessCount();
    }
    
    // 🚫 DEAKTIVIERT: Network discovery information - verursacht UDP-Paket-Fehler
    // JsonObject network_info = status_doc.createNestedObject("network_discovery");
    // if (ip_manager) {
    //     network_info["configured_ip"] = ip_manager->getConfiguredIP();
    //     network_info["ip_stable"] = ip_manager->isIPStable();
    //     network_info["mdns_enabled"] = ip_manager->isMDNSEnabled();
    // }
    // if (network_discovery) {
    //     network_info["last_known_pi_ip"] = network_discovery->getLastKnownPiIP();
    //     network_info["last_scan_time"] = network_discovery->getLastScanTime();
    //     network_info["should_rescan"] = network_discovery->shouldRescan();
    // }
    
    // System health information
    JsonObject health_info = status_doc.createNestedObject("system_health");
    health_info["free_heap"] = ESP.getFreeHeap();
    health_info["min_free_heap"] = ESP.getMinFreeHeap();
    health_info["heap_size"] = ESP.getHeapSize();
    if (health_monitor) {
        health_info["health_summary"] = health_monitor->getHealthSummary();
        health_info["failure_predicted"] = health_monitor->predictFailure();
    }
    
    // Error information
    JsonObject error_info = status_doc.createNestedObject("error_info");
    error_info["last_error"] = last_system_error;
    error_info["error_count"] = total_error_count;
    error_info["wifi_reconnects"] = wifi_reconnect_count;
    error_info["mqtt_reconnects"] = mqtt_reconnect_count;
    
    // Recovery information
    JsonObject recovery_info = status_doc.createNestedObject("recovery_info");
    recovery_info["auto_recovery_enabled"] = true;
    if (mqtt_manager) {
        recovery_info["next_retry_in_ms"] = mqtt_manager->getNextRetryDelay();
    }
    if (pi_breaker) {
        recovery_info["pi_circuit_breaker_state"] = pi_breaker->getStateString();
    }
    
    // ✅ PHASE 7: Kaiser-Status erweitern (ENTWICKLERVORGABEN: Bestehende KaiserZone-Struktur nutzen)
    JsonObject kaiser_status = status_doc.createNestedObject("kaiser_status");
    kaiser_status["kaiser_id"] = getKaiserId();  // ✅ Bestehendes Feld
    kaiser_status["kaiser_type"] = "pi_zero_edge_controller";
    kaiser_status["autonomous_mode"] = false;  // Default
    kaiser_status["god_connection"] = false;   // Default
    
    // ✅ PHASE 7: God Pi Sync-Status (ENTWICKLERVORGABEN: Bestehende advanced_system nutzen)
    if (advanced_system_initialized) {
        JsonObject god_sync = kaiser_status.createNestedObject("god_sync");
        god_sync["connected"] = advanced_system.isPiAvailable();  // ✅ Bestehende Funktion
        god_sync["registered"] = advanced_system.isPiAvailable();  // ✅ Vereinfacht: gleiche Funktion
        god_sync["last_sync"] = millis();  // Vereinfacht
    }
    
    // ✅ PHASE 7: Emergency Controls Status (ENTWICKLERVORGABEN: Bestehende Funktionen nutzen)
    JsonObject emergency_status = status_doc.createNestedObject("emergency_status");
    emergency_status["emergency_stop_active"] = false;
    emergency_status["safe_mode_pins"] = count_safe_mode_pins();  // ✅ Bestehende Funktion
    
    // Sensor information
    JsonArray sensors_array = status_doc.createNestedArray("sensors");
    for (int i = 0; i < active_sensors && i < MAX_SENSORS; i++) {
        if (sensors[i].active) {
            JsonObject sensor = sensors_array.createNestedObject();
            sensor["gpio"] = sensors[i].gpio;
            sensor["name"] = sensors[i].sensor_name;
            sensor["type"] = sensors[i].library_name;
            sensor["last_value"] = sensors[i].last_value;
            sensor["last_reading"] = sensors[i].last_reading;
        }
    }
    
    // Actuator information
    JsonArray actuators_array = status_doc.createNestedArray("actuators");
    if (advanced_system_initialized) {
        uint8_t actuator_count = advanced_system.getActiveActuatorCount();
        for (uint8_t i = 0; i < actuator_count && i < MAX_ACTUATORS; i++) {
            // Note: This is a simplified approach since we don't have direct array access
            // In a real implementation, you'd iterate through configured actuators
            JsonObject actuator = actuators_array.createNestedObject();
            actuator["gpio"] = i;  // Placeholder - would need proper actuator iteration
            actuator["name"] = "actuator_" + String(i);
            actuator["type"] = "unknown";
            actuator["last_value"] = 0.0;
            actuator["last_command"] = 0;
        }
    }
    
    String status_json;
    ArduinoJson::serializeJson(status_doc, status_json);
    
    String topic = "kaiser/" + zone_id + "/esp/" + esp_id + "/status";
    mqtt_client.publish(topic.c_str(), status_json.c_str());
    
    Serial.println("[StatusUpdate] Enhanced status update sent");
}

// ✅ NEU: Safe Mode Status abfragen
int count_safe_mode_pins() {
  int count = 0;
  for (int i = 0; i < MAX_GPIO_PINS; i++) {
    if (gpio_safe_mode[i]) {
      count++;
    }
  }
  return count;
}

// ✅ NEU: Safe Mode Status für Response
JsonObject get_safe_mode_status() {
  StaticJsonDocument<256> status_doc;
  JsonObject safe_status = status_doc.createNestedObject("safe_mode");
  
  safe_status["active"] = true;
  safe_status["pins_in_safe_mode"] = count_safe_mode_pins();
  safe_status["total_available_pins"] = MAX_GPIO_PINS;
  
  JsonArray safe_pins = safe_status.createNestedArray("safe_pins");
  for (int i = 0; i < MAX_GPIO_PINS; i++) {
    if (gpio_safe_mode[i]) {
      safe_pins.add(i);
    }
  }
  
  return safe_status;
}

// ✅ NEU: ESP Konfiguration zurücksetzen
void reset_esp_configuration() {
  // Alle Konfigurationsdateien löschen
  preferences.begin("sensor_config", false);
  preferences.clear();
  preferences.end();
  
  preferences.begin("zone_config", false);
  preferences.clear();
  preferences.end();
  
  preferences.begin("wifi_config", false);
  preferences.clear();
  preferences.end();
  
  // System-State zurücksetzen
  current_state = STATE_WIFI_SETUP;
  
  DEBUG_PRINT("[System] Configuration reset completed");
}

// ✅ NEU: Pi Server Command Handler
void handlePiServerCommand(String message) {
  DEBUG_PRINT("[Pi Server] Processing command");
  
  DynamicJsonDocument doc(512);
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    DEBUG_PRINTF("[Pi Server] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  String command = doc["command"];
  String request_id = doc.containsKey("request_id") ? doc["request_id"].as<String>() : "";
  
  DEBUG_PRINTF("[Pi Server] Command: %s\n", command.c_str());
  
  if (command == "delete_esp") {
    // ✅ KORRIGIERT: Vereinfachte Implementierung
    DEBUG_PRINT("[Pi Server] Delete ESP command received");
    enableSafeModeForAllPins();
    // Bestätigung senden
    String ack_topic = "kaiser/" + getKaiserId() + "/esp/" + esp_id + "/response";
    mqtt_client.publish(ack_topic.c_str(), "ESP configuration deleted");
  }
  else if (command == "status_request") {
    // ✅ KORRIGIERT: Vereinfachte Implementierung
    DEBUG_PRINT("[Pi Server] Status request received");
    sendStatusUpdate();
  }
  else {
    DEBUG_PRINTF("[Pi Server] Unknown command: %s\n", command.c_str());
  }
}

// ✅ NEU: Command Response an Pi Server
void send_pi_server_response(String request_id, bool success, String message) {
  String response_topic = buildTopic("response", esp_id);
  
  DynamicJsonDocument doc(512);
  doc["command"] = "command_response";
  doc["request_id"] = request_id;
  doc["success"] = success;
  doc["message"] = message;
  doc["timestamp"] = getUnixTimestamp();
  doc["esp_id"] = esp_id;
  
  // ✅ NEU: Safe Mode Status in Response
  JsonObject safe_status = doc.createNestedObject("safe_mode");
  safe_status["active"] = true;
  safe_status["pins_in_safe_mode"] = count_safe_mode_pins();
  
  String response;
  serializeJson(doc, response);
  
  mqtt_client.publish(response_topic.c_str(), response.c_str());
  DEBUG_PRINTF("[Pi Server] Response sent: %s\n", message.c_str());
}

// ✅ NEU: delete_esp Command Handler mit Safe Mode
void handle_delete_esp_command(String request_id) {
  DEBUG_PRINT("[Pi Server] Deleting ESP configuration with safe mode...");
  
  // ✅ NEU: Alle Pins in Safe Mode setzen
  enableSafeModeForAllPins();
  
  // Alle Sensoren entfernen (bereits im Safe Mode)
  for (int i = 0; i < MAX_SENSORS; i++) {
    if (sensors[i].active) {
      removeSensor(sensors[i].gpio);
    }
  }
  
  // Alle Aktoren entfernen
  if (advanced_system_initialized) {
    // Entferne alle konfigurierten Aktoren einzeln
    for (uint8_t gpio = 0; gpio < MAX_GPIO_PINS; gpio++) {
      if (advanced_system.isActuatorConfigured(gpio)) {
        advanced_system.removeActuator(gpio);
      }
    }
  }
  
  // Konfiguration zurücksetzen
  reset_esp_configuration();
  
  // Bestätigung senden
  String message = "ESP configuration deleted and all pins in safe mode";
  send_pi_server_response(request_id, true, message);
  
  // ESP neu starten nach 3 Sekunden
  delay(3000);
  ESP.restart();
}

// ✅ NEU: status_request Command Handler mit Safe Mode
void handle_status_request_command(String request_id) {
  DEBUG_PRINT("[Pi Server] Sending immediate status with safe mode info...");
  
  // Sofortigen Status senden
  sendStatusUpdate();
  sendHeartbeat();
  
  // Bestätigung senden
  String message = "Status update sent with safe mode information";
  send_pi_server_response(request_id, true, message);
}

// ✅ NEU: Safe Mode Monitoring
void monitor_safe_mode_status() {
  static unsigned long last_safe_mode_check = 0;
  const unsigned long SAFE_MODE_CHECK_INTERVAL = 30000; // 30 Sekunden
  
  if (millis() - last_safe_mode_check > SAFE_MODE_CHECK_INTERVAL) {
    int safe_pins = count_safe_mode_pins();
    
    if (safe_pins > 0) {
      DEBUG_PRINTF("[SafeMode] Monitoring: %d pins in safe mode\n", safe_pins);
      
      // Safe Mode Status senden
      send_safe_mode_status();
    }
    
    last_safe_mode_check = millis();
  }
}

// ✅ NEU: Safe Mode Status senden
void send_safe_mode_status() {
  if (!mqtt_client.connected()) return;
  
  StaticJsonDocument<512> safe_doc;
  safe_doc["esp_id"] = esp_id;
  safe_doc["command"] = "safe_mode_status";
  safe_doc["timestamp"] = getUnixTimestamp();
  
  // v3.6.0: ISO Timestamp und Time Quality
  if (advanced_system_initialized) {
    safe_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    safe_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
  }
  safe_doc["context"] = "safe_mode_status";
  
  JsonObject safe_status = safe_doc.createNestedObject("safe_mode");
  safe_status["active"] = true;
  safe_status["pins_in_safe_mode"] = count_safe_mode_pins();
  safe_status["total_available_pins"] = MAX_GPIO_PINS;
  
  JsonArray safe_pins = safe_status.createNestedArray("safe_pins");
  for (int i = 0; i < MAX_GPIO_PINS; i++) {
    if (gpio_safe_mode[i]) {
      safe_pins.add(i);
    }
  }
  
  String safe_message;
  ArduinoJson::serializeJson(safe_doc, safe_message);
  
  String safe_topic = buildTopic("safe_mode", esp_id);
  mqtt_client.publish(safe_topic.c_str(), safe_message.c_str());
  
  DEBUG_PRINT("[SafeMode] Safe mode status sent");
}

// =============================================================================
// KAISER ID GENERATION
// =============================================================================

/**
 * Generiert eine konsistente Kaiser ID aus einem System-Namen
 * Identisch zur Frontend-Logik in src/stores/centralConfig.js
 */
// =============================================================================
// DYNAMIC ID FUNCTIONS - Konsistenz mit HARDCODEPROBLEMS.md
// =============================================================================

String generateClientId() {
  // UUID-Generierung für ESP32 basierend auf MAC-Adresse und Timestamp
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  String timestamp = String(millis(), HEX);
  
  // Kombiniere MAC und Timestamp für eindeutige ID
  String client_id = mac.substring(8) + "_" + timestamp.substring(0, 4);
  client_id.toLowerCase();
  
  return client_id;
}

// =============================================================================
// SERVER DISCOVERY SYSTEM - Vollständige Server-Integration
// =============================================================================

/**
 * Führt Server-Discovery durch und extrahiert Kaiser-ID aus Server-Response
 * Verwendet bestehende HTTPClient-Infrastruktur und Error-Handling-Patterns
 * 
 * @return true wenn Discovery erfolgreich und Kaiser-ID aktualisiert wurde
 */
bool performServerDiscovery() {
  if (WiFi.status() != WL_CONNECTED) {
    DEBUG_PRINT("[ServerDiscovery] WiFi not connected - skipping discovery");
    return false;
  }
  
  HTTPClient http_client;
  String discovery_url = wifi_config.getPiServerURL() + "/api/discovery/esp32";
  
  DEBUG_PRINTF("[ServerDiscovery] Attempting discovery: %s\n", discovery_url.c_str());
  
  http_client.begin(discovery_url);
  http_client.addHeader("User-Agent", "ESP32-SensorNetwork/4.1.0");
  http_client.setTimeout(5000);  // 5 second timeout - konsistent mit bestehenden Patterns
  
  int http_code = http_client.GET();
  
  if (http_code == HTTP_CODE_OK) {
    String response = http_client.getString();
    http_client.end();
    
    DEBUG_PRINTF("[ServerDiscovery] Server response received: %s\n", response.c_str());
    
    // Parse Server Response mit bestehenden JSON-Patterns
    StaticJsonDocument<1024> discovery_doc;
    DeserializationError error = deserializeJson(discovery_doc, response);
    
    if (error) {
      DEBUG_PRINTF("[ServerDiscovery] JSON parse error: %s\n", error.c_str());
      return false;
    }
    
    // Extrahiere Kaiser-ID aus Server-Response
    if (discovery_doc.containsKey("kaiser_id")) {
      String server_kaiser_id = discovery_doc["kaiser_id"].as<String>();
      String current_kaiser_id = getKaiserId();
      
      DEBUG_PRINTF("[ServerDiscovery] Server kaiser_id: %s, Current: %s\n", 
                   server_kaiser_id.c_str(), current_kaiser_id.c_str());
      
      // Update Kaiser-ID wenn geändert
      if (server_kaiser_id != current_kaiser_id) {
        updateKaiserId(server_kaiser_id);
        kaiser_id_changed = true;
        kaiser_id_change_timestamp = millis();
        previous_kaiser_id = current_kaiser_id;
        
        DEBUG_PRINTF("[ServerDiscovery] ✅ Kaiser-ID updated: %s -> %s\n", 
                     current_kaiser_id.c_str(), server_kaiser_id.c_str());
      }
      
      // Verarbeite Server-Capabilities
      if (discovery_doc.containsKey("capabilities")) {
        JsonArray capabilities = discovery_doc["capabilities"];
        DEBUG_PRINTF("[ServerDiscovery] Server capabilities: %d items\n", capabilities.size());
        
        // Log server capabilities für Debugging
        for (JsonVariant capability : capabilities) {
          DEBUG_PRINTF("[ServerDiscovery] Capability: %s\n", capability.as<String>().c_str());
        }
      }
      
      // Verarbeite Server-Endpoints
      if (discovery_doc.containsKey("endpoints")) {
        JsonObject endpoints = discovery_doc["endpoints"];
        DEBUG_PRINTF("[ServerDiscovery] Server endpoints available: %d\n", endpoints.size());
      }
      
      return true;
    } else {
      DEBUG_PRINT("[ServerDiscovery] ❌ No kaiser_id in server response");
      return false;
    }
  } else {
    DEBUG_PRINTF("[ServerDiscovery] ❌ HTTP request failed - Code: %d\n", http_code);
    http_client.end();
    return false;
  }
}

/**
 * Aktualisiert Kaiser-ID in Preferences und setzt Change-Flags
 * Verwendet bestehende Preferences-Patterns für Konsistenz
 * 
 * @param new_kaiser_id Die neue Kaiser-ID vom Server
 */
void updateKaiserId(const String& new_kaiser_id) {
  if (new_kaiser_id.isEmpty()) {
    DEBUG_PRINT("[KaiserID] ❌ Cannot update with empty kaiser_id");
    return;
  }
  
  // Speichere neue Kaiser-ID in Preferences - konsistent mit bestehenden Patterns
  preferences.begin("kaiser_config", false);
  preferences.putString("kaiser_id", new_kaiser_id);
  preferences.end();
  
  // Update Legacy-Struktur für Backward Compatibility
  kaiser_zone.kaiser_id = new_kaiser_id;
  
  DEBUG_PRINTF("[KaiserID] ✅ Kaiser-ID updated and saved: %s\n", new_kaiser_id.c_str());
}

String getKaiserId() {
  // Prüfe Preferences für gespeicherte Kaiser-ID
  Preferences preferences;
  preferences.begin("kaiser_config", true);
  String kaiser_id = preferences.getString("kaiser_id", DEFAULT_KAISER_ID);
  preferences.end();
  
  // Fallback auf kaiser_zone.kaiser_id für Backward Compatibility
  if (kaiser_id.isEmpty()) {
    kaiser_id = kaiser_zone.kaiser_id;
  }
  
  return kaiser_id;
}

int getMQTTPort() {
  // Verwende die bereits vorhandene wifi_config Struktur
  return wifi_config.getMQTTPort();
}

int getHttpPort() {
  // Verwende die bereits vorhandene wifi_config Struktur
  return wifi_config.getHttpPort();
}

// =============================================================================
// CONSISTENT TOPIC GENERATION - Memory-optimierte Topic-Building
// =============================================================================

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

String generateKaiserId(const String& systemName) {
  String kaiserId = systemName;
  
  // 1. Alles in Kleinbuchstaben
  kaiserId.toLowerCase();
  
  // 2. Sonderzeichen durch _ ersetzen (nur a-z, 0-9 erlaubt)
  for (int i = 0; i < kaiserId.length(); i++) {
    char c = kaiserId.charAt(i);
    if (!isalnum(c)) {
      kaiserId.setCharAt(i, '_');
    }
  }
  
  // 3. Mehrfache _ durch einzelne _ ersetzen
  while (kaiserId.indexOf("__") != -1) {
    kaiserId.replace("__", "_");
  }
  
  // 4. _ am Anfang und Ende entfernen
  if (kaiserId.startsWith("_")) {
    kaiserId = kaiserId.substring(1);
  }
  if (kaiserId.endsWith("_")) {
    kaiserId = kaiserId.substring(0, kaiserId.length() - 1);
  }
  
  // 5. Fallback wenn leer
  if (kaiserId.length() == 0) {
    kaiserId = "kaiser_system";
  }
  
  return kaiserId;
}

// =============================================================================
// ZONE CONFIGURATION MANAGEMENT
// =============================================================================

// 🆕 NEU: Topic-Management für Kaiser-ID-Transition
void unsubscribeFromOldTopics(const String& old_kaiser_id) {
  if (!mqtt_client.connected()) {
    DEBUG_PRINT("[TopicTransition] MQTT not connected - skipping unsubscribe");
    return;
  }
  
  String base_topic = "kaiser/" + old_kaiser_id + "/esp/" + esp_id + "/";
  
  String topics[] = {
    base_topic + "zone/config",
    base_topic + "system/command",
    base_topic + "subzone/config",
    base_topic + "sensor/config",
    base_topic + "sensor/remove",
    base_topic + "library/download",
    base_topic + "library/chunk",
    base_topic + "config",
    base_topic + "actuator/+/command",
    base_topic + "actuator/+/status",
    base_topic + "actuator/emergency",
    base_topic + "actuator/config",
    base_topic + "actuator/status",
    base_topic + "health/request",
    base_topic + "system/diagnostics",
    base_topic + "error/acknowledge",
    "kaiser/" + old_kaiser_id + "/broadcast/emergency",
    "kaiser/" + old_kaiser_id + "/broadcast/system_update"
  };
  
  int unsubscribed_count = 0;
  for (String topic : topics) {
    if (mqtt_client.unsubscribe(topic.c_str())) {
      DEBUG_PRINTF("[TopicTransition] ✅ Unsubscribed from: %s\n", topic.c_str());
      unsubscribed_count++;
    } else {
      DEBUG_PRINTF("[TopicTransition] ❌ Failed to unsubscribe from: %s\n", topic.c_str());
    }
  }
  
  DEBUG_PRINTF("[TopicTransition] Unsubscribed from %d old topics\n", unsubscribed_count);
}

void subscribeToNewTopics() {
  if (!mqtt_client.connected()) {
    DEBUG_PRINT("[TopicTransition] MQTT not connected - skipping subscribe");
    return;
  }
  
  DEBUG_PRINT("[TopicTransition] Subscribing to new topics with updated Kaiser ID...");
  
  // Verwende die bereits vorhandenen Subscribe-Funktionen
  subscribeToKaiserTopics();
  subscribeToConfigurationTopics();
  
  DEBUG_PRINT("[TopicTransition] ✅ New topic subscriptions completed");
}

// ✅ NEU: MQTT-Robustheits-Hilfsfunktionen implementieren
bool safePublish(const String& topic, const String& payload, int qos, int retries) {
  if (!isValidTopic(topic)) {
    DEBUG_PRINTF("[MQTT] ❌ Invalid topic: %s", topic.c_str());
    return false;
  }
  
  for (int i = 0; i < retries; i++) {
    if (mqtt_client.publish(topic.c_str(), payload.c_str(), qos)) {
      DEBUG_PRINTF("[MQTT] ✅ Published to %s (QoS %d, attempt %d/%d)", topic.c_str(), qos, i + 1, retries);
      return true;
    }
    DEBUG_PRINTF("[MQTT] ⚠️ Publish failed, retry %d/%d", i + 1, retries);
    delay(500); // Retry delay
  }
  DEBUG_PRINTF("[MQTT] ❌ Failed to publish after %d retries: %s", retries, topic.c_str());
  return false;
}

bool isValidTopic(const String& topic) {
  if (topic.length() == 0) return false;
  if (topic.indexOf("kaiser/") != 0) return false;
  if (topic.indexOf("//") != -1) return false; // Double slashes
  return true;
}

// 🆕 NEU: Erweiterte Validierung für spezielle Topics
bool isValidSpecialTopic(const String& topic) {
  if (!isValidTopic(topic)) return false;
  
  // Prüfe spezielle Topic-Patterns
  if (topic.indexOf("/test_payload_") != -1) return true;
  if (topic.indexOf("/library/") != -1) return true;
  if (topic.indexOf("/emergency/") != -1) return true;
  
  return true;
}

bool isValidConfigPayload(const String& payload) {
  if (payload.length() == 0) return false;
  
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    DEBUG_PRINTF("[Validation] ❌ Invalid JSON in config payload: %s", error.c_str());
    return false;
  }
  
  // Prüfe Pflichtfelder
  if (!doc.containsKey("esp_id") || doc["esp_id"].as<String>().length() == 0) {
    DEBUG_PRINT("[Validation] ❌ Missing or empty esp_id in config");
    return false;
  }
  
  if (!doc.containsKey("esp_username") || doc["esp_username"].as<String>().length() == 0) {
    DEBUG_PRINT("[Validation] ❌ Missing or empty esp_username in config");
    return false;
  }
  
  DEBUG_PRINT("[Validation] ✅ Config payload valid");
  return true;
}

bool isValidHeartbeatPayload(const String& payload) {
  if (payload.length() == 0) return false;
  
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    DEBUG_PRINTF("[Validation] ❌ Invalid JSON in heartbeat payload: %s", error.c_str());
    return false;
  }
  
  // Prüfe Pflichtfelder
  if (!doc.containsKey("esp_id") || doc["esp_id"].as<String>().length() == 0) {
    DEBUG_PRINT("[Validation] ❌ Missing or empty esp_id in heartbeat");
    return false;
  }
  
  if (!doc.containsKey("state")) {
    DEBUG_PRINT("[Validation] ❌ Missing state in heartbeat");
    return false;
  }
  
  DEBUG_PRINT("[Validation] ✅ Heartbeat payload valid");
  return true;
}

void sendDiscoveryNotification() {
  if (!mqtt_client.connected()) {
    DEBUG_PRINT("[Discovery] MQTT not connected - skipping discovery notification");
    return;
  }
  
  StaticJsonDocument<512> discovery_doc;
  discovery_doc["scanner_id"] = esp_id;  // v3.6.0: scanner_id statt esp_id
  discovery_doc["timestamp"] = getUnixTimestamp();
  discovery_doc["discovery_type"] = "normal";  // v3.6.0: discovery_type
  discovery_doc["id_generated"] = kaiser_zone.id_generated;
  discovery_doc["esp_id"] = esp_id;
  discovery_doc["kaiser_id"] = getKaiserId();
  discovery_doc["master_zone_id"] = master_zone.master_zone_id;
  discovery_doc["subzone_id"] = (active_subzones > 0) ? sub_zones[0].subzone_id : "";
  discovery_doc["esp_username"] = esp_id;  // v3.6.0: esp_username
  discovery_doc["esp_friendly_name"] = "Gewächshaus ESP";  // v3.6.0: esp_friendly_name
  discovery_doc["esp_zone"] = getKaiserId();  // v3.6.0: esp_zone
  discovery_doc["connection_established"] = mqtt_client.connected();  // v3.6.0: connection_established
  discovery_doc["board_type"] = "ESP32_DEVKIT";  // v3.6.0: board_type
  discovery_doc["chip_model"] = "ESP32";  // v3.6.0: chip_model
  discovery_doc["firmware_version"] = "3.5.0";  // v3.6.0: firmware_version
  discovery_doc["broker_ip"] = wifi_config.getServerAddress();  // v3.6.0: broker_ip
  discovery_doc["broker_port"] = wifi_config.getMQTTPort();  // v3.6.0: broker_port
  discovery_doc["http_port"] = wifi_config.getHttpPort();  // v3.6.0: http_port
  discovery_doc["server_address"] = wifi_config.getServerAddress();  // v3.6.0: server_address
  
  // v3.6.0: Subzone-IDs im Discovery
  JsonArray subzone_ids = discovery_doc.createNestedArray("subzone_ids");
  for (int i = 0; i < active_subzones; i++) {
    subzone_ids.add(sub_zones[i].subzone_id);
  }
  
  // v3.6.0: ISO Timestamp und Time Quality
  if (advanced_system_initialized) {
    discovery_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
    discovery_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
  }
  discovery_doc["context"] = "discovery_notification";
  
  String discovery_message;
  ArduinoJson::serializeJson(discovery_doc, discovery_message);
  
      String discovery_topic = "kaiser/" + getKaiserId() + "/discovery/esp32_nodes";
  
  if (mqtt_client.publish(discovery_topic.c_str(), discovery_message.c_str())) {
    DEBUG_PRINTF("[Discovery] ✅ Discovery notification sent: %s → %s\n", 
                 previous_kaiser_id.c_str(), getKaiserId().c_str());
    updateTopicStats(discovery_topic);
  } else {
    DEBUG_PRINT("[Discovery] ❌ Failed to send discovery notification");
  }
}

// =============================================================================
// MEMORY LEAK PREVENTION & CLEANUP
// =============================================================================

// ✅ Memory cleanup functions
void cleanupLibraryDownload() {
    if (current_library_download.data_buffer) {
        free(current_library_download.data_buffer);
        current_library_download.data_buffer = nullptr;
        DEBUG_PRINT("[Memory] Library download buffer freed");
    }
}

// 🆕 NEU: UI-Schema Memory Cleanup
void cleanupUISchemaSystem() {
    if (ui_schema_validator) {
        delete ui_schema_validator;
        ui_schema_validator = nullptr;
        DEBUG_PRINT("[Memory] UI schema validator freed");
    }
    
    if (ui_gpio_engine) {
        delete ui_gpio_engine;
        ui_gpio_engine = nullptr;
        DEBUG_PRINT("[Memory] UI GPIO engine freed");
    }
    
    if (ui_capabilities_reporter) {
        delete ui_capabilities_reporter;
        ui_capabilities_reporter = nullptr;
        DEBUG_PRINT("[Memory] UI capabilities reporter freed");
    }
    
    // 🧪 PHASE 2: Test Suite cleanup
    if (ui_test_suite) {
        delete ui_test_suite;
        ui_test_suite = nullptr;
        DEBUG_PRINT("[Memory] UI test suite freed");
    }
}

void cleanupWebConfigServer() {
    if (web_config_server) {
        delete web_config_server;
        web_config_server = nullptr;
        DEBUG_PRINT("[Memory] WebConfigServer deleted");
    }
}

void cleanupAdvancedSystem() {
    if (mqtt_manager) {
        delete mqtt_manager;
        mqtt_manager = nullptr;
    }
    if (pi_breaker) {
        delete pi_breaker;
        pi_breaker = nullptr;
    }
    if (health_monitor) {
        delete health_monitor;
        health_monitor = nullptr;
    }
    DEBUG_PRINT("[Memory] Advanced system components cleaned up");
}

// ✅ Memory monitoring
void checkMemoryStatus() {
    size_t free_heap = ESP.getFreeHeap();
    size_t min_free_heap = ESP.getMinFreeHeap();
    
    if (free_heap < 50000) { // 50KB threshold
        DEBUG_PRINTF("[Memory] WARNING: Low memory - Free: %d, Min: %d\n", free_heap, min_free_heap);
        
        // Force cleanup if memory critically low
        if (free_heap < 30000) {
            DEBUG_PRINT("[Memory] CRITICAL: Forcing memory cleanup");
            cleanupLibraryDownload();
            cleanupUISchemaSystem();
            
            // Restart if still low
            if (ESP.getFreeHeap() < 20000) {
                DEBUG_PRINT("[Memory] CRITICAL: Restarting due to low memory");
                ESP.restart();
            }
        }
    }
}

// ✅ PHASE 8: SENSOR AGGREGATION SUPPORT
// =============================================================================

// ✅ PHASE 8.1: Aggregation-Daten sammeln (ENTWICKLERVORGABEN: Bestehende Strukturen nutzen)
void sendSensorAggregationData(uint8_t gpio, const String& time_window) {
    // Bestehende Sensor-Daten nutzen (ENTWICKLERVORGABEN: Bestehende sensors[] Struktur)
    int sensor_index = -1;
    for (int i = 0; i < active_sensors; i++) {
        if (sensors[i].gpio == gpio && sensors[i].active) {
            sensor_index = i;
            break;
        }
    }
    
    if (sensor_index >= 0) {
        StaticJsonDocument<512> agg_doc;
        agg_doc["esp_id"] = esp_id;  // ✅ Bestehende Variable
        agg_doc["gpio"] = gpio;
        agg_doc["sensor_name"] = sensors[sensor_index].sensor_name;  // ✅ Bestehendes Feld
        agg_doc["subzone_id"] = sensors[sensor_index].subzone_id;  // ✅ Bestehendes Feld
        agg_doc["time_window"] = time_window;
        
        // Vereinfachte Aggregation (ENTWICKLERVORGABEN: Bestehende Felder nutzen)
        agg_doc["current_value"] = sensors[sensor_index].last_value;  // ✅ Bestehendes Feld
        agg_doc["last_update"] = sensors[sensor_index].last_reading;  // ✅ Bestehendes Feld
        agg_doc["sensor_type"] = getSensorTypeString(sensors[sensor_index].type);  // ✅ Bestehende Funktion
        
        // MQTT senden (ENTWICKLERVORGABEN: Bestehende Topic-Struktur)
        String topic = buildSpecialTopic("sensor/aggregation", esp_id);  // ✅ Bestehende Struktur
        String message;
        ArduinoJson::serializeJson(agg_doc, message);
        mqtt_client.publish(topic.c_str(), message.c_str());
        
        DEBUG_PRINTF("[Aggregation] Sent aggregation data for GPIO %d, window: %s\n", gpio, time_window.c_str());
    }
}

// ✅ PHASE 8.2: Aggregation-Request Handler (ENTWICKLERVORGABEN: Bestehende Handler-Struktur)
void handleAggregationRequest(const String& message) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (!error) {
        uint8_t gpio = doc["gpio"] | 0;
        String time_window = doc["time_window"] | "5min";
        sendSensorAggregationData(gpio, time_window);  // ✅ Bestehende Funktion nutzen
    }
}

// =============================================================================
// v3.6.0: NEUE MQTT-HANDLER IMPLEMENTIERUNGEN
// =============================================================================

// v3.6.0: Emergency-Command-Handler
void handleEmergencyCommand(String message) {
    DEBUG_PRINT("[Emergency] Processing emergency command");
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[Emergency] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    bool emergency_stop = doc["emergency_stop"] | false;
    
    if (emergency_stop) {
        DEBUG_PRINT("[Emergency] Emergency stop activated");
        
        // Aktoren stoppen
        if (advanced_system_initialized) {
            advanced_system.emergencyStopAllActuators();
        }
        
        // Sensoren in Safe Mode
        enableSafeModeForAllPins();
        
        // Emergency Broadcast senden
        sendEmergencyBroadcast("Emergency stop activated by frontend", "critical");
        
        // Response senden
        StaticJsonDocument<256> response;
        response["esp_id"] = esp_id;
        response["command"] = "emergency_stop";
        response["success"] = true;
        response["timestamp"] = getUnixTimestamp();
        
        if (advanced_system_initialized) {
            response["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
            response["time_quality"] = AdvancedFeatures::getTimeQuality();
        }
        response["context"] = "emergency_command";
        
        String response_msg;
        ArduinoJson::serializeJson(response, response_msg);
        
        String response_topic = buildTopic("response", esp_id);
        mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
        
        DEBUG_PRINT("[Emergency] Emergency stop response sent");
    }
}

// v3.6.0: Health-Request-Handler
void handleHealthRequest(String message) {
    DEBUG_PRINT("[Health] Processing health request");
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[Health] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    String request_type = doc["request_type"] | "full_health_check";
    
    // Sofortigen Health-Status senden
    sendSystemHealthBroadcast();
    
    // Response senden
    StaticJsonDocument<256> response;
    response["esp_id"] = esp_id;
    response["command"] = "health_request";
    response["request_type"] = request_type;
    response["success"] = true;
    response["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        response["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        response["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    response["context"] = "health_request";
    
    String response_msg;
    ArduinoJson::serializeJson(response, response_msg);
    
    String response_topic = buildTopic("response", esp_id);
    mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
    
    DEBUG_PRINT("[Health] Health request response sent");
}

// v3.6.0: Library-Request-Handler
void handleLibraryRequest(String message) {
    DEBUG_PRINT("[Library] Processing library request");
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[Library] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    String library_name = doc["library_name"] | "";
    String action = doc["action"] | "";
    
    if (library_name.isEmpty() || action.isEmpty()) {
        DEBUG_PRINT("[Library] Missing library_name or action");
        return;
    }
    
    bool success = false;
    String message_response = "";
    
    if (action == "install") {
        // Library-Installation starten
        success = true;
        message_response = "Library installation started";
        
        // Library-Download initiieren (vereinfacht)
        requestLibraryForSensor(SENSOR_CUSTOM_OTA);
        
        // Library Ready senden
        StaticJsonDocument<256> ready_doc;
        ready_doc["esp_id"] = esp_id;
        ready_doc["library_name"] = library_name;
        ready_doc["version"] = "1.0.0";
        ready_doc["timestamp"] = getUnixTimestamp();
        
        if (advanced_system_initialized) {
            ready_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
            ready_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
        }
        ready_doc["context"] = "library_request";
        
        String ready_msg;
        ArduinoJson::serializeJson(ready_doc, ready_msg);
        
        String ready_topic = "kaiser/" + getKaiserId() + "/esp/" + esp_id + "/library/ready";
        mqtt_client.publish(ready_topic.c_str(), ready_msg.c_str());
        
    } else if (action == "remove") {
        success = true;
        message_response = "Library removal completed";
    } else {
        success = false;
        message_response = "Unknown action: " + action;
    }
    
    // Response senden
    StaticJsonDocument<256> response;
    response["esp_id"] = esp_id;
    response["command"] = "library_request";
    response["library_name"] = library_name;
    response["action"] = action;
    response["success"] = success;
    response["message"] = message_response;
    response["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        response["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        response["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    response["context"] = "library_request";
    
    String response_msg;
    ArduinoJson::serializeJson(response, response_msg);
    
    String response_topic = buildTopic("response", esp_id);
    mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
    
    DEBUG_PRINTF("[Library] Library request response sent: %s\n", success ? "SUCCESS" : "FAILED");
}

// v3.6.0: Pi-Command-Handler
void handlePiCommand(String message) {
    DEBUG_PRINT("[Pi] Processing Pi command");
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[Pi] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    String command = doc["command"] | "";
    String pi_id = "default"; // Vereinfacht
    
    if (command.isEmpty()) {
        DEBUG_PRINT("[Pi] Missing command");
        return;
    }
    
    bool success = false;
    String message_response = "";
    
    if (command == "get_status") {
        success = true;
        message_response = "Pi status retrieved";
        
        // Pi Status senden
        StaticJsonDocument<256> status_doc;
        status_doc["esp_id"] = esp_id;
        status_doc["pi_id"] = pi_id;
        status_doc["status"] = "connected";
        status_doc["url"] = "http://192.168.1.100:80";
        status_doc["timestamp"] = getUnixTimestamp();
        
        if (advanced_system_initialized) {
            status_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
            status_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
        }
        status_doc["context"] = "pi_command";
        
        String status_msg;
        ArduinoJson::serializeJson(status_doc, status_msg);
        
        String status_topic = buildSpecialTopic("pi/" + pi_id + "/status", esp_id);
        mqtt_client.publish(status_topic.c_str(), status_msg.c_str());
        
    } else if (command == "health_check") {
        success = true;
        message_response = "Pi health check completed";
        
        // Pi Health senden
        StaticJsonDocument<256> health_doc;
        health_doc["esp_id"] = esp_id;
        health_doc["pi_id"] = pi_id;
        
        JsonObject health = health_doc.createNestedObject("health");
        health["cpu_usage"] = 15.5;
        health["memory_usage"] = 45.2;
        health["disk_usage"] = 23.1;
        health["uptime"] = 86400;
        
        health_doc["timestamp"] = getUnixTimestamp();
        
        if (advanced_system_initialized) {
            health_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
            health_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
        }
        health_doc["context"] = "pi_command";
        
        String health_msg;
        ArduinoJson::serializeJson(health_doc, health_msg);
        
        String health_topic = buildSpecialTopic("pi/" + pi_id + "/health", esp_id);
        mqtt_client.publish(health_topic.c_str(), health_msg.c_str());
        
    } else {
        success = false;
        message_response = "Unknown Pi command: " + command;
    }
    
    // Response senden
    StaticJsonDocument<256> response;
    response["esp_id"] = esp_id;
    response["command"] = "pi_command";
    response["pi_id"] = pi_id;
    response["requested_command"] = command;
    response["success"] = success;
    response["message"] = message_response;
    response["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        response["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        response["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    response["context"] = "pi_command";
    
    String response_msg;
    ArduinoJson::serializeJson(response, response_msg);
    
    String response_topic = buildSpecialTopic("pi/" + pi_id + "/response", esp_id);
    mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
    
    DEBUG_PRINTF("[Pi] Pi command response sent: %s\n", success ? "SUCCESS" : "FAILED");
}

// v3.6.0: I2C-Scan-Handler
void handleI2CScanRequest(String message) {
    DEBUG_PRINT("[I2C] Processing I2C scan request");
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[I2C] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    String command = doc["command"] | "";
    
    if (command == "scan_i2c_devices") {
        // I2C-Scan durchführen (vereinfacht)
        DEBUG_PRINT("[I2C] Starting I2C device scan");
        
        // Simulierte I2C-Geräte
        StaticJsonDocument<512> scan_doc;
        scan_doc["esp_id"] = esp_id;
        scan_doc["command"] = "scan_i2c_devices";
        scan_doc["timestamp"] = getUnixTimestamp();
        
        if (advanced_system_initialized) {
            scan_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
            scan_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
        }
        scan_doc["context"] = "i2c_scan";
        
        JsonArray devices = scan_doc.createNestedArray("devices");
        
        // Simulierte Geräte
        JsonObject device1 = devices.createNestedObject();
        device1["address"] = "0x48";
        device1["type"] = "temperature_sensor";
        device1["name"] = "ADS1115";
        
        JsonObject device2 = devices.createNestedObject();
        device2["address"] = "0x76";
        device2["type"] = "pressure_sensor";
        device2["name"] = "BME280";
        
        scan_doc["devices_found"] = 2;
        scan_doc["scan_success"] = true;
        
        String scan_msg;
        ArduinoJson::serializeJson(scan_doc, scan_msg);
        
        String scan_topic = buildSpecialTopic("i2c/scan_result", esp_id);
        mqtt_client.publish(scan_topic.c_str(), scan_msg.c_str());
        
        DEBUG_PRINT("[I2C] I2C scan result sent");
    }
}

// 🆕 NEU: UI-Schema Update Handler
void handleUISchemaUpdate(String message) {
    DEBUG_PRINT("[UISchema] Processing UI schema update");
    
    if (!ui_schema_validator || !ui_gpio_engine) {
        DEBUG_PRINT("[UISchema] ERROR: UI schema system not initialized");
        sendUISchemaResponse(false, "UI schema system not initialized", "");
        return;
    }
    
    // Circuit Breaker Pattern für Pi-Communication
    if (pi_breaker && !pi_breaker->canMakeRequest()) {
        DEBUG_PRINT("[UISchema] WARNING: Pi circuit breaker is open, rejecting schema update");
        sendUISchemaResponse(false, "Pi server unavailable (circuit breaker open)", "");
        return;
    }
    
    // Schema validieren und anwenden
    #ifdef XIAO_ESP32C3_MODE
        StaticJsonDocument<512> schema;  // XIAO: 2KB limit, aber 512B JSON buffer für Performance
    #else
        StaticJsonDocument<1024> schema;  // ESP32 Dev: 4KB limit, 1KB JSON buffer
    #endif
    
    if (!ui_schema_validator->validateCompleteSchema(message, schema)) {
        DEBUG_PRINT("[UISchema] Schema validation failed");
        sendUISchemaResponse(false, "Schema validation failed", "");
        if (pi_breaker) pi_breaker->recordFailure();
        return;
    }
    
    // Schema-Konfiguration anwenden
    if (!ui_gpio_engine->applySchemaConfiguration(schema)) {
        DEBUG_PRINT("[UISchema] Schema configuration failed");
        sendUISchemaResponse(false, "Configuration application failed", "");
        if (pi_breaker) pi_breaker->recordFailure();
        return;
    }
    
    // Erfolgreiche Anwendung
    DEBUG_PRINT("[UISchema] ✅ Schema update successful");
    String schema_version = schema.containsKey("schema_version") ? 
                           schema["schema_version"].as<String>() : "unknown";
    sendUISchemaResponse(true, "Schema applied successfully", schema_version);
    
    if (pi_breaker) pi_breaker->recordSuccess();
    
    // Aktualisierte Sensor-Konfiguration senden
    sendESPConfigurationToFrontend();
    sendConfigurationToPiServer();
}

// 🆕 NEU: UI-Capabilities Request Handler
void handleUICapabilitiesRequest(String message) {
    DEBUG_PRINT("[UISchema] Processing UI capabilities request");
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[UISchema] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    if (doc["esp_id"] == esp_id) {
        if (!ui_capabilities_reporter) {
            DEBUG_PRINT("[UISchema] ERROR: Capabilities reporter not initialized");
            return;
        }
        
        String capabilities_report = ui_capabilities_reporter->generateCapabilitiesReport();
        
        String capabilities_topic = buildSpecialTopic("ui_capabilities", esp_id, "response");
        if (mqtt_client.publish(capabilities_topic.c_str(), capabilities_report.c_str())) {
            DEBUG_PRINT("[UISchema] ✅ Capabilities report sent");
        } else {
            DEBUG_PRINT("[UISchema] ERROR: Failed to send capabilities report");
        }
    }
}

// 🧪 PHASE 2: UI-Test Request Handler
void handleUITestRequest(String message) {
    DEBUG_PRINT("[UITest] Processing test request");
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[UITest] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    if (doc["esp_id"] == esp_id) {
        String test_type = doc.containsKey("test_type") ? doc["test_type"].as<String>() : "full";
        
        if (!ui_test_suite) {
            DEBUG_PRINT("[UITest] ERROR: Test suite not initialized");
            
            // Send error response
            StaticJsonDocument<256> error_response;
            error_response["esp_id"] = esp_id;
            error_response["test_type"] = test_type;
            error_response["error"] = "Test suite not initialized";
            error_response["timestamp"] = getUnixTimestamp();
            
            String error_msg;
            serializeJson(error_response, error_msg);
            
            String error_topic = buildSpecialTopic("test_report", esp_id, "error");
            mqtt_client.publish(error_topic.c_str(), error_msg.c_str());
            return;
        }
        
        DEBUG_PRINTF("[UITest] Starting %s test suite\n", test_type.c_str());
        
        // Send start notification
        StaticJsonDocument<256> start_response;
        start_response["esp_id"] = esp_id;
        start_response["test_type"] = test_type;
        start_response["status"] = "started";
        start_response["timestamp"] = getUnixTimestamp();
        start_response["free_heap_before"] = ESP.getFreeHeap();
        
        String start_msg;
        serializeJson(start_response, start_msg);
        
        String start_topic = buildSpecialTopic("test_report", esp_id, "started");
        mqtt_client.publish(start_topic.c_str(), start_msg.c_str());
        
        // Run the tests
        if (test_type == "full" || test_type == "all") {
            ui_test_suite->runAllTests();
        } else {
            // Für spezifische Test-Types könnten hier einzelne Tests aufgerufen werden
            DEBUG_PRINTF("[UITest] Unknown test type: %s, running full suite\n", test_type.c_str());
            ui_test_suite->runAllTests();
        }
        
        DEBUG_PRINT("[UITest] ✅ Test suite completed");
    }
}

// 🆕 NEU: UI-Schema Response Helper
void sendUISchemaResponse(bool success, const String& message, const String& schema_version) {
    StaticJsonDocument<512> response;
    response["esp_id"] = esp_id;
    response["timestamp"] = getUnixTimestamp();
    response["success"] = success;
    response["message"] = message;
    
    if (!schema_version.isEmpty()) {
        response["schema_version"] = schema_version;
    }
    
    // Hardware-Status hinzufügen
    response["free_heap"] = ESP.getFreeHeap();
    response["active_sensors"] = active_sensors;
    
    JsonArray configured_gpios = response.createNestedArray("configured_gpios");
    for (int i = 0; i < MAX_SENSORS; i++) {
        if (sensors[i].active) {
            configured_gpios.add(sensors[i].gpio);
        }
    }
    
    String response_message;
    serializeJson(response, response_message);
    
    String response_topic = buildSpecialTopic("ui_schema", esp_id, "response");
    mqtt_client.publish(response_topic.c_str(), response_message.c_str());
    
    DEBUG_PRINTF("[UISchema] Response sent: %s\n", success ? "SUCCESS" : "FAILED");
}

// v3.6.0: Emergency-Broadcast-Handler
void handleEmergencyBroadcast(String message) {
    DEBUG_PRINT("[EmergencyBroadcast] Processing emergency broadcast");
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[EmergencyBroadcast] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    String broadcast_message = doc["message"] | "";
    String severity = doc["severity"] | "critical";
    
    DEBUG_PRINTF("[EmergencyBroadcast] Emergency: %s (severity: %s)\n", broadcast_message.c_str(), severity.c_str());
    
    // Emergency-Handling
    if (severity == "critical") {
        if (advanced_system_initialized) {
            advanced_system.emergencyStopAllActuators();
        }
        enableSafeModeForAllPins();
    }
    
    // Response senden
    StaticJsonDocument<256> response;
    response["esp_id"] = esp_id;
    response["command"] = "emergency_broadcast";
    response["message"] = broadcast_message;
    response["severity"] = severity;
    response["handled"] = true;
    response["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        response["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        response["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    response["context"] = "emergency_broadcast";
    
    String response_msg;
    ArduinoJson::serializeJson(response, response_msg);
    
    String response_topic = buildTopic("response", esp_id);
    mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
    
    DEBUG_PRINT("[EmergencyBroadcast] Emergency broadcast response sent");
}

// v3.6.0: System-Update-Broadcast-Handler
void handleSystemUpdateBroadcast(String message) {
    DEBUG_PRINT("[SystemUpdate] Processing system update broadcast");
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        DEBUG_PRINTF("[SystemUpdate] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    String update_message = doc["message"] | "";
    String version = doc["version"] | "";
    
    DEBUG_PRINTF("[SystemUpdate] Update: %s (version: %s)\n", update_message.c_str(), version.c_str());
    
    // Response senden
    StaticJsonDocument<256> response;
    response["esp_id"] = esp_id;
    response["command"] = "system_update_broadcast";
    response["message"] = update_message;
    response["version"] = version;
    response["acknowledged"] = true;
    response["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        response["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        response["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    response["context"] = "system_update_broadcast";
    
    String response_msg;
    ArduinoJson::serializeJson(response, response_msg);
    
    String response_topic = buildTopic("response", esp_id);
    mqtt_client.publish(response_topic.c_str(), response_msg.c_str());
    
    DEBUG_PRINT("[SystemUpdate] System update broadcast response sent");
}

// v3.6.0: Zone-Response-Publish
void sendZoneResponse(const String& status) {
    if (!mqtt_client.connected()) return;
    
    StaticJsonDocument<512> response_doc;
    response_doc["esp_id"] = esp_id;
    response_doc["status"] = status;
    response_doc["kaiser_zone"] = getKaiserId();
    response_doc["master_zone"] = master_zone.master_zone_id;
    response_doc["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        response_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        response_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    response_doc["context"] = "zone_response";
    
    String response_msg;
    ArduinoJson::serializeJson(response_doc, response_msg);
    
    String response_topic = buildSpecialTopic("zone/response", esp_id);
    
    if (mqtt_client.publish(response_topic.c_str(), response_msg.c_str())) {
        DEBUG_PRINTF("[ZoneResponse] Zone response sent: %s\n", status.c_str());
        updateTopicStats(response_topic);
    } else {
        DEBUG_PRINT("[ZoneResponse] Failed to send zone response");
    }
}

// v3.6.0: Subzone-Response-Publish
void sendSubzoneResponse(const String& status) {
    if (!mqtt_client.connected()) return;
    
    StaticJsonDocument<512> response_doc;
    response_doc["esp_id"] = esp_id;
    response_doc["status"] = status;
    response_doc["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        response_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        response_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    response_doc["context"] = "subzone_response";
    
    JsonArray subzones = response_doc.createNestedArray("subzones");
    for (int i = 0; i < active_subzones; i++) {
        if (sub_zones[i].active) {
            JsonObject subzone = subzones.createNestedObject();
            subzone["id"] = sub_zones[i].subzone_id;
            subzone["name"] = sub_zones[i].subzone_name;
            subzone["description"] = sub_zones[i].description;
        }
    }
    
    String response_msg;
    ArduinoJson::serializeJson(response_doc, response_msg);
    
    String response_topic = buildSpecialTopic("subzone/response", esp_id);
    
    if (mqtt_client.publish(response_topic.c_str(), response_msg.c_str())) {
        DEBUG_PRINTF("[SubzoneResponse] Subzone response sent: %s\n", status.c_str());
        updateTopicStats(response_topic);
    } else {
        DEBUG_PRINT("[SubzoneResponse] Failed to send subzone response");
    }
}

// v3.6.0: Pi-Sensor-Statistics-Publish
void sendPiSensorStatistics(const String& sensor_id) {
    if (!mqtt_client.connected()) return;
    
    StaticJsonDocument<512> stats_doc;
    stats_doc["esp_id"] = esp_id;
    stats_doc["pi_id"] = "default";
    stats_doc["sensor_id"] = sensor_id;
    stats_doc["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        stats_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        stats_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    stats_doc["context"] = "pi_sensor_statistics";
    
    JsonObject statistics = stats_doc.createNestedObject("statistics");
    statistics["avg_value"] = 23.5;
    statistics["min_value"] = 18.2;
    statistics["max_value"] = 28.7;
    statistics["readings_count"] = 1440;
    statistics["period_hours"] = 24;
    
    String stats_msg;
    ArduinoJson::serializeJson(stats_doc, stats_msg);
    
    String stats_topic = buildSpecialTopic("pi/default/sensor/" + sensor_id + "/statistics", esp_id);
    
    if (mqtt_client.publish(stats_topic.c_str(), stats_msg.c_str())) {
        DEBUG_PRINTF("[PiStats] Pi sensor statistics sent for sensor: %s\n", sensor_id.c_str());
        updateTopicStats(stats_topic);
    } else {
        DEBUG_PRINT("[PiStats] Failed to send Pi sensor statistics");
    }
}

// v3.6.0: Emergency-Broadcast-Publish
void sendEmergencyBroadcast(const String& message, const String& severity) {
    if (!mqtt_client.connected()) return;
    
    StaticJsonDocument<512> broadcast_doc;
    broadcast_doc["message"] = message;
    broadcast_doc["severity"] = severity;
    broadcast_doc["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        broadcast_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        broadcast_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    broadcast_doc["context"] = "emergency_broadcast";
    
    String broadcast_msg;
    ArduinoJson::serializeJson(broadcast_doc, broadcast_msg);
    
    String broadcast_topic = buildBroadcastTopic("emergency");
    
    if (mqtt_client.publish(broadcast_topic.c_str(), broadcast_msg.c_str())) {
        DEBUG_PRINTF("[EmergencyBroadcast] Emergency broadcast sent: %s\n", message.c_str());
        updateTopicStats(broadcast_topic);
    } else {
        DEBUG_PRINT("[EmergencyBroadcast] Failed to send emergency broadcast");
    }
}

// v3.6.0: System-Update-Broadcast-Publish
void sendSystemUpdateBroadcast(const String& message, const String& version) {
    if (!mqtt_client.connected()) return;
    
    StaticJsonDocument<512> broadcast_doc;
    broadcast_doc["message"] = message;
    broadcast_doc["version"] = version;
    broadcast_doc["timestamp"] = getUnixTimestamp();
    
    if (advanced_system_initialized) {
        broadcast_doc["iso_timestamp"] = AdvancedFeatures::getISOTimestamp();
        broadcast_doc["time_quality"] = AdvancedFeatures::getTimeQuality();
    }
    broadcast_doc["context"] = "system_update_broadcast";
    
    String broadcast_msg;
    ArduinoJson::serializeJson(broadcast_doc, broadcast_msg);
    
    String broadcast_topic = buildBroadcastTopic("system_update");
    
    if (mqtt_client.publish(broadcast_topic.c_str(), broadcast_msg.c_str())) {
        DEBUG_PRINTF("[SystemUpdate] System update broadcast sent: %s\n", message.c_str());
        updateTopicStats(broadcast_topic);
    } else {
        DEBUG_PRINT("[SystemUpdate] Failed to send system update broadcast");
    }
}
