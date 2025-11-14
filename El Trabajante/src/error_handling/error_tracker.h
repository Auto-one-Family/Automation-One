#ifndef ERROR_HANDLING_ERROR_TRACKER_H
#define ERROR_HANDLING_ERROR_TRACKER_H

#include <Arduino.h>

// ============================================
// ERROR CATEGORIES (Guide-konform: 1000-4999)
// ============================================
enum ErrorCategory {
  ERROR_HARDWARE = 1000,       // GPIO, I2C, PWM
  ERROR_SERVICE = 2000,        // Sensor, Actuator, Config
  ERROR_COMMUNICATION = 3000,  // MQTT, HTTP, WiFi
  ERROR_APPLICATION = 4000     // State, Memory, System
};

// ============================================
// ERROR SEVERITY LEVELS
// ============================================
enum ErrorSeverity {
  ERROR_SEVERITY_WARNING = 1,  // Recoverable warning
  ERROR_SEVERITY_ERROR = 2,    // Error but system can continue
  ERROR_SEVERITY_CRITICAL = 3  // Critical error, system unstable
};

// ============================================
// ERROR ENTRY STRUCTURE (Guide-konform: fixed size)
// ============================================
struct ErrorEntry {
  unsigned long timestamp;
  uint16_t error_code;
  ErrorSeverity severity;
  char message[128];
  uint8_t occurrence_count;  // Duplicate tracking
  
  ErrorEntry() 
    : timestamp(0), error_code(0),
      severity(ERROR_SEVERITY_ERROR),
      occurrence_count(0) {
    message[0] = '\0';
  }
};

// ============================================
// ERROR TRACKER CLASS
// ============================================
class ErrorTracker {
public:
  // Singleton Instance
  static ErrorTracker& getInstance();
  
  // Initialization (Guide-konform)
  void begin();
  
  // Primary API: const char* (Guide-konform)
  void trackError(uint16_t error_code, ErrorSeverity severity, const char* message);
  void trackError(uint16_t error_code, const char* message);  // Default severity: ERROR
  
  // Convenience Methods
  void logHardwareError(uint16_t code, const char* message);
  void logServiceError(uint16_t code, const char* message);
  void logCommunicationError(uint16_t code, const char* message);
  void logApplicationError(uint16_t code, const char* message);
  
  // Error Retrieval
  String getErrorHistory(uint8_t max_entries = 20) const;
  String getErrorsByCategory(ErrorCategory category, uint8_t max_entries = 10) const;
  size_t getErrorCount() const;
  size_t getErrorCountByCategory(ErrorCategory category) const;
  
  // Error Status
  bool hasActiveErrors() const;
  bool hasCriticalErrors() const;
  void clearErrors();
  
  // Utilities
  static const char* getCategoryString(uint16_t error_code);
  static ErrorCategory getCategory(uint16_t error_code);
  
private:
  ErrorTracker();  // Private Constructor (Singleton)
  ~ErrorTracker() = default;
  ErrorTracker(const ErrorTracker&) = delete;
  ErrorTracker& operator=(const ErrorTracker&) = delete;
  
  // Fixed Array Circular Buffer (Guide-konform)
  static const size_t MAX_ERROR_ENTRIES = 50;
  ErrorEntry error_buffer_[MAX_ERROR_ENTRIES];
  size_t error_buffer_index_;
  size_t error_count_;
  
  // Helper methods
  void addToBuffer(uint16_t error_code, ErrorSeverity severity, const char* message);
  void logErrorToLogger(uint16_t error_code, ErrorSeverity severity, const char* message);
};

// ============================================
// GLOBAL ERROR TRACKER INSTANCE
// ============================================
extern ErrorTracker& errorTracker;

#endif

