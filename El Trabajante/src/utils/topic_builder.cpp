#include "topic_builder.h"
#include "logger.h"

String TopicBuilder::buildTopic(const String& kaiser_id, 
                                const String& esp_id,
                                const String& topic_type, 
                                const String& gpio) {
  char topic_buffer[BUFFER_SIZE];
  
  // ✅ FIX #2: snprintf mit Return-Wert prüfen
  int written;
  if (gpio.length() > 0) {
    written = snprintf(topic_buffer, BUFFER_SIZE, 
                      "kaiser/%s/esp/%s/%s/%s",
                      kaiser_id.c_str(),
                      esp_id.c_str(),
                      topic_type.c_str(),
                      gpio.c_str());
  } else {
    written = snprintf(topic_buffer, BUFFER_SIZE, 
                      "kaiser/%s/esp/%s/%s",
                      kaiser_id.c_str(),
                      esp_id.c_str(),
                      topic_type.c_str());
  }
  
  // ✅ FIX #2: Truncation-Prüfung
  if (written < 0) {
    LOG_ERROR("TopicBuilder: snprintf failed (encoding error)");
    return "";
  }
  
  if (written >= BUFFER_SIZE) {
    LOG_ERROR("TopicBuilder: Topic truncated! Required: " + String(written) + 
              " bytes, buffer: " + String(BUFFER_SIZE) + " bytes");
    return "";
  }
  
  return String(topic_buffer);
}

String TopicBuilder::buildSpecialTopic(const String& kaiser_id,
                                      const String& esp_id,
                                      const String& topic_type,
                                      const String& subpath) {
  char topic_buffer[BUFFER_SIZE];
  
  int written;
  if (subpath.length() > 0) {
    written = snprintf(topic_buffer, BUFFER_SIZE, 
                      "kaiser/%s/esp/%s/%s/%s",
                      kaiser_id.c_str(),
                      esp_id.c_str(),
                      topic_type.c_str(),
                      subpath.c_str());
  } else {
    written = snprintf(topic_buffer, BUFFER_SIZE, 
                      "kaiser/%s/esp/%s/%s",
                      kaiser_id.c_str(),
                      esp_id.c_str(),
                      topic_type.c_str());
  }
  
  if (written < 0 || written >= BUFFER_SIZE) {
    LOG_ERROR("TopicBuilder: buildSpecialTopic truncated");
    return "";
  }
  
  return String(topic_buffer);
}

String TopicBuilder::buildBroadcastTopic(const String& kaiser_id,
                                        const String& topic_type) {
  char topic_buffer[BUFFER_SIZE];
  
  int written = snprintf(topic_buffer, BUFFER_SIZE, 
                        "kaiser/%s/broadcast/%s",
                        kaiser_id.c_str(),
                        topic_type.c_str());
  
  if (written < 0 || written >= BUFFER_SIZE) {
    LOG_ERROR("TopicBuilder: buildBroadcastTopic truncated");
    return "";
  }
  
  return String(topic_buffer);
}

String TopicBuilder::buildHierarchicalTopic(const String& kaiser_id,
                                           const String& master_zone_id,
                                           const String& esp_id,
                                           const String& subzone_id,
                                           const String& gpio) {
  char topic_buffer[BUFFER_SIZE];
  
  int written = snprintf(topic_buffer, BUFFER_SIZE, 
                        "kaiser/%s/master/%s/esp/%s/subzone/%s/%s",
                        kaiser_id.c_str(),
                        master_zone_id.c_str(),
                        esp_id.c_str(),
                        subzone_id.c_str(),
                        gpio.c_str());
  
  if (written < 0 || written >= BUFFER_SIZE) {
    LOG_ERROR("TopicBuilder: buildHierarchicalTopic truncated");
    return "";
  }
  
  return String(topic_buffer);
}
