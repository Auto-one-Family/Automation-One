#include "mqtt_client.h"
#include "../../models/error_codes.h"
#include "../../services/config/config_manager.h"
#include "../../services/sensor/sensor_manager.h"
#include "../../services/actuator/actuator_manager.h"
#include "../../services/safety/offline_mode_manager.h"
#include "../../utils/time_manager.h"
#include "../../drivers/gpio_manager.h"  // Phase 1: GPIO Status
#include "../../config/feature_flags.h"
#include <WiFi.h>
#include <esp_system.h>

#ifndef MQTT_USE_PUBSUBCLIENT
    #include "../../tasks/safety_task.h"         // g_safety_task_handle, NOTIFY_* bits
    #include "../../tasks/publish_queue.h"       // M3: Core 1 → Core 0 publish queue
    #include "../../tasks/intent_contract.h"
    #include "../../error_handling/error_tracker.h"
    // Forward declarations from main.cpp
    extern void routeIncomingMessage(const char* topic, const char* payload);
#endif

// ESP-IDF TAG convention for structured logging
static const char* TAG = "MQTT";

#ifndef MQTT_USE_PUBSUBCLIENT
static bool isCriticalPublishTopic(const String& topic) {
    return topic.indexOf("/alert") != -1 ||
           topic.indexOf("/response") != -1 ||
           topic.indexOf("/config_response") != -1 ||
           topic.indexOf("/system/error") != -1 ||
           topic.indexOf("/system/intent_outcome") != -1;
}
#endif

// ============================================
// EXTERNAL GLOBAL VARIABLES (from main.cpp)
// ============================================
extern KaiserZone g_kaiser;
extern SystemConfig g_system_config;

static String g_boot_sequence_id;
static uint8_t g_boot_reset_reason = 0;
static unsigned long g_segment_start_ts = 0;

static const char* resetReasonToString(uint8_t reason) {
    switch (reason) {
        case ESP_RST_POWERON: return "POWERON";
        case ESP_RST_EXT: return "EXT";
        case ESP_RST_SW: return "SW";
        case ESP_RST_PANIC: return "PANIC";
        case ESP_RST_INT_WDT: return "INT_WDT";
        case ESP_RST_TASK_WDT: return "TASK_WDT";
        case ESP_RST_WDT: return "WDT";
        case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
        case ESP_RST_BROWNOUT: return "BROWNOUT";
        case ESP_RST_SDIO: return "SDIO";
        default: return "UNKNOWN";
    }
}

static void ensureBootTelemetryInitialized(time_t unix_timestamp, bool time_valid) {
    if (g_boot_sequence_id.length() == 0) {
        g_boot_reset_reason = static_cast<uint8_t>(esp_reset_reason());
        g_boot_sequence_id = g_system_config.esp_id + "-b" + String(g_system_config.boot_count) +
                             "-r" + String(g_boot_reset_reason);
    }
    if (g_segment_start_ts == 0 && time_valid && unix_timestamp > 0) {
        g_segment_start_ts = static_cast<unsigned long>(unix_timestamp);
    }
}

// ============================================
// SHARED ATOMIC STATE (SAFETY-RTOS M2)
// Written by MQTT_EVENT_CONNECTED/DISCONNECTED (Core 0 — MQTT event task).
// Read by checkServerAckTimeout() in Safety-Task (Core 1) via mqttClient.isConnected().
// ============================================
#ifndef MQTT_USE_PUBSUBCLIENT
std::atomic<bool> g_mqtt_connected{false};
#endif

// ============================================
// CONSTANTS (PubSubClient path — seeed/wokwi only)
// ============================================
#ifdef MQTT_USE_PUBSUBCLIENT
const unsigned long RECONNECT_BASE_DELAY_MS = 1000;   // 1 second
const unsigned long RECONNECT_MAX_DELAY_MS = 60000;   // 60 seconds
const uint16_t MAX_RECONNECT_ATTEMPTS = 10;
#endif

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
    :
#ifndef MQTT_USE_PUBSUBCLIENT
      mqtt_client_(nullptr),
#else
      mqtt_(wifi_client_),
      offline_buffer_count_(0),
      last_reconnect_attempt_(0),
      reconnect_attempts_(0),
      reconnect_delay_ms_(RECONNECT_BASE_DELAY_MS),
#endif
      initialized_(false),
      anonymous_mode_(true),
      last_heartbeat_(0),
      circuit_breaker_("MQTT", 5, 30000, 10000),
      registration_confirmed_(false),
      registration_start_ms_(0),
      registration_timeout_logged_(false),
      publish_seq_(0) {
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
        LOG_W(TAG, "MQTTClient already initialized");
        return true;
    }

#ifdef MQTT_USE_PUBSUBCLIENT
    mqtt_.setCallback(staticCallback);
#endif

    initialized_ = true;
    LOG_I(TAG, "MQTTClient initialized");
    return true;
}

