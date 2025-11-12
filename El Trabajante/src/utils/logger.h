#ifndef UTILS_LOGGER_H
#define UTILS_LOGGER_H

#include <Arduino.h>
#include <vector>

// Log Levels
enum LogLevel {
  LOG_DEBUG = 0,
  LOG_INFO = 1,
  LOG_WARNING = 2,
  LOG_ERROR = 3,
  LOG_CRITICAL = 4
};

// Log Entry
struct LogEntry {
  LogLevel level;
  String message;
  unsigned long timestamp;
};

// Logger Class
class Logger {
public:
  // Singleton Instance
  static Logger& getInstance();
  
  // Configuration
  void setLogLevel(LogLevel level);
  void setSerialEnabled(bool enabled);
  void setMaxLogEntries(size_t max_entries);
  
  // Logging Methods
  void log(LogLevel level, const String& message);
  void debug(const String& message);
  void info(const String& message);
  void warning(const String& message);
  void error(const String& message);
  void critical(const String& message);
  
  // Log Management
  void clearLogs();
  String getLogs(LogLevel min_level = LOG_DEBUG) const;
  size_t getLogCount() const;
  
  // Utilities
  static String getLogLevelString(LogLevel level);
  
private:
  Logger();  // Private Constructor (Singleton)
  
  LogLevel _log_level = LOG_INFO;
  bool _serial_enabled = true;
  size_t _max_entries = 100;
  std::vector<LogEntry> _log_buffer;
  
  void _addToBuffer(const LogEntry& entry);
};

// Global Logger Instance
extern Logger& logger;

// Convenience Macros
#define LOG_DEBUG(msg) logger.debug(msg)
#define LOG_INFO(msg) logger.info(msg)
#define LOG_WARNING(msg) logger.warning(msg)
#define LOG_ERROR(msg) logger.error(msg)
#define LOG_CRITICAL(msg) logger.critical(msg)

#endif
