#include <unity.h>
#include "utils/logger.h"

// ============================================
// TEST: Logger Initialization
// ============================================
void test_logger_initialization() {
  logger.begin();
  TEST_ASSERT_EQUAL(0, logger.getLogCount());
}

// ============================================
// TEST: Log Level Filtering
// ============================================
void test_logger_log_levels() {
  logger.clearLogs();
  logger.setLogLevel(LOG_WARNING);
  
  // These should NOT be logged (below threshold)
  logger.debug("Debug message");
  logger.info("Info message");
  
  // These SHOULD be logged (at or above threshold)
  logger.warning("Warning message");
  logger.error("Error message");
  logger.critical("Critical message");
  
  // Should have 3 entries
  TEST_ASSERT_EQUAL(3, logger.getLogCount());
}

// ============================================
// TEST: Circular Buffer Overflow
// ============================================
void test_logger_circular_buffer() {
  logger.clearLogs();
  logger.setLogLevel(LOG_DEBUG);
  
  // Add more than MAX_LOG_ENTRIES (50)
  for (int i = 0; i < 60; i++) {
    logger.info("Message " + String(i));
  }
  
  // Should have exactly 50 (MAX_LOG_ENTRIES)
  TEST_ASSERT_EQUAL(50, logger.getLogCount());
}

// ============================================
// TEST: Get Logs Retrieval
// ============================================
void test_logger_get_logs() {
  logger.clearLogs();
  logger.setLogLevel(LOG_DEBUG);
  
  logger.info("Test message 1");
  logger.error("Test message 2");
  
  String logs = logger.getLogs();
  TEST_ASSERT_TRUE(logs.indexOf("Test message 1") > 0);
  TEST_ASSERT_TRUE(logs.indexOf("Test message 2") > 0);
}

// ============================================
// TEST: const char* Primary API
// ============================================
void test_logger_const_char_api() {
  logger.clearLogs();
  logger.setLogLevel(LOG_INFO);
  
  logger.log(LOG_INFO, "const char test");
  TEST_ASSERT_EQUAL(1, logger.getLogCount());
  
  String logs = logger.getLogs();
  TEST_ASSERT_TRUE(logs.indexOf("const char test") > 0);
}

// ============================================
// TEST: String Wrapper API
// ============================================
void test_logger_string_wrapper() {
  logger.clearLogs();
  logger.setLogLevel(LOG_INFO);
  
  String msg = "String wrapper test";
  logger.info(msg);
  TEST_ASSERT_EQUAL(1, logger.getLogCount());
  
  String logs = logger.getLogs();
  TEST_ASSERT_TRUE(logs.indexOf("String wrapper test") > 0);
}

// ============================================
// UNITY SETUP
// ============================================
void setup() {
  delay(2000);  // Allow time for Serial
  UNITY_BEGIN();
  
  RUN_TEST(test_logger_initialization);
  RUN_TEST(test_logger_log_levels);
  RUN_TEST(test_logger_circular_buffer);
  RUN_TEST(test_logger_get_logs);
  RUN_TEST(test_logger_const_char_api);
  RUN_TEST(test_logger_string_wrapper);
  
  UNITY_END();
}

void loop() {}


