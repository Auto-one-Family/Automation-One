#include "error_tracker.h"
#include "../utils/logger.h"
#include "../utils/topic_builder.h"
#include "../utils/time_manager.h"

// ============================================
// GLOBAL ERROR TRACKER INSTANCE
// ============================================
ErrorTracker& errorTracker = ErrorTracker::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
ErrorTracker& ErrorTracker::getInstance() {
  static ErrorTracker instance;
  return instance;
}

ErrorTracker::ErrorTracker()
  : error_buffer_index_(0),
    error_count_(0),
    mqtt_callback_(nullptr),
    mqtt_esp_id_(""),
    mqtt_publishing_enabled_(false),
    mqtt_publish_in_progress_(false) {
  // Initialize fixed buffer
  for (size_t i = 0; i < MAX_ERROR_ENTRIES; i++) {
    error_buffer_[i] = ErrorEntry();
  }
}

// ============================================
// INITIALIZATION (Guide-konform)
// ============================================
void ErrorTracker::begin() {
  error_buffer_index_ = 0;
  error_count_ = 0;
  
  for (size_t i = 0; i < MAX_ERROR_ENTRIES; i++) {
    error_buffer_[i] = ErrorEntry();
  }
  
  LOG_INFO("ErrorTracker: Initialized");
}

// ============================================
// ERROR TRACKING (Primary API)
// ============================================
void ErrorTracker::trackError(uint16_t error_code, ErrorSeverity severity, const char* message) {
  // Log to Logger
  logErrorToLogger(error_code, severity, message);
  
  // Add to circular buffer
  addToBuffer(error_code, severity, message);
  
  // Publish to MQTT (if enabled and not recursing)
  publishErrorToMqtt(error_code, severity, message);
}

void ErrorTracker::trackError(uint16_t error_code, const char* message) {
  trackError(error_code, ERROR_SEVERITY_ERROR, message);
}

// ============================================
// CONVENIENCE METHODS
// ============================================
void ErrorTracker::logHardwareError(uint16_t code, const char* message) {
  trackError(ERROR_HARDWARE + code, ERROR_SEVERITY_ERROR, message);
}

void ErrorTracker::logServiceError(uint16_t code, const char* message) {
  trackError(ERROR_SERVICE + code, ERROR_SEVERITY_ERROR, message);
}

void ErrorTracker::logCommunicationError(uint16_t code, const char* message) {
  trackError(ERROR_COMMUNICATION + code, ERROR_SEVERITY_ERROR, message);
}

void ErrorTracker::logApplicationError(uint16_t code, const char* message) {
  trackError(ERROR_APPLICATION + code, ERROR_SEVERITY_ERROR, message);
}

// ============================================
// ERROR RETRIEVAL
// ============================================
String ErrorTracker::getErrorHistory(uint8_t max_entries) const {
  String result = "";
  size_t entries_added = 0;
  
  // Start from oldest entry
  size_t start_index = (error_count_ < MAX_ERROR_ENTRIES) ? 0 : error_buffer_index_;
  
  for (size_t i = 0; i < error_count_ && entries_added < max_entries; i++) {
    size_t index = (start_index + i) % MAX_ERROR_ENTRIES;
    const ErrorEntry& entry = error_buffer_[index];
    
    result += "[" + String(entry.timestamp) + "] ";
    result += "[" + String(entry.error_code) + "] ";
    result += "[" + String(getCategoryString(entry.error_code)) + "] ";
    result += String(entry.message);
    if (entry.occurrence_count > 1) {
      result += " (x" + String(entry.occurrence_count) + ")";
    }
    result += "\n";
    entries_added++;
  }
  
  return result;
}