// ============================================
// CONNECTION MANAGEMENT
// ============================================
bool MQTTClient::connect(const MQTTConfig& config) {
    if (!initialized_) {
        LOG_E(TAG, "MQTTClient not initialized");
        errorTracker.logCommunicationError(ERROR_MQTT_INIT_FAILED, "MQTTClient not initialized");
        return false;
    }

    if (config.server.length() == 0) {
        LOG_E(TAG, "MQTT server address is empty");
        errorTracker.logCommunicationError(ERROR_MQTT_INIT_FAILED, "MQTT server address is empty");
        return false;
    }

    current_config_ = config;
    anonymous_mode_ = (config.username.length() == 0);

    if (anonymous_mode_) {
        LOG_I(TAG, "MQTT connecting in Anonymous Mode");
    } else {
        LOG_I(TAG, "MQTT connecting with authentication");
    }

#ifndef MQTT_USE_PUBSUBCLIENT
    // ============================================
    // SAFETY-RTOS M2: ESP-IDF MQTT — NON-BLOCKING
    // esp_mqtt_client_start() returns immediately.
    // MQTT_EVENT_CONNECTED fires asynchronously when connection is established.
    // ============================================

    // Build broker URI: "mqtt://hostname:port"
    char broker_uri[96];
    snprintf(broker_uri, sizeof(broker_uri), "mqtt://%s:%d",
             config.server.c_str(), config.port);

    // Build Last-Will topic: kaiser/{k}/esp/{e}/system/will
    // Use heartbeat topic as base and replace /heartbeat with /will
    String lw_topic_str = String(TopicBuilder::buildSystemHeartbeatTopic());
    lw_topic_str.replace("/heartbeat", "/will");

    // Build Last-Will payload (JSON)
    time_t will_ts = timeManager.getUnixTimestamp();
    char lw_msg[160];
    snprintf(lw_msg, sizeof(lw_msg),
             "{\"status\":\"offline\",\"esp_id\":\"%s\",\"reason\":\"unexpected_disconnect\",\"timestamp\":%lu}",
             g_system_config.esp_id.c_str(), (unsigned long)will_ts);

    LOG_I(TAG, "Broker URI: " + String(broker_uri));
    LOG_I(TAG, "Last-Will Topic: " + lw_topic_str);

    // ESP-IDF v4.x flache esp_mqtt_client_config_t (Arduino-ESP32 3.x) — nicht die v5-Nested-Struct.
    esp_mqtt_client_config_t mqtt_cfg = {};
    mqtt_cfg.uri = broker_uri;
    mqtt_cfg.keepalive = config.keepalive;
    mqtt_cfg.disable_clean_session = 0;

    mqtt_cfg.lwt_topic = lw_topic_str.c_str();
    mqtt_cfg.lwt_msg = lw_msg;
    mqtt_cfg.lwt_qos = 1;
    mqtt_cfg.lwt_retain = 1;
    mqtt_cfg.lwt_msg_len = 0;

    mqtt_cfg.buffer_size = 4096;
    mqtt_cfg.out_buffer_size = 2048;

    mqtt_cfg.client_id = config.client_id.c_str();
    if (!anonymous_mode_) {
        mqtt_cfg.username = config.username.c_str();
        mqtt_cfg.password = config.password.c_str();
    }

    mqtt_cfg.task_stack = 16384;  // increased from 10240: static data_buf saves 4096 B on stack,
                                  // +6144 B headroom for future handlers and config payload growth
    mqtt_cfg.task_prio = 3;

    // Destroy old client if present (e.g. reconnect after config change)
    if (mqtt_client_ != nullptr) {
        esp_mqtt_client_stop(mqtt_client_);
        esp_mqtt_client_destroy(mqtt_client_);
        mqtt_client_ = nullptr;
    }

    mqtt_client_ = esp_mqtt_client_init(&mqtt_cfg);
    if (mqtt_client_ == nullptr) {
        LOG_E(TAG, "esp_mqtt_client_init() failed — nullptr returned");
        errorTracker.logCommunicationError(ERROR_MQTT_INIT_FAILED, "esp_mqtt_client_init failed");
        return false;
    }

    // Reset Registration Gate
    registration_confirmed_ = false;
    registration_start_ms_  = millis();
    registration_timeout_logged_ = false;

    // Register event handler (args = this, so handler can access members)
    esp_mqtt_client_register_event(mqtt_client_, MQTT_EVENT_ANY, mqtt_event_handler, this);

    // Start client — NON-BLOCKING. Connection happens in background MQTT task.
    esp_err_t err = esp_mqtt_client_start(mqtt_client_);
    if (err != ESP_OK) {
        LOG_E(TAG, String("esp_mqtt_client_start() failed: ") + esp_err_to_name(err));
        errorTracker.logCommunicationError(ERROR_MQTT_CONNECT_FAILED,
                                           "esp_mqtt_client_start failed");
        esp_mqtt_client_destroy(mqtt_client_);
        mqtt_client_ = nullptr;
        return false;
    }

    // NOTE (M2): connect() returns true immediately — actual MQTT connection is async.
    // MQTT_EVENT_CONNECTED fires when broker accepts the connection.
    // Consequence: mqttClient.connect() in setup() will NOT fail even if broker is unreachable.
    // Portal recovery for MQTT failure now happens via the 5-minute persistent-failure timer
    // in loop() (CircuitBreaker OPEN → provisionManager.startAPModeForReconfig()).
    LOG_I(TAG, "[M2] ESP-IDF MQTT client started — connecting in background");
    return true;

#else
    // ============================================
    // PubSubClient path (seeed, wokwi — MQTT_USE_PUBSUBCLIENT=1)
    // ============================================
    reconnect_attempts_ = 0;
    reconnect_delay_ms_ = RECONNECT_BASE_DELAY_MS;

    mqtt_.setServer(config.server.c_str(), config.port);
    mqtt_.setKeepAlive(config.keepalive);

    return connectToBroker();
#endif
}

bool MQTTClient::disconnect() {
#ifndef MQTT_USE_PUBSUBCLIENT
    if (mqtt_client_ != nullptr) {
        esp_mqtt_client_stop(mqtt_client_);
        esp_mqtt_client_destroy(mqtt_client_);
        mqtt_client_ = nullptr;
        g_mqtt_connected.store(false);
        LOG_I(TAG, "MQTT disconnected (ESP-IDF client destroyed)");
    }
    return true;
#else
    if (mqtt_.connected()) {
        mqtt_.disconnect();
        LOG_I(TAG, "MQTT disconnected");
    }
    return true;
#endif
}

bool MQTTClient::isConnected() {
#ifndef MQTT_USE_PUBSUBCLIENT
    return g_mqtt_connected.load();
#else
    return mqtt_.connected();
#endif
}

