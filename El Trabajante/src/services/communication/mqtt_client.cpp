#include "mqtt_client.h"
#include "../../models/error_codes.h"
#include "../../services/config/config_manager.h"
#include "../../services/sensor/sensor_manager.h"
#include "../../services/actuator/actuator_manager.h"
#include "../../utils/time_manager.h"
#include <WiFi.h>

// ============================================
// EXTERNAL GLOBAL VARIABLES (from main.cpp)
// ============================================
extern KaiserZone g_kaiser;
extern SystemConfig g_system_config;

// ============================================
// CONSTANTS
// ============================================
const unsigned long RECONNECT_BASE_DELAY_MS = 1000;   // 1 second
const unsigned long RECONNECT_MAX_DELAY_MS = 60000;   // 60 seconds
const uint16_t MAX_RECONNECT_ATTEMPTS = 10;

// ============================================
// STATIC MEMBERS
// ============================================
MQTTClient* MQTTClient::instance_ = nullptr;
std::function<void(const String&, const String&)> MQTTClient::test_publish_hook_;

// ============================================
// GLOBAL MQTT CLIENT INSTANCE
// ============================================
MQTTClient& mqttClient = MQTTClient::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
MQTTClient& MQTTClient::getInstance() {
    static MQTTClient instance;
    instance_ = &instance;
    return instance;
}

// ============================================
// CONSTRUCTOR / DESTRUCTOR
// ============================================
MQTTClient::MQTTClient() 
    : mqtt_(wifi_client_),
      offline_buffer_count_(0),
      last_reconnect_attempt_(0),
      reconnect_attempts_(0),
      reconnect_delay_ms_(RECONNECT_BASE_DELAY_MS),
      initialized_(false),
      anonymous_mode_(true),
      last_heartbeat_(0),
      circuit_breaker_("MQTT", 5, 30000, 10000) {
  // Circuit Breaker configured:
  // - 5 failures → OPEN
  // - 30s recovery timeout
  // - 10s half-open test timeout
}

MQTTClient::~MQTTClient() {
    disconnect();
}

// ============================================
// INITIALIZATION
// ============================================
bool MQTTClient::begin() {
    if (initialized_) {
        LOG_WARNING("MQTTClient already initialized");
        return true;
    }
    
    mqtt_.setCallback(staticCallback);
    
    initialized_ = true;
    LOG_INFO("MQTTClient initialized");
    return true;
}

// ============================================
// CONNECTION MANAGEMENT
// ============================================
bool MQTTClient::connect(const MQTTConfig& config) {
    if (!initialized_) {
        LOG_ERROR("MQTTClient not initialized");
        errorTracker.logCommunicationError(ERROR_MQTT_INIT_FAILED, 
                                           "MQTTClient not initialized");
        return false;
    }
    
    // Validate config
    if (config.server.length() == 0) {
        LOG_ERROR("MQTT server address is empty");
        errorTracker.logCommunicationError(ERROR_MQTT_INIT_FAILED, 
                                           "MQTT server address is empty");
        return false;
    }
    
    current_config_ = config;
    reconnect_attempts_ = 0;
    reconnect_delay_ms_ = RECONNECT_BASE_DELAY_MS;
    
    // Check authentication mode
    anonymous_mode_ = (config.username.length() == 0);
    if (anonymous_mode_) {
        LOG_INFO("MQTT connecting in Anonymous Mode");
    } else {
        LOG_INFO("MQTT connecting with authentication");
    }
    
    // Set server
    mqtt_.setServer(config.server.c_str(), config.port);
    mqtt_.setKeepAlive(config.keepalive);
    
    return connectToBroker();
}

