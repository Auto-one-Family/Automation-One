// ============================================
// INCLUDES
// ============================================
#include <Arduino.h>
#include <ArduinoJson.h>
#include "drivers/gpio_manager.h"
#include "utils/logger.h"
#include "services/config/storage_manager.h"
#include "services/config/config_manager.h"
#include "services/config/config_response.h"
#include "error_handling/error_tracker.h"
#include "models/config_types.h"
#include "models/error_codes.h"
#include "utils/topic_builder.h"
#include "utils/json_helpers.h"
#include "models/system_types.h"
#include "services/communication/wifi_manager.h"
#include "services/communication/mqtt_client.h"

// Phase 3: Hardware Abstraction Layer
#include "drivers/i2c_bus.h"
#include "drivers/onewire_bus.h"
#include "drivers/pwm_controller.h"

// Phase 4: Sensor System
#include "services/sensor/sensor_manager.h"
#include "models/sensor_types.h"

// Phase 5: Actuator System
#include "services/actuator/actuator_manager.h"
#include "services/actuator/safety_controller.h"

// ============================================
// GLOBAL VARIABLES
// ============================================
SystemConfig g_system_config;
WiFiConfig g_wifi_config;
KaiserZone g_kaiser;
MasterZone g_master;

// ============================================
// FORWARD DECLARATIONS
// ============================================
void handleSensorConfig(const String& payload);
bool parseAndConfigureSensor(const JsonObjectConst& sensor_obj);
void handleActuatorConfig(const String& payload);

