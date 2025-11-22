# Error Recovery Flow

## Overview

Comprehensive error tracking, circuit breaker patterns, automatic reconnection, and safe-mode triggering to ensure system reliability and hardware safety even under failure conditions.

## Files Analyzed

- `src/error_handling/error_tracker.cpp` - Error tracking implementation
- `src/error_handling/error_tracker.h` (lines 1-102) - Error tracker interface
- `src/error_handling/circuit_breaker.cpp` - Circuit breaker pattern
- `src/error_handling/circuit_breaker.h` - Circuit breaker interface
- `src/services/actuator/safety_controller.cpp` - Emergency stop and recovery
- `src/services/actuator/safety_controller.h` (lines 1-51) - Safety controller
- `src/services/communication/wifi_manager.cpp` - WiFi reconnection
- `src/services/communication/mqtt_client.cpp` - MQTT reconnection
- `src/drivers/gpio_manager.cpp` - Safe-mode triggering

## Error Categories

**File:** `src/error_handling/error_tracker.h` (lines 9-14)

```cpp
enum ErrorCategory {
  ERROR_HARDWARE = 1000,       // GPIO, I2C, PWM (1000-1999)
  ERROR_SERVICE = 2000,        // Sensor, Actuator, Config (2000-2999)
  ERROR_COMMUNICATION = 3000,  // MQTT, HTTP, WiFi (3000-3999)
  ERROR_APPLICATION = 4000     // State, Memory, System (4000-4999)
};
```

**Severity Levels:**

```cpp
enum ErrorSeverity {
  ERROR_SEVERITY_WARNING = 1,  // Recoverable warning
  ERROR_SEVERITY_ERROR = 2,    // Error but system can continue
  ERROR_SEVERITY_CRITICAL = 3  // Critical error, system unstable
};
```

---

## Flow 1: Error Tracking

### Error Structure

```cpp
struct ErrorEntry {
  unsigned long timestamp;
  uint16_t error_code;
  ErrorSeverity severity;
  char message[128];
  uint8_t occurrence_count;  // Duplicate tracking
};
```

### Tracking Error

```cpp
void ErrorTracker::trackError(uint16_t error_code, 
                              ErrorSeverity severity, 
                              const char* message) {
  // Log to console
  logErrorToLogger(error_code, severity, message);
  
  // Check for duplicate (same error within 1 second)
  for (size_t i = 0; i < error_count_; i++) {
    size_t index = (error_buffer_index_ + MAX_ERROR_ENTRIES - 1 - i) % MAX_ERROR_ENTRIES;
    ErrorEntry& entry = error_buffer_[index];
    
    if (entry.error_code == error_code && 
        (millis() - entry.timestamp) < 1000) {
      // Duplicate error - increment counter
      entry.occurrence_count++;
      return;
    }
  }
  
  // Add new error to circular buffer
  addToBuffer(error_code, severity, message);
}
```

**Features:**
- Circular buffer (50 entries)
- Duplicate detection (1s window)
- Occurrence counting
- Automatic log integration

**Usage:**

```cpp
errorTracker.trackError(ERROR_SENSOR_READ_FAILED, 
                       ERROR_SEVERITY_ERROR,
                       "DS18B20 read timeout");
```

---

## Flow 2: Circuit Breaker Pattern

### Purpose

Prevent connection storms that could:
- Crash ESP32 (stack overflow)
- Overload MQTT broker
- Drain battery on reconnection attempts

### Circuit Breaker States

```
CLOSED → (failures) → OPEN → (timeout) → HALF_OPEN → (test) → CLOSED or OPEN
```

**CLOSED:** Normal operation, requests pass through

**OPEN:** Too many failures, block all requests for timeout period

**HALF_OPEN:** Test mode, allow one request to test recovery

### Implementation

**File:** `src/error_handling/circuit_breaker.cpp`

```cpp
class CircuitBreaker {
public:
  CircuitBreaker(const char* name, 
                 uint16_t failure_threshold,
                 unsigned long open_timeout_ms,
                 unsigned long half_open_timeout_ms);
  
  bool allowRequest();           // Check if request allowed
  void recordSuccess();          // Record successful operation
  void recordFailure();          // Record failed operation
  void reset();                  // Force reset to CLOSED
  
  CircuitBreakerState getState() const;
  uint16_t getFailureCount() const;
  
private:
  const char* name_;
  CircuitBreakerState state_;
  uint16_t failure_count_;
  uint16_t failure_threshold_;
  unsigned long open_timeout_ms_;
  unsigned long half_open_timeout_ms_;
  unsigned long last_failure_time_;
  unsigned long last_attempt_time_;
};
```

