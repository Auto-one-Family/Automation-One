#include "config_manager.h"
#include "storage_manager.h"
#include "../../utils/logger.h"
#include "../../drivers/gpio_manager.h"
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
  // ============================================
  // WOKWI SIMULATION MODE: Use compile-time credentials
  // ============================================
  #ifdef WOKWI_SIMULATION
    LOG_INFO("ConfigManager: WOKWI_SIMULATION mode - using compile-time credentials");

    // WiFi credentials (Wokwi-GUEST is open network in Wokwi simulator)
    #ifdef WOKWI_WIFI_SSID
      config.ssid = WOKWI_WIFI_SSID;
    #else
      config.ssid = "Wokwi-GUEST";
    #endif

    #ifdef WOKWI_WIFI_PASSWORD
      config.password = WOKWI_WIFI_PASSWORD;
    #else
      config.password = "";
    #endif

    // MQTT broker (host.wokwi.internal routes to localhost or CI service)
    #ifdef WOKWI_MQTT_HOST
      config.server_address = WOKWI_MQTT_HOST;
    #else
      config.server_address = "host.wokwi.internal";
    #endif

    #ifdef WOKWI_MQTT_PORT
      config.mqtt_port = WOKWI_MQTT_PORT;
    #else
      config.mqtt_port = 1883;
    #endif

    // Anonymous MQTT mode for Wokwi
    config.mqtt_username = "";
    config.mqtt_password = "";
    config.configured = true;

    wifi_config_loaded_ = true;

    LOG_INFO("ConfigManager: Wokwi WiFi config - SSID: " + config.ssid +
             ", MQTT: " + config.server_address + ":" + String(config.mqtt_port));

    return true;
  #endif

  // ============================================
  // NORMAL MODE: Load from NVS
  // ============================================
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

bool ConfigManager::validateWiFiConfig(const WiFiConfig& config) const {
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
  
  // Load Hierarchical Zone Info (Phase 7: Dynamic Zones)
  kaiser.zone_id = storageManager.getStringObj("zone_id", "");
  kaiser.master_zone_id = storageManager.getStringObj("master_zone_id", "");
  kaiser.zone_name = storageManager.getStringObj("zone_name", "");
  kaiser.zone_assigned = storageManager.getBool("zone_assigned", false);
  
  // Load Kaiser zone (Existing)
  // Default to "god" if not set (required for MQTT topics)
  kaiser.kaiser_id = storageManager.getStringObj("kaiser_id", "god");
  kaiser.kaiser_name = storageManager.getStringObj("kaiser_name", "");
  kaiser.connected = storageManager.getBool("connected", false);
  kaiser.id_generated = storageManager.getBool("id_generated", false);
  
  // Load Master zone (Legacy - kept for compatibility)
  master.master_zone_id = storageManager.getStringObj("legacy_master_zone_id", "");
  master.master_zone_name = storageManager.getStringObj("legacy_master_zone_name", "");
  master.is_master_esp = storageManager.getBool("is_master_esp", false);
  
  storageManager.endNamespace();
  
  zone_config_loaded_ = true;
  
  LOG_INFO("ConfigManager: Zone config loaded - Zone: " + kaiser.zone_id + 
           ", Master: " + kaiser.master_zone_id + 
           ", Kaiser: " + kaiser.kaiser_id);
  
  return true;
}

