#ifndef UTILS_TOPIC_BUILDER_H
#define UTILS_TOPIC_BUILDER_H

#include <Arduino.h>

// TopicBuilder - Zentralisierte MQTT-Topic-Generierung
// KRITISCH: MQTT-Topic-Struktur muss UNVERÄNDERT bleiben für Backward-Compatibility!
class TopicBuilder {
public:
  // Standard Topic: kaiser/{kaiser_id}/esp/{esp_id}/{topic_type}/{gpio}
  static String buildTopic(const String& kaiser_id, 
                          const String& esp_id,
                          const String& topic_type, 
                          const String& gpio = "");
  
  // Special Topic: kaiser/{kaiser_id}/esp/{esp_id}/{topic_type}/{subpath}
  static String buildSpecialTopic(const String& kaiser_id,
                                 const String& esp_id,
                                 const String& topic_type,
                                 const String& subpath = "");
  
  // Broadcast Topic: kaiser/{kaiser_id}/broadcast/{topic_type}
  static String buildBroadcastTopic(const String& kaiser_id,
                                   const String& topic_type);
  
  // Hierarchical Topic: kaiser/{kaiser_id}/master/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/{gpio}
  static String buildHierarchicalTopic(const String& kaiser_id,
                                      const String& master_zone_id,
                                      const String& esp_id,
                                      const String& subzone_id,
                                      const String& gpio);
  
private:
  static const size_t BUFFER_SIZE = 256;
};

#endif