### WiFi Circuit Breaker

**Configuration:**

```cpp
CircuitBreaker wifi_breaker("WiFi", 10, 60000, 10000);
// 10 failures → OPEN
// 60s recovery timeout
// 10s half-open test
```

**Usage in WiFi reconnection:**

```cpp
void WiFiManager::reconnect() {
  if (!circuit_breaker_.allowRequest()) {
    LOG_WARNING("WiFi: Circuit breaker OPEN, skipping reconnect");
    return;
  }
  
  if (connectToNetwork()) {
    circuit_breaker_.recordSuccess();
  } else {
    circuit_breaker_.recordFailure();
  }
}
```

### MQTT Circuit Breaker

**Configuration:**

```cpp
CircuitBreaker mqtt_breaker("MQTT", 5, 30000, 10000);
// 5 failures → OPEN
// 30s recovery timeout
// 10s half-open test
```

---

## Flow 3: WiFi Reconnection

### Automatic Reconnection

**File:** `src/main.cpp` (line 639)

```cpp
void loop() {
  wifiManager.loop();  // Check and reconnect if needed
  // ...
}
```

**File:** `src/services/communication/wifi_manager.cpp`

```cpp
void WiFiManager::loop() {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();
    
    // Check if enough time passed since last attempt
    if (now - last_reconnect_attempt_ > 5000) {  // 5s between attempts
      reconnect();
      last_reconnect_attempt_ = now;
    }
  }
}

void WiFiManager::reconnect() {
  // Circuit breaker check
  if (!circuit_breaker_.allowRequest()) {
    return;
  }
  
  LOG_INFO("WiFi: Attempting reconnection...");
  
  WiFi.disconnect();
  delay(100);
  
  WiFi.begin(current_config_.ssid.c_str(), 
             current_config_.password.c_str());
  
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    LOG_INFO("WiFi: Reconnected successfully");
    circuit_breaker_.recordSuccess();
    reconnect_attempts_ = 0;
  } else {
    LOG_ERROR("WiFi: Reconnection failed");
    circuit_breaker_.recordFailure();
    reconnect_attempts_++;
    
    errorTracker.trackError(ERROR_WIFI_CONNECT_FAILED,
                           ERROR_SEVERITY_ERROR,
                           "WiFi reconnection failed");
  }
}
```

**Timing:**
- Retry interval: 5 seconds
- Connection timeout: 10 seconds
- Circuit breaker: After 10 failures → 60s pause

---

## Flow 4: MQTT Reconnection

### Automatic Reconnection

**File:** `src/services/communication/mqtt_client.cpp`

```cpp
void MQTTClient::loop() {
  if (!mqtt_.connected()) {
    unsigned long now = millis();
    
    if (shouldAttemptReconnect() && 
        now - last_reconnect_attempt_ > calculateBackoffDelay()) {
      reconnect();
      last_reconnect_attempt_ = now;
    }
  }
  
  mqtt_.loop();  // Process messages
  
  // Heartbeat
  if (millis() - last_heartbeat_ > HEARTBEAT_INTERVAL_MS) {
    publishHeartbeat();
    last_heartbeat_ = millis();
  }
  
  // Process offline buffer if connected
  if (mqtt_.connected()) {
    processOfflineBuffer();
  }
}

void MQTTClient::reconnect() {
  if (!circuit_breaker_.allowRequest()) {
    LOG_WARNING("MQTT: Circuit breaker OPEN");
    return;
  }
  
  LOG_INFO("MQTT: Attempting reconnection...");
  
  if (connectToBroker()) {
    LOG_INFO("MQTT: Reconnected successfully");
    circuit_breaker_.recordSuccess();
    reconnect_attempts_ = 0;
    reconnect_delay_ms_ = RECONNECT_BASE_DELAY_MS;
    
    // Resubscribe to topics
    resubscribeAll();
    
    // Process offline messages
    processOfflineBuffer();
  } else {
    LOG_ERROR("MQTT: Reconnection failed");
    circuit_breaker_.recordFailure();
    reconnect_attempts_++;
    
    errorTracker.trackError(ERROR_MQTT_CONNECT_FAILED,
                           ERROR_SEVERITY_ERROR,
                           "MQTT reconnection failed");
  }
}
```

### Exponential Backoff

```cpp
unsigned long MQTTClient::calculateBackoffDelay() const {
  // Start: 1s, double each failure, max 60s
  unsigned long delay = RECONNECT_BASE_DELAY_MS * (1 << reconnect_attempts_);
  if (delay > RECONNECT_MAX_DELAY_MS) {
    delay = RECONNECT_MAX_DELAY_MS;
  }
  return delay;
}
```