bool ConfigManager::saveZoneConfig(const KaiserZone& kaiser, const MasterZone& master) {
  LOG_INFO("ConfigManager: Saving Zone configuration...");
  
  if (!storageManager.beginNamespace("zone_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open zone_config namespace for writing");
    return false;
  }
  
  bool success = true;
  // Save Hierarchical Zone Info (Phase 7: Dynamic Zones)
  success &= storageManager.putString("zone_id", kaiser.zone_id);
  success &= storageManager.putString("master_zone_id", kaiser.master_zone_id);
  success &= storageManager.putString("zone_name", kaiser.zone_name);
  success &= storageManager.putBool("zone_assigned", kaiser.zone_assigned);
  
  // Save Kaiser zone (Existing)
  success &= storageManager.putString("kaiser_id", kaiser.kaiser_id);
  success &= storageManager.putString("kaiser_name", kaiser.kaiser_name);
  success &= storageManager.putBool("connected", kaiser.connected);
  success &= storageManager.putBool("id_generated", kaiser.id_generated);
  
  // Save Master zone (Legacy - kept for compatibility)
  success &= storageManager.putString("legacy_master_zone_id", master.master_zone_id);
  success &= storageManager.putString("legacy_master_zone_name", master.master_zone_name);
  success &= storageManager.putBool("is_master_esp", master.is_master_esp);
  
  storageManager.endNamespace();
  
  if (success) {
    kaiser_ = kaiser;
    master_ = master;
    LOG_INFO("ConfigManager: Zone configuration saved (Zone: " + 
             kaiser.zone_id + ", Master: " + kaiser.master_zone_id + ")");
  } else {
    LOG_ERROR("ConfigManager: Failed to save Zone configuration");
  }
  
  return success;
}

/**
 * Validate zone configuration.
 *
 * Checks:
 * - kaiser_id must be set and non-empty
 * - kaiser_id length must be within limits (1-63 chars, MQTT topic limit)
 * - If zone is assigned, zone_id must be set
 *
 * NOTE: Does NOT validate zone_id format (server-side responsibility)
 */
bool ConfigManager::validateZoneConfig(const KaiserZone& kaiser) const {
  // Kaiser ID required
  if (kaiser.kaiser_id.length() == 0) {
    LOG_WARNING("ConfigManager: Kaiser ID is empty");
    return false;
  }

  // Kaiser ID length check (MQTT topic limit)
  if (kaiser.kaiser_id.length() > 63) {
    LOG_WARNING("ConfigManager: Kaiser ID too long (max 63 chars)");
    return false;
  }

  // If zone assigned, zone_id must be set
  if (kaiser.zone_assigned && kaiser.zone_id.length() == 0) {
    LOG_WARNING("ConfigManager: Zone assigned but zone_id is empty");
    return false;
  }

  return true;
}

/**
 * Update zone assignment for this ESP.
 *
 * ARCHITECTURE NOTES:
 * - Multiple ESPs can be assigned to the same zone_id
 * - SubZones are assigned at sensor/actuator level, not ESP level
 * - Kaiser_id identifies the parent Kaiser device (default: "god")
 *
 * @param zone_id Primary zone identifier (e.g., "greenhouse_zone_1")
 * @param master_zone_id Parent zone for hierarchy (e.g., "greenhouse")
 * @param zone_name Human-readable zone name
 * @param kaiser_id ID of Kaiser managing this ESP (default: "god")
 * @return true if zone assignment updated successfully
 */
bool ConfigManager::updateZoneAssignment(const String& zone_id, const String& master_zone_id,
                                        const String& zone_name, const String& kaiser_id) {
  LOG_INFO("ConfigManager: Updating zone assignment...");
  LOG_INFO("  Zone ID: " + zone_id);
  LOG_INFO("  Master Zone: " + master_zone_id);
  LOG_INFO("  Zone Name: " + zone_name);
  LOG_INFO("  Kaiser ID: " + kaiser_id);
  
  // Update kaiser_ structure
  kaiser_.zone_id = zone_id;
  kaiser_.master_zone_id = master_zone_id;
  kaiser_.zone_name = zone_name;
  kaiser_.zone_assigned = true;
  
  // Update kaiser_id if provided
  if (kaiser_id.length() > 0) {
    kaiser_.kaiser_id = kaiser_id;
  }
  
  // Persist to NVS
  bool success = saveZoneConfig(kaiser_, master_);
  
  if (success) {
    LOG_INFO("ConfigManager: Zone assignment updated successfully");
  } else {
    LOG_ERROR("ConfigManager: Failed to update zone assignment");
  }
  
  return success;
}

// ============================================
// SUBZONE CONFIGURATION (Phase 9)
// ============================================

