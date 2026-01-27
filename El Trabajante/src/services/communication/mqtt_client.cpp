#include "mqtt_client.h"
#include "../../models/error_codes.h"
#include "../../services/config/config_manager.h"
#include "../../services/sensor/sensor_manager.h"
#include "../../services/actuator/actuator_manager.h"
#include "../../utils/time_manager.h"
#include "../../drivers/gpio_manager.h"  // Phase 1: GPIO Status
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
    // #region agent log
    Serial.print("[DEBUG]{\"id\":\"mqtt_connect_entry\",\"timestamp\":");
    Serial.print(millis());
    Serial.print(",\"location\":\"mqtt_client.cpp:84\",\"message\":\"MQTT connect() called\",\"data\":{\"server\":\"");
    Serial.print(config.server);
    Serial.print("\",\"port\":");
    Serial.print(config.port);
    Serial.print(",\"client_id\":\"");
    Serial.print(config.client_id);
    Serial.print("\",\"username_len\":");
    Serial.print(config.username.length());
    Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
    // #endregion
    
    if (!initialized_) {
        LOG_ERROR("MQTTClient not initialized");
        errorTracker.logCommunicationError(ERROR_MQTT_INIT_FAILED, 
                                           "MQTTClient not initialized");
        return false;
    }
    
    // Validate config
    if (config.server.length() == 0) {
        // #region agent log
        Serial.print("[DEBUG]{\"id\":\"mqtt_connect_empty_server\",\"timestamp\":");
        Serial.print(millis());
        Serial.print(",\"location\":\"mqtt_client.cpp:93\",\"message\":\"MQTT server address is empty\",\"data\":{},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
        // #endregion
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
    
    // #region agent log
    Serial.print("[DEBUG]{\"id\":\"mqtt_connect_before_broker\",\"timestamp\":");
    Serial.print(millis());
    Serial.print(",\"location\":\"mqtt_client.cpp:115\",\"message\":\"About to call connectToBroker()\",\"data\":{\"server_set\":\"");
    Serial.print(config.server);
    Serial.print("\",\"port_set\":");
    Serial.print(config.port);
    Serial.print(",\"wifi_status\":");
    Serial.print(WiFi.status());
    Serial.print(",\"wifi_connected\":");
    Serial.print(WiFi.isConnected() ? "true" : "false");
    Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"B\"}\n");
    // #endregion
    
    return connectToBroker();
}

bool MQTTClient::connectToBroker() {
    // #region agent log
    Serial.print("[DEBUG]{\"id\":\"mqtt_connect_broker_entry\",\"timestamp\":");
    Serial.print(millis());
    Serial.print(",\"location\":\"mqtt_client.cpp:119\",\"message\":\"connectToBroker() called\",\"data\":{\"server\":\"");
    Serial.print(current_config_.server);
    Serial.print("\",\"port\":");
    Serial.print(current_config_.port);
    Serial.print(",\"mqtt_state\":");
    Serial.print(mqtt_.state());
    Serial.print(",\"wifi_status\":");
    Serial.print(WiFi.status());
    Serial.print(",\"wifi_ssid\":\"");
    Serial.print(WiFi.SSID());
    Serial.print("\",\"wifi_ip\":\"");
    Serial.print(WiFi.localIP().toString());
    Serial.print("\"},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"C\"}\n");
    // #endregion
    
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
    // #region agent log
    Serial.print("[DEBUG]{\"id\":\"mqtt_connect_before_attempt\",\"timestamp\":");
    Serial.print(millis());
    Serial.print(",\"location\":\"mqtt_client.cpp:141\",\"message\":\"About to attempt MQTT connection\",\"data\":{\"server\":\"");
    Serial.print(current_config_.server);
    Serial.print("\",\"port\":");
    Serial.print(current_config_.port);
    Serial.print(",\"hostname_length\":");
    Serial.print(current_config_.server.length());
    Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
    // #endregion
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
        // #region agent log
        Serial.print("[DEBUG]{\"id\":\"mqtt_connect_success\",\"timestamp\":");
        Serial.print(millis());
        Serial.print(",\"location\":\"mqtt_client.cpp:164\",\"message\":\"MQTT connection successful\",\"data\":{\"server\":\"");
        Serial.print(current_config_.server);
        Serial.print("\",\"port\":");
        Serial.print(current_config_.port);
        Serial.print(",\"mqtt_state\":");
        Serial.print(mqtt_.state());
        Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
        // #endregion
        LOG_INFO("MQTT connected!");
        reconnect_attempts_ = 0;
        reconnect_delay_ms_ = RECONNECT_BASE_DELAY_MS;

        // Reset Circuit Breaker on successful connection (Phase 6+)
        circuit_breaker_.recordSuccess();

        // Process offline buffer
        processOfflineBuffer();

        return true;
    } else {
        // #region agent log
        Serial.print("[DEBUG]{\"id\":\"mqtt_connect_failed\",\"timestamp\":");
        Serial.print(millis());
        Serial.print(",\"location\":\"mqtt_client.cpp:177\",\"message\":\"MQTT connection failed\",\"data\":{\"server\":\"");
        Serial.print(current_config_.server);
        Serial.print("\",\"port\":");
        Serial.print(current_config_.port);
        Serial.print(",\"mqtt_state\":");
        Serial.print(mqtt_.state());
        Serial.print(",\"server_length\":");
        Serial.print(current_config_.server.length());
        Serial.print(",\"wifi_status\":");
        Serial.print(WiFi.status());
        Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
        // #endregion
        LOG_ERROR("MQTT connection failed, rc=" + String(mqtt_.state()));
        errorTracker.logCommunicationError(ERROR_MQTT_CONNECT_FAILED,
                                           ("MQTT connection failed, rc=" + String(mqtt_.state())).c_str());
        return false;
    }
}

