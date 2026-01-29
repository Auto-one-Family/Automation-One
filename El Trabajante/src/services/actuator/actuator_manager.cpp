#include "actuator_manager.h"

#include <memory>

#include "../../drivers/gpio_manager.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/config_types.h"
#include "../../models/error_codes.h"
#include "../../services/communication/mqtt_client.h"
#include "../../services/config/config_manager.h"
#include "../../services/config/config_response.h"
#include "../../services/sensor/sensor_manager.h"
#include "../../utils/json_helpers.h"
#include "../../utils/logger.h"
#include "../../utils/topic_builder.h"
#include "../../utils/time_manager.h"
#include "actuator_drivers/pump_actuator.h"
#include "actuator_drivers/pwm_actuator.h"
#include "actuator_drivers/valve_actuator.h"

ActuatorManager& actuatorManager = ActuatorManager::getInstance();

namespace {

String extractJSONString(const String& json, const String& key) {
  String pattern = "\"" + key + "\":";
  int key_pos = json.indexOf(pattern);
  if (key_pos == -1) {
    return "";
  }
  key_pos += pattern.length();

  // Skip optional quotes or whitespace
  while (key_pos < json.length() && (json[key_pos] == ' ' || json[key_pos] == '\"')) {
    if (json[key_pos] == '\"') {
      key_pos++;
      int end_quote = json.indexOf('\"', key_pos);
      if (end_quote == -1) {
        return "";
      }
      return json.substring(key_pos, end_quote);
    }
    key_pos++;
  }

  int value_end = json.indexOf(',', key_pos);
  if (value_end == -1) {
    value_end = json.indexOf('}', key_pos);
  }
  if (value_end == -1) {
    value_end = json.length();
  }

  String value = json.substring(key_pos, value_end);
  value.trim();
  value.replace("\"", "");
  return value;
}

float extractJSONFloat(const String& json, const String& key, float default_value = 0.0f) {
  String value = extractJSONString(json, key);
  return value.length() ? value.toFloat() : default_value;
}

uint32_t extractJSONUInt32(const String& json, const String& key, uint32_t default_value = 0) {
  String value = extractJSONString(json, key);
  return value.length() ? static_cast<uint32_t>(value.toInt()) : default_value;
}

bool extractJSONBool(const String& json, const String& key, bool default_value = false) {
  String value = extractJSONString(json, key);
  value.toLowerCase();
  if (value == "true" || value == "1") {
    return true;
  }
  if (value == "false" || value == "0") {
    return false;
  }
  return default_value;
}

}  // namespace

ActuatorManager& ActuatorManager::getInstance() {
  static ActuatorManager instance;
  return instance;
}

ActuatorManager::ActuatorManager()
    : actuator_count_(0),
      initialized_(false),
      gpio_manager_(&GPIOManager::getInstance()) {}

bool ActuatorManager::begin() {
  if (initialized_) {
    LOG_WARNING("ActuatorManager already initialized");
    return true;
  }

  actuator_count_ = 0;
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    actuators_[i] = RegisteredActuator();
  }

  initialized_ = true;
  LOG_INFO("ActuatorManager initialized");
  return true;
}

void ActuatorManager::end() {
  if (!initialized_) {
    return;
  }

  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (actuators_[i].in_use && actuators_[i].driver) {
      actuators_[i].driver->end();
      actuators_[i].driver.reset();
    }
    actuators_[i].in_use = false;
  }

  actuator_count_ = 0;
  initialized_ = false;
  LOG_INFO("ActuatorManager shutdown complete");
}

ActuatorManager::RegisteredActuator* ActuatorManager::getFreeSlot() {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (!actuators_[i].in_use) {
      return &actuators_[i];
    }
  }
  return nullptr;
}

ActuatorManager::RegisteredActuator* ActuatorManager::findActuator(uint8_t gpio) {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (actuators_[i].in_use && actuators_[i].gpio == gpio) {
      return &actuators_[i];
    }
  }
  return nullptr;
}

const ActuatorManager::RegisteredActuator* ActuatorManager::findActuator(uint8_t gpio) const {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (actuators_[i].in_use && actuators_[i].gpio == gpio) {
      return &actuators_[i];
    }
  }
  return nullptr;
}