**Backoff Sequence:**
- Attempt 1: 1s
- Attempt 2: 2s
- Attempt 3: 4s
- Attempt 4: 8s
- Attempt 5: 16s
- Attempt 6+: 60s

### Offline Message Buffer

```cpp
bool MQTTClient::publish(const String& topic, const String& payload, uint8_t qos) {
  if (!mqtt_.connected()) {
    LOG_WARNING("MQTT: Not connected, buffering message");
    addToOfflineBuffer(topic, payload, qos);
    return false;
  }
  
  return mqtt_.publish(topic.c_str(), payload.c_str(), qos == 1);
}

void MQTTClient::processOfflineBuffer() {
  if (!mqtt_.connected() || offline_buffer_count_ == 0) {
    return;
  }
  
  LOG_INFO("MQTT: Processing " + String(offline_buffer_count_) + " offline messages");
  
  uint16_t processed = 0;
  for (uint16_t i = 0; i < offline_buffer_count_; i++) {
    MQTTMessage& msg = offline_buffer_[i];
    
    if (mqtt_.publish(msg.topic.c_str(), msg.payload.c_str(), msg.qos == 1)) {
      processed++;
    } else {
      LOG_ERROR("MQTT: Failed to send buffered message");
      break;  // Stop on first failure
    }
  }
  
  offline_buffer_count_ -= processed;
  LOG_INFO("MQTT: Sent " + String(processed) + " buffered messages");
}
```

**Buffer Capacity:** 100 messages

---

## Flow 5: Emergency Stop and Recovery

### Emergency Stop Trigger

**Sources:**
1. ESP-specific MQTT command
2. Broadcast MQTT emergency
3. SafetyController manual trigger
4. Runtime protection (max runtime exceeded)

**File:** `src/services/actuator/safety_controller.cpp`

```cpp
bool SafetyController::emergencyStopAll(const String& reason) {
  if (emergency_state_ == EmergencyState::EMERGENCY_ACTIVE) {
    LOG_WARNING("Emergency stop already active");
    return true;
  }
  
  LOG_CRITICAL("EMERGENCY STOP: " + reason);
  
  emergency_state_ = EmergencyState::EMERGENCY_ACTIVE;
  emergency_reason_ = reason;
  emergency_timestamp_ = millis();
  
  // Stop all actuators via ActuatorManager
  actuatorManager.emergencyStopAll();
  
  // Log event
  logEmergencyEvent(reason, 0);
  
  // Publish alert
  String alert_topic = TopicBuilder::buildActuatorEmergencyTopic();
  String alert_payload = "{\"status\":\"emergency_active\",\"reason\":\"" + 
                         reason + "\",\"timestamp\":" + String(millis()) + "}";
  mqttClient.publish(alert_topic + "/status", alert_payload);
  
  return true;
}
```

### Emergency Recovery

```cpp
bool SafetyController::clearEmergencyStop() {
  if (emergency_state_ != EmergencyState::EMERGENCY_ACTIVE) {
    LOG_WARNING("No active emergency stop to clear");
    return false;
  }
  
  LOG_INFO("Clearing emergency stop");
  
  emergency_state_ = EmergencyState::EMERGENCY_CLEARING;
  
  // Verify system safety
  if (!verifySystemSafety()) {
    LOG_ERROR("System safety verification failed");
    emergency_state_ = EmergencyState::EMERGENCY_ACTIVE;
    return false;
  }
  
  // Clear emergency flags on actuators
  actuatorManager.clearEmergencyStop();
  
  emergency_state_ = EmergencyState::EMERGENCY_NORMAL;
  LOG_INFO("Emergency stop cleared");
  
  return true;
}

bool SafetyController::resumeOperation() {
  if (emergency_state_ != EmergencyState::EMERGENCY_NORMAL) {
    LOG_ERROR("Cannot resume - emergency still active");
    return false;
  }
  
  LOG_INFO("Resuming normal operation");
  
  emergency_state_ = EmergencyState::EMERGENCY_RESUMING;
  
  // Gradual actuator restart
  uint8_t restarted = 0;
  
  // Critical actuators first
  if (recovery_config_.critical_first) {
    for (uint8_t i = 0; i < actuatorManager.getActiveActuatorCount(); i++) {
      ActuatorConfig config = actuatorManager.getActuatorConfig(i);
      if (config.critical) {
        // Restore default state
        actuatorManager.controlActuatorBinary(config.gpio, config.default_state);
        delay(recovery_config_.inter_actuator_delay_ms);
        restarted++;
      }
    }
  }
  
  // Non-critical actuators
  for (uint8_t i = 0; i < actuatorManager.getActiveActuatorCount(); i++) {
    ActuatorConfig config = actuatorManager.getActuatorConfig(i);
    if (!config.critical) {
      actuatorManager.controlActuatorBinary(config.gpio, config.default_state);
      delay(recovery_config_.inter_actuator_delay_ms);
      restarted++;
    }
  }
  
  emergency_state_ = EmergencyState::EMERGENCY_NORMAL;
  LOG_INFO("Resumed " + String(restarted) + " actuators");
  
  return true;
}
```