bool MQTTClient::connectToBroker() {
    LOG_INFO("Connecting to MQTT broker: " + current_config_.server + ":" + String(current_config_.port));

    // ============================================
    // LAST-WILL CONFIGURATION (Critical for ESP failure detection)
    // ============================================
    // Build Last-Will Topic: kaiser/{kaiser_id}/esp/{esp_id}/status/will
    // Use Heartbeat topic and replace /heartbeat with /will
    String last_will_topic = String(TopicBuilder::buildSystemHeartbeatTopic());
    last_will_topic.replace("/heartbeat", "/will");

    // Build Last-Will Message: JSON with offline status
    // Phase 8: Use NTP-synchronized Unix timestamp
    time_t will_timestamp = timeManager.getUnixTimestamp();
    String last_will_message = "{\"status\":\"offline\",\"reason\":\"unexpected_disconnect\",\"timestamp\":" +
                               String((unsigned long)will_timestamp) + "}";

    LOG_INFO("Last-Will Topic: " + last_will_topic);
    LOG_INFO("Last-Will Message: " + last_will_message);

    // ✅ FIX #2: Auto-Fallback von Port 8883 → 1883
    // Try configured port first (likely 8883 for TLS)
    bool connected = attemptMQTTConnection(last_will_topic, last_will_message);

    // If connection failed and port is 8883 (TLS), try fallback to 1883 (plain MQTT)
    if (!connected && current_config_.port == 8883) {
        LOG_WARNING("╔════════════════════════════════════════╗");
        LOG_WARNING("║  ⚠️  MQTT PORT FALLBACK               ║");
        LOG_WARNING("╚════════════════════════════════════════╝");
        LOG_WARNING("Port 8883 (TLS) failed - trying port 1883 (plain MQTT)");
        LOG_WARNING("Reason: Server may not support TLS on port 8883");
        LOG_WARNING("Empfehlung: Update .env.example MQTT_BROKER_PORT=1883");

        // Update port and retry
        current_config_.port = 1883;
        mqtt_.setServer(current_config_.server.c_str(), current_config_.port);

        LOG_INFO("Retrying MQTT connection with port 1883...");
        connected = attemptMQTTConnection(last_will_topic, last_will_message);

        if (connected) {
            LOG_INFO("✅ Port-Fallback successful! Connected on port 1883");
        }
    }

    if (connected) {
        LOG_INFO("MQTT connected!");
        reconnect_attempts_ = 0;
        reconnect_delay_ms_ = RECONNECT_BASE_DELAY_MS;

        // Reset Circuit Breaker on successful connection (Phase 6+)
        circuit_breaker_.recordSuccess();

        // Process offline buffer
        processOfflineBuffer();

        return true;
    } else {
        LOG_ERROR("MQTT connection failed, rc=" + String(mqtt_.state()));
        errorTracker.logCommunicationError(ERROR_MQTT_CONNECT_FAILED,
                                           ("MQTT connection failed, rc=" + String(mqtt_.state())).c_str());
        return false;
    }
}

// ✅ FIX #2: Helper function for connection attempts
bool MQTTClient::attemptMQTTConnection(const String& last_will_topic, const String& last_will_message) {
    if (anonymous_mode_) {
        // Anonymous connection with Last-Will
        return mqtt_.connect(
            current_config_.client_id.c_str(),
            last_will_topic.c_str(),
            1,  // QoS 1 (At Least Once)
            true,  // Retain flag (God-Kaiser kann offline-Status später abrufen)
            last_will_message.c_str()
        );
    } else {
        // Authenticated connection with Last-Will
        return mqtt_.connect(
            current_config_.client_id.c_str(),
            current_config_.username.c_str(),
            current_config_.password.c_str(),
            last_will_topic.c_str(),
            1,  // QoS 1 (At Least Once)
            true,  // Retain flag
            last_will_message.c_str()
        );
    }
}

bool MQTTClient::disconnect() {
    if (mqtt_.connected()) {
        mqtt_.disconnect();
        LOG_INFO("MQTT disconnected");
    }
    return true;
}

bool MQTTClient::isConnected() {
    return mqtt_.connected();
}

void MQTTClient::reconnect() {
    if (isConnected()) {
        LOG_DEBUG("MQTT already connected");
        circuit_breaker_.recordSuccess();  // Reset on successful connection
        return;
    }
    
    // ============================================
    // CIRCUIT BREAKER CHECK (Phase 6+)
    // ============================================
    if (!circuit_breaker_.allowRequest()) {
        LOG_DEBUG("MQTT reconnect blocked by Circuit Breaker (waiting for recovery)");
        return;  // Skip reconnect attempt
    }
    
    if (!shouldAttemptReconnect()) {
        return;
    }
    
    reconnect_attempts_++;
    last_reconnect_attempt_ = millis();

    // ✅ IMPROVEMENT #3: Keine Reconnect-Limit (Circuit Breaker regelt Fehlerbehandlung)
    LOG_INFO("Attempting MQTT reconnection (attempt " +
             String(reconnect_attempts_) + ")");

    if (!connectToBroker()) {
        // ❌ RECONNECT FAILED
        circuit_breaker_.recordFailure();

        // Exponential backoff
        reconnect_delay_ms_ = calculateBackoffDelay();

        // ✅ IMPROVEMENT #3: MAX_RECONNECT_ATTEMPTS entfernt!
        // Circuit Breaker übernimmt Schutz vor unendlichen Reconnects
        // → Bei 5 Fehlern: 30s Pause automatisch

        // Check if Circuit Breaker opened
        if (circuit_breaker_.isOpen()) {
            LOG_WARNING("Circuit Breaker OPENED after reconnect failures");
            LOG_WARNING("  Will retry in 30 seconds");
            LOG_WARNING("  Attempt count: " + String(reconnect_attempts_));
        }
    } else {
        // ✅ RECONNECT SUCCESS
        circuit_breaker_.recordSuccess();
    }
}