bool ActuatorManager::validateActuatorConfig(const ActuatorConfig& config) const {
  if (config.gpio == 255) {
    LOG_ERROR("Actuator config missing GPIO");
    return false;
  }
  if (config.actuator_type.length() == 0) {
    LOG_ERROR("Actuator config missing type");
    return false;
  }
  return true;
}

std::unique_ptr<IActuatorDriver> ActuatorManager::createDriver(const String& actuator_type) const {
  if (actuator_type == ActuatorTypeTokens::PUMP) {
    return std::unique_ptr<IActuatorDriver>(new PumpActuator());
  }
  if (actuator_type == ActuatorTypeTokens::PWM) {
    return std::unique_ptr<IActuatorDriver>(new PWMActuator());
  }
  if (actuator_type == ActuatorTypeTokens::VALVE) {
    return std::unique_ptr<IActuatorDriver>(new ValveActuator());
  }
  if (actuator_type == ActuatorTypeTokens::RELAY) {
    return std::unique_ptr<IActuatorDriver>(new PumpActuator());  // Relay handled like pump (binary)
  }
  LOG_ERROR("Unknown actuator type: " + actuator_type);
  return nullptr;
}

bool ActuatorManager::configureActuator(const ActuatorConfig& incoming_config) {
  if (!initialized_ && !begin()) {
    return false;
  }

  ActuatorConfig config = incoming_config;
  if (!validateActuatorConfig(config)) {
    return false;
  }

  // Phase 7: Handle deactivation/removal
  if (!config.active) {
    LOG_INFO("Actuator config deactivating GPIO " + String(config.gpio));
    removeActuator(config.gpio);
    return true;
  }

  // Server-Centric Deviation (Hardware-Protection-Layer):
  // GPIO-Conflict-Check als Defense-in-Depth gegen fehlerhafte Server-Configs.
  // Server sollte primär GPIO-Allokation verwalten, dies ist nur Fallback.
  // Dokumentiert in: docs/ZZZ.md - "Server-Centric Pragmatic Deviations"
  if (sensorManager.hasSensorOnGPIO(config.gpio)) {
    LOG_ERROR("GPIO " + String(config.gpio) + " already used by sensor");
    errorTracker.trackError(ERROR_GPIO_CONFLICT,
                            ERROR_SEVERITY_ERROR,
                            "GPIO conflict sensor vs actuator");
    return false;
  }

  // Phase 7: Runtime reconfiguration - check if actuator exists
  bool is_reconfiguration = hasActuatorOnGPIO(config.gpio);
  if (is_reconfiguration) {
    RegisteredActuator* existing = findActuator(config.gpio);
    if (existing) {
      LOG_INFO("Actuator Manager: Runtime reconfiguration on GPIO " + String(config.gpio));
      
      // Check if type changed
      bool type_changed = (existing->config.actuator_type != config.actuator_type);
      if (type_changed) {
        LOG_INFO("  Actuator type changed: " + existing->config.actuator_type + 
                 " → " + config.actuator_type);
        // Emergency stop before type change
        if (existing->driver) {
          existing->driver->setBinary(false);
        }
      }
    }
    removeActuator(config.gpio);
  }

  RegisteredActuator* slot = getFreeSlot();
  if (!slot) {
    LOG_ERROR("No actuator slots available");
    errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                            ERROR_SEVERITY_ERROR,
                            "Actuator slots exhausted");
    return false;
  }

  auto driver = createDriver(config.actuator_type);
  if (!driver) {
    return false;
  }

  if (!driver->begin(config)) {
    LOG_ERROR("Driver initialization failed for GPIO " + String(config.gpio));
    errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                            ERROR_SEVERITY_ERROR,
                            "Driver init failed");
    return false;
  }

  slot->driver = std::move(driver);
  slot->config = slot->driver->getConfig();
  slot->gpio = config.gpio;
  slot->in_use = true;
  slot->emergency_stopped = false;
  
  if (!is_reconfiguration) {
    actuator_count_++;
  }

  // Phase 7: Persist to NVS immediately (save all actuators)
  ActuatorConfig actuators[MAX_ACTUATORS];
  uint8_t count = 0;
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (actuators_[i].in_use) {
      actuators[count++] = actuators_[i].config;
    }
  }
  if (!configManager.saveActuatorConfig(actuators, count)) {
    LOG_ERROR("Actuator Manager: Failed to persist config to NVS");
  } else {
    LOG_INFO("  ✅ Configuration persisted to NVS");
  }

  LOG_INFO("Actuator " + String(is_reconfiguration ? "reconfigured" : "configured") + 
           " on GPIO " + String(config.gpio) + " type: " + config.actuator_type);
  publishActuatorStatus(config.gpio);
  return true;
}