**Recovery Configuration:**

```cpp
struct RecoveryConfig {
  uint32_t inter_actuator_delay_ms = 2000;  // 2s between actuators
  bool critical_first = true;                // Critical actuators first
  uint32_t verification_timeout_ms = 5000;   // 5s verification
  uint8_t max_retry_attempts = 3;            // 3 retry attempts
};
```

---

## Flow 6: Safe-Mode Triggering

### Hardware Safe-Mode

**File:** `src/drivers/gpio_manager.cpp`

```cpp
void GPIOManager::enableSafeModeForAllPins() {
  LOG_CRITICAL("GPIOManager: Emergency safe-mode activated");
  
  uint8_t de_energized_count = 0;
  
  for (auto& pin_info : pins_) {
    // De-energize outputs BEFORE mode change
    if (pin_info.mode == OUTPUT) {
      digitalWrite(pin_info.pin, LOW);  // Turn off actuator
      de_energized_count++;
      delayMicroseconds(10);
    }
    
    // Change to safe mode
    pinMode(pin_info.pin, INPUT_PULLUP);
    
    // Update tracking
    pin_info.in_safe_mode = true;
    pin_info.owner[0] = '\0';
    pin_info.mode = INPUT_PULLUP;
  }
  
  LOG_INFO("Emergency: " + String(de_energized_count) + " outputs de-energized");
}
```

**Triggered by:**
- Critical hardware error
- Watchdog reset
- Manual command
- Safety Controller

---

## Error Statistics

### Retrieving Error History

```cpp
String ErrorTracker::getErrorHistory(uint8_t max_entries) const {
  String result = "";
  
  size_t start_index = (error_count_ < MAX_ERROR_ENTRIES) ? 0 : error_buffer_index_;
  
  for (size_t i = 0; i < error_count_ && i < max_entries; i++) {
    size_t index = (start_index + i) % MAX_ERROR_ENTRIES;
    const ErrorEntry& entry = error_buffer_[index];
    
    result += "[" + String(entry.timestamp) + "] ";
    result += "[" + getCategoryString(entry.error_code) + "] ";
    result += "[" + String(entry.occurrence_count) + "x] ";
    result += String(entry.message) + "\n";
  }
  
  return result;
}
```

**Example Output:**

```
[1234567] [HARDWARE] [1x] I2C bus initialization failed
[1234890] [COMMUNICATION] [5x] MQTT connection timeout
[1235123] [SERVICE] [1x] Sensor read failed GPIO 4
```

---

## Health Monitoring

**File:** `src/main.cpp` (lines 656-666)

```cpp
// System health monitoring (every 5 minutes)
static unsigned long last_health_check = 0;
if (millis() - last_health_check >= 300000) {
  last_health_check = millis();
  
  LOG_INFO("=== System Health Check ===");
  LOG_INFO("WiFi Status: " + wifiManager.getConnectionStatus());
  LOG_INFO("MQTT Status: " + mqttClient.getConnectionStatus());
  LOG_INFO("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_INFO("Uptime: " + String(millis() / 1000) + " seconds");
  LOG_INFO("Error Count: " + String(errorTracker.getErrorCount()));
  LOG_INFO("==========================");
}
```

**Metrics Tracked:**
- WiFi connection status
- MQTT connection status
- Free heap memory
- Uptime
- Error count

---

## Performance Impact

| Mechanism | CPU | Memory | Notes |
|-----------|-----|--------|-------|
| Error tracking | <1% | 6.5KB | Circular buffer |
| Circuit breaker | <0.1% | 100 bytes | Per breaker |
| WiFi reconnect | 2-5% | Minimal | Only when disconnected |
| MQTT reconnect | 2-5% | 25KB | Offline buffer |
| Health monitoring | <0.1% | Minimal | Every 5 min |

**Total Overhead:** <5% CPU, ~32KB memory

---

## Next Flows

→ [Actuator Command Flow](03-actuator-command-flow.md) - Emergency stop integration  
→ [MQTT Message Routing](06-mqtt-message-routing-flow.md) - Emergency stop messages  

---

**End of Error Recovery Flow Documentation**

