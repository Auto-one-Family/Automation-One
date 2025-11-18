#include "pi_enhanced_processor.h"
#include "../communication/http_client.h"
#include "../config/config_manager.h"
#include "../../utils/logger.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"

// ============================================
// GLOBAL PI ENHANCED PROCESSOR INSTANCE
// ============================================
PiEnhancedProcessor& piEnhancedProcessor = PiEnhancedProcessor::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
PiEnhancedProcessor& PiEnhancedProcessor::getInstance() {
    static PiEnhancedProcessor instance;
    return instance;
}

// ============================================
// PRIVATE CONSTRUCTOR
// ============================================
PiEnhancedProcessor::PiEnhancedProcessor()
    : http_client_(nullptr),
      pi_server_address_(""),
      pi_server_port_(8000),
      last_response_time_(0),
      consecutive_failures_(0),
      max_failures_(5),
      circuit_open_(false),
      circuit_open_time_(0),
      circuit_timeout_(60000) {  // 60 seconds
}

PiEnhancedProcessor::~PiEnhancedProcessor() {
    end();
}

// ============================================
// LIFECYCLE: INITIALIZATION
// ============================================
bool PiEnhancedProcessor::begin() {
    LOG_INFO("PiEnhancedProcessor: Initializing...");
    
    // Get HTTP client instance
    http_client_ = &HTTPClient::getInstance();
    
    if (!http_client_->isInitialized()) {
        if (!http_client_->begin()) {
            LOG_ERROR("PiEnhancedProcessor: HTTPClient initialization failed");
            errorTracker.trackError(ERROR_HTTP_INIT_FAILED, ERROR_SEVERITY_ERROR,
                                   "HTTPClient initialization failed");
            return false;
        }
    }
    
    // Load server address from ConfigManager
    ConfigManager& config = ConfigManager::getInstance();
    WiFiConfig wifi_config = config.getWiFiConfig();
    
    if (wifi_config.server_address.length() > 0) {
        pi_server_address_ = wifi_config.server_address;
    } else {
        // Fallback to default
        pi_server_address_ = "192.168.1.100";
        LOG_WARNING("PiEnhancedProcessor: Using default server address: " + pi_server_address_);
    }
    
    LOG_INFO("PiEnhancedProcessor: Initialized - Server: " + pi_server_address_ + 
             ":" + String(pi_server_port_));
    
    return true;
}

// ============================================
// LIFECYCLE: DEINITIALIZATION
// ============================================
void PiEnhancedProcessor::end() {
    LOG_INFO("PiEnhancedProcessor: Deinitialized");
}

// ============================================
// SEND RAW DATA TO SERVER
// ============================================
bool PiEnhancedProcessor::sendRawData(const RawSensorData& data, ProcessedSensorData& processed_out) {
    // Initialize processed_out
    processed_out.valid = false;
    processed_out.value = 0.0;
    processed_out.unit = "";
    processed_out.quality = "";
    processed_out.timestamp = 0;
    processed_out.error_message = "";
    
    // Check circuit breaker
    checkCircuitBreakerReset();
    
    if (circuit_open_) {
        LOG_WARNING("PiEnhancedProcessor: Circuit breaker is OPEN - skipping request");
        processed_out.error_message = "Circuit breaker open";
        return false;
    }
    
    if (!http_client_ || !http_client_->isInitialized()) {
        LOG_ERROR("PiEnhancedProcessor: HTTPClient not initialized");
        processed_out.error_message = "HTTPClient not initialized";
        updateCircuitBreaker(false);
        return false;
    }
    
    // Build request URL
    String url = buildRequestUrl();
    
    // Build request payload
    String payload = buildRequestPayload(data);
    
    // Send POST request
    HTTPResponse response = http_client_->post(url.c_str(), payload.c_str(), 
                                               "application/json", 5000);
    
    // Update circuit breaker
    updateCircuitBreaker(response.success);
    
    if (!response.success) {
        LOG_ERROR("PiEnhancedProcessor: HTTP request failed - " + String(response.error_message));
        processed_out.error_message = response.error_message;
        return false;
    }
    
    // Parse response
    if (!parseResponse(response.body, processed_out)) {
        LOG_ERROR("PiEnhancedProcessor: Failed to parse response");
        processed_out.error_message = "JSON parse error";
        updateCircuitBreaker(false);
        return false;
    }
    
    // Update last response time
    last_response_time_ = millis();
    
    return true;
}

// ============================================
// BUILD REQUEST URL
// ============================================
String PiEnhancedProcessor::buildRequestUrl() const {
    String url;
    url.reserve(128);
    url = "http://";
    url += pi_server_address_;
    url += ":";
    url += String(pi_server_port_);
    url += "/api/v1/sensors/process";
    return url;
}