void MQTTClient::reconnect() {
#ifndef MQTT_USE_PUBSUBCLIENT
    // ESP-IDF reconnects automatically — no manual reconnect needed.
    // This method is kept for interface compatibility (called from loop() in PubSubClient path).
    // In ESP-IDF path loop() does not call reconnect().
#else
    if (isConnected()) {
        LOG_D(TAG, "MQTT already connected");
        circuit_breaker_.recordSuccess();
        return;
    }

    if (!circuit_breaker_.allowRequest()) {
        static unsigned long last_circuit_breaker_log = 0;
        unsigned long now = millis();
        if (now - last_circuit_breaker_log > 1000) {
            last_circuit_breaker_log = now;
            LOG_D(TAG, "MQTT reconnect blocked by Circuit Breaker (waiting for recovery)");
        }
        return;
    }

    if (!shouldAttemptReconnect()) {
        return;
    }

    reconnect_attempts_++;
    last_reconnect_attempt_ = millis();

    LOG_I(TAG, "Attempting MQTT reconnection (attempt " + String(reconnect_attempts_) + ")");

    if (!connectToBroker()) {
        circuit_breaker_.recordFailure();
        reconnect_delay_ms_ = calculateBackoffDelay();
        if (circuit_breaker_.isOpen()) {
            LOG_W(TAG, "Circuit Breaker OPENED after reconnect failures");
        }
    } else {
        circuit_breaker_.recordSuccess();
    }
#endif
}

// ============================================
// AUTHENTICATION TRANSITION
// ============================================
bool MQTTClient::transitionToAuthenticated(const String& username, const String& password) {
    if (!anonymous_mode_) {
        LOG_W(TAG, "Already in authenticated mode");
        return true;
    }

    LOG_I(TAG, "Transitioning from Anonymous to Authenticated mode");

    current_config_.username = username;
    current_config_.password = password;
    anonymous_mode_ = false;

    disconnect();
    return connect(current_config_);
}

bool MQTTClient::isAnonymousMode() const {
    return anonymous_mode_;
}

// ============================================
// SEQUENCE NUMBER (Correlation-ID support)
// ============================================
uint32_t MQTTClient::getNextSeq() {
    return ++publish_seq_;
}

uint32_t MQTTClient::getCurrentSeq() const {
    return publish_seq_;
}

// ============================================
// PUBLISHING (WITH CIRCUIT BREAKER)
// ============================================
bool MQTTClient::publish(const String& topic, const String& payload, uint8_t qos) {
    if (test_publish_hook_) {
        test_publish_hook_(topic, payload);
        return true;
    }

    // Circuit Breaker: block publishes when broker is persistently down
    if (!circuit_breaker_.allowRequest()) {
        LOG_W(TAG, "MQTT publish blocked by Circuit Breaker (Service DOWN)");
        return false;
    }

    // Registration Gate: block non-heartbeat publishes until server confirms registration
    bool is_heartbeat = topic.indexOf("/system/heartbeat") != -1 &&
                        topic.indexOf("/heartbeat/ack") == -1;
    bool is_system_response = topic.indexOf("/config_response") != -1 ||
                              topic.indexOf("/zone/ack") != -1 ||
                              topic.indexOf("/subzone/ack") != -1 ||
                              topic.indexOf("/system/command/response") != -1;
    bool is_error_publish = topic.indexOf("/error") != -1;

    if (!registration_confirmed_ && !is_heartbeat && !is_system_response && !is_error_publish) {
        if (registration_start_ms_ > 0 &&
            (millis() - registration_start_ms_) > REGISTRATION_TIMEOUT_MS) {
            if (!registration_timeout_logged_) {
                LOG_W(TAG, "Registration timeout - gate remains CLOSED until valid heartbeat ACK (fail-closed)");
                registration_timeout_logged_ = true;
            }
            LOG_D(TAG, "Publish blocked (registration timeout, no ACK yet): " + topic);
            return false;
        } else {
            LOG_D(TAG, "Publish blocked (awaiting registration): " + topic);
            return false;
        }
    }

    if (payload.length() == 0) {
        LOG_E(TAG, "Empty payload blocked for topic: " + topic);
        errorTracker.logCommunicationError(ERROR_MQTT_PAYLOAD_INVALID,
                                           ("Empty payload for: " + topic).c_str());
        return false;
    }

#ifndef MQTT_USE_PUBSUBCLIENT
    if (mqtt_client_ == nullptr) {
        LOG_W(TAG, "MQTT client not initialized, dropping message: " + topic);
        return false;
    }

    // M3: If called from Core 1 (Safety-Task), route through publish queue (Core 1 → Core 0).
    // Keeps all network I/O on Core 0 and prevents slow publishes from stalling Core 1.
    if (xPortGetCoreID() == 1) {
        bool critical = isCriticalPublishTopic(topic);
        IntentMetadata metadata = extractIntentMetadataFromPayload(payload.c_str(), critical ? "critical_pub" : "pub");
        bool enqueued = queuePublish(topic.c_str(), payload.c_str(), qos, false, critical, &metadata);
        if (!enqueued) {
            LOG_W(TAG, "Publish queue full — dropping: " + topic);
            circuit_breaker_.recordFailure();
            return false;
        }
        circuit_breaker_.recordSuccess();
        return true;
    }

    // Core 0: direct publish via ESP-IDF (thread-safe internally).
    // Returns msg_id > 0 (QoS 1 queued), 0 (QoS 0 sent), -1 (error), -2 (outbox full).
    int msg_id = esp_mqtt_client_publish(
        mqtt_client_,
        topic.c_str(),
        payload.c_str(),
        0,       // length = 0 → use strlen()
        qos,
        0        // retain = false (avoid stale state on broker)
    );

    if (msg_id >= 0) {
        circuit_breaker_.recordSuccess();
        LOG_D(TAG, "Published [msg_id=" + String(msg_id) + "]: " + topic);
        return true;
    } else if (msg_id == -2) {
        LOG_W(TAG, "MQTT Outbox full, message dropped: " + topic);
        circuit_breaker_.recordFailure();
        return false;
    } else {
        // msg_id == -1: error (not connected or internal failure)
        // Don't count as failure if we're not connected (pre-connection publish attempt)
        if (g_mqtt_connected.load()) {
            circuit_breaker_.recordFailure();
            LOG_E(TAG, "Publish failed (connected but error): " + topic);
            errorTracker.logCommunicationError(ERROR_MQTT_PUBLISH_FAILED,
                                               ("Publish failed: " + topic).c_str());
        } else {
            LOG_W(TAG, "Publish before MQTT connected, dropping: " + topic);
        }
        return false;
    }

#else
    // PubSubClient path
    if (!isConnected()) {
        LOG_W(TAG, "MQTT not connected, adding to offline buffer");
        circuit_breaker_.recordFailure();
        return addToOfflineBuffer(topic, payload, qos);
    }

    bool success = mqtt_.publish(topic.c_str(), payload.c_str(), false);

    if (success) {
        circuit_breaker_.recordSuccess();
        LOG_D(TAG, "Published: " + topic);
    } else {
        circuit_breaker_.recordFailure();
        LOG_E(TAG, "Publish failed: " + topic);
        errorTracker.logCommunicationError(ERROR_MQTT_PUBLISH_FAILED,
                                           ("Publish failed: " + topic).c_str());
        if (circuit_breaker_.isOpen()) {
            LOG_W(TAG, "Circuit Breaker OPENED after failure threshold");
        }
        addToOfflineBuffer(topic, payload, qos);
    }

    return success;
#endif
}

