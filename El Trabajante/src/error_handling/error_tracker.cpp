#include "error_tracker.h"
#include "../utils/logger.h"

// Global ErrorTracker Instance
ErrorTracker& errorTracker = ErrorTracker::getInstance();

// Singleton
ErrorTracker& ErrorTracker::getInstance() {
  static ErrorTracker instance;
  return instance;
}

ErrorTracker::ErrorTracker() {
  _error_history.reserve(_max_entries);
}

void ErrorTracker::logError(int error_code, 
                           ErrorCategory category,
                           ErrorSeverity severity,
                           const String& message,
                           const String& context) {
  // Create Error Entry
  SystemError error;
  error.error_code = error_code;
  error.category = category;
  error.severity = severity;
  error.message = message;
  error.context = context;
  error.timestamp = millis();
  
  // Add to History
  _addToHistory(error);
  
  // Log to Logger
  String log_message = "[" + String(error_code) + "] ";
  log_message += getErrorCategoryString(category) + " - ";
  log_message += message;
  if (context.length() > 0) {
    log_message += " (Context: " + context + ")";
  }
  
  switch (severity) {
    case ERROR_SEVERITY_INFO:
      LOG_INFO(log_message);
      break;
    case ERROR_SEVERITY_WARNING:
      LOG_WARNING(log_message);
      break;
    case ERROR_SEVERITY_ERROR:
      LOG_ERROR(log_message);
      break;
    case ERROR_SEVERITY_CRITICAL:
      LOG_CRITICAL(log_message);
      break;
  }
}

void ErrorTracker::logHardwareError(int error_code, const String& message, const String& context) {
  logError(ERROR_HARDWARE + error_code, ERROR_HARDWARE, ERROR_SEVERITY_ERROR, message, context);
}

void ErrorTracker::logServiceError(int error_code, const String& message, const String& context) {
  logError(ERROR_SERVICE + error_code, ERROR_SERVICE, ERROR_SEVERITY_ERROR, message, context);
}

void ErrorTracker::logCommunicationError(int error_code, const String& message, const String& context) {
  logError(ERROR_COMMUNICATION + error_code, ERROR_COMMUNICATION, ERROR_SEVERITY_ERROR, message, context);
}

void ErrorTracker::logApplicationError(int error_code, const String& message, const String& context) {
  logError(ERROR_APPLICATION + error_code, ERROR_APPLICATION, ERROR_SEVERITY_CRITICAL, message, context);
}

String ErrorTracker::getErrorHistory(ErrorSeverity min_severity) const {
  String result = "";
  result.reserve(500);
  
  for (const auto& error : _error_history) {
    if (error.severity >= min_severity) {
      result += "[" + String(error.timestamp) + "] ";
      result += "[" + String(error.error_code) + "] ";
      result += getErrorSeverityString(error.severity) + " - ";
      result += error.message;
      if (error.context.length() > 0) {
        result += " (Context: " + error.context + ")";
      }
      result += "\n";
    }
  }
  
  return result;
}

size_t ErrorTracker::getErrorCount() const {
  return _error_history.size();
}

void ErrorTracker::clearErrors() {
  _error_history.clear();
}

bool ErrorTracker::hasErrors() const {
  return _error_history.size() > 0;
}

SystemError ErrorTracker::getLastError() const {
  if (_error_history.size() > 0) {
    return _error_history.back();
  }
  return SystemError();
}

String ErrorTracker::getErrorCategoryString(ErrorCategory category) {
  switch (category) {
    case ERROR_HARDWARE: return "HARDWARE";
    case ERROR_SERVICE: return "SERVICE";
    case ERROR_COMMUNICATION: return "COMM";
    case ERROR_APPLICATION: return "APP";
    default: return "UNKNOWN";
  }
}

String ErrorTracker::getErrorSeverityString(ErrorSeverity severity) {
  switch (severity) {
    case ERROR_SEVERITY_INFO: return "INFO";
    case ERROR_SEVERITY_WARNING: return "WARN";
    case ERROR_SEVERITY_ERROR: return "ERROR";
    case ERROR_SEVERITY_CRITICAL: return "CRIT";
    default: return "UNKNOWN";
  }
}

void ErrorTracker::_addToHistory(const SystemError& error) {
  // Circular Buffer: Älteste Einträge löschen wenn voll
  if (_error_history.size() >= _max_entries) {
    _error_history.erase(_error_history.begin());
  }
  
  _error_history.push_back(error);
}

