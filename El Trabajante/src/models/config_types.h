#ifndef MODELS_CONFIG_TYPES_H
#define MODELS_CONFIG_TYPES_H

#include <Arduino.h>
#include <ArduinoJson.h>

/**
 * @brief Status values for configuration responses.
 */
enum class ConfigStatus : uint8_t {
  SUCCESS = 0,
  ERROR = 1
};

/**
 * @brief Configuration types that can emit responses.
 */
enum class ConfigType : uint8_t {
  SENSOR = 0,
  ACTUATOR,
  WIFI,
  ZONE,
  SYSTEM,
  UNKNOWN
};

/**
 * @brief Unified MQTT payload for configuration responses.
 *
 * Matches the structure documented in docs/MQTT_CLIENT_API.md.
 */
struct ConfigResponsePayload {
  ConfigStatus status;
  ConfigType type;
  uint8_t count;
  String message;
  String error_code;
  DynamicJsonDocument failed_item;

  ConfigResponsePayload()
      : status(ConfigStatus::SUCCESS),
        type(ConfigType::UNKNOWN),
        count(0),
        message(""),
        error_code(""),
        failed_item(256) {}

  bool hasFailedItem() const {
    return !failed_item.isNull() && failed_item.size() > 0;
  }
};

inline const char* configStatusToString(ConfigStatus status) {
  return status == ConfigStatus::SUCCESS ? "success" : "error";
}

inline const char* configTypeToString(ConfigType type) {
  switch (type) {
    case ConfigType::SENSOR:
      return "sensor";
    case ConfigType::ACTUATOR:
      return "actuator";
    case ConfigType::WIFI:
      return "wifi";
    case ConfigType::ZONE:
      return "zone";
    case ConfigType::SYSTEM:
      return "system";
    default:
      return "unknown";
  }
}

#endif  // MODELS_CONFIG_TYPES_H