bool MQTTClient::safePublish(const String& topic, const String& payload, uint8_t qos, uint8_t retries) {
    if (circuit_breaker_.isOpen()) {
        LOG_D(TAG, "SafePublish: Circuit Breaker OPEN, skipping retries");
        return publish(topic, payload, qos);
    }

    if (publish(topic, payload, qos)) {
        return true;
    }

    if (circuit_breaker_.isOpen()) {
        LOG_D(TAG, "SafePublish: Circuit Breaker OPENED after first attempt");
        return false;
    }

    yield();  // Non-blocking statt delay(100)

    if (publish(topic, payload, qos)) {
        return true;
    }

    LOG_W(TAG, "SafePublish failed after retry");
    return false;
}

// ============================================
// SUBSCRIPTION
// ============================================
bool MQTTClient::subscribe(const String& topic, uint8_t qos) {
#ifndef MQTT_USE_PUBSUBCLIENT
    if (mqtt_client_ == nullptr) {
        LOG_E(TAG, "Cannot subscribe, MQTT client not initialized");
        return false;
    }
    // esp_mqtt_client_subscribe is only effective when connected.
    // Called from on_connect_callback_ (after MQTT_EVENT_CONNECTED) — this is correct.
    int msg_id = esp_mqtt_client_subscribe(mqtt_client_, topic.c_str(), qos);
    if (msg_id >= 0) {
        LOG_I(TAG, "Subscribe sent (QoS " + String(qos) + "): " + topic);
        return true;
    } else {
        LOG_E(TAG, "Subscribe failed: " + topic);
        errorTracker.logCommunicationError(ERROR_MQTT_SUBSCRIBE_FAILED,
                                           ("Subscribe failed: " + topic).c_str());
        return false;
    }
#else
    if (!isConnected()) {
        LOG_E(TAG, "Cannot subscribe, MQTT not connected");
        errorTracker.logCommunicationError(ERROR_MQTT_SUBSCRIBE_FAILED,
                                           "Cannot subscribe, not connected");
        return false;
    }

    bool success = mqtt_.subscribe(topic.c_str(), qos);

    if (success) {
        LOG_I(TAG, "Subscribed (QoS " + String(qos) + "): " + topic);
    } else {
        LOG_E(TAG, "Subscribe failed: " + topic);
        errorTracker.logCommunicationError(ERROR_MQTT_SUBSCRIBE_FAILED,
                                           ("Subscribe failed: " + topic).c_str());
    }
    return success;
#endif
}

bool MQTTClient::unsubscribe(const String& topic) {
#ifndef MQTT_USE_PUBSUBCLIENT
    if (mqtt_client_ == nullptr) return false;
    int msg_id = esp_mqtt_client_unsubscribe(mqtt_client_, topic.c_str());
    if (msg_id >= 0) {
        LOG_I(TAG, "Unsubscribed from: " + topic);
        return true;
    }
    LOG_E(TAG, "Unsubscribe failed: " + topic);
    return false;
#else
    if (!isConnected()) {
        LOG_W(TAG, "Cannot unsubscribe, MQTT not connected");
        return false;
    }
    bool success = mqtt_.unsubscribe(topic.c_str());
    if (success) {
        LOG_I(TAG, "Unsubscribed from: " + topic);
    } else {
        LOG_E(TAG, "Unsubscribe failed: " + topic);
    }
    return success;
#endif
}

void MQTTClient::setCallback(std::function<void(const String&, const String&)> callback) {
    message_callback_ = callback;
}

// ============================================
// MONITORING / LOOP
// ============================================
void MQTTClient::loop() {
    if (!initialized_) {
        return;
    }

#ifndef MQTT_USE_PUBSUBCLIENT
    // ESP-IDF has its own MQTT task — no manual mqtt_.loop() or reconnect() needed here.
    // loop() only handles: NTP time sync + periodic heartbeat publishing.
    timeManager.loop();
    publishHeartbeat();
#else
    // PubSubClient path: handle time sync, MQTT maintenance, heartbeat, and reconnect.
    timeManager.loop();

    if (isConnected()) {
        mqtt_.loop();
        publishHeartbeat();
    } else {
        handleDisconnection();
    }
#endif
}

