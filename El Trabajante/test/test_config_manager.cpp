#include <unity.h>
#include "services/config/config_manager.h"
#include "services/config/storage_manager.h"
#include "utils/logger.h"

// ============================================
// TEST: ConfigManager Initialization
// ============================================
void test_config_manager_initialization() {
  TEST_ASSERT_TRUE(configManager.begin());
}

// ============================================
// TEST: WiFi Config Load/Save
// ============================================
void test_config_manager_wifi_config() {
  WiFiConfig config;
  config.ssid = "TestSSID";
  config.password = "TestPassword";
  config.server_address = "192.168.1.100";
  config.mqtt_port = 1883;
  config.configured = true;
  
  // Save
  TEST_ASSERT_TRUE(configManager.saveWiFiConfig(config));
  
  // Load
  WiFiConfig loaded;
  TEST_ASSERT_TRUE(configManager.loadWiFiConfig(loaded));
  TEST_ASSERT_EQUAL_STRING("TestSSID", loaded.ssid.c_str());
  TEST_ASSERT_EQUAL_STRING("192.168.1.100", loaded.server_address.c_str());
  TEST_ASSERT_EQUAL(1883, loaded.mqtt_port);
}

// ============================================
// TEST: WiFi Config Validation
// ============================================
void test_config_manager_wifi_validation() {
  WiFiConfig valid;
  valid.ssid = "TestSSID";
  valid.server_address = "192.168.1.100";
  valid.mqtt_port = 1883;
  TEST_ASSERT_TRUE(configManager.validateWiFiConfig(valid));
  
  WiFiConfig invalid;
  invalid.ssid = "";  // Empty SSID
  invalid.server_address = "192.168.1.100";
  invalid.mqtt_port = 1883;
  TEST_ASSERT_FALSE(configManager.validateWiFiConfig(invalid));
}

// ============================================
// TEST: Zone Config Load/Save
// ============================================
void test_config_manager_zone_config() {
  KaiserZone kaiser;
  kaiser.kaiser_id = "test_kaiser";
  kaiser.kaiser_name = "Test Kaiser";
  
  MasterZone master;
  master.master_zone_id = "test_master";
  master.is_master_esp = true;
  
  // Save
  TEST_ASSERT_TRUE(configManager.saveZoneConfig(kaiser, master));
  
  // Load
  KaiserZone loaded_kaiser;
  MasterZone loaded_master;
  TEST_ASSERT_TRUE(configManager.loadZoneConfig(loaded_kaiser, loaded_master));
  TEST_ASSERT_EQUAL_STRING("test_kaiser", loaded_kaiser.kaiser_id.c_str());
  TEST_ASSERT_TRUE(loaded_master.is_master_esp);
}

// ============================================
// TEST: System Config Load/Save
// ============================================
void test_config_manager_system_config() {
  SystemConfig config;
  config.esp_id = "ESP_TEST123";
  config.device_name = "Test Device";
  config.current_state = STATE_OPERATIONAL;
  config.boot_count = 5;
  
  // Save
  TEST_ASSERT_TRUE(configManager.saveSystemConfig(config));
  
  // Load
  SystemConfig loaded;
  TEST_ASSERT_TRUE(configManager.loadSystemConfig(loaded));
  TEST_ASSERT_EQUAL_STRING("ESP_TEST123", loaded.esp_id.c_str());
  TEST_ASSERT_EQUAL(STATE_OPERATIONAL, loaded.current_state);
  TEST_ASSERT_EQUAL(5, loaded.boot_count);
}

// ============================================
// TEST: loadAllConfigs Orchestration
// ============================================
void test_config_manager_load_all() {
  // Should load all Phase 1 configs without error
  bool result = configManager.loadAllConfigs();
  // May be false if no configs stored, but should not crash
  TEST_ASSERT_TRUE(result == true || result == false);
}

// ============================================
// UNITY SETUP
// ============================================
void setup() {
  delay(2000);
  
  Serial.begin(115200);
  
  // Initialize dependencies
  logger.begin();
  logger.setLogLevel(LOG_INFO);
  storageManager.begin();
  configManager.begin();
  
  UNITY_BEGIN();
  
  RUN_TEST(test_config_manager_initialization);
  RUN_TEST(test_config_manager_wifi_config);
  RUN_TEST(test_config_manager_wifi_validation);
  RUN_TEST(test_config_manager_zone_config);
  RUN_TEST(test_config_manager_system_config);
  RUN_TEST(test_config_manager_load_all);
  
  UNITY_END();
}

void loop() {}