bool ActuatorManager::removeActuator(uint8_t gpio) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator) {
    return false;
  }

  LOG_INFO("Actuator Manager: Removing actuator on GPIO " + String(gpio));
  
  // Phase 7: Safety - stop actuator before removal
  if (actuator->driver) {
    LOG_INFO("  Stopping actuator before removal");
    actuator->driver->setBinary(false);
    actuator->driver->end();
    actuator->driver.reset();
  }

  actuator->in_use = false;
  actuator->gpio = 255;
  actuator->config = ActuatorConfig();
  actuator->emergency_stopped = false;
  actuator_count_ = actuator_count_ > 0 ? actuator_count_ - 1 : 0;
  
  // Phase 7: Persist removal to NVS immediately (save remaining actuators)
  ActuatorConfig actuators[MAX_ACTUATORS];
  uint8_t count = 0;
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (actuators_[i].in_use) {
      actuators[count++] = actuators_[i].config;
    }
  }
  if (!configManager.saveActuatorConfig(actuators, count)) {
    LOG_ERROR("Actuator Manager: Failed to persist config to NVS");
  } else {
    LOG_INFO("  ✅ Configuration persisted to NVS");
  }
  
  LOG_INFO("Actuator removed from GPIO " + String(gpio));
  return true;
}

bool ActuatorManager::hasActuatorOnGPIO(uint8_t gpio) const {
  return findActuator(gpio) != nullptr;
}

ActuatorConfig ActuatorManager::getActuatorConfig(uint8_t gpio) const {
  const RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator) {
    return ActuatorConfig();
  }
  return actuator->config;
}

bool ActuatorManager::controlActuator(uint8_t gpio, float value) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    LOG_ERROR("controlActuator: actuator not found on GPIO " + String(gpio));
    errorTracker.trackError(ERROR_ACTUATOR_NOT_FOUND,
                            ERROR_SEVERITY_ERROR,
                            "Actuator missing");
    return false;
  }

  if (actuator->emergency_stopped) {
    LOG_WARNING("Actuator GPIO " + String(gpio) + " is emergency stopped");
    return false;
  }

  float normalized_value = value;
  if (isPwmActuatorType(actuator->config.actuator_type)) {
    normalized_value = constrain(value, 0.0f, 1.0f);
  } else if (!validateActuatorValue(actuator->config.actuator_type, value)) {
    LOG_ERROR("Actuator value out of range for GPIO " + String(gpio));
    errorTracker.trackError(ERROR_COMMAND_INVALID,
                            ERROR_SEVERITY_ERROR,
                            "Actuator value invalid");
    return false;
  }

  bool success = actuator->driver->setValue(normalized_value);
  actuator->config = actuator->driver->getConfig();

  // Phase 2: Runtime protection - track activation timestamp
  if (success) {
    if (actuator->config.current_state) {
      // Actuator activated - start timeout tracking
      actuator->config.runtime_protection.activation_start_ms = millis();
    } else {
      // Actuator deactivated - reset timeout tracking
      actuator->config.runtime_protection.activation_start_ms = 0;
    }

    publishActuatorStatus(gpio);
  }
  return success;
}

