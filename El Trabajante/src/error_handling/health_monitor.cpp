#include "health_monitor.h"
#include "../utils/logger.h"
#include "../services/communication/wifi_manager.h"
#include "../services/communication/mqtt_client.h"
#include "../services/sensor/sensor_manager.h"
#include "../services/actuator/actuator_manager.h"
#include "../error_handling/error_tracker.h"
#include "../utils/topic_builder.h"
#include "../models/error_codes.h"
#include "../models/watchdog_types.h"

// ============================================
// EXTERNAL GLOBAL VARIABLES (from main.cpp)
// ============================================
extern SystemConfig g_system_config;
extern KaiserZone g_kaiser;
extern WatchdogConfig g_watchdog_config;
extern WatchdogDiagnostics g_watchdog_diagnostics;
extern volatile bool g_watchdog_timeout_flag;

// ============================================
// GLOBAL HEALTH MONITOR INSTANCE
// ============================================
HealthMonitor& healthMonitor = HealthMonitor::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
HealthMonitor& HealthMonitor::getInstance() {
    static HealthMonitor instance;
    return instance;
}

// ============================================
// CONSTRUCTOR
// ============================================
HealthMonitor::HealthMonitor()
    : change_detection_enabled_(true),
      publish_interval_ms_(60000),  // Default: 60 seconds
      last_publish_time_(0),
      initialized_(false) {
    // Initialize last_published_snapshot_ to zero
    memset(&last_published_snapshot_, 0, sizeof(HealthSnapshot));
}

// ============================================
// INITIALIZATION
// ============================================
bool HealthMonitor::begin() {
    if (initialized_) {
        LOG_WARNING("HealthMonitor already initialized");
        return true;
    }
    
    // Reset snapshot
    memset(&last_published_snapshot_, 0, sizeof(HealthSnapshot));
    last_publish_time_ = 0;
    
    initialized_ = true;
    LOG_INFO("HealthMonitor: Initialized");
    
    return true;
}

// ============================================
// HEALTH SNAPSHOT GENERATION
// ============================================
HealthSnapshot HealthMonitor::getCurrentSnapshot() const {
    HealthSnapshot snapshot;
    
    // Timestamp
    snapshot.timestamp = millis() / 1000;  // Convert to seconds
    
    // Heap information
    snapshot.heap_free = ESP.getFreeHeap();
    snapshot.heap_min_free = ESP.getMinFreeHeap();
    snapshot.heap_fragmentation_percent = getHeapFragmentation();
    
    // Uptime
    snapshot.uptime_seconds = getUptimeSeconds();
    
    // Error count
    snapshot.error_count = errorTracker.getErrorCount();
    
    // WiFi status
    snapshot.wifi_connected = wifiManager.isConnected();
    snapshot.wifi_rssi = wifiManager.getRSSI();
    
    // MQTT status
    snapshot.mqtt_connected = mqttClient.isConnected();
    
    // Sensor/Actuator counts
    snapshot.sensor_count = sensorManager.getActiveSensorCount();
    snapshot.actuator_count = actuatorManager.getActiveActuatorCount();
    
    // System state
    snapshot.system_state = g_system_config.current_state;
    
    // ─────────────────────────────────────────────────────
    // WATCHDOG STATUS
    // ─────────────────────────────────────────────────────
    snapshot.watchdog_mode = g_watchdog_config.mode;
    snapshot.watchdog_timeout_ms = g_watchdog_config.timeout_ms;
    snapshot.last_watchdog_feed = g_watchdog_diagnostics.last_feed_time;
    snapshot.last_feed_component = g_watchdog_diagnostics.last_feed_component;
    snapshot.watchdog_feed_count = g_watchdog_diagnostics.feed_count;
    snapshot.watchdog_timeouts_24h = getWatchdogCountLast24h();
    snapshot.watchdog_timeout_pending = g_watchdog_timeout_flag;
    
    return snapshot;
}

// ============================================
// HEAP FRAGMENTATION CALCULATION
// ============================================
uint8_t HealthMonitor::getHeapFragmentation() const {
    uint32_t free_heap = ESP.getFreeHeap();
    uint32_t min_free_heap = ESP.getMinFreeHeap();
    
    if (free_heap == 0) {
        return 100;
    }
    
    // Fragmentation = (free - min_free) / free * 100
    uint32_t fragmentation_bytes = free_heap - min_free_heap;
    return (fragmentation_bytes * 100) / free_heap;
}

// ============================================
// UPTIME CALCULATION
// ============================================
unsigned long HealthMonitor::getUptimeSeconds() const {
    return millis() / 1000;
}

// ============================================
// STATUS GETTERS
// ============================================
uint32_t HealthMonitor::getHeapFree() const {
    return ESP.getFreeHeap();
}

uint32_t HealthMonitor::getHeapMinFree() const {
    return ESP.getMinFreeHeap();
}

// ============================================
// CHANGE DETECTION
// ============================================
bool HealthMonitor::hasSignificantChanges(const HealthSnapshot& current, 
                                          const HealthSnapshot& last) const {
    // First snapshot (all zeros) - always publish
    if (last.timestamp == 0) {
        return true;
    }
    
    // Heap change > 20%
    if (last.heap_free > 0) {
        uint32_t heap_change = (current.heap_free > last.heap_free) ?
                              (current.heap_free - last.heap_free) :
                              (last.heap_free - current.heap_free);
        if ((heap_change * 100) / last.heap_free > HEAP_CHANGE_THRESHOLD_PERCENT) {
            return true;
        }
    }
    
    // RSSI change > 10 dBm
    if (abs(current.wifi_rssi - last.wifi_rssi) > RSSI_CHANGE_THRESHOLD_DBM) {
        return true;
    }
    
    // Connection status change
    if (current.wifi_connected != last.wifi_connected ||
        current.mqtt_connected != last.mqtt_connected) {
        return true;
    }
    
    // Sensor/Actuator count change
    if (current.sensor_count != last.sensor_count ||
        current.actuator_count != last.actuator_count) {
        return true;
    }
    
    // System state change
    if (current.system_state != last.system_state) {
        return true;
    }
    
    // Error count significant change (> 5 errors)
    if (abs((int)(current.error_count - last.error_count)) > 5) {
        return true;
    }
    
    return false;
}

