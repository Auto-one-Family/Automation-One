#ifndef SERVICES_CONFIG_STORAGE_MANAGER_H
#define SERVICES_CONFIG_STORAGE_MANAGER_H

#include <Arduino.h>
#include <Preferences.h>

// StorageManager für NVS-Operations
class StorageManager {
public:
  // Singleton Instance
  static StorageManager& getInstance();
  
  // Namespace Management
  bool beginNamespace(const String& namespace_name, bool read_only = false);
  void endNamespace();
  
  // Get/Set Operations (typ-sicher)
  bool getString(const String& key, String& value, const String& default_value = "");
  bool setString(const String& key, const String& value);
  
  bool getInt(const String& key, int& value, int default_value = 0);
  bool setInt(const String& key, int value);
  
  bool getUInt8(const String& key, uint8_t& value, uint8_t default_value = 0);
  bool setUInt8(const String& key, uint8_t value);
  
  bool getUInt16(const String& key, uint16_t& value, uint16_t default_value = 0);
  bool setUInt16(const String& key, uint16_t value);
  
  bool getBool(const String& key, bool& value, bool default_value = false);
  bool setBool(const String& key, bool value);
  
  // Namespace Utilities
  bool clearNamespace(const String& namespace_name);
  bool namespaceExists(const String& namespace_name);
  
private:
  StorageManager();  // Private Constructor (Singleton)
  
  Preferences _preferences;
  String _current_namespace = "";
  bool _namespace_open = false;
};

// Global StorageManager Instance
extern StorageManager& storageManager;

#endif