bool ConfigManager::saveSubzoneConfig(const SubzoneConfig& config) {
  LOG_INFO("ConfigManager: Saving subzone config: " + config.subzone_id);
  
  if (!storageManager.beginNamespace("subzone_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open subzone_config namespace");
    return false;
  }
  
  String key_base = "subzone_" + config.subzone_id;
  
  bool success = true;
  success &= storageManager.putString((key_base + "_id").c_str(), config.subzone_id);
  success &= storageManager.putString((key_base + "_name").c_str(), config.subzone_name);
  success &= storageManager.putString((key_base + "_parent").c_str(), config.parent_zone_id);
  success &= storageManager.putBool((key_base + "_safe_mode").c_str(), config.safe_mode_active);
  success &= storageManager.putULong((key_base + "_timestamp").c_str(), config.created_timestamp);
  
  // GPIO-Array als komma-separierte String speichern
  String gpio_string = "";
  for (size_t i = 0; i < config.assigned_gpios.size(); i++) {
    if (i > 0) gpio_string += ",";
    gpio_string += String(config.assigned_gpios[i]);
  }
  success &= storageManager.putString((key_base + "_gpios").c_str(), gpio_string);
  
  // ============================================
  // ROBUSTE VARIANTE: Subzone-ID-Liste aktualisieren
  // ============================================
  // Füge subzone_id zur Liste hinzu (wenn noch nicht vorhanden)
  String subzone_ids_str = storageManager.getStringObj("subzone_ids", "");
  
  // Prüfe ob subzone_id bereits in Liste
  bool already_in_list = false;
  if (subzone_ids_str.length() > 0) {
    int start_idx = 0;
    while (start_idx < (int)subzone_ids_str.length()) {
      int comma_idx = subzone_ids_str.indexOf(',', start_idx);
      if (comma_idx == -1) comma_idx = subzone_ids_str.length();
      
      String existing_id = subzone_ids_str.substring(start_idx, comma_idx);
      existing_id.trim();
      
      if (existing_id == config.subzone_id) {
        already_in_list = true;
        break;
      }
      start_idx = comma_idx + 1;
    }
  }
  
  // Füge hinzu wenn noch nicht vorhanden
  if (!already_in_list) {
    if (subzone_ids_str.length() > 0) {
      subzone_ids_str += ",";
    }
    subzone_ids_str += config.subzone_id;
    success &= storageManager.putString("subzone_ids", subzone_ids_str);
    LOG_DEBUG("ConfigManager: Added " + config.subzone_id + " to subzone_ids list");
  }
  
  storageManager.endNamespace();
  
  if (success) {
    LOG_INFO("ConfigManager: Subzone config saved successfully");
  } else {
    LOG_ERROR("ConfigManager: Failed to save subzone config");
  }
  
  return success;
}

bool ConfigManager::loadSubzoneConfig(const String& subzone_id, SubzoneConfig& config) {
  if (!storageManager.beginNamespace("subzone_config", true)) {
    return false;
  }
  
  String key_base = "subzone_" + subzone_id;
  
  config.subzone_id = storageManager.getStringObj((key_base + "_id").c_str(), "");
  config.subzone_name = storageManager.getStringObj((key_base + "_name").c_str(), "");
  config.parent_zone_id = storageManager.getStringObj((key_base + "_parent").c_str(), "");
  config.safe_mode_active = storageManager.getBool((key_base + "_safe_mode").c_str(), true);
  config.created_timestamp = storageManager.getULong((key_base + "_timestamp").c_str(), 0);
  
  // GPIO-Array aus komma-separiertem String laden
  String gpio_string = storageManager.getStringObj((key_base + "_gpios").c_str(), "");
  config.assigned_gpios.clear();
  if (gpio_string.length() > 0) {
    int start_idx = 0;
    while (start_idx < gpio_string.length()) {
      int comma_idx = gpio_string.indexOf(',', start_idx);
      if (comma_idx == -1) comma_idx = gpio_string.length();
      
      String gpio_str = gpio_string.substring(start_idx, comma_idx);
      gpio_str.trim();
      if (gpio_str.length() > 0) {
        uint8_t gpio = (uint8_t)gpio_str.toInt();
        config.assigned_gpios.push_back(gpio);
      }
      start_idx = comma_idx + 1;
    }
  }
  
  storageManager.endNamespace();
  return config.subzone_id.length() > 0;
}