// ============================================
// AUTHENTICATION TRANSITION
// ============================================
bool MQTTClient::transitionToAuthenticated(const String& username, const String& password) {
    if (!anonymous_mode_) {
        LOG_WARNING("Already in authenticated mode");
        return true;
    }
    
    LOG_INFO("Transitioning from Anonymous to Authenticated mode");
    
    // Update config
    current_config_.username = username;
    current_config_.password = password;
    anonymous_mode_ = false;
    
    // Reconnect with authentication
    disconnect();
    return connect(current_config_);
}

bool MQTTClient::isAnonymousMode() const {
    return anonymous_mode_;
}

// ============================================
// PUBLISHING (WITH CIRCUIT BREAKER - Phase 6+)
// ============================================
bool MQTTClient::publish(const String& topic, const String& payload, uint8_t qos) {
    if (test_publish_hook_) {
        test_publish_hook_(topic, payload);
        return true;
    }

    // ============================================
    // CIRCUIT BREAKER CHECK
    // ============================================
    if (!circuit_breaker_.allowRequest()) {
        LOG_WARNING("MQTT publish blocked by Circuit Breaker (Service DOWN)");
        LOG_DEBUG("  Topic: " + topic);
        LOG_DEBUG("  Circuit State: OPEN (waiting for recovery)");
        // Don't add to offline buffer when circuit is open - it will retry on recovery
        return false;
    }

    // ============================================
    // CONNECTION CHECK
    // ============================================
    if (!isConnected()) {
        LOG_WARNING("MQTT not connected, adding to offline buffer");
        circuit_breaker_.recordFailure();  // Connection failure counts
        return addToOfflineBuffer(topic, payload, qos);
    }
    
    // ============================================
    // MQTT PUBLISH
    // ============================================
    bool success = mqtt_.publish(topic.c_str(), payload.c_str(), qos == 1);
    
    if (success) {
        // ✅ SUCCESS
        circuit_breaker_.recordSuccess();
        LOG_DEBUG("Published: " + topic);
        
        // Optional: Payload preview (first 50 chars)
        if (payload.length() > 50) {
            LOG_DEBUG("  Payload: " + payload.substring(0, 50) + "...");
        } else {
            LOG_DEBUG("  Payload: " + payload);
        }
        
    } else {
        // ❌ FAILURE
        circuit_breaker_.recordFailure();
        LOG_ERROR("Publish failed: " + topic);
        errorTracker.logCommunicationError(ERROR_MQTT_PUBLISH_FAILED, 
                                           ("Publish failed: " + topic).c_str());
        
        // Check if Circuit Breaker opened
        if (circuit_breaker_.isOpen()) {
            LOG_WARNING("Circuit Breaker OPENED after failure threshold");
            LOG_WARNING("  MQTT will be unavailable for 30 seconds");
        }
        
        addToOfflineBuffer(topic, payload, qos);
    }
    
    return success;
}

bool MQTTClient::safePublish(const String& topic, const String& payload, uint8_t qos, uint8_t retries) {
    // Circuit Breaker is checked inside publish(), so we don't need to check here
    // But we reduce retries if Circuit Breaker is OPEN to avoid spam
    
    if (circuit_breaker_.isOpen()) {
        LOG_DEBUG("SafePublish: Circuit Breaker OPEN, skipping retries");
        return publish(topic, payload, qos);  // Single attempt only
    }
    
    for (uint8_t i = 0; i < retries; i++) {
        if (publish(topic, payload, qos)) {
            return true;
        }
        
        // Don't retry if Circuit Breaker opened during attempts
        if (circuit_breaker_.isOpen()) {
            LOG_DEBUG("SafePublish: Circuit Breaker OPENED, stopping retries");
            break;
        }
        
        delay(100);
    }
    
    LOG_ERROR("SafePublish failed after retries");
    return false;
}

