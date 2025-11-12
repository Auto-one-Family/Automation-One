#include "config_manager.h"
#include "storage_manager.h"
#include "../../utils/logger.h"
#include <WiFi.h>

// Global ConfigManager Instance
ConfigManager& configManager = ConfigManager::getInstance();

// Singleton
ConfigManager& ConfigManager::getInstance() {
  static ConfigManager instance;
  return instance;
}

ConfigManager::ConfigManager() {
  _generateESPId();
  _loadKaiserId();
}

// WiFi Configuration
bool ConfigManager::loadWiFiConfig(WiFiConfig& config) {
  if (!storageManager.beginNamespace("wifi_config", true)) {
    return false;
  }
  
  storageManager.getString("ssid", config.ssid);
  storageManager.getString("password", config.password);
  storageManager.getString("server_address", config.server_address);
  storageManager.getUInt16("mqtt_port", config.mqtt_port, 8883);
  storageManager.getString("mqtt_username", config.mqtt_username);
  storageManager.getString("mqtt_password", config.mqtt_password);
  
  storageManager.endNamespace();
  
  LOG_INFO("ConfigManager: WiFi Config loaded");
  return true;
}

bool ConfigManager::saveWiFiConfig(const WiFiConfig& config) {
  if (!storageManager.beginNamespace("wifi_config", false)) {
    return false;
  }
  
  bool success = true;
  success &= storageManager.setString("ssid", config.ssid);
  success &= storageManager.setString("password", config.password);
  success &= storageManager.setString("server_address", config.server_address);
  success &= storageManager.setUInt16("mqtt_port", config.mqtt_port);
  success &= storageManager.setString("mqtt_username", config.mqtt_username);
  success &= storageManager.setString("mqtt_password", config.mqtt_password);
  
  storageManager.endNamespace();
  
  if (success) {
    LOG_INFO("ConfigManager: WiFi Config saved");
  } else {
    LOG_ERROR("ConfigManager: Failed to save WiFi Config");
  }
  
  return success;
}

void ConfigManager::resetWiFiConfig() {
  storageManager.clearNamespace("wifi_config");
  LOG_INFO("ConfigManager: WiFi Config reset");
}

// Zone Configuration
bool ConfigManager::loadZoneConfig(KaiserZone& kaiser, MasterZone& master) {
  if (!storageManager.beginNamespace("zone_config", true)) {
    return false;
  }
  
  storageManager.getString("kaiser_id", kaiser.kaiser_id);
  storageManager.getString("kaiser_name", kaiser.kaiser_name);
  storageManager.getBool("connected", kaiser.connected);
  
  storageManager.getString("master_zone_id", master.master_zone_id);
  storageManager.getString("master_zone_name", master.master_zone_name);
  storageManager.getBool("is_master_esp", master.is_master_esp);
  
  storageManager.endNamespace();
  
  // Cache Kaiser ID
  _kaiser_id = kaiser.kaiser_id;
  
  LOG_INFO("ConfigManager: Zone Config loaded (Kaiser: " + kaiser.kaiser_id + ")");
  return true;
}

bool ConfigManager::saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master) {
  if (!storageManager.beginNamespace("zone_config", false)) {
    return false;
  }
  
  bool success = true;
  success &= storageManager.setString("kaiser_id", kaiser.kaiser_id);
  success &= storageManager.setString("kaiser_name", kaiser.kaiser_name);
  success &= storageManager.setBool("connected", kaiser.connected);
  
  success &= storageManager.setString("master_zone_id", master.master_zone_id);
  success &= storageManager.setString("master_zone_name", master.master_zone_name);
  success &= storageManager.setBool("is_master_esp", master.is_master_esp);
  
  storageManager.endNamespace();
  
  // Update Cache
  _kaiser_id = kaiser.kaiser_id;
  
  if (success) {
    LOG_INFO("ConfigManager: Zone Config saved");
  } else {
    LOG_ERROR("ConfigManager: Failed to save Zone Config");
  }
  
  return success;
}

// Sensor Configuration
bool ConfigManager::loadSensorConfig(SensorConfig sensors[], uint8_t max_sensors, uint8_t& loaded_count) {
  if (!storageManager.beginNamespace("sensor_config", true)) {
    return false;
  }
  
  storageManager.getUInt8("sensor_count", loaded_count, 0);
  
  for (uint8_t i = 0; i < loaded_count && i < max_sensors; i++) {
    String prefix = "sensor_" + String(i) + "_";
    
    storageManager.getUInt8(prefix + "gpio", sensors[i].gpio);
    storageManager.getString(prefix + "type", sensors[i].sensor_type);
    storageManager.getString(prefix + "name", sensors[i].sensor_name);
    storageManager.getString(prefix + "subzone", sensors[i].subzone_id);
    storageManager.getBool(prefix + "active", sensors[i].active);
    
    // ✅ Pi-Enhanced Mode: raw_mode ist immer true
    sensors[i].raw_mode = true;
  }
  
  storageManager.endNamespace();
  
  LOG_INFO("ConfigManager: Loaded " + String(loaded_count) + " sensors");
  return true;
}