bool ConfigManager::loadAllSubzoneConfigs(SubzoneConfig configs[], uint8_t max_configs, uint8_t& loaded_count) {
  loaded_count = 0;
  
  if (!storageManager.beginNamespace("subzone_config", true)) {
    LOG_WARNING("ConfigManager: No subzone_config namespace found");
    return false;
  }
  
  // ============================================
  // ROBUSTE VARIANTE: Subzone-ID-Liste laden
  // ============================================
  // Pattern: "subzone_ids" enthält komma-separierte Liste aller aktiven Subzone-IDs
  // Beispiel: "irr_A,irr_B,clim_1"
  // Dies ist konsistent mit dem Server-Authoritative Pattern
  
  String subzone_ids_str = storageManager.getStringObj("subzone_ids", "");
  storageManager.endNamespace();
  
  if (subzone_ids_str.length() == 0) {
    LOG_INFO("ConfigManager: No subzones configured");
    return false;
  }
  
  // Parse komma-separierte Subzone-ID-Liste
  int start_idx = 0;
  while (start_idx < (int)subzone_ids_str.length() && loaded_count < max_configs) {
    int comma_idx = subzone_ids_str.indexOf(',', start_idx);
    if (comma_idx == -1) comma_idx = subzone_ids_str.length();
    
    String subzone_id = subzone_ids_str.substring(start_idx, comma_idx);
    subzone_id.trim();
    
    if (subzone_id.length() > 0) {
      SubzoneConfig config;
      if (loadSubzoneConfig(subzone_id, config) && config.subzone_id.length() > 0) {
        configs[loaded_count++] = config;
        LOG_DEBUG("ConfigManager: Loaded subzone: " + subzone_id);
      }
    }
    
    start_idx = comma_idx + 1;
  }
  
  LOG_INFO("ConfigManager: Loaded " + String(loaded_count) + " subzone configs");
  return loaded_count > 0;
}

bool ConfigManager::removeSubzoneConfig(const String& subzone_id) {
  LOG_INFO("ConfigManager: Removing subzone config: " + subzone_id);
  
  if (!storageManager.beginNamespace("subzone_config", false)) {
    return false;
  }
  
  String key_base = "subzone_" + subzone_id;
  
  // Einzelne Keys löschen durch Leeren
  storageManager.putString((key_base + "_id").c_str(), "");
  storageManager.putString((key_base + "_name").c_str(), "");
  storageManager.putString((key_base + "_parent").c_str(), "");
  storageManager.putString((key_base + "_gpios").c_str(), "");
  storageManager.putBool((key_base + "_safe_mode").c_str(), true);
  storageManager.putULong((key_base + "_timestamp").c_str(), 0);
  
  // ============================================
  // ROBUSTE VARIANTE: Aus Subzone-ID-Liste entfernen
  // ============================================
  String subzone_ids_str = storageManager.getStringObj("subzone_ids", "");
  
  if (subzone_ids_str.length() > 0) {
    String new_ids_str = "";
    int start_idx = 0;
    
    while (start_idx < (int)subzone_ids_str.length()) {
      int comma_idx = subzone_ids_str.indexOf(',', start_idx);
      if (comma_idx == -1) comma_idx = subzone_ids_str.length();
      
      String existing_id = subzone_ids_str.substring(start_idx, comma_idx);
      existing_id.trim();
      
      // Nur behalten wenn nicht die zu löschende ID
      if (existing_id.length() > 0 && existing_id != subzone_id) {
        if (new_ids_str.length() > 0) {
          new_ids_str += ",";
        }
        new_ids_str += existing_id;
      }
      
      start_idx = comma_idx + 1;
    }
    
    storageManager.putString("subzone_ids", new_ids_str);
    LOG_DEBUG("ConfigManager: Updated subzone_ids list after removal");
  }
  
  storageManager.endNamespace();
  LOG_INFO("ConfigManager: Subzone " + subzone_id + " removed");
  return true;
}

