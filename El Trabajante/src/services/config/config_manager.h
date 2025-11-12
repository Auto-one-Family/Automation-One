#ifndef SERVICES_CONFIG_CONFIG_MANAGER_H
#define SERVICES_CONFIG_CONFIG_MANAGER_H

#include <Arduino.h>
#include "../../models/sensor_types.h"
#include "../../models/actuator_types.h"
#include "../../models/system_types.h"

// ConfigManager - Orchestrierung aller System-Konfigurationen
class ConfigManager {
public:
  // Singleton Instance
  static ConfigManager& getInstance();
  
  // WiFi Configuration
  bool loadWiFiConfig(WiFiConfig& config);
  bool saveWiFiConfig(const WiFiConfig& config);
  void resetWiFiConfig();
  
  // Zone Configuration
  bool loadZoneConfig(KaiserZone& kaiser, MasterZone& master);
  bool saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master);
  
  // Sensor Configuration
  bool loadSensorConfig(SensorConfig sensors[], uint8_t max_sensors, uint8_t& loaded_count);
  bool saveSensorConfig(const SensorConfig sensors[], uint8_t sensor_count);
  
  // Actuator Configuration
  bool loadActuatorConfig(ActuatorConfig actuators[], uint8_t max_actuators, uint8_t& loaded_count);
  bool saveActuatorConfig(const ActuatorConfig actuators[], uint8_t actuator_count);
  
  // System Configuration
  bool loadSystemState(SystemState& state);
  bool saveSystemState(SystemState state);
  
  // Utilities
  bool isConfigurationComplete() const;
  void printConfigurationStatus() const;
  bool backupConfiguration();
  bool restoreConfiguration();
  
  // Quick Access (cached values)
  String getKaiserId() const { return _kaiser_id; }
  String getESPId() const { return _esp_id; }
  
private:
  ConfigManager();  // Private Constructor (Singleton)
  
  // Cached Values
  String _kaiser_id = "";
  String _esp_id = "";
  bool _config_loaded = false;
  
  // Helper Methods
  void _generateESPId();
  bool _loadKaiserId();
};

// Global ConfigManager Instance
extern ConfigManager& configManager;

#endif
