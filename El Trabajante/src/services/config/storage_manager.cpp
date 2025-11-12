#include "storage_manager.h"
#include "../../utils/logger.h"

// Global StorageManager Instance
StorageManager& storageManager = StorageManager::getInstance();

// Singleton
StorageManager& StorageManager::getInstance() {
  static StorageManager instance;
  return instance;
}

StorageManager::StorageManager() {}

bool StorageManager::beginNamespace(const String& namespace_name, bool read_only) {
  if (_namespace_open) {
    LOG_WARNING("StorageManager: Namespace already open, closing first");
    endNamespace();
  }
  
  bool success = _preferences.begin(namespace_name.c_str(), read_only);
  if (success) {
    _current_namespace = namespace_name;
    _namespace_open = true;
    LOG_DEBUG("StorageManager: Opened namespace '" + namespace_name + "'");
  } else {
    LOG_ERROR("StorageManager: Failed to open namespace '" + namespace_name + "'");
  }
  
  return success;
}

void StorageManager::endNamespace() {
  if (_namespace_open) {
    _preferences.end();
    LOG_DEBUG("StorageManager: Closed namespace '" + _current_namespace + "'");
    _current_namespace = "";
    _namespace_open = false;
  }
}

bool StorageManager::getString(const String& key, String& value, const String& default_value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for getString()");
    value = default_value;
    return false;
  }
  
  value = _preferences.getString(key.c_str(), default_value.c_str());
  return true;
}

bool StorageManager::setString(const String& key, const String& value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for setString()");
    return false;
  }
  
  size_t written = _preferences.putString(key.c_str(), value.c_str());
  if (written == 0) {
    LOG_ERROR("StorageManager: Failed to write String key '" + key + "' in namespace '" + _current_namespace + "'");
    return false;
  }
  
  return true;
}

bool StorageManager::getInt(const String& key, int& value, int default_value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for getInt()");
    value = default_value;
    return false;
  }
  
  value = _preferences.getInt(key.c_str(), default_value);
  return true;
}

bool StorageManager::setInt(const String& key, int value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for setInt()");
    return false;
  }
  
  size_t written = _preferences.putInt(key.c_str(), value);
  if (written == 0) {
    LOG_ERROR("StorageManager: Failed to write Int key '" + key + "' in namespace '" + _current_namespace + "'");
    return false;
  }
  
  return true;
}

bool StorageManager::getUInt8(const String& key, uint8_t& value, uint8_t default_value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for getUInt8()");
    value = default_value;
    return false;
  }
  
  value = _preferences.getUChar(key.c_str(), default_value);
  return true;
}

bool StorageManager::setUInt8(const String& key, uint8_t value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for setUInt8()");
    return false;
  }
  
  size_t written = _preferences.putUChar(key.c_str(), value);
  if (written == 0) {
    LOG_ERROR("StorageManager: Failed to write UInt8 key '" + key + "' in namespace '" + _current_namespace + "'");
    return false;
  }
  
  return true;
}

bool StorageManager::getUInt16(const String& key, uint16_t& value, uint16_t default_value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for getUInt16()");
    value = default_value;
    return false;
  }
  
  value = _preferences.getUShort(key.c_str(), default_value);
  return true;
}

bool StorageManager::setUInt16(const String& key, uint16_t value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for setUInt16()");
    return false;
  }
  
  size_t written = _preferences.putUShort(key.c_str(), value);
  if (written == 0) {
    LOG_ERROR("StorageManager: Failed to write UInt16 key '" + key + "' in namespace '" + _current_namespace + "'");
    return false;
  }
  
  return true;
}

bool StorageManager::getBool(const String& key, bool& value, bool default_value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for getBool()");
    value = default_value;
    return false;
  }
  
  value = _preferences.getBool(key.c_str(), default_value);
  return true;
}

bool StorageManager::setBool(const String& key, bool value) {
  if (!_namespace_open) {
    LOG_ERROR("StorageManager: No namespace open for setBool()");
    return false;
  }
  
  size_t written = _preferences.putBool(key.c_str(), value);
  if (written == 0) {
    LOG_ERROR("StorageManager: Failed to write Bool key '" + key + "' in namespace '" + _current_namespace + "'");
    return false;
  }
  
  return true;
}

bool StorageManager::clearNamespace(const String& namespace_name) {
  bool was_open = _namespace_open;
  if (was_open) {
    endNamespace();
  }
  
  bool success = _preferences.begin(namespace_name.c_str(), false);
  if (success) {
    _preferences.clear();
    _preferences.end();
    LOG_INFO("StorageManager: Cleared namespace '" + namespace_name + "'");
  } else {
    LOG_ERROR("StorageManager: Failed to clear namespace '" + namespace_name + "'");
  }
  
  if (was_open) {
    beginNamespace(_current_namespace, false);
  }
  
  return success;
}

bool StorageManager::namespaceExists(const String& namespace_name) {
  bool success = _preferences.begin(namespace_name.c_str(), true);
  if (success) {
    _preferences.end();
  }
  return success;
}