bool ConfigManager::validateSubzoneConfig(const SubzoneConfig& config) const {
  // Validation 1: subzone_id Format (1-32 chars, alphanumeric + underscore)
  if (config.subzone_id.length() == 0 || config.subzone_id.length() > 32) {
    LOG_WARNING("ConfigManager: Invalid subzone_id length");
    return false;
  }
  
  // Validation 2: parent_zone_id muss mit ESP-Zone übereinstimmen
  if (config.parent_zone_id.length() > 0 && config.parent_zone_id != kaiser_.zone_id) {
    LOG_WARNING("ConfigManager: parent_zone_id doesn't match ESP zone");
    return false;
  }
  
  // Validation 3: GPIOs müssen in safe pins list sein
  // Externe GPIO-Manager-Referenz wird benötigt
  extern GPIOManager& gpioManager;
  for (uint8_t gpio : config.assigned_gpios) {
    // Prüfe ob Pin verfügbar oder reserviert ist (dann ist es gültig)
    if (!gpioManager.isPinAvailable(gpio) && !gpioManager.isPinReserved(gpio)) {
      // Prüfe ob Pin überhaupt existiert (in pins_ vector)
      GPIOPinInfo pin_info = gpioManager.getPinInfo(gpio);
      if (pin_info.pin == 255) {  // Invalid pin marker
        LOG_WARNING("ConfigManager: GPIO " + String(gpio) + " not in safe pins list");
        return false;
      }
    }
  }
  
  return true;
}

uint8_t ConfigManager::getSubzoneCount() const {
  // Zähle Subzones durch Parsen der subzone_ids Liste
  // Diese Methode ist const-safe und nutzt nur read-only Zugriff
  
  // Wir müssen einen temporären non-const Zugriff machen (ESP32 Preferences Limitation)
  // Alternativ: Cache die Anzahl beim Laden
  // Für jetzt: Zähle Kommas + 1 (oder 0 wenn leer)
  
  if (!storageManager.beginNamespace("subzone_config", true)) {
    return 0;
  }
  
  String subzone_ids_str = storageManager.getStringObj("subzone_ids", "");
  storageManager.endNamespace();
  
  if (subzone_ids_str.length() == 0) {
    return 0;
  }
  
  // Zähle Einträge (Kommas + 1)
  uint8_t count = 1;
  for (size_t i = 0; i < subzone_ids_str.length(); i++) {
    if (subzone_ids_str[i] == ',') {
      count++;
    }
  }
  
  return count;
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
    // ============================================
    // WOKWI SIMULATION MODE: Use compile-time ESP ID
    // ============================================
    #ifdef WOKWI_SIMULATION
      #ifdef WOKWI_ESP_ID
        system_config_.esp_id = WOKWI_ESP_ID;
        LOG_INFO("ConfigManager: Using Wokwi ESP ID: " + system_config_.esp_id);
      #else
        system_config_.esp_id = "ESP_WOKWI001";
        LOG_INFO("ConfigManager: Using default Wokwi ESP ID: " + system_config_.esp_id);
      #endif
      saveSystemConfig(system_config_);
      return;
    #endif

    // ============================================
    // NORMAL MODE: Generate from MAC address
    // ============================================
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

// ============================================
// SENSOR CONFIGURATION (PHASE 4)
// ============================================
// Helper function to build sensor key
static void buildSensorKey(char* buffer, size_t buffer_size, uint8_t index, const char* field) {
  snprintf(buffer, buffer_size, "sensor_%d_%s", index, field);
}

static void buildActuatorKey(char* buffer, size_t buffer_size, uint8_t index, const char* field) {
  snprintf(buffer, buffer_size, "actuator_%d_%s", index, field);
}

bool ConfigManager::saveSensorConfig(const SensorConfig& config) {
  if (!validateSensorConfig(config)) {
    LOG_ERROR("ConfigManager: Sensor config validation failed");
    return false;
  }
  
  if (!storageManager.beginNamespace("sensor_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open sensor_config namespace");
    return false;
  }
  
  // Find index for this GPIO (or use next available)
  uint8_t sensor_count = storageManager.getUInt8("sensor_count", 0);
  int8_t existing_index = -1;
  
  // Check if sensor already exists
  char key_buffer[64];
  for (uint8_t i = 0; i < sensor_count; i++) {
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "gpio");
    uint8_t stored_gpio = storageManager.getUInt8(key_buffer, 255);
    if (stored_gpio == config.gpio) {
      existing_index = i;
      break;
    }
  }
  
  uint8_t index = (existing_index >= 0) ? existing_index : sensor_count;
  
  // Save sensor fields
  bool success = true;
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "gpio");
  success &= storageManager.putUInt8(key_buffer, config.gpio);
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "type");
  success &= storageManager.putString(key_buffer, config.sensor_type);
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "name");
  success &= storageManager.putString(key_buffer, config.sensor_name);
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "subzone");
  success &= storageManager.putString(key_buffer, config.subzone_id);
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "active");
  success &= storageManager.putBool(key_buffer, config.active);
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "raw_mode");
  success &= storageManager.putBool(key_buffer, config.raw_mode);

  // ✅ Phase 2C: Operating Mode Persistence
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "mode");
  success &= storageManager.putString(key_buffer, config.operating_mode);
  buildSensorKey(key_buffer, sizeof(key_buffer), index, "interval");
  success &= storageManager.putULong(key_buffer, config.measurement_interval_ms);

  // Update count if new sensor
  if (existing_index < 0) {
    success &= storageManager.putUInt8("sensor_count", sensor_count + 1);
  }
  
  storageManager.endNamespace();
  
  if (success) {
    LOG_INFO("ConfigManager: Saved sensor config for GPIO " + String(config.gpio));
  } else {
    LOG_ERROR("ConfigManager: Failed to save sensor config");
  }
  
  return success;
}

