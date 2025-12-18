// ============================================
// INCLUDES
// ============================================
#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include "drivers/gpio_manager.h"
#include "utils/logger.h"
#include "services/config/storage_manager.h"
#include "services/config/config_manager.h"
#include "services/config/config_response.h"
#include "error_handling/error_tracker.h"
#include "error_handling/health_monitor.h"
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

// Phase 8: NTP Time Management
#include "utils/time_manager.h"

// ============================================
// CONSTANTS
// ============================================
// ✅ FIX #3+#4: LED pin for hardware safe-mode feedback
const uint8_t LED_PIN = 2;  // ESP32 onboard LED (GPIO2)

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
// HELPER FUNCTIONS
// ============================================
// Helper: Send Subzone ACK
void sendSubzoneAck(const String& subzone_id, const String& status, const String& error_message) {
  String ack_topic = TopicBuilder::buildSubzoneAckTopic();
  DynamicJsonDocument ack_doc(512);
  ack_doc["esp_id"] = g_system_config.esp_id;
  ack_doc["status"] = status;
  ack_doc["subzone_id"] = subzone_id;
  ack_doc["timestamp"] = millis() / 1000;
  
  if (status == "error" && error_message.length() > 0) {
    ack_doc["error_code"] = ERROR_SUBZONE_CONFIG_SAVE_FAILED;
    ack_doc["message"] = error_message;
  }
  
  String ack_payload;
  serializeJson(ack_doc, ack_payload);
  mqttClient.publish(ack_topic, ack_payload, 1);
}

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
  // STEP 2.3: WATCHDOG CONFIGURATION (CRITICAL!)
  // ============================================
  // Configure Watchdog to 30 seconds (no panic mode)
  // This prevents watchdog resets during:
  // - Factory Reset (10s button hold)
  // - Provisioning (10min timeout)
  // - Long-running operations
  esp_task_wdt_init(30, false);  // 30s timeout, don't panic
  esp_task_wdt_add(NULL);        // Add current task to watchdog
  Serial.println("✅ Watchdog configured: 30s timeout, no panic");

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
  // PHASE 2: BOOT-LOOP-DETECTION (Robustness + Overflow-Safe)
  // ═══════════════════════════════════════════════════
  // Calculate time since last boot (handles millis() overflow after 49.7 days)
  unsigned long now = millis();
  unsigned long time_since_last_boot = 0;

  if (g_system_config.last_boot_time > 0) {
    // Handle millis() overflow gracefully
    if (now >= g_system_config.last_boot_time) {
      time_since_last_boot = now - g_system_config.last_boot_time;
    } else {
      // Overflow occurred - treat as > 60s (boot is valid)
      time_since_last_boot = 60001;
    }
  } else {
    // First boot ever - treat as > 60s (boot is valid)
    time_since_last_boot = 60001;
  }

  // Increment boot counter and update timestamp
  g_system_config.boot_count++;
  g_system_config.last_boot_time = now;
  configManager.saveSystemConfig(g_system_config);

  LOG_INFO("Boot count: " + String(g_system_config.boot_count) +
           " (last boot " + String(time_since_last_boot / 1000) + "s ago)");

  // Boot-Loop-Detection: 5 boots in <60s triggers Safe-Mode
  if (g_system_config.boot_count > 5 && time_since_last_boot < 60000) {
    LOG_CRITICAL("╔════════════════════════════════════════╗");
    LOG_CRITICAL("║  BOOT LOOP DETECTED - SAFE MODE       ║");
    LOG_CRITICAL("╚════════════════════════════════════════╝");
    LOG_CRITICAL("Booted " + String(g_system_config.boot_count) + " times in <60s");
    LOG_CRITICAL("System entering Safe-Mode (no WiFi/MQTT)");
    LOG_CRITICAL("Reset required to exit Safe-Mode");

    // Enter Safe-Mode: Disable WiFi/MQTT, only Serial log available
    g_system_config.current_state = STATE_SAFE_MODE;
    g_system_config.safe_mode_reason = "Boot loop detected (" + String(g_system_config.boot_count) + " boots)";
    configManager.saveSystemConfig(g_system_config);

    // Infinite loop - only watchdog can reset
    while(true) {
      delay(1000);
      LOG_WARNING("SAFE MODE - Boot count: " + String(g_system_config.boot_count));
    }
  }

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
      // ✅ FIX #3: CRITICAL FAILURE - Hardware Safe-Mode
      LOG_CRITICAL("╔════════════════════════════════════════╗");
      LOG_CRITICAL("║  ❌ PROVISION MANAGER INIT FAILED     ║");
      LOG_CRITICAL("╚════════════════════════════════════════╝");
      LOG_CRITICAL("ProvisionManager.begin() returned false");
      LOG_CRITICAL("Possible causes:");
      LOG_CRITICAL("  1. Storage/NVS initialization failed");
      LOG_CRITICAL("  2. Memory allocation failed");
      LOG_CRITICAL("  3. Hardware issue");
      LOG_CRITICAL("");
      LOG_CRITICAL("Entering HARDWARE SAFE-MODE (LED blink pattern)");
      LOG_CRITICAL("Action: Check hardware, flash firmware again");

      // ✅ Fallback: Continuous LED blink (industrial-grade feedback)
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        // Blink pattern: 3× schnell (Error-Code)
        for (int i = 0; i < 3; i++) {
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);  // Pause between patterns
      }
      // ❌ NIEMALS return - ESP bleibt im Safe-Mode sichtbar!
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
        LOG_ERROR("ESP will enter Safe-Mode with active Provisioning");
        LOG_ERROR("Please check:");
        LOG_ERROR("  1. WiFi connection to ESP AP");
        LOG_ERROR("  2. God-Kaiser server status");
        LOG_ERROR("  3. Network connectivity");

        // ✅ FIX #1: provision_manager.cpp hat bereits enterSafeMode() gecallt!
        // → STATE_SAFE_MODE_PROVISIONING ist gesetzt
        // → AP-Mode bleibt aktiv, HTTP-Server läuft weiter
        // → setup() darf NICHT abbrechen, damit loop() laufen kann
        LOG_INFO("ProvisionManager.enterSafeMode() bereits ausgeführt");
        LOG_INFO("State: STATE_SAFE_MODE_PROVISIONING");
        LOG_INFO("AP-Mode bleibt aktiv - Warte auf Konfiguration...");

        // ✅ setup() läuft weiter OHNE WiFi/MQTT zu initialisieren
        // → loop() wird STATE_SAFE_MODE_PROVISIONING behandeln
      }
    } else {
      // ✅ FIX #4: CRITICAL FAILURE - Hardware Safe-Mode
      LOG_CRITICAL("╔════════════════════════════════════════╗");
      LOG_CRITICAL("║  ❌ AP-MODE START FAILED              ║");
      LOG_CRITICAL("╚════════════════════════════════════════╝");
      LOG_CRITICAL("ProvisionManager.startAPMode() returned false");
      LOG_CRITICAL("Possible causes:");
      LOG_CRITICAL("  1. WiFi hardware initialization failed");
      LOG_CRITICAL("  2. AP configuration invalid");
      LOG_CRITICAL("  3. Memory allocation failed");
      LOG_CRITICAL("  4. Hardware issue (WiFi chip)");
      LOG_CRITICAL("");
      LOG_CRITICAL("Entering HARDWARE SAFE-MODE (LED blink pattern)");
      LOG_CRITICAL("Action: Check hardware, flash firmware again");

      // ✅ Fallback: Continuous LED blink (industrial-grade feedback)
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        // Blink pattern: 4× schnell (Error-Code für AP-Mode-Fehler)
        for (int i = 0; i < 4; i++) {
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);  // Pause between patterns
      }
      // ❌ NIEMALS return - ESP bleibt im Safe-Mode sichtbar!
    }
  }

  // ═══════════════════════════════════════════════════
  // NORMAL FLOW: Config vorhanden
  // ═══════════════════════════════════════════════════

  // ✅ FIX #1: Skip WiFi/MQTT initialization when in provisioning safe-mode
  if (g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING) {
    LOG_INFO("╔════════════════════════════════════════╗");
    LOG_INFO("║  STATE_SAFE_MODE_PROVISIONING         ║");
    LOG_INFO("╚════════════════════════════════════════╝");
    LOG_INFO("Skipping WiFi/MQTT initialization");
    LOG_INFO("AP-Mode bleibt aktiv - HTTP-Server läuft");
    LOG_INFO("Warte auf Konfiguration via Provisioning-API...");
    LOG_INFO("setup() abgeschlossen - loop() wird provisionManager.loop() ausführen");
    return;  // ✅ ERLAUBT: setup() endet, aber loop() wird aufgerufen!
  }

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
    
    // Phase 9: Subzone management topics
    String subzone_assign_topic = TopicBuilder::buildSubzoneAssignTopic();
    String subzone_remove_topic = TopicBuilder::buildSubzoneRemoveTopic();
    mqttClient.subscribe(subzone_assign_topic);
    mqttClient.subscribe(subzone_remove_topic);
    
    LOG_INFO("Subscribed to system + actuator + zone assignment + subzone management topics");
    
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
      
      // ESP-specific emergency stop (with auth check)
      String esp_emergency_topic = String(TopicBuilder::buildActuatorEmergencyTopic());
      if (topic == esp_emergency_topic) {
        // Parse JSON payload for auth_token
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String command = doc["command"].as<String>();
          String auth_token = doc["auth_token"].as<String>();

          // Validate auth_token (load from NVS or use default: ESP-ID)
          String stored_token = storageManager.getStringObj("emergency_auth", g_system_config.esp_id);

          if (auth_token != stored_token) {
            LOG_ERROR("╔════════════════════════════════════════╗");
            LOG_ERROR("║  UNAUTHORIZED EMERGENCY-STOP ATTEMPT  ║");
            LOG_ERROR("╚════════════════════════════════════════╝");
            LOG_ERROR("Invalid auth_token for emergency command");
            mqttClient.publish(esp_emergency_topic + "/error",
                              "{\"error\":\"unauthorized\",\"message\":\"Invalid auth_token\"}");
            return;
          }

          if (command == "emergency_stop") {
            LOG_WARNING("╔════════════════════════════════════════╗");
            LOG_WARNING("║  AUTHORIZED EMERGENCY-STOP TRIGGERED  ║");
            LOG_WARNING("╚════════════════════════════════════════╝");
            safetyController.emergencyStopAll("ESP emergency command (authenticated)");
          } else if (command == "clear_emergency") {
            LOG_INFO("╔════════════════════════════════════════╗");
            LOG_INFO("║  AUTHORIZED EMERGENCY-CLEAR TRIGGERED ║");
            LOG_INFO("╚════════════════════════════════════════╝");
            bool success = safetyController.clearEmergencyStop();
            if (success) {
              safetyController.resumeOperation();
              mqttClient.publish(esp_emergency_topic + "/response",
                                "{\"status\":\"emergency_cleared\",\"timestamp\":" + String(millis()) + "}");
            } else {
              mqttClient.publish(esp_emergency_topic + "/error",
                                "{\"error\":\"clear_failed\",\"message\":\"Safety verification failed\"}");
            }
          }
        } else {
          LOG_ERROR("Failed to parse emergency command JSON");
        }
        return;
      }

      // Broadcast emergency (with auth check)
      String broadcast_emergency_topic = String(TopicBuilder::buildBroadcastEmergencyTopic());
      if (topic == broadcast_emergency_topic) {
        // Parse JSON payload for auth_token
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String auth_token = doc["auth_token"].as<String>();

          // Validate auth_token (broadcast uses God-Kaiser's master token)
          // For now, we accept any token for broadcast (God-Kaiser has authority)
          // TODO: Validate against God-Kaiser's master emergency token

          LOG_WARNING("╔════════════════════════════════════════╗");
          LOG_WARNING("║  BROADCAST EMERGENCY-STOP RECEIVED    ║");
          LOG_WARNING("╚════════════════════════════════════════╝");
          safetyController.emergencyStopAll("Broadcast emergency (God-Kaiser)");
        } else {
          LOG_ERROR("Failed to parse broadcast emergency JSON");
        }
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

          // Validate critical fields
          if (zone_id.length() == 0) {
            LOG_ERROR("Zone assignment failed: zone_id is empty");
            return;
          }

          // Kaiser_id optional (if empty, use default "god")
          if (kaiser_id.length() == 0) {
            LOG_WARNING("Kaiser_id empty, using default 'god'");
            kaiser_id = "god";
          }

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
            ack_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
            
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
                                   "\",\"status\":\"error\",\"ts\":" + String((unsigned long)timeManager.getUnixTimestamp()) +
                                   ",\"message\":\"Failed to save zone config\"}";
            mqttClient.publish(ack_topic, error_response);
          }
        } else {
          LOG_ERROR("Failed to parse zone assignment JSON");
        }
        return;
      }
      
      // Phase 9: Subzone Assignment Handler
      String subzone_assign_topic = TopicBuilder::buildSubzoneAssignTopic();
      if (topic == subzone_assign_topic) {
        LOG_INFO("╔════════════════════════════════════════╗");
        LOG_INFO("║  SUBZONE ASSIGNMENT RECEIVED          ║");
        LOG_INFO("╚════════════════════════════════════════╝");
        
        DynamicJsonDocument doc(1024);  // Größerer Buffer für GPIO-Array
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error) {
          String subzone_id = doc["subzone_id"].as<String>();
          String subzone_name = doc["subzone_name"].as<String>();
          String parent_zone_id = doc["parent_zone_id"].as<String>();
          JsonArray gpios_array = doc["assigned_gpios"];
          bool safe_mode_active = doc["safe_mode_active"] | true;
          
          // Validation 1: subzone_id required
          if (subzone_id.length() == 0) {
            LOG_ERROR("Subzone assignment failed: subzone_id is empty");
            sendSubzoneAck(subzone_id, "error", "subzone_id is required");
            return;
          }
          
          // Validation 2: parent_zone_id muss mit ESP-Zone übereinstimmen
          if (parent_zone_id.length() > 0 && parent_zone_id != g_kaiser.zone_id) {
            LOG_ERROR("Subzone assignment failed: parent_zone_id doesn't match ESP zone");
            sendSubzoneAck(subzone_id, "error", "parent_zone_id mismatch");
            return;
          }
          
          // Validation 3: Zone muss zugewiesen sein
          if (!g_kaiser.zone_assigned) {
            LOG_ERROR("Subzone assignment failed: ESP zone not assigned");
            sendSubzoneAck(subzone_id, "error", "ESP zone not assigned");
            return;
          }
          
          // Build SubzoneConfig
          SubzoneConfig subzone_config;
          subzone_config.subzone_id = subzone_id;
          subzone_config.subzone_name = subzone_name;
          subzone_config.parent_zone_id = parent_zone_id.length() > 0 ? parent_zone_id : g_kaiser.zone_id;
          subzone_config.safe_mode_active = safe_mode_active;
          subzone_config.created_timestamp = doc["timestamp"] | millis() / 1000;
          
          // Parse GPIO-Array
          for (JsonVariant gpio_value : gpios_array) {
            uint8_t gpio = gpio_value.as<uint8_t>();
            subzone_config.assigned_gpios.push_back(gpio);
          }
          
          // Validate config
          if (!configManager.validateSubzoneConfig(subzone_config)) {
            LOG_ERROR("Subzone assignment failed: validation failed");
            sendSubzoneAck(subzone_id, "error", "subzone config validation failed");
            return;
          }
          
          // Assign GPIOs to subzone via GPIO-Manager
          bool all_assigned = true;
          for (uint8_t gpio : subzone_config.assigned_gpios) {
            if (!gpioManager.assignPinToSubzone(gpio, subzone_id)) {
              LOG_ERROR("Failed to assign GPIO " + String(gpio) + " to subzone");
              all_assigned = false;
              // Rollback: Entferne bereits zugewiesene GPIOs
              for (uint8_t assigned_gpio : subzone_config.assigned_gpios) {
                if (assigned_gpio != gpio) {
                  gpioManager.removePinFromSubzone(assigned_gpio);
                }
              }
              break;
            }
          }
          
          if (!all_assigned) {
            sendSubzoneAck(subzone_id, "error", "GPIO assignment failed");
            return;
          }
          
          // Safe-Mode aktivieren wenn requested
          if (safe_mode_active) {
            if (!gpioManager.enableSafeModeForSubzone(subzone_id)) {
              LOG_WARNING("Failed to enable safe-mode for subzone, but assignment continues");
            }
          }
          
          // Save to NVS
          if (!configManager.saveSubzoneConfig(subzone_config)) {
            LOG_ERROR("Failed to save subzone config to NVS");
            sendSubzoneAck(subzone_id, "error", "NVS save failed");
            return;
          }
          
          // Calculate sensor/actuator counts
          subzone_config.sensor_count = 0;
          subzone_config.actuator_count = 0;
          // TODO: Iterate through sensors/actuators and count those with matching subzone_id
          
          // Success ACK
          sendSubzoneAck(subzone_id, "subzone_assigned", "");
          
          LOG_INFO("✅ Subzone assignment successful: " + subzone_id);
        } else {
          LOG_ERROR("Failed to parse subzone assignment JSON");
          sendSubzoneAck("", "error", "JSON parse failed");
        }
        return;
      }
      
      // Phase 9: Subzone Removal Handler
      String subzone_remove_topic = TopicBuilder::buildSubzoneRemoveTopic();
      if (topic == subzone_remove_topic) {
        LOG_INFO("╔════════════════════════════════════════╗");
        LOG_INFO("║  SUBZONE REMOVAL RECEIVED             ║");
        LOG_INFO("╚════════════════════════════════════════╝");
        
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error) {
          String subzone_id = doc["subzone_id"].as<String>();
          
          if (subzone_id.length() == 0) {
            LOG_ERROR("Subzone removal failed: subzone_id is empty");
            return;
          }
          
          // Load config to get GPIOs
          SubzoneConfig config;
          if (!configManager.loadSubzoneConfig(subzone_id, config)) {
            LOG_WARNING("Subzone " + subzone_id + " not found for removal");
            return;
          }
          
          // Remove GPIOs from subzone
          for (uint8_t gpio : config.assigned_gpios) {
            gpioManager.removePinFromSubzone(gpio);
          }
          
          // Remove from NVS
          configManager.removeSubzoneConfig(subzone_id);
          
          LOG_INFO("✅ Subzone removed: " + subzone_id);
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
  // STEP 10.5: PHASE 7 - HEALTH MONITOR
  // ============================================
  if (!healthMonitor.begin()) {
    LOG_ERROR("HealthMonitor initialization failed!");
    errorTracker.trackError(ERROR_SYSTEM_INIT_FAILED, ERROR_SEVERITY_ERROR,
                           "HealthMonitor begin() failed");
  } else {
    LOG_INFO("Health Monitor initialized");
    healthMonitor.setPublishInterval(60000);  // 60 seconds
    healthMonitor.setChangeDetectionEnabled(true);
  }
  
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

    // Phase 2: Configure measurement interval (5 seconds)
    sensorManager.setMeasurementInterval(5000);

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
  // ═══════════════════════════════════════════════════
  // ✅ FIX #1: STATE_SAFE_MODE_PROVISIONING HANDLING
  // ═══════════════════════════════════════════════════
  // ESP ist im Provisioning Safe-Mode (nach 3× Timeout)
  // → AP-Mode läuft, HTTP-Server wartet auf Konfiguration
  // → Keine WiFi/MQTT-Verbindung aktiv
  if (g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING) {
    // ProvisionManager.loop() für HTTP-Request-Handling
    provisionManager.loop();

    // ✅ CHECK: Wurde Konfiguration empfangen?
    if (g_wifi_config.configured && g_wifi_config.ssid.length() > 0) {
      // Config wurde via HTTP API empfangen und gespeichert!
      LOG_INFO("╔════════════════════════════════════════╗");
      LOG_INFO("║  ✅ KONFIGURATION EMPFANGEN!          ║");
      LOG_INFO("╚════════════════════════════════════════╝");
      LOG_INFO("WiFi SSID: " + g_wifi_config.ssid);
      LOG_INFO("Rebooting to apply configuration...");
      delay(2000);
      ESP.restart();  // ✅ Reboot → Normal-Flow startet
    }

    delay(10);  // Prevent watchdog issues
    return;     // ✅ Skip normal loop logic
  }

  // ═══════════════════════════════════════════════════
  // PHASE 2: BOOT-COUNTER RESET (After 60s stable operation)
  // ═══════════════════════════════════════════════════
  static bool boot_count_reset = false;
  if (!boot_count_reset && millis() > 60000 && g_system_config.boot_count > 1) {
    g_system_config.boot_count = 0;
    g_system_config.last_boot_time = 0;  // Reset timestamp too
    configManager.saveSystemConfig(g_system_config);
    boot_count_reset = true;
    LOG_INFO("Boot counter reset - stable operation confirmed");
  }

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
  // PHASE 7: HEALTH MONITORING (automatic via HealthMonitor)
  // ============================================
  healthMonitor.loop();  // Publishes automatically if needed
  
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