String ErrorTracker::getErrorsByCategory(ErrorCategory category, uint8_t max_entries) const {
  String result = "";
  size_t entries_added = 0;
  
  size_t start_index = (error_count_ < MAX_ERROR_ENTRIES) ? 0 : error_buffer_index_;
  
  for (size_t i = 0; i < error_count_ && entries_added < max_entries; i++) {
    size_t index = (start_index + i) % MAX_ERROR_ENTRIES;
    const ErrorEntry& entry = error_buffer_[index];
    
    if (getCategory(entry.error_code) == category) {
      result += "[" + String(entry.timestamp) + "] ";
      result += "[" + String(entry.error_code) + "] ";
      result += String(entry.message);
      if (entry.occurrence_count > 1) {
        result += " (x" + String(entry.occurrence_count) + ")";
      }
      result += "\n";
      entries_added++;
    }
  }
  
  return result;
}

size_t ErrorTracker::getErrorCount() const {
  return error_count_;
}

size_t ErrorTracker::getErrorCountByCategory(ErrorCategory category) const {
  size_t count = 0;
  
  size_t start_index = (error_count_ < MAX_ERROR_ENTRIES) ? 0 : error_buffer_index_;
  
  for (size_t i = 0; i < error_count_; i++) {
    size_t index = (start_index + i) % MAX_ERROR_ENTRIES;
    if (getCategory(error_buffer_[index].error_code) == category) {
      count++;
    }
  }
  
  return count;
}

// ============================================
// ERROR STATUS
// ============================================
bool ErrorTracker::hasActiveErrors() const {
  return error_count_ > 0;
}

bool ErrorTracker::hasCriticalErrors() const {
  size_t start_index = (error_count_ < MAX_ERROR_ENTRIES) ? 0 : error_buffer_index_;
  
  for (size_t i = 0; i < error_count_; i++) {
    size_t index = (start_index + i) % MAX_ERROR_ENTRIES;
    if (error_buffer_[index].severity == ERROR_SEVERITY_CRITICAL) {
      return true;
    }
  }
  
  return false;
}

void ErrorTracker::clearErrors() {
  error_buffer_index_ = 0;
  error_count_ = 0;
  LOG_INFO("ErrorTracker: Error history cleared");
}

// ============================================
// HELPER METHODS
// ============================================
void ErrorTracker::addToBuffer(uint16_t error_code, ErrorSeverity severity, const char* message) {
  // Check if this error already exists in recent entries (last 5) - occurrence counting
  for (int i = 0; i < 5 && i < (int)error_count_; i++) {
    int check_index = (error_buffer_index_ - 1 - i + MAX_ERROR_ENTRIES) % MAX_ERROR_ENTRIES;
    ErrorEntry& entry = error_buffer_[check_index];
    
    if (entry.error_code == error_code && strcmp(entry.message, message) == 0) {
      entry.occurrence_count++;
      entry.timestamp = millis();  // Update timestamp
      return;  // Don't add duplicate
    }
  }
  
  // Add new entry
  size_t index = error_buffer_index_;
  error_buffer_[index].timestamp = millis();
  error_buffer_[index].error_code = error_code;
  error_buffer_[index].severity = severity;
  strncpy(error_buffer_[index].message, message, sizeof(error_buffer_[index].message) - 1);
  error_buffer_[index].message[sizeof(error_buffer_[index].message) - 1] = '\0';
  error_buffer_[index].occurrence_count = 1;
  
  // Advance circular buffer index
  error_buffer_index_ = (error_buffer_index_ + 1) % MAX_ERROR_ENTRIES;
  
  // Track total count (up to MAX_ERROR_ENTRIES)
  if (error_count_ < MAX_ERROR_ENTRIES) {
    error_count_++;
  }
}

void ErrorTracker::logErrorToLogger(uint16_t error_code, ErrorSeverity severity, const char* message) {
  String log_msg = "[" + String(error_code) + "] [" + 
                   String(getCategoryString(error_code)) + "] " + 
                   String(message);
  
  switch (severity) {
    case ERROR_SEVERITY_WARNING:
      LOG_WARNING(log_msg.c_str());
      break;
    case ERROR_SEVERITY_ERROR:
      LOG_ERROR(log_msg.c_str());
      break;
    case ERROR_SEVERITY_CRITICAL:
      LOG_CRITICAL(log_msg.c_str());
      break;
  }
}