bool ConfigManager::saveSensorConfig(const SensorConfig* sensors, uint8_t count) {
  if (!sensors || count == 0) {
    return false;
  }
  
  bool success = true;
  for (uint8_t i = 0; i < count; i++) {
    success &= saveSensorConfig(sensors[i]);
  }
  
  return success;
}

bool ConfigManager::loadSensorConfig(SensorConfig sensors[], uint8_t max_sensors, uint8_t& loaded_count) {
  loaded_count = 0;
  
  if (!sensors || max_sensors == 0) {
    return false;
  }
  
  if (!storageManager.beginNamespace("sensor_config", true)) {
    LOG_ERROR("ConfigManager: Failed to open sensor_config namespace");
    return false;
  }
  
  uint8_t sensor_count = storageManager.getUInt8("sensor_count", 0);
  if (sensor_count == 0) {
    storageManager.endNamespace();
    return true;  // No sensors configured
  }
  
  // Limit to max_sensors
  if (sensor_count > max_sensors) {
    sensor_count = max_sensors;
  }
  
  bool success = true;
  char key_buffer[64];
  for (uint8_t i = 0; i < sensor_count; i++) {
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "gpio");
    sensors[loaded_count].gpio = storageManager.getUInt8(key_buffer, 255);
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "type");
    sensors[loaded_count].sensor_type = storageManager.getStringObj(key_buffer, "");
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "name");
    sensors[loaded_count].sensor_name = storageManager.getStringObj(key_buffer, "");
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "subzone");
    sensors[loaded_count].subzone_id = storageManager.getStringObj(key_buffer, "");
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "active");
    sensors[loaded_count].active = storageManager.getBool(key_buffer, false);
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "raw_mode");
    sensors[loaded_count].raw_mode = storageManager.getBool(key_buffer, true);

    // ✅ Phase 2C: Operating Mode from NVS
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "mode");
    sensors[loaded_count].operating_mode = storageManager.getStringObj(key_buffer, "continuous");
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "interval");
    sensors[loaded_count].measurement_interval_ms = storageManager.getULong(key_buffer, 30000);

    // Reset runtime fields
    sensors[loaded_count].last_raw_value = 0;
    sensors[loaded_count].last_reading = 0;

    // Validate loaded config
    if (sensors[loaded_count].gpio != 255 && sensors[loaded_count].sensor_type.length() > 0) {
      loaded_count++;
    }
  }
  
  storageManager.endNamespace();
  
  if (success) {
    LOG_INFO("ConfigManager: Loaded " + String(loaded_count) + " sensor configs");
  }
  
  return success;
}

