#ifndef UTILS_TOPIC_BUILDER_H
#define UTILS_TOPIC_BUILDER_H

#include <Arduino.h>

// ============================================
// TOPIC BUILDER STATIC CLASS (Phase 1 - Guide-konform)
// ============================================
class TopicBuilder {
public:
  // Configuration
  static void setEspId(const char* esp_id);
  static void setKaiserId(const char* kaiser_id);
  
  // Phase 1: 8 Critical Topic Patterns (Guide-konform)
  static const char* buildSensorDataTopic(uint8_t gpio);        // Pattern 1
  static const char* buildSensorBatchTopic();                   // Pattern 2
  // ✅ Phase 2C: Sensor Command/Response Topics (On-Demand Measurement)
  static const char* buildSensorCommandTopic(uint8_t gpio);     // Phase 2C
  static const char* buildSensorResponseTopic(uint8_t gpio);    // Phase 2C
  static const char* buildActuatorCommandTopic(uint8_t gpio);   // Pattern 3
  static const char* buildActuatorStatusTopic(uint8_t gpio);    // Pattern 4
  static const char* buildActuatorResponseTopic(uint8_t gpio);  // Phase 5
  static const char* buildActuatorAlertTopic(uint8_t gpio);     // Phase 5
  static const char* buildActuatorEmergencyTopic();             // Phase 5
  static const char* buildSystemHeartbeatTopic();               // Pattern 5
  static const char* buildSystemHeartbeatAckTopic();            // Phase 2: Heartbeat-ACK (Server → ESP)
  static const char* buildSystemCommandTopic();                 // Pattern 6
  static const char* buildSystemDiagnosticsTopic();             // Phase 7
  static const char* buildSystemErrorTopic();                   // Phase 0 Bug-Fix
  static const char* buildConfigTopic();                        // Pattern 7
  static const char* buildConfigResponseTopic();
  static const char* buildBroadcastEmergencyTopic();            // Pattern 8
  
  // Phase 9: Subzone Management Topics
  static const char* buildSubzoneAssignTopic();      // kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign
  static const char* buildSubzoneRemoveTopic();      // kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove
  static const char* buildSubzoneAckTopic();         // kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack
  static const char* buildSubzoneStatusTopic();      // kaiser/{kaiser_id}/esp/{esp_id}/subzone/status
  static const char* buildSubzoneSafeTopic();        // kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe
  
private:
  static char topic_buffer_[256];
  static char esp_id_[32];
  static char kaiser_id_[64];
  // ✅ Buffer-Validation Helper (fix for buffer-overflow protection)
  static const char* validateTopicBuffer(int snprintf_result);
  
  TopicBuilder() = delete;  // Static class only
};

#endif
