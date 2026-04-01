#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

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
// Memory: 5 * (1 + 2048) = ~10 KB heap — config pushes are rare events.
// Timeout: 100 ms on enqueue — blocks Core 0 event handler briefly rather
//          than silently dropping a config push.
// ============================================

static const uint8_t  CONFIG_UPDATE_QUEUE_SIZE = 5;
static const uint16_t CONFIG_PAYLOAD_MAX_LEN   = 2048;  // Full-state Config-Push JSON

struct ConfigUpdateRequest {
    // Single CONFIG_PUSH type: one queue slot per MQTT config-topic message.
    // processConfigUpdateQueue calls all three handlers (sensor/actuator/offline_rules)
    // since the server always sends a full-state JSON covering all three sections.
    enum Type : uint8_t {
        CONFIG_PUSH  // Full config push — sensors + actuators + offline rules
    } type;
    char json_payload[CONFIG_PAYLOAD_MAX_LEN];
};

extern QueueHandle_t g_config_update_queue;

// Create the queue — call in setup() BEFORE createSafetyTask().
void initConfigUpdateQueue();

// Enqueue a config update from Core 0 (MQTT event handler).
// Blocks up to 100 ms if queue is full (avoids silent config drop on burst).
// Returns true if enqueued, false on timeout.
bool queueConfigUpdate(ConfigUpdateRequest::Type type, const char* json_payload);

// Drain queue and apply all pending configs — call from Safety-Task (Core 1) each loop.
void processConfigUpdateQueue();
