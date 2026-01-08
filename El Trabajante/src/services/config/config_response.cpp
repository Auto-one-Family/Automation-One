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

// ============================================
// PHASE 4: PUBLISH WITH FAILURES
// ============================================

bool ConfigResponseBuilder::publishWithFailures(
    ConfigType type,
    uint8_t success_count,
    uint8_t fail_count,
    const std::vector<ConfigFailureItem>& failures) {

  // Determine status based on counts
  ConfigStatus status;
  if (fail_count == 0) {
    status = ConfigStatus::SUCCESS;
  } else if (success_count > 0) {
    status = ConfigStatus::PARTIAL_SUCCESS;
  } else {
    status = ConfigStatus::ERROR;
  }

  String json_payload = buildJsonPayloadWithFailures(type, status, success_count, fail_count, failures);
  String topic = String(TopicBuilder::buildConfigResponseTopic());

  bool published = mqttClient.safePublish(topic, json_payload, 1);
  if (published) {
    LOG_INFO("ConfigResponse published [" + String(configTypeToString(type)) +
             "] status=" + String(configStatusToString(status)) +
             " success=" + String(success_count) +
             " failed=" + String(fail_count));
  } else {
    LOG_ERROR("ConfigResponse publish failed for topic: " + topic);
  }

  return published;
}

String ConfigResponseBuilder::buildJsonPayloadWithFailures(
    ConfigType type,
    ConfigStatus status,
    uint8_t success_count,
    uint8_t fail_count,
    const std::vector<ConfigFailureItem>& failures) {

  // Calculate document size: base + failures array
  // Base: ~200 bytes, each failure: ~100 bytes
  size_t doc_size = 256 + (failures.size() * 128);
  if (doc_size > 2048) doc_size = 2048;  // Cap at 2KB

  DynamicJsonDocument doc(doc_size);

  // Status
  doc["status"] = configStatusToString(status);
  doc["type"] = configTypeToString(type);
  doc["count"] = success_count;
  doc["failed_count"] = fail_count;

  // Generate message based on status
  String message;
  if (status == ConfigStatus::SUCCESS) {
    message = "Configured " + String(success_count) + " item(s) successfully";
  } else if (status == ConfigStatus::PARTIAL_SUCCESS) {
    message = String(success_count) + " configured, " + String(fail_count) + " failed";
  } else {
    message = "All " + String(fail_count) + " item(s) failed to configure";
  }
  doc["message"] = message;

  // Add failures array (limit to MAX_CONFIG_FAILURES)
  if (!failures.empty()) {
    JsonArray arr = doc.createNestedArray("failures");
    size_t max_failures = min(failures.size(), (size_t)MAX_CONFIG_FAILURES);

    for (size_t i = 0; i < max_failures; i++) {
      const auto& f = failures[i];
      JsonObject obj = arr.createNestedObject();
      obj["type"] = f.type;
      obj["gpio"] = f.gpio;
      obj["error_code"] = f.error_code;
      obj["error"] = f.error_name;
      if (f.detail.length() > 0) {
        obj["detail"] = f.detail;
      }
    }

    // If there were more failures than we could store, add a note
    if (failures.size() > MAX_CONFIG_FAILURES) {
      doc["failures_truncated"] = true;
      doc["total_failures"] = failures.size();
    }
  }

  String json;
  serializeJson(doc, json);
  return json;
}

