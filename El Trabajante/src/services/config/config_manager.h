#ifndef SERVICES_CONFIG_CONFIG_MANAGER_H
#define SERVICES_CONFIG_CONFIG_MANAGER_H

#include <Arduino.h>
#include "../../models/system_types.h"
#include "../../models/sensor_types.h"
#include "../../models/actuator_types.h"

// ============================================
// CONFIG MANAGER CLASS (Phase 1 - Server-Centric)
// ============================================
class ConfigManager {
public:
  // Singleton Instance
  static ConfigManager& getInstance();
  
  // Initialization + Orchestrierung (Guide-konform)
  bool begin();
  bool loadAllConfigs();
  
  // WiFi Configuration
  bool loadWiFiConfig(WiFiConfig& config);
  bool saveWiFiConfig(const WiFiConfig& config);
  bool validateWiFiConfig(const WiFiConfig& config) const;
  void resetWiFiConfig();
  
  // Zone Configuration
  bool loadZoneConfig(KaiserZone& kaiser, MasterZone& master);
  bool saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master);
  bool validateZoneConfig(const KaiserZone& kaiser) const;
  
  // System Configuration (NEU für Phase 1)
  bool loadSystemConfig(SystemConfig& config);
  bool saveSystemConfig(const SystemConfig& config);
  
  // ============================================
  // SENSOR CONFIGURATION (PHASE 4)
  // ============================================
  // Save single sensor config
  bool saveSensorConfig(const SensorConfig& config);
  
  // Save array of sensor configs
  bool saveSensorConfig(const SensorConfig* sensors, uint8_t count);
  
  // Load all sensor configs
  bool loadSensorConfig(SensorConfig sensors[], uint8_t max_sensors, uint8_t& loaded_count);
  
  // Remove sensor config
  bool removeSensorConfig(uint8_t gpio);
  
  // Validate sensor config
  bool validateSensorConfig(const SensorConfig& config) const;
  
  // Actuator configuration (Phase 5+)
  bool loadActuatorConfig(ActuatorConfig actuators[], uint8_t max_actuators, uint8_t& loaded_count);
  bool saveActuatorConfig(const ActuatorConfig actuators[], uint8_t actuator_count);
  bool validateActuatorConfig(const ActuatorConfig& config) const;
  
  // Configuration Status (Guide-konform)
  bool isConfigurationComplete() const;
  void printConfigurationStatus() const;
  
  // Accessors (cached in memory)
  const WiFiConfig& getWiFiConfig() const { return wifi_config_; }
  const KaiserZone& getKaiser() const { return kaiser_; }
  const MasterZone& getMasterZone() const { return master_; }
  const SystemConfig& getSystemConfig() const { return system_config_; }
  
  // Quick Access (cached values for TopicBuilder)
  String getKaiserId() const { return kaiser_.kaiser_id; }
  String getESPId() const { return system_config_.esp_id; }
  
private:
  ConfigManager();  // Private Constructor (Singleton)
  ~ConfigManager() = default;
  ConfigManager(const ConfigManager&) = delete;
  ConfigManager& operator=(const ConfigManager&) = delete;
  
  // Cached configurations (Phase 1 only)
  WiFiConfig wifi_config_;
  KaiserZone kaiser_;
  MasterZone master_;
  SystemConfig system_config_;
  
  // Status flags
  bool wifi_config_loaded_;
  bool zone_config_loaded_;
  bool system_config_loaded_;
  
  // Helper Methods
  void generateESPIdIfMissing();
};

// ============================================
// GLOBAL CONFIG MANAGER INSTANCE
// ============================================
extern ConfigManager& configManager;

#endif
