#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>

#include "intent_contract.h"

// ============================================
// SAFETY-RTOS M4: Config-Update Queue (Core 0 → Core 1)
// ============================================
// Config-Push arrives via MQTT event handler on Core 0.
// Direct calls to handleSensorConfig / handleActuatorConfig from Core 0
// create race conditions against performAllMeasurements / processActuatorLoops
// on Core 1 (sensors_[] and actuators_[] written from Core 0, read from Core 1).
//
// Solution: Queue the raw JSON payload. Core 0 enqueues (queueConfigUpdate),
// Core 1 Safety-Task drains (processConfigUpdateQueue) after its own loop work.
//
// Memory: 5 * (1 + 4096) = ~20 KB heap — aligned to MQTT buffer_size=4096 (CP-F4).
// Timeout: 100 ms on enqueue — blocks Core 0 event handler briefly rather
//          than silently dropping a config push.
// ============================================

static const uint8_t  CONFIG_UPDATE_QUEUE_SIZE = 5;
static const uint16_t CONFIG_PAYLOAD_MAX_LEN   = 4096;  // Full-state Config-Push JSON — matches MQTT buffer_size (CP-F4)
// CP-F2: Central single-parse doc size — allocated in BSS (module-level static in
// config_update_queue.cpp, no heap/stack pressure). ArduinoJson overhead ~3x JSON
// string length; payload ~1400 B * 3 = 4200 B -> 6144 B for growth headroom.
static const uint16_t CONFIG_JSON_DOC_SIZE     = 6144;

struct ConfigUpdateRequest {
    // Single CONFIG_PUSH type: one queue slot per MQTT config-topic message.
    // processConfigUpdateQueue calls all three handlers (sensor/actuator/offline_rules)
    // since the server always sends a full-state JSON covering all three sections.
    enum Type : uint8_t {
        CONFIG_PUSH  // Full config push — sensors + actuators + offline rules
    } type;
    char json_payload[CONFIG_PAYLOAD_MAX_LEN];
    IntentMetadata metadata;
};

extern QueueHandle_t g_config_update_queue;

// Create the queue — call in setup() BEFORE createSafetyTask().
void initConfigUpdateQueue();

// Enqueue a config update from Core 0 (MQTT event handler).
// Blocks up to 100 ms if queue is full (avoids silent config drop on burst).
// Returns true if enqueued, false on timeout.
bool queueConfigUpdate(ConfigUpdateRequest::Type type, const char* json_payload);
bool queueConfigUpdateWithMetadata(ConfigUpdateRequest::Type type,
                                   const char* json_payload,
                                   const IntentMetadata* metadata);

// Drain queue and apply all pending configs — call from Safety-Task (Core 1) each loop.
void processConfigUpdateQueue(uint8_t max_items = 2);
