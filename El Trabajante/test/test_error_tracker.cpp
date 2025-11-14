#include <unity.h>
#include "error_handling/error_tracker.h"
#include "utils/logger.h"

// ============================================
// TEST: ErrorTracker Initialization
// ============================================
void test_error_tracker_initialization() {
  errorTracker.begin();
  TEST_ASSERT_EQUAL(0, errorTracker.getErrorCount());
  TEST_ASSERT_FALSE(errorTracker.hasActiveErrors());
}

// ============================================
// TEST: Add Error
// ============================================
void test_error_tracker_add_error() {
  errorTracker.clearErrors();
  
  errorTracker.trackError(1001, ERROR_SEVERITY_ERROR, "GPIO conflict");
  
  TEST_ASSERT_EQUAL(1, errorTracker.getErrorCount());
  TEST_ASSERT_TRUE(errorTracker.hasActiveErrors());
}

// ============================================
// TEST: Error Categories
// ============================================
void test_error_tracker_categories() {
  errorTracker.clearErrors();
  
  errorTracker.logHardwareError(1, "Hardware error");
  errorTracker.logServiceError(1, "Service error");
  errorTracker.logCommunicationError(1, "Communication error");
  errorTracker.logApplicationError(1, "Application error");
  
  TEST_ASSERT_EQUAL(4, errorTracker.getErrorCount());
  TEST_ASSERT_EQUAL(1, errorTracker.getErrorCountByCategory(ERROR_HARDWARE));
  TEST_ASSERT_EQUAL(1, errorTracker.getErrorCountByCategory(ERROR_SERVICE));
  TEST_ASSERT_EQUAL(1, errorTracker.getErrorCountByCategory(ERROR_COMMUNICATION));
  TEST_ASSERT_EQUAL(1, errorTracker.getErrorCountByCategory(ERROR_APPLICATION));
}

// ============================================
// TEST: Circular Buffer Overflow
// ============================================
void test_error_tracker_circular_buffer() {
  errorTracker.clearErrors();
  
  // Add more than MAX_ERROR_ENTRIES (50)
  for (int i = 0; i < 60; i++) {
    errorTracker.trackError(1000 + i, "Error " + String(i));
  }
  
  // Should have exactly 50 entries (MAX_ERROR_ENTRIES)
  TEST_ASSERT_EQUAL(50, errorTracker.getErrorCount());
}

// ============================================
// TEST: Occurrence Counting (Duplicate Errors)
// ============================================
void test_error_tracker_occurrence_count() {
  errorTracker.clearErrors();
  
  // Add same error multiple times
  errorTracker.trackError(1001, "GPIO conflict");
  errorTracker.trackError(1001, "GPIO conflict");
  errorTracker.trackError(1001, "GPIO conflict");
  
  // Should still be 1 entry (occurrence count incremented)
  TEST_ASSERT_EQUAL(1, errorTracker.getErrorCount());
  
  // History should show occurrence count
  String history = errorTracker.getErrorHistory(5);
  TEST_ASSERT_TRUE(history.indexOf("(x3)") > 0);
}

// ============================================
// TEST: Error History Retrieval
// ============================================
void test_error_tracker_get_history() {
  errorTracker.clearErrors();
  
  errorTracker.trackError(1001, ERROR_SEVERITY_ERROR, "Error 1");
  errorTracker.trackError(2001, ERROR_SEVERITY_WARNING, "Error 2");
  errorTracker.trackError(3001, ERROR_SEVERITY_CRITICAL, "Error 3");
  
  String history = errorTracker.getErrorHistory(10);
  TEST_ASSERT_TRUE(history.indexOf("Error 1") > 0);
  TEST_ASSERT_TRUE(history.indexOf("Error 2") > 0);
  TEST_ASSERT_TRUE(history.indexOf("Error 3") > 0);
}

// ============================================
// TEST: Critical Errors Detection
// ============================================
void test_error_tracker_critical_errors() {
  errorTracker.clearErrors();
  
  errorTracker.trackError(1001, ERROR_SEVERITY_ERROR, "Normal error");
  TEST_ASSERT_FALSE(errorTracker.hasCriticalErrors());
  
  errorTracker.trackError(1002, ERROR_SEVERITY_CRITICAL, "Critical error");
  TEST_ASSERT_TRUE(errorTracker.hasCriticalErrors());
}

// ============================================
// TEST: Error Filtering by Category
// ============================================
void test_error_tracker_filter_by_category() {
  errorTracker.clearErrors();
  
  errorTracker.logHardwareError(1, "HW1");
  errorTracker.logHardwareError(2, "HW2");
  errorTracker.logServiceError(1, "SVC1");
  
  String hw_errors = errorTracker.getErrorsByCategory(ERROR_HARDWARE, 10);
  TEST_ASSERT_TRUE(hw_errors.indexOf("HW1") > 0);
  TEST_ASSERT_TRUE(hw_errors.indexOf("HW2") > 0);
  TEST_ASSERT_TRUE(hw_errors.indexOf("SVC1") < 0);  // Service error should not appear
}

// ============================================
// UNITY SETUP
// ============================================
void setup() {
  delay(2000);
  
  Serial.begin(115200);
  
  // Initialize dependencies
  logger.begin();
  logger.setLogLevel(LOG_INFO);
  errorTracker.begin();
  
  UNITY_BEGIN();
  
  RUN_TEST(test_error_tracker_initialization);
  RUN_TEST(test_error_tracker_add_error);
  RUN_TEST(test_error_tracker_categories);
  RUN_TEST(test_error_tracker_circular_buffer);
  RUN_TEST(test_error_tracker_occurrence_count);
  RUN_TEST(test_error_tracker_get_history);
  RUN_TEST(test_error_tracker_critical_errors);
  RUN_TEST(test_error_tracker_filter_by_category);
  
  UNITY_END();
}

void loop() {}