// ✅ FIX #2: Helper function for connection attempts
bool MQTTClient::attemptMQTTConnection(const String& last_will_topic, const String& last_will_message) {
    // #region agent log
    Serial.print("[DEBUG]{\"id\":\"mqtt_attempt_entry\",\"timestamp\":");
    Serial.print(millis());
    Serial.print(",\"location\":\"mqtt_client.cpp:185\",\"message\":\"attemptMQTTConnection() called\",\"data\":{\"server\":\"");
    Serial.print(current_config_.server);
    Serial.print("\",\"port\":");
    Serial.print(current_config_.port);
    Serial.print(",\"anonymous_mode\":");
    Serial.print(anonymous_mode_ ? "true" : "false");
    Serial.print(",\"client_id\":\"");
    Serial.print(current_config_.client_id);
    Serial.print("\",\"mqtt_state_before\":");
    Serial.print(mqtt_.state());
    Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
    // #endregion
    
    bool result = false;
    if (anonymous_mode_) {
        // Anonymous connection with Last-Will
        // #region agent log
        Serial.print("[DEBUG]{\"id\":\"mqtt_attempt_anonymous\",\"timestamp\":");
        Serial.print(millis());
        Serial.print(",\"location\":\"mqtt_client.cpp:188\",\"message\":\"Calling mqtt_.connect() anonymous\",\"data\":{\"server\":\"");
        Serial.print(current_config_.server);
        Serial.print("\",\"port\":");
        Serial.print(current_config_.port);
        Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
        // #endregion
        result = mqtt_.connect(
            current_config_.client_id.c_str(),
            last_will_topic.c_str(),
            1,  // QoS 1 (At Least Once)
            true,  // Retain flag (God-Kaiser kann offline-Status später abrufen)
            last_will_message.c_str()
        );
    } else {
        // Authenticated connection with Last-Will
        // #region agent log
        Serial.print("[DEBUG]{\"id\":\"mqtt_attempt_authenticated\",\"timestamp\":");
        Serial.print(millis());
        Serial.print(",\"location\":\"mqtt_client.cpp:197\",\"message\":\"Calling mqtt_.connect() authenticated\",\"data\":{\"server\":\"");
        Serial.print(current_config_.server);
        Serial.print("\",\"port\":");
        Serial.print(current_config_.port);
        Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
        // #endregion
        result = mqtt_.connect(
            current_config_.client_id.c_str(),
            current_config_.username.c_str(),
            current_config_.password.c_str(),
            last_will_topic.c_str(),
            1,  // QoS 1 (At Least Once)
            true,  // Retain flag
            last_will_message.c_str()
        );
    }
    
    // #region agent log
    Serial.print("[DEBUG]{\"id\":\"mqtt_attempt_result\",\"timestamp\":");
    Serial.print(millis());
    Serial.print(",\"location\":\"mqtt_client.cpp:207\",\"message\":\"MQTT connect() returned\",\"data\":{\"result\":");
    Serial.print(result ? "true" : "false");
    Serial.print(",\"mqtt_state_after\":");
    Serial.print(mqtt_.state());
    Serial.print(",\"server\":\"");
    Serial.print(current_config_.server);
    Serial.print("\",\"port\":");
    Serial.print(current_config_.port);
    Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n");
    // #endregion
    
    return result;
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
        // Rate-limit debug messages when circuit breaker is OPEN (max once per second)
        static unsigned long last_circuit_breaker_log = 0;
        unsigned long now = millis();
        if (now - last_circuit_breaker_log > 1000) {
            last_circuit_breaker_log = now;
            // #region agent log
            Serial.print("[DEBUG]{\"id\":\"mqtt_reconnect_circuit_breaker\",\"timestamp\":");
            Serial.print(now);
            Serial.print(",\"location\":\"mqtt_client.cpp:383\",\"message\":\"Reconnect blocked by Circuit Breaker\",\"data\":{\"circuit_open\":true,\"failure_count\":");
            Serial.print(circuit_breaker_.getFailureCount());
            Serial.print("},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"E\"}\n");
            // #endregion
            LOG_DEBUG("MQTT reconnect blocked by Circuit Breaker (waiting for recovery)");
        }
        return;  // Skip reconnect attempt
    }
    
    // Check if we should attempt reconnect (respects exponential backoff)
    if (!shouldAttemptReconnect()) {
        return;
    }
    
    reconnect_attempts_++;
    last_reconnect_attempt_ = millis();

    // ✅ IMPROVEMENT #3: Keine Reconnect-Limit (Circuit Breaker regelt Fehlerbehandlung)
    LOG_INFO("Attempting MQTT reconnection (attempt " +
             String(reconnect_attempts_) + ")");

    // Debug log only when reconnect is actually attempted (after all checks)
    // #region agent log
    Serial.print("[DEBUG]{\"id\":\"mqtt_reconnect_attempt\",\"timestamp\":");
    Serial.print(millis());
    Serial.print(",\"location\":\"mqtt_client.cpp:407\",\"message\":\"About to call connectToBroker() for reconnect\",\"data\":{\"attempt\":");
    Serial.print(reconnect_attempts_);
    Serial.print(",\"server\":\"");
    Serial.print(current_config_.server);
    Serial.print("\",\"port\":");
    Serial.print(current_config_.port);
    Serial.print(",\"server_length\":");
    Serial.print(current_config_.server.length());
    Serial.print(",\"circuit_breaker_state\":\"");
    Serial.print(circuit_breaker_.isOpen() ? "OPEN" : (circuit_breaker_.isClosed() ? "CLOSED" : "HALF_OPEN"));
    Serial.print("\"},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"E\"}\n");
    // #endregion

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
static uint8_t toProtocolGpioMode(uint8_t arduino_mode) {
    // Map Arduino pinMode values to protocol enum (0=INPUT, 1=OUTPUT, 2=INPUT_PULLUP).
    if (arduino_mode == INPUT_PULLUP) {
        return 2;
    }
    if (arduino_mode == OUTPUT) {
        return 1;
    }
    return 0;
}