// ============================================
// SETUP - INITIALIZATION ORDER (Guide-konform)
// ============================================
void setup() {
  // ============================================
  // STEP 1: HARDWARE INITIALIZATION
  // ============================================
  Serial.begin(115200);
  delay(100);  // Allow Serial to stabilize
  
  // ============================================
  // STEP 2: BOOT BANNER (before Logger exists)
  // ============================================
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║  ESP32 Sensor Network v4.0 (Phase 2)  ║");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.printf("Chip Model: %s\n", ESP.getChipModel());
  Serial.printf("CPU Frequency: %d MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("Free Heap: %d bytes\n\n", ESP.getFreeHeap());
  
  // ============================================
  // STEP 3: GPIO SAFE-MODE (CRITICAL - FIRST!)
  // ============================================
  // MUST be first to prevent hardware damage from undefined GPIO states
  gpioManager.initializeAllPinsToSafeMode();
  
  // ============================================
  // STEP 4: LOGGER (Foundation for all modules)
  // ============================================
  logger.begin();
  logger.setLogLevel(LOG_INFO);
  LOG_INFO("Logger system initialized");
  
  // ============================================
  // STEP 5: STORAGE MANAGER (NVS access layer)
  // ============================================
  if (!storageManager.begin()) {
    LOG_ERROR("StorageManager initialization failed!");
    // Continue anyway (can work without persistence)
  }
  
  // ============================================
  // STEP 6: CONFIG MANAGER (Load configurations)
  // ============================================
  configManager.begin();
  if (!configManager.loadAllConfigs()) {
    LOG_WARNING("Some configurations failed to load - using defaults");
  }
  
  // Load configs into global variables
  configManager.loadWiFiConfig(g_wifi_config);
  configManager.loadZoneConfig(g_kaiser, g_master);
  configManager.loadSystemConfig(g_system_config);
  
  configManager.printConfigurationStatus();
  
  // ============================================
  // STEP 7: ERROR TRACKER (Error history)
  // ============================================
  errorTracker.begin();
  
  // ============================================
  // STEP 8: TOPIC BUILDER (MQTT topics)
  // ============================================
  TopicBuilder::setEspId(g_system_config.esp_id.c_str());
  TopicBuilder::setKaiserId(g_kaiser.kaiser_id.c_str());
  
  LOG_INFO("TopicBuilder configured with ESP ID: " + g_system_config.esp_id);
  
  // ============================================
  // STEP 9: PHASE 1 COMPLETE
  // ============================================
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 1: Core Infrastructure READY  ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  LOG_INFO("Modules Initialized:");
  LOG_INFO("  ✅ GPIO Manager (Safe-Mode)");
  LOG_INFO("  ✅ Logger System");
  LOG_INFO("  ✅ Storage Manager");
  LOG_INFO("  ✅ Config Manager");
  LOG_INFO("  ✅ Error Tracker");
  LOG_INFO("  ✅ Topic Builder");
  
  // Print memory stats
  LOG_INFO("=== Memory Status (Phase 1) ===");
  LOG_INFO("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_INFO("Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_INFO("Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_INFO("=====================");
  
  // ============================================
  // STEP 10: PHASE 2 - COMMUNICATION LAYER
  // ============================================
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 2: Communication Layer         ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  // WiFi Manager
  if (!wifiManager.begin()) {
    LOG_ERROR("WiFiManager initialization failed!");
    return;
  }
  
  WiFiConfig wifi_config = configManager.getWiFiConfig();
  if (!wifiManager.connect(wifi_config)) {
    LOG_ERROR("WiFi connection failed");
    LOG_WARNING("System will continue but WiFi features unavailable");
  } else {
    LOG_INFO("WiFi connected successfully");
  }
  
  // MQTT Client
  if (!mqttClient.begin()) {
    LOG_ERROR("MQTTClient initialization failed!");
    return;
  }
  
  MQTTConfig mqtt_config;
  mqtt_config.server = wifi_config.server_address;
  mqtt_config.port = wifi_config.mqtt_port;
  mqtt_config.client_id = configManager.getESPId();
  mqtt_config.username = wifi_config.mqtt_username;  // Can be empty (Anonymous)
  mqtt_config.password = wifi_config.mqtt_password;  // Can be empty (Anonymous)
  mqtt_config.keepalive = 60;
  mqtt_config.timeout = 10;
  
  if (!mqttClient.connect(mqtt_config)) {
    LOG_ERROR("MQTT connection failed");
    LOG_WARNING("System will continue but MQTT features unavailable");
  } else {
    LOG_INFO("MQTT connected successfully");
    
    // Subscribe to critical topics
    String system_command_topic = TopicBuilder::buildSystemCommandTopic();
    String config_topic = TopicBuilder::buildConfigTopic();
    String broadcast_emergency_topic = TopicBuilder::buildBroadcastEmergencyTopic();
    String actuator_command_topic = TopicBuilder::buildActuatorCommandTopic(0);
    String actuator_command_wildcard = actuator_command_topic;
    actuator_command_wildcard.replace("/0/command", "/+/command");
    String esp_emergency_topic = TopicBuilder::buildActuatorEmergencyTopic();
    
    mqttClient.subscribe(system_command_topic);
    mqttClient.subscribe(config_topic);
    mqttClient.subscribe(broadcast_emergency_topic);
    mqttClient.subscribe(actuator_command_wildcard);
    mqttClient.subscribe(esp_emergency_topic);
    
    LOG_INFO("Subscribed to system + actuator topics");
    
    // Set MQTT callback for message routing (Phase 4)
    mqttClient.setCallback([](const String& topic, const String& payload) {
      LOG_INFO("MQTT message received: " + topic);
      LOG_DEBUG("Payload: " + payload);
      
      // Handle sensor configuration
      String config_topic = String(TopicBuilder::buildConfigTopic());
      if (topic == config_topic) {
        handleSensorConfig(payload);
        handleActuatorConfig(payload);
        return;
      }
      
      // Actuator commands
      String actuator_command_prefix = String(TopicBuilder::buildActuatorCommandTopic(0));
      actuator_command_prefix.replace("/0/command", "/");
      if (topic.startsWith(actuator_command_prefix)) {
        actuatorManager.handleActuatorCommand(topic, payload);
        return;
      }
      
      // ESP-specific emergency stop
      String esp_emergency_topic = String(TopicBuilder::buildActuatorEmergencyTopic());
      if (topic == esp_emergency_topic) {
        safetyController.emergencyStopAll("ESP emergency command");
        return;
      }
      
      // Broadcast emergency
      String broadcast_emergency_topic = String(TopicBuilder::buildBroadcastEmergencyTopic());
      if (topic == broadcast_emergency_topic) {
        safetyController.emergencyStopAll("Broadcast emergency");
        return;
      }
      
      // Additional message handlers can be added here
    });
  }
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 2: Communication Layer READY  ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  LOG_INFO("Modules Initialized:");
  LOG_INFO("  ✅ WiFi Manager");
  LOG_INFO("  ✅ MQTT Client");
  LOG_INFO("");
  
  // Print memory stats
  LOG_INFO("=== Memory Status (Phase 2) ===");
  LOG_INFO("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_INFO("Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_INFO("Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_INFO("=====================");
  
  // ============================================
  // STEP 11: PHASE 3 - HARDWARE ABSTRACTION LAYER
  // ============================================
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 3: Hardware Abstraction Layer  ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  // I2C Bus Manager
  if (!i2cBusManager.begin()) {
    LOG_ERROR("I2C Bus Manager initialization failed!");
    errorTracker.trackError(ERROR_I2C_INIT_FAILED, 
                           ERROR_SEVERITY_CRITICAL,
                           "I2C begin() failed");
  } else {
    LOG_INFO("I2C Bus Manager initialized");
  }
  
  // OneWire Bus Manager
  if (!oneWireBusManager.begin()) {
    LOG_ERROR("OneWire Bus Manager initialization failed!");
    errorTracker.trackError(ERROR_ONEWIRE_INIT_FAILED,
                           ERROR_SEVERITY_CRITICAL,
                           "OneWire begin() failed");
  } else {
    LOG_INFO("OneWire Bus Manager initialized");
  }
  
  // PWM Controller
  if (!pwmController.begin()) {
    LOG_ERROR("PWM Controller initialization failed!");
    errorTracker.trackError(ERROR_PWM_INIT_FAILED,
                           ERROR_SEVERITY_CRITICAL,
                           "PWM begin() failed");
  } else {
    LOG_INFO("PWM Controller initialized");
  }
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 3: Hardware Abstraction READY  ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  LOG_INFO("Modules Initialized:");
  LOG_INFO("  ✅ I2C Bus Manager");
  LOG_INFO("  ✅ OneWire Bus Manager");
  LOG_INFO("  ✅ PWM Controller");
  LOG_INFO("");
  
  // Print memory stats
  LOG_INFO("=== Memory Status (Phase 3) ===");
  LOG_INFO("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_INFO("Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_INFO("Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_INFO("=====================");
  
  // ============================================
  // STEP 12: PHASE 4 - SENSOR SYSTEM
  // ============================================
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 4: Sensor System               ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  // Sensor Manager
  if (!sensorManager.begin()) {
    LOG_ERROR("Sensor Manager initialization failed!");
    errorTracker.trackError(ERROR_SENSOR_INIT_FAILED,
                           ERROR_SEVERITY_CRITICAL,
                           "SensorManager begin() failed");
  } else {
    LOG_INFO("Sensor Manager initialized");
    
    // Load sensor configs from NVS
    SensorConfig sensors[10];
    uint8_t loaded_count = 0;
    if (configManager.loadSensorConfig(sensors, 10, loaded_count)) {
      LOG_INFO("Loaded " + String(loaded_count) + " sensor configs from NVS");
      for (uint8_t i = 0; i < loaded_count; i++) {
        sensorManager.configureSensor(sensors[i]);
      }
    }
  }
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 4: Sensor System READY         ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  LOG_INFO("Modules Initialized:");
  LOG_INFO("  ✅ Sensor Manager");
  LOG_INFO("");
  
  // Print memory stats
  LOG_INFO("=== Memory Status (Phase 4) ===");
  LOG_INFO("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_INFO("Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_INFO("Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_INFO("=====================");

  // ============================================
  // STEP 13: PHASE 5 - ACTUATOR SYSTEM
  // ============================================
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 5: Actuator System            ║");
  LOG_INFO("╚════════════════════════════════════════╝");

  if (!safetyController.begin()) {
    LOG_ERROR("Safety Controller initialization failed!");
    errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                            ERROR_SEVERITY_CRITICAL,
                            "SafetyController begin() failed");
  } else {
    LOG_INFO("Safety Controller initialized");
  }

  if (!actuatorManager.begin()) {
    LOG_ERROR("Actuator Manager initialization failed!");
    errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                            ERROR_SEVERITY_CRITICAL,
                            "ActuatorManager begin() failed");
  } else {
    LOG_INFO("Actuator Manager initialized (waiting for MQTT configs)");
  }

  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 5: Actuator System READY      ║");
  LOG_INFO("╚════════════════════════════════════════╝");
}

// ============================================
// LOOP - Phase 2 Communication Monitoring + Phase 4/5 Operations
// ============================================
void loop() {
  // Phase 2: Communication monitoring
  wifiManager.loop();      // Monitor WiFi connection
  mqttClient.loop();       // Process MQTT messages + heartbeat
  
  // Phase 4: Sensor measurements
  sensorManager.performAllMeasurements();

  // Phase 5: Actuator maintenance
  actuatorManager.processActuatorLoops();
  static unsigned long last_actuator_status = 0;
  if (millis() - last_actuator_status > 30000) {
    actuatorManager.publishAllActuatorStatus();
    last_actuator_status = millis();
  }
  
  delay(10);  // Small delay to prevent watchdog issues
}

// ============================================
// MQTT MESSAGE HANDLERS (PHASE 4)
// ============================================
void handleSensorConfig(const String& payload) {
  LOG_INFO("Handling sensor configuration from MQTT");

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    String message = "Failed to parse sensor config JSON: " + String(error.c_str());
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::JSON_PARSE_ERROR, message);
    return;
  }

  JsonArray sensors = doc["sensors"].as<JsonArray>();
  if (sensors.isNull()) {
    String message = "Sensor config missing 'sensors' array";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message);
    return;
  }

  size_t total = sensors.size();
  if (total == 0) {
    String message = "Sensor config array is empty";
    LOG_WARNING(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message);
    return;
  }

  uint8_t success_count = 0;
  for (JsonObject sensorObj : sensors) {
    if (parseAndConfigureSensor(sensorObj)) {
      success_count++;
    }
  }

  if (success_count == total) {
    String message = "Configured " + String(success_count) + " sensor(s) successfully";
    ConfigResponseBuilder::publishSuccess(ConfigType::SENSOR, success_count, message);
  }
}

bool parseAndConfigureSensor(const JsonObjectConst& sensor_obj) {
  SensorConfig config;
  JsonVariantConst failed_variant = sensor_obj;

  if (!sensor_obj.containsKey("gpio")) {
    String message = "Sensor config missing required field 'gpio'";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message, failed_variant);
    return false;
  }

  int gpio_value = 255;
  if (!JsonHelpers::extractInt(sensor_obj, "gpio", gpio_value)) {
    String message = "Sensor field 'gpio' must be an integer";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::TYPE_MISMATCH, message, failed_variant);
    return false;
  }
  config.gpio = static_cast<uint8_t>(gpio_value);

  if (!sensor_obj.containsKey("sensor_type")) {
    String message = "Sensor config missing required field 'sensor_type'";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message, failed_variant);
    return false;
  }
  if (!JsonHelpers::extractString(sensor_obj, "sensor_type", config.sensor_type)) {
    String message = "Sensor field 'sensor_type' must be a string";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::TYPE_MISMATCH, message, failed_variant);
    return false;
  }

  if (!sensor_obj.containsKey("sensor_name")) {
    String message = "Sensor config missing required field 'sensor_name'";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message, failed_variant);
    return false;
  }
  if (!JsonHelpers::extractString(sensor_obj, "sensor_name", config.sensor_name)) {
    String message = "Sensor field 'sensor_name' must be a string";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::TYPE_MISMATCH, message, failed_variant);
    return false;
  }

  JsonHelpers::extractString(sensor_obj, "subzone_id", config.subzone_id, "");

  bool bool_value = true;
  if (JsonHelpers::extractBool(sensor_obj, "active", bool_value, true)) {
    config.active = bool_value;
  } else {
    config.active = true;
  }

  if (JsonHelpers::extractBool(sensor_obj, "raw_mode", bool_value, true)) {
    config.raw_mode = bool_value;
  } else {
    config.raw_mode = true;
  }

  if (!configManager.validateSensorConfig(config)) {
    String message = "Sensor validation failed for GPIO " + String(config.gpio);
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::VALIDATION_FAILED, message, failed_variant);
    return false;
  }

  if (!config.active) {
    if (!sensorManager.removeSensor(config.gpio)) {
      LOG_WARNING("Sensor removal requested, but no sensor on GPIO " + String(config.gpio));
    }
    if (!configManager.removeSensorConfig(config.gpio)) {
      String message = "Failed to remove sensor config from NVS for GPIO " + String(config.gpio);
      LOG_ERROR(message);
      ConfigResponseBuilder::publishError(
          ConfigType::SENSOR, ConfigErrorCode::NVS_WRITE_FAILED, message, failed_variant);
      return false;
    }
    LOG_INFO("Sensor removed: GPIO " + String(config.gpio));
    return true;
  }

  if (!sensorManager.configureSensor(config)) {
    String message = "Failed to configure sensor on GPIO " + String(config.gpio);
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::UNKNOWN_ERROR, message, failed_variant);
    return false;
  }

  if (!configManager.saveSensorConfig(config)) {
    String message = "Failed to save sensor config to NVS for GPIO " + String(config.gpio);
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::NVS_WRITE_FAILED, message, failed_variant);
    return false;
  }

  LOG_INFO("Sensor configured: GPIO " + String(config.gpio) + " (" + config.sensor_type + ")");
  return true;
}

void handleActuatorConfig(const String& payload) {
  LOG_INFO("Handling actuator configuration from MQTT");
  actuatorManager.handleActuatorConfig(payload);
}