// ============================================
// JSON PAYLOAD GENERATION
// ============================================
String HealthMonitor::getSnapshotJSON() const {
    HealthSnapshot snapshot = getCurrentSnapshot();
    
    // Build JSON payload
    String json = "{";
    json += "\"ts\":" + String(snapshot.timestamp) + ",";
    json += "\"esp_id\":\"" + g_system_config.esp_id + "\",";
    json += "\"heap_free\":" + String(snapshot.heap_free) + ",";
    json += "\"heap_min_free\":" + String(snapshot.heap_min_free) + ",";
    json += "\"heap_fragmentation\":" + String(snapshot.heap_fragmentation_percent) + ",";
    json += "\"uptime_seconds\":" + String(snapshot.uptime_seconds) + ",";
    json += "\"error_count\":" + String(snapshot.error_count) + ",";
    json += "\"wifi_connected\":" + String(snapshot.wifi_connected ? "true" : "false") + ",";
    json += "\"wifi_rssi\":" + String(snapshot.wifi_rssi) + ",";
    json += "\"mqtt_connected\":" + String(snapshot.mqtt_connected ? "true" : "false") + ",";
    json += "\"sensor_count\":" + String(snapshot.sensor_count) + ",";
    json += "\"actuator_count\":" + String(snapshot.actuator_count) + ",";
    
    // System state as string
    String state_str = "UNKNOWN";
    switch (snapshot.system_state) {
        case STATE_BOOT: state_str = "BOOT"; break;
        case STATE_WIFI_SETUP: state_str = "WIFI_SETUP"; break;
        case STATE_WIFI_CONNECTED: state_str = "WIFI_CONNECTED"; break;
        case STATE_MQTT_CONNECTING: state_str = "MQTT_CONNECTING"; break;
        case STATE_MQTT_CONNECTED: state_str = "MQTT_CONNECTED"; break;
        case STATE_AWAITING_USER_CONFIG: state_str = "AWAITING_USER_CONFIG"; break;
        case STATE_ZONE_CONFIGURED: state_str = "ZONE_CONFIGURED"; break;
        case STATE_SENSORS_CONFIGURED: state_str = "SENSORS_CONFIGURED"; break;
        case STATE_OPERATIONAL: state_str = "OPERATIONAL"; break;
        case STATE_LIBRARY_DOWNLOADING: state_str = "LIBRARY_DOWNLOADING"; break;
        case STATE_SAFE_MODE: state_str = "SAFE_MODE"; break;
        case STATE_ERROR: state_str = "ERROR"; break;
        default: state_str = "UNKNOWN"; break;
    }
    json += "\"system_state\":\"" + state_str + "\"";
    json += "}";
    
    return json;
}

// ============================================
// TOPIC BUILDING
// ============================================
String HealthMonitor::buildDiagnosticsTopic() const {
    // Use TopicBuilder for consistency
    return String(TopicBuilder::buildSystemDiagnosticsTopic());
}

// ============================================
// PUBLISHING
// ============================================
void HealthMonitor::publishSnapshot() {
    if (!initialized_) {
        return;
    }
    
    if (!mqttClient.isConnected()) {
        LOG_DEBUG("HealthMonitor: MQTT not connected, skipping publish");
        return;
    }
    
    String topic = buildDiagnosticsTopic();
    String payload = getSnapshotJSON();
    
    if (mqttClient.publish(topic, payload, 0)) {  // QoS 0
        LOG_DEBUG("HealthMonitor: Published diagnostics snapshot");
        last_published_snapshot_ = getCurrentSnapshot();
    } else {
        LOG_WARNING("HealthMonitor: Failed to publish diagnostics snapshot");
        errorTracker.trackError(ERROR_MQTT_PUBLISH_FAILED, ERROR_SEVERITY_WARNING,
                               "HealthMonitor publish failed");
    }
}

void HealthMonitor::publishSnapshotIfChanged() {
    if (!initialized_) {
        return;
    }
    
    HealthSnapshot current = getCurrentSnapshot();
    
    if (!change_detection_enabled_ || hasSignificantChanges(current, last_published_snapshot_)) {
        publishSnapshot();
    }
}

// ============================================
// LOOP (call in main loop)
// ============================================
void HealthMonitor::loop() {
    if (!initialized_) {
        return;
    }
    
    unsigned long current_time = millis();
    
    // Check if publish interval elapsed
    if (current_time - last_publish_time_ >= publish_interval_ms_) {
        last_publish_time_ = current_time;
        publishSnapshotIfChanged();
    }
}

// ============================================
// CONFIGURATION
// ============================================
void HealthMonitor::setPublishInterval(unsigned long interval_ms) {
    publish_interval_ms_ = interval_ms;
    LOG_INFO("HealthMonitor: Publish interval set to " + String(interval_ms) + " ms");
}

void HealthMonitor::setChangeDetectionEnabled(bool enabled) {
    change_detection_enabled_ = enabled;
    LOG_INFO("HealthMonitor: Change detection " + String(enabled ? "enabled" : "disabled"));
}

