#include "actuator_manager.h"

#include <memory>

#include "../../drivers/gpio_manager.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"
#include "../../services/communication/mqtt_client.h"
#include "../../services/sensor/sensor_manager.h"
#include "../../utils/logger.h"
#include "../../utils/topic_builder.h"
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

RegisteredActuator* ActuatorManager::getFreeSlot() {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (!actuators_[i].in_use) {
      return &actuators_[i];
    }
  }
  return nullptr;
}

RegisteredActuator* ActuatorManager::findActuator(uint8_t gpio) {
  for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
    if (actuators_[i].in_use && actuators_[i].gpio == gpio) {
      return &actuators_[i];
    }
  }
  return nullptr;
}

const RegisteredActuator* ActuatorManager::findActuator(uint8_t gpio) const {
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
    return std::make_unique<PumpActuator>();
  }
  if (actuator_type == ActuatorTypeTokens::PWM) {
    return std::make_unique<PWMActuator>();
  }
  if (actuator_type == ActuatorTypeTokens::VALVE) {
    return std::make_unique<ValveActuator>();
  }
  if (actuator_type == ActuatorTypeTokens::RELAY) {
    return std::make_unique<PumpActuator>();  // Relay handled like pump (binary)
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

  if (hasActuatorOnGPIO(config.gpio)) {
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
  actuator_count_++;

  LOG_INFO("Actuator configured on GPIO " + String(config.gpio) +
           " type: " + config.actuator_type);
  publishActuatorStatus(config.gpio);
  return true;
}

bool ActuatorManager::removeActuator(uint8_t gpio) {
  RegisteredActuator* actuator = findActuator(gpio);
  if (!actuator) {
    return false;
  }

  if (actuator->driver) {
    actuator->driver->end();
    actuator->driver.reset();
  }

  actuator->in_use = false;
  actuator->gpio = 255;
  actuator->config = ActuatorConfig();
  actuator->emergency_stopped = false;
  actuator_count_ = actuator_count_ > 0 ? actuator_count_ - 1 : 0;
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

  if (!validateActuatorValue(actuator->config.actuator_type, value)) {
    LOG_ERROR("Actuator value out of range for GPIO " + String(gpio));
    errorTracker.trackError(ERROR_COMMAND_INVALID,
                            ERROR_SEVERITY_ERROR,
                            "Actuator value invalid");
    return false;
  }

  bool success = actuator->driver->setValue(value);
  actuator->config = actuator->driver->getConfig();
  if (success) {
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
  if (success) {
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

bool ActuatorManager::parseActuatorDefinition(const String& json, ActuatorConfig& config) const {
  config = ActuatorConfig();
  config.gpio = static_cast<uint8_t>(extractJSONUInt32(json, "gpio", 255));
  config.aux_gpio = static_cast<uint8_t>(extractJSONUInt32(json, "aux_gpio", 255));
  config.actuator_type = extractJSONString(json, "type");
  if (config.actuator_type.length() == 0) {
    config.actuator_type = extractJSONString(json, "actuator_type");
  }
  config.actuator_name = extractJSONString(json, "name");
  config.subzone_id = extractJSONString(json, "subzone_id");
  config.active = extractJSONBool(json, "active", true);
  config.critical = extractJSONBool(json, "critical", false);
  config.inverted_logic = extractJSONBool(json, "inverted", false);
  config.default_state = extractJSONBool(json, "default_state", false);
  config.default_pwm = static_cast<uint8_t>(extractJSONUInt32(json, "default_pwm", 0));
  return config.gpio != 255 && config.actuator_type.length() > 0;
}

bool ActuatorManager::handleActuatorConfig(const String& payload) {
  int array_start = payload.indexOf("\"actuators\"");
  if (array_start == -1) {
    LOG_ERROR("Actuator config payload missing 'actuators'");
    return false;
  }
  array_start = payload.indexOf('[', array_start);
  if (array_start == -1) {
    LOG_ERROR("Actuator config payload missing array start");
    return false;
  }
  int array_end = payload.indexOf(']', array_start);
  if (array_end == -1) {
    LOG_ERROR("Actuator config payload missing array end");
    return false;
  }

  String array_content = payload.substring(array_start + 1, array_end);
  uint8_t configured = 0;

  int depth = 0;
  int object_start = -1;
  for (int i = 0; i < array_content.length(); i++) {
    char c = array_content[i];
    if (c == '{') {
      if (depth == 0) {
        object_start = i;
      }
      depth++;
    } else if (c == '}') {
      depth--;
      if (depth == 0 && object_start != -1) {
        String obj = array_content.substring(object_start, i + 1);
        ActuatorConfig config;
        if (parseActuatorDefinition(obj, config)) {
          if (configureActuator(config)) {
            configured++;
          }
        }
        object_start = -1;
      }
    }
  }

  LOG_INFO("ActuatorManager applied " + String(configured) + " actuator configs");
  return configured > 0;
}

String ActuatorManager::buildStatusPayload(const ActuatorStatus& status, const ActuatorConfig& config) const {
  String payload = "{";
  payload += "\"ts\":" + String(millis()) + ",";
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
  String payload = "{";
  payload += "\"ts\":" + String(millis()) + ",";
  payload += "\"gpio\":" + String(command.gpio) + ",";
  payload += "\"command\":\"" + command.command + "\",";
  payload += "\"value\":" + String(command.value, 3) + ",";
  payload += "\"duration\":" + String(command.duration_s) + ",";
  payload += "\"success\":" + String(success ? "true" : "false") + ",";
  payload += "\"message\":\"" + message + "\"";
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
  const char* topic = TopicBuilder::buildActuatorAlertTopic(gpio);
  String payload = "{";
  payload += "\"ts\":" + String(millis()) + ",";
  payload += "\"gpio\":" + String(gpio) + ",";
  payload += "\"type\":\"" + alert_type + "\",";
  payload += "\"message\":\"" + message + "\"";
  payload += "}";
  mqttClient.safePublish(String(topic), payload, 1);
}
