#include "topic_builder.h"
#include "logger.h"

// ============================================
// STATIC MEMBER INITIALIZATION
// ============================================
char TopicBuilder::topic_buffer_[256];
char TopicBuilder::esp_id_[32] = "unknown";
char TopicBuilder::kaiser_id_[64] = "god";

// ============================================
// CONFIGURATION
// ============================================
void TopicBuilder::setEspId(const char* esp_id) {
  strncpy(esp_id_, esp_id, sizeof(esp_id_) - 1);
  esp_id_[sizeof(esp_id_) - 1] = '\0';
}

void TopicBuilder::setKaiserId(const char* kaiser_id) {
  strncpy(kaiser_id_, kaiser_id, sizeof(kaiser_id_) - 1);
  kaiser_id_[sizeof(kaiser_id_) - 1] = '\0';
}

// ============================================
// BUFFER VALIDATION HELPER
// ============================================
// Validates snprintf result for encoding errors and truncation
// Returns empty string on error for safe error handling
const char* TopicBuilder::validateTopicBuffer(int snprintf_result) {
  // ✅ Check 1: Encoding error (snprintf returned negative)
  if (snprintf_result < 0) {
    LOG_ERROR("TopicBuilder: snprintf encoding error!");
    return "";
  }
  
  // ✅ Check 2: Buffer overflow (truncation occurred)
  if (snprintf_result >= (int)sizeof(topic_buffer_)) {
    LOG_ERROR("TopicBuilder: Topic truncated! Required: " + 
              String(snprintf_result) + " bytes, buffer: " + 
              String(sizeof(topic_buffer_)) + " bytes");
    return "";
  }
  
  // ✅ Success: Return buffer pointer
  return topic_buffer_;
}

// ============================================
// PHASE 1: 8 CRITICAL TOPIC PATTERNS
// ============================================

// Pattern 1: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
const char* TopicBuilder::buildSensorDataTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/sensor/%d/data",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}

// Pattern 2: kaiser/god/esp/{esp_id}/sensor/batch
const char* TopicBuilder::buildSensorBatchTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/sensor/batch",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

// Pattern 3: kaiser/god/esp/{esp_id}/actuator/{gpio}/command
const char* TopicBuilder::buildActuatorCommandTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/actuator/%d/command",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}

// Pattern 4: kaiser/god/esp/{esp_id}/actuator/{gpio}/status
const char* TopicBuilder::buildActuatorStatusTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/actuator/%d/status",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}

// Phase 5: kaiser/god/esp/{esp_id}/actuator/{gpio}/response
const char* TopicBuilder::buildActuatorResponseTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/actuator/%d/response",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}

// Phase 5: kaiser/god/esp/{esp_id}/actuator/{gpio}/alert
const char* TopicBuilder::buildActuatorAlertTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/actuator/%d/alert",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}

// Phase 5: kaiser/god/esp/{esp_id}/actuator/emergency
const char* TopicBuilder::buildActuatorEmergencyTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/actuator/emergency",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

// Pattern 5: kaiser/god/esp/{esp_id}/system/heartbeat
const char* TopicBuilder::buildSystemHeartbeatTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/system/heartbeat",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

// Pattern 6: kaiser/god/esp/{esp_id}/system/command
const char* TopicBuilder::buildSystemCommandTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/system/command",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

// Phase 7: kaiser/god/esp/{esp_id}/system/diagnostics
const char* TopicBuilder::buildSystemDiagnosticsTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/system/diagnostics",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

// Pattern 7: kaiser/god/esp/{esp_id}/config
const char* TopicBuilder::buildConfigTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/%s/esp/%s/config",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

// Config response: kaiser/god/esp/{esp_id}/config_response
const char* TopicBuilder::buildConfigResponseTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/config_response",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

// Pattern 8: kaiser/broadcast/emergency
const char* TopicBuilder::buildBroadcastEmergencyTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_), 
                         "kaiser/broadcast/emergency");
  return validateTopicBuffer(written);
}

// Phase 9: Subzone Management Topics

const char* TopicBuilder::buildSubzoneAssignTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/subzone/assign",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

const char* TopicBuilder::buildSubzoneRemoveTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/subzone/remove",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

const char* TopicBuilder::buildSubzoneAckTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/subzone/ack",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

const char* TopicBuilder::buildSubzoneStatusTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/subzone/status",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}

const char* TopicBuilder::buildSubzoneSafeTopic() {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/subzone/safe",
                         kaiser_id_, esp_id_);
  return validateTopicBuffer(written);
}
