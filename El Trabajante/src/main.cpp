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

// Phase 6: Provisioning System
#include "services/provisioning/provision_manager.h"

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
  // STEP 2.5: BOOT-BUTTON FACTORY RESET CHECK (Before GPIO init!)
  // ============================================
  // Check if Boot button (GPIO 0) is pressed for Factory Reset
  // This MUST be before gpioManager.initializeAllPinsToSafeMode()
  const uint8_t BOOT_BUTTON_PIN = 0;  // GPIO 0 on ESP32
  const unsigned long HOLD_TIME_MS = 10000;  // 10 seconds
  
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    Serial.println("╔════════════════════════════════════════╗");
    Serial.println("║  ⚠️  BOOT BUTTON PRESSED              ║");
    Serial.println("║  Hold for 10 seconds for Factory Reset║");
    Serial.println("╚════════════════════════════════════════╝");
    
    unsigned long start_time = millis();
    bool held_for_10s = true;
    uint8_t last_second = 0;
    
    while (millis() - start_time < HOLD_TIME_MS) {
      if (digitalRead(BOOT_BUTTON_PIN) == HIGH) {
        held_for_10s = false;
        Serial.println("\nButton released - Factory Reset cancelled");
        break;
      }
      
      // Progress indicator (every second)
      uint8_t current_second = (millis() - start_time) / 1000;
      if (current_second > last_second) {
        Serial.print(".");
        last_second = current_second;
      }
      
      delay(100);
    }
    
    if (held_for_10s) {
      Serial.println("\n╔════════════════════════════════════════╗");
      Serial.println("║  🔥 FACTORY RESET TRIGGERED           ║");
      Serial.println("╚════════════════════════════════════════╝");
      
      // Initialize minimal systems for NVS access
      storageManager.begin();
      configManager.begin();
      
      // Clear WiFi config
      configManager.resetWiFiConfig();
      Serial.println("✅ WiFi configuration cleared");
      
      // Clear zone config
      KaiserZone kaiser;
      MasterZone master;
      configManager.saveZoneConfig(kaiser, master);
      Serial.println("✅ Zone configuration cleared");
      
      Serial.println("\n╔════════════════════════════════════════╗");
      Serial.println("║  ✅ FACTORY RESET COMPLETE            ║");
      Serial.println("╚════════════════════════════════════════╝");
      Serial.println("Rebooting in 2 seconds...");
      delay(2000);
      ESP.restart();
    }
  }
  
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
  
  // ═══════════════════════════════════════════════════
  // STEP 6.5: PROVISIONING CHECK (Phase 6)
  // ═══════════════════════════════════════════════════
  // Check if ESP needs provisioning (no config or empty SSID)
  if (!g_wifi_config.configured || g_wifi_config.ssid.length() == 0) {
    LOG_INFO("╔════════════════════════════════════════╗");
    LOG_INFO("║   NO CONFIG - STARTING PROVISIONING   ║");
    LOG_INFO("╚════════════════════════════════════════╝");
    LOG_INFO("ESP is not provisioned. Starting AP-Mode...");
    
    // Initialize Provision Manager
    if (!provisionManager.begin()) {
      LOG_ERROR("ProvisionManager initialization failed!");
      LOG_CRITICAL("Cannot provision ESP - check logs");
      return;  // Stop setup
    }
    
    // Start AP-Mode
    if (provisionManager.startAPMode()) {
      LOG_INFO("╔════════════════════════════════════════╗");
      LOG_INFO("║  ACCESS POINT MODE ACTIVE             ║");
      LOG_INFO("╚════════════════════════════════════════╝");
      LOG_INFO("Connect to: AutoOne-" + g_system_config.esp_id);
      LOG_INFO("Password: provision");
      LOG_INFO("Open browser: http://192.168.4.1");
      LOG_INFO("");
      LOG_INFO("Waiting for configuration (timeout: 10 minutes)...");
      
      // Block until config received (or timeout: 10 minutes)
      if (provisionManager.waitForConfig(600000)) {
        // ✅ SUCCESS: Config received
        LOG_INFO("╔════════════════════════════════════════╗");
        LOG_INFO("║  ✅ PROVISIONING SUCCESSFUL           ║");
        LOG_INFO("╚════════════════════════════════════════╝");
        LOG_INFO("Configuration saved to NVS");
        LOG_INFO("Rebooting in 2 seconds...");
        delay(2000);
        ESP.restart();  // Reboot to apply config
      } else {
        // ❌ TIMEOUT: No config received
        LOG_ERROR("╔════════════════════════════════════════╗");
        LOG_ERROR("║  ❌ PROVISIONING TIMEOUT              ║");
        LOG_ERROR("╚════════════════════════════════════════╝");
        LOG_ERROR("No configuration received within 10 minutes");
        LOG_ERROR("ESP will enter Safe-Mode");
        LOG_ERROR("Please check:");
        LOG_ERROR("  1. WiFi connection to ESP AP");
        LOG_ERROR("  2. God-Kaiser server status");
        LOG_ERROR("  3. Network connectivity");
        
        // Provisioning failed - stays in AP-Mode (handled by ProvisionManager)
        // User can still manually configure via HTTP API
        return;  // Stop setup - AP stays active
      }
    } else {
      // Failed to start AP-Mode
      LOG_CRITICAL("Failed to start AP-Mode!");
      LOG_CRITICAL("ESP cannot be provisioned - hardware issue?");
      return;  // Stop setup
    }
  }
  
  // ═══════════════════════════════════════════════════
  // NORMAL FLOW: Config vorhanden
  // ═══════════════════════════════════════════════════
  LOG_INFO("Configuration found - starting normal flow");
  
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
  // STEP 10: PHASE 2 - COMMUNICATION LAYER (with Circuit Breaker - Phase 6+)
  // ============================================
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║   Phase 2: Communication Layer         ║");
  LOG_INFO("║   (with Circuit Breaker Protection)    ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  // WiFi Manager (Circuit Breaker: 10 failures → 60s timeout)
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
  
  // MQTT Client (Circuit Breaker: 5 failures → 30s timeout)
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
    
    // Phase 7: Send initial heartbeat for ESP discovery/registration
    mqttClient.publishHeartbeat();
    LOG_INFO("Initial heartbeat sent for ESP registration");
    
    // Subscribe to critical topics
    String system_command_topic = TopicBuilder::buildSystemCommandTopic();
    String config_topic = TopicBuilder::buildConfigTopic();
    String broadcast_emergency_topic = TopicBuilder::buildBroadcastEmergencyTopic();
    String actuator_command_topic = TopicBuilder::buildActuatorCommandTopic(0);
    String actuator_command_wildcard = actuator_command_topic;
    actuator_command_wildcard.replace("/0/command", "/+/command");
    String esp_emergency_topic = TopicBuilder::buildActuatorEmergencyTopic();
    
    // Phase 7: Zone assignment topic
    String zone_assign_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/assign";
    if (g_kaiser.kaiser_id.length() == 0) {
      zone_assign_topic = "kaiser/god/esp/" + g_system_config.esp_id + "/zone/assign";
    }
    
    mqttClient.subscribe(system_command_topic);
    mqttClient.subscribe(config_topic);
    mqttClient.subscribe(broadcast_emergency_topic);
    mqttClient.subscribe(actuator_command_wildcard);
    mqttClient.subscribe(esp_emergency_topic);
    mqttClient.subscribe(zone_assign_topic);
    
    LOG_INFO("Subscribed to system + actuator + zone assignment topics");
    
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
      
      // System commands (factory reset, etc.)
      String system_command_topic = String(TopicBuilder::buildSystemCommandTopic());
      if (topic == system_command_topic) {
        // Parse JSON payload
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error) {
          String command = doc["command"].as<String>();
          bool confirm = doc["confirm"] | false;
          
          if (command == "factory_reset" && confirm) {
            LOG_WARNING("╔════════════════════════════════════════╗");
            LOG_WARNING("║  FACTORY RESET via MQTT               ║");
            LOG_WARNING("╚════════════════════════════════════════╝");
            
            // Acknowledge command
            String response = "{\"status\":\"factory_reset_initiated\",\"esp_id\":\"" + 
                            configManager.getESPId() + "\"}";
            mqttClient.publish(system_command_topic + "/response", response);
            
            // Clear configs
            configManager.resetWiFiConfig();
            KaiserZone kaiser;
            MasterZone master;
            configManager.saveZoneConfig(kaiser, master);
            
            LOG_INFO("✅ Configuration cleared via MQTT");
            LOG_INFO("Rebooting in 3 seconds...");
            delay(3000);
            ESP.restart();
          }
        }
        return;
      }
      
      // Phase 7: Zone Assignment Handler
      String zone_assign_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/assign";
      if (g_kaiser.kaiser_id.length() == 0) {
        zone_assign_topic = "kaiser/god/esp/" + g_system_config.esp_id + "/zone/assign";
      }
      
      if (topic == zone_assign_topic) {
        LOG_INFO("╔════════════════════════════════════════╗");
        LOG_INFO("║  ZONE ASSIGNMENT RECEIVED             ║");
        LOG_INFO("╚════════════════════════════════════════╝");
        
        // Parse JSON payload
        DynamicJsonDocument doc(512);
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error) {
          String zone_id = doc["zone_id"].as<String>();
          String master_zone_id = doc["master_zone_id"].as<String>();
          String zone_name = doc["zone_name"].as<String>();
          String kaiser_id = doc["kaiser_id"].as<String>();
          
          LOG_INFO("Zone ID: " + zone_id);
          LOG_INFO("Master Zone: " + master_zone_id);
          LOG_INFO("Zone Name: " + zone_name);
          LOG_INFO("Kaiser ID: " + kaiser_id);
          
          // Update zone configuration
          if (configManager.updateZoneAssignment(zone_id, master_zone_id, zone_name, kaiser_id)) {
            // Update global variables
            g_kaiser.zone_id = zone_id;
            g_kaiser.master_zone_id = master_zone_id;
            g_kaiser.zone_name = zone_name;
            g_kaiser.zone_assigned = true;
            if (kaiser_id.length() > 0) {
              g_kaiser.kaiser_id = kaiser_id;
              // Update TopicBuilder with new kaiser_id
              TopicBuilder::setKaiserId(kaiser_id.c_str());
            }
            
            // Send acknowledgment
            String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
            DynamicJsonDocument ack_doc(256);
            ack_doc["esp_id"] = g_system_config.esp_id;
            ack_doc["status"] = "zone_assigned";
            ack_doc["zone_id"] = zone_id;
            ack_doc["master_zone_id"] = master_zone_id;
            ack_doc["timestamp"] = millis();
            
            String ack_payload;
            serializeJson(ack_doc, ack_payload);
            mqttClient.publish(ack_topic, ack_payload);
            
            LOG_INFO("✅ Zone assignment successful");
            LOG_INFO("ESP is now part of zone: " + zone_id);
            
            // Update system state
            g_system_config.current_state = STATE_ZONE_CONFIGURED;
            configManager.saveSystemConfig(g_system_config);
            
            // Send updated heartbeat
            mqttClient.publishHeartbeat();
          } else {
            LOG_ERROR("❌ Failed to save zone configuration");
            
            // Send error acknowledgment
            String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
            String error_response = "{\"esp_id\":\"" + g_system_config.esp_id + 
                                   "\",\"status\":\"error\",\"message\":\"Failed to save zone config\"}";
            mqttClient.publish(ack_topic, error_response);
          }
        } else {
          LOG_ERROR("Failed to parse zone assignment JSON");
        }
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
  // Phase 2: Communication monitoring (with Circuit Breaker - Phase 6+)
  wifiManager.loop();      // Monitor WiFi connection (Circuit Breaker integrated)
  mqttClient.loop();       // Process MQTT messages + heartbeat (Circuit Breaker integrated)
  
  // Phase 4: Sensor measurements
  sensorManager.performAllMeasurements();

  // Phase 5: Actuator maintenance
  actuatorManager.processActuatorLoops();
  static unsigned long last_actuator_status = 0;
  if (millis() - last_actuator_status > 30000) {
    actuatorManager.publishAllActuatorStatus();
    last_actuator_status = millis();
  }
  
  // ============================================
  // PHASE 6+: SYSTEM HEALTH MONITORING (every 5 minutes)
  // ============================================
  static unsigned long last_health_check = 0;
  if (millis() - last_health_check >= 300000) {  // 5 minutes
    last_health_check = millis();
    
    LOG_INFO("=== System Health Check ===");
    LOG_INFO("WiFi Status: " + wifiManager.getConnectionStatus());
    LOG_INFO("MQTT Status: " + mqttClient.getConnectionStatus());
    LOG_INFO("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
    LOG_INFO("Uptime: " + String(millis() / 1000) + " seconds");
    LOG_INFO("==========================");
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