// ============================================
// M3: PUBLISH QUEUE DRAIN (Core 0 only)
// ============================================
#ifndef MQTT_USE_PUBSUBCLIENT
void MQTTClient::processPublishQueue() {
    if (mqtt_client_ == nullptr) return;
    if (g_publish_queue == NULL) return;
    // Drain persisted critical outcomes first so reconnect replay
    // is not blocked waiting for new command/config traffic.
    processIntentOutcomeOutbox();

    PublishRequest req;
    while (xQueueReceive(g_publish_queue, &req, 0) == pdTRUE) {
        int msg_id = esp_mqtt_client_publish(
            mqtt_client_,
            req.topic,
            req.payload,
            0,               // length = 0 → use strlen()
            req.qos,
            req.retain ? 1 : 0
        );
        if (msg_id >= 0) {
            continue;
        }
        const char* drop_code = (msg_id == -2) ? "OUTBOX_FULL" : "EXECUTE_FAIL";
        String drop_reason = String("Publish dropped for topic ") + String(req.topic);
        if (req.critical && req.attempt < 3) {
            req.attempt++;
            if (xQueueSend(g_publish_queue, &req, 0) != pdTRUE) {
                publishIntentOutcome("publish",
                                     req.metadata,
                                     "failed",
                                     "QUEUE_FULL",
                                     "Critical publish retry queue full",
                                     true);
            }
            continue;
        }
        publishIntentOutcome("publish",
                             req.metadata,
                             "failed",
                             drop_code,
                             drop_reason,
                             req.critical);
    }
}
#endif

// ============================================
// STATUS GETTERS
// ============================================
String MQTTClient::getConnectionStatus() {
#ifndef MQTT_USE_PUBSUBCLIENT
    return g_mqtt_connected.load() ? "Connected" : "Disconnected";
#else
    if (mqtt_.connected()) {
        return "Connected";
    }
    switch (mqtt_.state()) {
        case MQTT_CONNECTION_TIMEOUT:    return "Connection timeout";
        case MQTT_CONNECTION_LOST:       return "Connection lost";
        case MQTT_CONNECT_FAILED:        return "Connect failed";
        case MQTT_DISCONNECTED:          return "Disconnected";
        case MQTT_CONNECT_BAD_PROTOCOL:  return "Bad protocol";
        case MQTT_CONNECT_BAD_CLIENT_ID: return "Bad client ID";
        case MQTT_CONNECT_UNAVAILABLE:   return "Server unavailable";
        case MQTT_CONNECT_BAD_CREDENTIALS: return "Bad credentials";
        case MQTT_CONNECT_UNAUTHORIZED:  return "Unauthorized";
        default: return "Unknown (" + String(mqtt_.state()) + ")";
    }
#endif
}

uint16_t MQTTClient::getConnectionAttempts() const {
#ifndef MQTT_USE_PUBSUBCLIENT
    return 0;  // ESP-IDF manages reconnect internally; not exposed.
#else
    return reconnect_attempts_;
#endif
}

bool MQTTClient::hasOfflineMessages() const {
#ifndef MQTT_USE_PUBSUBCLIENT
    return false;  // ESP-IDF Outbox is opaque; individual message tracking not exposed.
#else
    return offline_buffer_count_ > 0;
#endif
}

uint16_t MQTTClient::getOfflineMessageCount() const {
#ifndef MQTT_USE_PUBSUBCLIENT
    return 0;
#else
    return offline_buffer_count_;
#endif
}

CircuitState MQTTClient::getCircuitBreakerState() const {
    return circuit_breaker_.getState();
}

uint8_t MQTTClient::getCircuitBreakerFailureCount() const {
    return circuit_breaker_.getFailureCount();
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
    const unsigned long heartbeat_interval_ms =
        registration_confirmed_ ? HEARTBEAT_INTERVAL_MS : HEARTBEAT_REGISTRATION_RETRY_MS;

    if (!force && (current_time - last_heartbeat_ < heartbeat_interval_ms)) {
        return;
    }

    last_heartbeat_ = current_time;

    // M5.4: Heap monitoring — logged alongside every heartbeat for long-term leak detection.
    LOG_I("MEM", "[MEM] Free heap: " + String(ESP.getFreeHeap()) +
          " B, min free: " + String(ESP.getMinFreeHeap()) +
          " B, max alloc: " + String(ESP.getMaxAllocHeap()) + " B");

    const char* topic = TopicBuilder::buildSystemHeartbeatTopic();

    time_t unix_timestamp = timeManager.getUnixTimestamp();
    bool time_valid = timeManager.isSynchronized();
    ensureBootTelemetryInitialized(unix_timestamp, time_valid);

    String payload = "{";
    payload += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
    payload += "\"seq\":" + String(getNextSeq()) + ",";
    payload += "\"zone_id\":\"" + g_kaiser.zone_id + "\",";
    payload += "\"master_zone_id\":\"" + g_kaiser.master_zone_id + "\",";
    payload += "\"zone_assigned\":" + String(g_kaiser.zone_assigned ? "true" : "false") + ",";
    payload += "\"ts\":" + String((unsigned long)unix_timestamp) + ",";
    payload += "\"time_valid\":" + String(time_valid ? "true" : "false") + ",";
    payload += "\"boot_sequence_id\":\"" + g_boot_sequence_id + "\",";
    payload += "\"reset_reason\":\"" + String(resetReasonToString(g_boot_reset_reason)) + "\",";
    payload += "\"segment_start_ts\":" + String(g_segment_start_ts) + ",";
    payload += "\"uptime\":" + String(millis() / 1000) + ",";
    payload += "\"heap_free\":" + String(ESP.getFreeHeap()) + ",";
    payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
    payload += "\"sensor_count\":" + String(sensorManager.getActiveSensorCount()) + ",";
    payload += "\"actuator_count\":" + String(actuatorManager.getActiveActuatorCount()) + ",";
    payload += "\"wifi_ip\":\"" + WiFi.localIP().toString() + "\",";

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
    payload += "\"metrics_schema_version\":" +
               String(OfflineModeManager::OFFLINE_AUTHORITY_METRICS_SCHEMA_VERSION) + ",";
    payload += "\"offline_enter_count\":" + String(offlineModeManager.getOfflineEnterCount()) + ",";
    payload += "\"adopting_enter_count\":" + String(offlineModeManager.getAdoptingEnterCount()) + ",";
    payload += "\"adoption_noop_count\":" + String(offlineModeManager.getAdoptionNoopCount()) + ",";
    payload += "\"adoption_delta_count\":" + String(offlineModeManager.getAdoptionDeltaCount()) + ",";
    payload += "\"handover_abort_count\":" + String(offlineModeManager.getHandoverAbortCount()) + ",";
    payload += "\"handover_contract_reject_count\":" +
               String(offlineModeManager.getHandoverContractRejectCount()) + ",";
    payload += "\"handover_contract_last_reject\":\"" +
               String(offlineModeManager.getLastHandoverContractRejectCode()) + "\",";
    payload += "\"active_handover_epoch\":" + String(offlineModeManager.getActiveHandoverEpoch()) + ",";
    payload += "\"handover_completed_epoch\":" + String(offlineModeManager.getHandoverCompletedEpoch()) + ",";
    payload += "\"degraded\":" +
               String(offlineModeManager.isPersistenceDriftActive() ? "true" : "false") + ",";
    payload += "\"degraded_reason\":\"" +
               String(offlineModeManager.getLastPersistenceDriftReason()) + "\",";
    payload += "\"persistence_drift_count\":" +
               String(offlineModeManager.getPersistenceDriftCount()) + ",";
    payload += "\"config_status\":";
    payload += configManager.getDiagnosticsJSON();
    payload += "}";

    if (!publish(topic, payload, 0)) {
        LOG_W(TAG, "Heartbeat publish failed (topic=" + String(topic) + ")");
    }
}

