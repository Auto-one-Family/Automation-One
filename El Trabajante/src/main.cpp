// ============================================
// INCLUDES
// ============================================
#include <Arduino.h>
#include "drivers/gpio_manager.h"
#include "utils/logger.h"
#include "services/config/storage_manager.h"
#include "services/config/config_manager.h"
#include "error_handling/error_tracker.h"
#include "utils/topic_builder.h"
#include "models/system_types.h"
#include "services/communication/wifi_manager.h"
#include "services/communication/mqtt_client.h"

// Phase 3: Hardware Abstraction Layer
#include "drivers/i2c_bus.h"
#include "drivers/onewire_bus.h"
#include "drivers/pwm_controller.h"

// ============================================
// GLOBAL VARIABLES
// ============================================
SystemConfig g_system_config;
WiFiConfig g_wifi_config;
KaiserZone g_kaiser;
MasterZone g_master;

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
    String emergency_topic = TopicBuilder::buildBroadcastEmergencyTopic();
    
    mqttClient.subscribe(system_command_topic);
    mqttClient.subscribe(config_topic);
    mqttClient.subscribe(emergency_topic);
    
    LOG_INFO("Subscribed to system topics");
    
    // Set MQTT callback for message routing (placeholder for Phase 4)
    mqttClient.setCallback([](const String& topic, const String& payload) {
      LOG_INFO("MQTT message received: " + topic);
      LOG_DEBUG("Payload: " + payload);
      // Message routing will be implemented in Phase 4
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
}

// ============================================
// LOOP - Phase 2 Communication Monitoring
// ============================================
void loop() {
  // Phase 2: Communication monitoring
  wifiManager.loop();      // Monitor WiFi connection
  mqttClient.loop();       // Process MQTT messages + heartbeat
  
  delay(10);  // Small delay to prevent watchdog issues
}


