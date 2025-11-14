#include "config_manager.h"
#include "storage_manager.h"
#include "../../utils/logger.h"
#include <WiFi.h>

// ============================================
// GLOBAL CONFIG MANAGER INSTANCE
// ============================================
ConfigManager& configManager = ConfigManager::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
ConfigManager& ConfigManager::getInstance() {
  static ConfigManager instance;
  return instance;
}

ConfigManager::ConfigManager()
  : wifi_config_loaded_(false),
    zone_config_loaded_(false),
    system_config_loaded_(false) {
}

// ============================================
// INITIALIZATION + ORCHESTRIERUNG (Guide-konform)
// ============================================
bool ConfigManager::begin() {
  wifi_config_loaded_ = false;
  zone_config_loaded_ = false;
  system_config_loaded_ = false;
  
  LOG_INFO("ConfigManager: Initialized (Phase 1 - WiFi/Zone/System only)");
  return true;
}

bool ConfigManager::loadAllConfigs() {
  LOG_INFO("ConfigManager: Loading Phase 1 configurations...");
  
  bool success = true;
  success &= loadWiFiConfig(wifi_config_);
  success &= loadZoneConfig(kaiser_, master_);
  success &= loadSystemConfig(system_config_);
  
  // Generate ESP ID if missing
  generateESPIdIfMissing();
  
  if (success) {
    LOG_INFO("ConfigManager: All Phase 1 configurations loaded successfully");
  } else {
    LOG_WARNING("ConfigManager: Some configurations failed to load");
  }
  
  return success;
}

// ============================================
// WIFI CONFIGURATION
// ============================================
bool ConfigManager::loadWiFiConfig(WiFiConfig& config) {
  if (!storageManager.beginNamespace("wifi_config", true)) {
    LOG_ERROR("ConfigManager: Failed to open wifi_config namespace");
    return false;
  }
  
  // Load WiFi settings
  config.ssid = storageManager.getStringObj("ssid", "");
  config.password = storageManager.getStringObj("password", "");
  
  // Load server settings
  config.server_address = storageManager.getStringObj("server_address", "192.168.0.198");
  config.mqtt_port = storageManager.getUInt16("mqtt_port", 8883);
  
  // Load credentials
  config.mqtt_username = storageManager.getStringObj("mqtt_username", "");
  config.mqtt_password = storageManager.getStringObj("mqtt_password", "");
  
  // Load status
  config.configured = storageManager.getBool("configured", false);
  
  storageManager.endNamespace();
  
  wifi_config_loaded_ = true;
  
  LOG_INFO("ConfigManager: WiFi config loaded - SSID: " + config.ssid + 
           ", Server: " + config.server_address);
  
  return true;
}

bool ConfigManager::saveWiFiConfig(const WiFiConfig& config) {
  LOG_INFO("ConfigManager: Saving WiFi configuration...");
  
  if (!validateWiFiConfig(config)) {
    LOG_ERROR("ConfigManager: WiFi config validation failed, not saving");
    return false;
  }
  
  if (!storageManager.beginNamespace("wifi_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open wifi_config namespace for writing");
    return false;
  }
  
  bool success = true;
  // Save WiFi settings
  success &= storageManager.putString("ssid", config.ssid);
  success &= storageManager.putString("password", config.password);
  
  // Save server settings
  success &= storageManager.putString("server_address", config.server_address);
  success &= storageManager.putUInt16("mqtt_port", config.mqtt_port);
  
  // Save credentials
  success &= storageManager.putString("mqtt_username", config.mqtt_username);
  success &= storageManager.putString("mqtt_password", config.mqtt_password);
  
  // Save status
  success &= storageManager.putBool("configured", config.configured);
  
  storageManager.endNamespace();
  
  if (success) {
    wifi_config_ = config;
    LOG_INFO("ConfigManager: WiFi configuration saved");
  } else {
    LOG_ERROR("ConfigManager: Failed to save WiFi configuration");
  }
  
  return success;
}

bool ConfigManager::validateWiFiConfig(const WiFiConfig& config) {
  // SSID must not be empty
  if (config.ssid.length() == 0) {
    LOG_WARNING("ConfigManager: WiFi SSID is empty");
    return false;
  }
  
  // Server address must not be empty
  if (config.server_address.length() == 0) {
    LOG_WARNING("ConfigManager: Server address is empty");
    return false;
  }
  
  // MQTT port must be in valid range
  if (config.mqtt_port == 0 || config.mqtt_port > 65535) {
    LOG_WARNING("ConfigManager: Invalid MQTT port: " + String(config.mqtt_port));
    return false;
  }
  
  return true;
}

void ConfigManager::resetWiFiConfig() {
  LOG_INFO("ConfigManager: Resetting WiFi configuration to defaults");
  
  if (!storageManager.beginNamespace("wifi_config", false)) {
    return;
  }
  
  storageManager.clearNamespace();
  storageManager.endNamespace();
  
  wifi_config_ = WiFiConfig();  // Reset to defaults
}

// ============================================
// ZONE CONFIGURATION
// ============================================
bool ConfigManager::loadZoneConfig(KaiserZone& kaiser, MasterZone& master) {
  LOG_INFO("ConfigManager: Loading Zone configuration...");
  
  if (!storageManager.beginNamespace("zone_config", true)) {
    LOG_ERROR("ConfigManager: Failed to open zone_config namespace");
    return false;
  }
  
  // Load Kaiser zone
  kaiser.kaiser_id = storageManager.getStringObj("kaiser_id", "");
  kaiser.kaiser_name = storageManager.getStringObj("kaiser_name", "");
  kaiser.connected = storageManager.getBool("connected", false);
  
  // Load Master zone
  master.master_zone_id = storageManager.getStringObj("master_zone_id", "");
  master.master_zone_name = storageManager.getStringObj("master_zone_name", "");
  master.is_master_esp = storageManager.getBool("is_master_esp", false);
  
  storageManager.endNamespace();
  
  zone_config_loaded_ = true;
  
  LOG_INFO("ConfigManager: Zone config loaded - Kaiser: " + kaiser.kaiser_id + 
           ", Master: " + master.master_zone_id);
  
  return true;
}

