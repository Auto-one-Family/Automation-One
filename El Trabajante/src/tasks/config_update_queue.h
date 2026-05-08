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
// Memory: CONFIG_UPDATE_QUEUE_SIZE * sizeof(ConfigUpdateRequest) heap (see init log).
// CP-F4: ingress rejects len >= CONFIG_PAYLOAD_MAX_LEN (null-terminated copy uses MAX-1 chars).
// Large payloads persist to cfg_pending via putBytes when NVS string limit (~4000 B) exceeded.
// Timeout: 100 ms on enqueue — blocks Core 0 event handler briefly rather
//          than silently dropping a config push.
// ============================================

// Queue depth tuned for heap headroom on ESP32 (no PSRAM):
// PKG-17 (AUT-68): depth 1 — parallel config-writes are race-unsafe; cfg_pending NVS ring replays.
// AUT-285 (M3): depth 2 — Zone/Subzone handlers now also queue here alongside CONFIG_PUSH.
// Memory: 2 * sizeof(ConfigUpdateRequest) = 2 * 4352 B = ~8.7 KB heap (acceptable).
static const uint8_t  CONFIG_UPDATE_QUEUE_SIZE = 2;
// Full-state config from server commonly 4–5 KB; headroom for growth without blowing dram0 BSS.
// (6144+12288 static pushed esp32dev over dram0_0_seg — keep doc/payload balanced.)
static const uint16_t CONFIG_PAYLOAD_MAX_LEN   = 4352;  // >4.1 KB field configs (CP-F4) without oversizing BSS
// CP-F2: Central single-parse doc (BSS). Tuned to fit dram0 with esp32dev heap layout.
static const uint16_t CONFIG_JSON_DOC_SIZE     = 7680;

struct ConfigUpdateRequest {
    // CONFIG_PUSH: one queue slot per MQTT config-topic message.
    // Zone/Subzone types (AUT-285 M3): GPIO-touching MQTT handlers queued here
    // so they execute on Core 1 Safety-Task instead of Core 0 MQTT callback.
    // No TTL/epoch check for Zone/Subzone types — they carry no IntentMetadata generation.
    enum Type : uint8_t {
        CONFIG_PUSH,     // Full config push — sensors + actuators + offline rules
        ZONE_ASSIGN,     // Zone Assignment/Removal (gpioManager, configManager, g_kaiser)
        SUBZONE_ASSIGN,  // Subzone Assignment (gpioManager.assignPinToSubzone)
        SUBZONE_REMOVE,  // Subzone Removal (gpioManager.removePinFromSubzone)
        SUBZONE_SAFE     // Subzone Safe-Mode toggle (gpioManager enable/disable)
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

// AUT-285 M3: Enqueue a GPIO-touching Zone/Subzone request from Core 0 MQTT callback to Core 1.
// Uses a module-level static ConfigUpdateRequest (BSS in config_update_queue.cpp, not main.cpp).
// Returns true if enqueued, false if queue full (caller should publish busy-ACK).
// busy_ack_topic is logged on queue-full for diagnostics.
bool enqueueM3GpioRequest(ConfigUpdateRequest::Type type, const char* json_payload,
                           const char* busy_ack_desc);