// ============================================
// REGISTRATION GATE (Bug #1 Fix)
// ============================================
bool MQTTClient::isRegistrationConfirmed() const {
    return registration_confirmed_;
}

void MQTTClient::confirmRegistration() {
    if (!registration_confirmed_) {
        registration_confirmed_ = true;
        registration_timeout_logged_ = false;
        LOG_I(TAG, "╔════════════════════════════════════════╗");
        LOG_I(TAG, "║  REGISTRATION CONFIRMED BY SERVER     ║");
        LOG_I(TAG, "╚════════════════════════════════════════╝");
        LOG_I(TAG, "Gate opened - publishes now allowed");
    }
}

bool MQTTClient::checkRegistrationTimeout() {
    if (registration_confirmed_) return true;
    if (registration_start_ms_ == 0) return false;
    if ((millis() - registration_start_ms_) > REGISTRATION_TIMEOUT_MS) {
        if (!registration_timeout_logged_) {
            LOG_W(TAG, "Registration timeout observed - waiting for explicit heartbeat ACK (gate stays closed)");
            registration_timeout_logged_ = true;
        }
    }
    return false;
}

void MQTTClient::setOnConnectCallback(std::function<void()> callback) {
    on_connect_callback_ = std::move(callback);
}

void MQTTClient::setTestPublishHook(std::function<void(const String&, const String&)> hook) {
    test_publish_hook_ = std::move(hook);
}

void MQTTClient::clearTestPublishHook() {
    test_publish_hook_ = nullptr;
}