void MQTTClient::publishHeartbeat(bool force) {
    unsigned long current_time = millis();

    // Skip throttle check if force=true (for initial heartbeat after connect/reconnect)
    if (!force && (current_time - last_heartbeat_ < HEARTBEAT_INTERVAL_MS)) {
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
    payload += "\"actuator_count\":" + String(actuatorManager.getActiveActuatorCount()) + ",";

    // ============================================
    // GPIO STATUS (Phase 1)
    // ============================================
    std::vector<GPIOPinInfo> reservedPins = gpioManager.getReservedPinsList();

    payload += "\"gpio_status\":[";
    bool first = true;
    for (const auto& pin : reservedPins) {
        if (!first) payload += ",";
        first = false;

        payload += "{";
        payload += "\"gpio\":" + String(pin.pin) + ",";
        payload += "\"owner\":\"" + String(pin.owner) + "\",";
        payload += "\"component\":\"" + String(pin.component_name) + "\",";
        payload += "\"mode\":" + String(toProtocolGpioMode(pin.mode)) + ",";
        payload += "\"safe\":" + String(pin.in_safe_mode ? "true" : "false");
        payload += "}";
    }
    payload += "],";
    payload += "\"gpio_reserved_count\":" + String(reservedPins.size()) + ",";
    
    // ============================================
    // CONFIG STATUS (Observability - Phase 1-3)
    // ============================================
    // Include configuration diagnostics for server observability
    payload += "\"config_status\":";
    payload += configManager.getDiagnosticsJSON();

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
    // ✅ FIX: MAX_RECONNECT_ATTEMPTS-Check ENTFERNT (2026-01-20)
    // Root-Cause für Watchdog-Timeout: Nach 10 Reconnect-Versuchen wurde
    // shouldAttemptReconnect()=false, Circuit Breaker blieb OPEN,
    // feedWatchdog() wurde blockiert → Watchdog Timeout → Reboot.
    // Der Circuit Breaker regelt die Fehlerbehandlung bereits ausreichend.
    // Siehe: .claude/Next Steps/Hardware_Tests/Phase_1_Weiterführung.md

    // ✅ FIX #2: HALF_OPEN bypasses exponential backoff (2026-01-20)
    // Race Condition: Wenn Circuit Breaker auf HALF_OPEN wechselt, aber
    // reconnect_delay_ms_ > halfopen_timeout (10s), wird nie ein Reconnect
    // versucht und HALF_OPEN timeout zurück zu OPEN ohne Test.
    // Bei HALF_OPEN sofort Reconnect versuchen - das ist der Sinn von HALF_OPEN!
    if (circuit_breaker_.getState() == CircuitState::HALF_OPEN) {
        return true;  // Sofort versuchen, kein Backoff!
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

CircuitState MQTTClient::getCircuitBreakerState() const {
    return circuit_breaker_.getState();
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