// ============================================
// BUILD REQUEST PAYLOAD
// ============================================
String PiEnhancedProcessor::buildRequestPayload(const RawSensorData& data) const {
    String payload;
    payload.reserve(256);
    
    // Get ESP ID from ConfigManager
    ConfigManager& config = ConfigManager::getInstance();
    String esp_id = config.getESPId();
    
    // Build JSON payload
    payload = "{";
    payload += "\"esp_id\":\"";
    payload += esp_id;
    payload += "\",";
    payload += "\"gpio\":";
    payload += String(data.gpio);
    payload += ",";
    payload += "\"sensor_type\":\"";
    payload += data.sensor_type;
    payload += "\",";
    payload += "\"raw_value\":";
    payload += String(data.raw_value);
    payload += ",";
    payload += "\"timestamp\":";
    payload += String(data.timestamp);
    
    if (data.metadata.length() > 0) {
        payload += ",\"metadata\":";
        payload += data.metadata;
    } else {
        payload += ",\"metadata\":{}";
    }
    
    payload += "}";
    
    return payload;
}

// ============================================
// PARSE JSON RESPONSE
// ============================================
bool PiEnhancedProcessor::parseResponse(const String& json_response, ProcessedSensorData& processed_out) {
    // Simple JSON parsing (no external library)
    // Expected format: {"processed_value": 7.2, "unit": "pH", "quality": "good", "timestamp": 1735818000}
    
    processed_out.valid = false;
    
    // Find processed_value
    int value_start = json_response.indexOf("\"processed_value\":");
    if (value_start == -1) {
        return false;
    }
    value_start += 18;  // Length of "processed_value":
    int value_end = json_response.indexOf(",", value_start);
    if (value_end == -1) {
        value_end = json_response.indexOf("}", value_start);
    }
    if (value_end == -1) {
        return false;
    }
    String value_str = json_response.substring(value_start, value_end);
    value_str.trim();
    processed_out.value = value_str.toFloat();
    
    // Find unit
    int unit_start = json_response.indexOf("\"unit\":\"");
    if (unit_start != -1) {
        unit_start += 8;  // Length of "unit":""
        int unit_end = json_response.indexOf("\"", unit_start);
        if (unit_end != -1) {
            processed_out.unit = json_response.substring(unit_start, unit_end);
        }
    }
    
    // Find quality
    int quality_start = json_response.indexOf("\"quality\":\"");
    if (quality_start != -1) {
        quality_start += 11;  // Length of "quality":""
        int quality_end = json_response.indexOf("\"", quality_start);
        if (quality_end != -1) {
            processed_out.quality = json_response.substring(quality_start, quality_end);
        }
    }
    
    // Find timestamp
    int ts_start = json_response.indexOf("\"timestamp\":");
    if (ts_start != -1) {
        ts_start += 12;  // Length of "timestamp":
        int ts_end = json_response.indexOf(",", ts_start);
        if (ts_end == -1) {
            ts_end = json_response.indexOf("}", ts_start);
        }
        if (ts_end != -1) {
            String ts_str = json_response.substring(ts_start, ts_end);
            ts_str.trim();
            processed_out.timestamp = ts_str.toInt();
        }
    } else {
        processed_out.timestamp = millis();
    }
    
    processed_out.valid = true;
    return true;
}

// ============================================
// UPDATE CIRCUIT BREAKER
// ============================================
void PiEnhancedProcessor::updateCircuitBreaker(bool success) {
    if (success) {
        // Reset on success
        consecutive_failures_ = 0;
        circuit_open_ = false;
        circuit_open_time_ = 0;
    } else {
        // Increment failures
        consecutive_failures_++;
        
        if (consecutive_failures_ >= max_failures_) {
            circuit_open_ = true;
            circuit_open_time_ = millis();
            LOG_WARNING("PiEnhancedProcessor: Circuit breaker OPENED after " + 
                       String(consecutive_failures_) + " failures");
        }
    }
}

// ============================================
// CHECK CIRCUIT BREAKER RESET
// ============================================
void PiEnhancedProcessor::checkCircuitBreakerReset() {
    if (circuit_open_ && (millis() - circuit_open_time_ >= circuit_timeout_)) {
        // Timeout expired, reset circuit breaker
        circuit_open_ = false;
        consecutive_failures_ = 0;
        circuit_open_time_ = 0;
        LOG_INFO("PiEnhancedProcessor: Circuit breaker RESET after timeout");
    }
}

// ============================================
// SERVER STATUS QUERIES
// ============================================
bool PiEnhancedProcessor::isPiAvailable() const {
    return !circuit_open_;
}

String PiEnhancedProcessor::getPiServerAddress() const {
    return pi_server_address_;
}

uint16_t PiEnhancedProcessor::getPiServerPort() const {
    return pi_server_port_;
}

unsigned long PiEnhancedProcessor::getLastResponseTime() const {
    return last_response_time_;
}

bool PiEnhancedProcessor::isCircuitOpen() const {
    return circuit_open_;
}

void PiEnhancedProcessor::resetCircuitBreaker() {
    circuit_open_ = false;
    consecutive_failures_ = 0;
    circuit_open_time_ = 0;
    LOG_INFO("PiEnhancedProcessor: Circuit breaker manually RESET");
}

uint8_t PiEnhancedProcessor::getConsecutiveFailures() const {
    return consecutive_failures_;
}