// ============================================
// ESP-IDF MQTT EVENT HANDLER (SAFETY-RTOS M2)
// Runs in ESP-IDF MQTT task (Core 0, Priority 3 — below Safety-Task Priority 5).
// args = MQTTClient* instance (passed during esp_mqtt_client_register_event).
// ============================================
#ifndef MQTT_USE_PUBSUBCLIENT
void MQTTClient::mqtt_event_handler(void* args, esp_event_base_t base,
                                    int32_t event_id, void* event_data) {
    MQTTClient* self = static_cast<MQTTClient*>(args);
    esp_mqtt_event_handle_t event = static_cast<esp_mqtt_event_handle_t>(event_data);

    switch (event_id) {

        case MQTT_EVENT_CONNECTED:
            LOG_I(TAG, "╔════════════════════════════════════════╗");
            LOG_I(TAG, "║  MQTT_EVENT_CONNECTED                 ║");
            LOG_I(TAG, "╚════════════════════════════════════════╝");

            // Update shared connection state (atomic — read by Safety-Task Core 1)
            g_mqtt_connected.store(true);

            // SAFETY-P1 Race-Fix (Bug-2): reset ACK timestamp immediately after
            // marking connected, before on_connect_callback_ is invoked.
            // Without this, Safety-Task (Core 1) can read isConnected()==true with
            // the stale pre-reconnect timestamp (~209 s ago in the observed failure)
            // and incorrectly trigger the 120 s ACK-timeout path in that narrow
            // ~ms window before on_connect_callback_ reaches its own reset.
            g_last_server_ack_ms.store(millis());

            // Reset Registration Gate
            self->registration_confirmed_ = false;
            self->registration_start_ms_  = millis();
            self->registration_timeout_logged_ = false;

            // Circuit Breaker: connection success resets failure counter
            self->circuit_breaker_.recordSuccess();

            // SAFETY-P1 Mechanisms A + D + E:
            // on_connect_callback_ = onMqttConnectCallback() in main.cpp
            //   → subscribeToAllTopics() (Mechanism A: 11 subscriptions)
            //   → g_last_server_ack_ms reset (Mechanism D reset — second reset, harmless)
            //   → publishAllActuatorStatus() + publishHeartbeat(true) on reconnect (Mechanism E)
            //   → offlineModeManager.onReconnect() (SAFETY-P4)
            if (self->on_connect_callback_) {
                self->on_connect_callback_();
            }
            break;

        case MQTT_EVENT_DISCONNECTED:
            LOG_W(TAG, "╔════════════════════════════════════════╗");
            LOG_W(TAG, "║  MQTT_EVENT_DISCONNECTED              ║");
            LOG_W(TAG, "╚════════════════════════════════════════╝");

            // Update shared connection state
            g_mqtt_connected.store(false);

            // Reset Registration Gate
            self->registration_confirmed_ = false;
            self->registration_start_ms_  = 0;
            self->registration_timeout_logged_ = false;

            // Circuit Breaker: disconnect counts as failure
            self->circuit_breaker_.recordFailure();

            LOG_W(TAG, "MQTT disconnected");
            errorTracker.logCommunicationError(ERROR_MQTT_DISCONNECT, "MQTT connection lost");

            // SAFETY-P4: Start 30s grace timer for offline hysteresis
            // Runs on Core 0 (event task) — offlineModeManager is simple timer state.
            LOG_W(TAG, "[SAFETY-P4] disconnect notified (path=MQTT_EVENT)");
            offlineModeManager.onDisconnect();

            // SAFETY-P1 Mechanism B: Notify Safety-Task (Core 1) to set actuators to safe state.
            // xTaskNotify is ISR-safe and has < 1µs latency.
            // ESP-IDF reconnects automatically — no manual reconnect() needed!
            if (g_safety_task_handle != NULL) {
                xTaskNotify(g_safety_task_handle, NOTIFY_MQTT_DISCONNECTED, eSetBits);
            }
            break;

        case MQTT_EVENT_DATA: {
            // KRITISCH: event->topic and event->data are NOT null-terminated!
            // All existing handlers (strcmp, strstr, String comparison) expect '\0'.
            // Without null-termination: buffer-overread → crash.

            // Check for fragmented messages (should not happen with buffer.size=4096,
            // but guard defensively).
            if (event->current_data_offset > 0) {
                ESP_LOGW(TAG, "[M2] Fragmented MQTT_EVENT_DATA received (offset=%d, total=%d) "
                              "— message discarded. Increase buffer.size if this recurs.",
                         event->current_data_offset, event->total_data_len);
                break;
            }

            // Null-terminate topic (max topic length ~120 chars; buffer has +Reserve)
            char topic_buf[192];
            size_t tlen = (event->topic_len < sizeof(topic_buf) - 1)
                          ? static_cast<size_t>(event->topic_len)
                          : sizeof(topic_buf) - 1;
            memcpy(topic_buf, event->topic, tlen);
            topic_buf[tlen] = '\0';

            // Null-terminate payload (must match buffer.size=4096)
            // static: moves 4096 B from mqtt_task stack to BSS — prevents stack overflow
            // Safe: esp-mqtt processes MQTT_EVENT_DATA serially within mqtt_task (no reentrancy)
            static char data_buf[4096];
            size_t dlen = (event->data_len < sizeof(data_buf) - 1)
                          ? static_cast<size_t>(event->data_len)
                          : sizeof(data_buf) - 1;
            memcpy(data_buf, event->data, dlen);
            data_buf[dlen] = '\0';

            // Logging in routeIncomingMessage() (single place)
            routeIncomingMessage(topic_buf, data_buf);
            break;
        }

        case MQTT_EVENT_SUBSCRIBED:
            LOG_D(TAG, "MQTT_EVENT_SUBSCRIBED msg_id=" + String(event->msg_id));
            break;

        case MQTT_EVENT_PUBLISHED:
            LOG_D(TAG, "MQTT_EVENT_PUBLISHED msg_id=" + String(event->msg_id));
            break;

        case MQTT_EVENT_ERROR:
            if (event->error_handle != nullptr) {
                ESP_LOGE(TAG, "MQTT_EVENT_ERROR type=%d", event->error_handle->error_type);
                if (event->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
                    ESP_LOGE(TAG, "  TCP transport error: %d (esp_err=%s)",
                             event->error_handle->esp_transport_sock_errno,
                             esp_err_to_name(event->error_handle->esp_tls_last_esp_err));
                } else if (event->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
                    ESP_LOGE(TAG, "  Connection refused, reason=%d",
                             event->error_handle->connect_return_code);
                }
            }
            break;

        default:
            break;
    }
}
#endif  // !MQTT_USE_PUBSUBCLIENT

// ============================================
// PUBSUBCLIENT-SPECIFIC IMPLEMENTATIONS
// (only compiled when MQTT_USE_PUBSUBCLIENT is defined)
// ============================================
#ifdef MQTT_USE_PUBSUBCLIENT

bool MQTTClient::connectToBroker() {
    LOG_I(TAG, "Connecting to MQTT broker: " + current_config_.server + ":" + String(current_config_.port));

    // Re-set server before every connection attempt to prevent dangling pointer.
    mqtt_.setServer(current_config_.server.c_str(), current_config_.port);

    // Build Last-Will
    String last_will_topic = String(TopicBuilder::buildSystemHeartbeatTopic());
    last_will_topic.replace("/heartbeat", "/will");

    time_t will_timestamp = timeManager.getUnixTimestamp();
    String last_will_message = "{\"status\":\"offline\",\"esp_id\":\"" + g_system_config.esp_id +
                               "\",\"reason\":\"unexpected_disconnect\",\"timestamp\":" +
                               String((unsigned long)will_timestamp) + "}";

    LOG_I(TAG, "Last-Will Topic: " + last_will_topic);

    // ✅ FIX #2: Auto-Fallback von Port 8883 → 1883
    bool connected = attemptMQTTConnection(last_will_topic, last_will_message);

    if (!connected && current_config_.port == 8883) {
        LOG_W(TAG, "Port 8883 (TLS) failed - trying port 1883 (plain MQTT)");
        current_config_.port = 1883;
        mqtt_.setServer(current_config_.server.c_str(), current_config_.port);
        connected = attemptMQTTConnection(last_will_topic, last_will_message);
        if (connected) {
            LOG_I(TAG, "✅ Port-Fallback successful! Connected on port 1883");
        }
    }

    if (connected) {
        LOG_I(TAG, "MQTT connected!");
        reconnect_attempts_ = 0;
        reconnect_delay_ms_ = RECONNECT_BASE_DELAY_MS;
        circuit_breaker_.recordSuccess();
        registration_confirmed_ = false;
        registration_start_ms_ = millis();
        registration_timeout_logged_ = false;
        LOG_I(TAG, "Registration gate closed - awaiting heartbeat ACK");
        processOfflineBuffer();
        if (on_connect_callback_) {
            on_connect_callback_();
        }
        return true;
    } else {
        LOG_E(TAG, "MQTT connection failed, rc=" + String(mqtt_.state()));
        errorTracker.logCommunicationError(ERROR_MQTT_CONNECT_FAILED,
                                           ("MQTT connection failed, rc=" + String(mqtt_.state())).c_str());
        return false;
    }
}

