#ifndef UTILS_LOGGER_H
#define UTILS_LOGGER_H

#include <Arduino.h>

// ============================================
// LOG LEVELS
// ============================================
enum LogLevel {
  LOG_DEBUG = 0,
  LOG_INFO = 1,
  LOG_WARNING = 2,
  LOG_ERROR = 3,
  LOG_CRITICAL = 4
};

// ============================================
// LOG ENTRY STRUCTURE (Guide-konform: fixed size)
// ============================================
struct LogEntry {
  unsigned long timestamp;
  LogLevel level;
  char message[128];  // Fixed size (no heap allocation)
};

// ============================================
// LOGGER CLASS
// ============================================
class Logger {
public:
  // Singleton Instance
  static Logger& getInstance();
  
  // Initialization (Guide-konform)
  void begin();
  
  // Configuration
  void setLogLevel(LogLevel level);
  void setSerialEnabled(bool enabled);
  void setMaxLogEntries(size_t max_entries);
  
  // Primary API: const char* (Guide-konform, zero-copy)
  void log(LogLevel level, const char* message);
  void debug(const char* message);
  void info(const char* message);
  void warning(const char* message);
  void error(const char* message);
  void critical(const char* message);
  
  // Convenience Wrapper: String (Kompatibilität)
  inline void log(LogLevel level, const String& message) {
    log(level, message.c_str());
  }
  inline void debug(const String& message) { debug(message.c_str()); }
  inline void info(const String& message) { info(message.c_str()); }
  inline void warning(const String& message) { warning(message.c_str()); }
  inline void error(const String& message) { error(message.c_str()); }
  inline void critical(const String& message) { critical(message.c_str()); }
  
  // Log Management
  void clearLogs();
  String getLogs(LogLevel min_level = LOG_DEBUG, size_t max_entries = 50) const;
  size_t getLogCount() const;
  bool isLogLevelEnabled(LogLevel level) const;
  
  // Utilities
  static const char* getLogLevelString(LogLevel level);
  static LogLevel getLogLevelFromString(const char* level_str);
  
private:
  Logger();  // Private Constructor (Singleton)
  ~Logger() = default;
  Logger(const Logger&) = delete;
  Logger& operator=(const Logger&) = delete;
  
  // Internal state
  LogLevel current_log_level_;
  bool serial_enabled_;
  
  // Fixed Array Circular Buffer (Guide-konform)
  static const size_t MAX_LOG_ENTRIES = 50;
  LogEntry log_buffer_[MAX_LOG_ENTRIES];
  size_t log_buffer_index_;
  size_t log_count_;
  
  // Helper methods
  void writeToSerial(LogLevel level, const char* message);
  void addToBuffer(LogLevel level, const char* message);
};

// ============================================
// GLOBAL LOGGER INSTANCE
// ============================================
extern Logger& logger;

// ============================================
// CONVENIENCE MACROS
// ============================================
#define LOG_DEBUG(msg) logger.debug(msg)
#define LOG_INFO(msg) logger.info(msg)
#define LOG_WARNING(msg) logger.warning(msg)
#define LOG_ERROR(msg) logger.error(msg)
#define LOG_CRITICAL(msg) logger.critical(msg)

#endif
