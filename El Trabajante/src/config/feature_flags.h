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

// ============================================
// CORE-QUEUE SAFETY CONTRACT (R0-R4)
// ============================================
// Keep these flags enabled for the hardened queue/safety contract.
// Rollback path: disable the highest enabled phase first.
#define ENABLE_INTENT_OUTCOME_CONTRACT
#define ENABLE_COMMAND_ADMISSION_NACK
#define ENABLE_CRITICAL_PUBLISH_LANE
#define ENABLE_EMERGENCY_EPOCH_BARRIER
#define ENABLE_CONFIG_PENDING_REPLAY
#define ENABLE_LEGACY_FALLBACK_DEGRADE

#endif