bool MQTTClient::attemptMQTTConnection(const String& last_will_topic, const String& last_will_message) {
    bool result = false;
    if (anonymous_mode_) {
        result = mqtt_.connect(
            current_config_.client_id.c_str(),
            last_will_topic.c_str(),
            1,     // QoS 1
            true,  // Retain
            last_will_message.c_str()
        );
    } else {
        result = mqtt_.connect(
            current_config_.client_id.c_str(),
            current_config_.username.c_str(),
            current_config_.password.c_str(),
            last_will_topic.c_str(),
            1,     // QoS 1
            true,  // Retain
            last_will_message.c_str()
        );
    }
    return result;
}

void MQTTClient::handleDisconnection() {
    static bool disconnection_logged = false;

    registration_confirmed_ = false;
    registration_start_ms_ = 0;
    registration_timeout_logged_ = false;
    LOG_D(TAG, "Registration gate closed due to disconnect");

    if (actuatorManager.isInitialized()) {
        if (offlineModeManager.getOfflineRuleCount() > 0) {
            LOG_W(TAG, "[SAFETY] MQTT disconnected — " +
                  String(offlineModeManager.getOfflineRuleCount()) +
                  " offline rules available, delegating to P4");
        } else {
            actuatorManager.setAllActuatorsToSafeState();
            LOG_W(TAG, "[SAFETY] MQTT disconnected — no offline rules, safe state immediately");
        }
    }

    // SAFETY-P4: Start 30s grace timer for offline hysteresis
    LOG_W(TAG, "[SAFETY-P4] disconnect notified (path=PubSubClient)");
    offlineModeManager.onDisconnect();

    if (!disconnection_logged) {
        LOG_W(TAG, "MQTT disconnected");
        errorTracker.logCommunicationError(ERROR_MQTT_DISCONNECT, "MQTT connection lost");
        disconnection_logged = true;
    }

    reconnect();

    if (isConnected()) {
        disconnection_logged = false;
    }
}

bool MQTTClient::shouldAttemptReconnect() const {
    if (circuit_breaker_.getState() == CircuitState::HALF_OPEN) {
        return true;
    }
    unsigned long current_time = millis();
    if (current_time - last_reconnect_attempt_ < reconnect_delay_ms_) {
        return false;
    }
    return true;
}

void MQTTClient::processOfflineBuffer() {
    if (offline_buffer_count_ == 0) return;

    LOG_I(TAG, "Processing offline buffer (" + String(offline_buffer_count_) + " messages)");

    uint16_t processed = 0;
    for (uint16_t i = 0; i < offline_buffer_count_; i++) {
        if (publish(offline_buffer_[i].topic, offline_buffer_[i].payload, offline_buffer_[i].qos)) {
            processed++;
        } else {
            break;
        }
    }

    if (processed > 0) {
        uint16_t remaining = offline_buffer_count_ - processed;
        for (uint16_t i = 0; i < remaining; i++) {
            offline_buffer_[i] = offline_buffer_[i + processed];
        }
        offline_buffer_count_ = remaining;
        LOG_I(TAG, "Processed " + String(processed) + " offline messages, " +
                   String(remaining) + " remaining");
    }
}

bool MQTTClient::addToOfflineBuffer(const String& topic, const String& payload, uint8_t qos) {
    if (payload.length() == 0) {
        LOG_W(TAG, "Empty payload rejected from offline buffer: " + topic);
        return false;
    }
    if (offline_buffer_count_ >= MAX_OFFLINE_MESSAGES) {
        LOG_E(TAG, "Offline buffer full, dropping message");
        errorTracker.logCommunicationError(ERROR_MQTT_BUFFER_FULL, "Offline buffer full");
        return false;
    }
    offline_buffer_[offline_buffer_count_].topic     = topic;
    offline_buffer_[offline_buffer_count_].payload   = payload;
    offline_buffer_[offline_buffer_count_].qos       = qos;
    offline_buffer_[offline_buffer_count_].timestamp = millis();
    offline_buffer_count_++;
    LOG_D(TAG, "Added to offline buffer (count: " + String(offline_buffer_count_) + ")");
    return true;
}

unsigned long MQTTClient::calculateBackoffDelay() const {
    unsigned long delay = RECONNECT_BASE_DELAY_MS * (1 << reconnect_attempts_);
    if (delay > RECONNECT_MAX_DELAY_MS) {
        delay = RECONNECT_MAX_DELAY_MS;
    }
    return delay;
}

void MQTTClient::staticCallback(char* topic, byte* payload, unsigned int length) {
    if (!instance_) return;

    String topic_str = String(topic);
    String payload_str;
    payload_str.reserve(length);
    for (unsigned int i = 0; i < length; i++) {
        payload_str += (char)payload[i];
    }

    if (instance_->message_callback_) {
        instance_->message_callback_(topic_str, payload_str);
    }
}

#endif  // MQTT_USE_PUBSUBCLIENT