// ============================================
// SUBSCRIPTION
// ============================================
bool MQTTClient::subscribe(const String& topic) {
    if (!isConnected()) {
        LOG_ERROR("Cannot subscribe, MQTT not connected");
        errorTracker.logCommunicationError(ERROR_MQTT_SUBSCRIBE_FAILED, 
                                           "Cannot subscribe, not connected");
        return false;
    }
    
    bool success = mqtt_.subscribe(topic.c_str());
    
    if (success) {
        LOG_INFO("Subscribed to: " + topic);
    } else {
        LOG_ERROR("Subscribe failed: " + topic);
        errorTracker.logCommunicationError(ERROR_MQTT_SUBSCRIBE_FAILED, 
                                           ("Subscribe failed: " + topic).c_str());
    }
    
    return success;
}

bool MQTTClient::unsubscribe(const String& topic) {
    if (!isConnected()) {
        LOG_WARNING("Cannot unsubscribe, MQTT not connected");
        return false;
    }
    
    bool success = mqtt_.unsubscribe(topic.c_str());
    
    if (success) {
        LOG_INFO("Unsubscribed from: " + topic);
    } else {
        LOG_ERROR("Unsubscribe failed: " + topic);
    }
    
    return success;
}

void MQTTClient::setCallback(std::function<void(const String&, const String&)> callback) {
    message_callback_ = callback;
}

// ============================================
// HEARTBEAT SYSTEM
// ============================================
void MQTTClient::publishHeartbeat() {
    unsigned long current_time = millis();
    
    if (current_time - last_heartbeat_ < HEARTBEAT_INTERVAL_MS) {
        return;
    }
    
    last_heartbeat_ = current_time;
    
    // Build heartbeat topic
    const char* topic = TopicBuilder::buildSystemHeartbeatTopic();
    
    // Build heartbeat payload (JSON) - Phase 7: Enhanced with Zone Info
    // Phase 8: Use NTP-synchronized Unix timestamp instead of millis()
    time_t unix_timestamp = timeManager.getUnixTimestamp();
    
    String payload = "{";
    payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
    payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
    payload += "\"master_zone_id\":\"" + g_kaiser.master_zone_id + "\",";
    payload += "\"zone_assigned\":" + String(g_kaiser.zone_assigned ? "true" : "false") + ",";
    payload += "\"ts\":" + String((unsigned long)unix_timestamp) + ",";
    payload += "\"uptime\":" + String(millis() / 1000) + ",";
    payload += "\"heap_free\":" + String(ESP.getFreeHeap()) + ",";
    payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
    payload += "\"sensor_count\":" + String(sensorManager.getActiveSensorCount()) + ",";
    payload += "\"actuator_count\":" + String(actuatorManager.getActiveActuatorCount());
    payload += "}";
    
    // Publish with QoS 0 (heartbeat doesn't need guaranteed delivery)
    publish(topic, payload, 0);
}

// ============================================
// MONITORING
// ============================================
void MQTTClient::loop() {
    if (!initialized_) {
        return;
    }
    
    // Phase 8: Maintain NTP time synchronization
    timeManager.loop();
    
    // Process MQTT loop
    if (isConnected()) {
        mqtt_.loop();
        
        // Publish heartbeat
        publishHeartbeat();
    } else {
        // Attempt reconnection
        reconnect();
    }
}

void MQTTClient::handleDisconnection() {
    static bool disconnection_logged = false;
    
    if (!disconnection_logged) {
        LOG_WARNING("MQTT disconnected");
        errorTracker.logCommunicationError(ERROR_MQTT_DISCONNECT, 
                                           "MQTT connection lost");
        disconnection_logged = true;
    }
    
    reconnect();
    
    if (isConnected()) {
        disconnection_logged = false;
    }
}

void MQTTClient::setTestPublishHook(std::function<void(const String&, const String&)> hook) {
    test_publish_hook_ = std::move(hook);
}

void MQTTClient::clearTestPublishHook() {
    test_publish_hook_ = nullptr;
}

bool MQTTClient::shouldAttemptReconnect() const {
    // Don't attempt if max attempts reached
    if (reconnect_attempts_ >= MAX_RECONNECT_ATTEMPTS) {
        return false;
    }
    
    // Wait for reconnect delay (exponential backoff)
    unsigned long current_time = millis();
    if (current_time - last_reconnect_attempt_ < reconnect_delay_ms_) {
        return false;
    }
    
    return true;
}

