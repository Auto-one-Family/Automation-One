#include "storage_manager.h"
#include "../../utils/logger.h"

// ============================================
// STATIC MEMBER INITIALIZATION
// ============================================
char StorageManager::string_buffer_[256];

// ============================================
// GLOBAL STORAGE MANAGER INSTANCE
// ============================================
StorageManager& storageManager = StorageManager::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
StorageManager& StorageManager::getInstance() {
  static StorageManager instance;
  return instance;
}

StorageManager::StorageManager()
  : namespace_open_(false) {
  current_namespace_[0] = '\0';
}

// ============================================
// INITIALIZATION (Guide-konform)
// ============================================
bool StorageManager::begin() {
  namespace_open_ = false;
  current_namespace_[0] = '\0';
  LOG_INFO("StorageManager: Initialized");
  return true;
}

// ============================================
// NAMESPACE MANAGEMENT
// ============================================
bool StorageManager::beginNamespace(const char* namespace_name, bool read_only) {
  if (namespace_open_) {
    LOG_WARNING("StorageManager: Namespace already open, closing first");
    endNamespace();
  }
  
  if (!preferences_.begin(namespace_name, read_only)) {
    LOG_ERROR("StorageManager: Failed to open namespace: " + String(namespace_name));
    return false;
  }
  
  namespace_open_ = true;
  strncpy(current_namespace_, namespace_name, sizeof(current_namespace_) - 1);
  current_namespace_[sizeof(current_namespace_) - 1] = '\0';
  
  LOG_DEBUG("StorageManager: Opened namespace: " + String(namespace_name));
  return true;
}

void StorageManager::endNamespace() {
  if (namespace_open_) {
    preferences_.end();
    namespace_open_ = false;
    LOG_DEBUG("StorageManager: Closed namespace: " + String(current_namespace_));
    current_namespace_[0] = '\0';
  }
}

// ============================================
// PRIMARY API: const char* (Guide-konform)
// ============================================

// String operations
bool StorageManager::putString(const char* key, const char* value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for putString");
    return false;
  }
  
  size_t bytes = preferences_.putString(key, value);
  if (bytes == 0 && strlen(value) > 0) {
    LOG_ERROR("StorageManager: Failed to write string key: " + String(key));
    return false;
  }
  
  LOG_DEBUG("StorageManager: Write " + String(key) + " = " + String(value));
  return true;
}

const char* StorageManager::getString(const char* key, const char* default_value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for getString");
    return default_value;
  }
  
  String value = preferences_.getString(key, default_value ? default_value : "");
  strncpy(string_buffer_, value.c_str(), sizeof(string_buffer_) - 1);
  string_buffer_[sizeof(string_buffer_) - 1] = '\0';
  
  LOG_DEBUG("StorageManager: Read " + String(key) + " = " + value);
  return string_buffer_;
}

// Integer operations
bool StorageManager::putInt(const char* key, int value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for putInt");
    return false;
  }
  
  size_t bytes = preferences_.putInt(key, value);
  if (bytes == 0) {
    LOG_ERROR("StorageManager: Failed to write int key: " + String(key));
    return false;
  }
  
  LOG_DEBUG("StorageManager: Write " + String(key) + " = " + String(value));
  return true;
}

int StorageManager::getInt(const char* key, int default_value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for getInt");
    return default_value;
  }
  
  int value = preferences_.getInt(key, default_value);
  LOG_DEBUG("StorageManager: Read " + String(key) + " = " + String(value));
  return value;
}

// UInt8 operations
bool StorageManager::putUInt8(const char* key, uint8_t value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for putUInt8");
    return false;
  }
  
  size_t bytes = preferences_.putUChar(key, value);
  if (bytes == 0) {
    LOG_ERROR("StorageManager: Failed to write uint8 key: " + String(key));
    return false;
  }
  
  return true;
}

uint8_t StorageManager::getUInt8(const char* key, uint8_t default_value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for getUInt8");
    return default_value;
  }
  
  return preferences_.getUChar(key, default_value);
}

// UInt16 operations
bool StorageManager::putUInt16(const char* key, uint16_t value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for putUInt16");
    return false;
  }
  
  size_t bytes = preferences_.putUShort(key, value);
  if (bytes == 0) {
    LOG_ERROR("StorageManager: Failed to write uint16 key: " + String(key));
    return false;
  }
  
  return true;
}

uint16_t StorageManager::getUInt16(const char* key, uint16_t default_value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for getUInt16");
    return default_value;
  }
  
  return preferences_.getUShort(key, default_value);
}

// Boolean operations
bool StorageManager::putBool(const char* key, bool value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for putBool");
    return false;
  }
  
  size_t bytes = preferences_.putBool(key, value);
  if (bytes == 0) {
    LOG_ERROR("StorageManager: Failed to write bool key: " + String(key));
    return false;
  }
  
  return true;
}

bool StorageManager::getBool(const char* key, bool default_value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for getBool");
    return default_value;
  }
  
  return preferences_.getBool(key, default_value);
}

// Unsigned long operations
bool StorageManager::putULong(const char* key, unsigned long value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for putULong");
    return false;
  }
  
  size_t bytes = preferences_.putULong(key, value);
  if (bytes == 0) {
    LOG_ERROR("StorageManager: Failed to write ulong key: " + String(key));
    return false;
  }
  
  return true;
}

unsigned long StorageManager::getULong(const char* key, unsigned long default_value) {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for getULong");
    return default_value;
  }
  
  return preferences_.getULong(key, default_value);
}

// ============================================
// NAMESPACE UTILITIES
// ============================================
bool StorageManager::clearNamespace() {
  if (!namespace_open_) {
    LOG_ERROR("StorageManager: No namespace open for clear");
    return false;
  }
  
  bool success = preferences_.clear();
  if (success) {
    LOG_INFO("StorageManager: Cleared namespace: " + String(current_namespace_));
  } else {
    LOG_ERROR("StorageManager: Failed to clear namespace: " + String(current_namespace_));
  }
  
  return success;
}

bool StorageManager::keyExists(const char* key) {
  if (!namespace_open_) {
    return false;
  }
  
  return preferences_.isKey(key);
}

size_t StorageManager::getFreeEntries() {
  if (!namespace_open_) {
    return 0;
  }
  
  return preferences_.freeEntries();
}