bool ActuatorManager::controlActuatorBinary(uint8_t gpio, bool state) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    return false;
  }

  if (actuator->emergency_stopped) {
    LOG_WARNING("Actuator GPIO " + String(gpio) + " is emergency stopped");
    return false;
  }

  bool success = actuator->driver->setBinary(state);
  actuator->config = actuator->driver->getConfig();

  // Phase 2: Runtime protection - track activation timestamp
  if (success) {
    if (actuator->config.current_state) {
      // Actuator activated - start timeout tracking
      actuator->config.runtime_protection.activation_start_ms = millis();
    } else {
      // Actuator deactivated - reset timeout tracking
      actuator->config.runtime_protection.activation_start_ms = 0;
    }

    publishActuatorStatus(gpio);
  }
  return success;
}

bool ActuatorManager::emergencyStopAll() {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (!actuators_[i].in_use || !actuators_[i].driver) {
      continue;
    }
    actuators_[i].driver->emergencyStop("EmergencyStopAll");
    actuators_[i].emergency_stopped = true;
    publishActuatorAlert(actuators_[i].gpio, "emergency_stop", "Actuator stopped");
  }
  return true;
}

bool ActuatorManager::emergencyStopActuator(uint8_t gpio) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    return false;
  }

  actuator->driver->emergencyStop("EmergencyStop");
  actuator->emergency_stopped = true;
  publishActuatorAlert(gpio, "emergency_stop", "Actuator stopped");
  return true;
}

bool ActuatorManager::clearEmergencyStop() {
  bool success = true;
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (!actuators_[i].in_use || !actuators_[i].driver) {
      continue;
    }
    if (!actuators_[i].driver->clearEmergency()) {
      success = false;
    } else {
      actuators_[i].emergency_stopped = false;
      actuators_[i].config = actuators_[i].driver->getConfig();
    }
  }
  return success;
}

bool ActuatorManager::clearEmergencyStopActuator(uint8_t gpio) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    return false;
  }
  bool cleared = actuator->driver->clearEmergency();
  if (cleared) {
    actuator->emergency_stopped = false;
    actuator->config = actuator->driver->getConfig();
    publishActuatorStatus(gpio);
  }
  return cleared;
}

bool ActuatorManager::getEmergencyStopStatus(uint8_t gpio) const {
  const RegisteredActuator* actuator = findActuator(gpio);
  return actuator ? actuator->emergency_stopped : false;
}

bool ActuatorManager::resumeOperation() {
  bool cleared = clearEmergencyStop();
  if (cleared) {
    publishAllActuatorStatus();
  }
  return cleared;
}

void ActuatorManager::processActuatorLoops() {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (!actuators_[i].in_use || !actuators_[i].driver) {
      continue;
    }

    // ═══════════════════════════════════════════════════
    // PHASE 2: TIMEOUT-PROTECTION (Robustness)
    // ═══════════════════════════════════════════════════
    // Check for actuator timeout (prevents continuous operation)
    if (actuators_[i].config.runtime_protection.timeout_enabled &&
        actuators_[i].config.current_state) {

      // Only check if activation_start_ms is set (non-zero)
      if (actuators_[i].config.runtime_protection.activation_start_ms > 0) {
        unsigned long runtime = millis() - actuators_[i].config.runtime_protection.activation_start_ms;

        if (runtime > actuators_[i].config.runtime_protection.max_runtime_ms) {
          LOG_WARNING("Actuator timeout: GPIO " + String(actuators_[i].config.gpio) +
                      " runtime " + String(runtime / 1000) + "s exceeded limit " +
                      String(actuators_[i].config.runtime_protection.max_runtime_ms / 1000) + "s");

          // Emergency stop this actuator
          emergencyStopActuator(actuators_[i].config.gpio);

          // Publish timeout alert
          publishActuatorAlert(actuators_[i].config.gpio, "runtime_protection",
                               "Actuator exceeded max runtime - emergency stopped");

          // Reset activation timestamp
          actuators_[i].config.runtime_protection.activation_start_ms = 0;
        }
      }
    }

    // Regular driver loop processing
    actuators_[i].driver->loop();
    actuators_[i].config = actuators_[i].driver->getConfig();
  }
}

