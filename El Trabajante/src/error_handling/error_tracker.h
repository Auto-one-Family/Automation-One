#ifndef ERROR_HANDLING_ERROR_TRACKER_H
#define ERROR_HANDLING_ERROR_TRACKER_H

#include <Arduino.h>
#include <vector>

// Error Categories (aus ZZZ.md Phase 8)
enum ErrorCategory {
  ERROR_HARDWARE = 1000,       // GPIO, I2C, PWM
  ERROR_SERVICE = 2000,        // Sensor, Actuator, Config
  ERROR_COMMUNICATION = 3000,  // MQTT, HTTP, WiFi
  ERROR_APPLICATION = 4000     // State, Memory, System
};

// Error Severity
enum ErrorSeverity {
  ERROR_SEVERITY_INFO = 0,
  ERROR_SEVERITY_WARNING = 1,
  ERROR_SEVERITY_ERROR = 2,
  ERROR_SEVERITY_CRITICAL = 3
};

// System Error Entry
struct SystemError {
  int error_code;
  ErrorCategory category;
  ErrorSeverity severity;
  String message;
  String context;
  unsigned long timestamp;
};

// ErrorTracker Class
class ErrorTracker {
public:
  // Singleton Instance
  static ErrorTracker& getInstance();
  
  // Error Logging
  void logError(int error_code, 
               ErrorCategory category,
               ErrorSeverity severity,
               const String& message,
               const String& context = "");
  
  // Convenience Methods
  void logHardwareError(int error_code, const String& message, const String& context = "");
  void logServiceError(int error_code, const String& message, const String& context = "");
  void logCommunicationError(int error_code, const String& message, const String& context = "");
  void logApplicationError(int error_code, const String& message, const String& context = "");
  
  // Error History
  String getErrorHistory(ErrorSeverity min_severity = ERROR_SEVERITY_INFO) const;
  size_t getErrorCount() const;
  void clearErrors();
  
  // Last Error
  bool hasErrors() const;
  SystemError getLastError() const;
  
  // Utilities
  static String getErrorCategoryString(ErrorCategory category);
  static String getErrorSeverityString(ErrorSeverity severity);
  
private:
  ErrorTracker();  // Private Constructor (Singleton)
  
  std::vector<SystemError> _error_history;
  size_t _max_entries = 50;
  
  void _addToHistory(const SystemError& error);
};

// Global ErrorTracker Instance
extern ErrorTracker& errorTracker;

#endif

