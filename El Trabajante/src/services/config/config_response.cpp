#include "config_response.h"

bool ConfigResponseBuilder::publishSuccess(ConfigType type,
                                           uint8_t count,
                                           const String& message) {
  ConfigResponsePayload payload;
  payload.status = ConfigStatus::SUCCESS;
  payload.type = type;
  payload.count = count;
  payload.message = message;
  payload.error_code = "NONE";
  payload.failed_item.clear();
  return publish(payload);
}

bool ConfigResponseBuilder::publishError(ConfigType type,
                                         ConfigErrorCode error_code,
                                         const String& message,
                                         JsonVariantConst failed_item) {
  ConfigResponsePayload payload;
  payload.status = ConfigStatus::ERROR;
  payload.type = type;
  payload.count = 0;
  payload.message = message;
  payload.error_code = String(configErrorCodeToString(error_code));
  payload.failed_item.clear();

  if (!failed_item.isNull()) {
    payload.failed_item.set(failed_item);
  }

  return publish(payload);
}

bool ConfigResponseBuilder::publish(const ConfigResponsePayload& payload) {
  String json_payload = buildJsonPayload(payload);
  String topic = String(TopicBuilder::buildConfigResponseTopic());

  bool published = mqttClient.safePublish(topic, json_payload, 1);
  if (published) {
    LOG_INFO("ConfigResponse published [" + String(configTypeToString(payload.type)) +
             "] status=" + String(configStatusToString(payload.status)));
  } else {
    LOG_ERROR("ConfigResponse publish failed for topic: " + topic);
  }

  return published;
}

String ConfigResponseBuilder::buildJsonPayload(const ConfigResponsePayload& payload) {
  DynamicJsonDocument doc(512);
  doc["status"] = configStatusToString(payload.status);
  doc["type"] = configTypeToString(payload.type);
  doc["count"] = payload.count;
  if (payload.message.length() > 0) {
    doc["message"] = payload.message;
  } else {
    doc["message"] = payload.status == ConfigStatus::SUCCESS ? "ok" : "error";
  }

  if (payload.status == ConfigStatus::ERROR) {
    const String code = payload.error_code.length() > 0 ? payload.error_code : "UNKNOWN_ERROR";
    doc["error_code"] = code;
    if (payload.failed_item.size() > 0 && payload.failed_item.is<JsonObject>()) {
      doc["failed_item"] = payload.failed_item.as<JsonObjectConst>();
    }
  }

  String json;
  serializeJson(doc, json);
  return json;
}