bool ConfigManager::removeSensorConfig(uint8_t gpio) {
  if (!storageManager.beginNamespace("sensor_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open sensor_config namespace");
    return false;
  }
  
  uint8_t sensor_count = storageManager.getUInt8("sensor_count", 0);
  int8_t found_index = -1;
  
  // Find sensor index
  char key_buffer[64];
  for (uint8_t i = 0; i < sensor_count; i++) {
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "gpio");
    uint8_t stored_gpio = storageManager.getUInt8(key_buffer, 255);
    if (stored_gpio == gpio) {
      found_index = i;
      break;
    }
  }
  
  if (found_index < 0) {
    storageManager.endNamespace();
    LOG_WARNING("ConfigManager: Sensor config for GPIO " + String(gpio) + " not found");
    return false;
  }
  
  // Remove sensor by shifting remaining sensors
  char next_key_buffer[64];
  for (uint8_t i = found_index; i < sensor_count - 1; i++) {
    buildSensorKey(next_key_buffer, sizeof(next_key_buffer), i + 1, "gpio");
    uint8_t next_gpio = storageManager.getUInt8(next_key_buffer, 255);
    buildSensorKey(next_key_buffer, sizeof(next_key_buffer), i + 1, "type");
    String next_type = storageManager.getStringObj(next_key_buffer, "");
    buildSensorKey(next_key_buffer, sizeof(next_key_buffer), i + 1, "name");
    String next_name = storageManager.getStringObj(next_key_buffer, "");
    buildSensorKey(next_key_buffer, sizeof(next_key_buffer), i + 1, "subzone");
    String next_subzone = storageManager.getStringObj(next_key_buffer, "");
    buildSensorKey(next_key_buffer, sizeof(next_key_buffer), i + 1, "active");
    bool next_active = storageManager.getBool(next_key_buffer, false);
    buildSensorKey(next_key_buffer, sizeof(next_key_buffer), i + 1, "raw_mode");
    bool next_raw_mode = storageManager.getBool(next_key_buffer, true);
    
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "gpio");
    storageManager.putUInt8(key_buffer, next_gpio);
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "type");
    storageManager.putString(key_buffer, next_type);
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "name");
    storageManager.putString(key_buffer, next_name);
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "subzone");
    storageManager.putString(key_buffer, next_subzone);
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "active");
    storageManager.putBool(key_buffer, next_active);
    buildSensorKey(key_buffer, sizeof(key_buffer), i, "raw_mode");
    storageManager.putBool(key_buffer, next_raw_mode);
  }
  
  // Clear last sensor
  buildSensorKey(key_buffer, sizeof(key_buffer), sensor_count - 1, "gpio");
  storageManager.putUInt8(key_buffer, 255);
  buildSensorKey(key_buffer, sizeof(key_buffer), sensor_count - 1, "type");
  storageManager.putString(key_buffer, "");
  buildSensorKey(key_buffer, sizeof(key_buffer), sensor_count - 1, "name");
  storageManager.putString(key_buffer, "");
  buildSensorKey(key_buffer, sizeof(key_buffer), sensor_count - 1, "subzone");
  storageManager.putString(key_buffer, "");
  buildSensorKey(key_buffer, sizeof(key_buffer), sensor_count - 1, "active");
  storageManager.putBool(key_buffer, false);
  buildSensorKey(key_buffer, sizeof(key_buffer), sensor_count - 1, "raw_mode");
  storageManager.putBool(key_buffer, true);
  
  // Update count
  storageManager.putUInt8("sensor_count", sensor_count - 1);
  
  storageManager.endNamespace();
  
  LOG_INFO("ConfigManager: Removed sensor config for GPIO " + String(gpio));
  return true;
}

bool ConfigManager::validateSensorConfig(const SensorConfig& config) const {
  // GPIO must be valid (not 255)
  if (config.gpio == 255) {
    LOG_WARNING("ConfigManager: Invalid GPIO (255)");
    return false;
  }
  
  // Sensor type must not be empty
  if (config.sensor_type.length() == 0) {
    LOG_WARNING("ConfigManager: Sensor type is empty");
    return false;
  }
  
  // GPIO must be in valid range (0-39 for ESP32)
  if (config.gpio > 39) {
    LOG_WARNING("ConfigManager: GPIO out of range: " + String(config.gpio));
    return false;
  }
  
  return true;
}