uint8_t ActuatorManager::extractGPIOFromTopic(const String& topic) const {
  int actuator_idx = topic.indexOf("/actuator/");
  if (actuator_idx == -1) {
    return 255;
  }
  int gpio_start = actuator_idx + 10;
  int gpio_end = topic.indexOf('/', gpio_start);
  if (gpio_end == -1) {
    return 255;
  }
  String gpio_str = topic.substring(gpio_start, gpio_end);
  gpio_str.trim();
  if (gpio_str.length() == 0) {
    return 255;
  }
  return static_cast<uint8_t>(gpio_str.toInt());
}

bool ActuatorManager::handleActuatorCommand(const String& topic, const String& payload) {
  uint8_t gpio = extractGPIOFromTopic(topic);
  if (gpio == 255) {
    LOG_ERROR("Invalid actuator command topic: " + topic);
    return false;
  }

  ActuatorCommand command;
  command.gpio = gpio;
  command.command = extractJSONString(payload, "command");
  command.value = extractJSONFloat(payload, "value", 0.0f);
  command.duration_s = extractJSONUInt32(payload, "duration", 0);
  command.timestamp = millis();
  command.correlation_id = extractJSONString(payload, "correlation_id");

  bool success = false;
  if (command.command.equalsIgnoreCase("ON")) {
    success = controlActuatorBinary(gpio, true);
  } else if (command.command.equalsIgnoreCase("OFF")) {
    success = controlActuatorBinary(gpio, false);
  } else if (command.command.equalsIgnoreCase("PWM")) {
    success = controlActuator(gpio, command.value);
  } else if (command.command.equalsIgnoreCase("TOGGLE")) {
    RegisteredActuator* actuator = findActuator(gpio);
    if (actuator) {
      success = controlActuatorBinary(gpio, !actuator->config.current_state);
    }
  } else {
    LOG_ERROR("Unknown actuator command: " + command.command);
  }

  publishActuatorResponse(command,
                          success,
                          success ? "Command executed" : "Command failed");
  if (success) {
    publishActuatorStatus(gpio);
  }

  return success;
}

bool ActuatorManager::parseActuatorDefinition(const JsonObjectConst& obj,
                                              ActuatorConfig& config,
                                              String& error_message,
                                              ConfigErrorCode& error_code) const {
  config = ActuatorConfig();
  error_message = "";
  error_code = ConfigErrorCode::NONE;

  if (!obj.containsKey("gpio")) {
    error_message = "Actuator config missing required field 'gpio'";
    error_code = ConfigErrorCode::MISSING_FIELD;
    return false;
  }

  int gpio_value = 255;
  if (!JsonHelpers::extractInt(obj, "gpio", gpio_value)) {
    error_message = "Actuator field 'gpio' must be an integer";
    error_code = ConfigErrorCode::TYPE_MISMATCH;
    return false;
  }
  config.gpio = static_cast<uint8_t>(gpio_value);

  int aux_gpio_value = 255;
  if (JsonHelpers::extractInt(obj, "aux_gpio", aux_gpio_value)) {
    config.aux_gpio = static_cast<uint8_t>(aux_gpio_value);
  }

  if (obj.containsKey("actuator_type")) {
    if (!JsonHelpers::extractString(obj, "actuator_type", config.actuator_type)) {
      error_message = "Actuator field 'actuator_type' must be a string";
      error_code = ConfigErrorCode::TYPE_MISMATCH;
      return false;
    }
  } else if (obj.containsKey("type")) {
    if (!JsonHelpers::extractString(obj, "type", config.actuator_type)) {
      error_message = "Actuator field 'type' must be a string";
      error_code = ConfigErrorCode::TYPE_MISMATCH;
      return false;
    }
  } else {
    error_message = "Actuator config missing required field 'actuator_type'";
    error_code = ConfigErrorCode::MISSING_FIELD;
    return false;
  }

  if (config.actuator_type.length() == 0) {
    error_message = "Actuator type cannot be empty";
    error_code = ConfigErrorCode::VALIDATION_FAILED;
    return false;
  }

  if (obj.containsKey("actuator_name")) {
    if (!JsonHelpers::extractString(obj, "actuator_name", config.actuator_name)) {
      error_message = "Actuator field 'actuator_name' must be a string";
      error_code = ConfigErrorCode::TYPE_MISMATCH;
      return false;
    }
  } else if (obj.containsKey("name")) {
    if (!JsonHelpers::extractString(obj, "name", config.actuator_name)) {
      error_message = "Actuator field 'name' must be a string";
      error_code = ConfigErrorCode::TYPE_MISMATCH;
      return false;
    }
  } else {
    error_message = "Actuator config missing required field 'actuator_name'";
    error_code = ConfigErrorCode::MISSING_FIELD;
    return false;
  }

  JsonHelpers::extractString(obj, "subzone_id", config.subzone_id, "");

  bool bool_value = false;
  if (JsonHelpers::extractBool(obj, "active", bool_value, true)) {
    config.active = bool_value;
  } else {
    config.active = true;
  }

  if (JsonHelpers::extractBool(obj, "critical", bool_value, false)) {
    config.critical = bool_value;
  }

  if (JsonHelpers::extractBool(obj, "inverted_logic", bool_value, false)) {
    config.inverted_logic = bool_value;
  } else if (JsonHelpers::extractBool(obj, "inverted", bool_value, false)) {
    config.inverted_logic = bool_value;
  }

  if (JsonHelpers::extractBool(obj, "default_state", bool_value, false)) {
    config.default_state = bool_value;
  }

  int default_pwm_value = 0;
  if (JsonHelpers::extractInt(obj, "default_pwm", default_pwm_value)) {
    default_pwm_value = constrain(default_pwm_value, 0, 255);
    config.default_pwm = static_cast<uint8_t>(default_pwm_value);
  }

  return true;
}

