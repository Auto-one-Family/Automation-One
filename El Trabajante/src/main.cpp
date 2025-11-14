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
  Serial.println("║  ESP32 Sensor Network v4.0 (Phase 1)  ║");
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
  LOG_INFO("");
  LOG_INFO("System ready for Phase 2 (Communication Layer)");
  
  // Print memory stats
  LOG_INFO("=== Memory Status ===");
  LOG_INFO("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_INFO("Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_INFO("Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_INFO("=====================");
  
  // ============================================
  // Future: PHASE 2+ modules will go here
  // ============================================
  // WiFiManager, MQTTClient, etc.
}

// ============================================
// LOOP - Phase 1 has no loop functionality yet
// ============================================
void loop() {
  // Phase 1 has no loop functionality
  // Phase 2+ will add WiFi/MQTT handling
  delay(1000);
}