bool ConfigManager::saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master) {
  LOG_INFO("ConfigManager: Saving Zone configuration...");
  
  if (!storageManager.beginNamespace("zone_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open zone_config namespace for writing");
    return false;
  }
  
  bool success = true;
  // Save Kaiser zone
  success &= storageManager.putString("kaiser_id", kaiser.kaiser_id);
  success &= storageManager.putString("kaiser_name", kaiser.kaiser_name);
  success &= storageManager.putBool("connected", kaiser.connected);
  
  // Save Master zone
  success &= storageManager.putString("master_zone_id", master.master_zone_id);
  success &= storageManager.putString("master_zone_name", master.master_zone_name);
  success &= storageManager.putBool("is_master_esp", master.is_master_esp);
  
  storageManager.endNamespace();
  
  if (success) {
    kaiser_ = kaiser;
    master_ = master;
    LOG_INFO("ConfigManager: Zone configuration saved");
  } else {
    LOG_ERROR("ConfigManager: Failed to save Zone configuration");
  }
  
  return success;
}

bool ConfigManager::validateZoneConfig(const KaiserZone& kaiser) {
  // Kaiser ID should be set
  if (kaiser.kaiser_id.length() == 0) {
    LOG_WARNING("ConfigManager: Kaiser ID is empty");
    return false;
  }
  
  return true;
}

// ============================================
// SYSTEM CONFIGURATION (NEU für Phase 1)
// ============================================
bool ConfigManager::loadSystemConfig(SystemConfig& config) {
  LOG_INFO("ConfigManager: Loading System configuration...");
  
  if (!storageManager.beginNamespace("system_config", true)) {
    LOG_ERROR("ConfigManager: Failed to open system_config namespace");
    return false;
  }
  
  config.esp_id = storageManager.getStringObj("esp_id", "");
  config.device_name = storageManager.getStringObj("device_name", "ESP32");
  config.current_state = (SystemState)storageManager.getUInt8("current_state", STATE_BOOT);
  config.safe_mode_reason = storageManager.getStringObj("safe_mode_reason", "");
  config.boot_count = storageManager.getUInt16("boot_count", 0);
  
  storageManager.endNamespace();
  
  system_config_loaded_ = true;
  
  LOG_INFO("ConfigManager: System config loaded - ESP ID: " + config.esp_id);
  
  return true;
}

bool ConfigManager::saveSystemConfig(const SystemConfig& config) {
  LOG_INFO("ConfigManager: Saving System configuration...");
  
  if (!storageManager.beginNamespace("system_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open system_config namespace for writing");
    return false;
  }
  
  bool success = true;
  success &= storageManager.putString("esp_id", config.esp_id);
  success &= storageManager.putString("device_name", config.device_name);
  success &= storageManager.putUInt8("current_state", (uint8_t)config.current_state);
  success &= storageManager.putString("safe_mode_reason", config.safe_mode_reason);
  success &= storageManager.putUInt16("boot_count", config.boot_count);
  
  storageManager.endNamespace();
  
  if (success) {
    system_config_ = config;
    LOG_INFO("ConfigManager: System configuration saved");
  } else {
    LOG_ERROR("ConfigManager: Failed to save System configuration");
  }
  
  return success;
}

// ============================================
// CONFIGURATION STATUS (Guide-konform)
// ============================================
bool ConfigManager::isConfigurationComplete() const {
  return wifi_config_loaded_ && 
         zone_config_loaded_ && 
         system_config_loaded_ &&
         validateWiFiConfig(wifi_config_) &&
         validateZoneConfig(kaiser_);
}

void ConfigManager::printConfigurationStatus() const {
  LOG_INFO("=== Configuration Status (Phase 1) ===");
  LOG_INFO("WiFi Config: " + String(wifi_config_loaded_ ? "✅ Loaded" : "❌ Not loaded"));
  LOG_INFO("Zone Config: " + String(zone_config_loaded_ ? "✅ Loaded" : "❌ Not loaded"));
  LOG_INFO("System Config: " + String(system_config_loaded_ ? "✅ Loaded" : "❌ Not loaded"));
  LOG_INFO("Sensor/Actuator Config: ⚠️  Deferred to Phase 3 (Server-Centric)");
  LOG_INFO("Configuration Complete: " + String(isConfigurationComplete() ? "✅ YES" : "❌ NO"));
  LOG_INFO("======================================");
}

// ============================================
// HELPER METHODS
// ============================================
void ConfigManager::generateESPIdIfMissing() {
  if (system_config_.esp_id.length() == 0) {
    LOG_WARNING("ConfigManager: ESP ID not configured - generating from MAC address");
    
    WiFi.mode(WIFI_STA);  // Must be before macAddress()
    uint8_t mac[6];
    WiFi.macAddress(mac);
    
    char esp_id[32];
    snprintf(esp_id, sizeof(esp_id), "ESP_%02X%02X%02X", 
             mac[3], mac[4], mac[5]);
    
    system_config_.esp_id = String(esp_id);
    saveSystemConfig(system_config_);
    
    LOG_INFO("ConfigManager: Generated ESP ID: " + system_config_.esp_id);
  }
}
