#include "logger.h"

// Global Logger Instance
Logger& logger = Logger::getInstance();

// Singleton
Logger& Logger::getInstance() {
  static Logger instance;
  return instance;
}

Logger::Logger() {
  _log_buffer.reserve(_max_entries);
}

void Logger::setLogLevel(LogLevel level) {
  _log_level = level;
}

void Logger::setSerialEnabled(bool enabled) {
  _serial_enabled = enabled;
}

void Logger::setMaxLogEntries(size_t max_entries) {
  _max_entries = max_entries;
  // Circular Buffer: Älteste Einträge löschen wenn voll
  while (_log_buffer.size() > _max_entries) {
    _log_buffer.erase(_log_buffer.begin());
  }
}

void Logger::log(LogLevel level, const String& message) {
  // Check Log Level
  if (level < _log_level) {
    return;
  }
  
  // Create Entry
  LogEntry entry;
  entry.level = level;
  entry.message = message;
  entry.timestamp = millis();
  
  // Serial Output
  if (_serial_enabled) {
    String level_str = getLogLevelString(level);
    Serial.print("[");
    Serial.print(entry.timestamp);
    Serial.print("] [");
    Serial.print(level_str);
    Serial.print("] ");
    Serial.println(message);
  }
  
  // Add to Buffer
  _addToBuffer(entry);
}

void Logger::debug(const String& message) {
  log(LOG_DEBUG, message);
}

void Logger::info(const String& message) {
  log(LOG_INFO, message);
}

void Logger::warning(const String& message) {
  log(LOG_WARNING, message);
}

void Logger::error(const String& message) {
  log(LOG_ERROR, message);
}

void Logger::critical(const String& message) {
  log(LOG_CRITICAL, message);
}

void Logger::clearLogs() {
  _log_buffer.clear();
}

String Logger::getLogs(LogLevel min_level) const {
  String result = "";
  result.reserve(500);  // Reserve Speicher
  
  for (const auto& entry : _log_buffer) {
    if (entry.level >= min_level) {
      result += "[" + String(entry.timestamp) + "] ";
      result += "[" + getLogLevelString(entry.level) + "] ";
      result += entry.message + "\n";
    }
  }
  
  return result;
}

size_t Logger::getLogCount() const {
  return _log_buffer.size();
}

String Logger::getLogLevelString(LogLevel level) {
  switch (level) {
    case LOG_DEBUG: return "DEBUG";
    case LOG_INFO: return "INFO";
    case LOG_WARNING: return "WARN";
    case LOG_ERROR: return "ERROR";
    case LOG_CRITICAL: return "CRIT";
    default: return "UNKNOWN";
  }
}

void Logger::_addToBuffer(const LogEntry& entry) {
  // Circular Buffer: Älteste Einträge löschen wenn voll
  if (_log_buffer.size() >= _max_entries) {
    _log_buffer.erase(_log_buffer.begin());
  }
  
  _log_buffer.push_back(entry);
}