bool ConfigManager::saveActuatorConfig(const ActuatorConfig actuators[], uint8_t actuator_count) {
  LOG_INFO("ConfigManager: Saving Actuator configurations...");
  
  if (!storageManager.beginNamespace("actuator_config", false)) {
    LOG_ERROR("ConfigManager: Failed to open actuator_config namespace");
    return false;
  }
  
  bool success = storageManager.putUInt8("actuator_count", actuator_count);
  char key_buffer[64];
  
  for (uint8_t i = 0; i < actuator_count; i++) {
    const ActuatorConfig& config = actuators[i];
    if (!validateActuatorConfig(config)) {
      continue;
    }
    
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "gpio");
    success &= storageManager.putUInt8(key_buffer, config.gpio);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "aux_gpio");
    success &= storageManager.putUInt8(key_buffer, config.aux_gpio);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "type");
    success &= storageManager.putString(key_buffer, config.actuator_type);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "name");
    success &= storageManager.putString(key_buffer, config.actuator_name);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "subzone");
    success &= storageManager.putString(key_buffer, config.subzone_id);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "active");
    success &= storageManager.putBool(key_buffer, config.active);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "critical");
    success &= storageManager.putBool(key_buffer, config.critical);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "inverted");
    success &= storageManager.putBool(key_buffer, config.inverted_logic);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "default_state");
    success &= storageManager.putBool(key_buffer, config.default_state);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "default_pwm");
    success &= storageManager.putUInt8(key_buffer, config.default_pwm);
  }
  
  storageManager.endNamespace();
  
  if (!success) {
    LOG_ERROR("ConfigManager: Failed to save actuator configurations");
  }
  
  return success;
}

bool ConfigManager::loadActuatorConfig(ActuatorConfig actuators[], uint8_t max_actuators, uint8_t& loaded_count) {
  loaded_count = 0;
  if (!storageManager.beginNamespace("actuator_config", true)) {
    LOG_WARNING("ConfigManager: actuator_config namespace not found");
    return false;
  }
  
  uint8_t stored_count = storageManager.getUInt8("actuator_count", 0);
  char key_buffer[64];
  
  for (uint8_t i = 0; i < stored_count && loaded_count < max_actuators; i++) {
    ActuatorConfig config;
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "gpio");
    config.gpio = storageManager.getUInt8(key_buffer, 255);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "aux_gpio");
    config.aux_gpio = storageManager.getUInt8(key_buffer, 255);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "type");
    config.actuator_type = storageManager.getStringObj(key_buffer, "");
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "name");
    config.actuator_name = storageManager.getStringObj(key_buffer, "");
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "subzone");
    config.subzone_id = storageManager.getStringObj(key_buffer, "");
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "active");
    config.active = storageManager.getBool(key_buffer, false);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "critical");
    config.critical = storageManager.getBool(key_buffer, false);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "inverted");
    config.inverted_logic = storageManager.getBool(key_buffer, false);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "default_state");
    config.default_state = storageManager.getBool(key_buffer, false);
    buildActuatorKey(key_buffer, sizeof(key_buffer), i, "default_pwm");
    config.default_pwm = storageManager.getUInt8(key_buffer, 0);
    
    if (validateActuatorConfig(config)) {
      actuators[loaded_count++] = config;
    }
  }
  
  storageManager.endNamespace();
  LOG_INFO("ConfigManager: Loaded " + String(loaded_count) + " actuator configs from NVS");
  return loaded_count > 0;
}

bool ConfigManager::validateActuatorConfig(const ActuatorConfig& config) const {
  if (config.gpio == 255 || config.gpio > 39) {
    LOG_WARNING("ConfigManager: Invalid actuator GPIO " + String(config.gpio));
    return false;
  }
  if (config.actuator_type.length() == 0) {
    LOG_WARNING("ConfigManager: Actuator type is empty");
    return false;
  }
  return true;
}
