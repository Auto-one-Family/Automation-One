#include "config_update_queue.h"
#include <cstring>
#include <Arduino.h>
#include "../utils/logger.h"

// ─── Forward declarations — defined in main.cpp ──────────────────────────────
// Config handlers parse the full-state JSON and delegate to the respective
// manager (sensorManager.configureSensor, actuatorManager.handleActuatorConfig,
// offlineModeManager.loadOfflineRulesFromPayload).
extern void handleSensorConfig(const String& payload);
extern void handleActuatorConfig(const String& payload);
extern void handleOfflineRulesConfig(const String& payload);

static const char* CFG_Q_TAG = "SYNC";

QueueHandle_t g_config_update_queue = NULL;

void initConfigUpdateQueue() {
    g_config_update_queue = xQueueCreate(CONFIG_UPDATE_QUEUE_SIZE,
                                          sizeof(ConfigUpdateRequest));
    if (g_config_update_queue == NULL) {
        LOG_E(CFG_Q_TAG, "[SYNC] Failed to create config update queue");
    } else {
        LOG_I(CFG_Q_TAG, "[SYNC] Config update queue created (depth="
              + String(CONFIG_UPDATE_QUEUE_SIZE) + ", item="
              + String(sizeof(ConfigUpdateRequest)) + " B)");
    }
}

bool queueConfigUpdate(ConfigUpdateRequest::Type type, const char* json_payload) {
    if (g_config_update_queue == NULL) return false;

    ConfigUpdateRequest req;
    req.type = type;
    strncpy(req.json_payload, json_payload, sizeof(req.json_payload) - 1);
    req.json_payload[sizeof(req.json_payload) - 1] = '\0';

    BaseType_t result = xQueueSend(g_config_update_queue, &req, pdMS_TO_TICKS(100));
    if (result != pdTRUE) {
        LOG_W(CFG_Q_TAG, "[SYNC] Config update queue full — config push dropped");
        return false;
    }
    LOG_D(CFG_Q_TAG, "[SYNC] Config update enqueued (type=" + String((uint8_t)type) + ")");
    return true;
}

void processConfigUpdateQueue() {
    if (g_config_update_queue == NULL) return;

    ConfigUpdateRequest req;
    while (xQueueReceive(g_config_update_queue, &req, 0) == pdTRUE) {
        const String payload(req.json_payload);
        LOG_I(CFG_Q_TAG, "[SYNC] Processing config update on Core " + String(xPortGetCoreID()));

        // All three handlers inspect the same JSON payload for their respective section.
        // The server full-state push always includes sensors, actuators and offline rules.
        handleSensorConfig(payload);
        handleActuatorConfig(payload);
        handleOfflineRulesConfig(payload);
    }
}