bool ActuatorManager::handleActuatorConfig(const String& payload, const String& correlation_id) {
  LOG_INFO("Handling actuator configuration from MQTT");

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    String message = "Failed to parse actuator config JSON: " + String(error.c_str());
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::ACTUATOR, ConfigErrorCode::JSON_PARSE_ERROR, message,
        JsonVariantConst(), correlation_id);
    return false;
  }

  JsonArray actuators = doc["actuators"].as<JsonArray>();
  if (actuators.isNull()) {
    String message = "Actuator config missing 'actuators' array";
    LOG_ERROR(message);
    ConfigResponseBuilder::publishError(
        ConfigType::ACTUATOR, ConfigErrorCode::MISSING_FIELD, message,
        JsonVariantConst(), correlation_id);
    return false;
  }

  size_t total = actuators.size();
  if (total == 0) {
    String message = "Actuator config array is empty";
    LOG_WARNING(message);
    ConfigResponseBuilder::publishError(
        ConfigType::ACTUATOR, ConfigErrorCode::MISSING_FIELD, message,
        JsonVariantConst(), correlation_id);
    return false;
  }
  uint8_t configured = 0;
  for (JsonObject actuatorObj : actuators) {
    ActuatorConfig config;
    String parse_error;
    ConfigErrorCode error_code = ConfigErrorCode::NONE;
    JsonVariantConst failed_variant = actuatorObj;
    JsonObjectConst actuatorObjConst = actuatorObj;

    if (!parseActuatorDefinition(actuatorObjConst, config, parse_error, error_code)) {
      if (parse_error.isEmpty()) {
        parse_error = "Invalid actuator definition";
      }
      if (error_code == ConfigErrorCode::NONE) {
        error_code = ConfigErrorCode::VALIDATION_FAILED;
      }
      ConfigResponseBuilder::publishError(
          ConfigType::ACTUATOR, error_code, parse_error, failed_variant,
          correlation_id);
      continue;
    }

    if (!configureActuator(config)) {
      String message = "Failed to configure actuator on GPIO " + String(config.gpio);
      LOG_ERROR(message);
      ConfigResponseBuilder::publishError(
          ConfigType::ACTUATOR, ConfigErrorCode::UNKNOWN_ERROR, message, failed_variant,
          correlation_id);
      continue;
    }

    configured++;
  }

  if (configured == total) {
    String message = "Configured " + String(configured) + " actuator(s) successfully";
    ConfigResponseBuilder::publishSuccess(ConfigType::ACTUATOR, configured, message,
                                          correlation_id);
    return true;
  }

  return configured > 0;
}

