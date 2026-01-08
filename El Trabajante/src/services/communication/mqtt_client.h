#ifndef SERVICES_COMMUNICATION_MQTT_CLIENT_H
#define SERVICES_COMMUNICATION_MQTT_CLIENT_H

#include <PubSubClient.h>
#include <WiFiClient.h>
#include <Arduino.h>
#include <functional>
#include "../../utils/logger.h"
#include "../../utils/topic_builder.h"
#include "../../error_handling/error_tracker.h"
#include "../../error_handling/circuit_breaker.h"
#include "../../models/system_types.h"

// ============================================
// MQTT CONFIGURATION STRUCTURE
// ============================================
struct MQTTConfig {
    String server;
    uint16_t port;
    String client_id;
    String username;        // Optional - can be empty (Anonymous Mode)
    String password;        // Optional - can be empty (Anonymous Mode)
    int keepalive;
    int timeout;
};

// ============================================
// MQTT MESSAGE (for offline buffer)
// ============================================
struct MQTTMessage {
    String topic;
    String payload;
    uint8_t qos;
    unsigned long timestamp;
};

// ============================================
// MQTT CLIENT CLASS (Phase 2 - Communication Layer)
// ============================================
class MQTTClient {
public:
    // Singleton Pattern
    static MQTTClient& getInstance();
    
    // Initialization
    bool begin();
    
    // Connection Management
    bool connect(const MQTTConfig& config);
    bool disconnect();
    bool isConnected();
    void reconnect();
    
    // Authentication Transition (Anonymous → Authenticated)
    bool transitionToAuthenticated(const String& username, const String& password);
    bool isAnonymousMode() const;
    
    // Publishing
    bool publish(const String& topic, const String& payload, uint8_t qos = 1);
    bool safePublish(const String& topic, const String& payload, uint8_t qos = 1, uint8_t retries = 3);
  void setTestPublishHook(std::function<void(const String&, const String&)> hook);
  void clearTestPublishHook();
    
    // Subscription
    bool subscribe(const String& topic);
    bool unsubscribe(const String& topic);
    void setCallback(std::function<void(const String&, const String&)> callback);
    
    // Heartbeat
    void publishHeartbeat(bool force = false);
    
    // Status
    String getConnectionStatus();
    uint16_t getConnectionAttempts() const;
    bool hasOfflineMessages() const;
    uint16_t getOfflineMessageCount() const;
    
    // Monitoring
    void loop();  // Call in main loop
    
private:
    MQTTClient();
    ~MQTTClient();
    
    // Prevent copy
    MQTTClient(const MQTTClient&) = delete;
    MQTTClient& operator=(const MQTTClient&) = delete;
    
    // Private members
    WiFiClient wifi_client_;
    PubSubClient mqtt_;
    MQTTConfig current_config_;
    
    // Offline buffer
    static const uint16_t MAX_OFFLINE_MESSAGES = 100;
    MQTTMessage offline_buffer_[MAX_OFFLINE_MESSAGES];
    uint16_t offline_buffer_count_;
    
    // Connection management
    unsigned long last_reconnect_attempt_;
    uint16_t reconnect_attempts_;
    unsigned long reconnect_delay_ms_;
    bool initialized_;
    bool anonymous_mode_;
    
    // Heartbeat
    unsigned long last_heartbeat_;
    static const unsigned long HEARTBEAT_INTERVAL_MS = 60000;  // 60 seconds
    
    // Callback
    std::function<void(const String&, const String&)> message_callback_;
    
    // Circuit Breaker (Phase 6+)
    CircuitBreaker circuit_breaker_;
    
    // Helper methods
    bool connectToBroker();
    bool attemptMQTTConnection(const String& last_will_topic, const String& last_will_message);  // ✅ FIX #2: Port fallback helper
    void handleDisconnection();
    bool shouldAttemptReconnect() const;
    void processOfflineBuffer();
    bool addToOfflineBuffer(const String& topic, const String& payload, uint8_t qos);
    unsigned long calculateBackoffDelay() const;
    
    // Static callback for PubSubClient
    static void staticCallback(char* topic, byte* payload, unsigned int length);
    static MQTTClient* instance_;
  static std::function<void(const String&, const String&)> test_publish_hook_;
};

// ============================================
// GLOBAL MQTT CLIENT INSTANCE
// ============================================
extern MQTTClient& mqttClient;

#endif // SERVICES_COMMUNICATION_MQTT_CLIENT_H