// ============================================
// OFFLINE BUFFER MANAGEMENT
// ============================================
void MQTTClient::processOfflineBuffer() {
    if (offline_buffer_count_ == 0) {
        return;
    }
    
    LOG_INFO("Processing offline buffer (" + String(offline_buffer_count_) + " messages)");
    
    uint16_t processed = 0;
    for (uint16_t i = 0; i < offline_buffer_count_; i++) {
        if (publish(offline_buffer_[i].topic, 
                   offline_buffer_[i].payload, 
                   offline_buffer_[i].qos)) {
            processed++;
        } else {
            // Failed to publish, keep remaining messages in buffer
            break;
        }
    }
    
    // Remove processed messages from buffer
    if (processed > 0) {
        uint16_t remaining = offline_buffer_count_ - processed;
        for (uint16_t i = 0; i < remaining; i++) {
            offline_buffer_[i] = offline_buffer_[i + processed];
        }
        offline_buffer_count_ = remaining;
        
        LOG_INFO("Processed " + String(processed) + " offline messages, " + 
                 String(remaining) + " remaining");
    }
}

bool MQTTClient::addToOfflineBuffer(const String& topic, const String& payload, uint8_t qos) {
    if (offline_buffer_count_ >= MAX_OFFLINE_MESSAGES) {
        LOG_ERROR("Offline buffer full, dropping message");
        errorTracker.logCommunicationError(ERROR_MQTT_BUFFER_FULL, 
                                           "Offline buffer full");
        return false;
    }
    
    offline_buffer_[offline_buffer_count_].topic = topic;
    offline_buffer_[offline_buffer_count_].payload = payload;
    offline_buffer_[offline_buffer_count_].qos = qos;
    offline_buffer_[offline_buffer_count_].timestamp = millis();
    offline_buffer_count_++;
    
    LOG_DEBUG("Added to offline buffer (count: " + String(offline_buffer_count_) + ")");
    return true;
}

// ============================================
// EXPONENTIAL BACKOFF CALCULATION
// ============================================
unsigned long MQTTClient::calculateBackoffDelay() const {
    // Exponential backoff: delay * 2^attempts
    unsigned long delay = RECONNECT_BASE_DELAY_MS * (1 << reconnect_attempts_);
    
    // Cap at max delay
    if (delay > RECONNECT_MAX_DELAY_MS) {
        delay = RECONNECT_MAX_DELAY_MS;
    }
    
    return delay;
}

// ============================================
// STATUS GETTERS
// ============================================
String MQTTClient::getConnectionStatus() {
    if (mqtt_.connected()) {
        return "Connected";
    }
    
    switch (mqtt_.state()) {
        case MQTT_CONNECTION_TIMEOUT:
            return "Connection timeout";
        case MQTT_CONNECTION_LOST:
            return "Connection lost";
        case MQTT_CONNECT_FAILED:
            return "Connect failed";
        case MQTT_DISCONNECTED:
            return "Disconnected";
        case MQTT_CONNECT_BAD_PROTOCOL:
            return "Bad protocol";
        case MQTT_CONNECT_BAD_CLIENT_ID:
            return "Bad client ID";
        case MQTT_CONNECT_UNAVAILABLE:
            return "Server unavailable";
        case MQTT_CONNECT_BAD_CREDENTIALS:
            return "Bad credentials";
        case MQTT_CONNECT_UNAUTHORIZED:
            return "Unauthorized";
        default:
            return "Unknown (" + String(mqtt_.state()) + ")";
    }
}

uint16_t MQTTClient::getConnectionAttempts() const {
    return reconnect_attempts_;
}

bool MQTTClient::hasOfflineMessages() const {
    return offline_buffer_count_ > 0;
}

uint16_t MQTTClient::getOfflineMessageCount() const {
    return offline_buffer_count_;
}

// ============================================
// STATIC CALLBACK FOR PUBSUBCLIENT
// ============================================
void MQTTClient::staticCallback(char* topic, byte* payload, unsigned int length) {
    if (!instance_) {
        return;
    }
    
    // Convert to String
    String topic_str = String(topic);
    String payload_str;
    payload_str.reserve(length);
    for (unsigned int i = 0; i < length; i++) {
        payload_str += (char)payload[i];
    }
    
    // Call user callback
    if (instance_->message_callback_) {
        instance_->message_callback_(topic_str, payload_str);
    }
}