String ActuatorManager::buildStatusPayload(const ActuatorStatus& status, const ActuatorConfig& config) const {
  // Phase 7: Get zone information from global variables (extern from main.cpp)
  extern KaiserZone g_kaiser;
  extern SystemConfig g_system_config;
  
  // Phase 8: Use NTP-synchronized Unix timestamp
  time_t unix_ts = timeManager.getUnixTimestamp();
  
  String payload = "{";
  payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
  payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
  payload += "\"subzone_id\":\"" + config.subzone_id + "\",";
  payload += "\"ts\":" + String((unsigned long)unix_ts) + ",";
  payload += "\"gpio\":" + String(status.gpio) + ",";
  payload += "\"type\":\"" + config.actuator_type + "\",";
  payload += "\"state\":" + String(status.current_state ? "true" : "false") + ",";
  payload += "\"pwm\":" + String(status.current_pwm) + ",";
  payload += "\"runtime_ms\":" + String(status.runtime_ms) + ",";
  payload += "\"emergency\":\"" + String(emergencyStateToString(status.emergency_state)) + "\"";
  payload += "}";
  return payload;
}

void ActuatorManager::publishActuatorStatus(uint8_t gpio) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator || !actuator->driver) {
    return;
  }

  ActuatorStatus status = actuator->driver->getStatus();
  actuator->config = actuator->driver->getConfig();
  String payload = buildStatusPayload(status, actuator->config);
  const char* topic = TopicBuilder::buildActuatorStatusTopic(gpio);
  mqttClient.safePublish(String(topic), payload, 1);
}

void ActuatorManager::publishAllActuatorStatus() {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (actuators_[i].in_use) {
      publishActuatorStatus(actuators_[i].gpio);
    }
  }
}

String ActuatorManager::buildResponsePayload(const ActuatorCommand& command,
                                             bool success,
                                             const String& message) const {
  // Phase 7: Get zone information from global variables
  extern KaiserZone g_kaiser;
  extern SystemConfig g_system_config;
  
  // Phase 8: Use NTP-synchronized Unix timestamp
  time_t unix_ts = timeManager.getUnixTimestamp();
  
  String payload = "{";
  payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
  payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
  payload += "\"ts\":" + String((unsigned long)unix_ts) + ",";
  payload += "\"gpio\":" + String(command.gpio) + ",";
  payload += "\"command\":\"" + command.command + "\",";
  payload += "\"value\":" + String(command.value, 3) + ",";
  payload += "\"duration\":" + String(command.duration_s) + ",";
  payload += "\"success\":" + String(success ? "true" : "false") + ",";
  payload += "\"message\":\"" + message + "\"";
  if (command.correlation_id.length() > 0) {
    payload += ",\"correlation_id\":\"" + command.correlation_id + "\"";
  }
  payload += "}";
  return payload;
}

void ActuatorManager::publishActuatorResponse(const ActuatorCommand& command,
                                              bool success,
                                              const String& message) {
  const char* topic = TopicBuilder::buildActuatorResponseTopic(command.gpio);
  String payload = buildResponsePayload(command, success, message);
  mqttClient.safePublish(String(topic), payload, 1);
}

void ActuatorManager::publishActuatorAlert(uint8_t gpio,
                                           const String& alert_type,
                                           const String& message) {
  // Phase 8: Use NTP-synchronized Unix timestamp
  time_t unix_ts = timeManager.getUnixTimestamp();
  
  // Phase 7: Get zone information from global variables
  extern KaiserZone g_kaiser;
  extern SystemConfig g_system_config;
  
  const char* topic = TopicBuilder::buildActuatorAlertTopic(gpio);
  String payload = "{";
  payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
  payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
  payload += "\"ts\":" + String((unsigned long)unix_ts) + ",";
  payload += "\"gpio\":" + String(gpio) + ",";
  payload += "\"alert_type\":\"" + alert_type + "\",";
  payload += "\"message\":\"" + message + "\"";
  payload += "}";
  mqttClient.safePublish(String(topic), payload, 1);
}