bool ConfigManager::saveSensorConfig(const SensorConfig sensors[], uint8_t sensor_count) {
  if (!storageManager.beginNamespace("sensor_config", false)) {
    return false;
  }
  
  bool success = storageManager.setUInt8("sensor_count", sensor_count);
  
  for (uint8_t i = 0; i < sensor_count; i++) {
    String prefix = "sensor_" + String(i) + "_";
    
    success &= storageManager.setUInt8(prefix + "gpio", sensors[i].gpio);
    success &= storageManager.setString(prefix + "type", sensors[i].sensor_type);
    success &= storageManager.setString(prefix + "name", sensors[i].sensor_name);
    success &= storageManager.setString(prefix + "subzone", sensors[i].subzone_id);
    success &= storageManager.setBool(prefix + "active", sensors[i].active);
  }
  
  storageManager.endNamespace();
  
  if (success) {
    LOG_INFO("ConfigManager: Saved " + String(sensor_count) + " sensors");
  } else {
    LOG_ERROR("ConfigManager: Failed to save sensors");
  }
  
  return success;
}

// Actuator Configuration
bool ConfigManager::loadActuatorConfig(ActuatorConfig actuators[], uint8_t max_actuators, uint8_t& loaded_count) {
  if (!storageManager.beginNamespace("actuator_config", true)) {
    return false;
  }
  
  storageManager.getUInt8("actuator_count", loaded_count, 0);
  
  for (uint8_t i = 0; i < loaded_count && i < max_actuators; i++) {
    String prefix = "actuator_" + String(i) + "_";
    
    storageManager.getUInt8(prefix + "gpio", actuators[i].gpio);
    storageManager.getString(prefix + "type", actuators[i].actuator_type);
    storageManager.getString(prefix + "name", actuators[i].actuator_name);
    storageManager.getString(prefix + "subzone", actuators[i].subzone_id);
    storageManager.getBool(prefix + "active", actuators[i].active);
  }
  
  storageManager.endNamespace();
  
  LOG_INFO("ConfigManager: Loaded " + String(loaded_count) + " actuators");
  return true;
}

bool ConfigManager::saveActuatorConfig(const ActuatorConfig actuators[], uint8_t actuator_count) {
  if (!storageManager.beginNamespace("actuator_config", false)) {
    return false;
  }
  
  bool success = storageManager.setUInt8("actuator_count", actuator_count);
  
  for (uint8_t i = 0; i < actuator_count; i++) {
    String prefix = "actuator_" + String(i) + "_";
    
    success &= storageManager.setUInt8(prefix + "gpio", actuators[i].gpio);
    success &= storageManager.setString(prefix + "type", actuators[i].actuator_type);
    success &= storageManager.setString(prefix + "name", actuators[i].actuator_name);
    success &= storageManager.setString(prefix + "subzone", actuators[i].subzone_id);
    success &= storageManager.setBool(prefix + "active", actuators[i].active);
  }
  
  storageManager.endNamespace();
  
  if (success) {
    LOG_INFO("ConfigManager: Saved " + String(actuator_count) + " actuators");
  } else {
    LOG_ERROR("ConfigManager: Failed to save actuators");
  }
  
  return success;
}

// System State
bool ConfigManager::loadSystemState(SystemState& state) {
  if (!storageManager.beginNamespace("system_config", true)) {
    return false;
  }
  
  uint8_t state_int;
  storageManager.getUInt8("current_state", state_int, STATE_BOOT);
  state = (SystemState)state_int;
  
  storageManager.endNamespace();
  
  return true;
}

bool ConfigManager::saveSystemState(SystemState state) {
  if (!storageManager.beginNamespace("system_config", false)) {
    return false;
  }
  
  bool success = storageManager.setUInt8("current_state", (uint8_t)state);
  
  storageManager.endNamespace();
  
  return success;
}

// Utilities
bool ConfigManager::isConfigurationComplete() const {
  WiFiConfig wifi;
  KaiserZone kaiser;
  MasterZone master;
  
  // Check WiFi Config
  if (!const_cast<ConfigManager*>(this)->loadWiFiConfig(wifi)) {
    return false;
  }
  if (wifi.ssid.length() == 0) {
    return false;
  }
  
  // Check Zone Config
  if (!const_cast<ConfigManager*>(this)->loadZoneConfig(kaiser, master)) {
    return false;
  }
  if (kaiser.kaiser_id.length() == 0) {
    return false;
  }
  
  return true;
}

void ConfigManager::printConfigurationStatus() const {
  LOG_INFO("=== Configuration Status ===");
  LOG_INFO("ESP ID: " + _esp_id);
  LOG_INFO("Kaiser ID: " + _kaiser_id);
  LOG_INFO("Config Complete: " + String(isConfigurationComplete() ? "YES" : "NO"));
}

bool ConfigManager::backupConfiguration() {
  // TODO: Implement backup to separate namespace
  LOG_WARNING("ConfigManager: backupConfiguration() not implemented yet");
  return false;
}

bool ConfigManager::restoreConfiguration() {
  // TODO: Implement restore from backup namespace
  LOG_WARNING("ConfigManager: restoreConfiguration() not implemented yet");
  return false;
}

// Helper Methods
void ConfigManager::_generateESPId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  
  char mac_str[18];
  snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X",
          mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  
  _esp_id = String(mac_str);
  
  LOG_INFO("ConfigManager: Generated ESP ID: " + _esp_id);
}

bool ConfigManager::_loadKaiserId() {
  if (!storageManager.beginNamespace("zone_config", true)) {
    return false;
  }
  
  storageManager.getString("kaiser_id", _kaiser_id);
  
  storageManager.endNamespace();
  
  return _kaiser_id.length() > 0;
}

