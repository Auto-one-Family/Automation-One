#ifndef CONFIG_FEATURE_FLAGS_H
#define CONFIG_FEATURE_FLAGS_H

// ============================================
// FEATURE FLAGS
// ============================================
// Enable/Disable optional features at compile-time

// ============================================
// MQTT AGENT DEBUG LOGS
// ============================================
// Enables detailed JSON debug output via Serial.println() in mqtt_client.cpp
// Each debug log is a single snprintf()+println() call — safe for ser2net/Promtail
// Output format: [DEBUG]{...json...}\n (one complete JSON object per line)
// DEFAULT: Disabled (production)
// #define ENABLE_AGENT_DEBUG_LOGS

#endif
