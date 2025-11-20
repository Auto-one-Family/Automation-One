#ifndef SERVICES_CONFIG_CONFIG_RESPONSE_H
#define SERVICES_CONFIG_CONFIG_RESPONSE_H

#include <Arduino.h>
#include <ArduinoJson.h>

#include "../../models/config_types.h"
#include "../../models/error_codes.h"
#include "../../services/communication/mqtt_client.h"
#include "../../utils/logger.h"
#include "../../utils/topic_builder.h"

/**
 * @brief Helper for publishing standardized configuration responses.
 */
class ConfigResponseBuilder {
public:
  static bool publishSuccess(ConfigType type, uint8_t count, const String& message);

  static bool publishError(ConfigType type,
                           ConfigErrorCode error_code,
                           const String& message,
                           JsonVariantConst failed_item = JsonVariantConst());

  static bool publish(const ConfigResponsePayload& payload);

private:
  static String buildJsonPayload(const ConfigResponsePayload& payload);
};

#endif  // SERVICES_CONFIG_CONFIG_RESPONSE_H

