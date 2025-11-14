#include <unity.h>
#include "services/config/storage_manager.h"
#include "utils/logger.h"

// ============================================
// TEST: StorageManager Initialization
// ============================================
void test_storage_manager_initialization() {
  TEST_ASSERT_TRUE(storageManager.begin());
}

// ============================================
// TEST: String Operations (const char* API)
// ============================================
void test_storage_manager_string_operations() {
  storageManager.beginNamespace("test_ns", false);
  
  // Write
  TEST_ASSERT_TRUE(storageManager.putString("test_key", "test_value"));
  
  // Read
  const char* value = storageManager.getString("test_key", "default");
  TEST_ASSERT_EQUAL_STRING("test_value", value);
  
  // Read non-existent key (should return default)
  const char* missing = storageManager.getString("missing_key", "default");
  TEST_ASSERT_EQUAL_STRING("default", missing);
  
  storageManager.endNamespace();
}

// ============================================
// TEST: String Wrapper API
// ============================================
void test_storage_manager_string_wrapper() {
  storageManager.beginNamespace("test_wrapper", false);
  
  String test_value = "wrapper_test";
  storageManager.putString("key", test_value);
  
  String result = storageManager.getStringObj("key", "default");
  TEST_ASSERT_EQUAL_STRING("wrapper_test", result.c_str());
  
  storageManager.endNamespace();
}

// ============================================
// TEST: Integer Operations
// ============================================
void test_storage_manager_int_operations() {
  storageManager.beginNamespace("test_int", false);
  
  // Write int
  TEST_ASSERT_TRUE(storageManager.putInt("int_key", 12345));
  
  // Read int
  int value = storageManager.getInt("int_key", 0);
  TEST_ASSERT_EQUAL(12345, value);
  
  // Write uint8
  TEST_ASSERT_TRUE(storageManager.putUInt8("uint8_key", 200));
  uint8_t u8_value = storageManager.getUInt8("uint8_key", 0);
  TEST_ASSERT_EQUAL(200, u8_value);
  
  storageManager.endNamespace();
}

// ============================================
// TEST: Namespace Isolation
// ============================================
void test_storage_manager_namespace_isolation() {
  // Write to namespace1
  storageManager.beginNamespace("ns1", false);
  storageManager.putString("key", "value1");
  storageManager.endNamespace();
  
  // Write to namespace2
  storageManager.beginNamespace("ns2", false);
  storageManager.putString("key", "value2");
  storageManager.endNamespace();
  
  // Read from namespace1 (should be "value1")
  storageManager.beginNamespace("ns1", true);
  String val1 = storageManager.getStringObj("key", "");
  storageManager.endNamespace();
  TEST_ASSERT_EQUAL_STRING("value1", val1.c_str());
  
  // Read from namespace2 (should be "value2")
  storageManager.beginNamespace("ns2", true);
  String val2 = storageManager.getStringObj("key", "");
  storageManager.endNamespace();
  TEST_ASSERT_EQUAL_STRING("value2", val2.c_str());
}

// ============================================
// TEST: Clear Namespace
// ============================================
void test_storage_manager_clear() {
  storageManager.beginNamespace("test_clear", false);
  storageManager.putString("key1", "value1");
  storageManager.putString("key2", "value2");
  
  TEST_ASSERT_TRUE(storageManager.clearNamespace());
  
  // Keys should no longer exist
  TEST_ASSERT_FALSE(storageManager.keyExists("key1"));
  TEST_ASSERT_FALSE(storageManager.keyExists("key2"));
  
  storageManager.endNamespace();
}

// ============================================
// UNITY SETUP
// ============================================
void setup() {
  delay(2000);
  
  // Initialize Logger for StorageManager logging
  logger.begin();
  logger.setLogLevel(LOG_INFO);
  
  UNITY_BEGIN();
  
  RUN_TEST(test_storage_manager_initialization);
  RUN_TEST(test_storage_manager_string_operations);
  RUN_TEST(test_storage_manager_string_wrapper);
  RUN_TEST(test_storage_manager_int_operations);
  RUN_TEST(test_storage_manager_namespace_isolation);
  RUN_TEST(test_storage_manager_clear);
  
  UNITY_END();
}

void loop() {}