// ============================================
// UTILITIES
// ============================================
const char* ErrorTracker::getCategoryString(uint16_t error_code) {
  if (error_code >= ERROR_APPLICATION && error_code < 5000) {
    return "APPLICATION";
  } else if (error_code >= ERROR_COMMUNICATION && error_code < 4000) {
    return "COMMUNICATION";
  } else if (error_code >= ERROR_SERVICE && error_code < 3000) {
    return "SERVICE";
  } else if (error_code >= ERROR_HARDWARE && error_code < 2000) {
    return "HARDWARE";
  } else {
    return "UNKNOWN";
  }
}

ErrorCategory ErrorTracker::getCategory(uint16_t error_code) {
  if (error_code >= ERROR_APPLICATION && error_code < 5000) {
    return ERROR_APPLICATION;
  } else if (error_code >= ERROR_COMMUNICATION && error_code < 4000) {
    return ERROR_COMMUNICATION;
  } else if (error_code >= ERROR_SERVICE && error_code < 3000) {
    return ERROR_SERVICE;
  } else {
    return ERROR_HARDWARE;
  }
}

// ============================================
// MQTT PUBLISHING (Observability - Phase 1-3)
// ============================================
void ErrorTracker::setMqttPublishCallback(MqttErrorPublishCallback callback, const String& esp_id) {
  mqtt_callback_ = callback;
  mqtt_esp_id_ = esp_id;
  mqtt_publishing_enabled_ = (callback != nullptr && esp_id.length() > 0);
  
  if (mqtt_publishing_enabled_) {
    LOG_INFO("ErrorTracker: MQTT error publishing enabled for ESP " + esp_id);
  }
}

void ErrorTracker::clearMqttPublishCallback() {
  mqtt_callback_ = nullptr;
  mqtt_esp_id_ = "";
  mqtt_publishing_enabled_ = false;
  LOG_DEBUG("ErrorTracker: MQTT error publishing disabled");
}

void ErrorTracker::publishErrorToMqtt(uint16_t error_code, ErrorSeverity severity, const char* message) {
  // Guard: Skip if disabled or already publishing (recursion prevention)
  if (!mqtt_publishing_enabled_ || mqtt_publish_in_progress_) {
    return;
  }

  // Guard: Must have callback
  if (mqtt_callback_ == nullptr) {
    return;
  }

  // Set recursion guard
  mqtt_publish_in_progress_ = true;

  // ✅ Phase 0 Fix: Use TopicBuilder for consistent topic generation
  const char* topic = TopicBuilder::buildSystemErrorTopic();

  // ✅ Defensive: Skip publish if topic generation failed (buffer overflow/encoding error)
  if (topic == nullptr || topic[0] == '\0') {
    mqtt_publish_in_progress_ = false;
    return;
  }

  // ✅ Phase 0 Fix: Use Unix timestamp from TimeManager
  time_t unix_ts = timeManager.getUnixTimestamp();
  // Fallback to 0 if NTP not synced (server will use server-time)

  // Build payload (JSON) - Server-compatible format
  String payload;
  payload.reserve(256);
  payload = "{";
  payload += "\"error_code\":";
  payload += String(error_code);
  payload += ",\"severity\":";
  payload += String(static_cast<int>(severity));
  payload += ",\"category\":\"";
  payload += getCategoryString(error_code);
  payload += "\",\"message\":\"";
  // Escape quotes in message for valid JSON
  String escaped_msg = String(message);
  escaped_msg.replace("\"", "\\\"");
  escaped_msg.replace("\n", "\\n");
  payload += escaped_msg;
  // ✅ Phase 0 Fix: Add context field (empty object for now, extensible)
  payload += "\",\"context\":{";
  payload += "\"esp_id\":\"";
  payload += mqtt_esp_id_;
  payload += "\",\"uptime_ms\":";
  payload += String(millis());
  payload += "}";
  payload += ",\"ts\":";
  payload += String((unsigned long)unix_ts);
  payload += "}";

  // Fire-and-forget publish (no error handling - prevent recursion!)
  mqtt_callback_(topic, payload.c_str());

  // Clear recursion guard
  mqtt_publish_in_progress_ = false;
}
